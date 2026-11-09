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
export interface MapNode {
  id: string; label?: string; kind?: string; sublabel?: string; badge?: string; badges?: Badge[]; edited?: boolean; icon?: string; verbs?: string[];
  /** The view this card opens. It may name a view the host has not loaded yet: the card still looks stacked, and
   *  double-click, Enter on the selected card and a click on its ⤢ badge emit `open` with that id; the map goes in once
   *  the view is in the model (the host loads it, calls update(), then setView(), or calls update() in its open handler). */
  opensView?: string;
  /** The number on the ⤢ badge of a card whose view is not loaded yet (else ⤢ alone). A loaded view's cards are counted. */
  opensCount?: number;
  [key: string]: unknown;
}
/** What a line means, drawn as its colour: calls (the default), feeds (hands work on), triggers (suggests, offers, fires),
 *  state (reads or writes a file, board or config: a thinner line, a muted label, no flow) and guard (a hook steps in).
 *  Colours are --um-w-<kind>. An edge's `style` (emphasis, dashed, security) wins over its kind's colour. */
export type WireKind = 'calls' | 'feeds' | 'triggers' | 'state' | 'guard';
/** from / to: a card's id, or a container's id in the view (the line ends on its box's border). */
export interface MapEdge {
  id?: string; from: string; to: string; label?: string; edited?: boolean;
  /** The line's kind (default calls). A line that stands for several edges (A→B and B→A, parallel edges) takes the first
   *  kind they name, in model order. Nothing is guessed from the label unless the view has `kindsFromLabels`. */
  kind?: WireKind;
  /** How much the line stands for, drawn as its width: 1 (the default), 2 or 3 (about 1.8, 3.2 and 4.5 px), the arrowhead and
   *  hit line growing with it. The host picks the bucket (say under 10, under 100, 100 or more relations); anything else is 1.
   *  A line that stands for several edges takes the largest. */
  weight?: 1 | 2 | 3;
  /** A second, smaller line under the label (a technology, say), placed with it and counted in the room left for labels.
   *  Shown only with a label. A line that stands for several edges shows each of their sublabels, joined by " / ". */
  sublabel?: string;
  /** A style that wins over the kind's colour: emphasis (green), added (green, flowing), dashed or async (violet),
   *  security (rose, dashed), removed (rose, dashed, faded) or faded (its kind's colour, faint, with no flow). */
  style?: 'emphasis' | 'added' | 'dashed' | 'async' | 'security' | 'removed' | 'faded';
  /** A change mark: added and removed draw only with the matching `style` on a map; diff() sets both, and marks a
   *  changed line `edited`. */
  change?: 'added' | 'removed' | 'changed';
  /** What drift() found: undrawn (traffic ran on it, nobody drew it) or idle (drawn, carried nothing). */
  drift?: 'undrawn' | 'idle';
  [key: string]: unknown;
}
export interface MapView {
  id: string; parent?: string | null; title?: string; nodeIds: string[];
  edges?: (string | MapEdge)[]; layout?: Record<string, [number, number]>; repair?: boolean;
  /** Cards 80 px tall that show their sub-line and then their chips (`verbs`) on a third line. Default: 64 px, and a card's
   *  chips take its sub-line's place. A script card (no kind) shows no sub-line either way. */
  subAndChips?: boolean;
  /** Guess a line's kind from the words of its label ("reads" is state, "triggers" is triggers ...) when its edges name
   *  none. Off in render() and layout(), which draw no legend; the standalone page (mountPage) always guesses. */
  kindsFromLabels?: boolean;
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
  click: { target: Ref; event: MouseEvent | KeyboardEvent; preventDefault(): void };   // preventDefault(): the selection stays as it was (no select); Enter on a focused tab or chip is a click (KeyboardEvent)
  select: { target: Ref | null; targets: Ref[] };          // a chip or badge selects its card (a container's badge: its box); targets: every selected thing, the latest last
  open: { target: Ref; view: string; preventDefault(): void };   // view: the one the card opens, which may not be in the model yet
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
  /** update() eases into the next model: moved cards glide, new ones fade in, removed ones fade out (#67). Default true;
   *  never under prefers-reduced-motion. false draws the next model at once. */
  ease?: boolean;
  on?: { [K in keyof Events]?: (e: Events[K]) => void };
}

export interface ExportOptions { view?: string; scale?: number; fontCSS?: string }

