---
title: Examples
description: "Every diagram type umlimator draws, each as one example that shows all it draws, and the Atlas: whole businesses modelled in many views."
aside: false
pageClass: examples-page
---

<!-- Written by tools/gallery.mjs from the models, tools/gallery.json and tools/types.json: edit those, not this file. -->

# Examples

Diagrams has a card for every type umlimator draws. Each opens the type's page: one example, live, that shows everything the type draws in one picture, with a checklist of what to find in it. Atlas shows whole businesses, each modelled as one model in many views of many types that open into each other. In an app, at the end, shows the module inside host pages. On any diagram you can pan, zoom, select and go into the cards that stack.

## Diagrams {#diagrams}

The map, then the 28 types in the order of the [Diagram types](./types.md) page. Each card opens the type's page; its list names the first things the diagram shows.

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
<a class="ex-still" href="./gallery/map.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/map/overview.png'" alt="Card shapes: people, a browser app, a phone, a window, a terminal, an agent, a database, a queue, a file, a package, hosts and a hook around a shop's API" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/map.html">Map</a></h4>
<p>Layered architecture maps: cards, lines and boxes in views that open into each other, with stories, tours and lenses.</p>
<ul class="ex-shows-short"><li>every card shape</li><li>a box per folder</li><li>the same cards, no boxes</li><li><a href="./gallery/map.html#shows">3 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/map.html#view=overview" target="_self">Map examples</a></p>
<div class="ex-links"><a href="./gallery/map.html">Open<span class="visually-hidden"> (Map)</span></a><a href="./guide/model.html">The model guide<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.pdf" target="_self">PDF<span class="visually-hidden"> (Map)</span></a><a href="/umlimator/examples/types/map.json" target="_self">Model<span class="visually-hidden"> (Map)</span></a></div>
</article>
</div>

### UML structure {#family-uml-structure}

