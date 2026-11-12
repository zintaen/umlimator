# Conformance: the UML class diagram

Release 0.18.0 (stage 1, `docs/diagrams/plan.md` §4). Support is claimed by level (decision D3): **render** and
**edit** on the subset below; **interchange** with Mermaid's `classDiagram` (Mermaid 12.3.0) on the same subset. Not
XMI, and no UML diagram interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.class"` is a class diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 1; the example is
[`examples/sales-classes.json`](../../examples/sales-classes.json), edited in
[`examples/class-editor.html`](../../examples/class-editor.html).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 11.4 Class; `isAbstract` | `uml.Class`, `props.isAbstract` | a classifier box: name, attributes, operations; an abstract name in italics |
| 10.4 Interface | `uml.Interface` | a classifier with «interface» over its name |
| 10.2 Enumeration, EnumerationLiteral | `uml.Enumeration`, members `uml.EnumerationLiteral` | «enumeration», its literals in the first compartment |
| 10.2 DataType, PrimitiveType | `uml.DataType`, `uml.PrimitiveType` | «dataType», «primitive» |
| 9.5 Property (attribute) | member `uml.Property`: `visibility`, `valueType`, `multiplicity`, `default`, `isStatic`, `isDerived` | one row of UML text: `+ /total: Money [1] = 0`; static underlined |
| 9.6 Operation, Parameter | member `uml.Operation`: `visibility`, `parameters` (`name`, `valueType`, `direction`), `returnType`, `isStatic`, `isAbstract` | `+ place(at: Date, in qty: Int): Order`; abstract in italics, static underlined |
| 7.4 visibility | `public`, `private`, `protected`, `package` | `+`, `-`, `#`, `~` |
| 7.5 Multiplicity | `1`, `*`, `n..m`, `n..*`, kept as written | `[0..1]` on a member, by the end on an association |
| 11.5 Association, AggregationKind, navigability | `uml.Association`, `props.ends.from` / `.to`: `role`, `multiplicity`, `aggregation` (`none`, `shared`, `composite`), `navigable` | a solid line; a hollow or filled diamond; an open arrowhead at a navigable end; role and multiplicity by each end |
| 9.2 Generalization | `uml.Generalization`, from the specific to the general | a hollow triangle at the general end; the general class above when the view runs `down` |
| 10.4 InterfaceRealization | `uml.InterfaceRealization`, to the interface | a dashed line, a hollow triangle |
| 7.7 Dependency, Usage | `uml.Dependency`, from the client; `props.stereotypes: ["use"]` | a dashed line, an open arrowhead, «use» as its label |
| 7.2 Comment | `uml.Comment`, `uml.CommentLink` from the comment | a note with a folded corner; a dashed line with no ends |
| 12.3 stereotype notation, as text | `props.stereotypes` on any element or line | «entity» over a name, before a line's label |
| 12.2 Package | `uml.Package`; ownership is `parent` | a named box, its classes beside it, until 0.19.0 |

Rules, each `validate()` problem naming its `rule` and its elements (`docs/diagrams/proposal.md` §8.3):
`member-names`, `classifier-names`, `multiplicity`, `generalization-cycle`, `generalization-kinds`, `realization-target`,
`interface-composite`, `composite-multiplicity`, `member-kinds`, `comment-link`; ownership cycles and references that do
not resolve are the core's checks.

A view may set `direction: "down"`, pins in `layout`, and per element in `present`: `collapsed` (compartments not
drawn) and `rows` (at most n rows, then "+k more").

## Left out

- Templates and template bindings; association classes; n-ary associations; qualifiers; signals and receptions;
  constraints and OCL; generalization sets; nested classifiers (a class's `parent` is a package, never a class).
- Object diagrams (stage 2); packages drawn with their contents inside them, and package import and merge (stage 2).
  Until 0.19.0 a package is a named box, and the view draws its classes beside it. From 0.19.0 every class view draws
  a package with something it owns shown as a box holding it (a package with nothing it owns shown stays closed), and
  qualifies names (`sales::Order`), so this picture changes, by the maintainer's decision
  (`docs/diagrams/notes/stage-2.md` §10.1).
- Notation the subset does not draw: property modifiers (`{readOnly}`, `{ordered}`, `{unique}`), derived unions,
  the association-end ownership dot, an association's name-direction triangle, end visibility, ball-and-socket
  interfaces (the component diagram's, stage 5), stereotype icons.
- A type is text (`"valueType": "Money"`), not a reference: renaming a class does not rename the types that name it
  (`docs/diagrams/risks.md` M8).
- XMI and UML diagram interchange; code generation and reverse engineering.
- A member held in the model whose label has a space, or whose type holds `=`, prints a line the member syntax does not
  read back (`docs/diagrams/README.md`, log of 1.9).
- Lines cross where the layered layout finds no better order, more often past 40 elements. In `tests/class-stress.json`
  the `edge-cases` view (13 elements, 15 lines) has 2 crossings, among the four lines between Order and Customer; the
  `all` view (50 elements, 57 lines) has 29: 4 where those lines meet Order's line to Shipment, 25 elsewhere (Review's
  and Shelf's lines to Book, generalizations to Entity across Customer's and Order's lines, and others).
  `tests/class-fixtures.test.mjs` pins both counts (`docs/diagrams/risks.md` L4).

## Writers: what each shows of a class diagram

Measured on `examples/sales-classes.json` (0.18.0): `toSVG()` and `toPNG()` in Chrome, light and dark; `umlimator.py
stills` and `umlimator.py pdf` on its rendered page. Each file was opened and looked at.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Classifiers, compartments and every member row | Yes | Yes | Yes, in vectors |
| Abstract in italics, static underlined, `/` derived | Yes | Yes | Yes |
| Line ends: triangles, diamonds, open arrowheads, dashes | Yes | Yes | Yes |
| Roles and multiplicities by each end; «use» and line labels | Yes | Yes | Yes |
| Notes and their links | Yes | Yes | Yes |
| Collapsed compartments, "+k more" | Yes | Yes | Yes |
| The legend of line kinds and ends | No: the legend is a piece of the page (`render()`'s `legend`), not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each element's `aria-label` kept; the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, light or dark, with every colour resolved (no CSS variables), so the file opens alone | The page's | `--theme`, light by default |
| Views | One per call (`view`); `stills` writes every view | One per call; `stills` every view, at 2x | Every view (`--views` picks), each on its own page |
| Packages | A named box, its classes beside it (until 0.19.0) | The same | The same |
| Tables | None | None | The map's tables of cards and lines: every element's kind reads "Script" and a line with no label reads "calls"; members are not listed. The picture above them is right |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)),
this one's among them.

## Accessibility

Elements and lines have accessible names ("Class Order (entity), 5 attributes, 3 operations"; "Association from
Customer (1) to Order (orders, 0..*): places"); `describe()` writes the view in words. Text in the classifiers, the
notes, the end labels and the legend reads at 4.5:1 or more, and lines and their ends at 3:1 or more, on the stage in
both themes (`tests/class.html`): a class view draws its lines in `--um-muted`, where a map's are `--um-arrow`. Every
editing gesture has a key (`docs/editing.md`).

## Tests

`tests/class.test.mjs` and `tests/class.html` (the type, its rules, layout under three fonts and both themes, editing
through `apply()`); `tests/class-fixtures.test.mjs` with `tests/class-minimal.json` and `tests/class-stress.json`
(`risks.md` G1, and P1's budget); `tests/mermaid-class.test.mjs` (interchange); `tests/class-editor.html` (the host
page); `tests/cli.py` (render, check, stills and pdf).
