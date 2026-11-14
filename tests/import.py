#!/usr/bin/env python3
"""umlimator.py import (#90) end to end. Each sample, one per format (Mermaid has two: a flowchart and a C4 diagram), in
tests/import/, and the Structurizr one as the gallery's examples/clinic.dsl, becomes a model that the module's validate()
passes, that renders, and whose layout check is clean; it has the cards, boxes, lines and views its source says; and
what the sample holds that import does not read is listed on stderr with its line (in JSON, its path).

  python3 tests/import.py

Needs Node (validate() is the module's, run as `diff` runs diff()) and Google Chrome or Chromium (render and check).
"""
import importlib.util, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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
    "examples/clinic.dsl": ("structurizr", ["context", "containers", "api-components"], [":47:", ":75:"], lambda m: [
        ("views nest as the source's levels", [v.get("parent") for v in m["views"]] == [None, "context", "containers"]),
        ("a relationship to a container lifts to its system in the context view (an implied line)", line(m, "patient", "bookings", "context")),
        ("the container view boxes the system's containers", box(m, "containers", "bookings").get("nodeIds") == ["web", "desk", "api", "db", "jobs", "sender"]),
        ("a group is a box in each view that shows its members, and in no other",
         [box(m, v, "clinic-staff") for v in ("context", "containers", "api-components")]
         == [{"id": "clinic-staff", "label": "Clinic staff", "nodeIds": ["reception"]}] * 2 + [{}]),
        ("the system opens its container view, the container its component view",
         (card(m, "bookings").get("opensView"), card(m, "api").get("opensView")) == ("containers", "api-components")),
        ("kinds: people, tags (Database, Queue, External), technology",
         [card(m, i)["kind"] for i in ("patient", "db", "jobs", "sms", "web", "sender")] == ["person", "database", "queue", "external", "frontend", "backend"]),
        ("no shapes field: maps draw in one style (0.21.0)", "shapes" not in m),
        ("its styles' shapes are the cards' (0.15.0)", [card(m, i).get("shape") for i in ("patient", "reception", "db", "web")] == ["person", "person", "cylinder", None]),
        ("a line to a person is the view's loop back", (line(m, "sms", "patient") or {}).get("loop") is True),
        ("description and technology are the label and the second line",
         {k: (line(m, "store", "db") or {}).get(k) for k in ("label", "sublabel")} == {"label": "Reads and writes", "sublabel": "SQL"})]),
    "tests/import/parcels.puml": ("plantuml", ["components"], [":37:"], lambda m: [
        ("boundaries are boxes, nested", box(m, "components", "api") == {"id": "api", "label": "Tracking API", "nodeIds": ["routes", "tracker"], "parent": "tracking"}),
        ("Rel_Back points the other way", line(m, "scans", "tracker") and not line(m, "tracker", "scans") or False),
        ("BiRel is a line each way", line(m, "tracker", "db") and line(m, "db", "tracker") or False),
        ("kinds: Db, Queue, _Ext, Person (person, and user outside), technology",
         [card(m, i)["kind"] for i in ("billing", "scans", "courier", "maps", "shipper", "web")] == ["database", "queue", "user", "external", "person", "frontend"]),
        ("no shapes field: maps draw in one style (0.21.0)", "shapes" not in m)]),
    "tests/import/checkout.mmd": ("mermaid", ["flowchart"], [], lambda m: [
        ("the front matter's title", m["title"] == "Checkout, as the payments team drew it"),
        ("subgraphs are boxes of the nodes first named in them", [box(m, "flowchart", b).get("nodeIds") for b in ("core", "after")] == [["api", "orders"], ["mailer", "stock"]]),
        ("a cylinder is a database", card(m, "orders")["kind"] == "database"),
        ("no shapes field (0.21.0)", "shapes" not in m),
        ("labels, dotted (async) and thick (heavier) links, and a & b",
         [(line(m, *p) or {}).get(k) for p, k in ((("web", "api"), "label"), (("api", "bus"), "style"), (("api", "psp"), "weight"))] == ["POST /orders", "async", 2]
         and line(m, "bus", "mailer") and line(m, "bus", "stock") or False)]),
    "tests/import/meals.mmd": ("mermaid", ["context"], [], lambda m: [
        ("Mermaid's C4 boundary is a box", box(m, "context", "company").get("nodeIds") == ["planner", "recipes"]),
        ("kinds: Person_Ext, SystemDb, SystemQueue_Ext", [card(m, i)["kind"] for i in ("guest", "recipes", "mail")] == ["user", "database", "queue"]),
        ("Mermaid's C4: no shapes field, maps draw in one style (0.21.0)", "shapes" not in m)]),
    "tests/import/compose.json": ("compose", ["services"], [":volumes:"], lambda m: [
        ("networks are boxes; a service on both stays between them",
         [box(m, "services", b).get("nodeIds") for b in ("network-edge", "network-data")] == [["proxy", "web"], ["cache", "db", "mailer", "queue", "worker"]]),
        ("depends_on and links are lines, one per pair", len([e for e in m["edges"] if (e["from"], e["to"]) == ("worker", "mailer")]) == 1 and line(m, "proxy", "api")),
        ("kinds from images", [card(m, i)["kind"] for i in ("db", "queue", "proxy", "api")] == ["database", "queue", "cloud", "backend"])]),
    "tests/import/kubernetes.json": ("kubernetes", ["cluster"], [":items[7]:", ":items[8]:"], lambda m: [
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
styled = ('workspace {\n model {\n  u = person "User"\n  s = softwareSystem "Shop" {\n   w = container "Web" "" "React" "Web Browser"\n'
          '   a = container "App" "" "Swift" "Mobile,Bucketed"\n   d = container "Data" "" "Postgres" "Database"\n  }\n }\n views {\n  styles {\n'
          + "".join(f'   element "{t}" {{\n    {p}\n   }}\n' for t, p in (("Database", "shape Cylinder"), ("Element", "shape RoundedBox"),
            ("Person", "shape Robot"), ("Person", "shape person"), ("Person", "background #08427b"), ("Web Browser", "shape WebBrowser"),
            ("Mobile", "shape MobileDevicePortrait"), ("Bucketed", "shape Bucket"))) + '  }\n }\n}\n')
m, un = imp.read("structurizr", styled, "x")
ok("structurizr · styles' shapes by Structurizr's precedence: Element first, then the type's tag, then the element's own in order; "
   "of two styles for one tag the later; a shape with no counterpart (Bucket) leaves the card to its kind, and is said",
   [card(m, i).get("shape") for i in ("u", "s", "w", "a", "d")] == ["person", "box", "browser", None, "cylinder"]
   and [msg for _, msg in un] == ["not imported: background #08427b", 'element "Bucketed": shape Bucket has no counterpart, so a card it falls on is drawn as it would be without it'],
   ([card(m, i) for i in ("u", "s", "w", "a", "d")], un))
for how, on in (("FALSE", False), ("none", False), ("com.structurizr.model.DefaultImpliedRelationshipsStrategy", False), ("true", True),
                ("com.structurizr.model.CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy", True), ("com.example.MyStrategy", True),
                ("com.structurizr.model.CreateImpliedRelationshipsUnlessBogusStrategy", True)):
    m, un = imp.read("structurizr", dsl.replace("model {", f"!impliedRelationships {how}\n  model {{"), "x")
    said = [msg for _, msg in un]
    ok(f"structurizr · !impliedRelationships {how} draws implied lines {'as' if on else 'not, as'} Structurizr does{', and is said' if how.endswith(('MyStrategy', 'BogusStrategy')) else ''}",
       m["views"][0]["edges"] == (["u-s"] if on else []) and said == ([f"!impliedRelationships {how}: a strategy umlimator does not know, so implied lines are drawn as Structurizr's default draws them"] if how.endswith(("MyStrategy", "BogusStrategy")) else []),
       (m["views"], un))
same = ('workspace {\n model {\n  u = person "User"\n  s = softwareSystem "Shop" {\n   w = container "Web"\n   w2 = container "Api"\n  }\n'
        '  u -> s "Browses"\n  u -> w "Uses"\n  u -> w2 "Reads"\n  u -> w2 "Browses"\n }\n views {\n  systemContext s {\n   include *\n  }\n }\n}\n')
for how, want in (("CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy", ["Browses", "Uses", "Reads"]), ("true", ["Browses"])):
    m, un = imp.read("structurizr", same.replace("model {", f"!impliedRelationships com.structurizr.model.{how}\n model {{" if "." not in how and how != "true" else f"!impliedRelationships {how}\n model {{"), "x")
    labels = [next(e for e in m["edges"] if e["id"] == i).get("label") for i in m["views"][0]["edges"]]
    ok(f"structurizr · !impliedRelationships {how}: an implied line per {'description, unless a relationship with it joins the two' if how != 'true' else 'pair, unless any relationship joins them'}",
       labels == want and not un, (labels, un))
guessed = ('workspace {\n model {\n  portal = softwareSystem "Customer Portal"\n  mobb = softwareSystem "Mobile Banking" {\n   web = container "Web Application" "" "Java and Spring MVC" {\n'
           '    mc = component "Mobile Controller" "" "Spring MVC"\n   }\n   app = container "Mobile App" "" "Xamarin"\n  }\n }\n}\n')
m, un = imp.read("structurizr", guessed, "x")
ok("structurizr · a software system or component its words make frontend or mobile keeps that colour, drawn a box; a container is a browser or a phone",
   [(card(m, i).get("kind"), card(m, i).get("shape")) for i in ("portal", "mobb", "web", "mc", "app")]
   == [("frontend", "box"), ("mobile", "box"), ("frontend", None), ("mobile", "box"), ("mobile", None)], [card(m, i) for i in ("portal", "mobb", "web", "mc", "app")])
tools = ('workspace {\n model {\n  dw = softwareSystem "Data Warehouse"\n  bus = softwareSystem "Event Bus"\n  dms = softwareSystem "Document Management System" {\n'
         '   api = container "Api" {\n    st = component "Orders Store" "" "JPA"\n    fx = component "File Exporter"\n   }\n   db = container "Database" "" "Postgres"\n  }\n }\n}\n')
m, un = imp.read("structurizr", tools, "x")
ok("structurizr · a software system or component its words make a store, a queue or a file keeps that colour, drawn a box; a container takes the shape",
   [(card(m, i).get("kind"), card(m, i).get("shape")) for i in ("dw", "bus", "dms", "st", "fx", "db")]
   == [("database", "box"), ("queue", "box"), ("file", "box"), ("database", "box"), ("file", "box"), ("database", None)], m["nodes"])
gw = ('workspace {\n model {\n  gw = softwareSystem "API Gateway"\n  s = softwareSystem "Shop" {\n   edge = container "Edge" "" "nginx" {\n'
      '    lb = component "Load balancer" "" "HAProxy"\n   }\n  }\n }\n}\n')
m, un = imp.read("structurizr", gw, "x")
ok("structurizr · a system, container or component its words make cloud keeps that colour, drawn a box, never a node (0.21.0)",
   [(card(m, i).get("kind"), card(m, i).get("shape")) for i in ("gw", "edge", "lb")] == [("cloud", "box")] * 3, m["nodes"])
m, un = imp.read("plantuml", '@startuml\nContainer(edge, "Edge", "nginx")\nComponent(lb, "Load balancer", "HAProxy")\n@enduml\n', "x")
ok("C4 · a container or component its words make cloud is drawn a box (0.21.0)", [(card(m, i).get("kind"), card(m, i).get("shape")) for i in ("edge", "lb")] == [("cloud", "box")] * 2, m["nodes"])
m, un = imp.read("plantuml", '@startuml\nComponent(st, "Orders Store", "JPA")\nComponentDb(cdb, "Ledger")\n@enduml\n', "x")
ok("C4 · a component its words make a store is drawn a box; a ComponentDb is a cylinder", [(card(m, i).get("kind"), card(m, i).get("shape")) for i in ("st", "cdb")] == [("database", "box"), ("database", None)], m["nodes"])
m, un = imp.read("plantuml", '@startuml\nComponent(mc, "Mobile Controller", "Spring MVC")\nContainer(app, "Mobile App", "Xamarin")\n@enduml\n', "x")
ok("C4 · a component its words make mobile is drawn a box, a container a phone", [(card(m, i).get("kind"), card(m, i).get("shape")) for i in ("mc", "app")] == [("mobile", "box"), ("mobile", None)], m["nodes"])
m, un = imp.read("plantuml", '@startuml\nAddElementTag("v2", $shape=EightSidedShape())\nAddElementTag("old", $bgColor="grey")\nSystem(a, "A", $tags="v2")\n@enduml\n', "x")
ok("C4 · a tag's $shape is said, not drawn", un == [(2, 'AddElementTag(v2): $shape=EightSidedShape() is not imported')], un)
nested = dsl.replace('u = person "User"', 'group "Company" {\n group "Sales" {\n u = person "User"\n }').replace('u -> w', '}\n u -> w')
m, un = imp.read("structurizr", nested, "x")
ok("structurizr · groups nest as boxes, and a view's scope sits in its own group's box",
   [box(m, "landscape", b).get("parent") for b in ("Company", "Sales")] == [None, "Company"] and box(m, "s-containers", "s").get("parent") == "Company" and un == [],
   (m["views"], un))
ok("knows each format by its content", [imp.detect("x", t) for t in ("/* a */\nworkspace {", "@startuml", "flowchart LR", '{"services": {}}', '{"kind": "List", "items": []}')]
   == imp.FORMATS)

# Hostile and odd input (audit 1): linear work, a bounded model, and what is skipped said, never a traceback
import time
t0 = time.time()
m, un = imp.read("mermaid", "flowchart TD\n" + "A --> B\n" * 20000, "x")
ok("hostile · 20000 repeats of one link import in linear time (a numbered id resumes its search)",
   len(m["edges"]) == 20000 and m["edges"][-1]["id"] == "A-B-20000" and time.time() - t0 < 10, time.time() - t0)
m, un = imp.read("mermaid", "flowchart TD\n" + " & ".join(f"a{i}" for i in range(400)) + " --> " + " & ".join(f"b{i}" for i in range(400)), "x")
ok("hostile · a & b --> c & d is capped at 100000 links, said once", len(m["edges"]) == imp.FLOWS and un == [(2, "over 100000 links: the rest are not imported")], un)
m, un = imp.read("plantuml", "@startuml\n" + "' x\n" * (imp.LIMIT // 4 + 1), "x")
ok("hostile · a text format over 1 MiB is not read", m["nodes"] == [] and un and "over the limit of 1048576" in un[0][1], un)
m, un = imp.read("structurizr", 'workspace {\nmodel {\n' + 'group "g" {\n' * 1500 + 'p = person "P"\n' + '}\n' * 1500 + '}\n}\n', "x")
ok("hostile · 1500 nested groups read as nested boxes, no RecursionError", len(m["views"][0]["containers"]) == 1500
   and m["views"][0]["containers"][-1]["nodeIds"] == ["p"] and un == [], un)
odd = {"kubernetes": ([[{"kind": "Deployment"}]], 5, {"items": [None]}, [{"kind": "Deployment", "metadata": "x"}],
                      [{"kind": "Service", "metadata": {"name": "s"}, "spec": {"selector": ["a"], "ports": [80]}}],
                      [{"kind": "Ingress", "metadata": {"name": "i"}, "spec": {"rules": [None]}}],
                      [{"kind": "Deployment", "metadata": {"name": 5}, "spec": {"template": {"spec": {"containers": [{"image": 7, "env": [None]}]}}}}]),
       "compose": ([1], {"services": ["a"]}, {"services": {"a": "nginx"}}, {"name": 5, "services": {"a": {"image": 5, "ports": [None]}}})}
crashed = []
for fmt, cases in odd.items():
    for d in cases:
        try:
            imp.read(fmt, json.dumps(d), "x")
        except Exception as e:
            crashed.append((fmt, d, repr(e)))
ok("hostile · Kubernetes and compose JSON of odd shapes reads, skipping what is not an object", crashed == [], crashed)
m, un = imp.read("kubernetes", "[[1]]", "x")
ok("hostile · a nested array is said, not imported", m["nodes"] == [] and un == [("[0]", "not an object: not imported")], un)
m, un = imp.read("compose", json.dumps({"services": {"web": {"depends_on": "db", "ports": "8080:80"}, "db": {}}}), "x")
ok("compose · a string depends_on or ports is one entry, not its characters",
   line(m, "web", "db") and card(m, "web").get("what") == "Publishes 8080:80." and un == [], (m, un))

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    (t / "bad.mmd").write_bytes(b"\xff\xfe\x00flowchart")
    r = run("import", str(t / "bad.mmd"), "--out", str(t / "b.json"))
    ok("a file that is not UTF-8 is said in one line, no traceback", r.returncode == 1 and "is not UTF-8 text" in r.stderr and "Traceback" not in r.stderr, r.stderr)
    (t / "bare.json").write_text(json.dumps({"title": "t", "nodes": ["a", {"id": "b", "label": "B"}], "edges": [], "views": [{"id": "v", "nodeIds": ["b"]}]}))
    r = run("render", str(t / "bare.json"), "--out", str(t / "bare.html"), "--no-check")
    ok("render · a node that is not an object is a model problem, no traceback (backlog 4a.3)",
       r.returncode == 1 and "nodes[0] is not an object" in r.stderr and "Traceback" not in r.stderr, r.stderr[-800:])

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    for name, (fmt, views, unread, facts) in EXPECT.items():
        out = t / (Path(name).stem + ".json")
        r = run("import", str(ROOT / name), "--out", str(out))
        said = json.loads(r.stdout) if r.returncode == 0 else {}
        m = json.loads(out.read_text(encoding="utf-8")) if out.is_file() else {"nodes": [], "edges": [], "views": []}
        ok(f"{name} · read as {fmt}, with views {views}", said.get("format") == fmt and said.get("views") == views, r.stdout + r.stderr)
        got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
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
    shutil.copy(ROOT / "examples" / "clinic.dsl", t / "clinic.txt")
    r = run("import", str(t / "clinic.txt"), "--out", str(t / "txt.json"))
    ok("knows a format by its content, whatever the extension", r.returncode == 0 and json.loads(r.stdout).get("format") == "structurizr", r.stderr)
    r = run("import", str(ROOT / "tests" / "import" / "compose.json"), "--format", "kubernetes", "--out", str(t / "k.json"))
    ok("--format decides, and a file with nothing to import is an error", r.returncode == 1 and "nothing to import" in r.stderr, r.stderr)

# A file cut short (a download, a file still being written) or with a comment left open says so, on stderr and in the
# JSON's notImported (import-parsers #1 to #4, 0.14.0): it used to import as a smaller map with "unread": 0
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    dsl = (ROOT / "examples" / "clinic.dsl").read_text(encoding="utf-8").splitlines(keepends=True)
    puml = (ROOT / "tests" / "import" / "parcels.puml").read_text(encoding="utf-8").splitlines(keepends=True)
    files = {"cut.dsl": "".join(dsl[:36]), "open.dsl": "".join(dsl[:29] + ["/* TODO: check the reminder flow\n"] + dsl[29:]),
             "cut.puml": "".join(puml[:16]), "cut.json": "".join((ROOT / "tests" / "import" / "compose.json").read_text(encoding="utf-8").splitlines(keepends=True)[:70])}
    for name, text in files.items():
        (t / name).write_text(text, encoding="utf-8")
    said = lambda r: json.loads(r.stdout) if r.returncode == 0 else {}
    r = run("import", str(t / "cut.dsl"), "--out", str(t / "a.json"))
    ok("a Structurizr file cut short names each block it leaves open, on stderr and in the JSON",
       ":5: never closed: workspace" in r.stderr and ":9: never closed: model {" in r.stderr
       and [x["where"] for x in said(r).get("notImported", [])] == [5, 9] and said(r).get("unread") == 2, r.stdout + r.stderr)
    r = run("import", str(t / "open.dsl"), "--out", str(t / "b.json"))
    ok("a /* never closed says which lines it hid", f":30: /* is never closed, so lines 31 to {len(files['open.dsl'].splitlines())} are not read" in r.stderr, r.stderr)
    r = run("import", str(t / "cut.puml"), "--out", str(t / "c.json"))
    ok("a C4-PlantUML file cut short names its open boundary and its missing @enduml",
       ":1: @startuml has no @enduml" in r.stderr and ":10: never closed: System_Boundary(tracking" in r.stderr, r.stderr)
    r = run("import", str(t / "cut.json"), "--out", str(t / "d.json"))
    ok("JSON cut short is said to be invalid JSON, not a format it cannot tell", r.returncode == 1 and "is not valid JSON" in r.stderr
       and "cut short" in r.stderr and "cannot tell the format" not in r.stderr, r.stderr)

# A Mermaid classDiagram is read by the module's reader, in Node (plan 1.10, risks.md R7): a typed model with one uml.class
# view, and its report on stderr. tests/mermaid-class.test.mjs pins the reader's report and its round trip
name = "tests/import/classes.mmd"
ok("mermaid · a classDiagram is known by its content, and the Python reader leaves it to the module's",
   imp.detect("x", "%% a\nclassDiagram\n") == "mermaid" and imp.mermaid_typed("---\ntitle: t\n---\nclassDiagram\n") == "classDiagram"
   and not imp.mermaid_typed("flowchart LR\n") and imp.mermaid_typed('%%{\n  init: {\n    "theme": "dark"\n  }\n}%%\nclassDiagram\n') == "classDiagram" and "module's reader" in imp.read("mermaid", "classDiagram\nA --> B\n", "x")[1][0][1])
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    r = run("import", str(ROOT / name), "--out", str(t / "classes.json"))
    said = json.loads(r.stdout) if r.returncode == 0 else {}
    m = json.loads((t / "classes.json").read_text(encoding="utf-8")) if r.returncode == 0 else {"nodes": [], "edges": [], "views": [{}]}
    ok(f"{name} · read by the module's reader as one uml.class view of a version-2 model",
       said.get("format") == "mermaid" and said.get("views") == ["class-diagram"] and m.get("schemaVersion") == 2 and m["views"][0].get("diagram") == "uml.class",
       r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · lists what it skips or approximates, each with its line",
       got == [f":{n}:" for n in (3, 10, 11, 12, 46, 60, 61, 63, 66, 83, 93, 94, 95, 97, 98, 99, 100)] and said.get("unread") == 17, r.stderr)
    types = {n["id"]: n["type"] for n in m["nodes"]}
    ok(f"{name} · classes, an interface, an enumeration, namespaces and notes; each relation's UML kind",
       [types.get(i) for i in ("Duck", "Shape", "Color", "BaseShapes", "note-1")] == ["uml.Class", "uml.Interface", "uml.Enumeration", "uml.Package", "uml.Comment"]
       and [(line(m, a, b) or {}).get("type") for a, b in (("Duck", "Animal"), ("classK", "classL"), ("classM", "classN"), ("note-2", "Duck"))]
       == ["uml.Generalization", "uml.Dependency", "uml.InterfaceRealization", "uml.CommentLink"], m["edges"])
    problems = [p for p in u.js("validate", m) if p["level"] == "error"]
    ok(f"{name} · validate() finds no error", problems == [], problems)
    # without Node: the class diagram says so, and names the formats that need only Python, which still import
    bare = dict(__import__("os").environ, PATH=tmp)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "x.json")], capture_output=True, text=True, env=bare)
    ok("without Node, a classDiagram's import says it needs Node, and which formats do not", r.returncode == 1 and "Node.js 18" in r.stderr
       and "need only Python" in r.stderr and not (t / "x.json").exists(), r.stderr)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / "tests" / "import" / "checkout.mmd"), "--out", str(t / "y.json")],
                       capture_output=True, text=True, env=bare)
    ok("without Node, a Mermaid flowchart still imports", r.returncode == 0 and (t / "y.json").is_file(), r.stderr)
    # a copy of the CLI with lib/ but no src/: a sentence, not Node's stack trace
    bare = t / "bare"
    bare.mkdir()
    for f in ("umlimator.py", "umlimator_import.py"):
        shutil.copy(ROOT / f, bare / f)
    shutil.copytree(ROOT / "lib", bare / "lib")
    r = subprocess.run([sys.executable, str(bare / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "z.json")], capture_output=True, text=True)
    ok("with no src/, a classDiagram's import says it needs a full clone", r.returncode == 1 and "full clone" in r.stderr
       and "ERR_MODULE_NOT_FOUND" not in r.stderr and not (t / "z.json").exists(), r.stderr)

