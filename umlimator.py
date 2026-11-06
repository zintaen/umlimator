#!/usr/bin/env python3
"""umlimator: layered, animated architecture maps, built on super-board's /visual renderer (MIT).

  umlimator.py render MODEL.json --out PAGE.html [--no-check]   # interactive drill-down page (one self-contained file)
  umlimator.py stills PAGE.html --out DIR [--views a,b] [--scale 2] [--theme light|dark] [--reader]   # each view as DIR/<view>.svg and .png;
                                                       # --reader: no CHECK tab and no drill-down pill (pictures for documents)
  umlimator.py check PAGE.html [--views a,pic-*] [--ignore right-to-left] [--timeout 600]   # the layout check, on chosen views only

MODEL.json is the map model in engine/references/schema.md (nodes, edges, views), plus umlimator's `badge` field on a
node (PROPOSED, TARGET, OFF ...). `stills` needs Google Chrome or Chromium; the PNGs are what a document that cannot
run the page (a wiki such as Confluence) shows.
"""
import argparse, base64, hashlib, html, io, json, os, re, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE / "engine" / "scripts" / "visual.py"
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
    names = {n["icon"] for n in m.get("nodes", []) if n.get("icon")}
    names |= {o["icon"] for v in m.get("views", []) for o in (v.get("nodeOverrides") or {}).values() if o.get("icon")}
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
    if table:
        m["icons"] = table
    tmp = Path(model_path).with_name("." + Path(model_path).stem + ".icons.json")
    tmp.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    return str(tmp)


def cmd_render(a):
    if not Path(a.model).is_file():
        sys.exit(f"no model at {a.model}")
    model = page_model(a.model, a.out)
    try:
        render(a, model)
    finally:
        Path(model).unlink()


def render(a, model):
    args = [sys.executable, str(VISUAL), "render", "--map", model, "--out", a.out, "--no-open"]
    if a.no_check:
        args.append("--no-check")
    if all(v.get("layout") for v in json.loads(Path(model).read_text(encoding="utf-8")).get("views") or [{}]):
        args.append("--no-optimize")  # every view laid out already: the layout search would bake nothing (and stalls on a large page)
    r = subprocess.run(args, capture_output=True, text=True)
    out = r.stdout + r.stderr
    i = out.find("{")
    try:
        rep = json.loads(out[i:]) if i >= 0 else {}
    except json.JSONDecodeError:
        rep = {}
    chk = rep.get("check", {})
    print(json.dumps({"out": rep.get("out", a.out), "bytes": rep.get("bytes"), "counts": chk.get("counts"),
                      "problems": chk.get("overlaps", []), "errors": chk.get("errors", [])}, indent=1))
    if chk.get("errors"):  # a check that timed out or never reported is not a clean check
        sys.exit("check did not complete: " + "; ".join(chk["errors"]))
    if r.returncode not in (0, 2):
        sys.exit(out[-2000:])


def cmd_check(a):
    """The page's own layout check, limited to --views (a trailing * is a prefix) and with a longer wait than
    visual.py check, which gives up after 45 s on a large model."""
    url = Path(a.page).resolve().as_uri() + "#check=1&theme=light" + (f"&views={a.views}" if a.views else "")
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
             "nearNode": "passes within", "onMark": "touches the mark", "shortLine": "leaves its line"}
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


def cmd_stills(a):
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
    print(json.dumps(done, indent=1))
    print(f"{len(done)} still(s) exported, {len(skipped)} unchanged and skipped (--all exports every view)", file=sys.stderr)


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
    i = sub.add_parser("pin-icons", help="record each new brand mark's sha256 and move it out of icons/ into the cache"); i.set_defaults(f=cmd_pin_icons)
    c = sub.add_parser("check"); c.add_argument("page"); c.add_argument("--views", help="a,b,pic-* (a trailing * is a prefix)")
    c.add_argument("--timeout", type=int, default=600)
    c.add_argument("--ignore", help="kinds left out of the report: right-to-left, crossings, labelOnLine, detours, nearNode, onMark, shortLine (comma list)")
    c.set_defaults(f=cmd_check)
    a = p.parse_args(); a.f(a)


if __name__ == "__main__":
    main()
