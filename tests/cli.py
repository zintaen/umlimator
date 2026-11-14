#!/usr/bin/env python3
"""The CLI's change commands end to end (#66, #67, #68): diff of two files, diff --base in a git repository (what the
diff Action runs on a pull request; on an object and a package model as the Action's step runs it, 2.6, and on a use case, an activity, a state machine and an interaction overview model, 4.10, and a component, a deployment and a composite structure model, 5.8, and a profile and a timing model, 6.6, and an ER, a flowchart, a data flow, an information flow and a C4 model, M2.14, SysML's four e-bike models, M3.7, and a BPMN model, 4b.5, and on every other typed type, a reorder reading "moves", C10); map-repo's CLI rendering each typed model (C10); drift and timelapse; trace (#96; as a UML sequence view, 3.8); and pdf (#93; the stage 4 types' tables, 4.10, stage 5's, 5.8, stage 6's, 6.6, milestone 2's, M2.14, and SysML's, M3.7), read back with the standard
library. Pages only for the rest: stills (Chrome) are covered by `stills` itself. And the MCP server (#91), driven
through its pipes as an MCP client drives it, with a page's event stream.

  python3 tests/cli.py

Needs Node (diff, drift, trace and the MCP server's read tools run the module's own functions), git, and Chrome or
Chromium (pdf).
"""
import http.client, json, os, re, subprocess, sys, tempfile, threading, time, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failed = False
sys.path.insert(0, str(ROOT))
import umlimator as u


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


# check's kinds: a rule whose title holds another kind's words is a broken rule, which --ignore crossings keeps
ok("check · each message is of one kind, by the check's own words, not a label's or a rule title's",
   [u.kind_of(o) for o in ['view v: edge Web→DB breaks rule "Apps never cross into the data tier"', "view v: edges a→b and c→d cross",
                           'view v: label "runs right-to-left" lies on edge a→b', "view v: edge a→b takes a detour (90px for 40px)"]]
   == ["rules", "crossings", "labelOnLine", "detours"])
# the diff Action's comment: a label is one node's text and a summary line one line, never a fence of their own
fence = u.sketch({"nodes": [{"id": "a", "label": 'A"]\n```\n## Approved <b>x</b>', "change": "added"}, {"id": "b", "label": "B"}],
                  "edges": [{"from": "a", "to": "b"}], "views": [{"id": "v", "nodeIds": ["a", "b"]}]})
