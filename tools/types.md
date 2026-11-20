# How to write each diagram type

<!-- Read by tools/gallery.mjs: each "## <type id> ..." section below is the "How to write it" part of the page of each type it names, docs/types/<id>.md. Its links are relative to docs/types/. The shared fields (the element envelope, typed views, UmlPresent, shared UML props) are on docs/api/typed-diagrams.md. -->

## uml-class

`diagram: 'uml.class'`.

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

## uml-object

`diagram: 'uml.object'`.

| Type | Values |
|---|---|
| `UmlObjectElementType` | `uml.InstanceSpecification`, `uml.Package`, `uml.Comment` |
| `UmlObjectMemberType` | `uml.Slot` |
| `UmlObjectLineType` | `uml.Link`, `uml.CommentLink` |
| `UmlInstanceProps` | `classifier` (by name or qualified name, as text), `stereotypes` |
| `UmlSlotProps` | `value`, as text |
| `UmlLinkProps` | `association`, the roles at `ends.from` and `ends.to`, `stereotypes` |

## uml-package

`diagram: 'uml.package'`.

| Type | Values |
|---|---|
| `UmlPackageElementType` | `uml.Package`, `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType`, `uml.Comment` |
| `UmlPackageLineType` | `uml.PackageImport`, `uml.PackageMerge`, `uml.Dependency`, `uml.CommentLink` |
| `UmlPackageImportProps` | `visibility`: `public` (drawn «import», the default) or `private` («access») |

## uml-sequence

`diagram: 'uml.sequence'`. Lifelines are listed left to right in `nodeIds`; messages and interaction uses are inline in the view's `edges`, in time order; combined fragments are in the view's `fragments`, each with its operands as `members`.

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

## uml-communication

`diagram: 'uml.communication'`. The view's `edges` lists connectors, then messages in order; message numbers are derived. Message props are `UmlMessageProps`.

| Type | Values |
|---|---|
| `UmlCommunicationElementType` | `uml.Lifeline` |
| `UmlCommunicationLineType` | `uml.Connector`, `uml.Message` |

## uml-use-case

`diagram: 'uml.use-case'`.

| Type | Values |
|---|---|
| `UmlUseCaseElementType` | `uml.Actor`, `uml.UseCase`, `uml.Subject`, `uml.Comment` |
| `UmlUseCaseMemberType` | `uml.ExtensionPoint` |
| `UmlUseCaseLineType` | `uml.Association`, `uml.Include`, `uml.Extend`, `uml.Generalization`, `uml.CommentLink` |
| `UmlExtendProps` | `extensionPoints` (ids, one at least), `condition`, `stereotypes` |

## uml-activity

`diagram: 'uml.activity'`. A node's `parent` is its partition, drawn as a lane.

| Type | Values |
|---|---|
| `UmlActivityElementType` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.Action`, `uml.CallBehaviorAction`, `uml.SendSignalAction`, `uml.AcceptEventAction`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.ObjectNode`, `uml.DataStoreNode`, `uml.ActivityPartition`, `uml.Comment` |
| `UmlActivityLineType` | `uml.ControlFlow`, `uml.ObjectFlow`, `uml.CommentLink` |
| `UmlFlowProps` | `guard` (drawn `name [guard]`), `stereotypes` |

## uml-state-machine

`diagram: 'uml.state-machine'`.

| Type | Values |
|---|---|
| `UmlStateMachineElementType` | `uml.State`, `uml.Pseudostate`, `uml.FinalState`, `uml.Comment` |
| `UmlStateMachineMemberType` | `uml.Region`, `uml.InternalTransition` |
| `UmlStateMachineLineType` | `uml.Transition`, `uml.CommentLink` |
| `UmlStateProps` | `entry`, `do`, `exit`, `stereotypes` |
| `UmlPseudostateKind` | `initial`, `choice`, `junction`, `fork`, `join`, `shallowHistory`, `deepHistory`, `terminate` |
| `UmlPseudostateProps` | `kind`, `stereotypes` |
| `UmlTransitionProps` | `trigger`, `guard`, `effect` (drawn `trigger [guard] / effect`), `stereotypes` |

## uml-interaction-overview

`diagram: 'uml.interaction-overview'`. Flows take `UmlFlowProps`; an interaction use's or inline interaction's `opensView` names a `uml.sequence` view.

| Type | Values |
|---|---|
| `UmlInteractionOverviewElementType` | `uml.InitialNode`, `uml.ActivityFinalNode`, `uml.FlowFinalNode`, `uml.DecisionNode`, `uml.MergeNode`, `uml.ForkNode`, `uml.JoinNode`, `uml.InteractionUse`, `uml.Interaction`, `uml.Comment` |
| `UmlInteractionOverviewLineType` | `uml.ControlFlow`, `uml.CommentLink` |

