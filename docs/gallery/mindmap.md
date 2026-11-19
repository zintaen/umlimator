---
title: "Mindmap"
description: "Ideas branching out from one topic: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Mindmap

<p class="ex-lead">The plan for opening the bookshop as one mindmap: seven branches from catalogue and website to hosting and staff, each broken into the jobs to do, and launch day in a mindmap of its own that the Launch topic opens. The page below opens on it, <a href="/umlimator/examples/types/mindmap.html#view=plan" target="_self">Opening the bookshop</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/mindmap.html" title="Mindmap, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/mindmap.html" target="_self">Open full screen<span class="visually-hidden"> (Mindmap)</span></a><a href="../conformance/mindmap.html">Conformance<span class="visually-hidden"> (Mindmap)</span></a><a href="/umlimator/examples/types/mindmap.pdf" target="_self">PDF<span class="visually-hidden"> (Mindmap)</span></a><a href="/umlimator/examples/types/mindmap.json" target="_self">Model<span class="visually-hidden"> (Mindmap)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The root in the middle, in a larger, bolder box (Opening the bookshop)</li>
<li>Topics as rounded boxes, joined to their parents by curves, thicker from the root</li>
<li>Each first-level branch in its own colour, borders and curves alike, the six colours cycled (Staff takes Catalogue's)</li>
<li>Branches set to a side by <code>present</code> <code>side</code>: Catalogue and Website right, Warehouse and Legal and money left</li>
<li>Branches with no side placed on the shorter half (Launch, Hosting, Staff)</li>
<li>Children in the view's order, top to bottom</li>
<li>A topic that opens another view, wider, with the drill-down mark (Launch)</li>
<li>A long topic wrapped to four lines and cut with an ellipsis (the wholesalers' terms)</li>
<li>A topic wrapped to two lines (Test with the provider's sandbox cards)</li>
<li>Four levels below the root: Website, Checkout, Card payments, the sandbox test</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-launch-day">
<h3><a href="/umlimator/examples/types/mindmap.html#view=launch-day" target="_self">Launch day</a></h3>
<p>The mindmap the Launch topic opens (<code>opensView</code>): launch day hour by hour, a tree of its own under the main view.</p>
</article>
</div>
