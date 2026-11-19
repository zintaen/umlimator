---
title: "Use case diagram"
description: "Actors and the use cases they take part in: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Use case diagram

<p class="ex-lead">What shoppers do at an online bookshop: who takes part, the use cases inside the shop, and how checking out includes paying and is extended by vouchers and gift wrapping, in one use case diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-use-case.html#view=shopping" target="_self">What shoppers do at the bookshop</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-use-case.html" title="Use case diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-use-case.html" target="_self">Open full screen<span class="visually-hidden"> (Use case)</span></a><a href="../conformance/uml-use-case.html">Conformance<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.pdf" target="_self">PDF<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.json" target="_self">Model<span class="visually-hidden"> (Use case)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Actors as stick figures with their names under them (Shopper, Member)</li>
<li>An actor with a stereotype under its figure (&lt;&lt;system&gt;&gt; Payment provider)</li>
<li>Generalization between two actors, a hollow triangle at the general one (Member is a Shopper)</li>
<li>A note (a comment with a folded corner) linked by a dashed line to a subject</li>
<li>A subject with nothing shown inside, drawn as a closed rectangle with its name (Warehouse)</li>
<li>A subject drawn as a box holding its use cases, its name in bold at the top left (Online bookshop)</li>
<li>Associations between an actor and a use case, plain lines</li>
<li>Use cases as ellipses holding their names</li>
<li>A use case with an extension points compartment under a divider (Check out: payment, extras)</li>
<li>An include, dashed with an open arrowhead and &lt;&lt;include&gt;&gt; (Check out includes Pay for the order, Track an order includes Sign in)</li>
<li>Extends naming their extension point and condition, <code>&lt;&lt;extend&gt;&gt; (payment) [the shopper has a voucher code]</code></li>
<li>Generalization between two use cases (Pay by card is a Pay for the order)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-shopping-right">
<h3><a href="/umlimator/examples/types/uml-use-case.html#view=shopping-right" target="_self">The same use cases, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same actors, use cases and lines, the actors on the left of the subject.</p>
</article>
</div>
