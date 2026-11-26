# Events and state

What a map emits, how to read its state, the layers of marks a host draws over it, and stories, tours and trace
replays. Back to the [API reference](./index.md).

## Events

```ts
interface Events {
  click: { target: Ref; event: MouseEvent | KeyboardEvent; preventDefault(): void };
  select: { target: Ref | null; targets: Ref[] };
  open: { target: Ref; view: string; preventDefault(): void };
  viewchange: { view: string; from: string };
  change: Change;
  edit: { view: string; commands: Command[] };
  expand: { target: Extract<Ref, { type: 'node' }>; view: string; expanded: boolean; preventDefault(): void };
  story: { story: string; step: number | null; steps: number; playing: boolean; chapter?: string; at?: number };
  state: { state: MapState; changed: (keyof MapState)[] };
  lens: { lens: string | null };
}
```

Listen with [`handle.on(type, fn)`](./render.md#on), or with `on: { type: fn }` in
[`RenderOptions`](./render.md#renderoptions). Events are plain callbacks, not DOM events; on
[`<umlimator-map>`](./element-and-plugins.md#events) three of them come as DOM events. Every target is a
[`Ref`](./model-and-schema.md#ref), named by ids from the model.

```js
const map = render(el, model, {
  on: {
    click: e => { if (e.target.type === 'chip') { e.preventDefault(); openDocs(e.target.value); } },
    select: e => panel.show(e.targets),
    open: e => { if (!loaded(e.view)) { e.preventDefault(); loadView(e.view).then(m => { map.update(m); map.setView(e.view); }); } },
    viewchange: e => router.replace('/map/' + e.view),
  },
});
```

### click

A press on a card, line, box, chip or badge, or Enter on a focused tab or chip (then `event` is a `KeyboardEvent`).
It selects what was clicked unless the listener calls `preventDefault()`, which keeps the selection as it was, so a
chip, badge or card can act as a link in the host.

### select

The selection changed: a click, the keyboard, [`select()`](./render.md#select), or a view change that cleared it.
`target` is the latest selected thing or `null`; `targets` is every selected thing, the latest last. A chip or badge
selects its card (a container's badge, its box).

### open

A drill-down request: double-click, Enter on the selected card, or a click on its ⤢ badge. `view` is the view the card
opens, which may not be in the model yet. The map goes into it unless the listener calls `preventDefault()`, so a host
can route drill-down through its own router, or load the view first.

### viewchange

The view shown changed, once per move, `from` the view it started on. A move that ends where it started emits none.

### change

An edit gesture on a map view, with `editable` set: a [`Change`](#change-1). Nothing changes on the map until the host
applies it and calls [`update()`](./render.md#update). See [`docs/editing.md`](https://github.com/zintaen/umlimator/blob/main/docs/editing.md).

### edit

An edit gesture on a typed view (schema version 2, `diagram` set and not `'map'`), with `editable` set: a transaction
of [`Command`](./apply-and-commands.md#command)s for the host to run with [`apply()`](./apply-and-commands.md#apply)
and hand back with `update()`. Map views emit `change`, never this.

```js
on: { edit: e => map.update(steps.push(apply(steps.model, e.commands))) }
```

### expand

E or Alt + click on a stacked card, or the ⤡ tab of the box it unfolded into, before the card unfolds in place
(`expanded: true`) or folds back (`false`). `view` is the card's inner view, which may not be in the model yet: the card
unfolds once an `update()` brings it. `preventDefault()` cancels it. [`expand()`](./render.md#expand) called by the host
emits none.

### story

The story shown changed: it entered a step (0-based), was paused or resumed (`playing`), or ended (`step: null`, on
`destroy()` too). While a chapter is told, `chapter` is its id, `at` the story's step it is offered at, and `step` and `steps` are the chapter's; on the main story neither is there.

### state

The map's state changed: at most once a frame, with the keys that changed since the last `state` event. The camera
comes once it rests, so a pan, zoom or glide is one event. The last one, on `destroy()`, has `destroyed: true`. See
[`MapState`](#mapstate).

### lens

The lens on the map changed: [`lens()`](./render.md#lens), or an `update()` whose model lacks the lens shown
(`lens: null`).

## Change

```ts
type Change = { id: string; view: string; hint?: Hint } & (
  | { op: 'add'; kind: 'node'; label: string; container?: string }
  | { op: 'add'; kind: 'edge'; from: string; to: string; label?: string }
  | { op: 'rename'; target: Ref; label: string }
  | { op: 'move'; target: Extract<Ref, { type: 'node' }>; to: string | null }
  | { op: 'delete'; target: Ref }
  | { op: 'reorder'; target: Ref; index: number });
```

An edit the user asked for on a map view. `id` is unique per event, for the host's own log or undo; an added card or
line has no id of its own, since ids belong to the host. `move` puts a card into box `to` (or out of every box,
`null`); `reorder` gives a card a new place in its column or box, or a chip or badge in its list. Deleting a card says
only that: whether its lines go with it is the host's rule. The places a change hints are used
only if the next `update()`'s model shows the edit. An update back to the model before an applied move, or after it
(undo, redo), puts the cards back as they were.

```js
map.on('change', c => {
  if (c.op === 'rename' && c.target.type === 'node') {
    model = { ...model, nodes: model.nodes.map(n => n.id === c.target.id ? { ...n, label: c.label } : n) };
    map.update(model);
  }
});
```

`examples/edit.html` handles every operation.

## Hint

```ts
interface Hint { x: number; y: number; col?: number; row?: number }
```

Where the user dropped or placed something: a point in the view and, on a column view, its column and row. A host may
keep it as presentation (the view's `layout`), or ignore it.

## MapState

```ts
interface MapState {
  view: string | null;
  navigating: string | null;
  selection: Ref[];
  expanded: string[];
  lens: string | null;
  overlays: string[];
  story: { id: string; step: number; steps: number; playing: boolean; chapter?: string; at?: number } | null;
  tour: boolean;
  replay: { playing: boolean } | null;
  paused: boolean;
  camera: { x: number; y: number; zoom: number };
  flow: boolean;
  motion: 'full' | 'reduced' | 'instant';
  speed: number;
  gesture: 'idle' | 'dragging' | 'connecting' | 'naming';
  destroyed: boolean;
}
```

Everything the map is doing, as one snapshot: fresh on every read, frozen all the way down, and plain JSON, so it can be
logged, sent or compared as it is. Read it as [`handle.state`](./render.md#properties), from the `state` event, as
`window.umlimatorMap.state` on a page the CLI writes, as `el.map.state` on `<umlimator-map>`, or with the MCP server's
`page_state()` tool.

| Field | What it says |
|---|---|
| `view` | The view shown; `null` while the model has no views. |
| `navigating` | The view a move under way is going to. |
| `selection` | Every selected thing, the latest last. |
| `expanded` | The cards unfolded on the view shown, in the order they unfolded. |
| `lens` | The lens on the map. |
| `overlays` | The layers of marks, in the order first set: `lens`, `highlight`, `story`, `tour`, `replay`, the page's `lit`, the MCP page's `mcp`, a host's own. |
| `story` | The story shown: its step (from 0), how many it has, and whether it goes on by itself; in a chapter, the chapter's id and the story's step it is offered at (`chapter`, `at`). |
| `tour` | A tour's dot is on the map, riding or held. |
| `replay` | A replay under way, playing or paused by its own `pause()`. |
| `paused` | The standalone page's ❚❚ holds every clock (tour, replay, story, flow) and leaves each one's own state as it is. |
| `camera` | The centre in map units and the zoom (1 is actual size). In a `state` event, where it last rested. |
| `flow` | The lines flow. |
| `motion` | How this map moves. |
| `speed` | The motion speed, as [`handle.speed`](./render.md#properties). |
| `gesture` | An edit in progress, on an editable map. |
| `destroyed` | `destroy()` has run. |

```js
map.on('state', ({ state, changed }) => {
  if (changed.includes('view')) breadcrumbs.set(state.view);
  if (changed.includes('camera')) saveCamera(state.camera);
});
```

The changelog's [State section](../module-api.md#state) has the full state machines: navigation, the story player, tours
and replays, gestures, the page's keys and link, the element's lifecycle and the MCP server's page.

## Overlay

```ts
interface Overlay { nodes?: Record<string, CardMark>; edges?: Record<string, LineMark>; dim?: boolean }
```

A layer of marks for [`handle.overlay(name, layer)`](./render.md#overlay): cards by node id, lines by edge id
(`"<from>-><to>#<n>"` for an edge without one). With `dim`, what the layer doesn't name fades. Layers stack in the
order first set: each property comes from the latest layer that sets it, and a card or line is as lit as its lowest
level. Ids the view doesn't show are ignored.

```js
map.overlay('deploys', {
  nodes: { api: { badge: { text: 'v42', tone: 'green' }, pulse: true } },
  edges: { 'api-db': { label: '12 ms p95', tone: 'amber' } },
});
map.overlay('deploys', null);   // remove it
```

## CardMark

```ts
interface CardMark { tone?: string; badge?: Badge; pulse?: boolean; level?: number }
```

A mark on a card: `tone`, a palette name drawn as a ring; `badge`, a tab after the card's own; `pulse`, a pulse;
`level`, how lit it is, 0 to 1.

## LineMark

```ts
interface LineMark { tone?: string; speed?: number; pulse?: boolean; label?: string; level?: number; dash?: boolean }
```

A mark on a line: `tone`, a glow under it; `speed`, its flow's speed as a factor (0 stops it); `label`, a pill under its
own label, or along the line where it covers nothing; `dash`, drawn dashed; `pulse`; `level`, 0 to 1. A drawn line that
stands for several edges takes the strongest of their marks.

## Lit

```ts
type Lit = Ref & { level?: number; distance?: number };
```

A [`Ref`](./model-and-schema.md#ref) for [`highlight()`](./render.md#highlight) and a story step's `highlight`, with
how lit it is: `level` (0 to 1), else `distance` (each step out a little fainter), else fully. The results of
[`reach()`](./apply-and-commands.md#reach), [`paths()`](./apply-and-commands.md#paths) and
[`whatIf()`](./apply-and-commands.md#whatif) are Lits already.

## StoryPlayer

```ts
interface StoryPlayer {
  readonly story: string; readonly step: number; readonly steps: number; readonly playing: boolean; readonly done: Promise<boolean>;
  readonly state: 'entering' | 'playing' | 'paused' | 'ended' | 'stopped';
  readonly chapter: string | null; readonly chapters: { id: string; title: string | null; at: number }[];
  next(): void; prev(): void; pause(): void; resume(): void; stop(): void; go(step: number): void; enter(chapter: string): boolean; back(): boolean;
}
```

A story being told, as [`handle.play()`](./render.md#play) returns it and [`handle.story`](./render.md#properties)
reads it. `step` is the step shown (0-based) of `steps`. `next()` past the last step ends it, and `done` resolves
`true`; `stop()` closes it, and `done` resolves `false`. `state` is `entering` while a step's view, camera, selection and
highlight are on their way, then `playing` or `paused`, then `ended` or `stopped`. The reader taking the map (a press, a
key, a view or selection the story didn't make) pauses it. `go(k)` shows step `k`, as the caption bar's scrubber does.

`chapters` lists the story's [chapters](./model-and-schema.md#story) and the step each is offered at. `enter(id)` tells one from its first step (`false` when the story has no such chapter); while it is told, `chapter` is its id and `step` and `steps` are the chapter's. `back()`, `next()` past its last step or `prev()` on its first returns to the main story at the chapter's step `at`.

```js
const player = map.play('checkout', { auto: false });
nextButton.onclick = () => player?.next();
```

## Span

```ts
interface Span { id: string; parent?: string | null; service: string; start: number; end: number; name?: string }
```

One span of a trace: `start` and `end` in milliseconds, `service` naming the card it ran in, and `parent` its caller's
span id. A call is a span and its parent's, in two different services.

## Replay

```ts
interface Replay { readonly hops: number; readonly skipped: number; readonly done: Promise<boolean>; pause(): void; resume(): void; stop(): void }
```

A replay in progress, as [`handle.replay()`](./render.md#replay) returns it. `hops` is the calls it plays; `skipped`,
the spans whose service has no card on the view or whose call has no line there. `done` resolves `true` when it played
to the end, `false` when stopped or cut short.

## otlpSpans

```ts
function otlpSpans(otlp: unknown): Span[];
```

The spans of an OpenTelemetry trace in OTLP JSON (`resourceSpans`), as `replay()` and `sequenceFromTrace()` take them.
A span's service is its resource's `service.name`. No browser needed.

```js
import { otlpSpans } from 'umlimator';
const spans = otlpSpans(await (await fetch('/traces/checkout.json')).json());
map.replay(spans, { match: { 'orders-svc': 'api' } });
```

## sequenceFromTrace

```ts
function sequenceFromTrace(model: MapModel, spans: Span[], options?: { view?: string; match?: Record<string, string>; title?: string }): MapModel;
```

A trace kept as a numbered view: `model` with a sequence view (`render: "sequence"`) whose steps are the trace's calls
between cards, in time order, each line labelled with its span's name and its duration under it. Spans are matched to
cards as `replay()` matches them; the caption names the services with no card. The view (id `view`, default `"trace"`)
replaces one with that id, else comes last. The model passed in is not changed. No browser needed.

```js
import { sequenceFromTrace } from 'umlimator';
const spans = [
  { id: 's1', service: 'web', start: 0, end: 50 },
  { id: 's2', parent: 's1', service: 'api', start: 5, end: 45, name: 'GET /orders' },
];
const next = sequenceFromTrace(model, spans, { title: 'Checkout trace' });
map.update(next);
map.setView('trace');   // web → api, "GET /orders", "40 ms"
```

## See also

- [render](./render.md#handle): the methods that set marks, play stories and replay traces.
- [Model and schema](./model-and-schema.md#story): stories and lenses in the model.
