---
title: "Data flow diagram"
description: "Processes, data stores and external entities, and the data between them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Data flow diagram

<p class="ex-lead">The bookshop's data at level 1: the customer, the payment provider and the courier around three numbered processes and two data stores, with Take order opening its own level 2. The page below opens on it, <a href="/umlimator/examples/types/dfd.html#view=level-1" target="_self">The bookshop, level 1</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/dfd.html" title="Data flow diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/dfd.html" target="_self">Open full screen<span class="visually-hidden"> (Data flow)</span></a><a href="../conformance/dfd.html">Conformance<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.pdf" target="_self">PDF<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.json" target="_self">Model<span class="visually-hidden"> (Data flow)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A note linked by a dashed line to a data store</li>
<li>Data stores in Yourdon's style, two lines with the number before the name (D2 Orders, D1 Books)</li>
<li>Processes as ellipses, the number above the name (1 Take order, 2 Take payment, 3 Ship order)</li>
<li>Labelled data flows, solid with a filled arrow</li>
<li>A request and its reply between one pair (charge request, charge result)</li>
<li>External entities as rectangles (Payment provider, Courier, Customer)</li>
<li>Flows from a store into a process and from a process into a store (price and stock, stock change)</li>
<li>A process that opens its own level (Take order opens level 2, which balances it)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-level-1-gane-sarson">
<h3><a href="/umlimator/examples/types/dfd.html#view=level-1-gane-sarson" target="_self">The bookshop, level 1, in Gane and Sarson</a></h3>
<p>The same level 1 in Gane and Sarson's symbols (<code>notation</code> <code>gane-sarson</code>): processes as rounded rectangles with a number band, stores with an id box, entities with a shadow.</p>
</article>
<article class="ex-variant" id="view-take-order">
<h3><a href="/umlimator/examples/types/dfd.html#view=take-order" target="_self">1 Take order, level 2</a></h3>
<p>Level 2 of process 1, Take order: the view the process opens, its flows across the edge balancing level 1's.</p>
</article>
</div>
