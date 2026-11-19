---
title: "Azure diagram examples"
description: "Subscriptions, resource groups, virtual networks and the services in them: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Azure diagram examples

<p class="ex-lead">Subscriptions, resource groups, virtual networks and the services in them. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/azure.html" title="Azure diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/azure.html" target="_self">Open full screen<span class="visually-hidden"> (Azure)</span></a><a href="../conformance/azure.html">Conformance<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.pdf" target="_self">PDF<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.json" target="_self">Model<span class="visually-hidden"> (Azure)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-azure-az-on-azure">
<h3><a href="/umlimator/examples/types/azure.html#view=bookshop-azure-az-on-azure" target="_self">Bookshop on Azure</a></h3>
<p class="ex-sub">subscriptions, groups, networks</p>
<p>Subscriptions, resource groups, regions, virtual networks and subnets as nested boxes, each service a card with its icon and full service name. On this site the icons are the vendor's own, fetched with Microsoft's terms accepted; in a copy of this repository the diagram draws glyphs until you fetch them with <code>umlimator.py pack fetch azure</code>. Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.</p>
</article>
<article class="ex-variant" id="view-regions-regions">
<h3><a href="/umlimator/examples/types/azure.html#view=regions-regions" target="_self">Two regions, laid out down</a></h3>
<p class="ex-sub">two regions, laid out down</p>
<p>Two dashed regions in one resource group, each running the same pair of services behind a traffic manager, laid out down; a label broken over two lines, and lines that start at a region's border. Icons come from the pack you fetch, as on the first card.</p>
</article>
<article class="ex-variant" id="view-landing-landing">
<h3><a href="/umlimator/examples/types/azure.html#view=landing-landing" target="_self">Closed subscriptions and a generic group</a></h3>
<p class="ex-sub">closed subscriptions, a generic group</p>
<p>Three subscriptions whose services the view hides, each drawn as a closed card, joined by lines that end on the groups themselves, and a generic group holding two services. Icons come from the pack you fetch, as on the first card.</p>
</article>
</div>