<div class="ex-grid">
<article class="ex-card" id="type-uml-class">
<a class="ex-still" href="./gallery/uml-class.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-class/sales.png'" alt="A UML class diagram of a bookshop's sales domain: the sales, payments, card and shared packages as boxes, Customer, Order, OrderLine and OrderStatus, catalog::Book, the abstract Payment with CardPayment and GiftCardPayment, the Payable and CardGateway interfaces, the Money data type, the Isbn primitive and a note, joined by every kind of class line" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-class.html">Class</a></h4>
<p>Classes, their attributes and operations, and how they relate.</p>
<ul class="ex-shows-short"><li>A note (a comment with a folded corner) linked to Order by a dashed line</li><li>Packages drawn as boxes holding their classes, their names in tabs: sales, payments with card nested inside it, shared</li><li>A package-qualified name: catalog::Book, whose package the view does not show</li><li><a href="./gallery/uml-class.html#shows">19 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-class.html#view=sales" target="_self">A bookshop's sales domain</a>; also <a href="/umlimator/examples/types/uml-class.html#view=sales-right" target="_self">The same domain, laid out right</a></p>
<div class="ex-links"><a href="./gallery/uml-class.html">Open<span class="visually-hidden"> (Class)</span></a><a href="./conformance/uml-class.html">Conformance<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.pdf" target="_self">PDF<span class="visually-hidden"> (Class)</span></a><a href="/umlimator/examples/types/uml-class.json" target="_self">Model<span class="visually-hidden"> (Class)</span></a></div>
</article>
<article class="ex-card" id="type-uml-object">
<a class="ex-still" href="./gallery/uml-object.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-object/overview.png'" alt="A UML object diagram of one placed order: ada, a Customer, linked to order1042, an Order, its two order lines, the books they are for and the card payment, each with its slots" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-object.html">Object</a></h4>
<p>Instances and the links between them at one moment.</p>
<ul class="ex-shows-short"><li>instances, slots and links</li><li>a package box, stereotypes, a note</li><li>owner hidden, names qualified, down</li><li><a href="./gallery/uml-object.html#shows">1 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-object.html#view=overview" target="_self">Object diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-object.html">Open<span class="visually-hidden"> (Object)</span></a><a href="./conformance/uml-object.html">Conformance<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.pdf" target="_self">PDF<span class="visually-hidden"> (Object)</span></a><a href="/umlimator/examples/types/uml-object.json" target="_self">Model<span class="visually-hidden"> (Object)</span></a></div>
</article>
<article class="ex-card" id="type-uml-package">
<a class="ex-still" href="./gallery/uml-package.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-package/overview.png'" alt="A UML package diagram of a bookshop: the packages shared, catalog, sales, payments with card inside it, and wholesale, each a box holding its classes, joined by imports, an access, a merge and a dependency, and the profile BookshopConventions, a closed folder that sales applies" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-package.html">Package</a></h4>
<p>Packages and the dependencies between them.</p>
<ul class="ex-shows-short"><li>nesting, import, access, merge</li><li>closed folders, stereotypes, a note</li><li>three levels deep, laid out down</li><li><a href="./gallery/uml-package.html#shows">1 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-package.html#view=overview" target="_self">Package diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-package.html">Open<span class="visually-hidden"> (Package)</span></a><a href="./conformance/uml-package.html">Conformance<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.pdf" target="_self">PDF<span class="visually-hidden"> (Package)</span></a><a href="/umlimator/examples/types/uml-package.json" target="_self">Model<span class="visually-hidden"> (Package)</span></a></div>
</article>
<article class="ex-card" id="type-uml-composite-structure">
<a class="ex-still" href="./gallery/uml-composite-structure.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-composite-structure/overview.png'" alt="A UML composite structure diagram of an order service: its ports on its border, four parts, two of them showing their types' ports, connectors between them, an open collaboration as a dashed ellipse and a collaboration use with its role bindings" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-composite-structure.html">Composite structure</a></h4>
<p>The parts inside a class, their ports and connectors.</p>
<ul class="ex-shows-short"><li>parts, ports, collaborations</li><li>a component, shared part, note</li><li>a collaboration as the subject</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-composite-structure.html#view=overview" target="_self">Composite structure diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-composite-structure.html">Open<span class="visually-hidden"> (Composite structure)</span></a><a href="./conformance/uml-composite-structure.html">Conformance<span class="visually-hidden"> (Composite structure)</span></a><a href="/umlimator/examples/types/uml-composite-structure.pdf" target="_self">PDF<span class="visually-hidden"> (Composite structure)</span></a><a href="/umlimator/examples/types/uml-composite-structure.json" target="_self">Model<span class="visually-hidden"> (Composite structure)</span></a></div>
</article>
<article class="ex-card" id="type-uml-component">
<a class="ex-still" href="./gallery/uml-component.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-component/overview.png'" alt="A UML component diagram of a bookshop: Shop API a box holding Checkout, ports on their borders with delegations between them, Orders as a ball with a socket, SignIn as a rectangle, an artifact manifesting Shop API" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-component.html">Component</a></h4>
<p>Components and the interfaces they provide and require.</p>
<ul class="ex-shows-short"><li>ports, ball and socket, artifacts</li><li>packages, realizations, &lt;&lt;use&gt;&gt;</li><li>balls, sockets, ports, down</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-component.html#view=overview" target="_self">Component diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-component.html">Open<span class="visually-hidden"> (Component)</span></a><a href="./conformance/uml-component.html">Conformance<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.pdf" target="_self">PDF<span class="visually-hidden"> (Component)</span></a><a href="/umlimator/examples/types/uml-component.json" target="_self">Model<span class="visually-hidden"> (Component)</span></a></div>
</article>
<article class="ex-card" id="type-uml-deployment">
<a class="ex-still" href="./gallery/uml-deployment.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-deployment/overview.png'" alt="A UML deployment diagram of a bookshop in production: devices and execution environments drawn as cubes and nested, artifacts deployed in them, communication paths labelled with their protocols" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-deployment.html">Deployment</a></h4>
<p>Nodes, execution environments and the artifacts deployed on them.</p>
<ul class="ex-shows-short"><li>nodes, devices, artifacts</li><li>nested nodes, laid out down</li><li>&lt;&lt;deploy&gt;&gt; and &lt;&lt;manifest&gt;&gt; lines</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-deployment.html#view=overview" target="_self">Deployment diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-deployment.html">Open<span class="visually-hidden"> (Deployment)</span></a><a href="./conformance/uml-deployment.html">Conformance<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.pdf" target="_self">PDF<span class="visually-hidden"> (Deployment)</span></a><a href="/umlimator/examples/types/uml-deployment.json" target="_self">Model<span class="visually-hidden"> (Deployment)</span></a></div>
</article>
<article class="ex-card" id="type-uml-profile">
<a class="ex-still" href="./gallery/uml-profile.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-profile/overview.png'" alt="A UML profile diagram of a bookshop's modelling conventions: a profile holding metaclasses and stereotypes with their tag definitions, extensions with filled triangles, one marked required, a package applying the profile, and a class showing its stereotypes' tags" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-profile.html">Profile</a></h4>
<p>Stereotypes that extend UML for a domain.</p>
<ul class="ex-shows-short"><li>stereotypes, extensions, tags</li><li>abstract stereotype, enumeration tag</li><li>two profiles, qualified names</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-profile.html#view=overview" target="_self">Profile diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-profile.html">Open<span class="visually-hidden"> (Profile)</span></a><a href="./conformance/uml-profile.html">Conformance<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.pdf" target="_self">PDF<span class="visually-hidden"> (Profile)</span></a><a href="/umlimator/examples/types/uml-profile.json" target="_self">Model<span class="visually-hidden"> (Profile)</span></a></div>
</article>
</div>

