# MCP server

umlimator ships a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI assistant can read a model, show you what it finds on the map in your browser, and change the model when you ask it to. A Claude Code plugin also maps a whole repository for you.

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
| `story_from_diff(other_model_path, view, id?, title?, audience?)` | a story of what changed on the view from another model file to this one (`storyFromDiff()`), returned and not saved: a step per card and line added, changed or removed, along the view's main flow; `play_story(story=...)` plays it on the page of the model as it is now |
| `story_from_flow(view, id?, title?, chapters?, audience?)` | a story told from the view's main flow (`storyFromFlow()`), returned and not saved: a step per card on the main flow, each with its select, highlight, tour and caption, and each branch as a chapter with the step it leaves from; `audience: "business"` leaves the stores out of the captions; `play_story(story=...)` plays it as it is, and to keep it, add it to the model's `stories` with `set_field` or `apply` |
| `show_view(view)` | shows a view on the page |
| `highlight(refs, view?)` | lights cards and lines (their ids, or the Refs `paths` and `reach` give) and dims the rest |
| `tour(cards, view?)` | a dot rides the lines through these cards, so each card must share a line with the next on the view and be drawn there as a card, not as a box that holds cards; with no view, it rides the view shown now if it shows the cards and draws those lines, else the first view that does |
| `play_story(id or story)`, `clear()` | plays one of the model's stories by its id, or a story given as it is (such as `story_from_flow`'s), which is played and never written; a given story's steps are checked as `validate()` checks the model's, and one that names a view, card or line the model lacks is refused; its chapters are offered in the page's caption bar; `clear()` takes the assistant's highlight, tour and story off |
| `page_state()` | what each open page shows (its map's `state`: view, selection, layers, story, camera), and whether the model renders |

## Edit tools

An assistant changes the model with the same gestures you make on the page. Each edit tool runs the page's own editor, with the diagram type's own rules, so it emits the same [`apply()` commands](../api/apply-and-commands.md) the page would, ids included. On a map view (one with no `diagram`), it writes the commands a host writes for the map's `change` events.

| Tool | The page's gesture |
|---|---|
| `add_card(view, label, type?, kind?, box?, id?)` | the palette, or N, then a name typed. `type` is the element type (`uml.Class`) or its name in the palette (`User task`); a map card takes `kind` instead |
| `connect(view, from, to, type?, label?, kind?, id?)` | L on a card, then the other card and the kind of line. `type` is needed when the view draws more than one kind (`Dependency`, `Reply`) |
| `rename(id, label, view?)` | F2, or a box's name on a map view |
| `move_to_box(view, id, box)` | the Owner field: a package, a pool, a lane, a subject. `box: null` takes it out of every box |
| `remove(ids, view?, from_model?)` | Delete takes elements out of a view; with `from_model`, Shift + Delete takes them and their lines out of the model |
| `set_field(path, value?, id?, view?)` | a field of the properties panel (`props.isAbstract`), or a view's own field with no `id`. No `value` takes the field off |
| `pin(view, id, col?, row?)` | a drag in its box, or Alt + arrows. Neither `col` nor `row` takes the pin off |
| `preview(edits)` | runs a list of steps on a copy and writes nothing |
| `apply(edits)` | runs a list of steps as one change and writes it |
| `undo()`, `redo()` | takes the last change back, or writes it again |

Each tool says what it does to its world in its `annotations`, all four hints set: the read tools, `page_state` and `preview` are read-only; the page tools change only what the page shows (`tour` and `play_story` start again on a repeat call); `add_card` and `connect` add; `rename`, `move_to_box`, `set_field`, `pin` and `remove` are destructive and idempotent (the same call again changes nothing); `apply`, `undo` and `redo` are destructive and not idempotent. None is open-world: the server reads the model, the other model file `diff` is given, and talks to its page on 127.0.0.1.

Where the type refuses a gesture, the tool refuses it with the type's own words: "A message flow cannot start at a start event" on a BPMN view, or "a uml.sequence view places its elements itself" for a pin. Where the page would open a picker of the type's own, the tool asks for `choose`, the choice by its label or its place from 0.

A step of `preview` or `apply` is an edit tool's call with its name in `tool`, or an `apply()` command as it is:

```json
{ "edits": [
  { "tool": "add_card", "view": "sales", "label": "Invoice", "id": "invoice" },
  { "tool": "connect", "view": "sales", "from": "order", "to": "invoice", "type": "Dependency" },
  { "op": "set", "id": "invoice", "path": "props.isAbstract", "value": true }
] }
```

Every edit tool, and `preview`, answers the same way: the commands, `diff()`'s summary in words, and the `validate()` problems, rule breaks and layout issues (`check()`, on the views the change touches) that the change adds. `dry_run: true` on an edit tool is its preview.

What a written change does:

- It is written only when `validate()` finds no error that the change adds. Warnings it adds are in the answer, and do not stop it.
- The file is replaced atomically, and kept in its own layout and encoding: every part the change leaves alone keeps its text, so a renamed card is a one-line diff, and a file in UTF-8 with a byte order mark, UTF-16 or UTF-32 stays so.
- Nothing is written over a file that another editor changed while the tool ran.
- Each change is one step in `MODEL.json.undo`, a history kept next to the model (its last 50 changes, up to 16 MB of text). `undo()` puts the file back as it was, byte for byte. It is refused when someone else wrote the file since, so their change is never lost. A new change clears what `redo()` could write.
- An open page reloads and draws the new version, and the answer says so.

To measure how well an assistant turns a request into these calls, `tests/fixtures/mcp-eval/cases.json` holds requests in plain words, each on a model of the repository, with the change it asks for as `diff()`'s summary. `python3 tools/mcp_eval.py start CASE` copies the case's model and prints the server command for it. Give the assistant the request, then run `python3 tools/mcp_eval.py check CASE COPY`. `tools/mcp_eval.py reference` checks that each case's own answer still holds. CI does not run the eval.

## How it behaves

- The read tools run the module's own functions in Node on the model file, read again at each call, so edits show up, the edit tools' and anyone else's.
- The page tools drive the map's page, which the server serves at `http://127.0.0.1:7391/?k=<key>` (`--port N`, or another port when that one is taken). Open the address the tools give in a browser: the key in it is the page's, and the server answers `/` with nothing but 403 without it, so another process or account on the machine that was not given the address reads neither the model nor the page's state. The key is the same for a model on each run, made from a secret in `~/.cache/umlimator/mcp-key` (or the file `UMLIMATOR_MCP_KEYS` names) that only you can read; anything running as you can read it too, as it can read the model. If `~/.cache/umlimator/mcp-key` is left empty or cut short (a first run stopped before it wrote it, a full disk), it is written again, whole, so the key holds from the next run on. A file `UMLIMATOR_MCP_KEYS` names is made when it is not there and never written after: its text, stripped, is the secret, so a secret of your own (hex, base64, 16 bytes or more) works as it is. A named file that holds less is left alone, the server says so and the page's key holds for that run only.
  - A tool answers "shown" once a page has shown it, or says why none did: the page's own error, or a tab in the background that didn't finish in time. With no page open, it gives the URL.
  - A page that opens later shows what the assistant built: the view, with the highlight on it, and a tour or story still under way.
  - The assistant's highlight is a layer of its own (`mcp`): off on another view, back on its own.
  - A model that stops rendering keeps the last page that did, and the tools and the page say why.
- The server listens on 127.0.0.1 only and fetches nothing, so a logo not in the cache yet keeps its card's sigil.
- Each Node run of a tool, and the render of the page, stops after 30 seconds, and the tool says so in one line (a page that does not render in time is tried again once the model changes); the element counts `list_views` adds stop after 10, and it counts each view's cards instead. Tool calls run one at a time in the order sent, apart from the thread that reads requests, so `ping` is answered while one runs, and `notifications/cancelled` stops a call that waits or runs: its Node run ends and it gets no answer.
- The undo history `MODEL.json.undo` is read only when it is a regular file of at most 128 MB, never through a symbolic link: one that is a link, a device or a pipe is an empty history, and the edit tools refuse to write over it until it is removed. The model file is read only when it is a regular file.

## Map a repository with Claude Code

The `map-repo` skill reads a codebase, writes a C4-style model (context, containers, components), renders it to a page and stills, and fixes what the layout check reports. Install it, then ask Claude Code to map the repository:

```
/plugin marketplace add zintaen/umlimator
/plugin install umlimator@umlimator
```

On Claude Code 2.1.275 or later, `/plugin install umlimator --marketplace zintaen/umlimator` does both in one step. The skill needs git, Python 3.9+ and Chrome; on first use it fetches the CLI of one pinned release into `~/.cache/umlimator/cli`.
