# ELK trial (work package 5.7): the own engine against elkjs on ports in nested boxes

Status: **both columns filled on the four fixtures; outcome (a), the own engine only** (§7), 13 Nov 2026. The ELK
column was first run against `main` at c3b543e with 5.0 (`stage5-files`, 5727aea), on stand-ins for 5.3's sides and
sizes; both columns were then run against `stage5-followups` at 2891941 (5.1 and 5.4 to 5.6 merged), the ELK column
again on the types' own sides and sizes (§3.1). The trial's scripts are on the scratch branch `stage5-elk-trial` under
`spike/elk/` and are never merged; this note is the only file that moves to a docs branch. It answers `risks.md` L9 by
the box `notes/stage-5.md` §15 sets.

## 1. The rule, written before the trial

Copied from `notes/stage-5.md` §15 and fixed here before any layout is run (this section is committed alone, before the
scripts):

ELK is recommended as a host-passed strategy only if, on at least one fixture, the own engine leaves an issue of the
layout check that ELK does not, or ELK's crossings plus bends are a third lower across the four fixtures; otherwise the
own engine alone. The outcome is one of:

- (a) the own engine only; L9 closes with stage 5's fixtures;
- (b) ELK offered as a strategy the host passes in, never bundled, with the API sketch for the maintainer to approve as
  later work (a package after 0.22.0);
- (c) neither converges on a fixture: stage 5 ships with that fixture's limits stated, and the maintainer decides.

How the rule is read, also fixed now:

- "An issue of the layout check" is one of the four kinds §15's measures name: two nodes that overlap; a line through a
  node; a port off its side (its square off its owner's border on its side, or a line's end off its square by more than
  1 px); a label over a node. Both engines are measured by the same script (`spike/elk/measure.mjs`), on the same plain
  graph, so neither is judged by its own checker.
- "Crossings plus bends" is the sum over the four fixtures of proper crossings between two lines and of bends (a line's
  points less two). "A third lower": ELK's sum at most two thirds of the own engine's.
- "Converges": a layout is returned for the fixture, in under 1 s of CPU time, with no issue of the kinds above that
  the fixture's model forces (none of the four forces one).
- The rule is applied only once both columns are filled. Until then the outcome is **pending**.

