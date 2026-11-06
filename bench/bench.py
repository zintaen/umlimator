#!/usr/bin/env python3
"""Layout and routing benchmarks: time each view of each model in headless Chrome, as the page lays it out.

  python3 bench/bench.py                          # every model in bench/models/ plus examples/bookshop.json
  python3 bench/bench.py --models m50,b26 --runs 9
  python3 bench/bench.py --optimize               # also time render's layout search, per view without a layout
  python3 bench/bench.py --save                   # also write bench/results/<date>-<commit>.json
  python3 bench/bench.py --check-determinism      # fail if two page loads lay any view out differently
  python3 bench/bench.py --max-ms m50=1000        # fail if a view of m50 takes longer (plan + layout, median)
  python3 bench/bench.py --expect bench/results/X.json   # fail if a view's geometry differs from that run's

Per view, the median of --runs runs, each with fresh caches (patch 30 in patches/apply.py): plan is lane planning
(planOf; a hub view tries lane orders), place is everything before routing, route the first routing and the reorder
pass, repair the port-repair loop (rounds, and the port swaps it tried), total is plan + layout. issues is what the
layout check's route audit finds; hash is the geometry, the same on every run unless the output is nondeterministic.
A view that does not finish within --timeout seconds, or that repairs although it says `repair: false`, fails the run.
"""
import argparse, datetime, html, importlib.util, json, re, statistics, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location("visual", ROOT / "engine" / "scripts" / "visual.py")
visual = importlib.util.module_from_spec(spec); spec.loader.exec_module(visual)
PRE = re.compile(r'<pre id="bench"[^>]*>(.*?)</pre>', re.S)


def page_of(model, tmp):
    out = Path(tmp) / (model.stem + ".html")
    r = subprocess.run([sys.executable, str(ROOT / "engine" / "scripts" / "visual.py"), "render", "--map", str(model),
                        "--out", str(out), "--no-open", "--no-check", "--no-optimize"], capture_output=True, text=True)
    if not out.is_file():
        sys.exit(f"{model}: render failed\n{r.stdout[-1500:]}{r.stderr[-1500:]}")
    return out


def run_view(binary, page, view, runs, optimize, timeout):
    """One page load that times one view; None on a timeout."""
    url = page.as_uri() + f"#bench=1&views={view}&runs={runs}" + ("&optimize=1" if optimize else "")
    # no --virtual-time-budget: it virtualises the page's clock, and the bench runs before the load event anyway
    dom = visual.chrome(binary, "--dump-dom", url, done=lambda t: "</html>" in t, timeout=timeout)
    m = PRE.search(dom)
    if not m:
        return None
    rep = json.loads(html.unescape(m.group(1)))
    if rep.get("errors"):
        sys.exit(f"{page.name} view {view}: {rep['errors']}")
    return rep["views"][view]


def summary(r, edges):
    med = lambda k: round(statistics.median(x.get(k, 0) for x in r["runs"]), 1)
    s = {"nodes": r["nodes"], "edges": edges, "plan": med("plan"), "place": med("place"), "route": med("route"),
         "repair": med("repair"), "rounds": med("rounds"), "reroutes": med("reroutes"),
         "total": round(statistics.median(x["plan"] + x["geo"] for x in r["runs"]), 1),
         "issues": r["runs"][-1]["issues"], "cross": r["runs"][-1]["cross"], "fallback": r["runs"][-1]["fallback"],
         "hashes": sorted({x["hash"] for x in r["runs"]})}
    if "optimize" in r:
        s["optimize"] = {k: round(v, 1) for k, v in r["optimize"].items()}
    return s


def view_edges(m, v):
    if isinstance(v.get("edges"), list):
        return len(v["edges"])
    ids = set(v.get("nodeIds") or [])
    return sum(1 for e in m.get("edges", []) if e["from"] in ids and e["to"] in ids)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--models", help="comma list of names in bench/models/ (default: all, plus examples/bookshop)")
    p.add_argument("--runs", type=int, default=5)
    p.add_argument("--timeout", type=int, default=120, help="seconds per view")
    p.add_argument("--optimize", action="store_true")
    p.add_argument("--save", action="store_true")
    p.add_argument("--check-determinism", action="store_true")
    p.add_argument("--max-ms", default="", help="model=ms,...: fail when a view's median total exceeds it")
    p.add_argument("--expect", help="a results file (--save): fail when a view it lists lays out differently")
    a = p.parse_args()
    binary = visual.find_chrome() or sys.exit("bench needs Google Chrome or Chromium")
    paths = sorted((HERE / "models").glob("*.json")) + [ROOT / "examples" / "bookshop.json"]
    if a.models:
        want = a.models.split(",")
        paths = [q for q in paths if q.stem in want]
    limits = {k: float(v) for k, v in (x.split("=") for x in a.max_ms.split(",") if x)}
    expect = json.loads(Path(a.expect).read_text())["results"] if a.expect else {}
    results, failed = {}, []
    print(f"{'model/view':24} {'n':>3} {'e':>4} {'plan':>8} {'place':>7} {'route':>8} {'repair':>9} {'rnd':>4} {'rr':>5} "
          f"{'total ms':>9} {'iss':>4}  hash")
    with tempfile.TemporaryDirectory() as tmp:
        for path in paths:
            m = json.loads(path.read_text())
            page = page_of(path, tmp)
            for v in m["views"]:
                key = f"{path.stem}/{v['id']}"
                r = run_view(binary, page, v["id"], a.runs, a.optimize, a.timeout)
                if r is None:
                    results[key] = {"timeout": a.timeout}
                    print(f"{key:24} timeout > {a.timeout} s")
                    failed.append(f"{key}: no result within {a.timeout} s")
                    continue
                s = results[key] = summary(r, view_edges(m, v))
                print(f"{key:24} {s['nodes']:>3} {s['edges']:>4} {s['plan']:>8} {s['place']:>7} {s['route']:>8} {s['repair']:>9} "
                      f"{s['rounds']:>4} {s['reroutes']:>5} {s['total']:>9} {s['issues']:>4}  {','.join(s['hashes'])}"
                      + (f"  optimize {s['optimize']['ms']} ms / {s['optimize']['evals']} evals" if "optimize" in s else ""))
                if v.get("repair") is False and s["rounds"]:
                    failed.append(f"{key}: says repair: false but ran {s['rounds']} repair round(s)")
                if key in expect and "hashes" in expect[key] and s["hashes"] != expect[key]["hashes"]:
                    failed.append(f"{key}: geometry {s['hashes']} differs from {a.expect} ({expect[key]['hashes']})")
                if len(s["hashes"]) > 1:
                    failed.append(f"{key}: runs disagree ({s['hashes']})")
                if a.check_determinism:
                    r2 = run_view(binary, page, v["id"], 1, False, a.timeout)
                    if r2 and r2["runs"][0]["hash"] not in s["hashes"]:
                        failed.append(f"{key}: a second page load laid it out differently")
                if path.stem in limits and s["total"] > limits[path.stem]:
                    failed.append(f"{key}: {s['total']} ms > {limits[path.stem]} ms")
    if a.save:
        sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "engine", "patches"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
        out = HERE / "results" / f"{datetime.date.today()}-{sha}{'-dirty' if dirty else ''}{'-' + a.models.replace(',', '-') if a.models else ''}.json"
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps({"commit": sha, "dirty": bool(dirty), "runs": a.runs, "chrome": binary, "results": results}, indent=1) + "\n")
        print("saved", out.relative_to(ROOT))
    if failed:
        sys.exit("FAILED\n  " + "\n  ".join(failed))


if __name__ == "__main__":
    main()
