# Lessons of the audit and fix loop

Each entry says what went wrong, where it was seen, and the rule that now prevents it. The loop adds an entry whenever a round goes wrong in a new way (auto-evolve strategy, A7.2), and the round templates (audit, fix and combine, release) are updated from this file, never only one round's script. This file is the seed: the lessons learned up to audit 64 and release 0.45.0. `tests/evolve.test.mjs` checks that every entry carries a rule.

Entry form: a `##` heading naming the lesson, a paragraph of what happened with its evidence, and a line starting `Rule:`.

## A zero is not a clean round until the failed agents are counted

Audit 22's first run reported 0 confirmed findings only because a usage limit stopped three finders and all 23 verifiers, and a failed verifier counted as a rejection. The run was resumed, and the same audit then confirmed 32 findings, 10 of them medium.

Rule: before trusting an audit's count, read the run's failures list; an audit with any failed agent is not clean, and the release rule asks for 0 high, 0 medium and 0 failed agents.

## Extra requests add work and never narrow a round

In fix round 56 a maintainer note sent in the middle of the round was read as the whole scope: the combine step merged one lane of five, and the readers lane skipped four findings. Two recovery lanes were needed.

Rule: every lane and combine prompt says that an extra request adds work and never narrows it, that every pushed lane is merged unless the combine step rejects it with a reason, and the combine step checks that each lane is in.

## One owner at a time, and a round is tracked by its branches

Fix round 46 was relaunched by a second session while the first session's run was still alive. A duplicated lane wrote over another agent's work on the same file before the second run was stopped.

Rule: a session takes the ownership lease (`tools/evolve/lease.mjs take`) before it starts or resumes a round and renews it while it works; a round's progress is read from its pull requests and branches (`gh pr list --head fix<N>-*`), not from a session's memory.

## Engine-only data never reaches the page

In fix round 32 a lane put the engine's internal keys (`files`, `hunks`, `fileNotes` and others) into the page's metadata, where any viewer of the page could read them. The combine step caught it and moved them out before merge.

Rule: the combine step reads every change to what the page or a public output receives as a security change; data meant for the engine stays out of the page, with a test that fails if it appears there.

## A test expectation changes only with a stated reason

Several rounds edited an existing test until it passed, hiding the behaviour the test was written to hold.

Rule: an existing test's expectation changes only when an intended change makes it wrong, and the commit names the test and why; the protected core tests change only with the maintainer's approval.

## Every fix sweeps every example against its base commit

Fixes to one diagram type moved pictures in others, found only by a later audit.

Rule: every lane runs every example (`examples/*.json`, `examples/types/*.json`, `tests/fixtures/integration.json`) through the code it changed, compares with the base commit, and lists or fixes every difference; `bench/expected.json` changes only with a reason.

## Timed tests measure growth, never a tight wall clock

Timed tests that passed alone failed under load (two timed tests over budget at a load of about 20 in the round 55 combine, green on a rerun), and recurred on slower CI machines.

Rule: a timed test compares a quarter-size input against the full one with a generous ceiling; a timed failure is rerun alone before it counts; a performance fix adds timed tests on the worst inputs, not only the reported one.

## Heavy suites run one after another

Suites run side by side raced on shared files: the gallery test read a temporary dotfile another suite was writing in `examples/` (round 55, recurring).

Rule: heavy suites, or suites that write outside their own temporary folder, run one at a time (`node --test tests/*.test.mjs`, then `python3 tests/cli.py`, never together); tests write only under their own temporary folders.

## Verifiers can reject real bugs, so their rejections are sampled

A verifier that refutes too eagerly makes real bugs disappear with no trace.

Rule: every audit saves its rejected findings with the verifier's reason, and the weekly digest (`tools/evolve/digest.mjs`) shows a random sample of 2 or 3 of them, seeded by the date, for the maintainer to spot check; a rejection the maintainer overturns becomes a confirmed finding and a lesson for the verifier prompt.

## The same model finding and verifying shares its blind spots

Finders and verifiers on one model miss the same things and agree on the same mistakes.

Rule: the verifier model rotates by audit number (the audit template's `args.verifierModel`), and every fifth audit runs its finders on a different model from the previous audit's.

## A bug family that keeps coming back needs its shared rule fixed

Some families were confirmed again and again, each round fixing the single case: the BPMN XML reader losing an attribute or a name with nothing in its report was confirmed in audits 45, 46, 48 and 64.

Rule: `tools/evolve/ledger.mjs` runs after each audit; a finding back in three rounds, a fix that regresses twice, or three rounds with no fall in high plus medium findings stops the loop and puts the question to the maintainer, proposing one lane that fixes the shared rule and sweeps every example.

## Template text is code

An audit's focus text with backticks inside broke the template string of the round's script (audit 22), and a hand edit of the fix template truncated it (round 57), which had to be rebuilt.

Rule: no backticks in a template's focus text; a template is changed only by an edit that a second agent reviews for removed or weakened rules, never rewritten from memory.
