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

The full field list, with examples, is in [The model](../maps/model.md) and `engine/references/schema.md` (§ Map model);
`examples/umlimator-atlas.json`, umlimator's own model, uses much of it.

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
  motion?: { speed?: number };
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
| `motion` | How the map moves when it is played. See [Motion](#motion). |

Fields the library does not know are kept as they are, so a host can store its own data in the model.

## MapNode

```ts
interface MapNode {
  id: string; label?: string; kind?: string; sublabel?: string; badge?: string; badges?: Badge[]; edited?: boolean; icon?: string; verbs?: string[];
  opensView?: string;
  opensCount?: number;
  owner?: string;
  shape?: Shape;
  zone?: FlowZone;
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
| `zone` | Where the card sits in a view with `arrange: 'flow'`: a [`FlowZone`](#flowzone). A view's `nodeOverrides` may set it for that view. Map views read it, and typed views whose type reads the flow ([typed diagrams](./typed-diagrams.md)). |

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
  what?: string; when?: string;
  step?: number | string;
  sublabel?: string;
  style?: 'emphasis' | 'added' | 'dashed' | 'async' | 'security' | 'removed' | 'faded';
  change?: 'added' | 'new' | 'removed' | 'changed' | 'modified';
  drift?: 'undrawn' | 'idle';
  latency?: number;
  cost?: number;
  flow?: FlowRole;
  [key: string]: unknown;
}
```

| Field | What it is |
|---|---|
| `id` | Optional. A line without one is named `"<from>-><to>#<n>"` in a [`Ref`](#ref), `n` its place among lines with the same ends. |
| `from`, `to` | A card's id, or a box (container) of the view, where the line ends on the box's border. |
| `label`, `sublabel` | The line's label, and a smaller second line under it (shown only with a label). |
| `kind` | What the line means, drawn as its colour. See [`WireKind`](#wirekind). Default `calls`. |
| `weight` | How much the line stands for: 1 (default), 2 or 3. Lines are drawn at one width at rest; a line of weight 2 or 3 shows its width on hover, selection and keyboard focus, and its tooltip and accessible name say its `what` (as plain words, its first sentence), else "weight 2 of 3". |
| `what`, `when` | The details panel's text (Markdown: `` `code` ``, `**bold**`, `[links](https://…)`, blank-line paragraphs, `- ` bullets), and when the line is used, in its tooltip. |
| `step` | Its place in the order things happen, in a circle on the line: `2`, `2.1`, or up to 3 characters such as `"2a"`. |
| `style` | A style that wins over the kind's colour: `emphasis`, `added`, `dashed`, `async`, `security`, `removed` or `faded`. |
| `change` | A change mark, as [`diff()`](./apply-and-commands.md#diff) sets it, written in lower case. The renderer draws another letter case as its lower-case word, and `validate()` warns on it, as a schema check refuses it. |
| `drift` | What [`drift()`](./apply-and-commands.md#drift) found: `undrawn` or `idle`. |
| `latency`, `cost` | Budgets, in ms and in any unit, that [`critical()`](./apply-and-commands.md#critical) sums along a path. Not drawn. |
| `edited` | Draws a marker at the middle of the line. |
| `flow` | The line's part in a view with `arrange: 'flow'`: a [`FlowRole`](#flowrole). Without it, the line's kind decides. A typed line takes it too, read where its type reads the flow ([typed diagrams](./typed-diagrams.md)), which then gives the default. Read on a map view: a `dep` line ranks nothing, and a `state` or `guard` line counts as `dep` unless its `flow` says otherwise; `main` lines hold the main flow's one row, across the view's boxes too. |

Other fields the map reads: `fromSide` and `toSide` (the card sides the line uses).

## WireKind

```ts
type WireKind = 'calls' | 'feeds' | 'triggers' | 'state' | 'guard';
```

What a line means: `calls` (the default), `feeds` (hands work on), `triggers` (suggests, offers, fires), `state` (reads
or writes a file, board or config: a thinner line, a muted label, no flow) and `guard` (a hook steps in). Colours are
`--um-w-<kind>`. A view with `kindsFromLabels` guesses the kind from a line's label when its edges name none.

## FlowRole

```ts
type FlowRole = 'main' | 'branch' | 'dep';
```

A line's part in a view laid out by business flow ([design note](../diagrams/notes/layout-flow.md)): on the main flow, a flow line off it, or a dependency line that ranks nothing. Map views read it, and typed views whose type reads the flow. The main flow is the longest path among the `main` lines; with none, the stepped lines in step order (2 < 2a < 2b < 3, a step's first suffix on it), each starting where the one before ends, the longest such chain kept; else a numbered view's run order; else the longest path of flow lines. In a view with `arrange: 'flow'`, `validate()` warns when the `main` lines are not one path (a card with two main lines out or in, or a main line that closes a loop), and, with no `main` line, where the steps break into chains.

## FlowZone

```ts
type FlowZone = 'first' | 'flow' | 'last' | 'under';
```

Where a card sits in a view laid out by business flow: a column before the flow, in it, a column after it, or a band of rows under it. Map views read it, and typed views whose type reads the flow (each type's defaults in the design note's section 7.2). A `first` or `last` card takes no rank from its lines: it sits on the main row when it has a line into the first main card (or from the last), else to the side of the branch it joins, else above, and a flow line that runs back into it is drawn as a line back (`check()` does not call it right to left). An `under` card sits below every flow row, in the column of the middle card it is joined to, between the cards its flow lines come from and go to when there is room. Without one, a map card off the main flow takes the map's default: a person (by shape or kind) and a `public` card no line comes into go `first`, an `external` card `last`, a `database`, `file` or `board` card `under`; the main flow's first card may go `first` and its last card `last`. A view with no boxes keeps the defaults only when they draw no more problems (what `check()` says, crossings, labels not drawn) than without them; `zones: false` on the view turns them off. A card's own zone always holds, a pin beats it, with boxes it applies inside the card's box, and a view whose cards all have a zone ranks as without them.

## MapView

```ts
interface MapView {
  id: string; parent?: string | null; title?: string; nodeIds: string[];
  edges?: (string | MapEdge | Element)[]; layout?: Record<string, [number, number]>; repair?: boolean;
  subAndChips?: boolean;
  kindsFromLabels?: boolean;
  arrange?: 'flow';
  zones?: boolean;
  containers?: { id: string; label?: string; nodeIds?: string[]; parent?: string; badges?: Badge[]; tone?: string; change?: 'added' | 'new' | 'modified' | 'changed' | 'removed' | 'planned' }[];
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
| `containers` | Boxes: each with a label, the cards it holds, an optional parent box, badges on its border, a `tone` that tints the region behind it, and a `change` mark, as a card's, that [`diff()`](./apply-and-commands.md#diff) sets on a box the view gained or lost, written in lower case (`validate()` warns on another case or a value with no mark). |
| `subAndChips` | Cards 80 px tall that show their sub-line, then their chips. |
| `kindsFromLabels` | Guess a line's kind from its label's words when its edges name none. The standalone page always guesses. |
| `arrange` | `'flow'`: lay the view out by business flow, where [`FlowRole`](#flowrole) and [`FlowZone`](#flowzone) apply. On a map view, dependency lines rank nothing: a card whose lines are all dependencies sits in a band under the flow, in the column of the middle card it is joined to (the right one of two), and those lines are routed after the flow lines and may run right to left without `check()` saying so. On a map view, the main flow (see [`FlowRole`](#flowrole)) holds one straight row: each main line leaves its card's right side and comes into the next card's left side at their middles, and each branch keeps to one side of the row, above when one of its lines is a guard, else below (the other side when a column already holds two more cards on that one). With boxes, a box that holds main cards sits so that its first main card is on that row; a flow that leaves a box for one card, or one box that holds no other main card, and comes back keeps the box's cards on that row, the card or box it visits under the box (over it when its branch is above) in columns the box leaves free, its two main lines coming into their cards at the top and the bottom; a flow that comes back into a box after more than that takes a second row in the box. A main flow of more than `SNAKE_AT` (10) cards wraps onto a second row (more than 20, onto as many as it needs) that runs back the other way under the one before, joined by one turn line straight down from the first row's last card (the snake): the cut is the main card nearest the middle that splits no box (one box may hold the whole flow, which then holds both rows), crosses the fewest branches and leaves the turn line with no label; each row's branches keep to its outer side (an exception branch above), a branch that joins both rows sits between them, and so does a store both rows use. With no cut that splits no box, or with half or more of the main cards pinned, the view stays one row. A typed view whose type reads the flow snakes the same way. The geometry says each main card's `run` (0, 1 ...) and each line's reading way, `dir` (`'right'`, `'left'`, the turn line `'down'`), which `check()` reads in place of left to right; a view that does not snake has neither. Cards take their zones ([`FlowZone`](#flowzone)), inside each box too. A pinned card keeps its pin. A view with no flow line draws as without it. `validate()` warns on another value, and on a sequence, timing or mindmap view, which does not rank its elements. `diff()` reports a change of it, of a line's `flow` and of a card's `zone`. |
| `zones` | `false`: no default zones in an arranged view; a card's own `zone` still holds. |

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
interface Story { id: string; title?: string; audience?: string; steps: StoryStep[]; chapters?: StoryChapter[] }
interface StoryChapter { id: string; title?: string; audience?: string; at: number; steps: StoryStep[] }
```

A narrated walk-through of the map: its steps, in order. Tell one with [`handle.play(id)`](./render.md#play); the
standalone page lists them in its Stories menu, and `umlimator.py record` writes one as an animated PNG.

`audience` names who the story is told to (`"business"`, `"engineering"`, any name): the standalone page's Stories menu lists the stories that name none first, then each audience's under its name. `chapters` are stories of their own, each offered in the caption bar while the story shows its step `at` (0-based); a chapter's end, or ‹ on its first step, returns to the story at that step. A branch [`storyFromFlow()`](./apply-and-commands.md#storyfromflow) finds is a chapter. `validate()` checks a chapter's steps as a story's, errs on a chapter with no id, a repeated id or no steps, and warns on an `at` that is not one of the story's steps (the chapter is offered at none) and on an `audience` that is not a name.

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

## Motion

```ts
motion?: { speed?: number };
```

`speed` is the author's motion speed, a number from 0.25 to 4 (default 1): one multiplier on a tour's dot, a story step's time and the flow along lines. At 2 a step of 4000 ms lasts 2000 ms and the dot rides twice as fast. The reader's own choice on the speed button, the standalone page's `#speed=` link and a host's [`speed` option](./render.md#renderoptions) outrank it, in that order. Reduced motion still stops the dot and the flow. `validate()` warns on a speed outside the range or not a number, and on a `motion` that is not an object; either is ignored.

```json
"motion": { "speed": 1.5 }
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
