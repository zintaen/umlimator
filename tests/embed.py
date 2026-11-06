#!/usr/bin/env python3
"""render() embedded in a plain page, in headless Chrome: events, references, update() and destroy().

  python3 tests/embed.py
"""
import html, importlib.util, json, re, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visual", ROOT / "engine" / "scripts" / "visual.py")
visual = importlib.util.module_from_spec(spec); spec.loader.exec_module(visual)

page = (ROOT / "tests" / "embed.html").read_text(encoding="utf-8")
page = page.replace("/*__UMLIMATOR_LIB__*/", (ROOT / "lib" / "umlimator.js").read_text(encoding="utf-8"), 1)
page = page.replace("/*__MODEL__*/null", (ROOT / "examples" / "bookshop.json").read_text(encoding="utf-8"), 1)
binary = visual.find_chrome() or sys.exit("tests/embed.py needs Google Chrome or Chromium")
with tempfile.TemporaryDirectory() as tmp:
    f = Path(tmp) / "embed.html"
    f.write_text(page, encoding="utf-8")
    dom = visual.chrome(binary, "--window-size=1200,1200", "--virtual-time-budget=20000", "--force-prefers-reduced-motion", "--dump-dom", f.as_uri(), done=lambda t: 'id="result"' in t, timeout=60)
m = re.search(r'<pre id="result">(.*?)</pre>', dom, re.S)
if not m:
    sys.exit("embed test: the page did not report")
r = json.loads(html.unescape(m.group(1)))
for name in r["ok"]:
    print("ok  ", name)
for name in r["fail"]:
    print("FAIL", name)
sys.exit(1 if r["fail"] else 0)
