# Stage 5 design note: component, deployment and composite structure

Status: **proposed**, for the maintainer's approval before work package 5.0 starts. Written against `main` at 50b3294
(stage 4's 4.0 to 4.4 and 4.9 merged, and maps' one card-shape style, #210); stage 4's 4.5 to 4.8, in review, were read
on their branches as gathered at 1312a3a (`stage4-docs`). Symbols are named, not line numbers.

Stage 5 ships release 0.22.0: the component diagram (`uml.component`), the deployment diagram (`uml.deployment`) and the
composite structure diagram (`uml.composite-structure`) (`plan.md` §5, row 5). Its new engine work: ports on borders;
ends through parts; deep nesting; and a time-boxed trial of the own engine against ELK (`risks.md` L9). It has no reader:
Mermaid has no component, deployment or composite structure diagram.

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 4, 5 and 6 | Kept, with refinements: a port may carry `valueType`; a connector end through a part keeps `ends.<end>.part` (UML's `partWithPort`); a provided or required interface is always an `uml.Interface` node; a usage drawn to a ball is a socket; an execution environment nests in a node, a device or another execution environment | §3 |
| S2 | Where a port is drawn | A 12 px square centred on its owner's border, node or box. Its side is `present.<port>.side` when the view gives one, else the side facing most of its lines' far ends, chosen from the ranking before the layout. The router ends each of its lines on the square; a port with several lines on one face grows along the border by 10 px a line, so each line keeps its own end, as stage 4's bar does | §4.1 |
| S3 | The order of ports on a side | By where their lines go, as the router orders ends now (fewest crossings at the border); `members` order breaks ties and places ports with no line. No order is stored (rule 9) | §4.2 |
| S4 | A port's name | Outside its owner, beside the square, placed by the end labels' search (`endLabels`, `src/typed/draw.js`), which keeps clear of lines, nodes and labels placed before it | §4.3 |
| S5 | How the router learns ports | One hook, `TYPED.ports`, called by `layoutPass` for a typed view before it spreads ends along each side; it places the ends of lines that name a port (`fromPort`, `toPort`) and leaves the rest to the router as now. The hook and its port groups live in `src/typed/layout.js` | §4.4 |
| S6 | A line from a box's port to something inside the box (delegation; a connector from a structured class's port to a part) | The router learns inner ends: a line marked `inner` may join a box and something it holds; its end on the box leaves the border inward. About 100 B in `src/layout/layered.js` | §5 |
| S7 | Ends through parts | A part is a member drawn as a node in its structured classifier's box. A port on a part is drawn under the geometry id `<part>-><port>`, which no element id can be (`model.md` rule 5); the composite type maps it back in its hooks. The ports drawn on a part are the ones its connectors name, and every port of the class its `valueType` names by label (M8) | §6 |
| S8 | Deep nesting | Stage 2's boxes, unchanged: 72 px a level along a right-laid flow (Q14). Tested to six levels, with a line from the deepest to the top level (L8); the width is pinned and stated | §7 |
| S9 | The per-column gap for typed views (`labelRoom` for typed views) | Stage 5 takes it, opt in: a typed view's `labelGaps` lets the layout widen only the gaps a label needs, as a map's does. The deployment and component types set it; the class, state, activity and overview types keep their one gap, so their pictures do not move. About 25 B | §8 |
| S10 | The ball and socket | `present.<interface>.as: "ball"` draws the interface as a 16 px circle with its name under it; a realization to it is a plain solid line; a usage to it ends in a socket, a new line end in `src/typed/draw.js`'s table | §9.2 |
| S11 | Changing an interface between ball and rectangle (DoD 4) | `B` on a selected interface, through a new hook `edits.key`, emits `set` of `present`; the palette's `add` offers the choice with `{ pick, then }` | §12 |
| S12 | The open collaboration | A dashed ellipse round its roles: a box may carry `round: true`, which `frameOf` grows by √2 about its centre so the ellipse holds the rectangle of its contents. About 40 B | §9.3 |
| S13 | The member hook | `edits.member(model, view, owner, id, text)`, called by `src/typed/edit.js` on the panel's member rows before the panel commits them; null leaves the row to the panel. 4.6's own wrap of `TYPED.edit` in `src/uml/state.js` moves onto it. No core byte | §12.1 |
| S14 | Deleting a part | The connectors through it go with it: the composite type declares `refs` on `uml.Connector`'s `props.ends.from.part` and `props.ends.to.part` that cascade. No core byte | §10.4 |
| S15 | The core's budget (C5) | Stage 5 spends at most 600 B of the 4,713 B left at 50b3294; everything listed in §2.3 stays in family files | §2.3 |
| S16 | P1 | `repair: false` and `reroute: false` on every layout of the three types, as stage 4's types do. CI holds the 1 s ceiling and prints each common edit against the 100 ms target, best of seven in CPU time after a warm-up (`tests/state.test.mjs`'s P1 test). A spike in 5.1 measures a view with ports, inner lines, label gaps and six levels of boxes before the type lanes start | §14 |
| S17 | The ELK trial (L9) | A spike package, 5.7, boxed by scope: a fixed list of fixtures and measures, one ELK configuration and one revision. Its outcome is a written recommendation, `notes/spike-elk.md`. No dependency is added: the module, `package.json` and its lock do not change | §15 |
| S18 | C10 for the three types | Tested in 5.8 as 4.10 does (the MCP server, the diff Action) | §16.5 |
| S19 | Order with stage 4 | 5.0, 5.1, 5.3 and 5.7 start when this note is approved; 5.2 after 4.6 merges; 0.22.0 after 0.21.0 | §16.3 |

What is left out of the subsets is in §17.

## 2. Where stage 5 starts

### 2.1 What it builds on

- **Stage 2's boxes** (`notes/stage-2.md` §3, §4): `boxes(model, view)`; `blockPos` places a box's contents as a block;
  `layoutPass` keeps boxes 32 px apart, ends a line on a box's border in line with its far end, and routes across
  borders; a box is drawn by its shape's `frame(f)`; a drop into a box, or the Owner field (`owners`), emits `reparent`.
  `ownersOn` (`src/uml/owners.js`) builds boxes for any node types (`look.boxTypes`), with their shape and word (4.1).
- **Stage 3's hooks** (`src/typed/edit.js`): `connect`, `moveTo`, `wrap`, `add`, `remove`; lines from a node to itself;
  and the ranking a type does itself with `rowsFor` and `untangle` (`src/uml/communication.js`).
- **Stage 4's engine** (4.1): `edits.rename`; `{ pick, then }`; `name: false`; `at.geo`; a box whose id is a member's;
  a line's `cut`; the line ends slid onto a shape's outline at draw time (`TYPED.lines`), on a copy; the rule that nothing
  after `layoutTyped` edits what it returned (stage 4 §2.4); partitions added back to a copy of the geometry as nodes
  after the layout, so they are selected, renamed and deleted with no canvas change (stage 4 §5.3). 4.9's `rows` and
  `word` for the PDF's tables. 4.4's `SHAPE.ellipse`.
- **The class type's look** (`typeGeo`, `drawnLines`, `legendOf` in `src/uml/class.js`): the classifier, interfaces with
  «interface», realizations and dependencies.
- **Maps' ports and nesting**, read for what they show: a map draws a dot (`n-port`) where each line meets a card, one
  per distinct point (`svgOf`); its ports are derived from its lines, never modelled. Its nesting is the same
  `containers` code a typed view's boxes take. UML's ports are elements with ids, names, sides and lines of their own, so
  stage 5 does not reuse the dot; it reuses the boxes and the router's ends on a box's border.

