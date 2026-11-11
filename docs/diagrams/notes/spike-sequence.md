# Sequence spike (work package 1.12): what the registry and the model must change

Status: **findings**, 11 Nov 2026, against `main` at 555bfdc (0.17.0). The spike's code is on the scratch branch
`sequence-spike` under `spike/` and is never merged. This list is the deliverable: it is applied to
`src/core/registry.js`, `model.md` and `src/core/apply.js` before the registry's API is documented (`plan.md` §4.2,
`risks.md` X5). The stage 3 note settles the sequence type itself; the decisions marked **recommended** here are the
maintainer's to take.

## 0. What was built, and what it showed

- `spike/sequence.js` (about 170 lines): a time-axis layout, `layoutSequence(model, viewId)`, and a draw hook,
  `drawSequence(geo)`, registered as `uml.sequence` through the real `registerDiagramType()`. Lifelines are columns in
  `nodeIds` order, each gap as wide as the widest label of a message across it; messages are rows in `view.edges` order;
  activations are derived; combined fragments frame their operands' messages, with a divider and a guard per operand and
  nesting inset 10 px a level; the interaction use is a `ref` frame over the lifelines it covers; a self-message is a
  loop to a nested bar; a reply is dashed; `create` lowers the created lifeline's head to its arrow; `delete` ends the
  stem with a cross.
- It reuses what 1a built: the heads are 1.5's classifier with no compartment (`«actor»`, `name : Type`); messages are
  typed lines that `svgOf` draws with `e.end` (the `ENDS` table: `arrow` for a call, `open` for async, reply and
  create, `dashed` for reply and create) and their `lbl`; `measured()` and `hostMeasure()` for text; `apply()`,
  `references()`, `validate()` and `layout()` for the probe.
- `spike/sequence.html` draws `docs/diagrams/examples/11-sequence.json`, and the same with a `delete` added
  (`spike/fixtures.mjs`), in headless Chrome, in both themes. It reads: two frames, one use, four bars, the `validate`
  self-call nested on `api`'s bar, `payments`' bar running across the `else` divider to the declined reply, `receipt`'s
  head at the `new(order)` arrow, the cross at `dispose()`. No message label overlaps another or a frame's text.
- `spike/run.mjs` prints the geometry and lays out a stress view (20 lifelines, 200 messages, 10 nested fragments):
  **0.8 ms** a layout in Node, against about 175 ms for a 40-node layered view. Nothing is routed.
- `spike/probe.mjs` puts the real core in front of a sequence view. Its output is the evidence below (P1 to P12).

Rerun: `node spike/run.mjs`, `node spike/probe.mjs`; `python3 -m http.server` at the root and open
`/spike/sequence.html?theme=light` (or `dark`).

### Evidence

| # | What was run | What came back |
|---|---|---|
| P1 | `registerDiagramType('uml.sequence', …)`, then `layout(model, 'checkout')` | The map's layered path: 5 cards in 4 columns, **4 lines for 10 messages** (`prepEdges` merges a pair's lines; the self-message is dropped). Nothing in `src/` calls a type's layout; `layoutTyped` is called by tests only |
| P2 | `validate()` on the example | No problem. It does not know an operand's messages must be contiguous (`examples/check.mjs` does), nor any sequence rule |
| P3 | `geometryKey` | Reads `layoutGraph`'s input (`dg`), not a view: unusable for a strategy that has no `dg` |
| P4 | `add { element: message with parent, view, index: 7 }` | The message goes to **`model.edges`**, its id into `view.edges` at 7: a sequence view now mixes inline messages and a model edge |
| P5 | `[move m7 to index 7, reparent m7 to f1-declined]` | Applies. Laid out: **f1 drawn as two frames**, because f3 (`after: m7`, parent `f1-paid`) followed m7 into the declined operand; f2 left with no content |
| P6 | `delete m7`; `references(m, 'm7')` | f3 keeps `after: "m7"`, now naming nothing, and is not drawn. `references()` lists nothing for m7 |
| P7 | `delete m4` | m5 and m8 keep `replyTo: "m4"` |
| P8 | `delete f2` (unwrap the opt) | m7 loses its `parent` and goes to the top level, though it lies inside `f1-paid` in time: f1 drawn as two frames |
| P9 | `delete receipt` | Its messages go (right); f3 keeps `covers: ["api", "receipt"]` |
| P10 | `add { element: a combined fragment, view }` | It lands in **`model.nodes` and `view.nodeIds`**, not `view.fragments` |
| P11 | `move { id: 'f3', view, index: 2 }` | Refused: `"f3" is not in view` (a fragment is looked for in `nodeIds`) |
| P12 | `hide { id: 'm1', view }` | Refused: it lives only in the view; delete it. Right for a message |
| R1 | Frames, then stems, then bars, in one layer under the lines | The `[else]` guard and the `ref` tag were hidden under activation bars until the texts moved above the bars |
| R2 | Laid out inside `measured(hostMeasure(el))`, drawn outside it | Heads cut to "storefront : Sto…": the classifier sized by the font, then cut by the estimate |

