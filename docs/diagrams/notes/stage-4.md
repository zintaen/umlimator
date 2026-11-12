# Stage 4 design note: use case, activity, state machine and interaction overview

Status: **proposed**, awaiting the maintainer's approval. Written against `main` at af4a141 (0.19.0's release merged, #197;
stage 3's 3.0 to 3.7 merged, 3.8 being built). The maintainer approves it before work package 4.0 starts. Symbols are
named, not line numbers.

Stage 4 ships release 0.21.0: the use case diagram (`uml.use-case`), the activity diagram (`uml.activity`), the state
machine diagram (`uml.state-machine`) and the interaction overview diagram (`uml.interaction-overview`) (`plan.md` §5,
row 4). Its new engine work: shapes that are not boxes (L12), explicit nestable lanes, regions in compound nodes, and the
transition micro-syntax. Its reader: Mermaid's `stateDiagram`.

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 8, 9, 10 and 13 | Kept, with refinements: partitions nest; a flow's name and guard share one label; regions are optional; a transition never ends on a region; the overview's `uml.Interaction` is an inline interaction | §3 |
| S2 | Which shapes are not boxes, and their sizes | Twelve shapes in four family files: those three types share in `src/uml/flow.js`, the rest in their type's file. Each gives `size`, `out`, `face`, `inset` and `draw`, and a hit area of 24 px at least | §4.1 |
| S3 | How a line ends on a shape that is not a box | The router keeps ending lines on the node's box; the typed line drawer slides each end along its side's normal onto the outline with the shape's `inset`, as maps already do for their card shapes. In `src/typed/draw.js`, so no core byte | §4.2 |
| S4 | Lanes (partitions) | Bands across the flow, laid out by moving each node's row into its lane's run of rows before the layered layout, in `src/layout/lanes.js`. Partitions are nodes drawn as a header strip; the bands are drawn in the type's `under` layer. No core byte | §5 |
| S5 | Regions in compound nodes | A state with a shown substate is a box (stage 2's `boxes`); each region of it is a nested box whose id is the region's (a member's) id. Regions are drawn by a dashed divider in the gap between them, stretched across the state | §6 |
| S6 | The transition micro-syntax | `trigger [guard] / effect`, read by one hand-written parser shared by the state type, the activity type's flow labels and the Mermaid reader; `print(parse(x))` is stable, and a text the parser cannot read is refused and kept as written (E3) | §7 |
| S7 | A long transition or guard label | A typed line may carry `cut`, the width its label is cut at; the state and activity types set 280 px. One field in `layered.js`'s `labelW`, the stage's only planned layout change in the core | §7.4 |
| S8 | A decision node's text | The diamond grows to hold it, on at most two lines; with no text it is 28 px | §4.1 |
| S9 | Renaming a line through its type | A new hook, `edits.rename(model, view, id, text)`, which `src/typed/edit.js` calls from the canvas's `I.label`. No core byte | §12.1 |
| S10 | Deleting a partition | The activity type's `remove` hook moves what the partition holds to the partition's own parent, then deletes it: a partition groups, it does not own | §9.4 |
| S11 | The inline interaction | Drawn at full size inside an `sd` frame, from the sequence type's own geometry, read only; opened to be edited. Above 8 lifelines or 20 messages it is drawn as its frame and name, with a warning | §11.2 |
| S12 | The Mermaid state subset | §13's table, against Mermaid 12.3.0, with the limits of 3.6 (1 MiB, linear, never throws) and a nesting limit of 64 | §13 |
| S13 | The PDF's tables per type (R8, and R9, new) | A type may give `rows(model, view, id)`, the text `print.js` lists for an element in place of its members, and `word(model, id)`, its kind; typed tables are headed "Elements" | §15 |
| S14 | The core's budget (C5) | Stage 4 spends at most 600 B of the 2,777 B left after 3.8; everything listed in §2.3 stays in family files | §2.3 |
| S15 | P1 for the common edit | A transition's label, a flow's guard and a use case's name are laid out and drawn in under 100 ms on each stress fixture, as 3.5 did for messages; `reroute: false` is the means | §17 |
| S16 | C10 for the four types | Tested in 4.10 as 2.6 did (the MCP server, the diff Action), per-type `diff()` writers left to the package after 0.20.0 | §19.5 |
| S17 | Order with stage 3 | 4.0 follows 3.8's merge; 0.21.0 ships after 0.20.0 | §19.3 |
| S18 | Choosing the view an interaction use or a call behaviour action opens | A picker of the model's views of the right kind when the element is added, through the `add` hook; no new properties field | §12.2 |
| S19 | A composite state's entry, do and exit | Not drawn on its box in 0.21.0; in its accessible name, `describe()`, the panel and the PDF | §10.1 |

What is left out of the subsets is in §18.

## 2. Where stage 4 starts

### 2.1 What it builds on

- **Stage 2's boxes** (`notes/stage-2.md` §3, §4): `boxes(model, view)` on a type; `blockPos` places a box's contents as a
  block; `layoutPass` keeps boxes 32 px apart, ends a line on a box's border and routes across borders; a box is drawn by
  its shape's `frame(f)` and selected as a container; a drop into a box, or the Owner field (`owners`), emits `reparent`.
- **Stage 3's hooks** (`notes/stage-3.md` §5.1, `src/typed/edit.js`): `edits.connect`, `moveTo`, `wrap`, `add`, `remove`;
  lines from a node to itself by gesture; key rings on typed lines; `geo.order`; `{ error }` on the hint line.
- **Stage 3's frames and interaction code**: `frame()`, `frameTag()` and `SHAPE.use` in `src/uml/frame.js` (its comment
  already names stage 4's inline interactions, state regions and partitions); `sqRun` and `sqDraw` in
  `src/uml/sequence.js`; `layoutTimeAxis` in `src/layout/timeaxis.js`. The interaction overview imports them and edits none.
- **The class type's look** (`typeGeo`, `drawnLines`, `legendOf`, `describeAs` in `src/uml/class.js`), and `ownersOn`,
  `readingOrder` and `ownerChoices` in `src/uml/owners.js`.
- **`apply()`** reparents to a member (a region) already: `reparent` refuses only a member as the child and a line as the parent.

### 2.2 What was read at af4a141

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | `svgOf` (`src/draw/svg.js`) | A map's line ends are slid onto its cards' outlines (`drawnPts`, by each shape's `inset`). A typed view's are not: `drawn` is `e.pts`, so a line ends on the node's box | S3 |
| Q2 | `layoutPass`'s port capacity (`cap`) | A side holds `max(1, ⌊length × 0.84 / 14⌋)` ports; extras on the left and right go to the top and bottom. A 20 px node takes one port per side | §4.2 |
| Q3 | `labelW` and `fullOf` in `src/layout/layered.js` | A typed line's label is one line of 10 px text, cut at 150 px. "capture failed [attempts < 3] / count the attempt" is about 250 px | S7 |
| Q4 | `svgOf`'s typed line `<title>` | It holds `e.aria`, so a cut label's full text is in its tooltip and accessible name already | S7 |
| Q5 | The map's `lanes` (`deriveLanes`, `src/map/context.js`) | Run-order lanes of a numbered view, laid out with absolute positions; flat and not typed | S4 |
| Q6 | `blockPos` | A group's items are ranked by the lines between them only. Two regions of one state, with no line between them, take one rank: they are stacked in one column | S5 |
| Q7 | `typedEditor`'s gesture slots (`I`, `src/canvas/edit.js`) | `I.label` is a slot, called by the canvas's `rename()` with the drawn text: `src/typed/edit.js` can take it over | S9 |
| Q8 | The default palette add (`I.addNode`) | Copies the entry's `type` only, not its `props`: a pseudostate's `kind` needs the `add` hook | §12.1 |
| Q9 | The properties panel's field kinds | `text`, `enum` (static options), `list`, `bool`; every field writes under `props`. `opensView` is not a `props` field | S18 |
| Q10 | `print.js` | A typed view lists each element's type word and its members by the type's `member.print`, and each line's label and kind, under the map's heading "Cards" | S13 |
| Q11 | `context.js`'s `opensOf` | A typed node's `opensView` opens its view as a card's does (a click on the selected node) | §9, §11 |
| Q12 | `ownersOn` (`src/uml/owners.js`) | Box types are fixed (`OWN_BOXES = ['uml.Package']`), names are qualified, and only model nodes are indexed, not members | §8.2, §6 |

### 2.3 The core's budget (C5, S14)

Measured with `gzip -9` as C5 says: `lib/umlimator.js` is 186,787 B at af4a141, and 186,920 B once 3.8 has merged. The
cap is 189,697 B (0.16.0's 164,954 B plus 15%). That leaves 2,777 B for stages 4 to 6 and the three milestones, and stage
5 (ports on borders, deep nesting) is the one most likely to need the layout's code.

What stays out of the core, in files listed in `tools/build.mjs`'s `ALL` only:

- every new shape, its size, outline and hit area;
- sliding a typed line's ends onto an outline (`src/typed/draw.js`);
- the lanes' rows and bands (`src/layout/lanes.js`);
- the regions' boxes and dividers, the state's frame;
- the transition micro-syntax, its parser and printer;
- every type's definition, rules, `describe()`, names, legend and hooks;
- `edits.rename` (`src/typed/edit.js`);
- the inline interaction's drawing;
- the Mermaid state reader and writer.

What may touch the core, each change stating its bytes in its pull request:

| Change | File | Lane | Target |
|---|---|---|---|
| A typed line's `cut` (S7) | `src/layout/layered.js` | 4.1 | 40 B |
| `rows` and `word` read by the PDF's tables; "Elements" for a typed view (S13) | `src/page/print.js` | 4.9 | 150 B |
| A box whose id is a member's, if `blockPos`, `withPlaces` or the drop need it (§6.3) | `src/map/context.js`, `src/canvas/render.js` | 4.1 | 200 B |
| The new registry fields documented | `src/core/registry.js` | 4.1 | 150 B: the build keeps comments, so they count |

| Option | For | Against |
|---|---|---|
| **(a) Stage 4 spends at most 600 B; anything over waits for the maintainer (recommended)** | Leaves over 2,100 B for stage 5's ports and the rest; each change above has a family-file fallback | The fallbacks are worse: a 150 px cut, a PDF without a state's activities |
| (b) First come, first served | Nothing to decide | Stage 5 may find no room for ports, the one change that cannot be a family file's |
| (c) Raise C5 | No wait | The maintainer's call; maps' hosts pay for UML |

If (a) holds and a change goes over, the fallbacks are, in this order: S13 keeps the "Cards" heading and lists members only
(the fidelity table states the gap); S7 keeps the 150 px cut; a member-id box falls back to §6.3's node form.

### 2.4 Rules every package keeps

- **Maps draw exactly as now.** The geometry hashes (`bench/expected.json`), the examples' stills and every map test are
  unchanged in every pull request (C1).
- **Every typed example draws exactly as now.** The class, package, object, sequence and communication examples' markup is
  held by `tests/core-diet.html` and each type's own tests. The classifier's `inset` is 0, so S3's slide moves none of
  their line ends; a line with no `cut` is cut at 150 px as now.
- **The API is additive only** (C2). Nothing is exported from `lib/umlimator.js` that was not; the four types, the
  parser and the reader are internal, in `lib/umlimator-all.js`, as stage 3's helpers are. New registry fields
  (`edits.rename`, `rows`, `word`, a line's `cut`) are optional and provisional; a type without them behaves as before.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment`, `uml.CommentLink` and `props.stereotypes` are on every UML view already
(`model.md` §2).

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 8 | `uml.use-case` | `uml.Actor`, `uml.UseCase`, `uml.Subject`, `uml.Comment` | `uml.ExtensionPoint` (of a use case) | `uml.Association`, `uml.Include`, `uml.Extend`, `uml.Generalization`, `uml.CommentLink` | A use case's `parent` is a subject, or none. Extend props: `extensionPoints` (ids of the extended use case's extension points), `condition` (text). An association joins an actor and a use case; its ends' props are not read |
| 9 | `uml.activity` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.Action`, `uml.CallBehaviorAction`, `uml.SendSignalAction`, `uml.AcceptEventAction`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.ObjectNode`, `uml.DataStoreNode`, `uml.ActivityPartition`, `uml.Comment` | | `uml.ControlFlow`, `uml.ObjectFlow`, `uml.CommentLink` | A node's partition is its `parent`; a partition's `parent` is a partition (nested lanes) or none. A flow's `label` is its name, `props.guard` its guard. A call behaviour action's `opensView` names an activity view |
| 10 | `uml.state-machine` | `uml.State`, `uml.Pseudostate`, `uml.FinalState`, `uml.Comment` | `uml.Region`, `uml.InternalTransition` (of a state) | `uml.Transition`, `uml.CommentLink` | State props: `entry`, `do`, `exit`. Pseudostate `props.kind`: `initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate`. Transition and internal transition props: `trigger`, `guard`, `effect`, each text (§7). A substate's or pseudostate's `parent` is a state, or a region of one; at the top, none |
| 13 | `uml.interaction-overview` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.InteractionUse`, `uml.Interaction`, `uml.Comment` | | `uml.ControlFlow`, `uml.CommentLink` | An interaction use (drawn `ref`) or an inline interaction (`uml.Interaction`, drawn `sd` with its content) names its `uml.sequence` view in `opensView`; those views, with their lifelines and messages, are in the same model. A flow's guard is `props.guard` |

What changed against `model.md`:

- **Partitions nest.** `model.md` says a node's partition is its `parent`; a partition's own `parent` may now be a partition.
  A node owned by a partition nested in another is in both lanes. Multi-dimensional partitions (a grid) are out (§18).
- **A partition groups; it does not own.** UML's partitions do not own their nodes. The model keeps `parent` for them,
  but deleting a partition keeps what it held (S10, §9.4).
- **A flow's name and guard.** An activity or overview flow is drawn `name [guard]`; F2 edits both through §7's parser,
  with the trigger's place holding the name and no effect allowed (§7.3).
- **Regions are optional.** A composite state with substates whose `parent` is the state itself has one implicit region.
  A state with both regions and direct substates is warned of (`region-mixed`); its direct substates are drawn in an
  implicit region before the others.
- **A transition never ends on a region** (`model.md` §3's open point for stage 4): its ends are states, pseudostates or
  final states (`transition-ends`, an error). Entry and exit points stay out.
- **Pseudostates have no label.** One that has one is drawn without it, and its accessible name carries it.
- **The overview's `uml.Interaction` is an inline interaction.** It and `uml.InteractionUse` are nodes here; in a sequence
  view an interaction use is an item in `edges` (row 11). The two never meet: each view's type reads its own.
- **Extend's points are ids.** `props.extensionPoints` lists ids of `uml.ExtensionPoint` members of the use case the extend
  points to (`08-use-case.json` already does). A name that is not one is an error (`extend-points`).

The four example files keep their shapes. `check.mjs` gains no hand rule for them: each type's `validate` runs there.

## 4. Shapes that are not boxes (L12, S2, S3, S8)

### 4.1 The shapes

Each is a `SHAPE` entry added by a family file, as `src/uml/class.js` adds `SHAPE.note`: `size(n)` from its text, `out(n, d)`
its outline, `face(n)` the span of its left and right sides where ports go, `inset(n, side, t)` how far inside the box's
side its outline is at `t`, `ports` from `portsOn`, and `draw(n, c, f)`. Text is cut with `fit`, never overflows; strokes
are `--um-muted`, fills the stage's background or `--um-text` (T2).

| Shape | For | Size | Outline and ports | Hit area |
|---|---|---|---|---|
| `initial` | Initial node, initial pseudostate | 20 px circle, filled | A circle; one port per side (Q2) | A transparent 24 px circle |
| `final` | Activity final, final state | 22 px, a ring round a filled circle | A circle | 24 px |
| `flow-final` | Flow final | 22 px, a circle with an X | A circle | 24 px |
| `diamond` | Decision, merge, choice | 28 px with no text; with text, grown to hold it on at most two lines of 11 px, cut at 160 px a line (S8) | A diamond; side ports slide onto its edges | Its own outline |
| `bar` | Fork, join (both node and pseudostate) | 6 px thick, across the flow: `L × 6` laid out down, `6 × L` right, `L` = max(48, 16 × (lines on its busiest side + 1)) | Its long sides hold the ports; its ends hold none | A transparent band 24 px thick |
| `junction` | Junction pseudostate | 12 px filled circle | A circle, one port per side | 24 px |
| `history` | Shallow and deep history | 24 px circle with `H` or `H*` | A circle | Its own outline |
| `terminate` | Terminate pseudostate | 20 px X | Its box (an X has no outline to slide to) | 24 px |
| `rounded` | Action, call behaviour action, state | As the classifier: text from 96 to 320 px wide; an action's name wraps to three lines of 180 px, then is cut | A rectangle with 10 px corners; `face` leaves the corners out | Itself |
| `signal` | Send signal action (convex pentagon), accept event action (concave) | As `rounded`, plus 14 px for the point or notch | The pentagon; a port on the pointed side slides to its edges | Itself |
| `ellipse` | Use case | Its name wrapped to three lines of 160 px, the ellipse 1.3 times that box; with extension points, a divider and the compartment "extension points" under the name | An ellipse; ports slide onto it | Itself |
| `actor` | Actor | A stick figure 24 × 44, its name under it, the node as wide as the wider | Its box, narrowed to the figure's 24 px column on the left and right | Itself |

The state's frame, the subject's frame, the partition's header and the inline interaction are boxes, in §5, §6, §8 and §11.
Two shapes each come in two types' looks: `bar` for a fork and a join, `diamond` for a decision and a merge. A merge and a
decision are drawn alike, as UML draws them (risks.md §6, F); their accessible names tell them apart (L13).

### 4.2 How a line ends on them (S3)

| Option | For | Against |
|---|---|---|
| **(a) The router ends a line on the node's box, as now; the typed line drawer slides each end along its side's normal onto the outline with `inset` (recommended)** | What maps do (`drawnPts`, Q1); the code sits in `TYPED.lines` (`src/typed/draw.js`), which mutates `drawn` before `svgOf` uses it for the path, the arrowhead's trim, the end labels and the hit line; no core byte. The classifier's `inset` is 0, so no class, package or object picture moves | The last segment lengthens by the inset: on an ellipse's side far from its middle, a long stub. Ports on a small node are one per side |
| (b) Ports on the outline from the start: the router reads `ports()` | Exact ends, short stubs | `layoutPass`'s port code is the core's; a change there moves maps' geometry hashes unless guarded, and costs bytes stage 5 needs for its ports |
| (c) Every shape draws inside a box and the line ends at the box | Nothing to build | A line stops in the air beside a circle or a diamond: what L12 is about |

How (a) behaves on each shape:

- **Small circles** (20 to 24 px) take one port per side (Q2); extras on the left and right go to the top and bottom, as
  for any node. A port at a side's middle is on the circle, so the slide is 0 for a single line.
- **The diamond:** a single port per side is its vertex. Several on one side slide onto its edges and meet them at an angle.
- **The bar:** lines enter and leave on its long sides; the bar grows with the busier side (§4.1), so ports keep 16 px apart.
- **The actor:** a line ends at the figure's column, not at its name's width.
- **Arrowheads** are trimmed from the slid line, so the tip touches the outline (`tests/notation.html`'s rule, now for these shapes).

4.1 checks every consumer of `drawn` in `svgOf` and `endLabels`. If one reads `e.pts` instead, the slide moves to the
point `drawn` is built, which is the core's (`svgOf`), at about 40 B within the stage's share.

### 4.3 Where the code goes

| File | Holds | Why there |
|---|---|---|
| `src/uml/flow.js` | `initial`, `final`, `flow-final`, `diamond`, `bar`, `rounded`; the flow rules shared by the activity and overview types (§9.3, §11.3); the flow label's print (`name [guard]`) | Three types draw them; one lane builds them before the types. `rounded` is here so that neither the activity file nor the state file imports the other |
| `src/uml/activity.js` | `signal`; the action's and the call behaviour action's looks on `rounded` | The activity's own |
| `src/uml/state.js` | `junction`, `history`, `terminate`; the state's look (`rounded` with a compartment of activities); the state's and the region's frames | The state machine's own |
| `src/uml/usecase.js` | `ellipse`, `actor`, the subject's frame | The use case's own |

## 5. Lanes (S4, L10)

### 5.1 Options

| Option | For | Against |
|---|---|---|
| **(a) Bands: each node's row is moved into its lane's run of rows before `layoutTyped`; bands are drawn from the rows' extents in the type's `under` layer; partitions are nodes drawn as a header strip (recommended)** | Swimlanes as UML draws them: parallel bands across the flow, each as long as the diagram. A flow keeps its ranks along the bands. Pure geometry on positions, testable alone, no core byte. BPMN's lanes (milestone 4b) reuse it | The router does not know the bands: it may run a line along a divider (below). Lane sizes come from rows, so a lane is as wide as its busiest rank |
| (b) Partitions as stage 2's boxes | No new layout | `blockPos` ranks boxes by the lines between them, so a flow that goes back and forth between two lanes (`09-activity.json` does) places them one after another, not side by side; a box is as long as its content, not the diagram |
| (c) The map's run-order lanes (Q5) | They exist | Flat, absolutely positioned, numbered for a run order, and in the core |

### 5.2 The contract (`src/layout/lanes.js`)

```js
laneRows(pos, laneOf, lanes) -> pos'      // pos: { id: [col, row] } as ranked; laneOf: id -> its innermost lane, or null;
                                          // lanes: [{ id, parent, order }] outermost first. pos': each lane a run of rows
laneBands(g, lanes, laneOf, turned) -> { bands: [{ id, parent, depth, x, y, w, h, head }], shift }
```

- **Rows.** Within each column, the nodes keep their ranked order, sorted by lane (depth first, in `nodeIds` order). Lane
  `k` takes `rows_k` rows, the most of its nodes in any one column; lanes follow each other with no shared row. A nested
  lane's rows sit inside its parent's.
- **A node in no lane** (L10) goes in rows after every lane, outside them, with the warning `in-lane`.
- **An empty lane** keeps one row and a minimum width of 120 px.
- **Pins.** A pin's column is kept; its row is taken as an order inside its lane, so a pin never moves a node to another
  lane. Changing lane is a change of owner (§9.4).
- **Bands.** After the layout, each band spans the whole diagram along the flow, and across it from the middle of the gap
  before its first row to the middle of the gap after its last. A header of 22 px per level of nesting is added at the
  start of the flow (the top laid out down, the left laid out right); `shift` moves the geometry by it.
- **Dividers.** Drawn 10 px off each gap's centre line, which the router uses (`gapLinesY`). 4.5's fixtures check that no
  line runs along a divider for more than 24 px; if one does, the fixture pins it and the conformance note states it (as
  L8 does for boxes).

### 5.3 Drawing and selecting

- The bands' outlines and dividers go in the type's `under` layer, with `frame()` from `src/uml/frame.js`.
- Each partition is a node of the geometry with shape `partition`: its header strip, its name cut to the band, and a
  transparent hit area on the strip only. So a click on the header selects the partition, F2 renames it, Delete and the
  outline work, with no canvas change: stage 3's way for frames (`notes/stage-3.md` S2).
- A partition is not a Tab stop of its own: `geo.order` lists it before its first node (§14).

## 6. Regions in compound nodes (S5, L11)

### 6.1 The rule

1. A state is **open** (a box) when the view shows one of its substates, at any depth through its regions; otherwise it is
   drawn closed, as a simple state.
2. An open state with regions holds one nested box per region that holds something shown, in `members` order. A region
   that holds nothing shown is not drawn; the state's accessible name counts it.
3. An open state with no regions holds its substates directly (one implicit region).
4. The boxes are given by the state type's `boxes(model, view)`, built by `ownersOn` with §8.2's options (state and region
   as box types, members indexed), so the stage 2 code that places, routes and edits boxes takes them unchanged.

### 6.2 Drawing

- **The state's frame** (`SHAPE.state.frame`): a rectangle with 10 px corners on the box's border, the name in the 24 px
  header room, a solid line under it. Laid out down, the header room is on the turned side, as for packages (2.1).
- **A region's frame** draws no border. After the layout, the state type stretches each region's frame across its state
  (the axis the regions are not stacked along) and draws a dashed divider in the gap before each region but the first. A
  region's name, if it has one, is drawn at its top left in 10 px.
- **Stacking.** `blockPos` stacks a state's regions in one column (Q6): one above the other laid out right, side by side
  laid out down. A line between two regions' contents would rank one before the other (it is warned of, `region-cross`);
  the dividers are then drawn only where two regions' extents part on one axis, and the fixture checks the picture.
- **A transition to an open state** ends on its border; one to a substate crosses each border on the way (L8, L11).

| Option | For | Against |
|---|---|---|
| **(a) Regions as nested boxes with no border, a divider in the gap (recommended)** | Stage 2's code places and routes them; a region is selectable as a container and a drop into it reparents to it | The gap between regions is 32 px (the boxes' gap), wider than UML draws it |
| (b) A region as a compartment of a node laid out by the type itself, recursively | UML's tight picture | A recursive layout in a family file: lines across levels need a last routing pass the typed router does not do (stage 2 §3.1's option (b)) |
| (c) Regions not drawn: substates of all regions in one box | Nothing new | Orthogonal regions are the meaning of a fork into them |

### 6.3 Box ids that are members

A region is a member of its state, not a node: its id is not in `nodeIds` and `ownIndex` does not index it (Q12). 4.1 tests,
with a test-only type, that a box whose id is a member's is placed by `blockPos`, kept by `withPlaces`, selected as a
container, and receives a drop as `reparent { id, parent: <region> }`. Where one of them needs a change, it is made there,
within §2.3's 200 B. If that cannot be done within it, the fallback is that a region's box takes a geometry id of its own,
`<state>#<region>`, and the state type maps it back to the region in its `moveTo` and `rename` hooks. The maintainer is
asked only if neither works.

## 7. The transition micro-syntax (S6, S7)

### 7.1 The form

UML's `trigger-list ['[' guard ']'] ['/' effect]`. In `src/uml/transition.js`:

```js
parseTransition(text) -> { trigger, guard, effect } | { error }   // each part trimmed text, or undefined when absent
printTransition({ trigger, guard, effect }) -> text | null          // null: it would not read back (below)
```

- The trigger runs to the first `[` or `/` outside brackets. It may hold commas (a trigger list) and spaces
  (`after 30 days`); it is text (M8): no event is parsed.
- The guard runs from that `[` to its matching `]`, counting nested brackets (`a[0] > 1`). A `/` inside it is the guard's.
- The effect is everything after the first `/` outside the guard, trimmed; it may hold anything.
- Absent parts are left out; an empty text is all three absent. `printTransition` writes `trigger [guard] / effect` with
  one space round each part, leaving out what is absent.
- **Refused:** an unbalanced `[` or `]`; a second guard; a text over 4,096 characters. The text is kept as written in the
  field, nothing is applied, and the hint line says why (E3).
- **Not printable:** a trigger that holds `[` or `/`, or a guard with unbalanced brackets, which only a host can write
  into the model. `printTransition` returns null; the line is drawn with its parts joined by spaces, warned of by
  `label-syntax`, and its F2 text is that drawing, which the parser reads differently, so F2 then edits the parts in the
  properties panel only.
- **Round trip:** `print(parse(x))` is stable for every fixture text (E3), and `parse(print(p))` equals `p` for every
  printable `p`. The parser is linear and has no regular expression with nested repetition (R2). 4.2 tests 500 generated
  texts each way.

### 7.2 Where it is used

| Text | Read as |
|---|---|
| A transition's drawn label, F2 on it | `trigger`, `guard`, `effect` |
| An internal transition's member row | The same; a row with no trigger is warned of (`internal-trigger`) |
| A state's `entry`, `do`, `exit` | Not parsed: each is drawn as a row `entry / text` and edited in the properties panel |
| An activity or overview flow, F2 on it | The trigger's place is the flow's name, the guard its guard; an effect is refused ("a flow has no effect") |
| The Mermaid reader's `A --> B : text` and `A : text` | §13 |

### 7.3 Drawn

A transition's label is the printed text. A flow's is `name [guard]`; a guard alone `[guard]`. A guard named `else` is drawn
`[else]`.

### 7.4 A label longer than 150 px (S7)

| Option | For | Against |
|---|---|---|
| **(a) A typed line may carry `cut`, read by `labelW` and `fullOf`; the state and activity types set 280 px (recommended)** | About 40 B in the core; class, package, object and communication lines have no `cut` and keep 150 px, so their pictures do not move | Wider labels push columns apart |
| (b) Keep 150 px | No core byte | Most transitions with a guard and an effect are cut; their full text is only in the tooltip and accessible name (Q4) |
| (c) Labels on two lines | UML tools often wrap | The label's box height (18 px) and the label step are the core's: more bytes, more geometry |

## 8. The use case type

### 8.1 Drawing

- Actors are `actor`, use cases `ellipse` (extension points in their compartment, by name), the subject a box: a rectangle
  on the box's border, its name in bold at the top left of the header room, stereotypes over it.
- Lines: an association a plain line; an include dashed with an open arrow, labelled «include»; an extend dashed with an
  open arrow, labelled `«extend» (payment) [the shopper has a voucher code]`: its points by name, then its condition; a
  generalization with a hollow triangle (1.5's ends).
- Layout: `layoutTyped` from the host's ranking, as the class type's views are; direction right by default. Actors are ranked before the use cases they are
  associated with; a generalization is turned so the parent comes first (`rankFlip`), as in the class type; an extend
  is turned so the base comes first.

### 8.2 Subjects as boxes, with `ownersOn`'s options

`ownersOn(model, view, look)` gains an optional `look`: `{ boxTypes, qualify, members }`. With none it is stage 2's
(`['uml.Package']`, qualified names, nodes only), so the class, package and object views do not change. The use case type
passes `{ boxTypes: ['uml.Subject', 'uml.Package'], qualify: false }`: a subject with a shown use case is a box, and a use
case shown without its subject keeps its own name. The state type passes `{ boxTypes: ['uml.State'], qualify: false,
members: ['uml.Region'] }` (§6). A subject with nothing shown is drawn closed, as a rectangle with its name.

### 8.3 Validators

Each problem is `{ level, rule, path, message, ids }`, as in `class.js`.

| Rule | Level | Checks that |
|---|---|---|
| `association-ends` | error | An association joins an actor and a use case |
| `include-ends` | error | An include runs from a use case to another use case |
| `extend-ends` | error | An extend runs from a use case to another use case |
| `extend-points` | error | Each of an extend's `extensionPoints` is an extension point of the use case it points to |
| `generalization-kinds` | error | A generalization joins two actors or two use cases |
| `use-case-owner` | warning | A use case's owner is a subject or a package; an actor's is none or a package |
| `include-cycle` | warning | Includes form no cycle |
| `point-names` | warning | A use case's extension points have different names |

### 8.4 Editing

- Palette: Actor, Use case, Subject, Comment. Lines: Association, Include, Extend, Generalization, Comment link.
- Properties: an extend's condition (text) and extension points (a list, by id); stereotypes.
- Extension points are member rows, by name: add, rename, reorder, delete (the type's `member` hook). Deleting one drops it
  from every extend that names it (`refs: { 'uml.Extend': { 'props.extensionPoints': 'drop' } }`).
- A use case dropped into a subject's box, or the Owner field, reparents it (stage 2's gestures, through `owners`).

## 9. The activity type

### 9.1 Drawing

- Control nodes from `flow.js`; actions `rounded`; a call behaviour action `rounded` with UML's rake glyph at its bottom
  right, and opened by a click on it when selected (Q11); send and accept `signal`; an object node a rectangle; a data
  store a rectangle with «datastore» over its name.
- Flows: a control flow and an object flow are both drawn as a line with a filled arrow (UML draws them alike); the
  legend and the accessible name tell them apart. Labels `name [guard]` (§7.3).
- Layout: `layoutTyped` from the host's ranking, with `laneRows` applied to the ranked positions before it and
  `laneBands` after (§5). `direction` either
  way; `09-activity.json` is laid out down.

### 9.2 Lanes in the view

- A partition is shown when `nodeIds` lists it. A shown node whose partition is not shown is placed in the nearest shown
  partition above it, or in no lane.
- Nested partitions draw nested headers; the reading order is a partition, then its nested partitions, then the nodes in
  it by rank.

### 9.3 Validators

Rules marked "shared" are in `src/uml/flow.js`; the interaction overview runs them too.

| Rule | Level | Checks that |
|---|---|---|
| `flow-ends` (shared) | error | A flow joins two nodes of the type's control or action kinds; a partition or a comment is never a flow's end |
| `initial-flows` (shared) | warning | An initial node has no incoming flow and one outgoing |
| `final-flows` (shared) | error | An activity final or a flow final has no outgoing flow |
| `fork-join` (shared) | warning | A fork has one incoming and two or more outgoing flows; a join the reverse |
| `decision-merge` (shared) | warning | A decision has one incoming and two or more outgoing; a merge the reverse |
| `decision-guards` (shared) | warning | Each flow out of a decision has a guard, and at most one is `else` |
| `object-flow` | warning | An object flow has an object node or a data store at one end at least; a control flow has none at either |
| `partition-owner` | error | A partition's owner is a partition or none; a node's owner is a partition or none |
| `in-lane` | warning | On a view that shows a partition, every node is in one (L10) |
| `calls-view` | warning | A call behaviour action's `opensView` names an activity view of the model |

### 9.4 Editing

- Palette: every node type of row 9, Partition, Comment. Lines: Control flow, Object flow, Comment link.
- **Changing lane:** a node dropped in another band is moved there by the type's `moveTo` hook: `reparent` to the band's
  partition under the drop point (`at.pt`; the type keeps the bands it last laid out, by view), and the removal of its pin,
  in one transaction; dropped outside every band, to none. By keyboard: the Owner field, listing the partitions (`owners`).
- **Moving within a lane:** `moveTo` returns null, so Alt + arrows set a pin (§5.2: its row is an order inside the lane).
- **Deleting a partition (S10):**

| Option | For | Against |
|---|---|---|
| **(a) The type's `remove` hook reparents what the partition holds to its own parent, then deletes it (recommended)** | UML's partitions do not own; nothing goes that was not selected; `apply()` does not change | One `reparent` per held node before the `delete` |
| (b) `apply()`'s cascade: everything in it goes | One command | Deletes a lane's actions and their flows |
| (c) Refused while it holds anything | Safe | A step per node |

- Nesting a partition: its Owner field. Adding a node while a partition is selected puts it in that partition (`add` hook).

## 10. The state machine type

### 10.1 Drawing

- A simple state: `rounded`, its name, then one compartment of rows: `entry / …`, `do / …`, `exit / …`, then each internal
  transition printed (§7). `present.collapsed` and `rows` work as on a class (stage 1 note §5).
- A composite state: §6's box. Its `entry`, `do` and `exit` are not drawn on the box in this release (S19 below): they are in
  its accessible name, `describe()`, the properties panel and the PDF.
- Pseudostates and the final state: §4.1's shapes, by `kind`. An unknown `kind` is drawn as a junction, with the warning `pseudo-kind`.
- Transitions: a line with an open arrow, its label the printed text, cut at 280 px (S7).

| S19 option, a composite state's activities | For | Against |
|---|---|---|
| **(a) Not drawn on the box in 0.21.0; listed everywhere else (recommended)** | No core change: the box's header room is the core's 24 px | The picture omits them; the conformance note says so |
| (b) A header that grows to hold them | UML's picture | `layoutPass`'s header room becomes per box: core bytes and the map's geometry to guard |

### 10.2 Validators

| Rule | Level | Checks that |
|---|---|---|
| `transition-ends` | error | A transition joins states, pseudostates or final states, never a region, a comment or a line |
| `owner-kinds` | error | A substate's or pseudostate's owner is a state or a region of one; a region is a member of a state |
| `initial-one` | error | A region (or a state with no regions, or the top) has at most one initial pseudostate |
| `initial-out` | warning | An initial pseudostate has no incoming transition and one outgoing, with no trigger or guard |
| `final-out` | error | A final state and a terminate pseudostate have no outgoing transition |
| `choice-guards` | warning | Each transition out of a choice has a guard, and at most one is `else` (a choice with no `else`: risks.md §6, F) |
| `fork-join` | warning | A fork has one incoming and two or more outgoing transitions, a join the reverse; a fork's targets lie in different regions of one state |
| `history-owner` | error | A history pseudostate's owner is a state or a region |
| `region-mixed` | warning | A state does not hold both regions and direct substates |
| `region-cross` | warning | No transition joins the contents of two regions of one state |
| `internal-trigger` | warning | An internal transition has a trigger |
| `pseudo-kind` | warning | A pseudostate's `kind` is one of the eight |
| `label-syntax` | warning | A transition's parts print and read back (§7.1) |

### 10.3 Editing

- Palette: State, Initial, Final state, Choice, Junction, Fork, Join, Shallow history, Deep history, Terminate, Region,
  Comment. Each pseudostate entry carries its `kind`, which the `add` hook writes (Q8). Region adds a region to the
  selected state; with no state selected the hint line says so.
- Lines: Transition, Comment link. A self-transition is drawn by pointer or by `L` and the state's own name (3.4).
- **F2 on a transition** opens its printed text; Enter calls `edits.rename`, which parses it and emits one `set` per part
  that changed (`undefined` clears one). A text the parser refuses returns `{ error }` (E3).
- **Internal transitions and regions** are member rows of the state (the type's `member` hook): an internal transition by
  its printed text; a region as `region <name>`. A new row is read as an internal transition. Reordering regions moves
  their boxes.
- **Nesting:** a state dropped into an open state's or region's box reparents to it; the Owner field lists the states and
  regions of the model by their names from the top. A closed state becomes composite through the Owner field of what it
  will hold.
- **Deleting a state** deletes its regions and everything under it, as `apply()` does (a state owns its substates, unlike a
  partition). Deleting a region from the member list deletes what it holds; the hint line says how many.

## 11. The interaction overview type

### 11.1 Drawing

- Control nodes from `flow.js`; an interaction use is stage 3's `SHAPE.use` (`ref` tag, centred name); an inline
  interaction is §11.2's frame. Flows as in the activity type. Layout: `layoutTyped`, direction right by default
  (`13-interaction-overview.json` is laid out down).
- Both open their sequence view with a click on the selected node (Q11).

### 11.2 The inline interaction (S11)

| Option | For | Against |
|---|---|---|
| **(a) Its view drawn at full size inside an `sd` frame, read only, from `sqRun` and `sqDraw`; above 8 lifelines or 20 messages, the frame and name only, with the warning `inline-size` (recommended)** | UML's picture; the sequence code is reused as it is; a large one does not swamp the overview | The inline content cannot be selected or edited in place: it is opened |
| (b) Always the frame and name only | Simple | Then it is an interaction use with another tag |
| (c) Scaled to fit a fixed width | Any size fits | Text below 8 px cannot be read; three fonts' checks fail |

How (a) works: the node's size is the time axis's bounds plus the `sd` tag's row. Its `draw` writes the sequence's
`under` layer, then each head through `SHAPE.lifeline.draw` and each message as a path with its own arrowhead path,
inside a `<g transform>`. The inner markup loses `class="node"`, `data-id` and `tabindex`, so the canvas sees one node.
The inline view's messages are counted in the node's accessible name, not read one by one.

### 11.3 Validators and editing

| Rule | Level | Checks that |
|---|---|---|
| The shared flow rules (§9.3) | | |
| `opens-sequence` | error | An interaction use's or inline interaction's `opensView` names a `uml.sequence` view of the model |
| `overview-kinds` | warning | The view shows only row 13's node types |
| `inline-size` | warning | An inline interaction's view has at most 8 lifelines and 20 messages (S11) |

- Palette: Initial, Final, Decision, Merge, Fork, Join, Interaction use, Inline interaction, Comment. Lines: Control flow,
  Comment link.
- Adding an interaction use or an inline interaction asks for its view (S18). A guard is edited by F2 (§7.2).

## 12. Editing through the canvas hooks

### 12.1 Hooks used, and the one added

Every type's gestures go through stage 3's hooks. One is added, in `src/typed/edit.js` only:

| Hook | Called by | Used by |
|---|---|---|
| `connect(model, view, from, to, at, line)` | Connect, by pointer and by `L` | The activity type: a flow from a decision gets the guard `else` when it is its second exit with no guard |
| `moveTo(model, view, id, at)` | A drop, Alt + arrows | Activity (§9.4, a drop across lanes); the others return null: a pin, or a drop into a box (stage 2) |
| `add(model, view, entry, label, at)` | Palette, `N` | State (a pseudostate's `kind`, a region); activity (into the selected partition); overview and activity (the view picker, S18) |
| `remove(model, view, ids, fromModel)` | Delete, Shift + Delete | Activity (S10) |
| **`rename(model, view, id, text)` (new)** | F2 or a double-click on a selected element, through the canvas's `I.label` (Q7) | State (a transition), activity and overview (a flow): the parsed parts as `set`s. Null: `set label`, as now |

`rename` returns what the others return: commands, `{ commands, say }`, null or `{ error }`. 4.1 adds it, with a test-only
type in `tests/type-hooks.html`, and documents it in `src/core/registry.js` beside `edits`.

### 12.2 Choosing the view it opens (S18)

| Option | For | Against |
|---|---|---|
| **(a) The `add` hook opens a picker (`c.picker`, as `W` does) of the model's views of the right kind; the element is added with `opensView` set. Changing it later: delete and add again (recommended)** | No core byte; one gesture. The fixtures and examples set `opensView` in JSON | No way to retarget one in the panel |
| (b) A properties field kind `view`, writing a top-level field | Retarget in place | The panel is the core's `src/canvas/edit.js` (Q9): bytes, and a new field kind every type then offers |

With no view of the right kind, the picker says so on the hint line, and nothing is added.

## 13. The Mermaid state reader and writer (S12)

`src/readers/mermaid-state.js` has `readMermaidState(text) → { model, report }` and `writeMermaidState(model, viewId?) →
text`, internal like the other two readers. It is written against Mermaid 12.3.0's stateDiagram page, the version the
class and sequence readers use: hand-written and linear, with a 1 MiB limit (R2), ids from names (R3), and it never throws.
`umlimator.py import` routes `stateDiagram` and `stateDiagram-v2` to it through Node (R7). Its helpers are its own (`mt…`),
since the readers share one scope in `lib/umlimator-all.js`.

| Mermaid | Read as | Report |
|---|---|---|
| `stateDiagram`, `stateDiagram-v2` | One `uml.state-machine` view | |
| `s1`, `state s1`, `state "Long name" as s1` | A `uml.State`, its id `s1`, its label the name | |
| `s1 : text` | Read by §7's parser: `entry / x`, `do / x`, `exit / x` as those props; any other text with a trigger and a `/` as an internal transition | approximated, for a text that is neither: kept in `ext.mermaid.description` |
| `s1 --> s2`, `s1 --> s2 : text` | A `uml.Transition`, its text parsed (§7) | approximated when the parser refuses: the text kept as the trigger's in `ext.mermaid.label` |
| `[*] --> s1`, `s1 --> [*]` | An initial pseudostate and a final state of the enclosing scope, once each per scope | |
| `state s1 { … }`, nested | A composite state; its contents get it as `parent` | |
| `--` inside a composite | Regions: ids `<state>.r1`, `<state>.r2`, …; contents get the region as `parent` | |
| `state f <<fork>>`, `<<join>>`, `<<choice>>` | A pseudostate of that kind | |
| `note left of s1 : text`, `note right of s1` … `end note` | A `uml.Comment` and a `uml.CommentLink` to `s1` | approximated: the side is not kept |
| `direction LR`, `TB` | The view's `direction`: `right`, `down` | approximated for `RL`, `BT`, and a `direction` inside a composite |
| `classDef`, `class`, `:::`, `style`, `hide empty description`, `scale`, `accTitle`, `accDescr`, `%%{init}%%` | Not read | skipped |
| `title`, or `title` in front matter | The view's title | |
| `%% id: <id>` above a statement; `%% kind: <kind>` above a state; `%% region: <id> <name>` before a region | That element's id; a junction, history or terminate pseudostate; a region's id and name | |
| A line the reader does not know | Not read | skipped |

Ids and limits:

- A state's id is its Mermaid name; an initial pseudostate's `<scope>.start` (the top's `start`), a final state's
  `<scope>.end`; a transition's `<from>-<to>`, then `-2`, `-3` for each pair, so inserting one renames only the later
  transitions of its own pair. Reading the same text twice gives the same ids.
- Hostile input, as 3.6: over 1 MiB, nothing is read; composites nested deeper than 64 levels are read flat from there,
  reported; an unclosed `{` is closed at the end, reported; a `}` with nothing open is skipped; names such as
  `constructor` or `__proto__` are looked up with own-key checks (M3); no regular expression with nested repetition runs
  on a whole line. A 1 MiB file of nested braces and one of 50,000 transitions each read in under 1 s.

The writer:

- writes one state machine view, `direction LR` for a view laid out right (Mermaid's default is down);
- writes `state "label" as id` where the label is not the id; `entry`, `do`, `exit` and internal transitions as `id : …`
  lines, printed by §7;
- writes composites nested with `--` between regions, and a region's id and name as `%% region:` when the reader would not
  derive them;
- writes choice, fork and join as `<<…>>`; junction, shallow and deep history and terminate as a plain state under a
  `%% kind:` comment, labelled `●`, `H`, `H*` and `×` so Mermaid shows something near UML;
- writes each transition with its printed label; an initial pseudostate or final state as `[*]`, with `%% id:` above its
  first transition when its id is not the one the reader derives;
- writes a comment linked to one state as a `note right of`; any other as `%% not written:`;
- writes a second final state in one scope as one `[*]`, and says so in `%% not written:`, since Mermaid merges them.

`read(write(model))` equals the model on the subset, ids included, for `10-state-machine.json` and 500 generated models.
`tests/import/state.mmd` holds every construct on Mermaid's page and pins the report (R4).

Mermaid has no use case, activity or interaction overview notation. Its flowchart reader is milestone 2's.

## 14. `describe()`, accessibility and legends

Each type gives `describe(model, viewId)`, `geo.order` (the canvas's reading order, S13 of stage 3), an accessible name
for every node and line (A1, L13), and a legend of what the view draws.

| Element | Accessible name |
|---|---|
| Actor | "Actor Shopper" |
| Use case | "Use case Check out, in Online bookshop, 2 extension points" |
| Subject | "Subject Online bookshop, holding 8 use cases" |
| Extend | "Extend from Redeem a voucher to Check out, at payment, when the shopper has a voucher code" |
| Initial node, final nodes | "Initial node", "Activity final", "Flow final, in Email service" |
| Action | "Action Take the next order from the queue, in Order worker" |
| Call behaviour action | "Call behaviour action Take payment, opens Take payment" |
| Decision, merge | "Decision All books in stock?, 2 exits"; "Merge, 2 entries" |
| Fork, join | "Fork, 3 branches"; "Join, 2 branches" |
| Partition | "Partition Warehouse, 9 nodes" |
| Flow | "Control flow from All books in stock? to merge, guard all books in stock" |
| State | "State Placed, entry reserve the books, do poll the payment provider, exit log the payment result, 1 internal transition" |
| Composite state, region | "Composite state Fulfilling, 2 regions"; "Region Parcel of Fulfilling, 3 states" |
| Pseudostate | "Initial pseudostate in Parcel", "Choice", "Shallow history in In delivery", "Terminate" |
| Transition | "Transition from Capturing payment to itself: capture failed [attempts < 3] / count the attempt" |
| Interaction use, inline | "Interaction use Find a book, opens Find a book"; "Inline interaction Queue the order, 3 lifelines, 3 messages" |

Reading order (`geo.order`): use case: actors, then each subject and its use cases, then the rest, then the lines;
activity: by lane (a partition, then its nested partitions, then its nodes by rank), then the lines; state: `readingOrder`
(a box, then what it holds, depth first), then the transitions; overview: by rank, then the flows.

`describe()` writes the view in sentences, as the class type's does: what it holds, then each line by its accessible name.
An activity's starts at its initial node and follows each flow once; a state machine's starts at the top initial
pseudostate.

The legend names each line kind drawn and each control glyph drawn (initial, final, flow final, fork, join, decision,
history, terminate), with 1.9's `legendItem` form.

Contrast: lines and outlines are `--um-muted` (5.95:1 light, 7.05:1 dark, 1.11); filled glyphs `--um-text`. Hit areas are
24 px at least (E8). Every gesture has a key (§12).

## 15. The PDF's tables (R8, R9)

R8 closed in 0.19.0: a typed view's PDF lists each element's type word and members, and each line's label and kind (Q10).
What stage 4's types keep is mostly in `props`, so the tables would miss a state's activities, a pseudostate's kind, a node's
partition and an extend's points. That is new row **R9**.

| Option | For | Against |
|---|---|---|
| **(a) A type may give `rows(model, view, id) → [text]`, listed in place of the members, and `word(model, id) → text`, the kind; a typed view's first table is headed "Elements" (R8's leftover) (recommended)** | The four types list what they mean: "Initial pseudostate", "entry / reserve the books", "in Warehouse". About 150 B in `print.js` | Core bytes, within §2.3 |
| (b) The fidelity table of each conformance note lists the gaps | No core byte | Four notes with the same gap |

Under (a): a state's rows are its activities and internal transitions; a pseudostate's word is its kind; an action's rows
its partition; a use case's its extension points; an extend's line label is its drawn label already.

## 16. Fixtures

From `risks.md` §6 F and G3, L10, L11, L12 and L13. Each lives in `tests/`, is laid out in Node and in Chrome under three
fonts and both themes, in both directions, with no overlap, no text overflow, no line through a node, no line end off its
shape's outline (by 1 px) and none through a box's header.

| Fixture | Holds |
|---|---|
| `usecase-minimal.json` | An actor, a use case in a subject, an association |
| `usecase-stress.json`, view `edge-cases` | A use case in no subject (G3); an actor's generalization; a use case's; an include chain; two extends into one base at two points, one with a condition; a use case with six extension points; a three-line name; a long actor name; a closed subject; an extend naming a missing point (error) |
| `usecase-stress.json`, view `all` | 50 elements, 60 lines (P1) |
| `activity-minimal.json` | Initial, action, final |
| `activity-stress.json`, view `edge-cases` | A decision with three exits (F); a merge and a decision side by side (F); a fork with a branch that ends early in a flow final (F); an object flow through an object node; a data store; send and accept; a call behaviour action opening a view; partitions nested two deep (L10); a node in no lane (warned, outside); an empty lane; a flow across three lanes; a loop back through a merge; a decision with no guard on one exit (warned) |
| `activity-stress.json`, view `all` | 50 nodes, 60 flows, four lanes (P1) |
| `state-minimal.json` | Initial, a state, final |
| `state-stress.json`, view `edge-cases` | A self-transition (F); a transition to a shallow history (F); a choice with no `else` (F, warned); a composite with two regions (L11); a transition from a substate to a state outside (L11) and one into a substate from outside; a fork into two regions and a join out; composites nested three deep; a state with entry, do, exit and three internal transitions; terminate; junction; deep history; a 300 px transition label (cut, full text in its name); two transitions between one pair (F2); a state with regions and a direct substate (warned) |
| `state-stress.json`, view `all` | 50 states, 60 transitions, composites three deep (P1) |
| `overview-minimal.json` | Initial, an interaction use, final, and its sequence view |
| `overview-stress.json`, view `edge-cases` | A decision looping back through a merge; a fork and join round an inline interaction and a use; an inline interaction of 6 lifelines and 12 messages; one of 9 lifelines (frame only, warned); a use whose view is missing (error) |
| `overview-stress.json`, view `all` | 40 nodes, 50 flows, 10 inline interactions (P1) |
| `tests/import/state.mmd` | Every construct on Mermaid's stateDiagram page (§13) |

Each validator also has a passing and a failing case in its type's test. The four target examples move to
`examples/shopping-use-cases.json`, `examples/fulfil-activity.json`, `examples/order-states.json` and
`examples/buy-book-overview.json`, and join the gallery and CI.

## 17. Performance (P1, S15)

| Fixture | Budget, enforced in Node (best of three) |
|---|---|
| Each stress fixture's `all` view | A full layout, plus SVG markup, under 1 s |
| The same view | An edit that moves nothing (a property, a stereotype), laid out and drawn, under 100 ms |
| The same view | The type's common edit, laid out and drawn, under 100 ms: a transition's label, a flow's guard, a use case's name, an action moved to another lane |
| The overview's | Each inline interaction's time axis under 5 ms (3.2's measure is 200 rows in under 5 ms) |
| The Mermaid reader and writer | 500 transitions each way under 100 ms |

- A label edit changes a line's label width, which is in the geometry key (`EDGE_GEO`), so the view is laid out again.
  Stage 3 met the same budget for a message edit with `reroute: false` (`notes/stage-3.md` §10); each type here passes it
  in its `dg` the same way. A lane change moves rows, so it is a full layout too.
- If a type's common edit misses 100 ms with `reroute: false`, its package does not merge; the maintainer then chooses
  between a layout worker (P2) and holding that edit to the 1 s budget, as 1.11 did for edits that move geometry.
- Browser timings under headless virtual time prove nothing (1.11).

## 18. Left out of the subsets

| Type | Left out |
|---|---|
| Use case | Use cases owned by classifiers other than a subject; an actor drawn as a rectangle «actor»; a use case drawn as a classifier rectangle; an extend's condition in a note (it is on the line); association ends (multiplicity, navigability); n-ary associations; secondary actors placed on the right; realizations of a use case |
| Activity | Pins and parameter nodes; exception handlers; interruptible regions; expansion regions; structured nodes (loop, conditional, sequence); time events (the hourglass); streaming and weights; join specifications; multi-dimensional partitions; partitions that represent a classifier; central buffers; connectors (labelled circles); the activity's frame and parameters; a flow's effect |
| State machine | Entry and exit points; connection point references; submachine states; protocol state machines; deferred triggers; transitions on a region's border; local and internal transition kinds; parsed events, parameters and time triggers (text); a composite state's activities drawn on its box (S19); history's default transition checked; the semantics of choice against junction |
| Interaction overview | Editing an inline interaction in place (it is opened); the diagram's own `sd` frame and its `lifelines` clause; duration and time constraints (stage 6); partitions |
| All four | XMI (R6); copy and paste (E7); per-type `diff()` writers (C10's package after 0.20.0); a reader for use case, activity and overview (Mermaid has none); resizing a lane by hand; retargeting `opensView` in the panel (S18) |

## 19. Work packages

### 19.1 Before stage 4 starts

- This note is approved, and `model.md` and `risks.md` take §21's changes with it.
- 3.8 has merged (it rebuilds `lib/` and edits `umlimator.py`, `check.mjs` and the docs that 4.8 and 4.10 own later).

### 19.2 The packages

Each is one pull request. "Owns" lists the only files that package changes while it is open. Built files
(`lib/umlimator.js`, `lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`,
after merging `main`, never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a package
proposes its row in its pull request's description, and writes its release notes there for 4.10 to gather.

| # | Work package | Owns | Needs | Done when |
|---|---|---|---|---|
| 4.0 | **List the files** (the lead). The stage's eight sources as empty files, in `ALL` in load order: `uml/transition`, `uml/flow`, `layout/lanes`, `uml/usecase`, `uml/activity`, `uml/state`, `uml/overview`, `readers/mermaid-state` | `tools/build.mjs`, the eight empty files | This note; 3.8 merged | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; no other stage 4 lane edits `ALL` |
| 4.1 | **The typed engine for shapes, boxes and renames.** §4.2's slide in `TYPED.lines`; `edits.rename` through `I.label` (§12.1); `ownersOn`'s `look` (§8.2); a box whose id is a member's (§6.3); a typed line's `cut` (S7); the new registry fields documented. Tested with a test-only type that has an ellipse, a diamond, a bar, a 20 px circle, a box with a member's id and a rename hook | `src/typed/draw.js`, `src/typed/edit.js`, `src/uml/owners.js`, `src/core/registry.js`, `src/layout/layered.js`, `src/map/context.js`, `src/canvas/render.js`, `tests/typed-shapes.test.mjs` (new), `tests/type-hooks.html`, `tests/typed-edit.html`, `tests/layout-typed.test.mjs` | 4.0 | Maps unchanged (geometry hashes, stills, `tests/edit.html`); the class, package, object, sequence and communication markup in `tests/core-diet.html` and their tests unchanged; on the test type every line end is on its shape's outline within 1 px, in Node and in Chrome under three fonts; F2 on a line calls `rename` by pointer and by key; a drop into a member-id box emits `reparent` to the member. The core's bytes before and after, within §2.3 |
| 4.2 | **Control nodes and the transition micro-syntax.** §4.1's shared shapes in `flow.js` (`initial`, `final`, `flow-final`, `diamond`, `bar`, `rounded`); the shared flow rules (§9.3); §7's parser and printer | `src/uml/flow.js`, `src/uml/transition.js`, `tests/flow.test.mjs`, `tests/transition.test.mjs`, `tests/flow.html` (new) | 4.0; 4.1 for `tests/flow.html`'s line ends | Each shape's size, outline and `inset` agree (a point slid by `inset` lies on `out`) in Node; drawn in both themes and three fonts with no text overflow; each shared rule has a passing and a failing case; `print(parse(x))` stable and `parse(print(p))` equal on 500 generated texts and every fixture text; refused texts give `{ error }`; no regular expression with nested repetition |
| 4.3 | **Lanes.** §5.2's `laneRows` and `laneBands` | `src/layout/lanes.js`, `tests/lanes.test.mjs` (new) | 4.0 | On hand-built positions: lanes in order, nested lanes inside their parents, no two lanes share a row, pins kept in their lane, a node in no lane after the lanes, an empty lane kept; bands cover their nodes in both directions; 200 nodes in 10 lanes in under 5 ms |
| 4.4 | **The use case type.** §8: shapes, definition, `boxes`, rules, `describe()`, names, legend, `geo.order`, hooks | `src/uml/usecase.js`, `tests/usecase.test.mjs`, `tests/usecase.html` (new) | 4.1 | Definition of done 2, 4, 5, 6 and 8 on row 8's subset; every gesture by pointer and by key through `apply()`; a 30-step session undone, redone and reopened to byte-identical models; `08-use-case.json` lays out clean |
| 4.5 | **The activity type.** §9: shapes, lanes, definition, rules, `describe()`, names, legend, hooks (`moveTo`, `remove`, `add`, `rename`, `connect`) | `src/uml/activity.js`, `tests/activity.test.mjs`, `tests/activity.html` (new) | 4.1, 4.2, 4.3 | As 4.4 on row 9; a drop across lanes and the Owner field each emit their transaction; deleting a partition keeps its nodes; `09-activity.json` lays out clean, down and right; no line runs along a divider for over 24 px in it |
| 4.6 | **The state machine type.** §6 and §10: the state's look and frame, regions, pseudostates, definition, rules, `describe()`, names, legend, hooks (`add`, `rename`, `member`) | `src/uml/state.js`, `tests/state.test.mjs`, `tests/state.html` (new) | 4.1, 4.2 | As 4.4 on row 10; F2 on a transition round-trips its parts; regions stack with dividers across their state; `10-state-machine.json` lays out clean, right and down |
| 4.7 | **The interaction overview type.** §11: definition, the inline interaction, rules, `describe()`, names, legend, hooks (`add`, `rename`) | `src/uml/overview.js`, `tests/overview.test.mjs`, `tests/overview.html` (new) | 4.1, 4.2 | As 4.4 on row 13; `13-interaction-overview.json` lays out clean, its inline interaction's markup holds no `.node` but its own; opening a use shows its sequence view |
| 4.8 | **Mermaid state reader and writer.** §13, with `import` routing `stateDiagram` to it | `src/readers/mermaid-state.js`, `tests/mermaid-state.test.mjs`, `tests/import/state.mmd`, `umlimator.py`, `umlimator_import.py`, `tests/import.py` | 4.0; 4.2's `transition.js` to merge (it may start beside 4.2); `model.md` row 10 only | `read(write(model))` equals the model, ids included, for example 10 and 500 generated models; the report pinned; the same source read twice gives the same ids; §13's hostile inputs read in under 1 s each and never throw |
| 4.9 | **The PDF's tables per type (R9).** §15's `rows` and `word`, "Elements" for a typed view | `src/page/print.js`, `tests/print-typed.test.mjs` (new) | 4.0; 4.1 for the fields' documentation | With a test-only type, the tables list its rows and words; maps' tables unchanged; class, object and package PDFs' tables unchanged but for the heading. The core's bytes before and after, within §2.3 |
| 4.10 | **Fixtures, examples, docs, CLI.** §16's files and their tests (`tests/stage4-fixtures.test.mjs`, `tests/stage4.html`); the four examples moved, with `check.mjs`'s `MOVED`; `render`, `check`, `stills` and `pdf` on each; the schema and `.d.ts`; C10's tests (S16); every document of `plan.md` §7; `docs/conformance/uml-use-case.md`, `uml-activity.md`, `uml-state-machine.md`, `uml-interaction-overview.md`; the lanes' release notes gathered into `docs/module-api.md` | `examples/`, `tests/*-minimal.json`, `tests/*-stress.json` of the four types, `tests/stage4-fixtures.test.mjs`, `tests/stage4.html`, `tests/cli.py`, `tests/mcp.py`, `umlimator.py` (after 4.8), `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | 4.4 to 4.9 | Definition of done 1, 3, 7, 9, 10, 11 and 12 for all four types. §17's budgets enforced in CI. Each PDF lists what §15 says. The four examples in the gallery and CI. The stress fixtures' crossings pinned and stated |

### 19.3 What runs at the same time (S17)

```
3.8 ─▶ 4.0 ──┬─▶ 4.1 shapes, boxes, rename ──┬──────────────────▶ 4.4 use case ──────┐
             │                               ├──────────────┬───▶ 4.6 state ─────────┤
             ├─▶ 4.2 control nodes, syntax ──┴──────────────┼───▶ 4.7 overview ──────┤
             ├─▶ 4.3 lanes ─────────────────────────────────┴───▶ 4.5 activity ──────┼─▶ 4.10 ─▶ 0.21.0
             ├─▶ 4.8 Mermaid state (with 4.2's transition.js) ───────────────────────┤
             └─▶ 4.9 PDF tables ─────────────────────────────────────────────────────┘
```

- Five lanes once 4.0 has merged: 4.1, 4.2, 4.3, 4.8 and 4.9, each in its own worktree. 4.8 merges after 4.2.
- Then four type lanes: 4.4 after 4.1; 4.6 and 4.7 after 4.1 and 4.2; 4.5 after 4.1, 4.2 and 4.3. Each may write its
  definition, rules and `describe()` against the contracts above before its needs merge, and tests its drawing and
  gestures once they have.
- Only 4.1 and 4.9 touch the core. The second to merge states its bytes against `main` with the first merged.
- 0.21.0 ships after 0.20.0, which ships after 3.8.
- One reviewing agent that did not write the code checks each pull request against the definition of done; before the
  first of two open branches merges, their merge is rehearsed in a scratch worktree (X2).

| Option | For | Against |
|---|---|---|
| **(a) 4.0 after 3.8; lanes while 0.20.0 releases; 0.21.0 after 0.20.0 (recommended)** | Stage 4's lanes start as soon as no stage 3 package holds a file they own | Browser tests of the types wait for 4.1 |
| (b) Stage 4 after 0.20.0 is released | No overlap | Lanes sit idle through the release |

### 19.4 Files two packages touch

No two open packages edit one file. Where a file passes between packages, it passes in this order:

| File | First | Then |
|---|---|---|
| `tools/build.mjs` | 4.0 | No other stage 4 package |
| `src/core/registry.js` | 4.1 (every new field's comment, 4.9's too) | No other |
| `src/uml/owners.js`, `src/typed/*` | 4.1 | Read only by 4.4 to 4.7 |
| `src/uml/frame.js`, `sequence.js`, `interaction.js`, `src/layout/timeaxis.js` | Read only by 4.7 | No stage 4 package edits them |
| `src/uml/flow.js`, `transition.js` | 4.2 | Read only by 4.5 to 4.8 |
| `umlimator.py` | 4.8 | 4.10 |
| `tests/cli.py` | 4.10 only | |
| `docs/diagrams/examples/check.mjs` | 4.10 only (the types' `validate` runs there with no change to it until the examples move) | |
| `docs/module-api.md` | 4.10 only, gathering the lanes' notes | |

### 19.5 The release

0.21.0 after 4.0 to 4.10, by the repository's rule: `package.json`, `## 0.21.0:` in `docs/module-api.md`, merged when the
maintainer approves that pull request by number. Its notes say:

- new: the use case, activity, state machine and interaction overview diagrams; shapes that are not boxes, with lines that
  end on their outlines; lanes; regions; the transition micro-syntax; the Mermaid state reader and writer; the PDF's
  tables per type;
- changed: a typed view's PDF table is headed "Elements";
- left out: §18.

C10 (S16):

| Option | For | Against |
|---|---|---|
| **(a) In 4.10, as 2.6 did: the MCP server's read tools and the diff Action's step tested with one model of each of the four types; per-type `diff()` writers stay in the package after 0.20.0 (recommended)** | Tests only, no registry hook; each release says what works | A reorder reads "changed" in `diff()` until that package |
| (b) Fold the four types into the package after 0.20.0 | One piece of work for seven types | Two releases with untested types on the MCP server |

The `map-repo` skill's pin does not move: it writes none of the four types.

## 20. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | How much of the core's 2,777 B stage 4 may spend | At most 600 B, fallbacks named | First come; raise C5 | §2.3 |
| 2 | How lines end on shapes that are not boxes | Slide onto the outline when drawn, in a family file | Ports on the outline in the router (core); end at the box | §4.2 |
| 3 | A decision node's text | The diamond grows to hold it | Text beside the diamond (collides with lines at the top); not drawn | §4.1 |
| 4 | How lanes are laid out | Bands by rows, in `src/layout/lanes.js` | Stage 2's boxes; the map's lanes | §5.1 |
| 5 | How regions are drawn | Nested boxes with no border, dividers in the gap | A recursive compartment layout; not drawn | §6.2 |
| 6 | Labels over 150 px | A per-line `cut`, 280 px for transitions and flows | Keep 150 px; two-line labels | §7.4 |
| 7 | Deleting a partition | Its nodes go to its parent | Cascade; refuse | §9.4 |
| 8 | A composite state's activities | Not drawn on the box this release | A header that grows (core) | §10.1 |
| 9 | The inline interaction | Full size, read only, frame only above 8 lifelines or 20 messages | Frame only; scaled | §11.2 |
| 10 | Choosing the view an element opens | A picker when it is added | A `view` field kind in the panel (core) | §12.2 |
| 11 | Mermaid's notes; Mermaid's missing pseudostates | Read as comments; written as plain states under `%% kind:` | Skipped; not written | §13 |
| 12 | The PDF's tables per type (R9) | `rows` and `word` fields, "Elements" heading | Gaps listed in each fidelity table | §15 |
| 13 | P1 for the common edit | Under 100 ms with `reroute: false`; else the package waits | Hold label edits to the 1 s budget | §17 |
| 14 | Order with stage 3 | 4.0 after 3.8, 0.21.0 after 0.20.0 | Start after 0.20.0 is released | §19.3 |
| 15 | C10 for the four types | Tested in 4.10 | Folded into the package after 0.20.0 | §19.5 |

## 21. What this note changes elsewhere

- **`model.md`.** Rows 8, 9, 10 and 13 as §3; rule 6 adds that a state draws `parent` as nesting, a region as a nested box,
  and that a partition's `parent` is a lane, not nesting; §3's stage 4 row is settled: a transition never ends on a
  region, entry and exit points are out; a stage 4 row points here.
- **`risks.md`.** L10 and L11 point to §5 and §6, with their fixtures (§16); L12 points to §4 and closes with 0.21.0; L13
  points to §14; F (§6) points to §16; R8's leftover heading moves to a new row R9 (§15); P1 gains the common edits of §17;
  C5 records stage 4's share (§2.3); C10 records stage 4's tests (S16); a new row for lines along a lane's divider (§5.2);
  E3 gains the transition micro-syntax (§7).
- **`plan.md`.** §5's stage 4 row points here. §4.3 lists `src/layout/lanes.js` as built in `ALL` only.
- **`proposal.md`.** §8.5's subsets for the four types point to §18.
- **`notes/stage-2.md`.** Its "left open on purpose" line points to §6 for states and regions.
- **`src/uml/frame.js`.** Its comment's "stage 4" sentence points here when 4.5 and 4.6 use `frame()` (in those packages).
- **`README.md` in this folder.** The status table shows this note and, once approved, stage 4's work packages; the log
  records the decisions taken.
