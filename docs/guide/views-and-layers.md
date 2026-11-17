# Views and layers

A map is a set of views over one model: one view per level (system, containers, components, flows). A card on one
view can open the next, so a reader starts at the overview and drills down. This page covers how views relate, how
they are laid out, and the checks that keep them readable.

## Views

Each view lists the cards it shows in `nodeIds`, and draws every model edge between them unless it lists its own
`edges`. A view's `parent` names the view above it; the view with no parent (or the model's `root`) opens first.

```json
"views": [
  { "id": "overview", "parent": null, "title": "Bookshop", "nodeIds": ["web", "api", "db"] },
  { "id": "api", "parent": "overview", "title": "Orders API", "nodeIds": ["api", "orders", "payments", "db"] }
]
```

| Field | What it does |
|---|---|
| `nodeIds` | the cards the view shows |
| `edges` | edge ids or edge objects; by default every model edge between the view's cards. `[]` hides all lines |
| `parent` | the view above, for breadcrumbs and the views list |
| `caption` | one line under the title |
| `containers` | boxes: `[{ "id", "label", "nodeIds", "parent" }]`, nested by `parent` |
| `layout` | `[col, row]` per card; cards it leaves out are placed around the ones it pins |
| `render: "sequence"` | a numbered run-order view: its edges are the steps, in order |
| `render: "process"` | a compact left-to-right process of four to six bold, numbered steps |
| `lanes` | swimlanes for a sequence view, or `false` to turn derived lanes off |
| `nodeOverrides` | a card's label, sub-line or drill-down changed in this view only |

The full list is in [`engine/references/schema.md`](../../engine/references/schema.md) (§ Map model) and in
[The model](./model.md).

## Drill-down

A card opens a view when its `opensView` names one, or when a view shares its id. Such a card draws as a stack with a ⤢ badge; double-click (or Enter on the selected card) opens it, and Esc or Backspace, with nothing selected, goes back up. A host can load the inner view only when it is asked for: `opensView` may name a view that is not in the model yet, and `opensCount` sets the number on the badge. Cancel the `open` event to stay on the view, then load the next one and call `update()`.

## Unfolding in place

A stacked card can also open into a box on the map it is on: press E, or Alt + click. Its inner view's cards appear
inside the box and the lines to it move onto them, while the rest of the picture keeps its order. From a host,
`map.expand(id)` unfolds a card and `map.collapse(id)` folds it; `layout(model, view, { expand })` draws the same in
Node, and `umlimator.py check page.html --expand` also checks each view with each stacked card unfolded.

## Layout and routing

The layout is automatic and deterministic: the same model gives the same picture.

- Cards are placed in columns in reading order, each column ordered so the lines cross as little as they can, those
  that skip columns included.
- Each card sits level with the cards its lines come from, in its box or outside it, so lines run straight.
- Lines are orthogonal and never run through a card, every label gets room, and containers are kept apart.
- Cards with no lines go in a row of their own, under the view or at the bottom of their box.

A view's `layout` pins cards where you want them; `gap` and `rgap` set the space between columns and rows. When a
picture still needs help, [the model's map fields](./model.md#map-fields) list the rest (`keepPairs`, `repair`,
`fromSide`, `toSide`).

## Card shapes

Maps use one card style, the union of what the C4 model's tools and UML 2.5 draw: people, robots, browser apps, phones,
terminals, queues, packages, hosts, data stores, files and hooks, each by its card's kind, and a rounded box where no
shape says more. A card's own `shape` wins. Each shape keeps to its card's box, so the layout is the same
([`examples/notations.html`](../../examples/notations.html)).

## The layout check

`check(model, viewId)` in the module, and `umlimator.py check` from the command line, report what makes a view hard to
read: crossings, shared lines, detours, labels on lines, and text that overflows its card. `umlimator.py render` runs
it after writing a page.

## Rules

A model can say what must hold, and the map marks where it breaks:

```json
"rules": [
  { "id": "no-direct-db", "title": "Apps never call a database directly",
    "from": { "kind": "frontend" }, "to": { "kind": "database" } },
  { "id": "teams", "title": "No cycles between teams' boxes", "noCycles": true }
]
```

A rule forbids lines `from` some cards `to` others (picked by id, kind, box or owner), or cycles between boxes.
`rules(model)` lists every break, view by view, and `umlimator.py check` reports them and exits 1, so CI fails on a
broken rule. The exact selector syntax is in [`lib/umlimator.schema.json`](../../lib/umlimator.schema.json) and
[`docs/module-api.md`](../module-api.md) (§ Rules on the map).

## Typed diagrams

A view whose `diagram` is set draws one of the 28 diagram types in its own notation instead of map cards. A typed
element can still open another view: a C4 element opens the next level, a call behaviour action opens the activity it
calls, a collapsed BPMN sub-process opens its own view. The Bookshop atlas
([`examples/bookshop-atlas.json`](../../examples/bookshop-atlas.json)) joins a view of every type into one map you can
click through.