### 2.2 What was read at 50b3294

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | `layoutPass`'s ends on a card (`pushSide`, the per-side loop) | Every line gets its own end. A card's side takes at most `max(1, ⌊length × 0.84 / 14⌋)`; the extras on the left and right go to the top and bottom. Ends are ordered by where the far end lies and spread 16 px apart on a left or right side, 26 px on a top or bottom | S2, S3, §4.4 |
| Q2 | The same loop on a box (`n.box`) | Each end lies in line with its far end where the border allows: on a left or right side 40 px below the top (the title) and 16 px above the bottom, 20 px off the corners on the top and bottom, 16 (26) px apart | §4.4 |
| Q3 | `layoutPass`'s `holds` | A line between a box and something inside it is refused with a warning ("it joins the box … and something inside it"); stage 2's `line-inside` rule says so for packages | S6 |
| Q4 | `gridRoute` and `restub` | A line leaves its end along `OUT[side]`, the side it ends on. An end with the opposite side leaves the other way: the change S6 needs is where its point is put, not the search | §5 |
| Q5 | `drawnLines` and `typeGeo` (`src/uml/class.js`) | A line that ends on a member is drawn to the member's owner: today a port is its owner's box | §4 |
| Q6 | `frameOf` (`layoutPass`) | A box is the rectangle round its contents (each 36 px to the side and 14 px above and below, 24 px of header room, 12 px of padding): 72 px a level along a right-laid flow, 44 across, plus 24. Boxes keep 32 px apart (`BOXGAP`) | S8, S12 |
| Q7 | `labelRoom` (`layoutPass`, `layoutGraph`) | Only a map asks for room for a label that found no spot (`tight` reads `map`); a typed view takes one gap for every column: the class type 96 px plus its widest label and 40 with boxes, the state type 48 px, the activity type its widest label and 40 (stage 4 §9.1) | S9 |
| Q8 | The panel's member rows (`commit`, `src/canvas/edit.js`) | A new row goes to `member.add(text, owner)`, which gives a member or `{ error }`; an edited one to `member.edit(member, text)`, which gives `{ commands }`. No hook sees the view, and `member.add` cannot give commands. 4.6 reads `entry / …` rows by wrapping `TYPED.edit` in `src/uml/state.js` with listeners of its own, marked as waiting for a member hook | S13 |
| Q9 | `apply()`'s `delete` | A reference of kind `part` (`props.ends.<end>.part`) is dropped: the connector stays, its `part` gone. A type's `refs` may make a reference cascade instead (`propRefs`) | S14 |
| Q10 | `set { view, path }` | Sets any field of a view, `present.<id>.side` and `present.<id>.as` included | S2, S11 |
| Q11 | `autoPos` (`src/map/context.js`) | Ranks the view's `nodeIds` only. A member drawn as a node (a part) takes no rank: its type ranks it, as the communication type ranks its stacks (`rowsFor`, `untangle`) | §10.2 |
| Q12 | `validate()` (`src/core/model.js`) | An id that contains `->` is an error ("names lines by position"), so `<part>-><port>` can never be an element's id | S7 |
| Q13 | `upstream_view()` (`umlimator.py`, F3) | Shows members as cards, so a line that ends on a port passes upstream's check; `tests/cli.py` renders, checks, stills and prints `05-component.json` today, drawn as plain cards | §16.2 |
| Q14 | Stage 4's Q17, measured again | Unchanged: each box level is 72 px along, 44 across, plus 24 of header room | S8 |
| Q15 | `SHAPE.node` (`src/draw/shapes.js`) | Maps' node is UML's cube drawn inside the card's box (7 px of depth); its `out` and `inset` are geometry only, its `det` paints in the card's kind | §9.1 |
| Q16 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 184,984 B at 50b3294 and at 1312a3a (stage 4's open lanes change no core file). The cap is 189,697 B (0.16.0's 164,954 B plus 15%): 4,713 B left | S15 |

### 2.3 The core's budget (C5, S15)

4,713 B are left for stage 5, stage 6 and the three milestones. Stage 5's ports are the one change of the plan that must
be the router's; stage 6 (a time-ruler strategy) and milestone 2 (line-end skins, scope rules) can live in family files;
milestone 4b's boundary events attach to a border as a port does and reuse this stage's hook.

What stays out of the core, in files listed in `tools/build.mjs`'s `ALL` only:

