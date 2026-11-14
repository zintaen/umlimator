#!/usr/bin/env python3
"""umlimator.py pack and a render's pack entries (milestone 4a, notes/milestone-4a.md §4), on a synthetic pack this test
builds: two zips standing in for Google's (a coloured square, a white circle), one for Azure's (with a terms PDF, an id
filed twice and a member named outside its folder), served from 127.0.0.1 with every request logged. Nothing here
contacts a vendor or holds a vendor's icon.

  python3 tests/packs.py
"""
import atexit, functools, hashlib, http.server, io, json, os, shutil, subprocess, sys, tempfile, threading, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARK = "umlimator-synthetic-pack"  # in every synthetic file, so a test of what is published can find one (§2.5)
failed = False


def ok(name, cond, info=""):
    global failed
    print(("ok  " if cond else "FAIL"), "pack", name, "" if cond else info)
    failed |= not cond


def svg(paint):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><!-- {MARK} --><rect width="8" height="8" fill="{paint}"/></svg>'.encode()


def zipped(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for n, data in files.items():
            z.writestr(n, data)
    return b.getvalue()


sha = lambda b: hashlib.sha256(b).hexdigest()
REAL = json.loads((ROOT / "icons" / "packs.json").read_text())

t = Path(tempfile.mkdtemp(prefix="umlimator-packs-"))
atexit.register(shutil.rmtree, t, True)
served, log = t / "served", []
served.mkdir()
files = {
    "core.zip": zipped({"Unique Icons/Test Run/SVG/test-run.svg": svg("#4285f4"), "Unique Icons/Pub Sub/SVG/pub.svg": svg("#34a853")}),
    "category.zip": zipped({"Category Icons/White Thing/SVG/white.svg": svg("#ffffff")}),
    "azure.zip": zipped({"Azure_Public_Service_Icons/Icons/devops/10261-icon-service-Azure-DevOps.svg": svg("#0078d4"),
                         "Azure_Public_Service_Icons/Icons/other/10262-icon-service-Azure-DevOps.svg": svg("#005ba1"),
                         "Azure_Public_Service_Icons/Icons/web/10001-icon-service-Test-Service.svg": svg("#0078d4"),
                         "Azure_Public_Service_Icons/Icons/web2/10001-icon-service-Test-Service.svg": svg("#0078d4"),
                         "../Icons/x/1-icon-service-Escape.svg": svg("#0078d4"),
                         "Azure_Public_Service_Icons/Microsoft_Terms_of_Use.pdf": b"%PDF-1.4 " + MARK.encode()}),
}
for n, b in files.items():
    (served / n).write_bytes(b)


class Logged(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        log.append(self.path)


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Logged, directory=str(served)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_address[1]}"
GT, AT = f"Synthetic Google terms ({MARK}).", f"Synthetic Microsoft terms ({MARK})."


def rows(**change):
    r = {"gcp": {"vendor": "Google Cloud", "label": "test-1",
                 "zips": [{"url": f"{base}/core.zip", "bytes": len(files["core.zip"]), "sha256": sha(files["core.zip"])},
                          {"url": f"{base}/category.zip", "bytes": len(files["category.zip"]), "sha256": sha(files["category.zip"])}],
                 "icons": REAL["gcp"]["icons"], "legal": REAL["gcp"]["legal"],
                 "terms": {"url": "https://example.invalid/gcp", "read": "2026-11-14", "text": GT, "sha256": sha(GT.encode())},
                 "names": {"Pub-Sub": "Pub/Sub"}, "aliases": {"Old-Run": "Test-Run"}},
         "azure": {"vendor": "Microsoft Azure", "label": "V-test",
                   "zips": [{"url": f"{base}/azure.zip", "bytes": len(files["azure.zip"]), "sha256": sha(files["azure.zip"])}],
                   "icons": REAL["azure"]["icons"],
                   "terms": {"url": "https://example.invalid/azure", "read": "2026-11-14", "text": AT, "sha256": sha(AT.encode()),
                             "member": "Microsoft_Terms_of_Use.pdf", "memberSha256": sha(b"%PDF-1.4 " + MARK.encode())},
                   "names": {}, "aliases": {}}}
    for path, v in change.items():  # "gcp__zips__1__sha256": "0" * 64
        *keys, last = [int(k) if k.isdigit() else k for k in path.split("__")]
        functools.reduce(lambda o, k: o[k], keys, r)[last] = v
    return r


def setup(name, **change):
    """A packs file and an empty cache of their own."""
    d = t / name
    d.mkdir()
    (d / "packs.json").write_text(json.dumps(rows(**change)))
    return d


def env(d, **more):
    e = {k: v for k, v in os.environ.items() if not k.startswith("UMLIMATOR_")}
    return {**e, "UMLIMATOR_TEST": "1", "UMLIMATOR_PACKS": str(d / "packs.json"), "UMLIMATOR_ICON_CACHE": str(d / "cache"), **more}


def cli(d, *args, tty=None, **more):
    """umlimator.py in a child, stdin closed (no terminal) or, with `tty`, a terminal that has `tty` typed into it."""
    log.clear()
    if tty is None:
        return subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *args], capture_output=True, text=True,
                              stdin=subprocess.DEVNULL, env=env(d, **more), timeout=120)
    master, slave = os.openpty()
    os.write(master, tty.encode())
    try:
        return subprocess.run([sys.executable, str(ROOT / "umlimator.py"), *args], capture_output=True, text=True,
                              stdin=slave, env=env(d, **more), timeout=120)
    finally:
        os.close(slave), os.close(master)


