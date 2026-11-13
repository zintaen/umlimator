# Conformance: the UML composite structure diagram

Release 0.22.0 (stage 5, `docs/diagrams/notes/stage-5.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no composite structure notation, and there is no XMI and no UML
diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.composite-structure"` is a composite
structure diagram. It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines;
`lib/umlimator.js` draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 4; the
example is [`examples/order-service-structure.json`](../../examples/order-service-structure.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 11.2 StructuredClassifier (the subject) | the view's `subject`: a `uml.Class`, `uml.Component` or `uml.Collaboration`, listed in `nodeIds` | a box with its name in the header room, holding its parts and collaboration uses; with neither, a node |
| 11.2 Property (a part) | a `uml.Property` member of the subject; `props.valueType` (the class or component of that label, M8), `multiplicity`, `aggregation` | a rectangle `name : Type [multiplicity]`; dashed when `shared` |
| 11.3 Port, on the subject and on a part | the subject's `uml.Port` members; a part shows every port of its type and every port its connectors reach through it | a 12 px square on the border, as the component diagram's; a port on a part is drawn under the id `<part>-><port>`, its side `present.<part>.ports.<port>.side` |
| 11.2 Connector | `uml.Connector`; an end is a part, a port of the subject, or a port reached through a part (`props.ends.<end>.part`, UML's `partWithPort`) | a plain solid line; from the subject's port inward, it enters the box at the port |
| 11.7 Collaboration | `uml.Collaboration`, its `uml.Property` members its roles | open (listed in `nodeIds` with roles): a dashed ellipse round its roles and the connectors between them, its name over a dashed line inside the top |
| 11.7 CollaborationUse | `uml.CollaborationUse`, `parent` the subject, `props.collaboration` (by label) | a dashed ellipse `name : Collaboration` |
| 11.7 role binding | `uml.RoleBinding`, from a part to a collaboration use, its `label` the role | dashed, no end, its role as the line's label |
| 7.8 Comment | `uml.Comment`, `uml.CommentLink` (to a node or a port) | a note, a dashed line |

Rules (`notes/stage-5.md` §10.2): `subject-shown`, `connector-part` (an end's part is a part of the subject and the end a
port of its type), `connector-scope` (a connector's ends lie in one structure; an end on the subject itself breaks it),
`binding-ends` (errors); `part-type` (a part's type names exactly one class or component), `binding-role`,
`collaboration-named`, `connector-drawn` (a connector between two ports of the subject is not drawn) (warnings); and the
shared `port-owner` and `manifest-ends`. Deleting a part deletes the connectors through it (the type's `refs` cascade).

**Departures from UML 2.5.1:** a role binding's role is drawn as its line's label, not as an end label at the part's
end (the end labels are placed after the port names and do not see them); a binding to a port is left out (below).

## Left out

`notes/stage-5.md` §17: connector multiplicities and end names; a part's own inner structure (shown in its type's
view); ports on a collaboration's roles; a role binding to a port of the subject (`binding-ends` takes a part only); a
part's multiplicity in its corner (it is in its name); «represents» and occurrences; role bindings with several role
names; the properties of a port selected on a part (they are its class's, edited where the class's own port is drawn).
A class or component shown in the view but not its subject is drawn without its ports. `L` then a name cannot reach a
part or a port (the canvas names a member by its owner's label): `L` then an arrow, or the pointer, does. And for all
three stage 5 types: XMI, copy and paste, per-type `diff()` writers and a reader.

Hiding (definition of done, item 4): a part, a role or a port is a member and cannot be hidden. Delete deletes it from the
model, said on the hint line first; Delete on a port shown on a part deletes the connectors through that part to it.

Layout limits, measured on `examples/order-service-structure.json` and `tests/composite-stress.json`:

- The type ranks the subject's parts and collaboration uses itself (longest path over connectors and role bindings),
  then each open collaboration's roles, block after block to the right, with `gap: 64`, `rgap: 56` and `labelGaps`, port
  repair off. A pin is kept to its own block's columns.
- The example lays out clean right and down: no crossing, `check()` finds nothing (decision 22: a port on its owner is not
  an overlap). Its own two `part-type` warnings stay: `orders : OrderRepository` and `listeners : OrderListener` are typed
  by classes the model does not hold.
- `tests/stage5-fixtures.test.mjs` pins the stress file. Its `edge-cases` view: one crossing each way, between the
  connector to the shared part and a role binding. Its generated `all` view (30 parts, 50 connectors, 20 ports on parts):
  21 crossings right and 5 down.
- Found in 5.8 and fixed in `src/uml/structure.js`: a port with no line was drawn over the end of a connector that names
  no port on the same side; it now keeps off it.

## Writers: what each shows of a composite structure diagram

Measured on `examples/order-service-structure.json` (0.22.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py
pdf`. The PNG was looked at, the SVG read, the PDF's text read back (`tests/cli.py` reads its tables).

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| The subject's box and ports, parts with their types' ports, the shared part dashed, the collaboration's dashed ellipse, the collaboration use | Yes | Yes | Yes, in vectors |
| Connectors, role bindings with their roles | Yes | Yes | Yes |
| Port names | Yes | Yes | Yes |
| The legend (connector, role binding) | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each part's, role's, port's and collaboration use's `aria-label` kept ("Port quotes of checkout"); the lines' `<title>` removed | None | None |
| Theme | The page's | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": the subject with its ports, its parts (`name : Type [multiplicity]`, composite or shared) and its connectors; a collaboration use's collaboration and bindings (`publisher ← checkout`); an open collaboration's roles and connectors. **Gap:** "Lines" lists no connector or role binding, whose ends are members, not cards (`risks.md` R10): they are in the rows above |

## Accessibility

Every piece has a name: "Class OrderService, 2 ports, holding 4 parts, 1 collaboration use", "Part checkout :
CheckoutFlow [1], in OrderService, 3 ports", "Port quotes of checkout", "Collaboration use orderEvents :
PublishSubscribe, binding publisher to checkout, subscriber to listeners", "Role binding from checkout to orderEvents, as
publisher". Tab reads the subject and its ports, each part and its ports, the collaboration uses, each open
collaboration and its roles, then the lines. Text reads at 4.5:1 and lines and outlines at 3:1 in both themes
(`tests/composite.html`, `tests/stage5.html`). Every gesture has a key (`docs/editing.md`).

## Performance (P1)

`tests/stage5-fixtures.test.mjs` on `tests/composite-stress.json`'s `all` view (30 parts, 50 connectors, 20 ports on
parts), CPU time, best of seven after a warm-up, on an Apple laptop at a load average of 3 to 8 (13 Nov 2026): a full
layout and its SVG 15 ms; a part's type changed, laid out and drawn, 9 ms; a stereotype set 10 ms; a colour (an edit
that moves nothing) 1 ms, against the 100 ms target. CI holds 1 s and prints the figures.

## Tests

`tests/composite.test.mjs` and `tests/composite.html` (the type, its rules with a passing and a failing case each, the
example under three fonts, both themes and both directions, every gesture by pointer and key, ports on parts through
`<part>-><port>`, a part's deletion taking its connectors); `tests/composite-minimal.json` and
`tests/composite-stress.json` with `tests/stage5-fixtures.test.mjs` and `tests/stage5.html` (`notes/stage-5.md` §13: two
parts of one type each with its own connector, a shared part, an untyped part, a connector through the wrong part, an
open collaboration, two collaboration uses, the subject's port with lines inside and out; P1); `tests/notation.html`
(connectors and role bindings end in nothing, role bindings dashed); `tests/cli.py`; `tests/mcp.py`;
`tests/atlas.test.mjs`.
