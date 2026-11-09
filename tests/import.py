#!/usr/bin/env python3
"""umlimator.py import (#90) end to end. Each sample in tests/import/, one per format (Mermaid has two: a flowchart and a
C4 diagram), becomes a model that the module's validate() passes, that renders, and whose layout check is clean; it has
the cards, boxes, lines and views its source says; and what the sample holds that import does not read is listed on
stderr with its line (in JSON, its path).

  python3 tests/import.py

Needs Node (validate() is the module's, run as `diff` runs diff()) and Google Chrome or Chromium (render and check).
"""
import importlib.util, json, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "tests" / "import"
spec = importlib.util.spec_from_file_location("umlimator", ROOT / "umlimator.py")
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)
failed = False


def ok(name, cond, info=""):
    global failed
    print(("ok  " if cond else "FAIL"), "umlimator.py import", name, "" if cond else info)
    failed |= not cond


def run(*args):
    return subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *args], capture_output=True, text=True)


def line(m, a, b, view=None):
    """The model's line from a to b, if the view (or, with no view, the model) draws one."""
    v = next((v for v in m["views"] if v["id"] == view), {})
    return next((e for e in m["edges"] if e["from"] == a and e["to"] == b and (view is None or "edges" not in v or e["id"] in v["edges"])), None)


box = lambda m, view, bid: next((c for v in m["views"] if v["id"] == view for c in v.get("containers", []) if c["id"] == bid), {})
card = lambda m, cid: next((n for n in m["nodes"] if n["id"] == cid), {})

# per sample: its format, the views, what stderr names (file:where), and what the model says
EXPECT = {
    "clinic.dsl": ("structurizr", ["context", "containers", "api-components"], [":45:", ":65:", ":73:"], lambda m: [
        ("views nest as the source's levels", [v.get("parent") for v in m["views"]] == [None, "context", "containers"]),
        ("a relationship to a container lifts to its system in the context view (an implied line)", line(m, "patient", "bookings", "context")),
        ("the container view boxes the system's containers", box(m, "containers", "bookings").get("nodeIds") == ["web", "desk", "api", "db", "jobs", "sender"]),
        ("the system opens its container view, the container its component view",
         (card(m, "bookings").get("opensView"), card(m, "api").get("opensView")) == ("containers", "api-components")),
        ("kinds: people, tags (Database, Queue, External), technology",
         [card(m, i)["kind"] for i in ("patient", "db", "jobs", "sms", "web", "sender")] == ["frontend", "database", "queue", "external", "frontend", "backend"]),
        ("a line to a person is the view's loop back", (line(m, "sms", "patient") or {}).get("loop") is True),
        ("description and technology are the label and the second line",
         {k: (line(m, "store", "db") or {}).get(k) for k in ("label", "sublabel")} == {"label": "Reads and writes", "sublabel": "SQL"})]),
    "parcels.puml": ("plantuml", ["components"], [":37:"], lambda m: [
        ("boundaries are boxes, nested", box(m, "components", "api") == {"id": "api", "label": "Tracking API", "nodeIds": ["routes", "tracker"], "parent": "tracking"}),
        ("Rel_Back points the other way", line(m, "scans", "tracker") and not line(m, "tracker", "scans") or False),
        ("BiRel is a line each way", line(m, "tracker", "db") and line(m, "db", "tracker") or False),
        ("kinds: Db, Queue, _Ext, Person, technology",
         [card(m, i)["kind"] for i in ("billing", "scans", "courier", "maps", "shipper", "web")] == ["database", "queue", "external", "external", "frontend", "frontend"])]),
    "checkout.mmd": ("mermaid", ["flowchart"], [], lambda m: [
        ("the front matter's title", m["title"] == "Checkout, as the payments team drew it"),
        ("subgraphs are boxes of the nodes first named in them", [box(m, "flowchart", b).get("nodeIds") for b in ("core", "after")] == [["api", "orders"], ["mailer", "stock"]]),
        ("a cylinder is a database", card(m, "orders")["kind"] == "database"),
        ("labels, dotted (async) and thick (heavier) links, and a & b",
         [(line(m, *p) or {}).get(k) for p, k in ((("web", "api"), "label"), (("api", "bus"), "style"), (("api", "psp"), "weight"))] == ["POST /orders", "async", 2]
         and line(m, "bus", "mailer") and line(m, "bus", "stock") or False)]),
    "meals.mmd": ("mermaid", ["context"], [], lambda m: [
        ("Mermaid's C4 boundary is a box", box(m, "context", "company").get("nodeIds") == ["planner", "recipes"]),
        ("kinds: Person_Ext, SystemDb, SystemQueue_Ext", [card(m, i)["kind"] for i in ("guest", "recipes", "mail")] == ["external", "database", "queue"])]),
    "compose.json": ("compose", ["services"], [":volumes:"], lambda m: [
        ("networks are boxes; a service on both stays between them",
         [box(m, "services", b).get("nodeIds") for b in ("network-edge", "network-data")] == [["proxy", "web"], ["cache", "db", "mailer", "queue", "worker"]]),
        ("depends_on and links are lines, one per pair", len([e for e in m["edges"] if (e["from"], e["to"]) == ("worker", "mailer")]) == 1 and line(m, "proxy", "api")),
        ("kinds from images", [card(m, i)["kind"] for i in ("db", "queue", "proxy", "api")] == ["database", "queue", "cloud", "backend"])]),
    "kubernetes.json": ("kubernetes", ["cluster"], [":items[7]:", ":items[8]:"], lambda m: [
        ("a Service leads to the workloads it selects; an Ingress to its Services, by path",
         line(m, "svc-web", "deploy-web") and (line(m, "ing-tea", "svc-web") or {}).get("label") == "/" or False),
        ("an env value that names a Service is a line, across namespaces too",
         [(line(m, *p) or {}).get("label") for p in (("deploy-web", "svc-api"), ("deploy-api", "svc-postgres"))] == ["API_URL", "DATABASE_URL"]),
        ("namespaces are boxes", [box(m, "cluster", b).get("nodeIds") for b in ("namespace-data", "namespace-shop")]
         == [["sts-postgres", "svc-postgres"], ["deploy-web", "deploy-api", "svc-web", "svc-api", "ing-tea"]])]),
}

