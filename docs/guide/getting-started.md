# Getting started

umlimator draws layered architecture maps and 28 diagram types from one JSON model. You can use it three ways:

- as an **ES module** that any page embeds (`render()`, or the `<umlimator-map>` element);
- as a **CLI** that writes a self-contained HTML page, still pictures (SVG, PNG) and a PDF;
- as a **GitHub Action** that posts what a pull request changes in your maps.

This page takes you from nothing to a map in a page.

## Install

```bash
npm install umlimator
```

Or from GitHub, at a tag or any commit: `"umlimator": "github:zintaen/umlimator#v0.43.0"`. npm 12 refuses git
dependencies unless the project opts in, so that also needs `allow-git=root` in the `.npmrc` next to `package.json`.

Without a bundler, load the module from a CDN, pinned to a version:

```html
<script type="module">
  import { render } from 'https://cdn.jsdelivr.net/npm/umlimator@0.43.0/lib/umlimator.js';
</script>
```

The CLI is `umlimator.py` in the repository. It needs Python 3.9+ (standard library only), Google Chrome or Chromium for
pictures and checks, and Node 18+ for `diff`, `drift`, `trace` and `mcp` ([Command line](./cli.md)):

```bash
git clone --depth 1 --branch v0.43.0 https://github.com/zintaen/umlimator.git
python3 umlimator/umlimator.py render model.json --out page.html
```

## A first model

A model has cards (`nodes`), lines (`edges`) and `views`, each of which shows some of them. Save this as `model.json`:

```json
{
  "title": "Bookshop",
  "nodes": [
    { "id": "web", "label": "Web shop", "kind": "frontend" },
    { "id": "api", "label": "Orders API", "kind": "backend" },
    { "id": "db", "label": "Orders", "kind": "database" }
  ],
  "edges": [
    { "id": "e1", "from": "web", "to": "api", "label": "places orders" },
    { "id": "e2", "from": "api", "to": "db", "label": "writes", "kind": "state" }
  ],
  "views": [
    { "id": "overview", "parent": null, "title": "Bookshop", "nodeIds": ["web", "api", "db"] }
  ]
}
```

The layout is automatic: you name what is connected, umlimator places the cards and routes the lines. The same model
always gives the same picture. [The model](./model.md) lists every field.

## Draw it

### In a page, with a script

```js
import { render } from 'umlimator';
import 'umlimator/theme.css';

const model = await (await fetch('model.json')).json();
render(document.getElementById('map'), model);   // give #map a height
```

### In a page, with no script of your own

```html
<link rel="stylesheet" href="node_modules/umlimator/lib/umlimator-theme.css">
<script type="module" src="node_modules/umlimator/lib/umlimator-element.js"></script>

<umlimator-map src="model.json" height="480"></umlimator-map>
```

### As a file to open or share

```bash
python3 umlimator.py render model.json --out page.html   # the interactive page, then its layout check
python3 umlimator.py stills page.html --out stills/      # every view as SVG and PNG
```

The page works offline from a single file.

## Next steps

| To | Read |
|---|---|
| give the map layers, boxes and drill-down | [Views and layers](./views-and-layers.md) |
| embed it in React, or in a docs site | [Embedding](./embedding.md) |
| draw a UML, C4, BPMN, SysML or cloud diagram | [The model](./model.md), and the [conformance notes](../conformance/) |
| let people edit the map | [Editing](./editing.md) |
| tell a story, add lenses, show live traffic | [Stories, lenses and live data](./stories-lenses-live.md) |
| see what a pull request changes | [GitHub Action and diff](./github-action.md) |
| bring in a diagram you already have | [Import and export](./import-export.md) |

The [examples](/examples/index.html) show every diagram type, and the Atlas, in working models; [In an app](/examples/index.html#apps) shows the module in host pages.
