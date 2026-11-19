---
title: "Deployment diagram examples"
description: "Nodes, execution environments and the artifacts deployed on them: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Deployment diagram examples

<p class="ex-lead">Nodes, execution environments and the artifacts deployed on them. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-deployment.html" title="Deployment diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-deployment.html" target="_self">Open full screen<span class="visually-hidden"> (Deployment)</span></a><a href="../conformance/uml-deployment.html">Conformance<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.pdf" target="_self">PDF<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.json" target="_self">Model<span class="visually-hidden"> (Deployment)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-deployment-production">
<h3><a href="/umlimator/examples/types/uml-deployment.html#view=bookshop-deployment-production" target="_self">Production</a></h3>
<p class="ex-sub">nodes, devices, artifacts</p>
<p>Nodes, devices and execution environments as cubes, nested; artifacts deployed by nesting or by a <code>&lt;&lt;deploy&gt;&gt;</code> line; deployment specifications and communication paths.</p>
</article>
<article class="ex-variant" id="view-docks-docks">
<h3><a href="/umlimator/examples/types/uml-deployment.html#view=docks-docks" target="_self">Dock network, laid out down</a></h3>
<p class="ex-sub">nested nodes, laid out down</p>
<p>A bike dock network laid out down: a node inside a node inside a data centre, execution environments on devices, a stereotyped device, a deployment specification and paths that end on a box's border.</p>
</article>
<article class="ex-variant" id="view-lines-lines">
<h3><a href="/umlimator/examples/types/uml-deployment.html#view=lines-lines" target="_self">Deployed by lines</a></h3>
<p class="ex-sub">&lt;&lt;deploy&gt;&gt; and &lt;&lt;manifest&gt;&gt; lines</p>
<p>A library catalogue whose artifacts stand apart from their targets: each deployed by a dashed <code>&lt;&lt;deploy&gt;&gt;</code> line, a deployment specification deployed the same way, <code>&lt;&lt;manifest&gt;&gt;</code> lines to components and stereotyped server nodes.</p>
</article>
</div>
