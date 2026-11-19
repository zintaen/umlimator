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
        tid = self.call("Target.createTarget", {"url": url})["targetId"]
        return tid, self.call("Target.attachToTarget", {"targetId": tid, "flatten": True})["sessionId"]

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
model = work / "bike.json"
bike = json.loads((ROOT / "examples" / "bike-share.json").read_text(encoding="utf-8"))
model.write_text(json.dumps(bike), encoding="utf-8")
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


url = re.search(r"http://127\.0\.0\.1:\d+", rpc("initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                                                               "clientInfo": {"name": "tests/mcp.py", "version": "0"}})["result"]["instructions"]).group(0)
LOOK = """(() => { const m = window.umlimatorMap, host = document.querySelector('#m-canvas .umlimator'),
  svg = host && host.shadowRoot && host.shadowRoot.querySelector('svg'), cards = svg ? [...svg.querySelectorAll('.node')] : [];
  return m && { view: m.view, lit: cards.filter(c => !c.getAttribute('opacity')).map(c => c.dataset.id).sort(), dimmed: cards.filter(c => c.getAttribute('opacity')).length,
    overlays: m.state.overlays, story: m.state.story, banner: (document.getElementById('mcp-banner') || {}).textContent || null }; })()"""
BOXES = "(() => { const host = document.querySelector('#m-canvas .umlimator'); return host ? host.shadowRoot.querySelectorAll('.family').length : -1; })()"
# audit 16: stories, or a story's steps, that are no list ended list_views and play_story in an internal error
said = []
for bad in ({"stories": 7}, {"stories": [{"id": "s", "steps": 3}]}):
    model.write_text(json.dumps(bike | bad), encoding="utf-8")
    said += [tool("list_views"), tool("play_story", id="s")]
# audit 17: a null stories, or a story's null steps, is no stories (as validate() reads it), not a refused model
model.write_text(json.dumps(bike | {"stories": None}), encoding="utf-8")
said17 = tool("list_views")
model.write_text(json.dumps(bike | {"stories": [{"id": "s", "steps": None}]}), encoding="utf-8")
said17b = tool("list_views")
ok("list_views on a null stories or a null steps lists the views, no tool error (audit 17)",
   '"trips"' in said17 and "not a list" not in said17 + said17b and re.search(r'"steps":\s*0', said17b), [said17[:200], said17b[:300]])
# audit 18: a member id that is no string ended highlight and tour in an internal error (-32603); so did a tool name that is no string
mem = json.loads(json.dumps(bike)); mem["nodes"][0]["members"] = [{"id": ["p"], "label": "p"}]
model.write_text(json.dumps(mem), encoding="utf-8")
said18 = [tool("highlight", refs=[bike["nodes"][0]["id"]]), tool("tour", cards=[bike["nodes"][0]["id"], bike["nodes"][1]["id"]])]
named18 = [rpc("tools/call", {"name": x, "arguments": {}}).get("error", {}) for x in (["list_views"], {"a": 1})]
ok("highlight and tour on a model whose member id is no string name the field; a tool name that is no string is an unknown tool (-32602), no internal error (audit 18)",
   all("nodes[0].members[0].id is not a string" in x for x in said18) and [e.get("code") for e in named18] == [-32602, -32602]
   and all(e.get("message", "").startswith("Unknown tool") for e in named18), [said18, named18])
model.write_text(json.dumps(bike), encoding="utf-8")
ok("list_views and play_story on stories, or steps, that are no list: the tool names the field, no internal error (audit 16)",
   all("stories is not a list" in x for x in said[:2]) and all("stories[0].steps is not a list" in x for x in said[2:]), said)
chrome = Chrome()
try:
    # the assistant builds a picture before any page is open: a view, then a highlight on it (no view named)
    said = tool("show_view", view="trips")
    ok("a page tool with no page open says so, with the URL", said.startswith("No page is connected") and url in said, said)
    tool("highlight", refs=["fare", "lifecycle"])
    tab, sid = chrome.open(url + "/")
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
    broken = dict(bike, edges=[*bike["edges"], {"id": "oops", "from": "fare", "to": "nobody"}])
    model.write_text(json.dumps(broken), encoding="utf-8")
    said = tool("show_view", view="trips")
    got = until(lambda: (lambda s: s if s and s["view"] == "trips" and s["banner"] else None)(chrome.eval(sid, LOOK)))
    ps = state()
    ok("mcp-page-render#1 · a model that no longer renders: the page keeps its map, says so, and the tool says why",
       said.startswith("The model no longer renders, so the page shows its last version that did:") and "nobody" in said and "Shown on 1 page" in said
       and got and "no longer renders" in got["banner"] and ps["model"].get("renders") is False and ps["pages"][0].get("latest"), (said, got, ps.get("model")))
    model.write_text(json.dumps(bike)[:-40], encoding="utf-8")  # mid-edit: a version that is not JSON (audit 10)
    said, ps = tool("show_view", view="system"), state()
    got = until(lambda: (lambda s: s if s and s["view"] == "system" and "not JSON" in (s["banner"] or "") else None)(chrome.eval(sid, LOOK)))
    ok("mcp-page-render#2 · a version that is not JSON: page_state() says it does not render, and a page tool shows the last that did, with why",
       said.startswith("The model no longer renders, so the page shows its last version that did: it is not JSON") and got
       and ps["model"].get("renders") is False and "not JSON" in ps["model"].get("error", ""), (said, got, ps.get("model")))
    model.write_text(json.dumps(bike), encoding="utf-8")
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
    tab, sid = chrome.open(url + "/")
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
    chrome.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]}, sid)
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
    chrome.call("Emulation.setEmulatedMedia", {"features": []}, sid)
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
    smaller = json.loads(json.dumps(bike))
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

    # this server stops, and another model's server takes its port: the tab stays the bike share, and says so
    port = int(url.rsplit(":", 1)[1])
    srv.stdin.close()
    srv.wait(timeout=30)
    shop = work / "shop.json"
    shutil.copy(ROOT / "examples" / "bike-share-c4.json", shop)   # a second, different map: the bike share's Structurizr import
    srv = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(shop), "--port", str(port)], stdin=subprocess.PIPE,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    taken = re.search(r"127\.0\.0\.1:(\d+)", rpc("server/discover")["result"]["instructions"]).group(1)
    said = until(lambda: (chrome.eval(sid, "(document.getElementById('mcp-banner') || {}).textContent") or "").startswith("This page's server now serves another map"), 20)
    ok("mcp-session#1 · a tab outlives its server, and another map's server takes the port: the tab stays, and says so",
       taken == str(port) and said and chrome.eval(sid, "document.title").endswith("Bike share, an example"), (taken, port, said, chrome.eval(sid, "document.title")))

    # audit 25: the page shown while no version renders listened with the run's TOKEN and had no onerror, so after the
    # server ran again (a new TOKEN) its stream was refused and it never drew the map once the model rendered
    late = work / "late.json"
    late.write_text(json.dumps(bike)[:-40], encoding="utf-8")
    def again():
        global srv
        srv.stdin.close()
        srv.wait(timeout=30)
        srv = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(late), "--port", str(port)], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        return re.search(r"127\.0\.0\.1:(\d+)", rpc("server/discover")["result"]["instructions"]).group(1)
    first = again()
    tab2, sid2 = chrome.open(url + "/")
    waits = until(lambda: chrome.eval(sid2, "document.title") == "The map does not render yet")
    second = again()
    time.sleep(1)  # the page's stream is refused by the new run before the model renders again
    late.write_text(json.dumps(bike), encoding="utf-8")
    drawn = until(lambda: tool("show_view", view="system") and (chrome.eval(sid2, "document.title") or "").endswith("Bike share, an example"), 30)
    ok("audit 25 · the page shown while the model does not render follows its server across a restart, and draws the map once it renders",
       first == second == str(port) and waits and drawn, (first, second, waits, chrome.eval(sid2, "document.title")))
finally:
    chrome.quit()
    srv.stdin.close()
    srv.wait(timeout=30)
    shutil.rmtree(work, ignore_errors=True)
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
                                          ("ebike-requirements", "requirements", ["spec", "assist"], "E-bike requirements: a requirement diagram (req [Model] E-bike: requirements [E-bike requirements]) of 16 elements and 15 lines.", 16, 1),
                                          ("ebike-blocks", "blocks", ["ebike", "battery"], "E-bike blocks: a block definition diagram of 12 elements and 5 lines.", 12, 1),
                                          ("ebike-structure", "inside-ebike", [{"type": "node", "id": "ebike.battery"}, {"type": "node", "id": "ebike.controller"}], "Inside the e-bike: an internal block diagram of 24 elements and 6 lines.", 23, 1),
                                          ("ebike-range", "range-analysis", [{"type": "node", "id": "ebike.eco"}, {"type": "node", "id": "ebike.ecoRange"}], "E-bike range: a parametric diagram of 19 elements and 8 lines.", 18, 1),
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
        url = re.search(r"http://127\.0\.0\.1:\d+", rpc("initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
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
        tab, sid = chrome.open(url + "/")
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
sys.exit(1 if failed else 0)
