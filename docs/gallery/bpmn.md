---
title: "BPMN diagram"
description: "Business processes: events, tasks, gateways, pools and lanes: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# BPMN diagram

<p class="ex-lead">A bookshop order from the shopper's basket to the courier: the shopper's, the payment provider's and the bookshop's pools, the bookshop's work split between sales and a warehouse of picking and dispatch, with the messages that pass between them. The page below opens on it, <a href="/umlimator/examples/types/bpmn.html#view=order-to-shipment" target="_self">A bookshop order, from basket to shipment</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/bpmn.html" title="BPMN diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/bpmn.html" target="_self">Open full screen<span class="visually-hidden"> (BPMN)</span></a><a href="../conformance/bpmn.html">Conformance<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.pdf" target="_self">PDF<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.json" target="_self">Model<span class="visually-hidden"> (BPMN)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Pools as bands, each name turned in a header strip: Shopper, Payment provider, Bookshop</li>
<li>A black-box pool with no flow nodes (Payment provider)</li>
<li>A none start event (Basket is ready) and a user task with the figure at its top left (Place order)</li>
<li>A message intermediate throw event, a double ring with a filled envelope (Order sent)</li>
<li>Message flows, dashed with an open circle at the source and a hollow triangle at the target, labelled (Order, Charge request, Payment result, Shipping notice); those to the black-box pool end on its border</li>
<li>A message intermediate catch event, a double ring with an open envelope (Shipping notice received), then a none end event</li>
<li>Lanes in the Bookshop pool: Sales, and Warehouse holding the nested lanes Dispatch and Picking</li>
<li>A message start event (Order received)</li>
<li>A data object, a page with a folded corner (Order), and data associations, dotted with an arrowhead at their target</li>
<li>A service task with the gear (Take payment)</li>
<li>An interrupting timer boundary event on the task's border (No answer in 2 minutes)</li>
<li>A text annotation, an open bracket, joined by a dotted association with an arrowhead (<code>direction</code> <code>one</code>)</li>
<li>An exclusive gateway, a diamond with an X and its name outside (Paid?), its sequence flows labelled yes and no</li>
<li>A second exclusive gateway merging the no flow and the timeout</li>
<li>A terminate end event, a thick ring round a filled circle (Order cancelled)</li>
<li>A parallel gateway, a diamond with a +, forking to two tasks, and another joining them</li>
<li>A collapsed sub-process with the + marker (Pick and pack), opening its own view</li>
<li>A data store reference, a cylinder (Stock database), read and written by data associations</li>
<li>A timer start event beginning a second flow in the same pool (Every morning at 8:00)</li>
<li>A timer intermediate catch event (Courier's pickup at 16:00)</li>
<li>A call activity, a task with a thick border (Hand parcel to courier)</li>
<li>A non-interrupting message boundary event, its rings dashed (Shopper asks where it is)</li>
<li>A none intermediate throw event, a double ring with no marker (Parcel dispatched)</li>
<li>A group, a dashed and dotted rounded rectangle round its members (Dispatch)</li>
<li>A message end event, a thick ring with a filled envelope (Shipping notice sent)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-pick-and-pack">
<h3><a href="/umlimator/examples/types/bpmn.html#view=pick-and-pack" target="_self">Pick and pack, the collapsed sub-process opened</a></h3>
<p>The collapsed sub-process Pick and pack opened (Enter or a double-click on it): its own view, the sub-process its <code>subject</code>, showing the flow it holds.</p>
</article>
<article class="ex-variant" id="view-order-to-shipment-expanded">
<h3><a href="/umlimator/examples/types/bpmn.html#view=order-to-shipment-expanded" target="_self">The same process, Pick and pack expanded</a></h3>
<p>The same process with Pick and pack expanded in place: a view that lists what a sub-process holds draws it as a frame round its flow instead of collapsed with the + marker.</p>
</article>
</div>
