---
title: "Entity-relationship diagram examples"
description: "Entities, their attributes and relationships, with cardinality: 4 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Entity-relationship diagram examples

<p class="ex-lead">Entities, their attributes and relationships, with cardinality. The page below holds its 4 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/er.html" title="Entity-relationship diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/er.html" target="_self">Open full screen<span class="visually-hidden"> (Entity-relationship)</span></a><a href="../conformance/er.html">Conformance<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.pdf" target="_self">PDF<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.json" target="_self">Model<span class="visually-hidden"> (Entity-relationship)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-schema-er-schema">
<h3><a href="/umlimator/examples/types/er.html#view=bookshop-schema-er-schema" target="_self">Bookshop schema</a></h3>
<p class="ex-sub">keys, crow's foot, junction table</p>
<p>Tables and their columns as rows, related in crow's foot or IDEF1X on one geometry: a composite key, a junction table, a nullable foreign key, a self-reference.</p>
</article>
<article class="ex-variant" id="view-docks-idef1x">
<h3><a href="/umlimator/examples/types/er.html#view=docks-idef1x" target="_self">Hire schema in IDEF1X</a></h3>
<p class="ex-sub">IDEF1X, dependent entities</p>
<p>A cycle hire schema in IDEF1X: identifying relationships make dock and hire_point dependent entities with rounded corners, a dot and P or Z at each child, a diamond at an optional parent.</p>
</article>
<article class="ex-variant" id="view-docks-crowsfoot-down">
<h3><a href="/umlimator/examples/types/er.html#view=docks-crowsfoot-down" target="_self">Hire schema in crow's foot, laid out down</a></h3>
<p class="ex-sub">crow's foot, laid out down</p>
<p>The same schema in crow's foot laid out down, showing all four end forms (exactly one, zero or one, one or more, zero or more) and a note on a table.</p>
</article>
<article class="ex-variant" id="view-rows-rows">
<h3><a href="/umlimator/examples/types/er.html#view=rows-rows" target="_self">Rows capped and sections hidden</a></h3>
<p class="ex-sub">rows capped, a section hidden</p>
<p>A library catalogue where the title table is cut to 4 rows then &quot;+n more&quot; and the copy table shows its key only, its other columns collapsed; nullable and unique columns marked.</p>
</article>
</div>
