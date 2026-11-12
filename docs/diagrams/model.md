# The typed model (schema version 2)

Status: draft. It is the starting point for stage 1's design note, and the examples in [`examples/`](examples/) follow
it; the class diagram's moved to [`../../examples/`](../../examples/) when it drew. From 0.18.0 the library reads the
`uml.class` rows (`docs/conformance/uml-class.md`); the other types' fields are kept, not drawn yet. Why the model looks like this: [`proposal.md`](proposal.md) §4.

Check the examples against this page with `node docs/diagrams/examples/check.mjs`.

## 1. The rules

1. **Everything that exists stays valid.** A model with no `schemaVersion` is version 1. A view with no `diagram` is
   a map, drawn exactly as today.
2. **One envelope** for every node, edge and member:

   ```jsonc
   { "id": "order", "type": "uml.Class", "label": "Order",
     "parent": "sales",           // optional: the element that owns it
     "props": { },                // optional: the type's own properties; the core stores and diffs them, never reads them
     "members": [ ] }             // optional: owned parts, in display order, each in this same envelope
   ```

   `label` may be left out where the notation shows none: an initial node, a fork, a final state.

   Nodes and edges may also carry today's generic fields (`sublabel`, `icon`, `badges`, `what`, `when`, `how`,
   `owner`, `opensView`, `style`). A type does not interpret them.
3. **Nodes, members, edges.**
   - A **node** has its own box, is listed in a view's `nodeIds`, and may be an edge's end.
   - A **member** is drawn in or on its owner: a row in a compartment, a port on a border, a region in a state, a
     lane in a pool, an operand in a fragment. It has an id, may be an edge's end, and is shown with its owner.
     Some views draw a member as a box: a part in a composite structure or internal block diagram (§2, `subject`).
   - An **edge** joins two ends. `from` and `to` each name a node, a member or, as today, a box of the view.
4. **Types** are `<notation>.<Name>`, the name in the notation's own vocabulary: `uml.Class`, `bpmn.Task`,
   `er.Entity`. A view's kind is its `diagram`, lower-case with hyphens: `uml.class`, `uml.state-machine`, `er`.
   Two different keys, so `uml.Class` (an element) and `uml.class` (a diagram) cannot be confused.
5. **Ids.** Nodes, edges, members, fragments, and a timing view's changes and constraints share one id space in a
   model. Views keep their own, because a
   view may share a card's id on purpose (the card then opens it). Ids are opaque, chosen by the host or the reader,
   and never contain `->` (today's positional line ids do). Every typed edge has an id.
6. **`parent`** is ownership:
   - on a node: the node or member that holds it (a package, a composite state or its region, a lane, a group);
   - on a message, an interaction use or a fragment in a sequence view: the operand it lies in.

   A type draws a node's `parent` as nesting where it names boxes (stage 2's `boxes`,
   [`notes/stage-2.md`](notes/stage-2.md) §4). A sequence view places its operands on the time axis, not as boxes
   ([`notes/stage-3.md`](notes/stage-3.md) §4.2).
7. **Edge ends.** Properties of an end live in `props.ends.from` and `props.ends.to` (role, multiplicity,
   aggregation, navigability). When the end is a port or parameter reached through a part, `props.ends.<end>.part`
   names the part, as UML's `partWithPort` does.
   A directed relationship runs the way its arrow points: from the client to the supplier (a dependency, a
   realization, `satisfy`, `verify`), from the child to the parent (a generalization), from the extending use case
   to the extended one, from an artifact to the node it is deployed on, from the referenced entity to the one that refers to it (an ER
   relationship).
8. **Order is meaning only where the type says so:** `members` (display order), `view.edges` in sequence,
   communication and C4 dynamic views (time order; in a sequence view it orders the view's occurrences, messages and
   interaction uses, in one list), `view.nodeIds` in a mind map (sibling order) and in a sequence
   view (lifelines, left to right).
9. **Derived, never stored:** the size of a node sized by its content, compound bounds, activation bars, fragment
   frames, message numbers, lane sizes until a user resizes one.
