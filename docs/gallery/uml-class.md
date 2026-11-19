---
title: "Class diagram"
description: "Classes, their attributes and operations, and how they relate: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Class diagram

<p class="ex-lead">A bookshop's sales domain: who orders, what an order holds, how it is paid for, and the shared types the classes use, in one class diagram. The page below opens on it, <a href="/umlimator/examples/types/uml-class.html#view=sales" target="_self">A bookshop's sales domain</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/uml-class.html" title="Class diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/uml-class.html" target="_self">Open full screen<span class="visually-hidden"> (Class)</span></a><a href="../conformance/uml-class.html">Conformance<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.pdf" target="_self">PDF<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.json" target="_self">Model<span class="visually-hidden"> (Class)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>A note (a comment with a folded corner) linked to Order by a dashed line</li>
<li>Packages drawn as boxes holding their classes, their names in tabs: sales, payments with card nested inside it, shared</li>
<li>A package-qualified name: catalog::Book, whose package the view does not show</li>
<li>A class with a stereotype: &lt;&lt;entity&gt;&gt; over Order</li>
<li>Attributes with all four visibilities: + public, - private, # protected, ~ package</li>
<li>A derived attribute (/total), a default (status = draft) and a multiplicity on a member (name: String [0..1])</li>
<li>A static attribute and a static operation, underlined (placed, find)</li>
<li>Operations with parameters, a return type, and parameter directions (out was; in, the default, is not drawn)</li>
<li>A class cut to 3 rows then &quot;+2 more&quot; (Customer, <code>present</code> <code>rows</code>)</li>
<li>A compartment collapsed (Book's operations, <code>present</code> <code>collapsed</code>)</li>
<li>An association with a label, role names, multiplicities and a navigable end (Customer places orders 0..*)</li>
<li>An association navigable at both ends (Customer wishes for Book: readers *, wishlist *)</li>
<li>Composition, a filled diamond (Order owns its lines 1..*)</li>
<li>Aggregation, a hollow diamond (Order and its payments 0..*)</li>
<li>An enumeration with its literals (OrderStatus)</li>
<li>An interface and an interface realization, dashed with a hollow triangle (Order realizes Payable)</li>
<li>An abstract class and an abstract operation, in italics (Payment, settle())</li>
<li>Generalization, a hollow triangle at the general class, two subclasses sharing it (CardPayment, GiftCardPayment)</li>
<li>A usage, dashed with an open arrowhead and &lt;&lt;use&gt;&gt; (CardPayment uses CardGateway)</li>
<li>A dependency with the &lt;&lt;use&gt;&gt; stereotype (Payable on Money)</li>
<li>A dependency with a label (Book keyed by Isbn)</li>
<li>A data type (&lt;&lt;dataType&gt;&gt; Money) and a primitive type (&lt;&lt;primitive&gt;&gt; Isbn)</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-sales-right">
<h3><a href="/umlimator/examples/types/uml-class.html#view=sales-right" target="_self">The same domain, laid out right</a></h3>
<p>Laid out right (<code>direction</code> left at its default) instead of down: the same classes, lines and presentation options; the main view runs <code>down</code>, so that generalizations put the general class above.</p>
</article>
</div>
