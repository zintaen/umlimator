#!/usr/bin/env python3
"""umlimator.py mcp's page in a real browser (0.14.0): an MCP client on the server's pipes, and its page in headless Chrome,
driven over the DevTools protocol (--remote-debugging-pipe, standard library only). Each case is one of the state-machine
audit's repros (tooling.json's mcp machines), which failed before:
- a page tool says "shown" only once a page did, and page_state() reads what the page shows (its MapState);
- a page that opens late shows what the assistant built (the view, then the highlight on it), not the last command alone;
- the assistant's highlight is its own layer ('mcp'): on another view it is off, and back on its view it is back;
- a model that stops rendering keeps the last page that did, and the tools say why; fixed, the page draws it;
- a command the page can't finish is answered, in time, with why (a stuck setView, as a tab in the background has);
- a closed tab is not counted; a tour that has ended is not played again for a page that opens later;
- a command ends only the assistant's own tour, never the tour of a story the reader started (#132);
- clear() takes the assistant's story off, and leaves a story the reader started.
And C10 (2.6): an object model and a package model, served the same way, answer its read tools in their own words and show a
highlight on the diagram the page draws; and so do a use case, an activity, a state machine and an interaction overview model
(4.10), a component, a deployment and a composite structure model (5.8), a profile and a timing model (6.6), a class, a
sequence and a communication model (C10's package), an ER, a flowchart, a data flow, an information flow and a C4
model (M2.14), SysML's four e-bike models (M3.7), a mindmap, a Google Cloud and an Azure model, with no icon pack
(4a.7), and a BPMN model (4b.5).

  python3 tests/mcp.py

Needs Chrome or Chromium and Node.
"""
import json, os, re, shutil, subprocess, sys, tempfile, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import umlimator as u

failed = False


def ok(name, cond, info=""):
    global failed
    print(("ok  " if cond else "FAIL"), "mcp ·", name, "" if cond else str(info)[-1500:])
    failed |= not cond

