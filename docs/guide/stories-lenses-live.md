# Stories, lenses and live data

A map is more useful when it can be read in more than one way. Stories walk a reader through it step by step, lenses
show it by team or by data flow, and live data puts traffic, errors and traces over it, all without laying the view
out again. [`examples/bike-share.json`](../../examples/bike-share.json) uses each of them.

## Stories

`stories` in the model are walk-throughs. Each step sets the view, camera, selection, highlight, tour and a caption;
only `view` is required.

```json
"stories": [
  { "id": "ride", "title": "A ride, from unlock to payment", "steps": [
    { "view": "overview", "caption": "A rider unlocks a bike in the app.", "select": "app" },
    { "view": "trips", "caption": "The trip service starts the trip.", "highlight": ["app", "trips"], "tour": ["app", "trips"] }
  ] }
]
```

| Step field | What it does |
|---|---|
| `select` | a card id, a line id, or a Ref |
| `highlight` | card ids, line ids or Lits; the lines between two cards it names light too |
| `tour` | card ids, the path the dot rides once the step is shown |
| `camera` | `"fit"` (the default), `{ x, y, zoom }`, or `{ card, zoom }` to frame a card |
| `duration` | the step's time in ms while playing (default 4000) |

A step sets the whole picture: what it leaves out is cleared, so a step looks the same whether it is reached from
before or after. `validate()` checks each step.

**Playing one.** `map.play(id, { step, auto })` returns a player (`next()`, `prev()`, `pause()`, `resume()`, `stop()`)
and shows a caption bar with ‹ ▶ › ✕; ← → step through and Esc closes. In the standalone page, the Stories menu plays
one, and `#story=<id>&step=<n>` links to a step.

**Recording one.** In the page, Export ▸ Record a story… turns each view and card you come to into a step, takes
captions, and saves `<id>.story.json` for the model's `stories`. `umlimator.py record PAGE.html --story ID --out
STORY.png` writes a story as an animated PNG ([Command line](./cli.md#record)).

## Lenses

`lenses` are saved ways to look at one map: what a lens picks is lit and the rest dimmed.

```json
"lenses": [
  { "id": "teams", "title": "By team", "color": "owner" },
  { "id": "data", "title": "Data flow", "pick": { "line": ["feeds", "state"] } }
]
```

- **`pick`** is a rule's selector (`id`, `kind`, `container`, `not`, `owner`), with `line` at its top for line kinds.
  Left out, the lens lights everything.
- **`owner`** on a card names who owns it. `color: "owner"` rings each lit card in its owner's tone, the same on every
  view, with a legend naming the view's owners.
- **On the map**, a lens is a layer of `overlay()`, so it never lays the view out again, and it stays on across
  `update()` and `setView()`.

From a host, `map.lens(id | null)`. In the standalone page, the Lenses menu, or `#lens=<id>` in the link.

## Live data

### Marks: `overlay()`

`map.overlay(name, layer | null)` puts marks over the map without touching the model: flow as fast as the traffic,
errors that pulse, slow hops that glow, labels and tabs.

```js
map.overlay('traffic', {
  edges: { e1: { speed: 2, label: '1.2k/s' }, e2: { tone: 'amber', label: '340 ms' } },
  nodes: { db: { tone: 'rose', badge: 'LAG 4s', pulse: true } },
});
```

| Mark | On a line | On a card |
|---|---|---|
| `speed` | the flow's speed, as a factor (0 stops it) | — |
| `tone` | a glow under the line, in `--um-<tone>` | a ring around the card |
| `pulse` | yes | yes |
| `label` | a pill under the line's own | — |
| `badge` | — | a tab after the card's own |
| `level` | how lit, from 0 to 1 | how lit, from 0 to 1 |
| `dash` | a dashed line | — |

Layers stack in the order they were first set; `dim: true` fades whatever a layer doesn't name, and `null` removes a
layer. Marks survive `update()` and `setView()`, and `toSVG()` and `toPNG()` draw them.
[`examples/live.html`](../../examples/live.html) shows its traffic this way, and its model never changes.

### Highlights and tours

- `map.highlight(refs | null)` lights these cards and lines and dims the rest.
- `map.tour(path)` sends a dot along the lines between each pair of cards in turn; it resolves `true` at the end.
- `paths(model, viewId, from, to)` and `reach(model, viewId, from, { backward, depth })` walk a view's lines with no
  DOM, and return Refs for `highlight()`.
- `describe(model, viewId)` puts a view in plain sentences: a text alternative, docs, or context for an AI model
  ([`examples/ask.html`](../../examples/ask.html) answers questions this way).

### Traces

- `map.replay(spans, { duration, match })` plays a trace: each call runs along its line at the trace's relative time,
  and keeps its duration as a label. `otlpSpans(json)` reads spans from an OpenTelemetry trace in OTLP JSON
  ([`examples/replay.html`](../../examples/replay.html)).
- `sequenceFromTrace(model, spans, { view, match })` keeps a trace as a numbered view, to review in a pull request.
  From the command line, `umlimator.py trace model.json trace.json --view ride-end --match match.json --out model.json`;
  with `--diagram uml.sequence`, as a UML sequence diagram.

### Budgets

Lines may carry `latency` (ms) and `cost` (any unit). They are not drawn, but:

- `critical(model, viewId, { from, to, by })` returns the slowest or costliest path and its total;
- `whatIf(model, viewId, { remove })` returns what loses its way if those cards go down.

The standalone page's details panel has ⏱, ¤ and ⊘ for both.

### Drift

`drift(model, observed)` compares the map with the traffic seen (a Jaeger or Tempo dependency list): a line that ran but
is not drawn comes in rose and dashed, and a drawn line that carried nothing fades. See
[GitHub Action and diff](./github-action.md#drift-and-time-lapse).
