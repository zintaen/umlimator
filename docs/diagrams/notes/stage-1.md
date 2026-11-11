# Stage 1 design note

Status: **proposed** 11 Nov 2026, against `main` at 7c7f34d. The maintainer approves it before work package 1.1
starts. Line numbers below are those of `lib/umlimator.js` at 7c7f34d.

## 1. What this note settles

| # | Point | Decision | Section |
|---|---|---|---|
| S1 | The build tool for the split (D11) | A Node script in the repository, with no dependency, that concatenates the sources | §2 |
| S2 | Where today's code goes | 21 files under `src/`, whole declarations moved and none changed | §3 |
| S3 | Row heights (`model.md` §3, `risks.md` L1) | Per row: a row is as tall as its tallest node. Not compacted | §4 |
| S4 | `present.collapsed` (`model.md` §3, L1) | It hides a compartment. A separate `present.<id>.rows` caps one at n rows with "+k more" | §5 |
| S5 | Layout direction (`risks.md` L3, left to this note) | A transform: lay out left to right with every box turned, then transpose | §6 |

Left open on purpose: the order of a sequence's items that are not messages goes to the spike (1.12) and stage 3's
note; how a family file reaches the core's helpers is settled by 1.3 (§2.5).

## 2. The build

### 2.1 Options

| Option | For | Against |
|---|---|---|
| **(a) Own script, concatenation (recommended)** | No dependency (D8). The built file is the sources, byte for byte, in a listed order: still readable, and a diff of `src/` is the same diff in `lib/`. Deterministic. Proves 1.1 changes nothing (§2.4) | Rules the sources must keep (§2.2); the build does not rename, so two files cannot share a top-level name |
| (b) esbuild, as a dev dependency | A real bundler: scopes, renaming, tree-shaking, family bundles for free | Reformats and renames, so the committed file no longer reads like the sources and every release rewrites it whole; a native binary and a version to keep; it would hide a name clash by renaming |
| (c) Rollup | Pure JavaScript; readable output | A dependency and a configuration; renames like (b) |
| (d) No build: publish `src/` and re-export from `lib/umlimator.js` | Nothing to build | The standalone page still needs one file with no imports (F5), so a concatenation is needed anyway |

### 2.2 Rules for the sources

1. Sources are ES modules under `src/`. A top-level declaration starts in column 0.
2. An import names what it uses: `import { a, b } from '../core/text.js';`. No default exports, no `import *`, no
   `as`, no imports for side effects.
3. The public API is declared as today, `export function layout(…)`. Names one source shares with another are exported
   by one `export { … };` at the end of the file.
4. A top-level name is declared once in all of `src/`.
5. A file assigns only its own top-level bindings, as ES modules require.

### 2.3 The script

`tools/build.mjs` (`npm run build`), with no dependency:

- reads the sources in the order it lists them (core, draw, layout, map, canvas, page);
- drops their `import` statements and their closing `export { … };` lists, and keeps every other line as written;
- writes `lib/umlimator.js`: today's header comment, then the sources;
- fails when a file under `src/` is not in its list, or a listed one is missing;
- checks its output: it parses (`node --check`), and a test in `tests/layout.test.mjs` pins its exports to the 16 of
  0.16.0.

CI gains two checks:

- **Fresh:** `node tools/build.mjs && git diff --exit-code lib` fails when a committed built file is stale, as the
  check of `examples/bookshop.html` does.
- **Honest imports:** a TypeScript compiler, pinned to an exact version and fetched in CI only, as `ajv-cli` is, runs
  over `src/` and keeps only these errors: a name not found (TS2304, TS2552), an import from a file that does not export it
  (TS2305, TS2307, TS2459), an unused import (TS6133 on an import, TS6192) and an assignment to an import (TS2632). Type errors are ignored. The bundle would run with a missing import; this keeps each file's list of what it
  uses true, which is what lets a work package own a folder.

### 2.4 Why 1.1 cannot change behaviour

Every top-level statement of today's file appears once in the built file, unchanged; only their order changes.
Function declarations are hoisted. A table filled at load time (`SHAPE`, `KIND`) comes after what it calls, and the
module would fail to load otherwise, which every suite would show. The 1.1 pull request carries a one-off script that
compares the top-level statements of 0.16.0's file and the built one as two sorted lists, and its output. Its geometry
hashes and stills are then the second proof.

`examples/bookshop.html` inlines the module's text, so 1.1 renders it again and commits it; CI already requires that.
The header's "one file, no build step" becomes "built from `src/` by `tools/build.mjs`".

