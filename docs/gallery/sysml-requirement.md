---
title: "Requirement diagram"
description: "Requirements and how they are derived, satisfied and verified: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Requirement diagram

<p class="ex-lead">What an online bookshop must do: its ordering requirements broken down by containment, a payments package, a requirement copied from a regulation, and the blocks that satisfy and the test cases that verify them, in one req frame. The page below opens on it, <a href="/umlimator/examples/types/sysml-requirement.html#view=requirements" target="_self">What the shop must do</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/sysml-requirement.html" title="Requirement diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/sysml-requirement.html" target="_self">Open full screen<span class="visually-hidden"> (Requirement)</span></a><a href="../conformance/sysml-requirement.html">Conformance<span class="visually-hidden"> (Requirement)</span></a><a href="/umlimator/examples/types/sysml-requirement.pdf" target="_self">PDF<span class="visually-hidden"> (Requirement)</span></a><a href="/umlimator/examples/types/sysml-requirement.json" target="_self">Model<span class="visually-hidden"> (Requirement)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The req frame with its pentagon header, the view's subject a package: req [Package] Online bookshop [What the shop must do]</li>
<li>Requirements as classifiers, &lt;&lt;requirement&gt;&gt; over the name and an id and text compartment (SHOP-1 Online ordering)</li>
<li>Containment, a line with a crosshair at the owner's end, two levels deep (Online ordering holds Search, Checkout and Refunds; Search holds Search speed)</li>
<li>All five requirement kinds over the name: &lt;&lt;functionalRequirement&gt;&gt;, &lt;&lt;performanceRequirement&gt;&gt;, &lt;&lt;interfaceRequirement&gt;&gt;, &lt;&lt;physicalRequirement&gt;&gt;, &lt;&lt;designConstraint&gt;&gt;</li>
<li>The risk and verifyMethod rows of an extended requirement (Search: risk = low, verifyMethod = demonstration)</li>
<li>A long text wrapped over several rows</li>
<li>&lt;&lt;copy&gt;&gt; from a requirement to the regulation whose text it repeats (Refunds to Distance selling refunds)</li>
<li>&lt;&lt;satisfy&gt;&gt; from a block to a requirement (Warehouse satisfies Parcel size, Storefront satisfies Checkout)</li>
<li>&lt;&lt;refine&gt;&gt; from a block to a requirement (Search index refines Search)</li>
<li>&lt;&lt;deriveReqt&gt;&gt; from a derived requirement to its source (Short checkout from Checkout)</li>
<li>&lt;&lt;trace&gt;&gt; between two requirements (Gateway interface to Checkout)</li>
<li>A package drawn as a box holding requirements and a block (Payments)</li>
<li>A text cut to 4 rows then &quot;+6 more&quot; (No stored card numbers, <code>present</code> <code>rows</code>)</li>
<li>&lt;&lt;verify&gt;&gt; from a test case to a requirement, &lt;&lt;testCase&gt;&gt; over its name (Search load test, Checkout walk-through)</li>
<li>A &lt;&lt;problem&gt;&gt; note and a &lt;&lt;rationale&gt;&gt; note, each linked to its requirement by a dashed line</li>
</ol>
