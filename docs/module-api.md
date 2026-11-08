# Module API (step 3 design note, for approval)

Status: approved and built, 6 Nov 2026 (step 3). Steps 4–6 are listed only where they shape this API. Types:
`lib/umlimator.d.ts`. Tests: `node --test` (layout) and `python3 tests/embed.py` (render in headless Chrome).

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
  destroy(): void;                    // removes DOM, listeners, observers, timers; the container is left empty
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
- Keyboard: Tab reaches each card; arrow keys on a focused card move to the nearest card that way (on the empty canvas
  they still pan); Enter selects, and Enter on a selected card opens its inner view (or, with none, sends `select` again,
  as a click does); Escape clears, then goes up a level.
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
- Not covered: lines and containers are reachable by pointer only.

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

- **Cards with no lines** sit in a row of their own under the view, in view order, wrapping at its width. Auto-layout put
  them in the first column, under the sources, so that column grew (four outside systems under five people, a column of
  nine on a system-context map) and the lines from the sources ran around it. A card with no line in a row under every
  card that has one never widens a column: it is spaced by its own width. The row comes from the cards' slots and lines
  alone, so the stable layout across `update()` and the layout `umlimator.py render` bakes into a page draw it the same;
  a host's `layout` places such cards where it says. Views with containers keep their block layout. Of the bench views,
  those with such cards moved: b10 (both views), b69 (all three) and m50 (#46).
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
- **How much a line stands for.** An edge's `weight` (1, 2 or 3; the host picks the bucket) draws its line at three widths,
  about 1.8, 3.2 and 4.5 px, with its arrowhead and hit line larger in step; its colour, and so its contrast, stays its
  kind's. Its `sublabel` is a second, smaller line under the label, in the same pill, counted in the room the router leaves
  for labels (a column gap fits the wider of the two lines). A line that stands for several edges takes the largest weight
  and shows each sublabel, joined by " / ". Both reach the geometry (`weight`, `lbl.sub`); views without them keep theirs.
  Every line was drawn at one width with one label line, so a line standing for 486 relations looked like one standing
  for 1 (#44).

