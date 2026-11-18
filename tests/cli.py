#!/usr/bin/env python3
"""The CLI's change commands end to end (#66, #67, #68): diff of two files, diff --base in a git repository (what the
diff Action runs on a pull request; on an object and a package model as the Action's step runs it, 2.6, and on a use case, an activity, a state machine and an interaction overview model, 4.10, and a component, a deployment and a composite structure model, 5.8, and a profile and a timing model, 6.6, and an ER, a flowchart, a data flow, an information flow and a C4 model, M2.14, SysML's four e-bike models, M3.7, and a BPMN model, 4b.5, and on every other typed type, a reorder reading "moves", C10); map-repo's CLI rendering each typed model (C10); drift and timelapse; trace (#96; as a UML sequence view, 3.8); and pdf (#93; the stage 4 types' tables, 4.10, stage 5's, 5.8, stage 6's, 6.6, milestone 2's, M2.14, and SysML's, M3.7), read back with the standard
library. Pages only for the rest: stills (Chrome) are covered by `stills` itself. And the MCP server (#91), driven
through its pipes as an MCP client drives it, with a page's event stream.

  python3 tests/cli.py

Needs Node (diff, drift, trace and the MCP server's read tools run the module's own functions), git, and Chrome or
Chromium (pdf).
"""
import base64, contextlib, hashlib, http.client, importlib.util, io, json, os, re, subprocess, sys, tempfile, threading, time, urllib.request, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failed = False
sys.path.insert(0, str(ROOT))
import umlimator as u

# CI runs this script as five jobs side by side (UMLIMATOR_TEST_SHARD=k/5): each part below, with about its seconds on a
# runner, runs in exactly one of them, and unset (as here, on a developer's machine) every part runs, in order. A check
# outside every part, or a part not declared here, fails the run (tests/shards.py)
spec = importlib.util.spec_from_file_location("shards", ROOT / "tests" / "shards.py")
shards = importlib.util.module_from_spec(spec); spec.loader.exec_module(shards)
TYPED_EXAMPLES = ("sales-classes", "order-objects", "bookshop-packages", "checkout-sequence", "checkout-communication", "shopping-use-cases",
                  "fulfil-activity", "order-states", "buy-book-overview", "bookshop-components", "bookshop-deployment", "order-service-structure",
                  "bookshop-profile", "bookshop-timing", "bookshop-schema", "returns-flowchart", "bookshop-data-flow", "order-information-flow",
                  "bookshop-c4", "ebike-requirements", "ebike-blocks", "ebike-structure", "ebike-range", "bookshop-opening-plan", "bookshop-gcp",
                  "bookshop-azure", "bookshop-order-to-shipment")  # the typed examples the map-repo and schema version 2 loops below take, each a part
SLOW = {"bookshop-c4": 18, "buy-book-overview": 16, "checkout-sequence": 14, "sales-classes": 13, "fulfil-activity": 12, "order-states": 10, "bookshop-gcp": 10}
part = shards.Parts(__file__, {
    "the summary's text and the icon cache": 3, "diff and drift": 13, "trace": 15, "timelapse": 10, "stills file names": 34,
    "odd input": "stills file names", "stills keys": "stills file names",  # they read the folder of pages the first writes
    "audits 8 to 18": 16, "audits 19 and 20": 28, "audits 19 to 21": 27, "audit 25 diff": 4, "diff Action 2.6": 6, "diff Action stage 4": 26,
    "diff Action stage 5": 10, "diff Action stage 6": 7, "diff Action package": 14, "diff Action milestone 2": 32, "diff Action milestone 3": 14,
    **{f"map-repo {n}": 6 for n in TYPED_EXAMPLES}, "map-repo pin": 5, "pdf bike share": 13,
    **{f"typed {n}": SLOW.get(n, 8) for n in TYPED_EXAMPLES},
    "typed order-service-structure": "typed checkout-sequence",  # one check reads both PDFs
    "import mindmap": 1, "pdf odd models": 15, "four renders at once": 3, "mcp": 6, "animated PNG delays": 1, "audit 26": 8, "audit 27": 6, "audit 28": 6, "audit 29": 4, "audit 30": 12, "audit 31": 14, "audit 32": 10})


def ok(name, cond, info=""):
    global failed
    print(("ok  " if cond else "FAIL"), "umlimator.py", name, "" if cond else info)
    failed |= not cond


def cli(*args, cwd=None):
    r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *args], capture_output=True, text=True, cwd=cwd)
    if r.returncode:
        print(r.stderr[-1500:])
    return json.loads(r.stdout) if r.returncode == 0 else None


def stream(o):
    """A PDF object's stream, inflated: its /Length bytes, as its data may end in a \\r of its own."""
    m = re.search(rb"(.*?)stream\r?\n", o, re.S)
    data = o[m.end():m.end() + int(re.search(rb"/Length (\d+)", m.group(1)).group(1))]
    return zlib.decompress(data) if b"/FlateDecode" in m.group(1) else data


def pdf_text(data):
    """The text of each page of a PDF Chrome wrote, as a viewer's search finds it: Chrome writes glyph ids, which each
    font's ToUnicode map reads back. The standard library only (zlib for the streams)."""
    obj = dict(re.findall(rb"(\d+) 0 obj\s*(.*?)endobj", data, re.S))

    def cmap(n):  # glyph id -> text
        t, to = stream(obj[n]), {}
        for a, u in re.findall(rb"<(\w+)>\s*<(\w+)>", b"".join(re.findall(rb"beginbfchar(.*?)endbfchar", t, re.S))):
            to[int(a, 16)] = bytes.fromhex(u.decode()).decode("utf-16-be")
        for a, z, u in re.findall(rb"<(\w+)>\s*<(\w+)>\s*<(\w+)>", b"".join(re.findall(rb"beginbfrange(.*?)endbfrange", t, re.S))):
            to.update({k: chr(int(u, 16) + k - int(a, 16)) for k in range(int(a, 16), int(z, 16) + 1)})
        return to

    pages = []
    for page in (b for b in obj.values() if re.search(rb"/Type\s*/Page\b", b)):
        fonts = {f: cmap(re.search(rb"/ToUnicode (\d+) 0 R", obj[n]).group(1)) for f, n in re.findall(rb"/(F\d+) (\d+) 0 R", page)}
        font, text = {}, ""
        for f, run in re.findall(rb"/(F\d+) [\d.]+ Tf|<([0-9A-Fa-f]*)>", stream(obj[re.search(rb"/Contents (\d+) 0 R", page).group(1)])):
            if f:
                font = fonts[f]
            else:  # ponytail: two bytes a glyph (Identity-H, as Chrome embeds every font); a one-byte font would need its codespace
                text += "".join(font.get(int(run[i:i + 4], 16), "?") for i in range(0, len(run), 4))
        pages.append(text)
    return pages


def fills(data):
    """The colours, (r, g, b), a PDF's first page is filled with, in order: the first is the page's background, to the edge."""
    obj = dict(re.findall(rb"(\d+) 0 obj\s*(.*?)endobj", data, re.S))
    page = next(b for b in obj.values() if re.search(rb"/Type\s*/Page\b", b))
    return [tuple(map(float, c)) for c in re.findall(rb"([\d.]+) ([\d.]+) ([\d.]+) rg", stream(obj[re.search(rb"/Contents (\d+) 0 R", page).group(1)]))]


def edited(m):  # a made-up pull request on the bike share: a queue between Trips and Payments, a rename, a card gone
    m = json.loads(json.dumps(m))
    sys_ = next(v for v in m["views"] if v["id"] == "system")
    m["nodes"].append({"id": "pay-queue", "label": "Payments queue", "kind": "queue"})
    sys_["nodeIds"].append("pay-queue"); sys_["layout"]["pay-queue"] = [3, 3]; sys_["layout"]["payments"] = [5, 3]
    m["edges"] = [e for e in m["edges"] if e["id"] != "s9"] + [{"id": "q1", "from": "trips", "to": "pay-queue", "label": "charges"},
                                                              {"id": "q2", "from": "pay-queue", "to": "payments", "label": "charges"}]
    next(n for n in m["nodes"] if n["id"] == "accounts")["label"] = "Accounts and sign-in"
    m["nodes"] = [n for n in m["nodes"] if n["id"] != "flags"]
    sys_["nodeIds"].remove("flags"); del sys_["layout"]["flags"]
    return m


