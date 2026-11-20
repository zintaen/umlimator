#!/usr/bin/env python3
"""umlimator: layered, animated architecture maps, built on super-board's /visual renderer (MIT).

  umlimator.py render MODEL.json --out PAGE.html [--no-check]   # interactive drill-down page (one self-contained file)
  umlimator.py stills PAGE.html --out DIR [--views a,b] [--scale 2] [--theme light|dark] [--reader]   # each view as DIR/<view>.svg and .png;
                                                       # --reader: no CHECK tab and no drill-down pill (pictures for documents)
  umlimator.py check PAGE.html [--views a,pic-*] [--expand] [--ignore right-to-left] [--timeout 600]   # the layout check, on chosen views only;
                                                       # it exits 1 on a rule the model breaks (rules)
  umlimator.py diff BEFORE.json AFTER.json --out PAGE.html [--stills DIR]   # what changed, marked on one map, and in words
  umlimator.py diff --base REF --out DIR [--models 'docs/*.json']   # every model changed since a git ref (a pull request)
  umlimator.py drift MODEL.json OBSERVED.json --out PAGE.html [--match MATCH.json] [--stills DIR]   # drawn vs. traffic seen
  umlimator.py trace MODEL.json TRACE.json --view ID --out OUT.json [--match MATCH.json] [--title T] [--diagram uml.sequence]   # a trace (OTLP JSON) kept as a numbered view, or as a UML sequence diagram
  umlimator.py timelapse MODEL.json --out PAGE.html [--limit 30]   # the model's versions in git history, on a slider
  umlimator.py record PAGE.html --story ID --out STORY.png [--size 1160x740] [--scale 1] [--theme light|dark]   # a story as an animated PNG
  umlimator.py import FILE --out MODEL.json [--format structurizr|plantuml|mermaid|compose|kubernetes|structurizr-json|dbml|bpmn] [--typed] [--moddle DIR]   # a diagram you have, as a model
  umlimator.py export MODEL.json --out FILE.bpmn [--view ID] [--format bpmn] [--moddle DIR]   # a model's BPMN, as BPMN XML
  umlimator.py pdf PAGE.html --out MAP.pdf [--views a,b] [--theme light|dark] [--paper a4|letter]   # one PDF: a cover with the contents,
                                                       # each view with its legend and tables of its cards, lines and boxes, the rules
  umlimator.py mcp MODEL.json [--port 7391]   # an MCP server over stdio: an AI assistant reads the model and drives its page

MODEL.json is the map model in engine/references/schema.md (nodes, edges, views), plus umlimator's `badge` field on a
node (PROPOSED, TARGET, OFF ...). `stills` needs Google Chrome or Chromium; the PNGs are what a document that cannot
run the page (a wiki such as Confluence) shows. `diff`, `drift`, `trace` and `mcp` run the module's own functions in Node,
and so does `import` of a Mermaid classDiagram, sequenceDiagram, stateDiagram, erDiagram, requirementDiagram or mindmap (their
readers are the module's, in src/readers/).
BPMN XML is read and written by the module's adapter in Node through bpmn-moddle, which umlimator never installs: `npm
install bpmn-moddle@10.3.1` in the working folder, or name its folder with --moddle or UMLIMATOR_BPMN_MODDLE.
"""
import argparse, atexit, base64, contextlib, hashlib, html, io, json, math, os, re, shutil, signal, struct, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile, zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE / "engine" / "scripts" / "visual.py"
LIB = HERE / "lib" / "umlimator-all.js"        # the module with every diagram family, in one file with no imports (built: tools/build.mjs)
THEME = HERE / "lib" / "umlimator-theme.css"   # its default palette and fonts (--um-* variables)
PAGE = HERE / "engine" / "assets" / "template.html"  # the page around it; visual.py fills in the model


# C0 and C1 controls, but tab and newline; and the bidi marks, embeddings, overrides and isolates (U+061C, U+200E, U+200F,
# U+202A to U+202E, U+2066 to U+2069), which reorder what the terminal shows of the rest of the line (audit 27)
CONTROLS = re.compile("[\x00-\x08\x0b-\x1f\x7f-\x9f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]")


class Terminal:
    """stderr with each control character written as \\xNN, and each bidi control as \\uNNNN: every line the CLI says
    there (an importer's or a reader's report, which quote the source; a file name; a child's own error) may hold a
    hostile file's text, and its escape sequences would clear the reader's screen, retitle the window, draw a disguised
    link or set the clipboard (audit 26), and its bidi overrides would show the rest of the line reversed (audit 27)."""
    def __init__(self, to):
        self.to = to

    def write(self, s):
        self.to.write(CONTROLS.sub(lambda c: f"\\x{ord(c[0]):02x}" if ord(c[0]) < 0x100 else f"\\u{ord(c[0]):04x}", s))
        return len(s)

    def flush(self):
        self.to.flush()

    def __getattr__(self, name):  # fileno, isatty, encoding: the stream's own
        return getattr(self.to, name)


def visual_cmd(tmp, *args):
    """The command that runs visual.py (unmodified, super-board's) on the page with lib/umlimator-all.js inlined: one
    self-contained HTML file, as before. visual.py writes pages from its TEMPLATE path, so it runs with TEMPLATE
    pointed at that page, written into the directory `tmp`."""
    page = Path(tmp) / "template.html"
    html = PAGE.read_text(encoding="utf-8").replace("/*__UMLIMATOR_THEME__*/", THEME.read_text(encoding="utf-8"), 1)
    page.write_text(html.replace("/*__UMLIMATOR_LIB__*/", LIB.read_text(encoding="utf-8"), 1), encoding="utf-8")
    run = ("import importlib.util, pathlib, sys\n"
           "def load(name, path): s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m\n"
           "v, u = load('visual', sys.argv[1]), load('umlimator', sys.argv[2]); v.TEMPLATE = pathlib.Path(sys.argv[3])\n"
           "check = v.validate_map; v.validate_map = lambda d: u.not_objects(d) or check(u.upstream_view(d))\n"
           "v.write_page = lambda out, data: u.write_page(v, out, data)\n"
           "e = v.embed_avatars; v.embed_avatars = lambda d: u.avatars(e, d)\n"
           "sys.argv = [sys.argv[1]] + sys.argv[4:]; v.main()")
    # -I: no folder of the caller's on sys.path, so a base64.py where it runs (a mapped repository, a pull request) never loads
    return [sys.executable, "-I", "-c", run, str(VISUAL), str(Path(__file__).resolve()), str(page), *args]


# a GitHub login: letters, digits and single hyphens inside, at most 39 (audit 40)
LOGIN = re.compile(r"[A-Za-z0-9](?:-?[A-Za-z0-9]){0,38}")


def avatars(embed, d):
    """upstream's embed_avatars (`embed`), which makes its cache folder in the home folder on every render: only for a model
    with an author whose picture is not inlined yet, and a cache it cannot make (a read-only home on a CI runner or in a
    container) leaves the authors' initials, said in one line; it ended the render in a traceback (audit 26). An author whose
    key is no GitHub login is given no picture, as if none were found (audit 40): a name too long for a file ended the call
    for every author after it, and a '?', '/' or '#' fetched another address on github.com."""
    who = d.get("authors")
    if not isinstance(who, dict):
        return 0
    real = {k: x for k, x in who.items() if isinstance(k, str) and LOGIN.fullmatch(k)}
    if all(not isinstance(x, dict) or str(x.get("avatar", "")).startswith("data:") for x in real.values()):
        return 0
    d["authors"] = real  # the same author objects, which embed fills in; then the whole table again, in its order
    try:
        return embed(d)
    except OSError as e:
        print(f"cannot keep the authors' pictures in {Path.home() / '.cache' / 'visual' / 'avatars'} ({e.strerror or e}): the page draws their initials",
              file=sys.stderr)
        return 0
    finally:
        d["authors"] = who


def script_json(x):
    """`x` as JSON to sit in a <script> block: every '<' escaped (the same value), so text such as '<!--' then '<script'
    in a label never opens a state where the block's own </script> no longer closes it (audit 8)."""
    return json.dumps(x, ensure_ascii=False).replace("<", "\\u003c")


def write_page(v, out, data):
    """upstream's write_page (visual.py `v`), with the model and the title filled in one pass: upstream fills the title after
    the model is in, so model text holding __VISUAL_TITLE__ took the title, and a backslash in it left the data block no
    JSON (audit 20). Then data_lt."""
    t = v.TEMPLATE.read_text(encoding="utf8")
    if v.PLACEHOLDER not in t:
        sys.exit("template placeholder missing")
    fill = {v.PLACEHOLDER: json.dumps(data, ensure_ascii=False).replace("</", "<\\/"), "__VISUAL_TITLE__": v.escape(data.get("title", "Visual"))}
    Path(out).write_text(re.sub("|".join(map(re.escape, fill)), lambda x: fill[x.group(0)], t), encoding="utf8")
    data_lt(out)


def data_lt(out):
    """The page visual.py (upstream, escaping only '</') wrote, with its data block's every '<' escaped (see script_json)."""
    t = Path(out).read_text(encoding="utf-8")
    if m := DATA.search(t):
        Path(out).write_text(t[:m.start(1)] + m.group(1).replace("<", "\\u003c") + t[m.end(1):], encoding="utf-8")


def not_objects(d):
    """Each entry upstream's validate_map reads as an object and is not one, as its problems (it would end in a traceback)."""
    lst = lambda x: x if isinstance(x, list) else []
    name = lambda x: x is None or isinstance(x, str)  # a number id passed, then ended stills and MCP tools in a TypeError (audit 9)
    ids = lambda at, xs, ks: [f"{at}[{j}].{k} is not a string" for j, x in enumerate(lst(xs)) if isinstance(x, dict) for k in ks if not name(x.get(k))]
    out = [f"{k} is not a list" for k in ("nodes", "edges", "views") if k in d and not isinstance(d[k], list)]
    out += [f"{k}[{i}] is not an object" for k in ("nodes", "edges", "views") for i, x in enumerate(lst(d.get(k))) if not isinstance(x, dict)]
    # list_views and play_story read them (audit 16); a null is no list, as validate() and the page read it (audit 17)
    out += ["stories is not a list"] if d.get("stories") is not None and not isinstance(d["stories"], list) else []
    out += [f"stories[{i}] is not an object" if not isinstance(x, dict) else f"stories[{i}].steps is not a list"
            for i, x in enumerate(lst(d.get("stories"))) if not isinstance(x, dict) or x.get("steps") is not None and not isinstance(x["steps"], list)]
    # a story's id is a name the page and MCP's play_story and refit key on: a list there ended MCP in an internal error (audit 20)
    out += ids("stories", d.get("stories"), ("id",))
    # a story's, lens's, rule's or lane's title is drawn as text (the menus, a rule's mark): an object or a list there was drawn
    # "[object Object]", and render said nothing (audit 34); a number is drawn as written
    shown = lambda x: x is None or isinstance(x, str) or isinstance(x, (int, float)) and not isinstance(x, bool)
    out += [f"{k}[{j}].title is not text" for k in ("stories", "lenses", "rules") for j, x in enumerate(lst(d.get(k))) if isinstance(x, dict) and not shown(x.get("title"))]
    out += [f"views[{i}].lanes[{j}].{k} is not text" for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict) for j, x in enumerate(lst(v.get("lanes")))
            if isinstance(x, dict) for k in ("title", "label") if not shown(x.get(k))]
    out += ["meta is not an object"] if "meta" in d and not isinstance(d["meta"], dict) else []
    # upstream escapes the page's title and reads authors as an object: a number or a list there ended in a traceback (audit 18)
    out += ["title is not a string"] if not name(d.get("title")) else []
    out += ["authors is not an object"] if d.get("authors") is not None and not isinstance(d["authors"], dict) else []
    seen = set()
    for i, v in ((i, v) for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict)):
        out += [f"views[{i}].id is not a string"] if "id" in v and not isinstance(v["id"], str) else []  # the page's keys are strings (audit 6)
        # none, empty or repeated: validate() refuses them, and stills, check and pdf read the page by view id (audit 10)
        out += [f"views[{i}].id: a view needs an id"] if v.get("id", "") == "" else []
        out += [f'views[{i}].id "{v["id"]}" is used twice'] if isinstance(v.get("id"), str) and v["id"] in seen else []
        seen.add(v.get("id") if isinstance(v.get("id"), str) else None)
        out += [f"views[{i}].{k} is not a list" for k in ("nodes", "nodeIds", "edges", "containers", "stepIds", "browserOrder", "intake", "tour")
                if k in v and not isinstance(v[k], list)]
        out += [f"views[{i}].{k}[{j}] is not an object" for k in ("nodes", "containers", "intake") for j, n in enumerate(lst(v.get(k))) if not isinstance(n, dict)]
        out += [f"views[{i}].containers[{j}].nodeIds is not a list" for j, c in enumerate(lst(v.get("containers")))
                if isinstance(c, dict) and "nodeIds" in c and not isinstance(c["nodeIds"], list)]
        o = v.get("nodeOverrides")
        out += [f"views[{i}].nodeOverrides is not an object"] if "nodeOverrides" in v and not isinstance(o, dict) else []
        out += [f"views[{i}].nodeOverrides.{k} is not an object" for k, x in (o.items() if isinstance(o, dict) else []) if not isinstance(x, dict)]
        out += [f"views[{i}].{k} is not a string" for k in ("parent", "title") if not name(v.get(k))]
        # a list's entry is never absent, so a null is no name either (it ended MCP tools in an internal error, audit 15)
        # tour and browserOrder too, and a box's cards: upstream hashes each (an unhashable one ended in a traceback, audit 17)
        out += [f"views[{i}].{k}[{j}] is not a string" for k in ("nodeIds", "stepIds", "tour", "browserOrder") for j, x in enumerate(lst(v.get(k))) if not isinstance(x, str)]
        out += [f"views[{i}].containers[{j}].nodeIds[{k}] is not a string" for j, c in enumerate(lst(v.get("containers"))) if isinstance(c, dict)
                for k, x in enumerate(lst(c.get("nodeIds"))) if not isinstance(x, str)]
        out += ids(f"views[{i}].containers", v.get("containers"), ("parent",)) + ids(f"views[{i}].intake", v.get("intake"), ("to", "logo"))
        out += ids(f"views[{i}].nodes", v.get("nodes"), ("id", "opensView", "view")) + ids(f"views[{i}].containers", v.get("containers"), ("id",))
        out += ids(f"views[{i}].edges", v.get("edges"), ("id", "from", "to"))
        out += [f"views[{i}].nodeOverrides.{k}.{f} is not a string" for k, x in (o.items() if isinstance(o, dict) else []) if isinstance(x, dict)
                for f in ("opensView", "view") if not name(x.get(f))]
    # an id, a line's end, a view a card opens: a list or an object there is no name, and ended in a TypeError (audit 7)
    out += ids("nodes", d.get("nodes"), ("id", "opensView", "view")) + ids("edges", d.get("edges"), ("id", "from", "to"))
    out += ["root is not a string"] if not name(d.get("root")) else []
    # a label is text or a number: an object there ({"toString": 1} is valid JSON) ended the page's drawing in a TypeError (audit 19)
    text = lambda x: x is None or isinstance(x, (str, int, float))
    out += [f"{at}[{j}].label is not text" for at, xs in [("edges", d.get("edges")), *((f"views[{i}].edges", v.get("edges"))
            for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict))] for j, x in enumerate(lst(xs)) if isinstance(x, dict) and not text(x.get("label"))]
    # a view's override of a card's label is the card's label there, and a box's label is drawn as one: an object in either was
    # drawn "[object Object]", while the same label on a card was refused (audit 38)
    out += [f"views[{i}].nodeOverrides.{k}.label is not text" for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict) and isinstance(v.get("nodeOverrides"), dict)
            for k, x in v["nodeOverrides"].items() if isinstance(x, dict) and not text(x.get("label"))]
    out += [f"views[{i}].containers[{j}].label is not text" for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict)
            for j, c in enumerate(lst(v.get("containers"))) if isinstance(c, dict) and not text(c.get("label"))]
    # a view's caption, description and note are drawn as text too (the About box, the PDF's contents and page header, a
    # walkthrough's note line): an object there was drawn "[object Object]" and render said nothing (audit 39)
    out += [f"views[{i}].{k} is not text" for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict)
            for k in ("caption", "description", "note") if not text(v.get(k))]
    # a card's members, and theirs, at any depth (a stack, not recursion: a deep model never ends in a RecursionError);
    # a view's own cards too, which MCP's refs walks (audit 9)
    todo = [(f"nodes[{i}]", n) for i, n in enumerate(lst(d.get("nodes"))) if isinstance(n, dict)]
    todo += [(f"views[{i}].nodes[{j}]", n) for i, v in enumerate(lst(d.get("views"))) if isinstance(v, dict)
             for j, n in enumerate(lst(v.get("nodes"))) if isinstance(n, dict)]
    while todo:
        at, n = todo.pop()
        out += [f"{at}.label is not text"] if not text(n.get("label")) else []
        if "members" in n and not isinstance(n["members"], list):
            out.append(f"{at}.members is not a list")
        # a member's id is a Ref's name and a key: a list there ended stills and MCP's highlight and tour in a TypeError (audit 18)
        out += [f"{at}.members[{j}].id is not a string" for j, x in enumerate(lst(n.get("members"))) if isinstance(x, dict) and not name(x.get("id"))]
        todo += [(f"{at}.members[{j}]", x) for j, x in enumerate(lst(n.get("members"))) if isinstance(x, dict)]
    # an object with a toString key anywhere ({"toString": 1}, valid JSON) is no text: the page's String() throws on it, as
    # unreadable() in src/core/model.js reads it; a map by id or name may have a key named toString (audit 19), and so may
    # one a level further down: tags.<stereotype> and present.<part>.ports (audit 20). role: as unreadable()'s
    todo, said = [("", d, None)], {x.split(" ")[0] for x in out}  # a label said once
    while todo:
        at, o, role = todo.pop()
        for k, x in (enumerate(o) if isinstance(o, list) else o.items()):
            q = f"{at}[{k}]" if isinstance(o, list) else f"{at}.{k}" if at else str(k)
            named = isinstance(o, dict) and (k in BY_ID or role == "tags" or (role == "part" and k == "ports"))
            if isinstance(x, dict) and "toString" in x and not named:
                out += [] if q in said else [f"{q} is an object with a toString key, which is no text"]
            elif isinstance(x, (dict, list)):
                todo.append((q, x, None if isinstance(o, list) else "part" if role == "present" else None if role else k if k in ("tags", "present") else None))
    return out