10. **Presentation is per view** and never meaning:
    - `layout`: pins, `{ id: [col, row] }`, as today;
    - `present`: `{ id: { collapsed: ["operations"], rows: 8, side: "left", as: "ball", fromSide: "bottom", w: 240 } }`,
      only what the layout cannot derive. `collapsed` hides the named compartments, divider and all; `rows` shows at
      most that many rows per compartment, then "+k more" ([`notes/stage-1.md`](notes/stage-1.md) §5);
    - `notation`: a skin of the diagram type (`crowsfoot` or `idef1x` for `er`), as `shapes` is for maps;
    - `direction`: `right` (the default, today's) or `down`, which lays the view out turned and transposes it. A map
      view stays left to right, with a warning (stage 1 note, §6).

    In a sequence view `layout` pins mean nothing (warned, not drawn), and `direction` is `down` only.
11. **Text, not references, for now.** A property's type is text (`"valueType": "Money"`). References by id
    (`classifierRef`) come with integrity across diagram types, after 1.0.0.
12. **Unknown is kept.** A type the library does not know is drawn as a plain card with a warning and written back
    unchanged. A reader keeps what it cannot map under `ext.<reader>`.

### The view

```jsonc
{ "id": "domain", "diagram": "uml.class", "title": "Sales domain", "parent": null,
  "nodeIds": ["sales", "order"],          // the nodes shown
  "edges": ["order-lines"],               // optional: model edges by id, or inline edges, as today
  "subject": "engine",                    // optional: the element this diagram is the inside of
  "direction": "down", "notation": "…",
  "layout": { }, "present": { },
  "fragments": [ ], "timeline": { } }     // sections a diagram type declares (sequence, timing)
```

On a class, package or object view, `subject` names the package whose inside the view shows. An element whose owners
are not all shown is drawn with the hidden owners' names joined by `::`: from its owner on the picture (its nearest
shown owner that may be a box); with none, from the `subject` when that is one of its owners, else from the top
(`payments::card::CardPayment`). The `subject` is not drawn unless `nodeIds` lists it; then it is a box
holding the rest ([`notes/stage-2.md`](notes/stage-2.md) §2, §6).

### The model

```jsonc
{ "schemaVersion": 2, "title": "…", "root": "domain",
  "nodes": [ ], "edges": [ ], "views": [ ],
  "iconPacks": { "aws": "2026-07-31" } }  // optional: the icon packs its cloud diagrams name, with their versions
```

## 2. Vocabulary by diagram type

Each row is the minimal subset (§8.5 of the proposal for UML). A stage's design note may refine its rows; the example
file is then updated with it.