export interface Handle {
  /** Draws the next model, redrawing only what changed and keeping the view, camera and selection. With motion it eases
   *  in (#67): moved cards glide from where they were, new cards and rerouted lines fade in, and what left fades out
   *  where it was; none of it with the option `ease: false` or under prefers-reduced-motion, and an export at any point
   *  draws where things end up. */
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
  /** Puts keyboard focus on the card or line `ref` names (a chip or badge: its card), by default the selected one, else on
   *  the map. The map's element delegates focus too: `host.focus()`, as a dialog does when it gives focus back, lands on
   *  the selected card or line. */
  focus(ref?: Ref | null): void;
  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): () => void;
  readonly view: string | null;
  readonly selection: Ref | null;   // the latest selected
  readonly selected: Ref[];          // every selected thing (Shift / Cmd / Ctrl + click adds cards), the latest last
  destroy(): void;
}

export interface Geometry {
  nodes: { id: string; x: number; y: number; w: number; h: number; [key: string]: unknown }[];
  edges: { from: string; to: string; ids: string[]; pts: [number, number][]; weight: 1 | 2 | 3; wk: WireKind;
    lbl: { x: number; y: number; w: number; h: number; text: string; sub?: string } | null; [key: string]: unknown }[];
  bounds: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
}

export function render(container: HTMLElement, model: MapModel, options?: RenderOptions): Handle;
/** Undo for a host: it pushes each model it applies, and hands undo() / redo() results to handle.update(). */
export interface History { readonly model: MapModel; readonly canUndo: boolean; readonly canRedo: boolean; push(m: MapModel): MapModel; undo(): MapModel; redo(): MapModel }
export function history(model: MapModel, limit?: number): History;
export function layout(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number }): Geometry;
/** A model's own problem. path says where: "views[2].nodeIds[4]". Errors draw as holes or not at all (missing,
 *  repeated or dangling ids, a box inside itself); warnings draw other than they say (an unknown kind, weight or side,
 *  a view a card opens that the host has not loaded yet). The JSON Schema is umlimator/schema.json. */
export interface Problem { level: 'error' | 'warning'; path: string; message: string }
export function validate(model: MapModel): Problem[];
/** One issue of the layout check: its message, as the page's check words it, and the cards and lines it names. */
export interface CheckIssue { message: string; targets: Ref[] }
/** The layout check's geometry for one view, on layout()'s geometry: no browser needed. The page's check (CLI) adds what
 *  it measures in the DOM (text overflowing its card, titles, edge labels on cards or each other). In Node, text widths
 *  are an estimate unless `measure` is given, so the layout, and what is found, can differ from a browser's. */
export function check(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number }): CheckIssue[];
/** What changed from one model to the next (#66), as one model to draw: `after`, with each card marked added, changed or
 *  removed (`change`: a NEW or CHANGED tab; REMOVED is faded, dashed and struck through) and each line likewise (`style`
 *  added or removed; a changed one `edited`); what left comes back in its views, boxes and places, and a card put into
 *  or taken out of a view is marked in that view only (`nodeOverrides`). Cards and lines match by id (a line without one
 *  by its ends, as a Ref names it). `summary`: what changed in words, in model order ("adds Payments queue between
 *  Trip service and Payment provider"); `views`: those that show a change. The marks are the model's own fields, so a
 *  page or still the CLI makes shows them. Neither input is changed. */
export interface DiffResult { model: MapModel; summary: string[]; views: string[] }
export function diff(before: MapModel | null, after: MapModel | null): DiffResult;
/** A call between two services as traffic showed it: { from, to, count }, or a Jaeger or Tempo dependency. */
export type Observed = { from: string; to: string; count?: number } | { parent: string; child: string; callCount?: number };
/** The map against the traffic seen (#68). A line that ran but is not drawn comes in (`drift: 'undrawn'`: rose, dashed,
 *  labelled "not drawn" with its calls); a drawn line between two cards traffic reached, that carried none, fades
 *  (`drift: 'idle'`, style `faded`); other lines are left as they are. A service is the card `match` names, else the one
 *  with its id, else with its label (case aside). `counts`: lines that carried traffic, came in, are idle, or could not
 *  be judged (an end traffic never reached), and the services with no card; `views`: those that show drift. The counts
 *  are of model edges, not drawn lines: a line that stands for several edges (A→B and B→A) fades only when every one of
 *  them is idle, so a map can show fewer faded lines than `idle` counts. */
export interface DriftResult { model: MapModel; counts: { carried: number; undrawn: number; idle: number; unknown: number; unmatched: string[] }; views: string[] }
export function drift(model: MapModel, observed: Observed[] | { data: Observed[] }, options?: { match?: Record<string, string> }): DriftResult;
/** The whole standalone viewer (top bar, views list, details panel, search, export) that umlimator.py writes. */
export function mountPage(container: HTMLElement, model: MapModel, options?: { params?: URLSearchParams; instant?: boolean }): Handle;