ok("diff · the sketch and the summary keep a label's newlines and backticks in their line",
   [x for x in "\n".join(fence).split("\n") if x.startswith("```")] == ["```mermaid", "```"] and "\n" not in u.flat("a\n```\nb") and "\n```" not in u.flat("a\n```"), fence)

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
    (t / "bare").mkdir(); (t / "bare" / "umlimator.py").write_bytes((ROOT / "umlimator.py").read_bytes())  # a copy with no src/
    r = subprocess.run([sys.executable, str(t / "bare" / "umlimator.py"), "trace", str(t / "before.json"), str(tr / "ride-end.json"), "--view", "ride-end",
                        "--diagram", "uml.sequence", "--out", str(t / "bare" / "out.json")], capture_output=True, text=True)
    ok("trace --diagram uml.sequence · with no src/, it says it needs a full clone and writes nothing",
       r.returncode != 0 and "src/uml/convert.js" in r.stderr and not (t / "bare" / "out.json").exists(), (r.returncode, r.stderr[-300:]))

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

    (g / "docs" / "map.json").write_text(json.dumps(edited(json.loads((g / "docs" / "map.json").read_text()))))
    (g / "notes.json").write_text('{"not": "a map"}'); git("add", "notes.json")
    r = cli("diff", "--base", "HEAD", "--out", str(t / "pr"), cwd=g)
    md = (t / "pr" / "summary.md").read_text(encoding="utf-8") if (t / "pr" / "summary.md").is_file() else ""
    ok("diff --base · each map model changed since the ref (and no other JSON), as a page", r is not None and [x["file"] for x in r] == ["docs/map.json"] and (t / "pr" / "docs-map.html").is_file(), r)
    ok("diff --base · a summary for the pull request: what changed, and a sketch GitHub draws", md.startswith("<!-- umlimator-diff -->") and "- adds Payments queue between Trip service and Payment provider" in md
       and "```mermaid" in md and ":::added" in md and ":::removed" in md, md[:600])
    r = cli("diff", "--base", "HEAD", "--out", "pr-sub", cwd=g / "docs") or [{}]  # from a subfolder, with a relative --out: git names files from the top
    ok("diff --base · run from a subfolder, the edited model reads as edited, with its stills", r[0].get("file") == "docs/map.json" and "removes Feature flags" in r[0].get("summary", [])
       and "error" not in r[0] and r[0].get("stills") and all(Path(g / "docs" / s).is_file() for s in r[0]["stills"]), r)
    git("checkout", "-q", "--", "docs/map.json")
    cli("diff", "--base", "HEAD", "--out", str(t / "pr2"), cwd=g)
    ok("diff --base · says so when no map changed", "No map model changed." in ((t / "pr2" / "summary.md").read_text(encoding="utf-8") if (t / "pr2" / "summary.md").is_file() else ""))

    # a view id is the model's, not a path: ../x is a still inside --out
    (t / "esc").mkdir(); (t / "esc" / "m.json").write_text(json.dumps({"title": "t", "nodes": [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}],
        "edges": [{"id": "e", "from": "a", "to": "b"}], "views": [{"id": "../escaped", "title": "V", "nodeIds": ["a", "b"]}]}))
    cli("render", str(t / "esc" / "m.json"), "--out", str(t / "esc" / "page.html"), "--no-check")
    r = cli("stills", str(t / "esc" / "page.html"), "--out", str(t / "esc" / "out"))
    ok("stills · a view id with a / is a file name inside --out", r and len(r) == 1 and Path(r[0]["png"]).parent == t / "esc" / "out" and not list((t / "esc").glob("escaped.*")), r)

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
        p = subprocess.run([sys.executable, str(ROOT / "plugins" / "umlimator" / "skills" / "map-repo" / "scripts" / "cli.py"), "render", str(path),
                            "--out", str(t / f"skill-{path.stem}.html")], capture_output=True, text=True, env=skill_env)
        try:
            r = json.loads(p.stdout)
        except ValueError:
            r = None
        # the pinned crossings of examples 9 and 10, as render's own check above (stage 5's three are clean since decision 22)
        said = {"fulfil-activity": ["cross"] * 2, "order-states": ["cross"] * 2, "bookshop-c4": ["cross"] * 14, "bookshop-data-flow": ["cross"] * 2,
                "bookshop-gcp": ["cross"], "bookshop-azure": ["cross"], "bookshop-order-to-shipment": ["cross"] * 5}.get(path.stem, [])
        ok(f"map-repo's cli.py · renders a typed model it is given ({path.stem}): the page, and its check" + (f" (at most {len(said)} crossings, stated)" if said else " clean"),
           p.returncode == 0 and r is not None and not r.get("errors") and all(q.endswith(" cross") for q in r.get("problems") or []) and len(r.get("problems") or []) <= len(said)
           and (t / f"skill-{path.stem}.html").is_file(), (p.returncode, p.stdout[-400:], p.stderr[-400:]))

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
                                                                       # 4a.7: milestone 4a's three examples, rendered with no pack (UMLIMATOR_NO_PACKS in CI's site build)
                                                                       "bookshop-opening-plan", "bookshop-gcp", "bookshop-azure",
                                                                       # 4b.5: the BPMN example
                                                                       "bookshop-order-to-shipment"))):
        src = json.loads(path.read_text())
        r = cli("render", str(path), "--out", str(t / f"{name}.html"))
        # 4.10: the crossings that turning port repair off leaves in examples 9 and 10 (notes/stage-4.md §17), pinned in their
        # types' tests and stated in their conformance notes; nothing else
        # at most these: text widths differ between machines (Linux CI counts fewer than a Mac), so the count is a ceiling
        # M2.14: the crossings repair and reroute off leave in the C4 and data flow examples (notes/milestone-2.md §11), as Chrome
        # counts them (tests/atlas.test.mjs counts Node's); stated in docs/conformance/c4.md and dfd.md
        # 4a.7: the Google Cloud and Azure examples' one each, repair and reroute off (notes/milestone-4a.md §11), stated in
        # docs/conformance/gcp.md and azure.md
        # 4b.5: the BPMN example's, repair and reroute off (notes/milestone-4b.md §14), stated in docs/conformance/bpmn.md
        crossings = {"fulfil-activity": 2, "order-states": 2, "bookshop-c4": 14, "bookshop-data-flow": 2, "bookshop-gcp": 1, "bookshop-azure": 1, "bookshop-order-to-shipment": 5}.get(name, 0)
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
    # R8: a class view's tables list each element's type and members, as the type prints them, and each line's kind
    txt = "".join(read("sales-classes.pdf"))
    ok("pdf · sales-classes: its tables list element types, members and line kinds, not the map's kinds",
       all(flat(s) in txt for s in ["CardKindMembers", "OrderClass- id: UUID", "+ add(book: Book, quantity: Integer)", "MoneyData type+ amount: Decimal",
                                    "From → toLabelKind", "Customer → OrderplacesAssociation", "CardPayment → PaymentGeneralization", "Order → PayableInterface realization"])
       and "Script" not in txt and "calls" not in txt, txt[:800])
    # 2.6: the object diagram's tables list each instance with its slots, the package diagram's each element's kind and each line's
    txt = "".join(read("order-objects.pdf"))
    ok("pdf · order-objects: its tables list each instance's kind and its slots as feature = value, and each link",
       all(flat(s) in txt for s in ["CardKindMembers", "order1042Instance specificationstatus = placedtotal = 34.00 EUR", "cardInstance specificationamount = 34.00 EURlast4 = 4242",
                                    "From → toLabelKind", "ada → order1042placesLink", "order1042 → cardLink"]) and "Script" not in txt and "calls" not in txt, txt[:800])
    txt = "".join(read("bookshop-packages.pdf"))
    ok("pdf · bookshop-packages: its tables list each element's kind (package, class, interface, enumeration, data type) and each line's",
       all(flat(s) in txt for s in ["CardKindMembers", "sharedPackageMoneyData type", "OrderStatusEnumeration", "PayableInterface", "wholesalePackageOrderClass",
                                    "catalog → sharedPackage import", "wholesale → salesPackage merge", "sales → paymentsDependency"]) and "Script" not in txt and "calls" not in txt, txt[:800])
    # 3.8: a sequence's and a communication's tables give each lifeline's kind and each message's, connectors too (R8)
    txt = "".join(read("checkout-sequence.pdf"))
    ok("pdf · checkout-sequence: its tables list each lifeline and each message between two lifelines, by kind",
       all(flat(s) in txt for s in ["CardKindMembers", "apiLifeline", "From → toLabelKind", "shopper → storefrontcheckout()Message", "payments → apipaidMessage"])
       and "Script" not in txt and "calls" not in txt, txt[:800])
    txt = "".join(read("checkout-communication.pdf"))
    ok("pdf · checkout-communication: its tables list each lifeline, each connector and each message, by kind",
       all(flat(s) in txt for s in ["apiLifeline", "api → paymentsConnector", "api → paymentscharge(total)Message", "1.1.2.1: paid"])
       and "Script" not in txt and "calls" not in txt, txt[:800])
    # 4.10: the four stage 4 types' tables (notes/stage-4.md §15): a use case's extension points, an activity node's kind and
    # its partition, a state's internal transitions and a composite's regions, an overview node's kind; each line's kind
    txt = "".join(read("shopping-use-cases.pdf"))
    ok("pdf · shopping-use-cases: its tables list each actor, subject and use case by kind, a use case's extension points, each line's kind",
       all(flat(s) in txt for s in ["Elements", "CardKindMembers", "ShopperActor", "Online bookshopSubject", "Check outUse casepaymentextras",
                                    "From → toLabelKind", "Shopper → Browse the catalogAssociation", "Check out → Pay for the orderInclude", "Redeem a voucher → Check outExtend",
                                    "Member → ShopperGeneralization"]), txt[:800])
    txt = "".join(read("fulfil-activity.pdf"))
    ok("pdf · fulfil-activity: its tables list each node's kind and its partition (rows), each partition, each flow's kind",
       all(flat(s) in txt for s in ["Order workerPartition", "All books in stock?Decisionin Warehouse", "Stock levelsData storein Warehouse", "Take paymentCall behaviour actionin Order worker",
                                    "toldFlow finalin Email service", "pay-startInitial node", "Control flow", "Object flow"]), txt[:800])
    txt = "".join(read("order-states.pdf"))
    ok("pdf · order-states: its tables list each element's kind (a pseudostate's), a state's entry, do and exit and internal transitions, a composite's regions, each transition",
       # the state type's `word` and `rows` (notes/stage-4.md §15, decision 18): a pseudostate by its kind, a state's activities
       all(flat(s) in txt for s in ["PlacedStateentry / reserve the books", "address changed / update the deliveryaddress", "FulfillingComposite stateregion Parcelregion Payment", "createdInitial pseudostate", "payment-outcomeChoice", "deliveredFinal state",
                                    "created → PlacedTransition", "Capturing payment → CancelledTransition"]), txt[:800])
    txt = "".join(read("buy-book-overview.pdf"))
    ok("pdf · buy-book-overview: its tables list each node's kind and each flow, then each sequence view it opens",
       all(flat(s) in txt for s in ["Find a bookInteraction use", "Queue the orderInteraction", "Payment accepted?Decision node", "buy-splitFork node", "Payment accepted? → buy-splitControl flow",
                                    "storefront → apifindBooks(title)Message"]), txt[:800])
    # 5.8: the three stage 5 types' tables (notes/stage-5.md §11): a component's ports with what they provide and the
    # connectors from them, an interface's kind, what an artifact manifests; a target's kind and what is deployed on it; the
    # subject's parts with their aggregation and its connectors, a collaboration use's collaboration and bindings
    txt = "".join(read("bookshop-components.pdf"))
    ok("pdf · bookshop-components: its tables list each component's ports and what they provide, the connectors from them, each interface and artifact by kind, each line between elements",
       all(flat(s) in txt for s in ["Elements", "Shop APIComponentorders, provides Orderspayments", "Delegation from orders of Shop API to orders of Checkout",
                                    "Assembly from payments of Shop API to charges of Payment provider", "OrdersInterface", "shop-api.jarArtifactmanifests Shop API",
                                    "From → toLabelKind", "Storefront → OrdersUsage", "shop-api.jar → Shop APIManifestation"]), txt[:800])
    txt = "".join(read("bookshop-deployment.pdf"))
    ok("pdf · bookshop-deployment: its tables list each target's kind and what is deployed on it (by nesting or a line), each artifact's manifestation, each path",
       all(flat(s) in txt for s in ["Shopper's deviceDevice", "Java 21 runtimeExecution environmentshop-api.jarorder-worker.jarshop-api.yaml", "Edge proxyNoderoutes.conf, by «deploy»",
                                    "shop-api.yamlDeployment specification", "order-worker.jarArtifactmanifests Order worker",
                                    "Edge proxy → Application serverHTTPCommunication path", "routes.conf → Edge proxyDeployment"]), txt[:800])
    txt = "".join(read("order-service-structure.pdf"))
    ok("pdf · order-service-structure: its tables list the subject's ports and parts, each part shared or composite, its connectors, the collaboration use's collaboration and bindings, the collaboration's roles",
       all(flat(s) in txt for s in ["OrderServiceClassport apiport payments", "checkout : CheckoutFlow [1], composite", "listeners : OrderListener [0..*], shared",
                                    "Connector from api of OrderService to requests of checkout", "orderEventsCollaboration usePublishSubscribepublisher ← checkoutsubscriber ← listeners",
                                    "PublishSubscribeCollaborationpublisher : EventSource [1]subscriber : EventListener [0..*]Connector from publisher to subscriber"]), txt[:800])
    # 6.6: the two stage 6 types' tables (notes/stage-6.md §9): a profile's stereotypes and metaclasses and the packages it is
    # applied to, a metaclass's extensions, a stereotype's extension, generals and tags, an element's stereotypes with their
    # tags (a required one marked), a member's; a lifeline's changes in time order, the messages it sends and the
    # constraints on its changes
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
                                           "Paid?→forkyesSequenceflow"]}
    for n, want in PDF2.items():
        txt = "".join(read(f"{n}.pdf"))
        ok(f"pdf · {n}: its tables list what milestone 2's type says of each element and line (§9)", all(w in txt for w in want), [w for w in want if w not in txt] or txt[:800])
    # M3.7: SysML's tables (notes/milestone-3.md §13): a requirement's id, text and derived relations, each relationship by its
    # keyword; a block's compartments, an interface block's flow properties, a constraint block's expression and parameters, a
    # value type's unit; the subject's members, each connector with the item it carries; each binding by its ends
    PDF3 = {"ebike-requirements": ["RangeRequirementid:EB-1.2text:Afullchargeshallgiveatleast60kmofassistedriding.containedinE-bikespecificationderivesBatterycapacity",
                                   "BatterycapacityRequirementid:BAT-1", "Battery→Batterycapacity«satisfy»Satisfy", "Rangerideonthetestcircuit→Range«verify»Verify"],
            "ebike-blocks": ["ChargeInterfaceInterfaceblockflowproperties:indc:DCPowerflowproperties:outstateOfCharge:Percent",
                             "RangeEquationConstraintblockconstraints:{range=energy/consumption}parameters:range:Distance", "EnergyValuetypequantity:unit=Wh",
                             "EBike→RentalVehicleGeneralization"],
            "ebike-structure": ["EBikeBlockbattery:Battery[1]", "refdock:Dock[0..1]", "Connectorfrompowerofbatterytosupplyofcontroller,carryingDCPowerfrompowertosupply"],
            "ebike-range": ["eco:RangeEquation", "BindingfromvalueecoRangetoparameterrangeofeco", "Bindingfromparameterusableofusabletoparameterenergyofboost"]}
    for n, want in PDF3.items():
        txt = "".join(read(f"{n}.pdf"))
        ok(f"pdf · {n}: its tables list what SysML's type says of each element and line (§13)", all(w in txt for w in want), [w for w in want if w not in txt] or txt[:800])
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
    txt = "".join(read("bookshop-timing.pdf"))
    ok("pdf · bookshop-timing: its tables list each lifeline's changes in time order, the messages it sends and the constraints on its changes, each message's kind",
       all(flat(s) in txt for s in ["workerLifeline0 ms: Idle100 ms: Waiting for payment760 ms: Recording payment900 ms: Idlecharge(total) to payments at 100 ms → 140 ms",
                                    "Duration constraint {<= 800 ms} on worker from 100 ms to 760 msTime constraint {<= 1000 ms} on worker at 900 ms", "paymentsLifeline0 ms: Idle140 ms: Authorising",
                                    "paid to worker at 720 ms → 760 ms", "worker → paymentscharge(total)Message"]), txt[:800])
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
wrong = [tool("describe_view", view=["trips"]), tool("tour", cards=[{"id": "trips"}]), tool("diff", other_model_path=5)]
ok("mcp · an argument of another type than its inputSchema's is a tool error that names it", all(e for _, e in wrong) and "view is not" in wrong[0][0], wrong)

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