if part("the summary's text and the icon cache"):
    # check's kinds: a rule whose title holds another kind's words is a broken rule, which --ignore crossings keeps
    ok("check · each message is of one kind, by the check's own words, not a label's or a rule title's",
       [u.kind_of(o) for o in ['view v: edge Web→DB breaks rule "Apps never cross into the data tier"', "view v: edges a→b and c→d cross",
                               'view v: label "runs right-to-left" lies on edge a→b', "view v: edge a→b takes a detour (90px for 40px)"]]
       == ["rules", "crossings", "labelOnLine", "detours"])
    ok("check · a numbered line whose step has no room is labelNoRoom, as a label's is (audit 13)",
       [u.kind_of(o) for o in ['view v: step 3 has no room on edge A→B: not drawn', 'view v: label "x" has no room on edge A→B: not drawn']] == ["labelNoRoom"] * 2)
    near = 'view v: edge A→B passes within 12px of node "Ledger breaks rule "audit""'
    ok("check · a label that ends in breaks rule \"...\" is not a broken rule: the page lists its broken rules apart (audit 2)",
       u.kind_of(near, set()) == "nearNode" and u.kind_of('view v: edge A→B breaks rule "audit"', {'view v: edge A→B breaks rule "audit"'}) == "rules")
    long = "\n".join(["<!-- umlimator-diff -->", "### Map changes", ""] + [f"- adds card {i} between a and b" for i in range(3000)]
                     + ["", "```mermaid", "flowchart LR"] + ["  n1 --> n2"] * 3000 + ["```"])
    cut = u.capped(long)
    ok("diff --base · the summary stays under GitHub's 65536 characters for a comment, cut at a line, outside a sketch, saying so (audit 2)",
       len(cut) < 61000 and cut.count("```") % 2 == 0 and "The rest is cut" in cut and u.capped("short") == "short", len(cut))
    # the diff Action's comment: a label is one node's text and a summary line one line, never a fence of their own
    fence = u.sketch({"nodes": [{"id": "a", "label": 'A"]\n```\n## Approved <b>x</b>', "change": "added"}, {"id": "b", "label": "B"}],
                      "edges": [{"from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]})
    ok("diff · the sketch and the summary keep a label's newlines and backticks in their line",
       [x for x in "\n".join(fence).split("\n") if x.startswith("```")] == ["```mermaid", "```"] and "\n" not in u.flat("a\n```\nb") and "\n```" not in u.flat("a\n```"), fence)
    hashed = "\n".join(u.sketch({"nodes": [{"id": "a", "label": "Order #42; paid", "change": "added"}, {"id": "b", "label": "B"}],
                                  "edges": [{"from": "a", "to": "b", "label": "posts #amp; <x>"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}))
    ok("diff · the sketch keeps a label's '#42;' and '#amp;' as written: Mermaid decodes #<word>; (audit 9)",
       "Order #35;42; paid" in hashed and "posts #35;amp; #lt;x#gt;" in hashed, hashed)
    ok("diff · the summary reads a label as written: List<Order> and *all* are not a tag and italics on GitHub, and a code span keeps its name (audit 4)",
       u.flat("List<Order> *all* a_b <!--") == "List&lt;Order&gt; \\*all\\* a\\_b &lt;!--" and u.flat("a_b", code=True) == "a_b", u.flat("List<Order> *all* a_b <!--"))
    ok("diff · the summary mentions no one: a label @Transactional or 'calls @ops' gets a word joiner after its @ (audit 5)",
       u.flat("calls @ops @Transactional") == "calls @\u2060ops @\u2060Transactional" and u.flat("@x", code=True) == "@x", u.flat("calls @ops"))
    ok("diff · the summary links no issue: a # or GH- before a digit gets a word joiner, so Order #42, o/r#7 and GH-12 cross-reference nothing (audit 10)",
       u.flat("Order #42 o/r#7 gh-12 #x") == "Order #\u206042 o/r#\u20607 gh-\u206012 #x" and u.flat("#42", code=True) == "#42", u.flat("Order #42 o/r#7 gh-12"))
    ok("diff · the summary links no address: a word joiner after http:, https:, mailto: and inside www., so GitHub's extended autolinks find none (audit 21, 22)",
       u.flat("see https://example.com/login, HTTP://x.org, www.example.org, WWW.y.org mailto:a@b.c xmpp:me@x.org")
       == "see https:\u2060//example.com/login, HTTP:\u2060//x.org, w\u2060ww.example.org, W\u2060WW.y.org mailto:\u2060a@\u2060b.c xmpp:\u2060me@\u2060x.org"
       and u.flat("https://x.org", code=True) == "https://x.org" and not re.search(r"(?i)(https?://|www\.)", u.flat("<https://evil.example/x> www.a.org")),
       u.flat("see https://example.com/login www.example.org"))
    # audit 22: rendered by cmark-gfm, GitHub's own Markdown: a joiner after www. was read as part of the domain, and a scheme or
    # www. right after a word character (login_https://, v2https://, id_www.) got none, so the comment linked them
    HOSTILE = ["see https://evil.example/x", "_https://evil.example/x", "login_https://evil.example/x", "v2https://evil.example", "xhttp://evil.example",
               "www.evil.example", "_www.evil.example", "id_www.evil.example", "(www.evil.example)", "*www.evil.example*", "~www.evil.example~",
               "wwww.evil.example", "WWW.EVIL.EXAMPLE", "HTTPS://EVIL.EXAMPLE", "ftp://evil.example", "a_ftp://evil.example", "mail me@evil.example",
               "user_me@evil.example", "mailto:me@evil.example", "x_mailto:me@evil.example", "xmpp:me@evil.example", "<https://evil.example>",
               "[x](https://evil.example)", "![x](https://evil.example/t.png)", "Order #42", "ping @ops", "GH-12"]
    try:
        import cmarkgfm  # GitHub's Markdown renderer
    except ImportError:
        # its pinned wheel only, into a fresh folder only this user can write (mkdtemp is 0700): never a fixed name in the
        # shared temp folder, where another user could plant a package that this import would then run
        import atexit, shutil
        GFM = Path(tempfile.mkdtemp(prefix="umlimator-cmarkgfm-"))
        atexit.register(shutil.rmtree, GFM, True)
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--only-binary", ":all:",
                        "--target", str(GFM), "cmarkgfm==2025.10.22"], capture_output=True)
        sys.path.append(str(GFM))
        try:
            import cmarkgfm
        except ImportError:  # no pip or no network here: said, and a failure on CI
            cmarkgfm = None
            print("skip umlimator.py diff · the summary in GitHub's Markdown: pip install cmarkgfm==2025.10.22 to run it")
            failed |= bool(os.environ.get("CI"))
    if cmarkgfm:
        gfm = lambda md: cmarkgfm.github_flavored_markdown_to_html(md, options=cmarkgfm.cmark.Options.CMARK_OPT_UNSAFE)
        linked = [(x, gfm(f"- {u.flat(x)}")) for x in HOSTILE]
        linked = [(x, h) for x, h in linked if re.search(r"<a |<img |\bhref=|\bsrc=", h)]
        ok("diff · the summary in GitHub's Markdown (cmark-gfm): no hostile label is a link or an image, after a word character too (audit 22)",
           linked == [] and "<a " in gfm("- see https://example.org") and "<a " in gfm("- www.example.org"), linked)
    # audit 22: an icon cache that cannot be written (a read-only home on a CI runner, a folder under a file) ended the render:
    # a traceback, or a line that named --out; the card keeps its sigil, said in one line, and the render goes on
    with tempfile.TemporaryDirectory() as tmp:
        t, logo = Path(tmp), b"<svg xmlns='http://www.w3.org/2000/svg'/>"
        (t / "icons").mkdir()
        (t / "icons" / "manifest.json").write_text(json.dumps({"logo": {"file": "logo.svg", "source": "x/brand", "url": "https://example.invalid/logo.svg",
                                                                      "sha256": hashlib.sha256(logo).hexdigest()}}))
        (t / "afile").write_text("x")
        (t / "ro").mkdir(); (t / "ro").chmod(0o555)
        was = u.ICONS, u.CACHE, urllib.request.urlopen
        u.ICONS, urllib.request.urlopen = t / "icons", lambda *a, **k: io.BytesIO(logo)
        got = {}
        try:
            for name, cache in [("under a file", t / "afile" / "cache"), ("a missing folder under a read-only one", t / "ro" / "cache"),
                                ("a read-only folder", t / "ro"), ("a folder it can write", t / "rw" / "cache")]:
                u.CACHE, err = cache, io.StringIO()
                with contextlib.redirect_stderr(err):
                    try:
                        got[name] = (u.icon_table([{"nodes": [{"id": "a", "icon": "logo"}], "views": []}]), err.getvalue())
                    except (Exception, SystemExit) as e:
                        got[name] = (repr(e), err.getvalue())
        finally:
            u.ICONS, u.CACHE, urllib.request.urlopen = was
            (t / "ro").chmod(0o755)
        root = hasattr(os, "geteuid") and os.geteuid() == 0  # root writes a read-only folder
        ok("render · an icon cache that cannot be written leaves the card its sigil, in one line naming the cache, and the render goes on (audit 22)",
           all(got[n][0] == {} and "cannot keep it in the icon cache" in got[n][1] and "--out" not in got[n][1]
               for n in got if n != "a folder it can write" and not (root and n != "under a file"))
           and "logo" in got["a folder it can write"][0] and (t / "rw" / "cache" / "logo.svg").read_bytes() == logo, got)
    ok("record · a step's duration the page only warns about is played as the page plays it, not a traceback (audit 4)",
       [u.step_ms(d) for d in (None, 1200, -500, "slow", 0, "nan", [1])] == [4000, 1200, 500, 4000, 4000, 4000, 4000])

if part("animated PNG delays"):
    # audit 24: a frame's delay was min(ms, 65535) over 1000, so a step over 65.5 s was cut to 65.535 s in the animated PNG
    with tempfile.TemporaryDirectory() as tmp:
        c = lambda t, d: len(d).to_bytes(4, "big") + t + d + zlib.crc32(t + d).to_bytes(4, "big")
        one = b"\x89PNG\r\n\x1a\n" + c(b"IHDR", (1).to_bytes(4, "big") * 2 + bytes([8, 0, 0, 0, 0])) + c(b"IDAT", zlib.compress(b"\x00\x80")) + c(b"IEND", b"")
        (Path(tmp) / "a.png").write_bytes(one)
        ms = [u.step_ms(d) for d in (90000, 4000, 65535, 65536, 654321, 1e8)]
        u.apng([Path(tmp) / "a.png"] * len(ms), ms, str(Path(tmp) / "out.png"))
        b, i, fc = (Path(tmp) / "out.png").read_bytes(), 8, []
        while i < len(b):
            n = int.from_bytes(b[i:i + 4], "big")
            if b[i + 4:i + 8] == b"fcTL":
                fc.append(int.from_bytes(b[i + 28:i + 30], "big") * 1000 / int.from_bytes(b[i + 30:i + 32], "big"))
            elif b[i + 4:i + 8] == b"acTL":
                frames = int.from_bytes(b[i + 8:i + 12], "big")
            i += 12 + n
        ok("record · a step over 65.535 s lasts its duration in the animated PNG, one over 65535 s shown again to make it up (audit 24)",
           fc[:5] == [90000, 4000, 65535, 65536, 654320] and sum(fc[5:]) == 1e8 and len(fc[5:]) == 2 and frames == len(fc) == 7, fc)

bike = json.loads((ROOT / "examples" / "bike-share.json").read_text(encoding="utf-8"))
SAID = ["renames Accounts to Accounts and sign-in", "adds Payments queue between Trip service and Payment provider",
        "removes Feature flags", "removes the line from Trip service to Payment provider (charges)",
        "moves Payment provider in the view What runs"]  # its pin moved too (audit 15)
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    (t / "before.json").write_text(json.dumps(bike)); (t / "after.json").write_text(json.dumps(edited(bike)))
    if part("diff and drift"):
        r = cli("diff", str(t / "before.json"), str(t / "after.json"), "--out", str(t / "diff.html")) or {}
        ok("diff · says what changed, in words, and which views show it", r.get("summary") == SAID and r.get("views") == ["system"], r)
        page = (t / "diff.html").read_text(encoding="utf-8") if (t / "diff.html").is_file() else ""
        ok("diff · the page draws the marks", all(s in page for s in ['"change": "added"', '"change": "removed"', '"style": "added"', '"style": "removed"', ": what changed"]))
        ok("diff · leaves no copy of the model next to it", not [p.name for p in t.iterdir() if p.name.startswith(".")], [p.name for p in t.iterdir()])

        (t / "seen.json").write_text(json.dumps({"data": [{"parent": "ops-console", "child": "trips-db", "callCount": 1500}, {"parent": "rider-app", "child": "trips", "callCount": 9}]}))
        (t / "match.json").write_text(json.dumps({"trips-db": "tripsdb"}))
        r = cli("drift", str(t / "before.json"), str(t / "seen.json"), "--match", str(t / "match.json"), "--out", str(t / "drift.html")) or {}
        ok("drift · counts the lines, and names the views that show drift", r.get("counts", {}).get("undrawn") == 1 and r.get("views") == ["system"], r)
        ok("drift · the page brings in the line nobody drew", '"drift": "undrawn"' in ((t / "drift.html").read_text(encoding="utf-8") if (t / "drift.html").is_file() else ""))

    if part("trace"):
        # trace (#96): the replay example's trace (OTLP JSON) kept as a numbered view: the one bike-share has, in its place
        tr, view = ROOT / "examples" / "traces", lambda m: next((v for v in m.get("views", []) if v.get("id") == "ride-end"), None)
        r = cli("trace", str(t / "before.json"), str(tr / "ride-end.json"), "--view", "ride-end", "--match", str(tr / "match.json"),
                "--title", "A ride ends, from its trace", "--out", str(t / "traced.json")) or {}
        got = json.loads((t / "traced.json").read_text(encoding="utf-8")) if (t / "traced.json").is_file() else {}
        ok("trace · a trace becomes the numbered view bike-share keeps, which it replaces where it is", r.get("steps") == 8 and r.get("cards") == 9
           and view(got) == view(bike) and [v["id"] for v in got.get("views", [])] == [v["id"] for v in bike["views"]], r)

        # trace --diagram uml.sequence (3.8): the same trace as a UML sequence view, through the helper (notes/stage-3.md §7)
        r = cli("trace", str(t / "before.json"), str(tr / "ride-end.json"), "--view", "ride-end", "--match", str(tr / "match.json"),
                "--diagram", "uml.sequence", "--out", str(t / "traced-uml.json")) or {}
        got = json.loads((t / "traced-uml.json").read_text(encoding="utf-8")) if (t / "traced-uml.json").is_file() else {}
        v = view(got) or {}
        ok("trace --diagram uml.sequence · a version-2 model whose view is a sequence diagram: a lifeline per card, a call per step, ids with no ->",
           got.get("schemaVersion") == 2 and v.get("diagram") == "uml.sequence" and r.get("steps") == 8 and r.get("cards") == 9 and r.get("report") == []
           and all(isinstance(e, dict) and e.get("type") == "uml.Message" and "->" not in e["id"] for e in v.get("edges", [])), r)
        rv = cli("render", str(t / "traced-uml.json"), "--out", str(t / "traced-uml.html"))
        ok("trace --diagram uml.sequence · the model renders and its check is clean", rv is not None and not rv.get("problems") and not rv.get("errors"), rv)
        # traced again into that view (audit 24): the UML sequence view it replaces takes its lifelines, those no view lists, with it
        span = lambda svc, sid, par, name, a, b: {"resource": {"attributes": [{"key": "service.name", "value": {"stringValue": svc}}]}, "scopeSpans": [{"spans": [
            {"traceId": "5b8aa5a2d2c872e8321cf37308d69df2", "spanId": sid, "parentSpanId": par, "name": name, "startTimeUnixNano": str(1762700000000000000 + a), "endTimeUnixNano": str(1762700000000000000 + b)}]}]}
        (t / "small-trace.json").write_text(json.dumps({"resourceSpans": [span("rider-app", "a1", "", "tap End ride", 0, 212000000), span("trip-api", "b1", "a1", "POST /rides/{id}/end", 5000000, 200000000)]}))
        lone = lambda m: sorted(n["id"] for n in m.get("nodes", []) if n.get("type") == "uml.Lifeline" and not any(n["id"] in (w.get("nodeIds") or []) for w in m.get("views", [])))
        for extra, name in ((["--diagram", "uml.sequence"], "again-uml"), ([], "again")):
            cli("trace", str(t / "traced-uml.json"), str(t / "small-trace.json"), "--view", "ride-end", "--match", str(tr / "match.json"), *extra, "--out", str(t / f"{name}.json"))
            got = json.loads((t / f"{name}.json").read_text(encoding="utf-8")) if (t / f"{name}.json").is_file() else {"nodes": [{"id": "?", "type": "uml.Lifeline"}]}
            ok(f"trace {' '.join(extra) or '(a numbered view)'} · traced again into a UML sequence view it made: no lifeline of the old view left on no view", lone(got) == [], lone(got))
        (t / "bare").mkdir(); (t / "bare" / "umlimator.py").write_bytes((ROOT / "umlimator.py").read_bytes())  # a copy with no src/
        r = subprocess.run([sys.executable, str(t / "bare" / "umlimator.py"), "trace", str(t / "before.json"), str(tr / "ride-end.json"), "--view", "ride-end",
                            "--diagram", "uml.sequence", "--out", str(t / "bare" / "out.json")], capture_output=True, text=True)
        ok("trace --diagram uml.sequence · with no src/, it says it needs a full clone and writes nothing",
           r.returncode != 0 and "src/uml/convert.js" in r.stderr and not (t / "bare" / "out.json").exists(), (r.returncode, r.stderr[-300:]))

    if part("timelapse"):
        # a repository with three versions of a map, then an edit in the working tree: a time-lapse, and what a pull request changes
        g = t / "repo"; g.mkdir()
        git = lambda *a: subprocess.run(["git", "-C", str(g), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *a], capture_output=True, text=True, check=True)
        git("init", "-q")
        small = json.loads(json.dumps(bike)); small["nodes"] = [n for n in small["nodes"] if n["id"] != "charging"]
        small["edges"] = [e for e in small["edges"] if "charging" not in (e["from"], e["to"])]
        for v in small["views"]:
            v["nodeIds"] = [i for i in v["nodeIds"] if i != "charging"]; (v.get("layout") or {}).pop("charging", None)
            for c in v.get("containers") or []:
                c["nodeIds"] = [i for i in c.get("nodeIds", []) if i != "charging"]
        for k, m in enumerate([small, bike, bike | {"title": "Bike share, renamed"}]):
            (g / "docs").mkdir(exist_ok=True); (g / "docs" / "map.json").write_text(json.dumps(m, indent=1))
            git("add", "docs/map.json"); git("commit", "-q", "-m", f"version {k + 1}")
        r = cli("timelapse", "docs/map.json", "--out", str(t / "lapse.html"), cwd=g) or {}
        lapse = (t / "lapse.html").read_text(encoding="utf-8") if (t / "lapse.html").is_file() else ""
        data = re.search(r'<script id="versions" type="application/json">(.*?)</script>', lapse, re.S)
        data = json.loads(data.group(1)) if data else {}
        ok("timelapse · every version in git history, oldest first, on one page with the module and its icons",
           [v["label"][11:] for v in data.get("versions", [])] == ["version 1", "version 2", "version 3"] and "export function render" in lapse and data.get("icons"), r)
        ok("timelapse · --limit 0 is refused (the latest 0 versions, not all of them)", cli("timelapse", "docs/map.json", "--limit", "0", "--out", str(t / "lapse0.html"), cwd=g) is None)
        # audit 13: a merged branch plays as its merge on the first-parent line, so the last version is HEAD's model
        git("checkout", "-q", "-b", "feat"); (g / "docs" / "map.json").write_text(json.dumps(bike | {"title": "Bike share, renamed", "description": "feat"}, indent=1)); git("commit", "-qam", "feat")
        git("checkout", "-q", "-"); git("checkout", "-q", "-b", "trunk"); (g / "docs" / "map.json").write_text(json.dumps(bike | {"title": "Bike share, trunk"}, indent=1)); git("commit", "-qam", "trunk")
        git("merge", "-q", "-X", "theirs", "--no-edit", "feat")
        cli("timelapse", "docs/map.json", "--out", str(t / "lapse-m.html"), cwd=g)
        data = re.search(r'<script id="versions" type="application/json">(.*?)</script>', (t / "lapse-m.html").read_text(encoding="utf-8") if (t / "lapse-m.html").is_file() else "", re.S)
        vs = json.loads(data.group(1))["versions"] if data else []
        head = json.loads(git("show", "HEAD:docs/map.json").stdout)
        ok("timelapse · merge commits are kept and a branch's commits are not interleaved: the last version is HEAD's model (audit 13)",
           [v["label"][11:] for v in vs][3:] == ["trunk", "Merge branch 'feat' into trunk"] and vs[-1]["model"] == head, [v["label"] for v in vs])
        # audit 16: the placeholders were filled one after another, so a model's text holding a later one had the module put in its data
        g2 = t / "repo-ph"; g2.mkdir()
        git2 = lambda *a: subprocess.run(["git", "-C", str(g2), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *a], capture_output=True, text=True, check=True)
        git2("init", "-q"); (g2 / "map.json").write_text(json.dumps(bike | {"title": "T /*__UMLIMATOR_THEME__*/", "description": "inlines /*__UMLIMATOR_LIB__*/ and /*__VERSIONS__*/"}))
        git2("add", "map.json"); git2("commit", "-q", "-m", "one")
        cli("timelapse", "map.json", "--out", str(t / "lapse-ph.html"), cwd=g2)
        lapse = (t / "lapse-ph.html").read_text(encoding="utf-8") if (t / "lapse-ph.html").is_file() else ""
        data = re.search(r'<script id="versions" type="application/json">(.*?)</script>', lapse, re.S)
        ok("timelapse · a model's text holding a placeholder is data: the versions read back as the model, the module is in the page (audit 16)",
           bool(data) and json.loads(data.group(1))["versions"][0]["model"]["description"] == "inlines /*__UMLIMATOR_LIB__*/ and /*__VERSIONS__*/"
           and "/*__UMLIMATOR_LIB__*/" not in lapse.replace(data.group(1), "") and "export function render" in lapse, lapse[:300])

        (g / "docs" / "map.json").write_text(json.dumps(edited(json.loads((g / "docs" / "map.json").read_text()))))
        (g / "notes.json").write_text('{"not": "a map"}'); git("add", "notes.json")
        (g / "settings.json").write_bytes('{"editor": "x"}'.encode("utf-16")); git("add", "settings.json")  # as PowerShell writes it: not UTF-8 (audit 2)
        r = cli("diff", "--base", "HEAD", "--out", str(t / "pr"), cwd=g)
        md = (t / "pr" / "summary.md").read_text(encoding="utf-8") if (t / "pr" / "summary.md").is_file() else ""
        ok("diff --base · each map model changed since the ref (and no other JSON, a UTF-16 one too), as a page", r is not None and [x["file"] for x in r] == ["docs/map.json"] and (t / "pr" / "docs-map.html").is_file(), r)
        ok("diff --base · a summary for the pull request: what changed, and a sketch GitHub draws", md.startswith("<!-- umlimator-diff -->") and "- adds Payments queue between Trip service and Payment provider" in md
           and "```mermaid" in md and ":::added" in md and ":::removed" in md, md[:600])
        r = cli("diff", "--base", "HEAD", "--out", "pr-sub", cwd=g / "docs") or [{}]  # from a subfolder, with a relative --out: git names files from the top
        ok("diff --base · run from a subfolder, the edited model reads as edited, with its stills", r[0].get("file") == "docs/map.json" and "removes Feature flags" in r[0].get("summary", [])
           and "error" not in r[0] and r[0].get("stills") and all(Path(g / "docs" / s).is_file() for s in r[0]["stills"]), r)
        git("checkout", "-q", "--", "docs/map.json")
        cli("diff", "--base", "HEAD", "--out", str(t / "pr2"), cwd=g)
        ok("diff --base · says so when no map changed", "No map model changed." in ((t / "pr2" / "summary.md").read_text(encoding="utf-8") if (t / "pr2" / "summary.md").is_file() else ""))
        # audit 31: a change only to a story or the map's title was "No map model changed.", so the Action counted 0 and posted nothing
        was = (g / "docs" / "map.json").read_text()
        (g / "docs" / "map.json").write_text(json.dumps(json.loads(was) | {"title": "Bike share v2", "stories": [*json.loads(was).get("stories", []), {"id": "ride-31", "title": "A ride", "steps": [{"view": bike["views"][0]["id"], "caption": "start"}]}]}, indent=1))
        r = cli("diff", "--base", "HEAD", "--out", str(t / "pr31"), cwd=g) or []
        md = (t / "pr31" / "summary.md").read_text(encoding="utf-8") if (t / "pr31" / "summary.md").is_file() else ""
        ok("diff --base · a pull request that only adds a story and retitles the map is a change, said in words (audit 31)",
           [x.get("file") for x in r] == ["docs/map.json"] and "adds the story A ride" in r[0].get("summary", []) and any(x.startswith("retitles the map ") for x in r[0].get("summary", []))
           and "No map model changed." not in md, (r, md[:300]))
        (g / "docs" / "map.json").write_text(was)
        (t / "notes.txt").write_text("hi")
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "diff", "--base", "HEAD", "--out", str(t / "notes.txt")], capture_output=True, text=True, cwd=g)
        ok("diff --base · --out naming a file is said in one line, not a traceback (audit 14)", r.returncode == 1 and "is a file" in r.stderr and "Traceback" not in r.stderr
           and (t / "notes.txt").read_text() == "hi", r.stderr[-300:])

    if part("stills file names"):
        # a view id is the model's, not a path: ../x is a still inside --out
        (t / "esc").mkdir(); (t / "esc" / "m.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
            "edges": [{"id": "e", "from": "a", "to": "b"}], "views": [{"id": "../escaped", "title": "V", "nodeIds": ["a", "b"]}]}))
        cli("render", str(t / "esc" / "m.json"), "--out", str(t / "esc" / "page.html"), "--no-check")
        r = cli("stills", str(t / "esc" / "page.html"), "--out", str(t / "esc" / "out"))
        ok("stills · a view id with a / is a file name inside --out", r and len(r) == 1 and Path(r[0]["png"]).parent == t / "esc" / "out" and not list((t / "esc").glob("escaped.*")), r)

        # a view's files are named by its id as it is (a space, a letter beyond ASCII); two ids that differ only in case get
        # files of their own, as macOS and Windows fold case (audit 2)
        (t / "names").mkdir(); (t / "names" / "m.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
            "edges": [{"id": "e", "from": "a", "to": "b"}], "views": [{"id": i, "title": i, "nodeIds": ["a", "b"] if i != "api" else ["a"]} for i in ("Übersicht flow", "API", "api")]}))
        cli("render", str(t / "names" / "m.json"), "--out", str(t / "names" / "page.html"), "--no-check")
        r = cli("stills", str(t / "names" / "page.html"), "--out", str(t / "names" / "out")) or []
        again = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "stills", str(t / "names" / "page.html"), "--out", str(t / "names" / "out")], capture_output=True, text=True)
        pngs = sorted(Path(x["png"]).name for x in r)
        ok("stills · <view>.png as the docs say, and views whose ids differ only in case each keep their own pictures (audit 2)",
           len(pngs) == 3 and "Übersicht flow.png" in pngs and "API.png" in pngs and len({p.casefold() for p in pngs}) == 3
           and "0 still(s) exported, 3 unchanged" in again.stderr and "no longer has" not in again.stderr, (pngs, again.stderr[-300:]))
    plain = lambda *x: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *x], capture_output=True, text=True)
    bike_m = str(ROOT / "examples" / "bike-share.json")
    if part("odd input"):
        # a file that is no page, a model that is no model, a --size that is no size: one line, no traceback (audit 2)
        bad = [plain(c, str(t / "names" / "m.json"), *extra) for c, extra in (("stills", ["--out", str(t / "x")]), ("check", []), ("pdf", ["--out", str(t / "x.pdf")]),
                                                                              ("record", ["--story", "s", "--out", str(t / "x.png")]))]
        ok("stills, check, pdf and record · a file that is no umlimator page is said in one line", all(b.returncode == 1 and "is not a umlimator page" in b.stderr
           and "Traceback" not in b.stderr for b in bad), [b.stderr[-200:] for b in bad])
        b = plain("record", str(t / "names" / "page.html"), "--story", "s", "--out", str(t / "x.png"), "--size", "800")
        ok("record · --size 800 is a usage error, not a traceback", b.returncode == 2 and "WxH" in b.stderr and "Traceback" not in b.stderr, b.stderr[-300:])
        bad = [plain(*c, "--scale", x) for x in ("0", "-2", "nan") for c in (("stills", str(t / "names" / "page.html"), "--out", str(t / "x")),
                                                                          ("record", str(t / "names" / "page.html"), "--story", "s", "--out", str(t / "x.png")))]
        ok("stills and record · --scale 0, -2 or nan is a usage error at once, not 90 s a view waiting on Chrome (audit 4)",
           all(b.returncode == 2 and "above 0" in b.stderr for b in bad), [b.stderr[-200:] for b in bad])
        # a view id with a comma is one view to check and pdf --views, not two (audit 5)
        (t / "comma").mkdir(); (t / "comma" / "m.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
            "edges": [{"id": "e", "from": "a", "to": "b"}], "views": [{"id": i, "title": i, "nodeIds": ["a", "b"]} for i in ("orders,payments", "c")]}))
        plain("render", str(t / "comma" / "m.json"), "--out", str(t / "comma" / "page.html"), "--no-check")
        b = plain("check", str(t / "comma" / "page.html"), "--views", "orders*")
        ok("check · --views picks a view whose id holds a comma, and the page checks it", b.returncode == 0 and "no view was checked" not in b.stdout + b.stderr, (b.stdout + b.stderr)[-300:])
        shapes = {"bom": None, "cut": '{"nodes": [', "list": "[]", "nodes_null": '{"nodes": null, "views": []}', "nodes_dict": '{"nodes": {}, "views": []}',
                  "edges_dict": '{"nodes": [], "edges": {}, "views": []}', "view_str": '{"nodes": [], "views": ["v"]}',
                  # a view's fields, a card's members and meta in the wrong shape (audit 5)
                  **{f"view_{k}": '{"nodes": [{"id": "a"}], "views": [{"id": "v", "nodeIds": ["a"], %s}]}' % x for k, x in (("overrides", '"nodeOverrides": []'),
                     ("nodes", '"nodes": 5'), ("ids", '"nodeIds": 5'), ("edges", '"edges": 5'), ("boxes", '"containers": 3'), ("box", '"containers": [3]'))},
                  "members": '{"schemaVersion": 2, "nodes": [{"id": "a", "members": [{"id": "b", "members": 5}]}], "views": [{"id": "v", "nodeIds": ["a"]}]}',
                  "meta_str": '{"meta": "draft", "nodes": [{"id": "a"}], "views": [{"id": "v", "nodeIds": ["a"]}]}',
                  "view_num_id": '{"nodes": [{"id": "a"}], "views": [{"id": "v", "nodeIds": ["a"]}, {"id": 7, "nodeIds": ["a"]}]}',  # audit 6: stills and check ended in tracebacks
                  # audit 7: an id, a line's end, a view's parent or an opensView that is a list or an object ended in a TypeError
                  "node_id_list": '{"nodes": [{"id": ["a"]}], "views": [{"id": "v", "nodeIds": []}]}',
                  "opens_list": '{"nodes": [{"id": "a", "opensView": ["x"]}], "views": [{"id": "v", "nodeIds": ["a"]}]}',
                  "box_id_dict": '{"nodes": [{"id": "a"}], "views": [{"id": "v", "nodeIds": ["a"], "containers": [{"id": {"x": 1}, "nodeIds": ["a"]}]}]}',
                  "edge_to_list": '{"nodes": [{"id": "a"}], "edges": [{"id": "e", "from": "a", "to": ["a"]}], "views": [{"id": "v", "nodeIds": ["a"]}]}',
                  "parent_list": '{"nodes": [{"id": "a"}], "views": [{"id": "v", "parent": ["x"], "nodeIds": ["a"]}]}',
                  # audit 9: a number id passed render, then ended stills and MCP paths/reach in a TypeError; a view's own card's
                  # members of 5 ended MCP highlight in one
                  "node_num_id": '{"nodes": [{"id": 1}, {"id": "api"}], "views": [{"id": "v", "nodeIds": [1, "api"]}]}',
                  "view_node_members": '{"nodes": [{"id": "a"}], "views": [{"id": "v", "nodeIds": ["a"], "nodes": [{"id": "step", "members": 5}]}]}'}
        for k, text in shapes.items():
            f = t / "names" / f"{k}.json"
            f.write_bytes(b"\xef\xbb\xbf" + json.dumps(json.loads((t / "names" / "m.json").read_text())).encode() if text is None else text.encode())
        bad = {k: plain("render", str(t / "names" / f"{k}.json"), "--out", str(t / "names" / f"{k}.html"), "--no-check") for k in shapes}
        ok("render · a model with a BOM renders; one that is cut short or oddly shaped is said in one line, not a traceback (audit 2)",
           bad.pop("bom").returncode == 0 and all(b.returncode != 0 and b.stderr.strip() and "Traceback" not in b.stderr for b in bad.values()),
           {k: b.stderr[-200:] for k, b in bad.items()})
        # and so do the other commands that read a model (audit 3)
        n = t / "names"
        bad = [plain("diff", str(n / "m.json"), str(n / "list.json"), "--out", str(n / "d.html")), plain("diff", str(n / "m.json"), str(n / "cut.json"), "--out", str(n / "d.html")),
               plain("drift", str(n / "list.json"), str(n / "m.json"), "--out", str(n / "d.html")), plain("trace", str(n / "list.json"), str(n / "m.json"), "--view", "t", "--out", str(n / "t.json")),
               plain("export", str(n / "list.json"), "--out", str(n / "x.bpmn"))]
        bom = plain("diff", str(n / "m.json"), str(n / "bom.json"), "--out", str(n / "d.html"))
        ok("diff, drift, trace and export · a model with a BOM is read; one that is no model is said in one line, not a traceback (audit 3)",
           bom.returncode == 0 and all(b.returncode == 1 and b.stderr.strip() and "Traceback" not in b.stderr for b in bad), [bom.stderr[-200:]] + [b.stderr[-200:] for b in bad])
        # a render never loads code from the folder it runs in: a base64.py there is not the standard library's (audit 3)
        (t / "planted").mkdir(); (t / "planted" / "base64.py").write_text("raise SystemExit('planted base64.py ran')\n")
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(n / "m.json"), "--out", str(t / "planted.html"), "--no-check"],
                           capture_output=True, text=True, cwd=t / "planted")
        ok("render · a stdlib-named .py file in the working folder is never run", r.returncode == 0 and "planted" not in r.stderr, r.stderr[-300:])
        # a view id too long for a file name gets a name that fits, as long ids differ by a hash (audit 3)
        longs = u.still_names(["v" * 300, "v" * 299 + "w"])
        ok("stills · a view id too long for a file name is cut and hashed", all(len(x.encode()) <= 200 for x in longs.values()) and len(set(longs.values())) == 2, longs)

        # audit 6: the CLI's odd input, each in one line
        b = plain("trace", bike_m, str(ROOT / "examples" / "traces" / "ride-end.json"), "--view", "system", "--out", str(t / "hand.json"))
        ok("trace · a view a person made is never replaced: one line, nothing written", b.returncode == 1 and "no trace made" in b.stderr and not (t / "hand.json").exists(), b.stderr[-300:])
        (t / "outdir").mkdir()
        b, s = plain("render", str(n / "m.json"), "--out", str(t / "outdir"), "--no-check"), plain("stills", str(n / "page.html"), "--out", str(n / "m.json"))
        ok("render · --out an existing folder, and stills --out an existing file, are said in one line", b.returncode == 1 and "is a folder" in b.stderr
           and s.returncode == 1 and "is a file" in s.stderr and "Traceback" not in b.stderr + s.stderr, (b.stderr[-300:], s.stderr[-300:]))
    if part("stills keys"):
        # audit 22: diff's or drift's --stills naming a file ended the command after the page was written, naming --out
        runs = [plain("diff", bike_m, bike_m, "--out", str(n / "st.html"), "--stills", str(n / "m.json")),
                plain("drift", bike_m, str(ROOT / "examples" / "traces" / "ride-end.json"), "--out", str(n / "st.html"), "--stills", str(n / "m.json"))]
        ok("diff, drift · --stills naming a file is refused in one line naming --stills, before the page is written (audit 22)",
           all(r.returncode == 1 and f"--stills {n / 'm.json'} is a file" in r.stderr and "--out" not in r.stderr for r in runs) and not (n / "st.html").exists(),
           [r.stderr[-300:] for r in runs])
        mj = (n / "m.json").read_text()
        b, s = plain("render", str(n / "m.json"), "--out", str(n / "m.json"), "--no-check"), plain("diff", bike_m, str(n / "m.json"), "--out", str(n / "m.json"))
        ok("render, diff · --out naming the input is refused in one line, and the model is kept (audit 12)",
           b.returncode == s.returncode == 1 and "is its input" in b.stderr + s.stderr and (n / "m.json").read_text() == mj, (b.stderr[-300:], s.stderr[-300:]))
        os.link(n / "m.json", n / "m-link.json")  # the same file by another name (as M.JSON is on a case-insensitive disk)
        b = plain("render", str(n / "m.json"), "--out", str(n / "m-link.json"), "--no-check")
        ok("render · --out naming the input by another name (a hard link, or other case) is refused, and the model is kept (audit 13)",
           b.returncode == 1 and "is its input" in b.stderr and (n / "m.json").read_text() == mj, b.stderr[-300:])
        (t / "tr").mkdir(); tj, mt = t / "tr" / "t.json", t / "tr" / "match.json"
        tj.write_text((ROOT / "examples" / "traces" / "ride-end.json").read_text()); mt.write_text((ROOT / "examples" / "traces" / "match.json").read_text())
        tw, mw = tj.read_text(), mt.read_text()
        runs = [plain("trace", bike_m, str(tj), "--view", "t", "--match", str(mt), "--out", str(x)) for x in (tj, mt)] + [plain("drift", bike_m, str(tj), "--match", str(mt), "--out", str(mt))]
        ok("trace, drift · --out naming the trace or the --match file is refused, and both are kept (audit 14)",
           all(r.returncode == 1 and "is its input" in r.stderr for r in runs) and tj.read_text() == tw and mt.read_text() == mw, [r.stderr[-200:] for r in runs])
        b = plain("diff", str(ROOT / "examples" / "traces" / "ride-end.json"), bike_m, "--out", str(t / "tr" / "d.html"))
        ok("diff · a JSON object that is no map model (a trace) is refused in one line (audit 14)", b.returncode == 1 and "ride-end.json: no views" in b.stderr and not (t / "tr" / "d.html").exists(), b.stderr[-300:])
        (t / "tr" / "bad.json").write_text('{"resourceSpans": [{"scopeSpans": [{"spans": [null]}]}]}')
        b = plain("trace", bike_m, str(t / "tr" / "bad.json"), "--view", "t", "--out", str(t / "tr" / "o.json"))
        ok("trace · a malformed OTLP file ends in its one line, not a Node stack trace (audit 14)", b.returncode == 1 and "no call in" in b.stderr and "TypeError" not in b.stderr, b.stderr[-300:])
        b = plain("mcp", bike_m, "--port", "73910")
        ok("mcp · --port 73910 is a usage error, not a traceback", b.returncode == 2 and "not a port" in b.stderr and "Traceback" not in b.stderr, b.stderr[-300:])
        ro = t / "ro"; ro.mkdir(); (ro / "m.json").write_text((n / "m.json").read_text()); ro.chmod(0o555)
        if not os.access(ro, os.W_OK):  # root writes anyway
            b = plain("render", str(ro / "m.json"), "--out", str(t / "ro.html"), "--no-check")
            ok("render · a model in a folder that cannot be written is said in one line", b.returncode == 1 and "cannot write in" in b.stderr and "Traceback" not in b.stderr, b.stderr[-300:])
        ro.chmod(0o755)
        # a card whose inner view comes from the view's override: the stills key holds that view's size (the ⤢ pill)
        kid = lambda k: {"title": "t", "nodes": [{"id": c, "label": c} for c in "xyzw"], "views": [{"id": "a", "nodeIds": ["x"], "nodeOverrides": {"x": {"opensView": "b"}}},
                                                                                   {"id": "b", "parent": "a", "nodeIds": list("yzw"[:k])}]}
        keys = []
        for k in (2, 3):
            (t / f"kid{k}.json").write_text(json.dumps(kid(k))); cli("render", str(t / f"kid{k}.json"), "--out", str(t / f"kid{k}.html"), "--no-check")
            keys.append(u.still_keys(t / f"kid{k}.html", [2.0, "light", False]).get("a"))
        ok("stills · a view is drawn again when the inner view an override opens grows", None not in keys and keys[0] != keys[1], keys)
        # a view's own card (view.nodes) is in the key, as the page indexes it (audit 7): the inner view it opens grows, and
        # another view that lists it sees it renamed
        local = lambda k, label: {"title": "t", "root": "top", "nodes": [{"id": c, "label": c} for c in "xbc"],
                                  "views": [{"id": "top", "nodes": [{"id": "s", "label": label, "opensView": "inner"}], "nodeIds": ["x", "s"]},
                                            {"id": "inner", "parent": "top", "nodeIds": list("bc"[:k])}, {"id": "other", "parent": "top", "nodeIds": ["x", "s"]}]}
        keys = []
        for k, label in ((1, "Before"), (2, "Before"), (2, "After")):
            (t / "local.json").write_text(json.dumps(local(k, label))); cli("render", str(t / "local.json"), "--out", str(t / "local.html"), "--no-check")
            keys.append(u.still_keys(t / "local.html", [2.0, "light", False]))
        ok("stills · a view is drawn again when a view-local card's inner view grows, or a view lists that card and it changes (audit 7)",
           keys[0]["top"] != keys[1]["top"] and keys[1]["other"] != keys[2]["other"], keys)
        # audit 8: a typed view's key holds what the page's viewKey adds for one: other views' titles, and a DFD level its parent's cards
        typed = lambda ids, title: {"schemaVersion": 2, "title": "t", "nodes": [{"id": c, "label": c} for c in "xy"],
                                    "views": [{"id": "l1", "diagram": "dfd", "title": "Level 1", "nodeIds": ids},
                                              {"id": "l2", "diagram": "dfd", "parent": "l1", "title": title, "nodeIds": ["x", "y"]}]}
        keys = []
        for ids, title in ((["x", "y"], "Level 2"), (["x"], "Level 2"), (["x"], "Take order")):
            (t / "typed.json").write_text(json.dumps(typed(ids, title))); cli("render", str(t / "typed.json"), "--out", str(t / "typed.html"), "--no-check")
            keys.append(u.still_keys(t / "typed.html", [2.0, "light", False]))
        ok("stills · a DFD level is drawn again when its parent's cards change, and a typed view when another view is renamed (audit 8)",
           keys[0]["l2"] != keys[1]["l2"] and keys[1]["l1"] != keys[2]["l1"], keys)
    rides = str(ROOT / "examples" / "traces" / "ride-end.json")
    two = {"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"from": "a", "to": "b"}], "views": [{"id": "main", "nodeIds": ["a", "b"]}]}
    if part("audits 8 to 18"):
        # audit 8: a view's own card names an icon the model's cards do not: the page's icons table has it
        (t / "vicon.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A", "icon": "database"}],
            "views": [{"id": "main", "title": "Main", "nodeIds": ["a", "b"], "nodes": [{"id": "b", "label": "B", "icon": "server"}]}]}))
        cli("render", str(t / "vicon.json"), "--out", str(t / "vicon.html"), "--no-check")
        ok("render · a view's own card gets its icon in the page's icons table (audit 8)",
           "server" in ((u.page_data(t / "vicon.html")[0].get("icons") or {}) if (t / "vicon.html").is_file() else {}))
        # audit 8: '<!--' then '<script' in a label left the data block open past its own </script>: every '<' in it is escaped
        (t / "lt.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A", "what": "Renders <!-- old <script> tags"}, {"id": "b", "label": "B"}],
            "edges": [{"from": "a", "to": "b"}], "views": [{"id": "main", "title": "Main", "nodeIds": ["a", "b"]}]}))
        cli("render", str(t / "lt.json"), "--out", str(t / "lt.html"), "--no-check")
        blk = u.DATA.search((t / "lt.html").read_text(encoding="utf-8")) if (t / "lt.html").is_file() else None
        ok("render · a label holding <!-- and <script is data: the page's data block holds no '<' and reads back the same (audit 8)",
           blk and "<" not in blk.group(1) and json.loads(blk.group(1))["nodes"][0]["what"] == "Renders <!-- old <script> tags"
           and json.loads(u.script_json("<!--<script")) == "<!--<script" and "<" not in u.script_json("<!--<script"))
        # audit 8: diff and drift name the user's file, not the hidden copy rendered beside it
        (t / "badid.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": ["b"]}], "views": [{"id": "main", "nodeIds": ["a"]}]}))
        b = plain("diff", str(t / "vicon.json"), str(t / "badid.json"), "--out", str(t / "badid.html"))
        ok("diff · a malformed model is named by its own file, not a deleted temp copy (audit 8)",
           b.returncode == 1 and "badid.json: nodes[1].id is not a string" in b.stderr and ".change.json" not in b.stderr, b.stderr[-300:])
        # audit 10: a view with no id, an empty one or a repeated one is refused in one line, as validate() refuses it
        (t / "vid.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}], "views": [{"id": "v", "nodeIds": ["a"]}, {"nodeIds": ["a"]}, {"id": "", "nodeIds": ["a"]}, {"id": "v", "nodeIds": ["a"]}]}))
        b = plain("render", str(t / "vid.json"), "--out", str(t / "vid.html"), "--no-check")
        ok("render · a view with no id, an empty id or a repeated id is refused in one line, and no page is written (audit 10)",
           b.returncode == 1 and 'views[1].id: a view needs an id; views[2].id: a view needs an id; views[3].id "v" is used twice' in b.stderr
           and not (t / "vid.html").exists(), b.stderr[-300:])
        # audit 11: diff (both files), drift, trace and export read a model as render does, naming the file at fault; trace refuses --view ''
        (t / "vstr.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a"}], "views": "x"}))
        (t / "v5.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a"}], "views": [{"id": 5, "nodeIds": ["a"]}]}))
        bs = [plain("diff", str(t / "vicon.json"), str(t / "vstr.json"), "--out", str(t / "d11.html")), plain("diff", str(t / "v5.json"), str(t / "vicon.json"), "--out", str(t / "d11.html")),
              plain("drift", str(t / "vstr.json"), rides, "--out", str(t / "d11.html")), plain("trace", str(t / "vstr.json"), rides, "--view", "t", "--out", str(t / "t11.json")),
              plain("export", str(t / "v5.json"), "--out", str(t / "e11.bpmn"))]
        ok("diff, drift, trace and export · a model render refuses is refused in one line naming its own file, and nothing is written (audit 11)",
           [b.returncode for b in bs] == [1] * 5 and "vstr.json: views is not a list" in bs[0].stderr and "v5.json: views[0].id is not a string" in bs[1].stderr
           and "vstr.json: views is not a list" in bs[2].stderr + bs[3].stderr and "v5.json: views[0].id" in bs[4].stderr
           and not any((t / f).exists() for f in ("d11.html", "t11.json", "e11.bpmn")), [b.stderr[-200:] for b in bs])
        # audit 17: a null stories, or a story's null steps, is absent (as validate() and the page read it), not refused (a round-16 regression);
        # a list or an object, though, still is
        for f, extra in (("sn", {"stories": None}), ("ssn", {"stories": [{"id": "s", "steps": None}]}), ("so", {"stories": {}}), ("sso", {"stories": [{"id": "s", "steps": {}}]})):
            (t / f"{f}.json").write_text(json.dumps(two | extra))
        bs = [plain("render", str(t / f"{f}.json"), "--out", str(t / f"{f}.html"), "--no-check") for f in ("sn", "ssn", "so", "sso")]
        ok("render · a null stories or a null steps renders; stories or steps that are an object are still refused in one line (audit 17)",
           [b.returncode for b in bs] == [0, 0, 1, 1] and (t / "sn.html").exists() and (t / "ssn.html").exists()
           and "so.json: stories is not a list" in bs[2].stderr and "sso.json: stories[0].steps is not a list" in bs[3].stderr, [b.stderr[-200:] for b in bs])
        # audit 17: a tour or browserOrder entry, a box's card or parent, an intake's to that is no string ended in upstream's traceback
        bad = {"tour": {"tour": [{"id": "a"}, "b"]}, "browserOrder": {"browserOrder": [["main"]]}, "cnode": {"containers": [{"id": "x", "nodeIds": [["a"]]}]},
               "cparent": {"containers": [{"id": "x", "nodeIds": ["a"], "parent": ["y"]}]}, "intake": {"intake": [{"label": "in", "to": ["a"]}]}}
        said = {"tour": "views[0].tour[0] is not a string", "browserOrder": "views[0].browserOrder[0] is not a string", "cnode": "views[0].containers[0].nodeIds[0] is not a string",
                "cparent": "views[0].containers[0].parent is not a string", "intake": "views[0].intake[0].to is not a string"}
        for k, v in bad.items():
            (t / f"b17{k}.json").write_text(json.dumps(two | {"views": [two["views"][0] | v]}))
        bs = {k: plain("render", str(t / f"b17{k}.json"), "--out", str(t / f"b17{k}.html"), "--no-check") for k in bad}
        ok("render · a non-string tour, browserOrder, box card, box parent or intake to is refused in one line naming it, no traceback (audit 17)",
           all(b.returncode == 1 and b.stderr.strip().endswith(f"b17{k}.json: {said[k]}") and "Traceback" not in b.stderr and not (t / f"b17{k}.html").exists()
               for k, b in bs.items()), {k: b.stderr[-200:] for k, b in bs.items()})
        # audit 18: a title, a view's title, authors, an intake logo or a member id of the wrong type ended in upstream's traceback;
        # a null title is no title (as validate() reads it) and renders under the root view's title
        bad = {"title": {"title": 5}, "vtitle": {"views": [two["views"][0] | {"title": 7}]}, "authors": {"authors": ["x"]},
               "logo": {"views": [two["views"][0] | {"intake": [{"to": "a", "label": "in", "logo": ["x"]}]}]},
               "member": {"nodes": [two["nodes"][0] | {"members": [{"id": ["p"], "label": "p"}]}, two["nodes"][1]]}}
        said = {"title": "title is not a string", "vtitle": "views[0].title is not a string", "authors": "authors is not an object",
                "logo": "views[0].intake[0].logo is not a string", "member": "nodes[0].members[0].id is not a string"}
        for k, v in bad.items():
            (t / f"b18{k}.json").write_text(json.dumps(two | v))
        (t / "b18null.json").write_text(json.dumps(two | {"title": None, "views": [two["views"][0] | {"title": "Main view"}]}))
        bs = {k: plain("render", str(t / f"b18{k}.json"), "--out", str(t / f"b18{k}.html"), "--no-check") for k in [*bad, "null"]}
        ok("render · a non-string title, view title, intake logo or member id, or authors that is no object, is refused in one line naming it; a null title renders (audit 18)",
           all(b.returncode == 1 and b.stderr.strip().endswith(f"b18{k}.json: {said[k]}") and "Traceback" not in b.stderr for k, b in bs.items() if k != "null")
           and bs["null"].returncode == 0 and "<title>Main view</title>" in (t / "b18null.html").read_text(), {k: b.stderr[-200:] for k, b in bs.items()})
        # audit 18: a card's icon or author that is no string names nothing in a still's key (it ended stills in a TypeError)
        for k, v in (("icon", ["server"]), ("author", {"x": 1})):
            (t / f"k18{k}.json").write_text(json.dumps(two | {"nodes": [two["nodes"][0] | {k: v}, two["nodes"][1]]}))
        bs = [plain("render", str(t / f"k18{k}.json"), "--out", str(t / f"k18{k}.html"), "--no-check") for k in ("icon", "author")]
        try:
            keys = [u.still_keys(t / f"k18{k}.html", {}) for k in ("icon", "author")]
        except Exception as e:
            keys = [repr(e)]
        ok("stills · a page whose card has an icon or author that is no string has a still key for each view, no traceback (audit 18)",
           [b.returncode for b in bs] == [0, 0] and all(isinstance(k, dict) and list(k) == ["main"] for k in keys), keys)
        # audit 18: an intake logo is an SVG in the model's own folder; any other file named there (a path out of the folder, an
        # absolute path, a link to a file outside, a file that is not an SVG) is never read into the page, render's or diff's
        lg = t / "lg18"; (lg / "sub" / "art").mkdir(parents=True)
        secret = "SECRET-TOKEN-1234\n"; (lg / "secret.txt").write_text(secret); (lg / "secret.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><!-- SECRET-TOKEN-1234 --></svg>')
        (lg / "sub" / "art" / "mark.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle r="1"/></svg>')
        (lg / "sub" / "fake.svg").write_text(secret)
        (lg / "sub" / "link.svg").symlink_to(lg / "secret.svg")
        logos = ["../secret.txt", str(lg / "secret.txt"), str(lg / "secret.svg"), "../secret.svg", "link.svg", "fake.svg", "art/../../secret.svg", "nope.svg",
                 "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", "art/mark.svg", "data:image/png;base64,iVBORw0KGgo="]
        lm = two | {"views": [two["views"][0] | {"intake": [{"to": "a", "label": f"in{j}", "logo": x} for j, x in enumerate(logos)]}]}
        (lg / "sub" / "map.json").write_text(json.dumps(lm)); (lg / "before.json").write_text(json.dumps(two))
        at = lambda *x: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *x], capture_output=True, text=True, cwd=lg)
        b, d = at("render", "sub/map.json", "--out", "rel.html", "--no-check"), at("diff", "before.json", "sub/map.json", "--out", "diff.html")
        leaked = [u.base64.b64encode(x.encode()).decode() for x in (secret, (lg / "secret.svg").read_text())]
        pages = {f: (lg / f).read_text() if (lg / f).is_file() else "" for f in ("rel.html", "diff.html")}
        kept = u.page_data(lg / "rel.html")[0]["views"][0]["intake"] if pages["rel.html"] else []
        ok("render, diff · an intake logo outside the model's folder, absolute, linked out of it, or not an SVG is left out and said; one in the folder is embedded (audit 18)",
           b.returncode == 0 and d.returncode == 0 and all(p and not any(x in p for x in leaked) and "SECRET-TOKEN" not in p for p in pages.values())
           and [i for i, x in enumerate(kept) if "logo" in x] == [9, 10] and kept[9]["logo"].startswith("data:image/svg+xml;base64,")
           and all(f"views[0].intake[{j}].logo is" in b.stderr for j in range(9)) and "Traceback" not in b.stderr + d.stderr,
           [b.stderr[-600:], d.stderr[-300:], [x.get("logo", "")[:40] for x in kept]])
    if part("audits 19 and 20"):
        # audit 19: a page, its stills and the diff Action's browser fetch nothing from an address the model names: an author's
        # avatar, the model's own icons table (whether or not a card names a manifest icon), an example's image; timelapse too
        off = lambda *x, cwd=None: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *x], capture_output=True, text=True, cwd=cwd,
                                                  env={**os.environ, "UMLIMATOR_OFFLINE": "1"})
        far, png = "127.0.0.1:9/beacon.png?leak=19", "data:image/png;base64,iVBORw0KGgo="
        h19 = two | {"authors": {"nobody-19": {"name": "N", "avatar": "http://" + far}, "kept-19": {"avatar": png}},
                     "icons": {"evil": {"src": "http://" + far}, "glyph": {"g": f'<image href="http://{far}"/>'}},
                     "nodes": [two["nodes"][0] | {"author": "nobody-19", "icon": "evil", "examples": [{"title": "x", "thumb": "http://" + far, "full": " //" + far},
                                                                                                        {"title": "y", "thumb": "shots/y.png", "full": "\thttps://" + far}]},
                               two["nodes"][1] | {"author": "kept-19", "icon": "glyph"}]}
        h19b = h19 | {"nodes": [h19["nodes"][0], h19["nodes"][1] | {"icon": "server"}]}
        for k, m in (("", h19), ("b", h19b), ("-before", two)):
            (t / f"h19{k}.json").write_text(json.dumps(m))
        bs = [off("render", str(t / f"h19{k}.json"), "--out", str(t / f"h19{k}.html"), "--no-check") for k in ("", "b")]
        bs.append(off("diff", str(t / "h19-before.json"), str(t / "h19.json"), "--out", str(t / "h19d.html")))
        g19 = t / "g19"; g19.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g19, capture_output=True)
        sh("init", "-q"); (g19 / "m.json").write_text(json.dumps(h19)); sh("add", "."); sh("commit", "-qm", "one")
        bs.append(off("timelapse", "m.json", "--out", str(t / "h19t.html"), cwd=g19))
        pages = [(t / f).read_text() if (t / f).is_file() else "" for f in ("h19.html", "h19b.html", "h19d.html", "h19t.html")]
        d19 = [u.page_data(t / f)[0] if (t / f).is_file() else {} for f in ("h19.html", "h19b.html")]
        exs = [x for n in d19[0].get("nodes", []) for x in n.get("examples") or []]
        ok("render, diff, timelapse · an author's avatar, the model's own icons and an example's image that name an address are left out and said; a data: avatar and a path beside the page are kept (audit 19)",
           [b.returncode for b in bs] == [0] * 4 and all(p and "127.0.0.1:9" not in p for p in pages)
           and d19[0]["authors"]["kept-19"]["avatar"] == png and "avatar" not in d19[0]["authors"]["nobody-19"]
           and not d19[0].get("icons") and set(d19[1].get("icons") or {}) == {"server"} and exs == [{"title": "x"}, {"title": "y", "thumb": "shots/y.png"}]
           and "authors.nobody-19.avatar" in bs[0].stderr and "icons is built by render" in bs[0].stderr and "nodes[0].examples[0].thumb" in bs[0].stderr
           and "Traceback" not in "".join(b.stderr for b in bs), [b.stderr[-400:] for b in bs])
        # audit 19: a top-level files or hunks key (upstream's explore and recap keys, which a map never draws) of another shape
        # ended render in upstream's traceback
        for k, v in enumerate([{"files": [{"name": "a.txt"}]}, {"files": 5}, {"hunks": [{"missing": True}]}, {"hunks": 7}, {"areas": 3, "files": [{"path": "x"}]}]):
            (t / f"fh19-{k}.json").write_text(json.dumps(two | v))
        bs = [plain("render", str(t / f"fh19-{k}.json"), "--out", str(t / f"fh19-{k}.html"), "--no-check") for k in range(5)]
        ok("render · a top-level files, hunks or areas key of any shape is left out: the map renders, no traceback (audit 19)",
           [b.returncode for b in bs] == [0] * 5 and "Traceback" not in "".join(b.stderr for b in bs)
           and all(not {"files", "hunks", "areas"} & set(u.page_data(t / f"fh19-{k}.html")[0]) for k in range(5)), [b.stderr[-300:] for b in bs])
        # audit 19: a label that is no text, or an object with a toString key anywhere ({"toString": 1} is valid JSON), ended the
        # page's drawing in a TypeError; a map by id may name a card toString
        ts = lambda: {"toString": 1}
        bad = {"label": {"nodes": [two["nodes"][0] | {"label": ts()}, two["nodes"][1]]}, "obj": {"edges": [{"from": "a", "to": "b", "label": {"a": 1}}]},
               "kind": {"nodes": [two["nodes"][0] | {"kind": ts(), "props": {"guard": ts()}}, two["nodes"][1]]}}
        said = {"label": "nodes[0].label is not text", "obj": "edges[0].label is not text",
                "kind": "nodes[0].kind is an object with a toString key, which is no text; nodes[0].props.guard is an object with a toString key, which is no text"}
        for k, v in bad.items():
            (t / f"ts19{k}.json").write_text(json.dumps(two | v))
        (t / "ts19ok.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "toString", "label": "T"}, {"id": "b", "label": "B"}], "edges": [],
                                                   "views": [{"id": "main", "nodeIds": ["toString", "b"], "layout": {"toString": [0, 0], "b": [1, 0]}, "nodeOverrides": {"toString": {"label": "Tee"}}}]}))
        bs = {k: plain("render", str(t / f"ts19{k}.json"), "--out", str(t / f"ts19{k}.html"), "--no-check") for k in [*bad, "ok"]}
        ok("render · a label that is no text, or an object with a toString key, is refused in one line naming it; a card named toString renders (audit 19)",
           all(b.returncode == 1 and b.stderr.strip().endswith(f"ts19{k}.json: {said[k]}") and not (t / f"ts19{k}.html").exists() for k, b in bs.items() if k != "ok")
           and bs["ok"].returncode == 0, {k: b.stderr[-300:] for k, b in bs.items()})
        # audit 20: a tagged value or a port named toString is a name in a map by name, a level down: the model renders
        tg = {"schemaVersion": 2, "title": "t", "nodes": [{"id": "c", "type": "uml.Class", "label": "Order", "props": {"tags": {"Entity": {"toString": "yes", "table": "orders"}}}}],
              "views": [{"id": "v", "diagram": "uml.class", "nodeIds": ["c"], "present": {"c": {"ports": {"toString": {"side": "left"}}}}}]}
        (t / "tg20.json").write_text(json.dumps(tg))
        b = plain("render", str(t / "tg20.json"), "--out", str(t / "tg20.html"), "--no-check")
        ok("render · a stereotype's tagged value and a part's port named toString render: maps by name a level down (audit 20)", b.returncode == 0 and (t / "tg20.html").is_file(), b.stderr[-300:])
        # audit 20: drift and trace ended in a Node stack trace on an object with a toString key in the traffic, the --match
        # table or the trace: such a value is left out, as validate() leaves it out of a model
        (t / "m20.json").write_text(json.dumps(two))
        files = {"obs-count": [{"from": "a", "to": "b", "count": ts()}], "obs-from": [{"from": ts(), "to": "b", "count": 1}, {"from": "a", "to": "b", "count": 2}],
                 "match": {"a": ts()}}
        res = lambda svc, *spans: {"resource": {"attributes": [{"key": "service.name", "value": {"stringValue": svc}}]}, "scopeSpans": [{"spans": list(spans)}]}
        span = lambda i, p=None, start="1000000", end="9000000": {"spanId": i, **({"parentSpanId": p} if p else {}), "name": "call", "startTimeUnixNano": start, "endTimeUnixNano": end}
        calls = [res("a", span("1")), res("b", span("2", "1"))]  # a calls b
        files["otlp-time"] = {"resourceSpans": [*calls, res("b", span("3", "1", start=ts()))]}
        files["otlp-service"] = {"resourceSpans": [*calls, res(ts(), span("4", "1"))]}
        for k, v in files.items():
            (t / f"h20-{k}.json").write_text(json.dumps(v))
        seen = str(t / "h20-obs-count.json")
        bs = [plain("drift", str(t / "m20.json"), str(t / "h20-obs-count.json"), "--out", str(t / "h20a.html")), plain("drift", str(t / "m20.json"), str(t / "h20-obs-from.json"), "--out", str(t / "h20b.html")),
              plain("drift", str(t / "m20.json"), seen, "--match", str(t / "h20-match.json"), "--out", str(t / "h20c.html")),
              plain("trace", str(t / "m20.json"), str(t / "h20-otlp-time.json"), "--view", "t", "--out", str(t / "h20d.json")),
              plain("trace", str(t / "m20.json"), str(t / "h20-otlp-service.json"), "--view", "t", "--out", str(t / "h20e.json"))]
        ok("drift, trace · an object with a toString key in the traffic, --match or an OTLP trace is left out: no stack trace, the page or model written (audit 20)",
           [b.returncode for b in bs] == [0] * 5 and not any("TypeError" in b.stderr or "    at " in b.stderr for b in bs)
           and all((t / f).is_file() for f in ("h20a.html", "h20b.html", "h20c.html", "h20d.json", "h20e.json")), [b.stderr[-300:] for b in bs])
        # audit 19: diff --base drew a removed model from a copy beside --out, so its intake logo was dropped and stderr named a file
        # that never existed; a model whose folder is gone too is still drawn
        g = t / "g19d"; (g / "docs").mkdir(parents=True); (g / "gone").mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        (g / "docs" / "mark.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>')
        lm = two | {"views": [two["views"][0] | {"intake": [{"to": "a", "label": "in", "logo": "mark.svg"}]}]}
        (g / "docs" / "m.json").write_text(json.dumps(lm)); (g / "gone" / "g.json").write_text(json.dumps(two))
        sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one"); sh("rm", "-q", "docs/m.json", "gone/g.json")
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD', '--out', 'out']; u.main()", str(ROOT)], cwd=g, capture_output=True, text=True)
        pg = [u.page_data(g / "out" / f)[0] if (g / "out" / f).is_file() else {} for f in ("docs-m.html", "gone-g.html")]
        logo = [x.get("logo", "") for v in pg[0].get("views", []) for x in v.get("intake") or []]
        ok("diff --base · a removed model is drawn from its own folder: its intake logo is embedded and no message names a file beside --out; one whose folder is gone is drawn too (audit 19)",
           r.returncode == 0 and len(logo) == 1 and logo[0].startswith("data:image/svg+xml;base64,") and "out/docs-m.json" not in r.stderr and bool(pg[1])
           and not [p.name for p in (g / "docs").iterdir() if p.name.startswith(".")], [r.stderr[-500:], logo])
        b = plain("trace", str(ROOT / "examples" / "bike-share.json"), rides, "--view", "", "--out", str(t / "t11.json"))
        ok("trace · an empty --view is refused in one line, and nothing is written (audit 11)",
           b.returncode == 1 and "--view needs a view id" in b.stderr and not (t / "t11.json").exists(), b.stderr[-300:])
        # audit 11: diff --base reads each version as render does, and its "No picture" line is flat() as the views line is
        g11 = t / "g11"; g11.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g11, capture_output=True)
        pic = {"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "views": [{"id": "ops @octocat #42 <!-- x", "nodeIds": ["a"]}]}
        (g11 / "m.json").write_text(json.dumps(pic)); (g11 / "n.json").write_text(json.dumps(pic))
        sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        pic["views"][0]["nodeIds"] = ["a", "b"]; (g11 / "m.json").write_text(json.dumps(pic))
        (g11 / "n.json").write_text(json.dumps({**pic, "views": [{"id": 5, "nodeIds": ["a"]}]}))
        subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                        "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD', '--out', 'out']; u.main()", str(ROOT)], cwd=g11, capture_output=True)
        md = (g11 / "out" / "summary.md").read_text(encoding="utf-8") if (g11 / "out" / "summary.md").is_file() else ""
        ok("diff --base · the No picture line mentions no one, links no issue and opens no HTML comment, and a version render refuses is said (audit 11)",
           "_No picture of ops @\u2060octocat #\u206042 &lt;!-- x:" in md and "@octocat" not in md and "**`n.json`**: cannot be read: it: views\\[0\\].id is not a string" in md, md[-800:])
        # audit 8: a story step that is not an object: one line, not a traceback (and before Chrome is looked for)
        (t / "story.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"from": "a", "to": "b"}],
            "views": [{"id": "main", "title": "Main", "nodeIds": ["a", "b"]}], "stories": [{"id": "s", "title": "S", "steps": [None, {"view": "main", "tour": "ab"}]}]}))
        cli("render", str(t / "story.json"), "--out", str(t / "story.html"), "--no-check")
        b = plain("record", str(t / "story.html"), "--story", "s", "--out", str(t / "story.png"))
        ok("record · a story step that is not an object is said in one line, not a traceback (audit 8)",
           b.returncode == 1 and "step 1 is not an object" in b.stderr and "Traceback" not in b.stderr, b.stderr[-300:])

    if part("audits 19 to 21"):
        # audit 19, the security review of the fix: an example image that is not a string (a list, an object) slipped past a
        # filter that dropped only remote strings, and members were not walked; both are now kept only when known safe
        mx = {"nodes": [{"id": "a", "members": [{"id": "a.p", "examples": [{"title": "m", "thumb": "https://evil.example/m.png"},
                                                                         {"title": "l", "thumb": ["https://evil.example/l.png"], "full": {"u": "//evil.example"}}]}],
                         "examples": [{"title": "k", "thumb": "shots/k.png", "full": 7}]}], "views": []}
        u.own_media(mx, t, "m.json")
        ok("own_media · an example image that is a list, an object, a number or an address is dropped, a member's too; a path beside the page is kept (audit 19)",
           mx["nodes"][0]["members"][0]["examples"] == [{"title": "m"}, {"title": "l"}] and mx["nodes"][0]["examples"] == [{"title": "k", "thumb": "shots/k.png"}],
           json.dumps(mx))
        # audit 19, the security review: a removed model whose folder is now a symbolic link out of the checkout was drawn from
        # that folder, so its intake logo read an SVG file outside the checkout into the page
        g = t / "g19s"; far = t / "g19s-outside"; (g / "docs").mkdir(parents=True); far.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        lm = two | {"views": [two["views"][0] | {"intake": [{"to": two["views"][0]["nodeIds"][0], "label": "in", "logo": "secret.svg"}]}] + two["views"][1:]}
        (g / "docs" / "m.json").write_text(json.dumps(lm)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (far / "secret.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><!-- SECRET-19 --></svg>')
        sh("rm", "-q", "-r", "docs"); (g / "docs").symlink_to(far, target_is_directory=True)
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD', '--out', 'out']; u.main()", str(ROOT)], cwd=g, capture_output=True, text=True)
        lg = [x.get("logo", "") for f in (g / "out").glob("*.html") for v in u.page_data(f)[0].get("views", []) for x in v.get("intake") or []]
        leak = [x for x in lg if x.startswith("data:") and b"SECRET-19" in __import__("base64").b64decode(x.split(",", 1)[1])]
        ok("diff --base · a removed model whose folder is now a symbolic link out of the checkout reads no file from there (audit 19)",
           r.returncode == 0 and len(lg) == 1 and not leak, (r.returncode, lg, r.stderr[-300:]))
        # audit 20, the security review: a model file that is itself a symbolic link to a file outside the checkout was read, so
        # its labels went into the comment, an SVG beside its target into the page, and the temp copy was written out there
        g = t / "g20s"; far = t / "g20s-outside"; (g / "docs").mkdir(parents=True); far.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        (g / "docs" / "a.json").write_text(json.dumps(two)); (g / "docs" / "b.json").write_text(json.dumps(two)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (far / "private.json").write_text(json.dumps(lm | {"nodes": [two["nodes"][0] | {"label": "PRIVATE-20"}, two["nodes"][1]]}))
        (far / "secret.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><!-- SECRET-20 --></svg>')
        (g / "docs" / "a.json").unlink(); (g / "docs" / "a.json").symlink_to(far / "private.json")
        (g / "docs" / "b.json").write_text(json.dumps(two | {"nodes": [two["nodes"][0] | {"label": "A2"}, two["nodes"][1]]}))
        sh("add", "-A"); sh("commit", "-qm", "pr")
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD~1', '--out', 'out']; u.main()", str(ROOT)], cwd=g, capture_output=True, text=True)
        md = (g / "out" / "summary.md").read_text() if (g / "out" / "summary.md").is_file() else ""
        pages = "".join(f.read_text() for f in (g / "out").glob("*.html"))
        ok("diff --base · a model file that is a symbolic link out of the checkout is not read: said, its labels and logos stay out, nothing written there; the rest are diffed (audit 20)",
           r.returncode == 0 and "**`docs/a.json`**: cannot be read: it is a symbolic link" in md and "PRIVATE-20" not in md + pages and "SECRET-20" not in pages
           and "U0VDUkVULTIw" not in pages and sorted(f.name for f in far.iterdir()) == ["private.json", "secret.svg"] and "renames A to A2" in md, (r.stderr[-300:], md))
        # audit 20, the security review of the fix above: a model committed as a dangling symbolic link (its target outside the
        # checkout, not there yet) read as deleted, and the deleted model's copy was written through the link, out of the checkout
        g = t / "g20l"; far = t / "g20l-outside"; (g / "docs").mkdir(parents=True); far.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        (g / "docs" / "a.json").write_text(json.dumps(two)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (g / "docs" / "a.json").unlink(); (g / "docs" / "a.json").symlink_to(far / "planted.json"); sh("add", "-A"); sh("commit", "-qm", "pr")
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD~1', '--out', 'out']; u.main()", str(ROOT)], cwd=g, capture_output=True, text=True)
        md = (g / "out" / "summary.md").read_text() if (g / "out" / "summary.md").is_file() else ""
        ok("diff --base · a model file that is a dangling symbolic link out of the checkout is not read nor written through (audit 20)",
           r.returncode == 0 and not (far / "planted.json").exists() and list(far.iterdir()) == [] and "**`docs/a.json`**: cannot be read: it is a symbolic link" in md,
           (r.returncode, list(far.iterdir()), md, r.stderr[-300:]))
        # audit 20: one file nested too deep for Python's parser ended diff --base in a RecursionError, with no summary for the rest;
        # render, drift and the MCP server read it the same way
        g = t / "g20d"; (g / "docs").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        (g / "docs" / "a.json").write_text(json.dumps(two)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (g / "docs" / "a.json").write_text(json.dumps(two | {"nodes": [two["nodes"][0] | {"label": "A2"}, two["nodes"][1]]}))
        (g / "docs" / "deep.json").write_text("[" * 100000 + "]" * 100000)
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD', '--out', 'out']; u.main()", str(ROOT)], cwd=g, capture_output=True, text=True)
        md = (g / "out" / "summary.md").read_text() if (g / "out" / "summary.md").is_file() else ""
        b = plain("render", str(g / "docs" / "deep.json"), "--out", str(t / "deep.html"), "--no-check")
        ok("diff --base and render · a file nested too deep is said in one line, and the other models are still diffed (audit 20)",
           r.returncode == 0 and "**`docs/deep.json`**: cannot be read: it nests too deep to read" in md and "renames A to A2" in md
           and b.returncode == 1 and b.stderr.strip().endswith("deep.json nests too deep to read") and "Traceback" not in r.stderr + b.stderr, (r.stderr[-300:], md, b.stderr[-300:]))
        # audit 20: upstream filled __VISUAL_TITLE__ after the model was in the page, so a card holding it took the title, and a
        # backslash in the title left the data block no JSON
        for title in ("Ops", "Ops \\ on-call"):
            (t / "vt20.json").write_text(json.dumps(two | {"title": title, "nodes": [two["nodes"][0] | {"label": "__VISUAL_TITLE__"}, two["nodes"][1]]}))
            b = plain("render", str(t / "vt20.json"), "--out", str(t / "vt20.html"), "--no-check")
            d = u.page_data(t / "vt20.html")[0] if b.returncode == 0 else {}
            ok(f"render · model text holding __VISUAL_TITLE__ stays data, the title {title!r} only in <title> (audit 20)",
               b.returncode == 0 and d["nodes"][0]["label"] == "__VISUAL_TITLE__" and d["title"] == title
               and f"<title>{title}</title>" in (t / "vt20.html").read_text(), (b.stderr[-300:], d.get("nodes")))
        # audit 20: a story id that is not a string rendered, then MCP's refit hashed it and answered an internal error
        (t / "sid20.json").write_text(json.dumps(two | {"stories": [{"id": ["tour"], "steps": [{"view": "main"}]}]}))
        b = plain("render", str(t / "sid20.json"), "--out", str(t / "sid20.html"), "--no-check")
        ok("render · a story id that is not a string is refused in one line naming it (audit 20)",
           b.returncode == 1 and b.stderr.strip().endswith("sid20.json: stories[0].id is not a string") and not (t / "sid20.html").exists(), b.stderr[-300:])
        # audit 21: a trace view named as a card turned that card, on every other view, into a way into the trace (a card opens
        # the view of its id)
        b = plain("trace", bike_m, rides, "--view", "pricing", "--match", str(ROOT / "examples" / "traces" / "match.json"), "--out", str(t / "tr21.json"))
        c = plain("trace", bike_m, rides, "--view", "pricing-trace", "--match", str(ROOT / "examples" / "traces" / "match.json"), "--out", str(t / "tr21b.json"))
        ok("trace · a --view that is a card's id is refused in one line, nothing written; another id is written (audit 21)",
           b.returncode == 1 and "--view 'pricing' is a card's id" in b.stderr and not (t / "tr21.json").exists() and c.returncode == 0, (b.stderr[-300:], c.stderr[-300:]))
        # audit 21: two models whose stems differ only in case shared one page and stills folder on a disk that ignores case
        g = t / "g21c"; (g / "docs").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        lab = lambda x: json.dumps(two | {"nodes": [two["nodes"][0] | {"label": x}, two["nodes"][1]]})
        (g / "docs" / "Map.json").write_text(lab("old-one")); (g / "Docs-map.json").write_text(lab("old-two")); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (g / "docs" / "Map.json").write_text(lab("NEW-ONE")); (g / "Docs-map.json").write_text(lab("NEW-TWO"))
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', '--base', 'HEAD', '--out', 'out']; u.main()", str(ROOT)], cwd=g, capture_output=True, text=True)
        outs = {x["file"]: x.get("out") for x in json.loads(r.stdout or "[]")}
        seen = {f: (Path(o).read_text() if o and Path(o).is_file() else "") for f, o in outs.items()}
        ok("diff --base · two models whose stems differ only in case get pages whose names differ in more than case, each its own model's (audit 21)",
           len({str(o).casefold() for o in outs.values()}) == 2 and "NEW-ONE" in seen.get("docs/Map.json", "") and "NEW-TWO" not in seen.get("docs/Map.json", "")
           and "NEW-TWO" in seen.get("Docs-map.json", "") and "NEW-ONE" not in seen.get("Docs-map.json", ""), (outs, r.stderr[-300:]))
        # audit 24: a model only moved (git mv) was said as every card removed from its old path and every card added at its new
        g = t / "g24m"; (g / "docs").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True)
        nocr = lambda *x: subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                                          "sys.argv = ['umlimator.py', 'diff', *sys.argv[2:]]; u.main()", str(ROOT), *x], cwd=g, capture_output=True, text=True)
        (g / "map.json").write_text(lab("old-one")); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        sh("mv", "map.json", "docs/map.json"); sh("commit", "-qm", "moved")
        r = nocr("--base", "HEAD~1", "--out", "out")
        md = (g / "out" / "summary.md").read_text(encoding="utf-8") if (g / "out" / "summary.md").is_file() else ""
        ok("diff --base · a model only moved is no change: no entry, no page (audit 24)",
           r.returncode == 0 and json.loads(r.stdout) == [] and "No map model changed." in md and not list((g / "out").glob("*.html")), (r.stdout, r.stderr[-300:], md))
        sh("mv", "docs/map.json", "docs/sh`op.json"); (g / "docs" / "sh`op.json").write_text(lab("NEW-ONE"))
        r = nocr("--base", "HEAD", "--out", "out2")
        got = json.loads(r.stdout or "[]")
        md = (g / "out2" / "summary.md").read_text(encoding="utf-8") if (g / "out2" / "summary.md").is_file() else ""
        ok("diff --base · a model moved and edited is one entry, its edit only, naming where it moved from (audit 24)",
           [(x["file"], x.get("movedFrom")) for x in got] == [("docs/sh`op.json", "docs/map.json")] and len(got[0]["summary"]) == 1 and "NEW-ONE" in got[0]["summary"][0]
           and "**`docs/sh'op.json` (moved from `docs/map.json`)**" in md and "removes" not in md, (got, md, r.stderr[-300:]))
        # audit 21: --out in a folder that cannot be written, or under a path that is a file, ended in a traceback
        (t / "afile").write_text("x")
        ro = t / "ro21"; ro.mkdir(); ro.chmod(0o500)
        runs = [plain("render", str(t / "vt20.json"), "--out", str(t / "afile" / "page.html"), "--no-check"),
                plain("import", str(ROOT / "tests" / "import" / "kubernetes.json"), "--out", str(t / "afile" / "x.json")),
                plain("trace", bike_m, rides, "--view", "t21", "--match", str(ROOT / "examples" / "traces" / "match.json"), "--out", str(t / "afile" / "t.json")),
                plain("stills", str(t / "vt20.html"), "--out", str(t / "afile" / "st")),
                subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "diff", "--base", "HEAD", "--out", str(t / "afile" / "d")], capture_output=True, text=True, cwd=g)]
        if os.geteuid() != 0:  # root writes anywhere
            runs.append(plain("import", str(ROOT / "tests" / "import" / "kubernetes.json"), "--out", str(ro / "x.json")))
        ro.chmod(0o700)
        ok("render, import, trace, stills, diff --base · an --out that cannot be written is said in one line, never a traceback (audit 21)",
           all(x.returncode == 1 and "Traceback" not in x.stderr and re.search(r"cannot (write|make the folder) .*\((a folder on its path is a file|Permission denied)\)", x.stderr) for x in runs),
           [x.stderr[-200:] for x in runs])

    if part("audit 25 diff"):
        nocr = lambda g, *x: subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                                             "sys.argv = ['umlimator.py', 'diff', *sys.argv[2:]]; u.main()", str(ROOT), *x], cwd=g, capture_output=True, text=True)
        lab = lambda x: json.dumps(two | {"nodes": [two["nodes"][0] | {"label": x}, two["nodes"][1]]})
        # audit 25: a model in a dot folder got a page and stills folder whose names start with a dot, which the Action's
        # artifact (upload-artifact, hidden files left out) dropped
        g = t / "g25d"; (g / ".architecture").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        (g / ".architecture" / "map.json").write_text(lab("old-one")); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (g / ".architecture" / "map.json").write_text(lab("NEW-ONE"))
        r = nocr(g, "--base", "HEAD", "--out", "out")
        got = json.loads(r.stdout or "[]")
        names = sorted(x.name for x in (g / "out").iterdir()) if (g / "out").is_dir() else []
        action = (ROOT / "action.yml").read_text(encoding="utf-8")  # the upload step, up to the next step
        up = re.search(r"^\s+include-hidden-files: true\b", action.partition("uses: actions/upload-artifact@")[2].partition("- id:")[0], re.M)
        ok("diff --base · a model in a dot folder gets a page whose name starts with no dot, and the Action's artifact takes hidden names too (audit 25)",
           [x["file"] for x in got] == [".architecture/map.json"] and names and not any(n.startswith(".") for n in names)
           and "NEW-ONE" in (g / "out" / "%2Earchitecture-map.html").read_text(encoding="utf-8") and up, (names, got, r.stderr[-300:]))
        # audit 25: a model moved with a plain mv, not yet added, was said as every card removed and every card added; and the
        # user's index is never written to find the move
        g = t / "g25m"; (g / "docs").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        (g / "map.json").write_text(lab("old-one")); (g / "keep.json").write_text(lab("keep")); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (g / "map.json").rename(g / "docs" / "m*[1] :x.json")  # a name that, read as a pathspec, would match or mean something else
        status = sh("status", "--porcelain", "-z", "--", ".", ":!out*").stdout
        r = nocr(g, "--base", "HEAD", "--out", "out")
        md = (g / "out" / "summary.md").read_text(encoding="utf-8") if (g / "out" / "summary.md").is_file() else ""
        ok("diff --base · a model moved with a plain mv, not added, is no change: no entry, no page; the index is as it was (audit 25)",
           r.returncode == 0 and json.loads(r.stdout or "null") == [] and "No map model changed." in md and not list((g / "out").glob("*.html"))
           and sh("status", "--porcelain", "-z", "--", ".", ":!out*").stdout == status, (r.stdout, r.stderr[-300:], md))
        (g / "docs" / "m*[1] :x.json").write_text(lab("NEW-ONE")); (g / "new.json").write_text(lab("brand new"))
        r = nocr(g, "--base", "HEAD", "--out", "out2")
        got = json.loads(r.stdout or "[]")
        ok("diff --base · a model moved with a plain mv and edited is one entry naming where it moved from; a new model is still new (audit 25)",
           [(x["file"], x.get("movedFrom")) for x in got] == [("docs/m*[1] :x.json", "map.json"), ("new.json", None)] and len(got[0]["summary"]) == 1
           and "NEW-ONE" in got[0]["summary"][0] and all("removes" not in y for x in got for y in x["summary"]) and sh("status", "--porcelain", "-z", "--", ".", ":!out*").stdout != status, (got, r.stderr[-300:]))

    if part("diff Action 2.6"):
        # the diff Action's step as CI runs it (C10, 2.6): a pull request's merge commit against its first parent, the pathspec
        # examples/*.json passed to git as written (set -f), on one object model and one package model
        a = t / "action"; (a / "examples").mkdir(parents=True)
        agit = lambda *x: subprocess.run(["git", "-C", str(a), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        agit("init", "-q")
        for f in ("order-objects", "bookshop-packages"):
            (a / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        agit("add", "examples"); agit("commit", "-q", "-m", "base")
        obj = json.loads((a / "examples" / "order-objects.json").read_text()); o = next(n for n in obj["nodes"] if n["id"] == "order-1042"); o["label"] = "order1043"; o["members"][0]["props"]["value"] = "paid"
        (a / "examples" / "order-objects.json").write_text(json.dumps(obj, indent=1))
        pkg = json.loads((a / "examples" / "bookshop-packages.json").read_text()); next(n for n in pkg["nodes"] if n["id"] == "book")["parent"] = "sales"
        (a / "examples" / "bookshop-packages.json").write_text(json.dumps(pkg, indent=1))
        agit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action-out"), "--models", "examples/*.json", cwd=a) or []
        by = {x["file"]: x for x in r}
        md = (t / "action-out" / "summary.md").read_text(encoding="utf-8") if (t / "action-out" / "summary.md").is_file() else ""
        ok("diff --base, as the Action runs it · an object model: what changed in words, its view, a page and a still",
           by.get("examples/order-objects.json", {}).get("summary") == ["renames order1042 to order1043 (members)"] and by["examples/order-objects.json"]["views"] == ["snapshot"]
           and (t / "action-out" / "examples-order-objects.html").is_file() and all(Path(s).is_file() for s in by["examples/order-objects.json"].get("stills", [None])), r)
        ok("diff --base, as the Action runs it · a package model: a re-own reads moves … into …, with its view, a page and a still",
           by.get("examples/bookshop-packages.json", {}).get("summary") == ["moves Book into sales"] and by["examples/bookshop-packages.json"]["views"] == ["packages"]
           and (t / "action-out" / "examples-bookshop-packages.html").is_file() and all(Path(s).is_file() for s in by["examples/bookshop-packages.json"].get("stills", [None])), r)
        ok("diff --base, as the Action runs it · the summary the Action posts names both files and what changed",
           md.startswith("<!-- umlimator-diff -->") and "**`examples/order-objects.json`**: snapshot" in md and "- renames order1042 to order1043" in md
           and "**`examples/bookshop-packages.json`**: packages" in md and "- moves Book into sales" in md and md.count("```mermaid") == 2, md[:800])

    if part("diff Action stage 4"):
        # C10 for stage 4 (S16, as 2.6 did): the Action's step on one model of each of the four types, each changed in a pull request
        b = t / "action4"; (b / "examples").mkdir(parents=True)
        bgit = lambda *x: subprocess.run(["git", "-C", str(b), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        bgit("init", "-q")
        FOUR = {"shopping-use-cases": ("track", "label", "Track a parcel", "shopping", "renames Track an order to Track a parcel"),
                "fulfil-activity": ("told", "parent", "lane-warehouse", "fulfil", "moves told into Warehouse"),
                "order-states": ("picking", "label", "Picking the books", "order-life", "renames Picking to Picking the books"),
                "buy-book-overview": ("ref-receipt", "label", "Email a receipt", "buy-book", "renames Email the receipt to Email a receipt")}
        for f in FOUR:
            (b / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        bgit("add", "examples"); bgit("commit", "-q", "-m", "base")
        for f, (nid, k, v, _, _) in FOUR.items():
            m = json.loads((b / "examples" / f"{f}.json").read_text()); next(n for n in m["nodes"] if n["id"] == nid)[k] = v
            (b / "examples" / f"{f}.json").write_text(json.dumps(m, indent=1))
        bgit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action4-out"), "--models", "examples/*.json", cwd=b) or []
        by = {x["file"]: x for x in r}
        md = (t / "action4-out" / "summary.md").read_text(encoding="utf-8") if (t / "action4-out" / "summary.md").is_file() else ""
        for f, (_, _, _, view, said) in FOUR.items():
            x = by.get(f"examples/{f}.json", {})
            ok(f"diff --base, as the Action runs it · {f}: what changed in words, its view, a page and a still",
               x.get("summary") == [said] and x.get("views") == [view] and (t / "action4-out" / f"examples-{f}.html").is_file() and all(Path(s).is_file() for s in x.get("stills", [None]))
               and f"**`examples/{f}.json`**: {view}" in md and f"- {said}" in md, x)

    if part("diff Action stage 5"):
        # C10 for stage 5 (S18, 5.8): the Action's step on one model of each of the three types, each changed in a pull request
        b = t / "action5"; (b / "examples").mkdir(parents=True)
        bgit = lambda *x: subprocess.run(["git", "-C", str(b), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        bgit("init", "-q")
        THREE = {"bookshop-components": ("order-worker", "label", "Order processor", "components", "renames Order worker to Order processor"),
                 "bookshop-deployment": ("database", "label", "Primary database", "production", "renames Database to Primary database"),
                 "order-service-structure": ("order-events", "label", "orderFlow", "internals", "renames orderEvents to orderFlow")}
        for f in THREE:
            (b / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        bgit("add", "examples"); bgit("commit", "-q", "-m", "base")
        for f, (nid, k, v, _, _) in THREE.items():
            m = json.loads((b / "examples" / f"{f}.json").read_text()); next(n for n in m["nodes"] if n["id"] == nid)[k] = v
            (b / "examples" / f"{f}.json").write_text(json.dumps(m, indent=1))
        bgit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action5-out"), "--models", "examples/*.json", cwd=b) or []
        by = {x["file"]: x for x in r}
        md = (t / "action5-out" / "summary.md").read_text(encoding="utf-8") if (t / "action5-out" / "summary.md").is_file() else ""
        for f, (_, _, _, view, said) in THREE.items():
            x = by.get(f"examples/{f}.json", {})
            ok(f"diff --base, as the Action runs it · {f}: what changed in words, its view, a page and a still",
               x.get("summary") == [said] and x.get("views") == [view] and (t / "action5-out" / f"examples-{f}.html").is_file() and all(Path(s).is_file() for s in x.get("stills", [None]))
               and f"**`examples/{f}.json`**: {view}" in md and f"- {said}" in md, x)

    if part("diff Action stage 6"):
        # C10 for stage 6 (6.6): the Action's step on a profile and a timing model, each changed in a pull request
        b = t / "action6"; (b / "examples").mkdir(parents=True)
        bgit = lambda *x: subprocess.run(["git", "-C", str(b), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        bgit("init", "-q")
        TWO = {"bookshop-profile": ("conventions", "label", "ShopConventions", "profile", "renames BookshopConventions to ShopConventions"),
               "bookshop-timing": ("lifeline-payments", "label", "provider", "one-charge", "renames payments to provider")}
        for f in TWO:
            (b / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        bgit("add", "examples"); bgit("commit", "-q", "-m", "base")
        for f, (nid, k, v, _, _) in TWO.items():
            m = json.loads((b / "examples" / f"{f}.json").read_text()); next(n for n in m["nodes"] if n["id"] == nid)[k] = v
            (b / "examples" / f"{f}.json").write_text(json.dumps(m, indent=1))
        bgit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action6-out"), "--models", "examples/*.json", cwd=b) or []
        by = {x["file"]: x for x in r}
        md = (t / "action6-out" / "summary.md").read_text(encoding="utf-8") if (t / "action6-out" / "summary.md").is_file() else ""
        for f, (_, _, _, view, said) in TWO.items():
            x = by.get(f"examples/{f}.json", {})
            ok(f"diff --base, as the Action runs it · {f}: what changed in words, its view, a page and a still",
               x.get("summary") == [said] and x.get("views") == [view] and (t / "action6-out" / f"examples-{f}.html").is_file() and all(Path(s).is_file() for s in x.get("stills", [None]))
               and f"**`examples/{f}.json`**: {view}" in md and f"- {said}" in md, x)

    # C10's package (0.22.0): the Action's step on one model of each type left, each changed in a pull request; where order
    # means something (a class's members, a sequence's or a communication's messages, a component's ports) a reorder reads
    # "moves"
    def members(m, nid):
        n = next(x for x in m["nodes"] if x["id"] == nid); n["members"][:2] = n["members"][1::-1]
    def messages(m, first):
        E = m["views"][0]["edges"]  # a sequence view's own lines, or a communication view's message ids (they number them)
        i = next(k for k, e in enumerate(E) if (e.get("id") if isinstance(e, dict) else e) == first); E[i], E[i + 1] = E[i + 1], E[i]
    def rename(m, nid, label):
        next(x for x in m["nodes"] if x["id"] == nid)["label"] = label
    if part("diff Action package"):
        SIX = {"sales-classes": (lambda m: members(m, "customer"), "domain", "moves email after name in Customer"),
               "checkout-sequence": (lambda m: messages(m, "m3"), "checkout-sequence", "moves validate(order) after charge(total)"),
               "checkout-communication": (lambda m: messages(m, "cm3"), "checkout-communication", "moves validate(order) after charge(total)"),
               "bookshop-components": (lambda m: members(m, "shop-api"), "components", "moves orders after payments in Shop API"),
               "bookshop-deployment": (lambda m: rename(m, "browser", "Browser"), "production", "renames Web browser to Browser"),
               "order-service-structure": (lambda m: members(m, "order-service"), "internals", "moves api after payments in OrderService")}
        c = t / "action-c10"; (c / "examples").mkdir(parents=True)
        cgit = lambda *x: subprocess.run(["git", "-C", str(c), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        cgit("init", "-q")
        for f in SIX:
            (c / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        cgit("add", "examples"); cgit("commit", "-q", "-m", "base")
        for f, (change, _, _) in SIX.items():
            m = json.loads((c / "examples" / f"{f}.json").read_text()); change(m)
            (c / "examples" / f"{f}.json").write_text(json.dumps(m, indent=1))
        cgit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action-c10-out"), "--models", "examples/*.json", cwd=c) or []
        by = {x["file"]: x for x in r}
        md = (t / "action-c10-out" / "summary.md").read_text(encoding="utf-8") if (t / "action-c10-out" / "summary.md").is_file() else ""
        for f, (_, view, said) in SIX.items():
            x = by.get(f"examples/{f}.json", {})
            ok(f"diff --base, as the Action runs it (C10) · {f}: what changed in words, its view, a page and a still",
               x.get("summary") == [said] and view in (x.get("views") or []) and (t / "action-c10-out" / f"examples-{f}.html").is_file() and all(Path(s).is_file() for s in x.get("stills", [None]))
               and f"- {said}" in md, x)

    if part("diff Action milestone 2"):
        # C10 for milestone 2 (M2.14): the Action's step on one model of each of the five types, each changed in a pull request
        FIVE = {"bookshop-schema": (lambda m: rename(m, "er-customer", "client"), "er-schema", "renames customer to client"),
                "returns-flowchart": (lambda m: rename(m, "inspect", "Check the book"), "returns", "renames Inspect the book to Check the book"),
                "bookshop-data-flow": (lambda m: rename(m, "dfd-courier", "Carrier"), "dfd-level-1", "renames Courier to Carrier"),
                "order-information-flow": (lambda m: rename(m, "email-service", "Mailer"), "order-flows", "renames Email service to Mailer"),
                "bookshop-c4": (lambda m: rename(m, "c4-staff", "Staff"), "c4-context", "renames Shop staff to Staff"),
                # 4a.7: milestone 4a's three examples (C10, decision 22), with no icon pack: CI never has one (S18)
                "bookshop-opening-plan": (lambda m: rename(m, "mm-checkout", "Payment"), "mm-plan", "renames Checkout to Payment"),
                "bookshop-gcp": (lambda m: rename(m, "gcp-api", "Store API"), "gcp-on-gcp", "renames Shop API to Store API"),
                "bookshop-azure": (lambda m: rename(m, "az-db", "Orders database"), "az-on-azure", "renames Database to Orders database"),
                # 4b.5: the BPMN example
                "bookshop-order-to-shipment": (lambda m: rename(m, "bp-take-payment", "Charge the card"), "order-to-shipment", "renames Take payment to Charge the card")}
        d = t / "action-m2"; (d / "examples").mkdir(parents=True)
        dgit = lambda *x: subprocess.run(["git", "-C", str(d), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        dgit("init", "-q")
        for f in FIVE:
            (d / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        dgit("add", "examples"); dgit("commit", "-q", "-m", "base")
        for f, (change, _, _) in FIVE.items():
            m = json.loads((d / "examples" / f"{f}.json").read_text()); change(m)
            (d / "examples" / f"{f}.json").write_text(json.dumps(m, indent=1))
        dgit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action-m2-out"), "--models", "examples/*.json", cwd=d) or []
        by = {x["file"]: x for x in r}
        md = (t / "action-m2-out" / "summary.md").read_text(encoding="utf-8") if (t / "action-m2-out" / "summary.md").is_file() else ""
        for f, (_, view, said) in FIVE.items():
            x = by.get(f"examples/{f}.json", {})
            ok(f"diff --base, as the Action runs it (C10, M2.14, 4a.7, 4b.5) · {f}: what changed in words, its view, a page and a still",
               x.get("summary") == [said] and view in (x.get("views") or []) and (t / "action-m2-out" / f"examples-{f}.html").is_file() and all(Path(s).is_file() for s in x.get("stills", [None]))
               and f"- {said}" in md, x)

    if part("diff Action milestone 3"):
        # C10 for milestone 3 (M3.7): the Action's step on SysML's four e-bike models, each changed in a pull request
        SYSML = {"ebike-requirements": (lambda m: rename(m, "capacity", "Pack capacity"), "requirements", "renames Battery capacity to Pack capacity"),
                 "ebike-blocks": (lambda m: rename(m, "rental-vehicle", "HireVehicle"), "blocks", "renames RentalVehicle to HireVehicle"),
                 "ebike-structure": (lambda m: rename(m, "ebike", "Bike"), "inside-ebike", "renames EBike to Bike"),
                 "ebike-range": (lambda m: rename(m, "ebike", "Bike"), "range-analysis", "renames EBike to Bike")}
        d = t / "action-m3"; (d / "examples").mkdir(parents=True)
        dgit = lambda *x: subprocess.run(["git", "-C", str(d), "-c", "user.name=test", "-c", "user.email=test@example.invalid", *x], capture_output=True, text=True, check=True)
        dgit("init", "-q")
        for f in SYSML:
            (d / "examples" / f"{f}.json").write_text((ROOT / "examples" / f"{f}.json").read_text(encoding="utf-8"), encoding="utf-8")
        dgit("add", "examples"); dgit("commit", "-q", "-m", "base")
        for f, (change, _, _) in SYSML.items():
            m = json.loads((d / "examples" / f"{f}.json").read_text()); change(m)
            (d / "examples" / f"{f}.json").write_text(json.dumps(m, indent=1))
        dgit("commit", "-q", "-am", "the pull request")
        r = cli("diff", "--base", "HEAD^1", "--out", str(t / "action-m3-out"), "--models", "examples/*.json", cwd=d) or []
        by = {x["file"]: x for x in r}
        md = (t / "action-m3-out" / "summary.md").read_text(encoding="utf-8") if (t / "action-m3-out" / "summary.md").is_file() else ""
        for f, (_, view, said) in SYSML.items():
            x = by.get(f"examples/{f}.json", {})
            ok(f"diff --base, as the Action runs it (C10, M3.7) · {f}: what changed in words, its view, a page and a still",
               x.get("summary") == [said] and view in (x.get("views") or []) and (t / "action-m3-out" / f"examples-{f}.html").is_file() and all(Path(s).is_file() for s in x.get("stills", [None]))
               and f"- {said}" in md, x)

    # map-repo's CLI (C10): the skill writes maps only, and renders a typed model it is given, every type on main. Its
    # launcher runs a release from its cache; this checkout stands in for one (UMLIMATOR_REF, an empty UMLIMATOR_SHA)
    (t / "skill-cache").mkdir()
    (t / "skill-cache" / "local").symlink_to(ROOT, target_is_directory=True)
    skill_env = {**os.environ, "UMLIMATOR_CLI_CACHE": str(t / "skill-cache"), "UMLIMATOR_REF": "local", "UMLIMATOR_SHA": ""}
    TYPED = [ROOT / "examples" / f"{n}.json" for n in ("sales-classes", "order-objects", "bookshop-packages", "checkout-sequence", "checkout-communication",
                                                       "shopping-use-cases", "fulfil-activity", "order-states", "buy-book-overview",
                                                       "bookshop-components", "bookshop-deployment", "order-service-structure",
                                                       "bookshop-profile", "bookshop-timing",
                                                       "bookshop-schema", "returns-flowchart", "bookshop-data-flow", "order-information-flow", "bookshop-c4",
                                                       "ebike-requirements", "ebike-blocks", "ebike-structure", "ebike-range",
                                                       "bookshop-opening-plan", "bookshop-gcp", "bookshop-azure",
                                                       "bookshop-order-to-shipment")]
    for path in TYPED:
        if not part(f"map-repo {path.stem}"):
            continue
        p = subprocess.run([sys.executable, str(ROOT / "plugins" / "umlimator" / "skills" / "map-repo" / "scripts" / "cli.py"), "render", str(path),
                            "--out", str(t / f"skill-{path.stem}.html")], capture_output=True, text=True, env=skill_env)
        try:
            r = json.loads(p.stdout)
        except ValueError:
            r = None
        # the pinned crossings of examples 9 and 10, as render's own check above (stage 5's three are clean since decision 22)
        said = {"fulfil-activity": ["cross"] * 2, "order-states": ["cross"] * 2, "bookshop-c4": ["cross"] * 8, "bookshop-data-flow": ["cross"] * 2,
                "bookshop-gcp": ["cross"], "bookshop-azure": ["cross"] * 2, "bookshop-order-to-shipment": ["cross"] * 5}.get(path.stem, [])
        ok(f"map-repo's cli.py · renders a typed model it is given ({path.stem}): the page, and its check" + (f" (at most {len(said)} crossings, stated)" if said else " clean"),
           p.returncode == 0 and r is not None and not r.get("errors") and all(q.endswith(" cross") for q in r.get("problems") or []) and len(r.get("problems") or []) <= len(said)
           and (t / f"skill-{path.stem}.html").is_file(), (p.returncode, p.stdout[-400:], p.stderr[-400:]))

    if part("map-repo pin"):
        # map-repo's pin (C10, audit 23): it ran v0.31.0 for eleven releases, so the pages it wrote embedded any local file an
        # intake logo named (risks.md S1; own_logos, audit 18) and fetched the addresses an example or avatar names (own_media,
        # audit 19), and no release has those guards yet. The pinned commit, fetched as the skill fetches it, renders a hostile
        # model without them; and its version is the newest release up to package.json's (a release PR, whose own tag comes at
        # its merge, keeps the one before; once tagged, the pin moves). Needs the network, as the skill's first use does
        launcher = (ROOT / "plugins" / "umlimator" / "skills" / "map-repo" / "scripts" / "cli.py").read_text(encoding="utf-8")
        ref, sha = re.search(r'REF, SHA = "([^"]+)", "([0-9a-f]{40})"', launcher).groups()
        ver = lambda p: tuple(map(int, json.loads(Path(p).read_text())["version"].split(".")))
        ls = subprocess.run(["git", "ls-remote", "--tags", "https://github.com/zintaen/umlimator.git", "v*"], capture_output=True, text=True, timeout=60)
        if ls.returncode:
            print("skip map-repo's pin: the release tags could not be listed (no network)", ls.stderr[-300:])
        else:
            home = t / "skill-pinned"
            (home / "repo" / "docs").mkdir(parents=True)
            (home / "repo" / "secret.txt").write_text("SECRET-TOKEN-abc123\n")
            (home / "repo" / "docs" / "map.json").write_text(json.dumps({"title": "T", "nodes": [{"id": "a", "label": "A", "examples": [{"title": "x", "thumb": "https://tracker.example/t.png"}]}], "edges": [],
                "authors": {"someone": {"avatar": "https://tracker.example/a.png"}},
                "views": [{"id": "root", "title": "Root", "nodeIds": ["a"], "intake": [{"label": "In", "to": "a", "logo": "../secret.txt"}, {"label": "Abs", "to": "a", "logo": str(home / "repo" / "secret.txt")}]}]}))
            env = {k: v for k, v in os.environ.items() if k not in ("UMLIMATOR_REF", "UMLIMATOR_SHA")}
            p = subprocess.run([sys.executable, str(ROOT / "plugins" / "umlimator" / "skills" / "map-repo" / "scripts" / "cli.py"), "render", "docs/map.json", "--out", "map.html", "--no-check"],
                               capture_output=True, text=True, cwd=home / "repo", env={**env, "UMLIMATOR_CLI_CACHE": str(home / "cache")}, timeout=600)
            page = (home / "repo" / "map.html").read_text(encoding="utf-8") if (home / "repo" / "map.html").is_file() else ""
            blobs = [base64.b64decode(b + "=" * (-len(b) % 4)) for b in re.findall(r"base64,([A-Za-z0-9+/=]+)", page)]
            ok(f"map-repo's cli.py · its pinned commit ({ref}) leaves a logo outside the model's folder, and an example's or avatar's address, out of the page (risks.md S1, S2; audit 23)",
               p.returncode == 0 and page and "SECRET-TOKEN" not in page and not any(b"SECRET-TOKEN" in b for b in blobs) and "tracker.example" not in page
               and "outside the model's folder" in p.stderr, (p.returncode, p.stderr[-800:]))
            released = [tuple(map(int, q)) for q in re.findall(r"refs/tags/v(\d+)\.(\d+)\.(\d+)$", ls.stdout, re.M)]
            newest, pinned = max(v for v in released if v <= ver(ROOT / "package.json")), (home / "cache" / ref / "package.json")
            ok(f"map-repo's cli.py · its pinned commit is version {'.'.join(map(str, newest))}, the newest release up to package.json's (audit 23)",
               pinned.is_file() and ver(pinned) == newest and ref.startswith(".".join(map(str, newest))), (ref, pinned.is_file() and ver(pinned), newest))

    # pdf (#93): the bike share as a document for a review; its words are text. A cover with the contents; each view from a
    # page of its own, under its path, with its legend and tables of its cards, lines and boxes; the rules as a table. The
    # words are compared without spaces: a PDF's text keeps none where a line wraps or between two runs of text, and where
    # a line wraps depends on the fonts a system has
    flat = lambda s: re.sub(r"\s", "", s)
    read = lambda f: [flat(p) for p in pdf_text((t / f).read_bytes())] if (t / f).is_file() else []
    if part("pdf bike share"):
        cli("render", str(ROOT / "examples" / "bike-share.json"), "--out", str(t / "bike.html"), "--no-check")
        r = cli("pdf", str(t / "bike.html"), "--out", str(t / "bike.pdf")) or {}
        pages = read("bike.pdf")
        ok("pdf · every page ends in the title and page N of M, as many pages as it says",
           pages and r.get("pages") == len(pages) and all(p.endswith(flat(f"Bike share, an example page {i} of {len(pages)}")) for i, p in enumerate(pages, 1)), [r, [p[-40:] for p in pages]])
        V = {v["id"]: v for v in bike["views"]}
        path = lambda v: (path(V[v["parent"]]) + " › " if v.get("parent") else "") + v["title"]
        at = {v["id"]: next((i for i, p in enumerate(pages, 1) if p.startswith(flat(f"{path(v)} {len(v['nodeIds'])} cards"))), None) for v in bike["views"]}
        at["rules"] = next((i for i, p in enumerate(pages, 1) if p.startswith("Rules")), None)
        cover = pages[0] if pages else ""
        ok("pdf · the cover: the title, the date, the model's file, a summary line, and the contents, each view with the page its header starts",
           re.match(r"Bikeshare,anexample\d{4}-\d\d-\d\d·examples/bike-share\.json5views·32cards·48lines·2rulesContents", cover) and None not in at.values()
           and all(flat(f"{v['title']}{v['caption']}{at[v['id']]}") in cover for v in bike["views"]) and f"Rules{at['rules']}Bikeshare" in cover, [cover[:500], at])
        seen = lambda a, b=None: "".join(pages[a - 1:b and b - 1]) if a else ""  # the pages from page a to the one before b
        ok("pdf · a view's page: its legend, then tables of its cards (name, sub-line, kind, what it is), lines (from → to, label, technology) and boxes",
           "Legend" in seen(at["system"], at["system"] and at["system"] + 1) and all(flat(s) in seen(at["system"], at["trips"]) for s in [
               "CardKindWhat it is", "Payment providercards and walletsExternalTakes card and wallet payments.", "From → toLabelTechnology",
               "Rider app → Trip servicestarts, ends ridesREST", "BoxHolds", "RidesAccounts, Trip service, Pricing and Trips database"])
           and flat("#From → toLabelTechnology1Rider app → Trip APIPOST /rides/{id}/end200 ms") in seen(at["ride-end"]), seen(at["system"], at["trips"])[:600])
        ok("pdf · the rules, as a table: each rule, the views it applies in, holds or broken, and what breaks it", flat(
           "RuleApplies inStateLines that break itApps never call a database directlyevery view printedholdsnoneOnly the ride services touch the trips storeWhat runsholdsnone") in pages[-1], pages[-1:])
        r = cli("pdf", str(t / "bike.html"), "--out", str(t / "two.pdf"), "--views", "system,f*", "--theme", "dark") or {}
        two = read("two.pdf")
        heads = {m.group(1) for p in two[1:-1] if (m := re.match(r"(.*?)(?:\(continued\))?\d+cards?", p))}
        ok("pdf --views · only the views named (a trailing * a prefix), then the rules", r.get("pages") == len(two) and "2views·" in two[0]
           and heads == {flat("Bike share › What runs"), flat("Bike share › What runs › Fleet service")} and two[-1].startswith("Rules"), [r, [p[:40] for p in two]])
        dark = fills((t / "two.pdf").read_bytes()) if two else []
        ok("pdf --theme dark · its pages are dark to the edge", dark and max(dark[0]) < .15, dark[:3])
    # schema version 2 (1.8): typed models go through the upstream engine's check (a line may end on a member, F3), the
    # page bakes no layout into a typed view (F4), and render, check, stills and pdf work on them
    # 3.8: a sequence model's interaction use sits among its messages in the view's `edges` with no ends, and the copy
    # upstream checks leaves it out (F3: it was "an unknown end")
    for name, path in (("sales-classes", ROOT / "examples" / "sales-classes.json"), ("order-objects", ROOT / "examples" / "order-objects.json"),
                       ("bookshop-packages", ROOT / "examples" / "bookshop-packages.json"), ("checkout-sequence", ROOT / "examples" / "checkout-sequence.json"),
                       ("checkout-communication", ROOT / "examples" / "checkout-communication.json"),
                       # 4.10: the use case, activity, state machine and interaction overview examples; 5.8: the component example
                       # (its case points at the moved file) and the deployment and composite structure examples
                       *((n, ROOT / "examples" / f"{n}.json") for n in ("shopping-use-cases", "fulfil-activity", "order-states", "buy-book-overview",
                                                                       "bookshop-components", "bookshop-deployment", "order-service-structure",
                                                                       # 6.6: the profile and timing examples
                                                                       "bookshop-profile", "bookshop-timing",
                                                                       # M2.14: milestone 2's five examples
                                                                       "bookshop-schema", "returns-flowchart", "bookshop-data-flow", "order-information-flow", "bookshop-c4",
                                                                       # M3.7: SysML's four e-bike examples
                                                                       "ebike-requirements", "ebike-blocks", "ebike-structure", "ebike-range",
                                                                       # 4a.7: milestone 4a's three examples, rendered here with no pack
                                                                       "bookshop-opening-plan", "bookshop-gcp", "bookshop-azure",
                                                                       # 4b.5: the BPMN example
                                                                       "bookshop-order-to-shipment"))):
        if not part(f"typed {name}"):
            continue
        src = json.loads(path.read_text())
        r = cli("render", str(path), "--out", str(t / f"{name}.html"))
        # 4.10: the crossings that turning port repair off leaves in examples 9 and 10 (notes/stage-4.md §17), pinned in their
        # types' tests and stated in their conformance notes; nothing else
        # at most these: text widths differ between machines (Linux CI counts fewer than a Mac), so the count is a ceiling
        # M2.14: the crossings repair and reroute off leave in the C4 and data flow examples (notes/milestone-2.md §11), as Chrome
        # counts them (tests/atlas.test.mjs counts Node's); stated in docs/conformance/c4.md and dfd.md
        # 4a.7: the Google Cloud and Azure examples' one each, repair and reroute off (notes/milestone-4a.md §11), stated in
        # docs/conformance/gcp.md and azure.md; the Azure example's two since audit 27 (a line no longer runs back through its own box)
        # 4b.5: the BPMN example's, repair and reroute off (notes/milestone-4b.md §14), stated in docs/conformance/bpmn.md
        crossings = {"fulfil-activity": 2, "order-states": 2, "bookshop-c4": 8, "bookshop-data-flow": 2, "bookshop-gcp": 1, "bookshop-azure": 2, "bookshop-order-to-shipment": 5}.get(name, 0)
        ok(f"render · a typed model ({name}): the engine accepts lines that end on members, and the check is clean" + (f" but its {crossings} pinned crossings" if crossings else ""),
           r is not None and len(r.get("problems") or []) <= crossings and all(p.endswith(" cross") for p in r.get("problems") or []) and not r.get("errors"), r)
        page = (t / f"{name}.html").read_text(encoding="utf-8") if r else ""
        data = re.search(r'<script[^>]*id="visual-data"[^>]*>(.*?)</script>', page, re.S)
        views = json.loads(data.group(1))["views"] if data else []
        ok(f"render · {name}: no layout is baked into a typed view; one the model gives is kept",
           views and all(("layout" in v) == ("layout" in w) for v, w in zip(views, src["views"])), [(v["id"], "layout" in v) for v in views])
        c = cli("check", str(t / f"{name}.html"))
        ok(f"check · {name}: every view checked, nothing wrong" + (f" but its {crossings} pinned crossings" if crossings else ""), c is not None and c.get("checked")
           and len(c["problems"]) <= crossings and all(p.endswith(" cross") for p in c["problems"]) and not c["errors"], c)
        st = cli("stills", str(t / f"{name}.html"), "--out", str(t / f"stills-{name}"))
        ok(f"stills · {name}: a picture of every view", st is not None and len(list((t / f"stills-{name}").glob("*.png"))) == len(src["views"]), st)
        pd = cli("pdf", str(t / f"{name}.html"), "--out", str(t / f"{name}.pdf"))
        ok(f"pdf · {name}: written", pd is not None and (t / f"{name}.pdf").read_bytes()[:5] == b"%PDF-", pd)
    # R8: a class view's tables list each element by its drawn name (audit 1: payments::Payable, ada : Customer), its type and members, as the type prints them, and each line's kind
    if part.of("typed sales-classes"):
        txt = "".join(read("sales-classes.pdf"))
        ok("pdf · sales-classes: its tables list element types, members and line kinds, not the map's kinds",
           all(flat(s) in txt for s in ["CardKindMembers", "OrderClass- id: UUID", "+ add(book: Book, quantity: Integer)", "MoneyData type+ amount: Decimal",
                                        "From → toLabelKind", "Customer → OrderplacesAssociation", "payments::card::CardPayment → payments::PaymentGeneralization", "Order → payments::PayableInterface realization"])
           and "Script" not in txt and "calls" not in txt, txt[:800])
    # 2.6: the object diagram's tables list each instance with its slots, the package diagram's each element's kind and each line's
    if part.of("typed order-objects"):
        txt = "".join(read("order-objects.pdf"))
        ok("pdf · order-objects: its tables list each instance's kind and its slots as feature = value, and each link",
           all(flat(s) in txt for s in ["CardKindMembers", "order1042 : OrderInstance specificationstatus = placedtotal = 34.00 EUR", "card : CardPaymentInstance specificationamount = 34.00 EURlast4 = 4242",
                                        "From → toLabelKind", "ada : Customer → order1042 : OrderplacesLink", "order1042 : Order → card : CardPaymentLink"]) and "Script" not in txt and "calls" not in txt, txt[:800])
    if part.of("typed bookshop-packages"):
        txt = "".join(read("bookshop-packages.pdf"))
        ok("pdf · bookshop-packages: its tables list each element's kind (package, class, interface, enumeration, data type) and each line's",
           all(flat(s) in txt for s in ["CardKindMembers", "sharedPackageMoneyData type", "OrderStatusEnumeration", "PayableInterface", "wholesalePackageOrderClass",
                                        "catalog → sharedPackage import", "wholesale → salesPackage merge", "sales → paymentsDependency"]) and "Script" not in txt and "calls" not in txt, txt[:800])
    # 3.8: a sequence's and a communication's tables give each lifeline's kind and each message's, connectors too (R8)
    if part.of("typed checkout-sequence"):
        txt = "".join(read("checkout-sequence.pdf"))
        ok("pdf · checkout-sequence: its tables list each lifeline and each message between two lifelines, by kind",
           all(flat(s) in txt for s in ["CardKindMembers", "api : ShopApiLifeline", "From → toLabelKind", "shopper : Shopper → storefront : Storefrontcheckout()Message", "payments : PaymentProvider → api : ShopApipaidMessage"])
           and "Script" not in txt and "calls" not in txt, txt[:800])
    if part.of("typed checkout-communication"):
        txt = "".join(read("checkout-communication.pdf"))
        ok("pdf · checkout-communication: its tables list each lifeline, each connector and each message, by kind",
           all(flat(s) in txt for s in ["api : ShopApiLifeline", "api : ShopApi → payments : PaymentProviderConnector", "api : ShopApi → payments : PaymentProvidercharge(total)Message", "1.1.2.1: paid"])
           and "Script" not in txt and "calls" not in txt, txt[:800])
    # 4.10: the four stage 4 types' tables (notes/stage-4.md §15): a use case's extension points, an activity node's kind and
    # its partition, a state's internal transitions and a composite's regions, an overview node's kind; each line's kind
    if part.of("typed shopping-use-cases"):
        txt = "".join(read("shopping-use-cases.pdf"))
        ok("pdf · shopping-use-cases: its tables list each actor, subject and use case by kind, a use case's extension points, each line's kind",
           all(flat(s) in txt for s in ["Elements", "CardKindMembers", "ShopperActor", "Online bookshopSubject", "Check outUse casepaymentextras",
                                        "From → toLabelKind", "Shopper → Browse the catalogAssociation", "Check out → Pay for the orderInclude", "Redeem a voucher → Check outExtend",
                                        "Member → ShopperGeneralization"]), txt[:800])
    if part.of("typed fulfil-activity"):
        txt = "".join(read("fulfil-activity.pdf"))
        ok("pdf · fulfil-activity: its tables list each node's kind and its partition (rows), each partition, each flow's kind",
           all(flat(s) in txt for s in ["Order workerPartition", "All books in stock?Decisionin Warehouse", "Stock levelsData storein Warehouse", "Take paymentCall behaviour actionin Order worker",
                                        "Flow finalFlow finalin Email service", "Initial nodeInitial node", "Control flow", "Object flow"]), txt[:800])
    if part.of("typed order-states"):
        txt = "".join(read("order-states.pdf"))
        ok("pdf · order-states: its tables list each element's kind (a pseudostate's), a state's entry, do and exit and internal transitions, a composite's regions, each transition",
           # the state type's `word` and `rows` (notes/stage-4.md §15, decision 18): a pseudostate by its kind, a state's activities
           all(flat(s) in txt for s in ["PlacedStateentry / reserve the books", "address changed / update the deliveryaddress", "FulfillingComposite stateregion Parcelregion Payment", "Initial pseudostateInitial pseudostate", "ChoiceChoice", "Final stateFinal state",
                                        "Initial pseudostate → PlacedTransition", "Capturing payment → CancelledTransition"]), txt[:800])
    if part.of("typed buy-book-overview"):
        txt = "".join(read("buy-book-overview.pdf"))
        ok("pdf · buy-book-overview: its tables list each node's kind and each flow, then each sequence view it opens",
           all(flat(s) in txt for s in ["Find a bookInteraction use", "Queue the orderInteraction", "Payment accepted?Decision node", "Fork nodeFork node", "Payment accepted? → Fork nodeControl flow",
                                        "storefront : Storefront → api : ShopApifindBooks(title)Message"]), txt[:800])
    # 5.8: the three stage 5 types' tables (notes/stage-5.md §11): a component's ports with what they provide, an interface's
    # kind, what an artifact manifests; a target's kind and what is deployed on it; the subject's parts with their
    # aggregation, a collaboration use's collaboration and bindings. A connector is a Lines row, once (audit 17), naming its kind
    # and ports (audit 18)
    if part.of("typed bookshop-components"):
        txt = "".join(read("bookshop-components.pdf"))
        ok("pdf · bookshop-components: its tables list each component's ports and what they provide, each interface and artifact by kind, each line between elements, a connector once",
           all(flat(s) in txt for s in ["Elements", "Shop APIComponentorders, provides Orderspayments", "OrdersInterface", "shop-api.jarArtifactmanifests Shop API",
                                        "From → toLabelKind", "Storefront → OrdersUsage", "shop-api.jar → Shop APIManifestation",
                                        "Shop API → CheckoutDelegation from orders of Shop API to orders of CheckoutConnector", "Shop API → Payment providerAssembly from payments of Shop API to charges of Payment providerConnector"])
           and txt.count(flat("Delegation from")) == 2, txt[:800])  # each delegation once, in its Lines row, with its kind and ports (audit 18)
    if part.of("typed bookshop-deployment"):
        txt = "".join(read("bookshop-deployment.pdf"))
        ok("pdf · bookshop-deployment: its tables list each target's kind and what is deployed on it (by nesting or a line), each artifact's manifestation, each path",
           all(flat(s) in txt for s in ["Shopper's deviceDevice", "Java 21 runtimeExecution environmentshop-api.jarorder-worker.jarshop-api.yaml", "Edge proxyNoderoutes.conf, by «deploy»",
                                        "shop-api.yamlDeployment specification", "order-worker.jarArtifactmanifests Order worker",
                                        "Edge proxy → Application serverHTTPCommunication path", "routes.conf → Edge proxyDeployment"]), txt[:800])
    # audit 15: the cover counts the lines each view's Lines table lists (it said 0 for the composite structure's 8, 9 for the sequence's 10)
    if part.of("typed checkout-sequence"):
        ok("pdf · a typed model's cover counts the lines its views' tables list", all(re.search(rf"1view·\d+cards·{n}lines", (read(f"{name}.pdf") or [""])[0])
           for name, n in (("order-service-structure", 8), ("checkout-sequence", 10))), [(read(f"{name}.pdf") or [""])[0][:120] for name in ("order-service-structure", "checkout-sequence")])
    if part.of("typed order-service-structure"):
        txt = "".join(read("order-service-structure.pdf"))
        ok("pdf · order-service-structure: its tables list the subject's ports and parts, each part shared or composite, the collaboration use's collaboration and bindings, the collaboration's roles, a connector once",
           all(flat(s) in txt for s in ["OrderServiceClassport apiport payments", "checkout : CheckoutFlow [1], composite", "listeners : OrderListener [0..*], shared",
                                        "orderEvents : PublishSubscribeCollaboration usePublishSubscribepublisher ← checkoutsubscriber ← listeners",
                                        "PublishSubscribeCollaborationpublisher : EventSource [1]subscriber : EventListener [0..*]"]) and "Connector from" not in txt, txt[:800])
    # 6.6: the two stage 6 types' tables (notes/stage-6.md §9): a profile's stereotypes and metaclasses and the packages it is
    # applied to, a metaclass's extensions, a stereotype's extension, generals and tags, an element's stereotypes with their
    # tags (a required one marked), a member's; a lifeline's changes in time order, the messages it sends and the
    # constraints on its changes
    if part.of("typed bookshop-profile"):
        txt = "".join(read("bookshop-profile.pdf"))
        ok("pdf · bookshop-profile: its tables list the profile's stereotypes and metaclasses and where it is applied, each metaclass's extensions, each stereotype's extension and tags, Order's stereotypes with their tags and placedAt's, each line's kind",
           all(flat(s) in txt for s in ["BookshopConventionsProfilemetaclass Classmetaclass Property«entity»«aggregateRoot»«owned»«column»applied to sales", "ClassMetaclassextended by «entity»extended by «owned»",
                                        "ownedStereotypeextends Class {required}team: String [0..1]", "aggregateRootStereotypea kind of «entity»boundedContext: String",
                                        "OrderClass«entity» table = orders«owned» required team = checkout- placedAt: Instant [0..1]: «column» name = placed_at, indexed = true",
                                        "From → toLabelKind", "entity → ClassExtension", "sales → BookshopConventionsProfile application"]), txt[:800])
    # M2.14: milestone 2's tables (notes/milestone-2.md §9): an entity's columns as rows and a relationship's ends; a flowchart
    # node's symbol; a process's number and the level it opens; what an information flow conveys, and an item's flows; a C4
    # element's type and description, an external one so marked, a relationship's technology
    PDF2 = {"bookshop-schema": ["customerTableidbigintPKemailvarchar(255)UKreferred_bybigintFKcustomer.idNULL", "order_lineTableorder_idbigintPKFKorder.id",
                                "customer→orderplaces:1to0..*,non-identifyingRelationship", "order→order_linecontains:1to1..*,identifyingRelationship"],
            "returns-flowchart": ["Fitforresale?Decision", "StockrecordsDatabase", "AConnector", "Fitforresale?→RejectionletternoFlow"],
            "bookshop-data-flow": ["TakeorderProcessnumber1openslevel1Takeorder", "BooksDatastorenumberD1", "Customer→TakeorderbasketDataflow", "Bookshop,level1›1Takeorder"],
            "order-information-flow": ["OrderInformationitemShopper→StorefrontStorefront→ShopAPI", "Shopper→StorefrontOrder,CarddetailsInformationflow", "«flow»Order,Carddetails"],
            "bookshop-c4": ["PaymentproviderSoftwaresystemTakescardpaymentsandmakesrefunds.external", "Bookshop→PaymentproviderTakescardpaymentswith[HTTPS]Relationship",
                            "ShopAPI[Container:Python,FastAPI]"],
            # 4a.7: milestone 4a's (notes/milestone-4a.md §5.7, §7.1, DoD 7): a topic's word, depth and parent; a product's or a
            # service's word, full name, icon id and group, each a glyph here (no pack: S18)
            "bookshop-opening-plan": ["CheckoutTopicDepth2UnderWebsite", "OpeningthebookshopTopicDepth0Theroot"],
            "bookshop-gcp": ["ShopAPIProductCloudRuniconCloud-Runineurope-west1[Region]", "europe-west1[Region]", "Shoppers→LoadbalancerHTTPSPath"],
            "bookshop-azure": ["DatabaseServiceSQLDatabaseiconSQL-Databaseinsnet-data[Subnet]", "Connector"],
            # 4b.5: BPMN's (notes/milestone-4b.md §11, DoD 7): each element's word and its rows (its lane, the activity a boundary
            # event is on, its documentation); each flow's ends, name and kind
            "bookshop-order-to-shipment": ["TakepaymentServicetaskinSales", "Noanswerin2minutesTimerboundaryeventonTakepayment", "BookshopPool",
                                           "CancelorderServicetaskinSalesNothingtorefund:nopaymentwastaken.", "Takepayment→PaymentproviderChargerequestMessageflow",
                                           "Paid?→ParallelgatewayyesSequenceflow"]}
    for n, want in PDF2.items():
        if not part.of(f"typed {n}"):
            continue
        txt = "".join(read(f"{n}.pdf"))
        ok(f"pdf · {n}: its tables list what milestone 2's type says of each element and line (§9)", all(w in txt for w in want), [w for w in want if w not in txt] or txt[:800])
    # M3.7: SysML's tables (notes/milestone-3.md §13): a requirement's id, text and derived relations, each relationship by its
    # keyword; a block's compartments, an interface block's flow properties, a constraint block's expression and parameters, a
    # value type's unit; the subject's members; each connector with the item it carries, each binding by its ends
    PDF3 = {"ebike-requirements": ["RangeRequirementid:EB-1.2text:Afullchargeshallgiveatleast60kmofassistedriding.containedinE-bikespecificationderivesBatterycapacity",
                                   "BatterycapacityRequirementid:BAT-1", "Battery→Batterycapacity«satisfy»Satisfy", "Rangerideonthetestcircuit→Range«verify»Verify"],
            "ebike-blocks": ["ChargeInterfaceInterfaceblockflowproperties:indc:DCPowerflowproperties:outstateOfCharge:Percent",
                             "RangeEquationConstraintblockconstraints:{range=energy/consumption}parameters:range:Distance", "EnergyValuetypequantity:unit=Wh",
                             "EBike→RentalVehicleGeneralization"],
            "ebike-structure": ["EBikeBlockbattery:Battery[1]", "refdock:Dock[0..1]", "DCPower,batterytocontrollerConnector"],  # a connector: a Lines row (audit 17)
            "ebike-range": ["eco:RangeEquation", "ecoRangetorangeofecoBindingconnector", "usableofusabletoenergyofboostBindingconnector"]}  # a binding: a Lines row only (audit 18)
    for n, want in PDF3.items():
        if not part.of(f"typed {n}"):
            continue
        txt = "".join(read(f"{n}.pdf"))
        ok(f"pdf · {n}: its tables list what SysML's type says of each element and line (§13)", all(w in txt for w in want) and "Bindingfrom" not in txt, [w for w in want if w not in txt] or txt[:800])
    if part("import mindmap"):
        # 4a.7: import on the mindmap example (notes/milestone-4a.md §8.4): the module's writer gives its Mermaid, and
        # umlimator.py import reads it back to the same topics under the same parents, in the same order, on the same sides
        ex = json.loads((ROOT / "examples" / "bookshop-opening-plan.json").read_text(encoding="utf-8"))
        w = subprocess.run(["node", "--input-type=module", "-e", "import { writeMermaidMindmap } from " + json.dumps((ROOT / "src" / "readers" / "mermaid-mindmap.js").as_uri())
                            + "; let s = ''; for await (const c of process.stdin) s += c; process.stdout.write(writeMermaidMindmap(JSON.parse(s)));"],
                           input=json.dumps(ex), capture_output=True, text=True)
        (t / "plan.mmd").write_text(w.stdout, encoding="utf-8")
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "import", str(t / "plan.mmd"), "--out", str(t / "plan.json")], capture_output=True, text=True)
        back = json.loads((t / "plan.json").read_text(encoding="utf-8")) if r.returncode == 0 else {"nodes": [], "views": [{}]}
        tree = lambda m: [(n["id"], n["label"], n.get("parent")) for n in m["nodes"]]
        ok("import · bookshop-opening-plan: its Mermaid mindmap, read back to the same topics, parents, order and sides",
           w.returncode == 0 and "\nmindmap\n" in w.stdout and tree(back) == tree(ex) and back["views"][0].get("nodeIds") == ex["views"][0]["nodeIds"]
           and back["views"][0].get("present") == ex["views"][0]["present"], (w.stderr[-300:], r.stderr[-300:], tree(back)[:4]))
    if part.of("typed bookshop-timing"):
        txt = "".join(read("bookshop-timing.pdf"))
        ok("pdf · bookshop-timing: its tables list each lifeline's changes in time order, the messages it sends and the constraints on its changes, each message's kind",
           all(flat(s) in txt for s in ["worker : OrderWorkerLifeline0 ms: Idle100 ms: Waiting for payment760 ms: Recording payment900 ms: Idlecharge(total) to payments at 100 ms → 140 ms",
                                        "Duration constraint {<= 800 ms} on worker from 100 ms to 760 msTime constraint {<= 1000 ms} on worker at 900 ms", "payments : PaymentProviderLifeline0 ms: Idle140 ms: Authorising",
                                        "paid to worker at 720 ms → 760 ms", "worker : OrderWorker → payments : PaymentProvidercharge(total)Message"]), txt[:800])
    if part("pdf odd models"):
        # an element with no type is drawn as a class, and its row says so
        bare = json.loads((ROOT / "examples" / "sales-classes.json").read_text()); next(n for n in bare["nodes"] if n["id"] == "order").pop("type")
        (t / "bare.json").write_text(json.dumps(bare))
        bt = "".join(read("bare.pdf")) if cli("render", str(t / "bare.json"), "--out", str(t / "bare.html")) and cli("pdf", str(t / "bare.html"), "--out", str(t / "bare.pdf")) else ""
        ok("pdf · an element with no type: its Kind is Class, as the picture draws it", flat("OrderClass- id: UUID") in bt, bt[:800])
        # upstream's check still catches what validate() calls wrong: a version-1 model's own `members` are not ends, and a
        # member that shares a node's id is an id used twice (from the review of #162)
        for name, m in [("v1-members", {"nodes": [{"id": "a", "members": [{"id": "a.p"}]}, {"id": "b"}], "edges": [{"from": "a.p", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}),
                        ("v2-twice", {"schemaVersion": 2, "nodes": [{"id": "a", "type": "uml.Class"}, {"id": "b", "type": "uml.Class", "members": [{"id": "a", "type": "uml.Property"}]}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}),
                        # 3.8: only a sequence view's interaction use may have no ends; a map's or a class view's line still may not
                        *((f"v2-no-ends-{k}", {"schemaVersion": 2, "nodes": [{"id": "a", "type": "uml.Class"}, {"id": "b", "type": "uml.Class"}], "views": [{"id": "v", "nodeIds": ["a", "b"], "edges": [{"id": "zz", "type": k}]}]})
                          for k in ("calls", "uml.Association"))]:
            (t / f"{name}.json").write_text(json.dumps(m))
            r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(t / f"{name}.json"), "--out", str(t / f"{name}.html"), "--no-check"], capture_output=True, text=True)
            ok(f"render · {name}: refused, as validate() refuses it", r.returncode != 0 and ("unknown end" in r.stderr + r.stdout or "duplicate" in (r.stderr + r.stdout).lower()), (r.returncode, (r.stderr + r.stdout)[-300:]))
        # card shapes (0.15.0; one style since 0.21.0): the shapes example prints its shapes, and its legend keys them
        cli("render", str(ROOT / "examples" / "shapes.json"), "--out", str(t / "shapes.html"), "--no-check")
        shp = read("shapes.pdf") if cli("pdf", str(t / "shapes.html"), "--out", str(t / "shapes.pdf")) else []
        ok("pdf · the shapes example: its legend keys the shapes it draws (a person, a browser app, a phone, a package)",
           shp and all(flat(k) in "".join(shp) for k in ("Personsomeone who uses it", "Browser appruns in a web browser", "Mobile appruns on a phone", "Packagea module or a folder of code")), [p[:200] for p in shp[1:2]])
        # a view of forty cards: its tables go on over the pages after its picture, under their heading and header row again,
        # never a row cut; and a model with no rules has no rules section
        (t / "long.json").write_text(json.dumps({"title": "Forty parts", "views": [{"id": "all", "title": "All parts", "nodeIds": [f"p{i}" for i in range(40)]}],
            "nodes": [{"id": f"p{i}", "label": f"Part {i}", "kind": "backend", "sublabel": f"tech {i}", "what": f"Part {i} of forty."} for i in range(40)],
            "edges": [{"from": f"p{i}", "to": f"p{i + 1}", "label": f"hands {i} on", "sublabel": "HTTPS"} for i in range(39)]}))
        cli("render", str(t / "long.json"), "--out", str(t / "long.html"), "--no-check")
        long = read("long.pdf") if cli("pdf", str(t / "long.html"), "--out", str(t / "long.pdf")) else []
        went = re.findall(r"(Cards40|Lines39)\(continued\)(.{0,25})", "".join(long))
        rows = [flat(f"Part {i}tech {i}Service / APIPart {i} of forty.") for i in range(40)] + [flat(f"Part {i} → Part {i + 1}hands {i} onHTTPS") for i in range(39)]
        ok("pdf · a long table goes on over the next pages, its heading and header row again, and never cuts a row",
           len(long) > 2 and all(p.startswith("Allparts(continued)") for p in long[2:]) and went
           and all(h.startswith("CardKindWhatitis" if k == "Cards40" else "From→toLabelTechnology") for k, h in went)
           and all(sum(s in p for p in long) == 1 for s in rows), [len(long), went, [s for s in rows if sum(s in p for p in long) != 1][:3], [p[:80] for p in long]])
        ok("pdf · a model with no rules has no rules section", long and "Rules" not in "".join(long) and "rule" not in long[0], long[:1])
        # a view that is not numbered, whose lines have steps (0.15.0): its table of lines gives each its step as written, in step
        # order (numbers by value, text by its leading number then the rest: 2 < 2a < 10), the lines with none last
        (t / "steps.json").write_text(json.dumps({"nodes": [{"id": "a", "label": "Shop"}, {"id": "b", "label": "API"}, {"id": "c", "label": "Bank"}],
            "edges": [{"from": "a", "to": "c", "label": "asks"}, {"from": "b", "to": "c", "label": "settles", "step": 10}, {"from": "a", "to": "b", "label": "buys", "step": 2},
                      {"from": "b", "to": "c", "label": "charges", "step": "2a"}],
            "views": [{"id": "v", "title": "Steps", "nodeIds": ["a", "b", "c"], "keepPairs": True}]}))
        cli("render", str(t / "steps.json"), "--out", str(t / "steps.html"), "--no-check")
        stepped = "".join(read("steps.pdf")) if cli("pdf", str(t / "steps.html"), "--out", str(t / "steps.pdf")) else ""
        ok("pdf · a view whose lines have steps lists each line's step in its table of lines, in step order",
           flat("#From → toLabelTechnology2Shop → APIbuys2aAPI → Bankcharges10API → BanksettlesShop → Bankasks") in stepped, stepped[-300:])
        # a rule broken in one view: judged in the views a PDF prints, as it says
        (t / "rules2.json").write_text(json.dumps({"nodes": [{"id": "app", "label": "App", "kind": "frontend"}, {"id": "api", "label": "API", "kind": "backend"},
                                                             {"id": "db", "label": "Store", "kind": "database"}],
                                                   "edges": [{"from": "app", "to": "api", "label": "asks"}, {"from": "api", "to": "db", "label": "writes"}],
                                                   "views": [{"id": "clean", "nodeIds": ["app", "api", "db"]},
                                                             {"id": "direct", "nodeIds": ["app", "db"], "edges": [{"from": "app", "to": "db", "label": "reads"}]}],
                                                   "rules": [{"id": "apps-no-db", "title": "Apps never call a database directly", "from": {"kind": "frontend"}, "to": {"kind": "database"}}]}))
        cli("render", str(t / "rules2.json"), "--out", str(t / "rules2.html"), "--no-check")
        printed = lambda f, *a: "".join(read(f)) if cli("pdf", str(t / "rules2.html"), "--out", str(t / f), *a) else ""
        every, clean = printed("every.pdf"), printed("clean.pdf", "--views", "clean")
        ok("pdf · each rule is judged in the views it prints, as it says: broken with the view that breaks it, holding without it",
           flat("Apps never call a database directlyevery view printedbrokendirect: App→Store") in every and flat("Apps never call a database directlyevery view printedholdsnone") in clean
           and flat("Judged in the views printed here.") in clean, [every[-240:], clean[-240:]])

if part("four renders at once"):
    # four renders of one model at once (#105): each writes its own copy of the model, and every page records the model itself
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / "bike-share.json").write_text((ROOT / "examples" / "bike-share.json").read_text(encoding="utf-8"), encoding="utf-8")
        runs = [subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "render", "bike-share.json", "--out", f"p{i}.html", "--no-check"],
                                 cwd=t, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True) for i in range(4)]
        ends = [(p.wait(), p.stderr.read()[-300:]) for p in runs]
        ok("render · four renders of one model at once all finish", all(code == 0 for code, _ in ends), ends)
        ok("render · and leave no copy of the model next to it", not [p.name for p in t.iterdir() if p.name.startswith(".")],
           [p.name for p in t.iterdir()])
        pages = [re.sub(r'"generated": "[^"]*"', "", (t / f"p{i}.html").read_text(encoding="utf-8")) for i in range(4) if (t / f"p{i}.html").is_file()]
        ok("render · each page records the model itself as its source, and the four pages are the same",
           len(pages) == 4 and '"source": "bike-share.json"' in pages[0] and len(set(pages)) == 1,
           re.findall(r'"source": "[^"]*"', pages[0])[:1] if pages else "no pages")

if part("mcp"):
    # The MCP server (#91): JSON-RPC through its pipes, a call of each read tool on the bike share, and a page tool's command
    # on the served page's event stream
    mcp = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(ROOT / "examples" / "bike-share.json"), "--port", "0"],
                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    stop = threading.Timer(300, mcp.kill); stop.daemon = True; stop.start()  # a server that stops answering fails here, not on CI's clock
    NEW = {"_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}}}


    def rpc(method, params=None, n=[0]):
        n[0] += 1
        mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": n[0], "method": method, "params": params or {}}) + "\n"); mcp.stdin.flush()
        r = json.loads(mcp.stdout.readline() or "{}")
        return r if r.get("id") == n[0] else {"error": f"no answer to {method}", "got": r}


    def tool(name, **args):  # its text, and whether it is an error
        r = rpc("tools/call", {"name": name, "arguments": args}).get("result", {})
        return "".join(c.get("text", "") for c in r.get("content", [])), r.get("isError")


    hello = rpc("initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "tests/cli.py", "version": "0"}}).get("result", {})
    url = re.search(r"http://127\.0\.0\.1:(\d+)", hello.get("instructions", ""))
    ok("mcp · initialize answers with the client's version (2025-11-25), the tools and the page's URL",
       hello.get("protocolVersion") == "2025-11-25" and "tools" in hello.get("capabilities", {}) and url, hello)
    mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")  # unanswered: rpc() checks the next line's id
    found = rpc("server/discover", NEW).get("result", {})
    ok("mcp · server/discover offers 2026-07-28, the current specification", found.get("supportedVersions", [None])[0] == "2026-07-28" and found.get("resultType") == "complete", found)
    listed = [t.get("name") for t in rpc("tools/list", NEW).get("result", {}).get("tools", [])]
    ok("mcp · tools/list", listed == ["list_views", "describe_view", "paths", "reach", "broken_rules", "validate", "diff", "show_view", "highlight", "tour", "play_story", "clear", "page_state"], listed)
    ok("mcp · ping, and the standard errors: no such method, no such tool, a version it doesn't speak",
       "result" in rpc("ping") and rpc("nope").get("error", {}).get("code") == -32601 and rpc("tools/call", {"name": "nope"}).get("error", {}).get("code") == -32602
       and rpc("tools/list", {"_meta": {"io.modelcontextprotocol/protocolVersion": "1900-01-01"}}).get("error", {}).get("code") == -32022)

    said, err = tool("list_views")
    got = json.loads(said) if not err else {}
    ok("mcp · list_views: the views and the stories", [v["id"] for v in got.get("views", [])] == [v["id"] for v in bike["views"]] and [s["id"] for s in got.get("stories", [])] == ["ride"], said)
    said, err = tool("describe_view", view="trips")
    ok("mcp · describe_view: the view in sentences, then its card ids", not err and said.startswith("Trip service: 12 cards") and "\nCard ids: rider-app (Rider app), " in said, said)
    said, err = tool("paths", view="trips", **{"from": "rider-app", "to": "payments"})
    got = json.loads(said) if not err else []
    ok("mcp · paths: the cards and lines from Rider app to Payment provider, as Refs", {r["id"] for r in got if r["type"] == "node"} == {"rider-app", "trip-api", "lifecycle", "fare", "payments"}
       and [r["ids"] for r in got if r["type"] == "edge"] == [["t1"], ["t4"], ["t5"], ["t11"]], said)
    said, err = tool("reach", view="trips", card="payments", backward=True, depth=2)
    ok("mcp · reach: what leads to Payment provider, two lines out", not err and [(r["id"], r["distance"]) for r in json.loads(said) if r["type"] == "node"] == [("payments", 0), ("fare", 1), ("lifecycle", 2)], said)
    ok("mcp · broken_rules and validate: the bike share breaks none of its rules and has no problems", tool("broken_rules") == ("[]", False) and tool("validate") == ("[]", False))
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "other.json").write_text(json.dumps(edited(bike)))
        said, err = tool("diff", other_model_path=str(Path(tmp) / "other.json"))
    ok("mcp · diff: what changed from another model file to this one", not err and json.loads(said) == {"summary": ["renames Accounts and sign-in to Accounts", "adds Feature flags",
       "removes Payments queue", "adds a line from Trip service to Payment provider (charges)", "moves Payment provider in the view What runs"], "views": ["system"]}, said)
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "v5.json").write_text(json.dumps({"nodes": [{"id": "a"}], "views": [{"id": 5, "nodeIds": ["a"]}]}))
        said, err = tool("diff", other_model_path=str(Path(tmp) / "v5.json"))
    ok("mcp · diff: another model render refuses is a tool error naming it (audit 11)", err and said.endswith("v5.json: views[0].id is not a string"), said)
    said, err = tool("diff", other_model_path=str(ROOT / "examples" / "traces" / "ride-end.json"))
    ok("mcp · diff: a JSON object that is no map model (a trace) is a tool error, not everything added (audit 14)", err and said.endswith("no views: not a map model"), said)
    said, err = tool("describe_view", view="nope")
    ok("mcp · a call that names what the model lacks is a tool error that says what it has", err and said.startswith("no view 'nope'; the views: context, system"), said)
    wrong = [tool("describe_view", view=["trips"]), tool("tour", cards=[{"id": "trips"}]), tool("diff", other_model_path=5)]
    ok("mcp · an argument of another type than its inputSchema's is a tool error that names it", all(e for _, e in wrong) and "view is not" in wrong[0][0], wrong)
    said, err = tool("reach", view="system", card="payments", direction="backward")
    ok("mcp · an argument its inputSchema does not name is a tool error that names it and the tool's own (audit 8)",
       err and said.startswith("reach: no argument direction; its arguments: view, card") and "backward" in said, said)

    said, err = tool("show_view", view="trips")
    ok("mcp · a page tool with no page connected says to open its URL", not err and said.startswith("No page is connected") and url and url.group(0) in said, said)
    web = lambda: http.client.HTTPConnection("127.0.0.1", int(url.group(1)), timeout=60)
    c = web(); c.request("GET", "/"); served = c.getresponse().read().decode()
    token = re.search(r"TOKEN = '([^']+)'", served).group(1)  # this run's, in the page it serves: its requests carry it (audit 24)
    c = web(); c.request("GET", f"/events?page=t1&token={token}"); stream = c.getresponse()  # a page, as the served script names itself
    sent = []


    def acks():  # each command on the event stream, answered as the page answers once it has shown it (tests/mcp.py drives a real one)
        line = b" "
        while line:
            line = stream.readline()
            if line.startswith(b"data:"):
                sent.append(json.loads(line[5:]))
                a = web(); a.request("POST", "/state", json.dumps({"page": "t1", "model": sent[-1]["model"], "ack": sent[-1]["id"], "state": {"view": sent[-1]["want"]["view"]}}),
                                     {"Content-Type": "application/json", "X-Umlimator-Token": token}); a.getresponse().read()


    threading.Thread(target=acks, daemon=True).start()
    time.sleep(0.5)
    ok("mcp · a page that connects gets what the assistant asked last", sent and sent[0]["want"]["view"] == "trips" and sent[0].get("model"), sent)
    said, err = tool("highlight", refs=["trips", "payments", "s9"], view="system")
    ok("mcp · highlight: shown on the page once it answers, with card and line ids as Refs, on its event stream", said.startswith("Shown on 1 page") and sent[-1]["want"]["view"] == "system"
       and sent[-1]["want"]["highlight"] == {"refs": [{"type": "node", "id": "trips"}, {"type": "node", "id": "payments"}, {"type": "edge", "ids": ["s9"]}], "view": "system"}, (said, sent[-1:]))
    bad = [tool("highlight", refs=[x]) for x in ({"type": "node", "id": ["a"]}, {"type": "edge", "ids": 5}, {"type": "edge", "ids": [["x"]]}, {"type": "container", "container": ["x"]})]
    ok("mcp · highlight: a Ref whose fields are not strings is a tool error naming it, never an internal error (audit 2)",
       all(err is True and said.startswith("refs[0] is not a Ref") for said, err in bad), bad)
    bad = [tool("highlight", refs=[x]) for x in ({"type": "node", "id": "no-such-card"}, {"type": "edge", "ids": ["a->b#0"]}, "a->b")]
    ok("mcp · highlight: a Ref or a line id that names nothing in the model is a tool error, as a card id is (audit 7)",
       all(err is True and "in the model" in said for said, err in bad), bad)
    said, err = tool("highlight", refs=[{"type": "node", "id": "trips", "view": "nope"}])
    ok("mcp · highlight: a Ref whose view names no view is a tool error, as show_view's is (audit 13)", err is True and said.startswith("no view 'nope'"), said)
    c = web(); c.request("GET", "/"); r = c.getresponse(); page = r.read().decode()
    ok("mcp · serves the CLI's page, with the script that shows commands on its map handle (window.umlimatorMap)",
       r.status == 200 and "const map = window.umlimatorMap" in page and "new EventSource(`/events?page=" in page and "Fare calculator" in page)
    c = web(); c.request("POST", "/state", "{}", {"Content-Type": "application/json", "Origin": "https://attacker.example"})
    ok("mcp · another site's page posts nothing", c.getresponse().status == 403)
    c = web(); c.request("GET", "/", headers={"Host": f"attacker.example:{url.group(1)}"})
    ok("mcp · a request for another host name (DNS rebinding) gets nothing", c.getresponse().status == 403)
    # audit 22: another site's image, script or frame naming /events sends no Origin, and was counted as an open page, so the
    # page tools waited for it and said it did not show the command
    fetched = {}
    for name, path, how in [("an image", "/events?page=x-site", ("cross-site", "no-cors", "image")), ("a script", "/events?page=x-site", ("same-site", "no-cors", "script")),
                            ("a frame", "/", ("cross-site", "navigate", "iframe")), ("a post", "/state", ("cross-site", "cors", "empty"))]:
        c = web(); c.request("POST" if path == "/state" else "GET", path, json.dumps({"page": "x-site"}) if path == "/state" else None,
                             {"Content-Type": "application/json", "Sec-Fetch-Site": how[0], "Sec-Fetch-Mode": how[1], "Sec-Fetch-Dest": how[2]})
        fetched[name] = c.getresponse().status; c.close()
    c = web(); c.request("GET", "/", headers={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}); opened = c.getresponse(); opened.read()
    c = web(); c.request("GET", "/", headers={"Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}); typed = c.getresponse(); typed.read()
    said, err = tool("page_state")
    ok("mcp · another site's image, script, frame or post naming the server gets nothing and is no page; a link to the page, or its address typed, opens it (audit 22)",
       set(fetched.values()) == {403} and opened.status == 200 and typed.status == 200 and "x-site" not in said, (fetched, opened.status, typed.status, said))
    # audit 24: a browser that sends no Fetch Metadata and no Origin (another site's <img src=".../events">) was counted as an
    # open page; /events and /state need this run's token, which only the page the server serves holds
    fetched = {}
    # a wrong token: one character changed to another, never to the one it was (a token ending in "x" was right: a flake)
    flip = lambda ch: "y" if ch == "x" else "x"
    for name, path, extra in [("no token", "/events?page=old-browser", {}), ("a wrong token", f"/events?page=old-browser&token={token[:-1]}{flip(token[-1])}", {}),
                              ("a token twice", f"/events?page=old-browser&token=x&token={token}", {}),
                              ("a post with no token", "/state", {}), ("a post with a wrong token", "/state", {"X-Umlimator-Token": flip(token[0]) + token[1:]})]:
        c = web(); c.request("POST" if path == "/state" else "GET", path, json.dumps({"page": "old-browser"}) if path == "/state" else None,
                             {"Content-Type": "application/json", "Referer": "https://evil.example/", **extra})
        fetched[name] = c.getresponse().status; c.close()
    said, err = tool("page_state")
    ok("mcp · a request with no Fetch Metadata and no Origin, from another site, needs the run's token: without it, it gets nothing and is no page (audit 24)",
       set(fetched.values()) == {403} and "old-browser" not in said and token not in said and len(token) >= 32, (fetched, said))
    mcp.stdin.close()
    ok("mcp · exits when its input closes", mcp.wait(timeout=30) == 0)

    # audit 22: a line whose props.ends is not an object of objects ended highlight in an internal error; it is lit by its own ends
    with tempfile.TemporaryDirectory() as tmp:
        odd = Path(tmp) / "ends.json"
        odd.write_text(json.dumps({"title": "m", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}],
                                   "edges": [{"id": f"e{i}", "from": "a", "to": "b", "props": {"ends": x}} for i, x in
                                             enumerate(["a", ["to"], 5, None, {"to": "b"}, {"from": {"part": 7}}, {"to": ["part"]}, {"from": {"part": "a"}}])]}))
        mcp = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(odd), "--port", "0"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
        rpc("initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "tests/cli.py", "version": "0"}})
        lit = [rpc("tools/call", {"name": "highlight", "arguments": {"refs": [f"e{i}"]}}) for i in range(8)]
        mcp.stdin.close(); mcp.wait(timeout=30); err = mcp.stderr.read()
        ok("mcp · highlight: a line whose props.ends is a string, a list, a number or holds odd parts is lit, never an internal error (audit 22)",
           all("result" in r and not r["result"].get("isError") for r in lit) and "Traceback" not in err, (lit, err[-500:]))
if part("audit 26"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        two = {"title": "m", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"id": "ab", "from": "a", "to": "b"}],
               "views": [{"id": "v", "nodeIds": ["a", "b"]}]}
        # audit 26: the engine made its avatar cache in the home folder on every render, and a home it cannot write (a CI
        # runner's, a container's) ended render in a traceback; a home that is a file fails the same way as root too
        (t / "home").write_text("not a folder"); (t / "icons").mkdir()
        (t / "m.json").write_text(json.dumps(two))
        (t / "who.json").write_text(json.dumps(two | {"authors": {"someone": {"name": "Some One"}}}))
        env = dict(os.environ, HOME=str(t / "home"), UMLIMATOR_ICON_CACHE=str(t / "icons"))
        got = [subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", f"{m}.json", "--out", f"{m}.html", "--no-check"], cwd=t, env=env,
                              capture_output=True, text=True) for m in ("m", "who")]
        ok("render · a home folder it cannot write: a model with no authors renders, and one with authors renders with their initials, said in one line (audit 26)",
           [r.returncode for r in got] == [0, 0] and (t / "m.html").is_file() and (t / "who.html").is_file() and "Traceback" not in got[0].stderr + got[1].stderr
           and got[0].stderr == "" and "the page draws their initials" in got[1].stderr and json.loads(got[1].stdout).get("bytes"), [(r.stdout[-300:], r.stderr[-600:]) for r in got])
        # audit 26: a model whose path, with / as -, was longer than a file name holds got no page and no stills, and the PR
        # comment named the runner's absolute path in the error
        g = t / "g26"; deep = Path(*[f"architecture-components-folder-{i}" for i in range(8)]) / "payments-service-model.json"
        (g / deep).parent.mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        (g / "keep.json").write_text(json.dumps(two)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        (g / deep).write_text(json.dumps(two))
        r = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                            "sys.argv = ['umlimator.py', 'diff', *sys.argv[2:]]; u.main()", str(ROOT), "--base", "HEAD", "--out", "out"], cwd=g, capture_output=True, text=True)
        got = json.loads(r.stdout or "[]")
        pages = list((g / "out").glob("*.html")) if (g / "out").is_dir() else []
        md = (g / "out" / "summary.md").read_text(encoding="utf-8") if (g / "out" / "summary.md").is_file() else ""
        ok("diff --base · a model whose path is longer than a file name gets a page under a cut, hashed name, and no error (audit 26)",
           len(str(deep).encode()) > 255 and [x["file"] for x in got] == [deep.as_posix()] and "error" not in got[0] and len(pages) == 1
           and len(pages[0].name.encode()) < 255 and pages[0].name.startswith("architecture-components-folder-0-") and "cannot be diffed" not in md
           and str(g) not in md, (got, [p.name for p in pages], md[-400:], r.stderr[-400:]))
        # audit 26: the MCP diff tool read a path that is no file (a FIFO, a device) on the one thread that answers: a FIFO
        # blocked it, and no later call was answered
        if hasattr(os, "mkfifo"):
            os.mkfifo(t / "fifo.json")
            mcp = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(t / "m.json"), "--port", "0"], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            stop = threading.Timer(30, mcp.kill); stop.daemon = True; stop.start()  # a server that stops answering fails here, never hangs the run
            def rpc(n, method, params):
                try:
                    mcp.stdin.write(json.dumps({"jsonrpc": "2.0", "id": n, "method": method, "params": params}) + "\n"); mcp.stdin.flush()
                    return json.loads(mcp.stdout.readline() or "{}")
                except OSError:  # killed: it stopped answering
                    return {}
            rpc(1, "initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "tests/cli.py", "version": "0"}})
            said = [rpc(2 + i, "tools/call", {"name": "diff", "arguments": {"other_model_path": p}}) for i, p in enumerate(["fifo.json", "/dev/zero", str(t)])]
            after = rpc(5, "tools/call", {"name": "list_views", "arguments": {}})
            stop.cancel()
            with contextlib.suppress(OSError):
                mcp.stdin.close()
            mcp.wait(timeout=30)
            ok("mcp · diff of a FIFO, a device or a folder is a tool error saying it is not a file, and the next call is answered (audit 26)",
               all(x.get("result", {}).get("isError") and x["result"]["content"][0]["text"].endswith(": not a file") for x in said)
               and after.get("id") == 5 and not after.get("result", {}).get("isError"), (said, after))
if part("audit 28"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        two = {"title": "m", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"id": "ab", "from": "a", "to": "b"}],
               "views": [{"id": "v", "nodeIds": ["a", "b"]}]}
        lab = lambda x: json.dumps(two | {"nodes": [two["nodes"][0] | {"label": x}, two["nodes"][1]]})
        nocr = lambda g, *x: subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                                             "sys.argv = ['umlimator.py', *sys.argv[2:]]; u.main()", str(ROOT), *x], cwd=g, capture_output=True, text=True)
        # audit 28: a model named summary.md.json took out/summary.md as its stills folder, and the run ended with no summary;
        # x.json.json's stills folder was x.json, where a removed x.json's copy goes; y.html.json's was y.json's page
        g = t / "g28"; g.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        names = ["summary.md.json", "y.json", "y.html.json", "x.json", "x.json.json"]
        for n in names:
            (g / n).write_text(lab("old"))
        sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        for n in names:
            (g / n).write_text(lab("NEW " + n)) if n != "x.json" else (g / n).unlink()
        r = nocr(g, "diff", "--base", "HEAD", "--out", "out")
        got = json.loads(r.stdout or "[]")
        md = (g / "out" / "summary.md").read_text(encoding="utf-8") if (g / "out" / "summary.md").is_file() else ""
        outs = [x.get("out") or "" for x in got]
        own = all(Path(x["out"]).is_file() and (x["file"] == "x.json" or "NEW " + x["file"] in Path(x["out"]).read_text(encoding="utf-8")) for x in got if x.get("out"))
        ok("diff --base · a model whose page or stills folder would take summary.md, or another model's page, folder or copy, gets a name of its own; summary.md is written (audit 28)",
           r.returncode == 0 and sorted(x["file"] for x in got) == sorted(names) and not any("error" in x for x in got) and md.startswith("<!-- umlimator-diff -->")
           and all(f"`{n}`" in md for n in names) and len({o.casefold() for o in outs}) == len(names) and own, (got, md[:400], r.stderr[-400:]))
        # audit 28: timelapse ran git in the working folder, so a model given by its path from outside its repository failed
        h = t / "h28"; (h / "docs").mkdir(parents=True)
        gh = lambda *x: subprocess.run(["git", "-C", str(h), "-c", "user.name=t", "-c", "user.email=t@t", *x], capture_output=True, text=True)
        gh("init", "-q")
        for k, x in enumerate(["one", "two"]):
            (h / "docs" / "map.json").write_text(lab(x)); gh("add", "."); gh("commit", "-qm", f"version {k + 1}")
        other = t / "other"; other.mkdir(); subprocess.run(["git", "init", "-q"], cwd=other, capture_output=True)
        plain28 = t / "plain"; plain28.mkdir()
        runs = [subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "timelapse", str(m), "--out", str(t / f"tl{k}.html")], cwd=c, capture_output=True, text=True,
                               env={**os.environ, "GIT_CEILING_DIRECTORIES": str(t)})
                for k, (c, m) in enumerate([(plain28, h / "docs" / "map.json"), (other, h / "docs" / "map.json"), (h / "docs", "map.json"), (plain28, Path("..") / "h28" / "docs" / "map.json")])]
        ok("timelapse · a model's history is read from its own repository, from a folder outside any repository, inside another, or beside the model (audit 28)",
           [r.returncode for r in runs] == [0, 0, 0, 0] and all([v[11:] for v in json.loads(r.stdout)["versions"]] == ["version 1", "version 2"] for r in runs),
           [(r.returncode, r.stdout[-200:], r.stderr[-300:]) for r in runs])
        # audit 28: --views split every spec at its commas, so a view whose id holds one could not be named
        (t / "comma.json").write_text(json.dumps(two | {"views": [{"id": "orders,payments", "nodeIds": ["a", "b"]}, {"id": "orders", "nodeIds": ["a"]}, {"id": "payments", "nodeIds": ["b"]}]}))
        b = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(t / "comma.json"), "--out", str(t / "comma.html"), "--no-check"], capture_output=True, text=True)
        picked = [u.pick(t / "comma.html", x) for x in ("orders,payments", "orders", "payments,orders", "orders,pay*")]
        bad = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.pick(sys.argv[2], 'nope')", str(ROOT), str(t / "comma.html")],
                             capture_output=True, text=True)
        ok("--views · a spec that is a view's id whole names that view, comma and all; else it is split at commas; the error quotes each id (audit 28)",
           b.returncode == 0 and picked == [["orders,payments"], ["orders"], ["orders", "payments"], ["orders", "payments"]]
           and "its views: 'orders,payments', 'orders', 'payments'" in bad.stderr, (b.stderr[-300:], picked, bad.stderr[-300:]))
if part("audit 27"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        # audit 27: a view id or a model file name holding " : < > | * ? gave stills and pages of those names, and the diff
        # Action's upload-artifact refuses any such path, so the whole artifact (every model's pictures) was lost
        odd = ["level:1", 'q"<>|*?\r\nx']
        m = {"title": "m", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"id": "ab", "from": "a", "to": "b"}],
             "views": [{"id": v, "title": "V", "nodeIds": ["a", "b"]} for v in odd]}
        g = t / "g27"; (g / "docs").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        model = g / "docs" / "c4:ctx?.json"
        model.write_text(json.dumps(m)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        model.write_text(json.dumps(m | {"nodes": [m["nodes"][0] | {"label": "A2"}, m["nodes"][1]]}))
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "diff", "--base", "HEAD", "--out", "out"], cwd=g, capture_output=True, text=True)
        got = json.loads(r.stdout or "[]")
        files = [p.relative_to(g / "out").as_posix() for p in (g / "out").rglob("*")] if (g / "out").is_dir() else []
        refused = [f for f in files if re.search('[\x00-\x1f"*:<>?|]', f)]  # @actions/artifact's validateFilePath, and Windows
        pngs = sorted(f for f in files if f.endswith(".png"))
        ok("diff --base · a view id or model name holding \" : < > | * ? gets stills and a page the Action's artifact takes, named %XX (audit 27)",
           [x["file"] for x in got] == ["docs/c4:ctx?.json"] and not refused and "docs-c4%3Actx%3F.html" in files
           and pngs == ["docs-c4%3Actx%3F/level%3A1.png", "docs-c4%3Actx%3F/q%22%3C%3E%7C%2A%3F%0D%0Ax.png"]
           and [urllib.parse.unquote(Path(f).stem) for f in pngs] == sorted(odd), (got, files, r.stderr[-400:]))
        # audit 27: the MCP diff tool's ~name for no such user, and a name too long for the disk, ended in an Internal error
        (t / "m.json").write_text(json.dumps(m))
        msgs = [{"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "tests/cli.py", "version": "0"}}}]
        msgs += [{"jsonrpc": "2.0", "id": i + 1, "method": "tools/call", "params": {"name": "diff", "arguments": {"other_model_path": p}}}
                 for i, p in enumerate(["~no-such-user-27/m.json", "x" * 5000 + ".json", "m.json"])]
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(t / "m.json"), "--port", "0"], input="\n".join(map(json.dumps, msgs)) + "\n",
                           capture_output=True, text=True, timeout=120)
        said = [json.loads(x) for x in r.stdout.splitlines()[1:]]
        ok("mcp · diff of ~name for no such user, or of a name too long for the disk, is a tool error, never an Internal error (audit 27)",
           len(said) == 3 and all("error" not in x for x in said) and [x["result"]["isError"] for x in said] == [True, True, False]
           and "no such user" in said[0]["result"]["content"][0]["text"] and "Traceback" not in r.stderr, (said, r.stderr[-600:]))
if part("audit 29"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        # audit 29: timelapse read git log's paths C-quoted ("s\306\241.json"), so a model whose name holds a non-ASCII
        # letter, a quote, a backslash or a tab had no version; and it passed the model as a glob pathspec, so another
        # file's history (mapv.json) was drawn as versions of map[v].json
        mk = lambda x: json.dumps({"title": "m", "nodes": [{"id": "a", "label": x}], "views": [{"id": "v", "nodeIds": ["a"]}]})
        names = ["sơ-đồ.json", 'q"b\\s\tt.json', "map[v].json", "m*p?.json", ":(icase)M.json"]
        g = t / "g"; (g / "sub dir").mkdir(parents=True)
        sh = lambda *x: subprocess.run(["git", "-C", str(g), "-c", "user.name=t", "-c", "user.email=t@t", *x], capture_output=True, text=True)
        sh("init", "-q")
        for k in (1, 2):
            for n in names:
                (g / "sub dir" / n).write_text(mk(f"{n} {k}"))
            sh("add", "."); sh("commit", "-qm", f"version {k}")
            for other in ("mapv.json", "mxpx.json", "m.json"):  # names each pattern takes in, each with commits of its own
                (g / "sub dir" / other).write_text(mk(f"{other} {k}")); sh("add", "."); sh("commit", "-qm", f"another file {k}")
        runs = [subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "timelapse", str(g / "sub dir" / n), "--out", str(t / f"tl{k}.html")],
                               capture_output=True, text=True) for k, n in enumerate(names)]
        read = lambda f: json.loads(m[1]) if f.is_file() and (m := re.search(r'<script id="versions" type="application/json">(.*?)</script>', f.read_text(encoding="utf-8"), re.S)) else {}
        seen = [[v["model"]["nodes"][0]["label"] for v in read(t / f"tl{k}.html").get("versions", [])] for k in range(len(names))]
        ok("timelapse · a model whose name holds a non-ASCII letter, a quote, a backslash, a tab, or a glob's * ? [ ] or :( has its own versions, no other file's (audit 29)",
           [r.returncode for r in runs] == [0] * len(names) and seen == [[f"{n} 1", f"{n} 2"] for n in names]
           and all([v[11:] for v in json.loads(r.stdout)["versions"]] == ["version 1", "version 2"] for r in runs),
           [(r.returncode, r.stdout[-200:], r.stderr[-300:]) for r in runs])
if part("audit 30"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        # audit 30: an overview's inline interaction draws another view's lifelines and messages: a message renamed there, or a
        # fragment added, draws the overview again (its key held only the other views' ids and titles)
        ov = json.loads((ROOT / "examples" / "buy-book-overview.json").read_text(encoding="utf-8"))
        keys = []
        for step in range(3):
            q = next(v for v in ov["views"] if v["id"] == "queue-order")
            if step == 1:
                q["edges"][0]["label"] = "putOnQueue(order)"
            if step == 2:
                q["fragments"] = [{"id": "f1", "operator": "opt", "guard": "x", "messages": ["queue-3"]}]
            (t / "ov.json").write_text(json.dumps(ov)); cli("render", str(t / "ov.json"), "--out", str(t / "ov.html"), "--no-check")
            keys.append(u.still_keys(t / "ov.html", [2.0, "light", False]).get("buy-book"))
        ok("stills · an interaction overview is drawn again when a message or fragment of the sequence view its inline interaction draws changes (audit 30)",
           None not in keys and len(set(keys)) == 3, keys)
        run = lambda *x, cwd=None: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *x], capture_output=True, text=True, cwd=cwd)
        good = {"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}
        (t / "good.json").write_text(json.dumps(good))
        # audit 30: a number JavaScript's JSON.parse cannot hold (1e400, valid JSON; NaN and Infinity, which Python's json
        # reads) went into the page's data block as Infinity, so the page drew nothing, and diff ended in a Node stack trace
        bad = {"big": '"x": 1e400', "nan": '"x": NaN', "inf": '"x": -Infinity', "int": '"x": 1' + "0" * 400}
        for k, v in bad.items():
            (t / f"{k}.json").write_text(json.dumps(good)[:-1] + ", " + v + "}")
        runs = [run(c, str(t / f"{k}.json"), *extra) for k in bad for c, extra in (("render", ["--out", str(t / f"{k}.html"), "--no-check"]),
                                                                                     ("diff", [str(t / "good.json"), "--out", str(t / f"{k}d.html")]))]
        ok("render, diff · a number out of range (1e400, NaN, -Infinity, 10^400) is refused in one line naming the file, and no page is written (audit 30)",
           all(r.returncode == 1 and "is not valid JSON (" in r.stderr and "Traceback" not in r.stderr and "SyntaxError" not in r.stderr for r in runs)
           and not list(t.glob("big*.html")) and not list(t.glob("nan*.html")) and not list(t.glob("inf*.html")), [r.stderr[-200:] for r in runs])
        # audit 30: a lone surrogate escape ("\ud800", valid JSON) ended render, diff and trace in a UnicodeEncodeError traceback
        (t / "sur.json").write_text(json.dumps(good).replace('"A"', '"Al\\ud800pha \\udfff \\ud83d\\ude00"'))
        svc = lambda name, span: {"resource": {"attributes": [{"key": "service.name", "value": {"stringValue": name}}]}, "scopeSpans": [{"spans": [span]}]}
        tr = {"resourceSpans": [svc("a", {"traceId": "t", "spanId": "1", "name": "x\ud800", "startTimeUnixNano": "1", "endTimeUnixNano": "2"}),
                                svc("b", {"traceId": "t", "spanId": "2", "parentSpanId": "1", "name": "y\ud800", "startTimeUnixNano": "1", "endTimeUnixNano": "2"})]}
        (t / "tr.json").write_text(json.dumps(tr))  # json.dumps writes the lone surrogate as the escape \ud800
        runs = [run("render", str(t / "sur.json"), "--out", str(t / "sur.html"), "--no-check"), run("diff", str(t / "good.json"), str(t / "sur.json"), "--out", str(t / "surd.html")),
                run("trace", str(t / "good.json"), str(t / "tr.json"), "--view", "tv", "--out", str(t / "trout.json"))]
        page = (t / "sur.html").read_text(encoding="utf-8") if (t / "sur.html").is_file() else ""
        ok("render, diff, trace · a lone surrogate is read as U+FFFD and said in one line, never a traceback; a surrogate pair stays the letter it is (audit 30)",
           [r.returncode for r in runs] == [0, 0, 0] and all("a lone surrogate code point" in r.stderr and "Traceback" not in r.stderr for r in runs)
           and "Al\ufffdpha \ufffd \U0001F600" in json.loads(u.DATA.search(page).group(1))["nodes"][0]["label"] if page else False, [(r.returncode, r.stderr[-300:]) for r in runs])
        # audit 30: timelapse embedded a past version render refuses, its words reading "adds the view undefined"; and a past
        # version holding 1e400 or a lone surrogate
        g = t / "tl"; g.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        sh("init", "-q")
        for k, body in enumerate([json.dumps(good), '{"title":"A","nodes":[{"id":"a","label":"A"},"oops",null],"edges":"none","views":[{"id":"v","nodeIds":["a",3]},"v2"]}',
                                  (t / "sur.json").read_text(), (t / "big.json").read_text(), '{"title": "t", "nodes": []}', json.dumps(good)]):
            (g / "m.json").write_text(body); sh("add", "."); sh("commit", "-qm", f"v{k}")
        r = run("timelapse", "m.json", "--out", str(t / "tl.html"), cwd=g)
        page = (t / "tl.html").read_text(encoding="utf-8") if (t / "tl.html").is_file() else ""
        vers = json.loads(m[1]) if (m := re.search(r'<script id="versions" type="application/json">(.*?)</script>', page, re.S)) else {}
        ok("timelapse · a past version render refuses, or that holds a number out of range, is left out and said; a lone surrogate is read as U+FFFD (audit 30)",
           r.returncode == 0 and [v["label"][11:] for v in vers.get("versions", [])] == ["v0", "v2", "v5"]
           and "is not a model render reads (edges is not a list;" in r.stderr and "is not a JSON model there; left out" in r.stderr and "no views: not a map model" in r.stderr
           and "a lone surrogate code point" in r.stderr and "Traceback" not in r.stderr and "\ufffd" in vers["versions"][1]["model"]["nodes"][0]["label"], (r.stdout[-300:], r.stderr[-600:]))
        # audit 30: diff --base --models 'docs/*.json' read a model moved into docs/ from outside it as every card added: git
        # pairs a rename only inside the pathspec
        g = t / "mv"; (g / "old").mkdir(parents=True); (g / "docs").mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        nocr = lambda *x: subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                                          "sys.argv = ['umlimator.py', 'diff', *sys.argv[2:]]; u.main()", str(ROOT), *x], cwd=g, capture_output=True, text=True)
        (g / "old" / "x.json").write_text(json.dumps(good, indent=1)); (g / "old" / "y.json").write_text(json.dumps({**good, "title": "y"}, indent=1)); sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "one")
        sh("mv", "old/x.json", "docs/x.json"); sh("commit", "-qm", "moved")
        (g / "old" / "y.json").rename(g / "docs" / "y.json")  # a plain mv, not added: found through the index's copy
        r = nocr("--base", "HEAD~1", "--models", "docs/*.json", "--out", "out")
        got = json.loads(r.stdout or "null")
        (g / "docs" / "x.json").write_text(json.dumps({**good, "nodes": [*good["nodes"], {"id": "c", "label": "NEW-ONE"}]}, indent=1))
        r2 = nocr("--base", "HEAD~1", "--models", "docs/*.json", "--out", "out2")
        got2 = json.loads(r2.stdout or "null")
        ok("diff --base --models · a model moved into the folder from outside it is a move: no change when only moved, else its edits, never every card added (audit 30)",
           r.returncode == 0 and got == [] and r2.returncode == 0 and [(x["file"], x.get("movedFrom")) for x in got2] == [("docs/x.json", "old/x.json")]
           and len(got2[0]["summary"]) == 1 and "NEW-ONE" in got2[0]["summary"][0], (got, got2, r.stderr[-300:], r2.stderr[-300:]))
if part("audit 31"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        run = lambda *x, cwd=None, env=None: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *x], capture_output=True, text=True, cwd=cwd, env=env)
        good = {"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}
        # audit 31: a view whose id ends in * could not be chosen alone: pick() and the page both read its * as a prefix again
        star = {**good, "views": [{"id": "api*", "title": "Star", "nodeIds": ["a"]}, {"id": "api-v2", "title": "Two", "nodeIds": ["b"]}, {"id": "apix", "nodeIds": ["a", "b"]}]}
        (t / "star.json").write_text(json.dumps(star)); r0 = run("render", str(t / "star.json"), "--out", str(t / "star.html"), "--no-check")
        r = run("check", str(t / "star.html"), "--views", "api*")
        ok("check --views · a view whose id ends in * is that view alone, in pick() and on the page; a * that names no view is still a prefix (audit 31)",
           r0.returncode == 0 and u.pick(t / "star.html", "api*") == ["api*"] and u.pick(t / "star.html", "api-*") == ["api-v2"]
           and u.pick(t / "star.html", "apix,api*") == ["api*", "apix"] and u.pick(t / "star.html", "ap*") == ["api*", "api-v2", "apix"]
           and r.returncode == 0 and json.loads(r.stdout)["checked"] == "1 views", (r0.stderr[-300:], r.stdout[-300:], r.stderr[-300:]))
        # audit 31: a label-on-line message whose line ends on a card labelled "Red cross" ends in " cross", and was a crossing
        msgs = ['view main: label "pays" lies on edge Shop→Red cross', 'view main: name tag "x" lies on edge A→Red cross',
                'view main: edge Shop→Red cross runs right-to-left', 'view a: b: edges x→y and z→w cross', 'view a: b: label "q" lies on edge x→cross']
        ok("check · a message is of its kind by the words after \"view <id>: \", never by a card label's last word (audit 31)",
           [u.kind_of(o, set(), ["main", "a: b"]) for o in msgs] == ["labelOnLine", "labelOnLine", "rightToLeft", "crossings", "labelOnLine"]
           and [u.kind_of(o) for o in msgs[:3]] == ["labelOnLine", "labelOnLine", "rightToLeft"], [u.kind_of(o, set(), ["main", "a: b"]) for o in msgs])
        # audit 31: a model whose file name the disk takes (240 bytes) could not render: the copy beside it, 25 bytes longer, could
        # not be written, and that was said as a folder render could not write in; and a model with no title took the copy's name
        long = t / ("m" * 235 + ".json"); long.write_text(json.dumps({k: v for k, v in good.items() if k != "title"}))
        r = run("render", str(long), "--out", str(t / "long.html"), "--no-check")
        ok("render · a model whose file name is 240 bytes renders; with no title, the page is titled by the model file's name, never its copy's (audit 31)",
           r.returncode == 0 and (t / "long.html").is_file() and u.page_data(t / "long.html")[0]["title"] == "m" * 235
           and not [f for f in t.iterdir() if f.name.startswith(".")], r.stderr[-300:])
        # audit 31: a model saved as UTF-16 (PowerShell 5's > and Out-File): the MCP page drew it, while render and the read tools refused it
        (t / "u16.json").write_bytes(json.dumps(good).encode("utf-16"))
        r = run("render", str(t / "u16.json"), "--out", str(t / "u16.html"), "--no-check")
        ok("render · a model saved as UTF-16 with its BOM reads as every command reads it (read_json, as diff --base and the MCP page) (audit 31)",
           r.returncode == 0 and u.page_data(t / "u16.html")[0]["nodes"] == good["nodes"] and u.read_json(t / "u16.json") == good, r.stderr[-300:])
        # audit 31: diff --base --models kept git's pairing inside the pathspec: a model moved in read as moved from one moved out,
        # which was never said
        g = t / "mv"; (g / "docs").mkdir(parents=True); (g / "other").mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        nocr = lambda *x: subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); import umlimator as u; u.CHROMES[:] = ['/no-chrome']; "
                                          "sys.argv = ['umlimator.py', 'diff', *sys.argv[2:]]; u.main()", str(ROOT), *x], cwd=g, capture_output=True, text=True)
        three = {"title": "T", "nodes": [{"id": "a", "label": "Web"}, {"id": "b", "label": "API"}, {"id": "c", "label": "DB"}],
                 "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}], "views": [{"id": "main", "nodeIds": ["a", "b", "c"]}]}
        (g / "other" / "x.json").write_text(json.dumps(three, indent=4)); (g / "docs" / "y.json").write_text(json.dumps({**three, "title": "U"}, indent=4))
        sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "base")
        sh("mv", "other/x.json", "docs/x.json"); (g / "docs" / "x.json").write_text((g / "docs" / "x.json").read_text().replace('"DB"', '"Store"'))
        (g / "other2").mkdir(); sh("mv", "docs/y.json", "other2/y.json")
        r = nocr("--base", "HEAD", "--models", "docs/*.json", "--out", "out")
        got = {x["file"]: x for x in json.loads(r.stdout or "[]")}
        md = (g / "out" / "summary.md").read_text() if (g / "out" / "summary.md").is_file() else ""
        ok("diff --base --models · a model moved in and another moved out in one change: the one in is moved from its own old path, the one out is removed from the folder (audit 31)",
           r.returncode == 0 and set(got) == {"docs/x.json", "docs/y.json"} and got["docs/x.json"].get("movedFrom") == "other/x.json"
           and "moved from `other/x.json`" in md and "moved from `docs/y.json`" not in md and "renames DB to Store" in md and "**`docs/y.json`**" in md,
           (r.stdout[-600:], r.stderr[-300:], md[:600]))
        # audit 31: Export > Map model (JSON) of a page render wrote carried render's inlined avatar (a stranger's picture, for a
        # login the model names), its embedded logo and a layout baked over a null one, and lost the model's own meta.generated and
        # meta.added; an address own_media leaves out is not written into the page to be put back. asWritten is page.js's own
        home = t / "home"; (home / ".cache" / "visual" / "avatars").mkdir(parents=True)
        (home / ".cache" / "visual" / "avatars" / "octocat@96.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\0" * 200)
        (t / "logo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>')
        far = "127.0.0.1:9/beacon-31.png"
        mine = {"title": "Shop", "meta": {"generated": "by hand 2026-01-01", "added": ["mine"], "owner": "team-a", "umlimator:written": "its own"},
                "authors": {"octocat": {"name": "Octo"}, "far": {"name": "F", "avatar": "http://" + far}, "a.b": {"avatar": None}},
                "nodes": [{"id": "a", "label": "Web", "author": "octocat"}, {"id": "b", "label": "API", "author": "far"}], "edges": [{"from": "a", "to": "b", "label": "calls"}],
                "views": [{"id": "main", "title": "Main", "nodeIds": ["a", "b"], "layout": None, "intake": [{"to": "a", "label": "Acme", "logo": "logo.svg"}]},
                          {"id": "two", "parent": "a", "nodeIds": ["b"], "layout": {}}]}
        (t / "mine.json").write_text(json.dumps(mine))
        r = run("render", str(t / "mine.json"), "--out", str(t / "mine.html"), "--no-check", env={**os.environ, "HOME": str(home), "UMLIMATOR_OFFLINE": "1"})
        page = (t / "mine.html").read_text(encoding="utf-8") if (t / "mine.html").is_file() else ""
        js = ("import { readFileSync } from 'node:fs'; const src = readFileSync(process.argv[1], 'utf8');"
              "const asWritten = new Function(src.slice(src.indexOf('function asWritten('), src.indexOf('/* ================= the standalone viewer')) + '; return asWritten;')();"
              "const given = JSON.parse(readFileSync(0, 'utf8')), before = JSON.stringify(given); process.stdout.write(JSON.stringify([asWritten(given), JSON.stringify(given) === before]));")
        data = u.DATA.search(page).group(1) if page else "{}"
        e = subprocess.run(["node", "--input-type=module", "-e", js, str(ROOT / "src" / "page" / "page.js")], input=data, capture_output=True, text=True)
        back, kept = json.loads(e.stdout) if e.returncode == 0 else (None, None)
        d = json.loads(data)
        norm = lambda x: json.dumps(x, sort_keys=True)
        want = json.loads(json.dumps(mine)); del want["authors"]["far"]["avatar"]  # left out by render, and said
        ok("page export · Map model (JSON) of a page render wrote is the file as written: no inlined avatar or embedded logo, a null layout null, the model's own meta kept; an address left out is not in the page (audit 31)",
           r.returncode == 0 and d["authors"]["octocat"]["avatar"].startswith("data:image/png") and d["views"][0]["intake"][0]["logo"].startswith("data:image/svg+xml")
           and norm(back) == norm(want) and kept and far not in page and "authors.far.avatar" in r.stderr,
           (r.stderr[-300:], e.stderr[-300:], back and {k: back.get(k) for k in ("meta", "authors", "views")}))
if part("audit 32"):
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        run = lambda *x, cwd=None, env=None: subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *x], capture_output=True, text=True, cwd=cwd, env=env)
        good = {"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}], "edges": [{"from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}
        # audit 32: a message of check --expand starts "view <id> with <card> unfolded: ", which kind_of split at its first ": ": an id
        # or a card holding ": " left the kind's words behind, and a crossing read as other (counts and --ignore wrong)
        msgs = ["view svc: core with db unfolded: edges A→B and C→D cross", "view api with svc: db unfolded: edges A→B and C→D cross",
                "view api with db unfolded: edge A→B runs right-to-left", 'view api: label "x with y unfolded: z" lies on edge A→B', "view svc: core: edges A→B and C→D cross"]
        want = ["crossings", "crossings", "rightToLeft", "labelOnLine", "crossings"]
        ok("check --expand · a message's kind is read after \"view <id> with <card> unfolded: \", an id or a card holding \": \" too (audit 32)",
           [u.kind_of(o, set(), ["api", "svc: core"]) for o in msgs] == want and [u.kind_of(o) for o in msgs[:4]] == want[:4],
           ([u.kind_of(o, set(), ["api", "svc: core"]) for o in msgs], [u.kind_of(o) for o in msgs]))
        # audit 32: an --out name the disk takes (250 bytes) could not be written: replacing()'s probe beside it is 10 bytes longer
        (t / "g.json").write_text(json.dumps(good)); name = "m" * 245 + ".html"
        r = run("render", str(t / "g.json"), "--out", str(t / name), "--no-check")
        r2 = run("render", str(t / "g.json"), "--out", str(t / ("a." + "x" * 240)), "--no-check")
        ok("render · an --out file name of 250 bytes, or with a 240-byte 'suffix', is written; no probe is left beside it (audit 32)",
           r.returncode == 0 and (t / name).is_file() and r2.returncode == 0 and (t / ("a." + "x" * 240)).is_file()
           and not [f for f in t.iterdir() if f.name.startswith(".")], (r.stderr[-300:], r2.stderr[-300:]))
        # audit 32: a model's top-level files, hunks, areas, fileNotes and stats never reach the page, so a shared page carries no
        # source hunks or paths (risks.md S1); the JSON export gives back the rest of the model as written. asWritten is page.js's own
        eng = {**good, "files": ["SECRET-PATH"], "hunks": {"h": "SECRET-HUNK"}, "areas": [{"name": "a"}], "fileNotes": {"f": "SECRET-NOTE"}, "stats": {"keep": 1}, "custom": {"a": 1}}
        (t / "eng.json").write_text(json.dumps(eng))
        r = run("render", str(t / "eng.json"), "--out", str(t / "eng.html"), "--no-check")
        js = ("import { readFileSync } from 'node:fs'; const src = readFileSync(process.argv[1], 'utf8');"
              "const asWritten = new Function(src.slice(src.indexOf('function asWritten('), src.indexOf('/* ================= the standalone viewer')) + '; return asWritten;')();"
              "process.stdout.write(JSON.stringify(asWritten(JSON.parse(readFileSync(0, 'utf8')))));")
        data = u.DATA.search((t / "eng.html").read_text(encoding="utf-8")).group(1) if (t / "eng.html").is_file() else "{}"
        e = subprocess.run(["node", "--input-type=module", "-e", js, str(ROOT / "src" / "page" / "page.js")], input=data, capture_output=True, text=True)
        back = json.loads(e.stdout) if e.returncode == 0 else None
        page = (t / "eng.html").read_text(encoding="utf-8") if (t / "eng.html").is_file() else ""
        rest = {k: v for k, v in eng.items() if k not in u.ENGINE_ONLY}
        ok("page export · a model's files, hunks, areas, fileNotes and stats never reach the page, and Map model (JSON) gives back the rest as written (audit 32)",
           r.returncode == 0 and "SECRET" not in page and json.dumps(back, sort_keys=True) == json.dumps(rest, sort_keys=True), (r.stderr[-300:], e.stderr[-300:], back))
        # audit 32: diff --base rendered a page for a model whose diff is empty (re-indented, keys reordered), and left it in --out
        g = t / "re"; g.mkdir()
        sh = lambda *x: subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *x], cwd=g, capture_output=True, text=True)
        (g / "c.json").write_text(json.dumps(good)); (g / "d.json").write_text(json.dumps(good))
        sh("init", "-q"); sh("add", "."); sh("commit", "-qm", "base")
        (g / "c.json").write_text(json.dumps(dict(reversed(list(good.items()))), indent=4)); (g / "d.json").write_text(json.dumps({**good, "title": "u"}))
        r = run("diff", "--base", "HEAD", "--out", "out", cwd=g)
        left = sorted(f.name for f in (g / "out").iterdir()) if (g / "out").is_dir() else []
        ok("diff --base · a model only re-indented, its keys reordered, gets no page beside the one that changed (audit 32)",
           r.returncode == 0 and [x["file"] for x in json.loads(r.stdout or "[]")] == ["d.json"] and "c.html" not in left and "d.html" in left, (r.stdout[-300:], r.stderr[-300:], left))
part.done()
sys.exit(1 if failed else 0)
