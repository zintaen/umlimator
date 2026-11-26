# tools/evolve: the self-evolving loop's tools

Command-line tools for the audit and fix loop, written in Node with no dependency, plus the lessons file they feed and the round templates. The loop follows the auto-evolve strategy pinned in [`.evolve/STRATEGY.md`](../../.evolve/STRATEGY.md); [`.evolve/README.md`](../../.evolve/README.md) says what each file there is. None of them is scheduled yet but `tune-loop.mjs`, whose workflow is off until the maintainer turns it on: the maintainer decides the times (proposed below). Each exits 0 when all is well, 1 when it has something to report (a refused lease, a tripped breaker, a new fuzz finding) and 2 on a usage error, so a scheduler or a script can act on the exit code alone. Tests: `node --test tests/evolve.test.mjs`.

## lease.mjs: one owner of the loop at a time

```sh
node tools/evolve/lease.mjs take    --owner <session id> [--ttl 60m]
node tools/evolve/lease.mjs renew   --owner <session id> [--ttl 60m]
node tools/evolve/lease.mjs release --owner <session id>
node tools/evolve/lease.mjs check   [--owner <session id>]
```

The lease is a small JSON file: `owner`, `started`, `heartbeat` and `expires`, all UTC (and `tookOverFrom` after a takeover). It lives at `--file`, else `$EVOLVE_LEASE`, else `.evolve/lease.json` in the working folder, which git ignores. `take` succeeds when the lease is free, expired, or already yours; a live lease held by another owner is refused, and a takeover happens only once the current time is past `expires`. `renew` is the heartbeat: only the owner named in the file may renew it, so a session whose lease was taken over learns it must stop. `check` with no owner exits 0 when the lease is free or expired; with `--owner`, when it is live and yours.

Every change happens under a lock folder (`<file>.lock`, made with `mkdir`, which is atomic), so of several sessions taking an expired lease at once exactly one wins; a lock older than 30 seconds is a crashed writer's and is broken. `--now <ISO time>` sets the clock to compare with: pass a shared clock where sessions run on more than one machine.

Use: the orchestrator runs `take` at session start and stops if it exits 1; it runs `renew` at least every 15 minutes and before every push, merge, tag or handoff write; it runs `release` when it hands over.

## ledger.mjs: the circuit breakers

```sh
node tools/evolve/ledger.mjs <audits folder or auditN.json files...> [--window 20] [--json]
```

