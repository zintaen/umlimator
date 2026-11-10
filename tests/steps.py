#!/usr/bin/env python3
"""The shell CI and the diff Action run, and map-repo's CLI, each run as it runs, against stand-ins for GitHub, git and npm:
the Action's comment step (action.yml), the release job's steps (.github/workflows/check.yml) and
plugins/umlimator/skills/map-repo/scripts/cli.py. A step's `run:` block is read from the file by its id and run as GitHub
runs it (bash --noprofile --norc -eo pipefail), with gh, git ls-remote and npm answering from a folder of state.

  python3 tests/steps.py

Standard library only, and nothing is fetched. Needs git 2.31 or later, and Node (the npm step reads package.json with it).
"""
import json, os, shutil, subprocess, sys, tempfile, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
failed = False


def ok(name, cond, info=""):
    global failed
    print(("ok  " if cond else "FAIL"), name, "" if cond else info)
    failed |= not cond


def step(path, sid):
    """The step with this id: its `if:` (or "") and its `run:` block, as YAML hands the block to bash."""
    lines = (ROOT / path).read_text(encoding="utf-8").splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip() in (f"- id: {sid}", f"id: {sid}"))
    start = next(k for k in range(i, -1, -1) if lines[k].lstrip().startswith("- "))  # the step's first line
    dash = len(lines[start]) - len(lines[start].lstrip())
    end = next((k for k in range(start + 1, len(lines)) if lines[k].strip() and len(lines[k]) - len(lines[k].lstrip()) <= dash), len(lines))
    head = lines[start:end]
    cond = next((l.split("if:", 1)[1].split(" #")[0].strip() for l in head if l.strip().removeprefix("- ").startswith("if:")), "")
    j = next(k for k, l in enumerate(head) if l.strip() == "run: |")
    ind = len(head[j + 1]) - len(head[j + 1].lstrip())
    return cond, "\n".join(l[ind:] for l in head[j + 1:]) + "\n"


