# Diagram types: start here

Umlimator draws architecture maps today. This folder holds the plan to make it generate and edit 28 diagram types
(the 14 of UML 2.5.1, SysML v1.7's four, ER, flowchart, data flow, C4, BPMN, mindmap, and AWS, GCP and Azure
architecture) by release 1.0.0, and the record of where that work stands.

**If you are picking the work up, read in this order:** this page; [`plan.md`](plan.md) §4 or §5 for the stage in
progress; [`model.md`](model.md); [`risks.md`](risks.md) §1. The reasons behind all of it are in
[`proposal.md`](proposal.md).

## Where the work stands

Update this table in every pull request that belongs to the plan.

| Stage | Release | Scope | Status | Pull requests |
|---|---|---|---|---|
| Planning | | Proposal, model, plan, risks, 28 target examples, UI draft | Merged 12 Nov 2026 (60a159c) | #151 |
| Before the plan | 0.16.0 | Fixes already on `main` (#146 to #148, #150) | Released 11 Nov 2026 (cf516c8, npm latest); map-repo pinned to it | #146, #147, #148, #150, #152, #153 |
| Before the split | 0.16.1 | `validate()` warns of a line from a card to itself (`risks.md` F1) | Released 11 Nov 2026 (8f0240f, GitHub and npm latest); map-repo pinned to it | #155, #156 |
| 1a Foundation | 0.17.0 | Work packages 1.1 to 1.8 | Note approved (#154). 1.1, the split, merged (657e7e9). 1.2, schema version 2, in review. Next: 1.3, the registry | #154, #157, #158 |
| 1b Class | 0.18.0 | Work packages 1.9 to 1.12 | Not started | |
| 2 | 0.19.0 | Object, package | Not started | |
| 3 | 0.20.0 | Sequence, communication | Not started | |
| 4 | 0.21.0 | Use case, activity, state machine, interaction overview | Not started | |
| 5 | 0.22.0 | Component, deployment, composite structure | Not started | |
| 6 | 0.23.0 | Profile, timing | Not started | |
| Milestone 2 | 0.24.0 | ER, flowchart, data flow, information flow, C4 | Not started | |
| Milestone 3 | 0.25.0 | SysML v1.7's four diagrams | Not started | |
| Milestone 4 | 0.26.0, 0.27.0 | AWS, GCP, Azure, mindmap; BPMN | Not started | |
| Stabilization | 1.0.0 | Frozen API and schema, conformance notes | Not started | |

## What is decided

All on 11 Nov 2026, by the maintainer. The options that were weighed are in `proposal.md` §9.

| # | Decision |
|---|---|
| D1 | Diagrams lay themselves out; a user pins what matters. No manual canvas |
| D2 | 28 types. Wireframes were removed from the list |
| D3 | Support is claimed by level (render, edit, interchange), with a conformance note per type |
| D4 | The first milestone is the 14 UML types, at the editable level, in six stages |
| D5 | SysML v1.7 notation for its four diagrams; nothing of SysML v2 |
| D6 | The model keeps `nodes`, `edges` and `views`, and types them |
| D7 | The library ships `apply()` and a reference store; a host may still use its own |
| D8 | The core has no dependencies; optional adapters may have peers |
| D9 | New readers are written in JavaScript, in the package |
| D10 | Cloud icons are fetched and pinned, never bundled |
| D11 | The single module file is split into sources; built files are committed |
| D12 | Mermaid is the first text notation |
| | Agents build this: the plan has no time estimates |
| | 1.0.0 is the release after all 28 types |

## What is in this folder

| File | What it is |
|---|---|
| [`proposal.md`](proposal.md) | The analysis: what the repository does today, the 28-type matrix, the architecture, build against reuse, the decisions |
| [`plan.md`](plan.md) | The plan to 1.0.0: definition of done, releases, stage 1's work packages, later stages, documents to update |
| [`model.md`](model.md) | The typed model: its rules and each diagram type's vocabulary |
| [`risks.md`](risks.md) | Findings that changed the plan, risks, edge cases, and what to do about each |
| [`ui-draft.html`](ui-draft.html) | A drawing of the editor: views, palette, canvas, properties, problems |
| [`examples/`](examples/) | One target model per diagram type, `01-class.json` to `28-azure.json`, and `check.mjs`, which checks them against `model.md` |
| [`notes/`](notes/) | Design notes, one per stage, written when the stage starts: [`stage-1.md`](notes/stage-1.md) |

## Picking up a work package

1. Find the stage in progress in the table above, and its work packages in `plan.md`.
2. Take the first package whose needs are merged and that no open pull request owns. Its row says which files it
   owns and when it is done.
3. Branch from `main`. Keep to the package's files.
4. Before asking for a merge, go through the definition of done (`plan.md` §2) and update the table above.
5. The maintainer approves each merge and each release by pull request number.

## Checks

```bash
node --test                                   # layout and the model, in Node
python3 tests/embed.py                        # the canvas, in headless Chrome
python3 bench/bench.py --check-determinism --expect bench/expected.json   # existing pictures are unchanged
node docs/diagrams/examples/check.mjs         # the target examples match model.md
```

## Five things that are easy to get wrong

1. **A view without `diagram` is a map and must draw exactly as it does now.** Host applications embed maps today;
   the geometry hashes are the proof (`risks.md` §2).
2. **The module is split before anything else, and alone.** Until then every change lands in one file of over 5,000 lines
   (`risks.md` X1).
3. **The command line renders through an upstream script that this repository may not modify.** Typed models must
   pass through it (`risks.md` F3, F4).
4. **Today's router drops a line from a card to itself and merges two lines between the same cards.** UML needs
   both drawn (`risks.md` F1, F2).
5. **The examples in this folder are targets, not tests.** Nothing draws them yet. A stage moves its examples to
   `examples/` when they draw.

## Open questions for the maintainer

| Question | Assumed until answered |
|---|---|
| Are copy, paste and duplicate wanted before 1.0.0 (`risks.md` E7)? | No |
| May a tool download the AWS and Google icon packs for its users? | Unknown; to be read from the vendors' terms before milestone 4 |

## Log

- **11 Nov 2026.** Planning written against `main` at 449ca99, then re-checked at 14e5844 after #146 to #148
  merged: no fact the plan rests on changed. All twelve decisions taken. Wireframes removed. A review of edge cases
  added findings F1 to F11 to `risks.md` and four work items to stage 1. 1.0.0 set after all 28 types. The 28
  examples were reviewed against `model.md`, which gained what they showed was missing.
- **12 Nov 2026.** `main` moved to 189eee9 (#150, a routing fix towards 0.16.0). The facts the plan rests on were
  checked again there and hold; line numbers in `proposal.md` remain those of 449ca99.
- **11 Nov 2026 (later).** The plan merged (#151, 60a159c). 0.16.0 released (#152, cf516c8): GitHub Release and npm
  latest. map-repo's pin moved to v0.16.0, plugin 0.1.7 (#153). Main's run for #151 failed once on a page timeout in
  `tests/motion.html` and passed on a re-run: a flake. Next: the stage 1 design note (`plan.md` §4.1).
- **11 Nov 2026 (later still).** The stage 1 design note proposed (`notes/stage-1.md`), against 7c7f34d. It picks a
  concatenating build script with no dependency, maps today's file onto 21 sources, and settles rows, compartments and
  direction. Found while mapping the file: `autoLayout` and `hubLayout` are called from nowhere (1.4 deletes them), and
  `mapContext` sets two bindings the core reads (1.3 moves them).
- **11 Nov 2026 (approved).** The maintainer approved the stage 1 note as written (#154, merged as 5c4979d), and chose to
  warn of a line from a card to itself in a 0.16.1 before the split. 1.1 was rehearsed on a scratch branch: the built file
  holds the same 129 top-level statements and 886 comments as the old one, `node --test` passes and the geometry hashes
  match.
- **11 Nov 2026 (0.16.1).** 0.16.1 released (#155, 8f0240f): GitHub Release and npm latest. map-repo's pin moved to
  v0.16.1, plugin 0.1.8. Next: 1.1, the module split, alone.
- **11 Nov 2026 (1.1).** The split opened as #157: 21 sources under `src/`, `tools/build.mjs`, and two CI checks (a
  fresh `lib/`, true imports). The built file holds 0.16.1's 129 top-level statements and 886 comments, reordered;
  every suite passes, the geometry hashes match, and the 26 stills of the examples are byte-identical.
- **11 Nov 2026 (1.1 merged, 1.2).** The split merged (#157, 657e7e9). Its CI hit the `tests/motion.html` timeout on
  three of six runs, each passing on a re-run. 1.2 adds `src/core/model.js`: `migrate()` (public), the version check that
  `validate()` now reports (F6), and the typed core's checks (ids, types, ownership, edge ends, typed views), which the
  28 target examples pass and `examples/check.mjs` now reuses. `validate()` runs the typed checks from 1.3, with the
  registry, as the note says. Unknown types are warned of from 1.3 too: until a type is registered, none is known.