# A Mermaid sequenceDiagram is read by the module's reader too (notes/stage-3.md §8, 3.6): one uml.sequence view.
# tests/mermaid-sequence.test.mjs pins the reader's report and its round trip
name = "tests/import/sequence.mmd"
ok("mermaid · a sequenceDiagram is known by its content, and the Python reader leaves it to the module's",
   imp.detect("x", "%% a\nsequenceDiagram\n") == "mermaid" and imp.mermaid_typed("---\ntitle: t\n---\nsequenceDiagram\n") == "sequenceDiagram"
   and imp.mermaid_typed("sequenceDiagramX\n") is None and "a sequenceDiagram is read by the module's reader" in imp.read("mermaid", "sequenceDiagram\nA->>B: x\n", "x")[1][0][1])
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    r = run("import", str(ROOT / name), "--out", str(t / "sequence.json"))
    said = json.loads(r.stdout) if r.returncode == 0 else {}
    m = json.loads((t / "sequence.json").read_text(encoding="utf-8")) if r.returncode == 0 else {"nodes": [], "edges": [], "views": [{}]}
    v = m["views"][0]
    ok(f"{name} · read by the module's reader as one uml.sequence view of a version-2 model, its messages counted",
       said.get("format") == "mermaid" and said.get("views") == ["sequence-diagram"] and m.get("schemaVersion") == 2 and v.get("diagram") == "uml.sequence"
       and said.get("cards") == 11 and said.get("lines") == len(v.get("edges", [])) == 39, r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · lists what it skips or approximates, each with its line",
       got == [f":{n}:" for n in (3, 9, 10, 13, 17, 20, 21, 24, 29, 30, 33, 34, 34, 35, 36, 38, 39, 41, 49, 57, 60, 61, 69, 93, 94, 94, 95, 96, 96, 99, 99, 101, 108, 109, 110, 111)]
       and said.get("unread") == 36, r.stderr)
    ok(f"{name} · lifelines, each sort of message, fragments",
       {e["props"].get("sort") for e in v.get("edges", []) if e["type"] == "uml.Message"} == {"call", "async", "reply", "create", "delete"}
       and [f["props"]["operator"] for f in v.get("fragments", [])] == ["loop", "alt", "opt", "par", "par", "break"], v)
    problems = [p for p in u.js("validate", m) if p["level"] == "error"]
    ok(f"{name} · validate() finds no error", problems == [], problems)
    bare = dict(__import__("os").environ, PATH=tmp)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "x.json")], capture_output=True, text=True, env=bare)
    ok("without Node, a sequenceDiagram's import says it needs Node", r.returncode == 1 and "Mermaid sequenceDiagram" in r.stderr and "Node.js 18" in r.stderr
       and not (t / "x.json").exists(), r.stderr)
