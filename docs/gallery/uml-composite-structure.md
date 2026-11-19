---
title: "Composite structure diagram"
description: "The parts inside a class, their ports and connectors: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Composite structure diagram

<p class="ex-lead">Inside a bookshop's OrderService: the parts it is built from, the ports it talks through, the connectors that join them, and the publish-subscribe collaboration its parts play roles in, in one composite structure diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-composite-structure.html#view=inside" target="_self">Inside the bookshop's OrderService</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-composite-structure.html" title="Composite structure diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-composite-structure.html" target="_self">Open full screen<span class="visually-hidden"> (Composite structure)</span></a><a href="../conformance/uml-composite-structure.html">Conformance<span class="visually-hidden"> (Composite structure)</span></a><a href="/umlimator/examples/types/uml-composite-structure.pdf" target="_self">PDF<span class="visually-hidden"> (Composite structure)</span></a><a href="/umlimator/examples/types/uml-composite-structure.json" target="_self">Model<span class="visually-hidden"> (Composite structure)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The subject, OrderService, as a box with its name in the top left</li>
<li>Ports on the subject's border, each pinned to a side with <code>present</code> <code>side</code>: api on the left, payments on the right</li>
<li>Parts as rectangles <code>name : Type [multiplicity]</code>: checkout : CheckoutFlow [1], pricing : PriceCalculator [1], orders : OrderRepository [1]</li>
<li>Parts of other multiplicities: mailers : Mailer [1..*] and listeners : OrderListener [0..*]</li>
<li>A shared part, drawn dashed (listeners)</li>
<li>Parts showing their types' ports: checkout's requests, quotes and charges, pricing's quotes</li>
<li>A connector from the subject's port in to a port on a part (api to checkout's requests)</li>
<li>A connector between ports of two parts (checkout's quotes to pricing's quotes)</li>
<li>A connector from a part's port out to the subject's port (checkout's charges to payments)</li>
<li>Connectors between parts with no ports (checkout to orders, orders to mailers, checkout to listeners)</li>
<li>A collaboration use, a dashed ellipse <code>orderEvents : PublishSubscribe</code></li>
<li>Role bindings, dashed with no ends, each labelled with its role (publisher, subscriber)</li>
<li>An open collaboration, a dashed ellipse with its name over a dashed line, holding its roles and the connector between them (PublishSubscribe)</li>
<li>A note linked to a port by a dashed line (on payments)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-inside-down">
<h3><a href="/umlimator/examples/types/uml-composite-structure.html#view=inside-down" target="_self">The same structure, laid out down</a></h3>
<p>Laid out down (<code>direction</code> <code>down</code>) instead of right, the payments port on the bottom side: the same parts, ports, connectors and collaboration.</p>
</article>
<article class="ex-variant" id="view-events">
<h3><a href="/umlimator/examples/types/uml-composite-structure.html#view=events" target="_self">PublishSubscribe as the subject</a></h3>
<p>PublishSubscribe as the view's <code>subject</code> instead of OrderService: a collaboration as the subject, its roles drawn as its parts. A view has one subject, so the two cannot share a picture.</p>
</article>
</div>
