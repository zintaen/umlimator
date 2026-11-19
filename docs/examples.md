---
title: Examples
description: "Every diagram type umlimator draws, each on one page with all its examples, and the Atlas: umlimator's own model in many views."
aside: false
pageClass: examples-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Examples

Diagrams has a card for every type umlimator draws. Each opens the type's page, which holds every example and variant of that type live: its overview has a card per example, and each card opens it. Atlas shows a real system, umlimator itself, modelled in many views that open into each other. In an app, at the end, shows the module inside host pages. On any diagram you can pan, zoom, select and go into the cards that stack.

## Diagrams {#diagrams}

The map, then the 28 types in the order of the [Diagram types](./types.md) page. Each card opens the type's page; its list goes straight to one example.

<nav class="ex-jump" aria-label="Diagram types"><ul>
<li><b>Maps</b> <a href="#type-map">Map</a></li>
<li><b>UML structure</b> <a href="#type-uml-class">Class</a> <a href="#type-uml-object">Object</a> <a href="#type-uml-package">Package</a> <a href="#type-uml-composite-structure">Composite structure</a> <a href="#type-uml-component">Component</a> <a href="#type-uml-deployment">Deployment</a> <a href="#type-uml-profile">Profile</a></li>
<li><b>UML behaviour</b> <a href="#type-uml-use-case">Use case</a> <a href="#type-uml-activity">Activity</a> <a href="#type-uml-state-machine">State machine</a> <a href="#type-uml-sequence">Sequence</a> <a href="#type-uml-communication">Communication</a> <a href="#type-uml-interaction-overview">Interaction overview</a> <a href="#type-uml-timing">Timing</a> <a href="#type-uml-information-flow">Information flow</a></li>
<li><b>SysML</b> <a href="#type-sysml-requirement">Requirement</a> <a href="#type-sysml-block-definition">Block definition</a> <a href="#type-sysml-internal-block">Internal block</a> <a href="#type-sysml-parametric">Parametric</a></li>
<li><b>Architecture, data and process</b> <a href="#type-c4">C4</a> <a href="#type-er">Entity-relationship</a> <a href="#type-dfd">Data flow</a> <a href="#type-flowchart">Flowchart</a> <a href="#type-bpmn">BPMN</a> <a href="#type-mindmap">Mindmap</a></li>
<li><b>Cloud architecture</b> <a href="#type-aws">AWS</a> <a href="#type-gcp">Google Cloud</a> <a href="#type-azure">Azure</a></li>
</ul></nav>

### Maps {#family-maps}

<div class="ex-grid">
<article class="ex-card" id="type-map">
<a class="ex-still" href="./gallery/map.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/map/shapes-shapes.png'" alt="Card shapes: people, a browser app, a phone, a window, a terminal, an agent, a database, a queue, a file, a package, hosts and a hook around a shop's API" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/map.html">Map</a></h4>
<p>Layered architecture maps: cards, lines and boxes in views that open into each other, with stories, tours and lenses. 6 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/map.html#view=shapes-shapes" target="_self">Card shapes</a>, <a href="/umlimator/examples/types/map.html#view=monorepo-boxed" target="_self">Packages, a box per folder</a>, <a href="/umlimator/examples/types/map.html#view=monorepo-plain" target="_self">Packages, no boxes</a>, <a href="/umlimator/examples/types/map.html#view=lines-lines" target="_self">Line kinds, weights and steps</a>, <a href="/umlimator/examples/types/map.html#view=boxes-boxes" target="_self">Boxes, nested and tinted</a>, <a href="/umlimator/examples/types/map.html#view=badges-badges" target="_self">Badges, icons and edit marks</a></p>
<div class="ex-links"><a href="./gallery/map.html">Open<span class="visually-hidden"> (Map)</span></a><a href="./guide/model.html">The model guide<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.pdf" target="_self">PDF<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.json" target="_self">Model<span class="visually-hidden"> (Map)</span></a></div>
</article>
</div>

### UML structure {#family-uml-structure}

