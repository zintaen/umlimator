# Mapping the strategy onto umlimator

How the pinned strategy (`.evolve/STRATEGY.md`, v1.0.0) lands in this repository: for each file A7.5 names, where it lives here, whether this change created it, or why it does not apply yet; then the status of each step of A10's setup checklist. A7.5 allows its paths to change when the rules file records the change; `.evolve/rules.md` points here for that record.

All of umlimator's loop sessions run on one machine, so A7.5 lets the mutable runtime state sit beside the repository. It does: the loop's handoff folder (on the maintainer's machine, outside every checkout; the round templates take its path as `args.state`) holds the handoff log, audits, fix records, backlog and repro scripts, and this change leaves them there. What A7.5 says must be in the repository (the plan, the rules file, the templates and the decision queue) is here now; the roadmap is the one exception, queued as decision D7.

## A7.5 files

| A7.5 artifact | Default path | Where it lives in umlimator | Status |
| --- | --- | --- | --- |
| This plan | `.evolve/strategy.md` | `.evolve/STRATEGY.md`, A12's name for it (A7.5 and A12 disagree on the case: strategy feedback F5) | Created now, pinned at v1.0.0 |
| Kill switch | `.evolve/STOP` on main | `.evolve/STOP` on main, checked by `tools/evolve/killswitch.mjs` | Handling created now; the file exists only while the loop is stopped |
| Rules file | `.evolve/rules.md` | `.evolve/rules.md`, a pointer to where each rule lives today (CONTRIBUTING.md, the templates' rule blocks) with the entries still open | Created now |
| Roadmap | `.evolve/roadmap.md` | The handoff folder's `evolve-plan.md` (the plan after 0.45.0, written by the maintainer) | Not moved: this change keeps handoff files where they are; decision D7 |
| Handoff | `.evolve/handoff.md` | The handoff folder's `HANDOFF.md`, an append-only log with the open decisions at its top | Exists; it has no current-state block with a `state:` line yet (D7) |
| Handoff archive | `.evolve/handoff-archive/YYYY-MM.md` | None: `HANDOFF.md` keeps the whole log | Does not apply until the weekly pass exists (D1) |
| Lessons | `.evolve/lessons.md` | `docs/diagrams/LESSONS.md` | Exists (tools/evolve lane) |
| Audit results | `.evolve/audits/auditN.json` | The handoff folder's `audits/auditN.json` (rounds 1 to 64); `tools/evolve/ledger.mjs` and `digest.mjs` read them | Exists |
| Fixed-findings ledger | `.evolve/fixed.md` | The handoff folder's `fixed.md`, one line per fixed finding, written by the fix template's combine step from round 65 on; earlier rounds are in `audits/` and the lane reports `fixN.json`, which `ledger.mjs` reads | Location set now; the file starts with the first combine under the new template |
| Backlog | `.evolve/backlog.md` | The handoff folder's `backlog.md` | Exists |
| Inbox | `.evolve/inbox.md` | The handoff folder's `inbox.md`; the audit template reads it when it exists | Location set now; created when the first signal arrives (fuzz, bug agent, CI) |
| Fitness candidates | `.evolve/fitness.md` | None yet | Does not apply until the layout-by-flow fitness loop exists (`docs/diagrams/notes/layout-flow.md`) |
| Fuzz and real-input corpora | `.evolve/corpus/` | `tests/import/`, `tests/import/hostile/` and `tests/fixtures/`, read by `tools/evolve/fuzz.mjs`; a run's findings go to `.evolve/fuzz/`, which git ignores | Exists |
| Fitness held-out corpus | outside the repository | None yet | Does not apply until the fitness loop exists |
| Known gaps | `.evolve/known-gaps.md` | The "Known gaps" list in the newest release section of `docs/module-api.md` (lanes keep it current; the release notes are that section) | Exists |
| Flaky test quarantine | `.evolve/flaky.md` | None: known flakes are notes in `HANDOFF.md` | Not created; the rules for it wait on D4 (owners and expiry need the maintainer) |
| Decision queue | `.evolve/decisions.md` | `.evolve/decisions.md` for new questions; older open decisions stay at the top of `HANDOFF.md` until the maintainer moves them | Created now |
| Weekly digests | `.evolve/digests/YYYY-WW.md` | `node tools/evolve/digest.mjs --out <file>`; where the digest goes is D3 | Tool exists; not scheduled (D1) |
| Incoming results of scheduled jobs | `.evolve/incoming/` | Beside the lease in the orchestrator's checkout (one machine, state not pushed) | Does not apply until a scheduled job exists (D1) |
| Templates | `.evolve/templates/` | `tools/evolve/templates/` (`audit.js`, `fix.js`, `batch.js`, `release.sh`) with `checklist.md`; the maintainer asked for this path, and it keeps `.evolve/` to plan and records | Created now (D8) |
| Round scripts | `.evolve/rounds/` | The handoff folder's `workflows/` and the per-round copies in the orchestrator's checkout | Exists |
| Repro scripts | one shared directory outside every agent worktree | The handoff folder's `repro/` (the templates use `repro/<round>/`), never committed | Exists |

The lease (A9.4) is `.evolve/lease.json` in the orchestrator's checkout, ignored by git, managed by `tools/evolve/lease.mjs`.

## A10 setup checklist

| Step | Status in umlimator |
| --- | --- |
| 0. Tooling and gate | The gate commands are in `.evolve/rules.md`. Open: a secret scanner over the merged diff (D9), and a written rule for reading each command's counts. |
| 1. Rules file and identity | `.evolve/rules.md` points at the current rules. Agents commit under the maintainer's name and push with the maintainer's account, so A10.1's push-account test does not count for that account; a bot identity is D2. Model versions and spending ceilings are D4. |
| 2. Files of A7.5 | Done by this change as mapped above. `.evolve/` is excluded from the package by `package.json`'s `files` field (checked by `tests/strategy-sync.test.mjs`). The integration branch audit-loop exists. The one-off triage of open bug issues is the bug agent's job (`.github/workflows/bug-agent.yml`, off until the maintainer enables it). |
| 3. Templates and checklist | Done: `tools/evolve/templates/` and `checklist.md`, checked by `tests/strategy-sync.test.mjs`. |
| 4. Audit areas | Eight areas, written in `tools/evolve/templates/audit.js`. Open: their path globs and the skip list in the rules file (D10). |
| 5. CI | Done before this change: `.github/workflows/check.yml` runs the full checks on every pull request and weekly. |
| 6. Bootstrap | Done before this change: the test suites, the protected core tests (`tests/protected.json`), the examples and `bench/expected.json`. |
| 7. Fuzzers and corpus | `tools/evolve/fuzz.mjs` over the importers. Open: the list of upstream formats and dependencies to watch (D10). |
| 8. Fitness score | Not yet: designed in `docs/diagrams/notes/layout-flow.md`. |
| 9. Release script and delivery mapping | CI's release, smoke and promote jobs and `tools/evolve/templates/release.sh`. The mapping tags the merge commit, not the release PR's head: D5 and strategy feedback F6. |
| 10. Circuit breakers and digest | `tools/evolve/ledger.mjs` and `digest.mjs`. Open: the digest's channel (D3). |
| 11. Schedules | None yet: D1 (proposed defaults in `tools/evolve/README.md`). |
| 12. Focused mode | The loop runs in focused mode (audit 65 is next). |
