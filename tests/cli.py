#!/usr/bin/env python3
"""The CLI's change commands end to end (#66, #67, #68): diff of two files, diff --base in a git repository (what the
diff Action runs on a pull request), drift and timelapse; and trace (#96). Pages only: stills (Chrome) are covered by
`stills` itself.

  python3 tests/cli.py

Needs Node (diff, drift and trace run the module's own functions) and git.
"""
import json, re, subprocess, sys, tempfile
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
sys.exit(1 if failed else 0)