### UML behaviour {#family-uml-behaviour}

<div class="ex-grid">
<article class="ex-card" id="type-uml-use-case">
<a class="ex-still" href="./gallery/uml-use-case.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-use-case/overview.png'" alt="A UML use case diagram of a bookshop: a shopper, a member and a payment provider as stick figures, eight use cases as ellipses in the Online bookshop subject, includes and extends drawn dashed with their labels" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-use-case.html">Use case</a></h4>
<p>Actors and the use cases they take part in.</p>
<ul class="ex-shows-short"><li>actors, subject, include, extend</li><li>two subjects, laid out down</li><li>no subject, chains of generalization</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-use-case.html#view=overview" target="_self">Use case diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-use-case.html">Open<span class="visually-hidden"> (Use case)</span></a><a href="./conformance/uml-use-case.html">Conformance<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.pdf" target="_self">PDF<span class="visually-hidden"> (Use case)</span></a><a href="/umlimator/examples/types/uml-use-case.json" target="_self">Model<span class="visually-hidden"> (Use case)</span></a></div>
</article>
<article class="ex-card" id="type-uml-activity">
<a class="ex-still" href="./gallery/uml-activity.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-activity/overview.png'" alt="A UML activity diagram of fulfilling an order in three lanes, Order worker, Warehouse and Email service: actions, an object node, a data store, a decision and a merge, a fork and a join, and a flow final" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-activity.html">Activity</a></h4>
<p>Actions, decisions and flows, in partitions.</p>
<ul class="ex-shows-short"><li>lanes, decisions, forks, objects</li><li>the activity a call opens</li><li>a loop, laid out right, no lanes</li><li><a href="./gallery/uml-activity.html#shows">1 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-activity.html#view=overview" target="_self">Activity diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-activity.html">Open<span class="visually-hidden"> (Activity)</span></a><a href="./conformance/uml-activity.html">Conformance<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.pdf" target="_self">PDF<span class="visually-hidden"> (Activity)</span></a><a href="/umlimator/examples/types/uml-activity.json" target="_self">Model<span class="visually-hidden"> (Activity)</span></a></div>
</article>
<article class="ex-card" id="type-uml-state-machine">
<a class="ex-still" href="./gallery/uml-state-machine.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-state-machine/overview.png'" alt="A UML state machine diagram of an order's life: Placed with its activities, a choice, a fork into the Parcel and Payment regions of Fulfilling, In delivery with a history, Cancelled and a terminate" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-state-machine.html">State machine</a></h4>
<p>States and the transitions between them.</p>
<ul class="ex-shows-short"><li>regions, history, choice</li><li>deep history, a junction, a note</li><li>down, a closed composite</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-state-machine.html#view=overview" target="_self">State machine diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-state-machine.html">Open<span class="visually-hidden"> (State machine)</span></a><a href="./conformance/uml-state-machine.html">Conformance<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.pdf" target="_self">PDF<span class="visually-hidden"> (State machine)</span></a><a href="/umlimator/examples/types/uml-state-machine.json" target="_self">Model<span class="visually-hidden"> (State machine)</span></a></div>
</article>
<article class="ex-card" id="type-uml-sequence">
<a class="ex-still" href="./gallery/uml-sequence.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-sequence/overview.png'" alt="A UML sequence diagram of a bookshop's checkout: a shopper, the storefront, the api, payments and a receipt created on the way, their messages in time order with activation bars, an alt frame with an opt frame and an interaction use inside it" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-sequence.html">Sequence</a></h4>
<p>Messages between lifelines, in time order.</p>
<ul class="ex-shows-short"><li>fragments, activations, a create</li><li>from an interaction use</li><li>from an interaction use</li><li><a href="./gallery/uml-sequence.html#shows">4 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-sequence.html#view=overview" target="_self">Sequence diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-sequence.html">Open<span class="visually-hidden"> (Sequence)</span></a><a href="./conformance/uml-sequence.html">Conformance<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.pdf" target="_self">PDF<span class="visually-hidden"> (Sequence)</span></a><a href="/umlimator/examples/types/uml-sequence.json" target="_self">Model<span class="visually-hidden"> (Sequence)</span></a></div>
</article>
<article class="ex-card" id="type-uml-communication">
<a class="ex-still" href="./gallery/uml-communication.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-communication/overview.png'" alt="A UML communication diagram of the same checkout: five lifelines joined by connectors, each link's messages a stack of numbered rows" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-communication.html">Communication</a></h4>
<p>Numbered messages along the links between objects.</p>
<ul class="ex-shows-short"><li>numbered messages on links</li><li>deep numbers, create, delete</li><li>async messages and a guard</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-communication.html#view=overview" target="_self">Communication diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-communication.html">Open<span class="visually-hidden"> (Communication)</span></a><a href="./conformance/uml-communication.html">Conformance<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.pdf" target="_self">PDF<span class="visually-hidden"> (Communication)</span></a><a href="/umlimator/examples/types/uml-communication.json" target="_self">Model<span class="visually-hidden"> (Communication)</span></a></div>
</article>
<article class="ex-card" id="type-uml-interaction-overview">
<a class="ex-still" href="./gallery/uml-interaction-overview.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-interaction-overview/overview.png'" alt="A UML interaction overview diagram of buying a book: interaction uses for finding a book, checking out and emailing the receipt, a decision looping back through a merge, a fork and a join, and an inline interaction with its three lifelines" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-interaction-overview.html">Interaction overview</a></h4>
<p>An activity whose steps are interactions.</p>
<ul class="ex-shows-short"><li>uses, inline interaction, loops</li><li>laid out right, flow final, a note</li><li>two inline interactions, a merge</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-interaction-overview.html#view=overview" target="_self">Interaction overview diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-interaction-overview.html">Open<span class="visually-hidden"> (Interaction overview)</span></a><a href="./conformance/uml-interaction-overview.html">Conformance<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.pdf" target="_self">PDF<span class="visually-hidden"> (Interaction overview)</span></a><a href="/umlimator/examples/types/uml-interaction-overview.json" target="_self">Model<span class="visually-hidden"> (Interaction overview)</span></a></div>
</article>
<article class="ex-card" id="type-uml-timing">
<a class="ex-still" href="./gallery/uml-timing.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-timing/overview.png'" alt="A UML timing diagram of one charge: two lifelines as step lines through their states on a time ruler in milliseconds, a call and its reply between them at their times, a duration constraint and a time constraint" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-timing.html">Timing</a></h4>
<p>How lifelines change state along a time axis.</p>
<ul class="ex-shows-short"><li>states, values, constraints</li><li>a value lifeline, async messages</li><li>minutes, call and reply, overlaps</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-timing.html#view=overview" target="_self">Timing diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-timing.html">Open<span class="visually-hidden"> (Timing)</span></a><a href="./conformance/uml-timing.html">Conformance<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.pdf" target="_self">PDF<span class="visually-hidden"> (Timing)</span></a><a href="/umlimator/examples/types/uml-timing.json" target="_self">Model<span class="visually-hidden"> (Timing)</span></a></div>
</article>
<article class="ex-card" id="type-uml-information-flow">
<a class="ex-still" href="./gallery/uml-information-flow.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/uml-information-flow/overview.png'" alt="A UML information flow diagram of what travels with an order: a shopper, components and information items, joined by dashed flow lines each naming what it conveys" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/uml-information-flow.html">Information flow</a></h4>
<p>Information items conveyed between elements.</p>
<ul class="ex-shows-short"><li>items and flow lines</li><li>named flows, classes, a self-flow</li><li>laid out down</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/uml-information-flow.html#view=overview" target="_self">Information flow diagram examples</a></p>
<div class="ex-links"><a href="./gallery/uml-information-flow.html">Open<span class="visually-hidden"> (Information flow)</span></a><a href="./conformance/uml-information-flow.html">Conformance<span class="visually-hidden"> (Information flow)</span></a><a href="/umlimator/examples/types/uml-information-flow.pdf" target="_self">PDF<span class="visually-hidden"> (Information flow)</span></a><a href="/umlimator/examples/types/uml-information-flow.json" target="_self">Model<span class="visually-hidden"> (Information flow)</span></a></div>
</article>
</div>

