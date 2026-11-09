#!/usr/bin/env python3
"""The CLI's change commands end to end (#66, #67, #68): diff of two files, diff --base in a git repository (what the
diff Action runs on a pull request), drift and timelapse. Pages only: stills (Chrome) are covered by `stills` itself.
And the MCP server (#91), driven through its pipes as an MCP client drives it, with a page's event stream.

  python3 tests/cli.py

Needs Node (diff, drift and the MCP server's read tools run the module's own functions) and git.
"""
import http.client, json, re, subprocess, sys, tempfile, threading
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
ok("mcp · tools/list", listed == ["list_views", "describe_view", "paths", "reach", "broken_rules", "validate", "diff", "show_view", "highlight", "tour", "play_story", "clear"], listed)
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
c = web(); c.request("GET", "/events"); stream = c.getresponse()


def event():  # the next command on the event stream
    line = b" "
    while line and not line.startswith(b"data:"):
        line = stream.readline()
    return json.loads(line[5:] or b"{}")


sent = event()
ok("mcp · a page that connects gets the latest command", sent.get("do") == "view" and sent.get("view") == "trips" and sent.get("model"), sent)
said, err = tool("highlight", refs=["trips", "payments", "s9"], view="system")
sent = event()
ok("mcp · highlight: sent to the page connected, card and line ids as Refs, on its event stream", said.startswith("Sent to 1 page") and sent.get("do") == "highlight"
   and sent.get("view") == "system" and sent.get("refs") == [{"type": "node", "id": "trips"}, {"type": "node", "id": "payments"}, {"type": "edge", "ids": ["s9"]}], (said, sent))
c = web(); c.request("GET", "/"); r = c.getresponse(); page = r.read().decode()
ok("mcp · serves the CLI's page, with the map's handle kept and the script that plays commands",
   r.status == 200 and "window.umlimatorPage = mountPage(app, D," in page and "new EventSource('/events')" in page and "Fare calculator" in page)
c = web(); c.request("GET", "/", headers={"Host": f"attacker.example:{url.group(1)}"})
ok("mcp · a request for another host name (DNS rebinding) gets nothing", c.getresponse().status == 403)
mcp.stdin.close()
ok("mcp · exits when its input closes", mcp.wait(timeout=30) == 0)
sys.exit(1 if failed else 0)
