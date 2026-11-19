---
title: "Component diagram examples"
description: "Components and the interfaces they provide and require: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Component diagram examples

<p class="ex-lead">Components and the interfaces they provide and require. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-component.html" title="Component diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-component.html" target="_self">Open full screen<span class="visually-hidden"> (Component)</span></a><a href="../conformance/uml-component.html">Conformance<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.pdf" target="_self">PDF<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.json" target="_self">Model<span class="visually-hidden"> (Component)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-components-components">
<h3><a href="/umlimator/examples/types/uml-component.html#view=bookshop-components-components" target="_self">Bookshop components</a></h3>
<p class="ex-sub">ports, ball and socket, artifacts</p>
<p>Components nested in components, ports on their borders, delegations inward, assembly connectors, provided and required interfaces as a ball and socket, artifacts and their manifestations.</p>
</article>
<article class="ex-variant" id="view-library-packages">
<h3><a href="/umlimator/examples/types/uml-component.html#view=library-packages" target="_self">Packages, realizations, an interface box</a></h3>
<p class="ex-sub">packages, realizations, &lt;&lt;use&gt;&gt;</p>
<p>Library components in packages, two classes realizing a component (dashed, hollow triangle), an interface drawn as a box with its operations, provided and required by dashed lines, a <code>&lt;&lt;call&gt;&gt;</code> dependency and a plain one, an artifact's <code>&lt;&lt;manifest&gt;&gt;</code> and a note.</p>
</article>
<article class="ex-variant" id="view-sockets-sockets">
<h3><a href="/umlimator/examples/types/uml-component.html#view=sockets-sockets" target="_self">Balls and sockets, laid out down</a></h3>
<p class="ex-sub">balls, sockets, ports, down</p>
<p>A cinema's booking laid out down: interfaces as balls with their sockets, typed ports (<code>seats : SeatPicker</code>) joined by an assembly, delegations into and out of a component's parts, and two parts joined directly.</p>
</article>
</div>