BY_ID = {"layout", "nodeOverrides", "present", "authors", "icons", "tags"}  # maps by id or name, as src/core/model.js's BY_ID


def upstream_view(d):
    """The model as upstream's validate_map is shown it. umlimator allows two things that visual.py rejects: a card that
    opens a view the host loads later (#47), and a line that ends on a container (#28); in schema version 2, also a line
    that ends on a member and a sequence view's interaction use, which has no ends (F3). The copy it checks leaves out
    such an opensView and such a use, and lists each container's and member's id as a card's, so a line's other end is
    still checked (and named)."""
    d = json.loads(json.dumps(d))
    views = d.get("views") or []
    vids = {v.get("id") for v in views}
    for n in [*d.get("nodes", []), *(x for v in views for x in [*(v.get("nodes") or []), *(v.get("nodeOverrides") or {}).values()])]:
        if isinstance(n, dict) and n.get("opensView") not in vids:
            n.pop("opensView", None)
    # ponytail: any view's box counts in every view, so a view's own line to another view's box passes; the map drops it
    ids = {n.get("id") for n in [*d.get("nodes", []), *(n for v in views for n in v.get("nodes") or [])] if isinstance(n, dict)}
    boxes = {c.get("id") for v in views for c in v.get("containers") or [] if isinstance(c, dict) and c.get("id")}
    # schema version 2: a member (an attribute, a port) may be a line's end; upstream knows cards only, so each member is
    # listed as a card too (risks.md F3)
    members = []  # only in version 2: a version-1 model's own `members` field means nothing to the map
    # a stack, not recursion, in document order: members nested 1,000 deep ended render in a RecursionError (audit 36)
    kids = lambda x: [m for m in x.get("members") or [] if isinstance(m, dict) and isinstance(m.get("id"), str)]
    todo = [m for n in reversed(d.get("nodes", [])) if isinstance(n, dict) for m in reversed(kids(n))] if d.get("schemaVersion") == 2 else []
    while todo:
        m = todo.pop()
        members.append(m["id"])
        todo += reversed(kids(m))
    # and a sequence view's interaction uses (between its messages in `edges`, with no ends) are not lines: upstream would
    # call each "an unknown end" (F3), so the copy leaves them out; any other line with no ends is still reported
    for v in views if d.get("schemaVersion") == 2 else []:
        if v.get("diagram") == "uml.sequence" and isinstance(v.get("edges"), list):
            v["edges"] = [e for e in v["edges"] if not (isinstance(e, dict) and e.get("type") == "uml.InteractionUse")]
    # a member that shares a node's id stays listed, so upstream says the id is used twice, as validate() does
    d["nodes"] = [*d.get("nodes", []), *({"id": b} for b in sorted(boxes - ids)), *({"id": m} for m in members if m not in boxes)]
    return d


def run(cmd, timeout=None, input=None):
    """A child process (Chrome, the engine, Node) in a session of its own, so that it and whatever it starts (Chrome's
    helpers, the engine's Chrome) end together: on a timeout, Ctrl-C or SIGTERM the whole group is killed."""
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE if input is not None else None, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, err = p.communicate(input, timeout=timeout)
    except BaseException:
        with contextlib.suppress(ProcessLookupError):
            os.killpg(p.pid, signal.SIGKILL)
        p.communicate()
        raise
    return subprocess.CompletedProcess(cmd, p.returncode, out, err)


@contextlib.contextmanager
def replacing(path):
    """A path beside `path` to write to, renamed over it when the block ends without an error and removed otherwise: the
    previous file stays until the new one is whole, and a reader never sees half of one."""
    path = Path(path)
    if path.is_dir():  # before any work is written (render: before the engine runs), not an IsADirectoryError at the end
        sys.exit(f"--out {path} is a folder: name a file")
    stem = path.stem
    if len(stem.encode()) > 180:  # a name the disk takes (255 bytes) is one the probe's, 10 bytes longer, overflows: cut as temp_json cuts (audit 32)
        stem = stem.encode()[:180].decode(errors="ignore") + "-" + hashlib.sha256(stem.encode()).hexdigest()[:8]
    suffix = path.suffix if len(path.suffix.encode()) <= 40 else ""  # a long "suffix" (a.<200 bytes>) is no extension: the probe's name stays short
    tmp = path.with_name(f".{stem}.{os.urandom(4).hex()}{suffix}")  # not mkstemp: the file takes the usual mode
    try:  # a folder that cannot be written, or a path under a file: one line before any work, never a traceback (audit 21)
        path.parent.mkdir(parents=True, exist_ok=True)  # as render's --out: a folder that is not there yet is made
        os.close(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
        os.unlink(tmp)  # only a probe: what writes the file (the engine, Chrome) makes it, so a file it never wrote is said
    except OSError as e:
        sys.exit(cannot_write(path, e))
    try:
        yield tmp
        try:
            os.replace(tmp, path)
        except OSError as e:
            sys.exit(cannot_write(path, e))
    finally:
        tmp.unlink(missing_ok=True)


def cannot_write(path, e):
    """An OSError writing `path` (or making its folder), as the one line the CLI ends with."""
    why = "a folder on its path is a file" if isinstance(e, (FileExistsError, NotADirectoryError)) else e.strerror or e
    return f"cannot write {path} ({why}): name a file in a folder you can write"


def make_folder(out):
    """`out` and the folders above it, made, or the one line the CLI ends with (stills' and diff --base's --out, audit 21)."""
    try:
        out.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        why = "a folder on its path is a file" if isinstance(e, (FileExistsError, NotADirectoryError)) else e.strerror or e
        sys.exit(f"cannot make the folder {out} ({why}): name a folder you can write")


def write(path, text):
    """text written as UTF-8 in place of path; a lone surrogate, which UTF-8 cannot hold, as U+FFFD (load_json has said
    the model's; this is the backstop for any other, never a UnicodeEncodeError, audit 30)."""
    with replacing(path) as tmp:
        tmp.write_text(re.sub("[\ud800-\udfff]", "\ufffd", text), encoding="utf-8")


class ChromeError(Exception):
    """Chrome is missing, did not finish, or failed: in its own words where it said any."""


CHROMES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
           "/Applications/Chromium.app/Contents/MacOS/Chromium", "google-chrome", "chromium", "chromium-browser"]


def chrome():
    for c in CHROMES:
        if Path(c).exists() or shutil.which(c):
            return c
    raise ChromeError("needs Google Chrome or Chromium, and none is installed")


def headless(binary, *args, timeout=90):
    """Chrome's output (--dump-dom's page); a ChromeError when it does not finish in time or exits with an error, with the
    line of its log that says why (Chrome logs errors on success too, so its exit status decides)."""
    prof = tempfile.mkdtemp()
    try:
        r = run([binary, "--headless", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}", "--no-first-run",
                 "--no-default-browser-check", *args], timeout=timeout)
    except subprocess.TimeoutExpired:
        raise ChromeError(f"Chrome did not finish in {timeout} s") from None
    finally:
        shutil.rmtree(prof, ignore_errors=True)
    if r.returncode:
        said = [s for s in r.stderr.splitlines() if s.strip()]
        why = next((s for s in reversed(said) if "FATAL" in s), said[-1] if said else "")
        raise ChromeError(f"Chrome failed (exit status {r.returncode}){': ' + why.strip() if why else ''}")
    return r.stdout


ICONS = HERE / "icons"  # Lucide line icons (ISC) and manifest.json: every icon's source, and a sha256 for each brand mark
CACHE = Path(os.environ.get("UMLIMATOR_ICON_CACHE", Path.home() / ".cache" / "umlimator" / "icons"))  # brand marks


def offline(*a, **k):
    raise OSError("UMLIMATOR_OFFLINE is set, so nothing is fetched")


if os.environ.get("UMLIMATOR_OFFLINE"):  # the MCP server's pages (#91): a logo not in the cache keeps its sigil, an avatar its initials
    urllib.request.urlopen = offline     # (visual.py's render loads this file too, so its fetches fail the same way)


def icon_bytes(e):
    """An icon's file: Lucide icons ship in icons/; a brand mark is not redistributed with umlimator, so it is read from
    the cache, fetched once from its official source (manifest `url`; `zip#member` reads one file from a package) and
    used only when its sha256 matches the manifest, so a picture never changes because a source did. The cached copy
    is checked too, each time: one cut short (a crash, a full disk) is fetched again. None if it cannot be had."""
    local = ICONS / e["file"]
    if local.is_file():
        return local.read_bytes()
    if e.get("pack"):  # Microsoft's icons come with the Azure pack, fetched after its terms, never by a render (milestone 4a, decision 7)
        if os.environ.get("UMLIMATOR_NO_PACKS"):
            print(f"icon {e['file']}: read from the {e['pack']} icon pack only, turned off by UMLIMATOR_NO_PACKS; the card keeps its kind sigil", file=sys.stderr)
            return None
        P = packs()
        row = P.rows()[e["pack"]]
        got = P.icon(e["pack"], e["id"], row)
        if not got and P.ids_of(e["pack"], row) is None:
            P.tell(e["pack"], row)  # one line per pack, shared with the pack entries' (§4.5)
        elif not got:
            print(f"icon {e['file']}: the {e['pack']} pack {row['label']} has no icon {e['id']!r}; the card keeps its kind sigil", file=sys.stderr)
        return got and got[0]
    cached = CACHE / e["file"]
    try:  # a copy that cannot be read is fetched again, never a traceback (audit 22)
        data = cached.read_bytes() if cached.is_file() else None
    except OSError:
        data = None
    if data is not None:
        if hashlib.sha256(data).hexdigest() == e.get("sha256"):
            return data
        print(f"icon {e['file']}: the copy in {CACHE} does not match its pinned sha256; fetching it again", file=sys.stderr)
    if e.get("render") == "cache":  # entra: Microsoft's package, whose terms were not read, is never downloaded by a render
        print(f"icon {e['file']}: used from {CACHE} only, never downloaded by a render; the card keeps its kind sigil", file=sys.stderr)
        return None
    try:
        url, _, member = e["url"].partition("#")
        req = urllib.request.Request(url, headers={"User-Agent": "umlimator"})
        data = urllib.request.urlopen(req, timeout=60).read()
        if member:  # the file's path in the package, or just its name (the package keeps it under folders)
            z, want = zipfile.ZipFile(io.BytesIO(data)), urllib.parse.unquote(member)
            data = z.read(next(n for n in z.namelist() if want in (n, n.rsplit("/", 1)[-1])))
    except (OSError, StopIteration, zipfile.BadZipFile) as err:
        print(f"icon {e['file']}: cannot fetch {e['url']} ({err}); the card keeps its kind sigil", file=sys.stderr)
        return None
    if hashlib.sha256(data).hexdigest() != e.get("sha256"):
        print(f"icon {e['file']}: {e['url']} no longer matches its pinned sha256; the card keeps its kind sigil "
              "(fetch it again with tools/fetch_icons.py and pin it with `umlimator.py pin-icons`)", file=sys.stderr)
        return None
    # a render reads a brand's logo from the cache only: one that cannot be kept there (a read-only home on a CI runner or
    # in a container) leaves the card its sigil, said in one line, and the render goes on (audit 22). Not replacing(): it
    # ends the command, and names --out
    tmp = cached.with_name(f".{cached.stem}.{os.urandom(4).hex()}{cached.suffix}")
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        os.replace(tmp, cached)  # two renders fetching one logo never read half of it
    except OSError as err:
        with contextlib.suppress(OSError):
            tmp.unlink(missing_ok=True)
        why = "a folder on its path is a file" if isinstance(err, (FileExistsError, NotADirectoryError)) else err.strerror or err
        print(f"icon {e['file']}: cannot keep it in the icon cache {CACHE} ({why}); the card keeps its kind sigil "
              "(UMLIMATOR_ICON_CACHE names a folder you can write)", file=sys.stderr)
        return None
    return data


def packs():
    """umlimator_packs.py, next to this file (the icon packs: `pack`, and the pack entries of a page's icons table)."""
    if str(HERE) not in sys.path:
        sys.path.insert(0, str(HERE))
    import umlimator_packs
    return umlimator_packs


def cmd_pin_icons(a):
    """After tools/fetch_icons.py added a brand mark to icons/: record its sha256 and move it into the cache, so the
    repository never carries a brand's file. The hashes are written first: a run cut short leaves pinned files in icons/,
    which the next run moves."""
    man = json.loads((ICONS / "manifest.json").read_text())
    new = {name: ICONS / e["file"] for name, e in man.items() if e["source"] != "lucide" and (ICONS / e["file"]).is_file()}
    for name, f in new.items():
        man[name]["sha256"] = hashlib.sha256(f.read_bytes()).hexdigest()
    write(ICONS / "manifest.json", json.dumps(man, indent=2) + "\n")
    for name, f in new.items():
        CACHE.mkdir(parents=True, exist_ok=True)
        shutil.move(str(f), CACHE / man[name]["file"])
        print(f"pinned {name} ({man[name]['source']}) -> {CACHE / man[name]['file']}")
    for dark in ICONS.glob("*_dark.*"):  # dark variants are for stack-diagram's group labels; umlimator has none
        dark.unlink()


# in JSON text, a backslash escape (a surrogate pair's two escapes as one) or a raw surrogate code point (bytes decoded
# with surrogatepass, as json.loads decodes them, give one)
_ESCAPE = re.compile(r"\\u[dD][89abAB][0-9a-fA-F]{2}\\u[dD][c-fC-F][0-9a-fA-F]{2}|\\u[dD][89a-fA-F][0-9a-fA-F]{2}|\\[\s\S]|[\ud800-\udfff]")


def _finite(s):
    x = float(s)
    if not math.isfinite(x):
        raise ValueError(f"the number {s[:40]} is out of range")
    return x


def _whole(s):
    x = int(s)
    if abs(x) > sys.float_info.max:  # JavaScript reads it as Infinity
        raise ValueError(f"the number {s[:40]}... is out of range")
    return x


def _no_constant(c):
    raise ValueError(f"{c} is not a JSON number")


def load_json(src, where=None):
    """JSON text (str, or bytes as json.loads takes them) as every command reads it (audit 30). A number out of range
    (1e400) and Python's NaN and Infinity raise ValueError: a page's data block, which JavaScript's JSON.parse reads,
    could not hold them. A lone surrogate (\\ud800, which no UTF-8 file holds) is read as U+FFFD, said once on stderr
    naming `where`, as import says it."""
    if isinstance(src, (bytes, bytearray)):
        src = src.decode(json.detect_encoding(src), "surrogatepass")
    lone = []
    def fix(e):
        t = e[0]
        if len(t) == 1 or (len(t) == 6 and t[1] in "uU"):
            lone.append(t)
            return "\\ufffd" if len(t) == 6 else "\ufffd"
        return t
    src = _ESCAPE.sub(fix, src)
    m = json.loads(src, parse_float=_finite, parse_int=_whole, parse_constant=_no_constant)
    if lone and where:
        print(f"{where}: a lone surrogate code point (U+D800 to U+DFFF), which no UTF-8 file holds: read as U+FFFD", file=sys.stderr)
    return m


