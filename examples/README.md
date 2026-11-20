# Examples

Every example below is live at **[zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)**, built from `main`.
The systems are made up, except the Umlimator Atlas: umlimator's own model.

## Type pages

Each diagram type, and the map, has one page drawing one comprehensive example of that type: [`types/<type>.json`](types/), hand-authored and committed, which CI renders to `types/<type>.html`. Its root and first view is the main view, one picture showing every element kind, line kind, marker, compartment, stereotype and option of the type that can coexist; a setting that cannot (a layout direction, a notation) is an alternative, a view of the same model under the main view. [`../tools/types.json`](../tools/types.json) says, per type, the page's title and intro, the main view, the alternatives with what differs, and what the main view shows, a checklist the docs page lists. Run `node tools/types.mjs uml-class` to validate, check and render one type (`--no-html` to skip rendering), or `node tools/types.mjs` for every type; `tests/types.test.mjs` checks the same.

## Maps

Each map is a JSON model. CI turns it into a self-contained page (`python3 umlimator.py render`) and checks its layout.

| Model | Use case | What it shows |
|---|---|---|
| [`shapes.json`](shapes.json) | Card shapes, the one style maps draw | A card of each kind that has a shape: people, a browser app, a phone, a window (its own `shape`), a terminal, an agent, a database, a queue, a file, a module, hosts, a hook and an external system |
| [`monorepo.json`](monorepo.json) | A map generated from a monorepo's dependency list | What [`monorepo.py`](monorepo.py) writes from a list of imports: a card per package, a line per import, its weight by the count of imports (shown as its width on hover, selection and keyboard focus), a box per folder, nested as the folders are, and the same cards with no boxes |
| [`umlimator-atlas.json`](umlimator-atlas.json) | The Umlimator Atlas: umlimator's own model, the gallery's first Atlas entry | A map of umlimator's parts and who uses each, its C4 context and containers, the module's layers (package), the typed families (component), the diff Action on a pull request (sequence) and umlimator's state machines, joined by cards that open them; two stories |
| [`bookshop-atlas.json`](bookshop-atlas.json) | The Bookshop Atlas: an online bookshop as one model, the gallery's second Atlas entry | A map of the bookshop's systems opening into its C4 context, containers, components, dynamic and deployment views, the shoppers' use cases, buying a book (interaction overview and four sequences), components, the sales domain (class), an order's life (state machine) and a snapshot of one order (object), packages and the conventions profile, the order service's insides, the information flows, the database (ER), data flow at two levels, fulfilment and payment (activity) with one charge's timing, checkout as sequence and communication, order to shipment and pick and pack (BPMN), returns (flowchart), production (deployment), the opening plan (mindmap) and the bookshop on Google Cloud, Azure and AWS: one bookshop, the same names in every view |

