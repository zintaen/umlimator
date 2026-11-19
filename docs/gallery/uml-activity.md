---
title: "Activity diagram examples"
description: "Actions, decisions and flows, in partitions: 4 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Activity diagram examples

<p class="ex-lead">Actions, decisions and flows, in partitions. The page below holds its 4 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-activity.html" title="Activity diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-activity.html" target="_self">Open full screen<span class="visually-hidden"> (Activity)</span></a><a href="../conformance/uml-activity.html">Conformance<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.pdf" target="_self">PDF<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.json" target="_self">Model<span class="visually-hidden"> (Activity)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-fulfil-activity-fulfil">
<h3><a href="/umlimator/examples/types/uml-activity.html#view=fulfil-activity-fulfil" target="_self">Fulfilling an order</a></h3>
<p class="ex-sub">lanes, decisions, forks, objects</p>
<p>Actions, object nodes and a data store, send and accept actions, decisions, merges, forks and joins, in lanes; a call behaviour action opens the activity it calls.</p>
</article>
<article class="ex-variant" id="view-fulfil-activity-take-payment">
<h3><a href="/umlimator/examples/types/uml-activity.html#view=fulfil-activity-take-payment" target="_self">Take payment</a></h3>
<p class="ex-sub">the activity a call opens</p>
<p>The activity the call behaviour action Take payment calls: its own actions and flows, opened from the fulfilling activity.</p>
</article>
<article class="ex-variant" id="view-loop-return-right">
<h3><a href="/umlimator/examples/types/uml-activity.html#view=loop-return-right" target="_self">A retry loop, laid out right</a></h3>
<p class="ex-sub">a loop, laid out right, no lanes</p>
<p>An activity with no lanes laid out right: a retry loop through a named merge, two decisions with <code>[yes]</code> and <code>[else]</code> guards, a send signal action, a flow final and an activity final, and a comment on a decision.</p>
</article>
<article class="ex-variant" id="view-lanes-rebalance">
<h3><a href="/umlimator/examples/types/uml-activity.html#view=lanes-rebalance" target="_self">Nested lanes, laid out right</a></h3>
<p class="ex-sub">nested lanes, object flows</p>
<p>Partitions nested in a partition (Operations holds the control room and the van crew), laid out right: a data store and an object node on object flows, then a send signal action that an accept event action in another lane takes up.</p>
</article>
</div>