def read_json(path, model=True):
    """A JSON file as every command reads one: a BOM too; a model is an object. Else one line, exit 1."""
    try:
        m = load_json(Path(path).read_bytes(), path)  # UTF-8 (a BOM too), UTF-16 and UTF-32, as diff --base and the MCP page read it (audit 31)
    except OSError as e:
        sys.exit(f"cannot read {path} ({e.strerror or e})")
    except ValueError as e:
        sys.exit(f"{path} is not valid JSON ({e})")
    except RecursionError:  # too deep for Python's parser, as import says it (audit 20)
        sys.exit(f"{path} nests too deep to read")
    if model and not isinstance(m, dict):
        sys.exit(f"{path} is not a model: its JSON is not an object")
    return m


def read_model(path):
    """A model as render reads it: read_json, then refused in one line naming the file when not_objects finds a problem
    (diff, drift, trace and export read it as render does, audit 11)."""
    m = read_json(path)
    if bad := not_objects(m) or ([] if "views" in m else ["no views: not a map model"]):  # a trace, say: render refuses it too (audit 14)
        sys.exit(f"{path}: " + "; ".join(bad))
    return m


def page_model(model_path, out, source=None):
    """The model as rendered: with an `icons` table of every icon its nodes name (`icon`): a Lucide line icon as its
    inner markup, drawn in the card's kind colour; a brand mark as a data URI on a white tile, never recoloured.
    Returns the path of a temporary copy next to the model, so relative paths still resolve. The copy's name is its
    own (renders of one model can run at once), and the page records the model's path (or `source`) as its source."""
    m = read_json(model_path)
    if bad := not_objects(m):  # before the engine, whose loader reads a view as an object before it checks anything
        sys.exit(f"{source or model_path}: " + "; ".join(bad))
    orig = json.loads(json.dumps(m))  # the model as written, which the page's Export > Map model (JSON) gives back (WRITTEN)
    if "title" in m and m["title"] is None:  # no title, as validate() reads it: the root view's, or the file's name (audit 18)
        del m["title"]
    vs = [v for v in m.get("views") or [] if isinstance(v, dict)]
    if "title" not in m and not next((v for v in vs if not v.get("parent")), vs[0] if vs else {}).get("title"):  # as visual.py's load_map
        m["title"] = Path(source or model_path).stem  # the model file's name, never the copy's the engine reads (.name.1a2b3c4d.icons, audit 31)
    own_media(m, Path(model_path).resolve().parent, source or model_path)  # ENGINE_ONLY keys dropped there too
    # visual.py records the checkout's root relative to the page; for a page outside the checkout that path climbs
    # through the folders above it (a home folder, a user name) into a page that gets shared
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    base = Path(root or os.getcwd()).resolve()
    if not Path(out).resolve().is_relative_to(base):
        m.setdefault("meta", {}).setdefault("root", "")
    table = {**icon_table([m]), **packs().table([m])}  # pack keys hold a `/`, logos' never
    if table:  # only this table: own_media dropped the model's own, whose entries name what a page draws through <image> (audit 19)
        m["icons"] = table
    # the path visual.py would record for the model itself (its portable_path): in the checkout, under home as ~/, else the name
    src = Path(source or model_path).resolve()
    m.setdefault("source", next((pre + src.relative_to(b).as_posix() for b, pre in ((base, ""), (Path.home().resolve(), "~/"))
                                 if src.is_relative_to(b)), src.name))
    m.setdefault("meta", {})[WRITTEN] = written(orig, m)
    return temp_json(m, model_path, ".icons.json")


# render's record of what it changed in the model, for the page's Export > Map model (JSON) to undo (page.js asWritten), in a
# key of meta's own: the model's own meta.added and meta.generated are its own (audit 31). A model that holds this key
# itself gets it back like any other value render replaced
WRITTEN = "umlimator:written"


def written(orig, m):
    """What render changes in the model `orig` on its way to the page: {"added": [path, ...], "was": [[path, value], ...]},
    each path a list of keys (an index into a list as a number), so the page can give back the model as written: each
    added key taken off, each replaced value put back (audit 30, 31). `m` is the model page_model hands the engine; the
    engine's own changes are known by their places: kind, title, source, avatarsEmbedded, meta.generated, meta.project
    and meta.root; each author's avatar it inlines; each intake logo it embeds; and each view's layout its search bakes
    over none. What own_media leaves out (an address an avatar, an example or the model's icons names, risks.md S2) is
    never written into the page to put back: the export leaves it out too, as render said. Nor are a model's
    ENGINE_ONLY keys (files, hunks, areas, fileNotes, stats): they can hold source hunks and paths (risks.md S1, audit 32)."""
    added, was, seen = [], [], set()
    d = lambda x: x if isinstance(x, dict) else {}
    lst = lambda x: x if isinstance(x, list) else []
    def note(path, keep=True):
        if (key := json.dumps(path)) in seen:
            return
        seen.add(key)
        o = orig
        for k in path[:-1]:
            o = d(o).get(k) if isinstance(k, str) else lst(o)[k] if k < len(lst(o)) else None
        if keep and isinstance(o, dict) and path[-1] in o:
            was.append([path, o[path[-1]]])
        else:
            added.append(path)
    for path in (["kind"], ["title"], ["source"], ["avatarsEmbedded"], ["meta", "generated"], ["meta", "project"], ["meta", "root"], ["meta", WRITTEN]):
        note(path)
    if not isinstance(orig.get("meta"), dict):  # no meta in the file: render's whole
        note(["meta"])
    # ENGINE_ONLY keys (files, hunks, areas, fileNotes, stats) are never written into the page to put back: they can hold a
    # diff's hunks and file paths, which round 19 kept out of a page that gets shared. The export leaves them out too
    if "icons" in m:  # render's table from the manifest and packs; the model's own, which names addresses, is left out (own_media)
        note(["icons"], keep=False)
    for login, a in d(m.get("authors")).items():
        if isinstance(a, dict) and not str(a.get("avatar", "")).startswith("data:"):  # visual.py's embed_avatars fills it
            note(["authors", login, "avatar"], keep=d(d(orig.get("authors")).get(login)).get("avatar") in (None, ""))
    for i, v in enumerate(lst(m.get("views"))):
        if isinstance(v, dict) and not v.get("layout"):  # one render's search bakes a layout over none (null, {}, absent)
            note(["views", i, "layout"])
        ov = lst(orig.get("views"))
        given = lst(d(ov[i] if i < len(ov) else None).get("intake"))
        for j, src in enumerate(lst(d(v).get("intake"))):  # own_logos embedded it: the path the file names comes back
            if j < len(given) and "logo" in d(src) and d(given[j]).get("logo") != d(src)["logo"]:
                note(["views", i, "intake", j, "logo"])
    return {"added": added, "was": was}


LOGO_MAX = 1 << 20  # bytes: an intake logo is a small mark
ENGINE_ONLY = ("files", "hunks", "areas", "fileNotes", "stats")


def fetched(url):
    """Whether a browser would fetch `url` from somewhere other than the page's own folder: it names a scheme (http:, file:)
    or a host (//host, \\\\host), read as a browser reads it (with tabs, newlines and leading controls or spaces removed)."""
    u = re.sub(r"[\t\n\r]", "", url).lstrip("".join(map(chr, range(33))))
    return bool(re.match(r"[a-z][a-z0-9+.-]*:|[\\/]{2}", u, re.I))


def own_media(m, folder, said):
    """The model with nothing a page, its stills or the diff Action's browser would fetch from an address the model names
    (risks.md S1, S2): intake logos embedded as own_logos does; an author's avatar kept only as a data: image (the engine
    inlines the author's GitHub picture in its place, or the page draws initials); an example's thumbnail or full image
    kept only as a path beside the page or a data: image; and the model's own icons table dropped (page_model builds the
    table from the pinned manifest and fetched packs). Each dropped address is said in one line (audit 19). And the model's
    ENGINE_ONLY keys (files, hunks, areas, fileNotes, stats), upstream's explore and recap keys, which a map never draws:
    they can hold source hunks and paths (risks.md S1, audit 32), and a shape the engine does not expect ended in a
    traceback (audit 19). Every page writer calls this one (render, diff, drift and MCP through page_model, and timelapse
    on each version, which kept the keys while only page_model dropped them, audit 33)."""
    for k in ENGINE_ONLY:
        m.pop(k, None)
    own_logos(m, folder, said)
    if m.pop("icons", None):
        print(f"{said}: icons is built by render from the icon manifest and fetched packs; the model's own table is left out", file=sys.stderr)
    image = lambda x: re.match(r"data:image/[\w.+-]+[;,]", x) is not None
    d = lambda x: x if isinstance(x, dict) else {}
    lst = lambda x: x if isinstance(x, list) else []
    for login, a in d(m.get("authors")).items():
        if isinstance(a, dict) and a.get("avatar") not in (None, "") and not (isinstance(a["avatar"], str) and image(a["avatar"])):
            del a["avatar"]
            print(f"{said}: authors.{login}.avatar is not a data: image; it is left out (render inlines the author's GitHub picture, else draws initials)", file=sys.stderr)
    where = [(f"nodes[{i}]", n) for i, n in enumerate(lst(m.get("nodes")))]
    where += [(f"views[{i}].nodes[{j}]", n) for i, v in enumerate(lst(m.get("views"))) for j, n in enumerate(lst(d(v).get("nodes")))]
    where += [(f"views[{i}].nodeOverrides.{k}", n) for i, v in enumerate(lst(m.get("views"))) for k, n in d(d(v).get("nodeOverrides")).items()]
    stack = list(where)
    while stack:  # members too, at any depth (a member's examples draw in its details panel like a card's)
        at, n = stack.pop()
        stack += [(f"{at}.members[{j}]", c) for j, c in enumerate(lst(d(n).get("members")))]
        for j, x in enumerate(lst(d(n).get("examples"))):
            for k in ("thumb", "full"):
                # kept only when it is known safe: a data: image, or a string the browser reads as a path beside the page;
                # anything else (an address, a list, an object, a number) is dropped (an allowlist, not a deny-list)
                if isinstance(x, dict) and k in x and not (isinstance(x[k], str) and (image(x[k]) or not fetched(x[k]))):
                    del x[k]
                    print(f"{said}: {at}.examples[{j}].{k} names an address the page would fetch; it is left out (a path beside the page, or a data: image)", file=sys.stderr)


def own_logos(m, folder, said):
    """Each view's intake `logo` embedded here, before the engine (which reads any path it is given, risks.md S1): an SVG
    file inside the model's own folder, a symbolic link's target included, as a data URI. A path that leaves the folder,
    an absolute path, a file that is not an SVG, and a data URI that is not an image are dropped, each said in one line,
    so a page never carries an unrelated local file (a key, a token in .git/config) (audit 18)."""
    folder = folder.resolve()
    lst = lambda x: x if isinstance(x, list) else []  # timelapse reads old versions, which render's not_objects never saw
    for i, v in enumerate(lst(m.get("views"))):
        for j, src in enumerate(lst(v.get("intake")) if isinstance(v, dict) else []):
            logo = src.get("logo") if isinstance(src, dict) else None
            if not isinstance(logo, str) or not logo:
                continue
            if logo.startswith("data:"):
                if re.match(r"data:image/[\w.+-]+[;,]", logo):
                    continue
                why = "a data URI that is not an image"
            else:
                try:
                    f, b = (folder / logo).resolve(), b""
                    if Path(logo).is_absolute() or not f.is_relative_to(folder):
                        why = "a path outside the model's folder"
                    elif f.suffix.lower() != ".svg" or not f.is_file():
                        why = "no SVG file in the model's folder"
                    else:
                        with f.open("rb") as h:
                            b = h.read(LOGO_MAX + 1)
                        why = "not an SVG file" if len(b) > LOGO_MAX or not re.search(rb"<svg[\s>]", b) else None
                except (OSError, ValueError) as e:  # a NUL in the path, a loop of links, no permission
                    why = f"not a file that can be read ({e.__class__.__name__})"
                if not why:
                    src["logo"] = "data:image/svg+xml;base64," + base64.b64encode(b).decode()
                    continue
            del src["logo"]
            print(f"{said}: views[{i}].intake[{j}].logo is {why}; it is left out", file=sys.stderr)


_temps = set()  # temp_json's copies still on disk: removed however the process ends, SIGTERM (exit 143) included
atexit.register(lambda: [p.unlink(missing_ok=True) for p in list(_temps)])


def temp_json(m, near, suffix):
    """`m` written to a file of its own next to `near` (hidden), so parallel renders never share one. Its name is
    registered before the file exists, so a stop at any moment leaves nothing behind; the caller removes it (untemp)."""
    d, stem = Path(near).resolve().parent, Path(near).stem
    if len(stem.encode()) > 180:  # a name the disk takes (255 bytes) is one the copy's, 25 bytes longer, overflows (audit 31), cut as still_names does
        stem = stem.encode()[:180].decode(errors="ignore") + "-" + hashlib.sha256(stem.encode()).hexdigest()[:8]
    while True:
        tmp = d / f".{stem}.{os.urandom(4).hex()}{suffix}"
        _temps.add(tmp)
        try:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            break
        except FileExistsError:
            _temps.discard(tmp)
        except OSError as e:  # a read-only folder: one line, not a traceback (audit 6). Not a copy elsewhere: an intake
            _temps.discard(tmp)  # logo and the git root are read from the model's own folder
            sys.exit(f"cannot write in {d}, the folder of {near} ({e.strerror or e}): the model is rendered from a copy beside it, so copy it to a folder you can write")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(re.sub("[\ud800-\udfff]", "\ufffd", json.dumps(m, ensure_ascii=False)))  # as write() does (audit 30)
    return str(tmp)


def untemp(path):
    """A temp_json copy, removed."""
    Path(path).unlink(missing_ok=True)
    _temps.discard(Path(path))


def cards(m):
    """A model's cards and its views' own (view.nodes), as the page's mapContext has them; a malformed entry stays as it is."""
    lst = lambda x: x if isinstance(x, list) else []
    return [*lst(m.get("nodes")), *(n for v in lst(m.get("views")) if isinstance(v, dict) for n in lst(v.get("nodes")))]


def icon_table(models):
    """Every icon the models' cards name, by name (see page_model)."""
    d = lambda x: x if isinstance(x, dict) else {}  # a malformed entry names no icon: the engine reports it (validate)
    lst = lambda x: x if isinstance(x, list) else []
    names = {n["icon"] for m in models for n in map(d, cards(m)) if isinstance(n.get("icon"), str) and n["icon"]}
    names |= {o["icon"] for m in models for v in map(d, lst(m.get("views"))) for o in map(d, d(v.get("nodeOverrides")).values())
              if isinstance(o.get("icon"), str) and o["icon"]}
    man = json.loads((ICONS / "manifest.json").read_text())
    table = {}
    for name in sorted(names):
        e = man.get(name)
        b = icon_bytes(e) if e else None
        if b is None:
            if not e:
                print(f"icon {name!r} not in {ICONS / 'manifest.json'}; the card keeps its kind sigil", file=sys.stderr)
            continue
        if e["source"] == "lucide":
            table[name] = {"g": re.sub(r"(?s)^.*?<svg[^>]*>|</svg>\s*$", "", b.decode()).strip()}
        else:
            mime = "image/svg+xml" if e["file"].endswith(".svg") else "image/" + e["file"].rsplit(".", 1)[1]
            table[name] = {"src": f"data:{mime};base64,{base64.b64encode(b).decode()}", "dark": bool(e.get("white_fill"))}
    return table


def js(fn, *args, module=LIB):
    """One of the module's functions run in Node (for diff, drift, trace, the MCP server's read tools, and import's
    Mermaid class reader, an internal source), so the CLI and the module share one implementation."""
    node = shutil.which("node") or sys.exit(f"{fn} needs Node.js 18 or later: it runs the module's own {fn}()")
    code = (f"import * as u from {json.dumps(module.as_uri())}; let s = ''; for await (const c of process.stdin) s += c;"
            f"process.stdout.write(JSON.stringify(u[{json.dumps(fn)}](...JSON.parse(s))));")
    r = run([node, "--input-type=module", "-e", code], input=json.dumps(args))
    if r.returncode:
        sys.exit(r.stderr.strip()[-2000:])
    return json.loads(r.stdout)


MODDLE = "bpmn-moddle@10.3.1"  # the version the adapter is tested with (notes/milestone-4b.md §12.1, decision 24)


