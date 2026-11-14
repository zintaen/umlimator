# Conformance: the flowchart

Release 0.24.0 (milestone 2, `docs/diagrams/notes/milestone-2.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below, and **read** and **write** Mermaid's flowchart (`--typed` on the CLI's import; without
it a Mermaid flowchart is still imported as a map).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"flowchart"` is a flowchart. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 21; the example is
[`examples/returns-flowchart.json`](../../examples/returns-flowchart.json).

## The subset

Ten symbols, the common ones of ISO 5807 and of tools' flowcharts. Laid out down unless the view says `right`; any
other direction is drawn right, as the core warns.

| Symbol | In the model | Drawn as |
|---|---|---|
| Terminator | `flow.Terminator` | a stadium; a start has no flow in, an end no flow out |
| Process | `flow.Process` | a rectangle |
| Decision | `flow.Decision` | a diamond, its text on two lines; its exits are labelled flows |
| Input/output | `flow.InputOutput` | a parallelogram leaning right |
| Predefined process | `flow.PredefinedProcess` | a rectangle with a second line inside each side |
| Document | `flow.Document` | a rectangle with a wavy bottom |
| Database | `flow.Database` | the map's cylinder |
| Manual input | `flow.ManualInput` | a rectangle with its top sloping up to the right |
| Delay | `flow.Delay` | a D |
| Connector | `flow.Connector` | a circle with its label (one or two characters), 28 to 40 px across; with flows in and out, a junction |
| Flow | `flow.Flow` | a solid line with a filled arrow, its label beside it |
| Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

Rules (`src/flowchart/flowchart.js`): error `flow-ends`; warnings `start-end` (one start, an end at least),
`terminator-flows`, `decision-exits` (two exits or more, each labelled, no two alike, compared trimmed and case aside),
`reachable`. A node of another type in a flowchart view is drawn as a process, with no rule.

**Departures:** no claim of ISO 5807 conformance: the standard is paywalled and was not read; the symbols' names are
from secondary sources. The database symbol is a cylinder, as common tools draw it (ISO 5807's direct access storage is
the nearest); the delay is not an ISO 5807 symbol but ANSI's and Mermaid's convention.

## Left out

`notes/milestone-2.md` §13: ISO 5807's symbols beyond these ten (stored data, internal storage, sequential access
storage, display, card, punched tape, manual operation, preparation, parallel mode, loop limit, annotation, ellipsis)
and its special lines; the off-page connector; swimlanes; groups (Mermaid's subgraphs, read and skipped). And copy and
paste, per-type `diff()` writers, deleting a view.

Layout limits, measured on `examples/returns-flowchart.json` and `tests/flowchart-stress.json`:

- Port repair and rerouting off (`repair: false`, `reroute: false`, §11).
- The example lays out clean down, right, and down with no direction: `check()` finds nothing.
- `tests/m2-fixtures.test.mjs` pins the stress file. Its `edge-cases` view (every symbol, two starts, a decision with
  three exits, a loop back, a connector as a junction, a 130-character label, a node no start reaches) is clean both
  ways. Its generated `all` view (60 nodes, 70 flows) crosses 4 times each way; no line runs through a node.
- A label is wrapped to three lines of 180 px, then cut with an ellipsis; its whole text is in the node's accessible
  name, `describe()` and the PDF.

## Writers: what each shows of a flowchart

Measured on `examples/returns-flowchart.json` (0.24.0); the PDF's text read back by `tests/cli.py`.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| The ten symbols, flows and their labels | Yes | Yes | Yes, in vectors |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept; the lines' `<title>` removed | None | None |
| Tables | None | None | "Elements": each node's symbol name. "Lines": each flow's label; a decision's exit with no label says so (the type's `text`) |
| Mermaid flowchart (`writeMermaidFlowchart`) | | | Each symbol in Mermaid's `@{ shape: … }` form, flows and their labels, ids in `%% id:` comments |

## Accessibility

Every piece has a name: "Decision Fit for resale?, exits yes to Refund the payment, no to Rejection letter"; "Terminator
Returned parcel arrives, a start". The reading order runs from the start along the flows, one exit's branch to its end
before the next; then the lines. Text reads at 4.5:1, lines and outlines at 3:1 in both themes (`tests/flowchart.html`,
`tests/m2.html`). Every gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/m2-fixtures.test.mjs` on `tests/flowchart-stress.json`'s `all` view (60 nodes, 70 flows), CPU time, best of seven
after a warm-up, on an Apple laptop under other agents' load (14 Nov 2026): a full layout and its SVG 33 to 67 ms; a
decision's label set, laid out and drawn, 31 to 63 ms (two runs). CI holds 1 s and prints the figures against the 100 ms target.

## Tests

`tests/flowchart.test.mjs` and `tests/flowchart.html` (the shapes, the rules each passing and failing, connect and
moveTo, a 30-step session, every gesture by pointer and key); `tests/flowchart-minimal.json` and
`tests/flowchart-stress.json` with `tests/m2-fixtures.test.mjs` and `tests/m2.html`; `tests/mermaid-flowchart.test.mjs`
(the reader and writer, the construct file read as the Python importer reads it); `tests/import.py` (`--typed`);
`tests/cli.py`; `tests/mcp.py`; `tests/atlas.test.mjs` (the returns flowchart, opened from the C4 context's shop staff).