<div class="ex-grid">
<article class="ex-card" id="type-uml-class">
<a class="ex-still" href="./gallery/uml-class.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-class/sales-classes-domain.png'" alt="A UML class diagram of a bookshop's sales domain: Customer, Order, OrderLine, Book, an abstract Payment and its CardPayment, the Payable interface, the OrderStatus enumeration, the Money data type and a note" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-class.html">Class</a></h4>
<p>Classes, their attributes and operations, and how they relate. 6 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-class.html#view=sales-classes-domain" target="_self">Sales domain</a>, <a href="/umlimator/examples/types/uml-class.html#view=sales-classes-payments-only" target="_self">Payments only</a>, <a href="/umlimator/examples/types/uml-class.html#view=members-members" target="_self">Member notation</a>, <a href="/umlimator/examples/types/uml-class.html#view=lines-lines" target="_self">Every kind of line</a>, <a href="/umlimator/examples/types/uml-class.html#view=hierarchy-right" target="_self">Hierarchy, laid out right</a>, <a href="/umlimator/examples/types/uml-class.html#view=hierarchy-down" target="_self">Hierarchy, laid out down</a></p>
<div class="ex-links"><a href="./gallery/uml-class.html">Open<span class="visually-hidden"> (Class)</span></a><a href="./conformance/uml-class.html">Conformance<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.pdf" target="_self">PDF<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.json" target="_self">Model<span class="visually-hidden"> (Class)</span></a></div>
</article>
<article class="ex-card" id="type-uml-object">
<a class="ex-still" href="./gallery/uml-object.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-object/order-objects-snapshot.png'" alt="A UML object diagram of one placed order: ada, a Customer, linked to order1042, an Order, its two order lines, the books they are for and the card payment, each with its slots" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-object.html">Object</a></h4>
<p>Instances and the links between them at one moment. 4 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-object.html#view=order-objects-snapshot" target="_self">Order 1042, just placed</a>, <a href="/umlimator/examples/types/uml-object.html#view=package-branch" target="_self">A loan inside the lending package</a>, <a href="/umlimator/examples/types/uml-object.html#view=package-unboxed" target="_self">The same loan, names qualified</a>, <a href="/umlimator/examples/types/uml-object.html#view=classes-beside" target="_self">Two classes beside their instances</a></p>
<div class="ex-links"><a href="./gallery/uml-object.html">Open<span class="visually-hidden"> (Object)</span></a><a href="./conformance/uml-object.html">Conformance<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.pdf" target="_self">PDF<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.json" target="_self">Model<span class="visually-hidden"> (Object)</span></a></div>
</article>
<article class="ex-card" id="type-uml-package">
<a class="ex-still" href="./gallery/uml-package.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-package/bookshop-packages-packages.png'" alt="A UML package diagram of a bookshop: the packages shared, catalog, sales, payments with card inside it, and wholesale, each a box holding its classes, joined by imports, an access, a merge and a dependency, and the profile BookshopConventions, a closed folder that sales applies" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-package.html">Package</a></h4>
<p>Packages and the dependencies between them. 4 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-package.html#view=bookshop-packages-packages" target="_self">Bookshop packages</a>, <a href="/umlimator/examples/types/uml-package.html#view=closed-closed" target="_self">Cycle hire packages, closed</a>, <a href="/umlimator/examples/types/uml-package.html#view=nested-nested" target="_self">Library packages, three deep</a>, <a href="/umlimator/examples/types/uml-package.html#view=nested-qualified" target="_self">Library classes by qualified name</a></p>
<div class="ex-links"><a href="./gallery/uml-package.html">Open<span class="visually-hidden"> (Package)</span></a><a href="./conformance/uml-package.html">Conformance<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.pdf" target="_self">PDF<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.json" target="_self">Model<span class="visually-hidden"> (Package)</span></a></div>
</article>
<article class="ex-card" id="type-uml-composite-structure">
<a class="ex-still" href="./gallery/uml-composite-structure.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-composite-structure/order-service-structure-internals.png'" alt="A UML composite structure diagram of an order service: its ports on its border, four parts, two of them showing their types' ports, connectors between them, an open collaboration as a dashed ellipse and a collaboration use with its role bindings" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-composite-structure.html">Composite structure</a></h4>
<p>The parts inside a class, their ports and connectors. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-composite-structure.html#view=order-service-structure-internals" target="_self">Inside OrderService</a>, <a href="/umlimator/examples/types/uml-composite-structure.html#view=component-inside" target="_self">A component's parts and ports</a>, <a href="/umlimator/examples/types/uml-composite-structure.html#view=collaboration-roles" target="_self">A collaboration as the subject</a></p>
<div class="ex-links"><a href="./gallery/uml-composite-structure.html">Open<span class="visually-hidden"> (Composite structure)</span></a><a href="./conformance/uml-composite-structure.html">Conformance<span class="visually-hidden"> (Composite structure)</span></a><a href="/umlimator/examples/types/uml-composite-structure.pdf" target="_self">PDF<span class="visually-hidden"> (Composite structure)</span></a><a href="/umlimator/examples/types/uml-composite-structure.json" target="_self">Model<span class="visually-hidden"> (Composite structure)</span></a></div>
</article>
<article class="ex-card" id="type-uml-component">
<a class="ex-still" href="./gallery/uml-component.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-component/bookshop-components-components.png'" alt="A UML component diagram of a bookshop: Shop API a box holding Checkout, ports on their borders with delegations between them, Orders as a ball with a socket, SignIn as a rectangle, an artifact manifesting Shop API" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-component.html">Component</a></h4>
<p>Components and the interfaces they provide and require. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-component.html#view=bookshop-components-components" target="_self">Bookshop components</a>, <a href="/umlimator/examples/types/uml-component.html#view=library-packages" target="_self">Packages, realizations, an interface box</a>, <a href="/umlimator/examples/types/uml-component.html#view=sockets-sockets" target="_self">Balls and sockets, laid out down</a></p>
<div class="ex-links"><a href="./gallery/uml-component.html">Open<span class="visually-hidden"> (Component)</span></a><a href="./conformance/uml-component.html">Conformance<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.pdf" target="_self">PDF<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.json" target="_self">Model<span class="visually-hidden"> (Component)</span></a></div>
</article>
<article class="ex-card" id="type-uml-deployment">
<a class="ex-still" href="./gallery/uml-deployment.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-deployment/bookshop-deployment-production.png'" alt="A UML deployment diagram of a bookshop in production: devices and execution environments drawn as cubes and nested, artifacts deployed in them, communication paths labelled with their protocols" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-deployment.html">Deployment</a></h4>
<p>Nodes, execution environments and the artifacts deployed on them. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-deployment.html#view=bookshop-deployment-production" target="_self">Production</a>, <a href="/umlimator/examples/types/uml-deployment.html#view=docks-docks" target="_self">Dock network, laid out down</a>, <a href="/umlimator/examples/types/uml-deployment.html#view=lines-lines" target="_self">Deployed by lines</a></p>
<div class="ex-links"><a href="./gallery/uml-deployment.html">Open<span class="visually-hidden"> (Deployment)</span></a><a href="./conformance/uml-deployment.html">Conformance<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.pdf" target="_self">PDF<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.json" target="_self">Model<span class="visually-hidden"> (Deployment)</span></a></div>
</article>
<article class="ex-card" id="type-uml-profile">
<a class="ex-still" href="./gallery/uml-profile.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-profile/bookshop-profile-profile.png'" alt="A UML profile diagram of a bookshop's modelling conventions: a profile holding metaclasses and stereotypes with their tag definitions, extensions with filled triangles, one marked required, a package applying the profile, and a class showing its stereotypes' tags" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-profile.html">Profile</a></h4>
<p>Stereotypes that extend UML for a domain. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-profile.html#view=bookshop-profile-profile" target="_self">Bookshop conventions profile</a>, <a href="/umlimator/examples/types/uml-profile.html#view=abstract-fleet-profile" target="_self">An abstract stereotype and an enumeration tag</a>, <a href="/umlimator/examples/types/uml-profile.html#view=two-two-profiles" target="_self">Two profiles, one name, qualified</a></p>
<div class="ex-links"><a href="./gallery/uml-profile.html">Open<span class="visually-hidden"> (Profile)</span></a><a href="./conformance/uml-profile.html">Conformance<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.pdf" target="_self">PDF<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.json" target="_self">Model<span class="visually-hidden"> (Profile)</span></a></div>
</article>
</div>

