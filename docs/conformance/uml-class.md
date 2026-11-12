# Conformance: the UML class diagram

Release 0.18.0 (stage 1, `docs/diagrams/plan.md` §4), with packages drawn as nesting from 0.19.0 (stage 2). Support is claimed by level (decision D3): **render** and
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
| 12.2 Package | `uml.Package`; ownership is `parent` | from 0.19.0: a package owning something the view shows is a box holding it, its name in a tab; one owning nothing shown is a closed folder (`uml-package.md`). Names are qualified from the nearest shown owner, the view's `subject`, or the top (`sales::Order`). Until 0.19.0: a named box, its classes beside it |

Rules, each `validate()` problem naming its `rule` and its elements (`docs/diagrams/proposal.md` §8.3):
`member-names`, `classifier-names`, `multiplicity`, `generalization-cycle`, `generalization-kinds`, `realization-target`,
`interface-composite`, `composite-multiplicity`, `member-kinds`, `comment-link`; from 0.19.0, as class views draw boxes,
`owner-kinds`, `line-inside` and `own-boxes` (warnings, `uml-package.md`); ownership cycles and references that do not
resolve are the core's checks.

A view may set `direction: "down"`, pins in `layout`, `subject` (names are qualified from it), and per element in
`present`: `collapsed` (compartments not drawn) and `rows` (at most n rows, then "+k more"). A line between a package and
something it holds is not drawn (`line-inside`).

## Left out

- Templates and template bindings; association classes; n-ary associations; qualifiers; signals and receptions;
  constraints and OCL; generalization sets; nested classifiers (a class's `parent` is a package, never a class).
- Object diagrams and package import and merge: their own types from 0.19.0 (`uml-object.md`, `uml-package.md`).
  Until 0.19.0 a package in a class view is a named box, and the view draws its classes beside it. From 0.19.0 every
  class view draws a package with something it owns shown as a box holding it (a package with nothing it owns shown
  stays closed), and qualifies names (`sales::Order`), so a 0.18.0 class picture with packages changes, by the
  maintainer's decision (`docs/diagrams/notes/stage-2.md` §10.1). `examples/sales-classes.json` draws `sales` as a box
  holding its nine classes, and its "Payments only" view names its classes plainly from its `subject`.
- Notation the subset does not draw: property modifiers (`{readOnly}`, `{ordered}`, `{unique}`), derived unions,
  the association-end ownership dot, an association's name-direction triangle, end visibility, ball-and-socket
  interfaces (the component diagram's, stage 5), stereotype icons.
- A type is text (`"valueType": "Money"`), not a reference: renaming a class does not rename the types that name it
  (`docs/diagrams/risks.md` M8).
- XMI and UML diagram interchange; code generation and reverse engineering.
- A member held in the model whose label has a space, or whose type holds `=`, prints a line the member syntax does not
  read back (`docs/diagrams/README.md`, log of 1.9).
- Lines cross where the layered layout finds no better order, more often past 40 elements. In `tests/class-stress.json`
  (from 0.19.0 its packages `shop` and `catalog` are boxes, and it gained two classes so that 50 nodes are still laid
  out) the `edge-cases` view (13 elements, 12 of them drawn as nodes and `shop` as a box, 15 lines) has 3 crossings, all
  among the four lines between Order and Customer; the `all` view (52 elements, 50 drawn nodes and 2 boxes, 59 lines)
  has 19: generalizations to Entity and Person across Customer's and Order's lines, Customer's line to Account across
  Invoice's, Shipment's and Gift's, and others. Before 0.19.0 they were 2 and 29 on 13 and 50 elements.
  `tests/class-fixtures.test.mjs` pins both counts (`docs/diagrams/risks.md` L4).

## Writers: what each shows of a class diagram

Measured on `examples/sales-classes.json` (0.18.0; its PDF tables and packages again on 0.19.0): `toSVG()` and `toPNG()` in Chrome, light and dark; `umlimator.py
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
| Packages | From 0.19.0 a box holding its classes, its name in a tab (until 0.19.0 a named box, its classes beside it) | The same | The same |
| Tables | None | None | Per type from 0.19.0 (R8): each element's kind ("Class", "Data type"; an element with no type counts as a class) and its members as the type prints them; each line's kind ("Association", "Generalization"). Until 0.19.0 the map's tables: every kind read "Script", a line with no label "calls", and no members |

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
through `apply()`, the `sales` box); `tests/package.test.mjs` (boxes and qualified names in class views); `tests/class-fixtures.test.mjs` with `tests/class-minimal.json` and `tests/class-stress.json`
(`risks.md` G1, and P1's budget); `tests/mermaid-class.test.mjs` (interchange); `tests/class-editor.html` (the host
page); `tests/cli.py` (render, check, stills and pdf).
