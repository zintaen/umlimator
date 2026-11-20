# A first diagram

This page takes you from nothing to a map in a page. If umlimator is not installed yet, [Install](./install.md) comes first.

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

The layout is automatic: you name what is connected, umlimator places the cards and routes the lines. The same model always gives the same picture. [The model](../maps/model.md) lists every field.

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
| give the map layers, boxes and drill-down | [Views and layers](../maps/views-and-layers.md) |
| embed it in React, or in a docs site | [Embedding](../use/embedding.md) |
| draw a UML, C4, BPMN, SysML or cloud diagram | [Diagrams](../types/index.md): each type's page says how to write it |
| let people edit the map | [Editing](../use/editing.md) |
| tell a story, add lenses, show live traffic | [Stories, lenses and live data](../maps/stories-lenses-live.md) |
| see what a pull request changes | [GitHub Action and diff](../use/github-action.md) |
| bring in a diagram you already have | [Import and export](../use/import-export.md) |

[Diagrams](../types/index.md) shows every diagram type and [the atlases](../atlas/index.md) whole businesses, in working models; [Host pages](../use/embedding.md#host-pages) shows the module in host pages.