*Added after the first run, 13 Nov 2026, on review (the rule's text above is unchanged; this is not the one revision):*
the four kinds are read through the module's own layout check, `src/layout/audit.js`, where the two differ. A line
through a node includes a line through its own end card (`audit.js`'s `roundEnd`), but not an end box that holds the
other end (an inner line); a port off its side includes a square on its side's line but past the side's end; and two
lines sharing one track (`audit.js`'s `share`, the same collinear test) is an issue, counted on its own row. The ELK
column was measured again with these: unchanged, no issue (§4).

## 2. The box

| | What | Status |
|---|---|---|
| Fixtures | `docs/diagrams/examples/04-composite-structure.json`, `05-component.json`, `06-deployment.json`, and 5.1's test-only view (§14) | Done, both engines |
| Configuration | One: `layered`, `hierarchyHandling: INCLUDE_CHILDREN`, orthogonal routing, ports `FIXED_SIDE` from §4.2's sides, port labels outside, node sizes from the shapes' `size()`; one revision allowed after the first table, its reason written down | Run as §3 says, first on stand-ins for 5.3's sides and sizes, then on the types' own; the revision not used |
| Measures | The four issue kinds; crossings; bends per line; area and aspect; layout time (CPU, best of seven after a warm-up); the same layout twice; nodes moved after a label edit; the size added (gzip); the licence | §4 |
| Own engine | On 5.1's view after 5.1; on the three examples after 5.4 to 5.6 (before then they draw as plain cards with no ports, sides or sizes, `notes/stage-5.md` Q13) | Done (§3.1), on `stage5-followups` at 2891941 |

No dependency is added: elkjs is installed at one pinned version in a scratch folder outside the repository;
`package.json` (the repository keeps no lock file) and `lib/` do not change on this branch or on `main`.

## 3. What was run

**elkjs 0.12.1** (published 28 Oct 2026; `npm install --save-exact elkjs@0.12.1` in a scratch folder outside the
repository), `lib/elk.bundled.js`, in Node 24.20.0 on an Apple M5, with the configuration:

```js
{ 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL', 'elk.portLabels.placement': 'OUTSIDE',
  'elk.json.shapeCoords': 'ROOT', 'elk.json.edgeCoords': 'ROOT' }      // the last two: absolute coordinates, for the measures
// on every node: 'elk.portConstraints': 'FIXED_SIDE'; on each port: 'elk.port.side', 'elk.port.borderOffset': -6
// (the 12 px square centred on the border, §4.1); on each box: 'elk.padding' top pad + 24, the others pad (§7)
```

ELK's spacings are its defaults. Each example is first turned into one **plain graph** (`spike/elk/graphs.mjs`), the
input both engines are to be measured on:

- **Component and deployment:** every node of the view; a node with a child in the view is a box; a node's `uml.Port`
  members are its ports; an end on a port is drawn to the port. `present.<id>.as: "ball"` gives a 16 px ball as wide as
  its name (§9.1).
- **Composite structure (§6):** the subject is a box with its own ports; each part is a card `name : Type` inside it,
  with the ports of the class its `valueType` names, under the id `<part>-><port>`, plus any its connectors name through
  it; a collaboration use is a card inside the subject; the open collaboration is a box of its roles. Role bindings keep
  their label.
- **Inner lines (§5):** a line between a box and something it holds; ELK routes them by its hierarchical ports with no
  option.
- **A box's padding (§7):** 48 px where it or a box it holds has a port with lines, else stage 2's 12 px; 24 px of header
  room on top.
- **A port's length (§4.1):** 12 px, plus 10 px for each further line; a card's side at least `16 + Σ (length + 8)`.

**Departures, until 5.3 lands** (§15 asks for 5.3's sides and sizes, which are not on `main`):

- **Sizes:** a stand-in for the shapes' `size()`: a card as wide as its widest text in the module's own estimate
  (`textW`, 13 px; a keyword line 11 px) and 24 px each side, at least 120, 42 px tall, 58 with a keyword line, grown for
  its ports as §4.1 says.
- **Sides:** §4.2's rule (the side facing most of a port's lines' far ends, by column, then by row; a port with no line on
  the side with fewest ports) applied to a stand-in ranking: columns by longest path along the lines, rows by model order.
  Inner lines are left out of the ranking, and a box and what it holds share no rank order, so an inner line votes
  half, as a right-laid view reads: the
  box's port on the left where the line starts at it, else on the right; the held node's port the other way. §4.2 does
  not say how an inner line votes: 5.3 settles it, and the trial follows.
- **The round box** is measured as its rectangle: ELK has no ellipse, and growing the box by √2 after ELK (S12) would
  move it onto its neighbours, which ELK did not reserve room for. A host passing ELK in would lose S12 or keep its own
  growth inside the box.

That first run's rerun recipe (the stand-in column, `spike/elk/run-elk.mjs`), from the repository's root (no file of the
repository changes; `SCRATCH` is any folder outside it):

```sh
SCRATCH=$(mktemp -d)
mkdir -p "$SCRATCH/elk" && (cd "$SCRATCH/elk" && npm init -y && npm install --save-exact elkjs@0.12.1)
node spike/elk/check-measure.mjs                                    # the measures' own check
for i in 1 2 3; do node spike/elk/run-elk.mjs "$SCRATCH/elk" "$SCRATCH/svg$i" > "$SCRATCH/run$i.json"; done
diff -r "$SCRATCH/svg1" "$SCRATCH/svg2" && diff -r "$SCRATCH/svg1" "$SCRATCH/svg3"   # the same layout across processes
```

Each run prints the ELK column as JSON (its `same` compares two layouts within one process) and writes one SVG per
example to look at; the `diff` compares the layouts across the three processes. Run again on 2891941 it gives the
stand-in column unchanged (§4's last paragraph).

### 3.1 The own engine's column, and ELK's run again on the types' sides and sizes

Run on `stage5-followups` at 2891941 merged into this branch (5.1, 5.4 to 5.6, decision 22), by `spike/elk/run-own.mjs`,
which takes the repository's root and the elkjs folder (§3's) and imports the branch's `src/` and
`spike/elk/measure.mjs` (the same measures, unchanged; `check-measure.mjs` passes). For each fixture it:

- **lays the fixture out with the module's own layout**, as a host gets it: the three examples by `layout(model, viewId)`
  (`src/map/api.js`, the type's own ranking, sides, sizes, padding and `labelGaps`, then `layoutTyped` with `repair:
  false`, `reroute: false`, then its port nodes, decision 22); 5.1's view by `layoutTyped(SPIKE())`, `SPIKE` copied word
  for word from `tests/typed-ports.test.mjs`, as 5.1 builds it (no `labelGaps`), and once more with `labelGaps: true`, as
  the component and deployment types lay out;
- **reads that geometry for the measures**: cards and boxes (`families`) as nodes, a box's parent and contents from the
  layout's own `families`; a port node (or, in 5.1's view, which has none, each line end's `fpb`/`tpb` under
  `owner.port`) with its side; each line's points; each placed label (`lbl`) and port name (`nameBox`);
- **builds ELK's plain graph from that same pre-layout**, so the two are measured on one graph: each card's `w` and `h`
  as the type sized it (a ball 16 × 16, its name not reserved, as the own engine does, §17), each port's side and its
  length along the border, each box's padding and its header room (24 px plus a deployment box's `head` on top), each
  line's label at most its `cut` (280 px) wide, port names as port labels. ELK's configuration is §3's, unchanged; the
  header room is 5.3's size, not the one revision;
- **measures both** with `measure.mjs`, lays each out twice in one process (`same`), lays the edited fixture out (the
  label edits above; for 5.1's view the test's own, `x ` before the first label) for "moved", times each (CPU, best of
  seven after a warm-up: the own engine's whole `layout()` call, type pass included; ELK's `layout()` on the built
  graph, read back), and runs the module's whole layout check on both: `check()` on the own engine, and
  `overlapIssues` and `routeAudit` on ELK's geometry, read into the layout's shape.

```sh
for i in 1 2 3; do node spike/elk/run-own.mjs "$PWD" "$SCRATCH/elk" "$SCRATCH/own$i" > "$SCRATCH/own$i.json"; done
diff -r "$SCRATCH/own1" "$SCRATCH/own2" && diff -r "$SCRATCH/own1" "$SCRATCH/own3"
```

It was run in two sets of three processes; within each set the SVGs each run writes (both engines, every fixture) are
the same across the three (`diff -r`), every count is the same in all six, and each run found every layout the same
twice within its process.

## 4. The table

Measured by `spike/elk/measure.mjs`, the same script for both engines, on one plain graph per fixture (§3.1). Time is
CPU time in Node 24.20.0 on an Apple M5, best of seven after a warm-up, across six runs in two sets of three (the spread
shown), on a machine loaded by other jobs (the second set ran slower throughout): it shows the 1 s ceiling met by a wide
margin; it ranks the engines only roughly, and the own engine's time includes its type's pass. "Moved" is the cards and
boxes whose place changed by more than half a pixel after one label edit, of all of them: a component renamed (`Payment
provider` to `Payment provider gateway`) and a communication path's label (`HTTP` to `HTTP/2 over TLS`), one of §14's
two for each; for composite structure a part renamed (`pricing` to `priceCalculation`) in place of §14's "a part's
type", since changing the type also changes the part's ports, so it is no pure label edit; for 5.1's view, its first
label changed, as its test does.

| Measure | 04 composite, ELK | 04, own | 05 component, ELK | 05, own | 06 deployment, ELK | 06, own | 5.1's view, ELK | 5.1's, own |
|---|---|---|---|---|---|---|---|---|
| Nodes, ports, lines | 9, 6, 8 | 9, 6, 8 | 9, 5, 10 | 9, 5, 10 | 14, 0, 8 | 14, 0, 8 | 56, 47, 60 | 56, 47, 60 |
| Overlaps | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Lines through a node | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Lines sharing a track | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Ports off their side (square or end) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Labels over a node | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Crossings | 0 | 0 | 0 | 0 | 0 | 0 | **18** | 0 |
| Bends (per line; most on one line) | 10 (1.25; 4) | 13 (1.63; 2) | 14 (1.4; 4) | 15 (1.5; 2) | 6 (0.75; 2) | 6 (0.75; 2) | 72 (1.2; 4) | 94 (1.57; 4) |
| Size, px (aspect) | 1,083 × 460 (2.4) | 2,039 × 430 (4.7) | 925 × 335 (2.8) | 1,022 × 294 (3.5) | 1,242 × 482 (2.6) | 1,429 × 738 (1.9) | 3,782 × 1,204 (3.1) | 4,262 × 1,446 (2.9); 7,358 × 1,446 (5.1) with `labelGaps` |
| Labels placed, of those with a label | 2 of 2 | 2 of 2 | 3 of 3 | 3 of 3 | 7 of 7 | 7 of 7 | 54 of 54 | **42 of 54**; 54 with `labelGaps` |
| The module's whole layout check | none | none | none | none | none | none | 18 (the 18 crossings, each "edges … cross") | none |
| Layout time, ms | 6.8 to 16.3 | 2.4 to 5.6 | 4.9 to 13.5 | 1.6 to 5.1 | 5.7 to 15.3 | 1.5 to 5.2 | 30.7 to 58.3 | 12.9 to 52.8; 24.6 to 36.0 with `labelGaps` |
| The same layout twice | yes, in one process and across three | yes, both | yes | yes | yes | yes | yes | yes, both |
| Moved after the label edit | 5 of 9 | 7 of 9 | 2 of 9 | 3 of 9 | 9 of 14 | 9 of 14 | 0 of 56 | 0 of 56, both |

ELK's column with 5.1's view laid out with `labelGaps` (its graph the same but for the own engine's wider gaps, which
ELK does not read) is the same in every count. Every one of the own engine's lines routed clean (`grid`: 8, 10, 8 and
60), and its `check()` reports nothing on the three examples or on 5.1's view; the module's check reads a crossing as an
issue, which the rule does not (§1's four kinds), so ELK's 18 on 5.1's view are counted on the crossings row only.

**The rule's sums**, crossings plus bends over the four fixtures: the own engine **128** (13, 15, 6, 94); ELK **120**
(10, 14, 6, 90). ELK's is 94 % of the own engine's; the rule asks for at most two thirds (85). On the three examples
alone: the own engine 34, ELK 30 (88 %).

**The stand-in run**, for the record (§3, on `main` at c3b543e): ELK's crossings plus bends on the three examples were
31 (10, 13, 8), its sizes 1,241 × 437, 826 × 373 and 1,346 × 316, no issue. On the types' own sides and sizes they are
30 (10, 14, 6), still no issue: the stand-ins moved no conclusion. `run-elk.mjs` run again on 2891941 gives the
stand-in column unchanged.

What the pictures show (the SVGs both scripts write), beyond the counts:

- Both keep every port's square on its border and every line's end on its square, nested ports and inner lines
  included: 5.1's router (`placePorts`, §5's `holds` bypass) does on these fixtures what ELK's hierarchical ports do.
- ELK routes the lines leaving one side of a card as parallels 6 to 11 px apart (04's `checkout`), one pair closer
  than the router's `SEP` (10 px); the own engine keeps `SEP`. Neither count includes it.
- The own engine draws 04 and 06 larger: 1.76 times ELK's area on each (04 1.9 times as wide, its aspect 4.7: the open
  collaboration beside the subject on the right, 895 px wide once grown by √2 for its ellipse (S12), which ELK's
  rectangle does not pay, where ELK puts it under the subject; 06 1.5 times as tall). On 05 the two are
  within 3 % in area. On 5.1's view it is 1.35 times ELK's area as 5.1 builds it, and 2.3 times with `labelGaps`, which
  it needs to place every label.
- ELK places all 54 of 5.1's labels at 3,782 px wide but crosses lines 18 times to do it; the own engine crosses none
  and leaves 12 labels with no spot, or places them all at 7,358 px wide.
- Neither engine keeps the picture still on a label edit that widens a card or a label: the own engine's ranking keeps
  every card's column and row, but a wider column moves everything right of it (7 of 9 in 04, 9 of 14 in 06); ELK moves
  about as many (5 and 9). On 5.1's view, whose edit does not widen a column, neither moves anything.
- ELK's boxes are sized by their contents and its padding, as `frameOf`'s are; neither widens a box for its title.

## 5. Size and licence

| | |
|---|---|
| Package | `elkjs` 0.12.1, the Eclipse Layout Kernel compiled from Java to JavaScript (GWT) |
| Licence | `EPL-2.0 OR GPL-3.0-or-later` (the package's `license` field and `LICENSE.md`): a host takes it under one of them. Under EPL-2.0, a weak copyleft, a host that ships elkjs in its bundle ships EPL-2.0's notice with it and offers the source of elkjs and of any change it makes to it; the host's own code keeps its licence. umlimator is MIT and adds no dependency (D8): it would name elkjs only in its documentation, as a strategy a host may pass in |
| Size | `lib/elk.bundled.js` 1,646,241 B, **477,137 B** by `gzip -9`; the worker pair `elk-api.js` 2,951 B and `elk-worker.min.js` 472,192 B gzipped; 8,230,510 B unpacked from npm. umlimator's core is 185,259 B by `gzip -9` at 2891941 (184,984 B at c3b543e; `lib/umlimator.js`, unchanged by this trial): ELK is 2.6 times the core |
| API | Asynchronous only: `new ELK().layout(graph)` returns a promise, in the page's thread (bundled) or in a Web Worker |

## 6. The fit: how a host would pass ELK in (a sketch, not code)

`render()` and `layout()` are synchronous; elkjs answers with a promise. Two shapes, both outside the module:

- **(a) The host lays out ahead and hands in the result (recommended if ELK is ever offered).** A helper the host owns,
  `await elkPlan(model, viewId, elk)`, builds the plain graph of §3 from the type's own pre-layout pass (its sizes, sides
  and boxes, which the module would export as data), runs ELK, and returns `{ nodes: { id: { x, y, w, h } }, ports:
  { id: { x, y, w, h, side } }, lines: { id: [[x, y], …] } }`. The host then calls `render(el, model, { placed })`
  synchronously; the type's draw pass reads `placed` instead of `layoutTyped`'s answer, and everything after it (port
  names, the ball and socket, selection, the layout check) is unchanged. An edit re-plans before it re-renders, so the
  host chooses when a picture may move. The module's new surface is one option and one exported pre-layout pass.
- **(b) A `layout.run` the host supplies, with a cache.** The strategy returns the cached ELK result for the view's key,
  or, on a miss, the own engine's layout while it starts ELK and re-renders when the promise settles. No await in the
  host, but every edit draws twice and the picture jumps between engines: DoD 6's one picture fails.

Either is later work, after 0.22.0, and only under outcome (b).

## 7. The outcome

**Outcome (a): the own engine only. L9 closes with stage 5's fixtures; elkjs stays out of the repository and out of
the API, and §6's sketch is not proposed as work.** The rule of §1, applied once, to the table of §4:

- **Its first test fails.** On none of the four fixtures does the own engine leave an issue of the four kinds (or a
  shared track) that ELK does not: both leave none on every fixture. The module's whole layout check agrees: nothing on
  the own engine's four layouts.
- **Its second test fails.** ELK's crossings plus bends over the four fixtures are 120 against the own engine's 128:
  6 % lower, where the rule asks for a third (at most 85). ELK has fewer bends (102 against 128) but all 18 crossings,
  every one on 5.1's view; the own engine crosses no line on any fixture.
- **Outcome (c) does not arise.** Both converge on every fixture: a layout returned, the same each time, in at most
  59 ms of CPU time, with no issue.

**What the own engine still lacks**, which the rule does not weigh and which ELK does better on these fixtures; each is
a finding for the maintainer or for later stage 5 work, not tuned here (§15, 5):

1. **Compactness with boxes.** 04 and 06 take 1.76 times ELK's area (04 at aspect 4.7), and 5.1's view 1.35 times; 05,
   with one box, is within 3 %. Why is not measured here: the ranking, the boxes' padding and 04's √2 growth all add to
   it.
2. **Label room without width.** On 5.1's view 12 of 54 labels find no spot as 5.1 builds it; `labelGaps` places all
   of them at 7,358 px wide, where ELK places all 54 at 3,782 px (at the cost of 18 crossings).
3. **Bends.** 1.5 to 1.6 bends a line on 04, 05 and 5.1's view against ELK's 1.2 to 1.4; the same on 06.
4. **Stability under a widening edit.** A wider card or label moves everything right of its column (7 of 9 cards and
   boxes in 04, 9 of 14 in 06), as many as ELK or a few more (ELK 5 in 04; 3 against 2 in 05), which has no memory of
   the layout before; the ranking holds order, not places.
5. **A ball's name** is still laid out with no room of its own (§17's ponytail note); neither column measures it.

**Revisit ELK** only if a later fixture shows the own engine leaving an issue of the four kinds that a host-passed ELK
would not, or if the maintainer makes compactness (1, 2) a requirement the own engine cannot meet; the trial's scripts
and §3.1 rerun it on any fixture with no change but the fixture's list. Even then ELK's cost stands: 477 KB gzipped,
2.6 times the core, a copyleft peer (§5), an asynchronous layout (§6), and a picture with no memory of the one before.