### UML behaviour {#family-uml-behaviour}

<div class="ex-grid">
<article class="ex-card" id="type-uml-use-case">
<a class="ex-still" href="./gallery/uml-use-case.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-use-case/shopping-use-cases-shopping.png'" alt="A UML use case diagram of a bookshop: a shopper, a member and a payment provider as stick figures, eight use cases as ellipses in the Online bookshop subject, includes and extends drawn dashed with their labels" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-use-case.html">Use case</a></h4>
<p>Actors and the use cases they take part in. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-use-case.html#view=shopping-use-cases-shopping" target="_self">Shopping</a>, <a href="/umlimator/examples/types/uml-use-case.html#view=dock-dock" target="_self">Two subjects, laid out down</a>, <a href="/umlimator/examples/types/uml-use-case.html#view=library-lending" target="_self">Lending, with no subject box</a></p>
<div class="ex-links"><a href="./gallery/uml-use-case.html">Open<span class="visually-hidden"> (Use case)</span></a><a href="./conformance/uml-use-case.html">Conformance<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.pdf" target="_self">PDF<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.json" target="_self">Model<span class="visually-hidden"> (Use case)</span></a></div>
</article>
<article class="ex-card" id="type-uml-activity">
<a class="ex-still" href="./gallery/uml-activity.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-activity/fulfil-activity-fulfil.png'" alt="A UML activity diagram of fulfilling an order in three lanes, Order worker, Warehouse and Email service: actions, an object node, a data store, a decision and a merge, a fork and a join, and a flow final" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-activity.html">Activity</a></h4>
<p>Actions, decisions and flows, in partitions. 4 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-activity.html#view=fulfil-activity-fulfil" target="_self">Fulfilling an order</a>, <a href="/umlimator/examples/types/uml-activity.html#view=fulfil-activity-take-payment" target="_self">Take payment</a>, <a href="/umlimator/examples/types/uml-activity.html#view=loop-return-right" target="_self">A retry loop, laid out right</a>, <a href="/umlimator/examples/types/uml-activity.html#view=lanes-rebalance" target="_self">Nested lanes, laid out right</a></p>
<div class="ex-links"><a href="./gallery/uml-activity.html">Open<span class="visually-hidden"> (Activity)</span></a><a href="./conformance/uml-activity.html">Conformance<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.pdf" target="_self">PDF<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.json" target="_self">Model<span class="visually-hidden"> (Activity)</span></a></div>
</article>
<article class="ex-card" id="type-uml-state-machine">
<a class="ex-still" href="./gallery/uml-state-machine.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-state-machine/order-states-order-life.png'" alt="A UML state machine diagram of an order's life: Placed with its activities, a choice, a fork into the Parcel and Payment regions of Fulfilling, In delivery with a history, Cancelled and a terminate" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-state-machine.html">State machine</a></h4>
<p>States and the transitions between them. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-state-machine.html#view=order-states-order-life" target="_self">An order's life</a>, <a href="/umlimator/examples/types/uml-state-machine.html#view=loan-loan" target="_self">A library loan</a>, <a href="/umlimator/examples/types/uml-state-machine.html#view=coffee-machine" target="_self">A coffee machine, down</a></p>
<div class="ex-links"><a href="./gallery/uml-state-machine.html">Open<span class="visually-hidden"> (State machine)</span></a><a href="./conformance/uml-state-machine.html">Conformance<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.pdf" target="_self">PDF<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.json" target="_self">Model<span class="visually-hidden"> (State machine)</span></a></div>
</article>
<article class="ex-card" id="type-uml-sequence">
<a class="ex-still" href="./gallery/uml-sequence.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-sequence/checkout-sequence-checkout-sequence.png'" alt="A UML sequence diagram of a bookshop's checkout: a shopper, the storefront, the api, payments and a receipt created on the way, their messages in time order with activation bars, an alt frame with an opt frame and an interaction use inside it" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-sequence.html">Sequence</a></h4>
<p>Messages between lifelines, in time order. 7 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-sequence.html#view=checkout-sequence-checkout-sequence" target="_self">Checkout</a>, <a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-find-book" target="_self">Find a book</a>, <a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-buy-checkout" target="_self">Check out</a>, <a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-email-receipt" target="_self">Email the receipt</a>, <a href="/umlimator/examples/types/uml-sequence.html#view=buy-book-overview-queue-order" target="_self">Queue the order</a>, <a href="/umlimator/examples/types/uml-sequence.html#view=unlock-unlock" target="_self">Unlock, ride and return</a>, <a href="/umlimator/examples/types/uml-sequence.html#view=parallel-parallel" target="_self">Return, in parallel</a></p>
<div class="ex-links"><a href="./gallery/uml-sequence.html">Open<span class="visually-hidden"> (Sequence)</span></a><a href="./conformance/uml-sequence.html">Conformance<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.pdf" target="_self">PDF<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.json" target="_self">Model<span class="visually-hidden"> (Sequence)</span></a></div>
</article>
<article class="ex-card" id="type-uml-communication">
<a class="ex-still" href="./gallery/uml-communication.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-communication/checkout-communication-checkout-communication.png'" alt="A UML communication diagram of the same checkout: five lifelines joined by connectors, each link's messages a stack of numbered rows" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-communication.html">Communication</a></h4>
<p>Numbered messages along the links between objects. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-communication.html#view=checkout-communication-checkout-communication" target="_self">Checkout: payment accepted</a>, <a href="/umlimator/examples/types/uml-communication.html#view=nested-unlock" target="_self">Unlock: nested numbers, create and delete</a>, <a href="/umlimator/examples/types/uml-communication.html#view=notify-hold-ready" target="_self">A hold made ready: async and a guard</a></p>
<div class="ex-links"><a href="./gallery/uml-communication.html">Open<span class="visually-hidden"> (Communication)</span></a><a href="./conformance/uml-communication.html">Conformance<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.pdf" target="_self">PDF<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.json" target="_self">Model<span class="visually-hidden"> (Communication)</span></a></div>
</article>
<article class="ex-card" id="type-uml-interaction-overview">
<a class="ex-still" href="./gallery/uml-interaction-overview.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-interaction-overview/buy-book-overview-buy-book.png'" alt="A UML interaction overview diagram of buying a book: interaction uses for finding a book, checking out and emailing the receipt, a decision looping back through a merge, a fork and a join, and an inline interaction with its three lifelines" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-interaction-overview.html">Interaction overview</a></h4>
<p>An activity whose steps are interactions. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-interaction-overview.html#view=buy-book-overview-buy-book" target="_self">Buying a book</a>, <a href="/umlimator/examples/types/uml-interaction-overview.html#view=rent-rent" target="_self">Renting a bike, laid out right</a>, <a href="/umlimator/examples/types/uml-interaction-overview.html#view=inline-return-book" target="_self">Returning a book: inline interactions</a></p>
<div class="ex-links"><a href="./gallery/uml-interaction-overview.html">Open<span class="visually-hidden"> (Interaction overview)</span></a><a href="./conformance/uml-interaction-overview.html">Conformance<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.pdf" target="_self">PDF<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.json" target="_self">Model<span class="visually-hidden"> (Interaction overview)</span></a></div>
</article>
<article class="ex-card" id="type-uml-timing">
<a class="ex-still" href="./gallery/uml-timing.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-timing/bookshop-timing-one-charge.png'" alt="A UML timing diagram of one charge: two lifelines as step lines through their states on a time ruler in milliseconds, a call and its reply between them at their times, a duration constraint and a time constraint" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-timing.html">Timing</a></h4>
<p>How lifelines change state along a time axis. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-timing.html#view=bookshop-timing-one-charge" target="_self">One charge</a>, <a href="/umlimator/examples/types/uml-timing.html#view=values-unlock" target="_self">States and a value lifeline</a>, <a href="/umlimator/examples/types/uml-timing.html#view=charging-charging" target="_self">Minutes, calls and overlapping constraints</a></p>
<div class="ex-links"><a href="./gallery/uml-timing.html">Open<span class="visually-hidden"> (Timing)</span></a><a href="./conformance/uml-timing.html">Conformance<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.pdf" target="_self">PDF<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.json" target="_self">Model<span class="visually-hidden"> (Timing)</span></a></div>
</article>
<article class="ex-card" id="type-uml-information-flow">
<a class="ex-still" href="./gallery/uml-information-flow.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-information-flow/order-information-flow-order-flows.png'" alt="A UML information flow diagram of what travels with an order: a shopper, components and information items, joined by dashed flow lines each naming what it conveys" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-information-flow.html">Information flow</a></h4>
<p>Information items conveyed between elements. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/uml-information-flow.html#view=order-information-flow-order-flows" target="_self">What travels with an order</a>, <a href="/umlimator/examples/types/uml-information-flow.html#view=classes-classes" target="_self">Named flows between classes</a>, <a href="/umlimator/examples/types/uml-information-flow.html#view=down-orders" target="_self">Flows laid out down</a></p>
<div class="ex-links"><a href="./gallery/uml-information-flow.html">Open<span class="visually-hidden"> (Information flow)</span></a><a href="./conformance/uml-information-flow.html">Conformance<span class="visually-hidden"> (Information flow)</span></a><a href="/umlimator/examples/types/uml-information-flow.pdf" target="_self">PDF<span class="visually-hidden"> (Information flow)</span></a><a href="/umlimator/examples/types/uml-information-flow.json" target="_self">Model<span class="visually-hidden"> (Information flow)</span></a></div>
</article>
</div>

