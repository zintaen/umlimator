# Stage 3 design note: sequence and communication

Status: **approved** by the maintainer 12 Nov 2026 (#174); written against `main` at 9c1cf4f (stage 1b merged, 0.18.0 not yet released). The maintainer approves it before work package 3.0 starts. It adopts `notes/spike-sequence.md` §2.1 to §2.3, which the maintainer accepted on 12 Nov 2026. It settles what the spike's §1, §3 and §4 left as findings. Where it departs from the spike, it says so (§14).

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | Where the time-axis code lives | The geometry goes in `src/layout/timeaxis.js` and the meaning in `src/uml/sequence.js`. The rules both types share go in `src/uml/interaction.js`. All three are in `lib/umlimator-all.js` only | §3 |
| S2 | How frames, operands and interaction uses are selected | They are nodes of the geometry, drawn by family shapes. Their outlines go in the type's `under` layer | §4.2 |
| S3 | How a lifeline's stem is hit | A transparent strip, 24 px wide, inside the head's node group, cut away around every message row | §4.2 |
| S4 | The gesture hooks | `edits.connect`, `moveTo`, `wrap`, `add` and `remove`. Each returns commands, `null` or `{ error }` | §5.1 |
| S5 | Refusing an edit that breaks a rule | The type's hooks never emit one. They return `{ error }` for the hint line, and a host may still refuse. The reference store (D7) is not built in this stage | §5.3 |
| S6 | Deleting one operand | Its content is moved to just after the fragment, then the operand is deleted. Deleting the last operand deletes the fragment | §5.4 |
| S7 | Several messages on one link | The stack of messages is a node of the layered graph, with the connector split through it. No core change | §6.2 |
| S8 | Message numbers | One rule for every message, replies included: a message's number is its place among the messages sent in the activation it is sent from | §6.3 |
| S9 | The helpers | Two functions in `src/uml/convert.js`, internal like the Mermaid class reader. A trace goes through its numbered view | §7 |
| S10 | The Mermaid sequence subset | §8's table, against Mermaid 12.3.0, the version the class reader uses | §8 |
| S11 | The core's budget | Stage 3 starts after the core diet. Only work package 3.4 touches the core, within its share of what the diet frees | §2.3 |
| S12 | Order with stage 2 | 3.0 follows the diet, and the other lanes follow 3.0. 3.4 opens only when no stage 2 package holds its files. 0.20.0 ships after 0.19.0 | §11.2 |
| S13 | Reading order | The type gives `geo.order`: heads left to right, then the occurrences in time order. The canvas's focus targets follow it | §4.2 |
| S14 | Sharing the bytes the diet frees | The lead records them when the diet merges and splits them between stages 2 and 3. Each core pull request states its cost against its stage's share | §2.3 |
| S15 | C10 (the skill, the MCP server, the diff Action) | Deferred, as in 1b, to one package after 0.20.0 that covers the class, sequence and communication types | §12 |

The things this note leaves out of the subsets are listed in §13.

## 2. Where stage 3 starts

### 2.1 Applied in stage 1b (#171, #173)

- `layout.run(model, view, { measure, pos, memo })` and `layout.key` exist, and both are called inside the host's measure. That closes the spike's risk 4.6. `layout.pins: false` exists too.
- `draw(geo, kit) → { under, over }` exists, with `kit` = `{ esc, r2, textW }`.
- So do `items`, `refs` (cascade and drop), `validate(model, view)`, `lines` with `props`, and `edits.connect`. The canvas calls `edits.connect` with `at` set to null.
- `apply()` has `add … in: 'view'`, a delete that re-homes what stays (an operand's content goes to its fragment's parent), and `move { id, view, index }` on `view.edges`.
- `model.md`: a sequence's occurrences are one ordered list in `edges`, messages are inline, and activations are derived by intervals (rows 11 and 12, the five rules, §3).
- `svgOf` draws a typed node with `SHAPE[n.shape].draw`. A family can add a shape without touching `svg.js` (`class.js` adds `SHAPE.note`).
- `registerDiagramType` freezes whatever fields a definition has. New fields (`wraps`, `edits.add`) need no registry change.

### 2.2 What is left, checked at 9c1cf4f

Q1 to Q3 were run on `lib/umlimator-all.js` with `docs/diagrams/examples/11-sequence.json`. Q4 to Q10 were read in the code.

| # | What was run or read | What came back | Where it is handled |
|---|---|---|---|
| Q1 | `delete f1-paid` (one operand of the `alt`) | m5, m6, f3 and f2 go to f1's parent, the top level, and stay where they are in `edges`. With a middle operand, its content would sit between two operands of one fragment, and the fragment would draw as two frames | S6, §5.4, the `contiguous` rule (§4.3) |
| Q2 | `move { id: 'f2', view, index: 0 }` | Refused: `"f2" is not in view` | A fragment moves through its content (§5.2) |
| Q3 | `reparent m9` to `f1`, a fragment rather than an operand | It applies | The `parent-operand` rule (§4.3) |
| Q4 | `svg.js`, `edit.js` | Typed lines get no key ring (`if (map)`), so the spike's risk 4.7 is still open. A line from a card to itself is refused by pointer, by `L` and in `connect()`. No self-message or reflexive association can be drawn by gesture | 3.4 |
| Q5 | `edit.js`'s `elementsOf()` and `props()` | `elementsOf()` does not read `view.fragments`, so a selected fragment or operand shows no properties. `props()` lists members only when `e.kind === 'node'` | 3.4 |
| Q6 | `render.js`'s multi-selection | Cards only: two messages cannot be selected together | 3.4 |
| Q7 | `layered.js`'s label on a typed line | One line of 10 px text, cut at 150 px, 18 px tall. A label with no free spot is not drawn | S7 |
| Q8 | `svg.js`'s layers | `<g class="nodes">` is drawn after `<g class="edges">`, so a node's hit area covers the lines under it | S3 |
| Q9 | `context.js`, `buildGeo` | With `pins: false`, `layoutCache[vid] ||= autoPos(vid)` still runs, and `autoPos` runs `flowPos` for every type with its own layout | 3.4 |
| Q10 | `edit.js`'s `key()` | `L` starts a line only when a node is selected (`s.type === 'node'`). Alt + arrows set a pin, whatever `layout.pins` says | 3.4 |

Still open from the spike: slots, hit areas, the frame shape, `edits.moveTo` and `wrap`, key rings on typed lines, refusing an edit, and the spike's risks 4.4 (covers next to each other) and 4.5.

### 2.3 The core's budget (C5, S11, S14)

At 9c1cf4f, `lib/umlimator.js` is 190,536 B gzipped (Node's zlib, default level). The cap is 190,586 B, which is 0.16.0's 165,727 B plus 15%. That leaves 50 bytes.

- Everything new goes in files listed in `tools/build.mjs`'s `ALL` only (S1).
- Stage 3 starts after the core diet has merged (the README's next step, before 0.18.0).
- `render.js` imports `typedEditor` from `edit.js` statically (line 2). The diet has to make that import injectable, so `src/canvas/edit.js` lands in `ALL` only. Then most of 3.4 (the hooks, `L` from a message, `W`, slots, the member list) costs the core nothing.
- 3.4's changes outside `edit.js` (key rings and `geo.order` in `svg.js`/`render.js`, line multi-selection, the `autoPos` skip in `context.js`) have a target of 500 B gzipped. Its pull request states the core's size before and after.
- If the diet leaves `edit.js` in the core, 3.4 does not start. 3.1, 3.2, 3.6 and 3.3's Node tests go on, and the maintainer decides between raising C5 and leaving gestures out of the subset.

S14, how the freed bytes are shared:

| Option | For | Against |
|---|---|---|
| **(a) The lead records the freed bytes in the README when the diet merges, with a share for stage 2 and one for stage 3 (recommended)** | Neither stage blocks the other. Each pull request checks itself against a number | The split is a guess before stage 2 has a design note |
| (b) First come, first served | Nothing to decide | A stage that merges later may find no room |
| (c) Stage 3 adds no core code | No budget question | Key rings, line selection and the `autoPos` skip cannot be done, and definition of done items 4 and 8 fail |

## 3. The time-axis layout (S1)

### 3.1 Options

| Option | For | Against |
|---|---|---|
| **(a) Geometry in `src/layout/timeaxis.js`, meaning in `src/uml/sequence.js` (recommended)** | Two lanes that share no file. The geometry is tested on hand-built input. The interaction overview (stage 4) can draw an inline interaction with the same code | A contract between the two files to keep (§3.2) |
| (b) All in `src/uml/sequence.js`, like `class.js` | One file and one agent | The stage's largest piece becomes one lane, and geometry is only tested through the model |
| (c) In the core's `src/layout/`, listed in `ORDER` | It sits beside the layered layout | The core has no room (§2.3) |

Both files of (a) are in `ALL` only. The folder says what a file is, and the build list says which built file it lands in.

### 3.2 The contract

`layoutTimeAxis(input) → out`. It needs no DOM and no model. Sizes come in already measured: the type measures with `textW`, inside the host's measure.

```js
input = {
  heads:  [{ id, w, h, born, ends }],         // lifelines, left to right; born: its create row; ends: its delete row
  rows:   [{ id, kind, a, b, w, h, parent }], // occurrences in time order. kind: 'line' (head a to head b), 'self' (a),
                                              //   'span' (heads a to b: an interaction use); w, h: its label; parent: its operand
  groups: [{ id, parent, tag: { w, h }, parts: [{ id, guard: { w, h } }] }], // fragments, outermost first; parts: operands in order
  bars:   [{ head, from, to, depth }],        // activations by row, from src/uml/interaction.js
}
out = { heads: [{ id, x, y, w, h }], stems: [{ head, x, y1, y2, cross, gaps: [{ y1, y2 }] }], bars: [{ x, y, w, h }],
        frames: [{ id, x, y, w, h, dividers: [{ part, y }] }], spans: [{ id, x, y, w, h }],
        lines: [{ id, pts, lbl }], slots: [{ index, y, parent, after }], bounds, problems }
```

- **Columns.** Heads are placed in order. Each gap is as wide as the widest label of a message across it. A self-message's label widens the gap to its right. A head is cut at 320 px (spike risk 4.10).
- **Rows.** Each occurrence gets one row, in order. A fragment adds a header row (its tag and first guard) and a closing row. Each further operand adds a divider row with its guard. An empty operand keeps one empty row (`model.md` §3).
- **Frames.** A fragment spans the heads its content touches. Vertically it runs from its header to its closing row. Each level of nesting is inset 10 px.
- **A fragment with no content.** It has no place in `edges`, so it goes at the end of its parent's content: a header row, one empty row per operand, and a closing row, spanning its parent's heads. It is reported as a problem.
- **Heads.** A created lifeline's head is centred on its create row, and its stem starts there. A deleted lifeline's stem ends at its delete row, with a cross.
- **Bars.** Each bar sits at its rows. Each level of depth is drawn 6 px to the right.
- **Stem gaps.** `gaps` are the bands, 12 px above and below each message row that touches the stem, and around a self-message's loop. The stem's hit strip leaves them out (S3).
- **Slots.** There is one slot between every two occurrences. Each operand, empty or not, gets one at its start and one at its end, and the interaction gets one at each end. `index` points into `view.edges`. `parent` is the operand at that height, or none at the top level. `after` is the occurrence just before the slot (new: the spike's slots had no `after`). No two slots share a `y`.
- **Problems.** They come back in `out.problems` as `{ level, message, ids }`, never through `warn()`.
- **Lines.** There is no router. Lines are straight, and a self-message is a loop of three segments.
- **No geometry key.** `layout.key` stays absent. The spike laid out 200 messages in 0.8 ms, so a sequence is laid out again on every change.

The sizes in the spike are starting values. 3.2's fixtures may change them.

## 4. The sequence type

### 4.1 Vocabulary

As `model.md` row 11, with nothing added:

| Kind | Types | Props |
|---|---|---|
| Node | `uml.Lifeline` | `represents`, `stereotypes` (`actor` draws «actor» over the name) |
| Line, inline in `edges` | `uml.Message` | `sort` (`call`, `async`, `reply`, `create`, `delete`) and `replyTo` |
| Item, inline in `edges` | `uml.InteractionUse` | `refersTo`, `covers` |
| Fragment, in `fragments` | `uml.CombinedFragment` | `operator`: `alt`, `opt`, `loop`, `par`, `break` |
| Member of a fragment | `uml.InteractionOperand` | `label` is the guard |

The type's definition has these fields:

- `elements`: Lifeline and Interaction use. It never lists `uml.CombinedFragment`: `add … in: 'view'` puts an element the palette does not know in `view.nodes`.
- `lines`: Call, Async, Reply, Create and Delete. Each is a `uml.Message` with its `sort`.
- `items: ['uml.InteractionUse']`.
- `wraps`: the five operators, for the `W` picker (new).
- `refs`, as in the spike: `replyTo` cascades and `covers` drops.
- `layout: { run, pins: false }`, `draw`, `validate`, `rules` and `describe`.
- `member`: operands are edited as a fragment's members (§5.2).
- `edits`: `connect`, `moveTo`, `wrap`, `add` and `remove` (`add` and `remove` are new).

The spike's `layout.directions` and `layout.bake` are dropped. A direction other than `down` gets a warning (§4.3). Work package 1.8 already bakes nothing into a typed view (F4).

### 4.2 Drawing (S2, S3, S13)

`run` returns `svgOf`'s geometry with `map: false`.

| Part | Where it goes | Why |
|---|---|---|
| Heads | `geo.nodes`, shape `lifeline`: the classifier with no compartment, showing `name : Type` | The canvas already selects, moves and names nodes |
| Stems, bars, crosses | `under` | They sit under the messages, so a bar never hides a label (spike R1) |
| A stem's hit area | Inside the head's node group: a transparent strip down the stem, 24 px wide (E8), cut at the stem's `gaps` | A click or drag on a stem lands on the lifeline, and a click on a message, its arrowhead or a self-message's loop lands on the message, with no canvas change |
| Messages | `geo.edges`, with `end` and `lbl` above the arrow. A call is `arrow`. Async, reply and create are `open`. Reply and create are `dashed`. A delete is `arrow` plus a cross | `svgOf` draws them, with their `.hitline` |
| Frame outlines, dividers, the box of a use | `under`, before the bars | As the spike drew them (spike R1) |
| Frames, operands, uses | Also in `geo.nodes`, with shapes `frame`, `operand` and `use` from `src/uml/frame.js`. They draw the pentagon tag, the guards, and the `ref` tag and name, each on a backing in the stage's colour, plus a transparent outline to hit | They can be selected by click and by keyboard, are named, and appear in the outline, with no canvas change |

Options for S2:

- **(a) Nodes with family shapes (recommended).**
- (b) The spike's `data-id` groups in the `over` layer. The canvas would have to learn to hit, select and focus them, which means more core code.

The spike's `frame()` in `kit` becomes a function of `src/uml/frame.js`, and `kit` stays as it is. Stage 4's inline interactions, state regions and partitions import it from there.

Options for S3 (Q8: nodes are drawn over lines, so a strip down the stem covers every message end near it):

- **(a) The strip inside the head's group, cut around each message row (recommended).** The canvas already hits `.node[data-id]`, and the layout knows each row's height.
- (b) Message hit targets copied into `over`. Each message then has two hit targets, and the canvas must learn to read the copy.
- (c) Stems as nodes of their own. Each lifeline then has two nodes, in the outline and in navigation, and they still cover the message ends.
- (d) `data-id` on the `under` layer, plus a canvas change. This costs core bytes.

3.2's overlap check treats frames, operands and uses as boxes that hold other things, not as nodes that may not touch.

Reading order (S13, A1, definition of done item 8). Map key rings come after all nodes (`.keys` follows `.nodes`). With frames, operands and uses as nodes, Tab would read heads, then frames, operands and uses, then every message. That is not time order.

| Option | For | Against |
|---|---|---|
| **(a) The type gives `geo.order`, a list of ids. 3.4 puts one focus target per id in the keys layer, in that order, and the nodes listed there are not tab stops of their own. With no `geo.order`, nodes then lines, as today (recommended)** | Every type states its own order (A1). Communication and stage 4 use it too | A canvas change in 3.4, in the core's share |
| (b) Nodes then lines, as maps | No change | Frames and uses are read apart from the messages they hold |

A sequence's `geo.order`: heads left to right, then the occurrences in time order. A fragment comes just before its first occurrence, and each operand just before its own first occurrence.

Accessible names (A1):

- A head: "Lifeline api : ShopApi".
- A message: "Message 5 of 10: payments to api, paid, reply, in alt, payment accepted" (m5, the first in the alt; m4, sent before it, has no "in" part).
- A fragment: "Combined fragment alt, 2 operands".
- An operand: "Operand payment accepted of alt, 3 occurrences".
- A use: "Interaction use Send receipt email, over api to receipt".

### 4.3 Validators

Each problem is `{ level, rule, path, message, ids }`, as in `class.js`. Rules marked "shared" live in `src/uml/interaction.js`, and the communication type runs them too.

| Rule | Level | Checks that |
|---|---|---|
| `parent-operand` | error | An occurrence's or fragment's `parent` is an operand of this view (Q3) |
| `contiguous` | error | A fragment's occurrences, nested ones included, are one run in `edges`, made of its operands' runs in `members` order. It replaces `check.mjs`'s operand check and catches Q1's split |
| `message-ends` | error | A message joins two lifelines listed in `nodeIds` |
| `reply-call` (shared) | error | `replyTo` names an earlier call of the view, and the reply goes back along it. A reply with no `replyTo` is a warning |
| `reply-once` (shared) | error | Two replies to one call lie in different operands of one `alt` |
| `create-once` (shared) | error | A lifeline is created at most once, by the first message to or from it |
| `delete-once` (shared) | error | A lifeline is deleted at most once, by the last message to or from it |
| `covers` | error | `covers` names lifelines of the view that are next to each other in `nodeIds` (spike risk 4.4) |
| `operator` | warning | `operator` is one of the five; any other is drawn by its name. `opt`, `loop` and `break` have one operand |
| `sort` (shared) | warning | `sort` is one of the five; any other is drawn as a call |
| `empty` | warning | No operand or fragment is empty (E9, E10) |
| `view` | warning | The view has no `layout` pins (they mean nothing here) and its `direction` is `down` |

`examples/check.mjs` calls the type's `validate` and `refs`, and drops its hand-written list for `uml.sequence` (spike risk 4.8).

## 5. Editing

### 5.1 Hooks (S4)

The canvas stays generic. It finds the slot or the place, and emits what the type returns. Each hook returns commands, `null` to leave the gesture to the default, or `{ error }`.

| Hook | Called by | `at` |
|---|---|---|
| `connect(model, view, from, to, at, line)` | Connect, by pointer and by `L` | By pointer, the slot nearest the release. By `L`, the slot after the selected message, or the last slot |
| `moveTo(model, view, id, at)` | A drop, or Alt + arrows | The slot nearest the drop, or `{ by: [dx, dy] }` for the keys. If it returns `null`, the gesture sets a pin, as today, unless the type has `layout.pins: false`; then nothing happens |
| `wrap(model, view, ids, kind)` | `W`, then a picker listing the type's `wraps` | |
| `add(model, view, entry, label, at)` | The palette, `N` | As for `connect` |
| `remove(model, view, ids, fromModel)` | Delete, Shift + Delete, the outline's ✕ | |

3.4 also makes these canvas changes:

- Typed views allow a line from a card to itself (Q4).
- Typed lines get key rings, named by `e.aria`. Focus targets follow `geo.order` when the type gives one (S13).
- Shift + click, and Shift + Enter on a key ring, add a line to the selection (Q6).
- `L` starts a line from a selected line too, when the type has `edits.connect` (Q10).
- A typed line can be dragged when its type has `moveTo`.
- `elementsOf()` reads `view.fragments`, and `props()` shows the member list for a fragment as for a node (Q5).
- No pin is written when `layout.pins` is `false` (Q10).
- `buildGeo` does not run `autoPos` for a type with `layout.run` and `pins: false` (Q9).

### 5.2 Gestures and their commands

| Gesture | Pointer | Keyboard | Commands |
|---|---|---|---|
| Add a lifeline | Palette | `N` | `add` a model node to `nodeIds`, after the selected lifeline |
| Reorder lifelines | Drag a head sideways | Alt + Left/Right | `move { id, view, index }` on `nodeIds` |
| Insert a message | Drag from a stem, between messages, to another stem; dropping on its own stem makes a self-message | Select a message, press `L`, pick the other end, press Enter. The new message goes right after the selected one and is sent from its receiver. Started from a lifeline, it goes at the end | `add { element, view, index, in: 'view' }`, with the slot's `parent` and the picked entry's `props`. A reply also gets `replyTo`: the latest unanswered call from its receiver to its sender, where a call answered only in another operand of an `alt` counts as unanswered |
| Move a message or use in time, including across operands (E9) | Drag it up or down | Alt + Up/Down moves one slot | `move { id, view, index }`, then `reparent { id, parent }` |
| Move a fragment | Drag its frame | Alt + Up/Down | One `move` for each occurrence it holds, in order, then a `reparent` of the fragment. Moving it into itself returns `{ error }` |
| Wrap in a fragment | Select a run (Shift + click), press `W`, pick the operator | The same, using Shift + Enter on key rings | `add` the fragment (`in: 'view'`) with one operand (an `alt` gets two, the second "else"), with the run's `parent`. Then `reparent` each selected item to the first operand. A run that is not contiguous, or has two parents, returns `{ error }` |
| Add or rename an operand | The properties panel's member list (the type's `member` hook) | F2, Enter | `add { element, owner }`, `set label` |
| Reorder operands | The member list | Alt + Up/Down | `move { id, index }` on `members`, then one `move` per occurrence of the moved operand, so `edges` follows the new `members` order (`contiguous`) |
| Add an interaction use | Palette | The palette button | `add … in: 'view'` at the slot. `covers` is the selected lifeline, or all lifelines |
| Rename a message, guard or lifeline | Double-click | F2 | `set label` |
| Edit sort, replyTo, operator, covers, refersTo, represents | Properties panel | Properties panel | `set` |
| Unwrap | Delete a fragment | Shift + Delete on its frame | `delete`. What it held goes to the operand around it |
| Delete a message or use | | Delete or Shift + Delete; it lives in the view (P12) | `delete`. A call's replies go with it (`refs`) |
| Remove a lifeline from the view | | Delete | `remove` emits `hide`, which also takes away every message to or from it, then a `set` that drops it from each `covers`. The hint says how many messages go |
| Delete a lifeline | | Shift + Delete | `delete`. Its messages go, and `covers` drop it (E10) |

A message cannot be hidden from its own view; the gesture is to delete it (P12). The conformance note says so under item 4 of the definition of done.

### 5.3 Refusing an edit (S5)

| Option | For | Against |
|---|---|---|
| **(a) The hooks never emit a breaking transaction (recommended)** | No core code, and the type knows its own rules. `{ error }` reaches the hint line (E6). The host still decides (E12); `examples/class-editor.html` already shows a host refusing on new errors | A host that calls `apply()` itself can still break a rule. The validators then name it |
| (b) The canvas runs `apply()` and `validate()` before each emit | One check for every type | A copy of the model per gesture, and core bytes |
| (c) The reference store refuses after `apply()` (the spike's §3) | It is D7's design | A new public piece. No stage's work packages build it yet |

D7 stands: the library ships a reference store. This stage does not build it. When it is built, it runs `validate()` after `apply()` as the spike said, and the hooks' `{ error }` stays. The maintainer names the stage that builds it.

### 5.4 Deleting an operand (S6)

Today (Q1) `delete` already moves its content to the fragment's parent, but leaves it where it is in `edges`. That splits the fragment whenever the operand is not the last.

| Option | For | Against |
|---|---|---|
| **(a) Its content is moved to just after the fragment, then the operand is deleted, and `delete` re-homes the content. Deleting the last operand deletes the fragment (recommended)** | It matches unwrapping a fragment (P8). Nothing is lost, and `contiguous` holds | `remove` emits one `move` per occurrence before the `delete` |
| (b) Its content is deleted with it | One command | It deletes messages the user did not select |
| (c) It is refused while it holds anything | Safe | The user has to empty it by hand first |

`apply()` does not change.

## 6. The communication diagram

### 6.1 Vocabulary and layout

As in `model.md` row 12:

- Nodes are `uml.Lifeline`.
- `uml.Connector` and `uml.Message` are model edges.
- The view's `edges` lists the connectors, then the messages. Only the messages' order means anything.
- Numbers are derived.

The view is laid out by `layoutTyped`, like the class diagram. Lifelines are classifier heads, connectors are the lines (with no arrows), and a self connector is a loop (F1). Messages are not routed. A connector is ranked from the sender of its first message.

### 6.2 Several messages on one link (S7)

| Option | For | Against |
|---|---|---|
| **(d) The stack is a node of the layered graph: the type passes it to `layoutTyped` and splits the connector into two lines through it (recommended)** | No core change, and no wait for stage 2. The layout already keeps nodes clear (definition of done item 3). It is how layered layouts place edge labels | A link with messages spans two ranks, so the picture grows. The connector bends at its stack. The stack sits on the link, not beside it |
| (a) A box on the connector, sized by the type: `layered.js` sizes a typed line's label from `e.box`, and `typed.js` adds `box` to `EDGE_GEO` | The connector stays one straight line | Core bytes, and `layered.js` changes while stage 2's layout work may hold it |
| (b) One label per connector, with the messages joined | No core change | One line cut at 150 px (Q7); unreadable past two messages |
| (c) Stacks placed after the layout, in free space | No core change | Nothing keeps them clear, so item 3 fails |

How (d) works:

- For each connector with messages, the type adds a stack node: the width of the widest row, and 16 px of height per message. The connector becomes two lines, lifeline to stack and stack to lifeline. A connector with no message stays one line.
- After the layout, the type joins the two halves into one connector and ends them at the stack's border. The "line through an element" check skips a connector's own stack.
- It replaces the stack node with one node per message, with shape `message-row`. A row shows its number, its text, and a small arrow toward the receiver: filled for a call, open for async and create, dashed and open for a reply.

If 3.5's fixtures show (d) fails, the maintainer picks (a), and it becomes package 3.4b, after stage 2's layout work.

### 6.3 Numbers (S8)

| Option | For | Against |
|---|---|---|
| **(a) One rule: a message's number is its place among the messages sent in the activation it is sent from, replies included (recommended)** | Numbers are unique. They use the same intervals as the sequence's bars (`src/uml/interaction.js`). There is nothing to validate | A reply reads as a step of its own: `1.1.2.1: paid` |
| (b) A reply takes its call's number | Reads as call and answer | Two messages share one number |
| (c) Replies are left out | UML's usual picture | The helper drops data, and a model with replies draws less than it holds |

Example 12 under (a):

| Message | Number |
|---|---|
| checkout() | 1 |
| place(order) | 1.1 |
| validate(order) | 1.1.1 |
| charge(total) | 1.1.2 |
| paid | 1.1.2.1 |
| new(order) | 1.1.3 |
| orderPlaced | 1.1.4 |
| result | 1.1.5 |
| confirmation page | 1.2 |

### 6.4 Validators, reading order and editing

Validators:

- `message-link` (error): a connector of this view joins the message's two lifelines. A self-message needs a self connector.
- The shared `reply-call`, `create-once`, `delete-once` and `sort`. Under `reply-call`, a call has at most one reply here, since there are no operands.

`geo.order`: lifelines in the layout's order, then the message rows by number.

Gestures:

- The palette adds a lifeline.
- Connect offers a picker with Connector, Call, Async, Reply, Create and Delete.
- A new message goes after the selected message, or last. If no connector joins its two lifelines, one is added in the same transaction.
- Alt + Up/Down on a message row calls its `moveTo` and moves the message one place in time. Dragging a row onto another row takes that row's place.
- On a lifeline, `moveTo` returns `null`, so Alt + arrows set a pin, as on a class view.
- Delete hides a message from the view. Shift + Delete deletes it, since it is a model edge.

## 7. Helpers (S9)

C7 says `render: "sequence"` stays a numbered view. These helpers turn one into a UML diagram.

| Function | From | To |
|---|---|---|
| `sequenceFromView(model, viewId, options)` | A numbered view (`render: "sequence"`) | A `uml.sequence` view |
| `communicationFromView(model, viewId, options)` | A numbered view, or a `uml.sequence` view | A `uml.communication` view |
| Traces | Today's `sequenceFromTrace()`, then `sequenceFromView()` | A `uml.sequence` view |

What every helper does:

- It returns `{ model, report }`. The report has a reader's shape: `{ id, status, message }` (R1).
- A version-1 model goes through `migrate()` first.
- Ids are derived (R3), never from a source line's id: a numbered view's lines may have none, or a positional one (`a->b#0`, F9), and a new id may not contain `->` (M2). A lifeline is `<view>.<card>`, a message `<view>.m<n>` by its place in the source's order, and a connector `<view>.<a>-<b>`.
- Running a helper again with the same `options.view` replaces that view, plus its lifelines that no other view lists.

From each source:

- **A numbered view.** Its lines become calls, in their order (for a view with no `edges` list, the order the core numbers them in). A `step` that does not equal the derived number (such as "2a", or a hand-written "2.1") is reported as approximated.
- **A sequence view.** `options.operands: { <fragment>: <operand> }` picks one operand of each `alt`; the default is the first. `opt`, `loop` and `break` are taken once. `par`'s operands are taken one after another, reported as approximated. Interaction uses are left out and reported. Messages are copied as model edges with new ids (`model.md` row 12). A connector is added for each pair of lifelines that exchange a message. Example 11 with `{ f1: 'f1-paid' }` gives example 12, except for ids.
- **A trace.** It goes through its numbered view, so no new trace code is needed. The bars then follow rule 3. Calls that overlapped in the trace are drawn one after another, and the view's caption says so.

Where they are exported:

| Option | For | Against |
|---|---|---|
| **(a) Internal, like `readMermaidClass`: in `lib/umlimator-all.js` with no export, and the CLI and tests import `src/uml/convert.js` (recommended)** | Nothing to take back under C2. No `.d.ts` question | A host cannot call them until they are made public |
| (b) Public in `umlimator-all.js` | Hosts get them now | The first public family export, and C2 forbids taking it back. `package.json`'s `./all` shares `lib/umlimator.d.ts` with `.`, so typing them there claims they exist in `lib/umlimator.js` |

They become public with the registry's API (stage 1 note §2.5), with their own `.d.ts` for `./all`.

Also rejected: reading a trace directly and writing replies at span ends. That needs new trace code for a picture rule 3 already draws, except where calls overlapped.

## 8. The Mermaid sequence reader and writer (S10)

`src/readers/mermaid-sequence.js` has `readMermaidSequence(text) → { model, report }` and `writeMermaidSequence(model, viewId?) → text`, internal like the class reader. It is written against Mermaid 12.3.0's sequenceDiagram page, in the same way as the class reader: hand-written and linear, with a 1 MiB limit (R2), ids from names (R3), and it never throws. `umlimator.py import` routes a `sequenceDiagram` to it through Node (R7).

| Mermaid | Read as | Report |
|---|---|---|
| `participant A`, `participant A as Name`, `actor A` | A `uml.Lifeline` with its id from `A` and the alias as its label. An actor gets `stereotypes: ['actor']` | |
| `participant A@{ "type": … }` | The type as a stereotype | approximated |
| `create participant B`, then a message to B | That message gets `sort: 'create'` | |
| `destroy B`, then a message to B | That message gets `sort: 'delete'`. A message from B is kept as written, and its stem is not ended | skipped (the destruction) |
| `->>` | call | |
| `-->>` | reply, with `replyTo` the latest unanswered call from the reply's receiver to its sender. A call answered only in another operand of an `alt` counts as unanswered | approximated when no call is found |
| `-)` | async | |
| `--)`, `->`, `-->`, `-x`, `--x`, `<<->>`, `<<-->>` | async, call, reply, async, async, call, reply | approximated, saying what is not drawn |
| `+`, `-`, `activate`, `deactivate` | Nothing: activations are derived | approximated where they disagree with the derived bars |
| `alt`/`else`, `opt`, `loop`, `par`/`and`, `break` … `end` | Fragments, and operands whose text is the guard. Ids are `<operator>-<n>` for fragments and `<fragment>.<k>` for operands | |
| `critical`/`option`, `rect` | Their content, with no frame | approximated / skipped |
| `Note …` | Not read, unless it follows the writer's `%% use:` comment (below) | skipped |
| `autonumber`, `box`, `link`, `links`, `accTitle`, `accDescr`, styling, `%%{init}%%` | Not read | skipped |
| `title`, or `title` in front matter | The view's title | |
| `%% id: <id>` above a statement | That element's id, in place of the derived one | |
| An arrow or line the reader does not know | Not read | skipped |

Message ids are `<from>-<to>`, then `-2`, `-3` and so on for each pair. Inserting a message renames only the later messages of its own pair.

The writer:

- writes lifelines as `participant` or `actor`, with `as` for the label;
- writes `create participant` and `destroy` before their messages;
- picks each arrow by the message's sort;
- writes fragments with their guards;
- writes an interaction use as `Note over <first>,<last>: ref <label>`, under a `%% use: <id> refersTo=<id>` comment. Its covers are contiguous, so the first and last lifelines say everything;
- puts `+` on a call that has a reply and `-` on its last reply, so Mermaid draws the main bars;
- writes `%% id: <id>` above any lifeline, message, fragment or operand whose id the reader would not derive, as the class writer does;
- keeps what Mermaid cannot carry in `%% not written:` comments, as the class writer does.
- as 3.6 built it: `%% operand-id: <id>` above a fragment's opening line names its first operand, which that line
  starts; `%% reply-to: <call>` above a reply names a call the reader's matching would not find; `%% represents: <type>`
  above a participant is its `represents`, and its alias shows `<label> : <type>` for Mermaid to draw, split at the
  first colon only under that comment; a space at either end of a text is written `#32;`, which the reader's trim keeps.
  The reader reads `par_over` as `par`, reported.

`read(write(model))` equals the model on the subset, ids included. `tests/import/sequence.mmd` holds every construct on Mermaid's page and pins the report (R4).

## 9. Fixtures

These come from `risks.md` §6 T and G3, and from the spike. Each lives in `tests/` and is laid out in Node and in Chrome, under three fonts and both themes. It must have no overlap, no text overflow, no line through a head, and no label under a bar.

| Fixture | Case | Shows |
|---|---|---|
| `sequence-minimal.json` | Two lifelines, a call and its reply | |
| `sequence-stress.json`, view `edge-cases` | A self-message | A loop to a nested bar |
| | A call inside a call on one lifeline (re-entrant) | A second bar inside the first (rule 5) |
| | A reply with no call | Dashed, from the stem; warning `reply-call` |
| | A `create` | The head lowered to its arrow |
| | A `delete` | The stem ends in a cross |
| | An operand with no messages | One empty row; warning `empty` |
| | A fragment inside a fragment | Inset 10 px; tags clear of each other |
| | An interaction use across two lifelines | Its box over those two only |
| | A lifeline no message touches | Its stem at full height |
| | Replies to one call in two operands of an `alt` | The bar runs across the divider to the last reply |
| | A lifeline created in one operand (spike risk 4.5) | Its stem runs through the other operand. Accepted, and stated in the conformance note |
| | A bar across a guard (spike risk 4.3) | The guard drawn over the bar, on its backing |
| | A long lifeline name (spike risk 4.10) | Cut at 320 px |
| | A fragment with nothing in it | A header and one empty row per operand at its parent's end; warning |
| `sequence-stress.json`, view `all` | 20 lifelines, 200 messages, 10 nested fragments (the spike's) | P1 |
| `communication-minimal.json` | Two lifelines, a connector, a call and its reply | |
| `communication-stress.json`, view `edge-cases` | Two messages each way on one link (G3); a self-message on a self connector; six messages on one link; a lifeline with no connector | |
| `communication-stress.json`, view `all` | 20 lifelines, 30 connectors, 200 messages | P1 |

Each validator also has a passing and a failing fixture in its test. "Timing changes at the same instant" belongs to stage 6. Examples 11 and 12 move to `examples/checkout-sequence.json` and `examples/checkout-communication.json`, and join the gallery and CI.

## 10. Performance (P1)

| Fixture | Budget, enforced in Node (best of three) |
|---|---|
| `sequence-stress.json`, view `all` | Layout plus SVG markup under 100 ms, since every edit lays a sequence out again |
| `communication-stress.json`, view `all` (up to 50 layout nodes: 20 lifelines and 30 stacks) | Full layout under 1 s. Any one message edit (add, rename, reorder), layout plus SVG markup, under 100 ms |
| Helpers and the reader | Under 100 ms for 200 messages each |

- A message edit on a communication view changes a stack's size, so it lays the view out again. It is the common edit, so P1's 100 ms applies to it, not the 1 s for a full layout. A 40-class view lays out in 65 to 90 ms today, so this is the tight budget. 3.5 does not merge until it holds.
- Browser timings under headless virtual time prove nothing, as 1.11 found.
- A type with `layout.run` and `pins: false` needs no layered ranking. 3.4 checks that `buildGeo` does not run `autoPos` for it (Q9).

## 11. Work packages

Each work package is one pull request. "Owns" lists the only files that package changes while it is open. The lead updates `docs/diagrams/README.md`'s status table after each merge, as in 1.11 (X7). No lane edits it.

| # | Work package | Owns | Needs | Done when |
|---|---|---|---|---|
| 3.0 | **List the files** (the lead). Add the stage's seven sources as empty files, listed in `ALL` in load order: `layout/timeaxis`, `uml/frame`, `uml/interaction`, `uml/sequence`, `uml/communication`, `uml/convert`, `readers/mermaid-sequence` | `tools/build.mjs`, the seven empty files | This note; the core diet merged (it edits `tools/build.mjs` too) | `lib/umlimator-all.js` changes by blank lines only, and no stage 3 lane edits `ALL` again |
| 3.1 | **Interaction semantics.** The occurrence walk (operands by `parent`); activations by the five rules; message numbers (S8); reply matching (§5.2's rule); the shared validators | `src/uml/interaction.js`, `tests/interaction.test.mjs` | 3.0 | Each of the five rules and each shared validator has a passing and a failing test. Example 11 gives exactly these bars: storefront m1 to m10; api m2 to m9; api m3 at depth 2, one short step; payments m4 to m8, across the divider. Example 12 gives §6.3's numbers |
| 3.2 | **Time-axis layout and frames.** §3.2's contract, and the shapes `lifeline`, `frame`, `operand` and `use` | `src/layout/timeaxis.js`, `src/uml/frame.js`, `tests/timeaxis.test.mjs`, `tests/timeaxis.html` | 3.0 | Hand-built inputs for every T case lay out clean in Node and in Chrome, under three fonts and both themes. There is one slot per gap and per operand end, and no two slots share a `y`. Every stem gap covers its message's row and loop. 200 rows lay out in under 5 ms |
| 3.3 | **The sequence type.** §4, with §5's hooks: definition, `run`, `draw`, `geo.order`, validators, `refs`, `items`, names, `describe()`, legend. The stand-in type in `tests/spike-sequence.test.mjs` is replaced by the real one, and `check.mjs` calls it (spike risk 4.8) | `src/uml/sequence.js`, `tests/sequence.test.mjs`, `tests/sequence.html`, `tests/spike-sequence.test.mjs`, `docs/diagrams/examples/check.mjs` | 3.1 and 3.2; 3.4 for testing gestures in the browser | Definition of done 4, 5, 6 and 8 on §4's subset. Every gesture in §5.2 is tested by pointer and by keyboard through `apply()`. A click on a message's arrowhead, and on a self-message's loop, selects the message. Tab from the first head reads example 11's heads, then its occurrences in time order. A 30-step session undone, redone and reopened gives byte-identical models. Example 11 lays out clean |
| 3.4 | **Canvas hooks.** §5.1's hooks and canvas changes: self lines; key rings on typed lines (spike risk 4.7, class diagrams included); `geo.order`; lines in the selection; `L` from a line; `elementsOf()` and the member list with fragments; no pin when `pins: false`; no `autoPos` for `pins: false` | `src/canvas/edit.js`, `src/canvas/render.js`, `src/draw/svg.js`, `src/map/context.js`, `tests/type-hooks.html`, `tests/typed-edit.html` | The core diet, with `edit.js` out of the core; no open stage 2 package that owns these files | Each hook is called by pointer and by keyboard on a stand-in type that has a palette. Maps are unchanged (geometry hashes, stills, `tests/edit.html`). A class view's picture is unchanged except for its key rings. The pull request gives the core's size before and after, within stage 3's share (S14) |
| 3.5 | **The communication type.** §6, with S7's stack nodes | `src/uml/communication.js`, `tests/communication.test.mjs`, `tests/communication.html` | 3.1; 3.4 for testing gestures in the browser | Definition of done 4, 5, 6 and 8 on §6's subset. No message row overlaps anything in the fixtures, and no connector runs through another element. §10's budgets hold |
| 3.6 | **Mermaid sequence reader and writer.** §8, with `import` routing a `sequenceDiagram` to it | `src/readers/mermaid-sequence.js`, `tests/mermaid-sequence.test.mjs`, `tests/import/sequence.mmd`, `umlimator.py`, `umlimator_import.py`, `tests/import.py` | 3.0; `model.md` row 11 only | `read(write(model))` equals the model, ids included, for example 11 and for 500 generated models. The report is pinned. Reading the same source twice gives the same ids |
| 3.7 | **Helpers.** §7 | `src/uml/convert.js`, `tests/convert.test.mjs` | 3.1; 3.3 and 3.5 for its last check | Example 11 with `{ f1: 'f1-paid' }` gives example 12, except for ids. The numbered view in `examples/bookshop.json`, a numbered view with no `edges` list, and a trace give views that validate with no error, and no id contains `->` |
| 3.8 | **Fixtures, examples, docs, CLI.** §9's files; examples 11 and 12 moved, with `check.mjs`'s list; `upstream_view()` drops items with no ends (F3: today `validate_map` reports f3 as "an unknown end"); `umlimator.py trace --diagram uml.sequence`; `render`, `check`, `stills` and `pdf` on both types; the schema and `.d.ts` (the elements, not the helpers); every document in `plan.md` §7; `docs/conformance/uml-sequence.md` and `uml-communication.md`; the release notes the lanes wrote in their pull requests, gathered into `docs/module-api.md` | `examples/`, the `tests/*.json` fixtures, `tests/cli.py`, `umlimator.py`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, docs | 3.3, 3.5, 3.6, 3.7 | Definition of done 1, 2, 3, 7, 9, 10, 11 and 12 for both types. `check` passes on both examples. For item 7, the PDF has per-type tables (R8), or the fidelity table lists the gap. Both examples are in the gallery and CI |

### 11.1 Lanes

```
diet ─▶ 3.0 ──┬─▶ 3.1 semantics ──┬─▶ 3.3 sequence ──┬─▶ 3.7 helpers ──┐
              ├─▶ 3.2 time axis ──┘                   │                 │
              ├─▶ 3.4 canvas hooks ───────────────────┴─▶ 3.5 comm. ────┼─▶ 3.8 fixtures, docs ─▶ 0.20.0
              └─▶ 3.6 Mermaid reader ───────────────────────────────────┘
```

- Four lanes run once 3.0 has merged: 3.1, 3.2, 3.4 and 3.6, each in its own worktree.
- Only 3.4 touches the core.
- 3.3 and 3.5 are written against 3.1's and 3.2's contracts, and test their gestures in the browser once 3.4 has merged. 3.5 needs no core change (S7).
- `umlimator.py` passes from 3.6 to 3.8, and `check.mjs` from 3.3 to 3.8; neither pair is open at the same time.
- Lanes write their release notes in their pull request descriptions, and 3.8 gathers them, so no two lanes edit `docs/module-api.md`.
- The lead rebuilds `lib/` after each merge of `main` and never merges built files by hand (X2).
- One reviewing agent that did not write the code checks each pull request against the definition of done.

### 11.2 Order with the core diet and stage 2 (S11, S12)

Files stages 2 and 3 may both touch: `tools/build.mjs` (3.0), `src/canvas/edit.js`, `render.js`, `src/draw/svg.js` and `src/map/context.js` (3.4), `umlimator.py` (3.6, 3.8), and the docs (3.8). Stage 2's lanes add their own `ALL` entries; the lead merges `tools/build.mjs` between them.

| Option | For | Against |
|---|---|---|
| **(a) 3.0 after the diet, the other lanes after 3.0. A stage 3 package that owns a file a stage 2 package has open waits for that merge. 0.20.0 ships after 0.19.0 (recommended)** | Most of stage 3 runs alongside stage 2, and each shared file changes in one place at a time. With S7's (d), stage 3 does not wait for stage 2's layout work | Browser tests of 3.3 and 3.5 wait for 3.4, which may wait for a stage 2 package |
| (b) Stage 3 starts after 0.19.0 | No overlap at all | Lanes sit idle |
| (c) Stage 3 before stage 2 | Sequence diagrams arrive sooner | Releases come out of order |

## 12. The release

0.20.0 follows the repository's rule. It ships after 3.0 to 3.8 have merged and both types meet the definition of done. The release bumps `package.json` and adds the `## 0.20.0:` section to `docs/module-api.md`, and the maintainer approves the pull request by number. Then `map-repo`'s pin moves, as it did for 0.17.0. The skill does not write sequence diagrams in this release.

C10 (S15):

| Option | For | Against |
|---|---|---|
| **(a) Deferred to one package after 0.20.0, covering class, sequence and communication: a test with one typed model each for the MCP server, the `map-repo` skill and the diff Action, and per-type `paths()` and `diff()` writers. The README says so (recommended)** | One piece of work for three types; 1b deferred it too | Until then, a reorder of messages reads as "changed" in `diff()`, not "moved" (M11), and sequence edits are mostly reorders |
| (b) In 3.8 | C10 holds at 0.20.0 | Per-type diff writers need a registry hook, which is core work this stage has no room for |

L12 does not apply to stage 3: lifeline heads, frames, uses and message stacks are boxes. It stays for stage 4.

## 13. Left out of the subsets

Sequence (`proposal.md` §8.5):

- gates;
- continuations;
- state invariants;
- time and duration constraints (stage 6);
- found and lost messages;
- the seven other operators (`critical`, `neg`, `assert`, `strict`, `seq`, `ignore`, `consider`), which are drawn by name with a warning;
- general ordering;
- coregions;
- lifeline decomposition;
- an actor drawn as a figure (`«actor»` is shown as text);
- parsed message signatures (a label is text);
- an interaction use that opens its view (stage 4);
- notes in a sequence view;
- message numbers in a sequence view (`autonumber`);
- hiding a message.

Communication:

- guards and iteration beyond plain text;
- concurrent numbers (`1a`, `1b`);
- multi-objects;
- messages drawn beside the link (they sit on it, S7);
- one message shared by two communication views in different orders (each view numbers its own messages).

Both: XMI; references by id to classes (`represents` is text, M8); copy and paste (E7); the helpers as public API (S9).

## 14. What this note changes elsewhere

- **`model.md`.** Rows 11 and 12 point here. Row 12 says that only the messages' order in `edges` means anything, and gives §6.3's numbering. Row 11 adds that a fragment's content is one run in `edges`, operand by operand in `members` order. §3's three sequence rows link this note.
- **`notes/spike-sequence.md`.** It gains a line at the top saying where this note departs from it:
  - `frame()` lives in `src/uml/frame.js`, and `kit` is unchanged (S2);
  - `layout.directions` and `layout.bake` are dropped (§4.1);
  - frames and stems are hit as nodes, and a stem's strip is cut around messages (S2, S3);
  - `edits.add` and `edits.remove` are new hooks, and `wraps` is a new field (§4.1);
  - slots gain `after`, and geometry gains `geo.order` (§3.2, S13);
  - the refusal in its §3 waits for the reference store (D7), which no stage builds yet (S5).
- **`plan.md`.** §5's stage 3 row points here. §4.3 lists `src/layout/timeaxis.js` as built in `ALL` only.
- **`proposal.md`.** D7's row notes that the reference store has no stage yet (S5).
- **`risks.md`.**
  - C7 points to §7.
  - C10 states the deferral (S15).
  - E9 and E10 point to §5.2 and §5.4.
  - L4 gains the communication stack (§6.2).
  - L12 says it does not apply to stage 3.
  - P1 gains the communication message edit (§10).
  - There are three new rows: deleting an operand (Q1), self lines by gesture (Q4), and a node's hit area over lines (Q8).
  - The spike's risks 4.3 to 4.10 close in 3.2 to 3.4.
- **`README.md` in this folder.** The status table shows this note and stage 3's work packages, and the lead records the diet's freed bytes and their split (S14).