def bpmn(fn, a, *args):
    """readBpmnXml or writeBpmnXml (src/readers/bpmn-xml.js) run in Node with a bpmn-moddle the user installed, found in
    --moddle, else UMLIMATOR_BPMN_MODDLE, else the working folder (notes/milestone-4b.md §12.4)."""
    node = shutil.which("node") or sys.exit(f"{a.cmd}: BPMN is read and written by the module's adapter in Node.js 18 or later: install Node")
    adapter = HERE / "src" / "readers" / "bpmn-xml.js"
    if not adapter.is_file():
        sys.exit(f"{a.cmd}: BPMN's adapter is src/readers/bpmn-xml.js, which this copy of umlimator does not have: use a full clone of the repository")
    # read against the working folder, as every path the CLI is given: Node's createRequire refuses a relative one, and its
    # error was said as bpmn-moddle not found (audit 26)
    folder = os.path.abspath(a.moddle or os.environ.get("UMLIMATOR_BPMN_MODDLE") or os.getcwd())
    code = ("import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url'; import path from 'node:path';"
            f"let f, B; try {{ f = createRequire(path.join({json.dumps(folder)}, 'x')).resolve('bpmn-moddle'); }} catch {{ process.exit(3); }}"
            "try { B = (await import(pathToFileURL(f))).BpmnModdle; } catch {} if (typeof B !== 'function') process.exit(4);"
            f"const BpmnModdle = B, u = await import({json.dumps(adapter.as_uri())});"
            "let s = ''; for await (const c of process.stdin) s += c; const a = JSON.parse(s);"
            # export with no geometry given: the type's layout of the view (lib/umlimator-all.js), a pool's or lane's its band,
            # an expanded sub-process its frame, every other node its box, a line its points (notes/milestone-4b.md §12.3, 4b.5)
            f"if ({json.dumps(fn)} === 'writeBpmnXml' && a[2] == null) {{ const g = (await import({json.dumps((HERE / 'lib' / 'umlimator-all.js').as_uri())})).layout(a[0], a[1]), at = new Map();"
            "for (const n of [...g.nodes, ...(g.families || []), ...(g.bands || [])]) if (typeof n.id === 'string' && !n.id.startsWith('\\u0000')) at.set(n.id, { id: n.id, x: n.x, y: n.y, w: n.w, h: n.h });"
            "a[2] = { nodes: [...at.values()], edges: g.edges.filter(e => e.id).map(e => ({ id: e.id, pts: e.pts })) }; }"
            f"process.stdout.write(JSON.stringify(await u[{json.dumps(fn)}](...a, BpmnModdle())));")
    r = run([node, "--input-type=module", "-e", code], input=json.dumps(args))
    if r.returncode in (3, 4):
        why = f"not found in {folder}" if r.returncode == 3 else f"the one in {folder} has no BpmnModdle export: an older or another package"
        sys.exit(f"{a.cmd}: BPMN needs bpmn-moddle: npm install {MODDLE} ({why}; --moddle DIR or UMLIMATOR_BPMN_MODDLE names another folder)")
    if r.returncode:
        sys.exit(r.stderr.strip()[-2000:])
    return json.loads(r.stdout)


def cmd_render(a):
    if not Path(a.model).is_file():
        sys.exit(f"no model at {a.model}")
    model = page_model(a.model, a.out)
    try:
        render(a, model)
    finally:
        untemp(model)


def render(a, model, show=print):
    """The page at a.out, then (without --no-check) the engine's layout check. The engine writes a file of its own beside
    a.out, which replaces a.out once it succeeded: a model it rejects leaves the previous page as it was, and only the
    reason is said (stderr, exit 1). The check's screenshots, which nothing reads, stay in a temp folder."""
    args = ["render", "--map", model, "--no-open"]
    if a.no_check:
        args.append("--no-check")
    if all(isinstance(v, dict) and v.get("layout") for v in json.loads(Path(model).read_text(encoding="utf-8")).get("views") or [{}]):
        args.append("--no-optimize")  # every view laid out already: the layout search would bake nothing (and stalls on a large page)
    with tempfile.TemporaryDirectory() as tmp, replacing(a.out) as page:
        r = run(visual_cmd(tmp, *args, "--out", str(page), *([] if a.no_check else ["--shots", tmp])))
        out = r.stdout + r.stderr
        if r.returncode not in (0, 2) or not page.is_file():
            sys.exit(out.strip()[-2000:] or f"the engine failed (exit status {r.returncode})")
    i = r.stdout.find("{")  # the engine's report; what it says on stderr (a cache it cannot keep) is passed on, never read as it
    try:
        rep = json.loads(r.stdout[i:]) if i >= 0 else {}
    except json.JSONDecodeError:
        rep = {}
    if r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)
    chk = rep.get("check", {})
    if chk.get("errors"):  # a check that timed out or never reported is not a clean check
        sys.exit(f"{a.out} is written, but its check did not complete: " + "; ".join(chk["errors"]))
    if chk.get("skipped"):  # no Chrome: the engine drew no check, so none is claimed (audit 10)
        print(f"{a.out} is written, but its layout check was skipped: {chk['skipped']}", file=sys.stderr)
    # the counts check gives the same page, each problem by kind_of: the engine's own call any message holding " cross" a
    # crossing, a broken rule among them, and have no key for rules (audit 44)
    counts = counts_of(chk.get("overlaps", []), None, views_of(a.out)) if isinstance(chk.get("counts"), dict) else chk.get("counts")
    said = {"out": str(Path(a.out).resolve()), "bytes": rep.get("bytes"), "checked": not (a.no_check or chk.get("skipped")), "counts": counts,
            "problems": chk.get("overlaps", []), "errors": chk.get("errors", []), **({"skipped": chk["skipped"]} if chk.get("skipped") else {})}
    show(json.dumps(said, indent=1))
    return said


def quiet(*a, **k):
    pass


def render_model(m, near, out):
    """A model made here (a diff, a drift) as a page, without its layout check: a copy sits next to the file `near` for
    the render, so it is drawn as that file would be."""
    tmp = temp_json(m, near, ".change.json")
    try:
        model = page_model(tmp, out, source=near)
        try:
            return render(argparse.Namespace(out=str(out), no_check=True), model, show=quiet)
        finally:
            untemp(model)
    finally:
        untemp(tmp)


def shots(page, out, views):
    """Stills of these views, for a document (no CHECK tab or drill-down pill): their PNG paths, and why a view has none.
    The pictures are extras here: no Chrome, or a view Chrome cannot draw, leaves them out and says so."""
    if not (out and views):
        return [], {}
    try:
        done, failed, _ = stills(Path(page), Path(out), views, reader=True, again=True)
    except ChromeError as e:  # no Chrome at all
        return [], {v: str(e) for v in views}
    return [s["png"] for s in done], failed


def no_pictures(failed):
    """The views a diff or drift has no picture of, by reason, in one line."""
    by = {}
    for v, why in failed.items():
        by.setdefault(why, []).append(v)
    return "; ".join(f"no picture of {', '.join(vs)}: {why}" for why, vs in by.items())


def cmd_diff(a):
    """What changed from BEFORE to AFTER, on one map: the after model with each card and line marked added, changed or
    removed (removed ones faded, where they were), the summary in words, and stills of the views that show a change.
    With --base, every model file the working tree changed since that git ref, each as a page in --out, and a summary.md
    for a pull request (the diff Action posts it)."""
    if a.base:
        return diff_since(a)
    if len(a.files) != 2:
        sys.exit("diff: give BEFORE.json and AFTER.json, or --base REF")
    before, after = map(read_model, a.files)
    if a.stills:
        stills_folder(a.stills, "--stills")  # before any work: the page and the summary are not left half done (audit 22)
    r = diff_page(before, after, a.files[1], a.out, a.stills)
    print(json.dumps({k: v for k, v in r.items() if k != "model"}, indent=1))
    if r.get("stillsFailed"):
        print(f"diff: {no_pictures(r['stillsFailed'])}", file=sys.stderr)


def diff_page(before, after, near, out, stills=None, unchanged=True):
    """The diff of two models as a page at `out` (and stills). unchanged=False: none for a diff of nothing, as diff --base
    leaves a model re-indented or with its keys reordered out (audit 32: its page was written, and its render's time spent)."""
    d = js("diff", before, after)
    if not d["summary"] and not unchanged:
        return {"summary": [], "views": d["views"], "model": d["model"]}
    m = d["model"]
    m["title"] = f"{title_of(m, near)}: what changed"
    rep = render_model(m, near, out)
    pngs, failed = shots(out, stills, d["views"])
    return {"out": rep["out"], "summary": d["summary"], "views": d["views"], "stills": pngs, **({"stillsFailed": failed} if failed else {}), "model": m}


def model_of(text, where=None):
    """A file's bytes as (its map model, or None; why it is not JSON, or None). json.loads reads UTF-8 (a BOM too),
    UTF-16 and UTF-32; bytes that are none of them are not JSON (UnicodeDecodeError is a ValueError). JSON too deep for
    Python's parser is a RecursionError: said, not a traceback that ends the summary of every other file (audit 20)."""
    if text is None:
        return None, None
    try:
        m = load_json(text, where)
    except (ValueError, RecursionError) as e:
        return None, e
    return (m if isinstance(m, dict) and isinstance(m.get("nodes"), list) and isinstance(m.get("views"), list) else None), None


def diff_since(a):
    git = lambda *x, env=None, put=None: subprocess.run(["git", *x], capture_output=True, text=True, env=env, input=put)
    # a new model not yet added to git is a working-tree change too, named from the top as diff's are (audit 10)
    new = git("ls-files", "-z", "--others", "--exclude-standard", "--full-name", "--", *(a.models or ["*.json"]))
    top = Path(git("rev-parse", "--show-toplevel").stdout.strip())  # git names files from the top, wherever diff runs
    with tempfile.TemporaryDirectory() as tmp:
        # a model moved with a plain mv, not yet added: git pairs only the paths its index holds, so each new file goes,
        # with intent to add, into a copy of the index, which the rename detection then reads; the user's own index is
        # never written (audit 25). Names are passed as literal paths, never read as patterns; should git refuse the
        # copy, the moves are found as before
        index, env = Path(git("rev-parse", "--git-path", "index").stdout.strip()), None
        if new.stdout.strip("\0") and index.is_file():
            shutil.copyfile(index, Path(tmp) / "index")
            env = {**os.environ, "GIT_INDEX_FILE": str(Path(tmp) / "index")}
            added = git("-C", str(top), "add", "-N", "--pathspec-from-file=-", "--pathspec-file-nul",
                        env=env, put="\0".join(f":(top,literal){x}" for x in new.stdout.split("\0") if x))
            env = env if added.returncode == 0 else None
        # renames found (audit 24): a model only moved or renamed is its old version against its new, not one map removed
        # and one added; an R row is its status, the old path and the new
        changed = git("diff", "--name-status", "-z", "-M", a.base, "--", *(a.models or ["*.json"]), env=env)
        if changed.returncode and env:
            env, changed = None, git("diff", "--name-status", "-z", "-M", a.base, "--", *(a.models or ["*.json"]))
        # git pairs a rename only when both paths are in the pathspec: a model moved into --models' folder from outside it
        # read as one added (audit 30). The renames of a diff of every path pair those, each kept when its new path is one
        # the pathspec takes in (a model moved out of the folder stays one removed from it)
        every = git("diff", "--name-status", "-z", "-M", a.base, env=env) if a.models and changed.returncode == 0 else None
    if changed.returncode:
        sys.exit(changed.stderr.strip())

    def name_status(out):
        """git diff --name-status -z's rows as (each path a row names, newest last; {new path: old} for each rename; the
        paths a D row names, deleted from the working tree)."""
        rows, moved, names, gone, i = out.split("\0"), {}, [], set(), 0
        while i + 1 < len(rows):
            if rows[i][:1] in ("R", "C") and i + 2 < len(rows):
                if rows[i][:1] == "R":
                    moved[rows[i + 2]] = rows[i + 1]
                names.append(rows[i + 2])
                i += 3
            else:
                names.append(rows[i + 1])
                if rows[i][:1] == "D":
                    gone.add(rows[i + 1])
                i += 2
        return names, moved, gone
    names, moved, gone = name_status(changed.stdout)  # moved: each new path, the old path its version at --base is read from
    if every is not None and every.returncode == 0:
        # the whole diff's pairing wins over the pathspec's, which pairs only among the paths it takes in: a model moved in
        # and another moved out in one change read as one moved from the other (audit 31). A pair the whole diff does not
        # make, where it pairs the old path with another new one, is dropped, and the old path not paired any more is a
        # model removed from the folder; with no pairing of either path in the whole diff, the pathspec's stands
        whole = name_status(every.stdout)[1]
        olds, paired = set(moved.values()), {old: new for new, old in whole.items()}
        for new_path in set(names):
            if new_path in whole:
                moved[new_path] = whole[new_path]
            elif new_path in moved and paired.get(moved[new_path], new_path) != new_path:
                del moved[new_path]
        names += sorted(olds - set(moved.values()))
        gone |= olds - set(moved.values())  # a model moved out of the folder: gone from it
    out = Path(a.out)
    if out.exists() and not out.is_dir():
        sys.exit(f"diff --base: --out {out} is a file: name a folder for the pages and summary.md")
    make_folder(out)
    # stems: each name written in --out, casefolded: the run's own summary.md, and each model's page, stills folder and copy
    done, md, stems = [], ["<!-- umlimator-diff -->", "### Map changes", ""], {"summary.md"}
    # a path (or, folder=True, its folder) that resolves inside the checkout with no symbolic link on the way below its top
    # a path that is itself a symbolic link never counts, even one whose target is gone (a dangling link: written through)
    inside = lambda p, folder=False: not p.is_symlink() and (q := p.parent if folder else p).exists() and (q.is_dir() or not folder) and q.resolve().is_relative_to(top.resolve()) \
        and not any(x.is_symlink() for x in [q, *q.parents] if x.is_relative_to(top) and x != top)
    def linked_model(p, old):
        """Whether a file diff --base does not read (a link, or one under a linked folder) could be a model: its version at
        --base was one, or its target is a file inside the checkout that is one now, or it is a link out of the checkout named
        .json. A target outside the checkout is never opened, not even to look at it: what is said of a link out must depend
        only on what the pull request wrote, or a pull request could learn which files on the runner hold which words (the
        security review of audit 45; a link out named .json was dropped unsaid, "No map model changed.", audit 45)."""
        if old.returncode == 0 and model_of(old.stdout)[0] is not None:
            return True
        try:
            q = p.resolve()
            if q.is_relative_to(top.resolve()):
                return q.is_file() and model_of(q.read_bytes())[0] is not None
        except (OSError, RuntimeError, ValueError):
            return False
        return p.name.lower().endswith(".json")
    untracked = set(new.stdout.split("\0")) - {""}  # a D row's path a new, untracked file holds again: read from the disk
    for name in dict.fromkeys(filter(None, names + ([] if env else new.stdout.split("\0")))):  # with the copy, diff named the new ones
        was = moved.get(name, name)
        # bytes: a file need not be UTF-8. cat-file, as git show reads a rev:path it cannot find as a pathspec, so a new
        # model named a*.json was its version at --base, empty, and no JSON (audit 25)
        old = subprocess.run(["git", "cat-file", "blob", f"{a.base}:{was}"], capture_output=True)
        # the file's name in the summary: a code span of its own, and the one it moved from
        span = lambda x: "`" + flat(x.replace("`", "'"), code=True) + "`"
        fname = span(name) + (f" (moved from {span(was)})" if was != name else "")
        # a model file that is a symbolic link, or sits in a folder that is one, or resolves outside the checkout, is not
        # read: a pull request could point it at another checkout's file, whose labels and logos would go into the comment
        # and the page (audit 20, the security review)
        # Only a file that could be a model is said (audit 44: a shared tsconfig.json linked in was a map that cannot be read):
        # one that was a model at --base, or a link whose target, inside the checkout, is one (reading it leaks nothing), or
        # whose target outside holds "nodes" and "views" (only searched for them, audit 45)
        if ((top / name).is_symlink() or (top / name).is_file()) and not inside(top / name):  # a dangling link too
            if not linked_model(top / name, old):
                continue
            why = "it is a symbolic link, or resolves outside the checkout: not read"
            done.append({"file": name, "error": why})
            md += [f"**{fname}**: cannot be read: {why}", ""]
            continue
        # its version now: the file, unless git says it was deleted (a D row), so on a disk that ignores case a model git says
        # was deleted (Map.json) is not read from the one that replaced it (map.json, audit 41). Absence is git's word, not the
        # disk's spelling: a model git still tracks as modified (M Map.json) after a plain mv to map.json, or in a folder the
        # checkout spells Docs/ where git says docs/, is read as edited (audit 42)
        texts = (old.stdout if old.returncode == 0 else None, (top / name).read_bytes() if (top / name).is_file() and not (name in gone and name not in untracked) else None)
        (before, e1), (after, e2) = model_of(texts[0], f"{name} at {a.base}"), model_of(texts[1], name)
        # a model that no longer parses (a conflict marker, a cut) is a change to say, not a file to skip; other JSON that
        # does not parse (a tsconfig.json with comments) is not a model, and neither is a file not named .json (a guide in
        # Markdown that names "nodes" and "views", under a folder pathspec: audit 36) unless its other version was a model
        js = lambda x: x.lower().endswith(".json")
        why = [f"{at} nests too deep to read" if isinstance(e, RecursionError) else f"{at} is not valid JSON ({e})"
               for at, e, t, other in ((f"its version at {a.base}", e1, texts[0], after), ("it", e2, texts[1], before))
               if e and (other or (js(name) or js(was)) and (isinstance(e, RecursionError) or b'"nodes"' in t and b'"views"' in t))]
        if not why and before and texts[1] is not None and after is None:  # a key mistyped: not a deletion (audit 10)
            why = ["it is no longer a map model (its nodes and views are not both lists)"]
        if not why:  # each version as render reads it, said under its own version (audit 11)
            why = [f"{at}: " + "; ".join(bad) for at, x in ((f"its version at {a.base}", before), ("it", after)) if x and (bad := not_objects(x))]
        if why:
            done.append({"file": name, "error": "; ".join(why)})
            md += [f"**{fname}**: cannot be read: " + flat("; ".join(why)), ""]
            continue
        if not (before or after):
            continue  # JSON, but not a map model
        if was != name and before == after:
            continue  # only moved: nothing on the map changed, so no page and no stills (audit 24)
        stem = name.replace("/", "-")[:-5] if name.endswith(".json") else name.replace("/", "-")
        # a model in a dot folder (.github/maps/x.json): a page and stills folder named .github-maps-x would be hidden,
        # and the Action's artifact leaves hidden names out (audit 25); its dot written as still_names writes one
        stem = "%2E" + stem[1:] if stem.startswith(".") else stem
        # a name holding " : < > | * ? or a control character: the Action's artifact refuses the whole upload (audit 27)
        stem = NOT_IN_NAMES.sub(lambda c: f"%{ord(c[0]):02X}", stem)
        # a deep path: a file name holds 255 bytes, so a long stem is cut and hashed as still_names cuts a view id (audit 26)
        if len(stem.encode()) > 200:
            stem = stem.encode()[:180].decode(errors="ignore") + "-" + hashlib.sha256(name.encode()).hexdigest()[:8]
        # a/b-c.json and a-b/c.json; and docs/Map.json and Docs-map.json, one file on a disk that ignores case (macOS,
        # Windows), as still_names does for view ids (audit 21). A stem's names are its page, its stills folder and its
        # copy, none of them one already written: summary.md.json's stills folder was summary.md, and the summary was
        # never written (audit 28); x.json.json's folder was x.json's copy
        mine = lambda x: {x.casefold(), f"{x}.html".casefold(), f"{x}.json".casefold()}
        if mine(stem) & stems:
            stem += "-" + hashlib.sha256(name.encode()).hexdigest()[:6]
        stems |= mine(stem)
        try:
            # a removed model is drawn from a copy in its own folder while that folder is there, so its intake logos resolve
            # and messages name it; else beside the pages (audit 19)
            # the copy is written there only when its folder resolves inside the checkout and no folder on the way is a
            # symbolic link, so a deleted model never writes outside it (audit 19)
            near = top / name if after or inside(top / name, folder=True) else out / f"{stem}.json"
            r = diff_page(before, after, near, out / f"{stem}.html", out / stem, unchanged=False)
        except (SystemExit, Exception) as e:  # the module failed on this model (js() ends the CLI), or an odd one: said for this file, and the rest go on
            why = str(e.code if isinstance(e, SystemExit) else e)
            done.append({"file": name, "error": why})
            md += [f"**{fname}**: cannot be diffed: {flat(why)}", ""]
            continue
        if not r["summary"]:
            continue
        done.append({"file": name, **({"movedFrom": was} if was != name else {}), **{k: v for k, v in r.items() if k != "model"}})
        md += [f"**{fname}**: " + flat(", ".join(r["views"])) if r["views"] else f"**{fname}**", ""]
        try:  # a sketch that fails costs this file its sketch, never the summary of the rest (audit 54)
            drawn = sketch(r["model"], after=after or {}, before=before or {})
        except Exception as e:
            drawn = [f"_No sketch: {flat(str(e))}._"]
        md += [f"- {flat(s)}" for s in r["summary"]] + [""] + drawn + [""]
        if r.get("stillsFailed"):
            said = no_pictures(r["stillsFailed"])
            md += [f"_{flat(said[:1].upper() + said[1:])}._", ""]  # view ids are model words (audit 11)
    if not done:
        md += ["No map model changed."]
    write(out / "summary.md", capped("\n".join(md)) + "\n")
    print(json.dumps(done, indent=1))


