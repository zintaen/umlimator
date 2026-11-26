# Contributing to umlimator

Thanks for helping. Bug reports, fixes, new examples, docs and diagram-type work are all welcome. This file says how to set up, what a pull request must keep true, and how it is checked.

Before a large change (a new diagram type, a new export, a change to the public API), open an issue or a discussion first so the design can be agreed before the code is written. The API is additive only through 1.0.0: `render()`, `layout()`, the handle, the events and the `change` operations keep their shapes.

## Contributor License Agreement

Before a pull request can be merged, each of its authors signs the [Contributor License Agreement](CLA.md) once. You keep the copyright in your work; the agreement gives the project owner the rights to distribute it and, if the project ever needs to, to license it under other terms. When you open your first pull request, a bot asks you to sign: reply on the pull request with this comment, exactly.

```
I have read the CLA Document and I hereby sign the CLA
```

The `cla` check turns green once every author has signed. Comment `recheck` to run it again.

## Setup

You need Node 18 or later (CI uses Node 24, which the `--test-skip-pattern` flag below needs), Python 3.9 or later for the CLI, and Chrome or Chromium for the browser tests, pictures and PDFs.

```bash
git clone https://github.com/zintaen/umlimator.git
cd umlimator
node tools/build.mjs              # src/ into lib/ (npm run build does the same)
npm ci --prefix docs              # only to work on the documentation site
```

The module has no runtime dependencies, so the repository root needs no `npm install`.

## Tests

These are the commands CI runs (`.github/workflows/check.yml`). Run the ones that cover what you changed before you open a pull request.

```bash
node --test --test-skip-pattern='\(timed\)'                                # layout() in Node: geometry, the layout rules, the docs
node --test --test-concurrency=1 --test-name-pattern='\(timed\)'          # the timed tests, one file at a time
npm test                                                                  # both of the above
python3 tests/embed.py                                                    # render() in headless Chrome: events, keyboard, colours, editing
python3 tests/cli.py                                                      # the CLI's diff, drift, timelapse, pdf and the MCP server
python3 tests/mcp.py
python3 tests/packs.py
python3 tests/steps.py
python3 tests/outcomes.py
python3 tests/import.py
python3 bench/bench.py --check-determinism --expect bench/expected.json --max-ms m50=2000
python3 bench/bench.py --score --expect bench/score-expected.json        # the layout quality score, in Node
python3 bench/bench.py --score --corpus edits --expect bench/score-expected-edits.json   # the same on the edit corpus
npm --prefix docs run build && node --test tests/site.test.mjs            # the site builds with no dead links
```

The BPMN XML tests need the optional `bpmn-moddle` library in a scratch folder, never as a dependency of the module:

```bash
npm install --no-save --prefix /tmp/moddle bpmn-moddle@10.3.1 moddle@8.2.1 moddle-xml@12.3.2 min-dash@5.1.0 saxen@11.2.0
UMLIMATOR_BPMN_MODDLE=/tmp/moddle npm test
```

The bench lays out fixed models in headless Chrome and fails on a view that no longer draws as recorded in `bench/expected.json`. A change that moves lines on purpose refreshes it with `--write-expected` and says why in the pull request.

The layout quality score (`python3 bench/bench.py --score`, which runs `bench/score.mjs`) lays out every view of the fixed corpus in Node with `lib/umlimator-all.js`, typed views included, and scores each with `src/layout/score.js`: hard issues, crossings, labels, how straight a main flow runs and lines against the reading direction, weighted by `bench/score-weights.json` (lower is better). With `--expect bench/score-expected.json` it fails when a view's hard count rises, a view's score rises by more than 2 percent or the total rises; with `--base REF` it also lays the corpus out with that commit's `lib/` in the same run and fails when the whole takes more than 1.10 times as long. `--views b10/overview,examples/bookshop-c4` narrows it. Only the maintainer changes the weights or rewrites the expect file (`--write-expected`), and says why in the pull request. See `docs/diagrams/notes/layout-flow.md` section 4.

