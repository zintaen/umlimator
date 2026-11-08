// Types for lib/umlimator.js (hand-written; the module is plain JavaScript). docs/module-api.md explains the API.

/** A map model: engine/references/schema.md § Map model, plus the README's umlimator fields. Never mutated. */
export interface MapModel {
  title?: string;
  root?: string;
  nodes: MapNode[];
  edges?: MapEdge[];
  views: MapView[];
  icons?: Record<string, { g?: string; src?: string; dark?: boolean }>;
  authors?: Record<string, { name?: string; url?: string; avatar?: string }>;
  [key: string]: unknown;
}
/** A badge: its text, and optionally a palette name for its colour (green, amber, rose, accent, violet ... : --um-<tone>). */
export type Badge = string | { text: string; tone?: string };
export interface MapNode { id: string; label?: string; kind?: string; sublabel?: string; badge?: string; badges?: Badge[]; edited?: boolean; icon?: string; verbs?: string[]; opensView?: string; [key: string]: unknown }
/** from / to: a card's id, or a container's id in the view (the line ends on its box's border). */
export interface MapEdge { id?: string; from: string; to: string; label?: string; edited?: boolean; [key: string]: unknown }
export interface MapView {
  id: string; parent?: string | null; title?: string; nodeIds: string[];
  edges?: (string | MapEdge)[]; layout?: Record<string, [number, number]>; repair?: boolean;
  /** Cards 80 px tall that show their sub-line and then their chips (`verbs`) on a third line. Default: 64 px, and a card's
   *  chips take its sub-line's place. A script card (no kind) shows no sub-line either way. */
  subAndChips?: boolean;
  containers?: { id: string; label?: string; nodeIds?: string[]; parent?: string; badges?: Badge[] }[];   // badges: tabs on the box's border
  [key: string]: unknown;
}

/** What a click or selection is about, named by ids from the model. An edge without an id is "<from>-><to>#<n>". */
export type Ref =
  | { type: 'node'; id: string; view: string }
  | { type: 'edge'; ids: string[]; view: string }          // one drawn line can stand for several model edges
  | { type: 'container'; id: string; view: string }
  | { type: 'chip'; node: string; index: number; value: string; view: string }
  | { type: 'badge'; node: string; index: number; value: string; view: string }
  | { type: 'badge'; container: string; index: number; value: string; view: string };   // a container's badge

export interface Events {
  click: { target: Ref; event: MouseEvent; preventDefault(): void };   // preventDefault(): the selection stays as it was (no select)
  select: { target: Ref | null; targets: Ref[] };          // a chip or badge selects its card (a container's badge: its box); targets: every selected thing, the latest last
  open: { target: Ref; view: string; preventDefault(): void };
  viewchange: { view: string; from: string };
  change: Change;                                           // only with `editable`
}

/** Where the user dropped or placed something: a point in the view and, on a column view, its column and row. */
export interface Hint { x: number; y: number; col?: number; row?: number }
/** An edit the user asked for. Nothing changes until the host applies it and calls update(). */
export type Change = { id: string; view: string; hint?: Hint } & (
  | { op: 'add'; kind: 'node'; label: string; container?: string }
  | { op: 'add'; kind: 'edge'; from: string; to: string; label?: string }
  | { op: 'rename'; target: Ref; label: string }
  | { op: 'move'; target: Extract<Ref, { type: 'node' }>; to: string | null }
  | { op: 'delete'; target: Ref }
  | { op: 'reorder'; target: Ref; index: number });

export interface RenderOptions {
  view?: string;                 // default: model.root, else the view with no parent
  select?: Ref | null;
  controls?: boolean;            // up / zoom / fit / 1:1 / flow buttons (default true)
  minimap?: boolean;             // default false
  flow?: boolean;                // animated flow along lines (default: on unless prefers-reduced-motion)
  /** Text widths: default the host's font (--um-sans, measured on a canvas); false: a font-independent estimate. */
  measure?: false | ((text: string, px: number) => number);
  /** Edit gestures that emit `change` events: all of them, or only those set true. Off by default. */
  editable?: boolean | { add?: boolean; rename?: boolean; move?: boolean; delete?: boolean; reorder?: boolean };
  /** Cards keep their places across update() (in this handle only, never in the model). Default true. */
  stableLayout?: boolean;
  on?: { [K in keyof Events]?: (e: Events[K]) => void };
}

export interface ExportOptions { view?: string; scale?: number; fontCSS?: string }

export interface Handle {
  update(model: MapModel): void;
  setView(id: string): Promise<void> | void;
  select(ref: Ref | null): void;
  fit(): void;
  /** A view (default: the one shown; another is drawn off screen) as a stand-alone SVG file: colours resolved from the
   *  host's CSS, drawn at rest (no selection, hover, flow or edit handles), `scale` × its natural size (default 1).
   *  `fontCSS`: the host's own @font-face rules (data: URLs) to carry into the file. No network, no headless browser.
   *  '' for an unknown or empty view, or a destroyed handle. */
  toSVG(options?: ExportOptions): string;
  /** The same picture as a PNG Blob, drawn on a canvas in the browser (default scale 2). null when there is nothing to draw. */
  toPNG(options?: ExportOptions): Promise<Blob | null>;
  /** Puts keyboard focus on the card `ref` names (a chip or badge: its card), by default the selected card, else on the
   *  map. The map's element delegates focus too: `host.focus()`, as a dialog does when it gives focus back, lands on
   *  the selected card. */
  focus(ref?: Ref | null): void;
  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): () => void;
  readonly view: string | null;
  readonly selection: Ref | null;   // the latest selected
  readonly selected: Ref[];          // every selected thing (Shift / Cmd / Ctrl + click adds cards), the latest last
  destroy(): void;
}

export interface Geometry {
  nodes: { id: string; x: number; y: number; w: number; h: number; [key: string]: unknown }[];
  edges: { from: string; to: string; ids: string[]; pts: [number, number][]; lbl: { x: number; y: number; w: number; h: number; text: string } | null; [key: string]: unknown }[];
  bounds: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
}

export function render(container: HTMLElement, model: MapModel, options?: RenderOptions): Handle;
/** Undo for a host: it pushes each model it applies, and hands undo() / redo() results to handle.update(). */
export interface History { readonly model: MapModel; readonly canUndo: boolean; readonly canRedo: boolean; push(m: MapModel): MapModel; undo(): MapModel; redo(): MapModel }
export function history(model: MapModel, limit?: number): History;
export function layout(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number }): Geometry;
/** The whole standalone viewer (top bar, views list, details panel, search, export) that umlimator.py writes. */
export function mountPage(container: HTMLElement, model: MapModel, options?: { params?: URLSearchParams; instant?: boolean }): Handle;
