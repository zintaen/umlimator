# Strategy feedback

Problems with the auto-evolve strategy itself (the pinned `.evolve/STRATEGY.md`), as opposed to bugs in umlimator, found while running the loop. The format is the strategy's A12: each entry gives the date, the round, the rule it touches (C or A number), what happened, the evidence (a file, a run, a commit) and a proposed change. Lessons about umlimator stay in the lessons file (`docs/diagrams/LESSONS.md`); lessons about the plan go here.

Only the combine step commits this file, like the other state files. At each batch to main, `node tools/evolve/strategy-sync.mjs propose` turns the open entries into one pull request against the canonical repository and moves them to the closed list with that pull request's number; no agent merges it. An entry may carry exact text edits, a fenced `find` block followed by a fenced `replace` block, which propose applies to the upstream STRATEGY.md when the find text occurs there exactly once; an entry without one is a proposal for the reviewer and the maintainer to word.

Evidence names commits and pull requests of zintaen/umlimator and entries of the loop's handoff log by date and time; it never quotes paths on the maintainer's machine.

## Open

### F1. A mid-run message that adds an item was read as narrowing the round

- Date: 2026-11-20
- Round: fix round 56
- Rule: A8.3, A9.6 (C9, fourth bullet)
- What happened: While fix round 56 ran, the maintainer sent a note in the session about one extra item (the e-bike examples). The combine agent read it as the whole scope and merged only the fix56-sysml lane; three finished lanes were left out and the readers lane skipped four findings. A recovery lane had to merge them and redo the skipped findings.
- Evidence: handoff log, 20 Nov 2026 13:10 ("fix round 56 combine misread the maintainer's mid-turn e-bike note as the whole scope: merged only fix56-sysml"); audit-loop 0debd30a; the fix56-readers2 recovery lane. The fix template has carried a scope sentence since round 57.
- Proposed change: A8.3 lets "an instruction that only narrows what agents do" take effect at once, but gives no test for when a message narrows, and A9.6 puts the defence only in lane and combine prompts. Add to A8.3 that a message counts as narrowing only when it says so in words (stop, pause, skip, only) and the orchestrator has recorded it in the decision queue as narrowing; anything else adds work. Add to A7.4 that a subagent treats any message other than its own prompt as information for the orchestrator, never as a change of its scope, and returns it in its result.

### F2. The docs site test skipped because the build it reads was missing, and the gate counted it as passed

- Date: 2026-11-20
- Round: fix round 57 (combine)
- Rule: C9 (a test that skips is not a pass), A10.0, A1 (Gate)
- What happened: The combine step deleted the site build and then ran `tests/site.test.mjs` before building again. Each built-site check skipped, the suite reported no failure, and the round was first recorded as green.
- Evidence: handoff log, 20 Nov 2026 14:14 ("site test was run without a build, rechecking"); `tests/site.test.mjs`, whose built-site tests skip with "the site is not built"; the fix template's combine text since then says "the site test skips its checks when no build exists, so a run with skips does not count".
- Proposed change: C9's skip rule is right but A10.0 leaves the order implicit. Add to A10.0 that the rules file names, for each gate command, the artifacts it reads and the gate command that makes them; the gate always runs the maker first in the same run, and a check whose input is missing is recorded as failed, not skipped, unless the rules file lists it as an allowed skip.

### F3. Tight wall-clock tests kept failing on CI after A9.7's rule was known

