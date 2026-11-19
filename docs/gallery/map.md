---
title: "Map examples"
description: "Layered architecture maps: cards, lines and boxes in views that open into each other, with stories, tours and lenses: 6 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Map examples

<p class="ex-lead">Layered architecture maps: cards, lines and boxes in views that open into each other, with stories, tours and lenses. The page below holds its 6 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/map.html" title="Map examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/map.html" target="_self">Open full screen<span class="visually-hidden"> (Map)</span></a><a href="../guide/model.html">The model guide<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.pdf" target="_self">PDF<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.json" target="_self">Model<span class="visually-hidden"> (Map)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-shapes-shapes">
<h3><a href="/umlimator/examples/types/map.html#view=shapes-shapes" target="_self">Card shapes</a></h3>
<p class="ex-sub">every card shape</p>
<p>A card of each kind that has a shape, in the one style maps draw: people, a browser app, a phone, a window (a card's own <code>shape</code>), a terminal, an agent, a database, a queue, a file, a module, hosts, a hook and an external system.</p>
</article>
<article class="ex-variant" id="view-monorepo-boxed">
<h3><a href="/umlimator/examples/types/map.html#view=monorepo-boxed" target="_self">Packages, a box per folder</a></h3>
<p class="ex-sub">a box per folder</p>
<p>A map generated from a dependency list by <code>monorepo.py</code>: a card per package, a line per import, heavier with more imports, a box per folder, nested as the folders are.</p>
</article>
<article class="ex-variant" id="view-monorepo-plain">
<h3><a href="/umlimator/examples/types/map.html#view=monorepo-plain" target="_self">Packages, no boxes</a></h3>
<p class="ex-sub">the same cards, no boxes</p>
<p>The same packages and imports as the boxed view, with no boxes: the layout without folders.</p>
</article>
<article class="ex-variant" id="view-lines-lines">
<h3><a href="/umlimator/examples/types/map.html#view=lines-lines" target="_self">Line kinds, weights and steps</a></h3>
<p class="ex-sub">line kinds, weights, steps</p>
<p>A library's holds as lines of each kind, drawn in its colour: calls, feeds, triggers, state and guard; weights 1 to 3 as widths; numbered steps, 4a and 4b among them; and a line's sublabel under its label.</p>
</article>
<article class="ex-variant" id="view-boxes-boxes">
<h3><a href="/umlimator/examples/types/map.html#view=boxes-boxes" target="_self">Boxes, nested and tinted</a></h3>
<p class="ex-sub">nested, tinted boxes, lenses</p>
<p>A cafe chain's systems in boxes: two nested in a head office box, a tinted box with a tone, badges on a box's border, cards with owners, and two lenses, one ringing cards by owner and one lighting the lines that feed data.</p>
</article>
<article class="ex-variant" id="view-badges-badges">
<h3><a href="/umlimator/examples/types/map.html#view=badges-badges" target="_self">Badges, icons and edit marks</a></h3>
<p class="ex-sub">badges, icons, edit marks</p>
<p>A bakery's order cards with icons, badges as plain tabs and in tones, an edit mark on a card and on a line, and a card with <code>noSub</code>, its description kept for the details panel.</p>
</article>
</div>
