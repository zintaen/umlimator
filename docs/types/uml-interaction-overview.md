---
title: "Interaction overview diagram"
description: "An activity whose steps are interactions: one example that shows all it draws, live, how to write it, and what is drawn and left out."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json, tools/types.json, tools/types.md and docs/diagrams/conformance/: edit those, not this file. -->

# Interaction overview diagram

<p class="ex-lead">An activity whose steps are interactions. Buying a book at an online bookshop as an interaction overview: finding the book, checking out until the payment is accepted, then emailing the receipt, reserving the stock and queueing the order side by side. Each ref box opens its own sequence diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-interaction-overview.html#view=buy-book" target="_self">Buying a book</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-interaction-overview.html" title="Interaction overview diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-interaction-overview.html" target="_self">Open full screen<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.pdf" target="_self">PDF<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.json" target="_self">Model<span class="visually-hidden"> (Interaction overview)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>An initial node, a filled circle</li>
<li>Interaction uses, boxes with <code>ref</code> in their tag, each opening its sequence diagram (Find a book, Check out, Email the receipt, Reserve the stock)</li>
<li>A control flow with a name as its label (book chosen)</li>
<li>A merge node, a hollow diamond, where the retry comes back in</li>
<li>A note (a comment with a folded corner) linked by a dashed line to the decision</li>
<li>A decision node holding its question (Payment accepted?)</li>
<li>Guards on the decision's exits, and a flow with both a name and a guard (try again [else])</li>
<li>A flow looping back to an earlier node</li>
<li>A fork node, a bar splitting the flow three ways</li>
<li>An inline interaction, an <code>sd</code> frame with its sequence diagram drawn inside: lifelines, a call, its reply and an asynchronous message (Queue the order)</li>
<li>A flow final node, a circle with a cross, ending one branch alone (after the receipt)</li>
<li>A join node, a bar where two branches meet</li>
<li>An activity final node, a ringed dot</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-buy-book-right">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=buy-book-right" target="_self">Buying a book, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same nodes and flows, the start at the left.</p>
</article>
<article class="ex-variant" id="view-find-book">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=find-book" target="_self">Find a book</a></h3>
<p>The sequence diagram the interaction use Find a book opens (a drill-down from the main view).</p>
</article>
<article class="ex-variant" id="view-buy-checkout">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=buy-checkout" target="_self">Check out</a></h3>
<p>The sequence diagram the interaction use Check out opens (a drill-down from the main view).</p>
</article>
<article class="ex-variant" id="view-reserve-stock">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=reserve-stock" target="_self">Reserve the stock</a></h3>
<p>The sequence diagram the interaction use Reserve the stock opens (a drill-down from the main view).</p>
</article>
<article class="ex-variant" id="view-email-receipt">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=email-receipt" target="_self">Email the receipt</a></h3>
<p>The sequence diagram the interaction use Email the receipt opens (a drill-down from the main view).</p>
</article>
<article class="ex-variant" id="view-queue-order">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=queue-order" target="_self">Queue the order</a></h3>
<p>The sequence diagram the inline interaction Queue the order draws in its frame, opened as a view of its own.</p>
</article>
</div>

## How to write it {#model}

The view's `diagram`, the types its elements, members and lines may have, and its props types, which describe `props` (every field in them is optional). The element envelope, typed views and the props all UML types share are on [Typed diagrams](../api/typed-diagrams.md).

`diagram: 'uml.interaction-overview'`. Flows take `UmlFlowProps`; an interaction use's or inline interaction's `opensView` names a `uml.sequence` view.

| Type | Values |
|---|---|
| `UmlInteractionOverviewElementType` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.InteractionUse`, `uml.Interaction`, `uml.Comment` |
| `UmlInteractionOverviewLineType` | `uml.ControlFlow`, `uml.CommentLink` |

## What is drawn and left out {#conformance}

<!-- the conformance note, as written: docs/diagrams/conformance/uml-interaction-overview.md -->

Release 0.21.0 (stage 4, `docs/diagrams/notes/stage-4.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no interaction overview notation, and there is no XMI and no
UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.interaction-overview"` is an interaction
overview diagram. It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines;
`lib/umlimator.js`, what a map host loads, draws it as plain cards with a warning. The vocabulary is
`docs/diagrams/model.md` §2, row 13; the example is [`examples/buy-book-overview.json`](../../examples/buy-book-overview.json),
whose sequence views are in the same model.

### The subset, and UML 2.5.1's clauses

