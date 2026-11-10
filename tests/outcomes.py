#!/usr/bin/env python3
"""What the CLI's commands leave behind, and say, when something goes wrong (the state-machine audit's tooling area,
0.14.0). Each case is one of the audit's repros, named by its defect (tooling.json's machine, #n), and failed before:
- Chrome: one that cannot start, or does not finish, is said in its own words, and its processes end with the command;
- views: --views is resolved against the page before Chrome starts, ids are encoded in the page's link, and a check of
  no view fails;
- render: a model the engine rejects leaves the previous page and prints no JSON; SIGTERM leaves nothing behind;
- outputs: each file is written whole or not at all (pdf keeps the previous PDF);
- stills: a view is recorded only once both files are whole, a file changed since is drawn again, the key covers the
  rules and the lines that end on a box, and a failed view fails the command;
- diff --base: a model that no longer parses is a change, the pictures are extras, the summary is always written;
- the icon cache: a cached logo is checked each time it is read;
- the MCP server: batches, where relative paths resolve, a port of its own.

  python3 tests/outcomes.py

Needs Chrome or Chromium, Node and git. With --cli STAND-INS ARGS it is umlimator.py with stand-ins (a Chrome of the
test's own, a short timeout, a Chrome that dies on a screenshot), for what a real Chrome can't be made to do on demand.
"""
import importlib.util, json, os, re, shutil, signal, socket, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

if sys.argv[1:2] == ["--cli"]:
    stand_ins, *args = sys.argv[2:]
    sys.path.insert(0, str(ROOT))
    import umlimator as u
    for s in stand_ins.split(","):
        if s == "no-chrome":
            u.CHROMES[:] = ["/nonexistent/chrome"]
        elif s.startswith("chrome="):
            u.CHROMES.insert(0, s[7:])
        elif s.startswith("timeout="):
            u.headless.__kwdefaults__["timeout"] = int(s[8:])
        elif s == "no-png":  # Chrome dies on the screenshot without a word: exit 0, no file
            real = u.headless
            u.headless = lambda b, *a, timeout=90: "" if any(x.startswith("--screenshot=") for x in a) else real(b, *a, timeout=timeout)
    sys.argv = ["umlimator.py", *args]
    u.main()
    sys.exit(0)

failed = False


def ok(name, cond, info=""):
    global failed
    print(("ok  " if cond else "FAIL"), name, "" if cond else str(info)[-1500:])
    failed |= not cond


def cli(*args, stand_in=None, cwd=None, env=None):
    cmd = [sys.executable, str(Path(__file__).resolve()), "--cli", stand_in] if stand_in else [sys.executable, str(ROOT / "umlimator.py")]
    return subprocess.run([*cmd, *map(str, args)], capture_output=True, text=True, cwd=cwd, env={**os.environ, **(env or {})})


def said(r):
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def made(r):
    return [d["view"] for d in said(r) or []]


def hidden(folder):
    return sorted(p.name for p in Path(folder).iterdir() if p.name.startswith("."))


spec = importlib.util.spec_from_file_location("umlimator", ROOT / "umlimator.py")
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)
bike = json.loads((ROOT / "examples" / "bike-share.json").read_text(encoding="utf-8"))
ODD = {"title": "Odd ids", "nodes": [{"id": "web", "label": "Web", "kind": "frontend"}, {"id": "api", "label": "API", "kind": "backend"},
                                     {"id": "db", "label": "Store", "kind": "database"}],
       "edges": [{"id": "e1", "from": "web", "to": "api", "label": "calls"}, {"id": "e2", "from": "api", "to": "db", "label": "reads"}],
       "views": [{"id": "plain", "title": "Plain", "nodeIds": ["web", "api", "db"]}, {"id": "R&D", "title": "R and D", "parent": "plain", "nodeIds": ["web", "api"]},
                 {"id": "a+b", "title": "A plus B", "parent": "plain", "nodeIds": ["api", "db"]}, {"id": "empty", "title": "Nothing yet", "parent": "plain", "nodeIds": []}]}

