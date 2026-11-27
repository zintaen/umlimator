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

### F7. A lane merged by fast-forward cannot be reverted with revert -m 1, and stays an ancestor after its revert

- Date: 2026-11-24
- Round: fix round 65 (combine)
- Rule: A3.4, A8.6
- What happened: The integration branch was still at the base commit, so merging the first lane (fix65-assoc, one commit) was a fast-forward and made no merge commit. When the gate then failed on that lane, the prescribed `git revert -m 1 <merge>` had nothing to point at; the lane's own commit was reverted instead. After that revert, `git merge-base --is-ancestor origin/fix65-assoc HEAD`, the check A3.5 uses to prove a lane merged, is still true for a lane that is not in the tree.
- Evidence: audit-loop e92f9ad8 (fast-forwarded) and its revert 9eb52af5; handoff log, 24 Nov 2026, fix round 65 combine.
- Proposed change: In A3.4, merge each lane with `--no-ff`, so every lane has a merge commit to revert and bisect over. In A3.5, a lane counts as merged when it is an ancestor of the integration head and no later commit on the integration branch reverts its merge.

### F8. The local gate ran a different interpreter version from CI and failed on the base commit

- Date: 2026-11-24
- Round: fix round 65 (combine)
- Rule: A1 (Gate), A10.0, C9
- What happened: `python3` on the machine running the combine is Python 3.14, while CI pins 3.12. Two existing checks that expect a deeply nested JSON line to be a parse error (audit 20) fail on 3.14, whose parser accepts it: `tests/cli.py` failed one check at the baseline, and `tests/mcp.py` stopped with a TypeError. Neither is a umlimator regression. The combine reran the gate with Python 3.13, where both pass, and recorded it.
- Evidence: audit-loop 135f6117 (baseline, no lane merged); `.github/workflows/check.yml`, `python-version: "3.12"`; handoff log, 24 Nov 2026, fix round 65 combine.
- Proposed change: Add to A10.0 that the rules file names the interpreter and runtime versions the gate uses, taken from the CI configuration, and the gate command runs those versions (or records a mismatch as a gate failure of the environment, not of a lane). A check that fails on the base commit only because of the local version goes to the inbox as one finding, as F4 proposes for date-bound checks.

### F9. Lanes ran only their own tests, and a repository-wide guard test cost two whole lanes at combine

- Date: 2026-11-27
- Round: fix round 66 (combine)
- Rule: A3.3, A3.4, A8.6
- What happened: Two of five lanes (fix66-layout, five findings, and fix66-stories, five findings) each added a test that reads a model from `examples/`. `tests/showcase.test.mjs`, a guard over every test file, fails on any such read outside its allowed list. Each lane ran only the suites it touched, so neither saw the failure; the combine gate did, and A8.6 sent both lanes back, crash fixes included, for a one-line change each (pin the model under `tests/fixtures/`). The same round also met F7 again: the first lane fast-forwarded the integration branch and its revert had to be a plain revert.
- Evidence: lane commits 57ea1465 and 17109555; audit-loop reverts 1c4c27d9 and aeb9a846; handoff log, 27 Nov 2026, fix round 66 combine.
- Proposed change: Add to A3.3 that a lane runs the project's fast whole-repository checks (the rules file names them: guard tests that scan the tree, such as test-placement and protected-test checks) on its branch before it pushes, and records the result in its lane note. Add to A3.4 that combine runs those checks on each lane branch before merging it, and returns a lane that fails one as not merged with that check, before any lane is merged, so no bisect or revert is needed for it.

### F10. Two lanes edited the same existing line of an append-only file, and "keep both sides" duplicated it

- Date: 2026-11-27
- Round: fix round 66 (combine)
- Rule: A3.4 (conflicts in append-only files)
- What happened: fix66-stories and fix66-types each reworded the same existing bullet in the unreleased list of `docs/module-api.md`. The conflict was in an append-only file, so the combine kept both sides, which left the bullet twice in two wordings; when fix66-stories was later reverted, the revert conflicted on that same hunk and had to be resolved by dropping that lane's lines.
- Evidence: audit-loop merge 15541b84 (fix66-types) and revert aeb9a846; handoff log, 27 Nov 2026, fix round 66 combine.
- Proposed change: In A3.4, "keep both sides" applies only to hunks where each side adds lines and neither changes or removes a line both sides share. A conflict where both sides edit the same existing line of an append-only file is treated as a code conflict: the later lane is returned as not merged, reason `conflict`, and the conflict-retry lane of the next round merges it.

### F11. The kill-switch check ran from a stale checkout, crashed, and its crash exits with the same code as "stop"

