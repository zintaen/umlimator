#!/usr/bin/env python3
"""umlimator.py mcp MODEL.json [--port N]: a Model Context Protocol server over stdio, for one map model (#91).

Read tools answer from the model file as it is at each call, with the module's own functions run in Node (as `diff` and
`drift` run theirs). Page tools drive the model's page, which the server serves on http://127.0.0.1:<port>: the CLI's
own rendered page, plus a script, added only here. The server folds the page tools' commands into what the page should
show ({view, highlight, tour, story}) and sends that over Server-Sent Events; the script shows it on the page's map
handle (window.umlimatorMap) and posts back what the page then shows (map.state), with the command's id. So a tool says
"shown" only once a page did, and page_state() reads what each page shows (0.14.0). Standard library only, and nothing
is fetched (UMLIMATOR_OFFLINE).

The protocol: JSON-RPC 2.0, one message per line on stdin and stdout; logs go to stderr. Both eras of MCP: 2026-07-28,
the current specification (per-request `_meta`, server/discover), and the `initialize` handshake of the versions before
it, which a client sends that predates 2026-07-28 or falls back to it.
"""
import hashlib, html, http.server, itertools, json, os, queue, re, sys, tempfile, threading, time, traceback, urllib.parse
from pathlib import Path

import umlimator as cli

VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]  # the current one, then those that open with initialize
SERVER = {"name": "umlimator", "version": json.loads((cli.HERE / "package.json").read_text(encoding="utf-8"))["version"]}
CACHED = {"ttlMs": 3600000, "cacheScope": "private"}  # 2026-07-28: how long a client may keep the answer (the tools never change)


def tool(name, description, props=None, *required):
    return {"name": name, "description": description,
            "inputSchema": {"type": "object", "properties": props or {}, "required": list(required), "additionalProperties": False}}


VIEW = {"type": "string", "description": "a view's id (list_views gives them)"}
CARD = {"type": "string", "description": "a card's id on that view (describe_view gives them)"}
PAGE = (" It answers once a page has shown it, or says why none did (a hidden tab, an error, the model no longer rendering);"
        " with no page open, it gives the URL to open, and a page that opens later shows it.")
TOOLS = [
    tool("list_views", "The model's views (id, title, parent view, number of cards) and stories (id, title, number of steps)."),
    tool("describe_view", "A view in plain sentences: its cards and their kinds, its boxes, what each card's lines do; then each card's id.",
         {"view": VIEW}, "view"),
    tool("paths", "Every card and line on a path from one card to another on a view, following lines forward, as Refs that highlight "
         "takes ([] when no path joins them).", {"view": VIEW, "from": CARD, "to": CARD}, "view", "from", "to"),
    tool("reach", "What a card's lines lead to on a view or, with backward, what leads to it (for calls: who depends on it), as Refs that "
         "highlight takes, each with its distance in lines. depth stops the walk that many lines out.",
         {"view": VIEW, "card": CARD, "backward": {"type": "boolean"}, "depth": {"type": "integer", "minimum": 1}}, "view", "card"),
    tool("broken_rules", "Each break of the model's own rules (its `rules`), view by view: {rule, view, message, targets}. [] when every rule holds."),
    tool("validate", "The model's own problems, found before anything is drawn (ids that name nothing or are used twice, unknown kinds): "
         "{level, path, message}. [] when there are none."),
    tool("diff", "What changed from another model file to this one: the changes in words, and the views that show them.",
         {"other_model_path": {"type": "string", "description": "the other model's JSON file: absolute, or relative to the model's folder (else to where the server runs)"}},
         "other_model_path"),
    tool("show_view", "Shows a view on the map's page." + PAGE, {"view": VIEW}, "view"),
    tool("highlight", "Lights cards and lines on the map's page and dims the rest. view: the view to show first." + PAGE,
         {"refs": {"type": "array", "items": {"anyOf": [{"type": "string"}, {"type": "object"}]},
                   "description": "card or line ids, or the Refs paths and reach give"}, "view": VIEW}, "refs"),
    tool("tour", "A dot rides the lines through these cards in turn, on the map's page. view: the view to show first." + PAGE,
         {"cards": {"type": "array", "items": {"type": "string"}, "description": "card ids, in order"}, "view": VIEW}, "cards"),
    tool("play_story", "Plays one of the model's stories on the map's page, step by step, with its captions." + PAGE,
         {"id": {"type": "string", "description": "a story's id (list_views gives them)"}}, "id"),
    tool("clear", "Takes the assistant's highlight, tour and story off the map's page (a story the reader started is the reader's)." + PAGE),
    tool("page_state", "What the map's page shows now, as each open page reports it: its view, selection, layers ('mcp' is the "
         "assistant's highlight), story, tour and camera (the map's MapState); whether it shows the model's latest version, and "
         "whether that version renders; and what the assistant last asked it to show. Needs no page: with none open, it says so."),
]
TOOL = {t["name"]: t for t in TOOLS}


