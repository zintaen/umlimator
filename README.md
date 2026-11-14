# umlimator

[![check](https://github.com/zintaen/umlimator/actions/workflows/check.yml/badge.svg)](https://github.com/zintaen/umlimator/actions/workflows/check.yml)

Layered architecture maps you can click through, from one JSON model: an ES module that any page embeds, and a CLI
that writes a self-contained HTML page and still pictures (SVG, PNG) for documents that cannot run one.

![The example model's overview: a made-up bookshop with logos, line icons and a numbered flow behind the API card](examples/stills/overview.png)

**Examples:** [live on GitHub Pages](https://zintaen.github.io/umlimator/), a [playground](https://zintaen.github.io/umlimator/examples/playground.html)
to try a model in, and [what each one shows](examples/README.md): a C4-style
drill-down, a data pipeline, an AI agent's skills, and host pages for embedding, live updates and editing.

## What it does

- **Layers**: a view per level (system, containers, components, flows). A stacked card opens its inner view, which the
  host may load only when asked.
- **Unfolding in place**: a stacked card can also open into a box on the map it is on (E, or Alt + click), its inner
  view's cards inside and the lines to it moved onto them, the rest of the picture in its order.
- **Layout and routing**: columns in reading order, each ordered so the lines cross as little as they can, those that
  skip columns included; each card level with the cards its lines come from, in its box or outside it, so lines run
  straight; orthogonal lines that never run through a card, room for every label, containers kept apart, and cards with
  no lines in a row of their own, under the view or at the bottom of their box. The same model gives the same picture.
- **Reading**: animated flow, neighbours lit on selection, numbered steps, tours, minimap, light and dark themes.
- **Card shapes**: one style, the union of what the C4 model's tools and UML 2.5 draw: people, robots, browser apps,
  phones, terminals, queues, packages, hosts, data stores, files and hooks, each by its card's kind, and a rounded box
  where no shape says more. A card's own `shape` wins. Each shape keeps to its card's box, so the layout is the same
  ([`examples/notations.html`](examples/notations.html)).
- **Exploring**: every path between two cards, or everything a card reaches, lit on the map; a view in plain sentences
  (`describe()`); a tour along any path the host names.
- **Live data**: marks over the map without touching the model (`overlay()`): flow as fast as the traffic, errors that
  pulse, slow hops that glow, labels and tabs; and an OpenTelemetry trace replayed along its lines (`replay()`), or kept
  as a numbered view to review in a pull request (`umlimator.py trace`).
- **Lenses**: saved ways to look at one map, by team or by data flow: what a lens picks lit and the rest dimmed, cards
  ringed by owner with a legend, from the page's Lenses menu or a link. The view is never laid out again.
- **Budgets**: lines' latency and cost; the slowest or costliest path lit with its total (`critical()`), and what loses
  its way if a card goes down (`whatIf()`).
- **Stories**: walk-throughs in the model, step by step (view, camera, selection, highlight, tour and a caption), played
  on the map (`play()`) or from the page's Stories menu, recorded from the page, and written as an animated PNG.
- **Keyboard and screen readers**: cards, then lines, in the Tab order (a card's tabs and chips too, for a host that
  listens for click); arrows between cards; selections announced.
- **The page's pieces, embedded**: the standalone page's views list, details panel, legend and hint line, each one a
  `render()` option, around the map in the host's own page.
- **Editing** (opt-in): gestures emit `change` events; the host applies them and calls `update()`.
- **UML class diagrams** (0.18.0, the first of 28 diagram types): a typed model drawn in UML's notation, classes with
  their attributes and operations, interfaces, enumerations, data types, notes, and associations with roles,
  multiplicities, composition, aggregation and navigable ends, generalization, realization and dependency; laid out by
  itself, pinned where you pin it. Edited on the canvas (members as one line of UML text, a palette, a relationship
  picker), each gesture an `edit` event the host applies with `apply()`; checked by the class diagram's rules; read from
  and written to Mermaid's `classDiagram` ([`examples/sales-classes.json`](examples/sales-classes.json),
  [what it covers](docs/conformance/uml-class.md)). From 0.19.0 a package owning classes the view shows is a box holding
  them, and names are qualified (`sales::Order`).
- **UML object and package diagrams** (0.19.0): instances with their slots (`order1042 : Order`, underlined;
  `status = placed`) and links with names and roles ([`examples/order-objects.json`](examples/order-objects.json),
  [what it covers](docs/conformance/uml-object.md)); packages as boxes holding what they own, at any depth, or as
  closed folders, with «import», «access», «merge» and dependencies between them
  ([`examples/bookshop-packages.json`](examples/bookshop-packages.json), [what it covers](docs/conformance/uml-package.md)).
  Ownership is edited by dropping an element into a box, or with the Owner field; both are checked by their types'
  rules, and the PDF's tables list slots and element kinds.
- **UML sequence and communication diagrams** (0.20.0): lifelines on a time axis with calls, async messages, replies,
  creates and deletes, activation bars derived from the messages, `alt`, `opt`, `loop`, `par` and `break` frames with
  their guards, and interaction uses ([`examples/checkout-sequence.json`](examples/checkout-sequence.json),
  [what it covers](docs/conformance/uml-sequence.md)); the same interaction as lifelines joined by connectors, each
  link's messages a stack of numbered rows (1, 1.1, 1.1.2) ([`examples/checkout-communication.json`](examples/checkout-communication.json),
  [what it covers](docs/conformance/uml-communication.md)). Messages are inserted, moved in time, wrapped in a frame and
  deleted on the canvas, by pointer and by key, each gesture an `edit` event; checked by the types' rules; a sequence
  diagram is read from and written to Mermaid's `sequenceDiagram`, and an OpenTelemetry trace becomes one
  (`umlimator.py trace --diagram uml.sequence`). A diff says "moves" for a reordered message, and `paths()` on a
  sequence view runs in time order (0.22.0).
- **UML use case, activity, state machine and interaction overview diagrams** (0.21.0): actors as stick figures, use
  cases as ellipses with their extension points, a subject as a box holding its use cases, include, extend and
  generalization ([`examples/shopping-use-cases.json`](examples/shopping-use-cases.json),
  [what it covers](docs/conformance/uml-use-case.md)); actions, object nodes, data stores, send and accept actions, call
  behaviour actions that open the activity they call, and the control nodes, in lanes (partitions, nested)
  ([`examples/fulfil-activity.json`](examples/fulfil-activity.json), [what it covers](docs/conformance/uml-activity.md));
  states with their entry, do and exit activities and internal transitions, composite states as boxes, orthogonal
  regions with dashed dividers, every pseudostate, and transitions written `trigger [guard] / effect`
  ([`examples/order-states.json`](examples/order-states.json), [what it covers](docs/conformance/uml-state-machine.md));
  interaction uses and inline interactions, drawn with their sequence diagram inside, joined by the activity's control
  nodes ([`examples/buy-book-overview.json`](examples/buy-book-overview.json),
  [what it covers](docs/conformance/uml-interaction-overview.md)). Lines end on the outline of a circle, a diamond, a
  bar or an ellipse. F2 edits a transition's or a flow's label through its parts; a drop changes a node's lane or a
  state's region. A state machine is read from and written to Mermaid's `stateDiagram`. The MCP server's read tools and
  the diff Action are tested on all four.
- **UML component, deployment and composite structure diagrams** (0.22.0): components nested in components and
  packages, ports on their borders, provided and required interfaces as a ball and socket or as a rectangle, assembly
  and delegation connectors (a delegation runs from a box's port inward to the port of what it holds), artifacts and
  their manifestations ([`examples/bookshop-components.json`](examples/bookshop-components.json),
  [what it covers](docs/conformance/uml-component.md)); nodes, devices and execution environments drawn as cubes and
  nested to any depth, artifacts deployed in them or by a «deploy» line, deployment specifications and communication
  paths ([`examples/bookshop-deployment.json`](examples/bookshop-deployment.json),
  [what it covers](docs/conformance/uml-deployment.md)); a class's parts and ports, each part showing its type's ports,
  connectors through parts, open collaborations as dashed ellipses and collaboration uses with their role bindings
  ([`examples/order-service-structure.json`](examples/order-service-structure.json),
  [what it covers](docs/conformance/uml-composite-structure.md)). A port's side is chosen from where its lines go, or
  pinned by a drag or Alt + arrows; `B` turns an interface into a ball and back; a port or a part is added as a row of
  its owner. The MCP server's read tools and the diff Action are tested on all three, and the Bookshop atlas opens them
  from the map's Hosts.
- **UML profile and timing diagrams** (0.23.0), the last two of UML's 14: a profile's stereotypes with their tag
  definitions, extending metaclasses (a filled triangle, `{required}`), specializing one another, and applied to a package
  by «apply» ([`examples/bookshop-profile.json`](examples/bookshop-profile.json),
  [what it covers](docs/conformance/uml-profile.md)). A stereotype applied anywhere in the model is checked against the
  profiles applied to the element's packages (unknown, ambiguous, abstract, not fitting its metaclass; its tags defined,
  of their type, present when required), whichever views the model has, and its tags are edited in the properties panel
  on every UML view. Lifelines on one linear time ruler, each a step line through its states or a band of values, with
  messages between them at their times and duration and time constraints in a strip under each lane
  ([`examples/bookshop-timing.json`](examples/bookshop-timing.json), [what it covers](docs/conformance/uml-timing.md)).
  Times move by a minor tick with a drag or Alt + arrows and are typed exactly with F2 (`Waiting @ 140`); `S` turns a
  lifeline into a value lifeline; deleting a lifeline deletes its changes and their constraints. The MCP server's read
  tools and the diff Action are tested on both, and the Bookshop atlas, now with a view of each of UML's 14 diagram
  kinds, opens them from the package view's profile and from the activity's "Record the payment on the order".
- **ER, flowchart, data flow, information flow and C4** (0.24.0): tables with their key columns first, related in crow's
  foot or IDEF1X, one geometry for both, each column a row `name type [PK] [FK table.column] [UK] [NULL]`
  ([`examples/bookshop-schema.json`](examples/bookshop-schema.json), [what it covers](docs/conformance/er.md)); ten
  flowchart symbols, laid out down, decisions with labelled exits
  ([`examples/returns-flowchart.json`](examples/returns-flowchart.json), [what it covers](docs/conformance/flowchart.md));
  data flow levels in Yourdon or Gane and Sarson, made by `D` and checked for balance
  ([`examples/bookshop-data-flow.json`](examples/bookshop-data-flow.json), [what it covers](docs/conformance/dfd.md));
  UML information flows, dashed «flow» lines saying what they convey
  ([`examples/order-information-flow.json`](examples/order-information-flow.json),
  [what it covers](docs/conformance/uml-information-flow.md)); and typed C4 in six views (landscape, context, container,
  component, dynamic, deployment) on the map's card shapes, each view checking what it may show, its subject a dashed
  boundary, relationships whose ends a view hides drawn as implied lines, `D` making the next level
  ([`examples/bookshop-c4.json`](examples/bookshop-c4.json), [what it covers](docs/conformance/c4.md)). `import` reads a
  Mermaid `erDiagram`, a Mermaid flowchart with `--typed`, a Structurizr JSON workspace and a `.dbml` file (with
  `@dbml/core` installed by you) into them. The Bookshop atlas starts at the C4 context, whose elements open the schema,
  the data flow, the information flow, the returns flowchart and the UML views.
- **SysML v1.7** (0.25.0): the requirement, block definition, internal block and parametric diagrams, each in a frame
  with SysML's header (`req [Package] Name [view]`). Requirements with their id and wrapped text, containment drawn with
  a crosshair, and the six relationships checked as SysML says
  ([`examples/ebike-requirements.json`](examples/ebike-requirements.json), [what it covers](docs/conformance/sysml-requirement.md));
  blocks, interface blocks, constraint blocks and value types with SysML's named compartments
  ([`examples/ebike-blocks.json`](examples/ebike-blocks.json), [what it covers](docs/conformance/sysml-block-definition.md));
  parts, proxy and full ports with their flow arrows, `~` conjugation and item flows on connectors
  ([`examples/ebike-structure.json`](examples/ebike-structure.json), [what it covers](docs/conformance/sysml-internal-block.md));
  constraint properties with their expressions, parameters on their borders, binding connectors
  ([`examples/ebike-range.json`](examples/ebike-range.json), [what it covers](docs/conformance/sysml-parametric.md)).
  Profiles reach SysML elements. `import` reads a Mermaid `requirementDiagram`, and the writer writes one back. The four
  e-bike files join into the e-bike atlas ([`examples/ebike-atlas.json`](examples/ebike-atlas.json)), from the
  requirements to the blocks, their wiring and the equation that checks the range.
- **Mindmaps, Google Cloud, Azure and AWS** (0.26.0): a mindmap laid out left and right of its root, branches as curves in
  the map's kind colours, edited by N, F2, Alt + arrows, drops and Delete, with `import` of a Mermaid mindmap
  ([`examples/bookshop-opening-plan.json`](examples/bookshop-opening-plan.json), [what it covers](docs/conformance/mindmap.md));
  Google Cloud, Azure and AWS architecture diagrams, groups (projects, regions, networks, subnets, zones; subscriptions,
  resource groups, virtual networks; accounts, VPCs, availability zones, security groups) as boxes titled with their
  kind, each service a card with its vendor icon and its full service name ([`examples/bookshop-gcp.json`](examples/bookshop-gcp.json),
  [`bookshop-azure.json`](examples/bookshop-azure.json), [`bookshop-aws.json`](examples/bookshop-aws.json);
  [Google Cloud](docs/conformance/gcp.md), [Azure](docs/conformance/azure.md), [AWS](docs/conformance/aws.md)). The icons come in packs you fetch
  yourself after reading the vendor's terms (below); without one a card draws a glyph and the name. In the Bookshop
  atlas the opening plan's Hosting topics open the three cloud views.
- **BPMN** (0.27.0): the elements of BPMN 2.0.2's Descriptive conformance sub-class (Table 2.1, every row) and six more:
  pools and nested lanes as bands across the diagram, tasks, sub-processes expanded or collapsed, call activities, events
  with their markers, gateways, data, annotations and groups; boundary events on their activity's border; sequence flows
  that stay in their pool and message flows between pools, the kind picked by the ends you join
  ([`examples/bookshop-order-to-shipment.json`](examples/bookshop-order-to-shipment.json), [what it covers](docs/conformance/bpmn.md)).
  `import` reads BPMN XML and `export` writes it, laid out, through a `bpmn-moddle` you install (never a dependency of
  umlimator). The Bookshop atlas opens the process from the use case "Track an order".
- **Export**: any view as a stand-alone SVG or PNG, in the browser or from the CLI; the whole map as one PDF to hand in
  for a review: a cover with the contents, each view with its legend and tables of its cards, lines and boxes, then the
  rules (`umlimator.py pdf`).
- **In docs**: `<umlimator-map src="model.json">` in any page, and an `umlimator` fenced block in VitePress, Docusaurus,
  MkDocs or any Markdown that allows HTML.
- **A layout check**: crossings, shared lines, detours, labels on lines, text that overflows its card.
- **Rules**: what the model says must hold ("apps never call a database directly", "no cycles between teams' boxes"),
  marked on the map where it breaks; `umlimator.py check` fails on a broken rule, so CI does.
- **Change**: what a pull request changes, marked on the map and said in words (with a GitHub Action that posts it);
  a time-lapse of a model's history, where cards glide, fade in and fade out; and drift, the map against the traffic seen.
- **Import**: a Structurizr workspace, a C4-PlantUML or Mermaid diagram, BPMN XML, or what `docker compose config` and
  `kubectl get` print as JSON, read into a model (`umlimator.py import`), with what it can't read listed line by line;
  and a model's BPMN written back as BPMN XML (`umlimator.py export`).
- **An AI assistant on the map**: an MCP server (`umlimator.py mcp`) through which an assistant such as Claude Code reads
  the model (a view in words, paths, what a card reaches, broken rules, problems, a diff) and drives its page in your
  browser (a view, a highlight, a tour, a story).

## Install

```bash
npm install umlimator
```

Or from GitHub, at a tag or any commit: `"umlimator": "github:zintaen/umlimator#v0.26.0"`. npm 12 refuses git
dependencies unless the project opts in, so that also needs `allow-git=root` in the `.npmrc` next to `package.json`.

## Embed

```js
import { render } from 'umlimator';   // one ES module, no dependencies, no build step
import 'umlimator/theme.css';         // the default --um-* palette and fonts (or set the variables yourself)

const map = render(document.getElementById('map'), model, {
  on: { select: e => showDetails(e.target), open: e => { e.preventDefault(); router.push(e.view); } },
});
map.update(nextModel);                        // redraws only what changed; keeps the view, camera and selection
const svg = map.toSVG({ scale: 2 });          // the current view as a stand-alone file
const png = await map.toPNG({ view: 'api' }); // any view, without showing it
map.destroy();
```

In React, mount once and pass new models to `update`:

```jsx
function MapView({ model, onSelect }) {
  const el = useRef(null), map = useRef(null), cb = useRef(onSelect);
  cb.current = onSelect;
  useEffect(() => { map.current = render(el.current, model, { on: { select: e => cb.current?.(e.target) } }); return () => map.current.destroy(); }, []);
  useEffect(() => { map.current?.update(model); }, [model]);
  return <div ref={el} style={{ height: 600 }} />;
}
```

- `render` draws one view at a time into a shadow root (give the element a height), with pan, zoom and drill-down.
  Events (`click`, `select`, `open`, `viewchange`, `change`, `expand`) name what they are about by ids from the model.
- `map.expand(id)` unfolds a stacked card in place and `map.collapse(id)` folds it; `layout(model, view, { expand })`
  draws the same in Node.
- Colours are `--um-*` CSS variables, fonts are the host's (`--um-sans`, `--um-mono`), text is measured in that font,
  and nothing is fetched. `--um-tint` sets how deep the cards' and the boxes' tints are: 1 by default, 0 for none, 2 for
  twice as deep (a tint stops at 18% of its colour, so text on it keeps 4.5:1).
- `layout(model, viewId)` returns a view's geometry without a DOM, in Node too; `check(model, viewId)` runs the layout
  check on it, and `validate(model)` finds dangling or repeated ids before anything is drawn. `rules(model)` lists every
  rule the model breaks, view by view.
- `map.overlay(name, layer)`, `highlight(refs)`, `tour(path)` and `replay(spans)` put the host's marks, a tour and a
  trace on the map; `paths()`, `reach()` and `describe()` walk a view and put it in words, in Node too.
- `map.lens(id)` puts one of the model's lenses on the map. `critical(model, view, { from, to, by })` finds the slowest
  or costliest path, `whatIf(model, view, { remove })` what loses its way when cards go down, and
  `sequenceFromTrace(model, spans, { view, match })` keeps a trace as a numbered view; all three in Node too.
- `editable: true` turns on editing gestures ([docs/editing.md](docs/editing.md); `examples/edit.html` is a working host).
- `import { render, apply, history } from 'umlimator/all'` draws diagram types too: a class, object, package, sequence, communication, use case, activity, state machine, interaction overview, component, deployment, composite structure, profile, timing, information flow, entity-relationship, flowchart, data flow, C4 or BPMN diagram, a mindmap, a Google Cloud, Azure or AWS architecture diagram, or one of SysML's requirement, block definition, internal block and parametric diagrams, whose gestures emit
  `edit` transactions that `apply(model, e.commands)` turns into the next model (`examples/class-editor.html` is a
  working host). `umlimator` alone draws maps, and a typed view as plain cards with a warning.
- `diff(before, after)` returns `after` with each card and line marked added, changed or removed, what changed in words,
  and the views that show it (on a typed diagram, a reordered member or message reads "moves");
  `drift(model, observed)` marks the lines traffic ran on that nobody drew, and the drawn ones that carried nothing. Both
  are models to draw, in Node too. `update()` eases into the next model (`examples/timelapse.html`); the option
  `ease: false` draws it at once.
- `mountPage` is the whole standalone viewer that the CLI writes. `render()` can draw its pieces too, each on its own or
  any mix, inside the map's element; the host keeps its own header:

  ```js
  render(el, model, { nav: true, details: true, legend: true, hints: true });
  ```

  - `nav`: the views list left of the map, opened and shut by its ☰ button or O. Picking a view emits `viewchange`.
  - `details`: the selected card's panel under the map, with its tabs (`[` and `]`). Its Open and Unfold here buttons
    emit `open` and `expand`, as the canvas does, so a host can load a view first.
  - `legend` and `hints`: the legend, and the line saying what the pointer does, over the map.

  They share the page's code and look, take the `--um-*` colours (the theme adds `--um-mark` and `--um-scrim` for them),
  and follow `update()` and `destroy()`. `examples/embed.html` uses them.

The API, its types and the decisions behind it: [docs/module-api.md](docs/module-api.md) and `lib/umlimator.d.ts`.

### In a page or a docs site, as an element

`<umlimator-map>` (`umlimator/element`) loads a model and draws it, with no script of your own. Its children show until
the map is drawn, and stay where scripts don't run ([`examples/element.html`](examples/element.html)):

```html
<link rel="stylesheet" href="node_modules/umlimator/lib/umlimator-theme.css">
<script type="module" src="node_modules/umlimator/lib/umlimator-element.js"></script>

<umlimator-map src="bookshop.json" view="api" minimap height="520">
  <img src="stills/api.png" alt="An order, step by step">
</umlimator-map>
```

- **The model**: `src`, a URL resolved as an `<img>`'s is (a `data:` URL too), or the model in a child
  `<script type="application/json">`.
- **Attributes**: `view`, `minimap`, `controls="false"`, `wheel="ctrl"` (the wheel zooms only with Ctrl or ⌘, and scrolls
  the page otherwise, as a map in a document should), `height` (a number is pixels; 480 by default, or size it in CSS)
  and `theme` (`light` or `dark`: theme.css's palette for that map, whatever the page's). Changing one draws the map
  again, and removing the element destroys it.
- **Events**: `umlimator:select`, `umlimator:open` (cancel it to stay) and `umlimator:viewchange`, the map's event as
  `detail`; `load` once it is drawn, `error` when it can't be. `el.map` is the `render()` handle.
- **Colours**: theme.css, as above, or your own `--um-*` variables. The element fetches nothing but its model.
- **Dark mode**: without `theme`, the map follows the page, a docs site's dark mode included: VitePress's
  `<html class="dark">` and Docusaurus's `<html data-theme="dark">`.

In a docs site, a fenced block becomes the element. It names the model's `src`, with `view` or any other attribute, or
holds the model in JSON:

````markdown
```umlimator
src: /maps/bookshop.json
view: api
```
````

- **VitePress**: in `.vitepress/config`, `markdown: { config: md => md.use(umlimator) }` (`import umlimator from
  'umlimator/markdown-it'`) and `vue: { template: { compilerOptions: { isCustomElement: t => t === 'umlimator-map' } } }`;
  in `.vitepress/theme/index`, `import 'umlimator/element'` and `import 'umlimator/theme.css'`.
- **Docusaurus**: `remarkPlugins: [umlimator]` (`import umlimator from 'umlimator/remark'`) in the docs preset's options,
  and a client module (`clientModules: ['./src/umlimator.js']`) that imports `umlimator/element` and
  `umlimator/theme.css`.
- **MkDocs, or any site that allows HTML**: write the element itself in the Markdown. Copy `lib/umlimator.js`,
  `lib/umlimator-element.js` and `lib/umlimator-theme.css` into `docs/js/`, and load them in `mkdocs.yml`:
  `extra_javascript: [{ path: js/umlimator-element.js, type: module }]` and `extra_css: [js/umlimator-theme.css]`.

## Model

A model has shared `nodes` and `edges`, and `views` that each show a subset, with optional `containers` (boxes),
`layout` (`[col, row]` per card), `render: "sequence"` for numbered run-order views and `tour` for a dot that rides a
path. The full schema is `engine/references/schema.md` (§ Map model); `examples/bookshop.json` uses most of it.
A model file that starts with `"$schema": "<path to>/umlimator.schema.json"` (exported as `umlimator/schema.json`)
gets completion and checks in editors, and `validate(model)` lists its errors and warnings, each with where it is.
`"schemaVersion": 2` marks a model that may hold typed elements and typed views (`docs/diagrams/model.md`). A view whose
`diagram` is `"uml.class"`, `"uml.object"`, `"uml.package"`, `"uml.sequence"`, `"uml.communication"`, `"uml.use-case"`,
`"uml.activity"`, `"uml.state-machine"`, `"uml.interaction-overview"`, `"uml.component"`, `"uml.deployment"`,
`"uml.composite-structure"`, `"uml.profile"`, `"uml.timing"` or `"uml.information-flow"` is a UML class, object, package,
sequence, communication, use case, activity, state machine, interaction overview, component, deployment, composite
structure, profile, timing or information flow diagram; `"er"`, `"flowchart"` and `"dfd"` an entity-relationship
diagram, a flowchart and a data flow diagram; `"c4.landscape"`, `"c4.context"`, `"c4.container"`, `"c4.component"`,
`"c4.dynamic"` and `"c4.deployment"` C4's six views; `"sysml.requirement"`, `"sysml.block-definition"`,
`"sysml.internal-block"` and `"sysml.parametric"` SysML v1.7's four diagrams (0.25.0); `"mindmap"` a mindmap and
`"gcp"` and `"azure"` Google Cloud and Azure architecture diagrams (0.26.0); `"bpmn"` a BPMN diagram (0.27.0); each drawn by `umlimator/all` and the
CLI; a type not drawn yet shows its
nodes as plain cards, with a warning. A model with no `schemaVersion` is a map, as always, and a version newer than the
module reads is an error.

Card kinds: `frontend`, `backend`, `ai`, `database`, `queue`, `security`, `cloud`, `external` and `file` (skill-map
kinds such as `public`, `lane`, `script`, `hook` and `board` work too). Fields beyond the schema:

| On | Field | What it does |
|---|---|---|
| node | `badges` (`badge`) | tabs on the card, each a string or `{ text, tone }` |
| node | `icon` | a logo or line icon from `icons/manifest.json` |
| node | `noSub` | the name only; the description stays in the details panel |
| node | `opensView`, `opensCount` | the view the card opens, which may not be loaded yet, and the ⤢ number for it |
| node | `owner` | who owns the card (a team): rules and lenses pick by it, and a lens can ring cards by owner |
| node | `shape` | the card's own shape, over the one its kind draws: `box`, `person`, `browser`, `mobile`, `cylinder`, `pipe`, `document`, `hexagon`, `robot`, `terminal`, `window`, `folder` or `node` |
| node, edge | `edited` | a marker on the card or line |
| edge | `kind` | what the line means, drawn as its colour: `calls` (default), `feeds`, `triggers`, `state`, `guard` |
| edge | `weight` | 1, 2 or 3: how much the line stands for, drawn as its width |
| edge | `step` | a number (2, or 2.1) or text of up to 3 characters (2a), in a circle on the line in any view (a pill for 2 or 3 characters): the order things happen, shown as written in the line's name and title. A numbered view numbers its lines in run order instead |
| edge | `sublabel` | a second, smaller line under the label |
| edge | `fromSide`, `toSide` | the card sides the line uses |
| edge | `from`, `to` | may name a container of the view: the line ends on its box |
| edge | `style: "faded"` | the line in its kind's colour, faint and with no flow (drift's idle lines) |
| edge | `drift` | what `drift()` found: `undrawn` or `idle` |
| edge | `latency`, `cost` | budgets, in ms and in any unit: `critical()` sums them along a path (not drawn) |
| view | `gap`, `rgap` | the space between columns and between rows |
| view | `keepPairs` | A→B and B→A drawn as two lines |
| view | `repair: false` | no port repair |
| view | `subAndChips` | cards 80 px tall that show their sub-line, then their chips |
| view | `kindsFromLabels` | a line whose edges name no `kind` takes one guessed from its label |
| container | `badges` | tabs on the box's border |
| container | `tone` | a palette name, as a badge's: the region behind the box tinted in it, its border dashed and its title in the tone |
| model | `rules` | what must hold: no line `from` some cards `to` others (picked by id, kind, box or owner), or `noCycles` between boxes |
| model | `stories` | walk-throughs: steps that each set the view, camera, selection, highlight, tour and caption |
| model | `lenses` | ways to look at the map: what `pick` picks (by id, kind, box, owner or `line` kind) lit, the rest dimmed; `color: "owner"` rings cards by owner |

In a version-2 model, a class diagram (`examples/sales-classes.json`; every field in
[`docs/conformance/uml-class.md`](docs/conformance/uml-class.md)), an object diagram (`examples/order-objects.json`,
[`uml-object.md`](docs/conformance/uml-object.md)) and a package diagram (`examples/bookshop-packages.json`,
[`uml-package.md`](docs/conformance/uml-package.md)):

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | what it is: `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType`, `uml.Package`, `uml.Comment`; members `uml.Property`, `uml.Operation`, `uml.EnumerationLiteral`; lines `uml.Association`, `uml.Generalization`, `uml.InterfaceRealization`, `uml.Dependency`, `uml.CommentLink` |
| node | `members` | its attributes, operations or literals, in order, each `{ id, type, label, props }` |
| node, member, edge | `type`, from 0.19.0 | an object diagram's `uml.InstanceSpecification`, its members `uml.Slot`, lines `uml.Link`; a package diagram's `uml.Package` and the classifiers above, lines `uml.PackageImport`, `uml.PackageMerge`, `uml.Dependency` |
| node | `parent` | the package that owns it: from 0.19.0 drawn as a box holding it when the view shows both |
| node, member, edge | `props`, from 0.19.0 | an instance's `classifier` (a name, as text); a slot's `value`; a link's `association` and its ends' `role`; a package import's `visibility`, `public` («import») or `private` («access») |
| node, member, edge | `props` | the type's own fields: `isAbstract`, `stereotypes`; a member's `visibility`, `valueType`, `multiplicity`, `default`, `isStatic`, `isDerived`, `parameters`, `returnType`; an association's `ends.from` and `ends.to` (`role`, `multiplicity`, `aggregation`, `navigable`) |
| view | `diagram` | `"uml.class"`, `"uml.object"` or `"uml.package"`: the view is a class, object or package diagram |
| view | `subject` | the package the view shows the inside of: names are qualified from it |
| view | `direction` | `"down"` lays it out top to bottom, the general class above (default `"right"`) |
| view | `present` | per element: `collapsed` compartments, and at most `rows` rows each, then "+k more" |

A sequence diagram (`examples/checkout-sequence.json`, [`docs/conformance/uml-sequence.md`](docs/conformance/uml-sequence.md))
and a communication diagram (`examples/checkout-communication.json`,
[`docs/conformance/uml-communication.md`](docs/conformance/uml-communication.md)), from 0.20.0:

| On | Field | What it does |
|---|---|---|
| node | `type` | `uml.Lifeline`; its `props.represents` is what it is an instance of, drawn `name : Type` |
| edge | `type` | `uml.Message`; on a communication view also `uml.Connector`, the link messages are sent along |
| edge | `props` | a message's `sort` (`call`, `async`, `reply`, `create`, `delete`) and a reply's `replyTo`, the call it answers |
| view | `diagram` | `"uml.sequence"` or `"uml.communication"` |
| view | `edges` | a sequence view's messages and interaction uses (`uml.InteractionUse`, `props.covers`), inline and in time order; a communication view's connectors, then its messages, by id, in order. Bars and numbers are derived |
| view | `fragments` | a sequence view's combined fragments (`uml.CombinedFragment`, `props.operator`), each with its operands as `members` (`label` the guard); a message's or fragment's `parent` is its operand |

A use case diagram, an activity diagram, a state machine diagram and an interaction overview diagram
(`examples/shopping-use-cases.json`, `fulfil-activity.json`, `order-states.json` and `buy-book-overview.json`; each
type's note in [`docs/conformance/`](docs/conformance/)), from 0.21.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | use case: `uml.Actor`, `uml.UseCase` (members `uml.ExtensionPoint`), `uml.Subject`; lines `uml.Association`, `uml.Include`, `uml.Extend`, `uml.Generalization` |
| node, edge | `type` | activity: `uml.Action`, `uml.CallBehaviorAction`, `uml.SendSignalAction`, `uml.AcceptEventAction`, `uml.ObjectNode`, `uml.DataStoreNode`, `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.ActivityPartition`; lines `uml.ControlFlow`, `uml.ObjectFlow` |
| node, member, edge | `type` | state machine: `uml.State` (members `uml.Region`, `uml.InternalTransition`), `uml.Pseudostate`, `uml.FinalState`; lines `uml.Transition` |
| node, edge | `type` | interaction overview: the activity's control nodes, `uml.InteractionUse`, `uml.Interaction` (an inline interaction); lines `uml.ControlFlow` |
| node | `parent` | a use case's subject; an activity node's partition (its lane), a partition's enclosing partition; a substate's state or region |
| node | `opensView` | the activity a call behaviour action calls; the sequence view an interaction use or inline interaction shows |
| node | `props` | a state's `entry`, `do`, `exit`; a pseudostate's `kind` (`initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate`) |
| edge, member | `props` | an extend's `extensionPoints` (ids) and `condition`; a flow's `guard` (its `label` is its name); a transition's or internal transition's `trigger`, `guard` and `effect`, drawn `trigger [guard] / effect` |
| view | `diagram` | `"uml.use-case"`, `"uml.activity"`, `"uml.state-machine"` or `"uml.interaction-overview"` |

A component diagram, a deployment diagram and a composite structure diagram (`examples/bookshop-components.json`,
`bookshop-deployment.json` and `order-service-structure.json`; each type's note in
[`docs/conformance/`](docs/conformance/)), from 0.22.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | component: `uml.Component` (members `uml.Port`), `uml.Interface`, `uml.Artifact`, `uml.Package`; lines `uml.InterfaceRealization`, `uml.Usage`, `uml.ComponentRealization`, `uml.Connector`, `uml.Dependency`, `uml.Manifestation` |
| node, edge | `type` | deployment: `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component`; lines `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency` |
| node, member, edge | `type` | composite structure: the subject (`uml.Class`, `uml.Component` or `uml.Collaboration`) with its parts (`uml.Property`) and ports (`uml.Port`), `uml.Collaboration` (its roles `uml.Property`), `uml.CollaborationUse`; lines `uml.Connector`, `uml.RoleBinding` (its `label` the role) |
| node | `parent` | a component's component or package; an artifact's target (deployed by nesting); a target's target (any depth); a collaboration use's subject |
| node, member | `props` | a port's `valueType`; a part's `valueType` (the class or component whose ports it shows, by label), `multiplicity` and `aggregation` (`shared` is dashed); a collaboration use's `collaboration` |
| edge | `props` | a connector's `kind` (`assembly`, `delegation`); an end through a part, `ends.from.part` or `ends.to.part` (UML's `partWithPort`) |
| view | `subject` | a composite structure view's class, component or collaboration, listed in `nodeIds` |
| view | `present` | an interface drawn as a ball (`{ "as": "ball" }`); a port's side (`{ "side": "left" }`); on a part, `{ "ports": { "<port>": { "side": "top" } } }` |
| view | `diagram` | `"uml.component"`, `"uml.deployment"` or `"uml.composite-structure"` |

A profile diagram and a timing diagram (`examples/bookshop-profile.json` and `bookshop-timing.json`; each type's note in
[`docs/conformance/`](docs/conformance/)), from 0.23.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | profile: `uml.Profile`, `uml.Stereotype` (members `uml.Property`, its tag definitions), `uml.MetaclassReference` (its `label` a UML metaclass: `Class`, `Property`, `Classifier`, …), `uml.Enumeration` (a tag's type); lines `uml.Extension`, `uml.ProfileApplication` (from a package), `uml.Generalization` |
| node | `parent` | a stereotype's or metaclass reference's profile; an enumeration's may be one |
| node, member, edge | `props` | on any UML element, `stereotypes` (a name, or `Profile::name` where two applied profiles share it) and `tags`, by stereotype then tag, each value as text: `{ "column": { "name": "placed_at" } }`; a stereotype's `isAbstract`; an extension's `isRequired` (the tool applies the stereotype to every element of that metaclass where the profile is applied) |
| node, edge | `type` | timing: `uml.Lifeline` (`props.states`, top to bottom); `uml.Message` inline in the view's `edges`, with `props.sentAt` and `props.receivedAt` (numbers) and `sort` `call`, `async` or `reply` |
| view | `timeline` | `unit` (optional); `changes`, `[{ id, lifeline, at, state }]` in any order (drawn by `at`); `constraints`, `[{ id, type: "uml.DurationConstraint" \| "uml.TimeConstraint", from, to, label }]`, whose ends are changes |
| view | `present` | a lifeline drawn as a value lifeline (`{ "as": "values" }`) |
| view | `diagram` | `"uml.profile"` or `"uml.timing"` |

Milestone 2's five types (`examples/bookshop-schema.json`, `returns-flowchart.json`, `bookshop-data-flow.json`,
`order-information-flow.json` and `bookshop-c4.json`; each type's note in [`docs/conformance/`](docs/conformance/)), from
0.24.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | ER: `er.Entity` (members `er.Column`), lines `er.Relationship` from the referenced entity to the referring one. Flowchart: `flow.Terminator`, `flow.Process`, `flow.Decision`, `flow.InputOutput`, `flow.PredefinedProcess`, `flow.Document`, `flow.Database`, `flow.ManualInput`, `flow.Delay`, `flow.Connector`; lines `flow.Flow`. Data flow: `dfd.Process`, `dfd.DataStore`, `dfd.ExternalEntity`; lines `dfd.DataFlow`. Information flow: `uml.InformationItem` and the classes, interfaces, components and actors it travels between; lines `uml.InformationFlow`. C4: `c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`, `c4.ContainerInstance`; lines `c4.Relationship` (its `label` the description) |
| member | `props` | a column's `dataType`, `primaryKey`, `foreignKey`, `references` (a column id), `nullable`, `unique` |
| node, edge | `props` | a relationship's `identifying` and `ends.from` and `ends.to`'s `multiplicity`; a process's or store's `number`; a flow's `conveyed` (ids); a C4 element's `description`, `technology`, `external`, `shape` (a map card shape), an instance's `container`; a C4 relationship's `technology` |
| node | `parent` | a container's software system, a component's container, a deployment node's node, an instance's node |
| node | `opensView` | a process's level: a `dfd` view whose `parent` is the view the process is on |
| view | `notation` | `"crowsfoot"` (default) or `"idef1x"` for `er`, `"yourdon"` (default) or `"gane-sarson"` for `dfd`: a repaint |
| view | `subject` | a C4 view's system or container, drawn as a boundary when `nodeIds` lists it |
| view | `edges` | a C4 dynamic view's steps: relationship ids, each once, in time order |
| view | `diagram` | `"er"`, `"flowchart"`, `"dfd"`, `"uml.information-flow"`, `"c4.landscape"`, `"c4.context"`, `"c4.container"`, `"c4.component"`, `"c4.dynamic"`, `"c4.deployment"` |

SysML v1.7's four types (`examples/ebike-requirements.json`, `ebike-blocks.json`, `ebike-structure.json` and
`ebike-range.json`; each type's note in [`docs/conformance/`](docs/conformance/)), from 0.25.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | Requirement: `sysml.Requirement`, `sysml.TestCase`, `sysml.Block`, `uml.Package`; lines `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy`, client to supplier. Block definition: `sysml.Block`, `sysml.InterfaceBlock`, `sysml.ConstraintBlock`, `sysml.ValueType`; members `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`, `sysml.Port`, `sysml.FlowProperty`, `sysml.ConstraintParameter`, `uml.Operation`; the class diagram's lines. Internal block: lines `sysml.Connector`. Parametric: lines `sysml.BindingConnector` |
| node | `props` | a requirement's `reqId`, `text`, `risk`, `verifyMethod`; a constraint block's `constraint`; a value type's `unit`, `quantityKind` |
| member | `props` | `valueType` (a port's starting `~` is conjugated), `multiplicity`, `default`; a port's `kind` (`proxy`, `full`); a flow property's `direction` |
| edge | `props` | a connector's `itemFlow` (`{ item, direction }`); a connector's or binding's `ends.<from\|to>.part` |
| node | `parent` | a requirement's owner, a requirement (drawn as a crosshair line) or a package |
| view | `subject` | the frame's element: a package (requirement, block definition), a block (internal block, parametric) or a constraint block (parametric) |
| view | `diagram` | `"sysml.requirement"`, `"sysml.block-definition"`, `"sysml.internal-block"`, `"sysml.parametric"` |

Milestone 4a's three types (`examples/bookshop-opening-plan.json`, `bookshop-gcp.json` and `bookshop-azure.json`;
[`mindmap.md`](docs/conformance/mindmap.md), [`gcp.md`](docs/conformance/gcp.md), [`azure.md`](docs/conformance/azure.md)),
from 0.26.0:

| On | Field | What it does |
|---|---|---|
| node, edge | `type` | mindmap: `mindmap.Topic`, no lines. Google Cloud: `gcp.Zone` (a group), `gcp.Product`, `gcp.User`; lines `gcp.Path`. Azure: `azure.Group`, `azure.Service`; lines `azure.Connector`. A cloud line may start or end at a group, never join a group and what it holds |
| node | `parent` | a topic's parent topic (a topic with none is a root); the group that holds a group or a service |
| node | `props` | a group's kind, `zoneType` (`project`, `region`, `zone`, `network`, `subnetwork`, `generic`) or `groupType` (`subscription`, `resource-group`, `region`, `virtual-network`, `subnet`, `generic`); a product's or service's `icon`, the pinned pack's own id (`Cloud-Run`, `Front-Door-and-CDN-Profiles`) |
| model | `icons` | from the CLI or a host: `<pack>/<id>` with `{ src, dark, name }`, and Google's `gcp/` with `{ legal }`; the module never fetches one |
| model | `iconPacks` | the label of the pin each pack's ids were chosen from (`{ "gcp": "2026-11-14" }`); `umlimator.py check` compares it with the release's |
| view | `present` | a first-level topic's half: `{ "side": "left" }` |
| view | `diagram` | `"mindmap"`, `"gcp"`, `"azure"` |

A BPMN diagram (`examples/bookshop-order-to-shipment.json`; [`docs/conformance/bpmn.md`](docs/conformance/bpmn.md)), from
0.27.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | `bpmn.Participant` (a pool; members `bpmn.Lane`), `bpmn.Task`, `bpmn.SubProcess`, `bpmn.CallActivity`, `bpmn.StartEvent`, `bpmn.EndEvent`, `bpmn.IntermediateCatchEvent`, `bpmn.IntermediateThrowEvent`, `bpmn.BoundaryEvent`, `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway`, `bpmn.DataObject`, `bpmn.DataStoreReference`, `bpmn.TextAnnotation`, `bpmn.Group`; lines `bpmn.SequenceFlow`, `bpmn.MessageFlow`, `bpmn.Association`, `bpmn.DataAssociation` (a flow's `label` is its name) |
| member, node | `parent` | a lane's lane of the same pool (nested); a flow node's innermost lane, its pool, its sub-process or none; data's pool or none |
| node, edge | `props` | on any element, `documentation`; a pool's `processRef`; a task's `taskType` (`none`, `user`, `service`); an event's `definition` (`none`, `message`, `timer`, `terminate`, by its kind); a boundary event's `attachedTo` (an activity) and `cancelActivity` (false: non-interrupting); a call activity's `calledElement`; a data store's `dataStoreRef`; the groups an element is in, `categoryValueRef` (ids); an association's `direction` (`none`, `one`, `both`) |
| node | `opensView` | a collapsed sub-process's own view, whose `subject` is the sub-process |
| view | `present` | a boundary event's side (`{ "side": "bottom" }`) |
| view | `diagram` | `"bpmn"`; a sub-process is drawn expanded when `nodeIds` lists something it holds |

## Command line

```bash
python3 umlimator.py render examples/bookshop.json --out page.html   # the interactive page, then its layout check
python3 umlimator.py stills page.html --out stills/                   # every view as SVG and PNG
python3 umlimator.py stills page.html --out stills/ --views overview,api --scale 1.5 --theme light
python3 umlimator.py check page.html --views 'pic-*'                   # the layout check on chosen views
python3 umlimator.py diff before.json after.json --out diff.html --stills diff/   # what changed, marked and in words
python3 umlimator.py diff --base origin/main --out diff/              # every model changed since a ref, and a summary.md
python3 umlimator.py drift model.json traffic.json --out drift.html   # drawn vs. seen (a Jaeger or Tempo dependency list)
python3 umlimator.py timelapse model.json --out history.html          # the model's versions in git history, on a slider
python3 umlimator.py check page.html --expand                          # also each view with each stacked card unfolded
python3 umlimator.py record bike-share.html --story ride --out ride.png   # bike-share's story as an animated PNG, its tours riding
python3 umlimator.py import workspace.dsl --out model.json            # a diagram you have already, as a model
python3 umlimator.py import classes.mmd --out classes.json            # a Mermaid classDiagram, as a UML class diagram (needs Node)
python3 umlimator.py import checkout.mmd --out checkout.json          # a Mermaid sequenceDiagram, as a UML sequence diagram (needs Node)
python3 umlimator.py import order.mmd --out order.json                # a Mermaid stateDiagram, as a UML state machine diagram (needs Node)
python3 umlimator.py import needs.mmd --out needs.json                # a Mermaid requirementDiagram, as a SysML requirement diagram (needs Node)
python3 umlimator.py import schema.mmd --out schema.json              # a Mermaid erDiagram, as an ER diagram (needs Node)
python3 umlimator.py import returns.mmd --typed --out returns.json    # a Mermaid flowchart as a flowchart (without --typed, a map)
python3 umlimator.py import workspace.json --out c4.json              # a Structurizr JSON workspace, as typed C4 views (needs Node)
python3 umlimator.py import schema.dbml --out schema.json             # DBML, as an ER diagram (needs Node and @dbml/core, installed by you)
python3 umlimator.py import plan.mmd --out plan.json                  # a Mermaid mindmap, as a mindmap (needs Node)
python3 umlimator.py pack list                                        # the cloud icon packs: each one's label, and whether it is fetched and accepted
python3 umlimator.py pack fetch gcp                                   # Google Cloud's icons: their terms first, then your yes (Icons, below)
python3 umlimator.py import order.bpmn --out order.json               # BPMN XML, as a BPMN diagram (needs Node and bpmn-moddle, installed by you)
python3 umlimator.py export order.json --out order.bpmn               # a model's BPMN as BPMN XML, laid out (the same)
python3 umlimator.py render examples/sales-classes.json --out classes.html   # a class diagram's page; stills, check and pdf take it too
docker compose config --format json > compose.json && python3 umlimator.py import compose.json --out model.json
kubectl get deploy,sts,svc,ing -A -o json > cluster.json && python3 umlimator.py import cluster.json --out model.json
python3 umlimator.py pdf page.html --out map.pdf                       # every view in one PDF: a cover, each view with its tables, the rules
python3 umlimator.py trace model.json trace.json --view ride-end --match match.json --out model.json   # an OTLP trace kept as a numbered view
python3 umlimator.py trace model.json trace.json --view ride-end --match match.json --diagram uml.sequence --out traced.json  # ... as a UML sequence diagram, in a version-2 model
python3 umlimator.py mcp model.json                                    # an MCP server over stdio, for an AI assistant (below)
```

`check` also reports each rule the model breaks, and then exits 1.

`import` reads Structurizr DSL (people, systems, containers and components, their relationships, and the workspace's
views), C4-PlantUML (its element, relationship and boundary macros), Mermaid (`flowchart` or `graph`, and `C4Context`,
`C4Container` or `C4Component`; a `classDiagram` becomes a UML class diagram, a `sequenceDiagram` a UML sequence
diagram and a `stateDiagram` a UML state machine diagram, each read through Node), and the JSON of `docker compose config` (services, `depends_on`, networks) and of
`kubectl get` (workloads, Services, Ingresses). It tells the format from the content, then the extension; `--format`
decides. Groups, boundaries, subgraphs, networks and namespaces become boxes; Structurizr's views stay views, a card
opening the view below it; `examples/clinic.json` is `examples/clinic.dsl`, imported. What each element becomes, and
what is left out: [docs/module-api.md § Import](docs/module-api.md#import-90). Whatever the file holds that `import`
doesn't read is listed on stderr with its line (in JSON, its path). A Structurizr, C4-PlantUML or Mermaid C4 source's
people are people (`person`, or `user` outside the system), and its phone apps phones. A
Structurizr workspace's `styles` give its elements their shapes (`shape Person`, `Cylinder`, `WebBrowser`, ...), in
Structurizr's own order; a shape the map has no counterpart for is listed in `notImported`.

`pdf` prints the map through Chrome's own print, as a document to hand in for a review
([bike-share's](https://zintaen.github.io/umlimator/examples/bike-share.pdf), as CI builds it). A cover has the title,
the date, the model's file, a summary line and the contents with each view's page. Each view starts a page of its own,
under its path ("Bike share › What runs"): its picture in vectors, as large as the page allows, the legend of what it
draws, and tables of its cards, lines and boxes, which go on over the next pages with their header row when they are
long. The rules follow as a table, when the model has any, each holding or broken in the views printed. Every page ends in
the title and "page N of M". It takes `--views` and `--theme`, as `stills` does, and `--paper a4|letter` (A4 is the
default; both across).

The page has breadcrumbs, a details panel per card (with the slowest path from it and what-if), ⌘K search, deep links
(`#view=<id>&node=<id>`, `#story=<id>&step=<n>` for a story's step, `#lens=<id>`), stories, lenses, a
light and dark toggle (◐), and export. For
scripts and tests, it keeps its map's handle on `window.umlimatorMap`: the `Handle` that `render()` returns (`setView()`,
`highlight()`, `tour()`, `play()` ...).
`stills` skips a view whose inputs have not changed since its last export (`--all` exports every view), and exits 1,
saying why, when a view can't be exported. In `stills`, `check` and `pdf`, `--views` takes view ids, and a trailing `*`
is a prefix; a name that matches no view is an error. A command that fails leaves its previous output as it was. Needs Python
3.9+ (standard library only), Google Chrome or Chromium for `stills`, `check`, `record` and `pdf`, and Node 18+ for
`diff`, `drift`, `trace` and `mcp`.

`record` writes an animated PNG, which browsers and GitHub show as it is. For a GIF or an MP4 (for chat or slides),
convert it with ffmpeg:

```bash
ffmpeg -f apng -i ride.png -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" ride.gif
ffmpeg -f apng -i ride.png -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p ride.mp4
```

On pull requests, the diff Action posts what they change in your maps and UML diagrams (every type above): one comment
with the summary and a sketch, and the pictures as the run's artifact. The comment names the commit it describes, only
the run for the pull request's latest commit writes it, and it says so when the diff fails.

```yaml
on: pull_request
permissions: { contents: read, pull-requests: write }
concurrency: { group: "maps-${{ github.event.pull_request.number }}", cancel-in-progress: true }   # one run per pull request
jobs:
  maps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zintaen/umlimator@v0.26.0
        with:
          models: "docs/*.json"   # optional: where the models are (default: every .json that is a map model)
```

## An AI assistant on the map (MCP)

`umlimator.py mcp model.json` is a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio: an AI
assistant reads the model, and shows you what it finds on the map in your browser. Add it to Claude Code:

```bash
claude mcp add umlimator -- python3 /path/to/umlimator.py mcp /path/to/model.json
```

| Tool | What it does |
|---|---|
| `list_views()` | the views (id, title, parent, number of cards) and the stories |
| `describe_view(view)` | the view in sentences (`describe()`), then each card's id |
| `paths(view, from, to)` | every card and line on a path from one card to another (`paths()`; on a sequence view, in time order), as Refs for `highlight` |
| `reach(view, card, backward?, depth?)` | what a card leads to, or what leads to it, with the distance of each (`reach()`) |
| `broken_rules()`, `validate()` | each break of the model's `rules` (`rules()`), and its own problems (`validate()`) |
| `diff(other_model_path)` | what changed from another model file to this one, in words, and the views that show it (`diff()`) |
| `show_view(view)` | shows a view on the page |
| `highlight(refs, view?)` | lights cards and lines (their ids, or the Refs `paths` and `reach` give) and dims the rest |
| `tour(cards, view?)` | a dot rides the lines through these cards |
| `play_story(id)`, `clear()` | plays one of the model's stories; takes the assistant's highlight, tour and story off |
| `page_state()` | what each open page shows (its map's `state`: view, selection, layers, story, camera), and whether the model renders |

- The read tools run the module's own functions in Node on the model file, read again at each call, so edits show up.
- The page tools drive the map's page, which the server serves at `http://127.0.0.1:7391` (`--port N`, or another port
  when that one is taken). Open it in a browser.
  - A tool answers "shown" once a page has shown it, or says why none did: the page's own error, or a tab in the
    background that didn't finish in time. With no page open, it gives the URL.
  - A page that opens later shows what the assistant built: the view, with the highlight on it, and a tour or story
    still under way.
  - The assistant's highlight is a layer of its own (`mcp`): off on another view, back on its own.
  - A model that stops rendering keeps the last page that did, and the tools and the page say why.
- The server listens on 127.0.0.1 only and fetches nothing, so a logo not in the cache yet keeps its card's sigil.

## Map a repo with Claude Code

The `map-repo` skill reads a codebase, writes a C4-style model (context, containers, components), renders it to a page
and stills, and fixes what the layout check reports. Install it, then ask Claude Code to map the repository:

```
/plugin marketplace add zintaen/umlimator
/plugin install umlimator@umlimator
```

On Claude Code 2.1.275 or later, `/plugin install umlimator --marketplace zintaen/umlimator` does both in one step. The
skill needs git, Python 3.9+ and Chrome; on first use it fetches the CLI of one pinned release into
`~/.cache/umlimator/cli`.

## Icons

A node's `icon` names an entry in `icons/manifest.json`. Line icons ship in `icons/` and take the card's colour. Brand
logos do not ship: they are their owners' trademarks. The manifest records each logo's official source and a sha256;
the first render that needs one downloads it into `~/.cache/umlimator/icons` (or `$UMLIMATOR_ICON_CACHE`) and uses it
only if the hash matches. A logo is never recoloured; follow each brand's guidelines for its use.

```bash
python3 -I tools/fetch_icons.py icons "name:slug"            # a brand logo: svgl, then devicon, then gilbarbara/logos
python3 -I tools/fetch_icons.py icons "name=https://..."     # a brand's own official file
python3 -I tools/fetch_icons.py icons "name:lucide/<icon>"   # a line icon
python3 umlimator.py pin-icons                                # records each new logo's sha256
```

With `UMLIMATOR_OFFLINE=1` the CLI fetches nothing: a logo not in the cache keeps its card's sigil (`mcp` sets it).

### Cloud icon packs (0.26.0)

The Google Cloud, Azure and AWS diagrams draw each vendor's own service icons, which umlimator never ships, never bundles and
never downloads on its own. You fetch a pack yourself, once, with `umlimator.py pack fetch gcp`, `pack fetch azure` or `pack fetch aws`:

- **The terms first.** The vendor's terms are shown in full, with the line below, before any byte of the pack is
  downloaded, and you type `yes`. With no terminal (an agent, a script), `--accept-terms gcp@2026-11-14` (the pack and its
  label, as `pack list` prints them) is the yes: it prints the terms too and is recorded as given by flag. An agent shows
  you the terms and passes the flag only on your yes; the MCP server offers neither. A new label asks again.
- **Pinned.** Each zip comes from its vendor's own address, pinned in `icons/packs.json` by size and SHA-256; a file
  that differs is not kept. Azure's `Microsoft_Terms_of_Use.pdf` is checked against its pinned hash too. All three packs
  are pinned in 0.26.0; a vendor that changes its file without a version waits for a later release's re-pin.
- **Cached for you only.** A fetched pack lives in `<icon cache>/packs/` (`~/.cache/umlimator/icons`, or
  `$UMLIMATOR_ICON_CACHE`). A render reads it and copies the icons it draws into the page, as it does a logo, and never
  downloads a pack; with none fetched the cards draw a glyph and one line says how to fetch it. `UMLIMATOR_NO_PACKS=1`
  draws glyphs whatever the cache holds: this project builds every page and still it publishes that way.
- **Drawn as they are.** An icon is scaled, never recoloured, cropped or reshaped, on a tile for contrast, with the full
  service name beside it. Wherever a Google icon is drawn, in a card or a legend, Google's legal line is drawn under the
  picture and ends its description: "Google Cloud and the Google Cloud logo are trademarks of Google LLC."
- **Logos from Microsoft's pack.** The logos `azuredevops`, `foundry` and `containerapps` are read from the Azure pack
  once you fetched it; `entra` is read from the cache if it is there. A render no longer downloads any of them.
- **AWS.** `pack fetch aws` works the same way, from AWS's pinned `Icon-package_07312026` zip; AWS accepted this use by
  email to the maintainer (14 Nov 2026). Wherever an AWS icon is drawn, AWS's trademark line is drawn under the picture
  and ends its description: "Amazon Web Services, AWS and the AWS service icons shown are trademarks of Amazon.com, Inc.
  or its affiliates."
- **The only fetcher a user runs.** `tools/fetch_icons.py` is upstream's maintainer script, kept unmodified and not in
  the npm package; it downloads without these pins, terms or yes, so it is not a way to get a pack.

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.

A host other than the CLI gives the same table with the model (`model.icons`, keyed `<pack>/<id>`, from icons it
fetched under the same terms; `docs/module-api.md`).

## Development

```bash
npm run build               # src/ into lib/umlimator.js and lib/umlimator-all.js: edit the sources, commit all three
node --test                 # layout() in Node: the bench views' geometry and the layout rules; npm test runs the "(timed)" tests apart, one file at a time
python3 tests/embed.py      # render() in headless Chrome: events, keyboard, colours, contrast, editing, the element
python3 bench/bench.py --check-determinism --expect bench/expected.json --max-ms m50=2000
```

The bench lays out fixed models (10 to 69 cards, and 50 modules with 100 lines) in headless Chrome and reports the
time per phase, the layout check's issues and a hash of the geometry. `--expect` fails on a view that no longer draws as
recorded in `bench/expected.json`; a change that moves lines on purpose refreshes it with `--write-expected`. CI runs
all of the above, fails when `lib/umlimator.js` is not what `src/` builds or a source uses a name it does not import,
and checks that the files copied from upstream (`engine/scripts`, `engine/references`,
`tools/fetch_icons.py`) are unmodified.

To release, bump `package.json`'s version in a PR and add that version's `## X.Y.Z: …` section to
`docs/module-api.md`. When the PR is merged and the checks pass on `main`, CI tags `vX.Y.Z`, publishes a GitHub
Release with that section as its notes, and publishes the package to npm (trusted publishing: no token is stored).
CI also publishes the examples to GitHub Pages from `main`.

```
umlimator.py                 CLI: render, stills, check, record, pdf, pin-icons, diff, drift, timelapse, import, trace, mcp
umlimator_import.py          import's readers: Structurizr DSL, C4-PlantUML, Mermaid, compose and Kubernetes JSON
umlimator_mcp.py             the MCP server that `umlimator.py mcp` runs
action.yml                   the diff Action: what a pull request changes in its maps, posted on it
src/                         the module's sources, by layer: core, draw, layout, map, canvas, page (tools/build.mjs joins them)
lib/                         the module (umlimator.js; umlimator-all.js with every diagram family; both built and committed), its types, the default theme, <umlimator-map> and the docs plugins
engine/                      the page templates the CLI inlines the module into; the upstream renderer and schema
docs/                        the module's API and the editing design; docs/conformance/: what each diagram type covers; docs/diagrams/: the plan for 28 diagram types
tests/, bench/               tests, benchmark models and results
icons/                       line icons and the logo manifest (sources and hashes only)
examples/                    made-up systems: models, host pages and a Node script (live: zintaen.github.io/umlimator)
.claude-plugin/, plugins/    the Claude Code marketplace and its map-repo skill
```

## Licence

MIT (`LICENSE`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