## 1. What a type's definition must hold when it does not use the layered layout

Today a definition holds `elements`, `lines` and `props` (read by 1.7's panels) and nothing reads anything else.
Proposed, all optional, with the map's and the layered types' behaviour as the default:

```js
registerDiagramType('uml.sequence', {
  title: 'sequence diagram',
  layout: {                                   // 1.1: the strategy; absent: the layered layout (layoutTyped)
    run(model, view, ctx) { return geo; },     //   ctx: { measure } ; geo: svgOf's input (below) plus the type's own fields
    key(model, view) { return string; },       // 1.2: what moves geometry; absent: JSON of the view and its elements
    pins: false,                               // 1.6: view.layout pins mean nothing; drag and Alt + arrows do something else
    directions: ['down'],                      //      the only direction it draws; any other: drawn so, with a warning
    bake: false,                               //      the CLI bakes no row order into it (risks.md F4)
  },
  draw(geo, kit) { return { under, over }; },  // 1.3: markup under svgOf's lines and over its nodes; kit: { esc, r2, textW, frame }
  items: ['uml.InteractionUse'],               // 1.8: entries of view.edges that are not lines (model §2.1)
  refs: { 'uml.Message': { 'props.replyTo': 'cascade' }, 'uml.InteractionUse': { 'props.covers': 'drop' } }, // 1.7
  validate(model, view) { return problems; },  // 1.9: [{ level, path, message }], joined into validate()
  edits: {                                     // 1.6: gestures that are the type's, each returning a transaction
    connect(model, view, from, to, at, line) { return commands; },   // at: a slot from geo.slots
    moveTo(model, view, id, at) { return commands; },
    wrap(model, view, ids, operator) { return commands; },
  },
  elements: [{ type: 'uml.Lifeline', label: 'Lifeline' }],
  lines: [{ type: 'uml.Message', label: 'Call', props: { sort: 'call' } }, /* async, reply, create, delete */],
  props: { 'uml.Message': [{ key: 'sort', label: 'Sort', kind: 'enum', options: ['call', 'async', 'reply', 'create', 'delete'] }] },
});
```

### 1.1 `layout.run`: the strategy, and the dispatch to it

- **Signature:** `run(model, view, { measure }) → geo`, no DOM. `geo` is what `svgOf` takes:
  `{ nodes, edges, groups: [], bounds, byId, map: false }`, each node with `x, y, w, h, shape`, each line with `pts`,
  `end`, `lbl`, `s`, `t`; plus fields the type's own `draw` and the canvas read (`seq` in the spike: stems, bars,
  frames, uses, crosses, slots, problems). The layout returns its problems in the geometry, not by `warn()`, so the
  canvas can list them with their elements.