# A Mermaid stateDiagram is read by the module's reader too (notes/stage-4.md §13, 4.8): one uml.state-machine view.
# tests/mermaid-state.test.mjs pins the reader's report and its round trip
name = "tests/import/state.mmd"
ok("mermaid · a stateDiagram (and stateDiagram-v2) is known by its content, and the Python reader leaves it to the module's",
   imp.detect("x", "%% a\nstateDiagram-v2\n") == "mermaid" and imp.mermaid_typed("---\ntitle: t\n---\nstateDiagram\n") == "stateDiagram"
   and imp.mermaid_typed("stateDiagram-v2\n") == "stateDiagram" and imp.mermaid_typed("stateDiagramX\n") is None
   and "a stateDiagram is read by the module's reader" in imp.read("mermaid", "stateDiagram-v2\n[*] --> a\n", "x")[1][0][1])
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    r = run("import", str(ROOT / name), "--out", str(t / "state.json"))
    said = json.loads(r.stdout) if r.returncode == 0 else {}
    m = json.loads((t / "state.json").read_text(encoding="utf-8")) if r.returncode == 0 else {"nodes": [], "edges": [], "views": [{}]}
    v = m["views"][0]
    ok(f"{name} · read by the module's reader as one uml.state-machine view of a version-2 model, past its byte-order mark",
       said.get("format") == "mermaid" and said.get("views") == ["state-diagram"] and m.get("schemaVersion") == 2 and v.get("diagram") == "uml.state-machine"
       and m.get("title") == "Every construct on Mermaid's state diagram page" and said.get("cards") == 73 and said.get("lines") == 57, r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · lists what it skips or approximates, each with its line",
       got == [f":{n}:" for n in (3, 18, 19, 78, 95, 101, 102, 103, 104, 105, 114, 117, 127, 128, 139, 141, 142, 143, 144, 145)] and said.get("unread") == 20, r.stderr)
    kinds = {n["id"]: (n["type"], (n.get("props") or {}).get("kind")) for n in m["nodes"]}
    ok(f"{name} · states, composites with regions, pseudostates and final states, transitions and notes",
       [kinds.get(i) for i in ("Active", "if_state", "fork_state", "hist", "start", "end")] == [("uml.State", None), ("uml.Pseudostate", "choice"),
        ("uml.Pseudostate", "fork"), ("uml.Pseudostate", "shallowHistory"), ("uml.Pseudostate", "initial"), ("uml.FinalState", None)]
       and len(next(n for n in m["nodes"] if n["id"] == "Active").get("members", [])) == 3 and {e["type"] for e in m["edges"]} == {"uml.Transition", "uml.CommentLink"}, m["nodes"])
    # no core error (one with no rule); the state type's UML rules may name what Mermaid's own examples do and UML does not
    # allow (a fork into plain states, a history at the top), as tests/mermaid-state.test.mjs says
    problems = [p for p in u.js("validate", m) if p["level"] == "error" and not p.get("rule")]
    ok(f"{name} · validate() finds no core error", problems == [], problems)
    bare = dict(__import__("os").environ, PATH=tmp)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "x.json")], capture_output=True, text=True, env=bare)
    ok("without Node, a stateDiagram's import says it needs Node", r.returncode == 1 and "Mermaid stateDiagram" in r.stderr and "Node.js 18" in r.stderr
       and not (t / "x.json").exists(), r.stderr)

