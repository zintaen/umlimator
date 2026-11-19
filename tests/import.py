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
    "examples/clinic.dsl": ("structurizr", ["context", "containers", "api-components"], [":5:", ":47:", ":75:"], lambda m: [
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
    "tests/import/checkout.mmd": ("mermaid", ["flowchart"], [":18:", ":19:", ":20:"], lambda m: [
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
   ends(m) == [("a", "b", "calls"), ("b", "c", None), ("c", "b", None)] and [w for w, _ in un] == [4, 5, 6], (ends(m), un))
m, un = imp.read("mermaid", 'flowchart LR\n  A["Say #quot;hi#quot;"] --> B["5 #lt; 6"]\n  B -->|#35;1 step| C\n  C -- #lt;go#gt; --> D[#quot;x#quot;]\n', "x")
ok("mermaid · entity codes are read in labels, and their ; ends no statement (audit 5)",
   [n["label"] for n in m["nodes"]] == ['Say "hi"', "5 < 6", "C", '"x"'] and ends(m) == [("A", "B", None), ("B", "C", "#1 step"), ("C", "D", "<go>")] and not un, (m, un))
ok("mermaid · front matter fences with spaces after them are front matter (audit 5)",
   imp.front("--- \ntitle: Shop\n---  \nflowchart LR\n")[0] == "Shop" and imp.mermaid_typed("--- \ntitle: t\n--- \nclassDiagram\n") == "classDiagram")
m, un = imp.read("structurizr", 'workspace {\n  model {\n    u = person "User" \\\n      "A customer"\n    s = softwareSystem "Shop"\n    u -> s "Uses" \\\n      "HTTPS"\n  }\n}\n', "x")
ok("structurizr · a line ending in \\ goes on in the next (audit 5)",
   card(m, "u").get("what") == "A customer" and (line(m, "u", "s") or {}).get("sublabel") == "HTTPS" and not un, (m, un))
m, un = imp.read("plantuml", '@startuml\nSystem(a, "A")\nSystem(a, "Again")\nContainer(b, "B", $techn="Go")\nRel(a, b, "Uses", $techn="gRPC")\n'
                 'Rel(a, nope, "Lost")\n@enduml\n', "x")
ok("C4 · named arguments, and a repeated alias and an unknown end reported",
   card(m, "b").get("sublabel") == "Go" and (line(m, "a", "b") or {}).get("sublabel") == "gRPC" and [w for w, _ in un] == [3, 6], (m, un))
# audit 20: what a macro holds past what is read (a sprite, a link, a line's tags, an argument past the known ones) is said,
# never dropped silently; an end not written or blank is said so, never as None or an empty name
m, un = imp.read("plantuml", '@startuml\nPerson(u, "User", "A user", "person2", "VIP", "https://x")\nSystem(s, "Shop", $link="https://shop", $sprite="cart")\n'
                 'Rel(u, s, "Buys", "HTTPS", "via web", "sprite", "urgent", "https://y")\nSystem_Boundary(b, "B", $link="https://b") {\n}\n'
                 'Rel(u)\nRel(u, , "x")\nRel(, s)\nContainer(c, "C", "Go", "d", "", "", "", "", "ninth")\n@enduml\n', "x")
ok("C4 · a sprite, a link, a line's tags and an argument past the known ones are said; an end not written or blank is said so (audit 20)",
   un == [(2, "Person(u): $sprite=person2; $tags=VIP; $link=https://x are not imported"), (3, "System(s): $link=https://shop; $sprite=cart are not imported"),
          (4, "Rel(u, s): $sprite=sprite; $tags=urgent; $link=https://y are not imported"), (5, "System_Boundary(b): $link=https://b is not imported"),
          (5, "box b: holds no card, so it is not drawn"), (7, "Rel(u): it names no target"), (8, "Rel(u, ): its target is empty"),
          (9, "Rel(, s): its source is empty"), (10, "Container(c): argument 9 (ninth) is not imported")]
   and (line(m, "u", "s") or {}).get("what") == "via web" and "None" not in json.dumps(un), un)
m, un = imp.read("structurizr", 'workspace {\n model {\n  u = person "User"\n  s = softwareSystem "S"\n  u -> s "Uses" "HTTPS" "Async,Critical"\n'
                 '  s -> u "Tells" {\n   tags "Email"\n  }\n }\n}\n', "x")
ok("structurizr · a relationship's tags, inline or in its block, are said, and the line drawn (audit 20)",
   un == [(5, "u -> s: tags Async, Critical are not imported"), (6, "s -> u: tags Email are not imported")] and line(m, "u", "s") and line(m, "s", "u"), un)
# audit 32: two systems each holding api and db, and api -> db written inside each: the second was drawn between the first's
# cards. A line inside a block reads its identifiers from that block outwards; a bare alias two elements share, written
# outside them, names neither and is said; a full identifier and `this` still name their own
hier = ('workspace {\n !identifiers hierarchical\n model {\n  u = person "User"\n  a = softwareSystem "Shop" {\n   db = container "Shop DB"\n   api = container "Shop API"\n'
        '   api -> db "Reads"\n  }\n  b = softwareSystem "Billing" {\n   db = container "Billing DB"\n   api = container "Billing API" {\n    this -> db "Logs"\n   }\n'
        '   group "Inner" {\n    api -> db "Writes"\n   }\n  }\n  u -> a.api "Buys"\n  a.api -> b.api "Charges"\n  u -> api "Odd"\n }\n views {\n'
        '  container a "ShopC" {\n   include *\n  }\n  container b "BillC" {\n   include *\n  }\n }\n}\n')
m, un = imp.read("structurizr", hier, "x")
lbl = lambda a, b, v: sorted((e.get("label") or "") for e in m["edges"] if e["from"] == a and e["to"] == b and e["id"] in next(x for x in m["views"] if x["id"] == v).get("edges", []))
ok("structurizr · api -> db inside system b is b's api and db, in a group and by this too; a bare api two systems hold names neither, and is said (audit 32)",
   lbl("api", "db", "ShopC") == ["Reads"] and lbl("b-api", "b-db", "BillC") == ["Logs", "Writes"] and line(m, "u", "api") and (line(m, "u", "api") or {}).get("label") == "Buys"
   and any("api names a.api, b.api" in w for _, w in un) and not any(e.get("label") == "Odd" for e in m["edges"]), (un, [(e["from"], e["to"], e.get("label")) for e in m["edges"]]))
for flat in ("", " !identifiers flat\n"):  # a model with one api: its bare alias is its own, outside its block too, as before
    one = 'workspace {\n' + flat + ' model {\n  u = person "User"\n  s = softwareSystem "S" {\n   api = container "API"\n  }\n  u -> api "Uses"\n }\n}\n'
    m, un = imp.read("structurizr", one, "x")
    ok(f"structurizr · {'!identifiers flat: ' if flat else ''}a bare alias one element holds names it from outside its block (audit 32)", (line(m, "u", "api") or {}).get("label") == "Uses" and un == [], un)
# audit 33: a default view's scope is its card, never read as an identifier: with no views block, two systems each holding an
# api container with components drew only the second's component view (a bare api two elements share names neither)
dv = ('workspace {\n !identifiers hierarchical\n model {\n  u = person "User"\n  a = softwareSystem "Shop" {\n   api = container "Shop API" {\n'
      '    orders = component "Orders"\n    pay = component "Payments"\n    orders -> pay "charges"\n   }\n   db = container "Shop DB"\n   api -> db "reads"\n  }\n'
      '  b = softwareSystem "Billing" {\n   api = container "Billing API" {\n    inv = component "Invoices"\n   }\n  }\n  u -> a.api "buys"\n  a.api -> b.api "bills"\n }\n}\n')
m, un = imp.read("structurizr", dv, "x")
vs = {v["id"]: v for v in m["views"]}
ok("structurizr · no views block: both api containers' component views are drawn, each opened by its card (audit 33)",
   list(vs) == ["landscape", "a-containers", "api-components", "b-containers", "b-api-components"] and un == []
   and {"orders", "pay"} <= set(vs["api-components"]["nodeIds"]) and card(m, "api").get("opensView") == "api-components"
   and card(m, "b-api").get("opensView") == "b-api-components", (list(vs), un))
# audit 33: a container or component outside a software system (Structurizr refuses it) wrote a model with no views, which
# render refuses; with a person beside it, the card and its line were in no view and nothing said so
m, un = imp.read("structurizr", 'workspace {\n model {\n  api = container "api"\n  db = container "db"\n  api -> db "reads"\n }\n}\n', "x")
m2, un2 = imp.read("structurizr", 'workspace {\n model {\n  u = person "U"\n  api = container "api" {\n   c = component "c"\n  }\n  w = component "w"\n  u -> api "uses"\n }\n}\n', "x")
ok("structurizr · a container or component in no software system is said and not imported; no view is left with nothing said (audit 33)",
   m["nodes"] == [] and (3, "container api is in no software system: not imported (nor what it holds)") in un and (4, "container db is in no software system: not imported (nor what it holds)") in un
   and (None, "systemlandscape view: shows nothing, so it is left out") in un
   and [n["id"] for n in m2["nodes"]] == ["u"] and [v["nodeIds"] for v in m2["views"]] == [["u"]] and (7, "component w is in no container: not imported (nor what it holds)") in un2
   and (8, "u -> api: api is not an element") in un2, (un, un2))
# audit 34: the audit 33 refusal checked only for no holder; a component in a system, a container in a container, a component
# in a component, and a person or system in a system were read and drawn at the wrong level (Structurizr refuses each)
wrong = ('workspace {\n model {\n  u = person "User"\n  s = softwareSystem "Shop" {\n   c = component "Lonely"\n   api = container "API" {\n'
         '    inner = container "Inner"\n    comp = component "Comp" {\n     deep = component "Deep"\n    }\n   }\n   p = person "Clerk"\n'
         '   group "g" {\n    t = softwareSystem "Inner" {\n     x = container "X"\n    }\n   }\n  }\n  u -> api "calls"\n  u -> c "uses"\n }\n}\n')
m, un = imp.read("structurizr", wrong, "x")
ok("structurizr · an element written in the wrong kind of element is said with its line and not imported, nor what it holds (audit 34)",
   [n["id"] for n in m["nodes"]] == ["u", "s", "api", "comp"] and [v["id"] for v in m["views"]] == ["landscape", "s-containers", "api-components"]
   and un == [(5, "component c is in software system s, where a component cannot be: not imported (nor what it holds)"),
              (7, "container inner is in container s.api, where a container cannot be: not imported (nor what it holds)"),
              (9, "component deep is in component s.api.comp, where a component cannot be: not imported (nor what it holds)"),
              (12, "person p is in software system s, where a person cannot be: not imported (nor what it holds)"),
              (14, "softwareSystem t is in software system s, where a software system cannot be: not imported (nor what it holds)"),
              (20, "u -> c: c is not an element")], un)
# hostile tags (security, R2): a few elements with very long tag lists and many views with tag expressions were judged by
# lowering every element's tags again for each expression, which the work cap (counted in elements) did not see: 11.8 s at
# 850 KB. Each element's tags are now lowered once, so a tag expression costs at most its values per element
import time
tags = ",".join(f"t{i}" for i in range(14000))
dsl = ("workspace {\n model {\n" + "\n".join(f'  s{i} = softwareSystem "S{i}" "d" "{tags}"' for i in range(8))
       + "\n }\n views {\n" + "\n".join(f"  systemLandscape v{i} {{\n   include element.tag==x\n  }}" for i in range(2500)) + "\n }\n}\n")
t0 = time.perf_counter(); m, un = imp.read("structurizr", dsl, "hostile-tags"); took = time.perf_counter() - t0
ok("structurizr · views of tag expressions over elements with very long tag lists take under 3 s (each element's tags lowered once; audit 35, security)",
   took < 3 and len(dsl) < 1 << 20 and sum("element.tag==x: matches nothing" in t for _, t in un) == 2500, (round(took, 2), un[:3]))
# hostile names: a refused element's name and its holder's are said as text, never read as a path or markup
m, un = imp.read("structurizr", 'workspace {\n model {\n  s = softwareSystem "<img src=//e.example/t.png>" {\n   container "API" {\n    container "../../etc/passwd"\n   }\n  }\n }\n}\n', "x")
ok("structurizr · a refused element with no alias is said by its name, and a holder with none by its own (audit 34)",
   un == [(5, "container ../../etc/passwd is in container API, where a container cannot be: not imported (nor what it holds)")]
   and [n["label"] for n in m["nodes"]] == ["<img src=//e.example/t.png>", "API"], (un, m["nodes"]))
# audit 34: a view with an include list and no * showed every element of its level; Structurizr shows only what it includes
# (a system context view, its system too)
inc = ('workspace {\n model {\n  u = person "User"\n  a = softwareSystem "Shop" {\n   web = container "Web"\n   api = container "API" {\n'
       '    ctl = component "Controller"\n    repo = component "Repository"\n   }\n   db = container "DB"\n  }\n  b = softwareSystem "Billing"\n'
       '  c = softwareSystem "Warehouse"\n  u -> web "browses"\n  u -> ctl "calls"\n  web -> ctl "calls"\n  ctl -> repo "reads"\n  repo -> db "reads"\n  a -> b "bills"\n  a -> c "ships"\n }\n'
       ' views {\n  systemLandscape "money" {\n   include a b\n  }\n  systemContext a "ctx" {\n   include b\n  }\n  container a "focus" {\n   include api\n  }\n'
       '  component api "ctl" {\n   include u ctl\n  }\n  container a "all" {\n   include *\n  }\n  component api "every" {\n  }\n }\n}\n')
m, un = imp.read("structurizr", inc, "x")
vs = {v["id"]: v for v in m["views"]}
got = {k: (v["nodeIds"], sorted((e["from"], e["to"]) for e in m["edges"] if e["id"] in v["edges"])) for k, v in vs.items()}
ok("structurizr · an include list with no * shows only what it names, at each level; * and no include show the level (audit 34)",
   got == {"money": (["a", "b"], [("a", "b")]), "ctx": (["a", "b"], [("a", "b")]), "focus": (["api"], []), "ctl-components": (["u", "ctl"], [("u", "ctl")]),
           "all": (["u", "web", "api", "db"], [("api", "db"), ("u", "api"), ("u", "web"), ("web", "api")]),
           "every": (["u", "web", "ctl", "repo", "db"], [("ctl", "repo"), ("repo", "db"), ("u", "ctl"), ("u", "web"), ("web", "ctl")])} and un == [], (got, un))
# audit 35: the audit 34 rule started a view with no * from nothing, so a view whose include list held only expressions
# (element.type==Container, ->api->) showed nothing and was left out, and with every view left out the user's views gave way to
# generated ones; an expression now includes what it matches, as Structurizr reads it, and one not read here leaves the view
# as its scope shows it
ex = ('workspace {\n model {\n  u = person "User"\n  a = softwareSystem "Shop" {\n   web = container "Web" "" "" "Front"\n   api = container "API" {\n'
      '    ctl = component "Controller"\n    repo = component "Repository"\n   }\n   db = container "DB" "" "" "Store"\n  }\n  b = softwareSystem "Billing" "" "External"\n'
      '  c = softwareSystem "Warehouse"\n  u -> web "browses"\n  u -> ctl "calls"\n  web -> ctl "calls"\n  ctl -> repo "reads"\n  repo -> db "reads" "" "Slow"\n  a -> b "bills"\n  a -> c "ships"\n }\n'
      ' views {\n  container a "type" {\n   include element.type==Container\n  }\n  container a "both" {\n   include ->api->\n  }\n'
      '  container a "out" {\n   include api->\n  }\n  container a "in" {\n   include ->api\n  }\n  container a "tag" {\n   include element.tag==Front,Store\n  }\n'
      '  container a "parent" {\n   include element.parent==a\n   exclude element.tag==Store\n  }\n  container a "rel" {\n   include u -> api\n  }\n'
      '  container a "relall" {\n   include relationship==*\n   exclude relationship.tag==Slow\n  }\n'
      '  container a "and" {\n   include "element.type==Container && element.tag!=Front"\n  }\n  container a "unread" {\n   include element.properties[x]==y\n  }\n'
      '  systemLandscape "land" {\n   include element.type==SoftwareSystem\n   exclude element.tag==External\n  }\n  systemLandscape "none" {\n   include element.type==Container\n  }\n'
      '  component api "comp" {\n   include ->ctl->\n  }\n  container a "hostile" {\n   include "<img src=//e.example/t.png>" ../../etc/passwd "element.tag==<script>" ->db\n  }\n }\n}\n')
m, un = imp.read("structurizr", ex, "x")
got = {v["id"]: (v["nodeIds"], sorted((e["from"], e["to"]) for e in m["edges"] if e["id"] in v["edges"])) for v in m["views"]}
ok("structurizr · an include list of expressions shows what they match: element.type, element.tag, element.parent, ->x->, a -> b, relationship, && (audit 35)",
   got == {"type": (["web", "api", "db"], [("api", "db"), ("web", "api")]),
           "both": (["u", "web", "api", "db"], [("api", "db"), ("u", "api"), ("u", "web"), ("web", "api")]),
           "out": (["api", "db"], [("api", "db")]), "in": (["u", "web", "api"], [("u", "api"), ("u", "web"), ("web", "api")]),
           "tag": (["web", "db"], []), "parent": (["web", "api"], [("web", "api")]), "rel": (["u", "api"], [("u", "api")]),
           "relall": (["u", "web", "api", "db"], [("u", "api"), ("u", "web"), ("web", "api")]), "and": (["api", "db"], [("api", "db")]),
           "unread": (["web", "api", "db"], [("api", "db"), ("web", "api")]), "land": (["a", "c"], [("a", "c")]),
           "comp": (["u", "web", "ctl", "repo"], [("ctl", "repo"), ("u", "ctl"), ("u", "web"), ("web", "ctl")]),
           "hostile": (["web", "api", "db"], [("api", "db"), ("web", "api")])}
   and [x for x in un if x[0] != 18] == [(53, "include element.properties[x]==y: an expression umlimator does not read, so the view shows its scope's elements"),
                                        (59, "systemlandscape view none: shows nothing, so it is left out"), (60, "include element.type==Container: matches nothing this view shows"),
                                        (66, "include <img src=//e.example/t.png>: an expression umlimator does not read, so the view shows its scope's elements"),
                                        (66, "include ../../etc/passwd: an expression umlimator does not read, so the view shows its scope's elements"),
                                        (66, "include element.tag==<script>: matches nothing this view shows")]
   and not any("e.example" in str(n.get("icon") or "") for n in m["nodes"]), (got, un))
# a workspace whose only views are expressions keeps them: their keys and titles, not the generated set
m, un = imp.read("structurizr", 'workspace {\n model {\n  u = person "User"\n  s = softwareSystem "Shop" {\n   web = container "Web"\n   api = container "API"\n   db = container "DB"\n  }\n'
                 '  u -> web "uses"\n  web -> api "calls"\n  api -> db "reads"\n }\n views {\n  container s {\n   include element.type==Container\n  }\n'
                 '  container s "Second" {\n   title "Around the API"\n   include ->api->\n  }\n }\n}\n', "x")
ok("structurizr · views that include only expressions are the workspace's views, not the generated ones (audit 35)",
   [(v["id"], v["title"], v["nodeIds"]) for v in m["views"]] == [("s-containers", "Shop containers", ["web", "api", "db"]), ("Second", "Around the API", ["web", "api", "db"])] and un == [],
   (m["views"], un))
# audit 36: ->x, x-> and ->x-> on x's own view counted a line between two of x's members (web -> api) as x's coupling, and
# element.parent==a, b (a space after the comma) was not read, though element.type and element.tag strip each value
ex = ('workspace {\n model {\n  u = person "User"\n  s = softwareSystem "Shop" {\n   web = container "Web"\n   api = container "API"\n   db = container "DB"\n  }\n'
      '  t = softwareSystem "<img src=//e.example/t.png>"\n  u -> web "uses"\n  web -> api "calls"\n  api -> db "reads"\n  api -> t "sends"\n }\n views {\n'
      '  container s "in" {\n   include ->s\n  }\n  container s "out" {\n   include s->\n  }\n  container s "both" {\n   include ->s->\n  }\n'
      '  container s "notin" {\n   include *\n   exclude ->s\n  }\n  container s "around" {\n   include ->api->\n  }\n'
      '  container s "tight" {\n   include *\n   exclude "element.parent==s,t"\n  }\n  container s "spaced" {\n   include *\n   exclude "element.parent==s, t"\n  }\n'
      '  container s "trail" {\n   include *\n   exclude "element.parent== s ,  t ,"\n  }\n  container s "nothing" {\n   include *\n   exclude "element.parent==s, ../../etc/passwd"\n  }\n }\n}\n')
m, un = imp.read("structurizr", ex, "x")
got = {v["id"]: (v["nodeIds"], sorted((e["from"], e["to"]) for e in m["edges"] if e["id"] in v["edges"])) for v in m["views"]}
ok("structurizr · ->x, x-> and ->x-> leave out lines between x's own members; element.parent==a, b reads as a,b (audit 36)",
   got == {"in": (["u"], []), "out": (["t"], []), "both": (["u", "t"], []), "notin": (["web", "api", "db", "t"], [("api", "db"), ("api", "t"), ("web", "api")]),
           "around": (["web", "api", "db", "t"], [("api", "db"), ("api", "t"), ("web", "api")]),
           "tight": (["u", "t"], []), "spaced": (["u", "t"], []), "trail": (["u", "t"], []),
           "nothing": (["u", "web", "api", "db", "t"], [("api", "db"), ("api", "t"), ("u", "web"), ("web", "api")])}
   and [x[1] for x in un if "does not read" in x[1]] == ["exclude element.parent==s, ../../etc/passwd: an expression umlimator does not read"]
   and not any("e.example" in str(n.get("icon") or "") for n in m["nodes"]), (got, un))
# audit 38: a name holding "->" was kept as a card or box id, which names lines by position, so validate() refused the model
arrows = {
    "compose": imp.read("compose", json.dumps({"services": {"web->api": {"image": "nginx", "depends_on": ["web-api", "db"], "networks": ["a->b"]}, "web-api": {},
                                                            "db": {"image": "postgres", "networks": ["c"]}}}), "x"),
    "kubernetes": imp.read("kubernetes", json.dumps([{"kind": "Deployment", "metadata": {"name": "a->b"}, "spec": {"template": {"metadata": {"labels": {"x": "1"}}}}},
                                                     {"kind": "Service", "metadata": {"name": "s->>t"}, "spec": {"selector": {"x": "1"}}}]), "x"),
    "plantuml": imp.read("plantuml", '@startuml\nPerson("u->v", "User")\nSystem(u-v, "Taken")\nSystem_Boundary("b->c", "B") {\nSystem(t, "T")\n}\n'
                                     'Rel("u->v", t, "uses")\nRel(u-v, "b->c", "in")\nRel("x->y", t)\n@enduml\n', "x"),
    "mermaid": imp.read("mermaid", 'C4Context\n  Person(u->v, "User")\n  System(s, "S")\n  Rel(u->v, s, "uses")\n', "x"),
}
got = {k: ([n["id"] for n in m["nodes"]], sorted((e["from"], e["to"]) for e in m["edges"]), [c["id"] for v in m["views"] for c in v.get("containers", [])], un)
       for k, (m, un) in arrows.items()}
ok('compose, kubernetes, C4-PlantUML, Mermaid C4 · a name with "->" is an id with "-", said, and its lines still join it (audit 38)',
   got == {"compose": (["web-api", "web-api-2", "db"], [("web-api", "db"), ("web-api", "web-api-2")], ["network-a-b", "network-c", "network-default"],
                       [("networks.a->b", 'network-a->b: an id holds no "->", so it is network-a-b'),
                        ("services.web->api", 'web->api: an id holds no "->", so it is web-api'), ("services.web-api", "web-api: the id is taken, so it is web-api-2")]),
           "kubernetes": (["deploy-a-b", "svc-s-t"], [("svc-s-t", "deploy-a-b")], [],
                          [("[0]", 'deploy-a->b: an id holds no "->", so it is deploy-a-b'), ("[1]", 'svc-s->>t: an id holds no "->", so it is svc-s-t')]),
           "plantuml": (["u-v", "u-v-2", "t"], [("u-v", "t"), ("u-v-2", "b-c")], ["b-c"],
                        [(2, 'u->v: an id holds no "->", so it is u-v'), (3, "u-v: the id is taken, so it is u-v-2"), (4, 'b->c: an id holds no "->", so it is b-c'),
                         (9, "Rel(x->y, t): x->y is not defined")]),
           "mermaid": (["u-v", "s"], [("u-v", "s")], [], [(2, 'u->v: an id holds no "->", so it is u-v')])}
   and all(not [p for p in u.js("validate", {**m, "schemaVersion": 2}) if p["level"] == "error"] for m, _ in arrows.values()), got)
# audit 38: a C4-PlantUML property table, a Mermaid C4 diagram's accessibility text and a workspace's description were dropped unsaid
said = [imp.read("plantuml", '@startuml\nSetPropertyHeader("Field", "Value")\nAddProperty("Owner", "Team Payments")\nWithoutPropertyHeader()\n'
                             'Container(api, "API", "Java")\nAddElementTag("v1")\nLay_R(api, api)\n@enduml\n', "x")[1],
        imp.read("mermaid", 'C4Context\n  accTitle: The shop\n  accDescr: How <img src=//e.example/x.png> shoppers reach it\n  Person(u, "User")\n', "x")[1],
        imp.read("structurizr", 'workspace "Shop" "What the shop does" {\n  description "Longer"\n  model {\n    u = person "User"\n  }\n}\n', "x")[1]]
ok("C4-PlantUML, Mermaid C4, Structurizr · property tables, accessibility text and a workspace's description are said, not dropped (audit 38)",
   said == [[(2, 'SetPropertyHeader("Field", "Value"): an element\'s properties are not imported'),
             (3, 'AddProperty("Owner", "Team Payments"): an element\'s properties are not imported'), (4, "WithoutPropertyHeader(): an element's properties are not imported")],
            [(2, "accTitle: accessibility text is not imported"), (3, "accDescr: accessibility text is not imported")],
            [(1, "the workspace's description is not imported"), (2, "the workspace's description is not imported")]], said)
# audit 33: a Mermaid C4Dynamic or C4Deployment is a C4 diagram umlimator does not read, and is said as one
said = [imp.read("mermaid", f'{h}\n  title T\n  Container(c1, "A")\n  Container(c2, "B")\n  Rel(c1, c2, "Reads")\n', "x")[1] for h in ("C4Dynamic", "C4Deployment")]
ok("mermaid · C4Dynamic and C4Deployment are named as Mermaid C4 diagrams that are not read, not as 'not a C4 diagram' (audit 33)",
   said == [[(1, f"{h}: a Mermaid C4 diagram umlimator does not read (C4Context, C4Container and C4Component are): nothing imported")] for h in ("C4Dynamic", "C4Deployment")]
   and imp.detect("x.txt", "C4Dynamic\n") == "mermaid", said)
m, un = imp.read("mermaid", 'flowchart LR\n  A:::warn --> B\n  D & F:::y --> E:::x\n  A -->|"yes | no"| C\n  A -->|plain| D\n', "x")
ok("mermaid · a :::class is said, as the typed reader says it; a quoted pipe text may hold | (audit 20)",
   un == [(2, "A:::warn: a style class is not imported"), (3, "F:::y: a style class is not imported"), (3, "E:::x: a style class is not imported")]
   and (line(m, "A", "C") or {}).get("label") == "yes | no" and (line(m, "A", "D") or {}).get("label") == "plain" and line(m, "F", "E"), (un, m["edges"]))
dsl = 'workspace "Shop" {\n  model {\n    u = person "User"\n    s = softwareSystem "Shop" {\n      w = container "Web"\n    }\n    u -> w "Uses"\n  }\n}\n'
m, un = imp.read("structurizr", dsl, "x")
ok("structurizr · no views: a landscape and a view per system, the line implied where its end is inside",
   [(v["id"], v.get("parent"), v["edges"]) for v in m["views"]] == [("landscape", None, ["u-s"]), ("s-containers", "landscape", ["u-w"])], m["views"])
m, un = imp.read("structurizr", dsl.replace("model {", "!impliedRelationships false\n  model {"), "x")
ok("structurizr · !impliedRelationships false draws no implied line", m["views"][0]["edges"] == [], m["views"])
for typo in ("systemContext shop {\n include *\n }", "container nope {\n }", "systemLandscape {\n exclude u\n exclude s\n }"):
    m, un = imp.read("structurizr", dsl.replace("  }\n}\n", f"  }}\n  views {{\n {typo}\n  }}\n}}\n"), "x")
    ok(f"structurizr · every view left out ({typo.split(chr(10))[0]}): the landscape and a view per system, as for no views, and said (audit 19)",
       [v["id"] for v in m["views"]] == ["landscape", "s-containers"] and any("no view in the workspace is drawn" in w for _, w in un), (m["views"], un))
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
ok("C4 · a tag's $shape is said, not drawn (and a system's tags, which change nothing, audit 21)",
   un == [(2, 'AddElementTag(v2): $shape=EightSidedShape() is not imported'), (4, 'System(a): $tags=v2 is not imported')], un)
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

n = 2000  # audit 12: every `include *` view listed every element and walked every relationship: views x elements, uncapped
t0 = time.time()
m, un = imp.read("structurizr", "workspace {\nmodel {\n" + "".join(f'p{i} = person "p"\n' for i in range(n)) + "".join(f"p{i} -> p{i + 1}\n" for i in range(n - 1))
                 + "}\nviews {\n" + "systemLandscape {\ninclude *\n}\n" * n + "}\n}\n", "x")
ok("hostile · 2000 views of 2000 people stop at the work cap, said once, in bounded time",
   len(m["views"]) < 300 and len(un) == 1 and "the rest are left out" in un[0][1] and time.time() - t0 < 10, (len(m["views"]), un[:2], time.time() - t0))

n = imp.fnode('A[x] --> B["y', 9)  # audit 4: an unclosed quote found A's ], went back, and matched the link forever
ok("hostile · a label's unclosed quote after an earlier ] is said, not imported, and ends", n[3] >= 9
   and imp.read("mermaid", 'flowchart TD\n  A[x] --> B["y', "x")[1] == [(2, 'not imported: A[x] --> B["y')], n)

def quick(fmt, text):  # (model, unread, seconds)
    t0 = time.time()
    return (*imp.read(fmt, text, "x"), time.time() - t0)
m, un, dt = quick("mermaid", "flowchart\na --" + " " * 3000 + "x")  # audit 2: \s* [^|]+? \s* backtracked cubically
ok("hostile · a link's text of 3000 spaces and no close is said, not imported, in linear time", un == [(2, "not imported: a -- x")] and dt < 2, (un, dt))
m, un, dt = quick("plantuml", "@startuml\nPerson(a, x" + " " * 100000 + "y)\n@enduml")  # audit 2: a lazy argument retried its end at each space
ok("hostile · a C4 macro argument of 100000 spaces reads in linear time", card(m, "a")["label"].split() == ["x", "y"] and dt < 2, dt)
# audit 3: a subgraph label's \s* (.*?) \s* backtracked cubically; a ; split by a lookahead, a .-close retried along a run of
# dots and a lazy /* */ in detect() were quadratic; a DSL element's id grew with its depth
# audit 11: each node's missing closer searched the rest of the line again; a statement remembers its misses (as mfStatement)
m, _, dt = quick("mermaid", "flowchart TD\n" + " --> ".join(f"A{k}[/x/]" for k in range(64000)))
m2, _, dt2 = quick("mermaid", "flowchart TD\n" + "& ".join(f"A{k}(((x) " for k in range(72000)) + " --> Z")
ok("hostile · a 1 MB line of [/x/] nodes, or of (((x) nodes, with no closer reads in linear time",
   len(m["nodes"]) == 64000 and len(m2["nodes"]) == 72001 and dt < 8 and dt2 < 8, (dt, dt2))
_, un, dt = quick("mermaid", "flowchart\nsubgraph a[" + " " * 100000 + "x\nend")
ok("hostile · a subgraph's unclosed [ and 100000 spaces read in linear time", dt < 1, dt)
_, _, dt = quick("mermaid", "flowchart\na -- " + "." * 1000000 + "x")
ok("hostile · a link's text of 1000000 dots reads in linear time", dt < 2, dt)
m, _, dt = quick("mermaid", "flowchart\na-->b" + ';"' * 400000 + "\nc-->d;e-->f")
ok("hostile · a line of 400000 ;\" pairs splits in linear time, and ; outside quotes still splits", dt < 3 and line(m, "e", "f"), dt)
t0 = time.time()
ok("hostile · detect() reads 400000 unclosed /* and 1000000 blank lines in linear time",
   imp.detect("x", "/*" * 400000) is None and imp.detect("x", "\n" * 1000000 + "x") is None and time.time() - t0 < 1, time.time() - t0)
# in a software system: a container outside one is not imported (audit 33), nor one in a container (audit 34), nor what it holds
m, un, dt = quick("structurizr", "workspace {\nmodel {\ns = softwareSystem \"s\" {\n" + 'abcdefghij = container "x" {\n' * 30000 + "}\n" * 30001 + "}\n}\n")
ok("hostile · 30000 nested DSL containers: the one in the system is read, the one in it said, what that holds skipped, in linear time",
   [n["id"] for n in m["nodes"]] == ["s", "abcdefghij"] and dt < 5
   and un == [(5, "container abcdefghij is in container s.abcdefghij, where a container cannot be: not imported (nor what it holds)")], (dt, un[:2]))
_, _, dt = quick("kubernetes", json.dumps({"kind": "Ingress", "metadata": {"name": "i"}, "spec": {"rules": [{"host": f"h{i}", "http": {"paths": [{"path": "/"}]}} for i in range(18000)]}}))
ok("hostile · an Ingress of 18000 rules reads in linear time (its hosts counted once)", dt < 3, dt)
m, _, dt = quick("kubernetes", json.dumps([{"kind": "Service", "metadata": {"name": f"s{i}"}, "spec": {"selector": {"app": f"a{i}"}}} for i in range(3000)]
                                         + [{"kind": "Deployment", "metadata": {"name": f"d{i}"}, "spec": {"template": {"metadata": {"labels": {"app": f"a{i}"}}}}} for i in range(3000)]))
ok("hostile · 3000 Services selecting 3000 workloads read in linear time, each to its own", len(m["edges"]) == 3000 and line(m, "svc-s2999", "deploy-d2999") and dt < 1, dt)
# audit 45: Services by workloads is a product: 1500 Services all selecting app=x drew 2.25 million lines (1.7 GB); a selector
# whose labels each match half the workloads and together none checked every Service against half of them
W = lambda i, lab: {"kind": "Deployment", "metadata": {"name": f"d{i}"}, "spec": {"template": {"metadata": {"labels": lab}}}}
S = lambda i, sel: {"kind": "Service", "metadata": {"name": f"s{i}"}, "spec": {"selector": sel}}
m, un, dt = quick("kubernetes", json.dumps([W(i, {"app": "x"}) for i in range(1500)] + [S(i, {"app": "x"}) for i in range(1500)]))
ok("hostile · 1500 Services each selecting the same 1500 workloads: lines stop at FLOWS, said once, in bounded time",
   len(m["edges"]) == imp.FLOWS and dt < 5 and [u for u in un if "over" in u[1]] == [("[1566]", f"over {imp.FLOWS} lines from Services to the workloads they select: the rest are not imported")],
   (len(m["edges"]), dt, un[:3]))
m, un, dt = quick("kubernetes", json.dumps([W(i, {"a": "x"} if i % 2 else {"b": "y"}) for i in range(4000)] + [S(i, {"a": "x", "b": "y"}) for i in range(4000)]))
ok("hostile · 4000 Services whose two labels each match 2000 workloads and together none: checks stop at SELECTS, said once",
   m["edges"] == [] and dt < 5 and len(un) == 1 and un[0][1] == f"over {imp.SELECTS} workloads checked against Service selectors: the rest of their lines are not imported",
   (dt, un[:3]))
m, un, _ = quick("kubernetes", json.dumps([W(0, {"app": "a", "tier": "web"}), W(1, {"app": "a", "tier": "db"}), W(2, {"tier": "web"}),
                                           S(0, {"app": "a", "tier": "web"}), S(1, {"tier": "web"}), S(2, {"app": "a"})]))
ok("kubernetes · a Service selects every workload whose labels hold all of its selector, by its rarest label, in file order",
   [(e["from"], e["to"]) for e in m["edges"]] == [("svc-s0", "deploy-d0"), ("svc-s1", "deploy-d0"), ("svc-s1", "deploy-d2"),
                                                ("svc-s2", "deploy-d0"), ("svc-s2", "deploy-d1")] and un == [], (m["edges"], un))
m, _, dt = quick("compose", json.dumps({"services": {f"s{i}": {"networks": [f"n{i % 2}" if i < 4 else f"n{i}"]} for i in range(20000)}}))
ok("hostile · 20000 compose services on their own networks read in linear time", dt < 3 and m["views"][0]["containers"][0]["nodeIds"] == ["s0", "s2"], dt)
m, un, _ = quick("compose", json.dumps({"services": {}, "x": " " * imp.LIMIT}))
ok("hostile · compose or Kubernetes JSON over 1 MiB is not read", m["nodes"] == [] and "over the limit of 1048576" in un[0][1], un)
env = [("PG", "jdbc:postgresql://postgres:5432/orders"), ("MY", "jdbc:mysql://u:pw@mysql.shop.svc.cluster.local:3306/x"),
       ("MS", "jdbc:sqlserver://mssql:1433;databaseName=orders"), ("ORA", "jdbc:oracle:thin:@//oracle:1521/ORCL"),
       ("CACHE", "redis://cache:6379"), ("SEMI", "cache;x"), ("ASK", "cache?x"), ("MEM", "jdbc:h2:mem:cache")]
k8s = [{"kind": "Deployment", "metadata": {"name": "orders", "namespace": "shop"},
        "spec": {"template": {"spec": {"containers": [{"name": "o", "env": [{"name": n, "value": v} for n, v in env]}]}}}}] + [
       {"kind": "Service", "metadata": {"name": n, "namespace": "shop"}, "spec": {"selector": {"app": n}}} for n in ("postgres", "mysql", "mssql", "oracle", "cache")]
m, un = imp.read("kubernetes", json.dumps(k8s), "x")
ok("kubernetes · a JDBC URL in an env value names its Service: a scheme of words joined by colons, ; or ? after it (audit 18); "
   "a bare word with ; or ? and a URL with no host name nothing",
   sorted((e["to"], e.get("label")) for e in m["edges"] if e["from"] == "deploy-orders")
   == [("svc-cache", "CACHE"), ("svc-mssql", "MS"), ("svc-mysql", "MY"), ("svc-oracle", "ORA"), ("svc-postgres", "PG")], (ends(m), un))
k8s = [{"kind": "Deployment", "metadata": {"name": "api"}, "spec": {"template": {"spec": {"containers": [{"name": "a", "env": [
        {"name": n, "value": v} for n, v in (("SID", "jdbc:oracle:thin:@ora:1521:ORCL"), ("SVC", "jdbc:oracle:thin:@ora2:1521/orders"),
                                             ("MONGO", "mongodb://mongo-0.mongo:27017,mongo-1.mongo:27017/?replicaSet=rs0"))]}]}}}}] + [
       {"kind": "Service", "metadata": {"name": n}, "spec": {"selector": {"app": n}}} for n in ("ora", "ora2", "mongo", "mongo-0")]
m, un = imp.read("kubernetes", json.dumps(k8s), "x")
ok("kubernetes · an Oracle thin URL with its host after a bare @ names its Service, ending in :SID or /service (audit 19); "
   "a list of hosts names none",
   sorted((e["to"], e.get("label")) for e in m["edges"] if e["from"] == "deploy-api") == [("svc-ora", "SID"), ("svc-ora2", "SVC")], (ends(m), un))
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
# audit 27: a service named "" became a card with no id and a line with no end (the blank values were dropped unsaid), a
# model validate() refuses; a blank name is said and not imported, as is a dependency on it
m, un = imp.read("compose", json.dumps({"services": {"": {"image": "y"}, " ": {}, "web": {"image": "nginx", "depends_on": ["", " "]}, "0": {}}}), "x")
ok("hostile · compose services named \"\" or blank are said and not imported, and the model validates (audit 27)",
   sorted(n.get("id", "?") for n in m["nodes"]) == ["0", "web"] and m["edges"] == [] and m["views"][0]["nodeIds"] == ["web", "0"]
   and ("services.''", "a service with no name: not imported") in un and ("services.' '", "a service with no name: not imported") in un
   and ("services.web", "depends on '', which is not a service here") in un and ("services.web", "depends on ' ', which is not a service here") in un
   and u.js("validate", m) == [], (m, un))

# audit 21: an owned Pod or ReplicaSet was skipped whether or not its workload was in the file, so `kubectl get pods,svc`
# lost every Pod with no message; it is said unless its owners lead to a workload the file holds
pod = lambda n, kind, owner, ns="default": {"kind": kind, "metadata": {"name": n, "namespace": ns, "ownerReferences": [{"kind": owner[0], "name": owner[1], "controller": True}]}}
k8s = [pod("api-7d9c-x", "Pod", ("ReplicaSet", "api-7d9c")), pod("db-0", "Pod", ("StatefulSet", "db")),
       pod("web-5f-y", "Pod", ("ReplicaSet", "web-5f")), pod("web-5f", "ReplicaSet", ("Deployment", "web")),
       {"kind": "Deployment", "metadata": {"name": "web"}, "spec": {"template": {"metadata": {"labels": {"app": "web"}}}}},
       pod("job-1-z", "Pod", ("Job", "job-1")), pod("old-rs", "ReplicaSet", ("Deployment", "gone"), ns="shop"),
       {"kind": "Service", "metadata": {"name": "api"}, "spec": {"selector": {"app": "api"}}}]
m, un = imp.read("kubernetes", json.dumps(k8s), "x")
ok("kubernetes · an owned Pod or ReplicaSet whose workload is not in the file is said, one whose Deployment is drawn is not (audit 21)",
   [n["id"] for n in m["nodes"]] == ["deploy-web", "svc-api"] and un == [
       ("[0]", "Pod api-7d9c-x: owned by ReplicaSet api-7d9c, which is not in the file: not imported (export its workload too, a Deployment, StatefulSet or DaemonSet)"),
       ("[1]", "Pod db-0: owned by StatefulSet db, which is not in the file: not imported (export its workload too, a Deployment, StatefulSet or DaemonSet)"),
       ("[5]", "Pod job-1-z: owned by Job job-1 (not in the file), which is not imported"),
       ("[6]", "ReplicaSet old-rs: owned by Deployment gone, which is not in the file: not imported (export its workload too, a Deployment, StatefulSet or DaemonSet)")], un)
k8s = [pod("a", "ReplicaSet", ("ReplicaSet", "b")), pod("b", "ReplicaSet", ("ReplicaSet", "a")), pod("p", "Pod", ("ReplicaSet", "a")),
       {"kind": "Pod", "metadata": {"name": "q", "ownerReferences": [None, {"kind": 5}, "x"]}}]
m, un = imp.read("kubernetes", json.dumps(k8s), "x")
ok("hostile · owners in a circle, or owner references of odd shapes, are said and end",
   len(un) == 4 and un[2][1].startswith("Pod p: owned by ReplicaSet a") and un[2][1].endswith(", which is not imported")
   and "owned by an owner reference that names no kind and name" in un[3][1], un)
# audit 22: a Pod whose owners are all in the file, ending at a kind not imported (a Job's CronJob), was told to export a
# Deployment, StatefulSet or DaemonSet the cluster does not have
k8s = [{"kind": "CronJob", "metadata": {"name": "nightly"}}, pod("nightly-1", "Job", ("CronJob", "nightly")),
       pod("nightly-1-abc", "Pod", ("Job", "nightly-1")), {"kind": "Job", "metadata": {"name": "once"}}, pod("once-x", "Pod", ("Job", "once")),
       pod("lost-x", "Pod", ("Job", "lost")), pod("half", "Job", ("CronJob", "gone")), pod("half-x", "Pod", ("Job", "half")),
       pod("web-1", "ReplicaSet", ("Deployment", "web")), pod("web-1-x", "Pod", ("ReplicaSet", "web-1")),
       {"kind": "Deployment", "metadata": {"name": "web"}, "spec": {"template": {"metadata": {"labels": {"app": "web"}}}}}]
m, un = imp.read("kubernetes", json.dumps(k8s), "x")
ok("kubernetes · a Pod whose owners are in the file but end at a kind not imported (a Job, a CronJob) is not told to export a Deployment (audit 22)",
   [n["id"] for n in m["nodes"]] == ["deploy-web"] and [u for u in un if "Pod" in u[1]] == [
       ("[2]", "Pod nightly-1-abc: owned by Job nightly-1 (CronJob nightly), which is not imported"),
       ("[4]", "Pod once-x: owned by Job once, which is not imported"),
       ("[5]", "Pod lost-x: owned by Job lost (not in the file), which is not imported"),
       ("[7]", "Pod half-x: owned by Job half (CronJob gone, not in the file), which is not imported")], un)
# audit 23: a chain that leaves the file at a kind not imported (a Job's CronJob, as `kubectl get jobs,pods` writes it) was
# told to export a Deployment, StatefulSet or DaemonSet; one that leaves it at a workload or a ReplicaSet still is
k8s = [pod("nightly-123", "Job", ("CronJob", "nightly"), ns="ops"), pod("nightly-123-abcde", "Pod", ("Job", "nightly-123"), ns="ops"),
       pod("api-7d9c", "ReplicaSet", ("Deployment", "api")), pod("api-7d9c-x", "Pod", ("ReplicaSet", "api-7d9c")),
       pod("rs-x", "Pod", ("ReplicaSet", "rs")), pod("rs", "ReplicaSet", ("ReplicaSet", "rs0")), pod("w", "Pod", ("Workflow", "wf")),
       pod("wf-1", "Job", ("Workflow", "wf")), pod("wf-1-x", "Pod", ("Job", "wf-1"))]
m, un = imp.read("kubernetes", json.dumps(k8s), "x")
ok("kubernetes · a Pod whose owner chain leaves the file at a kind not imported says so, naming that owner (audit 23)",
   [u for u in un if u[1].startswith("Pod")] == [
       ("[1]", "Pod nightly-123-abcde: owned by Job nightly-123 (CronJob nightly, not in the file), which is not imported"),
       ("[3]", "Pod api-7d9c-x: owned by ReplicaSet api-7d9c, whose workload is not in the file: not imported (export its workload too, a Deployment, StatefulSet or DaemonSet)"),
       ("[4]", "Pod rs-x: owned by ReplicaSet rs, whose workload is not in the file: not imported (export its workload too, a Deployment, StatefulSet or DaemonSet)"),
       ("[6]", "Pod w: owned by Workflow wf (not in the file), which is not imported"),
       ("[8]", "Pod wf-1-x: owned by Job wf-1 (Workflow wf, not in the file), which is not imported")], un)
# audit 23: a workload scaled to zero lost its count on the card (`if n` read 0 as none); a count that is no whole number is not said
dep = lambda n, r: {"kind": "Deployment", "metadata": {"name": n}, "spec": {"replicas": r}}
m, un = imp.read("kubernetes", json.dumps([dep("a", 0), dep("b", 1), dep("c", 3), dep("d", None), dep("e", True), dep("f", "x"), {"kind": "StatefulSet", "metadata": {"name": "g"}, "spec": {"replicas": 0}}]), "x")
ok("kubernetes · replicas 0 is said on the card as 0 replicas, as 1 and 3 are; none, true or text is not said (audit 23)",
   [n.get("what") for n in m["nodes"]] == ["0 replicas.", "1 replica.", "3 replicas.", None, None, None, "0 replicas."], [n.get("what") for n in m["nodes"]])
# audit 23: the map importer read the header flowchart-elk as flowchart and "-elk LR" as a statement it could not read
for head in ["flowchart-elk LR", "flowchart-elk TD;", "flowchart-elk", "flowchart LR", "graph TD"]:
    m, un = imp.read("mermaid", head + "\n  A --> B\n", "x")
    ok(f"mermaid · the header {head!r} is read, and nothing reported (audit 23)", un == [] and [n["id"] for n in m["nodes"]] == ["A", "B"] and len(m["edges"]) == 1, (un, m))
m, un = imp.read("mermaid", "flowchart-elkish LR\n  A --> B\n", "x")
ok("mermaid · a header that only starts like flowchart-elk is not read as one", un != [], un)
m, un, dt = quick("kubernetes", json.dumps([pod(f"r{i}", "ReplicaSet", ("ReplicaSet", f"r{i + 1}")) for i in range(6000)]))
ok("hostile · a chain of 6000 ReplicaSets, each owned by the next, reads in linear time", len(un) == 6000 and dt < 1, dt)

# audit 21: System_, Container_ and Enterprise_Boundary take $tags third (only Boundary a $type), so the report named the
# wrong argument; a Person's, a System's, a Db, Queue or _Ext element's tags were dropped with no message
m, un = imp.read("plantuml", "\n".join(['Person(u, "User", "d", $tags="vip")', 'System(s, "Shop", "d", "", "legacy")',
                                        'ContainerDb(db, "DB", "pg", "d", $tags="critical")', 'Person_Ext(p, "P", "d", $tags="ext")',
                                        'Container(api, "API", "Go", "d", "", "database")',
                                        'System_Boundary(b1, "B1", "v2", "https://wiki/b1") {', 'Container(w, "W", "Go")', '}',
                                        'Container_Boundary(b2, "B2", "legacy") {', 'Container(w2, "W2", "Go")', '}',
                                        'Enterprise_Boundary(b3, "B3", "t", "l", "about", "extra") {', 'Person(u3, "U3")', '}',
                                        'Boundary(b4, "B4", "type", "tags") {', 'Person(u4, "U4")', '}']), "x")
ok("C4 · each boundary's arguments by its own signature, and tags said wherever they change nothing (audit 21)",
   un == [(1, "Person(u): $tags=vip is not imported"), (2, "System(s): $tags=legacy is not imported"),
          (3, "ContainerDb(db): $tags=critical is not imported"), (4, "Person_Ext(p): $tags=ext is not imported"),
          (6, "System_Boundary(b1): $tags=v2; $link=https://wiki/b1 are not imported"), (9, "Container_Boundary(b2): $tags=legacy is not imported"),
          (12, "Enterprise_Boundary(b3): $tags=t; $link=l; $descr=about; argument 6 (extra) are not imported"),
          (15, "Boundary(b4): $type=type; $tags=tags are not imported")]
   and card(m, "api")["kind"] == "database", un)

# audit 21: a description, a relationship's and a view's were cut at 600 and 200 characters with no message
long = " ".join(f"word{i}" for i in range(200))
m, un = imp.read("structurizr", f'workspace {{\nmodel {{\na = softwareSystem "A" "{long}"\nb = softwareSystem "{long}"\na -> b "{long}"\n}}\n'
                 f'views {{\nsystemLandscape {{\ninclude *\ndescription "{long}"\n}}\n}}\n}}\n', "x")
ok("import · a long description, label and view description are whole in the details panel and caption (audit 21)",
   card(m, "a").get("what") == long and card(m, "b").get("what") == long and line(m, "a", "b").get("what") == long
   and m["views"][0].get("caption") == long and un == [], (un, [len(card(m, "a").get("what", ""))]))
m, un = imp.read("plantuml", f'Person(u, "U", "{long}")\nSystem(s, "S")\nRel(u, s, "uses", "", "{long}")', "x")
ok("C4 · a long $descr is whole in the details panel, a card's and a line's (audit 21)", card(m, "u").get("what") == long and line(m, "u", "s").get("what") == long, un)
# audit 24: Structurizr compares identifiers ignoring case (IdentifiersRegister); the importer matched them exactly, so a
# relationship, an include and a view's scope written in another case were dropped
DSL24 = """workspace {
  model {
    Customer = person "Customer"
    shop = softwareSystem "Shop" {
      webApp = container "Web app"
      DB = container "Database"
    }
    other = softwareSystem "Other"
    customer -> webapp "Uses"
    webApp -> db "Reads"
    SHOP.WEBAPP -> OTHER "Calls"
  }
  views {
    container SHOP {
      include *
    }
    systemLandscape {
      include CUSTOMER Other
      exclude other
    }
  }
}"""
m, un = imp.read("structurizr", DSL24, "x")
ok("structurizr · identifiers match ignoring case in relationships, includes, excludes and a view's scope (audit 24)",
   [(e["from"], e["to"]) for e in m["edges"]][:3] == [("Customer", "webApp"), ("webApp", "DB"), ("webApp", "other")] and un == []
   and [(v["id"], v["nodeIds"]) for v in m["views"]] == [("shop-containers", ["Customer", "webApp", "DB", "other"]), ("landscape", ["Customer"])],
   (m["edges"], m["views"], un))
m, un = imp.read("structurizr", 'workspace {\nmodel {\na = person "A"\nA = person "B"\nb = person "C"\nA -> b\n}\n}', "x")
ok("structurizr · one identifier written twice in two cases is said, and references name the first (audit 24)",
   [(e["from"], e["to"]) for e in m["edges"]] == [("a", "b")] and un == [(4, "A: Structurizr reads identifiers ignoring case, so this is a again; references name a")], (m["edges"], un))
# audit 24: the map importer read a front-matter title raw (YAML's '' and \" kept, a # comment in the title), as the
# typed readers' mermaidTitle() does not; and it dropped the front matter's configuration and %%{init}%% without a word
titles = [("'Bob''s shop'", "Bob's shop"), ('"The \\"returns\\" flow"', 'The "returns" flow'), ("Shop # the main flow", "Shop"),
          ('"Shop" # the main flow', "Shop"), ("C# tips", "C# tips"), ("'Shop", "Shop"), ('"x"y"', "x")]
got = [imp.read("mermaid", f"---\ntitle: {t}\n---\nflowchart LR\n  a --> b\n", "x")[0]["title"] for t, _ in titles]
ok("mermaid · a front-matter title is read as YAML reads it, as the typed readers read it (audit 24)", got == [w for _, w in titles], got)
m, un = imp.read("mermaid", '---\ntitle: "x"y"\n---\nflowchart LR\n  a --> b\n', "x")
ok("mermaid · what follows a quoted title is said (audit 24)", un == [(2, "front matter title: y\", after the quoted title, is not read")], un)
FM = '---\ntitle: Shop\ndisplayMode: compact\nconfig:\n  theme: dark\n---\n%%{init: {"theme": "forest"}}%%\n%%{\n  init: {}\n}%%\nflowchart LR\n  a --> b\n'
want = [(3, "front matter displayMode: Mermaid's configuration is not read"), (4, "front matter config: Mermaid's configuration is not read"),
        (7, "a %%{init}%% directive: Mermaid's configuration is not read"), (8, "a %%{init}%% directive: Mermaid's configuration is not read")]
m, un = imp.read("mermaid", FM, "x")
m2, un2 = imp.read("mermaid", FM.replace("flowchart LR\n  a --> b", 'C4Context\n  Person(a, "A")'), "x")
ok("mermaid · front-matter configuration and %%{init}%% directives are said, in a flowchart and a C4 diagram (audit 24)",
   un == want and un2 == want and m["title"] == m2["title"] == "Shop" and len(m["edges"]) == 1, (un, un2))
# audit 25: what follows a quoted title was quoted to 60 letters and ..., 63 in all, where the typed readers' mermaidClip()
# quotes 57 and ... (60 UTF-16 units, never half an astral letter)
tails = ["x" * 60, "x" * 61, "x" * 80, "\U0001F600" * 40, "a" + "\U0001F600" * 40, "#not a comment " * 9]
js = subprocess.run(["node", "--input-type=module", "-e", "import { mermaidTitle } from " + json.dumps((ROOT / "src" / "readers" / "mermaid-front.js").as_uri())
                     + "; const t = JSON.parse(process.argv[1]); console.log(JSON.stringify(t.map(x => mermaidTitle(x).rest)))", json.dumps(['"T" ' + x for x in tails])],
                    capture_output=True, text=True)
got = [imp.yaml_title('"T" ' + x)[1] for x in tails]
ok("mermaid · what follows a quoted title is quoted as the typed readers quote it: 60 UTF-16 units at most, never half an astral letter (audit 25)",
   js.returncode == 0 and got == json.loads(js.stdout) and len(got[2]) == 60 and got[2].endswith("x...") and got[0] == "x" * 60, (got, js.stdout, js.stderr[-300:]))
# audit 25: 'this -> x' with no element around it (in the model, or a group there) ended the import in an AttributeError
for where, dsl in [("the model", 'workspace {\nmodel {\na = softwareSystem "A"\nthis -> a "uses"\nb = softwareSystem "B"\na -> b\n}\n}'),
                   ("a group in the model", 'workspace {\nmodel {\na = softwareSystem "A"\ngroup "G" {\nthis -> a "uses"\nb = softwareSystem "B"\n}\na -> b\n}\n}')]:
    try:
        m, un = imp.read("structurizr", dsl, "x")
    except Exception as e:  # what the defect did
        m, un = {"edges": []}, [repr(e)]
    ok(f"structurizr · this -> x in {where}, where this names no element, is said and skipped; the rest is read (audit 25)",
       [(e["from"], e["to"]) for e in m["edges"]] == [("a", "b")] and un == [(4 if where == "the model" else 5, "this -> a: this names no element here")], (m["edges"], un))
# audit 25: a block-scalar title (title: > or |) was the title '>' or '|', and a plain title over two lines lost its second,
# with no word; read as js-yaml reads them, as the typed readers' mermaidFrontTitle() does
fms = ["title: >\n  Orders and\n  payments", "title: |-\n  Orders", "title: Orders\n  and payments", "title: |\n  a\n  b\n", "title: >\n  a\n\n  b\n    deep\n  c",
       "title: >2\n   x\n  y", "title: 'quoted\n  more' # c", "title:\n  on the next line", "title: >+ # a comment\n  kept", "title: \"a\n  b\" tail"]
want = ["Orders and payments", "Orders", "Orders and payments", "a\nb", "a\nb\n  deep\nc", " x\ny", "quoted more", "on the next line", "kept", "a b"]
js = subprocess.run(["node", "--input-type=module", "-e", "import { mermaidFrontTitle } from " + json.dumps((ROOT / "src" / "readers" / "mermaid-front.js").as_uri())
                     + "; const t = JSON.parse(process.argv[1]); console.log(JSON.stringify(t.map(x => { const r = mermaidFrontTitle(x.split('\\n'), 0); return [r.title, r.rest, r.end]; })))",
                     json.dumps(fms)], capture_output=True, text=True)
got = [imp.read("mermaid", f"---\n{fm}\nnext: 1\n---\nflowchart LR\n  a --> b\n", "x") for fm in fms]
ok("mermaid · a block-scalar or multi-line front-matter title is read whole, as the typed readers read it, and the key after it still said (audit 25)",
   [m["title"] for m, _ in got] == want
   and [sorted(un) for _, un in got] == [sorted([(3 + fm.count("\n"), "front matter next: Mermaid's configuration is not read")]
                                                + ([(2, "front matter title: tail, after the quoted title, is not read")] if "tail" in fm else [])) for fm in fms]
   and js.returncode == 0 and [list(imp.front_title(fm.split("\n"), 0)) for fm in fms] == json.loads(js.stdout), ([m["title"] for m, _ in got], [un for _, un in got], js.stdout, js.stderr[-300:]))
# audit 28: front_title() trimmed with str.strip() and isspace(), which take U+001C to U+001F and U+0085 and leave U+FEFF,
# where mermaidFrontTitle() uses JavaScript's trim() and \s: one front matter gave two titles. A table both read alike
fl = [["title: Orders", "\ufeffand returns"], ["title: Orders\ufeff"], ["title: \x1cOrders"], ["title: Orders", "\x1c and returns"], ["title: \x85Orders\x85"],
      ["title: Orders", "\u00a0and returns"], ["title: |", "\u3000a", "\u3000b"], ["title: >\u00a0# c", "  kept"], ["title: 'q'\ufeff# c"], ["title: a\u2028# c"],
      ["title: |\u2028 #x |", "  b"], ["title: Orders\x1f # c"]]
js = subprocess.run(["node", "--input-type=module", "-e", "import { mermaidFrontTitle } from " + json.dumps((ROOT / "src" / "readers" / "mermaid-front.js").as_uri())
                     + "; console.log(JSON.stringify(JSON.parse(process.argv[1]).map(x => { const r = mermaidFrontTitle(x, 0); return [r.title, r.rest, r.end]; })))",
                     json.dumps(fl)], capture_output=True, text=True)
got = [list(imp.front_title(x, 0)) for x in fl]
ok("mermaid · a front-matter title holding U+FEFF, U+001C to U+001F, U+0085 or a Unicode space is read as the typed readers read it (audit 28)",
   js.returncode == 0 and got == json.loads(js.stdout) and got[0] == ["Orders and returns", None, 1] and got[3] == ["Orders", None, 0]
   and imp.read("mermaid", "---\ntitle: Orders\n\ufeffand returns\n---\nflowchart LR\n  a --> b\n", "x")[0]["title"] == "Orders and returns", (got, js.stdout, js.stderr[-300:]))
# audit 29: a digit in the comment after | or > was taken as the indentation indicator, and a non-ASCII digit there (U+0663,
# which Python's \d matches and int() reads as 3) gave the two readers different titles; YAML takes the digit only right
# after the indicator
fl = [["title: > # folded, see note 2", "    Orders and", "    returns"], ["title: | # \u0663", "    a", "    b"], ["title: |2 # 4", "   x", "  y"],
      ["title: >-3 # 1", "    x", "   y"], ["title: |+ # 9", "  kept"], ["title: >1", "  a", " b"]]
js = subprocess.run(["node", "--input-type=module", "-e", "import { mermaidFrontTitle } from " + json.dumps((ROOT / "src" / "readers" / "mermaid-front.js").as_uri())
                     + "; console.log(JSON.stringify(JSON.parse(process.argv[1]).map(x => { const r = mermaidFrontTitle(x, 0); return [r.title, r.rest, r.end]; })))",
                     json.dumps(fl)], capture_output=True, text=True)
got = [list(imp.front_title(x, 0)) for x in fl]
ok("mermaid · a block-scalar title takes its indentation digit from the indicator, never from the comment after it, alike in both readers (audit 29)",
   js.returncode == 0 and got == json.loads(js.stdout) and [g[0] for g in got] == ["Orders and returns", "a\nb", " x\ny", " x\ny", "kept", " a\nb"]
   and imp.read("mermaid", "---\ntitle: > # see note 2\n    Orders and\n    returns\n---\nflowchart LR\n  a --> b\n", "x")[0]["title"] == "Orders and returns", (got, js.stdout, js.stderr[-300:]))
# audit 29: a statement with an edge id (A e1@--> B), which Mermaid documents and the typed reader reads, was not imported,
# its cards and link lost; the id names the line, a hostile one as a slug, one taken falls back to the line's own id
chain = "O" + "".join(f"-->Q{k}" for k in range(500)) + " last@--> Z"
m, un = imp.read("mermaid", 'flowchart LR\n  R e1@--> S\n  A --> B\n  C & D x@-.->|t| E\n  F e2@<--> G\n  L <b>@==> M e1@--> N\n'
                 f'  I --> J["a@b"]\n  e1@{{ animate: true }}\n  {chain}\n', "x")
ok("mermaid · a link with an edge id (A e1@--> B) is imported, its id naming the line; e1@{ ... } is still said (audit 29)",
   [(e["id"], e["from"], e["to"]) for e in m["edges"][:10]] == [("e1", "R", "S"), ("A-B", "A", "B"), ("x", "C", "E"), ("D-E", "D", "E"), ("e2", "F", "G"), ("G-F", "G", "F"),
                                                              ("<b>", "L", "M"), ("M-N", "M", "N"), ("I-J", "I", "J"), ("O-Q0", "O", "Q0")]
   and (m["edges"][-1]["id"], m["edges"][-1]["from"], m["edges"][-1]["to"]) == ("last", "Q499", "Z") and len(m["edges"]) == 510
   and un == [(4, "the edge id x is taken, so D --> E is D-E"), (6, "the edge id e1 is taken, so M --> N is M-N"), (8, "not imported: e1@{ animate: true }")]
   and card(m, "J")["label"] == "a@b", ([(e["id"], e["from"], e["to"]) for e in m["edges"]][:12], un))
# audit 30: a JSON value of the wrong type (an image that is a list, a port that is true, a name that is an object) was
# written into the model as Python spells it ("['nginx']", "True", "deploy-{'a': 1}"), with nothing said
m, un = imp.read("compose", json.dumps({"name": {"n": 1}, "services": {
    "web": {"image": ["nginx"], "ports": [True, {"published": False, "target": 80}, None, 8080], "networks": [None, "a", 1], "build": {"context": [1]}},
    "db": {"image": {"x": 1}, "depends_on": [None, True, "web", 5]}, "q": {"image": 3, "links": [{"a": 1}]}}}), "x")
said = [msg for _, msg in un]
ok("compose · an image, port, network, build path, dependency or link of the wrong JSON type is said in JSON's spelling, never written as Python's (audit 30)",
   m["title"] == "x" and card(m, "web").get("sublabel") is None and card(m, "web").get("what") == "Publishes 80, 8080. On networks a, 1."
   and card(m, "db").get("sublabel") is None and card(m, "q").get("sublabel") == "3" and line(m, "db", "web") is not None
   and all(w in said for w in ['{"n": 1} is not text: not imported', '["nginx"] is not an image\'s name: not imported', "true is not a port: not imported",
                               "null is not a port: not imported", "null is not a network's name: not imported", "[1] is not a path: not imported",
                               '{"x": 1} is not an image\'s name: not imported', "depends on null, which is not a service's name: not imported",
                               "depends on true, which is not a service's name: not imported", "depends on 5, which is not a service here",
                               'links {"a": 1}, which is not a service\'s name: not imported'])
   and not re.search(r"True|None|\{'|\['", json.dumps(m) + json.dumps(un)), (m, un))
m, un = imp.read("kubernetes", json.dumps({"kind": "List", "items": [{"kind": "Deployment", "metadata": {"name": {"a": 1}}}, {"kind": "Service", "metadata": {"name": True}, "spec": {"selector": {"app": "x"}, "ports": [{"port": None}, {"port": 80, "targetPort": True}]}},
    {"kind": "Deployment", "metadata": {"name": 5, "namespace": ["n"]}, "spec": {"template": {"spec": {"containers": [{"image": {"i": 1}}]}}}}, {"kind": True, "metadata": {"name": "z"}},
    {"kind": "Service", "metadata": {"name": "s"}, "spec": {"type": ["x"], "ports": [{"port": None}, {"port": 80, "targetPort": True}]}}]}), "x")
ok("kubernetes · a name, namespace, kind, image, type or port of the wrong JSON type is said in JSON's spelling, never written as Python's (audit 30)",
   [(n["id"], n["label"], n.get("sublabel")) for n in m["nodes"]] == [("deploy-5", "5", "Deployment"), ("svc-s", "s", "Service · ClusterIP · 80→80")]
   and [msg for _, msg in un] == ['Deployment {"a": 1}: its name is not text: not imported', "Service true: its name is not text: not imported",
                                  'Deployment 5: namespace ["n"] is not text: read as default', 'Deployment 5: image {"i": 1} is not text: not imported', "true z: not imported"]
   and not re.search(r"True|None|\{'|\['", json.dumps(m) + json.dumps(un)), (m["nodes"], un))
# audit 31: an edge id was slugged (e:1 as e-1), and the slug took the id the next link names itself, which fell back to C-D
# with nothing said; each id is now kept as written, as the typed reader keeps it, an id holding "->" and one taken said
src = 'flowchart LR\n  A e:1@--> B\n  C e-1@--> D\n  E <b>@--> F\n  G e->1@--> H\n  I A-B@--> J\n  K --> L\n  M K-L@--> N\n'
m, un = imp.read("mermaid", src, "x")
js = subprocess.run(["node", "--input-type=module", "-e", "import { readMermaidFlowchart } from " + json.dumps((ROOT / "src" / "readers" / "mermaid-flowchart.js").as_uri())
                     + "; console.log(JSON.stringify(readMermaidFlowchart(process.argv[1]).model.edges.map(e => [e.id, e.from, e.to])))", src], capture_output=True, text=True)
got = [[e["id"], e["from"], e["to"]] for e in m["edges"]]
ok("mermaid · an edge id is kept as written (e:1, <b>), never slugged onto the id another link names; one holding -> or taken is said, the ids the typed reader gives (audit 31)",
   got == [["e:1", "A", "B"], ["e-1", "C", "D"], ["<b>", "E", "F"], ["G-H", "G", "H"], ["A-B", "I", "J"], ["K-L", "K", "L"], ["M-N", "M", "N"]]
   and js.returncode == 0 and json.loads(js.stdout) == got
   and un == [(5, 'the edge id e->1: an id holds no "->", so it is e-1'), (5, "the edge id e-1 is taken, so G --> H is G-H"), (8, "the edge id K-L is taken, so M --> N is M-N")],
   (got, js.stdout, js.stderr[-300:], un))
# audit 31: compose and Kubernetes JSON read 1e400 as inf and NaN and Infinity as numbers, and wrote "Infinity" and "NaN" into
# the model, though every other command refuses them (load_json, audit 30)
said = []
for fmt, text in (("compose", '{"name": 1e400, "services": {"web": {"image": "n"}}}'), ("compose", '{"services": {"web": {"image": NaN}}}'),
                  ("compose", '{"services": {"web": {"image": "n", "ports": [Infinity]}}}'), ("kubernetes", '{"kind": "Service", "metadata": {"name": -Infinity}}'),
                  ("kubernetes", '{"kind": "Service", "metadata": {"name": "s"}, "spec": {"ports": [{"port": 10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000}]}}')):
    try:
        imp.read(fmt, text, "x")
        said.append(None)
    except ValueError as e:
        said.append(str(e))
(t31 := Path(tempfile.mkdtemp())).joinpath("c.json").write_text('{"services": {"web": {"image": "n", "ports": [1e400]}}}')
r = run("import", str(t31 / "c.json"), "--out", str(t31 / "o.json"))
ok("compose, kubernetes · 1e400, NaN, Infinity and an integer past a double are refused, as every command reads JSON, never written as text; import says it in one line (audit 31)",
   all(said) and "out of range" in said[0] and "NaN is not a JSON number" in said[1] and "-Infinity is not a JSON number" in said[3]
   and r.returncode == 1 and "is not compose JSON (the number 1e400 is out of range): nothing written" in r.stderr and not (t31 / "o.json").exists()
   and imp.word(float("inf")) is None and imp.word(float("nan")) is None and imp.word(1.5) == "1.5", (said, r.stderr[-300:]))
# audit 25: a Markdown string ("`**Bold**`") lost its backticks and kept its ** and _ as text, with no word, where the typed
# reader says it is read as plain text: on a node, a line's label and a subgraph's title
m, un = imp.read("mermaid", 'flowchart LR\n  A["`**Bold** and _it_`"] -->|"`*e*`"| B\n  B -- "`x`" --> C\n  subgraph s1 ["`**S**`"]\n  E\n  end\n'
                 '  subgraph "`**T**`"\n  F\n  end\n  G["plain `ticks`"] --> H["`"]\n', "x")
ok("mermaid · a Markdown string is said as read as plain text, on a node, a line and a subgraph; a label with backticks inside is not one (audit 25)",
   un == [(2, "A: a Markdown string is read as plain text"), (2, "A -> B: a Markdown string is read as plain text"), (3, "B -> C: a Markdown string is read as plain text"),
          (4, "subgraph s1: a Markdown string is read as plain text"), (7, "subgraph t: a Markdown string is read as plain text")]
   and card(m, "A")["label"] == "**Bold** and _it_" and card(m, "G")["label"] == "plain `ticks`", un)

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    (t / "adir.mmd").mkdir()
    r = [run("import", str(t / f), "--out", str(t / "o.json")) for f in ("nope.mmd", "adir.mmd")]
    ok("a missing file or a folder is said in one line, not a traceback (audit 4)",
       all(x.returncode == 1 and "import: no file at" in x.stderr and "Traceback" not in x.stderr for x in r), [x.stderr[-200:] for x in r])
    r = run("import", str(ROOT / "tests" / "import" / "parcels.puml"), "--out", str(t / "new" / "deeper" / "o.json"))
    ok("--out in a folder not there yet: the folder is made, as render's (audit 4)", r.returncode == 0 and (t / "new" / "deeper" / "o.json").is_file(), r.stderr[-300:])
    (t / "f.mmd").write_text("flowchart TD\n  a --> b\n")
    r = run("import", str(t / "f.mmd"), "--out", str(t / "f.mmd"))
    ok("--out naming the source is refused in one line, the source kept (audit 12)",
       r.returncode == 1 and "is its input" in r.stderr and (t / "f.mmd").read_text().startswith("flowchart"), r.stderr[-300:])
    (t / "deep.json").write_text('{"model":{"people":' + "[" * 300000 + "]" * 300000 + '},"views":{}}')
    r = [run("import", str(t / "deep.json"), "--out", str(t / "deep-out.json"), *f) for f in ([], ["--format", "kubernetes"])]
    ok("JSON nested too deep for Python's parser is said in one line, no RecursionError (audit 12)",
       all(x.returncode == 1 and "nests too deep" in x.stderr and "Traceback" not in x.stderr for x in r), [x.stderr[-300:] for x in r])
    (t / "bad.mmd").write_bytes(b"\xff\xfe\x00flowchart")
    r = run("import", str(t / "bad.mmd"), "--out", str(t / "b.json"))
    ok("a file that is not UTF-8 is said in one line, no traceback", r.returncode == 1 and "is not UTF-8 text" in r.stderr and "Traceback" not in r.stderr, r.stderr)
    (t / "lone.json").write_text('{"services": {"a\\ud800": {}}}')  # audit 3: a lone surrogate ended the UTF-8 write in a traceback
    r = run("import", str(t / "lone.json"), "--out", str(t / "lone-out.json"))
    ok("a lone surrogate (an escape or entity) is written as U+FFFD and said, no traceback",
       r.returncode == 0 and "written as U+FFFD" in r.stderr and "a\ufffd" in (t / "lone-out.json").read_text(encoding="utf-8"), r.stderr[-800:])
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
       and [x["where"] for x in said(r).get("notImported", [])] == [5, 5, 9] and said(r).get("unread") == 3, r.stdout + r.stderr)
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
# audit 6: a %%{ ... }%% directive over several lines (Mermaid's documented form) was the header of the map reader and of
# detect(); and str.splitlines() split a label at U+2028
d = '%%{\n  init: {\n    "theme": "dark"\n  }\n}%%\n'
m, un = imp.read("mermaid", d + "flowchart LR\n  A --> B\n", "x")
ok("mermaid · a directive over several lines is passed over: by detect() and by the flowchart reader",
   imp.detect("x.txt", d + "flowchart LR\n") == imp.detect("x.txt", d + "classDiagram\n") == "mermaid" and len(m["nodes"]) == 2 and line(m, "A", "B"), un)
m, un = imp.read("mermaid", 'flowchart LR\n  A["Order\u2028placed"] --> B["Ship"]\n  B --> C\n', "x")
d, dun = imp.read("structurizr", 'workspace {\nmodel {\nu = person "User" "one\u2028two"\n}\n}\n', "x")
ok("a U+2028 in a label does not split its line (Mermaid, Structurizr DSL)", card(m, "A").get("label", "").split() == ["Order", "placed"]
   and card(m, "B")["label"] == "Ship" and line(m, "A", "B") and not un and card(d, "u").get("what", "").split() == ["one", "two"] and not dun, (un, dun, card(d, "u")))
# audit 7: a bare subgraph was a card named subgraph; an accDescr { ... } block's lines were statements; a quoted label
# over two lines dropped its statement; ~~~ and style lines went unsaid; [/a\] --> B[\b/] took B's /] as its closer
m, un = imp.read("mermaid", "flowchart LR\nsubgraph\nA --> B\nend\nB --> C\n", "x")
ok("mermaid · a bare subgraph is a box (Mermaid's subGraph0), not a card", [n["id"] for n in m["nodes"]] == ["A", "B", "C"]
   and box(m, "flowchart", "subGraph0").get("nodeIds") == ["A", "B"] and not un, (m, un))
# audit 16: an outer subgraph with no end left its inner box's parent unknown; a subgraph id used twice (after or inside
# itself) wrote two boxes of one id, or a box inside itself; render refused all three
boxes_of = lambda m: [v.get("containers") for v in m["views"]][0]
m, un = imp.read("mermaid", "flowchart LR\nsubgraph core [Order core]\nsubgraph pay [Payments]\ncard[Card]\nend\nstock[Stock]\ncard --> stock\n", "x")
ok("mermaid · an inner box of a subgraph with no end is drawn at the top level", boxes_of(m) == [{"id": "pay", "label": "Payments", "nodeIds": ["card"]}]
   and any("core has no end" in u[1] for u in un), (m, un))
m, un = imp.read("mermaid", "flowchart LR\nsubgraph pay [Payments]\ncard\nend\nsubgraph pay [Again]\nfraud\nend\nsubgraph api\nsubgraph api\nh\nend\nr\nend\n", "x")
ok("mermaid · a subgraph opened again, after or inside itself, is one box, with no parent of its own id",
   boxes_of(m) == [{"id": "pay", "label": "Payments", "nodeIds": ["card", "fraud"]}, {"id": "api", "label": "api", "nodeIds": ["h", "r"]}], (m, un))
m, un = imp.read("mermaid", "flowchart LR\naccDescr {\nCheckout\nA --> Z\n}\nA --> B\n", "x")
c4m, c4un = imp.read("mermaid", 'C4Context\naccDescr {\nPerson(x, "y")\n}\nPerson(a, "A")\n', "x")
ok("mermaid · an accDescr { ... } block is passed over whole (flowchart, C4)", [n["id"] for n in m["nodes"]] == ["A", "B"]
   and un == [(2, "accDescr: accessibility text is not imported")] and [n["id"] for n in c4m["nodes"]] == ["a"] and c4un == un, (m, un, c4m, c4un))
m, un = imp.read("mermaid", 'flowchart LR\na("`The **cat**\n  in the hat`") -- "edge label" --> b{{"`The **dog** in the hog`"}}\n', "x")
ok("mermaid · a quoted label over two lines is read", card(m, "a").get("label") == "The **cat** in the hat" and (line(m, "a", "b") or {}).get("label") == "edge label"
   and un == [(2, "a: a Markdown string is read as plain text"), (2, "b: a Markdown string is read as plain text")], (m, un))  # said since audit 25
m, un = imp.read("mermaid", 'flowchart LR\nA --> B\nB ~~~ C\nstyle A fill:#f9f\nclick A "x"\n', "x")
ok("mermaid · an invisible link and style and click lines are said", un == [(3, "B ~~~ C: an invisible link is not imported"), (4, "not imported: style A fill:#f9f"),
   (5, 'not imported: click A "x"')], un)
m, un = imp.read("mermaid", "flowchart LR\n  A[/Order placed\\] --> B[\\Ship it/]\n  B --> C[Done]\n", "x")
ok("mermaid · a trapezoid takes its nearest closer", [card(m, i).get("label") for i in "ABC"] == ["Order placed", "Ship it", "Done"] and line(m, "A", "B"), m)
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
       got == [f":{n}:" for n in (3, 18, 19, 78, 95, 101, 102, 103, 104, 105, 114, 117, 119, 127, 128, 139, 141, 142, 143, 144, 145)] and said.get("unread") == 21, r.stderr)
    kinds = {n["id"]: (n["type"], (n.get("props") or {}).get("kind")) for n in m["nodes"]}
    ok(f"{name} · states, composites with regions, pseudostates and final states, transitions and notes",
       [kinds.get(i) for i in ("Active", "if_state", "fork_state", "hist", "start", "end")] == [("uml.State", None), ("uml.Pseudostate", "choice"),
        ("uml.Pseudostate", "fork"), ("uml.State", None), ("uml.Pseudostate", "initial"), ("uml.FinalState", None)]
       and len(next(n for n in m["nodes"] if n["id"] == "Active").get("members", [])) == 3 and {e["type"] for e in m["edges"]} == {"uml.Transition", "uml.CommentLink"}, m["nodes"])
    # no core error (one with no rule); the state type's UML rules may name what Mermaid's own examples do and UML does not
    # allow (a fork into plain states; a history at the top is read as a state, audit 44), as tests/mermaid-state.test.mjs says
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
        # audit 26: a relative folder, in --moddle or UMLIMATOR_BPMN_MODDLE, is read against the working folder; Node's
        # createRequire refused it, said as bpmn-moddle not found
        os_ = __import__("os")
        rel = Path(have).name  # run in the folder above it
        said = [subprocess.run([sys.executable, str(ROOT / "umlimator.py"), cmd, *src, "--out", str(t / f"rel{i}.{ext}"), *flag], capture_output=True, text=True, env=env,
                               cwd=Path(have).resolve().parent)
                for i, (cmd, src, ext, flag, env) in enumerate([
                    ("import", [str(ROOT / name)], "json", ["--moddle", rel], none),
                    ("import", [str(ROOT / name)], "json", [], dict(os_.environ, UMLIMATOR_BPMN_MODDLE=rel)),
                    ("export", [str(ROOT / "examples" / "bookshop-order-to-shipment.json")], "bpmn", ["--moddle", rel], none)])]
        ok("bpmn · a relative --moddle or UMLIMATOR_BPMN_MODDLE is the working folder's, for import and export (audit 26)",
           [r.returncode for r in said] == [0, 0, 0] and all((t / f"rel{i}.{e}").is_file() for i, e in enumerate(["json", "json", "bpmn"])),
           (rel, [r.stderr[-300:] for r in said]))
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

# audit 26: a report line quotes the source, and a hostile file's escape sequences (a window title, a cleared screen, an
# OSC 8 link, colours, a C1 CSI) reached the terminal raw; each control character is written as \xNN, from the map
# importer (Python) and from a typed reader (Node), and in the file's own name
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    hostile = {"esc.mmd": "flowchart TD\n  A --> B\n  zzz \x1b]0;PWNED\x07 \x1b[31mRED\x1b[0m \x9b2J\n",
               "esc2.mmd": "classDiagram\n  class A\n  \x1b[2J\x1b]8;;http://evil/\x1b\\click\x1b]8;;\x1b\\ junk!!\n",
               "x\x1b[2Jy.mmd": "flowchart TD\n  A --> B\n  zzz ???\n"}
    said = []
    for f, text in hostile.items():
        (t / f).write_text(text, encoding="utf-8")
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", f, "--out", "o.json"], capture_output=True, text=True, cwd=t)
        said.append(r.stderr)
    bad = [x for x in said if re.search("[\x00-\x08\x0b-\x1f\x7f-\x9f]", x)]
    ok("a hostile file's escape sequences reach stderr as \\xNN, never raw, from the map importer, a typed reader and the file's name (audit 26)",
       not bad and "zzz \\x1b]0\n" in said[0] and "PWNED\\x07 \\x1b[31mRED" in said[0] and "\\x9b2J" in said[0] and "\\x1b]8;;http://evil/" in said[1] and "x\\x1b[2Jy.mmd:3:" in said[2], said)

# audit 27: the bidi marks, embeddings, overrides and isolates (U+202E shows the rest of the line reversed) reached stderr
# raw too; each is written as \uNNNN, from the map importer (Python), a typed reader (Node) and the file's own name
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    bidi = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u061c"
    hostile = {"bidi.mmd": f"flowchart TD\n  A --> B\n  zzz \u202eexe.txt\u202c {bidi} \x1b[31mred\n",
               "bidi2.mmd": "classDiagram\n  class A\n  \u2066\u202e junk!!\u2069\n",
               "x\u202ey.mmd": "flowchart TD\n  A --> B\n  zzz ???\n"}
    said = []
    for f, text in hostile.items():
        (t / f).write_text(text, encoding="utf-8")
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", f, "--out", "o.json"], capture_output=True, text=True, encoding="utf-8", cwd=t)
        said.append(r.stderr)
    raw = [x for x in said if re.search("[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]", x)]
    ok("a hostile file's bidi controls reach stderr as \\uNNNN, never raw, from the map importer, a typed reader and the file's name (audit 27)",
       not raw and "zzz \\u202eexe.txt\\u202c " in said[0] and "\\u202a\\u202b\\u202c\\u202d\\u202e\\u2066\\u2067\\u2068\\u2069\\u200e\\u200f\\u061c \\x1b[31mred" in said[0]
       and "\\u2066\\u202e junk!!\\u2069" in said[1] and "x\\u202ey.mmd:3:" in said[2] and all(r for r in said), said)

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
    ok(f"{name} · without --typed, still a map", r.returncode == 0 and "schemaVersion" not in json.loads((t / "map.json").read_text())
       and [l.split(": ", 1)[1] for l in r.stderr.splitlines()] == ["not imported: classDef external fill:#eee,stroke:#999", "not imported: class psp external",
                                                                   "not imported: click psp \"https://example.com/psp\" \"The provider's docs\""], r.stderr)
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
