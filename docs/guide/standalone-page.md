# The standalone page

`umlimator.py render` writes one self-contained HTML file: the module inlined, the model in the page, and nothing
fetched. It opens from disk in any browser, works offline, and can be attached to an issue or hosted as it is.

```bash
python3 umlimator.py render examples/bookshop.json --out page.html   # the interactive page, then its layout check
```

The same viewer is `mountPage(container, model)` in the module, built on `render()` through the public API.

## What the page has

| Feature | How to reach it |
|---|---|
| Breadcrumbs and a views list | the path above the map; ☰ or O for the list |
| A details panel per card | select a card; `[` and `]` move between its tabs |
| Search | ⌘K (Ctrl + K) |
| Paths and reach | → and ← in the details panel (or the > and < keys) light what a card leads to and what leads to it; with two cards selected, ⇄ (or P) lights every path between them |
| Budgets and what-if | ⏱ and ¤ light the slowest or costliest path from a card; ⊘ lights what loses its way if the card goes down |
| Stories and lenses | the Stories and Lenses menus, when the model has any ([Stories, lenses and live data](./stories-lenses-live.md)) |
| Light and dark | the ◐ toggle |
| Export | SVG, PNG, and Record a story… |

## Links

A view, a selected card, a story step or a lens can be linked to. A selected line or box is not kept in the link:

| Link | Opens |
|---|---|
| `#view=<id>&node=<id>` | a view, with a card selected |
| `#story=<id>&step=<n>` | a story at a step (1-based), shown but not playing on |
| `#lens=<id>` | the page with a lens on |

## Keyboard and screen readers

Cards, then lines, are in the Tab order (a card's tabs and chips too, for a host that listens for click). Arrow keys move between cards. Enter selects the focused card, and Enter on the selected card opens its view. Esc or Backspace clears the selection, and with nothing selected goes back up. Selections are announced in the map's live region, and `describe(model, viewId)` gives a view in plain sentences for a text alternative.

## Exports

- **SVG and PNG**: any view as a stand-alone file, from the page's Export menu, from `map.toSVG()` and `map.toPNG()`
  in a host, or from `umlimator.py stills`.
- **PDF**: the whole map as one document to hand in for a review: a cover with the contents, each view with its
  legend and tables of its cards, lines and boxes, then the rules (`umlimator.py pdf`; see [Command line](./cli.md#pdf)).
- **Animated PNG**: a story, frame by frame (`umlimator.py record`).

## For scripts and tests

The page keeps its map's handle on `window.umlimatorMap`: the `Handle` that `render()` returns (`setView()`,
`highlight()`, `tour()`, `play()` ...).
