---
title: "Profile diagram"
description: "Stereotypes that extend UML for a domain: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Profile diagram

<p class="ex-lead">The bookshop's modelling conventions as a profile: stereotypes for entities, owners, columns and modules with their tag definitions, a second Audit profile, and the sales package that applies both, its classes showing the tags they carry. The page below opens on it, <a href="/umlimator/examples/types/uml-profile.html#view=conventions-view" target="_self">The bookshop's modelling conventions</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-profile.html" title="Profile diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-profile.html" target="_self">Open full screen<span class="visually-hidden"> (Profile)</span></a><a href="../conformance/uml-profile.html">Conformance<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.pdf" target="_self">PDF<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.json" target="_self">Model<span class="visually-hidden"> (Profile)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A package drawn as a box holding classes (sales), a closed package inside it with a stereotype over its name (&lt;&lt;module&gt;&gt; payments)</li>
<li>A class with two stereotypes over its name, one from another profile qualified by it (&lt;&lt;aggregateRoot&gt;&gt;, &lt;&lt;Audit::record&gt;&gt; on Order)</li>
<li>A tag compartment per stereotype, headed &lt;&lt;name&gt;&gt;, each row <code>tag = value</code>, inherited tags included (retainDays, table, boundedContext)</li>
<li>A required stereotype the tool supplies, with its tags (&lt;&lt;owned&gt;&gt; team = checkout, on Order and OrderLine)</li>
<li>Attributes that apply a stereotype, listed with it in front and their tags in braces, a long row cut with an ellipsis (&lt;&lt;column&gt;&gt; placedAt)</li>
<li>A profile application: dashed, an open arrowhead at the profile, &lt;&lt;apply&gt;&gt; (sales to BookshopConventions, sales to Audit)</li>
<li>Profiles drawn as boxes titled &lt;&lt;profile&gt;&gt; (BookshopConventions, Audit)</li>
<li>Metaclass references with &lt;&lt;metaclass&gt;&gt; and no compartment (Class, Property, Package)</li>
<li>Stereotypes with &lt;&lt;stereotype&gt;&gt; and their tag definitions as attribute rows (<code>team: String [0..1]</code>, <code>indexed: Boolean = false</code>)</li>
<li>An extension marked required: a solid line, a filled triangle at the metaclass, {required} as its label (owned to Class)</li>
<li>Plain extensions to three different metaclasses (record to Class, column to Property, module to Package)</li>
<li>An abstract stereotype, its name in italics (record)</li>
<li>Generalizations between stereotypes, two deep (aggregateRoot to entity to record)</li>
<li>An enumeration owned by the profile, the type of a tag (ColumnKind, typing column's kind)</li>
<li>A note with a dashed link to the abstract stereotype</li>
<li>Two profiles defining one stereotype name (record), told apart by the qualified name <code>Audit::record</code></li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-conventions-right">
<h3><a href="/umlimator/examples/types/uml-profile.html#view=conventions-right" target="_self">The same conventions, laid out right</a></h3>
<p>Laid out right (<code>direction</code> <code>right</code>) instead of down: the same profiles, stereotypes and applying package.</p>
</article>
</div>
