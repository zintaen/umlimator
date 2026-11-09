# Examples

Every example below is live at **[zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)**, built from `main`.
The systems are made up.

## Maps

Each map is a JSON model. CI turns it into a self-contained page (`python3 umlimator.py render`) and checks its layout.

| Model | Use case | What it shows |
|---|---|---|
| [`bookshop.json`](bookshop.json) | A product's architecture, in two levels | Brand logos, the details panel, a step-by-step order flow with a tour |
| [`bike-share.json`](bike-share.json) | A C4-style drill-down: context, containers, components | Boxes with tabs, a line to a box, line kinds and weights, a technology under each label, coloured tabs, a planned card, edited marks, a view pinned by hand, cards with no lines, two views loaded when opened |
| [`weather.json`](weather.json) | A data pipeline | A process in five steps, weights by volume, a pair of lines kept apart, nested boxes, a line from a box, a loop back, swimlanes, a view list in a set order |
| [`assistant.json`](assistant.json) | An AI agent's skills | Skill kinds (public, lane, external, verb, script, hook, board), chips under a sub-line, guard and state lines, steps that exist in one view only, a card changed for one view, kinds read from labels |

[![Bike share: the boxed view](https://zintaen.github.io/umlimator/examples/stills/bike-share/system.png)](https://zintaen.github.io/umlimator/examples/bike-share.html)

## Host pages

The module embedded in a page, as an app would use it. Serve the repository over HTTP to open them locally
(`python3 -m http.server`, then `http://localhost:8000/examples/`).

| Page | What the host does |
|---|---|
| [`embed.html`](embed.html) | `render()` with a details panel from `select`, breadcrumbs from `viewchange`, a view loaded when a card opens it (`open`, `update()`, `setView()`), SVG and PNG export, light, dark and a host's own palette, the minimap, focus back to the map |
| [`live.html`](live.html) | `update()` once a second with new line weights and tab colours: cards keep their places, and the view and camera stay |
| [`edit.html`](edit.html) | `editable`: the map emits `change` events, the host applies them and calls `update()`, with undo from `history()` |
| [`layout.mjs`](layout.mjs) | `layout()` in Node, with no DOM: lays out every view and fails when a line runs more than 3 times its direct route, a check a host can run in CI |

[`icons.js`](icons.js) shows how a host gives `render()` the line icons in `icons/`.

## Where each feature is shown

| Feature | Where |
|---|---|
| Views a card opens (`opensView`) | bike-share (three levels), weather, assistant, bookshop |
| A view the host loads when it's opened (`opensView` with `opensCount`) | bike-share: Trip service and Fleet service, in `embed.html` |
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
| `render()`, its events, `update()`, `setView()`, `focus()`, `toSVG()`, `toPNG()`, themes | `embed.html`, `live.html` |
| Editing and undo (`editable`, `change`, `history()`) | `edit.html` |
| `layout()` in Node | `layout.mjs` |
| The standalone page (`mountPage`) and the CLI's `render`, `check` and `stills` | every map on the site, built by CI |

Not shown: `repair: false`, a switch for debugging the router.