### SysML {#family-sysml}

<div class="ex-grid">
<article class="ex-card" id="type-sysml-requirement">
<a class="ex-still" href="./gallery/sysml-requirement.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-requirement/overview.png'" alt="A SysML requirement diagram of a city e-bike in a req frame: requirements with their ids and wrapped texts, containment crosshairs, blocks satisfying and test cases verifying them" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-requirement.html">Requirement</a></h4>
<p>Requirements and how they are derived, satisfied and verified.</p>
<ul class="ex-shows-short"><li>containment, derive, satisfy, verify</li><li>kinds, risk, verify method</li><li>satisfy, verify, refine, rows</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/sysml-requirement.html#view=overview" target="_self">Requirement diagram examples</a></p>
<div class="ex-links"><a href="./gallery/sysml-requirement.html">Open<span class="visually-hidden"> (Requirement)</span></a><a href="./conformance/sysml-requirement.html">Conformance<span class="visually-hidden"> (Requirement)</span></a><a href="/umlimator/examples/types/sysml-requirement.pdf" target="_self">PDF<span class="visually-hidden"> (Requirement)</span></a><a href="/umlimator/examples/types/sysml-requirement.json" target="_self">Model<span class="visually-hidden"> (Requirement)</span></a></div>
</article>
<article class="ex-card" id="type-sysml-block-definition">
<a class="ex-still" href="./gallery/sysml-block-definition.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-block-definition/overview.png'" alt="A SysML block definition diagram of a city e-bike in a bdd frame: blocks with named compartments of parts, values, constraints and ports, an interface block, constraint blocks and value types" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-block-definition.html">Block definition</a></h4>
<p>Blocks, their properties and how they are composed.</p>
<ul class="ex-shows-short"><li>blocks, value types, compartments</li><li>proxy, full and conjugated ports</li><li>a hierarchy, values with units</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/sysml-block-definition.html#view=overview" target="_self">Block definition diagram examples</a></p>
<div class="ex-links"><a href="./gallery/sysml-block-definition.html">Open<span class="visually-hidden"> (Block definition)</span></a><a href="./conformance/sysml-block-definition.html">Conformance<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.pdf" target="_self">PDF<span class="visually-hidden"> (Block definition)</span></a><a href="/umlimator/examples/types/sysml-block-definition.json" target="_self">Model<span class="visually-hidden"> (Block definition)</span></a></div>
</article>
<article class="ex-card" id="type-sysml-internal-block">
<a class="ex-still" href="./gallery/sysml-internal-block.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-internal-block/overview.png'" alt="A SysML internal block diagram of a city e-bike: the bike as the ibd frame holding its parts, ports on their borders with flow arrows, connectors carrying DC power and phase current" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-internal-block.html">Internal block</a></h4>
<p>The parts of a block and what flows between their ports.</p>
<ul class="ex-shows-short"><li>parts, ports, item flows</li><li>frame ports, delegation, a full port</li><li>a part's own block, two delegations</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/sysml-internal-block.html#view=overview" target="_self">Internal block diagram examples</a></p>
<div class="ex-links"><a href="./gallery/sysml-internal-block.html">Open<span class="visually-hidden"> (Internal block)</span></a><a href="./conformance/sysml-internal-block.html">Conformance<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.pdf" target="_self">PDF<span class="visually-hidden"> (Internal block)</span></a><a href="/umlimator/examples/types/sysml-internal-block.json" target="_self">Model<span class="visually-hidden"> (Internal block)</span></a></div>
</article>
<article class="ex-card" id="type-sysml-parametric">
<a class="ex-still" href="./gallery/sysml-parametric.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/sysml-parametric/overview.png'" alt="A SysML parametric diagram of a city e-bike's range: constraint properties with rounded corners and their expressions, parameters on their borders bound to value properties" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/sysml-parametric.html">Parametric</a></h4>
<p>Constraint blocks that bind a system's values.</p>
<ul class="ex-shows-short"><li>constraints and bindings</li><li>a constraint block as the frame</li><li>a power budget, laid out down</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/sysml-parametric.html#view=overview" target="_self">Parametric diagram examples</a></p>
<div class="ex-links"><a href="./gallery/sysml-parametric.html">Open<span class="visually-hidden"> (Parametric)</span></a><a href="./conformance/sysml-parametric.html">Conformance<span class="visually-hidden"> (Parametric)</span></a><a href="/umlimator/examples/types/sysml-parametric.pdf" target="_self">PDF<span class="visually-hidden"> (Parametric)</span></a><a href="/umlimator/examples/types/sysml-parametric.json" target="_self">Model<span class="visually-hidden"> (Parametric)</span></a></div>
</article>
</div>

