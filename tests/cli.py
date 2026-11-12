#!/usr/bin/env python3
"""The CLI's change commands end to end (#66, #67, #68): diff of two files, diff --base in a git repository (what the
diff Action runs on a pull request), drift and timelapse; trace (#96; as a UML sequence view, 3.8); and pdf (#93), read back with the standard
library. Pages only for the rest: stills (Chrome) are covered by `stills` itself. And the MCP server (#91), driven
through its pipes as an MCP client drives it, with a page's event stream.

  python3 tests/cli.py

Needs Node (diff, drift, trace and the MCP server's read tools run the module's own functions), git, and Chrome or
Chromium (pdf).
"""
import http.client, json, re, subprocess, sys, tempfile, threading, time, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failed = False


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


bike = json.loads((ROOT / "examples" / "bike-share.json").read_text(encoding="utf-8"))
SAID = ["renames Accounts to Accounts and sign-in", "adds Payments queue between Trip service and Payment provider",
        "removes Feature flags", "removes the line from Trip service to Payment provider (charges)"]
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    (t / "before.json").write_text(json.dumps(bike)); (t / "after.json").write_text(json.dumps(edited(bike)))
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

    (g / "docs" / "map.json").write_text(json.dumps(edited(json.loads((g / "docs" / "map.json").read_text()))))
    (g / "notes.json").write_text('{"not": "a map"}'); git("add", "notes.json")
    r = cli("diff", "--base", "HEAD", "--out", str(t / "pr"), cwd=g)
    md = (t / "pr" / "summary.md").read_text(encoding="utf-8") if (t / "pr" / "summary.md").is_file() else ""
    ok("diff --base · each map model changed since the ref (and no other JSON), as a page", r is not None and [x["file"] for x in r] == ["docs/map.json"] and (t / "pr" / "docs-map.html").is_file(), r)
    ok("diff --base · a summary for the pull request: what changed, and a sketch GitHub draws", md.startswith("<!-- umlimator-diff -->") and "- adds Payments queue between Trip service and Payment provider" in md
       and "```mermaid" in md and ":::added" in md and ":::removed" in md, md[:600])
    git("checkout", "-q", "--", "docs/map.json")
    cli("diff", "--base", "HEAD", "--out", str(t / "pr2"), cwd=g)
    ok("diff --base · says so when no map changed", "No map model changed." in ((t / "pr2" / "summary.md").read_text(encoding="utf-8") if (t / "pr2" / "summary.md").is_file() else ""))

    # pdf (#93): the bike share as a document for a review; its words are text. A cover with the contents; each view from a
    # page of its own, under its path, with its legend and tables of its cards, lines and boxes; the rules as a table. The
    # words are compared without spaces: a PDF's text keeps none where a line wraps or between two runs of text, and where
    # a line wraps depends on the fonts a system has
    flat = lambda s: re.sub(r"\s", "", s)
    read = lambda f: [flat(p) for p in pdf_text((t / f).read_bytes())] if (t / f).is_file() else []
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
    for name, path in (("sales-classes", ROOT / "examples" / "sales-classes.json"), ("checkout-sequence", ROOT / "examples" / "checkout-sequence.json"),
                       ("checkout-communication", ROOT / "examples" / "checkout-communication.json"), ("05-component", ROOT / "docs" / "diagrams" / "examples" / "05-component.json")):
        src = json.loads(path.read_text())
        r = cli("render", str(path), "--out", str(t / f"{name}.html"))
        ok(f"render · a typed model ({name}): the engine accepts lines that end on members, and the check is clean",
           r is not None and not r.get("problems") and not r.get("errors"), r)
        page = (t / f"{name}.html").read_text(encoding="utf-8") if r else ""
        data = re.search(r'<script[^>]*id="visual-data"[^>]*>(.*?)</script>', page, re.S)
        views = json.loads(data.group(1))["views"] if data else []
        ok(f"render · {name}: no layout is baked into a typed view; one the model gives is kept",
           views and all(("layout" in v) == ("layout" in w) for v, w in zip(views, src["views"])), [(v["id"], "layout" in v) for v in views])
        c = cli("check", str(t / f"{name}.html"))
        ok(f"check · {name}: every view checked, nothing wrong", c is not None and c.get("checked") and not c["problems"] and not c["errors"], c)
        st = cli("stills", str(t / f"{name}.html"), "--out", str(t / f"stills-{name}"))
        ok(f"stills · {name}: a picture of every view", st is not None and len(list((t / f"stills-{name}").glob("*.png"))) == len(src["views"]), st)
        pd = cli("pdf", str(t / f"{name}.html"), "--out", str(t / f"{name}.pdf"))
        ok(f"pdf · {name}: written", pd is not None and (t / f"{name}.pdf").read_bytes()[:5] == b"%PDF-", pd)
    # R8: a class view's tables list each element's type and members, as the type prints them, and each line's kind
    txt = "".join(read("sales-classes.pdf"))
    ok("pdf · sales-classes: its tables list element types, members and line kinds, not the map's kinds",
       all(flat(s) in txt for s in ["CardKindMembers", "OrderClass- id: UUID", "+ add(book: Book, quantity: Integer)", "MoneyData type+ amount: Decimal",
                                    "From → toLabelKind", "Customer → OrderplacesAssociation", "CardPayment → PaymentGeneralization", "Order → PayableInterface realization"])
       and "Script" not in txt and "calls" not in txt, txt[:800])
    # 3.8: a sequence's and a communication's tables give each lifeline's kind and each message's, connectors too (R8)
    txt = "".join(read("checkout-sequence.pdf"))
    ok("pdf · checkout-sequence: its tables list each lifeline and each message between two lifelines, by kind",
       all(flat(s) in txt for s in ["CardKindMembers", "apiLifeline", "From → toLabelKind", "shopper → storefrontcheckout()Message", "payments → apipaidMessage"])
       and "Script" not in txt and "calls" not in txt, txt[:800])
    txt = "".join(read("checkout-communication.pdf"))
    ok("pdf · checkout-communication: its tables list each lifeline, each connector and each message, by kind",
       all(flat(s) in txt for s in ["apiLifeline", "api → paymentsConnector", "api → paymentscharge(total)Message", "1.1.2.1: paid"])
       and "Script" not in txt and "calls" not in txt, txt[:800])
    # an element with no type is drawn as a class, and its row says so
    bare = json.loads((ROOT / "examples" / "sales-classes.json").read_text()); next(n for n in bare["nodes"] if n["id"] == "order").pop("type")
    (t / "bare.json").write_text(json.dumps(bare))
    bt = "".join(read("bare.pdf")) if cli("render", str(t / "bare.json"), "--out", str(t / "bare.html")) and cli("pdf", str(t / "bare.html"), "--out", str(t / "bare.pdf")) else ""
    ok("pdf · an element with no type: its Kind is Class, as the picture draws it", flat("OrderClass- id: UUID") in bt, bt[:800])
    # upstream's check still catches what validate() calls wrong: a version-1 model's own `members` are not ends, and a
    # member that shares a node's id is an id used twice (from the review of #162)
    for name, m in [("v1-members", {"nodes": [{"id": "a", "members": [{"id": "a.p"}]}, {"id": "b"}], "edges": [{"from": "a.p", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]}),
                    ("v2-twice", {"schemaVersion": 2, "nodes": [{"id": "a", "type": "uml.Class"}, {"id": "b", "type": "uml.Class", "members": [{"id": "a", "type": "uml.Property"}]}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]})]:
        (t / f"{name}.json").write_text(json.dumps(m))
        r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "render", str(t / f"{name}.json"), "--out", str(t / f"{name}.html"), "--no-check"], capture_output=True, text=True)
        ok(f"render · {name}: refused, as validate() refuses it", r.returncode != 0 and ("unknown end" in r.stderr + r.stdout or "duplicate" in (r.stderr + r.stdout).lower()), (r.returncode, (r.stderr + r.stdout)[-300:]))
    # card shapes (0.15.0): a model in the c4 notation prints its shapes, and its legend keys them
    cli("render", str(ROOT / "examples" / "shapes.json"), "--out", str(t / "shapes.html"), "--no-check")
    shp = read("shapes.pdf") if cli("pdf", str(t / "shapes.html"), "--out", str(t / "shapes.pdf")) else []
    ok("pdf · a model in the c4 notation: its legend keys the shapes it draws (a person, a browser app, a phone)",
       shp and all(flat(k) in "".join(shp) for k in ("Personsomeone who uses it", "Browser appruns in a web browser", "Mobile appruns on a phone")), [p[:200] for p in shp[1:2]])
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
   "removes Payments queue", "adds a line from Trip service to Payment provider (charges)"], "views": ["system"]}, said)
