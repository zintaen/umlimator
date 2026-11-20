# Apply and commands

Changing a model with commands, keeping undo, and reading a model: its problems, broken rules, changes, drift, paths
and words. Every function here is pure and runs in Node or a browser with no DOM. Back to the [API reference](./index.md).

The examples use this model:

```js
const model = {
  title: 'Shop', root: 'system',
  nodes: [
    { id: 'web', label: 'Web app', kind: 'frontend' },
    { id: 'api', label: 'Shop API', kind: 'backend', owner: 'orders' },
    { id: 'db', label: 'Orders DB', kind: 'database', owner: 'orders' },
  ],
  edges: [
    { id: 'web-api', from: 'web', to: 'api', label: 'calls', latency: 40 },
    { id: 'api-db', from: 'api', to: 'db', label: 'reads', kind: 'state', latency: 5 },
  ],
  views: [{ id: 'system', title: 'System', nodeIds: ['web', 'api', 'db'], edges: ['web-api', 'api-db'] }],
};
```

## apply

```ts
function apply<M extends MapModel>(model: M, commands: Command | Command[]): M;
```

The model after a transaction: one [`Command`](#command), or a list run in order, on a copy. It is all or nothing: a
command that cannot run throws, and none of the transaction is applied. The model passed in is never changed.

| Parameter | What it is |
|---|---|
| `model` | The model to start from. |
| `commands` | One command or a list, run in order. |

Returns the next model. Undo is the model before: keep it with [`history()`](#history).

`delete` takes with it the element's members, what it owns, the lines to them and every place that names them (see [`references()`](#references)); one already gone in the same transaction is passed over. `hide` takes an element out of one view, with everything the view says of it. It refuses the view's `subject`, or an element that holds the subject as a member, and says why: change the view's subject with `set`, or delete the element from the model. It also refuses an element that lives only in that view (the view's own node or line, from `add` with `in: 'view'`), since hiding it would delete it: use `delete`. A member is shown with its owner, so `hide` of one is refused too: collapse its compartment with `set` of `present`, or delete it.

```js
import { apply } from 'umlimator';

const next = apply(model, [
  { op: 'set', id: 'api', path: 'label', value: 'Orders API' },
  { op: 'add', element: { id: 'cache', label: 'Cache', kind: 'database' }, view: 'system' },
  { op: 'delete', id: 'db' },
]);
map.update(next);
```

```js
try { apply(model, { op: 'delete', id: 'ghost' }); }
catch (err) { console.log(err.message); }   // delete: "ghost" is not an element
```

On a typed view, editing gestures emit an [`edit`](./events-and-state.md#edit) event whose `commands` the host passes
to `apply()`. A map view emits [`change`](./events-and-state.md#change) instead, which the host turns into its own
update (or into commands).

## Command

```ts
type Command =
  | { op: 'set'; id: string; path: string | string[]; value: unknown }
  | { op: 'set'; view: string; path: string | string[]; value: unknown }
  | { op: 'add'; element: { id: string; [key: string]: unknown }; owner?: string; index?: number; view?: string; in?: 'model' }
  | { op: 'add'; element: { id: string; [key: string]: unknown }; view: string; index?: number; in: 'view'; owner?: never }
  | { op: 'move'; id: string; index: number; owner?: string; view?: never }
  | { op: 'move'; id: string; view: string; index: number; owner?: never }
  | { op: 'hide'; id: string; view: string }
  | { op: 'delete'; id: string }
  | { op: 'reparent'; id: string; parent: string | null }
  | { op: 'addView'; view: MapView; index?: number };
```

| Command | What it does |
|---|---|
| `set` with `id` | Sets a field of an element. `path` is a dotted path (`props.ends.to.multiplicity`), or a list of keys when a key holds a dot. `value: undefined` removes the field. `id`, `members`, `parent`, `from` and `to` change by their own commands, not by `set`. |
| `set` with `view` | Sets a field of a view the same way (`['present', 'order.total', 'collapsed']`). |
| `add` | Adds an element to the model: a node, a line (with `from` and `to`), or with `owner` a member of that element, at `index`. With `view`, the view shows it too. |
| `add` with `in: 'view'` | Adds an element to the view's own list for its kind: a line or an inline item to `edges`, a node to `nodes`, else `fragments`. |
| `move` | Moves an element to `index` among its owner's members, to a new `owner`, or within a view's list. A model element's member never goes under a node one view alone holds: that `move` throws, as `reparent` does. |
| `hide` | Takes an element out of one view, and everything the view says of it. Refused for the view's `subject` (or an element that holds it as a member), for an element that lives only in that view (its own node or line: use `delete`), and for a member (shown with its owner). |
| `delete` | Deletes an element, its members, what it owns, the lines to them and every reference to them. A model element owned by something one view alone holds (a view's own node) is kept: it moves to its nearest owner left, else to none. |
| `reparent` | Gives an element a new owner (`parent`), or none with `null`. A node one view alone holds owns only that view's own elements: `reparent`, or `add` with `parent`, of a model element (or another view's) under it throws, and `validate()` warns of a model saved with one. |
| `addView` | Adds a view at `index`, else last. Refused when its id is taken. No command deletes a view. |

```js
import { apply } from 'umlimator/all';

const next = apply(classModel, [
  { op: 'add', owner: 'order', element: { id: 'order.placedAt', type: 'uml.Property', label: 'placedAt', props: { valueType: 'Date' } } },
  { op: 'set', id: 'order', path: 'props.isAbstract', value: true },
  { op: 'hide', id: 'customer', view: 'classes' },
]);
```

## history

```ts
function history(model: MapModel, limit?: number): History;
```

Undo and redo for a host. Push each model you apply, and hand what `undo()` and `redo()` return to
[`handle.update()`](./render.md#update). `limit` caps how many models it keeps (default 100).

## History

```ts
interface History { readonly model: MapModel; readonly canUndo: boolean; readonly canRedo: boolean; push(m: MapModel): MapModel; undo(): MapModel; redo(): MapModel }
```

| Member | What it is |
|---|---|
| `model` | The current model. |
| `canUndo`, `canRedo` | Whether there is a model before or after it. |
| `push(m)` | Makes `m` the current model, drops any redo, and returns `m`. |
| `undo()`, `redo()` | Steps back or forward and returns that model. |

```js
import { render, apply, history } from 'umlimator/all';

const steps = history(model);
const map = render(el, model, {
  editable: true,
  on: { edit: e => { try { map.update(steps.push(apply(steps.model, e.commands))); } catch (err) { say(err.message); } } },
});
undoButton.onclick = () => { if (steps.canUndo) map.update(steps.undo()); };
redoButton.onclick = () => { if (steps.canRedo) map.update(steps.redo()); };
```

`examples/class-editor.html` and `examples/edit.html` are working hosts.

## references

```ts
function references(model: MapModel, id: string): Reference[];
```

Every place a model names an element, other than the element itself: what [`delete`](#command) cleans up. Use it to
warn before a delete, or to find what uses an element.

```js
references(model, 'db');
// [ { path: ['edges', 1, 'to'], kind: 'end' }, { path: ['views', 0, 'nodeIds', 2], kind: 'view' } ]
```

## Reference

```ts
interface Reference { path: (string | number)[]; kind: string }
```

`path` is the keys from the model down to the place. `kind` is what the place is: `end`, `parent`, `part`, `view`,
`pin`, `present`, `override`, `subject`, `story`, `lens`, `rule` or `prop` (a property a diagram type declares as a
reference). Later releases may add kinds.

## validate

```ts
function validate(model: MapModel): Problem[];
```

The model's own problems, before anything is drawn. Errors draw as holes or not at all: ids that are missing, repeated
or name nothing, a box inside itself, a schema version newer than this release reads. Warnings draw other than they
say: an unknown kind, weight or side, a view a card opens that is not loaded yet, a line from a card to itself. With
`umlimator/all`, each diagram type's own rules are checked too. An empty list means the model is sound.

```js
import { validate } from 'umlimator';
validate({ nodes: [{ id: 'a' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
// [ { level: 'error', path: 'views[0].nodeIds[1]', message: '"b" is not a card' } ]
```

## Problem

```ts
interface Problem { level: 'error' | 'warning'; path: string; message: string }
```

`path` says where, as `views[2].nodeIds[4]`.

## rules

```ts
function rules(model: MapModel): RuleBreak[];
```

Every [rule](./model-and-schema.md#rule) in `model.rules` the model breaks, view by view. No browser needed. The map
draws the lines that break a rule in rose, with a mark that names it; `umlimator.py check` fails on any break.

A card, box or line marked removed (`change: "removed"`, as [`diff()`](#diff) draws back what a change took out) counts for nothing, so on a diff model `rules()` finds what the model after breaks: a pull request that takes out the line breaking a rule shows that line removed, with no rule mark.

```js
import { rules } from 'umlimator';
const m = {
  nodes: [{ id: 'web', label: 'Web app', kind: 'frontend' }, { id: 'db', label: 'Orders DB', kind: 'database' }],
  edges: [{ id: 'w-d', from: 'web', to: 'db' }],
  views: [{ id: 'system', nodeIds: ['web', 'db'] }],
  rules: [{ id: 'no-db-from-web', title: 'The web app never reads the database', from: { id: 'web' }, to: { kind: 'database' } }],
};
rules(m);
// [ { rule: 'no-db-from-web', view: 'system',
//     message: 'view system: edge Web app→Orders DB breaks rule "The web app never reads the database"',
//     targets: [ { type: 'edge', ids: ['w-d'], view: 'system' } ] } ]
```

## RuleBreak

```ts
interface RuleBreak { rule: string; view: string; message: string; targets: Ref[] }
```

A rule broken in a view: the rule's id, the view, the message as `umlimator.py check` prints it, and the lines (and for a
cycle, the boxes) it is about, as [`Ref`](./model-and-schema.md#ref)s to pass to [`highlight()`](./render.md#highlight).

## diff

```ts
function diff(before: MapModel | null, after: MapModel | null): DiffResult;
```

What changed from one model to the next, as one model to draw: `after`, with each card marked added, changed or
removed, and each line likewise. What was removed comes back in its views, boxes and places, faded and struck
through. Cards and lines match by id (a line without one by its ends). Neither input is changed. `null` stands for an
empty model, so `diff(null, model)` marks everything added.

```js
import { diff } from 'umlimator';
const d = diff(model, apply(model, { op: 'set', id: 'api', path: 'label', value: 'Orders API' }));
d.summary;   // [ 'renames Shop API to Orders API' ]
d.views;     // [ 'system' ]
render(el, d.model, { view: d.views[0] });
```

A member drawn as its own shape (a part, a port, a lane) that was renamed or retyped is marked changed and said by its name ("renames charge to inlet in Battery"). On a typed view, what the type draws that is no element or line of its own is marked from the view laid out before and after, and written to the view's `diffMarks`: the ports a retyped part gained or lost, a containment line that is new, a C4 implied line or a requirement's containment from an owner an element left (drawn back, removed), and no mark on a shape whose picture the change leaves as it was. A typed view is listed in `views` for what it draws from other elements only when its picture changed; a shape's accessible name alone does not count (a C4 implied line naming a relationship whose label it does not draw). A model line the view still lists to a card taken out of it, drawn back removed, is named in `diffMarks.listed`, so a reader of the model after tells it from a line the view stopped listing. A re-pointed line is said as changed, and as taken out of a view (by its old ends) or put into one (by its new ends) only where the view drew it on one side alone: a view drawn as a map draws a line only when both its ends are on the view, whether it lists its lines or not, and one taken out of it is drawn back removed between its old ends, a copy with no id, since the model line under that id now runs between other ends. A typed view still reads a line it lists as drawn, and draws one taken out back only when it stopped listing it. A re-pointed line put into a view drawn as a map is drawn added there, whether the view lists its lines or not.

Only what changed is marked. A mark the model carries of its own, such as a card's `change: "new"` or `"removed"`, a line's `edited` dot or its `added` or `removed` style, or a `change` on a box, a member or a view's `nodeOverrides`, is dropped from `model` where the change leaves that element as it was, so the page draws nothing as new or removed that the summary does not say. A `planned` mark stays, since it draws as itself and `diff()` never writes it. A mark the change itself adds or takes off is a change of that element: "changes Shop app (change)", marked changed.

`umlimator.py diff` and the GitHub Action draw the same result for a pull request.

## DiffResult

```ts
interface DiffResult { model: MapModel; summary: string[]; views: string[] }
```

| Field | What it is |
|---|---|
| `model` | `after` with the change marks, and none of its own but `planned` on what the change leaves as it was: a card's `change` (a NEW or CHANGED tab; REMOVED is faded, dashed and struck through), a line's `style` (`added` or `removed`) or `edited`, and `nodeOverrides` for a card put into or taken out of one view. The marks are the model's own fields, so a page or still the CLI makes shows them. |
| `summary` | What changed, in words and in model order ("adds Readers, from umlimator.py"). |
| `views` | The views that show a change. |

## drift

```ts
function drift(model: MapModel, observed: Observed[] | { data: Observed[] }, options?: { match?: Record<string, string> }): DriftResult;
```

The map against the traffic seen. A line that carried traffic but is not drawn comes in (`drift: 'undrawn'`: rose,
dashed, labelled "not drawn" with its calls). A drawn line between two cards traffic reached that carried nothing
fades (`drift: 'idle'`, style `faded`). Other lines stay as they are. A service is the card `match` names, else the
card with that id, else the one with that label (any case). The model passed in is not changed.

```js
import { drift } from 'umlimator';
const d = drift(model, [{ from: 'web', to: 'api', count: 120 }, { from: 'web', to: 'db', count: 3 }]);
d.counts;   // { carried: 1, undrawn: 1, idle: 1, unknown: 0, unmatched: [] }
render(el, d.model, { view: d.views[0] });
```

## Observed

```ts
type Observed = { from: string; to: string; count?: number } | { parent: string; child: string; callCount?: number };
```

A call between two services as traffic showed it: `{ from, to, count }`, or a Jaeger or Tempo dependency
(`{ parent, child, callCount }`). Jaeger's `/api/dependencies` response, `{ data: [...] }`, can be passed as it is.
An end is a service's name, text or a number. An end that is anything else (missing, `null`, or any other value) names no service, and its entry carries no traffic; the entry's other end, when it is a name with no card, is still listed in `counts.unmatched`.

## DriftResult

```ts
interface DriftResult { model: MapModel; counts: { carried: number; undrawn: number; idle: number; unknown: number; unmatched: string[] }; views: string[] }
```

| Field | What it is |
|---|---|
| `model` | The model with drift marked. |
| `counts.carried` | Drawn lines that carried traffic. |
| `counts.undrawn` | Lines that carried traffic and were added. |
| `counts.idle` | Drawn lines that carried nothing. |
| `counts.unknown` | Drawn lines that could not be judged: an end traffic never reached. |
| `counts.unmatched` | Services with no card, by name. An end that is not a name names none; the other end of its entry is still listed. |
| `views` | The views that show drift. |

The counts are of model edges, not drawn lines: a line that stands for several edges fades only when every one of them
is idle, so a map can show fewer faded lines than `idle` counts.

## describe

```ts
function describe(model: MapModel, viewId: string): string;
```

A view in plain sentences: its cards and their kinds, its boxes, what each card's lines do, and cards with no line.
Deterministic. Useful as alt text, in a pull request, or for an assistant. With `umlimator/all` a typed view is
described in its own terms.

On a map view, `describe()`, `paths()`, `reach()` and `critical()` read the model after a change: a card, box or line marked removed, as [`diff()`](#diff) draws it back, is not counted, named or walked. A map sequence view still says a removed line as a removed step, in its place.

```js
describe(model, 'system');
// System: 3 cards and 2 lines.
// Cards: Web app (Client / UI), Shop API (Service / API), Orders DB (Data store).
// Web app calls Shop API ("calls").
// Shop API reads or writes Orders DB ("reads").
```

## paths

```ts
function paths(model: MapModel, viewId: string, from: string, to: string): Ref[];
```

Every card and line on a path from card `from` to card `to` along the view's lines, as [`Ref`](./model-and-schema.md#ref)s,
cards first. `[]` when nothing joins them. Pass the result to [`highlight()`](./render.md#highlight).

```js
map.highlight(paths(model, 'system', 'web', 'db'));
```

## reach

```ts
function reach(model: MapModel, viewId: string, from: string, options?: { backward?: boolean; depth?: number }): (Ref & { distance: number })[];
```

What a card's lines lead to, or with `backward: true` what leads to it, as Refs with their distance in lines; the card
itself first, at 0. `depth` stops after that many lines. [`highlight()`](./render.md#highlight) fades each by its
distance.

```js
reach(model, 'system', 'db', { backward: true });
// [ { type: 'node', id: 'db', view: 'system', distance: 0 },
//   { type: 'node', id: 'api', view: 'system', distance: 1 },
//   { type: 'node', id: 'web', view: 'system', distance: 2 },
//   { type: 'edge', ids: ['api-db'], view: 'system', distance: 1 },
//   { type: 'edge', ids: ['web-api'], view: 'system', distance: 2 } ]
```

## critical

```ts
function critical(model: MapModel, viewId: string, options?: { from?: string; to?: string; by?: 'latency' | 'cost' }): { refs: Ref[]; total: number };
```

The path along a view's lines with the highest total of `by` (`latency`, the default, or `cost`), summed over the
lines' [`latency` or `cost`](./model-and-schema.md#mapedge) (a line without one counts 0), from `from` to `to` (either
left out: any card), never visiting a card twice. `refs` holds its cards in order, then its lines; no refs and 0 when
no line leads there.

```js
const slow = critical(model, 'system', { by: 'latency' });
slow.total;              // 45
map.highlight(slow.refs);
```

## whatIf

```ts
function whatIf(model: MapModel, viewId: string, options: { remove: string[] }): { unreachable: (Ref & { distance: number })[] };
```

What taking cards out of a view would cost, with the model left as it is: what loses its way to them (backward, as
[`reach()`](#reach) finds it: for calls, what depends on them), each with its distance from the nearest, the cards
themselves at 0.

```js
map.highlight(whatIf(model, 'system', { remove: ['db'] }).unreachable);   // db, api, web and their lines
```

## See also

- [Model and schema](./model-and-schema.md): the fields commands change.
- [Typed diagrams](./typed-diagrams.md): what `apply()` does with typed elements.
- [Events and state](./events-and-state.md#edit): the `edit` and `change` events that produce commands.
