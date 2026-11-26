# Stories, lenses and live data

A map is more useful when it can be read in more than one way. Stories walk a reader through it step by step, lenses
show it by team or by data flow, and live data puts traffic, errors and traces over it, all without laying the view
out again. [`examples/umlimator-atlas.json`](../../examples/umlimator-atlas.json) has two stories: a pull request
from push to comment, and an assistant showing a reader the map.

## Stories

`stories` in the model are walk-throughs. Each step sets the view, camera, selection, highlight, tour and a caption;
only `view` is required.

```json
"stories": [
  { "id": "pull-request", "title": "A pull request, from push to comment", "steps": [
    { "view": "overview", "caption": "A pull request changes a model. GitHub starts the diff Action.", "select": "action" },
    { "view": "overview", "caption": "The Action posts one comment on the pull request.", "highlight": ["github", "action"], "tour": ["action", "github"] }
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

A story may name its `audience` (`"business"`, `"engineering"`, any name); the standalone page's Stories menu lists the stories that name none first, then each audience's in a group under its name. A story's `chapters` are stories of their own, each with `at`, the step (0-based) it is offered at:

```json
{ "id": "order", "title": "An order", "audience": "business", "steps": [ ... ],
  "chapters": [{ "id": "refund", "title": "When the card is declined", "at": 3, "steps": [ ... ] }] }
```

A step sets the whole picture: what it leaves out is cleared, so a step looks the same whether it is reached from
before or after. `validate()` checks each step.

**Playing one.** `map.play(id, { step, auto })` returns a player (`next()`, `prev()`, `pause()`, `resume()`, `stop()`)
and shows a caption bar with ‹ ▶ › ✕; ← → step through and Esc closes. In the standalone page, the Stories menu plays
one, and `#story=<id>&step=<n>` links to a step.

**Scrubber and chapters.** Under the caption, a scrubber goes to any step: drag it, or use its own keys (the arrows, Page Up and Page Down, Home and End), and playing goes on from there at the map's speed. A chapter is offered as a button in the bar while its step shows, and ticked on the scrubber; pressed, the bar tells the chapter (`An order › When the card is declined · 1 / 3`), and ↩, its end or ‹ on its first step returns to the story at that step. From a host, the player has `go(k)`, `chapters`, `enter(id)`, `back()` and `chapter`. A chapter's step is in no page link.

**From the main flow.** `storyFromFlow(model, viewId)` tells a story from a view's main flow (the lines marked `flow: "main"`, else its steps, else its longest path of flow lines), with no story written by hand: a step per card on the main flow, each selecting the card, lighting it and the main line into it, riding that line, and saying what the line does, from its `what` or its label (`"4. Charges: Cart charges Payments."`). A dependency line is no step: the store it reads or writes is named in the caption (`"5. Ships: Payments ships Shipping; reads Orders."`). On a typed view the type says which lines are dependencies (a DFD flow to or from a data store, a comment link), and the main flow is the one its arranged picture draws as the main row; a view whose type reads no flow, such as a use case or class view, has none. Each branch off the main flow comes back as a chapter, a story of its own with `at`, the step it leaves from. A sequence view tells its messages in order, a BPMN view its main path, from the start event whose path is longest (in a collaboration, the main process the arranged picture draws), a communication view its numbered messages in time order (`"1.1. place(order): storefront calls api."`). With `audience: "business"` the captions leave out the stores. The story is not added to the model: `map.play(story)` plays it as given, its branches offered as chapters, and the page's link does not name it. In the standalone page, on a view with `arrange: "flow"`, the Stories menu offers **From the main flow**, which plays it; on a view that is not arranged it is not offered. From an assistant, the MCP tool `story_from_flow` returns it, and `play_story` plays it on the page as it is, without writing the model ([MCP server](../use/mcp.md)). See [`storyFromFlow()`](../api/apply-and-commands.md#storyfromflow).

**From a pull request's diff.** `storyFromDiff(before, after, viewId)` tells what a change does to a view: a step per card and line it adds, changes or removes, along the view's main flow, each captioned `"Added: ..."`, `"Changed: ..."` or `"Removed: ..."`. `umlimator.py diff --story` puts one per changed view in the diff page's Stories menu, and the MCP tool `story_from_diff` returns one ([`storyFromDiff()`](../api/apply-and-commands.md#storyfromdiff)).

**Recording one.** In the page, Export ▸ Record a story… turns each view and card you come to into a step, takes
captions, and saves `<id>.story.json` for the model's `stories`. `umlimator.py record PAGE.html --story ID --out
STORY.png` writes a story as an animated PNG ([Command line](../use/cli.md#record)).

**Speed.** The speed button on the map's controls (`1×`) steps through 0.5x, 1x, 1.5x and 2x, and scales tours, story steps and the flow along lines together: at 2x a step of 4000 ms lasts 2000 ms. The standalone page remembers the reader's choice in their browser. An author sets a map's own speed with `"motion": { "speed": 1.5 }` in the model, and a link with `#speed=1.5`; the reader's choice outranks both, and a host sets `map.speed`. The Right arrow (or Page Down) skips to the next step at once, even while its tour rides, and the step is said to screen readers. Under reduced motion the dot and the flow stay still at any speed; a step's time still scales.

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
| `speed` | the flow's speed, as a factor (0 stops it), times the map's motion speed | — |
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
  From the command line, `umlimator.py trace model.json trace.json --view checkout --match match.json --out model.json` (`match.json` is your own file of service names to card ids);
  with `--diagram uml.sequence`, as a UML sequence diagram.

### Budgets

Lines may carry `latency` (ms) and `cost` (any unit). They are not drawn, but:

- `critical(model, viewId, { from, to, by })` returns the slowest or costliest path and its total;
- `whatIf(model, viewId, { remove })` returns what loses its way if those cards go down.

The standalone page's details panel has ⏱, ¤ and ⊘ for both.

### Drift

`drift(model, observed)` compares the map with the traffic seen (a Jaeger or Tempo dependency list): a line that ran but
is not drawn comes in rose and dashed, and a drawn line that carried nothing fades. See
[GitHub Action and diff](../use/github-action.md#drift-and-time-lapse).
