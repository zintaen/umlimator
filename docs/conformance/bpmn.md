# Conformance: BPMN

Release 0.27.0 (milestone 4b, `docs/diagrams/notes/milestone-4b.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below, and **read** and **write** BPMN XML through `bpmn-moddle`, which the caller provides
(an optional adapter, never a dependency of the module).

The claim: the elements of the **Descriptive conformance sub-class (BPMN 2.0.2, 2.2.2, Table 2.1)**, every row and every
attribute it lists, each with its passing test (the element's type, its name and each attribute's field); and six elements beyond it, named below: five rows of Table 2.2 (the
Analytic sub-class's additions) and the none intermediate throw event. No claim is made of the Analytic sub-class, of
the Common Executable sub-class or of execution semantics (clause 13). The standard is [BPMN 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF)
(formal/13-12-09), read on 13 Nov 2026.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"bpmn"` is a BPMN diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 24, and the note's §3; the example
is [`examples/bookshop-order-to-shipment.json`](../../examples/bookshop-order-to-shipment.json), which the Bookshop atlas
opens from the use case "Track an order".

## Table 2.1, row by row

Each row is held by `tests/m4b-fixtures.test.mjs` on `tests/bpmn-stress.json`'s `edge-cases` view (its `TABLE`, a check
per line below, the line's name its key), drawn in Chrome by `tests/m4b.html`, and edited by `tests/bpmn.test.mjs` and
`tests/bpmn.html`. Table 2.1's 24 rows are written here in 18 lines, as the table groups them.

| Table 2.1 | Attributes | In the model | Drawn as |
|---|---|---|---|
| participant (pool) | id, name, processRef | `bpmn.Participant`: `id`, `label`, `props.processRef` | a band across the diagram, its name in a 22 px header strip, turned when laid out right; a pool with no flow node shown (a black box) one empty row, 120 px across at least |
| laneSet | id, lane with name, childLaneSet, flowElementRef | `bpmn.Lane` members of the pool; nesting by a lane's `parent`; a flow node's `parent` | bands inside the pool's, 22 px of header a level; an empty lane keeps one row |
| sequenceFlow (unconditional) | id, name, sourceRef, targetRef | `bpmn.SequenceFlow`: `id`, `label`, `from`, `to` | a solid line with a filled arrowhead |
| messageFlow | id, name, sourceRef, targetRef | `bpmn.MessageFlow` | a dashed line, an open circle at its source and a hollow triangle at its target; to a pool, ending on its border |
| exclusiveGateway, parallelGateway | id, name | `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway` | a 40 px diamond with an X or a +, its name outside |
| task (None), userTask, serviceTask | id, name | `bpmn.Task`, `props.taskType` `none`, `user`, `service` | a rounded rectangle, the user's figure or the gear at its top left |
| subProcess (expanded), (collapsed) | id, name, flowElement | `bpmn.SubProcess`; what it holds by `parent` | expanded, a frame round its flow, when the view lists something it holds; else collapsed, with the + marker, opening its `opensView` |
| CallActivity | id, name, calledElement | `bpmn.CallActivity`, `props.calledElement` | a task with a 3 px border |
| DataObject | id, name | `bpmn.DataObject` | a page with its top right corner folded, square corners, its name outside |
| TextAnnotation | id, text | `bpmn.TextAnnotation`, `label` | an open bracket with its text beside it |
| association/dataAssociation | id, name, sourceRef, targetRef, associationDirection | `bpmn.Association` (`props.direction`), `bpmn.DataAssociation` | a dotted line, open arrowheads by direction; a data association's at its target |
| dataStoreReference | id, name, dataStoreRef | `bpmn.DataStoreReference`, `props.dataStoreRef` | the map's cylinder in the typed look, its name outside |
| startEvent (None), endEvent (None) | id, name | `props.definition: "none"` | a 32 px circle, 1.5 px for a start, 3.5 px for an end |
| messageStartEvent, messageEndEvent | id, name, messageEventDefinition | `props.definition: "message"` | the circle with an envelope, filled on the end event |
| timerStartEvent | id, name, timerEventDefinition | `props.definition: "timer"` | the circle with a clock |
| terminateEndEvent | id, name, terminateEventDefinition | `props.definition: "terminate"` | the end event's circle with a filled circle |
| documentation | text | `props.documentation` on any element or line | the properties panel, `describe()`, the PDF's rows; not on the picture |
| Group | id, categoryRef | `bpmn.Group`; members name it in `props.categoryValueRef` | a dashed and dotted rounded rectangle 16 px round its members, across pools and lanes, its name at its top left |

The six extras, each with its test on the same view:

| Beyond Table 2.1 | In the model | Drawn as |
|---|---|---|
| Message Intermediate Catch Event | `bpmn.IntermediateCatchEvent`, `definition: "message"` | a double ring with an envelope |
| Message Intermediate Throw Event | `bpmn.IntermediateThrowEvent`, `definition: "message"` | a double ring with a filled envelope |
| Timer Intermediate Catch Event | `bpmn.IntermediateCatchEvent`, `definition: "timer"` | a double ring with a clock |
| Message Boundary Event (interrupting, non-interrupting) | `bpmn.BoundaryEvent`, `definition: "message"`, `props.attachedTo`, `props.cancelActivity` | a double ring centred on its activity's border, dashed when non-interrupting |
| Timer Boundary Event (interrupting, non-interrupting) | `bpmn.BoundaryEvent`, `definition: "timer"` | the same with a clock |
| None Intermediate Throw Event (decision 21) | `bpmn.IntermediateThrowEvent`, `definition: "none"` | a double ring with no marker |

Rules (`src/bpmn/process.js`, the note's §4), each with a passing and a failing case in `tests/bpmn.test.mjs`: errors
`sequence-scope`, `sequence-ends`, `message-scope`, `message-ends`, `event-definition`, `boundary-host`, `lane-owner`,
`data-ends`; warnings `boundary-host` (a boundary event in another lane than its activity), `boundary-out`, `flow-start`,
`gateway-flows`, `in-lane`, `group-ref`, `opens-view`. A line's kind is picked by its ends when it is drawn (no picker):
a sequence flow in one pool and one level, a message flow between two pools, a data association with data at one end, an
association with an annotation at one end; anything else is refused with the rule's words.

**Departures** (2.2.3 allows a tool's own sizes, colours, line styles and text positions; none changes a shape): the name
of an event, a gateway, a data object or a data store is drawn outside, under the shape, moved aside where a line or a
node is in the way; the data store is the map's cylinder outline; a message flow to a pool ends on its border at the
column it comes from; a boundary event is 32 px across; the BPMN XML reader parses through `bpmn-moddle`, not a
hand-written linear reader (a departure from `risks.md` R2, with the note's §12.2 safeguards).

## Left out

The note's §16: Table 2.2 beyond the five rows above (conditional and default flows, send and receive tasks, loop and
multi-instance markers, inclusive and event-based gateways, link, signal, error, escalation and conditional events);
conversations, choreographies, event sub-processes, transactions, ad hoc sub-processes, compensation; messages as
elements, data inputs and outputs, the collection marker; positions, sizes, colours and label bounds from a file's
diagram interchange; resizing a pool or a lane by hand; XMI, copy and paste, per-type `diff()` writers. A Mermaid reader:
Mermaid has no BPMN.

Drawing limits (the note's §8.3): a message flow between two pools, both ends pools, and a flow from a boundary event back
to its own activity are not drawn (`describe()` says so; `connect` refuses both).

Layout limits, measured on the example and `tests/bpmn-stress.json`:

- Port repair and rerouting off (`repair: false`, `reroute: false`, S16).
- The example lays out with 5 crossings laid out right and 6 down, nothing else `check()` finds; its sub-process's view
  is clean.
- `tests/m4b-fixtures.test.mjs` pins the stress file. Its `edge-cases` view (two boundary events on one side, their task
  pinned and the pin moved; a non-interrupting one on an expanded sub-process; an interrupting message one on the call
  activity; two message flows to a black-box pool from one column and one from it, lanes three deep, an empty
  lane, a gateway with one exit, a flow node in a pool with lanes but in none, a sequence flow across pools, a group
  across two pools, an annotation, data both ways, 40-character labels) crosses 12 times each way; `ec-closed`, the same
  with the sub-process closed, 13 laid out right and 14 down; `ec-inside` none. Its generated `all` view (57 flow nodes
  and ten boundary events, three pools, six lanes, ten message flows, two expanded sub-processes) crosses 30 times laid
  out right and 29 down. In every view no node overlaps another, no line runs through a node, every line ends on its
  node, no sequence flow leaves its pool's band and every boundary circle is centred on its activity's border.
- A task's name is wrapped to three lines of 180 px; a name outside to two lines of 120 px, then cut with an ellipsis.
  The whole text is in the accessible name, `describe()` and the PDF.

## Writers: what each shows of a BPMN diagram

Measured on `examples/bookshop-order-to-shipment.json` (0.27.0); the PDF's text read back by `tests/cli.py`, the BPMN XML
by `tests/import.py` and `tests/bpmn-xml.test.mjs`.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` | BPMN XML: `umlimator.py export --format bpmn` |
|---|---|---|---|---|
| Pools, lanes, shapes, markers, lines and names | Yes | Yes | Yes, in vectors | Every element of the subset, with its process, lane set, category and documentation |
| Positions and sizes | As drawn | As drawn | As drawn | The type's layout of the view `--view` names (the first `bpmn` view by default): a pool or lane its band, a node its box, a line its points. Every other view's diagram on a plain grid. Not from any file read before |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture | None |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text | Names and documentation |
| Accessible names | Each node's `aria-label` kept; the lines' `<title>` removed | None | None | None |
| Tables | None | None | "Elements": each element's word (Service task, Timer boundary event, Exclusive gateway, Pool) and its rows (its lane or pool, the activity a boundary event is on, its documentation). Lanes are in their pool's row. "Lines": each flow's ends, name and kind (Sequence flow, Message flow, Association, Data association) | None |
| Label bounds | | | | Not written |
| Under `ext.bpmn` | | | | Not written back: what the reader skipped, and the conditions, defaults, task kinds and timer values it weakened; the export says so on stderr, one line each |
| An id that is not an XML name | | | | Escaped (`_` and the code points), the model's id in `umlimator:id` |

## Accessibility

Every piece has a name: "Service task Take payment, in Sales"; "Timer boundary event No answer in 2 minutes, on Take
payment"; "Pool Bookshop, 2 lanes, 17 elements"; "Message flow from Take payment to Payment provider, named Charge
request". The reading order runs pool by pool, lane by lane, along the flows, each boundary event after its activity;
then the groups, then the lines. Text reads at 4.5:1, lines and outlines at 3:1 in both themes (`tests/bpmn.html`,
`tests/m4b.html`). Every gesture has a key (`docs/editing.md`): `A` attaches a boundary event to an activity by a picker,
`X` expands or collapses a sub-process in the view, Alt + arrows move a boundary event to another side.

## Performance (P1)

`tests/m4b-fixtures.test.mjs` on `tests/bpmn-stress.json`'s `all` view, CPU time, best of five after a warm-up, on an
Apple laptop under other agents' load (14 Nov 2026): a full layout and its SVG 55 ms; documentation set 6 ms, laying
nothing out; a task renamed 54 ms; a sequence flow's name 52 ms; a flow node moved to another lane 55 ms; a boundary
event's side 53 ms. CI holds 1 s and prints the figures against the 100 ms target. The BPMN XML adapter reads and writes
500 elements under its 100 ms target (`tests/bpmn-xml.test.mjs`).
On CI's runner (runs 43563271519 and 43564910738) the four common edits took 97.6 to 108.2 ms and the full layout
100.4 to 105.8 ms: the edits sit at the target there, over it in the second run, and cost about as much as a full layout, since each lays the
view out again; only an edit that moves nothing is spared by the memo.

## Tests

`tests/bpmn.test.mjs` and `tests/bpmn.html` (the definition, the example laid out and drawn, the rules each passing and
failing, every gesture by pointer and key, a 30-step session); `tests/bpmn-notation.test.mjs` and
`tests/bpmn-notation.html` (every shape and marker, the labels outside, the group's frame); `tests/bpmn-engine.test.mjs`
and `tests/bpmn-engine.html` (boundary events as ports, the bands, the circle end and the dotted line);
`tests/bpmn-minimal.json` and `tests/bpmn-stress.json` with `tests/m4b-fixtures.test.mjs` and `tests/m4b.html`;
`tests/bpmn-xml.test.mjs` (the reader and writer, hostile files, the round trip of the example and 500 generated models);
`tests/import.py` (`import` and `export`, the export's diagram interchange from the type's layout); `tests/cli.py`
(render, check, stills, pdf, the diff Action); `tests/mcp.py`; `tests/atlas.test.mjs`.