def kept(d):
    """Every file under the cache, by its path there."""
    c = d / "cache"
    return sorted(str(p.relative_to(c)) for p in c.rglob("*") if p.is_file()) if c.is_dir() else []


# ---------- the real rows ----------
import re
ok("rows#1 · icons/packs.json offers Google's and Azure's packs and no AWS row (decision 1)", sorted(REAL) == ["azure", "gcp"], sorted(REAL))
ok("rows#2 · each row's terms are pinned by the sha256 of their words, and its zips by https addresses",
   all(sha(r["terms"]["text"].encode()) == r["terms"]["sha256"] and all(z["url"].startswith("https://") for z in r["zips"]) for r in REAL.values()))
ok("rows#3 · a member's path gives the pack's id, spaces as hyphens (§4.1)",
   re.fullmatch(REAL["gcp"]["icons"], "Unique Icons/Cloud Run/SVG/Cloud-Run.svg").group(1) == "Cloud Run"
   and re.fullmatch(REAL["azure"]["icons"], "Azure_Public_Service_Icons/Icons/networking/10073-icon-service-Front-Door-and-CDN-Profiles.svg").group(1)
   == "Front-Door-and-CDN-Profiles" and not re.fullmatch(REAL["azure"]["icons"], "Icons/a/b/1-icon-service-X.svg"))
man = json.loads((ROOT / "icons" / "manifest.json").read_text())
ok("rows#4 · the logo manifest's three rows from Azure's zip read from the Azure pack, and entra is never fetched by a render (decision 7)",
   [(man[k].get("pack"), man[k].get("id"), "url" in man[k]) for k in ("azuredevops", "foundry", "containerapps")]
   == [("azure", "Azure-DevOps", False), ("azure", "AI-Foundry", False), ("azure", "Container-Apps-Environments", False)]
   and man["entra"].get("render") == "cache", [man[k] for k in ("azuredevops", "foundry", "containerapps", "entra")])

# ---------- refusals before any byte ----------
d = setup("refuse")
r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "pack", "list"], capture_output=True, text=True,
                   env={**env(d), "UMLIMATOR_TEST": ""})
ok("test-only#1 · UMLIMATOR_PACKS without UMLIMATOR_TEST is refused", r.returncode and "UMLIMATOR_TEST=1" in r.stderr, r.stderr)
r = subprocess.run([sys.executable, str(ROOT / "umlimator.py"), "pack", "list"], capture_output=True, text=True,
                   env={**env(d), "UMLIMATOR_TEST": "0"})
