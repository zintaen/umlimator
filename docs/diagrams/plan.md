# Plan to 1.0.0

How Umlimator goes from architecture maps to 28 diagram types that can be generated, edited, validated, saved and
exported. The reasons are in [`proposal.md`](proposal.md); the model in [`model.md`](model.md); what can go wrong in
[`risks.md`](risks.md); where the work stands in [`README.md`](README.md).

Agents build this. There are no time estimates: a work package is sized by what it must prove, not by weeks.

## 1. What 1.0.0 means

- All 28 diagram types meet the definition of done below, on the subsets in `model.md` and `proposal.md` §8.5.
- Every model that drew before draws the same. Nothing in the public API was removed. One exception, approved by the
  maintainer on 12 Nov 2026 (#174): from 0.19.0 a class view draws a package with something it owns shown as a box
  holding it, and qualifies names, so a class picture of 0.18.0 changes ([`notes/stage-2.md`](notes/stage-2.md)
  §10.1). Maps do not change.
- The API, the model's schema and each type's conformance note are frozen and documented.

**Decided on 11 Nov 2026:** 1.0.0 comes after all 28 types, not after the 14 UML types. **Decided on 13 Nov 2026:**
0.27.0 is not followed by 1.0.0 as a matter of course; the work goes on in 0.28.0, 0.29.0 and later, and 1.0.0 is
released when the maintainer says it is ready.

## 2. Definition of done for a diagram type

A type ships when every line holds. This is the merge checklist.

1. **Model:** its element types, properties and rules are in the registry and in the generated JSON Schema.
2. **Generate:** a typed JSON model draws; its reader (where the plan names one) reads the stated subset and reports
   what it did not read.
3. **Layout:** its fixtures lay out with no overlap, no text overflow and no line through a node, under three fonts.
4. **Edit:** every element, relationship, label and property in the subset can be created, changed, hidden and
   deleted, by pointer and by keyboard. Each gesture's command is tested.
5. **Validate:** each rule has a passing and a failing fixture; a failure names its rule and its elements.
6. **Save and reopen:** the model is the save format. Reopening and continuing gives the same model as an
   uninterrupted session; undo and redo return byte-identical models.
7. **Export:** SVG, PNG and PDF show the diagram; a fidelity table lists the limits of every writer.
8. **Accessibility:** names, reading order, a key for every gesture; the written-out axe rules and contrast pass.
9. **Performance:** the stress fixture is within budget (`risks.md` P1), enforced in CI.
10. **Examples:** its file moves from `docs/diagrams/examples/` to `examples/`, joins the gallery and CI, and gains a
    minimal and a stress fixture under `tests/`.
11. **Docs:** every document in §7 is updated, and a conformance note states the subset and what is left out.
12. **Regression:** the geometry hashes, the examples' stills and every earlier test are unchanged, except the class
    view's pictures and tests that §1's exception changes from 0.19.0 (work package 2.2).

## 3. Releases

One release per stage, by the repository's own rule: bump `package.json`, add the `## X.Y.Z:` section to
`docs/module-api.md`, merge when the maintainer approves that pull request by number.

| Release | Stage | Ships |
|---|---|---|
| 0.16.0 | Before the plan | The fixes on `main` now (#146 to #148). Not part of this plan; it goes out first |
| 0.17.0 | 1a Foundation | The split, schema version 2, the registry, the generalized layout, commands. Nothing new is drawn |
| 0.18.0 | 1b | Class diagram; Mermaid class reader and writer |
| 0.19.0 | 2 | Object, package |
| 0.20.0 | 3 | Sequence, communication |
| 0.21.0 | 4 | Use case, activity, state machine, interaction overview |
| 0.22.0 | 5 | Component, deployment, composite structure |
| 0.23.0 | 6 | Profile, timing. **The 14 UML types are complete** |
| 0.24.0 | Milestone 2 | ER, flowchart, data flow, information flow, typed C4 with dynamic and deployment views |
| 0.25.0 | Milestone 3 | SysML v1.7: requirement, block definition, internal block, parametric |
| 0.26.0 | Milestone 4a | AWS, GCP, Azure; mindmap |
| 0.27.0 | Milestone 4b | BPMN |
| 0.28.0 and later | After the 28 types | What the maintainer asks for next; 1.0.0 is not released as a matter of course |
| 1.0.0 | Stabilization | Section 6, when the maintainer says it is ready |

## 4. Stage 1 in detail: foundation and the class diagram

### 4.1 Before it starts

- 0.16.0 is released, and no other pull request touching `lib/umlimator.js` is open (`risks.md` F11, X1).
- A design note, [`notes/stage-1.md`](notes/stage-1.md), settles the open points of `model.md` §3 for stage 1, the
  build tool and the layout direction. It is approved before work package 1.1 starts.

### 4.2 Work packages

Each is one pull request. "Owns" is the files only that package may change while it is open.

| # | Work package | Owns | Needs | Done when |
|---|---|---|---|---|
| 1.1 | **Split the module.** Sources move to `src/` by layer (§4.3, and the stage 1 note §3). `tools/build.mjs` concatenates them into `lib/umlimator.js` (today's exports). Built files are committed, and CI fails when they are stale or a source's imports are not true | Everything; lands alone | 0.16.0, the stage 1 note | Same exports; the top-level statements of 0.16.0's file, unchanged; byte-identical geometry hashes and `box` stills; every suite passes; the CLI inlines the built file |
| 1.2 | **Schema version 2.** `schemaVersion`; the envelope; one id space; `migrate()`; `validate()` for the typed core (ids, references, ownership cycles, unknown types kept and warned); a newer version is an error | `src/core/model.js`, schema, types | 1.1 | Every version-1 fixture migrates to itself; the 28 target examples pass `validate()`'s structural part; F6 and F9 have tests |
| 1.3 | **Registry and dispatch.** `registerDiagramType()` (provisional); the map registers itself as the default; a view's `diagram` picks its type, layout strategy and gestures | `src/core/registry.js`, `src/map/` | 1.2 | A view with no `diagram` runs today's code path unchanged; an unknown `diagram` draws plain cards with a warning |
| 1.4 | **Layout.** Node sizes from shapes; rows as tall as their tallest node; `direction`; typed lines kept apart; self-loops (F1); the view key split into geometry and paint (F7); only changed lines routed again | `src/layout/` | 1.3 | Maps unchanged; fixtures with a 20-member class, four lines between two nodes and a self-loop lay out clean; an edit to a non-geometric property routes nothing |
| 1.5 | **Notation.** Shapes report `size()` and `ports()`; the classifier shape; a table of line ends (hollow triangle, hollow and filled diamond, open arrow, dashed line); end labels placed with the labels | `src/draw/` | 1.3 | Text stays inside faces and ends meet outlines, in both themes and three fonts |
| 1.6 | **Commands.** `apply()`; transactions; `set`, `add`, `move`, `hide`, `delete` with its cascade (M4), `reparent`; `references()`. The `edit` event moved to 1.7, which emits it | `src/core/apply.js` | 1.2 | Each command has a test of its result and its refusals; undo is the snapshot before (P3), and a 30-step script undoes and redoes to byte-identical models |
| 1.7 | **Editing on the canvas.** The `edit` event, carrying a transaction of commands; palette; relationship picker; member rows edited in place; keyboard connect; the properties panel built from a type's schema; the problems list; the outline of elements (M5) | `src/canvas/` | 1.5, 1.6 | Every gesture has a test of its command and its keyboard path; a read-only embed has none of it in its DOM |
| 1.8 | **CLI and page.** `upstream_view()` shows members (F3); typed views bake nothing (F4); the build writes `umlimator-all.js` and the page loads it (F5); `check`, `stills` and `pdf` work on typed views | `umlimator.py`, `engine/assets/`, `tools/build.mjs` | 1.3 | `render`, `check`, `stills` and `pdf` succeed on the class example; the copied upstream files are still unmodified |
| 1.9 | **The class type.** Definition; the member micro-syntax; validators; `describe()` writer; accessible names; legend | `src/uml/class.js` | 1.4 to 1.7 | The definition of done, on `proposal.md` §8.2's subset |
| 1.10 | **Mermaid class reader and writer,** in JavaScript; `umlimator.py import` calls it through Node (R7) | `src/readers/mermaid-class.js` | 1.9 | `read(write(model))` equals the model on the subset; a file with every construct on Mermaid's class page gives the pinned report |
| 1.11 | **Fixtures, examples, docs.** `01-class.json` moves to `examples/`; minimal and stress fixtures; an editing host page; every document in §7 | `examples/`, `tests/`, docs | 1.9 | In the gallery and CI |
| 1.12 | **Sequence spike** (thrown away). The time-axis layout on the registry, drawing `11-sequence.json` | A scratch branch | 1.4 | A written list of what the registry and `model.md` must change, applied before 1.3's API is documented |

Releases: 0.17.0 after 1.1 to 1.8 (nothing new is drawn, so it is a pure regression release); 0.18.0 after 1.9 to 1.12.

### 4.3 Source layout after the split

```
src/core/      model (ids, migrate, validate), registry, apply (commands), text (measuring)
src/layout/    layered (today's), route (the router); timeaxis (stage 3), lanes (stage 4), timeruler (stage 6, a timing view's linear time ruler) and tree (milestone 4a, a mindmap's bands), umlimator-all.js only; later: compound
src/draw/      svg, shapes, lines
src/typed/     what only a registered type's geometry takes (0.18.0, risks.md C5): typed layout, the classifier, line ends and end labels
src/canvas/    render (camera, selection, keyboard), edit (gestures), pieces (views list, palette, properties, problems, legend, hints)
src/page/      the standalone page, print
src/map/       the map type: kinds, lanes, hubs, numbered views
src/uml/ ...   one folder per family: definitions, validators, describe writers; stereotypes.js (stage 6) checks applied stereotypes and their tags across the model
               (milestone 2: src/er/, src/flowchart/, src/dfd/, src/c4/ with c4.js and views.js; uml/information.js;
               milestone 4a: src/mindmap/ and src/cloud/, one file for the AWS, Google Cloud and Azure family)
src/readers/   one file per source language and diagram; milestone 2's: mermaid-er, mermaid-flowchart, structurizr (JSON), dbml (an adapter over @dbml/core's parsed model); milestone 4a's: mermaid-mindmap
lib/           built and committed: umlimator.js (core and map), umlimator-<family>.js, umlimator-all.js
```

### 4.4 What can run at the same time

```
1.1 ──▶ 1.2 ──▶ 1.3 ──┬─▶ 1.4 (layout) ──────┬─▶ 1.12 (spike)
                      ├─▶ 1.5 (notation) ────┤
                      ├─▶ 1.6 (commands) ────┼─▶ 1.7 (canvas) ──▶ 1.9 (class) ──┬─▶ 1.10 (reader)
                      └─▶ 1.8 (CLI, page) ───┘                                   └─▶ 1.11 (fixtures, docs)
```

Four lanes after 1.3, each owning its own folder. One reviewing agent, which did not write the code, checks each pull
request against the definition of done before the maintainer is asked to merge.

## 5. Stages 2 to 6 and the later milestones

Each stage starts with a design note (`docs/diagrams/notes/stage-N.md`) that fixes its types' vocabulary from
`model.md`, lists its fixtures from `risks.md` §6, and is approved before code. Each ends with the definition of done
for every type in it.

| Stage | Types | New engine work | Type work, in order | Reader |
|---|---|---|---|---|
| 2 ([`notes/stage-2.md`](notes/stage-2.md)) | Object, package | Ownership drawn as compound nodes (`parent`); qualified names (M6) | Package, then object | Mermaid class (namespaces) |
| 3 ([`notes/stage-3.md`](notes/stage-3.md)) | Sequence, communication | The time-axis strategy; order as meaning; operands by `parent`; activations derived; several messages on one link | Sequence, then communication; a helper from numbered views and from traces | Mermaid sequence |
| 4 ([`notes/stage-4.md`](notes/stage-4.md)) | Use case, activity, state machine, interaction overview | Shapes that are not boxes (L12); explicit nestable lanes; regions in compound nodes; the transition micro-syntax | Use case, activity, state machine, interaction overview | Mermaid state |
| 5 ([`notes/stage-5.md`](notes/stage-5.md)) | Component, deployment, composite structure | Ports on borders; ends through parts; deep nesting; a time-boxed trial of the own engine against ELK (L9) | Component, deployment, composite structure | None |
| 6 ([`notes/stage-6.md`](notes/stage-6.md)) | Profile, timing | Stereotype definitions and application checks across the model; the time-ruler strategy | Profile, timing | None |
| M2 ([`notes/milestone-2.md`](notes/milestone-2.md)) | ER, flowchart, data flow, information flow, C4 | Line-end skins; per-view scope rules; levels on drill-down | ER, flowchart, data flow, information flow, C4 (typed elements, dynamic, deployment) | Mermaid ER and flowchart (ported), Structurizr JSON, DBML as an optional adapter |
| M3 ([`notes/milestone-3.md`](notes/milestone-3.md)) | Requirement, block definition, internal block, parametric | Frames; SysML's types as stereotyped UML types | Requirement, block definition, internal block, parametric | Mermaid requirement |
| M4a ([`notes/milestone-4a.md`](notes/milestone-4a.md)) | AWS, GCP, Azure; mindmap | Icon packs as data, fetched and pinned; the tree strategy | AWS, then GCP and Azure; mindmap | Mermaid mindmap |
| M4b ([`notes/milestone-4b.md`](notes/milestone-4b.md)) | BPMN | Boundary events; two flow kinds with scope rules | BPMN, the Descriptive sub-class's elements | BPMN XML through `bpmn-moddle`, as an optional adapter |

Before M4a starts: read the terms inside each vendor's icon download (`proposal.md` §6.5).

## 6. 1.0.0: stabilization

When the maintainer says 1.0.0 is ready (13 Nov 2026: not straight after 0.27.0):

- Freeze and document the registry, the commands and the schema; write the migration guide from 0.x.
- One conformance note per type, linked from the README; no claim beyond the tested subset.
- An accessibility pass over every type with a screen reader, beyond the automated rules.
- Performance budgets met on every stress fixture.
- `package.json`'s description and keywords, and the README's opening, say what the package now is.
- The documents under `docs/diagrams/` are folded into the permanent documentation; this folder is removed.

## 7. Documents to update in every stage

| Document | What changes |
|---|---|
| `README.md` | The feature list, the model table, the commands |
| `docs/module-api.md` | The release's `## X.Y.Z:` section (CI publishes it as the release notes) |
| `docs/editing.md` | New commands, gestures and keys |
| `lib/umlimator.d.ts`, `lib/umlimator.schema.json` | Types and schema, generated or hand-kept in step |
| `engine/references/schema.md` | Not ours: an upstream copy CI keeps unmodified. Typed fields are documented in `docs/` instead |
| `examples/README.md`, `examples/index.html` | The new examples and what each shows |
| `plugins/umlimator/skills/map-repo/SKILL.md` | Only when the skill should write a new type; then its pinned release moves too |
| `docs/diagrams/README.md` | The status table, in every pull request |
| `docs/diagrams/model.md`, `risks.md` | What the stage's design note changed; risks closed or found |
| Per type | A conformance note: subset, clauses, what is left out, the fidelity table |
| `examples/` | Each type's small example (the reference: gallery, fixtures, conformance), and the Bookshop atlas: the release's Bookshop views joined to it by drill-down, checked against the small files (13 Nov 2026) |

## 8. Working rules

- One work package, one branch, one pull request. Catch a branch up by merging `main`, not by rebasing.
- CI stays green. Geometry hashes are rewritten only in a commit that says why (`risks.md` X3).
- Nothing existing is removed or changed in behaviour, except a reproduced defect, noted in the release section, and
  the class view's packages drawn as boxes from 0.19.0 (§1), noted in 0.19.0's, and maps' one card-shape style from
  0.21.0, which removes the `shapes` notations and their toggle (`README.md` log, 13 Nov 2026), noted in 0.21.0's.
- The maintainer approves each merge and each release by pull request number.
- No host application's name appears in this repository.
