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
  umlimator.py trace MODEL.json TRACE.json --view ID --out OUT.json [--match MATCH.json] [--title T]   # a trace (OTLP JSON) kept as a numbered view
  umlimator.py timelapse MODEL.json --out PAGE.html [--limit 20]   # the model's versions in git history, on a slider
  umlimator.py record PAGE.html --story ID --out STORY.png [--size 1160x740] [--scale 1] [--theme light|dark]   # a story as an animated PNG
  umlimator.py import FILE --out MODEL.json [--format structurizr|plantuml|mermaid|compose|kubernetes]   # a diagram you have, as a model
  umlimator.py pdf PAGE.html --out MAP.pdf [--views a,b] [--theme light|dark] [--paper a4|letter]   # one PDF: a cover with the contents,
                                                       # each view with its legend and tables of its cards, lines and boxes, the rules
  umlimator.py mcp MODEL.json [--port 7391]   # an MCP server over stdio: an AI assistant reads the model and drives its page

MODEL.json is the map model in engine/references/schema.md (nodes, edges, views), plus umlimator's `badge` field on a
node (PROPOSED, TARGET, OFF ...). `stills` needs Google Chrome or Chromium; the PNGs are what a document that cannot
run the page (a wiki such as Confluence) shows. `diff`, `drift`, `trace` and `mcp` run the module's own functions in Node,
and so does `import` of a Mermaid classDiagram or sequenceDiagram (their readers are the module's, in src/readers/).
"""
import argparse, atexit, base64, contextlib, hashlib, html, io, json, os, re, shutil, signal, struct, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile, zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE / "engine" / "scripts" / "visual.py"
LIB = HERE / "lib" / "umlimator-all.js"        # the module with every diagram family, in one file with no imports (built: tools/build.mjs)
THEME = HERE / "lib" / "umlimator-theme.css"   # its default palette and fonts (--um-* variables)
PAGE = HERE / "engine" / "assets" / "template.html"  # the page around it; visual.py fills in the model


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
           "check = v.validate_map; v.validate_map = lambda d: check(u.upstream_view(d))\n"
           "sys.argv = [sys.argv[1]] + sys.argv[4:]; v.main()")
    return [sys.executable, "-c", run, str(VISUAL), str(Path(__file__).resolve()), str(page), *args]


def upstream_view(d):
    """The model as upstream's validate_map is shown it. umlimator allows two things that visual.py rejects: a card that
    opens a view the host loads later (#47), and a line that ends on a container (#28). The copy it checks leaves out
    such an opensView, and lists each container's id as a card's, so a line's other end is still checked (and named)."""
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
    def walk(x):
        for m in x.get("members") or []:
            if isinstance(m, dict) and isinstance(m.get("id"), str):
                members.append(m["id"]); walk(m)
    for n in d.get("nodes", []) if d.get("schemaVersion") == 2 else []:
        if isinstance(n, dict): walk(n)
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
    tmp = path.with_name(f".{path.stem}.{os.urandom(4).hex()}{path.suffix}")  # not mkstemp: the file takes the usual mode
    try:
        yield tmp
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def write(path, text):
    with replacing(path) as tmp:
        tmp.write_text(text, encoding="utf-8")


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
    cached = CACHE / e["file"]
    if cached.is_file():
        data = cached.read_bytes()
        if hashlib.sha256(data).hexdigest() == e.get("sha256"):
            return data
        print(f"icon {e['file']}: the copy in {CACHE} does not match its pinned sha256; fetching it again", file=sys.stderr)
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
    CACHE.mkdir(parents=True, exist_ok=True)
    with replacing(cached) as tmp:  # two renders fetching one logo never read half of it
        tmp.write_bytes(data)
    return data


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


def page_model(model_path, out, source=None):
    """The model as rendered: with an `icons` table of every icon its nodes name (`icon`): a Lucide line icon as its
    inner markup, drawn in the card's kind colour; a brand mark as a data URI on a white tile, never recoloured.
    Returns the path of a temporary copy next to the model, so relative paths still resolve. The copy's name is its
    own (renders of one model can run at once), and the page records the model's path (or `source`) as its source."""
    m = json.loads(Path(model_path).read_text(encoding="utf-8"))
    # visual.py records the checkout's root relative to the page; for a page outside the checkout that path climbs
    # through the folders above it (a home folder, a user name) into a page that gets shared
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    base = Path(root or os.getcwd()).resolve()
    if not Path(out).resolve().is_relative_to(base):
        m.setdefault("meta", {}).setdefault("root", "")
    table = icon_table([m])
    if table:
        m["icons"] = table
    # the path visual.py would record for the model itself (its portable_path): in the checkout, under home as ~/, else the name
    src = Path(source or model_path).resolve()
    m.setdefault("source", next((pre + src.relative_to(b).as_posix() for b, pre in ((base, ""), (Path.home().resolve(), "~/"))
                                 if src.is_relative_to(b)), src.name))
    return temp_json(m, model_path, ".icons.json")


_temps = set()  # temp_json's copies still on disk: removed however the process ends, SIGTERM (exit 143) included
atexit.register(lambda: [p.unlink(missing_ok=True) for p in list(_temps)])


def temp_json(m, near, suffix):
    """`m` written to a file of its own next to `near` (hidden), so parallel renders never share one. Its name is
    registered before the file exists, so a stop at any moment leaves nothing behind; the caller removes it (untemp)."""
    d = Path(near).resolve().parent
    while True:
        tmp = d / f".{Path(near).stem}.{os.urandom(4).hex()}{suffix}"
        _temps.add(tmp)
        try:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            break
        except FileExistsError:
            _temps.discard(tmp)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(json.dumps(m, ensure_ascii=False))
    return str(tmp)


def untemp(path):
    """A temp_json copy, removed."""
    Path(path).unlink(missing_ok=True)
    _temps.discard(Path(path))


def icon_table(models):
    """Every icon the models' cards name, by name (see page_model)."""
    names = {n["icon"] for m in models for n in m.get("nodes", []) if n.get("icon")}
    names |= {o["icon"] for m in models for v in m.get("views", []) for o in (v.get("nodeOverrides") or {}).values() if o.get("icon")}
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
    if all(v.get("layout") for v in json.loads(Path(model).read_text(encoding="utf-8")).get("views") or [{}]):
        args.append("--no-optimize")  # every view laid out already: the layout search would bake nothing (and stalls on a large page)
    with tempfile.TemporaryDirectory() as tmp, replacing(a.out) as page:
        r = run(visual_cmd(tmp, *args, "--out", str(page), *([] if a.no_check else ["--shots", tmp])))
        out = r.stdout + r.stderr
        if r.returncode not in (0, 2) or not page.is_file():
            sys.exit(out.strip()[-2000:] or f"the engine failed (exit status {r.returncode})")
    i = out.find("{")
    try:
        rep = json.loads(out[i:]) if i >= 0 else {}
    except json.JSONDecodeError:
        rep = {}
    chk = rep.get("check", {})
    if chk.get("errors"):  # a check that timed out or never reported is not a clean check
        sys.exit(f"{a.out} is written, but its check did not complete: " + "; ".join(chk["errors"]))
    said = {"out": str(Path(a.out).resolve()), "bytes": rep.get("bytes"), "checked": not a.no_check, "counts": chk.get("counts"),
            "problems": chk.get("overlaps", []), "errors": chk.get("errors", [])}
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
    before, after = (json.loads(Path(f).read_text(encoding="utf-8")) for f in a.files)
    r = diff_page(before, after, a.files[1], a.out, a.stills)
    print(json.dumps({k: v for k, v in r.items() if k != "model"}, indent=1))
    if r.get("stillsFailed"):
        print(f"diff: {no_pictures(r['stillsFailed'])}", file=sys.stderr)


def diff_page(before, after, near, out, stills=None):
    d = js("diff", before, after)
    m = d["model"]
    m["title"] = f"{m.get('title') or Path(near).stem}: what changed"
    rep = render_model(m, near, out)
    pngs, failed = shots(out, stills, d["views"])
    return {"out": rep["out"], "summary": d["summary"], "views": d["views"], "stills": pngs, **({"stillsFailed": failed} if failed else {}), "model": m}


def model_of(text):
    """A file's text as (its map model, or None; why it is not JSON, or None)."""
    if text is None:
        return None, None
    try:
        m = json.loads(text)
    except ValueError as e:
        return None, e
    return (m if isinstance(m, dict) and isinstance(m.get("nodes"), list) and isinstance(m.get("views"), list) else None), None


def diff_since(a):
    git = lambda *x: subprocess.run(["git", *x], capture_output=True, text=True)
    changed = git("diff", "--name-only", "-z", "--no-renames", a.base, "--", *(a.models or ["*.json"]))
    if changed.returncode:
        sys.exit(changed.stderr.strip())
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    done, md, stems = [], ["<!-- umlimator-diff -->", "### Map changes", ""], set()
    for name in filter(None, changed.stdout.split("\0")):
        old = git("show", f"{a.base}:{name}")
        texts = (old.stdout if old.returncode == 0 else None, Path(name).read_text(encoding="utf-8") if Path(name).is_file() else None)
        (before, e1), (after, e2) = model_of(texts[0]), model_of(texts[1])
        # a model that no longer parses (a conflict marker, a cut) is a change to say, not a file to skip; other JSON that
        # does not parse (a tsconfig.json with comments) is not a model
        why = [f"{at} is not valid JSON ({e})" for at, e, t, other in ((f"its version at {a.base}", e1, texts[0], after), ("it", e2, texts[1], before))
               if e and (other or '"nodes"' in t and '"views"' in t)]
        if why:
            done.append({"file": name, "error": "; ".join(why)})
            md += [f"**`{name}`**: cannot be read: " + "; ".join(why), ""]
            continue
        if not (before or after):
            continue  # JSON, but not a map model
        stem = name.replace("/", "-")[:-5] if name.endswith(".json") else name.replace("/", "-")
        if stem in stems:  # a/b-c.json and a-b/c.json
            stem += "-" + hashlib.sha256(name.encode()).hexdigest()[:6]
        stems.add(stem)
        try:
            r = diff_page(before, after, name if after else out / f"{stem}.json", out / f"{stem}.html", out / stem)
        except SystemExit as e:  # the module failed on this model (js() ends the CLI): said for this file, and the rest go on
            done.append({"file": name, "error": str(e.code)})
            md += [f"**`{name}`**: cannot be diffed: {e.code}", ""]
            continue
        if not r["summary"]:
            continue
        done.append({"file": name, **{k: v for k, v in r.items() if k != "model"}})
        md += [f"**`{name}`**: " + ", ".join(r["views"]) if r["views"] else f"**`{name}`**", ""]
        md += [f"- {s}" for s in r["summary"]] + [""] + sketch(r["model"]) + [""]
        if r.get("stillsFailed"):
            said = no_pictures(r["stillsFailed"])
            md += [f"_{said[:1].upper()}{said[1:]}._", ""]
    if not done:
        md += ["No map model changed."]
    write(out / "summary.md", "\n".join(md) + "\n")
    print(json.dumps(done, indent=1))


MARKS = {"added": "#1a7f37", "changed": "#9a6700", "removed": "#cf222e"}


def sketch(m, most=60):
    """The cards a diff marks, and the cards next to them, as a mermaid flowchart: GitHub draws it in a comment or a
    job summary, so the picture needs no hosting. The map's own pictures are the stills."""
    views = [v for v in m.get("views") or [] if isinstance(v, dict)]
    cards = {n["id"]: n for n in [*(m.get("nodes") or []), *(n for v in views for n in v.get("nodes") or [])] if isinstance(n, dict) and "id" in n}
    lines = [e for e in [*(m.get("edges") or []), *(e for v in views for e in v.get("edges") or [])] if isinstance(e, dict) and e.get("from") in cards and e.get("to") in cards]
    hot = {i for i, n in cards.items() if n.get("change") in MARKS}
    lines = [e for e in lines if e.get("change") in MARKS or e["from"] in hot or e["to"] in hot]  # marked lines, and the lines of marked cards
    near = hot | {x for e in lines for x in (e["from"], e["to"])}
    if not near or len(near) > most:
        return [] if not near else [f"_{len(near)} cards changed or next to a change: too many to sketch; see the pictures._"]
    key = {i: f"n{k}" for k, i in enumerate(i for i in cards if i in near)}
    q = lambda s: str(s).replace('"', "#quot;")
    out = ["```mermaid", "flowchart LR"]
    out += [f'  {key[i]}["{q(cards[i].get("label") or i)}"]' + (f":::{cards[i]['change']}" if cards[i].get("change") in MARKS else "") for i in key]
    style = []
    for k, e in enumerate(lines):
        out.append(f'  {key[e["from"]]} {"-.->" if e.get("change") == "removed" else "-->"}' + (f'|"{q(e["label"])}"|' if e.get("label") else "") + f' {key[e["to"]]}')
        if e.get("change") in MARKS:
            style.append(f"  linkStyle {k} stroke:{MARKS[e['change']]},stroke-width:2px")
    out += style + [f"  classDef {c} stroke:{v},stroke-width:2px" + (",stroke-dasharray:4 3" if c == "removed" else "") for c, v in MARKS.items()]
    return out + ["```"]


def cmd_drift(a):
    """The map against the traffic seen: lines that run but are not drawn come in dashed rose, drawn lines between
    services traffic reached that carried nothing fade. OBSERVED.json: [{from, to, count}], or a Jaeger or Tempo
    dependency list ([{parent, child, callCount}], or {"data": [...]}); --match: {service: card id} where names differ."""
    m, seen = (json.loads(Path(f).read_text(encoding="utf-8")) for f in (a.model, a.observed))
    r = js("drift", m, seen, {"match": json.loads(Path(a.match).read_text(encoding="utf-8")) if a.match else {}})
    r["model"]["title"] = f"{m.get('title') or Path(a.model).stem}: drawn vs. seen"
    rep = render_model(r["model"], a.model, a.out)
    pngs, failed = shots(a.out, a.stills, r["views"])
    print(json.dumps({"out": rep["out"], "counts": r["counts"], "views": r["views"], "stills": pngs, **({"stillsFailed": failed} if failed else {})}, indent=1))
    if failed:
        print(f"drift: {no_pictures(failed)}", file=sys.stderr)


def cmd_trace(a):
    """A trace kept as a numbered view (#96): MODEL.json with a sequence view made from an OpenTelemetry trace in OTLP JSON,
    its calls between cards in time order, each labelled with its span's name and its duration; written to --out (which
    may be MODEL.json itself). A view with that id is replaced. --match: {service name: card id} where names differ."""
    m, trace = (json.loads(Path(f).read_text(encoding="utf-8")) for f in (a.model, a.trace))
    opts = {"view": a.view, "match": json.loads(Path(a.match).read_text(encoding="utf-8")) if a.match else {}, **({"title": a.title} if a.title else {})}
    out = js("sequenceFromTrace", m, js("otlpSpans", trace), opts)
    v = next(x for x in out["views"] if x.get("id") == a.view)
    if not v["edges"]:
        sys.exit(f"trace: no call in {a.trace} runs between two cards of {a.model} (--match names a service's card)")
    write(a.out, json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"out": a.out, "view": a.view, "steps": len(v["edges"]), "cards": len(v["nodeIds"]), "caption": v["caption"]}, indent=1))


