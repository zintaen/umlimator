---
title: Diagram types
aside: false
pageClass: types-page
---

# Diagram types

umlimator draws 28 diagram types besides its layered maps. Each one is a model of schema version 2 with
`"diagram"` set on its views, drawn by `umlimator/all` ([Typed diagrams](./api/typed-diagrams.md)). Every type has a
live example, made up for a bookshop or an e-bike, and a conformance note saying which parts of its notation are drawn,
which are left out, and why. The [examples gallery](/examples/index.html#diagrams) shows every example of each type,
from the smallest view the tests draw to the stress test.

## UML

The 14 diagrams of UML 2.5.1, and its information flow diagram.

<div class="types-grid">
<div class="type">
  <a class="still" href="/umlimator/examples/sales-classes.html" target="_self"><img :src="'/umlimator/examples/stills/sales-classes/domain.svg'" alt="The class example" loading="lazy"></a>
  <h3 id="uml-class">Class</h3>
  <p>Classes, their attributes and operations, and how they relate.</p>
  <div class="links"><a href="/umlimator/examples/sales-classes.html" target="_self">Live example</a><a href="./conformance/uml-class.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-class" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/order-objects.html" target="_self"><img :src="'/umlimator/examples/stills/order-objects/snapshot.svg'" alt="The object example" loading="lazy"></a>
  <h3 id="uml-object">Object</h3>
  <p>Instances and the links between them at one moment.</p>
  <div class="links"><a href="/umlimator/examples/order-objects.html" target="_self">Live example</a><a href="./conformance/uml-object.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-object" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-packages.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-packages/packages.svg'" alt="The package example" loading="lazy"></a>
  <h3 id="uml-package">Package</h3>
  <p>Packages and the dependencies between them.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-packages.html" target="_self">Live example</a><a href="./conformance/uml-package.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-package" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/order-service-structure.html" target="_self"><img :src="'/umlimator/examples/stills/order-service-structure/internals.svg'" alt="The composite structure example" loading="lazy"></a>
  <h3 id="uml-composite-structure">Composite structure</h3>
  <p>The parts inside a class, their ports and connectors.</p>
  <div class="links"><a href="/umlimator/examples/order-service-structure.html" target="_self">Live example</a><a href="./conformance/uml-composite-structure.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-composite-structure" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-components.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-components/components.svg'" alt="The component example" loading="lazy"></a>
  <h3 id="uml-component">Component</h3>
  <p>Components and the interfaces they provide and require.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-components.html" target="_self">Live example</a><a href="./conformance/uml-component.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-component" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-deployment.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-deployment/production.svg'" alt="The deployment example" loading="lazy"></a>
  <h3 id="uml-deployment">Deployment</h3>
  <p>Nodes, execution environments and the artifacts deployed on them.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-deployment.html" target="_self">Live example</a><a href="./conformance/uml-deployment.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-deployment" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-profile.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-profile/profile.svg'" alt="The profile example" loading="lazy"></a>
  <h3 id="uml-profile">Profile</h3>
  <p>Stereotypes that extend UML for a domain.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-profile.html" target="_self">Live example</a><a href="./conformance/uml-profile.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-profile" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/shopping-use-cases.html" target="_self"><img :src="'/umlimator/examples/stills/shopping-use-cases/shopping.svg'" alt="The use case example" loading="lazy"></a>
  <h3 id="uml-use-case">Use case</h3>
  <p>Actors and the use cases they take part in.</p>
  <div class="links"><a href="/umlimator/examples/shopping-use-cases.html" target="_self">Live example</a><a href="./conformance/uml-use-case.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-use-case" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/fulfil-activity.html" target="_self"><img :src="'/umlimator/examples/stills/fulfil-activity/fulfil.svg'" alt="The activity example" loading="lazy"></a>
  <h3 id="uml-activity">Activity</h3>
  <p>Actions, decisions and flows, in partitions.</p>
  <div class="links"><a href="/umlimator/examples/fulfil-activity.html" target="_self">Live example</a><a href="./conformance/uml-activity.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-activity" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/order-states.html" target="_self"><img :src="'/umlimator/examples/stills/order-states/order-life.svg'" alt="The state machine example" loading="lazy"></a>
  <h3 id="uml-state-machine">State machine</h3>
  <p>States and the transitions between them.</p>
  <div class="links"><a href="/umlimator/examples/order-states.html" target="_self">Live example</a><a href="./conformance/uml-state-machine.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-state-machine" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/checkout-sequence.html" target="_self"><img :src="'/umlimator/examples/stills/checkout-sequence/checkout-sequence.svg'" alt="The sequence example" loading="lazy"></a>
  <h3 id="uml-sequence">Sequence</h3>
  <p>Messages between lifelines, in time order.</p>
  <div class="links"><a href="/umlimator/examples/checkout-sequence.html" target="_self">Live example</a><a href="./conformance/uml-sequence.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-sequence" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/checkout-communication.html" target="_self"><img :src="'/umlimator/examples/stills/checkout-communication/checkout-communication.svg'" alt="The communication example" loading="lazy"></a>
  <h3 id="uml-communication">Communication</h3>
  <p>Numbered messages along the links between objects.</p>
  <div class="links"><a href="/umlimator/examples/checkout-communication.html" target="_self">Live example</a><a href="./conformance/uml-communication.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-communication" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/buy-book-overview.html" target="_self"><img :src="'/umlimator/examples/stills/buy-book-overview/buy-book.svg'" alt="The interaction overview example" loading="lazy"></a>
  <h3 id="uml-interaction-overview">Interaction overview</h3>
  <p>An activity whose steps are interactions.</p>
  <div class="links"><a href="/umlimator/examples/buy-book-overview.html" target="_self">Live example</a><a href="./conformance/uml-interaction-overview.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-interaction-overview" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-timing.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-timing/one-charge.svg'" alt="The timing example" loading="lazy"></a>
  <h3 id="uml-timing">Timing</h3>
  <p>How lifelines change state along a time axis.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-timing.html" target="_self">Live example</a><a href="./conformance/uml-timing.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-timing" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/order-information-flow.html" target="_self"><img :src="'/umlimator/examples/stills/order-information-flow/order-flows.svg'" alt="The information flow example" loading="lazy"></a>
  <h3 id="uml-information-flow">Information flow</h3>
  <p>Information items conveyed between elements.</p>
  <div class="links"><a href="/umlimator/examples/order-information-flow.html" target="_self">Live example</a><a href="./conformance/uml-information-flow.html">Conformance</a><a href="/umlimator/examples/index.html#type-uml-information-flow" target="_self">All examples</a></div>
</div>
</div>

## SysML

Four diagrams of SysML v1.7.

<div class="types-grid">
<div class="type">
  <a class="still" href="/umlimator/examples/ebike-requirements.html" target="_self"><img :src="'/umlimator/examples/stills/ebike-requirements/requirements.svg'" alt="The requirement example" loading="lazy"></a>
  <h3 id="sysml-requirement">Requirement</h3>
  <p>Requirements and how they are derived, satisfied and verified.</p>
  <div class="links"><a href="/umlimator/examples/ebike-requirements.html" target="_self">Live example</a><a href="./conformance/sysml-requirement.html">Conformance</a><a href="/umlimator/examples/index.html#type-sysml-requirement" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/ebike-blocks.html" target="_self"><img :src="'/umlimator/examples/stills/ebike-blocks/blocks.svg'" alt="The block definition example" loading="lazy"></a>
  <h3 id="sysml-block-definition">Block definition</h3>
  <p>Blocks, their properties and how they are composed.</p>
  <div class="links"><a href="/umlimator/examples/ebike-blocks.html" target="_self">Live example</a><a href="./conformance/sysml-block-definition.html">Conformance</a><a href="/umlimator/examples/index.html#type-sysml-block-definition" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/ebike-structure.html" target="_self"><img :src="'/umlimator/examples/stills/ebike-structure/inside-ebike.svg'" alt="The internal block example" loading="lazy"></a>
  <h3 id="sysml-internal-block">Internal block</h3>
  <p>The parts of a block and what flows between their ports.</p>
  <div class="links"><a href="/umlimator/examples/ebike-structure.html" target="_self">Live example</a><a href="./conformance/sysml-internal-block.html">Conformance</a><a href="/umlimator/examples/index.html#type-sysml-internal-block" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/ebike-range.html" target="_self"><img :src="'/umlimator/examples/stills/ebike-range/range-analysis.svg'" alt="The parametric example" loading="lazy"></a>
  <h3 id="sysml-parametric">Parametric</h3>
  <p>Constraint blocks that bind a system's values.</p>
  <div class="links"><a href="/umlimator/examples/ebike-range.html" target="_self">Live example</a><a href="./conformance/sysml-parametric.html">Conformance</a><a href="/umlimator/examples/index.html#type-sysml-parametric" target="_self">All examples</a></div>
</div>
</div>

## Architecture, data and process

<div class="types-grid">
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-c4.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-c4/c4-context.svg'" alt="The c4 example" loading="lazy"></a>
  <h3 id="c4">C4</h3>
  <p>C4's landscape, context, container, component, dynamic and deployment views.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-c4.html" target="_self">Live example</a><a href="./conformance/c4.html">Conformance</a><a href="/umlimator/examples/index.html#type-c4" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-schema.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-schema/er-schema.svg'" alt="The entity-relationship example" loading="lazy"></a>
  <h3 id="er">Entity-relationship</h3>
  <p>Entities, their attributes and relationships, with cardinality.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-schema.html" target="_self">Live example</a><a href="./conformance/er.html">Conformance</a><a href="/umlimator/examples/index.html#type-er" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-data-flow.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-data-flow/dfd-level-1.svg'" alt="The data flow example" loading="lazy"></a>
  <h3 id="dfd">Data flow</h3>
  <p>Processes, data stores and external entities, and the data between them.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-data-flow.html" target="_self">Live example</a><a href="./conformance/dfd.html">Conformance</a><a href="/umlimator/examples/index.html#type-dfd" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/returns-flowchart.html" target="_self"><img :src="'/umlimator/examples/stills/returns-flowchart/returns.svg'" alt="The flowchart example" loading="lazy"></a>
  <h3 id="flowchart">Flowchart</h3>
  <p>The steps and decisions of a process.</p>
  <div class="links"><a href="/umlimator/examples/returns-flowchart.html" target="_self">Live example</a><a href="./conformance/flowchart.html">Conformance</a><a href="/umlimator/examples/index.html#type-flowchart" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-order-to-shipment.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-order-to-shipment/order-to-shipment.svg'" alt="The bpmn example" loading="lazy"></a>
  <h3 id="bpmn">BPMN</h3>
  <p>Business processes: events, tasks, gateways, pools and lanes.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-order-to-shipment.html" target="_self">Live example</a><a href="./conformance/bpmn.html">Conformance</a><a href="/umlimator/examples/index.html#type-bpmn" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-opening-plan.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-opening-plan/mm-plan.svg'" alt="The mindmap example" loading="lazy"></a>
  <h3 id="mindmap">Mindmap</h3>
  <p>Ideas branching out from one topic.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-opening-plan.html" target="_self">Live example</a><a href="./conformance/mindmap.html">Conformance</a><a href="/umlimator/examples/index.html#type-mindmap" target="_self">All examples</a></div>
</div>
</div>

## Cloud architecture

With the vendor's service icons when its icon pack is fetched (<a href="./guide/icon-packs.html">Icons and icon packs</a>), and named glyphs without them.

<div class="types-grid">
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-aws.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-aws/aws-on-aws.svg'" alt="The aws example" loading="lazy"></a>
  <h3 id="aws">AWS</h3>
  <p>Accounts, regions, VPCs, subnets and the services in them.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-aws.html" target="_self">Live example</a><a href="./conformance/aws.html">Conformance</a><a href="/umlimator/examples/index.html#type-aws" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-gcp.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-gcp/gcp-on-gcp.svg'" alt="The google cloud example" loading="lazy"></a>
  <h3 id="gcp">Google Cloud</h3>
  <p>Projects, regions, zones and the services in them.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-gcp.html" target="_self">Live example</a><a href="./conformance/gcp.html">Conformance</a><a href="/umlimator/examples/index.html#type-gcp" target="_self">All examples</a></div>
</div>
<div class="type">
  <a class="still" href="/umlimator/examples/bookshop-azure.html" target="_self"><img :src="'/umlimator/examples/stills/bookshop-azure/az-on-azure.svg'" alt="The azure example" loading="lazy"></a>
  <h3 id="azure">Azure</h3>
  <p>Subscriptions, resource groups, virtual networks and the services in them.</p>
  <div class="links"><a href="/umlimator/examples/bookshop-azure.html" target="_self">Live example</a><a href="./conformance/azure.html">Conformance</a><a href="/umlimator/examples/index.html#type-azure" target="_self">All examples</a></div>
</div>
</div>