## uml-component

`diagram: 'uml.component'`.

| Type | Values |
|---|---|
| `UmlComponentElementType` | `uml.Component`, `uml.Interface`, `uml.Artifact`, `uml.Package`, `uml.Comment` |
| `UmlComponentMemberType` | `uml.Port` |
| `UmlComponentLineType` | `uml.InterfaceRealization`, `uml.ComponentRealization`, `uml.Usage`, `uml.Connector`, `uml.Dependency`, `uml.Manifestation`, `uml.CommentLink` |
| `UmlPortProps` | `valueType` (drawn `name : Type`), `stereotypes` |
| `UmlConnectorProps` | `kind` (`assembly`, the default, or `delegation`); in a composite structure view, `ends.from.part` or `ends.to.part`; `stereotypes` |
| `UmlStructurePresent` | `as: 'ball'` (an interface as a ball), a port's `side`, and on a part each of its type's `ports`' sides |

## uml-deployment

`diagram: 'uml.deployment'`.

| Type | Values |
|---|---|
| `UmlDeploymentElementType` | `uml.Node`, `uml.Device`, `uml.ExecutionEnvironment`, `uml.Artifact`, `uml.DeploymentSpecification`, `uml.Component`, `uml.Comment` |
| `UmlDeploymentLineType` | `uml.Deployment`, `uml.Manifestation`, `uml.CommunicationPath`, `uml.Dependency`, `uml.CommentLink` |

## uml-composite-structure

`diagram: 'uml.composite-structure'`. The view's `subject` is drawn as a box holding its parts and collaboration uses.

| Type | Values |
|---|---|
| `UmlCompositeStructureElementType` | `uml.Class`, `uml.Component`, `uml.Collaboration`, `uml.CollaborationUse`, `uml.Comment` |
| `UmlCompositeStructureMemberType` | `uml.Property` (a part or role), `uml.Port` |
| `UmlCompositeStructureLineType` | `uml.Connector`, `uml.RoleBinding`, `uml.CommentLink` |
| `UmlPartProps` | `valueType`, `multiplicity`, `aggregation` (`composite`, `shared`: drawn dashed), `stereotypes` |
| `UmlCollaborationUseProps` | `collaboration`, `stereotypes` |

## uml-profile

`diagram: 'uml.profile'`.

| Type | Values |
|---|---|
| `UmlProfileElementType` | `uml.Profile`, `uml.Stereotype`, `uml.MetaclassReference`, `uml.Enumeration`, `uml.Package`, `uml.Comment` |
| `UmlProfileMemberType` | `uml.Property` (a tag definition), `uml.EnumerationLiteral` |
| `UmlProfileLineType` | `uml.Extension`, `uml.ProfileApplication`, `uml.Generalization`, `uml.CommentLink` |
| `UmlStereotypeProps` | `isAbstract` |
| `UmlExtensionProps` | `isRequired` |

## uml-timing

`diagram: 'uml.timing'`. Lifelines are listed top to bottom in `nodeIds`; messages are inline in the view's `edges`; changes and constraints are in its `timeline`.

| Type | Values |
|---|---|
| `UmlTimingElementType` | `uml.Lifeline` |
| `UmlTimingLineType` | `uml.Message` |
| `UmlTimingLifelineProps` | `represents`, `states` (top to bottom), `stereotypes`, `tags` |
| `UmlTimingMessageProps` | `sort` (`call`, `async`, `reply`), `replyTo`, `sentAt`, `receivedAt`, `stereotypes` |
| `UmlTimeline` | `unit`, `changes`, `constraints` |
| `UmlTimingChange` | `{ id, lifeline, at, state }` |
| `UmlTimingConstraint` | `{ id, type, from, to, label }`, `type` `uml.DurationConstraint` or `uml.TimeConstraint` |
| `UmlTimingPresent` | `as: 'values'`: a value lifeline |

## uml-information-flow

`diagram: 'uml.information-flow'`.

| Type | Values |
|---|---|
| `UmlInformationFlowElementType` | `uml.Class`, `uml.Interface`, `uml.Component`, `uml.Actor`, `uml.InformationItem`, `uml.Comment` |
| `UmlInformationFlowLineType` | `uml.InformationFlow`, `uml.CommentLink` |
| `UmlInformationFlowProps` | `conveyed` (ids of items or classifiers) |

## er

`diagram: 'er'`. `notation`: `crowsfoot` (default) or `idef1x`.

| Type | Values |
|---|---|
| `ErElementType` | `er.Entity`, `uml.Comment` |
| `ErMemberType` | `er.Column` |
| `ErLineType` | `er.Relationship` (from the referenced entity to the referring one), `uml.CommentLink` |
| `ErColumnProps` | `dataType`, `primaryKey`, `foreignKey`, `references` (a column id), `nullable`, `unique` |
| `ErRelationshipProps` | `identifying`, `ends.from.multiplicity`, `ends.to.multiplicity` |

