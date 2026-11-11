# Umlimator beyond architecture maps: a proposal for 28 diagram types

Status: for decision. Analysis only; no code was changed. Written 11 Nov 2026 against `main` at 449ca99 (v0.15.0).

All twelve decisions of §9 were taken on 11 Nov 2026. The plan that follows from them is [`plan.md`](plan.md); where the
work stands is [`README.md`](README.md). This document keeps the analysis and the reasons.

`main` has since moved to 14e5844 (three merged pull requests towards 0.16.0). Every fact below was checked again
there and holds; file line numbers are those of 449ca99. What the re-check and a closer look at edge cases changed is
in [`risks.md`](risks.md) §1.

How claims are marked:

- **Verified**: checked in this repository (file and line given), by running it, or in a cited source.
- **Assumption**: not checked; the proposal depends on it.
- **Open question**: needs your answer or a spike.
- **Recommendation**: my judgement.

Terms: "the 14" are UML 2.5.1's diagram types; the other 14 are the remaining types in StarUML's catalogue, without
wireframes, which were removed from scope (D2). Together they are 28 diagram types from five notation families (UML,
SysML, ER, BPMN, C4) plus general diagramming and cloud architecture. They are not "28 UML diagram types".

## 1. Recommendation and main trade-offs

**The starting point is further back than "box, C4 and UML shapes" suggests.** Umlimator today is an
architecture-map engine: fixed-size cards, lines with five meanings, boxes and drill-down views, laid out
automatically. Its "UML" is five card outlines and one icon, drawn inside the same card box (§2.2). Of the 28 target
types, one (C4's static diagrams) is generated and viewed with its meaning intact, nine can be approximated with map
primitives, three have a symbol and nothing more, and fifteen have nothing (§3).

**Recommendation**

1. **Build families, not 28 diagram types.** The 28 fall into six families over four layout strategies, one of
   which exists (§4.3). A diagram type should be a definition (element types, line notations, rules, readers) over a
   family's engine, not its own code path.
2. **Keep what makes Umlimator different.** One JSON model, deterministic automatic layout, a host that owns the
   data, no dependencies in the core, the same result in Node and the browser. Aim at "diagrams as data that stay
   editable", not at a free-form canvas like StarUML or draw.io. That choice decides most of the architecture (§9, D1).
3. **Extend the current engine; reuse libraries only at the edges** (§6): readers and writers for other formats, and
   optional layout for the port-heavy family.
4. **Name three support levels and claim only what is tested.** L1 Render, L2 Edit, L3 Interchange (§3.1). The
   "usable support" you defined is L2. No type is at L2 today.
5. **One vocabulary.** Keep `nodes`, `edges` and `views`; add a `type`, typed `props`, owned children, semantic
   `parent` and a schema version. Every model file that exists keeps drawing the same picture (§4.4).
6. **First milestone (decided, D4): the 14 UML types at L2, in six stages** (§8). Stage 1 is what I had recommended
   as the whole milestone: the foundation plus the class diagram, with a short, throw-away sequence-layout spike before the
   registry's API is frozen, so the abstractions are tested on two unlike families.
7. **Then the additional types**, cheapest first: ER, flowchart, data flow and C4; SysML; cloud, mindmap and BPMN
   (§7). Wireframes were removed from the list (D2).

**Main trade-offs**

| Choice | What you gain | What you give up |
|---|---|---|
| Automatic layout first, with pins (recommended) over a manual canvas | Generated diagrams are readable with no hand work; regeneration is safe; deterministic tests | Pixel-exact hand arrangement; users coming from StarUML will miss it |
| Extending the engine over adopting an editor framework | The module stays dependency-free and headless; the tests and the bench hashes keep their value | Every interaction (ports, resize, lanes) is yours to build |
| Typed families over a generic boxes-and-arrows model | Sequence, timing and BPMN keep their meaning | Four layout strategies to maintain instead of one |
| Depth (L2 for few types) over breadth (shapes for all 28) | Each shipped type can be edited, saved and validated | A shorter list of types at each release |
| A reference store shipped with the library, while the host still decides | Hosts stop re-implementing 28 types' edit rules | The library holds more logic than "the canvas proposes" does today |

**Size.** Agents build this, so the plan carries no time estimates. Relative sizes (§3.1) say where the work is: the
foundation, sequence, state machines, ports and BPMN are the large pieces.

## 2. Current state

### 2.1 What the repository contains

Everything in this table is **verified** in the files named.

| Concern | What exists | Where |
|---|---|---|
| Purpose | "Embeddable, layered architecture maps": one ES module plus a Python CLI | `package.json:4`, `README.md:5-6` |
| Semantic model | Flat `nodes` (cards) and `edges` (lines) shared by `views`; a view lists `nodeIds`, optional `edges`, `containers` (boxes), `layout` (`[col,row]` per card), `nodeOverrides`. Open-ended (`[key: string]: unknown`) | `lib/umlimator.d.ts:4-97`, `engine/references/schema.md:77-128` |
| Card meaning | `kind` is a colour family (frontend, backend, database, …) with aliases; no typed properties | `lib/umlimator.js:378-400` |
| Line meaning | `kind` is one of five: calls, feeds, triggers, state, guard; `style`, `weight`, `step`, `latency`, `cost` | `lib/umlimator.d.ts:44-81` |
| Serialization | Plain JSON; a JSON Schema (1,375 lines) with no version field; no migrations | `lib/umlimator.schema.json`; "no schema version bump": `docs/module-api.md:44-46` |
| Generation | (a) hand- or agent-written JSON, with the `map-repo` skill's read, write, render, check loop; (b) `import` of Structurizr DSL, C4-PlantUML, Mermaid flowchart and C4, compose and Kubernetes JSON; (c) derived models: `sequenceFromTrace`, `diff`, `drift` | `plugins/umlimator/skills/map-repo/SKILL.md`, `umlimator_import.py:1-17`, `lib/umlimator.js:4253`, `:2760`, `:2839` |
| Parsing | Line- and regex-based readers in Python (standard library), not usable in the browser or from the module | `umlimator_import.py` (757 lines) |
| Rendering | SVG in a shadow root, built as strings; CSS-variable palette; one arrowhead shape, varied by colour and weight | `lib/umlimator.js:1438` (`svgOf`), `:1456` |
| Shapes | 13 outlines; three notations (`box`, `c4`, `uml`) choose an outline by kind; "layout never sees it" | `lib/umlimator.js:429-608`, `docs/module-api.md:2437-2441` |
| Layout | Layered columns in left-to-right reading order, barycentre crossing reduction, hub and box-block variants, row pitch constant per view | `lib/umlimator.js:661-836`, `:1979`, `:878`, `:2287` |
| Routing | One orthogonal route per line on a grid (A*), ports ordered by angle, rip-up and reroute, port repair, label placement | `lib/umlimator.js:990-1436` |
| Editing | Opt-in gestures emit `change` events (add card, add line, rename, move to box, delete, reorder); nothing is applied by the library | `lib/umlimator.js:2888`, `:3318-3503`, `docs/editing.md:8-15`, `:53-60` |
| Property controls | None for editing: `Change` has no operation that sets a property. The details panel shows a card's text and actions | `lib/umlimator.d.ts:158-164`, `:195-199` |
| Persistence | None: the host owns the model. The standalone page keeps reader preferences (theme, flow, notation) in `localStorage` | `docs/module-api.md:95-103`, `lib/umlimator.js:4121`, `:4635-4672` |
| Undo and redo | `history(model, limit)`: whole-model snapshots, pushed by the host | `lib/umlimator.js:4126-4136` |
| Validation | `validate()` (ids, references, unknown kinds), `rules()` (forbidden lines, cycles between boxes), `check()` (layout quality) | `lib/umlimator.js:2546`, `:2694`, `:2535` |
| Export | SVG and PNG in the browser; stills, PDF and animated PNG through headless Chrome | `lib/umlimator.d.ts:203-223`, `umlimator.py` |
| Tests | 102 Node tests (all pass on 14e5844); headless-Chrome suites for events, editing, shapes, state, accessibility; import samples; CLI outcomes | `tests/` (42 tracked files), `.github/workflows/check.yml:31-50` |
| Fixtures | 8 example models, 9 bench models with recorded geometry hashes | `examples/*.json`, `bench/models/`, `bench/expected.json` |
| Accessibility | Tab order over cards then lines, arrow keys, announcements; axe's rules written out as tests; contrast test | `tests/pieces.html:25-48`, `tests/contrast.html`, `docs/module-api.md:202-225` |
| Extension points | Overlays, lenses, rules, stories, `nodeOverrides`, the docs-site plugins, the MCP server. No registry for shapes, layouts or diagram types | `lib/umlimator.d.ts:258-290`, `lib/umlimator.js:474` (`SHAPE` is a closed table) |
| Size | One 5,188-line file, 506 KB raw, 164 KB gzipped; it also holds the standalone page | `lib/umlimator.js` (measured) |

**Performance, measured here** (Node, one cold run each, on 14e5844): `layout()` took 1.4 s for the 50-card,
100-line bench model, 1.9 s for the 69-card overview, 0.9 s for the 26-card one and 1.8 s for 19 cards with 30 lines.
A first run, on 449ca99, showed 4.0 s for the 50-card model while other jobs ran on the machine; that figure is not
kept. Layout is synchronous. CI allows 8 s for the 50-card model in headless Chrome
(`.github/workflows/check.yml:91`). The crossing search and the unfold search stop at 30 cards
(`lib/umlimator.js:864`, `:2498`).

### 2.2 The five distinctions you asked for

| Level | What is true today |
|---|---|
| Available shapes | 13 card outlines: box, person, browser, mobile, cylinder, pipe, document, hexagon, robot, terminal, window, folder, node (`lib/umlimator.js:559`) |
| Renderable notation | The map notation in three skins. `c4` draws people, browsers, phones, databases, queues and files as C4 tools do. `uml` draws an actor, a node, an artifact, a package tab and a data store, and puts the component icon on a box (`docs/module-api.md:2481-2493`). Lines look the same in every notation |
| Editable diagram support | The map notation only: six operations, on cards, lines, boxes, chips and badges. No property editing beyond a name, no resize, no line reconnection, no creating boxes or views (`docs/editing.md:101-104`) |
| Semantic modelling and validation | For architecture maps: kinds, owners, rules that forbid lines, cycles between boxes. Nothing UML-specific. C4 levels exist as views that open each other, not as typed elements |
| Verified standards coverage | None claimed and none tested. The docs cite UML 2.5 clause numbers for five shapes; that is notation borrowed for cards, not conformance |

### 2.3 Constraints that shape the roadmap

All **verified**.

1. **Cards have fixed heights and a constant row pitch.** 42, 64 or 80 px; `pitch = NH + RG` per view
   (`lib/umlimator.js:878`, `:2287`). A class box sized by its members does not fit this grid.
2. **A shape is paint.** It is drawn inside the card's box and "layout never sees it" (`lib/umlimator.js:564-565`).
   Ellipses, diamonds, lifelines and compartments need shapes that tell the layout their size and ports.
3. **One line per pair of cards.** A→B and B→A merge, and parallel lines merge into one with "+n", unless the view
   sets `keepPairs` (`lib/umlimator.js:2258-2263`, `engine/references/schema.md:127`). UML needs an association and
   a dependency between the same two classes kept apart.
4. **One arrowhead, no end labels.** There is no vocabulary for hollow triangles, diamonds, crow's feet, role names
   or multiplicities (`lib/umlimator.js:1456`).
5. **Every view reads left to right** (`lib/umlimator.js:1979`). Inheritance trees and flowcharts are usually drawn
   top to bottom; ER diagrams have no direction.
6. **Positions are grid slots, and "positions are not meaning"** (`docs/editing.md:13`). There is no free placement
   and no resize.
7. **Boxes are per view and visual.** A `container` lives in one view (`lib/umlimator.d.ts:93`). UML ownership
   (a package owns a class) is a fact about the model.
8. **Lines without an id are named by position** (`"<from>-><to>#<n>"`, `lib/umlimator.d.ts:99`). Deleting one
   renumbers its siblings, which is unsafe once lines carry properties.
9. **The host applies every edit by hand.** The demo host is a 15-branch `if` chain (`examples/edit.html:36-50`).
   That scales to six operations on one notation, not to 28 notations.
10. **Two languages.** Readers are Python; the model, layout and validation are JavaScript. A new reader written in
    Python cannot run in the playground, a host page or `validate()`.
11. **One file.** `lib/umlimator.js` is inlined into the standalone page by the CLI. Splitting it needs a
    concatenation step for that page (hosts need none: ES modules import each other).
12. **A name trap.** `render: "sequence"` means "number the lines in run order" (`engine/references/schema.md:107`),
    not a UML sequence diagram.

### 2.4 What can be reused as it is

- **One model, many views**, with per-view presentation (`layout`, `nodeOverrides`): the separation of meaning from
  presentation that a modelling tool needs is already there for cards.
- **The orthogonal router**, with ports, label placement and boxes: the hardest part of any node-link notation.
- **"The canvas proposes, the host decides"** (`docs/editing.md:8`): `change` events are commands by another name.
- **`diff()`, `validate()`, `rules()`, `check()`, `describe()`**: the plumbing for regeneration, semantic
  validation, quality gates and accessible text.
- **The notation switch** (#138): one geometry, several skins. ER's crow's-foot and IDEF1X notations fit it.
- **Unfolding in place and drill-down** (#71): composite states, sub-processes, DFD levels and C4 zoom.
- **Run order in `view.edges`** and `sequenceFromTrace()`: the data of a sequence or communication diagram.
- **"Nothing is dropped silently"** in import (`docs/module-api.md:1268`): the rule you asked for, already kept.
- **Determinism checks**: geometry hashes in CI catch any regression in existing pictures.

## 3. Capability matrix

### 3.1 Scales

Support today:

| Mark | Meaning |
|---|---|
| none | Nothing specific to the type |
| shapes | Some of its symbols exist as card outlines |
| approx. | Something that reads like it can be drawn with map primitives; its meaning is not modelled |
| L1 part | Part of the type is generated and viewed with its meaning |

Target levels:

| Level | Definition | Test that proves it |
|---|---|---|
| L1 Render | A typed model validates, lays out and exports; unsupported constructs are reported | Fixture renders, validation and layout checks clean |
| L2 Edit | Elements, relationships, labels and type-specific properties can be created and changed; save and reopen loses nothing; export limits are documented | Interaction tests; JSON round trip is byte-stable; export fidelity table |
| L3 Interchange | Reads and writes the notation's own interchange format for a stated subset | Round trip against third-party files; a conformance statement naming the subset |

"Minimal usable support" is L2 on a stated subset of the notation. "Advanced modelling and standards compliance" is
L3 plus a shared semantic repository across diagram types (§4.7). No row below proposes L3 before L2 is proven.

Families (§4.3): **G1** classifier graphs, **G2** structure graphs (ports and nesting), **G3** plain typed graphs,
**F** flow graphs, **T** time-axis and **R** tree.

Size, relative, at L2 after the foundation: **S** rides on machinery that exists by then; **M** needs one new
capability; **L** needs several, or a new layout strategy; **XL** is a notation as large as a UML family.

### 3.2 Today: support, evidence and what is missing

The "missing" column follows what StarUML's page for each diagram documents
([docs.staruml.io](https://docs.staruml.io), read 10 and 11 Nov 2026), trimmed to what a minimal subset needs.
**Verified** there: the docs list 29 types (these 28, and wireframes, since removed from scope), grouped as 15 under UML (information flow among them),
4 under SysML and 10 additional.

| # | Type | Fam. | Today | Evidence in the repository | Missing elements, relationships and properties |
|---|---|---|---|---|---|
| 1 | Class | G1 | none | No compartments (§2.3 items 1 to 4) | Class, interface, enumeration, data type; attributes and operations with visibility, type, multiplicity, static, abstract; association ends (role, multiplicity, navigability, aggregation); generalization, realization, dependency; stereotypes, notes, constraints |
| 2 | Object | G1 | none | As class | Instance specifications (underlined `name : Type`), slots, links |
| 3 | Package | G1 | shapes | `folder` outline for kinds `module` and `package` (`lib/umlimator.js:442`, `:536`); boxes nest but are per view | Package as an owner with a tab, nesting as ownership, import, merge and access dependencies, qualified names |
| 4 | Composite structure | G2 | none | No ports, parts or connectors | Structured classifier frame, parts, ports, connectors, collaborations and their uses |
| 5 | Component | G2 | shapes | Component icon as a box's mark in `uml` (`lib/umlimator.js:427`) | Ports, provided and required interfaces, assembly and delegation connectors, nested components |
| 6 | Deployment | G2 | approx. | `node` and `document` outlines (`lib/umlimator.js:551`, `:524`); compose and Kubernetes import (`umlimator_import.py:660`, `:695`) | Nested nodes (device, execution environment), artifacts inside nodes, deployment and manifestation, deployment specifications, communication paths |
| 7 | Profile | G1 | none | None | Profile, stereotype, metaclass, extension, tag definitions, profile application |
| 8 | Use case | G3 | shapes | `person` outline as the actor (`docs/module-api.md:2485`); a box as the subject | Use case ellipse, extension points, include, extend, generalization, subject boundary |
| 9 | Activity | F | approx. | Numbered `process` views with phase lanes (`engine/references/schema.md:114`, `:123`): linear steps | Initial and final nodes, decision and merge, fork and join, actions, object nodes and pins, guards, partitions, signals, regions |
| 10 | State machine | F | none | `examples/states.json` documents machines as numbered card views | States with entry, do and exit; composite states and regions; pseudostates; transitions `trigger [guard] / effect` |
| 11 | Sequence | T | none | `render: "sequence"` is a numbered node-link view (§2.3 item 12); `sequenceFromTrace()` builds one from a trace | Lifelines, message sorts (call, async, reply, create, delete, found, lost), execution specifications, combined fragments, interaction use, gates, invariants, time constraints |
| 12 | Communication | G3 | approx. | Numbered lines in run order; `step` "2", "2.1", "2a" (`lib/umlimator.d.ts:58-64`). The nearest of the 14 to what exists | Lifeline notation, message arrows beside a link, sequence expressions with nesting, guards and iteration, several messages per link |
| 13 | Interaction overview | F | none | None | Activity control nodes around interaction frames; needs rows 9 and 11 |
| 14 | Timing | T | none | None | Lifelines as rows, state timelines, value lifelines, a time ruler, duration and time constraints |
| 15 | Information flow | G3 | approx. | A `feeds` line reads as a flow (`lib/umlimator.d.ts:44-47`); nothing says what is conveyed | Information flow with conveyed classifiers, information items, realizing relationships |
| 16 | Requirement | G1 | none | None | Requirement (id, text), containment, deriveReqt, satisfy, verify, refine, trace, copy, test case |
| 17 | Block definition | G1 | none | None | Block compartments (parts, references, values, constraints, operations, ports), value types and units, composition and reference associations |
| 18 | Internal block | G2 | none | None | Parts, reference parts, ports, connectors, item flows |
| 19 | Parametric | G2 | none | None | Constraint blocks and properties, parameters, binding connectors |
| 20 | Entity-relationship | G1 | none | A `database` card is a cylinder; no rows, no cardinality | Entities with columns (type, key, nullable), cardinality and optionality per end, identifying relationships, weak entities, a notation choice |
| 21 | Flowchart | F | approx. | Mermaid `flowchart` import (`umlimator_import.py:608`); no diamond among the 13 shapes | Terminator, process, decision with labelled exits, input and output, connector; a top-to-bottom direction |
| 22 | Data flow | G3 | approx. | Cards, `feeds` lines and a cylinder; drill-down fits DFD levels | Process, data store and external entity symbols, named flows, levels and balancing, a notation choice |
| 23 | C4 | G3 | L1 part | Static views imported from three formats with drill-down, tested (`docs/module-api.md:1195-1280`, `tests/import.py`, `examples/clinic.dsl`); `c4` skin (`lib/umlimator.js:440`) | Element type and technology as typed fields, dynamic and deployment views (left out: `docs/module-api.md:1271-1275`), per-view scope rules, export back to a DSL |
| 24 | BPMN | F | none | None | Events (by position, trigger and behaviour), tasks and sub-processes, gateways, sequence and message flows, pools and lanes, data objects, artifacts; BPMN XML with diagram interchange |
| 25 | Mindmap | R | none | None | Root topic, branches on both sides, collapse |
| 26 | AWS | G3 | approx. | Cards with logos fetched and hash-pinned (`icons/manifest.json`: 82 entries, no AWS service icons); boxes with `tone` as zones | Service and resource icons, group shapes (region, VPC, availability zone, subnet, account) |
| 27 | GCP | G3 | approx. | As AWS | Product icons, project, region, zone and network groups |
| 28 | Azure | G3 | approx. | As AWS; the manifest has `azure` and `azuredevops` logos only | Service icons, subscription, resource group, virtual network and subnet groups |

### 3.3 To reach L2: what each type needs

| # | Type | Rendering and layout | Editing | Minimal validation | Reuses | Size | Main risk |
|---|---|---|---|---|---|---|---|
| 1 | Class | Content-sized compartment nodes; six line notations; end labels; parents above children | Member rows edited in place (`+ name: Type [0..1]`); relationship picker; end properties | Unique member names; multiplicity syntax and bounds; no generalization cycles; realization targets an interface | Layout, router, boxes, validation plumbing | L | Variable row heights in a constant-pitch grid; crowded end labels |
| 2 | Object | Class machinery, underlined names, slots | Slot rows | An instance's classifier and slots exist when linked | Row 1 | S | None notable |
| 3 | Package | Packages as typed compound nodes with a tab | Drag to re-parent | No ownership cycles; unique names per namespace | Nested boxes | S to M | Model ownership and per-view boxes drifting apart |
| 4 | Composite structure | Frame, nested parts, ports on the border, connectors | Add and slide ports; type parts | Connector ends lie in one structure and are compatible | Row 5, boxes | M to L | Routing to border ports |
| 5 | Component | Ports, lollipop and socket, nesting | Add port or interface; wire | Assembly joins provided to required; delegation direction | Boxes, router | M | First user of ports: the port model must be right |
| 6 | Deployment | Nodes as compound shapes, artifacts inside | Nest and re-parent | Artifacts deploy to nodes; paths join nodes | Boxes, `node` and `document` outlines | M | None notable |
| 7 | Profile | Class machinery, extension arrow | Stereotype and tag definitions | A stereotype extends a metaclass; applied stereotypes exist and fit | Row 1 | S to M | Value appears only once other types apply stereotypes |
| 8 | Use case | Ellipse sized to its text, actor, boundary | Standard | Include and extend join use cases only; no generalization cycles | `person`, boxes | S | Label fit in an ellipse |
| 9 | Activity | Small control nodes, bars, partitions, guards; either direction | Assign lanes by drag; edit guards; insert a decision on a flow | One initial node; guarded decision exits; unreachable nodes | Lanes, router | L | Lanes combined with nested regions |
| 10 | State machine | Compound states with regions, pseudostate glyphs, self-loops | Nest states; edit `trigger [guard] / effect` | One initial per region; nothing leaves a final state; history only in a composite | Boxes, unfold in place | L to XL | Orthogonal regions; transitions that cross borders |
| 11 | Sequence | Lifeline columns by message rows; activations; fragment frames; no router | Drag a message to reorder; draw between lifelines; wrap a run in a fragment | A reply matches a call; operands are contiguous and nested; create and delete once per lifeline | Run order in `view.edges`, `sequenceFromTrace`, step marks | L to XL | A new layout and a new interaction model |
| 12 | Communication | Graph layout; arrows and numbers beside links | Reorder messages; numbers derived | Numbering agrees with order and nesting | Numbered views; row 11's data | S to M | Several labels on one link |
| 13 | Interaction overview | Activity layout with inline frames | Link a frame to an interaction | References resolve; activity rules | Rows 9 and 11, drill-down | M | Low demand |
| 14 | Timing | Rows by a time axis; stepped state lines | Drag change points; set the scale | States declared; times increase | Little | L | Least reuse and least demand |
| 15 | Information flow | Dashed «flow» line with conveyed items | Pick conveyed items | Conveyed classifiers exist | Lines | S | None notable |
| 16 | Requirement | Classifier node with id and text; containment crosshair | Wrapped text | Unique ids; no derive cycles | Rows 1 and 7 | S to M | SysML version scope |
| 17 | Block definition | Class machinery with more compartments | Compartment rows | Part types are blocks | Row 1 | M | Compartment variety |
| 18 | Internal block | As composite structure, plus item flows | As composite | Connector ends are compatible | Row 4 | M | None notable |
| 19 | Parametric | Internal block plus constraint properties and parameter squares | Wire bindings | A binding joins a parameter to a value or parameter | Row 18 | M | Users expect equations to be solved; out of scope |
| 20 | Entity-relationship | Entity with column rows; end notation chosen per view | Column rows, key flags, cardinality | A primary key exists; a foreign key refers to one; identifying implies the key is included | Row 1; the notation switch | M | Chen's notation changes geometry (relationships are nodes) |
| 21 | Flowchart | Diamond, terminator and input/output outlines; top-to-bottom option | Standard | One start; decisions have two or more labelled exits | Mermaid reader, router | S to M | Direction touches the whole layered layout |
| 22 | Data flow | Process, store and entity outlines; levels by drill-down | Standard; create a level | Levels balance (error); a process has input and output, and each flow touches a process (warnings; §3.4) | Drill-down, unfold, `rules()` | S to M | Two notations |
| 23 | C4 | Typed elements; dynamic and deployment views | Type and technology fields; a view from an element | Each view shows what its level allows; a key | Almost all | M | Deployment needs compound nodes (row 6) |
| 24 | BPMN | Some 50 glyph variants; pools and lanes; boundary events; two flow kinds | Attach boundary events; assign lanes; unfold a sub-process | Sequence flow stays in a pool; message flow crosses pools; start, end and gateway rules | Lanes, unfold, router | XL | Scope creep; interchange expectations |
| 25 | Mindmap | Two-sided tree layout, curved branches | Tab and Enter to add; drag to re-parent | One root; a tree | Reorder and re-parent commands | M | A different keyboard model |
| 26 to 28 | AWS, GCP, Azure | Icon packs, group shapes; left to right fits | Icon search; nest groups | Group nesting rules; icon ids exist in the pack's version | Icon manifest, fetch and hash, toned boxes | M for the first, S for each further | Redistribution terms; packs change several times a year |

### 3.4 What may be claimed, by notation

**Verified** in the sources linked; the last column is my **recommendation**.

| Notation | Source | What the source says | What this proposal would claim |
|---|---|---|---|
| UML | [UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/PDF), formal/2017-12-05. [No later version exists](https://www.omg.org/spec/UML) | Annex A names 14 diagram types. Clause 2 has five conformance types: abstract syntax, concrete syntax, model interchange, diagram interchange, semantic. The old compliance levels were removed; a partial implementer declares its subset | L2 is a declared subset of abstract and concrete syntax, per diagram type. No model or diagram interchange (XMI, UML DI) before L3 |
| Information flow | UML 2.5.1, clause 20 | A UML concept drawn as a dashed «flow» line. It is not among Annex A's types | A line type for structural diagrams, and a view type for parity with StarUML |
| SysML | [v1.7](https://www.omg.org/spec/SysML/1.7/PDF), formal/24-01-07; [v2.0](https://www.omg.org/spec/SysML/2.0) | v1 is a UML profile with nine diagram kinds: block definition derives from class, internal block from composite structure, parametric specializes internal block, requirement is new. v2 is a metamodel on KerML with text and views; the four v1 diagram names do not occur in it | SysML v1.7 notation for the four diagrams. Nothing of v2 |
| BPMN | [BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF), formal/2013-12-09. [ISO/IEC 19510:2013](https://www.iso.org/standard/62652.html) is identical to 2.0.1 | Process Modeling conformance has three sub-classes: Descriptive, Analytic, Common Executable. Claiming one requires every element and attribute it lists; anything less may only say it is based on the standard | Aim at the Descriptive sub-class's list (24 rows). Say "based on BPMN 2.0" until every row is covered and tested |
| C4 | [c4model.com](https://c4model.com/diagrams) | Four core diagrams and three supporting ones. Notation-independent; asks for a title, a key, and a name, type, description and technology on elements ([checklist](https://c4model.com/diagrams/checklist)) | All seven diagrams, with the checklist as validation |
| ER | No general standard. IDEF1X: [FIPS 184](https://nvlpubs.nist.gov/nistpubs/Legacy/FIPS/fipspub184.pdf), [ISO/IEC/IEEE 31320-2:2012](https://www.iso.org/standard/60614.html) | IDEF1X defines solid lines as identifying and dashed as non-identifying. In crow's-foot notation, a line style for identifying relationships is a tool convention, not part of the notation | Crow's foot by default and IDEF1X marks as a second skin. No claim of IDEF1X conformance |
| Data flow | Textbooks: DeMarco; Gane and Sarson; [Yourdon](https://web.archive.org/web/20140221221703/http://www.yourdon.com/strucanalysis/wiki/index.php?title=Chapter_9) | Two symbol sets. Levelling and balancing are Yourdon's. "Every flow touches a process" comes from later teaching material and is not universal | Both symbol sets as skins; balancing as an error; connection rules as warnings |
| Flowchart | [ISO 5807:1985](https://www.iso.org/standard/11955.html), confirmed 2019 | A symbol set and conventions for five kinds of chart | The common symbols. No claim of ISO 5807 coverage: its symbol list is paywalled and was not read |
| Mindmap | No standard found | | |

## 4. Architecture

### 4.1 Principles

1. **Meaning and presentation are separate, and both are data.** The model says what exists; a view says what is
   shown and how.
2. **A diagram type is mostly data**: element types, property schemas, line notations, rules, palette. Code is for
   what data cannot say: a family's layout and its gestures.
3. **Core stays dependency-free, deterministic and DOM-free for layout**, as now.
4. **No abstraction before its second user.** The registry's interface is frozen only after two unlike families run
   on it (class and sequence).
5. **Nothing is dropped or flattened silently**, in import, export or migration.

### 4.2 Layers

```
 readers / writers        Mermaid, PlantUML, Structurizr, BPMN XML, ...  →  typed model + report of what was not read
        │
 semantic model           nodes, edges, owned children, parent           (meaning; shared by views)
        │
 diagram type registry    element types · property schemas · line notations · validators · palette · commands
        │
 views                    type, shown ids, presentation (slots, pins, sizes, collapsed parts, sides)
        │
 layout strategy          layered graph (exists) · compound and ports · time axis · tree
        │
 routing                  orthogonal router (exists) · none (time axis) · curved (tree)
        │
 notation                 shapes that report size, ports, outline · line ends and labels · skins
        │
 canvas                   camera, selection, keyboard, overlays, export        (exists)
        │
 commands                 gestures → validated commands → host (or the reference store) → update()
```

| Layer | Shared by every type | Specific to a type or family |
|---|---|---|
| Model | Ids, references, ownership, `props` storage, schema version, migrations | Element and relationship types, their property schemas |
| Views | Shown ids, drill-down, presentation storage, notation skin | What presentation a type allows (slots, lanes, order) |
| Layout | Text measurement, determinism, caching by view key | The strategy: four in all |
| Routing | The orthogonal router, ports, labels | Line notations; which families route at all |
| Notation | Theme tokens, masks, selection and focus rings, export | Shapes and glyphs |
| Editing | Selection, in-place text, drag, keyboard, undo, transactions, the reference store | Micro-syntaxes (`+ name: Type`), family gestures (reorder a message, slide a port) |
| Validation | `Problem` shape, marks on the canvas, CLI exit codes | The rules |
| Adapters | The report of what was not read or written; opaque preservation | Each format |

### 4.3 Families

| Family | Types | Layout | What is special |
|---|---|---|---|
| G1 classifier graphs | Class, object, package, profile, requirement, block definition, ER | Layered graph, with a direction | Nodes sized by rows of owned members; decorated line ends |
| G2 structure graphs | Composite structure, component, deployment, internal block, parametric | Compound graph with ports | Nodes inside nodes; ports on borders; lines to ports |
| G3 plain typed graphs | Use case, communication, information flow, data flow, C4, AWS, GCP, Azure | Layered graph (today's) | Typed shapes and lines; icon packs; numbered messages |
| F flow graphs | Activity, state machine, interaction overview, flowchart, BPMN | Layered graph with lanes; compound for states and pools | Small control nodes, guards, lanes, hierarchy |
| T time-axis | Sequence, timing | Columns by ordered rows; rows by a time ruler | Order or time is meaning; no router |
| R tree | Mindmap | Two-sided tree | Keyboard-first outline editing |

G1, G3 and F extend the layout that exists. G2 adds ports and deeper nesting to it. T and R are new but small and
deterministic by construction.

### 4.4 The model: today's vocabulary, typed

**Decided (D6):** keep `nodes`, `edges` and `views`, and type them. The full rules and every diagram type's
vocabulary are in [`model.md`](model.md); one example per type is in [`examples/`](examples/). In short:

- `schemaVersion`: an integer. Absent means 1 (every file that exists).
- **One envelope** for nodes, edges and members: `id`, `type`, `label`, `parent`, `props`, `members`.
- `type` names an element type (`uml.Class`). A view's `diagram` names its diagram type (`uml.class`); absent, the
  view is today's map. Two keys, so the two names cannot be confused.
- `props`: the type's own properties. The core stores and diffs them, and never reads them.
- `members`: owned parts with their own ids: a class's attributes, a component's ports, a state's regions.
- `parent`: who owns an element in the model (a package owns a class; an operand holds a message). A view's boxes
  remain presentation.
- `present` on a view: presentation the layout cannot derive, by id (collapsed compartments, a port's side).
- `ext`: what a reader could not map, kept so a writer can put it back.

Reusing `nodes` and `edges` means `diff()`, `rules()`, lenses, `describe()`, paths, overlays, stories, the MCP tools
and the importers' model work on every new type on the day it ships. A parallel `elements` and `relationships`
vocabulary would have forked every one of those.

**A structural diagram** (from `examples/01-class.json`, now [`../../examples/sales-classes.json`](../../examples/sales-classes.json)):

```jsonc
{ "id": "order", "type": "uml.Class", "label": "Order", "parent": "sales",
  "props": { "stereotypes": ["entity"] },
  "members": [
    { "id": "order.total", "type": "uml.Property",  "label": "total", "props": { "visibility": "public", "valueType": "Money", "isDerived": true } },
    { "id": "order.place", "type": "uml.Operation", "label": "place", "props": { "visibility": "public", "returnType": "Receipt" } } ] }

{ "id": "order-lines", "type": "uml.Association", "from": "order", "to": "line",
  "props": { "ends": { "from": { "aggregation": "composite", "multiplicity": "1" },
                       "to":   { "role": "lines", "multiplicity": "1..*", "navigable": true } } } }

{ "id": "domain", "diagram": "uml.class", "direction": "down", "nodeIds": ["sales", "order", "line"],
  "layout": { "order": [1, 0] },                           // a pin, as today
  "present": { "book": { "collapsed": ["operations"] } } }
```

**A specialized behavioural diagram** (from [`examples/11-sequence.json`](examples/11-sequence.json)):

```jsonc
{ "id": "checkout", "diagram": "uml.sequence",
  "nodeIds": ["shopper", "storefront", "api", "payments"],   // lifelines, left to right
  "edges": [                                                  // messages; array order is time order
    { "id": "m4", "type": "uml.Message", "from": "api", "to": "payments", "label": "charge(total)", "props": { "sort": "call" } },
    { "id": "m5", "type": "uml.Message", "from": "payments", "to": "api", "label": "paid", "parent": "f1-paid",
      "props": { "sort": "reply", "replyTo": "m4" } },
    { "id": "m8", "type": "uml.Message", "from": "payments", "to": "api", "label": "declined", "parent": "f1-declined",
      "props": { "sort": "reply", "replyTo": "m4" } } ],
  "fragments": [
    { "id": "f1", "type": "uml.CombinedFragment", "props": { "operator": "alt" },
      "members": [ { "id": "f1-paid",     "type": "uml.InteractionOperand", "label": "payment accepted" },
                   { "id": "f1-declined", "type": "uml.InteractionOperand", "label": "else" } ] } ] }
```

**Why the same abstractions hold for both**

- Both are typed nodes, typed edges, owned members and a typed view. The core handles ids, references, storage,
  diffing, selection and undo for both without knowing either.
- What differs is confined to the type's definition: which properties are legal, whether array order is meaning
  (declared: yes for messages, no for associations), which layout strategy runs, and which extra section the view
  owns (`fragments`).
- A message names the operand it lies in (`parent`), never coordinates, so a fragment's frame is derived and
  survives reordering and deletion. Activation bars are derived from calls and replies. A compartment's size is
  derived from its members. Geometry is never stored where it can be computed.
- The sequence view's shape is today's numbered view: participants in `nodeIds`, run order in `view.edges`
  (`engine/references/schema.md:107`). So the same data draws as a communication diagram with the graph layout, and
  `sequenceFromTrace()` would yield a real sequence diagram with no new reader.

### 4.5 Specialized behaviour

- **Class compartments, ends, multiplicities, inheritance.** A classifier's shape reports its size from its
  members and the measured font. Compartments collapse per view. An association's ends are structured (`role`,
  `multiplicity`, `aggregation`, `navigable`); multiplicity is parsed into bounds for validation and kept as
  written. Generalization carries a layout hint: the parent above.
- **Ports, interfaces, nesting, deployment nodes.** A port is an owned child with an id; a connector's end names
  the port. The port's side and order are presentation. Provided and required interfaces are notations on a port.
  Nesting is `parent`, drawn as a compound node, which extends today's nested boxes with a typed header and outline.
- **Sequence.** Lifelines are columns in `nodeIds` order; messages are rows in array order. The strategy computes
  column gaps from label widths, activations from call and reply pairs, and fragment frames from message ranges.
  Editing is reordering, drawing between lifelines at a row, and wrapping a selection.
- **Communication ordering and timing axes.** A communication diagram numbers the same messages by order and call
  depth (1, 1.1, 1.2, 2). A timing diagram's lifelines hold ordered `{ at, state }` points; the strategy maps time to
  x, linearly or compressed.
- **State hierarchy, activity flows, guards, swimlanes.** A composite state is a compound node whose regions are
  ordered children. A transition's label is three fields edited as one line. Activity partitions are lanes: the
  lanes that numbered views derive today become explicit, typed and nestable.
- **Profiles and stereotypes.** Stereotypes are data from the first milestone: `props.stereotypes` and tagged
  values, drawn in guillemets. A profile defines them; validation checks that an applied one exists and fits the
  element's type. SysML's types are then stereotyped UML types in the registry, not a second metamodel.
- **SysML requirements, blocks, parametrics.** Requirements and blocks are G1 nodes with their own compartments;
  internal block and parametric diagrams are G2 with item flows and binding connectors. Nothing is solved or
  simulated. Scope: SysML v1.7 (§3.4).
- **ER cardinality and identifying relationships.** Each end holds `min` and `max`; the view's notation draws them
  as crow's feet or IDEF1X marks on the same geometry, as `box`, `c4` and `uml` share one today. An identifying
  relationship is a property that changes the line style and feeds the key rule. Chen's notation is deferred: it
  turns relationships into nodes.
- **BPMN events, gateways, pools, lanes.** An event's glyph is a function of three properties (position, trigger,
  catching or throwing). A boundary event attaches to an activity's border as a port does. Pools and lanes are
  nested lanes; the two flow kinds have opposite scope rules, which validation enforces. A collapsed sub-process is
  a card that opens a view; expanded, it unfolds in place.
- **C4 abstraction levels.** Elements get types (person, software system, container, component) and `parent`.
  Views get types (landscape, context, container, component, dynamic, deployment). Each view type validates what it
  may show. Dynamic views are numbered views.
- **Cloud icon libraries.** Cloud diagrams are G3 with icon packs as data (id, category, source, hash, pack
  version), fetched and pinned as brand logos are today, and typed group boxes.

### 4.6 Extension mechanism

One call registers a diagram type. A sketch, to be frozen after the sequence spike:

```ts
registerDiagramType({
  id: 'uml.class',
  family: 'graph',                                  // picks the layout strategy and the gesture set
  layout: { direction: 'down' },
  elements: {
    'uml.Class':     { shape: 'classifier', props: classProps, children: { members: ['uml.Property', 'uml.Operation'] }, owners: ['uml.Package', null] },
    'uml.Interface': { shape: 'classifier', props: interfaceProps, children: { members: ['uml.Operation'] } },
  },
  relations: {
    'uml.Generalization': { from: ['uml.Class', 'uml.Interface'], to: 'same', line: 'solid', toEnd: 'hollow-triangle', hint: 'target-above' },
    'uml.Association':    { props: associationProps, line: 'solid', ends: 'association' },
  },
  text: { 'uml.Property': { parse, print } },       // "+ name: Type [0..1]" in both directions
  validators: [uniqueMemberNames, noGeneralizationCycles],
  palette: ['uml.Class', 'uml.Interface', 'uml.Association', 'uml.Generalization'],
  readers: { mermaid: readClassDiagram }, writers: { mermaid: writeClassDiagram },
});
```

- **Packaging.** Each family is a subpath export of the same package (`umlimator/uml`, `umlimator/bpmn`), as
  `umlimator/element` is today. A host imports what it draws. The core registers the map type itself.
- **Shapes** extend today's contract (`out`, `face`, `det`, `inset`) with `size(element, measure)` and
  `ports(element)`, so layout can see them.
- **Layout strategies** share one signature: a typed view and a text measurer in, geometry out, with no DOM.

### 4.7 Cross-cutting decisions

- **Stable identities.** Every node, edge, owned child, fragment and view has an id, unique in the model, opaque,
  chosen by the host or the reader. Readers derive ids from the source's own identifiers, as import does now, so a
  second import names the same things. Positional line ids stay valid for maps and are not accepted for typed
  diagrams. `migrate()` leaves untyped lines as they are: stories, overlays and hosts name them by position.
- **Schema versioning and migration.** `schemaVersion` is an integer; `migrate(model)` is a pure chain of steps, one per
  version, each with a fixture. CI runs every old fixture through it and compares geometry hashes. The standing
  rule "nothing is removed" (`docs/module-api.md:2435`) continues: version 2 is a superset.
- **Undo, redo, transactions** (decided, D7). A gesture emits a transaction: a list of commands with one id. The library ships a
  pure `apply(model, transaction)` that returns the next model or the problems that refuse it. Hosts may use it or
  keep their own; `history()` stays as it is. Snapshots are enough until models are large; patches come then.
- **Manual changes and regeneration.** Meaning merges by id; presentation survives for every id that survives. A
  reader marks what it wrote (`origin`); a field the user changed is listed in the element's `edited` fields and wins
  over the next generation, which reports it as a conflict. `diff()` shows the result before it is applied.
- **Shared elements across views.** Already true for cards and worth keeping: a class may appear in several class
  diagrams. Deferred: integrity across diagram types (a lifeline typed by a class, a state machine owned by one). A
  node may carry a reference; nothing enforces it until L3.
- **Performance.** Budgets: an edit to paint within 100 ms for a 40-element diagram when positions are kept; a full
  layout of 50 nodes within 1 s. Today's figures (§2.1) miss the second on dense graphs, so the foundation includes
  routing only what changed, and an option to lay out in a worker.
- **Accessibility.** Each type defines its reading order and names ("Class Order, 2 attributes, 1 operation";
  "Message 3, Orders to Payments: charge(total)"). `describe()` gains a per-type writer, which also serves the MCP
  tools. Every gesture has a keyboard path; adding a line has none today (`docs/editing.md:56`).
- **Maintainability.** Split `lib/umlimator.js` into modules by layer. A type lives in one folder: definition,
  fixtures, tests, and a conformance note stating its subset.

## 5. Generation and editing workflows

### 5.1 The existing approach, assessed

**Verified.** Umlimator generates in three ways:

1. **JSON written by a person or an agent, checked in a loop.** The `map-repo` skill reads a codebase, writes the
   model, renders it and fixes what `validate()` and the layout check report
   (`plugins/umlimator/skills/map-repo/SKILL.md`). The schema gives editors completion. The MCP server lets an agent
   read the model and drive the page (`umlimator_mcp.py`).
2. **Readers** for five formats, each a practical subset, with ids taken from the source and a list of what was not
   read (`umlimator_import.py`, `docs/module-api.md:1268`).
3. **Derived models** in the module: a trace as a numbered view, a diff, drift.

**Assessment.** Route 1 is the strong one: the model is the interface, the loop is closed and deterministic, and
changes review as JSON diffs. Its limit is vocabulary: an agent can write a typed diagram only if each type has a
schema and examples. Route 2 is sound in its rules and narrow in reach: Python only, one-way, C4-shaped structures.
Route 3 shows that derivation belongs in the module.

### 5.2 Inputs

| When | Input | Why |
|---|---|---|
| First | The typed JSON model, with a JSON Schema per diagram type | It is the editor's own format, an agent's best target, and every other input's output |
| First | Mermaid, for the types it has (class, sequence, state, ER, flowchart, requirement, C4, mindmap), starting with `classDiagram` | Widely written in repositories and docs; a reader for `flowchart` and C4 exists; StarUML generates diagrams from seven of these, all but C4 ([Mermaid support](https://docs.staruml.io/user-guide/mermaid-support/)) |
| First | Agent edits through MCP, as validated commands | Extends what exists; an agent's write goes through the same `apply()` as a gesture |
| Kept | Structurizr DSL, C4-PlantUML, compose, Kubernetes, OTLP traces | Exist and are tested |
| Later | PlantUML class and sequence | A large, irregular grammar; after the reader pattern is proven on Mermaid |
| Later | BPMN 2.0 XML; SQL DDL or DBML | With BPMN and ER, after the UML types |
| Deferred | XMI, StarUML `.mdj`, SysML v2 text | L3; see §6.4 |
| Outside | Free-text prompts, source-code reverse engineering | An agent skill writes the model, as `map-repo` does; the module fetches nothing and should stay so |

### 5.3 From input to an editable diagram

```
source → reader → typed model + report → migrate → validate (structure, then the type's rules) → layout → view
```

- A reader returns `{ model, report }`. Each report item says where, which construct, and what became of it:
  `skipped`, `approximated` or `kept` (stored under `ext`, unread but preserved).
- **Recommendation:** write new readers in JavaScript, in the module's package, so the playground, a host and the MCP
  server can call them. The Python CLI already runs Node for `diff`, `drift`, `trace` and `mcp` (`README.md:278-279`).
  The Python readers stay until there is a reason to port one.
- A generated diagram is the same model a hand-made one is. There is no "generated mode" to leave before editing.

### 5.4 Is a shared intermediate representation appropriate?

**Recommendation:** yes, and it is the typed model itself, not a second structure. Readers, writers, agents, the
editor and `diff()` all meet there. Diagram-specific representation is needed where the shared shape would lose
meaning:

- **order** in time-axis types (the message list and `fragments`);
- **time points** in timing diagrams.

Each lives in a section its view type declares, validated by that type. I recommend against a text language of
Umlimator's own: JSON plus readers for the languages people already write covers the need.

### 5.5 Creating and editing

| Action | Pointer | Keyboard | Command |
|---|---|---|---|
| Create an element | The type's palette, or Alt + double-click on empty space (exists) | `N` (exists), then a type | `add` with type, owner, hint |
| Create an owned child (attribute, port, operand, lane) | A "+" on the selected element | Enter on its last row | `add` with owner |
| Connect | Drag from the handle (exists); on drop, choose among the relationships the registry allows for that pair | `L`, pick a target, Enter (missing today) | `add` edge |
| Move | Drag to a slot or an order (exists) | Alt + arrows (exists) | `move` or `reorder`; a pin in the view |
| Nest | Drag into a compound element | Move, with the owner picked | `reparent` |
| Resize | Only where size is not derived: lanes and notes | Shift + arrows | `present` change |
| Label | Double-click or F2 (exists); the type's micro-syntax parses the line | F2 | `set` |
| Change a property | A panel built from the type's property schema | The panel's fields | `set` with a path |
| Remove from this view | Delete | Delete | `hide` |
| Delete from the model | A menu item | Shift + Delete | `delete` |

- Sizes are derived from content wherever they can be, so generated and edited diagrams look alike.
- "Remove from view" and "delete from model" must be two commands once an element can appear in several views.
  StarUML separates them the same way
  ([editing elements](https://docs.staruml.io/user-guide/editing-elements/)).
- A label that does not parse is kept as written, with a warning. It is never discarded and never half-applied.

### 5.6 Exposing properties and constraints

- **One schema, three uses.** A type's property schema builds the panel, the JSON Schema for editors and agents, and
  `validate()`.
- **Constraints act at three moments.** While dragging, illegal targets are not offered and the hint line says why.
  On commit, `apply()` refuses a command with its problems. Afterwards, a problems list and marks on the canvas, as
  broken rules are marked today.
- **Each problem** carries a level, a rule id, the elements it is about and, for a notation rule, the clause it comes
  from. Nothing is corrected automatically.

### 5.7 Generated diagrams and manual edits together

- Regeneration merges by id. Presentation survives for every id that survives.
- A field the user edited wins over the generator and is reported as a conflict.
- The merged result is shown as a diff before it is applied.
- "Lay out again" is an explicit command that clears pins. Nothing else moves what a user placed.

### 5.8 Errors, unsupported constructs and lossy conversions

- **Import.** The report is printed by the CLI as today, returned by the reader, and shown on the view as a count
  that opens the list.
- **Unknown types.** A node whose `type` is not registered (a missing family, a newer file) is drawn as a plain
  card with a warning, and written back unchanged.
- **Export.** Pictures (SVG, PNG, PDF) are exact. A writer to another notation returns `{ text, lossy }`, and each
  type's documentation has a fidelity table: what round-trips, what is approximated, what is left out.
- **Validation** reports and never repairs.

## 6. Build versus reuse

The facts in this section were fetched on 10 and 11 Nov 2026 from each project's licence file, npm, GitHub and
documentation. Sizes are minified and gzipped unless noted. Licence remarks describe the terms; they are not legal
advice. What could not be confirmed is listed in §10.

### 6.1 Preferred approach

| Area | Preferred | Why |
|---|---|---|
| Rendering and editing | Extend Umlimator's own | Every candidate owns the model and the renderer; none keeps the host-owned model, the DOM-free layout or the accessibility work |
| Layout and routing | Own engine for graphs and flows; own small strategies for time-axis and tree; elkjs as an optional, host-supplied strategy for the port-heavy family if a time-boxed trial of the own engine fails | The router exists and is hash-tested; no library lays out sequence or timing diagrams |
| Readers and writers | Own subset readers; optional adapters where a maintained, permissive library reads a format whole (BPMN XML, DBML) | Mermaid and PlantUML expose no parsed model for the UML types |
| Modelling and validation | Own, driven by the type registry; JSON Schema checked in CI only, as today | Small, and specific to each notation's subset |
| Undo and collaboration | Snapshots now; inverse patches inside `apply()` when models grow; a CRDT only if collaboration becomes a goal | Nothing to add yet |
| Notation assets | Draw UML, SysML, ER, BPMN and flowchart glyphs as vectors; fetch cloud icons, never bundle them | The vendors' terms do not grant redistribution |

### 6.2 Rendering and editing frameworks

| Candidate | Licence | Stack fit | Gives | Cost or blocker |
|---|---|---|---|---|
| [JointJS](https://github.com/clientIO/joint) core | MPL-2.0 | Vanilla, SVG, no dependencies, 144 KB | Ports, nesting, link tools, five orthogonal routers | Undo, selection, clipboard, text editing, resize and image export are in JointJS+, which is commercial ([features](https://www.jointjs.com/features), [pricing](https://www.jointjs.com/pricing)). Core ships only standard shapes |
| [maxGraph](https://github.com/maxGraph/maxGraph) | Apache-2.0 | Vanilla, SVG; needs a bundler; still 0.x; 168 KB | Undo, ports, groups and swimlanes, label editing, resize, snapping, several layouts | No UML or BPMN shapes; no accessibility documentation found; headless use undocumented |
| [AntV X6](https://github.com/antvis/X6) | MIT | Vanilla, SVG, 166 KB | History, clipboard, selection, snaplines, ports, nesting, orthogonal and ER routers, SVG and PNG export | No accessibility documentation found; replaces the renderer |
| [diagram-js](https://github.com/bpmn-io/diagram-js) | MIT | Vanilla, SVG; ships no build, so it needs a bundler | Command stack, modelling rules, selection, resize, snapping, copy and paste, Manhattan layout | No ports; replaces the renderer |
| [bpmn-js](https://github.com/bpmn-io/bpmn-js) | MIT plus a clause: the bpmn.io watermark must stay visible ([licence](https://bpmn.io/license/)) | As diagram-js; modeler 164 KB | A complete BPMN 2.0 modeller | The watermark; a second editor inside the product |
| [React Flow](https://reactflow.dev) | MIT | Requires React or Svelte; 60 KB plus the framework | Handles, sub-flows, resizer; documented keyboard and screen-reader support | Undo, copy and paste, helper lines and automatic layout are paid Pro examples; no layout of its own |
| [tldraw](https://tldraw.dev/community/license) | Its own licence, not open source; production use needs a licence key | Requires React; 552 KB | A whiteboard with history, snapping, export, documented accessibility | The licence rules it out for an MIT library |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | MIT | Requires React; canvas; 353 KB | A whiteboard with arrow binding and frames | No ports; not a modelling canvas |
| [Sprotty](https://github.com/eclipse-sprotty/sprotty), [GLSP](https://github.com/eclipse-glsp/glsp) | EPL-2.0 or GPL-2.0 with the Classpath exception | TypeScript with a dependency-injection container; GLSP is client and server | Undo, routing, ports, compartments; GLSP adds palettes and validation. [bigUML](https://github.com/borkdominik/bigUML) (MIT) builds class, package, state machine and use case diagrams on it | Sprotty's last release was December 2024; a server-based architecture |
| [Cytoscape.js](https://js.cytoscape.org) | MIT | Vanilla, canvas, headless in Node, 138 KB | Graph model, compound nodes, right-angled edges | No ports; editing extensions last published 2020 and 2021; the SVG export extension is GPLv3 |
| GoJS, yFiles | Proprietary, per developer | | | Ruled out for an MIT library |
| [draw.io](https://github.com/jgraph/drawio) | Apache-2.0 code; stencil sets restricted | An application embedded by iframe, not a library | | Not reusable as a component |

**Against the criteria**

- **Compatibility.** Each framework is the model, the renderer and the interaction layer at once. Adopting one
  means replacing `render()`, the router, exports and the browser test suites, and giving up "the host owns the
  model".
- **Licence.** X6, maxGraph, diagram-js, React Flow, Excalidraw and Cytoscape.js are permissive. JointJS's MPL is
  usable as a dependency. tldraw, bpmn-js (for a white-label library), GoJS and yFiles are not.
- **Maintenance.** All but Sprotty released within the last seven months.
- **Size.** Each adds between 60 and 550 KB gzipped. Umlimator is 164 KB gzipped with its standalone page.
- **Accessibility.** Only React Flow, tldraw and GoJS document keyboard and screen-reader support; GLSP's is marked
  experimental. Umlimator's own would have to be rebuilt on any of the others.
- **Export.** Umlimator already writes SVG, PNG and PDF. JointJS's open core has no image export.
- **Lock-in.** High in every case: element definitions, commands and tests would be written against the framework.
- **Coverage of the hard parts.** None lays out sequence or timing diagrams automatically in its open edition, and
  none ships UML shapes, so the notation work remains whichever is chosen.

**Credible alternatives**

1. **AntV X6 as the editing canvas**, fed by Umlimator's model and layout. It would save building selection,
   resize and port interaction (across stages 1 and 5) at the price of a second renderer,
   lost accessibility and two models to keep in step.
2. **bpmn-js embedded for BPMN only.** The fastest route to real BPMN interchange, for hosts that accept the
   watermark and a different-looking editor. Worth offering as an integration instead of building BPMN natively, if
   BPMN matters more than consistency. That choice can wait until BPMN's turn.
3. **GLSP with bigUML**, if the goal became a full UML modelling workbench in an IDE. A different product from an
   embeddable module.

### 6.3 Layout and routing

| Candidate | Licence | Size | Good for | Limits |
|---|---|---|---|---|
| [elkjs](https://github.com/kieler/elkjs) | EPL-2.0 or GPL-3.0-or-later (from 0.12.0) | 477 KB, one file, no dependencies | Layered layout with ports, nested graphs and orthogonal routing; runs in Node and in a worker; options for interactive and constrained layout | Large; no sequence or timing algorithm; incremental layout is not a first-class API |
| [@dagrejs/dagre](https://github.com/dagrejs/dagre) | MIT | 17 KB | A small layered layout with clusters | Its documentation shows no ports and no orthogonal routing |
| [d3-hierarchy](https://d3js.org/d3-hierarchy/tree) | ISC | 6 KB | Tidy trees | One node size for all nodes |
| [d3-flextree](https://github.com/Klortho/d3-flextree) | WTFPL | 3 KB | Tidy trees with nodes of different sizes | Unmaintained since 2021 |
| [@msagl/core](https://microsoft.github.io/msagljs/) | MIT | 196 KB | Layered layout and rectilinear routing | Described as under development |
| libavoid-js (from [Adaptagrams](https://github.com/mjwybrow/adaptagrams)) | LGPL-2.1-or-later | 181 KB of WebAssembly | Obstacle-avoiding orthogonal connectors | One maintainer; only betas since April 2025 |
| [@hpcc-js/wasm-graphviz](https://www.npmjs.com/package/@hpcc-js/wasm-graphviz) | Apache-2.0 wrapper; Graphviz is EPL-2.0 | 820 KB unpacked | DOT layouts | Its orthogonal mode ignores ports and edge labels |

- **Keep the own engine** for graphs and flows. It routes orthogonally with ports, labels and boxes today, and its
  results are pinned by hashes. Swapping in elkjs would add 477 KB to a 164 KB download and move every existing
  picture.
- **Ports and deep nesting (family G2):** try the own engine first, in a time-boxed trial. If routing to border ports inside
  nested nodes does not converge, accept elkjs as a strategy the host passes in. The core then stays MIT and
  dependency-free, and the copyleft library is never bundled.
- **Time-axis and tree:** build. A sequence layout is arithmetic over columns and rows. A two-sided tidy tree with
  nodes of different sizes is a few hundred lines; the one package that does it is unmaintained.

### 6.4 Generation, parsing and interchange

| Candidate | Licence | Finding | Use |
|---|---|---|---|
| [Mermaid](https://github.com/mermaid-js/mermaid) | MIT | Class, sequence, state, ER, requirement, C4 and mindmap are still parsed by grammars inside the main package (22 dependencies). The public `parse()` returns only the diagram type; the call that returns parsed data is marked internal and deprecated. [`@mermaid-js/parser`](https://www.npmjs.com/package/@mermaid-js/parser) covers none of these types | Own subset readers, as for `flowchart` today |
| [PlantUML](https://plantuml.com) | GPL by default; builds under other licences exist | Java. XMI export is documented for class diagrams only, in tool-specific flavours ([XMI](https://plantuml.com/xmi)). No JSON or syntax-tree export | Own subset readers, later |
| [Structurizr](https://github.com/structurizr/structurizr) | Apache-2.0 | The JSON workspace is the model, with a published schema, and includes dynamic and deployment views. Turning DSL into JSON needs its Java tooling | Add a reader for the JSON workspace: no parser needed |
| [DBML](https://dbml.dbdiagram.io/js-module/core) | Apache-2.0 | `@dbml/core` parses DBML and several SQL dialects into one model; 7 dependencies | Optional adapter for ER |
| [bpmn-moddle](https://github.com/bpmn-io/bpmn-moddle) | MIT, no watermark clause | Reads and writes BPMN 2.0 XML as objects; 16 KB | Optional adapter for BPMN interchange |
| [bpmnlint](https://github.com/bpmn-io/bpmnlint) | MIT | Configurable modelling rules: start and end events required, nothing disconnected, no implicit splits | A source of rules to write, not a dependency |
| XMI | | No maintained JavaScript library for UML 2.5 XMI with diagram interchange was found. StarUML exchanges XMI 2.1, model elements only. PlantUML keeps separate flavours per tool; OMG runs a [working group](https://www.omgwiki.org/model-interchange/) on interchange problems | Defer to L3, and only on demand |
| StarUML `.mdj` | Proprietary tool; the file is JSON | A [metamodel reference](https://files.staruml.io/api-docs/6.0.0/metamodel/index.html) is published; model elements and views are separate objects joined by reference, as in §4.4. The open reader is archived | A possible later importer |
| SysML v2 | Pilot implementation: EPL-2.0, Java | A different language from the four diagrams in scope (§3.4) | Out of scope |
| Parser tools | [Langium](https://github.com/eclipse-langium/langium) MIT, 8 dependencies; [Ohm](https://www.npmjs.com/package/ohm-js) MIT, none; [Peggy](https://www.npmjs.com/package/peggy) MIT | Langium brings a language-server stack | Hand-written readers for subsets. **Assumption:** a generator run at build time would leave no run-time dependency; not checked |

### 6.5 Icons and notation assets

- **UML, SysML, ER, flowchart, data flow:** drawn as vectors from their specifications. No assets are needed.
- **BPMN:** drawn as vectors too. [bpmn-font](https://github.com/bpmn-io/bpmn-font) is under the Open Font License
  if a font is preferred.
- **AWS.** The [official page](https://aws.amazon.com/architecture/icons/) allows customers and partners to use the
  icons to make architecture diagrams, and states no right to redistribute or modify them. AWS's
  [trademark guidelines](https://aws.amazon.com/trademark-guidelines/) apply. AWS's own
  [PlantUML icon set](https://github.com/awslabs/aws-icons-for-plantuml) licenses its icons under CC BY-ND 2.0. The
  package is reissued three times a year.
- **Azure.** [Microsoft's terms](https://learn.microsoft.com/en-us/azure/architecture/icons/) allow the icons in
  architecture diagrams, training and documentation, and copying or distributing them only for that use. They may
  not be cropped, flipped, rotated or reshaped. The download sits behind an agreement.
- **Google Cloud.** The [icons page](https://cloud.google.com/icons) offers them for diagrams and documentation and
  carries no licence text. Google's brand guidance restricts imitation of product icons.
- **Third-party bundles** (Iconify sets, `aws-icons`, mingrammer/diagrams, PlantUML's standard library) claim MIT,
  CC0 or Apache for their packaging while the icons remain their owners'. They are no basis for bundling.
- **Recommendation (D10).** Do not ship vendor icons in the MIT package. Fetch each pack from its owner on first
  use, pin it by hash and pack version, never recolour or reshape an icon, and show the owner's terms once. This is
  how brand logos work today (`icons/manifest.json`, `tools/fetch_icons.py`, `README.md:357-360`).
- **Open question.** Whether AWS's and Google's terms allow a tool to download the packs for its users could not be
  confirmed from their pages. Read the terms inside each download, or take advice, before the cloud types are built.

### 6.6 Modelling, validation and undo

- **Validation.** Own code. [Ajv](https://ajv.js.org) (MIT, 33 KB) stays a CI-only check of the schema, as now
  (`.github/workflows/check.yml:113`).
- **Constraint languages.** [ocl.js](https://github.com/SteKoe/ocl.js) (MIT, maintained) exists if user-written
  constraints ever come into scope. They are excluded from the first milestone.
- **Meta-model tooling.** [moddle](https://github.com/bpmn-io/moddle) (MIT) describes a metamodel in JSON and binds
  it to XML. It is worth reading before the registry's descriptors are designed, and adopting only with bpmn-moddle.
- **Undo and collaboration.** [Immer](https://immerjs.github.io/immer/patches/) (MIT, no dependencies) produces
  patches with their inverses. [Yjs](https://docs.yjs.dev/api/undo-manager) (MIT) is a CRDT with a scoped undo
  manager. Snapshots suffice today. A transaction of commands maps onto either, so the choice can wait.

## 7. Roadmap

The work packages, the releases and what can run in parallel are in [`plan.md`](plan.md). This section keeps the
reasoning. Agents build this, so there are no time estimates.

### 7.1 Ordering rules

1. Foundation first, with every existing picture locked by its hash.
2. **The 14 UML types are the first milestone** (D4, decided). No additional type is built before they are done.
3. Within a family, the type that exercises the most machinery goes first; the others then cost little.
4. A stage ships only when its types meet the definition of done (`plan.md` §2). Fourteen types that can be drawn
   but not edited would not be the milestone.
5. After the UML types, the additional types go in order of what they reuse, the cheapest first.

### 7.2 Milestone 1: the UML track

| Order | UML type | Stage | Why here |
|---|---|---|---|
| 1 | Class | 1 | Highest use; exercises compartments, typed ends and ownership |
| 2 | Object | 2 | Class machinery with instances |
| 3 | Package | 2 | Ownership as nesting, needed by everything later |
| 4 | Sequence | 3 | Highest-use behavioural type; proves the second layout strategy early |
| 5 | Communication | 3 | Sequence's data on the graph layout; numbered views exist |
| 6 | Use case | 4 | Cheap once shapes report their size |
| 7 | Activity | 4 | Lanes and control nodes |
| 8 | State machine | 4 | Hierarchy and regions |
| 9 | Interaction overview | 4 | Needs activity and sequence |
| 10 | Component | 5 | First user of ports |
| 11 | Deployment | 5 | Compound nodes |
| 12 | Composite structure | 5 | Ports and parts together |
| 13 | Profile | 6 | Stereotype definitions; SysML needs them next |
| 14 | Timing | 6 | Least reuse, least demand |

**What this order costs.** ER shares the class diagram's rows and line ends. Flowchart, data flow and typed C4 are
small once stage 1 is done, and Umlimator's present users draw architecture, not UML. Under D4 these wait for all 14
UML types. Nothing technical forces the wait: any of them can be pulled forward after stage 1 by a later decision.

### 7.3 Milestones and stages

**Milestone 1: the 14 UML types**

| Stage | Release | Types | Shared infrastructure delivered | Level and known limits | Depends on, risks |
|---|---|---|---|---|---|
| 1 | 0.17.0, 0.18.0 | Class | The foundation: the module split; schema version 2 and `migrate()`; the envelope, `parent`, `present`, `ext`; shapes that report size and ports; rows as tall as their nodes; a layout direction; typed lines kept apart; self-loops; `apply()` and transactions; palette, properties and problems panels; keyboard connect; routing only what changed. Then compartments, the member micro-syntax, end notations, stereotypes as data, a Mermaid class reader and writer, and the sequence spike | L2. No templates, association classes, n-ary associations, qualifiers or OCL. Maps and C4 exactly as now | Layout changes moving existing pictures: locked by `bench/expected.json`. Crowded end labels |
| 2 | 0.19.0 | Object, package | Instances and slots; ownership drawn as nesting | L2 | Stage 1 |
| 3 | 0.20.0 | Sequence, communication | The time-axis strategy; order as meaning; operands; traces as sequence diagrams | L2. No gates, continuations or timing constraints | Stage 1. A new interaction model: reordering and fragment nesting |
| 4 | 0.21.0 | Use case, activity, state machine, interaction overview | Shapes that are not boxes; explicit nestable lanes; compound nodes with regions; the transition micro-syntax | L2. No pins, expansion regions, exception handlers or submachine states | Stages 1 and 3. Regions and border-crossing transitions |
| 5 | 0.22.0 | Component, deployment, composite structure | Ports on borders; ends through parts; deep nesting | L2 | Stages 1 and 2. Port routing (§6.3) |
| 6 | 0.23.0 | Profile, timing | Stereotype definitions and application checks; the time-ruler strategy | L2. No value lifelines | Stages 1 and 3 |

**After the UML types**

| Milestone | Release | Types | Shared infrastructure delivered | Level and known limits | Depends on, risks |
|---|---|---|---|---|---|
| 2 Additional graph types | 0.24.0 | ER; flowchart, data flow, information flow; C4 with typed elements, dynamic and deployment views | Line-end skins (crow's foot, IDEF1X marks); per-view scope rules; DFD levels on drill-down; a Structurizr JSON reader | L2. ER without Chen's notation; flowchart with the dozen most common symbols (StarUML lists 27) | Stages 1, 3 and 5 |
| 3 SysML v1.7 | 0.25.0 | Requirement, block definition, internal block, parametric | Frames; SysML's types as stereotyped UML types | L2 notation; no solving or simulation; nothing of SysML v2 | Stages 1, 5 and 6 |
| 4 The rest | 0.26.0, 0.27.0 | AWS, then GCP and Azure; mindmap; BPMN (the Descriptive sub-class's elements, §3.4) | Icon packs as data; the tree strategy; BPMN glyphs and flow-scope rules | L2. Cloud packs fetched, not bundled (D10). BPMN XML interchange through an optional adapter | Stages 4 and 5. Icon terms (§6.5); BPMN scope creep |
| Stabilization | 1.0.0 | None new | Frozen API and schema; conformance notes; a migration guide | | Everything before it |

The definition of done that every type must meet before its stage ships is `plan.md` §2.

### 7.4 Size and confidence

- **Relative size** is in §3.3. The large pieces are the foundation, sequence, state machines, ports and BPMN.
- **Confidence** is good for stage 1, whose code is known; fair for stage 3, a new interaction model; lower beyond,
  where each stage depends on abstractions the earlier ones build. That is why every stage starts with a design note
  that re-plans it (`plan.md` §5).

## 8. First milestone: the 14 UML diagram types

### 8.1 The milestone in stages

**Decided (D4, 11 Nov 2026):** the first milestone is the 14 standard UML diagram types.

**How I have read that decision** (to confirm): all 14 at L2, the editable level you defined as usable support, and
before any additional type. The alternative reading, all 14 drawn first and made editable later, would be the shallow
support the brief warns against, so I have not planned it.

- **Six stages** (§7.3), each released on its own (0.17.0 to 0.23.0). Value arrives at every stage, and a stage that slips does not
  hold back the ones already shipped.
- **Stage 1 is unchanged from the original recommendation:** the foundation and the class diagram, with the
  sequence spike. It is planned in detail in §8.2 to §8.4.
- **Stages 2 to 6** are scoped in §8.5. Each gets its own detailed plan when the stage before it ships, since each
  depends on abstractions the earlier stage builds.

**Excluded from the whole milestone:** XMI and UML diagram interchange; integrity across diagram types (a lifeline
may refer to a class, but nothing enforces it); templates; OCL; code generation and reverse engineering; free
placement (D1); collaborative editing; a PlantUML reader; every non-UML type.

### 8.2 Stage 1: scope

- The foundation (§7.3, stage 1), limited to what the class diagram needs.
- The UML class diagram at L2 on the subset below.
- A Mermaid `classDiagram` reader and writer.
- A short, throw-away spike: a sequence layout on the registry, drawn from an existing numbered view
  (`examples/bookshop.json`, view `api`).

**In the subset:** class, interface, enumeration with literals, data type; attributes (visibility, name, type,
multiplicity, default, static, derived); operations (visibility, name, parameters, return type, static, abstract);
stereotypes as text; packages as owners; association with both ends (role, multiplicity, navigability, shared or
composite aggregation), generalization, interface realization, dependency; notes.

**Excluded:** templates and bindings, association classes, n-ary associations, qualifiers, signals and receptions,
constraints and OCL, generalization sets, nested classifiers, object diagrams (stage 2), and everything excluded
from the milestone (§8.1).

### 8.3 Stage 1: work packages

The twelve work packages, what each owns, their order and what can run at the same time are in `plan.md` §4. They
include what the edge-case review added: self-loops, typed lines kept apart, the command line's path through the
upstream script, and a view key that tells geometry from paint (`risks.md` §1).

**Validators in the milestone:** unique member names per classifier; unique classifier names per owner;
multiplicity syntax, and lower bound not above upper; no generalization cycles; generalization joins like kinds;
interface realization ends on an interface; an interface has no attributes with composite ends; no ownership cycles;
every reference resolves; a composite end's multiplicity is at most 1.

### 8.4 Stage 1: acceptance

1. Regression: bench hashes, the examples' stills in `box`, the Node tests and the browser suites, all unchanged.
2. Three class fixtures (6, about 20, and 60 classes with 90 relationships) have no overlap or overflow in the
   layout check; layout takes at most 1 s for the 20-class one and 3 s for the largest, in Node.
3. Everything in the subset can be created, edited and deleted by pointer and by keyboard.
4. Undo and redo across a 30-step scripted session return byte-identical models at each step.
5. Each validator has a passing and a failing fixture.
6. Mermaid: `read(write(model))` equals the model on the subset; a file using every construct on Mermaid's class
   diagram page yields the expected report.
7. SVG, PNG and PDF show compartments, ends and labels; the fidelity table lists the limits.
8. Names, reading order and the written-out axe rules pass for the new shapes.
9. The spike's findings are applied to the registry before its API is documented.

### 8.5 Stages 2 to 6: subsets

Each subset is the smallest that makes the type usable. The clause numbers are UML 2.5.1's. What a type needs in
rendering, editing and validation is in §3.3; the acceptance criteria are §7.3's.

| Stage | Type | In the subset | Left out |
|---|---|---|---|
| 2 | Object | Instance specifications, slots, links | Checking slot values against their types |
| 2 | Package | Packages, nesting, import and merge drawn as dependencies | The semantics of package merge |
| 3 | Sequence (17.8) | Lifelines; call, asynchronous, reply, create, delete and self messages; activations, derived; fragments `alt`, `opt`, `loop`, `par`, `break`; interaction use | Gates, continuations, state invariants, time and duration constraints, found and lost messages, the other seven operators |
| 3 | Communication (17.9) | Lifelines, links, numbered messages with nesting and direction | Guard and iteration expressions beyond text |
| 4 | Use case (18) | Actor, use case, subject, association, include, extend with extension points and a condition, generalization | Use-case descriptions (the text of the flows) |
| 4 | Activity (15, 16) | Initial, final and flow-final nodes; actions; decision and merge; fork and join; control flows with guards; object nodes and flows; partitions in one dimension; send and accept signal; call behaviour, opening a view | Pins, expansion and interruptible regions, exception handlers, structured nodes, two-dimensional partitions |
| 4 | State machine (14) | Simple and composite states with entry, do and exit; orthogonal regions; initial, final, choice, junction, fork, join, history and terminate; external, internal and self transitions | Submachine states, entry and exit points, protocol state machines |
| 4 | Interaction overview (17.10) | Initial and final, decision and merge, fork and join, control flow, interaction use that opens its sequence view, an inline interaction as a picture | Editing an inline interaction in place |
| 5 | Component (11.6) | Components, ports, provided and required interfaces, assembly and delegation connectors, realization, nesting | Connector multiplicities |
| 5 | Deployment (19) | Nodes, devices, execution environments, artifacts, deployment, manifestation, communication paths, deployment specifications | Instance-level deployment |
| 5 | Composite structure (11.2, 11.3, 11.7) | Structured classifiers, parts, ports, connectors, collaborations, collaboration uses, role bindings | Connector multiplicities |
| 6 | Profile (12.3) | Profiles, stereotypes, metaclass references, extensions, tag definitions, profile application; applied stereotypes checked across the model | Stereotype icons and custom shapes |
| 6 | Timing (17.11) | Lifelines, state timelines, a time ruler, time and duration constraints, messages | Value lifelines; continuous timelines |

## 9. Decisions

All twelve were taken on 11 Nov 2026. Each row keeps the options that were weighed; (a) was the recommendation.

### Product

| # | Decision | Options and trade-offs |
|---|---|---|
| D1 | How diagrams are arranged. **Decided 11 Nov 2026: (a)** | **(a) Automatic layout with pins (recommended):** generated diagrams read well untouched, regeneration is safe, tests stay deterministic; hand-tuned arrangements are limited to slots and order. **(b) Manual canvas with optional auto layout,** as StarUML: full control; generated diagrams need hand work, regeneration fights the user, and the differentiator is gone. **(c) Per type:** automatic for graphs, manual only where geometry is content (wireframes); two interaction models to maintain |
| D2 | Which types are in scope. **Decided 11 Nov 2026: (a)** | **(a) 28, without wireframes (recommended):** they reuse almost nothing and contradict D1(a). **(b) All 29, with wireframes:** a second interaction model. **(c) A narrower set** (the 14, ER, flowchart, C4, BPMN): fastest to a coherent product; cloud, SysML and mindmap users wait |
| D3 | What "supports X" may claim. **Decided 11 Nov 2026: (a)** | **(a) L1, L2, L3 with a conformance note per type (recommended):** honest and testable; more documentation. **(b) A plain list of diagram types:** simpler to market; invites compliance claims that cannot be backed |
| D4 | First milestone. **Decided 11 Nov 2026: the 14 standard UML diagram types**, your own answer; read as all 14 at L2, in stages, before any additional type (§8.1) | **(a) Foundation and class (recommended):** unlocks seven types and the model changes everything else needs. **(b) Sequence first:** very visible, traces become diagrams; proves little of the shared model. **(c) Finish C4** (typed elements, dynamic, deployment): cheapest and serves present users; postpones the hard architecture questions |
| D5 | SysML scope. **Decided 11 Nov 2026: (a)** | **(a) SysML v1.7 notation for the four diagrams, no v2 (recommended):** these four diagram kinds exist only in v1; StarUML's docs name no version. **(b) SysML v2:** a different language (KerML, text, views) with other diagram names; a separate project. **(c) Leave SysML out:** four fewer types |

### Technical

| # | Decision | Options and trade-offs |
|---|---|---|
| D6 | Model vocabulary. **Decided 11 Nov 2026: (a)** | **(a) Keep `nodes`, `edges`, `views` and type them (recommended):** every existing tool works on new types; some names read oddly for UML. **(b) New `elements` and `relationships`:** cleaner terms; forks diff, rules, lenses, MCP and import |
| D7 | Who applies edits. **Decided 11 Nov 2026: (a)** | **(a) Ship `apply()` and a reference store; the host may still decide (recommended):** hosts get 28 types' rules for free; more logic in the library. **(b) Host only, as now:** smallest library; every host rewrites every type's edit rules |
| D8 | Dependencies. **Decided 11 Nov 2026: (a)** | **(a) Core stays dependency-free; optional adapters may have peers (recommended).** **(b) Nothing, ever:** every reader and layout is yours. **(c) Adopt an editor framework:** replaces the renderer, the tests and the accessibility work (§6.2) |
| D9 | Language of new readers. **Decided 11 Nov 2026: (a)** | **(a) JavaScript in the package (recommended):** usable in the browser, a host and MCP; the CLI already runs Node. **(b) Python, as now:** one style; readers unreachable from the module |
| D10 | Cloud icons. **Decided 11 Nov 2026: (a)** | **(a) Fetch and pin on first use, as logos are (recommended, pending the terms in §6.5).** **(b) Bundle:** offline and simple; may breach the owners' terms and bloats the package. **(c) The user supplies the pack:** no legal exposure; worst first run |
| D11 | The single file. **Decided 11 Nov 2026: (a)** | **(a) Split into modules, concatenate for the standalone page (recommended):** reviewable code; one small build step for the CLI. **(b) Keep one file:** no step; a file that grows past 20,000 lines |
| D12 | First text notation. **Decided 11 Nov 2026: (a)** | **(a) Mermaid (recommended):** widest use, a reader exists. **(b) PlantUML:** richer UML coverage; a harder grammar |

## 10. Sources and limits

**The repository.** Read at 449ca99. Run in this analysis: `node --test` (97 tests at 449ca99, 102 at 14e5844; all pass) and a script that
timed `layout()` on four bench models in Node, once each. Not run: the headless-Chrome suites and `bench/bench.py`.
The timings are therefore single cold runs, not benchmarks.

**External sources.** Read on 10 and 11 Nov 2026 through a summarising fetch tool, except the OMG, NIST and Chen
documents, which were read as PDFs. Links are in the text.

**Assumptions**

- Umlimator's present users mostly draw architecture, so C4, flowchart and data flow are worth more to them than
  the rarer UML types (§7.2). No user research backs this.
- One typed vocabulary can carry all six families. The sequence spike in the first milestone tests it.
- The own layout engine can be given variable node sizes and a direction without moving existing pictures. The
  hash checks will say.

**Could not be verified**

- **StarUML:** which SysML, BPMN, ER and DFD notations or versions it follows. Its documentation names none. No
  formal specification of `.mdj` was found beyond the metamodel reference and sample files.
- **Cloud icons:** whether the AWS package carries its own licence file; whether a tool may download the AWS and
  Google packs for its users; Google's icon-specific terms.
- **ISO 5807:** the symbol list (paywalled).
- **XMI:** that interchange between tools is unreliable rests on PlantUML's documentation and the existence of
  OMG's working group, not on a study that could be opened.
- **Libraries:** JointJS+'s UML and ER shape sets; maxGraph's headless use; dagre's lack of ports and orthogonal
  routing (inferred from their absence in its documentation); whether parser generators leave a run-time
  dependency.
- **Clause numbers in §8.5:** 12.3, 15, 17.10, 17.11, 18, 19 and 20 were checked against the specification or are
  cited in this repository's docs. The others (11.2, 11.3, 11.7, 14, 16, 17.8, 17.9) are from memory of the
  specification's structure and were not re-read.
- **Dates:** OMG's pages and PDF covers disagree on the publication dates of SysML 1.7, SysML 2.0 and BPMN 2.0.2.
  This document cites document numbers.

**Not done**

- No code, schema or test was changed.
- No prototype of variable-height layout, ports or the sequence strategy: the sizes in §7 are estimates.
- No legal review of any licence.
