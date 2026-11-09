#!/usr/bin/env python3
"""The CLI's change commands end to end (#66, #67, #68): diff of two files, diff --base in a git repository (what the
diff Action runs on a pull request), drift and timelapse; and pdf (#93), read back with the standard library. Pages
only for the rest: stills (Chrome) are covered by `stills` itself.

  python3 tests/cli.py

Needs Node (diff and drift run the module's own functions), git, and Chrome or Chromium (pdf).
"""
import json, re, subprocess, sys, tempfile, zlib
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


def pdf_text(data):
    """The text of each page of a PDF Chrome wrote, as a viewer's search finds it: Chrome writes glyph ids, which each
    font's ToUnicode map reads back. The standard library only (zlib for the streams)."""
    obj = dict(re.findall(rb"(\d+) 0 obj\s*(.*?)endobj", data, re.S))

    def stream(n):
        m = re.search(rb"(.*?)stream\r?\n(.*?)\r?\nendstream", obj[n], re.S)
        return zlib.decompress(m.group(2)) if b"/FlateDecode" in m.group(1) else m.group(2)

    def cmap(n):  # glyph id -> text
        t, to = stream(n), {}
        for a, u in re.findall(rb"<(\w+)>\s*<(\w+)>", b"".join(re.findall(rb"beginbfchar(.*?)endbfchar", t, re.S))):
            to[int(a, 16)] = bytes.fromhex(u.decode()).decode("utf-16-be")
        for a, z, u in re.findall(rb"<(\w+)>\s*<(\w+)>\s*<(\w+)>", b"".join(re.findall(rb"beginbfrange(.*?)endbfrange", t, re.S))):
            to.update({k: chr(int(u, 16) + k - int(a, 16)) for k in range(int(a, 16), int(z, 16) + 1)})
        return to

    pages = []
    for page in (b for b in obj.values() if re.search(rb"/Type\s*/Page\b", b)):
        fonts = {f: cmap(re.search(rb"/ToUnicode (\d+) 0 R", obj[n]).group(1)) for f, n in re.findall(rb"/(F\d+) (\d+) 0 R", page)}
        font, text = {}, ""
        for f, run in re.findall(rb"/(F\d+) [\d.]+ Tf|<([0-9A-Fa-f]*)>", stream(re.search(rb"/Contents (\d+) 0 R", page).group(1))):
            if f:
                font = fonts[f]
            else:  # ponytail: two bytes a glyph (Identity-H, as Chrome embeds every font); a one-byte font would need its codespace
                text += "".join(font.get(int(run[i:i + 4], 16), "?") for i in range(0, len(run), 4))
        pages.append(text)
    return pages


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

    # pdf (#93): the bike share in one PDF, a title page, a page per view, then the legend and the rules; its words are text
    cli("render", str(ROOT / "examples" / "bike-share.json"), "--out", str(t / "bike.html"), "--no-check")
    r = cli("pdf", str(t / "bike.html"), "--out", str(t / "bike.pdf")) or {}
    pages = pdf_text((t / "bike.pdf").read_bytes()) if (t / "bike.pdf").is_file() else []
    titles = [v["title"] for v in bike["views"]]
    ok("pdf · a title page, a page per view, and one for the legend and rules", r.get("pages") == len(pages) == len(titles) + 2, [r, len(pages)])
    said = "".join(pages)
    ok("pdf · the title, each view's title, cards and describe() text, the legend and each rule's state are text in it",
       all(s in said for s in ["Bike share, an example", *titles, "Payment provider", "What runs: 18 cards and 15 lines.", "Legend",
                               "Apps never call a database directly: holds", "Only the ride services touch the trips store: holds"]), said[:600])
    r = cli("pdf", str(t / "bike.html"), "--out", str(t / "two.pdf"), "--views", "system,f*", "--theme", "dark") or {}
    ok("pdf --views · only the views named (a trailing * a prefix)", r.get("pages") == 4 and "Fleet service" in "".join(pdf_text((t / "two.pdf").read_bytes())), r)
    # a rule broken in one view: judged in the views a PDF prints, as it says
    (t / "rules2.json").write_text(json.dumps({"nodes": [{"id": "app", "label": "App", "kind": "frontend"}, {"id": "api", "label": "API", "kind": "backend"},
                                                         {"id": "db", "label": "Store", "kind": "database"}],
                                               "edges": [{"from": "app", "to": "api", "label": "asks"}, {"from": "api", "to": "db", "label": "writes"}],
                                               "views": [{"id": "clean", "nodeIds": ["app", "api", "db"]},
                                                         {"id": "direct", "nodeIds": ["app", "db"], "edges": [{"from": "app", "to": "db", "label": "reads"}]}],
                                               "rules": [{"id": "apps-no-db", "title": "Apps never call a database directly", "from": {"kind": "frontend"}, "to": {"kind": "database"}}]}))
    cli("render", str(t / "rules2.json"), "--out", str(t / "rules2.html"), "--no-check")
    read = lambda f, *a: "".join(pdf_text((t / f).read_bytes())) if cli("pdf", str(t / "rules2.html"), "--out", str(t / f), *a) else ""
    every, clean = read("every.pdf"), read("clean.pdf", "--views", "clean")
    ok("pdf · each rule is judged in the views it prints, as it says: broken with the view that breaks it, holding without it",
       "directly: broken" in every and "view direct: edge App" in every and "directly: holds" in clean and "breaks rule" not in clean
       and "Judged in the views printed here." in clean, [every[-240:], clean[-240:]])

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
sys.exit(1 if failed else 0)