### SysML {#family-sysml}

<div class="ex-grid">
<article class="ex-card" id="type-sysml-requirement">
<a class="ex-still" href="./gallery/sysml-requirement.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-requirement/ebike-requirements-requirements.png'" alt="A SysML requirement diagram of a city e-bike in a req frame: requirements with their ids and wrapped texts, containment crosshairs, blocks satisfying and test cases verifying them" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-requirement.html">Requirement</a></h4>
<p>Requirements and how they are derived, satisfied and verified. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/sysml-requirement.html#view=ebike-requirements-requirements" target="_self">E-bike requirements</a>, <a href="/umlimator/examples/types/sysml-requirement.html#view=kinds-kinds" target="_self">Requirement kinds</a>, <a href="/umlimator/examples/types/sysml-requirement.html#view=trace-trace" target="_self">Derived, satisfied and verified</a></p>
<div class="ex-links"><a href="./gallery/sysml-requirement.html">Open<span class="visually-hidden"> (Requirement)</span></a><a href="./conformance/sysml-requirement.html">Conformance<span class="visually-hidden"> (Requirement)</span></a><a href="/umlimator/examples/types/sysml-requirement.pdf" target="_self">PDF<span class="visually-hidden"> (Requirement)</span></a><a href="/umlimator/examples/types/sysml-requirement.json" target="_self">Model<span class="visually-hidden"> (Requirement)</span></a></div>
</article>
<article class="ex-card" id="type-sysml-block-definition">
<a class="ex-still" href="./gallery/sysml-block-definition.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-block-definition/ebike-blocks-blocks.png'" alt="A SysML block definition diagram of a city e-bike in a bdd frame: blocks with named compartments of parts, values, constraints and ports, an interface block, constraint blocks and value types" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-block-definition.html">Block definition</a></h4>
<p>Blocks, their properties and how they are composed. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/sysml-block-definition.html#view=ebike-blocks-blocks" target="_self">E-bike blocks</a>, <a href="/umlimator/examples/types/sysml-block-definition.html#view=ports-charging" target="_self">Ports and flows</a>, <a href="/umlimator/examples/types/sysml-block-definition.html#view=values-fleet" target="_self">A block hierarchy and value types</a></p>
<div class="ex-links"><a href="./gallery/sysml-block-definition.html">Open<span class="visually-hidden"> (Block definition)</span></a><a href="./conformance/sysml-block-definition.html">Conformance<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.pdf" target="_self">PDF<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.json" target="_self">Model<span class="visually-hidden"> (Block definition)</span></a></div>
</article>
<article class="ex-card" id="type-sysml-internal-block">
<a class="ex-still" href="./gallery/sysml-internal-block.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-internal-block/ebike-structure-inside-ebike.png'" alt="A SysML internal block diagram of a city e-bike: the bike as the ibd frame holding its parts, ports on their borders with flow arrows, connectors carrying DC power and phase current" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-internal-block.html">Internal block</a></h4>
<p>The parts of a block and what flows between their ports. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/sysml-internal-block.html#view=ebike-structure-inside-ebike" target="_self">Inside the e-bike</a>, <a href="/umlimator/examples/types/sysml-internal-block.html#view=dock-inside-station" target="_self">Inside the dock station</a>, <a href="/umlimator/examples/types/sysml-internal-block.html#view=dock-inside-charger" target="_self">Inside the charger</a></p>
<div class="ex-links"><a href="./gallery/sysml-internal-block.html">Open<span class="visually-hidden"> (Internal block)</span></a><a href="./conformance/sysml-internal-block.html">Conformance<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.pdf" target="_self">PDF<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.json" target="_self">Model<span class="visually-hidden"> (Internal block)</span></a></div>
</article>
<article class="ex-card" id="type-sysml-parametric">
<a class="ex-still" href="./gallery/sysml-parametric.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-parametric/ebike-range-range-analysis.png'" alt="A SysML parametric diagram of a city e-bike's range: constraint properties with rounded corners and their expressions, parameters on their borders bound to value properties" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-parametric.html">Parametric</a></h4>
<p>Constraint blocks that bind a system's values. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/sysml-parametric.html#view=ebike-range-range-analysis" target="_self">E-bike range</a>, <a href="/umlimator/examples/types/sysml-parametric.html#view=constraint-block-frame" target="_self">A constraint block as the frame</a>, <a href="/umlimator/examples/types/sysml-parametric.html#view=down-power-down" target="_self">A power budget, laid out down</a></p>
<div class="ex-links"><a href="./gallery/sysml-parametric.html">Open<span class="visually-hidden"> (Parametric)</span></a><a href="./conformance/sysml-parametric.html">Conformance<span class="visually-hidden"> (Parametric)</span></a><a href="/umlimator/examples/types/sysml-parametric.pdf" target="_self">PDF<span class="visually-hidden"> (Parametric)</span></a><a href="/umlimator/examples/types/sysml-parametric.json" target="_self">Model<span class="visually-hidden"> (Parametric)</span></a></div>
</article>
</div>

