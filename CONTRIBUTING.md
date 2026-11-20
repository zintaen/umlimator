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
npm --prefix docs run build && node --test tests/site.test.mjs            # the site builds with no dead links
```

The BPMN XML tests need the optional `bpmn-moddle` library in a scratch folder, never as a dependency of the module:

```bash
npm install --no-save --prefix /tmp/moddle bpmn-moddle@10.3.1 moddle@8.2.1 moddle-xml@12.3.2 min-dash@5.1.0 saxen@11.2.0
UMLIMATOR_BPMN_MODDLE=/tmp/moddle npm test
```

The bench lays out fixed models in headless Chrome and fails on a view that no longer draws as recorded in `bench/expected.json`. A change that moves lines on purpose refreshes it with `--write-expected` and says why in the pull request.

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

- The agent's job (45 minutes; the agent itself stops at 35 minutes, 80 turns or 10 dollars) holds a read-only token and the API key, and only a proxy (`tools/bug_agent_proxy.mjs`) ever sees the key: it runs as a user of its own whose network reaches the Anthropic API and nothing else, forwards only the message endpoints, and refuses server tools and MCP servers. The agent runs as another user (`tools/bug_agent_jail.sh`) with a placeholder key, no GitHub token, no sudo and no access to the runner's files, whose processes reach loopback only: the kernel's firewall matches that user, so the tests the agent writes are held too, and the proxy on 127.0.0.1 is its only way to the model. The runner's own steps (checkout, Node, the CLI's install) are held by `step-security/harden-runner` to GitHub, the npm registry and the API. The agent's settings (`node tools/bug_agent.mjs settings`, in a file it cannot write) let its shell run only exact commands, `node tools/build.mjs`, `git diff`, `git status`, and `node --test tests/<file>.test.mjs` or `python3 tests/<file>.py` for one test file, and its Read tool only the checkout and its work folder; no hook runs. When it stops, its processes are killed and the runner's own git, not the agent's `.git`, takes its diff, which leaves the job as a job output (data, not an artifact) after a second check that the key is not in it.
- The verify job (25 minutes) holds a read-only token and no secret. It checks the diff with the base branch's own copy of `tools/bug_agent.mjs`: git lists every path the patch writes (`git apply --numstat -z` and `--summary`, in a scratch repository), and a rename, copy, mode change, link, binary or path outside the allowed ones is refused. The patch's build and test run as a jailed user with no network, in a copy of the tree without `.git`; `lib/` is compared with the build before the test starts and is then made read-only to it.
- The publishing job (10 minutes) has `contents`, `pull-requests` and `issues` write and no secret, runs no agent and none of the patch's code, checks the patch's paths again, applies it with `git apply --index`, checks what git staged (`git diff --cached --raw`) once more, and pushes only its new branch (a workflow token cannot be limited to one branch, so the job's script is what keeps to it).

No release secret is used. A pull request opened by the workflow's own token does not start the `check` workflow: the draft's checks run once a maintainer pushes to it, or closes and reopens it. Review the draft as you would any outside contribution. The deterministic parts live in `tools/bug_agent.mjs` and the agent's instructions in `.github/bug-agent/prompt.md`; `tests/bug-agent.test.mjs` covers both and the workflow's jobs and permissions, and `tests/bug-agent-jail.test.mjs` checks the jail and the sandbox on a real runner (the `bug-agent-jail` workflow, which runs on a pull request that touches them).

## Commits

Write the subject as `Area: what changed`, in plain words, for example `Docs: the MCP guide names the page tools` or `Sequence: a self-message keeps its label`. Keep one change per pull request where you can, and do not rewrite history on a branch that is under review: add commits instead.

## Releases

A maintainer releases by bumping `package.json`'s version in a pull request and adding that version's `## X.Y.Z: ...` section to `docs/module-api.md`. When the pull request is merged and the checks pass on `main`, CI tags `vX.Y.Z`, publishes a GitHub Release with that section as its notes, publishes the package to npm and publishes the site.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not a public issue.