Two more corpora come with it. The edit corpus, `bench/edits/edits.json`, holds five edits per bench map view as `apply()` commands (a card added with one line, a line removed, a card renamed, a line added, a card moved into a box); `node bench/gen-edits.mjs` writes it from a fixed seed and `--check` fails when the committed file differs, so change the generator, never the file. `--corpus edits` lays each edited model out against the model before (`stableFrom`), adds the `moved` share of untouched cards to the score, compares with `bench/score-expected-edits.json`, fails when a pair draws more hard issues than the same edit laid out fresh, and reports how many pairs keep every untouched card in place (section 8.4 asks 95 percent; it is reported, not enforced). The held-out corpus is never committed: `bench/gen.py --heldout --week YYYY-Www --out DIR` writes it from a seed (`--seed`, or `LAYOUT_HELDOUT_SEED`) hashed with the week, refuses a folder inside the repository and prints nothing about the maps, and `--corpus heldout` builds it in a temporary folder and prints totals only (no `--views`, `--expect`, `--save` or `--write-expected`). The `layout-score` workflow runs the fixed and edit corpora on pull requests that touch the layout or the bench, and the held-out corpus on pushes to `audit-loop` and by hand only, with the repository secret `LAYOUT_HELDOUT_SEED`; without it, as on a pull request or a fork, the job says so and passes.

## The weekly layout loop

`.github/workflows/layout-loop.yml` runs `tools/evolve/tune-loop.mjs` every Saturday at 20:00 UTC (Sunday 03:00 in the maintainer's time, UTC+7): it proposes one change to one value of `src/layout/tune.js`, inside the range the script declares for it, measures the fixed, edit and held-out corpora with that change against `audit-loop` as it is, and keeps it only when no view's hard count rises, no view's score rises by more than 2 percent, the time stays within the gate, the fixed total falls by at least 1 percent, the edit corpus is no worse and the held-out total is no worse (section 9 of the layout-flow note). A kept change becomes a pull request against `audit-loop` from a branch `layout-tune/<week>` with the totals before and after; the workflow never merges. `tests/tune.test.mjs` pins every value of `tune.js`: the values the loop may change in `bench/tune-pins.json`, which the loop moves in the same commit as the value, and the fixed ones in the test itself. So the pull request passes that test, approving it approves the pin's move, and a hand edit of `tune.js` without its pin still fails. Two weeks in a row with nothing kept stop the loop until it is run by hand with `restart`; a change kept one week whose held-out total is worse the next (with a new seed) is reverted by that week's pull request.

It is off until both of these exist in the repository settings:

- the repository variable `LAYOUT_LOOP_ENABLED` set to `true`, once the audit loop is in maintenance mode;
- the repository secret `LAYOUT_HELDOUT_SEED`, any long random text: the seed of the held-out corpus. Only the step that measures receives it, and it prints and records totals only.

The measuring job has a read-only token; the publishing job has `contents`, `pull-requests` and `actions` write and no secret, checks the candidate again and pushes only its new branch. A pull request opened by the workflow's own token starts no workflow, but a `workflow_dispatch` does, so the publishing job then runs `gh workflow run check.yml --ref layout-tune/<week>` and the same for `layout-score.yml` with `heldout=false` (the held-out totals are the loop's own). Those runs check the branch's head commit, which is the pull request's, so their checks (named as on any pull request, `check` among them) show on it and count for branch protection. GitHub starts a `workflow_dispatch` only for a workflow file that the default branch has, so this works once `main` has these triggers; until then, or when a run does not start (the job warns and fails with the pull request open), close and reopen the pull request, or run the workflow by hand on the branch from the Actions tab. Each week's record (the proposal, each corpus's totals and the decision) is kept as the run's `tune-record` artifact for 90 days, and in `bench/results/tune-<date>.json` when a change is kept; `tools/evolve/digest.mjs --tune <folder>` lists them in the weekly digest. Tests: `tests/tune-loop.test.mjs` and `tests/corpora.test.mjs`, with fakes for the build, the scorer, git and `gh`.

### Protected tests

