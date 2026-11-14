# Milestone 3 design note: SysML v1.7

Status: **approved** by the maintainer 14 Nov 2026, with every recommendation taken. Written against `main` at fcb953b
(stage 6's 6.0, 6.1 and 6.2 merged, #231, #237, #238; 6.3 and 6.5 open as #240 and #241, carrying 6.4; the C10 package
open as #236). The approved notes of milestone 2 (#234, `milestone-2`, e4577cc) and milestone 4b (#235, `milestone-4b`,
c27c264) were read on their branches for what they touch. Symbols are named, not line numbers.

Milestone 3 ships release 0.25.0: SysML v1.7's requirement diagram (`sysml.requirement`), block definition diagram
(`sysml.block-definition`), internal block diagram (`sysml.internal-block`) and parametric diagram (`sysml.parametric`)
(`plan.md` §5, row M3; decision D5: v1.7 notation, nothing of v2). Its new engine work: frames; SysML's types as
stereotyped UML types. Its reader: Mermaid's `requirementDiagram`. It builds on stage 6's stereotype check (`TYPED.across`,
tags keyed by stereotype), stage 5's composite structure and ports (an internal block diagram is a composite structure
of blocks) and the class type (a block definition diagram is a class diagram of blocks).

The standard is [SysML v1.7](https://www.omg.org/spec/SysML/1.7/PDF) (formal/24-01-07). The clauses this note leans on:
Annex A (diagram frames and their headers), clause 8 (blocks, connectors, value types), clause 9 (ports, flow
properties, interface blocks, item flows), clause 10 (constraint blocks), clause 16 (requirements), the deprecated
elements' annex (flow ports) and the non-normative extensions' annex (extendedRequirement, with `source`, `risk` and
`verifyMethod`). M3.7's conformance notes check each clause's words, and the two annexes' letters, against the PDF before
quoting them, as stage 6's 6.6 does for UML; a rule below marked "(confirm)" is one whose SysML constraint M3.7 quotes
by clause and number, or moves to a warning and a departure in §17 if the PDF does not say it.

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 16 to 19 | Kept, with refinements: a requirement may carry `risk` and `verifyMethod`; a port has `props.kind` (`proxy`, `full`, or none); a port's type may start with `~` (conjugated); a reference property is drawn dashed; an ibd shows value properties of its subject; a parametric view's subject may be a constraint block, whose parameters sit on its frame; a view's `subject` may name a `uml.Package` on a requirement or block definition view; `uml.Package` is a node of rows 16 and 17 | §4 |
| S2 | SysML as a profile | SysML's types stay types of their own (`sysml.Block`, as `model.md` and the four examples write them), and one table in `src/sysml/sysml.js` says what each is in UML: its metaclass, the SysML stereotype it implies and the UML type it is projected to. The stereotype check, the projection that lets the internal block and parametric types reuse the composite structure type, the keywords drawn and the reader all read that table. No built-in profile element is stored in a model | §3 |
| S3 | SysML's names in the stereotype check | `metaOf` (`src/uml/stereotypes.js`) reads the table, so a user profile extending `Class` fits a block and one extending `Property` fits a value property; SysML's stereotype names (`block`, `requirement`, `rationale`, …) join the known keywords, so «rationale» or «block» stored in a profile's scope is not warned | §3.3 |
| S4 | Frames | Every SysML view is drawn in a frame: a rectangle with SysML's pentagon header in its top left corner, `bdd [Package] Structure [E-bike blocks]`. It is a box of the layout (`containers`) drawn by a new box shape, `SHAPE['sysml-frame'].frame`, which reuses stage 3's `frameTag`. On ibd and par views the frame is the subject's box (its ports on the frame), which the projection always asks for (§5.1); on req and bdd views it holds every node, and replaces a package subject's own box. A drop into, or Delete on, a frame that is no element is mapped by the canvas to the view's subject (§5.1), a core edit stated against the share (S17) | §5 |
| S5 | A frame's header | `kind [ElementType] name [view title]`: `req`, `bdd`, `ibd`, `par`; the element is the view's `subject` (a package, block or constraint block); with no subject, `[Model]` and the model's `title`. Cut to the frame's width, said whole in its accessible name | §5.2 |
| S6 | Requirements | A classifier with «requirement» over its name and one compartment of `id = "EB-1.1"` and `text = "…"`, the text wrapped at 224 px into as many rows as it needs (`present.<id>.rows` caps them with "+k more", as stage 1 settled). A test case «testCase», a block «block», a comment with «rationale» or «problem» as a note | §6.1 |
| S7 | Containment | `parent` stays the model (row 16). A requirement whose owner is a shown requirement is drawn with a derived line from it to its owner, a crosshair (⊕) at the owner's end; a requirement whose owner is a package is drawn in the package's box (stage 2). The line is selected, named and deleted (deleting it un-owns the requirement), never stored | §6.2 |
| S8 | The six requirement relationships | Dashed lines with an open arrow and their keyword («deriveReqt», «satisfy», «verify», «refine», «trace», «copy»), each running client to supplier (rule 7). Their ends are checked as SysML's constraints say: errors where SysML says a model is wrong (a copy's text among them), warnings where it only says what is usual or where the subset is stricter than SysML (a requirement's owner, a satisfy's or verify's client) | §6.3 |
| S9 | Block definition | Its own node builder on the classifier: «block», «valueType», «interfaceBlock», «constraintBlock» over the name, and SysML's named compartments (`parts`, `references`, `values`, `constraints`, `operations`, `ports`, `flow properties`, `parameters`), drawn with their names; the class type's lines and ends | §7 |
| S10 | Named compartments | The classifier (`src/typed/draw.js`) draws a compartment's name when its drawing input says `title: true`: a row in the muted colour, centred. No class, object or profile view sets it, so none of their pictures changes | §7.1 |
| S11 | Internal block and parametric diagrams | A projection: the type maps its view's model to the UML types of S2's table on a copy (ids unchanged), keeping only the subject's members the view kind shows, with the texts the layout measures already set (item names as labels, «proxy» and «full» in port names); lays it out with the composite structure type's own geometry (`csGeo`), then dresses the result on a copy: the frame header, SysML's names, port arrows, item-flow triangles, constraint properties' rounded corners and expressions. The dressing shared by both types lives in `src/sysml/sysml.js`. `src/uml/composite.js` gains one condition, read from a view field no UML view sets, so a subject with no parts is still a box (§5.1; as built, not edited: the dressing frames such a subject at its card's bounds) | §8, §9 |
| S12 | Ports | `sysml.Port` with `props.kind`: `proxy` (drawn «proxy»), `full` («full») or none (a plain UML port). A port typed by an interface block shows an arrow inside its square from the block's flow properties (all `in`, all `out`, or both). `~` before the type conjugates it, reversing the arrow. Flow ports (SysML 1.2's `«flowPort»`, deprecated since 1.3) are left out | §8.2 |
| S13 | Item flows | `props.itemFlow` on a connector (`{ item, direction }`): the item's name is the line's label, and a filled triangle on the line's middle segment points the way it flows | §8.3 |
| S14 | Parametric bindings | A binding connector is a plain solid line between a value property (or a parameter of the subject) and a parameter of a constraint property, reached through it (`ends.<end>.part`), as stage 5's port on a part. Nested ends (a value property of a part, `battery.capacity`) are left out | §9 |
| S15 | The Mermaid reader | `src/readers/mermaid-requirement.js`: a reader and a writer, hand-written and linear, against Mermaid 12.3.0's requirement diagram page, with the hostile-input limits of the earlier readers (1 MiB, no nested repetition, prototype-free tables) and the reader's own: a containment that would close a cycle (found by one colouring pass after reading), a second container, an undefined name, an unclosed block, a relationship whose ends break §6.3's errors, a bad or clashing `%% id:`, bad JSON in `%% text:`, each skipped and reported, never thrown; the writer quotes names Mermaid cannot read bare | §12 |
| S16 | The CLI | `umlimator.py import` reads a `requirementDiagram` typed, through Node, as it reads a `classDiagram` (today it is refused: "not a flowchart, graph or C4 diagram") | §12.4 |
| S17 | The core's budget (C5) | Milestone 3's share is 500 B (the maintainer's split of 13 Nov 2026). The plan spends tens of bytes: the canvas's mapping of a frame with no element to the view's subject (§5.1, `src/canvas/edit.js`, M3.1); everything else is in family files. Each byte is stated in its pull request against the share | §2.3 |
| S18 | P1 | `repair: false` and `reroute: false` on every layout; CPU, best of seven after a warm-up; CI holds 1 s and prints each common edit against the 100 ms target, in tests titled " (timed)" and run serially. The projection is timed inside the edit | §14 |
| S19 | Examples and the atlas | SysML keeps its own domain, the e-bike (the maintainer's decision of 13 Nov 2026): the Bookshop has no system of hardware whose requirements, parts and equations a reader would recognise. The four e-bike files are joined into an e-bike atlas by the same builder (`tools/atlas.mjs`, a second links file), which stops on a disagreement: measured, `range-equation`'s constraint differs between 17 and 19, which M3.0 fixes. The atlas must also validate with no problem: 17 holds EBike's parts as composite associations and 18 as part members, which §7.2 reconciles | §15 |
| S20 | The class type's rule on SysML lines | Measured: with a class or package view in the model, the class type's `generalization-kinds` refuses `ebike-is-rental-vehicle` ("block EBike specializes block RentalVehicle"). It leaves a generalization with an end of a non-UML type to that type's rules, as a one-line change in `src/uml/class.js` | §7.3 |
| S21 | Order and lanes | Within the project's five open code lanes (the maintainer's decision of 13 Nov 2026), every milestone 3 package counted as a lane: the reader (M3.6) first, as it shares no file with stage 6 or milestone 2's type lanes; then M3.1 once 6.3 has merged; M3.2 to M3.5 together once M3.1 and M2.1 have merged; M3.7 after milestone 2's M2.13 and M2.14. 0.25.0 after 0.24.0 | §16.3 |
| S22 | Departures | Stated in §17: a frame header with no subject names the model's title; parameters on a constraint property's border drawn as stage 5's ports, their names outside; a constraint expression cut to its box; a containment line derived, not a model element; a requirement owned only by a requirement or a package | §17 |

What is left out is in §17.

## 2. Where milestone 3 starts

### 2.1 What it builds on

| Piece | Built in | Used as it is | SysML only |
|---|---|---|---|
| The classifier and its rows | 1.5 (`SHAPE.classifier`, `classParts`, `memberText`, `src/typed/draw.js`) | Keywords over the name, compartments of rows, `rows` and "+k more", `collapsed` | A compartment's name drawn (`title: true`, S10) |
| The class type's lines | 1.9 (`lineLook`, `lineLabel`, `lineName`, `legendOf`, `drawnLines`, `src/uml/class.js`) | Association with its ends and diamonds, generalization, dependency with its keyword | Read through `class.js`'s export line, which gains the four names not exported today |
| Stage 2's boxes | `ownersOn`, `src/uml/owners.js` | A package on a req or bdd view is a box holding what it owns | |
| The member micro-syntax | 1.9 (`parseMember`, `printMember`) | An operation's row | Property rows by kind (§7.4) |
| The composite structure | 5.6 (`csGeo`, `csPic`, `csProblems`, `csConnect`, …, `src/uml/composite.js`) | Its geometry, through S11's projection: the subject's box, parts as boxes, ports of a part's type on the part, connectors through parts (`ends.<end>.part`), dashed shared parts | Frame header, names, port kinds and arrows, item flows, constraint properties |
| Ports on borders | 5.1 and 5.3 (`placePorts`, `portSides`, `portsDrawn`) | Through the composite geometry | |
| Frames | 3.2 (`frame`, `frameTag`, `tagSize`, `src/uml/frame.js`) | The pentagon tag | A box shape that draws a whole frame (S4) |
| Boxes drawn by their shape | 2.1 (`svgOf`: a family whose `SHAPE[f.shape].frame` draws it) | The frame is such a box | |
| The type's draw layers | 3.0 (`draw` → `{ under, over }`) | Item-flow triangles and port arrows, in `over` | |
| The stereotype check | 6.2 (`TYPED.across`, `TYPED.fields`, `UML_META`, `UML_AS`, `metaOf`, the keywords, `src/uml/stereotypes.js`) | Profiles applied by packages reach SysML elements they own | `metaOf` reads S2's table (S3) |
| The PDF's tables | 4.9 (`rows`, `word`), M2.1 (`text`, for lines) | Each type gives its rows and words | |
| The readers' pattern | 1.10 (`MC_LIMIT`, `mcTable`, `%% id:`) | Linear, a size limit, a report, ids from names | |
| The atlas builder | 4.10 (`tools/atlas.mjs`'s `build(links, load)`, `merge`) | Elements merged by id, the build stopping on a disagreement | A second links file and an output name (§15) |

### 2.2 What was read at fcb953b

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | The four target examples, today | `check.mjs` passes them; each validates with one warning ("not drawn by this release") and draws as plain cards (the requirement view in 76 ms, the others in 12 ms or less) | §15 |
| Q2 | The four examples merged by id with `tools/atlas.mjs`'s `merge` (a scratch script) | One disagreement: `range-equation`'s `props.constraint` is "range = capacity / consumption" in 17 and "range = energy / consumption" in 19, and its parameters are `capacity` in 17 and `energy` in 19 (members merge by id, so the merged block would have four). Shared: `battery`, `controller` and `dock` (16, 17, 18), `ebike` (17, 18, 19), `motor` (17, 18). Merge does not see one overlap of meaning: 17 gives EBike its battery, motor and controller as composite associations (`ebike-battery`, role `battery`, …) and 18 as `sysml.PartProperty` members (`ebike.battery`, …); M3.0 runs the merge through the four types' rules as each lands, and M3.7 states the result | S19, §7.2, §15 |
| Q3 | `generalization-kinds` (`classProblems`, `src/uml/class.js`) | Runs on the whole model whenever a class or package view is in it. **Measured**: 17 with a class view added gives the error "block "EBike" specializes block "RentalVehicle" (ebike-is-rental-vehicle)": `CLASSIFIERS` lists `uml.*` types only. No other UML type's rule says anything of the four examples (each UML view kind added in turn, a scratch script) | S20 |
| Q4 | `metaOf` and `UML_AS` (`src/uml/stereotypes.js`) | `metaOf` returns `undefined` for a type not starting `uml.`: "a sysml. one is not checked" (stage 6 §5.4: "until milestone 3 maps it"). The keyword list is UML's Tables 22.1 and C.1 | S3 |
| Q5 | `csPic` and `csGeo` (`src/uml/composite.js`) | About 100 literals of `uml.*` types (`uml.Property` 17, `uml.Port` 15, `uml.Collaboration` 15, `uml.RoleBinding` 12, `uml.CollaborationUse` 11, `uml.Connector` 10, …). A part's shape and size come from `SHAPE.part` (a 48 px box sized by `name : Type [mult]`); `aggregation: "shared"` draws it dashed; a part shows the ports of the class or component its `valueType` names by label, and every port a connector reaches through it; geometry ids `<part>-><port>`. Nodes, lines and ports are built on a copy after `layoutTyped` (`portsDrawn`) | S11 |
| Q6 | `SHAPE.classifier` (`classParts`, `classSvg`) | Each compartment carries a `name` (used in the accessible name's counts: "2 attributes"), never drawn. Rows are one line each, cut to the box (`fit`); the box is as wide as its widest text, 96 to 320 px | S6, S10 |
| Q7 | `ENDS` (`src/typed/draw.js`) and its open branches | `none`, `arrow`, `open`, `triangle`, `diamond`, `filled-diamond`, `socket`; 6.3 (#240) adds `filled-triangle`; M2.2 exports the table so families add rows at load; 4b.1 adds `circle`. No crosshair | §6.2, §16.4 |
| Q8 | `svgOf`'s families (`src/draw/svg.js`) | A typed view's box whose shape has a `frame(f)` is drawn by it, in the group the canvas selects (`data-family`), with its `aria` | S4 |
| Q9 | `typeGeo` (`src/uml/class.js`) | Builds each node from `IMPLIED`, `compartmentsOf` (`attributes`, `operations`, `literals` by `uml.*` member type) and the package test `n.type === 'uml.Package'`; 6.3 (#240) edits those lines. A `sysml.Block` would get no compartment through it | S9 |
| Q10 | `tools/atlas.mjs` | `build(links, load)` takes its links and loader; the command line writes `examples/bookshop-atlas.json` only. `KEYS.props` lacks `reqId`, `text`, `constraint`, `unit`, `quantityKind`, `direction`, `itemFlow`: the build stops on the e-bike files | §15 |
| Q11 | `umlimator_import.py` (`MERMAID`, `TYPED`, `mermaid_typed`) and `cmd_import` | `requirementDiagram` is not in `MERMAID`; **run**: a three-line requirement diagram gives "not a flowchart, graph or C4 diagram: nothing imported" | S16 |
| Q12 | The Mermaid readers (`src/readers/mermaid-*.js`) | 1 MiB (`MC_LIMIT`, `MT_LIMIT`), prototype-free tables (`mcTable`), a report of `skipped` and `approximated`, `%% id:` in the writer | §12 |
| Q13 | Mermaid's requirement diagram page (read 14 Nov 2026) | Six requirement kinds (`requirement`, `functionalRequirement`, `interfaceRequirement`, `performanceRequirement`, `physicalRequirement`, `designConstraint`) with `id`, `text`, `risk` (Low, Medium, High) and `verifymethod` (Analysis, Inspection, Test, Demonstration); `element` with `type` and `docref` (the page's examples also write `docRef`); seven relationships (`contains`, `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces`) as `a - kind -> b` or `b <- kind - a`; `direction TB`, `BT`, `LR`, `RL`; quoted text with Markdown; `style`, `classDef`, `class`, `:::` | §12 |
| Q14 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 185,426 B at fcb953b. The cap is 189,697 B: 4,271 B left. Milestone 3's share of the split is 500 B | S17 |
| Q15 | The open branches | 6.3 (#240): `src/uml/class.js`, `owners.js`, `package.js`, `profile.js`, `src/typed/draw.js` (`ENDS`). 6.5 (#241, with 6.4): `timeruler.js`, `timing.js`. C10 (#236): `src/uml/diff.js` (new, in `ALL`), `src/core/registry.js` (a comment), `src/map/diff.js`, `insight.js`, `src/uml/sequence.js`, `tests/cli.py`, `tests/mcp.py`, `tools/build.mjs`, `docs/module-api.md`, `README.md`, `risks.md`. Milestone 2's and 4b's notes list theirs (§16.4) | §16.4 |
| Q16 | Keys taken on a typed view | `E F L N O P V W`, `+`, `B` (the component type), `D` (M2's DFD and C4), `A` and `X` (M4b), `S` (timing). Milestone 3 binds none | §11 |
| Q17 | `src/page/print.js` | A type's `word` and `rows` for elements; from M2.1 a type's `text` for a line's row | §13 |
| Q18 | `check.mjs` (`MOVED`, `targets()`) and its hand list | 16 to 19 are checked by `model.md`'s hand list until their types register; `MOVED` gains a row as each moves | §15 |

### 2.3 The core's budget (C5, S17)

The cap is 189,697 B (0.16.0's 164,954 B plus 15%); the core is 185,426 B (Q14). The maintainer's split of 13 Nov 2026
gives milestone 3 500 B. One edit needs the core: the canvas's drop and Delete on a frame that is no element (§5.1),
tens of bytes in `src/canvas/edit.js`, made by M3.1 and measured in its pull request. Nothing else does:

- frames are boxes of the layout, drawn by a box shape (`svgOf` already asks a shape for `frame`, Q8);
- the derived containment lines, the item-flow marks and the port arrows are the types' geometry and `over` layer;
- the crosshair end and the compartment titles are `src/typed/draw.js`'s, which only `lib/umlimator-all.js` holds;
- the projection, the table, the four types, the reader and the writer are family files listed in `ALL` only;
- deleting a part, a constraint property or a parameter takes its connectors through each type's `refs` (by element type,
  as the composite type declares `uml.Connector`'s), which the core already reads (`propRefs`).

| Option | For | Against |
|---|---|---|
| **(a) Plan tens of bytes (the frame mapping); every byte stated in its pull request against the 500 B share; past it asks the maintainer (recommended)** | Most of the share stays; what is left at 0.25.0 goes to the reserve | None found |
| (b) Hand the unplanned part of the share back to the reserve now | A larger reserve for milestone 4a | A finding in a later lane waits for the maintainer |

### 2.4 Rules every package keeps

- **Maps draw exactly as now.** Geometry hashes (`bench/expected.json`), the examples' stills and every map test, in every
  pull request (C1).
- **Every typed example draws exactly as now,** and validates as now. `tests/core-diet.html` and each UML type's tests
  are unchanged: the compartment title, the classifier's own accessible name, the crosshair end, the frame shape and the
  composite type's boxed subject are reached only from fields no UML type or view sets. `tests/core-diet.json`
  fingerprints the targets (`targets()`), so it changes where a target changes, and only there: M3.0 re-records
  17's entry (its `range-equation`) and 19's (its view's id, §15.2), M3.7 the four moved targets, each stated in its pull request. One stated change of
  validation: a generalization between two SysML elements is no longer the class type's error (S20); no example has one.
- **One scope.** `lib/umlimator-all.js` joins every family file into one scope with its imports removed, so milestone
  3's new top-level names in `src/sysml/` carry the prefix `SYS_` (`SYS_TABLE` for `SYS`, `SYS_AS_UML` for `asUml`, …),
  as stage 5's `CS_`, the object type's `OB_` and stage 2's `OWN_` do; the map added to `src/uml/stereotypes.js` takes
  that file's prefix (`UML_META_AS` for `META_AS`); the shape key is `sysml-frame`. The names below are the note's short
  forms of them.
- **The API is additive only** (C2). The four types, their helpers and the reader are internal, in `lib/umlimator-all.js`;
  `props.kind` on a port, `risk`, `verifyMethod` and a compartment's `title` are optional and provisional.
- **Nothing after `layoutTyped` edits what it returned** (stage 4 §2.4): the projection's output is dressed on a copy. A
  test lays each view out twice from one memo and checks the two pictures are byte-identical.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. SysML as stereotyped UML types (S2, S3)

### 3.1 The choice

SysML v1.7 is a UML profile: a block is a UML class with «block» applied, a requirement a class with «requirement», a part
property a UML property whose type is a block and whose aggregation is composite. The plan's row says "SysML's types as
stereotyped UML types"; the proposal (§4) says "SysML's types are then stereotyped UML types in the registry, not a second
metamodel". The model already stores them as `sysml.*` types (`model.md` rows 16 to 19, the four examples).

| Option | For | Against |
|---|---|---|
| **(a) Types of their own, each declared once as a UML metaclass, the SysML stereotype it implies and the UML type it is projected to (§3.2); every consumer reads that table (recommended)** | The model, `model.md` and the examples stay as written; an element's kind is its `type`, which no edit of its stereotype list can change; the palette, the rules and the reader dispatch on types as every other family does; the stereotype check sees a block as a `Class` with «block» (S3); the internal block and parametric types reuse the composite structure type through the projection (S11) | A table to keep in step with the registry's SysML types (a test reads every registered `sysml.*` type and checks it has a row); a SysML element stored as `uml.Class` with `stereotypes: ["block"]` stays a UML class |
| (b) A built-in SysML profile as model data: elements stored as `uml.Class` with «block», `uml.Property` with «…»; the SysML views pick elements by their stereotypes; the profile shipped as a `uml.Profile` the check treats as applied | SysML exactly as a profile; a requirement's `id` and `text` become tags checked by 6.2's machinery | `model.md` rows 16 to 19, the four examples and the reader rewritten; a part, reference and value property are not stereotypes in SysML (they follow from aggregation and type), so the kind of a row would be derived each time; a removed «block» silently turns a block into a class; a profile the tool supplies to every model, which the user never applied |
| (c) Both: (a)'s types, and the SysML stereotypes also applicable to plain UML elements, a `uml.Class` with «block» drawn on a bdd | Two ways in | Two ways to say one thing, each to test; which one the reader writes |

### 3.2 The table

`SYS` in `src/sysml/sysml.js`, one row per type:

| Type | UML metaclass | Implied stereotype (drawn over the name) | Projected to |
|---|---|---|---|
| `sysml.Requirement` | Class | requirement | `uml.Class` |
| `sysml.TestCase` | Behavior | testCase | `uml.Class` |
| `sysml.Block` | Class | block | `uml.Class` |
| `sysml.InterfaceBlock` | Class | interfaceBlock | `uml.Class` |
| `sysml.ConstraintBlock` | Class | constraintBlock | `uml.Class` |
| `sysml.ValueType` | DataType | valueType | `uml.DataType` |
| `sysml.PartProperty` | Property | (none: a property typed by a block, composite) | `uml.Property` |
| `sysml.ReferenceProperty` | Property | (none: a property typed by a block, not composite) | `uml.Property`, `aggregation: "shared"` |
| `sysml.ValueProperty` | Property | (none: a property typed by a value type) | `uml.Property` |
| `sysml.ConstraintProperty` | Property | (none: a property typed by a constraint block) | `uml.Property` |
| `sysml.FlowProperty` | Property | flowProperty | `uml.Property` |
| `sysml.ConstraintParameter` | Property | (none: a property of a constraint block) | `uml.Port` (parametric only: a parameter is drawn where a part's port is) |
| `sysml.Port` | Port | proxy or full, by `props.kind` | `uml.Port` |
| `sysml.Connector` | Connector | (none) | `uml.Connector` |
| `sysml.BindingConnector` | Connector | bindingConnector (not drawn, §9) | `uml.Connector` |
| `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy` | Abstraction | deriveReqt, satisfy, verify, refine, trace, copy | not projected |

M3.7's conformance note checks each row's metaclass against SysML v1.7's clauses (TestCase extends Behavior and
Operation; the six relationships' stereotypes are Abstraction's through «Trace»; a binding connector is a connector).

### 3.3 The stereotype check (S3)

Two lines in `src/uml/stereotypes.js` (M3.1), which stage 6 left for this milestone (Q4):

- `metaOf` returns the table's metaclass for a `sysml.*` type, through an exported map a family fills at load
  (`META_AS`, the rows above): a user profile whose stereotype extends `Class` fits a block, a requirement and a constraint
  block; one extending `Property` fits a value property; `Element` fits everything. Scope stays stage 6's: by ownership,
  so a profile applied to the package that owns the e-bike's blocks reaches them.
- SysML's stereotype names join the known keywords (stage 6 §5.3, rule 3): the table's, and `rationale`, `problem`,
  `allocate`, `allocated`, `equal`, `nestedConnectorEnd`, `participantProperty`, `conform`, `expose`, `view`,
  `viewpoint`, `stakeholder`, `overrides`, and the five kinds Mermaid writes (§12.2). A «rationale» comment inside a
  package that applies a user profile is then not warned.

| Option | For | Against |
|---|---|---|
| **(a) The table read by `metaOf`; SysML's names known as keywords (recommended)** | User profiles work on SysML models as on UML ones; two lines in a stage 6 file | `stereotypes.js` is edited by a milestone 3 lane (no stage 6 lane edits it after 6.2) |
| (b) A virtual profile `SysML`, so `SysML::block` resolves and its stereotypes' metaclasses are checked | SysML's own extensions checked too | A profile no model holds, which `appliedOf`, the panel and the PDF would each learn to show; the types already say what they are |
| (c) Nothing: `sysml.*` elements stay unchecked | No edit | A profile applied to a SysML package reaches nothing; «rationale» is warned in a profile's scope |

SysML's own properties stay the types' props (`reqId`, `text`, `unit`, …), not `props.tags`: tags hold only what a
user's profile defines, as on any element (`TYPED.fields` gives their panel fields on SysML views too).

## 4. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment`, `uml.CommentLink` and `props.stereotypes` are on every SysML view.

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 16 | `sysml.requirement` | `sysml.Requirement`, `sysml.TestCase`, `sysml.Block`, `uml.Package`, `uml.Comment` | | `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy`, `uml.CommentLink` | Requirement props: `reqId`, `text`, `risk` (`low`, `medium`, `high`), `verifyMethod` (`analysis`, `inspection`, `test`, `demonstration`), the last two optional. A requirement's `parent` is a requirement or a package (containment). The view's `subject` may name a package (the frame's element) |
| 17 | `sysml.block-definition` | `sysml.Block`, `sysml.ValueType`, `sysml.InterfaceBlock`, `sysml.ConstraintBlock`, `uml.Package`, `uml.Comment` | `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`, `sysml.FlowProperty`, `sysml.Port`, `sysml.ConstraintParameter`, `uml.Operation` | `uml.Association`, `uml.Generalization`, `uml.Dependency`, `uml.CommentLink` | Member props: `valueType`, `multiplicity`, `default` (a value property's). ValueType props: `unit`, `quantityKind` (text). ConstraintBlock props: `constraint` (text). FlowProperty props: `direction` (`in`, `out`, `inout`). Port props: `valueType`, `kind` (`proxy`, `full`, or none); a type starting `~` is conjugated. The view's `subject` may name a package |
| 18 | `sysml.internal-block` | `sysml.Block` (the `subject`), `uml.Comment` | Its part, reference and value properties, drawn as boxes; `sysml.Port` | `sysml.Connector`, `uml.CommentLink` | Connector props: `itemFlow` (`{ item, direction }`, `from-to` or `to-from`); ends carry `part`. A reference property is drawn dashed. The blocks that type the parts are model nodes this view does not list |
| 19 | `sysml.parametric` | `sysml.Block` or `sysml.ConstraintBlock` (the `subject`), `uml.Comment` | Its `sysml.ConstraintProperty` and `sysml.ValueProperty` members, drawn as boxes; `sysml.ConstraintParameter` (of the constraint blocks that type them; of the subject when it is a constraint block) | `sysml.BindingConnector`, `uml.CommentLink` | A binding to a parameter names the constraint property in `ends.<end>.part`. A constraint block subject shows its constraint properties and its own parameters only, the parameters on its frame (a constraint block holds no value property) |

What changed against `model.md`:

- **`risk` and `verifyMethod`** on a requirement: SysML v1.7's non-normative extensions' annex (extendedRequirement, which
  also has `source`, left out in §17) and Mermaid both have them (§12.1); drawn as rows when set. If M3.7 finds 1.7's PDF
  no longer has extendedRequirement, the conformance note says they come from Mermaid only.
- **A port's kind** (S12) and **conjugation by `~`**: `17-block-definition.json` already writes `"~ChargeInterface"`.
- **`uml.Package` on rows 16 and 17,** and a `subject` that names one: the frame's element (§5.2); stage 2's boxes inside.
- **An ibd shows its subject's value properties** as boxes, as SysML allows; a parametric view shows only constraint and
  value properties (row 19).
- **A constraint block as a parametric subject** puts its parameters on the frame, as the composite type puts a subject's
  ports on its box.

## 5. Frames (S4, S5)

### 5.1 How a frame is drawn

SysML v1.7's Annex A gives every diagram a frame: a rectangle whose header, a pentagon in the top left corner, names the
diagram's kind, the kind and name of the element it represents, and the diagram's name. UML's frames are optional and
none of the UML types draws one round a view (stage 3 left out the `sd` frame); SysML's views always have one.

- **req and bdd:** one box of the layout (`containers`) holding every node the view lays out; stage 2's package boxes are
  nested in it (`parent` the frame). Its id is the subject's when the view has one (selecting the frame selects the
  package, F2 renames it), else the geometry id `<view>->frame`, which no element has (rule 5): selected and handed to
  the hooks as stage 5's port on a part is; F2 on it renames the view's title (`set` of the view's `title`). A package
  subject listed in `nodeIds` gets no `ownersOn` box of its own: the frame is its box, and what it owns is laid out in
  the frame as in its box.
- **Drop and Delete on a frame.** The canvas drops a dragged card into the smallest box under it (`boxAt`,
  `src/canvas/render.js`) and emits `reown(id, into ?? view().subject ?? null)` (`src/canvas/edit.js`). With a package
  subject the frame's id is the subject's, so a card dragged out of a package box lands in the subject, as it does today
  when dropped on the bare canvas. With no subject, `into` would be `<view>->frame`, which is no element, and Delete on
  the frame would hand the core the same id. M3.1 maps a box whose id names no element to `view().subject ?? null` on
  drop and skips it on Delete, in `src/canvas/edit.js`: tens of bytes of the core, stated against the share (S17).
- **ibd and par:** the subject's box (the composite type's container for its subject) is the frame. Its ports, or a
  constraint block's parameters, sit on its border, as SysML draws them. `csGeo` makes the subject a box only when it
  has parts or collaboration uses (`boxed`, `src/uml/composite.js`); a constraint block subject usually has only
  parameters, and an ibd's block may have ports and no parts, so either would be drawn as a plain classifier with ports
  and no frame. The projection sets a view field no UML view sets (`boxSubject: true`) and `csGeo`'s `boxed` condition
  reads it: one condition in `composite.js`, made by M3.1 with its own test that a box with no parts lays out (the
  mean position of no ids). No UML picture changes.

| Option, a subject with no parts | For | Against |
|---|---|---|
| **(a) One condition in `csGeo`'s `boxed`, read from `boxSubject`, a view field only the projection sets (recommended)** | The frame is always the composite type's box: ports on it, its size from the layout; one code path | `composite.js` is edited, where the note had it read only; stage 5 has merged, so the lead approves the line in M3.1's pull request |
| (b) For a subject with no box, the frame drawn in `under` from the subject node's bounds | `composite.js` untouched | Two ways to draw a frame; the node is a classifier drawn under a frame drawn by hand; ports placed on a node sized for a card, not a frame |

**As built (M3.1, a departure found in the build, 14 Nov 2026).** (a) does not hold: the layered layout makes no box round
no card (`frameOf`, `src/layout/layered.js`, returns no frame for a box with no `nodeIds` and no child box), so with the
condition alone a subject holding no part has no box, and its card and ports vanish; a box there needs the core's layout
(core bytes) or a placeholder card. Taken by the lead under the maintainer's standing approval (14 Nov 2026): `composite.js`
is not edited and no view sets `boxSubject`; the composite type lays a subject holding no part out as it does today, a card
sized for its ports (`portFit`), and `SYS_DRESS` (`src/sysml/sysml.js`) takes that card out on its copy and puts a
`sysml-frame` box at its bounds, so its ports sit on the frame's border. One shape draws every frame; what differs is only
where its bounds come from. Such a frame is a card's size: its tag is cut to it (§17).
- **The shape:** `SHAPE['sysml-frame'] = { frame(f) }` in `src/sysml/sysml.js`: the rectangle in `--um-muted` and
  `frameTag(f.x, f.y, f.title, f.w)` (`src/uml/frame.js`), its text cut to the frame's width. A box takes 38 px of
  header room (`head: 14` over the 24 a box has), so 64 px lie between the frame's top and its cards, enough for the 17 px
  tag; laid out down as right (the turned layout's left becomes the top), as M3.1's test lays it out.

| Option, req and bdd | For | Against |
|---|---|---|
| **(a) The frame is a box of the layout holding every node (recommended)** | The layout makes its room and keeps lines inside it; the canvas selects it as any box | A box with no element when the view has no subject (a geometry id), which the canvas's drop and Delete must map (tens of core bytes, above) |
| (b) Drawn after the layout in the type's `under` layer, the geometry grown by a margin on a copy | No box, so no core byte: a drop on the frame is a drop on the canvas | Selection and the frame's accessible name by hand; bounds moved on a copy; F2 on the frame has nothing to select |
| (c) No frame (UML's choice) | Nothing to build | Not SysML's notation; the header is how a reader tells a bdd from a class diagram |

| Option, ibd and par | For | Against |
|---|---|---|
| **(a) The subject's box is the frame (recommended)** | SysML's own drawing: the block's ports on the frame; one rectangle | The composite type's box title is replaced by the header |
| (b) A frame round the subject's box | Two separate things | Two nested rectangles 38 px apart; ports not on the frame |

### 5.2 The header (S5)

`kind [ElementType] name [view title]`, where `kind` is `req`, `bdd`, `ibd` or `par`, and the element is the view's
subject: `bdd [Package] E-bike [E-bike blocks]`, `ibd [Block] EBike [Inside the e-bike]`,
`par [Block] EBike [E-bike range]`. A view whose title equals the element's name leaves out the brackets' second part.

| Option, a view with no subject | For | Against |
|---|---|---|
| **(a) `[Model]` and the model's `title`: `bdd [Model] E-bike: blocks [E-bike blocks]` (recommended)** | SysML's grammar kept: Annex A lists `model` among a header's element types; the diagram is of the model's root | Long; the name is the model file's `title`, not a Model element's name, which a reader may have set for something else |
| (b) The kind and the view's title only: `bdd E-bike blocks` | Short | Not SysML's grammar |
| (c) A subject required (warning `frame-subject`); the examples gain a package | Every header names an element | Every example and every reader's output needs a package; a warning on most models |

The frame's accessible name is "Block definition diagram of package E-bike: E-bike blocks"; its tag is not read out apart.

## 6. The requirement diagram

### 6.1 Drawing (S6)

Laid out by `layoutTyped`, down by default as `16-requirement.json` asks; `repair: false`, `reroute: false`. The host's
ranking (`flowPos` and `blockPos`, `src/map/context.js`) reads only the model's edges through `rankFlip`, so it never sees
a derived containment line. The type ranks itself, as the composite type does (`layout: Object.assign(fn, { rank: false
})`): its rank links are the view's relationships, a derive's supplier first, and each shown requirement's containment
pair, the owner first, so a requirement sits above what it contains. M3.2 owns it and §14 times it inside each edit.

| Element | Drawn |
|---|---|
| Requirement | The classifier: «requirement» (and any stored stereotype after it, Mermaid's kinds among them) over its name; one compartment, named `requirement`: `id = "EB-1.1"`, then `text = "…"` wrapped at 224 px into rows, then `risk = high` and `verifyMethod = test` when set. `present.<id>.rows` caps the compartment ("+k more"); `collapsed: ["requirement"]` hides the whole compartment (id, text, risk and verify method), leaving the keyword and the name |
| Test case | The classifier, «testCase» over its name, no compartment |
| Block | The classifier, «block» over its name, no compartment (its compartments are the bdd's) |
| Package | Stage 2's box (`ownersOn`), holding what it owns that is shown |
| Comment | The class type's note; its stereotypes («rationale», «problem») as its first line |
| Containment | A derived solid line from the requirement to its owner, a crosshair at the owner (§6.2) |
| The six relationships | A dashed line with an open arrow at the supplier and its keyword at its middle, the class type's dependency look |

The wrapped text is the type's: it splits `text` into rows by `textW` before the layout, each row a member of the
classifier's drawing input, so the classifier draws them as it draws attributes, and its size counts them. A word wider
than 224 px is cut there. The classifier builds its `aria-label` itself (`classSvg`: the type's words, the stereotypes,
each compartment's count), so a requirement would be read "Requirement Pedal assistance (requirement), 4 requirement",
its keyword twice and its wrapped rows counted as members. M3.1's edit of `src/typed/draw.js` lets a new node field,
`ariaOwn`, replace that label when set. The class and object types already set `aria` on their classifier nodes (for the
canvas's focus ring), so the field is a new one, which no UML type sets, and no UML picture changes; every SysML node
built on the classifier sets it to §13's name.

| Option, the text | For | Against |
|---|---|---|
| **(a) Wrapped whole, capped by `present.rows` when the user wants it shorter (recommended)** | The requirement's words are its point; the cap is stage 1's, per view | A long text makes a tall box |
| (b) Six rows at most by default, "+k more" | Even boxes | The default view hides part of most texts; the PDF's rows have it whole anyway |

### 6.2 Containment (S7)

| Option | For | Against |
|---|---|---|
| **(a) `parent` in the model; a requirement owned by a shown requirement drawn with a derived line and a crosshair at the owner; one owned by a package drawn in its box (recommended)** | SysML's usual picture of a requirement tree; `model.md` row 16 as written; the core's ownership checks (cycles, `reparent`) apply; one place for the fact | A line that is not an edge: its geometry id is `<owner>-><child>` (rule 5), and the hooks learn it |
| (b) Nested boxes, as packages | Stage 2's code | Deep trees nest four boxes deep; SysML draws requirement trees with the crosshair |
| (c) A stored `sysml.Containment` edge | An ordinary line | Two places for one fact (`parent` and the edge) to disagree |

The crosshair is a new row of `ENDS` (`crosshair`: a 14 px circle with a cross, hollow), added from `src/sysml/sysml.js`
when M2.2 has exported the table, or as one row in `src/typed/draw.js` by M3.1 otherwise (§16.4). The derived line is
not hidden on its own (the child or its owner is); Delete on it un-owns the child (`reparent` to the owner's own owner,
so a requirement in a package stays in it), said first on the hint line; connecting a requirement to another with the
Containment tool emits `reparent`.

### 6.3 The relationships and their rules (S8)

Each rule with a passing and a failing fixture (DoD 5), in `tests/requirement.test.mjs`; a problem names its rule and its
elements. Errors are SysML's constraints on «requirement» and the six relationships (clause 16); warnings are what SysML
calls usual, or where the subset is stricter than SysML.

| Rule | Level | Says |
|---|---|---|
| `requirement-owner` | warning | a requirement's owner is a requirement or a package. SysML has no such constraint (its rule runs the other way: a classifier nested in a requirement is a requirement, `requirement-nested`); the subset's restriction, stated in §17 |
| `requirement-nested` | error | what a requirement owns is a requirement (SysML: a nested classifier of a «requirement» is a «requirement») |
| `requirement-members` | error | a requirement has no members (no attributes, operations or ports: SysML's constraints on «requirement») |
| `requirement-general` | error | no generalization touches a requirement |
| `requirement-association` | error | no association has a requirement at an end (SysML: a requirement may not take part in an association) |
| `requirement-typing` | error | no property, port or parameter is typed by a requirement's name (SysML: a requirement may not type an element) |
| `requirement-id` | warning | no two requirements share a `reqId` |
| `requirement-text` | warning | a requirement has a `text` |
| `derive-ends` | error | a deriveReqt runs from a requirement to a requirement |
| `derive-cycle` | warning | no requirement is derived from itself through a chain |
| `copy-ends` | error | a copy runs from a requirement to a requirement |
| `copy-text` | error | a copy's client has its supplier's `text` (SysML's Copy constraint: the client's text is a read-only copy of the supplier's). The Copy gesture sets it in the same transaction (§6.4), so the rule fires only on a model edited by hand or read in |
| `satisfy-ends`, `verify-ends` | error | a satisfy or a verify runs to a requirement (SysML constrains the supplier) |
| `satisfy-from`, `verify-from` | warning | a satisfy runs from an element that is not a requirement; a verify runs from a test case (SysML allows any named element as the client; these are what is usual) |
| `refine-ends`, `trace-ends` | warning | one end of a refine or a trace is a requirement |
| `risk-value`, `verify-method` | warning | `risk` and `verifyMethod` are among the listed words |

### 6.4 Editing

| Gesture | Command |
|---|---|
| Palette: Requirement, Test case, Block, Package, Comment | `add`; a requirement into the selected requirement or package (its `parent`), else the frame's subject, else none; `reqId` left empty, said on the hint line |
| Lines: Containment, Derive, Satisfy, Verify, Refine, Trace, Copy, Comment link | `connect`, checked against §6.3's errors (`{ error }` with the rule's words); Containment emits `reparent` of the first to the second; Copy also sets the client's `text` to the supplier's, in one transaction |
| F2 on a requirement | Its name; `EB-1.2 Range` sets `reqId` and the name together when it starts with a token holding a digit and no space |
| Properties | `reqId`, `text`, `risk` (enum), `verifyMethod` (enum), Stereotypes; tags by stage 6's `TYPED.fields` |
| Delete, Shift + Delete | Delete hides a node; Shift + Delete deletes it, what it contains re-homed to its owner (the core's delete, 1.12b); on a line it deletes the line (a containment line: S7) |

## 7. The block definition diagram (S9, S10)

### 7.1 Drawing

The type's own node builder (`src/sysml/blocks.js`), about the size of `typeGeo`, through `drawnLines` and `ownersOn`
(packages as boxes), the classifier and `layoutTyped`, and the class type's line looks (`lineLook`, `lineLabel`,
`lineName`, `legendOf`, exported by M3.1). Down by default, `repair: false`, `reroute: false`; a generalization ranks the
general first, as in the class type.

| Element | Keyword | Compartments, in order (each drawn with its name, `title: true`) |
|---|---|---|
| Block | «block» | `parts`, `references`, `values`, `constraints` (constraint properties), `operations`, `ports`, `flow properties`; an empty one is not drawn |
| Interface block | «interfaceBlock» | `flow properties`, `ports`, `operations` |
| Constraint block | «constraintBlock» | `constraints` (its expression's row, `{range = energy / consumption}`, then its constraint properties, the constraint blocks it uses), `parameters` |
| Value type | «valueType» | one compartment of `unit = Wh`, `quantityKind = energy`, when set |
| Package, comment | as the class type | |

Rows, as the classifier's `memberText` prints them: a property `name: Type [mult]` (a value property ` = default` after
it), a port `name: Type` with «proxy» or «full» before it, a flow property `in dc: DCPower`, an operation as the class
type prints it. The kind words before a row («proxy», `in`) are the type's: it puts them in the label it hands the
classifier. `present.<id>.collapsed`
names compartments to hide, as in the class type.

| Option, how the bdd is built | For | Against |
|---|---|---|
| **(a) Its own node builder on the classifier, with named compartments (S10) and the class type's line looks read through its export line (recommended)** | No edit of `typeGeo`, which 6.3 edits (Q9); SysML's compartments | About 40 lines beside `typeGeo`'s 20 |
| (b) `typeGeo` with a hook in its look (`look.node(n)`) | One builder | Edits the lines 6.3 (#240) changes; the class type's tests guard it |

| Option, compartment names (S10) | For | Against |
|---|---|---|
| **(a) `title: true` on a compartment draws its name, centred, muted, as a row (recommended)** | SysML's named compartments; a field no UML type sets, so no picture changes | An edit in `src/typed/draw.js`, which 6.3, M2.2 and 4b.1 also edit (§16.4) |
| (b) The name as the compartment's first row, built by the type | No edit of the classifier | Counted as a member in the accessible name; selected as a row |

### 7.2 Associations

A composite association is drawn with a filled diamond at the whole and its far end's role and multiplicity (the class
type's look). In SysML its end is the whole's part property. The examples store EBike's parts both ways: 17 as composite
associations (`ebike-battery`, role `battery`), 18 as members (`ebike.battery`). An ibd reads members only, so an ibd of
17's EBike would show no part; in the e-bike atlas EBike has both, and a rule that warns on any name held twice would
warn three times there.

| Option, a part stored as a member and as an association end | For | Against |
|---|---|---|
| **(a) The member is the part; an association end of that role is the same part drawn as a line; they must agree (recommended)** | One element per part, which the ibd's connectors name (`ends.<end>.part`); 17 and 18 both stay as written and merge clean; a bdd keeps SysML's usual composition lines | Two rules: `part-agrees` (warning: an end and the member of its role differ in type or multiplicity) and `part-unlisted` (warning: a composite end names no member, so no ibd of the block shows it) |
| (b) An association end is itself a part: the projection makes a part from each composite end with no member of its role | Either form draws on an ibd | The made part has no element id, so no connector can reach through it; two stores of one fact the model never reconciles |
| (c) One form only: M3.0 drops 17's three associations, or 18's members | No rule | Without the associations the bdd loses its composition lines; without the members the ibd has no parts |

With (a), the parts compartment lists the block's part members, and an end that is also a member is not listed twice;
17's three associations warn `part-unlisted` on their own (17 has no ibd), so M3.0 adds the three members to 17 with
18's ids and types, and the atlas validates with no problem (M3.7's done-when).

### 7.3 Validators

| Rule | Level | Says |
|---|---|---|
| `part-type` | warning | a part or reference property's type, when it names an element of the model by label, names a block (not a value type or a constraint block) |
| `value-type` | warning | a value property's type, when it names an element, names a value type (`Real`, `Integer`, `Boolean`, `String` and any name of no element are fine, rule 11) |
| `constraint-type` | error | a constraint property's type names a constraint block |
| `flow-direction` | error | a flow property's `direction` is `in`, `out` or `inout`; it is owned by a block or interface block |
| `port-kind` | error (confirm) | a port's `kind` is `proxy`, `full` or none; a proxy port is typed by an interface block, a full port is not (clause 9's constraints on ProxyPort and FullPort) |
| `member-kinds` | error | each member type is one its owner may hold: a constraint block holds only parameters and constraint properties (and its expression; clause 10); an interface block holds only flow properties, proxy ports and operations, no part (clause 9); a constraint parameter only in a constraint block; a flow property not in a constraint block or value type |
| `general-kinds` | error | a generalization joins two elements of one SysML type |
| `part-agrees`, `part-unlisted` | warning | §7.2 |

Each with a passing and a failing fixture in `tests/blocks.test.mjs`.

The class type's `generalization-kinds` (S20): `isCls` is asked only when both ends are `uml.*`; a generalization with an
end of another notation is that notation's to judge (`general-kinds` here). One condition in `classProblems`
(`src/uml/class.js`, M3.1), stated in 0.25.0's notes as a change. As built: an end of another notation is one whose type
names a notation other than `uml` (`sysml.Block`, `c4.System`); an untyped end, or one whose type names no notation
(`Class`), is still the class rule's, as before.

| Option | For | Against |
|---|---|---|
| **(a) The class rule leaves ends of other notations to their types (recommended)** | One condition; ER's or C4's generalizations, if they come, meet the same rule | A UML class specializing a block is no longer refused by the class rule (`general-kinds` refuses it on a bdd view only) |
| (b) The SysML classifier kinds join `CLASSIFIERS`, each a kind of its own (as 6.3 does for `uml.Stereotype`) | The class rule judges SysML too | The class type learns SysML's types; each new family adds its own |

### 7.4 Editing

| Gesture | Command |
|---|---|
| Palette: Block, Interface block, Constraint block, Value type, Package, Comment | `add` |
| Lines: Association (part), Reference association, Generalization, Dependency, Comment link | `connect`; Association (part) sets `ends.from.aggregation: composite` |
| A member row | A keyword picks the kind: `part`, `ref`, `value`, `constraint`, `port` (`proxy port`, `full port`), `in`, `out`, `inout` (a flow property), `param`; with none, the type picks it: a name of a block makes a part, of a constraint block a constraint property, anything else a value; an operation by its parentheses (`parseMember`). Printed back with the keyword (§7.1's rows). `{error}` for a kind the owner may not hold (`member-kinds`) |
| A constraint block's expression | F2 on its `constraints` row: the text inside the braces |
| Properties | A value type's `unit` and `quantityKind`; a port's `kind` (enum); a flow property's `direction` (enum); `multiplicity`, `default`; Stereotypes; tags |

## 8. The internal block diagram (S11 to S13)

### 8.1 The projection (S11)

`asUml(model, view)` (`src/sysml/sysml.js`) returns a copy of the model whose SysML elements have their projected types
(§3.2), ids unchanged, with a reference property's `aggregation: "shared"` and a port's `valueType` stripped of `~`; the
view is copied with its `diagram` set to `uml.composite-structure` (as built: no `boxSubject`, §5.1).

**Members by view kind.** `csPic` makes every `uml.Property` member of the subject a part and every `uml.Port` member a
subject port, and the table projects part, reference, value, constraint and flow properties all to `uml.Property`. In the
e-bike atlas `ebike` holds 17's, 18's and 19's members (merged by id), so without a filter the ibd would draw `eco` and
`boost` as parts and the par view `battery` and `motor`. The projection keeps, of the subject's members:

- ibd: part, reference and value properties, and ports;
- par: constraint and value properties, and parameters only when the subject is a constraint block.

As built (M3.1): a member the view kind does not show keeps its SysML type rather than being dropped, which the composite
type passes over (`kids` reads `uml.Property` and `uml.Port` only), so every node, member and line keeps its index and the
paths of `csProblems`' problems name the original; so does a line of the other kind (a binding on an ibd, a connector on a
par view) and a parameter on an ibd. Members of other elements (a part's type's ports, a constraint block's parameters) are kept as they are. A test lays out
each e-bike view from the merged atlas and from its own file. As built (M3.1, a departure found in the build, 14 Nov 2026):
the two pictures are not equal, and the filter by view kind cannot make them so, for the targets' data differ: the
merged `ebike` holds members of the view's kind that other files give it (17's part `wheels` and 19's six value
properties on the ibd, 17's constraint property `rangeEq` on the par view), and 17 gives the three parts `multiplicity`
`1` and `battery.charge` the type `ChargeInterface`, which 18 does not. The test checks that the filter keeps the other
kind's members out and that, with the file's own nodes put back in the merged model, each view is its file's picture: the
projection and the merged model's other nodes and views add nothing. Taken by the lead under the maintainer's standing
approval (14 Nov 2026): the filter stays as above (a block's ibd shows the parts and values it has); the targets' data
are M3.7's to settle (§15.2).

**Texts measured by the layout are set before it.** `csGeo` gives a line room only from its `label` (`label:
String(e.label), cut: 280`) and sizes a port's name box from `label: csName(p.q)` (`portsDrawn`), so what the reader sees
must be there when it measures. The projection sets a connector's `label` to its `itemFlow.item` (an item flow's
label wins over a stored label, which no example has) and puts «proxy» or «full» before a port's label; the mapping back
strips both, so no command writes them into the model.

The type calls `csGeo` on the projection, then dresses the geometry on a copy:

- the subject's box takes the shape `sysml-frame` and the header as its title (§5);
- every node's, port's and line's `aria` is the SysML type's (§13), from the original model, by id;
- a port typed by an interface block gets an arrow inside its square (§8.2);
- an item flow's triangle goes in `over` (§8.3);
- the legend is SysML's.

The type's own `validate` runs `csProblems` on the projection for the shared structural rules and keeps those whose words
fit (`connector-part`, `connector-scope`, `connector-drawn`, and `part-type` for part and reference properties only:
`csPic`'s `typeOf` finds only a class or component by label, so it would warn on every value property, which `value-type`
judges, and every constraint property, which §9's rules judge), each re-said in SysML's words by rule and ids, with its
own rules (§8.4). New elements the hooks add (`csConnect`, `csAdd`, `csMember` on the projection) are mapped back to
SysML types in the commands they return (`uml.Connector` to `sysml.Connector`, a part row to `sysml.PartProperty`).

The projection, the frame dressing, port kinds, the re-saying of `csProblems` and the mapping back are common to the ibd
and the par types, so they live in `src/sysml/sysml.js` (M3.1), and M3.4 and M3.5 each call them.

| Option | For | Against |
|---|---|---|
| **(a) Projection onto the composite type, dressed after (recommended)** | The plan's own words: SysML's types are stereotyped UML types; stage 5's geometry, ports and gestures reused; `composite.js` edited by one condition only (§5.1) | A copy of the model per layout (linear, timed in §14); problems re-said by rule; commands mapped back |
| (b) `composite.js` parameterized by a kinds table (subject, part, port and connector types, words) | One code path, SysML's words at the source | About 100 literals of a stage 5 file rewritten (Q5); its tests the only guard |
| (c) A copy of the composite type for SysML | Free to differ | Two copies of stage 5's hardest code |

### 8.2 Ports (S12)

| Option | For | Against |
|---|---|---|
| **(a) `props.kind`: `proxy`, `full` or none; a port typed by an interface block shows its flow direction as an arrow in its square (all in, all out, or both); `~` conjugates; flow ports left out (recommended)** | SysML v1.7's ports; the direction a reader looks for, derived, never stored | Flow ports in older models read as plain ports |
| (b) Also SysML 1.2's flow ports (`kind: "flow"`, a stored `direction`) | Older models drawn as their authors drew them | Deprecated since SysML 1.3; two ways to say a direction |

A full port is drawn as stage 5's port square with «full»; SysML also allows a full port drawn as a part on the border,
left out (§17).

### 8.3 Item flows (S13)

| Option | For | Against |
|---|---|---|
| **(a) The item as the line's label (the router gives it room); a filled 8 px triangle on the middle of the line's longest segment, pointing `from-to` or `to-from` (recommended)** | SysML's picture; no end marker taken, so a connector keeps plain ends | A mark the layout check does not see: kept off labels by placing it on the segment's middle, 12 px from the label |
| (b) An arrow at the connector's end | An existing end | Reads as a directed connector, which SysML connectors are not |

### 8.4 Validators

| Rule | Level | Says |
|---|---|---|
| `subject-block` | error | the view's subject is a block it lists in `nodeIds` |
| `connector-part`, `connector-scope`, `connector-drawn`, `part-type` | as the composite type's | re-said in SysML's words; `part-type` for part and reference properties only (§8.1) |
| `item-flow` | warning | an item flow's `direction` is `from-to` or `to-from` and its `item` is text |
| `port-compatible` | warning | between two parts' proxy ports typed by one interface block: the ends are conjugate (one `~`), or their flow directions are opposite. Between a part's port and the frame's port (delegation): the same type, not conjugate, and the same flow direction |

Each with a passing and a failing fixture in `tests/internal-block.test.mjs`, delegation and assembly each.

### 8.5 Editing

As the composite type (stage 5 §12): parts and references added, ports moved by Alt + arrows, connectors drawn between
ports through parts. Palette: Part, Reference, Value, Port, Comment; lines: Connector, Comment link. Properties:
`itemFlow.item` (text) and `itemFlow.direction` (enum) on a connector, through the panel's `path`; a port's `kind`.

## 9. The parametric diagram (S14)

The same projection, with:

- the subject's constraint and value properties as parts: a constraint property `eco : RangeEquation` drawn with 10 px
  rounded corners and its block's expression `{range = energy / consumption}` under its name, cut to the box (the
  part's size is the composite type's, from its name: §17); a value property `ecoRange : Distance` as a plain box;
- the parameters of the constraint block a constraint property's type names, as that part's ports (`sysml.ConstraintParameter`
  projected to `uml.Port`), their names beside them as stage 5 draws port names;
- a constraint block subject's own parameters on the frame; such a subject shows its constraint properties and its own
  parameters only (a constraint block holds no value property, §7.3), as SysML's usual pattern of a constraint block
  built from others;
- binding connectors as plain solid lines, no ends.

| Rule | Level | Says |
|---|---|---|
| `subject-kind` | error | the subject is a block or a constraint block, listed in `nodeIds` |
| `binding-ends` | error | a binding joins a value property of the subject, a parameter of the subject, or a parameter reached through a constraint property, at each end; a parameter through a part that is not a constraint property is refused |
| `binding-parameter` | error | the parameter is one of the constraint property's type's |
| `binding-types` | warning | the two ends' types, when both are set and name elements, are equal or one specializes the other (SysML: the same or compatible types) |
| `parameter-bound` | warning | each parameter of a constraint property shown has a binding |

Each with a passing and a failing fixture in `tests/parametric.test.mjs`.

| Option, nested ends (`battery.capacity`) | For | Against |
|---|---|---|
| **(a) Left out: a binding reaches the subject's own value properties and parameters (recommended)** | Stage 5's one `part` per end; the e-bike example needs no more | Real parametric models bind values deep in parts; they need a value property on the subject to bind through |
| (b) `ends.<end>.path`: the parts from the subject down, SysML's «nestedConnectorEnd» | Real models | A path form stage 5 refused (`model.md` §3, stage 5); the composite geometry draws one part per end |

Editing: Palette Constraint property, Value property, Comment; line Binding; connect from a value to a parameter's square
(through its constraint property) emits a `sysml.BindingConnector` with `ends.to.part`.

## 10. SysML elements in other views

A block, requirement or test case shown on a UML view (a class view of a mixed model) is drawn by that type as an element
of an unknown type is drawn there; nothing in the UML types learns SysML. The four SysML types do not show UML-only
elements but `uml.Package` and `uml.Comment`. The core's `validate()` warns per view, not per element type: a view
whose `diagram` no registered type draws gets "diagram … is not drawn by this release" (`src/map/validate.js`). M3.1's
table changes nothing there; the warning goes from a view as M3.2 to M3.5 each register its diagram type.

## 11. Editing, all four

- Every gesture has a key and is tested by pointer and by key through `apply()` (DoD 4); no new key is bound (Q16).
- A 30-step session per type undone, redone and reopened from saved JSON gives byte-identical models (DoD 6).
- Hiding (DoD 4): a node is hidden by Delete as every type; a line (a requirement relationship, an association, a
  connector, a binding) is hidden by Delete where the view lists its lines (`edgeIds`), else deleted, said first, as the
  canvas does and stage 5 settled (stage 5 §12); a member (a port, part, parameter) cannot be hidden, as stage 3's
  messages (P12) and stage 5's members (S20); a derived containment line cannot be hidden on its own (S7), only with
  the child or its owner. A label is hidden with its line, or by `present.<id>.collapsed` for a compartment's rows. The
  conformance notes say each under item 4.
- Each SysML element's properties form lists Stereotypes, and stage 6's tag fields follow (`TYPED.fields`).

## 12. The Mermaid reader and writer (S15, S16)

### 12.1 The reader

`readMermaidRequirement(text) -> { model, report }` and `writeMermaidRequirement(model, viewId?)`, in
`src/readers/mermaid-requirement.js`, `lib/umlimator-all.js` only, against Mermaid 12.3.0's requirement diagram page
(Q13), pinned by `tests/import/requirement.mmd`, a file with every construct the page shows (R4).

| Mermaid | Model |
|---|---|
| `requirement name { … }` and the five other kinds | `sysml.Requirement`; a kind other than `requirement` stored as a stereotype (`functionalRequirement`, …), drawn over the name |
| `id:`, `text:` | `reqId`, `text` |
| `risk: High`, `verifymethod: Test` | `risk: "high"`, `verifyMethod: "test"`; any other word kept as written and reported |
| `element name { type: …, docref: … }` | `sysml.TestCase` when `type`, its quotes removed and its case ignored, starts with `test` (`TestCase`, as the writer writes it, and the page's `"test suite"`), `sysml.Block` otherwise (the page's `simulation`, `"word doc"`, …); `type` (unless `Block` or `TestCase`) and `docref` (or `docRef`) kept under `ext.mermaid`, reported once per file as approximated |
| `a - contains -> b`, `b <- contains - a` | `b.parent = a` |
| `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces` | `sysml.Copy`, `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, from the arrow's tail to its head (Mermaid draws the arrowhead at the head, as SysML draws it at the supplier) |
| `direction TB`, `LR` | the view's `direction`: `down`, `right`; `BT` and `RL` read as `down` and `right`, reported |
| Quoted names and text, Markdown in them | kept as written, the quotes removed; Markdown reported once |
| `style`, `classDef`, `class`, `:::` | skipped, reported once per kind |
| A relationship whose ends break one of §6.3's errors (the page's own `test_req <- copies - test_entity2`: an element copying a requirement breaks `copy-ends`) | skipped and reported, so the model it writes passes `check.mjs`; the construct file's report pins the page's example |

Ids from names (R3): the name itself when it is an id (`[\w.-]+`), else a slug; when that id is taken (an element
really named `a-2`, a requirement and an `element` of one name), `-2`, `-3`, … are tried until one is free. One name
defined twice (as a requirement or an element) keeps the first, reported. A relationship from an element to itself
(`a - derives -> a`) is read and left to the rules (`derive-cycle` warns). One view, `requirements`, lists every
element.

The writer's comments are read as untrusted input: a `%% id:` whose id breaks the id rule, clashes with another, or
names no element written before it is skipped and reported, never applied, and `__proto__` is an ordinary id (the
tables are prototype-free); `%% text:` is parsed by `JSON.parse` inside `try`, bad JSON or a value that is not a string
is reported and the field's own value kept; `%% name:` likewise.

### 12.2 Limits on hostile input (R2)

| Input | What happens |
|---|---|
| Over 1 MiB of characters | Nothing read, the report says so (`MC_LIMIT`'s way) |
| Any line | Read by a hand-written scanner, one pass, no regular expression with nested repetition |
| A name `__proto__`, `constructor` | An ordinary name: every table by name is prototype-free (`mcTable`'s way) |
| A block `{` with no `}` | Read to the end of the input, reported |
| A field given twice | The last kept, reported |
| An unknown kind word or field | The block or line skipped, reported |
| A relationship naming an undefined element | Skipped, reported (Mermaid draws it; the model has nothing for it to join) |
| A second `contains` of one element | Skipped, reported: an element has one owner |
| A `contains` that would close a cycle | Skipped, reported, so the model passes the core's ownership check; found once after reading, by one colouring pass over all containments (white, grey, black, with an explicit stack), which drops the `contains` that closes each cycle: linear in the file. Walking owners on each `contains` would be O(n·depth), quadratic on a chain |
| A containment chain 10,000 deep | Read, and validated by the core, with no recursion: a test, untimed, sized to its purpose. The core's own ownership walk (`src/core/model.js`) is O(n·depth): measured, `validate()` of a 10,000-deep chain takes 2.2 s CPU. Fixing it costs core bytes, so M3.7 records it in `risks.md` (P1) and no test times it |
| The deepest containment chain that fits under the limit | Read under 1 s, a " (timed)" test of the reader alone |
| 10,000 requirements and 10,000 relationships | Generated to about 900 KB, the size asserted under `MC_LIMIT` (1,048,576 characters) in the test; read in under 1 s, a " (timed)" test |

### 12.3 The writer

`requirementDiagram`, `direction TB` for a view laid out down, `LR` otherwise; each requirement with its kind (a
stereotype of the five kinds, else `requirement`), `id`, `text` quoted, `risk` and `verifymethod` when set; blocks and
test cases as `element` with `type: Block` or `type: TestCase`, and `ext.mermaid`'s fields back; containment as
`contains`; the six relationships forward. What Mermaid has no place for goes in comments the reader reads back:
`%% id:` for an id the reader would not derive from the name. A text holding a double quote or a line break is written
with the character removed and the whole text in `%% text: <JSON string>`, read back over the field. A comment and its
link, and packages, are not written: reported. A name Mermaid cannot read bare (a space, `-`, `<`, `>`, `{`, `}`, `:`,
`%%`) is written quoted; one holding a double quote or a line break is written with the character removed and whole in
`%% name: <JSON string>`, read back as `%% text:` is, so it reads back equal. `read(write(model))` equals the model for `16-requirement.json` without its comment, for 500
generated models on the subset, and for generated models whose names hold each of those characters.

| Option | For | Against |
|---|---|---|
| **(a) A reader and a writer (recommended)** | As the class, sequence and state readers; Mermaid is the notation agents write (D12) | The comments' conventions to keep |
| (b) A reader only | Less | A model edited here cannot go back to Mermaid |

### 12.4 The CLI (S16)

`umlimator_import.py`'s `MERMAID` and `TYPED` gain `requirementDiagram`; `umlimator.py import` routes it to the reader
through Node, as a `classDiagram` (R7); the report is printed as the other readers' is. `tests/import.py` gains the case.
Today the file is refused (Q11), so nothing that worked changes.

## 13. `describe()`, the PDF and the legend

| Element | `word` | `rows` |
|---|---|---|
| Requirement | Requirement | `id`, `text` whole, risk and verify method; its derived relations: contained in, contains, derived from, derives, satisfied by, verified by, refined by, traced to, copies, copied by |
| Test case | Test case | the requirements it verifies |
| Block, interface block, constraint block, value type | Block, Interface block, Constraint block, Value type | each compartment's rows, as drawn; a value type's unit and quantity kind |
| Part, reference, value, constraint property | Part, Reference, Value, Constraint | `name: Type [mult]`; a constraint property's expression |
| Port | Proxy port, Full port, Port | its type, conjugated or not, its flow direction |
| A line | | M2.1's `text` (so M3.2 to M3.5 wait for M2.1, §16.2): a connector's item flow ("DCPower, battery to dock"), a binding's ends |

Accessible names: "Requirement Pedal assistance, EB-1.1: The motor shall assist the rider only while the rider is
pedalling"; "Satisfy from block Controller to requirement Assistance cut-off"; "Connector from power of battery to supply
of controller, carrying DCPower from power to supply"; "Binding from value ecoRange to parameter range of eco". Reading
order: the frame, then what it holds as each type's layout orders it (top to bottom, then left to right), then the lines.
Legends: the six relationships and containment (req); association, composition, generalization, dependency (bdd);
connector, item flow, proxy and full port (ibd); binding (par). Contrast: lines `--um-muted`; texts `--um-text`. The
names on classifier nodes reach the SVG through `ariaOwn` (§6.1); the composite type's nodes and ports already take
their `aria`. Each type's page runs the axe rules the earlier types' pages run (DoD 8), in M3.2 to M3.5's done-when.

Exports (DoD 7): SVG, PNG and PDF of each type, as every type; the Mermaid writer for the requirement type only. Each
conformance note's fidelity table lists every writer's losses: SVG, PNG and PDF (a constraint expression cut to its box,
a header cut to the frame); the Mermaid writer (comments and their links, packages, blocks' and test cases' own
props, `BT` and `RL` read as `TB` and `LR`, removed quotes and line breaks carried only in comments).

## 14. Performance (P1, S18)

| Fixture | Budget, in Node, CPU time, best of seven after a warm-up |
|---|---|
| Each stress fixture's `all` view | A full layout plus SVG markup under 1 s |
| `requirement-stress.json`, `all` | Printed against 100 ms, held to 1 s: a requirement's text edited (its box grows); a satisfy added; a containment line deleted (the type's own ranking, §6.1, inside the time) |
| `block-definition-stress.json`, `all` | A value row added to a block; a block renamed |
| `internal-block-stress.json`, `all` | An item flow set (its label grows); a part added. The projection's own time printed beside it |
| `parametric-stress.json`, `all` | A binding added; a constraint property's type changed |
| `readMermaidRequirement` | About 900 KB of requirements and relationships, and the deepest chain under the limit, each under 1 s (§12.2) |

- Every layout passes `repair: false` and `reroute: false`.
- The projection copies the nodes, members and lines the view reaches, once per layout: linear; it is inside each edit's
  time, never outside it.
- Timed tests' titles end " (timed)", run serially in CI (the maintainer's decision of 13 Nov 2026); no test asserts 100
  ms; browser timings prove nothing (1.11).

## 15. Examples, fixtures and the e-bike atlas (S19)

### 15.1 Why the e-bike

The maintainer's rule of 13 Nov 2026: every milestone adds its views to the Bookshop atlas, or says why a type takes its
own domain. A Bookshop has software, people and stock; SysML's four diagrams describe a system with physical parts,
quantities and equations (power, energy, range), which a bookshop's reader would meet only as an invented machine. The
e-bike examples already exist, agree on their shared ids but one (Q2), and form a story of their own: requirements,
the blocks that satisfy them, their wiring, and the equation that checks the range requirement.

| Option | For | Against |
|---|---|---|
| **(a) An e-bike atlas, built by `tools/atlas.mjs` from the four files with a second links file, the build stopping on a disagreement (recommended)** | The maintainer's two rules kept in their own domain: one small file per type, and one model assembled from them, checked against them; the clash Q2 found is fixed and stays fixed | A second atlas file in `examples/` and a second test |
| (b) Four separate files | Nothing to build | Their agreement unchecked; Q2's clash would ship |
| (c) Bookshop SysML views (a warehouse conveyor) | One atlas | A stretch the maintainer already turned down for SysML |

### 15.2 The files

M3.0 fixes the targets so every lane builds on agreeing files: `17-block-definition.json`'s `range-equation` takes
19's expression (`range = energy / consumption`) and parameter (`range-equation.energy`), and EBike gains 18's three
part members (`ebike.battery`, `ebike.motor`, `ebike.controller`, with 18's types and its associations' multiplicities)
so its composite associations are drawings of them (§7.2); nothing else disagrees by merge (Q2). 19's view takes the id
`range-analysis` (it was `range`): `tools/atlas.mjs`'s `build()` stops on a node whose id is another file's view's, and
16's requirement is `range` (a departure found in the build, 14 Nov 2026; taken by the lead under the maintainer's
standing approval (14 Nov 2026)).
M3.7 moves them:

| Target | Moves to | View |
|---|---|---|
| `16-requirement.json` | `examples/ebike-requirements.json` | `requirements` |
| `17-block-definition.json` | `examples/ebike-blocks.json` | `blocks` |
| `18-internal-block.json` | `examples/ebike-structure.json` | `inside-ebike` |
| `19-parametric.json` | `examples/ebike-range.json` | `range-analysis` |

`tools/ebike-links.json`: sources in that order; root `ebike-requirements/requirements`; links:
`ebike-requirements/spec` opens `ebike-blocks/blocks` (the specification's structure), `ebike-requirements/range` opens
`ebike-range/range-analysis` (the analysis of the range requirement), `ebike-blocks/ebike` opens `ebike-structure/inside-ebike`.
`tools/atlas.mjs` takes `--links` and `--out` (default the Bookshop's), and `KEYS.props` gains `reqId`, `text`, `risk`,
`verifyMethod`, `constraint`, `unit`, `quantityKind`, `direction`, `itemFlow`. `tests/ebike-atlas.test.mjs` (new): the
committed `examples/ebike-atlas.json` is what the builder writes; every view is reached from the root by drill-down; each
view lays out as in its own file (the projection's filter by view kind, §8.1, is what makes the ibd and par views of the
merged `ebike` hold; as built in M3.1, it holds only once the files agree on `ebike`'s members, its parts'
multiplicities and `battery.charge`'s type, which M3.7 settles in the `examples/ebike-*.json` it writes: until then the
merged ibd draws 17's `wheels`, typed `Wheel`, which names no block (`part-type`, a warning), and the par view 17's
unbound `rangeEq`, §8.1); the whole atlas validates with no problem through the four types' rules; `describe()` and the PDF
of the whole atlas succeed.

### 15.3 Fixtures

From `risks.md` §6 (G1 for the requirement and block definition graphs, G2 for the structures) and the rules above.
Each in `tests/`, laid out in Node and in Chrome under three fonts and both themes, right and down, with no overlap, no
text overflow, no line through a node, every end on its outline within 1 px, every port on its border. These are the
drawing fixtures; the passing and failing fixture of every rule (DoD 5) lives inline in its type's
`tests/<type>.test.mjs`, one pair per rule, which M3.2 to M3.5's done-when require.

| Fixture | Holds |
|---|---|
| `requirement-minimal.json` | Two requirements, one containing the other, a block satisfying one |
| `requirement-stress.json`, `edge-cases` | Containment four deep; a requirement in a package in the frame; a derive cycle (warned); a copy with another text (error); a satisfy to a block (error); a duplicate `reqId` (warned); a requirement with a member (error); a generalization between requirements (error); a 600-character text, and one capped by `present.rows`; a verify from a block (warned); a «rationale» comment; each of Mermaid's five kinds; a 40-character name; a requirement with no text (warned); the frame with no subject and with a package subject |
| `requirement-stress.json`, `all` | 50 requirements, 60 relationships (P1) |
| `block-definition-minimal.json` | A block with a part typed by a second block, one composite association |
| `block-definition-stress.json`, `edge-cases` | Every compartment; a block with all of them and 40 rows; a value type with unit and quantity kind; an interface block with flow properties of each direction; a constraint block; proxy, full and conjugated ports; a part typed by a value type (warned); a constraint property typed by a block (error); a flow property in a constraint block (error); a constraint block owning constraint properties; a part member drawn also as a composite association (`part-agrees`); a generalization between a block and a value type (error); a package holding blocks |
| `block-definition-stress.json`, `all` | 50 blocks, 57 lines (P1) |
| `internal-block-minimal.json` | A block with two parts and one connector between their ports |
| `internal-block-stress.json`, `edge-cases` | Item flows each way; a reference part (dashed); a value property; proxy, full and conjugated ports with flow arrows; two connectors on one port; a connector to the frame's port (delegation, not warned); a part typed by no block (warned, ports from its connectors only); a connector through a part to a port its type lacks (error); a subject block with ports and no parts (still a frame, its ports on it) |
| `internal-block-stress.json`, `all` | 30 parts, 60 connectors (P1) |
| `parametric-minimal.json` | A constraint property with two parameters, each bound to a value property |
| `parametric-stress.json`, `edge-cases` | A constraint block subject with parameters on the frame, built from constraint properties of other constraint blocks (nested), no other member; two constraint properties of one type; a parameter bound twice; an unbound parameter (warned); a binding to a parameter the type lacks (error); a binding between two values; a 120-character expression (cut) |
| `parametric-stress.json`, `all` | 16 constraint properties, 48 parameters, 30 value properties, 60 bindings (P1) |
| `tests/notation.html` | Its end checks gain the crosshair; the classifier checks a compartment title in both themes, and `ariaOwn` |

## 16. Work packages

### 16.1 Before milestone 3 starts

- This note is approved; `model.md` and `risks.md` take §19's changes with M3.7.
- Stage 6's 6.3 (#240) has merged before M3.1 (`src/uml/class.js`, `src/typed/draw.js`).
- Fewer than five code lanes are open across the project when a lane starts (the maintainer's decision of 13 Nov 2026).

### 16.2 The packages

Each is one pull request. "Owns" lists the only files it changes while open. Built files (`lib/umlimator.js`,
`lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`, after merging
`main`, never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a package proposes its
row and writes its release notes in its pull request for M3.7 to gather.

| # | Work package | Owns | Depends on | Done when |
|---|---|---|---|---|
| M3.0 | **Files and targets** (the lead). `sysml/sysml`, `sysml/requirement`, `sysml/blocks`, `sysml/internal`, `sysml/parametric`, `readers/mermaid-requirement` as empty files, in `ALL` after milestone 2's and before milestone 4b's (the stages' order, as milestone 4a's note places its own after 4b's; a departure from "after the last family listed" found in the build, 14 Nov 2026), in that load order. The milestone's five browser pages, `tests/requirement.html`, `tests/blocks.html`, `tests/internal-block.html`, `tests/parametric.html` and `tests/sysml.html`, as placeholders that report ok, listed in `tests/embed.py`'s pages in one line, as stage 6's 6.0 did. `17-block-definition.json`'s `range-equation` agrees with 19, and EBike gains 18's three part members (§7.2, §15.2); 19's view takes the id `range-analysis` (§15.2); 17's and 19's entries of `tests/core-diet.json` re-recorded, stated in the pull request | `tools/build.mjs`, the six empty files, the five placeholder pages, `tests/embed.py` (its one pages line), `docs/diagrams/examples/17-block-definition.json` and `19-parametric.json` (its view's id only) (an exception to 6.6's, M2.14's and 4b.5's `docs/`: none edits 16 to 19), `tests/core-diet.json` (17's and 19's entries only) | This note | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; `check.mjs` passes; `tests/core-diet` passes with only 17's and 19's entries changed; `tests/embed.py` runs the five pages ok; the four targets merge by id with no disagreement (`tools/atlas.mjs`'s `merge` over them, run in a scratch folder and stated in the pull request; M3.7's atlas test keeps it); `build()` over them with §15.2's links and `KEYS` stops on nothing; no other M3 lane edits `ALL` or `tests/embed.py`; the merge with any open lane's `tests/embed.py` line rehearsed (X2) |
| M3.1 | **SysML's base.** `src/sysml/sysml.js`: the table (§3.2), `META_AS` filled, `asUml` with its filter by view kind and its measured texts, the mapping back, the dressing shared by ibd and par (frame, port kinds, `csProblems` re-said, §8.1), the frame shape and header (§5), the crosshair row (when M2.2 has exported `ENDS`). Edits: `metaOf` and the keywords (`src/uml/stereotypes.js`, §3.3); the export line and `generalization-kinds`' condition (`src/uml/class.js`, §7.3); the compartment title, `ariaOwn` and, if `ENDS` is not exported yet, the crosshair row (`src/typed/draw.js`); a frame with no element on drop and Delete (`src/canvas/edit.js`, §5.1, the core). As built: `ENDS` was exported, so the crosshair row (and its legend's) is `src/sysml/sysml.js`'s; `composite.js` is not edited and no view sets `boxSubject` (§5.1's as built: the dressing frames a subject holding no part at its card's bounds); `stereotypes.js` exports `UML_META_AS` and `STY_FREE`, which `sysml.js` fills; `class.js` exports `lineLook`, `lineLabel`, `legendOf`, `legendItem` and `LEGEND_ENDS`; Delete on a frame that is no element already emitted nothing (the canvas's `idsOf` keeps only a box that is an element), so `edit.js` maps the drop only | `src/sysml/sysml.js`, `src/uml/stereotypes.js` (those lines), `src/uml/class.js` (those lines), `src/typed/draw.js` (those lines), `src/canvas/edit.js` (that mapping), `tests/sysml.test.mjs` (new), `tests/notation.html` (adds the crosshair, a titled compartment, `ariaOwn` and the frame) | M3.0; 6.3 merged | Maps unchanged; `tests/core-diet.*`, `tests/class.test.mjs`, `tests/stereotypes.test.mjs`, `tests/profile.test.mjs`, `tests/composite.test.mjs`, `tests/composite.html` and every typed type's tests unchanged; every registered `sysml.*` type has a row (read from the registry); a profile extending `Class` fits a block, one extending `Property` a value property, and «rationale» in scope is not warned; `asUml` of each example, and of the merged four, keeps only the view kind's members and gives a model the composite type validates with the problems listed in the test; a subject with ports and no parts, and one with nothing, is a box; 17 with a class view added has no `generalization-kinds` problem; the frame shape drawn in both themes and three fonts, its tag cut to a narrow frame; a card dropped on a frame with no element is reparented to the view's subject or none, and Delete on that frame emits nothing; the core's growth measured and stated against the 500 B share |
| M3.2 | **The requirement type.** §6, §13 for it: definition, wrapped text, its own ranking with the containment pairs, derived containment lines, rules, `describe()`, names, legend, `rows`, `word`, `text`, hooks | `src/sysml/requirement.js`, `tests/requirement.test.mjs` (new), `tests/requirement.html` (replaces M3.0's placeholder) | M3.1; M2.1 merged (its `text` hook in `src/page/print.js`) | Definition of done 2, 4, 5, 6 and 8 on row 16; one passing and one failing fixture per rule of §6.3; the page passes the axe rules; every gesture by pointer and key through `apply()`; a 30-step session undone, redone and reopened byte-identical; an inline copy of `16-requirement.json` lays out clean, down and right, in its frame, each owner above what it contains; deleting a containment line re-homes the child; `copy-text` passes on the example |
| M3.3 | **The block definition type.** §7, §13 for it | `src/sysml/blocks.js`, `tests/blocks.test.mjs` (new), `tests/blocks.html` (replaces M3.0's placeholder) | M3.1; M2.1 merged | As M3.2 on row 17 and §7.3's rules; `17-block-definition.json` clean down and right, every compartment titled, no `part-agrees` or `part-unlisted` problem; member rows parse and print back (`print(parse(x))` stable) |
| M3.4 | **The internal block type.** §8, §13 for it: ports' arrows, item-flow triangles, rules, hooks, on M3.1's projection and dressing | `src/sysml/internal.js`, `tests/internal-block.test.mjs` (new), `tests/internal-block.html` (replaces M3.0's placeholder) | M3.1; M2.1 merged | As M3.2 on row 18 and §8.4's rules (delegation and assembly each); `18-internal-block.json` clean, its ports on their parts' borders and the frame's, item names and «proxy» measured by the layout; `tests/composite.test.mjs` and `tests/composite.html` unchanged; a connector added from the canvas is a `sysml.Connector` and carries no projected label; the projection's time printed |
| M3.5 | **The parametric type.** §9, §13 for it, on M3.1's projection and dressing | `src/sysml/parametric.js`, `tests/parametric.test.mjs` (new), `tests/parametric.html` (replaces M3.0's placeholder) | M3.1; M2.1 merged | As M3.2 on row 19 and §9's rules; `19-parametric.json` clean, every parameter on its constraint property's border; a constraint block subject's parameters on its frame; a binding drawn from the canvas carries `ends.to.part` |
| M3.6 | **The Mermaid reader and writer, and the CLI.** §12 | `src/readers/mermaid-requirement.js`, `tests/mermaid-requirement.test.mjs` (new), `tests/import/requirement.mmd` (new), `umlimator_import.py` (`MERMAID`, `TYPED`), `umlimator.py` (its docstring's list), `tests/import.py` (adds the case) | M3.0; `model.md` row 16 as §4 | `read(write(model))` equals the model on the subset for the example, 500 generated models and generated hostile names; the construct file's report pinned, the page's `copies` from an element among its skipped lines; each row of §12.2 and each untrusted comment by a test; `umlimator.py import` of the construct file writes a model that `check.mjs` passes; every earlier import test unchanged |
| M3.7 | **Fixtures, examples, the e-bike atlas, docs.** §15's files and tests (`tests/sysml-fixtures.test.mjs`, `tests/sysml.html`); the four examples moved, `check.mjs`'s `MOVED`; `tools/atlas.mjs`'s `--links`, `--out` and `KEYS`; `tools/ebike-links.json`; `examples/ebike-atlas.json`; `render`, `check`, `stills`, `pdf` and `import` on each; the schema and `.d.ts`; C10's tests (the MCP server's read tools, the diff Action's step, one model of each type); `tests/core-diet.json` re-recorded for 16 to 19; every document of `plan.md` §7; `docs/conformance/sysml-requirement.md`, `sysml-block-definition.md`, `sysml-internal-block.md`, `sysml-parametric.md`, each with its departures, its rules' clauses checked ("(confirm)" settled) and the fidelity table of every writer (SVG, PNG, PDF, Mermaid); `model.md`, `risks.md` (§19, with the core's quadratic ownership walk under P1); the lanes' release notes | `examples/ebike-*.json`, `examples/README.md` and `examples/index.html` (their e-bike rows), `tests/*-minimal.json` and `tests/*-stress.json` of the four types, `tests/sysml-fixtures.test.mjs`, `tests/sysml.html` (replaces M3.0's placeholder), `tests/ebike-atlas.test.mjs`, `tests/cli.py`, `tests/mcp.py`, `tests/core-diet.json`, `tools/atlas.mjs`, `tools/ebike-links.json`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | M3.1 to M3.6; 6.6, 6.7, M2.13 and M2.14 merged | Definition of done 1, 3, 7, 9, 10, 11 and 12 for the four types; §14's budgets in CI; the e-bike atlas builds with no clash, validates with no problem, and its test passes; `tests/atlas.test.mjs` (the Bookshop's) unchanged; the four files pass their types' `validate`; the stress fixtures' crossings pinned |

Existing tests a package edits: M3.0 `tests/embed.py` (its one pages line) and `tests/core-diet.json` (17's and 19's entries); M3.1
`tests/notation.html` (adds); M3.6 `tests/import.py` (adds); M3.7 `tests/cli.py`, `tests/mcp.py`, `tests/core-diet.json`
(re-recorded for the four targets, which `targets()` fingerprints), `check.mjs`'s `MOVED`. Each page lane replaces only
its own placeholder page. No other existing test changes.

### 16.3 What runs at the same time (S21)

```
approved ─▶ M3.0 ─┬─▶ M3.6 reader, writer, CLI ──────────────────────────┐
                  └─▶ M3.1 base (after 6.3) ─┬─▶ M3.2 requirement ────────┤
                         M2.1 merged ───────▶├─▶ M3.3 block definition ───┼─▶ M3.7 ─▶ 0.25.0
                                             ├─▶ M3.4 internal block ─────┤   (after 0.24.0)
                                             └─▶ M3.5 parametric ─────────┤
                     6.6, 6.7, M2.13, M2.14 merged ───────────────────────┘
```

- **The binding rule is §16.1's:** a lane starts only when fewer than five code lanes are open across the project. Every
  milestone 3 package counts as a lane, M3.0 (it edits `tools/build.mjs`) and M3.7 (it edits `tools/atlas.mjs`,
  `check.mjs`, the schema, the `.d.ts` and tests) among them. Milestone 3 alone could open five at once (M3.2 to M3.6);
  with #236, #240 and #241 open today and milestone 2's and 4b's lanes queued, the cap, not this graph, sets how many run.
- **M3.6 first.** It reads only `model.md`'s vocabulary and shares no file with stage 6 or milestone 2's type lanes; its
  CLI files (`umlimator.py`, `umlimator_import.py`, `tests/import.py`) are also M2.12's and 4b.4's: each adds its route
  and the second of two open branches rehearses the merge (X2).
- **M3.1 after 6.3.** Both edit `src/uml/class.js` and `src/typed/draw.js`; M2.2 and 4b.1 edit `draw.js`'s `ENDS` too.
  If M2.2 has merged, the crosshair row comes from `src/sysml/sysml.js` and M3.1 touches `ENDS` not at all.
- **M3.2 to M3.5 together** once M3.1 and M2.1 have merged: the projection and dressing both the ibd and par types use are
  M3.1's, so M3.5 no longer waits for M3.4. Each may write its definition, rules and `describe()` against this note
  before.
- **M3.7 last**, after stage 6's and milestone 2's document and atlas packages, which own the same files.
- One package touches the core: M3.1, tens of bytes in `src/canvas/edit.js` (§5.1), stated against the 500 B share.
- Milestone 3's lanes may merge to `main` before 0.24.0 ships, provisional until 0.25.0, as earlier stages' did; 0.25.0
  ships after 0.24.0.
- One reviewing agent that did not write the code checks each pull request against the definition of done; before the
  first of two open branches that share a file merges, their merge is rehearsed in a scratch worktree (X2).

| Option | For | Against |
|---|---|---|
| **(a) M3.6 as soon as a lane is free; M3.1 after 6.3; the four type lanes together after M3.1 and M2.1; M3.7 after milestone 2's documents; every package a lane under the five-lane cap (recommended)** | The reader, which depends on nothing, runs early; no type waits on another type; the cap holds | Milestone 3's types wait behind stage 6, M2.1 and milestone 2 for lanes |
| (b) As (a), but M3.5 after M3.4, the shared dressing in `internal.js` | M3.1 smaller | M3.5 waits a whole lane; `internal.js` grows an export line M3.5 depends on but does not own |
| (c) Milestone 3 after 0.24.0 is released | No overlap | Every lane idle until then |

### 16.4 Files shared with stage 6, milestones 2 and 4b, and C10

| File | Who else | Order |
|---|---|---|
| `tools/build.mjs` (`ALL`) | 6.0 (merged), C10 (#236, `uml/diff`), M2.0, 4b.0, M4a's | Each appends its list; the later merges `main` and keeps the stages' order |
| `src/uml/class.js` | 6.3 (#240) | 6.3 first; M3.1 after (its export line and one condition) |
| `src/typed/draw.js` | 6.3 (`ENDS`, `filled-triangle`), M2.2 (`ENDS` exported), 4b.1 (`circle`, dotted lines) | 6.3 first; M3.1's compartment title and `ariaOwn` in `classParts` and `classSvg`, its `ENDS` row only if M2.2 has not merged; the second of two open branches rehearses |
| `src/uml/stereotypes.js` | None after 6.2 | M3.1 |
| `src/uml/composite.js` | None open (stage 5 merged) | M3.1's one condition (§5.1), approved by the lead in its pull request; as built, not edited (§5.1) |
| `src/canvas/edit.js` | Any open lane editing the canvas (none listed in M2's or 4b's notes) | M3.1; the second of two open branches rehearses |
| `src/uml/structure.js`, `frame.js`, `owners.js` | Read only | |
| `umlimator.py`, `umlimator_import.py`, `tests/import.py` | M2.12, 4b.4, M4a's mindmap reader | Each adds its route; the second rehearses |
| `tests/embed.py` | 6.3, 6.5, 6.6, M2.2 to M2.7, M2.14, 4b.1 to 4b.5 | Milestone 3 edits it once, in M3.0 (one pages line, five placeholders); the type lanes and M3.7 replace their pages only. M3.0 merges `main` before it merges and rehearses against any open branch's line |
| `tests/notation.html` | 6.6, M2.14, 4b.5 | Each appends its own checks; by merge order: 6.6, then whichever of M3.1 and M2.14 lands first, then the other merges `main`; 4b.5 last (0.27.0) |
| `examples/` | 6.6 (`examples/` but the atlas's files), M2.13 and M2.14, 4b.5 (all of `examples/`) | M3.7 adds only `examples/ebike-*.json` and the e-bike rows of `examples/README.md` and `examples/index.html`; it merges after 6.6 and M2.14, and before 4b.5 (0.25.0 before 0.27.0), which merges `main` and keeps the e-bike rows |
| `tools/atlas.mjs` | 6.7 (`KEYS`), M2.13 (`KEYS`), 4b.5 (`KEYS`) | 6.7, then M2.13 append to `KEYS`; M3.7 adds `--links`, `--out` and its keys after them; 4b.5 after M3.7 |
| `docs/diagrams/examples/check.mjs` (`MOVED`), `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `tests/cli.py`, `tests/mcp.py`, `tests/core-diet.json`, `docs/module-api.md`, `docs/editing.md`, `README.md` | 6.6, M2.14, 4b.5, C10 (#236: `tests/cli.py`, `tests/mcp.py`, `docs/module-api.md`, `README.md`) | M3.0's 17 entry of `tests/core-diet.json` first (it opens before all of them); M3.7 after 6.6 and M2.14; 4b.5's order by release (0.27.0 after 0.25.0) |
| `docs/diagrams/examples/16` to `19-*.json` | 6.6, M2.14 and 4b.5 own `docs/` and edit none of them | M3.0 (17), M3.7 (moves them) |
| `docs/diagrams/model.md`, `risks.md` | 6.6, M2's and 4b's note changes | Whichever lands first; the second merges |

### 16.5 The release

0.25.0 after M3.0 to M3.7 and after 0.24.0, by the repository's rule: `package.json`, `## 0.25.0:` in
`docs/module-api.md`, merged when the maintainer approves that pull request by number. Its notes say:

- new: SysML v1.7's requirement, block definition, internal block and parametric diagrams, in frames; profiles reach
  SysML elements; the Mermaid requirement reader and writer, and `umlimator.py import` of a `requirementDiagram`; the
  e-bike atlas;
- changed: a generalization between two SysML elements is no longer the class type's error (S20);
- left out: §17.

C10: in M3.7, as 6.6 and M2.14 do. The `map-repo` skill's pin does not move: it writes none of the four types.

## 17. Left out, and departures

| Type | Left out |
|---|---|
| All | SysML v2 (D5); the other five SysML v1.7 diagrams (activity, sequence, state machine, use case and package are UML's types here); allocations («allocate», allocation compartments and tables); views and viewpoints; stakeholders; copy and paste (E7); XMI; of the element types Annex A allows in each kind's header, the subset accepts: req a package (a requirement as the frame's element is left out), bdd a package or none (`[Model]`), ibd a block, par a block or a constraint block; model libraries, activities and other header elements are left out |
| Requirement | Requirement tables and matrices; callout notation (a note listing satisfiedBy); derived compartments on the box (they are in `describe()` and the PDF); requirement generalization (SysML forbids it); the non-normative extensions beyond `risk` and `verifyMethod`: extendedRequirement's `source`, and the other requirement categories; a req frame whose element is a requirement (`req [Requirement] …`) |
| Block definition | Ports drawn on a block's border on a bdd (they are a compartment); the compartments `properties`, `namespace`, `structure` and `receptions`; directed features (provided and required, `prov` and `req`) on blocks and interface blocks; nested ports (a port on a port); stereotype icons; `«unit»` and `«quantityKind»` elements (units are text, rule 11); bound references; operation bodies; signal receptions; associations owning properties beyond their ends' role and multiplicity; association blocks |
| Internal block | Nested parts (a part's own parts drawn inside it); full ports drawn as parts on the border; nested connector ends (property paths); item properties; flow ports (deprecated since 1.3); connector properties; initial values compartments; binding connectors on an ibd (row 18's edges are `sysml.Connector` only; a binding is the parametric view's) |
| Parametric | Nested connector ends (`battery.capacity`, §9); solving or simulating the equations (`proposal.md` §8); parameters' names inside the constraint property; the optional «equal» keyword on a binding connector; expressions in a language other than text |
| Reader | Mermaid's styling (`style`, `classDef`, `class`, `:::`): skipped; Markdown in text: kept as written; `BT` and `RL` directions: approximated; `element` types other than those starting `test`: read as blocks, the type word kept under `ext.mermaid`; a relationship whose ends break §6.3's errors: skipped |

Departures, in the conformance notes:

- **A frame with no subject** names `[Model]`, which Annex A allows, and the model file's `title` as if it were a Model
  element's name, which it is not (§5.2).
- **A requirement's owner** is a requirement or a package: a restriction of the subset, not a SysML constraint (§6.3,
  `requirement-owner`, a warning).
- **Containment is drawn, not stored**: the crosshair line is derived from `parent` and is no model element (§6.2).
- **Parameters** are drawn as stage 5's ports, their names outside the constraint property, where SysML puts them inside.
- **A subject holding no part** (an ibd's block with only ports, a constraint block with only parameters) is framed at
  its card's size, which the composite type sizes for its ports: the header is cut to it (§5.1's as built).
- **A constraint property's expression** is cut to the box, which is sized by its name (the composite type's part size).
- **Items flow on the connector's middle**, one triangle per connector, whatever the number of items (one per connector
  in the subset).
- **Mermaid's `contains`** is read as `parent`: an element contained twice keeps the first container.

## 18. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | The core's budget | Plan tens of bytes within the 500 B share (the canvas's mapping of a frame with no element, decision 24); every spend stated in its pull request; over it asks | Hand the unplanned part back now | §2.3 |
| 2 | SysML as a profile | Types of their own (`sysml.Block`), one table naming each one's UML metaclass, implied stereotype and projected type, read by every consumer; no profile element stored | A built-in SysML profile as model data, elements stored as stereotyped `uml.*` types (examples, `model.md` and reader rewritten; a kind lost with its stereotype); both | §3.1 |
| 3 | SysML in the stereotype check | `metaOf` reads the table; SysML's names known as keywords | A virtual `SysML` profile; nothing (SysML elements unchecked) | §3.3 |
| 4 | Frames on req and bdd views | A box of the layout holding every node, drawn by a frame shape; a package subject's own box replaced by the frame | Drawn after the layout in `under` (no core byte, no selection); no frame | §5.1 |
| 5 | Frames on ibd and par views | The subject's box is the frame, its ports on it, for every subject (decision 25) | A frame round the subject's box | §5.1 |
| 6 | The header with no subject | `[Model]` and the model's title | The kind and view title only; a subject required (a warning, examples gain packages) | §5.2 |
| 7 | A requirement's text | Wrapped whole at 224 px; `present.rows` caps it per view | Six rows by default | §6.1 |
| 8 | Containment | `parent` in the model, a derived crosshair line between requirements, a box for a package | Nested boxes; a stored edge | §6.2 |
| 9 | The relationships' rules | SysML's constraints as errors (the derive and copy ends, the satisfy and verify supplier, `copy-text`, members, nesting, generalization, association, typing); what is usual, or where the subset is stricter than SysML, as warnings (a requirement's owner, the satisfy and verify client, `derive-cycle`, ids) | All warnings | §6.3 |
| 10 | How the bdd is built | Its own node builder on the classifier, the class type's line looks through its export line | A hook in `typeGeo` (6.3's lines) | §7.1 |
| 11 | Compartment names | `title: true` drawn by the classifier, a field no UML type sets | The name as the first row, built by the type | §7.1 |
| 12 | The class rule on SysML generalizations | Left to the end's own notation (one condition) | SysML kinds join `CLASSIFIERS` | §7.3 |
| 13 | How ibd and par reuse the composite structure | A projection to UML types on a copy, filtered by view kind, with the texts the layout measures set before it; `csGeo` reused, the result dressed; the shared part in `src/sysml/sysml.js`; `composite.js` edited by one condition only (decision 25) | `composite.js` parameterized (about 100 literals); a copy of it | §8.1 |
| 14 | Ports | `kind` proxy, full or none; flow direction derived from an interface block; `~` conjugates; flow ports left out | Flow ports too, with a stored direction | §8.2 |
| 15 | Item flows | The item as the line's label, a filled triangle on the middle segment | An arrow at the end | §8.3 |
| 16 | Nested connector ends | Left out | `ends.<end>.path` | §9 |
| 17 | The reader | A reader and a writer, `%% id:` and `%% text:` comments; elements as blocks unless `type: TestCase`; kinds as stereotypes; `risk` and `verifyMethod` as props | A reader only | §12.1, §12.3 |
| 18 | The CLI | `requirementDiagram` read typed by `umlimator.py import` (refused today) | Left to a later package | §12.4 |
| 19 | The examples' domain and atlas | The e-bike, joined into an e-bike atlas by `tools/atlas.mjs` with a second links file; 17's `range-equation` fixed to agree with 19 | Four separate files; Bookshop SysML views | §15.1 |
| 20 | The e-bike atlas's links | Root the requirements; `spec` opens the blocks, `range` the parametric view, `ebike` the internal block view | Root the blocks | §15.2 |
| 21 | P1 | Both flags off; 1 s in CI, 100 ms printed, " (timed)", serial; the projection timed inside each edit | | §14 |
| 22 | Order and lanes | M3.6 first; M3.1 after 6.3; the four type lanes together after M3.1 and M2.1; M3.7 after milestone 2's documents; every package a lane under the five-lane cap; 0.25.0 after 0.24.0 | M3.5 after M3.4; after 0.24.0 | §16.3 |
| 23 | C10 | Tested in M3.7; the skill's pin does not move | Left to a later package | §16.5 |
| 24 | A drop into, or Delete on, a frame that is no element (a req or bdd view with no subject) | The canvas maps a box whose id names no element to the view's subject (or none) on drop, and skips it on Delete: tens of core bytes in `src/canvas/edit.js`, against the 500 B share | The frame drawn in `under` when the view has no subject (no core byte, no selection or F2 on that frame, two ways to draw a frame) | §5.1 |
| 25 | A subject with no parts on an ibd or par view | One condition in `csGeo`'s `boxed`, read from `boxSubject`, a view field only the projection sets (as built: the frame at the subject card's bounds, in the dressing, §5.1, a departure taken by the lead under the maintainer's standing approval, 14 Nov 2026) | The frame drawn in `under` from the subject node's bounds (`composite.js` untouched; two ways to draw a frame) | §5.1 |
| 26 | A part stored as a member and as a composite association end | The member is the part; an end of its role is the same part drawn as a line, and must agree (`part-agrees`, `part-unlisted`); M3.0 adds 18's three members to 17 | An end is itself a part (made by the projection, no id for connectors); one form only (17's lines or 18's members dropped) | §7.2 |
| 27 | A Mermaid relationship whose ends break §6.3's errors | Skipped and reported, so every import passes `check.mjs` | Kept, and the model fails validation | §12.1 |

## 19. What this note changes elsewhere

- **`model.md`.** Rows 16 to 19 as §4: `risk`, `verifyMethod`; a port's `kind` and `~`; `uml.Package` and a package
  `subject` on rows 16 and 17; value properties on an ibd; a constraint block subject on row 19, showing its constraint
  properties and parameters; a part is a member, and a composite association end of its role is that part (§7.2). A pointer here. (M3.7.)
- **`risks.md`.** C5 records milestone 3's share and its spend (the canvas's frame mapping); P1 gains §14's common edits
  and the core's O(n·depth) ownership walk (`src/core/model.js`, 2.2 s CPU on a 10,000-deep chain, left as it is because
  fixing it costs core bytes); R2 gains §12.2's hostile
  cases; G1 and G2 point to §15.3; C10 records M3.7's tests; a new row for the class rule on other notations'
  generalizations (Q3, closed by M3.1); a new row for the e-bike files' agreement (Q2, closed by M3.0 and kept by the
  e-bike atlas). (M3.7.)
- **`plan.md`.** §5's milestone 3 row points here (done with this note); §4.3 lists `src/sysml/`. §7's examples row
  names the e-bike atlas beside the Bookshop's (M3.7).
- **`proposal.md`.** §8.5's SysML subsets point to §17.
- **`notes/stage-6.md`.** §5.4's "until milestone 3 maps it" points here (§3.3). (The lead's.)
- **`README.md` in this folder.** The status table shows this note and, once approved, its work packages; the log
  records the decisions taken. (The lead's.)