### 2.5 Later built files

- `lib/umlimator-all.js` is not written by 1.1: it would equal `lib/umlimator.js`, and nothing reads it. Work
  package 1.8 adds it to the build and points the page at it (F5). From 1.9 it is the core and every family.
- A family file needs the core's helpers. **Settled by 1.3:** every built file is whole. `lib/umlimator.js` is the
  core and the map; `lib/umlimator-all.js` (from 1.8) is the core, the map and every family, built from the same
  sources by a second list in `tools/build.mjs`. A host loads one of them, never both. The registry and the helpers stay
  internal, so nothing is exported before the sequence spike settles them; a family that ships on its own
  (`umlimator-uml.js`) waits until they are public, after 1.12. The cost: a host that draws one family loads all of
  them, which C5's budget does not count because `lib/umlimator.js` does not grow.
- No minifying, no source maps: the built file is the sources.

## 3. Where today's code goes

1.1 moves whole declarations, with the comment above each, and changes no line inside them. Declarations, with the line
each starts on:

| Lines | Declarations | Goes to |
|---|---|---|
| 11 | `STYLES` | `src/canvas/styles.js` |
| 366 to 374 | `esc`, `inline`, `md` | `src/core/text.js` |
| 375 | `h` | `src/canvas/render.js` |
| 379 to 445 | `KIND`, `MAPK`, `ALIAS`, `hasKey`, `kindOf`, `SIGIL`, `NOTATIONS`, `NOTED` | `src/map/kinds.js` |
| 446 to 612 | `r2` to `drawnPts`: outlines, `SHAPE`, `cardLook`, tabs, ports | `src/draw/shapes.js` |
| 613 to 619 | `CHG`, `NW`, `CG0`, `RG0`, `pillW`, `stepW`, `stepKey`, `stepOrder` | `src/layout/layered.js` |
| 622 to 640 | `textW`, `sansW`, `ctx2d`, `hostMeasure`, `wrap2`, `clauseFit`, `fit` | `src/core/text.js` |
| 622, 662, 663 | `measureText`, `warned`, `warn`, `hush` | `src/map/context.js` (below) |
| 641 to 660 | `trimLine`, `roundPath` | `src/draw/lines.js` |
| 661 | `hit` | `src/layout/layered.js` |
| 676 to 840 | `untangle`, `pullSources`, `rowsFor`, `hubLayout`, `autoLayout` | `src/layout/layered.js` |
| 841 to 860 | `WIRES`, `badgesOf`, `toneOf`, `mapTabs`, `mapNodeW` | `src/map/cards.js` |
| 861 to 1530 | `layoutGraph`, `layoutPass` (the router is inside it) | `src/layout/layered.js` |
| 1531 | `svgSeq`, `svgOf` | `src/draw/svg.js` |
| 1752 | `Camera` | `src/canvas/camera.js` |
| 1884 to 2026 | `teller` to `auditSvg`: `routeAudit`, `overlapIssues`, `leaveIssues` | `src/layout/audit.js` |
| 2027 to 2619 | `PHASES`, `phaseOf`, `edgeIds`, `mapContext` | `src/map/context.js` |
| 2620 to 2643 | `edgeRefIds`, `layout()`, `check()` | `src/map/api.js` |
| 2644 to 2843 | `WIRE_KINDS`, `validate()`, `boxesNamed`, `picks`, `andList`, `endsIn`, `rules()` | `src/map/validate.js` |
| 2844 to 2970 | `canon`, `lineKeys`, `markOf`, `linesOf`, `diff()`, `drift()` | `src/map/diff.js` |
| 2971 to 4219 | `reducedMotion`, `SHEET`, `sheet`, `INNER`, `pngOf`, `render()` | `src/canvas/render.js` |
| 4220 | `toggleTheme` | `src/page/page.js` |
| 4232 | `history()` | `src/core/history.js` |
| 4247 to 4382 | `lineGraph`, `walkFrom`, `paths()`, `reach()`, `describe()`, `otlpSpans()`, `cardMatcher`, `msText`, `critical()`, `whatIf()`, `sequenceFromTrace()` | `src/map/insight.js` |
| 4383 | `OWNER_TONES`, `lensOf` | `src/map/lens.js` |
| 4398 | `mountPage()` | `src/page/page.js` |
| 4799 | `printDoc` | `src/page/print.js` |
| 4933 to 5216 | `shortT`, `hintHTML`, `hinter`, `detailBullets`, `SHAPE_SAYS`, `swatchOf`, `legendItems`, `pieces` | `src/canvas/pieces.js` |

