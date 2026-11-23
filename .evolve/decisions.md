# Decision queue

Questions agents leave for the maintainer (C9, A10.10). Each entry has a status: open, answered, withdrawn or deferred. Agents act only on answered entries, and keep to the stricter rule meanwhile; silence is never approval. An answer counts when the maintainer writes it under the entry in a commit they make, or in a comment from their account that the entry links to. Older open decisions stay at the top of the handoff log until the maintainer moves them here.

## D1. Schedules for the loop's jobs

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.11)
- Question: When and by what does each job start? Proposed defaults (`tools/evolve/README.md`): nightly fuzz at 02:00 with a 30-minute budget, the weekly digest Monday 09:00, the weekly audit Monday 03:00 once the loop is in maintenance mode, an hourly watcher that takes an expired lease, and the weekly dependency and upstream check on the digest day. Until answered nothing is scheduled, and the orchestrator runs due jobs itself at session start (C3 step 7).

## D2. A bot account for automated pushes

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.1, A9.17)
- Question: Agents now commit under the maintainer's name and push with the maintainer's account, so the code host cannot tell an agent's push from the maintainer's. Should a separate bot account (with push rights to lane, batch and integration branches only) be created? Until answered, only host review approvals and the maintainer's own comments count as answers.

## D3. Where the weekly digest goes

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.10)
- Question: A pinned issue, a comment on the open batch pull request, an email draft, or a file in the handoff folder the maintainer reads?

## D4. Model versions, spending ceilings and outside services

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.1, A8.4, A8.8, A9.19, A9.25)
- Question: Name the exact model versions for finders, verifiers, lanes, combine and reviewers and the two-model rotation set; the spending ceiling per run and per week; confirm that code and test data go only to the agents' model provider and GitHub; and approve a flaky-test quarantine file with an owner and a two-week expiry per entry.

## D5. Release tagging: the merge commit, not the release PR's head

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (C8, A4.5)
- Question: CI tags and publishes the merge commit of a version bump; C8 tags the release PR's head and merges last. 0.45.0's merge commit had the same tree as the PR head, so nothing unaudited shipped. The release template now refuses to merge when main has commits the PR lacks and checks the trees after the merge. Keep this mapping (and the strategy feedback F6 asks upstream to allow it), or change CI to tag the PR head before merging?

## D6. Lanes write the changelog

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (C4 step 3)
- Question: C4 step 3 keeps lanes out of the changelog; umlimator's rule has each lane add a line to the unreleased section of `docs/module-api.md`. The templates keep umlimator's rule for now. Keep it, or move the unreleased lines to the combine step or the release agent?

## D7. The roadmap and the current-state block

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A7.5, C3 step 4)
- Question: A7.5 puts the roadmap in the repository (`.evolve/roadmap.md`, maintainer only) and C3 reads a current-state block with a `state:` line (running, paused, stopped) from the handoff. Today the roadmap is the handoff folder's `evolve-plan.md` and `HANDOFF.md` has no such block. Move the roadmap into `.evolve/roadmap.md`, and add the block to the top of `HANDOFF.md`?

## D8. Use the templates in the repository

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A7.3, A7.5)
- Question: The round templates now live in `tools/evolve/templates/` (A7.5's default is `.evolve/templates/`; this path was the maintainer's). The orchestrator's older copies outside the repository are left unchanged. Confirm that from audit 65 on the orchestrator builds each round from the templates in the repository, with paths passed as `args`.

## D9. A secret scanner in the local gate

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.0)
- Question: A10.0 puts a secret scanner over the merged diff in the local gate. None is installed, and adding one is a dependency decision. Which tool, or a small script in `tools/` with a fixed pattern list?

## D10. Audit area globs, skip list and watched upstreams

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.4, A10.7, A4.2)
- Question: Approve the eight audit areas as path globs with a skip list (vendored `engine/`, generated `lib/` and `docs/types/`, lockfiles, icons, golden files), the list of upstream formats and dependencies to watch (Mermaid, Structurizr, BPMN, VitePress, the icon packs), and how the public surface is diffed (`lib/umlimator.d.ts`, the schema, `umlimator.py` flags).

## D11. The lane note in commit messages

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A1, A4.2)
- Question: The strategy's lane note is a trailer block in a lane's last commit message (`Lane-Note:`, `Kind:`, `User-visible:` and so on). umlimator's commits carry no trailers. The fix template writes the lane note as plain lines in the message and forbids attribution lines. Is that acceptable, or should the lane note live only in the lane's returned notes?
