---
title: "The Umlimator Atlas"
description: "Umlimator's own model, drawn with umlimator, in many views that open into each other."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# The Umlimator Atlas

<p class="ex-lead">Umlimator's own model, drawn with umlimator: its parts and who uses each (a map), its system context and containers (C4), the core module's packages in build order (a package diagram), the typed diagram families (a component diagram), the diff Action on a pull request (a sequence diagram) and umlimator's state machines (navigation, the story player, tours, the page's keys and the MCP page), joined by cards that open them.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/umlimator-atlas.html" title="The Umlimator Atlas, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/umlimator-atlas.html" target="_self">Open full screen<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.html#story=pull-request&amp;step=1" target="_self">A pull request, from push to comment<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.html#story=assistant&amp;step=1" target="_self">An assistant, then the reader<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.pdf" target="_self">PDF<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.json" target="_self">Model<span class="visually-hidden"> (The Umlimator Atlas)</span></a></div>

## Its views {#views}

<div class="ex-variants">
<article class="ex-variant" id="view-overview">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=overview" target="_self">Umlimator</a></h3>
<p class="ex-sub">Map</p>
<p>The atlas's root: umlimator's parts and who uses each, the Python parts in a box, line kinds (feeds, state, triggers) and weights, two cards whose views a host may load when opened, and a story along a pull request.</p>
</article>
<article class="ex-variant" id="view-context">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=context" target="_self">umlimator: system context</a></h3>
<p class="ex-sub">C4</p>
<p>The system context: the author and the reader as people, umlimator as the system, the AI assistant, GitHub and Chrome as external systems.</p>
</article>
<article class="ex-variant" id="view-containers">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=containers" target="_self">umlimator: containers</a></h3>
<p class="ex-sub">C4</p>
<p>The containers inside umlimator's dashed boundary, each with its technology, and the relationships the context implies.</p>
</article>
<article class="ex-variant" id="view-layers">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=layers" target="_self">The module's packages, in build order</a></h3>
<p class="ex-sub">Package</p>
<p>The core module's packages in src/, in the order tools/build.mjs concatenates them into lib/umlimator.js.</p>
</article>
<article class="ex-variant" id="view-registry">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=registry" target="_self">umlimator/all: the typed families</a></h3>
<p class="ex-sub">Component</p>
<p>The typed families as components, each depending on the core's registry, which the typed canvas looks up.</p>
</article>
<article class="ex-variant" id="view-diff-run">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=diff-run" target="_self">The diff Action on a pull request</a></h3>
<p class="ex-sub">Sequence</p>
<p>The diff Action on a pull request: an async start, calls and their replies, a self-call, and an <code>alt</code> frame on whether the token can write.</p>
</article>
<article class="ex-variant" id="view-machines">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=machines" target="_self">umlimator's state machines</a></h3>
<p class="ex-sub">Map</p>
<p>How umlimator's machines relate: the page and the MCP page drive render()'s handle, a box holding the story player, navigation and tours, which report every change to MapState.</p>
</article>
<article class="ex-variant" id="view-navigation">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=navigation" target="_self">Navigation</a></h3>
<p class="ex-sub">Map</p>
<p>Navigation's states, a move at a time, with its loops back and run order numbered.</p>
</article>
<article class="ex-variant" id="view-story">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=story" target="_self">Story player</a></h3>
<p class="ex-sub">Map</p>
<p>The story player's states, from entering a step to ended or stopped.</p>
</article>
<article class="ex-variant" id="view-tour">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=tour" target="_self">Tour and replay</a></h3>
<p class="ex-sub">Map</p>
<p>A tour's or a replay's states: riding, held, at the end or cut short.</p>
</article>
<article class="ex-variant" id="view-keys">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=keys" target="_self">The page's keys</a></h3>
<p class="ex-sub">Map</p>
<p>The order the page's keys close its layers in, as boxes of states.</p>
</article>
<article class="ex-variant" id="view-mcp">
<h3><a href="/umlimator/examples/umlimator-atlas.html#view=mcp" target="_self">The MCP page</a></h3>
<p class="ex-sub">Map</p>
<p>A page tool, step by step, from the assistant's call to the answer once a page has shown it.</p>
</article>
</div>
