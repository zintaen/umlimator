---
title: "Internal block diagram"
description: "The parts of a block and what flows between their ports: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Internal block diagram

<p class="ex-lead">Inside the bookshop's delivery cargo e-bike: the battery, controller, motor, lights and cargo box wired together, the dock at the dispatch bay the bike rests in, and the charge socket on the bike's own border, with what flows along each connector, in one SysML internal block diagram. The page below opens on it, <a href="/umlimator/examples/types/sysml-internal-block.html#view=inside-ebike" target="_self">Inside the cargo bike</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/sysml-internal-block.html" title="Internal block diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/sysml-internal-block.html" target="_self">Open full screen<span class="visually-hidden"> (Internal block)</span></a><a href="../conformance/sysml-internal-block.html">Conformance<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.pdf" target="_self">PDF<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.json" target="_self">Model<span class="visually-hidden"> (Internal block)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The frame: the subject block's box with its header <code>ibd [Block] CargoBike [Inside the cargo bike]</code></li>
<li>A port on the frame's own border (&lt;&lt;proxy&gt;&gt; chargeSocket : ChargeInterface) and a connector delegating it to a part's port</li>
<li>Proxy ports typed by an interface block, with a two-way flow arrow inside from its in and out flow properties (charge : ChargeInterface)</li>
<li>A conjugated port, its type written with <code>~</code> (dock's charge : ~ChargeInterface)</li>
<li>Part properties as boxes <code>name : Type [multiplicity]</code> (battery : Battery [1], controller : Controller [1])</li>
<li>Untyped ports as plain squares on their part's border, each named beside it (power, bus, supply, drive)</li>
<li>A reference property, a dashed box (dock : Dock [0..1])</li>
<li>Value properties as boxes <code>name : Type</code> (batteryCapacity : Energy, emptyRange : Distance)</li>
<li>Item flows: the item as the connector's label and a filled triangle pointing the way it flows (DCPower, PhaseCurrent, UnlockCode)</li>
<li>An item flowing against the connector's direction (DCPower from the dock to the battery, WheelSpeed from the motor to the controller)</li>
<li>A connector with no item flow (the bus between battery and controller)</li>
<li>Two connectors on one port (the controller's lights to both lights)</li>
<li>A full port, &lt;&lt;full&gt;&gt; beside it, set on its part's right side by <code>present</code> (sensor : SpeedSensor on the motor)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-inside-ebike-right">
<h3><a href="/umlimator/examples/types/sysml-internal-block.html#view=inside-ebike-right" target="_self">Inside the cargo bike, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down, with no port side set by hand: the same parts, ports and connectors, the frame's port on its left border.</p>
</article>
</div>
