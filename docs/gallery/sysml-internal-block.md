---
title: "Internal block diagram examples"
description: "The parts of a block and what flows between their ports: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Internal block diagram examples

<p class="ex-lead">The parts of a block and what flows between their ports. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/sysml-internal-block.html" title="Internal block diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/sysml-internal-block.html" target="_self">Open full screen<span class="visually-hidden"> (Internal block)</span></a><a href="../conformance/sysml-internal-block.html">Conformance<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.pdf" target="_self">PDF<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.json" target="_self">Model<span class="visually-hidden"> (Internal block)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-ebike-structure-inside-ebike">
<h3><a href="/umlimator/examples/types/sysml-internal-block.html#view=ebike-structure-inside-ebike" target="_self">Inside the e-bike</a></h3>
<p class="ex-sub">parts, ports, item flows</p>
<p>A block's parts, references and values inside its frame; proxy and full ports with flow arrows and conjugation; connectors with item flows.</p>
</article>
<article class="ex-variant" id="view-dock-inside-station">
<h3><a href="/umlimator/examples/types/sysml-internal-block.html#view=dock-inside-station" target="_self">Inside the dock station</a></h3>
<p class="ex-sub">frame ports, delegation, a full port</p>
<p>A dock station's parts, a reference and a value; a proxy port on the frame delegating to the charger's port, a full port on the frame, conjugated proxy ports meeting, and item flows on four connectors.</p>
</article>
<article class="ex-variant" id="view-dock-inside-charger">
<h3><a href="/umlimator/examples/types/sysml-internal-block.html#view=dock-inside-charger" target="_self">Inside the charger</a></h3>
<p class="ex-sub">a part's own block, two delegations</p>
<p>The charger, a part of the dock, as the subject of its own diagram: its two frame ports delegate in to the breaker and out from the rectifier, with alternating current flowing between them.</p>
</article>
</div>
