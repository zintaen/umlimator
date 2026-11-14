# Conformance: the SysML parametric diagram

Release 0.25.0 (milestone 3, `docs/diagrams/notes/milestone-3.md` §9). Support is claimed by level (decision D3): **render**
and **edit** on the subset below. No interchange, and no solving: the equations are text.

A view of a version-2 model whose `diagram` is `"sysml.parametric"` is a parametric diagram, drawn by
`lib/umlimator-all.js` (`umlimator/all`); `lib/umlimator.js` draws it as plain cards with a warning. The vocabulary is
`docs/diagrams/model.md` §2, row 19; the example is [`examples/ebike-range.json`](../../examples/ebike-range.json), the
e-bike's range in eco and boost from its battery's usable energy, opened from the range requirement in the e-bike atlas.

## The subset, and SysML v1.7's clauses

SysML v1.7 (formal/24-01-07): clause 10 (constraint blocks, constraint properties, parameters), clause 8 (binding
connectors, value properties), Annex A (the frame). The same projection as the internal block diagram's, onto the
composite structure type.

| SysML v1.7 | In the model | Drawn as |
|---|---|---|
| Annex A, the frame | the view's `subject`, a block or a constraint block | `par [Block] EBike [view title]`; a constraint block subject's own parameters on the frame |
| 10, constraint properties | `sysml.ConstraintProperty`, typed by a constraint block | a box with 10 px rounded corners, `eco : RangeEquation`, its block's expression `{range = energy / consumption}` under the name, cut to the box |
| 10, parameters | `sysml.ConstraintParameter` of the constraint block | squares on the constraint property's border, their names beside them |
| 8, value properties | `sysml.ValueProperty` of the subject | a plain box `ecoRange : Distance` |
| 8, binding connectors | `sysml.BindingConnector`, ends through constraint properties (`ends.to.part`) | a plain solid line, no ends |

Rules (`src/sysml/parametric.js`), each with a passing and a failing fixture in `tests/parametric.test.mjs`:

| Rule | Level | SysML v1.7 |
|---|---|---|
| `subject-kind` | error | Annex A: a par frame names a block or a constraint block |
| `binding-ends` | error | clause 10: a binding joins value properties and parameters, a parameter reached through a constraint property |
| `binding-parameter` | error | the parameter is one of the constraint property's type's |
| `binding-types` | warning | clause 8, BindingConnector: the two ends' types are the same or compatible |
| `parameter-bound` | warning | each parameter of a constraint property shown has a binding (what is usual) |
| `connector-drawn` | as the composite type's | a binding between two parameters of the subject is not drawn |

**Departures from SysML v1.7:**

- **Parameters** are drawn as stage 5's ports, their names outside the constraint property, where SysML puts them inside.
- **A constraint property's expression** is cut to the box, which is sized by its name (the composite type's part size);
  whole in its accessible name and the PDF's rows.
- **A binding drawn from a parameter** to a value runs from the value, so the parameter's constraint property is
  `ends.to.part` either way; one drawn to a constraint property's box is refused.
- **A subject holding no part** (a constraint block with only parameters) is framed at its card's size, the header cut to it.

## Left out

`notes/milestone-3.md` §17: nested connector ends (`battery.capacity`); solving or simulating the equations; parameters'
names inside the constraint property; the optional «equal» keyword; expressions in a language other than text. And copy
and paste, XMI, a reader.

Layout limits, measured on `examples/ebike-range.json` and `tests/parametric-stress.json`:

- The composite type's geometry, `repair: false`, `reroute: false`. A parameter's name the geometry places outside the
  frame is placed again inside it.
- The example lays out clean right and down, in Node and in Chrome.
- The stress file's `edge-cases` view (two constraint properties of one type, a parameter bound twice, an unbound
  parameter, a binding to a parameter the type lacks, a binding between two values, a 120-character expression, cut)
  crosses once, right and down. `ec-constraint-block` (a constraint block subject built from constraint properties of
  another, its parameters on the frame) is clean right; laid out down, one parameter on the frame's top crosses the
  header band with its line inward (a gap of the composite geometry's port sides, M3.5's, pinned). The generated `all`
  (16 constraint properties, 48 parameters, 30 values, 60 bindings) crosses 206 times right and 202 down, with 26 and 28
  findings of lines sharing a track.

## Writers: what each shows of a parametric diagram

Measured on `examples/ebike-range.json` (0.25.0); the PDF's text read back by `tests/cli.py`.

| | SVG | PNG | PDF | Mermaid |
|---|---|---|---|---|
| The frame, constraint properties, parameters, values, bindings | Yes | Yes | Yes, in vectors | No writer |
| Expressions | Cut to the box | Cut | Cut; whole in the Elements table | |
| The header | Cut to the frame | Cut | Cut | |
| The legend | No | No | Yes: binding | |
| Accessible names | Kept on nodes, lines' `<title>` removed | None | None | |
| Tables | None | None | "Elements": the subject's values and constraint properties as rows, then each binding by its ends ("Binding from value ecoRange to parameter range of eco") | |

## Accessibility

Names: "Constraint eco: RangeEquation {range = energy / consumption}, in EBike, 3 parameters"; "Parameter range: Distance
of eco"; "Binding from value ecoRange to parameter range of eco". Text at 4.5:1, lines and outlines at 3:1 in both themes
(`tests/parametric.html`, `tests/sysml.html`); every gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/sysml-fixtures.test.mjs` on `tests/parametric-stress.json`'s `all`, CPU, best of seven after a warm-up, on a loaded
Apple laptop (14 Nov 2026): a full layout and its SVG 101 ms; a binding added 80 ms; a constraint property's type changed
96 ms: about the 100 ms target, under CI's 1 s ceiling.

## Tests

`tests/parametric.test.mjs`, `tests/parametric.html` (on `tests/sysml-targets.json`'s 19, as M3.0 left it);
`tests/parametric-minimal.json`, `tests/parametric-stress.json` with `tests/sysml-fixtures.test.mjs` and `tests/sysml.html`;
`tests/sysml.test.mjs`; `tests/cli.py`; `tests/mcp.py`; `tests/ebike-atlas.test.mjs`.

**Gap:** the clause numbers inside clauses 8 and 10 were not quoted from SysML v1.7's PDF in this build (the file could not
be read here).
