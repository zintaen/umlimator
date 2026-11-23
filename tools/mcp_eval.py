#!/usr/bin/env python3
"""The MCP edit tools' eval set (tests/fixtures/mcp-eval/cases.json): requests in plain words, each on a model of the
repository, with the change it asks for as diff()'s summary in words, and one way to make it (reference: the steps
apply() takes). It measures how well an assistant turns a request into edit tool calls. It is not run in CI: an agent,
or a person with one, runs it.

  python3 tools/mcp_eval.py list                 each case: its id, its model and its request
  python3 tools/mcp_eval.py start CASE [DIR]     a copy of the case's model in DIR (a new folder by default), and the
                                                 command that serves it (umlimator.py mcp COPY): give the assistant the
                                                 request, let it call the tools, then check
  python3 tools/mcp_eval.py check CASE COPY      the change made to COPY (diff() from the case's model) against the one
                                                 asked for: pass, or what is missing and what is more
  python3 tools/mcp_eval.py reference [CASE...]  each case's reference steps run on a copy, and checked: that the set
                                                 itself still holds (after a change to the module or to an example)

Comparing diff()'s words, not the files, lets an answer use other ids (class1 or invoice) or another order of steps.
Standard library only, and Node for the module's own diff() and editor.
"""
import json, shutil, sys, tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import umlimator as cli  # noqa: E402
import umlimator_mcp as mcp  # noqa: E402

CASES = ROOT / "tests" / "fixtures" / "mcp-eval" / "cases.json"


def cases():
    return {c["id"]: c for c in json.loads(CASES.read_text(encoding="utf-8"))}


def case(cid):
    cs = cases()
    if cid not in cs:
        sys.exit(f"no case {cid!r}; the cases: {', '.join(cs)}")
    return cs[cid]


def judged(c, after):
    """Whether the change from the case's model to `after` is the one asked for: diff()'s summary, line for line."""
    got = cli.js("diff", cli.read_json(ROOT / c["model"]), after)["summary"]
    want = c["expect"]["summary"]
    missing, more = list((Counter(want) - Counter(got)).elements()), list((Counter(got) - Counter(want)).elements())
    return {"case": c["id"], "pass": not missing and not more, **({"missing": missing} if missing else {}), **({"more": more} if more else {})}


def main(argv):
    if not argv or argv[0] not in ("list", "start", "check", "reference"):
        sys.exit(__doc__)
    if argv[0] == "list":
        for c in cases().values():
            print(f"{c['id']}\t{c['model']}\t{c['prompt']}")
        return 0
    if argv[0] == "start":
        c = case(argv[1]) if len(argv) > 1 else sys.exit("start needs a case id")
        d = Path(argv[2]) if len(argv) > 2 else Path(tempfile.mkdtemp(prefix=f"mcp-eval-{c['id']}-"))
        d.mkdir(parents=True, exist_ok=True)
        copy = d / Path(c["model"]).name
        shutil.copy(ROOT / c["model"], copy)
        print(json.dumps({"case": c["id"], "prompt": c["prompt"], "model": str(copy),
                          "serve": f"python3 {ROOT / 'umlimator.py'} mcp {copy}", "check": f"python3 {Path(__file__).resolve()} check {c['id']} {copy}"}, indent=1))
        return 0
    if argv[0] == "check":
        if len(argv) != 3:
            sys.exit("check needs a case id and the model copy the assistant edited")
        r = judged(case(argv[1]), cli.read_json(argv[2]))
        print(json.dumps(r, indent=1))
        return 0 if r["pass"] else 1
    picked = [case(x) for x in argv[1:]] or list(cases().values())
    results, d = [], Path(tempfile.mkdtemp(prefix="mcp-eval-"))
    mcp.page, mcp.URL = (lambda: ("v", None)), "http://127.0.0.1:0"  # no page: the edit tools write the copy, and tell no page
    try:
        for c in picked:
            mcp.MODEL = d / f"{c['id']}.json"
            shutil.copy(ROOT / c["model"], mcp.MODEL)
            try:
                mcp.call("apply", {"edits": c["reference"]})
                results.append(judged(c, cli.read_json(mcp.MODEL)))
            except mcp.Fail as e:
                results.append({"case": c["id"], "pass": False, "refused": str(e)})
    finally:
        shutil.rmtree(d, ignore_errors=True)
    print(json.dumps(results, indent=1))
    return 0 if all(r["pass"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
