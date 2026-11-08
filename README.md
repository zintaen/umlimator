# umlimator

[![check](https://github.com/zintaen/umlimator/actions/workflows/check.yml/badge.svg)](https://github.com/zintaen/umlimator/actions/workflows/check.yml)

Layered, animated architecture maps you can click through, plus still pictures of each layer for documents that
cannot run a web page (a wiki such as Confluence, a slide deck). One JSON model in, one self-contained HTML page out.

umlimator is built on the `/visual` skill of [super-board](https://github.com/EricTechPro/super-board) by Eric Tech:
its renderer, viewer and layout check began as a copy and are now umlimator's own module, `lib/umlimator.js`, which
any page can embed (see [Embed](#embed) and [Credits](#credits)). The idea of
official brand marks on cards, and the script that fetches them, come from
[stack-diagram](https://github.com/caru-ini/stack-diagram) by caru-ini.

![The example model's overview: a made-up bookshop with logos, line icons and a numbered flow behind the API card](examples/stills/overview.png)

## What it gives you

- One self-contained HTML page per model: no build step, nothing loaded at runtime, works offline.
- Layers: a view per level (big picture, containers, components, flows); a stacked card opens its inner view with a
  double-click; breadcrumbs, Esc and the back button go up; `#view=<id>&node=<id>` deep-links.
- Animated flow along the lines (the ≋ button, paused and played with ❚❚), neighbours lit when you click a card,
  numbered steps in run-order views, minimap, ⌘K search, light and dark themes.
- A details panel per card: When to use, What it is, How it works and Behind the scenes, technology chips, and a
  badge (PROPOSED, TARGET, OFF ...) coloured by the status it names.
- Icons on cards: a product's official logo on a white tile, or a line icon for what the card is (a person, a
  server, a key): one 28 px mark on the left of the card, with the name and sub-line beside it.
- Tours: a view's `tour` (card ids in order, each pair joined by a line) sends a dot along the path every 8 s and
  lights each card as it arrives.
- Room for labels: a gap between two columns widens to fit the widest label crossing it, with 27 px of line on each
  side, so a label never swallows its arrow.
- A layout check: crossings, shared lines, labels on lines or box borders, text overflow, names that touch a card's
  mark, and labels that leave too little of their own line, per view.
- Stills: every view as SVG and PNG, light by default, for documents and slides.

## Use

```bash
python3 umlimator.py render examples/bookshop.json --out page.html   # the interactive page, then its check report
python3 umlimator.py stills page.html --out stills/                   # stills/<view>.svg and .png for every view
python3 umlimator.py stills page.html --out stills/ --views overview,api --scale 1.5 --theme light --reader
python3 umlimator.py check page.html --views 'pic-*'                   # the layout check on chosen views (a trailing * is a prefix)
python3 umlimator.py check page.html --ignore right-to-left           # leave a whole kind of finding out of the report
```

`stills` skips a view whose inputs are unchanged since its last export (its cards, lines, icons, the engine and
the options; recorded in `<out>/.stills.json`); `--all` exports every view. `--scale` takes fractions: 1.5 is plenty
for a picture a wiki shows at page width.

`model.json` follows `engine/references/schema.md` (§ Map model): shared `nodes` and `edges`, and `views` that each
show a subset, with optional `containers` (zone boxes), `layout` ([col, row] per node), `render: "sequence"` for
numbered run-order views, `tour` for a dot that rides a path, and inline view-local edges. `examples/bookshop.json` uses most of it.

Kinds for architecture maps: `frontend` (client / UI), `backend` (service / API), `ai` (agent / model), `database`,
`queue`, `security` (checks, secrets, identity), `cloud` (hosts, observability), `external` (outside the system),
`file`. super-board's skill-map kinds (`public`, `lane`, `script`, `hook`, `board`, `verb`) still work.

Needs Python 3.9+ (standard library only) and, for `stills` and `check`, Google Chrome or Chromium. The first render
that names a brand logo needs network access (see [Icons](#icons)).

## Icons

A node's `icon` names an entry in `icons/manifest.json`.

- **Line icons** ship in `icons/`: [Lucide](https://lucide.dev) (ISC; a few derive from Feather, MIT). They take the
  card's kind colour.
- **Brand logos are not shipped.** They are their owners' trademarks and several sources do not allow
  redistribution. The manifest records each logo's official source and a sha256. The first render that needs a logo
  downloads it into `~/.cache/umlimator/icons` (or `$UMLIMATOR_ICON_CACHE`) and uses it only if the hash matches, so
  a picture never changes because a source did. A logo is never recoloured.

Sources: [svgl](https://svgl.app), then [devicon](https://devicon.dev), then
[gilbarbara/logos](https://github.com/gilbarbara/logos), through stack-diagram's `tools/fetch_icons.py`;
Microsoft's [Azure](https://learn.microsoft.com/azure/architecture/icons/) and
[Entra](https://learn.microsoft.com/entra/architecture/architecture-icons) architecture icons; or a brand's own site.
Microsoft allows its icons in architecture diagrams, training material and documentation; follow each brand's
guidelines for anything else. Add an icon with:

```bash
python3 -I tools/fetch_icons.py icons "name:slug"            # a brand: svgl, then devicon, then gilbarbara/logos
python3 -I tools/fetch_icons.py icons "name=https://..."     # a brand's own official file
python3 -I tools/fetch_icons.py icons "name:lucide/<icon>"   # a line icon (lucide.dev/icons)
python3 -I tools/fetch_icons.py icons "name:gcp/Cloud-Run"   # an official Google Cloud icon (also aws/, azure/)
python3 umlimator.py pin-icons                                # records each new brand logo's sha256 and moves it out of icons/
```

## What was changed from super-board, and why

Until November 2026 umlimator patched super-board's template at exact anchors (`patches/apply.py`; its comments give
the reason for each of the 40 patches and stay in the git history). The engine then moved into an ES module,
`lib/umlimator.js`, which anchored patches cannot express, so it is now umlimator's own code. The main changes:

1. `external` keeps its architecture meaning in map mode; upstream it became "External skill" with an author tag.
2. Architecture kinds get legend wording and appear in the legend.
3. A node's `badge` shows as the card's tab, coloured by the status it names, and in the details panel.
4. `#still=<view>&scale=N&theme=light` renders one view as a stand-alone SVG, which `umlimator.py stills` saves with
   headless Chrome.
5. A card name too wide for its card wraps onto two lines instead of ending in "…" (a still has no hover).
6. A line label with no free spot is placed anyway, never over a card; box titles are obstacles for lines and labels.
7. A line's own `style` (`emphasis`, `dashed`, `security`) wins over the map's colour by kind.
8. A view's `gap` and `rgap` set the space between columns and rows; `keepPairs` draws A→B and B→A as two lines; an
   edge's `fromSide` / `toSide` picks the sides its line uses.
9. `#check=1&views=a,pic-*` checks only those views, so a large model's chosen pictures check in seconds.
10. A node's `icon` draws a logo or a line icon as one 28 px mark on the left, centred vertically, with the name and
    sub-line left-aligned beside it; the check reports a name that touches the mark.
11. Routing is fast enough for a 50-module view: the router's grid marks obstacles and earlier lines near them instead
    of testing every cell against every one, its search is A* on typed arrays (same routes on every benchmark view),
    and port repair re-routes only the two edges it swaps, within a budget of 2 routings per edge. A view's
    `repair: false` turns port repair off.

`render` skips upstream's layout search when every view already has a layout, and fails when the check did not
complete instead of reporting no problems.

Model fields umlimator adds: a node's `badge`, `icon` and `noSub` (name only, description in the panel); a view's
`gap`, `rgap`, `keepPairs` and `repair` (`false`: no port repair); an edge's `fromSide` and `toSide`; a node's `badges` (several,
each a string or `{text, tone}`) and a node's or edge's `edited` (draws a marker).

The engine derives from super-board commit `d0b7d5a` (29 Oct 2026). `engine/scripts/visual.py` and
`engine/references/` are still upstream's, unmodified, and CI checks that they are. CI also warns weekly when
super-board changes its template, so a fix there can be ported into `lib/umlimator.js` by hand.

## Embed

```js
import { render } from 'umlimator';   // lib/umlimator.js: one ES module, no dependencies, no build step
import 'umlimator/theme.css';         // the default --um-* palette and fonts (optional: set the variables yourself)
const map = render(document.getElementById('map'), model, {
  on: { select: e => showDetails(e.target), open: e => { e.preventDefault(); router.push(e.view); },
        click: e => { if (e.target.type === 'chip') { e.preventDefault(); openFeature(e.target.value); } } },   // a chip as a link: no select
});
map.update(nextModel);   // redraws only views whose cards or lines changed; keeps view, camera and selection
const file = map.toSVG({ scale: 2 });   // the current view as a stand-alone .svg, in the browser
const png = await map.toPNG({ view: 'api' });   // any view, as a PNG Blob, without showing it
map.focus();   // keyboard focus back on the selected card (say, when the host's own dialog closes)
render(el, model, { editable: true, on: { change: c => { model = myApply(model, c); map.update(model); } } });
map.destroy();
```

In React (or any framework), mount once and pass new models to `update`:

```jsx
function MapView({ model, onSelect }) {
  const el = useRef(null), map = useRef(null), cb = useRef(onSelect);
  cb.current = onSelect;   // the latest callback, without re-mounting the map
  useEffect(() => {
    map.current = render(el.current, model, { on: { select: e => cb.current?.(e.target) } });
    return () => map.current.destroy();
  }, []);
  useEffect(() => { map.current?.update(model); }, [model]);   // cheap when nothing changed
  return <div ref={el} style={{ height: 600 }} />;
}
```

`render` draws one view at a time into a shadow root inside the element (give the element a height), keyboard and
screen-reader friendly (cards are named buttons; arrows move between them; selections are announced), with drill-down
into inner views, pan and zoom, and events for every card, line, container and chip, each named by ids from the model.
`layout(model, viewId)` returns a view's geometry without a DOM (Node works too). Colours are `--um-*` CSS variables
(defaults in `lib/umlimator-theme.css`; set them on any ancestor, light or dark as the host decides), fonts are the
host's (`--um-sans`, `--um-mono`), text is measured in that font, and nothing is fetched. `mountPage` is the whole viewer that
`umlimator.py render` writes. The API, its types and the reasons behind it: [docs/module-api.md](docs/module-api.md),
`lib/umlimator.d.ts`. With `editable`, gestures (add, rename, move into a container, delete, reorder, connect) emit
`change` events and change nothing themselves: the host applies them to its own data and calls `update`
([docs/editing.md](docs/editing.md); `examples/edit.html` is a working host, served over HTTP). `toSVG()` returns a view as a stand-alone SVG file (`toPNG()` the same as a PNG): the host's colours and fonts
resolved into it, drawn at rest (no selection, hover, flow or edit handles), with no headless browser. Install from git: `"umlimator": "github:zintaen/umlimator#<tag>"`.

```bash
node --test               # layout(): the benchmark views' geometry, ids, repair flag (no browser)
python3 tests/embed.py    # render() in headless Chrome, imported over local HTTP: events, update, colours, editing
```

## Benchmarks

```bash
python3 bench/bench.py                       # each view of bench/models/*.json and the example: median ms per phase
python3 bench/bench.py --models m50 --optimize --save
python3 bench/bench.py --check-determinism --max-ms m50=1000 --expect bench/expected.json
```

`bench/models/` holds fixed models of 10, 26 and 69 nodes and one of 50 modules with 100 edges, written once by
`bench/gen.py`. The bench opens each view in headless Chrome (`#bench=1`) and reports lane planning,
placement, routing, port repair (its rounds and the port swaps it tried), the total, the layout check's route issues
and a hash of the geometry; `--optimize` adds render's layout search. `--save` keeps the numbers in `bench/results/`;
`--expect` fails on a view whose geometry differs from a saved run's (`bench/expected.json` is the reference, which a change
that moves routes on purpose refreshes with `--write-expected`), and a view with `repair: false` that repairs
fails the run. On 6 Nov 2026 the 50-module view did not finish in 30 minutes; it now lays out in about 0.9 s.

## Layout

```
umlimator.py                 CLI: render, stills, check, pin-icons
lib/umlimator.js             the module: layout, routing, drawing, render(), layout(), mountPage(); and its types
engine/assets/template.html  the page around it (derived from super-board's /visual template); render inlines lib/
engine/scripts/visual.py     super-board /visual renderer and checker (unmodified)
engine/references/           super-board's model schema and section guide (unmodified)
docs/module-api.md           the module's API and the decisions behind it
tests/                       layout() in Node; render() embedded in headless Chrome
bench/                       benchmark models, harness and recorded results
icons/                       Lucide line icons and manifest.json (brand logos: sources and hashes only)
tools/fetch_icons.py         stack-diagram's icon fetcher (unmodified)
examples/                    a made-up bookshop: model, page and stills
LICENSE, LICENSE.super-board, LICENSE.stack-diagram, THIRD_PARTY_NOTICES.md
```

## Credits

- **[super-board](https://github.com/EricTechPro/super-board)** by Eric Tech, MIT (`LICENSE.super-board`). umlimator
  is built on its `/visual` skill (commit `d0b7d5a`): `lib/umlimator.js` and `engine/assets/template.html` derive from
  its template (modified), `engine/scripts/visual.py` and `engine/references/` are copied unmodified. Its renderer,
  layered viewer, layout search and layout check are super-board's work.
- super-board's `/visual` in turn adapts ideas from **[BuilderIO/skills](https://github.com/BuilderIO/skills)** (MIT)
  and **[archify](https://github.com/tt-a1i/archify)** by tt-a1i, itself from
  **[Cocoon-AI/architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator)** (MIT).
  No source file of either is copied; super-board's notices for both are kept in `THIRD_PARTY_NOTICES.md`.
- **[stack-diagram](https://github.com/caru-ini/stack-diagram)** by caru-ini, MIT (`LICENSE.stack-diagram`).
  `tools/fetch_icons.py` is copied unmodified (commit `30cbbb7`); the rules umlimator follows for logos (official marks
  only, never recoloured, on a white tile, fetched rather than bundled) are stack-diagram's.
- **[Lucide](https://lucide.dev)**, ISC, with icons derived from Feather, MIT: the line icons in `icons/`.

Details and full licence texts are in `THIRD_PARTY_NOTICES.md`. Brand names and logos are trademarks of their owners;
their use does not imply endorsement.

## Licence

umlimator's own code is MIT (`LICENSE`). The files from super-board and stack-diagram keep their MIT licences, and
the Lucide icons their ISC licence; keep `LICENSE.super-board`, `LICENSE.stack-diagram` and `THIRD_PARTY_NOTICES.md`
with any copy.
