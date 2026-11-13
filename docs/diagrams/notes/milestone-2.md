# Milestone 2 design note: ER, flowchart, data flow, information flow and C4

Status: **approved** by the maintainer 13 Nov 2026, with every recommendation of §17 taken except decision 18, where the maintainer chose (b): five code lanes at most across the project, stage 6 included; the maintainer approves it before work package M2.0 starts. Written against `main` at 5f20041
(0.21.0 released, #228; stage 5's 5.0 to 5.6 merged); stage 5's 5.8 was read on its branch (`stage5-docs`, 21f3bda) for
the Bookshop atlas and its examples. Stage 6's note (profile, timing) was read on its branch (`stage6-note`, ac34e6b and
its revision 2e72c6b, both from 5f20041): where this note depends on it, it names its packages (Q17). Symbols are named,
not line numbers. Revised after a feasibility review and a standards review of c6e76a5.

Milestone 2 ships release 0.24.0: the entity-relationship diagram (`er`), the flowchart (`flowchart`), the data flow
diagram (`dfd`), the information flow diagram (`uml.information-flow`) and typed C4 with its six views (`c4.landscape`,
`c4.context`, `c4.container`, `c4.component`, `c4.dynamic`, `c4.deployment`) (`plan.md` §5, row M2). Its new engine
work: line-end skins; per-view scope rules; levels on drill-down. Its readers: Mermaid ER and flowchart (the flowchart
reader ported from `umlimator_import.py` to JavaScript), Structurizr JSON, and DBML as an optional adapter.

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 15 and 20 to 23 | Kept, with refinements: an ER column row has a micro-syntax; a C4 element may carry `props.shape`; a C4 view draws its `subject` as a boundary when `nodeIds` lists it, as every typed view's subject; a dynamic view's `edges` are model relationships, each once; a DFD's numbers stay stored; `conveyed` is a declared reference | §3 |
| S2 | Line-end skins | The line-end table (`ENDS`, `src/typed/draw.js`) is exported (by M2.2, after stage 6's 6.3 adds its row), and a family adds its ends at load, as shapes are added to `SHAPE`. ER's ends are chosen per line from its two multiplicities and the view's `notation`: crow's foot (four ends) or IDEF1X (a dot, with `P`, `Z` or a number as an end label, and a hollow diamond for an optional parent). No core byte | §4 |
| S3 | A notation switch | One geometry for both skins of a type (ER, DFD): changing `view.notation` repaints and lays nothing out | §4.3 |
| S4 | Per-view scope rules | Each C4 view kind validates what it may show (§5.1's table), with c4model's checklist as warnings; a DFD level validates its flows against its parent process (balancing); the flowchart, ER and information flow types have none. Rules in the family files; nothing shared is built for milestone 4b's flow scopes | §5 |
| S5 | Implied relationships (C4, `risks.md` G3) | Derived when drawn, never stored: a relationship whose end a view does not show is drawn between the nearest shown owners, unless a relationship already joins them; one implied line per pair. Selected and named, never edited | §5.2 |
| S6 | Levels on drill-down | `D` on a selected DFD process, C4 software system or C4 container that opens no view makes that view: a new view (a new command, `addView`, S7) holding the element's context, and the element's `opensView` set. DFD numbers stay stored and are checked under their parent's | §6 |
| S7 | Adding a view | `apply()` gains `addView { view, index? }`: a view added to `views`, refused when its id is taken. No command deletes a view (§13). Core, about 160 B | §6.2 |
| S8 | A typed view's card that opens a view of its own kind | Opens it, unless its type draws unfolding: a type says so with `unfolds: true`, which the activity type sets (its call behaviour action unfolds today, tested and counted by CI: Q5). Found while reading: a class view's card unfolds in place through the map's code, drawn as a plain box (verified, Q5). A defect fixed in M2.1, noted in 0.24.0's release section. Core, 13 B (measured on a scratch build) | §6.3 |
| S9 | ER columns as rows | A row reads and prints `name type [PK] [FK table.column] [UK] [NULL]` (`id bigint PK`; `customer_id bigint FK customer.id`); the panel's member rows go through `edits.member` (5.2) | §3, §7.1 |
| S10 | ER's identifying look | Identifying solid, non-identifying dashed, in both notations; in crow's foot this is a tool convention (Mermaid's `--` and `..`), stated as such | §7.1 |
| S11 | C4's shapes | The map's card-shape set (`SHAPE`, `src/draw/shapes.js`, read only): `props.shape` names one (`person`, `robot`, `browser`, `window`, `terminal`, `mobile`, `cylinder`, `pipe`, `folder`, `document`, `hexagon`, `box`); without it a person is `person`, every other element `box`. C4's text over it: the name, `[Container: technology]`, the description | §7.5 |
| S12 | How typed C4 relates to maps (`risks.md` C8, M9) | Maps draw exactly as now; nothing here reads or changes a map view. `umlimator.py import` keeps writing maps from Structurizr DSL, C4-PlantUML and Mermaid's C4 diagrams; typed C4 comes from Structurizr JSON and from JSON written by hand or by an agent. No conversion from a map in 0.24.0 | §2.4, §8.5 |
| S13 | Dynamic views | `edges` lists model relationships by id, each once, in time order (rule 8); numbers are derived (1, 2, 3) and drawn before each label. A step that repeats a relationship, or says something else of it, is out of the subset; the Structurizr reader reports it | §7.5.2 |
| S14 | Information flow | Its own view type; a dashed line with an open arrow, «flow», and the conveyed elements' names as its label; `props.conveyed` a declared reference that drops a deleted id. The «flow» line on other UML views is left out | §2.3, §7.4 |
| S15 | Readers | Mermaid ER: a reader and a writer. Mermaid flowchart: a reader and a writer in JavaScript, ported from the map importer's grammar, with Mermaid's newer `@{ shape: … }` form. Structurizr JSON: a reader. DBML: an adapter over `@dbml/core`'s parsed model that imports nothing (§8.4) | §8 |
| S16 | The CLI | Additive: `erDiagram`, a Structurizr JSON workspace and a `.dbml` file are read typed (today the first is refused and the other two are not recognised); a Mermaid flowchart stays a map unless `--typed` is given | §8.5 |
| S17 | The PDF's line rows (`risks.md` R9) | A type may give a line's text for the PDF's lines table (`text(model, view, id)`), read by `src/page/print.js` before `label`. Core, about 30 B. The information flow type gives its conveyed elements, ER its multiplicities, C4 its technology | §9 |
| S18 | The core's budget (C5) | At most the milestone's share of the maintainer's split of 13 Nov 2026, 1,400 B; targets 253 B (§2.5). Anything over waits for the maintainer | §2.5 |
| S19 | P1 | `repair: false` and `reroute: false` on every layout of the five types; CI holds 1 s and prints each common edit against the 100 ms target, CPU best of seven after a warm-up, in tests titled " (timed)" and run serially | §11 |
| S20 | The Bookshop atlas | The five examples join it: every id of the ER, DFD and C4 examples takes the prefix `er-`, `dfd-` or `c4-`; the flowchart renames two; the information flow shares four elements with stages 4 and 5 and renames the rest. The builder learns the milestone's props. Trial-built (Q12). The C4 context becomes the atlas's root | §12.5 |
| S21 | Order with stages 5 and 6 | This note's code starts once it is approved and stage 6's 6.0 has merged. No cap on lanes across the project: disjoint Owns and rehearsed merges (X2) decide what runs at once, as in stage 6's note. The reader lanes beside stage 6's; M2.1 after 6.1 (both edit `apply.js` and the registry's pointer comment); M2.2 after 6.3 (`ENDS`); 0.24.0 after 0.23.0 (decision 18) | §12.3 |
| S22 | C10 for the five types | Tested in M2.14 as 5.8 does: the MCP server's read tools and the diff Action's step. The `map-repo` skill's pin does not move | §12.6 |
| S23 | Departures | No claim of IDEF1X, ISO 5807, Yourdon or Gane and Sarson conformance; crow's foot's dashed non-identifying line is a tool convention; C4 is notation-independent and the shapes are the map's | §13 |

What is left out of the subsets is in §13.

## 2. Where milestone 2 starts

### 2.1 What it builds on

- **The registry and its hooks** (`src/core/registry.js`, `src/typed/*.js`): `layout`, `draw`, `boxes`, `owners`,
  `validate`, `rules`, `describe`, `rows` and `word` (the PDF's, 4.9), `refs`, and `edits` with `connect`, `moveTo`,
  `add`, `remove`, `rename` (4.1), `member` and `key` (5.2). A type's name passes `^[a-z0-9]+(\.[a-z0-9-]+)?$`, so `er`,
  `flowchart`, `dfd` and `c4.container` are names; one definition may be registered under six names (each call freezes
  its own copy).
- **The layered layout for typed views** (`layoutTyped`, `src/typed/layout.js`): rows as tall as their tallest node,
  `direction: "down"`, self-loops, lines between one pair kept apart, `cut`, `gap`, `rgap`, `labelGaps` (stage 5, decision
  9), the geometry key and its memo.
- **Stage 2's boxes** through `ownersOn` (`src/uml/owners.js`): boxes from `parent` for any node types (`look.boxTypes`),
  with their shape and word, a drop into a box and the Owner field emitting `reparent`. C4's boundaries and deployment
  nodes are such boxes.
- **Stage 4's shapes** (`src/uml/flow.js`, `src/uml/usecase.js`): the diamond with text on two lines, `flowWrap`,
  `SHAPE.ellipse`, the line ends slid onto an outline by `inset` (`TYPED.lines`), the flow rules' shape (`flowProblems`).
- **Stage 5's looks** (`src/uml/structure.js`, `src/uml/component.js`) and the class type's classifier and `multBounds`
  (`src/uml/class.js`): the information flow type draws components, classes and actors with them, read only.
- **The map's card shapes** (`SHAPE` in `src/draw/shapes.js`, one style since 0.21.0): person, robot, browser, window,
  terminal, mobile, cylinder, pipe, document, hexagon, folder, node and the rounded box, each with `out`, `face`, `det` and
  `inset`. A typed node whose shape has no `draw` is drawn by the card code with typed styling (Q2).
- **Drill-down**: `opensView` on a node, `view.parent`, the page's breadcrumbs and views list, and 4.10's rule that
  another kind of diagram opens, never unfolds in place (the atlas, 39 B).
- **The readers' pattern** (`src/readers/mermaid-*.js`): hand-written and linear, a size limit, a report of what was
  skipped or approximated (R1, R2), ids from the source's names (R3), `%% id:` comments in the writer, Mermaid 12.3.0's
  documentation pinned (R4), `umlimator.py import` calling the reader through Node (R7).
- **The map importer** (`umlimator_import.py`): Structurizr DSL, C4-PlantUML, Mermaid C4 and Mermaid flowcharts as maps,
  with C4's levels, includes and implied lines worked out at import (`views()`).

### 2.2 What was read at 5f20041

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | `registerDiagramType` | A name is `<notation>` or `<notation>.<kind>`; the definition is frozen per name, so six C4 names may share one definition object | §7.5 |
| Q2 | `svgOf`'s nodes (`src/draw/svg.js`) | A typed node whose `shape` has a `draw` is drawn by it; otherwise, when its shape is a card shape (`cardLook(n, false, …)`), by the card code: the outline, `det`, the label centred and `n.sub` under it, in typed styling. A shape with its own `draw` may call a card shape's `out`, `det` and `face` | S11 |
| Q3 | `ENDS` and `TYPED.lines` (`src/typed/draw.js`) | A table of `[length, half height, path pointing right, fill]`, not exported; each end used becomes one `<marker>` with one path and one fill (`line`, `hollow`, `none`). `endOf` reads it by own key, so rows added at load are found | S2 |
| Q4 | `endLabels` | Each end's `role` and `mult`, placed beside the end by a search that keeps clear of lines, nodes and labels placed before | §4.2 |
| Q5 | `unfoldable` (`src/map/context.js`) | Refuses a card in a numbered view and a card whose view and opened view differ in `diagram`; allows it when they match, typed or not. **Verified**: `examples/sales-classes.json` with a class view `inner` holding a class `domain` does not show, and `customer` opening it: `layout(m, 'domain', { expand: ['customer'] })` unfolds `customer` into a box through the map's code; the classifier is gone and the box has no `shape`. The one same-kind pair in `examples/` is the activity's: `fulfil`'s `call-payment` unfolds `take-payment`, and every node keeps its shape (`initial`, `rounded`, `final`). `tests/atlas.test.mjs` asserts it unfolds, and CI's example loop (`.github/workflows/check.yml`, `check --expand`) counts 4 crossings in `fulfil-activity` and 6 in `bookshop-atlas`, 2 of the first only on the unfolded pass (stage 4 §17) | S8 |
| Q6 | `apply()` (`src/core/apply.js`) | `set`, `add`, `move`, `hide`, `delete`, `reparent`. None adds or removes a view; `set { view }` sets a field of a view that exists | S7 |
| Q7 | `references()` and `propRefs` | A type's `refs` are by element type and path, `cascade` or `drop`; a path holding a list is read item by item; members are walked, so a column's `references` is found | §3 |
| Q8 | `ownersOn` | Boxes for any `boxTypes`, `qualify: false` for unqualified names, `shape(x)` and `word(x)` per box | §7.5 |
| Q9 | `umlimator_import.py` and `cmd_import` | Structurizr DSL, C4-PlantUML, Mermaid C4 and flowcharts become maps; a C4 element's type is kept only as a sub-line (`sublabel`) when it has no technology. A Mermaid `classDiagram`, `sequenceDiagram` or `stateDiagram` goes to Node. An `erDiagram` is refused ("not a flowchart, graph or C4 diagram: nothing imported"); a Structurizr JSON workspace and a `.dbml` file are not recognised | S12, S16 |
| Q10 | The importer's `flowchart()` | Reads node shapes but keeps only `[(` (a database kind); subgraphs become boxes; `---`, `-.->` and `==>` become plain, `async` and `weight: 2` lines; `<-->` two lines; `~~~` is skipped | §8.2 |
| Q11 | `src/page/print.js` | A typed view's lines table shows each line's `label` and kind; a type's `word` and `rows` reach the elements table only (R9) | S17 |
| Q12 | `tools/atlas.mjs` on 5.8's branch, with the five target examples added | Stops at the first unknown prop (`conveyed`: `KEYS.props` lists the earlier types' only). With the milestone's props added, it stops on clashes: 42 ids of the five files name another file's element of another kind (a map card has no type, so `storefront` the card and `storefront` the C4 container disagree on `type`; a column id is a class's member, `customer.email`; a DFD store is a map view's own element, `orders`), one view id is taken (`components`, 5.8's component view), and three node ids are another file's view (`api`, `checkout`, `take-payment`). **Trial-built** in a scratch folder: with `er-`, `dfd-` and `c4-` before every id of those three files, two flowchart renames and the information flow's six renames and four shared elements (§12.5), the atlas builds: 31 views, 201 nodes. Stage 6's two examples were not in that build; their ids are checked against the renamed ones in Q17 | S20 |
| Q13 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 185,136 B at 5f20041. The cap is 189,697 B (0.16.0's 164,954 B plus 15%): 4,561 B left on `main`. The maintainer's split of 13 Nov 2026 counts 4,451 B with stage 5's open branches, and gives milestone 2 1,400 B | S18 |
| Q14 | The five target examples | `check.mjs` passes them; `validate()` warns once per view that its diagram is not drawn. `23-c4.json`: the container and component views name a `subject` they do not list; the context view has none; the dynamic view's `edges` are ids, each once; the instances' relationships are written out. `22-data-flow.json`: level 2's boundary flows match level 1's flows of `take-order` by label, far end and direction; numbers are stored. `20-entity-relationship.json`: every identifying relationship's child holds the parent's key in its own; one self-reference | §3, §6, §7 |
| Q15 | Keys taken on a typed view | `L`, `N`, `O`, `P`, `E`, `F`, `+`, `V`, `W` (the canvas, the editor, the panels) and `B` (the component type's `edits.key`). `D` is free | S6 |
| Q16 | `multBounds` (`src/uml/class.js`, exported) | `1`, `*`, `0..1`, `1..*`, `2..5` to bounds; null for anything else | §4.1 |
| Q17 | Stage 6's note (`stage6-note`, 2e72c6b) | 6.0 owns `tools/build.mjs` and one line of `tests/embed.py`. 6.1 owns `src/core/apply.js` (`refs()` and `delete` for the timeline, about 60 B) and `src/core/registry.js` (a pointer line in the comment above `const TYPED = {}`, the spot this note's pointer line would take). 6.3 owns `src/typed/draw.js` (`ENDS` only: the filled triangle). 6.6 owns `examples/` but the atlas's files, `check.mjs`, `tests/core-diet.json` and `docs/` but the status table; 6.7 the atlas's files. 6.0 to 6.5 start on approval ("six lanes busy"), with no cap on lanes. Neither `src/map/context.js` nor `src/page/print.js` is stage 6's. Ids: after §12.5's renames no id of `07-profile.json` or `14-timing.json`, as they are or as 6.6 revises them (`lifeline-worker`, `lifeline-payments`), is an id of the five targets (checked by script; before the renames `order`, `payments` and `worker` were shared) | S21, §12.4 |

### 2.3 Why information flow is in milestone 2

Information flow is a UML 2.5.1 concept (clause 20: `InformationFlow`, `InformationItem`), drawn as a dashed «flow» line
with the conveyed classifiers named by it. It is not one of Annex A's fourteen diagram types, which are milestone 1's
scope (decision D4); tools list it as a diagram kind (`proposal.md` §3.4), which is why it is one of the 28. It sits here
because it is a plain typed graph (`proposal.md` §4.3, G3) like the data flow diagram: no stage of milestone 1 builds
anything it needs beyond the looks it borrows, and those looks (the component, from stage 5) exist only after 0.22.0. Its
one new thing, a line that names what it carries, is the data flow diagram's too. Small (`proposal.md` §3.3: S), it
shares this milestone's review of flow labels, the PDF's line rows (S17) and the Bookshop's component view, whose
elements it shares in the atlas.

### 2.4 Typed C4 and today's maps (S12)

Maps already draw C4-like pictures. A map's cards carry a `kind` and are drawn in one card-shape style (people, browsers,
phones, cylinders, pipes); `umlimator.py import` turns Structurizr DSL, C4-PlantUML and Mermaid's C4 diagrams into maps,
working out each view's level, its includes and its implied lines in Python and writing them as cards, boxes and lines.

Typed C4 is a diagram family beside them, not a change to them:

- **Maps draw exactly as now.** No file of `src/map/` but `context.js`'s one guard (S8, typed views whose type does not
  unfold only) changes; a view
  with no `diagram` takes today's path; the geometry hashes and the stills hold.
- **Elements are typed** (`c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`,
  `c4.ContainerInstance`), with `description`, `technology` and `external` in `props` (M9: the type reads `props` only,
  never `sublabel` or `what`), and **views are typed by level**, each checking what it may show (§5.1).
- **What a map import works out once, the type works out when it draws**: a view's implied lines (§5.2) and its boundary
  (§7.5.1), so an edit to the model shows in every view.
- **The shapes are the map's** (the maintainer's decision of 13 Nov 2026: later non-UML types reuse the map's shape set
  where their standard allows; C4 is notation-independent). A typed C4 element and a map card of the same thing have the
  same outline; the typed one is sized by its text and shows C4's three lines (S11).
- **One model may hold both** (C8). Their elements are different elements: a map's card has no `type`, so it cannot share
  an id with a typed element (the atlas stops on it, Q12).
- **No conversion in 0.24.0.** C8 says an explicit command, never `migrate()`, upgrades a map. A map from C4 sources keeps
  an element's C4 type only as a sub-line, and not at all when it has a technology (Q9), so a converter would guess.

| Option | For | Against |
|---|---|---|
| **(a) Maps stay maps; typed C4 from Structurizr JSON and from JSON; no conversion in 0.24.0; C8 restated (recommended)** | Nothing existing changes; no guess; Structurizr's own tooling writes JSON from DSL | A team with DSL and no Structurizr tooling gets maps only |
| (b) `umlimator.py import --typed` for the three C4 sources: the Python readers also record each element's C4 type (`ext.c4`), and a JavaScript helper turns that map into typed views | Typed C4 from every source the importer reads | Two writers of typed C4 (Python and the helper) to keep in step; the maps written gain a field |
| (c) A `c4FromMap()` helper guessing each card's type from the view's level | No change to the importer | Wrong where a map does not follow C4's levels, silently |

### 2.5 The core's budget (C5, S18)

The maintainer's split of 13 Nov 2026 gives milestone 2 1,400 B of the 4,451 B left under the 15% cap. Everything below
stays out of the core, in files listed in `tools/build.mjs`'s `ALL` only:

- the five types, their shapes, looks, rules, `describe()`, names, legends and hooks;
- the line ends and their skins (`ENDS` rows added from `src/er/er.js`; the export itself is in `src/typed/draw.js`, which
  is not core, and is M2.2's, after 6.3's row);
- the activity type's `unfolds: true` (`src/uml/activity.js`, one field, M2.1);
- the scope rules, implied lines, boundaries, dynamic numbering, DFD numbering and balancing;
- the `D` gesture, through `edits.key` (5.2);
- the four readers and the DBML adapter.

What may touch the core, each change stating its bytes in its pull request:

| Change | File | Lane | Target |
|---|---|---|---|
| `addView { view, index? }` and its line in the header comment (S7) | `src/core/apply.js` | M2.1 | 160 B |
| A card of a typed view unfolds in place only when its type says `unfolds` (S8): `unfoldable` also refuses when `v.diagram && !(diagramOf(v) \|\| {}).unfolds` (`diagramOf` is imported there already) | `src/map/context.js` | M2.1 | 13 B (measured) |
| The PDF's lines table asks a type's `text(model, view, id)` before `label` (S17) | `src/page/print.js` | M2.1 | 30 B |
| The registry's pointer line names the new fields (`text`, `unfolds`; `ENDS` open to families), after 6.1's line in the comment above `const TYPED = {}` | `src/core/registry.js` | M2.1 | 50 B |
| | | | **253 B** |

| Option | For | Against |
|---|---|---|
| **(a) At most the 1,400 B share; targets 253 B; anything over the share waits for the maintainer (recommended)** | The split as decided; about 1,147 B of slack for what the type lanes find | None for this milestone |
| (b) At most the targets plus 25%, about 310 B; the rest of the share to the reserve now | Leaves more for milestone 4b, whose BPMN events and flow scopes may need the router | A type lane that finds a core need waits for the maintainer |
| (c) No core byte: `addView` done by the host, the unfold guard in the typed editor, R9 left open | Nothing spent | `D` cannot be built (the reference store applies commands only); the guard belongs to `unfoldable`; information flow prints no conveyed items |

### 2.6 Rules every package keeps

- **Maps draw exactly as now.** The geometry hashes (`bench/expected.json`), the examples' stills and every map test
  hold in every pull request (C1). The unfold guard is reached only when a view has a `diagram`, the PDF's `text` only
  from a type that gives it, and `addView` only when a command names it.
- **Every typed example draws exactly as now.** The class to composite structure examples' markup, held by
  `tests/core-diet.html`, `tests/core-diet.json` and each type's tests. S8 changes what `E` does on a view of a type that
  does not unfold (it opened a box through the map's code); no test draws that. The activity type sets `unfolds`, so
  `fulfil`'s unfolded picture, `tests/atlas.test.mjs`'s `unfoldable` assertion and CI's crossing counts
  (`.github/workflows/check.yml`: `fulfil-activity` 4, `bookshop-atlas` 6) are unchanged; M2.1 runs both.
- **The API is additive only** (C2). The five types, their helpers and the readers are internal, in
  `lib/umlimator-all.js`; `addView` is a new command; the registry's `text` field is optional and provisional. The CLI
  changes only where it refused or did not recognise a file (S16).
- **Nothing after `layoutTyped` edits what it returned** (stage 4 §2.4): implied lines, boundaries and step numbers are
  put on a copy. Each type lays a view out twice from one memo and checks the two pictures are byte-identical.
- **No dependency.** `package.json` and `lib/` gain none; the DBML adapter imports nothing (§8.4).
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1)

The rows of `model.md`, refined.

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 15 | `uml.information-flow` | `uml.Class`, `uml.Interface`, `uml.Component`, `uml.Actor`, `uml.InformationItem`, `uml.Comment` | | `uml.InformationFlow`, `uml.CommentLink` | `props.conveyed`: one or more ids of information items or classifiers, a declared reference (`refs`: `drop`). An item need not be shown to be conveyed. A flow's `label` is its name, drawn before what it conveys when given |
| 20 | `er` | `er.Entity`, `uml.Comment` | `er.Column` | `er.Relationship`, `uml.CommentLink` | Column props as `model.md`; `references` a column id, a declared reference (`drop`). A row is `name type [PK] [FK table.column] [UK] [NULL]` (S9). Relationship: `identifying`, `ends.<end>.multiplicity`, from the referenced entity to the referring one (rule 7). `notation`: `crowsfoot` (default) or `idef1x`, a repaint |
| 21 | `flowchart` | `flow.Terminator`, `flow.Process`, `flow.Decision`, `flow.InputOutput`, `flow.PredefinedProcess`, `flow.Document`, `flow.Database`, `flow.ManualInput`, `flow.Delay`, `flow.Connector`, `uml.Comment` | | `flow.Flow`, `uml.CommentLink` | A decision's exits are labelled flows. A connector with flows in and out is a junction on the page (`21-flowchart.json`'s `A`). `direction` `down` by default for this type |
| 22 | `dfd` | `dfd.Process`, `dfd.DataStore`, `dfd.ExternalEntity`, `uml.Comment` | | `dfd.DataFlow`, `uml.CommentLink` | `props.number` stored on processes and stores. A process's `opensView` names its child level, a `dfd` view whose `parent` is the view the process is on. `notation`: `yourdon` (default) or `gane-sarson`, a repaint |
| 23 | `c4.landscape`, `c4.context`, `c4.container`, `c4.component`, `c4.dynamic`, `c4.deployment` | `c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`, `c4.ContainerInstance`, `uml.Comment` | | `c4.Relationship`, `uml.CommentLink` | Element props: `description`, `technology`, `external`, `shape` (S11). Relationship: `label` its description, `props.technology`. Ownership is `parent`: a container's is a software system, a component's a container, a deployment node's a deployment node or none, an instance's a deployment node. `props.container` (a declared reference, `cascade`). `subject`: the system or container a view zooms into, drawn as a boundary when `nodeIds` lists it. A dynamic view's `edges` are ids, each once, in time order |

What changed against `model.md`:

- **ER rows have a micro-syntax (S9).** The panel's member rows and F2 read and print one line per column.

  | Option | For | Against |
  |---|---|---|
  | **(a) `name type [PK] [FK table.column] [UK] [NULL]`, flags in any order, case ignored; `FK` names the referenced column by its entity's and its own labels, resolved to its id when the row is read (recommended)** | Reads like DDL and DBML (`customer_id bigint FK customer.id`); the drawn row is the same text; `print(parse(x))` stable (E3) | A table or column label holding a space or a dot cannot be named after `FK` in a row: the panel's field sets it (stated) |
  | (b) Mermaid's order, `type name PK, FK "comment"` | The Mermaid reader's own text | Type first reads oddly in a database tool; no place for the referenced column |
  | (c) The panel's fields only | Nothing to parse | A column takes five fields to add; slower by keyboard |

- **A C4 element may carry `props.shape`** (S11, §7.5).
- **A C4 view draws its subject as a boundary only when `nodeIds` lists it**, as `model.md` §1 says of every typed view's
  subject and as the composite structure view does. `23-c4.json`'s container and component views gain their subject in
  `nodeIds`, and its context view the software system as its `subject` (M2.0, §12.2).

  | Option | For | Against |
  |---|---|---|
  | **(a) The boundary is drawn when the view lists its subject (recommended)** | One rule for every typed view; a view may leave the boundary out | Two example views change |
  | (b) A C4 view always draws its subject as a boundary | C4's usual picture with no listing | A second meaning of `subject`; a container view with no boundary cannot be said |

- **A dynamic view's steps are relationships by id, each once (S13).**

  | Option | For | Against |
  |---|---|---|
  | **(a) Ids of model relationships, each once, numbers derived (recommended)** | `23-c4.json` as written; `hide` and `delete` already handle it; a relationship's text is the model's | A request and its reply over one relationship cannot both be steps; a step cannot say more than its relationship (Structurizr allows both; the reader reports them) |
  | (b) Inline steps, as a sequence view's messages, each naming its relationship | Repeats and per-step text | A second line kind in C4 views; its references, hiding and checks; the static views would not show them |

- **`conveyed`, `references` and `container` are declared references** (`refs`), so `delete` drops a conveyed or
  referenced id and takes a container's instances with it (Q7).
- **Numbers stay stored in a DFD** (§6.4).

`check.mjs` gains no hand rule: each type's `validate` runs there.

## 4. Line-end skins (S2, S3)

### 4.1 ER's ends

A relationship's two multiplicities choose its two ends; the view's `notation` chooses how they are drawn. A multiplicity
is read by `multBounds` (Q16) into a lower bound (0 or more) and an upper bound (1 or more):

| Bounds | Crow's foot, at that end | IDEF1X, at that end |
|---|---|---|
| `1` (1..1) | `cf-one`: two bars | nothing at the parent; at the child a dot with `1` beside it |
| `0..1` | `cf-zero-one`: a ring and a bar | at the parent a hollow diamond (an optional parent, so non-identifying: an identifying relationship's parent end is `1`, `identifying-parent`); at the child a dot with `Z` |
| `1..*` (any upper above 1) | `cf-one-many`: a bar and a crow's foot | a dot with `P`, at either end |
| `0..*` | `cf-zero-many`: a ring and a crow's foot | a dot, at either end |
| `2..5`, `3` and other bounds | the nearest of the four by its bounds, with the multiplicity written as an end label | a dot with the multiplicity as its label |
| Unreadable | none, the text as an end label, and `relationship-ends` warns | the same |

Each crow's foot end is 18 px long with the crow's toes on the entity's outline; a ring is hollow (the stage's
background, T2). IDEF1X's dot is a filled 6 px circle on the child's outline and its letters are end labels (Q4). A
many at the parent end (a many-to-many) is IDEF1X's non-specific relationship: a dot at each end, each with its letter;
it is drawn, and IDEF1X's key-based level, which resolves it through an associative entity, is not asked for (§13).
Identifying is solid, non-identifying dashed, in both notations (S10). A self-reference is a loop (F1) with an end at
each of its two places.

### 4.2 How a family adds ends

`ENDS` is exported from `src/typed/draw.js` (M2.2's one line, after stage 6's 6.3, which owns `ENDS`, has merged), and
`src/er/er.js` adds its six rows (`cf-one`, `cf-zero-one`,
`cf-one-many`, `cf-zero-many`, `idef-dot`, `idef-diamond`) at load, as a type adds to `SHAPE`. `TYPED.lines` finds them
by own key (Q3) and builds their markers as it builds the UML ends. The type puts `e.end = { from, to, dashed, labels }`
on each line, as the UML types do: a skin is which names it chooses. Stage 6's 6.3 adds a filled triangle for profile's
extension to the table itself; M2.2 exports it once that has merged, so no M2 package and 6.3 are open on the file at
once.

| Option | For | Against |
|---|---|---|
| **(a) `ENDS` exported; a family adds its rows; IDEF1X's letters are end labels (recommended)** | No core byte; one marker builder; an end label is already placed clear of lines | IDEF1X's letter sits beside its dot by the search, not at a fixed spot |
| (b) A `skins` table in `src/typed/draw.js` keyed by notation | One place lists every skin | A shared file every non-UML type then edits; stage 6 and milestone 4b collide in it |
| (c) Markers carrying text | The letter fixed to the dot | A marker with `<text>` scales and turns with the line; the builder learns a second kind |

### 4.3 One geometry, two skins (S3)

`proposal.md` §2.4 says a notation switch is one geometry with several skins. Here it holds exactly:

- **ER:** the entity is the same box in both; IDEF1X rounds a dependent entity's corners (one whose key holds a foreign
  key, by an identifying relationship) inside the same box; the ends differ.
- **DFD:** each node is sized for the larger of its two skins: a process as an ellipse that holds its number and name
  (Yourdon), drawn as a rounded rectangle with a number band in the same box (Gane and Sarson); a store as the wider of
  two lines with the name between (Yourdon) and an open rectangle with an id box (Gane and Sarson); an external entity as
  a rectangle, with a 4 px shadow inside the box in Gane and Sarson.

A node's shape name carries the skin (`dfd-process-yourdon`); `shape` is not in `NODE_GEO` and `notation` not in
`VIEW_GEO`, so a switch repaints: the memo is kept and no line is routed (F7).

| Option | For | Against |
|---|---|---|
| **(a) One geometry, sized for both skins; a switch repaints (recommended)** | The picture does not move when the notation changes; no layout on the switch | A Gane and Sarson process is as tall as a Yourdon ellipse would be |
| (b) Each skin its own sizes; a switch lays the view out again | Each notation at its own best size | The picture moves on a switch; `notation` joins `VIEW_GEO` |

## 5. Per-view scope rules (S4, S5)

### 5.1 What each C4 view may show

c4model.com's diagrams, checked by the C4 type's `validate(model, view)`. "Error" is what C4 does not draw at that level;
"warning" what its checklist asks for.

| View | Its `subject` | May show | Rule, level |
|---|---|---|---|
| `c4.landscape` | none | people, software systems | `c4-level`, error for anything else |
| `c4.context` | a software system | people, software systems | `c4-level`, error for a container, component, node or instance; `c4-subject`, warning when the subject is missing or not shown |
| `c4.container` | a software system | the subject (its boundary), its containers, people, other software systems, other systems' containers | `c4-level`, error for a component, node or instance; `c4-subject`, error when the subject is not a software system |
| `c4.component` | a container | the subject (its boundary), its components, containers, people, software systems | `c4-level`, error for another container's component, a node or an instance; `c4-subject`, error when not a container |
| `c4.dynamic` | a software system, a container, or none | at the subject's level, as the container or component view; with none, as the context view | `c4-level` as for that level; `c4-steps`, error for a step whose relationship is not in the model, warning for a step whose ends are not shown |
| `c4.deployment` | a software system, or none (c4model scopes a deployment diagram to one system or to all; Structurizr's `softwareSystemId`) | deployment nodes, container instances; with a subject, only instances of its containers | `c4-level`, error for anything else, and for an instance of another system's container when there is a subject; `c4-subject`, error when the subject is not a software system |

Across views, warnings from c4model's checklist (`proposal.md` §3.4): `c4-description` (an element with no description),
`c4-technology` (a container or component with no technology), `c4-label` (a relationship with no description), and
`c4-title` (a view with no title). Errors in the model: `c4-owner` (a container whose owner is not a software system, a
component's not a container, an instance's not a deployment node); `c4-instance` (an instance's `container` is not a
container); `c4-relationship` (a relationship joining a deployment element and a static one, or an element and its own
owner).

### 5.2 Implied relationships (S5, G3)

Structurizr's default: where a relationship's end is not shown, the line is drawn to the nearest owner the view shows,
unless a relationship already joins those two. The type works it out from the model when it lays the view out:

- each model relationship's ends are lifted to their nearest shown owners (a boundary is no end: §7.5.1); a pair with a
  line of its own draws that line; a pair with none draws one implied line, whatever number of relationships it stands
  for; a line lifted onto one element is dropped;
- an implied line is a line of the geometry with no model id: its id is `<from>-><to>` (no model id may hold `->`, M2),
  its label the first relationship's description and `[+k]` when it stands for more, and it is dashed in the legend's
  "implied" look;
- selecting it names the relationships it stands for; F2, Delete and connect on it are refused by the type's hooks, said
  on the hint line ("an implied line: edit Storefront → Shop API in the container view").

| Option | For | Against |
|---|---|---|
| **(a) Derived when drawn, one per pair, read only (recommended)** | What Structurizr and today's import draw; an edit to the model shows everywhere; nothing stored | A line on the picture that cannot be edited there |
| (b) Not drawn; the scope rule warns of the hidden relationship | Every drawn line is a model line | A context view of a model written at container level shows no lines |
| (c) Stored by readers, as the map import does | Plain lines | They go stale after an edit; two truths |

### 5.3 The other types

A DFD level's scope rule is balancing (§6.4). The flowchart, ER and information flow types check only their own
elements and lines (§7). Milestone 4b's BPMN flow scopes (a sequence flow inside its pool, a message flow across pools)
are rules of that type's own; nothing shared is built here for them.

## 6. Levels on drill-down (S6 to S8)

### 6.1 The gesture

`D` on a selected DFD process, C4 software system or C4 container that opens no view makes that view; a double-click or
Enter then opens it, as for any node that opens a view. Through `edits.key` (5.2), no canvas change.
The type returns one transaction:

1. `addView` with a new view: its id from the element's (`<id>-level` for a process, `<id>-containers` or
   `<id>-components` for C4), the next free one; its `diagram` (`dfd`; `c4.container` for a system; `c4.component` for
   a container); `parent` the view it was made from; `title` the element's number and name (DFD) or "`<name>`:
   containers" (C4); C4's `subject` the element;
2. its `nodeIds`: for a process, the far ends of its flows (the context the level must balance) and one new child process
   (`add`), numbered `<n>.1` and named as its parent; for a system, the system (its boundary), its containers and what
   their relationships reach at that level; for a container, the same one level down;
3. for a process, a copy of each of its flows (`add`), the process's end moved to the child process, ids from the flows'
   with `-<n>.1`, the next free, so the level balances from the start (§6.4); the user then splits the child process;
4. `set` of the element's `opensView`.

Undo takes it all back (one transaction). Without a selection, or on another kind, the hook returns null and the canvas
does what it does with `D` (nothing).

### 6.2 `addView` (S7)

```text
addView   { view, index? }   a view, added to views at index (else at the end); refused when its id is a view's
                              already, or it is not an object with a string id. Nothing else is checked: validate() says
                              what the view lacks
```

| Option | For | Against |
|---|---|---|
| **(a) `addView` only (recommended)** | Levels and zoom by keyboard and pointer through the reference store; undo as for every command; about 160 B | A view made by mistake is undone, not deleted |
| (b) `addView` and `deleteView`, with references (`opensView`, `parent`, story steps) cleared | Views managed from the editor | About 350 B more; a new cascade to test; no type in the plan needs it |
| (c) No command; the host makes views | No core byte | Nothing in the library can make a level; DoD 4's "create a level" (`proposal.md` §3.3) needs every host to build it |

### 6.3 A typed card opens, never unfolds (S8)

Unfolding in place (#71) is the map's: it builds a box from the inner view's cards through the map's code. 4.10 kept a
card that opens another kind of diagram from it; a card whose view and opened view share a `diagram` still unfolds. On a
class view it unfolds wrongly, a plain box with the classifier gone (Q5); on an activity view it unfolds correctly, every
node in its shape, and a test and CI's crossing counts hold that picture (Q5). DFD levels and C4's container to component
zoom would be the first typed views to meet the wrong case often. M2.1 makes `unfoldable` refuse a typed view whose type
does not say `unfolds: true`, and sets it on the activity type (13 B of core, measured on a scratch build; one field in `src/uml/activity.js`),
stated in 0.24.0's release section as a reproduced defect (`plan.md` §8).

| Option | For | Against |
|---|---|---|
| **(a) A typed card opens unless its type says `unfolds: true`; the activity type says it (recommended)** | The defect fixed for every type that does not draw unfolding; the activity's working, tested unfolding kept; CI's counts unchanged; a later type opts in by one field | A registry field (provisional, like `text`); 13 B; M2.1 edits `src/uml/activity.js` (no open branch owns it) |
| (b) The guard names the activity type: `v.diagram && v.diagram != 'uml.activity'` | About as many bytes; no new field | A type's name in the map's code; a later type that unfolds edits `context.js` |
| (c) A typed card never unfolds, the activity's too | One rule, about 5 B | Takes away a working, tested picture; M2.1 also owns `tests/atlas.test.mjs` (its `unfoldable` assertion) and `.github/workflows/check.yml` (`fulfil-activity` 4 to 2, `bookshop-atlas` 6 to fewer); a picture change for the maintainer |
| (d) Typed unfolding: each type unfolds a node into its level, laid out by the type | DFD's picture of a level in place | A typed unfolding strategy per type; later work, for the maintainer |

### 6.4 DFD numbers and balancing

- **Numbers** are stored (`props.number`), as DFD practice keeps a process's number when the picture is redrawn. A child
  level's processes are numbered under its parent's (`1.1`, `1.2` under `1`); stores keep theirs (`D1`) at every level.
  `dfd-numbers` warns of a process numbered outside its parent's, and of a number used twice. The palette's add gives the
  next free number under the view's parent process.

  | Option | For | Against |
  |---|---|---|
  | **(a) Stored, checked (recommended)** | `model.md` and the example as written; numbers survive a reorder | A user may number badly; the rule says so |
  | (b) Derived from the order of `nodeIds` (rule 9) | Never wrong | A process's number changes when another is added; references to "process 3" in documents break |

- **Balancing** (`dfd-balance`, an error, `proposal.md` §3.4): for a process that opens a level, the flows between the
  process and anything else at its own level must match the flows in the level between one of the level's processes and
  an element that is not one and is shown on the parent view: each pair by label, far end and direction. A store
  introduced at the child level only (a local store, which Yourdon and DeMarco allow) is not a boundary, so its flows are
  not counted. The rule names what is missing on each side. `22-data-flow.json` balances (Q14); `dfd-stress.json` holds
  a local store (§10).

  | Option | For | Against |
  |---|---|---|
  | **(a) By label, far end and direction (recommended)** | Catches a flow drawn to the wrong store; the example passes | A flow split into two at the child level (Yourdon allows it, with a data dictionary) does not balance |
  | (b) By label only | Allows a far end shown differently | Misses a flow that changed its source |

### 6.5 C4's zoom

A software system's `opensView` names its container view, a container's its component view: `c4-zoom` warns when the view
opened is a C4 view whose subject is not that element. A view of another kind (a database's ER schema, a worker's
activity) is not checked: it is drill-down to another notation, as the atlas's links do (§12.5). `D` makes it (§6.1). The page's breadcrumbs follow `view.parent`, as for
maps and the other typed views.

## 7. The five types

Each type: laid out by `layoutTyped` from the host's ranking with `repair: false` and `reroute: false` (S19), a `gap` of
48 px with `gapAfter`'s widening, `labelGaps` (stage 5, decision 9) where its lines carry labels, and `cut: 280` on line
labels; its rules each with a passing and a failing fixture; `describe()`; accessible names for every node and line (A1);
a legend; 4.9's `rows` and `word`; and S17's `text` for the PDF's lines.

### 7.1 ER (`src/er/er.js`)

**The entity** (shape `entity`): the name in a 24 px header, then the key columns (`primaryKey`), a divider, then the
rest, each row `name type` with its flags as marks in a left column (`PK`, `FK`, `UK`, and `?` for a nullable column),
the type in `--um-muted`; 120 to 320 px wide, text cut with `fit`; `present.<id>.rows` and `collapsed` as the classifier's
(stage 1 §5). A row's text is S9's. Lines end on the entity's box (no column ends: §13).

| Rule | Level | Says |
|---|---|---|
| `pk-exists` | warning | an entity has a primary key column |
| `column-names` | error | column names are unique within an entity |
| `fk-target` | error | a column's `references` names a column of an entity; a warning when that column is neither a key nor unique |
| `fk-flag` | warning | a column with `references` is a foreign key, and a foreign key has `references` (a Mermaid import leaves it out: §8.1) |
| `relationship-fk` | warning | a relationship from A to B has a column of B that references a column of A (rule 7's direction) |
| `identifying-key` | error | an identifying relationship's foreign key columns are part of the child's primary key |
| `identifying-parent` | error | an identifying relationship's parent end is `1`: a key column cannot be null, so the parent is neither optional nor many |
| `relationship-ends` | error, warning | each end's multiplicity is readable (`multBounds`); a warning where it is not one of the four forms (drawn as the nearest, with its text) |

Hooks: `member` reads a row (S9); `connect` adds a relationship from the selected entity to the one dropped on, `1` to
`0..*`, non-identifying; `rename` on a relationship sets its label. Properties: a column's flags, type and references; a
relationship's `identifying` and its two multiplicities. Accessible names: "Table order_line, key order_id and line_no,
4 columns"; "Identifying relationship contains from order (exactly one) to order_line (one or more)".

### 7.2 Flowchart (`src/flowchart/flowchart.js`)

Laid out `down` by default (`model.md` row 21's example, the usual flowchart).

| Node | Shape | Drawn |
|---|---|---|
| `flow.Terminator` | `terminator` | a stadium round its text |
| `flow.Process` | `process` | a rectangle, square corners |
| `flow.Decision` | `diamond` (stage 4's, read only) | text on two lines inside |
| `flow.InputOutput` | `io` | a parallelogram leaning right |
| `flow.PredefinedProcess` | `predefined` | a rectangle with a second line inside each side |
| `flow.Document` | `doc` | a rectangle with a wavy bottom (ISO 5807's, not the map's folded page) |
| `flow.Database` | the map's `cylinder` (drawn with a typed `draw` over its `out` and `det`) | a cylinder |
| `flow.ManualInput` | `manual` | a rectangle with its top sloping up to the right |
| `flow.Delay` | `delay` | a D: flat left, half round right |
| `flow.Connector` | `connector` | a 28 px circle with its label (one or two characters) inside |

Each shape gives `size`, `out`, `inset` (ends slid onto it, stage 4 §4.2), `face`, `ports` and `draw`; text by
`flowWrap`, three lines of 180 px, then cut.

| Rule | Level | Says |
|---|---|---|
| `flow-ends` | error | a flow joins two flowchart nodes |
| `start-end` | warning | the view has exactly one start (a terminator with no flow in; `proposal.md` row 21's "One start") and at least one end (a terminator with no flow out) |
| `terminator-flows` | warning | a start has one flow out; an end has none out |
| `decision-exits` | warning | a decision has two or more flows out, each labelled, no two with one label |
| `reachable` | warning | every node is reached from a start |

Hooks: `connect` labels a decision's second exit `no` when its first is `yes` and neither has a label; `rename` on a flow
sets its label. Accessible names: "Decision Fit for resale?, exits yes to Refund the payment, no to Rejection letter".

### 7.3 Data flow (`src/dfd/dfd.js`)

Shapes per §4.3, one geometry, two skins; a process's number on its own line above its name (Yourdon) or in its top band
(Gane and Sarson); a store's number before its name or in its id box. Flows are solid with a filled arrow; their labels
cut at 280.

| Rule | Level | Says |
|---|---|---|
| `dfd-flow-process` | warning | a flow has a process at one end at least (no flow between two stores, two entities, or an entity and a store) |
| `dfd-process-io` | warning | a process has a flow in and a flow out |
| `dfd-flow-label` | warning | a flow to or from a process has a label |
| `dfd-numbers` | warning | §6.4 |
| `dfd-balance` | error | §6.4 |
| `dfd-level` | warning | a process's `opensView` names a `dfd` view whose `parent` is a view showing the process |

Hooks: `key` (`D`, §6.1); `add` numbers a new process under the view's parent process; `connect`; `rename` on a flow sets
its label. Properties: a process's or a store's `number` (`set`, checked by `dfd-numbers`). Accessible names: "Process 1 Take order, opens level 1 Take order, 2 flows in, 2 out".

### 7.4 Information flow (`src/uml/information.js`)

A class, interface or component is drawn by its own type's look (class.js, structure.js; read only), an actor by the use
case type's; an information item as a classifier with a small filled triangle in its top right corner (UML 2.5.1
§20.2.4). A flow is a dashed line with an open arrow, «flow» over its label, which names what it conveys (`Order, Card
details`), cut at 280; with a name, `name: Order, Card details`.

| Rule | Level | Says |
|---|---|---|
| `conveyed-some` | error | a flow conveys one element at least (UML: `conveyed` is 1..*) |
| `conveyed-kind` | error | each conveyed id is an information item or a classifier of the model |
| `flow-ends` | error | a flow joins two of the view's classifiers or actors, never an information item or a comment |

Hooks: `connect` asks which item to convey by `{ pick, then }` among the model's information items and classifiers;
properties: `conveyed` as a list of names (resolved by label). Accessible names: "Information flow from Shopper to
Storefront, conveys Order and Card details".

### 7.5 C4 (`src/c4/c4.js`, `src/c4/views.js`)

`c4.js` holds the elements, their look, the boundaries, implied lines and the four static views; `views.js` the dynamic
and deployment views, on `c4.js`'s helpers. One definition per file, registered under its view names.

**The element** (shape `c4`): the outline, `det` and `face` of the map's shape that `props.shape` names (S11, Q2), sized
by its text: the name (13 px, 600), `[Container: technology]` (or `[Software System]`, `[Person]`; 10 px, muted), and the
description wrapped to four lines of 220 px, then cut; 160 to 280 px wide. An external element is drawn grey, its fill
and outline in the muted tone, as c4model.com draws an external system; not dashed, which in C4 marks a boundary
(§7.5.1) and here also an implied line (§5.2). (A map's external card stays dashed: maps draw as now.) Its accessible
name: "Container Shop API, Python, FastAPI: Catalogue, basket,
checkout and accounts as a JSON API".

| Option | For | Against |
|---|---|---|
| **(a) `props.shape` names a map shape; a person is `person`, the rest `box` by default (recommended)** | Structurizr's element styles map onto it (the reader); one shape per element in every view | A new prop |
| (b) Guessed from the technology's words, as the importer guesses kinds | Nothing to write | Wrong for unusual stacks; the importer's guess list is a known ceiling |
| (c) `present.<id>.shape`, per view | Presentation stays per view (rule 10) | A database drawn as a cylinder in one view and a box in another; every view repeats it |

**Relationships**: solid with an open arrow, the description and `[technology]` under it, cut at 280; dashed when
implied (§5.2).

**Editing** (`proposal.md` row 23's "Type and technology fields"; DoD 4). Properties, each by `set`: an element's
`description`, `technology`, `external` and `shape` (a list of the map's shapes); its type, a choice among `c4.Person`,
`c4.SoftwareSystem`, `c4.Container` and `c4.Component` (`set` of `type`; `c4-owner` and `c4-level` then say what no
longer fits); an instance's `container` (a choice among the model's containers); a relationship's description (its
`label`, also by F2) and `technology`. Hooks: `add` gives a new element the view's level (a container in a container
view, its `parent` the subject); `connect` adds a relationship; `key` (`D`, §6.1).

**The key** (C4 asks for one): the legend names each element type and shape drawn, external, the relationship and the
implied line.

#### 7.5.1 The static views and boundaries

`ownersOn` builds the boxes with `boxTypes` `c4.SoftwareSystem` and `c4.Container`, `qualify: false`: a view's subject,
when listed, is a dashed box titled "`<name>` [Software System]" or "[Container]" holding what it owns that the view
shows. The boundary's own relationships are not drawn: in C4 the boundary is not an element of its view, and its
contents' relationships, which cross its border as stage 2's lines do, say what it does. Nothing is lifted onto a
boundary (§5.2).

#### 7.5.2 The dynamic view (S13)

The layered layout over the steps' elements; each line's label is `k. description [technology]`, `k` its place in
`edges`. A relationship listed in a dynamic view and not in another is drawn once; reordering steps is `move { id, view,
index }` (1.6), by Alt + arrows on a selected line, through the type's `moveTo`.

#### 7.5.3 The deployment view

Deployment nodes nest as boxes (`ownersOn`, `boxTypes` `c4.DeploymentNode`), titled "`<name>` [Deployment Node:
technology]"; container instances are elements drawn as their container (its shape, name, technology and description,
with "Instance of" in the accessible name). Relationships between instances are the model's (`23-c4.json` writes them
out); none is derived from the containers' (§13).

## 8. Readers (S15, S16)

Each in `src/readers/`, in `lib/umlimator-all.js` only: hand-written and linear, a report of `skipped` and
`approximated` items (R1, R2), ids from the source's names (R3), a pinned test file of every construct the source's
documentation shows (R4). Limits on hostile input (R2):

- **Text** (the two Mermaid readers): over 1 MiB of characters, nothing is read and the report says so, as the existing
  readers do (`MC_LIMIT`).
- **Parsed objects** (`readStructurizr(json)`, `readDbml(database)`): a character limit cannot apply, so counts do: at
  most 10,000 elements, 10,000 relationships and 10,000 columns, and nesting (Structurizr's `deploymentNodes[].children`)
  read 64 deep, deeper read flat from there and reported (`MT_DEEP`'s way, `src/readers/mermaid-state.js`). An input
  that is not an object, or a field of the wrong kind (a list that is not an array, a name that is not a string), is
  skipped and reported, never thrown on.
- **Names**: every table keyed by a name or slug has no prototype (`mcTable`'s way, `src/readers/mermaid-class.js`), so
  `__proto__` or `constructor` is an ordinary name.
- **The CLI** checks a file's size (1 MiB) before it parses JSON or hands a `.dbml` file to `@dbml/core` (§8.5). Each reads into `model.md`'s vocabulary and depends on no type's code, as 1.10 did, so the
reader lanes run beside stage 6.

### 8.1 Mermaid ER (`src/readers/mermaid-er.js`)

Against Mermaid 12.3.0's entity relationship page. `readMermaidEr(text)`, `writeMermaidEr(model, viewId?)`.

| Mermaid | Model |
|---|---|
| `CUSTOMER { type name PK, FK "comment" }` | an entity and its columns; `PK`, `FK`, `UK`; the comment kept under `ext.mermaid` (reported once) |
| `A ||--o{ B : places` | a relationship from A to B, `1` to `0..*`, label `places`; `\|\|` `1`, `\|o` and `o\|` `0..1`, `}\|` and `\|{` `1..*`, `}o` and `o{` `0..*` |
| The word forms of an end: `only one`, `1`; `zero or one`, `one or zero`; `one or more`, `one or many`, `many(1)`, `1+`; `zero or more`, `zero or many`, `many(0)`, `0+` | the same four multiplicities as the symbols |
| `--` and `..`, and their word forms `to` and `optionally to` | identifying and non-identifying |
| `p[Person]`, quoted names | label `Person`, id from the alias |
| `direction` | the view's `direction` |
| styles, classes, `accTitle` | skipped |

Mermaid says nothing of which column a foreign key references: `references` is left out and reported once per file
(`fk-flag` warns of each). The writer keeps it as `%% references: order.customer_id customer.id`, and an id the reader
would not derive as `%% id:`. `read(write(model))` equals the model for `20-entity-relationship.json` and 500 generated
models.

### 8.2 Mermaid flowchart (`src/readers/mermaid-flowchart.js`), ported

The grammar of the importer's `flowchart()` (`umlimator_import.py`, Q10: node groups with `&`, links with text in pipes
or inline, subgraphs, `;`), in JavaScript, against Mermaid 12.3.0's flowchart page, with its shapes kept:

| Mermaid | Model |
|---|---|
| `([text])`, `@{ shape: stadium }`, `terminal`, `pill` | `flow.Terminator` |
| `[text]`, `@{ shape: rect }` | `flow.Process` |
| `(text)` | `flow.Process`, approximated (Mermaid's rounded box has no flowchart meaning) |
| `{text}`, `@{ shape: diam }` | `flow.Decision` |
| `[/text/]`, `[\text\]`, `@{ shape: lean-r }`, `lean-l` | `flow.InputOutput` |
| `[[text]]`, `@{ shape: subproc }`, `fr-rect` | `flow.PredefinedProcess` |
| `@{ shape: doc }` | `flow.Document` |
| `[(text)]`, `@{ shape: cyl }` | `flow.Database` |
| `@{ shape: manual-input }`, `sl-rect` | `flow.ManualInput` |
| `@{ shape: delay }` | `flow.Delay` |
| `((text))`, `@{ shape: circle }` | `flow.Connector` |
| `{{ }}`, `[/ \]`, `[\ /]`, `>]`, `(((`, other `@{ shape }` | `flow.Process`, approximated |
| `-->`, `---`, `-.->`, `==>`, `<-->` | a flow; a line with no arrow, dotted or thick approximated; `<-->` two flows |
| `subgraph … end` | its nodes read; the group skipped (row 21 has none) |
| `TB`, `TD`, `LR`; `RL`, `BT` | `direction` `down`, `right`; the last two approximated |
| `classDef`, `class`, `style`, `linkStyle`, `click`, `~~~` | skipped |

The writer writes Mermaid 12.3.0's `@{ shape: … }` for the four shapes the bracket forms lack. `read(write(model))`
equals the model for `21-flowchart.json` and 500 generated models. The Python importer keeps its own grammar for maps
(S16); both are tested on one shared file of every construct, so they read the same nodes and links.

### 8.3 Structurizr JSON (`src/readers/structurizr.js`)

The workspace JSON (Structurizr's published schema): `model.people`, `softwareSystems` with `containers` and their
`components`, `deploymentNodes` with `children` and `containerInstances`, each element's `relationships`; `views`'
`systemLandscapeViews`, `systemContextViews`, `containerViews`, `componentViews`, `dynamicViews` and `deploymentViews`;
`configuration.styles.elements` by tag. `readStructurizr(json)`; no writer (§13).

- **Ids** (R3): an element's `properties["structurizr.dsl.identifier"]` when the DSL wrote one, else its name, slugged;
  never Structurizr's numeric id, which changes when the workspace is regenerated. A relationship `<from>-<to>`, the next
  free.
- **Shapes**: an element's tags, in order, matched to `styles.elements`; the first style with a `shape` gives
  `props.shape` (`Person`, `Robot`, `WebBrowser`, `Window`, `MobileDeviceLandscape` and `…Portrait` as `mobile`,
  `Cylinder`, `Pipe`, `Folder`, `Hexagon`, `Box`, `RoundedBox` as `box`; `Component`, `Ellipse`, `Circle` approximated as
  `box`).
- **External**: `location: "External"` or the tag `External`.
- **Views**: each with its key as id (slugged), `subject` its `softwareSystemId` or `containerId`, `nodeIds` its
  `elements`, the subject listed when the view draws its boundary (Structurizr draws it in container and component views);
  a dynamic view's `relationships` ordered by `order`, each an id once (S13: a repeat, or a `description` that differs
  from its relationship's, is approximated: the first kept, reported); a deployment view's `environment` in its title.
- **Skipped, each reported**: implied relationships (`linkedRelationshipId`; the type derives them, §5.2), software system
  instances and infrastructure nodes, groups, filtered, custom and image views, perspectives, element properties other than
  the identifier, documentation and decisions, `animations`, element positions (D1, as R5 for BPMN).

### 8.4 DBML (`src/readers/dbml.js`)

`@dbml/core` (Apache-2.0, `proposal.md` §6.4) parses DBML into a `Database`: schemas, tables with fields (`name`,
`type.type_name`, `pk`, `unique`, `not_null`), indexes (a composite primary key), refs with two endpoints (`tableName`,
`fieldNames`, `relation` `1` or `*`). The adapter reads that object:

`readDbml(database) -> { model, report }`: tables as entities, fields as columns, a composite key's fields as `primaryKey`,
each ref as an `er.Relationship` from its `1` end to its `*` end (`1` to `0..*`, or `0..1` and `1` for one to one) with
`references` on the referring columns, identifying when they lie in the child's key. Enums, notes, table groups, other
indexes, defaults and several schemas' names reported.

| Option | For | Against |
|---|---|---|
| **(a) The adapter reads `@dbml/core`'s parsed `Database` and imports nothing; a host parses with `@dbml/core`, which it installs; `umlimator.py import x.dbml` runs it through Node when `@dbml/core` resolves there, else says how to install it (recommended)** | No dependency or peer in `package.json` (D8); in `lib/umlimator-all.js` like any reader; tested against a `Database` captured once from a pinned `@dbml/core` into `tests/import/` | A host calls two functions, not one; the captured fixture must be renewed when `@dbml/core` changes its model |
| (b) A subpath export `umlimator/dbml` importing `@dbml/core` as an optional peer | One call | A peer in `package.json`, a second build output, an install in CI |
| (c) An own DBML subset reader | No dependency at all | A grammar to keep, which `@dbml/core` already keeps |
| (d) Left out | Nothing to build | `plan.md` §5 names it |

### 8.5 The CLI (S16)

`umlimator.py import` (`cmd_import`), by format:

| Source | Today | From 0.24.0 |
|---|---|---|
| Mermaid `erDiagram` | refused ("not a flowchart, graph or C4 diagram") | the ER reader in Node: a typed `er` model |
| Mermaid `flowchart`, `graph` | a map (Python) | a map, as now; `--typed`: the flowchart reader in Node |
| Structurizr JSON workspace (`model` and `views` at the top) | not recognised | the Structurizr reader in Node: typed C4 |
| `.dbml` | not recognised | the DBML adapter, with `@dbml/core` if it resolves from the working folder (the CLI runs Node with `--input-type=module -e`, which resolves a bare name from there, not from `NODE_PATH`); else a message saying how to install it, and nothing written |
| Structurizr DSL, C4-PlantUML, Mermaid C4, compose, Kubernetes | maps | maps, as now (S12) |

| Option, a Mermaid flowchart | For | Against |
|---|---|---|
| **(a) A map by default; `--typed` for the typed reader (recommended)** | Nothing that worked changes; a map keeps its subgraph boxes, which row 21 lacks | Two outputs for one source |
| (b) Typed by default from 0.24.0, a stated exception | One answer per source; flowchart shapes kept | Breaks a host that imports flowcharts as maps; subgraphs lost |

## 9. `describe()`, the PDF and the legend (S17)

Each type gives `describe(model, viewId)` (what the view holds, then each line by its accessible name, in reading order),
accessible names, a legend, `word` and `rows`:

| Element | `word` | `rows` |
|---|---|---|
| Entity | Table | its columns, as S9 prints them |
| Flowchart node | its symbol's name (Decision, Input/output, …) | none |
| Process, store, external entity | Process, Data store, External entity | the process's number and the level it opens |
| Information item | Information item | the flows that convey it |
| C4 element | its type (Container, …) | technology, description, and for an instance its container |

**The lines table.** It shows a line's `label` (Q11), which is not where these types keep what a line says: information
flow's conveyed elements, ER's multiplicities and identifying, C4's technology. A type may give `text(model, view, id)`,
which `src/page/print.js` shows in place of `label` when it returns text (about 30 B).

| Option | For | Against |
|---|---|---|
| **(a) A registry field `text`, read before `label` (recommended)** | Information flow's PDF says what travels; the four stage 4 types could close R9 the same way later, each in its own file | About 30 B of core |
| (b) Each type writes a derived `label` into a copy of the model before printing | No core byte | `print.js` reads the model, not the type's copy; a second model per view |
| (c) R9 left open for these types too, stated | Nothing to build | An information flow diagram's PDF names no information |

## 10. Fixtures

From `risks.md` §6 (G3, ER) and the rules above. Each lives in `tests/`, is laid out in Node and in Chrome under three
fonts and both themes, right and down, with no overlap, no text overflow, no line through a node, every end on its
outline within 1 px, and no label over a node.

| Fixture | Holds |
|---|---|
| `er-minimal.json` | Two entities, one key each, one non-identifying relationship |
| `er-stress.json`, view `edge-cases` | A composite key; a self-reference; a many-to-many through a junction; a many-to-many drawn directly (IDEF1X's non-specific relationship); an identifying relationship with an optional parent (`identifying-parent`, error); a foreign key in the primary key (identifying); a nullable foreign key (IDEF1X's diamond); each of the four crow's foot ends and a `2..5`; two relationships between one pair; an entity of 40 columns with `rows: 8`; an unreadable multiplicity (warned); a second view of the same in `idef1x` |
| `er-stress.json`, view `all` | 50 entities, 60 relationships (P1) |
| `flowchart-minimal.json` | A start, a process, an end |
| `flowchart-stress.json`, view `edge-cases` | Every symbol; two starts (warned); a decision with three exits; a loop back to an earlier node; a connector as a junction; a 120-character label; a node no start reaches (warned) |
| `flowchart-stress.json`, view `all` | 60 nodes, 70 flows (P1) |
| `dfd-minimal.json` | An entity, a process, a store, two flows |
| `dfd-stress.json`, views `edge-cases` | Three levels, the second balanced and the third not (the error names the missing flow); a local store at the second level (balanced still); a level made by `D` (balanced); both notations of one level; a flow between two stores (warned); a process with no flow out (warned); a process numbered outside its parent's (warned) |
| `dfd-stress.json`, view `all` | 50 nodes, 60 flows (P1) |
| `information-flow-minimal.json` | An actor, a component, one flow conveying one item |
| `information-flow-stress.json`, view `edge-cases` | A flow conveying six elements (its label cut); two flows each way between one pair; an item conveyed and not shown; a conveyed id that is gone (error); a flow conveying a class |
| `information-flow-stress.json`, view `all` | 40 nodes, 60 flows (P1) |
| `c4-minimal.json` | A person, a software system, a relationship |
| `c4-stress.json`, views | Each of the six kinds; an implied relationship and one hidden by a direct one (G3); a container view showing another container's component (error); deployment nodes five deep with instances; a dynamic view of 12 steps; descriptions of 300 characters; every shape |
| `c4-stress.json`, view `all` | 50 elements, 70 relationships (P1) |
| `tests/notation.html` | Its end checks gain the six ER ends, «flow», and the implied line |

The five target examples move to `examples/bookshop-schema.json`, `examples/returns-flowchart.json`,
`examples/bookshop-data-flow.json`, `examples/order-information-flow.json` and `examples/bookshop-c4.json` (M2.13), and
join the gallery and CI.

## 11. Performance (S19)

| Fixture | Budget, in Node, CPU time, best of seven after a warm-up |
|---|---|
| Each stress fixture's `all` view | A full layout plus SVG markup under 1 s |
| The same view | An edit that moves nothing (a description's technology on C4, a column's type on ER), laid out and drawn, under 100 ms; CI holds 1 s and prints it |
| The same view | The common edit, laid out and drawn: a column added (ER, its entity grows); a decision's label (flowchart); a flow's label (DFD); a conveyed element added (information flow); an element's description (C4, its node grows); under 100 ms, CI holds 1 s and prints it |
| `er-stress.json` | A notation switch repaints with no layout: the memo's run count does not move |

Stage 5's types measured about 95 to 160 ms for their common edits on a loaded laptop; C4's descriptions make nodes up to four
lines taller, so M2.6 measures its view first and reports in its pull request before M2.7 starts. Browser timings under
headless virtual time prove nothing (1.11).

## 12. Work packages

### 12.1 Before milestone 2 starts

- This note is approved, and `model.md` and `risks.md` take §15's changes with it.
- Stage 6's note is approved (its §13 is what §12.4 orders against; Q17).
- Stage 6's 6.0 (its files in `ALL`) has merged before M2.0.

### 12.2 The packages

Each is one pull request. "Owns" lists the only files that package changes while it is open. Built files
(`lib/umlimator.js`, `lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes
`src/`, after merging `main`, never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a
package proposes its row and writes its release notes in its pull request's description for M2.14 to gather.

| # | Work package | Owns | Depends on | Done when |
|---|---|---|---|---|
| M2.0 | **Files and ids** (the lead). The milestone's sources as empty files, in `ALL` after stage 6's, in load order: `er/er`, `flowchart/flowchart`, `dfd/dfd`, `uml/information`, `c4/c4`, `c4/views`, `readers/mermaid-er`, `readers/mermaid-flowchart`, `readers/structurizr`, `readers/dbml`. The five target examples take §12.5's ids, and `23-c4.json` §3's subjects | `tools/build.mjs`, the ten empty files, `docs/diagrams/examples/15-information-flow.json`, `20-entity-relationship.json`, `21-flowchart.json`, `22-data-flow.json`, `23-c4.json` (an exception to 5.8's and 6.6's `docs/`: neither edits these five; 5.8 changes `04` to `06` and `check.mjs` there, 6.6 `07`, `14` and `check.mjs`) | This note; stage 6's 6.0 | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; `check.mjs` passes; no other lane edits `ALL`; the five files' ids share none with stage 6's examples as they stand on `main` or on 6.6's branch, if open (Q17) |
| M2.1 | **Engine.** `addView` (§6.2); `unfoldable`'s guard and the activity type's `unfolds: true` (§6.3); the PDF's `text` (§9); the registry's pointer line | `src/core/apply.js`, `src/map/context.js`, `src/uml/activity.js` (its `unfolds` field only), `src/page/print.js`, `src/core/registry.js` (the comment above `const TYPED = {}` only), `tests/apply.test.mjs` (adds cases), `tests/unfold.test.mjs` (adds cases), `tests/print-typed.test.mjs` (adds cases) | M2.0; stage 6's 6.1 merged (it owns `apply.js` and that comment, Q17) | Maps unchanged (geometry hashes, stills, `tests/unfold.html`, `tests/edit.html`); `addView` adds, refuses a taken id, and undoes byte-identical; Q5's class case opens, never unfolds; `fulfil`'s `call-payment` still unfolds, `tests/atlas.test.mjs` and CI's example loop (`fulfil-activity` 4, `bookshop-atlas` 6) pass unchanged; a test type's `text` shows in a PDF's lines table and a type without it shows `label`; the core's bytes before and after, within §2.5 |
| M2.2 | **ER.** §4.1, §4.2, §4.3, §7.1: `ENDS` exported, the entity, the six ends and both skins, S9's rows, rules, `describe()`, names, legend, `rows`, `word`, `text`, hooks | `src/er/er.js`, `src/typed/draw.js` (its export line only), `tests/er.test.mjs` (new), `tests/er.html` (new), `tests/embed.py` (appends its page) | M2.1; stage 6's 6.3 merged (it owns `ENDS`) | Definition of done 2 (drawing; the reader's half in M2.14), 4, 5, 6 and 8 on row 20; every gesture by pointer and key through `apply()`; a 30-step session undone, redone and reopened byte-identical; `20-entity-relationship.json` lays out clean right and down in both notations; a switch lays nothing out |
| M2.3 | **Flowchart.** §7.2 | `src/flowchart/flowchart.js`, `tests/flowchart.test.mjs`, `tests/flowchart.html`, `tests/embed.py` (appends) | M2.0 (M2.1 for `text`) | As M2.2 on row 21; `21-flowchart.json` clean down and right |
| M2.4 | **Data flow.** §4.3, §6.1, §6.4, §7.3: both skins, numbers, balancing, `D` | `src/dfd/dfd.js`, `tests/dfd.test.mjs`, `tests/dfd.html`, `tests/embed.py` (appends) | M2.1 | As M2.2 on row 22; `D` makes a level that balances its process by construction; `22-data-flow.json` balances, and one flow removed from level 2 fails `dfd-balance` naming it |
| M2.5 | **Information flow.** §7.4 | `src/uml/information.js`, `tests/information-flow.test.mjs`, `tests/information-flow.html`, `tests/embed.py` (appends) | M2.1 | As M2.2 on row 15; deleting an item drops it from every `conveyed`; the PDF lists what each flow conveys |
| M2.6 | **C4 elements and static views.** §5.1, §5.2, §6.1, §6.5, §7.5, §7.5.1: the element on the map's shapes, boundaries, implied lines, scope rules, `D`, the key; `c4.landscape`, `c4.context`, `c4.container`, `c4.component`. Its P1 view measured first (§11) | `src/c4/c4.js`, `tests/c4.test.mjs`, `tests/c4.html`, `tests/embed.py` (appends) | M2.1 | As M2.2 on row 23's four static views; the implied lines of G3 drawn and refused for editing; maps' geometry hashes and stills unchanged (the shapes are read only) |
| M2.7 | **C4 dynamic and deployment views.** §7.5.2, §7.5.3 | `src/c4/views.js`, `tests/c4-views.test.mjs`, `tests/c4-views.html`, `tests/embed.py` (appends) | M2.6 | As M2.2 on the two views; steps reordered by key; deleting a container deletes its instances (`refs`) |
| M2.8 | **Mermaid ER reader and writer.** §8.1 | `src/readers/mermaid-er.js`, `tests/mermaid-er.test.mjs`, `tests/import/er.mmd` | M2.0 | `read(write(model))` equals the model on the subset; the construct file's report pinned; §8's limits each by a test |
| M2.9 | **Mermaid flowchart reader and writer, ported.** §8.2 | `src/readers/mermaid-flowchart.js`, `tests/mermaid-flowchart.test.mjs`, `tests/import/flowchart.mmd` | M2.0 | As M2.8; on the shared construct file it reads the nodes and links the Python importer reads (`tests/import.py` runs both) |
| M2.10 | **Structurizr JSON reader.** §8.3 | `src/readers/structurizr.js`, `tests/structurizr.test.mjs`, `tests/import/structurizr.json` (a workspace exported from `examples/clinic.dsl` and one with every view kind) | M2.0 | The workspace reads into views that pass `check.mjs`'s structural checks (the C4 type's `validate` is M2.14's check); ids stable across two reads; the report pinned; §8's limits each by a test (a deep nest, a count over the limit, a `__proto__` name) |
| M2.11 | **DBML adapter.** §8.4 | `src/readers/dbml.js`, `tests/dbml.test.mjs`, `tests/import/dbml.json` (a `Database` captured from a pinned `@dbml/core`, with the DBML it came from) | M2.0 | The captured file reads into a model that `check.mjs` passes; the report pinned; `package.json` unchanged; §8's limits each by a test |
| M2.12 | **The CLI.** §8.5: `erDiagram`, `--typed` flowcharts, Structurizr JSON, `.dbml` | `umlimator.py` (`cmd_import`), `umlimator_import.py` (`detect`, `mermaid_typed`), `tests/import.py` (adds cases) | M2.8 to M2.11 | Every row of §8.5's table by a test. CI installs no `@dbml/core`, so the `.dbml` row is tested twice: as CI has it (the install message, nothing written), and with a stub `node_modules/@dbml/core` written into a scratch folder that the test runs the CLI from, whose parser returns M2.11's captured `Database`; a file over 1 MiB refused before parsing; every earlier import test unchanged |
| M2.13 | **The Bookshop atlas.** §12.5: the five examples moved and joined | `examples/bookshop-schema.json`, `returns-flowchart.json`, `bookshop-data-flow.json`, `order-information-flow.json`, `bookshop-c4.json` (new), `docs/diagrams/examples/check.mjs` (`MOVED`), `tools/atlas.mjs` (`KEYS.props`), `tools/atlas-links.json`, `examples/bookshop-atlas.json`, `tests/atlas.test.mjs` (adds cases) | M2.2 to M2.7; 5.8 and stage 6's 6.7 merged | The atlas builds and its test passes (if stage 6's merged examples clash with an id M2.0 set, M2.13 renames it in its moved file and lists it in its pull request); each link opens its view in `examples/bookshop-atlas.json`'s page; the five files pass their types' `validate` |
| M2.14 | **Fixtures, examples, docs.** §10's files and their tests (`tests/m2-fixtures.test.mjs`, `tests/m2.html`); `render`, `check`, `stills` and `pdf` on each example; the schema and `.d.ts`; C10's tests; every document of `plan.md` §7; `docs/conformance/er.md`, `flowchart.md`, `dfd.md`, `uml-information-flow.md`, `c4.md`; the lanes' release notes in `docs/module-api.md` | `tests/*-minimal.json`, `tests/*-stress.json` of the five types, `tests/m2-fixtures.test.mjs`, `tests/m2.html`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/embed.py` (appends), `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `examples/README.md`, `examples/index.html`, `docs/` (but the status table) | M2.1 to M2.13 | Definition of done 1, 3, 7, 9, 10, 11 and 12 for the five types; DoD 2's reader half: each reader's construct file and `tests/import/structurizr.json` read into models that pass their types' `validate` (the C4 type's for M2.10's workspaces), with the reports pinned; §11's budgets in CI; the stress fixtures' crossings pinned and stated |

Existing tests a package edits, and why: M2.1 adds cases to `tests/apply.test.mjs`, `tests/unfold.test.mjs` and
`tests/print-typed.test.mjs`; M2.12 to `tests/import.py`; M2.13 to `tests/atlas.test.mjs`; M2.14 points `tests/cli.py` and
`tests/mcp.py` at the moved examples and adds the new ends to `tests/notation.html`; each page lane appends its page to
`tests/embed.py`. No other existing test changes.

### 12.3 What runs at the same time (S21)

```
approved ─▶ M2.0 ─┬─▶ M2.8  Mermaid ER ──────────────┐
(after 6.0)       ├─▶ M2.9  Mermaid flowchart ───────┤
                  ├─▶ M2.10 Structurizr JSON ────────┼─▶ M2.12 CLI ──────────────────┐
                  ├─▶ M2.11 DBML ────────────────────┘                               │
                  └─▶ M2.1 engine ─┬─▶ M2.2 ER (after 6.3) ───┐                       │
                     (after 6.1)   ├─▶ M2.3 flowchart ────────┤                       │
                                   ├─▶ M2.4 data flow ────────┼─▶ M2.13 atlas ─▶ M2.14 ─┴─▶ 0.24.0
                                   ├─▶ M2.5 information flow ─┤   (after 5.8 and
                                   └─▶ M2.6 C4 ─▶ M2.7 C4 ────┘    stage 6's atlas)
```

- **Beside stage 6's code lanes:** M2.0 once 6.0 has merged, then the four reader lanes (M2.8 to M2.11) at once. They
  add new files only and read no type's code, so no stage 6 lane and no other M2 lane owns a file they change.
- **Gated by one stage 6 lane each** (Q17): M2.1 starts when 6.1 has merged (both edit `src/core/apply.js` and the
  registry's comment above `const TYPED = {}`); M2.2 when 6.3 has merged (`ENDS`). Stage 6's 6.1 has no dependency but
  6.0, so M2.1 is not held behind the profile type; only M2.2 is.
- **After M2.1:** M2.3 to M2.6 at once, M2.2 as above, M2.7 after M2.6. M2.3 may start before M2.1 (it needs only
  `text`, which it adds last). Each type lane may write its definition, rules and `describe()` against this note before
  its needs merge.
- **Last:** M2.12 after the readers; M2.13 after the types and the atlas changes of 5.8 and stage 6; M2.14 after all.
- Only M2.1 touches the core.
- Milestone 2's lanes may merge to `main` before 0.23.0 ships, provisional until 0.24.0, as stage 5's did before 0.21.0;
  0.24.0 ships after 0.23.0.
- One reviewing agent that did not write the code checks each pull request against the definition of done; before the
  first of two open branches merges, their merge is rehearsed in a scratch worktree (X2).

Decision 18. The first draft capped the project at five open code lanes. Stage 6's note has no cap and starts 6.0 to 6.5
together on approval, beside 5.8 and the stage 5 follow-ups, so under the cap no reader lane could run beside stage 6
and the overlap this section offers would not happen. The options now:

| Option | For | Against |
|---|---|---|
| **(a) No cap across the project: disjoint Owns and rehearsed merges (X2) decide; the readers beside stage 6, M2.1 after 6.1, M2.2 after 6.3 (recommended)** | The rule stage 6 already uses; the four readers, which own only new files, start as soon as M2.0 merges; nothing idles | Up to about twelve open branches at the peak (stage 6's six, M2's four readers, 5.8, the follow-ups): more pull requests to review at once, and `lib/` rebuilt in every branch on each merge of `main` |
| (b) Five code lanes at most, stage 6 adopting the cap too | Review load bounded | Stage 6's own plan changes; its six-lane start shrinks; M2's readers wait until stage 6 is down to four or fewer |
| (c) Five code lanes at most for M2 only: the readers wait until stage 6's code lanes (6.1 to 6.5) merge | Stage 6 unchanged; M2 never adds to its peak | The readers, which depend on nothing, wait until the end of stage 6's code |
| (d) Milestone 2 after 0.23.0 is released | No overlap with stage 6 | Every lane idle until then |

### 12.4 Files shared with stages 5 and 6, and among the packages

Stage 6's files are as its note lists them (2e72c6b, §13.2 and §13.4; Q17).

| File | Stage 5 | Stage 6 | Milestone 2 | Order |
|---|---|---|---|---|
| `tools/build.mjs` (`ALL`) | 5.0, merged | 6.0 | M2.0 only | 6.0, then M2.0 |
| `src/core/registry.js` (the comment above `const TYPED = {}`) | the follow-ups change another line of its comment | 6.1 | M2.1 | 6.1, then M2.1 (M2.1 depends on it) |
| `src/core/apply.js` | | 6.1 (`refs()` and `delete`, about 60 B) | M2.1 (`addView`) | 6.1, then M2.1 |
| `src/map/context.js`, `src/page/print.js`, `src/uml/activity.js` | | none | M2.1 | |
| `src/typed/draw.js` (`ENDS`) | 5.1, merged | 6.3 (`ENDS` only: the filled triangle) | M2.2 (the export line); M2.2 adds rows from its own file | 6.3, then M2.2 (M2.2 depends on it) |
| `docs/diagrams/examples/15-information-flow.json`, `20-` to `23-*.json` | 5.8 owns `docs/` (Q17 of stage 6) but edits none of these | 6.6 owns `docs/` but edits none of these | M2.0 | none: an exception to 5.8's and 6.6's `docs/`, stated in M2.0's row |
| `src/uml/class.js`, `structure.js`, `usecase.js`, `flow.js`, `owners.js`, `src/draw/shapes.js` | follow-ups on `stage5-followups` | 6.3 edits `class.js`, `owners.js` (named lines) | read only | none: M2 edits none of them |
| `tests/embed.py` | 5.8 appends | 6.0 lists the stage's pages (one line) | M2.2 to M2.7, M2.14 append | each appends its page, nothing else; the second of two open branches rehearses the merge |
| `docs/diagrams/examples/check.mjs` (`MOVED`) | 5.8 | 6.6 | M2.13 | 5.8, then 6.6, then M2.13 |
| `tools/atlas.mjs`, `tools/atlas-links.json`, `examples/bookshop-atlas.json`, `tests/atlas.test.mjs` | 5.8 | 6.7 | M2.13 | 5.8, then 6.7, then M2.13 |
| `lib/umlimator.schema.json`, `lib/umlimator.d.ts`, `docs/module-api.md`, `docs/editing.md`, `README.md`, `examples/README.md`, `examples/index.html`, `tests/cli.py`, `tests/mcp.py` | 5.8 | 6.6 | M2.14 | 5.8, then 6.6, then M2.14 |
| `umlimator.py`, `umlimator_import.py`, `tests/import.py` | | none | M2.12 only | |
| `docs/diagrams/model.md`, `risks.md` | | 6.6 (its §17) | this note's changes (§15), on approval | whichever note is approved first; the second merges |

Among milestone 2's packages: `src/c4/c4.js` is M2.6's and read only by M2.7 and M2.10; `src/typed/draw.js` is M2.2's
(its export); `src/uml/information.js` reads stage 5's looks only. No two open milestone 2 packages own one file but
`tests/embed.py`.

### 12.5 The Bookshop atlas (M2.13, S20)

The maintainer's decision of 13 Nov 2026: one small example per type is the reference, and the Bookshop atlas is built
from them, elements merged by id, the build stopping on a disagreement; every stage adds its Bookshop views. The five
examples were written before the atlas and reuse ids that other Bookshop files give other elements (Q12). M2.0 changes
the target examples so every lane builds on the final ids; M2.13 moves them and joins them.

**Ids** (trial-built against 5.8's atlas, Q12):

| Example | Change | Shared with the atlas |
|---|---|---|
| `20-entity-relationship.json` | `er-` before every id: entities, columns (`er-customer.email`), relationships, the view (`er-schema`) | nothing |
| `22-data-flow.json` | `dfd-` before every id, the views' included | nothing |
| `23-c4.json` | `c4-` before every id, the views' included (`c4-context`; `components` was 5.8's component view's id) | nothing: a C4 element and a map card differ in type |
| `21-flowchart.json` | `start` to `return-arrives`, `stock` to `stock-records` | nothing |
| `15-information-flow.json` | `storefront`, `api` and `payments` become `storefront-component`, `shop-api` and `payment-provider-component`, stage 5's components; `shopper` stays (the use case example's actor); `email` to `email-service`; the items `order`, `card`, `receipt`, `stock` to `order-info`, `card-details`, `receipt-info`, `stock-info`; the flows `shopper-storefront`, `storefront-api` to `flow-shopper-storefront`, `flow-storefront-api` | four elements, each agreeing on type and label |

| Option | For | Against |
|---|---|---|
| **(a) Prefixes where a file's ids are a separate vocabulary, renames where few clash, sharing where the element is the same (recommended)** | The builder and the decision of 13 Nov 2026 unchanged; the information flow view shows stage 5's components, the atlas's point | Prefixed ids are longer in three examples |
| (b) The builder namespaces each file's ids (`<file>/<id>`) | No example changes | Against "elements merged by id": nothing would be shared between files |
| (c) Typed C4 elements take the map's cards' ids, and the builder lets an untyped card merge with a typed element | The map and C4 views would share elements | Changes the builder's strict `type`; a map view's card would carry C4's props, label and description into the map's picture |

**Keys.** `KEYS.props` gains `conveyed`, `dataType`, `primaryKey`, `foreignKey`, `nullable`, `unique`, `references`,
`identifying`, `number`, `description`, `technology`, `external`, `shape`, `container`.

**Links** (each `"<file>/<id>"` opens a view; M2.13 may change one, listing it in its pull request). `c4-bookshop` and
`c4-api` open the C4 example's own container and component views already, so they are not links:

| Element | Opens |
|---|---|
| `bookshop-c4/c4-db` | `bookshop-schema/er-schema` |
| `bookshop-c4/c4-worker` | `fulfil-activity/fulfil` |
| `bookshop-c4/c4-checkout` | `checkout-sequence/checkout-sequence` |
| `bookshop-c4/c4-storefront` | `order-information-flow/order-flows` |
| `bookshop-c4/c4-order-store` | `bookshop-data-flow/dfd-level-1` |
| `bookshop-c4/c4-shopper` | `shopping-use-cases/shopping` |
| `bookshop-c4/c4-staff` | `returns-flowchart/returns` |
| `bookshop-c4/c4-web-host` | `bookshop-deployment/production` |

**The root.** The log of 13 Nov 2026 describes the atlas as running "from C4 to components, deployment, classes and an
order's state machine"; until now the map's `overview` stood in for C4.

| Option | For | Against |
|---|---|---|
| **(a) `bookshop-c4/c4-context` becomes the root; the map's `overview` stays, reached from the views list (recommended)** | The atlas as the maintainer described it | The map, the package's first notation, is no longer the first picture |
| (b) The map's `overview` stays the root; the C4 views are reached from the views list | Nothing moves | The typed C4 views hang off nothing by drill-down |

### 12.6 The release

0.24.0 after M2.0 to M2.14 and after 0.23.0, by the repository's rule: `package.json`, `## 0.24.0:` in
`docs/module-api.md`, merged when the maintainer approves that pull request by number. Its notes say:

- new: the ER, flowchart, data flow, information flow and C4 diagrams; crow's foot and IDEF1X ends; C4's six views with
  scope rules and implied relationships; DFD levels and balancing; `D` to make a level; `addView`; the readers and the
  CLI's new formats;
- fixed: a typed card that opens a view of its own kind unfolded in place through the map's code, losing its shape; it
  opens, unless its type draws unfolding (`unfolds: true`; the activity's call behaviour still unfolds) (S8);
- left out: §13.

C10 (S22):

| Option | For | Against |
|---|---|---|
| **(a) In M2.14, as 5.8 does: the MCP server's read tools and the diff Action's step tested with one model of each type; the `map-repo` skill's pin does not move (recommended)** | Tests only; the skill still writes maps | A reorder reads "changed" in `diff()` until per-type writers come |
| (b) The skill writes typed C4 from 0.24.0 | Agents get typed C4 | The skill's instructions, its pin and its tests in this milestone |

## 13. Left out of the subsets

| Type | Left out |
|---|---|
| ER | Chen's notation (relationships as nodes, `proposal.md` §7.3); IDEF1X's key-based level (a non-specific relationship is drawn, not required to be resolved through an associative entity, §4.1); lines that end on columns; weak entities beyond IDEF1X's dependent corners; subtype clusters (IDEF1X categories); check constraints, defaults and indexes other than keys; SQL DDL; several schemas; a writer for DBML |
| Flowchart | ISO 5807's symbols beyond the ten of §7.2 (`plan.md`'s "dozen most common" is ten here): stored data, internal storage, sequential access storage, display, card, punched tape, manual operation, preparation, parallel mode, loop limit, annotation, ellipsis, and the special lines; the off-page connector, which is a common convention, not an ISO 5807 symbol; swimlanes; groups (Mermaid's subgraphs, read and skipped) |
| Data flow | Unfolding a level in place (§6.3); data dictionaries; flows that split or join between levels (balancing by label, §6.4); control flows and control processes (Ward and Mellor); Gane and Sarson's location band |
| Information flow | Flow ends other than §3's classes, interfaces, components, actors and information items: UML 2.5.1 also allows nodes, artifacts, use cases, packages, properties, ports, activity nodes and partitions, and instance specifications (`model.md` row 15 says "any classifier"); the «flow» line on class, component and other UML views; `InformationItem.represented`; realizing relationships, connectors and activity edges (`proposal.md` §3.2) |
| C4 | The code diagram (`proposal.md`'s standards table asks for all seven; c4model draws it with UML or ER, and the atlas reaches the class view from a component instead); software system instances and infrastructure nodes; groups; environments as data (a deployment view's title names it); a step repeated or reworded in a dynamic view (S13); parallel steps; relationships between instances derived from their containers'; filtered and custom views; a Structurizr JSON or DSL writer; conversion from a map (S12) |
| All five | Deleting a view; copy and paste (E7); per-type `diff()` writers; stereotypes on the non-UML types |

Departures and claims, which M2.14's conformance notes carry in a "Departures" line:

- **ER**: no claim of IDEF1X conformance (`proposal.md` §3.4); crow's foot's dashed non-identifying line is a tool
  convention (Mermaid's), not part of the notation.
- **Flowchart**: no claim of ISO 5807 conformance (the standard is paywalled and was not read; §13's symbol names
  are from secondary sources and M2.14's conformance note says so). The database symbol is a cylinder, as common tools draw it (ISO 5807's direct access storage is
  the nearest); the delay symbol is not an ISO 5807 symbol, a common tools' convention (ANSI's and Mermaid's).
- **Data flow**: two symbol sets after Yourdon and Gane and Sarson, with Yourdon's process as an ellipse sized to its text;
  "a flow touches a process" is a warning, as later teaching material puts it.
- **C4**: the shapes are the map's; c4model.com is notation-independent. An external element is grey, as c4model.com
  draws it.

## 14. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | The core's budget | At most the 1,400 B share; targets 253 B; over the share asks | The targets plus 25%, the rest to the reserve now; no core byte | §2.5 |
| 2 | Maps and typed C4 (C8) | Maps unchanged; typed C4 from Structurizr JSON and JSON; no conversion in 0.24.0 | `--typed` for the C4 sources through `ext.c4`; a guessing `c4FromMap()` | §2.4 |
| 3 | ER's row syntax | `name type [PK] [FK table.column] [UK] [NULL]` | Mermaid's order; the panel only | §3 |
| 4 | A C4 view's boundary | Drawn when `nodeIds` lists the subject (two example views change) | Always drawn | §3 |
| 5 | Dynamic view steps | Relationship ids, each once; numbers derived | Inline steps | §3 |
| 6 | Line-end skins | `ENDS` exported, rows added by the family; IDEF1X letters as end labels | A skins table in `src/typed/draw.js`; markers with text | §4.2 |
| 7 | A notation switch | One geometry, a repaint | Per-skin sizes, a layout | §4.3 |
| 8 | Implied relationships | Derived when drawn, one per pair, read only | Not drawn; stored by readers | §5.2 |
| 9 | Adding a view | `addView` only, about 160 B | Also `deleteView`; no command | §6.2 |
| 10 | A typed card opening its own kind | Opens unless its type says `unfolds: true`, which the activity type sets (a defect fixed, 13 B; CI's counts unchanged) | The guard names `uml.activity`; never unfolds, the activity's too (CI counts and the atlas test change); typed unfolding per type, later | §6.3 |
| 11 | DFD numbers | Stored and checked | Derived from order | §6.4 |
| 12 | DFD balancing | By label, far end and direction, an error | By label only | §6.4 |
| 13 | C4's shapes | `props.shape` naming a map shape; person and box by default | Guessed from technology; per view | §7.5 |
| 14 | DBML | An adapter over `@dbml/core`'s parsed model that imports nothing | A subpath with an optional peer; an own reader; left out | §8.4 |
| 15 | A Mermaid flowchart's import | A map by default, `--typed` for the typed reader | Typed by default, a stated exception | §8.5 |
| 16 | The PDF's line rows (R9) | A registry field `text`, about 30 B | A derived label on a copy; R9 left open | §9 |
| 17 | P1 | Both flags off; 1 s in CI with 100 ms printed; C4's view measured first | | §11 |
| 18 | Order and lanes | Taken, the maintainer's decision of 13 Nov 2026: five code lanes at most across the project, stage 6 included (option b); M2's readers start as stage 6's lanes free up. Was: No cap across the project (disjoint Owns and rehearsed merges, as stage 6); readers beside stage 6 once M2.0 merges; M2.1 after 6.1, M2.2 after 6.3 | Five lanes at most, stage 6 adopting it; five lanes for M2 only, the readers after stage 6's code; after 0.23.0 | §12.3 |
| 19 | The atlas's ids | Prefixes for ER, DFD and C4; renames for the flowchart; sharing stage 5's components in the information flow | Namespaced by the builder; C4 sharing the map's cards | §12.5 |
| 20 | The atlas's root | The C4 context | The map's overview | §12.5 |
| 21 | C10 | Tested in M2.14; the skill's pin does not move | The skill writes typed C4 | §12.6 |
| 22 | Information flow's place | Its own view type; the «flow» line elsewhere left out | The line on class and component views too | §2.3, §13 |

## 15. What this note changes elsewhere

- **`model.md`.** Rows 15 and 20 to 23 as §3 (row 15's nodes listed; row 20's row syntax and declared reference; row 21's
  connector as a junction and its default direction; row 22's levels; row 23's `shape`, `container`, boundaries and
  dynamic steps); rule 10's `notation` no longer says "as `shapes` is for maps" (removed in 0.21.0): a skin of the type,
  drawn on one geometry; §3 gains milestone 2's rows, settled here.
- **`risks.md`.** C8 restated (§2.4); M9 points to §2.4; G3's implied relationship points to §5.2 and §10; the ER row's
  fixtures point to §10; a new row for Q5 (a typed card unfolding in place, closed by M2.1); a new row for the atlas's ids
  (Q12); C5 records milestone 2's share and spend (§2.5); P1 gains §11's common edits; C10 records M2.14's tests; R9
  gains the `text` field (§9).
- **`plan.md`.** §5's milestone 2 row points here (done with this note); §4.3 lists `src/er/`, `src/flowchart/`,
  `src/dfd/` and `src/c4/`.
- **`proposal.md`.** §3.3 and §7.3's subsets for the five types point to §13.
- **`README.md` in this folder.** The status table shows this note and, once approved, the milestone's work packages;
  the log records the decisions taken. (The lead's.)
