---
title: "Package diagram"
description: "Packages and the dependencies between them: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Package diagram

<p class="ex-lead">How a bookshop's software is split into packages: sales at the centre, the catalog, payments and the shared types it builds on, fulfilment and reporting that depend on it, and wholesale that merges it, in one package diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-package.html#view=packages" target="_self">Bookshop packages</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-package.html" title="Package diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-package.html" target="_self">Open full screen<span class="visually-hidden"> (Package)</span></a><a href="../conformance/uml-package.html">Conformance<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.pdf" target="_self">PDF<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.json" target="_self">Model<span class="visually-hidden"> (Package)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Open packages drawn as boxes holding their elements, each name in a tab at the top left (fulfilment, sales, payments, catalog, shared)</li>
<li>A qualified name for an element whose own package the view does not show (couriers::Courier inside fulfilment)</li>
<li>A closed package, a folder with an empty tab and its name in the body (reporting, whose contents are not shown)</li>
<li>A note (a comment with a folded corner) linked by a dashed line to a package (wholesale)</li>
<li>A dependency with a label (fulfilment ships orders from sales)</li>
<li>Dependencies with a stereotype as their label (reporting &lt;&lt;use&gt;&gt; sales, sales &lt;&lt;use&gt;&gt; payments)</li>
<li>A package merge, dashed with an open arrowhead and &lt;&lt;merge&gt;&gt; (wholesale merges sales)</li>
<li>A package with a stereotype in its tab (&lt;&lt;subsystem&gt;&gt; sales)</li>
<li>Classifiers drawn by name and keyword: classes, &lt;&lt;entity&gt;&gt; Order, &lt;&lt;enumeration&gt;&gt; OrderStatus, &lt;&lt;interface&gt;&gt; Payable, &lt;&lt;dataType&gt;&gt; Money, &lt;&lt;primitive&gt;&gt; Isbn</li>
<li>A public package import, dashed with an open arrowhead and &lt;&lt;import&gt;&gt; (sales imports catalog, catalog imports shared)</li>
<li>A profile application to a profile drawn as a closed folder, &lt;&lt;apply&gt;&gt; and &lt;&lt;profile&gt;&gt; (sales applies BookshopConventions)</li>
<li>A package nested in another, a box inside a box (card inside payments)</li>
<li>A private package import, drawn &lt;&lt;access&gt;&gt; (payments accesses shared)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-packages-right">
<h3><a href="/umlimator/examples/types/uml-package.html#view=packages-right" target="_self">Bookshop packages, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same packages, classifiers and lines, the dependents on the left.</p>
</article>
</div>
