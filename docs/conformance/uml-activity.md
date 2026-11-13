# Conformance: the UML activity diagram

Release 0.21.0 (stage 4, `docs/diagrams/notes/stage-4.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no activity notation (its flowchart reader is milestone 2's),
and there is no XMI and no UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.activity"` is an activity diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 9; the example is
[`examples/fulfil-activity.json`](../../examples/fulfil-activity.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 16.2 Action (opaque) | `uml.Action` | a rounded box, its name wrapped to three lines of 180 px, then cut |
| 16.3 CallBehaviorAction | `uml.CallBehaviorAction`; `opensView` an activity view | a rounded box with the rake at its bottom right; Enter or a double-click opens the activity it calls |
| 16.3 SendSignalAction, AcceptEventAction | `uml.SendSignalAction`, `uml.AcceptEventAction` | a convex pentagon; a concave one |
| 15.4 ObjectNode, DataStoreNode | `uml.ObjectNode`, `uml.DataStoreNode` | a rectangle; a rectangle with «datastore» over its name |
| 15.3 InitialNode, ActivityFinalNode, FlowFinalNode | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode` | a filled circle; a ring round a filled circle; a circle with an X |
| 15.3 DecisionNode, MergeNode | `uml.DecisionNode`, `uml.MergeNode` | a diamond, which grows to hold a decision's question on at most two lines (a deviation, below) |
| 15.3 ForkNode, JoinNode | `uml.ForkNode`, `uml.JoinNode` | a bar across the flow, as long as its busier side needs; lines enter and leave on its long sides |
| 15.2 ControlFlow, ObjectFlow | `uml.ControlFlow`, `uml.ObjectFlow`; `label` the name, `props.guard` | a solid line with an open arrowhead, labelled `name [guard]` (`[else]` for else), cut at 280 px; the two kinds alike, told apart by the legend and the name |
| 15.6 ActivityPartition | `uml.ActivityPartition`; a node's `parent` its partition, a partition's the partition it is nested in | lanes: bands across the flow, as long as the diagram, a 22 px header strip per level of nesting, divided 12 px off the router's lines |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line; a comment is in no lane |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-4.md` §9.3); the first six are shared
with the interaction overview diagram (`src/uml/flow.js`): `flow-ends`, `initial-flows`, `final-flows`, `fork-join`,
`decision-merge` (errors where UML forbids, a warning where a diagram is only unfinished: a fork with one branch, a
decision with one exit), `decision-guards` (a warning); `object-flow`, `in-lane`, `calls-view` (warnings);
`partition-owner` (an error).

**Deviation from UML:** a decision's question is drawn inside its diamond, as flowchart readers expect; UML puts it in a
«decisionInput» note or beside the node (`notes/stage-4.md` S8). A merge and a decision are drawn alike, as UML draws
them; their accessible names tell them apart.

## Left out

`notes/stage-4.md` §18: pins and parameter nodes; exception handlers; interruptible, expansion and structured regions
(loop, conditional, sequence); time events; streaming and weights; join specifications; multi-dimensional partitions,
partitions that represent a classifier; central buffers; connectors; the activity's frame and parameters; a flow's
effect; decision input behaviour; an object node's type, state, upper bound and ordering; «selection» and
«transformation»; changing a flow between control and object kind (delete and add); moving a lane by hand (its order is
`nodeIds` order). And for all four stage 4 types: XMI, copy and paste, per-type `diff()` writers, resizing a lane by hand.

Layout limits, measured on `examples/fulfil-activity.json` and `tests/activity-stress.json`:

- Port repair is off (`notes/stage-4.md` §17): two lines that cross next to a shared side keep their ports. Example 9
  has two crossings laid out down and none right; `tests/activity-stress.json` one in its `edge-cases` view either way,
  and nine right and fourteen down in its `all` view (50 nodes, 60 flows, four lanes). All pinned, in
  `tests/activity.test.mjs`, `tests/stage4-fixtures.test.mjs` and `tests/cli.py`; CI's example check passes over them.
- No line runs along a lane's divider for more than 24 px in example 9 (`risks.md` L16).
- The column gap is one for every column: one long guard widens them all. A gap per column needs an option of the
  layout that does not exist yet; the maintainer accepted the uniform gap for 0.21.0 (13 Nov 2026).

## Writers: what each shows of an activity diagram

Measured on `examples/fulfil-activity.json` (0.21.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. Each file was opened and looked at.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Lanes with their headers, every node's shape, the call action's rake | Yes | Yes | Yes, in vectors |
| Flows, open arrowheads, guards | Yes. **Gap:** in Chrome's measure, example 9's `[else]` finds no room laid out down and is left to its line's name, which the still removes | Yes, the same | Yes, the same |
| An unnamed merge or decision | **Gap:** drawn with its id inside the diamond ("stock-ready" in example 9), as the type draws it everywhere | The same | The same, and its row reads its id |
| The legend of line kinds and control glyphs | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's and partition's `aria-label` kept; the flows' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each partition and node by its kind ("Decision", "Data store", "Call behaviour action"), its partition as its row ("in Warehouse"); "Lines": each flow from → to and its kind. **Gap:** a flow's guard is not in its row (the table reads a line's `label` only; `risks.md` R9). The called activity's view has pages of its own |

## Accessibility

Every piece has a name: "Action Take the next order from the queue, in Order worker", "Call behaviour action Take
payment, opens Take payment, in Order worker", "Decision All books in stock?, 2 exits, in Warehouse", "Fork, 3
branches, in Order worker", "Partition Warehouse, 10 nodes", "Control flow from All books in stock? to merge, guard
all books in stock". Tab reads each partition, then its nested partitions, then its nodes by column and row, then the
nodes in no lane, then the flows. `describe()` starts at the initial node and follows each flow once. Text reads at
4.5:1 and lines, outlines and dividers at 3:1 on the stage in both themes (`tests/activity.html`, `tests/stage4.html`).
Every editing gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/stage4-fixtures.test.mjs` on `tests/activity-stress.json`'s `all` view (50 nodes, 60 flows, four lanes), CPU
time, best of three after a warm-up, on an Apple M5 laptop at a load average of 6 to 8 (the idlest it got; 13 Nov
2026): a full layout and its SVG 22 ms, a guard 22 to 23 ms, a lane change 23 ms, a stereotype 21 to 23 ms, against the
100 ms target. CI holds 1 s and prints the figures (the maintainer's decision of 13 Nov 2026).

## Tests

`tests/activity.test.mjs` and `tests/activity.html` (the type, its rules with the shared flow rules, the example under
three fonts, both themes and both directions, every gesture by pointer and key, a 30-step session); `tests/lanes.test.mjs`
(the lanes); `tests/flow.test.mjs` and `tests/flow.html` (the shared shapes and rules); `tests/activity-minimal.json` and
`tests/activity-stress.json` with `tests/stage4-fixtures.test.mjs` and `tests/stage4.html` (`notes/stage-4.md` §16);
`tests/notation.html` (open arrowheads on the outlines); `tests/cli.py` (render, check, stills, pdf, the diff Action's
step); `tests/mcp.py` (the MCP server's read tools and a highlight).
