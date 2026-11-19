---
title: "Deployment diagram"
description: "Nodes, execution environments and the artifacts deployed on them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Deployment diagram

<p class="ex-lead">A bookshop in production: the shopper's device and browser, an edge proxy, the shop's data centre with its application server, Java runtime and database host, and the order queue, with the artifacts deployed on them and the components they manifest. The page below opens on it, <a href="/umlimator/examples/types/uml-deployment.html#view=production" target="_self">The bookshop in production</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-deployment.html" title="Deployment diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-deployment.html" target="_self">Open full screen<span class="visually-hidden"> (Deployment)</span></a><a href="../conformance/uml-deployment.html">Conformance<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.pdf" target="_self">PDF<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.json" target="_self">Model<span class="visually-hidden"> (Deployment)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A device drawn as a cube with &lt;&lt;device&gt;&gt; over its name (Shopper's device, Application server)</li>
<li>An execution environment nested in a device, &lt;&lt;executionEnvironment&gt;&gt; over its name (Web browser, Java 21 runtime)</li>
<li>Artifacts deployed by nesting, &lt;&lt;artifact&gt;&gt; over the name with the document icon (storefront.js, order-worker.jar, shop-api.jar)</li>
<li>A deployment line, dashed with an open arrowhead and &lt;&lt;deploy&gt;&gt; (routes.conf to the Edge proxy)</li>
<li>A node with a stereotype over its name (&lt;&lt;linux server&gt;&gt; Edge proxy, Database host)</li>
<li>Communication paths, plain solid lines with their protocols (HTTPS, HTTP, PostgreSQL wire protocol, AMQP)</li>
<li>A node holding nodes, three levels deep, each drawn as a cube inside its owner (Shop data centre, Application server, Java 21 runtime)</li>
<li>A deployment specification, &lt;&lt;deployment spec&gt;&gt; over its name (shop-api.yaml)</li>
<li>A dependency, dashed with an open arrowhead (shop-api.yaml to shop-api.jar)</li>
<li>A note linked to the deployment specification by a dashed line</li>
<li>Manifestations, dashed with &lt;&lt;manifest&gt;&gt;, from an artifact to the component it makes (order-worker.jar to Order worker, shop-api.jar to Shop API)</li>
<li>Components drawn with the component icon (Order worker, Shop API)</li>
<li>A plain node outside the data centre, joined by a path from a nested device (Order queue)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-production-right">
<h3><a href="/umlimator/examples/types/uml-deployment.html#view=production-right" target="_self">The same deployment, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same nodes, artifacts and lines, with one pin (<code>layout</code>, the order queue at column 4) so no line crosses another.</p>
</article>
</div>
