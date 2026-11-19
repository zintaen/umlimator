---
title: "Data flow diagram examples"
description: "Processes, data stores and external entities, and the data between them: 5 examples, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Data flow diagram examples

<p class="ex-lead">Processes, data stores and external entities, and the data between them. The page below holds its 5 examples: its overview has a card for each, and each card opens it. Pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/dfd.html" title="Data flow diagram examples, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/dfd.html" target="_self">Open full screen<span class="visually-hidden"> (Data flow)</span></a><a href="../conformance/dfd.html">Conformance<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.pdf" target="_self">PDF<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.json" target="_self">Model<span class="visually-hidden"> (Data flow)</span></a></div>

## The examples {#examples}

<div class="ex-variants">
<article class="ex-variant" id="view-bookshop-data-flow-dfd-level-1">
<h3><a href="/umlimator/examples/types/dfd.html#view=bookshop-data-flow-dfd-level-1" target="_self">Bookshop, level 1</a></h3>
<p class="ex-sub">processes, stores, entities</p>
<p>Level 1 in Yourdon notation: numbered processes, data stores and external entities joined by labelled data flows; a process opens its level.</p>
</article>
<article class="ex-variant" id="view-bookshop-data-flow-dfd-level-2-take-order">
<h3><a href="/umlimator/examples/types/dfd.html#view=bookshop-data-flow-dfd-level-2-take-order" target="_self">1 Take order</a></h3>
<p class="ex-sub">a level, checked for balance</p>
<p>Level 2 of process 1, Take order: its own processes and stores, checked for balance against the flows of its parent process.</p>
</article>
<article class="ex-variant" id="view-gane-sarson-rides">
<h3><a href="/umlimator/examples/types/dfd.html#view=gane-sarson-rides" target="_self">Rides, Gane and Sarson</a></h3>
<p class="ex-sub">Gane and Sarson symbols</p>
<p>Cycle hire rides in Gane and Sarson notation: processes as rounded rectangles with their number in a top band, data stores as open rectangles with an id box, external entities with a shadow, a request and its reply between one pair, and a note.</p>
</article>
<article class="ex-variant" id="view-context-context">
<h3><a href="/umlimator/examples/types/dfd.html#view=context-context" target="_self">Context diagram</a></h3>
<p class="ex-sub">a context diagram, process 0</p>
<p>A library's lending as one process, numbered 0, with the external entities it trades data with; the process opens its level 1.</p>
</article>
<article class="ex-variant" id="view-context-level-1">
<h3><a href="/umlimator/examples/types/dfd.html#view=context-level-1" target="_self">0 Lend books</a></h3>
<p class="ex-sub">level 1, a local store, down</p>
<p>Process 0 broken into 0.1 to 0.3, laid out down, with a local data store that the balance check against the context diagram leaves out.</p>
</article>
</div>
