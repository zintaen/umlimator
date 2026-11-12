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
| 1a Foundation | 0.17.0 | Work packages 1.1 to 1.8 | Released 11 Nov 2026 (555bfdc, GitHub and npm latest); map-repo pinned to it | #154, #157, #158, #160, #161, #162, #163, #164, #165, #166, #167 |
| 1b Class | 0.18.0 | Work packages 1.9 to 1.12 | Released 12 Nov 2026 (1ffaaea, GitHub and npm latest); map-repo pinned to it | #168, #169, #171, #172, #173, #175, #176, (this PR) |
| 2 | 0.19.0 | Object, package | Design note approved ([`notes/stage-2.md`](notes/stage-2.md)); work packages next | #174 |
| 3 | 0.20.0 | Sequence, communication | Design note approved ([`notes/stage-3.md`](notes/stage-3.md)). 3.0 (b17b678) and 3.1 (7117a2e) merged, with the notes' changes elsewhere (b8e2315). In review: 3.2 (#181), 3.6 (#182) | #174, #177, #179, #180, #181, #182 |
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
| [`examples/`](examples/) | One target model per diagram type, `01-class.json` to `28-azure.json`, and `check.mjs`, which checks them against `model.md`; a type's file moves to [`../../examples/`](../../examples/) when it draws (`check.mjs` lists where: `01-class.json` is `examples/sales-classes.json`) |
| [`notes/`](notes/) | Design notes, one per stage, written when the stage starts: [`stage-1.md`](notes/stage-1.md), [`stage-2.md`](notes/stage-2.md), [`stage-3.md`](notes/stage-3.md); the sequence spike's findings, [`spike-sequence.md`](notes/spike-sequence.md) |

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
- **11 Nov 2026 (1.2 merged, 1.3).** 1.2 merged (#158, aeb8390) after a review whose findings were fixed in it. The
  motion test's timeouts were reproduced under load and fixed by a larger virtual-time budget for the motion pass
  (#159, merged). 1.3 adds `src/core/registry.js` (internal), registers the map as the default type, draws a typed view of a
  diagram not drawn yet as plain cards with a warning, joins the typed checks into `validate()` (the 28 examples: no
  error, one warning per view), makes drawing refuse a newer `schemaVersion`, and moves `measureText` and the held
  warnings into the core (`src/core/text.js`, `src/core/warn.js`), so the core no longer imports the map. The maintainer chose
  whole built files for families (`notes/stage-1.md` §2.5): the registry stays internal until the spike.
- **11 Nov 2026 (1.3 merged, 1.6).** 1.3 merged (#160, 2567a99) after a review whose two medium and three low findings
  were fixed in it. 1.6 adds `apply()` and `references()` (`src/core/apply.js`): `set`, `add`, `hide`, `delete` with
  its cascade (M4), `reparent`, all or nothing; undo is `history()`'s snapshot (P3). Deleting any element of any example
  or target example leaves a model that validates. The `edit` event that carries these commands is 1.7's, with the
  gestures that emit it.
- **11 Nov 2026 (1.8).** 1.8 makes the CLI read typed models: `upstream_view()` lists members as cards (F3), the page
  bakes no layout into a typed view (F4), and the build writes `lib/umlimator-all.js`, which the CLI inlines (F5).
  `render`, `check`, `stills` and `pdf` succeed on the class and component examples (`tests/cli.py`).
  For 1.9: `umlimator/element` imports `umlimator.js`; once a family ships, the element needs a build that uses
  `umlimator-all.js`, or a host that loads both gets two copies (from the review of #162).
- **11 Nov 2026 (1.4).** 1.4 adds `src/layout/typed.js` (`layoutTyped`, internal) and options on the layered layout that
  no map sets, so the geometry hashes are unchanged: rows as tall as their tallest node, self-loops (F1), room for the
  labels of lines between one pair (F2; the merge F2 found is the map's `prepEdges`, which typed views do not take),
  `direction: "down"` as a transform, and a geometry key with a memo (F7). `autoLayout` and `hubLayout` deleted. Left
  for later: end labels (L4, L5) and their reserved boxes, layout hints (L6), which come with the class type's ends
  (1.9); routing only the lines that changed, which needs the router lifted out of `layoutPass`.
- **11 Nov 2026 (1.5).** 1.5 adds UML's notation to `src/draw/`, opt in: every shape reports `size()` and `ports()`; the
  classifier shape; a table of line ends and dashed lines (`e.end`); end labels in boxes by each end (`endLabels()`,
  for 1.4 to treat as obstacles). A map never reads the new fields. `tests/notation.html` draws hand-built geometry in
  both themes and three fonts; the 26 stills of the examples are byte-identical and the geometry hashes match.
- **11 Nov 2026 (1.7).** 1.7 adds `src/canvas/edit.js`: on a typed view with `editable`, every gesture emits one
  `edit` event carrying a transaction (rename, pin, hide, delete, connect with the relationship picker, palette, member
  rows, properties, outline), each with a key (`L` connects by keyboard; Alt + arrows move a pin). The panels read three
  provisional fields of a type's definition (`elements`, `lines`, `props`). Maps keep `change`; `tests/edit.html` is
  unchanged, and `tests/typed-edit.html` checks each gesture's commands, by pointer and keyboard, through `apply()`.
  Member rows are edited in the properties panel until the class type draws them (1.9).
- **11 Nov 2026 (1a complete).** 1.4 (#163), 1.5 (#164) and 1.7 (#165) merged, each built by a lane agent in its own
  worktree and reviewed by another agent before the maintainer's approval; every review's findings were fixed and
  tested in the same pull request. 0.17.0's release pull request follows. Noted for 1.9: laying out a 40-node typed
  view takes about 175 ms, over P1's 100 ms from an edit to paint; the core is 13.5% larger gzipped than 0.16.1 (C5's
  budget is 15%), so what comes next lands in family files, not the core; a map model line carrying `fixed` or `under`
  still reaches the layout (older than this plan, in `prepEdges`).
- **11 Nov 2026 (0.17.0).** 0.17.0 released (#166, 555bfdc): GitHub Release and npm latest. map-repo's pin moved to
  v0.17.0, plugin 0.1.9. Stage 1b started: 1.9 (the class type), 1.10 (the Mermaid class reader) and 1.12 (the
  sequence spike) are built in parallel lanes, each reviewed from two lenses before the maintainer's approval.
- **12 Nov 2026 (1.12).** The sequence spike ran on a scratch branch (`sequence-spike`, never merged) and wrote its
  findings in `notes/spike-sequence.md`: the registry fields a type that does not use the layered layout needs
  (`layout`, `draw`, `items`, `refs`, `validate`, `edits`), three recommendations for `model.md` §3 that wait for the
  maintainer (one ordered list for a sequence's occurrences instead of `props.after`; inline messages; activations
  derived by intervals), and the commands a sequence needs (`add … in: 'view'`, a delete that re-homes what it held).
- **12 Nov 2026 (1.9).** 1.9 adds `src/uml/class.js`, in `lib/umlimator-all.js` only: the `uml.class` definition (palette,
  lines, a properties form per type, with association ends as fields inside `props.ends`), the member micro-syntax
  (`parseMember`, `printMember`; `print(parse(x))` stable, an unreadable line refused with a warning, E3, E4), ten
  validators with a passing and a failing fixture each, a `describe()` writer, accessible names and a legend. A registered
  type with a `layout` hook is laid out by `layoutTyped` from the map's ranking (generalizations turned so the general class
  comes first), with the memo kept across `update()`; comments draw as notes. The core grew by the wiring only: 14.3%
  gzipped over 0.16.1 now (C5: 15%). Measured: a 40-class view lays out in 65 to 90 ms in Node, an edit that moves nothing
  in about 1 ms, and paints in 5 ms in the browser (P1). End labels keep clear of the other lines when drawn; reserving
  their room in the layout (L4, L5) is still to come. Packages draw as named boxes until stage 2 nests their contents.
- **12 Nov 2026 (1.9, review).** The review's findings fixed, each with a test: a version-1 model's `diagram` field is
  ignored by the layout and `describe()` again; aggregation and navigability set inside `props.ends` from the panel;
  prototype-named ids, types and view ids (M3) in the class type and in `untangle`, `rowsFor` and `flowPos`; Unicode member
  names and `String[]`; members only where the type has compartments; generalization-kinds on any non-classifier end; the
  invalid mark cleared; `tests/class.html` reads the layout memo's run count across `update()`. The core: 14.3% gzipped (188631 B)
  over 0.16.1. Definition of done, the items 1.9 does not finish: 6 is now tested on the class example (a 30-step
  session undone, redone and reopened from saved JSON); 8 checks names and text contrast (classifiers, the note, end
  labels, the legend), but **typed lines are drawn in `--um-arrow`, 2.96:1 on the light stage, under 3:1**: raising it
  changes the maps' palette or the line colour `tests/notation.test.mjs` pins, so it is the lead's call; 9 is enforced by
  `tests/class.html`'s 40-class check, with the stress fixture 1.11's; 1 (the schema and `.d.ts`) and 7 (the fidelity
  table, in the conformance note) are documents of `plan.md` §7, which 1.11 owns. Left: a model-held member label with
  a space, or a type with `=`, prints a line the micro-syntax does not read back.
- **12 Nov 2026 (1.10).** 1.10 adds `src/readers/mermaid-class.js`, in `lib/umlimator-all.js` only (`tools/build.mjs`'s
  `ALL`), against Mermaid 12.3.0: a hand-written linear reader with a 1 MiB limit and a report of what it skips or
  approximates (R1, R2), ids from the source's names (R3), and a writer whose `%% id:` comments keep the ids Mermaid has
  no place for. `read(write(model))` equals the model for both views of `01-class.json` and 500 generated models;
  `tests/import/classes.mmd`, modelled on Mermaid's class page, pins the report (R4). `umlimator.py import` routes a
  classDiagram to it through Node and names the formats that need only Python (R7). It reads and writes `model.md`'s
  vocabulary and depends on no code of 1.9.
- **12 Nov 2026 (1.10 review).** The two-lens review's 15 findings on 1.10 are fixed, each with a regression test: a
  realization's target is an interface (with 1.9 merged, the fixture passes `validate()`), `n` multiplicities, linear ids
  for repeated names, prototype-safe lookup tables, the writer's line breaks and silent drops, multi-line directives, a
  CLI copy with no `src/`. Checked on a trial merge with `class-type` (1.9).
- **12 Nov 2026 (1.11).** 1.11 closes the class type's definition of done. 10: `01-class.json` moved to
  `examples/sales-classes.json`, in the gallery (stills and PDF on the site) and CI (rendered, checked, valid against the
  schema: F8); `check.mjs` keeps a list of what moved and checks it there, and the tests that counted 28 files use it.
  `tests/class-minimal.json` and `tests/class-stress.json` (G1, a view of 50 elements and 57 lines) lay out with no
  overlap, no line through an element and no end label on one, in Node and in Chrome under three fonts and both themes.
  9: `tests/class-fixtures.test.mjs` fails when the stress fixture's full layout takes 1 s or more, or an edit that moves
  nothing 100 ms to lay out and draw as SVG markup (best of three: about 200 ms and 5 ms here). 8: a typed view's lines
  and ends are drawn in `--um-muted` (5.95:1 light, 7.05:1 dark; `--um-arrow` was 2.96:1), maps unchanged, checked in
  `tests/class.html`. 1: the class vocabulary in `lib/umlimator.d.ts` and `lib/umlimator.schema.json`, which describes
  and rejects nothing (nested descriptions sit in `anyOf: [{ type, … }, true]`, so ajv's strict mode stays quiet). 7, 11:
  `docs/conformance/uml-class.md`, with the fidelity table measured on the example; `examples/class-editor.html`, a host
  that applies `edit` events with `apply()` and keeps `history()`, tested in a frame (`tests/class-editor.html`). The
  core: +31 B gzipped, 14.3% over 0.16.1 (188662 B). Found: the PDF's tables of a class diagram are the map's (every
  kind "Script", unlabelled lines "calls"; `risks.md` R8); lines cross where the layered layout finds no better
  order: 29 crossings in the stress fixture's `all` view (4 of them the lines between Order and Customer, 25 elsewhere)
  and 2 in `edge-cases` (those four lines among themselves), pinned in the test and recorded under `risks.md` L4; a
  browser timing under headless virtual time reads 0 ms, so P1 is enforced in Node and the browser checks claim no time.
- **12 Nov 2026 (1.11 review).** The review's findings on 1.11 are fixed, each with a test. A faded line in a typed view
  (drift's idle lines) is stroked in its ends' `--um-muted`; maps unchanged. The stress fixture's `all` view grew to 50
  elements and 57 lines (eight plain classes in two chains of associations), so P1's 50-node full layout is measured;
  its crossings are stated per view. The Node budget times layout and SVG markup, not layout alone; `tests/class.html`'s
  two timing checks no longer claim a paint time they cannot measure, and its fixture loop checks for a line through an
  element in the browser's fonts. A view with no elements (a class view or a map's) threw in `rowsFor`; it lays out as an
  empty stage, 72 by 72 (the core: +42 B gzipped). Left to the lead: the status table, and sign-off on the typed line
  colour in `src/draw/svg.js`.
- **12 Nov 2026 (the spike's findings applied).** The maintainer accepted `notes/spike-sequence.md` §2.1 to §2.3, and
  §5's items 1 to 3 are applied. The registry documents its provisional fields (`layout.run` and `key`, `pins`, `draw`'s
  two layers, `items`, `refs`, `validate(model, view)`, `lines` with `props`, `edits.connect`) and dispatches to a type's
  `run` inside the host's measure; `uml.class` keeps its layered hook. `model.md`: a sequence's occurrences are one
  ordered list in `edges` (`props.after` gone), messages inline, activations derived by intervals; `11-sequence.json` and
  `check.mjs` follow. `apply()`: `add … in: 'view'`, a delete that re-homes what stays to the nearest owner left, and
  declared references that cascade or drop; P4 to P11 are tests (`tests/spike-sequence.test.mjs`). The core grew by
  1,137 bytes gzipped (190,526 B with Node's zlib at its default level, the measure of C5's 165,727 B for 0.16.0):
  14.96% over 0.16.0, about 60 bytes of C5's 15% left. With `gzip -9` it was 189,730 B against 164,954 B, 15.02%.
- **12 Nov 2026 (1.12b, the spike findings' review).** The review's 11 findings are fixed, each with a test in
  `tests/spike-sequence.test.mjs`: `delete` of a node with 4,000 lines takes 9 ms again, not 92 (main: 6 ms): a
  parent's children are found once, not by a scan of the model for each line; `references()` and `delete` look in a view's own `nodes`; a
  type's `validate(model)` that takes no view runs once a type; only a type's `under` and `over` reach the SVG; an
  empty view lays out (`rowsFor` with no column) for maps, class views and `layout.run`; `11-sequence.json`'s f3 covers
  `payments` too, and `check.mjs` checks that `covers` is contiguous and reads the hand list for a type that declares no
  `refs`; `model.md` §3 says the stage 3 note adopts the point (it does not exist yet); `editing.md` says where
  `in: 'view'` puts a node outside the palette. The registry's field list now points to `notes/spike-sequence.md` §1,
  which pays for the fixes: the core is 52 bytes smaller (190,474 B, Node's zlib): 14.93% over 0.16.0, 112 bytes left;
  with `gzip -9`, 189,678 B, 14.99%, 19 bytes left; with `gzip` at its default, 190,014 B, 15.00%, 2 bytes left. The
  next change to the core has no budget: it pays for itself or goes to a family file.
- **12 Nov 2026 (the core's diet).** The maintainer chose to move typed-only code out of the core before 0.18.0 (C5 was
  at 15.03% with `gzip -9`). `src/typed/` (in `lib/umlimator-all.js` only) now holds `layoutTyped` and its geometry key,
  `layoutPass`'s typed rows, loops and fanned lines, the classifier, the line-end table and the end labels; the core keeps
  the `TYPED` slot (`src/core/registry.js`) they fill. Each moved piece is reached only through a registered type's
  layout (`layoutGraph(…, false)`, `dg.typed`, a non-map geometry), which `lib/umlimator.js` never has.
  `tests/core-diet.test.mjs` holds `layout()`, `describe()`, `validate()` and an `apply()` edit of the 28 targets and
  `examples/sales-classes.json` with `lib/umlimator.js`, and of the class example with `lib/umlimator-all.js`, to main's
  (9c1cf4f); `tests/core-diet.html` holds `render()`'s markup of 11 views (three examples from `lib/umlimator.js`, the
  class example from `lib/umlimator-all.js`); the bench's geometry hashes match and `tests/class.html` passes.
  `lib/umlimator.js`: 182,603 B with `gzip -9`, 10.70% over 0.16.0 and 10.65% over 0.16.1 (189,745 B before);
  1,154 bytes above 10%. What more could leave the core changes what it does: see risks.md C5.
- **12 Nov 2026 (notes 2 and 3).** The design notes for stages 2 and 3 were drafted in parallel, each critiqued by an
  independent agent and revised; the maintainer approved them (#174), with stage 2's exception (S9): class views draw
  packages as nesting from 0.19.0. Both assume the core's diet (C5) lands first, and stage 3's notes on order with stage
  2.
- **12 Nov 2026 (1b complete).** 1.9 to 1.12 and the core's diet merged; 0.18.0's release pull request follows, then
  map-repo's pin. `lib/umlimator.js` is smaller than 0.17.0's (182,603 B with `gzip -9`, 187,356 B before). Next: the
  work packages of stages 2 and 3, by their notes (#174).
- **12 Nov 2026 (0.18.0).** 0.18.0 released (#176, 1ffaaea): GitHub Release and npm latest. map-repo's pin moved to
  v0.18.0, plugin 0.1.10. Stage 2's lanes (2.1, 2.4, 2.5) start, as its note asks, after the release; stage 3's 3.1, 3.2
  and 3.6 are built on 3.0, each reviewed from two lenses before the maintainer's approval.