# A Mermaid mindmap is read by the module's reader too (notes/milestone-4a.md §8.4, 4a.5): one mindmap view, a model
# docs/diagrams/examples/check.mjs passes. tests/mermaid-mindmap.test.mjs pins the reader's report and its round trip
name = "tests/import/mindmap.mmd"
ok("mermaid · a mindmap is known by its content, and the Python reader leaves it to the module's",
   imp.detect("x", "%% a\nmindmap\n  root\n") == "mermaid" and imp.mermaid_typed("---\ntitle: t\n---\nmindmap\n") == "mindmap"
   and imp.mermaid_typed('%%{init: {"theme": "dark"}}%%\nmindmap\n') == "mindmap" and imp.mermaid_typed("mindmapX\n") is None
   and "a mindmap is read by the module's reader" in imp.read("mermaid", "mindmap\n  root\n", "x")[1][0][1])
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    r = run("import", str(ROOT / name), "--out", str(t / "mindmap.json"))
    said = json.loads(r.stdout) if r.returncode == 0 else {}
    m = json.loads((t / "mindmap.json").read_text(encoding="utf-8")) if r.returncode == 0 else {"nodes": [], "edges": [], "views": [{}]}
    v = m["views"][0]
    ok(f"{name} · read by the module's reader as one mindmap view of a version-2 model, past its byte-order mark",
       said.get("format") == "mermaid" and said.get("views") == ["mindmap"] and m.get("schemaVersion") == 2 and v.get("diagram") == "mindmap"
       and m.get("title") == "Every construct on Mermaid's mindmap page" and said.get("cards") == 46 and said.get("lines") == 0
       and {n["type"] for n in m["nodes"]} == {"mindmap.Topic"} and card(m, "ci").get("parent") == "shapes", r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · lists what it skips or approximates, each with its line",
       got == [f":{n}:" for n in (4, 9, 11, 14, 29, 31, 32, 33, 38, 42, 49, 50, 62, 63, 64)] and said.get("unread") == 15, r.stderr)
    checked = subprocess.run(["node", "--input-type=module", "-e", "import { check } from " + json.dumps((ROOT / "docs" / "diagrams" / "examples" / "check.mjs").as_uri())
                              + "; import { readFileSync } from 'node:fs'; process.stdout.write(JSON.stringify(check(JSON.parse(readFileSync(process.argv[1], 'utf8')), 'mindmap')));",
                              str(t / "mindmap.json")], capture_output=True, text=True)
    ok(f"{name} · the model it writes passes docs/diagrams/examples/check.mjs", checked.returncode == 0 and json.loads(checked.stdout or "null") == [], checked.stdout + checked.stderr)
    bare = dict(__import__("os").environ, PATH=tmp)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "x.json")], capture_output=True, text=True, env=bare)
    ok("without Node, a mindmap's import says it needs Node", r.returncode == 1 and "Mermaid mindmap" in r.stderr and "Node.js 18" in r.stderr
       and not (t / "x.json").exists(), r.stderr)