Some tests hold the module's core promises: the bench hashes (`layout()` draws each benchmark view as recorded), `validate()` and `apply()`, `diff()`'s invariants, the readers' round trips, and the hostile-input and prototype-key tests. `tests/protected.json` lists them by file and title, with a hash of each test's body and of the file's top-level helpers it uses, and how many asserts it makes. `tests/protected.test.mjs` fails when a protected test is deleted, renamed or edited, an assertion dropped or weakened, the test skipped (by `test.skip`, a `skip` option, or a skipped `describe`, an `if`, a loop or a function around it, so that `node --test` no longer runs it), or a helper it calls changed. A change of layout or of a comment is no change.

Their expectations change only with the maintainer's approval. When a pull request has to change one, say which and why in the pull request; after approving, the maintainer records it:

```bash
node tools/protect.mjs                                 # check every protected test; exit 1 on one gone or changed
node tools/protect.mjs --list                          # the protected tests, with their asserts and helpers
node tools/protect.mjs --update [file [title...]]      # the maintainer: record the approved change
node tools/protect.mjs --add tests/x.test.mjs "title"  # the maintainer: protect another test
node tools/protect.mjs --remove tests/x.test.mjs "title"
```

Only a test with a literal title can be protected. A renamed protected test is removed and added again under its new name.

### Mutation testing

`tools/evolve/mutate.mjs` asks whether the tests notice when the code is wrong. It makes small wrong versions of a source file (a comparison flipped, `&&` and `||` or `+` and `-` swapped, a number or `true` changed, an expression statement dropped), one at a time, runs the test files that import the file, and reports the share of mutants a test failed on (killed) and every survivor with its line and column. A survivor is a change no test notices: a missing assertion, or a line that does nothing.

```bash
node tools/evolve/mutate.mjs src/core/history.js --tests tests/apply.test.mjs --seed 3 --max 40 --budget 10m
```

Without `--tests` it runs every `tests/*.test.mjs` that names the file, the one named after it first, and stops a mutant's run at the first test file that fails. The same `--seed` picks the same mutants in the same order; `--budget` (seconds, or `90s`, `10m`) stops starting new mutants once spent and says how many were not run; a mutant that runs past `--timeout` counts as killed. When the tests read `lib/`, each mutant is built first. All the work happens in a temporary copy of the repository, removed at the end, so the tree is never changed. A line that holds `mutate: skip` is never mutated. Exit 0 when it ran, 1 when the tests fail before any mutation, 2 on a usage error; `--json` prints the report as JSON. Its tests are `node --test tests/mutate.test.mjs`.

## Rules a pull request must keep

