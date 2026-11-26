# Module API (step 3 design note, for approval)

Status: approved and built, 6 Nov 2026 (step 3). Steps 4–6 are listed only where they shape this API. Types:
`lib/umlimator.d.ts`. Tests: `node --test` (layout; `npm test` runs the "(timed)" tests apart, one file at a time) and `python3 tests/embed.py` (render in headless Chrome).

## Goal

One ES module, `lib/umlimator.js`, that draws a map model into any element on any page, with no iframe, no build step,
no runtime network calls and no dependencies. The standalone page and the CLI become thin users of it. Routes stay
exactly as they are today: CI's `bench.py --expect` (geometry hashes) has to pass unchanged after the move.

## Exports

```ts
// lib/umlimator.d.ts (hand-written; the module itself is plain JavaScript)
export function render(container: HTMLElement, model: MapModel, options?: RenderOptions): Handle;
export function layout(model: MapModel, viewId: string, options?: LayoutOptions): Geometry; // pure: no DOM
export function mountPage(container: HTMLElement, model: MapModel, options?: PageOptions): Handle; // today's full viewer

export interface RenderOptions {
  view?: string;              // view to show first; default: model.root, else the view with no parent
  select?: Ref | null;        // initial selection
  controls?: boolean;         // zoom / fit / flow buttons over the canvas (default true)
  minimap?: boolean;          // default false
  flow?: boolean;             // animated flow along lines (default: on unless prefers-reduced-motion)
  on?: Partial<{ [K in keyof Events]: (e: Events[K]) => void }>;  // same as handle.on, for React-style props
}
export interface LayoutOptions { repair?: boolean }           // default: the view's own `repair`; step 4 adds measure(text, font) -> px

export interface Handle {
  update(model: MapModel): void;      // see "update semantics"
  setView(id: string): void;          // emits viewchange
  select(ref: Ref | null): void;      // emits select
  fit(): void;                        // camera: whole view in the container
  toSVG(o?: ExportOptions): string;   // step 6: a view as a stand-alone SVG file
  toPNG(o?: ExportOptions): Promise<Blob | null>;   // the same, as a PNG drawn in the browser
  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): () => void;   // returns unsubscribe
  readonly view: string;
  readonly selection: Ref | null;
  destroy(): void;                    // removes the map's element, listeners, observers, timers; the rest of the container stays
}
```

`MapModel` is today's map model (`engine/references/schema.md` § Map model plus the README's umlimator fields), unchanged:
no schema version bump in step 3. The library never mutates it (today's page edits badges in place for `#reader`; that
moves to the page).

## Stable references

Every clickable thing is named by a `Ref`, built only from ids in the model, so a host can map it back to its own data:

```ts
type Ref =
  | { type: 'node', id: string, view: string }
  | { type: 'edge', ids: string[], view: string }      // one drawn line can stand for several model edges (A→B + B→A,
                                                       // parallel edges); ids in model order
  | { type: 'container', id: string, view: string }
  | { type: 'chip', node: string, index: number, value: string, view: string };   // a verb chip; step 4 adds tech chips
```

An edge without an `id` gets `"<from>-><to>#<n>"` (n = its position among edges with the same ends), so ids never
depend on layout.

## Events

```ts
interface Events {
  click:      { target: Ref, event: MouseEvent };
  select:     { target: Ref | null };                    // selection changed (click, keyboard, handle.select)
  open:       { target: Ref, view: string, preventDefault(): void };   // drill-down request (double-click, Enter, ⤢)
  viewchange: { view: string, from: string };
}
```

- `open` switches to the inner view unless the host calls `preventDefault()`, so a host can route drill-down through its
  own router. `viewchange` follows every switch.
- `click` selects what was clicked (a chip or badge: its card) unless the host calls `preventDefault()`, which keeps the
  selection as it was, so a chip, badge or card can be a link in the host.
- Events are plain callbacks, not DOM `CustomEvent`s (no bubbling through the host's tree, typed payloads). A host that
  wants DOM events can re-dispatch.
- Step 5 adds `change` (semantic edits: add, rename, move to container, delete, reorder, optional position hints). It
  is only emitted, never applied: the host applies it and calls `update()`.

## Update semantics

- `update(model)` replaces the whole model; the host passes a new object (React-friendly), the library diffs.
- Each view gets a key over what its picture is drawn from (as `umlimator.py stills` does today: the view, its nodes,
  edges between them, icons, child-view sizes). Only views whose key changed are laid out again; the current one is
  redrawn at once, others when shown.
- Kept across updates: current view, camera, selection, flow on/off. A selected id that no longer exists clears the
  selection and emits `select` with `null`; a current view that no longer exists falls back to the root and emits
  `viewchange`.
- Layout stays synchronous and deterministic: the same model always gives the same geometry. No animation on update.

## Who owns what

- The **host** owns the model, persistence, routing (URLs) and any side panel or search it wants.
- The **library** owns transient UI state (camera, hover, current view, selection) and reports it through events; the
  host can set it with `setView` and `select`. No `location.hash`, `localStorage`, `document` listeners or globals: key
  handling is on the canvas element, observers on the container.
- **Styles** go into a shadow root on the container (one constructed stylesheet; no `<link>`), so the host's CSS cannot
  break the picture and the picture's cannot leak. CSS custom properties and the font family inherit through it,
  which is what step 4 (colours from host CSS variables, host fonts) needs.

## The standalone page and the CLI

- `mountPage()` is today's viewer: breadcrumbs, details panel, legend, ⌘K search, tree browser, export, theme toggle,
  `#view=&node=` deep links, built on `render()` through the same public API (it is the API's first real user).
- `engine/assets/template.html` keeps rendering one self-contained HTML file: `umlimator.py render` inlines
  `lib/umlimator.js` into it, so a page still works offline from a single file.
- The `#check`, `#still` and `#bench` hooks move into the page and call `layout()` and the audit; `bench.py` and
  `umlimator.py check/stills` keep their command lines and output.
- `layout()` needs no DOM, so tests and benchmarks can run in Node (Chrome stays for stills and the label-overlap check,
  which measure the drawn SVG).
- Doc pages (`visual.py` recap / plan / explore) keep working; their diagrams call the same `layout()` and SVG code.

## Embedding (what Alchemy, or any React 19 page, would write)

```jsx
function Map({ model, onSelect }) {
  const ref = useRef(null), handle = useRef(null);
  useEffect(() => { handle.current = render(ref.current, model, { on: { select: e => onSelect(e.target) } });
                    return () => handle.current.destroy(); }, []);
  useEffect(() => { handle.current?.update(model); }, [model]);
  return <div ref={ref} style={{ height: 600 }} />;
}
```

## Decisions to approve

1. **Fork the engine from upstream.** An ES-module extraction cannot be expressed as anchored patches, so from step 3
   `engine/assets/template.html` and the new `lib/` are umlimator's own sources (MIT, with super-board's licence and a
   "derived from" note in `THIRD_PARTY_NOTICES.md`). `patches/apply.py` is retired; CI's "copied files are upstream's"
   check shrinks to `visual.py`, `references/` and `fetch_icons.py`, which stay unmodified, and the weekly upstream
   watch keeps warning when super-board changes the template so fixes can be ported by hand.
   - Alternative: keep patching and ship the module as a generated file. Keeps upstream sync, but every step 4–5
     change becomes a fragile anchor patch over 2,000 lines. **Recommended: fork.**
2. **Split canvas from page chrome** (`render` vs `mountPage`, above).
   - Alternative: one viewer with flags to hide the panel, search etc. Less moving now, but the host gets our panel
     whether it fits its design or not, and the bundle carries it. **Recommended: split.**
3. **Shadow DOM for style isolation.**
   - Alternative: prefixed class names in the host's DOM. Easier to restyle from outside, but host resets
     (`svg { … }`, `* { box-sizing }`, Tailwind preflight) leak in. **Recommended: shadow DOM.**
4. **Library-held view and selection with events** (above).
   - Alternative: fully controlled (`view` and `selection` only change when the host passes new values). Purer for
     React, but every host has to wire both before anything is clickable. **Recommended: library-held, settable.**
5. **Distribution:** a `package.json` with `exports` and the hand-written `.d.ts`, no build, consumed as a git
   dependency (`"umlimator": "github:zintaen/umlimator#<tag>"`) until it is worth publishing to npm.

Out of scope for step 3: colours from CSS variables, host fonts and text measurement, several badges, `edited`, chip
events beyond verb chips (step 4); editing (step 5); SVG export without Chrome (step 6).

## As built: notes

- Colours: the module's stylesheet carries the light and dark palette as defaults on the shadow host (`data-theme` on
  the host element picks one; otherwise the system setting), so an embedded map has colours with no host CSS. Step 4
  replaces these defaults with the host's CSS variables.
- `mountPage` passes a few page-only hooks to `render` (status line, overlay insets, the page's own up target and
  saved preferences) through an undocumented `_page` option; hosts do not need them.
- `layout()` and the canvas share one code path: Node and Chrome give byte-identical geometry on every benchmark view.

## Step 4: host integration (built 6 Nov 2026)

- **Colours come only from CSS variables**, all named `--um-*` so they cannot collide with a host's own tokens. The
  module bakes in no colour (a test fails on any colour literal in it). `lib/umlimator-theme.css` is the default
  palette, light and dark; a host includes it, or sets the variables itself (`--um-bg: var(--surface)`), on any
  ancestor of the map. Light and dark are the host's call: change the variables and the map follows.
- **No runtime network calls.** The page no longer loads Google Fonts; fonts are the host's (`--um-sans`, `--um-mono`).
- **Text is measured in the host's font**: `render()` measures with a canvas in `--um-sans`, and lays out again once
  the host's fonts have loaded. `layout()` in Node, the bench and the layout search that `umlimator.py render` bakes
  into a page keep a font-independent estimate, so their output is the same on every machine; `render(..., { measure:
  false })` does the same in a browser.
- **Several badges per card**: `badges: ["BUILT", { "text": "Owner: platform", "tone": "violet" }]` (the old `badge`
  still works). Each is its own tab and its own click target: `{ type: 'badge', node, index, value }`.
- **`edited: true`** on a node or an edge draws a marker (`--um-edited`): a dot in the card's corner, or at the middle
  of the line.
- Labelled lines that leave or reach one card side by side now get a column gap wide enough for all their pills next
  to each other. This moved routes in the benchmarks on purpose; `bench/expected.json` is the new reference.

## Step 6: SVG export in the browser (built 6 Nov 2026)

- **`handle.toSVG({ scale })`** returns the current view as a stand-alone SVG string, `scale` × its natural size
  (default 1). A host saves it as a file, puts it in a document, or draws it on a canvas for a PNG; no headless browser
  is involved, and nothing is fetched.
- **It stands alone**: every `var(--um-*)` is resolved, in styles and in attributes, against the host's CSS at that
  moment (light or dark, the host's palette), so the file has no CSS variables, classes or stylesheet to depend on. Text
  keeps the host's font family by name: a viewer without that font substitutes one, as with any SVG.
- **Drawn at rest**: no selection or its dimming, no hover, no flow animation, no edit handles or pending ghosts,
  whatever the screen shows; the screen is left exactly as it was. The same file comes out with or without a selection.
- **Any view**: `toSVG({ view })` draws another view off screen, inside the shadow root, without showing it or
  emitting events; the file is the same one that view gives when shown. An unknown or empty view, or a destroyed
  handle, returns `''`.
- **PNG in the browser**: `toPNG({ view, scale })` (default scale 2) draws the same file on a canvas and resolves to a
  PNG `Blob`. The standalone page's Export ▾ PNG uses the same code.
- **Fonts**: the file names the host's font family; a viewer without it substitutes one. A host that wants the font
  inside the file passes its own rules, `toSVG({ fontCSS: '@font-face { font-family: "Inter"; src: url(data:font/woff2;base64,...) }' })`;
  they go in a `<style>` in the file. The library fetches nothing, so the font must be a `data:` URL the host already has.
- The standalone page's "Export ▾ SVG / PNG" and the `#still` hook use the same code, so `umlimator.py stills` writes
  the same SVG a host gets; the CLI still uses Chrome to run the page and to save PNGs. Compared with step 5, the stills'
  PNGs are byte-identical and their SVGs differ only in having no leftover `var(...)` references.

## Accessibility (added after step 6)

- The map's `<svg>` is a `group` named after the view (it was an `img`, which hides its children from screen
  readers). Each card is a focusable `button` named by what it shows, in the order it shows it: its label, tabs (badges),
  step, author, inner-view count, change, sub-line and chips. So its visible text is a run of whole words of its name
  (WCAG 2.5.3 Label in Name, at any zoom), and what it does not show, or not in full, follows in parentheses: a hidden
  sub-line, the rest of a cut text, "edited", "opens the inner view". `aria-pressed` says whether it is selected.
- Keyboard: Tab reaches each card, then (since 0.7.0) each line; arrow keys on a focused card move to the nearest card
  that way (on the empty canvas they still pan); Enter selects, and Enter on a selected card opens its inner view (or,
  with none, sends `select` again, as a click does); Escape clears, then goes up a level. A card's or box's tabs take focus
  when the host listens for `click`, and Enter on one is a click on it.
- A polite live region announces each selection ("Billing, selected", "3 cards selected", "Line from A to B") and
  each view shown.
- Exported files (`toSVG`, `toPNG`, stills) are pictures: `role="img"` named after the view, nothing focusable.
- Contrast: the default palette (`lib/umlimator-theme.css`) meets WCAG AA in light and dark. Every text is at least
  4.5:1 on what it is drawn on (lowest: an amber badge in light, 4.87:1), and every line is at least 3:1 against the
  stage. `tests/contrast.html` checks this on the example map and on one with every change state and badge tone. A
  host that sets its own `--um-*` colours owns their contrast. The dimming of unrelated cards while one is selected is
  meant to recede, and is not checked.
- Focus can come back: the map's element delegates focus (`attachShadow({ delegatesFocus: true })`), and focus that
  reaches the canvas from outside, not by a press, goes on to the selected card; `handle.focus(ref?)` puts it on a card
  (default: the selected one, else the map).
- Not covered: containers themselves are reachable by pointer only (their tabs are not, with a `click` listener), and so are chips.

## State

What the map is doing at any moment, and what moves it, as built in 0.14.0. A map runs several state machines: a move
between views, a story, a tour or replay, an edit gesture, and around it the page's keys and link, the element's
lifecycle and the MCP server's page. Each follows four rules, and the map's state can be read as one snapshot,
`MapState`. The tables below are checked against `lib/umlimator.js`, `lib/umlimator-element.js` and `umlimator_mcp.py`.
`examples/states.json` draws the main machines with umlimator itself.

### The four rules

1. **A transition finishes or rolls back.** A move between views runs in `try`/`finally`: if anything in it throws, a
   bug or a page hook, the map stops being busy, the fade comes off, and every `setView()` waiting resolves `false`, so
   the next move works. A host's listener can't get that far: `emit()` calls each listener on its own and hands its
   error to `reportError()`. The CLI writes each file to a temp file and renames it over the target only once it is
   whole, so a `pdf` that fails leaves the previous PDF.
2. **Every request gets a truthful outcome.** `setView()` resolves `true` once its view shows. It resolves `false` for a
   view the model lacks, when a later request supersedes it, when an `update()` takes its view away during the move, and
   on `destroy()`. The MCP server's page tools say "Shown on 1 page" only after the page has posted that it showed the
   command; otherwise they say what happened: the page could not, it did not within 6 s, or no page is open. `check`
   exits 1 when it checked no view.
3. **One owner per piece of state.** Each kind of mark has a layer of its own: the host's `highlight`, a story's
   `story`, the lens's `lens`, the page's lit paths `lit`, the assistant's `mcp`, a tour lit at rest `tour`, a replay's
   `replay`. So `highlight(null)` never takes away a story's step. Motion belongs to each handle: `instant` stills its
   own map only. On the page, one function writes the link and one follows it. The MCP server sends a page what the
   assistant wants shown, folded from its commands, not its last command.
4. **State is readable.** People read it in the link (`#view=&node=&story=&step=&lens=`), in focus that stays in the
   map, and in the live region and the hint line. Hosts read it from getters, events and types: `MapState`, the
   `state`, `story` and `lens` events, `StoryPlayer.state`. Agents read one JSON snapshot, `handle.state`, which the MCP
   server's `page_state()` returns as each open page posts it.

### `MapState`

`handle.state` builds a fresh snapshot on each read. It is frozen all the way down and plain JSON, so it can be logged,
sent or compared as it is.

| Field | Value | What it says |
|---|---|---|
| `view` | string or `null` | the view shown; `null` while the model has no views |
| `navigating` | string or `null` | the view a move under way is going to |
| `selection` | `Ref[]` | every selected thing, the latest last (as `selected`) |
| `expanded` | `string[]` | the cards unfolded on the view shown, in the order they unfolded |
| `lens` | string or `null` | the lens on the map |
| `overlays` | `string[]` | the layers of marks, in the order first set: `lens`, `highlight`, `story`, `tour`, `replay`, the page's `lit`, the MCP page's `mcp`, a host's own |
| `story` | `{ id, step, steps, playing }` or `null` | the story shown: its step (from 0), how many it has, and whether it goes on by itself, the player's own state |
| `tour` | boolean | a tour's dot is on the map, riding or held (by `paused`, or by its story's pause); a path lit at rest under reduced motion is `false` |
| `replay` | `{ playing }` or `null` | a replay under way, playing or paused by its own `pause()` |
| `paused` | boolean | the standalone page's ❚❚ holds every clock: a tour's or a replay's dot, a story's step and the flow. It leaves `story`, `tour`, `replay` and `flow` as they are, so `playing: true` with `paused: true` is a story or a replay that would play, held by the page (0.15.0) |
| `camera` | `{ x, y, zoom }` | the centre in map units, to a tenth, and the zoom (1 is actual size), to a thousandth |
| `flow` | boolean | the lines flow (≋, F) |
| `motion` | `'full'`, `'reduced'` or `'instant'` | how this map moves |
| `speed` | number | the motion speed, as `handle.speed` (0.5 to 2 on the speed button; 0.25 to 4 from a host or the model) |
| `gesture` | `'idle'`, `'dragging'`, `'connecting'` or `'naming'` | an edit in progress, on an editable map |
| `destroyed` | boolean | `destroy()` has run |

**The `state` event**, `{ state, changed }`:
- It comes after the snapshot changes, at most once a frame. The first change starts a 16 ms timer, a timer and not a
  frame so that a page in a background tab still reports, and the changes made until it fires come as one event.
- `changed` lists the keys whose value differs from the last event's.
- The camera comes once it rests: 150 ms without a change, with no press on the map and no move under way. A pan, zoom,
  glide or drag is one event, with `camera` in `changed`. Until then the event's `camera` is where the camera last
  rested, while `handle.state` reads it live.
- A state listener hears the changes made after it was added, with `on()` or with `on: { state }` from the start.
- The last one comes from `destroy()`, with `destroyed: true` and the camera where it stopped.

The other events are as they were. Two are focused on one machine: `story` on every change of the story shown, and
`lens` when the lens changes.

**Getters beside it:** `navigating`, `destroyed`, `motion`, `story` (the `StoryPlayer` of the story shown, whoever
started it), and `flow`, which a host can also set (`handle.flow = false`); the page saves only what the reader sets with
≋ or F. (`shapes`, from 0.15.0, went in 0.21.0: maps draw in one card-shape style.)

**Where it is read:**
- `handle.state` on any `render()` or `mountPage()` handle;
- `window.umlimatorMap.state` on a page the CLI writes;
- `el.map.state` on `<umlimator-map>`;
- the MCP server's `page_state()` tool. Each open page posts its `MapState` on every `state` event and after each
  command. The tool returns, for each page, its `state`, whether it shows the model's latest version, and the last
  command it showed or why it could not; then what the assistant asked for last (`asked`) and whether the model renders.

### The machines

Each table names a machine's states as the code holds them, what moves it, and where it goes.

**Navigation**, in `render()`: one move at a time, and the latest request wins. A move is the target and the requests
waiting for it, read as `navigating`.

| State | What moves it | Goes to |
|---|---|---|
| At rest (`navigating: null`) | `setView(id)`; `open` (double-click, Enter, ⤢); up (Esc or Backspace with nothing selected, the up button); a story's step; the page's link, views list, breadcrumbs and search | Leaving; under reduced motion or `instant`, Drawing at once |
| At rest | `setView()` of the view shown, or of a view the model lacks | At rest: `true`, or `false` with a console warning that lists the model's views |
| Leaving: the camera zooms into the card or out, then the view fades (130 ms) | the fade ends | Drawing the latest target |
| Leaving | the latest target is the view the move started on, or an `update()` took it away | At rest on the view it started on, the camera back: `true` when that view was asked for, `false` for a view gone |
| Drawing | the latest target drawn, the selection cleared | Entering |
| Entering: the camera zooms to fit (460 ms) | the camera arrives | At rest: the requests for that view resolve `true` |
| Entering | a request for another view came meanwhile | Leaving again, towards it |
| A move | `setView()` of another view | the same state, aimed at the new view: the requests before it resolve `false` at once. A request for the view the move is going to waits with the others for it |
| A move | a press on the map | the same state: the glide settles at once, and the move goes on |
| Any | `destroy()` | Destroyed: every waiting request resolves `false` |

- **Emits:** `open` before a drill-down (`preventDefault()` keeps the view); `select` with `null` when the view drawn
  clears the selection; one `viewchange` `{ view, from }` per move, from the view it started on to the view it shows,
  and none when it ends where it started; "Showing …" in the live region. A move the story didn't ask for pauses a
  playing story.
- **Settles:** `setView()` resolves `true` or `false` as above. Under reduced motion the view is drawn before
  `setView()` returns.
- **Up** goes back the way the reader came. `render()` keeps the views the reader walked through, by any move
  (`setView()`, `open`, a story's step, the views list). Up goes to the one before, and from the first view to its
  parent in the model. A view walked through again cuts the walk back to it, and an `update()` drops the views it takes
  away. The page goes up its breadcrumbs instead.

**The story player**, in `render()`: `play()`, the page's Stories menu, or a link's `story=&step=`. `handle.story` is
the player shown, and `player.state` names its state.

| State (`player.state`) | What moves it | Goes to |
|---|---|---|
| none (`handle.story` is `null`) | `play(id)`; the Stories menu; a link with `story=&step=` (shown paused) | entering its first step, or `step` |
| entering: the step's view, camera, selection and highlight on their way | all in place | playing, or paused when it was paused or opened with `auto: false` |
| entering | the reader went to another view on the way | paused on the step; `resume()` shows it again |
| playing | the step's time is up (default 4 s) and its tour has ended | entering the next step |
| playing | `pause()`, ❚❚ on the bar; the reader taking the map: a press, a wheel that zooms, a key the map acts on, a zoom button, a host's `fit()`, `setView()` or `select()`, the page's views list or search | paused, the step's tour held too |
| paused | `resume()`, ▶ | playing |
| playing or paused | `next()`, `prev()`, › ‹ on the bar, → ← PageDown PageUp | entering that step, still playing or paused |
| any | past the last step: `next()` or ✓ on it, or its time up while playing | ended: `done` resolves `true` |
| any | `stop()`, ✕, Esc (Backspace too on the page), `play(null)`, another `play()`, an `update()` whose model lacks the story, `destroy()` | stopped: `done` resolves `false` |
| any | an `update()` that changes the step shown | entering that step again, as the model has it now |

- `play()` of a story the model lacks returns `null`, and the story shown plays on.
- The page's ❚❚ holds the step's time and its tour, without a pause: `player.state` stays `playing`, and `MapState`
  reads `paused: true` with `story.playing: true`, a story that would play, held by the page. ▶ gives the step its time
  again.
- **Emits:** `story` `{ story, step, steps, playing }` on each change: entering a step (before the step's own `select`
  and `viewchange`), a pause or a resume (the same step), and the end (`step: null`, on `destroy()` too). The step's
  selection comes as `select`, and its highlight is the `story` layer. The live region says "Step 2 of 5: …", then
  "End of the story" or "Story closed".
- **Settles:** `player.done`: `true` once told to the end, `false` when stopped.

**Tours and replays**, in `render()`: one trip at a time, from `tour()`, `replay()` or a story step's tour. The trip
is read as `tour` and `replay` in `MapState`, and the page's ❚❚ as `paused`.

| State | What moves it | Goes to |
|---|---|---|
| no trip | `tour(path)`, `replay(spans)`, a story step's tour | riding: `tour: true`, or `replay: { playing: true }` |
| no trip | `tour(path)` under reduced motion | lit at rest: the path in the `tour` layer, its cards ringed and numbered, said in the live region; `tour()` resolves `true` at once |
| no trip | `replay(spans)` under reduced motion | no trip: each call's duration labelled at once, and `done` resolves |
| riding | the page's ❚❚ (`paused: true`); a story's pause, for its step's tour; the replay's `pause()` (`replay.playing: false`) | held where it is, still on the map: `tour` stays `true`, and under ❚❚ `replay.playing` stays as it was |
| held | ▶ (`paused: false`); the story's `resume()`; the replay's `resume()` | riding |
| riding | the dot reaches the end | no trip: `true`; a replay's labels stay |
| riding or held | Esc on the map ("Tour stopped", "Replay stopped"), `tour(null)`, the next tour or replay, a new picture of the view (a move, an `update()` that redraws it, unfolding), a story's next step or its end, for its step's tour, the replay's `stop()`, `destroy()` | no trip: `false`; a replay's labels go |
| lit at rest | the same | no trip: the path is taken off |

- **Emits:** nothing of its own, besides `state`. Each card the dot reaches flashes.
- **Settles:** `tour()` resolves `true` at the end (at once when lit at rest), and `false` when cut short or when no
  line joins its cards. `replay().done` resolves `true` at the end (at once under reduced motion), and `false` when
  stopped or cut short, when no call makes a hop on the view, and from a destroyed handle.

**Gestures**, in `render()` with `editable`: one at a time, read as `gesture`. A gesture never changes the model: it
emits `change`, and the host applies it and calls `update()`.

| State (`gesture`) | What moves it | Goes to |
|---|---|---|
| `idle` | a card pressed and moved 5 px (with `move` or `reorder`) | `dragging` |
| `idle` | a press on the handle beside the selected card (with `add`) | `connecting` |
| `idle` | F2 (`rename`); N, ＋, or Alt + double-click on the canvas (`add`) | `naming`: a name field over the card, line, box or new card |
| `dragging` | released | `idle`: `change` with `move` or `reorder` and a place hint, or none where nothing would change |
| `connecting` | released over another card | `idle`: `change` with `add` and `kind: 'edge'`; released elsewhere, none |
| `naming` | Enter | `idle`: `change` with `rename` or `add`, when the name is new and not empty |
| `naming` | Esc in the field, or the field losing focus | `idle`, no change |
| any | Escape on the map, before anything else; a new picture (a move, an `update()` that redraws, unfolding); `destroy()` | `idle`, no change; a name field stays over its card through a redraw of the same view while the card is there |

**The page's keys**, in `mountPage()`: one router reads each key from the top open layer down. Esc and Backspace close
the top layer, wherever the focus is; a text field keeps its own keys.

| Layer, from the top | Opened by | Esc or Backspace |
|---|---|---|
| An example shown full size | a thumbnail in the details panel | closes it, and focus goes back to the thumbnail. While open it holds every key: Tab stays in it |
| Search | / or ⌘K (Ctrl K), the Find button | closes it, and focus goes back where it was. ⌘K closes it too |
| The key list | ? or its button | closes it |
| A menu: Export, Stories or Lenses | its button | closes it, and focus goes back to its button |
| The view's popover | i, or the view's pill | closes it |
| The story recorder | Export ▸ Record a story… | closes it, asking first while it holds steps not saved |
| A story | the Stories menu, a link, `play()` | stops it (`play(null)`) |
| The map | always there | the map's own keys: Esc ends a tour or replay; then Esc or Backspace clears the selection, else goes up a level ("Already at the top") |

- One of search, the key list and the menus is open at a time: each closes the others.
- While search is open, the router acts on Esc, Backspace and ⌘K only.
- Enter, Space and the arrows aimed at a control outside the map are that control's own. The map's keys reach its
  canvas from anywhere else on the page.
- In `render()` alone, Escape cancels a gesture, then stops a story, then ends a tour or replay, then clears the
  selection, then goes up.

**The page's link**, in `mountPage()`: one function writes it from what the map shows, and another follows it.

| State | What moves it | Goes to |
|---|---|---|
| In step: the link names the view, card, story step and lens shown | a new view shown | a new history entry |
| In step | a selection, a story step on the view shown, a lens, ◐ when the link names the theme | the same entry, rewritten |
| A move under way | the selection it clears | nothing written: the new view's entry comes once the move lands |
| In step | the page's load, Back, Forward, or an edited link | following it: its lens, then its view (a move), then its story step, shown paused, or its card. Nothing is written meanwhile |
| Following | the map has settled | in step, the entry rewritten. What the model lacks is corrected in the link, and the hint line says so: "Link corrected: no view “x”" |
| Following | the reader starts a move of their own | that move wins, with an entry of its own |
| Following | an entry that names no story | the story shown stops |

The link's keys are `view`, `node`, `story`, `step` (from 1), `lens`, and `theme` when the page was opened with one;
`reader` stays as the page was opened. `check`, `shot` and `still` describe one run, and the link the page writes
leaves them out, so Copy link never shares a page in check mode.

The hint line shows the key hints, and for a while what just happened ("Link corrected: …", "Already at the top"). That message is said in a live region of its own, so a screen reader hears the message and not the key hints after it. At a phone's width the key hints are hidden and a message shows as a toast at the foot of the map, and the details panel's buttons (Open, the light buttons, What if, Close) move to a row under the card's name when the name would have less than 160 px, wrapping there if they must, so the name and Close stay on the screen (audit 61). ◐ is a toggle named "Dark theme", pressed while the page is dark.

**`<umlimator-map>`'s lifecycle**, in `lib/umlimator-element.js`:

| State | What moves it | Goes to |
|---|---|---|
| Not drawn: the element's children show | connected to a document | loading |
| Loading: `el.loading` is `true`, and `el.map` is still the map drawn last, or `null` | the model fetched from `src`, or read from a child `<script type="application/json">`, drawn with a view to show | drawn: `load` |
| Loading | a fetch that fails, JSON that doesn't parse, no model, `render()` throwing, or a model with no view to draw | failed: `error`, an `ErrorEvent` whose `message` says why. The children show again, and `el.map` is `null` |
| Loading | another change before the model comes | loading: the later draw wins, with one `load` |
| Drawn or failed | `src`, `view`, `minimap`, `controls` or `wheel` set to a new value | loading. A model already fetched from the same `src` is used again |
| Drawn | an attribute set to the value it has, or `height` | drawn: nothing is drawn again; `height` resizes it |
| Any | removed from the document | not drawn: the map destroyed, `el.loading` `false` |

The map's `select`, `open` and `viewchange` come as `umlimator:select`, `umlimator:open` (`preventDefault()` keeps the
view) and `umlimator:viewchange`.

**The MCP server's page**, in `umlimator_mcp.py`: the page it serves runs a script that shows what the assistant wants
on the map's handle and posts back what it shows.

| The served page | What moves it | Goes to |
|---|---|---|
| Waiting for the map | the map drawn | listening: the event stream open, its `MapState` posted |
| Listening | the map's `state` event | listening: its `MapState` posted; the assistant's highlight, the `mcp` layer, shown on its own view only |
| Listening | an event: what the assistant wants shown (view, highlight, tour, story), with the command's id | showing it, one command at a time |
| Showing | shown | listening: its `MapState` posted with the command's id |
| Showing | an error (a view that did not show, a story the page lacks) or more than 5 s | listening: the command's id posted with the error |
| Showing | an event from a newer version of the model | reloading, to draw that version |
| Listening | the event stream refused: another model's server took the port | following no server: a bar says so, and the map stays as it is |
| Any | a command it has shown already | nothing |

| A page tool on the server (`show_view`, `highlight`, `tour`, `play_story`, `clear`) | What moves it | Goes to |
|---|---|---|
| Called | a view, card, line or story the model lacks | answered with an error that says which (and, for a view or a story, the ones it has); nothing is sent |
| Called | the model's latest version drawn (one that doesn't render keeps the last page that did) | folded into what the pages should show: the latest view, highlight, tour and story |
| Folded | sent to every open page | waiting, up to 6 s |
| Waiting | every open page answers, or 0.5 s after the first answer | answered: "Shown on 1 page at …, on view trips", or "The page could not show it: …" |
| Waiting | 6 s go by with no answer | answered: "Sent to 1 open page at …, which did not show it within 6 s …" |
| Waiting | no page is open | answered: "No page is connected: open … in a browser, and it shows this once it connects." |

- A page that opens later gets what the assistant wants shown, not the last command. A tour or story that a page
  reports ended is taken out of it.
- A command ends only the assistant's own tour and story. The page counts the assistant's tour as on the map until its
  dot reaches the end or is cut short or replaced; a path lit at rest under reduced motion, until a story's step or end
  takes its place. So a command with no tour leaves the tour of a story the reader started: that story is the reader's.
- While the model's latest version does not render, every answer begins with why, the page shows the same in a bar,
  and `page_state()` gives `model.renders: false`.

### What happens on `destroy()`

In the order the code does it:
1. A gesture in progress is cancelled, with no `change`.
2. The story shown stops: a last `story` event with `step: null`, and its `done` resolves `false`.
3. Every waiting `setView()` resolves `false`, and a tour or replay ends: `tour()` and `replay().done` resolve `false`.
4. Timers stop, every wait inside a move settles, and the camera's glide stops.
5. The map's element is removed; anything else in the container stays.
6. A state listener hears a last `state` event, with `destroyed: true` and the camera where it stopped. Then every
   listener is dropped.

After it, `destroyed` is `true` and `state` still reads. Every call is safe and does nothing: `setView()` and `tour()`
resolve `false`, `replay()` returns one whose `done` is `false`, `play()` returns `null`, `toSVG()` returns `''` and `toPNG()` `null`,
`lens()`, `expand()` and `collapse()` return `false`, and `on()` returns an unsubscribe that does nothing.
`mountPage()`'s handle also takes the page's listeners off the document and the window, and `<umlimator-map>` destroys
its map when it leaves the document.

## 0.5.0: fixes from the first embedding (issues #26 to #36)

- **Container boxes** are a faint panel (`--um-panel` at 45 %) with an 11 px title, from the module's own stylesheet.
  The page's rules for them never reached the map's shadow root, so boxes were black (#26).
- **Tints follow their tone.** The map mixes each `--um-<tone>-f` itself, from the tone and `--um-panel` in effect where
  it is, so a host may set a tone on any ancestor of the map. The theme file mixes its tints on `:root`, where they keep
  the default tone; those stay for page chrome. A host that wants a tint of its own sets it on the map element,
  `.umlimator` (#29).
- **Test DOMs.** `render()` needs no stubs in a test DOM such as jsdom: without `ResizeObserver` the view is fitted
  once and not observed; without a 2D canvas, text is measured with the font-independent estimate (as `measure: false`
  does); without `matchMedia` there is no reduced-motion preference (#32).
- **Enter on a selected card** with no inner view sends `select` again, as a click does, so a keyboard user can bring
  back the details a host shows on `select` without leaving the card (#30).
- **Focus back into the map.** The map's element delegates focus, so `host.focus()`, which a dialog calls when it
  gives focus back to the element that opened it, lands on the selected card (it landed on `<body>`), and
  `handle.focus(ref?)` puts keyboard focus on a card: `ref`'s, by default the selected one, else the map (#36).
- **A click the host takes.** `click` has `preventDefault()`: calling it keeps the selection as it was (no `select`), so
  a host can treat a chip, a badge or a card as a link. A chip click used to select its card as well, with nothing in
  `select` to tell the two apart (#31).
- **Card names match what cards show** (WCAG 2.5.3). axe-core 4.14 reported `label-content-name-mismatch` on every card
  with a sub-line or a badge (13 of the example's 13): the card's texts ran together with no whitespace between them,
  and names held text the card did not show. Now a card's texts are apart, its name follows what it shows (above), and
  axe finds nothing at rest, after a selection, after `update()` or zoomed out (checked with axe-core 4.14; `tests/embed.html`
  checks the same rule without it). A card text that does not fit is cut between words (#35).
- **Containers keep apart.** A view with containers is laid out in blocks: each container's cards together in columns of
  their own, in call order; blocks run left to right by the lines between them, those with no line between them stack in
  the same columns, and a nested container is a block inside its parent's. With or without a `layout`, a column (row)
  gap widens wherever a box would come within 32 px of another box or of a card outside it, so borders never touch and a
  line can run between them. Auto-layout used to interleave containers' cards, and boxes in neighbouring columns
  overlapped at the default gaps. Views without containers keep their exact geometry; of the benchmark views only
  b26/overview moved (`bench/expected.json`). The CLI's layout search swaps cards only within their box (#27).
- **Lines to containers.** An edge whose `from` or `to` names a container of the view is drawn to the box's border
  (the side chosen as for a card, the port in line with the other end where it can be), and is an ordinary edge `Ref`;
  auto-layout puts its source before the box. It used to draw nothing and say nothing. An edge between a box and
  something inside it has no line, and `console.warn` names it (#28).
- **Badges on containers.** A container takes `badges` as a card does (strings or `{ text, tone }`): tabs on the box's
  top border, at the right, in the same tones; the box widens to fit its title and tabs, and lines keep off them. Each is
  a click target, `{ type: 'badge', container, index, value, view }` (a card's badge has `node` instead), and a click
  selects the box. With `editable`, Delete and Alt + ← / → on a clicked box badge emit `delete` and `reorder` with that
  Ref, as on a card's badges (#33).

## 0.6.0: fixes from the target architecture map (issues #38 to #41)

- **Test DOMs, quietly.** The 2D context that text is measured on is probed once per module, not once per `render()`.
  jsdom prints "Not implemented: HTMLCanvasElement's getContext()" on every call, so a host's suite printed it once per
  mounted map (112 times); now it prints once per test file (#38).
- **Lines to containers face the box.** A line to a box takes the sides that face each other across the wider of the
  two gaps, so a box below and beside its source is entered from the top. The sides were picked as for a card, so such
  a line left the card's side, ran down beside the box, turned back under the card and came back into the box's side.
  Its end on the box lines up with the port at its other end where the border allows (off the title, tabs and corners),
  so a box under a card gets a straight drop. A card 32 px beside a box gets a straight line: the two ends were closer
  than their stubs, so the router gave up and drew the plain fallback elbow (#39).
- **No line runs through a card.** When the router found no route for a line, it drew a plain elbow through whatever
  lay in the way, and the card's mask hid the line where it passed, so the line read as a connection to that card (on a
  target architecture map, 16 of 28 lines). Now such a line gets room, as boxes do (#27): its way around the cards shows
  where it would run along another line, those column and row gaps widen by 20 px per line, and the view is laid out
  once more. A line still without a route goes around the cards, across or along other lines if it must. A loop drawn
  under the boxes that would cut through a card is routed like any other line. A line that still crosses a card it does
  not join (cards 1 px apart, say) is named in a `console.warn`. A view whose lines all route keeps its exact geometry;
  one that is laid out again takes about twice as long (the 50-module bench view: 0.7 s, now 1.6 s). On the map that
  found this, all 28 lines now route, and the map is 17 % taller. Of the bench views, b10, b26/overview, b69/overview,
  b69/back and m50 moved; d24, a dense hub, is new. The CLI's layout search scores its candidates as before, from one
  layout each (#40).
- **Sub-line and chips together.** A card's chips (`verbs`) took its sub-line's place, so a card with both showed only
  the chips, and the sub-line was in its name alone. A view's `subAndChips: true` makes its cards 80 px tall (64 by
  default), and a card with both shows its name, its sub-line, then its chips on a third line, in the sub-line's column,
  clear of the mark. Its name follows what it shows (#35). It is a view option, so maps without it keep their geometry; a
  script card (no kind) shows no sub-line either way (#41).

## 0.7.0: fixes from the Reader's architecture map (issues #43 to #47)

- **Lines and tabs from the keyboard.** Tab reaches each card, then each of its tabs when the host listens for `click`,
  and, after the cards, each line: a button named "Line from Orders to Store: reads · 12" ("Line between A and B, both
  ways: …" for a two-way line; its sublabel in parentheses), pressed while selected. Enter on a line selects it, as a click
  does (`select` with the edge `Ref`); Enter on a tab is a click on it (`click` with the badge `Ref`, then its card or box
  is selected unless the host calls `preventDefault()`), so a tab that is a link in the host works from the keyboard. A
  card is a button, and a button inside it is invalid (axe: nested-interactive), so a line's or card tab's focus target is
  drawn outside it, after the cards, and the pointer still hits the line or tab itself; a box's tab is a button itself.
  Tabs are buttons only for a host that listens for `click` (`options.on.click` or `handle.on('click')`), as status tabs
  (BUILT, TARGET) do nothing else. Focus brought to anything by key pans it into view, and focus given back to the map
  (`host.focus()`, `handle.focus()`) lands on the selected line as on a selected card. Tab text keeps the model's case in
  the DOM, upper-cased by the sheet, so a screen reader, a copy or a test reads "Open data", not "OPEN DATA"; a file drawn
  from the map (`toSVG`, stills) still has it upper-cased. Only cards and the zoom controls took focus before, and a host
  that acts on lines and tabs had to list them beside the map. Checked with axe-core 4.14: no violation in the parts this
  adds (#43).
- **How much a line stands for.** An edge's `weight` (1, 2 or 3; the host picks the bucket) draws its line at three widths,
  about 1.8, 3.2 and 4.5 px, with its arrowhead and hit line larger in step; its colour, and so its contrast, stays its
  kind's. Its `sublabel` is a second, smaller line under the label, in the same pill, counted in the room the router leaves
  for labels (a column gap fits the wider of the two lines). A line that stands for several edges takes the largest weight
  and shows each sublabel, joined by " / ". Both reach the geometry (`weight`, `lbl.sub`); views without them keep theirs.
  Every line was drawn at one width with one label line, so a line standing for 486 relations looked like one standing
  for 1 (#44).
- **Line colours mean what the host says.** `render()` and `layout()` take a line's kind (its colour) only from its edge's
  `kind`: `calls` (the default), `feeds`, `triggers`, `state` (thinner, a muted label, no flow) or `guard`, drawn in
  `--um-w-<kind>`. They guessed it from words in the label, with the skill map's patterns ("reads" gave `state`,
  "triggers" gave `triggers`), and drew no legend, so a host's own words picked colours that meant nothing to a reader and
  changed with the wording. A view's `kindsFromLabels: true` brings the guess back; the standalone page (`mountPage`), which
  shows a legend, always guesses, so the CLI's pages and stills keep their colours. A line that stands for several edges
  (A→B and B→A, parallel edges) takes the first kind they name, in model order; a merged pair took the first edge's guess
  even when the other named its kind. A line from a hook is still a guard, and one to or from a board state. `state` was too
  light to see (1.96:1 against the light stage, 2.73:1 dark), so `--um-w-state` is darker, 3:1 or more in both themes, still
  the lightest line; `tests/contrast.html` now checks a line of every kind (#45).
- **Cards with no lines** sit in a row of their own under the view, one per column in view order, wrapping at its width.
  Auto-layout put them in the first column, under the sources, so that column grew (four outside systems under five
  people, a column of nine on a system-context map) and the lines from the sources ran around it. A card with no line in
  a row under every card that has one never widens a column: one wider than its column keeps clear of its neighbour
  instead, so the cards with lines keep the places they have without it. The row comes from the cards' slots and lines
  alone, so the stable layout across `update()` and the layout `umlimator.py render` bakes into a page draw it the same;
  a host's `layout` still places every card where it says. Views with containers keep their block layout. Of the bench
  views, those with such cards moved: b10 (both views), b69 (all three) and m50 (#46).
- **A card can open a view the host loads later.** A node's `opensView` may name a view that is not in the model yet. The
  card looks stacked (⤢ with `opensCount` when the host gives one, else ⤢ alone), and double-click, Enter on the selected
  card and a click on its ⤢ badge emit `open` with that view's id. The map goes in once the view is in the model: the host
  loads it, calls `update()`, then `setView()`, or calls `update()` inside its `open` handler, and the map goes in at once;
  `preventDefault()` still keeps it where it is. `open` was emitted only for a view in the model, and the stacked look
  needed that view's cards, so a host that loads one level at a time (a C4 system context, then its containers) showed
  plain cards that did nothing; an empty placeholder view made `open` fire but left the card plain. A card whose inner view
  is in the model but empty is stacked too now. A click on the ⤢ badge of any stacked card opens it (it selected the
  card). Upstream's validator in `umlimator.py render` still rejects an `opensView` it cannot find, so this is for
  embeds; a page the CLI writes has every view (#47).

## 0.8.0: fixes from Alchemy's 0.7.0 check (issues #49, #50)

- **Lines into one side of a card nest.** When several cards in one column point to one card, their lines end on one side
  of it, and the router turns each as late as it can. Routed shortest first, the last line found no track left beside the
  others: it crossed one, or went back around its own column (on a system context, three people pointing to one system:
  760 px for a 406 px direct route), and port repair then swapped ports to trade the crossing for the detour. Now the
  lines that end on one side are routed in nesting order, the one whose turn lies nearest the card first, so each takes the
  track beside the one before. And the ports on a top or bottom side follow the angle at which each line's other card
  lies, swept from the side's left end: ordered by that card's x, then by its y in one direction, cards in one column on
  the left of a bottom side came in the wrong order (the lines a side has no room for move to the card's bottom side, so
  this showed with five sources or more). With three to seven sources every line now runs straight to its port, within
  1.1 times its direct route. Lines move wherever several end on one side: of the bench views all but b26/n01 and
  bookshop/api moved; the layout check finds 941 issues across them, 958 before (m50 382 to 362, b69/overview 410 to 398,
  d24/boxed 32 to 27; b26/overview 90 to 110, a random graph whose crossings shift with the order lines are routed in) (#49).
- **At fit, the zoom controls and the minimap keep off the cards.** `render()` fitted the view to the whole element, so the
  controls in its bottom-right corner, and the minimap above them when it is on, could cover a card there until the
  reader panned or zoomed (a system context's row of cards with no lines runs along the bottom). Now, when a card would sit
  under one of them, the fit also tries room for them at the bottom and at the right and keeps whichever leaves the map
  larger; often that costs no zoom at all, as a view limited by its height just moves left. A view whose corner is empty is
  fitted as before. The standalone page's own insets (header, legend) get the same room. Nothing changes for a host (#50).

## 0.9.0: fixes from Alchemy's 0.8.0 check (issue #53)

- **Cards in a column are ordered so the lines between columns cross as little as they can.** When two cards in one column
  pointed, crossed, to two cards in the next (the upper to the lower, the lower to the upper), auto-layout kept that
  order, and the router, which avoids every crossing, sent one line back around its own column: 2.92 times its direct
  route on the issue's five cards, 5.84 times on a container's components view of 21 cards and 42 lines. Now a few
  barycentre sweeps reorder each column by where its cards' neighbours lie in the next and the previous column, starting
  from the reading order as before, and the new order is kept only when fewer lines cross between neighbouring columns.
  It applies to plain views and inside each container's block; a host's `layout` is used as it is. A view whose order
  crosses no more than another keeps it, so most views do not move: of the bench views b10 (both views), b69 (all three)
  and m50 moved. Across the bench the layout check finds 860 issues, 941 before (m50 362 to 284, b69/back 28 to 15,
  b69/front 2 to 1; b10/norepair 7 to 12, b10/overview 5 to 6, b69/overview 398 to 403), and the lines are 4.9% shorter in
  all; m50 and b69 lay out faster, with fewer lines to route around others. The router still avoids every crossing it can
  (#53).

## 0.10.0: known gaps (CLI validator, chips by keyboard, depth contrast, cards with no lines in boxes, kept pairs)

- **The CLI renders what `render()` draws.** `umlimator.py render` ran upstream's validator, which rejects a card whose
  `opensView` names a view not in the model (drawn since 0.7.0, #47) and a line that ends on a container (since 0.5.0,
  #28). `visual.py` stays as upstream wrote it (CI checks that): `umlimator.py` shows its validator a copy of the model
  without such an `opensView`, and with each container's id listed as a card's. Every other check still applies, and an
  error names the ids as the model has them (`edge data->nowhere has an unknown end`).
- **The reading depth on the zoom controls passes AA contrast.** READ, MAP and FULL were drawn in `--um-dim`: 3.45:1 on the
  bar in light and 3.57:1 in dark, under the 4.5:1 that axe's color-contrast rule asks of 10 px text. They now take
  `--um-muted`, as the zoom does. `tests/contrast.html` checks every text on the bar, light and dark.
- **Chips can be reached with the keyboard.** For a host that listens for click, each chip gets a focus target after its
  card's tabs, outside the card (a button inside the card's button is invalid), named by its verb; the last chip, "+3",
  is named by the verbs it stands for. Enter emits `click` with the chip's Ref and then selects the card, as a click on the
  chip does, and `click.preventDefault()` keeps the selection. Without a click listener chips stay out of the Tab order,
  as tabs do (#43).
- **Cards with no lines in a view with boxes go in rows of their own.** #46 put them in a row under a plain view; in a view
  with boxes they still stacked in the first column with the sources, in the view and inside each box. Now those outside
  the boxes sit side by side in a row under the view, and those in a box in a row at the bottom of the box, as wide as its
  columns. A box with no card that has a line keeps its cards stacked, and a host's `layout` is used as it is. The layout
  search that `umlimator.py render` bakes into a page leaves the rows alone, as under a plain view. No bench view moves:
  d24/boxed places its two such cards with a layout of its own.
- **The layout check no longer flags the return line of a kept pair.** In a view with `keepPairs`, A→B and B→A are two
  lines, and the one that runs back was reported as running right to left; the report also counted against such views in
  the layout search. A line whose reverse is drawn too is no longer flagged. No bench view's geometry moves; b69/overview,
  which keeps pairs, has 398 issues, 403 before.
- **CI:** b26's time limit is 3 s, up from 2 s. A runner took 1.36 s on 0.9.0 with b26's layout unchanged.

## 0.11.0: lines that skip columns, cards level with their neighbours

Maps generated from code are full of lines that span several columns: a service imports a package two layers down and
another three. Auto-layout now lays those out as it does lines between neighbouring columns.

- **Lines that skip columns order the cards they pass.** The column ordering of #53 counted only lines between
  neighbouring columns. A line that skips columns now has a point in each column it passes (Sugiyama's dummy nodes),
  placed first where the straight line between its ends would be. The sweeps order those points with the cards, and the
  order kept is still the one that crosses least, the order given unless another crosses less.
- **Each card is level with the cards its lines come from.** Cards were packed from the top of their column, so a line
  into a card lower down bent up to it. Now each card takes the median row of the cards its lines come from, then of
  those they go to, then again from the left, as near as its column's order allows (least squares, one row between
  cards), on half rows. Boxes do the same, levelled by the card inside them that each line meets. A line into a card's
  top or bottom (`toSide`, `fromSide`) asks for no row.
- **A small view is laid out a few ways and keeps the best.** Up to 30 cards, a plain view is routed with its cards
  level and packed as before, with the cards no line comes into in the first column or just before their callee, and
  keeps the layout the layout check scores best. It's a cheap version of the search `umlimator.py render` bakes into a
  page: that one takes 0.65 s (b10) to 18 s (b69) per view, which `render()` can't spend. A larger view takes the first
  way.
- **Cards keep a row apart in the CLI's search and in a layout's free slots.** Both checked for a card at exactly the
  same row; with half rows they now keep a full row between cards.
- **Bench:** r19 is new: a made-up monorepo's 19 packages and 30 imports, boxed by folder and plain. Layout-check issues
  and total line length, 0.10.0 → 0.11.0:

  | View | Issues | Line length |
  |---|---|---|
  | b69/overview | 398 → 231 | 166,834 → 132,668 |
  | b26/overview | 110 → 92 | 45,705 → 40,204 |
  | m50/overview | 284 → 277 | 145,926 → 136,374 |
  | b69/back | 15 → 13 | 11,438 → 10,348 |
  | b69/front | 1 → 0 | 1,809 → 1,599 |
  | b10/norepair | 12 → 6 | 5,981 → 6,393 |
  | b10/overview | 6 → 4 | 5,691 → 4,957 |
  | bookshop/overview | 0 → 0 | 6,443 → 4,828 |
  | bookshop/api | 0 → 0 | 1,159 → 1,035 |
  | r19/boxed (new) | 54 → 24 | 31,266 → 26,707 |
  | r19/plain (new) | 30 → 28 | 17,554 → 14,792 |
  | **All bench views** | **939 → 704** | **472,307 → 412,406 (−12.7%)** |

  b26/n01 (a view about one card) and d24 (laid out by hand) don't move. A small view takes longer for the ways it
  tries: b10 54 → 90 ms, b69/back 62 → 155 ms, r19/plain 52 → 267 ms in Node. Larger ones take about as long or less:
  b69/overview 2.97 → 1.95 s, b26 0.52 → 0.39 s, m50 1.36 → 1.46 s.

## 0.12.0: paths, overlays, trace replay, diffs, time-lapse, drift, stories, rules, unfolding in place, and a model schema

Everything since 0.11.0, in one release:

- **Exploring a map, and live data on it** (#62 to #65): `overlay()` marks cards and lines without touching the model;
  `highlight()`, `tour()`, `paths()`, `reach()` and `describe()` light, play and put a view in words; `replay()` plays an
  OpenTelemetry trace (`otlpSpans()`) along the lines.
- **Change** (#66 to #68): `diff()` marks what changed between two models, and a GitHub Action posts it on pull
  requests; a time-lapse of a model's git history; `drift()`, the map against the traffic seen.
- **Stories** (#69): narrated walk-throughs, played on the map or from the page's Stories menu, recorded from the page,
  and written as animated PNGs by `umlimator.py record`.
- **Rules** (#70): what the model says must hold, marked on the map where it breaks; `umlimator.py check` fails on a
  broken rule. `check()` now names exactly the cards, lines and boxes an issue is about (#61).
- **Unfolding in place** (#71): a stacked card opens into a box on the same map, its neighbours around it.
- **A model schema, `validate()`, `check()` and a playground** (#59).

Nothing is removed. Two defaults change for a host that upgrades:
- `update()` eases into the next model: moved cards glide, new ones fade in, removed ones fade out. `ease: false` draws
  it at once, as reduced motion does.
- `umlimator.py check` exits 1 when the model breaks one of its own `rules`. A model without rules checks as before.

### A model schema, validate(), check() and a playground (#59)

- **A JSON Schema for the model**, `lib/umlimator.schema.json`, exported as `umlimator/schema.json`. It covers every
  field `render()`, `layout()` and the standalone page read, with a description each, enums for line kinds, weights, sides,
  render modes and changes, and the card kinds and tones as suggestions (any string is still allowed, as before). Keys
  beyond it are allowed. A model file that starts with `"$schema": "<path to>/umlimator.schema.json"` gets completion and
  checks in editors; the examples do. CI validates every example model against it.
- **`validate(model)`** lists a model's own problems before anything is drawn, each `{ level, path, message }` with `path`
  saying where (`views[2].nodeIds[4]`).
  - **Errors** draw as holes or not at all:
    - no views, or no list of cards;
    - a card, view, line or box without an id, or with one that is used twice;
    - a root, parent, `nodeIds`, `tour`, `stepIds`, `browserOrder` or `intake` entry that names nothing;
    - a box's card that isn't in its view, a box's unknown parent, or a box that ends up inside itself;
    - a line whose end is neither a card nor a box, or a view's line id that names no line.
  - **Warnings** draw other than they say:
    - an unknown card kind, which draws as a script card;
    - an unknown line kind, weight or side;
    - a `layout` or lane entry for a card the view doesn't show;
    - an `opensView` the model doesn't have yet, which is fine when the host loads it on `open` (#47).

  It accepts everything the CLI accepts since 0.10.0: a model line may end on any view's box, and a view's own line only
  on that view's boxes.
- **`check(model, viewId, options)`** runs the layout check's geometry on `layout()`'s geometry, so a host or CI gets it
  without a browser. Each issue is `{ message, targets }`: the message as the page's check words it, and the cards and
  lines it names as Refs, for `select()`.
  - It finds overlapping cards, crossing or shared lines, detours, lines against the reading order or through a card,
    labels on lines or off their own, boxes and lanes.
  - The page's check (`umlimator.py check`) also measures text in the DOM: text that overflows its card or touches its
    mark, titles that overflow, and edge labels on cards or on each other.
  - In Node, text widths are an estimate unless `measure` is given, so the layout, and what the check finds, can differ
    from a browser's. The playground passes the map's own font, so `check()` sees what the map shows.
- **`examples/playground.html`**:
  - Edit a model as JSON, and the map follows.
  - `validate()`'s problems and `check()`'s issues for the view shown appear under the editor; clicking one selects the
    card or line it is about, or opens the view.
  - Share puts the model in the link (deflate-raw and base64url, by the browser's own `CompressionStream`), and the link
    opens it again.
  - It also has an example picker, light and dark, and SVG and PNG export.
- **Inside:** `auditSvg` (the page's check) now builds on the same two geometry helpers `check()` uses; its report is
  unchanged, in the same order.

### Rules on the map (#70), and check() targets (#61)

- **`rules` in the model** say what must hold, and **`rules(model)`** lists each break: `{ rule, view, message, targets }`,
  with the message worded as the page's check words it, and Refs for `select()`. It is pure and runs in Node.
  ```json
  "rules": [
    { "id": "apps-no-db", "title": "Apps never call a database directly", "from": { "kind": "frontend" }, "to": { "kind": "database" } },
    { "id": "rides-own-trips", "title": "Only the ride services touch the trips store",
      "from": { "not": { "container": "rides" } }, "to": { "id": "tripsdb" } },
    { "id": "teams-acyclic", "title": "No cycles between teams", "noCycles": true }
  ]
  ```
  - **`from` and `to`** forbid lines from the cards one picks to the cards the other picks. A side left out picks every
    card.
  - **A selector** picks cards by `id`, `kind` or `container` (a box, at any depth), each a value or a list. Every key it
    has must hold, and `not` turns a selector round. A kind is matched as the map draws it, so `"db"` is a database. A line
    that ends on a box (#28) ends in that box, and a box has no kind.
  - **`noCycles`** forbids boxes that reach each other through their lines. A line counts between the two boxes that hold
    its ends right under the box (or the view) they share, so a box is weighed against its siblings, at every depth, and
    a line from a box into one of its own inner boxes counts for nothing. A cycle's targets are its boxes, then its lines.
  - **Where a rule holds:** a rule that names a box (a `container`, or a box's `id`, in `from`, `to` or a `not`) holds
    only in the views that draw at least one of the boxes it names, since a box belongs to its view. So the rides rule
    above holds in bike-share's system view, the one with a Rides box, and not in the Trip service's view, which shows
    the trips store without one. Any other rule holds in every view. **`views`** narrows either further.
- **On the map**, a line that breaks a rule is drawn rose, with a "!" just after its start whose tooltip names the rules.
  Its own tooltip and its accessible name say so too. The marks are part of the picture: the canvas, `toSVG()`, `toPNG()`,
  the CLI's pages and stills. An `update()` that only changes the rules redraws the marks and keeps the cards in place.
- **`umlimator.py check`** reports each break after the layout issues, counts them as `rules`, and exits 1 (`N broken
  rules`), so CI fails on a broken rule as `examples/layout.mjs` fails on a detour. `--ignore rules` leaves them out.
  `render` lists them with the layout check's problems.
- **`validate()`** errors on a rule without an id, with an id used twice, without `from`, `to` or `noCycles`, or with a
  view that isn't one. It warns on a selector key it doesn't know (the selector picks more cards), an id or box that
  names nothing, and a kind it doesn't know (that picks script cards, as such a card draws). The schema has `rule` and
  `selector`, strict on selector keys.
- **The playground** lists the view's broken rules before its layout issues. **bike-share** has two rules, which hold.
- **`check()` targets (#61)** are now exactly the cards, lines and boxes each issue is about, carried out of the
  checks themselves, no longer found by the names in the message: two cards with one label no longer both match, and
  a box issue names its box.

### Exploring a map, and live data on it (#62 to #65)

- **`handle.overlay(name, layer | null)`** puts marks on the picture without touching the model (#63).
  - **What a layer names:** `{ nodes: { id: CardMark }, edges: { id: LineMark }, dim }`. Cards go by node id. Lines go
    by edge id, or `"<from>-><to>#<n>"` for an edge without one, as Refs name them.
  - **A line's mark:**
    - `speed`: its flow's speed, as a factor (0 stops it);
    - `tone`: a glow under the line, in `--um-<tone>`;
    - `pulse`;
    - `label`: a pill under the line's own;
    - `level`, from 0 to 1;
    - `dash`.

    A drawn line that stands for several edges takes the strongest of their marks: a pulsing one first, then the most
    lit, then the fastest.
  - **A card's mark:**
    - `tone`: a ring around the card;
    - `badge`: a tab after its own, which is also its `aria-description`;
    - `pulse`;
    - `level`.
  - **Stacking:** layers stack in the order they were first set. Each property comes from the latest layer that sets it,
    and a card or line is as lit as its lowest level.
    - `dim: true` fades whatever the layer doesn't name, in place of the selection's dimming.
    - `null` removes a layer.
  - **Lifetime:** marks survive `update()` and `setView()`. Ids the view doesn't show are ignored.
  - **Exports:** `toSVG()` and `toPNG()` draw the marks, at rest. They belong to the host, like the model; the selection
    and hover don't.
  - **`examples/live.html`** now shows its traffic this way, and its model never changes:
    - flow speed follows the readings;
    - a line that drops readings pulses rose;
    - a slow line glows amber, with its delay;
    - each card's tab shows how far that part lags.
- **`handle.highlight(refs | null)`** is the `highlight` layer (#62): these cards and lines are lit and the rest dimmed.
  - A Ref's `level` fades it; without one, its `distance` does.
  - A chip's or badge's Ref lights its card.
- **`handle.tour(path, options)`**: the tour dot rides the line between each pair of cards in turn (either way), and
  through each card to its next line.
  - Each card it reaches flashes. A pair with no line between them is skipped.
  - It resolves `true` at the end and `false` when cut short: by a new tour or replay, `tour(null)`, a new picture of the
    view, or `destroy()`. With reduced motion it resolves at once.
  - `speed` is in map units a second (default 240).
- **`paths(model, viewId, from, to)`** and **`reach(model, viewId, from, { backward, depth })`** walk a view's lines,
  with no DOM, and return Refs for `highlight()` (#64).
  - `paths()`: every card and line on a path from one card to another, following lines forward.
  - `reach()`: what a card's lines lead to or, with `backward`, what leads to it. For calls, that is who depends on it.
    - Each card comes with its `distance` in lines, starting with the card itself at 0.
    - `depth` stops the walk that many lines out.
  - A line's Ref names one model edge.
  - A card, box or line marked removed (a diff model's) is not walked, and `rules(model)` and `describe()` leave it out the same way (audit 57); a typed view's own `describe()` (ER, flowchart, DFD, C4, information flow and the rest) reads the model after too, with every card, member, line and view entry `diff()` drew back removed left out (audit 58), except a model line the view after still lists to a card taken out of it, which `diff()` names in the view's `diffMarks.listed` (audit 59: a communication view's messages to a hidden lifeline were counted and numbered).
  - **In the standalone page:**
    - the details panel's → and ← (or the > and < keys) light what a card leads to and what leads to it;
    - with two cards selected (Shift-click), ⇄ (or P) lights every path between them, in either direction;
    - the hint line, a live region, says what was lit;
    - a new selection or view clears it, and so does the same key again.
- **`describe(model, viewId)`**: the view in plain sentences, the same for the same model (#62).
  - It covers the cards and their kinds, the boxes, what each card's lines do (in run order on a sequence view), and the
    cards with no line.
  - Uses: a text alternative, docs, or context for an AI model.
- **`examples/ask.html`** answers questions about bike share's Trip service in words, with a highlight and a tour. Its
  answers are written by hand. For an AI model to choose them instead, a host:
  1. sends the model `describe()`'s text and the question;
  2. asks for JSON back: the answer, the card ids to light, and a tour's card ids in order;
  3. calls `highlight()` with those cards and `paths()` between them, then `tour()`.

  The library itself makes no network call.
- **`handle.replay(spans, options)`** plays a trace (#65). Each call from one card to another (a span and its parent's)
  runs along their line at the trace's relative time.
  - **Timing:** the whole trace plays in `duration` ms (default 6000).
  - **Marks:** the line glows while the call lasts, then keeps its duration as a label in the `replay` layer, until
    `stop()` or the next replay.
  - **Spans** are `{ id, parent, service, start, end }`, in milliseconds. `otlpSpans(json)` reads them from an
    OpenTelemetry trace in OTLP JSON.
  - **Matching:** a span's service names its card through `match`, else as a card's id, else as its label, in any case.
  - **Returns** `{ hops, skipped, done, pause(), resume(), stop() }`. `skipped` counts the spans whose service has no card
    on the view, or whose call has no line there.
  - `examples/replay.html` replays a ride ending.
- **One at a time:** a tour and a replay both use the moving dot, so starting one ends the other.
- **Tests:** `tests/explore.test.mjs` (Node), and `tests/marks.html`, which `tests/embed.py` runs.

### Change: diff in pull requests, the time-lapse, drift (#66, #67, #68)

- **`diff(before, after)`** returns `{ model, summary, views }`. The model is `after`, marked with what the map already draws:
  - cards: `change` is `added` (a NEW tab), `changed` (CHANGED) or `removed` (REMOVED: faded, dashed, struck through);
  - lines: `style` is `added` (green, flowing) or `removed` (rose, dashed, faded), and a changed line is `edited` (an amber
    dot);
  - what left comes back in its views, boxes and places;
  - a card put into or taken out of a view is marked in that view only (`nodeOverrides`);
  - only what changed is marked: a mark the model carries of its own (a card's, box's or member's `change`, a line's `change`, `edited` or `added` or `removed` style, a `change` in a view's `nodeOverrides`) is dropped where the change leaves that element as it was, and a `planned` mark stays (audit 61).
  - on the diff page a count or a role in an unmarked card's or box's accessible name is the model after's: a port, member, line or card drawn back removed is not counted, a card taken out of the view is not counted where the view's count is of what it shows, and a box taken out counts what it held in its owner, where the model after holds it. A removed card or box says what the model before said (audits 55 and 56).

  Cards and lines match by id, and a line without one by its ends, as a Ref names it. `summary` says what changed in
  words, in model order, for example "adds Payments queue between Trip service and Payment provider" or "renames Accounts
  to Accounts and sign-in". `views` lists the views that show a change. The marks are the model's own fields, so a page or
  a still that the CLI makes shows them with nothing to call.
- **`drift(model, observed, { match })`** returns `{ model, counts, views }`: the map against the traffic seen.
  - `observed` is `[{ from, to, count }]`, or a Jaeger or Tempo dependency list (`[{ parent, child, callCount }]`, or
    `{ data: [...] }`).
  - A service is the card that `match` names, else the card with its id, else the one with its label (case aside).
  - A line that ran but is not drawn comes in rose and dashed, labelled "not drawn" with its calls (`drift: "undrawn"`).
  - A drawn line between two cards that traffic reached, but that carried none, fades: the new line style `faded`
    keeps its kind's colour, faint, with no flow (`drift: "idle"`). Lines to a card no traffic reached are left as they
    are, and counted as not judged.
  - `counts`: `carried`, `undrawn`, `idle`, `unknown`, and `unmatched` services with no card. The counts are of model
    edges, not drawn lines. A line that stands for several edges (A→B and B→A, or parallel edges) fades only when every
    one of them is idle, so a map can show fewer faded lines than `idle` counts.
- **A line that stands for several edges shows the strongest of their marks**, whichever edge comes first. Removed or
  undrawn wins, then added, then changed (the edited dot, which a stronger mark hides). It fades as idle only when all
  of its edges are idle; otherwise it takes the first style that isn't a mark.
- **The time-lapse:** `update()` eases into the next model.
  - Cards that moved glide from where they were, and new cards fade in, then the lines whose route changed.
  - Cards and lines that left fade out where they were, as copies that nothing can click, focus, find or export.
  - It's CSS on the new picture only: the geometry is the update's own, nothing moves under reduced motion, a font that
    loads late moves nothing on purpose, and an export mid-ease draws where things end up.
  - It's on by default. The render option `ease: false` draws the next model at once.
- **The CLI:**
  - `umlimator.py diff BEFORE.json AFTER.json --out PAGE.html [--stills DIR]` writes the marked page, prints the summary
    and the views, and takes stills of those views.
  - `umlimator.py diff --base REF --out DIR [--models PATHSPEC...]` does that for every map model the working tree changed since a git ref. It also writes `summary.md`: the summary per file, with a mermaid sketch of the cards that changed and their neighbours. A removed view marks none of the cards and lines it shared with the model, which stay; its own cards and lines are sketched removed.
  - `umlimator.py drift MODEL.json OBSERVED.json --out PAGE.html [--match MATCH.json] [--stills DIR]`.
  - `umlimator.py timelapse MODEL.json --out PAGE.html [--limit N]` puts every version of the model in git history,
    oldest first, on a slider, saying what changed at each step.

  `diff` and `drift` run the module's own `diff()` and `drift()` in Node, so they need Node 18 or later.
- **A GitHub Action**, `action.yml` (`uses: zintaen/umlimator@v0.12.0`, with `pull-requests: write`). On a pull request it
  runs `diff --base` against the merge commit's first parent.
  - It posts one comment with the summary and the sketch, and updates that comment on later pushes.
  - The pages and stills go up as the run's artifact, which the comment links to.
  - The same text goes in the job summary.
  - The picture in the comment is mermaid, which GitHub draws itself, so nothing needs hosting and no permission beyond
    the comment.
  - A pull request from a fork gets a read-only token: there's no comment, and the job summary still has everything.

  CI runs the Action on its own pull requests as a dry run, without the comment.
- **Examples:** `examples/timelapse.html` shows four made-up releases of the bike share on a slider, with diff's marks
  on request. `examples/drift.html` shows the bike share against a week of made-up traffic.

### Unfolding in place (#71)

A stacked card can open into a box on the map it is on, instead of switching to its inner view.

- **What unfolds:** a card whose inner view is loaded and has cards of its own, ones this view doesn't show already. The
  card becomes a box with its id and name (its badges become the box's tabs), holding those cards; the inner view's other
  cards are this view's, the box's neighbours. The inner view's boxes that hold its own cards come along inside, and a
  card inside an unfolded box can unfold too.
- **Lines:**
  - Inside, the inner view's lines between the box's cards.
  - This view's line to the card moves onto every card inside that the inner view joins to that neighbour, the same way
    round: a neighbour two cards inside reach gets two lines. When the inner view joins it to none, the line ends on the
    box's border.
  - A line drawn both ways stays a pair: it moves inside only when the inner view joins that neighbour to one card both
    ways, else both halves end on the box.
  - Nothing else is added: the inner view's other lines to cards on this view are that view's choice, not this one's.
- **Places:** the box takes the card's place. Later columns move right by its width and the cards under it in its column
  move down by its height, so the cards before it stay put and the rest keep their order; a box of this view that would
  reach into it moves down whole. Inside, the inner view's columns or this view's own reading order, with rows packed,
  upside down or level with the neighbours, each also without the sides the inner view gave its lines for its own
  picture: each is routed and the one the layout check scores best is kept (up to 12 routings; an inner view with boxes
  keeps its own slots, and a view of over 30 cards takes them at once). A process view's steps keep their numbers. A hub
  view has no columns to keep, and is laid out again.
- **What doesn't:** a card on a numbered (sequence) view, since that view's own steps would be numbered again, so that
  card opens (a numbered inner view unfolds, with its run order, since 0.12.1: #82); and an editable map, where an edit
  names the model's own views and boxes.
- **Gestures:** E on a stacked card (focused or selected) unfolds it and puts focus on the first card inside; E on a card
  inside folds it back. Alt + click does the same with the mouse, and the box's ⤡ tab folds it. Double-click and the ⤢
  badge still open the inner view. The standalone page adds an "Unfold here" button to a stacked card's details, and E to
  its keys.
- **For a host:** `handle.expand(id)` and `handle.collapse(id)` (true when the picture changed) and `handle.expanded`, the
  cards unfolded on the view shown. A gesture first emits `expand { target, view, expanded, preventDefault }`; as with
  `open` (#47), a host can load an inner view it doesn't have yet in the handler and call `update()`, and the card
  unfolds. The state is the handle's, per view, kept across `update()` and navigation and never in the model; a model
  that loses the inner view folds the card back. Folded, cards are back where they were.
- **Without a browser:** `layout(model, view, { expand: [ids] })` and `check(model, view, { expand })` lay out and check a
  view with cards unfolded; the geometry's `unfolded` lists the ones that did. `umlimator.py check page.html --expand`
  checks every view again with each card that can unfold, one at a time; CI runs it on the examples.
- **Bench:** `bench/models/u21.json`, a made-up shop, lists unfolded views (`"benchViews": ["shop+orders", …]`), which
  the bench lays out and times, the unfolding apart, and records in `bench/expected.json`; `node --test` lays them out
  the same.
- **Left out of this first version:** an animation (the picture redraws, cards don't glide yet); a link that keeps what is
  unfolded; unfolding in an editable map.

### Stories (#69)

- **`stories` in the model:** walk-throughs, each `{ id, title, steps }`. A step is
  `{ view, caption, select, highlight, tour, camera, duration }`, and only `view` is required.
  - **`select`:** a card id, a line id, or a Ref.
  - **`highlight`:** card ids, line ids or Lits. The lines between two cards it names light too, so a list of cards
    lights the path through them.
  - **`tour`:** card ids, the path the dot rides once the step is shown.
  - **`camera`:** `"fit"` (the default), `{ x, y, zoom }`, or `{ card, zoom }` to frame a card (zoom 1.5 unless given).
  - **`duration`:** the step's time in ms while playing (default 4000). A step's tour runs to its end first.
  - **A step sets the whole picture.** What it leaves out is cleared: no selection, no highlight, the view fitted. So a
    step looks the same whether it's reached from before or after.
  - **`validate()` checks each step.** A view the model doesn't have, or a card, line or tour stop that isn't in the
    step's view, is an error. A camera or duration it can't use is a warning, and the step falls back to the default.
  - **The schema:** `stories`, plus `story` and `storyStep` in `lib/umlimator.schema.json`.
- **`handle.play(id, { step, auto })`** tells a story and returns a player, or `null` when the model has no such story
  with steps.
  - **The player:** `{ story, step, steps, playing, done, next(), prev(), pause(), resume(), stop() }`. `step` is 0-based.
  - **Playing** (`auto`, the default): the next step follows once a step's duration is up and its tour has ended.
  - **Ending:** `next()` past the last step ends the story, and `done` is `true`. `stop()` closes it, and `done` is `false`.
  - **The caption bar** sits at the bottom left of the map, clear of the controls. It shows the title, `n / N` and the
    caption, with ‹ ▶/❚❚ › ✕ buttons. The caption is said in the map's live region.
  - **Keys:** ← → and PageUp / PageDown step through, and Esc closes. Enter and Space on the bar's own buttons press them.
  - **The fit** keeps the cards clear of the bar, as it does of the controls.
  - **The `story` event** `{ story, step, steps }` comes as each step starts, and `step: null` comes when the story ends.
- **In the standalone page:**
  - **The Stories menu** (only when the model has stories) plays one from the start.
  - **Links:** `#story=<id>&step=<n>` (1-based) opens a story at that step, shown but not playing on. The link follows
    the story as it moves.
  - **While a story is shown,** the legend gives way to the caption bar. The step's own selection is a pointer, so it
    opens no details panel; a card the reader picks still opens its panel.
- **Recording in the page:** Export ▸ Record a story… opens a panel.
  - **Steps:** each view and card the reader comes to becomes a step. Add step takes one as the map is now, with the
    camera too once it has been moved by hand.
  - **Captions** are typed in the panel, and a step can be removed.
  - **Save** downloads `<id>.story.json`, with an id taken from the title, ready for the model's `stories`.
- **`umlimator.py record PAGE.html --story ID --out STORY.png`** writes the story as an animated PNG.
  - **Frames:** headless Chrome opens the page at each step's link, drawn at once and with reduced motion, and takes one
    frame per step, shown for the step's duration.
  - **Options:** `--size` (default 1160x740, small enough that the views list stays shut), `--scale` and `--theme`.
  - **Format:** the frames' PNG data goes into APNG's frame chunks as it is, with nothing decoded, so it needs the
    standard library only. GIF and MP4 would need encoders umlimator doesn't ship, so convert the PNG if you need one.
  - **Limit:** with one frame per step, a step's tour doesn't move in the picture.
  - **CI:** the site's build records every example's stories (`stills/<model>/story-<id>.png`).
- **Example:** bike-share's `ride` story: a ride from unlock to payment, in five steps.
- **Tests:** `tests/stories.test.mjs` (Node: `validate()` on stories), and `tests/stories.html` (play, keys, the bar, the
  page's menu, links and recording). `tests/embed.py` runs the page and checks a `record` run's frames.

## 0.12.1: lines that come in straight, chips that fit, overlay labels with room, tours in recordings, and numbered views that unfold

Fixes found while building 0.12.0 (#80 to #85, #97, #98), and unfolding finished for numbered views (#82).

What moves for a host that upgrades:
- **Some lines move.** A line between the tops of two cards on the top row now comes in straight (#80). Six bench views
  move: across the bench there are 16 fewer layout-check issues, and the lines are 0.5% longer in all. One bench line,
  b10/overview's Reports → Inventory, now goes round; #86 takes it up in 0.13.0.
- **A card with chips can be wider**, up to 386 px, so a view with chips may shift (#84).
- **A numbered inner view unfolds in place** (E, or Alt + click) instead of opening (#82).

### A line from a card's top into another's top, on the top row, runs straight (#80)

- **The router kept the dearest way into a line's end.** It looks for a route that comes into the end the way its port
  faces; when there was none, it kept the last way in it found, which is the dearest. A line between the tops of two
  cards on the top row can't come in from above (the router has no track there), so bike-share's "updates docks" ran
  past Fleet store and back. Now the router keeps the cheapest way in, the first it finds: the line goes up, across and
  down (1.17 → 1.03 times its direct route). A line that can come in head-on is routed as before.
- **The CLI's page drew it straight** because its layout search (`optimize`, baked into the page) moved Fleet store a row
  down, where the line could come in from above. `render()` and `layout()` try four layouts at most, and none moved it.
  The search now keeps Fleet store level, as `render()` does.
- **Bench:** the six views with such a line move. Each such line takes its cheapest way in; a line routed after one may
  lose its track and go round (b10/overview's Reports 7 → Inventory 9, 238 → 1,399 px), and b10/norepair keeps another
  of the layouts `render()` tries. Layout-check issues and line length, 0.12.0 → 0.12.1:

  | View | Issues | Line length |
  |---|---|---|
  | b10/overview | 4 → 3 | 4,957 → 5,735 |
  | b10/norepair | 6 → 5 | 6,393 → 5,941 |
  | b26/overview | 94 → 96 | 40,204 → 39,998 |
  | b69/overview | 237 → 231 | 132,668 → 132,307 |
  | d24/boxed | 27 → 30 | 19,093 → 19,626 |
  | m50/overview | 279 → 266 | 136,374 → 138,245 |
  | **All bench views** | **722 → 706** | **445,633 → 447,796 (+0.5%)** |

### A card is wide enough for its chips (#84)

- **A card's width counts its chips** (`verbs`) as it counts its name and its sub-line, up to 386 px. It counted only
  those, so in a wide font (Verdana) a card's chips ran past its text, a long first chip past its right edge, and most
  of them hid behind "+N": assistant's four cards with chips showed one each. Now they show all of them.
- **A chip with no room still ends in "+N", and so does the first one.** The first chip was drawn whole, however wide;
  a verb wider than any card is now "+1", named by its verb.
- **The page's check reports a chip whose pill runs past its card** (`umlimator.py check`). It checked only a chip's
  text.
- Only cards with chips move: of the examples, assistant's four. No bench view has chips.

### A numbered view unfolds in place too (#82)

A stacked card whose inner view is numbered (`render: "sequence"`) unfolds like any other (#71) instead of opening, and
the box keeps that view's run order.

- **Numbers on lines:** each of its lines in the box keeps its step number, those that take the place of this view's
  lines to the card too, and a step back stays a loop back, as the numbered view reads it.
- **Numbers on cards:** a step between the card itself and a card inside has no line, since the card is the box now; and
  a numbered view drawn around one card (its hub) shows the hub's steps on the cards they reach. Those numbers go on the
  card inside, as a hub view draws them (`1`, `2·3`, `4+`).
- **Under a numbered card:** when the card shows a number of its own (a process view's step, or a number an unfolded
  numbered view put on it), the inner steps are numbered under it: weather's Forecast stage is step 4, so its steps are
  4.1 to 4.4. On a card with no number, or with several (`2·3`), they stay 1, 2, 3. A number longer than two characters
  gets a pill on its line instead of the circle.
- **Lanes:** a hub view's boxed lanes come along as boxes inside the box, named and in their order, left to right in the
  hub's columns, with the hub before them when it is a card inside. A labelled line into a lane gets room for both
  borders it crosses.
- **What still opens:** a card on a numbered view, since that view's own steps would be numbered again. No numbered
  inner view is held back for the layout check: as with any unfolding, the box takes the arrangement the check scores
  best.
- **Without a browser:** `layout()` gives a line's number as its `step`, a card's too, and a lane as a box in `families`
  with `lane: true`.
- **Examples and bench:** weather's Forecast stage (its lanes, with the forecaster inside) and assistant's answer now
  unfold, and CI checks them with `--expand`. `bench/models/s16.json`, a made-up print shop, has a numbered view with
  lanes around its own card and one with a loop back (`"benchViews": ["site+job", "site+pay", "site+job+pay"]`), which
  `tests/unfold.test.mjs` checks too.

### A second unfolded card no longer draws the first one again (#98)

Unfolding a card whose inner view lists a card that is already unfolded on the view drew that card a second time: as a
card inside the new box, and as its own box (u21's `shop`: Order service, then Warehouse service).

- **The fix:** a card unfolded on this view is still this view's, drawn as its box. So it is the new box's neighbour, not
  one of its cards, and a card counts as unfoldable only for cards of its own that this view shows neither as cards nor as
  boxes.
- **Tests:** `tests/unfold.test.mjs` unfolds the two cards in both orders. `tests/unfold.html` also folds them back,
  first-unfolded first and last-unfolded first, and checks that every card is drawn once, as a card or as its box, on the
  map, in the minimap and in the SVG export.

### Overlay labels keep off their neighbours (#81)

- **A line's `label` pill takes the first place where it covers no card, box title or tab, line label or other pill:**
  under the line's own label as before (on its longest run when it has none), else half way along the line, then at
  30 %, 70 %, 15 % or 85 % of its length. An overlay still never lays the view out again.
- **With no room at any,** the pill isn't drawn over anything. Its text goes in the line's tooltip, on a line of its own,
  and at the end of its accessible name ("Line from Trip API to Trip lifecycle: moves the ride on, p95 1.2 s over
  budget"), until the layer goes. `replay()`'s duration labels are such pills too.
- **Test:** `tests/marks.html` puts a long pill on every line of bike-share's trips view: none covers a card, a line label
  or another pill, each one with no room is in its line's tooltip and name, and removing the layer takes it out again.
  On a line that goes around a box's title, with its label just above the title, the pill doesn't cover the title.

### A recorded story's tours move (#83)

- **`umlimator.py record`** takes frames along a step's tour, 2 a leg and at most 6, from its first card to its last,
  and shares the step's duration out between them, so the step still lasts its duration. A step without a tour keeps one
  frame. bike-share's `ride` is now 15 frames and 1.2 MB (5 frames and 0.4 MB before).
- **How:** the frames are the page's `#shot=1&story=<id>&step=<n>&at=<0 to 1>` link, which holds the tour's dot that far
  along its ride.
- **Limit:** the ride is spread over the whole step, so the dot doesn't keep the live map's speed.
- **Test:** `tests/embed.py`'s `record` check wants 2 to 6 frames for a step with a tour, each a different picture, with
  delays that add up to the step's duration, and one frame for any other step.

### The legend check waits for the legend (#85)

- **`tests/embed.py` reads a page again until it has what the check reads,** for up to 60 s. Chrome reads the page once
  its virtual time is up, and on a busy machine that could be before the standalone page, which draws on an animation
  frame, had drawn its legend. Every page the harness reads goes through the same wait: the test pages, the host pages
  and bookshop's legend. The test pages' own retry, once more when Chrome gave back nothing, is gone: the wait covers it.

### The details panel keeps a short sentence whole (#97)

- **The standalone page's details panel** cut every `when`, `what` and `how` text into at least two bullets, so
  bike-share's Trip service, `"when": "Unlock, pause, end."`, showed "Unlock" and "pause, end.". Now a text is cut where
  it has more than one sentence or clause (at `;`, ` · ` or ` | `), and a point longer than a line (160 characters) is cut
  in two, as before. A short sentence stays one bullet. In the examples and bench models, 203 of 408 texts were short
  sentences cut this way.
- **Test:** `tests/unfold-page.html` opens Trip service's details: its `when` is one bullet, and a `how` of one
  190-character sentence is cut into bullets of at most 160.

## 0.13.0: import, an MCP server, an element, PDF, lenses, critical paths, traces as views, embedded panels, and layout

Everything since 0.12.1 (#86, #90 to #96, #99, #105, #112, #113):
- **Maps in and out:** `umlimator.py import` reads Structurizr, C4-PlantUML, Mermaid, Compose and Kubernetes (#90).
  `umlimator.py mcp` lets an AI assistant read a map and drive its page (#91). `<umlimator-map>` and fenced blocks
  embed a map in docs sites with no code (#92). `umlimator.py pdf` hands in every view as one document (#93).
- **More to see on a map:** lenses by team, data flow or anything a selector picks (#94); the slowest or costliest path,
  and what a card's failure cuts off (#95); a trace kept as a numbered view (#96).
- **The page's panels in `render()`:** the views navigator, the details panel, the legend and the hints, each opt-in
  (#99). They and the page now pass axe (#112).
- **Layout for generated maps:** lines into a box no longer converge on one entry, and a box orders its cards by the
  lines from outside. Across the bench, 32 fewer layout issues and 2.6% shorter lines (#86).
- **Fixes:** renders of one model can run at once (#105); the legend check waits for the drawn legend (#113).

What moves for a host that upgrades:
- **Some layouts move** (#86): boxed and generated views most. A layout pinned in the model (`layout`) doesn't move.
- **The details panel's tab list** holds only its tabs, its ‹ › buttons sit beside it, and a few colours are darker or
  lighter to meet WCAG AA (#112). Two theme variables are new, `--um-mark` and `--um-scrim`, with the old values.
- **A CLI page** records the model's own path as its `source` (#105), and keeps its map's handle on
  `window.umlimatorMap` (#91).

Nothing is removed. Every option, field and command is additive: `render()` without the new options draws what it drew.

### Import (#90)

`umlimator.py import FILE --out MODEL.json [--format structurizr|plantuml|mermaid|compose|kubernetes]` turns a diagram a
team already has into a model, ready for `render`. The readers are their own file, `umlimator_import.py` (standard library
only), which the command calls.

- **The format** comes from the content: a `workspace`, `@startuml`, a Mermaid header, compose's `services`, or a
  Kubernetes `kind` or `items`. Then from the extension (`.dsl`, `.puml`, `.mmd`, `.mermaid` and the like). `--format`
  decides when it's given.
- **What it reads**, a practical subset of each:
  - **Structurizr DSL:** `workspace`, `model` and `views`; `person`, `softwareSystem`, `container` and `component`,
    nested, with their description, technology and tags; `->` relationships (`this ->`, and `->` inside an element, too)
    with description and technology; `group` (and the older `enterprise`) blocks, nested; flat and hierarchical
    identifiers. Views: `systemLandscape`, `systemContext`, `container` and `component`, with `include *` (or element
    ids), `exclude`, `title` and `description`.
  - **C4-PlantUML:** `Person`, `System`, `Container` and `Component`, each with `Db`, `Queue` and `_Ext`; `Rel` and
    `Rel_*` (their direction hints are left to the layout), `Rel_Back` (the other way) and `BiRel` (both ways);
    `Boundary`, `Enterprise_Boundary`, `System_Boundary` and `Container_Boundary` as boxes, nested; `title`. Arguments
    may be named (`$tags=…`). Layout and style macros (`Lay_*`, `LAYOUT_*`, `SHOW_*`, `HIDE_*`, `Update*`, `Add*Tag`),
    `skinparam` and the C4 library's `!include` are skipped quietly.
  - **Mermaid:** `flowchart` and `graph`: nodes with their labels and shapes, links with labels (`-->|x|`, `-- x -->`), chains and `a & b`, and `subgraph` as boxes, nested. As in Mermaid, a node belongs to the first subgraph that names it, and a link to a subgraph's id ends on its box. A dotted link is an async line, a thick one a heavier line. A map line always has one arrowhead, so a link with no arrowhead (`---`), a circle end (`--o`) or a cross end (`--x`) is read as a line and reported, and `o--o` and `x--x` are two lines, as `<-->` is. As in Mermaid, a link is two only when its start matches its end: a start that does not (`x-->`, `<--o`, `o--x`, `<--x`) is not drawn, and the link is one line, reported. The front matter's `title` is the map's. `C4Context`, `C4Container` and `C4Component` read as C4-PlantUML does.
  - **docker compose:** the JSON from `docker compose config --format json`. Each service is a card (its image, or the
    folder it builds), `depends_on` and `links` are lines (with no label, as every line is one; the panel says which),
    and the networks are boxes when there are several. A service on several networks stays between their boxes.
  - **Kubernetes:** the JSON from `kubectl get … -o json`, a List or one object. Deployments, StatefulSets, DaemonSets,
    Services and Ingresses are cards.
    - A Service leads to the workloads its selector picks, and its ports are on its card.
    - An Ingress leads to its Services, each line labelled with its path.
    - A workload leads to a Service that one of its env values names (`http://api:8080`, `postgres.data`,
      `api.shop.svc.cluster.local`), labelled with the variable.
    - Namespaces are boxes when there are several. Pods and ReplicaSets that a workload owns are drawn as that workload.

  YAML is read through the tools' own JSON, so no YAML parser is needed.
- **Cards** take the model's kinds. A source's own type comes first; words in a name, technology, tags or image come next
  (`GUESS` in `umlimator_import.py`, a heuristic):

  | In the source | Card kind |
  |---|---|
  | A person (`person`, `Person`) | `person`, with a person icon; `user` for `Person_Ext` or (Structurizr) an `External` tag |
  | A software system (`softwareSystem`, `System`) | `backend` (Structurizr: from its words, as a container, but drawn a box); `external` for `_Ext` or an `External` tag |
  | A database: a `Db` macro, a `Database` tag, a cylinder `[(…)]`, an image such as `postgres` | `database` |
  | A queue: a `Queue` macro, a `Queue` tag, an image such as `rabbitmq` or `kafka` | `queue` |
  | A container, component, node, service or workload | from its words: a store or cache is `database`, a broker `queue`, sign-in `security`, an LLM `ai`, a proxy or monitoring `cloud`, an app or UI `frontend`, a document `file`; `backend` otherwise (a StatefulSet: `database`) |
  | A Kubernetes Service or Ingress | `cloud`; a Service of type `ExternalName` is `external` |

- **Text:** a name is the card's label, its technology (or else its C4 type) the line under it, and its description the
  details panel. A relationship's description is the line's label, its technology the second line. A label longer than
  the map keeps (34 characters on a card, 28 on a line) is cut at a word, and the panel has it whole.
- **Views:**
  - **Structurizr:** its own views. A container view boxes its system's containers, and a component view its container's
    components. A group is a box in each view that shows one of its members, nested as the source nests it: inside the
    group around it, or inside the view's own box when it is in the view's system or container (whose box is in turn in
    that element's group). A relationship between elements a view doesn't show lifts to the nearest ones it does, an implied line as
    Structurizr draws it, unless a relationship joins those two already (`!impliedRelationships false`, `none` or
    `DefaultImpliedRelationshipsStrategy` turns this off; `CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy`
    draws one per description unless a relationship with that description joins them; a strategy it doesn't know is
    listed in `notImported`).
    A system's card opens its container view, a container's card its component view, and each view's parent is the most
    detailed view above it that shows its subject. A workspace with no views gets a landscape, a container view per system
    and a component view per container.
  - **Every other source is one view**, named by its C4 level (`context`, `containers`, `components`), or `flowchart`,
    `services` or `cluster`. Its boundaries, subgraphs, networks or namespaces are boxes.
  - **A line to a person** is the view's loop back (`loop: true`), so people stay first, as C4 draws them.
- **Ids** are the source's own:
  - identifiers and aliases as they are;
  - compose's service names;
  - for Kubernetes, `deploy-`, `sts-`, `ds-`, `svc-` or `ing-` and the name;
  - for a line, `from-to`.

  An id that is taken already gets a number, or, for a Kubernetes object, its namespace.
- **Nothing is dropped silently.** What isn't imported is listed on stderr, one line each: `FILE:LINE: …`, or
  `FILE:PATH: …` in JSON (`items[8]`, `volumes`). The command prints what it wrote, `{ out, format, cards, lines, views,
  unread }`, and exits 1 when a file has nothing to import.
- **Left out of this first version:**
  - Structurizr's deployment, dynamic and filtered views, `!include`, `!ref`, `!extend`, constants, themes, and styles but their `shape` (0.15.0);
  - C4 deployment nodes and dynamic diagrams (`RelIndex`);
  - Mermaid's `@{ … }` shapes and its other diagram types;
  - compose's volumes, configs and secrets, and Kubernetes' other kinds (ConfigMaps, Jobs, CronJobs…);
  - layout hints (`autolayout`, `Rel_U`, `Lay_R`), since the map lays out each view itself.

  An imported map gets the layout check as any model does. A large diagram may need a `layout`, or a line's
  `fromSide` and `toSide`, set by hand.
- **Example:** `examples/clinic.json` is what `import` writes from `examples/clinic.dsl`, a made-up clinic's workspace
  with a group, unchanged. It is in the gallery, and CI checks it as every example (`check --expand`), imports its source
  again and fails if the model differs.
- **Tests:** `tests/import.py` imports the sample of each format (in `tests/import/`, and `examples/clinic.dsl` for
  Structurizr), checks the cards, boxes, lines, views and the list of what isn't imported, and that `validate()` finds
  nothing, the model renders, and its layout check is clean. CI runs it.

### \<umlimator-map> and docs blocks (#92)

- **`<umlimator-map>`**, as `umlimator/element` (`lib/umlimator-element.js`): a map in a page from HTML alone. The
  module defines the element once and exports its class, `UmlimatorMap`. It imports in Node too, where it defines
  nothing, so a docs site's server render can import it.
  - **The model**: `src`, a URL fetched as an `<img>`'s would be (a `data:` URL too), and kept while `src` stays the
    same; or, without `src`, the JSON in a child `<script type="application/json">`.
  - **Drawing**: `render()`, into the element's own shadow root.
  - **Attributes**: `view` (the first view), `minimap` (present and not `"false"`), `controls` (`"false"` hides them),
    `height` and `theme`.
    - Changing `src`, `view`, `minimap` or `controls` draws the map again; attributes set together draw once.
    - `height` is CSS and draws nothing again: a number is pixels, any other value a length. Without it the element is
      480 px tall, which the page's CSS may change.
    - `theme` is CSS too: `light` or `dark` gives that element `lib/umlimator-theme.css`'s palette, whatever the page's.
      The stylesheet's light and dark blocks also select `umlimator-map[theme="light"]` and `[theme="dark"]` now.
      Without the stylesheet, a host's own `--um-*` variables work as before.
    - Without `theme`, the map follows the page, and a docs site's dark mode too: the dark block also selects an
      element with no `theme` under VitePress's `html.dark` or Docusaurus's `html[data-theme="dark"]`. That selector
      weighs nothing (`:where()`), so a host's own `--um-*` set on the element still win, and a `theme` wins over it.
    - Taking the element out of the page destroys the map, and putting it back draws it again.
  - **Children**: the element's other children (a still, a sentence) show until the map is drawn, and again when it
    can't be. A slotted `<img>` fits the element's box. Where scripts don't run, the element is an unknown tag, and its
    children show as they are.
  - **Events**: the map's `select`, `open` and `viewchange` come as `umlimator:select`, `umlimator:open` and
    `umlimator:viewchange` on the element, bubbling, with the map's event as `detail`.
    - `umlimator:open` is cancelable: `preventDefault()` keeps the view, as the map's own `open` does.
    - `load` comes each time the map is drawn. `error` comes when the model can't be fetched, parsed or drawn, with a
      console warning that says why.
  - **`el.map`** is the `render()` handle once drawn (`toSVG()`, `highlight()`, `setView()` and the rest), else `null`.
  - **Fetching**: the element fetches its model and nothing else. The module itself still fetches nothing.
  - **Types**: `lib/umlimator-element.d.ts`, with the element in `HTMLElementTagNameMap` and its events in
    `HTMLElementEventMap`.
- **Docs-site blocks**: a fenced `umlimator` block becomes the element.
  - **What a block holds**: `key: value` lines, the element's attributes (`src`, `view`, `minimap`, `controls`,
    `theme`, `height`). After them, in place of `src`, it may hold a model in JSON.
  - **An inline model** goes into `src`, minified, as a `data:` URL. A `<script>` child would not survive: VitePress
    compiles each page as a Vue template, which drops it.
  - **A block the element can't use fails the build**: an unknown key, a broken model, neither `src` nor a model, or
    both.
  - **`umlimator/markdown-it`** (VitePress, or any markdown-it): `md.use(umlimator)` wraps the `fence` rule, and other
    fences go to the rule it had.
  - **`umlimator/remark`** (Docusaurus, MDX, or remark-rehype): `remarkPlugins: [umlimator]`. It walks the tree by hand
    and replaces the block with a node that names the element (`data.hName`, `data.hProperties`). MDX and remark-rehype
    both turn that into the element.
  - **MkDocs, or any site that allows HTML**: write the element itself, with the module's files copied into the docs.
    The README has each setup.
  - Each plugin is a few lines with no dependencies, and has a `.d.ts`.
- **Example:** `examples/element.html`: a map from `src` with its still, controls that set its attributes, its events as
  they come, and a model in the page.
- **Tests:** `tests/element.html` (in the browser: both kinds of model, the children before and after, each attribute,
  VitePress's and Docusaurus's dark modes, events, drawing again, errors, removal, and a block's HTML drawn) and
  `tests/docs.test.mjs` (in Node: each plugin's element for a block, at any depth; failing blocks; the package's
  exports; the element module in Node).
- **Left out:** following a change to the `<script>` child; writing the view shown back into `view`; the map's other
  events (`click`, `change`, `expand` and `story` are on `el.map.on()`); a still in a block (write the element for one).
  Icons come from the model's own `icons` table, as with `render()`. VitePress marks only its dark mode, so a VitePress
  page set to light on a system set to dark shows the system's dark.

### PDF (#93)

- **`umlimator.py pdf PAGE.html --out MAP.pdf [--views a,b,pic-*] [--theme light|dark]`** writes the map as one PDF.
  - **How**: headless Chrome prints it itself (`--print-to-pdf`, its `Page.printToPDF`), through the CLI's Chrome
    driver, so there is no new dependency. It reports `{ out, pages, bytes }`.
  - **A title page**: the model's title and the date.
  - **Each view**, on a page of its own: the views `--views` names (a trailing `*` is a prefix), else every view with
    cards, in the model's order.
    - **The picture** is the one `toSVG()` draws, in vectors. Its text stays text, so a reader's search finds a card.
    - **Its size**: as large as the view's `describe()` text below it leaves room for, and never larger than the view
      itself. The text is in two columns.
  - **The legend** of what those pictures draw (card kinds, stacked cards, steps, authors and line kinds), worded as the
    page's legend words it.
  - **The rules**: each of the model's rules, "holds" or "broken", with each break's message. A rule is judged in the
    views printed only (with `--views`, a rule broken in a view left out holds here), and the document says so above the
    list.
  - **The page**: a reader copy (no check marks, drill-down pill or tour dot), A4 landscape with 12 mm margins. It has
    none of Chrome's header and footer, which would print the page's file path. `--theme dark` darkens whole pages.
- **In the page**: `#pdf=1[&views=…]` lays the page out as that document, once the fonts are in, and Chrome prints it.
  The page's legend and the PDF's share one helper.
  - A page rendered before 0.13.0 has no `#pdf` and prints as one screen. `pdf` says so and exits 1, as it does when no
    view with cards matches `--views`.
- **CI**: `tests/cli.py` writes bike-share's PDF and reads it back with the standard library.
  - It checks the page count: a title page, a page per view, and one for the legend and rules.
  - It checks the text: the title, the view titles, a card, a `describe()` line and each rule's state. Chrome writes
    glyph ids, so the text is read through each font's ToUnicode map.
  - It checks `--views` and `--theme`, and a rule broken in one view: broken in the whole PDF, holding in one without
    that view.
  - The site's build writes each example's PDF next to its page, and the gallery links to it.
- **Left out:** bookmarks for the views (Chrome's `--generate-pdf-document-outline` would add them), a paper size or
  orientation option, and the details panel's text for each card.

### Lenses (#94)

- **`lenses` in the model** are saved ways to look at one map:
  ```json
  "lenses": [
    { "id": "teams", "title": "By team", "color": "owner" },
    { "id": "data", "title": "Data flow", "pick": { "line": ["feeds", "state"] } }
  ]
  ```
  - **`pick`** is a rule's selector (`id`, `kind`, `container`, `not`), with `owner`, and `line` at its top:
    - without `line`, the lens lights the cards it picks and the lines between two of them;
    - with `line` (line kinds, a line's own `kind`, default `calls`), it lights the lines of those kinds between two cards
      the rest of it picks, and the cards at their ends.

    Left out, it lights everything. The rest dims.
  - **`owner`** on a card names who owns it (a team, say). Selectors pick by it, rules' as well as lenses'; a box has no
    owner.
  - **`color: "owner"`** rings each lit card in its owner's tone, the same on every view: owners in name order take cyan,
    violet, green, amber, fuchsia, orange, rose and slate, then again from cyan. A legend over the controls names the
    view's owners, and the fit keeps the cards clear of it, as of the controls.
- **On the map,** a lens is the `lens` layer of `overlay()`, so it never lays the view out again.
  - It stays on across `update()` and `setView()`, lighting each view as its pick picks there; a model without it takes it
    off.
  - `toSVG()` and `toPNG()` draw its rings and dimming, on any view, but not its legend.
  - A lens that lights everything dims nothing, so a selection keeps its own dimming.
- **For a host:** `handle.lens(id | null)`, false when the model has no such lens.
- **In the standalone page:** a Lenses menu when the model has lenses, with No lens; its button names the lens that is on.
  `#lens=<id>` in the link opens the page with it, and follows it as it changes, back and forward included.
- **`validate()`** errors on a lens without an id, with one used twice, or with a pick that isn't an object. It warns on a
  line kind it doesn't know, an owner no card has, a `color` other than `owner`, and an owner that isn't a name. The
  schema has `lens` and `lensSelector`, and `owner` on cards and in `selector`.
- **Example:** bike-share has owners (Apps, Rides, Fleet, Platform) and the two lenses above.
- **Left out:** tones chosen per owner (a host rings cards itself with `overlay()`); lenses that hold on some views only;
  the legend in exported files.
- **Tests:** `tests/insight.test.mjs` (`validate()` on lenses and owners), and `tests/insight.html` (the handle, the legend,
  exports, the page's menu and link).

### Critical path and what-if (#95)

- **Budgets on lines:** `latency` (ms) and `cost` (any unit). They aren't drawn. `validate()` warns on one that isn't a
  number of 0 or more, which counts as 0.
- **`critical(model, viewId, { from, to, by })`** returns `{ refs, total }`:
  - the path along the view's lines with the highest total of `by`, `latency` (the default) or `cost`;
  - from `from` to `to`, either left out for any card;
  - a line without the budget counts 0, and a path never comes back to a card, so a loop is walked at most once;
  - `refs`: its cards in order, then its lines, for `highlight()`; with no path, `{ refs: [], total: 0 }`.

  It's pure and runs in Node. It walks every path depth first, which is exponential on a dense view with many ways
  between two cards; a `ponytail:` note marks it.
- **`whatIf(model, viewId, { remove: [ids] })`** returns `{ unreachable }`, and leaves the model as it is: what loses its
  way to the cards, backward as `reach()` finds it (for calls, what depends on them), each with its distance in lines from
  the nearest; the cards themselves come first, at 0. It lists no broken rules, because rules only forbid lines and
  cycles, and taking cards out never adds either.
- **In the standalone page,** the details panel adds:
  - ⏱ and ¤ where the view's lines have latency or cost: the slowest or the costliest path from the card, or between the
    two cards selected (either way round), lit, with its total in the hint line and as a tab on its last card;
  - ⊘, "What if this goes down?": what loses its way to the card lit, fading with distance, the card ringed rose with a
    DOWN tab, and the hint line says how many cards. The model isn't touched.

  A new selection or view clears them, and so does the same button again.
- **Example:** bike-share's Trip service has latency on each line and cost on four.
- **Left out:** budgets drawn on the map; a whole view's critical path in the page (the function gives it); keys for the
  new buttons.
- **Tests:** `tests/insight.test.mjs` (both functions, cycles, parallel lines, two cards taken out), and
  `tests/insight.html` (the panel's buttons, the totals, two cards, what-if).

### Sequence views from traces (#96)

- **`sequenceFromTrace(model, spans, { view, match, title })`** returns the model with a numbered view (`render:
  "sequence"`, `lanes: false`) made from a trace's spans, as `otlpSpans()` reads them:
  - each call from one card to another (a span and its parent's) is a step, in time order; calls that start together
    keep the trace's order;
  - its line is labelled with the span's name, and its duration goes under it ("200 ms", "1.5 s");
  - a span's service is a card as `replay()` matches it: through `match`, else by id, else by label in any case (the two
    now share one helper). A span with no card, one whose caller has none, and work inside one card make no step. The
    view's caption says how many calls it has and names the services with no card.
  - The view's id is `view` (default `trace`) and its title `title` (default its id). It takes the place of a view with
    that id, else comes last, under the view that shows the most of its cards. The model passed in isn't changed.
- **`umlimator.py trace MODEL.json TRACE.json --view ID --out OUT.json [--match MATCH.json] [--title T]`** reads OTLP JSON
  with `otlpSpans()` and runs `sequenceFromTrace()`, both in Node as `diff` does. `--out` may be the model itself. It
  prints the view's steps, cards and caption, and fails when no call runs between two cards.
- **Example:** replay.html's trace is now a file, `examples/traces/ride-end.json`, with `traces/match.json`; the site copies
  them. Kept as bike-share's `ride-end` view, a ride's end in 8 numbered calls, it's checked like every other example
  view (in the browser with `--expand`, and by `layout.mjs`).
- **Left out:** a call through a service with no card is not joined to the nearest caller that has one; every step is
  drawn as a call, whatever the model's own line between the two cards says; spans' attributes and status.
- **Tests:** `tests/insight.test.mjs` (the example's view, matching, order, steps left out), `tests/cli.py` (`trace` writes
  the view the example keeps), and `tests/insight.html` (the view drawn in the page).

### Parallel renders of one model (#105)

- **Two renders of one model at the same time no longer fail.** `umlimator.py render` writes a temporary copy of the
  model next to it, so its relative paths resolve. Every render used the same name, `.<model>.icons.json`, so two at
  once could delete each other's copy: four at once failed three times out of four. With `umlimator.py mcp` (#91)
  serving a model, a `render` of that model could make the page fail once. Now each render's copy has a name of its
  own, as does the copy behind a `diff` or `drift` page.
- **A page records the model itself as its source**, `examples/bookshop.json` rather than the copy's
  `.bookshop.icons.json`, in the form the page always used: the path in the checkout, `~/…` under home, else the
  file's name. A model that names its own `source` keeps it.
- **Test:** `tests/cli.py` runs four renders of bike-share at once. All finish, no copy is left behind, and the four
  pages are the same apart from the time.

### MCP server (#91)

`umlimator.py mcp MODEL.json [--port N]` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over
stdio, so an AI assistant can read a map and drive its page. In Claude Code:
`claude mcp add umlimator -- python3 /path/to/umlimator.py mcp /path/to/model.json`.

- **The protocol:** JSON-RPC 2.0, one message per line on stdin and stdout; logs go to stderr.
  - **2026-07-28**, the current specification, has no handshake: `server/discover` lists the versions the server speaks,
    and each request names its own in `_meta`. A version it doesn't speak gets `-32022` with the ones it does. Each
    result carries `resultType: "complete"` and the server's name in `_meta`.
  - **The handshake of the versions before it** (2025-11-25 back to 2024-11-05), which a client sends that predates
    2026-07-28 or falls back to it: `initialize` answers with the client's version when it is one of them, else
    2025-11-25; then `notifications/initialized`, and `ping`. Claude Code asks `server/discover` first and falls back.
  - **Errors:** an unknown method gets `-32601`, an unknown tool `-32602`, a line that isn't JSON `-32700`. A call that
    names what the model lacks (a view, a card, a story) is a tool error (`isError`) that lists what the model has, so
    the assistant can fix its call.
- **Read tools** run the module's own functions in Node, as `diff` and `drift` do, on the model file read again at each
  call, so edits show up:
  - `list_views()`: the views (id, title, parent, number of cards) and the stories (id, title, number of steps);
  - `describe_view(view)`: `describe()`, then each card's id with its name, for the tools that take ids;
  - `paths(view, from, to)` and `reach(view, card, backward?, depth?)`: `paths()` and `reach()`, as Refs;
  - `broken_rules()` and `validate()`: `rules()` and `validate()`;
  - `diff(other_model_path)`: `diff()`'s summary and views, from the other file to this one.
- **Page tools** drive the model's page at `http://127.0.0.1:7391` (`--port`; when it is taken, a free port, which the
  tools and the server's instructions name):
  - `show_view(view)`, `highlight(refs, view?)` (card or line ids, or Refs), `tour(cards, view?)`, `play_story(id)` and
    `clear()` each push a command to every page connected to `/events`, over Server-Sent Events.
  - Each answers how many pages it reached or, with none, the URL to open. A page that connects later gets the latest
    command first, so it shows what the assistant last showed.
  - The page is the CLI's own (`umlimator.py render`), rendered again when the model has changed, with a script added
    only when served that plays each command on the page's map handle, `window.umlimatorMap`, with `setView()`,
    `highlight()`, `tour()` and `play()`. A command made from a newer model reloads the page first.
  - A highlight clears when the view changes, since on another view it would dim every card. A new command ends a story
    the server started.
- **Safety:** the server listens on 127.0.0.1 only. A request whose `Host` isn't `127.0.0.1` or `localhost` gets 403, so
  a site that points its own name at 127.0.0.1 (DNS rebinding) reads nothing. Nothing is fetched: the server sets
  `UMLIMATOR_OFFLINE`, under which the CLI's fetches fail, so a logo not in the cache keeps its sigil (and the renderer's
  avatars their initials).
- **The standalone page's handle:** every page `umlimator.py render` writes now keeps its map's handle (what `mountPage()`
  returns) on `window.umlimatorMap`, for scripts and tests; the served page's script is one such script.
- **Inside:** `umlimator_mcp.py`, next to `umlimator.py`, standard library only.
- **Tests:** `tests/cli.py` drives the server through pipes, as a client does: `initialize`, `server/discover`,
  `tools/list`, `ping`, the standard errors, a call of each read tool on the bike share, and a tool error. Then it
  connects to `/events` as a page does: the command it missed comes first, and a `highlight` arrives with its ids as
  Refs. It also fetches the served page, and is refused for another host name. `tests/page-handle.html`, which
  `tests/embed.py` runs, checks that a CLI page (`examples/bookshop.html`) keeps `window.umlimatorMap`, and that
  `setView()` on it moves the page, its title and its link.
- **Left out:** resources, prompts and `subscriptions/listen` (the tools never change); a way back from the page, so what
  the reader selects doesn't reach the assistant; acting on `notifications/cancelled` (a call takes a second or less);
  the Streamable HTTP transport. A server serves one model: add one per model.

### Layout for generated maps (#86)

A map generated from code puts its cards in a box per folder, and most of its lines come into a box from outside it.
Auto-layout saw each box as one piece: the lines into a box all met it at one point, and a box placed its cards by the
lines inside it alone. It now sees each line where it meets its card. No API changes; layouts move (below).

- **Lines into a box meet it at their own cards.** The column ordering (#53) counts the crossings between neighbouring
  columns, and a box was one item there: every line into it met it at one point, so two lines that crossed on the way in
  to its cards counted as none. A box now counts as tall as its rows, and each line meets it at the row of its card
  inside, as the levelling of 0.11.0 already did.
- **A box places its cards by the lines from outside it too.** A box ordered and levelled its cards by the lines inside
  it alone: cards fed only from outside stacked at its top, and the box was levelled as a whole, so its lines bent, and
  the lines past it ran into the cards beside it. A view with boxes is now laid out three times: by the lines inside each
  box, as before; then with each card in a box level with the cards its lines come from and go to outside it too, where
  the first pass put them; then with each box's columns ordered by those lines as well, where the second put them. A
  box's far ends count as cards at their rows, in a column before its first (a line from the left) or after its last.
  In the made-up monorepo of r15, packages/ui/ and packages/server/ no longer stack together, level with apps/ and
  services/ that feed them, and the lines into packages/shared/ run between them: 9 crossings, now none.
- **A line keeps off a box's border.** A box levelled half a row from a card puts its border within 8 px of that card's
  ports, and the router keeps a port's track, and an earlier line's, however near a border: lines ran along borders (the
  layout check's "runs along the border"). A run along a border now costs ten times its length.
- **Ports for far ends level with each other (the detour 0.12.1 left in b10/overview).** Reports 7 and Billing 1 sit
  level, above Inventory 9, whose left side took them by row, then the farther first: Billing's line, which passes under
  Reports, took the higher port, and Reports' line had no way in that did not cross it (238 → 1,399 px in 0.12.1, once a
  line routed before it took its cheapest way in, #80). Level far ends now take a left or right side's ports by the angle
  they come in at, as a top or bottom side's do (#49): of two above the card, the nearer takes the higher port. Reports'
  line is 202 px, and #80's lines stay straight.
- **Port repair counts a detour (u21's Catalog).** Port repair swaps two lines' ports when the layout check then finds
  fewer issues, but it counted crossings, shared runs and labels on lines, not detours. With u21's Catalog unfolded on
  its shop view, a swap took Web shop's two lines round the map (1,226 and 2,007 px) to save one crossing, and was kept.
  A detour now counts. That crossing stays, with a label too near its line's end: Order service → Card payments leaves
  its card's top, past which the line from Web shop runs.
- **Room for labels in nested boxes.** 0.12.1 gave a labelled line into a lane 12 px more for its label, since it
  crosses two borders. Any box in a box gets them now: a line to a card in one, or to the box that holds one.
- **The CLI's layout search keeps `render()`'s layout unless its own routes better.** The search scores its candidates
  without port repair, and baked into the monorepo's page a layout with a crossing that `render()`'s has not. It now
  routes the layout it found and the one it started from as the page draws them, and keeps the better.
- **What it leaves out:** a box's far ends are where the pass before put them, so a box whose neighbours move in the last
  pass doesn't follow them. Lines from many cards into one card still cross on the way in: r19's logger has seven, and
  most of r19's crossings are by one of them. The monorepo is not an example: with r15's imports its page checks clean
  under the default font, Arial and Courier New, but its line from web to kit, past charts on the same row, crosses
  twice under Verdana and once under Georgia.
- **Bench:** r15 is new: r19's monorepo with fewer imports (15 packages, 16 imports, near a tree), boxed by folder and
  plain. The views that move: the plain ones with level far ends on a side (b10, b69, m50, r15/plain, r19/plain and
  bookshop/overview; b69's also by port repair's detours), those with boxes (b26/overview, r15/boxed, r19/boxed), and
  u21's unfolded views whose box holds a box (room for labels). Layout-check issues and total line length, 0.12.1 →
  0.13.0 (r15 laid out by 0.12.1 for the first):

  | View | Issues | Line length |
  |---|---|---|
  | b10/overview | 3 → 2 | 5,735 → 4,547 |
  | b10/norepair | 5 → 3 | 5,941 → 4,563 |
  | b26/overview | 94 → 91 | 39,998 → 40,577 |
  | b69/overview | 224 → 221 | 132,307 → 130,785 |
  | b69/back | 13 → 12 | 10,348 → 12,022 |
  | m50/overview | 265 → 261 | 138,245 → 131,852 |
  | r15/boxed (new) | 11 → 0 | 11,005 → 9,017 |
  | r15/plain (new) | 5 → 3 | 6,366 → 6,202 |
  | r19/boxed | 24 → 21 | 26,707 → 24,244 |
  | r19/plain | 28 → 26 | 14,792 → 14,716 |
  | u21/shop+orders | 1 → 1 | 6,608 → 6,668 |
  | u21/shop+orders+o-checkout | 1 → 1 | 7,035 → 7,095 |
  | u21/teams+orders | 0 → 0 | 5,174 → 5,246 |
  | bookshop/overview | 0 → 0 | 4,828 → 4,983 |
  | **All bench views** | **707 → 675** | **482,671 → 470,099 (−2.6%)** |

  Placing a view's boxes three times costs under a millisecond; routing takes the rest, and moves with the layout. In the
  browser, as `bench.py` times a view (the median of 3 runs; 0.12.1's module and this one in turn, twice, on one busy
  machine): b26 638 → 598 ms, m50 2,460 → 2,183 ms, b69/overview 3,470 → 3,379 ms, r19/boxed 218 → 186 ms, r15/boxed
  84 → 32 ms. CI's limits (m50 8 s, b26 3 s) hold.
- **Tests:** `tests/layout.test.mjs`: two boxes whose cards sit level with the cards outside them that feed them, r15's
  boxed view with a clean check, b10's Reports 7 → Inventory 9 straight, and a nested box's room for a label;
  `tests/unfold.test.mjs`: u21's Catalog unfolds with no detour.

### Page panels in render() (#99)

`render()` can draw the standalone page's pieces around its canvas, so a host that embeds the map no longer rebuilds
them from events. Each one is an option, on its own or with any of the others. They are all off by default, and a host
that passes none of them gets the same map, markup and all.

```js
render(el, model, { nav: true, details: true, legend: true, hints: true });
```

- **Where they go:** inside the element the host gave, in the map's shadow root, laid out as the page lays them out. The
  host's own header stays its own.
  - `nav`: the views list (Miller columns) left of the map, with a ☰ button over the map's top left corner. ☰ or O opens
    and shuts it; it starts open when the model has more than one view. Picking a view shows it, with a `viewchange`.
  - `details`: the selected card's panel under the map: its kind and badges, its actions, and its tabs (when, what, how,
    an example, and what it comes from and leads to), with `[` and `]` between tabs. Open and Unfold here emit `open` and
    `expand`, as a double-click and E do, so a host can take them or load a view first (`examples/embed.html` does). → ←
    and ⇄ light what the card leads to, what leads to it, and every path between two selected cards, as > < and P do.
  - `legend`: the kinds of cards and lines the view draws, in a box at the bottom left that folds away. The fit keeps
    the cards off it, as it keeps them off the hint line and ☰.
  - `hints`: what the pointer does, at the foot of the map, and for a while what just happened ("Already at the top",
    what → lit). It's a polite live region; without it, what the panel lights is said in the map's own live region.
  - On a phone's width the legend and hint line hide and the panel's tabs wrap, as in the page.
- **Shared, not copied:** the page and `render()` draw the pieces with the same functions (`pieces()`, `hintHTML()` and
  `hinter()` in `lib/umlimator.js`), and their CSS moved from the page template into the module's stylesheet, which the
  page already took in. The move left the standalone page unchanged: compared in Chrome before and after, element by
  element, in 20 states (a card selected, each tab, a path lit, the legend folded, an example full size, keys, the views
  list, dark, a phone's width), every element of the page has the same computed style. #112 then changes it a little.
- **Lenses' panel buttons (#95):** the slowest and costliest path (⏱ ¤) and what-if (⊘) are the details panel's, so
  `render({ details: true })` offers them too, where the view's lines have latency or cost.
- **Keys and focus:** keys pressed anywhere in the map reach the pieces (`[ ] O > < P`, and Esc closes an example shown
  full size), and the map's other keys reach the canvas, as in the page; Enter and Space press the button they are on.
  The views list comes after the map in the tab order, so focus given to the map's element (#36) still lands on the map.
  An embedded panel that redraws keeps the focus on the control it was on, and one that closes gives it back to the map.
- **Theme:** the pieces take the `--um-*` colours. The theme file has two new ones, with the colours the page's CSS had
  written in: `--um-mark` (the panel's `==highlighter==`, light and dark) and `--um-scrim` (behind an example shown full
  size).
- **`update()` and `destroy()`:** an update redraws the views list (a view the model gained is listed), the legend and an
  open panel; `destroy()` takes them away with the map.
- **Left out:** deep links, since the URL is the host's (`viewchange` and `select` give it what it needs); the reader's
  choices kept in `localStorage` (the page keeps the folded legend and the open tab; an embedded map keeps them in its
  handle); and the page's header: breadcrumbs, search, help, export and the Stories menu.
- **Tests:** `tests/pieces.html`, in `tests/embed.py`: each piece alone and all four together, their keys, focus and
  events, a host taking Open, `update()`, `destroy()` and the theme, and an accessibility check as axe makes it, written
  out: names, nesting, ids and what refers to them, landmarks, tabs and live regions.

### The panels pass axe: a tab list of tabs, and two colours (#112)

axe-core found three things in the standalone page's panels, and so in `render()`'s, since they share them (#99). The
fix changes the page slightly: one wrapper in the details panel's markup, and how two kinds of text look.

- **A tab list holds only tabs.** The details panel's ‹ › buttons were inside its `role="tablist"` (axe:
  `aria-required-children`, critical). The tabs now have a tab list of their own, `.ptablist`, and ‹ › stand beside it.
  The panel looks as it did; on a phone the tabs still wrap.
- **The views list's current view** was white on the accent: 3.1:1 in dark, and its card count, at 80 %, 3.9:1 in light.
  It is now tinted, with the accent's ring and the text's colour, as the breadcrumb's current view is (13:1 in light, 15:1
  in dark). The details panel's PUBLIC tag was white on blue too (3.1:1 in dark), and is now drawn as the EXTERNAL one
  is, in its kind's colour (4.6:1 in light, 5.6:1 in dark).
- **The panel's quieter texts** ("Nothing calls this here", "Not written yet", an origin, and code in them) were
  `--um-dim` on the panel: 3.45:1 in light, 3.56:1 in dark. They take `--um-muted` now, as the panel's other secondary
  text does (5.7:1 or more; 6.1:1 and 6.5:1 for the texts themselves).
- **Checked:** axe-core 4.10, run by hand on `render()` with all four pieces and on the CLI's page, for every example
  model, in light and dark, every view, a few cards each and their tabs: 400 runs, no violations. `tests/pieces.html`
  writes out the two rules that failed (a tab list holds only tabs; every text in a piece is 4.5:1 on what is under it,
  3:1 when large) and checks them on `render()` with all four pieces (bike-share with a missing text, a highlight, code
  and an origin added, and the helpdesk assistant) and on `examples/bookshop.html`, in a frame, in light and dark.
- **Left out:** the map itself is unchanged. Its step and lane numbers are white on the accent too, which is 3.1:1 in
  dark; the palette's contrast check (`tests/contrast.html`) measures text over boxes only, so it doesn't see them.

### The legend check waits for the drawn legend (#113)

- **The wait could pass on the page's script.** `tests/embed.py` waited (#85) until the page's markup had `class="lgi"`,
  which the module's own source, inlined in the page, always has. So it read the page before the legend was drawn.
- **Now:** a small HTML parser reads the names in the drawn legend element (`#m-legend`), taking a script's text as text.
  The wait asks for the legend to have names, and the check wants calls and state among them; a page that never draws
  its legend fails it.

## 0.14.0: state that holds together and can be read, tools that say what happened, cleaner lines and a PDF to hand in

Everything since 0.13.0 (#116 to #127, #129):
- **The map's state holds together** (#117, #120, #121): every move, gesture and playback finishes or rolls back. A
  `setView()` during a move takes the move over, and resolves `true` once its view shows, `false` otherwise. A
  listener's error no longer stalls the map, focus and the selection survive a redraw, and motion belongs to each map.
  An edit's places follow the host's answer, and undo moves cards back.
- **…and can be read** (#118): `handle.state` is one frozen JSON snapshot, a `MapState`, and the `state` event says
  what changed. The page's `window.umlimatorMap.state`, the element's `el.map.state` and the MCP server's `page_state()`
  read the same.
- **The page** (#123): keys go to the top open layer, the link follows the map, stories are in the history, and the
  element reports a model with nothing to draw.
- **Tools that say what happened** (#116, #119, #122): a CLI command that fails keeps the previous output and prints no
  JSON. The MCP server's page tools say "shown" only once the page has shown it. The diff Action's comment names its
  commit and is written only for the pull request's latest one, and npm publishes only the commit its version is tagged
  at.
- **Lines** (#124, #125, #127): no line runs round one of its own cards (43 on the bench did, none now), a short jog runs
  straight, a tour's dot rides under the cards, and a line's flow keeps its width and its arrowhead.
- **The PDF** (#126): a cover with the contents, each view on a page of its own with its legend and tables, the rules
  as a table, and page numbers. `--paper letter` for US paper.
- **`wheel: 'ctrl'`** (#120) lets a document scroll past a map embedded in it.
- **A State chapter** (#129) in these docs: the four rules, `MapState`, and each machine's states and transitions.
  `examples/states.json` draws umlimator's own state machines with umlimator.

What moves for a host that upgrades:
- **`setView()`** resolves `true` or `false`, where it resolved `undefined`, and a call during a move is no longer
  dropped. A move ends with one `viewchange`.
- **A listener's error** goes to `reportError()`, not to the caller of `select()` and the like.
- **Escape** cancels a gesture, a tour or a replay before it clears the selection or goes up. Enter and Space on a
  control press it, on the map and on the page.
- **Stories:** auto-play pauses when the reader takes the map, and the page keeps stories in its history.
- **The CLI:** `stills` exits 1 when a view fails, and `check` when it checked no view. The first `stills` after
  upgrading draws every view again (`.stills.json` gives way to `.stills/`).
- **Some lines take another way** (#127), and some labels sit elsewhere on their lines. A layout pinned in the model
  doesn't move.
- **The PDF's pages** are laid out anew: a cover, a page or more per view, then the rules.

Nothing is removed. Every type, option, field, fragment, event and command is as it was, or new.

### The map's state holds together: moves, the selection, focus, gestures and marks

An audit of `render()`'s implicit state machines found transitions that could stall, drop a request without a word, or
stop half way. Every transition now finishes or rolls back, every request gets a true answer, and each piece of state
has one owner. The ids are the audit's: L, N, S, K, E, U, O for the map (runtime), and the playback machine's name.

- **A listener's error never wedges the map (H1).** `emit()` calls each listener on its own and hands an error to
  `reportError()`. A `select` handler that read `e.target.id` threw on the `select(null)` a view change sends, and from then
  on every `setView()` was dropped and the new view had no lens or marks. Now the move finishes, and the error is
  reported. A call such as `select()` no longer throws a listener's error back at its caller.
- **One move at a time, and the latest request wins (N1 to N4, N7, D1; playback story-player).**
  - A `setView()` during a move takes the move to its own view. It used to be dropped, and its promise resolved anyway.
  - `setView()` resolves `true` once its view shows, and `false` for a view the model lacks (with a console warning that
    lists the model's views), when a later request supersedes it, or on `destroy()`. It resolved `undefined` either way.
    The declared type stays `Promise<void> | void`, which a `Promise<boolean>` fits.
  - A move ends with one `viewchange`, from the view it started on to the view it shows.
  - A press on the map during a glide (a drill-down, a story's step) left the glide's promise pending: the move stalled,
    deaf to Esc and `setView()`, until some later zoom (N4). The camera now settles it, and the move goes on.
  - An `update()` that dropped the view a move was going to threw inside the move: `view` named the missing view, the map
    stayed at opacity 0, and no move worked again (N3). The move now ends `false` on the view it was on, visible.
  - On the standalone page, Back while a view zooms in is honoured: the map goes where the link went, and the history entry
    Back reached is no longer overwritten (N7). A `setView()` before the page's first draw, a frame later, is kept (D1).
- **Lifecycle (L1 to L6; playback tour and later-timers).**
  - A model with no views draws an empty card, "This map has no views yet". The `update()` that brings views draws the
    first one, with `viewchange` from `null`. Before, nothing was drawn, even after that update (L2). An `update()` to a
    model with no views shows the card; it threw and left the handle unable to draw again (L3).
  - `update()` with something that isn't a model throws a TypeError that says a map model is needed, before it changes
    anything (L4). `render()` with a `view` the model lacks warns, and starts on the root as before (L5).
  - A destroyed handle selects nothing and calls no listener (L1). `destroy()` settles every promise: a move's
    `setView()` resolves `false`, and a tour and a replay end at once, not on a later frame (L6).
- **Motion belongs to each map (playback motion-mode).** `mountPage(…, { instant: true })`, which the page's `#check`,
  `#still` and `#shot` use, stilled every map in the document for good. Now it stills its own.
- **The selection speaks once (S1, S2, S4).**
  - A redraw that keeps the selection (an `update()`, the redraw once fonts load) sends no `select` event. It sent
    `select(null)` and then the same selection, and the live region said "Nothing selected" in between. `expand()` and
    `collapse()` send one event each.
  - A chip or badge that was clicked is what Delete and Alt + arrows act on only while its card or box stays selected.
    After Escape and a reselection by key, it stayed the target, and Delete removed a chip nothing showed as selected (S2).
  - `selection`, `selected` and the events give copies of the map's Refs.
- **Focus stays in the map (K1, N6, K2).** A redraw puts focus back on the same card or line. Before, an `update()`
  dropped it to `<body>`, so a live map lost a keyboard reader on every update. A move keeps focus in the map, on the card
  come back to when going up, so Escape works after Enter, Enter. Enter and Space on the map's own buttons press them;
  Enter on a zoom button opened the selected card's view instead.
- **One gesture at a time (E1 to E5).** A gesture is a card being dragged, a line being drawn from the handle, or a name
  field.
  - Escape cancels it first, before it clears the selection or goes up. A drag or a line used to go on while Escape went
    up a level; then it threw, or added a line from a card the view didn't show.
  - A new picture (a view change, an update that redraws, unfolding) ends it, and so does `destroy()`.
  - A name field stays over its card through an update that keeps the card, and follows the camera. It closes with no
    change when its card goes or the view changes.
  - An add the host never answered no longer selects a later card.
- **A card whose inner view loads later unfolds when it comes (U1).** E or Alt + click on it is remembered, and the live
  region says it is waiting. The `update()` that brings the view unfolds the card and selects its box. Before, the host
  had to call `expand()` itself.
- **Marks keep to their view (O1, O2; playback replay-controller).**
  - A highlight lights only the views its Refs name. A layer that dims, if it names nothing on the view shown, dims
    nothing there. The whole next view used to go grey, so the page and `umlimator.py mcp` cleared highlights on every
    view change.
  - A box's Ref lights the cards in it and the lines between them. It lit nothing and dimmed everything.
  - An older replay's `stop()` leaves a newer replay's labels, and `replay()` on a destroyed handle is done `false`.
- **An ease's fading copies answer nothing (playback update-ease).** A selection, or `collapse()`, while an `update()`
  eased in threw a TypeError for a line the new picture lacked.
- **Visible behaviour changes:**
  - a `setView()` during a move is no longer dropped, and a move ends with one `viewchange`;
  - a model with no views shows the empty card;
  - Escape cancels a gesture before anything else, and Enter and Space on the map's own buttons press them;
  - a listener's error goes to `reportError()`, not to the caller.
- **Tests:**
  - `tests/state.html` runs in `tests/embed.py` under reduced motion.
  - `tests/motion.html` is the motion pass: `tests/embed.py` runs it without `--force-prefers-reduced-motion`. Its
    animation frames are timers, which headless virtual time runs.
  - Each test fails on 0.13.0.

### The map's state, readable: `handle.state` and the `state` event

Before, the map's state was spread over flags, DOM classes and private variables. A host or an agent could read the view
and the selection, and had to guess the rest from the DOM. Now it is one snapshot.

- **`handle.state`** is a `MapState` with `view`, `navigating`, `selection`, `expanded`, `lens`, `overlays`, `story`,
  `tour`, `replay`, `camera`, `flow`, `motion`, `gesture` and `destroyed`.
  - Each read builds a fresh one, frozen all the way down and plain JSON, so it can be logged, sent or compared as it is.
  - `camera` is the centre in map units, to a tenth, and the zoom, to a thousandth.
- **The `state` event** is `{ state, changed }`, where `changed` lists the keys that changed since the last one.
  - It comes after the snapshot changes, at most once a frame. A 16 ms timer paces it, so a page in a background tab
    still reports.
  - Changes made together come as one event.
  - The camera comes once it rests: a pan, zoom, glide or drag is one event, with `camera` in `changed`, when the camera
    has been still for 150 ms, with no press on the map and no move under way. Until then the event's `camera` is
    where it last rested; `handle.state` reads it live. A glide used to send an event every frame.
  - The last one, on `destroy()`, has `destroyed: true`.
  - The first state listener added with `on()` hears changes from then on.
- **The `lens` event** `{ lens }` comes when the lens on the map changes: `lens()`, or an `update()` whose model lacks it
  (`lens: null`).
- **Getters next to it:** `navigating` (the view a move is going to), `destroyed`, and `motion` (`'instant'`, `'reduced'`
  or `'full'`). `flow` can be set too: `handle.flow = false` stops the lines' flow. A host's setting isn't saved as the
  page reader's choice; the page saves only what ≋ and F set.
- **Where it is read:** any `render()` handle, the standalone page's `window.umlimatorMap.state`, and `<umlimator-map>`'s
  `el.map.state`. `umlimator.py mcp` reads it with its `page_state()` tool: "The MCP server's page says what it shows",
  below.
- **Types:** `lib/umlimator.d.ts` adds `MapState`, `Events['state']`, `Events['lens']` and the getters. Nothing in it
  changed, except comments: `setView()`'s says what its promise resolves to.
- **Tests:**
  - `tests/state.html`: the snapshot's keys and types, that it is JSON and frozen, the events and getters, and the last
    event on `destroy()`.
  - `tests/motion.html`: `navigating`, a tour and a replay, while they run; a glide, and zooms one on another, each send
    one camera event.
  - `tests/page-handle.html`: the CLI page's `window.umlimatorMap.state`.

### An edit's places follow the host's answer, and undo moves cards back (E6, E7)

- **Before:** a card moved, reordered or added emitted `change` with a place hint, and the hint waited for "the next
  update", whichever it was. A reorder the host refused was applied by the next unrelated update, a collaborator's
  rename, say (E6). And positions lived only in the handle, so the host's undo of a move put the model back while the
  cards stayed where they were dropped (E7).
- **Now the next update decides.** Its model either shows the edit or not:
  - a move into or out of a box, as the card in its new box;
  - an add, as a new card in the view with the name the reader typed (case and spaces aside);
  - a place alone (a move to a spot, a reorder), as the card's own `layout` entry the host wrote, or as the model
    unchanged, the host answering an edit that changes no field, as `examples/edit.html` did.

  If the model shows the edit, its places are used. If not, they are dropped, and nothing moves for an edit the host
  refused, whatever comes next. The added card the update shows is the one selected.
- **Undo and redo:** places an update applied are kept with the model before and the model after. An update back to
  the model before puts every card back where it was then (undo), and one to the model after moves them again (redo),
  the 20 latest moves. A move or reorder whose answer left the model unchanged can't be told apart from no edit, so
  only a host that keeps places in the model gets undo for them. `examples/edit.html` now writes a card's new place into
  its view's `layout`, so its ⌘/Ctrl Z and ⇧ ⌘/Ctrl Z move cards back and forth.
- **No new API.** An `update(model, { applied: [changeIds] })` was considered and not added. The model already has a
  field for places (`layout`), so a host can always show an edit applied in the model, whatever else the update changes.
  The unchanged model still works for hosts that keep no places.
- **Visible behaviour changes:** an update that doesn't show a pending edit no longer applies its places, and an add is
  matched by its name, not by being the only new card.
- **Tests:** `tests/edit.html` has a refused reorder before an unrelated update, a reorder applied by `layout` together
  with another change, its undo and redo, a move into a box undone, and a refused add before someone else's new card.

### A map in a document lets the page scroll: `wheel: 'ctrl'` (C1)

- **Before:** the wheel over a map always zoomed it, and a trackpad's scroll panned it, so a page couldn't scroll past
  a map embedded in it. The docs blocks were where this hurt most.
- **`render(el, model, { wheel: 'ctrl' })`:** only Ctrl or ⌘ with the wheel, or a trackpad's pinch, zooms. A plain wheel
  or trackpad scroll is left to the page, and the hint line says "Ctrl + scroll = zoom". `'zoom'`, the default, is
  as before.
- **`<umlimator-map wheel="ctrl">`**, and `wheel: ctrl` in a docs block, give the element's map the same. Changing the
  attribute draws the map again, as `minimap` and `controls` do.
- **Left out (V2):** in a bare `render()`, Escape and ↑ still go to the view's parent in the model, not to the view the
  reader came from; the standalone page keeps its own history. Left for later.
- **Tests:** `tests/embed.html` checks both modes. `tests/element.html` checks the attribute, and `tests/docs.test.mjs`
  the block key.

### Playback on the state contract: stories, tours, replays and flow

The playback audit found a story with no named states that played on after the model dropped it, or after the reader took
the map. The page's Pause paused only CSS. Esc closed neither the recorder nor a tour, and a tour under reduced motion
showed nothing. The ids are the audit's playback machines: story-player, tour, story-recorder and flow.

- **The story player has named states (story-player).**
  - `player.state` is `entering` (the step's view, camera, selection and highlight on their way), `playing` or `paused`
    on a step, then `ended` or `stopped`.
  - `handle.story` is the player of the story shown, whoever started it: `play()`, the standalone page's Stories menu, or
    a link. `MapState.story` keeps its shape, `{ id, step, steps, playing }`.
- **A story event for every change (story-player).** The `story` event carries `playing`. It also comes on a pause or a
  resume (the same step) and on `destroy()` (step `null`). Before, a host heard of neither.
- **`play(null)` stops the story shown, and an unknown id leaves it alone (story-player).** Before, `play('nope')` stopped
  the story shown and then returned `null`.
- **The story follows the model (story-player).**
  - An `update()` whose model no longer has the story stops it: `done` false, a story event, and no bar. Before, the old
    steps played on.
  - An `update()` whose model changes the story's steps shows the step the story is on as the model now has it.
  - An `update()` while a step's camera glides in no longer leaves the camera half way: the glide goes on to the step's
    framing. The camera's glide now says whether it arrived.
- **A playing story waits once the reader takes the map (story-player).**
  - These pause it, and the bar shows ▶:
    - a press on the map (not on the story's bar), the wheel, a key the map acts on, or a zoom button;
    - a host's `fit()`;
    - a view or a selection the story didn't make: a host's `setView()` or `select()`, or the page's views list or
      search.
  - `resume()` or ▶ plays on.
  - A view opened while a step's move was under way leaves that step out of it, paused, and `resume()` shows the step
    again.
  - Before, the next step undid what the reader had done, once its duration was up.
- **Focus stays in the map (story-player).** Closing the story from its bar (✕, or ✓ on the last step) puts focus on the
  map. It fell to `<body>`, out of reach of the map's keys. ‹ on the first step is `aria-disabled` and keeps the focus.
- **A step sets the whole picture, unfolded cards too (story-player).** A step folds back the cards the reader unfolded
  on its view before it selects and lights anything. Before, a card unfolded into a box kept the step from selecting it
  and from lighting its lines (bike-share's Trip service on the system view).
- **A story lights its own layer (story-player).** A step's highlight is the `story` layer, not the shared `highlight`.
  So `highlight(null)` (a host's, the page's, or `umlimator.py mcp`'s on a view change) leaves it, and a story's end
  leaves a host's highlight.
  - While a step shows, its dimming stands alone. A layer that dimmed before the step (a host's highlight, a lens) keeps
    its rings and tabs but doesn't dim, so the step looks as it was told.
  - A layer set while the step shows dims in the step's place, so what the reader lights then still shows.
- **The page's Pause holds every clock (tour).** ❚❚ paused CSS and SMIL only, so a tour's dot, a replay and a playing
  story went on. Now they hold where they are, and ▶ lets them go on. A story's step is given its time again.
- **Esc ends a tour or a replay (tour).** At the top with nothing selected, Esc said "Already at the top" and the dot rode
  on. Now Esc ends a tour or a replay first, after a gesture or a story, and says so.
- **Under reduced motion a tour is shown and said (tour).** With no dot to ride, `tour()` showed and said nothing. Now it
  lights the path at rest in the `tour` layer: its cards ringed and numbered in turn, its lines glowing, nothing dimmed.
  - The live region says it: "Tour: Rider app → Trip API → …". A story's step says its caption instead.
  - The path stays until the next tour or replay, `tour(null)`, Esc or a new picture.
  - `MapState.tour` stays false, since no dot rides.
- **The recorder (story-recorder).**
  - Esc closes it when it is on top. Before, Esc cleared the selection, then went up a level, and each was recorded as a
    step.
  - It takes no steps while a story is shown.
  - Save is off with no steps.
  - Close, Esc and leaving the page ask first while it holds steps or captions that aren't saved.
- **Flow (flow).**
  - The page saves flow only when the reader presses ≋ or F. It saved the default at load, so the setting of a reader's
    first visit stuck.
  - Under reduced motion no flow is drawn: ≋ isn't offered, F does nothing, and the page ignores a saved choice. A
    host's `flow = true` sets the state and draws nothing.
  - The rule that hid flow lines under reduced motion lost to another, so they showed as still dashes with ≋ pressed.
- **Visible behaviour changes:**
  - a story's auto-play pauses when the reader takes the map, and a paused story holds its step's tour;
  - a step folds back the cards unfolded on its view;
  - a step's dimming stands alone;
  - the story event comes on pause, resume and `destroy()`;
  - the page's Pause holds tours, replays and stories;
  - Esc ends a tour or a replay before it clears the selection or goes up;
  - under reduced motion a tour is lit at rest and said, and ≋ is hidden;
  - ‹ on the first step is `aria-disabled`, not `disabled`.
- **A pause holds the step's tour too (story-player).** `pause()`, the bar's ❚❚, or the reader taking the map stops the
  step's tour where it is, and `resume()` or ▶ lets it ride on, as the page's ❚❚ does. Before, a paused story's dot rode
  on. A story opened with `auto: false` isn't paused by anyone, so it still rides each step's tour.
- **Docs (update-ease):** unfolding in place has eased since 0.12.0, as any `update()` does, though that release's notes
  above say it doesn't yet.
- **Types:** `StoryPlayer.state`, `Handle.story`, `play(id: string | null)`, and `playing` on the story event.
- **Tests:** `tests/stories.html` (reduced motion) and `tests/motion.html` (motion on). Each new check fails before this
  change.

### The CLI says what happened, and leaves the previous output when it fails (tooling)

The state-machine audit found these in the CLI, its caches and the MCP server's small parts. The ids are those of its
tooling inventory (machine, #n). Each fix follows the decision's rules: a step finishes or rolls back, every request gets
a true outcome, and the state can be read.

- **Outputs (cli-out-artifact 1 to 3, cli-render-pipeline 1):**
  - *What was wrong.* A failed run could destroy or replace the last good output.
    - `pdf` deleted the previous PDF before printing, and left a 2-page PDF after a failure.
    - `render` of a model the engine rejects printed `{"out": …, "errors": []}` and kept the previous page, so the
      failure looked like a success.
    - `trace` rewrote the model in place.
  - *Now.* Every file a command writes goes first to a temp file beside it, which is renamed over the target only once
    it is whole: the page, pictures, PDF, animated PNG, imported or traced model, time-lapse, `summary.md` and cache files.
    - A failed run leaves the previous file, and `pdf` says so.
    - `render` prints its JSON only when the page was written. Otherwise it prints nothing on stdout, the engine's reason
      on stderr, and exits 1.
- **Chrome (chrome-driver 1 to 4):**
  - *What was wrong.* Chrome's exit status and log were dropped. A Chrome that could not start (say, run as root in a
    container) read as a page problem, with wrong advice. `record` let a timeout escape as a traceback. Chrome's helpers
    outlived a timeout. Every command said "stills needs Google Chrome or Chromium".
  - *Now.* A failing Chrome is said in its own words (its log line, with the exit status), and every command handles a
    timeout the same way (`<command>: Chrome did not finish in N s`). Chrome, the engine and Node each run in a process
    group of their own, which ends with the command on a timeout, Ctrl-C or SIGTERM.
- **`--views` (page-hook-protocol 1 to 4):**
  - *What was wrong.*
    - `check --views sytem` passed: "0 views" checked, exit 0, and CI's own guard passed on that string.
    - View ids holding `&`, `+`, `%` or `#`, which the schema allows, could not be stilled, checked or printed.
    - `stills --views` took no trailing `*`, though `check` and `pdf` did.
  - *Now.* `check`, `stills` and `pdf` resolve `--views` against the page before Chrome starts, with one rule: a
    trailing `*` is a prefix. A name that matches no view exits 1 and lists the page's views. Ids are percent-encoded
    in the page's link. `check` exits 1 when it checked no view.
- **`render` (cli-render-pipeline 2, 3 and 5):**
  - *What was wrong.* SIGTERM (an agent's timeout, a cancelled CI job) left the model's hidden copy beside the model,
    and the engine wrote the page after the command had ended. A checked render left its screenshots in `.<page>-check/`
    beside the page. `--no-check` output read like a clean check.
  - *Now.* SIGTERM cleans up as Ctrl-C does. The screenshots, which nothing read, stay in a temp folder. The JSON says
    `"checked": true` or `false`.
- **The stills cache (stills-cache 1 to 8):**
  - *What was wrong.*
    - A view whose PNG Chrome never wrote was recorded as fresh, so the old PNG stayed for good.
    - Two runs into one folder left pictures that the shared `.stills.json` disagreed with, and later runs skipped them.
    - The key left out lines that end on a box, the model's rules (a broken rule's line is drawn rose) and authors.
    - A failed view exited 0, with text before the JSON on stdout.
    - `--scale 2` and the default keyed differently.
    - `--all --views a` dropped every other view's entry.
    - A record cut short crashed every later run.
    - A view the page no longer has kept its pictures without a word.
  - *Now.*
    - A view's key file, `.stills/<view>.json`, holds its key and the hashes of both files. It is written last, once
      both files are whole and the PNG is a PNG.
    - A view is skipped only when its key and both hashes match, so a file another run or a person changed is drawn
      again.
    - The key covers those inputs, and scale counts as a number.
    - A failed view exits 1 with its reason, and stdout is only ever the JSON list.
    - Pictures of views the page no longer has are named on stderr.
- **`diff --base`, which the Action runs (diff-base-run 1 to 4):**
  - *What was wrong.*
    - A model the pull request broke (a conflict marker) was skipped: "No map model changed."
    - A failed still put text before the JSON on stdout, so the Action's `changed` came out empty.
    - With no Chrome the whole command failed, and no summary was written.
    - `a/b-c.json` and `a-b/c.json` wrote one page.
  - *Now.*
    - A map model that no longer parses is a change: an entry `{file, error}` in the JSON and a line in the summary.
      Other JSON that doesn't parse, such as a `tsconfig.json` with comments, is still not a model.
    - The pictures are extras: a view without one is listed in `stillsFailed` and said in the summary.
    - Each model is diffed on its own, so `summary.md` is always written.
    - A name that is taken gets a short hash.
- **`import` (import-parsers 1 to 4):**
  - *What was wrong.* A file cut short, or one with an unclosed `/*`, imported as a smaller map with `"unread": 0`.
    JSON cut short read as a format it could not tell.
  - *Now.* At the end of the file, each block still open (Structurizr, C4-PlantUML's boundaries), a comment never
    closed (and the lines it hid), and an `@startuml` with no `@enduml` are listed with their lines. JSON that does not
    parse says so. The JSON adds `notImported: [{where, message}]` beside the `unread` count.
- **The icon cache (icon-cache 1 to 3):**
  - *What was wrong.* A cached logo was trusted forever, so one cut short was drawn broken in every page. The cache was
    written in place. `pin-icons` moved files before it recorded their hashes.
  - *Now.* A cached logo is checked against its sha256 each time it is read, and fetched again when it doesn't match.
    Offline, the card keeps its sigil. Writes are whole. `pin-icons` writes the hashes first.
- **The MCP server, its parts away from the page (mcp-session 2 to 4):**
  - *What was wrong.* A taken port moved the page to a random port on each run. A JSON-RPC batch got one `-32600`,
    though the 2025-03-26 version it speaks has batches. `diff`'s relative paths resolved in a folder the agent was
    never told.
  - *Now.* A taken port falls back to a port of the model's own, the same on each run, and only then to any port. A
    batch gets a batch of replies. The instructions name the model's whole path and the folder the server runs in. A
    relative path is looked for in the model's folder first, and an error names where it looked.
  - The page's own machines (its state, acknowledgements, replay and last good page, and mcp-session 1) came in the
    next wave, on the map's state contract: "The MCP server's page says what it shows", below.
- **Behaviour changes, all for defects the audit reproduced:**
  - `stills` exits 1 when a view fails.
  - The first `stills` run after upgrading draws every view again (`.stills.json` gives way to `.stills/`).
  - `check` exits 1 when `--views` names no view or no view is checked.
  - `render`, `pdf`, `stills` and `record` print no JSON when they fail. `check` prints none when the check could not
    run, and its report, as before, when the model breaks a rule.
  - `render`'s JSON gains `checked`, `import`'s gains `notImported`, and `diff` and `drift` gain `stillsFailed` when a
    view has no picture.
- **Left as it was:** `render`'s own check still gives up after the engine's 45 s on a very large model
  (cli-render-pipeline 4, not reproduced). The engine is upstream's and unmodified; `check` waits 600 s.
- **Tests:** `tests/outcomes.py` (new, in CI) runs each of the audit's repros through the CLI, with a stand-in only where
  a real Chrome can't be made to fail on demand: one that cannot start, one whose helper outlives it, and one that dies
  on a screenshot. Each defect has a case that failed before these changes. `tests/import.py` adds files cut short.

### The diff Action's comment, the release and map-repo's CLI end in a true state (tooling)

The state-machine audit found these in three of umlimator's tools, by the ids of its tooling inventory. What holds now:

- **The diff Action's comment** (`action.yml`):
  - *Two runs at once posted two comments, and later runs updated only the first (action-comment 1).* Only the run for
    the pull request's latest commit writes: it reads the pull request's head first, and a run for an older push writes
    nothing. Every comment the bot left with the marker is updated, so one posted twice before is never left stale. A
    `concurrency` group per pull request, as in the README's example, runs them one at a time.
  - *A lookup that failed posted a second comment (action-comment 2).* Comments or a head that can't be read mean no
    comment and a warning. The summary is in the job summary, as before.
  - *Any failed write was reported as a fork's read-only token (action-comment 3).* On a fork's pull request it still is,
    as a notice. On the repository's own, the warning gives gh's own message and the permission the workflow needs
    (`pull-requests: write`).
  - *The comment named no commit, so after a failed or slower run it showed an older push as current (action-comment 4).*
    It ends with the commit it describes, in words and as `<!-- umlimator-diff-sha: <sha> -->`. The comment step runs
    after a failed diff too (a cancelled run skips it), and the comment then says the diff failed for that commit, with
    the run's link.
- **The release job** (`.github/workflows/check.yml`):
  - *A failed npm publish was retried by the next push, which published that later commit under the version the tag gave
    an earlier one (release-pipeline 1).* A version is tagged at the commit that releases it, and npm gets that commit
    only: a push whose version is tagged at another commit publishes nothing.
  - *The Release, marked latest and saying `npm install umlimator@X`, came before npm had X (release-pipeline 2).* It is
    a draft until npm has the version, then published and marked latest.
  - *A tag made by hand read as "released already" (release-pipeline 3).* A version tagged at another commit counts as
    released only once its Release is published. Otherwise the job fails, names the tag's commit and says to re-run that
    commit's release job (for a tag made by hand: delete it and re-run this one). A re-run finishes a release where it
    stopped, since each step checks what is done first.
- **map-repo's `cli.py`:**
  - *Two first uses at once cloned into one folder, and one failed with a traceback (skill-cli-cache 1).* Each first use
    clones into a folder of its own and renames it into place whole; the one that finishes second uses the first's.
  - *No network on first use ended in a traceback (skill-cli-cache 2).* git says why, then one line says the first use
    needs the network once, or `UMLIMATOR_CLI_CACHE` naming a folder that holds the release.
  - *The pin was checked only when cloning (skill-cli-cache 3).* Every run checks that the cache holds the pinned commit,
    and says to delete the folder to fetch it again when it doesn't.
- **Visible changes:** the comment's last lines name its commit; a run for an older push leaves the comment alone; a
  refused write on the repository's own pull request is a warning that names the permission; a GitHub Release is a draft
  until npm has its version; and a push to main fails while an earlier release of its version is unfinished.
- **Tests:** `tests/steps.py`, which CI runs, reads each step's `run:` block from `action.yml` and `check.yml` by its id
  and runs it as GitHub does, against stand-ins for gh, git and npm:
  - the release: a new version; npm failing, then a re-run; npm failing, then a later push; a later push after a release;
    missing notes; a tag made by hand;
  - the comment: two runs at once, a run for an older commit, comments and a head that can't be read, a refused write on
    the repository's own pull request and on a fork's, a failed diff;
  - `cli.py`, against a local tagged repository: two first uses at once, no network, a changed pin.

  Each of these fails on 0.13.0's steps.
- **Left out:** the artifact's fixed name, which a second use of the Action in one run trips on (action-comment 5); and a
  check that fails on the release's merge commit still lets the next push release that later commit (release-pipeline
  4). The site job needs no change: it runs under `bash -e`, so it fails when `stills` does, and `stills` exits 1 on a
  failed view now (the CLI's change set).

### The standalone page's state: its keys, the link, stories in the history, the panel and the element

The page audit (wave 2) found the page's own machines: its keys, its link, its menus and panels, and the element's
lifecycle. Each decided its transitions in several places, so they contradicted each other. Each now has one owner. The
ids are the audit's: a machine, then the number of its defect.

- **One key router (keyboard-router 1 to 3, example-lightbox 1 and 2, search-palette 1, help-dialog 1).** One table
  decides each key, read from the top open layer down. The layers, in order: an example shown full size, search, the key
  list, a menu, the view's popover, the story recorder, a story, then the map.
  - Enter, Space and the arrows aimed at a control outside the map are that control's. With a card selected, Enter on a
    details tab, the panel's ×, Export ▾, an item of the views list or the example's × opened the card's inner view
    instead, and the control did nothing. Arrows on those controls panned the map.
  - Esc and Backspace close the top open layer, wherever the focus is (a text field takes its own keys). Search no longer
    stays open while the map goes up a level behind it. A menu gives focus back to its button. The recorder closes, and
    asks first when it holds steps not saved (the playback change above). Backspace closes a story as Esc does
    (`play(null)`); before, it cleared the step's card and then went up a level under the story's bar.
  - An example shown full size holds the keys: Esc closes it, Tab stays in it, and Enter and Space press its own
    buttons. Focus goes back to its thumbnail. Before, O, /, ? and i acted on the page behind it.
  - The key list (?) is made from the same table, so it can't drift from what the keys do.
- **One owner for the link (deep-link 3 to 5, lens-picker 1 and 2, theme 1).** One function writes the fragment, from
  what the map shows. Another follows a link: on load, and on Back, Forward or an edited link.
  - A new view is a new entry, written once the move lands. A selection, a story step on the same view, a lens and the
    theme rewrite the entry. Since the move became latest-wins, the select a move sends mid-move rewrote the entry being
    left with the new view, so Back skipped it; now it waits for the move.
  - A link applies its lens, view, story step and card together, and nothing is written until the map has settled. A
    move the reader starts meanwhile wins and gets an entry of its own.
  - What the model lacks is corrected in the link, and the hint line says so: "Link corrected: no view “nope”". The same
    goes for a card, a story, a step or a lens. Before, a missing view or card stayed in the address bar.
  - `reader=1` stays in the link, so a reader copy's Export ▸ Copy link is a reader copy. A link that names the theme names
    the one shown, after ◐ too; it named the theme the page opened with, which won on reload.
  - The lens follows the `lens` event, so a lens put on with `handle.lens()`, or dropped by an `update()`, shows on the
    Lenses button and in the link.
- **Stories in the history (story-mirror 1).** A story step's entry is the entry of the step's own view. Back and Forward
  show that step, not playing on, and an entry with no story closes the one shown. Before, the history ignored stories:
  Back moved the view under a bar still on its last step, and each entry named the next step.
- **The details panel (details-panel 1 to 5, lit-highlight 1 and 3, legend-fold 1).**
  - The tab the reader chose stays chosen. A card without it shows its first tab, and the next card that has it shows
    it again. Before, the choice was forgotten until a reload.
  - A story step's own selection is a pointer, by id, whether the step names its card or gives a Ref. `[` and `]` don't
    open the panel for it, and a click on that card does.
  - A tab or the legend's fold changed by keyboard keeps focus on its button, and a panel that closes gives focus back to
    the map, on the page as in `render()`'s pieces.
  - What → ← ⇄ ⏱ ¤ ⊘ light is on the page's own layer, `lit`, so it never takes away a story's or a host's `highlight()`.
    The button that is on says so (`aria-pressed`). `handle.state.overlays` lists `lit`, not `highlight`.
- **Menus, phones and the views list (search-palette 2, header-menus 1, views-navigator 2).** One menu is open at a time,
  and search, the key list or another menu closes it; ⌘K left Stories or Lenses open under search. On a phone's width,
  Stories and Lenses stay in the header as their glyphs ▶ and ◎, and keep their names for screen readers. Only Export
  is hidden. The views list closes when the window narrows to a phone's width, where it would cover the map.
- **The page's handle (page-lifecycle 1).** `destroy()` also takes the page's listeners on the document and window away.
  Before, the key list, search and Back still acted on a destroyed map.
- **One-shot modes (page-modes 1 and 2).**
  - `#still` for a view the model lacks writes `data-still` with an `error` and stops. It used to poll for ever, until
    Chrome's budget ran out.
  - The `#check` report lists a promise that failed with no one to catch it (`unhandledrejection`). It waits two tasks
    after the fonts so such a failure can come in.
- **`<umlimator-map>` (element 1 to 4).**
  - A model with no view to draw fires `error`, not `load`, and the element's children show again.
  - `error` is an `ErrorEvent`, and its `message` says why: a fetch's status, bad JSON, or no view.
  - `el.loading` is true from the moment a draw is asked for until `load` or `error`. Meanwhile `el.map` is still the map
    drawn last.
  - An attribute set to the value it has draws nothing again. A host that set `view` again threw away where the reader
    had gone.
  - `el.map.state` is the map's `MapState`.
- **Visible behaviour changes:**
  - Enter and Space on a page control press it.
  - Esc and Backspace close the top open layer first; Backspace closes a story.
  - Stories are in the history.
  - A link the map can't follow is corrected and said in the hint line.
  - `reader=1` stays in the link.
  - The lit paths are the `lit` layer.
  - Stories and Lenses show on phones.
  - The element fires `error` for a model with no view.
- **API added:** `el.loading`, and the element's `error` as an `ErrorEvent`. `lib/umlimator-element.d.ts` has `loading`;
  nothing in `lib/umlimator.d.ts` changed.
- **Left for later:**
  - Search's index after an `update()`.
  - The hint line on a phone, and its live region repeating the key hints.
  - The ◐ button's state for screen readers.
  - `#check` staying in the link.
- **Tests:**
  - `tests/page-state.html` covers the keys, the link, stories in the history, the panel, menus, a phone's width (the
    template's CSS, in a frame), `#still` and the check report. `tests/embed.py` runs it under reduced motion.
  - `tests/page-motion.html` runs in the motion pass: Back twice during moves, a selection and then a move, a story step
    on another view, and the reader's own move while a link is followed.
  - `tests/element.html` adds the element's checks.
  - Each defect fixed has a check that fails without this change.

### The MCP server's page says what it shows (tooling, wave 2)

The state-machine audit found these in `umlimator.py mcp`'s page, by the ids of its tooling inventory. Its page tools
answered "sent" for what was written to a socket. A page that opened late got the last command alone. A model that
stopped rendering took the page down. And the assistant could not learn what the page showed.

- **Shown means shown (mcp-sse-clients 1 and 2, mcp-page-player 1 and 2):**
  - *What was wrong.* A closed tab counted as connected for up to 20 s, so "Sent to 1 page" could go to nobody. A
    command that came while a page was connecting was played twice. No tool read what the page showed, and a command
    stuck behind a move (a tab in the background) held every later one.
  - *Now.* The served page posts its map's `state` (the `MapState` of 0.14.0) on each change, and after each command it
    has shown or failed to, with the command's id.
    - A page tool waits up to 6 s for that, and answers "Shown on N pages, on view X", "The page could not show it: …",
      "Sent to N open pages, which did not show it within 6 s…", or "No page is connected: open …".
    - A command that takes the page more than 5 s is answered as failed, with why, and the next one goes on.
    - The page shows each command once, whatever comes twice.
    - A closed tab drops out within 2 s, the ping's interval.
  - The new read tool `page_state()` returns, for each open page, its `state`, whether it shows the model's latest
    version, and the last command it showed (or why not). It also returns what the assistant asked for last, and
    whether the model renders.
- **A late page shows what the assistant built (mcp-latest-command 1 to 3):**
  - *What was wrong.* After `show_view(trips)` and `highlight(...)`, a page that opened later got the highlight alone,
    on the root view, where it dimmed every card. A replayed command carried the version of the model at replay time.
    A story or tour sent long ago played again.
  - *Now.* The server folds its commands into what the page should show, `{view, highlight, tour, story}`, the latest of
    each, and sends that.
    - A highlight or tour that names no view goes on the view its Refs name. Otherwise it goes on the last view asked
      for that shows all its cards, else the first view that does.
    - A tour or story that a page reports has ended is taken out, so a page that opens later doesn't play it again.
    - When a new version of the model renders, what it no longer has (a view, cards, lines, a story) is dropped.
- **The assistant's highlight is its own (mcp-page-player 3, and the decision's rule 3):**
  - *What was wrong.* The assistant's highlight shared the map's `highlight` layer with the page's own lit paths and
    stories. The reader's view change cleared it without a word. `clear()` stopped only the server's story.
  - *Now.* It is drawn on a layer of its own, `mcp`: off on any other view, so it never dims every card there, and back
    when the reader returns to its view. `page_state()` shows it in `overlays`. `clear()` takes off the assistant's
    highlight, tour and story; a story the reader started is the reader's.
  - For this, the module's `highlight()` takes `{ layer }` (additive): `highlight(refs, { layer: 'mcp' })` draws the
    same marks as a layer of that name, and `null` clears that layer only.
- **A model that stops rendering keeps the page (mcp-page-render 1 and 2):**
  - *What was wrong.* The page reloaded into a bare 500 and lost its map and its event stream, while the tools went on
    saying "Sent to 1 page". The page was labelled with the version read before the render, which an edit during it
    could change.
  - *Now.* The page is rendered from a snapshot of the model's bytes, labelled with their hash, and when a page tool
    is called. A version that doesn't render keeps the last page that did. The page tools begin their answer with "The
    model no longer renders, so the page shows its last version that did: <why>", the page shows the same in a bar,
    and `page_state()` gives `model.renders: false`.
  - Before any version renders, the page says why and draws the map once one does.
- **A tab outlives its server (mcp-session 1):**
  - *What was wrong.* When another model's server took the port, an open tab reloaded into that map without a word.
  - *Now.* The page names its model file, and another model's server refuses its event stream. The tab stays as it was
    and says that its server now serves another map.
- **Known limits, for later:**
  - mcp-page-render 3: `GET /` still renders under the lock when the model changed since the last page tool, which
    renders first, so a page rarely waits. Rendering in the background would end it.
  - mcp-page-player 4: a headless browser that waits for network idle still waits on the event stream for ever (wait
    for `load`). `page_state()` gives an assistant the page's state without a browser.
- **Tests:**
  - `tests/mcp.py` (new, in CI) drives the server through its pipes, as a client does, and its page in headless Chrome
    over the DevTools protocol. It runs one case per defect above, and 11 of its first 13 fail on 0.13.0's server;
    `mcp-session 1` was added after.
  - `tests/cli.py`'s MCP part answers as a page does.

### A tour's dot rides under the cards, and a line's flow keeps its width and its arrowhead (#124)

- **The dot rides under the cards.** A tour's dot (the model's `tour`, `tour()` and `replay()`) is now drawn over the
  lines and boxes but under the cards. It goes into a card and comes out at its next line, instead of crossing the card's
  name. `umlimator.py record` spreads a tour's frames over the lines only, so every frame still shows the dot.
- **The flow is as wide as its line.** A line's flow was drawn wider than the line (2.4 px on 1.6, and 3.4 on 2.8 when
  selected), so the line looked lumpy. Now it is exactly as wide, in the canvas colour: light pulses moving along the line.
- **The flow stops where the arrowhead begins.** It used to run into the arrowhead and bend its shape. Now it stops short,
  at both ends of a two-way line, by the arrowhead's length for the line's weight.
- **Tests:** `tests/motion.html` checks the dot's layer (for `tour()` and a view's own tour), the flow's width (normal and
  selected), and where the flow ends.

### The PDF reads as a document to hand in for a review (`pdf`)

The maintainer's review of `umlimator.py pdf` (#93): "PDF layout seems too simple and not formatted well." Each view's
picture sat in a band with empty page around it. Its `describe()` sentences ran below in two columns, a wall of text
("Cards: …, …, …" in one paragraph), and then half the page was empty. The legend sat alone on a page of its own, and a
model without rules printed "The model has no rules." The page now lays the document out itself, a page at a time.

- **The cover**: the model's title, the date, the model's file (its `source`), a summary line (views, cards, lines, and
  rules when it has any) and the contents. Each view is listed with its caption and its page, indented under the printed
  views that hold it, and the rules come last.
- **Each view, from a page of its own**:
  - **A header**: the view's path ("Bike share › What runs"), its counts, and its caption under them.
  - **The picture**, as large as the page allows, never larger than drawn, and in its own proportions.
    - A picture too tall to leave room below it keeps the page's height, and the tables go beside it, in one column.
    - It is drawn up to 30% smaller (never below a scale of 0.6) when that keeps all its tables on its page.
  - **The legend** of what this view draws, under the picture.
  - **Tables**, in place of the sentences, in two columns below the picture:
    - its cards: the name with its sub-line, the kind, and what it is;
    - its lines: from → to, the label, and the technology (the line's sub-line). A numbered view's lines are in run
      order, with their step numbers;
    - its boxes, with the cards each holds.
  - **A long table** goes on in the next column or on the next page, under its heading and header row again. A row is
    never cut, a heading never ends a column, and a table's last row never goes on alone.
- **The rules**, only when the model has any: a table of each rule, the printed views it applies in, holds or broken,
  and the lines that break it.
- **Every page** ends in the model's title and "page N of M". The views and the rules are the PDF's bookmarks.
- **Print typography**: the page's own fonts (`--um-sans`, `--um-mono`), one type scale (26, 14, 9, 8.5 and 8 pt) and the
  margins in `@page`. With `--theme dark`, whole pages are dark, margins included.
- **`--paper a4|letter`**: A4, the default, or US Letter, both across.
- **How**: Chrome's own page breaks can't be read back, and the contents need each view's page. So the page sets every
  break itself: each sheet is exactly one page, and a table's rows are moved on one at a time, as measured.
- **Visible behaviour changes**:
  - The layout and the page count: a cover, a page or more per view, then the rules. Before, there was a title page, a
    page per view, and one page for the legend and the rules.
  - A model without rules has no rules section, and no "The model has no rules.".
  - In the PDF, the legend's ⤢ Stacked "opens a view of its own"; the page's legend still says "double-click to open".
  - `pdf` fails when the PDF has fewer than two pages (the cover and a view). Before, it took three.
- **API added**: `umlimator.py pdf --paper a4|letter`, and `&paper=letter` beside `#pdf=1` in the page's link.
- **Left out**: a model-wide legend in an appendix (each view's page has its own), portrait pages, and page references
  from a stacked card to its view.
- **Tests**: `tests/cli.py` reads the PDFs back with the standard library, as before. It checks:
  - every page ends in the title and "page N of M", and there are as many pages as `pdf` reports;
  - the cover: its title, date, file, summary line and contents, with each view's page number the page its header starts;
  - a view's legend and its tables of cards, lines and boxes, a numbered view's steps, and the rules table;
  - `--views`, and a dark theme painted to the edge of the page;
  - a view of 40 cards, whose tables go on over the next pages, each time under the table's heading and header row, with
    every row whole on one page;
  - that a model without rules has no rules section.
  - In `tests/outcomes.py`, one view's PDF has two pages.

### No line runs round one of its own cards, and a line that only jogged runs straight (clinic's reminder)

What the maintainer saw in the gallery's `examples/clinic.json`: the dashed "Texts a reminder" line, from the SMS gateway on
the right into Patient on the far left, ran left along the top, over Patient, down its far side, along the bottom and back
up into Patient's lower right port; and "Books appointments" (Patient → Booking site) jogged just before Booking site.

- **The cause was the router, not the import.** A line into a person is the importer's loop back (`loop: true`), and it
  stays: it is what keeps people first. Without it Patient lands right of the SMS gateway, and the line to Booking site runs
  back instead, round Booking site. The router took any route that crossed no line, however long, and a route round one of
  the line's own cards was one. Patient's right side has two ports, ordered by where their far ends sit, so the reminder,
  from lower down, got the lower port, under Patient's other line, and could only reach it from behind. Nothing counted
  it: the detour rule measures a route against the straight distance between its ends, and a long line goes round a card
  well within 2.5 times that; port repair starts from lines that cross, and this one crossed none.
- **The router:** a line never goes behind one of its own ends, past the side opposite its port, unless its other end is
  there (a side a model set away from it with `fromSide` or `toSide`, or a loop drawn under the boxes). It crosses instead
  where it must, and port repair, which swaps the ports of two lines that cross by a shared side, then sorts most of those
  out: the reminder takes Patient's upper port.
- **Two lines that still cross:** one takes another side, and the view is laid out once more, kept only with fewer issues.
  A line that closes a loop leaves its source on the far side and runs round the map, as a loop under the boxes does, and
  still comes in on its target's near side, as a kept pair's return line does. Of two other lines, the steeper comes into
  its target's top or bottom. Views of up to 30 cards, as `bestFlow`. On clinic's containers view the reminder now leaves
  the SMS gateway on its right, runs up past Patient records and along the top, and comes into Patient's upper right port.
  With Clinic bookings unfolded on the context view, "Sends texts" comes up past Patient records into the SMS gateway's
  bottom.
- **Port repair** tries every pair of lines. It kept the pairs it had tried by edge id, so in a model whose edges have no
  ids (r15's and r19's, like most generated maps) every pair was the same pair, and only the first was tried; r19's views
  drew differently with ids. Before routing two swapped lines again, it first moves each one's route onto the other's port,
  which uncrosses two lines that cross where they leave one side; and the line it routes first keeps off the other's stub.
- **The jog:** a line that jogs 16 px or less between two sides that face each other runs straight when one of its ends
  is the only port on its side: that port moves level with the other end, when no issue comes with it. A side's ports are
  spread round its middle, so Patient's lower port and Booking site's one port were 8 px apart.
- **Labels:** a label tries, after its five usual spots on a segment, the spots just clear of each card's stub room, tag,
  label and line beside it, so it finds a gap the five missed. Clinic's "Queues reminders" had a gap 15 px wide and sat on
  its box's border; the straightened "Books appointments" would have too.
- **The layout check** names a line that runs round one of its own ends: `edge SMS gateway→Patient runs round its own end
  "Patient"`. `check()`, the page's check and `umlimator.py check` report it, with the line and that end as its targets;
  the CLI counts it as `roundEnd`, and `--ignore roundEnd` leaves it out. The layout searches (`bestFlow`, the CLI's
  `optimize`, a hub's lane orders and an unfolded box's arrangements) score it as an issue.
- **Numbers, before → after:**
  - Lines round one of their own ends, in the browser with `--expand`, under the default font, Arial, Verdana, Georgia
    and Courier New: clinic had 3 in each font (the reminder on containers, and with Booking API unfolded; "Sends texts"
    with Clinic bookings unfolded) → 0. The other examples had none. Every example checks clean in all five fonts.
  - In Node (`layout()`): clinic's context and containers views had 1 each → 0; the bench views had 43 (b26/overview 5,
    b69/overview 8, b69/back 4, d24/boxed 3, d24/plain 3, m50/overview 11, r15/boxed 1, r15/plain 1, r19/boxed 5,
    r19/plain 2) → 0.
  - Jogs of 16 px or less, in the bench and example views: 73 → 23.
  - The bench's issues (its route audit, which counted no line round its own end before): 675 → 690. Counting those 43
    lines too, 718 → 690. Every view has as many or fewer, but b69/overview (221 → 246) and m50/overview (261 → 288), two
    made-up graphs of 69 and 50 cards over the 30-card limit, where lines that went round their cards now cross.
- **Bench views that moved** (`bench/expected.json`):
  - lines round their own ends now cross or take another side: b26/overview (91 → 82 issues), b69/overview, b69/back
    (12 → 8: the retry brought 8 lines into their targets' tops or bottoms), d24/boxed (30 → 24), d24/plain (its three
    lines from API into their targets' tops, and another of `bestFlow`'s arrangements), m50/overview (laid out again with
    room where its lines now need it, #40), r15/boxed and r15/plain (3 → 2), r19/boxed (21 → 16) and r19/plain (26 → 15;
    both also by port repair trying every pair, and r19/plain by the retry);
  - jogs straightened: b10/overview (2), s16/pay, s16/site+pay and s16/site+job+pay (Retries → Charge, Fraud check →
    Card bank), u21/teams (2), u21/orders, u21/warehouse, u21/catalog and bookshop/overview (Edge proxy → Storefront,
    Order worker → Email service). Where a straight line scores better, `bestFlow` keeps another arrangement: b69/front,
    s16/pay and u21/checkout, whose first three cards now sit level with Payments;
  - labels at a new spot, and the routes after them: s16/site+job, u21/shop, u21/orders (1 → 0 issues),
    u21/shop+warehouse and u21/teams+orders.
- **Visible behaviour changes:** a line that went round its own card takes another way: it crosses, or another side, and
  a loop back that crossed may leave its source on the far side. A short jog into a card's lone port is a straight line.
  Some labels sit elsewhere on their lines, and some plain views pick another of their arrangements. Views with a line that
  still crosses, up to 30 cards, take a layout more (b26/overview, about 30% longer).
- **API added:** the check's new issue, and `roundEnd` for `umlimator.py check --ignore`. Nothing else: no model field,
  option or type.
- **Tests** (`tests/layout.test.mjs`), each failing before:
  - a cut-down clinic model, its context and containers views: no line goes behind one of its own ends, the reminder
    comes in on Patient's right side, and the check is clean (before, it went round Patient, and the check said nothing);
  - its patient's line into the booking site has two points;
  - r19's views draw the same with an id on every edge as without;
  - clinic's api-components view checks clean in Node ("Queues reminders" sat on its box's border).

### The state machines, written down: a State chapter and a map of them

- **Docs:** "State", a chapter before the release notes, gives the four rules with an example of each from the
  code, and the `MapState` contract as it shipped: each field, when the `state` event comes and what `changed` lists, and
  where hosts and agents read it. Then each machine's states and transitions as built, with what moves it, what it
  emits and which promise settles with what: navigation, the story player, tours and replays, gestures, the page's keys
  and its link, `<umlimator-map>`'s lifecycle and the MCP server's page. Last, what `destroy()` does, in order.
- **Example:** `examples/states.json` maps umlimator's main state machines with umlimator. Its
  first view shows how navigation, stories, tours, the page and the MCP page relate; each of them has a view of its own.
  - States are cards, and transitions are lines labelled with what moves them.
  - A composite state is a box: a story shown, a dot that rides.
  - The machines that run in order are numbered (`render: "sequence"`): a move, Esc down the page's layers, and a page
    tool's run.
  - The tour view has a tour, and the story `assistant` walks a typical path, from an assistant's `show_view` to the
    reader's Esc.

  It is in the gallery, and its layout check is clean with `--expand`, in the default font and in Arial, Verdana, Georgia
  and Courier New.
- **No change** to `lib/`, the CLI or the types.

## 0.15.0: cards drawn as C4's and UML's shapes, reading aids for a view, and the page's pause in the state

Everything since 0.14.0 (#138, #139, #141):
- **Card shapes** (#138): three notations. `box`, the default, draws every card as before, picture for picture. `c4`
  draws people, browser apps, phones, databases, queues and files as the C4 model's tools draw them, and `uml` draws
  UML 2.5's actor, node, artifact, package and data store. A card's own `shape` (13 of them) wins in any notation. The
  notation comes from the model, a view, `render()`, the element, the page's toggle or the link. Switching it draws the
  cards again and lays nothing out: layout, routes, the checks and the bench see each card's box only. Import reads a
  Structurizr workspace's styles for their shape.
- **Reading aids** (#139): a box's `tone` tints its region, a line's `step` (a number or up to 3 characters) is drawn
  as a pill on it, and `--um-tint` sets how deep the tints are. In `c4` every box is a dashed boundary.
- **The state** (#141): `MapState.paused` says the page's ❚❚ is on, and the assistant's commands in `umlimator.py mcp`
  end only its own tour, never one the reader started.
- **The release's review**: 13 defects in the shapes and the aids, each fixed with a regression test (listed under
  each section).

What moves for a host that upgrades:
- **A map that names no notation draws as it did**, except that the legend's key for `external` is solid in `box`, as
  its cards are.
- **New kind words:** a card of kind `person`, `mobile` or `package` was an unknown kind (a script card, with a
  `validate()` warning). Now it is a `frontend` or `backend` card.
- **`MapState` has two more keys,** `paused` and `shapes`, and a `state` event comes when either changes.
- **The dark theme's `--um-accent-fg`** is `#0d1117`, where it was white, so text on the accent reads at 4.5:1 or more.
- **Import:** a Structurizr style's `shape` becomes the card's `shape`, a style's shape umlimator doesn't draw is listed
  in `notImported`, and `!impliedRelationships` reads Structurizr's strategy names.

Nothing is removed. Every type, option, field, fragment, event and command is as it was, or new.

### Card shapes: box, c4 and uml

> Since 0.21.0 maps draw in one card-shape style, the union of `c4` and `uml`, and the choice below is gone: see
> [0.21.0](#0210-maps-in-one-card-shape-style-the-use-case-activity-state-machine-and-interaction-overview-diagrams-the-bookshop-atlas). This section is kept as 0.15.0 shipped it.

A notation draws each card as a shape. Every shape is drawn inside its card's own box, so the layout, the routes, the
widths, the layout check and the bench hashes are the same in all three. Switching the notation draws the cards again
and lays nothing out.

- **`box`** is the default and today's look: every card a rounded box, a hook a hexagon, as before. A map that names no
  notation draws as it did, picture for picture.
- **`c4`** draws people, browser apps, phones, databases, queues and files as the C4 model's tools (Structurizr,
  C4-PlantUML, draw.io) draw them.
- **`uml`** draws UML 2.5's actor (§18.1.4), node (§19.4.4), artifact (§19.3.4), package (§12.2.4) and data store, and
  puts UML's component icon (§11.6.4) on a box as its mark, not as its outline.
- **A card's own `shape`** wins in every notation, `box` included.

**Where the notation is set**, each over the one before:

1. the model's `shapes`, for every view;
2. a view's `shapes`;
3. `render()`'s `shapes` option, the host's;
4. the standalone page's toggle, next to ◐, the reader's (box, c4, uml in turn); the page keeps it for that page, as it
   keeps the theme;
5. the link, `#shapes=c4`.

`handle.shapes` reads the notation of the view shown and sets the host's (`null`: each view's own again).
`MapState.shapes` says it, the `state` event names `shapes` when it changes, and `<umlimator-map shapes="…">` sets it
(changing the attribute draws the cards again in the map drawn, with no new load or layout). The page writes a
reader's notation into its link.

**What `c4` draws.** The kind word the model wrote comes first, then the kind it means:

| Card | Shape |
|---|---|
| kind `person`, `user` or `human` | person (a `user` is external: grey and dashed) |
| kind `mobile` | mobile (a phone on its side, as the C4 model's example draws its mobile app) |
| kind `agent` | robot |
| kind `cli` | terminal |
| `frontend` | browser |
| `database` | cylinder |
| `queue` | pipe |
| `file` | document |
| `hook` | hexagon |
| `external` | box, dashed |
| any other | box |

**What `uml` draws:**

| Card | Shape | UML 2.5 |
|---|---|---|
| kind `person`, `user` or `human` | person | actor (§18.1.4) |
| kind `agent` | robot | a non-human actor (§18.1.4) |
| `cloud` | node | node (§19.4.4) |
| kind `module` or `package` | folder | package (§12.2.4) |
| `database` | cylinder | data store (§15.4.4 names it «datastore»; the cylinder is the common picture) |
| `file` | document | artifact (§19.3.4) |
| `hook` | hexagon | (umlimator's own) |
| `external` | box, dashed | |
| any other | box, with UML's component icon as its mark when it has no icon | component (§11.6.4) |

**The 13 shapes**, all drawn inside the card's box (the gallery, `examples/notations.html`, shows each one):

- `box`: the rounded box;
- `person`: a head over a body with wide shoulders. The body starts 12 px down, or just above the highest line or feed
  that ends on its left or right side, so each one lands on it;
- `browser`, `window` and `terminal`: a title bar with three dots, then an address field, nothing, or a `>_`;
- `mobile`: a phone on its side, with a screen, a home button and a speaker;
- `cylinder`: a lid on top;
- `pipe`: a cylinder on its side, open at the right;
- `document`: a page with its corner folded;
- `hexagon`: the hook card's;
- `robot`: a square head with ears, over a body that starts 14 px down, or just above the highest line or feed that ends
  on its side (its head as much shorter);
- `folder`: a tab on top;
- `node`: a box seen in perspective.

A person's, robot's, phone's, terminal's, folder's and node's card with no icon takes a mark of its shape's own.

**How a shape keeps the engine as it was:**

- **Same box.** Layout, routing and the checks see the card's box only.
- **Ports on the outline.** Layout's ports stay on the box. The picture slides each line's end along its side's normal
  onto the outline and lengthens the end by as much, so a line meets a cylinder's lid or a person's shoulder. A tour's
  and a replay's dot ride the lines as drawn, into the shape at its outline.
- **A safe area.** Each shape names the rows its mark and text use: below a title bar, under a person's or robot's head,
  under a cylinder's lid. Where a two-line sub-line or a sub-line under a two-line name wouldn't fit, it gives way, and the
  tooltip and the details panel keep it. `umlimator.py check` measures a shape's text against that area too.
- **One outline** draws the mask, the body, the stack (two copies of the outline), the overlay and lens rings (the outline
  5 px out), the public ring, the glow and focus (on the outline, as before), the minimap and the legend's key. Exports
  (SVG, PNG, the PDF) are pictures of what is drawn, so they draw the shapes, at rest.
- **Tabs and badges** keep their places along the top. On a person, robot or folder they sit on the body's top; a head
  moves aside from them, and a title bar's dots and address field give way to them.

**The legend** shows the shapes in use. A kind drawn in one shape (data stores as cylinders, say) has that shape as its
key, and the other shapes drawn (a person, a browser app ...) have keys of their own, in a neutral outline, as colour
is the kinds'. In uml it names UML's component.

**Motion** lands on the shape. As something arrives at a card (a tour's or replay's dot, `flash()`), its accent lights:
a person's head, a cylinder's lid, a pipe's open end, a title bar, a page's fold, a phone's screen, a robot's eyes, a
folder's tab or a node's top edge. A pipe's floor carries a row of dots at the flow's speed while the flow is on. Neither
moves under reduced motion, in an instant page or in an export.

**`validate()`:**

- warns about a `shape` or a `shapes` it doesn't know;
- hints, where a view draws c4, that a `frontend` card with a person's icon (`user`, `users`, `usercheck`) and no `shape`
  draws as a browser: kind `person`, or `shape: "person"`, draws a person.

**The schema** has `shape` on a card (and in `nodeOverrides`) and `shapes` on the model and on a view, and the kind words
`person`, `mobile` (both `frontend`) and `package` (`backend`).

**Import:**

- `umlimator.py import` writes `"shapes": "c4"` for a Structurizr, C4-PlantUML or Mermaid C4 source.
- A person is kind `person`, or `user` when it is external (`Person_Ext`, or an `External` tag). Before, both were
  `frontend` or `external`; the colours are the same.
- A frontend container whose technology or name says it runs on a phone (mobile, Android, iOS, Xamarin, Flutter, React
  Native, SwiftUI) is kind `mobile`.
- A Structurizr workspace's `styles` are read for their `shape`: each element whose tags a style names takes that
  shape as its own `shape`. Where several styles apply, Structurizr's own order decides (`Styles.findElementStyle`): the
  element's tags in order, `Element` first, then its type's (`Person`, `Software System`, `Container`, `Component`), then
  its own as written; of two styles for one tag, the later; a later shape wins. Themes (`theme`, `themes`) are not read,
  and a style's other properties (colours, borders, sizes) are listed as not imported, each with its line.

  | Structurizr shape | the card's `shape` |
  | --- | --- |
  | `Box`, `RoundedBox` | `box` |
  | `Person` | `person` |
  | `Robot` | `robot` |
  | `Cylinder` | `cylinder` |
  | `Pipe` | `pipe` |
  | `Folder` | `folder` |
  | `WebBrowser` | `browser` |
  | `Window` | `window` |
  | `Terminal`, `Shell` | `terminal` |
  | `MobileDevicePortrait`, `MobileDeviceLandscape` | `mobile` |
  | `Hexagon` | `hexagon` |
  | `Circle`, `Ellipse`, `Diamond`, `Bucket`, `Component` | none: listed in `notImported` with its style's tag, and a card it falls on is drawn as it would be without it |

- A C4-PlantUML tag's `$shape` (`AddElementTag(..., $shape=RoundedBoxShape()|EightSidedShape())`) is not drawn; it
  is listed in `notImported`.
- `examples/clinic.json` is imported again: its notation and its two people, and, from its styles, its people's
  `person` shape and its database's `cylinder`.

**The examples' people** are kind `person`: the bookshop's Shoppers, and bike-share's Riders and Operations team.
In `box` they look as before (a `person` is a `frontend` card); in `c4` and `uml` they are people, not browser apps.

**Behaviour changes:**

- **The legend's key for `external` is solid in `box`,** as its cards are. It was dashed while the cards were solid, since
  the first commit. In c4 and uml, external cards are dashed and so is their key.
- **New kind words.** A card of kind `person`, `mobile` or `package` was an unknown kind (a script card, with a
  `validate()` warning). Now it is a `frontend` or `backend` card.
- **A view's `shapes` lays nothing out:** it is left out of the key that decides whether a view is laid out again.

**API added:**

- `render()`'s `shapes` option and `handle.shapes`;
- `MapState.shapes`;
- `<umlimator-map shapes>`;
- the page's toggle, `#shapes=` and its kept choice;
- the types `Notation` and `Shape`;
- `shape` on a card, and `shapes` on the model and a view.

**Fixes from the release's review** (each with a regression test):

- An overlay's or lens's badge tab sits on a person's, robot's or folder's tab line, as the card's own tabs do. It sat at
  the box's top. After the card's own tabs, it takes the first place inside the card clear of a head (a robot's ears
  too), ⤢, the change badge and a folder's tab, else the place inside it that covers least of them.
- A badge's keyboard focus ring (a host that listens for `click`) is round its tab on those shapes. It was drawn above.
- A step's number on a card (a numbered or process view) sits on the shape's tab line too, on a person's or robot's
  shoulder, not in the air above it; but no lower than 16 px above the highest line or feed into the card's left side
  (and no higher than the box's corner, where it was), so it covers no arrow.
- A line or feed that ended on a robot's or person's side above its body ended in the air: a 42 px script card's upper
  port, a port that a short jog moves level with the line's other end, the top one of four feeds. The body now starts
  just above the highest line or feed on either side, as laid out, and a robot's head is as much shorter.
- A view's intake (feeds) lines end on the outline, as other lines do. They stopped at the box's side, up to 8 px short
  of a hexagon and 5 px of a person.
- A line onto a robot head's rounded corner, and a line or feed into a folder whose tab sits after the card's own tabs
  (or into its right side's top), ends on the outline. They ended up to 2 and 4 px off it.
- In uml, a card whose `icon` the model's `icons` table does not have shows UML's component mark, and now the legend
  names it too.
- In `box`, a card's own `shape` has its overlay and lens rings on its outline, is drawn as its shape in the minimap,
  and a tour's or replay's dot rides its lines into the outline, as in c4 and uml. They treated it as a box.
- `validate()` warns about a `shape` it doesn't know in a view's `nodeOverrides`, as on a card.
- A `shape` or `kind` such as `constructor` or `__proto__` is no shape and no kind: `validate()` warns, and the card is
  drawn by its kind, or as a script card. Drawing it threw.
- Import: a Structurizr software system or component, or a C4-PlantUML `Component`, whose words make it `frontend`,
  `mobile`, `database`, `queue` or `file` keeps that kind (its colour) but gets `shape: "box"`, so c4 draws it as
  Structurizr does, not as a browser, a phone, a cylinder, a pipe or a page. Only a container takes a shape from its
  words; a `SystemDb` or `ComponentDb` is still a cylinder.
- Import: `!impliedRelationships` reads Structurizr's strategy names: `false` (any case), `none` and
  `DefaultImpliedRelationshipsStrategy` draw no implied lines; `true` and
  `CreateImpliedRelationshipsUnlessAnyRelationshipExistsStrategy` draw one per pair, unless a relationship joins the
  two; `CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy` draws one per description, unless a relationship
  with that description joins them. Any other value is listed in `notImported` and drawn as Structurizr's default
  (unless any). Before, anything but a lowercase `false` turned them on, unsaid.

**Tests:**

- `tests/shapes.html` runs under reduced motion. For each shape in each notation it checks that the shape is inside its
  box, that its ports and lines' ends are on its outline, and that its text is in its face. It also checks that a change
  of notation keeps the same geometry, camera and selection; the state event; `update()`; exports; the legend; rings;
  the minimap; validate(); the element; and the page's toggle, link and kept choice.
- `tests/motion.html` checks the accent and the pipe's floor with motion on.
- `tests/shapes.test.mjs` checks that every example and two benchmark models lay out the same in all three notations,
  and checks validate()'s warnings.
- `tests/import.py` checks the notation and kinds `import` writes.
- The bench's `--expect` is unchanged, and the box notation's stills of bookshop and bike-share are byte for byte as
  before.

### Reading aids: a box's tone, a step on any line, and how deep the tints are

The ByteByteGo half of the card-shapes decision: three small hooks that say how to read a view, in any notation. Logos
and a heavier main path were there already (a card's `icon`, a line's `weight`). The bookshop's new `checkout` view
shows the tone and the steps with them; `--um-tint` is the host's to set.

- **A box's tone** (`containers[].tone`): a palette name, as a badge's (`--um-<tone>`).
  - The region behind the box is tinted in it: 7% of the tone over `--um-panel`, opaque, under the box's border and
    behind its cards. A box without a tone is the faint panel it was.
  - Its border is dashed, in the tone at 60%. Its title is in the tone mixed a quarter with `--um-text`, which keeps it
    at 4.5:1 or more on its region in both themes; in the tone alone, amber's title would be 4.45:1 in light.
  - A tone the theme does not define is drawn in slate. A selected box, and an edit's drop target, are outlined in the
    accent as before.
  - The minimap draws each region under the rest, and the exports (SVG, PNG, the PDF, stills) keep it, resolved as every
    colour is.
- **A step on any line** (`edges[].step`): a number, such as 2, or 2.1 for a step within step 2, or text of up to 3
  characters, such as 2a.
  - It is drawn as a numbered view draws its run order: a circle at the start of the line's label for one character, a
    pill for two or three (2a, 12, 4.1), or alone on a line with no label. A numbered view (`render: "sequence"`) still
    numbers its lines in run order, whatever their step.
  - It shows as written everywhere: the mark, the line's name and title, `describe()` and the PDF.
  - Where steps order lines (the PDF's table of lines), numbers go by value and text by its leading number, then the
    rest: 2 < 2a < 2b < 3 < 10. Lines without a step come last.
  - It is in the line's accessible name ("Step 2: Line from Storefront to Shop API: checkout (JSON over HTTPS)") and its
    title, as a numbered view's are; in `describe()`, which says `Storefront calls Shop API ("checkout", JSON over
    HTTPS, step 2).`; in the details panel; and in the first column of the PDF's table of lines.
  - A model edge's step shows in every view that draws the edge; a view's own edge (an object in its `edges`) numbers it
    in that view only. Lines drawn as one (parallel, or A→B with B→A) show the first one's step and list each in their
    title; a view's `keepPairs` draws each with its own.
  - **Room:** a numbered line with no label gets a gap wide enough for its mark between neighbouring columns, 22 px with
    27 px of line on each side, as a labelled line gets one for its label; before, it got none. Where a label has no
    room, the line shows its number alone and keeps the label in its title, as numbered views always have: a view's
    `gap` or `rgap` gives it room.
  - **The layout check knows the mark:** `check()` and the page's check say when a mark with no label leaves its line
    less than 16 px, as they say it of a label, and the page's check reads the number as an edge label's text, so a mark
    on a card or on another label is found.
- **`--um-tint`**: how deep the tints are, a card's and a box's. 1 is the default (as before), 0 none, 2 twice as deep.
  - The map mixes every kind's tint as `min(its % × --um-tint, 18%)` of the colour: past 18%, a card's sub-line would
    fall below 4.5:1 (on the hook's red in light, the lane's teal in dark).
  - The theme file declares it on `:root` only, so a value a host sets on the map or above it wins. A tint a host sets
    itself (`--um-<tone>-f` on the map element, #29) stays as set.
  - The accent's tint (a hub's tags, the menus) and the details panel's PUBLIC tag keep theirs: their text is in their
    tone, which a deeper tint would take below 4.5:1.
- **In `c4`, every box is a boundary**, dashed as Structurizr and C4-PlantUML draw one (7 on, 5 off, in its border
  colour). A box with a tone stays tinted and dashed, in any notation; `box` and `uml` leave a box without one solid.
  The minimap draws the dashed boxes dashed, and the exports keep the dashes.
- **Step numbers read at 4.5:1 or more in dark.** The dark theme's `--um-accent-fg` was white, 3.1:1 on the dark accent
  (`#4493f8`); it is `#0d1117` now, 6.1:1. The light theme is unchanged (white, 5.2:1).
- **`validate()`** warns when a step is neither a number of 0 or more nor text of 1 to 3 characters (it is drawn as
  written), and when a tone is not a name (the box is drawn in slate, or as a plain box when the tone is empty).
- **The example:** the bookshop's third view, `checkout` ("Checkout, at a glance"), reads like the proposal's blend: six
  numbered steps, the main path at weight 2 with a tour along it, the web tier and the order handling as cyan and orange
  boxes, Payment provider below in a column of its own, and the bookshop's logos. Its layout check is clean in the
  browser and in Node, and under Arial, Verdana, Georgia and Courier New, with every label whole.
  `examples/embed.html`'s host palette sets `--um-tint: 2`.
- **Visible behaviour changes:** none for a model without these fields, but:
  - a numbered view's line with no label gets the room above (no view in the bench or the examples has one);
  - the check reads more: the mark of a numbered line with no label, and every step's number in the page's check (it
    finds nothing new in the examples);
  - the details panel's PUBLIC tag mixes its tint itself (8% of `--um-k-public`, the colour it had), so a host's own
    `--um-k-public-f` no longer reaches it;
  - in dark, the numbers in numbered views' step circles and swimlane circles, and in the page's views list, are dark on
    the accent instead of white; so is the icon on the details panel's kind tile (5.6:1 to 7.5:1, where white was 2.5:1
    to 3.4:1). A host that sets its own `--um-accent-fg` keeps it;
  - a step of two characters (10, 12) is a pill where it was a circle, so assistant's numbered view lays its tenth
    line's label out a little wider (no bench view has one);
  - in `c4`, boxes are dashed.
- **API added:** `edges[].step` (a number or short text), `containers[].tone` and `--um-tint`, in the schema,
  `lib/umlimator.d.ts` and the README.
- **Bench:** unchanged (`bench/expected.json`). It times the new `bookshop/checkout`, which has no recorded geometry.
- **Tests:**
  - `tests/aids.test.mjs` (Node): `validate()` on steps and tones; a box's tone in the geometry; a step drawn in any
    view, and run order winning in a numbered one; lines drawn as one; the room for a mark with no label (76 px where it
    had 66); `describe()`; text steps (2a drawn as written, a circle for one character and a pill for two or three); the
    bookshop's checkout, with every label whole and a clean check.
  - `tests/aids.html` (browser, light and dark): a region's colour, opacity, dashed border and title, and its title at
    4.5:1 or more at `--um-tint` 1 and 2; an unknown tone, a box with none, the regions under the cards, a selected box;
    `--um-tint` at 0, 1, 2 and 5 on a card and a region, the accent's tint left alone, a host's own tint kept; steps
    drawn with a label, alone and as a pill, their name and title, the page's check reading them, run order in a
    numbered view, a text step (5a) as written; the minimap; the SVG in both themes; boxes in c4, uml and box (picture,
    minimap and SVG); `update()` dropping the tones.
  - `tests/contrast.html`: boxes in every palette tone, holding cards of every kind, at `--um-tint` 1 and 2, light and
    dark; and now the numbers on circles: steps on a view's lines (1, 2a, 3.1), a numbered view's, and weather's
    swimlane numbers, which fail on the old dark theme at 3.1:1. The arrow between swimlanes is a graphic and is held to
    3:1.
  - `tests/cli.py`: the PDF's table of lines gives each line its step, in step order (2, 2a, 10, then none).
- **Fixes from the release's review** (each with a regression test):
  - A text step goes into its line's title escaped. A step such as `1<b`, which validates, put every card inside that
    title, so the map showed none.
  - A→B and B→A drawn as one two-way line list each in their title with its step (`1. asks`, `2. answers`), as
    parallel lines do. B→A's step was on no drawn line.
  - The minimap draws a box in a tone the theme does not define in slate, as the picture does, and in c4 with its
    dashed boundary. It was black, with no border.
- **Left out:** a legend entry for steps or regions, and a view's tour riding its steps.

### The page's ❚❚ is in the state, and the assistant's commands end only its own tour (#131, #132)

Both gaps were found while writing the State chapter (#129).

- **The page's ❚❚ is in `MapState` (#131).** ❚❚ holds every clock, but `handle.state` didn't say so. Under it
  `story.playing`, `replay.playing` and `tour` stayed `true` while nothing moved, and no `state` event came, so an agent
  reading `page_state()` couldn't tell that the page was paused.
  - `MapState.paused` is `true` while the standalone page's ❚❚ is on. A `state` event comes each way, with `paused` in
    `changed`, and none when the page sets the value it already has, as it does on each new picture.
  - Each machine keeps its own state under it. `story.playing` is the player's (it goes on by itself) and
    `replay.playing` the replay's, so `playing: true` with `paused: true` is a story or a replay that would play, held
    by the page. `flow` stays as the reader or the host set it.
  - `tour` is `true` while a tour's dot is on the map, riding or held, whether by ❚❚ or by its story's pause. Its type
    said "riding".
  - A map that no page holds, such as a host's `render()`, reads `paused: false`.
- **The assistant's commands end only its own tour (#132).** The page that `umlimator.py mcp` serves kept the number of
  the assistant's last tour after that tour had ended. So its next command with no tour (`highlight`, `show_view`,
  `clear`) called `tour(null)` and ended whatever rode then, such as the step's tour of a story the reader had started.
  - The page now holds the assistant's tour only while it is on the map: until its dot reaches the end, or is cut
    short or replaced.
  - Under reduced motion, a path lit at rest stays the assistant's until a story's step or end takes its place, so
    `clear` still takes it off.
  - Each tour still starts once. A page never plays an ended tour again, even when a command comes before the server
    hears that the tour ended.
  - Stories were already safe, and stay so.
- **Visible changes:** `handle.state`, the `state` event and each page in `page_state()` have `paused`. The assistant's
  `highlight`, `show_view` or `clear` no longer stops a tour that the reader's story rides.
- **API added:** `MapState.paused: boolean`. No type, flag, event shape or model field changes. The comments on
  `MapState`'s `story`, `tour` and `replay` now say what each means under ❚❚.
- **Docs:** the State chapter says the same: the `MapState` table, the story player's and the trips' tables, and the MCP
  server's page.
- **Tests:**
  - `tests/motion.html` puts ❚❚ over a playing story with its step's tour, then over a replay. It reads `paused`, and
    one `state` event each way.
  - `tests/state.html` lists the new key.
  - `tests/mcp.py`: the reader's story rides a step's tour through the assistant's next command. Under reduced motion the
    story's path stays lit through it, and `clear` still takes the assistant's own path off.

  Each check fails before this change.

## 0.16.0: lines that cross less round busy cards and under boxes, labels that keep their words, and the page's reader

Everything since 0.15.0 (#146, #147, #148, #150):
- **Routing** (#128, #111, #149): a loop under the boxes comes up beside its target into its near side; lines into a
  card that six or more lines come into are routed first, and those that still cross go round the outside or move
  their target to the foot of its column; of two cards that feed the same two, one line goes round the outside.
  `examples/monorepo.json` and its generator `examples/monorepo.py` are new.
- **Labels** (#108, #142, #144): a label whose spots are taken moves the one before it aside; a label on a box's
  border, cut to its step or with no spot gets room where it sits, the view laid out again and kept when it is better;
  the check names a label that shows only its step; a card's step sits on a person's or robot's shoulder.
- **The page and the reader** (#133 to #137): search finds what an `update()` brought; messages have a live region of
  their own and show on a phone; ◐ says which theme is on; the link leaves out `check` and `shot`; Escape and ↑ go back
  the way the reader came.
- **The bench's layout-check issues:** 690 → 655. No view has more.

What moves for a host that upgrades:
- **Pictures move where lines crossed or labels had no room:** some lines take other tracks or go round the outside,
  some labels sit elsewhere on their lines, and some views with a label that had no room are wider or taller. A host
  that compares stills or geometry with a recorded copy records them again. Each section below names the views that
  moved.
- **Layout can take longer** on views of up to 30 cards where lines still cross: up to 18 layouts more. r19/plain's
  total went from 1.7 s to 2.3 s in the bench; views with no crossing left cost what they did.
- **Up after `setView()`** goes back to the view the map came from, not to the view's parent in the model.
- **The hint line** is no longer a live region; the element after it is. ◐ is named "Dark theme", with `aria-pressed`.
- **The link** drops `check` and `shot`.
- **`umlimator.py check`** reports a new issue, a label that shows only its step, counted as `labelNoRoom`; a label on
  a box's border is counted as `labelOnBorder`, no longer as `other`. Both take `--ignore`.

Nothing is removed. Every type, option, field, event and command is as it was, or new.


### Loops under the boxes come into their target's near side, lines into a busy card route first, and a line goes round two cards that feed the same two (#128, #111)

- **What was wrong.**
  - **A loop under the boxes (#128).** A line that closes a loop out of a box runs under the boxes: out its source's
    right side, down past every box and card in its way, and left along the bottom. It then came up into its target's
    bottom, the far side from where it came. #127 brought routed loops into their target's near side; loops under the
    boxes were left as they were (weather's check view, s16's unfolded pay, b26).
  - **Lines into one busy card (#111).** Lines were routed shortest first. Lines into a card that many lines come into
    were often routed after the lines round it, which had taken the tracks by the card, so they crossed them on the way
    in. r19's logger has seven lines in, and most of r19's crossings were by one of them.
  - **Two cards that feed the same two cards (#111).** In the made-up monorepo of r15, web and admin both import kit and
    api-client. Drawn left to right with every line between facing sides, two of those four lines must cross, whatever
    the order of the cards. The retry #127 added moves a line onto its target's top or bottom, which doesn't help here,
    so the map had a crossing in the plain view in every font, and in the boxed view under Verdana and Georgia.
- **What holds now.**
  - A loop under the boxes comes up the gap right of its target and into its near side, at the lowest port there, below
    the side's other lines. Where that would cut through a card, it comes up into the target's bottom as before, and
    where that would too, the router takes it. Two loops into one card nest: the outer one comes up nearer the card,
    into the lower port.
  - Lines into a card that six or more lines come into are routed first, in the order that nests them (#49), and the
    other lines go round them.
  - When lines still cross after #127's retry, on a view of up to 30 cards, one line goes round the outside: out its
    source's far side and into its target's top (or bottom), round the cards between. The candidates are the lines of
    two cards that both feed both ends of a crossing pair, then the crossing lines themselves. Up to four layouts more
    are tried, and the one with the fewest issues is kept.
- **Example:** `examples/monorepo.json`, the r15 monorepo, with its generator `examples/monorepo.py`, which writes the
  model from a list of imports: a card per package, a box per folder, nested as the folders are, and the same cards with
  no boxes. Its page checks clean in the default font and under Arial, Verdana, Georgia and Courier New.
- **Visible changes.** The loops under the boxes in weather's check view, s16's site view with pay unfolded (and with
  job and pay), and b26's overview come into their target's right side. b26 has two more of them: n11 → n20 and
  n02 → n10 came up through a card on the old way, so the router took them; now they run under the boxes. Lines into
  r19's logger, and into m50's busiest cards, take other tracks. In d24's boxed view and r15's plain one a line goes
  round the outside. No other example moves.
- **API added:** none. No type, option, model field or event changes.
- **Bench**, layout-check issues before → after (b69/back has the same count with another picture; the other views draw
  as before):

  | View | Issues | Total ms |
  |---|---|---|
  | b26/overview | 82 → 81 | 620 → 793 |
  | d24/boxed | 24 → 12 | 198 → 171 |
  | m50/overview | 288 → 268 | 1,032 → 1,019 |
  | r15/plain | 2 → 0 | 165 → 159 |
  | r19/boxed | 16 → 12 (crossings 15 → 10) | 271 → 421 |
  | r19/plain | 15 → 13 | 667 → 1,646 |
  | b69/back | 8 → 8 | 224 → 473 |
  | s16/site+pay, s16/site+job+pay | 0 → 0 | |

  In all, 690 → 649. The extra layouts cost time where lines still cross: r19/plain most, which gains nothing from them.
- **Tests** (`tests/layout.test.mjs`; each fails before this change): weather's check view brings its loop into
  Readings' right side at the lowest port and checks clean, and b26's two loops into n21 nest; r19's views have at most
  12 and 13 issues; the monorepo example checks clean, with one of web's and admin's lines out its card's far side.
- **What is left of #111: r19's logger.** Lines into it still cross other lines: 5 crossings in the boxed view and 6 in
  the plain one involve a line into logger. Placing logger elsewhere doesn't clear them: with every other card where it
  is, each free slot in the view gives at least 5 such crossings in either view (the boxed view's current slot is the
  best). In the plain view api, db and logger sit in one row, so api's line into logger must pass db, under it or over
  it, and a line from worker into db's bottom, or from auth into db's top, then crosses it. Clearing them needs a
  crossing-aware order of the whole view's rows and columns, not the router.
- **u21's Catalog unfolded** on its shop view checks clean in the browser in all five fonts. Node's text estimate still
  finds one label ("orders") 10 px from its line's end, which is label placement (#108).

### The page and the reader (#133 to #137)

- **Search finds what an `update()` brought (#133).** The page indexed its cards and views once, on mount. After an
  `update()` that added "Pager duty", searching "pager" said "Nothing called “pager”. Did you mean Pager duty?". Search
  now reads the model shown, and an `update()` that leaves the view's picture as it was hands the page the new model
  too.
- **Messages have a live region of their own, and a phone shows them (#134).** The hint line was the live region, and
  each message ended by writing the key hints back into it, so a screen reader heard them after every message. At a
  phone's width the line was hidden, messages with it. Now the line is not live; a polite live region beside it says
  each message. At 820 px or less the key hints stay hidden and a message shows as a toast at the foot of the map. The
  same holds for `render()`'s `hints`.
- **◐ says which theme is on (#135).** It is named "Dark theme" and is pressed (`aria-pressed`) while the page is dark,
  following the system's theme when the page sets none.
- **The link leaves out `check` and `shot` (#136).** A page opened with `#check=1` wrote `check=1` into every link, so
  Copy link from a check run shared a page in check mode. The link keeps `reader` and drops the one-run modes.
- **Escape and ↑ go back the way the reader came (#137).** In a bare `render()` they went to the view's parent in the
  model, a view a reader whom `setView()` or a story's step brought along may never have seen. `render()` now keeps
  the views walked through and goes back along them, then to the parent in the model. The page keeps its breadcrumbs.
- **Visible changes:** the hint line has no `role="status"` or `aria-live`; the live region is the element after it.
  ◐'s label is "Dark theme", with `aria-pressed`. Up after `setView()` goes to the view the map came from.
- **API added:** none. No type, option, event shape or model field changes.
- **Docs:** the State chapter says how up chooses its view, which keys the link keeps, and the hint line's live region.
- **Tests:** `tests/page-state.html` (search after `update()`, the hint line at 400 px, ◐, `#check=1` and `#shot=1`),
  `tests/embed.html` (Escape and ↑ after `setView()`), `tests/pieces.html` and `tests/marks.html` (the message's live
  region). Each new check fails before this change.

### Labels keep their words and keep off box borders, and a card's step sits on its shape (#108, #142, #144)

- **What was wrong:**
  - **Labels side by side** (#108): two labelled lines that leave a card 16 px apart, too close for their labels to
    stack, each put its label in the middle of its line. The second label then had no room, and showed only its step,
    or was squeezed onto a box's border. The assistant example's "a draft", whose line jogs 16 px into Check, showed only
    its 6 beside "writes with".
  - **Labels between box borders** (#142, #108): a line from a card in one box past a card in another crosses two
    borders. Between them there was too little room, so its label sat on a border or showed only its step. Wider fonts
    made it worse: a short label such as "Sends" sat on both borders under Arial, Verdana, Georgia and Courier New.
  - **The check** said nothing when a label showed only its step. It named a label on a box's border, but the CLI
    counted that as `other`.
  - **A card's step** (#144): a step's number keeps 16 px above the highest line into its card's left side, so it
    covers no arrow. When that line ends 16 px or less below the card's top, the number went up to the box's corner,
    about 4 px above a person's or a robot's shoulder.
- **What holds now:**
  - **A label moves another one aside:** when every spot on its line is taken by a label placed before it, that label
    tries each of its other spots in turn until both fit, each with its words.
  - **The layout makes room:** a label that sits on a box's border, shows only its step, or finds no spot asks for room.
    The column gap the label sits in widens by its width, or else the row gap by its height and 14 px. A label in
    neither, or with no spot, widens the gap that its line's longest run crosses, a column gap first. This room comes
    on top of what keeps boxes apart. The
    view is laid out again with it, rip-up tries included, and that layout is kept only if it has fewer issues and
    fewer labels cut to their step.
  - **The check names what is left:** `check()` and the page's check report
    `label "hands over job 0" has no room on edge A→T0: only its step 1 shows`. `umlimator.py check` counts it as
    `labelNoRoom`, and a label on a box's border as `labelOnBorder`. `--ignore` takes both.
  - **The step sits on the shape:** where its number has to stay that high, a person's or a robot's shoulder comes up
    under it, 5 px below its middle. The head is as much shorter.
- **Numbers, before → after:**
  - The page's check, with `--expand` (not for b26, b69 and m50), on every bench model, example and import sample,
    under the default font, Arial, Verdana, Georgia and Courier New:
    - labels on a box's border: 1 in each font (u21, shop with orders unfolded: "orders") → 0;
    - labels that show only their step: 0, and the new check finds none;
    - all issues: 691 → 656 in the default font, 667 → 635 in Arial, 667 → 666 in Verdana, 678 → 652 in Georgia, 665 →
      644 in Courier New. All of them are in the bench's made-up graphs, and only b69 under Verdana has more (249 → 251).
      Every example and import sample checks clean in all five fonts, as before.
  - The bench's issues (its route audit): 690 → 682. No view has more: m50/overview 288 → 282, u21/shop+orders and
    u21/shop+orders+o-checkout 1 → 0 ("orders" sat on Order service's border).
- **Bench views that moved** (`bench/expected.json`):
  - laid out again with room for a label: s16/pay ("declined" showed only its 3) and the views that unfold into it
    (s16/site+pay, s16/site+job+pay), u21/shop+orders and u21/shop+orders+o-checkout;
  - a label moved aside for another: bookshop/api ("paid order" makes room for "checkout", which showed only its 2),
    u21/shop, b69/overview, b69/back and m50/overview;
  - bookshop/checkout is in the file now, as the bench's own update writes every view; its geometry is as it was.
- **Visible changes:** some labels sit elsewhere on their lines. Some views with a label that had no room are wider or
  taller where it now fits. A person's or robot's shoulder is higher when a step sits on it and a line comes in on its
  left near the top.
- **API added:** the check's new issue, and `labelOnBorder` and `labelNoRoom` for `umlimator.py check --ignore`. No
  model field, option or type changes.
- **Tests:**
  - `tests/layout.test.mjs`: models made for each case: a numbered line past two box borders, with a short, a middling
    and a long label; and two lines that leave a card 16 px apart, one jogging into its target. Every label keeps its
    words and the check finds nothing. u21's shop with Orders unfolded has no label on a border. Another test is six
    numbered lines down one column, whose labels have no room: the check names each one.
  - `tests/aids.html`: the same models under Arial, Verdana, Georgia and Courier New. No label is cut or on a border.
  - `tests/embed.py`: the CLI counts a label that shows only its step as `labelNoRoom`, and `--ignore` takes both kinds.
  - `tests/shapes.html`: the step test's model, whose left ports are 16, 32 and 48 px down, now also checks that each
    step's number touches its person's or robot's shape, in c4 and uml.

  Each check fails before this change.

### Lines into a busy card go round the outside, or its target to the foot of its column (part of #149)

- **What was wrong (#149).** r19's logger has seven lines in. After #111 its lines still crossed others: 5 crossings in
  the boxed view and 6 in the plain one involved a line into logger. The graph can't be drawn without some crossing, and
  in columns one is forced (search and api both feed schemas and logger), so the aim is fewer, not none.
- **What holds now.** On a view of up to 30 cards where lines into a card that six or more lines come into still cross
  another line, after #111's tries, the lines of those pairs are tried one at a time, first pair first: out its source's
  far side, into its target's far side (round the outside, as #111's two cards that feed the same two), or with its
  target moved to the foot of its column, under the column's other cards that have lines. A layout with fewer such
  crossings and no more issues is kept, and the next tries start from it. At most 14 layouts more; the view keeps the
  result only when it has fewer issues than before the search. bestFlow's tries of a plain view's ways don't run it; the
  way it keeps does.
- **Visible changes.** In r19's boxed view, api's lines into auth and schemas, worker's into db and db's into schemas go
  round the outside, and queue sits at the foot of its column; in its plain view, search's line into schemas leaves
  search's far side. No other bench view or example
  moves: none other has a card with six lines in on a view of up to 30 cards.
- **API added:** none. No type, option, model field or event changes.
- **Bench** (`bench/expected.json` written again by `bench.py --write-expected`), before → after:

  | View | Issues | Crossings into logger | Total ms |
  |---|---|---|---|
  | r19/boxed | 12 → 7 | 5 → 1 | 585 → 1,270 |
  | r19/plain | 13 → 10 | 6 → 3 | 1,715 → 2,281 |

  In all, 663 → 655.
- **Test** (`tests/layout.test.mjs`, fails before this change): r19's lines into logger cross 1 time in boxed (7
  issues) and 3 in plain (10 issues).
- **What is left of #149: r19/plain.** Its last three crossings into logger (api → queue with search → logger, worker →
  db with api → logger and auth → logger) don't clear by a line's side or a card's row: trying every side at both
  ends of each line in those pairs, and each end at the top or foot of its column, stays at 3. They clear when search moves next to db (column 2) and the
  rows are levelled again around it (2 crossings, 11 issues), which is a placement change, not a routing one.

## 0.16.1: validate() warns of a line from a card to itself

- **`validate()`** returns a warning for a line whose `from` and `to` name the same card or box, in the model's lines
  or a view's: `a line from "a" to itself: not drawn`. No view draws such a line, and until now nothing said so
  (`docs/diagrams/risks.md` F1). Typed diagrams will draw one as a loop; maps keep leaving it out.

What moves for a host that upgrades: a model with such a line gets one warning per line from `validate()`, from the MCP
server's `validate` tool and in the playground. Nothing is drawn differently; no geometry changes.

## 0.17.0: the foundation for typed diagrams: schema version 2, commands, and the layout, notation and editing they will use

Stage 1a of the plan for 28 diagram types (`docs/diagrams/`). Nothing new is drawn, and every map draws as it did.

- **The module is built from sources (1.1, #157).** `lib/umlimator.js` is now written by `npm run build`
  (`tools/build.mjs`, no dependency) from 21 files under `src/`. It holds the same statements as 0.16.1's, in another
  order, and it is still one file with no imports, so a host loads it as before. CI fails when it is stale.
- **Schema version 2 and `migrate()` (1.2, #158).** A model may say `"schemaVersion": 2`: it may then hold typed elements
  (`type`, `parent`, `props`, `members`) and typed views (`diagram`, `subject`, `direction`, `present`), as
  `docs/diagrams/model.md` describes. The JSON Schema and the types describe these fields without constraining them,
  so no map that passed before fails now. A model with no `schemaVersion`, or with 1, is a map, read as before.
  - `migrate(model)` returns the model at the version this release reads. Versions 1 and 2 come back unchanged: lines
    with no id keep their positional names. A newer version throws.
  - `validate()` reports a newer `schemaVersion` as an error, so a model written by a later release is not drawn wrongly
    without a word (F6). Any other value that is not 1 or 2 is a warning, and the model reads as a map.
  - On a version-2 model `validate()` checks typed elements, lines and views by the typed core's rules (ids in one space,
    types, ownership and its cycles, line ends on members) and the rest by a map's, as before (1.3).

- **Diagram types (1.3, #160).** A typed view's `diagram` picks its type. A view with none is a map and takes exactly the
  path it always has; so does every view of a version-1 model, whatever its fields. This release draws no typed
  diagram yet: a typed view is drawn as plain cards, its nodes as cards and its typed lines between them (a line that
  ends on a member is drawn to the node that owns it), with a warning in the console and from `validate()`. The model
  is kept as it is. The registry is internal until the types settle.
- `layout()`, `render()` and the other drawing calls refuse a model whose `schemaVersion` is a whole number above 2
  (they throw, with the message `validate()` gives) rather than draw it wrongly. Any other value that is not 1 or 2
  (0, 1.5, "2") is a warning, and the model draws as a map, as it did.
- **Commands (1.6, #161).** `apply(model, commands)` runs a transaction (one command or a list) on a copy and returns the
  new model; the one given is never changed, and a command that cannot run throws with none of the transaction
  applied.
  - `set { id | view, path, value }`: a field, by a dotted path or a list of keys (`['present', 'order.total', 'rows']`);
    through objects only. `id`, `members`, `parent`, `from` and `to` are not set: they have their own commands.
  - `add { element, owner?, index?, view? }`: a node, a line, or a member of `owner`, at `index`; `view` shows it there.
  - `move { id, index, owner? }`: a member to another place, or to another owner, keeping its id and lines; with
    `view`, an element or line to another place in that view's order.
  - `hide { id, view }`: out of one view, with all the view says of it (its place, pin, `present`, box, tour, the view's
    lines to it, the story steps on that view); the model keeps it. A line that lives only in that view goes with it.
  - `delete { id }`: out of the model with its members, what it owns, the lines to them (and lines to those lines),
    and every place that names them; a lens or rule that named only it picks nothing. An id already gone earlier in the
    same transaction is passed over, so a selection deletes in one transaction.
  - `reparent { id, parent }`: a new owner, or none with `null`; never into itself.

  Undo is the model before, which `history()` keeps: undo and redo give back byte-identical models. `references(model,
  id)` lists every place that names an element, as a list of keys and a kind, for a host with a store of its own. What
  a type's own properties name (a message's `replyTo`, a timeline) is the type's to keep, from its stage. The canvas
  emits these commands from 1.7.
- **The command line and the page on typed models (1.8, #162).** `render`, `check`, `stills` and `pdf` work on a version-2
  model: the upstream engine's check is shown each member as a card, so a line may end on one (F3); the page's search
  for row orders bakes no layout into a typed view (F4). The CLI's page inlines `lib/umlimator-all.js`, a second whole
  file built from the same sources with every diagram family in it (`umlimator/all`); until a family ships it holds the
  same code as `lib/umlimator.js` (F5, stage 1 note §2.5).
- **The layout for typed views (1.4, #163).** Internal until the class type draws with it (1.9), and off for every map, which
  lays out as it did: rows as tall as their tallest node (stage 1 note §4); a line from a node to itself drawn as a loop
  on its top right corner, with its label (F1); lines between one pair each with their own ports and label (F2), which
  laid out down fan out to lanes of their own, as their labels are wider than the lines are apart;
  `direction: "down"`, a left-to-right layout with every box turned, transposed (§6); and a geometry key, so that an
  edit that moves nothing (a colour, a `props` field) repaints without laying out or routing again (F7). The unused
  `autoLayout` and `hubLayout` are gone.
- **Notation (1.5, #164).** The drawing code learns UML's notation, used only where a typed view's drawing asks for it, so no
  map draws differently: every shape reports `size(n)` and `ports(n, side, k)` (line ends spread along a side, on its
  outline), and a typed view's node is drawn in the shape it names; a classifier shape (stereotypes, the name in italics
  when abstract, a compartment per member kind with rows in UML's form, static members underlined, derived ones marked
  "/", `collapsed` and `rows` applied, text cut to the box); a table of line ends (open and filled arrow, hollow
  triangle, hollow and filled diamond) and dashed lines; role and multiplicity by each end, in boxes clear of their line
  and its nodes, which layout can avoid. Internal until a class view draws with it (1.9).
- **Editing typed views (1.7, #165).** With `editable`, a gesture on a typed view of a version-2 model (`diagram` set and not
  `'map'`) emits an `edit` event, `{ view, commands }`: one transaction of the commands above, for the host to apply
  with `apply()` and hand back with `update()`; nothing is drawn before. One transaction per committed field, per drag
  and per multi-select delete (E2). Map views, and every view of a version-1 model, emit `change` exactly as before and
  get no new markup; a read-only embed gets none either. The gestures and keys are in `docs/editing.md`. A typed view
  also shows panels over the map's left side, driven by its type's definition (internal fields of the registry):
  a palette (`elements`), the relationship picker (`lines`), properties (`props`, per element type) with the element's
  member rows, the problems `validate()` finds in the view, and the outline of every element with an "in no diagram"
  filter (M5). A type this release does not draw has one generic node and one generic line, `core.Node` and `core.Line`.

- **Also in this release:** `validate()` warns of a line from a card to itself, which no view draws (0.16.1, #155); the
  browser tests give their motion pass more time (#159).

What moves for a host that upgrades:
- **Nothing is drawn differently.** Every map's geometry, every example's stills and every test of 0.16.1 are unchanged.
- **New exports:** `migrate`, `apply` and `references`, the `edit` event, and the subpath `umlimator/all`. Nothing is
  removed or renamed.
- **`validate()`** returns a new error for a `schemaVersion` that is a whole number above 2, and drawing such a model
  throws; any other value but 1 or 2 is a warning.
- **Size:** `lib/umlimator.js`, what a map host loads, is 187 kB gzipped, up 13.5% from 165 kB (the plan's budget is
  15%). The npm package grows from 206 kB to 417 kB, as it now carries `lib/umlimator-all.js` too.
- **A host that edits a version-2 model** (`editable`) gets the `edit` event and panels on its typed views; map views
  emit `change` as before.


## 0.18.0: the class diagram, a Mermaid `classDiagram` reader and writer, and a smaller core

Stage 1b of the plan for 28 diagram types (`docs/diagrams/`). Maps draw as they did.

- **The class diagram, `uml.class` (1.9).** A view of a version-2 model whose `diagram` is `"uml.class"` draws as a UML class
  diagram, in `lib/umlimator-all.js` only (`lib/umlimator.js`, what a map host loads, does not carry it): classes,
  interfaces, enumerations, data types and primitive types as classifiers with their compartments, comments as notes,
  packages as named boxes (their contents drawn inside them come with stage 2); associations with role and multiplicity
  by each end, composition and aggregation diamonds and navigable ends, generalization and realization (hollow triangle,
  realization dashed), dependency (open arrow, dashed) and comment links. The view lays itself out with the map's own
  ranking, the general class above its specializations when it runs `down`, and pins in `layout`; an edit that changes
  no size or line lays nothing out again. Members are edited as one line of UML text in the properties panel
  (`+ total: Money [1] = 0`, `- {static} count: Integer`, `+ place(at: Date, in qty: Int): Order`); a line that does not
  read is kept in the field, marked invalid, and nothing is applied. `validate()` adds the type's rules (unique member and
  classifier names, multiplicities, generalization cycles and kinds, realization targets, composite ends, member kinds,
  comment links), each problem naming its `rule` and its elements; `describe()` writes a class view per element
  ("Class Order (entity), 5 attributes, 3 operations; composed of OrderLine (lines, 1..*)"); elements and lines have
  accessible names; the legend keys the line kinds and ends. Maps draw exactly as before.
- **The class diagram, after review (1.9).** A version-1 model is a map whatever its views say: a view with
  `diagram: "uml.class"` and no `schemaVersion: 2` lays out and is described as before. An association's aggregation and
  navigability are set from the properties panel inside `props.ends`, as its role and multiplicity are. Member names may
  be in any script (`größe: Int`, `名前`), and a type may end in `[]` (`tags: String[] [0..*]`). An enumeration's new
  member is a literal when it is a bare name, else a property or an operation; a comment or a package offers no members.
  A refused member line loses its invalid mark once a good one is added or Escape puts it back. A generalization from or
  to anything but a classifier breaks `generalization-kinds`. Ids, types and view ids named `constructor`, `toString` or
  `__proto__` lay out like any other (M3).
- **A Mermaid `classDiagram` reader and writer (1.10).** `src/readers/mermaid-class.js`, written against Mermaid 12.3.0's
  class diagram page, is in `lib/umlimator-all.js` only, and internal until the registry is public:
  `readMermaidClass(text)` gives `{ model, report }`, a version-2 model with one `uml.class` view in `model.md`'s
  vocabulary, and a report of each statement it `skipped` or `approximated`, with its line (styling, links, accessibility
  text and Mermaid's configuration are skipped; a dashed link with no arrow, a lollipop, a generic class, `many`, `BT`
  and `RL` are approximated). Ids come from the source's names (a class's, a namespace's; `<class>.<member>`,
  `<from>-<to>`, `note-<n>`), so the same text always gives the same ids; text over 1 MiB is refused, and nothing throws.
  `writeMermaidClass(model, viewId)` writes one class view; an id the reader would not derive goes in a `%% id:` comment
  above its statement, and what the subset leaves out in `%% not written:` comments, so `read(write(model))` gives the
  model back on the subset (a view's `layout` and `present` are not written). `umlimator.py import` reads a
  classDiagram with it, through Node; without Node it says so, and every other format still imports with Python alone.
- **The 1.10 reader's review (1.10).** What `..|>` points to is read as an interface, as a lollipop's is, and reported
  when the source does not declare it `<<interface>>`, so the reader's model passes 1.9's `realization-target` rule;
  Mermaid's `n` (`0..n`, `1..n`, `int[n]`) is the multiplicity `*`, reported as `many` is, and a bracket that is no
  multiplicity (`int[5..2]`) stays in the type. A repeated name's next id is found where the last one stopped, so the
  reader stays linear (R2) with one relation, member or note repeated. Two names that differ only by `->` get two ids,
  reported; a namespace renamed for a class's name is reported at its own line; a %%{ ... }%% directive over several lines
  is passed over (by `umlimator.py import` too); `<<constructor>>` or `<<__proto__>>` is a stereotype like any other.
  With 1.9's rules in mind: a member named twice in one class (an operation, with the same parameter types) is read once
  and the second reported `skipped`; an interface's realization of another is read as a generalization, reported; and an
  id never keeps a `->` (`a->>b` is `a-b`).
  The writer writes nothing but a `%% not written:` line for a model with no `uml.class` view or a `viewId` it does not
  have; keeps a line break, a lone `}`, a `<<` or a `%%` out of a member's line and a `>>` out of a stereotype; and says in
  `%% not written:` what it drops: an end's `navigable` beside a diamond, a class's non-namespace parent, nodes in a
  cycle of parents, a line that ends on a member, an unknown visibility. `umlimator.py import` of a classDiagram from a
  copy without `src/` says it needs a full clone.
- **Fixtures, examples and documents (1.11).** The class example moved from `docs/diagrams/examples/01-class.json` to
  `examples/sales-classes.json`: it is in the gallery (its stills and PDF on the site) and in CI, which renders and
  checks it and validates it against the JSON Schema; `docs/diagrams/examples/check.mjs` lists what moved and checks it
  where it is now. `examples/class-editor.html` is a host that edits it: `edit` events applied with `apply()`, undo and
  redo from `history()`, a refusal, and Save. `tests/class-minimal.json` and `tests/class-stress.json` (risks.md G1: a
  class with no members and one with 60, abstract, static and derived members, a reflexive association, four lines
  between two classes, a package in a package, an enumeration with no literals, in a view of 50 elements and 57 lines)
  lay out with no overlap, no line through an element and no end label on one, in Node and in Chrome under three fonts
  and both themes; the stress fixture lays out in under 1 s, and an edit that moves nothing is laid out and drawn as SVG
  markup in under 100 ms (P1), both timed in Node in CI.
- **A view with no elements draws (1.11).** `layout()` and `check()` of a view whose `nodeIds` are empty
  or missing threw (`Cannot read properties of undefined`), for a class view and a map's alike; such a view now lays out
  as an empty stage, 72 by 72. Every other view draws as before.
- **Lines of a typed view reach 3:1 (1.11).** A class diagram's lines and their ends are drawn in `--um-muted`, 5.95:1
  on the light stage and 7.05:1 on the dark one, where `--um-arrow` gave 2.96:1 in light; a faded line (drift's idle
  lines) too, at its usual opacity. No new variable; a map's lines are drawn exactly as before.
- **Types and schema (1.11).** `lib/umlimator.d.ts` exports the class diagram's vocabulary: `UmlClassElementType`,
  `UmlClassMemberType`, `UmlClassLineType`, `UmlVisibility`, `UmlClassifierProps`, `UmlPropertyProps`,
  `UmlOperationProps`, `UmlAssociationEnd`, `UmlLineProps` and `UmlPresent`. `lib/umlimator.schema.json` describes the
  same fields (types, members, props, association ends, `present`) for editors, and rejects nothing it accepted before.
  [`docs/diagrams/conformance/uml-class.md`](diagrams/conformance/uml-class.md) states the subset, UML 2.5.1's clauses, what is left out
  and what the SVG, PNG and PDF writers show of a class diagram.
- **The sequence spike's findings applied (1.12, `docs/diagrams/notes/spike-sequence.md` §5, items 1 to 3).** Additive;
  maps and class views draw as before.
  - `add { element, view, index, in: 'view' }` puts the element into the view's own list for its kind: a line, or one
    of the view type's items, into `view.edges` at `index`; a node of the type's palette (or any node, for a type with
    none) into `view.nodes`, its id into `nodeIds` at `index`; anything else into `view.fragments`. `in: 'model'` is the
    default and does what `add` did. A line refused into a view that lists no lines while the model has some.
  - `delete` gives what it held and that stays (lines, fragments, interaction uses) the nearest owner that stays, not
    none: unwrapping a fragment leaves its messages in the operand around it. A diagram type's `refs` declaration says
    which of an element type's props name elements: deleting the named element takes the holder with it (`cascade`: a
    reply goes with its call) or takes the id out (`drop`: a deleted lifeline leaves `covers`). `references()` reports
    those places with kind `'prop'`; `hide` leaves them.
  - Inside the registry (still internal, provisional): a type may lay its views out with its own `layout.run(model, view,
    { measure, pos, memo })`, called in the host's measure, and keep the geometry with `layout.key`; `layout.pins: false`
    ignores a view's pins; `draw(geo, kit)` adds markup under the lines and over the nodes; `items` names the entries of
    `view.edges` that are not lines, whose ends the typed checks leave alone (a type not drawn yet passes over entries with
    neither end); `validate(model, view)` runs per typed view and each problem is said once; a relationship picker
    entry's `props` are copied onto the new line, and `edits.connect` gives the commands a new line emits. 1.9's class
    type keeps its layered hook. The typed checks accept a typed view's own `nodes`.
  - `model.md`: a sequence view's occurrences (messages and interaction uses) are one ordered list in `edges`, and
    `props.after` is gone; messages stay inline; activations are derived by intervals. The sequence example follows.
- **The spike's findings, after review (1.12b).** `delete` of an element with many lines to it is near its speed before
  0.18.0 again (a tenth of the first cut's time: each line goes without a scan of the model).
  `references()` and `delete` look in a view's own `nodes` too: a declared prop there is reported and dropped, and a
  `parent` reported. A type's `validate(model)` that takes no view runs once per type, not once per view. Of what a type's `draw`
  returns, only `under` and `over` reach the SVG. An empty view (no `nodeIds`) lays out to an empty geometry instead of
  throwing, for a map, a class view and a type's own `layout.run`. The sequence example's interaction use covers the
  lifeline between the two it named (`covers: ["api", "payments", "receipt"]`), and `check.mjs` checks that `covers`
  names lifelines next to each other in `nodeIds`; a registered type that declares no `refs` is checked by its hand
  list again.
- **Typed-only code out of the core (risks.md C5).** What only a registered diagram type's geometry takes moved from the
  core's sources to `src/typed/`, which only `lib/umlimator-all.js` holds: `layoutTyped` and the geometry key
  (`src/layout/typed.js` before), a typed view's rows, its loops (a line from a node to itself) and its fanned lines in
  `layoutPass`, the classifier shape, the line-end table and the end labels. The core keeps a slot, `TYPED` in
  `src/core/registry.js`, which these files fill as they load; in `lib/umlimator.js` it stays empty, as nothing there lays
  a view out but as a map (no registered type, no `layoutGraph(…, false)`), so `lib/umlimator.js` behaves as before for
  every input: its exports, maps, and version-2 models (plain cards for a type it does not draw, typed editing,
  `apply()`, `references()`, `migrate()`, `validate()`, `describe()`). `tests/core-diet.test.mjs` and
  `tests/core-diet.html` hold both files to what main gave before the move: `layout()`, `describe()`, `validate()` and an
  edit through `apply()` for the 29 version-2 examples, and `render()`'s markup of 11 views of three of them. `lib/umlimator.js` is 182,603 B with
  `gzip -9`, 10.70% over 0.16.0 (it was 189,745 B, 15.03%).

What moves for a host that upgrades:
- **Nothing is drawn differently.** Every map's geometry, every example's stills and every test of 0.17.0 are unchanged.
  A view with no elements, which threw in `layout()`, `check()` and drawing, now lays out as an empty stage.
- **A host that loads `umlimator/all`** draws a version-2 view with `diagram: "uml.class"` as a class diagram, where
  0.17.0 drew plain cards and warned; `lib/umlimator.js` still draws plain cards for it, with the warning.
  A package in a class view is drawn as a named box beside its classes until 0.19.0, which draws its contents inside it
  (`docs/diagrams/notes/stage-2.md` §10.1), so a class diagram's picture will change then.
- **`apply()`:** `add` takes `in: 'view'`; `delete` of an element that owns lines or fragments gives them to the nearest
  owner that stays, where 0.17.0 left them with none. Nothing else in a command's result changes.
- **New exports:** the class diagram's types in `lib/umlimator.d.ts`. Nothing is removed or renamed; the registry and
  the Mermaid class reader stay internal.
- **Size:** `lib/umlimator.js`, what a map host loads, is 182.6 kB gzipped, down from 187.4 kB in 0.17.0 and 10.7% over
  0.16.0 (the plan's budget is 15%). `lib/umlimator-all.js` is 211.5 kB gzipped. The npm package grows from 417 kB to
  441 kB.
- **`umlimator.py import`** reads a Mermaid `classDiagram` through Node; every other format imports with Python alone.

## 0.19.0: the object and package diagrams, packages drawn as boxes, ownership edited on the canvas, and the PDF's tables per type

Stage 2 of the plan for 28 diagram types (`docs/diagrams/notes/stage-2.md`). Maps draw as they did. **Class views with
packages draw differently**, by the maintainer's decision (§10.1, `docs/diagrams/plan.md` §1).

- **Boxes on typed views (2.1).** A registered type's `boxes(model, view)` are laid out with the map's box code: each
  box's contents kept together, boxes 32 px apart, a line ending on a box's border, box borders in the routing grid. A
  box whose shape has `frame(f)` is drawn by it; the frame draws its border with class `family-box` and its title with
  class `family-title`. Dropping a card into, out of or between boxes emits `reparent` and removes any pin the card had,
  and the view is laid out again only when an element shown before and after is now drawn in a different box. The
  properties panel has an **Owner** field built from the type's `owners(model, element)`, which always lists the
  element's current owner. A box is selected as a container for F2, Delete, Shift + Delete and the panel. Inside the
  registry (still internal, provisional): the fields `boxes` and `owners`. Maps draw as before.
- **The package diagram, `uml.package`, and packages in class views (2.2).** `uml.package` draws packages, imports
  («import», and «access» for a private one), merges («merge») and dependencies, each dashed with an open arrowhead,
  and the class diagram's classifiers by their names and keywords. In both `uml.package` and `uml.class` views (and
  `uml.object`, 2.3), a shown package that owns shown elements is drawn as a box holding exactly those elements, its name
  in a tab in its top left corner; any other package is drawn as a closed folder, whose tab moves along its top away from
  where lines end. Names are qualified (`payments::card::CardPayment`) from the nearest shown owner, else from the view's
  `subject`, else from the top; this covers accessible names and `describe()` too, including a line to a member, which
  names its owner as drawn. A line between a package and something it holds, or from an open package to itself, is not
  drawn, and rule `line-inside` warns of it; on a closed package a line to itself is a loop. An ownership cycle (already
  a core error) no longer drops elements from the picture or from `describe()`. The package type's rules: `import-ends`
  and `package-names` (errors), `owner-kinds`, `line-inside` and `own-boxes` (warnings: a view's hand-written
  `containers` are ignored where the type gives boxes), and the class diagram's own; `describe()` writes each box, then
  what it holds, depth first. `examples/sales-classes.json`'s "Payments only" view takes `subject: "sales"`, so its
  classes keep their plain names.
- **The object diagram, `uml.object` (2.3).** An instance specification is drawn with the classifier shape, its head
  underlined: `name : Classifier`, `: Classifier` for an anonymous one, or its name alone; one compartment of slots,
  `feature = value` (or `feature` with no value). A link is an association with no end marks: its name, or else its
  association, on the line, and each end's role by its end. A package holding a shown instance is a box, with names
  qualified as in the class view. A slot is edited as one line in the properties panel (`print(parse(x))` is stable; a
  line with no feature name is kept as typed, marked invalid, and nothing is applied); F2 renames the instance, and its
  classifier is a property. Rules: `slot-kinds`, `link-ends` (errors), `instance-of` (a warning: when the classifier names
  exactly one classifier of the model, by its name or qualified name, each slot names an attribute of it or of one of its
  generals), `owner-kinds` and the class diagram's `member-names`. `describe()`, accessible names ("Instance
  specification order1042 : Order, 2 slots") and the legend. The underline is one attribute on the classifier shape's
  name, in `src/typed/draw.js`, so `lib/umlimator.js` is unchanged.
- **The object diagram, after review (2.3).** A class, interface, enumeration or other classifier added to an object
  view is drawn as it is in the class view, with its name not underlined, its keyword and its compartments, and screen
  readers announce it as one ("Class Order, 1 attribute, 0 operations"). Before, it was drawn and announced as an
  instance.
- **Mermaid class diagrams: namespaces (2.4).** Namespaces nest as Mermaid 12.3.0 nests them. The reader knows a
  namespace by its parent and its name, so a namespace with the same name inside another parent is a separate package,
  reported and renamed with `-2` and so on; text that 0.18.0 read into one package reads into two, with new ids. A
  dotted name of over 32 parts is read as one name, and a note inside a namespace is reported. The writer nests in
  braces. It writes a namespace whose id is its parent's dotted path in dotted form at the top, unless a written
  namespace beside it has the same last part. It leaves out a namespace with no class in it, and it handles models
  nested thousands deep. It names an owner the view does not show in a `%% not written:` line; when the shown
  namespace's id is that owner's dotted path, the line also says that Mermaid draws the owner anyway, because Mermaid
  splits names at their dots.
- **The PDF's tables per type, and a re-own in `diff()` (2.5).** The PDF of a version-2 model has tables that suit the
  diagram (`risks.md` R8): the cards table gives each element's type word ("Class", "Data type", "Instance
  specification", "Package"; an element with no type counts as a class) and its members or slots as the type prints
  them; the lines table gives each line's kind ("Association", "Package import", "Link") where a map's PDF gives the
  technology. `diff()` on a version-2 model says "moves X into Y" or "moves X out of Y" when an element's owner is the
  only thing that changed (M11), and so do `umlimator.py diff` and the diff Action. Maps' PDFs and diffs are unchanged: a
  map whose node's `parent` changes still reads "changes X (parent)".
- **Fixtures, examples and documents (2.6).** The object example moved from `docs/diagrams/examples/02-object.json` to
  `examples/order-objects.json`, and the package example from `03-package.json` to `examples/bookshop-packages.json`:
  both are in the gallery (their stills and PDFs on the site) and in CI, which renders and checks them, validates them
  against the JSON Schema and runs the diff Action's dry run on them; `docs/diagrams/examples/check.mjs` lists what
  moved. `tests/package-minimal.json` (`notes/stage-2.md` §15: empty, hidden and partly shown packages, three levels with
  a line from depth 3 to depth 0, imports, an access and a merge, qualified names, a subject, two classes named Order, a
  pinned class in a box, what the rules warn of) and `tests/object-minimal.json` (anonymous instances, slots with no
  value, a long value, named and association-only links, roles, two links on one pair, a link to itself, a qualified
  instance, `instance-of`) lay out with no overlap, no line through an element, a tab or along a box's border and no
  role on an element, right and down, in Node and in Chrome under three fonts and both themes;
  `tests/package-stress.json` (50 nodes in 10 boxes over three levels, 60 lines) and `tests/object-stress.json` (50
  instances, 60 links) lay out in under 1 s, and an edit that moves nothing is laid out and drawn as SVG markup in under
  100 ms (P1), both timed in Node in CI, their crossings pinned. `tests/cli.py` renders, checks, stills and prints both
  examples and runs the diff Action's step as CI runs it on both; `tests/mcp.py` serves both to an MCP client and a page
  (C10). [`docs/diagrams/conformance/uml-object.md`](diagrams/conformance/uml-object.md) and
  [`docs/diagrams/conformance/uml-package.md`](diagrams/conformance/uml-package.md) state each subset, UML 2.5.1's clauses, what is left
  out and what the SVG, PNG and PDF writers show; `uml-class.md` says what nesting changed.
- **The Owner field removes a pin too (#196).** Setting an element's owner in the properties panel now sends the
  `reparent` and, when the card was pinned, the `set` that removes its pin, in one transaction, as a drop does. Before, the
  pin stayed and the card could be drawn outside its new box.
- **Types and schema (2.6).** `lib/umlimator.d.ts` exports the object and package diagrams' vocabulary:
  `UmlObjectElementType`, `UmlObjectMemberType`, `UmlObjectLineType`, `UmlInstanceProps`, `UmlSlotProps`,
  `UmlLinkProps`, `UmlPackageElementType`, `UmlPackageLineType` and `UmlPackageImportProps`.
  `lib/umlimator.schema.json` describes the same fields (instances, slots, links and their roles and association, an
  import's visibility, the `uml.object` and `uml.package` views, `subject`) for editors, and rejects nothing it accepted
  before.

What moves for a host that upgrades:
- **A class view with packages draws differently** (the maintainer's decision, `notes/stage-2.md` §10.1, an exception to
  "every model that drew before draws the same"): a package owning classes the view shows is a box holding them, not a
  named box beside them; a package owning nothing shown is a closed folder; a class whose owners are not all shown is
  named `sales::Order`. A line between a package and a class it holds is no longer drawn, with a warning. A view's own
  `containers` are ignored on a class view, with a warning. Maps, and class views with no packages, draw as before; every
  map's geometry and every map example's stills are unchanged.
- **A re-own lays a typed view out again**, so each box holds exactly its contents; the picture moves on that edit.
- **A host that loads `umlimator/all`** draws a version-2 view with `diagram: "uml.object"` or `"uml.package"` as an
  object or package diagram, where 0.18.0 drew plain cards and warned; `lib/umlimator.js` still draws plain cards.
- **`validate()`** on a class model adds `owner-kinds`, `line-inside` and `own-boxes`, all warnings.
- **The Mermaid writer** names an owner the view does not show in `%% not written:`; **the reader** gives a namespace
  that shares its name with one in another parent its own package and id (`X-2`), where 0.18.0 merged the two.
- **The PDF** of a version-2 model lists each element's type and members or slots, and each line's kind, where 0.18.0
  printed the map's "Script" and "calls".
- **`diff()`** on a version-2 model says "moves X into Y" for a re-own, where 0.18.0 said "changes X (parent)".
- **New exports:** the object and package diagrams' types in `lib/umlimator.d.ts`. Nothing is removed or renamed; the
  registry stays internal.
- **Left out** (`notes/stage-2.md` §14): the semantics of package merge, element import, the ⊕ containment notation, a
  line between a package and what it holds, package URIs, a diagram frame, the tab above an open package's body, nested
  classifiers; checking slot values against their types, classifiers and associations by reference, a link's
  multiplicity, n-ary links; XMI; a reader for either type.
- **Stage 3's work, already on `main`, ships in this release too, provisional until 0.20.0.** `umlimator/all` draws a
  version-2 view with `diagram: "uml.sequence"` or `"uml.communication"`, and `import` reads a Mermaid
  `sequenceDiagram` through Node; their schema, `.d.ts` types, fixtures, examples and conformance notes come in 0.20.0,
  whose section says what they do. A typed view's root `<svg>` now has `role="group"`, as a map's has, where 0.18.0
  gave a class view `role="img"`: it holds named, focusable parts (3.4). `lib/umlimator.js` draws neither type.
- **Size:** `lib/umlimator.js`, what a map host loads, is 186.8 kB with `gzip -9` (186,800 B), 13.24% over 0.16.0's
  164,954 B (the plan's budget is 15%), up from 182.6 kB in 0.18.0: 2.1's box code and 2.5's tables, and stage 3's
  canvas hook slot (3.4) and speed flags (#191). `lib/umlimator-all.js` is 276.8 kB, up from 211.5 kB in 0.18.0, with
  stage 3's types in it. The npm package is 512 kB, up from 441 kB.

## 0.20.0: the sequence and communication diagrams

Stage 3 of the plan for 28 diagram types (`docs/diagrams/notes/stage-3.md`). Everything here is additive: maps, class
views and every earlier example draw as they did. The new code is in `lib/umlimator-all.js`, except what the canvas
needs in the core (3.4, 3.8).

- **Interaction semantics (3.1).** Both new types share one module, `src/uml/interaction.js`: the occurrences of a view
  in time order, with their operands; activation bars derived by five rules from the messages (`notes/spike-sequence.md`
  §2.3; a bar that opens on the row where another on the same lifeline closes only touches it, but a self-call there
  nests); message numbers (S8: a message's place among those sent in the activation it is sent from, replies included);
  the call a new reply answers; and the shared rules `reply-call`, `reply-once`, `create-once`, `delete-once` and `sort`.
- **The time-axis layout and frames (3.2).** `layoutTimeAxis` places heads, stems, bars, frames, operands, interaction
  uses and messages with no router, and gives the slots a new message can go into. A fragment whose `parent` is not an
  operand, or lies inside the fragment itself, is one error on that fragment, which is still drawn, at the top.
- **Sequence diagrams, `uml.sequence` (3.3).** A view of lifelines, with its messages (call, async, reply, create,
  delete) and interaction uses inline in its `edges`, in time order, and its combined fragments (`alt`, `opt`, `loop`,
  `par`, `break`) in its `fragments`. It is drawn on a time axis with frames, guards, activation bars and crosses under
  the messages; every piece is named, and the view is read in time order (`geo.order`). Twelve rules check it;
  `describe()` and the legend put it in words. Its edit hooks (`connect`, `moveTo`, `wrap`, `add`, `remove`) return the
  commands for `apply()`, or `{ error }` when the change would break a rule. Adding a lifeline inside an interaction
  use's range adds it to that use's `covers`; removing every operand of a fragment removes the fragment.
  `docs/diagrams/examples/check.mjs` checks sequence examples with the real type.
- **The sequence diagram's gestures on the canvas (3.3b).** Every gesture of `notes/stage-3.md` §5.2, by pointer and by
  key (`docs/editing.md`). A head dragged sideways lands where it was dropped, in any font. A message drawn from a stem
  and released over a fragment's tag, a guard or an interaction use on another lifeline's stem connects to that
  lifeline. Double-clicking a selected lifeline's name renames it, as F2 does.
- **Canvas hooks (3.4).** On a typed view, a type's `edits` hooks take over a gesture by pointer and by key; each
  returns commands (one `edit` event), `null` to keep the default gesture, or `{ error }`, said on the hint line, with
  nothing emitted. `connect` gets the slot nearest the release, or after `L` the slot after the selection. A typed view
  can draw a line from an element to itself. A view's fragments are elements: they can be selected, removed (a view's
  own fragment is deleted) and edited in the panel. In the core: typed lines get key rings (class views too), in
  `geo.order` when the type gives one; Shift + click and Shift + Enter add lines to the selection beside cards; `L`
  starts from a selected line when the type has `edits.connect`; `layout.pins: false` sets no pins. Without
  `umlimator/all`, `lib/umlimator.js` keeps 0.17.0's typed editing.
- **Speed flags for a typed layout (#191).** A diagram type's registry entry may say `layout.rank: false`, which gives its
  layout only the view's pins with no ranking pass, and `layoutTyped`'s input may say `reroute: false`, which turns off
  the rip-up and reroute of lines that had to cross. Maps lay out exactly as before.
- **Communication diagrams, `uml.communication` (3.5).** Lifelines joined by connectors; each connector's messages are a
  stack of numbered rows (1, 1.1, 1.1.2) on it, each row with an arrow toward its receiver: filled for a call or a
  delete, open for async or create, dashed for a reply. Rules: `message-link` and the shared ones. `describe()`, names a
  screen reader reads, a reading order of lifelines, connectors, then messages by number, and a legend. Its hooks
  (`connect`, `moveTo`, `add`, `remove`) never return an edit that breaks a rule; deleting a connector from the model
  takes the messages it carries in every communication view.
- **Mermaid sequence diagrams (3.6).** `umlimator.py import` reads a `sequenceDiagram` (Mermaid 12.3.0) through Node into
  one `uml.sequence` view, and reports what it skipped or approximated; it refuses text over 1,048,576 characters and never throws. The
  writer (internal) writes a view back, with `%% id:`, `%% operand-id:`, `%% reply-to:`, `%% represents:` and
  `%% use:` comments, and `%% not written:` for what Mermaid cannot carry; `read(write(model))` equals the model, ids
  included. A participant's alias is read as its label, as Mermaid shows it.
- **Helpers (3.7).** Internal, not in the public API: a numbered view as a `uml.sequence` view, a numbered or sequence
  view as a `uml.communication` view (with the operand of each `alt` picked), and a trace as a sequence view. Each
  returns a report of what it skipped or approximated. Derived ids never contain `->` and are unique among those one
  call derives, with `~2`, `~3` added where one would repeat another.
- **Fixtures, examples, the CLI and documents (3.8).** Examples 11 and 12 moved from `docs/diagrams/examples/` to
  `examples/checkout-sequence.json` and `examples/checkout-communication.json`, unchanged: both are in the gallery (their
  stills and PDFs on the site) and in CI, which renders and checks them and validates them against the JSON Schema;
  `check.mjs` lists what moved. `umlimator.py` renders, checks, stills and prints both types: the copy of a model the
  upstream engine checks leaves out a view's items with no ends (an interaction use; risks.md F3), and the layout check
  counts a sequence's frames, operands and uses as holders, which may hold what they meet. `umlimator.py trace
  --diagram uml.sequence` writes a trace as a UML sequence view, through the helper. `tests/sequence-minimal.json` and
  `tests/sequence-stress.json` (every case of `notes/stage-3.md` §9, and 20 lifelines, 200 messages and 10 nested
  fragments laid out and drawn in under 100 ms) are laid out clean in Node and in Chrome under three fonts and both
  themes; the communication fixtures moved out of `tests/communication.html` into `tests/communication-minimal.json`
  and `tests/communication-stress.json`. [`docs/diagrams/conformance/uml-sequence.md`](diagrams/conformance/uml-sequence.md) and
  [`docs/diagrams/conformance/uml-communication.md`](diagrams/conformance/uml-communication.md) state each subset, UML 2.5.1's clauses,
  what is left out and what the SVG, PNG and PDF writers show.
- **Types and schema (3.8).** `lib/umlimator.d.ts` exports the two diagrams' vocabulary: `UmlSequenceElementType`,
  `UmlSequenceMemberType`, `UmlSequenceLineType`, `UmlLifelineProps`, `UmlMessageSort`, `UmlMessageProps`,
  `UmlInteractionUseProps`, `UmlInteractionOperator`, `UmlCombinedFragmentProps`, `UmlCommunicationElementType` and
  `UmlCommunicationLineType`; a view's `edges` may hold an `Element` (an interaction use). `lib/umlimator.schema.json`
  describes the same fields for editors, accepts an interaction use inline in a view's `edges`, and rejects nothing it
  accepted before.

What moves for a host that upgrades from 0.19.0 (which already carried 3.0 to 3.7, provisionally; from 0.18.0, add
everything above):
- **The two types are no longer provisional.** `umlimator/all` draws a version-2 view with `diagram: "uml.sequence"` or
  `"uml.communication"` as 0.19.0 did; their schema, `.d.ts` types, fixtures, examples and conformance notes are new
  (3.8). `lib/umlimator.js` still draws plain cards for them.
- **The layout check** (`check()`, `umlimator.py check`) does not count a node marked `holder` (a sequence's frame,
  operand or use) as overlapping a node it fully contains; a use over a lifeline head, or two crossing frames, are still
  reported. No map node has the mark, so maps check as before.
- **`umlimator.py`** leaves a sequence view's interaction uses, which have no ends, out of what the upstream engine
  reads (F3), where 0.19.0 refused the model with "an unknown end"; any other line with no ends is still reported.
  **`umlimator.py trace`** takes `--diagram uml.sequence`; without it, `trace` writes the numbered view, as before.
- **The schema** accepts a sequence view's interaction use inline in its `edges` (a `uml.InteractionUse` with no ends)
  and describes the new fields; it rejects nothing it accepted before. **`lib/umlimator.d.ts`** exports the two
  diagrams' types, and `MapView.edges` takes an element too.
- From 0.18.0, also: typed views on the canvas (class views too) give lines key rings in the Tab order, Shift + click
  adds a line to the selection, and `L` may start from a selected line; a typed view's root `<svg>` is `role="group"`;
  `umlimator.py import` reads a Mermaid `sequenceDiagram` (all in 0.19.0).
- **Nothing is removed or renamed;** the registry, the Mermaid sequence reader and writer and the helpers stay internal.
- **Left out** (`notes/stage-3.md` §13): gates, continuations, state invariants, time constraints, found and lost
  messages, coregions, the seven other operators (drawn by name), an actor drawn as a figure, notes and `autonumber` in
  a sequence view, hiding a message; concurrent numbers and multi-objects in a communication view; XMI. The `map-repo`
  skill, the MCP server and the diff Action meet these types in one package after 0.20.0 (C10, S15).
- **Size:** `lib/umlimator.js`, what a map host loads, is 186.9 kB (186,920 B) with `gzip -9`, 13.32% over 0.16.0
  (the plan's budget is 15%); stage 3 added 835 B to it in 3.4, 107 B in #191 and 130 B in 3.8, the rest is stage 2's.
  `lib/umlimator-all.js` is 276.9 kB (276,892 B), up from 211.5 kB in 0.18.0. The npm package is 515 kB, up from
  512 kB in 0.19.0.

## 0.21.0: maps in one card-shape style; the use case, activity, state machine and interaction overview diagrams; the Bookshop atlas

### One card-shape style for maps

The maintainer's decision of 13 Nov 2026 (`docs/diagrams/README.md`): maps draw in one card-shape style, and the
`box`/`c4`/`uml` choice of 0.15.0 is removed. Two stated exceptions: to "every map draws exactly as now" (every map's
picture changes) and to "additive only" (the choice's API goes).

**What a map draws.** The union of what `c4` and `uml` drew, by the kind word the model wrote, then by the kind it means:

| Card | Shape |
|---|---|
| `person`, `user`, `human` | a person |
| `agent` | a robot (UML's non-human actor) |
| `frontend` (and its words: `web`, `ui`, `app` ...) | a browser app |
| `mobile` | a phone |
| `cli` | a terminal |
| `queue` (and its words) | a pipe |
| `module`, `package` | a folder (UML's package) |
| `cloud` (and its words: `host`, `cdn`, `deploy` ...) | a node (UML's node) |
| `database` (and its words) | a cylinder |
| `file` (and its words) | a document (UML's artifact) |
| a hook | a hexagon |
| anything else | a rounded box, with its kind's own mark |

- A box keeps its kind's own mark: UML's component icon on a box is not kept.
- An `external` card is dashed (both notations dashed it). A box (container) is solid unless it has a `tone`: `c4`'s
  dashed boundaries, and the minimap's copy of them, are gone.
- **A card's own `shape`** stays, with its validation: it wins over its kind, as before.
- **The geometry does not change.** Every shape is drawn inside its card's box, so the layout, the routes, the layout
  check and the bench hashes are what they were (`bench/expected.json` is unchanged).
- **Typed diagrams** (class, object, package, sequence, communication) keep UML's own notation; the map's table never
  applies to them.

**What moves for a host:**

- **Removed:** the model's and a view's `shapes`; `render()`'s `shapes` option; `handle.shapes`; `MapState.shapes` (and
  `shapes` in a `state` event's `changed`); the `Notation` type in `umlimator.d.ts`; `<umlimator-map shapes>`; the
  page's ⬡ toggle next to ◐, its `#shapes=` link parameter and the choice it kept in `localStorage`; `shapes` in the
  JSON Schema.
- **Still loads:** a model that has `shapes` loads and draws in the one style, as any unknown field does; `validate()`
  warns where it is, `shapes is no longer read: maps draw in one style` (at `shapes`, or `views[i].shapes`). An unknown
  `render()` option, an element attribute or a link parameter named `shapes` is ignored: nothing is drawn again.
- **Changed pictures:** every map's cards (and so its stills, PDFs and exports) draw in the one style; a map that named
  no notation, which drew every card as a box, now draws shapes. Its layout is the same.
- `validate()`'s hint for a `frontend` card with a person's icon (`user`, `users`, `usercheck`) now holds in every map
  view, not only in `c4` ones: such a card is drawn as a browser. A card only typed views hold is not told.
- `umlimator.py import` no longer writes `"shapes": "c4"`; a Structurizr style's shape still becomes the card's own
  `shape`. A C4 source's element its words make `cloud` (a gateway, a proxy, a monitor), which C4 draws as a box and a
  map would draw as a node, is written with `shape: "box"`, whatever its type.
- `examples/shapes.json` is the one style's gallery, `examples/notations.html` shows it light and dark, and
  `examples/clinic.json` is imported again without `shapes`.

### The use case, activity, state machine and interaction overview diagrams

Stage 4 of the plan for 28 diagram types (`docs/diagrams/notes/stage-4.md`). Beside the one card-shape style above,
everything here is additive: maps, the class, object, package, sequence and communication diagrams and every earlier
example draw as they did. The new code is in `lib/umlimator-all.js`, except 268 B in the core (4.1, 4.9).

- **Shapes that are not boxes, and renames (4.1).** A typed line ends on the outline of a circle, a diamond, a bar or an
  ellipse: the router still ends it on the node's box, and the typed line drawer slides each end along the side's
  normal by the shape's `inset`, on a copy, so a laid-out view drawn twice from one memo is the same markup. A typed line
  may carry `cut`, the width its label is cut at (150 px without it; the state, activity and overview lines, and an
  extend, 280 px). A type may give `edits.rename(model, view, id, text)`, which F2 and a double-click call; a hook may
  return `{ pick: [labels], then }` to open a picker; a palette entry with `name: false` is added with no prompt; `V` on
  a node whose entry `opens` a diagram kind picks the view it opens (`set opensView`); `moveTo`'s `at` carries the
  canvas's geometry (`at.geo`). `ownersOn` takes a `look`, so a box may be a member (a state's region).
- **Control nodes and the transition micro-syntax (4.2).** The initial, final and flow final circles, the diamond (it
  grows to hold a decision's question), the bar and the rounded box, shared by three types; the shared flow rules; one
  parser and printer for `trigger [guard] / effect` and a flow's `name [guard]`, brackets and parentheses balanced,
  `print(parse(x))` stable, a text it cannot read refused and kept as written.
- **Lanes (4.3).** `laneRows` and `laneBands` (`src/layout/lanes.js`): each lane, and each lane nested in it, a run of
  rows; bands as long as the diagram, divided 12 px off the router's lines; an empty lane keeps a band; a node in no lane
  goes after them.
- **Use case diagrams, `uml.use-case` (4.4).** Actors as stick figures placed first, use cases as ellipses with their
  extension points, a subject as a box holding its use cases, include, extend (its points by name and its condition),
  generalization; nine rules, `describe()`, names, a legend, keyboard editing; extension points as member rows.
- **Activity diagrams, `uml.activity` (4.5).** Actions, call behaviour actions (Enter opens the activity they call),
  send and accept actions, object nodes, data stores, the control nodes, flows labelled `name [guard]`; partitions as
  lanes, nested, added back after the layout as header strips; a node's lane changed by a drop or the Owner field;
  deleting a partition keeps what it held; ten rules, the PDF's rows ("in Warehouse").
- **State machine diagrams, `uml.state-machine` (4.6).** States with their activities and internal transitions,
  composite states as boxes with the decomposition indicator when closed, orthogonal regions stacked with dashed
  dividers, every pseudostate kind, transitions written `trigger [guard] / effect` and edited by F2 through its parts;
  a row `entry / …` sets that activity; regions as member rows; 17 rules.
- **Interaction overview diagrams, `uml.interaction-overview` (4.7).** Interaction uses and inline interactions as nodes,
  joined by the activity's control nodes and flows; an inline interaction drawn read only at full size from the
  sequence type's own geometry (its frame only above 8 lifelines or 20 messages); Enter opens a use's view.
- **Mermaid state diagrams (4.8).** `umlimator.py import` reads a `stateDiagram` or `stateDiagram-v2` (Mermaid 12.3.0)
  through Node into one `uml.state-machine` view and reports what it skipped or approximated; the writer (internal)
  writes junction, history and terminate under `%% kind:` and crossings Mermaid may not draw under `%% warning:`;
  `read(write(model))` equals the model, ids included. Over 1 MiB is refused; it never throws.
- **The PDF's tables per type (4.9).** A typed view's first table is headed "Elements"; a type may give `word(model,
  id)`, an element's kind, and `rows(model, view, id)`, what is listed in place of its members.
- **Fixtures, examples, the CLI and documents (4.10).** Examples 8, 9, 10 and 13 moved from `docs/diagrams/examples/`
  to `examples/shopping-use-cases.json`, `fulfil-activity.json`, `order-states.json` and `buy-book-overview.json`,
  unchanged: in the gallery and in CI, which renders, checks and validates them against the JSON Schema; `check.mjs`
  lists what moved and runs the four types' rules. `tests/<type>-minimal.json` and `tests/<type>-stress.json` for each
  type (`notes/stage-4.md` §16) lay out clean in Node and in Chrome under three fonts, both themes and both directions,
  with every line end on its outline. `tests/cli.py` renders, checks, stills and prints the four examples and runs the
  diff Action's step on each; `tests/mcp.py` serves each to the MCP server (C10). Conformance notes:
  [`uml-use-case.md`](diagrams/conformance/uml-use-case.md), [`uml-activity.md`](diagrams/conformance/uml-activity.md),
  [`uml-state-machine.md`](diagrams/conformance/uml-state-machine.md),
  [`uml-interaction-overview.md`](diagrams/conformance/uml-interaction-overview.md).
- **Types and schema (4.10).** `lib/umlimator.d.ts` exports the four diagrams' vocabulary: `UmlUseCaseElementType`,
  `UmlUseCaseMemberType`, `UmlUseCaseLineType`, `UmlExtendProps`, `UmlActivityElementType`, `UmlActivityLineType`,
  `UmlFlowProps`, `UmlStateMachineElementType`, `UmlStateMachineMemberType`, `UmlStateMachineLineType`,
  `UmlStateProps`, `UmlPseudostateKind`, `UmlPseudostateProps`, `UmlTransitionProps`,
  `UmlInteractionOverviewElementType` and `UmlInteractionOverviewLineType`; `UmlPresent.collapsed` takes
  `'activities'`. `lib/umlimator.schema.json` describes the same fields and rejects nothing it accepted before.

**Performance (P1).** The four types lay out with port repair off (`repair: false`, `reroute: false`): on the stress
views (50 elements and 60 lines; 50 nodes, 60 flows and four lanes; 50 states, 60 transitions, composites three deep;
40 nodes, 50 flows, 10 inline interactions) the common edit (a use case renamed, a guard, a lane change, a transition's
label) is laid out and drawn in about 28, 23, 66 to 77 and 9 ms of CPU on a laptop. CI holds every timed budget to a 1 s ceiling and prints
each against its target, 100 ms for an edit (the repository's rule for CI timing, from the maintainer's decision of 13
Nov 2026 on the wired state machine, the one type whose edit nears 100 ms on a laptop: the scattered state machine, most
transitions across region borders). Turning port repair off leaves crossings next to shared sides, which
the fixtures pin and the conformance notes state.

**The maintainer's decisions of 13 Nov 2026 for this release:** the activity and interaction overview types' one column
gap for every column (one long guard widens them all) is accepted for 0.21.0, and a per-column gap option is later work;
the state machine type's wrap of `TYPED.edit`, which reads a member row `entry / …` as the activity, is kept for 0.21.0,
and a member hook that may return commands comes with stage 5.

What moves for a host that upgrades from 0.20.0 (beside the one card-shape style, above):

- **Four new diagram types** in `umlimator/all`: a version-2 view with `diagram: "uml.use-case"`, `"uml.activity"`,
  `"uml.state-machine"` or `"uml.interaction-overview"`, which 0.20.0 drew as plain cards with a warning, is now drawn in
  its notation and edited on the canvas. `lib/umlimator.js` still draws plain cards for them.
- **A typed view's PDF** heads its first table "Elements", not "Cards"; its header row stays "Card, Kind, Members".
- **The registry** (internal) gains optional fields: `edits.rename`, `{ pick, then }` results, `name: false` and `opens`
  on palette entries, a line's `cut`, `rows` and `word`; a type without them behaves as before.
- **`umlimator.py import`** reads a Mermaid `stateDiagram`.
- **The schema and `.d.ts`** gain the four types' descriptions and types, additively.
- **Nothing else is removed or renamed;** the types, the parser, the lanes and the Mermaid state reader stay internal.
- **Left out** (`notes/stage-4.md` §18): use-case descriptions, several subjects per use case; pins, exception handlers,
  interruptible, expansion and structured regions, time events in activities; entry and exit points, submachine and
  protocol state machines, a composite state's activities drawn on its box; editing an inline interaction in place; for
  all four, XMI, copy and paste and per-type `diff()` writers. Found in 4.10 (`docs/diagrams/risks.md` R9): the PDF's
  line tables list a line's `label` only, so a transition's parts, a flow's guard and an extend's points are missing,
  and the state machine type gave no `word` or `rows` until decision 18 (13 Nov 2026) added both in `src/uml/state.js`.
- **Size:** `lib/umlimator.js`, what a map host loads, is 185.1 kB (185,149 B) with `gzip -9`, 12.24% over 0.16.0 (the
  plan's budget is 15%): stage 4 added 307 B (4.1, 4.9 and the atlas's 39 B), stage 5's work on `main` 126 B more, and
  the one card-shape style removed 2,176 B. `lib/umlimator-all.js` is 377.6 kB (377,648 B), up from 276.9 kB in 0.20.0,
  with stage 5's types in it. The npm package is 617 kB, up from 515 kB.

### Also on `main`, provisional until 0.22.0: stage 5's first packages

Stage 5's 5.0 to 5.6 (`docs/diagrams/notes/stage-5.md`) are on `main`, so this release carries them, as 0.19.0 carried
stage 3's: `umlimator/all` draws a version-2 view with `diagram: "uml.component"`, `"uml.deployment"` or
`"uml.composite-structure"`, with ports on borders, delegation lines to inner ports and `labelGaps`; the typed edit
hooks `edits.member` and `edits.key` are in. Their schema, `.d.ts` types, fixtures, examples and conformance notes come
in 0.22.0 (5.8), whose section says what they do. Maps, and the types released before, draw as described above.

### The Bookshop atlas

The maintainer's decision of 13 Nov 2026 (`docs/diagrams/README.md`'s log, `plan.md` §7). The per-type examples stay
the reference; `examples/bookshop-atlas.json` is one model of the Bookshop that holds all of them, joined by drill-down:
the map's three views and the fifteen typed views of `sales-classes`, `order-objects`, `bookshop-packages`,
`checkout-sequence`, `checkout-communication`, `shopping-use-cases`, `fulfil-activity`, `order-states` and
`buy-book-overview`. A reader goes from the map to the sales classes (Database) and on to an order's state machine
(Order), or to what shoppers do (Shoppers), the payment activity (Pay for the order) and the checkout's sequence
(Charge the shopper's card); every view is reached from the map.

- **Assembled, not copied.** `node tools/atlas.mjs` builds it from the example files and `tools/atlas-links.json`, which
  lists the files in order and which element opens which view (each link is the element's `opensView`). One model,
  many views: an element (a node, a member, an edge) whose id is in several files is one element, written once (19 are:
  the class and package files' Order, `sales` and the rest, and the lifelines the sequence, communication and overview
  files share). The files must agree on it: the same type, parent and ends, and any field both set equal; a field one
  leaves out is the other's, a class's members are the union of theirs. A disagreement stops the build, naming the id,
  the files and the field, and the example files are fixed, not the atlas: ids that were different things got their
  own (the lifelines `lifeline-api` and the rest, beside the map's `api`), and the class file's Book, Payable, Payment,
  CardPayment and Money moved into the package file's packages. So does an id that is a view's own element in one file
  and anything in another, a view id in two files, and a node whose id is another file's view (it would open it); a
  field the tool does not know stops it too. `tests/atlas.test.mjs` builds it again and compares it with the committed
  file byte for byte; it also asks for no core error from `validate()`, every view laid out as in its own file (the
  same boxes, lines through the same points), and every drill-down opening a view of the atlas.
- **A map and typed views share one model.** A view with no `diagram` is a map, drawn as before, in a
  `schemaVersion: 2` model too (`model.md` §1, rule 1); nothing had to be left out.
- **Another kind of diagram opens, never unfolds in place** (`src/map/context.js`, 39 B in the core): a card whose inner
  view is a different diagram (a map card opening a use case diagram, a class opening its state machine, an interaction
  use opening its sequence) switches to that view; unfolding it would draw one notation's elements as another's cards.
  A map card and an activity's call behaviour action still unfold as before.
- **What `validate()` says.** Two errors from UML rules, none from the core: the class type's rules run on the whole
  model, so the use case file's generalizations (an actor's, a use case's) are not between classifiers to them.
  `tests/atlas.test.mjs` pins the two.
- **CI.** The atlas is one of `examples/*.json`, so it is rendered, checked with `--expand`, validated against the JSON
  Schema and pictured and printed for the site as the others are; the check loop counts its 6 crossings, the activity's
  4 and the state machine's 2.

## 0.22.0: the component, deployment and composite structure diagrams; diff(), the MCP server, the diff Action and map-repo meet every typed diagram

### The component, deployment and composite structure diagrams

Stage 5 of the plan for 28 diagram types (`docs/diagrams/notes/stage-5.md`). 0.21.0 carried 5.0 to 5.6, provisional
(its section's "Also on `main`"); this section says what they do and what changes from 0.21.0. Everything is additive:
maps, every typed view released before and every earlier example draw as they did in 0.21.0 (`bench/expected.json`,
`tests/core-diet.json`'s fingerprints of every view drawn by `lib/umlimator.js`, the examples' stills). The new code is
in `lib/umlimator-all.js`, except the core's 110 B more than 0.21.0 (the follow-ups; stage 5 in all: 248 B, below).

- **The four sources (5.0).** `src/uml/structure.js`, `component.js`, `deployment.js` and `composite.js`, listed in
  `tools/build.mjs`'s `ALL`, so they ship in `lib/umlimator-all.js` only.
- **Ports on borders and lines from a box's port inward (5.1).** Through the hook the router already had,
  `LP.ports(pushSide, sides)` (`TYPED.loops`, `src/typed/layout.js`): a typed line may name `fromPort` or `toPort`, and its
  end is placed on that port's square, on the side the type gives (`fromSide`, `toSide`), ordered along it by the far
  ends (`portRank` breaks ties); a port with several lines on one face grows by 10 px a line; ports that still leave their
  side at 4 px apart are warned. A line marked `inner` joins a box and something it holds, entering at the box's port
  (the `holds` bypass), and only when it names a port at its inner end. `TYPED.frame` gives a box its `pad` (48 px where
  ports have lines) and `round` (an ellipse round its contents). `labelGaps` (decision 9), a typed view's opt in to the
  map's room for labels, column gaps only: a label with no spot widens its column gap in a second layout pass, kept when
  it leaves fewer issues. `fromPort`, `toPort`, `inner` and `portRank` join the edges' geometry key, `labelGaps` the
  view's. A `socket` line end. All of it is reached only through fields no map and no earlier type sets. (0.27.0, 4b.1: a line's
  `portMin`, a number or `[from, to]`, gives its port's box a least length along the border, its lines centred in it;
  it joins the edges' geometry key beside `fromPort`, `toPort`, `inner` and `portRank`.)
- **The member and key hooks (5.2).** `edits.member(model, view, owner, id, text)`, asked on a member row before the
  panel's own reading; `edits.key(model, view, ids, key)`, asked for a key with no Alt, Ctrl or Meta before the canvas's
  own (`docs/editing.md`). The state machine's activity rows (`entry / …`) go through `edits.member`, with the same
  behaviour; the state type's `member` is a non-enumerable property, so a host copying a type's `edits` copies it by name.
  A node drawn under a geometry id holding `->` is selected, renamed and deleted through the `rename` and `remove` hooks.
- **The structure notation (5.3).** The port, component, ball and artifact shapes and the cube; each port's side chosen
  from the ranking; the ports with no line, the port nodes added back after the layout and the port names, on a copy of
  the geometry; the shared rules `port-owner` and `manifest-ends`.
- **Component diagrams, `uml.component` (5.4).** Components nested in components and packages, ports on borders,
  interfaces as a ball and socket (`present.<id>.as: "ball"`, `B`) or a rectangle, realizations, component realizations,
  usages, assembly and delegation connectors (a delegation with an open arrow at its `to` end, a departure stated in the
  conformance note), artifacts and manifestations; the type ranks its own view; nine rules; a port added as a member row.
- **Deployment diagrams, `uml.deployment` (5.5).** Nodes, devices and execution environments as cubes, nested to any
  depth, their faces inside their frame; artifacts and deployment specifications deployed by nesting or by «deploy»;
  communication paths cut at 280 px; five rules; a drop of an artifact into a node deploys it.
- **Composite structure diagrams, `uml.composite-structure` (5.6).** The subject's box with its ports, parts showing
  their type's ports (drawn under `<part>-><port>`, their side under `present.<part>.ports`), connectors through parts
  (`ends.<end>.part`), open collaborations as dashed ellipses, collaboration uses with role bindings; deleting a part
  deletes its connectors (the type's `refs`); ten rules.
- **A port is not an overlap on its owner (decision 22), and a box's title on two lines (the follow-ups).** The layout
  check (`overlapIssues`, core) passes a typed node against the node its `owner` names, never on a map (where `owner` is
  a team's name); every port is a node of its own again, so selecting a component no longer marks its ports. A device's,
  execution environment's or stereotyped node's box draws its keyword on a line above its name, in 15 px more header
  room (a box's `head`, optional and provisional), measured at 12 px (`headW`), so a long name is not cut; the router's
  reserve over a title and the check's header test take the `head`; the canvas says a selected box by all its title
  lines and F2's field sits over the name.
- **Fixtures, examples, documents (5.8).** `tests/component-`, `deployment-` and `composite-minimal.json` and
  `-stress.json` (`notes/stage-5.md` §13) with `tests/stage5-fixtures.test.mjs` and `tests/stage5.html`; the three
  examples, moved from `docs/diagrams/examples/` (`check.mjs`'s `MOVED`): `examples/bookshop-components.json`,
  `bookshop-deployment.json` and `order-service-structure.json`, in the gallery and CI (render, check, stills, pdf, ajv,
  the diff Action's dry run) and in the Bookshop atlas; the JSON Schema and `.d.ts`; `docs/diagrams/conformance/uml-component.md`,
  `uml-deployment.md` and `uml-composite-structure.md`; the MCP server and the diff Action tested on each (C10).

What moves for a host that upgrades from 0.21.0:

- **Nothing a map or an earlier type does.** The new registry fields (`edits.member`, `edits.key`, a line's `fromPort`,
  `toPort`, `inner` and `portRank`, a box's `pad`, `round` and `head`, a view's `labelGaps`) are optional and
  provisional, read only where a type sets them.
- **The three views now draw as stage 5 designed them, not as 5.0 to 5.6 left them in 0.21.0.** Changed pictures of
  0.21.0's provisional types: a component view's ports are nodes of their own (decision 22); a deployment view's
  keyworded boxes are 15 px taller, their keyword over their name; a composite structure view with ports on parts is
  clean under `check()` (it reported each port against its part); a port with no line keeps off a plain line's end on
  its side (5.8, `src/uml/structure.js`); a component view names an element by its components and packages only, not by
  a node it is deployed on (5.8). The PDF's tables gain rows: a component's connectors from its ports, the subject's
  parts with their aggregation and its connectors, an open collaboration's roles and connectors (the Lines table lists
  only lines between cards, `risks.md` R10).
- **New in the JSON Schema and `lib/umlimator.d.ts`:** the three types' element, member and line types and props
  (`UmlComponentElementType` … `UmlCollaborationUseProps`), a connector's `kind` and `ends.<end>.part`, a part's
  `aggregation`, a collaboration use's `collaboration`, `present`'s `as`, `side` and `ports`; nothing accepted before is
  rejected.
- **The examples moved.** `docs/diagrams/examples/04-composite-structure.json`, `05-component.json` and
  `06-deployment.json` are `examples/order-service-structure.json`, `bookshop-components.json` and
  `bookshop-deployment.json`, with ids changed so the Bookshop atlas can hold them beside the map (elements merge by id):
  the component file's `storefront`, `accounts`, `payment-provider` and `checkout` take a `-component` suffix (their
  ports too), its delegation `checkout-to-payments` is `checkout-payments-out`, its manifestation the deployment file's
  `api-jar-manifests-api`, and its `shop-api.jar` is deployed on the deployment file's Java 21 runtime (`app-server` and
  `jvm` are nodes of its model its view does not list); the deployment file's `edge` and `queue` are `edge-node` and
  `queue-node`, and its view lists its lines; the composite file's class `checkout` is `checkout-class`, labelled
  `CheckoutFlow` (its part is typed `CheckoutFlow`), since a second element labelled Checkout would make the part's type
  ambiguous.
- **The Bookshop atlas** gains the three views: the map's Hosts opens production (deployment), the Java 21 runtime opens
  the components, Shop API the order service's structure. In the atlas's one model the class type's
  `realization-target` calls the component file's two interface realizations (from a port, from a component) wrong;
  `tests/atlas.test.mjs` pins them beside 0.21.0's two `generalization-kinds` (`risks.md` M14).
- **Left out** (`notes/stage-5.md` §17): connector multiplicities; «subsystem» and «specification»; a component's parts as
  a composite structure; black-box compartments; instance-level deployment; a part's own inner structure; ports on roles;
  a role binding to a port; a port's multiplicity; behaviour, service and conjugated ports; XMI; copy and paste;
  ELK in the module. The ELK trial (5.7) has not reported: its outcome closes or re-states
  `risks.md` L9.
- **Layout limits** (`notes/stage-5.md` §13's "As built", each conformance note): the fixtures pin, not clear, part of
  §13's list. On the generated stress views, lines sharing a line or along a box's border, box headers crossed, labels
  on a line, a ball's name under a port and port names over lines (once over a sibling component); on the component
  edge case of ten ports on one side of a box, five held ports overlapping. In Chrome, `risks.md` L17.
- **P1.** On the stress views (CPU, best of seven, a loaded laptop): an edit that moves nothing (a colour) 1 to 37 ms;
  the composite structure's edits 9 to 10 ms; the
  component's and deployment's full layouts and most edits 110 to 140 ms, over the 100 ms target and under CI's 1 s;
  each conformance note has its figures.
- **Size:** `lib/umlimator.js`, what a map host loads, is 185,246 B with this machine's `gzip -9` (0.21.0's measures
  185,136 B on it), 12.30% over 0.16.0 (the budget is 15%): stage 5 spent 248 B of its 300 B (5.1's 138 B: the port hook's
  argument, the `holds` bypass, `TYPED.frame`, the jog repair's guard, `labelGaps`, the registry's pointer lines; the
  follow-ups' 110 B: decision 22's owner skip, the two-line title, `headW` and the canvas's title lines), and 5.8 none.
  `lib/umlimator-all.js` is 378.5 kB (378,464 B), up from 377.6 kB in 0.21.0. The npm package is 620 kB, up from 617 kB.

### C10: the MCP server, the diff Action and the map-repo skill meet every typed diagram

The package after 0.20.0 that stage 3 deferred (`docs/diagrams/notes/stage-3.md` §12, S15), with stage 4's and stage 5's
types folded in (`notes/stage-4.md` §19.5, `notes/stage-5.md` §16.5): class, object, package, sequence, communication, use
case, activity, state machine, interaction overview, component, deployment and composite structure. Additive; maps diff
and walk as before.

- **`diff()` says "moves" where order means something** (risks.md M11), in `lib/umlimator-all.js` (the CLI, the diff
  Action and the MCP server run it), from `src/uml/diff.js` through two hook slots, `TYPED.diff` and `TYPED.order`:
  - a reorder of an element's members (a class's attributes and operations, an object's slots, a state's internal
    transitions, a component's or a structured class's ports and parts): "moves email after name in Customer", or "… to
    the top in …". Members both reordered and edited, or with no ids to tell a move by, still read "changes Customer
    (members)";
  - a reorder of a sequence view's messages and interaction uses, or of a communication view's message ids in its `edges`
    (they give the numbers): "moves validate(order) after charge(total)", or "… to the start". The moved line is marked
    changed (its edited dot) and its view is among `views`. Before, a reorder read nothing at all. The order of the
    model's `edges` draws nothing and reads nothing;
  - a message moved into or out of an operand: "moves orderPlaced into else", as a re-own reads;
  - a sequence view's combined fragments: "adds the par fragment", "removes the opt fragment", "changes the opt fragment
    (props)". Before, they read nothing. The fragments themselves are not marked on the picture, and a reorder of a
    view's `fragments` (drawing order only) reads nothing.

  The moved items are those off one longest run kept in their old order, so a swap of two reads as one move.
  `lib/umlimator.js`, which draws no typed view, says what it said in 0.21.0.
- **`paths()` on a sequence view runs in time order**: a path is a run of messages, each later than the one before and
  sent from the lifeline it reached; the type's own `paths` (registry), as `describe` is. Before, every message was a line
  of a graph with no time, so replies made almost everything a path. Messages in different operands of one `alt` may
  still chain. From a lifeline to itself it gives that lifeline alone, as on a map. `reach()` is unchanged.
- **Tested on every type**: `tests/mcp.py` serves one model of each to the MCP server (its read tools in the type's own
  words, a highlight shown on the diagram the page draws; `paths` in time order on the sequence); `tests/cli.py` runs the
  diff Action's step as CI runs it on one model of each (a reorder reads "moves" on the class, sequence, communication,
  component and composite structure models), and the `map-repo` skill's `cli.py` renders each typed model it is given;
  `tests/typed-diff.test.mjs` pins the words. Stage 5's three are its examples as 5.8 moved them to `examples/`. The
  skill still writes maps only; its pin (v0.20.0) moves at a release, and renders a type only from the release that has
  it.
- **Core**: +183 B gzipped (`gzip -9`: 185,246 B with 5.8 to 185,429 B, 12.41% over 0.16.0), from the reserve (about 567 B of
  its ~750 B left): the two hook calls in `diff()`, the `paths` hook in `paths()`, and the registry's comment.

### Also on `main`, provisional until 0.23.0: stage 6's types

Stage 6's 6.0 to 6.5 (`docs/diagrams/notes/stage-6.md`) are on `main`, so this release carries them, as 0.19.0 carried
stage 3's: `umlimator/all` draws `uml.profile` and `uml.timing` views; `validate()` runs a type's `TYPED.across(model)`
once on the whole model (stereotypes checked where profiles apply), the properties panel takes a type's
`TYPED.fields`, and deleting a timing lifeline or change takes its changes and constraints. Their fixtures, examples,
schema, `.d.ts` and conformance notes come in 0.23.0 (6.6, 6.7), whose section says what they do.

- **Size at release:** `lib/umlimator.js` is 185.6 kB (185,613 B) with `gzip -9`, 12.52% over 0.16.0 (the budget is 15%):
  stage 5's 248 B and C10's 183 B above, and stage 6's 6.1 (180 B) on `main`. `lib/umlimator-all.js` is 412.0 kB
  (412,030 B) with stage 6's types in it. The npm package is 655 kB.

## 0.23.0: the profile and timing diagrams; the 14 UML types complete; the Bookshop atlas holds them all

### The profile and timing diagrams

Stage 6 of the plan for 28 diagram types (`docs/diagrams/notes/stage-6.md`): the last two of UML's 14. 0.22.0 carried
its 6.0 to 6.5 provisionally (the last part of its section); this section says what they do, what 6.6 and 6.7 add, and
what moves from 0.22.0. Everything is additive: maps, every typed view released before and every earlier example but two
draw as they did in 0.22.0 (`bench/expected.json`, `tests/core-diet.json`'s fingerprints of every view drawn by
`lib/umlimator.js`, the examples' stills). The two are the package example, which gains the profile, and the Bookshop
atlas, whose packages view gains it too and which gains the profile and timing views (below). A model with no
`uml.Profile` gets no new problem. The new code is in `lib/umlimator-all.js`, except the core's 180 B for 6.1's slots
(below).

- **The note and the files (#230, 6.0, #231).** The approved design note, every recommendation of its §16 taken (13 Nov
  2026); the four sources `src/uml/stereotypes.js`, `src/uml/profile.js`, `src/layout/timeruler.js` and
  `src/uml/timing.js`, listed in `tools/build.mjs`'s `ALL` only.
- **The core's slots (6.1, #237).** `validate()` runs `TYPED.across(model)` once on a version-2 model, after the typed
  checks, and says its problems once with the types' own (a result that is not a list says nothing). The properties panel
  adds `TYPED.fields(model, element)`'s fields after the type's own, each committed as `set` of its `path`. Both slots are
  empty in `lib/umlimator.js`. A timing view's timeline joins `references()` and `delete`: a change's `lifeline` and a
  constraint's `from` and `to` are references of kind `end`, so deleting a lifeline deletes its changes and their
  constraints, from any view, deleting a change deletes its constraints, and hiding a lifeline keeps them.
- **Stereotypes across the model (6.2, #238).** `src/uml/stereotypes.js` fills both slots: on a model holding a
  `uml.Profile`, every applied stereotype is checked where a profile is applied to the element's packages (the applying
  package included: the nearest-package rule, the maintainer's decision of 13 Nov 2026), against a table of UML 2.5.1's
  metaclasses checked against OMG's `UML.xmi`; the standard profile and Annex C's keywords stay free keywords; required
  stereotypes are supplied by the tool; tags are keyed by stereotype (`props.tags.<stereotype>.<tag>`) and checked by
  definition, type and multiplicity; one field per tag in the panel on every typed view. Nine rules, all warnings but
  `stereotype-abstract`.
- **The time ruler (6.4, #239).** `layoutTimeRuler`, `src/layout/timeruler.js`: one linear time base for every lane,
  derived, 480 to 4,800 px of plot, ticks a 1, 2 or 5 step with minor ticks a fifth of it; constraints in strips under
  the lanes, on levels; message labels kept off steps, values and other labels or reported (`timing-label`); hostile
  times reported, not drawn (`change-time`, `constraint-kind`); changes too close at the 4,800 px cap drawn on one
  unit, their values cut, and reported (`timing-dense`, a warning).
- **Profile diagrams, `uml.profile` (6.3, #240).** Profiles as packages and boxes, stereotypes with their tag
  definitions, «metaclass» references, extensions with a filled triangle and `{required}`, «apply», generalizations
  between stereotypes; an element's tags in a compartment per stereotype; five rules of its own and the class type's
  `generalization-kinds`, which now takes a generalization between two stereotypes. The class type's tables gain the
  keywords and the two lines, its package-like tests count a profile, `src/typed/draw.js`'s `ENDS` a `filled-triangle`.
- **Timing diagrams, `uml.timing` (6.5, #241).** Lifelines as lanes on the ruler, each a step line over its states or a
  band of values (`present.<id>.as: "values"`, `S`); call, async and reply messages at their times; duration and time
  constraints; ten rules; changes added, moved and renamed by pointer, Alt + arrows and F2's `state @ t` and
  `label @ t1 → t2`, snapped to minor ticks, never onto another change's instant; Delete hides a lifeline (its changes
  stay), Shift + Delete deletes it with them, counted on the hint line.
- **Fixtures, examples, documents (6.6).** `tests/profile-` and `timing-minimal.json` and `-stress.json`
  (`notes/stage-6.md` §11) with `tests/stage6-fixtures.test.mjs` and `tests/stage6.html`; the two examples, moved from
  `docs/diagrams/examples/` (`check.mjs`'s `MOVED`, its hand timing rule gone, the timing type's rules running there):
  `examples/bookshop-profile.json` and `bookshop-timing.json`, in the gallery and CI (render, check, stills, pdf, ajv, the
  diff Action's dry run); the JSON Schema and `.d.ts`; `docs/diagrams/conformance/uml-profile.md` and `uml-timing.md`; the MCP
  server and the diff Action tested on each (C10). A timing lane is a holder (`holder: true` on its geometry), so the
  layout check does not report its own rows, changes and labels as overlaps; nor, in the browser's text checks
  (`auditSvg`), any text, header or line label over a lane, its own or not: the timing views are held to §11's
  predicate in `tests/stage6-fixtures.test.mjs` instead.
- **The Bookshop atlas, full pass (6.7).** The atlas holds a view of each of UML's 14 diagram kinds: the profile and
  timing examples join it (`tools/atlas-links.json`'s sources), and both are reached from the map by drill-down. The
  package example shows the profile `BookshopConventions` and `sales`' «apply» line to it, and the profile opens the
  profile view; `fulfil-activity`'s "Record the payment on the order" opens the timing view (decision 18).
  `tools/atlas.mjs` carries the new fields (`tags`, `states`, `sentAt`, `receivedAt`, `isRequired`, a view's `timeline`,
  whose changes and constraints are the view's own elements). Twenty-nine elements are now shared by several files, four
  more than 0.22.0's 25: `order.placedAt` (gaining «column» and its tags in the atlas, which the class view does not
  draw), the profile and its application, and `lifeline-worker`. `tests/atlas.test.mjs` pins them, the three classes
  of `sales` that get the required «owned», and that deleting `lifeline-worker` from the sequence view takes its timing
  changes and their constraints.

What moves for a host that upgrades from 0.22.0:

- **Nothing a map or an earlier type draws.** The slots (`TYPED.across`, `TYPED.fields`) are empty in `lib/umlimator.js`
  and provisional; a model with no `uml.Profile` validates as before.
- **Two behaviours change, both on purpose** (0.22.0 carried them provisionally; 0.21.0 had neither): a generalization
  between two stereotypes is no longer an error of the class type's; deleting a lifeline (on any view) deletes its
  timing changes and their constraints, and deleting a change its constraints, where 0.21.0 left them naming nothing.
  `references()` lists them.
- **Stereotypes may now be warned** (as 0.22.0 did provisionally) in a model that holds a profile: inside a package that
  applies it, a name the profile does not define (and that is neither a standard stereotype nor a keyword), one that
  does not fit its element, tags that are undefined, mistyped or missing. Outside every applied profile a name is a
  keyword, as before.
- **New in the JSON Schema and `lib/umlimator.d.ts`:** the two types' element, member and line types and props
  (`UmlProfileElementType` … `UmlTimingPresent`), `props.tags` keyed by stereotype (`UmlTags`), a lifeline's `states`, an
  extension's `isRequired`, a message's `sentAt` and `receivedAt`, a timing view's `timeline` (`UmlTimeline`), `present`'s
  `as: "values"`; nothing accepted before is rejected.
- **The examples moved.** `docs/diagrams/examples/07-profile.json` and `14-timing.json` are
  `examples/bookshop-profile.json` and `bookshop-timing.json`, revised so the Bookshop atlas can hold them (elements
  merge by id): Order applies «entity», as the class example has it, its tags keyed by stereotype; «owned»'s `team` tag
  and `placedAt` are `0..1`; the timing file's lifelines take the overview's and the sequence's ids, `lifeline-worker`
  and `lifeline-payments`, and its view is `one-charge` (`charge` is an action of the activity example).
- **The package example's picture changes** (decision 18, as DoD 12 allows): `examples/bookshop-packages.json` gains the
  profile `conventions` (a closed «profile» folder) and `sales-applies-conventions` («apply»), listed third among the
  view's lines (listed last, catalog's «import» to shared went undrawn on the down layout, with no check finding). Its
  stills, `describe()` (17 elements and 6 lines) and PDF rows change; the package type's tests keep the example as
  stage 2 made it, and one test draws the new one. The atlas changes with it: its packages view draws the profile and
  the «apply» line, it gains the views `profile` and `one-charge`, and its stills and PDF on the site change.
- **Known gap** (6.1's finding; a follow-up package after stage 6, the maintainer's decision of 13 Nov 2026): with every
  type's rules, deleting an element can leave a model that fails `validate()` under four earlier types' rules
  (`extend-points`, `message-link`, `reply-once`, `subject-shown`): 29 of 1,495 deletes over the examples and targets
  (`risks.md` M15). No stage 6 delete leaves a change or constraint naming what is gone.
- **Decisions of 13 Nov 2026:** every recommendation of the note's §16; no comments on a timing view (decision 24); a
  change is named by its id on the hint line and in `L`'s search, with no core bytes (decision 25).
- **Left out** (`notes/stage-6.md` §15): stereotype icons and custom shapes, a profile's imports, `isStrict`, OCL
  constraints, stereotype operations and associations, list-valued tags, nested profiles, `sysml.` types against
  metaclasses, tags drawn on other types' views, XMI profiles; continuous timelines, message events as constraint ends,
  found and lost messages, destruction, observations, gates, create and delete messages, ruler breaks, a stored scale, an
  `sd` frame, comments on a timing view; copy and paste, per-type `diff()` writers, a reader (Mermaid has neither type).
- **Layout limits** (each conformance note): the profile stress view's generated `all` crosses 17 times right and 30
  down (repair and rerouting off); the timing stress view's `all` has five crowded message labels the ruler does not
  count; a long member row of tags, a lifeline's name over 160 px and a value in a short segment are cut, whole in the
  accessible names and the PDF.
- **P1.** On the stress views (CPU, best of seven, a loaded laptop): profile, a full layout 73 to 82 ms, a tag value
  14 to 28 ms, a stereotype added 73 to 81 ms; timing, a full layout and every common edit under 6 ms; the cross-model
  check alone on 2,000 elements 11 ms against 10 ms, held linear. CI holds 1 s and prints the figures.
- **Size:** `lib/umlimator.js`, what a map host loads, is 185,613 B with this machine's `gzip -9`, as in 0.22.0, which
  carried 6.1's bytes: 12.52% over 0.16.0 (the budget is 15%). Stage 6 spent 180 B of its 300 B, all in 6.1 (the two
  slots and the registry's pointer line 111 B, the timeline in `references()` and `delete` 69 B); 6.2 to 6.7 none.
  `lib/umlimator-all.js` is 412.0 kB gzipped (412,038 B), 8 B over 0.22.0's 412,030 B. The npm package is 658 kB, up
  from 655 kB.

### A delete never leaves a model failing `validate()` (#245)

Deleting an extension point also deletes every extend left naming no other point of its use case, in one transaction,
and the hint line names them; a communication view's delete names the messages it takes. In a composite structure view
whose subject has been deleted or hidden, `subject-shown` and `binding-ends` are warnings, not errors.
`tests/delete-cascade.test.mjs` deletes every element of every example, target and the atlas, one at a time, by Delete
and Shift + Delete, and finds no new error.

### Also on `main`: milestone 2's and milestone 4b's listed files

M2.0 (#247) and 4b.0 (#248) list the next milestones' sources, empty, in `lib/umlimator-all.js` (blank lines only),
and M2.0 gives the ER, flowchart, data flow, information flow and C4 target examples their own ids. Nothing is drawn by
them yet.

- **Size at release:** `lib/umlimator.js` is 185.6 kB (185,613 B) with `gzip -9`, as 0.22.0, 12.52% over 0.16.0 (the
  budget is 15%). `lib/umlimator-all.js` is 412.8 kB (412,830 B). The npm package is 659 kB.


## 0.24.0: the ER, flowchart, data flow, information flow and C4 diagrams; four readers; the Bookshop atlas opens at C4

Milestone 2 of the plan for 28 diagram types (`docs/diagrams/notes/milestone-2.md`), merged to `main` before 0.24.0 ships
(after 0.23.0), provisional until then. Everything is additive: maps, every typed view released before and every earlier
example draw as they did in 0.23.0 (`bench/expected.json`, `tests/core-diet.json`'s fingerprints, the examples'
stills), but for the one defect fixed below and the Bookshop atlas, which gains the five diagrams and a new root. The
new code is in `lib/umlimator-all.js`, except M2.1's core bytes (below).

- **The files and ids (M2.0, #247).** Ten sources, empty, in `tools/build.mjs`'s `ALL` after stage 6's: `src/er/er.js`,
  `src/flowchart/flowchart.js`, `src/dfd/dfd.js`, `src/uml/information.js`, `src/c4/c4.js`, `src/c4/views.js` and the
  four readers. The five target examples take their own ids (`er-`, `dfd-` and `c4-` prefixes, the flowchart's and
  information flow's renames), so the Bookshop atlas shares only the elements meant to be shared; C4's container and
  component views list their subject.
- **The engine's slots (M2.1, #253).** `apply()` gains `addView { view, index? }`: a view added at an index or at the
  end, refused when its id is taken or it is not an object with a string id; undone like every command; no command
  deletes a view. A type may give `text(model, view, id)`, which the PDF's lines table shows in place of a line's `label`
  (`docs/diagrams/risks.md` R9). **Fixed:** a card in a typed view that opens a view of its own kind opens it instead of
  unfolding in place through the map's code, unless its type says `unfolds: true` (a class card used to unfold into a
  plain box and lose its classifier). The activity type sets `unfolds`, so a call behaviour action still unfolds its
  activity; a view that says `diagram: 'map'` unfolds as one with no `diagram`.
- **The entity-relationship diagram, `er` (M2.2, #258).** Tables with their key columns first; relationships in crow's
  foot or IDEF1X (`view.notation`), one geometry, so a switch only repaints; identifying solid, non-identifying dashed.
  Each column is a row `name type [PK] [FK table.column] [UK] [NULL]`: a type of several words, a name with a space in
  double quotes, a row whose brackets do not pair refused; `FK` names the referenced column by its table's and its own
  labels, or its id. Ten rules (`pk-exists`, `column-names`, `fk-target`, `fk-flag`, `relationship-fk`,
  `identifying-key`, `identifying-parent`, `relationship-ends`, `relationship-tables`, `notation`). The legend keys each
  line style and end drawn and IDEF1X's dependent entity. A column deleted, the notation switched and a column's flags as
  fields have no canvas gesture: a host does them through `apply()`. `src/typed/draw.js` exports `ENDS`; the type adds
  its six ends at load.
- **The flowchart, `flowchart` (M2.3, #259).** Ten symbols (terminator, process, decision, input/output, predefined
  process, document, database, manual input, delay, connector) and a comment; laid out down unless the view says right.
  Five rules (`flow-ends`, `start-end`, `terminator-flows`, `decision-exits`, `reachable`); decision labels compared
  trimmed and case aside. Accessible names say each decision's exits and whether a terminator is a start or an end; the
  reading order runs from the start. A decision's second exit is labelled to answer its first; a flow is not dragged
  ("A flow follows its nodes: move a node instead"); the PDF flags a decision's exit with no label.
- **The data flow diagram, `dfd` (M2.4, #260).** Processes, stores and external entities in Yourdon or Gane and Sarson
  (`view.notation`, a repaint); numbers stored and checked under the parent process's; `D` on a process makes its level,
  balanced from the start; balancing checks the flows each view draws, so hiding a flow or its far end on a level breaks
  it as deleting it does; a level draws only its own flows. Six rules (`dfd-flow-process`, `dfd-process-io`,
  `dfd-flow-label`, `dfd-numbers`, `dfd-balance`, `dfd-level`). A long number is cut.
- **The information flow diagram, `uml.information-flow` (M2.5, #261).** Classes, interfaces, components and actors
  in their own types' looks; information items as a classifier with a filled triangle; flows as dashed lines with an
  open arrow, labelled «flow» then what they convey. A flow conveys information items, classes, interfaces, components or
  signals, each once (UML 2.5.1); four rules (`conveyed-some`, `conveyed-kind`, `conveyed-once`, `flow-ends`).
  Connecting asks what the flow conveys; F2 edits a flow's text as drawn (`[name:] Order, Card details`); deleting an
  element drops it from every flow, and Shift + Delete takes a flow left conveying nothing, said on the hint line. The
  PDF lists what each flow conveys, and each conveyed element's flows.
- **C4's static views (M2.6, #262).** `c4.landscape`, `c4.context`, `c4.container`, `c4.component`: people, software
  systems, containers and components on the map's card shapes (`props.shape`), external ones grey; the view's subject a
  dashed boundary when listed; implied relationships one dashed line a pair, never edited, their accessible name saying
  what they stand for; `D` makes a system's container view or a container's component view; `T` changes an element's C4
  type; the key lists each element type and shape drawn. Errors `c4-level`, `c4-subject`, `c4-owner`, `c4-instance`,
  `c4-relationship`; warnings `c4-zoom`, `c4-description`, `c4-technology`, `c4-label`, `c4-title`.
- **C4's dynamic and deployment views (M2.7, #263).** `c4.dynamic`: steps are relationship ids in the view's `edges`,
  each once, numbered among the steps drawn, reordered by Alt + arrows; a step that is no relationship is an error, a
  view with no step a warning (`c4-steps`); adding on a dynamic view puts the element in its subject. `c4.deployment`:
  deployment nodes nest as boxes, container instances drawn as their containers; a relationship with an end in or on a
  node drawn as a box is not drawn, and `c4-box-line` says which; deleting a container deletes its instances (`refs`).
- **The readers (M2.8 to M2.11, #254 to #257), internal until the registry is public.** `readMermaidEr` and
  `writeMermaidEr`: every construct on Mermaid 12.3.0's ER page, ids and references kept in `%% id:` and
  `%% references:` comments, what Mermaid cannot carry named in `%% not written:`. `readMermaidFlowchart` and
  `writeMermaidFlowchart`: ported from the map importer, with Mermaid's `@{ shape: … }` form; reads in linear time where a
  bracket is never closed. `readStructurizr(workspace)`: people, systems, containers, components, deployment nodes,
  instances, relationships and the six view kinds; ids from the DSL's identifiers or names, never Structurizr's numbers;
  shapes from the workspace's element styles. `readDbml(database)`: a `Database` that `@dbml/core` parsed (or its
  `export()`), as one `er` view; umlimator does not depend on `@dbml/core`. Each reports what it skipped or
  approximated, never throws, and holds counts and nesting to limits (§8).
- **The CLI (M2.12, #264).** `umlimator.py import` reads a Mermaid `erDiagram` (one er view), a Mermaid flowchart given
  `--typed` (one flowchart view; without it, a map as before), a Structurizr JSON workspace (typed C4) and a `.dbml` file
  (through the `@dbml/core` Node finds from the working folder; not installed by umlimator) through the readers in Node.
  `--typed` on a source with no typed reader is refused, nothing written; a Structurizr JSON or DBML file over 1 MiB is
  refused before it is parsed; an `@dbml/core` that does not load is named as the install's fault.
- **The Bookshop atlas (M2.13).** The five examples join it, elements merged by id: the information flow example's
  shopper and the component example's storefront, Shop API and payment provider are one element each (32 shared now,
  29 in 0.23.0). The C4 system context is the atlas's root (decision 20); the map's overview is in the views list. The C4
  elements open the views their design is in: the database the schema, the order worker the fulfilment activity, the
  storefront what travels with an order, checkout the checkout sequence, the order store the data flow, the shopper the
  use cases, shop staff the returns flowchart, the Shop API's instance the production deployment. `tools/atlas.mjs`
  carries the milestone's props.
- **Fixtures, examples, documents (M2.14).** `tests/er-`, `flowchart-`, `dfd-`, `information-flow-` and `c4-minimal.json`
  and `-stress.json` (§10) with `tests/m2-fixtures.test.mjs` (each view laid out right and down, what `check()` finds
  pinned, every case of §10, the readers' construct files through their types' `validate`, §11's budgets) and
  `tests/m2.html` (every view in Chrome, three fonts, both themes, and each atlas link opened in the page); the five
  examples moved from `docs/diagrams/examples/` to `examples/` (`check.mjs`'s `MOVED`), in the gallery and CI; the JSON Schema and `.d.ts`; `docs/diagrams/conformance/er.md`, `flowchart.md`, `dfd.md`,
  `uml-information-flow.md` and `c4.md`; `tests/notation.html` checks the six ER ends, «flow» and the implied line; the
  MCP server, the diff Action and map-repo's CLI tested on each (C10).

What moves for a host that upgrades from 0.23.0:

- **Nothing a map or an earlier type draws.** `lib/umlimator.js` draws the five types as plain cards with a warning, as
  it does every type it does not hold.
- **One behaviour changes, a defect fixed:** pressing E (or Alt + click) on a typed view's card that opens a view of its
  own kind now opens that view; before, a class card unfolded into a plain box through the map's code. The activity's
  call behaviour action still unfolds (`unfolds: true`), so CI's crossing counts and `fulfil`'s unfolded picture hold.
- **New in `apply()`:** the command `addView`. A host that lists commands by `op` meets a new one; the `edit` event
  carries it from `D` on a data flow process or a C4 system or container.
- **New in the registry, provisional:** a type's `text(model, view, id)` and `unfolds`. `ENDS` in `src/typed/draw.js`
  takes rows from a family at load.
- **New in the JSON Schema and `lib/umlimator.d.ts`:** the five types' element, member and line types and props
  (`ErColumnProps`, `ErRelationshipProps`, `FlowchartElementType`, `DfdNumberProps`, `UmlInformationFlowProps`,
  `C4ElementProps`, `C4RelationshipProps`, `C4ViewType`, …), `notation`'s values, a C4 view's `subject` and `addView` in
  `Command`; nothing accepted before is rejected (ajv: the 28 examples and the ten new fixtures valid).
- **`umlimator.py import`** reads four more sources typed; nothing it read before reads differently, and a Mermaid
  flowchart is still a map unless `--typed` is given.
- **The examples moved.** `docs/diagrams/examples/15-information-flow.json`, `20-entity-relationship.json`,
  `21-flowchart.json`, `22-data-flow.json` and `23-c4.json` are `examples/order-information-flow.json`,
  `bookshop-schema.json`, `returns-flowchart.json`, `bookshop-data-flow.json` and `bookshop-c4.json`, unchanged in
  content. The atlas's stills and PDF on the site change: it opens at the C4 context and holds 33 views.
- **Decisions:** every recommendation of the note's §14, decision 18 the maintainer's (b); the choices each package
  took under the maintainer's standing approval (14 Nov 2026) are in the note's "Amended in" paragraphs (§7.1 to §7.5.5,
  §12.5).
- **Known gaps:** a link to a view on an element that every view draws as a box cannot be opened from the page (Enter
  opens a card only): the atlas's `bookshop-packages/sales` and `bookshop-deployment/jvm`, from stages 5 and 6, are
  reached from the views list (M2.13 moved C4's own link from the web host, a box, to the Shop API's instance). A
  single delete can leave a new error in a C4 or DFD model: deleting a view's subject (`c4-subject`, `c4-level`), or
  deleting or hiding a level's external entity or store (`dfd-balance`); `risks.md` M15, for the types' `remove` hooks.
- **Left out** (`notes/milestone-2.md` §13): Chen's notation, IDEF1X's key-based level, lines on columns, subtype
  clusters, SQL DDL, a DBML writer; ISO 5807's other symbols, the off-page connector, swimlanes, groups; unfolding a DFD
  level in place, data dictionaries, control flows; information flow ends beyond §3's and the «flow» line on other UML
  views; C4's code diagram, software system instances, infrastructure nodes, groups, repeated or parallel steps,
  instance relationships derived from containers', filtered views, a Structurizr writer, conversion from a map; for all
  five, deleting a view, copy and paste, per-type `diff()` writers, stereotypes on the non-UML types.
- **Layout limits** (each conformance note): with repair and rerouting off, `bookshop-c4.json` keeps 8 crossings over its
  views in Node (14 as Chrome measures text) and `bookshop-data-flow.json`'s level 1 two; the stress views' generated
  `all` cross more (C4's crowded container view also runs lines through cards it could not route round).
- **P1.** On the stress views (CPU, best of seven, an Apple laptop under load): ER, a full layout 28 to 54 ms, a column
  added 24 to 48 ms, a notation switch 10 to 16 ms laying nothing out; flowchart 33 to 67 and 31 to 63 ms; data flow 38
  to 59 and 37 to 63 ms; information flow 118 to 211 and 121 to 229 ms; C4 109 to 229 and 117 to 237 ms. CI holds 1 s and prints each against the 100 ms target.
- **Size:** `lib/umlimator.js`, what a map host loads, is 185,873 B with this machine's `gzip -9` (`v0.23.0`'s file
  185,600 B on the same machine): 12.68% over 0.16.0 (the budget is 15%). Milestone 2 spent 273 B of its 1,400 B share,
  all in M2.1 (read from stdin; `gzip -9c` on the file stores its 13-byte name too, 286 B); the five types, the readers,
  the CLI, M2.13 and M2.14 none.
  `lib/umlimator-all.js` is 484,838 B gzipped (`v0.23.0`'s 412,813 B on the same machine). The npm package is 735 kB.

## 0.25.0: SysML v1.7's requirement, block definition, internal block and parametric diagrams; the Mermaid requirement reader and writer; the e-bike atlas

Milestone 3 of the plan for 28 diagram types (`docs/diagrams/notes/milestone-3.md`), merged to `main` before 0.25.0 ships
(after 0.24.0), provisional until then. Everything is additive: maps, every typed view released before and every earlier
example draw as they did in 0.24.0 (`bench/expected.json`, `tests/core-diet.json`'s fingerprints, the examples' stills),
but for the one changed rule below and the four SysML targets, which draw for the first time. The new code is in
`lib/umlimator-all.js`, except M3.1's 24 core bytes.

- **The files and targets (M3.0, #265).** `src/sysml/sysml.js`, `requirement.js`, `blocks.js`, `internal.js`,
  `parametric.js` and `src/readers/mermaid-requirement.js` in `tools/build.mjs`'s `ALL`, after milestone 2's and before
  milestone 4b's. 17's `range-equation` and parts agree with 18 and 19; 19's view is `range-analysis` (it was `range`).
- **SysML's base (M3.1, #269).** One table says what each SysML type is in UML (its metaclass, the stereotype it implies,
  the UML type it is projected to), read by the stereotype check, the keywords, the projection and the reader: a profile
  extending `Class` fits a block, one extending `Property` a value property, and «rationale» or «block» in a profile's
  scope is not warned. Every SysML view is drawn in a frame with SysML's pentagon header, `kind [ElementType] name [view
  title]`, cut to the frame and said whole in its accessible name; a frame names only the element types its diagram kind
  allows (a package on req and bdd, a block on ibd, a block or a constraint block on par), any other subject `[Model]`. A
  card dropped on a frame that is no element is reparented to the view's subject, or none (24 core bytes). A compartment
  may be titled, and a classifier's accessible name may be the type's own (`title`, `ariaOwn`, fields no UML type sets).
  A crosshair line end. A proxy or full port with no name shows its id after «proxy» or «full»; on a parametric view a
  property added to a constraint block becomes a parameter, or a constraint property when typed by a constraint block.
  **Changed:** the class diagram's `generalization-kinds` leaves a generalization with an end of another notation (a
  SysML block, a C4 element) to that notation's rules; untyped ends, and types that name no notation, are still checked.
- **The requirement diagram, `sysml.requirement` (M3.2, #274).** Requirements with «requirement» and their id and text,
  wrapped at 224 px (`present.<id>.rows` caps it); Mermaid's five kinds as stereotypes; `risk` and `verifyMethod`.
  Containment is `parent`, drawn as a derived crosshair line between requirements and as a box for a package. Twenty
  rules (SysML's constraints errors, what is usual warnings). A view that lists its own `edges` draws and describes only the
  six relationships and comment links; a long chain no longer runs out of stack when ranked; `describe()` prints no ".;"
  after a text ending in a full stop. Shift + Delete on a requirement re-homes what it contains.
- **The block definition diagram, `sysml.block-definition` (M3.3, #275).** Blocks, interface blocks, constraint blocks and
  value types with SysML's named compartments, on the class type's lines. A part association drawn to a constraint block
  adds a constraint property; to a value type, an interface block or a package it is refused. A member of a type with no
  SysML kind is drawn in "other members" and reported by `member-kinds`. An interface block holds only proxy ports; a value
  type only value properties and operations. A view naming an element not in the model is laid out and checked instead of
  throwing. A port kind or flow direction SysML does not have is shown as stored in its row.
- **The internal block diagram, `sysml.internal-block` (M3.4, #276).** The subject a frame, its parts, references and
  values inside, ports on borders with their kind and flow arrows, `~` conjugation, item flows as labels and triangles.
  F2 and a port's member row take a `~` off and put it back; F2's text starting `«proxy»` or `«full»` sets the kind; an edit
  that changes nothing says nothing; a member row keeps its member's kind; an item flow is drawn only with both an item
  and a direction (`item-flow` warns otherwise); two proxy ports conjugated alike pass `port-compatible` when every flow
  property is `inout`; a block's card other than the subject is named "Block".
- **The parametric diagram, `sysml.parametric` (M3.5, #279).** Constraint properties with rounded corners and their
  block's expression, parameters on their borders, a constraint block subject's own on the frame; binding connectors. A
  binding drawn from the canvas runs from the value and carries `ends.to.part`; one to a constraint property's box is
  refused. Six rules (`subject-kind`, `binding-ends`, `binding-parameter`, `binding-types`, `parameter-bound`,
  `connector-drawn`). Member rows `name : Type` and `param name : Type`. A parameter's name is kept inside the frame.
- **The Mermaid requirement reader and writer, and the CLI (M3.6, #283).** `readMermaidRequirement` and
  `writeMermaidRequirement` (`lib/umlimator-all.js`): the six kinds, `element`s as blocks or test cases, `contains` as
  `parent`, the six relationships, `direction`; 1 MiB, a one-pass scanner, prototype-free tables, a containment cycle found
  by one colouring pass, each bad line skipped and reported; the writer's `%% id:`, `%% text:` and `%% name:` comments read
  back as untrusted input. `umlimator.py import` reads a `requirementDiagram` (it was refused).
- **Fixtures, examples, the e-bike atlas, docs (M3.7).** The four targets moved to `examples/ebike-requirements.json`, `ebike-blocks.json`, `ebike-structure.json` and `ebike-range.json`, every element two of them share written alike (CargoBike, EBike before the examples became the bookshop's delivery bike, whole in the blocks, structure and range files; Battery, Controller, Motor, Dock, Light and the interface and constraint blocks in each that uses them; the requirements file names its blocks only), so each view draws in the atlas as in its own file; the blocks view lists its own `edges`. `tools/atlas.mjs` takes `--links` and `--out` and carries SysML's props; `tools/ebike-links.json` builds `examples/ebike-atlas.json`, rooted at the requirements. `tests/*-minimal.json` and `*-stress.json` for the four types, `tests/sysml-fixtures.test.mjs`, `tests/sysml.html`, `tests/ebike-atlas.test.mjs`; the schema and `.d.ts` name SysML's vocabulary; the MCP server, the diff Action and the skill's CLI tested on each.
- **Left out** (`notes/milestone-3.md` §17): SysML v2; the other five SysML diagrams (UML's types here); allocations; views
  and viewpoints; requirement tables; nested parts and connector ends; flow ports; solving equations; XMI; copy and paste.
- **Known gaps:** a block definition view draws every model line between its blocks, connectors and bindings too, unless
  it lists its `edges`; laid out down, a constraint block subject's parameters on the frame's top cross its header band;
  the conformance notes cite SysML's constraints by stereotype, their sub-clause numbers not yet quoted from the PDF.
- **P1.** On the stress views (CPU, best of seven, an Apple laptop under load): the requirement diagram, a full layout
  and its SVG 561 ms, a text edited 590 ms, a satisfy added 543 ms, a containment line deleted 495 ms (over the 100 ms
  target, the type's ranking inside each edit); block definition 66, 60 and 68 ms; internal block 43, 42 and 45 ms;
  parametric 101, 80 and 96 ms. CI holds 1 s and prints each against the 100 ms target.
- **Size:** `lib/umlimator.js`, what a map host loads, grows by M3.1's 24 B with this machine's `gzip -9` (185,873 B to
  185,897 B, against milestone 3's 500 B share); M3.2 to M3.7 none.

### Also on `main`, provisional until their releases: milestones 4a and 4b's types

The mindmap (4a.4), the cloud family for Google Cloud and Azure (4a.6, AWS behind `CLOUD_AWS` until 4a.8), the icon
packs (4a.3), the tree layout (4a.1), a deep chain made linear in the core (4a.2), the Mermaid mindmap reader (4a.5),
and BPMN's engine, notation, type and XML adapter (4b.1 to 4b.4) are on `main`, so this release carries them; their
fixtures, examples and documents come in 0.26.0 and 0.27.0, whose sections say what they do.

- **Size at release:** `lib/umlimator.js` is 186.2 kB (186,174 B) with `gzip -9`, 12.86% over 0.16.0 (the budget is
  15%). `lib/umlimator-all.js` is 590.2 kB (590,184 B). The npm package is 845 kB.

## 0.26.0: the mindmap; Google Cloud, Azure and AWS diagrams; icon packs fetched after the vendor's terms

Milestone 4a of the plan for 28 diagram types (`docs/diagrams/notes/milestone-4a.md`), merged to `main` before 0.26.0
ships (after 0.25.0), provisional until then. Everything is additive: maps, every typed view released before and every
earlier example draw as they did (`bench/expected.json`, the examples' stills, every earlier test), but for the three
logo rows below, the three examples moved below, and the Bookshop atlas, which gains them. The new code is in
`lib/umlimator-all.js` and the CLI, except 4a.2's core bytes.

- **The files and ids (4a.0, #265).** `src/layout/tree.js`, `src/mindmap/mindmap.js`, `src/readers/mermaid-mindmap.js`
  and `src/cloud/cloud.js` in `tools/build.mjs`'s `ALL` after milestone 4b's. The four target examples take the atlas's
  prefixes (`mm-`, `gcp-`, `az-`; AWS's keeps its ids until 4a.8) and the packs' own icon ids
  (`Front-Door-and-CDN-Profiles`, `Storage-Accounts`, `App-Services`, `Key-Vaults`, `Amazon-Simple-Storage-Service`…);
  the mindmap gains a Hosting branch.
- **The tree strategy (4a.1, #270).** `layoutTree(input)`, a pure function (no DOM, no model): each subtree a band,
  bands stacked, a topic centred on its children's; two iterative passes, so a chain of 20,000 lays out; sides from
  `side`, else the half whose first-level bands are shorter so far, right on a tie. Problems are returned, never warned.
- **A deep chain, linear (4a.2, #278).** `apply()`'s `delete` no longer recurses: a 20,000-level `parent` chain deletes
  (one of 6,000 threw a `RangeError` before), the deleted elements leave each list in one pass (a flat 20,000-topic root
  in 13 ms, 128 ms before), and what stays under a gone chain finds its nearest owner once per gone id. `validate()`'s
  cycle check is linear (9 ms at 20,000 deep, 9.5 s before) and reports each cycle where and in the order it did. No
  output changes: lists keep their order, an element listed twice loses only its first place.
- **Icon packs (4a.3, #271).** `umlimator.py pack list` and `umlimator.py pack fetch gcp|azure` (`umlimator_packs.py`),
  from `icons/packs.json`: the vendor's terms shown in full and a yes typed, or `--accept-terms <pack>@<label>`, which
  prints them and is recorded as given by flag, before any byte is downloaded; each zip read no further than its pinned
  size and checked by SHA-256, Azure's terms PDF by its pinned hash; kept in `<icon cache>/packs/<pack>/<label>/` with
  `accepted.json`; members read in memory, never extracted. A render reads a fetched pack into the page's `icons` table
  (`<pack>/<id>`: `{ src, dark, name }`, and Google's `gcp/`: `{ legal }`), never downloads one, and says once per pack
  how to fetch it; `UMLIMATOR_NO_PACKS=1` draws glyphs whatever the cache holds. `check` names an icon id a pack lacks
  with its three nearest ids. Google's two zips and Azure's V25 zip (with its
  `Microsoft_Terms_of_Use.pdf`) are pinned, as AWS's is, so `pack fetch` works for all three clouds. CI tests every path on a synthetic pack it builds
  (`tests/packs.py`) and never contacts a vendor.
- **The mindmap, `mindmap` (4a.4, #281).** Topics as rounded boxes (the root 15 px, the rest 13 px, four lines of 200
  px), laid out by `layoutTree`, branches as curves in the map's kind palette, 2.5 px from the root and 1.5 px below.
  Four rules (`topic-parent`, `mindmap-root`, `side-first`, `mindmap-depth`). `N` adds a child; Alt + arrows move a topic
  among its siblings, promote, demote and change side; a drop on a topic reparents, between siblings reorders, on the
  root's other half changes side; Delete hides a branch, Shift + Delete deletes it, the outline's Show brings back a
  topic and what was hidden with it; L is refused, said. A topic that opens a view carries the drill-down mark.
- **The Mermaid mindmap reader and writer (4a.5, #280).** `readMermaidMindmap` and `writeMermaidMindmap`, internal,
  against Mermaid 12.3.0: indentation is the tree (a tab counts one, as Mermaid's lexer counts it); five shapes, icons,
  classes and Markdown strings kept under `ext.mermaid`, written back, reported `approximated`; sides and drill-downs in
  `%% side:` and `%% opens:`. Over 1 MiB refused; deeper than 64 levels hung at 64; never a throw. `umlimator.py import`
  reads a `.mmd` mindmap through Node.
- **Google Cloud and Azure, `gcp` and `azure` (4a.6, #282).** One family in `src/cloud/cloud.js`: groups as boxes
  titled "<label> [<kind>]", dashed for a region or a zone; each product or service a card with the vendor's icon from the
  host's `icons` table, 32 px on a 39 px tile, through `<image>` from a data URL only, with `meet` and nothing that crops
  or alters it, the full service name under its label, a glyph where the table has none; lines with an open arrow that
  may start or end at a group's border. Google's legal line under any picture that draws a Google icon, in its legend and
  `describe()`. Five rules (`group-kind`, `group-nesting`, `line-inside`, `icon-set`, `icon-missing`); a line between a
  group and what it holds is refused. The `aws` definition is built and tested with them, behind `CLOUD_AWS = false`:
  not registered, on no surface of `lib/umlimator-all.js` until 4a.8.
- **Fixtures, examples, atlas, docs (4a.7).** `docs/diagrams/examples/25-mindmap.json`, `27-gcp.json` and
  `28-azure.json` are `examples/bookshop-opening-plan.json`, `bookshop-gcp.json` and `bookshop-azure.json`
  (`check.mjs`'s `MOVED`), their `iconPacks` the pins' labels (`gcp` `2026-11-14`, `azure` `V25`), each cloud view's
  caption saying how to fetch the icons and that umlimator is not affiliated with the vendor; they join the gallery and
  CI's example loop, drawn with no pack. The Bookshop atlas joins the three: the opening plan is a root view, its
  Hosting topics open the two cloud views, and `tools/atlas.mjs` writes `iconPacks`, one label a pack (two files that
  disagree stop the build). `tests/mindmap-minimal.json`, `mindmap-stress.json`, `cloud-minimal.json` and
  `cloud-stress.json` with `tests/m4a-fixtures.test.mjs` and `tests/m4a.html`; a test that nothing under `examples/` or
  `docs/` holds a pack's icon entry or the synthetic pack's marker, and the site built with `UMLIMATOR_NO_PACKS=1`; the
  MCP server's read tools, the diff Action's step and map-repo's CLI on the three examples (C10). The JSON Schema and the
  types gain the three types' vocabulary (`MindmapElementType`, `GcpElementType`, `GcpLineType`, `AzureElementType`,
  `AzureLineType`, `CloudElementProps`), `iconPacks` and the icons table's `name` and `legal`.
  `docs/diagrams/conformance/mindmap.md`, `gcp.md` and `azure.md`.
- **AWS, `aws` (4a.8).** AWS accepted the maintainer's request by email (14 Nov 2026), so the `aws` type, written and
  tested with `gcp` and `azure` behind `CLOUD_AWS`, is on: `lib/umlimator-all.js` registers `aws.Group` (`groupType`),
  `aws.Service`, `aws.Resource` (`props.icon`) and `aws.Connection`, drawn and edited as the cloud family is
  (`docs/diagrams/conformance/aws.md`). `icons/packs.json` gains the `aws` row: AWS's `Icon-package_07312026` zip pinned by
  address, size and SHA-256, label `2026-07-31`, AWS's terms and its trademark line; `umlimator.py pack fetch aws` shows
  the terms and asks a yes before any byte. AWS's trademark line, "Amazon Web Services, AWS and the AWS service icons
  shown are trademarks of Amazon.com, Inc. or its affiliates.", is drawn under any picture that draws an AWS icon, inside
  its bounds, and ends its legend and `describe()`, as Google's legal line does. `docs/diagrams/examples/26-aws.json` is
  `examples/bookshop-aws.json`, its ids prefixed `aws-`, with `"iconPacks": { "aws": "2026-07-31" }`; with repair and
  rerouting off its view keeps two crossings.

What moves for a host that upgrades from 0.25.0:

- **Nothing a map or an earlier type draws.** `lib/umlimator.js` draws the four types as plain cards with a warning,
  as it does every type it does not hold.
- **Three logos move, one stops downloading:** a map naming `azuredevops`, `foundry` or `containerapps` draws them from
  the Azure pack once the user fetched it (`umlimator.py pack fetch azure`), and its card's sigil until then; `entra` is
  read from the cache if it is there, else the sigil. A render downloads none of the four any more (the note's decision 7,
  a stated exception to "maps draw exactly as now"). No example or test names them.
- **`delete` down a deep chain** no longer throws, and `validate()` no longer stalls on one; both give what they gave
  before on every model that did not throw.
- **The icons table** may hold `<pack>/<id>` entries with `name`, and `gcp/` with `legal`, which a cloud view reads; a
  map's logo keys have no `/`, so the two never meet. A host that is not the CLI gives the table with the model
  (`model.icons`), from icons it fetched under the vendor's terms; the module never fetches one.
- **New in the JSON Schema and `lib/umlimator.d.ts`:** the three types' element and line types and props, `iconPacks`,
  the icons table's `name` and `legal`; nothing accepted before is rejected (ajv: every example and the four new fixtures valid).
- **New on the CLI:** `umlimator.py pack list`, `pack fetch`; `import` reads a Mermaid mindmap; `check` names icon ids a
  fetched pack lacks. `UMLIMATOR_NO_PACKS` (no pack entries), and `UMLIMATOR_PACKS` with `UMLIMATOR_TEST` (tests only).
- **The examples moved.** `docs/diagrams/examples/25-mindmap.json`, `27-gcp.json` and `28-azure.json` are
  `examples/bookshop-opening-plan.json`, `bookshop-gcp.json` and `bookshop-azure.json`; Google's `iconPacks` label is
  the pin's (`2026-11-14`, it said `2025`) and each cloud view has a caption.
  `26-aws.json` is `examples/bookshop-aws.json` (4a.8).
  The atlas's stills and PDF on the site change: it holds 38 views with 4b.5's BPMN two, the opening plan in its views list.
- **Decisions:** every recommendation of the note's §14; the choices each package took under the maintainer's standing
  approval (14 Nov 2026) are in the note's "As built" sections (§2.4, §3, §4.1, §5.7, §6.3, §7.3, §8.4, §10).
- **Known gaps:** Google's zips hold 45 icons (19 products, 26 categories), so `Cloud-DNS`, `Cloud-Load-Balancing`,
  `Cloud-CDN` and `Pub-Sub` draw a glyph; Azure's V25 has no plain Entra ID icon; a line from or to a cloud group is not drawn by the canvas's handle or L (written in the
  model); an `update()` that changes only the `icons` table keeps the view's picture; no insertion bar while a mindmap
  topic is dragged; a view's `nodeIds` loses a deleted chain's ids one `splice` each (a 20,000-topic delete meets 100 ms
  only where they sit together, §2.4).
- **Left out** (the note's §13): downloading packs from the module,
  the page or the MCP server; the vendors' group colours and diagram guidelines; icon search beyond the properties
  panel's field; older pack versions side by side; Mermaid's shapes drawn; folding a branch in place; a mindmap laid out
  down or radially; XMI, copy and paste, per-type `diff()` writers.
- **Layout limits** (`docs/diagrams/conformance/`): with repair and rerouting off, the Google Cloud example crosses once right
  and once down, the Azure example once right and 3 times down; the cloud stress view `all` 52 and 54 times, one path's
  label on another laid out down. The mindmap example and fixtures lay out clean. No view runs a line through a node.
- **P1.** CPU, best of five, an Apple laptop under load: the mindmap stress view's full layout and SVG, and a topic
  renamed, added, moved to the other side and promoted, 1 to 2 ms each; the cloud stress view's full layout and SVG
  155 to 180 ms, a product renamed 165 to 195 ms, its icon changed 27 to 31 ms, moved into another group 190 to 216 ms, a
  path added 175 to 223 ms (CI's runner, 4a.6: 259 to 299 ms). The cloud figures are over the 100 ms target, as decision
  20 expected; CI holds 1 s and prints each against the target.
- **Size:** `lib/umlimator.js`, what a map host loads, is 186,161 B with `gzip -9`: 12.86% over 0.16.0 (the budget is
  15%). Milestone 4a spent 266 B of its 700 B share, all in 4a.2 (185,873 B to 186,139 B; 4a.4 and 4a.6 none).
  `lib/umlimator-all.js` is 590,167 B gzipped with milestones 3, 4a and 4b's code on `main`. The npm package is 845.5 kB.

- **At release:** BPMN (milestone 4b, 4b.0 to 4b.5) is also on `main`, so this release carries it, provisional until
  0.27.0, whose section says what it does. `lib/umlimator.js` is 186.2 kB (186,174 B) with `gzip -9`, 12.86% over
  0.16.0 (the budget is 15%); `lib/umlimator-all.js` is 590.3 kB (590,335 B); the npm package is 852 kB. The three
  vendors' packs are pinned (#289): `umlimator.py pack fetch gcp|azure|aws` works after the vendor's terms.


## 0.27.0: the BPMN diagram; BPMN XML read and written through bpmn-moddle; `umlimator.py export`

Milestone 4b of the plan for 28 diagram types (`docs/diagrams/notes/milestone-4b.md`), released after 0.26.0. Everything is additive: maps, every typed view released before and every
earlier example draw as they did (`bench/expected.json`, the examples' stills, every earlier test), but the BPMN
example, moved and renamed below, and the Bookshop atlas, which gains it. The new code is in `lib/umlimator-all.js`, the
CLI and the adapter; the core is unchanged.

- **The files (4b.0, #248).** `src/bpmn/notation.js`, `src/bpmn/process.js` and `src/readers/bpmn-xml.js`, in
  `tools/build.mjs`'s `ALL` after the last stage's.
- **The engine (4b.1, #266).** A typed line's `portMin`, a port's least length along its border with its lines centred
  in it (`spreadPorts`, `EDGE_GEO`); `ENDS.circle`, an open circle (a message flow's start); `dashed: 'dot'`, a dotted
  line (`2 3`; `true` stays `6 4`). `laneBands` takes optional `runs` and counts a box's frame in its rows. `cpRank` and
  `cpPlace` are exported from `src/uml/component.js`. Each reached only through a field no map and no earlier type sets.
- **BPMN's notation (4b.2, #272).** Every shape of Table 2.1 and the markers, the names of events, gateways and data
  outside their shapes by a search of the type's own (a name with no clear place flagged `clash: true`), the group's
  frame, hit on a 24 px band along its border and its title; a data object's halo keeps its fold.
- **The BPMN diagram, `bpmn` (4b.3, #277).** Pools and nested lanes as bands across the diagram, an empty row between
  two pools; boundary events on their activity's border, 32 px circles, dashed when non-interrupting; an expanded
  sub-process as a box when the view lists what it holds, else collapsed with its + marker, opening its view; message
  flows to a pool ending on its border at the column they come from; groups round their members across pools. The type
  ranks itself; data and annotations are drawn in the lane of what they are associated with. Fourteen rules
  (`sequence-scope`, `sequence-ends`, `message-scope`, `message-ends`, `event-definition`, `boundary-host`,
  `boundary-out`, `flow-start`, `gateway-flows`, `lane-owner`, `in-lane`, `data-ends`, `group-ref`, `opens-view`). A
  line's kind is picked by its ends (one line entry, no picker); `A` attaches a boundary event by a picker, `X` expands or
  collapses a sub-process in the view, Alt + arrows move a boundary event to another side. Gestures never leave a new
  problem: a drop that would break a rule is refused with its words on the hint line; a moved boundary event goes to its
  new activity's lane, an activity dropped in another lane takes its boundary events. A line the diagram cannot show (a
  message flow between two pools, a flow from a boundary event back to its own activity, an annotation joined to a pool,
  a lane, a group or itself) is refused, and `describe()` names one a model holds "not drawn".
- **BPMN XML (4b.4, #267).** `readBpmnXml(xml, moddle)` and `writeBpmnXml(model, viewId, geo, moddle)`, internal, with a
  `bpmn-moddle` the caller makes; the module imports nothing and `package.json` gains no dependency. `umlimator.py
  import` reads a `.bpmn` file and the new `umlimator.py export` writes one (`--format bpmn` is its default), through
  a `bpmn-moddle` found by `--moddle`, `UMLIMATOR_BPMN_MODDLE` or the working folder, or the message "BPMN needs bpmn-moddle: npm install
  bpmn-moddle@10.3.1". Positions are not kept on reading, said once per file; conditional and default flows, send and
  receive tasks and a timer's value are read plain and kept under `ext.bpmn`, reported `weakened`; anything else outside
  the subset is reported and kept, never written back. Both reports are capped at 1,000 items; a file of thousands of
  diagrams reads in linear time; the root view's diagram is written first; hostile files are read or refused in under
  1 s, never thrown.
- **The example, fixtures and docs (4b.5).** `docs/diagrams/examples/24-bpmn.json` is
  `examples/bookshop-order-to-shipment.json`, its 18 ids the atlas gives other elements renamed with `bp-` (`bp-shopper`,
  `bp-take-payment`, `bp-f-paid`, `bp-warehouse`, `bp-join`, `bp-m-charge`…), every reference with them, and
  documentation on two tasks; it joins the gallery, CI's example loop and the Bookshop atlas, where the use case "Track an
  order" opens it. `umlimator.py export` writes the type's layout of the view into the diagram interchange (a pool or lane
  at its band, a shape at its box, a line through its points). `tests/bpmn-minimal.json` and `tests/bpmn-stress.json`
  (its `edge-cases` view holds every row of Table 2.1 and the six extras) with `tests/m4b-fixtures.test.mjs` and
  `tests/m4b.html`; the MCP server's read tools and the diff Action's step on the example (C10). The JSON Schema and the
  types gain BPMN's vocabulary (`BpmnElementType`, `BpmnLineType`, `BpmnElementProps`, `BpmnLineProps`).
  `docs/diagrams/conformance/bpmn.md` claims the Descriptive conformance sub-class's elements (BPMN 2.0.2, 2.2.2, Table 2.1),
  every row tested, and names its six extras.
- **Decisions:** every recommendation of the note's §17; the choices each package took under the maintainer's standing
  approval (14 Nov 2026) are in the note's "As built" sections (§8.3, §9.4, §12.5, §13.1, §14).
- **Known gaps:** an unnamed gateway is named by its id in the PDF's tables (`fork`, `not-paid`); two lines on one
  boundary event leave its port's face side by side, up to 1 px off its circle.
- **Left out** (the note's §16): Table 2.2 beyond the five rows claimed, conversations, choreographies, event
  sub-processes, transactions, compensation, messages as elements, data inputs and outputs, positions and colours from a
  file's diagram interchange, resizing a pool or lane, XMI, copy and paste, per-type `diff()` writers; a Mermaid reader.
- **Layout limits** (`docs/diagrams/conformance/bpmn.md`): with repair and rerouting off, the example crosses 5 times laid out
  right and 6 down; the stress views 12 (`edge-cases`), 13 and 14 (`ec-closed`), 30 and 29 (`all`). No view runs a line
  through a node or a sequence flow out of its pool.
- **P1.** On the stress view `all` (CPU, best of five, an Apple laptop under load): a full layout and its SVG 55 ms;
  documentation 6 ms, laying nothing out; a task renamed 54 ms, a sequence flow's name 52 ms, a flow node moved to
  another lane 55 ms, a boundary event's side 53 ms. CI holds 1 s and prints each against the 100 ms target.
  On CI's runner (runs 43563271519 and 43564910738) the four common edits took 97.6 to 108.2 ms and the full
  layout 100.4 to 105.8 ms: the edits sit at the target there, over it in the second run, and cost about as much as a full layout, since each
  lays the view out again (the memo spares only an edit that moves nothing).
- **Size:** `lib/umlimator.js`, what a map host loads, is 186,161 B with `gzip -9`, unchanged by milestone 4b: 12.86%
  over 0.16.0 (the budget is 15%). Milestone 4b spent none of its 700 B share. `lib/umlimator-all.js` was 552,200 B
  gzipped with milestone 4b alone.

- **At release:** `lib/umlimator.js` is 186.2 kB (186,174 B) with `gzip -9`, 12.86% over 0.16.0 (the budget is 15%);
  `lib/umlimator-all.js`, with milestones 3, 4a and 4b, is 590.3 kB (590,335 B); the npm package is 852 kB. Nothing
  changed since 0.26.0 but this section and the version: 0.26.0 already carried BPMN, provisional.


## 0.28.0: fixes from the first audit of all 28 types

The first audit of all 28 diagram types confirmed 61 findings. Sixty are fixed in this release, in five pull requests,
each with a test that fails without its fix; the 61st, the 0.27.0 section's size of `lib/umlimator-all.js`, was
corrected in 0.27.0 (#291). Maps draw as they did (`bench/expected.json` is unchanged). What changes for callers:

- **Core (#293).** `update()` now redraws a typed view after any edit to the model: a typed view's key covers the
  model's elements, lines and icons table, so editing an element the view draws but does not list (a qualifying
  package, a deployed container, a lifeline's represented part, an icon entry) redraws it. This lifts the limit the
  0.26.0 section states, "an `update()` that changes only the `icons` table keeps the view's picture". Any edit now
  drops the cached layout of every typed view; only the view on screen is drawn again, the others when opened.
  `layout()` and `render()` no longer throw on a view with boxes whose line ends on a listed id that is no card
  (`blockPos` leaves the line out, as a view without boxes did). `validate()` reports a `views[i].nodeIds` that is not
  a list as an error and warns on a `containers`, `intake` or `nodes[i].verbs` that is not a list, which are then
  ignored. An icon's `src` and an author's avatar are escaped in `href` and `<img src>`; a cut label never splits a
  surrogate pair. Class, object and package views now have keyboard rings: Tab reaches every card and the arrow keys
  move between them, as in the other typed views. `aria-pressed` is set only on button cards and rings, never on a
  `role="img"` card. The page's Find button is named "Find a node or view (⌘K)".
- **UML types (#294).** A typed view's PDF Elements and Lines tables name each element as drawn (`sales::Order`,
  `ada : Customer`, a lifeline `api : ShopApi`), so the pinned table hashes of `sales-classes.json` and
  `order-objects.json` change. A stereotype that specializes one a plain package owns no longer throws; the component
  PDF lists an assembly to another component's port; a lifeline listed twice in `nodeIds` is drawn once in sequence and
  timing views; state machine `validate()` and its Owner field no longer throw on a member with no string id or a
  parent that names no element; a timing constraint of an unknown kind gets `constraint-ends`, and three changes at one
  instant give one warning naming them all; sequence wrap picks a fragment id whose operand ids are free. Generalization
  chains, include chains, nested packages and communication rankings 20,000 deep no longer overflow the stack.
- **C4, ER, information flow, SysML, mindmap and BPMN (#292).** ER: an entity's accessible name now holds its rows in
  full, so every entity's `aria-label` changes; a column name holding whitespace, a quote or a bracket is printed in
  double quotes, with `"` and `\` escaped, and read back unescaped; a row's FK token that is the column's current
  `references` id keeps that reference. C4: a dynamic view with an element C4 has no word for lays out; `D` no longer builds a
  container view that fails `c4-level` when it reaches both a system and one of its containers; `c4-relationship` fires on a relationship with a
  non-C4 end; an inline step with no id is reported "step at edges[k]". Information flow: a name holding `$'` or `$&`
  draws. SysML: `requirement-typing` skips a name that also labels a block, value type, class or data type. Mindmap:
  topics in a parent cycle get the depth they are drawn at. BPMN: deleting a lane keeps its nested lanes in its place.
- **CLI, MCP, the diff Action and map-repo (#295).** `render`, `check`, `pack` and the MCP page parse on Python 3.9 to
  3.11 again (0.26.0 and 0.27.0 raise a SyntaxError there); CI compiles every `umlimator*.py` and map-repo's scripts on
  Python 3.9. Stills and key files are named `urllib.parse.quote(view id)`, so an id holding `/` stays inside `--out`
  (`a/b` is written `a%2Fb.svg`; ids of letters, digits, `-`, `_`, `.` and `~` keep their names). `check --ignore`
  counts each message under one kind; `diff --base` works from a subfolder and with a relative `--out`, and goes on past
  a file it cannot read; the diff Action's comment keeps a label's newlines and backticks inside their line; an MCP
  argument of the wrong JSON type is a tool error naming its schema; `timelapse --limit` refuses a value below 1.
  map-repo's SKILL.md no longer names `pack`, which its pinned v0.21.0 CLI lacks; it is re-pinned to this release, with
  the pack line back, after the tag.
- **AWS in the schema, types, README, gallery and atlas (#295).** The JSON Schema and `lib/umlimator.d.ts` gain AWS
  (`AwsElementType`, `AwsLineType`, AWS's group kinds). The mindmap example `bookshop-opening-plan.json` gains the topic
  `mm-on-aws` ("On AWS") under Hosting, 22 topics, which the Bookshop atlas links to `aws-on-aws`; the atlas holds 39
  views. The gallery gains AWS and e-bike atlas cards.
- **Readers, writers and the Python importer (#296).** The Python importer refuses Structurizr DSL, C4-PlantUML and
  Mermaid text over 1 MiB, saying why, and caps a flowchart's `&` links at 100,000 with one report line; repeated ids are
  linear; odd but parseable Kubernetes or compose JSON, a file that is not UTF-8 and a node that is not an object are
  reported in one line, never a traceback. The Mermaid sequence reader caps fragment nesting at 64 (deeper is read as its
  content, reported once) and its writer never throws. The class writer encodes `#`, `\`, an edge label's `«` and its
  end spaces; the reader takes «stereotypes» before it decodes entities, so `: #lt;#lt;x#gt;#gt;` reads as the label
  `<<x>>`. The BPMN writer reports an empty label, every `ext` key other than `bpmn` and a lane whose parent is not a
  lane of its own pool, and writes unindented XML past 32 levels; the reader reports an extension outside a flow node and
  an `umlimator:id` holding `->` (read with `-`). The Structurizr reader's work over shared `properties` is bounded;
  1,500 nested groups import.
- **Size:** `lib/umlimator.js`, what a map host loads, is 186.7 kB (186,668 B) with `gzip -9`, 13.16% over 0.16.0's
  164,954 B (the budget is 15%), up 494 B from 0.27.0 (#293's 449 B, #294's 45 B). `lib/umlimator-all.js` is 593.3 kB
  (593,343 B); the npm package is 855.6 kB.

## 0.29.0: fixes from the second audit

The second audit confirmed 53 findings. All 53 are fixed in this release, in five pull requests (#299 to #303), each
with a test that fails without its fix. Maps draw as they did (`bench/expected.json` is unchanged). What changes for
callers:

- **Core (#303).** A typed view's PDF Lines table lists only the lines its type draws (a communication message, drawn
  as a row, still counts), so the examples' PDFs lose rows that were listed but never drawn: the C4 container and
  component views (relationships of the boundary or of the container being opened), the component view (information
  flows), the information-flow view (a port connector) and the e-bike requirements view (connectors). `diff()` puts a
  view's removed line back in its place, after the old line before it that stayed (first if none), so a removed
  sequence message is drawn inside its operand and the diff model passes `validate()`; removed cards and model lines
  are still added at the end. A changed item with no ends is named by its label or id, never "the line from undefined
  to undefined". `validate()` reports `edges` that is not a list, a view that is not an object and a box's `nodeIds`
  that is not a list, which `layout()`, `describe()` and `render()` then leave out instead of throwing. A typed view's
  key holds every view's id, title and subject, so `update()` redraws the "opens <view>" names after a view is renamed.
  Find matches words on the raw label and escapes each piece after, so a result never shows `&amp;`; the button is
  named "Find a node or view, ⌘K" (or "Ctrl K") with `aria-keyshortcuts`, and axe-core 4.14 reports no violation on
  `bookshop.html`; the search field is a combobox whose `aria-activedescendant` follows the highlighted result, in a
  list named "Results". Author tags and the panel chip count whole characters, never half a surrogate pair. The
  outline of elements selects a box as a container, so F2, Delete and Shift + Delete act on it; the component,
  deployment, profile, composite structure, state machine and use case conformance notes now say, as the package note
  does, that a box is not a Tab stop and is reached through the outline.
- **UML types (#299).** `layout()` of a chain of 3,000 components, lifelines or composite parts, `validate()` of a
  3,000-deep stereotype chain or of an object view over a 5,000-deep generalization chain, and `describe()` of a class,
  deployment or component view nested 3,000 deep no longer overflow the stack; the visiting order, and so every
  picture, is the same. A component's PDF port row is the port's name and type whole. Sequence: a fragment listed
  twice is the core's "id is used twice" error, not a throw, and a message and a use sharing an id lay out. An inline
  interaction counts a lifeline listed twice once. `apply()` treats an inherited key on a path (`toString`) as absent,
  so `S` on a timing lifeline named `toString`, `constructor` or `__proto__` works, as do other types' `present.<id>`
  and `layout.<id>` paths.
- **ER, containment, layout pins, SysML, mindmap and cloud (#302).** `validate()` warns at `views[i].layout.<id>` on a
  pin far off the grid ("… is off the grid: held at N columns or rows out"), for any view, and the layout holds every
  pin within ± (the view's card count + 64): a pin of 1e5 took tens of seconds and 1e308 threw. Delete and Shift +
  Delete on a selected requirement containment line re-home the requirement, as its conformance note says (a type's
  `edits.remove` hook now gets a line's geometry ids too). ER: an FK target holding a space is printed quoted and read
  back; a name holding `)` is printed quoted; a column with no label prints the name the drawing uses, and its
  accessible name, `describe()` and PDF rows follow. SysML: a forward derive chain of 20,000 gives one `derive-cycle`
  warning instead of a throw. Mindmap: in a parent cycle the PDF row names the drawn parent. AWS and Azure: a node
  with no type is no longer drawn and named as a user.
- **Readers, writers and the Python importer (#300).** The Python importer's Mermaid link and C4 macro argument
  parsers are linear (a 1.5 KB file had hung `import` for 12 s); the Kubernetes and compose importers are linear and
  refuse JSON over 1 MiB, as the text importers do. The Mermaid class writer reads each member line back and writes
  `%% not written: <id> (<type>)` for one the reader would read as another, and writes `»` inside a stereotype as
  `#187;`. The BPMN writer and the requirement writer look values up by own key (`toString` or `constructor` no longer
  loses the file); an unknown `taskType`, association direction or view direction is named not written. The BPMN
  reader reports a data input association's sources after the first and keeps them under `ext.bpmn`. The state, class
  and sequence writers write unindented text when the indented text would be over the reader's 1 MiB limit.
- **CLI, the diff Action, MCP and the atlas tool (#301).** `check` reads the broken rules from the page's own `rules`
  array in its check report, so a label ending in `breaks rule "…"` is not a broken rule; a page rendered before
  0.29.0 has no array, and `check` falls back to matching the words until it is rendered again. Stills are named
  readably again (0.28.0 percent-encoded them): only `%`, `/`, `\`, NUL and an id of `.` or `..` are encoded, and a
  view id that differs from an earlier one only in case gets `-` and 6 hex characters of its SHA-256, computed over all
  the page's views so `--views` keeps the names. Pictures 0.28.0 wrote under encoded names stay in the folder until
  deleted. The diff Action's comment is cut under 60,000 characters at a line boundary, never inside a Mermaid sketch,
  and says so; its "needs pull-requests: write" hint shows only on HTTP 403 or 404. `diff --base` and `timelapse` read
  a UTF-16 or UTF-32 JSON file; `render` reads a BOM and says in one line when a model is not JSON or not a model;
  `stills`, `check`, `pdf` and `record` say in one line when a file is not a umlimator page; `record --size 800` is a
  usage error; an MCP `highlight` Ref with non-string fields is a tool error. `tools/atlas.mjs` checks that the links
  file's root is a view of the file it names.
- **Docs and examples (#301).** The gallery and 12 example host pages declare `<html lang="en">`. The atlas README and
  gallery card no longer promise that a double-click opens a box's view. README's Model section lists `"aws"`. The DBML
  fixture is described as the `export()` of a Database parsed by @dbml/core 11.0.0.
- **map-repo (#298).** The skill's CLI is pinned to v0.28.0 (plugin 0.1.13), and its SKILL.md names
  `umlimator.py pack fetch gcp|azure|aws` again.
- **Known gaps.** A box (package, node, subject, composite state, region, open collaboration) has no Tab stop; the
  keyboard reaches it through the outline. A double-click (or Enter) on a box does not open its view (the 0.24.0 gap).
  `layout()` of a class view nested about 3,000 deep still overflows the stack in the core's box placement. A chain
  of 3,000 components or composite parts lays out but takes several seconds.
- **Size:** `lib/umlimator.js`, what a map host loads, is 187.9 kB (187,891 B) with `gzip -9`, 13.91% over 0.16.0's
  164,954 B (the budget is 15%), up 1,223 B from 0.28.0 (#303, #302 and #299). `lib/umlimator-all.js` is 596.3 kB
  (596,259 B); the npm package is 859.8 kB.

## 0.30.0: fixes from the third audit

The third audit confirmed 53 findings, 46 distinct defects. All are fixed in this release, in five pull requests
(#305 to #309), each with a test that fails without its fix; the 53rd, a dead link in this file, is fixed here. Maps
draw as they did (`bench/expected.json` is unchanged). What changes for callers:

- **Core (#309).** `layout()` walks boxes with its own stack, so a class, package, use case, deployment, C4
  deployment, SysML block definition, cloud or plain map view with boxes nested 3,000 deep (or deeper) lays out (a
  3,000-deep class view in about 2 s, a map in about 0.6 s): this lifts 0.29.0's known gap of a class view nested about
  3,000 deep. The 64-step cap on box ordering is gone, so a line from a card 64 or more boxes deep orders its blocks
  like any other. A top-level card is no longer laid out inside nested boxes that do not hold it. One stress picture
  changes: in `tests/component-stress.json`, view `all`, direction right, the top-level interface Api0 no longer lies
  in Box 1, crossings drop from 126 to 116 and `check` reports 0 findings where it reported 5. `diff()` puts a removed
  model line that a view lists by id back in its place, so a sequence keeps its step order; `diff()` and `drift()` read
  a view's `containers` that is not a list as none. A `views[i].layout` pin that is not two numbers is laid out as
  unpinned (maps drew NaN coordinates and typed views threw), and `validate()` warns `"<id>"'s place [...] is not two
  numbers: ignored`. `validate()` reports a null in `nodes` when a UML view exists instead of throwing. A typed view's
  PDF Lines table now lists the lines its type draws to a member's or a port's owner, between the owners as drawn: a
  class or profile view's association from a property and comment on one, a component view's delegations and
  assemblies, a composite structure view's connectors and role bindings, a SysML internal block view's connectors. Find's "Nothing called …" is a status beside
  the list, not inside it, and the combobox is not expanded while nothing is found. The view pill's details line and
  lane arrows use `--um-muted` (4.5:1 in both themes). An arrow key moves only to a card within 45 degrees of its
  direction, so Up and Down on a sequence lifeline no longer move sideways; with none, focus stays.
- **UML types (#308).** The object type runs only `member-names` of the class rules, and its `rules` list only that
  one, as its conformance note says: a model with only object views no longer gets generalization-kinds, comment-link
  or multiplicity. Editing a component's operation or attribute row edits it as a member; it was rewritten as a port.
  Sequence: two messages of one id, one naming no lifeline, lay out, each with its own label and number (the time
  axis's lines carry a new field, `ri`). Communication: a message a view lists twice is read once (one row, the right
  number, no false reply-call error). Component layout is no longer cubic in owner depth (800 levels: 10 s to 0.3 s),
  activity layout and describe are no longer cubic in partition depth (3,000 levels: about 0.3 s), and use case
  `describe()` of packages nested 6,000 deep no longer overflows the stack.
- **Milestone 2, BPMN and SysML types (#305).** A flowchart node with no label is named by the id it draws in its
  accessible name, `describe()` and line names, and a data flow comment with no label likewise. C4 dynamic view: F2
  cuts a typed step number only when a space or the end follows its dot, so "1.5 TB export" keeps its "1.". Renaming
  an information flow with about 10 KB of text no longer freezes the page. BPMN: sub-processes nested 600 deep lay out
  in about 45 ms (was 15 s) and describe in about 35 ms (was 6 s); lanes and sub-processes nested 3,000 deep lay out.
  SysML requirement views with packages nested 3,000 deep lay out.
- **Readers, writers and the Python importer (#307).** The Python Mermaid flowchart importer's subgraph pattern, its
  `;` split and its link close are linear, as is `import`'s format detection (`/* */` comments and leading blank
  lines). Structurizr DSL elements nested deeper than 64 are read flat from there, and the importer says so once, so
  ids stay short. A lone surrogate (an escape or an entity) is written as U+FFFD and said in one stderr line, never a
  traceback. The class, state, sequence, mindmap and requirement writers end text that would be over the reader's
  1 MiB limit with `%% not written: … over its limit of 1048576`. The sequence writer writes `@{` in a label as
  `#64;{`; the flowchart, state and sequence writers write a carriage return as `#13;`, so it reads back. The mindmap
  reader no longer decodes `#constructor;` through `Object.prototype`. The class reader reports a `%% id:` hint that is
  taken or stands above a line that takes none, and the class writer names a class with no label. The BPMN reader
  reports, once per name per file, a set attribute outside its subset (`startQuantity`, `isForCompensation`, …).
- **CLI, the diff Action, MCP and the atlas tool (#306).** The engine's child process runs as `python -I`, so a
  stdlib-named `.py` file in the working folder is never run (render, diff, drift, MCP, the map-repo skill and the diff
  Action; the Action's count step too). diff, drift, trace, export and the MCP tools read a model as render does (a
  BOM read, a file that is no model said in one line, never a traceback); timelapse leaves out a version that is not an
  object. `stills` redraws a view when a line that ends on a port changes, and a view id over 200 UTF-8 bytes is cut to
  180 with an 8-hex hash of the id added; a view whose files cannot be written is listed in `failed` and the others are
  still exported. `tools/atlas.mjs` keeps each line with no id as its own file's line, never merged.
- **Docs and examples (#306, this release).** `examples/README.md` names Shop API among the boxes a double-click does
  not open and its Diagrams table is whole again. This file's link to 0.21.0 from the 0.15.0 card-shapes section points
  at the 0.21.0 heading.
- **Known gaps.** A box has no Tab stop; the keyboard reaches it through the outline. A double-click (or Enter) on a
  box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the core: a class view 3,000 deep
  takes about 2 s and a component view about 1.5 s, BPMN 3,000 deep 1.5 to 2 s. A composite structure or SysML internal block view's
  Lines rows name a part by its id (`order-service.checkout`), not its drawn name. The JavaScript Mermaid readers still decode
  `#55296;` to a lone surrogate (the CLI writes it as U+FFFD). The requirement layout leaves out a link into a box
  nested more than 64 deep from its ranking.
- **Size:** `lib/umlimator.js`, what a map host loads, is 189.0 kB (189,017 B) with `gzip -9`, 14.59% over 0.16.0's
  164,954 B, about 680 B under the 15% cap (189,697 B), up 1,126 B from 0.29.0 (#309 and #305).
  `lib/umlimator-all.js` is 599.8 kB (599,775 B); the npm package is 864.4 kB.

## 0.31.0: fixes from the fourth audit

The fourth audit confirmed 37 findings. All are fixed in this release, in five pull requests (#311 to #315), each with
a test that fails without its fix. Maps draw as they did (`bench/expected.json` is unchanged). What changes for callers:

- **Core (#314).** `check()` names a card or box with no label by its id (`label ?? id`; an empty label stays empty),
  so a crossing reads "edges a→c and b→d cross", not "undefined". `rules()` removes repeats by drawn line, not by
  message text, so two broken lines to two cards that share a label are both reported. The details panel escapes an
  icon's `src`. `reach()`, `paths()`, `critical()` and `whatIf()` on a typed view walk the lines as drawn, so a line
  that ends on a member or a port counts, between the cards it is drawn on; the drawn ids (`ebike.battery`) are
  accepted as well as the view's. `validate()` on a map view: a box whose id is one of the view's cards is an error (a
  box sharing the id of a card not in the view, as clinic's drill-down boxes do, is still allowed); new warnings for a
  card listed twice in `nodeIds` ("drawn twice"), a card in two boxes where neither holds the other ("they overlap") and
  a box with no cards in it or in any box inside it ("it is not drawn, nor its lines"). A typed geometry laid out down
  carries `down: true`; the canvas reads it, so Alt+arrows move a card the way it looks on a view laid out down
  (a flowchart with no direction too), and a card dropped on its own place, or nudged a few px, no longer jumps 50 to
  130 px. The flowchart's `moveTo` hook only refuses a dragged flow; the canvas places nodes. On a typed view the live
  region announces a selected node, box-like piece or line by its accessible name, not its internal id, and the panel
  and Find call an element by its type's word (`wordOf`, now exported from `src/page/print.js`), not "Script"; a typed
  element's panel shows no INTERNAL badge and no When/What/How tabs, and Find also searches by type. `<umlimator-map>`
  and the docs blocks load `umlimator-all.js` from their own folder for a model with `schemaVersion: 2`, only then, so
  they draw diagram types; README's MkDocs copy list adds that file.
- **UML types (#312).** Composite structure: a part or port row reads its name up to the first lone `:`, so a type may
  be qualified (`repo : data::Repository [1]` round-trips) and `T[]` stays the type; a subject's operation and
  attribute rows print and edit as the class type's. `import-ends` accepts a package or a profile at either end of an
  import or merge. The PDF's Elements table lists no member rows for a package view, and an object view prints a
  classifier's members as the class type does. Use case, activity, state machine and interaction overview views draw,
  key and count a line listed twice in `view.edges` once. A state machine's `describe()` headline counts transitions
  only; comment links are still read in the body.
- **Milestone 2, BPMN and SysML types (#313).** A DFD node typed by an `Object.prototype` name (`constructor`,
  `__proto__`, …) is drawn as a plain classifier and `validate()` reports it, never throws. C4: D on a system or
  container that already opens a view returns `{ error: '<name> opens "<view>" already: Enter opens it' }`; a dynamic
  view's `describe()` names its comment links. Information flow: F2 renames a flow conveying an element whose name has
  a leading or trailing space. ER: a column token that is a flag word (`PK`, `FK`, `UK`, `NULL`) is printed quoted, so
  the row reads back. BPMN: N with a collapsed sub-process selected adds the new element beside it, in its owner (inside
  only when this view draws it expanded); lane and pool names count the items drawn in them (`laneOf`), so the example's
  pool reads "Pool Bookshop, 2 lanes, 17 elements" (was 16) and its lanes "Sales 12" and "Warehouse 5". SysML: a
  requirement or block definition frame whose id holds `$` keeps its title; the parametric hint line's word swaps leave
  the user's element names as written. `docs/editing.md`: Delete or Shift + Delete on a requirement containment line
  reparents the child to its owner's owner.
- **Readers and the Python importer (#311).** The Python Mermaid flowchart importer no longer hangs on a label that
  opens a quote it never closes after an earlier `]` (`A[x] --> B["y`); the line is said `not imported`. The class
  reader reads a `$` or `*` straight after `)` as static or abstract, as Mermaid does (`+draw(int x)$ bool`).
- **CLI, the diff Action and MCP (#315).** `stills` keys a typed view on the whole model's cards and lines, so a
  changed connector to a part's port redraws it (any edit to a model now redraws its typed views; map views keep the
  narrower key), and keys a card's icon-pack entries, so fetching a pack redraws a cloud view. The diff Action's summary
  escapes labels (`List<Order>`, `*all*` read as written). `--out` in a folder not there yet creates it for every
  writer (import, timelapse, trace, export, pdf). `timelapse` draws a fetched pack's icons. `record` plays a step
  duration the page only warns about as the page does (`Math.max(500, +duration || 4000)`), never a traceback.
  `import` of a missing file or a folder says `import: no file at <path>`. `stills` and `record` refuse `--scale` 0,
  negative or nan as a usage error. The MCP test `mcp-latest-command#3` no longer flakes.
- **Docs (this release).** `docs/diagrams/notes/stage-6.md` and `docs/diagrams/conformance/uml-profile.md` no longer list a
  profile's own import as left out.
- **Known gaps.** Still open from 0.30.0: a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core: a class view 3,000 deep takes about 2 s and a component view about 1.5 s, BPMN 3,000 deep 1.5 to 2 s. A
  composite structure or SysML internal block view's Lines rows name a part by its id (`order-service.checkout`), not
  its drawn name. The JavaScript Mermaid readers still decode `#55296;` to a lone surrogate (the CLI writes it as
  U+FFFD). The requirement layout leaves out a link into a box nested more than 64 deep from its ranking. New: typed
  hooks that answer Alt+arrows themselves (activity, C4 dynamic and others) were not checked on views laid out down.
  `reach()` from a model id that the view draws under another id (`battery` drawn as `ebike.battery`) returns only
  that element; the drawn id works. A negative step duration plays 500 ms while `validate()`'s warning says 4000 ms.
- **Size:** `lib/umlimator.js`, what a map host loads, is 189.7 kB (189,673 B) with `gzip -9`, 14.99% over 0.16.0's
  164,954 B, up 656 B from 0.30.0 (#314). It is 24 B under the 15% cap (189,697 B): the next core change has no room
  without a cut elsewhere. `lib/umlimator-all.js` is 600.6 kB (600,629 B); the npm package is 866.0 kB.

## 0.32.0: fixes from the fifth audit

The fifth audit confirmed 33 findings. All are fixed in this release, in five pull requests (#317 to #321), each with a
test that fails without its fix. Maps draw as they did (`bench/expected.json` is unchanged); of the typed pictures, only
C4 views change (the router fix under Core). What changes for callers:

- **Core (#321).** `check()` and the page check report a line drawn through a card on a typed view (`edge X→Y passes
  through card "Z"`), skipping the line's own ends, their ports and owners, boxes round an end, holders, a communication
  diagram's message rows and a timing view's marks; it is kept out of the score the layouts use, so no picture changes
  for it. The router fix: a C4 card's text tag (`[Container]`) was read as an author's name tag, giving obstacle rects
  with NaN coordinates that put the router's grid out of order, so lines ran through cards; only an object tag is a name
  tag now. Only C4 pictures change: bookshop-c4 goes from 14 crossings to 8, the atlas's ceiling from 31 to 25, and
  c4-stress `all` now has no line through a card. `diff()` reports changes made only in a view: a card renamed in one
  view (`nodeOverrides`), moved to another box, a box renamed, a view retitled; each adds the view to `views` and marks
  the card changed there. `check()` names an unlabelled control node (a choice, a fork, a final node) by its id; map
  cards keep `label ?? id`. The details panel lists each line of a typed card once. A double-click on an unselected card
  opens the card the first click hit (same view, within 1 s), though the refit moved it. A typed element that opens
  another view ends its accessible name with ", opens <view title>" (names that already say "opens" are left alone); no
  drill-down mark is drawn on typed elements. The 0.26.0 section above says a mindmap topic that opens a view "carries
  the drill-down mark": it does not, its name says ", opens <view>" instead (the released section is left as written;
  `docs/diagrams/conformance/mindmap.md` and `notes/milestone-4a.md` are corrected).
- **UML types (#319).** Composite structure: the subject's box grows by the widest label among named connectors from its
  ports, so two named connectors from one port both keep their names; a part's closing `[...]` is the multiplicity only
  when it is one (`list[str]` stays the type), and the new warning `part-multiplicity` flags a stored multiplicity that
  is not one or has its lower bound above its upper. Class member rows typed `list[str]` or `Dict[str, int]` edit. The
  component and deployment views give the `line-inside` warning for a line between a box and something it holds.
  Class and package `describe()` end every line kind other than an association with its stereotypes and `("label")`.
  `package-names` compares packages and profiles in one owner. A component view's box owned by a node is titled
  without the node's name (`ownersOn`'s new look option `qualifyBy`). Timing: hiding a lifeline says only the clauses
  that apply ("Hid b").
- **Milestone 2, BPMN, SysML and the mindmap (#317).** A line listed twice in `view.edges` is drawn, counted and read
  once in ER, flowchart, DFD, C4 static, deployment and dynamic (comment links) and information flow views (the
  flowchart's false `terminator-flows` goes). C4: static and deployment views gain F2 rename (`c4Rename`, exported from
  `src/c4/c4.js`; `C4_DEF.edits` and `DEP_DEF.edits` list `rename`), which keeps the `[technology]` out of the label;
  the dynamic view's rename calls it; an element typed by an `Object.prototype` name is an unknown type, tagged
  "[constructor]", and `validate()` no longer throws. Information flow: F2 that leaves a flow's conveyed names as they
  are keeps what it conveys. `mindmap-depth` warns at depth 65, the first the Mermaid reader and writer move, counting
  levels below the root. BPMN's PDF gives a pool no "in …" row. Block definition: "in : Signal" names a member `in`.
- **Readers, writers and the Python importer (#318).** `writeMermaidMindmap` hangs a shown topic from its nearest shown
  ancestor. A `;` inside an entity code outside quotes ends no flowchart statement, in JavaScript and Python. Structurizr
  DSL import joins a line ending in `\` with the next. Front matter fences may have trailing spaces or tabs (CRLF files
  too). The Python map importer decodes Mermaid entity codes. The class reader reads `Square~Shape~` in a relation or a
  member line as the class Square. The BPMN reader reports and ignores a lane's `flowNodeRef` to another process's flow
  node, and a second pool on an owned process (the first keeps it).
- **CLI, the diff Action and map-repo (#320).** The map-repo skill's CLI is pinned to v0.31.0 (plugin 0.1.14); CI checks
  that the pinned release runs the engine with `-I`. `render` (and the MCP page, diff and drift) says a malformed view
  field in one line (`nodes`, `nodeIds`, `edges`, `containers`, `stepIds`, `browserOrder`, `intake` or `tour` not a
  list, null included; `nodeOverrides`, a container or intake entry, or top-level `meta` not an object; a card's
  `members` not a list at any depth), never a traceback. The diff Action's summary @-mentions no one (a word joiner after
  each `@` in prose). `check` and `pdf --views` pick a view whose id holds a comma (ids encoded twice). CI runs
  `tests/bpmn-engine.html`.
- **Known gaps.** Still open from 0.31.0: a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core: a class view 3,000 deep takes about 2 s and a component view about 1.5 s, BPMN 3,000 deep 1.5 to 2 s. A
  composite structure or SysML internal block view's Lines rows name a part by its id, not its drawn name. The
  JavaScript Mermaid readers still decode `#55296;` to a lone surrogate. The requirement layout leaves out a link into a
  box nested more than 64 deep from its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views
  laid out down. `reach()` from a model id that the view draws under another id returns only that element. A negative
  step duration plays 500 ms while `validate()`'s warning says 4000 ms. New: a labelled line whose label gets no spot is
  dropped with no `check()` report (seen in bookshop-atlas, sales-classes, the C4 container, GCP and Azure views and
  weather.json); it is under audit in round 6. Mermaid C4 macro arguments keep entity codes as written. `describe()` of
  an inline interaction does not say it opens a view.
- **Size:** `lib/umlimator.js`, what a map host loads, is 191.3 kB (191,311 B) with `gzip -9`, 15.98% over 0.16.0's
  164,954 B, up 1,638 B from 0.31.0, nearly all in #321 (#320 added 32 B). `lib/umlimator-all.js` is 604.1 kB
  (604,131 B); the npm package is 871.2 kB (`npm pack --dry-run`). The maintainer decided on 15 Nov 2026 that the core
  has no size cap until 1.0.0: sizes are reported each release and a budget is set at 1.0.0. 0.31.0's "the next core
  change has no room without a cut elsewhere" no longer applies.

## 0.33.0: fixes from the sixth audit

The sixth audit confirmed 30 findings. All are fixed in this release, in five pull requests (#323 to #327), each with a
test that fails without its fix (findings 0, 4, 12 and 14 are one defect, as are 2 and 29, and 20 and 24). Pictures
change only where a label had been dropped (the label fix under Layout); of 441 views compared (examples, fixtures and
bench models, both directions), no other view changed. In the bench only `s16/job` changes: `bench/expected.json` is
re-pinned there (`bf8840f3` to `d7b8c6d9`). What changes for callers:

- **Layout and labels (#327).** A labelled line no longer loses its label silently: across the examples and stress
  fixtures, 48 lost labels go to 0. A label that still has no spot after every line is routed gets late tries. On a
  typed view, in order: move an earlier label within reach of the line out of the way, a strict spot beside the line, a
  spot over a line but off box borders, then a map's passes 1 and 2. On a map, the strict spot, then the one off box
  borders. A label placed on a late try still asks for room (`labelRoom`), which may widen a row gap; a typed view
  without `labelGaps` asks only when it has 30 cards or fewer, so a larger view keeps the looser spot. In a numbered map
  view, the gap between two columns of a lane widens for a labelled line between them. A label that finds no spot at all
  is reported by `check()` on maps and typed views alike: `label "x" has no room on edge A→B: not drawn` (timing views
  and a numbered view's comb lines, whose steps are on the cards, are left out). Pictures that change: sales-classes
  `domain`, bookshop-gcp `gcp-on-gcp`, bookshop-azure `az-on-azure`, their copies in bookshop-atlas, weather
  `forecaster`, and turned and stress views (the fixture pins name each one). Turned views (`direction: down`) draw more
  labels over lines, which `check()` names: its findings over the 441 views go from 4,035 to 4,091. Composite
  structure: three or more named connectors from one port sit 28 px apart, not 10, and where two far ends are level the
  line that goes round the nearer part takes the outer place, so every name is placed and the lines do not cross.
  `check()` tests a timing view's slanted message lines exactly, so its false shared lines and false labels on lines go
  (21 on `timing-stress` `all`) and real crossings are found; axis-aligned segments are tested as before.
- **Core (#324).** `diff()` reports a line a view hid or showed, by the line's id, when both its ends stay in the view:
  `takes the line from A to B (label) out of the view V`, the line coming back in the view's list marked removed, in its
  place, and `puts the line from A to B in the view V`, marked added. A `render: "sequence"` map view whose kept lines
  change order reads `reorders the steps in the view V`. Each adds the view to `views`, so `umlimator.py diff` no longer
  leaves the file out. Lines without an id are not compared; typed views keep their own `moves` wording. A typed
  geometry node that names the view it opens in its own name carries the new flag `saysOpens` (a DFD process with a
  level, a call behaviour action, an interaction use, an inline interaction drawn in full, a mindmap topic); the
  accessible name adds ", opens <view title>" to every other typed element that opens a view, even one whose label or
  description has the word "opens" (0.32.0 guessed from the text).
- **UML types, information flow and the mindmap (#326).** A line listed twice in `view.edges` is drawn, read and counted
  once in class, package, object, component, deployment, composite structure and profile views, and a card listed
  twice in `view.nodeIds` is drawn once (`ownersOn` dedupes the view's ids). Composite structure: a listed connector
  between two types' ports with no `props.ends` gets the `connector-part` warning (an unlisted one stays silent). Class
  and package `describe()` name every line they count: Usage "uses", Realization "realizes", Abstraction "abstracts",
  Extension "extends", any other kind "linked to". A class member row with a function type (`=>`, `->`) keeps it whole.
  A call behaviour action unfolded in place is a box in the call's lane, holding its activity, and the call's two flows
  end on the box (only the unfolded picture changes). Information flow: F2 on a flow conveying two elements of one name
  keeps both. A component or artifact whose id holds `$'` or `$&` is drawn as written. Mindmap: N, Delete and a drop
  return on a topic parent cycle (the tree follows the cycle as drawn). `docs/editing.md` says the timing view's Alt +
  arrow emits `move` on `nodeIds`, as it does.
- **Readers, writers and the Python importer (#325).** `writeMermaidClass` leaves out, on a `%% not written` line, a
  member that would read back differently; a property typed `char*` is written type first (`+char* data`) and reads back
  as itself, while an operation returning a type ending in `*` or `$` has no form that reads back and is not written.
  The Mermaid class reader keeps `d: Dict[str, int]` and `h: (e: Event, c: Ctx) => void` as one parameter each.
  `umlimator.py import` passes over a `%%{ init }%%` directive spread over several lines, so detection and the
  flowchart and C4 readers work; it splits lines at `\n`, `\r\n` and `\r` only, so a U+2028 in a label no longer
  splits its line.
- **CLI (#323).** `umlimator.py trace --view` refuses, in one line and before writing, to replace a view a person made
  (a caption that does not start "From a trace"); a view an earlier trace made is still replaced where it is. In the
  library, `sequenceFromTrace()` still replaces any view with that id, but never makes the replaced view or one below it
  the new view's parent. The 0.13.0 section above says `trace` takes the place of a view with that id: for the CLI, that
  now holds only for a view a trace made (the released section is left as written). `stills` draws a view again when
  the inner view a `nodeOverrides.opensView` opens has changed. A model in a folder that cannot be written, `--out`
  naming a folder (render, import, pdf, trace, export, timelapse) or `stills --out` naming a file, a numeric view id
  (`views[i].id is not a string`) and `mcp --port` outside 0 to 65535 (a usage error) are each said in one line, never a
  traceback.
- **Known gaps.** Still open from 0.32.0: a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core. A composite structure or SysML internal block view's Lines rows name a part by its id, not its drawn name. The
  JavaScript Mermaid readers still decode `#55296;` to a lone surrogate. The requirement layout leaves out a link into a
  box nested more than 64 deep from its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views
  laid out down. `reach()` from a model id that the view draws under another id returns only that element. A negative
  step duration plays 500 ms while `validate()`'s warning says 4000 ms. Mermaid C4 macro arguments keep entity codes as
  written. `describe()` of an inline interaction does not say it opens a view. New: in composite structure, five or more
  delegations from one port still cross, even with no labels (a limit that was already there; this release fixes three
  and four). Room for a label in a turned view is still mostly along the line, not across it; the cloud stress `all`
  view, laid out right, now has room for its three labels and crosses 56 times (was 52). The map flowchart and
  Structurizr DSL readers turn a U+2028 inside a label into a space (`--typed` keeps it). `validate()` gives typed views
  no "listed twice" warning (they are now drawn once). The unfolded call behaviour box is a plain container frame, not a
  call behaviour shape. A page rendered before 0.33.0 with a numeric view id still ends in a traceback in `stills` and
  `check`.
- **Size:** `lib/umlimator.js`, what a map host loads, is 193.7 kB (193,656 B) with `gzip -9`, 17.40% over 0.16.0's
  164,954 B, up 2,345 B from 0.32.0, nearly all in #327 (the label fix) and #324. `lib/umlimator-all.js` is 608.1 kB
  (608,067 B), up 3,936 B; the npm package is 877.4 kB (`npm pack --dry-run`). There is no core size cap until 1.0.0
  (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.34.0: fixes from the seventh audit

The seventh audit confirmed 24 findings. All are fixed in this release, in five pull requests (#329 to #333), each with
a test that fails without its fix or, for findings 5 and 23, a docs change the existing pins already test (findings 8
and 13 are one defect). No map or example draws differently and `bench/expected.json` is unchanged. What changes for
callers:

- **Security: the details panel (#332).** The panel no longer writes a `javascript:` URL, or any URL that is not
  http(s), `mailto:`, `file:` or relative, from model data into a link. Before, a model's source link with
  `meta.root` and `meta.sourceBase` unset could run the model's script in the host page when clicked. A new `safeUrl`
  (src/canvas/pieces.js) reads the URL the way a browser does first, so tabs, newlines and leading control characters
  are dropped and `java\tscript:` is caught. It covers every source link (`meta.root` and `meta.sourceBase` included),
  the author link and both example links (panel and lightbox). A refused source shows as plain text, like a `~` source;
  a refused author url falls back to the GitHub profile. Image sources are not filtered, so `data:` images still work.
- **Core (#332).** `optimize()` no longer reads the wall clock: it stops on its evaluation budget plus a fixed work
  cap, evaluations × lines² at 40,000 (120,000 while problems remain), about what the 4 s and 12 s boxes allowed on a
  fast laptop. The layout `umlimator.py render` bakes is now the same on every machine, as the section on `optimize()`
  above already said; examples/bookshop.html bakes the same positions as before. A view that hit the old time box may
  stop after a different number of evaluations than it did on a fast laptop. `validate()` warns when a line listed in
  a map view's `edges` ends on a card that is not on the view (`"ac" ends on "c", which is not one of the view's cards:
  not drawn`), and when a line id is listed twice (`"ab" is listed twice: drawn once`); the line is now drawn once, not
  as two lines labelled "pays +1". The page header's Export, Stories and Lenses buttons drop `aria-haspopup` and name
  their pop-ups with `aria-controls`; the ? button says `aria-haspopup="dialog"`, opening the key list moves focus into
  it, and Esc or ? gives focus back.
- **UML types and boxes (#331).** State machine: a transition from an open composite state to a state it holds is left
  out of `describe()` and `geo.order`, as it is of the picture, and the new warning rule `composite-inner` says it is
  not drawn (the type now has 18 rules). An id named `constructor`, `toString` or `__proto__` lays out in a typed view
  with boxes (layout() and check() threw before), and a card named `constructor` no longer opens a view of that name.
  Two delegation lines from one port to two parts or components side by side no longer cross: a port's inward lines
  whose far ends are level are ordered by depth on every face. Class and package `describe()` name an association's
  stereotypes. A called activity with a partition of its own unfolds in the call's lane and adds no lane.
  docs/diagrams/conformance/uml-component.md states the stress view's limits the fixtures pin.
- **C4, cloud and BPMN (#329).** A C4 dynamic view's c4-level message keeps a subject named with `$'` or `$&` as
  written. Cloud (AWS, GCP, Azure) and BPMN views draw, read and count a line listed twice in `view.edges` once, as the
  other types do. BPMN lays out and draws a flow with id `toString` or `constructor` and a pool with id `__proto__`.
  The BPMN note's `boundary-out` row covers message boundary events, as the code does.
- **Mermaid flowchart readers (#330).** Both the typed reader and `umlimator.py import`: a bare `subgraph` line is an
  untitled subgraph with Mermaid's id `subGraph<n>`; a quoted or Markdown label over several lines is joined into one
  statement; an opener with several closers (`[/`, `[\`) takes the nearest one. The map importer passes over a
  multi-line `accDescr { ... }` whole (flowchart and C4), and says on stderr each `~~~` link and each `classDef`,
  `class`, `style`, `linkStyle`, `click` and `direction` line it does not import, and that accessibility text is not
  imported (tests/import/checkout.mmd now prints three such lines).
- **CLI and MCP (#333).** `stills` draws a view again when a view-local card's inner view grows, or when a view lists
  another view's local card and that card changes. `render` says in one line, not a traceback, an id, `from`/`to`,
  `parent`, `nodeIds`/`stepIds` entry, `root`, `opensView` or `view` that is a list, object or bool. The MCP
  `highlight` tool gives a tool error for a Ref, or a string with `->`, that names nothing in the model.
- **Known gaps.** Still open from 0.33.0: a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core. A composite structure or SysML internal block view's Lines rows name a part by its id, not its drawn name. The
  JavaScript Mermaid readers still decode `#55296;` to a lone surrogate. The requirement layout leaves out a link into a
  box nested more than 64 deep from its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views
  laid out down. `reach()` from a model id that the view draws under another id returns only that element. A negative
  step duration plays 500 ms while `validate()`'s warning says 4000 ms. Mermaid C4 macro arguments keep entity codes as
  written. `describe()` of an inline interaction does not say it opens a view. Room for a label in a turned view is
  still mostly along the line. The map flowchart and Structurizr DSL readers turn a U+2028 inside a label into a space.
  `validate()` gives typed views no "listed twice" warning for `view.edges` (map views have one since #332; typed
  views draw the line once). The unfolded call behaviour box is a plain container frame. A page rendered before 0.33.0 with a numeric view id
  still ends in a traceback in `stills` and `check`. Changed: three or more delegations from one port into a grid of
  parts may still cross (composite structure laid out right with one port: 1 to 6 crossings for 4 to 6 parts; a
  component with three inner components: 1 right, 2 down); this needs a routing change, not a slot order. New: other
  files in src/bpmn may still key plain objects by id (only process.js was checked). The MCP server's `refit()` still
  keeps any `->` string when it trims a highlight after a model change. The typed Mermaid reader's quote join skips
  `%%` comment lines but not the body of a multi-line `%%{ }%%` directive (valid JSON there has an even quote count).
- **Size:** `lib/umlimator.js`, what a map host loads, is 194.6 kB (194,556 B) with `gzip -9`, 17.95% over 0.16.0's
  164,954 B, up 900 B from 0.33.0, nearly all in #332 (the URL filter, the work cap and the new warnings) and #331.
  `lib/umlimator-all.js` is 609.9 kB (609,925 B), up 1,858 B; the npm package is 880.2 kB (`npm pack --dry-run`). There
  is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a
  budget is set at 1.0.0.

## 0.35.0: fixes from the eighth audit

The eighth audit confirmed 24 findings. All are fixed in this release, in five pull requests (#335 to #339), each with
a test that fails without its fix. No map or example draws differently and `bench/expected.json` is unchanged. What
changes for callers:

- **Core (#339).** A card, box or view whose id is `toString`, `constructor`, `valueOf` or `__proto__` lays out like any
  other: before, `layout()` threw or dropped cards (a hub view with a `__proto__` card drew three of its five). Every
  object src/map/context.js, src/canvas/render.js and src/map/validate.js key by a card, box, view or lane id has no
  prototype and is tested with `Object.hasOwn`, as are the id-keyed maps the same views reach in src/layout/audit.js,
  src/layout/layered.js, src/draw/svg.js and src/map/typed.js. `validate()` and `rules()` see such a box or card as any
  other: no false "used twice" error or "in box function toString()…" warning, and a `parent: "toString"` that names no
  box is an error. A listed model line that ends on another view's box now warns too, and the warning's wording changes
  for the card case as well: `"ac" ends on "c", which is not one of the view's cards or boxes: not drawn`.
- **The page (#339).** Find and the details panel now select boxes. Picking an element this view draws as a box, in the
  Find palette or in the details panel's Comes from, Leads to and Also shown in rows, selects the box (before, nothing);
  Find picks a box on the current view in place, and its hit says "this view" and is ranked as such. `go(v, { select })`
  and the inner handle's `selectId` take a box's id the same way; the inner handle gains `boxHere(id)`. Expand, open,
  move and reorder still take a card. The details panel shows a source under `meta.sourceBase` that holds a bare `%` as
  written (it threw "URI malformed"), and leaves out a `source` entry that is not text (`source: [42]` threw).
- **UML types (#337).** Class: an operation whose parameter has a function type (`(e: Event) => void`, `() -> Unit`)
  keeps the parameters after it when its row is saved. The PDF's Elements and Lines tables name an open package by the
  qualified name it is drawn with (`sales::orders`). Composite structure: a card or port with an `Object.prototype` id
  is sized as any other. Object: a profile is drawn and named as a package with «profile», closed ("Profile
  Persistence (closed)") or open. Timing: a message drawn by keyboard (`L`) from a lifeline to a change is sent at the
  change's time, not refused as "received before it is sent"; a lifeline end is never sent after the change it reaches
  nor received before the change it leaves, and otherwise the slot's time applies. State machine: F2 on a transition
  and `add` return `{ error }` for an edit that would add an error (`initial-out`, `fork-join`, `initial-one`,
  `history-owner`) instead of emitting it. A palette pseudostate now goes into the selected state or region (or a
  state's only region), so a history pseudostate can be added at all; with nothing selected, a second initial or a
  history at the top is refused and the reason is shown (docs/editing.md says so).
- **Flowchart, C4, SysML, cloud and BPMN (#336).** `writeMermaidFlowchart` writes the flows the view draws: its `edges`
  list (ids resolved, inline flows kept) when it has one, else every flow; a flow it cannot write still gets a
  `%% not written` line. It writes `flowchart LR` for every direction the layout draws right, anything but null or
  `down` (before, only `right` gave LR). On a C4 dynamic view with no `edges` list, the first connect adds the
  relationship and lists it as step 1, so it is drawn. SysML type names resolve `label ?? id`, the name an element is
  drawn with (block labels, the parametric constraint and binding types, internal block interfaces, the property kind
  chosen on add): no false errors for an element with no label. Cloud (AWS, GCP): `describe()` decides the trademark
  line as `layout()` does, and an untyped card with an icon reads 'Element <name>' in `describe()` and its accessible
  name. `writeBpmnXml` writes a character XML 1.0 cannot hold (a C0 control such as U+000B, a lone surrogate, U+FFFE,
  U+FFFF) in a label, documentation or id as a space, so the file is well-formed, and reports it once per element
  with status `weakened` ("a character XML cannot hold: written as a space"; `line: ''` for the model's title), the
  first `weakened` item the writer gives. An id so written reads back with the space.
- **CLI (#335).** A label or detail holding `<!--` and then `<script` no longer breaks `render`, `diff`, `drift`, the MCP
  page and `timelapse`: every `<` in a page's JSON data block is written `<` (the same value). Every page rendered
  from now on differs from earlier renders in that way; examples/bookshop.html was rendered again and draws the same.
  `stills` draws a typed view again when another view's id, title or subject changes, and a DFD level when its parent
  view's cards change, as the page's own view key does. A view's own card (`view.nodes`) gets its icon. `diff` and
  `drift` name the user's file, not a deleted temp file, for a malformed model. `record` says in one line, before it
  looks for Chrome, a story step that is not an object; a `tour` that is not a list counts as no tour.
- **MCP (#338).** `tools/call` refuses an argument its tool's `inputSchema` does not list, with a tool error naming it
  and the tool's arguments (`reach: no argument direction; its arguments: view, card, backward, depth`); before,
  `reach` with `direction: 'backward'` silently walked forward. A model with a list or object id gets a tool error
  saying where (`the model m.json: nodes[1].id is not a string`) from every tool, as `render` says it, never -32603
  Internal error; `validate`, which answered on such a model before, now refuses it too.
- **Known gaps.** Still open from 0.34.0: a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core. A composite structure or SysML internal block view's Lines rows name a part by its id, not its drawn name. The
  JavaScript Mermaid readers still decode `#55296;` to a lone surrogate. The requirement layout leaves out a link into a
  box nested more than 64 deep from its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views
  laid out down. `reach()` from a model id that the view draws under another id returns only that element. A negative
  step duration plays 500 ms while `validate()`'s warning says 4000 ms. Mermaid C4 macro arguments keep entity codes as
  written. `describe()` of an inline interaction does not say it opens a view. Room for a label in a turned view is
  still mostly along the line. The map flowchart and Structurizr DSL readers turn a U+2028 inside a label into a space.
  `validate()` gives typed views no "listed twice" warning for `view.edges` (typed views draw the line once). The
  unfolded call behaviour box is a plain container frame. A page rendered before 0.33.0 with a numeric view id still
  ends in a traceback in `stills` and `check`. Three or more delegations from one port into a grid of parts may still
  cross; this needs a routing change. Other files in src/bpmn may still key plain objects by id (only process.js was
  checked). The MCP server's `refit()` still keeps any `->` string when it trims a highlight after a model change. The
  typed Mermaid reader's quote join skips `%%` comment lines but not the body of a multi-line `%%{ }%%` directive. New:
  the `geo.byId` that src/layout/layered.js and the typed layouts build with `Object.fromEntries` still has a
  prototype, so looking up an `Object.prototype` id that is not drawn there sees the inherited property. `validate()`
  gives no warning for a node's `source` entry that is not a string (the page ignores it; the schema forbids it). The
  PDF tables read an open package's qualified name off its drawn title, and only when the title ends in `::` and its
  label; a real name field on boxes would need tests/core-diet.json recorded again.
- **Size:** `lib/umlimator.js`, what a map host loads, is 195.2 kB (195,186 B) with `gzip -9`, 18.33% over 0.16.0's
  164,954 B, up 630 B from 0.34.0, nearly all in #339 (the prototype-free maps and Find reaching boxes) and #337.
  `lib/umlimator-all.js` is 611.7 kB (611,709 B), up 1,784 B; the npm package is 882.6 kB (`npm pack --dry-run`). There
  is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a
  budget is set at 1.0.0.

## 0.36.0: fixes from the ninth audit

The ninth audit confirmed 33 findings. All are fixed in this release, in five pull requests (#341 to #345), each with a
test that fails without its fix. 14 of them were one sweep: ids named `constructor`, `toString`, `valueOf` or
`__proto__` outside the maps 0.35.0 made prototype-free. No map or example draws differently and `bench/expected.json`
is unchanged. What changes for callers:

- **Ids named after `Object.prototype`'s keys (#345).** Every id-keyed table is now prototype-free where it is built, so
  a card, line, box or view named `constructor`, `toString`, `valueOf` or `__proto__` behaves like any other everywhere.
  `geo.byId` has no prototype in src/layout/layered.js and in every typed layout that builds or copies it (use case,
  timing, sequence, C4, SysML, internal block, parametric, activity, structure's `portsDrawn`, mind map, the empty
  view), so a prototype name that the view does not draw is no longer "found": no NaN bounds from a box or intake, no
  phantom pick for `select()`, the live region, Find or a panel link. `highlight()`, lenses, story steps and the tour
  build their layers the same way and dim such cards and lines; the marks read every layer, a host's plain-object
  `overlay()` layer included, by own key. `diff()` keeps the removed, added and changed marks of a card named
  `__proto__`. A use case actor named `__proto__` stays in the actors' column. The PDF Lines table of a typed view no
  longer lists a line named `constructor` or `toString` that the view does not draw. A DFD line or a SysML element typed
  with a prototype name no longer gets a function as its end look, word or name, nor makes `validate()`, `layout()` or
  `check()` throw. What a host sees: `geo.byId` and the highlight and lens layers now have no prototype, so a deep-equal
  against `{}` differs (`[Object: null prototype] {}`). `apply()`'s `set` refuses `__proto__`, `constructor` and
  `prototype` only as the first key of a path, where they name an element's or view's own field; every deeper key is
  written as an own key, so `layout.<id>` and `present.<id>` work for such ids, and no path reaches `Object.prototype`
  (`'__proto__.x'` is still refused).
- **Core (#342).** `mapContext` leaves out an entry that is not an object in `nodes`, `edges`, `views`, a view's `nodes`
  or `containers` (a `null` there made `layout()`, `check()` and `render()` throw for every view); `validate()` already
  reported them as errors. A view's `gap` or `rgap` is used only when it is a number above 0, and one over 2000 is drawn
  as 2000; any other value is the default, and `validate()` warns at `views[i].gap` / `views[i].rgap` ("is not a number
  above 0: ignored", "is over 2000 px: drawn as 2000"). Before, `'wide'` blanked the view with NaN coordinates. A string
  gap such as `'80'` is now ignored with that warning (the schema says number); it worked by accident before.
- **The page (#342).** A double-click on an unselected card opens it even when the details panel that its first click
  opened moved the legend under the pointer: for about 1 s after a click on a card (same view), `render()` listens on
  the host document in the capture phase, and a second click or a dblclick outside the map opens the card the first
  click hit; a single click outside clears it, and `destroy()` removes the listeners. Picking a Find result moves focus
  to the pick (the selected card, or the map for a view) instead of dropping it to `<body>`.
- **UML types (#343).** Class: a view with no `edges` list draws only class lines (Association, Generalization,
  InterfaceRealization, Dependency, CommentLink; a profile view adds Extension and ProfileApplication), and `describe()`
  and the `line-inside` check use the same list. Before, it drew other diagrams' lines (Usage, Connector, Realization,
  PackageImport, InformationFlow and others) as solid filled arrows; list them in `view.edges` to draw them. Listed, a
  Usage is dashed with an open arrowhead and «use», an Abstraction the same with «abstraction», a Realization or
  ComponentRealization dashed with a hollow triangle, a Connector a plain line, each with a legend entry and its own
  accessible word; a line between two members of one owner is no longer a loop on that owner. Profile: a closed package
  draws the required stereotype its profile supplies (its tags stay in the accessible name). `member-kinds` now covers a
  profile and a metaclass reference. Component, deployment and composite structure views warn `own-boxes` when a view
  has hand-written containers, which they ignore. Sequence and communication: `create-once` and `delete-once` allow one
  per operand of an `alt`, as `reply-once` does, and so does the drag that creates or deletes.
- **SysML, Mermaid and the conformance notes (#341).** An internal block view finds a part's type by `label ?? id` (the
  ports of a block with no label are drawn, no false `part-type` warning); UML composite structure finds a class with no
  label by its id the same way, and a class with a label by its label only. The parametric `binding-types` warning names
  a type with no label by its id, not "undefined". `writeMermaidClass` writes a class named like one of the reader's
  statement keywords (`note`, `class`, `direction`, `style` and the rest) in backticks, so it reads back. The flowchart,
  state machine and object conformance notes and examples/README.md say what the code does.
- **CLI and MCP (#344).** A model with a number id (a card, a line's end, a `nodeIds` or `stepIds` entry, a view's
  `parent`, `opensView`/`view`, `root`) is refused in one line by `render`, MCP and every command that reads a model
  ("nodes[0].id is not a string"), as `validate()` says; before, `render` took it and `stills` and MCP `paths` and
  `reach` crashed. MCP refuses a view's own card whose `members` is not a list in one line, before `highlight` hits it.
  `check` reports a misspelt pack icon on a view's own card. The diff Action's Mermaid sketch writes `#` as `#35;`, so a
  label such as "Order #42; paid" reads as written.
- **Known gaps.** Still open from 0.35.0 (checked on main: the JavaScript Mermaid readers still decode `#55296;` to a
  lone surrogate, typed views still get no "listed twice" warning, `validate()` still says nothing of a non-string
  `source` entry): a box has no Tab stop; the keyboard reaches it through the outline. A double-click (or Enter) on a
  box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the core. A composite structure or
  SysML internal block view's Lines rows name a part by its id, not its drawn name. The JavaScript Mermaid readers still
  decode `#55296;` to a lone surrogate. The requirement layout leaves out a link into a box nested more than 64 deep
  from its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views laid out down. `reach()`
  from a model id that the view draws under another id returns only that element. A negative step duration plays 500 ms
  while `validate()`'s warning says 4000 ms. Mermaid C4 macro arguments keep entity codes as written. `describe()` of an
  inline interaction does not say it opens a view. Room for a label in a turned view is still mostly along the line. The
  map flowchart and Structurizr DSL readers turn a U+2028 inside a label into a space. `validate()` gives typed views no
  "listed twice" warning for `view.edges` (typed views draw the line once). The unfolded call behaviour box is a plain
  container frame. A page rendered before 0.33.0 with a numeric view id, or before 0.36.0 with a numeric card id, still
  ends in a traceback in `stills` and `check`. Three or more delegations from one port into a grid of parts may still
  cross; this needs a routing change. Other files in src/bpmn may still key plain objects by id (only process.js was
  checked). The MCP server's `refit()` still keeps any `->` string when it trims a highlight after a model change. The
  typed Mermaid reader's quote join skips `%%` comment lines but not the body of a multi-line `%%{ }%%` directive.
  `validate()` gives no warning for a node's `source` entry that is not a string. The PDF tables read an open package's
  qualified name off its drawn title, and only when the title ends in `::` and its label; a real name field on boxes
  would need tests/core-diet.json recorded again. New: no example reaches the C4 and C4 views lift branch or
  src/sysml/sysml.js's frame branch, so the sweep does not check their `byId`; Find and the panel links are fixed
  through `geo.byId`, but only `select()` has a browser test of its own. The double-click test sends synthetic events; a
  real-mouse sweep of the atlas cards was not run again. The SysML block definition view has no own list of line kinds,
  so it still draws every kind (a Usage there now gets the dashed «use» look). The 21 typed examples do not set
  `"$schema"`.
- **Size:** `lib/umlimator.js`, what a map host loads, is 196.1 kB (196,083 B) with `gzip -9`, 18.87% over 0.16.0's
  164,954 B, up 897 B from 0.35.0, nearly all in #342 (the entry and gap checks, the double-click listeners, Find's
  focus) and #345 (`idTable` at every id-keyed table). `lib/umlimator-all.js` is 613.2 kB (613,242 B), up 1,533 B; the
  npm package is 885.1 kB (`npm pack --dry-run`). There is no core size cap until 1.0.0 (the maintainer's decision of 15
  Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.37.0: fixes from the tenth audit

The tenth audit confirmed 24 findings. 23 are fixed in code in this release, in five pull requests (#347 to #351), each
with a test that fails without its fix; the 24th is a slip in the 0.35.0 section, corrected below. No map or example
draws differently and `bench/expected.json` is unchanged. What changes for callers:

- **Core (#347).** `apply()`'s delete of a card whose id also names a view keeps that view's sub-views' `parent`: the
  parent is the view, which the delete does not touch (before, the sub-views were detached). A `parent` that names only
  a card is cleared, as before. A story step's `select` or `highlight` entry that is a Ref now names an element:
  `references()`, delete and hide read its `id` (a card), its `node` (a chip or badge) and every one of its `ids` (a
  line); a container Ref names no element. Delete removes the whole entry, so a line Ref goes when any one of its lines
  goes. **`validate()` now reports a Ref that names nothing as an error**, as it already did a plain id; before, it was
  clean. A `when`, `what`, `how`, `origin`, `author` or `note` that is not a string, and a `meta.root` that is not a
  string, is drawn as text (`String()`) on the card and in the details panel, and `validate()` warns "<field> is text:
  drawn as written"; before, `render()` threw on a list `what` and the details panel threw on a number `author` and
  kept showing the previous card.
- **The page (#347).** Round 9's double-click drill-down now works inside `<umlimator-map>`'s shadow root: the host
  document's capture listener tests `composedPath()`, not `contains()`, so a double-click opens the card once, and
  Alt+double-click or a double-click on a selected card's name no longer opens the view (a regression in 0.36.0 for
  every element host).
- **UML types (#349).** Composite structure: a connector between two ports of one part, or two ports of a subject with
  no box, is not drawn (it was a diagonal) and gets a `connector-drawn` warning naming the part or the subject; SysML
  parametric and internal block views reuse that picture, so a broken binding with both ends on one value now gets
  that warning next to its `binding-ends` error. A line typed `constructor` or `toString` lays out and is drawn in the
  component, deployment, class, package, use case and composite views, with no function source in its label, accessible
  name, `describe()` or PDF row (the type-keyed tables have no prototype). PDF: a collaboration role's row is `name :
  Type`, with no `composite` suffix, and a typed view's Boxes table leaves out the hand-written containers the picture
  ignores. The composite palette's Part entry adds a part even when the typed name starts with "port ". Sequence:
  `create-once` reports a message that reaches a lifeline before its first create in any operand (the head is drawn
  there); a lifeline's stem ends at its last delete unless a later operand still reaches it, and every other delete is
  a cross on the stem (`layoutTimeAxis` gives an optional `stems[].kills`).
- **C4, SysML, BPMN and Mermaid (#350).** C4 dynamic view with no `edges` list: a comment link drawn with L or the
  handle is listed and drawn. C4 deployment view whose subject is a software system: the Container instance palette
  entry and T offer only that system's containers ("The view's system has no container to deploy" when it has none); a
  view with no subject still offers every container. Requirement diagram: a Copy that would change the copied text of
  a requirement that already copies one or is copied is refused, in `copy-text`'s words; a Copy between equal texts is
  drawn as before. BPMN: `describe()` prints a line's and a group's documentation after its name, and the PDF Lines
  table puts a line's documentation after its name. The Mermaid flowchart reader is linear on chained links
  (`A-->B-->C-->...`): a 105,000-node chain reads in well under 1 s (was about 61 s).
- **CLI (#351).** `render`, `diff`, `drift` and the MCP load refuse a view with no id, an empty id or a repeated id in
  one line (`views[i].id: a view needs an id`, `views[i].id "v" is used twice`), as `validate()` does; before, `stills`,
  `check` and `pdf` crashed afterwards. With no Chrome, `render` prints `"checked": false` and a `"skipped"` field with
  the reason, and one stderr line (`<out> is written, but its layout check was skipped: no Chrome/Chromium found`); it
  still exits 0 (before, it printed `"checked": true`). `diff --base` reports a model whose `nodes` and `views` are no
  longer both lists as "cannot be read: it is no longer a map model", not as every view and card removed, and counts a
  new model git does not track yet as added. The diff summary puts a word joiner after `#` and `GH-` before a digit, so
  `#42`, `owner/repo#7` and `GH-12` link no issue.
- **MCP (#348).** `page_state` answers while the model is mid-edit (not JSON) with `model.renders: false` and the
  error; a page tool on such a version is checked against the last version that rendered, answers "The model no longer
  renders, so the page shows its last version that did: ...", and the open pages get the banner. After a model edit,
  `refit()` keeps a highlight of a member (a port) and drops an id-less line (`a->b#0`) the new version no longer has.
- **Correction to 0.35.0.** Its CLI (#335) bullet says every `<` in a page's JSON data block is written `<`. The CLI
  writes it as the JSON escape `\u003c` (`script_json` and `data_lt` in umlimator.py), the same value once parsed, so a
  rendered page's source shows `\u003c` wherever a label has `<`. The 15 Nov 2026 (0.34.0, 0.35.0) entry of
  docs/diagrams/README.md's log has the same slip. The released sections stay as written.
- **Known gaps.** Still open from 0.36.0 (checked on main: the JavaScript Mermaid readers still decode `#55296;` to a
  lone surrogate, a typed view still gets no "listed twice" warning for `view.edges`, `validate()` still says nothing
  of a non-string `source` entry, the 21 typed examples still do not set `"$schema"`): a box has no Tab stop; the
  keyboard reaches it through the outline. A double-click (or Enter) on a box does not open its view (the 0.24.0 gap).
  Deep nesting is super-linear outside the core. A composite structure or SysML internal block view's Lines rows name
  a part by its id, not its drawn name. The requirement layout leaves out a link into a box nested more than 64 deep
  from its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views laid out down. `reach()`
  from a model id that the view draws under another id returns only that element. A negative step duration plays 500
  ms while `validate()`'s warning says 4000 ms. Mermaid C4 macro arguments keep entity codes as written. `describe()`
  of an inline interaction does not say it opens a view. Room for a label in a turned view is still mostly along the
  line. The map flowchart and Structurizr DSL readers turn a U+2028 inside a label into a space. The unfolded call
  behaviour box is a plain container frame. A page rendered before 0.33.0 with a numeric view id, before 0.36.0 with a
  numeric card id, or before 0.37.0 with a view with no id, still ends in a traceback in `stills`. Three or more
  delegations from one port into a grid of parts may still cross; this needs a routing change. Other files in src/bpmn
  may still key plain objects by id (only process.js was checked). The typed Mermaid reader's quote join skips `%%`
  comment lines but not the body of a multi-line `%%{ }%%` directive. The PDF tables read an open package's qualified
  name off its drawn title, and only when the title ends in `::` and its label. No example reaches the C4 views lift
  branch or src/sysml/sysml.js's frame branch, so the prototype sweep does not check their `byId`; only `select()` has a
  browser test of its own among Find and the panel links. The double-click tests send synthetic events. The SysML
  block definition view has no own list of line kinds, so it draws every kind. Fixed since 0.36.0: the MCP server's
  `refit()` no longer keeps any `->` string (#348). New: the SysML tables `SYS_IB_PROP`, `SYS_PAR_PROP`,
  `SYS_PAR_SUBJ`, `RQ_REL` and `BD_ORDER` were not checked for lookups of `Object.prototype` names. When two operands
  of one `alt` each create a lifeline, the second create arrow lands on the stem below the single head (two heads
  cannot be drawn). `printDoc`'s rules section and `rules()` still count a typed view's hand-written containers as
  boxes a rule can name; changing that changes rule semantics. An MCP page tool on a model that has never rendered
  still says it cannot read the model.
- **Size:** `lib/umlimator.js`, what a map host loads, is 196.5 kB (196,512 B) with `gzip -9`, 19.13% over 0.16.0's
  164,954 B, up 429 B from 0.36.0, nearly all in #347 (the `String()` text, the new warnings, the Ref reading) and #349
  (the prototype-free type tables). `lib/umlimator-all.js` is 615.0 kB (614,975 B), up 1,733 B, most of it #350; the
  npm package is 887.3 kB (`npm pack --dry-run`). There is no core size cap until 1.0.0 (the maintainer's decision of 15
  Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.38.0: fixes from the eleventh audit

The eleventh audit confirmed 23 findings. All 23 are fixed in this release, in five pull requests (#353 to #357), each
with a test that fails without its fix, except one that changes only a comment (the requirement reader's header). No map
or example draws differently and `bench/expected.json` is unchanged; only the keyboard focus ring looks different. What
changes for callers:

- **Core (#357).** `diff()` now says when a view hides or shows a model line that has no id ("takes the line from A to B
  (pays) out of the view v", "puts ..."), lists that view, and returns the line in the view's edges marked removed;
  before, it keyed lines by id only and said nothing. A map line from a box to a card or box inside it (at any depth)
  was never drawn; it is now also left out of `describe()`, `rules()`, `paths()`, lenses, the PDF tables and layout
  planning, so they agree with the picture, and **`validate()` warns about it**: `joins the box "payments" and "db",
  which it holds: not drawn in view "main"` (path `edges[i]`; for a view's own list, path `views[i].edges[j]` and no
  view name). `layout()` still sends the same `console.warn` (#28), now from context.js; `check()` stays geometry only;
  typed views are not affected. Delete now clears a positional line name (`x->y#n`) that no longer exists from story
  steps, lenses and rules, as it clears an id, and **`validate()` warns when a step's `select` or `highlight` names
  `x->y#n` and no line has that name** ("names no line: the step shows nothing for it"). It is a warning, so a model
  that validated still validates; `->` names without `#n` (a typed view's geometry ids such as `owner->child`) are
  accepted as before. The keyboard focus ring on lines and typed elements (`.line-key:focus-visible .key-ring`) goes
  from stroke-opacity .55 to .8: 3.59:1 on the light stage, 3.66:1 on a white card and 4.5:1 on the dark stage, at least
  WCAG 1.4.11's 3:1 (it was 2.33:1 and 2.63:1).
- **UML types and mindmap (#354).** Composite structure `connect()` refuses a connector from a part or box to itself:
  two ports of one part, two ports of the subject, or both ends on one box get "A connector joins two parts or ports of
  two elements: no line runs from a part or a box to itself". SysML internal block and parametric views share that hook,
  so they refuse the same. `member-names` now judges only classifiers (class, interface, enumeration, data type,
  primitive type, stereotype) and instance specifications, and skips members with no name; this holds for the object,
  package and profile types too. **It no longer checks a component or any other non-classifier owner**, so two
  same-named ports on a component, or two unnamed regions of a state, are no longer reported by it. In a composite view
  with no `edges` list, `connector-part` now warns of a connector whose unnamed end's port belongs to a type of a part
  of the subject. Ports on a collaboration's roles stay supported and are now checked: `connector-scope` places a role
  end in its collaboration, and `connector-part` (its description now "an end's part is a part of the subject or a role
  of a collaboration shown, and the end is a port of that part's type") accepts a role of a shown open collaboration;
  docs/diagrams/conformance/uml-composite-structure.md is corrected. Mindmap: Alt + the arrow towards the root puts the topic
  before its old parent's next sibling when `nodeIds` is not in pre-order (it went after the parent's later siblings).
- **BPMN, flowchart and conformance notes (#353).** The BPMN PDF Elements table lists a pool's lanes, in lane order,
  after the pool's documentation, each as "label — documentation" when the lane has documentation (a documented pool
  lost its lanes, and lane documentation was printed nowhere). Delete of a lane with a sequence flow selected now
  deletes: the line is skipped on a view with no edges list, as the canvas's own Delete does, with the hint "Shift +
  Delete deletes the line" (before, `apply()` refused the hide and nothing was deleted). A boundary event's
  `present.<id>.side` named for an `Object.prototype` key is ignored as an unknown value is. The JSON schema's
  `view.direction` text reads "(default right; down for a flowchart)", as the layout does. The information flow note no
  longer calls information items supported flow ends; the component, deployment and composite structure notes list
  `own-boxes`.
- **Readers and writers (#356).** The Python map importer's Mermaid flowchart reader is linear on a long line of nodes
  with no closer (a 1 MB line read in 26 to 62 s, now about 1 to 2 s). The Mermaid class writer reports, and does not
  write, an empty stereotype, one ending in `>`, or one with a space at either end; it reports a value, return or
  parameter type with a space at either end (`type …, read back trimmed`), still written. The class and sequence writers
  skip and report an id with a space or tab at either end (view, class, note, member, relation and link ids; view,
  lifeline, message, use, fragment and operand ids), as the state and flowchart writers do; their report for a view id
  reads "which a hint cannot carry" (was "which has a line break"). `writeBpmnXml` reports a blank id ("a blank id,
  which a reader reads as none"). The requirement reader's header names the copy-text exception.
- **CLI and MCP (#355).** `diff` (both files), `drift`, `trace`, `export` and the MCP `diff` tool's `other_model_path`
  refuse a model `render` refuses, naming the file at fault; `diff --base` checks each version under its own name ("its
  version at REF: ...", "it: ..."). The MCP `highlight` with no view picks a view that has the line for a `from->to#n`
  name, the card of a chip or badge, and a box Ref's container. `diff --base`'s "No picture" line writes view ids
  through the same flattening as the rest of the summary, so `@name`, `#42` and `<!--` mention, link and hide nothing.
  `trace --view ''` exits with "trace: --view needs a view id" before writing.
- **Known gaps.** Still open from 0.37.0 (checked on main: the JavaScript Mermaid readers still decode `#55296;` to a
  lone surrogate, a typed view still gets no "listed twice" warning for `view.edges`, `validate()` still says nothing of
  a non-string `source` entry, 21 of the 30 typed examples still do not set `"$schema"`): a box has no Tab stop; the
  keyboard reaches it through the outline. A double-click (or Enter) on a box does not open its view (the 0.24.0 gap).
  Deep nesting is super-linear outside the core. A composite structure or SysML internal block view's Lines rows name a
  part by its id, not its drawn name. The requirement layout leaves out a link into a box nested more than 64 deep from
  its ranking. Typed hooks that answer Alt+arrows themselves were not checked on views laid out down. `reach()` from a
  model id that the view draws under another id returns only that element. A negative step duration plays 500 ms while
  `validate()`'s warning says 4000 ms. Mermaid C4 macro arguments keep entity codes as written. `describe()` of an
  inline interaction does not say it opens a view. Room for a label in a turned view is still mostly along the line. The
  map flowchart and Structurizr DSL readers turn a U+2028 inside a label into a space. The unfolded call behaviour box
  is a plain container frame. A page rendered before 0.33.0 with a numeric view id, before 0.36.0 with a numeric card
  id, or before 0.37.0 with a view with no id, still ends in a traceback in `stills`. Three or more delegations from one
  port into a grid of parts may still cross; this needs a routing change. Other files in src/bpmn may still key plain
  objects by id (process.js was checked, and #353 took the prototype off `BZ_PIN`, `BZ_NAME`, `BZ_TURN` and `BZ_V`). The
  typed Mermaid reader's quote join skips `%%` comment lines but not the body of a multi-line `%%{ }%%` directive. The
  PDF tables read an open package's qualified name off its drawn title, and only when the title ends in `::` and its
  label. No example reaches the C4 views lift branch or src/sysml/sysml.js's frame branch, so the prototype sweep does
  not check their `byId`; only `select()` has a browser test of its own among Find and the panel links. The double-click
  tests send synthetic events. The SysML block definition view has no own list of line kinds, so it draws every kind.
  The SysML tables `RQ_REL` and `BD_ORDER` are still plain objects (`SYS_IB_PROP`, `SYS_PAR_PROP` and `SYS_PAR_SUBJ`
  have no prototype). When two operands of one `alt` each create a lifeline, the second create arrow lands on the stem
  below the single head. `printDoc`'s rules section and `rules()` still count a typed view's hand-written containers as
  boxes a rule can name. An MCP page tool on a model that has never rendered still says it cannot read the model. New:
  when a delete removes some of several id-less lines with the same ends, the names of the lines left can shift; a name
  that now points at a different line is not caught (only names that no longer exist are cleared). `validate()` still
  accepts a positional name (docs/diagrams/risks.md F9), and warns only when it names no line. `diff()` numbers id-less
  lines among id-less lines only, where Ref names count every line with the same ends; the keys never leave `diff()`.
  The profile, package and SysML block definition conformance notes point to the class or package note for the shared
  class rules instead of naming each one.
- **Size:** `lib/umlimator.js`, what a map host loads, is 197.6 kB (197,612 B) with `gzip -9`, 19.80% over 0.16.0's
  164,954 B, up 1,100 B from 0.37.0, all of it #357 (the line keys in `diff()`, `boxHolds()`, the line names and the two
  new warnings). `lib/umlimator-all.js` is 617.1 kB (617,094 B), up 2,119 B: #357 1,099 B, #354 479 B, #353 309 B and
  #356 232 B; the npm package is 890.5 kB (`npm pack --dry-run`). There is no core size cap until 1.0.0 (the
  maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.39.0: fixes from the twelfth audit

The twelfth audit confirmed 28 findings. All 28 are fixed in this release, in five pull requests (#359 to #363), each
with a test; two of the findings (a delete and a hide leaving a story step on the wrong line) are one defect with one
fix. No map or example draws differently and `bench/expected.json` is unchanged; the details panel of a part or a port
reads differently, and a requirement view with an unknown direction is now laid out right. What changes for callers:

- **Core (#360).** Delete and hide now keep a story's positional line names (`x->y#n`) on the lines they named. When a
  delete or a hide removes one of several id-less lines with the same ends and a line left only moves place, the name is
  renamed (`'a->b#1'` becomes `'a->b#0'`) in story steps, lenses and rules, in strings and in Refs (`id`, `node`,
  `ids`), and names used as object keys are renamed all at once, so two names that swap stay right; a name is cleared
  only when its line went. Before, deleting a line with an id cleared the name of a surviving id-less line with the same
  ends, or left a step quietly pointing at the next line, and hide left a step naming a view's own id-less line it had
  removed. **`lineNames()` now returns a Map** from each positional name to the lines it names (it was a Set); `.has()`
  reads it as before. **`rules()` leaves out a self-loop (`from === to`)**, which a view does not draw, as `describe()`
  and the PDF already did; it reported a break on one. `diff()`: **a view that dropped its edges list now gets an
  explicit list** of the lines it draws, with the lines it puts in marked added (it said "puts the line ..." but marked
  nothing); the drawn set does not change. **`diff()` brings back a removed message's fragment or a removed state's
  region**: when a removed item's owner (a fragment operand, or a member such as a region) is missing from `after`, that
  owner comes back from `before`, marked `change: 'removed'`, at its old index, so the result validates and the state is
  drawn inside its state's box.
- **UML types (#361).** Sequence and communication: **a self create or a self delete message is now an error** of
  `validate()`, a `create-once` or `delete-once` error, as the connect hook already refused it; the two rule texts now
  end "never by itself" ("a lifeline is created at most once, by the first message to or from it, never by itself").
  Component: line accessible names, `describe()` and the PDF rows **name each end as the picture does** (`Web to
  orders::Api`, and `<port> of <owner>` for a port), not by the bare label. Composite structure: in a view with no
  `edges` list, `connector-part` no longer warns about a connector that belongs to another classifier's own structure (a
  regression from 0.38.0); a collaboration with no label is found by its id, so the false collaboration-named warning
  goes and `binding-role` and the role picker work again; `describe()` no longer throws on a part id holding `->`
  (`validate()` still reports the id). Timing: a reply with no `replyTo` gets "names no call in replyTo: a reply from
  payments to worker needs a call from worker to payments sent no later" (it read "m1 answers undefined"), and both
  reply-call messages name lifelines by name. Information flow: F2 then Enter on a flow's text as drawn changes nothing
  (it could swap what the flow conveys when a name held ", ").
- **C4, DFD, ER, BPMN, mindmap and SysML (#362).** C4 deployment: **an instance is named by its container** in line
  names and `describe()`; **T also updates the instance's label** when it still equalled the old container's name; **F2
  on an instance is refused** with "An instance is named as its container: T picks another container". DFD: **a new
  warning rule, `dfd-notation`** (DFD now has seven rules): `"dfd-level-1" has notation "gane-and-sarson", drawn as
  yourdon: write yourdon or gane-sarson` (an unknown notation was drawn as Yourdon with no warning). ER: **a new
  column's id drops `->`** (`"payload->>type" text` gets `<entity>.payload-type`); `apply()` threw. BPMN: **Delete of a
  lane with a node inside it also selected now works**: the node is moved to the pool, then hidden; Shift + Delete is
  unchanged. Mindmap: **Show after Delete puts a first-level topic back on its side** (backlog 4a.4); where it goes in
  the order is unchanged and documented (notes/milestone-4a.md §7.3). SysML block definition: **`member-names` now
  judges blocks, interface blocks, constraint blocks and value types**, operations keyed by their parameter types as for
  a class.
- **CLI and readers (#359).** **`--out` naming the command's input is refused** before anything runs: "CMD: --out X is
  its input: name another file", for the model, file, page, observed file or either diff file (`trace`, whose docs allow
  `--out MODEL.json`, is exempt); before, it replaced the input and exited 0. `import` of JSON nested too deep reads
  "import: FILE nests too deep to read: nothing written", not a RecursionError traceback. The Structurizr DSL importer
  stops walking views at 500,000 elements and relationships in all (`VIEW_WORK`, as the JavaScript reader's cap): that
  view and the rest are left out and said once (541 KB of DSL took 111 s and 5 GB). The Mermaid state writer names under
  `%% not written` a transition whose ends are both left out. map-repo's `cli.py` clone-failure message asks for a git
  clone of the tag (`git clone --branch vX https://github.com/zintaen/umlimator.git DIR/vX`). The 0.14.0 note above,
  which says `UMLIMATOR_CLI_CACHE` names "a folder that holds the release", means a git clone of the release's tag.
- **Page, MCP, schema and docs (#363).** The details panel **names a part or a port as drawn** ("checkout : CheckoutFlow
  [1]", kind word Part or Port), not by its internal id with "Script INTERNAL", and a collaboration use's rows name its
  parts as drawn. The MCP `highlight` with no view now finds the view of a line that ends on a port, a port on a part's
  type or a box (it landed on the current view and dimmed every card). The JSON schema's typed `view.direction` text
  reads "default right; down for a flowchart, a profile, a SysML block definition or requirement view". A requirement
  view whose direction is neither right nor down is now laid out right, as `validate()`'s warning says (it was laid out
  down), and the Mermaid requirement writer writes `direction LR` for it ("written as Mermaid's LR, as it is drawn"; it
  wrote TB). The gallery's state machine card lists the pseudostates order-states.json draws.
- **Known gaps.** Still open from 0.38.0 (checked on main with a small script: the JavaScript Mermaid readers still
  decode `#55296;` to a lone surrogate, a typed view still gets no "listed twice" warning for `view.edges`, `validate()`
  still says nothing of a non-string `source` entry, 21 of the 30 typed examples still do not set `"$schema"`): a box
  has no Tab stop; the keyboard reaches it through the outline. A double-click (or Enter) on a box does not open its
  view (the 0.24.0 gap). Deep nesting is super-linear outside the core. A composite structure or SysML internal block
  view's PDF Lines rows name a part by its id, not its drawn name (#363 fixed the details panel only). The requirement
  layout leaves out a link into a box nested more than 64 deep from its ranking. Typed hooks that answer Alt+arrows
  themselves were not checked on views laid out down. `reach()` from a model id that the view draws under another id
  returns only that element. A negative step duration plays 500 ms while `validate()`'s warning says 4000 ms. Mermaid C4
  macro arguments keep entity codes as written. `describe()` of an inline interaction does not say it opens a view. Room
  for a label in a turned view is still mostly along the line. The map flowchart and Structurizr DSL readers turn a
  U+2028 inside a label into a space. The unfolded call behaviour box is a plain container frame. A page rendered before
  0.33.0 with a numeric view id, before 0.36.0 with a numeric card id, or before 0.37.0 with a view with no id, still
  ends in a traceback in `stills`. Three or more delegations from one port into a grid of parts may still cross; this
  needs a routing change. Other files in src/bpmn may still key plain objects by id. The typed Mermaid reader's quote
  join skips `%%` comment lines but not the body of a multi-line `%%{ }%%` directive. The PDF tables read an open
  package's qualified name off its drawn title, and only when the title ends in `::` and its label. No example reaches
  the C4 views lift branch or src/sysml/sysml.js's frame branch, so the prototype sweep does not check their `byId`;
  only `select()` has a browser test of its own among Find and the panel links. The double-click tests send synthetic
  events. The SysML block definition view has no own list of line kinds, so it draws every kind. The SysML tables
  `RQ_REL` and `BD_ORDER` are still plain objects (`SYS_IB_PROP`, `SYS_PAR_PROP` and `SYS_PAR_SUBJ` have no prototype).
  When two operands of one `alt` each create a lifeline, the second create arrow lands on the stem below the single
  head. `printDoc`'s rules section and `rules()` still count a typed view's hand-written containers as boxes a rule can
  name. An MCP page tool on a model that has never rendered still says it cannot read the model. `validate()` still
  accepts a positional name (docs/diagrams/risks.md F9), and warns only when it names no line. `diff()` numbers id-less
  lines among id-less lines only, where Ref names count every line with the same ends; the keys never leave `diff()`.
  The profile, package and SysML block definition conformance notes point to the class or package note for the shared
  class rules instead of naming each one. The 0.38.0 gap of a partial delete shifting the names of the lines left is
  closed by #360. New: `diff()`'s summary of a restored region still reads "changes Fulfilling (members)", not "removes
  the region Payment"; a restored fragment or region is marked removed, but no removed look is drawn for frames or
  regions; if a restored owner's members moved elsewhere in `after`, they could come back twice. Component `validate()`
  messages still name ends by the bare label. A C4 deployment instance's Name field in the panel still writes its label,
  which now shows nowhere. #362's new tests were not run against the unfixed code.
- **Size:** `lib/umlimator.js`, what a map host loads, is 198.8 kB (198,823 B) with `gzip -9`, 20.53% over 0.16.0's
  164,954 B, up 1,211 B from 0.38.0: #360 1,123 B (the line-name renames, the self-loop filter and the two `diff()`
  fixes) and #363 88 B (the requirement direction). `lib/umlimator-all.js` is 619.5 kB (619,466 B), up 2,372 B: #360
  1,117 B, #362 679 B, #361 396 B, #363 138 B and #359 42 B; the npm package is 894.1 kB (`npm pack --dry-run`). There
  is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a
  budget is set at 1.0.0.

## 0.40.0: fixes from the thirteenth and fourteenth audits; documentation site

The thirteenth audit confirmed 22 findings and the fourteenth 24. All 46 are fixed in this release, in nine pull requests
(#365 to #369 for round 13, #374 to #377 for round 14), each with a test; in round 13, two findings (an `--out` named in
other case, and one named by a hard link) are one defect with one fix. Maps draw as before and `bench/expected.json` is
unchanged. **Typed views change in one way: #377 removes crossings** where a request/reply pair between two cards crossed
itself (listed below). The release also brings the documentation site at zintaen.github.io/umlimator/ (#370 to #373)
and category icons for Google Cloud products the pinned pack has no icon of (#378). What changes for callers:

- **Core, round 13 (#369).** **Story line names (`a->b#n`) are counted per list**: the model's list, and each view's own `edges` list. **`lineNames()` now returns a Map from list to names** (`-1` for the model's list, `i` for view `i`'s own list), each a Map from a name to its lines; 0.39.0's Map from name to lines is one entry of it. A delete or a hide renames or clears a name only in the list it touched and only where that list is drawn (steps, pins, `present` and overrides on a view that draws it); before, a step on one view could move onto a line of another view between the same cards. `validate()` checks a step's `a->b#n` against the list its view draws. **`diff()` says a member gone from an element that stayed as "removes battery from CargoBike"** (it said "changes CargoBike (members)") and no longer repeats its connectors; a deleted part or port that a removed line ends on comes back `change: 'removed'` at its old index, so its connectors draw rose and dashed and the diff model validates (a deleted class attribute or internal transition is said but not put back). **A view that dropped its `edges` list** gets a list built from the lines it draws, so its own lines come back marked removed and removed lines to removed cards stay drawn, whether or not it put a line in. `render()` no longer throws on `change: 'constructor'` or `'__proto__'` (no badge is drawn). The details panel names a port or parameter end as drawn ("requests of checkout", "capacity of usable"), a port's own lines are found, and a row whose end is drawn only in another typed view opens that view with the end selected; when no view draws an end, the status line says so. A selected part's rows now name the far port ("quotes of pricing"), not the far part.
- **UML, C4 and mindmap, round 13 (#367).** **The PDF Lines table lists self-lines on typed views** (class, object,
  package, component, a state machine's self-transitions); map views still leave them out. State machine: dropping an
  initial or history pseudostate into a one-region state goes through the same guard as other moves, so a second one is
  refused with `{ error }`, and the Owner field no longer offers an owner that already holds one. Timing: F2 or N splits a
  name only at a lone colon, so `Shop::Worker` stays one name (`http://api` still splits). C4 deployment: **T on an
  instance always sets its label to the new container's name** (before, a label of its own was kept). Information flow:
  naming a flow whose text equals the drawn list sets only the label. Mindmap: **N, Delete, Shift + Delete and the
  outline's Show leave the other first-level branches on the sides drawn**; Delete and Show run one layout, so "Delete
  half" of the 20,000-topic chain takes about 160 ms (linear).
- **ER, flowchart, DFD, information flow and Mermaid readers, round 13 (#368).** **Lines written inline in a view's
  `edges` are now checked by `validate()`** as model lines are (ER relationship ends, information flow conveyed and ends,
  every DFD flow rule, flowchart flow ends); a new `typedLines()` in src/typed/layout.js lists them with their paths. **A
  DFD process fed only by inline flows no longer gets `dfd-process-io`.** The Mermaid state reader reads `Moving:::cls` as
  a state with its class reported `skipped` (it made a note "::cls"), and `Crash:::cls : it broke` gives Crash that
  description. The Mermaid ER writer writes `%% references:` only to a column it writes, and names the others under `%%
  not written:`; **the reader drops a `%% references:` naming no column it read** and reports it `skipped`. The README's
  4a model table names AWS; the gallery's C4 card says five views.
- **CLI and MCP, round 13 (#365, #366).** **The `--out` guard compares files, not only paths**: an `--out` that exists and
  is the same file as an input (a name in other case on a case-insensitive disk, or a hard link) is refused.
  **`timelapse` walks the first-parent line** (`git log --first-parent -m`): a merge is one step and its last frame is
  HEAD's model; a side branch's own commits no longer show up. MCP `highlight` refuses a Ref whose `view` names no view
  with `show_view`'s message ("no view 'nope'; the views: ..."); before, the page threw and a later `clear` failed. `check
  --ignore labelNoRoom` also drops "step N has no room on edge". The README file map lists `pack`, `export` and
  `umlimator_packs.py`.
- **Core and CLI, round 14 (#376).** **A raw `hide` of a lifeline also drops it from that view's interaction uses'
  `props.covers`**, so the model still validates (other props naming model elements are kept; the canvas already did
  this). `diff()` says a new id-less line once in a view that dropped its edges list ("adds D, from C", not "from C and
  C"). **`validate()` warns of a card `source` that is not text**: `nodes[i].source: source is a path or a list of paths:
  what is not text is ignored`. **A map card with no label is named by its id** in its accessible name and its lines'
  ("Line from a to C"), as `nameOf()` and the live region already did; no geometry changes. The CLI's `--out` guard also
  covers `trace`'s TRACE and `drift`'s `--match` (trace's `--out` may still be MODEL.json). `diff`, `drift`, `trace`,
  `export` and the MCP `diff` tool refuse a JSON object with no `views` in one line ("FILE: no views: not a map model").
  `diff --base --out FILE` on an existing file says "diff --base: --out X is a file: name a folder for the pages and
  summary.md" in one line. `otlpSpans()` skips what is not a list or an object, so `trace` on malformed OTLP ends in its
  usual one line.
- **UML lines and objects, round 14 (#374).** **F2 on a line in class, package, profile, component and deployment views
  edits its label alone**: the drawn keyword and «stereotypes» are taken off (before, «trace» was stored in the label and
  drawn twice); these types gain an `edits.rename` hook. A line of a kind the view does not draw is **a plain solid arrow
  named "Line"** in component and object views (it was a «dependency», or an undirected Link). **The object view draws
  only a `uml.InstanceSpecification` (or an element with no `uml.` type) as an instance**; another `uml.*` element is a
  classifier with its kind word ("Component Shop API"). F2 on an anonymous instance opens its name alone, not ":
  Customer". The sequence and communication conformance notes say self-lines are in the PDF Lines table.
- **C4, ER, information flow, mindmap, Mermaid writers and docs, round 14 (#375).** **`apply()` carries a renamed label to
  the elements that name it**: when `set label` renames an element, each element whose type marks the prop pointing to it
  `named` and had the same label gets the new one. A registry `refs` value may now hold several words (`'cascade
  named'`; delete cascades still match `cascade`); C4 deployment's `props.container` is `'cascade named'`. So **renaming a
  C4 container by the Name field or by F2 on any view renames its instances**; an instance with a label of its own keeps
  it, and F2 on a container is the canvas's default again (its hook returns null). ER: an identifying relationship written
  inline in a view makes the child dependent. Information flow: inline flows count in "conveyed by", rows, text, rename
  and remove; a view with no list draws only the model's flows. Mindmap: the outline's Show sets no side on topics it
  puts below the first level. **The Mermaid class, sequence and state writers name what they drop** (`%% not written:
  ID: ext`, `property P`). The Google Cloud and Azure notes drop the icons-only `update()` limit lifted in 0.28.0; AWS is
  in docs/editing.md, examples/README.md and the schema's `iconPacks` description.
- **Layout, state machine, communication and parametric, round 14 (#377).** **Laid out right with `repair: false`, two
  lines between the same two cards that cross swap ports** (both ends, then one), kept only when the issues drop; lines
  ending on a port are left alone. Pictures that change, crossings only: `examples/bookshop-data-flow.json` level 1, 2 to
  1, and the take-payment level 2, 1 to 0; `examples/bookshop-order-to-shipment.json`, 5 to 4; stress fixtures: ER all 18
  to 17, information flow edge-cases 2 to 1, C4 all 136 to 133, use case all loses its "share a line" pair, composite all
  21 to 19 (5 to 4 down). The swap tries cost the C4 stress fixture's full layout about 15% (512 to 591 ms in CI). State
  machine: **a drop on an orthogonal state's own box, N on it, and the Owner field are refused** with "...: put it in one
  of its regions" (`stGuard` refuses a new `region-mixed` warning too); an imported region-mixed state draws its direct
  substate beside its regions. **Adding a Region to a state with direct substates moves them into a first, unnamed
  region** and adds the new one beside it. Communication: `check()` reports a connector routed through another
  connector's message rows, and the router's warning names the stack ("the messages on b–a"); the route is unchanged.
  Parametric: `port`, `proxy port` and `full port` member rows are refused on a parametric view.
- **Documentation site (#370 to #373).** The site at zintaen.github.io/umlimator/ is built with VitePress 1.6.4 from
  `docs/` (a private `docs/package.json`; the npm package still has no dependencies): a landing page with a live map,
  the guide (docs/guide/, 12 pages), the API reference (docs/api/), the 28 diagram types with a still of each, the
  conformance notes and a changelog page that includes this file unchanged. The examples gallery keeps its URLs under
  `/examples/`. The docs build runs on every pull request. **The README is cut to about 120 lines** and points to the
  guide; `CHANGELOG.md` points to this file. **Cloud icons on the Pages site only** (milestone 4a decision 6, revised
  16 Nov 2026): the site's build fetches the Google Cloud, Azure and AWS packs with their terms accepted, so its cloud
  examples show the vendors' icons; AWS agreed on 16 Nov 2026 to its icons on this project's own Pages site
  (docs/diagrams/conformance/aws.md). The repository, the npm package, releases and committed files stay icon-free.
- **Google Cloud icons (#378).** A product the pinned pack has no icon of draws its category's icon under its own name:
  `icons/packs.json`'s gcp row gains a `category` map (Cloud CDN, Cloud DNS and Cloud Load Balancing to Networking,
  Pub/Sub to Integration Services), `umlimator_packs.py`'s `icon()` falls back to it, and `check()` does not report such
  an id as missing.
- **Known gaps.** Still open from 0.39.0 (checked on main with a small script: the JavaScript Mermaid readers still
  decode `#55296;` to a lone surrogate, a typed view still gets no "listed twice" warning for `view.edges`, 21 of the 30
  typed examples still do not set `"$schema"`): a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core. A composite structure or SysML internal block view's PDF Lines rows name a part by its id, not its drawn name.
  The requirement layout leaves out a link into a box nested more than 64 deep from its ranking. Typed hooks that answer
  Alt+arrows themselves were not checked on views laid out down. `reach()` from a model id that the view draws under
  another id returns only that element. A negative step duration plays 500 ms while `validate()`'s warning says 4000 ms.
  Mermaid C4 macro arguments keep entity codes as written. `describe()` of an inline interaction does not say it opens a
  view. Room for a label in a turned view is still mostly along the line. The map flowchart and Structurizr DSL readers
  turn a U+2028 inside a label into a space. The unfolded call behaviour box is a plain container frame. A page rendered
  before 0.33.0 with a numeric view id, before 0.36.0 with a numeric card id, or before 0.37.0 with a view with no id,
  still ends in a traceback in `stills`. Three or more delegations from one port into a grid of parts may still cross.
  Other files in src/bpmn may still key plain objects by id. The typed Mermaid reader's quote join skips `%%` comment
  lines but not the body of a multi-line `%%{ }%%` directive. The PDF tables read an open package's qualified name off
  its drawn title. No example reaches the C4 views lift branch or src/sysml/sysml.js's frame branch; only `select()` has
  a browser test of its own among Find and the panel links. The double-click tests send synthetic events. The SysML block
  definition view has no own list of line kinds. The SysML tables `RQ_REL` and `BD_ORDER` are still plain objects. When
  two operands of one `alt` each create a lifeline, the second create arrow lands on the stem below the single head.
  `printDoc`'s rules section and `rules()` still count a typed view's hand-written containers as boxes a rule can name.
  An MCP page tool on a model that has never rendered still says it cannot read the model. `validate()` still accepts a
  positional name (docs/diagrams/risks.md F9). `diff()` numbers id-less lines among id-less lines only, where Ref names
  count every line with the same ends. The profile, package and SysML block definition conformance notes point to the
  class or package note for the shared rules. No typed card draws a new, changed or removed badge, so a restored part,
  port, fragment or region draws as present (only its lines show the removal); if a restored owner's members moved
  elsewhere in `after`, they could come back twice. Component `validate()` messages still name ends by the bare label. A
  C4 deployment instance's Name field still writes its label, which shows nowhere. #362's tests were not run against the
  unfixed code. Closed (checked on main): `validate()` now warns of a non-string `source` (#376), and `diff()`'s summary
  of a removed region reads "removes Payment from Fulfilling" (#369). #367's gap of a container renamed by the Name field
  is closed by #375. New from rounds 13 and 14: a removed operand under a fragment is still summarised through the
  type's order, and a member of a node that lives only in one view is not restored. The details panel cuts a part's
  label at " : " ("checkout"). The panel lays out a typed view once, the first time an end is not in the current view.
  Timing names still split at `:/` (`http://api`). Mindmap "Delete half" of the 20,000-topic chain is about 160 ms
  against a printed 100 ms target (the assertion is 1 s). The guide's 4a model table says a group holds "a group or a
  service", narrower than the code (resources, products and users can sit in a group). The PDF cover's line count still
  leaves out a typed view's self-lines while its Lines table has them (sequence: "9 lines", 10 rows). A component view
  draws a `uml.Actor` or `uml.Node` in the component shape while naming it by kind. The SysML block definition view has
  no line rename hook, so F2 there may store the keyword in the label. A communication connector can still route
  through another connector's message stack (`check()` reports it; docs/diagrams/conformance/uml-communication.md). #377's port
  swaps cost the C4 stress layout about 15%, and one noisy CI run took 1,076 ms against its 1 s budget; the swap tries
  are to be capped if it flakes. The new `named` rule in `apply()` has had no audit yet.
- **Size:** `lib/umlimator.js`, what a map host loads, is 201.4 kB (201,358 B) with `gzip -9`, 22.07% over 0.16.0's
  164,954 B, up 2,535 B from 0.39.0: #369 1,522 B (line names per list, the `diff()` restores, the panel's port ends),
  #377 595 B (the port swaps), #376 242 B, #375 154 B (the label follow in `apply()`) and #367 22 B.
  `lib/umlimator-all.js` is 625.8 kB (625,820 B), up 6,354 B: #369 1,491 B, #377 1,101 B, #367 982 B, #368 874 B, #375
  867 B, #374 793 B and #376 246 B; the npm package is 884.2 kB (`npm pack --dry-run`, down from 894.1 kB with the
  shorter README). There is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported
  each release and a budget is set at 1.0.0.

## 0.41.0: fixes from the fifteenth audit

The fifteenth audit, the first to cover the documentation site, confirmed 40 findings. All are fixed in this release, in
five pull requests (#380 to #384), each with a test; findings 5 and 27, 18, 26 and 31, 30 and 35, and 32 and 36 are one
defect each, so there are 35 fixes. **#384 fixes a regression of 0.40.0's request/reply port swap (#377):** it ran on
maps with `repair: false`, which turned their port repair off, and it could leave some C4 views with more crossings. Maps
draw as in 0.39.0 again; `bench/expected.json` and every pinned example's crossing count are unchanged. What changes for
callers:

- **Layout, round 15 (#384).** **The request/reply swap runs on typed views only**: a map's `repair: false` means no
  repair again, as docs/maps/model.md says, so a map that set it draws as in 0.39.0. **A typed view of up to 30 cards
  that kept a swap is judged on the finished picture**: it is laid out once more without the swap, after the type's own
  finishing steps (BPMN's, for one), and that picture is kept when `routeAudit` finds fewer issues. A pinned C4 container
  view (five containers, three call/reply pairs) is back to 9 issues (0.40.0 drew 13); of 240 random C4 container views,
  none is worse than before #377 and 78 are better. **A view of more than 30 cards keeps the swap as the pass judged
  it**, so the C4 stress view takes no extra layout and a large C4 view can still come out worse than without the swap.
- **diff() and the PDF, round 15 (#384).** **`diff()` reports a change that moves nothing but the layout** and lists the
  view: a kept card's pin ("moves Payment provider in the view What runs"), any other view field ("changes the view V
  (caption, lanes)"; every key but `id`, `title`, `nodeIds`, `nodes`, `edges`, `containers`, `nodeOverrides`, `layout`
  and `fragments`, so `render`, `direction` and `repair` too), a box's tone or badges ("changes the box B (tone) in the
  view V") and added, removed or changed rules ("adds the rule T", touching the views where `rules()` finds something
  different). The bike-share diff fixture moves Payment provider's pin, so its summary now says so. **The PDF cover's line
  count matches the Lines tables**: it counts the union of the line ids each view's table lists (`tablesOf()`'s new
  `lineIds`), so a typed view's self-lines count (checkout-sequence 10 lines, was 9; order-service-structure 8, was 0).
- **Page and API surface, round 15 (#380).** **A card with no label is named by its id** in its tooltip (`<title>`) and
  in the tooltips of its lines (`alpha → Charlie`), as its accessible name already was, and on the standalone page in
  Find's result and in "Did you mean". **`<umlimator-map>` with no `theme` follows VitePress's light/dark switch**:
  inside VitePress's default theme (`.VPContent`), a map is light whenever `<html>` is not `.dark`, whatever the system
  prefers (the rule is in `:where()`, so a host's own `--um-*` still win); elsewhere the system setting decides, as
  before. **The standalone page's title is its `<h1>`** (`h1.mbrand`, the bar looks the same). **`setView()` is declared
  `Promise<boolean>`** in lib/umlimator.d.ts, what it has resolved since 0.14.0, so `if (await map.setView(...))`
  compiles under `tsc --strict`; code that awaited the old type still compiles. The `Element` doc comment names the four
  `sysml.*` types. `otlpSpans()` skips `attributes` that are not a list (the span reads `service: null`, and `trace` no
  longer ends in a Node stack trace) and reads a `name` that is not text as null.
- **UML, round 15 (#382).** **F2 stores only the label**: on a communication message row it strips the drawn number and
  «create»/«destroy»; on a use case include or extend it strips the keyword and stereotypes, reads a trailing
  `[condition]` back into `props.condition` and refuses a changed `(points)` with `{ error }`; on a line a class,
  package, profile, component, deployment or object view owns in its own `edges`, it strips the keyword too.
  `uml.communication` and `uml.use-case` gain an `edits.rename` hook. **The component view draws only a `uml.Component`
  (or an element with no type) as a component**; another kind is a classifier with its keyword (`«node»`, `«actor»`), and
  the deployment view gives an interface or actor its keyword. Composite structure and component views draw the
  stereotypes the panel offers: on a connector (before its label, and said), a part (over its name; the box grows 14 px
  for each after the first), a port and a ball; component and deployment ports, interfaces and artifacts say them
  ("(a, b)"). A part or collaboration use with no name and no type is drawn and said by its id. State machine: a drag
  that moves a direct substate of an imported region-mixed state into one of its regions is allowed (only a move that
  gives a state a direct vertex is refused). The timing note says where a duration between two lanes sits.
- **Other types, round 15 (#381).** **C4: F2 on a relationship written inline in a view no longer adds its technology to
  the label a second time.** **ER: a row's `NOT NULL` leaves the column not nullable** (it made it nullable and put NOT
  in its type); `NOT NULL` with `NULL` is refused ("NULL is written twice"); the PDF text names an inline relationship.
  Flowchart: the PDF text and the connect hook count inline flows (an inline decision exit is yes, the new one no). SysML:
  **F2 on a requirement relationship or a block definition line stores only the label** (block definition gains an
  `edits.rename` hook), and F2 on an internal block connector with an item flow sets `props.itemFlow.item`, the text
  drawn (empty text is refused). **The row `port : Integer` is a value property named port** in parametric, composite
  structure and internal block views (a port row needs a name after the keyword); a parametric `param : Real` with no
  name is refused. Mindmap: Show on a lone hidden topic runs the type's Show ("Showed X"). BPMN: a flow node added with a
  pool that has lanes goes into the pool's first lane that holds no other lane.
- **Readers, MCP and documentation site, round 15 (#383).** **The Mermaid class reader closes a block at any `}`**, as
  Mermaid's lexer does: `+quack() }`, `class Cage }` and `namespace Zoo { class Cage }` no longer swallow the rest of the
  file. MCP: a null (or anything not a string) in a view's `nodeIds` or `stepIds` is a tool error saying where
  ("views[0].nodeIds[1] is not a string"; it was "Internal error"), and `show_view`, `highlight` and `tour` with view
  `""` answer "no view ''" (it cleared the tour and story). Site: a same-page link written with GitHub's heading slug now
  reaches its heading on every page (the changelog's links were dead); the import and export guide says `export` writes
  BPMN XML only and the seven Mermaid writers are internal to the module; docs/api/typed-diagrams.md states each type's
  default direction as the schema does (down for a flowchart, profile, SysML block definition or requirement view, a
  sequence view always); docs/diagrams/conformance/gcp.md and examples/README.md say what the site and a copy draw for cloud icons.
- **Corrections to earlier sections.** 0.14.0 says of `setView()`: "The declared type stays `Promise<void> | void`".
  From 0.41.0 it is declared `Promise<boolean>` (#380). 0.26.0's known gaps say `Cloud-DNS`, `Cloud-Load-Balancing`,
  `Cloud-CDN` and `Pub-Sub` draw a glyph; since 0.40.0 (#378) they draw their category's icon.
- **Known gaps.** Still open from 0.40.0 (checked on main with a small script: the JavaScript Mermaid readers still
  decode `#55296;` to a lone surrogate, a typed view still gets no "listed twice" warning for `view.edges`, 21 of the 30
  typed examples still do not set `"$schema"`): a box has no Tab stop; the keyboard reaches it through the outline. A
  double-click (or Enter) on a box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the
  core. A composite structure or SysML internal block view's PDF Lines rows name a part by its id, not its drawn name.
  The requirement layout leaves out a link into a box nested more than 64 deep from its ranking. Typed hooks that answer
  Alt+arrows themselves were not checked on views laid out down. `reach()` from a model id that the view draws under
  another id returns only that element. A negative step duration plays 500 ms while `validate()`'s warning says 4000 ms.
  Mermaid C4 macro arguments keep entity codes as written. `describe()` of an inline interaction does not say it opens a
  view. Room for a label in a turned view is still mostly along the line. The map flowchart and Structurizr DSL readers
  turn a U+2028 inside a label into a space. The unfolded call behaviour box is a plain container frame. A page rendered
  before 0.33.0 with a numeric view id, before 0.36.0 with a numeric card id, or before 0.37.0 with a view with no id,
  still ends in a traceback in `stills`. Three or more delegations from one port into a grid of parts may still cross.
  Other files in src/bpmn may still key plain objects by id. The typed Mermaid reader's quote join skips `%%` comment
  lines but not the body of a multi-line `%%{ }%%` directive. The PDF tables read an open package's qualified name off
  its drawn title. No example reaches the C4 views lift branch or src/sysml/sysml.js's frame branch; only `select()` has
  a browser test of its own among Find and the panel links. The double-click tests send synthetic events. The SysML block
  definition view has no own list of line kinds. The SysML tables `RQ_REL` and `BD_ORDER` are still plain objects. When
  two operands of one `alt` each create a lifeline, the second create arrow lands on the stem below the single head.
  `printDoc`'s rules section and `rules()` still count a typed view's hand-written containers as boxes a rule can name.
  An MCP page tool on a model that has never rendered still says it cannot read the model. `validate()` still accepts a
  positional name (docs/diagrams/risks.md F9). `diff()` numbers id-less lines among id-less lines only, where Ref names
  count every line with the same ends. The profile, package and SysML block definition conformance notes point to the
  class or package note for the shared rules. No typed card draws a new, changed or removed badge, so a restored part,
  port, fragment or region draws as present (only its lines show the removal); if a restored owner's members moved
  elsewhere in `after`, they could come back twice. Component `validate()` messages still name ends by the bare label. A
  C4 deployment instance's Name field still writes its label, which shows nowhere. #362's tests were not run against the
  unfixed code. A removed operand under a fragment is still summarised through the type's order, and a member of a node
  that lives only in one view is not restored. The details panel cuts a part's label at " : " ("checkout"). The panel
  lays out a typed view once, the first time an end is not in the current view. Timing names still split at `:/`
  (`http://api`). Mindmap "Delete half" of the 20,000-topic chain is about 160 ms against a printed 100 ms target (the
  assertion is 1 s). The guide's 4a model table says a group holds "a group or a service", narrower than the code
  (resources, products and users can sit in a group). A communication connector can still route through another
  connector's message stack (`check()` reports it; docs/diagrams/conformance/uml-communication.md). The `named` rule in `apply()`
  has had no audit of its own. Closed by round 15: the PDF cover's line count (#384), a component view drawing a
  `uml.Actor` or `uml.Node` in the component shape (#382), and the SysML block definition view's missing line rename hook
  (#381). New from round 15: **a typed view of more than 30 cards keeps the request/reply swap as the layout pass judged
  it, so a large C4 view can still come out with more crossings than without it**; the next step is an in-pass judgement
  that tracks the type's finishing steps. The C4 stress timing test's 1 s CI ceiling fails on slow shared runners (the
  same code measures 512–1075 ms); reruns pass. The Mermaid class writer's timed test (1.5 s) failed under heavy local
  load, then passed. #384's PDF cover check was not run against the unfixed code. The light/dark rule for
  `<umlimator-map>` keys on VitePress's default theme (`.VPContent`): a custom VitePress theme without it, or another
  site's class-based dark mode, still follows the system setting. An intake with no label has an empty tooltip. F2 on a
  composite collaboration use still takes the drawn text (`x : C`) as its label. The object view draws a non-instance
  kind outside the ones it implies (`uml.Node`, say) as a plain classifier with no keyword. The Mermaid writers stay
  internal: `export --format mermaid` would be a new feature, for the maintainer to decide.
- **Size:** `lib/umlimator.js`, what a map host loads, is 202.4 kB (202,402 B) with `gzip -9`, 22.70% over 0.16.0's
  164,954 B, up 1,044 B from 0.40.0: #384 1,012 B (the finished-picture check, the `diff()` reports, the cover's line
  ids) and #380 32 B. `lib/umlimator-all.js` is 629.3 kB (629,256 B), up 3,436 B: #382 1,729 B, #384 1,036 B, #381
  489 B, #383 152 B and #380 30 B; the npm package is 888.7 kB (`npm pack --dry-run`). There is no core size cap until
  1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.42.0: fixes from the sixteenth audit

The sixteenth audit confirmed 29 findings. All are fixed in this release, in five pull requests (#386 to #390), each
with a test but one docs-only fix (finding 3: the code was already right); findings 1 and 21 are one defect, so there
are 28 fixes. **Two change results a host can see without editing anything: `rules()` no longer judges a typed view's
hand-written containers, and `diff()` lists a newly added view.** Pictures change only where something was not drawn
(member, flow and node stereotypes, an anonymous part's name, a lifeline's second head); `bench/expected.json` is
unchanged. What changes for callers:

- **Rules, lenses and diff(), round 16 (#388).** **`rules()` ignores a typed view's hand-written containers**, as the
  PDF's tables already did: a type that lays its view out never draws them (`validate()` warns `own-boxes`), so a rule's
  `{ container }` end and its box scope find no box there, and a box cycle through them is no longer reported. Lenses,
  `check()`'s rule lines and the PDF's Rules section ("Applies in") read the view the same way. **This changes rule
  results for a typed view with hand-written containers**; maps and typed views without them judge as before. **`diff()`
  puts a newly added view in `views`** and marks its own cards and lines added, as a removed view's are marked removed;
  its cards are in the summary ("adds X"), its lines are styled added but not listed one by one. The CLI `diff`, the
  diff Action and the MCP `diff` tool now take a still of the new view. `diff(null, model)` marks every view's own lines
  added too. **`present` is compared per card**, with the card ("changes A (present) in the view V"), no longer as a
  view field: a hide now says only "takes A out of the view V". The PDF cover counts a view's own line apart from a
  model line with the same ends (both were named `a->b#0`). The docs now say `repair` (the option and the view field)
  applies to map views; a typed view's lines are never port-repaired, as the code already did.
- **Page, round 16 (#388).** **The details panel's title is an `<h2>` and its sections `<h3>`** (they were `<h3>` and
  `<h4>`, a skip under 0.41.0's new `<h1>`); the views list's heading, Find's "Nothing called…" and an empty view's
  "Nothing here yet" are `<h2>` (were `<h4>`). They are styled by selector, so the page looks the same.
- **UML, round 16 (#390).** **A member's stereotypes are part of its row's text**: a class or SysML block member row
  draws them before the row («column» on the atlas's Order.placedAt now shows), `printMember` writes them for the PDF
  and the panel and `parseMember` reads them back. **Typing a row with no «…» clears the member's stereotypes**; a SysML
  block row reads them after the keyword (`part «x» foo: T`). **The profile view prints members without their
  stereotypes**, beside the applied ones, so nothing shows twice. Composite structure: **a part or role with no name is
  named as drawn, `: Engine [1]`**, by its ports, connectors, role bindings, `describe()`, the PDF and remove; an
  unnamed collaboration use draws `: Collab` with no leading space; **F2 on a collaboration use reads `name :
  Collaboration`** (it returned null; the drawn text no longer becomes its label), and **F2 on the subject's own port
  reads `name : Type`** (a name alone keeps the type). Component ports read `name : Type` too, through a new
  `edits.rename` hook. Use case: F2 on an extend changes nothing when the text is unchanged, finds the condition by
  matching brackets from the end (`[cart.items[0] is …]`), and **is refused with an error pointing to the properties
  panel when the drawn text does not read back** (a name ending in `[..]`). Activity and interaction overview: F2 on a
  flow whose name does not read back is refused (as a state transition's is); **flows draw «a» before `name [guard]`**
  and say it, F2 strips it; partitions, decision and merge nodes, interaction uses and inline interactions draw their
  stereotypes in their name; **initial, activity final, flow final, fork and join nodes no longer offer Stereotypes** in
  the panel. Sequence: **a lifeline created again in another `alt` operand draws a second head at that create, and the
  create ends on it**; the layout gives that row a head's room and `heads[i].again` lists each extra head's top y (only
  when there is one, so other geometry is unchanged).
- **Other types, round 16 (#387).** **C4: each line the type implies is a row of the PDF's Lines table** as drawn
  ("Shopper → Shop | Browses [+1] | Implied relationship"), one per drawn line, and the page header and cover count it
  (they said 0 lines). A deployment view's inline relationship ending on a node drawn as a box gets the `c4-box-line`
  warning (path `views[i].edges[k]`); a container or component view listing a null id with a line between null ends no
  longer overflows the stack in `layout()`, `check()` and the PDF. **ER: `x int FK NOT NULL` is read** (NOT was taken as
  the FK's target). Flowchart: a flow written inline in the view refuses a drag or Alt+arrows ("A flow follows its
  nodes: move a node instead"). BPMN: the first lane added to a pool that holds flow nodes takes them in, boundary
  events with them; data and annotations stay in the pool.
- **Readers and CLI, round 16 (#389).** Python flowchart import: an outer subgraph with no `end` draws its inner boxes
  at the top level (render refused the model); a subgraph id opened again adds to the first box, and a box inside
  itself, directly or through a cycle, is drawn at the top level with "subgraph P is inside itself: drawn at the top
  level". **The Mermaid class reader closes a class body at its first `}`** and reads the rest of the line again, so
  `namespace X { class Y { ... } }` closes X; a `}` that closes nothing is reported. **A model whose `stories`, or a
  story's `steps`, is not a list is refused** by `render`, `diff` and the MCP server with "stories is not a list",
  "stories[i] is not an object" or "stories[i].steps is not a list" (`render` accepted it, and MCP `list_views` and
  `play_story` ended in an internal error). `timelapse` fills its template in one pass, so model text holding a
  placeholder stays data.
- **Documentation site, round 16 (#386).** Inline code reads at WCAG AA on a table row's tint in both themes
  (`--vp-code-color` #0550ae light, #6cb6ff dark; links keep the accent). Every page in examples/ has an `<h1>` (ask,
  drift, live, playground and replay make the header title one; embed and timelapse have a visually hidden one). The
  standalone page guide says what a link keeps: a view, a selected card, a story step or a lens, not a selected line or
  box.
- **Known gaps.** Still open from 0.41.0 (checked on main with a small script: the JavaScript Mermaid readers still
  decode `#55296;` to a lone surrogate, a typed view still gets no "listed twice" warning for `view.edges`, 21 of the 30
  typed examples still do not set `"$schema"`, a composite or SysML internal block view's PDF Lines rows still name a
  part by its id): a box has no Tab stop; the keyboard reaches it through the outline. A double-click (or Enter) on a
  box does not open its view (the 0.24.0 gap). Deep nesting is super-linear outside the core. The requirement layout
  leaves out a link into a box nested more than 64 deep from its ranking. Typed hooks that answer Alt+arrows themselves
  were not checked on views laid out down. `reach()` from a model id that the view draws under another id returns only
  that element. A negative step duration plays 500 ms while `validate()`'s warning says 4000 ms. Mermaid C4 macro
  arguments keep entity codes as written. `describe()` of an inline interaction does not say it opens a view. Room for a
  label in a turned view is still mostly along the line. The map flowchart and Structurizr DSL readers turn a U+2028
  inside a label into a space. The unfolded call behaviour box is a plain container frame. A page rendered before 0.33.0
  with a numeric view id, before 0.36.0 with a numeric card id, or before 0.37.0 with a view with no id, still ends in a
  traceback in `stills`. Three or more delegations from one port into a grid of parts may still cross. Other files in
  src/bpmn may still key plain objects by id. The typed Mermaid reader's quote join skips `%%` comment lines but not the
  body of a multi-line `%%{ }%%` directive. The PDF tables read an open package's qualified name off its drawn title. No
  example reaches the C4 views lift branch or src/sysml/sysml.js's frame branch; only `select()` has a browser test of
  its own among Find and the panel links. The double-click tests send synthetic events. The SysML block definition view
  has no own list of line kinds. The SysML tables `RQ_REL` and `BD_ORDER` are still plain objects. An MCP page tool on a
  model that has never rendered still says it cannot read the model. `validate()` still accepts a positional name
  (docs/diagrams/risks.md F9). `diff()` numbers id-less lines among id-less lines only, where Ref names count every line
  with the same ends. The profile, package and SysML block definition conformance notes point to the class or package
  note for the shared rules. No typed card draws a new, changed or removed badge, so a restored part, port, fragment or
  region draws as present (only its lines show the removal); if a restored owner's members moved elsewhere in `after`,
  they could come back twice. Component `validate()` messages still name ends by the bare label. A C4 deployment
  instance's Name field still writes its label, which shows nowhere. #362's tests were not run against the unfixed code.
  A removed operand under a fragment is still summarised through the type's order, and a member of a node that lives
  only in one view is not restored. The details panel cuts a part's label at " : " ("checkout"). The panel lays out a
  typed view once, the first time an end is not in the current view. Timing names still split at `:/` (`http://api`).
  Mindmap "Delete half" of the 20,000-topic chain is about 160 ms against a printed 100 ms target (the assertion is 1
  s). The guide's 4a model table says a group holds "a group or a service", narrower than the code (resources, products
  and users can sit in a group). A communication connector can still route through another connector's message stack
  (`check()` reports it; docs/diagrams/conformance/uml-communication.md). The `named` rule in `apply()` has had no audit of its
  own. **A typed view of more than 30 cards keeps the request/reply swap as the layout pass judged it, so a large C4
  view can still come out with more crossings than without it.** The Mermaid class writer's timed test (1.5 s) failed
  under heavy local load, then passed. #384's PDF cover check was not run against the unfixed code. The light/dark rule
  for `<umlimator-map>` keys on VitePress's default theme (`.VPContent`): a custom VitePress theme without it, or
  another site's class-based dark mode, still follows the system setting. An intake with no label has an empty tooltip.
  The object view draws a non-instance kind outside the ones it implies (`uml.Node`, say) as a plain classifier with no
  keyword. The Mermaid writers stay internal: `export --format mermaid` would be a new feature, for the maintainer to
  decide. Closed by round 16 (each checked on main with a small script): `printDoc`'s rules section and `rules()`
  counting a typed view's hand-written containers as boxes (#388; listed since 0.37.0), the second create of a lifeline
  in another `alt` operand landing on the stem (#390), and F2 on a composite collaboration use taking the drawn `x : C`
  as its label (#390). New from round 16: **the C4 stress timing test's 1 s CI ceiling still fails on slow shared
  runners**: it failed in three of this round's CI runs (1010–1069 ms, every timing on those runners about 1.6 times
  slower), and reruns passed. A stereotype already stored on an initial, final, fork or join node is still said in its
  accessible name but not drawn, and the panel no longer offers to remove it. A SysML block row reads a stereotype only
  after its keyword (`part «x» foo: T`), not before. The UML fixes have node tests only; the tests/*.html browser pages
  were not changed. The editable embed's editor still uses `<h3>` headings with no `<h2>` above them. The time-lapse
  page still has two moderate axe findings (landmark-one-main, region). A selected line or box is not kept in the
  standalone page's link (`&edge=` and `&box=` would be a new feature). Card lookups by id elsewhere than block layout
  still key by `String(id)`, so a null id finds a card named `"null"`. The timelapse placeholder test (tests/cli.py) has
  run only in CI.
- **Size:** `lib/umlimator.js`, what a map host loads, is 202.8 kB (202,763 B) with `gzip -9`, 22.92% over 0.16.0's
  164,954 B, up 361 B from 0.41.0: #388 246 B (`handBoxes`, the added view in `diff()`, `present` per card, the cover's
  line ids, the heading levels) and #387 115 B (the C4 implied lines in the PDF, the block layout's string ids).
  `lib/umlimator-all.js` is 631.6 kB (631,564 B), up 2,308 B: #390 1,774 B, #387 242 B, #388 224 B and #389 68 B; #386
  changes no built file. The npm package is 891.4 kB (`npm pack --dry-run`). There is no core size cap until 1.0.0 (the
  maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.43.0: fixes from audits 17 to 45

Audits 17 to 45 confirmed 837 findings: 11 high, 254 medium and 572 low (audit 31 also re-checked an unused run of audit 30, so a few of its findings repeat earlier ones under new titles). All but one are fixed in this release, in 125 pull requests (#392 to #516): 121 fix lanes, one per area and round, plus #392 (the C4 stress ceiling), #403 (`dfd-balance` made a warning), #427 (the sharded CI) and #446 (the communication timed test's best of five). Each code fix has a test that fails without it, and the release-note findings (about twenty, mostly the 0.42.0 MCP still claim and the import table) are fixed by this section. Audit 38 finding 3 is partly fixed: one of its four state machines (a line through a card, laid out down) is still open (Known gaps). Pictures change only where the notes below name them; `bench/expected.json` changes for two unfolded map views (#503). **The changes a host sees without editing anything:** the diff page, its stills and the diff Action mark changes on typed views (#508, #516); `diff()` also says changes to stories, lenses, the map title and other top-level fields (#460) and says a card reorder that moves the picture (#502); `validate()` reports more on hand-written models (a line id that is also a card id, a label or title that is not text, a story step on a line the view does not draw) and reports `dfd-balance` as a warning (#403); a map line weight given as a string draws at weight 1 (#452); `apply()` refuses a few edits it used to take (hiding a view's subject or an element that holds it, an add or reparent under a node only one view holds); and `render` leaves out intake logos outside the model's folder, avatars that are not data URIs, example images given as addresses and a model's own `icons` table. What changes for callers:

- **Core and layout.** **Every type draws, edits and validates a view's own nodes (`view.nodes`)**: the core wraps each type's hooks once (`withOwnNodes`, src/core/registry.js), where several types used to drop them (#425; audits 23 and 24). Deleting a view-own partition, state or owner no longer deletes the model nodes inside it (audit 23 finding 0 and audit 25 finding 7, both high; #425, #432). **`apply()` refuses `hide` of a view's subject or of an element that holds the subject as a member**, with `hide: "X" is the subject of view "V": change the view's subject, or delete it from the model (no command deletes a view)` (#393), refuses an add or reparent under a node that one view alone holds (#428), and keeps a function in a command value by reference instead of throwing (#440). `hide` works out the whole set of ids before it filters a view's own lines, so the result no longer depends on list order (#483). `layout()` no longer throws on a sequence view whose id is a lifeline's id (audit 24 finding 0, high; #428). A name the author broke into lines is drawn one line per line, and its box grows to hold it (#423, #429). **In a pinned map view a box no longer grows over a card it does not hold** (audit 41 finding 0, high; #499), and `check()` has a new issue for that case, `family "X" lies over "Y", which it does not hold`; an unpinned card in a pinned view takes a clean slot near its box whose lines run forward (#503, #505). Text that exactly fits its room is no longer cut with an ellipsis (#467), a long card text no longer freezes `render()` (#436), and very deep member nesting no longer overflows the stack (#478). Undo and redo of a card drag on a typed view restore the picture (audit 33 finding 0, high; #468). A process view (`mainSteps` or `render: 'process'`) with no boxes has a 38 px default column gap, as `lib/umlimator.d.ts` now says (#483, #487). **A map line whose `weight` is a string such as "2" now draws at weight 1**, as the "drawn as 1" warning of `validate()` always said (#452). In `lib/umlimator.d.ts` a Geometry edge's `weight`, `wk` and `lbl` are optional, since typed views leave them out (#452). Internally (src/core/registry.js; not public API: `lib/umlimator.d.ts` declares none of them and no export registers a type), the type registry has four new optional hooks: `drawn(model, view)` gives the model line ids a view draws (DFD and the C4 views; #487), `touches(model, view)` the ids outside the view whose change changes its picture (profile and ER; #495), `drawnKeys(model, view)` keys for the lines a view draws, implied ones included (C4 static and deployment; #497), and `edits.field(model, view, id, path, value)` lets a type refuse a properties-panel field edit (#484); `withOwnNodes` also wraps `drawn` and `drawnKeys` (#502). `check()` says "runs back inside its own box" for typed views (#444), "not drawn" for a BPMN line it keeps but does not draw (#443), and `label "L" has no room on edge E: only its step N shows` for a C4 dynamic step label cut to its number (#426).
- **diff(), the diff page and stills.** **The diff page, its stills and the diff Action draw change marks on typed views** (audit 44 finding 18, high; #508): a NEW, CHANGED or PLANNED tab, a removed shape faded, dashed and struck through, and the change word in its accessible name and keyboard key. #516 extends this to a sequence or timing view's own messages and fragments (audit 45 finding 10, high), typed boxes and family frames (packages, nodes, composite states, C4 boundaries, cloud groups), C4 implied lines, and a map line's key and title. #516 also draws a map line from its `change` alone, with no `style` and whatever its wire kind: added (or new) green and flowing, removed rose and dashed, so a hand-written map line that carries `change` draws so outside a diff too (0.42.0 drew a wired line in its kind's colour). The 0.43.0 `lib/umlimator.d.ts` and schema still describe a map line's `change` as `added`, `removed` or `changed`, drawn only with the matching `style`; they say how it draws, and list `new` and `modified`, only after this release (audit 46 findings 6 and 24, audit 47 finding 21). **`diff()` reports stories, lenses (by id), the map title and any other top-level field** ("changes the model (root, meta)"; #460). **A map card reorder is said when it moves the picture**: "moves X after Y", "moves X to the start", or "reorders N cards" when more than three moved (#502); a view whose order changes nothing drawn reads nothing (#505), and a fully pinned view with lines is laid out in both orders to judge it (#508). The summary says "to and from X" for a card at both ends of a change (#440). `diff().views` lists a typed view whose picture changes through an element it does not list (profile stereotypes, IDEF1X relationships, C4 implied lines, icons) and leaves out one that does not draw the change (#495, #497, #502, #505). The step-order check no longer builds a quadratic table (audit 21 finding 0; #416), and `diff()` no longer throws on a cycle, a BigInt or a host function in a model (#440, #445). `diff --base` and the diff Action: a moved or renamed model reads as moved (#430), a model in a dot folder keeps its stills (page stems start with `%2E`, and `action.yml` uploads hidden files; #435), a non-JSON file is not reported as a broken model (#479), a model whose disk spelling differs in case reads as modified (#497, #502), the diff sketch keeps self-loops (#476), and a file that nests too deep says "nests too deep to read" instead of a traceback (#413). Correction to the 0.42.0 note (audit 17 finding 22, audit 20 finding 29): the CLI `diff` and the diff Action take a still of a newly added view; the MCP `diff` tool takes no stills and lists the view in `views`.
- **validate() and rules.** **`validate()` errors when a line id is also a card id** and warns on a label that is not text (#452); it leaves out a Symbol or a value whose `toString` or `toJSON` throws, as "a value no text is read from" (#460); it warns on map, story, lens, rule and lane titles that are not text (#473), and on any panel text field a typed view lists that is not text, with "not drawn" for fields the picture never draws (#507, #512). **A story step that names a line the view does not draw is an error** ("the view does not draw it"; #487); a communication view's message rows are selectable by steps again (#495). A line id written `a->b` with no `#n` that names no line gets "names no line" (#499). A change mark that is not one the renderer draws is warned (#516). **`dfd-balance` is a warning, not an error** (the maintainer's decision of 16 Nov 2026; #403), so an unbalanced DFD level no longer fails `validate()`. New rules: `generalization-cycle` on the use case view, an error that shares the class view's wording so `validate()` says it once when both views exist (#453), `timing-kinds` (#459), and `multiplicity` on the component and object views (#515). Rule messages name kinds in lower case with an article ("a class") (#459). The state machine, use case, activity, BPMN, cloud and SysML rules now judge a view's own lines (rounds 20 to 23; #409, #415, #417, #421, #426), and an element of no type is judged as the kind the view draws it as (#447, #456). The flowchart and BPMN rules run in near-linear time: 2,000 connectors took 17 s and now take 20 ms (#472, #474).
- **Page, keyboard and accessibility.** **The standalone page's Export > Map model (JSON) writes the model as given**: no internal `_id`, parents kept (#452, #461). **Export file names keep letters in any script**: a CJK or Vietnamese title no longer gives `-.json` (#464). `map.update()` no longer drops a new model when both models hold a value that throws when read (#462), and the page draws a model whose `stories` is not a list (#420). The page pill, the About box, the views list and the search palette count drawn elements, not `nodeIds` (#483, #487). L on a line whose far end is a box is refused with "Pick a card to start the line from" (#483). An element labelled `""` is named by its id in every typed view, as on maps (#473, #477), and an untyped card is read with the kind the view draws it as (#444, #456).
- **UML structural.** An association's or link's end labels keep clear of line labels, cards and box headers (#486): **in `sales-classes` `domain` and its copy in `bookshop-atlas`, the end label "orders" moves up 4 px**. Member names that clash are refused where the rule would flag them: class, object, profile, component and composite member rows, the component palette's Port and F2, and the composite Name field (#496, #498, #501, #507). A comment link drawn towards a comment is added from the comment, and one with no comment at either end is refused, in the class, package, profile, object, component, deployment and composite views (#510, #515); a stereotype or metaclass dragged out of its profile is refused in the class, package and profile views (#510). Rules on lines reach the object, package, component and deployment views' own lines (#431), and the component, deployment and composite remove hooks see what a view holds as its own (#431).
- **UML behavioural.** **Plain Delete on a model message that a sequence or timing view lists by id hides it in that view** (Shift+Delete deletes; #459), and Delete on a lifeline with its message works in either order (#463). F2 then Enter on a multi-line label keeps its line breaks (audit 20 finding 14, high; #412). Delete on a view-own activity partition no longer deletes the actions it groups (audit 25 finding 7, high; #432). State machine layout: a composite laid out down grows to hold fanned pairs and loops, a self-loop keeps off another transition's run, and five or more transitions between a composite and one state no longer cross (#438, #444, #489, #493, #494, #511). **`order-states` `order-life` (and its copy in `bookshop-atlas`) changes several times on purpose**: the back-step notch is gone (#434), laid out down the retry loop keeps its label room (#438), the line out of its own box takes another route (#444), the payment region grows 18 px so the retry loop stays under its header (#481), and it goes from 1 crossing to 0 laid out right and from 6 to 2 laid out down (#493). Timing F2 keeps `@ t` with a line break in the label (#444), and a timing lane says two changes at one instant once (#496).
- **ER.** The router fallback no longer draws a relationship through a table it does not join (audit 21 finding 12, high; #417). A table with no type is judged as the table it is drawn as (#442). Six ER column names in the shipped examples are no longer cut, because text that exactly fits is drawn whole (#467).
- **Flowchart.** A flow to a node with no type is no longer an error and can be drawn (#501), and the legend keys the shape a node is drawn as, so an untyped node adds Process (#507). Its reading-order walk is near-linear (#472, #474).
- **DFD.** A node of no DFD kind draws a keyword (`«element»`, or its type's last part such as `«class»`) and the legend keys it "Element" (#510, #515). D on a process held in one view only is refused (#458). A level out of balance is normal partway through an edit, so with `dfd-balance` a warning, a delete or hide on one level never leaves an error (#403).
- **Information flow.** An untyped element is drawn under an `«element»` keyword (#507).
- **C4.** A Structurizr container-level dynamic view keeps its steps (#394). The `c4.landscape` and `c4.context` views refuse adding a Container or Component from the palette, said on the hint line (#426). A comment link to a box is not drawn by design and now gets the `c4-note-box` warning (#429). **`bookshop-c4` `c4-containers` (and the atlas copy) changes**: the worker to database line loses its back-step notch (#434) and its forward stair (#439). The C4 stress timed test's CI ceiling is 1.5 s (#392).
- **SysML.** **A requirement view's text edit lays out faster with the same routes**: on CI (best of seven) it took 752 to 897 ms on main, and 996 to 1,030 ms in the runs that failed its 1 s budget; it takes 453 ms now (#506). An edit that would add a `constraint-type` or `port-kind` error is refused (`bdTypeGuard`; #510, #515): the parametric palette's Constraint property needs `name : ConstraintBlock`, and a proxy port typed by nothing or by a block, or a full port typed by an interface block, is refused. Dragging a part on a composite, internal block or parametric view pins it, and the part is drawn there at once (#473, #478). Ports ranked by their far ends cut crossings: **internal-block-stress `all` goes from 16 crossings to 5 laid out right and from 32 to 20 laid out down, composite-stress `all` from 4 to 3 down** (#486), and the port spreading was redone for component, composite and internal block views (#491). `component-stress` `all` laid out down routes one line differently with the same `check()` findings (#485). **`ebike-range` `range-analysis` gets its 39 px margin back** (#434).
- **BPMN.** **Service task gear teeth draw at 2.5 and timer hands at 1.2**, as the code always asked; each mark writes `stroke-width` once, so the markup is well-formed (#513). A rework loop back to an earlier column is laid out again on another side when it crosses a line (#486), and a shared run is laid out again on up to two lines (#507). **`bookshop-order-to-shipment` (and the atlas copy) loses its back-step notch (#434) and `bp-f-to-pick` a 5 px jog (#439)**.
- **Mindmap.** Plain Delete on a view-own topic no longer deletes the model topics under it (#419). Dragging, Alt+arrows and F2 keep first-level branches on their sides (#507, #510).
- **Cloud.** A view's own line between a group and what it holds is judged (#417). **`bookshop-azure` `az-on-azure` goes from 1 crossing to 2 laid out right**, because the line now keeps out of its own subnet box (#444). A removed cloud card on the diff page keeps its vendor icon unfaded (#516).
- **Readers and writers.** Mermaid class: `-std::string name` reads as `name : std::string` (audit 42 finding 11, high; #500), a parameter default is reported and not kept (#500, #504), and a generalization that closes a cycle is skipped and reported (#509). Mermaid state: a history or second initial the reader cannot place is read as a state and reported (#509). The Mermaid writers write a view's own cards (#420), and the ER, flowchart and class writers write an untyped element with a `%% not written:` line (#504); the ER writer writes untyped columns (#465). BPMN XML: the writer writes numeric and boolean labels as text and reports what it leaves out (#513), the reader reports a pooled process's name and documentation it does not keep (#513), reads a message flow into a none start event as a message event (#509), and reads numeric character references above U+FFFF (#504). Structurizr DSL: identifiers compare ignoring case (#430), include lists are honoured (#471), include and exclude expressions are read (`element.type`, `element.tag`, `element.parent`, relationship expressions, `&&` and `||`; #476), and **an excluded relationship now keeps its ends** (#476). BPMN XML: a process in no pool whose id or name is lost is reported (#465). A Mermaid `C4Dynamic` or `C4Deployment` file is detected and reported as not read (#466). Kubernetes: Service-to-workload lines are capped (#514).
- **CLI, MCP, the diff Action and the map-repo skill.** **`render` and `check` count five more kinds**: `sharedLines`, `labelOnNode`, `overflow`, `labelsOverlap` and `lanes`, so `other` shrinks, and `check --ignore` lists them (#514); `render`'s counts match `check`'s (#512). The MCP page server needs a per-run token on `/events` and `/state` (#430), refuses a request whose `Sec-Fetch-Site` is not `same-origin` or `none`, apart from a link another site follows to the page itself (#422), and a waiting page reloads when the server serves its map again (#435). The diff summary no longer autolinks addresses (#422). An icon cache that cannot be written ends a render with one line, not a traceback (#422). `timelapse` finds a model whose file name holds a non-ASCII letter (#451). `stills` redraws a view whose picture changed through `schemaVersion` or an opened typed view (#488, #495). The CLI refuses a story, lens, rule or lane title that is not text (#473). The map-repo skill runs a pinned main commit (`0.42.0-847d167`, #424), because no tag had the logo and avatar guards; 0.43.0 ships with that pin, and it moves to v0.43.0 once the tag exists.
- **Security.** **An intake logo must be a `data:image` URI or an `.svg` file inside the model's own folder** (no `../`, no absolute path, no symlink out, at most 1 MiB); anything else is left out with one stderr line (audit 18 finding 26, high; #399). An icon's inline glyph keeps only shape elements and plain attributes (#399), an author's avatar is kept only as a `data:image` URI and only GitHub logins are fetched (#408, #495), an example's `thumb` or `full` image is kept only as a `data:image` URI or a path beside the page, and an address is left out with one stderr line (#408), `render` drops a model's own `icons` table, so the CLI's table (the manifest and fetched packs) is the only one (#408), and the playground keeps a model's inline glyphs but never loads its image URLs (#512). A model's `files`, `hunks`, `areas`, `fileNotes` and `stats` never reach a rendered, diff, drift, MCP or time-lapse page (#408, #464, #466). `diff --base` never follows a committed link out of the checkout: such a link is judged by its name only and its target is never opened (#413, #508, #514). Import reports on stderr escape C0 and C1 controls and bidi overrides (#437, #441). Structurizr tag expressions are cheap on hostile input (#476).
- **Performance.** Besides the requirement edit (#506) and the rules (#472): `diff()` lays out a reordered view only when its grid slots differ (10 views: 9,925 ms before, 19 ms after; #505), the line wrapper binary-searches its cut (#436); a fully pinned view with lines is laid out in both orders again to judge a reorder, which costs about 4.5 s for ten reversed 30-card pinned trees (#508), and the Mermaid flowchart reader is linear on a long link text (#484).
- **Docs.** Corrections to earlier text in this file. `destroy()` removes only the map's element; the rest of the container stays as it was (the Exports block and step 5 of the teardown list said "the container is left empty"), and the styles go into the shadow root of that element, not of the container (the "Styles" bullet of the reference said "on the container"). The 0.17.0 section's `hide` bullet says a line that lives only in that view goes with it; `hide` refuses an element or line that lives only in that view, with `hide: "X" lives only in view "V": delete it` (docs/api and docs/guide were corrected in #433). The 0.29.0 note's "README's Model section" is now `docs/maps/model.md`, since the README was trimmed. The 0.30.0 note names five writers for the 1 MiB `%% not written` guard; the ER and flowchart writers have it too. The 0.13.0 import table said a person becomes kind `frontend` (`external` when external); every importer writes `person` with a person icon, and `user` (drawn external, grey and dashed) for `Person_Ext` or an `External` tag (audit 41 finding 16); the table itself is corrected in place too (audit 54 finding 7). The 0.42.0 note said the MCP `diff` tool takes a still of a newly added view: it takes none (above). The 0.42.0 Known gaps no longer hold for these items: the composite and SysML internal block PDF Lines rows name a part as drawn (#465), no typed card drawing a change badge is closed (#508), a restored part, port, region or fragment that held a removed message is marked (#516), and the C4 stress ceiling is 1.5 s (#392). The time-lapse example page has a main landmark (#395); the page `umlimator.py timelapse` writes (engine/assets/timelapse.html) still has none, so that 0.42.0 gap now holds for it alone. The Milestone 2 Known gap that one delete can leave a `c4-subject`, `c4-level` or `dfd-balance` error no longer holds: the C4 subject rule is cascaded (#401) and `dfd-balance` is a warning (#403). The docs site's fenced code reaches WCAG AA in both themes, and its pages, the 404 page among them, have a main landmark (#395, #398).
- **Known gaps.** The 0.42.0 list still holds apart from the items closed above; it was not re-checked item by item. One of audit 38's fuzzed state machines (sm-1131618560, laid out down) still draws a line through a card. A removed sequence fragment that held no removed message is not restored in the model `diff()` returns, so the diff page does not draw it, though the summary says it. New from rounds 40 to 45, each checked on main with a small script or a read of the code: a composite part whose `valueType` is not text is drawn as `engine : [object Object] [1]`, and `part-type` warns without saying it is not text. The Mermaid class writer leaves out an operation with a function-typed parameter (`+on(cb : (a: int) => void)`) as `%% not written`, and the reader takes an attribute typed by a function (`-cb : (a) => void`) for an operation. A member `visibility` given as a list gets no warning. `validate()` says nothing about a DFD node whose type is a near miss such as `dfd.Entity`. In 0.43.0 the use case, state machine, interaction overview, ER, flowchart, DFD, SysML requirement and all six C4 views still add a comment link between two elements that are not comments, and only the interaction overview warns of one; since that release (#519 to #521) they refuse one and the state machine and use case views warn of one too, while `validate()` still says nothing of a hand-written one in the requirement, ER, flowchart, DFD and C4 views (audit 47 finding 16). In 0.43.0 the object, component, deployment, composite, use case and every behavioural UML view still let a stereotype or metaclass be dragged out of its profile; since that release `TYPED.owns` refuses it in every view, a type's own `moveTo` hook included after audit 47 finding 9. The class view has no `edits.field`, so the Name field on a member is not checked for a clash. The internal block view's error rewording (`SYS_IB_RESAY`) runs over the whole message, so a model name holding "class or component" is reworded too. On the diff page a typed line with its own `style` keeps that style, not the added or removed colour, and a timing view's `timeline.changes` carry no mark. `stills` redraws a map view with a typed child on any model change. Only the profile and ER types declare `touches`. The route search keeps its working arrays (up to about 15 MB) for the life of a page. The deployment stress view `all`, laid out down, keeps three shared lines, because the layout without the box growth judges better there. `check()` still counts as `other`: nodes overlap, family messages other than a title overflow, the hub callee, passes through a card, runs back inside its own box and runs along the border. docs/diagrams/conformance/uml-state-machine.md does not say that the reader now reads a misplaced history or second initial as a state. Closed since the lane notes (checked): the bookshop checkout view with a pin removed now checks clean, a link out of the checkout is judged by its name only, BPMN marks write `stroke-width` once (#513), sequence fragments that held a removed message are marked (#516), and MCP `list_views` counts drawn elements.
- **Size:** `lib/umlimator.js`, what a map host loads, is 256.7 kB (256,692 B) with `gzip -9` (786,054 B raw), 55.61% over 0.16.0's 164,954 B and up 53,942 B from 0.42.0, which this gzip measures at 202,750 B (623,097 B raw; the 0.42.0 note printed 202,763 B). `lib/umlimator-all.js` is 762.9 kB (762,897 B; 2,421,838 B raw), up 131,350 B from 631,547 B as this gzip measures it (2,024,254 B raw; the 0.42.0 note printed 631,564 B). The npm package is 1,077.3 kB (`npm pack --dry-run`; 891.4 kB at 0.42.0). There is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.44.0: fixes from audits 46 to 50

Audits 46 to 50 confirmed 103 findings: 1 high, 33 medium and 69 low. 98 are fixed in seven pull requests (#519, #520 and #521 for audit 46, then one per round: #535, #538, #540 and #543), each code fix with a test that fails without it; audit 50 finding 12 (the gallery's wording about the bike share) went with the bike share in #544. Audit 49 findings 13 to 16 (one medium, three low) are still open: the lane that fixed them was left out when #540 combined that round (Known gaps).

This release holds 24 pull requests since 0.43.0, #518 to #545 (#529 to #531 and #533 were combined into #535): besides the fixes, the map-repo pin (#518), `describe()` on map views (#525), map line weights (#536), the examples and the docs site's Examples page (#522 to #528, #532, #534, #537, #542, #544), the repository's community files (#539), the README's links (#541) and the CI gate (#545). `bench/expected.json` changes only because the bench's models changed (the bike share, then `bench/models/i59.json` in #544): no audit fix moves a hashed layout, the `order-states` and `sales-classes` examples are as 0.43.0 left them, and the stress views' crossing pins are unchanged.

The changes a host sees without editing anything: every map line is drawn at weight 1's width at rest, and a weight of 2 or 3 shows only on hover, selection and keyboard focus, with the line's `what` (or "weight 2 of 3") in its title and accessible name (#536, #543); `describe()`, `paths()` and `reach()` read a version-2 map view's own lines with their labels, steps and latency (#525); an edited line's dot is drawn off its label (#538); `validate()` warns on more (`present-values`, `stereotype-text`, `comment-link` in more views, a change mark not written in lower case) and no longer calls an interface realization from a component or a port an error (#535, #538, #540, #543); `diff()` says and marks edited, moved and re-owned members and writes a new `diffMarks` field on the typed views it lays out (#535, #540, #543); more editing gestures are refused where `validate()` would call the result an error (#521, #538, #543); the MCP `tour` tool refuses a tour the page cannot ride (#535, #538); and **the bike share and the other retired example files are gone from `examples/`** (#527, #544), so a link to `examples/bike-share.json`, `examples/bookshop.json` or `examples/bookshop.html`, or to the Bookshop atlas's `api` or `checkout` view, now breaks. What changes for callers:

- **Core and layout.** A map line's weight shows only on hover, selection and keyboard focus (#536): at rest every line has weight 1's width and arrowhead; a line of weight 2 or 3 grows to its weight's width with its heavier arrowhead when the pointer is on it or on a card at either end, when it or a card at either end is selected, and when its line key has keyboard focus, and its title and accessible name add its `what` (all the `what`s of the edges it stands for, joined by " / "), else "weight 2 of 3" or "weight 3 of 3". Weight 1 lines say nothing new, and mindmap branches and typed lines are unchanged. `describe()`, `paths()` and `reach()` read a version-2 map view's own lines with their labels, steps and latency (#525): a view with no `diagram`, or `diagram: "map"`, is walked as a map, where it was walked by model line, so `describe()` now says a line's label and step. At rest the flow line is trimmed for the weight 1 arrowhead, and a weighted line draws a second flow line (`flowline fl-hv`) for its heavy arrowhead that shows in the same states (#543, audit 50 finding 2). An edited line's dot is drawn on the longest stretch of the line clear of its label: in a sweep of the examples with every other line also marked edited, 46 of 84 dots sat under a label before and none do now (audit 48 finding 21; #538). `svgOf()` draws a map view whose container names itself, or another in a cycle, as its parent, where it overflowed the stack (#538). A map line or card `change` that is not text draws unmarked, as `validate()` and the typed views already read it (#519). `lib/umlimator.d.ts` and the schema now describe a map line's `change` as main draws it (`added`, `new`, `removed`, `changed`, `modified`, drawn with no `style` needed) and say it is written in lower case (#519, #535; audit 46 findings 6 and 24, audit 47 finding 4).
- **diff(), the diff page and stills.** `diff()` says and marks edited members: a member in both models whose own fields or owner changed is marked changed and said by name ("renames charge to inlet in Battery"), and a retyped part's lost ports are drawn removed beside its new ones (audit 47 finding 1; #535, #543). A member moved to another owner is said once ("moves X out of A into B", no more "changes A (members)") and drawn back removed at its old place, under a fresh id `<id>~moved` (#540). An added or removed part, port or lane is marked, and a removed one is drawn back (#520). A new public field, **`view.diffMarks`** (`marks` by shape id and `gone` lines; in `lib/umlimator.d.ts` and the schema), carries what a typed view draws that is no element or line of its own: the old C4 implied line or SysML containment line of a re-owned element is drawn back removed (audit 47 findings 0 and 14; #535), a deleted container's implied line comes back removed (#543), and a shape drawn from what it reads (a C4 instance or implied line, an IDEF1X entity, an information flow, a class or package name qualified through an owner, an object, a parametric constraint property, a port typed by an interface block) is marked changed only when its drawing changes (#520, #535, #538, #540, #543). A C4 implied line that is new in the picture is marked added; one drawn before stays changed (audit 50 finding 0; #543). Relationships `diff()` brings back removed no longer join an implied line (#538). On a communication view the message rows carry their marks (audit 46 finding 9, high; #520) and number the live messages as the new model does (#538). An interaction overview's inline interaction marks its messages, lifelines and fragments, and is marked changed when its sequence view changes through its own lines (#520, #538, #540). An added or removed dashed typed line keeps its dash, and a solid one stays solid, so a removed call message draws solid rose (#520, #535). Timing constraints are marked and a removed one is drawn back (#540); a deleted BPMN group is drawn removed (#540); an IDEF1X entity whose only identifying relationship was removed is drawn independent (#535); a removed mindmap topic's branch is no longer drawn solid in its branch colour (#520). `diff().views` leaves out a view listed only through what it refers to or reads when its picture is the same before and after (#535), and lists again a C4 container view whose cards move when a context relationship to its subject is added or removed (audit 48 finding 0, a round 47 regression; #538), and lists a view whose card opens a retitled view when a map card shares that view's id (audit 48 finding 3; #538). The summary names a BPMN lane by its label (#535) and a removed extend's extension point by its name (#538).
- **validate() and rules.** New warnings: `present-values`, a port side or interface `present` value the view ignores (component and composite views, #535; internal block and parametric views, #538); `stereotype-text`, a stereotype stored with its marks such as `«entity»`, on any element (#535; the Stereotypes field now strips one pair); `comment-link` on the state machine and use case views (#521), judged on the lines they draw (#535), and on the activity (#535) and information flow views (#543); and "write it in lower case" for a change mark in another letter case, which still draws (#535). `realization-target` accepts a class, component, port, enumeration or data type realizing an interface (#540), so a component or port that realizes one is no longer an error. The warning on a sequence fragment operator that is not text now says so, and how it is drawn (#521). Validating a C4 deployment model is no longer quadratic (#519).
- **Page, keyboard and accessibility.** A line's weight is explained in its title and accessible name, and its key's keyboard focus shows it (#536). A communication row's "Message N of M" counts live rows only (#538). The diff page's change words follow the marks above.
- **UML structural.** A stereotype or metaclass dragged out of its profile is refused in every view, a type's own `moveTo` hook included (#521, #535). An interface realization from a component or a port is drawn and checked as the component view always did (#540). Composite structure: the ports on an added part are marked, the ports on a removed part are drawn removed (#520), and F2 or a member row on a part, port, role or collaboration use is linear in its spaces (64,000 spaces: 17 s before, under 250 ms now; #543).
- **UML behavioural.** A comment link between two elements that are not comments is refused in the use case, state machine and interaction overview views (#521). The state machine and interaction overview connect refuse a line that `validate()` calls an error (into an initial node, out of a final state, onto a region; #538), and the use case connect refuses an include, extend or generalization from an actor and an association between two use cases (#543); a new state machine or overview line's id is `transition1` or `<from>-<to>`, where the canvas used to pick it (#538); a new unguarded line out of an interaction overview decision that has one exit without `else` gets the guard `else` (#538). Timing F2 is linear in its spaces, and a change's or message's text over 4,096 characters is refused (#543). A removed message in another letter case is not numbered (#543).
- **ER.** A comment link between two tables is refused (#521). On the diff page an IDEF1X entity is marked when a relationship it reads changes how it draws, and only then (#520, #535).
- **Flowchart.** A comment link between two nodes that are not comments is refused (#521).
- **DFD.** A comment link between two elements that are not comments is refused (#521).
- **Information flow.** `comment-link` warns on a link with no comment at either end (#543). A flow conveying a renamed item is marked on the diff page (#520).
- **C4.** All six C4 views refuse a comment link between two elements that are not comments, and `c4.dynamic` adds one drawn towards a comment from the comment (#521). The diff page marks a container instance drawn from a changed container (#520) and draws implied lines as the diff bullet says. An implied line standing for planned relationships is no longer drawn and keyed as changed (#520).
- **SysML.** The block definition view adds a comment link drawn from a block to a comment from the comment (#538). The internal block and parametric views warn `present-values` (#538). On the diff page an internal block port whose interface block's flow directions flip is marked changed (#540), and a retyped part's lost port is drawn removed (#543).
- **BPMN.** Delete on a lane says how many flow nodes are now in no lane of its pool ("N flow nodes now in no lane of P: drag them into a lane"; #538), counting only those the view shows (#543). Lanes added to or removed from a pool are marked on the diff page (#520).
- **Mindmap.** A removed topic's branch on the diff page is no longer drawn solid (#520), and the Mermaid mindmap reader reads a shape's text over line breaks as Mermaid does (#540).
- **Cloud.** Shift+Delete on a group counts what it held as `apply()` deletes it: a view's own group is counted and a model service lifted out is not (#521, #535); the deployment and state machine remove hooks follow the same rule (#535).
- **Readers and writers.** Every Mermaid reader reads a character SVG or XML cannot hold, written raw or as an entity code in the diagram's text, as U+FFFD and says so, whether written as an entity code (#535) or raw (C0 controls other than tab, line feed and carriage return, U+FFFE, U+FFFF, lone surrogates; raw U+000B and U+000C included), and so do the Structurizr, DBML and BPMN XML readers (#538); `umlimator.py import` does the same for entity codes (#538) and raw characters (#540), and keeps compose and Kubernetes keys apart that differ only in such a character (`key-2`; #543). A quoted or bracketed text runs over line breaks as Mermaid reads it in the mindmap, requirement, class, state (#540) and ER readers (#543), and the requirement writer writes a value holding a line feed in quotes across lines (#543). Mermaid class: a body missing its `}` is closed at the next `class` or `namespace` line and reported (#535, #538), the writer leaves out a member holding `{` or `}` and a default whose `~` would read back as a generic, with a `%% not written:` line (#538). Mermaid requirement: entity codes are decoded and reported, and the writer writes a `#` that would read as a code as `#35;` (#538). BPMN XML: a collaboration's and a lane set's name and documentation are reported (#521), a process in no pool reports the id it will be written with (#521), and with no diagram interchange the view takes a free id after `process` (#538).
- **CLI, MCP, the diff Action and the map-repo skill.** **The MCP `tour` tool refuses a tour of fewer than two cards** ("needs two cards or more"), **or two cards in turn with no line between them on the view** (#535), and says "no view shows all these cards" when no view does (#538); a tour with a gap, which the page used to ride skipping it, is refused as a whole. The repository no longer tracks a symlink to an absolute path, and a test guards that (#535). CI's gate job skips the duplicate full run on a push to main whose version is already tagged; a push whose version is not tagged yet runs every check, then the release (#545). The map-repo skill runs v0.43.0 since #518 (`REF, SHA = "0.43.0-c04bd48", ...`); 0.44.0 ships with that pin, and it moves to v0.44.0 in a follow-up once the tag exists, as it did after 0.43.0.
- **Security.** The readers' U+FFFD replacement (above) keeps imported text from making a still malformed XML, apart from JSON escapes in a requirement hint or a front-matter title (Known gaps). Two F2 parsers lost their quadratic regular expressions (#543). The CLA workflow runs on `pull_request_target`, pinned to a commit, and never checks out pull request code; `SECURITY.md` says how to report (#539).
- **Performance.** Validating a C4 deployment model with 1,000 nodes in four views took 2.8 s and now takes 6 ms (#519). Composite F2 on 64,000 spaces: 17 s before, under 250 ms now, and timing F2 is linear in its spaces too (#543). The Mermaid mindmap reader stays linear on an unclosed shape (80,000 lines of `a[x` or `a["x` in about 100 ms; #540). The requirement, class, state (#540) and ER (#543) readers find each string's closing line in one pass ahead. `diff()` lays out more to judge what it marks: measured on the bike share model as it was then (now `tests/fixtures/integration.json`), a C4 rename took about 120 ms instead of 30 ms, and relabelling every element about 210 ms instead of 20 ms (#535).
- **Docs and examples.** The docs site's top nav is Guide, API and Examples (#534). The Examples page is a docs page (`docs/examples.md`), with Diagrams (the map and the 28 types), Atlas and In an app; each type has its own page (`docs/gallery/<type>.md`) framing the page the site build renders from `examples/types/<type>.json`, and `examples/index.html` redirects there keeping its `#fragment` (#537). Each diagram type opens on one full example showing every element and line kind it draws, with an alternative view only for a choice that cannot share the picture, and the Atlas holds two whole businesses: the new Umlimator atlas (`examples/umlimator-atlas.json`; #534) and the Bookshop atlas, rebuilt at the same path (`examples/bookshop-atlas.json`, retired in #527 and written again in #542): its root view is now `overview`, and its `api` and `checkout` views are gone. **Retired from `examples/`** (#527, #544): `bike-share.json`, `bookshop.json` and `.html`, `clinic.dsl` and `.json`, `weather.json`, `assistant.json`, `states.json`, `ebike-atlas.json`, the `api` and `overview` stills, `stills/.stills.json` and the `ride-end` and `match` traces; tests read `tests/fixtures/integration.json` (the bike share as a moped share) and the bench `bench/models/`, and `tests/showcase.test.mjs` only smoke-checks the examples. The README's links and pictures are absolute, so the npm page this release publishes does not break when a file moves (#541). The repository has `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, issue forms and a pull request template, an individual CLA (`CLA.md`), a trademark policy (`TRADEMARKS.md`) and funding links (`.github/FUNDING.yml`, `package.json` `funding`, a README badge and the site's footer; #539). Corrections: the 0.43.0 section was corrected in place where it was wrong when written (the C4 palette, the comment link and stereotype gaps, and what the 0.43.0 d.ts and schema say; #519, #521, #535); the CLI guide's PDF heading names a view the Umlimator atlas has (#538).
- **Known gaps.** The 0.43.0 list still holds apart from the items its corrected text already gives as closed (the comment link and stereotype refusals, #519 to #521); this release closes none of its other items by name, and they were not re-checked item by item. Audit 49 findings 13 to 16, checked on main: `docs/use/cli.md`'s `stills ... --views overview,api` and `check page.html --views 'pic-*'` name views the Umlimator atlas does not have, so both stop with exit 1; a weighted line's `what` goes into its title and accessible name as raw Markdown; `lib/umlimator.d.ts` and the schema still say a weight is drawn as the line's width; `examples/README.md` and `examples/monorepo.py` still say a heavier line. Still open from the 0.43.0 list, checked again on main: `validate()` says nothing of a hand-written comment link between two elements that are not comments in the ER, flowchart, DFD, C4 and SysML requirement views; a timing view's `timeline.changes` carry no mark, a removed entry is not drawn back on the diff page, and the summary says only "(timeline)". New from rounds 46 to 50, each checked on main with a small script: a stereotype already stored with its marks draws doubled (`««entity»»`), which `stereotype-text` warns of; a card's title and accessible name keep a Markdown link in its `what` as written (closed after this release by audit 58: the drawn sub-line kept it too, with `==mark==` and `- ` bullets, and all three now read the `what` as plain words, as a weighted line's title does); the Mermaid requirement reader keeps a JSON escape such as `\u001b` in a `%% text:` hint as a raw control character, and every Mermaid reader keeps one in a double-quoted front-matter `title` as a raw control character, with no report; and in compose, a `depends_on` that names the renamed second of two keys points at the first service. The lane notes report further gaps that were not re-checked for this release: on the diff page a reply to a removed call still names the call's old number, `describe()` counts removed messages, and an inline lifeline stem is not faded for a removed lifeline (round 48); a member moved to the top level, with no new owner, is not said or drawn back, the moved ghost's id `<id>~moved` shows as a shape id, and the summary can read "moves amount out of Money into Money" (round 49); `diffMarks` `{marks:{line:'none'}}` is left on a view `diff().views` does not list (round 50); and the Mermaid writers write characters XML cannot hold raw (round 47).
- **Size:** `lib/umlimator.js`, what a map host loads, is 264.7 kB (264,692 B) with `gzip -9` (812,423 B raw), 60.46% over 0.16.0's 164,954 B and up 8,013 B from 0.43.0, which this gzip measures at 256,679 B (786,054 B raw; the 0.43.0 note printed 256,692 B). `lib/umlimator-all.js` is 787.6 kB (787,630 B; 2,496,112 B raw), up 24,750 B from 762,880 B as this gzip measures it (2,421,838 B raw; the 0.43.0 note printed 762,897 B). The npm package is 1,111.5 kB (`npm pack --dry-run`; 1,077.3 kB at 0.43.0). There is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## 0.45.0: fixes from audits 51 to 63

Audits 51 to 63 confirmed 206 findings: 4 high, 69 medium and 133 low. The 201 findings of rounds 51 to 62 are fixed, each code fix with a test that fails without it, but for one case of audit 61 finding 6 (a BPMN label, Known gaps). Audit 63 found 5 low and no high or medium; its 5 stay open (Known gaps).

Besides the release pull request (#549), the release holds two since 0.44.0: #547 moved the map-repo skill to v0.44.0, and #548 brought rounds 51 to 61 to main with the docs and examples work done between the rounds (one Docs with one sidebar, the Bookshop atlas's overview as the map's showcase, the SysML cargo e-bike); #549 adds round 62. No fix moves a map: `bench/expected.json` is unchanged, and every example view draws as before in its own direction with Node's text measure, but for the examples that were themselves rewritten (Docs and examples, below). The generated stress views' pinned counts move where the router changed (Core and layout).

The changes a host sees without editing anything: **a standalone DBML one-to-one ref (`Ref: a.id - b.a_id`) imports with its foreign key on its second end** (Readers and writers); `diff()` draws back and marks more of what a change takes out of a view, numbers only live steps, the model it returns passes `validate()` and keeps none of the model's own change marks on what the change leaves as it was; `describe()`, `paths()`, `reach()`, `critical()` and `rules()` on a diff model read the model after, and every count in a diff page's accessible names is the model after's; typed views settle their pins so that nothing is drawn over anything else, and one Alt + arrow moves a card unless the step would put a box over another or share a line; text with no spaces wraps; a character XML cannot hold is drawn as U+FFFD; several Mermaid and Structurizr readers read a few inputs differently, each said in the report; the MCP `tour` tool picks its view differently; **the docs site's pages moved** (`docs/guide/`, `docs/gallery/`, `docs/examples.md`, `docs/types.md` and `examples/index.html` are gone, with no redirects), so a link to an old `/guide/`, `/gallery/`, `/conformance/` or `/examples` page now breaks; **the map type's own example is gone** (`examples/types/map.json`), and the Bookshop atlas's `overview` is the map's showcase; **the atlases are named Bookshop and Umlimator**, their model titles too, so the page saves the Umlimator atlas as `umlimator.json` and its overview as `umlimator-overview.svg`, where it wrote `umlimator-atlas.json` and `umlimator-atlas-overview.svg`; and the SysML examples were rewritten as the bookshop's delivery cargo e-bike. What changes for callers:

- **Core and layout.** A component or part port with no line, held over another port by a line to the node's body, grows its node instead of overlapping (audits 52 and 53). A label of only spaces or line breaks names its element by its id, as an empty label does (audit 52). In a typed view with boxes, a line comes into its end from the side when the way in head on costs far more, so a cloud service three groups deep keeps its line off the outer group's border, and the last resort's line that crosses a box's title tries its end on the card's other sides, a line crossed rather than the title (audit 60). Two lines between the same two cards swap ports in a cloud view only when no line then runs along a box's border, a last-resort line's moved end is kept only when no more labels then sit on a line, and a cloud line that runs on another is routed again round every other line (audit 61). In a typed view with repair off, a last-resort line brought in from the side is brought in head on when that way shares fewer lines and has no more issues (a GCP view laid out down, a third path into a product two paths from one other product reach, ran on one of them), and the lines a label was left on, up to three, are routed again round the label, kept when the view then has fewer issues other than crossings and no more in all, outside state machines and views of cube boxes (the use case gallery example with one association added or deleted laid an extend label over an include and another extend; audit 62). A line from a member nested thousands deep is drawn to its owner on the class, package, profile and object views, and on a view of a type the build does not know, where `validate()`, `layout()`, `check()` and `describe()` threw a RangeError: the walk from a member to its owner is a loop, as the member walks of audit 35 are (audit 62). Pictures that change on purpose: every example view draws as before in its own direction with Node's text measure. Turned, the C4 type example's containers view laid out down loses its label on a line, and the integration fixture's `c4-containers` laid out down draws 2 crossings and 1 label on a line, where 0.44.0 drew 3 and 3 (audit 62); state machine views are left out of that pass and draw as before. The generated stress views, as crossings/other findings where both are pinned: class-stress `all` 19 to 18 crossings, block-definition-stress `all` 54 right and 50 down to 49 and 48, parametric-stress `all` 207/22 right and 205/24 down to 208/16 and 201/18, component-stress `all` right 116 to 114, profile-stress `all` down 30 to 31, deployment-stress `all` down 3 shared lines and 9 labels on a line to 2 and 11 (audit 60); er-stress `all` down 18/2 to 19/0, c4-stress `all` right 133/3 to 138/0 and down (141/5 at 0.44.0, 138/8 after audit 60) to 138/7, requirement-stress `all` right 204/1 to 204/0 and down 233/3 to 232/1 (audits 60 and 62). Each pinned table and conformance note says so.
- **Pins on typed views.** Typed views settle their pins (`settlePins`): a pin on another pin's cell, on or in a box its card is not in, or growing its own box over what it does not hold moves to the nearest clean slot, and the drawn picture is checked once more so that a pinned element never draws over another (audit 58): when no cell near the pin is clean (a state's regions reach past the cells pins settle by), the pin is left out of the picture and the element takes a slot as one with no pin does, and a pinned element's line that runs on another counts too, after the boxes (audit 60). Alt + an arrow steps over a cell another card is pinned to (audit 58). A pin with no clean cell near goes in a fresh row under its box, what lies below moving down to make room, and 60 pins scattered over a view settle in about 10 ms; the requirement view settles its pins among its packages; a pinned view says only the warnings of the layout it draws, so no false "runs through a card" (audit 59). A pinned picture is weighed as `check()` weighs it, past what the view says with no pin: a line along a box's border or across its title, a label on a line or with no room and a line through a card move or drop the pin as a box over another does, and where no cell near is clean the pins that meet something are left out one at a time before all of them, so a clean drag of another card in the same composite is kept (audit 61). A pin one step from where its card goes with no pin (one Alt + arrow) is never settled back on that cell, nor short of it on that way, for issues that weigh less than a box over another or a shared line, so the key moves the card (the AWS gallery view's CDN, a column right, was drawn back where it was); and Alt + an arrow steps past the cell the card's own pin names when the card is drawn elsewhere, where it wrote that same pin again and the card could not be stepped on by keyboard (audit 62).
- **Text.** A map card's sub-line, title and accessible name read a string `what` as plain text (`mdPlain()`): a Markdown link, `==mark==` and `- ` bullets are no longer drawn raw. `mdPlain()` keeps a line break only before a list number, so a `what` hard-wrapped as "Retries up to" and "3. Then gives up." draws its sub-line as "Retries up to 3.", as in 0.44.0. In the typed views' wrapped text (a mindmap topic, a requirement's text, a BPMN, flowchart, DFD, C4, activity or state node, a use case's name, a comment) a line breaks between two ideographs, kana or hangul syllables, and a word wider than its line breaks between characters; a map card's one long Latin word keeps its smaller font and cut (audit 58). Every drawn text, `<title>` and `aria-label` writes a C0 control (but tab, line feed and carriage return), U+FFFE, U+FFFF or a lone surrogate as U+FFFD, so an exported SVG or a still is well-formed XML, and `validate()` warns at each string that holds one (audit 53); an icon glyph reads such a character as a space, and `glyph()` drops a repeated or valueless attribute, rebuilds a tag whose values are not all quoted, and writes every end tag plain (audits 54 to 56). The first sentence of a `what` (a weighted line's title and accessible name, a card's sub-line) reads only the first paragraph, joins bullet items with "; ", ends at no abbreviation (e.g., i.e., approx., vs., cf., incl., esp., viz.) and runs on past a list number at a line start, an initial that opens a name or follows another (J. R. Smith; not one after a full first name, Known gaps) and a title before a name, while "200 ms.", "port 443.", "Python 3.", "Service B." and "from A." end it (audits 54 to 57). A name that ends a sentence drops its period before ", opens ...", and an abbreviation keeps its own (audits 52 and 55).
- **diff(), the diff page and stills.** What a change takes out of a view comes back removed, in its place: a deleted subject's frame with its parts, ports and connectors (audit 51); a card that left a view, after the nearest card before it that stayed, so a deleted lifeline or timing lane is no longer drawn at the far end (audit 52); the lines of a card hidden from a view, whether the view lists its lines or not, and those of a removed view, with its boxes, fragments and timeline (audits 51, 52, 54 and 56; a map view that lists none gets its lines listed as it draws them, a typed view a mark per line in `view.diffMarks`); a deleted timing lifeline's changes and the constraints on them (audit 51); a box removed from a map view, which is said ("removes the box X"), as an added box is ("adds the box X") and marked added (audit 52); a removed ball interface, still a ball with its socket (audit 58); and a state's regions, with a state taken out of the view (audit 58). A view that lists its lines marks every listed line to a card it no longer shows as removed and every one to a card it now shows as added, its own lines and lines between ports included (audits 54 and 55), and `view.diffMarks.listed`, a new key, names the model lines such a view still lists, so `describe()` keeps them (audit 59). A re-pointed line is said as changed, and as taken out of a view (by its old ends) or put into one (by its new ends) only where the view drew it on one side alone, and that view is listed (audits 58 and 59); in a view drawn as a map the line taken out is drawn back removed between its old ends, with no id, whether the view lists none, still lists it or stopped listing it, where only a view that stopped listing it drew it before (audit 60). In a map view that lists no lines, that line no longer drops the lines of a card put into or taken out of the view in the same change, and a line re-pointed onto the view is drawn added there, as in a view that lists its lines, where it was drawn changed (audit 61). A line re-pointed while its old end leaves the view, taken out of it or deleted from the model, is drawn back removed there too, and said with that card (audit 62). Only what changed is marked: a mark the model carries of its own (a card's NEW or REMOVED tab, a line's added or removed style or edited dot, on a card, line, box, member or view override) is dropped from the model `diff()` returns where the change leaves that element as it was, so the diff page no longer draws and names a card or line the change did not touch as new or removed; a `planned` mark stays, as it draws as itself, and a mark the change adds or takes off is said and marked changed (audit 61). Dropping a member's own mark no longer reads as a change to its card's members in the summary (audit 62). A two-way or parallel map line takes the strongest change of the edges it stands for, in its drawing, title and accessible name (audit 51). A C4 dynamic view draws a step put into or taken out of its list, and numbers only its live steps (audits 51 and 52), as a map run-order or sequence view does (audit 55), and a step through a card taken out of the view is removed and unnumbered (audit 54). The model `diff()` returns passes `validate()`: a view's copy of a model line marked removed or added, with the line's id and ends, is that line drawn back, not a second line (audits 53 to 55), and a lifeline taken out of a sequence view comes back in the covers of each interaction use that covered it (audit 62). Fewer false marks: a conveyed item put into or taken out of a view marks no information flow (audit 53), an IDEF1X entity is marked only when it draws differently (audits 51 and 53), removing a stereotype marks no profile card that draws as before (audit 54), and a C4 view whose implied line names a relabelled relationship whose label it does not draw is not listed (audit 59). More true marks: a profile card reads the stereotypes, tags and Extensions it draws from (audits 51 and 53), a renamed extension point marks the extend that names it (audit 52), a port or constraint property marks when an interface or constraint block of its type's name comes or goes, and a block re-created under a new id draws its ports and expression as the model after does (audit 53), a C4 deployment instance put back draws its old implied line removed and its own line added (audit 54), and a line whose label changed goes with its card when the card is taken out of a view (audit 56). A line marked edited says "(edited)" in its title and accessible name and never "planned" (audit 56), and a changed line says "changed" once (audit 57). `rules()`, `describe()`, `paths()`, `reach()` and `critical()` leave out what is marked removed, so a removed line breaks no rule on the diff page (audit 57), and a typed view's own `describe()` reads the model after (audits 58 and 59; a communication view numbers its messages as the model after does). `diff()` leaves out a view that is no object, where it said "adds the view undefined" (audit 57).
- **validate() and rules.** `validate()` warns at each string holding a character XML cannot hold (Text, above) and checks a box's `change` as a card's (audit 53). A type that draws every view one way gives one direction warning, the true one: a sequence with `direction: "up"` no longer gets "drawn right" and "drawn down" both, and the timing view warns of layout pins and of a direction other than right (audit 52). `validate()` no longer throws on a `nodes`, `edges` or view list with a hole once `lib/umlimator-all.js` is loaded (audit 57). `realization-target` takes a port whose owner has type `""` as a class's (audit 53). A proxy port typed by a name that names nothing is a `port-kind` warning, no longer an error (audit 52). `reply-once`, `create-once` and `delete-once` read a `break` operand as performed instead of the rest of the operand around it (UML behavioural, below; audit 55). `rules()` leaves out lines, cards and boxes marked removed (audit 57), and the model `diff()` returns passes `validate()` (diff, above).
- **Page, keyboard and accessibility.** On the diff page every count an accessible name gives (a mindmap topic's subtopics, a group's or box's contents, a port count, a lane's flow nodes, a decision's exits, an item's flows, a sequence's or inline interaction's messages and lifelines) is the model after's: what `diff()` drew back removed, and a card only taken out of the view, are not counted (audits 51 and 53 to 57). A vertex in an unnamed state region is said "in region k of <state>", never by the region's id (audit 55). The standalone page's theme button reports which theme is on (`aria-pressed`) when a script outside the page sets `data-theme` on the document too, as the docs site's frames do when they follow its light/dark switch (audits 58 and 59). At 820 px and narrower the details panel's header puts its buttons on a row under the card's name when the name would have less than 160 px, so the name, What if and Close stay on screen at phone width; the time-lapse slider's `aria-valuetext` is the label it shows ("1 of 3: ..."), not a 0-based index (audit 61). The docs sidebar's collapsible groups are one button each with `aria-expanded` (audit 57).
- **UML structural.** The class docs say a parameter's `in` direction is not drawn, as UML's default (audit 51). On the diff page a profile card is marked when a metaclass reference or a package move changes what it draws, and not when a removed stereotype leaves it as it was (audits 51, 53 and 54), and a component's or composite subject's name counts no port or collaboration use taken out of the view (audit 56). The component view's pinned card on a cell the ranking gives a box's contents, the class view's two cards pinned to one cell and the profile view's package stretched over the profile boxes by Alt + Down are settled (audit 58; Pins, above).
- **UML behavioural.** `reply-once`, `create-once`, `delete-once` and the sequence connect's reply pairing read a `break` operand as performed instead of the rest of the operand around it, so a reply, create or delete in a break and another after it no longer conflict (audit 55). Timing F2 (audit 53) and the activity and communication add hooks (audit 54) are linear in a run of spaces or dashes. Shift + Delete's hint on a cloud group, a deployment node or a state counts the other views' own elements `apply()` deletes with it (audit 51), and the mindmap hint the other views' own subtopics (audit 52); a requirement's or an activity partition's Shift + Delete keeps and counts another view's own elements under it (audit 52). A region's initial pseudostate dragged far right of its composite no longer lays the composite over another, nor runs a transition through the region's title (audits 60 and 61), and the use case gallery example keeps its extend labels off other lines when an association is added or deleted (audit 62).
- **ER.** A member row with a comparison in brackets (`CHECK (amount > 0)`) is read as a multi-word type, where it was refused with "its brackets do not pair", and a bracket closed by another kind (`numeric(10]`) no longer passes (audit 59). An IDEF1X entity is marked on the diff page only when it draws differently, and `diff().views` no longer lists an IDEF1X view whose picture is the same (audits 51 and 53).
- **Flowchart.** On the diff page a decision's exits and a terminator's lines are counted live only (audit 56), and `describe()` of a flowchart view on a diff model leaves out what is removed (audit 58). The Mermaid flowchart readers changed too (Readers and writers).
- **DFD.** On the diff page a node's flow counts are the model after's (audit 56), and `describe()` of a DFD view on a diff model leaves out what is removed (audit 58).
- **Information flow.** A conveyed item put into or taken out of a view marks no flow (audit 53), and a model flow put into a view's edges list is counted once in each conveyed item's name, `describe()` and the PDF row (audit 57).
- **C4.** A dynamic view's step put into or taken out of its list is drawn, and only live steps are numbered, a step through a card taken out of the view included (audits 51, 52 and 54). A deployment instance taken out of a view or put back keeps its own line and draws its old implied line removed (audit 54). A view whose implied line stands for a relabelled relationship it does not label is not listed by `diff()` (audit 59). The C4-PlantUML and Mermaid C4 importer runs in linear time (Security).
- **SysML.** A deleted internal block or parametric subject comes back on the diff page with its parts, ports and connectors (audit 51). A requirement's Shift + Delete keeps another view's own requirement under it (audit 52), and a proxy port whose interface block is deleted is a warning (audit 52). On the diff page a port or constraint property is marked when a namesake interface or constraint block comes or goes, a block re-created under a new id draws its ports and expression as the model after does (audit 53), and a part's name counts no removed port or parameter (audit 56). Alt + Down twice on a requirement in a package no longer stretches the package over a card it does not hold (audit 59), and on the internal block example Alt + Down twice on the battery part no longer draws two connectors on one track (audit 60). The examples and the test fixtures model the bookshop's delivery cargo e-bike (Docs and examples).
- **BPMN.** Delete of a lane moves another view's own flow node in it to the pool, where `apply()` takes it, and Shift + Delete of a pool counts every view's own node it takes (audit 52); Delete of two or more lanes says "keeping what they held" (audit 57). A boundary event added on an activity one view alone holds lives in that view; Delete of such an activity deletes it and its event and says "deleted" for what lived in the view only (audit 58), also with the model boundary event on it selected too, where `apply()` threw (audit 59). Nested expanded sub-processes lay out in linear time (Performance), and the diff page's lane, group and task counts are the model after's (audit 56).
- **Mindmap.** Shift + Delete's hint counts another view's own subtopics (audit 52), a topic's subtopic count on the diff page leaves out one taken out of the view (audits 55 and 56), and a topic with no spaces in its text wraps (audit 58). The Mermaid mindmap reader reads `(-` and `-)` as Mermaid does (Readers and writers).
- **Cloud.** Shift + Delete's hint on a group counts the other views' own elements it deletes (audit 51), and a group's "holding N elements" on the diff page is the model after's (audit 55). A path from a service three groups deep to one outside every group keeps off the outer group's border, and on an Azure view laid out down a call out of a virtual network keeps off its header (audit 60); the round-60 regressions on AWS views (a line along the account group's border, two lines on one track) and small views laid out down are fixed (audit 61), and on a GCP view laid out down a third path into a product shares no track (audit 62). One Alt + Right on the AWS gallery view's CDN moves it (audit 62).
- **Readers and writers.** DBML: a standalone one-to-one ref's second end refers, as an inline one's already did and as @dbml/core's SQL export prints the foreign key, so `Ref: a.id - b.a_id` gives `b.a_id` the `foreignKey` and `references` that 0.44.0 gave `a.id`; inline, many-to-one and many-to-many refs read as before (audit 59). Mermaid flowchart: a subgraph whose title holds white space and has no id is `subGraph<n>`, as Mermaid names it, not a slug of its title (audit 51), and `A(-text-)` is an ellipse whose text has no dashes, in the typed reader and `umlimator.py import` (audit 54). Mermaid: a `%%` comment line inside a quoted string over lines is taken out, as Mermaid does (audit 51); a backslash before a capital N is text, where four readers broke the line and dropped the N (audit 57). Mermaid class: the writer leaves out and says an end's role alone whose last word reads as a multiplicity (audit 51) and writes a multiplicity without its spaces, reading the cardinality back before it writes it (audit 52). The Mermaid class writer writes a carriage return in a class, relation, cardinality, note or namespace label as `#13;`, as the flowchart, state and sequence writers have since 0.30.0, so the label reads back; 0.44.0 and earlier write it raw (audit 58). The class reader says and skips a `:::` style shorthand outside a class statement (audit 54). Mermaid mindmap: `(-` and `-)` open a borderless topic, read as a plain topic and said, and the writer quotes a rounded topic starting with `-` (audit 54). Mermaid sequence: a reply after a `break` no longer answers a call inside it (audit 56); a destroy a later message still reaches is read as its arrow says and reported (audit 57); a self-message right after `create` or `destroy` is an ordinary message with the `create` or `destroy` reported skipped, a message that both creates and destroys stays a create when a later message keeps the destroy from ending the stem, and with nothing later it is a delete and the dropped create is reported; a dropped destroy says "B sends a later message" when the later message is from B and "a later message reaches B" only when it is to B (audit 58). Mermaid state: the writer says a state's, pseudostate's, region's or internal transition's `opensView`, `what`, `change` and other keys it leaves out, and a description with no text is said, not read as an empty comment (audit 56). Structurizr JSON: a relationship between an element and its own owner is skipped and reported (audit 54), an element of a level the view does not draw is left out of the view and said (audit 56), and so is an owner listed with an element it holds (audit 57), so `validate()` takes the import. `umlimator.py import`: a compose or Kubernetes reference to a key kept apart by a control character follows that key, not the first (audit 52). The Mermaid class reader reads a `"` inside a backtick class name as a plain character, as Mermaid's class lexer reads a backtick name as its own token: it took that `"` as an open string and joined the lines after it into one statement, so a class name such as `` `Pipe 5"` `` lost the statements and `%% id:` comments that followed, and the class writer's own output did not read back (audit 60). The map importer (`umlimator.py import`) reports a Mermaid link with no arrowhead (`---`, `-.-`, `===`), a circle end (`--o`) or a cross end (`--x`), each read as a line, and reads `o--o` and `x--x` as two lines, as `<-->`, in the typed reader's words (audit 61). Both read a link whose start marker does not match its end (`x-->`, `<--o`, `o--x`, `<--x`) as one line, as Mermaid's `destructEndLink` does, and say that its start is not drawn, where they read two lines with an arrowhead at each end (audit 62).
- **CLI, MCP, the diff Action and the map-repo skill.** The MCP `tour` and `highlight` tools with no view ride the view the page shows now, then each view that lists the cards (audits 51 and 53), and a tour is refused when a card is drawn as a box or two cards in turn have no drawn line between them (audit 52). `diff --base`'s sketch in `summary.md` draws each line once, marks a card a view takes out or puts in (audit 55), no longer sketches removed what a removed view shared with other views (audits 56 and 57), and a `change` that is not text no longer stops the diff Action with a TypeError (audit 54). `tools/types.mjs` says an unknown type name in one line and exits 1 (audit 53). The host demo pages (playground, edit, embed, live, ask, replay, drift, timelapse) load `lib/umlimator-all.js`, so the Umlimator atlas's typed views draw in their notation (audit 52). `render`, `diff` of two files, `drift` and the MCP server's page need no git: on a machine without it they take the model's folder as the checkout's root, as for a model outside any checkout, where they ended in a `FileNotFoundError` traceback and wrote nothing. `diff --base` and `timelapse`, which read git's history, say in one line that they need git (audit 60). The map-repo skill runs v0.44.0 since #547 (`REF, SHA = "0.44.0-679af7d", ...` in `plugins/umlimator/skills/map-repo/scripts/cli.py`), and its plugin is 0.1.16 so that installed skills are offered the update (audit 54; `tests/cli.py` asks each pin move for a new plugin version). 0.45.0 ships with that pin, and it moves to v0.45.0 in a follow-up once the tag exists, as #547 did after 0.44.0.
- **Security.** The C4-PlantUML and Mermaid C4 importer (`umlimator.py import`) no longer hangs on hostile input under its 1 MiB limit: it rescanned the whole stack of open `{` for every line, so a 1 MiB file of `{` lines ran about 500 s; each open `{` now keeps its innermost boundary and boxes are found by id (audit 61 finding 8, high). Every drawn text, `<title>` and `aria-label` writes a character XML cannot hold as U+FFFD, and `glyph()` writes only well-formed tags, so imported or hand-written text cannot make an exported SVG or a still malformed XML (audits 53 to 56). The quadratic and exponential cases under Performance (timing F2, the activity and communication add hooks, id slugs of long dash runs, nested BPMN sub-processes, many lines into one card) were each a way to stall a page or a CLI run with a small model.
- **Performance.** Typed layout with many lines into one card runs in about linear time: 150 sub-requirements of one requirement took 6.5 s, 150 flows into one BPMN gateway 30 s; past a work budget of 4e6 cells per pass (six times the largest test model) the last resort keeps off cards, tags and labels but not other lines (audit 55). Nested expanded BPMN sub-processes no longer double in time each level (30 levels took over 60 s), and an id slug of a long run of dashes no longer freezes an add or a read (audit 54). Pins scattered over a view settle in milliseconds (audit 59). The map importer reads C4-PlantUML and Mermaid C4 with many boundaries and elements in linear time (12,000 boundaries with 30,000 systems: 4.9 s; the hostile case is under Security; audit 61). A Mermaid flowchart line of many links no longer copies the rest of the line at each link (audit 61).
- **Docs and examples.** The docs site is one Docs with one sidebar: Start, Diagrams, Maps and atlases, Use it and Reference; the top nav is Docs, Atlas and the version menu; each of the 28 types has one page, `docs/types/<type>.md`, written by `tools/gallery.mjs`, with its live example, checklist, how to write it and its conformance note (now in `docs/diagrams/conformance/`); the guide moved to `docs/start/`, `docs/maps/` and `docs/use/`, and `docs/examples.md`, `docs/types.md`, `docs/gallery/` and `examples/index.html` are gone with no redirects, so the old `/guide/`, `/gallery/`, `/conformance/` and `/examples` paths are broken links. The map is no diagram type and has no page of its own: every atlas opens on a map, and the Bookshop atlas's `overview` is the map's example, drawing every card kind, nested and tinted boxes, badges, change marks, line kinds, weights, styles and steps and two lenses, with the checkout in run order as its child view `overview-run` (the Pricing card opens it); `examples/types/map.json` is gone, and `tools/gallery.json`'s `map` holds the checklist the atlas's page lists. The atlases are named Umlimator and Bookshop, their model titles too (`Umlimator Atlas` and `Bookshop Atlas` before), so the page saves the Umlimator atlas as `umlimator.json` and its overview as `umlimator-overview.svg`, and the Bookshop atlas as `bookshop.json`; the files keep their names (`examples/umlimator-atlas.json`, `examples/bookshop-atlas.json`). The SysML examples model the bookshop's delivery cargo e-bike, its cargo box and parcel lock, and the parametric range binds the payload; the SysML test fixtures follow. In the Umlimator atlas `umlimator.py` opens the C4 context, and the Readers card says which formats are read in Node and which in Python (audits 51 and 53); in the Bookshop atlas the openers that sat on boxes, which do not open, moved to cards (audit 52). The docs site's frames follow its light/dark switch (audit 58), and its edit links open the file to edit, `docs/module-api.md` for the changelog (audit 57). Corrections: audit 49 findings 13 to 16, open in 0.44.0, are closed (the CLI guide's `--views` name views the Umlimator atlas has, a weighted line's `what` is said as plain words, and a weight is described as one width at rest in `lib/umlimator.d.ts`, the schema, the checklist and the examples README; merged in round 53, audit 51 findings 16 and 18); `destroy()` leaves the rest of the container (audit 58); the import table gives a person its real kinds (audit 54); Install and Command line name Node for every command that needs it (audit 57); the 0.30.0 note is restored, and the 0.44.0 note no longer gives this section's docs and example changes as 0.44.0's (audits 59 and 60).
- **Known gaps.** Audit 63's 5 low findings, each open on this release: the `history()` docs say `limit` caps the models kept, where the code caps the steps back; on a use case view Alt + an arrow along the rank axis on an actor writes a layout pin each time but the actor never moves; the BPMN XML reader keeps a boundary event whose host it skipped (a script, business rule or manual task, a gateway) with no `attachedTo`, so its own import fails `validate()`; the map importer reports a Kubernetes Ingress resource backend as "routes to Service null" and drops a v1beta1 `spec.backend` with nothing said; and the showcase guard misses a new `examples/` read in its legacy test files (round 62's AWS Alt + arrow test reads `examples/types/aws.json`). `lib/umlimator.d.ts` and the schema describe `diffMarks` with `marks` and `gone` only, not `listed`. In a typed view a re-pointed line is drawn back removed only where the view stopped listing it, under the model line's id, which `validate()` calls a second line; a typed view that lists no lines says it is taken out but does not draw it back, and one that still lists it, its new end not on the view, says nothing of it (audit 60: an own line in a typed view needs an id, and a C4 step names a model relationship, so the map views' id-less copy does not fit; the round 62 lane counted 168 such cases in a sweep, as before it). One case of audit 61 finding 6 stays: on the BPMN example, Alt + Up on the `payment-timeout` boundary event puts the "Payment result" label on the Take payment to Payment provider line in `order-to-shipment` and `order-to-shipment-expanded` (BPMN's `moveTo` sets the event's side, so no pin is settled, and the line is routed again after its label was placed). Lane notes of rounds 53 to 62 that no later round closed, each checked on this release: `mdPlain("Steps:\n- 1. a\n- b")` gives "Steps: 1." (round 57); a hard-wrapped `what` whose next line starts with a number that goes on with the sentence ("Retries up to" then "3. times then stops.") still ends at "Retries up to 3." (round 58); `firstSentence()` cuts "John F. Kennedy built it." after "John F." (round 56); the Mermaid class writer writes a relation label holding `:` as it is (`A --> B : a::b`), which Mermaid's class parser refuses (round 54); the Mermaid mindmap reader reads `t(-"x"-)` as an open quote, "\"x\"-", where Mermaid reads x, and the flowchart reader reads `A(-x)`, which Mermaid refuses, as a box labelled "-x" (round 54); the map importer reads Mermaid node shapes such as `{{Hex}}`, `>Flag]` and `[/Para/]` as plain cards and reports nothing (round 61); and a timing lifeline's name, linear since audit 53, has no length cap, unlike a change's or a message's (round 53). Of the 0.44.0 list, audit 49 findings 13 to 16, the card's Markdown `what` and round 48's `describe()` counting removed messages are closed (above, audit 57), and a JSON escape that a reader keeps as a raw control character is now drawn as U+FFFD with a `validate()` warning, though the readers still say nothing of it; its other items were not re-checked for this release.

Size: `lib/umlimator.js`, what a map host loads, is 290.6 kB (290,626 B) with `gzip -9` (892,147 B raw), 76.19% over 0.16.0's 164,954 B and up 25,934 B from 0.44.0's 264,692 B (812,423 B raw). `lib/umlimator-all.js` is 828.3 kB (828,331 B; 2,617,714 B raw), up 40,701 B from 0.44.0's 787,630 B (2,496,112 B raw). The npm package is 1,178.7 kB (`npm pack --dry-run`; 1,111.5 kB at 0.44.0). There is no core size cap until 1.0.0 (the maintainer's decision of 15 Nov 2026): sizes are reported each release and a budget is set at 1.0.0.

## After 0.45.0: changes not yet released

These changes come after 0.45.0 and are in no release yet; the release that ships them gives this section its number. They are the fixes of audits 63 and 64, each code fix with a test that fails without it. Audit 63's 5 low findings, open in 0.45.0 (its Known gaps), are closed here. No fix moves a map: `bench/expected.json` is unchanged, and every example view draws as before but two views of the class type page, whose lines past package boxes now go round them (Class view lines past boxes, below).

The changes a host sees without editing anything: **the BPMN XML reader no longer reads a boundary event whose host it does not read**, where 0.45.0 read it with no `attachedTo`, **nor a line BPMN refuses for its scope** (a sequence flow across pools, a message flow inside one pool, an association with no text annotation), each kept under `ext.bpmn.skipped` and said (Readers and writers); the map importer says an Ingress resource backend as one and reads a v1beta1 `spec.backend`; the PDF's Members column on the class, object, component and block definition views prints an operation's parameters as the box draws them, with no `in`. What changes for callers:

- **Core and layout.** Three or more pins on one cell of a typed view (a host that writes one cell for every card) are a pile: the first in the view's order keeps the cell and the others are dropped, so their cards take the slot a card with no pin takes. Before, each was settled round the cell, which gave a picture of crossing lines, and the view was laid out again for each pin tried: 80 linked classes in 10 packages, all pinned to one cell, took 26 s, and 120 took about 28 s; both now lay out in a few hundred ms, with nothing over anything and no shared line. A view that ranks its own cards (component, requirement) drops a pile the same way: 80 requirements in 10 packages went from 19 s to about 1 s. Two pins on one cell (Alt + an arrow onto a pinned card) still settle as before, and no example or Alt + arrow on one draws differently.
- **Page, keyboard and accessibility.** On a use case view, Alt + an arrow along the rank axis on an actor (Alt + Right, or Alt + Down laid out down) emits nothing and the hint line says the actor stays in the actors' column, where 0.45.0 wrote a new layout pin on every press, an undo step that moved nothing; Alt + an arrow across the rank axis still pins the actor (audit 63). A type's layout may give `keepsRank(model, view, id)` for this: the canvas asks it before a step along the rank axis and says its text on the hint line. On a component, composite structure, internal block or parametric view, Alt + an arrow on a port names the side the port goes to, along its side included, where 0.45.0 refused an arrow along the port's side; only the arrow toward the side it is on is refused, and the hint line says why. On an activity view, Alt + an arrow across the rank axis on a node with no node of its partition on that side in its column emits nothing, and the hint line says the node is the only, first or last of its partition there and that the Owner field moves it; on a BPMN view the same holds for an item alone in its lane's columns, and for data or an annotation drawn beside its flow node (audit 64). The layout's `keepsRow(model, view, id, geo, by)` answers this, as `keepsRank` does along the rank axis; the canvas passes both its geometry and the step `[col, row]`. On a BPMN view with lanes, Alt + an arrow on the first or last item of a lane's rows stepped outward, or on an item the lane pass settles back, emits nothing either, and the hint line says the item keeps its place in its lane, where the round 64 code wrote a pin that moved nothing; `keepsRow` and `keepsRank` lay the step's pin out and answer only when it moves nothing, so a step that moves another item still pins (audit 65).
- **UML structural.** The PDF's Members column prints an operation as its box draws it: a parameter's `in` direction, UML's default, is left out (`+ place(qty: Int): Receipt`, where 0.45.0 printed `+ place(in qty: Int): Receipt`), on the class, object, component (an interface's operations) and SysML block definition views. The member's edit text in the panel still writes a stored `in`, so it parses back the same (audit 64). The object, component, deployment and composite structure views warn `comment-link` on a comment link they draw with no comment at either end, as their connect already refuses it; the composite structure connect refuses a connector between boxes or collaboration uses (a collaboration use to a collaboration), which the view that draws it now calls a `connector-scope` error; `instance-of` takes a slot naming a navigable association end of the classifier; an interface realized by a component and by its port names the component once, in the component view's accessible name and in the class view's `describe()` (audit 64).
- **Readers and writers.** BPMN XML: a boundary event whose host the reader does not read (a script, business rule or manual task, a gateway, an event, itself) or that names no host is kept whole under `ext.bpmn.skipped` with "whose host X is not read" (or "on no host"), what was said of it as read taken back, and its sequence flows skipped as lines to an end not read, so the reader's own model passes `validate()`; 0.45.0 read it with no `attachedTo`, which `validate()` refused with `boundary-host` (audit 63). Such an event's output set, data outputs, marker and data associations are kept once, inside its own entry, with no `ext.bpmn.skipped` entry naming it as parent; and when it was the first element with a BPMN attribute the reader does not read (`parallelMultiple`, say), the "not read, here or elsewhere in the file" line moves to the next element read with that attribute, where it was dropped with the event and the attribute's loss went unsaid (audit 64). Map importer (Kubernetes): an Ingress resource backend is said as a resource backend that is not imported, where it was said as "routes to Service null"; a route that names no Service says so; and an `extensions/v1beta1` `spec.backend` is read as the default route, where it was dropped with nothing said (audit 63). BPMN XML: a sequence flow across pools or sub-processes, a message flow inside one pool or with an end in no pool, an association with no text annotation at either end, and a data association joining data of one pool with another pool are kept whole under `ext.bpmn.skipped` and said ("SequenceFlow across pools (a message flow joins pools)", and so on), so the reader's model passes `validate()`, where they were read as given with nothing said and `validate()` refused them; an attribute named `toString` (or `__proto__`) on an element kept under `ext.bpmn`, or on a foreign element inside one, is left out and said, where it was kept as a key that made `validate()` leave the whole object out with an error (audit 65).
- **Repository.** A bug agent (`.github/workflows/bug-agent.yml`, off until the variable `BUG_AGENT_ENABLED` is `true` and the secret `ANTHROPIC_API_KEY` is set): on an issue a maintainer labels `bug`, or one given by hand, an agent tries to reproduce the bug and either opens a draft pull request into `audit-loop` with a fix and a test that fails without it, or asks on the issue for a model and steps. Issue text is data, never instructions. The agent never holds the API key: a proxy that does (`tools/bug_agent_proxy.mjs`) is the only process that reaches the API, and the agent runs as a user of its own with no token and loopback only (`tools/bug_agent_jail.sh`), its shell takes exact commands only, and a separate job with no secret checks the diff as git reads it and runs its test with no network; the `bug-agent-jail` workflow checks the jail on a real runner. CONTRIBUTING.md and SECURITY.md describe the checks, the permissions and the risk that is left. The bug report template asks for a minimal model and numbered steps. Nothing in the module, the CLI or the pictures changes.
- **Motion speed (new).** A speed button on the map's controls (`1×`) steps through 0.5x, 1x, 1.5x and 2x and scales tours, story steps and the flow along lines together, said to screen readers as "Motion speed 1.5×"; pressing it leaves a playing story playing. The standalone page remembers the reader's choice per browser (`visual-speed`, every storage call in try/catch, so a private window still works).
- **Motion speed in the model and the link.** `motion: { speed }` in the model (schema, `MapModel` in the d.ts) is the author's default, from 0.25 to 4; `validate()` warns on a speed outside that range or not a number, and on a `motion` that is not an object. `#speed=<n>` in the page's link (and the standalone page umlimator.py writes) sets it too and stays in the link the page writes. Order: the reader's saved choice, then the link, then the model, then 1.
- **Motion speed for hosts.** `render()` takes `speed`, the handle has a settable `speed` (null goes back to the model's), and `MapState` has `speed`. A tour's dot rides `speed` (map units a second, default 240) times the map's speed, read frame by frame, so a change mid-ride goes on from where the dot is; a story step lasts its `duration` (default 4000 ms) divided by it; the flow along lines, a line mark's `speed` and the other line animations run that much faster (`--um-speed` on the stage). Reduced motion still stops the dot and the flow at any speed. The defaults stay 240 map units a second and 4000 ms: `umlimator.py record` and `tests/cli.py` pin 4000 ms for a step, and the docs give both, so faster defaults would change recorded stories.
- **Story keys.** The Right arrow and Page Down skip to the next story step at once, even while its tour rides, and the step is said in the live region (already so in 0.45.0; now under test). No new key: N adds a card on an editable map.
- **Loop tooling.** `tools/evolve/` holds the self-evolving loop's tools, in Node with no dependency and with no schedule yet (`tools/evolve/README.md` proposes one): `lease.mjs` takes, renews, releases and checks the loop's ownership lease (`.evolve/lease.json`, gitignored, or `$EVOLVE_LEASE`), with a takeover only after expiry; `ledger.mjs` reads the audit files and prints a stop or continue verdict from the circuit breakers (a finding's title or file and symptom back in three rounds, a family that regresses twice, three rounds with no fall in high plus medium findings); `digest.mjs` writes the weekly digest in Markdown (rounds, findings by severity, releases, breakers, open known gaps, and 2 or 3 rejected findings with the verifier's reason, picked with the date as the seed); `fuzz.mjs` mutates the Structurizr, Mermaid, BPMN, C4-PlantUML and cloud importers' fixtures for a time budget and shrinks each crash, hang or invalid model to a small input with a repro command. `docs/diagrams/LESSONS.md` seeds the loop's lessons file. Tests: `tests/evolve.test.mjs`.
- **MCP editing (new).** `umlimator.py mcp` has edit tools: `add_card`, `connect`, `rename`, `move_to_box`, `remove`, `set_field` and `pin`, each the page's own gesture (the canvas editor and the type's hooks, so a reply pairs with its call and BPMN's rules on flows and pools hold), and on a map view the commands a host writes. `preview(edits)` runs a list of steps (edit tool calls or `apply()` commands) on a copy and answers the commands, `diff()`'s summary, and the problems, rule breaks and layout issues the change adds; `apply(edits)`, and each edit tool without `dry_run`, writes the model file atomically, in its own layout (what the change leaves alone keeps its text), only when `validate()` finds no error the change adds. `undo()` and `redo()` step through a history kept next to the model (`MODEL.json.undo`), refused when another editor wrote the file since. An open page reloads with each change. `tests/fixtures/mcp-eval/` holds requests in plain words with the change each asks for, and `tools/mcp_eval.py` runs an assistant's attempt against them (not in CI). See [MCP server](use/mcp.md).
- **BPMN.** A line's label that the drawing leaves on another line slides along its own line to the nearest spot clear of every other line, card, label and border, so Alt + an arrow on a boundary event no longer leaves a label on a line: on the gallery's BPMN example, Alt + Up on the `payment-timeout` timer put "Payment result" on the Take payment to Payment provider line in `order-to-shipment` and `order-to-shipment-expanded` (0.45.0's known gap, audit 61 finding 6). A label on no other line stays where it was, so every example draws as before; a test tries Alt + each arrow on every boundary event of the BPMN examples, laid out as is, right and down.
- **diff().** In a typed view that lists its lines, a re-pointed line the view stopped listing, or whose old end left the view, comes back removed between its old ends under an id of its own, the line's id and `~old` (`~old2` and so on when the model holds that id), where 0.45.0 drew it under the model line's id and `validate()` said the id was used twice (0.45.0's known gap, audit 60). A C4 dynamic view draws no copy, as its step names a model relationship; the summary says the line is taken out. No new field; `docs/diagrams/notes/typed-repoint.md` weighs the options.
- **Docs.** The `history()` docs say `limit` caps the steps back, with an example (`history(model, 2)` allows two undos) that a test runs against the real `history()`; 0.45.0's docs said it capped the models kept (audit 63). The editing guide's use case table says how an actor moves by keyboard. The editing guide says how a port changes side by keyboard on the component and composite structure views, how an activity node moves within its partition, and how a BPMN item moves within its lane.
- **Test protection (new).** `tests/protected.json` lists the core tests (the bench hashes, `validate()` and `apply()`, `diff()`'s invariants, the readers' round trips, hostile input and prototype keys) with a hash of each one's body and helpers; `tests/protected.test.mjs` fails when one is deleted, renamed or weakened, and only the maintainer records an approved change, with `node tools/protect.mjs --update`. `tools/evolve/mutate.mjs` runs mutation testing on chosen source files in a temporary copy, by seed and within a time budget, and reports the share of mutants killed and each survivor's place. Both are in CONTRIBUTING.md.
- **Layout design note.** A design note for layout by business flow, [`docs/diagrams/notes/layout-flow.md`](diagrams/notes/layout-flow.md), linked from `docs/diagrams/README.md`: how ranks, column order, rows, pins and routing work today, with the functions that do each, and a design for a main flow on one straight row, dependency lines that do not pull the layout, semantic zones per diagram type, stable layout across edits, a quality score with a bench mode, fixed and held-out corpora, and the weekly propose-measure-keep loop, in small pull requests; it changes no code and no picture. `tests/notes.test.mjs` checks that every function its tables name is defined in the file it names.
- **Layout by business flow: the main flow with boxes (step 7 of the note).** In a map view with `arrange: "flow"` and boxes, the main flow holds one row across them too (`blockPos`): in each box, and in the view, a main card is anchored at the main row and a box that holds main cards at the row that puts its first main card on it; a column a main line passes keeps that row free, so a branch card in a column of its own beside its main card no longer sits on the line; each branch keeps one side over the whole view (above for a guard, else below), whichever boxes it passes; and a card whose lines are all dependencies, joined only to cards above the main row, goes above with them, so its lines do not cross the row. The main lines take the middle ports (`mainPort`) as in a view without boxes, and the score's `straight` reads them. A flow that leaves a box and comes back into it takes a second row in that box. Only `f12`'s four boxed views change in `bench/expected.json` and `bench/score-expected.json`; every other view and every example draws as before. A first or last card (map zones) in a box sits on the main row only when it has a line into the first main card or from the last; else its column keeps the row free. On those views, against the zones of step 9, `straight` falls from 4, 10, 4, 0 to 0, 6, 0, 0 (order, signup, ticket, pipeline), and their score from 4211.87 to 3787.89 (the f12 total from 9566.92 to 9142.94; crossings stay 2 and reverse 4). Tests: `tests/flow-layout.test.mjs`.
- **Stories from the main flow (step 13 of the layout-flow note, new).** `storyFromFlow(model, viewId, options?)` returns a story told from a view's main flow, which `validate()` accepts: one step per card on the main flow, each with `select` (the card), `highlight` (the card and the main line into it), `tour` (the two cards that line joins, so the page's `tour()` and the MCP `tour` tool's refusal rules of 0.44.0 hold) and a caption from the line's `what`, else its label (`"4. Charges: Cart charges Payments."`), naming the cards its dependency lines join (`"; reads Orders"`). Branches off the main flow come back in `chapters`, each a story with `at`, the step it leaves from; `chapters: false` leaves them out. A sequence view tells its messages in order and a BPMN view its path from the start event (each node's first sequence flow: default flows are not in the model yet). The model is not changed. `FlowStory` in the d.ts. `play()` on the handle takes a `Story` object as well as an id, and plays it as given: not added to the model, and not named in the page's link. The standalone page's Stories menu offers **From the main flow** on a view with `arrange: "flow"` (a button in the menu's Tab order; the menu shows on a model with no story of its own while such a view is shown). The MCP server has `story_from_flow`, which returns the story without writing the model file. On every view of `bench/models/f12.json` the story passes `validate()`, has a step per main card, and each tour is two cards joined by a drawn line (`tests/story-flow.test.mjs`). No picture changes.
- **Stories: scrubber, chapters and audiences (product item 4).** The caption bar has a scrubber, a range input named "Story step" that goes to any step by pointer or its own keys (the map's keys leave it alone; Esc closes the story), and playing goes on from there at the map's speed. A story may have `chapters` (schema, `StoryChapter` in the d.ts): stories of their own, each with `at`, the step it is offered at; the bar offers a chapter as a button at that step and ticks it on the scrubber, and ↩, the chapter's end, or ‹ on its first step returns to the story at that step. The player has `go(k)`, `chapters`, `enter(id)`, `back()` and `chapter`; the story event and `MapState.story` carry `chapter` and `at` while a chapter is told (and are as before otherwise); a chapter's step is in no page link. A story may name its `audience`: the standalone page's Stories menu lists the stories that name none first, then each audience's in a group under its name. `validate()` checks a chapter's steps as a story's, errs on a chapter with no id, a repeated id or no steps, and warns on an `at` the story has no step for and an `audience` that is no name. `storyFromFlow()` takes `audience`, kept on the story and its chapters; for `"business"` the captions leave out the stores a step reads or writes. A communication view's story is told from its numbered messages in time order (`"1.1. place(order): storefront calls api."`), each step riding the connector between the two lifelines. The MCP tool `play_story` takes `story`, a story given as it is (such as `story_from_flow`'s, which takes `audience` too), checked as `validate()` checks the model's stories and never written; `page_state()` names it as given. Tests: `tests/stories.html` (scrubber, speed, chapters, the menu's groups, the link), `tests/story-flow.test.mjs`, `tests/mcp.py`. No picture changes.
- **Layout by business flow: map zones (step 9 of the note).** In a map view with `arrange: "flow"`, a card's `zone` places it: `first` in a column before the flow, `last` in a column after it, each taking no rank from its lines and sitting on the main row when it has a line into the first main card (or from the last), else to the side of the branch it joins, else above; `under` in the band below every flow row, between the cards its flow lines come from and go to when there is room. A flow line that runs back into a first card (or out of a last one) is drawn as a line back, so `check()` does not call it right to left. Without a `zone`, a card off the main flow takes the map's default (section 7.2): a person (by shape or kind) and a `public` card no line comes into go first, an `external` card last, a `database`, `file` or `board` card under; the main flow's first card may go first and its last card last. `zones: false` turns the defaults off; a card's own zone always holds, a pin beats it, with boxes it applies inside the card's box (`blockPos`), and a view whose cards all have a zone ranks as without them. A view with no boxes is also laid out without its default zones (`bestFlow`), and keeps them only when they draw no more problems than without them. A column of an arranged view with no main card in it now keeps its cards off the main row, which a main line runs through. Only f12's signup, order-boxed and ticket-boxed views draw differently (`bench/expected.json`); f12's score total falls from 9905.56 to 9566.92, and no view's reverse or cross is above the same view with `zones: false`.
- **Layout by business flow: the main flow on one row (step 6 of the note).** In a map view with `arrange: "flow"` and no boxes, the main flow holds one straight row: its lines are those marked `flow: "main"` (the longest path among them), else the stepped lines in step order (2 < 2a < 2b < 3, a step's first suffix on it and the others branches), each starting where the one before ends, the longest such chain kept, else a numbered view's run order, else the longest path of flow lines (ties to the card the view names first). Its cards are anchored at one row (`flowPos`, through `rowsFor`'s and `untangle`'s anchors), each branch keeps to one side of it, above when one of its lines is a guard and below otherwise, the other side when a column already holds `BRANCH_BALANCE` (2) more cards on that side, and a main line takes the middle port of the sides it leaves and comes into (`mainPort`), so it is one straight segment. Pins win: a pinned main card keeps its cell and no other card moves for it. An arranged view takes no hub plan. The extraction is one exported function, `mainFlow(lines, { back, dep, cards, run })` in `src/layout/layered.js`, which the layout, `validate()` and the score read; `validate()` now also warns where an arranged view's steps break into chains, and the score's `straight` reads the lines the layout drew as the main flow. A view without `arrange`, a boxed view (step 7), a typed view and every example draw as before: only `f12`'s four arranged plain map views change in `bench/expected.json` and `bench/score-expected.json`. On `f12` the score total falls from 10020.21 to 9905.56, `straight` is 0 on every view without boxes (signup's falls from 4), crossings stay 3 and reverse 4. Tests: `tests/flow-layout.test.mjs`.
- **Layout by business flow: dependency lines (step 4 of the note).** In a map view with `arrange: "flow"`, a line whose `flow` is `dep` (else whose kind, as drawn, is `state` or `guard`) ranks, orders and rows nothing (`flowPos`, `blockPos`): a store each step writes to no longer lands past the last step with its lines across the view, but sits in a band under the flow rows (under its group's, with boxes) in the column of the middle card it is joined to. The router takes dependency lines after every flow line (`layoutGraph`, its order and its rip-up order), and `check()` no longer calls one that runs right to left a problem. A view without `arrange`, a view with no flow line, a pinned card and every typed view draw as before: no example moves and only `f12`'s eight map views change in `bench/expected.json`. On `f12` the score total falls from 11284.71 to 10020.21, crossings from 4 to 3, reverse stays 4; `bench/score-expected.json` now lists `f12`'s twelve views. Tests: `tests/flow-layout.test.mjs`.
- **Layout by business flow: the model fields (step 3 of the note).** Four optional fields, read by no layout yet, so every picture is as before: `arrange: "flow"` and `zones: false` on a view, `flow` (`main`, `branch` or `dep`) on a line, map or typed, and `zone` (`first`, `flow`, `last` or `under`) on a card or in a view's `nodeOverrides`. `validate()` warns on any other value, on `arrange` on a sequence, timing or mindmap view (which does not rank its elements), and, in an arranged view, on main-flow lines that are not one path: a card with two main lines out or in, or a main line that closes a loop as the layout reads loops. `diff()` reports a change of any of them as a change of the view, the line or the card. Schema and d.ts: the four fields, and the types `FlowRole` and `FlowZone`. The bench's fixed corpus gains `bench/models/f12.json`, twelve arranged views each with a main flow (four map flows, a C4 container view, a DFD, a flowchart, a Google Cloud view, and four boxed map views), with `bench/expected.json` entries for its eight map views only; no other hash moves. The design note records the maintainer's answers (stores `under` the flow, held-out maps never committed) and a new section and step for wrapping a long main flow onto a second row. Tests: `tests/flow-fields.test.mjs`.
- **Layout by business flow: the edit and held-out corpora and the weekly loop (step 12 of the note).** `python3 bench/bench.py --score --corpus edits` scores the edit corpus, `bench/edits/edits.json` (five `apply()` edits per bench map view, written from a fixed seed by `bench/gen-edits.mjs`, whose `--check` fails when the file drifts): each edited model laid out against the model before (`stableFrom`), with the `moved` share of untouched cards in its score, compared with `bench/score-expected-edits.json`; a pair that draws more hard issues than the same edit laid out fresh fails, and section 8.4's 95 percent target is reported (146 of 186 pairs today). `--corpus heldout` scores the held-out corpus, which is never committed: `bench/gen.py --heldout --week YYYY-Www --out DIR` writes it from the secret `LAYOUT_HELDOUT_SEED` hashed with the week, refuses a folder in the repository, and the score prints totals only. `--out <file>` writes a run's totals. `tools/evolve/tune-loop.mjs` is the weekly propose-measure-keep loop of section 9 (one value of `src/layout/tune.js` within a declared range, the lease held, kept only when section 9.2's rules hold on the three corpora, two weeks with nothing kept stop it, a change whose held-out total worsens is reverted), and opens a pull request against `audit-loop`, never merging; `tools/evolve/digest.mjs --tune` lists its records. Workflows: `layout-score` (the fixed and edit corpora on pull requests, the held-out corpus on pushes to `audit-loop`) and `layout-loop` (Sunday 03:00 UTC+7, off until the variable `LAYOUT_LOOP_ENABLED` and the secret are set). No file under `src/` changes and no picture changes. Tests: `tests/corpora.test.mjs`, `tests/tune-loop.test.mjs`, `tests/cli.py` (bench score).
- **Layout by business flow: a layout that stays put across edits (step 11 of the note).** Opt-in, so every picture is as before unless a base is passed. `render()` and `mountPage()` take `stableFrom` (the model before an edit), and `layout()` and `check()` take it too (there is no `renderToString()`; `layout()` is the no-DOM path): each card the edit left alone (on the view in both models, in the same box, none of its flow lines added, removed or turned round) keeps the cell the base's layout gave it, as a soft pin, and the other cards are placed round the soft pins as unpinned cards are, a card that was there before starting from its old cell. A real pin wins, and a soft pin on a real pin's cell is dropped. A hub view keeps its lanes, columns and order, as after `update()`. Types that rank their own cells or take no pins (component, BPMN, requirement, internal block, parametric; sequence, timing, mindmap) are drawn fresh. The guard: the stable layout is drawn unless it has more hard issues than the fresh one or `scoreGeo` scores it worse by more than `STABLE_SLACK` (1, in `src/layout/tune.js`) labels left out, in which case the fresh one is drawn. Soft pins are never written to the model. `diff(before, after, { stable: true })` returns the model before as `stableFrom`; without the option its result is unchanged. `umlimator.py diff` (two files or `--base`) takes `--stable`, which draws each page and still against the model before (its JSON in a `#umlimator-base` script the page template reads), and the diff Action takes `stable` (default `false`). `umlimator.py mcp` draws its page after an edit against the model before it, from the undo history, while the file is still what that edit wrote, and the edit tools' `layout` issues are checked on that picture. `bench/expected.json` and every example are unchanged. Tests: `tests/stable-layout.test.mjs`.
- **Loop strategy.** The audit and fix loop follows the auto-evolve strategy pinned at v1.0.0 in `.evolve/STRATEGY.md` (the upstream text byte for byte under a header naming the version, commit and date), with `.evolve/strategy-feedback.md` for problems with the strategy itself, `.evolve/MAPPING.md`, `.evolve/rules.md` and `.evolve/decisions.md`; `tools/evolve/strategy-sync.mjs` checks the pin against upstream (`check`), sends the open feedback upstream as one pull request it never merges (`propose`) and opens the pull request that pins a newer version (`update`); `tools/evolve/killswitch.mjs` stops the loop while `.evolve/STOP` is on main; the round templates and their checklist are in `tools/evolve/templates/`, and `mutate.mjs`'s temporary copy now keeps the tracked `.evolve/` files. Nothing under `src/` or `lib/` changes. Tests: `tests/strategy-sync.test.mjs`.
- **Tools.** `tools/protect.mjs` reports a protected test that no longer runs: one wrapped in a skipped `describe` (`describe.skip`, or `{ skip }` or `{ todo }` in its options), an `if`, a loop, a function that is no test callback or an expression such as `false && test(...)`, which it read before as recorded since the test's own text had not changed; `--add` and `--update` refuse such a test. `node tools/gallery.mjs --docs-of` with no path, a path that is not there, a folder or a file that is no model prints one line saying so and exits 1, with no Node stack trace, and so does `node tools/gallery.mjs` on a stop in its inputs (audit 65). Tests: `tests/protected.test.mjs`, `tests/gallery.test.mjs`.
- **Tests.** The showcase guard counts each legacy test file's reads of `examples/`, so a new read in such a file fails it; round 62's AWS Alt + arrow test reads its own fixture (audit 63).
- **Release.** A merged version bump is published to npm under the dist-tag `next`, not `latest`. CI's new `smoke` job installs that version from the registry into an empty folder and uses it (`tools/smoke.mjs`: import `umlimator` and `umlimator/all`, read the schema, lay out and check the smallest model in `examples/types/`, then `umlimator.py render` and `check` it with the installed `lib/`); only when that passes does the `promote` job move `latest` to it with `npm dist-tag add` and publish the GitHub Release. A failed smoke test leaves `latest` where it was and the Release a draft, and says which step failed and why. `promote` needs a new repository secret, `NPM_TOKEN`, since trusted publishing covers `npm publish` only; without it the job fails and prints the command to run by hand. Provenance publishing is unchanged. A host that installs `umlimator` sees a new version only after this check.
- **Docs site.** A new `site-links` job, after each Pages deploy, reads the deployed site from its root, and from its `sitemap.xml` when it has one, and fails when any internal link, frame, picture, script or stylesheet does not answer 200 (`tools/linkcheck.mjs`). CONTRIBUTING.md's release section says the three release jobs, what to do when the smoke test fails, and how to run both tools locally.
- **Association classes (new).** A `uml.Class` whose `props.associationClass` is a `uml.Association`'s id is that association's class (UML 2.5.1 11.5.4): a class view that shows the class and draws the association joins the class box to the middle of the line by a dashed line with no ends, moved along the line just past its label when the label sits there, and keys it in the legend as Association class. The new rule `association-class` calls it an error when the id is no association's, when a non-class has the field, when the class is an end of its own association and when two classes name one association, and warns when a class view draws one without the other or draws the association as a loop (then with no dashed line). `describe()` says "the association class of the association between Person and Company" and "associated with Company ... through Job"; the class's accessible name ends in ", the association class of the Association from ..."; the PDF's Kind column says Association class; the Mermaid class writer writes the class and the association apart and says the tie on a `%% not written:` line; the class view's properties panel has an "Association class of" field that takes the association's id or its one name. Schema and d.ts: `associationClass` on a class's props (`UmlClassifierProps`). Tests: `tests/association-class.test.mjs`. The class view's rules number 14 (`tests/class.test.mjs`).
- **Association classes (audit 65).** A class view's dashed line from an association class to its association no longer runs through a card, across another line, over a label or along a package box's border: when the line to the middle would, it takes the shortest way round to the nearest point along the association that it reaches clear (two association classes on one class, Person with Job and Assignment, drew one through the Project card and across the other association; a class in a package drew its line along the package's border). The search for the way round is bounded: a grid of at most 250,000 cells for each line and one share of work for all of a layout's lines, past which a line is drawn its plain way, so a large or hostile class view cannot hold hundreds of MB or hang the page. Deleting an association takes `props.associationClass` out of its class (the class type declares the field in `refs`, so `references()` lists it too), where it was left naming a gone id, an error of rule `association-class`; an element of no type is a class here and has it taken too, and a `diff()` of the delete draws the deleted association with its class tied to it. An association a class view holds as its own line (an object in the view's `edges`), which the view draws with its class, is one rule `association-class` and the panel's "Association class of" field take, where the rule said it was not in the model. `docs/diagrams/examples/check.mjs` checks a field a registered type declares in `refs` by that declaration and every other field by model.md's hand list, where a type that declared any refs lost the hand list's checks of the rest (`props.attachedTo` on a class, now that the class type declares `props.associationClass`; the same held for sequence, timing and BPMN). Tests: `tests/association-class.test.mjs`.
- **Class view lines past boxes.** A class view now routes a line again round a package box that holds neither of its ends, as a state machine view already did (the layout's box pass, asked by the class view with `shutBoxes`): the class type page's `sales-right` view drew its «use» line from Payable to Money inside the card package, along under its title, and its `sales` view drew the line from OrderLine to catalog::Book across a corner of the payments box. Those two views of `examples/types/uml-class.json` draw these two lines differently, and nothing else moves; every other example view and `bench/expected.json` are unchanged. Test: `tests/class-box-lines.test.mjs`, on a copy of that model in `tests/fixtures/uml-class-use-line.json`.
- **Back to Docs on the example pages.** `umlimator.py render --docs HREF` puts a Back to Docs link to HREF at the end of the page's header (`mountPage`'s new `docs` option; a relative path or an http(s) address, anything else refused in one line), a Tab stop in either theme, shown as Docs on a phone with its whole name read out, and left out in a frame, a still, a PDF and a check. The site job renders each example with it: a type's page links its type page, an atlas its atlas page, another example the type page of its first typed view, a map with none the maps guide (`node tools/gallery.mjs --docs-of MODEL.json`). The page had no examples link to replace. Tests: `tests/gallery.test.mjs`, `tests/embed.py` (the docs link) with `tests/docs-frame.html`.
- **Mermaid flowchart reader speed.** An unclosed `@{ ... }` field list holding many quotes and colons (`A@{ :"":"":""...`) is read in linear time: the reader tested whether the value so far was blank by trimming it at each quote, which took about 30 s at the 1 MiB limit (audit 65). Fields read as before. Test: `tests/mermaid-flowchart.test.mjs`.
- **Trace to sequence speed.** `sequenceFromSpans()` and `umlimator.py trace --diagram uml.sequence` count the calls that overlapped in time in n log n: the count tested every pair of calls and walked up the parents for each, so a deep chain of nested calls across services took time in the cube of its length (1,200 spans 29 s). The caption's count is as before. Test: `tests/convert.test.mjs`.
- **Layout quality score (new).** `python3 bench/bench.py --score` runs `bench/score.mjs`, which lays out each view of the fixed corpus (the bench models, every example and the typed fixtures, 241 views) with `lib/umlimator-all.js` in Node, no browser, and scores it with `src/layout/score.js`: `hard` (lines through cards, shared lines, cards or boxes over each other), `cross`, `labels` (on another line or a box border, with no room, cut to their step, or not drawn), `straight` (for a view with lines marked `flow: "main"`: rows its main cards use and corners on its main lines), `reverse` (flow lines that run more than 8 px against the reading direction, on map and flow types) and scoreGeo's length, corner and area terms, weighted by `bench/score-weights.json` into one number per view, lower better; `moved` measures an edit pair for the edit corpus to come. It prints a table and the totals, writes `bench/results/score-<date>-<commit>.json` with `--save`, and with `--expect bench/score-expected.json` (the corpus as it draws now) fails when a view's `hard` rises, a view's score rises by more than 2 percent or the total rises; `--base REF` lays the corpus out with REF's `lib/` in the same run, applies the same rules against it and fails when the corpus takes more than 1.10 times its time, and a view of m50 over 1000 ms or a C4 example over 1500 ms fails any run. Time is a gate, never a term of the score. `tools/build.mjs` leaves `src/layout/score.js` out of `lib/`, so no host loads it and no picture changes: `bench/expected.json` and every example are as they were. Step 1 of the layout design note's order of pull requests. Tests: `tests/score.test.mjs`, `tests/cli.py` (bench score).
- **MCP editing and validate() (audit 65).** An edit tool writes the model file in its own encoding: a file in UTF-8 with a byte order mark, UTF-16 or UTF-32 stays so, where the first edit rewrote it as UTF-8 with no mark, and `undo()` puts it back byte for byte, as the MCP guide says. `validate()` gives an error for a view's `edges` that is not a list (a string, number or object), as it does for a `nodeIds` that is not one: the view draws the lines between its cards instead of the ones it names. So `set_field` can no longer write one.
- **Layout tuning constants.** `src/layout/tune.js` holds the layout's tuning constants under names, with the values they had (step 2 of the layout-flow note's section 12, its section 9.1): the barycentre sweep count (`BARY_SWEEPS`, 8), `rowsFor`'s sweep order (`ROW_SWEEPS`), `bestFlow`'s card range and its ways (`FLOW_MIN` 3, `FLOW_CAP` 30, `FLOW_WAYS`), the fan-in threshold and its search's layout cap (`FAN_IN` 6, `FAN_TRIES` 14), `layoutGraph`'s crossing-search cap and round-the-outside tries (`CROSS_CAP` 30, `OUTSIDE_TRIES` 4), `scoreGeo`'s weights (`SCORE_WEIGHTS`) and the label pass order (`LABEL_PASSES`), with two named placeholders no code reads yet (`BRANCH_BALANCE`, `STABLE_SLACK`). No picture changes: `bench/expected.json` and every example are as they were. `tests/tune.test.mjs` pins each value and checks the layout reads it from `tune.js`.
- **Layout anchors (step 5 of the layout-flow note).** `rowsFor` and `untangle` (`src/layout/layered.js`) take a fifth argument, `anchor` (`id -> row`, an object or a Map), used by no view yet. `rowsFor` never moves an anchored item: it splits each column at its anchored items and fits the items before one into the rows above its row, those after it into the rows past it and those between two anchored items into the rows between, each side by the same pooling, with the column's order kept; rows are then not shifted to start at 0. A column may hold more than one anchored row (the two main rows of the note's section 14). `untangle` lets a column hold anchored and free items together: anchored items go in order of their rows and each free item stays on its side of them, each side ordered on its own. With no anchor both functions give what they gave before. No picture changes: `bench/expected.json` and every example are as they were. Tests: `tests/anchors.test.mjs`.
