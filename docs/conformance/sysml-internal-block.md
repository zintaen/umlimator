# Conformance: the SysML internal block diagram

Release 0.25.0 (milestone 3, `docs/diagrams/notes/milestone-3.md` §8). Support is claimed by level (decision D3): **render**
and **edit** on the subset below. No interchange: Mermaid has no internal block notation, and there is no XMI.

A view of a version-2 model whose `diagram` is `"sysml.internal-block"` is an internal block diagram, drawn by
`lib/umlimator-all.js` (`umlimator/all`); `lib/umlimator.js` draws it as plain cards with a warning. The vocabulary is
`docs/diagrams/model.md` §2, row 18; the example is [`examples/ebike-structure.json`](../../examples/ebike-structure.json),
inside the e-bike: the battery, controller, motor, two lights and the dock it refers to, wired by connectors carrying DC
power and phase current, opened from the block definition view's EBike (and from the parametric view's frame) in the
e-bike atlas.

## The subset, and SysML v1.7's clauses

SysML v1.7 (formal/24-01-07): clause 8 (blocks, connectors), clause 9 (ports, flow properties, interface blocks, item
flows), Annex A (the frame). The type projects its view onto the composite structure type (stage 5, `src/uml/composite.js`)
on a copy, filtered by view kind, and dresses the result (S11): the frame, port kinds and arrows, item flows.

| SysML v1.7 | In the model | Drawn as |
|---|---|---|
| Annex A, the frame | the view's `subject`, a block it lists in `nodeIds` | the subject's box is the frame, `ibd [Block] EBike [view title]`, its own ports on it |
| 8, part properties | `sysml.PartProperty` of the subject | a box `name : Type [mult]`, the ports of its type on its border |
| 8, reference properties | `sysml.ReferenceProperty` | a dashed box |
| 8, value properties | `sysml.ValueProperty` | a box `name : Type` |
| 9, proxy and full ports | `sysml.Port`, `props.kind`; `~` before the type conjugates it | a square on its owner's border, `«proxy» charge : ChargeInterface` beside it; typed by an interface block, an arrow inside from its flow properties (in, out, both), reversed when conjugated |
| 8, connectors | `sysml.Connector`, ends through parts (`ends.<end>.part`) | a solid line between ports |
| 9, item flows | `props.itemFlow`, `{ item, direction }` | the item as the line's label, a filled triangle on the middle segment pointing the way it flows |

Rules (`src/sysml/internal.js`), each with a passing and a failing fixture in `tests/internal-block.test.mjs`:

| Rule | Level | SysML v1.7 |
|---|---|---|
| `subject-block` | error (a warning for a view with no subject at all) | Annex A: an ibd's frame names a block |
| `connector-part`, `connector-scope`, `connector-drawn` | as the composite type's, re-said | clause 8, connectors: each end a port of the part's type, reached through that part, in the subject |
| `part-type` | warning | a part or reference property's type names one block of the model by label |
| `item-flow` | warning | clause 9, ItemFlow: an item, and a direction along the connector |
| `port-compatible` | warning | clause 9: two parts' proxy ports of one interface block meet conjugate (one `~`), unless every flow property is `inout` (flow directions are then opposite either way); a delegation joins ports of one type, conjugated alike |

**Departures from SysML v1.7:**

- **Items flow on the connector's middle**, one triangle per connector, whatever the number of items (one per connector in
  the subset). An item name the composite type's label placement finds no room for (a frame port with two delegations) is
  left off its line, its triangle drawn and `describe()` naming it.
- **A subject holding no part** (a block with ports only) is framed at its card's size, which the composite type sizes for
  its ports: the header is cut to it.
- **A connector joins members**, which the PDF's Lines table lists since 0.30.0 (`risks.md` R10) between the parts its
  ends are drawn on, each part named by its id (`ebike.battery`), not its drawn name; the subject's rows also name each
  connector with what it carries.

## Left out

`notes/milestone-3.md` §17: nested parts; full ports drawn as parts on the border; nested connector ends (property paths);
item properties; flow ports (deprecated since 1.3); connector properties; initial values compartments; binding connectors
on an ibd (they are the parametric view's). And copy and paste, XMI, a reader.

Layout limits, measured on `examples/ebike-structure.json` and `tests/internal-block-stress.json`:

- The composite type's geometry, `repair: false`, `reroute: false`. Every port sits centred on its owner's border.
- The example lays out clean right and down, in Node and in Chrome.
- The stress file's `edge-cases` view (item flows each way, a reference part, a value property, proxy, full and conjugated
  ports with flow arrows, two connectors on one port, a delegation to the frame's port, a part typed by no block, a
  connector through a part to a port its type lacks) crosses once right and twice down; `ec-ports-only` (a subject with
  ports and no parts) is clean, a frame with its ports on it. The generated `all` (30 parts, 60 connectors) crosses 16
  times right and 32 down, with one finding down (two lines sharing a track).

## Writers: what each shows of an internal block diagram

Measured on `examples/ebike-structure.json` (0.25.0); the PDF's text read back by `tests/cli.py`.

| | SVG | PNG | PDF | Mermaid |
|---|---|---|---|---|
| The frame, parts, ports, port arrows, item triangles | Yes | Yes | Yes, in vectors | No writer |
| The header | Cut to the frame | Cut | Cut | |
| Item names | The line's label (one with no room left off) | Yes | Yes; whole in the subject's rows | |
| The legend | No | No | Yes: connector, item flow, proxy and full port | |
| Accessible names | Kept on nodes, lines' `<title>` removed | None | None | |
| Tables | None | None | "Elements": the subject, its parts, references and values as rows, then each connector with what it carries ("Connector from power of battery to supply of controller, carrying DCPower from power to supply") | |

## Accessibility

Names: "Part battery: Battery [1], in EBike, 3 ports"; "Port charge: ChargeInterface of dock, conjugated, flow in and
out"; "Connector from power of battery to supply of controller, carrying DCPower from power to supply". Text at 4.5:1
(a port's name against the stage), lines and outlines at 3:1 in both themes (`tests/internal-block.html`,
`tests/sysml.html`); every gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/sysml-fixtures.test.mjs` on `tests/internal-block-stress.json`'s `all` (30 parts, 60 connectors), CPU, best of
seven after a warm-up, on a loaded Apple laptop (14 Nov 2026): a full layout and its SVG 43 ms; an item flow set 42 ms; a
part added 45 ms: under the 100 ms target. `tests/internal-block.test.mjs` prints the projection's own time beside them
(under 1 ms).

## Tests

`tests/internal-block.test.mjs`, `tests/internal-block.html` (on `tests/sysml-targets.json`'s 18, as M3.0 left it);
`tests/internal-block-minimal.json`, `tests/internal-block-stress.json` with `tests/sysml-fixtures.test.mjs` and
`tests/sysml.html`; `tests/sysml.test.mjs` (the projection); `tests/cli.py`; `tests/mcp.py`; `tests/ebike-atlas.test.mjs`.

**Gap:** the clause numbers inside clauses 8 and 9 were not quoted from SysML v1.7's PDF in this build (the file could not
be read here).
