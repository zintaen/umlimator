# Conformance: the UML information flow diagram

Release 0.24.0 (milestone 2, `docs/diagrams/notes/milestone-2.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below. No interchange: Mermaid has no information flow notation, and there is no XMI.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.information-flow"` is an information flow
diagram. It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what
a map host loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 15; the
example is [`examples/order-information-flow.json`](../../examples/order-information-flow.json), whose storefront, Shop
API and payment provider are the component example's and whose shopper is the use case example's (in the Bookshop
atlas, one element each).

## The subset, and UML 2.5.1's clauses

Information flow is UML 2.5.1 clause 20 (`InformationFlow`, `InformationItem`), drawn as its own view type: it is not one
of Annex A's fourteen diagram types, and tools list it as a diagram kind.

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 20.2 InformationItem | `uml.InformationItem` | a classifier with a small filled triangle in its top right corner |
| 20.2 InformationFlow | `uml.InformationFlow`; `props.conveyed` (ids, a declared reference); `label` its name | a dashed line with an open arrow, labelled `«flow» name: Order, Card details`, cut at 280 px |
| its ends | `uml.Class`, `uml.Interface`, `uml.Component`, `uml.Actor` | the class, structure and use case types' looks, read only |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

Rules (`src/uml/information.js`), all errors, run once on the model: `conveyed-some` (UML: `conveyed` is 1..*),
`conveyed-kind` (UML 2.5.1's `convey_classifiers`: an information item, a class, an interface, a component or a signal of
the model), `conveyed-once` (a set), `flow-ends` (two classes, interfaces, components or actors, never an information
item or a comment). Deleting an element drops it from every `conveyed`; Shift + Delete also takes a flow left conveying
nothing, and says so.

**Departures from UML 2.5.1:** «flow» is drawn before the label on one line, not over it (a typed line has one label
line). A flow from an element to itself is allowed (UML does not forbid it); the PDF's lines table leaves it out, as it
does every type's. Clause numbers are as the note cites them.

## Left out

`notes/milestone-2.md` §13: flow ends other than classes, interfaces, components, actors and information items (UML also
allows nodes, artifacts, use cases, packages, properties, ports, activity nodes and partitions, and instance
specifications); the «flow» line on class, component and other UML views; `InformationItem.represented`; realizing
relationships, connectors and activity edges. And copy and paste, per-type `diff()` writers, a reader.

Layout limits, measured on `examples/order-information-flow.json` and `tests/information-flow-stress.json`:

- Port repair and rerouting off (`repair: false`, `reroute: false`, §11). A flow back over two columns or more (a reply
  closing a loop) leaves its source's bottom and comes into its target's bottom, a fixed side, not a search.
- The example lays out clean right and down: `check()` finds nothing.
- `tests/m2-fixtures.test.mjs` pins the stress file. Its `edge-cases` view crosses twice laid out right and is clean
  down. One label there, the flow conveying a gone id (`ec-gone`, an error), finds no room beside the class flow into
  the same box and is not drawn, right and down; the flow is, and its accessible name and the PDF say what it conveys.
  The generated `all` view (40 nodes, 60 flows, one to three items each) crosses 149 times right and 121 down, with one
  label on a line right and 18 findings down (labels on lines, lines sharing a line); no line runs through a node.
- A six-item label is cut with an ellipsis at 280 px.

## Writers: what each shows of an information flow diagram

Measured on `examples/order-information-flow.json` (0.24.0); the PDF's text read back by `tests/cli.py`.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Classifiers, actors, items and «flow» lines with what they convey | Yes | Yes | Yes, in vectors |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept; the lines' `<title>` removed | None | None |
| Tables | None | None | "Elements": each element's kind; an information item's (or a conveyed classifier's) row lists the flows that convey it. "Lines": what each flow conveys (the type's `text`), its name first |

## Accessibility

Every piece has a name: "Information flow from Shopper to Storefront, conveys Order and Card details". Text reads at
4.5:1, lines and outlines at 3:1 in both themes (`tests/information-flow.html`, `tests/m2.html`). Every gesture has a
key: L or the handle asks what a new flow conveys; F2 edits a flow's text as drawn (`docs/editing.md`).

## Performance (P1)

`tests/m2-fixtures.test.mjs` on `tests/information-flow-stress.json`'s `all` view (40 nodes, 60 flows), CPU time, best of
seven after a warm-up, on an Apple laptop under other agents' load (14 Nov 2026): a full layout and its SVG 118 to 211 ms;
a conveyed element added, laid out and drawn, 121 to 229 ms (two runs): over the 100 ms target (`tests/information-flow.test.mjs` measured
about 120 ms on a lighter load), under CI's 1 s ceiling, which the test holds and prints.

## Tests

`tests/information-flow.test.mjs` and `tests/information-flow.html` (the look, the rules each passing and failing, F2's
reading, Shift + Delete, a 30-step session, every gesture by pointer and key); `tests/information-flow-minimal.json` and
`tests/information-flow-stress.json` with `tests/m2-fixtures.test.mjs` and `tests/m2.html`; `tests/notation.html` (the
dashed open arrow, «flow» by each flow); `tests/cli.py`; `tests/mcp.py`; `tests/atlas.test.mjs` (opened from the C4
container view's storefront).
