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
- A change in behaviour comes with a test, and with the docs that describe it (`docs/guide/`, `docs/api/`, a conformance note in `docs/conformance/`).
- Write docs in plain, direct English with plain keyboard characters: straight quotes, a hyphen for a dash, three periods for an ellipsis.

## How a pull request is checked

Every pull request runs the `cla` workflow (above) and the `check` workflow: the build check, the Node suite in shards, the timed tests, the examples' layout checks, the CLI, the embedded page in Chrome, the browser tests, the bench, and the documentation site build. The required check `check` passes only when every job did. A maintainer reviews the change once it is green.

## Commits

Write the subject as `Area: what changed`, in plain words, for example `Docs: the MCP guide names the page tools` or `Sequence: a self-message keeps its label`. Keep one change per pull request where you can, and do not rewrite history on a branch that is under review: add commits instead.

## Releases

A maintainer releases by bumping `package.json`'s version in a pull request and adding that version's `## X.Y.Z: ...` section to `docs/module-api.md`. When the pull request is merged and the checks pass on `main`, CI tags `vX.Y.Z`, publishes a GitHub Release with that section as its notes, publishes the package to npm and publishes the site.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not a public issue.