- the port groups, their order and their ends (`TYPED.ports`, `src/typed/layout.js`);
- the socket end (`src/typed/draw.js`'s `ENDS`);
- every shape and look: port, ball, component, artifact, node, device, execution environment, deployment
  specification, part, collaboration, collaboration use (`src/uml/structure.js` and the type files);
- the ports drawn on parts, the ports with no line, the port names;
- `edits.member` and `edits.key` (`src/typed/edit.js`);
- every type's definition, rules, `describe()`, names, legend and hooks.

What may touch the core, each change stating its bytes in its pull request:

| Change | File | Lane | Target |
|---|---|---|---|
| The call to `TYPED.ports` before the per-side spread, which removes the sides it placed (S5) | `src/layout/layered.js` | 5.1 | 70 B |
| An `inner` line passes `holds`; its end on the box is put on the border its side faces away from (S6) | `src/layout/layered.js` | 5.1 | 100 B |
| `labelGaps` opens `tight` to a typed view (S9) | `src/layout/layered.js` | 5.1 | 25 B |
| A box's `round` grows its frame by √2 about its centre (S12) | `src/layout/layered.js` | 5.1 | 40 B |
| The new registry fields documented | `src/core/registry.js` | 5.1 | 250 B: the build keeps comments, so they count |
| | | | **485 B** |

| Option | For | Against |
|---|---|---|
| **(a) Stage 5 spends at most 600 B; anything over waits for the maintainer (recommended)** | 115 B of slack over the targets; leaves 4,113 B for stage 6 and the milestones | The fallbacks below are worse pictures |
| (b) First come, first served | Nothing to decide | Milestone 4b's boundary events and M2's scope rules may find no room |
| (c) Raise C5 | No wait | The maintainer's call; maps' hosts pay for UML |

If a change goes over, the fallbacks are, in this order: the open collaboration draws a dashed stadium (S12's option b);
the registry's comment shrinks to a pointer to this note's §4 and §5, as 1.12b did; a delegation is drawn by the type as
an elbow after the layout (S6's option b). The port hook has no fallback: without it a port is its owner's box (Q5).

### 2.4 Rules every package keeps

- **Maps draw exactly as now.** The geometry hashes (`bench/expected.json`), the examples' stills and every map test are
  unchanged in every pull request (C1). Every new branch in `layoutPass` is reached only through a field no map sets
  (`dg.typed` with `fromPort`, `toPort`, `inner`, `labelGaps`, `round`).
- **Every typed example draws exactly as now.** The class, package, object, sequence, communication, use case, activity,
  state and overview examples' markup is held by `tests/core-diet.html`, `tests/core-diet.json` and each type's own
  tests. None of them sets a field above.
- **The API is additive only** (C2). The three types and their helpers are internal, in `lib/umlimator-all.js`; the new
  registry fields (`edits.member`, `edits.key`, a line's `fromPort`, `toPort` and `inner`, a view's `labelGaps`, a box's
  `round`) are optional and provisional.
- **Nothing after `layoutTyped` edits what it returned** (stage 4 §2.4): the ports with no line, the port nodes added
  back for selection and the port names are put on a copy of the geometry. A test lays each type's view out twice from
  one memo and checks the two pictures are byte-identical.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment`, `uml.CommentLink` and `props.stereotypes` are on every UML view already.

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 4 | `uml.composite-structure` | `uml.Class` (the `subject`), `uml.Collaboration`, `uml.CollaborationUse`, `uml.Comment` | `uml.Property` (a part of the subject, or a role of a collaboration), `uml.Port` | `uml.Connector`, `uml.RoleBinding`, `uml.CommentLink` | Part props: `valueType` (text, M8), `multiplicity`, `aggregation` (`composite`, the default, or `shared`; a shared part is drawn dashed). Port props: `valueType`. A connector's end is a part, a port of the subject, or a port reached through a part (`ends.<end>.part`). The `subject` is listed in `nodeIds`; its parts are drawn inside it, and the classes that type them are model nodes this view does not list. A collaboration use's `parent` is the subject; `props.collaboration` names a collaboration by label. A role binding runs from a part to a collaboration use; its `label` is the role's name |
| 5 | `uml.component` | `uml.Component`, `uml.Interface`, `uml.Artifact`, `uml.Comment` | `uml.Port` | `uml.InterfaceRealization` (provided), `uml.Usage` (required), `uml.Connector` (`props.kind`: `assembly` or `delegation`), `uml.Dependency`, `uml.Manifestation`, `uml.CommentLink` | A component's `parent` is a component (drawn nested) or a package. A provided or required interface starts at a component or at one of its ports. `present.<interface>.as: "ball"` draws the ball; a usage to a ball ends in a socket, else it is a dashed «use» arrow |
| 6 | `uml.deployment` | `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component`, `uml.Comment` | | `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency`, `uml.CommentLink` | An artifact or deployment specification whose `parent` is a node, device or execution environment is deployed on it; a `uml.Deployment` line from it to one is the other form (G2). An execution environment's `parent` is a node, device or execution environment; a device's a node or device; a node's a node |

What changed against `model.md`:

- **Ports on parts (`model.md` §3, stage 5).** A connector end through a part keeps `ends.<end>.part`, as rule 7 and
  `04-composite-structure.json` already have it. A path form (`from: "checkout/requests"`) would put two ids in one string
  and break `references()`.

  | Option | For | Against |
  |---|---|---|
  | **(a) `ends.<end>.part` names the part, `from`/`to` the port (UML's `partWithPort`) (recommended)** | Already in rule 7, the target example and `references()` (kind `part`); each id stays an id | A reader must look in two places for an end |
  | (b) A path form in `from`/`to` | One field | A new id grammar; `references()`, `delete` and every reader of `from`/`to` learn it |

- **A provided interface is always an `uml.Interface` node** (`model.md` §3's second stage 5 point), drawn as a ball when
  `present.<id>.as` says so, joined to its provider by a realization and to its requirers by usages.

  | Option | For | Against |
  |---|---|---|
  | **(a) Always a node, joined by lines (recommended)** | One way to say it; the class type's interfaces and realizations already mean this; an interface's operations stay on its node | The ball is placed by the layout, so its stem can run long where the ranking puts it away from its provider (stated, §17) |
  | (b) A port may also list `provided` and `required` names in its props, drawn as lollipops on the port | UML's short stem, no node | Two ways to say one thing; an interface named in two places drifts apart (M8) |

- **A port may carry `valueType`**, drawn `name : Type` beside it.
- **A shared part is drawn dashed**, as UML draws a property that is not composite.
- **A usage to an interface drawn as a ball ends in a socket.** Elsewhere it is a dashed open arrow with «use».
- **Execution environments nest.** UML allows an execution environment inside one (a container runtime in a virtual
  machine); `06-deployment.json` does not, the stress fixture does.

The three example files keep their shapes. `check.mjs` gains no hand rule for them: each type's `validate` runs there.

## 4. Ports on borders (S2 to S5, L9)

### 4.1 The shape and its size

A port is a square, 12 by 12 px, centred on its owner's border: half outside, half inside. It is filled with the stage's
background and stroked `--um-muted` (T2). A port with `k` lines leaving one face is `12 + 10 (k − 1)` px long along the
border, so each line keeps its own end at the router's separation (`SEP`, 10 px): stage 4's bar grows with its busier side
the same way. A port's hit area is a transparent 24 px square (E8).

A node is sized so its ports fit: on each side, `16 + Σ (port length + 8)` px at least, above its shape's own size. The
type computes it before the layout, from the sides it has chosen (§4.2).

| Option | For | Against |
|---|---|---|
| **(a) One square per port, lengthened along the border for each further line on a face (recommended)** | Every line ends on the port; the router keeps its rule that lines never overlap; no change to the search | A busy port is a bar, not a square |
| (b) Every line of a port ends at one point | UML's picture | The router forbids overlap: lines leaving one point share their first segment, which it refuses (`colinear`); a bundle would be a new case in the search, the core's hottest code |
| (c) A port is a small node of the layered layout | The router knows it | The layered layout cannot keep a node on another's border; it would be a node beside its owner |

### 4.2 Its side and its order (S3)

- **Side.** `present.<port>.side` (`left`, `right`, `top`, `bottom`) when the view gives it. Otherwise the type picks it
  before the layout, from the ranking it is given (`pos`): the side facing most of the port's lines' far ends, by column,
  then by row; a port with no line takes the side with fewest ports, left first. Every line of a port gets that side as
  its `fromSide` or `toSide`, so the router never moves it to another (Q1's extras go to the top or bottom only for lines
  with no side).
- **Order.** By where the port's lines go: the mean of their far ends' centres along the side, as the router orders ends
  now; ties, and ports with no line, by `members` order. Nothing is stored (rule 9).

| Option | For | Against |
|---|---|---|
| **(a) Side by `present` or by the ranking; order by the far ends, `members` breaking ties (recommended)** | Fewest crossings at the border; the user pins what matters (D1); nothing stored | Reordering the member list moves only ports with no line |
| (b) `present.<port>.order` too | Exact control | A second pin to keep in step with the members; it can force crossings the layout would avoid |
| (c) `members` order always | Predictable | Lines cross at the border wherever the member order disagrees with the ranking |

### 4.3 Its name (S4)

Outside its owner, beside the square, in 10 px, `name : Type` with its `valueType`. It is placed by `endLabels`' search
(`src/typed/draw.js`), as an end label is: 4 px out from the square, to one side of its first line, moving away 4 px at a
time until it meets no line, node or label placed before it. A port with no line takes the place a line leaving it
straight out would have.

| Option | For | Against |
|---|---|---|
| **(a) Outside, by the end labels' search (recommended)** | UML's place; reuses a search that already keeps clear of lines and nodes | The layout reserves no room for it: where many ports and lines meet, a name may sit far from its port (L5); the fixtures pin it |
| (b) Inside the owner, next to the square | Never meets a line | The node grows by its longest port names; inside a box it meets the box's contents, which sit 48 px in |
| (c) Not drawn; in the accessible name only | Nothing to place | A port without a name says little |

### 4.4 The router's hook (S5)

```js
TYPED.ports(sides, portAt, { byId, SEP }) -> void   // sides: { 'id|side': [{ e, other, n }] }, as layoutPass builds them;
                                                     // places the ends of every line with e.fromPort or e.toPort (by portAt),
                                                     // deletes those sides' entries, and leaves the rest to the router
```

`layoutPass` calls it once, for a typed view, after it has pushed every end to its side and before the per-side spread
(about 70 B). On each side that holds a port's line, the hook:

1. groups the side's ends by port (an end with no port is a group of one, as the router would place it);
2. orders the groups by the mean of their far ends, ties by `members` order (a field the type passes on each line);
3. spreads them along the side's free span (Q1 for a node, Q2 for a box, below the title), 8 px between ports and 10 px
   between the ends of one port, centred on the span; a side that cannot hold them all keeps the order and narrows the
   spacing down to 4 px, then is reported by the layout check;
4. for each line, sets its end's point on the border at its place in its port (`portAt`), and records each port's
   rectangle in `e.fpb` and `e.tpb` (the port's box on that end), which the type reads to draw it.

`fromPort`, `toPort` and `inner` join `EDGE_GEO` (`src/typed/layout.js`), so a change of port lays the view out again.
Nothing here reads a map's lines: a map never sets them.

### 4.5 Drawing, selecting and editing a port

After the layout, on its copy (§2.4), the type:

- draws each port's square where the hook put it, and each port with no line on its side at its place in the order;
- slides each port's line end onto the square's outer face (inner face for an inner line, §5), on the copy, as 4.1's
  slide does for shapes;
- adds each port to the copy's `nodes` and `byId` as a node with shape `port`, 12 px square at its place, so a click
  selects it, F2 renames it, Delete and the outline work, and `L` or a drag from it connects, with no canvas change
  (stage 4 §5.3's partitions are the precedent). Its id is the port's own, or `<part>-><port>` on a part (§6).

A drag of a port, or Alt + arrows on it, goes to the type's `moveTo`: the side nearest the drop point, or the side in
the arrow's direction, as `set { view, path: ['present', port, 'side'] }`. Alt + arrow along the port's own side does
nothing (order is not stored, S3), and the hint line says so.

## 5. Lines from a box's port inward (S6)

A delegation joins a component's port to a port of a component inside it; a composite structure's connector joins the
subject's port to a part's port. Both join a box and something it holds, which the router refuses (Q3).

| Option | For | Against |
|---|---|---|
| **(a) The router learns inner ends: a line with `inner: 'from'` or `inner: 'to'` passes `holds`, and that end, on the box's border, leaves the border inward (recommended)** | The router routes it among the box's contents like any line, with its bends, crossings and labels; the search does not change: the type gives the end the side it leaves by (a port on the box's left border gets `R`), and the hook puts its point on the left border (Q4). About 100 B | Core bytes; the box's border is crossed at the port only, which the fixtures check |
| (b) The type draws an elbow after the layout, from the port inward to the inner end | No core byte | Routed by nothing: it may cross a node or another line inside the box, which the layout check reports and cannot avoid |
| (c) Not drawn; the delegation is in the accessible name and the PDF only | Nothing to build | Delegation is what a component diagram's nesting is for (`05-component.json` has two) |

Under (a): the type marks a line inner when one end's node is a box that holds the other end; it gives the inner end the
side opposite the port's (the direction the line leaves), and `TYPED.ports` places that end on the port's own border, on
the square's inner face. A line from a box's port to a node outside it is an ordinary line to a box (Q2), with its port.

## 6. Ends through parts (S7, G2)

A part is a member of its structured classifier (a `uml.Property` of the subject) and is drawn as a node inside the
subject's box: its id is the member's (4.1 tested member ids as boxes; a member-id node is placed the same way). Its
ports are the ports of its type, the class its `valueType` names; two parts of one type each show that type's ports
(G2), so a port's drawn id must say which part it is on.

- **The ports drawn on a part:** every port its connectors name through it (`ends.<end>.part`), and every port of the
  class whose label equals its `valueType` (text, M8; with none, or several, only the connectors' ports, and the rule
  `part-type` warns).
- **Their geometry ids:** `<part>-><port>`. No element id contains `->` (Q12), so it can never meet a model id. The
  composite type's hooks (`rename`, `remove`, `moveTo`, `connect`) map it back: a rename renames the class's port, for
  every part of that type, and the hint line says so; Delete on it removes the connectors through that part to that port
  (Delete from the model, Shift + Delete, deletes the class's port); a connect from it gives a connector whose end is the
  port with `ends.<end>.part` the part.
- **Their side** is `present['<part>-><port>'].side`, or chosen as in §4.2.
- **The properties panel** shows a port selected on a part as nothing: its properties are its class's, edited where the
  class's own port is drawn (its composite structure or component view). Stated in the conformance note. 5.2 tests that
  a node whose id holds `->` is selected, renamed through the hook and deleted through the hook; if a consumer reads it
  as a line's positional name, the fallback id is `<part>#<port>`, with the rule `part-port-id` warning of a model id
  equal to one.

| Option | For | Against |
|---|---|---|
| **(a) A part's ports are its type's, drawn under `<part>-><port>` (recommended)** | Two parts of one type each show the same port with its own lines (G2); no copy of a port in the model | A port on a part has no properties panel of its own |
| (b) A part owns its own port members | Each has an id | Not UML: a port belongs to a classifier; the copies drift from the type |

## 7. Deep nesting (S8, L8)

Nesting is stage 2's boxes, unchanged. A component holds components; a node holds devices, execution environments and
artifacts; a subject holds its parts and collaboration uses. Each level costs 72 px along a right-laid flow and 44 across,
plus 24 px of header room (Q14): six levels add about 430 px.

- `ownersOn` builds the boxes, with `look.boxTypes` the type's (component: `uml.Component`, `uml.Package`; deployment:
  `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`), `qualify: false` (a deployment's names are not qualified;
  a component's are, by its packages, as the class type's), and the shape and word of each kind.
- The fixtures go to six levels, with a line from the deepest node to one at the top (L8), a port on a box three levels
  down with a delegation into its contents, and boxes side by side at each level; laid out right and down, in three fonts.
  The width of the six-level view is pinned and stated in the conformance note, with L8's known limit (a line through a
  box that holds neither end) checked, not assumed.

| Option | For | Against |
|---|---|---|
| **(a) Stage 2's padding, measured and stated (recommended)** | No core byte; every box type draws alike | Deep views grow wide: about 430 px for six levels |
| (b) A box's padding per type or per level (`pad` on a box, read by `frameOf`) | Tighter deployment views | About 30 B in the core; a padding tighter than the router's stub and clearance (16 + 12 px) lets lines run along borders |

## 8. Room for labels (S9)

A deployment's communication paths carry long labels ("PostgreSQL wire protocol"), and a component view's boxes take 48 px
of each column gap (Q7). One gap for every column, set by the widest label, makes the whole view as wide as its widest
gap times its columns; `10-state-machine.json` was 6,700 px wide that way (stage 4 §10.4).

| Option | For | Against |
|---|---|---|
| **(a) Opt in: a typed view's `labelGaps` lets `layoutPass` ask for room for a label with no spot, as a map does; `layoutGraph` lays it out again with that room and keeps it if better (recommended)** | Only the gaps that need it widen; about 25 B (`tight` reads `map \|\| dg.labelGaps`); no other type's picture moves | A second `layoutPass` when a label is tight (Q19 of stage 4: a layout pass is about 24 ms on 52 nodes with both flags off); measured in 5.1's spike |
| (b) Every typed view takes it now | One rule | The class, package, object, use case, state, activity and overview pictures all change: each a maintainer's exception |
| (c) Not in stage 5; one gap, as the class type | No core byte | Deployment views as wide as their widest label times their columns |

Under (a) the deployment and component types set `labelGaps` and the `cut` of 280 px stage 4 gave long labels; the
composite type's connectors carry no label. Moving the class, state, activity and overview types to it is later work, one
package each, each a picture change for the maintainer.

## 9. Shapes and looks

### 9.1 The shapes

Each is a `SHAPE` entry or a look on the classifier, in `src/uml/structure.js` (shared) or the type's own file; text is cut
with `fit`, strokes `--um-muted`, fills the stage's background or `--um-text` (T2).

| Shape or look | For | Drawn | Where |
|---|---|---|---|
| `port` | Port | §4.1 | `structure.js` |
| `component` | Component, closed and as a box's frame | A rectangle, the name centred, «component» over it only when the view's `present.<id>.keyword` asks; UML's component icon (a rectangle with two small tabs on its left) 16 by 12 px at the top right. As a frame, the name and icon in the 24 px header room | `structure.js` |
| `ball` | Interface with `as: "ball"` | A 16 px circle; its name under it, cut at 160 px; the node as wide as the wider; ends slide onto the circle (4.1) | `structure.js` |
| `artifact` | Artifact, deployment specification | A rectangle, «artifact» or «deployment spec» over the name, UML's document icon (a page with its corner folded) 12 by 14 px at the top right | `structure.js` |
| `cube` | Node, device, execution environment, closed and as a frame | UML's node: a rectangle with a top and a right face 10 px deep, by `SHAPE.node`'s outline and inset (Q15) with the typed look's own paint; a device «device», an execution environment «executionEnvironment» over the name. As a frame, the faces lie outside the box's border, inside the 32 px between boxes | `deployment.js` |
| `part` | Part (and a collaboration's role) | A rectangle, `name : Type [mult]` centred, underlined never; dashed when shared | `composite.js` |
| `collab-use` | Collaboration use | `SHAPE.ellipse` (4.4) dashed, `name : Collaboration` | `composite.js` |
| Classifier look | Interface as a rectangle; the subject's frame | The class type's: «interface»; the subject's frame its name in the header room | `class.js`'s, read only |

### 9.2 The ball and socket (S10)

- A realization from a component or port to a ball is a plain solid line with no end (UML's lollipop stem).
- A usage from a component or port to a ball ends in a socket: a half circle of radius 11 px, open away from the line,
  whose middle lies on the line 3 px off the ball's outline, so the ball sits in it. It is a new end, `socket`, in
  `ENDS` (`src/typed/draw.js`), drawn by the marker the table already builds.
- A realization or a usage to an interface drawn as a rectangle is the class type's: a dashed line with a hollow
  triangle; a dashed open arrow with «use».
- An assembly connector is a plain solid line between two ports or components. A delegation is a solid line with an
  open arrow at its `to` end, so it points the way the model's line runs: inward from a port that provides
  (`05-component.json`'s `orders-to-checkout`), outward to a port that requires (`checkout-to-payments`). UML 2.5.1
  needs no arrow on a delegation; the arrow says which way it delegates, and its accessible name says "Delegation".

### 9.3 The open collaboration (S12)

A collaboration is drawn as a dashed ellipse holding its roles, each a `part`, and the connectors between them; its name
over a dashed line inside the top. Its box is laid out as stage 2's, and the ellipse must hold that rectangle.

| Option | For | Against |
|---|---|---|
| **(a) A box's `round: true` grows its frame by √2 about its centre in `frameOf`, so the ellipse inscribed in the frame holds the rectangle of its contents (recommended)** | UML's dashed ellipse; the boxes keep 32 px apart around the grown frame, as any box does; about 40 B | Core bytes; a wide collaboration takes about 40% more room than its rectangle |
| (b) A dashed stadium (a rectangle with corners of half its short side) round the plain frame | No core byte | Not UML's ellipse (a deviation, stated) |
| (c) Closed only: its roles as rows in a compartment, its connectors not drawn | Nothing new | `04-composite-structure.json` shows the roles and their connector |

## 10. The three types

### 10.1 Component

Laid out by `layoutTyped` from the host's ranking, right by default, with `repair: false`, `reroute: false` (§14),
`labelGaps` (§8) and `rgap: 56`. Components that hold components are boxes (`ownersOn`). Ports, inner lines (delegations)
and ends as §4 to §6. Interfaces drawn as balls or rectangles (§9.2). Artifacts with their manifestations.

Validators, each with a passing and a failing case:

| Rule | Level | Says |
|---|---|---|
| `port-owner` | error | a port is a member of a component, a class or a collaboration |
| `provided-ends` | error | a realization runs from a component, a class or a port to an interface |
| `required-ends` | warning | a usage drawn as a socket runs to an interface (another usage is drawn as «use») |
| `ball-interface` | warning | `as: "ball"` is on an interface; elsewhere it is ignored |
| `delegation-ends` | error | a delegation joins a component or its port with a component or port inside it, at any depth |
| `assembly-ends` | error | an assembly joins two components or their ports, neither inside the other |
| `manifest-ends` | error | a manifestation runs from an artifact |
| `component-owner` | warning | a component's owner is a component or a package |

Accessible names: "Component Shop API, 2 ports, holding 1 component"; "Port orders of Shop API, provides Orders";
"Interface Orders, as a ball, provided by Shop API, required by Storefront"; "Delegation from orders of Shop API to orders
of Checkout"; "Artifact shop-api.jar, manifests Shop API". Reading order: each box and what it holds (`readingOrder`),
each node's ports after it in their drawn order, then the lines. The legend names each line kind and end drawn, and the
ball and socket.

### 10.2 Composite structure

Laid out by the type's own ranking (Q11): `layout.rank: false`, so the host passes the pins alone; the type ranks the
subject's parts and collaboration uses by the connectors and role bindings between them (`rowsFor`, `untangle`), each
pin kept, and lays them out with `layoutTyped` inside the subject's box, with the open collaborations beside it. The
subject is a box (its id the node's); its parts are nodes (their ids the members'); its ports and its parts' ports are §4
and §6; a connector from the subject's port to a part is inner (§5).

| Rule | Level | Says |
|---|---|---|
| `subject-shown` | error | the view's `subject` is a class or a collaboration listed in `nodeIds` |
| `part-type` | warning | a part's `valueType` names exactly one class of the model by label (M8) |
| `connector-part` | error | an end's `part` is a part of the subject, and the end is a port of that part's type |
| `connector-scope` | error | a connector's ends lie in one structure: the subject, its ports and its parts; or one collaboration's roles |
| `binding-ends` | error | a role binding runs from a part of the subject to a collaboration use of it |
| `binding-role` | warning | a role binding's label names a role of the collaboration its use names |
| `collaboration-named` | warning | a collaboration use's `collaboration` names a collaboration of the model |
| `part-port-id` | warning | only under §6's fallback: a model id equals a port's id on a part |

### 10.3 Deployment

Laid out by `layoutTyped` from the host's ranking, with `labelGaps` and `cut: 280` on communication paths. Nodes,
devices and execution environments that hold something shown are boxes drawn as cubes (§9.1); artifacts and
deployment specifications are `artifact`s; components (what an artifact manifests) the component look.

| Rule | Level | Says |
|---|---|---|
| `deploy-ends` | error | a deployment runs from an artifact or deployment specification to a node, device or execution environment |
| `deployed-twice` | warning | an artifact nested in one target is also deployed by a line to another |
| `nest-kinds` | error | the owners of §3's row 6 |
| `path-ends` | error | a communication path joins two nodes, devices or execution environments |
| `manifest-ends` | error | a manifestation runs from an artifact (shared with the component type) |

Accessible names: "Device Application server, holding 1 execution environment"; "Execution environment Java 21 runtime, in
Application server, 3 artifacts deployed"; "Artifact shop-api.jar, on Java 21 runtime, manifests Shop API";
"Communication path HTTPS from Shopper's device to Edge proxy".

### 10.4 Deleting (S14)

- **A part:** the connectors through it go with it, by the composite type's `refs` (`'uml.Connector': {
  'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' }`); its role bindings by `delete`'s rule for lines
  to it. Without it, `delete` drops the `part` field (Q9) and the connector would be drawn to the class's port on no
  part: not drawn, and warned.
- **A port:** the lines to it, as for any member (M4).
- **A node holding artifacts:** what it owns goes with it, as `apply()` does. An artifact is not a part of its node in
  UML's sense, but `parent` is ownership in the model (rule 6), and the hint line counts what goes.

| Option, deleting a part | For | Against |
|---|---|---|
| **(a) Its connectors go with it, by `refs` (recommended)** | A connector through a deleted part means nothing; no core byte | Shared with every view's `uml.Connector` (`propRefs` is by element type): a communication view's connectors carry no `part`, so nothing changes there |
| (b) As `apply()` does now: the `part` dropped | Nothing to declare | A connector left pointing at a port of a class not shown, drawn nowhere |

## 11. `describe()`, the PDF and the legend

Each type gives `describe(model, viewId)` (what the view holds, then each line by its accessible name), `geo.order`,
accessible names for every node, port and line (A1), a legend, and 4.9's `rows` and `word` for the PDF's tables:

| Element | `word` | `rows` |
|---|---|---|
| Component | Component | its ports, `name : Type`, each with what it provides and requires |
| Interface | Interface (ball) or Interface | its operations, as the class type prints them |
| Node, device, execution environment | its kind | what is deployed on it, by nesting or by a line |
| Artifact, deployment specification | its kind | what it manifests |
| Part | Part | `name : Type [mult]`, shared or composite |
| Collaboration use | Collaboration use | its collaboration, and each role binding as `role ← part` |

Contrast: lines, outlines and ports `--um-muted` (5.95:1 light, 7.05:1 dark); a ball's fill the stage's background.

## 12. Editing

### 12.1 Hooks used, and the two added (S11, S13)

| Hook | Called by | Used by |
|---|---|---|
| `connect` | Connect, by pointer and `L` | Component: between a port and something inside its owner, a delegation; between two outside each other, an assembly; to an interface, a realization from a provider or a usage, by `{ pick, then }` when both fit. Composite: a connector with `ends.<end>.part` from a port on a part; a role binding from a part to a collaboration use, its role by `{ pick, then }`. Deployment: artifact to node, a deployment |
| `moveTo` | A drop, Alt + arrows | A port's side (§4.5); otherwise null: a pin, or a drop into a box (stage 2), which deploys an artifact by nesting |
| `add` | Palette, `N` | A port, into the selected component, class or part (a part's goes to its type, said); a part, into the subject; an interface, ball or rectangle by `{ pick, then }`. With nothing to hold a port selected, `{ error }` |
| `remove` | Delete, Shift + Delete | Composite: a port on a part (§6) |
| `rename` | F2 | Composite: a port on a part renames the class's port; a part's row `name : Type [mult]` sets `valueType` and `multiplicity` |
| **`member(model, view, owner, id, text)` (new)** | Enter or a change on the panel's member rows: the New member field (`id` null) or a row | Component: a row `name` or `name : Type` is a port. Composite: on the subject a row `name : Type [mult]` is a part and `port name` a port. State machine: 4.6's `entry / …` rows. Null: the panel's `member.add` or `member.edit`, as now |
| **`key(model, view, ids, key)` (new)** | A key on a selection, before the canvas's own | Component: `B` on an interface, `set { view, path: ['present', id, 'as'] }` to `ball` or removed. Null: the canvas's |

Both new hooks are in `src/typed/edit.js` only, with no core byte, and return what the others return. `member` is the
"member hook that may return commands" 4.6's wrap waits for (Q8): 5.2 moves `src/uml/state.js`'s listeners onto it, and
`tests/state.test.mjs` and `tests/state-machine.html` pass unchanged.

| Option, the member hook | For | Against |
|---|---|---|
| **(a) `edits.member` in `src/typed/edit.js`, read before the panel; 4.6's wrap moves onto it (recommended)** | No core byte; every type's rows go through one path; the state type loses its own listeners | Two places read a member row: the hook, then the panel's `member` |
| (b) `member.add` may return `{ commands }`, in `src/canvas/edit.js` | One place | Core bytes (about 60 B); the panel learns a second result |
| (c) Each type wraps `TYPED.edit` as 4.6 did | Nothing shared to build | Three more wraps of one function, each with its own listeners |

| Option, ball or rectangle (DoD 4) | For | Against |
|---|---|---|
| **(a) `B` through `edits.key`; the choice offered on add by `{ pick, then }` (recommended)** | Changed by key and chosen by pointer, as stage 4's S18 did for `opensView`; no core byte | The panel does not show it |
| (b) A properties field kind that writes `present` | In the panel | `src/canvas/edit.js` (core, about 80 B); a field kind every type then offers |
| (c) Derived: a ball whenever an interface has both a provider and a requirer drawn | Nothing stored | Takes the choice away; `model.md` rule 10 names `present.as` |

### 12.2 Gestures and their commands

Palettes: component (Component, Interface, Artifact, Port, Comment; lines Realization, Usage, Assembly, Delegation,
Dependency, Manifestation, Comment link); deployment (Node, Device, Execution environment, Artifact, Deployment
specification, Component, Comment; lines Deployment, Manifestation, Communication path, Dependency, Comment link);
composite (Part, Port, Collaboration use, Collaboration, Comment; lines Connector, Role binding, Comment link).
Properties: a part's `valueType`, `multiplicity`, `aggregation` (enum); a port's `valueType`; a connector's `kind`
(enum, component views); a collaboration use's `collaboration`; stereotypes on each. Every gesture has a key; each is
tested by pointer and by key through `apply()`.

## 13. Fixtures

From `risks.md` §6 G2, L8 and L9. Each lives in `tests/`, is laid out in Node and in Chrome under three fonts and both
themes, right and down, with no overlap, no text overflow, no line through a node, no line end off its port's square
(by 1 px), no port off its owner's border, no port name over a node or a line, and no line along a box's border.

| Fixture | Holds |
|---|---|
| `component-minimal.json` | A component with a port providing an interface as a ball, and a component requiring it (a socket) |
| `component-stress.json`, view `edge-cases` | A component three deep with a delegation at each level, outer port to inner port (G2, L8); a port with three lines on one face; ports pinned to each side by `present`; a port with no line; ten ports on one side; a 40-character port name; an interface as a ball with two requirers, and one as a rectangle; an assembly between two nested components' ports; a manifestation; a delegation out of a box (warned when it is not one) |
| `component-stress.json`, view `all` | 50 elements, 60 lines, 40 ports, boxes three deep (P1) |
| `deployment-minimal.json` | A device holding an execution environment holding an artifact |
| `deployment-stress.json`, view `edge-cases` | An artifact deployed by nesting and one by a line (G2); one deployed both ways (warned); nesting six deep with a communication path from the deepest to the top (L8); an execution environment in one; a 300 px path label; two paths between one pair; a deployment specification with its dependency; manifestations into components |
| `deployment-stress.json`, view `all` | 50 nodes and artifacts, 50 lines, boxes five deep (P1) |
| `composite-minimal.json` | A subject with one port and one part, a connector from the port to the part's port (inner) |
| `composite-stress.json`, view `edge-cases` | Two parts of one type, each with the same port and its own connector (G2); a shared part (dashed); a part whose `valueType` names no class (warned); a connector through a part to a port of another type (error); an open collaboration with three roles and two connectors; two collaboration uses with role bindings; a port on the subject with a line inside and one outside |
| `composite-stress.json`, view `all` | 30 parts, 50 connectors, 20 ports on parts (P1) |
| `tests/notation.html` | Its arrowhead checks gain the socket, the delegation's arrow and the manifestation's |

The three target examples move to `examples/bookshop-components.json`, `examples/bookshop-deployment.json` and
`examples/order-service-structure.json`, and join the gallery and CI.

## 14. Performance (P1, S16)

| Fixture | Budget, in Node, CPU time, best of seven after a warm-up |
|---|---|
| Each stress fixture's `all` view | A full layout plus SVG markup under 1 s |
| The same view | An edit that moves nothing, laid out and drawn, under 100 ms; CI holds 1 s and prints it |
| The same view | The common edit, laid out and drawn, under 100 ms; CI holds 1 s and prints it: a port renamed and a component renamed (component); a communication path's label and an artifact moved into another node (deployment); a part's type (composite) |

- The three types pass `repair: false` and `reroute: false` on every layout, as stage 4's do: one picture whether laid
  out fresh or after an edit (DoD 6). The fixtures pin the crossings left; each conformance note states them.
- `labelGaps` adds a `layoutPass` when a label is tight. **5.1's spike**, on a test-only view of 50 nodes, 60 lines,
  40 ports and boxes six deep with inner lines, measures the common edit with and without it before the type lanes
  start; if the edit is over 100 ms on an idle machine, the maintainer decides between `labelGaps` off for the type and
  P1's other options (stage 4 §17) before 5.4 and 5.5 start.
- Browser timings under headless virtual time prove nothing (1.11): budgets are enforced in Node.

| Option | For | Against |
|---|---|---|
| **(a) Both flags off on every layout; 1 s ceiling in CI with the 100 ms target printed; the spike first (recommended)** | The maintainer's rule of 13 Nov 2026; measured on stage 4's types | Crossings next to shared sides kept, pinned and stated |
| (b) Keep port repair for these types | Fewer crossings at ports | `repair` is most of a layout's cost (stage 4 Q19): the common edit misses 100 ms |

## 15. The ELK trial (S17, L9)

`proposal.md` §6.3: try the own engine first; if routing to border ports inside nested nodes does not converge, accept
elkjs (EPL-2.0 or GPL-3.0-or-later, about 477 KB) as a strategy the host passes in, never bundled. 5.7 is that trial.

**What it is.** A spike on a scratch branch (`stage5-elk-trial`), never merged, as 1.12 was. elkjs is installed at one
pinned version into a scratch folder outside the repository; `package.json`, `package-lock.json` and `lib/` do not change.
The only file it merges is `docs/diagrams/notes/spike-elk.md`.

**Its box, by scope:**

1. **Fixtures:** `04-composite-structure.json`, `05-component.json`, `06-deployment.json`, and 5.1's test-only view
   (§14). Nothing else.
2. **One ELK configuration:** `layered`, `hierarchyHandling: INCLUDE_CHILDREN`, orthogonal routing, ports
   `FIXED_SIDE` from §4.2's sides, port labels outside, node sizes from the shapes' `size()`. One revision of it is
   allowed, after the first table, with the reason written down.
3. **The measures, for both engines** (the own engine as 5.1 and 5.3 build it): the layout check's issues (overlap, a
   line through a node, a port off its side, a label over a node); crossings; bends per line; area and aspect; layout time
   (CPU, best of seven after a warm-up); the same layout twice (determinism); how many nodes move after a label edit;
   the size added (gzip of the bundle); the licence.
4. **The fit:** how a host would pass ELK in, given that elkjs's `layout()` returns a promise while `render()` and
   `layout()` are synchronous (a host laying out ahead and handing in positions and routes; or a `layout.run` a host
   supplies with a cached result): a sketch of the API, not code.
5. **It ends** when the table of 3 is filled for every fixture of 1, and the recommendation is written. It does not tune
   the own engine: a finding against it goes to 5.1 or to the maintainer.

**The rule, written before the trial:** ELK is recommended as a host-passed strategy only if, on at least one fixture,
the own engine leaves an issue of the layout check that ELK does not, or ELK's crossings plus bends are a third lower
across the four fixtures; otherwise the own engine alone. The outcome is one of:

- (a) the own engine only; L9 closes with stage 5's fixtures;
- (b) ELK offered as a strategy the host passes in, never bundled, with the API sketch for the maintainer to approve as
  later work (a package after 0.22.0);
- (c) neither converges on a fixture: stage 5 ships with that fixture's limits stated, and the maintainer decides.

| Option | For | Against |
|---|---|---|
| **(a) A spike, boxed by scope, recommendation only, no dependency (recommended)** | L9's question answered with numbers; the core stays MIT and dependency-free (D8); runs beside the type lanes | Its own side needs 5.1 merged before the table is complete |
| (b) No trial; the own engine only | Less work | L9 stays open; the proposal's fallback is never tested |
| (c) Build the ELK adapter in stage 5 | Hosts get it now | A copyleft peer and an asynchronous path before anyone has shown the own engine fails |

## 16. Work packages

### 16.1 Before stage 5 starts

- This note is approved, and `model.md` and `risks.md` take §19's changes with it.
- 4.0 to 4.4 and 4.9 have merged (they have); 4.6 merges before 5.2.

### 16.2 The packages

Each is one pull request. "Owns" lists the only files that package changes while it is open. Built files
(`lib/umlimator.js`, `lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`,
after merging `main`, never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a package
proposes its row in its pull request's description and writes its release notes there for 5.8 to gather.

| # | Work package | Owns | Depends on | Done when |
|---|---|---|---|---|
| 5.0 | **List the files** (the lead). The stage's four sources as empty files, in `ALL` after stage 4's, in load order: `uml/structure`, `uml/component`, `uml/deployment`, `uml/composite` | `tools/build.mjs`, the four empty files | This note | `lib/umlimator-all.js` changes by blank lines only; `lib/umlimator.js` not at all; no other stage 5 lane edits `ALL` |
| 5.1 | **The router for ports and inner lines.** `TYPED.ports` and its call (§4.4); `fromPort`, `toPort`, `inner` in `EDGE_GEO`; inner ends (§5); `labelGaps` (§8); a box's `round` (§9.3); the `socket` end in `ENDS` (§9.2); the registry fields documented, 5.2's hooks too. §14's spike, reported in the pull request before 5.4 and 5.5 start. Tested with a test-only type: ports on nodes and boxes, a port with three lines, ports pinned to each side, an inner line from a box's port three levels down, a round box, a tight label | `src/layout/layered.js`, `src/typed/layout.js`, `src/typed/draw.js`, `src/core/registry.js`, `tests/typed-ports.test.mjs` (new), `tests/typed-ports.html` (new) | 5.0 | Maps unchanged (geometry hashes, stills, `tests/edit.html`); `tests/core-diet.html`, `tests/core-diet.json` and every typed type's tests unchanged; on the test type every line of a port ends on its square within 1 px, no port leaves its side, an inner line enters its box only at its port, in Node and in Chrome under three fonts; a view laid out twice from one memo draws byte-identical markup; with `labelGaps` a tight label's column alone widens; the spike's timings in the pull request; the core's bytes before and after, within §2.3 |
| 5.2 | **The member and key hooks.** `edits.member`, `edits.key` (§12.1); 4.6's wrap in `src/uml/state.js` moved onto `edits.member`; a node whose id holds `->` selected, renamed and deleted through hooks (§6) | `src/typed/edit.js`, `src/uml/state.js` (its wrap only), `tests/type-hooks.html`, `tests/typed-edit.html` | 5.0; 4.6 merged | On a test-only type each hook's result is emitted, said or refused, by pointer and by key; a null falls back to the panel; `tests/state.test.mjs` and `tests/state-machine.html` pass unchanged; no core byte |
| 5.3 | **Structure notation.** `src/uml/structure.js`: the `port`, `component`, `ball` and `artifact` shapes; the sides chosen before the layout (§4.2); the ports with no line, the port nodes added back and the port names (§4.3, §4.5), on a copy; the shared rules (`port-owner`, `manifest-ends`); the looks' accessible names | `src/uml/structure.js`, `tests/structure.test.mjs` (new), `tests/structure.html` (new) | 5.0; 5.1 for its browser test's line ends | Each shape's size, outline and inset agree in Node; drawn in both themes and three fonts with no text overflow; on hand-built geometry, ports with no line keep 8 px apart and names keep off lines and nodes; the sides chosen match a table of rankings; each shared rule has a passing and a failing case |
| 5.4 | **The component type.** §10.1: definition, boxes, ports, delegations, ball and socket, rules, `describe()`, names, legend, `rows` and `word`, hooks (`connect`, `moveTo`, `add`, `member`, `key`) | `src/uml/component.js`, `tests/component.test.mjs`, `tests/component.html` (new) | 5.1 (and its spike), 5.2, 5.3 | Definition of done 2, 4, 5, 6 and 8 on row 5's subset; every gesture by pointer and by key through `apply()`; a 30-step session undone, redone and reopened to byte-identical models; `05-component.json` lays out clean, right and down; `tests/cli.py`'s case for it passes unchanged |
| 5.5 | **The deployment type.** §10.3: the cube, boxes six deep, artifacts, paths with `labelGaps`, rules, `describe()`, names, legend, `rows` and `word`, hooks | `src/uml/deployment.js`, `tests/deployment.test.mjs`, `tests/deployment.html` (new) | 5.1 (and its spike), 5.3 | As 5.4 on row 6; a drop of an artifact into a node and the Owner field each emit their transaction; `06-deployment.json` lays out clean, right and down |
| 5.6 | **The composite structure type.** §6 and §10.2: its own ranking, the subject's box, parts, ports on parts, inner connectors, collaborations (`round`), collaboration uses, role bindings, `refs` (S14), rules, `describe()`, names, legend, `rows` and `word`, hooks (`connect`, `moveTo`, `add`, `remove`, `rename`, `member`) | `src/uml/composite.js`, `tests/composite.test.mjs`, `tests/composite.html` (new) | 5.1, 5.2, 5.3 | As 5.4 on row 4; two parts of one type each draw the type's port with their own connectors; deleting a part deletes its connectors; `04-composite-structure.json` lays out clean, right and down |
| 5.7 | **The ELK trial.** §15 | `docs/diagrams/notes/spike-elk.md` (new); the scratch branch `stage5-elk-trial`, never merged | 5.0 for its fixtures; 5.1 merged for the own engine's column | The table of §15's measures filled for the four fixtures; the recommendation by §15's rule; `package.json`, its lock and `lib/` unchanged on `main` |
| 5.8 | **Fixtures, examples, docs, CLI.** §13's files and their tests (`tests/stage5-fixtures.test.mjs`, `tests/stage5.html`); the three examples moved, with `check.mjs`'s `MOVED`; `render`, `check`, `stills` and `pdf` on each; the schema and `.d.ts`; C10's tests; every document of `plan.md` §7; `docs/conformance/uml-component.md`, `uml-deployment.md`, `uml-composite-structure.md`; the lanes' release notes gathered into `docs/module-api.md` | `examples/`, `tests/*-minimal.json` and `tests/*-stress.json` of the three types, `tests/stage5-fixtures.test.mjs`, `tests/stage5.html`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/embed.py`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | 5.4 to 5.7 | Definition of done 1, 3, 7, 9, 10, 11 and 12 for all three types; §14's budgets in CI; each PDF lists §11's rows; the three examples in the gallery and CI; the stress fixtures' crossings and the six-level width pinned and stated; L9 closed or re-stated by 5.7's outcome |

Existing tests a package edits, and why: 5.8 points `tests/cli.py`'s `05-component` case at the moved example and adds the
other two (the files move, `plan.md` §2's item 10); `tests/notation.html` gains the new ends; `tests/embed.py` lists the new
browser pages; `check.mjs`'s `MOVED` gains three rows. 5.2 edits `tests/type-hooks.html` and `tests/typed-edit.html` only by
adding cases. No other existing test changes.

### 16.3 What runs at the same time (S19)

```
approved ─▶ 5.0 ──┬─▶ 5.1 router: ports, inner lines ──┬──────────────┬──▶ 5.5 deployment ──────┐
                  ├─▶ 5.3 structure notation ──────────┤              ├──▶ 5.4 component ───────┤
     4.6 merged ──┼─▶ 5.2 member and key hooks ────────┴──────────────┴──▶ 5.6 composite ───────┼─▶ 5.8 ─▶ 0.22.0
                  └─▶ 5.7 ELK trial (its own engine's column after 5.1) ────────────────────────┘
```

- Four lanes once 5.0 has merged: 5.1, 5.3 and 5.7 at once, 5.2 once 4.6 has merged; each in its own worktree.
- Then three type lanes: 5.5 after 5.1 and 5.3; 5.4 and 5.6 after 5.1, 5.2 and 5.3. Each may write its definition,
  rules and `describe()` against the contracts above before its needs merge, and tests its drawing and gestures once
  they have. 5.4 and 5.5 start their drawing after 5.1's spike is reported.
- Only 5.1 touches the core.
- 0.22.0 ships after 0.21.0.
- One reviewing agent that did not write the code checks each pull request against the definition of done; before the
  first of two open branches merges, their merge is rehearsed in a scratch worktree (X2).

| Option | For | Against |
|---|---|---|
| **(a) 5.0, 5.1, 5.3 and 5.7 on approval, while stage 4's last lanes merge; 5.2 after 4.6; 0.22.0 after 0.21.0 (recommended)** | No stage 4 lane owns a file 5.1 or 5.3 changes (`src/typed/*` and `layered.js` are read only by 4.5 to 4.7); lanes do not sit idle | `lib/` is rebuilt in both stages' branches: each merge of `main` rebuilds it (X2) |
| (b) Stage 5 after 0.21.0 is released | No overlap | Lanes idle through 4.10 and the release |

### 16.4 Files two packages touch

| File | First | Then |
|---|---|---|
| `tools/build.mjs` | 5.0 | No other stage 5 package |
| `src/core/registry.js`, `src/layout/layered.js`, `src/typed/layout.js`, `src/typed/draw.js` | 5.1 (5.2's hooks documented in its comment) | Read only by 5.3 to 5.7 |
| `src/typed/edit.js`, `src/uml/state.js` | 5.2 | Read only by 5.4 and 5.6 |
| `src/uml/structure.js` | 5.3 | Read only by 5.4 to 5.6 |
| `src/uml/owners.js`, `class.js`, `usecase.js` | Read only | No stage 5 package edits them |
| `tests/cli.py`, `tests/embed.py`, `check.mjs`, `docs/module-api.md` | 5.8 only | |

### 16.5 The release

0.22.0 after 5.0 to 5.8, by the repository's rule: `package.json`, `## 0.22.0:` in `docs/module-api.md`, merged when the
maintainer approves that pull request by number. Its notes say:

- new: the component, deployment and composite structure diagrams; ports on borders; lines from a box's port inward;
  ends through parts; the ball and socket; room for labels where a typed view asks; the member and key hooks;
- the ELK trial's outcome (5.7);
- left out: §17.

C10 (S18):

| Option | For | Against |
|---|---|---|
| **(a) In 5.8, as 4.10 does: the MCP server's read tools and the diff Action's step tested with one model of each type (recommended)** | Tests only, no registry hook | A reorder reads "changed" in `diff()` until per-type writers come |
| (b) Fold the three types into the package after 0.20.0 | One piece of work | Untested types on the MCP server meanwhile |

The `map-repo` skill's pin does not move: it writes none of the three types.

## 17. Left out of the subsets

| Type | Left out |
|---|---|
| Component | Connector multiplicities (`proposal.md` §8.5); component realizations; «subsystem» and «specification»; a component's parts drawn inside it as a composite structure (nested components only); the black-box compartments («provided interfaces», «required interfaces», «realizations», «artifacts»); a port's multiplicity; behaviour, service and conjugated ports (`~`); provided and required interfaces as a port's own props (S1); a ball and socket joined with no interface node; the ball's stem kept short (it is a line the layout places, stated) |
| Deployment | Instance-level deployment (`proposal.md` §8.5): node and artifact instances `name : Type`; a deployment specification attached to a deployment line; nested artifacts; communication path multiplicities; device icons; «manifest» of anything but a component; per-target deployment specification properties |
| Composite structure | Connector multiplicities and end names; a part's own inner structure (shown in its type's view); ports on a collaboration's roles; a part's multiplicity drawn in its corner (it is in its name); «represents» and occurrences; role bindings with several role names; the properties of a port selected on a part (§6) |
| All three | XMI (R6); copy and paste (E7); per-type `diff()` writers; a reader (Mermaid has none); storing a port's order (S3); ELK in the module (§15) |

## 18. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | How much of the core's 4,713 B stage 5 may spend | At most 600 B, fallbacks named | First come; raise C5 | §2.3 |
| 2 | How a port with several lines is drawn | A square that grows 10 px along the border for each further line on a face | Every line at one point (a bundle in the router's search, core); a port as a node of the layered layout | §4.1 |
| 3 | A port's side and order | Side by `present` or by the ranking; order by the far ends, `members` breaking ties; nothing stored | `present.<port>.order` as well; `members` order always | §4.2 |
| 4 | Where a port's name goes | Outside, by the end labels' search | Inside the owner; not drawn | §4.3 |
| 5 | Lines from a box's port inward (delegation) | The router learns inner ends, about 100 B | The type draws an elbow after the layout; not drawn | §5 |
| 6 | Ends through parts (`model.md` §3) | `ends.<end>.part`, as rule 7; a part's ports are its type's, drawn as `<part>-><port>` | A path form in `from`/`to`; parts own copies of ports | §3, §6 |
| 7 | Provided interfaces (`model.md` §3) | Always an `uml.Interface` node, a ball by `present.as` | Also a port's `provided` and `required` props | §3 |
| 8 | Deep nesting | Stage 2's padding, measured to six levels and stated | A box's `pad` per type (core) | §7 |
| 9 | The per-column gap (`labelRoom`) for typed views | Opt in by `labelGaps`, taken by the deployment and component types; the other types later, each a picture change | Every typed view now; not in stage 5 | §8 |
| 10 | The open collaboration | A dashed ellipse, by a box's `round` (about 40 B) | A dashed stadium (a deviation); closed only | §9.3 |
| 11 | Deleting a part | Its connectors go with it, by `refs` | `apply()`'s default: the `part` dropped | §10.4 |
| 12 | The member hook | `edits.member` in `src/typed/edit.js`; 4.6's wrap moves onto it | `member.add` returning commands (core); a wrap per type | §12.1 |
| 13 | Ball or rectangle (DoD 4) | `B` by a new `edits.key`, and a pick on add | A properties field kind writing `present` (core); derived | §12.1 |
| 14 | P1 | Both flags off on every layout, 1 s in CI with 100 ms printed, 5.1's spike first | Keep port repair | §14 |
| 15 | The ELK trial (L9) | Spike 5.7, boxed by scope, its rule written first, a recommendation and no dependency | No trial; build the adapter now | §15 |
| 16 | Order with stage 4 | 5.0, 5.1, 5.3, 5.7 on approval; 5.2 after 4.6; 0.22.0 after 0.21.0 | Start after 0.21.0 is released | §16.3 |
| 17 | C10 for the three types | Tested in 5.8 | Folded into the package after 0.20.0 | §16.5 |

## 19. What this note changes elsewhere

- **`model.md`.** Rows 4, 5 and 6 as §3; §3's two stage 5 rows are settled: a port end through a part is `ends.<end>.part`,
  a port's side is `present.<port>.side` and its order is derived (no stored order); a provided interface is always an
  `uml.Interface` node; a stage 5 row points here.
- **`risks.md`.** L9 points to §4, §6 and §15, and closes or is re-stated with 5.7's outcome; L8 gains the six-level
  fixture (§13); G2's three cases point to §13; C5 records stage 5's share (§2.3); P1 gains §14's common edits; C10
  records stage 5's tests (S18); a new row for the ball's stem placed by the layout (§17).
- **`plan.md`.** §5's stage 5 row points here (done with this note); §4.3 lists `src/uml/structure.js`.
- **`proposal.md`.** §8.5's subsets for the three types point to §17.
- **`notes/stage-4.md`.** §10.4's member-row wrap points to §12.1 when 5.2 moves it.
- **`README.md` in this folder.** The status table shows this note and, once approved, stage 5's work packages; the log
  records the decisions taken. (The lead's.)