def capped(md, most=60000):
    """The summary, cut short under GitHub's 65536 characters for a comment (the Action adds its links after it): at a line,
    never inside a sketch, and saying so. Past the limit GitHub refuses the comment, and the last push's would stay."""
    if len(md) <= most:
        return md
    cut = md[:md.rfind("\n", 0, most - 200)]
    if cut.count("\n```") % 2:  # inside a sketch: before it
        cut = cut[:cut.rfind("\n```mermaid")]
    return cut + "\n\n_The rest is cut: a comment holds up to 65536 characters. Every change is in the pages and stills._"


def flat(s, code=False):
    """A model's words (labels, view ids) for one Markdown line of the summary a bot posts: one line, read as written (no
    tag, emphasis or link of GitHub's: List<Order> stays whole), and no backtick that opens a code block. In a code span
    (`code`) only the line: a code span shows an escape as it is. An @ is followed by a word joiner, so a label such as
    @Transactional or "calls @ops" mentions (notifies) no one; so is a # or GH- before a digit, so "Order #42", owner/repo#7
    or GH-12 links (and cross-references) no issue."""
    s = re.sub(r"\s*[\r\n]+\s*", " ", str(s))
    if code:
        return s
    s = re.sub(r"([\\`*_\[\]~|])", r"\\\1", html.escape(s, quote=False)).replace("@", "@\u2060")
    # GFM's extended autolinks: an address (https://, www.) and a scheme GitHub links (mailto:, xmpp:) are text (audit 21).
    # The joiner goes inside what GFM looks for: after the scheme's colon, and inside www. (a joiner after www. is read as
    # part of the domain); and with no \b, since GFM finds a scheme after _, a digit or a letter too (login_https://, audit 22)
    s = re.sub(r"(?i)(https?|ftp|mailto|xmpp):", "\\1:\u2060", s)
    s = re.sub(r"(?i)w(?=ww\.)", "\\g<0>\u2060", s)
    return re.sub(r"(#|\bGH-)(?=\d)", "\\1\u2060", s, flags=re.I)


def label_of(x, i):
    """What names an element, as the module's labelOr: its label, else its id. A number is a label, 0 too; only null and ''
    are none (audit 34: `label or id` named a card labelled 0 by its id). Written as the page writes it (String())."""
    if x is None or x == "":
        return str(i)
    if isinstance(x, bool):
        return "true" if x else "false"
    return str(int(x)) if isinstance(x, float) and x.is_integer() and abs(x) < 1e21 else str(x)


def title_of(m, path):
    """A map's title as render gives it (page_model, as visual.py's load_map): the model's, else its root view's (the first
    view with no parent, else the first view), else the file's name (audit 34: diff, drift and timelapse gave the file's)."""
    if m.get("title") is not None:
        return str(m["title"])
    vs = [v for v in m.get("views") or [] if isinstance(v, dict)]
    return str(next((v for v in vs if not v.get("parent")), vs[0] if vs else {}).get("title") or Path(path).stem)


MARKS = {"added": "#1a7f37", "changed": "#9a6700", "removed": "#cf222e"}


def sketch(m, most=60, after=None, before=None):
    """The cards a diff marks, and the cards next to them, as a mermaid flowchart: GitHub draws it in a comment or a
    job summary, so the picture needs no hosting. The map's own pictures are the stills. after: the model after the
    change, whose views tell the ones the diff removed; before: the model before it, whose lines a removed view's copies are."""
    lst = lambda x: x if isinstance(x, list) else []
    views = [v for v in m.get("views") or [] if isinstance(v, dict)]
    # a view the diff removed comes back with its cards marked removed there and copies of its model lines marked removed
    # (so the diff page draws it gone): its cards and those lines stay in the model, so they mark nothing here; what was
    # its own (its cards, its lines) went with it (audit 56: a removed view drew its shared cards and lines as removed)
    kept = None if not isinstance(after, dict) else {v.get("id") for v in lst(after.get("views")) if isinstance(v, dict)}
    gone = lambda v: kept is not None and v.get("id") not in kept
    cards = {n["id"]: n for n in [*(m.get("nodes") or []), *(n for v in views for n in v.get("nodes") or [])] if isinstance(n, dict) and "id" in n}
    owner, todo = {}, [(x, i) for i, n in cards.items() for x in lst(n.get("members"))]
    while todo:  # a member (a port, a part) at any depth stands for the card it is on, as the stills draw it (audit 34); a stack, not recursion
        x, i = todo.pop()
        if isinstance(x, dict):
            if isinstance(x.get("id"), str) and x["id"] not in cards:
                owner.setdefault(x["id"], i)
            todo += [(y, i) for y in lst(x.get("members"))]
    at = lambda r: r if isinstance(r, str) and r in cards else owner.get(r) if isinstance(r, str) else None
    # lifted: an end was a member, drawn on its card; a line from a card to itself (a self-transition, a reflexive call) is not
    lines = [({**e, "from": at(e.get("from")), "to": at(e.get("to")), "lifted": e.get("from") not in cards or e.get("to") not in cards}, w, e)
             for w, es in enumerate([m.get("edges") or [], *(v.get("edges") or [] for v in views)]) for e in es if isinstance(e, dict) and at(e.get("from")) and at(e.get("to"))]
    # a removed view's copies are the model lines as they were before the change: matched against those as well as the
    # model's, and a line with an id by its id alone (audit 57: a line re-pointed, or one with no id edited, while a view
    # that showed it was removed was sketched removed too)
    whose = lambda e: ("id", e.get("id")) if isinstance(e.get("id"), (str, int, float)) and not isinstance(e.get("id"), bool) else \
        json.dumps({k: v for k, v in e.items() if k not in ("change", "style", "edited")}, sort_keys=True, default=repr)
    model = {whose(e) for e in [*lst(m.get("edges")), *lst((before if isinstance(before, dict) else {}).get("edges"))] if isinstance(e, dict)}
    lines = [x for x in lines if not (x[1] and gone(views[x[1] - 1]) and whose(x[2]) in model)]
    # a change the sketch draws: a mark, as a string; a list or object an author wrote is no mark and is left out, as the
    # module's own pictures leave it (audit 54: `[1] in MARKS` raised TypeError and the diff Action wrote no summary)
    mark = lambda x: x["change"] if isinstance(x, dict) and isinstance(x.get("change"), str) and x["change"] in MARKS else None
    # one line is drawn once (audit 55): diff() writes a copy of a model line, marked or not, into each view that lists lines
    # (a line taken out of a view or put in, a card taken out or put in), so the model's line and a view's copy, or two views'
    # copies, are one line. A line is keyed by its id and ends, or with no id by all it says but its mark, and by how many
    # such lines its own list held before it (two alike in one list stay two); a marked copy wins over an unmarked one, and two
    # different marks are 'changed'
    one, seen = {}, {}
    for e, w, raw in lines:
        i = raw.get("id")
        say = (i, e["from"], e["to"]) if isinstance(i, (str, int, float)) and not isinstance(i, bool) else \
            json.dumps({k: v for k, v in raw.items() if k not in ("change", "style")}, sort_keys=True, default=repr)
        n = seen[w, say] = seen.get((w, say), -1) + 1
        key, was = (say, n), one.get((say, n))
        if was is None or (not mark(was) and mark(e)):
            one[key] = e
        elif mark(e) and mark(was) != mark(e):
            one[key] = {**was, "change": "changed"}
    lines = list(one.values())
    # a card a view takes out or puts in: diff() marks it in that view's nodeOverrides, not on the card (audit 55); the card's
    # own mark wins, and two different marks from two views are 'changed'
    viewmark = {}
    for v in views:
        ov = v.get("nodeOverrides") if isinstance(v.get("nodeOverrides"), dict) and not gone(v) else {}
        for i, o in ov.items():
            if i in cards and mark(o):
                viewmark[i] = mark(o) if viewmark.get(i) in (None, mark(o)) else "changed"
    cmark = lambda i: mark(cards[i]) or viewmark.get(i)
    hot = {i for i in cards if cmark(i)}
    lines = [e for e in lines if mark(e) or e["from"] in hot or e["to"] in hot]  # marked lines, and the lines of marked cards
    # a line between two members of one card, or a member and its card: the card, with no line (audit 34); a card's own loop
    # is drawn (audit 35)
    inside = {e["from"] for e in lines if e["from"] == e["to"] and e["lifted"]}
    lines = [e for e in lines if e["from"] != e["to"] or not e["lifted"]]
    near = hot | inside | {x for e in lines for x in (e["from"], e["to"])}
    if not near or len(near) > most:
        return [] if not near else [f"_{len(near)} cards changed or next to a change: too many to sketch; see the pictures._"]
    key = {i: f"n{k}" for k, i in enumerate(i for i in cards if i in near)}
    q = lambda s: re.sub(r"[\r\n]+", " ", str(s)).replace("#", "#35;").replace('"', "#quot;").replace("`", "#96;").replace("<", "#lt;").replace(">", "#gt;")
    out = ["```mermaid", "flowchart LR"]
    out += [f'  {key[i]}["{q(label_of(cards[i].get("label"), i))}"]' + (f":::{cmark(i)}" if cmark(i) else "") for i in key]
    style = []
    for k, e in enumerate(lines):
        out.append(f'  {key[e["from"]]} {"-.->" if mark(e) == "removed" else "-->"}' + (f'|"{q(label_of(e["label"], ""))}"|' if label_of(e.get("label"), "") != "" else "") + f' {key[e["to"]]}')
        if mark(e):
            style.append(f"  linkStyle {k} stroke:{MARKS[mark(e)]},stroke-width:2px")
    out += style + [f"  classDef {c} stroke:{v},stroke-width:2px" + (",stroke-dasharray:4 3" if c == "removed" else "") for c, v in MARKS.items()]
    return out + ["```"]


def cmd_drift(a):
    """The map against the traffic seen: lines that run but are not drawn come in dashed rose, drawn lines between
    services traffic reached that carried nothing fade. OBSERVED.json: [{from, to, count}], or a Jaeger or Tempo
    dependency list ([{parent, child, callCount}], or {"data": [...]}); --match: {service: card id} where names differ."""
    m, seen = read_model(a.model), read_json(a.observed, model=False)
    if a.stills:
        stills_folder(a.stills, "--stills")  # before any work (audit 22)
    r = js("drift", m, seen, {"match": read_json(a.match, model=False) if a.match else {}})
    r["model"]["title"] = f"{title_of(m, a.model)}: drawn vs. seen"
    rep = render_model(r["model"], a.model, a.out)
    pngs, failed = shots(a.out, a.stills, r["views"])
    print(json.dumps({"out": rep["out"], "counts": r["counts"], "views": r["views"], "stills": pngs, **({"stillsFailed": failed} if failed else {})}, indent=1))
    if failed:
        print(f"drift: {no_pictures(failed)}", file=sys.stderr)


def cmd_trace(a):
    """A trace kept as a numbered view (#96): MODEL.json with a sequence view made from an OpenTelemetry trace in OTLP JSON,
    its calls between cards in time order, each labelled with its span's name and its duration; written to --out (which
    may be MODEL.json itself). A view with that id that a trace made is replaced; one a person made is never. --match: {service name: card id} where names differ.
    --diagram uml.sequence: the view is a UML sequence view, and the model written is a version-2 model (which releases
    before 0.17.0 refuse); the summary printed adds `diagram` and the helper's `report`. It needs src/uml/convert.js, so
    a full clone of the repository: without it trace exits with a message."""
    if not a.view.strip():  # a view needs an id: render refuses the model it would write (audit 11)
        sys.exit("trace: --view needs a view id")
    m, trace = read_model(a.model), read_json(a.trace, model=False)
    was = next((v for v in m.get("views") or [] if isinstance(v, dict) and v.get("id") == a.view), None)
    if was and not str(was.get("caption") or "").startswith("From a trace"):  # a view a person made is theirs (audit 6)
        sys.exit(f"trace: {a.model} has a view {a.view!r} that no trace made: name another --view (trace replaces only a view it made)")
    # a card opens the view of its id: a trace view named as a card turns that card, on every view, into a way into the
    # trace (audit 21)
    lst = lambda x: x if isinstance(x, list) else []
    if any(isinstance(n, dict) and n.get("id") is not None and str(n["id"]) == a.view
           for n in [*lst(m.get("nodes")), *(n for v in lst(m.get("views")) if isinstance(v, dict) for n in lst(v.get("nodes")))]):
        sys.exit(f"trace: --view {a.view!r} is a card's id in {a.model}, and a card opens the view of its id: name another --view")
    opts = {"view": a.view, "match": read_json(a.match, model=False) if a.match else {}, **({"title": a.title} if a.title else {})}
    report = None
    if a.diagram:  # a UML sequence view (notes/stage-3.md §7): the numbered view through the internal helper, in src/uml/convert.js
        helper = HERE / "src" / "uml" / "convert.js"
        if not helper.is_file():
            sys.exit(f"trace --diagram: its helper is src/uml/convert.js, which this copy of umlimator does not have: run it from a full clone of the repository")
        r = js("sequenceFromSpans", m, js("otlpSpans", trace), opts, module=helper)
        out, report = r["model"], r["report"]
    else:
        out = js("sequenceFromTrace", m, js("otlpSpans", trace), opts)
    # the UML sequence view replaced takes its lifelines with it: those no view of the result lists (audit 24: they piled up)
    if was and was.get("diagram") == "uml.sequence":
        listed = {i for x in lst(out.get("views")) if isinstance(x, dict) for i in lst(x.get("nodeIds")) if isinstance(i, str)}
        old = {i for i in lst(was.get("nodeIds")) if isinstance(i, str)} - listed
        out["nodes"] = [n for n in lst(out.get("nodes")) if not (isinstance(n, dict) and n.get("type") == "uml.Lifeline" and n.get("id") in old)]
    v = next(x for x in out["views"] if x.get("id") == a.view)
    if not v["edges"]:
        sys.exit(f"trace: no call in {a.trace} runs between two cards of {a.model} (--match names a service's card)")
    write(a.out, json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"out": a.out, "view": a.view, "steps": len(v["edges"]), "cards": len(v["nodeIds"]), "caption": v.get("caption"),
                      **({"diagram": a.diagram, "report": report} if a.diagram else {})}, indent=1))


