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
  /** What must hold: rules() lists what breaks them, the map marks it, and umlimator.py check fails on it. */
  rules?: Rule[];
  /** Narrated walk-throughs of the map (#69): handle.play(id), the standalone page's Stories menu, umlimator.py record. */
  stories?: Story[];
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
  /** E or Alt + click on a stacked card, or the ⤡ tab of the box it unfolded into (#71): before the card unfolds in place
   *  (expanded: true) or folds back (false). view: the card's inner view, which may not be in the model yet; the card
   *  unfolds once it is (the host loads it and calls update() right here, or later expand()). preventDefault(): no change. */
  expand: { target: Extract<Ref, { type: 'node' }>; view: string; expanded: boolean; preventDefault(): void };
  story: { story: string; step: number | null; steps: number };   // a story shows its step (0-based); step null: it ended
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
  /** Unfolds a stacked card of the view shown into a box in place (#71): its inner view's own cards inside, this view's
   *  lines to it moved onto them, the rest of the picture in its order. In this handle only, never in the model; kept per
   *  view across update(). False when it can't: no loaded inner view, nothing of its own inside, a numbered (sequence)
   *  view in or opened, an editable map. No expand event: that is for gestures. */
  expand(id: string): boolean;
  /** Folds an unfolded card back (and anything unfolded inside it). False when it was not unfolded. */
  collapse(id: string): boolean;
  readonly expanded: string[];       // the cards unfolded on the view shown, in the order they were
  readonly view: string | null;
  readonly selection: Ref | null;   // the latest selected
  readonly selected: Ref[];          // every selected thing (Shift / Cmd / Ctrl + click adds cards), the latest last
  /** Sets (or, with null, removes) a named layer of marks, drawn over the picture without touching the model. Layers stack
   *  in the order first set: each property comes from the latest layer that sets it, and a card or line is as lit as its
   *  lowest level. They survive update() and setView(); ids the view doesn't show are ignored. toSVG() and toPNG() draw them. */
  overlay(name: string, layer: Overlay | null): void;
  /** The 'highlight' layer: these cards and lines lit, the rest dimmed (in place of the selection's dimming), or null to clear.
   *  A Ref's level (0 to 1), else its distance (as reach() gives it), fades it. A chip's or badge's Ref lights its card. */
  highlight(refs: Lit[] | null): void;
  /** The tour dot rides the line between each pair of cards in turn (either way), through each card to its next line; a card
   *  it reaches flashes, and a pair with no line between them is skipped. Resolves true at the end, false when cut short (a
   *  new tour or replay, tour(null), a new picture of the view, destroy()). With reduced motion it resolves at once.
   *  speed: map units a second (default 240). */
  tour(path: string[] | null, options?: { speed?: number }): Promise<boolean>;
  /** Plays a trace: each call from one card to another (a span and its parent's) runs along their line at the trace's relative
   *  time; the line glows while the call lasts and keeps its duration as a label (the 'replay' layer, until stop() or the next
   *  replay). A span's service names its card: through `match`, else as a card's id, else as its label (any case).
   *  duration: the whole trace's playing time in ms (default 6000). With reduced motion the labels appear at once. */
  replay(spans: Span[], options?: { match?: Record<string, string>; duration?: number }): Replay;
  /** Tells one of the model's stories (#69): each step in turn sets the view, camera, selection, highlight and caption
   *  (drawn in a bar on the map and said to screen readers), then plays its tour. auto (default true): the next step
   *  follows once a step's duration is up and its tour has ended. step: where to start (0-based). The bar and the keys
   *  (← → PageUp PageDown, Esc) step through and stop it. null when the model has no story `id` with steps. */
  play(id: string, options?: { step?: number; auto?: boolean }): StoryPlayer | null;
  destroy(): void;
}

/** A walk-through: its steps, in order. */
export interface Story { id: string; title?: string; steps: StoryStep[] }
/** What one step shows. select: a card id, a line id, or a Ref. highlight: card ids, line ids or Lits; the lines between
 *  two cards it names light too. tour: card ids, the dot's path. camera: 'fit' (the default), a point and zoom, or a card
 *  to frame. duration: the step's time in ms when playing (default 4000; its tour runs to its end first). */
export interface StoryStep {
  view: string; caption?: string; select?: string | Ref; highlight?: (string | Lit)[]; tour?: string[];
  camera?: 'fit' | { x: number; y: number; zoom?: number } | { card: string; zoom?: number }; duration?: number;
}
/** A story being told. step: the one shown (0-based). next() past the last step ends it (done: true); stop() closes it
 *  (done: false). */
export interface StoryPlayer {
  readonly story: string; readonly step: number; readonly steps: number; readonly playing: boolean; readonly done: Promise<boolean>;
  next(): void; prev(): void; pause(): void; resume(): void; stop(): void;
}

