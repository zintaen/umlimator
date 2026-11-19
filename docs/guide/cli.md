# Command line

`umlimator.py` turns a model into files: an interactive page, still pictures, a PDF, an animated story. It also checks
models, imports diagrams you already have, and compares versions.

**Requirements.** Python 3.9+ (standard library only); Google Chrome or Chromium for `stills`, `check`, `record` and
`pdf`; Node 18+ for `diff`, `drift`, `trace` and `mcp`. Get it by cloning the repository at a release tag:

```bash
git clone --depth 1 --branch v0.43.0 https://github.com/zintaen/umlimator.git
```

A command that fails leaves its previous output as it was.

## Pages and pictures

```bash
python3 umlimator.py render examples/umlimator-atlas.json --out page.html   # the interactive page, then its layout check
python3 umlimator.py stills page.html --out stills/                   # every view as SVG and PNG
python3 umlimator.py stills page.html --out stills/ --views overview,api --scale 1.5 --theme light
python3 umlimator.py render examples/sales-classes.json --out classes.html   # a class diagram's page; stills, check and pdf take it too
```

- `render` writes [the standalone page](./standalone-page.md), then runs the layout check on it.
- `stills` skips a view whose inputs have not changed since its last export (`--all` exports every view), and exits 1,
  saying why, when a view can't be exported.
- In `stills`, `check` and `pdf`, `--views` takes view ids, and a trailing `*` is a prefix; a name that matches no view
  is an error.

## Checks

```bash
python3 umlimator.py check page.html --views 'pic-*'   # the layout check on chosen views
python3 umlimator.py check page.html --expand          # also each view with each stacked card unfolded
```

`check` reports crossings, shared lines, detours, labels on lines and text that overflows its card, and each rule the model breaks. It exits 1 when the model breaks a rule (one `--ignore` does not leave out) or when the check itself fails; crossings, detours and the other layout problems are reported with exit 0. Run it in CI to fail a build on a broken rule. For a model with cloud diagrams, it also compares the model's `iconPacks` with the release's ([Icons and icon packs](./icon-packs.md)).

## PDF

```bash
python3 umlimator.py pdf page.html --out map.pdf   # every view in one PDF: a cover, each view with its tables, the rules
```

`pdf` prints the map through Chrome's own print, as a document to hand in for a review
([the Umlimator Atlas's](https://zintaen.github.io/umlimator/examples/umlimator-atlas.pdf), as CI builds it). A cover has the title,
the date, the model's file, a summary line and the contents with each view's page. Each view starts a page of its own,
under its path ("Umlimator › The module's layers"): its picture in vectors, as large as the page allows, the legend of what it
draws, and tables of its cards, lines and boxes, which go on over the next pages with their header row when they are
long. The rules follow as a table, when the model has any, each holding or broken in the views printed. Every page ends
in the title and "page N of M". It takes `--views` and `--theme`, as `stills` does, and `--paper a4|letter` (A4 is the
default; both across).

## Record

```bash
python3 umlimator.py record page.html --story pull-request --out pr.png   # the atlas's story as an animated PNG, its tours riding
```

`record` writes an animated PNG, which browsers and GitHub show as it is. It takes `--size`, `--scale` and `--theme`.
For a GIF or an MP4 (for chat or slides), convert it with ffmpeg:

```bash
ffmpeg -f apng -i ride.png -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" ride.gif
ffmpeg -f apng -i ride.png -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p ride.mp4
```

## Change over time

```bash
python3 umlimator.py diff before.json after.json --out diff.html --stills diff/   # what changed, marked and in words
python3 umlimator.py diff --base origin/main --out diff/              # every model changed since a ref, and a summary.md
python3 umlimator.py drift model.json traffic.json --out drift.html   # drawn vs. seen (a Jaeger or Tempo dependency list)
python3 umlimator.py timelapse model.json --out history.html          # the latest 30 versions in git history (--limit N), on a slider
```

[GitHub Action and diff](./github-action.md) has the details, and the Action that posts a diff on pull requests.

## Traces

```bash
python3 umlimator.py trace model.json trace.json --view ride-end --match match.json --out model.json   # an OTLP trace kept as a numbered view
python3 umlimator.py trace model.json trace.json --view ride-end --match match.json --diagram uml.sequence --out traced.json  # ... as a UML sequence diagram, in a version-2 model
```

## Import and export

```bash
python3 umlimator.py import workspace.dsl --out model.json            # a diagram you have already, as a model
python3 umlimator.py import order.bpmn --out order.json               # BPMN XML, as a BPMN diagram (needs Node and bpmn-moddle, installed by you)
python3 umlimator.py export order.json --out order.bpmn               # a model's BPMN as BPMN XML, laid out
```

[Import and export](./import-export.md) lists every format.

## Icons

```bash
python3 umlimator.py pack list        # the cloud icon packs: each one's label, and whether it is fetched and accepted
python3 umlimator.py pack fetch gcp   # Google Cloud's icons: their terms first, then your yes
python3 umlimator.py pin-icons        # records each new logo's sha256
```

See [Icons and icon packs](./icon-packs.md).

## An AI assistant

```bash
python3 umlimator.py mcp model.json   # an MCP server over stdio, for an AI assistant
```

See [MCP server](./mcp.md).