- **Dispatch (P1):** `mapContext.buildGeo(vid)` and `layout()` must ask `diagramOf(view)` first and call
  `T.layout.run(D, view, { measure })` when the type has one; a typed view of a type without one takes `layoutTyped`;
  a map takes today's path. Without this, **registering a type changes its views from "plain cards with a warning" to a
  wrong map** (4 lines for 10 messages). The same holds for 1.9: nothing calls `layoutTyped` from `layout()` or
  `render()` yet, so the class type's pull request must carry the dispatch, and a type is registered only in the same
  change as its layout.
- **Inside `withM` (R2):** `mapContext` already wraps `buildGeo` and `drawView` in the host's measure; the type's
  `run` and `draw` must be called from inside those two, never beside them.

### 1.2 `layout.key`: the geometry key

`geometryKey` (P3) keys `layoutGraph`'s input. A sequence's geometry moves with things that are `props` or not in
that input: `view.edges` order, a message's `parent`, `props.sort` and `props.replyTo` (bars), a fragment's operator
and guards (frame widths), a lifeline's `label`, `props.represents` and `props.stereotypes` (head size). So the key is
the type's: `key(model, view) → string`. Its default for a strategy that is not layered: the JSON of the view and of
the nodes it lists. The memo matters less here: a time-axis layout takes under a millisecond for 200 messages, so a
type may give no key and be laid out on every change (P1's 100 ms budget is far away). Keep the memo for the layered
types (F7).

### 1.3 `draw`: the type's layers

`svgOf` has no layer for a stem, an activation bar, a frame, an interaction use or a destroy cross; the spike spliced
markup into its output. Needed:

- `draw(geo, kit) → { under, over }`: `under` goes after the families and lanes and before `<g class="edges">`;
  `over` after the nodes, before the labels. One layer is not enough (R1): frames' outlines go under the bars, their
  tags and guards over them, each on a backing in the stage's colour.
- `kit` gives `esc` (every model text goes through it, S1), `r2`, `textW`, and a shared **`frame(x, y, w, h, tag,
  dividers)`** helper, UML's frame with its pentagon tag: combined fragments, interaction uses, and later the
  interaction overview's inline interactions, state regions and activity partitions use it. It lives in a family file
  (C5), not `src/draw/`.
- `svgOf` special-cases `n.shape === 'classifier'` by name. Make it `SHAPE[n.shape] && SHAPE[n.shape].draw`, so a
  family adds a shape (a lifeline head with an actor figure, later) without touching `svg.js`.
- Accessibility: `svgOf` gives map lines a keyboard target (`.line-key`) and typed lines none (`if (map)`). A sequence
  is read message by message, in time order; the class diagram needs focusable lines too. Typed lines need a key ring
  each, named by the type: `name(line) → "Message 3 of 10: api to api, validate(order), call"`.

### 1.4 Hit areas

The canvas hit-tests `.node[data-id]` (the head only) and `.edge-g[data-i]`. A sequence also needs:

- a lifeline's stem and its bars as part of the lifeline (a message is drawn between two stems, at any height), at
  least 24 px wide (E8): `data-id` on the stem's group and a wide transparent stroke;
- frames, operands and uses selectable: `data-id` on each, as the spike draws them;
- **slots**, the places a new or moved message can go: `geo.slots: [{ index, y, parent }]`, `index` into
  `view.edges`, `parent` the operand at that height. The spike returns one per message; the type needs one between
  every two occurrences and one at each operand's start and end, empty operands included.

### 1.5 Editing gestures and their commands

What 1.7's gestures do on a sequence view, and what the type must give:

| Gesture (1.7) | Today | A sequence needs |
|---|---|---|
| Drag a card, Alt + arrows | Sets a `layout` pin | `pins: false`. Alt + Up/Down moves a message one slot (`edits.moveTo`); Alt + Left/Right moves a lifeline in `nodeIds` (`move { id, view, index }`, which works today) |
| Connect (drag, `L`) | `add` with `view`, no index, no parent: a model edge at the end (P4) | `edits.connect(model, view, from, to, at, line)` → `[{ op: 'add', element: { …, parent: at.parent, props: line.props }, view, index: at.index, in: 'view' }]` |
| Relationship picker | Copies `type` only from a `lines` entry | Entries carry `props` (`{ type: 'uml.Message', label: 'Reply', props: { sort: 'reply' } }`) and the new line takes them; a reply also takes `replyTo`, the open call it answers |
| Drag a message up or down | None | `edits.moveTo` → `[move { id, view, index }, reparent { id, parent }]` (P5: both commands exist) |
| Wrap a selection | None | `edits.wrap(model, view, ids, operator)` → `add` a fragment into `view.fragments`, `reparent` each selected occurrence to its first operand, the fragment's `parent` the operand they shared |
| Delete, Shift + Delete | An inline line is deleted (it lives in the view) | Right as it is (P12) |

`edits` is a hook that returns commands, so `edit.js` stays generic: it finds the slot under the pointer or the key and
emits what the type returns.

### 1.6 `refs`: what a type's properties name

`references()` and `delete` see ends, parents, parts and view lists, never `props` (P6, P7, P9). A type declares
which of its properties name elements, and what deleting the named element does:

```js
refs: { 'uml.Message': { 'props.replyTo': 'cascade' },      // the reply goes with its call
        'uml.InteractionUse': { 'props.covers': 'drop' } },  // the id leaves the list; an empty list: a warning
```

`references()` reports them with `kind: 'prop'`; `delete` cascades or drops. The same declaration feeds the generated
JSON Schema (M10) and replaces `examples/check.mjs`'s hand list `REF`/`REFS`.

### 1.7 `items`: occurrences that are not lines

With §2.1's choice, `view.edges` holds interaction uses too. The core reads an inline entry of `view.edges` as a line
in three places: `typedProblems`' `ends()` (an error: no `from`), `apply`'s `index()` (kind `edge`, which is what
`move` needs, so it stays) and `edit.js`'s `elementsOf()`. A type lists its item types in `items`; `ends()` passes
over them, and the map path's `viewEdges` already drops entries without ends.

### 1.8 `validate`

`validate()` runs the type's rules after the typed core's: `validate(model, view) → [{ level, path, message }]`. For a
sequence, from the spike: an operand's occurrences are contiguous (moved here from `check.mjs`); a message's `parent`
is an operand of this view; a reply goes back along its call (the stress fixture's bad replies were caught by the
layout, which should not be where it is found); `replyTo` names a call of the view, and two replies to one call lie in
different operands of one `alt`; a lifeline is created at most once, before any other message to it, and deleted at
most once, after its last; `covers` names lifelines next to each other in `nodeIds` (risk 4.4); an operand or fragment
with nothing in it is a warning (E9, E10).

## 2. What `model.md` must change

### 2.1 The order of things that are not messages (§3, "1 (spike), 3")

**Recommended: one ordered list.** A sequence view's `edges` lists its occurrences in time order: messages and
interaction uses, inline (later state invariants and continuations, if a subset takes them). `props.after` goes.
Combined fragments and their operands stay in `fragments` and take their place from what they hold.

Why, from the spike:

- **Moving a message drags what is placed after it** (P5): f3 followed m7 out of its operand, and f1 broke in two.
  With one list, f3 keeps its place.
- **Deleting a message strands what is placed after it** (P6): f3 named nothing and was not drawn; `references()` did
  not see the link. With one list there is no link.
- **`after` cannot say "first in this operand"**: the message before an operand's first item lies outside the
  operand, and an item after it ties with the operand's own first message. `after: null` puts an item at the top of
  the interaction, outside its own operand. Ties among items after one message are settled only by the order of
  `fragments`, a second list in disguise.
- **Every edit is a list edit:** insert at a time position is `add … index`, move is `move { id, view, index }` (which
  works on `view.edges` today and refuses a fragment, P11), and no command keeps two lists in step.
- The cost is small: `view.edges` stops being lines only in a sequence view (§1.7), and the layout's walk is one pass
  over one list. The rejected alternative, `after` kept with a type hook that re-points it on every delete and move,
  needs the hook, a validation that `after` and `parent` agree, and a tie rule.

An operand with nothing in it keeps one empty row in its fragment, between its siblings (the spike draws it so). A
combined fragment with nothing in any operand has no place in time: a warning, drawn at the end of the operand or
interaction that holds it, until something is moved into it.

### 2.2 Inline messages or model edges a communication view shares (§3, "3")

**Recommended: inline, as the draft has it.** A sequence view's messages live in its `edges`; no other view shares
them, which also settles `risks.md` M12 (two views never order one message).

- An operand is a member of a fragment of one view, and a message's `parent` names it: a model edge would be a model
  element owned by a view's member.
- The communication example shows the accepted path only (`12-communication.json`): a communication view cannot show
  both operands of an `alt`, so it could share at most some of the messages, and its numbers would skip.
- Hiding a message from its own sequence (P12) means nothing; deleting it does.
- Today's commands create model edges (P4); `add … in: 'view'` (§3) is the one change inline messages need.

A communication view keeps its own messages (row 12, as drafted). A helper that makes one from a sequence view, for a
chosen operand of each `alt`, copies them with new ids (stage 3).

### 2.3 Self-messages and re-entrant calls: how activations nest (§3, "3")

**Recommended: derived, by intervals, never stored (rule 9 holds):**

1. A `call` opens an activation on its receiver at its own row; a self-call opens it where its loop comes back.
2. It closes at the last reply whose `replyTo` names it. Replies in different operands of an `alt` all close it: the
   bar runs to the last (the spike's `payments` bar crosses the `else` divider to `declined`).
3. With no reply, a self-call returns at once (its bar is one short step); any other call returns when its caller next
   sends a message, after the receiver's own last message before that.
4. `async`, `create` and `delete` open none. A reply or a message sent from a lifeline with no open bar leaves its stem.
5. Depth: an activation is nested in each of its lifeline's activations that contain it; each level is drawn 6 px to
   the right. A re-entrant call (A calls B, B calls A) is a second bar on A inside the first, by the same rule.

Why not a call stack (one thread of control, each message sent from the top of the stack): in the example, `api`
self-calls `validate(order)` with no reply, then calls `charge(total)`. A stack reads `charge` as sent from inside
`validate`, and `validate`'s bar runs to the reply to `place` (m9), which is not what the example means. Rule 3 draws
it as meant. A writer who wants a self-call to hold later messages gives it a reply. A reader of a notation with
explicit activations (Mermaid's `+`/`-`) maps a deactivation to a reply where one is written, and reports the rest as
approximated (R1).

### 2.4 Other edits

- Rule 8: in a sequence view `edges` orders the view's occurrences (messages and interaction uses).
- Rule 10: `layout` pins mean nothing in a sequence view (warned, not drawn), and `direction` is `down` only.
- Row 11: interaction uses are inline in `edges`, with `parent` and `props.covers` and `props.refersTo`; no
  `props.after`. `replyTo` may be named by several replies only across the operands of one `alt`. `covers` lists
  lifelines next to each other in `nodeIds`. A lifeline is created and deleted at most once.
- §3: the three sequence rows point to this note, settled when the stage 3 note adopts it.
- `examples/11-sequence.json`: f3 moves from `fragments` into `edges` after m7, without `after`; `check.mjs` loses
  `after` from `REF` and checks interaction uses for contiguity with the messages.

## 3. Commands a sequence needs that 1.6 lacks

| Need | Today | Proposed |
|---|---|---|
| Insert a message at a time position | `add` with `view` and `index` puts the element in `model.edges` and its id in `view.edges` (P4) | `add { element, view, index, in: 'view' }`: the element itself goes into the view's own list for its kind: a line or an item into `view.edges` at `index`, a fragment into `view.fragments`, a node into `view.nodes`. `in: 'model'` stays the default |
| Add a fragment (wrap a selection) | Lands in `model.nodes` and `view.nodeIds` (P10) | The same `in: 'view'`, with a fragment |
| Move a message across an operand (E9) | `[move { id, view, index }, reparent { id, parent }]` applies (P5) | No new command. The type's `edits.moveTo` emits both from the slot it lands in; with §2.1, nothing else moves with it |
| Move an interaction use in time | Refused (P11) | Works once uses are in `view.edges` (§2.1) |
| Unwrap: delete a fragment | Its content loses `parent` and goes to the top level (P8) | `delete` gives what stays (lines, fragments, items) the deleted owner's own `parent`, its nearest surviving ancestor, not none |
| Delete a call, a lifeline (E10) | `replyTo`, `covers` left naming nothing (P7, P9) | The type's `refs` (§1.6): replies go with their call; a deleted lifeline leaves `covers` |
| Refuse an edit that breaks a type's rule | `apply()` checks the core only | The reference store runs `validate()` after `apply()` and refuses the transaction with the type's problems (E12); `apply()` stays type-agnostic |

## 4. Risks found

| # | Risk | What to do | When |
|---|---|---|---|
| 4.1 | Registering a type without dispatching to its layout draws its views as a wrong map (P1), worse than today's plain cards | The dispatch (§1.1) lands with the first registered type, in 1.9, before or with `uml.class` | 1.9 |
| 4.2 | 1.7's connect gesture creates model edges in a sequence view (P4); one view then mixes inline and shared messages | `add … in: 'view'` and `edits.connect` before the sequence type registers | 3 |
| 4.3 | A type's layers drawn in the wrong order hide text (R1) | Two layers (§1.3); the notation test draws a bar across a guard in both themes | 3 |
| 4.4 | An interaction use over lifelines it does not cover: in the example, f3 covers `api` and `receipt`, and its box crosses `payments` | `validate` warns when `covers` is not contiguous in `nodeIds`; the example covers `payments` too, or draws its stem over the box | 3 |
| 4.5 | A lifeline created in one operand of an `alt` has a stem through the other operand, where it does not exist | Accepted, as UML tools draw it; the conformance note says so | 3 |
| 4.6 | Layout measured in one font and drawn in another cuts text (R2) | The type's `run` and `draw` only through `mapContext`'s `withM` wrappers | 3 |
| 4.7 | Typed lines have no keyboard target in `svgOf` (map lines only) | A key ring per typed line, named and ordered by the type (§1.3); class diagram too | 1.9 |
| 4.8 | `check.mjs` and the type's `validate` drift: sequence contiguity and the property references live in the checker only | The type's `validate` and `refs` are the source; `check.mjs` calls them | 1.9, 3 |
| 4.9 | The core budget (C5, 13.5% of 15% used) | The time-axis layout, its draw hook and `frame()` go in the family file (`ALL`); only the dispatch (about ten lines) and `svgOf`'s generic shape lookup go in the core | 3 |
| 4.10 | Long lifeline names widen every gap after them | Heads are cut at the classifier's 320 px; message labels set the gaps. A 20-lifeline view is 2,800 px wide: zoom, not wrapping, is the remedy | 3 |

Not a risk any more: the time-axis layout's speed. 200 messages lay out in under a millisecond; the P1 budget and the
geometry memo are a layered-layout concern.

## 5. Order of application

1. The registry fields of §1 (`layout`, `draw`, `items`, `refs`, `validate`, `edits`; `lines` with `props`) and the
   dispatch, documented as provisional, with 1.9; `uml.class` leaves `layout` and `draw` out (layered,
   `svgOf` as it is) and gives `validate`.
2. `model.md` §2.1 to §2.4, and `11-sequence.json` with `check.mjs`, when the maintainer takes the three recommendations.
3. `apply()`'s `in: 'view'` and the re-homing delete, with tests, before the registry's API is documented.
4. The rest (`edits`, slots, hit areas, the frame helper) in stage 3's note and code.