def cmd_timelapse(a):
    """The model's versions in git history, oldest first (the first-parent line, merges included, so the last is HEAD's), as one page with a slider: the map eases from each version to
    the next (new cards fade in, removed ones fade out, moved ones glide), with what changed in words."""
    # git run in the model's own folder, so its history is its repository's wherever the command runs (audit 28: from a
    # folder outside it, git said "not a git repository" or that the model is outside the repository)
    here = Path(a.model).absolute()
    # the model named as a literal path, never a pattern: map[v].json is no glob that takes in mapv.json's history (audit 29)
    git = lambda *x: subprocess.run(["git", "-C", str(here.parent), *x], capture_output=True, env={**os.environ, "GIT_LITERAL_PATHSPECS": "1"})
    # -z: each path as it is, never C-quoted ("s\306\241.json", audit 29: a name with a non-ASCII letter, a quote, a
    # backslash or a tab had no version). Read as fields at NUL: "", "sha\tdate\tsubject", "\n" and its first path, its
    # other paths, then "" before the next commit's; no path is empty, so the field after an empty one is a commit's
    log = git("log", "-z", "--follow", "--first-parent", "-m", "--name-only", "--format=%x00%H%x09%cs%x09%s", "--", str(here))
    if log.returncode:
        sys.exit(log.stderr.decode(errors="replace").strip())
    rows, fields = [], log.stdout.split(b"\0")
    for k in range(1, len(fields)):
        if not fields[k - 1] and fields[k]:  # a commit: its line, then its first path, if any
            rows.append([fields[k].decode(errors="replace"), fields[k + 1][1:] if k + 1 < len(fields) and fields[k + 1][:1] == b"\n" else b""])
    versions = []
    for head, raw in rows[::-1][-a.limit:]:
        sha, day, subject = (head.strip().split("\t", 2) + ["", ""])[:3]
        path = os.fsdecode(raw) if raw else None  # from the top, as --name-only names it; bytes in no encoding kept as they are
        r = git("show", f"{sha}:{path}" if path else f"{sha}:./{here.name}")  # bytes: json.loads finds the encoding
        path = raw.decode(errors="replace") if raw else a.model
        try:
            subject = subject if len(subject) <= 90 else subject[:89].rstrip() + "…"
            m = load_json(r.stdout, f"{sha[:7]}: {path}")
            if not isinstance(m, dict):
                raise ValueError
            # a version render refuses is left out, as one that is not JSON is: the slider's words and picture would read
            # it as a model (audit 30, the half of audit 20's fix not done)
            if bad := not_objects(m) or ([] if "views" in m else ["no views: not a map model"]):
                print(f"{sha[:7]}: {path} is not a model render reads ({'; '.join(bad)}); left out", file=sys.stderr)
                continue
            own_media(m, Path(a.model).resolve().parent, f"{sha[:7]}: {path}")  # as render's page: nothing fetched from an address the model names (audit 19)
            versions.append({"label": f"{day} {subject}".strip(), "model": m})
        except (ValueError, RecursionError):  # not JSON, bytes in no encoding JSON has, too deep to read (audit 20), or no model
            print(f"{sha[:7]}: {path} is not a JSON model there; left out", file=sys.stderr)
    if not versions:
        sys.exit(f"no versions of {a.model} in git history")
    data = {"title": title_of(versions[-1]["model"], a.model), "icons": {**icon_table(ms := [v["model"] for v in versions]), **packs().table(ms)}, "versions": versions}
    page = (HERE / "engine" / "assets" / "timelapse.html").read_text(encoding="utf-8")
    # each placeholder filled once, in one pass: a model's text holding a placeholder is data, never filled (audit 16)
    fill = {"__TITLE__": html.escape(data["title"]), "/*__UMLIMATOR_THEME__*/": THEME.read_text(encoding="utf-8"),
            "/*__VERSIONS__*/": script_json(data), "/*__UMLIMATOR_LIB__*/": LIB.read_text(encoding="utf-8")}
    page = re.sub("|".join(map(re.escape, fill)), lambda x: fill.pop(x[0], x[0]), page)
    write(a.out, page)
    print(json.dumps({"out": a.out, "versions": [v["label"] for v in versions]}, indent=1))


def above_0(s):
    """--scale, a finite number above 0 (not nan, not inf: audit 37)."""
    if not (math.isfinite(float(s)) and float(s) > 0):
        raise argparse.ArgumentTypeError(f"{s!r} is not a finite number above 0")
    return float(s)


def size(s):
    """--size WxH, as two whole numbers above 0."""
    try:
        w, h = (int(x) for x in s.lower().split("x"))
        if w > 0 and h > 0:
            return w, h
    except ValueError:
        pass
    raise argparse.ArgumentTypeError(f"{s!r} is not WxH, e.g. 1160x740")


def port(s):
    """--port, 0 to 65535 (0: any free one)."""
    if not (s.isdigit() and int(s) <= 65535):
        raise argparse.ArgumentTypeError(f"{s!r} is not a port, 0 to 65535")
    return int(s)


def at_least_1(s):
    if int(s) < 1:
        raise argparse.ArgumentTypeError(f"{s} is less than 1")
    return int(s)


# The kinds of the layout check's messages, each by the words the check itself writes, rules first and each message of
# one kind: a label or a rule title may hold another kind's words ("Apps never cross ..."), which must not move it. Each
# is read from the start of what follows "view <id>: ", where its own words begin (audit 31: a card labelled "Red cross"
# ended a label-on-line message in " cross", which read as a crossing)
KINDS = {"rules": r'(?:edge .+|boxes .+ form a cycle, which) breaks rule ".*"$', "crossings": r"edges .+ and .+ cross$", "rightToLeft": r"edge .+ runs right-to-left$",
         "detours": r"edge .+ takes a detour \(\d+px for \d+px\)$", "shortLine": r'label ".*" leaves its line \d+ px \(.*\)$',
         "roundEnd": r'edge .+ runs round its own end ".*"$', "nearNode": r'edge .+ passes within [\d.]+px of node ".*"$',
         "onMark": r'text ".*" touches the mark on node ".*"$', "labelOnBorder": r'label ".*" sits on the border of family ".*"$',
         "labelNoRoom": r'(?:label ".*"|step .+) has no room on edge .+: (?:not drawn|only its step .+ shows)$',
         "labelOnLine": r'(?:label|name tag) ".*" lies on edge .+$',
         # audit 45: these were other, and render's counts (visual.py's until round 44) had sharedLines, labelOnNode and lanes
         "sharedLines": r"edges .+ and .+ share a line$", "labelOnNode": r'(?:edge label ".*" covers|text ".*" overlaps) node ".*"$',
         "overflow": r'(?:(?:text|chip) ".*" overflows (?:the shape of )?node ".*"|family title ".*" overflows its box)$',
         "labelsOverlap": r'edge labels ".*" and ".*" overlap$',
         "lanes": r'(?:lanes ".*" and ".*" overlap|lane ".*": (?:header covers node ".*"|header crossed by edge .+|node ".*" '
                  r'(?:sticks out|of another lane sits in it|belongs to no lane but sits in it)))$'}


def kind_of(o, rules=None, views=None):
    """A message's kind. `rules`: the broken rules the page lists apart, which are the rules; a page rendered before
    0.28.0's next release lists none, and its rules are found by their words. `views`: the page's view ids, so the
    "view <id>: " a message starts with is taken off whole, though an id holds ": "; else up to its first ": ". A message of
    check --expand starts "view <id> with <card> unfolded: " (template.html), taken off whole too: split at its first ": ",
    an id or a card holding ": " left the kind's words behind it, and a crossing read as other (audit 32)."""
    def after(v):  # what follows the prefix of view id v, or None
        if o.startswith(f"view {v}: "):
            return o[len(f"view {v}: "):]
        if o.startswith(f"view {v} with ") and " unfolded: " in o[len(f"view {v} with "):]:
            return o[len(f"view {v} with "):].split(" unfolded: ", 1)[1]
        return None
    rest = next((r for v in sorted(views or [], key=len, reverse=True) if (r := after(v)) is not None), None)
    if rest is not None:
        rests = [rest]
    else:  # no known id: the words after its first ": ", or after an unfolded card's prefix; the first a kind reads
        u = re.match(r"view .+? with .+? unfolded: ", o, re.S)
        rests = [o.split(": ", 1)[1]] if o.startswith("view ") and ": " in o else [o]
        rests += [o[u.end():]] if u else []
    if rules is not None:
        return "rules" if o in rules else next((k for r in rests for k, t in KINDS.items() if k != "rules" and re.match(t, r, re.S)), "other")
    return next((k for r in rests for k, t in KINDS.items() if re.match(t, r, re.S)), "other")


def counts_of(ov, rules=None, views=None):
    """How many of the problems `ov` are of each kind, as kind_of reads them: render's and check's counts agree."""
    of = [kind_of(o, rules, views) for o in ov]
    return {k: of.count(k) for k in [*KINDS, "other"]}