ok("test-only#2 · UMLIMATOR_TEST other than 1 does not unlock UMLIMATOR_PACKS", r.returncode and "UMLIMATOR_TEST=1" in r.stderr, r.stderr)
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1", UMLIMATOR_OFFLINE="1")
ok("offline#1 · UMLIMATOR_OFFLINE refuses, with no request", r.returncode and "UMLIMATOR_OFFLINE" in r.stderr and not log and not kept(d), (r.stderr, log))
r = cli(d, "pack", "fetch", "aws")
ok("aws#1 · the AWS pack is not offered", r.returncode and "AWS pack is not offered in this release" in r.stderr, r.stderr)
r = cli(d, "pack", "fetch", "gcp")
ok("yes#1 · no terminal and no flag: the terms are shown and nothing is requested",
   r.returncode and GT in r.stdout and "Umlimator is not affiliated" in r.stdout and "--accept-terms gcp@test-1" in r.stderr
   and not log and not kept(d), (r.stdout, r.stderr, log))
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "azure@V-test")
ok("yes#2 · --accept-terms naming another pack refuses, with no request", r.returncode and "gcp@test-1" in r.stderr and not log and not kept(d), (r.stderr, log))
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-0")
ok("yes#3 · --accept-terms naming another pin refuses, with no request", r.returncode and not log and not kept(d), (r.stderr, log))
r = cli(d, "pack", "fetch", "gcp", tty="no\n")
ok("yes#4 · at a terminal, an answer other than yes refuses, with no request", r.returncode and "not accepted" in r.stderr and not log and not kept(d), (r.stderr, log))
d = setup("unpinned", gcp__zips__1__sha256=None)
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1")
ok("pin#1 · a row with no sha256 is not fetched", r.returncode and "not pinned" in r.stderr and not log, (r.stderr, log))
d = setup("terms-changed", gcp__terms__text=GT + " Changed.")
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1")
ok("pin#2 · terms whose words do not match their pinned sha256 are not shown as the vendor's", r.returncode and "terms" in r.stderr and not log, (r.stderr, log))

# ---------- the download checked before anything is kept ----------
d = setup("mismatch", gcp__zips__1__sha256="0" * 64)
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1")
ok("hash#1 · a zip whose sha256 differs keeps nothing, the other zip included, and says why",
   r.returncode and "is not the one this release pinned" in r.stderr and "Google changes these files without a version" in r.stderr
   and log == ["/core.zip", "/category.zip"] and not kept(d), (r.stderr, log, kept(d)))
d = setup("too-big", gcp__zips__0__bytes=len(files["core.zip"]) - 1)
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1")
ok("size#1 · a zip larger than its pinned size stops the download and keeps nothing",
   r.returncode and "larger than the" in r.stderr and log == ["/core.zip"] and not kept(d), (r.stderr, log, kept(d)))
d = setup("short", gcp__zips__0__bytes=len(files["core.zip"]) + 1)
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1")
ok("size#2 · a download shorter than its pinned size is a failed download, not a changed file, and keeps nothing",
   r.returncode and "cannot download" in r.stderr and "cut short" in r.stderr and "not the one" not in r.stderr and not kept(d), (r.stderr, kept(d)))
d = setup("pdf", azure__terms__memberSha256="0" * 64)
r = cli(d, "pack", "fetch", "azure", "--accept-terms", "azure@V-test")
ok("pdf#1 · an Azure zip whose terms PDF differs from its pin keeps nothing", r.returncode and "Microsoft's terms changed" in r.stderr and not kept(d), (r.stderr, kept(d)))

# ---------- fetched ----------
d = setup("fetched")
r = cli(d, "pack", "fetch", "gcp", "--accept-terms", "gcp@test-1")
acc = json.loads((d / "cache/packs/gcp/test-1/accepted.json").read_text()) if r.returncode == 0 else {}
ok("flag#1 · the flag path prints the terms, downloads the pinned zips and records the yes as given by flag",
   r.returncode == 0 and GT in r.stdout and "Umlimator is not affiliated" in r.stdout and log == ["/core.zip", "/category.zip"]
   and kept(d) == ["packs/gcp/test-1/0.zip", "packs/gcp/test-1/1.zip", "packs/gcp/test-1/accepted.json"]
   and acc.get("via") == "flag" and acc.get("terms_sha256") == sha(GT.encode()) and acc.get("label") == "test-1", (r.stdout, r.stderr, kept(d)))
r = cli(d, "pack", "fetch", "azure", tty="yes\n")
acc = json.loads((d / "cache/packs/azure/V-test/accepted.json").read_text()) if r.returncode == 0 else {}
ok("terminal#1 · yes typed at a terminal downloads the pack, keeps Microsoft's PDF beside it and records via terminal",
   r.returncode == 0 and AT in r.stdout and acc.get("via") == "terminal" and (d / "cache/packs/azure/V-test/Microsoft_Terms_of_Use.pdf").is_file()
   and "Microsoft_Terms_of_Use.pdf" in r.stdout, (r.stdout, r.stderr))
ok("dup#1 · each id filed twice is listed once, the first in the zip used, and one whose files differ is named",
   "2 ids are filed more than once, the first in the zip used: Azure-DevOps, Test-Service;" in r.stdout
   and "these differ, an alias row picks one at the next pin: Azure-DevOps\n" in r.stdout, r.stdout)
