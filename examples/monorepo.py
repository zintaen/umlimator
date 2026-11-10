#!/usr/bin/env python3
"""Writes monorepo.json, a map of a made-up monorepo's packages, from its dependency list, as a script would for a real one.

  python3 -I examples/monorepo.py          # writes examples/monorepo.json

Each package is a card, each import a line (heavier with more imports), and each folder a box (nested as the folders
are), plus the same cards with no boxes. Feed it your own list: one "from -> to: count" per line, in DEPS below, or the
output of a dependency tool turned into that shape. The model is bench/models/r15.json with another title (#111).
"""
import json
from pathlib import Path

DEPS = """
apps/web -> packages/ui/kit: 140
apps/web -> packages/shared/api-client: 60
apps/admin -> packages/ui/kit: 90
apps/admin -> packages/ui/charts: 25
apps/admin -> packages/shared/api-client: 40
apps/mobile -> packages/shared/api-client: 30
services/api -> packages/server/auth: 30
services/api -> packages/server/db: 80
services/api -> packages/shared/schemas: 55
services/worker -> packages/server/db: 25
services/worker -> packages/server/mailer: 9
packages/ui/charts -> packages/ui/kit: 10
packages/ui/kit -> packages/ui/tokens: 45
packages/shared/api-client -> packages/shared/schemas: 22
packages/server/auth -> packages/server/db: 6
packages/server/db -> packages/shared/schemas: 14
"""
# packages no other package imports, and that import none listed: still drawn
PACKAGES = ["apps/web", "apps/admin", "apps/mobile", "services/api", "services/worker", "packages/ui/charts", "packages/ui/kit",
            "packages/ui/tokens", "packages/shared/api-client", "packages/shared/schemas", "packages/server/auth",
            "packages/server/db", "packages/server/mailer", "tools/release", "tools/codemods"]
# a card's kind and icon by the folder it is in, the most specific first
LOOKS = [("apps/", "frontend", "window"), ("services/", "backend", "server"), ("packages/ui/", "frontend", "package"),
         ("packages/server/", "backend", "package"), ("tools/", "file", "wrench"), ("", "file", "package")]


def model(deps, packages, title):
    lines = [(a.strip(), *b.split(":")) for a, b in (l.split("->") for l in deps.strip().splitlines())]
    ids = list(dict.fromkeys([*packages, *(x for a, b, _ in lines for x in (a, b.strip()))]))
    look = lambda p: next(x for x in LOOKS if p.startswith(x[0]))
    nodes = [{"id": p, "label": p.rsplit("/", 1)[-1], "kind": look(p)[1], "icon": look(p)[2], "sublabel": p, "what": f"The {p} package."} for p in ids]
    edges = [{"from": a, "to": b.strip(), "weight": 3 if int(n) >= 100 else 2 if int(n) >= 10 else 1, "what": f"{int(n)} imports"} for a, b, n in lines]
    folders = list(dict.fromkeys(p[:i + 1] for p in ids for i in range(len(p)) if p[i] == "/"))  # every folder that holds a package
    boxes = [{"id": f, "label": f, "nodeIds": [p for p in ids if p.rsplit("/", 1)[0] + "/" == f],
              **({"parent": f.rstrip("/").rsplit("/", 1)[0] + "/"} if f.count("/") > 1 else {})} for f in folders]
    return {"title": title, "root": "boxed", "nodes": nodes, "edges": edges, "views": [
        {"id": "boxed", "parent": None, "title": "Packages, a box per folder", "nodeIds": ids, "containers": boxes},
        {"id": "plain", "parent": "boxed", "title": "Packages, no boxes", "nodeIds": ids}]}


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "monorepo.json"
    out.write_text(json.dumps(model(DEPS, PACKAGES, "A monorepo's packages, mapped from its dependency list"), indent=2) + "\n", encoding="utf-8")
    print("wrote", out)
