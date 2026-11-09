#!/usr/bin/env python3
"""umlimator.py mcp MODEL.json [--port N]: a Model Context Protocol server over stdio, for one map model (#91).

Read tools answer from the model file as it is at each call, with the module's own functions run in Node (as `diff` and
`drift` run theirs). Page tools drive the model's page, which the server serves on http://127.0.0.1:<port>: the CLI's
own rendered page, plus a script, added only here, that plays the commands the server pushes over Server-Sent Events.
Standard library only, and nothing is fetched (UMLIMATOR_OFFLINE).

The protocol: JSON-RPC 2.0, one message per line on stdin and stdout; logs go to stderr. Both eras of MCP: 2026-07-28,
the current specification (per-request `_meta`, server/discover), and the `initialize` handshake of the versions before
it, which a client sends that predates 2026-07-28 or falls back to it.
"""
import hashlib, http.server, itertools, json, os, queue, re, subprocess, sys, tempfile, threading, traceback
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
PAGE = " It answers whether a page is connected; without one, it gives the URL to open."
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
         {"other_model_path": {"type": "string", "description": "the other model's JSON file: absolute, or relative to where the server runs"}},
         "other_model_path"),
    tool("show_view", "Shows a view on the map's page." + PAGE, {"view": VIEW}, "view"),
    tool("highlight", "Lights cards and lines on the map's page and dims the rest. view: the view to show first." + PAGE,
         {"refs": {"type": "array", "items": {"anyOf": [{"type": "string"}, {"type": "object"}]},
                   "description": "card or line ids, or the Refs paths and reach give"}, "view": VIEW}, "refs"),
    tool("tour", "A dot rides the lines through these cards in turn, on the map's page. view: the view to show first." + PAGE,
         {"cards": {"type": "array", "items": {"type": "string"}, "description": "card ids, in order"}, "view": VIEW}, "cards"),
    tool("play_story", "Plays one of the model's stories on the map's page, step by step, with its captions." + PAGE,
         {"id": {"type": "string", "description": "a story's id (list_views gives them)"}}, "id"),
    tool("clear", "Takes the highlight, the tour and the story off the map's page." + PAGE),
]
TOOL = {t["name"]: t for t in TOOLS}


class Fail(Exception):
    """A tool's error, said to the assistant (isError), which can fix its call."""


class RpcError(Exception):
    """A JSON-RPC error: code, message, data."""


