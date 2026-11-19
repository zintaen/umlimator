# Examples

Every example below is live at **[zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)**, built from `main`.
The systems are made up, except the Umlimator Atlas: umlimator's own model.

## Maps

Each map is a JSON model. CI turns it into a self-contained page (`python3 umlimator.py render`) and checks its layout.

| Model | Use case | What it shows |
|---|---|---|
| [`bike-share.json`](bike-share.json) | A city e-bike operator's whole system, the one test and bench model | Boxes with tabs, a line to a box, line kinds and weights, a technology under each label, coloured tabs, a planned card, edited marks, a view pinned by hand, cards with no lines, two views loaded when opened, two rules that hold, owners and two lenses, latency and cost on the Trip service's lines, a trace kept as a numbered view; the rider shop (brand logos, the checkout's numbered steps, a box's tone); the live dock feed (nested boxes, a line from a box, a loop back); the nightly forecast (swimlanes); rider help (cards only that view has, pinned by hand); and a view of each of the 28 diagram types, joined to the map by drill-down |
| [`shapes.json`](shapes.json) | Card shapes, the one style maps draw | A card of each kind that has a shape: people, a browser app, a phone, a window (its own `shape`), a terminal, an agent, a database, a queue, a file, a module, hosts, a hook and an external system |
| [`bike-share-c4.json`](bike-share-c4.json) | A Structurizr workspace, imported | What `umlimator.py import` writes from [`bike-share.dsl`](bike-share.dsl), the bike share's C4 views as its teams keep them in Structurizr, as it is: the workspace's three static views, its system and trip API as boxes, a group as a box, the lines Structurizr implies, a line to a person as the loop back; the deployment and dynamic views it does not read are listed on stderr with their lines |
| [`monorepo.json`](monorepo.json) | A map generated from a monorepo's dependency list | What [`monorepo.py`](monorepo.py) writes from a list of imports: a card per package, a line per import, heavier with more imports, a box per folder, nested as the folders are, and the same cards with no boxes |
| [`umlimator-atlas.json`](umlimator-atlas.json) | The Umlimator Atlas: umlimator's own model, the gallery's one Atlas entry | A map of umlimator's parts and who uses each, its C4 context and containers, the module's layers (package), the typed families (component), the diff Action on a pull request (sequence) and umlimator's state machines, joined by cards that open them; two stories |

