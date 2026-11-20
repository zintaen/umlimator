---
title: "Communication diagram"
description: "Numbered messages along the links between objects: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Communication diagram

<p class="ex-lead">Numbered messages along the links between objects. A shopper checks out and the card is accepted: the storefront, the shop's API, the payment provider and the card network pass the order along their links, a receipt is created and the basket deleted. The page below opens on it, <a href="/umlimator/examples/types/uml-communication.html#view=checkout" target="_self">Checkout, the card accepted</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-communication.html" title="Communication diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-communication.html" target="_self">Open full screen<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.pdf" target="_self">PDF<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.json" target="_self">Model<span class="visually-hidden"> (Communication)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A lifeline with &lt;&lt;actor&gt;&gt; over its head (shopper : Shopper)</li>
<li>Lifeline heads <code>name : Type</code> (storefront : Storefront, api : ShopApi)</li>
<li>Connectors as plain lines with no arrows, each carrying its messages as a stack the line runs through</li>
<li>Messages numbered by nesting, <code>1</code>, <code>1.1</code>, <code>1.1.2</code>, down to <code>1.1.2.1.1</code></li>
<li>Calls with a small filled arrow toward the receiver (checkout(), charge(total))</li>
<li>A message with a stereotype after its number (1.1: &lt;&lt;secure&gt;&gt; place(order))</li>
<li>An async message with an open arrow (orderPlaced)</li>
<li>Replies with a dashed open arrow (paid, result, confirmation page)</li>
<li>A self connector drawn as a loop, carrying a message to the lifeline itself (validate(order))</li>
<li>A create message, &lt;&lt;create&gt;&gt; before its text (new(order) to receipt)</li>
<li>A delete message with a filled arrow, &lt;&lt;destroy&gt;&gt; before its text (clear() to basket)</li>
<li>Two messages one way and a reply the other way on one link (storefront to api)</li>
<li>A connector with no message, a single line (api to stock)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-checkout-right">
<h3><a href="/umlimator/examples/types/uml-communication.html#view=checkout-right" target="_self">The same checkout, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the same lifelines, links and numbered messages.</p>
</article>
</div>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.communication'`. The view's `edges` lists connectors, then messages in order; message numbers are derived. Message props are `UmlMessageProps`.

| Type | Values |
|---|---|
| `UmlCommunicationElementType` | `uml.Lifeline` |
| `UmlCommunicationLineType` | `uml.Connector`, `uml.Message` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-communication.md -->

Release 0.20.0 (stage 3, `docs/diagrams/notes/stage-3.md` §6). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no communication diagram, and there is no XMI or UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.communication"` is a communication diagram.
It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js` draws it as
plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 12; the example is
[`examples/checkout-communication.json`](../../examples/checkout-communication.json), the sequence example's paid
branch.

### The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 17.3 Lifeline | `uml.Lifeline`, `props.represents` as text, `props.stereotypes` | a head `name : Type`, «actor» over it as text |
| 11.2 Connector (17.9 the link messages go along) | `uml.Connector`, a model edge the view lists in `edges`, before the messages | a line with no arrows; a connector from a lifeline to itself is a loop |
| 17.4 Message, MessageSort | `uml.Message`, a model edge the view lists in `edges`, in time order; `props.sort`, a reply's `props.replyTo`, `props.stereotypes` («name» after its number) | a row in the stack on its connector: its number, its text, and a small arrow toward its receiver, filled for a call or a delete, open for async and create («create» before the text), dashed and open for a reply |
| 17.9 sequence numbers | derived (S8): a message's number is its place among the messages sent in the activation it is sent from, replies included | `1`, `1.1`, `1.1.2`, `1.1.2.1` |

Each connector's messages are one stack, a node of the layered layout, with the connector drawn through it
(`notes/stage-3.md` §6.2, S7); a connector with no message is one line. The view is laid out like a class diagram, and a
lifeline may be pinned.

Rules, each `validate()` problem naming its `rule` and its elements: `message-link` (error: a connector of the view joins
the message's two lifelines; a self-message needs a self connector), and the shared `reply-call`, `reply-once`,
`create-once`, `delete-once` and `sort` (`src/uml/interaction.js`).

Deleting a connector (Shift + Delete) takes the messages it carries, from every communication view with no other
connector for them, in the same transaction; a message another view still carries on its own connector stays in the model, hidden from the views left with none (the type's remove hook), so no single delete leaves a `message-link` error
(`tests/delete-cascade.test.mjs`). A bare `apply()` delete of a connector leaves its messages, and so the error.

### Left out

- Guards and iteration beyond plain text; concurrent numbers (`1a`, `1b`); multi-objects.
- Messages drawn beside the link: they sit on it, as a stack the connector runs through, so a link with messages bends
  at its stack.
- One message shared by two communication views in different orders: each view numbers its own messages.
- `represents` is text, not a reference (M8); copy and paste (E7); XMI; a reader.
- The helper that turns a sequence view (with the operand of each `alt` picked) or a numbered view into a communication
  view (`notes/stage-3.md` §7) is internal.
- Lines cross where the layered layout finds no better order: `tests/communication-stress.json`'s `all` view (20
  lifelines, 30 connectors, 200 messages) has 13 crossings, pinned in `tests/communication.test.mjs`
  (`docs/diagrams/risks.md` L4); its `edge-cases` view, the minimal fixture and the example have none.
- A connector the router finds no way round another connector's stack for (its ends' sides shut it in) runs through
  those message rows: `check()` says so ("edge b→c passes through card …"), and the warning names the stack by its
  lifelines ("the messages on b–a"), pinned in `tests/communication.test.mjs` (audit 14).

### Writers: what each shows of a communication diagram

Measured on `examples/checkout-communication.json` (0.20.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf`
on its rendered page. Each file was opened and looked at.

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Lifelines, connectors, a self connector's loop | Yes | Yes | Yes, in vectors |
| Message rows: numbers, text, the arrow toward the receiver | Yes | Yes | Yes |
| The legend of connectors and sorts | No: the legend is a piece of the page, not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each lifeline's and message row's `aria-label` kept; the connectors' `<title>` removed, as for maps | None | None |
| Theme | The page's, light or dark, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | Per type (R8): each lifeline and its kind ("Lifeline"); each connector and each message from → to, its label and its kind ("Connector", "Message"). A self-message and a self connector (`api → api`) are listed in the lines table and counted on the cover. **Gaps:** a message's number and sort are not in the table (the picture has the numbers) |

### Accessibility

Lifelines, connectors and message rows have names ("Lifeline api : ShopApi"; "Connector between shopper and
storefront, 2 messages"; "Message 2 of 9, 1.1: storefront to api, place(order), call"). Tab reads the lifelines in the
layout's order, then the connectors, then the message rows by number (`geo.order`). `describe()` writes each lifeline
with what it is linked to, then each message by its number. Text reads at 4.5:1 and lines at 3:1 on the stage in both
themes (`tests/communication.html`). Every editing gesture has a key (`docs/editing.md`).

### Tests

`tests/communication.test.mjs` and `tests/communication.html` (the type, its stacks and numbers, its rules, the example
and the fixtures `tests/communication-minimal.json` and `tests/communication-stress.json` under three fonts and both
themes, each gesture by pointer and key, a session undone and redone, and P1: the 200-message view laid out in under
1 s, and a message added, renamed or reordered laid out and drawn in under 100 ms); `tests/interaction.test.mjs`
(numbers, the shared rules); `tests/convert.test.mjs` (the helpers); `tests/cli.py` (render, check, stills and pdf).
