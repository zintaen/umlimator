#!/usr/bin/env python3
"""The umlimator CLI for the map-repo skill.

On first use this clones one pinned release of https://github.com/zintaen/umlimator (a shallow clone of its tag, about
2.5 MB: the CLI, the module, the page template, the icon manifest and line icons) into ~/.cache/umlimator/cli/<tag>,
checks that the tag still names the commit it was pinned to, and from then on runs `python3 umlimator.py ...` from
there. The CLI itself downloads a brand logo only when a model's card names one (into ~/.cache/umlimator/icons).

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
from pathlib import Path

REF, SHA = "v0.12.0", "624c677f8ad2ede5873c2a18b8c7cc0faceab427"   # the release this skill is written for
ref = os.environ.get("UMLIMATOR_REF", REF)
sha = os.environ.get("UMLIMATOR_SHA", SHA if ref == REF else "")
cache = Path(os.environ.get("UMLIMATOR_CLI_CACHE") or Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "umlimator" / "cli")
home = cache / ref

if not (home / "umlimator.py").is_file():
    part = cache / f".{ref}.partial"
    shutil.rmtree(part, ignore_errors=True)
    print(f"umlimator {ref}: fetching it once from github.com/zintaen/umlimator into {home}", file=sys.stderr)
    subprocess.run(["git", "-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", ref,
                    "https://github.com/zintaen/umlimator.git", str(part)], check=True)
    got = subprocess.run(["git", "-C", str(part), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    if sha and got != sha:
        shutil.rmtree(part)
        sys.exit(f"umlimator {ref} is commit {got}, not the pinned {sha}: not running it")
    part.rename(home)

sys.exit(subprocess.run([sys.executable, str(home / "umlimator.py"), *sys.argv[1:]]).returncode)
