---
title: "Interaction overview diagram"
description: "An activity whose steps are interactions: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Interaction overview diagram

<p class="ex-lead">Buying a book at an online bookshop as an interaction overview: finding the book, checking out until the payment is accepted, then emailing the receipt, reserving the stock and queueing the order side by side. Each ref box opens its own sequence diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-interaction-overview.html#view=buy-book" target="_self">Buying a book</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-interaction-overview.html" title="Interaction overview diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-interaction-overview.html" target="_self">Open full screen<span class="visually-hidden"> (Interaction overview)</span></a><a href="../conformance/uml-interaction-overview.html">Conformance<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.pdf" target="_self">PDF<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.json" target="_self">Model<span class="visually-hidden"> (Interaction overview)</span></a></div>

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