### Architecture, data and process {#family-architecture-data-and-process}

<div class="ex-grid">
<article class="ex-card" id="type-c4">
<a class="ex-still" href="./gallery/c4.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/c4/bookshop-c4-c4-context.png'" alt="A C4 system context diagram of a bookshop: the shopper and staff as people, the bookshop as the system in the middle, the external systems it uses in grey" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/c4.html">C4</a></h4>
<p>C4's landscape, context, container, component, dynamic and deployment views. 7 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/c4.html#view=bookshop-c4-c4-context" target="_self">Bookshop: system context</a>, <a href="/umlimator/examples/types/c4.html#view=bookshop-c4-c4-containers" target="_self">Bookshop: containers</a>, <a href="/umlimator/examples/types/c4.html#view=bookshop-c4-c4-components" target="_self">Shop API: components</a>, <a href="/umlimator/examples/types/c4.html#view=bookshop-c4-c4-placing-an-order" target="_self">Placing an order</a>, <a href="/umlimator/examples/types/c4.html#view=bookshop-c4-c4-deployment" target="_self">Bookshop: production deployment</a>, <a href="/umlimator/examples/types/c4.html#view=landscape-landscape" target="_self">City libraries: system landscape</a>, <a href="/umlimator/examples/types/c4.html#view=shapes-shapes" target="_self">Cinema tickets: a container shape each</a></p>
<div class="ex-links"><a href="./gallery/c4.html">Open<span class="visually-hidden"> (C4)</span></a><a href="./conformance/c4.html">Conformance<span class="visually-hidden"> (C4)</span></a><a href="/umlimator/examples/types/c4.pdf" target="_self">PDF<span class="visually-hidden"> (C4)</span></a><a href="/umlimator/examples/types/c4.json" target="_self">Model<span class="visually-hidden"> (C4)</span></a></div>
</article>
<article class="ex-card" id="type-er">
<a class="ex-still" href="./gallery/er.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/er/bookshop-schema-er-schema.png'" alt="An entity-relationship diagram of a bookshop's database: seven tables with their key columns first, related by crow's foot ends, identifying lines solid and the rest dashed" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/er.html">Entity-relationship</a></h4>
<p>Entities, their attributes and relationships, with cardinality. 4 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/er.html#view=bookshop-schema-er-schema" target="_self">Bookshop schema</a>, <a href="/umlimator/examples/types/er.html#view=docks-idef1x" target="_self">Hire schema in IDEF1X</a>, <a href="/umlimator/examples/types/er.html#view=docks-crowsfoot-down" target="_self">Hire schema in crow's foot, laid out down</a>, <a href="/umlimator/examples/types/er.html#view=rows-rows" target="_self">Rows capped and sections hidden</a></p>
<div class="ex-links"><a href="./gallery/er.html">Open<span class="visually-hidden"> (Entity-relationship)</span></a><a href="./conformance/er.html">Conformance<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.pdf" target="_self">PDF<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.json" target="_self">Model<span class="visually-hidden"> (Entity-relationship)</span></a></div>
</article>
<article class="ex-card" id="type-dfd">
<a class="ex-still" href="./gallery/dfd.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/dfd/bookshop-data-flow-dfd-level-1.png'" alt="A data flow diagram of a bookshop, level 1: three external entities, three numbered processes and two data stores, joined by labelled data flows" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/dfd.html">Data flow</a></h4>
<p>Processes, data stores and external entities, and the data between them. 5 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/dfd.html#view=bookshop-data-flow-dfd-level-1" target="_self">Bookshop, level 1</a>, <a href="/umlimator/examples/types/dfd.html#view=bookshop-data-flow-dfd-level-2-take-order" target="_self">1 Take order</a>, <a href="/umlimator/examples/types/dfd.html#view=gane-sarson-rides" target="_self">Rides, Gane and Sarson</a>, <a href="/umlimator/examples/types/dfd.html#view=context-context" target="_self">Context diagram</a>, <a href="/umlimator/examples/types/dfd.html#view=context-level-1" target="_self">0 Lend books</a></p>
<div class="ex-links"><a href="./gallery/dfd.html">Open<span class="visually-hidden"> (Data flow)</span></a><a href="./conformance/dfd.html">Conformance<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.pdf" target="_self">PDF<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.json" target="_self">Model<span class="visually-hidden"> (Data flow)</span></a></div>
</article>
<article class="ex-card" id="type-flowchart">
<a class="ex-still" href="./gallery/flowchart.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/flowchart/returns-flowchart-returns.png'" alt="A flowchart of handling a returned book, laid out down: a start, input and manual input, a decision with yes and no exits, a delay, a database, a document, a connector and an end" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/flowchart.html">Flowchart</a></h4>
<p>The steps and decisions of a process. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/flowchart.html#view=returns-flowchart-returns" target="_self">Handling a returned book</a>, <a href="/umlimator/examples/types/flowchart.html#view=right-unlock" target="_self">Unlocking a bike, laid out right</a>, <a href="/umlimator/examples/types/flowchart.html#view=connectors-renew" target="_self">Renewing a loan: a connector pair</a></p>
<div class="ex-links"><a href="./gallery/flowchart.html">Open<span class="visually-hidden"> (Flowchart)</span></a><a href="./conformance/flowchart.html">Conformance<span class="visually-hidden"> (Flowchart)</span></a><a href="/umlimator/examples/types/flowchart.pdf" target="_self">PDF<span class="visually-hidden"> (Flowchart)</span></a><a href="/umlimator/examples/types/flowchart.json" target="_self">Model<span class="visually-hidden"> (Flowchart)</span></a></div>
</article>
<article class="ex-card" id="type-bpmn">
<a class="ex-still" href="./gallery/bpmn.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/bpmn/bookshop-order-to-shipment-order-to-shipment.png'" alt="A BPMN diagram of a bookshop's order to shipment: three pools, the bookshop's in two lanes, tasks, events and gateways joined by sequence flows, dashed message flows between the pools, a timer on the payment task's border" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/bpmn.html">BPMN</a></h4>
<p>Business processes: events, tasks, gateways, pools and lanes. 4 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/bpmn.html#view=bookshop-order-to-shipment-order-to-shipment" target="_self">From order to shipment</a>, <a href="/umlimator/examples/types/bpmn.html#view=bookshop-order-to-shipment-pick-and-pack" target="_self">Pick and pack</a>, <a href="/umlimator/examples/types/bpmn.html#view=expanded-hold" target="_self">Nested lanes, an expanded sub-process</a>, <a href="/umlimator/examples/types/bpmn.html#view=collaboration-billing" target="_self">Black-box pools, data and messages, laid out down</a></p>
<div class="ex-links"><a href="./gallery/bpmn.html">Open<span class="visually-hidden"> (BPMN)</span></a><a href="./conformance/bpmn.html">Conformance<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.pdf" target="_self">PDF<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.json" target="_self">Model<span class="visually-hidden"> (BPMN)</span></a></div>
</article>
<article class="ex-card" id="type-mindmap">
<a class="ex-still" href="./gallery/mindmap.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/mindmap/bookshop-opening-plan-mm-plan.png'" alt="A mindmap of opening a bookshop: the root in the middle, six branches left and right, each in its own colour, joined by curves" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/mindmap.html">Mindmap</a></h4>
<p>Ideas branching out from one topic. 4 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/mindmap.html#view=bookshop-opening-plan-mm-plan" target="_self">Opening the bookshop</a>, <a href="/umlimator/examples/types/mindmap.html#view=one-side-year" target="_self">Every branch on one side</a>, <a href="/umlimator/examples/types/mindmap.html#view=drill-move" target="_self">Sides chosen for you, a topic that opens a view</a>, <a href="/umlimator/examples/types/mindmap.html#view=drill-moving-day" target="_self">Moving day</a></p>
<div class="ex-links"><a href="./gallery/mindmap.html">Open<span class="visually-hidden"> (Mindmap)</span></a><a href="./conformance/mindmap.html">Conformance<span class="visually-hidden"> (Mindmap)</span></a><a href="/umlimator/examples/types/mindmap.pdf" target="_self">PDF<span class="visually-hidden"> (Mindmap)</span></a><a href="/umlimator/examples/types/mindmap.json" target="_self">Model<span class="visually-hidden"> (Mindmap)</span></a></div>
</article>
</div>

