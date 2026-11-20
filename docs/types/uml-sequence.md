---
title: "Sequence diagram"
description: "Messages between lifelines, in time order: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Sequence diagram

<p class="ex-lead">Messages between lifelines, in time order. A bookshop's checkout: the shopper, the storefront, the api, a stock hold it creates and later deletes, the stock, the card gateway and the warehouse, their messages in time order with every frame the type draws. The page below opens on it, <a href="/umlimator/examples/types/uml-sequence.html#view=checkout" target="_self">A bookshop's checkout</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-sequence.html" title="Sequence diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-sequence.html" target="_self">Open full screen<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.pdf" target="_self">PDF<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.json" target="_self">Model<span class="visually-hidden"> (Sequence)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Lifelines left to right, each head <code>name : Type</code> over a dashed stem (api : ShopApi)</li>
<li>An actor lifeline, &lt;&lt;actor&gt;&gt; over its head (shopper : Customer)</li>
<li>A synchronous call, solid with a filled arrowhead (checkout(), place(order))</li>
<li>A <code>break</code> frame with its guard (basket is empty) holding an asynchronous message</li>
<li>An asynchronous message, solid with an open arrowhead (showError, orderPlaced, release)</li>
<li>A self-call drawn as a loop back to its own lifeline (validate(order))</li>
<li>Activation bars derived from the messages, a nested bar set to the right of its parent (api during validate)</li>
<li>A create message, dashed and open, the created lifeline's head lowered to it (new(order) to hold : StockHold)</li>
<li>A <code>loop</code> frame (for each order line) with a call and its reply inside</li>
<li>A reply, dashed with an open arrowhead, back to the caller (reserved, paid, declined, result)</li>
<li>An <code>alt</code> frame with two operands, their guards and a dashed divider (payment accepted, else)</li>
<li>A <code>par</code> frame nested in an operand, its two operands running at once (tell the shopper, tell the warehouse)</li>
<li>An <code>opt</code> frame nested in the <code>par</code> (shopper is still on the page), three frames deep</li>
<li>An interaction use, a <code>ref</code> box over the lifelines it covers (Send receipt email, over storefront and api)</li>
<li>A message with a stereotype, &lt;&lt;amqp&gt;&gt; before its label (pickList(order) to the warehouse)</li>
<li>A delete message, the receiver's stem ending in a cross (close() to hold)</li>
</ol>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.sequence'`. Lifelines are listed left to right in `nodeIds`; messages and interaction uses are inline in the view's `edges`, in time order; combined fragments are in the view's `fragments`, each with its operands as `members`.

| Type | Values |
|---|---|
| `UmlSequenceElementType` | `uml.Lifeline`, `uml.InteractionUse`, `uml.CombinedFragment` |
| `UmlSequenceMemberType` | `uml.InteractionOperand` (its `label` the guard) |
| `UmlSequenceLineType` | `uml.Message` |
| `UmlLifelineProps` | `represents` (drawn `name : Type`), `stereotypes` (`actor` draws «actor») |
| `UmlMessageSort` | `call` (the default), `async`, `reply`, `create`, `delete` |
| `UmlMessageProps` | `sort`, `replyTo` (the call a reply answers), `stereotypes` |
| `UmlInteractionUseProps` | `covers` (lifeline ids), `refersTo` (a view) |
| `UmlInteractionOperator` | `alt`, `opt`, `loop`, `par`, `break` |
| `UmlCombinedFragmentProps` | `operator` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-sequence.md -->

