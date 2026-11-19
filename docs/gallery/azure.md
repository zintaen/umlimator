---
title: "Azure diagram"
description: "Subscriptions, resource groups, virtual networks and the services in them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Azure diagram

<p class="ex-lead">A bookshop's production system on Azure: the storefront and API behind Front Door, the order queue and worker, the database with a standby in a second region, and the monitoring beside them, each in its subscription, resource group, region, virtual network and subnet. The page below opens on it, <a href="/umlimator/examples/types/azure.html#view=on-azure" target="_self">Bookshop on Azure</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/azure.html" title="Azure diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/azure.html" target="_self">Open full screen<span class="visually-hidden"> (Azure)</span></a><a href="../conformance/azure.html">Conformance<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.pdf" target="_self">PDF<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.json" target="_self">Model<span class="visually-hidden"> (Azure)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Groups as boxes nested by ownership, each titled with its kind: a subscription, a resource group, a region (dashed), a virtual network and subnets</li>
<li>Service cards: the vendor icon on its tile (a plain square where no icon pack was fetched), the label, and the full service name under it in a smaller muted line (CDN and routing, Front Door and CDN Profiles)</li>
<li>Connectors, solid with an open arrow and a label (storefront, /api, paid order)</li>
<li>A label the author broke into two lines, kept as written (Order worker / queue trigger)</li>
<li>Lines leaving a subnet and its virtual network to reach services in the region (baskets, secrets)</li>
<li>A generic group holding services (Operations)</li>
<li>A service whose label is its full service name, drawn once (Application Insights)</li>
<li>A line starting at a group, drawn from its border (snet-apps: logs, metrics to Logs and alerts)</li>
<li>A group holding nothing the view shows, drawn as a closed card with its title, and a line ending on it (geo-replica to North Europe [Region])</li>
</ol>
