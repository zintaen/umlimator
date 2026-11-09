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
  umlimator.py timelapse MODEL.json --out PAGE.html [--limit 20]   # the model's versions in git history, on a slider
  umlimator.py record PAGE.html --story ID --out STORY.png [--size 1160x740] [--scale 1] [--theme light|dark]   # a story as an animated PNG
  umlimator.py pdf PAGE.html --out MAP.pdf [--views a,b] [--theme light|dark]   # one PDF: a title page, each view with its text, legend, rules

MODEL.json is the map model in engine/references/schema.md (nodes, edges, views), plus umlimator's `badge` field on a
node (PROPOSED, TARGET, OFF ...). `stills` needs Google Chrome or Chromium; the PNGs are what a document that cannot
run the page (a wiki such as Confluence) shows. `diff` and `drift` run the module's own diff() and drift() in Node.
"""
import argparse, base64, hashlib, html, io, json, os, re, shutil, struct, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile, zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE / "engine" / "scripts" / "visual.py"
LIB = HERE / "lib" / "umlimator.js"            # the module: layout, routing, drawing, render(), mountPage()
THEME = HERE / "lib" / "umlimator-theme.css"   # its default palette and fonts (--um-* variables)
PAGE = HERE / "engine" / "assets" / "template.html"  # the page around it; visual.py fills in the model


def visual_cmd(tmp, *args):
    """The command that runs visual.py (unmodified, super-board's) on the page with lib/umlimator.js inlined: one
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
    d["nodes"] = [*d.get("nodes", []), *({"id": b} for b in sorted(boxes - ids))]
    return d
CHROMES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
           "/Applications/Chromium.app/Contents/MacOS/Chromium", "google-chrome", "chromium", "chromium-browser"]


def chrome():
    for c in CHROMES:
        if Path(c).exists() or shutil.which(c):
            return c
    sys.exit("stills needs Google Chrome or Chromium")


def headless(binary, *args, timeout=90):
    with tempfile.TemporaryDirectory() as prof:
        r = subprocess.run([binary, "--headless", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                            "--no-first-run", "--no-default-browser-check", *args],
                           capture_output=True, text=True, timeout=timeout)
    return r.stdout


ICONS = HERE / "icons"  # Lucide line icons (ISC) and manifest.json: every icon's source, and a sha256 for each brand mark
CACHE = Path(os.environ.get("UMLIMATOR_ICON_CACHE", Path.home() / ".cache" / "umlimator" / "icons"))  # brand marks


def icon_bytes(e):
    """An icon's file: Lucide icons ship in icons/; a brand mark is not redistributed with umlimator, so it is read from
    the cache, fetched once from its official source (manifest `url`; `zip#member` reads one file from a package) and
    used only when its sha256 matches the manifest, so a picture never changes because a source did. None if it cannot
    be had."""
    local = ICONS / e["file"]
    if local.is_file():
        return local.read_bytes()
    cached = CACHE / e["file"]
    if not cached.is_file():
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
        cached.write_bytes(data)
    return cached.read_bytes()


def cmd_pin_icons(a):
    """After tools/fetch_icons.py added a brand mark to icons/: record its sha256 and move it into the cache, so the
    repository never carries a brand's file."""
    man = json.loads((ICONS / "manifest.json").read_text())
    for name, e in man.items():
        f = ICONS / e["file"]
        if e["source"] == "lucide" or not f.is_file():
            continue
        e["sha256"] = hashlib.sha256(f.read_bytes()).hexdigest()
        CACHE.mkdir(parents=True, exist_ok=True)
        shutil.move(str(f), CACHE / e["file"])
        print(f"pinned {name} ({e['source']}) -> {CACHE / e['file']}")
    for dark in ICONS.glob("*_dark.*"):  # dark variants are for stack-diagram's group labels; umlimator has none
        dark.unlink()
    (ICONS / "manifest.json").write_text(json.dumps(man, indent=2) + "\n")


