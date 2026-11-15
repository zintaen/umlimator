---
layout: home
title: umlimator
titleTemplate: Architecture maps and diagrams from one JSON model

hero:
  name: umlimator
  text: Architecture maps you can click through
  tagline: Layered maps and 28 diagram types from one JSON model. An ES module with no dependencies, a CLI and a GitHub Action.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Examples
      link: /examples/index.html
      target: _self
    - theme: alt
      text: GitHub
      link: https://github.com/zintaen/umlimator

features:
  - title: Maps with drill-down
    details: A view per level, from the system down to its components. A stacked card opens the view inside it. Lines are laid out automatically and never run through a card.
    link: /guide/views-and-layers
    linkText: Views and layers
  - title: 28 diagram types
    details: UML's 14, SysML's four, C4, ER, flowchart, data flow, BPMN, mindmaps, and Google Cloud, Azure and AWS architecture diagrams, each with a conformance note.
    link: /types
    linkText: See the types
  - title: Embed anywhere
    details: One ES module with no dependencies and no build step. Call render(), or write a umlimator-map element in plain HTML, VitePress or Docusaurus.
    link: /guide/embedding
    linkText: Embedding
  - title: Editing with apply()
    details: Opt-in gestures emit events. Your code decides, and apply() turns an edit into the next model, with undo.
    link: /guide/editing
    linkText: Editing
  - title: Diffs in pull requests
    details: A GitHub Action posts what a change does to your maps, marked and in words. Rules fail CI, and drift compares the map with real traffic.
    link: /guide/github-action
    linkText: GitHub Action
  - title: Import and export
    details: Read Structurizr, C4-PlantUML, Mermaid, DBML, BPMN XML, docker compose and kubectl. Write SVG, PNG, PDF, animated PNG and BPMN XML.
    link: /guide/import-export
    linkText: Import and export
---

## A live map

This is the bookshop example, drawn on this page by `<umlimator-map>`. Click a card to select it, and open a stacked
card to go one level down. [Open it full size](/examples/bookshop.html), or browse [all the examples](/examples/index.html).

```umlimator
src: /umlimator/examples/bookshop.json
minimap: true
wheel: ctrl
height: 520
```

## Install

::: code-group

```bash [npm]
npm install umlimator
```

```html [CDN]
<script type="module">
  import { render } from 'https://cdn.jsdelivr.net/npm/umlimator@@@VERSION@@/lib/umlimator.js';
</script>
```

```bash [CLI]
# Python 3.9+; Chrome or Chromium for pictures and checks
git clone --depth 1 --branch v@@VERSION@@ https://github.com/zintaen/umlimator.git
python3 umlimator/umlimator.py render model.json --out page.html
```

```yaml [GitHub Action]
# .github/workflows/maps.yml: what each pull request changes in your maps, posted on it
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  maps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zintaen/umlimator@v@@VERSION@@
```

```bash [MCP]
# an MCP server over stdio, for an AI assistant such as Claude Code
claude mcp add umlimator -- python3 /path/to/umlimator.py mcp /path/to/model.json
```

:::

Then draw a model into any element:

```js
import { render } from 'umlimator';
import 'umlimator/theme.css';

const map = render(document.getElementById('map'), model);
map.update(nextModel);   // redraws only what changed, keeping the view, camera and selection
```

[Getting started](/guide/getting-started) walks through a first model, and the [API reference](/api/) lists every
export.
