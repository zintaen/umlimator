---
title: "Package diagram examples"
description: "Packages and the dependencies between them: 4 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Package diagram examples

<p class="ex-lead">Packages and the dependencies between them. The page below holds its 4 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-package.html" title="Package diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-package.html" target="_self">Open full screen<span class="visually-hidden"> (Package)</span></a><a href="../conformance/uml-package.html">Conformance<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.pdf" target="_self">PDF<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.json" target="_self">Model<span class="visually-hidden"> (Package)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-packages-packages">
<h3><a href="/umlimator/examples/types/uml-package.html#view=bookshop-packages-packages" target="_self">Bookshop packages</a></h3>
<p class="ex-sub">nesting, import, access, merge</p>
<p>Packages as boxes holding what they own, a package inside a package, two classes named Order in two packages, <code>&lt;&lt;import&gt;&gt;</code>, <code>&lt;&lt;access&gt;&gt;</code>, <code>&lt;&lt;merge&gt;&gt;</code> and a dependency between them, and a profile applied by <code>&lt;&lt;apply&gt;&gt;</code>.</p>
</article>
<article class="ex-variant" id="view-closed-closed">
<h3><a href="/umlimator/examples/types/uml-package.html#view=closed-closed" target="_self">Cycle hire packages, closed</a></h3>
<p class="ex-sub">closed folders, stereotypes, a note</p>
<p>Five packages with none of their contents in the view, so each is drawn as a closed folder with its name in the body; <code>&lt;&lt;subsystem&gt;&gt;</code> and <code>&lt;&lt;library&gt;&gt;</code> stereotypes, a public import, a private import drawn as <code>&lt;&lt;access&gt;&gt;</code>, a <code>&lt;&lt;use&gt;&gt;</code> dependency and a note on one package.</p>
</article>
<article class="ex-variant" id="view-nested-nested">
<h3><a href="/umlimator/examples/types/uml-package.html#view=nested-nested" target="_self">Library packages, three deep</a></h3>
<p class="ex-sub">three levels deep, laid out down</p>
<p>A package inside a package inside a package, each box holding its classes, an enumeration and an interface; an import from lending to catalogue, and <code>&lt;&lt;use&gt;&gt;</code> and <code>&lt;&lt;call&gt;&gt;</code> dependencies that cross the box borders.</p>
</article>
<article class="ex-variant" id="view-nested-qualified">
<h3><a href="/umlimator/examples/types/uml-package.html#view=nested-qualified" target="_self">Library classes by qualified name</a></h3>
<p class="ex-sub">qualified names from a subject</p>
<p>The same classes with no package drawn: the view's <code>subject</code> is the library package, so each class is named by the packages between it and the subject, such as lending::holds::Hold.</p>
</article>
</div>
