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
  readers). Each card is a focusable `button` whose name is its label, its sublabel, its badges and "edited", plus
  "(opens inner view)" when it has one; `aria-pressed` says whether it is selected.
- Keyboard: Tab reaches each card; arrow keys on a focused card move to the nearest card that way (on the empty canvas
  they still pan); Enter selects, and Enter again opens; Escape clears, then goes up a level.
- A polite live region announces each selection ("Billing, selected", "3 cards selected", "Line from A to B") and
  each view shown.
- Exported files (`toSVG`, `toPNG`, stills) are pictures: `role="img"` named after the view, nothing focusable.
- Contrast: the default palette (`lib/umlimator-theme.css`) meets WCAG AA in light and dark. Every text is at least
  4.5:1 on what it is drawn on (lowest: an amber badge in light, 4.87:1), and every line is at least 3:1 against the
  stage. `tests/contrast.html` checks this on the example map and on one with every change state and badge tone. A
  host that sets its own `--um-*` colours owns their contrast. The dimming of unrelated cards while one is selected is
  meant to recede, and is not checked.
- Not covered: lines and containers are reachable by pointer only.