ok("zip-slip#1 · a member named outside its folder is read in memory, never written", not list(t.rglob("Escape*")) and not (t / "Icons").exists())
r = cli(d, "pack", "fetch", "gcp")
ok("again#1 · a pack fetched and accepted is not asked or downloaded again", r.returncode == 0 and "fetched already" in r.stdout and not log, (r.stdout, log))
r = cli(d, "pack", "list")
ok("list#1 · pack list says each pin, fetched and how accepted, and the not-affiliated line",
   "gcp  Google Cloud  pin test-1  fetched, terms accepted (flag)" in r.stdout and "azure  Microsoft Azure  pin V-test  fetched, terms accepted (terminal)" in r.stdout
   and "not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft" in r.stdout, r.stdout)
(d / "packs.json").write_text(json.dumps(rows(gcp__label="test-2")))
r = cli(d, "pack", "fetch", "gcp")
ok("repin#1 · a new label asks again: the terms shown, nothing requested without a yes", r.returncode and GT in r.stdout and not log, (r.stdout, log))
(d / "packs.json").write_text(json.dumps(rows(gcp__terms__text=GT + " New.", gcp__terms__sha256=sha((GT + " New.").encode()))))
r = cli(d, "pack", "fetch", "gcp")
ok("repin#2 · changed terms under the same label ask again", r.returncode and "New." in r.stdout and not log, (r.stdout, log))
(d / "packs.json").write_text(json.dumps(rows()))
a = d / "cache/packs/gcp/test-1/accepted.json"
a.write_text(json.dumps({**json.loads(a.read_text()), "via": None}))
r = cli(d, "pack", "list")
ok("list#2 · a recorded yes with no via is listed, not a crash", r.returncode == 0 and "gcp  Google Cloud  pin test-1  fetched, terms accepted (how not recorded)" in r.stdout, (r.stdout, r.stderr))

# ---------- what a render reads: the cache only, never a socket ----------
PROBE = r"""
import importlib.util, json, socket, sys
opened = []
def connect(self, addr): opened.append(str(addr)); raise OSError("no socket in this test")
socket.socket.connect = connect
s = importlib.util.spec_from_file_location("u", sys.argv[1]); u = importlib.util.module_from_spec(s); s.loader.exec_module(u)
m = json.loads(sys.argv[2])
u.write(sys.argv[3], json.dumps(m))
p = u.page_model(sys.argv[3], sys.argv[3] + ".html")
icons = json.loads(open(p).read()).get("icons", {}); u.untemp(p)
u.packs().check(m)
print(json.dumps({"icons": icons, "opened": opened}))
"""
model = {"schemaVersion": 2, "iconPacks": {"gcp": "test-0"}, "nodes": [
    {"id": "a", "type": "gcp.Product", "label": "Shop API", "props": {"icon": "Test-Run"}},
    {"id": "b", "type": "gcp.Product", "label": "Old", "props": {"icon": "Old-Run"}},
    {"id": "c", "type": "gcp.Product", "label": "Bus", "props": {"icon": "Pub-Sub"}},
    {"id": "w", "type": "gcp.Product", "label": "White", "props": {"icon": "White-Thing"}},
    {"id": "x", "type": "gcp.Product", "label": "Typo", "props": {"icon": "Test-Rn"}},
    {"id": "z", "type": "azure.Service", "label": "Web", "props": {"icon": "Test-Service"}},
    {"id": "logo", "label": "Pipelines", "icon": "azuredevops"}, {"id": "id", "label": "Sign-in", "icon": "entra"}],
    "edges": [], "views": [{"id": "v", "diagram": "gcp", "nodeIds": ["a", "b", "c", "w", "x"]}]}


def probe(d, m=model, **more):
    r = subprocess.run([sys.executable, "-I", "-c", PROBE, str(ROOT / "umlimator.py"), json.dumps(m), str(d / "m.json")],
                       capture_output=True, text=True, env={**env(d, **more), "UMLIMATOR_OFFLINE": ""}, timeout=120)
    out = json.loads(r.stdout) if r.returncode == 0 else {"icons": {}, "opened": ["(failed)"]}
    return out["icons"], out["opened"], r.stderr


icons, opened, err = probe(d)
g = lambda k: icons.get(k, {})
ok("table#1 · a fetched pack's icons reach the page keyed <pack>/<id>, as data URLs with the full name",
   g("gcp/Test-Run").get("src", "").startswith("data:image/svg+xml;base64,") and g("gcp/Test-Run").get("name") == "Test Run"
   and g("gcp/Test-Run").get("dark") is False and g("azure/Test-Service").get("name") == "Test Service", sorted(icons))