# BPMN XML is read and written by the module's adapter in Node, through a bpmn-moddle the user installs, never umlimator
# (notes/milestone-4b.md §12.4): CI installs it in a scratch folder and names it in UMLIMATOR_BPMN_MODDLE. Without it the
# CLI says how to install it, and the checks that need it say they skipped, except in CI, where they fail.
# tests/bpmn-xml.test.mjs pins the adapter's reports and its round trip
name = "tests/import/descriptive.bpmn"
ok("bpmn · known by its content or its .bpmn extension", imp.detect("x", '<?xml version="1.0"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">') == "bpmn"
   and imp.detect("x.bpmn", "") == "bpmn" and imp.detect("x.xml", "<definitions/>") is None)
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    none = dict(__import__("os").environ, UMLIMATOR_BPMN_MODDLE=tmp)  # a folder with no bpmn-moddle
    for cmd in (["import", str(ROOT / name), "--out", str(t / "x.json")], ["export", str(ROOT / "examples" / "bookshop-order-to-shipment.json"), "--out", str(t / "x.bpmn")]):
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *cmd], capture_output=True, text=True, env=none, cwd=tmp)
        ok(f"bpmn · without bpmn-moddle, {cmd[0]} says how to install it and writes nothing",
           r.returncode == 1 and "BPMN needs bpmn-moddle: npm install bpmn-moddle@10.3.1" in r.stderr and not any(t.glob("x.*")), r.stderr)
    r = run("import", str(ROOT / name), "--out", str(t / "returns.json"))
    if "BPMN needs bpmn-moddle" in r.stderr and not __import__("os").environ.get("CI"):
        print("skip umlimator.py import · bpmn: bpmn-moddle is not installed here (UMLIMATOR_BPMN_MODDLE names its folder)")
    else:
        said = json.loads(r.stdout) if r.returncode == 0 else {}
        m = json.loads((t / "returns.json").read_text(encoding="utf-8")) if r.returncode == 0 else {"nodes": [], "edges": [], "views": []}
        ok(f"{name} · read by the module's adapter as two bpmn views of a version-2 model", said.get("format") == "bpmn" and said.get("views") == ["returns", "restock-view"]
           and m.get("schemaVersion") == 2 and said.get("cards") == 33 and said.get("lines") == 32, r.stdout + r.stderr)
        got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
        ok(f"{name} · lists what it skips, each with its element's id, and once that positions are not kept", got == [":Message_return:", ":"]
           and "positions and sizes in the diagram interchange are not kept" in r.stderr, r.stderr)
        problems = [p for p in u.js("validate", m) if p["level"] == "error"]
        ok(f"{name} · validate() finds no error", problems == [], problems)
        r = run("export", str(t / "returns.json"), "--view", "returns", "--out", str(t / "returns.bpmn"))
        ok("bpmn · export writes the model's BPMN and says what it leaves out (ext.bpmn)", r.returncode == 0 and json.loads(r.stdout) == {
            "out": str(t / "returns.bpmn"), "format": "bpmn", "view": "returns", "notWritten": 1} and "under ext.bpmn" in r.stderr, r.stdout + r.stderr)
        r = run("import", str(t / "returns.bpmn"), "--out", str(t / "again.json"))
        again = json.loads((t / "again.json").read_text(encoding="utf-8")) if r.returncode == 0 else {}
        ok("bpmn · what export writes, import reads back as the same model, but what ext.bpmn held",
           {k: v for k, v in m.items() if k != "ext"} == again, r.stderr)
        # --moddle names the folder, before UMLIMATOR_BPMN_MODDLE (here a folder with none); one whose bpmn-moddle has no
        # BpmnModdle export (an older or another package) gets the install message, not a stack trace
        have = __import__("os").environ.get("UMLIMATOR_BPMN_MODDLE") or __import__("os").getcwd()  # where import found it above
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "flag.json"), "--moddle", have],
                           capture_output=True, text=True, env=none, cwd=tmp)
        ok("bpmn · --moddle names bpmn-moddle's folder, before UMLIMATOR_BPMN_MODDLE", r.returncode == 0 and (t / "flag.json").is_file(), r.stderr)
        odd = t / "odd" / "node_modules" / "bpmn-moddle"
        odd.mkdir(parents=True)
        (odd / "package.json").write_text('{"name": "bpmn-moddle", "version": "0.0.1", "main": "index.js"}', encoding="utf-8")
        (odd / "index.js").write_text("module.exports = function () {};", encoding="utf-8")
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "odd.json"), "--moddle", str(t / "odd")],
                           capture_output=True, text=True, env=none, cwd=tmp)
        ok("bpmn · a bpmn-moddle with no BpmnModdle export gets the install message, not a stack trace", r.returncode == 1
           and "BPMN needs bpmn-moddle: npm install bpmn-moddle@10.3.1 (the one in" in r.stderr and "at " not in r.stderr and not (t / "odd.json").exists(), r.stderr)
        r = run("export", str(t / "returns.json"), "--view", "nowhere", "--out", str(t / "y.bpmn"))
        ok("bpmn · export of a view the model does not have is an error", r.returncode == 1 and "has no bpmn view nowhere" in r.stderr, r.stderr)
        # 4b.5: export carries the type's layout of the view (notes/milestone-4b.md §12.3): the example's pools and lanes at
        # their bands, every other shape at its box, every line through its points; and import reads it back as the example
        ex = ROOT / "examples" / "bookshop-order-to-shipment.json"
        r = run("export", str(ex), "--out", str(t / "order.bpmn"))
        xml = (t / "order.bpmn").read_text(encoding="utf-8") if r.returncode == 0 else ""
        g = u.js("layout", json.loads(ex.read_text(encoding="utf-8")), "order-to-shipment", module=u.HERE / "lib" / "umlimator-all.js")
        want = {**{n["id"]: n for n in g["nodes"]}, **{b["id"]: b for b in g["bands"]}}
        num = lambda v: f"{v:g}"
        di = lambda i: (f'bpmnElement="{i}"' in xml and re.search(rf'bpmnElement="{re.escape(i)}"[^>]*>\s*<dc:Bounds x="{num(want[i]["x"])}" y="{num(want[i]["y"])}" '
                                                                      rf'width="{num(want[i]["w"])}" height="{num(want[i]["h"])}"', xml) is not None)
        line = next(e for e in g["edges"] if e["id"] == "bp-m-charge")
        ok("bpmn · export of the example lays it out: each pool and lane at its band, each shape at its box, a line through its points",
           r.returncode == 0 and json.loads(r.stdout)["view"] == "order-to-shipment" and all(di(i) for i in ("bp-shopper", "bp-bookshop", "bp-sales", "bp-take-payment", "payment-timeout", "pick-pack", "dispatch"))
           and re.search(r'bpmnElement="bp-m-charge"[^>]*>' + "".join(rf'\s*<di:waypoint x="{num(x)}" y="{num(y)}" />' for x, y in line["pts"]), xml) is not None, r.stdout + r.stderr + xml[:400])
        r = run("import", str(t / "order.bpmn"), "--out", str(t / "order.json"))
        back = json.loads((t / "order.json").read_text(encoding="utf-8")) if r.returncode == 0 else {}
        ok("bpmn · import reads the exported example back with the same elements, lines and views",
           sorted(n["id"] for n in back.get("nodes", [])) == sorted(n["id"] for n in json.loads(ex.read_text(encoding="utf-8"))["nodes"])
           and len(back.get("edges", [])) == 29 and [v["id"] for v in back.get("views", [])] == ["order-to-shipment", "pick-and-pack"], r.stderr)
        # an expanded sub-process is written at its frame (the layout's families), not a box: the stress fixture's edge-cases
        st = ROOT / "tests" / "bpmn-stress.json"
        r = run("export", str(st), "--view", "edge-cases", "--out", str(t / "ec.bpmn"))
        xml = (t / "ec.bpmn").read_text(encoding="utf-8") if r.returncode == 0 else ""
        g = u.js("layout", json.loads(st.read_text(encoding="utf-8")), "edge-cases", module=u.HERE / "lib" / "umlimator-all.js")
        f = next(f for f in g["families"] if f["id"] == "ec-sub")
        ok("bpmn · export writes an expanded sub-process at its frame, expanded",
           re.search(rf'bpmnElement="ec-sub" isExpanded="true">\s*<dc:Bounds x="{num(f["x"])}" y="{num(f["y"])}" width="{num(f["w"])}" height="{num(f["h"])}"', xml) is not None,
           r.stdout + r.stderr + json.dumps(f))

