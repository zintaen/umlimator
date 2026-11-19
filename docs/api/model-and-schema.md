# Model and schema

What a model holds, how to check it against the JSON Schema, and `migrate()`. Back to the [API reference](./index.md).

A model is plain JSON. It has shared `nodes` (cards) and `edges` (lines), and `views` that each show some of them. The
library never changes a model it is given: [`apply()`](./apply-and-commands.md#apply), [`diff()`](./apply-and-commands.md#diff)
and the other functions that return a model return a new one.

```json
{
  "$schema": "./node_modules/umlimator/lib/umlimator.schema.json",
  "title": "Shop",
  "root": "system",
  "nodes": [
    { "id": "web", "label": "Web app", "kind": "frontend", "sublabel": "React" },
    { "id": "api", "label": "Shop API", "kind": "backend", "owner": "orders", "opensView": "api-inside" },
    { "id": "db", "label": "Orders DB", "kind": "database", "owner": "orders" }
  ],
  "edges": [
    { "id": "web-api", "from": "web", "to": "api", "label": "places orders", "latency": 40 },
    { "id": "api-db", "from": "api", "to": "db", "label": "reads", "kind": "state" }
  ],
  "views": [
    { "id": "system", "title": "System", "nodeIds": ["web", "api", "db"], "edges": ["web-api", "api-db"] }
  ]
}
```

The full field list, with examples, is in [The model](../guide/model.md) and `engine/references/schema.md` (§ Map model);
`examples/bookshop.json` uses most of it.

## MapModel

```ts
interface MapModel {
  schemaVersion?: number;
  title?: string;
  root?: string;
  nodes: MapNode[];
  edges?: MapEdge[];
  views: MapView[];
  icons?: Record<string, { g?: string; src?: string; dark?: boolean; name?: string; legal?: string }>;
  iconPacks?: Record<string, string>;
  authors?: Record<string, { name?: string; url?: string; avatar?: string }>;
  rules?: Rule[];
  stories?: Story[];
  lenses?: Lens[];
  [key: string]: unknown;
}
```

| Field | What it is |
|---|---|
| `schemaVersion` | 1 (or none): a map. 2: it may also hold typed elements and typed views ([Typed diagrams](./typed-diagrams.md)). A newer version is an error. |
| `title` | The model's title. |
| `root` | The view shown first. Default: the view with no parent. |
| `nodes` | The cards, shared by every view. See [`MapNode`](#mapnode). |
| `edges` | The lines, shared by every view. See [`MapEdge`](#mapedge). |
| `views` | What each picture shows. See [`MapView`](#mapview). |
| `icons` | Icons by name: an inline SVG glyph in `g`, or an image in `src`. A cloud view reads its vendor icons here, keyed `<pack>/<id>`. The module never fetches an icon. |
| `iconPacks` | The pinned icon pack each cloud pack's ids were chosen from (`{ "gcp": "2026-11-14" }`). Read by `umlimator.py check`, not by the module. |
| `authors` | People by handle, with a name, link and avatar: a card's `author` hangs a name tag under it. |
| `rules` | What must hold. See [`Rule`](#rule) and [`rules()`](./apply-and-commands.md#rules). |
| `stories` | Narrated walk-throughs. See [`Story`](#story) and [`handle.play()`](./render.md#play). |
| `lenses` | Saved ways to look at the map. See [`Lens`](#lens) and [`handle.lens()`](./render.md#lens). |

Fields the library does not know are kept as they are, so a host can store its own data in the model.

## MapNode

```ts
interface MapNode {
  id: string; label?: string; kind?: string; sublabel?: string; badge?: string; badges?: Badge[]; edited?: boolean; icon?: string; verbs?: string[];
  opensView?: string;
  opensCount?: number;
  owner?: string;
  shape?: Shape;
  [key: string]: unknown;
}
```

| Field | What it is |
|---|---|
| `id` | Unique across nodes, edges and (in version 2) members. Never contains `->`. |
| `label`, `sublabel` | The card's name, and a smaller line under it. |
| `kind` | `frontend`, `backend`, `ai`, `database`, `queue`, `security`, `cloud`, `external` or `file` (skill-map kinds such as `public`, `lane`, `script`, `hook` and `board` work too). It sets the card's colour, legend entry and shape. |
| `badges` (`badge`) | Tabs on the card, each a [`Badge`](#badge). |
| `verbs` | Chips on the card. A click on one is a `chip` [`Ref`](#ref). |
| `icon` | A logo or line icon by name, from `icons/manifest.json` or the model's `icons`. |
| `edited` | Draws a marker in the card's corner. |
| `opensView`, `opensCount` | The view the card opens on drill-down, which may not be loaded yet, and the number on its ⤢ badge until it is. |
| `owner` | Who owns the card (a team). Selectors pick by it, and a lens with `color: 'owner'` rings cards in their owner's tone. |
| `shape` | The card's own [`Shape`](#shape), over the one its kind draws. |

In schema version 2 a node may also be a typed [`Element`](./typed-diagrams.md#element).

## Shape

```ts
type Shape = 'box' | 'person' | 'browser' | 'mobile' | 'cylinder' | 'pipe' | 'document' | 'hexagon' | 'robot' | 'terminal' | 'window' | 'folder' | 'node';
```

A card's outline. Without one a card is drawn by its kind (a person for `person`, a cylinder for a database, and so on),
and a rounded box where no shape says more. Every shape keeps to its card's box, so the layout is the same as a box's.

## Badge

```ts
type Badge = string | { text: string; tone?: string };
```

A tab on a card or a box: its text, and optionally a palette name for its colour (`green`, `amber`, `rose`, `accent`,
`violet` and the rest of `--um-<tone>`).

```json
"badges": ["BUILT", { "text": "Owner: platform", "tone": "violet" }]
```

## MapEdge

```ts
interface MapEdge {
  id?: string; from: string; to: string; label?: string; edited?: boolean;
  kind?: WireKind;
  weight?: 1 | 2 | 3;
  step?: number | string;
  sublabel?: string;
  style?: 'emphasis' | 'added' | 'dashed' | 'async' | 'security' | 'removed' | 'faded';
  change?: 'added' | 'new' | 'removed' | 'changed' | 'modified';
  drift?: 'undrawn' | 'idle';
  latency?: number;
  cost?: number;
  [key: string]: unknown;
}
```

| Field | What it is |
|---|---|
| `id` | Optional. A line without one is named `"<from>-><to>#<n>"` in a [`Ref`](#ref), `n` its place among lines with the same ends. |
| `from`, `to` | A card's id, or a box (container) of the view, where the line ends on the box's border. |
| `label`, `sublabel` | The line's label, and a smaller second line under it (shown only with a label). |
| `kind` | What the line means, drawn as its colour. See [`WireKind`](#wirekind). Default `calls`. |
| `weight` | How much the line stands for, drawn as its width: 1 (default), 2 or 3. |
| `step` | Its place in the order things happen, in a circle on the line: `2`, `2.1`, or up to 3 characters such as `"2a"`. |
| `style` | A style that wins over the kind's colour: `emphasis`, `added`, `dashed`, `async`, `security`, `removed` or `faded`. |
| `change` | A change mark, as [`diff()`](./apply-and-commands.md#diff) sets it. |
| `drift` | What [`drift()`](./apply-and-commands.md#drift) found: `undrawn` or `idle`. |
| `latency`, `cost` | Budgets, in ms and in any unit, that [`critical()`](./apply-and-commands.md#critical) sums along a path. Not drawn. |
| `edited` | Draws a marker at the middle of the line. |

Other fields the map reads: `fromSide` and `toSide` (the card sides the line uses).

## WireKind

```ts
type WireKind = 'calls' | 'feeds' | 'triggers' | 'state' | 'guard';
```

What a line means: `calls` (the default), `feeds` (hands work on), `triggers` (suggests, offers, fires), `state` (reads
or writes a file, board or config: a thinner line, a muted label, no flow) and `guard` (a hook steps in). Colours are
`--um-w-<kind>`. A view with `kindsFromLabels` guesses the kind from a line's label when its edges name none.

## MapView

```ts
interface MapView {
  id: string; parent?: string | null; title?: string; nodeIds: string[];
  edges?: (string | MapEdge | Element)[]; layout?: Record<string, [number, number]>; repair?: boolean;
  subAndChips?: boolean;
  kindsFromLabels?: boolean;
  containers?: { id: string; label?: string; nodeIds?: string[]; parent?: string; badges?: Badge[]; tone?: string }[];
  [key: string]: unknown;
}
```

| Field | What it is |
|---|---|
| `id`, `title` | The view's id and the title shown for it. |
| `parent` | The view one level up; a view with none is a root. |
| `nodeIds` | The cards it shows. |
| `edges` | The lines it draws: model edge ids, or lines of its own. Without it, every model edge between two of its cards. A typed view draws its own kinds of line; most draw a listed line of another kind too, and a state machine, requirement, sequence, timing, communication, interaction overview, mindmap or cloud view leaves it out, which `validate()` warns of. A C4 dynamic view leaves it out too: its lines are its steps, each a relationship of the model, so `validate()` reports any other line it lists as a `c4-steps` error. |
| `layout` | A `[col, row]` place per card id. |
| `repair` | `false` turns off port repair for this map view. A typed view ignores it: its lines are never port-repaired. |
| `containers` | Boxes: each with a label, the cards it holds, an optional parent box, badges on its border, and a `tone` that tints the region behind it. |
| `subAndChips` | Cards 80 px tall that show their sub-line, then their chips. |
| `kindsFromLabels` | Guess a line's kind from its label's words when its edges name none. The standalone page always guesses. |

Other view fields: `gap` and `rgap` (space between columns and rows), `keepPairs` (A→B and B→A drawn as two lines),
`render: "sequence"` (a numbered run-order view) and `tour` (a path for a dot to ride). A typed view also has `diagram`;
see [Typed diagrams](./typed-diagrams.md#views).

## Ref

```ts
type Ref =
  | { type: 'node'; id: string; view: string }
  | { type: 'edge'; ids: string[]; view: string }
  | { type: 'container'; id: string; view: string }
  | { type: 'chip'; node: string; index: number; value: string; view: string }
  | { type: 'badge'; node: string; index: number; value: string; view: string }
  | { type: 'badge'; container: string; index: number; value: string; view: string };
```

What a click, a selection or a result is about, named only by ids from the model, so a host can map it back to its
own data. A drawn line can stand for several model edges (A→B and B→A, parallel edges), so an edge Ref lists `ids`, in
model order. Events, [`select()`](./render.md#select), [`highlight()`](./render.md#highlight), [`paths()`](./apply-and-commands.md#paths)
and [`reach()`](./apply-and-commands.md#reach) all use Refs.

```js
map.select({ type: 'node', id: 'api', view: 'system' });
map.on('click', e => { if (e.target.type === 'badge') openTicket(e.target.value); });
```

## Selector

```ts
interface Selector { id?: string | string[]; kind?: string | string[]; container?: string | string[]; owner?: string | string[]; not?: Selector }
```

Picks cards by `id`, `kind` (as the map draws it: `db` picks databases), `container` (a box, at any depth) or `owner`,
each a value or a list. Every key given must hold, and `not` turns a selector round. Rules and lenses use selectors.

```json
{ "kind": "database", "not": { "owner": "orders" } }
```

## Lens

```ts
interface Lens { id: string; title?: string; pick?: LensSelector; color?: 'owner' }
```

A saved way to look at the map: what `pick` picks is lit, the rest dimmed (no `pick` lights everything). With
`color: 'owner'` each lit card is ringed in its owner's tone, with a legend. Put one on with
[`handle.lens(id)`](./render.md#lens); the standalone page lists them in its Lenses menu and as `#lens=<id>`.

## LensSelector

```ts
interface LensSelector extends Selector { line?: WireKind | WireKind[] }
```

A [`Selector`](#selector) and `line`, line kinds. Without `line` the lens lights the cards it picks and the lines
between two of them; with `line`, the lines of those kinds between two cards the rest of it picks, and their ends.

```json
"lenses": [
  { "id": "orders-team", "title": "Owned by orders", "pick": { "owner": "orders" } },
  { "id": "writes", "title": "Who writes state", "pick": { "line": "state" } },
  { "id": "owners", "title": "By owner", "color": "owner" }
]
```

## Rule

```ts
interface Rule { id: string; title?: string; views?: string[]; from?: Selector; to?: Selector; noCycles?: boolean }
```

What the model says must hold: no line from the cards `from` picks to the cards `to` picks (a side left out picks
every card), or, with `noCycles`, no boxes that reach each other through their lines. A rule that names a box holds
only in the views that draw one of the boxes it names; `views` narrows it further. [`rules()`](./apply-and-commands.md#rules)
lists the breaks, the map draws the lines that break one in rose, and `umlimator.py check` fails on them.

```json
"rules": [
  { "id": "no-db-from-web", "title": "The web app never reads the database", "from": { "kind": "frontend" }, "to": { "kind": "database" } },
  { "id": "layers", "title": "Layers do not depend on each other in a loop", "noCycles": true }
]
```

## Story

```ts
interface Story { id: string; title?: string; steps: StoryStep[] }
```

A narrated walk-through of the map: its steps, in order. Tell one with [`handle.play(id)`](./render.md#play); the
standalone page lists them in its Stories menu, and `umlimator.py record` writes one as an animated PNG.

## StoryStep

```ts
interface StoryStep {
  view: string; caption?: string; select?: string | Ref; highlight?: (string | Lit)[]; tour?: string[];
  camera?: 'fit' | { x: number; y: number; zoom?: number } | { card: string; zoom?: number }; duration?: number;
}
```

| Field | What it is |
|---|---|
| `view` | The view the step shows. |
| `caption` | Text in the story's bar, also said to screen readers. |
| `select` | A card id, a line id, or a [`Ref`](#ref). |
| `highlight` | Card ids, line ids or [`Lit`](./events-and-state.md#lit)s. The lines between two cards it names light too. |
| `tour` | Card ids: the path the tour dot rides once the step shows. |
| `camera` | `'fit'` (the default), a point and zoom, or a card to frame. |
| `duration` | The step's time in ms when playing (default 4000). Its tour runs to its end first. |

```json
"stories": [{
  "id": "checkout", "title": "How an order is placed",
  "steps": [
    { "view": "system", "caption": "A shopper places an order.", "select": "web" },
    { "view": "system", "caption": "The API stores it.", "highlight": ["api", "db"], "tour": ["web", "api", "db"] }
  ]
}]
```

## migrate

```ts
function migrate<M extends MapModel>(model: M): M;
```

The model at the schema version this release reads. Versions 1 and 2 come back unchanged (the same object); lines
with no id keep their positional names. It throws on a newer version, a whole number above 2, rather than draw it
wrongly. [`validate()`](./apply-and-commands.md#validate) reports the same problem without throwing.

```js
import { migrate } from 'umlimator';
try { model = migrate(model); }
catch (err) { showError(err.message); }   // "schemaVersion 3 is newer than this release reads (2): upgrade umlimator to read it"
```

## JSON Schema

`umlimator/schema.json` (`lib/umlimator.schema.json`) is the model's JSON Schema. A model file that names it gets
completion and checks in editors:

```json
{ "$schema": "./node_modules/umlimator/lib/umlimator.schema.json", "nodes": [], "views": [] }
```

Any JSON Schema validator can use it too:

```js
import schema from 'umlimator/schema.json' with { type: 'json' };
```

The schema checks shapes. [`validate()`](./apply-and-commands.md#validate) checks what a schema cannot: ids that are
missing, repeated or dangling, boxes inside themselves, and each diagram type's own rules.

## See also

- [Typed diagrams](./typed-diagrams.md): the schema version 2 envelope and each diagram type's vocabulary.
- [Apply and commands](./apply-and-commands.md): changing a model and reading it.