# gh, git (ls-remote; anything else goes to the real git) and npm, answering from $STATE: tags/<name> (a commit, or "tag-object
# commit" for an annotated tag), releases/<tag>.json, npm/<version> (the commit it was published from), comments/<id>.json,
# head (the pull request's head commit). GH_FAIL names what fails (list, head, write); NPM_FAIL fails npm publish.
STUB = r'''#!/usr/bin/env python3
import json, os, sys, time
from pathlib import Path
S, me, a = Path(os.environ["STATE"]), Path(sys.argv[0]).name, sys.argv[1:]
def fail(msg):
    print(msg, file=sys.stderr); sys.exit(1)
def opt(name):
    return a[a.index(name) + 1] if name in a else None
time.sleep(float(os.environ.get("STUB_DELAY") or 0))  # an API's latency
F = os.environ.get("GH_FAIL", "")
if me == "git":
    if a[:1] != ["ls-remote"]:
        os.execv(os.environ["REAL_GIT"], ["git", *a])
    names = [n for n in dict.fromkeys(x.removeprefix("refs/tags/").removesuffix("^{}") for x in a if x.startswith("refs/tags/")) if (S / "tags" / n).is_file()]
    for name in names:
        at = (S / "tags" / name).read_text().split()
        print(f"{at[0]}\trefs/tags/{name}" + (f"\n{at[1]}\trefs/tags/{name}^{{}}" if len(at) > 1 else ""))
    sys.exit(2 if "--exit-code" in a and not names else 0)
elif me == "npm":
    if a[0] == "view":
        v = a[1].split("@", 1)[1]
        print(v) if (S / "npm" / v).is_file() else fail("npm ERR! code E404")
    elif os.environ.get("NPM_FAIL"):
        fail("npm ERR! code E503 (the registry is down)")
    else:
        v = json.loads(Path("package.json").read_text())["version"]
        (S / "npm" / v).write_text(os.environ["GITHUB_SHA"])
elif a[:2] == ["release", "view"]:
    f = S / "releases" / f"{a[2]}.json"
    if not f.is_file():
        fail("release not found")
    print(str(json.loads(f.read_text())["draft"]).lower() if "--json" in a else f.read_text())
elif a[:2] == ["release", "create"]:
    f, tag = S / "releases" / f"{a[2]}.json", S / "tags" / a[2]
    if f.is_file():
        fail("a release with the same tag name already exists")
    if not tag.is_file():
        if "--verify-tag" in a or not opt("--target"):
            fail(f"tag {a[2]} doesn't exist")
        tag.write_text(opt("--target"))
    f.write_text(json.dumps({"draft": "--draft" in a, "latest": "--latest" in a, "title": opt("--title")}))
elif a[:2] == ["release", "edit"]:
    f = S / "releases" / f"{a[2]}.json"
    r = json.loads(f.read_text())
    f.write_text(json.dumps({**r, "draft": "--draft=true" in a if any(x.startswith("--draft") for x in a) else r["draft"], "latest": r["latest"] or "--latest" in a}))
elif a[0] == "api" and a[1].endswith("/git/refs"):
    name = a[a.index("-f") + 1].split("=", 1)[1].removeprefix("refs/tags/")
    sha = next(x.split("=", 1)[1] for x in a if x.startswith("sha="))
    if (S / "tags" / name).is_file():
        fail("gh: Reference already exists (HTTP 422)")
    (S / "tags" / name).write_text(sha)
elif a[0] == "api" and "/pulls/" in a[1]:
    print((S / "head").read_text()) if F != "head" else fail("gh: Bad Gateway (HTTP 502)")
elif a[0] == "api" and "--paginate" in a:
    if F == "list":
        fail("gh: API rate limit exceeded (HTTP 403)")
    for f in sorted((S / "comments").glob("*.json"), key=lambda f: int(f.stem)):
        c = json.loads(f.read_text())
        if c["user"] == "Bot" and c["body"].startswith("<!-- umlimator-diff -->"):
            print(f.stem)
elif a[0] == "api":
    if F == "write":
        fail("gh: Resource not accessible by integration (HTTP 403)")
    body = Path(opt("-F").removeprefix("body=@")).read_text()
    if a[1:3] == ["-X", "PATCH"]:
        f = S / "comments" / f"{a[3].rsplit('/', 1)[1]}.json"
        f.write_text(json.dumps({**json.loads(f.read_text()), "body": body}))
    else:
        n = max([int(f.stem) for f in (S / "comments").glob("*.json")] + [0]) + 1
        while True:  # an id of its own, even when two runs post at once
            try:
                with open(S / "comments" / f"{n}.json", "x") as f:
                    f.write(json.dumps({"user": "Bot", "body": body}))
                break
            except FileExistsError:
                n += 1
'''

tmp = Path(tempfile.mkdtemp(prefix="umlimator-steps-"))
real_git = shutil.which("git")
bin_ = tmp / "bin"
bin_.mkdir()
(bin_ / "stub").write_text(STUB)
(bin_ / "stub").chmod(0o755)
for name in ("gh", "git", "npm"):
    (bin_ / name).symlink_to(bin_ / "stub")


def fresh():
    state = Path(tempfile.mkdtemp(dir=tmp, prefix="state-"))
    for d in ("tags", "releases", "npm", "comments"):
        (state / d).mkdir()
    return state


def bash(script, env, cwd):
    f = Path(tempfile.mkstemp(dir=tmp, suffix=".sh")[1])
    f.write_text(script)
    r = subprocess.run(["bash", "--noprofile", "--norc", "-eo", "pipefail", str(f)], cwd=cwd, capture_output=True, text=True,
                       env={"PATH": f"{bin_}:{os.environ['PATH']}", "HOME": str(tmp), "REAL_GIT": real_git, **env}, timeout=120)
    return r.returncode, r.stdout + r.stderr


