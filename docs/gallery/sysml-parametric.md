---
title: "Parametric diagram"
description: "Constraint blocks that bind a system's values: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Parametric diagram

<p class="ex-lead">How far a city e-bike goes on a charge, in eco and in boost: its battery's usable energy and each mode's consumption bound to the parameters of the equations that give the two ranges. The page below opens on it, <a href="/umlimator/examples/types/sysml-parametric.html#view=range" target="_self">The e-bike's range in eco and boost</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/sysml-parametric.html" title="Parametric diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/sysml-parametric.html" target="_self">Open full screen<span class="visually-hidden"> (Parametric)</span></a><a href="../conformance/sysml-parametric.html">Conformance<span class="visually-hidden"> (Parametric)</span></a><a href="/umlimator/examples/types/sysml-parametric.pdf" target="_self">PDF<span class="visually-hidden"> (Parametric)</span></a><a href="/umlimator/examples/types/sysml-parametric.json" target="_self">Model<span class="visually-hidden"> (Parametric)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The frame's header naming its block: <code>par [Block] EBike [...]</code></li>
<li>Value properties as plain boxes <code>name : Type</code> (ecoConsumption : EnergyPerDistance, batteryCapacity : Energy)</li>
<li>Constraint properties as boxes with rounded corners, <code>name : ConstraintBlock</code>, the block's expression in braces under the name, cut to the box</li>
<li>Two constraint properties typed by one constraint block (eco and boost : RangeEquation)</li>
<li>Parameters as squares on a constraint property's border, <code>name : Type</code> beside each</li>
<li>Binding connectors, plain lines with no ends, from value properties to parameters</li>
<li>A binding between parameters of two constraint properties (usable's usable to the energy of eco and of boost)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-range-down">
<h3><a href="/umlimator/examples/types/sysml-parametric.html#view=range-down" target="_self">The same analysis, laid out down</a></h3>
<p>Laid out down (<code>direction</code> <code>down</code>) instead of right: the same values, constraint properties and bindings.</p>
</article>
<article class="ex-variant" id="view-trip-frame">
<h3><a href="/umlimator/examples/types/sysml-parametric.html#view=trip-frame" target="_self">TripRange, a constraint block as the frame</a></h3>
<p>The constraint block TripRange as the view's <code>subject</code> instead of the block EBike: its own parameters on the frame, bound to the parameters of the constraint properties it is built from. A view has one subject, so the two cannot share a picture.</p>
</article>
</div>
