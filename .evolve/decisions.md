# Decision queue

Questions agents leave for the maintainer (C9, A10.10). Each entry has a status: open, answered, withdrawn or deferred. Agents act only on answered entries, and keep to the stricter rule meanwhile; silence is never approval. An answer counts when the maintainer writes it under the entry in a commit they make, or in a comment from their account that the entry links to. Older open decisions stay at the top of the handoff log until the maintainer moves them here.

## D1. Schedules for the loop's jobs

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.11)
- Question: When and by what does each job start? Proposed defaults (`tools/evolve/README.md`): nightly fuzz at 02:00 with a 30-minute budget, the weekly digest Monday 09:00, the weekly audit Monday 03:00 once the loop is in maintenance mode, an hourly watcher that takes an expired lease, and the weekly dependency and upstream check on the digest day. Until answered nothing is scheduled, and the orchestrator runs due jobs itself at session start (C3 step 7).
- Layout loop (decided by default, 2026-11-26, with step 12 of `docs/diagrams/notes/layout-flow.md`): the weekly propose-measure-keep loop for `src/layout/tune.js` runs Sunday 03:00 UTC+7 (cron `0 20 * * 6`, Saturday 20:00 UTC), clear of the fuzz at 02:00, the audit at Monday 03:00 and the digest at Monday 09:00, by `.github/workflows/layout-loop.yml`, which stays off until the repository variable `LAYOUT_LOOP_ENABLED` is `true` and the secret `LAYOUT_HELDOUT_SEED` is set. The other jobs' times above stay open.
- 2026-11-27: the maintainer set `LAYOUT_LOOP_ENABLED` to `true` and the secret `LAYOUT_HELDOUT_SEED`, so the layout loop runs.

## D2. A bot account for automated pushes

- Status: answered
- Asked: 2026-11-23, by the apply-strategy lane (A10.1, A9.17)
- Question: Agents now commit under the maintainer's name and push with the maintainer's account, so the code host cannot tell an agent's push from the maintainer's. Should a separate bot account (with push rights to lane, batch and integration branches only) be created? Until answered, only host review approvals and the maintainer's own comments count as answers.
- Answer: no bot account for now; agents keep committing and pushing under the maintainer's name and account. Answered: 2026-11-27, by the maintainer in the orchestrating session; recorded by Claude.

## D3. Where the weekly digest goes

- Status: open
- Asked: 2026-11-23, by the apply-strategy lane (A10.10)
- Question: A pinned issue, a comment on the open batch pull request, an email draft, or a file in the handoff folder the maintainer reads?

## D4. Model versions, spending ceilings and outside services

- Status: answered
- Asked: 2026-11-23, by the apply-strategy lane (A10.1, A8.4, A8.8, A9.19, A9.25)
- Question: Name the exact model versions for finders, verifiers, lanes, combine and reviewers and the two-model rotation set; the spending ceiling per run and per week; confirm that code and test data go only to the agents' model provider and GitHub; and approve a flaky-test quarantine file with an owner and a two-week expiry per entry.
- Answer: no spending ceiling; the models stay as they are (audits rotate Sonnet and Opus between finders and verifier; lanes and combine run on the session model); code and test data go only to Anthropic and GitHub, as today. The quarantine file is not approved, so a flaky test is still fixed, not quarantined. Answered: 2026-11-27, by the maintainer in the orchestrating session; recorded by Claude.

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

## D12. diff() stable by default

- Status: answered
- Asked: 2026-11-22, by the layout-flow note (`docs/diagrams/notes/layout-flow.md` section 13, question 4)
- Question: Should `diff()`, `umlimator.py diff` and the diff Action lay the model after out against the model before by default, which changes diff pictures?
- Answer: On 2026-11-24 the maintainer left this to the recommended default (the handoff's `evolve-plan.md`, "Maintainer decisions"). The recommended default is yes, and step 14 of the note builds it: `diff()` returns `stableFrom` unless given `stable: false`, `umlimator.py diff` draws against the model before unless given `--no-stable`, and the Action's `stable` input defaults to `true`. A view whose stable picture draws worse than a fresh one is still drawn fresh.

## D13. arrange "flow" by default for imported and map-repo maps

- Status: deferred
- Asked: 2026-11-22, by the layout-flow note (`docs/diagrams/notes/layout-flow.md` section 13, question 2)
- Question: Should `arrange: "flow"` become the default for maps written by the map-repo skill and by `umlimator.py import`?
- Answer: On 2026-11-24 the maintainer left this to the recommended default (the handoff's `evolve-plan.md`, "Maintainer decisions"). Measured in step 14, the recommended default is not yet. With the layout score (`src/layout/score.js`, lower is better), the import fixtures' eight views total 4387.48 ranked and 5429.49 arranged, and five of them take layout check problems arranged (12 in all) where the ranked layout has none; the example monorepo's two map views total 2460.43 ranked and 2748.18 arranged. So `umlimator.py import` takes `--arrange` (opt-in), and the map-repo skill does not set the field. On 2026-11-26 the causes were fixed in the flow layout (the layout-flow note's step 14 lists them) and the eight views joined the score's fixed corpus as `bench/models/a8.json` (laid out as the page draws them): arranged they total 4560.74 against 4387.48 ranked, 4522.75 as the page draws them, and take 4 check problems in Chrome that the ranked layout has not (12 before): `checkout.mmd`'s line into its store straight down, `meals.mmd`'s label on its store's short line, and on `integration.dsl`'s containers view a detour and a box title crossed; the monorepo's map views total 2338.88 arranged against 2460.43 ranked. Still short of the bar, so the default stays opt-in. Revisit when the arranged layout scores no worse on those views and draws no new check problem on them: then `import` sets it by default (with `--no-arrange`), the skill's model sets it on each view, and it reaches the skill's users when the skill's pin moves to the release that has it.

## D14. When focused mode ends

- Status: answered
- Asked: 2026-11-27, by the orchestrator, after audits 67 to 70 each confirmed 7 to 15 findings, most of them old ones reached for the first time
- Question: Keep "two audits in a row with 0 high, 0 medium, fewer than 5 low and 0 failed agents", count only what the last round caused, or gate on severity only?
- Answer: zero bugs. Focused mode ends only after two audits in a row confirm no finding at all (no high, medium or low) with 0 failed agents; every confirmed finding, low ones included, is fixed in the next round. Releases still follow the release rule (an audit with 0 high and 0 medium). Answered: 2026-11-27, by the maintainer in the orchestrating session (an earlier answer the same day, severity only, was replaced); recorded by Claude.

## D15. The batch pull request before the loop ends

- Status: answered
- Asked: 2026-11-27, by the orchestrator
- Question: Open the `audit-loop` to main batch pull request every ten rounds while the loop runs, or only once it ends?
- Answer: every ten rounds while the loop runs; the next one holds audits 63 to 70. Answered: 2026-11-27, by the maintainer in the orchestrating session; recorded by Claude.

## D16. Regenerating the bench expect files

- Status: answered
- Asked: 2026-11-27, by the orchestrator, for a correct layout fix that moves a recorded bench view
- Question: May a lane regenerate `bench/expected.json` and `bench/score-expected.json`?
- Answer: yes, only when the layout score improves or holds and no view gains a hard issue; the pull request names each moved view and why. Otherwise the fix is skipped and the moved views are reported. Answered: 2026-11-27, by the maintainer in the orchestrating session; recorded by Claude.
