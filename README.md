# umlimator

[![check](https://github.com/zintaen/umlimator/actions/workflows/check.yml/badge.svg)](https://github.com/zintaen/umlimator/actions/workflows/check.yml)

Layered architecture maps you can click through, from one JSON model: an ES module that any page embeds, and a CLI
that writes a self-contained HTML page and still pictures (SVG, PNG) for documents that cannot run one.

![The example model's overview: a made-up bookshop with logos, line icons and a numbered flow behind the API card](examples/stills/overview.png)

**Examples:** [live on GitHub Pages](https://zintaen.github.io/umlimator/), a [playground](https://zintaen.github.io/umlimator/examples/playground.html)
to try a model in, and [what each one shows](examples/README.md): a C4-style
drill-down, a data pipeline, an AI agent's skills, and host pages for embedding, live updates and editing.

## What it does

- **Layers**: a view per level (system, containers, components, flows). A stacked card opens its inner view, which the
  host may load only when asked.
- **Unfolding in place**: a stacked card can also open into a box on the map it is on (E, or Alt + click), its inner
  view's cards inside and the lines to it moved onto them, the rest of the picture in its order.
- **Layout and routing**: columns in reading order, each ordered so the lines cross as little as they can, those that
  skip columns included; each card level with the cards its lines come from, so lines run straight; orthogonal lines
  that never run through a card, room for every label, containers kept apart, and cards with no lines in a row of their
  own, under the view or at the bottom of their box. The same model gives the same picture.
- **Reading**: animated flow, neighbours lit on selection, numbered steps, tours, minimap, light and dark themes.
- **Exploring**: every path between two cards, or everything a card reaches, lit on the map; a view in plain sentences
  (`describe()`); a tour along any path the host names.
- **Live data**: marks over the map without touching the model (`overlay()`): flow as fast as the traffic, errors that
  pulse, slow hops that glow, labels and tabs; and an OpenTelemetry trace replayed along its lines (`replay()`).
- **Stories**: walk-throughs in the model, step by step (view, camera, selection, highlight, tour and a caption), played
  on the map (`play()`) or from the page's Stories menu, recorded from the page, and written as an animated PNG.
- **Keyboard and screen readers**: cards, then lines, in the Tab order (a card's tabs and chips too, for a host that
  listens for click); arrows between cards; selections announced.
- **Editing** (opt-in): gestures emit `change` events; the host applies them and calls `update()`.
- **Export**: any view as a stand-alone SVG or PNG, in the browser or from the CLI; the whole map as one PDF, each view
  with its text, then the legend and the rules (`umlimator.py pdf`).
- **In docs**: `<umlimator-map src="model.json">` in any page, and an `umlimator` fenced block in VitePress, Docusaurus,
  MkDocs or any Markdown that allows HTML.
- **A layout check**: crossings, shared lines, detours, labels on lines, text that overflows its card.
- **Rules**: what the model says must hold ("apps never call a database directly", "no cycles between teams' boxes"),
  marked on the map where it breaks; `umlimator.py check` fails on a broken rule, so CI does.
- **Change**: what a pull request changes, marked on the map and said in words (with a GitHub Action that posts it);
  a time-lapse of a model's history, where cards glide, fade in and fade out; and drift, the map against the traffic seen.

## Install

```bash
npm install umlimator
```

Or from GitHub, at a tag or any commit: `"umlimator": "github:zintaen/umlimator#v0.12.0"`. npm 12 refuses git
dependencies unless the project opts in, so that also needs `allow-git=root` in the `.npmrc` next to `package.json`.

## Embed

```js
import { render } from 'umlimator';   // one ES module, no dependencies, no build step
import 'umlimator/theme.css';         // the default --um-* palette and fonts (or set the variables yourself)

const map = render(document.getElementById('map'), model, {
  on: { select: e => showDetails(e.target), open: e => { e.preventDefault(); router.push(e.view); } },
});
map.update(nextModel);                        // redraws only what changed; keeps the view, camera and selection
const svg = map.toSVG({ scale: 2 });          // the current view as a stand-alone file
const png = await map.toPNG({ view: 'api' }); // any view, without showing it
map.destroy();
```

In React, mount once and pass new models to `update`:

```jsx
function MapView({ model, onSelect }) {
  const el = useRef(null), map = useRef(null), cb = useRef(onSelect);
  cb.current = onSelect;
  useEffect(() => { map.current = render(el.current, model, { on: { select: e => cb.current?.(e.target) } }); return () => map.current.destroy(); }, []);
  useEffect(() => { map.current?.update(model); }, [model]);
  return <div ref={el} style={{ height: 600 }} />;
}
```

- `render` draws one view at a time into a shadow root (give the element a height), with pan, zoom and drill-down.
  Events (`click`, `select`, `open`, `viewchange`, `change`, `expand`) name what they are about by ids from the model.
- `map.expand(id)` unfolds a stacked card in place and `map.collapse(id)` folds it; `layout(model, view, { expand })`
  draws the same in Node.
- Colours are `--um-*` CSS variables, fonts are the host's (`--um-sans`, `--um-mono`), text is measured in that font,
  and nothing is fetched.
- `layout(model, viewId)` returns a view's geometry without a DOM, in Node too; `check(model, viewId)` runs the layout
  check on it, and `validate(model)` finds dangling or repeated ids before anything is drawn. `rules(model)` lists every
  rule the model breaks, view by view.
- `map.overlay(name, layer)`, `highlight(refs)`, `tour(path)` and `replay(spans)` put the host's marks, a tour and a
  trace on the map; `paths()`, `reach()` and `describe()` walk a view and put it in words, in Node too.
- `editable: true` turns on editing gestures ([docs/editing.md](docs/editing.md); `examples/edit.html` is a working host).
- `diff(before, after)` returns `after` with each card and line marked added, changed or removed, what changed in words,
  and the views that show it; `drift(model, observed)` marks the lines traffic ran on that nobody drew, and the drawn ones
  that carried nothing. Both are models to draw, in Node too. `update()` eases into the next model (`examples/timelapse.html`);
  the option `ease: false` draws it at once.
- `mountPage` is the whole standalone viewer that the CLI writes.

The API, its types and the decisions behind it: [docs/module-api.md](docs/module-api.md) and `lib/umlimator.d.ts`.

### In a page or a docs site, as an element

`<umlimator-map>` (`umlimator/element`) loads a model and draws it, with no script of your own. Its children show until
the map is drawn, and stay where scripts don't run ([`examples/element.html`](examples/element.html)):

```html
<link rel="stylesheet" href="node_modules/umlimator/lib/umlimator-theme.css">
<script type="module" src="node_modules/umlimator/lib/umlimator-element.js"></script>

<umlimator-map src="bookshop.json" view="api" minimap height="520">
  <img src="stills/api.png" alt="An order, step by step">
</umlimator-map>
```

- **The model**: `src`, a URL resolved as an `<img>`'s is (a `data:` URL too), or the model in a child
  `<script type="application/json">`.
- **Attributes**: `view`, `minimap`, `controls="false"`, `height` (a number is pixels; 480 by default, or size it in CSS)
  and `theme` (`light` or `dark`: theme.css's palette for that map, whatever the page's). Changing one draws the map
  again, and removing the element destroys it.
- **Events**: `umlimator:select`, `umlimator:open` (cancel it to stay) and `umlimator:viewchange`, the map's event as
  `detail`; `load` once it is drawn, `error` when it can't be. `el.map` is the `render()` handle.
- **Colours**: theme.css, as above, or your own `--um-*` variables. The element fetches nothing but its model.

In a docs site, a fenced block becomes the element. It names the model's `src`, with `view` or any other attribute, or
holds the model in JSON:

````markdown
```umlimator
src: /maps/bookshop.json
view: api
```
````

- **VitePress**: in `.vitepress/config`, `markdown: { config: md => md.use(umlimator) }` (`import umlimator from
  'umlimator/markdown-it'`) and `vue: { template: { compilerOptions: { isCustomElement: t => t === 'umlimator-map' } } }`;
  in `.vitepress/theme/index`, `import 'umlimator/element'` and `import 'umlimator/theme.css'`.
- **Docusaurus**: `remarkPlugins: [umlimator]` (`import umlimator from 'umlimator/remark'`) in the docs preset's options,
  and a client module (`clientModules: ['./src/umlimator.js']`) that imports `umlimator/element` and
  `umlimator/theme.css`.
- **MkDocs, or any site that allows HTML**: write the element itself in the Markdown. Copy `lib/umlimator.js`,
  `lib/umlimator-element.js` and `lib/umlimator-theme.css` into `docs/js/`, and load them in `mkdocs.yml`:
  `extra_javascript: [{ path: js/umlimator-element.js, type: module }]` and `extra_css: [js/umlimator-theme.css]`.

## Model

A model has shared `nodes` and `edges`, and `views` that each show a subset, with optional `containers` (boxes),
`layout` (`[col, row]` per card), `render: "sequence"` for numbered run-order views and `tour` for a dot that rides a
path. The full schema is `engine/references/schema.md` (§ Map model); `examples/bookshop.json` uses most of it.
A model file that starts with `"$schema": "<path to>/umlimator.schema.json"` (exported as `umlimator/schema.json`)
gets completion and checks in editors, and `validate(model)` lists its errors and warnings, each with where it is.

Card kinds: `frontend`, `backend`, `ai`, `database`, `queue`, `security`, `cloud`, `external` and `file` (skill-map
kinds such as `public`, `lane`, `script`, `hook` and `board` work too). Fields beyond the schema:

| On | Field | What it does |
|---|---|---|
| node | `badges` (`badge`) | tabs on the card, each a string or `{ text, tone }` |
| node | `icon` | a logo or line icon from `icons/manifest.json` |
| node | `noSub` | the name only; the description stays in the details panel |
| node | `opensView`, `opensCount` | the view the card opens, which may not be loaded yet, and the ⤢ number for it |
| node, edge | `edited` | a marker on the card or line |
| edge | `kind` | what the line means, drawn as its colour: `calls` (default), `feeds`, `triggers`, `state`, `guard` |
| edge | `weight` | 1, 2 or 3: how much the line stands for, drawn as its width |
| edge | `sublabel` | a second, smaller line under the label |
| edge | `fromSide`, `toSide` | the card sides the line uses |
| edge | `from`, `to` | may name a container of the view: the line ends on its box |
| edge | `style: "faded"` | the line in its kind's colour, faint and with no flow (drift's idle lines) |
| edge | `drift` | what `drift()` found: `undrawn` or `idle` |
| view | `gap`, `rgap` | the space between columns and between rows |
| view | `keepPairs` | A→B and B→A drawn as two lines |
| view | `repair: false` | no port repair |
| view | `subAndChips` | cards 80 px tall that show their sub-line, then their chips |
| view | `kindsFromLabels` | a line whose edges name no `kind` takes one guessed from its label |
| container | `badges` | tabs on the box's border |
| model | `rules` | what must hold: no line `from` some cards `to` others (picked by id, kind or box), or `noCycles` between boxes |
| model | `stories` | walk-throughs: steps that each set the view, camera, selection, highlight, tour and caption |

## Command line

```bash
python3 umlimator.py render examples/bookshop.json --out page.html   # the interactive page, then its layout check
python3 umlimator.py stills page.html --out stills/                   # every view as SVG and PNG
python3 umlimator.py stills page.html --out stills/ --views overview,api --scale 1.5 --theme light
python3 umlimator.py check page.html --views 'pic-*'                   # the layout check on chosen views
python3 umlimator.py diff before.json after.json --out diff.html --stills diff/   # what changed, marked and in words
python3 umlimator.py diff --base origin/main --out diff/              # every model changed since a ref, and a summary.md
python3 umlimator.py drift model.json traffic.json --out drift.html   # drawn vs. seen (a Jaeger or Tempo dependency list)
python3 umlimator.py timelapse model.json --out history.html          # the model's versions in git history, on a slider
python3 umlimator.py check page.html --expand                          # also each view with each stacked card unfolded
python3 umlimator.py record bike-share.html --story ride --out ride.png   # bike-share's story as an animated PNG, a frame per step
python3 umlimator.py pdf page.html --out map.pdf                       # every view in one PDF, with its text, the legend, the rules
```

`check` also reports each rule the model breaks, and then exits 1.

`pdf` prints the map through Chrome's own print, A4 across: a title page, then each view on a page of its own, as a
vector picture with its `describe()` text, then the legend and each rule, holding or broken
([bike-share's](https://zintaen.github.io/umlimator/examples/bike-share.pdf), as CI builds it). It takes `--views` and
`--theme`, as `stills` does.

The page has breadcrumbs, a details panel per card, ⌘K search, deep links (`#view=<id>&node=<id>`, and
`#story=<id>&step=<n>` for a story's step), stories, and export.
`stills` skips a view whose inputs have not changed since its last export (`--all` exports every view). Needs Python
3.9+ (standard library only), Google Chrome or Chromium for `stills`, `check`, `record` and `pdf`, and Node 18+ for
`diff` and `drift`.

`record` writes an animated PNG, which browsers and GitHub show as it is. For a GIF or an MP4 (for chat or slides),
convert it with ffmpeg:

```bash
ffmpeg -f apng -i ride.png -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" ride.gif
ffmpeg -f apng -i ride.png -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p ride.mp4
```

On pull requests, the diff Action posts what they change in your maps: one comment with the summary and a sketch, and
the pictures as the run's artifact.

```yaml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  maps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zintaen/umlimator@v0.12.0
        with:
          models: "docs/*.json"   # optional: where the models are (default: every .json that is a map model)
```

## Map a repo with Claude Code

The `map-repo` skill reads a codebase, writes a C4-style model (context, containers, components), renders it to a page
and stills, and fixes what the layout check reports. Install it, then ask Claude Code to map the repository:

```
/plugin marketplace add zintaen/umlimator
/plugin install umlimator@umlimator
```

On Claude Code 2.1.275 or later, `/plugin install umlimator --marketplace zintaen/umlimator` does both in one step. The
skill needs git, Python 3.9+ and Chrome; on first use it fetches the CLI of one pinned release into
`~/.cache/umlimator/cli`.

## Icons

A node's `icon` names an entry in `icons/manifest.json`. Line icons ship in `icons/` and take the card's colour. Brand
logos do not ship: they are their owners' trademarks. The manifest records each logo's official source and a sha256;
the first render that needs one downloads it into `~/.cache/umlimator/icons` (or `$UMLIMATOR_ICON_CACHE`) and uses it
only if the hash matches. A logo is never recoloured; follow each brand's guidelines for its use.

```bash
python3 -I tools/fetch_icons.py icons "name:slug"            # a brand logo: svgl, then devicon, then gilbarbara/logos
python3 -I tools/fetch_icons.py icons "name=https://..."     # a brand's own official file
python3 -I tools/fetch_icons.py icons "name:lucide/<icon>"   # a line icon
python3 umlimator.py pin-icons                                # records each new logo's sha256
```

## Development

```bash
node --test                 # layout() in Node: the bench views' geometry and the layout rules
python3 tests/embed.py      # render() in headless Chrome: events, keyboard, colours, contrast, editing, the element
python3 bench/bench.py --check-determinism --expect bench/expected.json --max-ms m50=2000
```

The bench lays out fixed models (10 to 69 cards, and 50 modules with 100 lines) in headless Chrome and reports the
time per phase, the layout check's issues and a hash of the geometry. `--expect` fails on a view that no longer draws as
recorded in `bench/expected.json`; a change that moves lines on purpose refreshes it with `--write-expected`. CI runs
all of the above, and checks that the files copied from upstream (`engine/scripts`, `engine/references`,
`tools/fetch_icons.py`) are unmodified.

To release, bump `package.json`'s version in a PR and add that version's `## X.Y.Z: …` section to
`docs/module-api.md`. When the PR is merged and the checks pass on `main`, CI tags `vX.Y.Z`, publishes a GitHub
Release with that section as its notes, and publishes the package to npm (trusted publishing: no token is stored).
CI also publishes the examples to GitHub Pages from `main`.

```
umlimator.py                 CLI: render, stills, check, record, pdf, pin-icons, diff, drift, timelapse
action.yml                   the diff Action: what a pull request changes in its maps, posted on it
lib/                         the module (umlimator.js), its types, the default theme, <umlimator-map> and the docs plugins
engine/                      the page templates the CLI inlines the module into; the upstream renderer and schema
docs/                        the module's API and the editing design
tests/, bench/               tests, benchmark models and results
icons/                       line icons and the logo manifest (sources and hashes only)
examples/                    made-up systems: models, host pages and a Node script (live: zintaen.github.io/umlimator)
.claude-plugin/, plugins/    the Claude Code marketplace and its map-repo skill
```

## Licence

MIT (`LICENSE`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
