# Stage 5 design note: component, deployment and composite structure

Status: **approved** by the maintainer 13 Nov 2026, with every recommendation of §18 taken; the maintainer approves it before work package 5.0 starts. Written against `main` at 50b3294
(stage 4's 4.0 to 4.4 and 4.9 merged, and maps' one card-shape style, #210); stage 4's 4.5 to 4.8, in review, were read
on their branches as gathered at 1312a3a (`stage4-docs`). Symbols are named, not line numbers.

Stage 5 ships release 0.22.0: the component diagram (`uml.component`), the deployment diagram (`uml.deployment`) and the
composite structure diagram (`uml.composite-structure`) (`plan.md` §5, row 5). Its new engine work: ports on borders;
ends through parts; deep nesting; and a time-boxed trial of the own engine against ELK (`risks.md` L9). It has no reader:
Mermaid has no component, deployment or composite structure diagram.

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 4, 5 and 6 | Kept, with refinements: a port may carry `valueType`; a connector end through a part keeps `ends.<end>.part` (UML's `partWithPort`); a provided or required interface is always an `uml.Interface` node; a usage drawn to a ball is a socket; any node kind nests in any node kind (UML's `nestedNode`), the unusual pairs warned; the subject is a class, a component or a collaboration; row 5 gains `uml.Package` and `uml.ComponentRealization` | §3 |
| S2 | Where a port is drawn | A 12 px square centred on its owner's border, node or box. Its side is `present.<port>.side` when the view gives one, else the side facing most of its lines' far ends, chosen from the ranking before the layout. The router ends each of its lines on the square; a port with several lines on one face grows along the border by 10 px a line, so each line keeps its own end, as stage 4's bar does. A box with ports takes a wider padding (S8) | §4.1 |
| S3 | The order of ports on a side | By where their lines go, as the router orders ends now (fewest crossings at the border); `members` order breaks ties and places ports with no line. No order is stored (rule 9) | §4.2 |
| S4 | A port's name | Outside its owner, beside the square, placed by the end labels' search (`endLabels`, `src/typed/draw.js`), which keeps clear of lines, nodes and labels placed before it | §4.3 |
| S5 | How the router learns ports | The hook that already runs there: `LP.ports` (`TYPED.loops`'s, `src/typed/layout.js`), which `layoutPass` calls after it pushes every end to its side and before it spreads them, is passed `sides` too and places the ends of lines that name a port (`fromPort`, `toPort`), leaving the rest to the router as now. The side cap leaves a port's lines on their side. About 26 B in the core | §4.4 |
| S6 | A line from a box's port to something inside the box (delegation; a connector from a structured class's port to a part) | The router learns inner ends: a line marked `inner` may join a box and something it holds; its end on the box leaves the border inward, placed by the port hook. About 15 B in `src/layout/layered.js` (the `holds` bypass) | §5 |
| S7 | Ends through parts | A part is a member drawn as a node in its structured classifier's box. A port on a part is drawn under the geometry id `<part>-><port>`, which no element id can be (`model.md` rule 5); the composite type maps it back in its hooks; its side is `present.<part>.ports.<port>.side`. The ports drawn on a part are the ones its connectors name, and every port of the classifier (class or component) its `valueType` names by label (M8) | §6 |
| S8 | Deep nesting | Stage 2's boxes, with a box's padding widened to 48 px where it or a box it holds has a port with lines, through one hook slot in `frameOf` (`TYPED.frame`, which also grows a round box, S12): stage 2's 12 px leaves no room for a port on each of two nested borders. Tested to six levels, with a line from the deepest to the top level (L8); the width is pinned and stated | §7 |
| S9 | Room for labels | The deployment and component types set a small `gap` and take the per-column widening every typed view already has (`gapAfter`), with no core byte; `labelGaps` (a typed view's `labelRoom`, column gaps only, about 25 B) is built only if 5.1's spike shows labels left with no spot. As built: the spike left 12; decision 9 taken (the maintainer's decision of 13 Nov 2026), `labelGaps` built in 5.1 (22 B) and set by the deployment and component types | §8 |
| S10 | The ball and socket | `present.<interface>.as: "ball"` draws the interface as a 16 px circle with its name under it; a realization to it is a plain solid line; a usage to it ends in a socket, a new line end in `src/typed/draw.js`'s table | §9.2 |
| S11 | Changing an interface between ball and rectangle (DoD 4) | `B` on a selected interface, through a new hook `edits.key`, emits `set` of `present`; the palette's `add` offers the choice with `{ pick, then }` | §12 |
| S12 | The open collaboration | A dashed ellipse round its roles: a box may carry `round: true`, which the `TYPED.frame` hook grows by √2 about its centre so the ellipse holds the rectangle of its contents. No byte beyond S8's hook slot | §9.3 |
| S13 | The member hook | `edits.member(model, view, owner, id, text)`, called by `src/typed/edit.js` on the panel's member rows before the panel commits them; null leaves the row to the panel. 4.6's own wrap of `TYPED.edit` in `src/uml/state.js` moves onto it. No core byte | §12.1 |
| S14 | Deleting a part | The connectors through it go with it: the composite type declares `refs` on `uml.Connector`'s `props.ends.from.part` and `props.ends.to.part` that cascade. No core byte | §10.4 |
| S15 | The core's budget (C5) | Stage 5 spends at most 300 B of the 4,713 B left at 50b3294 (targets: 126 B, 151 B with `labelGaps`); everything listed in §2.3 stays in family files, the registry's comments included | §2.3 |
| S16 | P1 | `repair: false` and `reroute: false` on every layout of the three types, as stage 4's types do. CI holds the 1 s ceiling and prints each common edit against the 100 ms target, best of seven in CPU time after a warm-up (`tests/state.test.mjs`'s P1 test). A spike in 5.1 measures a view with ports, inner lines, long labels and six levels of boxes before the type lanes start | §14 |
| S17 | The ELK trial (L9) | A spike package, 5.7, boxed by scope: a fixed list of fixtures and measures, one ELK configuration and one revision. Its outcome is a written recommendation, `notes/spike-elk.md`. No dependency is added: the module, `package.json` and its lock do not change. Its ELK column starts on approval, its own engine's column on 5.1's view after 5.1 and on the three examples after 5.4 to 5.6 | §15 |
| S18 | C10 for the three types | Tested in 5.8 as 4.10 does (the MCP server, the diff Action) | §16.5 |
| S19 | Order with stage 4 | 5.0, 5.1, 5.3 and 5.7 start when this note is approved; 5.2 after 4.6 merges; 0.22.0 after 0.21.0 | §16.3 |
| S20 | Hiding a port, part or role (DoD 4) | Members cannot be hidden, as stage 3's messages (P12): Delete on one deletes it from the model, the hint line says so, and the conformance notes say so under item 4 | §12.2 |
| S21 | Departures from UML | Stated in §17: the delegation's arrow; a realization or usage drawn from a port; the narrowings of the subsets | §17 |

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
| Q1 | `layoutPass`'s ends on a card (`pushSide`, the per-side loop) | Every line gets its own end. A card's side takes at most `max(1, ⌊length × 0.84 / 14⌋)`; the extras on the left and right go to the top and bottom, whatever their `fromSide` or `toSide` (the cap loop runs after those are applied). Ends are ordered by where the far end lies and spread 16 px apart on a left or right side, 26 px on a top or bottom. Between pushing the ends and spreading them, a typed view's `LP.ports(pushSide)` (`TYPED.loops`) already runs (5.1: `LP.ports(pushSide, sides)`, §4.4) | S2, S3, §4.4 |
| Q2 | The same loop on a box (`n.box`) | Each end lies in line with its far end where the border allows: on a left or right side 40 px below the top (the title) and 16 px above the bottom, 20 px off the corners on the top and bottom, 16 (26) px apart | §4.4 |
| Q3 | `layoutPass`'s `holds` | A line between a box and something inside it is refused with a warning ("it joins the box … and something inside it"); stage 2's `line-inside` rule says so for packages | S6 |
| Q4 | `gridRoute` and `restub` | A line leaves its end along `OUT[side]`, the side it ends on. An end with the opposite side leaves the other way: the change S6 needs is where its point is put, not the search | §5 |
| Q5 | `drawnLines` and `typeGeo` (`src/uml/class.js`) | A line that ends on a member is drawn to the member's owner: today a port is its owner's box | §4 |
| Q6 | `frameOf` (`layoutPass`) | A box is the rectangle round its contents with 12 px of padding and 24 px of header room. A member card takes 36 px to each side, 14 above and 30 below; a child box goes in as its raw frame. So a box of cards is 96 px wider and 92 px taller than its cards; each box round a box adds only 24 along a right-laid flow and 48 across, and the two borders lie 12 px apart. Boxes keep 32 px apart (`BOXGAP`) | S8, S12 |
| Q7 | `labelRoom` and `gapAfter` (`layoutPass`, `layoutGraph`) | Only a map asks for room for a label that found no spot (`tight` reads `map`, and measures a row gap as `rowY(r) + NH`, not a typed row's height). Every typed view already widens the gap between neighbouring columns for a labelled line (`gapAfter`, by `labelW`, which honours `cut`), plus 48 px where it crosses a box's border. The one wide gap is each type's own `gap`: the class type 96 px plus its widest label and 40 with boxes, the state type 48 px, the activity type its widest label and 40 (stage 4 §9.1) | S9 |
| Q8 | The panel's member rows (`commit`, `src/canvas/edit.js`) | A new row goes to `member.add(text, owner)`, which gives a member or `{ error }`; an edited one to `member.edit(member, text)`, which gives `{ commands }`. No hook sees the view, and `member.add` cannot give commands. 4.6 reads `entry / …` rows by wrapping `TYPED.edit` in `src/uml/state.js` with listeners of its own, marked as waiting for a member hook | S13 |
| Q9 | `apply()`'s `delete` | A reference of kind `part` (`props.ends.<end>.part`) is dropped: the connector stays, its `part` gone. A type's `refs` may make a reference cascade instead (`propRefs`) | S14 |
| Q10 | `set { view, path }` | Sets any field of a view, `present.<id>.side` and `present.<id>.as` included | S2, S11 |
| Q11 | `autoPos` (`src/map/context.js`) | Ranks the view's `nodeIds` only. A member drawn as a node (a part) takes no rank: its type ranks it, as the communication type ranks its stacks (`rowsFor`, `untangle`) | §10.2 |
| Q12 | `validate()` (`src/core/model.js`) | An id that contains `->` is an error ("names lines by position"), so `<part>-><port>` can never be an element's id | S7 |
| Q13 | `upstream_view()` (`umlimator.py`, F3) | Shows members as cards, so a line that ends on a port passes upstream's check; `tests/cli.py` renders, checks, stills and prints `05-component.json` today, drawn as plain cards | §16.2 |
| Q14 | Stage 4's Q17, measured again (`layoutTyped`, a 120 × 60 card in nested boxes, laid out right) | One box: 216 × 152 px; two: 240 × 200; six: 336 × 392. Each level past the first adds 24 px along and 48 across. Stage 4's "72 along, 44 across" counted the card's margins only | S8 |
| Q15 | `SHAPE.node` (`src/draw/shapes.js`) | Maps' node is UML's cube drawn inside the card's box (7 px of depth); its `out` and `inset` are geometry only, its `det` paints in the card's kind | §9.1 |
| Q16 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 184,984 B at 50b3294 and at 1312a3a (stage 4's open lanes change no core file). The cap is 189,697 B (0.16.0's 164,954 B plus 15%): 4,713 B left | S15 |

### 2.3 The core's budget (C5, S15)

4,713 B are left for stage 5, stage 6 and the three milestones. Stage 5's ports are the one change of the plan that must
be the router's; stage 6 (a time-ruler strategy) and milestone 2 (line-end skins, scope rules) can live in family files;
milestone 4b's boundary events attach to a border as a port does and reuse this stage's hook.

What stays out of the core, in files listed in `tools/build.mjs`'s `ALL` only:

- the port groups, their order and their ends (`LP.ports`, `TYPED.loops`'s, `src/typed/layout.js`);
- a box's padding and its round frame (`TYPED.frame`, `src/typed/layout.js`);
- the socket end (`src/typed/draw.js`'s `ENDS`);
- every shape and look: port, ball, component, artifact, node, device, execution environment, deployment
  specification, part, collaboration, collaboration use (`src/uml/structure.js` and the type files);
- the ports drawn on parts, the ports with no line, the port names;
- `edits.member` and `edits.key` (`src/typed/edit.js`);
- the new registry fields' documentation: in `src/typed/layout.js` and `src/typed/edit.js`, beside the code that reads
  them, with one pointer line in `src/core/registry.js` (C5: typed-only code and its comments leave the core);
- every type's definition, rules, `describe()`, names, legend and hooks.

What may touch the core, each change stating its bytes in its pull request. Each is a hook slot or a guard, as C5 asks:

| Change | File | Lane | Target |
|---|---|---|---|
| `LP.ports(pushSide)` becomes `LP.ports(pushSide, sides)`; the hook places port ends and deletes the entries it placed (S5) | `src/layout/layered.js` | 5.1 | 6 B |
| ~~The side cap leaves an end with a port on its side (§4.2)~~ Built in the port hook instead (5.1): it puts a port's end back on the side the type gave, so the cap needs no skip | `src/typed/layout.js` | 5.1 | 0 B |
| An `inner` line passes `holds` (S6) when it names a port at its inner end (`fromPort` for `from`, `toPort` for `to`); its point is placed by the port hook | `src/layout/layered.js` | 5.1 | 15 B |
| `frameOf` asks a typed view's `TYPED.frame(b)` for the padding and the round frame (S8, S12); `b` is the frame as measured, carrying the box's `pad` and `round` | `src/layout/layered.js` | 5.1 | 45 B |
| The jog repair reads a side the port hook may have emptied and deleted (`sides[…]?.length`) | `src/layout/layered.js` | 5.1 | 1 B |
| The registry's pointer line to the fields' documentation | `src/core/registry.js` | 5.1 | 40 B |
| | | | **126 B** (built: 116 B, 184,984 B to 185,100 B) |
| ~~Only if decision 9 takes `labelGaps`~~ Decision 9 taken (the maintainer's decision of 13 Nov 2026): `tight` reads `map \|\| dg.labelGaps`; a row gap is a candidate only on a map (`length: map && r1 - r0`), so a typed view's room is column gaps only; the registry's pointer line names the field | `src/layout/layered.js`, `src/core/registry.js` | 5.1 | 25 B (built: 22 B, 185,100 B to 185,122 B; stage 5 so far 138 B) |
| Decision 22 taken (the maintainer's decision of 13 Nov 2026): `overlapIssues` skips a node against the node its `owner` names, either way round (`(a.owner \|\| 0) === b.id`, so two nodes with neither an owner nor an id are still measured), not on a map: a map card's `owner` is its team's name, which may be another card's id | `src/layout/audit.js` | follow-ups | 20 B (built: 37 B, 185,109 B to 185,146 B by `/usr/bin/gzip -9` on this machine, where 5.1's 185,122 B measures 185,109 B; stage 5 so far 175 B) |
| A box's title on two lines, its keyword above its name (UML 2.5.1; the maintainer's decision of 13 Nov 2026): `frameOf` passes `TB` to `TYPED.frame`, which grows the header room by the box's `head` on its title's side; the router's reserve over a box's title (`runRouting`) and the layout check's header test (`routeAudit`) are `head` px deeper, not on a map; the registry's pointer line names `head` | `src/layout/layered.js`, `src/layout/audit.js`, `src/core/registry.js` | follow-ups | (built: 37 B, 185,146 B to 185,183 B) |
| | | | **Follow-ups: 74 B** (185,109 B at eaba18e to 185,183 B; stage 5 so far 212 B of its 300 B) |

| Option | For | Against |
|---|---|---|
| **(a) Stage 5 spends at most 300 B; anything over waits for the maintainer (recommended)** | 174 B of slack over the targets (149 B with `labelGaps`); leaves 4,413 B for stage 6 and the milestones | The fallbacks below are worse pictures |
| (b) First come, first served | Nothing to decide | Milestone 4b's boundary events and M2's scope rules may find no room |
| (c) Raise C5 | No wait | The maintainer's call; maps' hosts pay for UML |

If a change goes over, the fallbacks are, in this order: the open collaboration draws a dashed stadium (S12's option b);
a delegation is drawn by the type as an elbow after the layout (S6's option b). The port hook has no fallback: without it
a port is its owner's box (Q5).

### 2.4 Rules every package keeps

- **Maps draw exactly as now.** The geometry hashes (`bench/expected.json`), the examples' stills and every map test are
  unchanged in every pull request (C1). Every new branch in `layoutPass` is reached only through a field no map sets
  (`dg.typed` with `fromPort`, `toPort`, `inner`, `portRank`, a box's `pad` or `round`, and a view's `labelGaps`, decision 9).
- **Every typed example draws exactly as now.** The class, package, object, sequence, communication, use case, activity,
  state and overview examples' markup is held by `tests/core-diet.html`, `tests/core-diet.json` and each type's own
  tests. None of them sets a field above.
- **The API is additive only** (C2). The three types and their helpers are internal, in `lib/umlimator-all.js`; the new
  registry fields (`edits.member`, `edits.key`, a line's `fromPort`, `toPort`, `inner` and `portRank`, a box's `pad` and
  `round`, and a view's `labelGaps`, decision 9) are optional and provisional.
- **Nothing after `layoutTyped` edits what it returned** (stage 4 §2.4): the ports with no line, the port nodes added
  back for selection and the port names are put on a copy of the geometry. A test lays each type's view out twice from
  one memo and checks the two pictures are byte-identical.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment`, `uml.CommentLink` and `props.stereotypes` are on every UML view already.

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 4 | `uml.composite-structure` | `uml.Class`, `uml.Component` or `uml.Collaboration` (the `subject`), `uml.Collaboration`, `uml.CollaborationUse`, `uml.Comment` | `uml.Property` (a part of the subject, or a role of a collaboration), `uml.Port` | `uml.Connector`, `uml.RoleBinding`, `uml.CommentLink` | Part props: `valueType` (text, M8), `multiplicity`, `aggregation` (`composite`, the default, or `shared`; a shared part is drawn dashed). Port props: `valueType`. A connector's end is a part, a port of the subject, or a port reached through a part (`ends.<end>.part`). The `subject` is listed in `nodeIds`; its parts are drawn inside it, and the classes that type them are model nodes this view does not list. A collaboration use's `parent` is the subject; `props.collaboration` names a collaboration by label. A role binding runs from a part to a collaboration use; its `label` is the role's name |
| 5 | `uml.component` | `uml.Component`, `uml.Interface`, `uml.Artifact`, `uml.Package`, `uml.Comment` | `uml.Port` | `uml.InterfaceRealization` (provided), `uml.Usage` (required), `uml.ComponentRealization`, `uml.Connector` (`props.kind`: `assembly` or `delegation`), `uml.Dependency`, `uml.Manifestation`, `uml.CommentLink` | A component's `parent` is a component (drawn nested) or a package. A provided or required interface starts at a component or at one of its ports. `present.<interface>.as: "ball"` draws the ball; a usage to a ball ends in a socket, else it is a dashed «use» arrow |
| 6 | `uml.deployment` | `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component`, `uml.Comment` | | `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency`, `uml.CommentLink` | An artifact or deployment specification whose `parent` is a node, device or execution environment is deployed on it; a `uml.Deployment` line from it to one is the other form (G2). A node, device or execution environment's `parent` may be any of the three (UML's `nestedNode` is `Node[*]`); the usual pairs are an execution environment in any of them, a device in a node or device, a node in a node, and the others are warned |

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
  machine); `06-deployment.json` does not, the stress fixture does. Any node kind may nest in any node kind; only the
  unusual pairs (a node in an execution environment, say) are warned (`nest-kinds`).
- **The subject is any structured classifier the subsets have:** a class, a component or a collaboration, and a part's
  ports are those of the class or component its `valueType` names.
- **A package may hold components** (`model.md` row 5 gains `uml.Package`, already a box type there, §7).
- **A component realization** (`uml.ComponentRealization`, UML 11.6): `proposal.md` §8.5's "realization" in row 5 covers
  both the interface realization and this one.

  | Option | For | Against |
  |---|---|---|
  | **(a) Add `uml.ComponentRealization`: a dashed line with a hollow triangle from the realizing classifier to the component, the class type's look, with a `component-realization-ends` rule and a palette entry (recommended)** | The subset as `proposal.md` §8.5 wrote it; no core byte; the look exists | One more line kind to test |
  | (b) "Realization" means the interface realization only, stated in §3 and in `proposal.md` §8.5 | Nothing to build | A narrowing of the written subset |

The three example files keep their shapes. `check.mjs` gains no hand rule for them: each type's `validate` runs there.

## 4. Ports on borders (S2 to S5, L9)

### 4.1 The shape and its size

A port is a square, 12 by 12 px, centred on its owner's border: half outside, half inside. It is filled with the stage's
background and stroked `--um-muted` (T2). A port with `k` lines leaving one face is `12 + 10 (k − 1)` px long along the
border, so each line keeps its own end at the router's separation (`SEP`, 10 px): stage 4's bar grows with its busier side
the same way. A port's hit area is a transparent 24 px square (E8).

A node is sized so its ports fit: on each side, `16 + Σ (port length + 8)` px at least, above its shape's own size. The
type computes it before the layout, from the sides it has chosen (§4.2). A box is not sized by the type: its size comes
from its contents only (`frameOf`). Where a box's side cannot hold its ports, the hook narrows their spacing to 4 px
(§4.4, step 3), and the layout check reports what still does not fit; the fixtures' ten ports on one side are on a node
and on a box, and the box's case is pinned and stated.

| Option | For | Against |
|---|---|---|
| **(a) One square per port, lengthened along the border for each further line on a face (recommended)** | Every line ends on the port; the router keeps its rule that lines never overlap; no change to the search | A busy port is a bar, not a square |
| (b) Every line of a port ends at one point | UML's picture | The router forbids overlap: lines leaving one point share their first segment, which it refuses (`colinear`); a bundle would be a new case in the search, the core's hottest code |
| (c) A port is a small node of the layered layout | The router knows it | The layered layout cannot keep a node on another's border; it would be a node beside its owner |

### 4.2 Its side and its order (S3)

- **Side.** `present.<port>.side` (`left`, `right`, `top`, `bottom`) when the view gives it. Otherwise the type picks it
  before the layout, from the ranking it is given (`pos`): the side facing most of the port's lines' far ends, by column,
  then by row; a port with no line takes the side with fewest ports, left first. Every line of a port gets that side as
  its `fromSide` or `toSide`. The side cap (Q1) runs after those are applied and would move a busy port's extras to the top
  or bottom (one port with four lines needs a 66 px side, whose cap is 3), so the cap loop skips an end with a port
  (`e.fromPort` on its `from` end, `e.toPort` on its `to` end; about 20 B, §2.3): the router never moves a port's line to
  another side. (As built, 5.1: the cap has no skip; the port hook puts each port's end back on the side the type gave,
  0 B; §4.4.)
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
// src/typed/layout.js: TYPED.loops(...) returns { mark, ports, route }; ports grows a second argument
LP.ports(pushSide, sides) -> void   // sides: { 'id|side': [{ e, other, n }] }, as layoutPass builds them; pushes the
                                    // loops' ends as now, then places the ends of every line with e.fromPort or e.toPort,
                                    // setting e.p1 / e.p2 itself, and deletes the entries it placed
```

The hook point already exists: `layoutPass` calls `LP.ports(pushSide)` for a typed view after it has pushed every end to
its side and before the per-side spread (Q1). Port placement goes inside it; the core's change is the second argument
(about 6 B), and the spread then sees only the ends no port names. On each side that holds a port's line, the hook:

1. groups the ends by the border they sit on and by port: an inner line's end on a box is grouped on the border its port
   is on, not under its `fs` or `ts` (§5), and that side's other ends are spread without it; an end with no port is a
   group of one, as the router would place it;
2. orders the groups by the mean of their far ends, ties by `members` order (`portRank`, a number the type puts on each
   line that names a port);
3. spreads them along the side's free span (Q1 for a node, Q2 for a box, below the title), 8 px between ports and 10 px
   between the ends of one port, centred on the span; a side that cannot hold them all keeps the order and narrows the
   spacing down to 4 px, then is reported by the layout check;
4. for each line, sets its end's point (`e.p1` or `e.p2`) on the border at its place in its port, and records each port's
   rectangle in `e.fpb` and `e.tpb` (the port's box on that end), which the type reads to draw it.

**As built (5.1).** Where the build departs from the above:

- The side cap is not taught to skip port ends (§2.3): the hook takes every end that names a port off the side the cap left it
  on and puts it back on the side the type gave (`fromSide`, `toSide`), so it costs no core byte. A port's side is held only
  when the type gives `fromSide` or `toSide`: an end with neither keeps the side the cap left it on. The cap still counts
  port ends, so a side can keep more ends than its cap.
- Ports that still leave their side at 4 px apart (past a node's ends, or a box's free span) are reported with a warning
  (`warn`), as step 3 says; the type grows the node.
- An `inner` line passes `holds` only when it names a port at its inner end; one without is refused with the usual warning.
- The hook deletes a side it has emptied; layoutPass's jog repair reads such a side with `?.` (1 B). A view with ports passes
  `repair: false`, as the three types do (§14): port repair would swap a port's end with another line's.
- `portRank` is a number, or `[from, to]` for a line with a port at each end.
- A port with `k` lines on one face takes room beside its node: the column (row) gap it faces widens to `k × 10 + 2 × STUB +
  8` px, in `TYPED.loops` (no core byte). Without it the four-line port's lines crossed in a 48 px gap. A box's port takes
  the same room beside the column (row) of its cards its border faces, plus its pad.
- A node's self-loop keeps its ends apart from a port's on one side: its `from` end is the one the loop pushed on the right.
- An end with no port on a side that holds a port is a group of one, 2 px long; ports' ends sit on the border (the square's
  middle), and each end's port box is its own copy (`e.fpb`, `e.tpb`).
- Known limit: lines into one side of a node are routed nearest first (`into`, layoutPass); a line of a port into a side that
  another line also comes into can be routed before its port's other lines and cross them. The fixture has none; 5.4 to 5.6
  pin what is left.

`fromPort`, `toPort`, `inner` and `portRank` join `EDGE_GEO` (`src/typed/layout.js`), so a change of port, or a reorder of
the members, lays the view out again; a box's `pad` and `round` are inside `containers`, already in `VIEW_GEO`. With decision
9 taken, `labelGaps` joins `VIEW_GEO` in 5.1 (`tests/layout-typed.test.mjs` checks every `dg` field the layout reads
is there). Nothing here reads a map's lines: a map never sets them.

### 4.5 Drawing, selecting and editing a port

After the layout, on its copy (§2.4), the type:

- draws each port's square where the hook put it, and each port with no line on its side at its place in the order;
- slides each port's line end onto the square's outer face (inner face for an inner line, §5), on the copy, as 4.1's
  slide does for shapes;
- adds each port to the copy's `nodes` and `byId` as a node with shape `port`, 12 px square at its place, so a click
  selects it, F2 renames it, Delete and the outline work, and `L` or a drag from it connects, with no canvas change
  (stage 4 §5.3's partitions are the precedent). Its id is the port's own, or `<part>-><port>` on a part (§6).

A drag of a port, or Alt + arrows on it, goes to the type's `moveTo`: the side nearest the drop point, or the side in
the arrow's direction, as `set { view, path: ['present', port, 'side'] }` (on a part, `['present', part, 'ports', port, 'side']`, §6). Alt + arrow along the port's own side does
nothing (order is not stored, S3), and the hint line says so.

**As built in 5.3** (`src/uml/structure.js`: `portSides`, `portFit`, `portsDrawn`, `SN_SAY`, `structProblems`):

- A port's name is drawn inside its port node's group (`n.nameBox`, set by `portsDrawn`), so it is selected and hit with
  the port; the end labels' search places it in its role slot (above a line that leaves sideways, left of one that leaves
  up or down).
- The ports with no line on a side are spread evenly over its free span in `members` order, then pushed along it, 20 px
  centre to centre, past any port with lines they would come within 8 px of; a side too short for them narrows the gaps
  down to 4 px (§4.4, step 3), and those that still do not fit are held at the span's start, on the border, with
  `over: true` on their port node.
- A port node carries `owner` (its owner's id). The layout check (`overlapIssues`, `src/layout/audit.js`) reported every
  port against its own owner, since a port sits half inside it by design (§4.1); 5.3 owned neither the check nor the
  types, so how a type's check passes was the maintainer's decision, open for 5.4 to 5.6. Decision 22, taken: the check
  skips a node against the node its `owner` names (§2.3), so a port on its owner is no overlap; a port on another node is.
- A port's name keeps off every box's border and 24 px header room. A line's end labels (`TYPED.lines`,
  `src/typed/draw.js`) are placed later and do not see the port names: 5.4 to 5.6 keep them apart.
- Model ids such as `__proto__` and `constructor` are safe as port and owner ids; a port id seen before, or a node's
  id, is drawn once (the first) or not at all.
- A port whose lines record no box (`e.fpb`, `e.tpb`, before 5.1's hook) is a 12 px square round its line's end.
- Along a side as crowded as §4.1 allows (8 px between squares), neighbouring 24 px hit areas overlap by 4 px; across the
  border each port has its full 24 px.
- `portSides` takes a box's place in the ranking from the type (the mean of what it holds); a far end in the owner's own
  slot counts for no side.
- `manifest-ends` takes a deployment specification as an artifact (UML's `DeploymentSpecification` specializes `Artifact`).
- A line the router ends on a ball's left or right side below the circle slides to the circle's centre line; the
  component type gives every line to a ball its side (§9.2), so none does.

## 5. Lines from a box's port inward (S6)

A delegation joins a component's port to a port of a component inside it; a composite structure's connector joins the
subject's port to a part's port. Both join a box and something it holds, which the router refuses (Q3).

| Option | For | Against |
|---|---|---|
| **(a) The router learns inner ends: a line with `inner: 'from'` or `inner: 'to'` passes `holds`, and that end, on the box's border, leaves the border inward (recommended)** | The router routes it among the box's contents like any line, with its bends, crossings and labels; the search does not change: the type gives the box's end the side it leaves by (a port on the box's left border gets `R`), and the port hook puts its point on the left border (Q4). The core's change is the `holds` bypass, about 15 B | Core bytes; the box's border is crossed at the port only, which the fixtures check |
| (b) The type draws an elbow after the layout, from the port inward to the inner end | No core byte | Routed by nothing: it may cross a node or another line inside the box, which the layout check reports and cannot avoid |
| (c) Not drawn; the delegation is in the accessible name and the PDF only | Nothing to build | Delegation is what a component diagram's nesting is for (`05-component.json` has two) |

Under (a): the type marks a line inner when one end's node is a box that holds the other end; it gives the box's end the
side opposite the port's (the direction the line leaves), and the port hook (`LP.ports`, §4.4) places the box's end on the
port's own border, on the square's inner face, grouped with that border's ends, not with those of the side it leaves by.
The end inside the box is an ordinary end. A line from a box's port to a node outside it is an ordinary line to a box
(Q2), with its port. A box with a port whose line runs inward takes the 48 px padding of §7, so the stub inward and the
nested box's port both fit.

## 6. Ends through parts (S7, G2)

A part is a member of its structured classifier (a `uml.Property` of the subject) and is drawn as a node inside the
subject's box: its id is the member's (4.1 tested member ids as boxes; a member-id node is placed the same way). Its
ports are the ports of its type, the class or component its `valueType` names; two parts of one type each show that type's ports
(G2), so a port's drawn id must say which part it is on.

- **The ports drawn on a part:** every port its connectors name through it (`ends.<end>.part`), and every port of the
  class or component whose label equals its `valueType` (text, M8; with none, or several, only the connectors' ports, and
  the rule `part-type` warns).
- **Their geometry ids:** `<part>-><port>`. No element id contains `->` (Q12), so it can never meet a model id. The
  composite type's hooks (`rename`, `remove`, `moveTo`, `connect`) map it back: a rename renames the class's port, for
  every part of that type, and the hint line says so; Delete on it removes the connectors through that part to that port
  (Delete from the model, Shift + Delete, deletes the class's port); a connect from it gives a connector whose end is the
  port with `ends.<end>.part` the part.
- **Their side** is `present.<part>.ports.<port>.side`, or chosen as in §4.2. The key under `present` is the part's id, an
  element `validate()` knows and `references()` follows, so it neither warns "is not an element" nor goes stale when the
  part is deleted; a port deleted from its class leaves a `ports` entry the type ignores.
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

Nesting is stage 2's boxes. A component holds components; a node holds devices, execution environments and artifacts; a
subject holds its parts and collaboration uses. Measured (Q14): one box round its cards adds 96 px along a right-laid flow
and 92 across; each box round a box adds 24 along and 48 across, so six levels round a 120 × 60 card make a 336 × 392 px
box.

Those 12 px between a box's border and its child box's border cannot take a port on each: two 12 px squares centred on
the borders touch (6 + 6 px), and a line's stub (`STUB`, 18 px for a typed view) does not fit between them. So a box whose
ports have lines, or that holds a box whose ports have lines, takes a padding of 48 px (2 × `STUB` and the square). The
type sets it as the box's `pad`; `frameOf` reads it through the hook slot `TYPED.frame` (§2.3), which also grows a round
box (§9.3). With it, each level that has ports adds 96 px along and 120 across; the composite and component fixtures'
three-deep delegations take it, a deployment view (no ports) keeps stage 2's 12 px.

- `ownersOn` builds the boxes, with `look.boxTypes` the type's (component: `uml.Component`, `uml.Package`; deployment:
  `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`), `qualify: false` (a deployment's names are not qualified;
  a component's are, by its packages, as the class type's), and the shape and word of each kind.
- The fixtures go to six levels, with a line from the deepest node to one at the top (L8), a port on a box three levels
  down with a delegation into its contents, and boxes side by side at each level; laid out right and down, in three fonts.
  The width of the six-level view is pinned and stated in the conformance note, with L8's known limit (a line through a
  box that holds neither end) checked, not assumed.

| Option | For | Against |
|---|---|---|
| **(a) A box's `pad`, 48 px where it or a box it holds has ports with lines, else stage 2's 12 px, through `TYPED.frame` (recommended)** | The §13 fixture of a delegation at each of three levels can be laid out; views with no ports draw as now; about 45 B in the core, shared with S12's round frame | Deep component views grow: 96 px a level along where ports are |
| (b) Stage 2's padding unchanged | No core byte | A port on a box and a port on the box inside it touch, and a line between them has no room for its stubs: a delegation from an outer port to an inner port cannot be laid out |
| (c) A `pad` the view sets for all its boxes | One number per view | Every level pays for the busiest one |

## 8. Room for labels (S9)

A deployment's communication paths carry long labels ("PostgreSQL wire protocol"), and a component view's boxes take 48 px
of each column gap (Q7). Every typed view already widens the gap between neighbouring columns for a labelled line
(`gapAfter`, by `labelW`, which honours a line's `cut`): the one wide gap of the class, state and activity types is their
own `gap`, set by their widest label, which made `10-state-machine.json` 6,700 px wide (stage 4 §10.4). A type that sets
a small `gap` gets the per-column widening with no core byte. What it does not get is room for a label on a line that
spans more than one column, or that found no spot: that is the map's `labelRoom` (`tight`).

| Option | For | Against |
|---|---|---|
| **(a) A small `gap` (48 px) for the deployment and component types, with `gapAfter`'s per-column widening and `cut: 280`; `labelGaps` only if 5.1's spike shows labels left with no spot, for the maintainer then (recommended)** | No core byte; no second `layoutPass` for P1; only the gaps that hold a label widen | A label on a line across two or more columns may find no spot; the layout check reports it and the fixtures pin it |
| (b) `labelGaps` now: a typed view's opt in to `tight`, for column gaps only (`tight` measures a row gap as `rowY(r) + NH`, wrong for typed rows of mixed height, `rows.ht`) | Room for every tight label | About 25 B; a second `layoutPass` when a label is tight (stage 4 Q19: about 24 ms on 52 nodes with both flags off); `labelGaps` joins `VIEW_GEO` |
| (c) One gap set by the widest label, as the class type | Nothing new | Deployment views as wide as their widest gap times their columns |

The composite type's connectors carry no label. Moving the class, state, activity and overview types to a small `gap` is
later work, one package each, each a picture change for the maintainer.

**As built (5.1).** 5.1's spike left 12 of 54 labels with no spot under option (a) (§14), so decision 9 is taken: options
(a) and (b) together, the maintainer's decision of 13 Nov 2026. The component and deployment types set `gap: 48`, `cut: 280`
and `labelGaps: true` (5.4, 5.5); every other typed view leaves `labelGaps` unset and lays out as before.

- `labelGaps` is a typed view's opt in to the map's `labelRoom` (`tight`, `layoutPass`): a label with no spot, cut short,
  or on a box's border asks for room in the column gap it sits in, else in the column gap its line's longest run crosses;
  `layoutGraph` lays the view out once more with those gaps widened by the labels' widths, and keeps that layout if it has
  fewer issues and labels cut short. The second `layoutPass` runs only when a label is tight.
- Column gaps only: a row gap is a candidate on a map alone (`Array.from({ length: map && r1 - r0 })`, the same rows as
  `Math.max(0, r1 - r0)` on a map), as `tight` measures a row gap as `rowY(r) + NH`, wrong for typed rows of mixed height.
  Laid out down, a typed view is laid out turned, so its columns are the picture's rows: the gaps widened are those between
  the ranks either way, but not to the same effect. Laid out down, a gap grows by the label's height (`sizeOf` swaps a
  turned label's size), and a horizontal label beside a line across the ranks needs the picture's column gaps, the turned
  view's row gaps, which are never candidates. On the spike, laid out down, 12 of 54 labels keep no spot with `labelGaps`,
  against 19 without (§14); laid out right, none against 12. Whether a turned view should also widen its row gaps is
  decision 21. A scratch run with row gaps as candidates on a turned view too left the same 12: `tight` takes a column gap
  first, so that option is more than the length change.
- `labelGaps` joins `VIEW_GEO`, so turning it on or off lays the view out again (§4.4). Its documentation is beside the
  other typed fields in `src/typed/layout.js`; the registry's pointer line names it. Core +22 B (§2.3).
- Tested in `tests/typed-ports.test.mjs`: on the spike's view, with `labelGaps` fewer labels are left with no spot than
  without (none, against 12) and no node moves up or down; laid out down, no more are left (12, against 19), printed; on a
  view of one column whose tight labels sit in row gaps, no card moves up or down (column gaps only: the test fails if a
  typed view's row gaps are candidates); the edit and the full layout stay under CI's
  1 s, both printed; a view with `labelGaps: false` draws the same markup as one without it, and turning it on lays the view
  out again. Maps (`bench/expected.json`) and every existing typed view (`tests/core-diet.json`, each type's tests) are
  unchanged.
- The activity and overview types (4.5, 4.7) keep their uniform column gap, accepted for 0.21.0. Either could opt in later
  as the moves above: a small `gap` with `gapAfter`'s widening and `labelGaps` for what is left. Each is a picture change for
  the maintainer and a second `layoutPass` on an edit with a tight label, to be measured against that type's P1 test. The
  overview's flows jog halfway across their gap with the label on one half (4.7), which `gapAfter`'s `w + 54` does not
  plan for, so it needs its own check that no label sits on a jog; the activity type's partitions are drawn from the layout
  after it (`laneBands`), so widened columns only widen the lanes they cross.

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
  needs no arrow on a delegation; the arrow says which way it delegates, and its accessible name says "Delegation". The
  arrow is a departure, listed in §17 and decision 20.
- A component realization is the class type's realization: a dashed line with a hollow triangle at the component.

### 9.3 The open collaboration (S12)

A collaboration is drawn as a dashed ellipse holding its roles, each a `part`, and the connectors between them; its name
over a dashed line inside the top. Its box is laid out as stage 2's, and the ellipse must hold that rectangle.

| Option | For | Against |
|---|---|---|
| **(a) A box's `round: true` grows its frame by √2 about its centre in `TYPED.frame`, the hook slot `frameOf` calls (§2.3, §7), so the ellipse inscribed in the frame holds the rectangle of its contents (recommended)** | UML's dashed ellipse; the boxes keep 32 px apart around the grown frame, as any box does; no byte beyond the hook slot | A wide collaboration takes about 40% more room than its rectangle |
| (b) A dashed stadium (a rectangle with corners of half its short side) round the plain frame | No core byte | Not UML's ellipse (a deviation, stated) |
| (c) Closed only: its roles as rows in a compartment, its connectors not drawn | Nothing new | `04-composite-structure.json` shows the roles and their connector |

### 9.4 The lines

Every line kind of rows 4 to 6, for the legends, `tests/notation.html` and the types' "shapes agree" checks:

| Line | Row | Stroke | End | Keyword or label |
|---|---|---|---|---|
| `uml.InterfaceRealization` to a ball | 5 | solid | none (the stem) | |
| `uml.InterfaceRealization` to a rectangle | 5 | dashed | hollow triangle at the interface | |
| `uml.ComponentRealization` | 5 | dashed | hollow triangle at the component | |
| `uml.Usage` to a ball | 5 | solid | socket at the ball | |
| `uml.Usage` to a rectangle | 5 | dashed | open arrow at the interface | «use» |
| `uml.Connector`, assembly | 5 | solid | none | |
| `uml.Connector`, delegation | 5 | solid | open arrow at its `to` end (§9.2, decision 20) | |
| `uml.Connector` (composite structure) | 4 | solid | none | |
| `uml.RoleBinding` | 4 | dashed | none | the role's name, next to the bound part's end |
| `uml.Deployment` | 6 | dashed | open arrow at the target | «deploy» |
| `uml.Manifestation` | 5, 6 | dashed | open arrow at the component | «manifest» |
| `uml.CommunicationPath` | 6 | solid | none | its label |
| `uml.Dependency` | 5, 6 | dashed | open arrow | its stereotype, if any |
| `uml.CommentLink` | 4 to 6 | dashed | none | |

## 10. The three types

### 10.1 Component

Laid out by `layoutTyped` from the host's ranking, right by default, with `repair: false`, `reroute: false` (§14),
`gap: 48` with `gapAfter`'s widening and `labelGaps` (§8) and `rgap: 56`. Boxes with ports take §7's padding. Components that hold components are boxes (`ownersOn`). Ports, inner lines (delegations)
and ends as §4 to §6. Interfaces drawn as balls or rectangles (§9.2). Artifacts with their manifestations.

Validators, each with a passing and a failing case:

| Rule | Level | Says |
|---|---|---|
| `port-owner` | error | a port is a member of a component or a class (UML: only an encapsulated classifier owns ports; a collaboration is not one) |
| `provided-ends` | error | a realization runs from a component, a class or a port to an interface |
| `required-ends` | warning | a usage drawn as a socket runs to an interface (another usage is drawn as «use») |
| `ball-interface` | warning | `as: "ball"` is on an interface; elsewhere it is ignored |
| `delegation-ends` | error | a delegation joins a component's port with a component or port inside it, at any depth (as built: the outer end a port, the only one drawn) |
| `assembly-ends` | error | an assembly joins two components or their ports, neither inside the other |
| `manifest-ends` | error | a manifestation runs from an artifact; a warning when it runs to anything but a component (§17) |
| `component-realization-ends` | error | a component realization runs from a class or a component to a component |
| `component-owner` | warning | a component's owner is a component or a package |

Accessible names: "Component Shop API, 2 ports, holding 1 component"; "Port orders of Shop API, provides Orders";
"Interface Orders, as a ball, provided by Shop API, required by Storefront"; "Delegation from orders of Shop API to orders
of Checkout"; "Artifact shop-api.jar, manifests Shop API". Reading order: each box and what it holds (`readingOrder`),
each node's ports after it in their drawn order, then the lines. The legend names each line kind and end drawn, and the
ball and socket.

**As built (5.4)** (`src/uml/component.js`). Where the build departs from the above:

- **Its own ranking, not the host's.** The host ranks only lines between the view's nodes (Q11), so none from a port: a view
  joined by assemblies was ranked as loose cards. The type ranks itself (`layout.rank: false`, `cpPlace`), as the host ranks a
  view with boxes (`blockPos`) in one pass: each box's contents, then the top, by longest paths, columns by `untangle`, rows by
  `rowsFor`; a pin wins and a node it would cover moves down. A usage of a ball is turned (provider, ball, requirer from left
  to right); a usage of a rectangle is not. What no line reaches is packed by size in rows under the lined columns, a box
  as wide and tall as its contents.
- **Every port is a node of the picture**, on a node as on a box, as 5.3 drew them: decision 22 (§18), as built in the
  follow-ups, has the layout check skip a port against its own owner (§2.3). 5.4 had drawn the ports on a node in the node's
  group (a node of shape `ported`) so the check would not take them for overlaps; selecting such a node marked its ports as
  selected too. That workaround is gone: selecting a node marks none of its ports (`tests/component.html`).
- **A ball is laid out as its 16 px circle**, its name hanging under it in the row gap, so the router ends its lines level
  with the circle. A ball's lines take its left or right by the ranking; the layout keeps no room for the name, which a line
  passing under the ball may cross. Laid out down, a line from before the ball comes in above it and one from after it on
  the left or right it comes from, so none runs up through the name.
- A port that faces only its owner's owner's ports (a delegation's inner end) takes that port's side, and orders by its far
  ends (`portRank`), so a delegation runs straight in without crossing its neighbour.
- The geometry carries a slot after each element (`slots`), so the palette's `add` hears the selection (`at.sel`): a port is
  added into the selected component (or a selected port's owner), else refused.
- `connect` sets a connector's kind by nesting; a line to an interface is the picker's Realization or Usage (no second pick).
  It refuses a connector from an element to itself or its own port, and a delegation whose box end is not a port (it would
  not be drawn). A connector with no kind is drawn and checked as an assembly.
- A class on a component view is drawn as the class type's rectangle with its stereotypes. A class's ports are added from
  the palette; its member rows are not ports.
- `edits.remove`: Delete on a port deletes it from the model, said on the hint line (§12.2); in a mixed selection the rest
  is hidden (Delete) or deleted (Shift + Delete), as the canvas's default.
- A view that lists its lines (`edges`) is checked on those lines only.
- `05-component.json` lays out clean right and down (no crossing), and `tests/cli.py`'s case passes unchanged.
- P1, on a 50-element, 60-line, 54-port test view in boxes three deep (CPU, best of seven, a loaded laptop): a port renamed
  17 to 25 ms (no layout), a component renamed and a full layout 117 to 157 ms, over the 100 ms target and under CI's 1 s;
  without `labelGaps` the same edit is 124 ms, so the cost is the router's, not the second pass.

### 10.2 Composite structure

Laid out by the type's own ranking (Q11): `layout.rank: false`, so the host passes the pins alone; the type ranks the
subject's parts and collaboration uses by the connectors and role bindings between them (`rowsFor`, `untangle`), each
pin kept, and lays them out with `layoutTyped` inside the subject's box, with the open collaborations beside it. The
subject is a box (its id the node's); its parts are nodes (their ids the members'); its ports and its parts' ports are §4
and §6; a connector from the subject's port to a part is inner (§5).

| Rule | Level | Says |
|---|---|---|
| `subject-shown` | error | the view's `subject` is a class, a component or a collaboration listed in `nodeIds` |
| `part-type` | warning | a part's `valueType` names exactly one class or component of the model by label (M8) |
| `connector-part` | error | an end's `part` is a part of the subject, and the end is a port of that part's type |
| `connector-scope` | error | a connector's ends lie in one structure: the subject, its ports and its parts; or one collaboration's roles |
| `binding-ends` | error | a role binding runs from a part of the subject to a collaboration use of it (UML also binds a port; left out, §17) |
| `binding-role` | warning | a role binding's label names a role of the collaboration its use names |
| `collaboration-named` | warning | a collaboration use's `collaboration` names a collaboration of the model |
| `part-port-id` | warning | only under §6's fallback: a model id equals a port's id on a part |
| `connector-drawn` | warning | as built (5.6): a connector between two ports of the subject is not drawn |

**As built (5.6)** (`src/uml/composite.js`). Where the build departs from the above, or says what the note left open:

- `part-port-id` is not built: §6's fallback id was not needed (5.2 pinned `->` ids through the hooks). The shared
  `port-owner` and `manifest-ends` (5.3) run with the type's rules.
- **A role binding's role is its line's label**, not an end label at the part's end (§9.4): the end labels are placed when
  drawn (`TYPED.lines`) and do not see the port names (§4.5, as built in 5.3), while a line's label is placed by the router
  and the port names keep clear of it (`portsDrawn`). So the type sets **`labelGaps: true`** (decision 9's opt in) and
  `gap: 64`, `rgap: 56`: without it both role names on `04-composite-structure.json` found no spot, one laid out each way.
- **The layout check and ports on parts.** `overlapIssues` reported each port against the part it sits on (half inside by
  design, §4.1), and the tests dropped exactly those reports. Decision 22, as built in the follow-ups: the check skips a
  port against its own owner (§2.3), so the example is clean right and down as the check gives it, with no filter and no
  crossing; `check()` on `04-composite-structure.json` went from 4 issues to none, its picture unchanged.
- **The ranking** (`layout.rank: false`): the subject's parts and collaboration uses are ranked as the communication type
  ranks its lifelines (longest path over connectors and role bindings, `untangle`, `rowsFor`), then each open
  collaboration's roles, then the rest (comments, a closed collaboration, a subject with nothing inside), block after block
  to the right. A pin (`layout.<id>`) is a column and row of the whole picture, as the canvas writes it, kept to its own
  block's first column at least; the next block starts past the furthest column the block holds, pins counted, so no box
  reaches over another's. A pin on a cell taken goes down a row, as an unpinned id does.
- **Sides:** a part's port whose line runs to the subject's port counts toward a place just past the subject's border on
  that port's side, so it faces it; the subject's ports are chosen first. Pins as §6 (`present.<part>.ports.<port>.side`).
- A line between a box and something it holds that names no port at the box is not drawn (the router would refuse it),
  as stage 2's `line-inside`; a subject with no part and no collaboration use is a node, not a box. A connector with the
  subject itself as an end (no port) breaks `connector-scope` (UML 2.5.1: an end is a part or a port). A connector between
  two ports of the subject's box is not drawn (no line from a box to itself) and not described; the type's own
  `connector-drawn` warning says so.
- A class or component shown in the view but not its subject is drawn without its ports: they belong to the subject's
  structure only, and no connector of this view reaches them. Left out; its own composite structure view shows them.
- Delete on a selection mixing members and lines: a line is hidden where the view lists its lines, else left and said (as
  the canvas); hides come before deletes in the transaction.
- The geometry has `slots` (one per node and box, as the state type's), so the palette's add hears the selection.
- **L by name** cannot reach a part or a port: the canvas names a member by its owner's label (`nameOf`), so L then a part's
  name finds the subject's first part. L then an arrow, or the pointer, reaches them. Left to the canvas's owner.
- `word` names a part, a role, a port and a collaboration use; the subject, as before.
- Measured (§14's common edit, `tests/composite.test.mjs`, 30 parts, about 50 connectors, 20 ports on parts, CPU best of
  seven after a warm-up, on a loaded laptop): a part's type changed, laid out and drawn, 18 to 24 ms; a full layout 20 to 26 ms.

### 10.3 Deployment

Laid out by `layoutTyped` from the host's ranking, with `gap: 48`, `gapAfter`'s widening and `labelGaps` (§8), and `cut: 280` on
communication paths. Nodes,
devices and execution environments that hold something shown are boxes drawn as cubes (§9.1); artifacts and
deployment specifications are `artifact`s; components (what an artifact manifests) the component look.

| Rule | Level | Says |
|---|---|---|
| `deploy-ends` | error | a deployment runs from an artifact or deployment specification to a node, device or execution environment |
| `deployed-twice` | warning | an artifact nested in one target is also deployed by a line to another |
| `nest-kinds` | error, warning | an error when a node, device or execution environment's owner is not one of the three; a warning for the unusual pairs of §3's row 6 (a node in an execution environment, say) |
| `path-ends` | error | a communication path joins two nodes, devices or execution environments |
| `manifest-ends` | error | a manifestation runs from an artifact, a warning to anything but a component (shared with the component type) |

Accessible names: "Device Application server, holding 1 execution environment"; "Execution environment Java 21 runtime, in
Application server, 3 artifacts deployed"; "Artifact shop-api.jar, on Java 21 runtime, manifests Shop API";
"Communication path HTTPS from Shopper's device to Edge proxy".

**As built (5.5)** (`src/uml/deployment.js`, `tests/deployment.test.mjs`, `tests/deployment.html`). Where the build departs
from, or settles what is not said above:

- `layoutTyped` with `gap: 48`, `rgap: 56` (the component type's, §10.1; not stated for this type), `labelGaps: true`,
  `cut: 280` on communication paths only, `repair: false`, `reroute: false`, and stage 2's 12 px padding (no ports, §7).
- The cube box: unlike §9.1's table, its frame holds its faces, as a closed cube's does. Its pad is 22 (10 px more than
  stage 2's 12, on every side, as `TYPED.frame` grows a box), the front face is the frame less 10 px at the top and right,
  and the top and right faces lie inside the frame. Drawn outside it, in the gap between boxes, the faces were unknown to the
  router, the label placer and `check()`: on the P1 view lines ran up to 75 px inside a face and labels sat on a face's line.
  The cost is 10 px more on the left and bottom of each box, 20 px a level (six levels: 120 px each way). A line's end on
  a slanted corner of the outline is moved in on to it, on a copy (§2.4), as `SHAPE.cube.inset` does for a closed cube (only
  ever lengthening its last run). A label the core leaves over the front face's top or right line, in the box's padding, slides
  along its line inward, clear of it, on a copy. Its title, under the top face: as built in the follow-ups (the
  maintainer's decision of 13 Nov 2026), a box with a keyword or stereotypes draws them on a line above its name, as
  UML 2.5.1 draws a keyword, `«device»` or `«executionEnvironment»` with the stereotypes after it, in 15 px more header room
  (the box's `head`, §2.3); a node with neither has its name alone in the 24 px, as before. Each line is cut to the front
  face's width; the core keeps a box as wide as its title on one line (`headW`), so `06-deployment.json`'s "Web browser" is
  drawn whole (5.5 drew one line, "«executionEnvironment» Web brow…"). The router's reserve over a box's title and the
  layout check's header test take the `head` too, so no line runs through the name.
- `nest-kinds`' error covers any owner that is not a target (a package or a component too). `deployed-twice` warns of a
  line to another target only; a «deploy» line to the target that also nests the artifact is drawn nowhere (a line from a
  box to what it holds is left out) and warned by neither rule (`connect` refuses to draw one). `path-ends` also fails a path
  between a target and one it holds, at any depth, which is drawn nowhere. Of the shared rules the type runs `manifest-ends` alone:
  `port-owner` is the component type's.
- Hooks: `connect` adds a deployment drawn from a target to an artifact, or a manifestation from a component to an artifact,
  the other way round (as the use case type starts an association at its actor), and refuses a deployment or a communication
  path between ends that cannot hold it, and any line between a box and what it holds, at any depth ("shop-api.jar is
  already deployed on Java 21 runtime by nesting", "A communication path cannot join a node and what it holds") (`{ error }`,
  said on the hint line); `remove` with Shift + Delete on a target that
  owns something says how many elements go with it (§10.4). `owners`: an artifact's, a deployment specification's or a
  target's Owner field lists every target. No `moveTo`, `add`, `member` or `key`: the type has no ports, no members and no
  `present` field; a drop into a box and the Owner field emit stage 2's `reparent`, tested by pointer and by key.
- Decision 21, what `06-deployment.json` keeps: its 7 labels all find a spot and none is cut short, laid out right (1,512 ×
  816 px) and down (961 × 1,071 px), every line routed clean (8 `grid`). Laid out down without `labelGaps`, one label
  (`edge-to-app`, "HTTP") has no spot and the view is 1,053 px high: `labelGaps` gives it its spot for 18 px. (5.5 measured
  756 and 1,011 px high, and 993 without `labelGaps`; the two-line titles add the 60 px.) Laid out right,
  `labelGaps` changes nothing. Both runs pinned and printed in `tests/deployment.test.mjs` (the one without by
  `layoutTyped` on the type's own input with `labelGaps: false`).
- Six levels (§7, L8): node, node, device, device, execution environment, execution environment, an artifact in the
  deepest, a communication path from the deepest to a node at the top: laid out clean both ways; the outer box 609 × 574 px
  laid out right and 609 × 698 px down (printed; 5.8's fixture pins its own; 5.5 measured 514 and 638 px, before the
  four keyworded boxes' second title line).
- P1 (§14), on a test view of 50 nodes and artifacts, 50 lines and boxes five deep (ten paths left with no spot before
  `labelGaps`, two after): CPU, best of seven after a warm-up, on a laptop loaded by other jobs (load average 9), a path's
  label 144 to 193 ms, an artifact moved into another node 144 to 188 ms, a full layout 150 to 207 ms, against 26 to 40 ms
  for stage 4's types' edits in the same run; after the review's fixes, at load average 3 to 7, a path's label 101 to 118 ms,
  an artifact moved 93 to 125 ms, a stereotype (an edit that moves nothing) 103 to 124 ms, a full layout 95 to 118 ms.
  Under CI's 1 s ceiling; at or over the 100 ms target on that machine. Of a layout's time (102 ms) the second `layoutPass`
  that `labelGaps` runs is 44 ms (58 ms without it). The view itself routes less cleanly than the spike's (60 `grid`):
  laid out right, 31 `grid`, 17 `cross`, 2 `fallback` and 24 `check()` issues (crossings); down, 39, 9, 2 and 21. Decision
  for the maintainer.

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
| `add` | Palette, `N` | A port, into the selected component, class or part (a part's goes to its type, said); a part, into the subject; a role, into the selected collaboration; an interface, ball or rectangle by `{ pick, then }`. With nothing to hold a port selected, `{ error }` |
| `remove` | Delete, Shift + Delete | Composite: a port on a part (§6) |
| `rename` | F2 | Composite: a port on a part renames the class's port; a part's row `name : Type [mult]` sets `valueType` and `multiplicity` |
| **`member(model, view, owner, id, text)` (new)** | Enter or a change on the panel's member rows: the New member field (`id` null) or a row | Component: a row `name` or `name : Type` is a port. Composite: on the subject a row `name : Type [mult]` is a part and `port name` a port; on a collaboration a row `name : Type [mult]` is a role (a `uml.Property`), added or edited. State machine: 4.6's `entry / …` rows. Null: the panel's `member.add` or `member.edit`, as now |
| **`key(model, view, ids, key)` (new)** | A key on a selection, before the canvas's own | Component: `B` on an interface, `set { view, path: ['present', id, 'as'] }` to `ball` or removed. Null: the canvas's |

Both new hooks are in `src/typed/edit.js` only, with no core byte, and return what the others return. `member` is the
"member hook that may return commands" 4.6's wrap waits for (Q8): 5.2 moves `src/uml/state.js`'s listeners onto it, and
`tests/state.test.mjs` and `tests/state-machine.html` pass unchanged.

As built (5.2): `member` hears the row's text trimmed; an `{ error }` also marks the row invalid, and a row the hook read is
cleared (New member) or kept as typed, after a pick's choice when the result is a `{ pick, then }`; an empty row is not
asked (the panel adds nothing and puts a row back). `key` hears `e.key` only, Escape, Tab, Enter and the arrows included,
so a hook returns null for the keys it does not own. `key` is asked for a key with no Alt, Ctrl or Meta, and only when the host offers
`rename` (the editable flag F2 and V take). The state type's `edits.member` is a non-enumerable property, so
`Object.keys(edits)` stays 4.6's four and `tests/state.test.mjs` passes unchanged; the editor reads it as any hook. A node
whose id holds `->` needed no engine change: selection, F2 and Delete already hand its geometry id to `rename` and `remove`,
which `tests/type-hooks.html` now pins. Any copy of a type's `edits` (`{ ...edits }`, `Object.assign`) drops the state
type's `member`; a host wrapping `edits` copies it by name. stage-4.md §10.4's text on the state type's own listener is
left to 5.8, whose Owns covers `docs/`.

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

Palettes: component (Component, Interface, Artifact, Package, Port, Comment; lines Realization, Component realization,
Usage, Assembly, Delegation, Dependency, Manifestation, Comment link); deployment (Node, Device, Execution environment, Artifact, Deployment
specification, Component, Comment; lines Deployment, Manifestation, Communication path, Dependency, Comment link);
composite (Part, Port, Role, Collaboration use, Collaboration, Comment; lines Connector, Role binding, Comment link).
Properties: a part's `valueType`, `multiplicity`, `aggregation` (enum); a port's `valueType`; a connector's `kind`
(enum, component views); a collaboration use's `collaboration`; stereotypes on each. Every gesture has a key; each is
tested by pointer and by key through `apply()`.

Hiding (DoD 4). A node of a view is hidden by Delete (it leaves `nodeIds`) and deleted by Shift + Delete. A port, a part
or a role is a member: it is drawn because its owner is, and cannot leave `nodeIds`.

| Option | For | Against |
|---|---|---|
| **(a) Members cannot be hidden: Delete on a port, part or role deletes it from the model, as Shift + Delete does, and the hint line says so before it goes; the conformance notes say so under item 4, as stage 3 did for messages (P12) (recommended)** | Stage 3's precedent; no new `present` key; nothing to keep in step | A view cannot show a component without one of its ports |
| (b) A per-member `present.<id>.hidden`, or `present.<owner>.collapsed: ["ports"]`, set by Delete; Shift + Delete deletes | Views can leave out detail, as UML tools do | A new `present` key, its `references()` and its tests; a hidden port's lines need a rule too (hidden with it, or drawn to its owner) |

5.4 to 5.6 test the chosen behaviour for each member kind (port on a component, port on a class, port on a part, part,
role), by pointer and by key.

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
| `tests/notation.html` | Its arrowhead checks gain the socket, the delegation's arrow, the manifestation's, the «deploy» line and the role binding (§9.4) |

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
- **5.1's spike**, on a test-only view of 50 nodes, 60 lines with long labels, 40 ports and boxes six deep with inner
  lines, measures the common edit before the type lanes start, and counts the labels left with no spot under §8's small
  gap. If labels are left, the maintainer decides on `labelGaps` (superseded: decision 9 taken, below; decision 9, which adds a `layoutPass` when a label is
  tight, measured with and without); if the edit is over 100 ms on an idle machine, the maintainer decides among P1's other
  options (stage 4 §17) before 5.4 and 5.5 start.
- Browser timings under headless virtual time prove nothing (1.11): budgets are enforced in Node.
- **5.1's spike, as run** (`tests/typed-ports.test.mjs`, 50 nodes, 60 lines with labels of up to 44 characters cut at 280 px,
  40 lines from ports and six inner lines, boxes six deep with 48 px padding; CPU, best of seven after a warm-up, on this
  laptop): a label edit laid out and drawn 24 to 28 ms, a full layout 24 to 34 ms; every line routed clean (60 `grid`). Of 54
  labels, 12 found no spot under §8's small gap. With `labelGaps` tried on a scratch copy (column gaps only): none left, the
  view 7,435 px wide instead of 4,339, the edit 27 ms. `labelGaps` was not built then; decision 9 went back to the maintainer (taken since, below).
- **5.1's spike, run again with `labelGaps` built** (decision 9 taken, the maintainer's decision of 13 Nov 2026; the test
  prints both runs): without it, 12 of 54 labels with no spot, a label edit 17 to 22 ms, a full layout 17 to 33 ms; with it,
  none with no spot and none cut short, the view 7,435 px wide instead of 4,339, a label edit 28 to 31 ms and a full layout
  28 to 29 ms (the second `layoutPass`); every line routed clean (60 `grid`) both ways. CPU, best of seven after a warm-up,
  on a laptop loaded by other jobs. These figures are the view laid out right.
- **The same spike laid out down** (the test prints it): without `labelGaps`, 19 of 54 labels with no spot, 1,967 px high,
  routes `{"grid":54,"cross":5,"fallback":1}`; with it, 12 of 54, 2,309 px high, routes `{"grid":53,"cross":7}`. Laid out
  down, `labelGaps` widens the picture's row gaps, each by a label's height, while a horizontal label beside a line across
  the ranks needs the picture's column gaps, which are the turned view's row gaps and never candidates (§8; decision 21).

| Option | For | Against |
|---|---|---|
| **(a) Both flags off on every layout; 1 s ceiling in CI with the 100 ms target printed; the spike first (recommended)** | The maintainer's rule of 13 Nov 2026; measured on stage 4's types | Crossings next to shared sides kept, pinned and stated |
| (b) Keep port repair for these types | Fewer crossings at ports | `repair` is most of a layout's cost (stage 4 Q19): the common edit misses 100 ms |

## 15. The ELK trial (S17, L9)

`proposal.md` §6.3: try the own engine first; if routing to border ports inside nested nodes does not converge, accept
elkjs (EPL-2.0 or GPL-3.0-or-later, about 477 KB) as a strategy the host passes in, never bundled. 5.7 is that trial.

**What it is.** A spike on a scratch branch (`stage5-elk-trial`), never merged, as 1.12 was. elkjs is installed at one
pinned version into a scratch folder outside the repository; `package.json` and `lib/` do not change (the repository has no lock file; corrected 13 Nov 2026).
The only file it merges is `docs/diagrams/notes/spike-elk.md`.

**Its box, by scope:**

1. **Fixtures:** `04-composite-structure.json`, `05-component.json`, `06-deployment.json`, and 5.1's test-only view
   (§14). Nothing else.
2. **One ELK configuration:** `layered`, `hierarchyHandling: INCLUDE_CHILDREN`, orthogonal routing, ports
   `FIXED_SIDE` from §4.2's sides (5.3's), port labels outside, node sizes from the shapes' `size()` (5.3's). One revision of it is
   allowed, after the first table, with the reason written down.
3. **The measures, for both engines** (the own engine on 5.1's view as 5.1 builds it, and on the three examples as 5.4 to
   5.6 lay them out: before those types merge the examples are plain cards with no ports, sides or sizes): the layout check's issues (overlap, a
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
| **(a) A spike, boxed by scope, recommendation only, no dependency (recommended)** | L9's question answered with numbers; the core stays MIT and dependency-free (D8); runs beside the type lanes | Its own engine's column needs 5.1 for the test view and 5.4 to 5.6 for the three examples before the table is complete |
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
| 5.1 | **The router for ports and inner lines.** Port placement in `LP.ports` and its `sides` argument (§4.4); the side cap's skip of port ends (§4.2; as built, the port hook puts them back, §4.4); `fromPort`, `toPort`, `inner`, `portRank` in `EDGE_GEO`; inner ends (§5); `TYPED.frame` for a box's `pad` and `round` (§7, §9.3); `labelGaps`, decision 9 taken (§8, as built); the `socket` end in `ENDS` (§9.2); the registry fields documented in `src/typed/*.js` with one pointer line in the registry, 5.2's hooks too. §14's spike, reported in the pull request before 5.4 and 5.5 start. Tested with a test-only type: ports on nodes and boxes, a port with four lines on one face, ports pinned to each side, an inner line from a box's port at each of three levels, a round box, a long label | `src/layout/layered.js`, `src/typed/layout.js`, `src/typed/draw.js`, `src/core/registry.js`, `tests/typed-ports.test.mjs` (new), `tests/typed-ports.html` (new), `tests/embed.py` (appends its page) | 5.0 | Maps unchanged (geometry hashes, stills, `tests/edit.html`); `tests/core-diet.html`, `tests/core-diet.json` and every typed type's tests unchanged; on the test type every line of a port ends on its square within 1 px, no port leaves its side (the four-line port included), an inner line enters its box only at its port, nested boxes' ports do not touch, in Node and in Chrome under three fonts (`tests/typed-ports.html` run by `tests/embed.py`); a view laid out twice from one memo draws byte-identical markup; `tests/layout-typed.test.mjs`'s geometry key test passes unchanged; a reorder of members lays out again; the spike's timings in the pull request; the core's bytes before and after, within §2.3 |
| 5.2 | **The member and key hooks.** `edits.member`, `edits.key` (§12.1); 4.6's wrap in `src/uml/state.js` moved onto `edits.member`; a node whose id holds `->` selected, renamed and deleted through hooks (§6) | `src/typed/edit.js`, `src/uml/state.js` (its wrap only), `tests/type-hooks.html`, `tests/typed-edit.html` | 5.0; 4.6 merged | On a test-only type each hook's result is emitted, said or refused, by pointer and by key; a null falls back to the panel; `tests/state.test.mjs` and `tests/state-machine.html` pass unchanged; no core byte |
| 5.3 | **Structure notation.** `src/uml/structure.js`: the `port`, `component`, `ball` and `artifact` shapes; the sides chosen before the layout (§4.2); the ports with no line, the port nodes added back and the port names (§4.3, §4.5), on a copy; the shared rules (`port-owner`, `manifest-ends`); the looks' accessible names | `src/uml/structure.js`, `tests/structure.test.mjs` (new), `tests/structure.html` (new), `tests/embed.py` (appends its page) | 5.0; 5.1 for its browser test's line ends | Each shape's size, outline and inset agree in Node; drawn in both themes and three fonts with no text overflow; on hand-built geometry, ports with no line keep 8 px apart and names keep off lines and nodes; the sides chosen match a table of rankings; each shared rule has a passing and a failing case |
| 5.4 | **The component type.** §10.1: definition, boxes, ports, delegations, ball and socket, rules, `describe()`, names, legend, `rows` and `word`, hooks (`connect`, `moveTo`, `add`, `member`, `key`) | `src/uml/component.js`, `tests/component.test.mjs`, `tests/component.html` (new), `tests/embed.py` (appends its page) | 5.1 (and its spike), 5.2, 5.3 | Definition of done 2, 4, 5, 6 and 8 on row 5's subset; every gesture by pointer and by key through `apply()`; a 30-step session undone, redone and reopened to byte-identical models; `05-component.json` lays out clean, right and down; `tests/cli.py`'s case for it passes unchanged |
| 5.5 | **The deployment type.** §10.3: the cube, boxes six deep, artifacts, paths with §8's small gap, `labelGaps` and `cut`, rules, `describe()`, names, legend, `rows` and `word`, hooks | `src/uml/deployment.js`, `tests/deployment.test.mjs`, `tests/deployment.html` (new), `tests/embed.py` (appends its page) | 5.1 (and its spike), 5.3 | As 5.4 on row 6; a drop of an artifact into a node and the Owner field each emit their transaction; `06-deployment.json` lays out clean, right and down |
| 5.6 | **The composite structure type.** §6 and §10.2: its own ranking, the subject's box, parts, ports on parts, inner connectors, collaborations (`round`), collaboration uses, role bindings, `refs` (S14), rules, `describe()`, names, legend, `rows` and `word`, hooks (`connect`, `moveTo`, `add`, `remove`, `rename`, `member`) | `src/uml/composite.js`, `tests/composite.test.mjs`, `tests/composite.html` (new), `tests/embed.py` (appends its page) | 5.1, 5.2, 5.3 | As 5.4 on row 4; two parts of one type each draw the type's port with their own connectors; deleting a part deletes its connectors; `04-composite-structure.json` lays out clean, right and down |
| 5.7 | **The ELK trial.** §15 | `docs/diagrams/notes/spike-elk.md` (new); the scratch branch `stage5-elk-trial`, never merged | 5.0 for its ELK column; 5.1 for the own engine's column on 5.1's view; 5.4 to 5.6 for it on the three examples | The table of §15's measures filled for the four fixtures; the recommendation by §15's rule; `package.json`, its lock and `lib/` unchanged on `main` |
| 5.8 | **Fixtures, examples, docs, CLI.** The three types' Bookshop examples join the Bookshop atlas by drill-down (the maintainer's decision of 13 Nov 2026: one small example per type is the reference, and the atlas is built from them and checked against them; `plan.md` §7). §13's files and their tests (`tests/stage5-fixtures.test.mjs`, `tests/stage5.html`); the three examples moved, with `check.mjs`'s `MOVED`; `render`, `check`, `stills` and `pdf` on each; the schema and `.d.ts`; C10's tests; every document of `plan.md` §7; `docs/conformance/uml-component.md`, `uml-deployment.md`, `uml-composite-structure.md`; the lanes' release notes gathered into `docs/module-api.md` | `examples/`, `tests/*-minimal.json` and `tests/*-stress.json` of the three types, `tests/stage5-fixtures.test.mjs`, `tests/stage5.html`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/embed.py` (appends `tests/stage5.html`), `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table) | 5.4 to 5.7 | Definition of done 1, 3, 7, 9, 10, 11 and 12 for all three types; §14's budgets in CI; each PDF lists §11's rows; the three examples in the gallery and CI; the stress fixtures' crossings and the six-level width pinned and stated; L9 closed or re-stated by 5.7's outcome |

Existing tests a package edits, and why: 5.8 points `tests/cli.py`'s `05-component` case at the moved example and adds the
other two (the files move, `plan.md` §2's item 10); `tests/notation.html` gains the new ends; `tests/embed.py` gains each new
browser page from the package that adds it (5.1, 5.3 to 5.6, 5.8), so each page runs in CI from its own merge, as stage 4's
lanes added theirs; `check.mjs`'s `MOVED` gains three rows. 5.2 edits `tests/type-hooks.html` and `tests/typed-edit.html` only by
adding cases. No other existing test changes.

### 16.3 What runs at the same time (S19)

```
approved ─▶ 5.0 ──┬─▶ 5.1 router: ports, inner lines ──┬──────────────┬──▶ 5.5 deployment ──────┐
                  ├─▶ 5.3 structure notation ──────────┤              ├──▶ 5.4 component ───────┤
     4.6 merged ──┼─▶ 5.2 member and key hooks ────────┴──────────────┴──▶ 5.6 composite ───────┼─▶ 5.8 ─▶ 0.22.0
                  └─▶ 5.7 ELK trial (ELK column now; own engine's after 5.1, and 5.4 to 5.6) ───┘
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
| `tests/embed.py` | 5.1, 5.3, 5.4, 5.5, 5.6, 5.8: each appends its page to the list (and its line to the header), nothing else; the second of two open branches rehearses the merge (X2) | |
| `tests/cli.py`, `check.mjs`, `docs/module-api.md` | 5.8 only | |

### 16.5 The release

0.22.0 after 5.0 to 5.8, by the repository's rule: `package.json`, `## 0.22.0:` in `docs/module-api.md`, merged when the
maintainer approves that pull request by number. Its notes say:

- new: the component, deployment and composite structure diagrams; ports on borders; lines from a box's port inward;
  ends through parts; the ball and socket; port padding for nested boxes; the member and key hooks;
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
| Component | Connector multiplicities (`proposal.md` §8.5); «subsystem» and «specification»; a component's parts drawn inside it as a composite structure (nested components only); the black-box compartments («provided interfaces», «required interfaces», «realizations», «artifacts»); provided and required interfaces as a port's own props (S1); a ball and socket joined with no interface node; the ball's stem kept short (it is a line the layout places, stated) |
| Deployment | Instance-level deployment (`proposal.md` §8.5): node and artifact instances `name : Type`; a deployment specification attached to a deployment line; nested artifacts; communication path multiplicities; device icons; «manifest» of anything but a component; per-target deployment specification properties |
| Composite structure | Connector multiplicities and end names; a part's own inner structure (shown in its type's view); ports on a collaboration's roles; a role binding to a port of the subject (UML binds any connectable element; `binding-ends` takes a part only); a part's multiplicity drawn in its corner (it is in its name); «represents» and occurrences; role bindings with several role names; the properties of a port selected on a part (§6) |
| All three | A port's multiplicity; behaviour, service and conjugated ports (`~`); XMI (R6); copy and paste (E7); per-type `diff()` writers; a reader (Mermaid has none); storing a port's order (S3); ELK in the module (§15) |

Departures from UML 2.5.1, which 5.8's conformance notes carry in a "Departures" line:

- **The delegation's arrow** (§9.2): UML 2.5.1 does not require an arrowhead on a delegation connector; an open arrow on a
  solid line is also its look for a navigable association. Kept to show the direction (decision 20).
- **A realization or usage drawn from a port** (§3, `provided-ends`): in the metamodel a port's provided and required
  interfaces are derived from its type; a port does not realize or use an interface. The model stores the line from the
  port, as UML tools draw the lollipop on a port; a reader of the model must know it.
- **«manifest» to a component only** (`manifest-ends` warns on other targets), and the narrowings in the table above.

## 18. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | How much of the core's 4,713 B stage 5 may spend | At most 300 B (targets 126 B, 151 B with `labelGaps`), fallbacks named | First come; raise C5 | §2.3 |
| 2 | How a port with several lines is drawn | A square that grows 10 px along the border for each further line on a face | Every line at one point (a bundle in the router's search, core); a port as a node of the layered layout | §4.1 |
| 3 | A port's side and order | Side by `present` or by the ranking, kept by the side cap; order by the far ends, `members` breaking ties; nothing stored | `present.<port>.order` as well; `members` order always | §4.2 |
| 4 | Where a port's name goes | Outside, by the end labels' search | Inside the owner; not drawn | §4.3 |
| 5 | Lines from a box's port inward (delegation) | The router learns inner ends: the `holds` bypass, about 15 B, the point placed by the port hook | The type draws an elbow after the layout; not drawn | §5 |
| 6 | Ends through parts (`model.md` §3) | `ends.<end>.part`, as rule 7; a part's ports are its type's, drawn as `<part>-><port>`, their side under `present.<part>.ports` | A path form in `from`/`to`; parts own copies of ports | §3, §6 |
| 7 | Provided interfaces (`model.md` §3) | Always an `uml.Interface` node, a ball by `present.as` | Also a port's `provided` and `required` props | §3 |
| 8 | Deep nesting | A box's `pad`, 48 px where it or a box it holds has ports with lines, through `TYPED.frame` (about 45 B with the round frame) | Stage 2's 12 px (a delegation between nested ports cannot be laid out); one `pad` per view | §7 |
| 9 | Room for labels | Taken, the maintainer's decision of 13 Nov 2026 (§8, "As built"). Was: a small `gap` and `gapAfter`'s per-column widening for the deployment and component types, no core byte; `labelGaps` only if 5.1's spike leaves labels with no spot | `labelGaps` now (25 B, column gaps only, a second `layoutPass`); one gap set by the widest label | §8 |
| 10 | The open collaboration | A dashed ellipse, by a box's `round`, in `TYPED.frame` | A dashed stadium (a deviation); closed only | §9.3 |
| 11 | Deleting a part | Its connectors go with it, by `refs` | `apply()`'s default: the `part` dropped | §10.4 |
| 12 | The member hook | `edits.member` in `src/typed/edit.js`; 4.6's wrap moves onto it | `member.add` returning commands (core); a wrap per type | §12.1 |
| 13 | Ball or rectangle (DoD 4) | `B` by a new `edits.key`, and a pick on add | A properties field kind writing `present` (core); derived | §12.1 |
| 14 | P1 | Both flags off on every layout, 1 s in CI with 100 ms printed, 5.1's spike first | Keep port repair | §14 |
| 15 | The ELK trial (L9) | Spike 5.7, boxed by scope, its rule written first, a recommendation and no dependency; its own engine's column on 5.1's view after 5.1 and on the examples after 5.4 to 5.6 | No trial; build the adapter now | §15 |
| 16 | Order with stage 4 | 5.0, 5.1, 5.3, 5.7 on approval; 5.2 after 4.6; 0.22.0 after 0.21.0 | Start after 0.21.0 is released | §16.3 |
| 17 | C10 for the three types | Tested in 5.8 | Folded into the package after 0.20.0 | §16.5 |
| 18 | Component realization (`proposal.md` §8.5's "realization") | Add `uml.ComponentRealization` to row 5, the class type's look, no core byte | "Realization" means interface realization only, stated | §3 |
| 19 | Hiding a port, part or role (DoD 4) | Members cannot be hidden; Delete deletes from the model, said first, as stage 3's P12 | A `present` key that hides a member | §12.2 |
| 20 | The delegation's look | A solid line with an open arrow at its `to` end, listed as a departure: it shows which way the port delegates | UML's plain solid line (direction in the accessible name only); a plain line with «delegate» | §9.2, §17 |
| 21 | `labelGaps` on a view laid out down | Taken, the maintainer's decision of 13 Nov 2026: Accept that a view laid out down gains less (the spike: 19 to 12 labels with no spot, against 12 to none laid out right); 5.5 states what `06-deployment.json` keeps laid out down | Let a turned view widen its row gaps as well, measured with `rows.ht`, and prefer them for a label beside a line across the ranks (core bytes, a change in `tight`'s choice of gap) | §8 |
| 22 | How a type's layout check passes ports on their owners (5.3's open point; 5.4 and 5.6 as built) | Taken, the maintainer's decision of 13 Nov 2026: `overlapIssues` skips a node against the node its `owner` names (core, about 20 B); ports are nodes again, so selecting an element no longer marks its ports | Keep ports drawn in their owner's group (0 B; a selected node marks its ports; the tests filter the overlap) | §10.1, §10.2 |

Decision 9 is taken: the spike left 12 labels with no spot, and `labelGaps` is built in 5.1 and set by the component and
deployment types, the maintainer's decision of 13 Nov 2026 (§8, "As built").

Decision 20's trade-offs: the arrow shows direction at a glance but is UML's navigable-association look and not required
by UML 2.5.1; the plain line is UML's own and costs nothing, but a reader cannot tell an assembly from a delegation except
by the nesting; «delegate» says it in words, as UML 2.0's tools did, and adds a keyword to place on a short line.

## 19. What this note changes elsewhere

- **`model.md`.** Rows 4, 5 and 6 as §3 (row 4's subject a class, component or collaboration; row 5 gains `uml.Package` and,
  by decision 18, `uml.ComponentRealization`; row 6's nesting); §3's two stage 5 rows are settled: a port end through a part is `ends.<end>.part`,
  a port's side is `present.<port>.side` (on a part, `present.<part>.ports.<port>.side`) and its order is derived (no stored
  order); a provided interface is always an
  `uml.Interface` node; a stage 5 row points here.
- **`risks.md`.** L9 points to §4, §6 and §15, and closes or is re-stated with 5.7's outcome; L8 gains the six-level
  fixture (§13); G2's three cases point to §13; C5 records stage 5's share (§2.3) and the `LP.ports` and `TYPED.frame` hook slots; P1 gains §14's common edits; C10
  records stage 5's tests (S18); a new row for the ball's stem placed by the layout (§17).
- **`plan.md`.** §5's stage 5 row points here (done with this note); §4.3 lists `src/uml/structure.js`.
- **`proposal.md`.** §8.5's subsets for the three types point to §17; row 5's "realization" is read as decision 18 settles.
- **`notes/stage-4.md`.** §10.4's member-row wrap points to §12.1 when 5.2 moves it.
- **`README.md` in this folder.** The status table shows this note and, once approved, stage 5's work packages; the log
  records the decisions taken. (The lead's.)
