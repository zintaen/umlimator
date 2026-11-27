# Typed diagrams

`umlimator/all` draws 28 diagram types in their own notation: UML, SysML, C4, BPMN, entity-relationship, flowchart, data flow, mindmap and cloud architecture diagrams. This page covers what all of them share: the entry point, the typed element envelope, typed views, `UmlPresent` and the shared UML props. Each type's own vocabulary, as `lib/umlimator.d.ts` types it, is on its page under [Diagrams](../types/index.md) ("How to write it"), with what it draws and checks, field by field ("What is drawn and left out"). Back to the [API reference](./index.md).

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
| `direction` | `'right'` or `'down'`. Default right; down for a flowchart, a profile, a SysML block definition or requirement view. A sequence view is always drawn down and a timing view always right; another direction is a warning. |
| `notation` | A repaint on one geometry: `crowsfoot` or `idef1x` for `er`, `yourdon` or `gane-sarson` for `dfd`. |
| `present` | Per element id, what the view shows of it: [`UmlPresent`](#umlpresent), [`UmlStructurePresent`](../types/uml-component.md#model), [`UmlTimingPresent`](../types/uml-timing.md#model), a side. |
| `fragments` | A sequence view's combined fragments. |
| `timeline` | A timing view's changes and constraints ([`UmlTimeline`](../types/uml-timing.md#model)). |
| `arrange`, `zones` | Layout by business flow, as on a map view ([`MapView`](./model-and-schema.md#mapview)); its elements take `zone` and its lines `flow`. Read where the type gives `flowRole` or `zoneOf` (C4, DFD, flowchart, activity, AWS, Google Cloud, Azure, BPMN, and the use case's zones): its dependency lines rank nothing, its main flow holds one row and its cards take their zones, each type's defaults as the [design note](../diagrams/notes/layout-flow.md)'s section 7.2 lists them; a line's own `flow` and an element's own `zone` win. Such a view is also laid out without the snake, without its type's default zones and ranked (as without `arrange`), and keeps the way that draws the fewest layout check problems, an arranged way where it draws no more than ranked: `arrange` never draws a view with more layout check problems than it has without it. That holds with pins too, and for BPMN (which ranks its own elements) and the use case (zones, no main flow): a view with pins keeps the way it takes without them, its other elements where they are there, unless that way is arranged and draws more with the pins than ranked does, so a card dropped where it was moves nothing. Another type reads neither, and `validate()` warns on `arrange` there (it changes nothing); a sequence, timing or mindmap view does not rank its elements, and `validate()` warns on `arrange` there too. |

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
against the profiles applied to the element's packages ([profile diagram](../types/uml-profile.md#model)).

## See also

- [Model and schema](./model-and-schema.md): the map fields a typed model shares.
- [Apply and commands](./apply-and-commands.md#command): editing typed elements.
- `docs/diagrams/model.md`: the design of schema version 2.
