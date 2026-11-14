# Conformance: the data flow diagram

Release 0.24.0 (milestone 2, `docs/diagrams/notes/milestone-2.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below, with levels made by `D` and checked for balance. No interchange: Mermaid has no data
flow diagram.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"dfd"` is a data flow diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 22; the example is
[`examples/bookshop-data-flow.json`](../../examples/bookshop-data-flow.json), two levels.

## The subset

Two symbol sets on one geometry, after Yourdon (the default) and Gane and Sarson; the view's `notation` picks one, and a
switch repaints and lays nothing out (§4.3).

| Concept | In the model | Yourdon | Gane and Sarson |
|---|---|---|---|
| Process | `dfd.Process`; `props.number` (`1`, `1.2`) | an ellipse sized to its text, its number above its name | a rounded rectangle, its number in a top band |
| Data store | `dfd.DataStore`; `props.number` (`D1`) | two lines, the name between, the number before it | an open rectangle with an id box |
| External entity | `dfd.ExternalEntity` | a rectangle | a rectangle with a 4 px shadow inside its box |
| Data flow | `dfd.DataFlow` | a solid line with a filled arrow, its label cut at 280 px | the same |
| Level | a process's `opensView` names a `dfd` view whose `parent` is the view the process is on | | |
| Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line | the same |

`D` on a selected process that opens no view makes its level in one transaction: a new view holding the far ends of the
process's flows and one child process numbered `<n>.1` (the next free), each flow copied to it, so the level balances
from the start; Enter opens it.

Rules (`src/dfd/dfd.js`), run once on the whole model: error `dfd-balance` (a level's flows across its edge match its
process's flows by label, far end and direction; a local store does not count; the error names the missing flow);
warnings `dfd-flow-process` (a flow with no process at either end), `dfd-process-io`, `dfd-flow-label`, `dfd-numbers`
(numbered under the parent's number, none twice), `dfd-level` (a process opens a dfd view whose parent shows it; also a
level two processes open, a view its own parent, a level showing its own process).

**Departures:** no claim of Yourdon or Gane and Sarson conformance; Yourdon's process is an ellipse sized to its text.
"A flow touches a process" is a warning, as later teaching material puts it. Balancing is by label: a flow that splits
or joins between levels is not matched (§6.4).

## Left out

`notes/milestone-2.md` §13: unfolding a level in place (a level opens, §6.3); data dictionaries; flows that split or
join between levels; control flows and control processes (Ward and Mellor); Gane and Sarson's location band. And copy
and paste, per-type `diff()` writers, deleting a view.

Layout limits, measured on `examples/bookshop-data-flow.json` and `tests/dfd-stress.json`:

- Port repair and rerouting off (`repair: false`, `reroute: false`, §11); `gap` 64, `rgap` 56.
- The example's level 1 keeps 2 crossings in each direction and notation (Node's `check()`; Chrome counts 2 too, the
  CI loop's pin); level 2 none. `check()` finds nothing else.
- `tests/m2-fixtures.test.mjs` pins the stress file. Its `edge-cases` levels are clean but for the second level's 2
  crossings right and 1 down, in both notations; its generated `all` view (50 nodes, 60 flows) is clean both ways.
- Deleting or hiding an external entity or store a level and its parent both show leaves `dfd-balance` on the
  process: the type's `remove` hook does not yet follow it onto the other level (`risks.md` M15).
- A long number is cut at 160 px, as a name wraps there.

## Writers: what each shows of a data flow diagram

Measured on `examples/bookshop-data-flow.json` (0.24.0); the PDF's text read back by `tests/cli.py`.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Processes, stores, entities and flows, in the view's notation | Yes | Yes | Yes, in vectors, each level on a page of its own |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept; the lines' `<title>` removed | None | None |
| Tables | None | None | "Elements": each element's word (Process, Data store, External entity) and, for a process, its number and the level it opens. "Lines": each flow's label |

## Accessibility

Every piece has a name: "Process 1 Take order, opens level 1 Take order, 2 flows in, 2 out"; "Data flow shipping notice
from 3 Ship order to Customer". Text reads at 4.5:1, lines and outlines at 3:1 in both themes and notations
(`tests/dfd.html`, `tests/m2.html`). Every gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/m2-fixtures.test.mjs` on `tests/dfd-stress.json`'s `all` view (50 nodes, 60 flows), CPU time, best of seven after
a warm-up, on an Apple laptop under other agents' load (14 Nov 2026): a full layout and its SVG 38 to 59 ms; a flow's label
set, laid out and drawn, 37 to 63 ms (two runs). CI holds 1 s and prints the figures against the 100 ms target.

## Tests

`tests/dfd.test.mjs` and `tests/dfd.html` (both skins, numbers, balancing, `D`, the rules each passing and failing, a
30-step session, every gesture by pointer and key); `tests/dfd-minimal.json` and `tests/dfd-stress.json` with
`tests/m2-fixtures.test.mjs` and `tests/m2.html` (three levels, the third unbalanced, a level made by `D`, both
notations); `tests/cli.py`; `tests/mcp.py`; `tests/atlas.test.mjs` (the data flow, opened from the C4 component view's
order store).