[![Bike share: the boxed view](https://zintaen.github.io/umlimator/examples/stills/bike-share/system.png)](https://zintaen.github.io/umlimator/examples/bike-share.html)

Bike share's story, as `umlimator.py record` writes it (CI records it for the site): open it in the page with
[`#story=ride&step=1`](https://zintaen.github.io/umlimator/examples/bike-share.html#story=ride&step=1), or from its Stories menu.

![Bike share: a ride, from unlock to payment, in five steps](https://zintaen.github.io/umlimator/examples/stills/bike-share/story-ride.png)

The bike share's runtime views (`production`, `c4-deployment`) and its cloud comparison (`new-city` and the three cloud views, a tender for a second city) are illustrative, not a system anyone runs. Its C4 views and [`bike-share.dsl`](bike-share.dsl), imported to `bike-share-c4.json`, are two sources of one picture: `tests/bike-share.test.mjs` fails when their cards disagree. Its typed elements' ids carry their family's prefix (`c4-`, `er-`, `dfd-`, `bp-`, `mm-`, `gcp-`, `az-` and `aws-`), as a C4 element and a map card are different elements, and the cloud views' icon packs' labels (`iconPacks`) are one per pack.

`bike-share.json` is built, not written: edit its part files in [`../tools/bike-share/`](../tools/bike-share/) (the model's own fields and the parts' order in `model.json`, then one file per part holding its cards, lines and views) and run `node tools/bike-share.mjs`, which writes the model with every key in a fixed order. `node tools/bike-share.mjs --check` and `tests/bike-share.test.mjs` fail when the committed model or a part file is not what the build writes.

## Diagrams

A diagram type draws a typed model (`"schemaVersion": 2`, [`docs/diagrams/model.md`](../docs/diagrams/model.md)) in its
own notation. CI renders and checks each as it does the maps, validates it against the JSON Schema, and runs the diff
Action on it in a pull request; the site shows its stills and its PDF.

| Model | Diagram | What it shows |
|---|---|---|
| [`sales-classes.json`](sales-classes.json) | UML class diagram (`uml.class`, 0.18.0) | A bookshop's sales domain: classes with attributes and operations, a stereotype, an abstract class and operation, static and derived attributes, an interface and its realization, an enumeration, a data type, a package, a note; associations with roles, multiplicities, composition, aggregation and navigable ends, a generalization and a «use» dependency; the view laid out top to bottom with one class pinned and a compartment collapsed, and a second view of the payments alone. What the class diagram covers, and what each export shows: [`docs/conformance/uml-class.md`](../docs/conformance/uml-class.md) |
| [`checkout-sequence.json`](checkout-sequence.json) | UML sequence diagram (`uml.sequence`, 0.20.0) | The bookshop's checkout on a time axis: an actor and four lifelines; calls, a self-call, an async message, replies and a create; activation bars derived from them, one nested; an `alt` with two operands, an `opt` inside it and an interaction use. What the sequence diagram covers: [`docs/conformance/uml-sequence.md`](../docs/conformance/uml-sequence.md) |
| [`checkout-communication.json`](checkout-communication.json) | UML communication diagram (`uml.communication`, 0.20.0) | The same checkout's paid branch as a communication diagram: lifelines joined by connectors, one from api to itself, and each link's messages a stack of numbered rows (1, 1.1, 1.1.2.1) with an arrow toward the receiver. What the communication diagram covers: [`docs/conformance/uml-communication.md`](../docs/conformance/uml-communication.md) |
| [`shopping-use-cases.json`](shopping-use-cases.json) | UML use case diagram (`uml.use-case`, 0.21.0) | What shoppers do at the bookshop: three actors (one a kind of another) as stick figures, eight use cases in the subject's box, two includes, two extends at named extension points with their conditions, a generalization between use cases. What the use case diagram covers: [`docs/conformance/uml-use-case.md`](../docs/conformance/uml-use-case.md) |
| [`fulfil-activity.json`](fulfil-activity.json) | UML activity diagram (`uml.activity`, 0.21.0) | Fulfilling an order in three lanes, laid out down: an object node, a data store, send and accept actions, a decision with its guards and a merge, a fork and a join, a branch that ends in a flow final, and a call behaviour action that opens its own activity (`take-payment`). What the activity diagram covers: [`docs/conformance/uml-activity.md`](../docs/conformance/uml-activity.md) |
| [`order-states.json`](order-states.json) | UML state machine diagram (`uml.state-machine`, 0.21.0) | An order's life: states with entry, do and exit activities and an internal transition, a choice, a fork into the two regions of Fulfilling and a join out, a composite with a shallow history, a self-transition, a terminate, transitions written `trigger [guard] / effect`. What the state machine diagram covers: [`docs/conformance/uml-state-machine.md`](../docs/conformance/uml-state-machine.md) |
| [`buy-book-overview.json`](buy-book-overview.json) | UML interaction overview diagram (`uml.interaction-overview`, 0.21.0) | Buying a book, laid out down: interaction uses that open their sequence views, a decision looping back through a merge, a fork and a join, and an inline interaction drawn with its sequence diagram inside. What the interaction overview diagram covers: [`docs/conformance/uml-interaction-overview.md`](../docs/conformance/uml-interaction-overview.md) |
| [`bookshop-components.json`](bookshop-components.json) | UML component diagram (`uml.component`, 0.22.0) | The bookshop's components: Shop API a box holding Checkout, ports on both borders, a delegation in and one out between them, an assembly to the payment provider's port; Orders provided as a ball and required by a socket, SignIn as a rectangle with «use» lines; a dependency and an artifact's manifestation. What the component diagram covers: [`docs/conformance/uml-component.md`](../docs/conformance/uml-component.md) |
| [`bookshop-deployment.json`](bookshop-deployment.json) | UML deployment diagram (`uml.deployment`, 0.22.0) | The bookshop in production: devices, execution environments and nodes as cubes, nested two deep; artifacts deployed by nesting and one by a «deploy» line; a deployment specification and its dependency; manifestations of the components; communication paths with their protocols. What the deployment diagram covers: [`docs/conformance/uml-deployment.md`](../docs/conformance/uml-deployment.md) |
| [`order-service-structure.json`](order-service-structure.json) | UML composite structure diagram (`uml.composite-structure`, 0.22.0) | Inside the order service: its ports on its border, four parts (one shared, dashed), the two whose classes the model holds showing their type's ports (`check` warns of the other two, `part-type`), connectors from the subject's ports in to a part's and out, an open collaboration as a dashed ellipse with its roles, and a collaboration use binding two parts to its roles. What the composite structure diagram covers: [`docs/conformance/uml-composite-structure.md`](../docs/conformance/uml-composite-structure.md) |
| [`bookshop-profile.json`](bookshop-profile.json) | UML profile diagram (`uml.profile`, 0.23.0) | The bookshop's modelling conventions, laid out down: a profile holding two metaclasses and four stereotypes with their tag definitions, an extension marked `{required}` (every class of `sales` gets «owned»), a stereotype specializing another, tags of String and Boolean with a default; `sales` applies the profile by «apply», and Order shows a compartment of tags for each stereotype it has, its `placedAt` its «column» tags in braces. What the profile diagram covers: [`docs/conformance/uml-profile.md`](../docs/conformance/uml-profile.md) |
| [`order-information-flow.json`](order-information-flow.json) | UML information flow diagram (`uml.information-flow`, 0.24.0) | What travels with an order: the shopper (the use case example's actor), the storefront, Shop API and payment provider (the component example's), a warehouse and an email service; four information items; eight dashed «flow» lines, each saying what it conveys, one back flow running under the rows. What it covers: [`docs/conformance/uml-information-flow.md`](../docs/conformance/uml-information-flow.md) |
| [`bookshop-schema.json`](bookshop-schema.json) | Entity-relationship diagram (`er`, 0.24.0) | The bookshop's database: seven tables with their key columns first, a composite key, a junction table, a unique column, a nullable foreign key, a self-reference; identifying lines solid, the rest dashed, each end in crow's foot (or IDEF1X with `notation`). What it covers: [`docs/conformance/er.md`](../docs/conformance/er.md) |
| [`returns-flowchart.json`](returns-flowchart.json) | Flowchart (`flowchart`, 0.24.0) | Handling a returned book, laid out down: a start and an end, input/output, manual input, a decision with yes and no, a predefined process, a delay, a database, a document, and a connector joining two branches. What it covers: [`docs/conformance/flowchart.md`](../docs/conformance/flowchart.md) |
| [`bookshop-data-flow.json`](bookshop-data-flow.json) | Data flow diagram (`dfd`, 0.24.0) | The bookshop's data flow in two levels: three external entities, three numbered processes and two stores; Take order opens its level 2, which balances against it. What it covers: [`docs/conformance/dfd.md`](../docs/conformance/dfd.md) |
| [`bookshop-c4.json`](bookshop-c4.json) | C4 (`c4.context`, `c4.container`, `c4.component`, `c4.dynamic`, `c4.deployment`, 0.24.0) | The bookshop's architecture: a system context, its containers (a database as a cylinder, the system a dashed boundary), the Shop API's components, placing an order as ten numbered steps, and production's deployment nodes holding container instances; external systems grey. What it covers: [`docs/conformance/c4.md`](../docs/conformance/c4.md) |
| [`ebike-requirements.json`](ebike-requirements.json) | SysML requirement diagram (`sysml.requirement`, 0.25.0) | A shared city e-bike's requirements in a `req` frame: the specification containing pedal assistance, range and docking (crosshair lines), each with its id and wrapped text; blocks satisfying them, test cases verifying them, a derive, a refine, a trace and a copy, and a «rationale» note. What it covers: [`docs/conformance/sysml-requirement.md`](../docs/conformance/sysml-requirement.md) |
| [`ebike-blocks.json`](ebike-blocks.json) | SysML block definition diagram (`sysml.block-definition`, 0.25.0) | The e-bike's blocks in a `bdd` frame with SysML's named compartments: EBike's parts, reference, values and constraints, a battery's ports, an interface block's flow properties, two constraint blocks with their expressions and parameters, value types with their units; composition, generalization and «use». What it covers: [`docs/conformance/sysml-block-definition.md`](../docs/conformance/sysml-block-definition.md) |
| [`ebike-structure.json`](ebike-structure.json) | SysML internal block diagram (`sysml.internal-block`, 0.25.0) | Inside the e-bike: EBike as the `ibd` frame holding its parts, the dock it refers to (dashed) and its values; ports on the parts' borders, the charging ports typed by an interface block (one conjugated) with their flow arrows, connectors carrying DC power and phase current as item flows. What it covers: [`docs/conformance/sysml-internal-block.md`](../docs/conformance/sysml-internal-block.md) |
| [`ebike-range.json`](ebike-range.json) | SysML parametric diagram (`sysml.parametric`, 0.25.0) | The e-bike's range in eco and boost from its battery's usable energy: three constraint properties with their expressions, their parameters on their borders, bound to the bike's value properties. What it covers: [`docs/conformance/sysml-parametric.md`](../docs/conformance/sysml-parametric.md) |
| [`bookshop-opening-plan.json`](bookshop-opening-plan.json) | Mindmap (`mindmap`, 0.26.0) | Opening the bookshop: 22 topics left and right of the root, six branches each in a colour of the kind palette, their sides pinned in `present`. What it covers: [`docs/conformance/mindmap.md`](../docs/conformance/mindmap.md) |
| [`bookshop-gcp.json`](bookshop-gcp.json) | Google Cloud (`gcp`, 0.26.0) | The bookshop on Google Cloud: a project, a region, a network, a subnetwork and two zones as nested boxes titled with their kind (a region and a zone dashed), nine products and the shoppers, a line from a group's border. The site shows Google's icons; a copy of this repository draws a glyph and the full service name on each card until you fetch them (`umlimator.py pack fetch gcp`, after Google's terms). What it covers: [`docs/conformance/gcp.md`](../docs/conformance/gcp.md) |
| [`bookshop-azure.json`](bookshop-azure.json) | Azure (`azure`, 0.26.0) | The bookshop on Azure: a subscription, a resource group, a region, a virtual network and two subnets as nested boxes, eight services, a line from a subnet's border. Microsoft's icons on the site, glyphs in a copy until you fetch them, as for Google Cloud (`umlimator.py pack fetch azure`, after Microsoft's terms). What it covers: [`docs/conformance/azure.md`](../docs/conformance/azure.md) |
| [`bookshop-aws.json`](bookshop-aws.json) | AWS (`aws`, 0.26.0) | The bookshop on AWS: a cloud, a region, a VPC, two availability zones, public and private subnets and a security group as nested boxes (a region and an availability zone dashed), twelve services and three resources. AWS's icons on the site, glyphs in a copy until you fetch them, as for Google Cloud (`umlimator.py pack fetch aws`, after AWS's terms). What it covers: [`docs/conformance/aws.md`](../docs/conformance/aws.md) |
| [`bookshop-order-to-shipment.json`](bookshop-order-to-shipment.json) | BPMN (`bpmn`, 0.27.0) | From order to shipment: three pools (the shopper, the bookshop with two lanes, the payment provider as a black box), a service task with a timer boundary event, exclusive and parallel gateways, a collapsed sub-process that opens its own view, a call activity, message flows to a pool's border, a data object and a data store, an annotation and a group |
| [`bookshop-timing.json`](bookshop-timing.json) | UML timing diagram (`uml.timing`, 0.23.0) | One charge on a time ruler in ms: the order worker and the payment provider, the overview's and the sequence example's lifelines, each a step line through its states; a call and its reply at their times, slanted between their senders' and receivers' states; a duration constraint `{<= 800 ms}` under the worker's lane and a time constraint on its last change. What the timing diagram covers: [`docs/conformance/uml-timing.md`](../docs/conformance/uml-timing.md) |
| [`order-objects.json`](order-objects.json) | UML object diagram (`uml.object`, 0.19.0) | One placed order of the same bookshop as instances of its classes: each head `name : Classifier`, underlined, its slots as `feature = value` rows; links with a name or with roles by their ends; laid out top to bottom. What the object diagram covers: [`docs/conformance/uml-object.md`](../docs/conformance/uml-object.md) |
| [`bookshop-packages.json`](bookshop-packages.json) | UML package diagram (`uml.package`, 0.19.0) | The bookshop's packages, each a box holding the classes it owns, `card` inside `payments`; two classes named `Order` in two packages; «import», «access» (a private import), «merge» and a dependency between the boxes; the profile `BookshopConventions`, a closed «profile» folder, applied by `sales` («apply»). What the package diagram covers: [`docs/conformance/uml-package.md`](../docs/conformance/uml-package.md) |

[![The class diagram's domain view](https://zintaen.github.io/umlimator/examples/stills/sales-classes/domain.png)](https://zintaen.github.io/umlimator/examples/sales-classes.html)

[![The object diagram: order 1042, just placed](https://zintaen.github.io/umlimator/examples/stills/order-objects/snapshot.png)](https://zintaen.github.io/umlimator/examples/order-objects.html)
[![The package diagram: the bookshop's packages](https://zintaen.github.io/umlimator/examples/stills/bookshop-packages/packages.png)](https://zintaen.github.io/umlimator/examples/bookshop-packages.html)
[![The sequence diagram: checkout](https://zintaen.github.io/umlimator/examples/stills/checkout-sequence/checkout-sequence.png)](https://zintaen.github.io/umlimator/examples/checkout-sequence.html)
[![The communication diagram: checkout, payment accepted](https://zintaen.github.io/umlimator/examples/stills/checkout-communication/checkout-communication.png)](https://zintaen.github.io/umlimator/examples/checkout-communication.html)
[![The use case diagram: shopping](https://zintaen.github.io/umlimator/examples/stills/shopping-use-cases/shopping.png)](https://zintaen.github.io/umlimator/examples/shopping-use-cases.html)
[![The activity diagram: fulfilling an order](https://zintaen.github.io/umlimator/examples/stills/fulfil-activity/fulfil.png)](https://zintaen.github.io/umlimator/examples/fulfil-activity.html)
[![The state machine diagram: an order's life](https://zintaen.github.io/umlimator/examples/stills/order-states/order-life.png)](https://zintaen.github.io/umlimator/examples/order-states.html)
[![The interaction overview diagram: buying a book](https://zintaen.github.io/umlimator/examples/stills/buy-book-overview/buy-book.png)](https://zintaen.github.io/umlimator/examples/buy-book-overview.html)
[![The component diagram: the bookshop's components](https://zintaen.github.io/umlimator/examples/stills/bookshop-components/components.png)](https://zintaen.github.io/umlimator/examples/bookshop-components.html)
[![The deployment diagram: production](https://zintaen.github.io/umlimator/examples/stills/bookshop-deployment/production.png)](https://zintaen.github.io/umlimator/examples/bookshop-deployment.html)
[![The composite structure diagram: inside the order service](https://zintaen.github.io/umlimator/examples/stills/order-service-structure/internals.png)](https://zintaen.github.io/umlimator/examples/order-service-structure.html)
[![The profile diagram: the bookshop's conventions](https://zintaen.github.io/umlimator/examples/stills/bookshop-profile/profile.png)](https://zintaen.github.io/umlimator/examples/bookshop-profile.html)
[![The timing diagram: one charge](https://zintaen.github.io/umlimator/examples/stills/bookshop-timing/one-charge.png)](https://zintaen.github.io/umlimator/examples/bookshop-timing.html)
[![C4: the bookshop's containers](https://zintaen.github.io/umlimator/examples/stills/bookshop-c4/c4-containers.png)](https://zintaen.github.io/umlimator/examples/bookshop-c4.html)
[![BPMN: from order to shipment](https://zintaen.github.io/umlimator/examples/stills/bookshop-order-to-shipment/order-to-shipment.png)](https://zintaen.github.io/umlimator/examples/bookshop-order-to-shipment.html)
[![The ER diagram: the bookshop's schema](https://zintaen.github.io/umlimator/examples/stills/bookshop-schema/er-schema.png)](https://zintaen.github.io/umlimator/examples/bookshop-schema.html)
[![The SysML internal block diagram: inside the e-bike](https://zintaen.github.io/umlimator/examples/stills/ebike-structure/inside-ebike.png)](https://zintaen.github.io/umlimator/examples/ebike-structure.html)
[![A mindmap: opening the bookshop](https://zintaen.github.io/umlimator/examples/stills/bookshop-opening-plan/mm-plan.png)](https://zintaen.github.io/umlimator/examples/bookshop-opening-plan.html)
[![Google Cloud: the bookshop, icons and full names](https://zintaen.github.io/umlimator/examples/stills/bookshop-gcp/gcp-on-gcp.png)](https://zintaen.github.io/umlimator/examples/bookshop-gcp.html)
[![Azure: the bookshop, icons and full names](https://zintaen.github.io/umlimator/examples/stills/bookshop-azure/az-on-azure.png)](https://zintaen.github.io/umlimator/examples/bookshop-azure.html)
[![AWS: the bookshop, icons and full names](https://zintaen.github.io/umlimator/examples/stills/bookshop-aws/aws-on-aws.png)](https://zintaen.github.io/umlimator/examples/bookshop-aws.html)

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft. No vendor icon is in
this repository: every page and still committed is built with `UMLIMATOR_NO_PACKS=1`. Since 16 Nov 2026 the GitHub Pages
site is built with the Google Cloud, Azure and AWS packs fetched, their terms accepted, so the cloud examples there show
the real icons with the vendors' legal lines.

## Why the Umlimator Atlas is not a test model

`bike-share.json` is the model the tests and the benchmark read; [`umlimator-atlas.json`](umlimator-atlas.json), umlimator drawn by itself, is the gallery's Atlas and stays out of the bench and every layout, hash and count pin; only the gallery and doc-name tests read it, to check that its links and export names exist. It has no honest trace, latency or cost data, no hardware for SysML and no business process for BPMN, and its content changes with the code, so a pinned picture of it would describe last month's umlimator. CI renders it, checks its layout and validates it, with nothing about its content pinned.

## Host pages

The module embedded in a page, as an app would use it. Serve the repository over HTTP to open them locally
(`python3 -m http.server`, then `http://localhost:8000/examples/`).

| Page | What the host does |
|---|---|
| [`playground.html`](playground.html) | Edit a model as JSON and the map follows, with `validate()`'s problems, and the broken rules (`rules()`) and `check()`'s layout issues for the view shown, each selecting what it is about; Share puts the model in the link |
| [`embed.html`](embed.html) | `render()` with the standalone page's pieces, each a checkbox (`nav`, `details`, `legend`, `hints`), a view loaded when a card or its details open it (`open`, `update()`, `setView()`) or unfold it in place (`expand`, `map.expand()`), SVG and PNG export, light, dark and a host's own palette, the minimap |
| [`live.html`](live.html) | `overlay()` once a second on the bike share's dock feed, the model unchanged: flow as fast as each line's dock events, lines that drop events pulse rose, slow ones glow amber with their delay, and each card's tab shows its lag |
| [`ask.html`](ask.html) | Questions answered on the map: words, the cards and lines they are about lit (`highlight()` with `paths()` and `reach()`), a flow played as a `tour()`, and the view in sentences (`describe()`), the text an AI model would get |
| [`replay.html`](replay.html) | A trace replayed (`replay()`): an OpenTelemetry export ([`traces/ride-end.json`](traces/ride-end.json)) read by `otlpSpans()`, each call along its line at its time, its duration kept as a label, with pause and stop; `umlimator.py trace` keeps the same trace as bike-share's `ride-end` view |
| [`edit.html`](edit.html) | `editable`: the map emits `change` events, the host applies them and calls `update()`, with undo from `history()` |
| [`class-editor.html`](class-editor.html) | `editable` on a class diagram: each gesture emits one `edit` event, a transaction of commands, which the host applies with `apply()`, keeps in `history()` for undo and redo, and draws with `update()`; it may refuse one, and it saves the model as it is |
| [`timelapse.html`](timelapse.html) | Four made-up releases of the bike share on a slider: `update()` eases from one to the next (new cards fade in, removed ones fade out, moved ones glide), `diff()` says what changed and marks it on request |
| [`drift.html`](drift.html) | `drift()`: the bike share against a week of made-up traffic, as a tracing backend lists it; the lines that ran undrawn come in, the drawn ones that carried nothing fade |
| [`notations.html`](notations.html) | `shapes.json` in the one card-shape style, light and dark, each a `<umlimator-map>` |
| [`element.html`](element.html) | `<umlimator-map>`: a map from HTML alone, from `src` with a still until it is drawn, and from a model written in the page; controls that set its attributes, and its events as they come; the fenced block a docs site turns into it |
| [`layout.mjs`](layout.mjs) | `layout()` in Node, with no DOM: lays out every view and fails when a line runs more than 3 times its direct route, a check a host can run in CI |

[`icons.js`](icons.js) shows how a host gives `render()` the line icons in `icons/`.

## Where each feature is shown

| Feature | Where |
|---|---|
| Views a card opens (`opensView`) | bike-share: four levels of map, the rider shop's Shop API, and from the map to the typed views and between them |
| A view the host loads when it's opened (`opensView` with `opensCount`) | bike-share: Trip service and Fleet service, in `embed.html` |
| A stacked card unfolded in place (E, Alt + click, `map.expand()`) | bike-share: Trip service and Fleet service in `system`, Bike share in `context`, Dock listener in `fleet`; numbered, with its run order: Demand forecast in `fleet` (with its lanes) and Rider help in `system` |
| Boxes (`containers`) and their tabs (`badges`) | bike-share `system` and `dock-feed` |
| A box's tone, a tinted region (`tone`) | bike-share `checkout` |
| Nested boxes (`parent`) | bike-share `dock-feed` |
| A line to or from a box | bike-share `system` (Monitoring to Rides) and `dock-feed` (Checks to Quarantine) |
| Line kinds (`kind`: calls, feeds, triggers, state, guard) | bike-share |
| Line weights (`weight`) | bike-share (`trips`, `dock-feed`, `checkout`), `live.html` |
| A line's second label (`sublabel`) | bike-share (REST, gRPC, MQTT) |
| The sides a line uses (`fromSide`, `toSide`) | bike-share `system` and `fleet` |
| Tabs on cards (`badges`, with `tone`) | bike-share (SSO, v2 beta, 3 partitions), `live.html` |
| Line icons and brand logos (`icon`) | every model; logos in bike-share |
| A card with its name only (`noSub`) | bike-share (Payment provider) |
| Edited and planned marks (`edited`, `change: "planned"`) | bike-share (Pricing, Charging) |
| Cards with no lines in a row of their own | bike-share `system` (Status page, Feature flags) |
| Positions set by hand (`layout`) | bike-share `system`, `help` and `checkout` |
| Space between columns and rows (`gap`, `rgap`) | bike-share `dock-feed` |
| A view's loop back (`loop: true`) | bike-share `dock-feed` (Quarantine back to the telemetry stream) |
| Steps in run order (`render: "sequence"`) and a tour | bike-share `api`, `demand` and `help`, `ride-end` (no tour) |
| Steps on the lines of any view (`step`) | bike-share `checkout` (with a tour) |
| Swimlanes (`lanes`) | bike-share `demand` |
| Cards that only one view has (a view's `nodes`), and per-view changes (`nodeOverrides`) | bike-share `help` |
| A to B and B to A as two lines (`keepPairs`) | bike-share `fleet` (today's plan and the vans' routes) |
| `render()`, its events, `update()`, `setView()`, `focus()`, `toSVG()`, `toPNG()`, themes | `embed.html` |
| Deeper tints (`--um-tint`) | `embed.html`, its host's palette |
| The standalone page's pieces in `render()`: views list, details panel, legend, hint line (`nav`, `details`, `legend`, `hints`) | `embed.html` |
| Marks over the map (`overlay()`): flow speed, glows, pulses, labels, tabs | `live.html`, `replay.html` |
| Paths and reach lit (`paths()`, `reach()`, `highlight()`) | `ask.html`; every map on the site (the details panel's → and ←, or Shift-click a second card and ⇄) |
| A view in sentences (`describe()`), a tour along any path (`tour()`) | `ask.html` |
| A trace replayed (`replay()`, `otlpSpans()`) | `replay.html` |
| A trace kept as a numbered view (`sequenceFromTrace()`, `umlimator.py trace`): each call a step, its duration under its label | bike-share `ride-end`, made from `traces/ride-end.json` with `traces/match.json` |
| Lenses (`lenses`, `owner`, `map.lens()`), the page's Lenses menu and `#lens=<id>` | bike-share: By team (cards ringed by owner, with a legend) and Data flow (feeds and state lines lit, the rest dimmed) |
| Budgets (`latency`, `cost`): the slowest or costliest path (`critical()`) and what-if (`whatIf()`) | bike-share `trips`: the details panel's ⏱, ¤ and ⊘ (What if this goes down?) |
| A story told step by step (`stories`, `play()`), its Stories menu and recording in the page, `umlimator.py record` | bike-share (`ride`: a ride from unlock to payment), on the site; pictured under Maps |
| Editing and undo (`editable`, `change`, `history()`) | `edit.html` |
| A diagram type: a typed model in its own notation (`schemaVersion: 2`, a view's `diagram`), from `umlimator/all` | sales-classes (`uml.class`), order-objects (`uml.object`), bookshop-packages (`uml.package`), checkout-sequence (`uml.sequence`), checkout-communication (`uml.communication`), shopping-use-cases (`uml.use-case`), fulfil-activity (`uml.activity`), order-states (`uml.state-machine`), buy-book-overview (`uml.interaction-overview`), bookshop-components (`uml.component`), bookshop-deployment (`uml.deployment`), order-service-structure (`uml.composite-structure`) |
| A class diagram's parts: compartments, members as UML text, stereotypes, line ends, end labels, notes (`present.collapsed`, `direction: "down"`) | sales-classes `domain` and `payments-only` |
| Ownership drawn as nesting: a package owning something the view shows is a box holding it, names qualified from the nearest shown owner or the view's `subject` (`parent`, `subject`, 0.19.0) | bookshop-packages, sales-classes `domain` (and `payments-only`, with its subject) |
| An object diagram's parts: underlined heads, anonymous instances, slots as `feature = value`, links with names and roles | order-objects |
| A package diagram's lines: «import», «access», «merge», dependency | bookshop-packages |
| Editing a typed view (`edit` events, `apply()`, `history()`; the palette, the relationship picker, the properties and members as text, the problems, the outline) | `class-editor.html` |
| A Mermaid `classDiagram`, imported (`umlimator.py import`) | [`tests/import/classes.mmd`](../tests/import/classes.mmd), which CI imports (`tests/import.py`) |
| A sequence diagram's parts: messages of every sort, derived activation bars, frames with guards, an interaction use; a communication diagram's stacks of numbered messages | checkout-sequence, checkout-communication |
| A Mermaid `sequenceDiagram`, imported (`umlimator.py import`); a trace as a sequence diagram (`umlimator.py trace --diagram uml.sequence`) | [`tests/import/sequence.mmd`](../tests/import/sequence.mmd), which CI imports (`tests/import.py`); bike-share's [`traces/ride-end.json`](traces/ride-end.json) (`tests/cli.py`) |
| Shapes that are not boxes, with lines that end on their outlines: an actor, an ellipse, the control nodes' circles, diamonds and bars, a state's rounded box | shopping-use-cases, fulfil-activity, order-states, buy-book-overview |
| Lanes (partitions, nested), a node's lane changed by a drop; a call behaviour action that opens its activity | fulfil-activity |
| Regions in a composite state, the transition micro-syntax `trigger [guard] / effect`, pseudostates by kind | order-states |
| An inline interaction drawn with its sequence diagram inside; interaction uses that open their views | buy-book-overview |
| Ports on borders, each on the side its lines go; lines from a box's port inward (a delegation, a connector to a part's port); boxes nested with room for their ports | bookshop-components, order-service-structure |
| A provided interface as a ball and a required one as a socket (`present.<id>.as: "ball"`, `B`) | bookshop-components |
| Nodes, devices and execution environments as cubes, nested; deployment by nesting or by a «deploy» line; a keyword over a box's name | bookshop-deployment |
| A part showing its type's ports (`ends.<end>.part`), a shared part, an open collaboration as a dashed ellipse, a collaboration use's role bindings | order-service-structure |
| A Mermaid `stateDiagram`, imported (`umlimator.py import`) | [`tests/import/state.mmd`](../tests/import/state.mmd), which CI imports (`tests/import.py`) |
| Line ends by multiplicity in two notations on one geometry (crow's foot, IDEF1X: `notation`); a column as a row of text | bookshop-schema |
| Levels made by `D` and checked for balance; two symbol sets on one geometry (`notation`) | bookshop-data-flow |
| Typed C4: a view's subject as a dashed boundary, implied relationships, a dynamic view's numbered steps, deployment nodes holding instances; elements on the map's card shapes but `node` (`props.shape`) | bookshop-c4 |
| A mindmap: the tree strategy's bands left and right of the root, branch curves in the kind palette, sides in `present` | bookshop-opening-plan, [`tests/mindmap-stress.json`](../tests/mindmap-stress.json) |
| Cloud architecture: groups nested as boxes titled with their kind, service cards with an icon from a pack the user fetched (`umlimator.py pack fetch`, after the vendor's terms) or a glyph, the full service name, Google's legal line | bookshop-gcp, bookshop-azure, bookshop-aws, [`tests/cloud-stress.json`](../tests/cloud-stress.json) |
| A Mermaid mindmap, imported (`umlimator.py import`) | [`tests/import/mindmap.mmd`](../tests/import/mindmap.mmd), which CI reads (`tests/import.py`) |
| BPMN: pools and nested lanes as bands, boundary events on an activity's border, message flows to a pool's border, a sub-process expanded or collapsed by the view, names outside events and gateways, a group across lanes | bookshop-order-to-shipment, [`tests/bpmn-stress.json`](../tests/bpmn-stress.json) |
| BPMN XML, imported and exported laid out (`umlimator.py import`, `export`, through a `bpmn-moddle` you install) | [`tests/import/descriptive.bpmn`](../tests/import/descriptive.bpmn), which CI imports (`tests/import.py`) |
| A Mermaid `erDiagram`, a Mermaid flowchart (`--typed`), a Structurizr JSON workspace and DBML, imported (`umlimator.py import`) | [`tests/import/er.mmd`](../tests/import/er.mmd), [`flowchart.mmd`](../tests/import/flowchart.mmd), [`structurizr.json`](../tests/import/structurizr.json), [`dbml.json`](../tests/import/dbml.json), which CI reads (`tests/import.py`, the readers' tests) |
| SysML frames and their headers; requirements with wrapped text and containment crosshairs; named compartments; proxy and full ports with flow arrows, `~` conjugation and item flows; constraint properties with parameters on their borders and binding connectors | ebike-requirements, ebike-blocks, ebike-structure, ebike-range, bike-share |
| A Mermaid `requirementDiagram`, imported and written back (`umlimator.py import`) | [`tests/import/requirement.mmd`](../tests/import/requirement.mmd), which CI imports (`tests/import.py`) |
| `layout()` in Node | `layout.mjs` |
| The model's JSON Schema (`"$schema"`), `validate()` and `check()` | the maps and the models that set `"$schema"` (sales-classes, the ebike ones, bookshop-profile, bookshop-timing, bike-share), `playground.html` |
| The standalone page (`mountPage`) and the CLI's `render`, `check` and `stills` | every map on the site, built by CI |
| The `<umlimator-map>` element (`src`, a model in the page, `view`, `minimap`, `controls`, `theme`, `height`, its events) and the docs-site blocks (`umlimator/markdown-it`, `umlimator/remark`) | `element.html`; [the embedding guide's In a docs site](../docs/guide/embedding.md#in-a-docs-site) has each docs setup |
| Card shapes in one style (a shape by kind; a card's own `shape`) | `notations.html`, `shapes.json`; `bike-share-c4.json` (imported, its styles' shapes) |
| Every view in one PDF to hand in for a review: a cover with the contents, each view with its legend and tables, the rules (`umlimator.py pdf`) | every map on the site (its PDF link, built by CI); bike-share's is checked in CI |
| Rules on the map (`rules`: `from` and `to` by kind, id or box, and `not`; a rule that names a box holds where it is drawn) and `rules()` | bike-share (two rules, which hold; CI's check fails if one breaks), `playground.html` (break one: add a line from Rider app to Trips database) |
| What changed between two models (`diff()`): NEW, CHANGED and REMOVED marks, and the summary in words | `timelapse.html` (Mark what changed); the CLI's `diff` and the diff Action (`action.yml`) |
| The time-lapse: `update()` easing into the next model | `timelapse.html`; the CLI's `timelapse` writes one from a model's git history |
| The map against the traffic seen (`drift()`), and the line style `faded` | `drift.html`; the CLI's `drift` |
| A diagram you have already, as a model (`umlimator.py import`): Structurizr DSL, C4-PlantUML, Mermaid, compose or Kubernetes JSON | bike-share-c4, imported from [`bike-share.dsl`](bike-share.dsl) (CI imports it again and fails if the model differs); [`tests/import/`](../tests/import/): a sample of each other format, which CI imports, renders and checks (`tests/import.py`, with the bike share's source too) |
| Structurizr groups as boxes, nested as the source nests them | bike-share-c4 `context` and `containers` (Field crews) |
| An AI assistant reading a map and driving its page (an MCP server: `umlimator.py mcp`) | any model: `python3 umlimator.py mcp examples/bike-share.json`, as `tests/cli.py` runs it |

Not shown: `repair: false`, a switch for debugging the router; and, since the bike share model replaced the smaller maps, chips (`verbs`, `subAndChips`), skill-map kinds and kinds read from labels (`kindsFromLabels`), a process in steps (`render: "process"`, `stepIds`) and the view list's order (`browserOrder`). [The model guide](../docs/guide/model.md) describes each.

## Diagram types to come

Umlimator is growing from maps to 28 diagram types: UML's 14 and its information flow diagram, SysML's four, ER, flowchart, data flow, C4, BPMN,
mindmap, and AWS, GCP and Azure architecture. One target model per type is in
[`docs/diagrams/examples/`](../docs/diagrams/examples/). Each moves here, into the gallery and CI, when its stage
ships: the class diagram's is `sales-classes.json`, the object diagram's `order-objects.json`, the package
diagram's `bookshop-packages.json`, the sequence and communication diagrams' `checkout-sequence.json` and
`checkout-communication.json`, and the use case, activity, state machine and interaction overview diagrams'
`shopping-use-cases.json`, `fulfil-activity.json`, `order-states.json` and `buy-book-overview.json`; SysML's four are the
`ebike-*.json` files. [`docs/diagrams/README.md`](../docs/diagrams/README.md) says where
that work stands.
