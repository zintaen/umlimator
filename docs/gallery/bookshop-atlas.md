---
title: "Bookshop"
description: "An online bookshop modelled end to end in one model: many views of many diagram types that open into each other."
aside: false
pageClass: gallery-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Bookshop

<p class="ex-lead">An online bookshop modelled end to end as one model: a map of its systems and the people around them, which shows everything a map draws, opens into its C4 views, the shopper's use cases, buying a book step by step, its components and sales domain, an order's life, the database, the data flows, fulfilling and paying, the order's way from basket to courier in BPMN, returns, the deployment in production and on three clouds, and the plan for opening the shop. The same names run through every view.</p>

<div class="ex-frame"><iframe src="/umlimator/examples/bookshop-atlas.html" title="Bookshop, live" loading="lazy"></iframe></div>
<div class="ex-links"><a href="/umlimator/examples/bookshop-atlas.html" target="_self">Open full screen<span class="visually-hidden"> (Bookshop)</span></a><a href="/umlimator/examples/bookshop-atlas.pdf" target="_self">PDF<span class="visually-hidden"> (Bookshop)</span></a><a href="/umlimator/examples/bookshop-atlas.json" target="_self">Model<span class="visually-hidden"> (Bookshop)</span></a></div>

## Its views {#views}

<div class="ex-variants">
<article class="ex-variant" id="view-overview">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=overview" target="_self">Bookshop</a></h3>
<p class="ex-sub">Map</p>
<p>The atlas's root and the map's example: the bookshop's systems and the people and partners around them, with every card kind, boxes nested and tinted, badges, change marks, line kinds, weights, styles and steps, and two lenses. Each card that stands for a part of the business opens the view that tells it.</p>
<p>The map's example: what it shows, in the order you find it in the picture:</p>
<ol class="ex-shows">
<li>The view's title and caption over the map</li>
<li>A card drawn by its kind: person (Shopper), user (Shop staff), browser app (Storefront), phone (Shop app), terminal (Admin CLI), folder (Pricing), hexagon (Fraud check), cylinder (Database), pipe (Order queue), robot (Support agent), page with a folded corner (returns.md, Opening plan), box in perspective (Hosting), dashed external card (Payment provider, Email service, Courier), AI card (Reminder bot), backend card (Shop API, Order worker, Warehouse, Gift cards)</li>
<li>A card's own <code>shape</code> over its kind: Back office drawn as a window</li>
<li>A card with its name only, the sub-line kept for the panel (Admin CLI, <code>noSub</code>)</li>
<li>Logos and icons on cards (Storefront React, Shop API FastAPI, Database PostgreSQL, Reminder bot a robot)</li>
<li>Badges on cards, plain and in a tone (public, on call, backed up)</li>
<li>Change marks: a NEW card (Shop app), a PLANNED card dashed (Gift cards), a REMOVED card dashed and struck through (Reminder bot)</li>
<li>A main-step card with verb chips and an edit mark (Shop API: checkout, refund)</li>
<li>Cards that open a view of their own, marked in their top corner: every card but the Shop app, Back office, Admin CLI, Fraud check, Gift cards, Support agent, Reminder bot, Email service and Courier opens the diagram that tells its part</li>
<li>Line kinds in their colours: calls, feeds (charges cards, oldest first, parcels), triggers (checks, pick lists), state (reads, writes; paid order; reads) and guard (refund if within 14 days)</li>
<li>Line weights 1 to 3, shown as widths on hover, selection and keyboard focus (POST /orders 3, browses and orders 2)</li>
<li>Steps in circles on the lines, numbers and a pill (1 to 6, and 3a)</li>
<li>A line with a sub-label (POST /orders over JSON over HTTPS)</li>
<li>Line styles over the kind: dashed (runs jobs), security (charges cards), async (paid order)</li>
<li>Added lines green and flowing (on the go, redeems), a removed line rose and dashed (nudges), an edit mark on a line (reads, writes)</li>
<li>Boxes around cards, one nested in another (Data in Bookshop), with badges on their borders (EU, backed up nightly)</li>
<li>Tinted boxes, dashed with the title in their tone (Data in green, Support in violet)</li>
<li>A line ending on a box's border (Hosting runs the Bookshop)</li>
<li>Pins (<code>layout</code>): each card at its column and row, so the lines run left to right and cross nothing</li>
<li>Two lenses in the page's Lenses menu: Who owns what (rings each card in its owner's tone) and Where the money goes (lights the feeds lines)</li>
</ol>
</article>
<article class="ex-variant" id="view-overview-run">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=overview-run" target="_self">An order, in run order</a></h3>
<p class="ex-sub">Map</p>
<p>The same map's checkout as a numbered view (<code>render: sequence</code>): the cards and lines a checkout touches, numbered in run order, with no boxes. The Pricing card opens it.</p>
</article>
<article class="ex-variant" id="view-c4-context">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=c4-context" target="_self">Bookshop: system context</a></h3>
<p class="ex-sub">C4</p>
<p>The system context: the shopper and the shop staff as people, the bookshop as the system, and the payment provider, the email service and the courier as external systems.</p>
</article>
<article class="ex-variant" id="view-shopping">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=shopping" target="_self">Shopping</a></h3>
<p class="ex-sub">Use case</p>
<p>What a shopper does with the shop: use cases inside the online bookshop's boundary, with include and extend relationships and a member who is a kind of shopper.</p>
</article>
<article class="ex-variant" id="view-c4-containers">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=c4-containers" target="_self">Bookshop: containers</a></h3>
<p class="ex-sub">C4</p>
<p>The containers inside the bookshop's boundary, the storefront, the shop API, the order worker, the database and the order queue, each with its technology.</p>
</article>
<article class="ex-variant" id="view-c4-components">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=c4-components" target="_self">Shop API: components</a></h3>
<p class="ex-sub">C4</p>
<p>The shop API's components: the catalogue, checkout, accounts and sign-in, the payment client and the order store.</p>
</article>
<article class="ex-variant" id="view-c4-placing-an-order">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=c4-placing-an-order" target="_self">Placing an order</a></h3>
<p class="ex-sub">C4</p>
<p>Placing an order as a C4 dynamic view: numbered steps from the shopper through the storefront, the API, the payment provider and the queue to the courier.</p>
</article>
<article class="ex-variant" id="view-buy-book">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=buy-book" target="_self">Buying a book</a></h3>
<p class="ex-sub">Interaction overview</p>
<p>Buying a book as an interaction overview: find a book, check out, a decision on whether payment was accepted, then the receipt and the queued order in parallel.</p>
</article>
<article class="ex-variant" id="view-find-book">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=find-book" target="_self">Find a book</a></h3>
<p class="ex-sub">Sequence</p>
<p>Finding a book: the shopper searches through the storefront and the API answers.</p>
</article>
<article class="ex-variant" id="view-buy-checkout">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=buy-checkout" target="_self">Check out</a></h3>
<p class="ex-sub">Sequence</p>
<p>Checking out: the storefront calls the API, which asks the payment provider to charge the card.</p>
</article>
<article class="ex-variant" id="view-email-receipt">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=email-receipt" target="_self">Email the receipt</a></h3>
<p class="ex-sub">Sequence</p>
<p>Emailing the receipt: the API sends it through the email service to the shopper.</p>
</article>
<article class="ex-variant" id="view-queue-order">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=queue-order" target="_self">Queue the order</a></h3>
<p class="ex-sub">Sequence</p>
<p>Queueing the order: the API puts it on the queue and the order worker takes it.</p>
</article>
<article class="ex-variant" id="view-components">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=components" target="_self">Bookshop components</a></h3>
<p class="ex-sub">Component</p>
<p>The bookshop's components and their Orders and SignIn interfaces, the information that flows between them, and the image the shop API manifests in.</p>
</article>
<article class="ex-variant" id="view-domain">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=domain" target="_self">Sales domain</a></h3>
<p class="ex-sub">Class</p>
<p>The sales domain as classes: Customer, Order, OrderLine, Book, the Payable interface, Payment and CardPayment, the OrderStatus enumeration and Money, with a note on the order's total.</p>
</article>
<article class="ex-variant" id="view-payments-only">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=payments-only" target="_self">Payments only</a></h3>
<p class="ex-sub">Class</p>
<p>The same domain filtered to payments: Order, Payable, Payment and CardPayment.</p>
</article>
<article class="ex-variant" id="view-order-life">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=order-life" target="_self">An order's life</a></h3>
<p class="ex-sub">State machine</p>
<p>An order's life as a state machine: placed, a choice on whether it was prepaid, fulfilling with picking and capturing payment between a fork and a join, in delivery with a shallow history state, cancelled with a terminate, and delivered.</p>
</article>
<article class="ex-variant" id="view-snapshot">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=snapshot" target="_self">Order 1042, just placed</a></h3>
<p class="ex-sub">Object</p>
<p>Order 1042 just after it was placed: Ada's order, its two lines, the books Middlemarch and Frankenstein, and the card payment, as objects with their slots.</p>
</article>
<article class="ex-variant" id="view-packages">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=packages" target="_self">Bookshop packages</a></h3>
<p class="ex-sub">Package</p>
<p>The bookshop's packages, shared, catalog, sales and payments, with their imports and a merge, a wholesale package with an Order of its own, and the conventions profile applied.</p>
</article>
<article class="ex-variant" id="view-profile">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=profile" target="_self">Bookshop conventions profile</a></h3>
<p class="ex-sub">Profile</p>
<p>The modelling conventions as a profile: the entity and aggregateRoot stereotypes on Class, owned and column on Property, applied to the sales package's Order.</p>
</article>
<article class="ex-variant" id="view-internals">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=internals" target="_self">Inside OrderService</a></h3>
<p class="ex-sub">Composite structure</p>
<p>Inside OrderService: its ports, its parts checkout, pricing, orders and listeners, and a publish-subscribe collaboration for the order events.</p>
</article>
<article class="ex-variant" id="view-order-flows">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=order-flows" target="_self">What travels with an order</a></h3>
<p class="ex-sub">Information flow</p>
<p>What travels with an order: the order, the card details, the receipt and the stock level, conveyed between the shopper, the storefront, the API, the payment provider, the warehouse and the email service.</p>
</article>
<article class="ex-variant" id="view-er-schema">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=er-schema" target="_self">Bookshop schema</a></h3>
<p class="ex-sub">Entity-relationship</p>
<p>The bookshop's database: customer, order, order_line, book, author, book_author and payment, with their keys and cardinalities.</p>
</article>
<article class="ex-variant" id="view-dfd-level-1">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=dfd-level-1" target="_self">Bookshop, level 1</a></h3>
<p class="ex-sub">Data flow</p>
<p>The bookshop at level 1 of a data flow diagram: take order, take payment and ship order, the books and orders stores, and the shopper, the payment provider and the courier.</p>
</article>
<article class="ex-variant" id="view-dfd-level-2-take-order">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=dfd-level-2-take-order" target="_self">1 Take order</a></h3>
<p class="ex-sub">Data flow</p>
<p>Take order, one level down: check the basket, total the order and record it, with the same stores and the shopper.</p>
</article>
<article class="ex-variant" id="view-fulfil">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=fulfil" target="_self">Fulfilling an order</a></h3>
<p class="ex-sub">Activity</p>
<p>Fulfilling an order as an activity in swimlanes for the order worker, the warehouse and the email service: a stock check with a restock loop, payment and packing in parallel, and the handover to the carrier.</p>
</article>
<article class="ex-variant" id="view-take-payment">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=take-payment" target="_self">Take payment</a></h3>
<p class="ex-sub">Activity</p>
<p>Take payment, the action fulfilling calls: charge the card, then record the payment on the order.</p>
</article>
<article class="ex-variant" id="view-one-charge">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=one-charge" target="_self">One charge</a></h3>
<p class="ex-sub">Timing</p>
<p>One charge on a timeline: the order worker's and the payment provider's states while a card is charged.</p>
</article>
<article class="ex-variant" id="view-checkout-sequence">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=checkout-sequence" target="_self">Checkout</a></h3>
<p class="ex-sub">Sequence</p>
<p>Checkout as a sequence: the shopper, the storefront, the API, the payment provider and the receipt, with the calls and replies of a paid order.</p>
</article>
<article class="ex-variant" id="view-checkout-communication">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=checkout-communication" target="_self">Checkout: payment accepted</a></h3>
<p class="ex-sub">Communication</p>
<p>The same checkout as a communication diagram: the lifelines as objects with numbered messages, for the case where payment is accepted.</p>
</article>
<article class="ex-variant" id="view-order-to-shipment">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=order-to-shipment" target="_self">From order to shipment</a></h3>
<p class="ex-sub">BPMN</p>
<p>From order to shipment in BPMN: pools for the shopper, the bookshop and the payment provider, a payment timeout on a boundary event, a gateway on whether the order was paid, invoicing and packing in parallel, the courier's pickup timer, data, a group and the message flows between pools.</p>
</article>
<article class="ex-variant" id="view-pick-and-pack">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=pick-and-pack" target="_self">Pick and pack</a></h3>
<p class="ex-sub">BPMN</p>
<p>Pick and pack, the subprocess the order-to-shipment process calls: pick the books, then pack and label the parcel.</p>
</article>
<article class="ex-variant" id="view-returns">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=returns" target="_self">Handling a returned book</a></h3>
<p class="ex-sub">Flowchart</p>
<p>Handling a returned book as a flowchart: reading the slip, inspecting the book, a decision on whether it is fit for resale, the refund, the stock records and a connector.</p>
</article>
<article class="ex-variant" id="view-c4-deployment">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=c4-deployment" target="_self">Bookshop: production deployment</a></h3>
<p class="ex-sub">C4</p>
<p>The production deployment in C4: the user's device and browser, the web server, the Docker Compose host running the shop API and the order worker, and the database server.</p>
</article>
<article class="ex-variant" id="view-production">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=production" target="_self">Production</a></h3>
<p class="ex-sub">Deployment</p>
<p>Production as a UML deployment diagram: devices, execution environments, the artifacts deployed on them and the components they manifest.</p>
</article>
<article class="ex-variant" id="view-mm-plan">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=mm-plan" target="_self">Opening the bookshop</a></h3>
<p class="ex-sub">Mindmap</p>
<p>The plan for opening the bookshop as a mindmap: the catalogue, the website, the launch, the warehouse, legal and money, and three ways to host it.</p>
</article>
<article class="ex-variant" id="view-gcp-on-gcp">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=gcp-on-gcp" target="_self">Bookshop on Google Cloud</a></h3>
<p class="ex-sub">Google Cloud</p>
<p>The bookshop on Google Cloud: a project with DNS, a load balancer, a CDN, storage for the storefront, a queue, the API and the worker in a region, and the database across two zones.</p>
</article>
<article class="ex-variant" id="view-az-on-azure">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=az-on-azure" target="_self">Bookshop on Azure</a></h3>
<p class="ex-sub">Azure</p>
<p>The bookshop on Azure: a resource group with routing, monitoring, storage, a queue and secrets, and a virtual network with subnets for the apps and the database.</p>
</article>
<article class="ex-variant" id="view-aws-on-aws">
<h3><a href="/umlimator/examples/bookshop-atlas.html#view=aws-on-aws" target="_self">Bookshop on AWS</a></h3>
<p class="ex-sub">AWS</p>
<p>The bookshop on AWS: DNS and a CDN, a region with storage, a queue, email and monitoring, and a VPC across two availability zones with public and private subnets.</p>
</article>
</div>