### Cloud architecture {#family-cloud-architecture}

<div class="ex-grid">
<article class="ex-card" id="type-aws">
<a class="ex-still" href="./gallery/aws.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/aws/bookshop-aws-aws-on-aws.png'" alt="An AWS architecture diagram of a bookshop: a cloud, a region, a VPC, two availability zones, public and private subnets and a security group as nested boxes, fifteen services and resources drawn with their icons and full service names" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/aws.html">AWS</a></h4>
<p>Accounts, regions, VPCs, subnets and the services in them. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/aws.html#view=bookshop-aws-aws-on-aws" target="_self">Bookshop on AWS</a>, <a href="/umlimator/examples/types/aws.html#view=serverless-serverless" target="_self">Serverless, no VPC</a>, <a href="/umlimator/examples/types/aws.html#view=accounts-accounts" target="_self">Two accounts</a></p>
<div class="ex-links"><a href="./gallery/aws.html">Open<span class="visually-hidden"> (AWS)</span></a><a href="./conformance/aws.html">Conformance<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.pdf" target="_self">PDF<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.json" target="_self">Model<span class="visually-hidden"> (AWS)</span></a></div>
</article>
<article class="ex-card" id="type-gcp">
<a class="ex-still" href="./gallery/gcp.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/gcp/bookshop-gcp-gcp-on-gcp.png'" alt="A Google Cloud architecture diagram of a bookshop: a project, a region, a network, a subnetwork and two zones as nested boxes, nine products drawn with their icons and full service names" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/gcp.html">Google Cloud</a></h4>
<p>Projects, regions, zones and the services in them. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/gcp.html#view=bookshop-gcp-gcp-on-gcp" target="_self">Bookshop on Google Cloud</a>, <a href="/umlimator/examples/types/gcp.html#view=groups-telemetry" target="_self">Cycle hire dock telemetry</a>, <a href="/umlimator/examples/types/gcp.html#view=regions-two-regions" target="_self">Library catalogue in two regions</a></p>
<div class="ex-links"><a href="./gallery/gcp.html">Open<span class="visually-hidden"> (Google Cloud)</span></a><a href="./conformance/gcp.html">Conformance<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.pdf" target="_self">PDF<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.json" target="_self">Model<span class="visually-hidden"> (Google Cloud)</span></a></div>
</article>
<article class="ex-card" id="type-azure">
<a class="ex-still" href="./gallery/azure.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/azure/bookshop-azure-az-on-azure.png'" alt="An Azure architecture diagram of a bookshop: a subscription, a resource group, a region, a virtual network and two subnets as nested boxes, eight services drawn with their icons and full service names" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/azure.html">Azure</a></h4>
<p>Subscriptions, resource groups, virtual networks and the services in them. 3 examples.</p>
<p class="ex-views">Examples: <a href="/umlimator/examples/types/azure.html#view=bookshop-azure-az-on-azure" target="_self">Bookshop on Azure</a>, <a href="/umlimator/examples/types/azure.html#view=regions-regions" target="_self">Two regions, laid out down</a>, <a href="/umlimator/examples/types/azure.html#view=landing-landing" target="_self">Closed subscriptions and a generic group</a></p>
<div class="ex-links"><a href="./gallery/azure.html">Open<span class="visually-hidden"> (Azure)</span></a><a href="./conformance/azure.html">Conformance<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.pdf" target="_self">PDF<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.json" target="_self">Model<span class="visually-hidden"> (Azure)</span></a></div>
</article>
</div>

