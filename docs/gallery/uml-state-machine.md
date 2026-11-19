---
title: "State machine diagram"
description: "States and the transitions between them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# State machine diagram

<p class="ex-lead">One bookshop order's life, from placed to delivered, cancelled or erased: the payment result chosen at a choice, picking and payment run side by side in two regions, a hold resumed by history, delivery with its problems, and the refund. The page below opens on it, <a href="/umlimator/examples/types/uml-state-machine.html#view=order-life" target="_self">An order's life</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-state-machine.html" title="State machine diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-state-machine.html" target="_self">Open full screen<span class="visually-hidden"> (State machine)</span></a><a href="../conformance/uml-state-machine.html">Conformance<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.pdf" target="_self">PDF<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.json" target="_self">Model<span class="visually-hidden"> (State machine)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>An initial pseudostate, a filled circle</li>
<li>A state with entry, do and exit rows and an internal transition (Placed)</li>
<li>A transition labelled with its trigger only (payment result)</li>
<li>A choice, a diamond, its exits guarded: [card authorised], [paid by gift card] and [else] / email the shopper</li>
<li>A fork, a bar, splitting into states in two regions (after [paid by gift card])</li>
<li>A composite state with two orthogonal regions, each named, a dashed divider between them (Fulfilling: Parcel and Payment)</li>
<li>A transition ending on a composite state's border ([card authorised] into Fulfilling)</li>
<li>An initial pseudostate inside each region</li>
<li>A transition leaving a composite state from its border (hold requested, cancel requested / refund the payment)</li>
<li>A deep history H* in the Parcel region, re-entered from On hold (hold lifted)</li>
<li>A note linked to the deep history by a dashed line</li>
<li>A self-transition with a trigger, a guard and an effect: capture failed [attempts &lt; 3] / count the attempt</li>
<li>A join, a bar, merging the two regions, then a transition with an effect only (/ hand the parcel to the carrier)</li>
<li>A composite state holding its substates with no regions (In delivery)</li>
<li>A shallow history H, re-entered when a problem is resolved</li>
<li>A state with its activities collapsed (Out for delivery, <code>present</code> <code>collapsed</code>)</li>
<li>A final state, a ring round a filled circle (parcel signed for / email the receipt)</li>
<li>A closed composite state with UML's decomposition mark, its substates not shown (Under enquiry)</li>
<li>A junction, a small filled circle, merging two transitions (refused at the door, parcel lost)</li>
<li>A state's compartment cut to two rows then &quot;+2 more&quot; (Cancelled, <code>present</code> <code>rows</code>)</li>
<li>A terminate pseudostate, an X (after 30 days / erase the shopper's details)</li>
</ol>
