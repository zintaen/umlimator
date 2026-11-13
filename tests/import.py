#!/usr/bin/env python3
"""umlimator.py import (#90) end to end. Each sample, one per format (Mermaid has two: a flowchart and a C4 diagram), in
tests/import/, and the Structurizr one as the gallery's examples/clinic.dsl, becomes a model that the module's validate()
passes, that renders, and whose layout check is clean; it has the cards, boxes, lines and views its source says; and
what the sample holds that import does not read is listed on stderr with its line (in JSON, its path).

  python3 tests/import.py

Needs Node (validate() is the module's, run as `diff` runs diff()) and Google Chrome or Chromium (render and check).
"""
import importlib.util, json, shutil, subprocess, sys, tempfile
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
sys.exit(1 if failed else 0)
