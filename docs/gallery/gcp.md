---
title: "Google Cloud diagram examples"
description: "Projects, regions, zones and the services in them: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Google Cloud diagram examples

<p class="ex-lead">Projects, regions, zones and the services in them. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/gcp.html" title="Google Cloud diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/gcp.html" target="_self">Open full screen<span class="visually-hidden"> (Google Cloud)</span></a><a href="../conformance/gcp.html">Conformance<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.pdf" target="_self">PDF<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.json" target="_self">Model<span class="visually-hidden"> (Google Cloud)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-gcp-gcp-on-gcp">
<h3><a href="/umlimator/examples/types/gcp.html#view=bookshop-gcp-gcp-on-gcp" target="_self">Bookshop on Google Cloud</a></h3>
<p class="ex-sub">projects, regions, zones, products</p>
<p>Groups nested as boxes titled with their kind, each product a card with its icon and full service name, lines to a group's border. On this site the icons are the vendor's own, fetched with Google's terms accepted; in a copy of this repository the diagram draws glyphs until you fetch them with <code>umlimator.py pack fetch gcp</code>. Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.</p>
</article>
<article class="ex-variant" id="view-groups-telemetry">
<h3><a href="/umlimator/examples/types/gcp.html#view=groups-telemetry" target="_self">Cycle hire dock telemetry</a></h3>
<p class="ex-sub">a generic group, lines to groups</p>
<p>Cycle hire dock telemetry: a generic group inside a project, a line that ends on that group's border, a line to a second project drawn as a closed card because nothing it holds is shown, and a label broken over two lines by the author.</p>
</article>
<article class="ex-variant" id="view-regions-two-regions">
<h3><a href="/umlimator/examples/types/gcp.html#view=regions-two-regions" target="_self">Library catalogue in two regions</a></h3>
<p class="ex-sub">two regions, laid out down</p>
<p>A library catalogue served from two regions of one project, laid out down: global products in the project, the same service in each region, and readers reaching DNS, the load balancer and the CDN directly.</p>
</article>
</div>
