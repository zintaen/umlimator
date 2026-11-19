---
title: "Google Cloud diagram"
description: "Projects, regions, zones and the services in them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Google Cloud diagram

<p class="ex-lead">The bookshop deployed on Google Cloud: shoppers reach a load balancer and a CDN, the shop's API and an order worker run in europe-west1 against a database replicated across two zones, and a reporting group sends monthly sales to the accounts project. The page below opens on it, <a href="/umlimator/examples/types/gcp.html#view=bookshop-gcp" target="_self">The bookshop on Google Cloud</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/gcp.html" title="Google Cloud diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/gcp.html" target="_self">Open full screen<span class="visually-hidden"> (Google Cloud)</span></a><a href="../conformance/gcp.html">Conformance<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.pdf" target="_self">PDF<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.json" target="_self">Model<span class="visually-hidden"> (Google Cloud)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Users in the person shape (Shoppers, Shop staff)</li>
<li>A project as a solid box titled <code>bookshop-prod [Project]</code></li>
<li>Product cards with the icon (a glyph without the pack), the label and under it the full service name (Load balancer, Cloud Load Balancing)</li>
<li>A label equal to the service name, drawn once (Cloud CDN)</li>
<li>Paths, solid with an open arrow and a label (HTTPS, /api, storefront)</li>
<li>A region and zones as dashed boxes (europe-west1, europe-west1-b, europe-west1-c)</li>
<li>A network and a subnetwork as solid boxes, nested inside the region (bookshop-vpc, data subnet)</li>
<li>Groups nested five deep: project, region, network, subnetwork, zone</li>
<li>Labels the author broke onto two lines (Database, primary)</li>
<li>A path between products in different groups (replicates, from zone b to zone c)</li>
<li>A generic group (reporting [Group])</li>
<li>A path from a group to a project, drawn to their borders (monthly sales)</li>
<li>A project holding nothing shown, a closed card (bookshop-accounts [Project])</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-gcp-right">
<h3><a href="/umlimator/examples/types/gcp.html#view=bookshop-gcp-right" target="_self">The same deployment, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the same groups, products and paths.</p>
</article>
</div>
