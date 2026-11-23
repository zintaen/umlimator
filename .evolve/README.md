# .evolve: the self-evolving loop's plan and records

This folder holds what the audit and fix loop follows and what it reports about its own plan. None of it ships: `package.json`'s `files` field publishes only `lib/`, `LICENSE` and `THIRD_PARTY_NOTICES.md`, and `tests/strategy-sync.test.mjs` checks that `npm pack` takes nothing from here. Changes to these files go through pull requests like code; the pinned strategy and the rules pointer change only by a pull request the maintainer merges.

| File | What it is | Who writes it |
| --- | --- | --- |
| `STRATEGY.md` | The auto-evolve strategy, pinned at a tagged version of the canonical private repository zintaen/auto-evolve-strategy. A header names the version, the tag's commit, the date pinned and a hash of the text; below it the upstream file follows byte for byte. Agents follow this copy, never a newer upstream text. | Only `node tools/evolve/strategy-sync.mjs update`, by a pull request the maintainer merges. Never edited in place. |
| `strategy-feedback.md` | Problems with the strategy itself found while running the loop (A12): date, round, rule, what happened, evidence and a proposed change, in an Open and a Closed list. | The combine step appends entries; `strategy-sync.mjs propose` moves them to Closed with the upstream pull request's number. |
| `MAPPING.md` | Where each file the strategy's A7.5 names lives in umlimator, what was created for it, and what does not apply, with the A10 setup checklist's status. | Agents, by pull request. |
| `rules.md` | The rules file pointer: where umlimator's standing rules live today (gate commands, identity, merge rules, protected files, models, ceilings) and the entries still open. | Agents draft by pull request; only the maintainer merges. |
| `decisions.md` | The decision queue for questions this setup leaves to the maintainer. | Agents ask; the maintainer answers. |
| `STOP` | The kill switch. It does not exist while the loop may run. | Any approver, on main. |

## The kill switch

To stop the loop, commit a file `.evolve/STOP` to main, with a line saying who stopped it, when and why. Every session, scheduled job and round template runs `node tools/evolve/killswitch.mjs --ref origin/main` first (after `git fetch`), and the orchestrator runs it again before every step (C3 step 3): exit 1 means stop. While it is set, only a confirmed hotfix or the pulling of a bad release that is already pending may go on (A8.5). A ref that cannot be read counts as stopped. To start again, the maintainer deletes the file on main. Where the rules file puts the kill switch beside the lease instead, `killswitch.mjs --file <path>` checks that file.

## Session start

A session that runs the loop (orchestrator, watcher, or a scheduled job) begins with, in this order: the kill switch as above; `node tools/evolve/strategy-sync.mjs check`, which compares the pinned version with the newest upstream tag (exit 1 on a newer version, on a copy edited in place, or when upstream cannot be reached); then `node tools/evolve/lease.mjs take` (the orchestrator) or `check` (a scheduled job). The round templates in `tools/evolve/templates/` run the same checks in their first step. See `tools/evolve/README.md` for each tool.

## Sending lessons upstream

At each batch to main, `tools/evolve/templates/batch.js` has an independent reviewer read `strategy-sync.mjs propose --dry-run`, then runs `propose`, which opens one pull request against zintaen/auto-evolve-strategy with the edited STRATEGY.md, a changelog entry and the evidence. No agent merges it. When the maintainer tags a new version, `strategy-sync.mjs update` opens the umlimator pull request that pins it.