### Architecture, data and process {#family-architecture-data-and-process}

<div class="ex-grid">
<article class="ex-card" id="type-c4">
<a class="ex-still" href="./gallery/c4.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/c4/overview.png'" alt="A C4 system context diagram of a bookshop: the shopper and staff as people, the bookshop as the system in the middle, the external systems it uses in grey" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/c4.html">C4</a></h4>
<p>C4's landscape, context, container, component, dynamic and deployment views.</p>
<ul class="ex-shows-short"><li>system context</li><li>containers in a boundary</li><li>components of one container</li><li><a href="./gallery/c4.html#shows">4 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/c4.html#view=overview" target="_self">C4 diagram examples</a></p>
<div class="ex-links"><a href="./gallery/c4.html">Open<span class="visually-hidden"> (C4)</span></a><a href="./conformance/c4.html">Conformance<span class="visually-hidden"> (C4)</span></a><a href="/umlimator/examples/types/c4.pdf" target="_self">PDF<span class="visually-hidden"> (C4)</span></a><a href="/umlimator/examples/types/c4.json" target="_self">Model<span class="visually-hidden"> (C4)</span></a></div>
</article>
<article class="ex-card" id="type-er">
<a class="ex-still" href="./gallery/er.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/er/overview.png'" alt="An entity-relationship diagram of a bookshop's database: seven tables with their key columns first, related by crow's foot ends, identifying lines solid and the rest dashed" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/er.html">Entity-relationship</a></h4>
<p>Entities, their attributes and relationships, with cardinality.</p>
<ul class="ex-shows-short"><li>keys, crow's foot, junction table</li><li>IDEF1X, dependent entities</li><li>crow's foot, laid out down</li><li><a href="./gallery/er.html#shows">1 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/er.html#view=overview" target="_self">Entity-relationship diagram examples</a></p>
<div class="ex-links"><a href="./gallery/er.html">Open<span class="visually-hidden"> (Entity-relationship)</span></a><a href="./conformance/er.html">Conformance<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.pdf" target="_self">PDF<span class="visually-hidden"> (Entity-relationship)</span></a><a href="/umlimator/examples/types/er.json" target="_self">Model<span class="visually-hidden"> (Entity-relationship)</span></a></div>
</article>
<article class="ex-card" id="type-dfd">
<a class="ex-still" href="./gallery/dfd.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/dfd/overview.png'" alt="A data flow diagram of a bookshop, level 1: three external entities, three numbered processes and two data stores, joined by labelled data flows" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/dfd.html">Data flow</a></h4>
<p>Processes, data stores and external entities, and the data between them.</p>
<ul class="ex-shows-short"><li>processes, stores, entities</li><li>a level, checked for balance</li><li>Gane and Sarson symbols</li><li><a href="./gallery/dfd.html#shows">2 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/dfd.html#view=overview" target="_self">Data flow diagram examples</a></p>
<div class="ex-links"><a href="./gallery/dfd.html">Open<span class="visually-hidden"> (Data flow)</span></a><a href="./conformance/dfd.html">Conformance<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.pdf" target="_self">PDF<span class="visually-hidden"> (Data flow)</span></a><a href="/umlimator/examples/types/dfd.json" target="_self">Model<span class="visually-hidden"> (Data flow)</span></a></div>
</article>
<article class="ex-card" id="type-flowchart">
<a class="ex-still" href="./gallery/flowchart.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/flowchart/overview.png'" alt="A flowchart of handling a returned book, laid out down: a start, input and manual input, a decision with yes and no exits, a delay, a database, a document, a connector and an end" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/flowchart.html">Flowchart</a></h4>
<p>The steps and decisions of a process.</p>
<ul class="ex-shows-short"><li>ten symbols, laid out down</li><li>laid out right, three exits, a loop</li><li>an on-page connector pair, a note</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/flowchart.html#view=overview" target="_self">Flowchart examples</a></p>
<div class="ex-links"><a href="./gallery/flowchart.html">Open<span class="visually-hidden"> (Flowchart)</span></a><a href="./conformance/flowchart.html">Conformance<span class="visually-hidden"> (Flowchart)</span></a><a href="/umlimator/examples/types/flowchart.pdf" target="_self">PDF<span class="visually-hidden"> (Flowchart)</span></a><a href="/umlimator/examples/types/flowchart.json" target="_self">Model<span class="visually-hidden"> (Flowchart)</span></a></div>
</article>
<article class="ex-card" id="type-bpmn">
<a class="ex-still" href="./gallery/bpmn.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/bpmn/overview.png'" alt="A BPMN diagram of a bookshop's order to shipment: three pools, the bookshop's in two lanes, tasks, events and gateways joined by sequence flows, dashed message flows between the pools, a timer on the payment task's border" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/bpmn.html">BPMN</a></h4>
<p>Business processes: events, tasks, gateways, pools and lanes.</p>
<ul class="ex-shows-short"><li>pools, lanes, events, gateways</li><li>a collapsed sub-process, opened</li><li>nested lanes, expanded sub-process</li><li><a href="./gallery/bpmn.html#shows">1 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/bpmn.html#view=overview" target="_self">BPMN diagram examples</a></p>
<div class="ex-links"><a href="./gallery/bpmn.html">Open<span class="visually-hidden"> (BPMN)</span></a><a href="./conformance/bpmn.html">Conformance<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.pdf" target="_self">PDF<span class="visually-hidden"> (BPMN)</span></a><a href="/umlimator/examples/types/bpmn.json" target="_self">Model<span class="visually-hidden"> (BPMN)</span></a></div>
</article>
<article class="ex-card" id="type-mindmap">
<a class="ex-still" href="./gallery/mindmap.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/mindmap/overview.png'" alt="A mindmap of opening a bookshop: the root in the middle, six branches left and right, each in its own colour, joined by curves" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/mindmap.html">Mindmap</a></h4>
<p>Ideas branching out from one topic.</p>
<ul class="ex-shows-short"><li>branches left and right</li><li>one side, deep, wrapped text</li><li>sides chosen, a drill-down</li><li><a href="./gallery/mindmap.html#shows">1 more</a></li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/mindmap.html#view=overview" target="_self">Mindmap examples</a></p>
<div class="ex-links"><a href="./gallery/mindmap.html">Open<span class="visually-hidden"> (Mindmap)</span></a><a href="./conformance/mindmap.html">Conformance<span class="visually-hidden"> (Mindmap)</span></a><a href="/umlimator/examples/types/mindmap.pdf" target="_self">PDF<span class="visually-hidden"> (Mindmap)</span></a><a href="/umlimator/examples/types/mindmap.json" target="_self">Model<span class="visually-hidden"> (Mindmap)</span></a></div>
</article>
</div>

