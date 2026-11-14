# Conformance: the UML object diagram

Release 0.19.0 (stage 2, `docs/diagrams/notes/stage-2.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no object diagram, and there is no XMI or UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.object"` is an object diagram. It is drawn by
`lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host loads, draws
it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 2; the example is
[`examples/order-objects.json`](../../examples/order-objects.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 9.8 InstanceSpecification | `uml.InstanceSpecification`: `label` its name, `props.classifier` the classifier's name as text | the classifier shape with one compartment; its head `name : Classifier` underlined, `: Classifier` for an anonymous instance (no `label`), or `name` with no classifier |
| 9.8 Slot | member `uml.Slot`: `label` the feature, `props.value` its value as text | one row: `feature = value`, or `feature` with no value; a long value cut to the instance's width (at most 320 px) |
| 9.8.4 a link, an instance of an association | `uml.Link`: `label` its name, `props.association` the association's name as text, `props.ends.from` / `.to`: `role` | a solid line with no end marks; its name, or else its association, on the line; each role by its end |
| 7.2 Comment | `uml.Comment`, `uml.CommentLink` from the comment | a note with a folded corner; a dashed line with no ends |
| 12.3 stereotype notation, as text | `props.stereotypes` on an instance or a link | «entity» over the head, before a line's label |
| 12.2 Package, as an owner | an instance's `parent` is a package | a shown package owning a shown instance is a box holding it, as in the class view (`uml-package.md`); an instance shown without its owner is named `shop::order1 : Order` |
| 9.2 Classifier, shown beside instances | a node of a class diagram's types in an object view | drawn as the class view draws it: not underlined, its keyword, its compartments |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-2.md` §9.3): `slot-kinds` (an instance
holds slots only; a slot belongs to an instance), `link-ends` (a link joins two instances), `instance-of` (a warning:
when `props.classifier` names exactly one classifier of the model, by its name or qualified name, each slot names an
attribute of it or of one of its generals), `owner-kinds` (a warning: an instance's owner is a package) and the class
diagram's `member-names` (two slots for one feature). Ownership cycles and references that do not resolve are the core's
checks. A model with only object views gets no class rules but these.

A view may set `direction: "down"`, `subject` (names are qualified from it) and pins in `layout`. A link from an
instance to itself is drawn as a loop, and two links between one pair each keep their own line.

## Left out

- Checking a slot's value against its feature's type; an instance's own value specification (`= value` in its body);
  nested instances in slots; n-ary links; links drawn as instances of an association class; a link's multiplicity,
  aggregation and navigability (an instance has no multiplicity).
- A classifier and an association are text, not references (`docs/diagrams/risks.md` M8): renaming a class does not
  rename the instances that name it. A classifier name that matches no classifier, or several, is not checked.
- F2 edits the instance's name alone; its classifier is set in the properties panel (`notes/stage-2.md` §9.2, (a)).
- A reader: Mermaid has no object notation. `paths()` reads a link as a map's line.
- XMI and UML diagram interchange.
- Lines cross where the layered layout finds no better order. `tests/object-stress.json` (50 instances, 60 links, one a
  loop) has 42 crossings laid out down and 42 laid out right, most among the twenty lines from order lines to their
  eight books; `tests/object-fixtures.test.mjs` pins both counts (`docs/diagrams/risks.md` L4). `tests/object-minimal.json`
  has none.
- A known limit found by 2.6: laid out right in Chrome, under a sans-serif or a monospace font, a role at a line's end
  can be placed on a neighbouring instance where several links end close together on one side (seen on a 50-instance
  view with three links into each of eight books, `risks.md` L5). Node's text estimate does not show it; the stress
  fixture as committed lays out clean in both directions under all three fonts.

## Writers: what each shows of an object diagram

Measured on `examples/order-objects.json` (0.19.0): `umlimator.py stills` (SVG and PNG, light and dark) and
`umlimator.py pdf` on its rendered page. Each file was opened and looked at.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Instances, heads underlined, every slot row | Yes | Yes | Yes, in vectors |
| Links, their names, the association's name, roles by each end | Yes | Yes | Yes |
| Notes and their links | Yes | Yes | Yes |
| A package holding instances, as a box | Yes | Yes | Yes |
| The legend | No: the legend is a piece of the page (`render()`'s `legend`), not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each instance's `aria-label` kept ("Instance specification order1042 : Order, 2 slots"); the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, light or dark, every colour resolved (no CSS variables), so the file opens alone | The page's | `--theme`, light by default |
| Views | One per call (`view`); `stills` writes every view | One per call; `stills` every view, at 2x | Every view (`--views` picks), each on its own page |
| Tables | None | None | Per type (R8, 0.19.0): each instance by its drawn name (`ada : Customer`), its kind ("Instance specification") and its slots as `feature = value`; each link from → to, its label and its kind ("Link"). The table's heading says "Elements" |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)),
this one's among them.

## Accessibility

Instances and links have accessible names ("Instance specification ada : Customer, 1 slot"; "Link from ada : Customer
to order1042 : Order (orders): places"); `describe()` writes the view in words, one instance a line with its slots and
its links ("Instance specification ada : Customer, 1 slot: email = ada@example.org; linked to order1042 : Order
(orders) ("places")."). Text reads at 4.5:1 or more and lines at 3:1 or more on the stage in both themes
(`tests/object.html`). Every editing gesture has a key (`docs/editing.md`).

## Tests

`tests/object.test.mjs` and `tests/object.html` (the type, the slot syntax, its rules, the example laid out under three
fonts, both themes and both directions, each gesture by pointer and key, a 30-step session that undoes, redoes and
reopens to byte-identical models); `tests/object-fixtures.test.mjs` with `tests/object-minimal.json` and
`tests/object-stress.json` (`notes/stage-2.md` §15, and P1's budget), and `tests/package-object.html`, which draws both
fixtures in Chrome under three fonts, both themes and both directions; `tests/cli.py` (render, check, stills, pdf, and
the diff Action's step); `tests/mcp.py` (the MCP server, C10).
