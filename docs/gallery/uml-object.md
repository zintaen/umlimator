---
title: "Object diagram examples"
description: "Instances and the links between them at one moment: 4 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Object diagram examples

<p class="ex-lead">Instances and the links between them at one moment. The page below holds its 4 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-object.html" title="Object diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-object.html" target="_self">Open full screen<span class="visually-hidden"> (Object)</span></a><a href="../conformance/uml-object.html">Conformance<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.pdf" target="_self">PDF<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.json" target="_self">Model<span class="visually-hidden"> (Object)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-order-objects-snapshot">
<h3><a href="/umlimator/examples/types/uml-object.html#view=order-objects-snapshot" target="_self">Order 1042, just placed</a></h3>
<p class="ex-sub">instances, slots and links</p>
<p>Instances of the bookshop's classes, each head <code>name : Classifier</code> underlined, slots as <code>feature = value</code>, and links with a name or roles by their ends.</p>
</article>
<article class="ex-variant" id="view-package-branch">
<h3><a href="/umlimator/examples/types/uml-object.html#view=package-branch" target="_self">A loan inside the lending package</a></h3>
<p class="ex-sub">a package box, stereotypes, a note</p>
<p>Library loan instances held in a package drawn as a box, two of them with an &lt;&lt;entity&gt;&gt; stereotype, an anonymous instance shown as <code>: Copy</code>, an instance with no classifier, a slot with no value, a link named by its association, and a note on the anonymous copy.</p>
</article>
<article class="ex-variant" id="view-package-unboxed">
<h3><a href="/umlimator/examples/types/uml-object.html#view=package-unboxed" target="_self">The same loan, names qualified</a></h3>
<p class="ex-sub">owner hidden, names qualified, down</p>
<p>The same instances without their package, so each is named <code>lending::loan7 : Loan</code>, laid out down.</p>
</article>
<article class="ex-variant" id="view-classes-beside">
<h3><a href="/umlimator/examples/types/uml-object.html#view=classes-beside" target="_self">Two classes beside their instances</a></h3>
<p class="ex-sub">classes, two links, a loop</p>
<p>Cycle hire docks and a bike drawn beside the Dock and Bike classes their slots are checked against, two links between one pair each on its own line, and a link from an instance to itself drawn as a loop.</p>
</article>
</div>