What the move shows, and who deals with it:

- **Two dependencies from the core back to the map.** `mapContext` sets `measureText` (a host's text measurer) and
  `hush` (warnings held while a layout is tried), so by rule 5 both live in `src/map/context.js`, with `warn`, which
  reads `hush`; `src/core/text.js` and the layout import them from there. 1.3, which makes the map one registered
  type, moves them into the core behind a setter.
- **Today's `validate()` checks maps.** It goes to `src/map/validate.js`. 1.2 writes the typed core's checks in
  `src/core/model.js`, and 1.3 makes `validate()` run both.
- **Unused code.** `autoLayout` and `hubLayout` are called from nowhere. 1.1 moves them as they are; 1.4 deletes them.
- **Two long functions stay whole.** The router lives inside `layoutPass` (about 600 lines); `src/layout/route.js`
  starts when 1.4 lifts it out. `render()` (about 1,230 lines) holds the gestures; `src/canvas/edit.js` starts when
  1.7 lifts them out.

## 4. Rows as tall as their tallest node

**Decision: per row.** Each row is as tall as the tallest node in it, and a row with none is the view's node height;
the gap between rows is unchanged. A pin `[col, row]` still names a column and a row.

**Maps are unchanged.** Every card of a map view has that view's one height (64 px, or 80 with `subAndChips`), so
every row keeps today's pitch. A script card shrinks inside its row after placement, as now.

**Half rows.** `rowsFor` places nodes on half rows too. A node on row 2.5 counts toward the heights of rows 2 and 3,
and its top is halfway between theirs, so it clears its neighbours in the column as a whole-row node does.

**Compacted rows rejected.** Packing each column on its own heights would stop rows lining up across columns.
`rowsFor` puts a node level with the nodes its lines come from so that a line between them runs straight; with
compacted columns "level" would no longer exist, and a pin's row would no longer name a line of nodes.

**Cost:** one tall class makes its whole row tall. The 60-member fixture (G1) shows it; §5's `rows` is the remedy a
user picks.

## 5. Long compartments

- `present.<id>.collapsed: ["operations"]` **hides** the named compartments: no rows and no divider, as UML draws a
  suppressed compartment. A compartment that is not collapsed and has no rows is drawn empty.
- `present.<id>.rows: n` shows at most `n` rows in each of that node's compartments, then a last row "+k more".
  Unset: every row. Stage 1 sets no default for a view; one comes only if a fixture shows the need.
- Hidden members stay in `describe()`, the outline and the properties panel. On the canvas, "+k more" sets
  `present.<id>.rows` to the compartment's length (a `set` command, 1.7).
- A type names its compartments: a class has `attributes` (its `uml.Property` members) and `operations`
  (`uml.Operation`); an enumeration has `literals`.

## 6. Layout direction

**Decision: a transform.** `direction: "down"` lays the view out left to right with every box the layout measures
turned (width and height swapped: nodes, line labels, end labels), then transposes the result: x for y, and the sides
L for T and R for B. Rectangles stay rectangles and orthogonal lines stay orthogonal, so whatever the left-to-right
layout guarantees (no overlap, no line through a node, its crossings) holds after the transpose. Text is drawn
afterwards in the real boxes, so it never turns.

- `layoutPass` measures line labels itself (the pill widths that size a gap between columns). Those few places read
  the turned size; nothing else in it changes.
- A shape whose outline is not symmetric about the diagonal (a cylinder, a person) takes its line ends from its
  `ports()` after the transpose (1.5). The classifier box is a rectangle.
- Maps stay left to right (L3): a map view with `direction` draws as now, with a warning.
- **Threading a direction through `layoutPass` rejected:** every x and y, column and row, and side in about 600 lines
  would change, with maps' geometry at stake.
- **The test (1.4):** a fixture laid out `down` equals its left-to-right twin, turned and transposed.

## 7. What this note changes elsewhere

- `model.md` §1 rule 10 gains `rows` and says what `collapsed` and `direction` do; §3 marks stage 1's two points
  settled.
- `plan.md` §4.1: the note is approved before 1.1 (the maintainer's order). §4.2: `umlimator-all.js` moves from 1.1 to
  1.8.
- `risks.md` L1 and L3 point here.
- `README.md` in this folder: the build-tool question is answered, and the status table shows this note.
