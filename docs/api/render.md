# render

Drawing a model in a browser, and laying it out without one. Back to the [API reference](./index.md).

## render

```ts
function render(container: HTMLElement, model: MapModel, options?: RenderOptions): Handle;
```

Draws one view of `model` into `container`, with pan, zoom, drill-down and keyboard access, and returns a
[`Handle`](#handle) to drive it. The map is a new element appended to the container, drawn in that element's shadow
root, so the page's CSS cannot break it, and its colours come from `--um-*` CSS variables (include `umlimator/theme.css`,
or set them yourself). Give the container a height.

| Parameter | Type | What it is |
|---|---|---|
| `container` | `HTMLElement` | The element to draw in. The map's element is appended after what it already holds: empty it first if it holds a placeholder. `destroy()` removes only the map's element. |
| `model` | [`MapModel`](./model-and-schema.md#mapmodel) | The model. It is never changed. |
| `options` | [`RenderOptions`](#renderoptions) | Optional. |

Returns a [`Handle`](#handle).

```js
import { render } from 'umlimator';
import 'umlimator/theme.css';

const map = render(document.getElementById('map'), model, {
  view: 'system',
  minimap: true,
  on: {
    select: e => showDetails(e.target),
    open: e => { e.preventDefault(); router.push(e.view); },   // route drill-down through the host's router
  },
});
```

In React, render once and hand each new model to `update()`:

```jsx
function MapView({ model, onSelect }) {
  const el = useRef(null), map = useRef(null), cb = useRef(onSelect);
  cb.current = onSelect;
  useEffect(() => {
    map.current = render(el.current, model, { on: { select: e => cb.current?.(e.target) } });
    return () => map.current.destroy();
  }, []);
  useEffect(() => { map.current?.update(model); }, [model]);
  return <div ref={el} style={{ height: 600 }} />;
}
```

`umlimator` draws maps. To draw diagram types in their own notation, import `render` from `umlimator/all` instead
([Typed diagrams](./typed-diagrams.md)).

## RenderOptions

```ts
interface RenderOptions {
  view?: string;
  select?: Ref | null;
  controls?: boolean;
  wheel?: 'zoom' | 'ctrl';
  minimap?: boolean;
  flow?: boolean;
  speed?: number;
  measure?: false | ((text: string, px: number) => number);
  editable?: boolean | { add?: boolean; rename?: boolean; move?: boolean; delete?: boolean; reorder?: boolean };
  stableLayout?: boolean;
  stableFrom?: MapModel;
  ease?: boolean;
  nav?: boolean;
  legend?: boolean;
  hints?: boolean;
  details?: boolean;
  on?: { [K in keyof Events]?: (e: Events[K]) => void };
}
```

| Option | Default | What it does |
|---|---|---|
| `view` | `model.root`, else the view with no parent | The view shown first. |
| `select` | none | A [`Ref`](./model-and-schema.md#ref) selected at the start. |
| `controls` | `true` | The up, zoom, fit, 1:1, flow and speed buttons over the canvas. |
| `wheel` | `'zoom'` | `'zoom'`: the wheel zooms and a trackpad pans. `'ctrl'`: only Ctrl or ⌘ with the wheel (or a pinch) zooms, and the wheel otherwise scrolls the page, as a map inside a document should. |
| `minimap` | `false` | A small overview of the view in a corner. |
| `flow` | on, unless the reader prefers reduced motion | Animated flow along lines. |
| `speed` | the model's [`motion.speed`](./model-and-schema.md#motion), else 1 | The motion speed, from 0.25 to 4: one multiplier on a tour's dot, a story step's time and the flow along lines. Reduced motion still stops all motion. |
| `measure` | the host's font (`--um-sans`), measured on a canvas | How text widths are measured. `false` uses a font-independent estimate, the same one `layout()` uses in Node. |
| `editable` | `false` | Edit gestures that emit [`change`](./events-and-state.md#change) events: all of them, or only those set `true`. On a typed view they emit [`edit`](./events-and-state.md#edit) instead. See [`docs/editing.md`](https://github.com/zintaen/umlimator/blob/main/docs/editing.md). |
| `stableLayout` | `true` | Cards keep their places across `update()`, in this handle only (never written to the model). |
| `stableFrom` | none | The model before an edit. The first picture keeps each card the edit left alone (on the view in both models, in the same box, with none of its flow lines added, removed or turned round) at the cell it had there, and places the other cards round them. A card's own pin wins. A view whose stable layout has more hard issues than a fresh one (a line through a card or on another line, cards or boxes over each other), or scores worse by more than one label left out, is drawn fresh. Never written to the model; ignored with `stableLayout: false`. |
| `ease` | `true` | `update()` eases into the next model: moved cards glide, new ones fade in, removed ones fade out. Never under reduced motion. |
| `nav` | `false` | The views list (Miller columns) left of the map, opened by its ☰ button or O. Picking a view emits `viewchange`. |
| `legend` | `false` | The kinds of cards and lines the view draws, in a box over the map that folds away. |
| `hints` | `false` | A line over the map's foot saying what the pointer does, and what just happened (a polite live region). |
| `details` | `false` | The selected card's panel under the map, with its tabs. Its Open and Unfold buttons emit `open` and `expand`. |
| `on` | none | Listeners by event name, the same as calling [`handle.on()`](#on) for each before anything is drawn. See [Events](./events-and-state.md#events). |

`nav`, `legend`, `hints` and `details` are pieces of the standalone page that `render()` can draw inside the map's
element, each on its own or in any mix, so a host can keep its own header:

```js
render(el, model, { nav: true, details: true, legend: true, hints: true });
```

## Handle

What `render()` and `mountPage()` return. Every method is safe to call after `destroy()`: it does nothing, and a
promise it returns resolves at once (see [`destroy`](#destroy)).

### update

```ts
update(model: MapModel): void;
```

Draws the next model. Only the views whose picture changed are laid out again, and the view, camera and selection are
kept. A selected id that no longer exists clears the selection (`select` with `null`); a view that no longer exists
falls back to the root (`viewchange`). With motion on and `ease` not `false`, moved cards glide and new and removed ones
fade. Pass a new object each time; the old one is never changed.

```js
map.update({ ...model, nodes: [...model.nodes, { id: 'cache', label: 'Cache', kind: 'database' }] });
```

### setView

```ts
setView(id: string): Promise<boolean>;
```

Shows a view, zooming in or out as a drill-down does, and emits `viewchange`. A request made while a move is under way
redirects it (the latest wins). The promise resolves `true` once the view shows, and `false` for a view the model lacks
(with a console warning), when a later request supersedes it, or on `destroy()`.

```js
if (await map.setView('payments')) map.select({ type: 'node', id: 'stripe', view: 'payments' });
```

### select

```ts
select(ref: Ref | null): void;
```

Selects the card, line, box, chip or badge `ref` names, or clears the selection with `null`, and emits `select`. A
chip or badge selects its card. See [`Ref`](./model-and-schema.md#ref).

### fit

```ts
fit(): void;
```

Moves the camera so the whole view fits the container.

### toSVG

```ts
toSVG(options?: ExportOptions): string;
```

A view as a stand-alone SVG file: every `var(--um-*)` resolved against the host's CSS at that moment, drawn at rest (no
selection, hover, flow or edit handles), with no network and no headless browser. It returns `''` for an unknown or
empty view, or after `destroy()`.

```js
const svg = map.toSVG({ view: 'api', scale: 2 });
download(new Blob([svg], { type: 'image/svg+xml' }), 'api.svg');
```

### toPNG

```ts
toPNG(options?: ExportOptions): Promise<Blob | null>;
```

The same picture as a PNG `Blob`, drawn on a canvas in the browser (default `scale` 2). `null` when there is nothing
to draw.

### ExportOptions

```ts
interface ExportOptions { view?: string; scale?: number; fontCSS?: string }
```

| Field | Default | What it is |
|---|---|---|
| `view` | the view shown | Any view of the model; another is drawn off screen, without showing it or emitting events. |
| `scale` | 1 for SVG, 2 for PNG | A factor on the view's natural size. |
| `fontCSS` | none | The host's own `@font-face` rules, with `data:` URLs, to carry into the file. The library fetches nothing. |

### focus

```ts
focus(ref?: Ref | null): void;
```

Puts keyboard focus on the card or line `ref` names (a chip or badge: its card), by default the selected one, else on
the map. The map's element delegates focus too, so `container.focus()` lands on the selected card.

### on

```ts
on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): () => void;
```

Adds a listener and returns a function that removes it. Listeners are plain callbacks, not DOM events. A listener that
throws is reported with `reportError()` and does not stop the others. The events and their payloads are on
[Events and state](./events-and-state.md#events).

```js
const off = map.on('viewchange', e => history.replaceState(null, '', '#view=' + e.view));
// later
off();
```

### expand

```ts
expand(id: string): boolean;
```

Unfolds a stacked card of the view shown into a box in place: its inner view's cards inside, this view's lines to it
moved onto them. In this handle only, never in the model, and kept per view across `update()`. Returns `false` when it
can't: no loaded inner view, nothing inside it, a card on a numbered view, or an editable map. It emits no `expand`
event; that event is for gestures.

### collapse

```ts
collapse(id: string): boolean;
```

Folds an unfolded card back, with anything unfolded inside it. `false` when it was not unfolded.

### overlay

```ts
overlay(name: string, layer: Overlay | null): void;
```

Sets, or with `null` removes, a named layer of marks drawn over the picture without touching the model. Layers stack
in the order first set; they survive `update()` and `setView()`, and `toSVG()` and `toPNG()` draw them. The
[`Overlay`](./events-and-state.md#overlay) type describes a layer.

```js
map.overlay('health', {
  nodes: { api: { tone: 'rose', badge: { text: 'DOWN', tone: 'rose' }, pulse: true } },
  edges: { 'web-api': { tone: 'rose', speed: 0 } },
});
```

### highlight

```ts
highlight(refs: Lit[] | null, options?: { layer?: string }): void;
```

Lights these cards and lines and dims the rest, or clears the highlight with `null`. A [`Lit`](./events-and-state.md#lit)'s
`level` (0 to 1), else its `distance`, fades it, so the output of [`reach()`](./apply-and-commands.md#reach) and
[`paths()`](./apply-and-commands.md#paths) can be passed straight in. `layer` draws them as a layer of that name
instead of `'highlight'`, so two owners never clear each other's marks.

```js
map.highlight(reach(model, map.view, 'db', { backward: true }));
```

### lens

```ts
lens(id: string | null): boolean;
```

Puts one of the model's [lenses](./model-and-schema.md#lens) on the map, or none with `null`: what it picks lit, the
rest dimmed, on every view shown. It stays across `update()` and `setView()`, and emits `lens`. `false` when the model
has no lens `id`.

### tour

```ts
tour(path: string[] | null, options?: { speed?: number }): Promise<boolean>;
```

A dot rides the lines between each pair of cards in `path` in turn, flashing each card it reaches. `speed` is in map
units a second at 1x (default 240), and the map's [`speed`](#properties) multiplies it as the dot rides, so a change mid-ride goes on from where the dot is. Resolves `true` at the end, and `false` when cut short: a new tour or replay,
`tour(null)`, Esc on the map, a new picture of the view, or `destroy()`. Under reduced motion no dot rides: the path is
lit at rest and the promise resolves at once.

```js
await map.tour(['web', 'api', 'db']);
```

### replay

```ts
replay(spans: Span[], options?: { match?: Record<string, string>; duration?: number }): Replay;
```

Plays a trace on the view: each call from one card to another runs along their line at the trace's relative time, and
the line keeps its duration as a label. A span's `service` names its card through `match`, else as a card's id, else
as its label. `duration` is the whole replay's time in ms (default 6000). Returns a
[`Replay`](./events-and-state.md#replay). See [`otlpSpans()`](./events-and-state.md#otlpspans) for OpenTelemetry input.

```js
const r = map.replay(otlpSpans(traceJson), { match: { 'orders-svc': 'api' } });
console.log(r.hops, 'calls,', r.skipped, 'skipped');
await r.done;
```

### play

```ts
play(id: string | null, options?: { step?: number; auto?: boolean }): StoryPlayer | null;
```

Tells one of the model's [stories](./model-and-schema.md#story): each step sets the view, camera, selection,
highlight and caption, then plays its tour. `step` is where to start (0-based); `auto` (default `true`) moves on once a
step's time is up. Returns a [`StoryPlayer`](./events-and-state.md#storyplayer), or `null` when the model has no story
`id` with steps (the story shown, if any, plays on). `play(null)` stops the story shown.

```js
const player = map.play('checkout');
if (player && await player.done) console.log('told to the end');
```

### destroy

```ts
destroy(): void;
```

Cancels a gesture in progress, stops the story shown, settles every waiting promise with `false`, stops timers, removes
the map's element (whatever else the container holds stays), and emits a last `state` event with `destroyed: true`. After it every
call does nothing: `setView()` and `tour()` resolve `false`, `play()` returns `null`, `toSVG()` returns `''` and
`toPNG()` `null`, and `lens()`, `expand()` and `collapse()` return `false`.

### Properties

```ts
readonly view: string | null;
readonly selection: Ref | null;
readonly selected: Ref[];
readonly expanded: string[];
readonly state: MapState;
readonly navigating: string | null;
readonly destroyed: boolean;
readonly motion: 'full' | 'reduced' | 'instant';
readonly story: StoryPlayer | null;
flow: boolean;
speed: number;
```

| Property | What it is |
|---|---|
| `view` | The view shown. |
| `selection` | The latest selected thing, or `null`. |
| `selected` | Every selected thing (Shift, ⌘ or Ctrl + click adds cards), the latest last. |
| `expanded` | The cards unfolded on the view shown, in the order they were unfolded. |
| `state` | The whole map's state as one frozen, JSON-serializable snapshot, fresh on every read. See [`MapState`](./events-and-state.md#mapstate). |
| `navigating` | The view a move is going to while one is under way, else `null`. |
| `destroyed` | `true` once `destroy()` has run. |
| `motion` | `'instant'` (drawn without animation), `'reduced'` (the reader's setting) or `'full'`. |
| `story` | The player of the story shown, whoever started it, else `null`. |
| `flow` | The animated flow along lines. Settable: `map.flow = false`. |
| `speed` | The motion speed: a tour's dot rides that much faster, a story step started from then on lasts its duration divided by it, and the flow along lines runs that much faster. Settable: `map.speed = 2`; a value outside 0.25 to 4 is ignored, and `null` goes back to the model's `motion.speed`, else 1. The speed button on the controls steps it through 0.5, 1, 1.5 and 2. Set by a host, it is not saved as the reader's choice. Reduced motion still stops the dot and the flow; a story step's time scales under it too. |

## mountPage

```ts
function mountPage(container: HTMLElement, model: MapModel, options?: { params?: URLSearchParams; instant?: boolean; stableFrom?: MapModel }): Handle;
```

The whole standalone viewer that `umlimator.py render` writes: top bar, breadcrumbs, views list, details panel, search,
legend, stories and lenses menus, export, theme toggle and `#view=&node=` deep links. It is built on `render()` and
returns the same [`Handle`](#handle). It is made for a page of its own: it follows and writes `location.hash`, and its handle's `destroy()` also removes the
listeners it added to the document and the window.

| Parameter | What it is |
|---|---|
| `params` | The page's mode, as the CLI passes it: `theme`, `reader`, and the CLI's own `check`, `still`, `shot` and `pdf`. Default: none. The link's `view`, `node`, `story`, `step` and `lens` are read from `location.hash`. |
| `instant` | Draw with no animation, as the CLI's checks and stills do. |
| `stableFrom` | The model before an edit, as `render()`'s [`stableFrom`](#renderoptions). A page the CLI writes with `diff --stable`, or the MCP page after an edit, holds it in a `#umlimator-base` script. |

```js
import { mountPage } from 'umlimator';
const map = mountPage(document.body, model);
```

Use `render()` with `nav`, `details`, `legend` and `hints` when the host wants the page's pieces inside its own layout.

## layout

```ts
function layout(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number; expand?: string[]; stableFrom?: MapModel }): Geometry & { unfolded?: string[] };
```

A view's geometry, with no DOM: where each card is, the route of each line, and where each label goes. Deterministic:
the same model gives the same geometry, and Node and a browser give the same result for the same `measure`.

| Option | Default | What it does |
|---|---|---|
| `repair` | the view's own `repair` | Port repair, on a map view: moves line ends to cut crossings. A typed view's type decides, and its lines are never port-repaired, so the option does nothing there. |
| `measure` | a font-independent estimate | Text widths in px for a text at a font size. |
| `expand` | none | Cards of the view to unfold in place, as [`expand()`](#expand) draws them. The result's `unfolded` lists those that did. |
| `stableFrom` | none | The model before an edit, as `render()`'s [`stableFrom`](#renderoptions): the cards the edit left alone keep their cells, unless the stable layout draws worse than a fresh one. |

```js
import { layout } from 'umlimator';
const g = layout(model, 'system');
for (const n of g.nodes) console.log(n.id, n.x, n.y, n.w, n.h);
console.log(g.bounds);   // { x, y, w, h }
```

## Geometry

```ts
interface Geometry {
  nodes: { id: string; x: number; y: number; w: number; h: number; [key: string]: unknown }[];
  edges: { from: string; to: string; ids: string[]; pts: [number, number][]; weight?: 1 | 2 | 3; wk?: WireKind;
    lbl?: { x: number; y: number; w: number; h: number; text: string; sub?: string } | null; [key: string]: unknown }[];
  bounds: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
}
```

Card boxes, drawn lines (one may stand for several model edges, listed in `ids`) with their points, width bucket (the `weight` a line grows to on hover, selection and keyboard focus; every line is drawn at one width at rest), [kind](./model-and-schema.md#wirekind) and label box, and the view's bounds, all in map units. A map view's lines carry `weight` and `wk`; a typed view's lines carry neither (their notation says what they are), and a line with no label may have no `lbl`. Fields beyond these are internal and may change.

## check

```ts
function check(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number; expand?: string[]; stableFrom?: MapModel }): CheckIssue[];
```

The layout check on `layout()`'s geometry, with no browser: overlapping cards, crossing or shared lines, detours,
lines that run through a card or against reading order, labels on lines or away from their own, and boxes and lanes. The CLI's `check` adds what only a browser can measure (text overflowing its
card, for one). In Node, text widths are an estimate unless `measure` is given, so the result can differ from a
browser's. The options are those of [`layout()`](#layout).

```js
import { check } from 'umlimator';
for (const issue of check(model, 'system')) console.warn(issue.message, issue.targets);
```

## CheckIssue

```ts
interface CheckIssue { message: string; targets: Ref[] }
```

One issue: its message, worded as the CLI's check words it, and exactly the cards, lines and boxes it is about.

## See also

- [Events and state](./events-and-state.md): what the map emits and how to read its state.
- [Element and plugins](./element-and-plugins.md): a map from HTML alone, with no script of your own.
- [Model and schema](./model-and-schema.md): what to pass as `model`.