ok("table#2 · an alias reads the pinned id; a names row gives the full name; a white icon is marked dark",
   g("gcp/Old-Run").get("src") == g("gcp/Test-Run").get("src") and g("gcp/Pub-Sub").get("name") == "Pub/Sub" and g("gcp/White-Thing").get("dark") is True, sorted(icons))
ok("table#3 · the Google pack gives its legal line; the Azure pack, with none, no `azure/` entry; an id the pack lacks none",
   icons.get("gcp/") == {"legal": REAL["gcp"]["legal"]} and "azure/" not in icons and "gcp/Test-Rn" not in icons, sorted(icons))
ok("logos#1 · the manifest's Azure rows are read from the fetched Azure pack", icons.get("azuredevops", {}).get("src", "").startswith("data:image/svg+xml"), sorted(icons))
ok("socket#1 · a render with packs fetched opens no socket, entra's missing logo included", not opened and "entra.svg: used from" in err, (opened, err))
ok("check#1 · check names an id the pack lacks with the nearest ids, an id an alias moved, and a label other than the pin",
   "no icon 'Test-Rn' (x); nearest: Test-Run" in err and "'Old-Run' is 'Test-Run' in the pin test-1" in err
   and "pin test-0; this release pins test-1" in err, err)
icons, opened, err = probe(d, UMLIMATOR_NO_PACKS="1")
ok("no-packs#1 · UMLIMATOR_NO_PACKS: no pack entry with a pack cached, and the Azure logos keep their sigil",
   not [k for k in icons if "/" in k] and "azuredevops" not in icons and not opened
   and "turned off by UMLIMATOR_NO_PACKS" in err and "not fetched" not in err, (sorted(icons), opened, err))
e = setup("empty")
icons, opened, err = probe(e)
ok("glyphs#1 · with no pack fetched, the page has no pack entry and one line per pack says how to fetch it",
   not [k for k in icons if "/" in k] and err.count("umlimator.py pack fetch gcp") == 1 and err.count("umlimator.py pack fetch azure") == 1, (sorted(icons), err))
ok("socket#2 · a render with no pack fetched opens no socket: the Azure logos and entra are never downloaded",
   not opened and "azuredevops" not in icons and "entra" not in icons and "entra.svg: used from" in err, (opened, err))
(e / "cache").mkdir(exist_ok=True)
(e / "cache" / "entra.svg").write_bytes(b"<svg/>")  # not entra's pinned file: kept as the sigil, not fetched again
icons, opened, err = probe(e)
ok("socket#3 · a cached entra that does not match its pin is not fetched again by a render", not opened and "entra" not in icons, (opened, err))

hostile = {"nodes": [{"id": "p", "type": "gcp.Product", "props": ["x"]}, {"id": "q", "type": 5, "props": {"icon": "Test-Run"}},
                     {"id": "s", "type": "gcp.Product", "props": "x"}], "iconPacks": ["gcp"], "edges": [], "views": []}
icons, opened, err = probe(d, hostile)
ok("hostile#1 · a node whose props or type is malformed renders and checks with no pack entry, as before 4a.3",
   opened == [] and "Traceback" not in err and not [k for k in icons if "/" in k], (opened, err))
(d / "packs.json").write_text(json.dumps(rows(gcp__terms__text=GT + " New.", gcp__terms__sha256=sha((GT + " New.").encode()))))
icons, opened, err = probe(d)
ok("render#1 · terms changed since the yes: a render draws none of that pack's icons and says how to fetch it",
   not [k for k in icons if k.startswith("gcp/")] and "azure/Test-Service" in icons and "pack fetch gcp" in err, (sorted(icons), err))
(d / "packs.json").write_text(json.dumps(rows()))
z = d / "cache/packs/gcp/test-1/0.zip"
b = bytearray(z.read_bytes()); b[len(b) // 2] ^= 1; z.write_bytes(bytes(b))
icons, opened, err = probe(d)
ok("render#2 · a cached zip changed by one byte is not read: no icon of that pack on the page",
   not [k for k in icons if k.startswith("gcp/")] and "azure/Test-Service" in icons and "pack fetch gcp" in err, (sorted(icons), err))

srv.shutdown()
print("FAILED" if failed else "all pack checks passed")
sys.exit(1 if failed else 0)
