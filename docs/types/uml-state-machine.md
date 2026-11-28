---
title: "State machine diagram"
description: "States and the transitions between them: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# State machine diagram

<p class="ex-lead">States and the transitions between them. One bookshop order's life, from placed to delivered, cancelled or erased: the payment result chosen at a choice, picking and payment run side by side in two regions, a hold resumed by history, delivery with its problems, and the refund. The page below opens on it, <a href="/umlimator/examples/types/uml-state-machine.html#view=order-life" target="_self">An order's life</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-state-machine.html" title="State machine diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-state-machine.html" target="_self">Open full screen<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.pdf" target="_self">PDF<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.json" target="_self">Model<span class="visually-hidden"> (State machine)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>An initial pseudostate, a filled circle</li>
<li>A state with entry, do and exit rows and an internal transition (Placed)</li>
<li>A transition labelled with its trigger only (payment result)</li>
<li>A choice, a diamond, its exits guarded: [card authorised], [paid by gift card] and [else] / email the shopper</li>
<li>A fork, a bar, splitting into states in two regions (after [paid by gift card])</li>
<li>A composite state with two orthogonal regions, each named, a dashed divider between them (Fulfilling: Parcel and Payment)</li>
<li>A transition ending on a composite state's border ([card authorised] into Fulfilling)</li>
<li>An initial pseudostate inside each region</li>
<li>A transition leaving a composite state from its border (hold requested, cancel requested / refund the payment)</li>
<li>A deep history H* in the Parcel region, re-entered from On hold (hold lifted)</li>
<li>A note linked to the deep history by a dashed line</li>
<li>A self-transition with a trigger, a guard and an effect: capture failed [attempts &lt; 3] / count the attempt</li>
<li>A join, a bar, merging the two regions, then a transition with an effect only (/ hand the parcel to the carrier)</li>
<li>A composite state holding its substates with no regions (In delivery)</li>
<li>A shallow history H, re-entered when a problem is resolved</li>
<li>A state with its activities collapsed (Out for delivery, <code>present</code> <code>collapsed</code>)</li>
<li>A final state, a ring round a filled circle (parcel signed for / email the receipt)</li>
<li>A closed composite state with UML's decomposition mark, its substates not shown (Under enquiry)</li>
<li>A junction, a small filled circle, merging two transitions (refused at the door, parcel lost)</li>
<li>A state's compartment cut to two rows then &quot;+2 more&quot; (Cancelled, <code>present</code> <code>rows</code>)</li>
<li>A terminate pseudostate, an X (after 30 days / erase the shopper's details)</li>
</ol>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.state-machine'`.

| Type | Values |
|---|---|
| `UmlStateMachineElementType` | `uml.State`, `uml.Pseudostate`, `uml.FinalState`, `uml.Comment` |
| `UmlStateMachineMemberType` | `uml.Region`, `uml.InternalTransition` |
| `UmlStateMachineLineType` | `uml.Transition`, `uml.CommentLink` |
| `UmlStateProps` | `entry`, `do`, `exit`, `stereotypes` |
| `UmlPseudostateKind` | `initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate` |
| `UmlPseudostateProps` | `kind`, `stereotypes` |
| `UmlTransitionProps` | `trigger`, `guard`, `effect` (drawn `trigger [guard] / effect`), `stereotypes` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-state-machine.md -->

Release 0.21.0 (stage 4, `docs/diagrams/notes/stage-4.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below; **interchange** with Mermaid's `stateDiagram` and `stateDiagram-v2` (Mermaid 12.3.0) on
the same subset. Not XMI, and no UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.state-machine"` is a state machine diagram.
It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map
host loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 10; the example
is [`examples/order-states.json`](../../examples/order-states.json). A map's own state machines (0.14.0) are another
thing: they are the canvas's, not a diagram type.

### The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 14.2 State (simple) | `uml.State`; `props.entry`, `props.do`, `props.exit` (text) | a rounded box, its name, then one compartment of rows `entry / …`, `do / …`, `exit / …` and each internal transition; `present.collapsed: ['activities']` and `present.rows` as on a class |
| 14.2 State (composite), Region | `uml.State` with substates (their `parent` the state, or a `uml.Region` member of it) | a box when the view shows a substate: a rectangle with 10 px corners, its name in a header; with two or more regions holding something shown, each a nested box, stretched across the state, a dashed divider between; closed (no substate shown), a simple state with UML's decomposition indicator |
| 14.2 FinalState | `uml.FinalState` | a ring round a filled circle |
| 14.2 Pseudostate | `uml.Pseudostate`, `props.kind`: `initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate` | a filled circle; a diamond; a small filled circle; a bar (fork and join); a circle with H or H*; an X |
| 14.2 Transition | `uml.Transition`; `props.trigger`, `props.guard`, `props.effect` (text) | a line with an open arrowhead, labelled `trigger [guard] / effect`, cut at 280 px; one to an open state ends on its border; one to a substate crosses each border on the way |
| 14.2 Transition (internal) | `uml.InternalTransition`, a member row of the state | a row of the state's compartment, printed `trigger [guard] / effect` |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

The text of a transition is read by one parser (`src/uml/transition.js`, `notes/stage-4.md` §7): the trigger runs to the
first `[` or `/` outside brackets and parentheses, the guard to its matching `]`, the effect is the rest.
`print(parse(x))` is stable; a text the parser refuses is kept as written, and nothing is applied.

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-4.md` §10.2): `transition-ends`,
`owner-kinds`, `initial-one`, `initial-out`, `final-out`, `final-kind`, `fork-join` (a fork's targets in different
regions of one orthogonal state), `history-owner`, `history-one`, `reserved-trigger` (errors; `initial-out` and
`fork-join` warn where a diagram is only unfinished); `choice-guards` (an exit with no guard, or two `else`; a choice with
no `else` is not warned of), `composite-entry`, `region-mixed`, `region-cross`, `composite-inner` (a transition between
a composite state and a state it holds, a local transition, is not drawn), `internal-trigger`, `pseudo-kind`,
`label-syntax`, `comment-link` (a comment link with no comment at either end) (warnings).

### Left out

`notes/stage-4.md` §18: entry and exit points; connection point references; submachine states; protocol state
machines; deferred triggers; transitions on a region's border; local transitions; an internal transition drawn as a
line; the transition-oriented send and receive notation; parsed events, parameters and time triggers (text); state
invariants; a composite state's activities drawn on its box (they are in its name, `describe()`, the panel and the
PDF); the semantics of a history's default transition and of choice against junction; regions drawn in `members` order
(they are drawn in the order their first lines come). And for all four stage 4 types: XMI, copy and paste, per-type
`diff()` writers.

As built (`notes/stage-4.md` §10.4): a self-transition on an open composite state is not drawn (it is in the model, the
panel and `describe()`); a state with both regions and direct substates draws the direct ones beside the regions.

Layout limits, measured on `examples/order-states.json` and `tests/state-stress.json`:

- Port repair is off (`notes/stage-4.md` §17): two lines that cross next to a shared side keep their ports. A view of up to 30 cards that still crosses is laid out a second time, kept when `check()` finds fewer crossings and nothing more (audit 78): transitions round a state between two on their row go over and under it by turns, so two returns each two states back, or two from the last state to the first, no longer cross. Example 10 has no crossing laid out right (two before audit 36, when the payment region grew to hold its retry loop, and one before audit 39, when a line that ran through a composite state holding neither of its ends was routed round it) and two laid out down (five before audit 26, six before audit 39); `tests/state-stress.json` none either way in its `edge-cases` view (one laid out down till audit 78), and 19 and 26 in its `all` view (50 states, 60 transitions, composites three deep, two regions a level). Laid out down, the `edge-cases` view's fork into the Payment region runs along that region's border (L11; along the Parcel region's too till audit 78). Laid out down, labels that found no spot were left off with nothing said: since audit 6 they are drawn on a looser spot, which `check()` names (example 10: two labels on lines; the stress file: six on lines in `all`). All pinned, in `tests/state.test.mjs`, `tests/stage4-fixtures.test.mjs` and `tests/cli.py`; CI's example check passes over them.
- Each box level adds 72 px along the flow and 44 px across it; deep orthogonal states grow wide.

### Interchange: Mermaid's `stateDiagram`

`umlimator.py import` reads a `stateDiagram` or `stateDiagram-v2` through Node into one `uml.state-machine` view, and
reports what it skipped or approximated; the writer (internal) writes a view back. `read(write(model))` equals the
model on the subset, ids included, for example 10 and 500 generated models (`tests/mermaid-state.test.mjs`).

| Mermaid | Read as |
|---|---|
| `s1`, `state "Long name" as s1`, `s1 : text` | a state; `entry / x`, `do / x`, `exit / x` its activities; `trigger / effect` an internal transition; any other text a comment linked to the state, written back as `s1 : text` |
| `s1 --> s2 : text`, `[*]` | a transition, its text parsed; an initial pseudostate and a final state of the scope |
| `state s1 { … }`, `--` | a composite state, its regions |
| `<<fork>>`, `<<join>>`, `<<choice>>`; `note left of`, `note right of` | pseudostates; a comment and its link (the side is not kept) |
| `%% id:`, `%% kind:`, `%% region:`, `%% row:` | the writer's hints for ids and what Mermaid lacks: junction, history and terminate are written as plain states under `%% kind:`, labelled ●, H, H* and × |

What Mermaid 12.3.0 itself does with the writer's output (4.8, once, from its npm package in a scratch directory, not a
dependency): for example 10 and ten generated models its parser reads every file, puts each state in the composite and
region the model gives it, and keeps every transition and note, example 10's crossings into and out of composites
included; Chrome draws them all but one model's four transitions between a composite and a state inside it, which it
draws with no line. A transition between substates of two composites, or across a composite's border, is written with
`%% warning: Mermaid may not draw this` above it. `classDef`, `class`, `style`, `scale` and accessibility lines are not
read; text over 1 MiB is refused, nesting past 64 is read flat, and the reader never throws (`tests/import/state.mmd`).

### Writers: what each shows of a state machine diagram

Measured on `examples/order-states.json` (0.21.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on its
rendered page. Each file was opened and looked at.

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| States and their compartments, composites, regions and dividers, every pseudostate's shape | Yes | Yes | Yes, in vectors |
| Transitions, open arrowheads, `trigger [guard] / effect` labels | Yes | Yes | Yes |
| The legend of line kinds and pseudostates | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each state's, pseudostate's, composite's and region's `aria-label` kept; the transitions' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each element by its kind (a pseudostate's own: "Initial pseudostate", "Choice", …; "Final state", "State", "Composite state"), a state's entry, do and exit, then its internal transitions (`trigger [guard] / effect`) and a composite's regions (the type's `word` and `rows`, `notes/stage-4.md` §15, decision 18); "Lines": each transition from → to and its kind. **Gap** (`risks.md` R9): a transition's trigger, guard and effect are not in its row (the table reads a line's `label`, which a transition leaves empty) |

### Accessibility

Every piece has a name: "State Placed, entry reserve the books, do poll the payment provider, exit log the payment
result, 1 internal transition", "Composite state Fulfilling, 2 regions", "Region Parcel of Fulfilling, 3 states",
"Initial pseudostate in Parcel", "Choice", "Terminate", "Transition from Capturing payment to itself: capture failed
[attempts < 3] / count the attempt". A cut label's full text is in its line's name. Tab reads what each box
holds, depth first, then the transitions; a composite state or a region is a box, not a Tab stop: the keyboard reaches it through the outline of elements. `describe()` starts at the top initial pseudostate. Text reads at 4.5:1 and
lines and outlines at 3:1 on the stage in both themes (`tests/state-machine.html`, `tests/stage4.html`). Every editing
gesture has a key (`docs/editing.md`).

### Performance (P1)

CPU time, best of N after a warm-up, on an Apple M5 laptop at a load average of 6 to 8 (the idlest it got; 13 Nov 2026):

- `tests/state.test.mjs`'s wired machine (50 states, 60 transitions, composites three deep, two regions a level, wired
  as a machine is drawn): a transition's label edited, laid out and drawn, 75.5 ms; a full layout 73 ms. The 100 ms
  target holds here; 4.6 measured 77 to 118 ms on a machine at a load average of 10 to 17, so CI holds a 1 s ceiling and
  prints the figure (the maintainer's decision of 13 Nov 2026). Nearly all of it is the engine's routing.
- The scattered worst case (the same states, most transitions across region borders): a label 122 ms, a full layout
  120 ms, within the 1 s budget of edits that move geometry, as the maintainer decided.
- `tests/stage4-fixtures.test.mjs` on `tests/state-stress.json`'s `all` view (the wired machine, written out): a full
  layout 73 to 76 ms, a label 64 to 77 ms, a stereotype 71 to 76 ms.
- The Mermaid reader and writer: 500 transitions each way in about 1 ms each.

### Tests

`tests/state.test.mjs` and `tests/state-machine.html` (the type, its 19 rules, the example under three fonts, both
themes and both directions, every gesture by pointer and key, a 30-step session, P1); `tests/transition.test.mjs` (the
parser); `tests/flow.test.mjs` and `tests/flow.html` (the shared shapes); `tests/state-minimal.json` and
`tests/state-stress.json` with `tests/stage4-fixtures.test.mjs` and `tests/stage4.html` (`notes/stage-4.md` §16);
`tests/notation.html` (open arrowheads on the outlines); `tests/mermaid-state.test.mjs`, `tests/import/state.mmd` and
`tests/import.py` (interchange); `tests/cli.py` (render, check, stills, pdf, the diff Action's step); `tests/mcp.py`
(the MCP server's read tools and a highlight).