# ---------- the release job (check.yml): a version is tagged at the commit that releases it, its Release is a draft until
# npm has it, and npm only ever gets the tagged commit ----------
_, TAG = step(".github/workflows/check.yml", "tag")
NPM_IF, NPM = step(".github/workflows/check.yml", "npm")
A, B, M = "a" * 40, "b" * 40, "c" * 40


def checkout(notes=True):
    co = Path(tempfile.mkdtemp(dir=tmp, prefix="co-"))
    (co / "docs").mkdir()
    (co / "package.json").write_text(json.dumps({"name": "umlimator", "version": "0.14.0"}))
    (co / "docs" / "module-api.md").write_text("# Module API\n\n" + ("## 0.14.0: state\n\nNotes.\n" if notes else "## 0.13.0: before\n"))
    return co


def release(state, co, sha, npm_fails=False):
    """One push to main: the tag step, then the npm step when its `if:` lets it run. (tag step's exit, npm step's exit or None, log)"""
    out = Path(tempfile.mkstemp(dir=tmp)[1])
    env = {"STATE": str(state), "GITHUB_SHA": sha, "GITHUB_REPOSITORY": "o/r", "GITHUB_OUTPUT": str(out), "GH_TOKEN": "t",
           "NPM_FAIL": "1" if npm_fails else ""}
    code, log = bash(TAG, env, co)
    npm = None
    if code == 0 and ("release=yes" in out.read_text() or not NPM_IF):  # as the job runs it: on its `if:`
        npm, more = bash(NPM, env, co)
        log += more
    return code, npm, log


def read(state, path):
    f = state / path
    return (json.loads(f.read_text()) if f.suffix == ".json" else f.read_text().split()[-1]) if f.is_file() else None


s, co = fresh(), checkout()
r = release(s, co, A)
ok("release · a new version is tagged at its commit, published to npm from it, and its Release published once npm has it",
   r[:2] == (0, 0) and read(s, "tags/v0.14.0") == A and read(s, "npm/0.14.0") == A and read(s, "releases/v0.14.0.json") == {"draft": False, "latest": True, "title": "v0.14.0: state"}, r)

s = fresh()
r = release(s, co, A, npm_fails=True)
ok("release · npm fails: the Release stays a draft, so no published Release names a package npm hasn't got (release-pipeline#2)",
   r[1] == 1 and read(s, "npm/0.14.0") is None and (read(s, "releases/v0.14.0.json") or {}).get("draft") is True, r)
r = release(s, co, A)
ok("release · re-running that commit's job finishes it: npm from the tagged commit, then the Release published",
   r[:2] == (0, 0) and read(s, "npm/0.14.0") == A and read(s, "releases/v0.14.0.json")["draft"] is False, r)

s = fresh()
release(s, co, A, npm_fails=True)
r = release(s, co, B)
ok("release · npm fails, then a later push: it publishes nothing under the earlier commit's tag, and fails saying which run to re-run (release-pipeline#1)",
   r[0] == 1 and read(s, "npm/0.14.0") is None and A in r[2] and "::error::" in r[2] and read(s, "tags/v0.14.0") == A, r)

s = fresh()
release(s, co, A)
r = release(s, co, B)
ok("release · a later push after a full release releases nothing, and passes", r[0] == 0 and r[1] in (None, 0) and read(s, "npm/0.14.0") == A
   and "released already" in r[2], r)

s = fresh()
r = release(s, checkout(notes=False), A)
ok("release · no notes for the version: it fails before anything is tagged", r[0] == 1 and not any((s / "tags").iterdir())
   and not any((s / "releases").iterdir()), r)

s = fresh()
(s / "tags" / "v0.14.0").write_text(f"{'d' * 40} {M}")  # tagged by hand (an annotated tag), never released
r = release(s, co, B)
ok("release · a tag made by hand at another commit is not taken as released: the job fails and names the tag's commit (release-pipeline#3)",
   r[0] == 1 and M in r[2] and "d" * 40 not in r[2] and read(s, "npm/0.14.0") is None, r)