## Atlas {#atlas}

A real system modelled in many views of the types above, joined by cards that open them. For now it holds one: umlimator itself.

<div class="ex-grid">
<article class="ex-card ex-wide" id="atlas-umlimator-atlas">
<a class="ex-still" href="./gallery/atlas.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/stills/umlimator-atlas/overview.png'" alt="The Umlimator Atlas's overview: the author, an AI assistant, the map-repo skill, the model JSON, umlimator.py, the readers, the module, umlimator/all, the page, the MCP page, the host page, the element, the docs site and the diff Action, with GitHub and Chrome" loading="lazy" width="640" height="320"></a>
<div>
<h3><a href="./gallery/atlas.html">The Umlimator Atlas</a></h3>
<p>Umlimator's own model, drawn with umlimator: its parts and who uses each (a map), its system context and containers (C4), the core module's packages in build order (a package diagram), the typed diagram families (a component diagram), the diff Action on a pull request (a sequence diagram) and umlimator's state machines (navigation, the story player, tours, the page's keys and the MCP page), joined by cards that open them.</p>
<p class="ex-views">Its views, by type: Map (<a href="/umlimator/examples/umlimator-atlas.html#view=overview" target="_self">Umlimator</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=machines" target="_self">umlimator's state machines</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=navigation" target="_self">Navigation</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=story" target="_self">Story player</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=tour" target="_self">Tour and replay</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=keys" target="_self">The page's keys</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=mcp" target="_self">The MCP page</a>); C4 (<a href="/umlimator/examples/umlimator-atlas.html#view=context" target="_self">umlimator: system context</a>, <a href="/umlimator/examples/umlimator-atlas.html#view=containers" target="_self">umlimator: containers</a>); Package (<a href="/umlimator/examples/umlimator-atlas.html#view=layers" target="_self">The module's packages, in build order</a>); Component (<a href="/umlimator/examples/umlimator-atlas.html#view=registry" target="_self">umlimator/all: the typed families</a>); Sequence (<a href="/umlimator/examples/umlimator-atlas.html#view=diff-run" target="_self">The diff Action on a pull request</a>).</p>
<div class="ex-links"><a href="./gallery/atlas.html">Open<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.html#story=pull-request&amp;step=1" target="_self">A pull request, from push to comment<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.html#story=assistant&amp;step=1" target="_self">An assistant, then the reader<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.pdf" target="_self">PDF<span class="visually-hidden"> (The Umlimator Atlas)</span></a><a href="/umlimator/examples/umlimator-atlas.json" target="_self">Model<span class="visually-hidden"> (The Umlimator Atlas)</span></a></div>
</div>
</article>
</div>

## In an app {#apps}

<table class="ex-apps">
<tr><th scope="row"><a href="/umlimator/examples/playground.html" target="_self">Playground</a></th><td>Edit a model and see the map, its problems (<code>validate()</code>), its broken rules (<code>rules()</code>) and its layout check (<code>check()</code>); share it by link.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/element.html" target="_self">The element</a></th><td><code>&lt;umlimator-map src="..."&gt;</code>: a map from HTML alone, its still shown until it is drawn; the block a docs site (VitePress, Docusaurus, MkDocs) turns into it.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/embed.html" target="_self">A host page</a></th><td><code>render()</code> with the standalone page's pieces (views list, details panel, legend, hint line), views loaded when opened, SVG and PNG export, themes and the minimap.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/live.html" target="_self">Live traffic</a></th><td><code>overlay()</code> every second: flow as fast as the traffic, errors that pulse, slow lines that glow, lag on each card; the model never changes.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/ask.html" target="_self">Ask the map</a></th><td>Questions answered with words, the paths or reach they are about lit, and a tour; the view in sentences (<code>describe()</code>) for an AI model.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/replay.html" target="_self">Trace replay</a></th><td>An OpenTelemetry trace played on the map: each call along its line at its time, with its duration.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/edit.html" target="_self">Editing</a></th><td>The map emits <code>change</code> events; the host applies them and keeps an undo history.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/class-editor.html" target="_self">A class diagram editor</a></th><td>A class diagram emits <code>edit</code> events, each a transaction of commands; the host applies them with <code>apply()</code> and keeps <code>history()</code> for undo and redo.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/timelapse.html" target="_self">A time-lapse</a></th><td>Four releases on a slider: new cards fade in, removed ones fade out, moved ones glide; <code>diff()</code> says what changed.</td></tr>
<tr><th scope="row"><a href="/umlimator/examples/drift.html" target="_self">Drawn vs. seen</a></th><td><code>drift()</code>: the map against a week of traffic; lines that ran undrawn come in, idle ones fade.</td></tr>
<tr><th scope="row"><a href="https://github.com/zintaen/umlimator/blob/main/examples/layout.mjs">In Node</a></th><td><code>layout()</code> without a browser, as a check a host can run in CI on maps it generates.</td></tr>
</table>