/** A mark on a card. tone: a palette name (--um-<tone>), drawn as a ring; badge: a tab after the card's own; level: 0 to 1. */
export interface CardMark { tone?: string; badge?: Badge; pulse?: boolean; level?: number }
/** A mark on a line. speed: its flow's speed, as a factor (0 stops it); tone: a glow under it; label: a pill under its own;
 *  dash: drawn dashed; level: 0 to 1. A drawn line that stands for several edges takes the strongest of their marks. */
export interface LineMark { tone?: string; speed?: number; pulse?: boolean; label?: string; level?: number; dash?: boolean }
/** A layer of marks: cards by node id, lines by edge id ("<from>-><to>#<n>" for an edge without one, as Refs name it).
 *  dim: what the layer doesn't name fades. */
export interface Overlay { nodes?: Record<string, CardMark>; edges?: Record<string, LineMark>; dim?: boolean }
/** A Ref for highlight(), with how lit it is: level (0 to 1), else distance (each step out a little fainter). */
export type Lit = Ref & { level?: number; distance?: number };
/** A span of a trace: start and end in milliseconds; service names the card it ran in; parent is its caller's span id. */
export interface Span { id: string; parent?: string | null; service: string; start: number; end: number; name?: string }
/** A replay in progress. hops: the calls it plays; skipped: spans whose service has no card on the view, or whose call has
 *  no line there. done: true when it played to the end, false when stopped or cut short. */
export interface Replay { readonly hops: number; readonly skipped: number; readonly done: Promise<boolean>; pause(): void; resume(): void; stop(): void }

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
/** expand: cards of the view unfolded in place (#71), as handle.expand() draws them; the geometry's `unfolded` lists those
 *  that did (one inside another after it), and its `families` the boxes they became (`unfolds`: the inner view). */
export function layout(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number; expand?: string[] }): Geometry & { unfolded?: string[] };
/** A model's own problem. path says where: "views[2].nodeIds[4]". Errors draw as holes or not at all (missing,
 *  repeated or dangling ids, a box inside itself); warnings draw other than they say (an unknown kind, weight or side,
 *  a view a card opens that the host has not loaded yet). The JSON Schema is umlimator/schema.json. */
export interface Problem { level: 'error' | 'warning'; path: string; message: string }
export function validate(model: MapModel): Problem[];
/** One issue of the layout check: its message, as the page's check words it, and the cards, lines and boxes it is about
 *  (exactly those, even where two cards share a label). */
export interface CheckIssue { message: string; targets: Ref[] }
/** The layout check's geometry for one view, on layout()'s geometry: no browser needed. The page's check (CLI) adds what
 *  it measures in the DOM (text overflowing its card, titles, edge labels on cards or each other). In Node, text widths
 *  are an estimate unless `measure` is given, so the layout, and what is found, can differ from a browser's. */
export function check(model: MapModel, viewId: string, options?: { repair?: boolean; measure?: (text: string, px: number) => number; expand?: string[] }): CheckIssue[];
/** Picks cards by id, kind (as the map draws it: "db" picks databases) or box (at any depth), each a value or a list;
 *  every key given must hold, and `not` turns a selector round. A line's end on a box is that box: in it, of no kind. */
export interface Selector { id?: string | string[]; kind?: string | string[]; container?: string | string[]; not?: Selector }
/** What the model says must hold (`model.rules`): no line from the cards `from` picks to the cards `to` picks (a side left
 *  out picks every card), or, with noCycles, no boxes that reach each other through their lines (a line counts between
 *  the two boxes that hold its ends right under the box they share). A rule that names a box (a container, or a box's
 *  id, in from, to or a not) holds only in the views that draw one of the boxes it names; any other, in every view.
 *  `views` narrows that further. */
export interface Rule { id: string; title?: string; views?: string[]; from?: Selector; to?: Selector; noCycles?: boolean }
/** A rule broken in a view: its message (as umlimator.py check prints it), and the lines, and for a cycle the boxes, it is
 *  about. The map draws those lines rose, with a mark that names the rule. */
export interface RuleBreak { rule: string; view: string; message: string; targets: Ref[] }
/** Every rule the model breaks, view by view. No browser needed. */
export function rules(model: MapModel): RuleBreak[];
/** Every card and line on a path from one card to another along the view's lines, as Refs ([] when none joins them). */
export function paths(model: MapModel, viewId: string, from: string, to: string): Ref[];
/** What a card's lines lead to, or (backward) what leads to it, as Refs with their distance in lines; the card first, at 0. */
export function reach(model: MapModel, viewId: string, from: string, options?: { backward?: boolean; depth?: number }): (Ref & { distance: number })[];
/** A view in plain sentences: cards and kinds, boxes, what each card's lines do, cards with no line. Deterministic. */
export function describe(model: MapModel, viewId: string): string;
/** The spans of an OpenTelemetry trace in OTLP JSON (resourceSpans), as replay() takes them. */
export function otlpSpans(otlp: unknown): Span[];
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