# ---------- the diff Action's comment step (action.yml) ----------
cond, COMMENT = step("action.yml", "comment")
ok("action · the comment step runs after a failed diff too (only a cancelled run skips it)", cond == "${{ !cancelled() }}", cond)
MARK = "<!-- umlimator-diff -->"


def comment(state, head, changed="1", diff="success", fork="false", summary="### Map changes\n\n- adds Payments queue\n", fail="", delay=0):
    d = Path(tempfile.mkdtemp(dir=tmp))
    if summary is not None:
        (d / "summary.md").write_text(f"{MARK}\n{summary}")
    env = {"STATE": str(state), "GH_TOKEN": "t", "COMMENT": "true", "CHANGED": changed, "DIFF": diff, "SUMMARY": str(d / "summary.md"),
           "PICTURES": "", "PR": "7", "HEAD": head, "FORK": fork, "RUN": "https://github.com/o/r/actions/runs/9", "GITHUB_REPOSITORY": "o/r",
           "GITHUB_SHA": "f" * 40, "GITHUB_STEP_SUMMARY": str(d / "job.md"), "GH_FAIL": fail, "STUB_DELAY": str(delay)}
    return bash(COMMENT, env, d)


def bodies(state):
    return [json.loads(f.read_text())["body"] for f in sorted((state / "comments").glob("*.json"), key=lambda f: int(f.stem))]


s = fresh()
(s / "head").write_text(A)
r = comment(s, A)
b = bodies(s)
ok("action · the comment starts with its marker and names its commit, in words and for a script (action-comment#4)",
   r[0] == 0 and len(b) == 1 and b[0].startswith(MARK + "\n") and "aaaaaaa" in b[0] and f"<!-- umlimator-diff-sha: {A} -->" in b[0], (r, b))

s = fresh()
(s / "head").write_text(B)  # two quick pushes: both runs start once B is the pull request's head
runs = [threading.Thread(target=comment, args=(s, h), kwargs={"delay": 0.5}) for h in (A, B)]
[t.start() for t in runs]
[t.join() for t in runs]
b = bodies(s)
ok("action · two runs at once: only the run for the pull request's head comments, so there is one comment, about that head (action-comment#1)",
   len(b) == 1 and f"umlimator-diff-sha: {B}" in b[0], b)

s = fresh()
(s / "head").write_text(B)
for i, body in enumerate([f"{MARK}\nold", f"{MARK}\nolder"], 1):  # two the bot posted at once, before this fix
    (s / "comments" / f"{i}.json").write_text(json.dumps({"user": "Bot", "body": body}))
(s / "comments" / "3.json").write_text(json.dumps({"user": "User", "body": f"{MARK}\na person's"}))
comment(s, B)
b = bodies(s)
ok("action · every comment the bot left is updated, so a second one is never left stale; a person's is never touched",
   len(b) == 3 and all(f"umlimator-diff-sha: {B}" in x for x in b[:2]) and b[2] == f"{MARK}\na person's", b)

s = fresh()
(s / "head").write_text(B)
r = comment(s, A)
ok("action · a run for an older commit writes nothing: the pull request's head is newer", r[0] == 0 and bodies(s) == [] and B in r[1], r)

s = fresh()
(s / "head").write_text(A)
(s / "comments" / "1.json").write_text(json.dumps({"user": "Bot", "body": f"{MARK}\nold"}))
r = comment(s, A, fail="list")
ok("action · the comments can't be read: no second comment is posted, and the run says so (action-comment#2)",
   r[0] == 0 and len(bodies(s)) == 1 and "::warning::" in r[1], r)
r = comment(s, A, fail="head")
ok("action · the pull request's head can't be read: nothing is written, and the run says so",
   r[0] == 0 and bodies(s) == [f"{MARK}\nold"] and "::warning::" in r[1], r)

s = fresh()
(s / "head").write_text(A)
r = comment(s, A, fail="write")
ok("action · a write refused on the repository's own pull request names the cause and the permission it needs, not a fork (action-comment#3)",
   r[0] == 0 and "::warning::" in r[1] and "HTTP 403" in r[1] and "pull-requests: write" in r[1] and "fork" not in r[1], r)
