---
title: "Timing diagram"
description: "How lifelines change state along a time axis: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Timing diagram

<p class="ex-lead">One bookshop order being paid for, millisecond by millisecond: the order worker, the card gateway and the mailer stepping through their states, the order's status as values, the messages between them and the limits on how long it may take. The page below opens on it, <a href="/umlimator/examples/types/uml-timing.html#view=checkout" target="_self">Paying for one bookshop order</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-timing.html" title="Timing diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-timing.html" target="_self">Open full screen<span class="visually-hidden"> (Timing)</span></a><a href="../conformance/uml-timing.html">Conformance<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.pdf" target="_self">PDF<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.json" target="_self">Model<span class="visually-hidden"> (Timing)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Lifelines as lanes, <code>name : Type</code> on the left and their states in a column (worker : OrderWorker, payments : CardGateway, mailer : Mailer)</li>
<li>State lifelines as step lines, level in a state's row, upright at each change</li>
<li>A call message with a filled arrowhead from the sender's level to the receiver's (charge(total))</li>
<li>Its reply, dashed with an open arrowhead (paid)</li>
<li>A time constraint, a tick with its label (<code>{&lt;= 1000 ms}</code>)</li>
<li>An asynchronous message with an open arrowhead and a stereotype (&lt;&lt;signal&gt;&gt; receipt)</li>
<li>A duration constraint spanning two lanes, its extension lines reaching both (<code>{&lt;= 800 ms}</code>)</li>
<li>A duration constraint within one lane (<code>{&lt;= 300 ms}</code>)</li>
<li>A general value lifeline, <code>present</code> <code>as</code> <code>values</code>: the order's status in a band whose edges cross at each change (placed, paying, paid, packing)</li>
<li>A time ruler in milliseconds under the last lane, major and minor ticks</li>
</ol>
