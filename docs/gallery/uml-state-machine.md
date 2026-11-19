---
title: "State machine diagram examples"
description: "States and the transitions between them: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# State machine diagram examples

<p class="ex-lead">States and the transitions between them. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-state-machine.html" title="State machine diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-state-machine.html" target="_self">Open full screen<span class="visually-hidden"> (State machine)</span></a><a href="../conformance/uml-state-machine.html">Conformance<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.pdf" target="_self">PDF<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.json" target="_self">Model<span class="visually-hidden"> (State machine)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-order-states-order-life">
<h3><a href="/umlimator/examples/types/uml-state-machine.html#view=order-states-order-life" target="_self">An order's life</a></h3>
<p class="ex-sub">regions, history, choice</p>
<p>States with their activities, composite states as boxes with orthogonal regions, a choice, a fork and a join, a shallow history and a terminate, and transitions written <code>trigger [guard] / effect</code>.</p>
</article>
<article class="ex-variant" id="view-loan-loan">
<h3><a href="/umlimator/examples/types/uml-state-machine.html#view=loan-loan" target="_self">A library loan</a></h3>
<p class="ex-sub">deep history, a junction, a note</p>
<p>A library loan: a composite state left on a closure and re-entered by its deep history (H*), a junction merging two returns, an internal transition with a guard, a final state and a note on the history.</p>
</article>
<article class="ex-variant" id="view-coffee-machine">
<h3><a href="/umlimator/examples/types/uml-state-machine.html#view=coffee-machine" target="_self">A coffee machine, down</a></h3>
<p class="ex-sub">down, a closed composite</p>
<p>A coffee machine laid out down: entry, do and exit rows, two internal transitions, Brewing as a closed composite with UML's decomposition mark (its substates not shown), and Descaling with its activities collapsed.</p>
</article>
</div>
