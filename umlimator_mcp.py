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
import codecs, hashlib, hmac, html, http.server, itertools, json, os, queue, re, secrets, sys, tempfile, threading, time, traceback, urllib.parse
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
    tool("story_from_flow", "A story told from a view's main flow, returned and not saved (the model file is not written): one step per "
         "card on the main flow, each with select, highlight (the card and the main line into it), tour (the two cards that line joins) "
         "and a caption from the line's what or label, naming the stores it reads or writes; and `chapters`, each branch off the main "
         "flow as a story of its own, with `at`, the step it leaves from (0-based). A sequence view gives its messages in order, a BPMN "
         "view its path from the start event, a communication view its numbered messages. play_story plays it as it is, unsaved; to keep "
         "it, add it to the model's stories with set_field or apply.",
         {"view": VIEW, "id": {"type": "string", "description": "the story's id (default flow-<view>)"},
          "title": {"type": "string"}, "chapters": {"type": "boolean", "description": "false: no chapters"},
          "audience": {"type": "string", "description": "who it is told to, kept on the story; business: the captions leave out the stores a step reads or writes"}}, "view"),
    tool("show_view", "Shows a view on the map's page." + PAGE, {"view": VIEW}, "view"),
    tool("highlight", "Lights cards and lines on the map's page and dims the rest. view: the view to show first." + PAGE,
         {"refs": {"type": "array", "items": {"anyOf": [{"type": "string"}, {"type": "object"}]},
                   "description": "card or line ids, or the Refs paths and reach give"}, "view": VIEW}, "refs"),
    tool("tour", "A dot rides the lines through these cards in turn, on the map's page: each card must share a line with the next "
         "on the view, and each must be drawn as a card there, not as a box that holds cards. view: the view to show first; with none, "
         "the view shown now if it shows the cards and draws those lines, else the first view that does." + PAGE,
         {"cards": {"type": "array", "items": {"type": "string"}, "description": "card ids, in order"}, "view": VIEW}, "cards"),
    tool("play_story", "Plays a story on the map's page, step by step, with its captions: one of the model's, by its id, or one given "
         "as it is (story), such as story_from_flow's, which is played and not saved (the model file is not written). A story's "
         "chapters are offered in the page's caption bar at their steps. Give id or story." + PAGE,
         {"id": {"type": "string", "description": "a story's id (list_views gives them)"},
          "story": {"type": "object", "description": "a story to play as it is: {id, title?, steps: [{view, caption?, select?, highlight?, tour?, camera?, duration?}], "
                    "chapters?}, as story_from_flow returns it; its steps are checked as validate() checks the model's stories"}}),
    tool("clear", "Takes the assistant's highlight, tour and story off the map's page (a story the reader started is the reader's)." + PAGE),
    tool("page_state", "What the map's page shows now, as each open page reports it: its view, selection, layers ('mcp' is the "
         "assistant's highlight), story, tour and camera (the map's MapState); whether it shows the model's latest version, and "
         "whether that version renders; and what the assistant last asked it to show. Needs no page: with none open, it says so."),
]
# The edit tools: each is the page's own gesture on a typed view (the type's hooks: its rules on lines and owners), and the
# apply() commands a host's would be on a map view; it writes the model file as one undo step (undo() takes it back), only
# when validate() finds no new error, and an open page reloads with it. dry_run: what it would do, and nothing written.
WRITES = (" It writes the model file only when validate() finds no new error, as one step undo() takes back, and an open page"
          " reloads with it. It answers with the apply() commands, diff()'s summary in words, and the problems, rule breaks"
          " and layout issues it adds. dry_run: the same answer, and nothing written.")
DRY = {"type": "boolean", "description": "preview only: nothing is written"}
CHOOSE = {"anyOf": [{"type": "string"}, {"type": "integer", "minimum": 0}],
          "description": "where the page would ask (a picker the type opens): the choice, by its label or its place from 0"}
