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
- **Export**: any view as a stand-alone SVG or PNG, in the browser or from the CLI.
- **A layout check**: crossings, shared lines, detours, labels on lines, text that overflows its card.
- **Rules**: what the model says must hold ("apps never call a database directly", "no cycles between teams' boxes"),
  marked on the map where it breaks; `umlimator.py check` fails on a broken rule, so CI does.
- **Change**: what a pull request changes, marked on the map and said in words (with a GitHub Action that posts it);
  a time-lapse of a model's history, where cards glide, fade in and fade out; and drift, the map against the traffic seen.
- **Import**: a Structurizr workspace, a C4-PlantUML or Mermaid diagram, or what `docker compose config` and `kubectl get`
  print as JSON, read into a model (`umlimator.py import`), with what it can't read listed line by line.
- **An AI assistant on the map**: an MCP server (`umlimator.py mcp`) through which an assistant such as Claude Code reads
  the model (a view in words, paths, what a card reaches, broken rules, problems, a diff) and drives its page in your
  browser (a view, a highlight, a tour, a story).

## Install

```bash
npm install umlimator
```

Or from GitHub, at a tag or any commit: `"umlimator": "github:zintaen/umlimator#v0.12.1"`. npm 12 refuses git
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
python3 umlimator.py record bike-share.html --story ride --out ride.png   # bike-share's story as an animated PNG, its tours riding
python3 umlimator.py import workspace.dsl --out model.json            # a diagram you have already, as a model
docker compose config --format json > compose.json && python3 umlimator.py import compose.json --out model.json
kubectl get deploy,sts,svc,ing -A -o json > cluster.json && python3 umlimator.py import cluster.json --out model.json
python3 umlimator.py mcp model.json                                    # an MCP server over stdio, for an AI assistant (below)
```

`check` also reports each rule the model breaks, and then exits 1.

`import` reads Structurizr DSL (people, systems, containers and components, their relationships, and the workspace's
views), C4-PlantUML (its element, relationship and boundary macros), Mermaid (`flowchart` or `graph`, and `C4Context`,
`C4Container` or `C4Component`), and the JSON of `docker compose config` (services, `depends_on`, networks) and of
`kubectl get` (workloads, Services, Ingresses). It tells the format from the content, then the extension; `--format`
decides. Groups, boundaries, subgraphs, networks and namespaces become boxes; Structurizr's views stay views, a card
opening the view below it; `examples/clinic.json` is `examples/clinic.dsl`, imported. What each element becomes, and
what is left out: [docs/module-api.md § Import](docs/module-api.md#import-90). Whatever the file holds that `import`
doesn't read is listed on stderr with its line (in JSON, its path).

The page has breadcrumbs, a details panel per card, ⌘K search, deep links (`#view=<id>&node=<id>`, and
`#story=<id>&step=<n>` for a story's step), stories, and export. For scripts and tests, it keeps its map's handle on
`window.umlimatorMap`: the `Handle` that `render()` returns (`setView()`, `highlight()`, `tour()`, `play()` ...).
`stills` skips a view whose inputs have not changed since its last export (`--all` exports every view). Needs Python
3.9+ (standard library only), Google Chrome or Chromium for `stills`, `check` and `record`, and Node 18+ for `diff`,
`drift` and `mcp`.

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
      - uses: zintaen/umlimator@v0.12.1
        with:
          models: "docs/*.json"   # optional: where the models are (default: every .json that is a map model)
```

## An AI assistant on the map (MCP)

`umlimator.py mcp model.json` is a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio: an AI
assistant reads the model, and shows you what it finds on the map in your browser. Add it to Claude Code:

```bash
claude mcp add umlimator -- python3 /path/to/umlimator.py mcp /path/to/model.json
```

| Tool | What it does |
|---|---|
| `list_views()` | the views (id, title, parent, number of cards) and the stories |
| `describe_view(view)` | the view in sentences (`describe()`), then each card's id |
| `paths(view, from, to)` | every card and line on a path from one card to another (`paths()`), as Refs for `highlight` |
| `reach(view, card, backward?, depth?)` | what a card leads to, or what leads to it, with the distance of each (`reach()`) |
| `broken_rules()`, `validate()` | each break of the model's `rules` (`rules()`), and its own problems (`validate()`) |
| `diff(other_model_path)` | what changed from another model file to this one, in words, and the views that show it (`diff()`) |
| `show_view(view)` | shows a view on the page |
| `highlight(refs, view?)` | lights cards and lines (their ids, or the Refs `paths` and `reach` give) and dims the rest |
| `tour(cards, view?)` | a dot rides the lines through these cards |
| `play_story(id)`, `clear()` | plays one of the model's stories; takes the highlight, the tour and the story off |

- The read tools run the module's own functions in Node on the model file, read again at each call, so edits show up.
- The page tools drive the map's page, which the server serves at `http://127.0.0.1:7391` (`--port N`, or another port
  when that one is taken). Open it in a browser. Each tool says whether a page is connected, and gives the URL when none
  is; a page that connects later shows the latest command, and a page drawn from an older model draws itself again.
- The server listens on 127.0.0.1 only and fetches nothing, so a logo not in the cache yet keeps its card's sigil.

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

With `UMLIMATOR_OFFLINE=1` the CLI fetches nothing: a logo not in the cache keeps its card's sigil (`mcp` sets it).

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
umlimator.py                 CLI: render, stills, check, record, pin-icons, diff, drift, timelapse, import, mcp
umlimator_import.py          import's readers: Structurizr DSL, C4-PlantUML, Mermaid, compose and Kubernetes JSON
umlimator_mcp.py             the MCP server that `umlimator.py mcp` runs
action.yml                   the diff Action: what a pull request changes in its maps, posted on it
lib/                         the module (umlimator.js), its types and the default theme
engine/                      the page templates the CLI inlines the module into; the upstream renderer and schema
docs/                        the module's API and the editing design
tests/, bench/               tests, benchmark models and results
icons/                       line icons and the logo manifest (sources and hashes only)
examples/                    made-up systems: models, host pages and a Node script (live: zintaen.github.io/umlimator)
.claude-plugin/, plugins/    the Claude Code marketplace and its map-repo skill
```

## Licence

MIT (`LICENSE`). Third-party notices: `THIRD_PARTY_NOTICES.md`.
