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
- **Layout and routing**: columns in reading order, each ordered so the lines cross as little as they can, those that
  skip columns included; each card level with the cards its lines come from, so lines run straight; orthogonal lines
  that never run through a card, room for every label, containers kept apart, and cards with no lines in a row of their
  own, under the view or at the bottom of their box. The same model gives the same picture.
- **Reading**: animated flow, neighbours lit on selection, numbered steps, tours, minimap, light and dark themes.
- **Keyboard and screen readers**: cards, then lines, in the Tab order (a card's tabs and chips too, for a host that
  listens for click); arrows between cards; selections announced.
- **Editing** (opt-in): gestures emit `change` events; the host applies them and calls `update()`.
- **Export**: any view as a stand-alone SVG or PNG, in the browser or from the CLI.
- **A layout check**: crossings, shared lines, detours, labels on lines, text that overflows its card.

## Install

```bash
npm install umlimator
```

Or from GitHub, at a tag or any commit: `"umlimator": "github:zintaen/umlimator#v0.11.0"`. npm 12 refuses git
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
  Events (`click`, `select`, `open`, `viewchange`, `change`) name what they are about by ids from the model.
- Colours are `--um-*` CSS variables, fonts are the host's (`--um-sans`, `--um-mono`), text is measured in that font,
  and nothing is fetched.
- `layout(model, viewId)` returns a view's geometry without a DOM, in Node too; `check(model, viewId)` runs the layout
  check on it, and `validate(model)` finds dangling or repeated ids before anything is drawn.
- `editable: true` turns on editing gestures ([docs/editing.md](docs/editing.md); `examples/edit.html` is a working host).
- `mountPage` is the whole standalone viewer that the CLI writes.

The API, its types and the decisions behind it: [docs/module-api.md](docs/module-api.md) and `lib/umlimator.d.ts`.

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
| view | `gap`, `rgap` | the space between columns and between rows |
| view | `keepPairs` | A→B and B→A drawn as two lines |
| view | `repair: false` | no port repair |
| view | `subAndChips` | cards 80 px tall that show their sub-line, then their chips |
| view | `kindsFromLabels` | a line whose edges name no `kind` takes one guessed from its label |
| container | `badges` | tabs on the box's border |

## Command line

```bash
python3 umlimator.py render examples/bookshop.json --out page.html   # the interactive page, then its layout check
python3 umlimator.py stills page.html --out stills/                   # every view as SVG and PNG
python3 umlimator.py stills page.html --out stills/ --views overview,api --scale 1.5 --theme light
python3 umlimator.py check page.html --views 'pic-*'                   # the layout check on chosen views
```

The page has breadcrumbs, a details panel per card, ⌘K search, deep links (`#view=<id>&node=<id>`) and export.
`stills` skips a view whose inputs have not changed since its last export (`--all` exports every view). Needs Python
3.9+ (standard library only), and Google Chrome or Chromium for `stills` and `check`.

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
python3 tests/embed.py      # render() in headless Chrome: events, keyboard, colours, contrast, editing
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
umlimator.py                 CLI: render, stills, check, pin-icons
lib/                         the module (umlimator.js), its types and the default theme
engine/                      the page template the CLI inlines the module into; the upstream renderer and schema
docs/                        the module's API and the editing design
tests/, bench/               tests, benchmark models and results
icons/                       line icons and the logo manifest (sources and hashes only)
examples/                    made-up systems: models, host pages and a Node script (live: zintaen.github.io/umlimator)
.claude-plugin/, plugins/    the Claude Code marketplace and its map-repo skill
```

## Licence

MIT (`LICENSE`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
