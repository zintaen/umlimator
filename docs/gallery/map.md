---
title: "Map"
description: "Layered architecture maps: cards, lines and boxes in views that open into each other, with stories, tours and lenses: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Map

<p class="ex-lead">A bookshop's systems on one map: the people who use it, the apps they use, the API at its heart with what it calls, stores and hands on, the support desk, and what is new, planned and switched off. The page below opens on it, <a href="/umlimator/examples/types/map.html#view=shop" target="_self">The bookshop's systems</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/map.html" title="Map, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/map.html" target="_self">Open full screen<span class="visually-hidden"> (Map)</span></a><a href="../guide/model.html">The model guide<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.pdf" target="_self">PDF<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.json" target="_self">Model<span class="visually-hidden"> (Map)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>The view's title and caption over the map</li>
<li>A card drawn by its kind: person (Shoppers), user (Shop staff), terminal (Admin CLI), browser app (Storefront), phone (Shop app), folder (Pricing), hexagon (Fraud check), cylinder (Orders), pipe (Order queue), robot (Support agent), page with a folded corner (returns.md), box in perspective (Hosts), dashed external card (Card gateway)</li>
<li>A card's own <code>shape</code> over its kind: Back office drawn as a window</li>
<li>A card with its name only, the sub-line kept for the panel (Admin CLI, <code>noSub</code>)</li>
<li>Logos on cards (Storefront React, Shop API FastAPI, Orders PostgreSQL)</li>
<li>Badges on cards, plain and in a tone (public, on call, backed up)</li>
<li>Change marks: a NEW card (Shop app), a PLANNED card dashed (Gift cards), a REMOVED card dashed and struck through (Reminder bot)</li>
<li>A main-step card with verb chips and an edit mark (Shop API: checkout, refund)</li>
<li>Line kinds in their colours: calls, feeds (charges, saves), triggers (checks), state (paid order, reads) and guard (if within 14 days)</li>
<li>Line weights 1 to 3 drawn as widths (POST /orders 3, order 2)</li>
<li>Steps in circles on the lines, numbers and a pill (1 to 6, and 3a)</li>
<li>A line with a sub-label (POST /orders over JSON)</li>
<li>Line styles over the kind: dashed (runs jobs), security (charges), async (paid order)</li>
<li>Added lines green and flowing (on the go, redeem), a removed line rose and dashed (nudges), an edit mark on a line (saves)</li>
<li>Boxes around cards, one nested in another (Data in Shop platform), with badges on their borders (EU, backed up nightly)</li>
<li>Tinted boxes, dashed with the title in their tone (Data in green, Support in violet)</li>
<li>A line ending on a box's border (Hosts runs Shop platform)</li>
<li>One pin (<code>layout</code>): the Card gateway at column 6, row 0, so the charges line clears the Data box</li>
<li>Two lenses in the page's Lenses menu: Who owns what (rings each card in its owner's tone) and Where the money goes (lights the feeds lines)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-shop-run">
<h3><a href="/umlimator/examples/types/map.html#view=shop-run" target="_self">An order, in run order</a></h3>
<p>As a numbered view (<code>render</code> <code>sequence</code>): the cards and lines a checkout touches, numbered in run order instead of the hand-set steps, with no boxes.</p>
</article>
</div>
