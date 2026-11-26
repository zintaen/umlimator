#!/usr/bin/env python3
"""Writes the benchmark models in bench/models/ (seeded, so the files never drift; they are committed anyway).

  python3 -I bench/gen.py

b10, b26, b69: 10, 26 and 69 nodes (b10 also as a view with `repair: false`); m50: 50 modules and about 100 edges (the layout target). Each is a layered flow
with forward edges to the next one or two layers, a few back edges, and a label on about half the edges. b26 adds two
containers and a view drawn around a hub card; b69 adds two sub-views and keepPairs with a few two-way pairs.
d24: a dense hub, as a target architecture map draws one, with a layout: an API card feeds 16 modules in a 4-wide grid
beside it, and 5 systems in a box of their own call back into it (issue #40: lines with no route ran through cards).
r19 is not written here: a made-up monorepo's 19 packages and 30 imports, as a map generated from a dependency list draws
them (a box per folder, nested, and the same cards with no boxes), where most lines skip columns (0.11.0). Nor is r15, the
same monorepo with fewer imports (15 packages and 16 imports, near a tree), whose boxes are fed from outside (#86). Nor
is u21: a made-up shop whose services open into views of their parts, with the views it unfolds in place listed (0.12.0,
#71). Nor is f12: twelve views laid out by business flow (arrange: flow, each with a main flow), written by hand for
the layout-flow note's fixed corpus (docs/diagrams/notes/layout-flow.md section 4.3).
a8: the import fixtures' eight views as `umlimator.py import --arrange` writes them, with kindsFromLabels (as the page draws
them), so the score tracks the arranged layout of imported maps (.evolve/decisions.md D13).

  python3 -I bench/gen.py --heldout --week 2026-W48 --out DIR [--seed S]

writes the held-out corpus instead (the note's section 4.3): maps the layout is never tuned on and that are never committed.
The seed is --seed, else the environment's LAYOUT_HELDOUT_SEED (a secret only CI holds), hashed with the ISO week, so each
week gets new maps and no one can read them from the repository. DIR must be outside the repository; nothing about the maps
is printed. Each is one view with `arrange: "flow"`: a layered flow with a main path (marked `flow: "main"`, by steps, or
left to the layout), branches, stores read and written by dependency lines, and loops back, 8 to 60 cards; and long main
flows of 11 to 30 cards for the snake (section 14). A function of the seed and the week only: no clock, no unseeded random.
"""
import argparse, hashlib, json, os, random, sys
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


HELDOUT_PLAIN, HELDOUT_LONG = 12, 4


