#!/usr/bin/env python3
"""The module in headless Chrome, imported as an ES module from a local HTTP server, as a host page would.

  python3 tests/embed.py

tests/embed.html: render() events, references, update(), destroy(), colours, badges, fonts.
tests/edit.html: editing gestures and the change events they emit.
examples/edit.html: the editing demo loads and draws.
Each test page reports in <pre id="result">{"ok": [...], "fail": [...]}</pre>.
"""
import functools, html, http.server, importlib.util, json, re, sys, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visual", ROOT / "engine" / "scripts" / "visual.py")
visual = importlib.util.module_from_spec(spec); spec.loader.exec_module(visual)
binary = visual.find_chrome() or sys.exit("tests/embed.py needs Google Chrome or Chromium")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_address[1]}/"


def dom(path, done):
    # reduced motion: navigation without animation frames, which headless virtual time does not run
    return visual.chrome(binary, "--window-size=1200,1200", "--virtual-time-budget=30000", "--force-prefers-reduced-motion",
                         "--dump-dom", base + path, done=done, timeout=90)


failed = False
for page in ("tests/embed.html", "tests/edit.html"):
    m = re.search(r'<pre id="result">(.*?)</pre>', dom(page, lambda t: 'id="result"' in t), re.S)
    if not m:
        print(f"FAIL {page}: the page did not report"); failed = True; continue
    r = json.loads(html.unescape(m.group(1)))
    for name in r["ok"]:
        print("ok  ", page, "·", name)
    for name in r["fail"]:
        print("FAIL", page, "·", name)
    failed |= bool(r["fail"])
demo = dom("examples/edit.html", lambda t: 'class="umlimator"' in t)
print(("ok  " if 'class="umlimator"' in demo else "FAIL"), "examples/edit.html · the editing demo draws its map")
failed |= 'class="umlimator"' not in demo
server.shutdown()
sys.exit(1 if failed else 0)
