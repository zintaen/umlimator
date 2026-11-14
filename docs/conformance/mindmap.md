# Conformance: the mindmap

Release 0.26.0 (milestone 4a, `docs/diagrams/notes/milestone-4a.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below, and **read** and **write** Mermaid's mindmap (`umlimator.py import` of a `.mmd` file).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"mindmap"` is a mindmap. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 25; the example is
[`examples/bookshop-opening-plan.json`](../../examples/bookshop-opening-plan.json).

## The subset

A mindmap has no standard, and this one claims none. It draws one tree, laid out left and right of its root by the tree
strategy (`src/layout/tree.js`, §6): each subtree takes a band, bands are stacked, a topic is centred on its children's band.

| Piece | In the model | Drawn as |
|---|---|---|
| Topic | `mindmap.Topic`; its tree by `parent` (a topic with none is a root) | a rounded box: the root 15 px, 600, the others 13 px; text wrapped to four lines of 200 px and cut with an ellipsis; its border in its branch's colour, its text always `--um-text` |
| Branch | the topic's `parent` (no line elements) | a cubic curve from the parent's edge to the child's, horizontal at both ends, 2.5 px from the root and 1.5 px below, each first-level branch in a colour of the map's kind palette, cycled |
| Order | the view's `nodeIds` | children in that order, top to bottom |
| Side | `present.<id>.side` on a first-level topic | that half; with none, the half whose first-level bands are shorter so far (right on a tie) |
| A topic that opens a view | `opensView` | the drill-down mark (⤢), the only typed node that draws one (other typed elements that open a view say so in their names: "…, opens <view>"); the topic 26 px wider for it |

Rules (`src/mindmap/mindmap.js`): error `topic-parent` (a topic's parent is a topic); warnings `mindmap-root` (one tree a
view: each further root is drawn as its own tree under the first), `side-first` (a side on a deeper topic is ignored),
`mindmap-depth` (past 64 levels: drawn, but a Mermaid reader writes it flat). No legend: a branch's colour means nothing.

**Mermaid** (`src/readers/mermaid-mindmap.js`, against Mermaid 12.3.0's mindmap page): indentation is the tree; the
shapes `( )`, `(( ))`, `)) ((`, `) (` and `{{ }}`, `::icon()`, `:::class` and Markdown strings are kept under
`ext.mermaid`, written back, reported `approximated` and drawn as the one topic look; `[ ]` is the topic itself. Front
matter's `title` is the model's, its `layout` reported `skipped`. Sides and drill-downs travel in `%% side:` and
`%% opens:` comments. Hostile input: over 1 MiB refused, deeper than 64 levels hung at 64, never a throw (§8.2).

**Departures:** no standard is followed; Mermaid's shapes are not drawn (decision 16).

## Left out

`notes/milestone-4a.md` §13: folding a branch in place (Delete hides it; undo or the outline's Show brings it back);
layouts down, radial or Mermaid's tidy tree; lines between topics other than the tree; an insertion bar while a topic
is dragged (the canvas has no hook for one, §7.3's As built). And XMI, copy and paste, per-type `diff()` writers.

Layout limits, measured on the example and `tests/mindmap-stress.json`: nothing meets, every text inside its topic, no
curve through a topic (sampled every 4 px), `check()` finds nothing. The `edge-cases` view (30 children, every branch on
one side, a 200-character topic, a hidden parent, two roots, a side on a second-level topic, a chain 70 deep, a topic
whose parent is a note) and the `all` view (300 topics, eight levels) lay out clean.

## Writers: what each shows of a mindmap

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Topics and branch curves, in their colours | Yes | Yes | Yes, in vectors |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each topic's `aria-label` kept | None | None |
| Tables | None | None | "Elements": each topic, "Topic", its depth and its parent |
| Mermaid mindmap (`writeMermaidMindmap`) | | | Two spaces a level in `nodeIds` order; kept shapes, icons, classes and Markdown as they came; a side as `%% side:`, an id the text would not give as `id[text]` or `%% id:`; a second root and topics past 64 levels named in `%% not written:` |

## Accessibility

Every topic has a name: "Topic Checkout, under Website, 2 subtopics"; "Topic Opening the bookshop, the root, 6
subtopics"; one that opens a view says which. The reading and Tab order is the root, its right branches, then its left,
each in pre-order; `describe()` is that outline. Text reads at 4.5:1, curves and borders at 3:1 in both themes
(`tests/mindmap.html`, `tests/m4a.html`). Every gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/m4a-fixtures.test.mjs` on `tests/mindmap-stress.json`'s `all` view (300 topics, eight levels, six first-level
branches), CPU time, best of five after a warm-up, on an Apple laptop under load (14 Nov 2026): a full layout and its SVG
1 to 2 ms; a topic renamed, added, moved to the other side and promoted, each 1 to 2 ms. `tests/mindmap.test.mjs` holds
Shift + Delete on a 20,000-topic chain. CI holds 1 s and prints each against the 100 ms target.

## Tests

`tests/tree.test.mjs` (the strategy); `tests/mindmap.test.mjs` and `tests/mindmap.html` (the definition, the rules each
passing and failing, every gesture by pointer and key, a 30-step session); `tests/mindmap-minimal.json` and
`tests/mindmap-stress.json` with `tests/m4a-fixtures.test.mjs` and `tests/m4a.html`; `tests/mermaid-mindmap.test.mjs`
(the reader and writer, 500 generated round trips, the hostile files); `tests/import.py`; `tests/cli.py` (render, check,
stills, pdf, import, the diff Action, map-repo's CLI); `tests/mcp.py`; `tests/notation.html` (the curves); `tests/atlas.test.mjs`
(the opening plan, a root view of the atlas).
