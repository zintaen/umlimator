# Examples

Every example below is live at **[zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)**, built from `main`.
The systems are made up.

## Maps

Each map is a JSON model. CI turns it into a self-contained page (`python3 umlimator.py render`) and checks its layout.

| Model | Use case | What it shows |
|---|---|---|
| [`bookshop.json`](bookshop.json) | A product's architecture, in two levels | Brand logos, the details panel, a step-by-step order flow with a tour |
| [`bike-share.json`](bike-share.json) | A C4-style drill-down: context, containers, components | Boxes with tabs, a line to a box, line kinds and weights, a technology under each label, coloured tabs, a planned card, edited marks, a view pinned by hand, cards with no lines, two views loaded when opened, two rules that hold |
| [`weather.json`](weather.json) | A data pipeline | A process in five steps, weights by volume, a pair of lines kept apart, nested boxes, a line from a box, a loop back, swimlanes, a view list in a set order |
| [`assistant.json`](assistant.json) | An AI agent's skills | Skill kinds (public, lane, external, verb, script, hook, board), chips under a sub-line, guard and state lines, steps that exist in one view only, a card changed for one view, kinds read from labels |

[![Bike share: the boxed view](https://zintaen.github.io/umlimator/examples/stills/bike-share/system.png)](https://zintaen.github.io/umlimator/examples/bike-share.html)

Bike share's story, as `umlimator.py record` writes it (CI records it for the site): open it in the page with
[`#story=ride&step=1`](https://zintaen.github.io/umlimator/examples/bike-share.html#story=ride&step=1), or from its Stories menu.

![Bike share: a ride, from unlock to payment, in five steps](https://zintaen.github.io/umlimator/examples/stills/bike-share/story-ride.png)

## Host pages

The module embedded in a page, as an app would use it. Serve the repository over HTTP to open them locally
(`python3 -m http.server`, then `http://localhost:8000/examples/`).

| Page | What the host does |
|---|---|
| [`playground.html`](playground.html) | Edit a model as JSON and the map follows, with `validate()`'s problems, and the broken rules (`rules()`) and `check()`'s layout issues for the view shown, each selecting what it is about; Share puts the model in the link |
| [`embed.html`](embed.html) | `render()` with a details panel from `select`, breadcrumbs from `viewchange`, a view loaded when a card opens it (`open`, `update()`, `setView()`) or unfolds it in place (`expand`, `map.expand()`), SVG and PNG export, light, dark and a host's own palette, the minimap, focus back to the map |
| [`live.html`](live.html) | `overlay()` once a second, the model unchanged: flow as fast as each line's readings, lines that drop readings pulse rose, slow ones glow amber with their delay, and each card's tab shows its lag |
| [`ask.html`](ask.html) | Questions answered on the map: words, the cards and lines they are about lit (`highlight()` with `paths()` and `reach()`), a flow played as a `tour()`, and the view in sentences (`describe()`), the text an AI model would get |
| [`replay.html`](replay.html) | A trace replayed (`replay()`): an OpenTelemetry export read by `otlpSpans()`, each call along its line at its time, its duration kept as a label, with pause and stop |
| [`edit.html`](edit.html) | `editable`: the map emits `change` events, the host applies them and calls `update()`, with undo from `history()` |
| [`timelapse.html`](timelapse.html) | Four made-up releases of the bike share on a slider: `update()` eases from one to the next (new cards fade in, removed ones fade out, moved ones glide), `diff()` says what changed and marks it on request |
| [`drift.html`](drift.html) | `drift()`: the bike share against a week of made-up traffic, as a tracing backend lists it; the lines that ran undrawn come in, the drawn ones that carried nothing fade |
| [`layout.mjs`](layout.mjs) | `layout()` in Node, with no DOM: lays out every view and fails when a line runs more than 3 times its direct route, a check a host can run in CI |

[`icons.js`](icons.js) shows how a host gives `render()` the line icons in `icons/`.

## Where each feature is shown

| Feature | Where |
|---|---|
| Views a card opens (`opensView`) | bike-share (three levels), weather, assistant, bookshop |
| A view the host loads when it's opened (`opensView` with `opensCount`) | bike-share: Trip service and Fleet service, in `embed.html` |
| A stacked card unfolded in place (E, Alt + click, `map.expand()`) | bike-share: Trip service and Fleet service in `system`, Bike share in `context`; weather: Check in `stages`, Quality check in `flow` |
| Boxes (`containers`) and their tabs (`badges`) | bike-share `system`, weather `check` |
| Nested boxes (`parent`) | weather `check` |
| A line to or from a box | bike-share `system` (Monitoring → Rides), weather `check` (Checks → Quarantine) |
| Line kinds (`kind`: calls, feeds, triggers, state, guard) | bike-share, weather, assistant `answer` |
| Line weights (`weight`) | bike-share, weather, `live.html` |
| A line's second label (`sublabel`) | bike-share (REST, gRPC, MQTT) |
| The sides a line uses (`fromSide`, `toSide`) | bike-share `system` and `fleet`, weather `flow` |
| Tabs on cards (`badges`, with `tone`) | bike-share (SSO, v2 beta, 3 partitions), `live.html` |
| Line icons and brand logos (`icon`) | every model; logos in bookshop |
| Chips (`verbs`) and `subAndChips` | assistant |
| A card with its name only (`noSub`) | bike-share (Payment provider) |
| Edited and planned marks (`edited`, `change: "planned"`) | bike-share (Pricing, Charging), assistant (phone calls) |
| Cards with no lines in a row of their own | assistant (the hooks, phone calls) |
| Positions set by hand (`layout`) | bike-share `system`, assistant `answer` |
| Space between columns and rows (`gap`, `rgap`) | weather `check` |
| A→B and B→A as two lines (`keepPairs`) | weather `flow` |
| A view's loop back (`loop: true`) | weather `check` |
| Steps in run order (`render: "sequence"`) and a tour | bookshop `api`, weather `forecaster`, assistant `answer` |
| Swimlanes (`lanes`) | weather `forecaster` |
| A process in steps (`render: "process"`, `stepIds`) | weather `stages` |
| The view list's order (`browserOrder`) | weather `stages` |
| Cards that only one view has (a view's `nodes`), and per-view changes (`nodeOverrides`) | assistant `answer` |
| Kinds read from labels (`kindsFromLabels`) | assistant |
| Skill-map kinds | assistant |
| `render()`, its events, `update()`, `setView()`, `focus()`, `toSVG()`, `toPNG()`, themes | `embed.html` |
| Marks over the map (`overlay()`): flow speed, glows, pulses, labels, tabs | `live.html`, `replay.html` |
| Paths and reach lit (`paths()`, `reach()`, `highlight()`) | `ask.html`; every map on the site (the details panel's → and ←, or Shift-click a second card and ⇄) |
| A view in sentences (`describe()`), a tour along any path (`tour()`) | `ask.html` |
| A trace replayed (`replay()`, `otlpSpans()`) | `replay.html` |
| A story told step by step (`stories`, `play()`), its Stories menu and recording in the page, `umlimator.py record` | bike-share (`ride`: a ride from unlock to payment), on the site; pictured under Maps |
| Editing and undo (`editable`, `change`, `history()`) | `edit.html` |
| `layout()` in Node | `layout.mjs` |
| The model's JSON Schema (`"$schema"`), `validate()` and `check()` | every model (`"$schema"`), `playground.html` |
| The standalone page (`mountPage`) and the CLI's `render`, `check` and `stills` | every map on the site, built by CI |
| Rules on the map (`rules`: `from` and `to` by kind, id or box, and `not`; a rule that names a box holds where it is drawn) and `rules()` | bike-share (two rules, which hold; CI's check fails if one breaks), `playground.html` (break one: add a line from Rider app to Trips database) |
| What changed between two models (`diff()`): NEW, CHANGED and REMOVED marks, and the summary in words | `timelapse.html` (Mark what changed); the CLI's `diff` and the diff Action (`action.yml`) |
| The time-lapse: `update()` easing into the next model | `timelapse.html`; the CLI's `timelapse` writes one from a model's git history |
| The map against the traffic seen (`drift()`), and the line style `faded` | `drift.html`; the CLI's `drift` |

Not shown: `repair: false`, a switch for debugging the router.
