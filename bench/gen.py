#!/usr/bin/env python3
"""Writes the benchmark models in bench/models/ (seeded, so the files never drift; they are committed anyway).

  python3 -I bench/gen.py

b10, b26, b69: 10, 26 and 69 nodes (b10 also as a view with `repair: false`); m50: 50 modules and about 100 edges (the layout target). Each is a layered flow
with forward edges to the next one or two layers, a few back edges, and a label on about half the edges. b26 adds two
containers and a view drawn around a hub card; b69 adds two sub-views and keepPairs with a few two-way pairs.
d24: a dense hub, as a target architecture map draws one, with a layout: an API card feeds 16 modules in a 4-wide grid
beside it, and 5 systems in a box of their own call back into it (issue #40: lines with no route ran through cards).
r19 is not written here: a made-up monorepo's 19 packages and 30 imports, as a map generated from a dependency list draws
them (a box per folder, nested, and the same cards with no boxes), where most lines skip columns (0.11.0). Nor is u21:
a made-up shop whose services open into views of their parts, with the views it unfolds in place listed (0.12.0, #71).
"""
import json, random
from pathlib import Path

KINDS = ["frontend", "backend", "backend", "backend", "database", "queue", "security", "cloud", "external", "ai"]
WORDS = ["Orders", "Billing", "Catalog", "Search", "Auth", "Ledger", "Notify", "Reports", "Gateway", "Inventory",
         "Pricing", "Profile", "Audit", "Export", "Import", "Rules", "Sessions", "Payments", "Shipping", "Tasks"]
VERBS = ["calls", "reads", "writes", "publishes", "subscribes", "validates", "queries", "syncs", "sends events",
         "checks token", "caches", "uploads"]


def graph(seed, n, m, back=0.06):
    r = random.Random(seed)
    layers = max(3, round(n ** 0.5))
    layer = sorted(r.randrange(layers) for _ in range(n))
    layer[0], layer[-1] = 0, layers - 1
    nodes = [{"id": f"n{i:02d}", "label": f"{WORDS[i % len(WORDS)]} {i}", "kind": r.choice(KINDS),
              "sublabel": f"{r.choice(VERBS)} module", "what": f"Module {i}."} for i in range(n)]
    pairs, edges = set(), []
    while len(edges) < m:
        a = r.randrange(n)
        if r.random() < back:  # a back edge
            later = [b for b in range(n) if layer[b] < layer[a]]
        else:
            later = [b for b in range(n) if 1 <= layer[b] - layer[a] <= 2]
        if not later:
            continue
        b = r.choice(later)
        if (a, b) in pairs or (b, a) in pairs:
            continue
        pairs.add((a, b))
        e = {"id": f"e{len(edges):03d}", "from": nodes[a]["id"], "to": nodes[b]["id"]}
        if r.random() < 0.5:
            e["label"] = r.choice(VERBS)
        edges.append(e)
    return nodes, edges


def model(title, nodes, edges, views):
    return {"title": title, "nodes": nodes, "edges": edges, "views": views}


def main():
    out = Path(__file__).resolve().parent / "models"
    out.mkdir(exist_ok=True)
    ids = lambda ns: [x["id"] for x in ns]
    M = {}

    n, e = graph(10, 10, 14)
    M["b10"] = model("bench 10", n, e, [{"id": "overview", "title": "10 nodes", "nodeIds": ids(n)},
                                        {"id": "norepair", "title": "10 nodes, no port repair", "nodeIds": ids(n), "repair": False}])

    n, e = graph(26, 26, 44)
    outs = {}
    for x in e:
        outs.setdefault(x["from"], []).append(x["to"])
    hub = max(outs, key=lambda k: (len(outs[k]), k))
    near = [hub] + [t for t in outs[hub]] + [x["from"] for x in e if x["to"] in outs[hub] and x["from"] != hub][:4]
    near = list(dict.fromkeys(near))
    M["b26"] = model("bench 26", n, e, [
        {"id": "overview", "title": "26 nodes", "nodeIds": ids(n),
         "containers": [{"id": "core", "label": "Core", "nodeIds": ids(n)[4:12]},
                        {"id": "data", "label": "Data", "nodeIds": ids(n)[16:22]}]},
        {"id": hub, "parent": "overview", "title": "Around the hub", "nodeIds": near}])

    n, e = graph(69, 69, 106)
    for a, b in [(3, 9), (20, 27), (40, 48), (55, 61)]:  # two-way pairs, kept as two lines by keepPairs
        e.append({"id": f"e{len(e):03d}", "from": n[a]["id"], "to": n[b]["id"], "label": "calls"})
        e.append({"id": f"e{len(e):03d}", "from": n[b]["id"], "to": n[a]["id"], "label": "replies"})
    M["b69"] = model("bench 69", n, e, [
        {"id": "overview", "title": "69 nodes", "nodeIds": ids(n), "keepPairs": True},
        {"id": "front", "parent": "overview", "title": "Front", "nodeIds": ids(n)[:15]},
        {"id": "back", "parent": "overview", "title": "Back", "nodeIds": ids(n)[50:]}])

    n, e = graph(50, 50, 100)
    M["m50"] = model("bench 50 modules", n, e, [{"id": "overview", "title": "50 modules", "nodeIds": ids(n)}])

    hub = [{"id": "api", "label": "API", "kind": "backend"}, {"id": "shell", "label": "App shell", "kind": "frontend"},
           {"id": "audit", "label": "Audit", "kind": "security"}]
    mods = [{"id": f"m{i:02d}", "label": WORDS[i], "kind": "backend"} for i in range(16)]
    systems = [{"id": f"x{i}", "label": f"System {i}", "kind": "external"} for i in range(5)]
    lay = {"shell": [0, 0], "api": [0, 1], "audit": [0, 2], **{x["id"]: [1 + i % 4, i // 4] for i, x in enumerate(mods)},
           **{x["id"]: [5, i] for i, x in enumerate(systems)}}
    e = [{"id": f"api-{x['id']}", "from": "api", "to": x["id"]} for x in mods] + [{"id": f"{x['id']}-api", "from": x["id"], "to": "api"} for x in systems]
    n = hub + mods + systems
    M["d24"] = model("bench dense hub", n, e, [
        {"id": "boxed", "title": "An API card, its modules, and systems that call back, in boxes", "nodeIds": ids(n), "layout": lay,
         "containers": [{"id": "app", "label": "App", "nodeIds": ids(hub + mods)}, {"id": "systems", "label": "Other systems", "nodeIds": ids(systems)}]},
        {"id": "plain", "title": "An API card and its modules", "nodeIds": ids(hub + mods), "layout": {i: lay[i] for i in ids(hub + mods)}}])

    for k, m in M.items():
        (out / f"{k}.json").write_text(json.dumps(m, indent=1) + "\n")
        print(k, len(m["nodes"]), "nodes", len(m["edges"]), "edges", [v["id"] for v in m["views"]])


if __name__ == "__main__":
    main()