# notes/milestone-2.md §8.5 (M2.12): an erDiagram, a flowchart given --typed, a Structurizr JSON workspace and a .dbml file
# are read by the module's readers in Node (tests/mermaid-er, mermaid-flowchart, structurizr and dbml.test.mjs pin their
# reports); every other source imports as before. A Structurizr JSON or .dbml file over 1 MiB is refused before parsing.
ws = json.loads((ROOT / "tests" / "import" / "structurizr.json").read_text(encoding="utf-8"))["clinic"]
ok("knows the typed sources by their content (an erDiagram, a Structurizr JSON workspace) and a .dbml file by its name",
   [imp.detect("x", "%% a\nerDiagram\n"), imp.detect("x.json", json.dumps(ws)), imp.detect("x.dbml", "Table a {\n  id int\n}\n"),
    imp.detect("x", '{"model": [], "views": {}}')] == ["mermaid", "structurizr-json", "dbml", None]
   and imp.mermaid_typed("---\ntitle: t\n---\nerDiagram\n") == "erDiagram" and "an erDiagram is read by the module's reader" in imp.read("mermaid", "erDiagram\nA ||--o{ B : x\n", "x")[1][0][1])
ok("--typed makes a flowchart or a graph the flowchart reader's, and nothing else",
   [imp.mermaid_typed(t, True) for t in ("flowchart LR\n", "graph TD\n", "C4Context\n", "classDiagram\n")] == ["flowchart", "flowchart", None, "classDiagram"]
   and imp.mermaid_typed("flowchart LR\n") is None and imp.mermaid_typed("graph TD\n") is None)


