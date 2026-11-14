# Conformance: the UML package diagram

Release 0.19.0 (stage 2, `docs/diagrams/notes/stage-2.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. Interchange only through the class diagram: Mermaid's `classDiagram` reads and writes
namespaces as packages of a class view (`uml-class.md`); Mermaid has no package diagram. Not XMI, and no UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.package"` is a package diagram. It is drawn
by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads,
draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 3; the example is
[`examples/bookshop-packages.json`](../../examples/bookshop-packages.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 12.2 Package, open | `uml.Package` that owns, by `parent` at any depth, an element the view shows | a box: its border holds exactly the shown elements whose nearest shown owner it is, and the boxes inside it; its name, and «stereotypes», in a tab in the box's top left corner |
| 12.2 Package, closed | `uml.Package` that owns nothing the view shows (empty, or its contents hidden) | a folder: an empty tab over a body, the name and stereotypes in the body (12.2.4); the tab moves along the top, away from where lines end |
| 7.4 Namespace, qualified names | ownership is `parent`; a view's `subject` | an element whose owners are not all shown is named with those between it and its nearest shown owner, joined by `::` (`card::CardPayment` inside `payments`); with no owner shown, from the view's `subject` when that is one of its owners, else from the top (`payments::card::CardPayment`). Only the drawn and the accessible name change; `label` is the element's own |
| 7.4 PackageImport | `uml.PackageImport` from the importing package; `props.visibility` `public` (the default) or `private` | a dashed line, an open arrowhead, «import»; private: «access» |
| 12.2 PackageMerge | `uml.PackageMerge` from the merging package | a dashed line, an open arrowhead, «merge» |
| 7.7 Dependency | `uml.Dependency` from the client | a dashed line, an open arrowhead, its stereotypes as its label |
| 9.2, 10.2, 10.4, 11.4 classifiers | the class diagram's `uml.Class`, `uml.Interface`, `uml.Enumeration`, `uml.DataType`, `uml.PrimitiveType` | by their names and keywords only (`«interface» Payable`); their members are drawn and edited in a class view |
| 7.2 Comment | `uml.Comment`, `uml.CommentLink` | a note with a folded corner; a dashed line with no ends |

A line whose end is an open package ends on the box's border; a line from an element in a box to anything outside
crosses each border between them. A line between a package and something it holds, at any depth, and a line from an
open package to itself, are not drawn (UML draws containment with ⊕, which is out of the subset); on a closed package
a line to itself is a loop. A line to an element the view does not show is not drawn, and never moved to its owner.
A view with no `edges` list draws the package diagram's line types only; a line it lists of another type is drawn.

Class views draw packages the same way from 0.19.0 (`uml-class.md`), and so do object views.

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-2.md` §10.3): `import-ends` (an
import or a merge runs from a package to another package), `package-names` (packages in one owner have different
names), `owner-kinds` (a warning: a classifier, package or instance is owned by a package), `line-inside` (a warning, per
view: a line between a package and something it holds, or from an open package to itself, is not drawn), `own-boxes` (a
warning, per view: a view's hand-written `containers` are ignored, as the model's ownership gives the boxes), and the
class diagram's rules, among them `classifier-names` (names per owner). Ownership cycles are the core's check; an
element on a cycle has no owner on the picture, and one under a cycle is held by the first element of the cycle its
chain meets, so nothing drops from the picture or from `describe()`.

A view may set `direction: "down"`, `subject` and pins in `layout`. An open package's pin is kept in the model and used
when it is closed; a box takes its place from what it holds.

## Left out

- The semantics of package merge; element import; the ⊕ containment notation; package URIs; visibility marks on a
  package's elements; a diagram frame (`pkg`); nested classifiers (a class owned by a class: `owner-kinds` warns of it,
  and it is drawn at its nearest package, qualified `Root::Nested`); models and profiles (stage 6).
- **The open package's tab is drawn inside the box's header room**, not above it, so the border right of the tab is
  level with the tab's top, as in UML's frame notation; the closed folder is UML's own shape (`notes/stage-2.md` §5,
  (a)).
- A pin that puts a node outside its owner's columns grows the box to hold it, as on maps; the box may then come near
  another box, which the layout check reports. `tests/package-minimal.json` holds a pinned class in a box, laid out
  clean; a pin far outside its box is a known limit (`docs/diagrams/risks.md` L15).
- A change of owner lays the view out again, so the picture moves on that edit (`notes/stage-2.md` §3.2).
- A known limit found by 2.6: the router may take a line through a box that holds neither of its ends. In
  `examples/bookshop-packages.json` as stage 2 made it (without 6.7's profile, as `tests/package.html` draws it), laid
  out down, the import from `catalog` to `shared` leaves `catalog`'s bottom, turns up into `payments`' box and runs
  along inside it before it goes down to `shared`. No element is crossed and the layout check is clean, but the line
  reads as if it passed through `payments`. With the profile, the example's layout moves and the line goes round
  `catalog`'s right side to `shared`, outside `payments`; the limit stands.
- XMI and UML diagram interchange; a reader of its own.
- Lines cross where the layered layout finds no better order. `tests/package-stress.json` (50 nodes in 10 boxes over three
  levels of packages, 60 lines) has none laid out down and 1 laid out right; `tests/package-fixtures.test.mjs` pins both
  counts (`docs/diagrams/risks.md` L4). `tests/package-minimal.json` has none in any of its three views, either way.

## Writers: what each shows of a package diagram

Measured on `examples/bookshop-packages.json` (0.19.0): `umlimator.py stills` (SVG and PNG, light and dark) and
`umlimator.py pdf` on its rendered page. Each file was opened and looked at.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Open packages as boxes with their tabs, a box in a box, closed packages as folders | Yes | Yes | Yes, in vectors |
| Classifiers by their names and keywords; qualified names | Yes | Yes | Yes |
| «import», «access», «merge», dependencies, their arrowheads and dashes | Yes | Yes | Yes |
| The legend | No: the legend is a piece of the page (`render()`'s `legend`), not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each box's `aria-label` kept ("Package payments, holding 3 elements"), and each element's; the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, light or dark, every colour resolved (no CSS variables), so the file opens alone | The page's | `--theme`, light by default |
| Views | One per call (`view`); `stills` writes every view | One per call; `stills` every view, at 2x | Every view (`--views` picks), each on its own page |
| Tables | None | None | Per type (R8, 0.19.0): every element by its drawn name and its kind ("Package", "Class", "Interface", "Enumeration", "Data type"), boxes and closed packages alike; each line from → to and its kind ("Package import", "Package merge", "Dependency"). A line's Label column is empty where the picture draws only a keyword («import»), and the heading says "Elements", the typed views' word |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)),
this one's among them.

## Accessibility

Boxes, elements and lines have accessible names ("Package sales, holding 4 elements"; "Package sales (closed)"; "Class
card::CardPayment"; "Package import from payments to shared: «access»"); `describe()` writes the view box by box, each
box then what it holds, depth first, which is the outline's reading order too ("Package payments, holding 3 elements;
accesses shared."). A box is not a Tab stop: the keyboard reaches a package through the outline of elements. A box's
title reads at 4.5:1 or more, and its border and tab at 3:1 or more, in both themes (`tests/package.html`). Every
editing gesture has a key (`docs/editing.md`).

## Tests

`tests/package.test.mjs` and `tests/package.html` (which package is a box, qualified names, lines at a box, the type, its
rules, the example laid out under three fonts, both themes and both directions, each gesture by pointer and key, a
30-step session that undoes, redoes and reopens to byte-identical models); `tests/package-fixtures.test.mjs` with
`tests/package-minimal.json` and `tests/package-stress.json` (`notes/stage-2.md` §15: G1, L8 and M6, and P1's budget),
and `tests/package-object.html`, which draws both fixtures in Chrome under three fonts, both themes and both directions;
`tests/layout-typed.test.mjs` and `tests/typed-edit.html` (boxes on typed views, the drop and the Owner field);
`tests/cli.py` (render, check, stills, pdf, and the diff Action's step, where a re-own reads "moves Book into sales");
`tests/mcp.py` (the MCP server, C10); `tests/mermaid-class.test.mjs` (namespaces).