Reads the audit files (`audit<N>.json`, or a workflow run's output holding the audit under `result`; `audit30-b8.json` counts toward round 30) and leaves out findings a verifier refused. It reports three breakers and prints `verdict: stop` when any trips, else `verdict: continue`:

- (a) back again: a finding of the latest round whose family was confirmed in at least two earlier rounds of the window, three rounds in all. A family is one title (lower case, numbers and punctuation left out), or one file with one symptom: the finding's `symptom` field, or for older findings a class read from the title (hang, throws, escaping, overlap, lost-on-round-trip, wrong-count).
- (b) regresses twice: two findings of one family marked `verdict.cause: regression`, one in the latest round.
- (c) no fall: each of the last three rounds has at least one high or medium finding, and the second and third have at least as many as the round before. Where findings record `verdict.cause`, it also needs more than half of each round's high and medium to be `ledger` or `regression`.

Use: run after each audit is saved; on exit 1 the orchestrator finishes the round, writes the question to the decision queue and stops.

## digest.mjs: the weekly digest

```sh
node tools/evolve/digest.mjs --audits <folder> [--fixes <folder>] [--repo .] [--date YYYY-MM-DD] [--days 7] [--trend 8] [--gaps docs/module-api.md] [--tune <folder>] [--out digest.md]
```

Writes Markdown with: the rounds of the week and their fix rounds (lanes, findings fixed and skipped); a table of findings by severity over the last `--trend` rounds; the releases (git tags made in the week) and the commits and merged pull requests of the checked-out branch; the circuit breakers; the open known gaps (the last "Known gaps" item of `--gaps`); and a spot check of 2 or 3 rejected findings with the verifier's reason. With `--tune`, a section for the weekly layout loop: each record of the week (`tune-*.json` anywhere under that folder) with its proposal, its status, the fixed, edit and held-out totals before and after, and the reason, and a line when the loop has stopped. The spot check is picked at random with the date as the seed, so the same date always picks the same findings. A round's date is its audit file's `date`, `started` or `finished` field, else its first commit whose subject starts "Audit <N>", else the file's modification time.

## fuzz.mjs: hostile input for the importers

```sh
node tools/evolve/fuzz.mjs [--budget 10m] [--targets a,b] [--seed <text>] [--hang 5s] [--shrink 30s] [--out .evolve/fuzz] [--scripts <folder>,<folder>]
node tools/evolve/fuzz.mjs --list
node tools/evolve/fuzz.mjs --repro <file> --target <name>
```

The targets (`fuzz-targets.mjs`) are the module's Structurizr JSON, seven Mermaid and BPMN XML readers, and `umlimator_import.py`'s Structurizr DSL, C4-PlantUML, Mermaid map and cloud (compose and Kubernetes) readers. Each starts from the repository's own import fixtures (`tests/import/`, its `hostile/` files, `tests/fixtures/integration.dsl`) and mutates them: deleted, repeated and swapped lines, prototype names, stray quotes and brackets, deep nesting, and for JSON, removed keys and hostile values. An input fails when the reader throws, runs past `--hang`, or gives a model that `validate()` calls an error or `layout()` cannot draw. The BPMN target runs only where `UMLIMATOR_BPMN_MODDLE` names a folder that has `bpmn-moddle`, and the Python targets only where `python3` is found.

It also runs any fuzz script it finds (a `*fuzz*` or `*hostile*` `.mjs`, `.js` or `.py` file under `tests/`, other than a `*.test.mjs`, and under each `--scripts` folder or `$EVOLVE_FUZZ_SCRIPTS`, such as the handoff's repro folder) for its share of the budget, keeping its output as a log.

The whole run, shrinking included, stays within `--budget`: each target and script gets an even share of the time left when it starts. Each new failure is shrunk (lines, then characters; for JSON, keys and items) while it fails the same way, and written to the findings folder as `<target>-<hash>.<ext>` with `<target>-<hash>.finding.json` (kind, message, stack, seed and the repro command). A failure already in the folder is not written again. The seed (today's date by default) makes a run repeatable.

## mutate.mjs: do the tests notice wrong code?

```sh
node tools/evolve/mutate.mjs <src files...> [--tests a,b] [--seed 1] [--max n] [--budget 10m] [--timeout 60s] [--timed] [--json]
```

Makes simple mutants of each source file (a comparison flipped, a logical or arithmetic operator swapped, a constant changed, an expression statement dropped), one at a time in a temporary copy of the repository, runs the related test files, and reports the share killed and each survivor's place. One seed picks the same mutants in the same order; the budget stops starting new ones. CONTRIBUTING.md ("Mutation testing") says more. Tests: `node --test tests/mutate.test.mjs`.

## strategy-sync.mjs: the pinned strategy and its upstream

```sh
node tools/evolve/strategy-sync.mjs check   [--pinned .evolve/STRATEGY.md] [--upstream zintaen/auto-evolve-strategy]
node tools/evolve/strategy-sync.mjs propose [--feedback .evolve/strategy-feedback.md] [--review <file>] [--dry-run]
node tools/evolve/strategy-sync.mjs update  [--repo zintaen/umlimator] [--base main] [--dry-run]
```

umlimator follows a pinned copy of the auto-evolve strategy, never the newest upstream text (the strategy's A12). The canonical text is `STRATEGY.md` in the private repository zintaen/auto-evolve-strategy, versioned by tags; `.evolve/STRATEGY.md` holds one tagged version byte for byte under a header that names the version, the tag's commit, the date pinned and the text's sha256. The GitHub calls go through `gh api`, so export `GH_TOKEN=$(gh auth token --user zintaen)` first (the repository is private).

- `check` compares the pinned version with the newest upstream `vX.Y.Z` tag. It exits 0 when they match, and 1 when upstream has a newer version, when the tag now names another commit, when the text under the header was edited in place (its hash no longer matches), or when upstream cannot be reached. Session start runs it.
- `propose` reads the Open list of `.evolve/strategy-feedback.md` and opens one pull request against the canonical repository: a branch `feedback/umlimator-<date>`, STRATEGY.md with each entry's exact edits applied (a fenced `find` block and a fenced `replace` block; an edit whose text is not found exactly once is listed and left to the reviewer), an Unreleased entry in CHANGELOG.md per feedback entry, and the evidence in the body, with `--review`'s text as the independent review. It moves the entries to the Closed list with the pull request's number, and never merges anything. Nothing is opened while an earlier feedback pull request is still open. `--dry-run` prints the branch, the files and the body and writes nothing. The batch-to-main template runs it.
- `update` opens a umlimator pull request (branch `strategy/vX.Y.Z`, base `main`) that replaces the pinned copy with the newest tagged version and lists the upstream changelog's sections since the pinned version. The maintainer merges it; the next round follows the new version. `--dry-run` prints what it would do.

Feedback entries follow A12: date, round, rule (C or A number), what happened, the evidence and a proposed change. Only the combine step writes the file. Tests: `node --test tests/strategy-sync.test.mjs`, every mode against a fake upstream, with no network.

## killswitch.mjs: the loop's stop file

```sh
node tools/evolve/killswitch.mjs [--ref origin/main] [--repo .]
node tools/evolve/killswitch.mjs --file <path>
```

Exits 1 when `.evolve/STOP` exists in the given commit (main by default; run `git fetch` first), printing its text, and also when that commit cannot be read; exits 0 when there is no kill switch. `--file` checks a file beside the lease instead, where the rules file puts it there. Every session and round template runs it first, and the orchestrator before every step (the strategy's C3 step 3).

## tune-loop.mjs: the weekly layout loop

```sh
node tools/evolve/tune-loop.mjs propose [--week 2026-W48] [--history <folder>]
node tools/evolve/tune-loop.mjs check   --candidate <file>
node tools/evolve/tune-loop.mjs run     --owner <id> [--week W] [--history <folder>] [--record <file>] [--candidate-out <file>] [--runs 5] [--restart]
node tools/evolve/tune-loop.mjs publish --record <file> --candidate <file> [--base audit-loop] [--dry-run]
```

The propose-measure-keep loop of `docs/diagrams/notes/layout-flow.md` section 9. `RANGES` in the script declares what it may change in `src/layout/tune.js` and how far (each scalar a minimum, a maximum and a step; `ROW_SWEEPS` a list of choices); every other value is fixed. `propose` picks one value with the ISO week as the seed, not one tried in the last four weeks, and moves it one or two steps. `check` refuses a candidate that changes more than one value, a fixed value, any other line, or a value outside its range.

`run` reads the kill switch, takes the lease (held for the whole run, renewed before each corpus, released at the end; a live lease of another owner refuses the run), reads the earlier records (`--history`, and `bench/results/tune-*.json`), and applies the guards of section 9.3: two weeks in a row with nothing kept stop the loop until `--restart`, and a change kept last week that `tune.js` still has is measured reverted first, kept reverted when the held-out total is then better. It builds the candidate's `lib/umlimator-all.js` (putting `tune.js` and `lib/` back), and scores the fixed, edit and held-out corpora with `bench/score.mjs --lib <candidate> --base-lib <checked-out lib>`. The seed (`LAYOUT_HELDOUT_SEED`) reaches the held-out run only, which reports totals; without it nothing is kept. A change is kept when score.mjs finds no rule broken against the base on the fixed and edit corpora (a view's hard count, a view's score by more than 2 percent, the total, the time gate), the fixed total falls by at least 1 percent, and the held-out total and hard count are no worse. The record (week, date, status `kept`, `reverted`, `nothing-kept`, `stopped` or `refused`, the proposal, each corpus's totals and the reasons) goes to `--record`, and a kept candidate to `--candidate-out`. Exit 0 when a change is kept, 1 otherwise.

`publish` checks the candidate again against the record and the pins in `bench/tune-pins.json` against `tune.js` before the change, writes the candidate, moves the value's pin (one line of the pins file), rebuilds `lib/`, commits `tune.js`, the pins, `lib/` and `bench/results/tune-<date>.json` on a new branch `layout-tune/<week>`, pushes it and opens a pull request against `audit-loop` with `gh`. Then it starts `check.yml` and `layout-score.yml` (with `heldout=false`) on the branch with `gh workflow run --ref`, since a pull request opened with the workflow's token starts no workflow; a workflow that does not start is printed as a warning and the exit is 1, with the pull request open. It never merges and never edits a test: `tests/tune.test.mjs` holds `tune.js` to the pins, so the pull request passes it and the maintainer, approving it, approves the pin's move. `.github/workflows/layout-loop.yml` runs `run` and `publish` in two jobs (CONTRIBUTING.md, "The weekly layout loop"). Tests: `node --test tests/tune-loop.test.mjs`, with fakes for the build, the scorer, git and `gh`.

## templates/: the round templates

`tools/evolve/templates/` holds the runnable round scripts the orchestrator copies for each round (A7.3): `audit.js` (session checks, eight finders, dedupe, one adversarial verifier per finding, with the model rotation), `fix.js` (up to five lanes, then the combine step with the full local gate, the fixed-findings ledger and the strategy feedback), `batch.js` (batch to main with mutation testing, then `strategy-sync.mjs propose` with an independent review) and `release.sh` (merge a release pull request once green, patch only unless the maintainer approved, and watch CI's release jobs). Paths, round numbers and the commit identity come from `args`, so no machine path is written in them. `checklist.md` lists each standing rule with a string to search for; `tests/strategy-sync.test.mjs` fails when a template loses one.

## LESSONS.md

[`docs/diagrams/LESSONS.md`](../../docs/diagrams/LESSONS.md) holds what went wrong in the loop and the rule that prevents it. Each round that goes wrong in a new way adds an entry, and the round templates are updated from it.

## How each would be scheduled

Nothing is scheduled by this change. The proposed defaults, for the maintainer to confirm:

- lease: no schedule of its own. Every session runs `take` at start, `renew` every 15 minutes and before each push, and an hourly watcher runs `check` and takes the lease only when it has expired.
- ledger: no schedule of its own; the orchestrator runs it after each audit is saved and stops on exit 1.
- digest: weekly, Monday 09:00 (the maintainer's time), `--date` set to that day, the output sent to the maintainer.
- strategy-sync: `check` at every session start; `propose` at each batch to main; `update` when `check` reports a newer version.
- killswitch: no schedule of its own; first in every session and job, and before every step.
- tune-loop: weekly, Sunday 03:00 (the maintainer's time, UTC+7; `0 20 * * 6` in UTC), in `.github/workflows/layout-loop.yml`, off until the repository variable `LAYOUT_LOOP_ENABLED` is `true` and the secret `LAYOUT_HELDOUT_SEED` is set. Clear of the fuzz, the audit and the digest.
- fuzz: nightly at 02:00 with `--budget 30m` and the seed left to the date, in a job with no push rights or secrets; a triage step reads the new files in the findings folder and turns each into an inbox finding.
