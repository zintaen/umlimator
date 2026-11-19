---
title: "BPMN diagram examples"
description: "Business processes: events, tasks, gateways, pools and lanes: 4 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# BPMN diagram examples

<p class="ex-lead">Business processes: events, tasks, gateways, pools and lanes. The page below holds its 4 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/bpmn.html" title="BPMN diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/bpmn.html" target="_self">Open full screen<span class="visually-hidden"> (BPMN)</span></a><a href="../conformance/bpmn.html">Conformance<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.pdf" target="_self">PDF<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.json" target="_self">Model<span class="visually-hidden"> (BPMN)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-order-to-shipment-order-to-shipment">
<h3><a href="/umlimator/examples/types/bpmn.html#view=bookshop-order-to-shipment-order-to-shipment" target="_self">From order to shipment</a></h3>
<p class="ex-sub">pools, lanes, events, gateways</p>
<p>BPMN 2.0.2's Descriptive elements: pools and lanes, tasks, a collapsed sub-process that opens its own view, events with their markers, gateways, boundary events on an activity's border, message flows between pools, data, an annotation and a group.</p>
</article>
<article class="ex-variant" id="view-bookshop-order-to-shipment-pick-and-pack">
<h3><a href="/umlimator/examples/types/bpmn.html#view=bookshop-order-to-shipment-pick-and-pack" target="_self">Pick and pack</a></h3>
<p class="ex-sub">a collapsed sub-process, opened</p>
<p>The collapsed sub-process Pick and pack, opened as its own view: its tasks and events between its start and end.</p>
</article>
<article class="ex-variant" id="view-expanded-hold">
<h3><a href="/umlimator/examples/types/bpmn.html#view=expanded-hold" target="_self">Nested lanes, an expanded sub-process</a></h3>
<p class="ex-sub">nested lanes, expanded sub-process</p>
<p>One pool with lanes nested in a lane, an expanded sub-process drawn as a frame round its own flow and gateways, a none intermediate throw event, a non-interrupting timer boundary event (dashed) and a message end event.</p>
</article>
<article class="ex-variant" id="view-collaboration-billing">
<h3><a href="/umlimator/examples/types/bpmn.html#view=collaboration-billing" target="_self">Black-box pools, data and messages, laid out down</a></h3>
<p class="ex-sub">black-box pools, data, laid out down</p>
<p>A collaboration laid out down: two black-box pools, a timer start event, a data store and a data object each read by a task, message flows to and from the pools, a message catch event, a message end event and a text annotation on a directed association.</p>
</article>
</div>
