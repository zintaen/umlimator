---
title: "Communication diagram"
description: "Numbered messages along the links between objects: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Communication diagram

<p class="ex-lead">A shopper checks out and the card is accepted: the storefront, the shop's API, the payment provider and the card network pass the order along their links, a receipt is created and the basket deleted. The page below opens on it, <a href="/umlimator/examples/types/uml-communication.html#view=checkout" target="_self">Checkout, the card accepted</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-communication.html" title="Communication diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-communication.html" target="_self">Open full screen<span class="visually-hidden"> (Communication)</span></a><a href="../conformance/uml-communication.html">Conformance<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.pdf" target="_self">PDF<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.json" target="_self">Model<span class="visually-hidden"> (Communication)</span></a></div>

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
