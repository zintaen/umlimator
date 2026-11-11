#!/usr/bin/env python3
"""The umlimator CLI for the map-repo skill.

On first use this clones one pinned release of https://github.com/zintaen/umlimator (a shallow clone of its tag, about
2.5 MB: the CLI, the module, the page template, the icon manifest and line icons) into ~/.cache/umlimator/cli/<tag>,
checks that the tag still names the commit it was pinned to (and, on every run, that the cache holds that commit), and
from then on runs `python3 umlimator.py ...` from there. The CLI itself downloads a brand logo only when a model's card
names one (into ~/.cache/umlimator/icons).

  python3 cli.py render map.json --out map.html     the page, then its layout check
  python3 cli.py check map.html                     the layout check again
  python3 cli.py stills map.html --out stills/      every view as SVG and PNG

Environment: UMLIMATOR_REF picks another release tag (UMLIMATOR_SHA then pins its commit, if you want that check);
UMLIMATOR_CLI_CACHE moves the cache. Needs git, Python 3.9+, and Google Chrome or Chromium for render, check and stills.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REF, SHA = "v0.17.0", "555bfdc1f3b8f1823158ea18340685fa8d98392e"   # the release this skill is written for
ref = os.environ.get("UMLIMATOR_REF", REF)
sha = os.environ.get("UMLIMATOR_SHA", SHA if ref == REF else "")
cache = Path(os.environ.get("UMLIMATOR_CLI_CACHE") or Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "umlimator" / "cli")
home = cache / ref
head = lambda d: subprocess.run(["git", "-C", str(d), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

if not (home / "umlimator.py").is_file():
    print(f"umlimator {ref}: fetching it once from github.com/zintaen/umlimator into {home}", file=sys.stderr)
    cache.mkdir(parents=True, exist_ok=True)
    # this run's own folder, renamed into place whole: two first uses at once never clone into one folder
    # ponytail: a run killed mid-clone (SIGKILL, SIGTERM) leaves its .<ref>.* folder; sweep old ones if they ever pile up
    part = tempfile.mkdtemp(dir=cache, prefix=f".{ref}.")
    try:
        if subprocess.run(["git", "-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", ref,
                           "https://github.com/zintaen/umlimator.git", part]).returncode:
            sys.exit(f"umlimator {ref} could not be fetched (git says why, above): its first use needs the network, once; "
                     f"or set UMLIMATOR_CLI_CACHE to a folder that holds {ref}/umlimator.py")
        if sha and (got := head(part)) != sha:
            sys.exit(f"umlimator {ref} is commit {got}, not the pinned {sha}: not running it")
        try:
            os.rename(part, home)
        except OSError:  # another first use got there first
            if not (home / "umlimator.py").is_file():
                sys.exit(f"{home} holds something other than umlimator {ref}: delete it to fetch it again")
    finally:
        shutil.rmtree(part, ignore_errors=True)  # this run's clone, unless it is the cache's now
elif sha and (got := head(home)) != sha:
    sys.exit(f"umlimator {ref} in {home} is commit {got or '(no git checkout)'}, not the pinned {sha}: delete {home} to fetch it again")

sys.exit(subprocess.run([sys.executable, str(home / "umlimator.py"), *sys.argv[1:]]).returncode)
