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
  - a card put into or taken out of a view is marked in that view only (`nodeOverrides`).

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
  - `umlimator.py diff --base REF --out DIR [--models PATHSPEC...]` does that for every map model the working tree
    changed since a git ref. It also writes `summary.md`: the summary per file, with a mermaid sketch of the cards that
    changed and their neighbours.
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

## 0.13.0: (unreleased)

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
    with description and technology; flat and hierarchical identifiers. Views: `systemLandscape`, `systemContext`,
    `container` and `component`, with `include *` (or element ids), `exclude`, `title` and `description`.
  - **C4-PlantUML:** `Person`, `System`, `Container` and `Component`, each with `Db`, `Queue` and `_Ext`; `Rel` and
    `Rel_*` (their direction hints are left to the layout), `Rel_Back` (the other way) and `BiRel` (both ways);
    `Boundary`, `Enterprise_Boundary`, `System_Boundary` and `Container_Boundary` as boxes, nested; `title`. Arguments
    may be named (`$tags=…`). Layout and style macros (`Lay_*`, `LAYOUT_*`, `SHOW_*`, `HIDE_*`, `Update*`, `Add*Tag`),
    `skinparam` and the C4 library's `!include` are skipped quietly.
  - **Mermaid:** `flowchart` and `graph`: nodes with their labels and shapes, links with labels (`-->|x|`, `-- x -->`),
    chains and `a & b`, and `subgraph` as boxes, nested. As in Mermaid, a node belongs to the first subgraph that names
    it, and a link to a subgraph's id ends on its box. A dotted link is an async line, a thick one a heavier line.
    The front matter's `title` is the map's. `C4Context`, `C4Container` and `C4Component` read as C4-PlantUML does.
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
  | A person (`person`, `Person`) | `frontend`, with a person icon; `external` for `Person_Ext` or an `External` tag |
  | A software system (`softwareSystem`, `System`) | `backend`; `external` for `_Ext` or an `External` tag |
  | A database: a `Db` macro, a `Database` tag, a cylinder `[(…)]`, an image such as `postgres` | `database` |
  | A queue: a `Queue` macro, a `Queue` tag, an image such as `rabbitmq` or `kafka` | `queue` |
  | A container, component, node, service or workload | from its words: a store or cache is `database`, a broker `queue`, sign-in `security`, an LLM `ai`, a proxy or monitoring `cloud`, an app or UI `frontend`, a document `file`; `backend` otherwise (a StatefulSet: `database`) |
  | A Kubernetes Service or Ingress | `cloud`; a Service of type `ExternalName` is `external` |

- **Text:** a name is the card's label, its technology (or else its C4 type) the line under it, and its description the
  details panel. A relationship's description is the line's label, its technology the second line. A label longer than
  the map keeps (34 characters on a card, 28 on a line) is cut at a word, and the panel has it whole.
- **Views:**
  - **Structurizr:** its own views. A container view boxes its system's containers, and a component view its container's
    components. A relationship between elements a view doesn't show lifts to the nearest ones it does, an implied line as
    Structurizr draws it, unless a relationship joins those two already (`!impliedRelationships false` turns this off).
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
  - Structurizr groups (their members are imported, the group isn't drawn), deployment, dynamic and filtered views,
    `!include`, `!ref`, `!extend`, constants, styles and themes;
  - C4 deployment nodes and dynamic diagrams (`RelIndex`);
  - Mermaid's `@{ … }` shapes and its other diagram types;
  - compose's volumes, configs and secrets, and Kubernetes' other kinds (ConfigMaps, Jobs, CronJobs…);
  - layout hints (`autolayout`, `Rel_U`, `Lay_R`), since the map lays out each view itself.

  An imported map gets the layout check as any model does. A large diagram may need a `layout`, or a line's
  `fromSide` and `toSide`, set by hand.
- **Tests:** `tests/import.py` imports the sample of each format in `tests/import/`, checks the cards, boxes, lines, views
  and the list of what isn't imported, and that `validate()` finds nothing, the model renders, and its layout check is
  clean. CI runs it.

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
