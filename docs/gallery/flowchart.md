---
title: "Flowchart"
description: "The steps and decisions of a process: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Flowchart

<p class="ex-lead">A bookshop handling a returned book, from the parcel arriving to the return closed: the slip read, the order looked up, the book's condition deciding between a refund, a courier claim and a rejection letter, every one of the ten symbols in one flowchart. The page below opens on it, <a href="/umlimator/examples/types/flowchart.html#view=returns" target="_self">Handling a returned book</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/flowchart.html" title="Flowchart, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/flowchart.html" target="_self">Open full screen<span class="visually-hidden"> (Flowchart)</span></a><a href="../conformance/flowchart.html">Conformance<span class="visually-hidden"> (Flowchart)</span></a><a href="/umlimator/examples/types/flowchart.pdf" target="_self">PDF<span class="visually-hidden"> (Flowchart)</span></a><a href="/umlimator/examples/types/flowchart.json" target="_self">Model<span class="visually-hidden"> (Flowchart)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A start, a terminator drawn as a stadium with no flow in (Returned parcel arrives)</li>
<li>An input/output, a parallelogram leaning right (Read the returns slip)</li>
<li>A decision, a diamond with its text on two lines, its exits labelled yes and no (Order found?)</li>
<li>A manual input, its top sloping up to the right (Key in the order number)</li>
<li>A loop back: a labelled flow from the manual input up to the decision (look again)</li>
<li>A process, a rectangle (Inspect the book)</li>
<li>A decision with three exits, each labelled (as new, damaged in the post, worn by the reader)</li>
<li>A predefined process, a rectangle with a second line inside each side (Refund the payment), two flows coming into it</li>
<li>A delay, drawn as a D (Wait for the bank to confirm)</li>
<li>An on-page connector pair: the flow runs into one B circle and carries on from the other</li>
<li>A note linked by a dashed line to the B connector it explains</li>
<li>A database, a cylinder (Stock records)</li>
<li>A document with a wavy bottom (Rejection letter)</li>
<li>A connector as a junction: two flows into A, one out</li>
<li>An end, a terminator with no flow out (Return closed)</li>
<li>Flows drawn solid with a filled arrowhead, labels beside them</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-returns-right">
<h3><a href="/umlimator/examples/types/flowchart.html#view=returns-right" target="_self">The same flowchart, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the same symbols and flows, the start at the left.</p>
</article>
</div>
