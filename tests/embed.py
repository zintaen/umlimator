#!/usr/bin/env python3
"""The module in headless Chrome, imported as an ES module from a local HTTP server, as a host page would.

  python3 tests/embed.py

tests/embed.html: render() events, references, update(), destroy(), colours, badges, fonts.
tests/edit.html: editing gestures and the change events they emit.
tests/contrast.html: the default palette against WCAG AA, light and dark.
tests/rules.html: rules on the map (tests/rules.json breaks each kind), and umlimator.py check failing on them.
tests/marks.html: overlay(), highlight(), tour(), replay(), and the standalone page's paths and reach.
tests/change.html: update() easing into the next model, and diff()'s and drift()'s marks as drawn.
tests/unfold.html: unfolding a stacked card in place (#71): the handle, E and Alt + click, the expand event.
tests/unfold-page.html: the same in the standalone page (mountPage): its details button, E from the page.
tests/stories.html: play() and its caption bar, keys and events; the standalone page's Stories menu, story links and recording.
tests/page-handle.html: a page umlimator.py renders keeps its map's handle on window.umlimatorMap, and it drives the page.
examples/edit.html, embed.html, live.html, playground.html, ask.html, replay.html, timelapse.html, drift.html: the host pages load and draw.
Each test page reports in <pre id="result">{"ok": [...], "fail": [...]}</pre>.
"""
import functools, html, http.server, importlib.util, json, re, subprocess, sys, tempfile, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visual", ROOT / "engine" / "scripts" / "visual.py")
visual = importlib.util.module_from_spec(spec); spec.loader.exec_module(visual)
binary = visual.find_chrome() or sys.exit("tests/embed.py needs Google Chrome or Chromium")


released = threading.Event()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        # Headless virtual time does not stand still for real work (decoding an image, encoding a PNG): with nothing
        # else scheduled it runs out and Chrome saves the page early. A pending request does hold it, so a test page
        # keeps /__hold open around such work and ends it with /__release.
        if self.path in ("/__hold", "/__release"):
            if self.path == "/__hold":
                released.clear(); released.wait(20)
            else:
                released.set()
            self.send_response(204); self.end_headers(); return
        super().do_GET()


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 64  # a host page fetches its icons in parallel; the default backlog (5) drops connections on macOS


server = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_address[1]}/"


def dom(path, done, wait=60):
    # reduced motion: navigation without animation frames, which headless virtual time does not run. Chrome reads the
    # page once its virtual time is up, which on a busy machine can be before the page has drawn what a check reads (the
    # standalone page draws on an animation frame, in real time), or Chrome may give back nothing at all (a rare headless
    # hang on CI runners): read it again until done() holds, for up to `wait` s (#85)
    end = time.monotonic() + wait
    while True:
        t = visual.chrome(binary, "--window-size=1200,1200", "--virtual-time-budget=30000", "--force-prefers-reduced-motion",
                          "--dump-dom", base + path, done=done, timeout=90)
        if done(t) or time.monotonic() > end:
            return t


failed = False
for page in ("tests/embed.html", "tests/edit.html", "tests/contrast.html", "tests/rules.html", "tests/marks.html", "tests/change.html", "tests/unfold.html", "tests/unfold-page.html", "tests/stories.html", "tests/page-handle.html"):
    t = dom(page, lambda t: 'id="result"' in t)
    m = re.search(r'<pre id="result">(.*?)</pre>', t, re.S)
    if not m:  # each check names itself in the page title: say where it stopped
        last = re.search(r"<title>(.*?)</title>", t)
        print(f"FAIL {page}: the page did not report (last check reached: {html.unescape(last.group(1)) if last else '?'})"); failed = True; continue
    r = json.loads(html.unescape(m.group(1)))
    for name in r["ok"]:
        print("ok  ", page, "·", name)
    for name in r["fail"]:
        print("FAIL", page, "·", name)
    failed |= bool(r["fail"])
for page, what in (("examples/edit.html", "the editing demo"), ("examples/embed.html", "the host page"), ("examples/live.html", "the live page"),
                   ("examples/playground.html", "the playground"), ("examples/ask.html", "the ask-the-map page"), ("examples/replay.html", "the trace replay page"), ("examples/timelapse.html", "the time-lapse"), ("examples/drift.html", "the drift page")):
    demo = dom(page, lambda t: 'class="umlimator"' in t)
    print(("ok  " if 'class="umlimator"' in demo else "FAIL"), f"{page} · {what} draws its map")
    failed |= 'class="umlimator"' not in demo