class Fail(Exception):
    """A tool's error, said to the assistant (isError), which can fix its call."""


class RpcError(Exception):
    """A JSON-RPC error: code, message, data."""


MODEL = URL = HELLO = MAPID = None  # MAPID: the model file's own id, which its pages carry
HOSTS, ORIGINS = set(), set()
lock, rendering = threading.Lock(), threading.Lock()
told = threading.Condition(lock)  # a page reported what it shows
# What the assistant asked the page to show, the latest of each, folded from the page tools' commands. view: a view's id;
# highlight: {refs, view}; tour: {n, cards}; story: {n, story}. n: the command that started a tour or story, so a page
# starts each once, and a tour or story that ended (a page says so) is not played again for a page that opens later.
want = {"view": None, "highlight": None, "tour": None, "story": None}
latest = None            # the latest command's event id: a page that connects after it is sent `want`
pages = {}               # each page by the id it gives itself: q (its event queue while it is open), state, model, ack, seen
drawn = [None, ""]       # the page as served: the model's version it shows (the last that rendered), and its HTML
tried, why = None, None  # the model's version last rendered, and why it did not render (None: it did)
ids = itertools.count(1)
RUN = os.urandom(4).hex()  # event ids differ from one run of the server to the next, so a page that reconnects is not taken as up to date
WAIT, BEAT = 6, 2        # s: how long a page tool waits for a page to show its command; how often an open page is pinged