MODEL = URL = HELLO = None
HOSTS = set()
clients, lock, rendering = set(), threading.Lock(), threading.Lock()
last = None              # (event id, command): the latest command, for a page that connects after it
drawn = [None, ""]       # the page as served: the model's version it shows, and its HTML
ids = itertools.count(1)
RUN = os.urandom(4).hex()  # event ids differ from one run of the server to the next, so a page that reconnects is not taken as up to date


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
        other = Path(a["other_model_path"]).expanduser()
        try:
            before = json.loads(other.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            raise Fail(f"cannot read {other}: {e}")
        d = node("diff", before, m)
        return {"summary": d["summary"], "views": d["views"]}
    # the page's tools: a command for the page, checked against the model first
    shown = {"view": view(m, a["view"])["id"]} if a.get("view") else {}
    if name == "show_view":
        cmd = {"do": "view", **shown}
    elif name == "highlight":
        cmd = {"do": "highlight", "refs": refs(m, a["refs"]), **shown}
    elif name == "tour":
        cards = a["cards"] if isinstance(a["cards"], list) else [a["cards"]]
        known = set(views(m)[shown["view"]].get("nodeIds") or []) if shown else {n["id"] for n in every(m, "nodes")}
        if bad := [c for c in cards if c not in known]:
            raise Fail(f"no card {', '.join(map(repr, bad))}" + (f" on view {shown['view']!r}" if shown else " in the model"))
        cmd = {"do": "tour", "cards": cards, **shown}
    elif name == "play_story":
        told = [s.get("id") for s in m.get("stories") or [] if isinstance(s, dict) and s.get("steps")]
        if a["id"] not in told:
            raise Fail(f"no story {a['id']!r}; the stories: {', '.join(map(str, told)) or 'none'}")
        cmd = {"do": "play", "story": a["id"]}
    else:
        cmd = {"do": "clear"}
    n = push(cmd)
    return f"Sent to {n} page{'' if n == 1 else 's'} at {URL}." if n else f"No page is connected: open {URL} in a browser, and it shows this once it connects."


def push(cmd):
    """Sends a command to every connected page, and keeps it for the next page that connects; how many pages there are."""
    global last
    last = (f"{RUN}-{next(ids)}", cmd)
    data = event(*last)
    with lock:
        for q in clients:
            q.put(data)
        return len(clients)


def event(eid, cmd):
    return f"id: {eid}\ndata: {json.dumps({**cmd, 'model': version()})}\n\n".encode()


# The script the served page gets. The page keeps its map's handle on window.umlimatorPage (MOUNT, in the served copy).
MOUNT = "mountPage(app, D,"
SCRIPT = """<script type="module">
/* umlimator.py mcp (#91), in the served page only: plays the commands the server sends over Server-Sent Events */
const map = window.umlimatorPage, model = '__MODEL__';
let story = null, queue = Promise.resolve();
async function run(c) {
  if (c.model !== model) return location.reload(); // the model changed since this page was drawn: draw it again
  if (story) story.stop(); story = null;           // a new command ends a story the server started
  if (c.do === 'clear') { map.tour(null); map.highlight(null); }
  // ponytail: while the reader's own switch of view is under way, setView() does nothing and the command lands on that view
  if (c.view && c.view !== map.view) await map.setView(c.view);
  if (c.do === 'highlight') map.highlight(c.refs);
  if (c.do === 'tour') map.tour(c.cards);
  if (c.do === 'play') story = map.play(c.story);
}
map.on('viewchange', () => map.highlight(null));   // a highlight is about its view: on another it would dim every card
function listen() {
  if (!map.view) return setTimeout(listen, 50);    // once the map is drawn
  new EventSource('/events').onmessage = e => { queue = queue.then(() => run(JSON.parse(e.data))).catch(console.error); };
}
listen();
</script>
"""


def page():
    """The CLI's own page for the model, rendered again when the model changed, with the script that plays commands."""
    with rendering:
        v = version()
        if drawn[0] != v:
            with tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / "page.html"
                r = subprocess.run([sys.executable, str(cli.HERE / "umlimator.py"), "render", str(MODEL), "--out", str(out), "--no-check"],
                                   capture_output=True, text=True)
                if r.returncode or not out.is_file():
                    raise Fail(f"umlimator.py render failed: {(r.stderr or r.stdout).strip()[-1500:]}")
                text = out.read_text(encoding="utf-8")
            if text.count(MOUNT) != 1:
                raise Fail(f"the page no longer mounts its map with {MOUNT}..., where umlimator_mcp.py keeps its handle")
            head, _, tail = text.replace(MOUNT, "window.umlimatorPage = " + MOUNT).rpartition("</body>")
            drawn[:] = [v, head + SCRIPT.replace("__MODEL__", v) + "</body>" + tail]
        return drawn[1]


class Page(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get("Host") not in HOSTS:  # a site that points its own name at 127.0.0.1 (DNS rebinding) reads nothing
            return self.send_error(403)
        if self.path == "/events":
            return self.events()
        if self.path != "/":
            return self.send_error(404)
        try:
            body = page().encode("utf-8")
        except Exception as e:  # a model that does not render: the page says why
            return self.send_error(500, explain=str(e))
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def events(self):
        """Server-Sent Events: each command the tools send, after the latest one for a page that missed it."""
        q = queue.Queue()
        with lock:
            clients.add(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if last and self.headers.get("Last-Event-ID") != last[0]:
                self.wfile.write(event(*last))
            while True:
                try:
                    self.wfile.write(q.get(timeout=10))
                except queue.Empty:
                    # ponytail: a page closed in the last 10 to 20 s still counts as connected, until a write to it fails
                    self.wfile.write(b": still here\n\n")
        except OSError:
            pass
        finally:
            with lock:
                clients.discard(q)


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
            said = call(t["name"], a)
        except Fail as e:
            return {"content": [{"type": "text", "text": str(e)}], "isError": True}
        return {"content": [{"type": "text", "text": said if isinstance(said, str) else json.dumps(said)}], "isError": False}
    raise RpcError(-32601, f"Method not found: {method}")


def answer(line):
    """The reply to one message: None for a notification, or for a response (this server sends no requests)."""
    try:
        msg = json.loads(line)
    except ValueError:
        return failure(None, -32700, "Parse error")
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
    global MODEL, URL, HOSTS, HELLO
    MODEL = Path(model).resolve()
    os.environ["UMLIMATOR_OFFLINE"] = "1"  # the page's render fetches no logo: the server reaches nothing beyond 127.0.0.1
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), Page)
    except OSError:  # taken (another map's server, say): a free one, which the tools name
        print(f"port {port} is taken: the page is served on another", file=sys.stderr)
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Page)
    port = httpd.server_address[1]
    URL, HOSTS = f"http://127.0.0.1:{port}", {f"127.0.0.1:{port}", f"localhost:{port}"}
    HELLO = (f"The architecture map in {MODEL.name}. The read tools answer from the file as it is at each call; the page tools drive "
             f"the map's interactive page at {URL}, which the user opens in a browser.")
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"umlimator mcp: {MODEL.name}, its page at {URL}", file=sys.stderr)
    out, sys.stdout = sys.stdout.buffer, sys.stderr  # stdout carries the protocol only: a stray print goes to the log
    for line in sys.stdin.buffer:
        if line.strip() and (reply := answer(line)) is not None:
            out.write(json.dumps(reply).encode() + b"\n")
            out.flush()
