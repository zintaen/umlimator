# Typed diagrams

`umlimator/all` draws 28 diagram types in their own notation: UML, SysML, C4, BPMN, entity-relationship, flowchart, data
flow, mindmap and cloud architecture diagrams. This page covers the entry point, the typed element envelope, typed
views, and each type's vocabulary as `lib/umlimator.d.ts` types it. Each type's conformance note says what it draws and
checks, field by field. Back to the [API reference](./index.md).

## umlimator/all

```js
import { render, apply, history, validate, describe } from 'umlimator/all';
```

`umlimator/all` has the same exports and types as `umlimator`, and draws every diagram type. `umlimator` alone draws
maps, and a typed view as plain cards with a console warning, so a page that shows only maps stays smaller. Every
function works on typed models too: [`validate()`](./apply-and-commands.md#validate) checks each type's rules,
[`apply()`](./apply-and-commands.md#apply) follows each type's references when it deletes, and
[`describe()`](./apply-and-commands.md#describe) and [`diff()`](./apply-and-commands.md#diff) speak each type's terms.

On a typed view, editing gestures (with `editable`) emit an [`edit`](./events-and-state.md#edit) event: a transaction
of [commands](./apply-and-commands.md#command) for the host to apply.

```js
import { render, apply, history } from 'umlimator/all';

const steps = history(model);
const map = render(el, model, {
  view: 'classes',
  editable: true,
  on: { edit: e => map.update(steps.push(apply(steps.model, e.commands))) },
});
```

`examples/class-editor.html` is a working editor. [`<umlimator-map>`](./element-and-plugins.md#umlimator-map) loads
`umlimator-all.js` by itself for a model of schema version 2.

## Element

```ts
interface Element {
  id: string; type: string; label?: string; parent?: string; props?: Record<string, unknown>; members?: Element[];
  [key: string]: unknown;
}
```

A model with `"schemaVersion": 2` may hold typed elements: nodes, members, typed edges and fragments, all in this one
envelope and one id space (an id never contains `->`).

| Field | What it is |
|---|---|
| `id` | Unique across the whole model. |
| `type` | What it is, as `<family>.<Name>`: `uml.Class`, `er.Entity`, `bpmn.Task`. The tables below list each type's. |
| `label` | Its name. |
| `parent` | The element that owns it: a package, a lane, a group, a state, a software system. |
| `props` | The type's own fields, typed below as each type's `...Props`. A field written otherwise is kept as it is, and `validate()` reports what breaks the type's rules. |
| `members` | Elements it holds in order: attributes and operations, columns, ports, lanes, regions. |

A typed edge is an Element with `from` and `to`, which may name a member.

```json
{
  "schemaVersion": 2,
  "nodes": [
    { "id": "order", "type": "uml.Class", "label": "Order",
      "members": [{ "id": "order.total", "type": "uml.Property", "label": "total", "props": { "valueType": "Money" } }] },
    { "id": "customer", "type": "uml.Class", "label": "Customer" }
  ],
  "edges": [
    { "id": "places", "type": "uml.Association", "from": "customer", "to": "order",
      "props": { "ends": { "to": { "multiplicity": "*" } } } }
  ],
  "views": [{ "id": "classes", "diagram": "uml.class", "nodeIds": ["order", "customer"], "edges": ["places"] }]
}
```

## Views

A typed view is a [`MapView`](./model-and-schema.md#mapview) with `diagram` set to one of the values below. It may also
have:

| Field | What it is |
|---|---|
| `subject` | The element the view shows the inside of: a package, a C4 system or container, a composite structure's class, a SysML frame's block. |
| `direction` | `'right'` or `'down'`. Default right; down for a flowchart, a profile, a SysML block definition or requirement view. A sequence view is always drawn down. |
| `notation` | A repaint on one geometry: `crowsfoot` or `idef1x` for `er`, `yourdon` or `gane-sarson` for `dfd`. |
| `present` | Per element id, what the view shows of it: [`UmlPresent`](#umlpresent), [`UmlStructurePresent`](#component-diagram), [`UmlTimingPresent`](#timing-diagram), a side. |
| `fragments` | A sequence view's combined fragments. |
| `timeline` | A timing view's changes and constraints ([`UmlTimeline`](#timing-diagram)). |

A view whose `diagram` is a type the release does not draw shows its nodes as plain cards, with a warning.

## UmlPresent

```ts
interface UmlPresent { collapsed?: ('attributes' | 'operations' | 'literals' | 'activities')[]; rows?: number }
```

What a typed view shows of one element, in its `present` by the element's id: compartments not drawn, and at most
`rows` rows in each, then "+k more".

```json
"present": { "order": { "collapsed": ["operations"], "rows": 5 } }
```

## Shared UML props

```ts
type UmlTags = Record<string, Record<string, string>>;
interface UmlStereotypedProps { stereotypes?: string[]; tags?: UmlTags; [key: string]: unknown }
type UmlVisibility = 'public' | 'private' | 'protected' | 'package';
```

Any UML element may have `stereotypes` (a name, or `Profile::name`), drawn in guillemets, and their tagged values in
`tags`, by stereotype then tag name, each value as text: `{ "column": { "name": "placed_at" } }`. Tags are checked
against the profiles applied to the element's packages ([profile diagram](#profile-diagram)).

## The types

Each section names the view's `diagram`, the types its elements, members and lines may have, and its props types. The
props types describe `props`; every field in them is optional.

### Class diagram

`diagram: 'uml.class'`. [Conformance](../conformance/uml-class.md).

| Type | Values |
|---|---|
| `UmlClassElementType` | `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType`, `uml.Package`, `uml.Comment` |
| `UmlClassMemberType` | `uml.Property`, `uml.Operation`, `uml.EnumerationLiteral` |
| `UmlClassLineType` | `uml.Association`, `uml.Generalization`, `uml.InterfaceRealization`, `uml.Dependency`, `uml.CommentLink` (from client to supplier) |
| `UmlClassifierProps` | `isAbstract`, `stereotypes` |
| `UmlPropertyProps` | `visibility`, `valueType`, `multiplicity`, `default`, `isStatic`, `isDerived`, `stereotypes`: `+ {static} /total: Money [1] = 0` as fields |
| `UmlOperationProps` | `visibility`, `parameters` (`name`, `valueType`, `direction`), `returnType`, `isStatic`, `isAbstract`, `stereotypes` |
| `UmlLineProps` | `ends.from` and `ends.to`, each a `UmlAssociationEnd`; `stereotypes` |
| `UmlAssociationEnd` | `role`, `multiplicity` (`1`, `*`, `n..m`, `n..*`), `aggregation` (`none`, `shared`, `composite`), `navigable` |

### Object diagram

`diagram: 'uml.object'`. [Conformance](../conformance/uml-object.md).

| Type | Values |
|---|---|
| `UmlObjectElementType` | `uml.InstanceSpecification`, `uml.Package`, `uml.Comment` |
| `UmlObjectMemberType` | `uml.Slot` |
| `UmlObjectLineType` | `uml.Link`, `uml.CommentLink` |
| `UmlInstanceProps` | `classifier` (by name or qualified name, as text), `stereotypes` |
| `UmlSlotProps` | `value`, as text |
| `UmlLinkProps` | `association`, the roles at `ends.from` and `ends.to`, `stereotypes` |

### Package diagram

`diagram: 'uml.package'`. [Conformance](../conformance/uml-package.md).

| Type | Values |
|---|---|
| `UmlPackageElementType` | `uml.Package`, `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType`, `uml.Comment` |
| `UmlPackageLineType` | `uml.PackageImport`, `uml.PackageMerge`, `uml.Dependency`, `uml.CommentLink` |
| `UmlPackageImportProps` | `visibility`: `public` (drawn «import», the default) or `private` («access») |

### Sequence diagram

`diagram: 'uml.sequence'`. [Conformance](../conformance/uml-sequence.md). Lifelines are listed left to right in
`nodeIds`; messages and interaction uses are inline in the view's `edges`, in time order; combined fragments are in the
view's `fragments`, each with its operands as `members`.

| Type | Values |
|---|---|
| `UmlSequenceElementType` | `uml.Lifeline`, `uml.InteractionUse`, `uml.CombinedFragment` |
| `UmlSequenceMemberType` | `uml.InteractionOperand` (its `label` the guard) |
| `UmlSequenceLineType` | `uml.Message` |
| `UmlLifelineProps` | `represents` (drawn `name : Type`), `stereotypes` (`actor` draws «actor») |
| `UmlMessageSort` | `call` (the default), `async`, `reply`, `create`, `delete` |
| `UmlMessageProps` | `sort`, `replyTo` (the call a reply answers), `stereotypes` |
| `UmlInteractionUseProps` | `covers` (lifeline ids), `refersTo` (a view) |
| `UmlInteractionOperator` | `alt`, `opt`, `loop`, `par`, `break` |
| `UmlCombinedFragmentProps` | `operator` |

### Communication diagram

`diagram: 'uml.communication'`. [Conformance](../conformance/uml-communication.md). The view's `edges` lists connectors,
then messages in order; message numbers are derived. Message props are `UmlMessageProps`.

| Type | Values |
|---|---|
| `UmlCommunicationElementType` | `uml.Lifeline` |
| `UmlCommunicationLineType` | `uml.Connector`, `uml.Message` |

### Use case diagram

`diagram: 'uml.use-case'`. [Conformance](../conformance/uml-use-case.md).

| Type | Values |
|---|---|
| `UmlUseCaseElementType` | `uml.Actor`, `uml.UseCase`, `uml.Subject`, `uml.Comment` |
| `UmlUseCaseMemberType` | `uml.ExtensionPoint` |
| `UmlUseCaseLineType` | `uml.Association`, `uml.Include`, `uml.Extend`, `uml.Generalization`, `uml.CommentLink` |
| `UmlExtendProps` | `extensionPoints` (ids, one at least), `condition`, `stereotypes` |

### Activity diagram

`diagram: 'uml.activity'`. [Conformance](../conformance/uml-activity.md). A node's `parent` is its partition, drawn as a
lane.

| Type | Values |
|---|---|
| `UmlActivityElementType` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.Action`, `uml.CallBehaviorAction`, `uml.SendSignalAction`, `uml.AcceptEventAction`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.ObjectNode`, `uml.DataStoreNode`, `uml.ActivityPartition`, `uml.Comment` |
| `UmlActivityLineType` | `uml.ControlFlow`, `uml.ObjectFlow`, `uml.CommentLink` |
| `UmlFlowProps` | `guard` (drawn `name [guard]`), `stereotypes` |

### State machine diagram

`diagram: 'uml.state-machine'`. [Conformance](../conformance/uml-state-machine.md).

| Type | Values |
|---|---|
| `UmlStateMachineElementType` | `uml.State`, `uml.Pseudostate`, `uml.FinalState`, `uml.Comment` |
| `UmlStateMachineMemberType` | `uml.Region`, `uml.InternalTransition` |
| `UmlStateMachineLineType` | `uml.Transition`, `uml.CommentLink` |
| `UmlStateProps` | `entry`, `do`, `exit`, `stereotypes` |
| `UmlPseudostateKind` | `initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate` |
| `UmlPseudostateProps` | `kind`, `stereotypes` |
| `UmlTransitionProps` | `trigger`, `guard`, `effect` (drawn `trigger [guard] / effect`), `stereotypes` |

### Interaction overview diagram

`diagram: 'uml.interaction-overview'`. [Conformance](../conformance/uml-interaction-overview.md). Flows take
`UmlFlowProps`; an interaction use's or inline interaction's `opensView` names a `uml.sequence` view.

| Type | Values |
|---|---|
| `UmlInteractionOverviewElementType` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.InteractionUse`, `uml.Interaction`, `uml.Comment` |
| `UmlInteractionOverviewLineType` | `uml.ControlFlow`, `uml.CommentLink` |

### Component diagram

`diagram: 'uml.component'`. [Conformance](../conformance/uml-component.md).

| Type | Values |
|---|---|
| `UmlComponentElementType` | `uml.Component`, `uml.Interface`, `uml.Artifact`, `uml.Package`, `uml.Comment` |
| `UmlComponentMemberType` | `uml.Port` |
| `UmlComponentLineType` | `uml.InterfaceRealization`, `uml.ComponentRealization`, `uml.Usage`, `uml.Connector`, `uml.Dependency`, `uml.Manifestation`, `uml.CommentLink` |
| `UmlPortProps` | `valueType` (drawn `name : Type`), `stereotypes` |
| `UmlConnectorProps` | `kind` (`assembly`, the default, or `delegation`); in a composite structure view, `ends.from.part` or `ends.to.part`; `stereotypes` |
| `UmlStructurePresent` | `as: 'ball'` (an interface as a ball), a port's `side`, and on a part each of its type's `ports`' sides |

### Deployment diagram

`diagram: 'uml.deployment'`. [Conformance](../conformance/uml-deployment.md).

| Type | Values |
|---|---|
| `UmlDeploymentElementType` | `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component`, `uml.Comment` |
| `UmlDeploymentLineType` | `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency`, `uml.CommentLink` |

### Composite structure diagram

`diagram: 'uml.composite-structure'`. [Conformance](../conformance/uml-composite-structure.md). The view's `subject` is
drawn as a box holding its parts and collaboration uses.

| Type | Values |
|---|---|
| `UmlCompositeStructureElementType` | `uml.Class`, `uml.Component`, `uml.Collaboration`, `uml.CollaborationUse`, `uml.Comment` |
| `UmlCompositeStructureMemberType` | `uml.Property` (a part or role), `uml.Port` |
| `UmlCompositeStructureLineType` | `uml.Connector`, `uml.RoleBinding`, `uml.CommentLink` |
| `UmlPartProps` | `valueType`, `multiplicity`, `aggregation` (`composite`, `shared`: drawn dashed), `stereotypes` |
| `UmlCollaborationUseProps` | `collaboration`, `stereotypes` |

### Profile diagram

`diagram: 'uml.profile'`. [Conformance](../conformance/uml-profile.md).

| Type | Values |
|---|---|
| `UmlProfileElementType` | `uml.Profile`, `uml.Stereotype`, `uml.MetaclassReference`, `uml.Enumeration`, `uml.Package`, `uml.Comment` |
| `UmlProfileMemberType` | `uml.Property` (a tag definition), `uml.EnumerationLiteral` |
| `UmlProfileLineType` | `uml.Extension`, `uml.ProfileApplication`, `uml.Generalization`, `uml.CommentLink` |
| `UmlStereotypeProps` | `isAbstract` |
| `UmlExtensionProps` | `isRequired` |

### Timing diagram

`diagram: 'uml.timing'`. [Conformance](../conformance/uml-timing.md). Lifelines are listed top to bottom in `nodeIds`;
messages are inline in the view's `edges`; changes and constraints are in its `timeline`.

| Type | Values |
|---|---|
| `UmlTimingElementType` | `uml.Lifeline` |
| `UmlTimingLineType` | `uml.Message` |
| `UmlTimingLifelineProps` | `represents`, `states` (top to bottom), `stereotypes`, `tags` |
| `UmlTimingMessageProps` | `sort` (`call`, `async`, `reply`), `replyTo`, `sentAt`, `receivedAt` |
| `UmlTimeline` | `unit`, `changes`, `constraints` |
| `UmlTimingChange` | `{ id, lifeline, at, state }` |
| `UmlTimingConstraint` | `{ id, type, from, to, label }`, `type` `uml.DurationConstraint` or `uml.TimeConstraint` |
| `UmlTimingPresent` | `as: 'values'`: a value lifeline |

### Information flow diagram

`diagram: 'uml.information-flow'`. [Conformance](../conformance/uml-information-flow.md).

| Type | Values |
|---|---|
| `UmlInformationFlowElementType` | `uml.Class`, `uml.Interface`, `uml.Component`, `uml.Actor`, `uml.InformationItem`, `uml.Comment` |
| `UmlInformationFlowLineType` | `uml.InformationFlow`, `uml.CommentLink` |
| `UmlInformationFlowProps` | `conveyed` (ids of items or classifiers) |

### Entity-relationship diagram

`diagram: 'er'`. [Conformance](../conformance/er.md). `notation`: `crowsfoot` (default) or `idef1x`.

| Type | Values |
|---|---|
| `ErElementType` | `er.Entity`, `uml.Comment` |
| `ErMemberType` | `er.Column` |
| `ErLineType` | `er.Relationship` (from the referenced entity to the referring one), `uml.CommentLink` |
| `ErColumnProps` | `dataType`, `primaryKey`, `foreignKey`, `references` (a column id), `nullable`, `unique` |
| `ErRelationshipProps` | `identifying`, `ends.from.multiplicity`, `ends.to.multiplicity` |

### Flowchart

`diagram: 'flowchart'`. [Conformance](../conformance/flowchart.md). Laid out down by default.

| Type | Values |
|---|---|
| `FlowchartElementType` | `flow.Terminator`, `flow.Process`, `flow.Decision`, `flow.InputOutput`, `flow.PredefinedProcess`, `flow.Document`, `flow.Database`, `flow.ManualInput`, `flow.Delay`, `flow.Connector`, `uml.Comment` |
| `FlowchartLineType` | `flow.Flow`, `uml.CommentLink` |

### Data flow diagram

`diagram: 'dfd'`. [Conformance](../conformance/dfd.md). `notation`: `yourdon` (default) or `gane-sarson`. A process's
`opensView` names its level.

| Type | Values |
|---|---|
| `DfdElementType` | `dfd.Process`, `dfd.DataStore`, `dfd.ExternalEntity`, `uml.Comment` |
| `DfdLineType` | `dfd.DataFlow`, `uml.CommentLink` |
| `DfdNumberProps` | `number` (`1`, `1.2`, `D1`) |

### C4

`diagram` one of the six `C4ViewType` values. [Conformance](../conformance/c4.md).

| Type | Values |
|---|---|
| `C4ViewType` | `c4.landscape`, `c4.context`, `c4.container`, `c4.component`, `c4.dynamic`, `c4.deployment` |
| `C4ElementType` | `c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`, `c4.ContainerInstance`, `uml.Comment` |
| `C4LineType` | `c4.Relationship` (its `label` the description), `uml.CommentLink` |
| `C4ElementProps` | `description`, `technology`, `external`, `shape` (a card [`Shape`](./model-and-schema.md#shape) other than `node`, which is the deployment view's: `box`, `person`, `robot`, `browser`, `window`, `terminal`, `mobile`, `cylinder`, `pipe`, `folder`, `document` or `hexagon`; any other name draws the default, `person` for a person and `box` for the rest), `container` (an instance's container) |
| `C4RelationshipProps` | `technology` |

### SysML

`diagram` one of the four `SysmlViewType` values. Conformance:
[requirement](../conformance/sysml-requirement.md), [block definition](../conformance/sysml-block-definition.md),
[internal block](../conformance/sysml-internal-block.md), [parametric](../conformance/sysml-parametric.md).

| Type | Values |
|---|---|
| `SysmlViewType` | `sysml.requirement`, `sysml.block-definition`, `sysml.internal-block`, `sysml.parametric` |
| `SysmlElementType` | `sysml.Requirement`, `sysml.TestCase`, `sysml.Block`, `sysml.InterfaceBlock`, `sysml.ConstraintBlock`, `sysml.ValueType`, `uml.Package`, `uml.Comment` |
| `SysmlMemberType` | `sysml.PartProperty`, `sysml.ReferenceProperty`, `sysml.ValueProperty`, `sysml.ConstraintProperty`, `sysml.Port`, `sysml.FlowProperty`, `sysml.ConstraintParameter`, `uml.Operation` |
| `SysmlLineType` | `sysml.DeriveReqt`, `sysml.Satisfy`, `sysml.Verify`, `sysml.Refine`, `sysml.Trace`, `sysml.Copy`, `sysml.Connector`, `sysml.BindingConnector`, `uml.Association`, `uml.Generalization`, `uml.Dependency`, `uml.CommentLink` |
| `SysmlRequirementProps` | `reqId`, `text`, `risk` (`low`, `medium`, `high`), `verifyMethod`, `stereotypes` |
| `SysmlClassifierProps` | `constraint` (a constraint block's), `unit`, `quantityKind` (a value type's) |
| `SysmlPortProps` | `kind` (`proxy`, `full`), `valueType` (`~` before it conjugates) |
| `SysmlFlowPropertyProps` | `direction` (`in`, `out`, `inout`), `valueType` |
| `SysmlConnectorProps` | `ends.from.part`, `ends.to.part`, `itemFlow` |
| `SysmlItemFlow` | `{ item, direction }`, `direction` `from-to` or `to-from` |

### Mindmap

`diagram: 'mindmap'`. [Conformance](../conformance/mindmap.md). Topics only, the tree by `parent`; a first-level topic's
half in `present.<id>.side`.

| Type | Values |
|---|---|
| `MindmapElementType` | `mindmap.Topic` |

### Cloud architecture

`diagram: 'gcp'`, `'azure'` or `'aws'`. Conformance: [Google Cloud](../conformance/gcp.md), [Azure](../conformance/azure.md),
[AWS](../conformance/aws.md). Groups own what they hold by `parent`. A service's icon is drawn from the model's `icons`
table at `<pack>/<props.icon>`, else as a glyph with its full name; the module never fetches an icon.

| Type | Values |
|---|---|
| `GcpElementType` | `gcp.Zone`, `gcp.Product`, `gcp.User` |
| `GcpLineType` | `gcp.Path` |
| `AzureElementType` | `azure.Group`, `azure.Service` |
| `AzureLineType` | `azure.Connector` |
| `AwsElementType` | `aws.Group`, `aws.Service`, `aws.Resource` |
| `AwsLineType` | `aws.Connection` |
| `CloudElementProps` | `zoneType` (on `gcp.Zone`), `groupType` (on `azure.Group` and `aws.Group`), `icon` (the pinned pack's own id, such as `Cloud-Run`) |

### BPMN

`diagram: 'bpmn'`. [Conformance](../conformance/bpmn.md). A pool owns its lanes as members; a flow node's `parent` is
its innermost lane, its pool, its sub-process or none.

| Type | Values |
|---|---|
| `BpmnElementType` | `bpmn.Participant`, `bpmn.Task`, `bpmn.SubProcess`, `bpmn.CallActivity`, `bpmn.StartEvent`, `bpmn.EndEvent`, `bpmn.IntermediateCatchEvent`, `bpmn.IntermediateThrowEvent`, `bpmn.BoundaryEvent`, `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway`, `bpmn.DataObject`, `bpmn.DataStoreReference`, `bpmn.TextAnnotation`, `bpmn.Group` |
| `BpmnMemberType` | `bpmn.Lane` |
| `BpmnLineType` | `bpmn.SequenceFlow`, `bpmn.MessageFlow`, `bpmn.Association`, `bpmn.DataAssociation` |
| `BpmnElementProps` | `documentation`, `processRef`, `taskType` (`none`, `user`, `service`), `definition` (`none`, `message`, `timer`, `terminate`), `attachedTo`, `cancelActivity`, `calledElement`, `dataStoreRef`, `categoryValueRef` |
| `BpmnLineProps` | `documentation`, `direction` (`none`, `one`, `both`: an association's arrowheads) |

## See also

- [Model and schema](./model-and-schema.md): the map fields a typed model shares.
- [Apply and commands](./apply-and-commands.md#command): editing typed elements.
- `docs/diagrams/model.md`: the design of schema version 2.
