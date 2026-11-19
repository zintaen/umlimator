---
title: "Sequence diagram"
description: "Messages between lifelines, in time order: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Sequence diagram

<p class="ex-lead">A bookshop's checkout: the shopper, the storefront, the api, a stock hold it creates and later deletes, the stock, the card gateway and the warehouse, their messages in time order with every frame the type draws. The page below opens on it, <a href="/umlimator/examples/types/uml-sequence.html#view=checkout" target="_self">A bookshop's checkout</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-sequence.html" title="Sequence diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-sequence.html" target="_self">Open full screen<span class="visually-hidden"> (Sequence)</span></a><a href="../conformance/uml-sequence.html">Conformance<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.pdf" target="_self">PDF<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.json" target="_self">Model<span class="visually-hidden"> (Sequence)</span></a></div>

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
