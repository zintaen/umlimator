---
title: "Information flow diagram"
description: "Information items conveyed between elements: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Information flow diagram

<p class="ex-lead">What travels with one bookshop order: the shopper's checkout, the card details sent on to the payment provider, the order saved, reserved and confirmed, stock levels back to the storefront and the receipt back to the shopper. The page below opens on it, <a href="/umlimator/examples/types/uml-information-flow.html#view=order-flows" target="_self">What travels with an order</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-information-flow.html" title="Information flow diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-information-flow.html" target="_self">Open full screen<span class="visually-hidden"> (Information flow)</span></a><a href="../conformance/uml-information-flow.html">Conformance<span class="visually-hidden"> (Information flow)</span></a><a href="/umlimator/examples/types/uml-information-flow.pdf" target="_self">PDF<span class="visually-hidden"> (Information flow)</span></a><a href="/umlimator/examples/types/uml-information-flow.json" target="_self">Model<span class="visually-hidden"> (Information flow)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A note linked by a dashed line to a flow's end (Shop API)</li>
<li>Components as flow ends (Shop API, Storefront, Payment provider)</li>
<li>A flow from an element to itself, drawn as a loop (&lt;&lt;flow&gt;&gt; retry: Order)</li>
<li>A named flow conveying an information item and a class: &lt;&lt;flow&gt;&gt; reserve: Order, Book</li>
<li>A class as a flow end (StockLedger)</li>
<li>An interface as a flow end, drawn with &lt;&lt;interface&gt;&gt; (Notifications)</li>
<li>A flow conveying two information items, named: &lt;&lt;flow&gt;&gt; confirm: Order, Receipt</li>
<li>Unnamed flows, labelled &lt;&lt;flow&gt;&gt; and what they convey (&lt;&lt;flow&gt;&gt; Receipt, &lt;&lt;flow&gt;&gt; Stock level)</li>
<li>An actor as a flow end (Shopper)</li>
<li>Flows drawn dashed with an open arrowhead, each into the element it reaches</li>
<li>A flow back over several columns, out of its source's bottom and into its target's (&lt;&lt;flow&gt;&gt; Order)</li>
<li>Information items, each a classifier with a small filled triangle in its top right corner (Order, Card details, Receipt, Stock level)</li>
<li>A class conveyed by a flow, drawn beside the items (Book)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-order-flows-down">
<h3><a href="/umlimator/examples/types/uml-information-flow.html#view=order-flows-down" target="_self">What travels with an order, laid out down</a></h3>
<p>Laid out down (<code>direction</code> <code>down</code>) instead of right: the same ends, items and flows.</p>
</article>
</div>
