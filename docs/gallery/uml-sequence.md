---
title: "Sequence diagram examples"
description: "Messages between lifelines, in time order: 7 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Sequence diagram examples

<p class="ex-lead">Messages between lifelines, in time order. The page below holds its 7 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-sequence.html" title="Sequence diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-sequence.html" target="_self">Open full screen<span class="visually-hidden"> (Sequence)</span></a><a href="../conformance/uml-sequence.html">Conformance<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.pdf" target="_self">PDF<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.json" target="_self">Model<span class="visually-hidden"> (Sequence)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-checkout-sequence-checkout-sequence">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=checkout-sequence-checkout-sequence" target="_self">Checkout</a></h3>
<p class="ex-sub">fragments, activations, a create</p>
<p>Lifelines on a time axis, calls, a self-call, async messages, replies and a create, activation bars derived from the messages, <code>alt</code> and <code>opt</code> frames with their guards, and an interaction use.</p>
</article>
<article class="ex-variant" id="view-buy-book-overview-find-book">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-find-book" target="_self">Find a book</a></h3>
<p class="ex-sub">from an interaction use</p>
<p>The sequence view the interaction overview's use Find a book opens: a short exchange between lifelines.</p>
</article>
<article class="ex-variant" id="view-buy-book-overview-buy-checkout">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-buy-checkout" target="_self">Check out</a></h3>
<p class="ex-sub">from an interaction use</p>
<p>The sequence view the interaction overview's use Check out opens.</p>
</article>
<article class="ex-variant" id="view-buy-book-overview-email-receipt">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-email-receipt" target="_self">Email the receipt</a></h3>
<p class="ex-sub">from an interaction use</p>
<p>The sequence view the interaction overview's use Email the receipt opens.</p>
</article>
<article class="ex-variant" id="view-buy-book-overview-queue-order">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-queue-order" target="_self">Queue the order</a></h3>
<p class="ex-sub">from an inline interaction</p>
<p>The sequence view the interaction overview's inline interaction Queue the order shows.</p>
</article>
<article class="ex-variant" id="view-unlock-unlock">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=unlock-unlock" target="_self">Unlock, ride and return</a></h3>
<p class="ex-sub">loop, break, create and delete</p>
<p>Unlocking a hire bike: a <code>break</code> frame when the rider has no credit, a <code>loop</code> frame for the ride, a trip lifeline created and later deleted with a cross, and async messages stereotyped <code>&lt;&lt;mqtt&gt;&gt;</code>.</p>
</article>
<article class="ex-variant" id="view-parallel-parallel">
<h3><a href="/umlimator/examples/types/uml-sequence.html#view=parallel-parallel" target="_self">Return, in parallel</a></h3>
<p class="ex-sub">par with a nested opt</p>
<p>Returning a library book: a <code>par</code> frame whose two operands run at once, an <code>opt</code> frame nested in one of them, a self-call and replies to each call.</p>
</article>
</div>