said, err = tool("describe_view", view="nope")
ok("mcp · a call that names what the model lacks is a tool error that says what it has", err and said.startswith("no view 'nope'; the views: context, system"), said)

said, err = tool("show_view", view="trips")
ok("mcp · a page tool with no page connected says to open its URL", not err and said.startswith("No page is connected") and url and url.group(0) in said, said)
web = lambda: http.client.HTTPConnection("127.0.0.1", int(url.group(1)), timeout=60)
c = web(); c.request("GET", "/events?page=t1"); stream = c.getresponse()  # a page, as the served script names itself
sent = []


def acks():  # each command on the event stream, answered as the page answers once it has shown it (tests/mcp.py drives a real one)
    line = b" "
    while line:
        line = stream.readline()
        if line.startswith(b"data:"):
            sent.append(json.loads(line[5:]))
            a = web(); a.request("POST", "/state", json.dumps({"page": "t1", "model": sent[-1]["model"], "ack": sent[-1]["id"], "state": {"view": sent[-1]["want"]["view"]}}),
                                 {"Content-Type": "application/json"}); a.getresponse().read()


threading.Thread(target=acks, daemon=True).start()
time.sleep(0.5)
ok("mcp · a page that connects gets what the assistant asked last", sent and sent[0]["want"]["view"] == "trips" and sent[0].get("model"), sent)
said, err = tool("highlight", refs=["trips", "payments", "s9"], view="system")
ok("mcp · highlight: shown on the page once it answers, with card and line ids as Refs, on its event stream", said.startswith("Shown on 1 page") and sent[-1]["want"]["view"] == "system"
   and sent[-1]["want"]["highlight"] == {"refs": [{"type": "node", "id": "trips"}, {"type": "node", "id": "payments"}, {"type": "edge", "ids": ["s9"]}], "view": "system"}, (said, sent[-1:]))
c = web(); c.request("GET", "/"); r = c.getresponse(); page = r.read().decode()
ok("mcp · serves the CLI's page, with the script that shows commands on its map handle (window.umlimatorMap)",
   r.status == 200 and "const map = window.umlimatorMap" in page and "new EventSource(`/events?page=" in page and "Fare calculator" in page)
c = web(); c.request("POST", "/state", "{}", {"Content-Type": "application/json", "Origin": "https://attacker.example"})
ok("mcp · another site's page posts nothing", c.getresponse().status == 403)
c = web(); c.request("GET", "/", headers={"Host": f"attacker.example:{url.group(1)}"})
ok("mcp · a request for another host name (DNS rebinding) gets nothing", c.getresponse().status == 403)
mcp.stdin.close()
ok("mcp · exits when its input closes", mcp.wait(timeout=30) == 0)
sys.exit(1 if failed else 0)