def page_model(model_path, out):
    """The model as rendered: with an `icons` table of every icon its nodes name (`icon`): a Lucide line icon as its
    inner markup, drawn in the card's kind colour; a brand mark as a data URI on a white tile, never recoloured.
    Returns the path of a temporary copy next to the model, so relative paths still resolve."""
    m = json.loads(Path(model_path).read_text(encoding="utf-8"))
    # visual.py records the checkout's root relative to the page; for a page outside the checkout that path climbs
    # through the folders above it (a home folder, a user name) into a page that gets shared
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    if not Path(out).resolve().is_relative_to(Path(root or os.getcwd()).resolve()):
        m.setdefault("meta", {}).setdefault("root", "")
    table = icon_table([m])
    if table:
        m["icons"] = table
    tmp = Path(model_path).with_name("." + Path(model_path).stem + ".icons.json")
    tmp.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    return str(tmp)


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


def js(fn, *args):
    """One of the module's pure functions (diff, drift) run in Node, so the CLI and the module share one implementation."""
    node = shutil.which("node") or sys.exit(f"{fn} needs Node.js 18 or later: it runs the module's own {fn}()")
    code = (f"import * as u from {json.dumps(LIB.as_uri())}; let s = ''; for await (const c of process.stdin) s += c;"
            f"process.stdout.write(JSON.stringify(u[{json.dumps(fn)}](...JSON.parse(s))));")
    r = subprocess.run([node, "--input-type=module", "-e", code], input=json.dumps(args), capture_output=True, text=True)
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
        Path(model).unlink()


def render(a, model, show=print):
    args = ["render", "--map", model, "--out", a.out, "--no-open"]
    if a.no_check:
        args.append("--no-check")
    if all(v.get("layout") for v in json.loads(Path(model).read_text(encoding="utf-8")).get("views") or [{}]):
        args.append("--no-optimize")  # every view laid out already: the layout search would bake nothing (and stalls on a large page)
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run(visual_cmd(tmp, *args), capture_output=True, text=True)
    out = r.stdout + r.stderr
    i = out.find("{")
    try:
        rep = json.loads(out[i:]) if i >= 0 else {}
    except json.JSONDecodeError:
        rep = {}
    chk = rep.get("check", {})
    said = {"out": rep.get("out", a.out), "bytes": rep.get("bytes"), "counts": chk.get("counts"),
            "problems": chk.get("overlaps", []), "errors": chk.get("errors", [])}
    show(json.dumps(said, indent=1))
    if chk.get("errors"):  # a check that timed out or never reported is not a clean check
        sys.exit("check did not complete: " + "; ".join(chk["errors"]))
    if r.returncode not in (0, 2):
        sys.exit(out[-2000:])
    return said


def quiet(*a, **k):
    pass


def render_model(m, near, out):
    """A model made here (a diff, a drift) as a page, without its layout check: a copy sits next to the file `near` for
    the render, so it is drawn as that file would be."""
    tmp = Path(near).with_name("." + Path(near).stem + ".change.json")
    tmp.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    try:
        model = page_model(tmp, out)
        try:
            return render(argparse.Namespace(out=str(out), no_check=True), model, show=quiet)
        finally:
            Path(model).unlink()
    finally:
        tmp.unlink()


def shots(page, out, views):
    """Stills of these views, for a document (no CHECK tab or drill-down pill): their PNG paths."""
    if not (out and views):
        return []
    a = argparse.Namespace(page=str(page), out=str(out), views=",".join(views), scale=2.0, theme="light", reader=True, all=True)
    return [s["png"] for s in cmd_stills(a, show=quiet)]


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


def diff_page(before, after, near, out, stills=None):
    d = js("diff", before, after)
    m = d["model"]
    m["title"] = f"{m.get('title') or Path(near).stem}: what changed"
    rep = render_model(m, near, out)
    return {"out": rep["out"], "summary": d["summary"], "views": d["views"], "stills": shots(out, stills, d["views"]), "model": m}