### Cloud architecture {#family-cloud-architecture}

<div class="ex-grid">
<article class="ex-card" id="type-aws">
<a class="ex-still" href="./gallery/aws.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/aws/overview.png'" alt="An AWS architecture diagram of a bookshop: a cloud, a region, a VPC, two availability zones, public and private subnets and a security group as nested boxes, fifteen services and resources drawn with their icons and full service names" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/aws.html">AWS</a></h4>
<p>Accounts, regions, VPCs, subnets and the services in them.</p>
<ul class="ex-shows-short"><li>accounts, VPCs, subnets, services</li><li>serverless, a generic group</li><li>two accounts, a security group</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/aws.html#view=overview" target="_self">AWS diagram examples</a></p>
<div class="ex-links"><a href="./gallery/aws.html">Open<span class="visually-hidden"> (AWS)</span></a><a href="./conformance/aws.html">Conformance<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.pdf" target="_self">PDF<span class="visually-hidden"> (AWS)</span></a><a href="/umlimator/examples/types/aws.json" target="_self">Model<span class="visually-hidden"> (AWS)</span></a></div>
</article>
<article class="ex-card" id="type-gcp">
<a class="ex-still" href="./gallery/gcp.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/gcp/overview.png'" alt="A Google Cloud architecture diagram of a bookshop: a project, a region, a network, a subnetwork and two zones as nested boxes, nine products drawn with their icons and full service names" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/gcp.html">Google Cloud</a></h4>
<p>Projects, regions, zones and the services in them.</p>
<ul class="ex-shows-short"><li>projects, regions, zones, products</li><li>a generic group, lines to groups</li><li>two regions, laid out down</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/gcp.html#view=overview" target="_self">Google Cloud diagram examples</a></p>
<div class="ex-links"><a href="./gallery/gcp.html">Open<span class="visually-hidden"> (Google Cloud)</span></a><a href="./conformance/gcp.html">Conformance<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.pdf" target="_self">PDF<span class="visually-hidden"> (Google Cloud)</span></a><a href="/umlimator/examples/types/gcp.json" target="_self">Model<span class="visually-hidden"> (Google Cloud)</span></a></div>
</article>
<article class="ex-card" id="type-azure">
<a class="ex-still" href="./gallery/azure.html" tabindex="-1" aria-hidden="true"><img :src="'/umlimator/examples/types/stills/azure/overview.png'" alt="An Azure architecture diagram of a bookshop: a subscription, a resource group, a region, a virtual network and two subnets as nested boxes, eight services drawn with their icons and full service names" loading="lazy" width="640" height="320"></a>
<h4><a href="./gallery/azure.html">Azure</a></h4>
<p>Subscriptions, resource groups, virtual networks and the services in them.</p>
<ul class="ex-shows-short"><li>subscriptions, groups, networks</li><li>two regions, laid out down</li><li>closed subscriptions, a generic group</li></ul>
<p class="ex-views">Opens on <a href="/umlimator/examples/types/azure.html#view=overview" target="_self">Azure diagram examples</a></p>
<div class="ex-links"><a href="./gallery/azure.html">Open<span class="visually-hidden"> (Azure)</span></a><a href="./conformance/azure.html">Conformance<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.pdf" target="_self">PDF<span class="visually-hidden"> (Azure)</span></a><a href="/umlimator/examples/types/azure.json" target="_self">Model<span class="visually-hidden"> (Azure)</span></a></div>
</article>
</div>

## Atlas {#atlas}

Whole businesses, each one model in many views of the types above, joined by cards that open them.

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
