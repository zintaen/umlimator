# Conformance: the UML interaction overview diagram

Release 0.21.0 (stage 4, `docs/diagrams/notes/stage-4.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no interaction overview notation, and there is no XMI and no
UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.interaction-overview"` is an interaction
overview diagram. It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines;
`lib/umlimator.js`, what a map host loads, draws it as plain cards with a warning. The vocabulary is
`docs/diagrams/model.md` §2, row 13; the example is [`examples/buy-book-overview.json`](../../examples/buy-book-overview.json),
whose sequence views are in the same model.

## The subset, and UML 2.5.1's clauses

UML 2.5.1 §17.10 builds the interaction overview diagram from activity notation:

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 17.7 InteractionUse | `uml.InteractionUse`; `opensView` a `uml.sequence` view | a box with `ref` in its tag and its name; Enter or a double-click opens its view |
| 17.10 Interaction (inline) | `uml.Interaction`; `opensView` a `uml.sequence` view | an `sd` frame with the sequence diagram drawn inside at full size, read only (heads, stems, bars, messages, fragments' tags and guards, interaction uses); above 8 lifelines or 20 messages, the frame and its name only, with the warning `inline-size` |
| 15.3 InitialNode, ActivityFinalNode, FlowFinalNode, DecisionNode, MergeNode, ForkNode, JoinNode | the activity's control nodes | as in the activity diagram: circles, a diamond that holds a decision's question (a deviation from UML), a bar |
| 15.2 ControlFlow | `uml.ControlFlow`; `label` the name, `props.guard` | a solid line with an open arrowhead, labelled `name [guard]`, cut at 280 px |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-4.md` §11.3): the activity's shared
flow rules (`flow-ends`, `initial-flows`, `final-flows`, `fork-join`, `decision-merge`, `decision-guards`);
`opens-sequence` (an error); `overview-kinds`, `comment-link`, `inline-size` (warnings). A line of another kind in the
view is not drawn, and is warned of.

## Left out

`notes/stage-4.md` §18: editing an inline interaction in place (it is opened); the diagram's own `sd` frame and its
`lifelines` clause; duration and time constraints (stage 6); partitions; an interaction use's arguments and return
value; inline interactions of other kinds than a sequence. And for all four stage 4 types: XMI, copy and paste, per-type
`diff()` writers.

Layout limits, measured on `examples/buy-book-overview.json` and `tests/overview-stress.json`:

- Port repair is off (`notes/stage-4.md` §17). The example has no crossing either way; `tests/overview-stress.json` has
  none and one in its `edge-cases` view, and none and three in its `all` view (40 nodes, 50 flows, 10 inline
  interactions), where, laid out down, three guards `[in stock]` lie on the next decision's line. Pinned in
  `tests/stage4-fixtures.test.mjs`.
- The column gap is one for every column, twice the widest guard and 26 px: one long guard widens them all (the example
  laid out right is 3,503 px wide). A gap per column needs an option of the layout that does not exist yet; the
  maintainer accepted the uniform gap for 0.21.0 (13 Nov 2026).

## Writers: what each shows of an interaction overview diagram

Measured on `examples/buy-book-overview.json` (0.21.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. Each file was opened and looked at.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Control nodes, interaction uses, the inline interaction's frame and its sequence diagram | Yes | Yes | Yes, in vectors |
| Flows, open arrowheads, guards | Yes | Yes | Yes |
| The legend of node kinds | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept (the inline interaction's counts its lifelines and messages); the flows' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each node by its kind ("Interaction use", "Interaction", "Decision node"); "Lines": each flow from → to and its kind; then each sequence view it opens, with its own pages and tables. **Gap:** a flow's guard is not in its row (the table reads a line's `label` only; `risks.md` R9) |

## Accessibility

Every piece has a name: "Interaction use Find a book, opens Find a book", "Inline interaction Queue the order, 3
lifelines, 3 messages", "Decision Payment accepted?, 2 exits", "Join, 2 branches". Tab reads the nodes by rank, then the
flows; the inline interaction's markup has no node, hit area or key ring of its own, so the canvas sees one node.
`describe()` starts at the initial nodes and follows the flows breadth first. Text reads at 4.5:1 and lines and
outlines at 3:1 on the stage in both themes (`tests/overview.html`, `tests/stage4.html`). Every editing gesture has a
key (`docs/editing.md`).

## Performance (P1)

`tests/stage4-fixtures.test.mjs` on `tests/overview-stress.json`'s `all` view (40 nodes, 50 flows, 10 inline
interactions of 6 lifelines and 12 messages), CPU time, best of three after a warm-up, on an Apple M5 laptop at a load
average of 6 to 8 (the idlest it got; 13 Nov 2026): a full layout and its SVG 8 to 10 ms, a guard 8 to 10 ms, a
stereotype 8 ms, against the 100 ms target; one inline time axis 0.03 ms, against 5 ms. CI holds 1 s for the edits and
prints the figures (the maintainer's decision of 13 Nov 2026).

## Tests

`tests/overview.test.mjs` and `tests/overview.html` (the type, its rules with the shared flow rules, the example and
its inline interaction under three fonts, both themes and both directions, opening a use, every gesture by pointer and
key, a 30-step session); `tests/flow.test.mjs` and `tests/flow.html` (the shared shapes and rules);
`tests/overview-minimal.json` and `tests/overview-stress.json` with `tests/stage4-fixtures.test.mjs` and
`tests/stage4.html` (`notes/stage-4.md` §16); `tests/notation.html` (open arrowheads on the outlines); `tests/cli.py`
(render, check, stills, pdf, the diff Action's step); `tests/mcp.py` (the MCP server's read tools and a highlight).