# the standalone page (mountPage) shows a legend, so it still names line kinds from label words: "reads metrics" is state
page = dom("examples/bookshop.html", lambda t: 'class="lgi"' in t)
legend = "<b>calls</b>" in page and "<b>state</b>" in page
print(("ok  " if legend else "FAIL"), "examples/bookshop.html · the standalone page's legend names the kinds it reads from labels (calls, state)")
failed |= not legend
# the layout check of a page umlimator.py renders: a view that keeps A→B and B→A apart (keepPairs) draws the return line
# right to left, as it should; the check does not count it against the view
with tempfile.TemporaryDirectory() as tmp:
    pairs = {"nodes": [{"id": "app", "label": "App", "kind": "frontend"}, {"id": "api", "label": "API", "kind": "backend"}, {"id": "db", "label": "Store", "kind": "database"}],
             "edges": [{"from": "app", "to": "api", "label": "asks"}, {"from": "api", "to": "app", "label": "pushes"}, {"from": "api", "to": "db", "label": "writes"}],
             "views": [{"id": "v", "keepPairs": True, "nodeIds": ["app", "api", "db"], "layout": {"app": [0, 0], "api": [1, 0], "db": [2, 0]}}]}
    (Path(tmp) / "pairs.json").write_text(json.dumps(pairs))
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(Path(tmp) / "pairs.json"), "--out", str(Path(tmp) / "pairs.html")], capture_output=True, text=True)
    i = r.stdout.find("{"); rep = json.loads(r.stdout[i:]) if i >= 0 else {}
    pairs_ok = r.returncode == 0 and rep.get("counts") is not None and not any("right-to-left" in p for p in rep.get("problems", []))
print(("ok  " if pairs_ok else "FAIL"), "umlimator.py render · keepPairs: the layout check does not flag a pair's return line as running right to left",
      "" if pairs_ok else rep.get("problems") or r.stderr[-400:])
failed |= not pairs_ok
# a model's rules (#70): the check names each rule the page's model breaks, counts them, and fails
with tempfile.TemporaryDirectory() as tmp:
    page = Path(tmp) / "rules.html"
    subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(ROOT / "tests" / "rules.json"), "--out", str(page), "--no-check"], capture_output=True)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "check", str(page)], capture_output=True, text=True)
    i = r.stdout.find("{"); rep = json.loads(r.stdout[i:]) if i >= 0 else {}
    broken = [p for p in rep.get("problems", []) if ' breaks rule "' in p]
    rules_ok = r.returncode == 1 and (rep.get("counts") or {}).get("rules") == 3 and len(broken) == 3 and "3 broken rules" in r.stderr
print(("ok  " if rules_ok else "FAIL"), "umlimator.py check · the rules a model breaks: each named and counted, and the check fails",
      "" if rules_ok else (rep.get("problems"), r.stderr[-400:]))
failed |= not rules_ok

# umlimator.py record (#69): bike-share's story as an animated PNG, a frame per step, shown for the step's duration; a step
# that plays a tour has 2 to 6 frames, each a different picture (the dot rides), which share the step's duration (#83)
with tempfile.TemporaryDirectory() as tmp:
    page, png = Path(tmp) / "bike-share.html", Path(tmp) / "ride.png"
    subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(ROOT / "examples" / "bike-share.json"), "--out", str(page), "--no-check"], capture_output=True)
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "record", str(page), "--story", "ride", "--out", str(png)], capture_output=True, text=True)
    b, chunks, i = png.read_bytes() if png.is_file() else b"", [], 8
    while i + 8 <= len(b):
        n = int.from_bytes(b[i:i + 4], "big"); chunks.append((b[i + 4:i + 8], b[i + 8:i + 8 + n])); i += 12 + n
    frames = []  # [delay, image data]: fcTL is sequence, size, offset, then the delay; fdAT is a sequence, then the data
    for t, d in chunks:
        if t == b"fcTL":
            frames.append([int.from_bytes(d[20:22], "big"), b""])
        elif t in (b"IDAT", b"fdAT") and frames:
            frames[-1][1] += d if t == b"IDAT" else d[4:]
    k, steps_ok = 0, []
    for s in json.loads((ROOT / "examples" / "bike-share.json").read_text())["stories"][0]["steps"]:
        mine, ms = [], s.get("duration") or 4000
        while k < len(frames) and sum(d for d, _ in mine) < ms:
            mine.append(frames[k]); k += 1
        steps_ok.append(sum(d for d, _ in mine) == ms and (1 < len(mine) <= 6 and len({f for _, f in mine}) == len(mine) if s.get("tour") else len(mine) == 1))
    rec_ok = r.returncode == 0 and b[:8] == b"\x89PNG\r\n\x1a\n" and [t for t, _ in chunks].count(b"acTL") == 1 and all(steps_ok) and k == len(frames)
print(("ok  " if rec_ok else "FAIL"), "umlimator.py record · a story as an animated PNG: a frame per step, frames along a step's tour (the dot rides), each step for its duration",
      "" if rec_ok else [[d for d, _ in frames], steps_ok, r.stderr[-400:]])
failed |= not rec_ok
server.shutdown()
sys.exit(1 if failed else 0)