UML 2.5.1 §17.10 builds the interaction overview diagram from activity notation:

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 17.7 InteractionUse | `uml.InteractionUse`; `opensView` a `uml.sequence` view | a box with `ref` in its tag and its name; Enter or a double-click opens its view |
| 17.10 Interaction (inline) | `uml.Interaction`; `opensView` a `uml.sequence` view | an `sd` frame with the sequence diagram drawn inside at full size, read only (heads, stems, bars, messages, fragments' tags and guards, interaction uses); above 8 lifelines or 20 messages, the frame and its name only, with the warning `inline-size` |
| 15.3 InitialNode, ActivityFinalNode, FlowFinalNode, DecisionNode, MergeNode, ForkNode, JoinNode | the activity's control nodes | as in the activity diagram: circles, a diamond that holds a decision's question (a deviation from UML), a bar |
| 15.2 ControlFlow | `uml.ControlFlow`; `label` the name, `props.guard` | a solid line with an open arrowhead, labelled `name [guard]`, cut at 280 px |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-4.md` §11.3): the activity's shared
flow rules (`flow-ends`, `initial-flows`, `final-flows`, `fork-join`, `decision-merge`, `decision-guards`);
`opens-sequence` (an error); `overview-kinds`, `comment-link`, `inline-size` (warnings). A line of another kind in the
view is not drawn, and is warned of.

### Left out

`notes/stage-4.md` §18: editing an inline interaction in place (it is opened); the diagram's own `sd` frame and its
`lifelines` clause; duration and time constraints (stage 6); partitions; an interaction use's arguments and return
value; inline interactions of other kinds than a sequence. And for all four stage 4 types: XMI, copy and paste, per-type
`diff()` writers.

Layout limits, measured on `examples/buy-book-overview.json` and `tests/overview-stress.json`:

- Port repair is off (`notes/stage-4.md` §17). The example has no crossing either way; `tests/overview-stress.json` has
  none and one in its `edge-cases` view, and none and three in its `all` view (40 nodes, 50 flows, 10 inline
  interactions). Laid out down, three guards `[in stock]` lay on the next decision's line till audit 32 placed again a label a later line runs across. Pinned in
  `tests/stage4-fixtures.test.mjs`.
- The column gap is one for every column, twice the widest guard and 26 px: one long guard widens them all (the example
  laid out right is 3,503 px wide). A gap per column needs an option of the layout that does not exist yet; the
  maintainer accepted the uniform gap for 0.21.0 (13 Nov 2026).

### Writers: what each shows of an interaction overview diagram

Measured on `examples/buy-book-overview.json` (0.21.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. Each file was opened and looked at.

| What is drawn | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Control nodes, interaction uses, the inline interaction's frame and its sequence diagram | Yes | Yes | Yes, in vectors |
| Flows, open arrowheads, guards | Yes | Yes | Yes |
| The legend of node kinds | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept (the inline interaction's counts its lifelines and messages); the flows' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each node by its kind ("Interaction use", "Interaction", "Decision node"); "Lines": each flow from → to and its kind; then each sequence view it opens, with its own pages and tables. **Gap:** a flow's guard is not in its row (the table reads a line's `label` only; `risks.md` R9) |

### Accessibility

Every piece has a name: "Interaction use Find a book, opens Find a book", "Inline interaction Queue the order, 3 lifelines, 3 messages, opens Queue the order", "Decision Payment accepted?, 2 exits", "Join, 2 branches". Tab reads the nodes by rank, then the flows; the inline interaction's markup has no node, hit area or key ring of its own, so the canvas sees one node. `describe()` starts at the initial nodes and follows the flows breadth first. Text reads at 4.5:1 and lines and outlines at 3:1 on the stage in both themes (`tests/overview.html`, `tests/stage4.html`). Every editing gesture has a key (`docs/editing.md`).

### Performance (P1)

`tests/stage4-fixtures.test.mjs` on `tests/overview-stress.json`'s `all` view (40 nodes, 50 flows, 10 inline
interactions of 6 lifelines and 12 messages), CPU time, best of three after a warm-up, on an Apple M5 laptop at a load
average of 6 to 8 (the idlest it got; 13 Nov 2026): a full layout and its SVG 8 to 10 ms, a guard 8 to 10 ms, a
stereotype 8 ms, against the 100 ms target; one inline time axis 0.03 ms, against 5 ms. CI holds 1 s for the edits and
prints the figures (the maintainer's decision of 13 Nov 2026).

### Tests

`tests/overview.test.mjs` and `tests/overview.html` (the type, its rules with the shared flow rules, the example and
its inline interaction under three fonts, both themes and both directions, opening a use, every gesture by pointer and
key, a 30-step session); `tests/flow.test.mjs` and `tests/flow.html` (the shared shapes and rules);
`tests/overview-minimal.json` and `tests/overview-stress.json` with `tests/stage4-fixtures.test.mjs` and
`tests/stage4.html` (`notes/stage-4.md` §16); `tests/notation.html` (open arrowheads on the outlines); `tests/cli.py`
(render, check, stills, pdf, the diff Action's step); `tests/mcp.py` (the MCP server's read tools and a highlight).