## flowchart

`diagram: 'flowchart'`. Laid out down by default.

| Type | Values |
|---|---|
| `FlowchartElementType` | `flow.Terminator`, `flow.Process`, `flow.Decision`, `flow.InputOutput`, `flow.PredefinedProcess`, `flow.Document`, `flow.Database`, `flow.ManualInput`, `flow.Delay`, `flow.Connector`, `uml.Comment` |
| `FlowchartLineType` | `flow.Flow`, `uml.CommentLink` |

## dfd

`diagram: 'dfd'`. `notation`: `yourdon` (default) or `gane-sarson`. A process's `opensView` names its level.

| Type | Values |
|---|---|
| `DfdElementType` | `dfd.Process`, `dfd.DataStore`, `dfd.ExternalEntity`, `uml.Comment` |
| `DfdLineType` | `dfd.DataFlow`, `uml.CommentLink` |
| `DfdNumberProps` | `number` (`1`, `1.2`, `D1`) |

## c4

`diagram` one of the six `C4ViewType` values.

| Type | Values |
|---|---|
| `C4ViewType` | `c4.landscape`, `c4.context`, `c4.container`, `c4.component`, `c4.dynamic`, `c4.deployment` |
| `C4ElementType` | `c4.Person`, `c4.SoftwareSystem`, `c4.Container`, `c4.Component`, `c4.DeploymentNode`, `c4.ContainerInstance`, `uml.Comment` |
| `C4LineType` | `c4.Relationship` (its `label` the description), `uml.CommentLink` |
| `C4ElementProps` | `description`, `technology`, `external`, `shape` (a card [`Shape`](../api/model-and-schema.md#shape) other than `node`, which is the deployment view's: `box`, `person`, `robot`, `browser`, `window`, `terminal`, `mobile`, `cylinder`, `pipe`, `folder`, `document` or `hexagon`; any other name draws the default, `person` for a person and `box` for the rest), `container` (an instance's container) |
| `C4RelationshipProps` | `technology` |

## sysml-requirement sysml-block-definition sysml-internal-block sysml-parametric

`diagram` one of the four `SysmlViewType` values.

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

## mindmap

`diagram: 'mindmap'`. Topics only, the tree by `parent`; a first-level topic's half in `present.<id>.side`.

| Type | Values |
|---|---|
| `MindmapElementType` | `mindmap.Topic` |

## gcp azure aws

`diagram: 'gcp'`, `'azure'` or `'aws'`. Groups own what they hold by `parent`. A service's icon is drawn from the model's `icons` table at `<pack>/<props.icon>`, else as a glyph with its full name; the module never fetches an icon.

| Type | Values |
|---|---|
| `GcpElementType` | `gcp.Zone`, `gcp.Product`, `gcp.User` |
| `GcpLineType` | `gcp.Path` |
| `AzureElementType` | `azure.Group`, `azure.Service` |
| `AzureLineType` | `azure.Connector` |
| `AwsElementType` | `aws.Group`, `aws.Service`, `aws.Resource` |
| `AwsLineType` | `aws.Connection` |
| `CloudElementProps` | `zoneType` (on `gcp.Zone`), `groupType` (on `azure.Group` and `aws.Group`), `icon` (the pinned pack's own id, such as `Cloud-Run`) |

## bpmn

`diagram: 'bpmn'`. A pool owns its lanes as members; a flow node's `parent` is its innermost lane, its pool, its sub-process or none.

| Type | Values |
|---|---|
| `BpmnElementType` | `bpmn.Participant`, `bpmn.Task`, `bpmn.SubProcess`, `bpmn.CallActivity`, `bpmn.StartEvent`, `bpmn.EndEvent`, `bpmn.IntermediateCatchEvent`, `bpmn.IntermediateThrowEvent`, `bpmn.BoundaryEvent`, `bpmn.ExclusiveGateway`, `bpmn.ParallelGateway`, `bpmn.DataObject`, `bpmn.DataStoreReference`, `bpmn.TextAnnotation`, `bpmn.Group` |
| `BpmnMemberType` | `bpmn.Lane` |
| `BpmnLineType` | `bpmn.SequenceFlow`, `bpmn.MessageFlow`, `bpmn.Association`, `bpmn.DataAssociation` |
| `BpmnElementProps` | `documentation`, `processRef`, `taskType` (`none`, `user`, `service`), `definition` (`none`, `message`, `timer`, `terminate`), `attachedTo`, `cancelActivity`, `calledElement`, `dataStoreRef`, `categoryValueRef` |
| `BpmnLineProps` | `documentation`, `direction` (`none`, `one`, `both`: an association's arrowheads) |
