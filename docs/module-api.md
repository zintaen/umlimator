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
    components. A group is a box in each view that shows one of its members, nested as the source nests it: inside the
    group around it, or inside the view's own box when it is in the view's system or container (whose box is in turn in
    that element's group). A relationship between elements a view doesn't show lifts to the nearest ones it does, an implied line as
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
  - Structurizr's deployment, dynamic and filtered views, `!include`, `!ref`, `!extend`, constants, styles and themes;
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

## 0.14.0: (unreleased)

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
  `el.map.state`. `umlimator.py mcp` is to read it with a `page_state()` tool, in the next wave.
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
