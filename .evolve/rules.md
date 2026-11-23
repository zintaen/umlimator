# Rules file (pointer)

The pinned strategy's rules file (A7.5, A10.1). umlimator's standing rules were written before the strategy was pinned, so most of them live elsewhere; this file says where, records the entries the strategy asks for, and lists what is still open. It takes effect when the maintainer merges it to main. Agents change it only by a pull request the maintainer merges (A8.3).

## Where the rules live

- `CONTRIBUTING.md`: setup, tests, the protected core tests, mutation testing, the rules a pull request must keep, commits, releases.
- `tools/evolve/templates/`: the round templates, each with its binding rules written in (A7.3), and `checklist.md`, which `tests/strategy-sync.test.mjs` checks them against.
- `.evolve/MAPPING.md`: where each A7.5 file lives here (this file records those path changes) and the A10 checklist's status.
- `.evolve/decisions.md`: the questions still open for the maintainer.

## Entries

- Default branch: `main`. Integration branch: `audit-loop`; batch branches `batch/<n>`.
- Identity: agents commit under the maintainer's name and email (`git -c user.name=... -c user.email=... commit`, no attribution trailers) and push with the maintainer's GitHub account through `gh auth token`. Since agents use an approver's account, an answer counts only as a host review approval or a commit or comment the maintainer makes themselves (A10.1). A bot identity is open (D2).
- Approvers: the maintainer (GitHub account zintaen).
- Never modified: `engine/scripts`, `engine/references`, `tools/fetch_icons.py` (upstream copies). No host application names in the repository.
- Merge rules: never rebase, never force-push, never a bare `git stash`; main accepts merge commits; lanes merge into `audit-loop`, which reaches main by a batch pull request (C4 step 6).
- Changelog: `docs/module-api.md`, one section per release; lanes add a line per change to its unreleased section (the maintainer's rule; C4 step 3 keeps lanes out of the changelog, so this is D6).
- Secrets: none in the repository; tokens come from `gh auth token` at run time; npm publishes by trusted publishing.
- Kill switch: `.evolve/STOP` on main (`tools/evolve/killswitch.mjs`).
- Lease: `.evolve/lease.json` in the orchestrator's checkout (`tools/evolve/lease.mjs`), ignored by git.
- Runtime state: the handoff folder beside the repository (all sessions run on one machine), path given to the templates as `args.state`; see `.evolve/MAPPING.md`.
- Shipped artifact exclusion (A10.2): `package.json` `files` (`lib/`, `LICENSE`, `THIRD_PARTY_NOTICES.md`).
- Version scheme: semver on npm; patch for fixes, minor for features or changed behaviour (while the major is 0, a breaking change bumps minor). Release rule B: a patch ships automatically after two reviews and green CI, minor and major wait for the maintainer, at most one release a week, a security patch at once. Delivery: merging a version bump makes CI tag the merge commit, publish to `next`, smoke test and promote to `latest` (CONTRIBUTING.md, "Releases"; D5).
- Protected files (A3.4): `.evolve/STRATEGY.md`, `.evolve/rules.md`, `.evolve/STOP`, the answer lines of `.evolve/decisions.md`, `tests/protected.json`, `.github/`, `tools/evolve/templates/`, `.gitignore`, `package.json`'s `files`, `scripts` and dependency fields, and `docs/package.json` and its lockfile.
- Local gate, in order (the fix template's combine step): `npm run -s build`; `node --test tests/*.test.mjs` (timed tests included); `python3 tests/cli.py` after the node tests, never alongside; `node tools/types.mjs --no-html && node tools/gallery.mjs` when the types or gallery tests need it; when `docs/` changed, `rm -rf docs/.vitepress/dist`, `npm ci --prefix docs && npm --prefix docs run build`, then `node --test tests/site.test.mjs` on that build. Counts are read from node's summary lines (pass, fail, skipped) and from `tests/cli.py`'s summary line; the build commands count as one check each. A skip in `tests/site.test.mjs` is not allowed.
- Audit areas: the eight in `tools/evolve/templates/audit.js`; globs and the skip list are open (D10).
- Models: the verifier model alternates by audit number (`args.rotation` in the audit template; A9.19). The exact model versions and the rotation set are open (D4).
- Spending ceilings per run and per week: open (D4).
- Outside services: code and test data go only to the agents' model provider and to GitHub; open for the maintainer to confirm (D4).
- Schedules and the digest channel: open (D1, D3).
