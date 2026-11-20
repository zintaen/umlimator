# MCP server

umlimator ships a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI assistant can read a
model and show you what it finds on the map in your browser. A Claude Code plugin also maps a whole repository for you.

## Set it up

`umlimator.py mcp model.json` is an MCP server over stdio. Add it to Claude Code:

```bash
claude mcp add umlimator -- python3 /path/to/umlimator.py mcp /path/to/model.json
```

Any MCP client that starts a stdio server works the same way. The server needs Node 18+.

## Tools

| Tool | What it does |
|---|---|
| `list_views()` | the views (id, title, parent, number of cards) and the stories |
| `describe_view(view)` | the view in sentences (`describe()`), then each card's id |
| `paths(view, from, to)` | every card and line on a path from one card to another (`paths()`; on a sequence view, in time order), as Refs for `highlight` |
| `reach(view, card, backward?, depth?)` | what a card leads to, or what leads to it, with the distance of each (`reach()`) |
| `broken_rules()`, `validate()` | each break of the model's `rules` (`rules()`), and its own problems (`validate()`) |
| `diff(other_model_path)` | what changed from another model file to this one, in words, and the views that show it (`diff()`) |
| `show_view(view)` | shows a view on the page |
| `highlight(refs, view?)` | lights cards and lines (their ids, or the Refs `paths` and `reach` give) and dims the rest |
| `tour(cards, view?)` | a dot rides the lines through these cards, so each card must share a line with the next on the view and be drawn there as a card, not as a box that holds cards; with no view, it rides the view shown now if it shows the cards and draws those lines, else the first view that does |
| `play_story(id)`, `clear()` | plays one of the model's stories; takes the assistant's highlight, tour and story off |
| `page_state()` | what each open page shows (its map's `state`: view, selection, layers, story, camera), and whether the model renders |

## How it behaves

- The read tools run the module's own functions in Node on the model file, read again at each call, so edits show up.
- The page tools drive the map's page, which the server serves at `http://127.0.0.1:7391` (`--port N`, or another port
  when that one is taken). Open it in a browser.
  - A tool answers "shown" once a page has shown it, or says why none did: the page's own error, or a tab in the
    background that didn't finish in time. With no page open, it gives the URL.
  - A page that opens later shows what the assistant built: the view, with the highlight on it, and a tour or story
    still under way.
  - The assistant's highlight is a layer of its own (`mcp`): off on another view, back on its own.
  - A model that stops rendering keeps the last page that did, and the tools and the page say why.
- The server listens on 127.0.0.1 only and fetches nothing, so a logo not in the cache yet keeps its card's sigil.

## Map a repository with Claude Code

The `map-repo` skill reads a codebase, writes a C4-style model (context, containers, components), renders it to a page
and stills, and fixes what the layout check reports. Install it, then ask Claude Code to map the repository:

```
/plugin marketplace add zintaen/umlimator
/plugin install umlimator@umlimator
```

On Claude Code 2.1.275 or later, `/plugin install umlimator --marketplace zintaen/umlimator` does both in one step. The
skill needs git, Python 3.9+ and Chrome; on first use it fetches the CLI of one pinned release into
`~/.cache/umlimator/cli`.