### UML

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 1 | `uml.class` | `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType`, `uml.Package`, `uml.Comment` | `uml.Property`, `uml.Operation`, `uml.EnumerationLiteral` | `uml.Association`, `uml.Generalization`, `uml.InterfaceRealization`, `uml.Dependency`, `uml.CommentLink` | Class props: `isAbstract`, `stereotypes`. Property props: `visibility`, `valueType`, `multiplicity`, `default`, `isStatic`, `isDerived`. Operation props: `visibility`, `parameters` (`[{ name, valueType, direction }]`), `returnType`, `isStatic`, `isAbstract` |
| 2 | `uml.object` | `uml.InstanceSpecification`, `uml.Comment` | `uml.Slot` | `uml.Link`, `uml.CommentLink` | Instance: `label` is its name and may be left out (an anonymous instance); `props.classifier`, text (M8); `props.stereotypes`. Slot: `label` is the feature, `props.value` its value as text, which may be left out. Link: `label` is its name; `props.association`, text; `props.ends.<end>.role`. An instance's owner is a package ([`notes/stage-2.md`](notes/stage-2.md) §2) |
| 3 | `uml.package` | `uml.Package`, the classifiers of row 1, `uml.Comment` | | `uml.PackageImport`, `uml.PackageMerge`, `uml.Dependency`, `uml.CommentLink` | Nesting is `parent`. PackageImport `props.visibility`: `public` (the default, drawn «import») or `private` (drawn «access»). Package `props.stereotypes`. A classifier's or package's owner is a package ([`notes/stage-2.md`](notes/stage-2.md) §2) |
| 4 | `uml.composite-structure` | `uml.Class` (the `subject`), `uml.Collaboration`, `uml.CollaborationUse` | `uml.Property` (a part, drawn as a box here), `uml.Port` | `uml.Connector`, `uml.RoleBinding` | Part props: `valueType`, `multiplicity`, `aggregation`. Connector ends may carry `part`. The `subject` is listed in `nodeIds`; the classes that type its parts are model nodes this view does not list. Collaboration use props: `collaboration`. A role binding runs from the part to the collaboration use, and its `label` is the role's name |
| 5 | `uml.component` | `uml.Component`, `uml.Interface`, `uml.Artifact` | `uml.Port` | `uml.InterfaceRealization` (provided), `uml.Usage` (required), `uml.Connector` (`props.kind`: `assembly` or `delegation`), `uml.Dependency`, `uml.Manifestation` | `present.<interface>.as: "ball"` draws lollipop and socket. A provided or required interface may start at a component or at one of its ports |
| 6 | `uml.deployment` | `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component` (what an artifact manifests) | | `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency` | An artifact whose `parent` is a node is deployed on it |
| 7 | `uml.profile` | `uml.Profile`, `uml.Stereotype`, `uml.MetaclassReference`, `uml.Package`, any element that applies a stereotype | `uml.Property` (a tag definition) | `uml.Extension` (`props.isRequired`), `uml.ProfileApplication`, `uml.Generalization` | Stereotypes are applied elsewhere as `props.stereotypes`, each matched to a stereotype by its `label`, and `props.tags`, a map from a tag's name to its value as text |
| 8 | `uml.use-case` | `uml.Actor`, `uml.UseCase`, `uml.Subject` | `uml.ExtensionPoint` | `uml.Association`, `uml.Include`, `uml.Extend` (`props.extensionPoints`, `props.condition`), `uml.Generalization` | Use cases have the subject as `parent` |
| 9 | `uml.activity` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.Action`, `uml.CallBehaviorAction`, `uml.SendSignalAction`, `uml.AcceptEventAction`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.ObjectNode`, `uml.DataStoreNode`, `uml.ActivityPartition` | | `uml.ControlFlow`, `uml.ObjectFlow` | A flow's guard is `props.guard`. A node's partition is its `parent`. A call behaviour action opens a view |
| 10 | `uml.state-machine` | `uml.State`, `uml.Pseudostate`, `uml.FinalState` | `uml.Region`, `uml.InternalTransition` | `uml.Transition` | State props: `entry`, `do`, `exit`. Pseudostate `props.kind`: `initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate`. Transition and internal transition props: `trigger`, `guard`, `effect`. A substate's or pseudostate's `parent` is the state, or one of its regions; at the top it has none |
| 11 | `uml.sequence` | `uml.Lifeline` | | `uml.Message` | `nodeIds` orders lifelines; `edges` orders the view's occurrences: its messages and interaction uses, inline, in time order. Lifeline props: `represents`. Message props, the same on rows 12 and 14: `sort` (`call`, `async`, `reply`, `create`, `delete`) and `replyTo`; several replies name one call only across the operands of one `alt`. `uml.InteractionUse` (in `edges`, not a line): `parent`, `props.refersTo`, `props.covers` (lifelines next to each other in `nodeIds`). `fragments`: `uml.CombinedFragment` (`props.operator`) with `uml.InteractionOperand` members (`label` is the guard), each taking its place from what it holds. An occurrence or a fragment in an operand has that operand as `parent`. A fragment's content, nested fragments' included, is one run in `edges`, operand by operand in `members` order. A lifeline is created at most once and deleted at most once. Activations are derived (below). Settled in [`notes/stage-3.md`](notes/stage-3.md) §4 |
| 12 | `uml.communication` | `uml.Lifeline` | | `uml.Connector`, `uml.Message` | Messages are model edges; the view's `edges` lists the connectors, then the messages in time order. Only the messages' order means anything. Numbers are derived: a message's number is its place among the messages sent in the activation it is sent from, replies included (`1.1.2.1`). A message is drawn on the connector that joins its two lifelines; a self message needs a connector from the lifeline to itself. Settled in [`notes/stage-3.md`](notes/stage-3.md) §6 |
| 13 | `uml.interaction-overview` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.InteractionUse`, `uml.Interaction` | | `uml.ControlFlow` | An interaction use or inline interaction names its sequence view in `opensView`; those views, with their lifelines and messages, are in the same model |
| 14 | `uml.timing` | `uml.Lifeline` | | `uml.Message` | Lifeline `props.states`. `timeline`: `unit`, `changes` (`[{ id, lifeline, at, state }]`), `constraints` (`[{ id, type, from, to, label }]`, types `uml.DurationConstraint`, `uml.TimeConstraint`; a time constraint has `from` only). Messages are inline, as in a sequence view, with `sentAt` and `receivedAt` |

### UML concepts and SysML v1.7

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 15 | `uml.information-flow` | Any classifier, `uml.Actor`, `uml.InformationItem` | | `uml.InformationFlow` | `props.conveyed`: ids of the items or classifiers carried. An item need not be shown as a node to be conveyed |
| 16 | `sysml.requirement` | `sysml.Requirement`, `sysml.TestCase`, `sysml.Block`, `uml.Comment` | | `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy` | Requirement props: `reqId`, `text`. Containment is `parent` |
| 17 | `sysml.block-definition` | `sysml.Block`, `sysml.ValueType`, `sysml.InterfaceBlock`, `sysml.ConstraintBlock` | `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`, `sysml.FlowProperty`, `sysml.Port`, `sysml.ConstraintParameter`, `uml.Operation` | `uml.Association`, `uml.Generalization`, `uml.Dependency` | Member props: `valueType`, `multiplicity`. ValueType props: `unit`, `quantityKind`. ConstraintBlock props: `constraint`. FlowProperty props: `direction` |
| 18 | `sysml.internal-block` | `sysml.Block` (the `subject`) | Its parts and references, drawn as boxes; `sysml.Port` | `sysml.Connector` | Connector props: `itemFlow` (`{ item, direction }`, the direction `from-to` or `to-from`); ends carry `part`. The blocks that type the parts are model nodes this view does not list |
| 19 | `sysml.parametric` | `sysml.Block` or `sysml.ConstraintBlock` (the `subject`) | Its `sysml.ConstraintProperty` and `sysml.ValueProperty` members, drawn as boxes; `sysml.ConstraintParameter` | `sysml.BindingConnector` | A binding to a parameter names the constraint property in `ends.<end>.part` |

### Other notations

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 20 | `er` | `er.Entity` | `er.Column` | `er.Relationship` | Column props: `dataType`, `primaryKey`, `foreignKey`, `nullable`, `unique`, `references` (a column id). Relationship props: `identifying`, `ends.<end>.multiplicity`. `notation`: `crowsfoot` (default) or `idef1x` |
| 21 | `flowchart` | `flow.Terminator`, `flow.Process`, `flow.Decision`, `flow.InputOutput`, `flow.PredefinedProcess`, `flow.Document`, `flow.Database`, `flow.ManualInput`, `flow.Delay`, `flow.Connector` | | `flow.Flow` | A decision's exits are labelled flows |
| 22 | `dfd` | `dfd.Process`, `dfd.DataStore`, `dfd.ExternalEntity` | | `dfd.DataFlow` | Process and store props: `number`. A process opens its child level (`opensView`). `notation`: `yourdon` (default) or `gane-sarson` |
| 23 | `c4.landscape`, `c4.context`, `c4.container`, `c4.component`, `c4.dynamic`, `c4.deployment` | `c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`, `c4.ContainerInstance` | | `c4.Relationship` | Element props: `description`, `technology`, `external`. Relationship: `label` is the description, `props.technology`. Ownership is `parent`. A container instance names its container in `props.container`. A view's `subject` is the system or container it zooms into. A dynamic view orders its `edges` |
| 24 | `bpmn` | `bpmn.Participant`, `bpmn.Task`, `bpmn.SubProcess`, `bpmn.CallActivity`, `bpmn.StartEvent`, `bpmn.EndEvent`, `bpmn.IntermediateCatchEvent`, `bpmn.IntermediateThrowEvent`, `bpmn.BoundaryEvent`, `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway`, `bpmn.DataObject`, `bpmn.DataStoreReference`, `bpmn.TextAnnotation`, `bpmn.Group` | `bpmn.Lane` | `bpmn.SequenceFlow`, `bpmn.MessageFlow`, `bpmn.Association`, `bpmn.DataAssociation` | Task `props.taskType`: `none`, `user`, `service`. Event `props.definition`: `none`, `message`, `timer`, `terminate`. Boundary event props: `attachedTo`, `cancelActivity`. Call activity props: `calledElement`. A flow node's `parent` is its lane, or its pool, and it names the groups it is in with `props.categoryValueRef`. The view inside a sub-process names it as `subject` |
| 25 | `mindmap` | `mindmap.Topic` | | | The tree is `parent`; the root has none. `present.<id>.side`: `left` or `right` |
| 26 | `aws` | `aws.Group`, `aws.Service`, `aws.Resource` | | `aws.Connection` | Group `props.groupType`: `cloud`, `account`, `region`, `availability-zone`, `vpc`, `public-subnet`, `private-subnet`, `security-group`, `generic`. Service and resource props: `icon`, an id in the pack |
| 27 | `gcp` | `gcp.Zone`, `gcp.Product`, `gcp.User` | | `gcp.Path` | Zone `props.zoneType`: `project`, `region`, `zone`, `network`, `subnetwork`, `generic`. Product props: `icon` |
| 28 | `azure` | `azure.Group`, `azure.Service` | | `azure.Connector` | Group `props.groupType`: `subscription`, `resource-group`, `region`, `virtual-network`, `subnet`, `generic`. Service props: `icon` |

`uml.Comment` with `uml.CommentLink`, and `props.stereotypes`, are available on every UML and SysML diagram.

**Activations in a sequence view (row 11)** are derived by intervals, never stored (rule 9;
[`notes/spike-sequence.md`](notes/spike-sequence.md) §2.3):

1. A `call` opens an activation on its receiver at its own row; a self-call opens it where its loop comes back.
2. It closes at the last reply whose `replyTo` names it. Replies in different operands of an `alt` all close it: the bar
   runs to the last.
3. With no reply, a self-call returns at once (its bar is one short step); any other call returns when its caller next
   sends a message, after the receiver's own last message before that.
4. `async`, `create` and `delete` open none. A reply or a message sent from a lifeline with no open bar leaves its stem.
5. Depth: an activation is nested in each of its lifeline's activations that contain it; each level is drawn 6 px to the
   right. A re-entrant call (A calls B, B calls A) is a second bar on A inside the first, by the same rule.

## 3. Open points, by the stage that settles them

| Stage | Point |
|---|---|
| 1 | Settled in [`notes/stage-1.md`](notes/stage-1.md): row heights are per row (§4); `present.collapsed` hides a compartment and `present.<id>.rows` shows "+n more" (§5) |
| 2 | Settled in [`notes/stage-2.md`](notes/stage-2.md): which shown package is a box (§4); qualified names and `subject` (§6); lines at a box (§7); class views draw packages as boxes from 0.19.0 (§10.1) |
| 1 (spike), 3 | Settled by [`notes/spike-sequence.md`](notes/spike-sequence.md) §2.1, accepted 12 Nov 2026 and adopted by [`notes/stage-3.md`](notes/stage-3.md): the order of things in a sequence that are not messages is one ordered list, `edges`, and `props.after` is gone; an empty operand keeps one empty row |
| 3 | Settled by the spike note, §2.2, adopted by [`notes/stage-3.md`](notes/stage-3.md): a sequence view's messages are inline, and a communication view keeps its own (row 12) |
| 3 | Settled by the spike note, §2.3, adopted by [`notes/stage-3.md`](notes/stage-3.md): activations nest by intervals (the five rules under the tables) |
| 4 | A transition that starts or ends on a region's border; entry and exit points are out of the subset |
| 5 | Ports on parts: `ends.<end>.part` against a path form; where a port sits is `present.<port>.side` and its order on that side |
| 5 | Whether a provided interface is always an `uml.Interface` node drawn as a ball, or may be a port's property |
| 6 | Timing: one time base for all lifelines, and whether the scale is linear |
| Later | References by id in place of text types; integrity across diagram types |