# the readers on their own, on what the samples don't show (no browser needed)
spec = importlib.util.spec_from_file_location("umlimator_import", ROOT / "umlimator_import.py")
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)
ends = lambda m: [(e["from"], e["to"], e.get("label")) for e in m["edges"]]
m, un = imp.read("mermaid", "graph TD\n  a -- calls --> b\n  b <--> c\n  a ~~~ c\n  end\n  d@{ shape: cyl }\n", "x")
ok("mermaid · text and two-way links, an invisible link left out, and what isn't read, by line",
   ends(m) == [("a", "b", "calls"), ("b", "c", None), ("c", "b", None)] and [w for w, _ in un] == [5, 6], (ends(m), un))
m, un = imp.read("plantuml", '@startuml\nSystem(a, "A")\nSystem(a, "Again")\nContainer(b, "B", $techn="Go")\nRel(a, b, "Uses", $techn="gRPC")\n'
                 'Rel(a, nope, "Lost")\n@enduml\n', "x")
ok("C4 · named arguments, and a repeated alias and an unknown end reported",
   card(m, "b").get("sublabel") == "Go" and (line(m, "a", "b") or {}).get("sublabel") == "gRPC" and [w for w, _ in un] == [3, 6], (m, un))
dsl = 'workspace "Shop" {\n  model {\n    u = person "User"\n    s = softwareSystem "Shop" {\n      w = container "Web"\n    }\n    u -> w "Uses"\n  }\n}\n'
m, un = imp.read("structurizr", dsl, "x")
ok("structurizr · no views: a landscape and a view per system, the line implied where its end is inside",
   [(v["id"], v.get("parent"), v["edges"]) for v in m["views"]] == [("landscape", None, ["u-s"]), ("s-containers", "landscape", ["u-w"])], m["views"])
m, un = imp.read("structurizr", dsl.replace("model {", "!impliedRelationships false\n  model {"), "x")
ok("structurizr · !impliedRelationships false draws no implied line", m["views"][0]["edges"] == [], m["views"])
ok("knows each format by its content", [imp.detect("x", t) for t in ("/* a */\nworkspace {", "@startuml", "flowchart LR", '{"services": {}}', '{"kind": "List", "items": []}')]
   == imp.FORMATS)

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    for name, (fmt, views, unread, facts) in EXPECT.items():
        out = t / (Path(name).stem + ".json")
        r = run("import", str(SAMPLES / name), "--out", str(out))
        said = json.loads(r.stdout) if r.returncode == 0 else {}
        m = json.loads(out.read_text(encoding="utf-8")) if out.is_file() else {"nodes": [], "edges": [], "views": []}
        ok(f"{name} · read as {fmt}, with views {views}", said.get("format") == fmt and said.get("views") == views, r.stdout + r.stderr)
        got = [l[len(str(SAMPLES / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
        ok(f"{name} · lists what it does not import, each with its line or path", got == unread, r.stderr)
        for what, cond in facts(m):
            ok(f"{name} · {what}", bool(cond))
        problems = u.js("validate", m)
        ok(f"{name} · validate() finds nothing", problems == [], problems)
        page = t / (Path(name).stem + ".html")
        r = run("render", str(out), "--out", str(page), "--no-check")
        c = run("check", str(page)) if r.returncode == 0 else r
        rep = json.loads(c.stdout[c.stdout.find("{"):]) if c.returncode == 0 and "{" in c.stdout else {}
        ok(f"{name} · renders, and its layout check is clean", rep.get("checked") and not rep.get("problems") and not rep.get("errors"), rep or c.stderr[-1500:])
    shutil.copy(SAMPLES / "clinic.dsl", t / "clinic.txt")
    r = run("import", str(t / "clinic.txt"), "--out", str(t / "txt.json"))
    ok("knows a format by its content, whatever the extension", r.returncode == 0 and json.loads(r.stdout).get("format") == "structurizr", r.stderr)
    r = run("import", str(SAMPLES / "compose.json"), "--format", "kubernetes", "--out", str(t / "k.json"))
    ok("--format decides, and a file with nothing to import is an error", r.returncode == 1 and "nothing to import" in r.stderr, r.stderr)
sys.exit(1 if failed else 0)
