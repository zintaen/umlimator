---
title: "Block definition diagram"
description: "Blocks, their properties and how they are composed: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Block definition diagram

<p class="ex-lead">The bookshop's delivery cargo e-bike, which carries book orders to local customers: the bike and its battery, motor, controller, lights and cargo box with its parcel lock, the dock at the shop's dispatch bay it may stand in, the interface block of the charge link, the constraint blocks behind its delivery range, and the value types they use. The page below opens on it, <a href="/umlimator/examples/types/sysml-block-definition.html#view=ebike-blocks" target="_self">The delivery bike's blocks</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/sysml-block-definition.html" title="Block definition diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/sysml-block-definition.html" target="_self">Open full screen<span class="visually-hidden"> (Block definition)</span></a><a href="../conformance/sysml-block-definition.html">Conformance<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.pdf" target="_self">PDF<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.json" target="_self">Model<span class="visually-hidden"> (Block definition)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The frame and its header, <code>bdd [Package] DeliveryFleet [The delivery bike's blocks]</code></li>
<li>Blocks with &lt;&lt;block&gt;&gt; and SysML's titled compartments, an empty one not drawn</li>
<li>A block's values and operations (DeliveryVehicle, CargoBox)</li>
<li>A generalization with a hollow triangle (CargoBike to DeliveryVehicle)</li>
<li>A <code>parts</code> compartment with multiplicities (<code>lights: Light [2]</code>)</li>
<li>A <code>references</code> compartment (<code>dock: Dock [0..1]</code>)</li>
<li>A <code>values</code> compartment with a default (<code>usableShare: Real = 0.9</code>)</li>
<li>A <code>constraints</code> compartment of constraint properties (<code>usable: UsableEnergy</code>)</li>
<li>A <code>ports</code> compartment with &lt;&lt;proxy&gt;&gt; and &lt;&lt;full&gt;&gt; ports and a plain port (Battery, Motor)</li>
<li>A <code>flow properties</code> compartment with each direction: in, out, inout</li>
<li>Composite associations with filled diamonds, roles and multiplicities, matching the parts</li>
<li>A plain association to a referenced block, navigable, <code>0..1</code></li>
<li>A conjugated port, its type starting <code>~</code> (Dock's <code>charge: ~ChargeInterface</code>)</li>
<li>A labelled dependency (Battery feeds PowerBus) and a &lt;&lt;use&gt;&gt; dependency (Dock to ChargeInterface)</li>
<li>An &lt;&lt;interfaceBlock&gt;&gt; with flow properties and an operation (ChargeInterface)</li>
<li>&lt;&lt;constraintBlock&gt;&gt;s with the expression in braces, their parameters, and one owning a constraint property (UsableEnergy, RangeEquation)</li>
<li>&lt;&lt;valueType&gt;&gt;s with a <code>quantity</code> compartment, <code>unit</code> and <code>quantityKind</code> (Distance, Energy, Mass, Voltage)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-ebike-blocks-right">
<h3><a href="/umlimator/examples/types/sysml-block-definition.html#view=ebike-blocks-right" target="_self">The same blocks, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the same blocks, compartments and lines.</p>
</article>
</div>