- Date: 2026-11-27
- Round: fix round 67 (combine)
- Rule: C3 step 3, A7.4 (kill switch), the combine task's step 0
- What happened: The combine task runs `node tools/evolve/killswitch.mjs --ref origin/main` in the main checkout after `git fetch`. That checkout's working tree sat at an old commit of main (6b285001) that has no `tools/evolve/killswitch.mjs`, so node stopped with MODULE_NOT_FOUND and exit code 1. Exit 1 is also the script's "the kill switch exists" answer, so read literally the round had to stop although origin/main (4230e050) has no `.evolve/STOP`. The combine ran the same script from the integration worktree instead, which answered "no .evolve/STOP" with exit 0.
- Evidence: origin/main 4230e050; handoff log, 27 Nov 2026, fix round 67 combine.
- Proposed change: In C3 step 3, check the kill switch without depending on any working tree: `git fetch` then `git cat-file -e <main ref>:.evolve/STOP` (present means stop), or run the checker from the integration worktree. Give the checker a distinct exit code for its own failure (for example 3) and say in C3 step 3 that a checker failure is reported and retried from a fresh checkout, never read as "stop" or "go".

### F12. F9 again: two lanes broke checks outside their own suites, and both were reverted at combine

- Date: 2026-11-27
- Round: fix round 67 (combine)
- Rule: A3.3, A3.4, A8.6 (same as F9, and F7 for the revert)
- What happened: fix67-stories registered flow roles for `uml.interaction-overview`, and `tests/flow-defaults.test.mjs` (which checks that `umlimator.py`'s FLOW_TYPES lists every type with flowRole or zoneOf) failed at combine; the lane had run nine suites but not that one. fix67-mcp turned NaN and Infinity tool arguments into a -32700 parse error, and the existing audit 37 check in `tests/cli.py`, which expects those arguments to reach the tool and be refused there, failed; the lane ran `tests/mcp.py` only. Both lanes' own tests did fail without their fixes. The combine reverted both, five findings in all (2, 3, 4, 7, 8). fix67-stories had fast-forwarded the integration branch, so its revert was a plain revert, as F7 describes.
- Evidence: audit-loop reverts 77f6cf09 (fix67-mcp merge 8ad70d46) and 58f84ab8 (fix67-stories commit 25889400); handoff log, 27 Nov 2026, fix round 67 combine.
- Proposed change: As F9 proposes, and in addition: a lane that changes what a type registers (a type's flowRole, zoneOf or similar entry) or what an entry point accepts runs every suite that greps for that name or calls that entry point, and the lane template lists how to find them (for the MCP server, `tests/cli.py`'s mcp part as well as `tests/mcp.py`).

### F13. F9 a third time: a comment naming an `examples/` file failed the repository-wide guard, and the lane was reverted

- Date: 2026-11-27
- Round: fix round 68 (combine)
- Rule: A3.3, A3.4, A8.6 (same as F9 and F12)
- What happened: fix68-layout pinned its new test on a copy under `tests/fixtures/`, as F9's case taught, but the test's comment said the fixture was a copy of `examples/buy-book-overview.json`. `tests/showcase.test.mjs` matches showcase reads by text, so the comment alone failed it at combine. The lane had run nine suites, not that one. The combine bisected, reverted the merge and returned the lane with its three findings (two crossings and one warning), for a one-line comment change.
- Evidence: lane commit 51c1a475; audit-loop merge 2c3f373d and its revert b79ac485; handoff log, 27 Nov 2026, fix round 68 combine.
- Proposed change: F9's proposal, made binding: the lane template names the whole-repository guard suites and the lane runs them before it pushes; combine runs them on each lane branch before merging any lane, so a guard failure returns that lane alone without a bisect or revert. Three rounds in a row lost a lane this way, so this is worth a checklist string in A10.3.

### F14. The example sweep has no recorded command, so every lane and every combine writes its own

- Date: 2026-11-27
- Round: fix round 68 (combine)
- Rule: A9.3, A10.6 (bootstrap: the rules file records the example inputs and normalization)
- What happened: The rules file names no sweep command, output set or normalization, so the four lanes each wrote a sweep script with a different scope (storyFromFlow and storyFromDiff; layout, check() and validate(); layout, describe(), validate() and ER and Mermaid round trips; none), and the combine wrote a fifth. The combine's sweep matched the lanes' lists only after checking by hand which lane's lib reproduced each difference. Two lanes also wrote their scripts to the same scratch folder, and one overwrote the other's mid-run.
- Evidence: lane notes of fix68-stories, fix68-layout, fix68-uml and fix68-tools; handoff log, 27 Nov 2026, fix round 68 combine.
- Proposed change: In A10.6, require the rules file to name one sweep command (input globs, the functions it calls, the normalization such as dropping timing fields, and its output format) that lanes and combine both run, so lane notes and the combine diff use the same keys. In A3.3, say that each lane keeps its scratch files in a folder named after its branch.

### F15. Open entries F8, F11 and F14 recurred unchanged, because nothing carries an open entry's workaround into the next round's task text

- Date: 2026-11-27
- Round: fix round 69 (combine)
- Rule: A12, C3 step 3, A1 (Gate), A9.3 (same cases as F8, F11 and F14)
- What happened: The round 69 combine task again ran the kill switch from the main checkout, where `tools/evolve/killswitch.mjs` is missing and node exits 1 (F11); again named `python3`, which is 3.14 here and fails the audit 20 deep-JSON check in `tests/cli.py` at the baseline as well as after the lanes (F8), so the gate was rerun with Python 3.12 as CI pins; and again had no sweep command, so the combine wrote its own sweep (F14). Each workaround was already known and recorded, but the next round paid for it again, and read literally two of them say "stop" or "merge no lanes".
- Evidence: audit-loop baseline 7108d2b5 and merges ccdfb0ee and 8c72d43a; origin/main 4230e050; handoff log, 27 Nov 2026, fix round 69 combine.
- Proposed change: In A12, say that while an entry is open the orchestrator puts its workaround in the task text of every later round it applies to (for example "run the kill switch from the integration worktree", "run the Python checks with the CI version"), and lists the open entries it applied in the round's handoff entry, so a known strategy gap costs one round, not every round until the batch.

### F16. A lane's own new test failed on its pushed commit, and only the full gate after the merge found it

- Date: 2026-11-27
- Round: fix round 70 (combine)
- Rule: A3.3, A3.4, A8.6 (and F15 for the recurrences)
- What happened: fix70-tools reported its new tests passing (tests/evolve.test.mjs 33/33), but on its pushed head the test "no script decides it is the main module by comparing process.argv[1] with its URL as they are ... (audit 70)" fails: the header comment on line 1 of its new tools/main.mjs names both process.argv[1] and import.meta.url, and the test's line scan reports it. The lane most likely ran the suite before tools/main.mjs was tracked, since the scan reads git ls-files. A3.4's pre-merge check runs a lane's tests only at the base, where they must fail, and never on the lane's own commit, where they must pass, so the failure surfaced in the full gate after the merge and cost a revert of the whole lane: five findings (6, 8, 9, 10, 11) for a one-line comment. F15 also recurred: the task again ran the kill switch from the main checkout, where it is missing and exits 1; again named python3, which is 3.14 here and fails the audit 20 deep-JSON check in tests/cli.py at the baseline (the gate was rerun with Python 3.13, which passes); and again had no sweep command.
- Evidence: lane head 85298f21; audit-loop merge bef3d443 and its revert 7b720083; baseline c9cbf79b; handoff log, 27 Nov 2026, fix round 70 combine.
- Proposed change: In A3.4, before merging a lane, the combine also runs the lane's listed tests on origin/<branch> in a clean worktree, and a lane whose listed test fails there is returned at once, with no merge, bisect or revert. In A3.3, the lane runs its listed tests from a clean checkout of the commit it pushes, not from its working tree.

### F17. Lanes forked before main's last commits: one duplicated a main change and broke the build without a conflict, and three edited the same two lines

- Date: 2026-11-27
- Round: fix round 71 (combine)
- Rule: A3.2, A3.3, A3.4, A8.6 (and F11, F8, F14 again, as F15 describes)
- What happened: The four lanes branched from 3da83a99, but the integration branch had since taken aabfac0e and cd5254db from main. aabfac0e gives a boxed arranged map view a ranked layout and declares `arranged` in src/map/context.js; fix71-flow gives typed views a ranked way and declares its own `arranged` in the same function. Git merged the two with no conflict, the build then stopped with "Identifier 'arranged' has already been declared", every suite failed, and the merge was reverted: three findings (3, 4, 5) for an overlap with work already on main. Separately, fix71-boxes, fix71-flow and fix71-layout-misc each edited the same `owns` line of layoutPass and the same return line of src/layout/layered.js, so under A3.4's no-hand-resolution rule at most one of the three could merge; fix71-boxes (findings 2, 7, 8) conflicted with whichever went first and was returned. Only the revert of fix71-flow let fix71-layout-misc merge in the same combine. F11 (the kill switch from the main checkout), F8 (python3 is 3.14 and fails the audit 20 check) and F14 (no sweep command) recurred again.
- Evidence: audit-loop merge eef9ae8c and its revert 504d1389; merges 3da695b2 (fix71-tools) and b794ffc8 (fix71-layout-misc); lane heads 255465b8, e7e2dd95, e3072d1b; main commit aabfac0e; handoff log, 27 Nov 2026, fix round 71 combine.
- Proposed change: In A3.2, lanes branch from the integration head after it has merged main, not from the audit's base, and findings whose suggested fix names the same function go to one lane. In A3.4, the combine builds after each merge (a minute, against a full gate) so a clean merge that does not build is returned at once with no gate run or bisect, and a lane returned for a conflict is tried again in the same combine when the lane it conflicted with is later reverted.

## Closed

None.