def diff_since(a):
    git = lambda *x: subprocess.run(["git", *x], capture_output=True, text=True)
    changed = git("diff", "--name-only", "-z", "--no-renames", a.base, "--", *(a.models or ["*.json"]))
    if changed.returncode:
        sys.exit(changed.stderr.strip())
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    load = lambda t: (lambda m: m if isinstance(m, dict) and isinstance(m.get("nodes"), list) and isinstance(m.get("views"), list) else None)(json.loads(t))
    done, md = [], ["<!-- umlimator-diff -->", "### Map changes", ""]
    for name in filter(None, changed.stdout.split("\0")):
        old = git("show", f"{a.base}:{name}")
        try:
            before = load(old.stdout) if old.returncode == 0 else None
            after = load(Path(name).read_text(encoding="utf-8")) if Path(name).is_file() else None
        except json.JSONDecodeError:
            continue
        if not (before or after):
            continue  # JSON, but not a map model
        stem = name.replace("/", "-")[:-5] if name.endswith(".json") else name.replace("/", "-")
        r = diff_page(before, after, name if after else out / f"{stem}.json", out / f"{stem}.html", out / stem)
        if not r["summary"]:
            continue
        done.append({"file": name, **{k: v for k, v in r.items() if k != "model"}})
        md += [f"**`{name}`**: " + ", ".join(r["views"]) if r["views"] else f"**`{name}`**", ""]
        md += [f"- {s}" for s in r["summary"]] + [""] + sketch(r["model"]) + [""]
    if not done:
        md += ["No map model changed."]
    (out / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
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
    print(json.dumps({"out": rep["out"], "counts": r["counts"], "views": r["views"], "stills": shots(a.out, a.stills, r["views"])}, indent=1))


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
    Path(a.out).write_text(page, encoding="utf-8")
    print(json.dumps({"out": a.out, "versions": [v["label"] for v in versions]}, indent=1))


def cmd_check(a):
    """The page's own layout check, limited to --views (a trailing * is a prefix) and with a longer wait than
    visual.py check, which gives up after 45 s on a large model."""
    url = Path(a.page).resolve().as_uri() + "#check=1&theme=light" + (f"&views={a.views}" if a.views else "") + ("&expand=1" if a.expand else "")
    try:
        dom = headless(chrome(), "--virtual-time-budget=6000", "--window-size=1440,900", "--dump-dom", url, timeout=a.timeout)
    except subprocess.TimeoutExpired:
        sys.exit(f"check did not complete in {a.timeout} s")
    m = re.search(r'<pre id="visual-check"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        sys.exit("check did not complete: the page did not report")
    rep = json.loads(html.unescape(m.group(1)))
    ov = rep.get("overlaps", [])
    kinds = {"crossings": " cross", "labelOnLine": " lies on edge ", "rightToLeft": "right-to-left", "detours": "detour",
             "nearNode": "passes within", "onMark": "touches the mark", "shortLine": "leaves its line", "rules": ' breaks rule "'}
    counts = {k: sum(t in o for o in ov) for k, t in kinds.items()}
    counts["other"] = len(ov) - sum(counts.values())
    # --ignore drops whole kinds from the report (pictures that keep a source drawing's own direction run lines right to left)
    asked = [k for k in (a.ignore or "").replace("right-to-left", "rightToLeft").split(",") if k]
    if bad := [k for k in asked if k not in kinds]:
        sys.exit(f"--ignore: unknown kind {', '.join(bad)}; known: right-to-left, {', '.join(k for k in kinds if k != 'rightToLeft')}")
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


def still_keys(page, opts):
    """A key per view over everything its still is drawn from: the view, its cards, every line between them, the icons
    they use, the size of each card's inner view (the ⤢ pill), the engine code and the export options. A view whose
    key is unchanged since its last export draws the same still."""
    t = Path(page).read_text(encoding="utf-8")
    m = DATA.search(t)
    data = json.loads(m.group(1))
    engine = hashlib.sha256((t[:m.start()] + t[m.end():]).encode()).hexdigest()
    views = data.get("views") or []
    V, N = {v["id"]: v for v in views}, {n["id"]: n for n in data.get("nodes", [])}
    icons = data.get("icons") or {}
    keys = {}
    for v in views:
        ids = set(v.get("nodeIds") or [])
        nodes = [N.get(i) for i in sorted(ids)]
        lines = [e for e in data.get("edges", []) if e.get("from") in ids and e.get("to") in ids]
        kids = {i: len((V.get((N.get(i) or {}).get("opensView") or i) or {}).get("nodeIds") or []) for i in sorted(ids)}
        used = ({n.get("icon") for n in nodes if n} | {o.get("icon") for o in (v.get("nodeOverrides") or {}).values()}) - {None}
        blob = json.dumps([v, nodes, lines, kids, {k: icons[k] for k in sorted(used) if k in icons}, engine, opts], sort_keys=True)
        keys[v["id"]] = hashlib.sha256(blob.encode()).hexdigest()
    return keys


def cmd_stills(a, show=print):
    b = chrome()
    page = Path(a.page).resolve()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    views = a.views.split(",") if a.views else views_of(page)
    keys = still_keys(page, [a.scale, a.theme, a.reader])
    record = out / ".stills.json"  # each view's key at its last export
    seen = json.loads(record.read_text()) if record.is_file() and not a.all else {}
    done, skipped = [], []
    for v in views:
        if seen.get(v) == keys.get(v) and (out / f"{v}.png").is_file() and (out / f"{v}.svg").is_file():
            skipped.append(v); continue
        try:
            dom = headless(b, "--virtual-time-budget=20000", "--dump-dom", f"{page.as_uri()}#still={v}&scale={a.scale}&theme={a.theme}" + ("&reader=1" if a.reader else ""))
        except subprocess.TimeoutExpired:
            print(f"{v}: no still (Chrome did not finish in 90 s)"); continue
        meta = re.search(r'data-still="([^"]+)"', dom)
        svg = re.search(r'<div id="still">(<svg.*?</svg>)</div>', dom, re.S)
        if not (meta and svg):
            print(f"{v}: no still (view missing or page error)"); continue
        info = json.loads(html.unescape(meta.group(1)))
        (out / f"{v}.svg").write_text(svg.group(1), encoding="utf-8")
        with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
            f.write("<!doctype html><meta charset=utf-8><body style='margin:0'>" + svg.group(1))
        png = out / f"{v}.png"
        try:
            headless(b, f"--window-size={info['w']},{info['h']}", f"--screenshot={png}", Path(f.name).as_uri())
        except subprocess.TimeoutExpired:
            print(f"{v}: no PNG (Chrome did not finish in 90 s)"); continue
        finally:
            Path(f.name).unlink()
        done.append({"view": v, "w": info["w"], "h": info["h"], "png": str(png)})
        seen[v] = keys.get(v)
        record.write_text(json.dumps(seen, indent=1, sort_keys=True))
    show(json.dumps(done, indent=1))
    show(f"{len(done)} still(s) exported, {len(skipped)} unchanged and skipped (--all exports every view)", file=sys.stderr)
    return done


def cmd_pdf(a):
    """The map as one PDF (#93), printed by headless Chrome itself (--print-to-pdf, its Page.printToPDF): the page lays
    the document out (#pdf=1, a reader copy) and Chrome prints it. A title page; each view (--views, else every one) as a
    vector picture with its describe() text; the legend; the model's rules, each holding or broken."""
    out = Path(a.out).resolve()
    out.unlink(missing_ok=True)
    url = Path(a.page).resolve().as_uri() + f"#pdf=1&reader=1&theme={a.theme}" + (f"&views={a.views}" if a.views else "")
    try:  # no header or footer: Chrome's would print the page's file path (the older flag too, for an older Chrome)
        headless(chrome(), "--virtual-time-budget=20000", "--no-pdf-header-footer", "--print-to-pdf-no-header", f"--print-to-pdf={out}", url, timeout=600)
    except subprocess.TimeoutExpired:
        sys.exit("pdf: Chrome did not finish in 600 s")
    pages = len(re.findall(rb"/Type\s*/Page\b", out.read_bytes())) if out.is_file() else 0
    if pages < 3:  # the title page, a view, the legend; a page from before 0.13.0 has no #pdf and prints as one screen
        sys.exit(f"pdf: no view printed ({pages} page(s)): no view with cards matches --views, or the page is older than"
                 " umlimator 0.13.0 (render it again)")
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
    Path(out).write_bytes(b"".join(parts))


def cmd_record(a):
    """A story (#69) as an animated PNG: the page opened at each step in headless Chrome (#story=<id>&step=<n>, drawn at
    once, and with reduced motion: CSS transitions do not finish in a headless screenshot), one frame per step, shown for
    the step's duration."""
    # ponytail: a frame per step, so a step's tour does not move in the picture; frames along the tour if that matters
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
        frames = []
        for n in range(1, len(story["steps"]) + 1):
            png = Path(tmp) / f"{n:03}.png"
            headless(b, "--virtual-time-budget=8000", "--force-prefers-reduced-motion", f"--window-size={w},{h}", f"--force-device-scale-factor={a.scale}", f"--screenshot={png}",
                     f"{page.as_uri()}#shot=1&theme={a.theme}&story={urllib.parse.quote(a.story)}&step={n}")
            if not png.is_file():
                sys.exit(f"record: Chrome drew no picture of step {n}")
            frames.append(png)
        apng(frames, [s.get("duration") or 4000 for s in story["steps"]], a.out)
    print(json.dumps({"story": a.story, "frames": len(frames), "out": a.out, "bytes": Path(a.out).stat().st_size}, indent=1))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("render"); r.add_argument("model"); r.add_argument("--out", required=True)
    r.add_argument("--no-check", action="store_true"); r.set_defaults(f=cmd_render)
    s = sub.add_parser("stills"); s.add_argument("page"); s.add_argument("--out", required=True)
    s.add_argument("--views"); s.add_argument("--scale", type=float, default=2); s.add_argument("--theme", default="light", choices=["light", "dark"])
    s.add_argument("--reader", action="store_true", help="reader copy: no CHECK tab, no drill-down pill (as stillsv.js)")
    s.add_argument("--all", action="store_true", help="export every view, even one whose inputs are unchanged since its last export")
    s.set_defaults(f=cmd_stills)
    pd = sub.add_parser("pdf", help="every view in one PDF, with its text, the legend and the rules"); pd.add_argument("page"); pd.add_argument("--out", required=True)
    pd.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)"); pd.add_argument("--theme", default="light", choices=["light", "dark"]); pd.set_defaults(f=cmd_pdf)
    rc = sub.add_parser("record", help="a story as an animated PNG, a frame per step"); rc.add_argument("page")
    rc.add_argument("--story", required=True); rc.add_argument("--out", required=True, help="a .png file")
    rc.add_argument("--size", default="1160x740", help="the window, WxH (up to 1180 wide the views list stays shut)"); rc.add_argument("--scale", type=float, default=1)
    rc.add_argument("--theme", default="light", choices=["light", "dark"]); rc.set_defaults(f=cmd_record)
    i = sub.add_parser("pin-icons", help="record each new brand mark's sha256 and move it out of icons/ into the cache"); i.set_defaults(f=cmd_pin_icons)
    c = sub.add_parser("check"); c.add_argument("page"); c.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)")
    c.add_argument("--timeout", type=int, default=600)
    c.add_argument("--expand", action="store_true", help="also check each view with each stacked card unfolded in place, one at a time (#71)")
    c.add_argument("--ignore", help="kinds left out of the report: right-to-left, crossings, labelOnLine, detours, nearNode, onMark, shortLine (comma list)")
    c.set_defaults(f=cmd_check)
    d = sub.add_parser("diff", help="what changed between two models, or in every model changed since a git ref (--base)")
    d.add_argument("files", nargs="*", metavar="BEFORE.json AFTER.json"); d.add_argument("--out", required=True, help="the page (with --base: a folder)")
    d.add_argument("--stills", help="a folder for stills of the views that show a change"); d.add_argument("--base", help="a git ref: diff the working tree's models against it")
    d.add_argument("--models", nargs="*", help="with --base, git pathspecs of the model files (default: every .json that is a map model)")
    d.set_defaults(f=cmd_diff)
    dr = sub.add_parser("drift", help="the map against the traffic seen"); dr.add_argument("model"); dr.add_argument("observed")
    dr.add_argument("--out", required=True); dr.add_argument("--match", help="JSON: {service name: card id}"); dr.add_argument("--stills")
    dr.set_defaults(f=cmd_drift)
    t = sub.add_parser("timelapse", help="the model's versions in git history on a slider"); t.add_argument("model"); t.add_argument("--out", required=True)
    t.add_argument("--limit", type=int, default=30, help="the latest N versions (default 30)"); t.set_defaults(f=cmd_timelapse)
    a = p.parse_args(); a.f(a)


if __name__ == "__main__":
    main()
