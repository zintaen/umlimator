# tools/evolve: the self-evolving loop's tools

Five command-line tools for the audit and fix loop, written in Node with no dependency, plus the lessons file they feed. None of them is scheduled yet: the maintainer decides the times (proposed below). Each exits 0 when all is well, 1 when it has something to report (a refused lease, a tripped breaker, a new fuzz finding) and 2 on a usage error, so a scheduler or a script can act on the exit code alone. Tests: `node --test tests/evolve.test.mjs`.

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
node tools/evolve/digest.mjs --audits <folder> [--fixes <folder>] [--repo .] [--date YYYY-MM-DD] [--days 7] [--trend 8] [--gaps docs/module-api.md] [--out digest.md]
```

Writes Markdown with: the rounds of the week and their fix rounds (lanes, findings fixed and skipped); a table of findings by severity over the last `--trend` rounds; the releases (git tags made in the week) and the commits and merged pull requests of the checked-out branch; the circuit breakers; the open known gaps (the last "Known gaps" item of `--gaps`); and a spot check of 2 or 3 rejected findings with the verifier's reason. The spot check is picked at random with the date as the seed, so the same date always picks the same findings. A round's date is its audit file's `date`, `started` or `finished` field, else its first commit whose subject starts "Audit <N>", else the file's modification time.

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

## LESSONS.md

[`docs/diagrams/LESSONS.md`](../../docs/diagrams/LESSONS.md) holds what went wrong in the loop and the rule that prevents it. Each round that goes wrong in a new way adds an entry, and the round templates are updated from it.

## How each would be scheduled

Nothing is scheduled by this change. The proposed defaults, for the maintainer to confirm:

- lease: no schedule of its own. Every session runs `take` at start, `renew` every 15 minutes and before each push, and an hourly watcher runs `check` and takes the lease only when it has expired.
- ledger: no schedule of its own; the orchestrator runs it after each audit is saved and stops on exit 1.
- digest: weekly, Monday 09:00 (the maintainer's time), `--date` set to that day, the output sent to the maintainer.
- fuzz: nightly at 02:00 with `--budget 30m` and the seed left to the date, in a job with no push rights or secrets; a triage step reads the new files in the findings folder and turns each into an inbox finding.