- `lib/` is built and committed. Edit the sources in `src/`, run `node tools/build.mjs`, and commit `src/` and `lib/` together. CI fails when `lib/` is not what `src/` builds.
- `engine/scripts/`, `engine/references/` and `tools/fetch_icons.py` are copies of pinned upstream files (see `THIRD_PARTY_NOTICES.md`). Never edit them: CI checks that they are unmodified. Change behaviour around them in umlimator's own code instead.
- Examples are made-up systems. Do not name real host applications, companies or people in models, docs or tests.
- Cloud icon packs are fetched by each user after reading the vendor's terms. Do not commit vendor icons.
- A change in behaviour comes with a test, and with the docs that describe it (`docs/start/`, `docs/maps/`, `docs/use/`, `docs/api/`, a type's section of `tools/types.md` or its conformance note in `docs/diagrams/conformance/`; `node tools/gallery.mjs` then writes the type pages).
- Write docs in plain, direct English with plain keyboard characters: straight quotes, a hyphen for a dash, three periods for an ellipsis.

## How a pull request is checked

Every pull request runs the `cla` workflow (above) and the `check` workflow: the build check, the Node suite in shards, the timed tests, the examples' layout checks, the CLI, the embedded page in Chrome, the browser tests, the bench, and the documentation site build. The required check `check` passes only when every job did. A maintainer reviews the change once it is green.

## The bug agent

`.github/workflows/bug-agent.yml` runs an agent (the official Claude Code CLI, at a pinned version) on a bug report. It starts when a maintainer adds the `bug` label to an open issue, or by hand from the Actions tab ("bug-agent", "Run workflow") with an issue number. The bug report template adds `bug` itself when an outside reporter opens an issue, and that does not start a run: a maintainer reads the issue first, then removes and adds the label again or runs the workflow by hand.

The agent reads the issue, writes a small test (`tests/issue-<n>.test.mjs`) that tries to reproduce it, and then does one of three things. If the bug reproduces and the agent fixes it, the workflow checks the fix (it changes only `src/`, `lib/`, `tests/`, `docs/` or `umlimator*.py`, adds a test under `tests/`, the test fails on the base branch with only the test applied and passes with the fix, and `lib/` is what `src/` builds) and opens a draft pull request into `audit-loop` from a new branch `bug-agent/issue-<n>-<run>`. If it reproduces without a fix the agent trusts, it says so on the issue. If it does not reproduce, it comments on the issue asking for a minimal model and exact steps. A fix that fails the checks is never pushed; the issue gets a comment saying why.

It is off until both of these exist in the repository settings:

- the repository variable `BUG_AGENT_ENABLED` set to `true` (Settings, Secrets and variables, Actions, Variables);
- the repository secret `ANTHROPIC_API_KEY`, an Anthropic API key used only by this workflow (same page, Secrets).

Each issue has at most one run at a time. The run has three jobs, each on a fresh runner and each with a time limit:

- The agent's job (45 minutes; the agent itself stops at 35 minutes, 80 turns or 10 dollars) holds a read-only token and the API key, and only a proxy (`tools/bug_agent_proxy.mjs`) ever sees the key: it runs as a user of its own whose network reaches the Anthropic API and nothing else, forwards only the message endpoints, and passes only text, tool use, tool result and thinking blocks (no image, document or search result, no `source` of any kind), the caller's own tools and known-safe beta features, so the API's side never fetches a URL for the agent. The agent runs as another user (`tools/bug_agent_jail.sh`) with a placeholder key, no GitHub token, no sudo and no access to the runner's files, whose processes reach loopback only: the kernel's firewall matches that user, so the tests the agent writes are held too, and the proxy on 127.0.0.1 is its only way to the model. The runner's own steps (checkout, Node, the CLI's install) are held by `step-security/harden-runner` to GitHub, the npm registry and the API. The agent's settings (`node tools/bug_agent.mjs settings`, in a file it cannot write) let its shell run only exact commands, `node tools/build.mjs`, `git diff`, `git status`, and `node --test tests/<file>.test.mjs` or `python3 tests/<file>.py` for one test file, and its Read tool only the checkout and its work folder; no hook runs. When it stops, its processes are killed and the runner's own git, not the agent's `.git`, takes its diff, which leaves the job as a job output (data, not an artifact) after a second check that the key is not in it.
- The verify job (25 minutes) holds a read-only token and no secret. It checks the diff with the base branch's own copy of `tools/bug_agent.mjs`: git lists every path the patch writes (`git apply --numstat -z` and `--summary`, in a scratch repository), and a rename, copy, mode change, link, binary or path outside the allowed ones is refused. The patch's build and test run as a jailed user with no network, in a copy of the tree without `.git`; `lib/` is compared with the build before the test starts and is then made read-only to it.
- The publishing job (10 minutes) has `contents`, `pull-requests` and `issues` write and no secret, runs no agent and none of the patch's code, checks the patch's paths again, applies it with `git apply --index`, checks what git staged (`git diff --cached --raw`) once more, and pushes only its new branch (a workflow token cannot be limited to one branch, so the job's script is what keeps to it).

No release secret is used. A pull request opened by the workflow's own token does not start the `check` workflow: the draft's checks run once a maintainer pushes to it, or closes and reopens it. Review the draft as you would any outside contribution. The deterministic parts live in `tools/bug_agent.mjs` and the agent's instructions in `.github/bug-agent/prompt.md`; `tests/bug-agent.test.mjs` covers both and the workflow's jobs and permissions, and `tests/bug-agent-jail.test.mjs` checks the jail and the sandbox on a real runner (the `bug-agent-jail` workflow, which runs on a pull request that touches them).

## The audit and fix loop's strategy

Much of the maintenance work here is done by an audit and fix loop of agents, run by the maintainer. It follows the auto-evolve strategy, kept in a private canonical repository and pinned here at one tagged version in `.evolve/STRATEGY.md`: a header names the version, the tag's commit and the date pinned, and the text below it is the upstream file byte for byte. The loop follows that copy, never a newer upstream text, and nobody edits it in place. `node tools/evolve/strategy-sync.mjs check` compares it with the newest upstream tag at every session start, and `update` opens the pull request that pins a newer version; the maintainer merges it. `.evolve/README.md` says what each file in `.evolve/` is, `.evolve/MAPPING.md` where each record the strategy names lives in this project, and `.evolve/rules.md` where the standing rules are. To stop the loop, commit `.evolve/STOP` to main (`tools/evolve/killswitch.mjs` reads it).

When running the loop shows a problem with the strategy itself (a rule that is wrong, unclear, missing a case or costing more than it needs), as opposed to a bug in umlimator, the combine step adds an entry to `.evolve/strategy-feedback.md`: the date, the round, the rule it touches, what happened, the evidence (a commit, a pull request, a run) and a proposed change, optionally with an exact `find` and `replace` edit. At each batch to main, `strategy-sync.mjs propose` sends the open entries upstream as one pull request with an independent review and closes them with its number; only the maintainer merges it there. The round templates that do all this are in `tools/evolve/templates/`, checked against `tools/evolve/templates/checklist.md` by `tests/strategy-sync.test.mjs`; `tools/evolve/README.md` describes each tool.

## Commits

Write the subject as `Area: what changed`, in plain words, for example `Docs: the MCP guide names the page tools` or `Sequence: a self-message keeps its label`. Keep one change per pull request where you can, and do not rewrite history on a branch that is under review: add commits instead.

## Releases

A maintainer releases by bumping `package.json`'s version in a pull request and adding that version's `## X.Y.Z: ...` section to `docs/module-api.md`. When the pull request is merged and the checks pass on `main`, CI's `check.yml` releases it in three jobs, and publishes the site beside them:

1. `release` tags `vX.Y.Z` at that commit, opens a draft GitHub Release with that section as its notes, and publishes the package to npm with provenance under the dist-tag `next`. A plain `npm install umlimator` still gets the version before.
2. `smoke` installs `umlimator@X.Y.Z` from the registry into an empty folder and uses it (`tools/smoke.mjs`): it imports `umlimator` and `umlimator/all`, reads `umlimator/schema.json`, and runs `migrate()`, `validate()`, `layout()` and `check()` on the smallest model in `examples/types/`; then that commit's `umlimator.py render` draws the same model into a page with the installed `lib/`, and `umlimator.py check` checks the page in headless Chrome. The package does not ship the CLI or the examples, so both come from the tagged commit.
3. `promote` runs only when `smoke` passed. It moves `latest` to the version with `npm dist-tag add` (never back to an older version) and publishes the GitHub Release.

When the smoke test fails, the job says which step failed and why, `latest` stays where it was and the Release stays a draft. If the registry was at fault, re-run the failed jobs of that run. If the package is broken, fix it and release a new version: npm never takes the same version twice, and the broken one stays on `next` only. Until the release finishes or the version is bumped, each later push to `main` fails and names the commit whose jobs to re-run.

Trusted publishing covers `npm publish` only, so `promote` needs the repository secret `NPM_TOKEN`, a granular npm token that may write `umlimator`. Without it, `promote` fails and prints the one command to run by hand: `npm dist-tag add umlimator@X.Y.Z latest`.

After each Pages deploy, the `site-links` job reads the deployed site from its root and from its `sitemap.xml` when it has one (`tools/linkcheck.mjs`), and fails when any internal link, frame, picture, script or stylesheet does not answer 200, naming the page that links it.

To try these before a release: `node tools/smoke.mjs <tarball from npm pack>` runs the smoke test on a local package, and `node tools/linkcheck.mjs <url>` checks any copy of the site, `https://zintaen.github.io/umlimator/` included. `python3 tests/steps.py` runs the release jobs' shell steps against stand-ins for `gh`, `git` and `npm`, and `tests/smoke.test.mjs` and `tests/linkcheck.test.mjs` test the two tools.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not a public issue.