def cmd_timelapse(a):
    """The model's versions in git history, oldest first, as one page with a slider: the map eases from each version to
    the next (new cards fade in, removed ones fade out, moved ones glide), with what changed in words."""
    log = subprocess.run(["git", "log", "--follow", "--name-only", "--format=%x00%H%x09%cs%x09%s", "--", a.model], capture_output=True, text=True)
    if log.returncode:
        sys.exit(log.stderr.strip())
    rows = [r.strip().split("\n") for r in log.stdout.split("\x00") if r.strip()][::-1][-a.limit:]  # each: "sha\tdate\tsubject", "", path
    versions = []
    for head, *rest in rows:
        sha, day, subject = (head.split("\t", 2) + ["", ""])[:3]
        path = next((p for p in rest if p.strip()), a.model)
        r = subprocess.run(["git", "show", f"{sha}:{path}"], capture_output=True, text=True)
        try:
            subject = subject if len(subject) <= 90 else subject[:89].rstrip() + "…"
            versions.append({"label": f"{day} {subject}".strip(), "model": json.loads(r.stdout)})
        except json.JSONDecodeError:
            print(f"{sha[:7]}: {path} is not JSON there; left out", file=sys.stderr)
    if not versions:
        sys.exit(f"no versions of {a.model} in git history")
    data = {"title": versions[-1]["model"].get("title") or Path(a.model).stem, "icons": icon_table([v["model"] for v in versions]), "versions": versions}
    page = (HERE / "engine" / "assets" / "timelapse.html").read_text(encoding="utf-8")
    page = page.replace("__TITLE__", html.escape(data["title"]), 1).replace("/*__UMLIMATOR_THEME__*/", THEME.read_text(encoding="utf-8"), 1)
    page = page.replace("/*__VERSIONS__*/", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"), 1)
    page = page.replace("/*__UMLIMATOR_LIB__*/", LIB.read_text(encoding="utf-8"), 1)
    write(a.out, page)
    print(json.dumps({"out": a.out, "versions": [v["label"] for v in versions]}, indent=1))


def cmd_check(a):
    """The page's own layout check, limited to --views (a trailing * is a prefix) and with a longer wait than
    visual.py check, which gives up after 45 s on a large model. A check of no view fails: it would pass by checking
    nothing."""
    kinds = {"crossings": " cross", "labelOnLine": " lies on edge ", "rightToLeft": "right-to-left", "detours": "detour",
             "nearNode": "passes within", "onMark": "touches the mark", "shortLine": "leaves its line", "roundEnd": "runs round its own end",
             "labelOnBorder": "sits on the border of family", "labelNoRoom": " has no room on edge ", "rules": ' breaks rule "'}
    # --ignore drops whole kinds from the report (pictures that keep a source drawing's own direction run lines right to left)
    asked = [k for k in (a.ignore or "").replace("right-to-left", "rightToLeft").split(",") if k]
    if bad := [k for k in asked if k not in kinds]:
        sys.exit(f"--ignore: unknown kind {', '.join(bad)}; known: right-to-left, {', '.join(k for k in kinds if k != 'rightToLeft')}")
    views = pick(a.page, a.views)
    url = Path(a.page).resolve().as_uri() + "#check=1&theme=light" + (f"&views={fragment(views)}" if a.views else "") + ("&expand=1" if a.expand else "")
    dom = headless(chrome(), "--virtual-time-budget=6000", "--window-size=1440,900", "--dump-dom", url, timeout=a.timeout)
    m = re.search(r'<pre id="visual-check"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit("check did not complete: the page did not report")
    rep = json.loads(html.unescape(m.group(1)))
    if not re.match(r"[1-9]", str(rep.get("checked") or "")):  # "0 views"
        sys.exit(f"check: no view was checked ({rep.get('checked') or 'the page did not say what it checked'})")
    ov = rep.get("overlaps", [])
    counts = {k: sum(t in o for o in ov) for k, t in kinds.items()}
    counts["other"] = len(ov) - sum(counts.values())
    skip = [kinds[k] for k in asked]
    shown = [o for o in ov if not any(t in o for t in skip)]
    print(json.dumps({"checked": rep.get("checked"), "counts": counts, "ignored": len(ov) - len(shown),
                      "problems": shown, "errors": rep.get("errors", [])}, indent=1))
    if rep.get("errors"):
        sys.exit("check reported errors")
    if broken := sum(kinds["rules"] in o for o in shown):  # the model's own rules (#70) are a contract: CI fails on them
        sys.exit(f"{broken} broken rule{'s' if broken > 1 else ''}")


DATA = re.compile(r'<script id="visual-data" type="application/json">(.*?)</script>', re.S)


def views_of(page):
    data = json.loads(DATA.search(Path(page).read_text(encoding="utf-8")).group(1))
    return [v["id"] for v in (data.get("views") or data.get("map", {}).get("views") or [])]


def pick(page, spec):
    """--views (a,b,pic-*: a trailing * is a prefix) as the page's view ids, in the page's order; every view without it.
    A name that matches no view ends the command before Chrome starts, saying which views there are."""
    ids = views_of(page)
    want = [w for w in (spec or "").split(",") if w]
    hit = lambda w, i: i.startswith(w[:-1]) if w.endswith("*") else i == w
    if bad := [w for w in want if not any(hit(w, i) for i in ids)]:
        sys.exit(f"--views: no view {', '.join(map(repr, bad))} in {Path(page).name}; its views: {', '.join(ids)}")
    return [i for i in ids if not want or any(hit(w, i) for w in want)]


def fragment(views):
    """View ids for the page's link, each encoded: an id may hold & + % # (the page reads them with URLSearchParams)."""
    return ",".join(urllib.parse.quote(v, safe="") for v in views)


def still_keys(page, opts):
    """A key per view over everything its still is drawn from: the view, its cards, every line between them or ending
    on one of its boxes, the icons and authors they use, the model's rules (a line that breaks one is drawn rose), the
    size of each card's inner view (the ⤢ pill), the engine code and the export options. A view whose key is unchanged
    since its last export draws the same still."""
    t = Path(page).read_text(encoding="utf-8")
    m = DATA.search(t)
    data = json.loads(m.group(1))
    engine = hashlib.sha256((t[:m.start()] + t[m.end():]).encode()).hexdigest()
    views = data.get("views") or []
    V, N = {v["id"]: v for v in views}, {n["id"]: n for n in data.get("nodes", [])}
    icons, authors = data.get("icons") or {}, data.get("authors") or {}
    keys = {}
    for v in views:
        ids = set(v.get("nodeIds") or [])
        ends = ids | {c.get("id") for c in v.get("containers") or [] if isinstance(c, dict)}  # a line may end on a box (#28)
        nodes = [N.get(i) for i in sorted(ids)]
        lines = [e for e in data.get("edges", []) if e.get("from") in ends and e.get("to") in ends]
        kids = {i: len((V.get((N.get(i) or {}).get("opensView") or i) or {}).get("nodeIds") or []) for i in sorted(ids)}
        cards = [n for n in nodes if n] + list((v.get("nodeOverrides") or {}).values())
        used, who = ({n.get(k) for n in cards} - {None} for k in ("icon", "author"))
        blob = json.dumps([v, nodes, lines, kids, {k: icons[k] for k in sorted(used) if k in icons},
                           {k: authors[k] for k in sorted(who) if k in authors}, data.get("rules"), engine, opts], sort_keys=True)
        keys[v["id"]] = hashlib.sha256(blob.encode()).hexdigest()
    return keys


def sha(f):
    return hashlib.sha256(Path(f).read_bytes()).hexdigest()


def stills(page, out, views, scale=2.0, theme="light", reader=False, again=False):
    """Each view's still as out/<view>.svg and .png: (what was exported, {view: why it failed}, the views skipped). A view
    whose key file (out/.stills/<view>.json) holds its key and both files' hashes is unchanged and skipped, unless
    `again`. A view counts as exported only once both files are whole and the PNG is a PNG; its key file is written last.
    A file another run, or a person, changed since is drawn again, never trusted."""
    b = chrome()
    out.mkdir(parents=True, exist_ok=True)
    keys = still_keys(page, [float(scale), theme, bool(reader)])
    done, failed, skipped = [], {}, []
    for v in views:
        rec, files = out / ".stills" / f"{v}.json", {"svg": out / f"{v}.svg", "png": out / f"{v}.png"}
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
        except ChromeError as e:
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
    if gone := sorted({r.stem for r in (out / ".stills").glob("*.json")} - set(views_of(page))):
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
    parts = [b"\x89PNG\r\n\x1a\n", chunk(b"IHDR", head), chunk(b"acTL", struct.pack(">II", len(pngs), 0))]
    parts += [chunk(t, d) for t, d in pngs[0] if t in (b"sRGB", b"gAMA", b"cHRM", b"iCCP", b"pHYs")]  # the colour space, as the first frame says
    seq = 0
    for k, (p, ms) in enumerate(zip(pngs, delays)):
        parts.append(chunk(b"fcTL", struct.pack(">IIIIIHHBB", seq, w, h, 0, 0, min(int(ms), 65535), 1000, 0, 0)))
        seq += 1
        for t, d in p:
            if t == b"IDAT" and k == 0:
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
    b, page = chrome(), Path(a.page).resolve()
    data = json.loads(DATA.search(page.read_text(encoding="utf-8")).group(1))
    stories = data.get("stories") or []
    story = next((s for s in stories if isinstance(s, dict) and s.get("id") == a.story), None)
    if not story or not story.get("steps"):
        sys.exit(f"record: the page has no story {a.story!r} with steps (it has: {', '.join(str(s.get('id')) for s in stories if isinstance(s, dict)) or 'none'})")
    w, h = (int(x) for x in a.size.lower().split("x"))
    with tempfile.TemporaryDirectory() as tmp:
        frames, delays = [], []
        for n, step in enumerate(story["steps"], 1):
            # a tour: 2 frames a leg, at most 6 so the file stays small, each shown for its share of the step's duration
            # ponytail: the ride fills the step at its own pace, not the live dot's: only the page knows the ride's length
            # (have the page say it if the pace matters)
            ms, k = int(step.get("duration") or 4000), max(1, min(6, 2 * len(step.get("tour") or []) - 1))
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
    compose config` or `kubectl get`. umlimator_import.py reads them, but for a Mermaid classDiagram or sequenceDiagram,
    which the module's readers read in Node into a typed model (schema version 2, one uml.class or uml.sequence view);
    what it does not import is listed on stderr, each with its line (in JSON, its path)."""
    sys.path.insert(0, str(HERE))
    import umlimator_import as imp
    text = Path(a.file).read_text(encoding="utf-8")
    fmt = a.format or imp.detect(a.file, text)
    if not fmt and text.lstrip()[:1] in ("{", "["):  # JSON that does not parse (cut short?) is not a format it can't tell
        try:
            json.loads(text)
        except ValueError as e:
            sys.exit(f"import: {a.file} is not valid JSON ({e}): is it cut short? (give --format if it is not JSON)")
    fmt = fmt or sys.exit(f"import: cannot tell the format of {a.file}: give --format ({', '.join(imp.FORMATS)})")
    kind = fmt == "mermaid" and imp.mermaid_typed(text)
    if kind:  # a classDiagram or a sequenceDiagram: the module's reader, in Node (risks.md R7)
        name, fn = {"classDiagram": ("mermaid-class.js", "readMermaidClass"), "sequenceDiagram": ("mermaid-sequence.js", "readMermaidSequence")}[kind]
        reader = HERE / "src" / "readers" / name
        if not shutil.which("node"):
            sys.exit(f"import: {a.file} is a Mermaid {kind}, which the module's reader reads in Node.js 18 or later; "
                     "install Node to import it. Structurizr, C4-PlantUML, compose, Kubernetes and Mermaid's flowcharts and C4 diagrams need only Python")
        if not reader.is_file():  # a copy of the CLI with lib/ but not src/
            sys.exit(f"import: {a.file} is a Mermaid {kind}, whose reader is src/readers/{name}, which this copy of "
                     f"umlimator does not have ({reader.parent} is missing it): import it from a full clone of the repository")
        r = js(fn, text, module=reader)
        m, unread = r["model"], [(x["line"], f"{x['status']}: {x['message']}") for x in r["report"]]
    else:
        try:
            m, unread = imp.read(fmt, text, Path(a.file).stem)
        except json.JSONDecodeError as e:
            sys.exit(f"import: {a.file} is not {fmt} JSON ({e})")
    for where, msg in unread:  # ponytail: JSON keeps no line numbers, so a JSON source's item is named by its path
        print(f"{a.file}:{where}: {msg}" if where is not None else f"{a.file}: {msg}", file=sys.stderr)
    if not m["nodes"]:
        sys.exit(f"import: {a.file} has nothing to import as {fmt}")
    write(a.out, json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    inline = sum(isinstance(e, dict) for v in m["views"] for e in v.get("edges") or [])  # a sequence view's messages
    print(json.dumps({"out": a.out, "format": fmt, "cards": len(m["nodes"]), "lines": len(m["edges"]) + inline,
                      "views": [v["id"] for v in m["views"]], "unread": len(unread),
                      "notImported": [{"where": w, "message": msg} for w, msg in unread]}, indent=1))
def cmd_mcp(a):
    """A Model Context Protocol server over stdio for one model (#91): tools that read it, and tools that drive its page,
    served on 127.0.0.1. It lives in umlimator_mcp.py, next to this file."""
    if not Path(a.model).is_file():
        sys.exit(f"no model at {a.model}")
    import umlimator_mcp
    umlimator_mcp.serve(a.model, a.port)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render"); r.add_argument("model"); r.add_argument("--out", required=True)
    r.add_argument("--no-check", action="store_true"); r.set_defaults(f=cmd_render)
    s = sub.add_parser("stills"); s.add_argument("page"); s.add_argument("--out", required=True)
    s.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)"); s.add_argument("--scale", type=float, default=2.0); s.add_argument("--theme", default="light", choices=["light", "dark"])
    s.add_argument("--reader", action="store_true", help="reader copy: no CHECK tab, no drill-down pill (as stillsv.js)")
    s.add_argument("--all", action="store_true", help="export every view, even one whose inputs are unchanged since its last export")
    s.set_defaults(f=cmd_stills)
    pd = sub.add_parser("pdf", help="every view in one PDF, a document for a review: a cover with the contents, each view with its legend and tables, the rules")
    pd.add_argument("page"); pd.add_argument("--out", required=True)
    pd.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)"); pd.add_argument("--theme", default="light", choices=["light", "dark"])
    pd.add_argument("--paper", default="a4", choices=["a4", "letter"], help="the paper, across (default a4)"); pd.set_defaults(f=cmd_pdf)
    rc = sub.add_parser("record", help="a story as an animated PNG, a frame per step and frames along a step's tour"); rc.add_argument("page")
    rc.add_argument("--story", required=True); rc.add_argument("--out", required=True, help="a .png file")
    rc.add_argument("--size", default="1160x740", help="the window, WxH (up to 1180 wide the views list stays shut)"); rc.add_argument("--scale", type=float, default=1)
    rc.add_argument("--theme", default="light", choices=["light", "dark"]); rc.set_defaults(f=cmd_record)
    i = sub.add_parser("pin-icons", help="record each new brand mark's sha256 and move it out of icons/ into the cache"); i.set_defaults(f=cmd_pin_icons)
    c = sub.add_parser("check"); c.add_argument("page"); c.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)")
    c.add_argument("--timeout", type=int, default=600)
    c.add_argument("--expand", action="store_true", help="also check each view with each stacked card unfolded in place, one at a time (#71)")
    c.add_argument("--ignore", help="kinds left out of the report: right-to-left, crossings, labelOnLine, detours, nearNode, onMark, shortLine, roundEnd, labelOnBorder, labelNoRoom (comma list)")
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
    tr.add_argument("--view", required=True, help="the new view's id (one with that id is replaced)"); tr.add_argument("--out", required=True, help="the model with the view: a .json file")
    tr.add_argument("--match", help="JSON: {service name: card id}"); tr.add_argument("--title", help="the view's title (default: its id)")
    tr.set_defaults(f=cmd_trace)
    t = sub.add_parser("timelapse", help="the model's versions in git history on a slider"); t.add_argument("model"); t.add_argument("--out", required=True)
    t.add_argument("--limit", type=int, default=30, help="the latest N versions (default 30)"); t.set_defaults(f=cmd_timelapse)
    im = sub.add_parser("import", help="a Structurizr, C4-PlantUML or Mermaid diagram, or compose or Kubernetes JSON, as a model")
    im.add_argument("file"); im.add_argument("--out", required=True, help="the model, a .json file")
    im.add_argument("--format", choices=["structurizr", "plantuml", "mermaid", "compose", "kubernetes"], help="default: read from the content, then the extension")
    im.set_defaults(f=cmd_import)
    mc = sub.add_parser("mcp", help="a Model Context Protocol server over stdio: an AI assistant reads the model and drives its page")
    mc.add_argument("model"); mc.add_argument("--port", type=int, default=7391, help="the page's port on 127.0.0.1 (default 7391; another if it is taken)")
    mc.set_defaults(f=cmd_mcp)
    a = p.parse_args()
    if getattr(a, "page", None) and not Path(a.page).is_file():
        sys.exit(f"{a.cmd}: no page at {a.page}")
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))  # as Ctrl-C: temp files go, and the children run() started
    try:
        a.f(a)
    except ChromeError as e:  # Chrome missing, out of time or failing, in every command that runs it
        sys.exit(f"{a.cmd}: {e}")


if __name__ == "__main__":
    main()
