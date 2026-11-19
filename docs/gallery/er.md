---
title: "Entity-relationship diagram"
description: "Entities, their attributes and relationships, with cardinality: one example that shows all it draws, live."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Entity-relationship diagram

<p class="ex-lead">A bookshop's database: customers, their orders and order lines, the books and their authors, and payments, as seven tables related by their foreign keys, in crow's foot notation. The page below opens on it, <a href="/umlimator/examples/types/er.html#view=schema" target="_self">A bookshop's database</a>, live: pan, zoom, select and go into the cards that stack.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/types/er.html" title="Entity-relationship diagram, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/types/er.html" target="_self">Open full screen<span class="visually-hidden"> (Entity-relationship)</span></a><a href="../conformance/er.html">Conformance<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.pdf" target="_self">PDF<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.json" target="_self">Model<span class="visually-hidden"> (Entity-relationship)</span></a></div>

## What it shows {#shows}

<p>In the order you find them in the picture:</p>

<ol class="ex-shows">
<li>Tables as boxes, the name in a header, the key columns above a divider and the rest below it</li>
<li>Column marks: PK, FK, UK and ? for a nullable column (customer's referred_by is FK ?)</li>
<li>A composite primary key whose part is also a foreign key (order_line: order_id PK FK, line_no PK)</li>
<li>A table cut to 3 rows a section then &quot;+2 more&quot; (customer, <code>present</code> <code>rows</code>)</li>
<li>A section collapsed: book shows its keys only (<code>present</code> <code>collapsed</code> <code>columns</code>)</li>
<li>A self-reference: customer referred customer, zero or one to zero or more</li>
<li>Relationship labels on the lines: places, contains, sold as, paid by, referred</li>
<li>Identifying relationships drawn solid (order contains order_line, book and author to book_author)</li>
<li>Non-identifying relationships drawn dashed (customer places order, book sold as order_line)</li>
<li>Crow's foot's exactly one end, two bars (the 1 end of every relationship)</li>
<li>Crow's foot's zero or more end, a ring and a crow's foot (customer places orders 0..*)</li>
<li>Crow's foot's one or more end, a bar and a crow's foot (order contains order_line 1..*)</li>
<li>Crow's foot's zero or one end, a ring and a bar (order paid by payment 0..1)</li>
<li>A many-to-many relationship resolved by a junction table (book_author between book and author)</li>
<li>A note linked to order_line by a dashed line</li>
</ol>

## In another setting {#alternatives}

<p>The same example, where a setting cannot share the picture above:</p>

<div class="ex-variants">
<article class="ex-variant" id="view-schema-idef1x">
<h3><a href="/umlimator/examples/types/er.html#view=schema-idef1x" target="_self">The same database in IDEF1X</a></h3>
<p>In IDEF1X (<code>notation</code> <code>idef1x</code>) instead of crow's foot: the same tables and lines, a dot at the child end with P or Z, a hollow diamond at an optional parent, and dependent tables with rounded corners.</p>
</article>
</div>
