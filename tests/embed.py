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
tests/insight.html: lenses on a map and in the page (#94), the page's slowest path and what-if (#95), a trace's numbered view (#96).
tests/page-handle.html: a page umlimator.py renders keeps its map's handle on window.umlimatorMap, and it drives the page.
tests/element.html: <umlimator-map> (#92): src and inline models, attributes, events, drawing again, destroy, a docs block.
tests/pieces.html: the standalone page's pieces in render() (#99): views list, legend, hint line, details panel, alone and together.
tests/state.html: the map's state machines (0.14.0): truthful setView(), lifecycle, selection and focus across a new picture, gestures, marks per view.
tests/motion.html, with motion on (no --force-prefers-reduced-motion): a press, a second setView(), update() or destroy() during a move, a selection mid-ease.
tests/page-state.html: the standalone page's state (0.14.0): its keys, the link it keeps, stories in the history, the details panel, menus, #still and check.
tests/page-motion.html, with motion on: the page's history through moves: Back and Forward, a story's steps on other views, the reader's own move.
tests/shapes.html: card shapes (0.15.0; one style since 0.21.0): each shape, ports on outlines, a card's own shape, a stale shapes field, option, attribute or link that changes nothing, exports, legend.
tests/aids.html: the reading aids (0.15.0): a box's tone, a step on a line in any view, --um-tint; light and dark, the minimap and the SVG.
tests/typed-edit.html: editing a typed view (1.7): each gesture's edit event, by pointer and keyboard, applied with apply(); the panels; none of it read-only.
tests/notation.html: notation (1.5): a classifier, every line end and end labels from svgOf, in both themes and three fonts: text in its face, ends on outlines.
tests/class.html: the class diagram (1.9): examples/sales-classes.json drawn in both themes and three fonts, edited as text and by the picker through apply(), an edit to paint on 40 classes; the fixtures tests/class-minimal.json and
  tests/class-stress.json in both themes and three fonts, an edit to paint on the stress fixture.
tests/package.html: the package diagram (2.2): examples/bookshop-packages.json as stage 2 made it (6.7's profile and «apply» line taken out) in both themes, three fonts and both directions (boxes hold exactly their contents, titles, ends, names, contrast,
  legend), a closed package, and each gesture by pointer and keyboard (palette, import by the picker, visibility, Owner, a drop into a box, a box's name, hide, delete).
tests/object.html: the object diagram (2.3): examples/order-objects.json in both themes, three fonts and both directions (underlined heads, slot rows, names, roles,
  contrast, legend), an instance in a box, and each gesture by pointer and keyboard (palette, name, classifier, a slot as text, link, roles, Owner, drop, pin, hide, delete).
tests/package-object.html: the package and object fixtures (2.6): tests/package-*.json and tests/object-*.json, every view in both themes, three fonts and both
  directions: no overlap, text inside, no line through an element, a tab or along a box's border, ends on outlines and borders, roles clear, boxes hold their own.
tests/class-editor.html: examples/class-editor.html, the class diagram editor, in a frame: an edit applied by the host, undone and redone, one refused.
tests/type-hooks.html: a type's definition on the canvas (the sequence spike's §1): a line's props, edits.connect, layout.run, draw's layers.
tests/timeaxis.html: the time-axis layout and its shapes (3.2): each T case in both themes and three fonts, laid out clean; hit areas on stems, messages, loops, guards, frames and uses.
tests/sequence.html: the sequence type (3.3): examples/checkout-sequence.json in both themes and three fonts, laid out clean and named; its reading order; a click on an arrowhead or a loop selects the message; a message by L and by the handle through edits.connect.
tests/sequence-fixtures.html: the sequence fixtures (3.8): tests/sequence-*.json, every view in both themes and three fonts, laid out clean, named, contrast.
tests/communication.html: the communication diagram (3.5): examples/checkout-communication.json and the fixtures (tests/communication-*.json) in both themes and three fonts, laid out clean, named, in reading order; its gestures by pointer and keyboard on 3.4's canvas, through apply().
tests/profile.html, tests/timing.html, tests/stage6.html: stage 6's pages (notes/stage-6.md 6.0), placeholders that report ok
  until 6.3 (profile), 6.5 (timing) and 6.6 (the fixtures) fill them.
tests/component.html: the component diagram (5.4): docs/diagrams/examples/05-component.json in both themes, three fonts and both directions (ports on borders, line ends on ports,
  ball and socket, names, reading order, contrast, legend), and each gesture by pointer and keyboard through apply().
tests/core-diet.html: the markup render() draws from lib/umlimator.js (three version-2 examples) and lib/umlimator-all.js (the class example), as main drew it before src/typed/ left the core (0.18.0).
examples/edit.html, embed.html, live.html, playground.html, ask.html, replay.html, timelapse.html, drift.html, element.html, notations.html: the host pages load and draw.
Each test page reports in <pre id="result">{"ok": [...], "fail": [...]}</pre>.
"""
import functools, html, html.parser, http.server, importlib.util, json, re, subprocess, sys, tempfile, threading, time
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


def dom(path, done, wait=60, motion=False):
    # reduced motion: navigation without animation frames, which headless virtual time does not run. Chrome reads the
    # page once its virtual time is up, which on a busy machine can be before the page has drawn what a check reads (the
    # standalone page draws on an animation frame, in real time), or Chrome may give back nothing at all (a rare headless
    # hang on CI runners): read it again until done() holds, for up to `wait` s (#85). motion: the motion pass, whose pages
    # run their animation frames on timers, which virtual time runs. Under load they need more of it: with 30 s of virtual
    # time tests/motion.html stopped before it reported in 5 of 9 CI runs and in 2 of 4 runs on a loaded laptop, and with
    # 120 s it reported in 16 of 16 loaded runs. Virtual time ends when the page has reported, so a bigger budget costs
    # nothing then
    end = time.monotonic() + wait
    while True:
        t = visual.chrome(binary, "--window-size=1200,1200", f"--virtual-time-budget={120000 if motion else 30000}", *([] if motion else ["--force-prefers-reduced-motion"]),
                          "--dump-dom", base + path, done=done, timeout=90)
        if done(t) or time.monotonic() > end:
            return t


failed = False
# the motion pass: tests/motion.html runs with motion on, so a bug in what animates can't hide behind reduced motion
for page, motion in [(p, False) for p in ("tests/embed.html", "tests/edit.html", "tests/typed-edit.html", "tests/contrast.html", "tests/rules.html", "tests/marks.html", "tests/change.html", "tests/unfold.html", "tests/unfold-page.html", "tests/stories.html", "tests/insight.html", "tests/page-handle.html", "tests/element.html", "tests/pieces.html", "tests/state.html", "tests/page-state.html", "tests/shapes.html", "tests/aids.html", "tests/notation.html", "tests/class.html", "tests/class-editor.html", "tests/package.html", "tests/object.html", "tests/package-object.html", "tests/type-hooks.html", "tests/core-diet.html", "tests/timeaxis.html", "tests/sequence.html", "tests/sequence-fixtures.html", "tests/communication.html", "tests/flow.html", "tests/stage5.html", "tests/composite.html", "tests/deployment.html", "tests/typed-ports.html", "tests/structure.html", "tests/stage4.html", "tests/state-machine.html", "tests/overview.html", "tests/activity.html", "tests/usecase.html", "tests/component.html", "tests/profile.html", "tests/timing.html", "tests/stage6.html")] + [("tests/motion.html", True), ("tests/page-motion.html", True)]:
    t = dom(page, lambda t: 'id="result"' in t, motion=motion)
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
demo = dom("examples/element.html", lambda t: "Drawn: " in t)  # the map is in the element's shadow root: the page says when it is drawn
print(("ok  " if "Drawn: " in demo else "FAIL"), "examples/element.html · the element page draws its map")
failed |= "Drawn: " not in demo
demo = dom("examples/notations.html", lambda t: "Drawn: 2 maps" in t)  # two elements, light and dark: the page says when both have drawn
print(("ok  " if "Drawn: 2 maps" in demo else "FAIL"), "examples/notations.html · the card shapes gallery draws its two maps")
failed |= "Drawn: 2 maps" not in demo
# the standalone page (mountPage) shows a legend, so it still names line kinds from label words: "reads metrics" is state


class Legend(html.parser.HTMLParser):
    """The names the page's drawn legend shows (<div id="m-legend"> ... <b>name</b>), read from its elements: the parser takes
    a script's text as data, so the module's source, which the page inlines and which has the legend's markup, is not read
    as the legend (#113)"""
    def __init__(self, page):
        super().__init__(); self.divs, self.b, self.names = 0, None, []; self.feed(page)

    def handle_starttag(self, tag, attrs):
        if tag == "div" and (self.divs or dict(attrs).get("id") == "m-legend"):
            self.divs += 1
        elif tag == "b" and self.divs:
            self.b = ""

    def handle_endtag(self, tag):
        if tag == "div" and self.divs:
            self.divs -= 1
        elif tag == "b" and self.b is not None:
            self.names.append(self.b.strip()); self.b = None

    def handle_data(self, data):
        if self.b is not None:
            self.b += data


names = Legend(dom("examples/bookshop.html", lambda t: bool(Legend(t).names))).names  # waits for the legend itself; none if it never draws
legend = {"calls", "state"} <= set(names)
print(("ok  " if legend else "FAIL"), "examples/bookshop.html · the standalone page's legend names the kinds it reads from labels (calls, state)", "" if legend else names)
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
# a label with no room (#142) and one on a box's border (#108) are kinds of their own: counted, and --ignore leaves them out.
# Six numbered lines from a card down a column to six cards: their labels have no room beside each other, only their steps show
with tempfile.TemporaryDirectory() as tmp:
    ids = [f"t{i}" for i in range(6)]
    col = {"nodes": [{"id": "a", "label": "A"}] + [{"id": t, "label": t.upper()} for t in ids],
           "edges": [{"from": "a", "to": t, "label": f"hands over job {i}", "step": i + 1} for i, t in enumerate(ids)],
           "views": [{"id": "v", "nodeIds": ["a"] + ids, "layout": {"a": [0, 0], **{t: [0, i + 1] for i, t in enumerate(ids)}}}]}
    (Path(tmp) / "col.json").write_text(json.dumps(col)); page = Path(tmp) / "col.html"
    subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(Path(tmp) / "col.json"), "--out", str(page), "--no-check"], capture_output=True)
    reps = []
    for extra in ([], ["--ignore", "labelOnBorder,labelNoRoom"]):
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "check", str(page), *extra], capture_output=True, text=True)
        i = r.stdout.find("{"); reps.append((r.returncode, json.loads(r.stdout[i:]) if i >= 0 else {}))
    cut = [p for p in reps[0][1].get("problems", []) if " has no room on edge " in p and "only its step" in p]
    kinds_ok = reps[0][0] == 0 and cut and (reps[0][1].get("counts") or {}).get("labelNoRoom") == len(cut) and "labelOnBorder" in reps[0][1]["counts"] \
        and reps[1][0] == 0 and reps[1][1].get("ignored") == len(cut) and not any(" has no room " in p for p in reps[1][1].get("problems", []))
print(("ok  " if kinds_ok else "FAIL"), "umlimator.py check · a label that shows only its step is named and counted as labelNoRoom; --ignore labelOnBorder,labelNoRoom leaves them out",
      "" if kinds_ok else reps)
failed |= not kinds_ok

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