ANY = {"description": "any JSON value"}
EDITS = [
    tool("add_card", "Adds a card (an element) to a view, as the page's palette and N do: on a typed view, of `type` (the view's "
         "first kind when none is given), by the type's own rules; on a map view, a card of `kind`. box: the box to put it in "
         "(move_to_box's box). id: its id, else one made as the page makes it (class1)." + WRITES,
         {"view": VIEW, "label": {"type": "string"}, "type": {"type": "string", "description": "a typed view's element type (uml.Class) or its name in the palette (User task)"},
          "kind": {"type": "string", "description": "a map card's kind (database, service ...)"}, "box": {"type": "string"},
          "id": {"type": "string"}, "choose": CHOOSE, "dry_run": DRY}, "view", "label"),
    tool("connect", "Draws a line from one element to another on a view, as the page's L does: on a typed view, of `type` (needed "
         "when the view draws more than one kind), by the type's own rules (a reply pairs with its call, a flow into a gateway); "
         "on a map view, a line of `kind`. label: its text." + WRITES,
         {"view": VIEW, "from": CARD, "to": CARD, "label": {"type": "string"}, "type": {"type": "string", "description": "a typed view's line type (uml.Association) or its name in the palette (Reply)"},
          "kind": {"type": "string", "description": "a map line's kind"}, "id": {"type": "string"}, "choose": CHOOSE, "dry_run": DRY}, "view", "from", "to"),
    tool("rename", "Renames an element, as F2 does: on a typed view by the type's own rules (a message's text, a transition's trigger); "
         "a map view's box too. view: the view to rename it on, else the first that shows it." + WRITES,
         {"id": {"type": "string"}, "label": {"type": "string"}, "view": VIEW, "choose": CHOOSE, "dry_run": DRY}, "id", "label"),
    tool("move_to_box", "Puts an element into another box (its owner: a package, a group, a lane ...) or, with box null, out of every "
         "box, as the properties panel's Owner field does: by the type's rules on owners; on a map view, into one of the view's boxes." + WRITES,
         {"view": VIEW, "id": {"type": "string"}, "box": {"anyOf": [{"type": "string"}, {"type": "null"}]}, "choose": CHOOSE, "dry_run": DRY}, "view", "id", "box"),
    tool("remove", "Takes elements out of a view (Delete on the page), or with from_model out of the model, with their lines and every "
         "place that names them (Shift + Delete), by the type's own rules." + WRITES,
         {"ids": {"anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]}, "view": VIEW,
          "from_model": {"type": "boolean"}, "choose": CHOOSE, "dry_run": DRY}, "ids"),
    tool("set_field", "Sets a field of an element (id) or of a view (view, no id), as the properties panel does: path 'label', "
         "'props.visibility', or a list of keys; no value takes the field off. On a typed view the type's own rules come first." + WRITES,
         {"path": {"anyOf": [{"type": "string"}, {"type": "array", "items": {"type": "string"}}]}, "value": ANY, "id": {"type": "string"},
          "view": VIEW, "choose": CHOOSE, "dry_run": DRY}, "path"),
    tool("pin", "Pins a card to a column and row of a view's layout, as a drag in its box does; neither: takes its pin off." + WRITES,
         {"view": VIEW, "id": {"type": "string"}, "col": {"type": "integer", "minimum": 0},
          "row": {"type": "number", "minimum": 0, "description": "a row, or half one between two (as Alt + arrows place a card)"}, "dry_run": DRY}, "view", "id"),
]
STEP = {"type": "array", "items": {"type": "object"}, "description": "the steps, in order: an edit tool's call ({tool: 'connect', view, from, "
        "to, ...}, no dry_run) or an apply() command as it is ({op: 'set', id, path, value})"}
TOOLS += EDITS + [
    tool("preview", "What the steps would do, run on a copy, one after the other: the apply() commands, diff()'s summary in words, the "
         "problems (validate()), rule breaks and layout issues (check(), on the views it changes) the change adds. Nothing is written.",
         {"edits": STEP}, "edits"),
    tool("apply", "Runs the steps as one change and writes the model file, atomically, only when validate() finds no new error: one "
         "step undo() takes back. An open page reloads with it. The answer is preview's, and what the page did.", {"edits": STEP}, "edits"),
    tool("undo", "Takes the model file back to before the last change the edit tools wrote, when nothing else has written it since; redo() puts it back."),
    tool("redo", "Writes again the last change undo() took back."),
]
TOOL = {t["name"]: t for t in TOOLS}
PAGE_TOOLS = {"show_view", "highlight", "tour", "play_story", "clear"}
EDIT_TOOLS = {t["name"] for t in EDITS}


class Fail(Exception):
    """A tool's error, said to the assistant (isError), which can fix its call."""


class RpcError(Exception):
    """A JSON-RPC error: code, message, data."""


MODEL = URL = HELLO = MAPID = None  # MAPID: the model file's own id, which its pages carry
# a secret of this run, in the page it serves only: /events and /state need it, so a request another site's page makes
# (an image, a script, a frame), which cannot read the page, is no page, whatever headers its browser sends (audit 24)
TOKEN = secrets.token_urlsafe(24)
HOSTS, ORIGINS = set(), set()
lock, rendering = threading.Lock(), threading.Lock()
told = threading.Condition(lock)  # a page reported what it shows
# What the assistant asked the page to show, the latest of each, folded from the page tools' commands. view: a view's id;
# highlight: {refs, view}; tour: {n, cards}; story: {n, story}. n: the command that started a tour or story, so a page
# starts each once, and a tour or story that ended (a page says so) is not played again for a page that opens later.
want = {"view": None, "highlight": None, "tour": None, "story": None}
view_n = 0               # the command that last changed want["view"]: a page that has shown it reports the view shown now
latest = None            # the latest command's event id: a page that connects after it is sent `want`
pages = {}               # each page by the id it gives itself: q (its event queue while it is open), state, model, ack, seen
drawn = [None, "", None] # the page as served: the model's version it shows (the last that rendered), its HTML, and that model
tried, why = None, None  # the model's version last rendered, and why it did not render (None: it did)
ids = itertools.count(1)
RUN = os.urandom(4).hex()  # event ids differ from one run of the server to the next, so a page that reconnects is not taken as up to date
WAIT, BEAT = 6, 2        # s: how long a page tool waits for a page to show its command; how often an open page is pinged


def load():
    try:
        m = cli.read_json(MODEL)  # as render reads it: a BOM too, an object
    except SystemExit as e:
        raise Fail(f"cannot read the model {MODEL.name}: {e.code}")
    if bad := cli.not_objects(m):  # as render refuses it; an id that is a list ended in an internal error (audit 8)
        raise Fail(f"the model {MODEL.name}: {'; '.join(bad)}")
    return m


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


counted = [None, {}]  # the model's version last counted, and each typed view's element count in it


def element_counts(m):
    """Each typed view's element count, as the page's view pill, About box and views list count it (audit 37): the page's own
    elementCount (src/canvas/pieces.js) over the module's layout() of the view, in one Node run per version of the model
    (audit 38: list_views gave len(nodeIds), which leaves out regions, parts and lanes). A map view, a view whose layout
    throws, or a copy without src/ or Node: none, and list_views counts its nodeIds."""
    typed = [i for i, v in views(m).items() if m.get("schemaVersion") == 2 and v.get("diagram") not in (None, "map") and isinstance(i, str)]
    pieces, node_bin = cli.HERE / "src" / "canvas" / "pieces.js", cli.shutil.which("node")
    if not typed or not pieces.is_file() or not node_bin:
        return {}
    at = hashlib.sha256(json.dumps(m, sort_keys=True).encode()).hexdigest()
    if counted[0] == at:
        return counted[1]
    code = (f"import {{ layout }} from {json.dumps(cli.LIB.as_uri())}; import {{ elementCount }} from {json.dumps(pieces.as_uri())};"
            "let s = ''; for await (const c of process.stdin) s += c; const [m, ids] = JSON.parse(s), out = {};"
            "for (const id of ids) { try { out[id] = elementCount(m.views.find(v => v && v.id === id), layout(m, id)); } catch { out[id] = null; } }"
            "process.stdout.write(JSON.stringify(out));")
    r = cli.run([node_bin, "--input-type=module", "-e", code], input=json.dumps([m, typed]))
    try:
        got = {k: v for k, v in json.loads(r.stdout).items() if isinstance(v, int)} if not r.returncode else {}
    except ValueError:
        got = {}
    counted[:] = [at, got]
    return got


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


def known(m):
    """The ids a Ref may name: cards, lines (those with no id as "<from>-><to>#<n>"), boxes and members at any depth; and
    the cards and lines apart (the lines by those names, each to its line)."""
    cards, lines = {n["id"] for n in every(m, "nodes")}, {e["id"]: e for e in every(m, "edges")}
    for es in [m.get("edges"), *(v.get("edges") for v in views(m).values())]:  # "<from>-><to>#<n>": a line without an id, as Refs name it
        seen = {}
        for e in es if isinstance(es, list) else []:
            if isinstance(e, dict):
                k = f"{e.get('from')}->{e.get('to')}"; seen[k] = seen.get(k, -1) + 1
                lines.setdefault(str(e["id"]) if e.get("id") is not None else f"{k}#{seen[k]}", e)
    boxes = {c.get("id") for v in views(m).values() for c in v.get("containers") or [] if isinstance(c, dict)}
    members, todo = set(), [x for n in every(m, "nodes") for x in n.get("members") or []]
    while todo:  # a member (a port, a constraint property) at any depth: a Ref may name one
        x = todo.pop()
        if isinstance(x, dict):
            members.add(x.get("id")); todo += x.get("members") or []
    return cards | set(lines) | boxes | members, cards, lines


def refs(m, items):
    """highlight's refs: a Ref as it is, a card's id as its Ref, else a line's."""
    (known_, cards, lines), out = known(m), []
    for i, x in enumerate(items if isinstance(items, list) else [items]):
        if isinstance(x, dict):
            text = [k for k in ("id", "node", "container", "view", "value") if k in x and not isinstance(x[k], str)]
            if x.get("type") not in ("node", "edge", "container", "chip", "badge") or text or "ids" in x and not (
                    isinstance(x["ids"], list) and all(isinstance(j, str) for j in x["ids"])):
                raise Fail(f"refs[{i}] is not a Ref: type is node, edge, container, chip or badge; ids a list of strings; "
                           f"id, node, container, view and value strings" + (f" ({', '.join(text)} is not)" if text else ""))
            if gone := [j for j in (x.get("id"), x.get("node"), x.get("container"), *(x.get("ids") or [])) if j is not None and j not in known_]:
                raise Fail(f"refs[{i}] names {', '.join(map(repr, gone))}: no card, line or box in the model")
            if "view" in x:
                view(m, x["view"])  # a Ref's view is shown: one the model has, as show_view asks (audit 13)
            out.append(x)
        elif x in cards:
            out.append({"type": "node", "id": x})
        elif x in lines:
            out.append({"type": "edge", "ids": [x]})
        else:
            raise Fail(f"no card or line {x!r} in the model")
    return out


EDITOR = cli.HERE / "umlimator_edit.mjs"  # the edit tools' Node half: the page's own editor on the model (its header says how)
KEEP, ROOM = 50, 16 << 20                  # changes the undo history keeps, and the most text it holds (16 MB)


def base_of():
    """The model before the last change the edit tools wrote, from the undo history, while the file is still what that change
    wrote: the page draws the model against it (stableFrom), so the cards the change left alone keep their places. None when
    there is no such change, or the file has been written since (layout-flow.md section 8)."""
    h = history()
    c = h["done"][-1] if h["done"] and isinstance(h["done"][-1], dict) else None
    if not c or not isinstance(c.get("before"), str):
        return None
    try:
        now, _ = model_file()
        if sha(now) != c.get("after_sha"):
            return None
        b = cli.load_json(c["before"], MODEL.name)
    except (Fail, ValueError, RecursionError, SystemExit):
        return None
    return b if isinstance(b, dict) and not cli.not_objects(b) else None


def history_file():
    """The undo history, next to the model: MODEL.json.undo (not *.json, so a folder of models never takes it for one)."""
    return MODEL.with_name(MODEL.name + ".undo")


def history():
    """{done: [...], undone: [...]}: each change written, {before, form, after_sha, summary, at}, the model file's text
    before it (and its encoding and BOM) and a hash of its text after; each change undo() took back, {after, form,
    before_sha, ...}, the other way round. A
    history that is missing or unreadable is an empty one."""
    try:
        h = json.loads(history_file().read_text(encoding="utf-8"))
        if isinstance(h, dict) and all(isinstance(h.get(k), list) for k in ("done", "undone")):
            return h
    except (OSError, ValueError, RecursionError):
        pass
    return {"done": [], "undone": []}


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def kept(h):
    """The history as it is written: the last KEEP changes, and no more than ROOM of text (the oldest go first)."""
    for k in ("done", "undone"):
        h[k] = h[k][-KEEP:]
        while len(h[k]) > 1 and sum(len(c.get("before") or c.get("after") or "") for c in h[k]) > ROOM:
            h[k].pop(0)
    return json.dumps(h)


BOMS = ((codecs.BOM_UTF32_LE, "utf-32-le"), (codecs.BOM_UTF32_BE, "utf-32-be"), (codecs.BOM_UTF8, "utf-8"),
        (codecs.BOM_UTF16_LE, "utf-16-le"), (codecs.BOM_UTF16_BE, "utf-16-be"))  # UTF-32 LE's BOM starts as UTF-16 LE's


def encoded(text, form=None):
    """text as the bytes of a file in form, {"codec", "bom"} as model_file() gives it (UTF-8 with no BOM when none)."""
    form = form if isinstance(form, dict) and form.get("codec") in {c for _, c in BOMS} else {"codec": "utf-8"}
    bom = form.get("bom")
    return ("\ufeff" * (bom if type(bom) is int and 0 < bom < 64 else 0) + text).encode(form["codec"])


def write(path, text, form=None):
    """path's text, replaced atomically: written to a file beside it, then renamed over it, so a reader (the page, an
    editor, a build) sees the old file or the new one, never half of one. Written in form, the encoding and BOM
    model_file() found (UTF-8 with no BOM when none)."""
    data = encoded(text, form)
    fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        if path.exists():
            os.chmod(tmp, path.stat().st_mode & 0o7777)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def model_file():
    """The model file's text, as the CLI reads it: UTF-8 (a BOM too), UTF-16 or UTF-32; and its form, {"codec", "bom"},
    which write() keeps, so an edit and undo() leave the file in its own encoding, byte for byte (audit 65)."""
    try:
        data = MODEL.read_bytes()
        codec = next((c for b, c in BOMS if data.startswith(b)), None) or json.detect_encoding(data)
        text = data.decode(codec)
    except (OSError, UnicodeDecodeError) as e:
        raise Fail(f"cannot read the model {MODEL.name}: {getattr(e, 'strerror', None) or e}")
    bare = text.lstrip("\ufeff")
    return bare, {"codec": codec, **({"bom": len(text) - len(bare)} if len(text) > len(bare) else {})}


def model_text():
    return model_file()[0]


def checked(name, a, where=""):
    """An edit tool's arguments checked against its inputSchema, as tools/call checks them: the same words for a step of
    preview() or apply()."""
    t = TOOL[name]
    props = t["inputSchema"]["properties"]
    if missing := [k for k in t["inputSchema"]["required"] if k not in a]:
        raise Fail(f"{where}{name} needs {', '.join(missing)}")
    if extra := [k for k in a if k not in props]:
        raise Fail(f"{where}{name}: no argument {', '.join(map(str, extra))}; its arguments: {', '.join(props) or 'none'}")
    if wrong := [f"{k} is not {json.dumps({x: y for x, y in props[k].items() if x != 'description'})}" for k in a if not fits(a[k], props[k])]:
        raise Fail(f"{where}{name}: {'; '.join(wrong)}")
    return {k: whole(v) if props[k].get("type") == "integer" else v for k, v in a.items()}


def steps_of(edits):
    """preview()'s and apply()'s steps, each an edit tool's call (its arguments checked, no dry_run) or an apply() command."""
    out = []
    for i, x in enumerate(edits):
        where = f"edits[{i}]: "
        if not isinstance(x, dict):
            raise Fail(f"{where}a step is an object: an edit tool's call ({{tool, ...}}) or an apply() command ({{op, ...}})")
        if "op" in x:
            if "tool" in x:
                raise Fail(f"{where}a step is an edit tool's call or an apply() command, not both (tool and op)")
            out.append(x)
            continue
        name, a = x.get("tool"), {k: v for k, v in x.items() if k != "tool"}
        if name not in EDIT_TOOLS:
            raise Fail(f"{where}{json.dumps(name)} is not an edit tool ({', '.join(t['name'] for t in EDITS)}), and no op makes it an apply() command")
        if "dry_run" in a:
            raise Fail(f"{where}a step has no dry_run: preview() writes nothing, apply() writes the whole change")
        out.append({"tool": name, **checked(name, a, where)})
    return out


def change(steps):
    """The steps, run on the model by the page's own editor in Node (umlimator_edit.mjs): the commands, the model after
    them as text written as the file is, and what the change adds. A step the page would refuse is the tool's error."""
    nodejs = cli.shutil.which("node")
    if not nodejs:
        raise Fail("the edit tools need Node.js 18 or later: they run the page's own editor")
    text, form = model_file()
    try:
        m = cli.load_json(text, MODEL.name)
    except (ValueError, RecursionError) as e:
        raise Fail(f"cannot edit the model {MODEL.name}: it is not JSON ({e})" if isinstance(e, ValueError) else f"cannot edit the model {MODEL.name}: it nests too deep to read")
    if not isinstance(m, dict) or (bad := cli.not_objects(m)):
        raise Fail(f"cannot edit the model {MODEL.name}: " + ("its JSON is not an object" if not isinstance(m, dict) else "; ".join(bad)))
    r = cli.run([nodejs, str(EDITOR)], input=json.dumps({"model": m, "steps": steps, "source": text}))
    try:
        out = json.loads(r.stdout) if not r.returncode else None
    except ValueError:
        out = None
    if out is None:
        said = r.stderr.strip()[-2000:]
        raise Fail((re.findall(r"^\w*Error: .*$", said, re.M) or [said or "the editor ended with no answer"])[-1])
    if "error" in out:
        raise Fail((f"step {out['step'] + 1} of {len(steps)}: " if len(steps) > 1 else "") + out["error"] + "; nothing written")
    out["before"], out["form"] = text, form
    return out


def said_of(out, written=None):
    """What a change answers: its commands, diff()'s summary, what it adds (problems, rule breaks, layout issues), what
    the type said, the ids it adds; and whether it was written, and what the pages did."""
    added = [c["element"]["id"] for c in out["commands"] if isinstance(c, dict) and c.get("op") == "add" and isinstance(c.get("element"), dict) and "id" in c["element"]]
    return {**({"written": written} if written is not None else {}), "commands": out["commands"], "summary": out["summary"], "views": out["views"],
            "problems": out["problems"], "rules": out["rules"], "layout": out["layout"],
            **({"said": s} if (s := [x for st in out["steps"] for x in st.get("said") or []]) else {}), **({"added": added} if added else {})}


def errors_in(problems):
    return [p for p in problems if isinstance(p, dict) and p.get("level") == "error"]


def commit(out):
    """The change written: the model file atomically, only when validate() finds no error the change adds and nothing
    else wrote the file meanwhile; then the undo history, and the pages told."""
    if bad := errors_in(out["problems"]):
        raise Fail(f"nothing written: the change adds {len(bad)} error{'' if len(bad) == 1 else 's'} validate() finds: "
                   + "; ".join(f"{p.get('path')}: {p.get('message')}" for p in bad[:8]) + ". preview() shows the whole change.")
    if not out["commands"]:
        raise Fail("nothing to change; nothing written")
    with rendering:  # one writer at a time, and the page is not drawn from a file half written
        now, form = model_file()
        if now != out["before"]:
            raise Fail("the model file changed while the change was made (another editor wrote it); nothing written: call it again")
        write(MODEL, out["text"], form)
    h = history()
    h["done"].append({"before": out["before"], "form": form, "after_sha": sha(out["text"]), "summary": out["summary"], "at": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    h["undone"] = []
    try:
        write(history_file(), kept(h))
        lost = ""
    except OSError as e:
        lost = f" (no undo: cannot write {history_file().name}: {e.strerror or e})"
    return said_of(out, True) | {"page": tell_pages() + lost}


def undo(redo=False):
    """undo(): the model file as it was before the last change the edit tools wrote; redo(): that change again. Each only
    when the file is as that change left it, so a change another editor wrote since is never lost."""
    h = history()
    stack, other = (h["undone"], h["done"]) if redo else (h["done"], h["undone"])
    if not stack:
        raise Fail(f"nothing to {'redo' if redo else 'undo'}: " + ("undo() has taken back no change since the last one written" if redo else "the edit tools have written no change to this model"))
    c = stack[-1]
    want_now, put = (c.get("before_sha"), c.get("after")) if redo else (c.get("after_sha"), c.get("before"))
    if not isinstance(put, str):
        raise Fail(f"the undo history {history_file().name} does not hold that change's text; nothing written")
    with rendering:
        now, form = model_file()
        if sha(now) != want_now:
            raise Fail(f"the model file changed since that change was {'taken back' if redo else 'written'} (another editor wrote it): "
                       f"{'redo' if redo else 'undo'} would lose that; nothing written")
        write(MODEL, put, c.get("form") or form)  # put's own encoding and BOM; a history from before audit 65 has none: the file's
    stack.pop()
    keep = {k: v for k, v in c.items() if k not in ("before", "after", "before_sha", "after_sha", "form")}
    other.append({**keep, "before": now, "form": form, "after_sha": sha(put)} if redo else {**keep, "after": now, "form": form, "before_sha": sha(put)})
    try:
        write(history_file(), kept(h))
    except OSError:
        pass
    return {"written": True, "undone" if not redo else "redone": c["summary"], "left": len(stack), "page": tell_pages()}


def tell_pages():
    """Each open page told the model has a new version: it reloads and draws it (the page script's own reload on a newer
    version), then reports it. Waits for a page to report the new version, up to WAIT s."""
    global latest
    shown, broken = page()
    t0 = time.time()
    with lock:
        open_ = [p for p in pages.values() if p.get("q")]
        if not open_:
            return f"No page is open: {URL} shows the new version."
        latest = f"{RUN}-{next(ids)}"
        data = event()
        for p in open_:
            p["q"].put(data)
        start = time.monotonic()
        while time.monotonic() - start < WAIT:
            if any(p.get("model") == shown and p.get("seen", 0) >= t0 for p in pages.values()):
                break
            told.wait(0.2)
        back = sum(1 for p in pages.values() if p.get("model") == shown and p.get("seen", 0) >= t0)
    if broken:
        return f"The new version does not render ({broken}), so the page at {URL} keeps the last version that did."
    if back:
        return f"The page at {URL} reloaded with it."
    return f"Sent to the open page at {URL}, which had not reloaded within {WAIT} s (a tab in the background?): page_state() says what it shows."


def call(name, a):
    if name in EDIT_TOOLS or name in ("preview", "apply"):  # the edit tools: a preview, or a change written
        steps = steps_of(a["edits"]) if name in ("preview", "apply") else [{"tool": name, **{k: v for k, v in a.items() if k != "dry_run"}}]
        if not steps:
            raise Fail(f"{name}: edits is empty")
        out = change(steps)
        return said_of(out) if name == "preview" or a.get("dry_run") else commit(out)
    if name in ("undo", "redo"):
        return undo(name == "redo")
    if name == "page_state":  # reads the model's bytes only: a version that is not JSON is said in it
        return page_state()
    try:
        m = load()
    except Fail:  # a page tool on a version that is not JSON (mid-edit): checked against the version the page shows, and says why
        if name not in PAGE_TOOLS or not page()[0]:
            raise
        m = drawn[2]
    if name == "list_views":
        n = element_counts(m)  # a typed view: the elements it draws, as the page counts them (audit 38)
        return {"views": [{"id": i, "title": v.get("title"), "parent": v.get("parent"), "cards": n.get(i, len(v.get("nodeIds") or []))} for i, v in views(m).items()],
                "stories": [{"id": s.get("id"), "title": s.get("title"), "steps": len(s.get("steps") or [])} for s in m.get("stories") or [] if isinstance(s, dict)]}
    if name == "describe_view":
        v, label = view(m, a["view"]), {n["id"]: cli.label_of(n.get("label"), n["id"]) for n in every(m, "nodes")}  # 0 is a label (audit 34)
        return node("describe", m, v["id"]) + "\nCard ids: " + ", ".join(f"{i} ({label.get(i, i)})" for i in v.get("nodeIds") or [])
    if name == "paths":
        v = view(m, a["view"])
        return node("paths", m, v["id"], on(v, a["from"]), on(v, a["to"]))
    if name == "reach":
        v = view(m, a["view"])
        return node("reach", m, v["id"], on(v, a["card"]), {"backward": bool(a.get("backward")), "depth": a.get("depth")})
    if name == "story_from_flow":  # the module's own storyFromFlow(), nothing written
        v, o = view(m, a["view"]), {k: a[k] for k in ("id", "title", "chapters", "audience") if k in a}
        return node("storyFromFlow", m, v["id"], o)
    if name == "broken_rules":
        return node("rules", m)
    if name == "validate":
        return node("validate", m)
    if name == "diff":
        try:
            given = Path(a["other_model_path"]).expanduser()
        except RuntimeError:  # ~name for no user of that name: an Internal error, and a traceback in the log (audit 27)
            raise Fail(f"cannot read {a['other_model_path']}: no such user, so no home folder to look in") from None
        tried = list(dict.fromkeys([given] if given.is_absolute() else [MODEL.parent / given, Path.cwd() / given]))
        try:  # a name too long for the disk raises (ENAMETOOLONG) where a missing one is only not there (audit 27)
            other = next((p for p in tried if p.is_file()), None)
            said = "" if other else "no such file" if not any(p.exists() for p in tried) else "not a file"
        except OSError as e:
            other, said = None, e.strerror or str(e)
        if other is None:  # a FIFO, /dev/stdin or /dev/zero, read on the one thread that answers, blocked every call after it (audit 26)
            raise Fail(f"cannot read {a['other_model_path']} (looked for {' and '.join(map(str, tried))}): {said}")
        try:
            before = cli.read_json(other)
        except SystemExit as e:
            raise Fail(f"cannot read {a['other_model_path']} (looked for {' and '.join(map(str, tried))}): {e.code}")
        if bad := cli.not_objects(before) or ([] if "views" in before else ["no views: not a map model"]):  # as render reads it (audit 11, 14)
            raise Fail(f"{a['other_model_path']}: {'; '.join(bad)}")
        d = node("diff", before, m)
        return {"summary": d["summary"], "views": d["views"]}
    # the page's tools: a command for the page, checked against the model first, then folded into `want`
    asked = view(m, a["view"])["id"] if "view" in a else None  # view "" is a view asked for, and none has that id (audit 15)
    if name == "show_view":
        def fold(w, n):
            w.update(view=asked, tour=None, story=None, highlight=w["highlight"] if w["highlight"] and w["highlight"]["view"] == asked else None)
    elif name == "highlight":
        lit = refs(m, a["refs"])
        at = asked or view_for(m, lit, shown_view(m))
        def fold(w, n):
            w.update(view=at or w["view"], highlight={"refs": lit, "view": at or w["view"]}, story=None)
    elif name == "tour":
        cards = a["cards"] if isinstance(a["cards"], list) else [a["cards"]]
        onview = set(views(m)[asked].get("nodeIds") or []) if asked else {n["id"] for n in every(m, "nodes")}
        if bad := [c for c in cards if c not in onview]:
            raise Fail(f"no card {', '.join(map(repr, bad))}" + (f" on view {asked!r}" if asked else " in the model"))
        # a tour with no line to ride drew nothing, yet said "Shown" (audit 47); no view shows them all: said as that (audit 48);
        # with no view asked, the first view that shows them all and rides them, not the first that shows them (audit 51)
        at = rides(m, cards, [asked] if asked else view_for(m, [{"type": "node", "id": c} for c in cards], shown_view(m), every_view=True))
        def fold(w, n):
            w.update(view=at or w["view"], tour={"n": n, "cards": cards}, story=None)
    elif name == "play_story":
        if ("id" in a) == ("story" in a):
            raise Fail("play_story: give id (one of the model's stories) or story (a story to play as it is, as story_from_flow returns it), not both")
        if "story" in a:  # a story played as given: checked as validate() checks the model's stories, and never written
            played = given_story(m, a["story"])
        else:
            told = [s.get("id") for s in m.get("stories") or [] if isinstance(s, dict) and s.get("steps")]
            if a["id"] not in told:
                raise Fail(f"no story {a['id']!r}; the stories: {', '.join(map(str, told)) or 'none'}")
            played = a["id"]
        def fold(w, n):  # the story sets its own views and lights
            w.update(view=None, highlight=None, tour=None, story={"n": n, "story": played})
    else:
        def fold(w, n):
            w.update(highlight=None, tour=None, story=None)
    return command(fold)


def given_story(m, s):
    """play_story's story, as it is given: an object with an id and steps, each step on one of the model's views; the
    model's validate() of it in place of the model's stories says what it names that the views do not have (an error
    refuses it; a warning plays)."""
    if not isinstance(s, dict) or not isinstance(s.get("id"), str) or not s["id"]:
        raise Fail("story is a story: an object with an id (a string) and steps")
    if not isinstance(s.get("steps"), list) or not s["steps"] or not all(isinstance(x, dict) for x in s["steps"]):
        raise Fail("story.steps is a list of steps, each an object with a view")
    bad = [p for p in node("validate", {**m, "stories": [s]}) if p.get("level") == "error" and str(p.get("path", "")).startswith("stories[0]")]
    if bad:
        raise Fail("story: " + "; ".join(f"{p['path'].replace('stories[0]', 'story', 1)}: {p['message']}" for p in bad[:5])
                   + (f" (and {len(bad) - 5} more)" if len(bad) > 5 else ""))
    return s


# for each view asked, in turn until one rides: why the page's tour() would not ride it there, or null. The page lays the
# view out and rides geo.edges between cards geo.byId has, so the view is laid out here as the page does: a card the view
# draws as a box (a package that holds cards, a deployment node with its instances) is no stop, and two cards in turn
# ride only a line drawn between them, either way, a card and itself only its own self-line (audit 52)
RIDES = ("const [m, vs, cards] = a, out = {}; for (const v of vs) { const geo = u.layout(m, v), by = geo.byId || {}, near = new Set(); "
         "const key = (x, y) => JSON.stringify([x, y]); for (const e of geo.edges || []) { near.add(key(e.from, e.to)); near.add(key(e.to, e.from)); } "
         "const box = cards.find(c => !by[c]); out[v] = box != null ? { box } : null; "
         "for (let k = 0; !out[v] && k + 1 < cards.length; k++) { const x = cards[k], y = cards[k + 1]; "
         "if (!near.has(key(x, y))) out[v] = { gap: [x, y] }; } if (!out[v]) break; } return out;")


def unridden(v, g, alone):
    """Why the page would not ride a tour on view v, from RIDES; alone: the only view tried, said as before (audit 47)."""
    if "box" in g:
        return f"view {v!r} draws {g['box']!r} as a box that holds cards, and a tour stops only at cards" if alone else f"view {v!r} draws {g['box']!r} as a box"
    x, y = g["gap"]
    if x == y:
        return f"{x!r} follows itself, and no line on view {v!r} joins it to itself" if alone else f"on view {v!r} no line joins {x!r} to itself"
    return f"no line joins {x!r} and {y!r} on view {v!r}, so a tour cannot ride from one to the other" if alone else f"on view {v!r} no line joins {x!r} and {y!r}"


def rides(m, cards, at):
    """A tour's dot rides a line the view draws between each card and the next, either way, as the page's tour() does:
    it lays the view out and rides the lines it draws between the cards it draws (a port's between the cards it is on); a
    card drawn as a box is no stop. at: the views that may show the tour, in the order to try them; the first that rides
    it is returned. Fewer than two cards, a box, or two in turn that no line joins on any of them, is a tour the page
    would not ride, or would skip, so the tool says why and draws nothing."""
    if len(cards) < 2:
        raise Fail(f"a tour rides the lines between cards in turn, so it needs two cards or more (it was given {len(cards)})")
    at = [at] if isinstance(at, str) else list(at or [])
    if not at:
        raise Fail("no view shows all these cards; describe_view lists a view's cards")
    gaps = script(RIDES, m, at, cards)
    if ok := next((v for v in at if v in gaps and not gaps[v]), None):
        return ok
    if len(at) == 1:
        raise Fail(unridden(at[0], gaps[at[0]], True) + "; paths() gives a route of lines between two cards")
    raise Fail("no view that shows these cards draws a line between each and the next, so a tour cannot ride them: "
               + "; ".join(unridden(v, gaps[v], False) for v in at) + "; paths() gives a route of lines between two cards")


def script(body, *args):
    """body, JavaScript run in Node with the module as u and the arguments as a, its return value the answer: a few of the
    module's functions in one Node run. An error is the tool's, as node()'s."""
    nodejs = cli.shutil.which("node")
    if not nodejs:
        raise Fail("this tool needs Node.js 18 or later: it runs the module's own functions")
    code = (f"import * as u from {json.dumps(cli.LIB.as_uri())}; let s = ''; for await (const c of process.stdin) s += c;"
            f"const a = JSON.parse(s); process.stdout.write(JSON.stringify((() => {{ {body} }})()));")
    r = cli.run([nodejs, "--input-type=module", "-e", code], input=json.dumps(args))
    if r.returncode:
        said = r.stderr.strip()[-2000:]
        raise Fail((re.findall(r"^\w*Error: .*$", said, re.M) or [said])[-1])
    return json.loads(r.stdout)


def end(e, k):
    """A line's end as drawn: a port on a part's type is drawn on the part (props.ends.<from|to>.part), else the end itself."""
    props = e.get("props")
    ends = props.get("ends") if isinstance(props, dict) else None
    part = ends.get(k) if isinstance(ends, dict) else None  # props.ends of another shape: the end itself (audit 22)
    return part.get("part") if isinstance(part, dict) and isinstance(part.get("part"), str) else e.get(k)


def shown_view(m):
    """The view shown now: the one the page that reported last says it shows, once it has shown the view the assistant
    asked for last (the reader may have moved since); else the view asked for last; else the view a page opens on, the
    model's root (as the page picks it). A tour or highlight with no view rides it when it can, so the page stays put
    (audit 53: it took the view asked for last, none on a fresh server, and the page jumped to the first view)."""
    vs = views(m)
    with lock:
        seen = sorted((p for p in pages.values() if isinstance(p.get("state"), dict) and p["state"].get("view") in vs
                       and num((p.get("ack") or [None])[0]) >= view_n), key=lambda p: p.get("seen") or 0, reverse=True)
        if seen:
            return seen[0]["state"]["view"]
        if want["view"] in vs:
            return want["view"]
    root = m.get("root")
    return root if isinstance(root, str) and root in vs else next((i for i, v in vs.items() if not v.get("parent")), next(iter(vs), None))


def view_for(m, lit, current, every_view=False):
    """The view a highlight or tour is about when the call names none: the Refs' own (paths and reach give it), else the
    view shown now (shown_view) when it shows all their cards, else the first view that does. A page that opens later shows it
    there, never on a view where it would dim every card. every_view: each view that would do, in that order (a list)."""
    named = [r["view"] for r in lit if isinstance(r, dict) and isinstance(r.get("view"), str)]
    if named:
        return named[:1] if every_view else named[0]
    lines = known(m)[2]  # a line without an id too, by its "<from>-><to>#<n>" (audit 11)
    need = {r.get("id") for r in lit if r.get("type") == "node"} | {r["node"] for r in lit if r.get("type") in ("chip", "badge") and r.get("node")} | {
        x for r in lit if r.get("type") == "edge" for i in r.get("ids") or [] for x in map(lambda k: end(lines.get(i, {}), k), ("from", "to")) if x}
    boxes = {r.get("id") or r.get("container") for r in lit if r.get("type") == "container"} - {None}
    vs, owner = views(m), {}
    todo = [(x, n["id"]) for n in every(m, "nodes") for x in n.get("members") or []]
    while todo:  # a port or part at any depth stands for its card (audit 12)
        x, card = todo.pop()
        if isinstance(x, dict):
            owner.setdefault(x.get("id"), card); todo += [(y, card) for y in x.get("members") or []]
    need = {owner.get(x, x) for x in need}
    cards = {n["id"] for n in every(m, "nodes")}
    allboxes = {c.get("id") for v in vs.values() for c in v.get("containers") or [] if isinstance(c, dict)}
    boxes |= {x for x in need if x in allboxes and x not in cards}  # a line that ends on a box needs the box (audit 12)
    need -= boxes
    fit = [v for v in dict.fromkeys([current, *vs]) if v in vs and need <= set(vs[v].get("nodeIds") or [])
           and boxes <= {c.get("id") for c in vs[v].get("containers") or [] if isinstance(c, dict)}]
    return fit if every_view else next(iter(fit), None)


def command(fold):
    """A page tool's command: folded into `want`, which goes to every open page; then the answer, once the pages have
    shown it (or have not, in WAIT s). The model's latest version is rendered first, so the pages show it, or the last
    version that rendered, and the answer says why."""
    global latest, view_n
    shown, broken = page()
    with lock:
        n, before = next(ids), want["view"]
        fold(want, n)
        if want["view"] != before:
            view_n = n
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
    # no version has rendered yet: the page is the waiting one, which says why, not a last version that did (audit 28)
    said = "" if not broken else f"The model no longer renders, so the page shows its last version that did: {broken}. " if shown else (
        f"The model does not render yet: {broken}. A page says why until a version renders. ")
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
    vs, stories = views(m), {s.get("id") for s in m.get("stories") or [] if isinstance(s, dict) and isinstance(s.get("id"), str)}  # a list id is no name (audit 20)
    known_ = known(m)[0]
    if want["view"] not in vs:
        want["view"] = None
    if h := want["highlight"]:
        h["refs"] = [r for r in h["refs"] if any(x in known_ for x in (r.get("id"), r.get("node"), r.get("container"), *(r.get("ids") or [])) if x)]
        if not h["refs"] or (h["view"] is not None and h["view"] not in vs):
            want["highlight"] = None
    if want["tour"] and not set(want["tour"]["cards"]) <= known_:
        want["tour"] = None
    shown = want["story"] and want["story"]["story"]
    if shown and (shown not in stories if isinstance(shown, str) else any(not isinstance(x, dict) or x.get("view") not in vs for x in shown.get("steps") or [])):
        want["story"] = None  # the model's story it no longer has; a story given whose views it no longer has


def story_name(s):
    """The story asked for, as page_state() says it: the model's by its id; one given, by its id and that it was given."""
    return s if isinstance(s, str) else {"id": s.get("id"), "given": True, "steps": len(s.get("steps") or [])}


def page_state():
    """What each open page shows (as it last reported it), what the assistant asked it to show, and the model's state."""
    shown, broken = page()
    with lock:  # as text, made while no page's report can change it
        now = time.time()
        return json.dumps({"url": URL, "model": {"version": version(), "shown": shown, "renders": not broken, **({"error": broken} if broken else {})},
                "asked": {**want, "tour": want["tour"] and {"cards": want["tour"]["cards"]}, "story": want["story"] and story_name(want["story"]["story"])},
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
const map = window.umlimatorMap, model = '__MODEL__', MAP = '__MAP__', TOKEN = '__TOKEN__'; // MAP: which model file this page is (another's server may take the port later); TOKEN: this run's, which its requests carry
const page = self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
const LIMIT = 5000; // ms a command may take here before it is answered as not shown (a tab in the background stops animation)
let want = {}, done = null, tour = { n: 0 }, story = null, queue = Promise.resolve(); // tour: the assistant's last, n, and on while it is on the map (#132)
const post = extra => fetch('/state', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Umlimator-Token': TOKEN }, keepalive: true,
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
    if (map.state.tour) ends.then(() => { t.on = false; }); // a path lit at rest (reduced motion) stays until a story's step or end takes it
    else if (!map.state.overlays.includes('tour')) { t.on = false; throw new Error('no line joins these cards on this view, so no tour rides'); } } // nothing drawn: not "shown" (audit 47)
  if (want.story && want.story.n !== (story && story.n)) {
    const told = map.play(want.story.story); // an id, or a story given as it is (story_from_flow's), played and not saved
    if (!told) throw new Error(typeof want.story.story === 'string' ? `the page has no story ${want.story.story}` : `the story ${want.story.story.id} has no step the page can show`);
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
  const es = new EventSource(`/events?page=${encodeURIComponent(page)}&map=${MAP}&token=${TOKEN}`);
  es.onmessage = e => { const c = JSON.parse(e.data); queue = queue.then(() => apply(c)); };
  // refused: another map's server took the port, or this map's server ran again, with a new TOKEN: then the page reloads
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) fetch('/', { cache: 'no-store' }).then(r => r.text()).catch(() => '').then(t => t.includes(MAP)
    ? location.reload() : banner("This page's server now serves another map: this page no longer follows the assistant.")); };
  post({});
}
listen();
</script>
"""

# The page while no version of the model has rendered: why, and it draws the map once one does.
WAITING = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="umlimator-map" content="__MAP__"><title>The map does not render yet</title>
<body style="font: 15px/1.5 system-ui, sans-serif; margin: 3em auto; max-width: 46em; padding: 0 1em">
<h1 style="font-size: 1.3em">The model does not render yet</h1><pre style="white-space: pre-wrap">__WHY__</pre>
<p>This page draws the map once a version of the model renders.</p>
<script>
const MAP = '__MAP__', es = new EventSource('/events?map=__MAP__&token=__TOKEN__');
es.onmessage = e => { if (JSON.parse(e.data).model) location.reload(); };
// refused: this map's server ran again, with a new TOKEN, so the page reloads and takes it; or another map's server has the
// port (audit 25: the page stopped listening for good, as the map page did before round 24)
es.onerror = () => { if (es.readyState === EventSource.CLOSED) fetch('/', { cache: 'no-store' }).then(r => r.text()).catch(() => '').then(t => { if (t.includes(MAP)) location.reload();
  else document.querySelector('p').textContent = "This page's server now serves another map: this page no longer follows the assistant."; }); };
</script>
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
                m = cli.load_json(data, MODEL.name)  # as the CLI reads a model: a number out of range refused (audit 30)
                with tempfile.TemporaryDirectory() as tmp:
                    out = Path(tmp) / "page.html"
                    cli.render_model(m, MODEL, out, base_of())  # drawn as the model's own file is: its copy sits next to it
                    head, _, tail = out.read_text(encoding="utf-8").rpartition("</body>")
            except (Exception, SystemExit) as e:  # the CLI ends on a model the engine rejects: here it is the page's
                said = f"it is not JSON ({e})" if isinstance(e, ValueError) else "it nests too deep to read" if isinstance(e, RecursionError) else str(e.code) if isinstance(e, SystemExit) else repr(e)
                with lock:
                    why = said.strip()[-1500:] or "it does not render"
            else:
                with lock:
                    drawn[:] = [v, head + SCRIPT.replace("__MODEL__", v).replace("__MAP__", MAPID).replace("__TOKEN__", TOKEN) + "</body>" + tail, m]
                    why = None
                    refit(m)
        return drawn[0], why


class Page(http.server.BaseHTTPRequestHandler):
    def ours(self):
        """A request of this server's own page: its Host (a site that points its own name at 127.0.0.1, DNS rebinding, reads
        nothing) and, when one is sent, its Origin (another site's page posts nothing). A browser that says where a request
        comes from (Sec-Fetch-Site) must say this page, or the person (an address typed, a bookmark): another site's image,
        script or frame naming /events sends no Origin, and was counted as an open page (audit 22). Only a link another
        site's page follows, to the page itself, is let through: the page it opens is this server's own. A browser that
        sends no Fetch Metadata and no Origin passes here: /events and /state need this run's TOKEN too (audit 24)."""
        site = self.headers.get("Sec-Fetch-Site")
        opened = self.command == "GET" and urllib.parse.urlsplit(self.path).path == "/" and self.headers.get("Sec-Fetch-Dest") == "document" \
            and self.headers.get("Sec-Fetch-Mode") == "navigate"
        return self.headers.get("Host") in HOSTS and self.headers.get("Origin", URL) in ORIGINS and (site in (None, "same-origin", "none") or opened)

    def token(self, given):
        """Whether a request names this run's TOKEN, which only the page it serves holds."""
        return isinstance(given, str) and hmac.compare_digest(given.encode(), TOKEN.encode())

    def do_GET(self):
        if not self.ours():
            return self.send_error(403)
        at = urllib.parse.urlsplit(self.path)
        if at.path == "/events":
            asked = urllib.parse.parse_qs(at.query)
            if not self.token((asked.get("token") or [""])[0]):
                return self.send_error(403)
            if (asked.get("map") or [MAPID])[0] != MAPID:  # a page of another model's server, which had this port: it stops listening
                return self.send_error(409, explain="this server serves another map")
            return self.events((asked.get("page") or [""])[0][:64])
        if at.path != "/":
            return self.send_error(404)
        try:
            shown, broken = page()
        except Fail as e:
            return self.send_error(500, explain=str(e))
        body = (drawn[1] if shown else WAITING.replace("__TOKEN__", TOKEN).replace("__MAP__", MAPID).replace("__WHY__", html.escape(broken or ""))).encode("utf-8")
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
        if not self.token(self.headers.get("X-Umlimator-Token")):
            return self.send_error(403)
        if self.headers.get_content_type() != "application/json":  # a form on another site can't send one
            return self.send_error(415)
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= 1 << 20:
            return self.send_error(413)
        try:
            msg = json.loads(self.rfile.read(size))
        except (ValueError, RecursionError):  # too deep for Python's parser is no message either (audit 20)
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


def whole(v):
    """A JSON number with no fraction (2 or 2.0: JSON Schema counts both as an integer, audit 37) as an int, else None."""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    return int(v) if isinstance(v, float) and v.is_integer() else None


def fits(v, s):
    """Whether an argument is of the type its inputSchema gives (the subset these tools use)."""
    if "anyOf" in s:
        return any(fits(v, x) for x in s["anyOf"])
    t = s.get("type")
    if t == "integer":
        return (n := whole(v)) is not None and n >= s.get("minimum", n)
    if t == "number":  # a finite number, not a boolean
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf") and v >= s.get("minimum", v)
    if not isinstance(v, JSON_TYPES.get(t, object)):
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
        t, a = TOOL.get(p.get("name")) if isinstance(p.get("name"), str) else None, p.get("arguments") or {}  # a list is no name (audit 18)
        if not t or not isinstance(a, dict):
            raise RpcError(-32602, f"Unknown tool: {p.get('name')}" if not t else "Invalid params: arguments is an object")
        try:
            if missing := [k for k in t["inputSchema"]["required"] if k not in a]:
                raise Fail(f"{t['name']} needs {', '.join(missing)}")
            props = t["inputSchema"]["properties"]  # a value of another type would fail inside the tool, as an internal error
            if extra := [k for k in a if k not in props]:  # additionalProperties: false; a guessed name was dropped without a word (audit 8)
                raise Fail(f"{t['name']}: no argument {', '.join(map(str, extra))}; its arguments: {', '.join(props) or 'none'}")
            if wrong := [f"{k} is not {json.dumps({x: y for x, y in props[k].items() if x != 'description'})}" for k in a if k in props and not fits(a[k], props[k])]:
                raise Fail(f"{t['name']}: {'; '.join(wrong)}")
            a = {k: whole(v) if props[k].get("type") == "integer" else v for k, v in a.items()}  # 2.0 reaches the tool as 2
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
    except (ValueError, RecursionError):  # a line nested too deep for Python's parser ended the server (audit 20)
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
             f"at each call; the page tools drive the map's interactive page at {URL}, which the user opens in a browser. The edit "
             f"tools change the file as the page's own gestures do, after a preview if you like, and undo() takes a change back.")
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"umlimator mcp: {MODEL.name}, its page at {URL}", file=sys.stderr)
    out, sys.stdout = sys.stdout.buffer, sys.stderr  # stdout carries the protocol only: a stray print goes to the log
    for line in sys.stdin.buffer:
        if line.strip() and (said := answer(line)) is not None:
            out.write(json.dumps(said).encode() + b"\n")
            out.flush()
