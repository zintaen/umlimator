---
title: "Timing diagram examples"
description: "How lifelines change state along a time axis: 3 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Timing diagram examples

<p class="ex-lead">How lifelines change state along a time axis. The page below holds its 3 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-timing.html" title="Timing diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-timing.html" target="_self">Open full screen<span class="visually-hidden"> (Timing)</span></a><a href="../conformance/uml-timing.html">Conformance<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.pdf" target="_self">PDF<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.json" target="_self">Model<span class="visually-hidden"> (Timing)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-timing-one-charge">
<h3><a href="/umlimator/examples/types/uml-timing.html#view=bookshop-timing-one-charge" target="_self">One charge</a></h3>
<p class="ex-sub">states, values, constraints</p>
<p>Lifelines on one linear time ruler, each a step line through its states or a band of values, messages at their times, duration and time constraints.</p>
</article>
<article class="ex-variant" id="view-values-unlock">
<h3><a href="/umlimator/examples/types/uml-timing.html#view=values-unlock" target="_self">States and a value lifeline</a></h3>
<p class="ex-sub">a value lifeline, async messages</p>
<p>Two state lifelines and one drawn as a band of values (<code>present.&lt;lifeline&gt;.as: &quot;values&quot;</code>), in seconds: asynchronous messages, one with a <code>&lt;&lt;signal&gt;&gt;</code> stereotype, a duration constraint between two lifelines and a time constraint.</p>
</article>
<article class="ex-variant" id="view-charging-charging">
<h3><a href="/umlimator/examples/types/uml-timing.html#view=charging-charging" target="_self">Minutes, calls and overlapping constraints</a></h3>
<p class="ex-sub">minutes, call and reply, overlaps</p>
<p>A longer run in minutes: a call and its reply, an asynchronous message, a battery's value band, and overlapping duration constraints on one lifeline drawn on their own levels.</p>
</article>
</div>
