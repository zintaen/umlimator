---
title: "Class diagram examples"
description: "Classes, their attributes and operations, and how they relate: 6 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Class diagram examples

<p class="ex-lead">Classes, their attributes and operations, and how they relate. The page below holds its 6 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-class.html" title="Class diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-class.html" target="_self">Open full screen<span class="visually-hidden"> (Class)</span></a><a href="../conformance/uml-class.html">Conformance<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.pdf" target="_self">PDF<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.json" target="_self">Model<span class="visually-hidden"> (Class)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-sales-classes-domain">
<h3><a href="/umlimator/examples/types/uml-class.html#view=sales-classes-domain" target="_self">Sales domain</a></h3>
<p class="ex-sub">compartments, packages, every line</p>
<p>Compartments of attributes and operations, an interface, an enumeration and a data type, composition and aggregation, generalization, realization, a <code>&lt;&lt;use&gt;&gt;</code> dependency and a note, each end with its role and multiplicity.</p>
</article>
<article class="ex-variant" id="view-sales-classes-payments-only">
<h3><a href="/umlimator/examples/types/uml-class.html#view=sales-classes-payments-only" target="_self">Payments only</a></h3>
<p class="ex-sub">a subject, collapsed compartments</p>
<p>Four classes of the sales domain named plainly from the view's <code>subject</code>, Order with its compartments collapsed, laid out down.</p>
</article>
<article class="ex-variant" id="view-members-members">
<h3><a href="/umlimator/examples/types/uml-class.html#view=members-members" target="_self">Member notation</a></h3>
<p class="ex-sub">visibility, static, derived, rows</p>
<p>Every member notation: the four visibilities (+ - # ~), a static attribute and operation underlined, a derived attribute, defaults and multiplicities, parameters with their direction, an abstract class and operation in italics, a primitive type and a data type, and a class cut to 3 rows then &quot;+k more&quot;.</p>
</article>
<article class="ex-variant" id="view-lines-lines">
<h3><a href="/umlimator/examples/types/uml-class.html#view=lines-lines" target="_self">Every kind of line</a></h3>
<p class="ex-sub">associations, usage, abstraction</p>
<p>Every kind of line a class view draws: an association navigable both ways, roles and multiplicities, composite and shared aggregation, an interface realization, a usage, an abstraction, a plain dependency with a name and a comment link, listed in the view's <code>edges</code>.</p>
</article>
<article class="ex-variant" id="view-hierarchy-right">
<h3><a href="/umlimator/examples/types/uml-class.html#view=hierarchy-right" target="_self">Hierarchy, laid out right</a></h3>
<p class="ex-sub">abstract class, interfaces, an enumeration</p>
<p>An abstract class with four specializations and two interfaces, laid out right (the default direction): generalizations and realizations as hollow triangles, an enumeration used by an interface.</p>
</article>
<article class="ex-variant" id="view-hierarchy-down">
<h3><a href="/umlimator/examples/types/uml-class.html#view=hierarchy-down" target="_self">Hierarchy, laid out down</a></h3>
<p class="ex-sub">direction down, pinned layout</p>
<p>The same hierarchy with <code>direction: &quot;down&quot;</code>: the general class above its specializations, the interfaces beside it and each class's place pinned in <code>layout</code>.</p>
</article>
</div>