with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    (t / "bike.json").write_text(json.dumps(bike), encoding="utf-8")
    (t / "odd.json").write_text(json.dumps(ODD), encoding="utf-8")
    page, odd = t / "bike.html", t / "odd.html"
    for m, p in (("bike.json", page), ("odd.json", odd)):
        r = cli("render", t / m, "--out", p, "--no-check")
        if r.returncode:
            sys.exit(f"cannot render {m}: {r.stderr}")

    # ---------- Chrome ----------
    fake = t / "chrome"
    fake.write_text("#!/bin/sh\necho '[0110/000000.000000:FATAL:zygote_host_impl_linux.cc(127)] Running as root without --no-sandbox is not "
                    "supported. See https://crbug.com/638180.' >&2\nexit 1\n")
    fake.chmod(0o755)
    for args in (["check", page], ["stills", page, "--out", t / "x"], ["pdf", page, "--out", t / "x.pdf"], ["record", page, "--story", "ride", "--out", t / "x.png"]):
        r = cli(*args, stand_in=f"chrome={fake}")
        ok(f"chrome-driver#1 · {args[0]}: a Chrome that cannot start is said in its own words, and nothing is printed as done",
           r.returncode == 1 and "Running as root without --no-sandbox" in r.stderr and not r.stdout.strip() and "Traceback" not in r.stderr, r.stdout + r.stderr)
    busy = t / "busy.html"  # a page that never finishes
    busy.write_text(page.read_text(encoding="utf-8").replace("<body>", "<body><script>for (;;) {}</script>", 1), encoding="utf-8")
    r = cli("record", busy, "--story", "ride", "--out", t / "busy.png", stand_in="timeout=3")
    ok("chrome-driver#2 · record: a Chrome that does not finish is a message, not a traceback",
       r.returncode == 1 and "record: Chrome did not finish in 3 s" in r.stderr and "Traceback" not in r.stderr, r.stderr)
    slow = t / "slow-chrome"  # a Chrome whose helper outlives it, as Chrome's do when only Chrome itself is killed
    slow.write_text('#!/bin/sh\nsleep 300 &\necho $! >> "$HELPERS"\nsleep 300\n')
    slow.chmod(0o755)
    r = cli("check", page, "--timeout", "3", stand_in=f"chrome={slow}", env={"HELPERS": str(t / "helpers")})
    time.sleep(0.3)
    alive = [int(h) for h in (t / "helpers").read_text().split() if subprocess.run(["kill", "-0", h], capture_output=True).returncode == 0]
    for h in alive:
        os.kill(h, signal.SIGKILL)
    ok("chrome-driver#3 · a Chrome that does not finish is ended with its helpers", "Chrome did not finish in 3 s" in r.stderr and not alive, (r.stderr, alive))
    r = cli("pdf", page, "--out", t / "y.pdf", stand_in="no-chrome")
    ok("chrome-driver#4 · with no Chrome, each command names itself", r.returncode == 1 and r.stderr.startswith("pdf: needs Google Chrome or Chromium"), r.stderr)

    # ---------- views ----------
    r = cli("check", page, "--views", "sytem")
    ok("page-hook-protocol#1 · check --views that names no view fails, before Chrome starts, and lists the views",
       r.returncode == 1 and "no view 'sytem'" in r.stderr and "its views: context, system, trips, fleet, ride-end" in r.stderr and not r.stdout.strip(), r.stdout + r.stderr)
    r = cli("stills", odd, "--out", t / "odd", "--views", "plain,R&D,a+b")
    ok("page-hook-protocol#2 · views whose ids hold & and + are stilled", r.returncode == 0 and made(r) == ["plain", "R&D", "a+b"], r.stdout + r.stderr)
    r = cli("check", odd, "--views", "R&D")
    ok("page-hook-protocol#2 · and checked", r.returncode == 0 and (said(r) or {}).get("checked") == "1 views", r.stdout + r.stderr)
    r = cli("pdf", odd, "--out", t / "odd.pdf", "--views", "a+b")
    ok("page-hook-protocol#2 · and printed", r.returncode == 0 and (said(r) or {}).get("pages") == 3, r.stdout + r.stderr)
    r = cli("stills", page, "--out", t / "fl", "--views", "fl*,nope")
    ok("page-hook-protocol#3 · a name that matches no view ends stills before Chrome starts", r.returncode == 1 and "no view 'nope'" in r.stderr and not (t / "fl").exists(), r.stderr)
    r = cli("stills", page, "--out", t / "fl", "--views", "fl*")
    ok("page-hook-protocol#4 · stills --views takes a trailing * as check and pdf do", r.returncode == 0 and made(r) == ["fleet"], r.stdout + r.stderr)

    # ---------- render ----------
    shop = t / "shop"
    shop.mkdir()
    shutil.copy(ROOT / "examples" / "bookshop.json", shop / "m.json")
    r = cli("render", shop / "m.json", "--out", shop / "m.html")
    ok("cli-render-pipeline#3 · a checked render leaves no screenshot folder beside the page", r.returncode == 0 and hidden(shop) == [], hidden(shop))
    ok("cli-render-pipeline#5 · and its JSON says the page was checked", (said(r) or {}).get("checked") is True, r.stdout)
    r = cli("render", shop / "m.json", "--out", shop / "m.html", "--no-check")
    ok("cli-render-pipeline#5 · --no-check says the page was not", (said(r) or {}).get("checked") is False, r.stdout)
    before = (shop / "m.html").read_bytes()
    m = json.loads((shop / "m.json").read_text(encoding="utf-8"))
    m["edges"].append({"id": "oops", "from": m["nodes"][0]["id"], "to": "no-such-card", "label": "dangles"})
    (shop / "m.json").write_text(json.dumps(m), encoding="utf-8")
    r = cli("render", shop / "m.json", "--out", shop / "m.html", "--no-check")
    ok("cli-render-pipeline#1 · a model the engine rejects prints no JSON, says why, and leaves the previous page as it was",
       r.returncode == 1 and not r.stdout.strip() and "unknown end" in r.stderr and (shop / "m.html").read_bytes() == before and hidden(shop) == [],
       (r.stdout, r.stderr, hidden(shop)))
    term = t / "term"
    term.mkdir()
    shutil.copy(t / "bike.json", term / "m.json")
    p = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "render", "m.json", "--out", "m.html", "--no-check"], cwd=term,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(1500):
        if any(n.endswith(".icons.json") for n in os.listdir(term)):
            break
        time.sleep(0.02)
    p.send_signal(signal.SIGTERM)
    code = p.wait()
    time.sleep(4)  # the engine's own process wrote the page after the CLI ended
    ok("cli-render-pipeline#2 · a render stopped by SIGTERM leaves nothing behind, and no page is written after it",
       code == 143 and sorted(os.listdir(term)) == ["m.json"], (code, os.listdir(term)))

    # ---------- outputs ----------
    keep = t / "keep.json"
    keep.write_text("the previous file", encoding="utf-8")
    try:  # every file the CLI writes (trace's model, import's, pages, pictures, summary.md) goes through replacing()
        with u.replacing(keep) as part:
            part.write_text("half of the n", encoding="utf-8")
            raise RuntimeError("the disk is full")
    except (RuntimeError, AttributeError):
        pass
    ok("cli-out-artifact#2,#3 · a write that fails leaves the previous file whole, and no part of the new one",
       hasattr(u, "replacing") and keep.read_text(encoding="utf-8") == "the previous file" and hidden(t) == [], hidden(t))
    r = cli("pdf", odd, "--out", t / "map.pdf")
    good = (t / "map.pdf").read_bytes() if r.returncode == 0 else b""
    r = cli("pdf", odd, "--out", t / "map.pdf", "--views", "empty")
    ok("cli-out-artifact#1 · a failed pdf keeps the previous PDF, and says so", r.returncode == 1 and "is as it was" in r.stderr
       and good and (t / "map.pdf").read_bytes() == good and hidden(t) == [], (r.stderr, hidden(t)))

    # ---------- stills ----------
    st = t / "st"
    r = cli("stills", page, "--out", st, "--views", "context,system")
    ok("stills · exports each view", r.returncode == 0 and made(r) == ["context", "system"], r.stderr)
    r = cli("stills", page, "--out", st, "--views", "context", "--theme", "dark", stand_in="no-png")
    ok("stills-cache#1,#4 · a view whose PNG Chrome did not write fails the command, and stdout is not JSON of it",
       r.returncode == 1 and "context: Chrome wrote no PNG" in r.stderr and not r.stdout.strip(), r.stdout + r.stderr)
    r = cli("stills", page, "--out", st, "--views", "context", "--theme", "dark")
    ok("stills-cache#1 · and it was not recorded: the next run draws it", r.returncode == 0 and made(r) == ["context"], r.stdout + r.stderr)
    shutil.copy(st / "system.png", st / "context.png")  # another picture in its place, as two runs at once leave one
    r = cli("stills", page, "--out", st, "--views", "context,system", "--theme", "dark")
    ok("stills-cache#2 · a file changed since its export is drawn again, never trusted", r.returncode == 0 and made(r) == ["context", "system"], r.stdout + r.stderr)
    ref, both = t / "ref", t / "both"
    cli("stills", page, "--out", ref, "--views", "context,system")
    for trial in range(2):  # the audit's repro: light and dark at once into one folder, then a light run
        runs = [subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "stills", str(page), "--out", str(both), "--views", "context,system", "--theme", th],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for th in ("light", "dark")]
        [p.wait() for p in runs]
        cli("stills", page, "--out", both, "--views", "context,system")
        same = all((both / f).read_bytes() == (ref / f).read_bytes() for f in ("context.svg", "context.png", "system.svg", "system.png"))
        ok(f"stills-cache#2 · two runs at once into one folder, then a light run: every picture is the light one (trial {trial + 1})", same)
    r = cli("stills", page, "--out", st, "--views", "context", "--scale", "2", "--theme", "dark")
    ok("stills-cache#5 · --scale 2 and the default scale share the record", r.returncode == 0 and made(r) == [], r.stdout + r.stderr)
    r = cli("stills", page, "--out", st, "--views", "context", "--theme", "dark", "--all")
    r = cli("stills", page, "--out", st, "--views", "context,system", "--theme", "dark")
    ok("stills-cache#6 · --all --views keeps the other views' records", r.returncode == 0 and made(r) == [], r.stdout + r.stderr)
    (st / ".stills").mkdir(exist_ok=True)
    (st / ".stills" / "system.json").write_text('{"key": "ab', encoding="utf-8")
    r = cli("stills", page, "--out", st, "--views", "context,system", "--theme", "dark")
    ok("stills-cache#7 · a record cut short is drawn again, not a crash", r.returncode == 0 and made(r) == ["system"], r.stdout + r.stderr)
    k = t / "k"
    k.mkdir()
    (k / "m.json").write_text(json.dumps(bike), encoding="utf-8")
    def again(change):
        m = json.loads((k / "m.json").read_text(encoding="utf-8"))
        change(m)
        (k / "m.json").write_text(json.dumps(m), encoding="utf-8")
        cli("render", k / "m.json", "--out", k / "m.html", "--no-check")
        return cli("stills", k / "m.html", "--out", k / "st", "--views", "system")
    again(lambda m: None)
    r = again(lambda m: next(e for e in m["edges"] if e["id"] == "s16").update(label="scrapes EVERYTHING"))  # Monitoring to the Rides box
    ok("stills-cache#3 · the key covers a line that ends on a box", made(r) == ["system"] and "scrapes EVERYTHING" in (k / "st" / "system.svg").read_text(encoding="utf-8"), r.stderr)
    r = again(lambda m: m["rules"].append({"id": "no-direct-charge", "title": "Trips never charge directly", "from": {"id": "trips"}, "to": {"id": "payments"}}))
    ok("stills-cache#3 · and the model's rules (a broken one's line is drawn rose)", made(r) == ["system"] and "#cf222e" in (k / "st" / "system.svg").read_text(encoding="utf-8"), r.stderr)
    cli("stills", page, "--out", k / "st", "--views", "ride-end")
    again(lambda m: m["views"].pop())  # ride-end
    r = cli("stills", k / "m.html", "--out", k / "st", "--views", "system")
    ok("stills-cache#8 · views the page no longer has are named", "the page no longer has: ride-end" in r.stderr, r.stderr)

    # ---------- diff --base ----------
    g = t / "repo"
    (g / "docs").mkdir(parents=True)
    (g / "a").mkdir(); (g / "a-b").mkdir()
    git = lambda *a: subprocess.run(["git", "-C", str(g), "-c", "user.name=t", "-c", "user.email=t@example.invalid", *a], capture_output=True, text=True, check=True)
    git("init", "-q")
    shutil.copy(ROOT / "examples" / "bookshop.json", g / "docs" / "map.json")
    for f in ("a/b-c.json", "a-b/c.json"):
        (g / f).write_text(json.dumps({k: ODD[k] for k in ODD if k != "views"} | {"views": ODD["views"][:1]}), encoding="utf-8")
    git("add", "."); git("commit", "-q", "-m", "base")
    (g / "docs" / "map.json").write_text((g / "docs" / "map.json").read_text(encoding="utf-8").replace('"title"', '<<<<<<< HEAD\n  "title"', 1), encoding="utf-8")
    for f in ("a/b-c.json", "a-b/c.json"):
        (g / f).write_text((g / f).read_text(encoding="utf-8").replace('"Store"', f'"Store of {f}"'), encoding="utf-8")
    r = cli("diff", "--base", "HEAD", "--out", t / "pr", cwd=g)
    summary = (t / "pr" / "summary.md").read_text(encoding="utf-8") if (t / "pr" / "summary.md").is_file() else ""
    ok("diff-base-run#1 · a model that no longer parses is a change, said in the summary and the JSON",
       r.returncode == 0 and any(x.get("file") == "docs/map.json" and "not valid JSON" in x.get("error", "") for x in said(r) or [])
       and "**`docs/map.json`**: cannot be read: it is not valid JSON" in summary, r.stdout + r.stderr + summary)
    ok("diff-base-run#4 · two models whose paths make one name get a page each", len(list((t / "pr").glob("a-b-c*.html"))) == 2, os.listdir(t / "pr"))
    r = cli("diff", "--base", "HEAD", "--out", t / "pr2", stand_in="no-chrome", cwd=g)
    summary = (t / "pr2" / "summary.md").read_text(encoding="utf-8") if (t / "pr2" / "summary.md").is_file() else ""
    ok("diff-base-run#2,#3 · without Chrome the pictures are left out and said, stdout is the JSON, and the summary is written",
       r.returncode == 0 and said(r) is not None and "_No picture of plain: needs Google Chrome or Chromium" in summary
       and all(x.get("stillsFailed") for x in said(r) or [] if "error" not in x), r.stdout + r.stderr + summary)

    # ---------- the icon cache ----------
    cache = t / "icons"
    cache.mkdir()
    (cache / "postgresql.svg").write_bytes(b"<svg xmlns='http://www.w3.org/2000/svg'><path d='M5 32") # a logo cut short
    r = cli("render", ROOT / "examples" / "bookshop.json", "--out", t / "ic.html", "--no-check", env={"UMLIMATOR_ICON_CACHE": str(cache), "UMLIMATOR_OFFLINE": "1"})
    data = json.loads(u.DATA.search((t / "ic.html").read_text(encoding="utf-8")).group(1)) if r.returncode == 0 else {}
    ok("icon-cache#1 · a cached logo that does not match its sha256 is not used: fetched again (offline here, so the card keeps its sigil)",
       "postgresql" not in data.get("icons", {"postgresql": 1}) and "postgresql.svg: the copy in" in r.stderr, r.stderr)
    src, dst = t / "icons-src", t / "icons-dst"
    src.mkdir()
    (src / "manifest.json").write_text(json.dumps({"x": {"file": "x.svg", "source": "x/brand", "url": "https://example.invalid/x.svg"}}))
    (src / "x.svg").write_text("<svg/>")
    u.ICONS, u.CACHE, move = src, dst, shutil.move
    shutil.move = lambda *a: (_ for _ in ()).throw(OSError("interrupted"))
    try:
        u.cmd_pin_icons(None)
    except OSError:
        pass
    finally:
        shutil.move = move
    ok("icon-cache#3 · pin-icons records the hashes before it moves a file", json.loads((src / "manifest.json").read_text())["x"].get("sha256"))

    # ---------- the MCP server ----------
    (t / "mcp").mkdir()
    (t / "mcp" / "m.json").write_text(json.dumps(bike), encoding="utf-8")
    (t / "mcp" / "before.json").write_text(json.dumps(bike), encoding="utf-8")

    def server(port):
        p = subprocess.Popen([sys.executable, str(ROOT / "umlimator.py"), "mcp", str(t / "mcp" / "m.json"), "--port", str(port)], cwd=ROOT,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        def ask(msg):
            p.stdin.write(json.dumps(msg) + "\n"); p.stdin.flush()
            return json.loads(p.stdout.readline())
        return p, ask
    p, ask = server(0)
    hello = ask({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}})
    said_ = hello["result"]["instructions"]
    ok("mcp-session#4 · the instructions name the model's whole path and the folder the server runs in",
       str((t / "mcp" / "m.json").resolve()) in said_ and str(ROOT) in said_, said_)
    both = ask([{"jsonrpc": "2.0", "id": 2, "method": "ping"}, {"jsonrpc": "2.0", "method": "notifications/initialized"},
                {"jsonrpc": "2.0", "id": 3, "method": "tools/list"}])
    ok("mcp-session#3 · a batch gets a batch of replies, one per request", isinstance(both, list) and [x.get("id") for x in both] == [2, 3], both)
    r = ask({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "diff", "arguments": {"other_model_path": "before.json"}}})["result"]
    ok("mcp-session#4 · a relative path is the model's folder's", r.get("isError") is False, r)
    r = ask({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "diff", "arguments": {"other_model_path": "nope.json"}}})["result"]
    ok("mcp-session#4 · and a path it cannot read is said with where it looked", r.get("isError") and str((t / "mcp" / "nope.json").resolve()) in r["content"][0]["text"], r)
    p.stdin.close(); p.wait(timeout=30)
    held = socket.socket()
    held.bind(("127.0.0.1", 0))
    held.listen()
    taken = held.getsockname()[1]
    urls = []
    for _ in range(2):
        p, ask = server(taken)
        urls.append(re.search(r"http://127\.0\.0\.1:\d+", ask({"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": {}})["result"]["instructions"]).group(0))
        p.stdin.close(); p.wait(timeout=30)
    held.close()
    ok("mcp-session#2 · with its port taken, a model's server takes the same other port on each run", urls[0] == urls[1] and not urls[0].endswith(f":{taken}"), urls)
sys.exit(1 if failed else 0)