r = comment(s, A, fail="write", fork="true")
ok("action · on a fork's pull request it is the read-only token, and a notice says so", r[0] == 0 and "::notice::" in r[1] and "fork" in r[1], r)

s = fresh()
(s / "head").write_text(A)
(s / "comments" / "1.json").write_text(json.dumps({"user": "Bot", "body": f"{MARK}\nfor the last push"}))
r = comment(s, A, changed="", diff="failure", summary=None)
b = bodies(s)
ok("action · the diff fails: the comment says so for this commit, with the run's link, instead of showing the last push's map (action-comment#4)",
   r[0] == 0 and len(b) == 1 and b[0].startswith(MARK) and "aaaaaaa" in b[0] and "failed" in b[0] and "actions/runs/9" in b[0], (r, b))

s = fresh()
(s / "head").write_text(A)
r = comment(s, A, changed="0")
ok("action · no map changed and nothing said before: nothing is posted", r[0] == 0 and bodies(s) == [], r)

# ---------- map-repo's cli.py: its first use fetches one release into a cache ----------
src = tmp / "src"
src.mkdir()
(src / "umlimator.py").write_text("import sys\nprint('cli ran', *sys.argv[1:])\n")
git = lambda *a: subprocess.run([real_git, "-C", str(src), "-c", "user.name=t", "-c", "user.email=t@example.invalid", *a],
                                capture_output=True, text=True, check=True).stdout.strip()
git("init", "-q"); git("add", "."); git("commit", "-q", "-m", "a release"); git("tag", "vtest")
pinned = git("rev-parse", "HEAD")
slow = tmp / "slowgit"
slow.mkdir()
(slow / "git").write_text(f'#!/bin/sh\n# a clone at a network\'s pace\nfor a in "$@"; do [ "$a" = clone ] && sleep 1 && break; done\nexec "{real_git}" "$@"\n')
(slow / "git").chmod(0o755)
CLI = ROOT / "plugins" / "umlimator" / "skills" / "map-repo" / "scripts" / "cli.py"


def cli(cache, *args, source=src, sha=pinned):
    env = {**os.environ, "PATH": f"{slow}:{os.environ['PATH']}", "UMLIMATOR_CLI_CACHE": str(cache), "UMLIMATOR_REF": "vtest",
           "UMLIMATOR_SHA": sha, "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": f"url.file://{source}.insteadOf",
           "GIT_CONFIG_VALUE_0": "https://github.com/zintaen/umlimator.git"}
    return subprocess.Popen([sys.executable, str(CLI), *args], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


cache = tmp / "cache"
first = cli(cache, "render")
threading.Event().wait(0.3)
second = cli(cache, "check")
ends = [(p.wait(timeout=60), *p.communicate()) for p in (first, second)]
ok("cli.py · two first uses at once both fetch, and both run the CLI (skill-cli-cache#1)",
   [(c, o) for c, o, _ in ends] == [(0, "cli ran render\n"), (0, "cli ran check\n")] and sorted(p.name for p in cache.iterdir()) == ["vtest"],
   [ends, sorted(p.name for p in cache.iterdir())])

p = cli(tmp / "offline", "render", source=tmp / "nowhere")
code, out, err = p.wait(timeout=60), *p.communicate()
ok("cli.py · no network on first use: a plain message that says what it needs, no traceback, and no folder left (skill-cli-cache#2)",
   code == 1 and "Traceback" not in err and "network" in err and "UMLIMATOR_CLI_CACHE" in err and not [*(tmp / "offline").glob("*")], err)

p = cli(cache, "render", sha="0" * 40)
code, out, err = p.wait(timeout=60), *p.communicate()
ok("cli.py · a cached release that isn't the pinned commit does not run, and the message says how to fetch it again (skill-cli-cache#3)",
   code == 1 and out == "" and "delete" in err and str(cache / "vtest") in err, err)

shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if failed else 0)