def load():
    try:
        return json.loads(MODEL.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Fail(f"cannot read the model {MODEL.name}: {e}")


def version():
    return hashlib.sha256(MODEL.read_bytes()).hexdigest()[:16]


def views(m):
    return {v.get("id"): v for v in m.get("views") or [] if isinstance(v, dict)}


def view(m, vid):
    vs = views(m)
    if vid not in vs:
        raise Fail(f"no view {vid!r}; the views: {', '.join(map(str, vs))}")
    return vs[vid]


def on(v, card):
    if card not in (v.get("nodeIds") or []):
        raise Fail(f"no card {card!r} on view {v['id']!r}; its cards: {', '.join(v.get('nodeIds') or [])}")
    return card


def every(m, key):
    """Every card ("nodes") or line ("edges") with an id: the model's own, and each view's."""
    return [x for x in [*(m.get(key) or []), *(x for v in views(m).values() for x in v.get(key) or [])] if isinstance(x, dict) and "id" in x]


def node(fn, *args):
    """One of the module's functions, run in Node by the CLI's js(), which ends the CLI on an error: here it is the tool's."""
    try:
        return cli.js(fn, *args)
    except SystemExit as e:
        said = str(e.code)
        raise Fail((re.findall(r"^\w*Error: .*$", said, re.M) or [said])[-1])


def refs(m, items):
    """highlight's refs: a Ref as it is, a card's id as its Ref, else a line's."""
    cards, lines, out = {n["id"] for n in every(m, "nodes")}, {e["id"] for e in every(m, "edges")}, []
    for x in items if isinstance(items, list) else [items]:
        if isinstance(x, dict):
            out.append(x)
        elif x in cards:
            out.append({"type": "node", "id": x})
        elif x in lines or "->" in str(x):  # "<from>-><to>#<n>": a line without an id, as Refs name it
            out.append({"type": "edge", "ids": [x]})
        else:
            raise Fail(f"no card or line {x!r} in the model")
    return out


def call(name, a):
    m = load()
    if name == "list_views":
        return {"views": [{"id": i, "title": v.get("title"), "parent": v.get("parent"), "cards": len(v.get("nodeIds") or [])} for i, v in views(m).items()],
                "stories": [{"id": s.get("id"), "title": s.get("title"), "steps": len(s.get("steps") or [])} for s in m.get("stories") or [] if isinstance(s, dict)]}
    if name == "describe_view":
        v, label = view(m, a["view"]), {n["id"]: n.get("label") or n["id"] for n in every(m, "nodes")}
        return node("describe", m, v["id"]) + "\nCard ids: " + ", ".join(f"{i} ({label.get(i, i)})" for i in v.get("nodeIds") or [])
    if name == "paths":
        v = view(m, a["view"])
        return node("paths", m, v["id"], on(v, a["from"]), on(v, a["to"]))
    if name == "reach":
        v = view(m, a["view"])
        return node("reach", m, v["id"], on(v, a["card"]), {"backward": bool(a.get("backward")), "depth": a.get("depth")})
    if name == "broken_rules":
        return node("rules", m)
    if name == "validate":
        return node("validate", m)
    if name == "diff":
        given = Path(a["other_model_path"]).expanduser()
        tried = list(dict.fromkeys([given] if given.is_absolute() else [MODEL.parent / given, Path.cwd() / given]))
        other = next((p for p in tried if p.is_file()), tried[0])
        try:
            before = json.loads(other.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            raise Fail(f"cannot read {a['other_model_path']} (looked for {' and '.join(map(str, tried))}): {e}")
        d = node("diff", before, m)
        return {"summary": d["summary"], "views": d["views"]}
    if name == "page_state":
        return page_state()
    # the page's tools: a command for the page, checked against the model first, then folded into `want`
    asked = view(m, a["view"])["id"] if a.get("view") else None
    if name == "show_view":
        def fold(w, n):
            w.update(view=asked, tour=None, story=None, highlight=w["highlight"] if w["highlight"] and w["highlight"]["view"] == asked else None)
    elif name == "highlight":
        lit = refs(m, a["refs"])
        at = asked or view_for(m, lit, want["view"])
        def fold(w, n):
            w.update(view=at or w["view"], highlight={"refs": lit, "view": at or w["view"]}, story=None)
    elif name == "tour":
        cards = a["cards"] if isinstance(a["cards"], list) else [a["cards"]]
        known = set(views(m)[asked].get("nodeIds") or []) if asked else {n["id"] for n in every(m, "nodes")}
        if bad := [c for c in cards if c not in known]:
            raise Fail(f"no card {', '.join(map(repr, bad))}" + (f" on view {asked!r}" if asked else " in the model"))
        at = asked or view_for(m, [{"type": "node", "id": c} for c in cards], want["view"])
        def fold(w, n):
            w.update(view=at or w["view"], tour={"n": n, "cards": cards}, story=None)
    elif name == "play_story":
        told = [s.get("id") for s in m.get("stories") or [] if isinstance(s, dict) and s.get("steps")]
        if a["id"] not in told:
            raise Fail(f"no story {a['id']!r}; the stories: {', '.join(map(str, told)) or 'none'}")
        def fold(w, n):  # the story sets its own views and lights
            w.update(view=None, highlight=None, tour=None, story={"n": n, "story": a["id"]})
    else:
        def fold(w, n):
            w.update(highlight=None, tour=None, story=None)
    return command(fold)


def view_for(m, lit, current):
    """The view a highlight or tour is about when the call names none: the Refs' own (paths and reach give it), else the
    view asked for last when it shows all their cards, else the first view that does. A page that opens later shows it
    there, never on a view where it would dim every card."""
    named = [r["view"] for r in lit if isinstance(r, dict) and isinstance(r.get("view"), str)]
    if named:
        return named[0]
    lines = {e["id"]: e for e in every(m, "edges")}
    need = {r.get("id") for r in lit if r.get("type") == "node"} | {
        x for r in lit if r.get("type") == "edge" for i in r.get("ids") or [] for x in (lines.get(i, {}).get("from"), lines.get(i, {}).get("to")) if x}
    vs = views(m)
    return next((v for v in [current, *vs] if v in vs and need <= set(vs[v].get("nodeIds") or [])), None)


def command(fold):
    """A page tool's command: folded into `want`, which goes to every open page; then the answer, once the pages have
    shown it (or have not, in WAIT s). The model's latest version is rendered first, so the pages show it, or the last
    version that rendered, and the answer says why."""
    global latest
    shown, broken = page()
    with lock:
        n = next(ids)
        fold(want, n)
        latest = f"{RUN}-{n}"
        data = event()
        for p in pages.values():
            if p.get("q"):
                p["q"].put(data)
        start, first = time.monotonic(), None
        while True:  # until every open page has answered, half a second after the first answer, or WAIT
            answered = [p for p in pages.values() if (p.get("ack") or [None])[0] == latest]
            waiting = [p for p in pages.values() if p.get("q") and not p.get("listens") and p not in answered]
            now = time.monotonic()
            if answered and first is None:
                first = now
            if not waiting or now - start >= WAIT or (first is not None and now - first >= 0.5):
                break
            told.wait(0.2)
        oks, errs = [p for p in answered if not p["ack"][1]], [p["ack"][1] for p in answered if p["ack"][1]]
        left = len(waiting)
    said = f"The model no longer renders, so the page shows its last version that did: {broken}. " if broken else ""
    if oks:
        on = (oks[0].get("state") or {}).get("view")
        return said + f"Shown on {len(oks)} page{'' if len(oks) == 1 else 's'} at {URL}" + (f", on view {on}" if on else "") + (
            f"; {len(errs)} could not show it: {errs[0]}" if errs else "") + "."
    if errs:
        return said + f"The page could not show it: {errs[0]}. page_state() says what it shows."
    if left:
        return said + (f"Sent to {left} open page{'' if left == 1 else 's'} at {URL}, which did not show it within {WAIT} s (a tab in the "
                       "background, or a busy page): page_state() says what it shows.")
    return said + f"No page is connected: open {URL} in a browser, and it shows this once it connects."


def event():
    """What the pages are sent: `want`, the command it holds last, the page's version they should show, and why the
    model's latest version does not render (null when it does). Called with the lock held."""
    data = {"id": latest, "want": want, "model": drawn[0], "renderError": why}
    return f"id: {latest}\ndata: {json.dumps(data)}\n\n".encode()


def num(eid):
    """A command's number, from its event id (0 for one from another run of the server)."""
    return int(eid.rsplit("-", 1)[1]) if isinstance(eid, str) and eid.startswith(RUN + "-") else 0


def report(pid, msg):
    """A page's report: what it shows (its map's state, and its page version), and the command it has shown or failed to,
    with why. A tour or story it started that has ended is taken out of `want`, so a page that opens later doesn't play it
    again."""
    if msg.get("map", MAPID) != MAPID:  # a page of another model's server, which had this port
        return
    with lock:
        p = pages.setdefault(pid, {})
        p.update(state=msg.get("state") if isinstance(msg.get("state"), dict) else None, model=msg.get("model"), seen=time.time())
        if isinstance(msg.get("ack"), str):
            p["ack"] = (msg["ack"], str(msg["error"])[:500] if msg.get("error") else None)
        state, n = p["state"] or {}, num((p.get("ack") or [None])[0])
        if want["tour"] and n >= want["tour"]["n"] and not state.get("tour"):
            want["tour"] = None
        if want["story"] and n >= want["story"]["n"] and not state.get("story"):
            want["story"] = None
        told.notify_all()


def refit(m):
    """`want`, kept to what the model has now: a view, card, line or story the latest version no longer has is dropped,
    so a page is never sent ids an older version had. Called with the lock held."""
    vs, stories = views(m), {s.get("id") for s in m.get("stories") or [] if isinstance(s, dict)}
    known = {x["id"] for k in ("nodes", "edges") for x in every(m, k)} | {c.get("id") for v in vs.values() for c in v.get("containers") or [] if isinstance(c, dict)}
    if want["view"] not in vs:
        want["view"] = None
    if h := want["highlight"]:
        h["refs"] = [r for r in h["refs"] if any(x in known or "->" in str(x) for x in (r.get("id"), r.get("node"), r.get("container"), *(r.get("ids") or [])) if x)]
        if not h["refs"] or (h["view"] is not None and h["view"] not in vs):
            want["highlight"] = None
    if want["tour"] and not set(want["tour"]["cards"]) <= known:
        want["tour"] = None
    if want["story"] and want["story"]["story"] not in stories:
        want["story"] = None


def page_state():
    """What each open page shows (as it last reported it), what the assistant asked it to show, and the model's state."""
    shown, broken = page()
    with lock:  # as text, made while no page's report can change it
        now = time.time()
        return json.dumps({"url": URL, "model": {"version": version(), "shown": shown, "renders": not broken, **({"error": broken} if broken else {})},
                "asked": {**want, "tour": want["tour"] and {"cards": want["tour"]["cards"]}, "story": want["story"] and want["story"]["story"]},
                "pages": [{"page": pid, "open": bool(p.get("q")), "reported": round(now - p["seen"], 1) if p.get("seen") else None,
                           "latest": p.get("model") == shown, "state": p.get("state"),
                           **({"command": p["ack"][0], **({"error": p["ack"][1]} if p["ack"][1] else {})} if p.get("ack") else {})}
                          for pid, p in pages.items() if not p.get("listens") and (p.get("q") or now - p.get("seen", 0) < 60)]})


# The script the served page gets. It shows `want` on the map handle every CLI page keeps (window.umlimatorMap) and posts
# back what the page then shows, with the command's id.
SCRIPT = """<script type="module">
/* umlimator.py mcp (#91; 0.14.0), in the served page only. The server sends what the assistant wants shown (want: view,
   highlight, tour, story), folded from its commands, over Server-Sent Events. This shows it on the map's handle, the
   highlight on a layer of its own ('mcp'), and posts back what the page then shows (map.state) with the command's id: a
   tool says "shown" only after that, and page_state() reads it. */
const map = window.umlimatorMap, model = '__MODEL__', MAP = '__MAP__'; // MAP: which model file this page is (another's server may take the port later)
const page = self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
const LIMIT = 5000; // ms a command may take here before it is answered as not shown (a tab in the background stops animation)
let want = {}, done = null, tour = { n: 0 }, story = null, queue = Promise.resolve(); // tour: the assistant's last, n, and on while it is on the map (#132)
const post = extra => fetch('/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
  body: JSON.stringify({ page, map: MAP, model, state: map.state, ...extra }) }).catch(() => {});
// the assistant's highlight is about its view: on another it would dim every card, so it shows on that view only
const lit = () => { const h = want.highlight; map.highlight(h && (h.view || map.view) === map.view ? h.refs : null, { layer: 'mcp' }); };
function banner(text) {
  let b = document.getElementById('mcp-banner');
  if (!text) return void (b && b.remove());
  if (!b) {
    b = document.body.appendChild(document.createElement('div'));
    b.id = 'mcp-banner'; b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:1000;max-width:80vw;padding:6px 12px;' +
      'border-radius:8px;font:13px/1.4 system-ui,sans-serif;background:#cf222e;color:#fff';
  }
  b.textContent = text;
}
async function show(c) {
  if (c.model && c.model !== model) { location.reload(); return false; } // a newer version rendered: draw it
  banner(c.renderError && 'The model no longer renders, so this is its last version that did: ' + c.renderError);
  want = c.want || {};
  if (!want.story && story) { story.stop(); story = null; } // a command ends the story the assistant started
  if (!want.tour && tour.on) { map.tour(null); tour.on = false; } // and its tour, while that is on the map: never a trip the reader started
  if (want.view && want.view !== map.view && !(await map.setView(want.view))) throw new Error(`the view ${want.view} did not show`);
  lit();
  if (want.tour && want.tour.n !== tour.n) { // each tour starts once. Its dot leaves the map when it ends: at its end, cut short or replaced
    const t = tour = { n: want.tour.n, on: true }, ends = map.tour(want.tour.cards);
    if (map.state.tour) ends.then(() => { t.on = false; }); } // a path lit at rest (reduced motion) stays until a story's step or end takes it
  if (want.story && want.story.n !== (story && story.n)) {
    const told = map.play(want.story.story);
    if (!told) throw new Error(`the page has no story ${want.story.story}`);
    story = { n: want.story.n, stop: () => told.stop() };
  }
  return true;
}
function apply(c) {
  if (c.id === done) return Promise.resolve(); // shown already: a replay, or the same command twice
  let timer;
  const limit = new Promise((_, no) => { timer = setTimeout(() => no(new Error(`it took more than ${LIMIT / 1000} s here (is the tab in the background?)`)), LIMIT); });
  return Promise.race([show(c), limit]).then(shown => { if (shown !== false) { done = c.id; post({ ack: c.id }); } },
    e => { done = c.id; post({ ack: c.id, error: String((e && e.message) || e) }); }).finally(() => clearTimeout(timer));
}
map.on('state', ({ changed }) => { if (changed.includes('view')) lit(); post({}); });
map.on('story', () => { if (!map.story || map.story.state === 'entering') tour.on = false; }); // a step entered, or the end, took the trip off the map
function listen() {
  if (!map.view) return setTimeout(listen, 50); // once the map is drawn
  const es = new EventSource(`/events?page=${encodeURIComponent(page)}&map=${MAP}`);
  es.onmessage = e => { const c = JSON.parse(e.data); queue = queue.then(() => apply(c)); };
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) banner("This page's server now serves another map: this page no longer follows the assistant."); };
  post({});
}
listen();
</script>
"""

# The page while no version of the model has rendered: why, and it draws the map once one does.
WAITING = """<!doctype html><meta charset="utf-8"><title>The map does not render yet</title>
<body style="font: 15px/1.5 system-ui, sans-serif; margin: 3em auto; max-width: 46em; padding: 0 1em">
<h1 style="font-size: 1.3em">The model does not render yet</h1><pre style="white-space: pre-wrap">__WHY__</pre>
<p>This page draws the map once a version of the model renders.</p>
<script>new EventSource('/events').onmessage = e => { if (JSON.parse(e.data).model) location.reload(); };</script>
"""


def page():
    """The version of the model the page shows, and why the latest version doesn't render (None when it does). The page
    is the CLI's own for the model, with SCRIPT, drawn again when the model's bytes change, and from those bytes (a
    snapshot, so the page is labelled with what it shows). A version that doesn't render keeps the last page that did."""
    global tried, why
    with rendering:
        try:
            data = MODEL.read_bytes()
        except OSError as e:
            raise Fail(f"cannot read the model {MODEL.name}: {e}")
        v = hashlib.sha256(data).hexdigest()[:16]
        if v != tried:
            tried = v
            try:
                m = json.loads(data)
                with tempfile.TemporaryDirectory() as tmp:
                    out = Path(tmp) / "page.html"
                    cli.render_model(m, MODEL, out)  # drawn as the model's own file is: its copy sits next to it
                    head, _, tail = out.read_text(encoding="utf-8").rpartition("</body>")
            except (Exception, SystemExit) as e:  # the CLI ends on a model the engine rejects: here it is the page's
                said = f"it is not JSON ({e})" if isinstance(e, ValueError) else str(e.code) if isinstance(e, SystemExit) else repr(e)
                with lock:
                    why = said.strip()[-1500:] or "it does not render"
            else:
                with lock:
                    drawn[:] = [v, head + SCRIPT.replace("__MODEL__", v).replace("__MAP__", MAPID) + "</body>" + tail]
                    why = None
                    refit(m)
        return drawn[0], why


class Page(http.server.BaseHTTPRequestHandler):
    def ours(self):
        """A request of this server's own page: its Host (a site that points its own name at 127.0.0.1, DNS rebinding, reads
        nothing) and, when one is sent, its Origin (another site's page posts nothing)."""
        return self.headers.get("Host") in HOSTS and self.headers.get("Origin", URL) in ORIGINS

    def do_GET(self):
        if not self.ours():
            return self.send_error(403)
        at = urllib.parse.urlsplit(self.path)
        if at.path == "/events":
            asked = urllib.parse.parse_qs(at.query)
            if (asked.get("map") or [MAPID])[0] != MAPID:  # a page of another model's server, which had this port: it stops listening
                return self.send_error(409, explain="this server serves another map")
            return self.events((asked.get("page") or [""])[0][:64])
        if at.path != "/":
            return self.send_error(404)
        try:
            shown, broken = page()
        except Fail as e:
            return self.send_error(500, explain=str(e))
        body = (drawn[1] if shown else WAITING.replace("__WHY__", html.escape(broken or ""))).encode("utf-8")
        self.send_response(200 if shown else 503)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """A page's report (/state): what it shows, and the command it has shown or failed to."""
        if not self.ours():
            return self.send_error(403)
        if urllib.parse.urlsplit(self.path).path != "/state":
            return self.send_error(404)
        if self.headers.get_content_type() != "application/json":  # a form on another site can't send one
            return self.send_error(415)
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= 1 << 20:
            return self.send_error(413)
        try:
            msg = json.loads(self.rfile.read(size))
        except ValueError:
            return self.send_error(400)
        if not (isinstance(msg, dict) and isinstance(msg.get("page"), str) and 0 < len(msg["page"]) <= 64):
            return self.send_error(400)
        report(msg["page"], msg)
        self.send_response(204)
        self.end_headers()

    def events(self, pid):
        """Server-Sent Events: `want`, each time a command changes it, and first for a page that missed the latest; a ping
        every BEAT s, whose failed write tells a page that closed. A page that names itself (?page=) is counted, and
        answered for; the page shown while no version renders listens only."""
        q, key = queue.Queue(), pid or f"~{id(self)}"
        with lock:
            pages.setdefault(key, {}).update(q=q, listens=not pid)
            first = event() if latest and self.headers.get("Last-Event-ID") != latest else None
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if first:
                self.wfile.write(first)
            while True:
                try:
                    self.wfile.write(q.get(timeout=BEAT))
                except queue.Empty:
                    self.wfile.write(b": still here\n\n")
        except OSError:
            pass
        finally:
            with lock:
                if pages.get(key, {}).get("q") is q:
                    if pid:
                        pages[key]["q"] = None
                    else:
                        del pages[key]
                told.notify_all()  # a page tool waiting for this page waits no longer

    def log_request(self, code="-", size="-"):
        if not (self.command == "POST" and str(code).startswith("2")):  # a page's reports would fill the log
            super().log_request(code, size)


JSON_TYPES = {"string": str, "boolean": bool, "integer": int, "array": list, "object": dict}


def fits(v, s):
    """Whether an argument is of the type its inputSchema gives (the subset these tools use)."""
    if "anyOf" in s:
        return any(fits(v, x) for x in s["anyOf"])
    t = s.get("type")
    if not isinstance(v, JSON_TYPES.get(t, object)) or t == "integer" and (isinstance(v, bool) or v < s.get("minimum", v)):
        return False
    return t != "array" or all(fits(x, s.get("items", {})) for x in v)


def failure(rid, code, message, data=None):
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": code, "message": message, **({"data": data} if data is not None else {})}}


def result(method, p):
    if not isinstance(p, dict):
        raise RpcError(-32602, "Invalid params: params is an object")
    meta = p.get("_meta")
    asked = meta.get("io.modelcontextprotocol/protocolVersion") if isinstance(meta, dict) else None
    if asked is not None and asked not in VERSIONS:
        raise RpcError(-32022, "Unsupported protocol version", {"supported": VERSIONS, "requested": asked})
    if method == "initialize":  # the versions before 2026-07-28: the client's own, if it is one of them, else the latest
        v = p.get("protocolVersion")
        return {"protocolVersion": v if v in VERSIONS[1:] else VERSIONS[1], "capabilities": {"tools": {}}, "serverInfo": SERVER, "instructions": HELLO}
    if method == "server/discover":
        return {"supportedVersions": VERSIONS, "capabilities": {"tools": {}}, "instructions": HELLO, **CACHED}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": TOOLS, **CACHED}
    if method == "tools/call":
        t, a = TOOL.get(p.get("name")), p.get("arguments") or {}
        if not t or not isinstance(a, dict):
            raise RpcError(-32602, f"Unknown tool: {p.get('name')}" if not t else "Invalid params: arguments is an object")
        try:
            if missing := [k for k in t["inputSchema"]["required"] if k not in a]:
                raise Fail(f"{t['name']} needs {', '.join(missing)}")
            props = t["inputSchema"]["properties"]  # a value of another type would fail inside the tool, as an internal error
            if wrong := [f"{k} is not {json.dumps({x: y for x, y in props[k].items() if x != 'description'})}" for k in a if k in props and not fits(a[k], props[k])]:
                raise Fail(f"{t['name']}: {'; '.join(wrong)}")
            said = call(t["name"], a)
        except Fail as e:
            return {"content": [{"type": "text", "text": str(e)}], "isError": True}
        return {"content": [{"type": "text", "text": said if isinstance(said, str) else json.dumps(said)}], "isError": False}
    raise RpcError(-32601, f"Method not found: {method}")


def answer(line):
    """The reply to one line: a message's, a batch's (a list of replies: JSON-RPC 2.0, and MCP 2025-03-26, which this
    server speaks, has batches), or None for notifications and responses."""
    try:
        msg = json.loads(line)
    except ValueError:
        return failure(None, -32700, "Parse error")
    if isinstance(msg, list):
        return [r for r in map(reply, msg) if r is not None] or None if msg else failure(None, -32600, "Invalid Request")
    return reply(msg)


def reply(msg):
    """The reply to one message: None for a notification, or for a response (this server sends no requests)."""
    if isinstance(msg, dict) and "method" not in msg and ("result" in msg or "error" in msg):
        return None
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0" or not isinstance(msg.get("method"), str):
        return failure(msg.get("id") if isinstance(msg, dict) else None, -32600, "Invalid Request")
    if "id" not in msg:
        # ponytail: notifications/cancelled is not acted on: a call runs to its end, a second or less (one Node run)
        return None  # notifications/initialized, notifications/cancelled: nothing to answer
    try:
        return {"jsonrpc": "2.0", "id": msg["id"], "result": {**result(msg["method"], msg.get("params") or {}), "resultType": "complete",
                                                              "_meta": {"io.modelcontextprotocol/serverInfo": SERVER}}}
    except RpcError as e:
        return failure(msg["id"], *e.args)
    except Exception as e:
        traceback.print_exc()
        return failure(msg["id"], -32603, f"Internal error: {e}")


def serve(model, port):
    global MODEL, URL, HOSTS, ORIGINS, HELLO, MAPID
    MODEL = Path(model).resolve()
    MAPID = hashlib.sha256(str(MODEL).encode()).hexdigest()[:16]
    os.environ["UMLIMATOR_OFFLINE"] = "1"  # the page's render fetches no logo: the server reaches nothing beyond 127.0.0.1
    cli.urllib.request.urlopen = cli.offline  # (the page is rendered in this process, which read the variable before it was set)
    # taken (another map's server, say): this model's own port, the same on each run so an open page's URL keeps
    # working, else any free one; the tools name it
    own = 7400 + int(hashlib.sha256(str(MODEL).encode()).hexdigest(), 16) % 500
    for p in dict.fromkeys((port, own, 0)):
        try:
            httpd = http.server.ThreadingHTTPServer(("127.0.0.1", p), Page)
            break
        except OSError:
            if not p:
                raise
            print(f"port {p} is taken", file=sys.stderr)
    port = httpd.server_address[1]
    URL, HOSTS = f"http://127.0.0.1:{port}", {f"127.0.0.1:{port}", f"localhost:{port}"}
    ORIGINS = {f"http://{h}" for h in HOSTS}
    HELLO = (f"The architecture map in {MODEL} (the server runs in {Path.cwd()}). The read tools answer from the file as it is "
             f"at each call; the page tools drive the map's interactive page at {URL}, which the user opens in a browser.")
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"umlimator mcp: {MODEL.name}, its page at {URL}", file=sys.stderr)
    out, sys.stdout = sys.stdout.buffer, sys.stderr  # stdout carries the protocol only: a stray print goes to the log
    for line in sys.stdin.buffer:
        if line.strip() and (said := answer(line)) is not None:
            out.write(json.dumps(said).encode() + b"\n")
            out.flush()