[![The Umlimator Atlas: what umlimator is made of](https://zintaen.github.io/umlimator/examples/stills/umlimator-atlas/overview.png)](https://zintaen.github.io/umlimator/examples/umlimator-atlas.html)

The Atlas's story of a pull request, as `umlimator.py record` writes it (CI records each story for the site): open it in the page with
[`#story=pull-request&step=1`](https://zintaen.github.io/umlimator/examples/umlimator-atlas.html#story=pull-request&step=1), or from its Stories menu.

![The Umlimator Atlas: a pull request, from push to comment](https://zintaen.github.io/umlimator/examples/stills/umlimator-atlas/story-pull-request.png)

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
| [`bookshop-aws.json`](bookshop-aws.json) | AWS (`aws`, 0.26.0) | The bookshop on AWS: a cloud, a region, a VPC, two availability zones, public and private subnets and a security group as nested boxes (a region and an availability zone dashed), twelve services and three resources. AWS's icons on the site, glyphs in a copy until you fetch them, as for Google Cloud (`umlimator.py pack fetch aws`, after AWS's terms). Its ids start with `aws-`, so it can share a model with a map or the other clouds. What it covers: [`docs/conformance/aws.md`](../docs/conformance/aws.md) |
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

The tests and the benchmark read their own models: the fixtures in [`../tests/fixtures/`](../tests/fixtures/) and next to each test, and the benchmark's in [`../bench/models/`](../bench/models/). A new test never reads the showcase. The older tests listed as `LEGACY` in [`../tests/showcase.test.mjs`](../tests/showcase.test.mjs) still read models in `examples/` until each moves to a fixture of its own; that list only shrinks, and the test fails when a file not on it starts reading `examples/`. [`umlimator-atlas.json`](umlimator-atlas.json), umlimator drawn by itself, is the gallery's Atlas and stays out of the bench and every layout, hash and count pin. The gallery and docs tests read it to check that its links, its export names and the docs' quotes of it hold, and that its Readers card says where each import format is read, the showcase test validates it and lays out each view, as it does every model in `examples/`, and [`edit.html`](edit.html), which the editing tests open, draws it. It has no honest trace, latency or cost data, no hardware for SysML and no business process for BPMN, and its content changes with the code, so a pinned picture of it would describe last month's umlimator. CI renders it, checks its layout and validates it, with nothing about its content pinned.

## Host pages

The module embedded in a page, as an app would use it. Serve the repository over HTTP to open them locally
(`python3 -m http.server`, then `http://localhost:8000/examples/`).

| Page | What the host does |
|---|---|
| [`playground.html`](playground.html) | Edit a model as JSON and the map follows, with `validate()`'s problems, and the broken rules (`rules()`) and `check()`'s layout issues for the view shown, each selecting what it is about; Share puts the model in the link |
| [`embed.html`](embed.html) | `render()` with the standalone page's pieces, each a checkbox (`nav`, `details`, `legend`, `hints`), a view loaded when a card or its details open it (`open`, `update()`, `setView()`) or unfold it in place (`expand`, `map.expand()`), SVG and PNG export, light, dark and a host's own palette, the minimap |
| [`live.html`](live.html) | `overlay()` once a second on the Umlimator Atlas's overview, the model unchanged: flow as fast as each line's made-up calls, lines that drop calls pulse rose, slow ones glow amber with their delay, and each card's tab shows its latency |
| [`ask.html`](ask.html) | Questions about the Umlimator Atlas's overview answered on the map: words, the cards and lines they are about lit (`highlight()` with `paths()` and `reach()`), a flow played as a `tour()`, and the view in sentences (`describe()`), the text an AI model would get |
| [`replay.html`](replay.html) | A trace replayed (`replay()`): a made-up OpenTelemetry export of the diff Action on a pull request ([`traces/pull-request.json`](traces/pull-request.json)) read by `otlpSpans()` on the Umlimator Atlas's overview, each call along its line at its time, its duration kept as a label, with pause and stop |
| [`edit.html`](edit.html) | `editable`: the map emits `change` events, the host applies them and calls `update()`, with undo from `history()` |
| [`class-editor.html`](class-editor.html) | `editable` on a class diagram: each gesture emits one `edit` event, a transaction of commands, which the host applies with `apply()`, keeps in `history()` for undo and redo, and draws with `update()`; it may refuse one, and it saves the model as it is |
| [`timelapse.html`](timelapse.html) | Four made-up releases of umlimator (the Umlimator Atlas's overview) on a slider: `update()` eases from one to the next (new cards fade in, removed ones fade out, moved ones glide), `diff()` says what changed and marks it on request |
| [`drift.html`](drift.html) | `drift()`: the Umlimator Atlas's overview against a week of made-up traffic, as a tracing backend lists it; the lines that ran undrawn come in, the drawn ones that carried nothing fade |
| [`notations.html`](notations.html) | `shapes.json` in the one card-shape style, light and dark, each a `<umlimator-map>` |
| [`element.html`](element.html) | `<umlimator-map>`: a map from HTML alone, from `src` with a still until it is drawn, and from a model written in the page; controls that set its attributes, and its events as they come; the fenced block a docs site turns into it |
| [`layout.mjs`](layout.mjs) | `layout()` in Node, with no DOM: lays out every view and fails when a line runs more than 3 times its direct route, a check a host can run in CI |

[`icons.js`](icons.js) shows how a host gives `render()` the line icons in `icons/`.

## Where each feature is shown

| Feature | Where |
|---|---|
| Views a card opens (`opensView`) | umlimator-atlas: from the overview to the C4 context (umlimator.py), the module's layers, the typed families, the diff Action and the state machines, from the machines to each machine's states, and from the C4 context to the containers |
| A view the host loads when it's opened (`opensView` with `opensCount`) | umlimator-atlas: umlimator/all and Diff Action, in `embed.html` |
| A stacked card unfolded in place (E, Alt + click, `map.expand()`) | umlimator-atlas: The module and umlimator/all in `overview`; numbered, with its run order: Navigation in `machines` |
| Boxes (`containers`) and their tabs (`badges`) | umlimator-atlas `machines` and `story`; [`types/map.json`](types/map.json) `shop` (Platform and Data) |
| A box's tone, a tinted region (`tone`) | [`types/map.json`](types/map.json) `shop` (Data, Support) |
| Nested boxes (`parent`) | [`types/map.json`](types/map.json) `shop` (Data in Platform), monorepo `boxed` |
| A line to or from a box | umlimator-atlas `machines` (The page to render()'s handle) and `story` (A story shown to Ended) |
| Line kinds (`kind`: calls, feeds, triggers, state, guard) | [`types/map.json`](types/map.json) `shop` |
| Line weights (`weight`), shown as widths on hover, selection and keyboard focus | umlimator-atlas `overview`, [`types/map.json`](types/map.json) `shop` (POST /orders 3, order 2), `live.html` |
| A line's second label (`sublabel`) | umlimator-atlas `overview` (in Node, headless, MCP), [`types/map.json`](types/map.json) `shop` (POST /orders) |
| The sides a line uses (`fromSide`, `toSide`) | umlimator-atlas `navigation` (a later request, back over the top) |
| Tabs on cards (`badges`, with `tone`) | [`types/map.json`](types/map.json) `shop` (public, on call, backed up), `live.html` |
| Line icons (`icon`) | every model |
| A card with its name only (`noSub`) | [`types/map.json`](types/map.json) `shop` (Admin CLI) |
| Edited marks (`edited`) | [`types/map.json`](types/map.json) `shop` (Shop API) |
| Chips (`verbs`), planned and removed cards (`change`), brand logos (`icon`) | [`types/map.json`](types/map.json) `shop` (Shop API's checkout and refund; Gift cards; React, FastAPI and PostgreSQL) |
| A card's setting in one view only (`nodeOverrides`) | bookshop-atlas `components` (the shop-api image opens `domain`) and `checkout-sequence` (api opens `checkout-communication`) |
| Cards with no lines in a row of their own | monorepo `plain` (tools/release, tools/codemods) |
| Positions set by hand (`layout`) | umlimator-atlas `overview`, `machines`, `story` and `tour` |
| Space between columns and rows (`gap`, `rgap`) | umlimator-atlas `machines`, `story` and `tour` |
| Steps in run order (`render: "sequence"`) and a tour | umlimator-atlas `navigation`, `keys` and `mcp`; a tour in `tour` |
| Steps on the lines of any view (`step`) | [`types/map.json`](types/map.json) `shop`, and `shop-run` in run order |
| `render()`, its events, `update()`, `setView()`, `focus()`, `toSVG()`, `toPNG()`, themes | `embed.html` |
| Deeper tints (`--um-tint`) | `embed.html`, its host's palette |
| The standalone page's pieces in `render()`: views list, details panel, legend, hint line (`nav`, `details`, `legend`, `hints`) | `embed.html` |
| Marks over the map (`overlay()`): flow speed, glows, pulses, labels, tabs | `live.html`, `replay.html` |
| Paths and reach lit (`paths()`, `reach()`, `highlight()`) | `ask.html`; every map on the site (the details panel's → and ←, or Shift-click a second card and ⇄) |
| A view in sentences (`describe()`), a tour along any path (`tour()`) | `ask.html` |
| A trace replayed (`replay()`, `otlpSpans()`) | `replay.html` |
| A trace kept as a numbered view (`sequenceFromTrace()`, `umlimator.py trace`): each call a step, its duration under its label | `python3 umlimator.py trace examples/umlimator-atlas.json examples/traces/pull-request.json --view diff-trace --match examples/traces/pull-request-match.json --out atlas.json` |
| Lenses (`lenses`, `owner`, `map.lens()`), the page's Lenses menu and `#lens=<id>` | [`types/map.json`](types/map.json): Who owns what (cards ringed by owner, with a legend) and Where the money goes |
| A story told step by step (`stories`, `play()`), its Stories menu and recording in the page, `umlimator.py record` | umlimator-atlas (`assistant` and `pull-request`), on the site; pictured under Maps |
| Editing and undo (`editable`, `change`, `history()`) | `edit.html` |
| A diagram type: a typed model in its own notation (`schemaVersion: 2`, a view's `diagram`), from `umlimator/all` | sales-classes (`uml.class`), order-objects (`uml.object`), bookshop-packages (`uml.package`), checkout-sequence (`uml.sequence`), checkout-communication (`uml.communication`), shopping-use-cases (`uml.use-case`), fulfil-activity (`uml.activity`), order-states (`uml.state-machine`), buy-book-overview (`uml.interaction-overview`), bookshop-components (`uml.component`), bookshop-deployment (`uml.deployment`), order-service-structure (`uml.composite-structure`) |
| A class diagram's parts: compartments, members as UML text, stereotypes, line ends, end labels, notes (`present.collapsed`, `direction: "down"`) | sales-classes `domain` and `payments-only` |
| Ownership drawn as nesting: a package owning something the view shows is a box holding it, names qualified from the nearest shown owner or the view's `subject` (`parent`, `subject`, 0.19.0) | bookshop-packages, sales-classes `domain` (and `payments-only`, with its subject) |
| An object diagram's parts: underlined heads, anonymous instances, slots as `feature = value`, links with names and roles | order-objects |
| A package diagram's lines: «import», «access», «merge», dependency | bookshop-packages |
| Editing a typed view (`edit` events, `apply()`, `history()`; the palette, the relationship picker, the properties and members as text, the problems, the outline) | `class-editor.html` |
| A Mermaid `classDiagram`, imported (`umlimator.py import`) | [`tests/import/classes.mmd`](../tests/import/classes.mmd), which CI imports (`tests/import.py`) |
| A sequence diagram's parts: messages of every sort, derived activation bars, frames with guards, an interaction use; a communication diagram's stacks of numbered messages | checkout-sequence, checkout-communication |
| A Mermaid `sequenceDiagram`, imported (`umlimator.py import`); a trace as a sequence diagram (`umlimator.py trace --diagram uml.sequence`) | [`tests/import/sequence.mmd`](../tests/import/sequence.mmd), which CI imports (`tests/import.py`); [`traces/pull-request.json`](traces/pull-request.json) with `--diagram uml.sequence` |
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
| SysML frames and their headers; requirements with wrapped text and containment crosshairs; named compartments; proxy and full ports with flow arrows, `~` conjugation and item flows; constraint properties with parameters on their borders and binding connectors | ebike-requirements, ebike-blocks, ebike-structure, ebike-range |
| A Mermaid `requirementDiagram`, imported and written back (`umlimator.py import`) | [`tests/import/requirement.mmd`](../tests/import/requirement.mmd), which CI imports (`tests/import.py`) |
| `layout()` in Node | `layout.mjs` |
| The model's JSON Schema (`"$schema"`), `validate()` and `check()` | the maps and the models that set `"$schema"` (sales-classes, the ebike ones, bookshop-profile, bookshop-timing, umlimator-atlas), `playground.html` |
| The standalone page (`mountPage`) and the CLI's `render`, `check` and `stills` | every map on the site, built by CI |
| The `<umlimator-map>` element (`src`, a model in the page, `view`, `minimap`, `controls`, `theme`, `height`, its events) and the docs-site blocks (`umlimator/markdown-it`, `umlimator/remark`) | `element.html`; [the embedding guide's In a docs site](../docs/guide/embedding.md#in-a-docs-site) has each docs setup |
| Card shapes in one style (a shape by kind; a card's own `shape`) | `notations.html`, `shapes.json` |
| Every view in one PDF to hand in for a review: a cover with the contents, each view with its legend and tables, the rules (`umlimator.py pdf`) | every map on the site (its PDF link, built by CI) |
| What changed between two models (`diff()`): NEW, CHANGED and REMOVED marks, and the summary in words | `timelapse.html` (Mark what changed); the CLI's `diff` and the diff Action (`action.yml`) |
| The time-lapse: `update()` easing into the next model | `timelapse.html`; the CLI's `timelapse` writes one from a model's git history |
| The map against the traffic seen (`drift()`), and the line style `faded` | `drift.html`; the CLI's `drift` |
| A diagram you have already, as a model (`umlimator.py import`): Structurizr DSL, C4-PlantUML, Mermaid, compose or Kubernetes JSON | [`tests/import/`](../tests/import/) and, for Structurizr DSL, [`tests/fixtures/integration.dsl`](../tests/fixtures/integration.dsl): a sample of each format, which CI imports, renders and checks (`tests/import.py`) |
| An AI assistant reading a map and driving its page (an MCP server: `umlimator.py mcp`) | any model: `python3 umlimator.py mcp examples/umlimator-atlas.json` |

Not shown: `repair: false`, a switch for debugging the router; cards that show their sub-line and their chips (`subAndChips`), skill-map kinds and kinds read from labels (`kindsFromLabels`), a process in steps (`render: "process"`, `stepIds`) and the view list's order (`browserOrder`); swimlanes (`lanes`), cards only one view has (a view's `nodes`), two lines for A to B and B to A (`keepPairs`), a view's loop back (`loop: true`), budgets (`latency`, `cost`, `critical()`, `whatIf()`), rules on the map (`rules`, `rules()`) and Structurizr groups as boxes. [The model guide](../docs/guide/model.md) describes each.

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
