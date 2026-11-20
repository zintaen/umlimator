---
title: What umlimator is
titleTemplate: umlimator, architecture maps and diagrams from one JSON model
description: Layered architecture maps and 28 diagram types you can click through, from one JSON model.
---

# What umlimator is

umlimator draws layered architecture maps you can click through, and 28 diagram types besides them, from one JSON model. The 28 diagram types are UML's 14 and its information flow diagram, SysML's four, C4, entity-relationship, flowchart, data flow, BPMN, mindmaps, and AWS, Google Cloud and Azure architecture diagrams. One model drives all of it:

- an ES module with no dependencies and no build step, that any page embeds with `render()` or the `<umlimator-map>` element;
- a CLI that writes a self-contained HTML page, still pictures (SVG, PNG) and a PDF, and checks the layout;
- a GitHub Action that posts what a pull request changes in your maps, and an MCP server for AI assistants.

The layout is automatic: you name what is connected, umlimator places the cards and routes the lines, and the same model always gives the same picture.

## A live atlas

This is the Umlimator atlas, umlimator's own model, drawn on this page by `<umlimator-map>`. Click a card to select it, and open a stacked card to go one level down. [Open it full size](/examples/umlimator-atlas.html), or read [its page](./atlas/umlimator.md).

```umlimator
src: /umlimator/examples/umlimator-atlas.json
minimap: true
wheel: ctrl
height: 520
```

## How these docs read

The sidebar runs in reading order.

| Part | What it covers |
|---|---|
| Start | this page, [Install](./start/install.md), and [A first diagram](./start/first-diagram.md): a first model and a map in a page |
| [Diagrams](./types/index.md) | the 28 diagram types, each on one page: a live example and a checklist of what to find in it, how to write the type in the model, and what of its notation is drawn and left out |
| Maps and atlases | [the model](./maps/model.md), [views and layers](./maps/views-and-layers.md), [stories, lenses and live data](./maps/stories-lenses-live.md), then [the atlases](./atlas/index.md): whole businesses in one model each, the Bookshop's overview the map's showcase |
| Use it | the [command line](./use/cli.md), [embedding](./use/embedding.md), [the standalone page](./use/standalone-page.md), the [MCP server](./use/mcp.md), the [GitHub Action](./use/github-action.md), [import and export](./use/import-export.md), [icon packs](./use/icon-packs.md) and [editing](./use/editing.md) |
| Reference | the [API](./api/index.md): every export, its options and its events, and the [changelog](./changelog.md) |

## Support

umlimator is free and MIT licensed. It is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft. Questions go to [GitHub Discussions](https://github.com/zintaen/umlimator/discussions), and if it saves you time, you can support its development on [Buy Me a Coffee](https://buymeacoffee.com/cyberskill) or through [GitHub Sponsors](https://github.com/sponsors/zintaen).
