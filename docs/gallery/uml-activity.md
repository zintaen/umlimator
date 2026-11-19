---
title: "Activity diagram"
description: "Actions, decisions and flows, in partitions: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Activity diagram

<p class="ex-lead">A bookshop fulfilling an order, in nested lanes for the order desk and the warehouse beside the email service: taking the order, checking stock and restocking, then paying, packing and telling the customer in parallel before the parcel ships. The page below opens on it, <a href="/umlimator/examples/types/uml-activity.html#view=fulfil" target="_self">Fulfilling a bookshop order</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-activity.html" title="Activity diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-activity.html" target="_self">Open full screen<span class="visually-hidden"> (Activity)</span></a><a href="../conformance/uml-activity.html">Conformance<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.pdf" target="_self">PDF<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.json" target="_self">Model<span class="visually-hidden"> (Activity)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Lanes nested in a lane: Bookshop holding Order desk and Warehouse, beside Email service</li>
<li>An initial node, a filled circle</li>
<li>Actions as rounded boxes, long names wrapped (Take the next order from the queue)</li>
<li>A data store, &lt;&lt;datastore&gt;&gt; Stock levels, read by an object flow with a name (levels)</li>
<li>An object node (Order) with an object flow in and out</li>
<li>A decision with its question inside the diamond (All books in stock?) and guards on its exits ([yes], [else])</li>
<li>A note linked to the decision by a dashed line</li>
<li>A send signal action, a convex pentagon (Restock request), and an accept event action, a concave one (Books delivered)</li>
<li>A merge, a diamond two flows enter (books ready)</li>
<li>A fork, a bar sending three flows into three lanes</li>
<li>A call behaviour action with the rake at its bottom right (Take payment), opening the activity it calls</li>
<li>A join, a bar where payment and packing meet</li>
<li>A flow final, a circle with an X (after the email)</li>
<li>An activity final, a ring round a filled circle</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-fulfil-right">
<h3><a href="/umlimator/examples/types/uml-activity.html#view=fulfil-right" target="_self">The same activity, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the lanes become bands across the page, their names turned, the same nodes and flows.</p>
</article>
<article class="ex-variant" id="view-take-payment">
<h3><a href="/umlimator/examples/types/uml-activity.html#view=take-payment" target="_self">Take payment, the activity the call opens</a></h3>
<p>The activity the call behaviour action Take payment opens (Enter or a double-click on it): its own view, with a retry loop back through a merge and a named flow <code>paid [yes]</code>.</p>
</article>
</div>