# refit() keeps what refs() accepts against the new version, and only that (audit 10): a member's highlight stays after an
# edit, a line with no id the new version no longer has goes
import umlimator_mcp as mcp
m = {"nodes": [{"id": "a", "members": [{"id": "a.p"}]}, {"id": "b"}], "edges": [{"from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}
mcp.want["highlight"] = {"refs": mcp.refs(m, [{"type": "node", "id": "a.p"}]), "view": "v"}
mcp.refit(m)
port_kept = mcp.want["highlight"]
mcp.want["highlight"] = {"refs": mcp.refs(m, ["a->b#0"]), "view": "v"}
mcp.refit(dict(m, edges=[]))
line_gone = mcp.want["highlight"]
mcp.want["highlight"] = None
ok("audit 10 · refit() keeps a member's highlight after an edit, and drops a line with no id the new version no longer has",
   port_kept and port_kept["refs"] == [{"type": "node", "id": "a.p"}] and line_gone is None, (port_kept, line_gone))
# audit 20: a story id that is not a string (a list) ended refit() in a TypeError, an internal error on the next page tool;
# a line nested too deep for Python's parser ended the server
m = {"nodes": [{"id": "a"}], "edges": [], "views": [{"id": "v", "nodeIds": ["a"]}], "stories": [{"id": ["tour"], "steps": [{"view": "v"}]}, {"id": "s", "steps": []}]}
mcp.want["story"] = {"n": 1, "story": "s"}
try:
    mcp.refit(m); said = mcp.want["story"]
except TypeError as e:
    said = e
mcp.want["story"] = None
deep = mcp.answer(b"[" * 100000 + b"]" * 100000)
ok("audit 20 · refit() reads a story id that is not a string as no name; a line nested too deep is a parse error, not the server's end",
   said == {"n": 1, "story": "s"} and deep["error"]["code"] == -32700, (said, deep))
# audit 67: Python 3.14's json reads any depth, so a line nested 100000 deep was a batch (-32600), not a parse error, and
# one 2000 deep was a batch on every Python; an id of NaN or Infinity (which Python's json reads) went back as a bare NaN,
# which is not JSON, and such a tool argument reached Node as a raw SyntaxError
deep67 = mcp.answer(b"[" * 1001 + b"]" * 1001)
ids67 = [mcp.answer(b'{"jsonrpc":"2.0","id":%s,"method":"ping"}' % x) for x in (b"NaN", b"-Infinity", b"1e400", b"1" + b"0" * 400)]
args67 = [mcp.answer(b'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"set_field","arguments":{"id":"a","view":"v","path":"props","value":{"w":%s}}}}' % x)
          for x in (b"-Infinity", b"NaN", b"1e400")]
kept67 = [mcp.answer(x) for x in (b"[" * 1000 + b"]" * 1000, b'{"jsonrpc":"2.0","id":"' + b"[{" * 2000 + b'","method":"ping"}', b'{"jsonrpc":"2.0","id":1e300,"method":"ping"}')]
def wire(r):  # whether a reply is JSON on the wire, with no bare NaN or Infinity
    try:
        return bool(json.dumps(r, allow_nan=False))
    except ValueError:
        return False
ok("audit 67 · a line nested deeper than 1000 is a parse error on every Python; an id of NaN, Infinity or 1e400 is an Invalid Request "
   "with id null, and such an argument the tool's refusal by name; 1000 deep, brackets in a string, and 1e300 still read",
   all(map(wire, (deep67, *ids67, *args67))) and deep67 == mcp.failure(None, -32700, "Parse error") and all(r == mcp.failure(None, -32600, "Invalid Request") for r in ids67)
   and all(r["id"] == 1 and r["result"]["isError"] and r["result"]["content"][0]["text"] == "set_field: value is not JSON: it holds NaN, Infinity or a number out of range" for r in args67)
   and kept67[0] == [mcp.failure(None, -32600, "Invalid Request")] and kept67[1]["id"] == "[{" * 2000 and "result" in kept67[1]
   and kept67[2]["id"] == 1e300 and "result" in kept67[2], (deep67, ids67, args67, kept67[0], str(kept67[1])[:200]))
# audit 68: a _meta protocolVersion of NaN, 1e400 or [Infinity] went back bare in the -32022 error's data, which is not JSON;
# every line serve() writes is now JSON, a reply that would hold such a number an internal error with its id
meta68 = [mcp.answer(b'{"jsonrpc":"2.0","id":%d,"method":"ping","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":%s}}}' % (i, x))
          for i, x in enumerate((b"NaN", b"1e400", b"[Infinity]", b'"1999-01-01"'))]
def strict68(b):  # the line as a client's JSON.parse reads it
    return json.loads(b, parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
lines68 = [strict68(mcp.wire(r)) for r in meta68[:3]]
bad68 = {"jsonrpc": "2.0", "id": 7, "result": {"x": float("nan")}}
ok("audit 68 · a NaN, 1e400 or [Infinity] _meta protocolVersion gets -32022 without echoing it; a string one is still echoed; "
   "wire() writes a reply holding NaN as an internal error with its id, a batch reply by reply, and others as json.dumps does",
   all(r["error"]["code"] == -32022 and r["error"]["data"] == {"supported": mcp.VERSIONS} for r in lines68)
   and meta68[3]["error"]["data"]["requested"] == "1999-01-01" and all(map(wire, meta68))
   and strict68(mcp.wire(bad68)) == mcp.failure(7, -32603, "Internal error: the reply holds NaN, Infinity or a number out of range")
   and strict68(mcp.wire([bad68, meta68[3]])) == [mcp.failure(7, -32603, "Internal error: the reply holds NaN, Infinity or a number out of range"), meta68[3]]
   and mcp.wire(meta68[3]) == json.dumps(meta68[3]).encode() + b"\n", (meta68,))
# audit 48: cards that no one view shows (a->b on v1, b->c on v2) are refused as that, not blamed on a line missing from the
# first view, where c is not even drawn (the tour check fell back to a view when none showed them all)
with tempfile.TemporaryDirectory() as d48:
    keep48 = (mcp.MODEL, mcp.page)
    mcp.MODEL = Path(d48) / "split.json"
    mcp.MODEL.write_text(json.dumps({"schemaVersion": 2, "nodes": [{"id": x, "label": x} for x in "abc"],
                                     "edges": [{"id": "ab", "from": "a", "to": "b"}, {"id": "bc", "from": "b", "to": "c"}],
                                     "views": [{"id": "v1", "nodeIds": ["a", "b"]}, {"id": "v2", "nodeIds": ["b", "c"]}]}), encoding="utf-8")
    mcp.page = lambda: ("v", None)
    said48 = []
    for cards in (["a", "b", "c"], ["a", "c"]):
        try:
            said48.append(mcp.call("tour", {"cards": cards}))
        except mcp.Fail as e:
            said48.append(str(e))
    mcp.MODEL, mcp.page = keep48
ok("audit 48 · tour on cards split over two views says no view shows them all, and blames no line on a view",
   all(x == "no view shows all these cards; describe_view lists a view's cards" for x in said48), said48)
# story_from_flow (layout-flow note, section 10): a story told from a view's main flow, returned and never written: one step
# per main card, a tour of each two the view draws a line between, validate() finds nothing in it, and the model file's
# bytes are as they were; a view with no main flow, or no view, is the tool's error
keep_sf = (mcp.MODEL, mcp.page)
with tempfile.TemporaryDirectory() as dsf:
    mcp.MODEL = Path(dsf) / "f12.json"
    mcp.MODEL.write_bytes((ROOT / "bench" / "models" / "f12.json").read_bytes())
    before_sf = mcp.MODEL.read_bytes()
    told_sf = mcp.call("story_from_flow", {"view": "order"})
    titled_sf = mcp.call("story_from_flow", {"view": "orders-dfd", "id": "dfd", "title": "Orders", "chapters": False})
    f12_sf = json.loads(before_sf)
    probs_sf = mcp.node("validate", dict(f12_sf, stories=[{k: x for k, x in told_sf.items() if k != "chapters"},
                                                          *({k: x for k, x in c.items() if k != "at"} for c in told_sf["chapters"])]))
    unchanged_sf = mcp.MODEL.read_bytes() == before_sf
    errs_sf = []
    for a in ({"view": "nope"}, {"view": "lonely"}):
        if a["view"] == "lonely":
            mcp.MODEL.write_text(json.dumps({"nodes": [{"id": "a"}, {"id": "b"}], "edges": [], "views": [{"id": "lonely", "nodeIds": ["a", "b"]}]}), encoding="utf-8")
        try:
            errs_sf.append(mcp.call("story_from_flow", a))
        except mcp.Fail as e:
            errs_sf.append(str(e))
mcp.MODEL, mcp.page = keep_sf
mains_sf = ["o-web", "o-api", "o-cart", "o-pay", "o-ship", "o-mail"]
ok("story_from_flow returns the main flow's story without writing the model: a step per main card, each tour two cards in turn, validate() clean",
   "story_from_flow" in mcp.TOOL and told_sf["id"] == "flow-order" and [x.get("select") for x in told_sf["steps"]] == mains_sf
   and [x.get("tour") for x in told_sf["steps"][1:]] == [list(p) for p in zip(mains_sf, mains_sf[1:])]
   and told_sf["steps"][3]["caption"] == "4. Charges: Cart charges Payments." and "reads Orders" in told_sf["steps"][4]["caption"]
   and [c["at"] for c in told_sf["chapters"]] == [3, 3] and not [p for p in probs_sf if p["path"].startswith("stories")] and unchanged_sf,
   (told_sf, probs_sf, unchanged_sf))
ok("story_from_flow takes an id, a title and chapters: false; on a typed view its lines as drawn",
   titled_sf["id"] == "dfd" and titled_sf["title"] == "Orders" and titled_sf["chapters"] == [] and len(titled_sf["steps"]) == 4, titled_sf)
ok("story_from_flow on no view, or on a view with no main flow, is the tool's error, said",
   errs_sf[0].startswith("no view 'nope'") and "has no main flow" in errs_sf[1], errs_sf)
# play_story plays a story given as it is (story_from_flow's), not only the model's by id (product item 4): it is folded into
# what the pages are shown and never written; one whose steps name what the model's views lack, or that is no story, or a
# call with both id and story or neither, is the tool's error; a later version that drops its view drops it from `want`
keep_ps = (mcp.MODEL, mcp.page, dict(mcp.want))
with tempfile.TemporaryDirectory() as dps:
    mcp.MODEL = Path(dps) / "f12.json"
    mcp.MODEL.write_bytes((ROOT / "bench" / "models" / "f12.json").read_bytes())
    mcp.page = lambda: ("v", None)
    before_ps = mcp.MODEL.read_bytes()
    given_ps = mcp.call("story_from_flow", {"view": "order", "audience": "business"})
    said_ps = mcp.call("play_story", {"story": given_ps})
    asked_ps = mcp.want["story"] and mcp.want["story"]["story"]
    named_ps = json.loads(mcp.page_state())["asked"]["story"]
    errs_ps = []
    for a in ({"story": {"id": "x", "steps": [{"view": "nope"}]}}, {"story": {"id": "x", "steps": [{"view": "order", "select": "ghost"}]}},
              {"story": {"steps": []}}, {"story": given_ps, "id": "x"}, {}):
        try:
            errs_ps.append(mcp.call("play_story", a))
        except mcp.Fail as e:
            errs_ps.append(str(e))
    unchanged_ps = mcp.MODEL.read_bytes() == before_ps
    f12_ps = json.loads(before_ps); f12_ps["views"] = [v for v in f12_ps["views"] if v["id"] != "order"]
    with mcp.lock:
        mcp.refit(f12_ps)
    dropped_ps = mcp.want["story"]
mcp.MODEL, mcp.page = keep_ps[0], keep_ps[1]; mcp.want.clear(); mcp.want.update(keep_ps[2])
ok("play_story takes a story as it is (story_from_flow's, with an audience): folded into what pages are shown, named as given, never written",
   given_ps.get("audience") == "business" and "reads Orders" not in json.dumps(given_ps["steps"]) and asked_ps == given_ps
   and named_ps == {"id": "flow-order", "given": True, "steps": 6} and unchanged_ps and said_ps.startswith("No page"), (said_ps, named_ps, unchanged_ps))
ok("…a story naming a view or card the model lacks, no story, or id and story both or neither, is the tool's error; a version without its view drops it",
   errs_ps[0].startswith("story: story.steps[0].view:") and errs_ps[1].startswith("story: story.steps[0].select:") and errs_ps[2].startswith("story is a story")
   and all(x.startswith("play_story: give id") for x in errs_ps[3:]) and dropped_ps is None, errs_ps)
# story_from_diff (product item 4): a story of what changed on a view from another model file to this one, returned and never
# written, which play_story plays on the page of the model as it is now; a view that shows no change is the tool's error
keep_sd = (mcp.MODEL, mcp.page, dict(mcp.want))
with tempfile.TemporaryDirectory() as dsd:
    base_sd = json.loads((ROOT / "bench" / "models" / "f12.json").read_text(encoding="utf-8"))
    head_sd = json.loads(json.dumps(base_sd)); head_sd["nodes"].append({"id": "o-fraud", "label": "Fraud check"})
    next(v for v in head_sd["views"] if v["id"] == "order")["nodeIds"].append("o-fraud")
    head_sd["edges"].append({"id": "o-fr", "from": "o-cart", "to": "o-fraud", "label": "asks"})
    (Path(dsd) / "base.json").write_text(json.dumps(base_sd), encoding="utf-8")
    mcp.MODEL = Path(dsd) / "head.json"; mcp.MODEL.write_text(json.dumps(head_sd), encoding="utf-8")
    mcp.page = lambda: ("v", None)
    before_sd = mcp.MODEL.read_bytes()
    told_sd = mcp.call("story_from_diff", {"other_model_path": "base.json", "view": "order"})
    played_sd = mcp.call("play_story", {"story": told_sd})
    try:
        none_sd = mcp.call("story_from_diff", {"other_model_path": "head.json", "view": "order"})
    except mcp.Fail as e:
        none_sd = str(e)
    unchanged_sd = mcp.MODEL.read_bytes() == before_sd
mcp.MODEL, mcp.page = keep_sd[0], keep_sd[1]; mcp.want.clear(); mcp.want.update(keep_sd[2])
ok("story_from_diff returns a story of the view's change, not written, which play_story plays; a view that shows no change is said",
   "story_from_diff" in mcp.TOOL and told_sd["id"] == "diff-order" and [x["caption"] for x in told_sd["steps"]] == ["1. Added: Cart asks Fraud check.", "2. Added: Fraud check."]
   and played_sd.startswith("No page") and "shows no change" in none_sd and unchanged_sd, (told_sd, played_sd, none_sd))
# audit 51: a tour with no view took the first view that shows its cards (containers, where shopper and bookshop share no
# line) and refused it, though the context view draws the route shopper -> bookshop -> payments: it rides the first that does
keep51 = (mcp.MODEL, mcp.page, dict(mcp.want))
mcp.MODEL, mcp.page = ROOT / "examples" / "types" / "c4.json", (lambda: ("v", None))
rode51 = []
for current in (None, "containers"):
    mcp.want.update(view=current, highlight=None, tour=None, story=None)
    try:
        mcp.call("tour", {"cards": ["shopper", "bookshop", "payments"]}); rode51.append(mcp.want["view"])
    except mcp.Fail as e:
        rode51.append(str(e))
try:
    mcp.call("tour", {"cards": ["shopper", "payments"]}); none51 = None
except mcp.Fail as e:
    none51 = str(e)
mcp.MODEL, mcp.page = keep51[:2]
mcp.want.clear(); mcp.want.update(keep51[2])
ok("audit 51 · tour with no view rides the first view that shows its cards and draws a line between each and the next; none that does is said, naming each",
   rode51 == ["context", "context"] and none51 and none51.startswith("no view that shows these cards draws a line between each and the next")
   and "on view 'context' no line joins 'shopper' and 'payments'" in none51 and "on view 'containers'" in none51, (rode51, none51))
# audit 52: the tour check took reach()'s lines, so a card the view draws as a box (a package holding cards) passed, though
# the page's tour() rides only cards the laid-out view draws, and threw "no line joins these cards"; [a, a] passed with no
# self-line, as reach() lists the card itself. And the description named the first view, where the view shown now wins
keep52 = (mcp.MODEL, mcp.page, dict(mcp.want))
mcp.page = lambda: ("v", None)
said52 = []
with tempfile.TemporaryDirectory() as d52:
    # two packages that hold classes, drawn as boxes on a package view, and a line between them; a second view draws it too
    pk = {"schemaVersion": 2, "nodes": [{"id": "catalog", "type": "uml.Package", "label": "catalog"}, {"id": "book", "type": "uml.Class", "label": "Book", "parent": "catalog"},
                                        {"id": "shared", "type": "uml.Package", "label": "shared"}, {"id": "money", "type": "uml.DataType", "label": "Money", "parent": "shared"}],
          "edges": [{"id": "imports", "type": "uml.PackageImport", "from": "catalog", "to": "shared"}],
          "views": [{"id": "packages", "diagram": "uml.package", "nodeIds": ["catalog", "book", "shared", "money"]},
                    {"id": "packages-2", "diagram": "uml.package", "nodeIds": ["catalog", "book", "shared", "money"]}]}
    for model, cards, kw in ((pk, ["catalog", "shared"], {"view": "packages"}), (pk, ["catalog", "shared"], {}),
                             ({"nodes": [{"id": "a"}, {"id": "b"}], "edges": [{"id": "ab", "from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}, ["a", "a"], {})):
        (Path(d52) / "m.json").write_text(json.dumps(model), encoding="utf-8")
        mcp.MODEL = Path(d52) / "m.json"
        mcp.want.update(view=None, highlight=None, tour=None, story=None)
        try:
            mcp.call("tour", {"cards": cards, **kw}); said52.append(None)
        except mcp.Fail as e:
            said52.append(str(e))
mcp.MODEL, mcp.page = keep52[:2]
mcp.want.clear(); mcp.want.update(keep52[2])
desc52 = mcp.TOOL["tour"]["description"]
ok("audit 52 · tour refuses a card the view draws as a box, and a card that follows itself with no line to itself, as the page's tour() rides neither; its description names the view shown now first",
   said52[0] == "view 'packages' draws 'catalog' as a box that holds cards, and a tour stops only at cards; paths() gives a route of lines between two cards"
   and said52[1] and "view 'packages' draws 'catalog' as a box" in said52[1] and "view 'packages-2' draws 'catalog' as a box" in said52[1]
   and said52[2] == "'a' follows itself, and no line on view 'v' joins it to itself; paths() gives a route of lines between two cards"
   and "the view shown now if it shows the cards and draws those lines, else the first view that does" in desc52, (said52, desc52))
# audit 53: a tour or highlight with no view took the view asked for last (none on a fresh server) as the view shown now, so
# it rode the first view and the page jumped off the root view it opens on, or off the view the reader moved to
keep53 = (mcp.MODEL, mcp.page, dict(mcp.want), dict(mcp.pages), mcp.view_n)
mcp.page = lambda: ("v", None)
rode53 = []
with tempfile.TemporaryDirectory() as d53:
    mcp.MODEL = Path(d53) / "two.json"
    mcp.MODEL.write_text(json.dumps({"root": "second", "nodes": [{"id": x, "label": x} for x in "xyz"], "edges": [{"id": "e", "from": "x", "to": "y"}],
                                     "views": [{"id": "first", "parent": "second", "nodeIds": ["x", "y"]}, {"id": "second", "nodeIds": ["x", "y", "z"]}]}), encoding="utf-8")
    def ride53(tool, args):
        mcp.call(tool, args); rode53.append(mcp.want["view"])
    mcp.want.update(view=None, highlight=None, tour=None, story=None); mcp.pages.clear()
    ride53("tour", {"cards": ["x", "y"]})                                    # no page yet: the root view, where a page opens
    mcp.call("show_view", {"view": "first"})
    mcp.report("p53", {"state": {"view": "second"}, "ack": "an older command"})  # a page that has not shown show_view yet
    ride53("tour", {"cards": ["x", "y"]})
    mcp.call("show_view", {"view": "first"})
    mcp.report("p53", {"state": {"view": "first"}, "ack": mcp.latest})          # shown, then the reader moves to second
    mcp.report("p53", {"state": {"view": "second"}})
    ride53("tour", {"cards": ["x", "y"]})
    ride53("highlight", {"refs": ["x"]})
mcp.MODEL, mcp.page, mcp.view_n = keep53[0], keep53[1], keep53[4]
mcp.want.clear(); mcp.want.update(keep53[2]); mcp.pages.clear(); mcp.pages.update(keep53[3])
ok("audit 53 · tour and highlight with no view stay on the view shown now: the root view on a fresh server, the view a page reports once it has shown the last one asked for",
   rode53 == ["second", "first", "second", "second"], rode53)
# view_for (audit 11): a line with no id, a box, a chip lands on the view that shows it, never on the first view (every card dimmed)
m = {"nodes": [{"id": x} for x in "abcd"], "edges": [{"from": "c", "to": "d"}], "views": [{"id": "ctx", "nodeIds": ["a", "b"]},
     {"id": "inner", "nodeIds": ["c", "d"], "containers": [{"id": "box", "nodeIds": ["c", "d"]}]}]}
at = [mcp.view_for(m, mcp.refs(m, [r]), None) for r in ("c->d#0", {"type": "container", "id": "box"}, {"type": "chip", "node": "c", "value": "x"})]
ok("audit 11 · view_for: a line with no id, a box and a chip each land on the view that shows them", at == ["inner"] * 3, at)
# view_for (audit 12): a line that ends on a port or on a box, and a port's Ref, land on the view that draws them
m = {"nodes": [{"id": "a"}, {"id": "c", "members": [{"id": "c.p", "members": [{"id": "c.p.q"}]}, {"id": "c.part"}]}, {"id": "d"},
               {"id": "t", "members": [{"id": "t.r"}]}],
     "edges": [{"id": "e1", "from": "c.p", "to": "d"}, {"id": "e2", "from": "box", "to": "d"},
               {"id": "e3", "from": "t.r", "to": "c.p", "props": {"ends": {"from": {"part": "c.part"}}}}],
     "views": [{"id": "ctx", "nodeIds": ["a", "d"]}, {"id": "inner", "nodeIds": ["c", "d"], "containers": [{"id": "box", "nodeIds": ["c"]}]}]}
at = [mcp.view_for(m, mcp.refs(m, [r]), "ctx") for r in ("e1", "e2", "e3", {"type": "node", "id": "c.p.q"})]
ok("audit 12 · view_for: a line to a port, to a box, to a port on a part's type, and a nested port's Ref land on the view that draws them",
   at == ["inner"] * 4, at)


# ---- the edit tools (evolve-plan.md product item 2): each the page's own gesture, written as one undo step, in process here
# (the page reloading with a change, and the same change made on the page, are below with Chrome)
keep_ed = (mcp.MODEL, mcp.page, mcp.URL)
mcp.page, mcp.URL = (lambda: ("v", None)), "http://127.0.0.1:1"
ed_dir = Path(tempfile.mkdtemp())


def edit_on(name, src):
    """A copy of src as the server's model, with no undo history: its path."""
    mcp.MODEL = ed_dir / name
    mcp.MODEL.write_bytes(Path(src).read_bytes())
    mcp.history_file().unlink(missing_ok=True)
    return mcp.MODEL


def ed(name, **a):
    """An edit tool's answer, or its refusal as the text the assistant reads (FAIL: ...)."""
    try:
        return mcp.call(name, a)
    except mcp.Fail as e:
        return "FAIL " + str(e)


def model_now():
    return json.loads(mcp.MODEL.read_text(encoding="utf-8"))


def by_id(m, i):
    return next((x for x in [*m.get("nodes", []), *m.get("edges", [])] if x.get("id") == i), None)


CLASS = ROOT / "tests" / "fixtures" / "mcp-class.json"  # copies of the showcase models, pinned here
edit_on("class.json", CLASS)
first = CLASS.read_text(encoding="utf-8")
dry = ed("add_card", view="sales", label="Invoice", dry_run=True)
ok("edit · add_card with dry_run answers with the page's commands (its N: id class1 of the view's first kind) and diff()'s words, and writes nothing",
   dry.get("commands") == [{"op": "add", "element": {"id": "class1", "type": "uml.Class", "label": "Invoice"}, "view": "sales"}] and dry.get("summary") == ["adds Invoice"]
   and "written" not in dry and mcp.MODEL.read_text(encoding="utf-8") == first and not mcp.history_file().exists(), dry)
got = [ed("add_card", view="sales", label="Invoice", type="Interface", box="sales"),
       ed("connect", view="sales", **{"from": "customer", "to": "interface1"}, type="uml.Dependency", label="uses"),
       ed("rename", id="interface1", label="Billable"),
       ed("set_field", id="interface1", path="props.abstract", value=True),
       ed("set_field", view="sales", path="title", value="Sales"),
       ed("pin", view="sales", id="interface1", col=0, row=4)]
m1 = model_now()
ok("edit · add_card (a type by its palette name, into a box), connect, rename, set_field on an element and on a view, and pin each write the model file",
   all(g.get("written") is True for g in got) and by_id(m1, "interface1") == {"id": "interface1", "type": "uml.Interface", "label": "Billable", "parent": "sales", "props": {"abstract": True}}
   and by_id(m1, "dependency1") == {"id": "dependency1", "type": "uml.Dependency", "from": "customer", "to": "interface1", "label": "uses"}
   and m1["views"][0]["title"] == "Sales" and m1["views"][0]["layout"] == {"interface1": [0, 4]} and "dependency1" in m1["views"][0]["edges"]
   and got[0]["added"] == ["interface1"] and got[0]["commands"][1] == {"op": "reparent", "id": "interface1", "parent": "sales"}, [got, by_id(m1, "interface1")])
# the file is written as it was: a card renamed is one line changed, a card added one line in its list, every other line as it was
import difflib
diffs = [x for x in difflib.unified_diff(first.splitlines(), mcp.MODEL.read_text(encoding="utf-8").splitlines(), n=0, lineterm="") if x[:1] in "+-" and x[:3] not in ("+++", "---")]
# the card and the line, one line each in their lists (the items before them gain a comma); the view's title, lists and new layout
ok("edit · the model file keeps its own layout: what the change leaves alone is its text as it was, a card and a line one line each",
   len([x for x in diffs if x.startswith("-")]) == 6 and len([x for x in diffs if x.startswith("+")]) == 9
   and '+  { "id": "dependency1", "type": "uml.Dependency", "from": "customer", "to": "interface1", "label": "uses" }' in diffs, diffs)
got = [ed("pin", view="sales", id="interface1"), ed("move_to_box", view="sales", id="interface1", box=None),
       ed("remove", ids="customer", view="sales"), ed("remove", ids=["interface1"], from_model=True)]
m2 = model_now()
ok("edit · pin with no place (its pin off), move_to_box out of every box, remove from a view (hidden there) and from the model (its lines too)",
   all(g.get("written") is True for g in got) and by_id(m2, "interface1") is None and by_id(m2, "dependency1") is None
   and "customer" not in m2["views"][0]["nodeIds"] and by_id(m2, "customer") and "layout" not in m2["views"][0] or m2["views"][0].get("layout") == {}, got)
# the type's own rules, where the page asks them: a sequence's reply pairs with its call (props.replyTo, and its slot);
# BPMN refuses a message flow from a start event and a task moved out of its pool with its flows; a sequence keeps no pins
edit_on("seq.json", ROOT / "tests" / "fixtures" / "mcp-sequence.json")
call_ = ed("connect", view="checkout", **{"from": "shopper", "to": "storefront"}, type="Call", label="browse")
reply_ = ed("connect", view="checkout", **{"from": "storefront", "to": "shopper"}, type="Reply", label="page")
unnamed = ed("connect", view="checkout", **{"from": "shopper", "to": "storefront"}, type="uml.Message")
nopin = ed("pin", view="checkout", id="shopper", col=1, row=0)
edit_on("bpmn.json", ROOT / "tests" / "fixtures" / "mcp-bpmn.json")
flow = ed("connect", view="order-to-shipment", **{"from": "basket-ready", "to": "order-received"})
pool = ed("move_to_box", view="order-to-shipment", id="bp-take-payment", box="bp-shopper")
ok("edit · a typed view's hooks decide, as on the page: a reply pairs with its call; BPMN's rules on flows and pools refuse; a sequence keeps no pins; an ambiguous kind is asked by name",
   call_.get("written") and reply_.get("written") and reply_["commands"][0]["element"]["props"] == {"sort": "reply", "replyTo": call_["added"][0]}
   and "index" in call_["commands"][0] and unnamed.startswith("FAIL connect: view \"checkout\" (uml.sequence) draws 5 kinds of \"uml.Message\"; give type as one's name: \"Call\" (uml.Message)")
   and flow == "FAIL connect: A message flow cannot start at a start event; nothing written"
   and pool == "FAIL move_to_box: Move its sequence flows first: a sequence flow stays in its pool; nothing written"
   and nopin.startswith("FAIL pin: a uml.sequence view places its elements itself"), [call_, reply_, unnamed, flow, pool, nopin])
# audit 76: a move that would put a line inside its box, or break an assembly, is refused in the rule's words, as the page's
# Owner field and drop are: a device into the node it has a communication path to; a component into one its assembly joins
def own_model(name, nodes, edges, view):
    (ed_dir / name).write_text(json.dumps({"schemaVersion": 2, "nodes": nodes, "edges": edges, "views": [view]}), encoding="utf-8")
    return edit_on(name, ed_dir / name)
own_model("dep76.json", [{"id": "phone", "type": "uml.Device", "label": "Phone"}, {"id": "srv", "type": "uml.Node", "label": "Server"},
                         {"id": "app", "type": "uml.Artifact", "label": "app.jar", "parent": "srv"}, {"id": "rack", "type": "uml.Node", "label": "Rack"}],
          [{"id": "p1", "type": "uml.CommunicationPath", "from": "phone", "to": "srv", "label": "HTTPS"}],
          {"id": "d", "diagram": "uml.deployment", "nodeIds": ["phone", "srv", "app", "rack"]})
dep_in, dep_ok = ed("move_to_box", view="d", id="phone", box="srv"), ed("move_to_box", view="d", id="phone", box="rack")
own_model("comp76.json", [{"id": "web", "type": "uml.Component", "label": "Web", "members": [{"id": "web.out", "type": "uml.Port", "label": "out"}]},
                          {"id": "pay", "type": "uml.Component", "label": "Payments", "members": [{"id": "pay.in", "type": "uml.Port", "label": "in"}]},
                          {"id": "gw", "type": "uml.Component", "label": "Gateway", "parent": "pay"}],
          [{"id": "a1", "type": "uml.Connector", "from": "web.out", "to": "pay.in", "props": {"kind": "assembly"}}],
          {"id": "c", "diagram": "uml.component", "nodeIds": ["web", "pay", "gw"]})
comp_in = ed("move_to_box", view="c", id="web", box="pay")
ok("edit · move_to_box refuses a device into the node it has a communication path to, and a component into one its assembly joins (audit 76)",
   dep_in == "FAIL move_to_box: A communication path cannot join a node and what it holds; nothing written"
   and isinstance(dep_ok, dict) and dep_ok.get("written") is True
   and comp_in == "FAIL move_to_box: An assembly joins two components or their ports, neither inside the other; nothing written", [dep_in, dep_ok, comp_in])
# a map view: the commands a host would write (the edit demo page), boxes in the view's containers
edit_on("map.json", ROOT / "tests" / "fixtures" / "integration.json")
got = [ed("add_card", view="system", label="Billing", kind="backend", box="rides"), ed("connect", view="system", **{"from": "backend1", "to": "pricing"}, kind="sync", label="prices"),
       ed("rename", view="system", id="rides", label="Ride services"), ed("move_to_box", view="system", id="backend1", box="fleet-box")]
m3 = model_now()
sysv = next(v for v in m3["views"] if v["id"] == "system")
ok("edit · on a map view: add_card of a kind into a box, connect, rename a box, move_to_box between the view's boxes",
   all(g.get("written") for g in got) and by_id(m3, "backend1") == {"id": "backend1", "label": "Billing", "kind": "backend"} and "backend1" in sysv["nodeIds"]
   and by_id(m3, "line1") == {"id": "line1", "from": "backend1", "to": "pricing", "kind": "sync", "label": "prices"}
   and [c["label"] for c in sysv["containers"] if c["id"] == "rides"] == ["Ride services"]
   and [c["id"] for c in sysv["containers"] if "backend1" in c["nodeIds"]] == ["fleet-box"], got)
# refusals: each says why and writes nothing
edit_on("class.json", CLASS)
refused = [ed("add_card", view="nope", label="X"), ed("add_card", view="sales", label="X", kind="database"), ed("add_card", view="sales", label=" "),
           ed("connect", view="sales", **{"from": "customer", "to": "order"}), ed("connect", view="sales", **{"from": "customer", "to": "payments"}, type="Dependency"),
           ed("move_to_box", view="sales", id="customer", box="sales"), ed("remove", ids="customer"), ed("set_field", path="label", value="x"),
           ed("pin", view="sales", id="customer", col=1), ed("add_card", view="sales", label="X", id="order"),
           ed("apply", edits=[{"op": "set", "view": "sales", "path": "nodeIds", "value": ["customer", "ghost"]}]),
           ed("apply", edits=[{"tool": "rename", "id": "customer", "label": "Client"}, {"tool": "rename", "id": "ghost", "label": "G"}]),
           ed("apply", edits=[{"tool": "rename", "id": "customer", "label": "C", "dry_run": True}]), ed("apply", edits=[{"tool": "paths"}]), ed("apply", edits=[])]
ok("edit · refusals say why and write nothing: no such view; a map card's kind on a typed view; no label; a line kind not given; a box as a line's end; "
   "a box it is in already; remove with no view; set_field with no target; pin with a column alone; an id in use; a change that adds a validate() error; a step that fails, named",
   all(isinstance(r, str) and r.startswith("FAIL ") for r in refused) and mcp.MODEL.read_text(encoding="utf-8") == first and not mcp.history_file().exists()
   and "no view \"nope\"" in refused[0] and "kind is a map card's" in refused[1] and "a card needs a label" in refused[2] and "draws 5 kinds of line" in refused[3]
   and "is not drawn as a card on view \"sales\" but as a box that holds cards" in refused[4] and "is in \"sales\" already" in refused[5]
   and "from_model: true" in refused[6] and "give id (an element) or view" in refused[7] and "col (a whole number) and row" in refused[8] and "is used already" in refused[9]
   and refused[10].startswith("FAIL nothing written: the change adds 1 error validate() finds: views[0].nodeIds[1]") and "ghost" in refused[10]
   and refused[11].startswith("FAIL step 2 of 2: rename: \"ghost\" is not an element") and "a step has no dry_run" in refused[12]
   and "\"paths\" is not an edit tool" in refused[13] and "edits is empty" in refused[14], refused)
# preview: the whole change in words, on a copy; apply: the same, written as one step
steps = [{"tool": "add_card", "view": "sales", "label": "Invoice", "id": "invoice"}, {"tool": "connect", "view": "sales", "from": "invoice", "to": "order", "type": "Association"},
         {"op": "set", "id": "invoice", "path": "props.abstract", "value": True}]
pre = ed("preview", edits=steps)
unchanged = mcp.MODEL.read_text(encoding="utf-8") == first
app = ed("apply", edits=steps)
ok("edit · preview runs the steps on a copy (an edit tool's call and an apply() command), answers what apply then writes, as one change",
   unchanged and "written" not in pre and app.get("written") is True and pre["commands"] == app["commands"] and pre["summary"] == app["summary"]
   and pre["summary"] == ["adds Invoice, to Order"] and pre["added"] == ["invoice", "association1"] and len(mcp.history()["done"]) == 1, [pre, app])
# undo and redo: the file as it was, byte for byte; refused when another editor wrote it since; a new change ends redo
one = mcp.MODEL.read_text(encoding="utf-8")
ed("rename", id="invoice", label="Bill")
u1, u2 = ed("undo"), None
back1 = mcp.MODEL.read_text(encoding="utf-8") == one
u2 = ed("undo")
back0 = mcp.MODEL.read_text(encoding="utf-8") == first
u3 = ed("undo")
r1 = ed("redo")
fwd = mcp.MODEL.read_text(encoding="utf-8") == one
mcp.MODEL.write_text(mcp.MODEL.read_text(encoding="utf-8").replace('"Invoice"', '"Invoice (by hand)"'), encoding="utf-8")
r2, u4 = ed("redo"), ed("undo")
ed("rename", id="order", label="Purchase")
r3 = ed("redo")
ok("edit · undo puts the file back as it was, change by change, and redo writes it again; each refused when another editor wrote the file since; a new change ends redo",
   u1.get("undone") == ["renames Invoice to Bill"] and back1 and u2.get("undone") == ["adds Invoice, to Order"] and back0 and u3.startswith("FAIL nothing to undo")
   and r1.get("redone") == ["adds Invoice, to Order"] and fwd and r2.startswith("FAIL the model file changed since that change was taken back")
   and u4.startswith("FAIL the model file changed since that change was written") and r3.startswith("FAIL nothing to redo"), [u1, u2, u3, r1, r2, u4, r3])
# the history keeps each change's text before it and a hash after (not both texts), its last KEEP changes and no more than
# ROOM of text, the oldest dropped first; undo and redo still work on what it keeps
keep_h = (mcp.KEEP, mcp.ROOM)
edit_on("class.json", CLASS)
mcp.KEEP = 3
for name in ("A", "B", "C", "D"):
    ed("rename", id="order", label=name)
h4 = mcp.history()
mcp.KEEP, mcp.ROOM = 50, 1
ed("rename", id="order", label="E")
h5 = mcp.history()
undid = ed("undo")
mcp.KEEP, mcp.ROOM = keep_h
ok("edit · the undo history holds each change's text before it and a hash after, its last KEEP changes and no more than ROOM of text",
   [c["summary"] for c in h4["done"]] == [["renames A to B"], ["renames B to C"], ["renames C to D"]] and all(set(c) >= {"before", "after_sha"} and "after" not in c for c in h4["done"])
   and [c["summary"] for c in h5["done"]] == [["renames D to E"]] and undid.get("undone") == ["renames D to E"] and '"D"' in mcp.MODEL.read_text(encoding="utf-8"), (h4, h5, undid))
# the history sits next to the model, not as a .json a folder of models would take for one; no temporary file is left behind
ok("edit · the undo history is MODEL.json.undo next to the model; the writes leave no temporary file",
   mcp.history_file() == ed_dir / "class.json.undo" and mcp.history_file().is_file() and not [p for p in ed_dir.iterdir() if p.name.endswith(".tmp")], sorted(p.name for p in ed_dir.iterdir()))
# a write the server did not make, between the change and its write: nothing written over it
edit_on("class.json", CLASS)
out = mcp.change([{"tool": "rename", "id": "order", "label": "Purchase"}])
mcp.MODEL.write_text(first.replace('"Customer"', '"Client"'), encoding="utf-8")
try:
    mcp.commit(out); raced = None
except mcp.Fail as e:
    raced = str(e)
ok("edit · a change is not written over a file another editor wrote meanwhile", raced and raced.startswith("the model file changed while the change was made")
   and '"Client"' in mcp.MODEL.read_text(encoding="utf-8") and '"Purchase"' not in mcp.MODEL.read_text(encoding="utf-8"), raced)
# audit 72: an undo history holding a change that is not an object (or a text that is not a string), a hand-edited or
# half-merged file, refuses each edit tool before the model is written, in words that name the file; undo and redo too
bad_h = []
for hist in ({"done": [1], "undone": []}, {"done": [], "undone": ["x"]}, {"done": [{"before": 7, "after_sha": "", "summary": []}], "undone": []},
             {"done": [None, {"before": "{}"}], "undone": []}):
    edit_on("class.json", CLASS)
    mcp.history_file().write_text(json.dumps(hist), encoding="utf-8")
    said = [ed("rename", id="order", label="Purchase"), ed("undo"), ed("redo")]
    bad_h.append((said, mcp.MODEL.read_text(encoding="utf-8") == first, json.loads(mcp.history_file().read_text(encoding="utf-8")) == hist))
ok("edit · an undo history holding a change that is not an object, or a text that is not a string, refuses the change before anything is written, naming the file (audit 72)",
   all(all(isinstance(x, str) and x.startswith("FAIL the undo history class.json.undo cannot be read") and "nothing written" in x for x in said) and same and kept_as
       for said, same, kept_as in bad_h), bad_h)
# audit 65: a model file in UTF-8 with a BOM, UTF-16 or UTF-32 (a Windows editor, PowerShell 5.1) keeps its encoding and BOM
# through an edit, and undo() puts it back byte for byte, redo() writes the edit's bytes again
enc_got = {}
for name, data in (("utf-8", first.encode()), ("utf-8 BOM", b"\xef\xbb\xbf" + first.encode()), ("utf-8 BOM CRLF", b"\xef\xbb\xbf" + first.replace("\n", "\r\n").encode()),
                   ("utf-16 LE BOM", first.encode("utf-16")), ("utf-16 BE BOM", b"\xfe\xff" + first.encode("utf-16-be")), ("utf-16 LE", first.encode("utf-16-le")),
                   ("utf-16 BE", first.encode("utf-16-be")), ("utf-32 BOM", first.encode("utf-32")), ("utf-8 two BOMs", b"\xef\xbb\xbf" * 2 + first.encode())):
    edit_on("enc.json", CLASS).write_bytes(data)
    r = ed("rename", id="order", label="Purchase")
    mid = mcp.MODEL.read_bytes()
    u_, back = ed("undo"), mcp.MODEL.read_bytes()
    ed("redo")
    enc_got[name] = (isinstance(r, dict) and r.get("written") is True, mid[:2] == data[:2] and mid != data and mcp.model_text() != first and '"Purchase"' in mcp.model_text(),
                     isinstance(u_, dict) and back == data, mcp.MODEL.read_bytes() == mid)
ok("edit · a model in UTF-8 (a BOM too, CRLF), UTF-16 (LE or BE, a BOM or none) or UTF-32 is edited in its own encoding, undo() puts it back byte for byte and redo() writes the edit again (audit 65)",
   all(all(v) for v in enc_got.values()), enc_got)
# audit 65: set_field cannot write a view's edges that is no list: validate() says it is one, an error the change would add
edit_on("class.json", CLASS)
no_list = [ed("set_field", view="sales", path="edges", value=v) for v in ("x", 5, {})]
ok("edit · set_field refuses a view's edges that is no list, an error validate() finds, and writes nothing (audit 65)",
   all(isinstance(r, str) and r.startswith("FAIL nothing written") and "edges is a list" in r for r in no_list) and mcp.MODEL.read_text(encoding="utf-8") == first
   and not mcp.history_file().exists(), no_list)
# the model file's text kept: an untouched file's every byte; each test model, a card renamed, as JSON the model
import subprocess as sp
kept = sp.run(["node", "--input-type=module", "-e", f"""
import {{ written }} from {json.dumps((ROOT / "umlimator_edit.mjs").as_uri())}; import fs from 'node:fs';
const R = {json.dumps(str(ROOT) + "/")}, files = [...fs.readdirSync(R + 'tests').filter(f => f.endsWith('.json')).map(f => 'tests/' + f),
  ...fs.readdirSync(R + 'tests/fixtures').filter(f => f.endsWith('.json')).map(f => 'tests/fixtures/' + f)], bad = [];
for (const f of files) {{ const src = fs.readFileSync(R + f, 'utf8'), m = JSON.parse(src.replace(/^\\ufeff/, '')), m2 = structuredClone(m);
  if (written(src, m, m) !== src) bad.push(f + ': not kept');
  if (m2.nodes && m2.nodes[0]) m2.nodes[0].label = 'Renamed'; const t = written(src, m, m2);
  if (JSON.stringify(JSON.parse(t)) !== JSON.stringify(m2) || Math.abs(t.split('\\n').length - src.split('\\n').length) > 1) bad.push(f + ': rename'); }}
console.log(JSON.stringify({{ files: files.length, bad }}));"""], capture_output=True, text=True)
kept = json.loads(kept.stdout or "{}") if not kept.returncode else {"error": kept.stderr[-500:]}
ok("edit · every model of the tests (minimal, stress, fixtures, in their many layouts): untouched, its text is kept to the byte; a card renamed, its text is the new model, its lines as many",
   kept.get("files", 0) > 60 and kept.get("bad") == [], kept)
mcp.MODEL, mcp.page, mcp.URL = keep_ed


class Chrome:
    """Headless Chrome over --remote-debugging-pipe: open pages, evaluate in them, close them."""

    def __init__(self):
        self.prof = tempfile.mkdtemp()
        r_in, w_in = os.pipe()
        r_out, w_out = os.pipe()
        def fds():
            os.dup2(r_in, 3)
            os.dup2(w_out, 4)
        self.p = subprocess.Popen([u.chrome(), "--headless", "--disable-gpu", "--remote-debugging-pipe", f"--user-data-dir={self.prof}",
                                   "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "about:blank"],
                                  pass_fds=(3, 4, r_in, w_out), preexec_fn=fds, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.close(r_in)
        os.close(w_out)
        self.w, self.r, self.buf, self.n = os.fdopen(w_in, "wb", buffering=0), os.fdopen(r_out, "rb", buffering=0), b"", 0

    def call(self, method, params=None, sid=None):
        self.n += 1
        self.w.write(json.dumps({"id": self.n, "method": method, "params": params or {}, **({"sessionId": sid} if sid else {})}).encode() + b"\0")
        while True:
            while b"\0" not in self.buf:
                chunk = self.r.read(1 << 16)
                if not chunk:
                    raise RuntimeError("Chrome closed its pipe")
                self.buf += chunk
            raw, self.buf = self.buf.split(b"\0", 1)
            m = json.loads(raw)
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m.get("result", {})

    def open(self, url):
        """A tab on url, with motion as a reader's who has not asked for less: the host's own setting (a Mac with Reduce
        motion on) would make every tour a path lit at rest, which the reduced-motion checks ask for themselves (#132)."""
        tid = self.call("Target.createTarget", {"url": url})["targetId"]
        sid = self.call("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]
        self.motion(sid)
        return tid, sid

    def motion(self, sid, reduce=False):
        self.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce" if reduce else "no-preference"}]}, sid)

    def eval(self, sid, expr):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, sid)
        return r.get("result", {}).get("value")

    def close(self, tid):
        self.call("Target.closeTarget", {"targetId": tid})

    def quit(self):
        self.p.kill()
        self.p.wait()
        shutil.rmtree(self.prof, ignore_errors=True)


def until(cond, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        got = cond()
        if got:
            return got
        time.sleep(0.2)
    return cond()


work = Path(tempfile.mkdtemp())
model = work / "integration.json"
fixture = json.loads((ROOT / "tests" / "fixtures" / "integration.json").read_text(encoding="utf-8"))
model.write_text(json.dumps(fixture), encoding="utf-8")
srv = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(model), "--port", "0"], stdin=subprocess.PIPE,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
stop = threading.Timer(400, srv.kill); stop.daemon = True; stop.start()  # a server that stops answering fails here, not on CI's clock
n = [0]


def rpc(method, params=None):
    n[0] += 1
    srv.stdin.write(json.dumps({"jsonrpc": "2.0", "id": n[0], "method": method, "params": params or {}}) + "\n")
    srv.stdin.flush()
    return json.loads(srv.stdout.readline())


def tool(name, **a):
    r = rpc("tools/call", {"name": name, "arguments": a})
    return r["error"]["message"] if "error" in r else "".join(c["text"] for c in r["result"]["content"])


def state():
    """page_state(), with a page's report at pages[0] (or {} when there is none, or no such tool)."""
    try:
        s = json.loads(tool("page_state"))
    except ValueError:
        s = {}
    return {"model": {}, "asked": {}, **s, "pages": s.get("pages") or [{}]}


url = re.search(r"http://127\.0\.0\.1:\d+/\?k=\w+", rpc("initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                                                               "clientInfo": {"name": "tests/mcp.py", "version": "0"}})["result"]["instructions"]).group(0)
# m8ven.ai's quality report: no tool said whether it reads, writes or destroys; a directory (OpenAI's) refuses a tool without all four hints
HINTED = {"readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"}
listed = rpc("tools/list")["result"]["tools"]
hinted = {t["name"]: t.get("annotations") for t in listed}
ok("annotations · every tool says all four hints, each a boolean, and no other",
   len(listed) == 26 and all(isinstance(h, dict) and set(h) == HINTED and all(type(x) is bool for x in h.values()) for h in hinted.values()), hinted)
ok("annotations · a read (describe_view, preview) writes nothing; a page tool (show_view) changes the page, not the model; add_card adds, "
   "remove and apply can take away; none reaches past the model, its page and the files it is given",
   all(hinted[x]["readOnlyHint"] and not hinted[x]["destructiveHint"] for x in ("describe_view", "preview"))
   and not hinted["show_view"]["readOnlyHint"] and not hinted["show_view"]["destructiveHint"] and hinted["show_view"]["idempotentHint"]
   and not hinted["tour"]["idempotentHint"]
   and not hinted["add_card"]["readOnlyHint"] and not hinted["add_card"]["destructiveHint"] and not hinted["add_card"]["idempotentHint"]
   and not hinted["remove"]["readOnlyHint"] and hinted["remove"]["destructiveHint"]
   and hinted["apply"]["destructiveHint"] and not hinted["apply"]["idempotentHint"] and not hinted["undo"]["idempotentHint"]
   and not any(h["openWorldHint"] for h in hinted.values()), hinted)
LOOK = """(() => { const m = window.umlimatorMap, host = document.querySelector('#m-canvas .umlimator'),
  svg = host && host.shadowRoot && host.shadowRoot.querySelector('svg'), cards = svg ? [...svg.querySelectorAll('.node')] : [];
  return m && { view: m.view, lit: cards.filter(c => !c.getAttribute('opacity')).map(c => c.dataset.id).sort(), dimmed: cards.filter(c => c.getAttribute('opacity')).length,
    overlays: m.state.overlays, story: m.state.story, banner: (document.getElementById('mcp-banner') || {}).textContent || null }; })()"""
BOXES = "(() => { const host = document.querySelector('#m-canvas .umlimator'); return host ? host.shadowRoot.querySelectorAll('.family').length : -1; })()"
# audit 16: stories, or a story's steps, that are no list ended list_views and play_story in an internal error
said = []
for bad in ({"stories": 7}, {"stories": [{"id": "s", "steps": 3}]}):
    model.write_text(json.dumps(fixture | bad), encoding="utf-8")
    said += [tool("list_views"), tool("play_story", id="s")]
# audit 17: a null stories, or a story's null steps, is no stories (as validate() reads it), not a refused model
model.write_text(json.dumps(fixture | {"stories": None}), encoding="utf-8")
said17 = tool("list_views")
model.write_text(json.dumps(fixture | {"stories": [{"id": "s", "steps": None}]}), encoding="utf-8")
said17b = tool("list_views")
ok("list_views on a null stories or a null steps lists the views, no tool error (audit 17)",
   '"trips"' in said17 and "not a list" not in said17 + said17b and re.search(r'"steps":\s*0', said17b), [said17[:200], said17b[:300]])
# audit 18: a member id that is no string ended highlight and tour in an internal error (-32603); so did a tool name that is no string
mem = json.loads(json.dumps(fixture)); mem["nodes"][0]["members"] = [{"id": ["p"], "label": "p"}]
model.write_text(json.dumps(mem), encoding="utf-8")
said18 = [tool("highlight", refs=[fixture["nodes"][0]["id"]]), tool("tour", cards=[fixture["nodes"][0]["id"], fixture["nodes"][1]["id"]])]
named18 = [rpc("tools/call", {"name": x, "arguments": {}}).get("error", {}) for x in (["list_views"], {"a": 1})]
ok("highlight and tour on a model whose member id is no string name the field; a tool name that is no string is an unknown tool (-32602), no internal error (audit 18)",
   all("nodes[0].members[0].id is not a string" in x for x in said18) and [e.get("code") for e in named18] == [-32602, -32602]
   and all(e.get("message", "").startswith("Unknown tool") for e in named18), [said18, named18])
model.write_text(json.dumps(fixture), encoding="utf-8")
ok("list_views and play_story on stories, or steps, that are no list: the tool names the field, no internal error (audit 16)",
   all("stories is not a list" in x for x in said[:2]) and all("stories[0].steps is not a list" in x for x in said[2:]), said)
chrome = Chrome()
try:
    # the assistant builds a picture before any page is open: a view, then a highlight on it (no view named)
    said = tool("show_view", view="trips")
    ok("a page tool with no page open says so, with the URL", said.startswith("No page is connected") and url in said, said)
    tool("highlight", refs=["fare", "lifecycle"])
    tab, sid = chrome.open(url)
    got = until(lambda: (lambda s: s if s and s["view"] == "trips" and "mcp" in s["overlays"] else None)(chrome.eval(sid, LOOK)))
    ok("mcp-latest-command#1 · a page that opens late shows the view, then the highlight on it", got and got["lit"] == ["fare", "lifecycle"]
       and got["dimmed"] == 10, got)
    ps = until(lambda: (lambda s: s if (s["pages"][0].get("state") or {}).get("view") == "trips" else None)(state())) or state()
    ok("mcp-page-player#1 · page_state() reads what the page shows: its MapState, and that it shows the latest version",
       (ps["pages"][0].get("state") or {}).get("overlays") == ["mcp"] and ps["pages"][0].get("latest") and ps["asked"].get("view") == "trips", ps)

    # a page tool's answer comes once the page has shown it
    said = tool("highlight", refs=["payments"], view="system")
    got = chrome.eval(sid, LOOK)
    ok("mcp-sse-clients#1 · a tool says shown once the page did, and the page shows it", said.startswith(f"Shown on 1 page at {url}, on view system")
       and got["view"] == "system" and got["lit"] == ["payments"], (said, got))
    ok("…and page_state() names the command the page showed last", state()["pages"][0].get("command"), state())

    # the reader moves: the assistant's highlight is about its view, so it is off on another, and back on its own
    chrome.eval(sid, "window.umlimatorMap.setView('context')")
    away = until(lambda: (lambda s: s if s["view"] == "context" else None)(chrome.eval(sid, LOOK)))
    chrome.eval(sid, "window.umlimatorMap.setView('system')")
    back = until(lambda: (lambda s: s if s["view"] == "system" and "mcp" in s["overlays"] else None)(chrome.eval(sid, LOOK)))
    ok("rule 3 · the assistant's highlight is its own layer: off on another view (nothing dims), and back on its own",
       away and "mcp" not in away["overlays"] and away["dimmed"] == 0 and back and back["lit"] == ["payments"], (away, back))

    # the model stops rendering: the page keeps the last version that did, and the tools say why
    broken = dict(fixture, edges=[*fixture["edges"], {"id": "oops", "from": "fare", "to": "nobody"}])
    model.write_text(json.dumps(broken), encoding="utf-8")
    said = tool("show_view", view="trips")
    got = until(lambda: (lambda s: s if s and s["view"] == "trips" and s["banner"] else None)(chrome.eval(sid, LOOK)))
    ps = state()
    ok("mcp-page-render#1 · a model that no longer renders: the page keeps its map, says so, and the tool says why",
       said.startswith("The model no longer renders, so the page shows its last version that did:") and "nobody" in said and "Shown on 1 page" in said
       and got and "no longer renders" in got["banner"] and ps["model"].get("renders") is False and ps["pages"][0].get("latest"), (said, got, ps.get("model")))
    model.write_text(json.dumps(fixture)[:-40], encoding="utf-8")  # mid-edit: a version that is not JSON (audit 10)
    said, ps = tool("show_view", view="system"), state()
    got = until(lambda: (lambda s: s if s and s["view"] == "system" and "not JSON" in (s["banner"] or "") else None)(chrome.eval(sid, LOOK)))
    ok("mcp-page-render#2 · a version that is not JSON: page_state() says it does not render, and a page tool shows the last that did, with why",
       said.startswith("The model no longer renders, so the page shows its last version that did: it is not JSON") and got
       and ps["model"].get("renders") is False and "not JSON" in ps["model"].get("error", ""), (said, got, ps.get("model")))
    model.write_text(json.dumps(fixture), encoding="utf-8")
    said = tool("show_view", view="fleet")
    got = until(lambda: (lambda s: s if s and s["view"] == "fleet" and not s["banner"] else None)(chrome.eval(sid, LOOK)))
    ok("…and once it renders again, the page draws it", said.startswith("Shown on 1 page") and got, (said, got))

    # a command the page can't finish (a stuck move, as in a tab in the background) is answered with why, in time
    chrome.eval(sid, "window.umlimatorMap.setView = () => new Promise(() => {})")
    t = time.monotonic()
    said = tool("show_view", view="context")
    ok("mcp-page-player#2 · a command the page can't finish is answered with why, within the page's limit",
       "could not show it: it took more than 5 s here" in said and time.monotonic() - t < 7.5, said)
    chrome.close(tab)
    time.sleep(2.5)  # the server pings each page every 2 s: the closed one is gone by then
    said = tool("show_view", view="trips")
    ok("mcp-sse-clients#1 · a closed tab is not counted", said.startswith("No page is connected"), said)

    # a tour that has ended is not played again for a page that opens later
    tab, sid = chrome.open(url)
    until(lambda: chrome.eval(sid, "!!(window.umlimatorMap && window.umlimatorMap.view === 'trips')"))
    until(lambda: state()["pages"][0].get("state"))  # the page's event stream is connected
    # as C10's highlight (#252): ask again until the server counts the stream. A loaded runner's page may take longer than
    # the tool's 6 s to answer: then the test waits on the page itself, whose report that the tour ended (an ack of it) is
    # what takes the tour out
    said = until(lambda: (lambda r: None if r.startswith("No page is connected") else r)(tool("tour", cards=["rider-app", "trip-api", "lifecycle"]))) or "No page is connected"
    ended = until(lambda: "tour" in state()["asked"] and state()["asked"]["tour"] is None, 60)
    ok("mcp-latest-command#3 · a tour that ended is taken out of what a later page is shown",
       (said.startswith("Shown on 1 page") or said.startswith("Sent to 1 open page")) and ended, (said, state()["asked"]))

    # the assistant's tour has ended: its next command leaves a tour the reader started, here a story's step tour (#132)
    chrome.eval(sid, "window.umlimatorMap.play('ride', { step: 3 }) && true")  # the reader's own: a step on trips, with a tour
    rode = until(lambda: chrome.eval(sid, "window.umlimatorMap.state.tour"))
    said = tool("highlight", refs=["fare"], view="trips")
    ok("#132 · a command ends only the assistant's own tour: the next one leaves the tour of a story the reader started riding",
       rode and said.startswith("Shown on 1 page") and chrome.eval(sid, "window.umlimatorMap.state.tour"), (rode, said))
    chrome.eval(sid, "window.umlimatorMap.play(null), true")
    # …and under reduced motion, where a tour is a path lit at rest: a story's step takes the assistant's off and keeps its
    # own through the assistant's next command, and clear() takes the assistant's own off
    chrome.motion(sid, reduce=True)
    lit = "window.umlimatorMap.state.overlays.includes('tour')"
    tool("tour", cards=["rider-app", "trip-api", "lifecycle"])
    mine = chrome.eval(sid, lit)
    chrome.eval(sid, "window.umlimatorMap.play('ride', { step: 3 }) && true")
    theirs = until(lambda: chrome.eval(sid, "!!window.umlimatorMap.state.story && " + lit))
    tool("highlight", refs=["fare"], view="trips")
    kept = chrome.eval(sid, lit)
    chrome.eval(sid, "window.umlimatorMap.play(null), true")
    tool("tour", cards=["rider-app", "trip-api", "lifecycle"])
    tool("clear")
    cleared = not chrome.eval(sid, lit)
    chrome.motion(sid)
    ok("#132 · …under reduced motion too: the story's path lit at rest stays through the assistant's next command, and clear() takes the assistant's own off",
       mine and theirs and kept and cleared, (mine, theirs, kept, cleared))

    # clear() takes the assistant's story off, and leaves the reader's
    said = tool("play_story", id="ride")
    playing = until(lambda: (chrome.eval(sid, LOOK) or {}).get("story"))
    tool("clear")
    stopped = until(lambda: not (chrome.eval(sid, LOOK) or {}).get("story"))
    chrome.eval(sid, "window.umlimatorMap.play('ride') && true")  # the reader's own
    tool("clear")
    time.sleep(0.5)
    ok("mcp-page-player#3 · clear() stops the assistant's story and leaves a story the reader started",
       said.startswith("Shown on 1 page") and playing and stopped and (chrome.eval(sid, LOOK) or {}).get("story"), (said, playing, stopped))

    # a highlight's cards that a new version no longer has are dropped from what pages are shown
    tool("highlight", refs=["fare", "pricing"], view="trips")
    smaller = json.loads(json.dumps(fixture))
    gone = {e["id"] for e in smaller["edges"] if "pricing" in (e["from"], e["to"])}
    smaller["nodes"] = [x for x in smaller["nodes"] if x["id"] != "pricing"]
    smaller["edges"] = [e for e in smaller["edges"] if e["id"] not in gone]
    for v in smaller["views"]:
        v["nodeIds"] = [i for i in v["nodeIds"] if i != "pricing"]
        (v.get("layout") or {}).pop("pricing", None)
        for c in v.get("containers") or []:
            c["nodeIds"] = [i for i in c.get("nodeIds", []) if i != "pricing"]
        if "edges" in v:  # a view's own lines, and the model's it names
            v["edges"] = [e for e in v["edges"] if (e not in gone if isinstance(e, str) else "pricing" not in (e.get("from"), e.get("to")))]
    model.write_text(json.dumps(smaller), encoding="utf-8")
    ps = state()
    ok("mcp-latest-command#2 · a new version's page is never sent ids it no longer has", ps["model"].get("renders")
       and [r.get("id") for r in (ps["asked"].get("highlight") or {}).get("refs", [])] == ["fare"], ps["asked"])

    # the edit tools: a change written is drawn by the open page, which reloads with it; undo() takes it off the page again
    model.write_text(json.dumps(fixture), encoding="utf-8")
    tool("show_view", view="trips")
    HAS = "(id => { const h = document.querySelector('#m-canvas .umlimator'); return !!(h && h.shadowRoot && h.shadowRoot.querySelector(`.node[data-id=\"${id}\"]`)); })"
    added = json.loads(tool("add_card", view="trips", label="Billing", kind="backend"))
    shown_ed = until(lambda: chrome.eval(sid, HAS + "('backend1')"))
    undone = json.loads(tool("undo"))
    gone_ed = until(lambda: chrome.eval(sid, HAS + "('trip-api')") and not chrome.eval(sid, HAS + "('backend1')"))
    ok("edit · a change written reloads the open page, which draws it, and the tool says so; undo() takes it off the page again",
       added.get("written") and added.get("page") == f"The page at {url} reloaded with it." and shown_ed
       and undone.get("undone") == ["adds Billing"] and undone.get("page") == f"The page at {url} reloaded with it." and gone_ed, (added, undone, shown_ed, gone_ed))
    model.write_text(json.dumps(smaller), encoding="utf-8")

    # this server stops, and another model's server takes its port: the tab stays the moped share, and says so
    port = int(re.search(r":(\d+)/", url).group(1))
    srv.stdin.close()
    srv.wait(timeout=30)
    shop = work / "shop.json"
    shutil.copy(ROOT / "tests" / "fixtures" / "integration-c4.json", shop)   # a second, different map: the moped share's Structurizr import
    srv = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(shop), "--port", str(port)], stdin=subprocess.PIPE,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    taken = re.search(r"127\.0\.0\.1:(\d+)", rpc("server/discover")["result"]["instructions"]).group(1)
    said = until(lambda: (chrome.eval(sid, "(document.getElementById('mcp-banner') || {}).textContent") or "").startswith("This page's server now serves another map"), 20)
    ok("mcp-session#1 · a tab outlives its server, and another map's server takes the port: the tab stays, and says so",
       taken == str(port) and said and chrome.eval(sid, "document.title").endswith("Moped share, an example"), (taken, port, said, chrome.eval(sid, "document.title")))

    # audit 25: the page shown while no version renders listened with the run's TOKEN and had no onerror, so after the
    # server ran again (a new TOKEN) its stream was refused and it never drew the map once the model rendered
    late = work / "late.json"
    late.write_text(json.dumps(fixture)[:-40], encoding="utf-8")
    def again():
        global srv
        srv.stdin.close()
        srv.wait(timeout=30)
        srv = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(late), "--port", str(port)], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        return re.search(r"http://127\.0\.0\.1:(\d+)/\?k=\w+", rpc("server/discover")["result"]["instructions"])
    first = again()
    tab2, sid2 = chrome.open(first.group(0))  # late.json's page, at its own address and key (audit cf1)
    waits = until(lambda: chrome.eval(sid2, "document.title") == "The map does not render yet")
    second = again()
    time.sleep(1)  # the page's stream is refused by the new run before the model renders again
    late.write_text(json.dumps(fixture), encoding="utf-8")
    drawn = until(lambda: tool("show_view", view="system") and (chrome.eval(sid2, "document.title") or "").endswith("Moped share, an example"), 30)
    ok("audit 25 · the page shown while the model does not render follows its server across a restart, and draws the map once it renders",
       first.group(0) == second.group(0) and first.group(1) == str(port) and waits and drawn, (first.group(0), second.group(0), waits, chrome.eval(sid2, "document.title")))
finally:
    chrome.quit()
    srv.stdin.close()
    srv.wait(timeout=30)
    shutil.rmtree(work, ignore_errors=True)
# the edit tools and the page give the same model: the class example edited on the page, by its own gestures (the palette and
# a name typed, L and the kind of line picked, F2, the Owner field, a property's box, Alt + arrows, Delete), each edit event
# applied; then the same edits made by the edit tools on a copy of the file. Each step's commands are the page's, and so is
# the model written
SAME = """
const el = document.getElementById('m'); let model = MODEL0; const events = [];
const h = render(el, model, { view: 'sales', editable: true, on: { edit: e => { events.push(e.commands); model = apply(model, e.commands); h.update(model); } } });
const sr = el.querySelector('.umlimator').shadowRoot, stage = sr.querySelector('.stage');
const tick = () => new Promise(r => setTimeout(r, 30));
const ptr = (t, type, [x, y], extra = {}) => t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 7, pointerType: 'mouse', bubbles: true, composed: true, ...extra }));
const key = (k, extra = {}, t = stage) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...extra }));
const card = async id => { const g = sr.querySelector(`.node[data-id="${id}"] .n-label`) || sr.querySelector(`.node[data-id="${id}"]`); const r = g.getBoundingClientRect(), at = [r.x + r.width / 2, r.y + r.height / 2];
  ptr(g, 'pointerdown', at); ptr(g, 'pointerup', at); g.dispatchEvent(new MouseEvent('click', { clientX: at[0], clientY: at[1], bubbles: true, composed: true })); await tick(); };
const type = async text => { const inp = sr.querySelector('.um-rename'); inp.value = text; key('Enter', {}, inp); await tick(); };
const steps = [];
const step = async (name, f) => { const n = events.length; await f(); await tick(); steps.push({ name, commands: events.slice(n).flat() }); };
await step('add_card', async () => { sr.querySelector('.um-editor [data-add="1"]').click(); await tick(); await type('Invoice'); });
await step('connect', async () => { await card('interface1'); key('l'); for (const c of 'cus') key(c); key('Enter'); await tick();
  [...sr.querySelectorAll('.um-pick button')].find(b => b.textContent.trim() === 'Dependency').click(); });
await step('rename', async () => { await card('interface1'); key('F2'); await tick(); await type('Billable'); });
await step('move_to_box', async () => { await card('interface1'); const s = sr.querySelector('.um-editor select[data-owner]'); s.value = 'catalog'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await step('set_field', async () => { await card('order'); const c = sr.querySelector('.um-editor input[data-key="isAbstract"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
await step('pin', async () => { await card('order'); key('ArrowRight', { altKey: true }); });
await step('remove', async () => { await card('customer'); key('Delete'); });
window.RESULT = { steps, model };
"""
same_dir = Path(tempfile.mkdtemp())
(same_dir / "page.html").write_text('<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="m" style="width:1200px;height:800px"></div><script type="module">\n'
                                    + (ROOT / "lib" / "umlimator-all.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
                                    + "\nconst MODEL0 = " + CLASS.read_text(encoding="utf-8")
                                    + ";\ntry {\n" + SAME + "\n} catch (e) { window.RESULT = { error: String(e && e.stack || e) }; }\n</script>", encoding="utf-8")
chrome = Chrome()
try:
    tab, sid = chrome.open((same_dir / "page.html").as_uri())
    onpage = until(lambda: chrome.eval(sid, "window.RESULT || null")) or {}
finally:
    chrome.quit()
keep_same = (mcp.MODEL, mcp.page, mcp.URL)
mcp.page, mcp.URL = (lambda: ("v", None)), "http://127.0.0.1:1"
mcp.MODEL = same_dir / "class.json"
mcp.MODEL.write_bytes(CLASS.read_bytes())
pin_at = next((c["value"] for st in onpage.get("steps", []) if st["name"] == "pin" for c in st["commands"]), [0, 0])
calls = [("add_card", {"view": "sales", "label": "Invoice", "type": "Interface"}), ("connect", {"view": "sales", "from": "interface1", "to": "customer", "type": "Dependency"}),
         ("rename", {"id": "interface1", "label": "Billable"}), ("move_to_box", {"view": "sales", "id": "interface1", "box": "catalog"}),
         ("set_field", {"id": "order", "path": "props.isAbstract", "value": True}), ("pin", {"view": "sales", "id": "order", "col": pin_at[0], "row": pin_at[1]}),
         ("remove", {"ids": "customer", "view": "sales"})]
bymcp = []
for name, a in calls:
    try:
        bymcp.append({"name": name, "commands": mcp.call(name, a)["commands"]})
    except mcp.Fail as e:
        bymcp.append({"name": name, "error": str(e)})
written_same = json.loads(mcp.MODEL.read_text(encoding="utf-8"))
mcp.MODEL, mcp.page, mcp.URL = keep_same
shutil.rmtree(same_dir, ignore_errors=True)
ok("edit · the same change made on the page, gesture by gesture, and by the edit tools: the same commands at each step, and the same model",
   not onpage.get("error") and len(onpage.get("steps", [])) == 7 and all(st["commands"] for st in onpage["steps"])
   and onpage["steps"] == bymcp and written_same == onpage.get("model"), (onpage.get("error"), onpage.get("steps"), bymcp))
# C10 (2.6): an object model and a package model served the same way. The read tools answer with the type's own words, and
# a page tool's highlight is shown on the diagram the page draws (umlimator/all: a typed view), boxes and all
for f, view, refs, first, cards, boxes in (("order-objects", "snapshot", ["order-1042", "card-1"], "Order 1042, just placed: an object diagram of 7 elements and 6 lines.", 7, 0),
                                          ("bookshop-packages", "packages", ["order", "payment"], "Bookshop packages: a package diagram of 17 elements and 6 lines.", 11, 6),  # 6.7: the profile, a closed folder, and its «apply»
                                          # C10 for stage 4 (S16, 4.10): a use case, an activity, a state machine and an interaction overview
                                          # model; a subject, an open composite state and its regions are boxes, a partition is a node
                                          ("shopping-use-cases", "shopping", ["check-out", "shopper"], "Shopping: a use case diagram of 12 elements and 10 lines.", 11, 1),
                                          ("fulfil-activity", "fulfil", ["in-stock", "call-payment"], "Fulfilling an order: an activity diagram of 17 nodes, 19 flows and 3 partitions.", 20, 0),
                                          ("order-states", "order-life", ["placed", "cancelled"], "An order's life: a state machine diagram of 21 elements and 23 transitions.", 19, 4),
                                          ("buy-book-overview", "buy-book", ["ref-find", "sd-queue"], "Buying a book: an interaction overview diagram of 10 nodes and 11 flows.", 10, 0),
                                          # C10's package (0.22.0): the class, sequence and communication types
                                          ("sales-classes", "domain", ["customer", "order"], "Sales domain: a class diagram of 11 elements and 8 lines.", 10, 1),
                                          ("checkout-sequence", "checkout-sequence", ["lifeline-api", "receipt"], "Checkout: a sequence diagram of 5 lifelines, 10 messages, 1 interaction use and 2 combined fragments.", 11, 0),
                                          ("checkout-communication", "checkout-communication", ["lifeline-api", "receipt"], "Checkout: payment accepted: a communication diagram of 5 lifelines, 5 connectors and 9 messages.", 14, 0),
                                          # C10 for stage 5 (S18, 5.8): a component, a deployment and a composite structure model; a
                                          # component holding a component, a target holding what is deployed on it, the subject and an
                                          # open collaboration are boxes, a port and a part are nodes
                                          ("bookshop-components", "components", ["storefront-component", "i-orders"], "Bookshop components: a component diagram of 9 elements and 10 lines.", 13, 1),
                                          ("bookshop-deployment", "production", ["database", "edge-node"], "Production: a deployment diagram of 14 elements and 8 lines.", 10, 4),
                                          ("order-service-structure", "internals", ["order-events"], "Inside OrderService: a composite structure diagram of 15 elements and 8 lines.", 13, 2),
                                          # C10 for stage 6 (6.6): a profile and a timing model; the profile and the package are boxes,
                                          # a timing view's lanes, state rows, changes, constraints and ruler are nodes
                                          ("bookshop-profile", "profile", ["order", "entity"], "Bookshop conventions profile: a profile diagram of 9 elements and 5 lines.", 7, 2),
                                          ("bookshop-timing", "one-charge", ["lifeline-worker", "lifeline-payments"], "One charge: a timing diagram of 2 lifelines, 8 changes, 2 messages and 2 constraints, in ms.", 19, 0),
                                          # C10 for milestone 2 (M2.14): an ER, a flowchart, a data flow, an information flow and a C4 model;
                                          # the C4 context view lists its subject with nothing it owns, so it is a card, not a boundary
                                          ("bookshop-schema", "er-schema", ["er-customer", "er-order"], "Bookshop schema: an entity-relationship diagram of 7 elements and 7 lines.", 7, 0),
                                          ("returns-flowchart", "returns", ["inspect", "refund"], "Handling a returned book: a flowchart of 13 nodes and 13 flows.", 13, 0),
                                          ("bookshop-data-flow", "dfd-level-1", ["dfd-take-order", "dfd-orders"], "Bookshop, level 1: a data flow diagram of 8 elements and 11 lines.", 8, 0),
                                          ("order-information-flow", "order-flows", ["shopper", "order-info"], "What travels with an order: an information flow diagram of 10 elements and 8 lines.", 10, 0),
                                          ("bookshop-c4", "c4-context", ["c4-shopper", "c4-bookshop"], "Bookshop: system context: a C4 system context diagram of 6 elements and 6 relationships.", 6, 0),
                                          # C10 for milestone 3 (M3.7): SysML's four e-bike models; each view's frame is its one box, an
                                          # internal block or parametric view's parts' ports and parameters are cards; a part or a
                                          # constraint property is a member, which highlight takes as a Ref (a member's id is no card's)
                                          ("ebike-requirements", "requirements", ["spec", "assist"], "Cargo bike requirements: a requirement diagram (req [Model] Cargo e-bike: requirements [Cargo bike requirements]) of 16 elements and 15 lines.", 16, 1),
                                          ("ebike-blocks", "blocks", ["ebike", "battery"], "Cargo bike blocks: a block definition diagram of 15 elements and 6 lines.", 15, 1),
                                          ("ebike-structure", "inside-ebike", [{"type": "node", "id": "ebike.battery"}, {"type": "node", "id": "ebike.controller"}], "Inside the cargo bike: an internal block diagram of 27 elements and 7 lines.", 26, 1),
                                          ("ebike-range", "range-analysis", [{"type": "node", "id": "ebike.empty"}, {"type": "node", "id": "ebike.emptyRange"}], "Cargo bike range, empty and laden: a parametric diagram of 23 elements and 10 lines.", 22, 1),
                                          # C10 for milestone 4a (4a.7, decision 22): a mindmap, a Google Cloud and an Azure model, with
                                          # no pack (the server never fetches one; CI has none, so cards draw glyphs); groups are boxes
                                          ("bookshop-opening-plan", "mm-plan", ["mm-checkout", "mm-hosting"], "Opening the bookshop: a mindmap of 22 topics.", 22, 0),
                                          ("bookshop-gcp", "gcp-on-gcp", ["gcp-api", "gcp-db"], "Bookshop on Google Cloud: a Google Cloud diagram of 16 elements and 10 connections.", 10, 6),
                                          ("bookshop-azure", "az-on-azure", ["az-api", "az-db"], "Bookshop on Azure: an Azure diagram of 14 elements and 9 connections.", 8, 6),
                                          # C10 for milestone 4b (4b.5): a BPMN model; its pools, lanes and group are nodes, its
                                          # sub-process collapsed here, so no box
                                          ("bookshop-order-to-shipment", "order-to-shipment", ["bp-take-payment", "payment-timeout"], "From order to shipment: a BPMN diagram of 18 flow nodes, 21 flows and 3 pools.", 27, 0)):
    m = json.loads((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"))
    srv = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(ROOT / "examples" / f"{f}.json"), "--port", "0"], stdin=subprocess.PIPE,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    stop = threading.Timer(300, srv.kill); stop.daemon = True; stop.start()
    chrome = Chrome()
    try:
        url = re.search(r"http://127\.0\.0\.1:\d+/\?k=\w+", rpc("initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                                                                     "clientInfo": {"name": "tests/mcp.py", "version": "0"}})["result"]["instructions"]).group(0)
        views = json.loads(tool("list_views"))
        said = tool("describe_view", view=view)
        ok(f"C10 · {f}: list_views and describe_view answer in the diagram's own words, then its element ids",
           [v["id"] for v in views.get("views", [])] == [x["id"] for x in m["views"]] and said.startswith(first) and f"\nCard ids: {m['views'][0]['nodeIds'][0]} (" in said, (views, said[:300]))
        # the composite structure example's two parts typed by classes the model does not hold: its own warnings (part-type)
        warned = {"order-service-structure": ["part-type", "part-type"]}.get(f, [])
        ok(f"C10 · {f}: validate finds no problem" + (f" but its {len(warned)} warnings" if warned else ""), (lambda v: [p.get("rule") for p in v] == warned and all(p.get("level") == "warning" for p in v))(json.loads(tool("validate"))))
        if f == "checkout-sequence":  # paths() in time order (C10): the messages that carry the shopper's checkout on to the receipt
            got = [r.get("id") or r["ids"][0] for r in json.loads(tool("paths", view=view, **{"from": "lifeline-shopper", "to": "receipt"}))]
            ok("C10 · checkout-sequence: paths runs in time order, message after message", got[5:] == ["m1", "m2", "m4", "m5", "m6"], got)
        tab, sid = chrome.open(url)
        drawn = until(lambda: (lambda s: s if s and s["view"] == view and len(s["lit"]) == cards else None)(chrome.eval(sid, LOOK)))
        ok(f"C10 · {f}: the page draws the diagram: {cards} elements and {boxes} boxes (packages, a subject, composite states and their regions, components, nodes, a collaboration)", drawn and chrome.eval(sid, BOXES) == boxes, (drawn, chrome.eval(sid, BOXES)))
        until(lambda: state()["pages"][0].get("state"))  # the page's event stream is connected, so the tool waits for it to show
        # the page reports its state before its event stream is counted as connected: ask again until the server counts it
        said = until(lambda: (lambda r: None if r.startswith("No page is connected") else r)(tool("highlight", refs=refs, view=view))) or "No page is connected"
        got = until(lambda: (lambda s: s if s and "mcp" in s["overlays"] and s["lit"] == sorted(r["id"] if isinstance(r, dict) else r for r in refs) else None)(chrome.eval(sid, LOOK)))
        ok(f"C10 · {f}: highlight is shown on the diagram, the rest dimmed, and the tool says so once it is", said.startswith(f"Shown on 1 page at {url}, on view {view}")
           and got and got["dimmed"] == cards - len(refs), (said, got))
    finally:
        chrome.quit()
        srv.stdin.close()
        srv.wait(timeout=30)
# audit 28: on a model no version of which has rendered, a page tool said the page showed "its last version that did"
never = Path(tempfile.mkdtemp()) / "never.json"
never.write_text(json.dumps({"schemaVersion": 2, "root": "v", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
                             "edges": [{"id": "e", "from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b", "ghost"]}]}), encoding="utf-8")
p28 = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(never), "--port", "0"], stdin=subprocess.PIPE,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
try:
    got28 = []
    for i, (m, a) in enumerate([("initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "tests/mcp.py", "version": "0"}}),
                                ("tools/call", {"name": "highlight", "arguments": {"refs": ["a"]}}), ("tools/call", {"name": "page_state", "arguments": {}})]):
        p28.stdin.write(json.dumps({"jsonrpc": "2.0", "id": i + 1, "method": m, "params": a}) + "\n")
        p28.stdin.flush()
        r = json.loads(p28.stdout.readline())
        got28.append("".join(c["text"] for c in r["result"]["content"]) if m == "tools/call" and "result" in r else r)
    said28, ps28 = got28[1], json.loads(got28[2])
finally:
    p28.kill()
ok("a page tool on a model that has never rendered says it does not render yet, never that the page shows a last version that did (audit 28)",
   said28.startswith("The model does not render yet: ") and "ghost" in said28 and "last version" not in said28
   and ps28["model"].get("shown") is None and ps28["model"].get("renders") is False, (said28, ps28.get("model")))

# audit bh1 5: MODEL.json.undo, which a pull request can commit as a symbolic link (to /dev/zero, /dev/stdin) or which can be
# a FIFO, was read whatever it was: the server filled its memory or hung on the first page tool. Now only a regular file,
# never through a link and no larger than SHELF, is read; an edit tool refuses to write over one it will not read
def server(model):
    return subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(model), "--port", "0"], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)


def ask(p, *msgs, lines=1, seconds=60):
    """msgs sent to server p, then the next `lines` lines it writes (each parsed), or None for each that never came in time."""
    stop = threading.Timer(seconds, p.kill); stop.daemon = True; stop.start()
    try:
        for m in msgs:
            p.stdin.write(json.dumps(m) + "\n"); p.stdin.flush()
        got = [p.stdout.readline() for _ in range(lines)]
        return [json.loads(x) if x else None for x in got]
    finally:
        stop.cancel()


HI = {"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "tests/mcp.py", "version": "0"}}}
call = lambda i, name, **a: {"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": {"name": name, "arguments": a}}
text = lambda r: "".join(c["text"] for c in r["result"]["content"]) if r and "content" in r.get("result", {}) else str(r)
if hasattr(os, "mkfifo"):
    got5 = {}
    for how in ("fifo", "link to a fifo", "link to /dev/stdin"):
        d = Path(tempfile.mkdtemp())
        shutil.copy(ROOT / "tests" / "fixtures" / "mcp-class.json", d / "model.json")
        os.mkfifo(d / "pipe")
        (d / "model.json.undo").symlink_to("/dev/stdin" if "stdin" in how else d / "pipe") if how != "fifo" else os.mkfifo(d / "model.json.undo")
        p5 = server(d / "model.json")
        try:
            r = ask(p5, HI, call(1, "page_state"), {"jsonrpc": "2.0", "id": 2, "method": "ping"}, lines=3, seconds=45)
            r += ask(p5, call(3, "add_card", view="sales", label="Invoice"), seconds=45) if all(r) else [None]
        finally:
            p5.kill(); p5.wait()
        got5[how] = {x.get("id"): x for x in r if x}  # by id: a ping may be answered before the page_state sent first
    def fine5(r):
        try:
            return (json.loads(text(r.get(1)))["model"].get("renders") is True and 2 in r and r[3]["result"]["isError"]
                    and "cannot be read" in text(r[3]) and "nothing written" in text(r[3]))
        except (ValueError, KeyError, TypeError):
            return False
    ok("audit bh1 5 · an undo history that is a FIFO, a link to one or a link to /dev/stdin hangs no page tool; an edit tool refuses to write over it",
       len(got5) == 3 and all(map(fine5, got5.values())), {k: {i: str(x)[:300] for i, x in v.items()} for k, v in got5.items()})
keep5 = mcp.MODEL
d = Path(tempfile.mkdtemp())
mcp.MODEL = d / "model.json"
shutil.copy(ROOT / "tests" / "fixtures" / "mcp-class.json", mcp.MODEL)
(d / "real.undo").write_text(json.dumps({"done": [{"before": "{}", "after_sha": "x"}], "undone": []}), encoding="utf-8")
devices = {}
try:  # in this process, only what cannot hang it or fill its memory without the fix: /dev/stdin went through the server above
    mcp.history_file().symlink_to(d / "real.undo")
    try:
        mcp.kept_history(); refused = False
    except mcp.Fail as e:
        refused = "cannot be read" in str(e) and "nothing written" in str(e)
    devices["link to a history"] = (mcp.history(), refused)
    mcp.history_file().unlink()
    for dev in ("/dev/zero", "/dev/null"):  # regular() follows a link (the model's), and reads only a regular file
        try:
            mcp.regular(dev); devices[dev] = "read"
        except OSError as e:
            devices[dev] = e.strerror
    with open(mcp.history_file(), "wb") as f:  # sparse: larger than the largest history kept() writes, and no disk taken
        f.truncate(mcp.SHELF + 1)
    devices["too large"] = mcp.history()
    mcp.history_file().write_text((d / "real.undo").read_text(encoding="utf-8"), encoding="utf-8")
    devices["regular"] = len(mcp.history()["done"])
except Exception as e:
    devices["error"] = repr(e)
mcp.MODEL = keep5
ok("audit bh1 5 · a history that is a link (even to a real history) or larger than any kept() writes is an empty one, and the edit tools "
   "will not write over it; /dev/zero and /dev/null are not read; a regular history is read",
   devices.get("link to a history") == ({"done": [], "undone": []}, True) and all(str(devices.get(x, "read")).startswith("not a regular file") for x in ("/dev/zero", "/dev/null"))
   and devices.get("too large") == {"done": [], "undone": []} and devices.get("regular") == 1, devices)
# audit bh1 6: the server's Node runs had no time limit and notifications/cancelled was not acted on, on the one thread that
# reads stdin: a 44 KB model of 200 classes held list_views, and every request after it (a ping too), for minutes. Now each
# run is stopped after LIMIT s (the element counts after COUNTING s), a tools/call runs off that thread, and a cancel stops it
import random
rnd = random.Random(6)
big = {"schemaVersion": 2, "root": "v0", "nodes": [{"id": f"c{i}", "label": f"C{i}", "type": "uml.Class"} for i in range(200)],
       "edges": [{"id": f"e{i}", "from": f"c{rnd.randrange(200)}", "to": f"c{rnd.randrange(200)}", "type": "uml.Association"} for i in range(400)],
       "views": [{"id": f"v{k}", "diagram": "uml.class", "nodeIds": [f"c{i}" for i in range(200)]} for k in range(3)]}
bigf = Path(tempfile.mkdtemp()) / "big.json"
bigf.write_text(json.dumps(big), encoding="utf-8")
p6 = server(bigf)
try:
    r6 = ask(p6, HI, call(1, "list_views"), {"jsonrpc": "2.0", "id": 2, "method": "ping"}, lines=2, seconds=60)
    r6 += ask(p6, {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 1, "reason": "too slow"}},
              call(3, "validate"), seconds=60) if all(r6) else [None]
finally:
    p6.kill(); p6.wait()
ok("audit bh1 6 · a ping is answered while a long list_views runs; cancelled, it is never answered and the next call is",
   (r6[0] or {}).get("id") == 0 and (r6[1] or {}).get("id") == 2 and (r6[2] or {}).get("id") == 3 and text(r6[2]).startswith("["), [str(x)[:200] for x in r6])
keep6 = getattr(mcp, "LIMIT", None), getattr(mcp, "COUNTING", None), mcp.MODEL, mcp.counted[:]  # (none before audit bh1 6)
mcp.MODEL, mcp.LIMIT, mcp.COUNTING = bigf, 0.001, 0.001  # no Node run ends that soon
t6 = time.monotonic()
try:
    mcp.node("validate", big); late = None
except mcp.Fail as e:
    late = str(e)
try:
    mcp.call("describe_view", {"view": "v0"}) and None; late2 = None
except mcp.Fail as e:
    late2 = str(e)
counts6 = mcp.element_counts(big)
took6 = time.monotonic() - t6
mcp.LIMIT, mcp.COUNTING, mcp.MODEL = keep6[:3]; mcp.counted[:] = keep6[3]
ok("audit bh1 6 · a Node run past its limit is stopped and said in one line; list_views's element counts past theirs are left out",
   late and late == late2 and late.startswith("stopped after ") and "\n" not in late and counts6 == {} and took6 < 30, (late, late2, counts6, took6))
# the page's render ran the engine (a layout in Node) with no limit as well: the 44 KB model held page_state two minutes. A
# render past LIMIT s is stopped, and the page says why it does not render, once for that version (audit bh1 6)
keep6r = getattr(mcp, "LIMIT", None), mcp.MODEL, mcp.tried, mcp.why, mcp.drawn[:], mcp.MAPID  # (no LIMIT before audit bh1 6)
d6 = Path(tempfile.mkdtemp())
shutil.copy(CLASS, d6 / "model.json")
mcp.MODEL, mcp.LIMIT, mcp.tried, mcp.MAPID = d6 / "model.json", 0.001, None, mcp.MAPID or "map"
t6 = time.monotonic()
try:
    shown6, why6 = mcp.page()
except Exception as e:
    shown6, why6 = None, repr(e)
took6 = time.monotonic() - t6
mcp.LIMIT, mcp.MODEL, mcp.tried, mcp.why = keep6r[:4]; mcp.drawn[:] = keep6r[4]; mcp.MAPID = keep6r[5]
ok("audit bh1 6 · a page render past its limit is stopped, and the page says why the model does not render, in one line",
   isinstance(why6, str) and why6.startswith("stopped after ") and "\n" not in why6 and took6 < 30, (shown6, why6, took6))
sys.exit(1 if failed else 0)