def heldout_view(r, name, n, main_len):
    """One held-out model: n cards, a main path of main_len cards, branches off it, stores, a loop back, maybe boxes."""
    main = [f"{name}-m{i:02d}" for i in range(main_len)]
    nodes = [{"id": x, "label": f"{WORDS[r.randrange(len(WORDS))]} {i}", "kind": r.choice(["backend", "frontend", "queue", "ai"])} for i, x in enumerate(main)]
    edges, how = [], r.choice(["main", "steps", "none"])
    for i in range(main_len - 1):
        e = {"id": f"{name}-e{len(edges):03d}", "from": main[i], "to": main[i + 1], "label": r.choice(VERBS)}
        if how == "main":
            e["flow"] = "main"
        elif how == "steps":
            e["step"] = i + 1
        edges.append(e)
    rest = n - main_len
    stores = min(rest, max(1, rest // 6)) if rest else 0
    for s in range(stores):
        sid = f"{name}-s{s}"
        nodes.append({"id": sid, "label": f"{WORDS[r.randrange(len(WORDS))]} store", "kind": "database"})
        for a in r.sample(main, min(len(main), r.randint(1, 3))):
            edges.append({"id": f"{name}-e{len(edges):03d}", "from": a, "to": sid, "label": r.choice(["reads", "writes"]), "kind": "state"})
    left, b = rest - stores, 0
    while left > 0:
        k = min(left, r.randint(1, 3))
        chain = [f"{name}-b{b}-{j}" for j in range(k)]
        nodes += [{"id": x, "label": f"{WORDS[r.randrange(len(WORDS))]} {b}.{j}", "kind": r.choice(KINDS)} for j, x in enumerate(chain)]
        at = r.randrange(main_len - 1)
        exc = r.random() < 0.3
        e = {"id": f"{name}-e{len(edges):03d}", "from": main[at], "to": chain[0], "label": "on failure" if exc else r.choice(VERBS)}
        if exc:
            e["kind"] = "guard"
        edges.append(e)
        for x, y in zip(chain, chain[1:]):
            edges.append({"id": f"{name}-e{len(edges):03d}", "from": x, "to": y})
        if r.random() < 0.6:  # rejoins the main flow further on
            to = r.randrange(at + 1, main_len)
            edges.append({"id": f"{name}-e{len(edges):03d}", "from": chain[-1], "to": main[to], "label": r.choice(VERBS)})
        left -= k
        b += 1
    if main_len > 3 and r.random() < 0.5:  # a loop back
        a = r.randrange(2, main_len)
        edges.append({"id": f"{name}-e{len(edges):03d}", "from": main[a], "to": main[r.randrange(0, a - 1)], "label": "retries", "loop": True})
    view = {"id": name, "title": f"Held-out {name}", "arrange": "flow", "nodeIds": [x["id"] for x in nodes]}
    if r.random() < 0.25 and main_len >= 6:  # two boxes, each a run of the main flow
        h = main_len // 2
        view["containers"] = [{"id": f"{name}-box0", "label": "Front", "nodeIds": main[:h]}, {"id": f"{name}-box1", "label": "Back", "nodeIds": main[h:]}]
    return model(f"held-out {name}", nodes, edges, [view])


def heldout(seed, week, out):
    """The week's held-out models, each in its own file of out: a function of seed and week only."""
    if not seed:
        sys.exit("gen.py --heldout needs a seed: --seed, or LAYOUT_HELDOUT_SEED in the environment")
    import re
    if not re.fullmatch(r"\d{4}-W\d{2}", week or ""):
        sys.exit("gen.py --heldout needs --week as YYYY-Www (for example 2026-W48)")
    root, dest = Path(__file__).resolve().parent.parent, Path(out).resolve()
    if dest == root or root in dest.parents:
        sys.exit("gen.py --heldout: the held-out maps are never written into the repository; give an --out outside it")
    r = random.Random(hashlib.sha256(f"{seed}:{week}".encode()).hexdigest())
    dest.mkdir(parents=True, exist_ok=True)
    k = 0
    for i in range(HELDOUT_PLAIN):
        n = r.randint(8, 60)
        m = heldout_view(r, f"h{k:02d}", n, r.randint(3, min(10, n)))
        (dest / f"h{k:02d}.json").write_text(json.dumps(m, indent=1) + "\n")
        k += 1
    for i in range(HELDOUT_LONG):
        L = r.randint(11, 30)
        m = heldout_view(r, f"h{k:02d}", min(60, L + r.randint(0, 12)), L)
        (dest / f"h{k:02d}.json").write_text(json.dumps(m, indent=1) + "\n")
        k += 1
    print(f"wrote {k} held-out views")


# a8's sources: the import fixtures tests/import.py reads, each with the prefix its ids take in a8
IMPORTS = [("dsl", "tests/fixtures/integration.dsl"), ("puml", "tests/import/parcels.puml"), ("checkout", "tests/import/checkout.mmd"),
           ("meals", "tests/import/meals.mmd"), ("compose", "tests/import/compose.json"), ("k8s", "tests/import/kubernetes.json")]


def imports():
    """a8: the import fixtures' eight views as `umlimator.py import --arrange` writes them (arrange "flow"), in one model, each
    id prefixed by its file's name, and with kindsFromLabels: the page reads a line's kind from its words (a line that reads or
    writes a store is a dependency line there), and bench.py's hashes are the page's, which layout() must draw the same
    (.evolve/decisions.md D13)."""
    import subprocess, tempfile
    root = Path(__file__).resolve().parent.parent
    nodes, edges, views = [], [], []
    with tempfile.TemporaryDirectory() as tmp:
        for pre, src in IMPORTS:
            out = Path(tmp) / f"{pre}.json"
            subprocess.run([sys.executable, str(root / "umlimator.py"), "import", str(root / src), "--out", str(out), "--arrange"],
                           check=True, capture_output=True)
            m = json.loads(out.read_text(encoding="utf-8"))
            x = lambda i: None if i is None else f"{pre}-{i}"
            for n in m["nodes"]:
                nodes.append({**n, "id": x(n["id"]), **({"opensView": x(n["opensView"])} if n.get("opensView") else {})})
            for e in m["edges"]:
                edges.append({**e, "id": x(e["id"]), "from": x(e["from"]), "to": x(e["to"])})
            for v in m["views"]:
                w = {**v, "id": x(v["id"]), "nodeIds": [x(i) for i in v["nodeIds"]],
                     "containers": [{**c, "id": x(c["id"]), "nodeIds": [x(i) for i in c["nodeIds"]], **({"parent": x(c["parent"])} if c.get("parent") else {})}
                                    for c in v.get("containers", [])]}
                if "edges" in v:
                    w["edges"] = [x(i) for i in v["edges"]]
                if "parent" in v:
                    w["parent"] = x(v["parent"])
                views.append({**w, "kindsFromLabels": True})
    return {"title": "The import fixtures, arranged", "nodes": nodes, "edges": edges, "views": views}


def main():
    if len(sys.argv) > 1:
        p = argparse.ArgumentParser()
        p.add_argument("--heldout", action="store_true", required=True)
        p.add_argument("--week")
        p.add_argument("--out", required=True)
        p.add_argument("--seed")
        a = p.parse_args()
        return heldout(a.seed or os.environ.get("LAYOUT_HELDOUT_SEED", ""), a.week, a.out)
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

    M["a8"] = imports()

    for k, m in M.items():
        (out / f"{k}.json").write_text(json.dumps(m, indent=1) + "\n")
        print(k, len(m["nodes"]), "nodes", len(m["edges"]), "edges", [v["id"] for v in m["views"]])


if __name__ == "__main__":
    main()