Release 0.20.0 (stage 3, `docs/diagrams/notes/stage-3.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below; **interchange** with Mermaid's `sequenceDiagram` (Mermaid 12.3.0) on the same subset. Not
XMI, and no UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.sequence"` is a sequence diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 11; the example is
[`examples/checkout-sequence.json`](../../examples/checkout-sequence.json). `render: "sequence"` on a map's view is a
numbered view, not this type (`docs/diagrams/risks.md` C7); `umlimator.py trace --diagram uml.sequence` turns a trace
into this type, through the numbered view.

### The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 17.3 Lifeline | `uml.Lifeline`, a model node the view lists in `nodeIds`, left to right; `props.represents` as text; `props.stereotypes: ["actor"]` | a head `name : Type` (cut at 320 px), «actor» over it as text; a dashed stem down the view |
| 17.4 Message, MessageSort | `uml.Message`, inline in the view's `edges`, in time order; `props.sort`: `call`, `async`, `reply`, `create`, `delete`; a reply's `props.replyTo`; `props.stereotypes`, drawn «name» before its label | a call with a filled arrowhead; async with an open one; a reply dashed and open; a create dashed and open, the receiver's head lowered to it; a delete with a filled arrowhead, the receiver's stem ending in a cross; a self-message a loop |
| 17.5 ExecutionSpecification (activations) | derived, never stored: five rules from the messages (`notes/spike-sequence.md` §2.3) | bars on the stems, a nested one 6 px to the right, under the messages |
| 17.6 CombinedFragment, InteractionOperand | the view's `fragments`: `uml.CombinedFragment`, `props.operator` `alt`, `opt`, `loop`, `par` or `break`; its `members` the operands (`label` the guard); an occurrence's or a fragment's `parent` its operand | a frame with its operator in a pentagon tag; each operand's guard `[...]`; dashed dividers between operands; a nested frame inset 10 px |
| 17.7 InteractionUse | `uml.InteractionUse`, inline in `edges`; `props.covers` (lifelines next to each other), `props.refersTo` a view | a box over the lifelines it covers, `ref` in its tag, its label in it |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-3.md` §4.3): `parent-operand`,
`contiguous` (a fragment's content is one run in `edges`, operand by operand), `message-ends`, `reply-call` (a
warning when a reply names no call), `reply-once`, `create-once`, `delete-once`, `covers` (a warning when a use covers
none, drawn across all of them) (errors); `operator`, `sort`, `empty`, `view` (warnings: another
operator or sort is drawn by its name or as a call; an empty operand or fragment; pins, or a direction other than down).
The shared ones live in `src/uml/interaction.js` and the communication diagram runs them too. Two replies to one call, two creates or two deletes of one lifeline, or a delete and a later message to it, are allowed where they never both happen: in different operands of one `alt`, or the first in a `break` operand and the second after that `break` in the operand around it (UML 2.5.1 17.6.3: a `break` operand is performed instead of the rest of that fragment). The Mermaid reader pairs a reply after a `break` with the call the `break`'s reply answers on the same grounds.

Deleting an alt, or one of its operands, that would leave two replies to one call outside different operands is refused,
said on the hint line (`reply-once: …`): the type's remove hook checks what is left (`sqGuard`), so no single delete leaves a
`reply-once` error (`tests/delete-cascade.test.mjs`); delete one of the replies first. A bare `apply()` delete is not
refused, and may leave one.

### Left out

- Gates; continuations; state invariants; time and duration constraints (stage 6); found and lost messages; general
  ordering; coregions; lifeline decomposition; the seven other operators (`critical`, `neg`, `assert`, `strict`, `seq`,
  `ignore`, `consider`), drawn by name with a warning.
- An actor drawn as a figure («actor» is text); parsed message signatures (a label is text); an interaction use that
  opens its view (stage 4); notes in a sequence view; message numbers (`autonumber`).
- Hiding a message the view holds: it lives in its view, so the gesture is to delete it (`docs/diagrams/notes/spike-sequence.md` P12, definition of done item 4). A model message the view lists by id is taken out of the view by Delete, with its replies, and deleted by Shift + Delete.
- `represents` is text, not a reference to a class (M8). Copy and paste (E7). XMI.
- A lifeline created in one operand of an `alt` keeps its stem through the other operands (spike risk 4.5): accepted,
  as the stem has nowhere else to go; `tests/sequence-stress.json`'s `edge-cases` view draws it. A create of it in another
  operand draws a head of its own at that create's row, over the stem, and ends on it.
- The Mermaid reader and writer (`src/readers/mermaid-sequence.js`, `umlimator.py import`) are internal. What Mermaid
  cannot carry is written as `%% not written:` comments; a `destroy`, `critical`/`option`, `rect`, notes, `autonumber`,
  `box`, links and styling are read as `notes/stage-3.md` §8 says, each reported. `read(write(model))` equals the model
  on the subset, ids included.
- The helpers that turn a numbered view or a trace into a sequence view (`notes/stage-3.md` §7) are internal; the CLI's
  `trace --diagram uml.sequence` is how to reach them.

### Writers: what each shows of a sequence diagram

Measured on `examples/checkout-sequence.json` (0.20.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. Each file was opened and looked at.

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Heads, stems, bars, crosses | Yes | Yes | Yes, in vectors |
| Messages, their arrowheads and dashes, labels on their backings, self-message loops | Yes | Yes | Yes |
| Frames, tags, guards, dividers; interaction uses | Yes | Yes | Yes |
| The legend of message sorts | No: the legend is a piece of the page (`render()`'s `legend`), not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each head's, frame's, operand's and use's `aria-label` kept; the messages' `<title>` removed, as for maps | None | None |
| Theme | The page's, light or dark, every colour resolved, so the file opens alone | The page's | `--theme`, light by default |
| Tables | None | None | Per type (R8): each lifeline by its drawn name (`api : ShopApi`) and kind ("Lifeline"); each message from → to, its label and its kind ("Message"). A self-message (`api → api`) is listed in the lines table and counted on the cover. **Gaps:** fragments, operands and interaction uses are not listed; a message's sort is not given (every kind reads "Message") |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)),
this one's among them.

### Accessibility

Every piece has a name: a head ("Lifeline api : ShopApi"), a fragment ("Combined fragment alt, 2 operands"), an operand
("Operand payment accepted of alt, 3 occurrences"), a use ("Interaction use Send receipt email, over api to receipt")
and a message ("Message 5 of 10: payments to api, paid, reply, in alt, payment accepted"). Tab reads the heads left to
right, then each fragment, operand and occurrence in time order (`geo.order`). `describe()` writes the view in words,
one message a line, indented inside its fragments. Text reads at 4.5:1 and lines, stems, bars and outlines at 3:1 on
the stage in both themes; axe's rules for the pieces drawn as `role="img"` are written out in `tests/sequence.html`.
Every editing gesture has a key (`docs/editing.md`).

### Tests

`tests/sequence.test.mjs` and `tests/sequence.html` (the type, its rules, the example under three fonts and both themes,
every gesture by pointer and key, a 30-step session that undoes, redoes and reopens to byte-identical models);
`tests/sequence-fixtures.test.mjs` and `tests/sequence-fixtures.html` with `tests/sequence-minimal.json` and
`tests/sequence-stress.json` (`notes/stage-3.md` §9: every T case, and 20 lifelines, 200 messages and 10 nested
fragments laid out and drawn in under 100 ms, P1); `tests/interaction.test.mjs` (bars, numbers, the shared rules);
`tests/timeaxis.test.mjs` and `tests/timeaxis.html` (the layout); `tests/mermaid-sequence.test.mjs` and
`tests/import.py` (interchange); `tests/convert.test.mjs` (the helpers); `tests/cli.py` (render, check, stills, pdf, and
`trace --diagram uml.sequence`).
