# Milestone 4b design note: BPMN

Status: **approved** by the maintainer 13 Nov 2026, with every recommendation taken; the maintainer approves it before work package 4b.0 starts. Written against `main` at 5f20041
(0.21.0's release merged, #228; stage 5's 5.0 to 5.6 merged, 5.7's trial and 5.8 open, `stage5-followups` open; stage 6's
note being drafted). Symbols are named, not line numbers. Revised after two reviews (13 Nov 2026): decisions 21 to 24
added.

Milestone 4b ships release 0.27.0: the BPMN diagram (`bpmn`, `model.md` row 24) at the elements of BPMN 2.0.2's
Descriptive conformance sub-class (`plan.md` §5, row M4b). Its new engine work: boundary events on an activity's border;
two flow kinds with opposite scope rules (sequence flow inside one pool, message flow between pools). Its reader: BPMN
XML through `bpmn-moddle`, an optional adapter, never a dependency of the module. 0.27.0 is not followed by 1.0.0
(`plan.md` §1): the work goes on in 0.28.0 and later.

The standard is [BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF) (formal/13-12-09), read on 13 Nov 2026: clause
2.2.2, Table 2.1 lists the Descriptive sub-class (24 rows); Table 2.2 the Analytic sub-class's additions; 2.2.3 to 2.2.8
what a Process Modeling claim requires besides (Q12).

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | What 0.27.0 claims | Table 2.1's 24 rows, every listed attribute, plus the Table 2.2 rows the plan and the example already use: the message intermediate catch event, the message intermediate throw event, the timer intermediate catch event, the message boundary event and the timer boundary event, each boundary event interrupting and non-interrupting. Counted here as five rows; the conformance note (4b.5) names each by Table 2.2's own row name, and if the table splits them differently every count of "five" in this note follows the table. The none intermediate throw event is decision 21 (§3.2). The conformance note says "based on BPMN 2.0" until every row of Table 2.1 has its test; then "Descriptive conformance sub-class (BPMN 2.0.2, 2.2.2, Table 2.1)". Never "Analytic" | §3 |
| S2 | The vocabulary of `model.md` row 24 | Kept, with what Table 2.1 asks and the row lacks: `props.documentation` on every element; nested lanes (a lane member's `parent` names a lane of its pool); `props.direction` on an association; `props.dataStoreRef` on a data store reference; `props.processRef` on a pool, kept for the round trip; the event definitions each event kind may take | §3 |
| S3 | Pools and lanes | Stage 4's bands (`src/layout/lanes.js`): a pool is a top-level lane, its lanes nested lanes. An empty row between two pools keeps them apart; each pool's outer edges lie outside the router's lines next to it. `laneBands` gains an optional `runs` (each lane's rows as the type placed them) and counts a box's frame in its rows. The rows themselves come from the type's own lane pass, which keeps a box's block and pins whole (`laneRows` re-rows node by node and would split them, §8.1). Data objects, stores and annotations are drawn in a lane (decision 23). No core byte | §5 |
| S4 | Boundary events | Stage 5's port hook (`LP.ports`, `placePorts` in `src/typed/layout.js`): a boundary event is drawn as a port of its activity, a 32 px circle centred on the border; its lines name it as `fromPort`. A line's new `portMin` gives the port's box its least length along the border, so two boundary events on one side keep apart. The router does not know the 16 px of circle outside the border, so the type gives the layout the activity grown by 16 px on each side that has boundary events and draws it at its own size on the copy (§6.2). Default side: the far side across the flow (bottom, laid out right); a boundary event with a message flow faces that flow's pool; `present.<id>.side` pins it. No core byte | §6 |
| S5 | Message flows to a pool's border, a black-box pool's included | The type puts an invisible anchor node in the empty row beside the target pool, one per column a message flow arrives from, removed from the drawn copy; the line's end is slid onto the pool's border on the copy. No core byte | §7.2 |
| S6 | The two flow kinds' scope rules | Errors in validation, refusals in `connect`: a sequence flow joins two flow nodes of one process at one level (both at a pool's top, or both directly in one sub-process); a message flow joins two different pools, at a pool, an activity, or an event with a message definition that sends (source) or receives (target). A data association keeps BPMN's direction: from a catch event to data, from data to a throw event, either way for an activity. `connect` picks the kind from the ends, with no picker | §7 |
| S7 | Ranking | The type ranks itself (`layout.rank: false`), as the component type does: `cpRank` and `cpPlace` (`src/uml/component.js`, exported by 4b.1) over sequence flows, with boundary events merged into their activity and message flows as ranking links where they close no cycle; lanes then take their rows by the type's own pass, a block and a pin kept whole (§8.1) | §8.1 |
| S8 | Expanded and collapsed sub-processes | Both, as Table 2.1 asks: a sub-process is drawn expanded, as a box holding its flow (stage 2's `boxes`), when the view lists something it holds; else collapsed, with the `+` marker, opening its own view (`opensView`, the view's `subject`). The stage 4 rule for composite states | §8.2 |
| S9 | Labels of events, gateways and data | Outside the shape, under it by default, placed after the layout by a search of the type's own in `src/bpmn/notation.js` (4b.2), modelled on the end labels' search (`endLabels`, `src/typed/draw.js`: stepping outwards until clear of lines, nodes and labels placed before). `endLabels` itself cannot be reused: it reads `e.end.labels`, places one-line 10 px text at a line's end and runs inside `TYPED.lines`. 2.2.3 lets text positions vary. Wrapped to two lines of 120 px | §9.2 |
| S10 | Which map shapes BPMN reuses (the maintainer's rule of 13 Nov 2026) | The data store reuses the map's `cylinder` outline and inset with the typed look's own paint. The data object does not reuse `document`: its rounded bottom corners are a change of shape 2.2.3 forbids; BPMN's own page is drawn. Every other BPMN shape is BPMN's | §9.1 |
| S11 | Groups | Drawn after the layout, under everything, as a dashed rounded rectangle round the nodes that name it (`props.categoryValueRef`), 16 px out; added back as a node on its border and title for selection. Not a box: a group crosses pools and lanes | §9.3 |
| S12 | Editing | Hooks only, no core byte: `connect` (the kind by scope, S6), `moveTo` (a lane or pool by drop, a boundary event's side by Alt + arrows or a drop on another activity's border), `add`, `remove`, `rename`, `key` (`A` attaches a boundary event by a picker of activities; `X` expands or collapses a sub-process in the view, since `E` is the canvas's unfold, #71: decision 22), `owners`. Lanes are members: Delete deletes one and moves what it held to its parent, as stage 4's partitions | §11 |
| S13 | The BPMN XML adapter | `src/readers/bpmn-xml.js`, internal as every reader: `readBpmnXml(xml, moddle)` and `writeBpmnXml(model, viewId, geo, moddle)`, where `moddle` is a `bpmn-moddle` instance the caller made. The module never imports it; `package.json` gains no dependency of any kind. `umlimator.py import` routes `.bpmn` to it and a new `umlimator.py export --format bpmn` writes it, both through Node with `bpmn-moddle` resolved from the user's folder, or a message naming `npm install bpmn-moddle@10.3.1`. CI installs it with `--no-save` in a scratch folder and passes that folder to the tests and the CLI by an environment variable (Node's `import` ignores `NODE_PATH`); how the whole dependency tree is pinned is decision 24. The reader parses through moddle, not by hand: a departure from `risks.md` R2, stated (§12.2, §16) | §12 |
| S14 | What the reader keeps | Positions are not kept (`risks.md` R5), said once per file; a conditional or default sequence flow is read as a plain one and a send or receive task as a plain task, the rest kept under `ext.bpmn` and reported as weakened; any other element outside S1's subset is reported and kept under `ext.bpmn` as moddle's JSON, not written back; an id that is not an XML name is written escaped, with the model's id in an `umlimator:id` attribute the reader reads back | §12 |
| S15 | The core's budget (C5) | Milestone 4b's share is 700 B (the maintainer's split of 13 Nov 2026). The plan spends none: everything is in family files. A byte the spike shows is needed is stated in its pull request against that share | §2.3 |
| S16 | P1 | `repair: false` and `reroute: false` on every layout; CPU, best of N after a warm-up; CI holds a 1 s ceiling and prints each common edit against the 100 ms target; the timed tests are titled " (timed)" and run serially. 4b.1's spike measures a view of 60 flow nodes, three pools, six lanes, ten boundary events and two expanded sub-processes before 4b.3 draws | §14 |
| S17 | The Bookshop atlas | The example joins the atlas (the maintainer's rule of 13 Nov 2026) with its 15 colliding ids renamed, every reference to them with them (Q10, §13), and the use case "Track order" opens it | §13 |
| S18 | Order with stages 5 and 6 and the other milestones | Code starts when this note is approved and stage 6's code lanes are scheduled, within the project's four to five open code lanes: 4b.4 first (it shares no file with stage 6), 4b.2 beside it (it shares only `tests/embed.py`'s append with 6.3, 6.5 and 6.6, rehearsed by X2), 4b.1 after `stage5-followups` and 5.8 merge (it shares `src/typed/draw.js`'s `ENDS` with 6.3, rehearsed); 0.27.0 after 0.26.0 | §15.3 |
| S19 | Departures | Stated in §16: a gateway or event label's place; the data object's paint; a message flow drawn into a pool's border at the column it comes from; anchors; the reader's parser (R2) | §16 |

What is left out is in §16.

## 2. Where milestone 4b starts

### 2.1 What it builds on, and what is BPMN's alone

| Piece | Built in | Shared as it is | BPMN only |
|---|---|---|---|
| Flow shapes: the rounded box, the diamond | Stage 4, `src/uml/flow.js` (4.2) | `SHAPE.rounded`'s size and outline for a task; the diamond's outline and inset for a gateway | A gateway is a fixed 40 px diamond with a marker, its name outside (S9); a task's markers (user, service); a call activity's thick border; the `+` of a collapsed sub-process |
| The line end slide onto an outline | Stage 4, `TYPED.lines` (4.1) | As it is: every BPMN shape gives `out` and `inset` | |
| Lanes | Stage 4, `src/layout/lanes.js` (4.3), used by the activity type (4.5) | `laneRows`'s order of lanes, `laneBands`' bands and header strips, `SHAPE.partition`'s header look | Pools: top-level lanes with a gap between them and outer edges past the router's lines; `laneBands`' `runs` and boxes (S3); message flows across the gap |
| Partitions out of the layout, added back after | Stage 4 (4.5, §5.3) | The same for pools, lanes and groups | Lanes are members of a pool, not nodes (rule 3) |
| Boxes | Stage 2 (`boxes`, `blockPos`, `frameOf`), deepened in stage 5 | An expanded sub-process is a box; a boundary event on its border is a port on a box (stage 5 placed ports on boxes) | A box inside a lane's band (Q14) |
| Ports on borders | Stage 5, `placePorts` and `TYPED.frame` (5.1), `portSides` and `portsDrawn` (5.3) | The hook places a boundary event's line ends on its activity's border, groups and orders them; the overlap check skips a node against its `owner` (decision 22, in `stage5-followups`) | A boundary event is a model node with `attachedTo`, not a member; it is a 32 px circle, not a 12 px square, so its box needs `portMin`; it has no line in (a port has both) |
| Own ranking with blocks | Stage 5, `cpRank`, `cpPlace` (5.4) | Longest paths, `untangle`, `rowsFor`, pins kept, blocks for boxes | Boundary events merged into their activity; message flows as soft links; lanes taking rows after it |
| Drill-down | Stage 4's call behaviour action, the map's `opensView` | A collapsed sub-process opens its view; a call activity may | |
| Hooks | Stages 3 to 5 (`src/typed/edit.js`) | `connect`, `moveTo`, `add`, `remove`, `rename`, `key`, `{ pick, then }`, `at.geo` | |
| PDF tables | Stage 4 (4.9) | `word` and `rows` | |

Stage 5 compared. A UML port is a member of its owner, with no position in the model and lines in both directions; it is
drawn by the hook as a square half inside its owner. A BPMN boundary event is a flow node of its own (`attachedTo`), with
outgoing sequence flows only (and message flows when it catches a message); it is drawn by the same hook as a circle half
inside its activity. The layout never sees it as a node: its lines leave from its activity's border at its place. What
stage 5 settled for ports (the side chosen before the layout, the order by far ends, the ends of one port side by side,
the narrowing to 4 px and the warning, the copy after the layout) holds for boundary events unchanged.

### 2.2 What was read at 5f20041

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | `laneRows`, `laneBands`, `laneRuns` (`src/layout/lanes.js`) | A lane list `[{ id, parent, order }]` nests any depth; an empty lane keeps one row; a lane's own nodes take rows before its nested lanes'. `laneBands` finds each lane's rows again by counting `g.nodes` per column (`laneRuns`), and measures each row's extent from nodes only: a box's frame (`g.families`) is not seen. `laneRows` re-rows each column node by node, sorted by lane segment: it would split a box's block and move a pin's row. `laneRuns` puts a node in no lane in a segment after every lane, below all pools | S3, §5, §8.1 |
| Q2 | The activity type (`actGeo`, `acFinish`, `src/uml/activity.js`) | Ranked by the host (`autoPos`), lanes by `laneRows`, partitions left out of the layout and added back as header nodes (`aside: true`), the header room made by moving the bands back by `shift` | §5.3 |
| Q3 | `placePorts` and `spreadPorts` (`src/typed/layout.js`) | An end with `fromPort` or `toPort` is placed on the side the type gave (`fromSide`, `toSide`); a port's box is 12 px across and `2 + 10 k` along for `k` lines on a face, 8 px between ports (down to 4, then a warning). It works on a node and on a box. It runs after the router: the router routes to the node's border and never sees a port's box (`e.fpb`, `e.tpb`) | S4, §6 |
| Q4 | `overlapIssues` (`src/layout/audit.js`) | On `main` a port over its owner is reported. `stage5-followups` adds the skip of a node against the node its `owner` names (decision 22 of stage 5), about 20 B, open | §6, §15.3 |
| Q5 | `ENDS` and `TYPED.lines` (`src/typed/draw.js`) | `none`, `arrow` (filled), `open`, `triangle` (hollow), `diamond`, `filled-diamond`, `socket`. No open circle. `e.end.dashed` is a boolean, drawn `6 4`: no dotted line | §10 |
| Q6 | `SHAPE` (`src/draw/shapes.js`) | The map's 13 shapes. `cylinder` is BPMN's data store. `document` has 10 px rounded bottom corners and a folded top right: BPMN's data object has square corners | S10 |
| Q7 | `cpRank`, `cpPlace` (`src/uml/component.js`) | A self-ranking with boxes as blocks, pins kept and a node a pin would cover moved down. Neither is exported (`export { CP_TYPE, … }`) | S7 |
| Q8 | The readers and the adapters | The three Mermaid readers are synchronous, internal, in `lib/umlimator-all.js`; `umlimator.py import` routes a Mermaid source by its kind (`mermaid_typed`) through Node. `lib/umlimator-markdown-it.js` takes the host's markdown-it (`md.use`), importing nothing: the precedent for an injected library. `package.json` has no `dependencies`, `peerDependencies` or `devDependencies`, and the repository no lock file | S13 |
| Q9 | `bpmn-moddle` on npm (`npm view`, 13 Nov 2026) | 10.3.1, published 21 Sep 2026, MIT, an ES module; depends on `moddle ^8.2.1`, `moddle-xml ^12.3.1`, `min-dash ^5.1.0` by caret ranges, and `moddle-xml` on `saxen ^11.2.0`: five packages. `moddle-xml` 12.3.2 (30 Oct 2026) already differs from the 12.3.1 named. `fromXML` returns a promise | S13, §12 |
| Q10 | The atlas against `24-bpmn.json` (`tools/atlas.mjs`, `examples/bookshop-atlas.json`) | 14 of the example's ids are other elements there: `shopper` and `payment-provider` (`uml.Actor`), `bookshop` (`uml.Subject`), `sales` (`uml.Package`), `order` (`uml.Class`), `stock` (`uml.DataStoreNode`), `ship` (`uml.Action`), and seven flows (`f-charged`, `f-paid`, `f-declined`, `f-to-pick`, `f-packed`, `f-wait`, `f-done`, `uml.ControlFlow`); and `take-payment` is a view's id there. The build would stop on each | S17 |
| Q11 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 185,136 B at 5f20041. The cap is 189,697 B | §2.3 |
| Q12 | BPMN 2.0.2, clause 2.2 | Table 2.1 (Descriptive): participant (pool), laneSet, unconditional sequence flow, message flow, exclusive and parallel gateway, task (None), user task, service task, sub-process expanded and collapsed, call activity, data object, text annotation, association and data association, data store reference, none start and end events, message start and end events, timer start event, terminate end event, documentation, group. Boundary events and intermediate events are Table 2.2's (Analytic). 2.2.3: the standard's shapes and markers, with flexibility in size, colour, line style and text position; an extension shall not change a shape (rounded corners to square). 2.2.6: every mandatory attribute can be created and displayed. 2.2.8: interchange "should" be supported | S1, S9, S10, §12 |
| Q13 | `model.md` row 24 against Table 2.1 | The row lacks documentation, nested lanes, an association's direction, a data store's `dataStoreRef`, a pool's `processRef`; it has five rows of Table 2.2 | S1, S2 |
| Q14 | `frameOf` and the lanes' dividers | A box takes 38 px above its cards (14 and the 24 px title) and 30 below; a divider lies `rgap / 2 - 12` px before a lane's first row, 44 px past the row before at an `rgap` of 64. One level of box fits a lane; a box in a box (12 px more) nearly touches; deeper ones cross | §5.2, §8.2 |
| Q15 | The hooks (`src/typed/edit.js`) | `key` hears a key with no modifier before the canvas, only where the host offers `rename`; `moveTo` gets `at.geo`; `{ pick, then }` opens a picker. The canvas (`src/canvas/render.js`) binds `E` to "unfold here, or fold back" (#71) in every mode; the letters the canvas and the typed editor bind are `E F L N O P V W`, so `A` and `X` are free | §11 |
| Q16 | `umlimator.py` | `import` reads Structurizr, PlantUML, Mermaid, Compose and Kubernetes; there is no `export` command | S13 |

### 2.3 The core's budget (C5, S15)

The cap is 189,697 B (0.16.0's 164,954 B plus 15%). Measured at 5f20041 the core is 185,136 B, so 4,561 B are left (the
figure `stage-6.md` uses). The maintainer split 4,451 B of it on 13 Nov 2026 (stage 6 400 B, M2 1,400 B, M3 500 B, M4a
700 B, M4b 700 B, a reserve of about 750 B); that split is given in the maintainer's instructions and recorded in no
document on this branch, so §18 asks the lead to log it in `docs/diagrams/README.md`. Milestone 4b's share is 700 B.
Nothing in this note needs the core:

- the boundary events' placement is `placePorts` (`src/typed/layout.js`), with one more line field;
- the circle end and the dotted line are `src/typed/draw.js`'s;
- pools, lanes, `runs` and boxes in the bands are `src/layout/lanes.js`'s;
- the overlap check's skip of a node on its owner is stage 5's (decision 22, in its own share);
- every shape, rule, hook, the ranking, the anchors, the groups and the reader are in family files listed in `ALL` only.

| Option | For | Against |
|---|---|---|
| **(a) Plan 0 B; a byte a spike shows is needed is stated in its pull request against the 700 B share; anything past it asks the maintainer (recommended)** | The share stays whole for what the spike finds; the reserve gains what is left at 0.27.0 | None found |
| (b) Hand the share back to the reserve now | More reserve | A finding in 4b.1's spike would wait for the maintainer |

### 2.4 Rules every package keeps

- **Maps draw exactly as now.** The geometry hashes (`bench/expected.json`), the examples' stills and every map test are
  unchanged in every pull request. Every new branch is reached only through a field no map sets (`portMin`, `runs`, a
  `dashed: 'dot'` line, the `circle` end).
- **Every typed example draws exactly as now.** `tests/core-diet.html`, `tests/core-diet.json` and each type's tests are
  unchanged. The activity type passes no `runs` and has no boxes, so its bands do not move.
- **The API is additive only.** The type and the adapter are internal, in `lib/umlimator-all.js`; `portMin` and `runs` are
  optional and provisional; `umlimator.py export` is a new command.
- **Nothing after `layoutTyped` edits what it returned** (stage 4 §2.4): pools, lanes, groups, boundary events, labels
  and anchors are put on a copy. A test lays a view out twice from one memo and checks the two pictures are byte-identical.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1, S2)

### 3.1 The row

| `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|
| `bpmn` | `bpmn.Participant`, `bpmn.Task`, `bpmn.SubProcess`, `bpmn.CallActivity`, `bpmn.StartEvent`, `bpmn.EndEvent`, `bpmn.IntermediateCatchEvent`, `bpmn.IntermediateThrowEvent`, `bpmn.BoundaryEvent`, `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway`, `bpmn.DataObject`, `bpmn.DataStoreReference`, `bpmn.TextAnnotation`, `bpmn.Group` | `bpmn.Lane` (of a participant) | `bpmn.SequenceFlow`, `bpmn.MessageFlow`, `bpmn.Association`, `bpmn.DataAssociation` | Every element: `props.documentation`, text. Participant: `props.processRef`, the process's id when it is not `<participant>-process`. Lane: its `parent` is another lane of the same participant (nested) or none. A flow node's `parent` is its innermost lane, its participant (a pool with no lanes), its sub-process, or none (a process diagram). Task `props.taskType`: `none`, `user`, `service`. Event `props.definition` by kind (§3.2). Boundary event: `props.attachedTo` (an activity), `props.cancelActivity` (default true). Call activity: `props.calledElement`, text. Data store reference: `props.dataStoreRef`, text. Association: `props.direction`: `none` (default), `one`, `both`. A flow node, data object or annotation names the groups it is in with `props.categoryValueRef`. Data objects and data stores sit in a pool (`parent`) or none; they are in no lane. A sequence flow's or message flow's `label` is its name; a text annotation's `label` its text. The view inside a collapsed sub-process names it as `subject` |

Table 2.1's rows, and where each is in the model:

| Table 2.1 | Attributes it lists | In the model |
|---|---|---|
| participant (pool) | id, name, processRef | `bpmn.Participant`: `id`, `label`, `props.processRef` |
| laneSet | id, lane with name, childLaneSet, flowElementRef | `bpmn.Lane` members, their `label`; nesting by the member's `parent`; a flow node's `parent` (the laneSet's id is derived, `<participant>-lanes`) |
| sequenceFlow (unconditional) | id, name, sourceRef, targetRef | `bpmn.SequenceFlow`: `id`, `label`, `from`, `to` |
| messageFlow | id, name, sourceRef, targetRef | `bpmn.MessageFlow`, the same |
| exclusiveGateway, parallelGateway | id, name | `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway` |
| task (None), userTask, serviceTask | id, name | `bpmn.Task` with `taskType` `none`, `user`, `service` |
| subProcess (expanded), (collapsed) | id, name, flowElement | `bpmn.SubProcess`; its flow elements by `parent`; expanded or collapsed per view (S8) |
| CallActivity | id, name, calledElement | `bpmn.CallActivity`, `props.calledElement` |
| DataObject | id, name | `bpmn.DataObject` (the XML's data object reference and its data object, §12) |
| TextAnnotation | id, text | `bpmn.TextAnnotation`, `label` |
| association/dataAssociation | id, name, sourceRef, targetRef, associationDirection (association only) | `bpmn.Association` (`props.direction`), `bpmn.DataAssociation` (its direction is `from` to `to`) |
| dataStoreReference | id, name, dataStoreRef | `bpmn.DataStoreReference`, `props.dataStoreRef` |
| startEvent (None), endEvent (None) | id, name | `definition: "none"` |
| messageStartEvent, messageEndEvent | id, name, messageEventDefinition | `definition: "message"` |
| timerStartEvent | id, name, timerEventDefinition | `definition: "timer"` |
| terminateEndEvent | id, name, terminateEventDefinition | `definition: "terminate"` |
| documentation | text | `props.documentation` on any element |
| Group | id, categoryRef | `bpmn.Group`; members name it in `props.categoryValueRef` (the category and its value are derived in the XML, §12) |

| Option, documentation | For | Against |
|---|---|---|
| **(a) `props.documentation`, text, on every element: the panel shows and edits it, `describe()` and the PDF's rows print it (recommended)** | A type reads its own `props` only (`model.md` rule 2); 2.2.6 needs it created and displayed | One more field in every properties form |
| (b) The generic `what` | Already on every card | Rule 2: a type does not interpret the generic fields; a map's `what` means something else |

### 3.2 Event definitions by kind

| Kind | Definitions | Table |
|---|---|---|
| Start event | `none`, `message`, `timer` | 2.1 |
| End event | `none`, `message`, `terminate` | 2.1 |
| Intermediate catch event | `message`, `timer` | 2.2 |
| Intermediate throw event | `message`; `none` only if decision 21 takes it | 2.2 |
| Boundary event | `message`, `timer`; `cancelActivity` false is non-interrupting | 2.2 |

The none intermediate throw event (a milestone marker, met in real files) is outside S1's five rows. Allowing it, as the
first draft did, would create and write an element outside the stated claim.

| Option, the none intermediate throw event (decision 21) | For | Against |
|---|---|---|
| **(a) A sixth extra, named in S1, §15.5, §16 and the release notes (recommended)** | Files that mark milestones with it read whole; drawing it costs nothing (a double ring with no marker) | The claim names one more extra |
| (b) Left out: `event-definition` refuses it, the reader reports it skipped and keeps it under `ext.bpmn` | The claim stays at five extras | Such a file loses its milestones and the sequence flows through them, so the process reads broken (`flow-start` warns) |

| Option, the claim (S1) | For | Against |
|---|---|---|
| **(a) Table 2.1 whole, and the five Table 2.2 rows above (recommended)** | The plan's boundary events and `24-bpmn.json` keep their meaning; the claim stays Descriptive, with the extras named | A claim that names extras is longer to state |
| (b) Table 2.1 only | The smallest claim | The plan names boundary events as this milestone's engine work; the example loses its timeout and its timer and message events |
| (c) Table 2.2 whole (Analytic) | A larger claim | Some 40 more rows: conditional and default flows, send and receive tasks, loops, multi-instance, inclusive and event-based gateways, link, signal, error, escalation and conditional events. The scope creep `proposal.md` §3.3 warns of |

What changed against `model.md`: S2's fields; the definitions per kind; data objects and stores in no lane; a lane's
nesting; the extras marked as Table 2.2's. `24-bpmn.json` keeps its shape and gains `documentation` on two elements and a
nested lane, so every row is exercised; its ids change when it moves (§13).

## 4. Validation

Rules, each with a passing and a failing fixture; a model BPMN forbids is an error, an unfinished one a warning (stage
4's S21).

| Rule | Level | Says |
|---|---|---|
| `sequence-scope` | error | A sequence flow joins two flow nodes of one pool (or both outside every pool) and one level: both directly in the same sub-process, or both at the process's top |
| `sequence-ends` | error | A sequence flow's ends are flow nodes (activities, events, gateways); never a pool, lane, data, annotation or group. A start event has no incoming sequence flow, an end event no outgoing, a boundary event no incoming |
| `message-scope` | error | A message flow joins two different pools: its ends lie in, or are, different participants. A model with no participant has no message flow |
| `message-ends` | error | A message flow's source is a pool, an activity, a message end event or a message throw event; its target a pool, an activity, a message start event, a message catch event or a message boundary event |
| `event-definition` | error | An event's `definition` is one its kind may take (§3.2); `cancelActivity` is on a boundary event only |
| `boundary-host` | error, warning | Error: `attachedTo` names an activity (task, sub-process, call activity) of the model. Warning: the boundary event's `parent` is not its activity's (it is drawn on the activity regardless) |
| `boundary-out` | warning | A boundary event has an outgoing sequence flow (a message boundary event may instead have only a message flow out) |
| `flow-start` | warning | A process (a pool's flow, or a sub-process's) with flow nodes has a start event, and an end event; an activity other than one with a boundary event's flow in has an incoming sequence flow (`bpmnlint`'s "no disconnected", as a warning) |
| `gateway-flows` | warning | A gateway with one incoming and one outgoing flow does nothing (`risks.md` §6's "a gateway with one exit"); a diverging exclusive gateway's flows out each carry a name |
| `lane-owner` | error | A lane's `parent` is a lane of the same participant; a flow node's `parent` is a lane, a participant, a sub-process or none; a data object's or store's a participant or none |
| `in-lane` | warning | In a pool that has lanes, every flow node is in one |
| `data-ends` | error | A data association joins a data object or data store reference with an activity or an event, in BPMN's direction: a catch event (start, intermediate catch, boundary) has data outputs only, so its line goes event to data; a throw event (end, intermediate throw) has data inputs only, so its line goes data to event; an activity either way. Failing fixtures: data to a start event; an end event to data. An association has a text annotation at one end at least |
| `group-ref` | warning | Every `categoryValueRef` names a `bpmn.Group` |
| `opens-view` | warning | A collapsed sub-process's or a call activity's `opensView` names a `bpmn` view; a sub-process's own view names it as `subject` |

`flow-start` and `gateway-flows` take their wording from `bpmnlint` (MIT, `proposal.md` §6.4) as a source of rules, not a
dependency.

## 5. Pools and lanes (S3)

### 5.1 Options

| Option | For | Against |
|---|---|---|
| **(a) Stage 4's bands: a pool is a top-level lane, its lanes nested lanes; an empty row between two pools; each pool's outer edges past the router's lines beside it (recommended)** | Reuses `laneRows`, `laneBands` and the header strip; pools as BPMN draws them, as long as the diagram; message flows cross the empty row; no core byte | Two additions to `lanes.js` (5.2); the empty row is as tall as a row gap and its row (about 66 px at an `rgap` of 64) |
| (b) Pools as stage 2's boxes, lanes as bands inside each | A pool is a box the router knows | Boxes are ranked by the lines between them (stage 4 §5.1, option b): a collaboration's pools would be placed one after another, not stacked; a box is as long as its content |
| (c) One band set with no gap between pools | No empty row | A message flow would run along the divider between two pools; BPMN separates pools |

### 5.2 What `lanes.js` gains (4b.1)

- **`runs`.** `laneBands(g, lanes, laneOf, turned, rgap, runs)`: `runs`, when given, is `{ laneId: [first, last] }`, each
  lane's rows as the type placed them; `laneBands` then skips `laneRuns`' count. The BPMN type places its own rows (S7)
  and a box spans rows the count cannot see. Absent, as now: the activity type does not change. As built (4b.1): a lane
  with no run takes its nested lanes' rows (a pool's band from its lanes'), and a lane with neither has no band; a run that
  is not `[first, last]` with `0 <= first <= last` counts as none.
- **Boxes in the rows.** When `g.families` is not empty, a box's frame counts toward the extent of its first and last
  content row, so a divider is never drawn across an expanded sub-process (Q14). The activity type has no boxes.
- The empty row between two pools is a run of its own in `runs`, with no band; the type draws no band for it.
- The rows in `runs` are the type's (§8.1), never `laneRuns`' count, so an item in no lane is never put below every pool.

### 5.2a Data objects, stores and annotations in a pool with lanes (decision 23)

In the model they sit in a pool, in no lane (§3.1). `laneRuns` would put them in the segment after every lane, below all
pools, and `cpPlace` packs items no sequence flow reaches under its block; either way they leave their pool's band. The
type decides their drawn lane (its `laneOf`); their `parent` does not change.

| Option | For | Against |
|---|---|---|
| **(a) Drawn in the lane of the first flow node they are associated with (by the lines' order), in that column's next free row; with no association, in a run of the pool's own after its lanes (recommended)** | Data sits beside the activity that reads or writes it, as BPMN tools draw it; nothing leaves its pool | A data object shared by two lanes is drawn in the first one's |
| (b) Always in a run of the pool's own after its lanes | One rule | Data drawn far from its activities; association lines cross every lane between |

- A pool's band is grown on its outer edges to 12 px outside the router's line in the gap beside it (laneBands' own
  edges lie 12 px inside it): a sequence flow running along that line stays inside its pool. Done by the type on its copy,
  where the empty row leaves room; the fixtures check that no sequence flow leaves its pool's band (§13).

### 5.3 Drawing and selecting

As stage 4's partitions (§5.3 there): pools are left out of the layout and added back as header nodes on their strips
(`aside: true`), and lanes too, under their member ids (a box whose id is a member's, stage 4 §6.3, is the precedent).
A pool's header is 22 px per level of nesting, its name turned when laid out right (`SHAPE.partition`'s look); the
pool's outline is drawn 1.5 px, a lane's divider 1 px. A black-box pool (a participant with no flow node shown) is a band
of one empty row, 120 px across at least (stage 4's empty lane), its name in its header.

| Option, the gap between pools | For | Against |
|---|---|---|
| **(a) One empty row (recommended)** | No change to the layout; the row holds the message flow anchors (§7.2) | About 66 px a gap |
| (b) A per-gap row height | Tighter | Typed rows are as tall as their tallest node (`TYPED.rows`): a gap's height would need a new field in the layout's rows |

## 6. Boundary events (S4)

### 6.1 Options

| Option | For | Against |
|---|---|---|
| **(a) Stage 5's port hook: a boundary event is a port of its activity, its lines naming it (`fromPort`); a 32 px circle centred on the border; `portMin` so the port's box is 32 px along the border at least (recommended)** | The router routes its lines from the border, as BPMN draws them; ordering, spreading, narrowing and the warning come from 5.1; no core byte; a boundary event on an expanded sub-process is a port on a box, which 5.1 tested | A boundary event with no line takes its place from the type, after the layout (5.3's ports with no line) |
| (b) A node of the layout beside its activity | Nothing new | Not BPMN: a boundary event sits on its activity's border, and moves with it (`risks.md` §6) |
| (c) Drawn by the type over the border after the layout, its lines leaving the activity's box | No layout change | The router does not know the circle: a line may leave from inside the activity or under another event |

### 6.2 How it works

- **Out of the layout.** The type leaves boundary events out of the nodes it lays out. Each line from (or a message flow
  to) a boundary event goes to the layout as a line of its activity with `fromPort` (`toPort`) the boundary event's id,
  `fromSide` (`toSide`) its side, `portRank` its place among the activity's boundary events, and `portMin: 32`.
- **`portMin` (4b.1, `src/typed/layout.js`).** In `spreadPorts`, a group's length along the border is the larger of
  `2 + 10 k` and the line's `portMin` (a number, or `[from, to]`). It joins `EDGE_GEO`. A map never sets it.
- **Side.** `present.<id>.side` when the view gives it; else the side across the flow away from the flow's start (the
  bottom laid out right, the right laid out down), BPMN's habit; a boundary event with a message flow takes the side
  facing the other end's pool. Every line of it gets that side; the hook never moves it (5.1).
- **Size.** The activity is sized so its boundary events fit: on each side, `16 + Σ (32 + 8)` px at least, as stage 5
  sizes a node for its ports (§4.1 there).
- **Room for the circle.** `portMin` sets the port's box along the border only; across it the box stays 12 px, and the
  router never reads port boxes anyway (Q3), while the circle reaches 16 px outside the activity. So the type gives the
  layout the activity grown by 16 px on each side that holds a boundary event, and on the copy draws the activity at its
  own size inside that box: the router keeps its lines off the whole circle, and the lines' ends already lie on the
  circle's outer side. No engine field. 4b.1's spike counts lines that cross a boundary circle (§14); the fixtures'
  "no line through a node" covers the circles, which are on the copy's `nodes`. As built (4b.1's spike): a box (an
  expanded sub-process) cannot be grown on one side by its size, so the stand-in gives a box with boundary events a `pad`
  of 28 (16 px more than stage 2's 12 on every side) and on the copy draws its frame 16 px in on each side that holds one;
  the circle is then on the drawn frame and the contents keep 12 px of padding there.
- **Drawn** on the copy: a 32 px circle centred on the port's box, double ring, dashed when non-interrupting
  (`cancelActivity: false`), with its definition's marker; its lines' ends slid onto its outer face; its label by S9's
  search. One with no line is placed on its side's free span by its place among its activity's boundary events, as 5.3
  places a port with no line.
- **Selected** as a node: it is added to the copy's `nodes` and `byId` with `owner` set to its activity, so a click, F2,
  Delete and `L` reach it, and the overlap check skips it against its activity (Q4).
- **It moves with its activity**, since it is placed from it: the fixture pins the activity, lays out, moves the pin, and
  checks the circle is on the border both times.

## 7. The two flow kinds (S5, S6)

### 7.1 Scope, in rules and gestures

The rules are §4's `sequence-scope`, `sequence-ends`, `message-scope` and `message-ends`. `connect` applies them before it
emits:

- both ends in one pool and one level: a sequence flow;
- ends in two pools: a message flow, if `message-ends` allows its ends, else refused ("A message flow cannot start at a
  start event");
- a data object or data store at one end: a data association, the other end an activity or event, if `data-ends`'
  direction allows it, else refused ("A start event only gives data: draw the line from the event to the data"); a text
  annotation at one end: an association;
- anything else refused with the rule's words ("A sequence flow cannot leave its pool: use a message flow between
  Bookshop and Shopper's pools", `risks.md` §6's "a flow that would leave its pool (refused)").

| Option, choosing the kind | For | Against |
|---|---|---|
| **(a) By the ends, no picker (recommended)** | Only one kind is ever valid between two given ends; one gesture | A user cannot draw a wrong flow to fix later |
| (b) A picker of the four kinds on every connect | The palette's lines stay meaningful | A step for nothing: three of four picks are refused |

Drawn: a sequence flow solid with a filled arrowhead (`arrow`); a message flow dashed, an open circle at its source
(`circle`, new) and a hollow triangle at its target (`triangle`); an association dotted (`dashed: 'dot'`, new), with open
arrowheads by `direction`; a data association dotted with an open arrowhead at its target.

### 7.2 A message flow to a pool's border (S5)

A message flow whose end is a participant ends on that pool's border, at the column it comes from, as BPMN tools draw it.
The router ends lines on nodes, and a pool is not one.

| Option | For | Against |
|---|---|---|
| **(a) An anchor: an invisible 2 px node in the empty row beside the target pool, on the source's side, one per column a message flow to that pool arrives from; the router routes to it; on the copy, the anchor is dropped and the line's end slid onto the pool's border (recommended)** | Routed like any line, straight across the gap where it can be; two flows from one column share an anchor and keep apart (F2); no core byte | An anchor id must never be a model id: it is `\u0000` and the pool's id and column, as the communication type's stacks (`CM_STACK`) |
| (b) The type draws the line after the layout, straight from the source to the border | No anchors | Routed by nothing: it may cross nodes of the pool between |
| (c) A black-box pool as a node | The router knows it | BPMN draws it as a band across the diagram |

### 7.3 A message flow between activities

Routed as any line: its ends are on the activities' borders, the side toward the other pool. With both flags off (S16)
a message flow may cross lane dividers and sequence flows on its way; the fixtures pin it.

## 8. Placement

### 8.1 Ranking (S7)

| Option | For | Against |
|---|---|---|
| **(a) The type ranks itself (`layout.rank: false`): `cpRank` and `cpPlace` over sequence flows, a boundary event's flows counted from its activity, message flows as links where they close no cycle, an expanded sub-process a block; then each lane takes the rows its items need in each column, pools apart by an empty row, and the type gives `runs` to `laneBands` (recommended)** | The component type's code (5.4), exported, not copied; pins kept; message flows pull the pools' columns into line; one ranking for blocks and lanes | Two exports added to `src/uml/component.js` (4b.1, one line); a lane pass of the type's own (below) |
| (b) The host's ranking (`autoPos`), as the activity type | No ranking code | `autoPos` ranks `nodeIds` by the lines between them (stage 5 Q11): pools and boundary events would be ranked as nodes, a black-box pool as a card |

The lane pass is the type's own (`src/bpmn/process.js`, 4b.3), not `laneRows`. `laneRows` re-sorts each column node by
node by lane segment: it would split an expanded sub-process's block, put other nodes of its lane between the block's
contents (the frame then overlaps them), and move a pin's row. The type's pass works on `cpPlace`'s top-level items:

- a block (an expanded sub-process) is one item, `h` rows tall in every column it spans; its contents keep their rows
  relative to its first row;
- in each lane, the items keep `cpPlace`'s order and relative rows; the lane is moved as a whole to its run, after the
  runs of the lanes before it (nested lanes as `laneOrder` gives them), and its run is as many rows as its items need in
  its fullest column;
- a pin in a pool with lanes is an order inside its lane, as stage 4 §5.2 rules for the activity type; a pin in a view
  with no lanes keeps its row;
- data objects, stores and annotations take the lane decision 23 gives them;
- the result is `runs` for `laneBands` (§5.2).

4b.3 tests it: a block in a lane with another node of that lane in the block's columns, both directions, the frame
overlapping nothing; a pinned node in a lane; a data object in a pool with lanes inside its pool's band.

### 8.2 Expanded and collapsed sub-processes (S8)

| Option | For | Against |
|---|---|---|
| **(a) Expanded, a box, when the view lists something it holds; else collapsed, with `+`, opening its view (recommended)** | Table 2.1 lists both; the stage 4 rule for composite states; nothing new stored; a key toggles it by changing the view's `nodeIds` (decision 22) | A box in a lane: one level fits a band, deeper ones are checked (Q14) |
| (b) `present.<id>.expanded` | Explicit | A second way to say what `nodeIds` says |
| (c) Collapsed only, its inside in its own view | No box in a lane | Table 2.1's "subProcess (expanded)" missing: no Descriptive claim |

A box in a band keeps to its lane: its contents are in its lane by rule (a flow node in a sub-process is in the
sub-process's lane), the box is one block in `cpPlace` and in the type's lane pass (§8.1), and `laneBands` counts its
frame (§5.2). A boundary event on an
expanded sub-process is a port on its box. Its contents' sequence flows stay inside it (`sequence-scope`).

## 9. Notation

### 9.1 Shapes

Each is a `SHAPE` entry in `src/bpmn/notation.js` with `size`, `out`, `inset` and `draw`, a hit area of 24 px at
least, strokes `--um-muted`, fills the stage's background; text cut with `fit`.

| Shape | For | Drawn |
|---|---|---|
| `bpmn-task` | Task, sub-process (collapsed), call activity | `SHAPE.rounded`'s size and outline, 100 × 64 px at least; its name centred, wrapped to three lines. A user task's figure, a service task's gear, 14 px at the top left; a collapsed sub-process's `+` in a 12 px square at the bottom centre; a call activity's border 3 px |
| `bpmn-frame` | Expanded sub-process (a box) | A rounded rectangle, its name at the top left in the 24 px title room |
| `bpmn-event` | Start, intermediate, end, boundary | A 32 px circle: start 1.5 px, intermediate and boundary a double ring, end 3.5 px; a non-interrupting boundary event dashed. Markers 16 px: an envelope (filled when it throws), a clock, a filled circle (terminate) |
| `bpmn-gateway` | Exclusive, parallel | `SHAPE.diamond`'s outline at a fixed 40 px, with an X or a + marker |
| `bpmn-data` | Data object | BPMN's page: square corners, its top right folded 10 px. Not the map's `document` (Q6, S10) |
| `bpmn-store` | Data store reference | The map's `cylinder` outline and inset, 50 × 50 px at least, painted in the typed look (no kind colour) |
| `bpmn-note` | Text annotation | An open bracket on its left, its text beside it, wrapped to five lines of 160 px |
| `bpmn-pool`, `bpmn-lane` | Pool and lane headers | `SHAPE.partition`'s header, read only |
| `bpmn-group` | Group | A dashed and dotted rounded rectangle, its name at the top |

### 9.2 Labels outside (S9)

| Option | For | Against |
|---|---|---|
| **(a) Events, gateways, data objects and stores carry their name outside, under the shape, moved by a search of the type's own where it meets a line, a node or a label (recommended)** | BPMN's habit, allowed by 2.2.3; the shapes stay their standard size; the search is `endLabels`' stepping loop rewritten for a node's two-line, 120 px label in `src/bpmn/notation.js` (4b.2), no core byte | The layout keeps no room for the label (stage 5's ball name); a dense row gap may push it aside |
| (b) The node's box holds the shape and its label, the line ends slid to the shape (the actor's precedent) | Room reserved | A line ending on the bottom of the box crosses the label to reach the shape |
| (c) Inside, as UML's diamond (stage 4's S8) | Never meets a line | Grows a 40 px gateway and a 32 px event to their text: not BPMN's look |

### 9.3 Groups (S11)

A group is left out of the layout. On the copy it is drawn under every line and node, round the shown nodes whose
`categoryValueRef` names it, 16 px out; its title at its top left, kept off the nodes by moving it along its border. It is
added back as a node whose hit area is its border and title only, so a click inside it still reaches what it surrounds.
A group naming nothing shown is not drawn, and `describe()` says so.

| Option | For | Against |
|---|---|---|
| **(a) Drawn after the layout round its members (recommended)** | BPMN's group crosses pools and lanes and does not change the flow | It can surround a node that is not its member; the accessible name lists only its members |
| (b) A stage 2 box | The router knows it | A box holds what it frames, and must lie in one lane |

### 9.4 As built (4b.2)

`src/bpmn/notation.js`, for 4b.3 to call:

- **A node's look** is read from its drawing input: `n.type` (the model's type; a shape's own when absent), `n.label`,
  `n.taskType`, `n.definition` and `n.cancelActivity`, so the type copies those fields and sets nothing else. The
  accessible name is `n.aria`, else `bpmnName(n)` ("User task Approve", "Timer boundary event (non-interrupting) Two
  days", "Sub-process Pick (expanded)"), which the type may use for `aria`, `describe()` and a frame's `f.aria`.
- **`bpmn-task`** takes `SHAPE.rounded`'s outline and its name's wrap (three lines of 180 px at 12 px, 100 to 320 px
  wide), not its size: a top-left marker keeps a 22 px row above the name and a collapsed sub-process's `+` a 20 px row
  under it, so a three-line name with a marker grows the box past 64 px instead of meeting the marker.
- **`bpmn-data`** is 36 × 50 px (§9.1 gave no size). Every marker carries `data-mark` (`user`, `service`, `collapsed`,
  `message`, `timer`, `terminate`, `exclusive`, `parallel`) for the tests.
- **Labels outside**: `bpmnLabels(items, lines, also)` returns `[{ id, x, y, w, h, lines }]` for items
  `[{ id, x, y, w, h, label }]`, keeping clear of each line's segments (4 px round them), the items' shapes, `also` (every
  other node drawn) and the labels placed before; at each step of 4 px outwards it tries under, over, right and left in
  that order. `bpmnLabelSvg(b)` draws one, `data-o` its node's id.
- **Groups**: `bpmnGroupFrame(label, members, others)` gives the frame 16 px round the members' boxes and `tx`, its
  title's left, moved along the top border off `others`; the title is drawn inside the frame's top left, in the 16 px
  between the border and the members. Null with no member shown.
- **Pools and lanes** draw through `SHAPE.partition` (`src/uml/activity.js`, before this file in `ALL`), as `bpmn-pool`
  and `bpmn-lane` with their own `data-shape` and names.

## 10. Line ends and dashes (4b.1, `src/typed/draw.js`)

- `ENDS.circle`: an open circle of radius 4 px whose far side is the line's end, filled with the stage's background:
  a message flow's start.
- `e.end.dashed: 'dot'`: a dotted line (`2 3`); `true` stays `6 4`.

Both are `src/typed/draw.js`'s, which stage 6's 6.3 (a filled triangle in `ENDS`) and milestone 2's line-end skins
(crow's feet, IDEF1X) also extend (§15.4).

## 11. Editing (S12)

| Hook | Called by | BPMN |
|---|---|---|
| `connect` | Connect by pointer and `L` | The kind by the ends (§7.1), refused with the rule's words |
| `moveTo` | A drop, Alt + arrows | A flow node dropped in another lane's band: `reparent` to it and its pin removed; into another pool: refused while it has sequence flows ("Move its sequence flows first"), else `reparent`. A boundary event dropped on another activity's border: `set props.attachedTo`; Alt + arrows on one: `set present.<id>.side`. Alt + arrows elsewhere: a pin |
| `add` | Palette, `N` | Into the lane, pool or expanded sub-process selected; a boundary event onto the activity selected (refused with none); events and gateways with `name: false` |
| `remove` | Delete, Shift + Delete | A lane (a member): deleted, its flow nodes and nested lanes moved to its parent (stage 4's S10); a pool: what it owns goes with it (`apply()`'s cascade), the hint line counting it; an activity: its boundary events with it, by `refs` (`'bpmn.BoundaryEvent': { 'props.attachedTo': 'cascade' }`); a group: the `categoryValueRef` entries naming it dropped, by `refs` |
| `rename` | F2 | A flow's name; an annotation's text |
| `key` | A key on a selection | `A` on a boundary event: a picker of the activities of its pool, then `set props.attachedTo`. `X` on a sub-process: expand (add what it holds to `nodeIds`) or collapse (remove it), one `set` of the view's `nodeIds` (decision 22). Every other key returns null, so the canvas's own keys (`E`, #71, among them) reach every other node unchanged |
| `owners` | The Owner field | A flow node's lanes, pools and sub-processes; a lane's lanes of its pool |

Palette: Pool, Lane, Task, User task, Service task, Sub-process, Call activity, Start, Message start, Timer start,
Intermediate catch, Intermediate throw, Boundary, End, Message end, Terminate end, Exclusive gateway, Parallel gateway,
Data object, Data store, Text annotation, Group. Lines: Sequence flow, Message flow, Association, Data association (each a
hint: `connect` picks). Properties: `documentation` on every element; `taskType`, `definition`, `cancelActivity`,
`calledElement`, `dataStoreRef`, `direction` (enums and text); stereotypes are UML's and are not offered.

| Option, attaching a boundary event by keyboard (DoD 4) | For | Against |
|---|---|---|
| **(a) `A` and a picker, through `edits.key` (recommended)** | Stage 5's `B` precedent; no core byte | The panel shows `attachedTo` as text, read only |
| (b) A properties field listing the activities | In the panel | The panel's enums are static (stage 4 Q9): a dynamic one is the core's `src/canvas/edit.js` |

`E` is taken: `src/canvas/render.js` binds `e`/`E` to "unfold here, or fold back" (#71), and the type's `key` hook runs
before it only where `rename` is offered (`src/typed/edit.js`). With `E` as the type's key, the same key would expand a
sub-process in the view while editing and unfold its drill-down when read only, and would hide #71 on sub-processes.

| Option, the key that expands a sub-process (decision 22) | For | Against |
|---|---|---|
| **(a) `X` (free), through `edits.key`; `E` stays #71's everywhere (recommended)** | One meaning per key in every mode; no core byte | A letter to learn; the hint line and the keyboard help name it |
| (b) `E` through `edits.key` on sub-processes only | One key for "open here" | It means two things by mode, and #71 is unreachable on a sub-process while editing |
| (c) No key: expand by the view's list in the panel | Nothing to learn | The definition of done's keyboard path gets longer (open the panel, edit the list) |

Hiding: a node leaves the view by Delete and the model by Shift + Delete. A lane is a member and cannot be hidden: Delete
deletes it from the model, said on the hint line first (stage 5's S20).

## 12. The BPMN XML adapter (S13, S14)

### 12.1 Packaging

| Option | For | Against |
|---|---|---|
| **(a) The caller passes a `bpmn-moddle` instance: `readBpmnXml(xml, moddle)` (a promise of `{ model, report }`) and `writeBpmnXml(model, viewId, geo, moddle)` (a promise of the XML), internal in `lib/umlimator-all.js` as every reader; the CLI resolves `bpmn-moddle` from the user's folder; CI installs it with `--no-save` in a scratch folder, pinned by decision 24 (recommended)** | The module imports nothing and `package.json` does not change (D8); the markdown-it plugin's precedent (Q8); a host passes the version it has | The CLI's user installs it once; the reader is asynchronous where the others are not |
| (b) An optional `peerDependency` and a dynamic `import('bpmn-moddle')` | One call | `package.json` gains a dependency entry; bundlers warn on a missing optional peer |
| (c) A `devDependency` for the tests | Tests run with `npm test` alone | A dependency all the same, with a lock file question the repository has avoided |

How the tests and the CLI find it. Node's `import` ignores `NODE_PATH`, so a package in a scratch folder is found only
by an explicit path:

- the tests and the CLI read `UMLIMATOR_BPMN_MODDLE`, a folder; they resolve `bpmn-moddle` from it with
  `createRequire(path.join(folder, 'x')).resolve('bpmn-moddle')` and import that file by `pathToFileURL`. With no
  variable they resolve from the working folder, then the CLI's `--moddle PATH`;
- 4b.4 therefore edits `.github/workflows/check.yml` in three places: the install step, and the variable on the two
  existing `node --test` steps (the main run and the serial " (timed)" run).

`bpmn-moddle@10.3.1` pins only the top package: its four dependencies are caret ranges, and `moddle-xml` has already
moved past the 12.3.1 named (Q9). With no lock file CI is not reproducible.

| Option, pinning CI's install (decision 24) | For | Against |
|---|---|---|
| **(a) Pin all five packages exactly on the install line: `npm install --no-save --prefix "$RUNNER_TEMP/moddle" bpmn-moddle@10.3.1 moddle@8.2.1 moddle-xml@12.3.2 min-dash@5.1.0 saxen@11.2.0` (recommended)** | Reproducible with no lock file in the repository: npm satisfies the caret ranges with the exact top-level copies; one line | The five versions are moved by hand, together; a new dependency in a later `bpmn-moddle` would float until added |
| (b) A lock file for that folder only (`tests/moddle/package.json` and `package-lock.json`, installed with `npm ci`) | Exact to the byte, integrity hashes included | The repository's first lock file, kept up to date by hand |
| (c) The top package only, as first drafted | Shortest | Not reproducible: a `moddle-xml` release can change CI's result with no commit |

The `risks.md` row for version drift says which option was taken and that the CLI's user gets whatever their own install
resolves.

### 12.2 Reading

- Text over 1 MiB is refused (R2); moddle's errors and warnings become report items; the reader never throws (R1). A
  hostile file (deep nesting, entity expansion, many references) is read or refused in under 1 s each.
- **A departure from R2.** R2's safeguard is "hand-written, linear readers" (stage 4 restates it); this reader parses
  through moddle's parser (`saxen`) and moddle's handlers. What holds instead: the 1 MiB limit bounds the element count;
  every moddle call (`fromXML`, `toXML`) and the reader's own walk are inside one `try`, so a `RangeError` (a stack
  overflow in moddle's handlers at depth) or any other throw becomes a report item, never a throw; the reader's walk over
  moddle's tree is iterative; the hostile fixtures (§13), a many-references file among them, each finish under 1 s. Stated
  in §16 and in `risks.md` R2 (§18).
- One model; one `bpmn` view per `BPMNDiagram`, its `nodeIds` the plane's shapes; a sub-process's own plane is a view
  with it as `subject`, and the sub-process `opensView` it. Elements with no shape go to the first view.
- Mapping by Table 2.1 (§3.1). A pool's process: its lanes become members, `flowNodeRef` sets `parent`; a data object
  reference and its data object become one `bpmn.DataObject` (the reference's id, the object's name when the reference
  has none); a category value becomes the group's own id in `categoryValueRef`.
- Ids are kept (R3). An `umlimator:id` attribute, written by the writer, gives the model's id back.
- Positions, sizes, label bounds and colours from DI are not kept (D1, R5): one report item per file says so.
- **Weakened, not skipped.** Nearly every file with an exclusive gateway puts a `conditionExpression` on the flows
  leaving it and a `default` on the gateway; skipping them would leave the gateway with no flows out and fire
  `gateway-flows` and `flow-start` on a sound file. So a conditional or default sequence flow is read as a plain
  `bpmn.SequenceFlow`, its condition (and the gateway's `default`) kept under `ext.bpmn` keyed by the flow's (gateway's)
  id; a send or receive task is read as a `bpmn.Task` with `taskType: none`, its kind kept under `ext.bpmn`. Each is one
  report item, `weakened`. The writer writes them plain, and its report says what was dropped (§12.3).
- Any other element outside S1's subset (a signal event, an inclusive gateway…) is reported `skipped` and kept under the
  model's `ext.bpmn` as moddle's JSON with its parent's id (`model.md` rule 12); its flows are reported too.

### 12.3 Writing

- One `definitions` with a collaboration when the view shows a participant, a process per participant (`processRef`, else
  `<participant>-process`, made unique), and one for the flow nodes in no pool; laneSets; data objects with their
  references; data stores; a category per group.
- Diagram interchange from the geometry given (`geo`, the type's layout of the view): a shape per node with its bounds,
  `isHorizontal` for pools and lanes, `isExpanded` for a sub-process; an edge per line with its points. 4b.4 tests it on
  plain geometry; 4b.5 wires the type's layout in the CLI.
- An id that is not an XML name is written as one (`_` and the code points) with `umlimator:id` holding the model's.
- What `ext.bpmn` holds is not written back, and the report says so.
- `read(write(model))` equals the model for the example and 500 generated models, ids included.
- Its limits, for the fidelity table (definition of done 7, 4b.5): positions and sizes come from the type's layout, not
  from any file read before; label bounds are not written; `ext.bpmn` (skipped elements, and weakened flows' conditions,
  defaults and task kinds) is not written back; an id that is not an XML name is escaped, the model's id in
  `umlimator:id`.

| Option, what the reader cannot map | For | Against |
|---|---|---|
| **(a) Kept under `ext.bpmn`, reported, not written back (recommended)** | Nothing is lost silently; the writer stays in the subset | A file read and written loses those elements, and says so |
| (b) Written back from `ext.bpmn` | A lossless round trip of unknowns | Their references into the subset break when the model is edited; moddle would rebuild elements the type never checked |
| (c) Dropped, reported | Simplest | The model forgets what the file said |

### 12.4 The CLI

`umlimator.py import order.bpmn --out model.json` (the format by the `.bpmn` extension or `--format bpmn`) and
`umlimator.py export model.json --view ID --format bpmn --out order.bpmn` run Node with `bpmn-moddle` resolved from the
working folder (`--moddle PATH` or `UMLIMATOR_BPMN_MODDLE` to name another, §12.1). Without it, both exit with: "BPMN
needs bpmn-moddle: npm install bpmn-moddle@10.3.1". `export` is a new command; it writes BPMN only in 0.27.0.

## 13. Fixtures, examples and the atlas

From `risks.md` §6's BPMN row and Table 2.1. Each lives in `tests/`, laid out in Node and in Chrome under three fonts and
both themes, right and down, with no overlap, no text overflow, no line through a node, no sequence flow outside its
pool's band, no line end off its outline or boundary circle (1 px).

| Fixture | Holds |
|---|---|
| `bpmn-minimal.json` | One pool: a start event, a task, an end event |
| `bpmn-stress.json`, view `edge-cases` | A boundary event that moves with its task (the task pinned, then the pin moved); two boundary events on one side (timer interrupting, message non-interrupting); a boundary event on an expanded sub-process; a message flow to and from a black-box pool, two from one column; a gateway with one exit (warned); a sub-process shown closed in one view and open in another; a sequence flow across pools (an error in JSON, refused by `connect`); lanes three deep; an empty lane; a flow node in a pool with lanes but in none (warned); a group across two pools; an annotation with an association; a data object and a data store with associations both ways; 40-character labels on an event and a gateway; every row of Table 2.1 |
| `bpmn-stress.json`, view `all` | 60 flow nodes, three pools, six lanes, ten boundary events, ten message flows, two expanded sub-processes (P1) |
| `tests/import/descriptive.bpmn` | A file with every Table 2.1 row and the extras (S1, decision 21), with DI; the report pinned |
| `tests/import/hostile/*.bpmn` | Over 1 MiB; entity expansion; 10,000 levels of nesting; many references (just under 1 MiB of sequence flows, every one with `sourceRef` and `targetRef` on one pair of tasks); a reference to nothing; no DI; an unknown namespace. Each read or refused in under 1 s, never thrown; the nesting file's stack overflow, if moddle has one, is a report item |
| `tests/import/weakened.bpmn` | An exclusive gateway with conditional flows and a default, a send and a receive task: read as plain flows and tasks, each reported `weakened`, `gateway-flows` and `flow-start` silent |

The example moves to `examples/bookshop-order-to-shipment.json` and joins the gallery and CI. Its 14 ids that are other
types in the atlas and `take-payment` (a view there) are renamed with a `bp-` start (`bp-shopper`, `bp-order`,
`bp-take-payment`, `bp-f-paid`…, Q10), so `tools/atlas.mjs` merges it without a disagreement. Every reference to a
renamed id is renamed with it: views' `nodeIds`, lines' `from` and `to`, `props.attachedTo` (`payment-timeout` names
`take-payment`), `parent` (the `sales` lane's members), `subject` and `opensView`. 4b.5 checks the renamed file: the
atlas builds, `check.mjs` passes, and the example validates with the same problems as before the rename.

| Option, joining the atlas (S17) | For | Against |
|---|---|---|
| **(a) Rename the 15 ids in the example; `shopping-use-cases/track` opens its view (recommended)** | The maintainer's rule: one Bookshop atlas, the build stops on a disagreement; "Track order" is where a shopper meets this process | A pool "Shopper" is not the use case's actor "Shopper", though they mean the same person: two elements |
| (b) Share the actors' ids, so the pool is the actor | One shopper in the atlas | The types disagree (`bpmn.Participant` and `uml.Actor`): the build stops, by design |

`tools/atlas.mjs`'s `KEYS.props` gains `attachedTo`, `calledElement`, `cancelActivity`, `categoryValueRef`,
`dataStoreRef`, `definition`, `direction`, `documentation`, `processRef`, `taskType`.

## 14. Performance (P1, S16)

| Fixture | Budget, in Node, CPU time, best of N after a warm-up; CI holds 1 s and prints the target |
|---|---|
| `bpmn-stress.json`'s `all` | A full layout and SVG markup: target 1 s |
| The same | An edit that moves nothing (documentation): target 100 ms |
| The same | The common edits: a task renamed, a sequence flow's name, a flow node moved to another lane, a boundary event's side: target 100 ms each |
| The adapter | 500 elements read and written each way: target 100 ms |

- Both flags off on every layout (stage 4 §17, decision 13): one picture fresh or after an edit (DoD 6).
- Timed tests are titled " (timed)" and run serially (`package.json`'s `test`).
- **4b.1's spike**, before 4b.3 draws: on a test-only view of the `all` fixture's size, with a test-only type, the common
  edits laid out and drawn; the count of sequence flows routed outside their pool's band; and the count of lines that
  cross a boundary circle (with the activities grown by 16 px, §6.2). Over 100 ms on an idle machine, a flow outside its
  pool, or a line through a circle, goes to the maintainer with options before 4b.3 draws.

4b.1's spike as built (`tests/bpmn-engine.test.mjs`, a test-only stand-in: cpPlace over sequence and message flows, a lane
pass of its own keeping a block whole, runs for `laneBands`, activities grown 16 px for their circles, 60 flow nodes,
three pools, six lanes, ten boundary events, one on an expanded sub-process, two on one task's side, ten message flows):
0 lines through a boundary circle and 0 sequence flows outside their pool's band, right and down, with the band as
`laneBands` gives it (so before §5.2a's 12 px growth); 32 crossings laid out right and 45 down, no other layout issue,
with both flags off. CPU, best of five after a warm-up, ranked, laned, laid out and drawn, on a machine shared with other
work: a full layout 66 ms; documentation 8 ms; a task renamed 87 ms; a sequence flow's name 72 ms; a flow node moved to
another lane 84 ms; a boundary event's side 70 ms. All under the 100 ms target: nothing goes to the maintainer before
4b.3 draws. The crossings are for 4b.5 to pin on the stress fixture.

## 15. Work packages

### 15.1 Before milestone 4b starts

- This note is approved; `model.md` row 24 and `risks.md` take §17's changes with it.
- Stage 6's code lanes are scheduled, and no more than four or five code lanes are open across the project.
- `stage5-followups` (the overlap check's owner skip, `src/typed/layout.js`) and 5.8 (the atlas, `check.mjs`, the
  schema, and 26 lines of `src/uml/component.js`) have merged before 4b.1 and 4b.5.

### 15.2 The packages

Each is one pull request. "Owns" lists the only files it changes while open. Built files (`lib/umlimator.js`,
`lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`, after merging
`main`, never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a package proposes its
row and writes its release notes in its pull request for 4b.5 to gather.

| # | Work package | Owns | Depends on | Done when |
|---|---|---|---|---|
| 4b.0 | **List the files** (the lead). `bpmn/notation`, `bpmn/process`, `readers/bpmn-xml` as empty files, in `ALL` after the last stage's listed, in that load order | `tools/build.mjs`, the three empty files | This note; stage 6's lanes scheduled | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; no other 4b lane edits `ALL` |
| 4b.1 | **Engine.** `portMin` in `spreadPorts` and `EDGE_GEO` (§6.2); `ENDS.circle` and `dashed: 'dot'` (§10); `laneBands`' `runs` and boxes (§5.2); `cpRank` and `cpPlace` exported from `src/uml/component.js`. §14's spike, reported in the pull request. Tested with a test-only type: a port of 32 px with one line and two on one side, on a node and a box; pools in bands with `runs`, a box in a lane | `src/typed/layout.js`, `src/typed/draw.js`, `src/layout/lanes.js`, `src/uml/component.js` (its export line), `tests/bpmn-engine.test.mjs` (new), `tests/bpmn-engine.html` (new), `tests/embed.py` (appends its page) | 4b.0; `stage5-followups` and 5.8 merged | Maps unchanged (geometry hashes, stills); `tests/core-diet.*`, `tests/lanes.test.mjs`, `tests/typed-ports.test.mjs` and every typed type's tests unchanged; a port with `portMin` keeps its length and its neighbour 8 px off; bands with `runs` cover their rows and a box's frame, both directions; the spike's figures, lines through boundary circles counted; the core byte-identical |
| 4b.2 | **Notation.** §9.1's shapes, the markers, the labels outside with their own search (§9.2, not `endLabels`), the group's frame, accessible names of the looks | `src/bpmn/notation.js`, `tests/bpmn-notation.test.mjs` (new), `tests/bpmn-notation.html` (new), `tests/embed.py` (appends its page) | 4b.0; 4b.1 for its browser test's ends | Each shape's size, outline and inset agree (a point slid by `inset` lies on `out`); both themes, three fonts, no text overflow; every marker drawn; on hand-built geometry a label outside keeps off lines and nodes |
| 4b.3 | **The BPMN type.** §4 to §8, §11: definition, ranking, the lane pass (§8.1) and data in lanes (§5.2a), pools, lanes, anchors, boundary events grown for their circles (§6.2), boundary events, expanded sub-processes, groups, rules, `describe()`, names, legend, `rows` and `word`, `refs`, hooks | `src/bpmn/process.js`, `tests/bpmn.test.mjs` (new), `tests/bpmn.html` (new), `tests/embed.py` (appends its page) | 4b.1 (and its spike), 4b.2 | Definition of done 2, 4, 5, 6 and 8 on row 24's subset; every gesture by pointer and by key through `apply()`; a 30-step session undone, redone and reopened to byte-identical models; `24-bpmn.json` lays out clean, right and down, no sequence flow outside its pool |
| 4b.4 | **BPMN XML reader and writer.** §12: the adapter, the CLI's `import` routing and `export` command, CI's pinned install | `src/readers/bpmn-xml.js`, `tests/bpmn-xml.test.mjs` (new), `tests/import/descriptive.bpmn`, `tests/import/hostile/`, `tests/import/weakened.bpmn`, `umlimator.py`, `umlimator_import.py`, `tests/import.py`, `.github/workflows/check.yml` (the install step, pinned by decision 24, and `UMLIMATOR_BPMN_MODDLE` on the two `node --test` steps) | 4b.0; `model.md` row 24 (it starts beside 4b.1 and 4b.2) | `read(write(model))` equals the model for the example and 500 generated models; the report pinned, weakened items included; hostile files, many references among them, under 1 s each, never thrown; the DI written from given geometry read back by moddle; without `bpmn-moddle` the CLI says how to install it and the test says it skipped, except in CI, where it fails |
| 4b.5 | **Fixtures, examples, atlas, docs.** §13's files and tests (`tests/m4b-fixtures.test.mjs`, `tests/m4b.html`); the example moved and renamed, with `check.mjs`'s `MOVED`; the atlas's link and `KEYS`; `render`, `check`, `stills`, `pdf`, `import` and `export` on it; the schema and `.d.ts`; C10's tests (the MCP server, the diff Action); every document of `plan.md` §7; `docs/conformance/bpmn.md` with Table 2.1 row by row; the lanes' release notes gathered | `examples/`, `tests/bpmn-minimal.json`, `tests/bpmn-stress.json`, `tests/m4b-fixtures.test.mjs`, `tests/m4b.html`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/embed.py` (appends), `tools/atlas.mjs` (`KEYS`), `tools/atlas-links.json`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | 4b.1 to 4b.4; 5.8 merged | Definition of done 1, 3, 7, 9, 10, 11 and 12, the fidelity table's BPMN XML writer row included (§12.3's limits); §14's budgets in CI; the PDF lists each element's word and rows; the example in the gallery, CI and the atlas, renamed with every reference (§13), the atlas building, `check.mjs` passing and the example's problems unchanged; the stress fixture's crossings pinned; the conformance note claims Descriptive only if every Table 2.1 row has its passing test |

Existing tests a package edits: none, but by appending (`tests/embed.py`, `tests/notation.html`, `tests/cli.py`,
`tests/mcp.py`, `tests/import.py`, `check.mjs`'s `MOVED`, `atlas.mjs`'s `KEYS`).

### 15.3 What runs at the same time (S18)

```
approved, stage 6 scheduled ─▶ 4b.0 ──┬─▶ 4b.2 notation ─────────────────────┬─▶ 4b.3 BPMN type ──┐
                                      ├─▶ 4b.4 reader and writer ─────────────┼────────────────────┼─▶ 4b.5 ─▶ 0.27.0 (after 0.26.0)
              stage5-followups merged ┴─▶ 4b.1 engine (and its spike) ─────────┘                    │
                                                              5.8 merged ───────────────────────────┘
```

- Three lanes at most at once (4b.1, 4b.2, 4b.4), then one (4b.3), then 4b.5. Within the project's four to five open code
  lanes: 4b.4 first, since it shares no file with stage 6's lanes or with 4b.1 and 4b.2; 4b.2 beside it, since its only
  shared file is `tests/embed.py`, which it appends to as 4b.1, 4b.3, 4b.5, 5.8, 6.3, 6.5 and 6.6 do; 4b.1 when
  `stage5-followups` and 5.8 have merged, sharing `src/typed/draw.js`'s `ENDS` with 6.3 and `tests/embed.py` with 4b.2.
  The three-lane window's Owns are therefore disjoint but for `tests/embed.py`; each pair that shares a file rehearses its
  merge (X2).
- 4b.3 may write its definition, rules and `describe()` against the contracts above before its needs merge, and draws
  once 4b.1's spike is reported.
- No package touches the core.
- 4b's packages may merge to `main` before 0.26.0 ships; they are provisional until 0.27.0, as stage 5's were in 0.21.0.
  0.27.0 ships after 0.26.0.
- One reviewing agent that did not write the code checks each pull request against the definition of done; before the
  first of two open branches that share a file merges, their merge is rehearsed in a scratch worktree (X2).

| Option | For | Against |
|---|---|---|
| **(a) Start when stage 6's lanes are scheduled, 4b.2 and 4b.4 first, within the lane cap; 0.27.0 after 0.26.0 (recommended)** | Lanes that conflict with nothing run early; the reader's moddle questions are answered before the type | Built files are rebuilt in more branches at once (X2) |
| (b) Start after 0.26.0 is released | No overlap | Lanes idle; the release order already serializes what ships |

### 15.4 Files shared with other work, and the merge order

| File | Who else | Order |
|---|---|---|
| `tools/build.mjs` (`ALL`) | 6.0, M2's, M3's, M4a's first packages | Each appends its list; the later merges `main` and keeps the stages' order |
| `src/typed/layout.js` | `stage5-followups` (open) | `stage5-followups` first; 4b.1 after |
| `src/typed/draw.js` (`ENDS`) | Stage 6's 6.3 (a filled triangle); M2's line-end skins | Whichever first; each appends to `ENDS`; the second rehearses the merge. `stage-6.md` says of this file "No other package": it needs 4b.1's row (the lead's, on `stage6-note`) |
| `src/layout/lanes.js` | Read by the activity type; M2's flowchart may use lanes (its note decides) | 4b.1 owns it while open; an M2 lane on it waits or rehearses |
| `src/uml/component.js` | 5.8 (26 lines) and `stage5-followups` edit it | Both first (4b.1's Depends says so); 4b.1 changes its export line only |
| `src/layout/audit.js` | `stage5-followups` (decision 22) | Read only by 4b; it must merge first |
| `umlimator.py`, `umlimator_import.py`, `tests/import.py` | M2's readers (Mermaid ER and flowchart, Structurizr JSON, DBML), M4a's Mermaid mindmap | Each adds its route; the second rehearses |
| `.github/workflows/check.yml` | M2's DBML adapter, if it installs a pinned package the same way | The first writes one step for optional adapters; the other adds its package to it |
| `tools/atlas.mjs`, `tools/atlas-links.json`, `examples/bookshop-atlas.json` | 5.8 (open), stage 6, M2, M3, M4a | Appends; the atlas rebuilt after merging `main` |
| `tests/embed.py` | 4b.1, 4b.2, 4b.3, 4b.5; 5.8; 6.3, 6.5, 6.6 | Each appends its page and header line; the second of two open branches rehearses the merge (X2) |
| `docs/diagrams/examples/check.mjs`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `docs/module-api.md` | Every stage's fixtures package | Appends; 4b.5 last |

### 15.5 The release

0.27.0 after 4b.0 to 4b.5, and after 0.26.0, by the repository's rule: `package.json`, `## 0.27.0:` in
`docs/module-api.md`, merged when the maintainer approves that pull request by number. Its notes say: new, the BPMN
diagram (Table 2.1 and the extras S1 and decision 21 name), boundary events, pools, message flows, the BPMN XML reader and writer through a
`bpmn-moddle` the caller provides, `umlimator.py export`; left out, §16. The `map-repo` skill's pin does not move.

| Option, C10 | For | Against |
|---|---|---|
| **(a) In 4b.5: the MCP server's read tools and the diff Action's step tested on the example (recommended)** | Tests only | A reorder reads "changed" in `diff()` until per-type writers come |
| (b) Left to the package after 0.20.0 | One piece of work | An untested type on the MCP server |

## 16. Left out, and departures

| Left out | Why |
|---|---|
| Table 2.2 beyond S1's five rows: conditional and default flows, send and receive tasks, loop and multi-instance markers, inclusive and event-based gateways, link, signal, error, escalation and conditional events | The Analytic sub-class; scope creep (`proposal.md` §3.3) |
| Conversations, choreographies, event sub-processes, transactions, ad hoc sub-processes, compensation | Outside Process Modeling's sub-classes or Table 2.2 |
| Messages as elements (the envelope on a message flow), data inputs and outputs, the collection marker | Table 2.2 and beyond |
| Positions, sizes, colours and label bounds from a file's DI | D1; R5 |
| Conditions and defaults on sequence flows, send and receive task kinds | Read as plain flows and tasks, kept under `ext.bpmn`, reported `weakened` (§12.2); not written back |
| Execution semantics (clause 13), the Common Executable sub-class | 2.2.5's note: not expected of a modeling tool |
| A Mermaid reader | Mermaid has no BPMN |
| Resizing a pool or lane by hand; a lane's order other than `members` order | As stage 4's lanes |
| XMI, copy and paste (E7), per-type `diff()` writers | As every stage |

Departures, in the conformance note: the label of an event, gateway or data element is under it, moved aside where a
line passes (2.2.3 allows it); the data store's cylinder is the map's outline; a message flow to a pool ends on its border
at the column it comes from; a boundary event is 32 px; the BPMN XML reader parses through `bpmn-moddle`, not a
hand-written linear reader (a departure from `risks.md` R2, with §12.2's safeguards).

## 17. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | What 0.27.0 claims | Table 2.1 whole and five Table 2.2 rows; "based on BPMN 2.0" until each Table 2.1 row is tested | Table 2.1 only (no boundary events); Table 2.2 whole | §3.2 |
| 2 | Documentation | `props.documentation` | The generic `what` | §3.1 |
| 3 | The core's budget | Plan 0 B within the 700 B share; a spend stated; over it asks | Hand the share back now | §2.3 |
| 4 | Pools and lanes | Stage 4's bands, pools as top-level lanes, an empty row between, `runs` and boxes in `lanes.js` | Pools as boxes; no gap | §5.1 |
| 5 | The gap between pools | One empty row | A per-gap row height (layout rows) | §5.3 |
| 6 | Boundary events | Stage 5's port hook with `portMin`, a 32 px circle | A node beside the activity; drawn after the layout | §6.1 |
| 7 | A message flow to a pool's border | Anchors in the gap row, slid to the border | Drawn by the type, unrouted; a pool as a node | §7.2 |
| 8 | Choosing a flow's kind | By its ends, no picker | A picker every time | §7.1 |
| 9 | Ranking | The type's own, `cpRank` and `cpPlace` exported | The host's | §8.1 |
| 10 | Expanded and collapsed sub-processes | Expanded when the view lists its contents; a key toggles (decision 22) | A `present` flag; collapsed only | §8.2 |
| 11 | Labels of events, gateways and data | Outside, by the type's own search modelled on `endLabels` | In a box with the shape; inside | §9.2 |
| 12 | Groups | Drawn after the layout round their members | A box | §9.3 |
| 13 | Attaching a boundary event by keyboard | `A` and a picker | A dynamic panel field (core) | §11 |
| 14 | The adapter's packaging | An injected `bpmn-moddle`; CI's pinned `--no-save` install; no `package.json` change | Optional peer; devDependency | §12.1 |
| 15 | What the reader cannot map | Kept in `ext.bpmn`, reported, not written back | Written back; dropped | §12.3 |
| 16 | A writer and `umlimator.py export` | Both in 0.27.0, DI from the layout | Reader only | §12.3, §12.4 |
| 17 | Joining the atlas | Rename the 15 ids; "Track order" opens the view | Share the actors' ids (the build stops) | §13 |
| 18 | P1 | Both flags off; 1 s in CI, 100 ms printed; timed tests serial; 4b.1's spike first | | §14 |
| 19 | Order with stage 6 and the milestones | Start once stage 6's lanes are scheduled, 4b.2 and 4b.4 first, within the lane cap; 0.27.0 after 0.26.0 | Start after 0.26.0 | §15.3 |
| 20 | C10 | Tested in 4b.5 | Left to the package after 0.20.0 | §15.5 |
| 21 | The none intermediate throw event | A sixth extra, named in the claim | Left out: refused, the reader skips it | §3.2 |
| 22 | The key that expands a sub-process | `X`; `E` stays #71's | `E` on sub-processes only; no key | §11 |
| 23 | Data objects, stores and annotations in a pool with lanes | Drawn in the lane of the first flow node they are associated with, else a run of the pool's own | Always the pool's own run | §5.2a |
| 24 | Pinning CI's `bpmn-moddle` install | All five packages exact on the install line | A lock file for that folder; the top package only | §12.1 |

## 18. What this note changes elsewhere

- **`model.md`.** Row 24 as §3.1, the definitions of §3.2, and a pointer here.
- **`risks.md`.** R5 points to §12; §6's BPMN row points to §13; C5 records milestone 4b's share and its spend; P1 gains
  §14's common edits; R2 gains the hostile XML files and states the BPMN reader's departure (a library parser, §12.2's
  safeguards instead); a new row for a sequence flow routed outside its pool's band (§5.2, §14), and one for
  `bpmn-moddle`'s version drift: `@10.3.1` pins only the top package, its dependencies are caret ranges, so CI pins the
  whole tree as decision 24 says, and the CLI's user gets what their own install resolves.
- **`plan.md`.** §5's M4b row points here (done with this note); §4.3 lists `src/bpmn/`.
- **`proposal.md`.** §3.4's BPMN row: "24 rows" is Table 2.1's, read; §8.5's BPMN subset points to §16.
- **`notes/stage-4.md`.** §5.2's `laneBands` contract gains `runs` and boxes when 4b.1 merges. Written by 4b.5 (`docs/`
  is in its Owns, not 4b.1's), with `docs/module-api.md`'s ports section gaining `portMin` beside `fromPort`, `toPort`,
  `inner` and `portRank` in the edge geometry.
- **`README.md` in this folder.** The status table shows this note and, once approved, its work packages; the log
  records the decisions, and the core budget split of 13 Nov 2026 (4,451 B: stage 6 400, M2 1,400, M3 500, M4a 700, M4b
  700, reserve about 750), which no document records yet (§2.3). (The lead's.)
- **`notes/stage-6.md`** (on `stage6-note`). Its file table's `src/typed/draw.js` row ("No other package") gains 4b.1
  (`ENDS`, `circle`), and its `tests/embed.py` row gains 4b.1, 4b.2, 4b.3 and 4b.5. (The lead's.)