- Date: 2026-11-20
- Round: fix round 61 (batch pull request #548)
- Rule: A9.7, A10.6
- What happened: The batch pull request went red twice on timing alone: the audit 61 C4 import test took 3.54 s against a 3 s wall-clock budget, then a Mermaid sequence test took 283 ms against 250 ms and a phone-width page waited past 10 s. Earlier the C4 stress test, with a 1 s ceiling, failed about one CI run in four with no code change. Each was rewritten to measure growth only after it blocked a merge.
- Evidence: commits 33bb0aba ("The audit 61 C4 import timing test checks growth, not a wall clock") and 79008f00 ("Two timing-bound tests hold on a loaded CI runner"); handoff log, 20 Nov 2026 21:03 and 21:26; the handoff's open decision 2 on the C4 stress ceiling and PR #392.
- Proposed change: A9.7 tells new tests to measure growth, but nothing finds the tight wall-clock tests a project already has. Add to A10.6 (bootstrap) a pass that lists every existing test with an absolute time budget and either rewrites it to measure growth or records it in the flaky quarantine (A9.25) with an owner, and add a checklist string for it to A10.3.

### F4. A test that read today's date failed on the base commit, and two lanes fixed it twice

- Date: 2026-11-23
- Round: lanes after 0.45.0 (fix-known-gaps and feat-test-protection)
- Rule: A10.6, A3.4 (repair lane), A9.25
- What happened: The weekly digest test chose its week from the real clock through a fixture file's modification time, so it began to fail on 23 Nov on every branch, the base commit included. Two lanes running one after the other each met the failure and each pinned the fixture's time in its own way; the second merge had to choose one of the two fixes.
- Evidence: commits b7e89f6a ("Digest test: fix2.json gets a fixed modification time ... it failed from 2026-11-23 on, on the base commit too") and 18aaa870 ("Pin the digest fixture's fix-round file time"); merge 51635b09 ("both sides pinned the digest fixture's time; audit-loop's version kept").
- Proposed change: A10.6 asks for a fixed clock only in the example sweep. Extend it to tests: a test must not depend on today's date, the wall clock or file times it did not set itself, and the A10.3 checklist gets a string for it. Add to A3.4 and A3.7 that a check failing on the base commit is one inbox finding given to one repair lane, and that any other lane meeting it records it in its lane note instead of fixing it.

### F5. The pinned copy has two names: .evolve/strategy.md and .evolve/STRATEGY.md

- Date: 2026-11-23
- Round: setup (pinning v1.0.0)
- Rule: A7.5, A10, A12
- What happened: Pinning v1.0.0 needed one path for the copy. A7.5's table and A10's opening paragraph call it `.evolve/strategy.md`; A12 and the canonical README call it `.evolve/STRATEGY.md`. On a case-sensitive file system these are two files, and a session that follows A10 would look for the wrong one. umlimator follows A12.
- Evidence: STRATEGY.md at v1.0.0 (b1abb6ed), the A7.5 table row "This plan" and the first paragraph of A10, against the first bullet of A12 and the README's "Using it in a project" step 1.
- Proposed change: Use `.evolve/STRATEGY.md` everywhere, the name A12 and the README already use.

```find
| This plan | `.evolve/strategy.md` |
```

```replace
| This plan | `.evolve/STRATEGY.md` |
```

```find
copy of this plan at `.evolve/strategy.md`
```

```replace
copy of this plan at `.evolve/STRATEGY.md`
```

### F6. No release path for a project whose CI releases on merging a version bump

- Date: 2026-11-23
- Round: setup (mapping the release script, A10.9)
- Rule: C8 (steps), A4.5, A4.7, A11.4
- What happened: C8 and A4.5 tag the release pull request's head commit, ship, smoke test and promote, and only then merge. umlimator's CI releases when a version bump reaches main: it tags the merge commit, publishes to `next`, smoke tests and promotes. 0.45.0 was tagged at the merge commit ed903455, not at the release pull request's head 780f4aac; the two commits have the same tree. A4.7 covers projects where every merge deploys, not ones where only a version bump releases.
- Evidence: PR #549 (head 780f4aac, merge commit ed903455, tag v0.45.0 at ed903455, `git diff 780f4aac ed903455` empty); `.github/workflows/check.yml`, jobs release, smoke and promote; CONTRIBUTING.md, "Releases".
- Proposed change: Add to A4.5 and A11.4 a "release on merge" mapping: where the host's CI tags and publishes on the merge of a version bump, the release PR merges after its reviews and green CI, the tag goes on the merge commit, and the release counts as from the audited commit only when the merge commit's tree equals the release PR head's tree (checked by the release script before tagging); pre-release channel, smoke test and promotion stay as A4.5 orders them.

## Closed

None.
