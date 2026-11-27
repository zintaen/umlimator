# The model

Everything umlimator draws comes from one JSON file, the model. A model holds shared `nodes` (cards) and `edges`
(lines), and `views` that each show a subset of them. The same card can appear in several views, and a card can open
another view, which is how a map gets its layers.

```json
{
  "$schema": "./node_modules/umlimator/lib/umlimator.schema.json",
  "title": "Bookshop",
  "nodes": [
    { "id": "web", "label": "Web shop", "kind": "frontend" },
    { "id": "api", "label": "Orders API", "kind": "backend", "opensView": "api" },
    { "id": "db", "label": "Orders", "kind": "database" }
  ],
  "edges": [
    { "id": "e1", "from": "web", "to": "api", "label": "places orders" },
    { "id": "e2", "from": "api", "to": "db", "label": "writes", "kind": "state" }
  ],
  "views": [
    { "id": "overview", "parent": null, "title": "Bookshop", "nodeIds": ["web", "api", "db"] }
  ]
}
```

A view may also have `containers` (boxes), a `layout` (`[col, row]` per card), `render: "sequence"` for a numbered
run-order view and a `tour`, a dot that rides a path. [Views and layers](./views-and-layers.md) covers them. The full
map schema is [`engine/references/schema.md`](../../engine/references/schema.md) (§ Map model);
[`examples/umlimator-atlas.json`](../../examples/umlimator-atlas.json), umlimator's own model, uses much of it. The map
has no example page of its own: every atlas opens on a map, and the Bookshop atlas's overview
([`examples/bookshop-atlas.json`](../../examples/bookshop-atlas.json), [its page](../atlas/bookshop.md#view-overview))
shows everything a map draws, with a checklist of what to find in it.

## Schema and validation

A model file that starts with `"$schema": "<path to>/umlimator.schema.json"` (exported as `umlimator/schema.json`)
gets completion and checks in editors. `validate(model)` lists its errors and warnings, each with where it is, and
`rules(model)` lists every rule the model breaks, view by view.

## Maps and typed diagrams

A model with no `schemaVersion` is a map, as always. `"schemaVersion": 2` marks a model that may hold typed elements and
typed views ([`docs/diagrams/model.md`](../diagrams/model.md)); a version newer than the module reads is an error. A
view's `diagram` says which of the 28 diagram types it is:

| Family | `diagram` values | Since |
|---|---|---|
| UML structure | `"uml.class"`, `"uml.object"`, `"uml.package"`, `"uml.component"`, `"uml.deployment"`, `"uml.composite-structure"`, `"uml.profile"` | 0.18.0 to 0.23.0 |
| UML behaviour | `"uml.sequence"`, `"uml.communication"`, `"uml.use-case"`, `"uml.activity"`, `"uml.state-machine"`, `"uml.interaction-overview"`, `"uml.timing"`, `"uml.information-flow"` | 0.20.0 to 0.24.0 |
| Data and process | `"er"` (entity-relationship), `"flowchart"`, `"dfd"` (data flow) | 0.24.0 |
| C4 | `"c4.landscape"`, `"c4.context"`, `"c4.container"`, `"c4.component"`, `"c4.dynamic"`, `"c4.deployment"` | 0.24.0 |
| SysML v1.7 | `"sysml.requirement"`, `"sysml.block-definition"`, `"sysml.internal-block"`, `"sysml.parametric"` | 0.25.0 |
| Mindmap and cloud | `"mindmap"`, and `"gcp"`, `"azure"` and `"aws"` for Google Cloud, Azure and AWS architecture diagrams | 0.26.0 |
| BPMN | `"bpmn"` | 0.27.0 |

Each is drawn by `umlimator/all` and the CLI. `umlimator` alone draws maps, and shows a typed view's nodes as plain
cards, with a warning. Each type's note in [`docs/diagrams/conformance/`](../types/index.md) says what it covers and lists every
field.

## Map fields

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
| edge | `weight` | 1, 2 or 3: how much the line stands for. Every line is drawn thin at rest; a line of weight 2 or 3 grows to its width (and a larger arrowhead) on hover, when its card is selected and when it has keyboard focus, and its tooltip and accessible name say its `what`, else "weight 2 of 3" |
| edge | `step` | a number (2, or 2.1) or text of up to 3 characters (2a), in a circle on the line in any view (a pill for 2 or 3 characters): the order things happen, shown as written in the line's name and title. A numbered view numbers its lines in run order instead |
| edge | `sublabel` | a second, smaller line under the label |
| edge | `fromSide`, `toSide` | the card sides the line uses |
| edge | `from`, `to` | may name a container of the view: the line ends on its box |
| edge | `style: "faded"` | the line in its kind's colour, faint and with no flow (drift's idle lines) |
| edge | `drift` | what `drift()` found: `undrawn` or `idle` |
| edge | `latency`, `cost` | budgets, in ms and in any unit: `critical()` sums them along a path (not drawn) |
| view | `gap`, `rgap` | the space between columns and between rows |
| view | `keepPairs` | A→B and B→A drawn as two lines |
| view | `repair: false` | no port repair (a map view; a typed view's lines are never port-repaired) |
| view | `subAndChips` | cards 80 px tall that show their sub-line, then their chips |
| view | `kindsFromLabels` | a line whose edges name no `kind` takes one guessed from its label |
| view | `arrange: "flow"` | lay the view out by business flow ([design note](../diagrams/notes/layout-flow.md)). So far its dependency lines (a line whose `flow` is `dep`, else one whose kind is `state` or `guard`) rank nothing: a card whose lines are all dependencies, such as a store every step writes to, sits under the flow in the column of the middle card it is joined to, and its lines are routed after the flow lines and may run right to left. The main flow (see `flow`) holds one straight row, across the view's boxes too (a flow that leaves a box for one card or box and comes back keeps the box's cards on the row, the card or box it visits under the box), and each branch keeps to one side of it: above when one of its lines is a guard, else below. A main flow of more than 10 cards wraps onto a second row that runs back under the first, joined by one line straight down (the snake), each row's branches on its outer side and a store both rows use between them; a box keeps to one row, and with no such cut the view stays one row. Cards take their zones (see `zone`), inside each box too. A pinned card keeps its pin. A view with no flow line, or a typed view whose type reads no flow (class, ER, component and the other structure types), draws as without it. A typed view whose type reads the flow is laid out by it as [Typed diagrams](../api/typed-diagrams.md) says, and drawn ranked, as without `arrange`, where every arranged way draws more layout check problems; a map view with boxes is drawn ranked (no main row, no zones) where that draws no more layout check problems and scores over 2 percent lower. `validate()` checks it, and `diff()` reports a change |
| view | `zones: false` | no default zones in an arranged view; a card's own `zone` still holds |
| edge | `flow` | the line's part in an arranged view: `main`, `branch` or `dep`. `dep` ranks nothing (as `state` and `guard` lines do without it), and `main` or `branch` makes a `state` line rank as a flow line; `main` lines are the main flow, else the stepped lines chained in step order (2 < 2a < 2b < 3), else the longest path of flow lines. `validate()` warns when an arranged view's `main` lines are not one path, or its steps break into chains |
| node (or a view's `nodeOverrides`) | `zone` | where the card sits in an arranged view: `first` (a column before the flow), `flow` (ranked by its lines), `last` (a column after it) or `under` (a band below every flow row, in the column of the middle card it is joined to). A first or last card takes no rank from its lines, sits on the main row when it has a line into the first main card (or from the last), and a flow line that runs back into it is drawn as a line back. Without it, the defaults for a card off the main flow: a person (by shape or kind) and a `public` card no line comes into go first, an `external` card last, a `database`, `file` or `board` card under; the main flow's first card may go first and its last card last. A view with no boxes keeps default zones only when they draw no more problems than without them; a card's own zone always holds, and a pin beats it. With boxes, zones apply inside each box. A view whose cards all have a zone ranks as without them |
| container | `badges` | tabs on the box's border |
| container | `tone` | a palette name, as a badge's: the region behind the box tinted in it, its border dashed and its title in the tone |
| model | `rules` | what must hold: no line `from` some cards `to` others (picked by id, kind, box or owner), or `noCycles` between boxes |
| model | `stories` | walk-throughs: steps that each set the view, camera, selection, highlight, tour and caption |
| model | `lenses` | ways to look at the map: what `pick` picks (by id, kind, box, owner or `line` kind) lit, the rest dimmed; `color: "owner"` rings cards by owner |

## Typed diagram fields

The tables below list the fields each family of diagram types adds in a version-2 model. Each type's conformance note
has the complete list and the rules that check them.

### Class, object and package diagrams (0.18.0, 0.19.0)

In a version-2 model, a class diagram (`examples/sales-classes.json`; every field in
[`docs/diagrams/conformance/uml-class.md`](../types/uml-class.md#conformance)), an object diagram (`examples/order-objects.json`,
[`uml-object.md`](../types/uml-object.md#conformance)) and a package diagram (`examples/bookshop-packages.json`,
[`uml-package.md`](../types/uml-package.md#conformance)):

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | what it is: `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType`, `uml.Package`, `uml.Comment`; members `uml.Property`, `uml.Operation`, `uml.EnumerationLiteral`; lines `uml.Association`, `uml.Generalization`, `uml.InterfaceRealization`, `uml.Dependency`, `uml.CommentLink` |
| node | `members` | its attributes, operations or literals, in order, each `{ id, type, label, props }` |
| node, member, edge | `type`, from 0.19.0 | an object diagram's `uml.InstanceSpecification`, its members `uml.Slot`, lines `uml.Link`; a package diagram's `uml.Package` and the classifiers above, lines `uml.PackageImport`, `uml.PackageMerge`, `uml.Dependency` |
| node | `parent` | the package that owns it: from 0.19.0 drawn as a box holding it when the view shows both |
| node, member, edge | `props`, from 0.19.0 | an instance's `classifier` (a name, as text); a slot's `value`; a link's `association` and its ends' `role`; a package import's `visibility`, `public` («import») or `private` («access») |
| node, member, edge | `props` | the type's own fields: `isAbstract`, `stereotypes`; a class's `associationClass` (the id of the association it is the association class of); a member's `visibility`, `valueType`, `multiplicity`, `default`, `isStatic`, `isDerived`, `parameters`, `returnType`; an association's `ends.from` and `ends.to` (`role`, `multiplicity`, `aggregation`, `navigable`) |
| view | `diagram` | `"uml.class"`, `"uml.object"` or `"uml.package"`: the view is a class, object or package diagram |
| view | `subject` | the package the view shows the inside of: names are qualified from it |
| view | `direction` | `"down"` lays it out top to bottom, the general class above (default `"right"`) |
| view | `present` | per element: `collapsed` compartments, and at most `rows` rows each, then "+k more" |

### Sequence and communication diagrams (0.20.0)

A sequence diagram (`examples/checkout-sequence.json`, [`docs/diagrams/conformance/uml-sequence.md`](../types/uml-sequence.md#conformance))
and a communication diagram (`examples/checkout-communication.json`,
[`docs/diagrams/conformance/uml-communication.md`](../types/uml-communication.md#conformance)), from 0.20.0:

| On | Field | What it does |
|---|---|---|
| node | `type` | `uml.Lifeline`; its `props.represents` is what it is an instance of, drawn `name : Type` |
| edge | `type` | `uml.Message`; on a communication view also `uml.Connector`, the link messages are sent along |
| edge | `props` | a message's `sort` (`call`, `async`, `reply`, `create`, `delete`) and a reply's `replyTo`, the call it answers |
| view | `diagram` | `"uml.sequence"` or `"uml.communication"` |
| view | `edges` | a sequence view's messages and interaction uses (`uml.InteractionUse`, `props.covers`), inline and in time order; a communication view's connectors, then its messages, by id, in order. Bars and numbers are derived |
| view | `fragments` | a sequence view's combined fragments (`uml.CombinedFragment`, `props.operator`), each with its operands as `members` (`label` the guard); a message's or fragment's `parent` is its operand |

### Use case, activity, state machine and interaction overview diagrams (0.21.0)

A use case diagram, an activity diagram, a state machine diagram and an interaction overview diagram
(`examples/shopping-use-cases.json`, `fulfil-activity.json`, `order-states.json` and `buy-book-overview.json`; each
type's note in [`docs/diagrams/conformance/`](../types/index.md)), from 0.21.0:

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

### Component, deployment and composite structure diagrams (0.22.0)

A component diagram, a deployment diagram and a composite structure diagram (`examples/bookshop-components.json`,
`bookshop-deployment.json` and `order-service-structure.json`; each type's note in
[`docs/diagrams/conformance/`](../types/index.md)), from 0.22.0:

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

### Profile and timing diagrams (0.23.0)

A profile diagram and a timing diagram (`examples/bookshop-profile.json` and `bookshop-timing.json`; each type's note in
[`docs/diagrams/conformance/`](../types/index.md)), from 0.23.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | profile: `uml.Profile`, `uml.Stereotype` (members `uml.Property`, its tag definitions), `uml.MetaclassReference` (its `label` a UML metaclass: `Class`, `Property`, `Classifier`, …), `uml.Enumeration` (a tag's type); lines `uml.Extension`, `uml.ProfileApplication` (from a package), `uml.Generalization` |
| node | `parent` | a stereotype's or metaclass reference's profile; an enumeration's may be one |
| node, member, edge | `props` | on any UML element, `stereotypes` (a name, or `Profile::name` where two applied profiles share it) and `tags`, by stereotype then tag, each value as text: `{ "column": { "name": "placed_at" } }`; a stereotype's `isAbstract`; an extension's `isRequired` (the tool applies the stereotype to every element of that metaclass where the profile is applied) |
| node, edge | `type` | timing: `uml.Lifeline` (`props.states`, top to bottom); `uml.Message` inline in the view's `edges`, with `props.sentAt` and `props.receivedAt` (numbers) and `sort` `call`, `async` or `reply` |
| view | `timeline` | `unit` (optional); `changes`, `[{ id, lifeline, at, state }]` in any order (drawn by `at`); `constraints`, `[{ id, type: "uml.DurationConstraint" \| "uml.TimeConstraint", from, to, label }]`, whose ends are changes |
| view | `present` | a lifeline drawn as a value lifeline (`{ "as": "values" }`) |
| view | `diagram` | `"uml.profile"` or `"uml.timing"` |

### ER, flowchart, data flow, information flow and C4 (0.24.0)

Milestone 2's five types (`examples/bookshop-schema.json`, `returns-flowchart.json`, `bookshop-data-flow.json`,
`order-information-flow.json` and `bookshop-c4.json`; each type's note in [`docs/diagrams/conformance/`](../types/index.md)), from
0.24.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | ER: `er.Entity` (members `er.Column`), lines `er.Relationship` from the referenced entity to the referring one. Flowchart: `flow.Terminator`, `flow.Process`, `flow.Decision`, `flow.InputOutput`, `flow.PredefinedProcess`, `flow.Document`, `flow.Database`, `flow.ManualInput`, `flow.Delay`, `flow.Connector`; lines `flow.Flow`. Data flow: `dfd.Process`, `dfd.DataStore`, `dfd.ExternalEntity`; lines `dfd.DataFlow`. Information flow: `uml.InformationItem` and the classes, interfaces, components and actors it travels between; lines `uml.InformationFlow`. C4: `c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`, `c4.ContainerInstance`; lines `c4.Relationship` (its `label` the description) |
| member | `props` | a column's `dataType`, `primaryKey`, `foreignKey`, `references` (a column id), `nullable`, `unique` |
| node, edge | `props` | a relationship's `identifying` and `ends.from` and `ends.to`'s `multiplicity`; a process's or store's `number`; a flow's `conveyed` (ids); a C4 element's `description`, `technology`, `external`, `shape` (a map card shape other than `node`, which is the deployment view's: `box`, `person`, `robot`, `browser`, `window`, `terminal`, `mobile`, `cylinder`, `pipe`, `folder`, `document` or `hexagon`; any other name draws the default, `person` for a person and `box` for the rest), an instance's `container`; a C4 relationship's `technology` |
| node | `parent` | a container's software system, a component's container, a deployment node's node, an instance's node |
| node | `opensView` | a process's level: a `dfd` view whose `parent` is the view the process is on |
| view | `notation` | `"crowsfoot"` (default) or `"idef1x"` for `er`, `"yourdon"` (default) or `"gane-sarson"` for `dfd`: a repaint |
| view | `subject` | a C4 view's system or container, drawn as a boundary when `nodeIds` lists it |
| view | `edges` | a C4 dynamic view's steps: relationship ids, each once, in time order |
| view | `diagram` | `"er"`, `"flowchart"`, `"dfd"`, `"uml.information-flow"`, `"c4.landscape"`, `"c4.context"`, `"c4.container"`, `"c4.component"`, `"c4.dynamic"`, `"c4.deployment"` |

### SysML v1.7 (0.25.0)

SysML v1.7's four types (`examples/ebike-requirements.json`, `ebike-blocks.json`, `ebike-structure.json` and
`ebike-range.json`; each type's note in [`docs/diagrams/conformance/`](../types/index.md)), from 0.25.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | Requirement: `sysml.Requirement`, `sysml.TestCase`, `sysml.Block`, `uml.Package`; lines `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy`, client to supplier. Block definition: `sysml.Block`, `sysml.InterfaceBlock`, `sysml.ConstraintBlock`, `sysml.ValueType`; members `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`, `sysml.Port`, `sysml.FlowProperty`, `sysml.ConstraintParameter`, `uml.Operation`; the class diagram's lines. Internal block: lines `sysml.Connector`. Parametric: lines `sysml.BindingConnector` |
| node | `props` | a requirement's `reqId`, `text`, `risk`, `verifyMethod`; a constraint block's `constraint`; a value type's `unit`, `quantityKind` |
| member | `props` | `valueType` (a port's starting `~` is conjugated), `multiplicity`, `default`; a port's `kind` (`proxy`, `full`); a flow property's `direction` |
| edge | `props` | a connector's `itemFlow` (`{ item, direction }`); a connector's or binding's `ends.<from\|to>.part` |
| node | `parent` | a requirement's owner, a requirement (drawn as a crosshair line) or a package |
| view | `subject` | the frame's element: a package (requirement, block definition), a block (internal block, parametric) or a constraint block (parametric) |
| view | `diagram` | `"sysml.requirement"`, `"sysml.block-definition"`, `"sysml.internal-block"`, `"sysml.parametric"` |

### Mindmap, Google Cloud, Azure and AWS (0.26.0)

The mindmap and the three cloud architecture types (`examples/bookshop-opening-plan.json`, `bookshop-gcp.json`,
`bookshop-azure.json` and `bookshop-aws.json`; [`mindmap.md`](../types/mindmap.md#conformance), [`gcp.md`](../types/gcp.md#conformance),
[`azure.md`](../types/azure.md#conformance), [`aws.md`](../types/aws.md#conformance)), from 0.26.0:

| On | Field | What it does |
|---|---|---|
| node, edge | `type` | mindmap: `mindmap.Topic`, no lines. Google Cloud: `gcp.Zone` (a group), `gcp.Product`, `gcp.User`; lines `gcp.Path`. Azure: `azure.Group`, `azure.Service`; lines `azure.Connector`. AWS: `aws.Group`, `aws.Service`, `aws.Resource`; lines `aws.Connection`. A cloud line may start or end at a group, never join a group and what it holds |
| node | `parent` | a topic's parent topic (a topic with none is a root); the group that holds a group or a service |
| node | `props` | a group's kind, `zoneType` (`project`, `region`, `zone`, `network`, `subnetwork`, `generic`) or `groupType` (`subscription`, `resource-group`, `region`, `virtual-network`, `subnet`, `generic`), or on AWS `groupType` (`cloud`, `account`, `region`, `availability-zone`, `vpc`, `public-subnet`, `private-subnet`, `security-group`, `generic`); a product's or service's `icon`, the pinned pack's own id (`Cloud-Run`, `Front-Door-and-CDN-Profiles`) |
| model | `icons` | from the CLI or a host: `<pack>/<id>` with `{ src, dark, name }`, and Google's `gcp/` with `{ legal }`; the module never fetches one |
| model | `iconPacks` | the label of the pin each pack's ids were chosen from (`{ "gcp": "2026-11-14" }`); `umlimator.py check` compares it with the release's |
| view | `present` | a first-level topic's half: `{ "side": "left" }` |
| view | `diagram` | `"mindmap"`, `"gcp"`, `"azure"`, `"aws"` |

### BPMN (0.27.0)

A BPMN diagram (`examples/bookshop-order-to-shipment.json`; [`docs/diagrams/conformance/bpmn.md`](../types/bpmn.md#conformance)), from
0.27.0:

| On | Field | What it does |
|---|---|---|
| node, member, edge | `type` | `bpmn.Participant` (a pool; members `bpmn.Lane`), `bpmn.Task`, `bpmn.SubProcess`, `bpmn.CallActivity`, `bpmn.StartEvent`, `bpmn.EndEvent`, `bpmn.IntermediateCatchEvent`, `bpmn.IntermediateThrowEvent`, `bpmn.BoundaryEvent`, `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway`, `bpmn.DataObject`, `bpmn.DataStoreReference`, `bpmn.TextAnnotation`, `bpmn.Group`; lines `bpmn.SequenceFlow`, `bpmn.MessageFlow`, `bpmn.Association`, `bpmn.DataAssociation` (a flow's `label` is its name) |
| member, node | `parent` | a lane's lane of the same pool (nested); a flow node's innermost lane, its pool, its sub-process or none; data's pool or none |
| node, edge | `props` | on any element, `documentation`; a pool's `processRef`; a task's `taskType` (`none`, `user`, `service`); an event's `definition` (`none`, `message`, `timer`, `terminate`, by its kind); a boundary event's `attachedTo` (an activity) and `cancelActivity` (false: non-interrupting); a call activity's `calledElement`; a data store's `dataStoreRef`; an exclusive gateway's or an activity's `default`, the id of its default flow (one of its sequence flows out, with no condition); the groups an element is in, `categoryValueRef` (ids); an association's `direction` (`none`, `one`, `both`) |
| node | `opensView` | a collapsed sub-process's own view, whose `subject` is the sub-process |
| view | `present` | a boundary event's side (`{ "side": "bottom" }`) |
| view | `diagram` | `"bpmn"`; a sub-process is drawn expanded when `nodeIds` lists something it holds |