def typed(r, out):
    """What import said on stdout, and the model it wrote."""
    said = json.loads(r.stdout) if r.returncode == 0 else {}
    return said, json.loads(out.read_text(encoding="utf-8")) if r.returncode == 0 and out.is_file() else {"nodes": [], "edges": [], "views": [{}]}


def core_errors(m):  # no core error (one with no rule): the types' own rules are their tests'
    return [p for p in u.js("validate", m) if p["level"] == "error" and not p.get("rule")]


with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    nonode = dict(__import__("os").environ, PATH=tmp)
    # an erDiagram: refused before 0.24.0 ("not a flowchart, graph or C4 diagram"), now the ER reader's
    name = "tests/import/er.mmd"
    r = run("import", str(ROOT / name), "--out", str(t / "er.json"))
    said, m = typed(r, t / "er.json")
    ok(f"{name} · an erDiagram is read by the module's reader as one er view of a version-2 model",
       said.get("format") == "mermaid" and said.get("views") == ["er-diagram"] and m.get("schemaVersion") == 2 and m["views"][0].get("diagram") == "er"
       and {n["type"] for n in m["nodes"]} == {"er.Entity"} and {e["type"] for e in m["edges"]} == {"er.Relationship"}, r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · lists what it skips or approximates, each with its line", len(got) == said.get("unread") == 29 and all(g[1:-1].isdigit() for g in got), r.stderr)
    ok(f"{name} · validate() finds no core error", core_errors(m) == [], core_errors(m))
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "x.json")], capture_output=True, text=True, env=nonode)
    r2 = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / "tests/import/checkout.mmd"), "--typed", "--out", str(t / "x.json")],
                        capture_output=True, text=True, env=nonode)
    ok("without Node, --typed on a flowchart says to drop --typed for a map", r2.returncode == 1 and "without --typed, as a map" in r2.stderr
       and "flowcharts and C4 diagrams need only Python" not in r2.stderr, r2.stderr)
    ok("without Node, an erDiagram's import says it needs Node", r.returncode == 1 and "Mermaid erDiagram" in r.stderr and "Node.js 18" in r.stderr
       and not (t / "x.json").exists(), r.stderr)

    # a requirementDiagram (notes/milestone-3.md §12.4, M3.6): refused before ("not a flowchart, graph or C4 diagram"), now
    # the requirement reader's (tests/mermaid-requirement.test.mjs pins its report); the model it writes passes check.mjs
    name = "tests/import/requirement.mmd"
    ok("knows a requirementDiagram by its content, and leaves it to the module's reader",
       imp.detect("x", "%% a\nrequirementDiagram\n") == "mermaid" and imp.mermaid_typed("---\ntitle: t\n---\nrequirementDiagram\n") == "requirementDiagram"
       and imp.mermaid_typed("requirementDiagramX\n") is None and "a requirementDiagram is read by the module's reader" in imp.read("mermaid", "requirementDiagram\n", "x")[1][0][1])
    r = run("import", str(ROOT / name), "--out", str(t / "req.json"))
    said, m = typed(r, t / "req.json")
    ok(f"{name} · a requirementDiagram is read by the module's reader as one sysml.requirement view of a version-2 model",
       said.get("format") == "mermaid" and said.get("views") == ["requirements"] and m.get("schemaVersion") == 2 and m["views"][0].get("diagram") == "sysml.requirement"
       and {n["type"] for n in m["nodes"]} == {"sysml.Requirement", "sysml.Block", "sysml.TestCase"} and said.get("cards") == 23 and said.get("lines") == 11, r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · lists what it skips or approximates, each with its line (the page's copy from an element among them)",
       len(got) == said.get("unread") == 31 and ":80:" in got and "copy-ends" in r.stderr and all(g[1:-1].isdigit() for g in got), r.stderr)
    ok(f"{name} · validate() finds no core error, and check.mjs passes the model",
       core_errors(m) == [] and u.js("check", m, "sysml.requirement", module=ROOT / "docs" / "diagrams" / "examples" / "check.mjs") == [], core_errors(m))
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(ROOT / name), "--out", str(t / "x.json")], capture_output=True, text=True, env=nonode)
    ok("without Node, a requirementDiagram's import says it needs Node", r.returncode == 1 and "Mermaid requirementDiagram" in r.stderr and "Node.js 18" in r.stderr
       and not (t / "x.json").exists(), r.stderr)

    # a flowchart: a map as before; with --typed, the flowchart reader's
    name = "tests/import/checkout.mmd"
    r = run("import", str(ROOT / name), "--typed", "--out", str(t / "fc.json"))
    said, m = typed(r, t / "fc.json")
    ok(f"{name} · --typed reads a flowchart as one flowchart view of a version-2 model, its shapes kept",
       said.get("format") == "mermaid" and said.get("views") == ["flowchart"] and m.get("schemaVersion") == 2 and m["views"][0].get("diagram") == "flowchart"
       and card(m, "orders").get("type") == "flow.Database" and said.get("cards") == 8 and "containers" not in m["views"][0], r.stdout + r.stderr)
    got = [l[len(str(ROOT / name)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(f"{name} · --typed lists what it skips or approximates (the subgraphs among them), each with its line",
       len(got) == said.get("unread") == 11 and ":8:" in got and all(g[1:-1].isdigit() for g in got), r.stderr)
    ok(f"{name} · --typed: validate() finds no core error", core_errors(m) == [], core_errors(m))
    r = run("import", str(ROOT / name), "--out", str(t / "map.json"))
    ok(f"{name} · without --typed, still a map", r.returncode == 0 and "schemaVersion" not in json.loads((t / "map.json").read_text()) and r.stderr == "", r.stderr)
    r = run("import", str(ROOT / "tests" / "import" / "meals.mmd"), "--typed", "--out", str(t / "y.json"))
    ok("--typed on a source with no typed reader (Mermaid's C4) says so, and writes nothing", r.returncode == 1 and "--typed reads a Mermaid flowchart" in r.stderr
       and not (t / "y.json").exists(), r.stderr)
    r = run("import", str(ROOT / "examples" / "clinic.dsl"), "--typed", "--out", str(t / "y.json"))
    ok("--typed on Structurizr DSL says so, and writes nothing", r.returncode == 1 and "is structurizr, which imports as a map" in r.stderr and not (t / "y.json").exists(), r.stderr)

    # a Structurizr JSON workspace: not recognised before 0.24.0, now the Structurizr reader's: typed C4
    src = t / "clinic.json"
    src.write_text(json.dumps(ws, indent=1), encoding="utf-8")
    r = run("import", str(src), "--out", str(t / "c4.json"))
    said, m = typed(r, t / "c4.json")
    ok("Structurizr JSON · a workspace is read by the module's reader as typed C4 views",
       said.get("format") == "structurizr-json" and said.get("views") == ["context", "containers", "api"]
       and [v.get("diagram") for v in m["views"]] == ["c4.context", "c4.container", "c4.component"] and m.get("schemaVersion") == 2, r.stdout + r.stderr)
    got = [l[len(str(src)):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok("Structurizr JSON · lists what it does not read, each with its path in the workspace",
       len(got) == said.get("unread") == 6 and got[:2] == [":model.people[1].group:", ":model:"], r.stderr)
    ok("Structurizr JSON · validate() finds no core error", core_errors(m) == [], core_errors(m))
    big = t / "big.json"
    big.write_text(json.dumps(ws) + " " * (1 << 20), encoding="utf-8")
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(big), "--out", str(t / "big-out.json")], capture_output=True, text=True, env=nonode)
    ok("Structurizr JSON · a workspace over 1 MiB is refused before it is parsed (before Node is looked for), and nothing written",
       r.returncode == 1 and "over the limit of 1048576 (1 MiB)" in r.stderr and "Node.js" not in r.stderr and not (t / "big-out.json").exists(), r.stderr)
    r = run("import", str(ROOT / "tests" / "import" / "compose.json"), "--format", "structurizr-json", "--out", str(t / "z.json"))
    ok("Structurizr JSON · --format names it; a file it reads nothing from is an error", r.returncode == 1 and "nothing to import" in r.stderr, r.stderr)

    # a .dbml file: @dbml/core parses it where it resolves from the working folder. CI installs none: the message, nothing written
    cap = json.loads((ROOT / "tests" / "import" / "dbml.json").read_text(encoding="utf-8"))
    ci = t / "ci"
    ci.mkdir()
    (ci / "shop.dbml").write_text(cap["dbml"], encoding="utf-8")
    dbml = lambda folder, f, **kw: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", f, "--out", "shop.json"], capture_output=True, text=True, cwd=folder, **kw)
    home = {k: v for k, v in __import__("os").environ.items() if k != "NODE_PATH"} | {"HOME": str(ci)}  # no global @dbml/core either
    r = dbml(ci, "shop.dbml", env=home)
    ok(".dbml · with no @dbml/core where it is run, says how to install it, and writes nothing",
       r.returncode == 1 and "npm install @dbml/core" in r.stderr and str(ci.resolve()) in r.stderr and not (ci / "shop.json").exists(), r.stderr)
    # with a stub @dbml/core in the working folder, whose parser returns the export() M2.11 captured (and says it was called):
    # the adapter on the export's shape; the CLI gives it a real parse's Database, which CI does not install (§8.5)
    stub = t / "stub"
    core = stub / "node_modules" / "@dbml" / "core"
    core.mkdir(parents=True)
    (core / "package.json").write_text('{"name": "@dbml/core", "version": "11.0.0", "main": "index.js"}', encoding="utf-8")
    (core / "captured.json").write_text(json.dumps(cap), encoding="utf-8")
    (core / "index.js").write_text(
        "const fs = require('fs'), cap = require('./captured.json');\n"
        "exports.Parser = class { static parse(text, format) {\n"
        "  fs.writeFileSync('parsed.txt', format);\n"
        "  if (text !== cap.dbml) { const e = new Error('parse failed'); e.diags = [{ message: 'Expect an identifier', location: { start: { line: 2, column: 3 } } }]; throw e; }\n"
        "  return cap.database; } };\n", encoding="utf-8")
    (stub / "shop.dbml").write_text(cap["dbml"], encoding="utf-8")
    r = dbml(stub, "shop.dbml")
    said, m = typed(r, stub / "shop.json")
    ok(".dbml · read through @dbml/core's parser (dbmlv2) and the adapter as one er view of a version-2 model",
       said.get("format") == "dbml" and said.get("views") == ["schema"] and m["views"][0].get("diagram") == "er" and said.get("cards") == 12
       and (stub / "parsed.txt").read_text() == "dbmlv2", r.stdout + r.stderr)
    got = [l[len("shop.dbml"):].split(" ", 1)[0] for l in r.stderr.splitlines()]
    ok(".dbml · lists what it does not read, each with its path in the Database (the whole database's with none)",
       len(got) == said.get("unread") == 20 and got[0] == ":" and ":schemas[0].tables[0].fields[0]:" in got, r.stderr)
    ok(".dbml · validate() finds no core error", core_errors(m) == [], core_errors(m))
    (stub / "parsed.txt").unlink()
    (stub / "shop.json").unlink()
    (stub / "bad.dbml").write_text("Table a {\n  id int [pk\n}\n", encoding="utf-8")
    r = dbml(stub, "bad.dbml")
    ok(".dbml · what @dbml/core cannot parse is named by its line, and nothing written",
       r.returncode == 1 and "bad.dbml:2: Expect an identifier" in r.stderr and "could not parse" in r.stderr and not (stub / "shop.json").exists(), r.stderr)
    (stub / "parsed.txt").unlink()
    (stub / "big.dbml").write_text(cap["dbml"] + "\n" + "// x\n" * (1 << 18), encoding="utf-8")
    r = dbml(stub, "big.dbml")
    ok(".dbml · a file over 1 MiB is refused before @dbml/core parses it, and nothing written",
       r.returncode == 1 and "over the limit of 1048576" in r.stderr and not (stub / "parsed.txt").exists() and not (stub / "shop.json").exists(), r.stderr)
    big.rename(stub / "huge.json")
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", "huge.json", "--format", "dbml", "--out", "shop.json"],
                       capture_output=True, text=True, cwd=stub, env=nonode)
    ok("--format dbml · a file over 1 MiB is refused before it is read", r.returncode == 1 and "over the limit of 1048576 (1 MiB) for DBML: nothing read" in r.stderr, r.stderr)
    said = []
    for body in ("throw new Error('Cannot find module @dbml/parse');\n", "module.exports = {};\n"):  # an install that does not load
        (core / "index.js").write_text(body, encoding="utf-8")
        r = dbml(stub, "shop.dbml")
        said.append(r.returncode == 1 and "@dbml/core at " in r.stderr and "did not load" in r.stderr and "could not parse" not in r.stderr
                    and "npm install @dbml/core" in r.stderr and not (stub / "shop.json").exists())
    ok(".dbml · an @dbml/core that throws as it loads, or has no Parser.parse, is named as the install's fault, not the file's, and nothing written",
       said == [True, True], r.stderr)
    r = dbml(stub, "shop.dbml", env=nonode)
    ok("without Node, a .dbml file's import says it needs Node", r.returncode == 1 and "is DBML" in r.stderr and "Node.js 18" in r.stderr, r.stderr)
sys.exit(1 if failed else 0)
