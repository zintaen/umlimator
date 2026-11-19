---
title: "Object diagram"
description: "Instances and the links between them at one moment: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Object diagram

<p class="ex-lead">One bookshop order the moment it is placed: ada, her order with its two order lines, the books they are for, the card that paid and the web till that took it, each instance with its slots. The page below opens on it, <a href="/umlimator/examples/types/uml-object.html#view=snapshot" target="_self">Order 1042, just placed</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-object.html" title="Object diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-object.html" target="_self">Open full screen<span class="visually-hidden"> (Object)</span></a><a href="../conformance/uml-object.html">Conformance<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.pdf" target="_self">PDF<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.json" target="_self">Model<span class="visually-hidden"> (Object)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A package drawn as a box holding the instances it owns (sales)</li>
<li>Instances with a name and a classifier, the head underlined (ada : Customer, order1042 : Order)</li>
<li>An instance with a stereotype: &lt;&lt;entity&gt;&gt; over order1042</li>
<li>Slots as <code>feature = value</code> rows, and a slot with no value (ada's name)</li>
<li>A long slot value cut to the instance's width with an ellipsis (giftNote)</li>
<li>A link from an instance to itself, drawn as a loop (ada referred)</li>
<li>Two links between one pair of instances, each with its own line and name (places, ships to)</li>
<li>Links with role names at their ends (buyer, orders, deliveries)</li>
<li>An instance with a name and no classifier (webTill)</li>
<li>A link with a stereotype before its label (&lt;&lt;audit&gt;&gt; took)</li>
<li>Links named by their association instead of a label (OrderHasLines)</li>
<li>Anonymous instances, only the classifier after the colon (: OrderLine)</li>
<li>A note linked to an instance by a dashed line</li>
<li>Instances shown without their package, named with a qualified name (catalog::middlemarch : Book)</li>
<li>A class drawn beside the instances, not underlined, with its attributes (Customer)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-snapshot-down">
<h3><a href="/umlimator/examples/types/uml-object.html#view=snapshot-down" target="_self">The same order, laid out down</a></h3>
<p>Laid out down (<code>direction</code> <code>down</code>) instead of right: the same instances, slots, links and package box.</p>
</article>
</div>
