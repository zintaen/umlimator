---
title: "Interaction overview diagram examples"
description: "An activity whose steps are interactions: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Interaction overview diagram examples

<p class="ex-lead">An activity whose steps are interactions. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-interaction-overview.html" title="Interaction overview diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-interaction-overview.html" target="_self">Open full screen<span class="visually-hidden"> (Interaction overview)</span></a><a href="../conformance/uml-interaction-overview.html">Conformance<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.pdf" target="_self">PDF<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.json" target="_self">Model<span class="visually-hidden"> (Interaction overview)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-buy-book-overview-buy-book">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=buy-book-overview-buy-book" target="_self">Buying a book</a></h3>
<p class="ex-sub">uses, inline interaction, loops</p>
<p>Interaction uses and an inline interaction drawn with its sequence diagram inside, joined by the activity's control nodes and flows; each use, and the inline interaction, opens its sequence view.</p>
</article>
<article class="ex-variant" id="view-rent-rent">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=rent-rent" target="_self">Renting a bike, laid out right</a></h3>
<p class="ex-sub">laid out right, flow final, a note</p>
<p>Four interaction uses laid out right, each opening its own sequence view; named flows, a decision with guards, a flow final node that ends one branch only, and a note on it.</p>
</article>
<article class="ex-variant" id="view-inline-return-book">
<h3><a href="/umlimator/examples/types/uml-interaction-overview.html#view=inline-return-book" target="_self">Returning a book: inline interactions</a></h3>
<p class="ex-sub">two inline interactions, a merge</p>
<p>Two inline interactions drawn as sd frames with their sequence diagrams inside, and an interaction use between them on one branch of a decision, joined again by a merge node, laid out down.</p>
</article>
</div>
