---
title: "Profile diagram examples"
description: "Stereotypes that extend UML for a domain: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Profile diagram examples

<p class="ex-lead">Stereotypes that extend UML for a domain. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-profile.html" title="Profile diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-profile.html" target="_self">Open full screen<span class="visually-hidden"> (Profile)</span></a><a href="../conformance/uml-profile.html">Conformance<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.pdf" target="_self">PDF<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.json" target="_self">Model<span class="visually-hidden"> (Profile)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-profile-profile">
<h3><a href="/umlimator/examples/types/uml-profile.html#view=bookshop-profile-profile" target="_self">Bookshop conventions profile</a></h3>
<p class="ex-sub">stereotypes, extensions, tags</p>
<p>Stereotypes with tag definitions extending metaclasses, a required extension, a profile applied to a package, and an element's tags in a compartment per stereotype; stereotypes applied anywhere in the model are checked against it.</p>
</article>
<article class="ex-variant" id="view-abstract-fleet-profile">
<h3><a href="/umlimator/examples/types/uml-profile.html#view=abstract-fleet-profile" target="_self">An abstract stereotype and an enumeration tag</a></h3>
<p class="ex-sub">abstract stereotype, enumeration tag</p>
<p>A cycle hire profile whose abstract &lt;&lt;asset&gt;&gt; stereotype is specialized by &lt;&lt;vehicle&gt;&gt; and &lt;&lt;station&gt;&gt;, a tag typed by the profile's own enumeration, a tag with a default, and classes showing their tags in a compartment per stereotype, inherited tags included.</p>
</article>
<article class="ex-variant" id="view-two-two-profiles">
<h3><a href="/umlimator/examples/types/uml-profile.html#view=two-two-profiles" target="_self">Two profiles, one name, qualified</a></h3>
<p class="ex-sub">two profiles, qualified names</p>
<p>A library package applying two profiles that both define &lt;&lt;record&gt;&gt;, told apart as <code>Storage::record</code> and <code>Audit::record</code>, and a required extension of Package that puts &lt;&lt;owner&gt;&gt; over a closed package with no stereotype stored.</p>
</article>
</div>