def cmd_check(a):
    """The page's own layout check, limited to --views (a trailing * is a prefix) and with a longer wait than
    visual.py check, which gives up after 45 s on a large model. A check of no view fails: it would pass by checking
    nothing."""
    # --ignore drops whole kinds from the report (pictures that keep a source drawing's own direction run lines right to left)
    asked = [k for k in (a.ignore or "").replace("right-to-left", "rightToLeft").split(",") if k]
    if bad := [k for k in asked if k not in KINDS]:
        sys.exit(f"--ignore: unknown kind {', '.join(bad)}; known: right-to-left, {', '.join(k for k in KINDS if k != 'rightToLeft')}")
    views = pick(a.page, a.views)
    data = page_data(a.page)[0]
    packs().check(data if "nodes" in data else data.get("map", {}))  # icon ids the cached pack lacks, with the nearest
    url = Path(a.page).resolve().as_uri() + "#check=1&theme=light" + (f"&views={fragment(views)}" if a.views else "") + ("&expand=1" if a.expand else "")
    dom = headless(chrome(), "--virtual-time-budget=6000", "--window-size=1440,900", "--dump-dom", url, timeout=a.timeout)
    m = re.search(r'<pre id="visual-check"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit("check did not complete: the page did not report")
    rep = json.loads(html.unescape(m.group(1)))
    if not re.match(r"[1-9]", str(rep.get("checked") or "")):  # "0 views"
        sys.exit(f"check: no view was checked ({rep.get('checked') or 'the page did not say what it checked'})")
    ov = rep.get("overlaps", [])
    rules = set(rep["rules"]) if isinstance(rep.get("rules"), list) else None
    of = [kind_of(o, rules, views_of(a.page)) for o in ov]
    counts = counts_of(ov, rules, views_of(a.page))
    shown = [o for o, k in zip(ov, of) if k not in asked]
    print(json.dumps({"checked": rep.get("checked"), "counts": counts, "ignored": len(ov) - len(shown),
                      "problems": shown, "errors": rep.get("errors", [])}, indent=1))
    if rep.get("errors"):
        sys.exit("check reported errors")
    if broken := sum(k == "rules" for k in of if k not in asked):  # the model's own rules (#70) are a contract: CI fails on them
        sys.exit(f"{broken} broken rule{'s' if broken > 1 else ''}")


DATA = re.compile(r'<script id="visual-data" type="application/json">(.*?)</script>', re.S)


def page_data(page):
    """A page's model, and its text and the match of DATA in it; a file that is no umlimator page ends the command."""
    t = Path(page).read_text(encoding="utf-8", errors="replace")
    if not (m := DATA.search(t)):
        sys.exit(f"{page} is not a umlimator page (render the model first)")
    return json.loads(m.group(1)), t, m


def views_of(page):
    data = page_data(page)[0]
    return [v["id"] for v in (data.get("views") or data.get("map", {}).get("views") or []) if isinstance(v, dict) and isinstance(v.get("id"), str)]


def pick(page, spec):
    """--views (a,b,pic-*: a trailing * is a prefix) as the page's view ids, in the page's order; every view without it.
    A spec that is a view's id whole names that view, comma and all (audit 28: an id holding a comma could not be named);
    else it is split at its commas. A name that matches no view ends the command before Chrome starts, saying which views
    there are, each quoted, so a comma in an id reads as the id's."""
    ids = views_of(page)
    want = [spec] if spec in ids else [w for w in (spec or "").split(",") if w]
    # a name that is a view's id is that view, though it end in * (audit 31: "api*" took api-v2 as well), as the page reads it
    hit = lambda w, i: i == w or w.endswith("*") and w not in ids and i.startswith(w[:-1])
    if bad := [w for w in want if not any(hit(w, i) for i in ids)]:
        sys.exit(f"--views: no view {', '.join(map(repr, bad))} in {Path(page).name}; its views: {', '.join(map(repr, ids))}")
    return [i for i in ids if not want or any(hit(w, i) for w in want)]


def fragment(views):
    """View ids for the page's link, each encoded twice: an id may hold & + % # and a comma. URLSearchParams decodes the
    value once, the page splits it on ',' and decodes each id again, so a comma in an id is never a separator."""
    return ",".join(urllib.parse.quote(urllib.parse.quote(v, safe=""), safe="") for v in views)


def still_keys(page, opts):
    """A key per view over everything its still is drawn from: the view, its cards, every line between them or ending
    on one of its boxes, the icons and authors they use, the model's rules (a line that breaks one is drawn rose), the
    size of each card's inner view (the ⤢ pill: a typed one's from the whole model), the model's schemaVersion (version 1 draws a typed view as a map), the
    engine code and the export options. A view whose key is unchanged
    since its last export draws the same still."""
    data, t, m = page_data(page)
    engine = hashlib.sha256((t[:m.start()] + t[m.end():]).encode()).hexdigest()
    views = data.get("views") or []
    # a view's own cards join the model's, as the page's mapContext has them (audit 7): another view may list one
    V, N = {v["id"]: v for v in views}, {n["id"]: n for n in [*data.get("nodes", []), *(n for v in views for n in v.get("nodes") or [])] if isinstance(n, dict)}
    icons, authors = data.get("icons") or {}, data.get("authors") or {}
    owner = {}  # each member's (a port's) card, at any depth: walked with a list, not recursion
    for n in data.get("nodes", []):
        todo = list(n.get("members") or [])
        while todo:
            x = todo.pop()
            if isinstance(x, dict):  # a member id that is no string names nothing (a list there ended in a TypeError, audit 18)
                if isinstance(x.get("id"), str):
                    owner.setdefault(x["id"], n.get("id"))
                todo += x.get("members") or []
    own = lambda x: owner.get(x, x) if isinstance(x, str) else x
    of_node = {}
    for x in views:
        if isinstance(x.get("node"), str):
            of_node.setdefault(x["node"], x["id"])

    def inner(i, v):  # a card's inner view, as the page's childOf finds it: the view's override, then the card's view or opensView,
        n = {**(N.get(i) or {}), **((v.get("nodeOverrides") or {}).get(i) or {})}  # a view with its id, a view whose `node` it is
        o = n.get("view") or n.get("opensView")
        c = o if isinstance(o, str) and o in V else i if i in V else of_node.get(i)
        return c if c != v["id"] else None
    typed_kid = lambda c: data.get("schemaVersion") == 2 and (V.get(c) or {}).get("diagram") not in (None, "map")
    model = []

    def whole():
        if not model:
            model.append(hashlib.sha256(json.dumps([data.get("nodes"), data.get("edges"), views], sort_keys=True).encode()).hexdigest())
        return model[0]
    keys = {}
    for v in views:
        ids = set(v.get("nodeIds") or [])
        ends = ids | {c.get("id") for c in v.get("containers") or [] if isinstance(c, dict)}  # a line may end on a box (#28)
        nodes = [N.get(i) for i in sorted(ids)]
        # a typed view draws from more than its cards: a part's ports are its type's, found by label anywhere in the model,
        # and a connector may end on one (audit 4): its key is the whole model's cards and lines
        lines = data.get("edges", []) if v.get("diagram") else [e for e in data.get("edges", []) if own(e.get("from")) in ends and own(e.get("to")) in ends]
        # a card's pill counts its inner view's cards, or what a typed inner view draws (audit 40: its elementCount over its layout,
        # which any element or line of the model may change): that view and the whole model's cards, lines and views, hashed once
        kids = {i: whole() if typed_kid(inner(i, v)) else len((V.get(inner(i, v)) or {}).get("nodeIds") or []) for i in sorted(ids)}
        cards = [n for n in nodes if n] + list((v.get("nodeOverrides") or {}).values())
        used, who = ({n.get(k) for n in cards if isinstance(n.get(k), str)} for k in ("icon", "author"))  # a list names none (audit 18)
        used |= {f"{p}/{i}" for p, i in map(packs().pick, cards) if isinstance(i, str)} | {f"{p}/" for p, _ in map(packs().pick, cards)}  # a pack's icon and its legal line
        # a typed view also draws other views: their titles (a card that opens one), the lifelines, messages and fragments of the
        # sequence view an overview's inline interaction draws (audit 30), and a DFD level its parent's cards, as the page's viewKey
        typed = [views, (V.get(v.get("parent")) or {}).get("nodeIds")] if v.get("diagram") else None
        blob = json.dumps([v, data.get("nodes") if v.get("diagram") else nodes, typed, lines, kids, {k: icons[k] for k in sorted(used) if k in icons},
                           {k: authors[k] for k in sorted(who) if k in authors}, data.get("rules"), engine, opts,
                           data.get("schemaVersion")], sort_keys=True)  # version 1 draws a typed view as a map (audit 38)
        keys[v["id"]] = hashlib.sha256(blob.encode()).hexdigest()
    return keys


def sha(f):
    return hashlib.sha256(Path(f).read_bytes()).hexdigest()


# what a written file's name never holds raw, beside / and %: a control character, and what upload-artifact (the diff
# Action's artifact) refuses in any path, " : < > | * ? CR LF, which Windows refuses too (audit 27); each is written %XX
NOT_IN_NAMES = re.compile('[\x00-\x1f"*:<>?|]')


def still_names(ids):
    """Each view's file name in a stills folder: its id, with only what would leave the folder or break the name encoded
    (% / \\, a control character, " : < > | * ?, an id of . or ..), an id too long for a file name cut and hashed, and a
    hash after an id that one before it matches but for case (macOS and Windows fold case in file names, so the two would
    share files)."""
    out, seen = {}, set()
    for v in ids:
        n = NOT_IN_NAMES.sub(lambda c: f"%{ord(c[0]):02X}", v.replace("%", "%25").replace("/", "%2F").replace("\\", "%5C"))
        n = {".": "%2E", "..": "%2E%2E"}.get(n, n)
        if len(n.encode()) > 200:  # a file name holds 255 bytes, and replacing() adds its own to it
            n = n.encode()[:180].decode(errors="ignore") + "-" + hashlib.sha256(v.encode()).hexdigest()[:8]
        if n.casefold() in seen:
            n += "-" + hashlib.sha256(v.encode()).hexdigest()[:6]
        seen.add(n.casefold()); out[v] = n
    return out


def stills_folder(out, flag):
    """`out` made as a folder for stills, or the one line naming the flag that named it (`stills --out`, and diff's and
    drift's --stills, said before their page is written, audit 22) the CLI ends with."""
    out = Path(out)
    if out.exists() and not out.is_dir():
        sys.exit(f"{flag} {out} is a file: name a folder for the stills")
    make_folder(out)


def stills(page, out, views, scale=2.0, theme="light", reader=False, again=False):
    """Each view's still as out/<view>.svg and .png: (what was exported, {view: why it failed}, the views skipped). A view
    whose key file (out/.stills/<view>.json) holds its key and both files' hashes is unchanged and skipped, unless
    `again`. A view counts as exported only once both files are whole and the PNG is a PNG; its key file is written last.
    A file another run, or a person, changed since is drawn again, never trusted."""
    stills_folder(out, "--out")  # before Chrome is looked for
    b, page = chrome(), Path(page).resolve()  # as_uri needs an absolute path (a relative --out)
    keys = still_keys(page, [float(scale), theme, bool(reader)])
    done, failed, skipped, names = [], {}, [], still_names(views_of(page))
    for v in views:
        n = names[v]  # a view id is the model's, not a path: ../x stays in out
        rec, files = out / ".stills" / f"{n}.json", {"svg": out / f"{n}.svg", "png": out / f"{n}.png"}
        try:
            was = json.loads(rec.read_text())
            if not again and was["key"] == keys.get(v) and all(sha(f) == was[k] for k, f in files.items()):
                skipped.append(v)
                continue
        except (OSError, ValueError, KeyError, TypeError):
            pass  # no key file, or one cut short: drawn again
        try:
            dom = headless(b, "--virtual-time-budget=20000", "--dump-dom", f"{page.as_uri()}#still={urllib.parse.quote(v, safe='')}&scale={scale}&theme={theme}" + ("&reader=1" if reader else ""))
            meta = re.search(r'data-still="([^"]+)"', dom)
            svg = re.search(r'<div id="still">(<svg.*?</svg>)</div>', dom, re.S)
            if not (meta and svg):
                raise ChromeError("the page drew no still (a script error in the page?)")
            info = json.loads(html.unescape(meta.group(1)))
            with replacing(files["svg"]) as s, replacing(files["png"]) as p, tempfile.TemporaryDirectory() as tmp:
                s.write_text(svg.group(1), encoding="utf-8")
                pic = Path(tmp) / "still.html"
                pic.write_text("<!doctype html><meta charset=utf-8><body style='margin:0'>" + svg.group(1), encoding="utf-8")
                headless(b, f"--window-size={info['w']},{info['h']}", f"--screenshot={p.resolve()}", pic.as_uri())
                if not p.is_file() or p.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
                    raise ChromeError("Chrome wrote no PNG")
        except (ChromeError, OSError) as e:  # OSError: a file this view's pictures cannot be written to
            failed[v] = str(e)
            continue
        rec.parent.mkdir(exist_ok=True)
        write(rec, json.dumps({"key": keys.get(v), **{k: sha(f) for k, f in files.items()}}))
        done.append({"view": v, "w": info["w"], "h": info["h"], "png": str(files["png"])})
    (out / ".stills.json").unlink(missing_ok=True)  # the one shared record before 0.14.0
    return done, failed, skipped


def cmd_stills(a):
    page, out = Path(a.page).resolve(), Path(a.out)
    done, failed, skipped = stills(page, out, pick(page, a.views), a.scale, a.theme, a.reader, a.all)
    names = set(still_names(views_of(page)).values())
    if gone := sorted(urllib.parse.unquote(r.stem) for r in (out / ".stills").glob("*.json") if r.stem not in names):
        print(f"stills: {out} still holds pictures of views the page no longer has: {', '.join(gone)}", file=sys.stderr)
    if failed:
        sys.exit(f"stills: {len(failed)} view(s) failed ({len(done)} exported, {len(skipped)} unchanged): "
                 + "; ".join(f"{v}: {why}" for v, why in failed.items()))
    print(json.dumps(done, indent=1))
    print(f"{len(done)} still(s) exported, {len(skipped)} unchanged and skipped (--all exports every view)", file=sys.stderr)


def cmd_pdf(a):
    """The map as one PDF (#93), printed by headless Chrome itself (--print-to-pdf, its Page.printToPDF): the page lays
    the document out a page at a time (#pdf=1, a reader copy) and Chrome prints it, on A4 or US Letter (--paper), across.
    A cover with the contents; each view (--views, else every one) from a page of its own: its picture in vectors, its
    legend, and tables of its cards, lines and boxes; the model's rules, if it has any. The views are the PDF's bookmarks.
    Chrome prints to a file of its own, which replaces --out only once it holds the views: a failed print leaves the
    previous PDF."""
    page, out = Path(a.page).resolve(), Path(a.out)
    views = pick(page, a.views)
    url = page.as_uri() + f"#pdf=1&reader=1&theme={a.theme}&paper={a.paper}" + (f"&views={fragment(views)}" if a.views else "")
    with replacing(out) as tmp:  # no header or footer: Chrome's would print the page's file path (the older flag too, for an older Chrome)
        headless(chrome(), "--virtual-time-budget=20000", "--no-pdf-header-footer", "--print-to-pdf-no-header", "--generate-pdf-document-outline",
                 f"--print-to-pdf={tmp.resolve()}", url, timeout=600)
        pages = len(re.findall(rb"/Type\s*/Page\b", tmp.read_bytes())) if tmp.is_file() else 0
        if pages < 2:  # the cover and a view; a page from before 0.13.0 has no #pdf and prints as one screen
            sys.exit(f"pdf: no view printed ({pages} page(s)): the views have no cards, or the page is older than umlimator 0.13.0"
                     f" (render it again){f'; {a.out} is as it was' if out.exists() else ''}")
    print(json.dumps({"out": a.out, "pages": pages, "bytes": out.stat().st_size}, indent=1))


def step_ms(d):
    """A story step's time on screen, as the page plays it: Math.max(500, +duration || 4000)."""
    try:
        d = float(d or 0)
    except (TypeError, ValueError):
        d = 0
    return int(max(500, d)) if 0 < abs(d) < 1e9 else 4000  # not nan, inf or 0


def apng(frames, delays, out):
    """PNG files of one size as one animated PNG, each frame shown for its delay in ms: the frames' own image data,
    numbered into APNG's frame chunks (nothing decoded or encoded again)."""
    def chunks(b):
        i = 8
        while i < len(b):
            n = int.from_bytes(b[i:i + 4], "big")
            yield b[i + 4:i + 8], b[i + 8:i + 8 + n]
            i += 12 + n
    def chunk(t, d):
        return len(d).to_bytes(4, "big") + t + d + zlib.crc32(t + d).to_bytes(4, "big")
    pngs = [list(chunks(Path(f).read_bytes())) for f in frames]
    head = pngs[0][0][1]
    if any(p[0] != (b"IHDR", head) for p in pngs):
        sys.exit("record: the frames are not all the same size and kind of PNG")
    w, h = struct.unpack(">II", head[:8])
    # a delay is a fraction of two 16-bit numbers: in ms up to 65.535 s, else in coarser units, so a step of minutes or
    # hours lasts as long as the page plays it; past 65535 s the frame is shown again, the delay shared (audit 24)
    shown = []
    for k, (p, ms) in enumerate(zip(pngs, delays)):
        n = max(1, -(-int(ms) // 65535000))
        shown += [(k, p, int(ms) / n)] * n
    def delay(ms):  # in ms while that fits (as before), else ms / 1000 in lowest terms when that does, else the finest unit that does
        ms = round(ms)
        g = 1 if ms <= 65535 else math.gcd(ms, 1000)
        if ms // g <= 65535:
            return ms // g, 1000 // g
        den = next(d for d in (100, 10, 1) if round(ms * d / 1000) <= 65535)
        return round(ms * den / 1000), den
    parts = [b"\x89PNG\r\n\x1a\n", chunk(b"IHDR", head), chunk(b"acTL", struct.pack(">II", len(shown), 0))]
    parts += [chunk(t, d) for t, d in pngs[0] if t in (b"sRGB", b"gAMA", b"cHRM", b"iCCP", b"pHYs")]  # the colour space, as the first frame says
    seq = 0
    for i, (k, p, ms) in enumerate(shown):
        parts.append(chunk(b"fcTL", struct.pack(">IIIIIHHBB", seq, w, h, 0, 0, *delay(ms), 0, 0)))
        seq += 1
        for t, d in p:
            if t == b"IDAT" and i == 0:
                parts.append(chunk(b"IDAT", d))  # the first frame is the still a viewer without APNG shows
            elif t == b"IDAT":
                parts.append(chunk(b"fdAT", seq.to_bytes(4, "big") + d))
                seq += 1
    parts.append(chunk(b"IEND", b""))
    with replacing(out) as tmp:
        tmp.write_bytes(b"".join(parts))


def cmd_record(a):
    """A story (#69) as an animated PNG: the page opened at each step in headless Chrome (#story=<id>&step=<n>, drawn at
    once, and with reduced motion: CSS transitions do not finish in a headless screenshot), one frame per step, shown for
    the step's duration. A step that plays a tour gets frames along its ride instead (&at=0 to 1), which share the step's
    duration (#83)."""
    if Path(a.out).suffix.lower() != ".png":
        sys.exit("record: --out is a .png file, an animated PNG (GIF and MP4 need encoders umlimator does not ship: convert the PNG)")
    page = Path(a.page).resolve()
    data = page_data(page)[0]
    stories = data.get("stories") or []
    story = next((s for s in stories if isinstance(s, dict) and s.get("id") == a.story), None)
    if not story or not story.get("steps"):
        sys.exit(f"record: the page has no story {a.story!r} with steps (it has: {', '.join(str(s.get('id')) for s in stories if isinstance(s, dict)) or 'none'})")
    steps = story["steps"] if isinstance(story["steps"], list) else sys.exit(f"record: story {a.story!r}'s steps are not a list")
    if bad := [n for n, s in enumerate(steps, 1) if not isinstance(s, dict)]:  # one line, not a traceback (audit 8)
        sys.exit(f"record: story {a.story!r} step {bad[0]} is not an object")
    b, (w, h) = chrome(), a.size
    with tempfile.TemporaryDirectory() as tmp:
        frames, delays = [], []
        for n, step in enumerate(steps, 1):
            # a tour: 2 frames a leg, at most 6 so the file stays small, each shown for its share of the step's duration
            # ponytail: the ride fills the step at its own pace, not the live dot's: only the page knows the ride's length
            # (have the page say it if the pace matters)
            ms, k = step_ms(step.get("duration")), max(1, min(6, 2 * len(step.get("tour") if isinstance(step.get("tour"), list) else []) - 1))
            for i in range(k):
                png = Path(tmp) / f"{len(frames):03}.png"
                headless(b, "--virtual-time-budget=8000", "--force-prefers-reduced-motion", f"--window-size={w},{h}", f"--force-device-scale-factor={a.scale}", f"--screenshot={png}",
                         f"{page.as_uri()}#shot=1&theme={a.theme}&story={urllib.parse.quote(a.story)}&step={n}" + (f"&at={i / (k - 1):.4f}" if k > 1 else ""))
                if not png.is_file():
                    sys.exit(f"record: Chrome drew no picture of step {n}")
                frames.append(png); delays.append(ms * (i + 1) // k - ms * i // k)
        apng(frames, delays, a.out)
    print(json.dumps({"story": a.story, "frames": len(frames), "out": a.out, "bytes": Path(a.out).stat().st_size}, indent=1))


def cmd_import(a):
    """A diagram a team has already, as a model (#90): Structurizr DSL, C4-PlantUML, Mermaid, or the JSON of `docker
    compose config` or `kubectl get`. umlimator_import.py reads them, but for a Mermaid classDiagram, sequenceDiagram,
    stateDiagram, erDiagram, requirementDiagram or mindmap, a Mermaid flowchart given --typed, a Structurizr JSON workspace and a
    .dbml file, which the module's readers read in Node into a typed model (schema version 2: uml.class, uml.sequence,
    uml.state-machine, er, sysml.requirement, flowchart or C4 views; notes/milestone-2.md §8.5, milestone-3.md §12.4). A
    .dbml file is parsed by @dbml/core where it resolves from the working folder, which umlimator does not install. A
    Structurizr JSON or .dbml file over 1 MiB is refused before it is parsed. What it does not import is listed on
    stderr, each with its line (in JSON, its path)."""
    sys.path.insert(0, str(HERE))
    import umlimator_import as imp
    named = {"structurizr-json": "a Structurizr JSON workspace", "dbml": "DBML"}
    if not Path(a.file).is_file():
        sys.exit(f"import: no file at {a.file}")
    early = a.format or ("dbml" if Path(a.file).suffix.lower() == ".dbml" else None)  # ponytail: a .dbml file's name is trusted here, before detect reads it
    if early in imp.NODE_FORMATS and (size := Path(a.file).stat().st_size) > imp.LIMIT:  # hostile input (milestone-2.md §8): not even read
        sys.exit(f"import: {a.file} is {size} bytes, over the limit of {imp.LIMIT} (1 MiB) for {named[early]}: nothing read, nothing written")
    try:
        text = Path(a.file).read_text(encoding="utf-8-sig")  # a byte-order mark is not the diagram's
    except UnicodeDecodeError as e:
        sys.exit(f"import: {a.file} is not UTF-8 text ({e.reason} at byte {e.start}): nothing read, nothing written")
    fmt = a.format or imp.detect(a.file, text)
    if not fmt and text.lstrip()[:1] in ("{", "["):  # JSON that does not parse (cut short?) is not a format it can't tell
        try:
            json.loads(text)
        except ValueError as e:
            sys.exit(f"import: {a.file} is not valid JSON ({e}): is it cut short? (give --format if it is not JSON)")
        except RecursionError:
            sys.exit(f"import: {a.file} nests too deep to read: nothing written")
    fmt = fmt or sys.exit(f"import: cannot tell the format of {a.file}: give --format ({', '.join(imp.FORMATS + imp.NODE_FORMATS + ['bpmn'])})")
    kind = fmt == "mermaid" and imp.mermaid_typed(text, a.typed)
    if a.typed and not kind and fmt not in imp.NODE_FORMATS + ["bpmn"]:  # those are typed already
        sys.exit(f"import: --typed reads a Mermaid flowchart typed; {a.file} is {fmt}"
                 f"{' but not a flowchart' if fmt == 'mermaid' else ''}, which imports as a map: nothing written")
    what = f"a Mermaid {kind}" if kind else named.get(fmt)
    if fmt == "bpmn":  # BPMN XML: the module's adapter, through the user's bpmn-moddle (notes/milestone-4b.md §12)
        r = bpmn("readBpmnXml", a, text)
        m, unread = r["model"], [(x["line"] or None, f"{x['status']}: {x['message']}") for x in r["report"]]
    elif what:  # the module's reader, in Node (risks.md R7)
        name, fn = {"classDiagram": ("mermaid-class.js", "readMermaidClass"), "sequenceDiagram": ("mermaid-sequence.js", "readMermaidSequence"),
                    "stateDiagram": ("mermaid-state.js", "readMermaidState"), "erDiagram": ("mermaid-er.js", "readMermaidEr"),
                    "requirementDiagram": ("mermaid-requirement.js", "readMermaidRequirement"),
                    "flowchart": ("mermaid-flowchart.js", "readMermaidFlowchart"), "mindmap": ("mermaid-mindmap.js", "readMermaidMindmap"), "structurizr-json": ("structurizr.js", "readStructurizr"),
                    "dbml": ("dbml.js", "readDbml")}[kind or fmt]
        size = Path(a.file).stat().st_size
        if fmt in imp.NODE_FORMATS and size > imp.LIMIT:  # hostile input (milestone-2.md §8): before Node or @dbml/core parses it
            sys.exit(f"import: {a.file} is {size} bytes, over the limit of {imp.LIMIT} (1 MiB) for {what}: nothing read, nothing written")
        reader = HERE / "src" / "readers" / name
        if not shutil.which("node"):
            sys.exit(f"import: {a.file} is {what}, which the module's reader reads in Node.js 18 or later; install Node to import it"
                     + (", or import it without --typed, as a map, which needs only Python" if kind == "flowchart" else
                        ". Structurizr DSL, C4-PlantUML, compose, Kubernetes and Mermaid's flowcharts and C4 diagrams need only Python"))
        if not reader.is_file():  # a copy of the CLI with lib/ but not src/
            sys.exit(f"import: {a.file} is {what}, whose reader is src/readers/{name}, which this copy of "
                     f"umlimator does not have ({reader.parent} is missing it): import it from a full clone of the repository")
        if fmt == "dbml":  # @dbml/core parses, the adapter reads its Database; required, not imported (milestone-2.md §8.4)
            code = ("import { createRequire } from 'node:module'; import { readDbml } from " + json.dumps(reader.as_uri()) + ";"
                    "const req = createRequire(process.cwd() + '/'); let at; try { at = req.resolve('@dbml/core') } catch { process.stdout.write('null'); process.exit(0) }"
                    "let P; try { P = req(at).Parser; if (typeof (P && P.parse) !== 'function') throw new Error('it has no Parser.parse') }"
                    " catch (e) { process.stdout.write(JSON.stringify({ broken: at, why: String(e && e.message || e) })); process.exit(0) }"
                    "let s = ''; for await (const c of process.stdin) s += c; let db;"
                    "try { db = P.parse(s, 'dbmlv2') } catch (e) { process.stdout.write(JSON.stringify({ diags: (Array.isArray(e && e.diags) ? e.diags : [e])"
                    ".map(d => [d && d.location && d.location.start ? d.location.start.line : null, String(d && d.message || d)]) })); process.exit(0) }"
                    "process.stdout.write(JSON.stringify(readDbml(db)));")
            p = run([shutil.which("node"), "--input-type=module", "-e", code], input=text)
            if p.returncode:
                sys.exit(p.stderr.strip()[-2000:])
            r = json.loads(p.stdout)
            if r is None:
                sys.exit(f"import: {a.file} is DBML, which @dbml/core parses, and @dbml/core does not resolve from this folder ({Path.cwd()}): "
                         "install it here (npm install @dbml/core) and import again; umlimator does not depend on it. Nothing written")
            if "broken" in r:  # an install that does not load is not the user's DBML at fault
                sys.exit(f"import: @dbml/core at {r['broken']} did not load ({r['why']}): reinstall it (npm install @dbml/core) and import again. "
                         f"{a.file} was not parsed; nothing written")
            for where, msg in r.get("diags") or []:
                print(f"{a.file}:{where}: {msg}" if where is not None else f"{a.file}: {msg}", file=sys.stderr)
            if "diags" in r:
                sys.exit(f"import: @dbml/core could not parse {a.file}: nothing written")
        else:
            r = js(fn, text, module=reader)
        # a JSON source's item is named by its path (Structurizr's `path`, the DBML adapter's `line`); '' is the whole file
        m, unread = r["model"], [(x.get("line", x.get("path")) if x.get("line", x.get("path")) != "" else None,
                                  f"{x['status']}: {x['message']}") for x in r["report"]]
    else:
        try:
            m, unread = imp.read(fmt, text, Path(a.file).stem)
        except ValueError as e:  # JSON that does not parse, or a number JSON has not (1e400, NaN: imp.loads, audit 31)
            if fmt not in ("compose", "kubernetes"):
                raise
            sys.exit(f"import: {a.file} is not {fmt} JSON ({e}): nothing written")
        except RecursionError:  # json.loads on a hostile nest (R2)
            sys.exit(f"import: {a.file} nests too deep to read: nothing written")
    for where, msg in unread:  # ponytail: JSON keeps no line numbers, so a JSON source's item is named by its path
        print(f"{a.file}:{where}: {msg}" if where is not None else f"{a.file}: {msg}", file=sys.stderr)
    if not m["nodes"]:
        sys.exit(f"import: {a.file} has nothing to import as {fmt}")
    out = json.dumps(m, indent=2, ensure_ascii=False) + "\n"
    if (fixed := re.sub("[\ud800-\udfff]", "\ufffd", out)) != out:  # a lone surrogate (an entity or escape gave it) has no UTF-8
        print(f"{a.file}: a lone surrogate code point (U+D800 to U+DFFF), which no UTF-8 file holds: written as U+FFFD", file=sys.stderr)
    write(a.out, fixed)
    inline = sum(isinstance(e, dict) for v in m["views"] for e in v.get("edges") or [])  # a sequence view's messages
    print(json.dumps({"out": a.out, "format": fmt, "cards": len(m["nodes"]), "lines": len(m["edges"]) + inline,
                      "views": [v["id"] for v in m["views"]], "unread": len(unread),
                      "notImported": [{"where": w, "message": msg} for w, msg in unread]}, indent=1))


def cmd_export(a):
    """A model's BPMN as BPMN XML (notes/milestone-4b.md §12.3): every bpmn element and view, through the module's
    writer in Node with the user's bpmn-moddle; what it does not write is listed on stderr, each with its element's id."""
    if not Path(a.model).is_file():
        sys.exit(f"no model at {a.model}")
    m = read_model(a.model)
    views = [v.get("id") for v in m.get("views") or [] if isinstance(v, dict) and v.get("diagram") == "bpmn"]
    view = a.view or (views[0] if views else None)
    if view not in views:
        sys.exit(f"export: {a.model} has no bpmn view {view}" if view else f"export: {a.model} has no bpmn view to export")
    r = bpmn("writeBpmnXml", a, m, view, None)
    for x in r["report"]:
        print(f"{a.model}:{x['line']}: {x['message']}" if x["line"] else f"{a.model}: {x['message']}", file=sys.stderr)
    if not r["xml"]:
        sys.exit(f"export: nothing written to {a.out}")
    write(a.out, r["xml"])
    print(json.dumps({"out": a.out, "format": "bpmn", "view": view, "notWritten": len(r["report"])}, indent=1))


def cmd_mcp(a):
    """A Model Context Protocol server over stdio for one model (#91): tools that read it, and tools that drive its page,
    served on 127.0.0.1. It lives in umlimator_mcp.py, next to this file."""
    if not Path(a.model).is_file():
        sys.exit(f"no model at {a.model}")
    import umlimator_mcp
    umlimator_mcp.serve(a.model, a.port)


def main():
    if not isinstance(sys.stderr, Terminal):
        sys.stderr = Terminal(sys.stderr)
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render"); r.add_argument("model"); r.add_argument("--out", required=True)
    r.add_argument("--no-check", action="store_true"); r.set_defaults(f=cmd_render)
    s = sub.add_parser("stills"); s.add_argument("page"); s.add_argument("--out", required=True)
    s.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)"); s.add_argument("--scale", type=above_0, default=2.0); s.add_argument("--theme", default="light", choices=["light", "dark"])
    s.add_argument("--reader", action="store_true", help="reader copy: no CHECK tab, no drill-down pill (as stillsv.js)")
    s.add_argument("--all", action="store_true", help="export every view, even one whose inputs are unchanged since its last export")
    s.set_defaults(f=cmd_stills)
    pd = sub.add_parser("pdf", help="every view in one PDF, a document for a review: a cover with the contents, each view with its legend and tables, the rules")
    pd.add_argument("page"); pd.add_argument("--out", required=True)
    pd.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)"); pd.add_argument("--theme", default="light", choices=["light", "dark"])
    pd.add_argument("--paper", default="a4", choices=["a4", "letter"], help="the paper, across (default a4)"); pd.set_defaults(f=cmd_pdf)
    rc = sub.add_parser("record", help="a story as an animated PNG, a frame per step and frames along a step's tour"); rc.add_argument("page")
    rc.add_argument("--story", required=True); rc.add_argument("--out", required=True, help="a .png file")
    rc.add_argument("--size", type=size, default="1160x740", help="the window, WxH (up to 1180 wide the views list stays shut)"); rc.add_argument("--scale", type=above_0, default=1)
    rc.add_argument("--theme", default="light", choices=["light", "dark"]); rc.set_defaults(f=cmd_record)
    i = sub.add_parser("pin-icons", help="record each new brand mark's sha256 and move it out of icons/ into the cache"); i.set_defaults(f=cmd_pin_icons)
    pk = sub.add_parser("pack", help="the cloud vendors' icon packs, fetched only on request and after their terms (icons/packs.json)")
    pks = pk.add_subparsers(dest="what", required=True); pks.add_parser("list", help="each pack's pin, whether it is fetched and accepted")
    pf = pks.add_parser("fetch", help="show a pack's terms, ask for a yes, then download its pinned zips into the cache"); pf.add_argument("pack")
    pf.add_argument("--accept-terms", metavar="PACK@LABEL", help="with no terminal: the user's yes to the terms printed, for this pack and pin only")
    pk.set_defaults(f=lambda a: packs().main(a))
    c = sub.add_parser("check"); c.add_argument("page"); c.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)")
    c.add_argument("--timeout", type=int, default=600)
    c.add_argument("--expand", action="store_true", help="also check each view with each stacked card unfolded in place, one at a time (#71)")
    c.add_argument("--ignore", help=f"kinds left out of the report: right-to-left, {', '.join(k for k in KINDS if k not in ('rules', 'rightToLeft'))} (comma list)")
    c.set_defaults(f=cmd_check)
    d = sub.add_parser("diff", help="what changed between two models, or in every model changed since a git ref (--base)")
    d.add_argument("files", nargs="*", metavar="BEFORE.json AFTER.json"); d.add_argument("--out", required=True, help="the page (with --base: a folder)")
    d.add_argument("--stills", help="a folder for stills of the views that show a change"); d.add_argument("--base", help="a git ref: diff the working tree's models against it")
    d.add_argument("--models", nargs="*", help="with --base, git pathspecs of the model files (default: every .json that is a map model)")
    d.set_defaults(f=cmd_diff)
    dr = sub.add_parser("drift", help="the map against the traffic seen"); dr.add_argument("model"); dr.add_argument("observed")
    dr.add_argument("--out", required=True); dr.add_argument("--match", help="JSON: {service name: card id}"); dr.add_argument("--stills")
    dr.set_defaults(f=cmd_drift)
    tr = sub.add_parser("trace", help="a trace (OTLP JSON) kept as a numbered view of the model"); tr.add_argument("model"); tr.add_argument("trace")
    tr.add_argument("--view", required=True, help="the new view's id (one with that id that a trace made is replaced)"); tr.add_argument("--out", required=True, help="the model with the view: a .json file")
    tr.add_argument("--match", help="JSON: {service name: card id}"); tr.add_argument("--title", help="the view's title (default: its id)")
    tr.add_argument("--diagram", choices=["uml.sequence"], help="the view as a UML sequence diagram (a version-2 model), not a numbered view")
    tr.set_defaults(f=cmd_trace)
    t = sub.add_parser("timelapse", help="the model's versions in git history on a slider"); t.add_argument("model"); t.add_argument("--out", required=True)
    t.add_argument("--limit", type=at_least_1, default=30, help="the latest N versions (default 30)"); t.set_defaults(f=cmd_timelapse)
    im = sub.add_parser("import", help="a Structurizr (DSL or JSON), C4-PlantUML, Mermaid or DBML diagram, compose or Kubernetes JSON, or BPMN XML, as a model")
    im.add_argument("file"); im.add_argument("--out", required=True, help="the model, a .json file")
    im.add_argument("--format", choices=["structurizr", "plantuml", "mermaid", "compose", "kubernetes", "structurizr-json", "dbml", "bpmn"], help="default: read from the content, then the extension")
    im.add_argument("--typed", action="store_true", help="a Mermaid flowchart as a typed flowchart view (needs Node), not a map")
    im.add_argument("--moddle", help="BPMN: the folder bpmn-moddle is installed in (default: UMLIMATOR_BPMN_MODDLE, else the working folder)")
    im.set_defaults(f=cmd_import)
    ex = sub.add_parser("export", help="a model's BPMN as BPMN XML, through bpmn-moddle"); ex.add_argument("model")
    ex.add_argument("--out", required=True, help="the file, .bpmn"); ex.add_argument("--view", help="the bpmn view whose layout it carries (default: the first)")
    ex.add_argument("--format", choices=["bpmn"], default="bpmn"); ex.add_argument("--moddle", help="the folder bpmn-moddle is installed in (default: UMLIMATOR_BPMN_MODDLE, else the working folder)")
    ex.set_defaults(f=cmd_export)
    mc = sub.add_parser("mcp", help="a Model Context Protocol server over stdio: an AI assistant reads the model and drives its page")
    mc.add_argument("model"); mc.add_argument("--port", type=port, default=7391, help="the page's port on 127.0.0.1 (default 7391; another if it is taken)")
    mc.set_defaults(f=cmd_mcp)
    a = p.parse_args()
    if getattr(a, "page", None) and not Path(a.page).is_file():
        sys.exit(f"{a.cmd}: no page at {a.page}")
    # trace's --out may be MODEL.json itself, never its TRACE or --match (audit 14)
    ins = [getattr(a, k, None) for k in ("model", "file", "page", "observed", "trace", "match") if not (a.cmd == "trace" and k == "model")] + (getattr(a, "files", None) or [])
    if getattr(a, "out", None) and any(x and (Path(x).resolve() == Path(a.out).resolve()
            or os.path.exists(x) and os.path.exists(a.out) and os.path.samefile(x, a.out)) for x in ins):  # the file, not its spelling: case, hard links
        sys.exit(f"{a.cmd}: --out {a.out} is its input: name another file")  # else replacing() renames the output over it
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))  # as Ctrl-C: temp files go, and the children run() started
    try:
        a.f(a)
    except ChromeError as e:  # Chrome missing, out of time or failing, in every command that runs it
        sys.exit(f"{a.cmd}: {e}")


if __name__ == "__main__":
    main()
