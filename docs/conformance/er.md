# Conformance: the entity-relationship diagram

Release 0.24.0 (milestone 2, `docs/diagrams/notes/milestone-2.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below, **read** from Mermaid's `erDiagram` and from DBML through `@dbml/core`, and **write**
to Mermaid's `erDiagram`.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"er"` is an entity-relationship diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 20; the example is
[`examples/bookshop-schema.json`](../../examples/bookshop-schema.json).

## The subset

There is no single standard for ER diagrams. Two notations are drawn on one geometry: crow's foot (Information
Engineering, as tools draw it) and IDEF1X's relationship ends (FIPS 184). The view's `notation` picks one, `crowsfoot` by
default or `idef1x`; a switch repaints and lays nothing out (§4.3).

| Concept | In the model | Drawn as |
|---|---|---|
| Entity (a table) | `er.Entity` | a box: its name in a header, the key columns, a divider, the rest; 120 to 320 px wide; `present.<id>.rows` caps the rows shown ("+n more"), `collapsed` hides a section. In IDEF1X the child of an identifying relationship has rounded corners (a dependent entity) |
| Column | an `er.Column` member; props `dataType`, `primaryKey`, `foreignKey`, `references` (a column id), `nullable`, `unique` | a row `name type` with its marks (`PK`, `FK`, `UK`, `?` for nullable); read and printed as `name type [PK] [FK table.column] [UK] [NULL]` (S9) |
| Relationship | `er.Relationship` from the referenced entity to the referring one; `props.identifying`, `props.ends.<from\|to>.multiplicity` | identifying solid, non-identifying dashed; crow's foot: each end one of exactly one, zero or one, one or more, zero or more, by the multiplicity's bounds; IDEF1X: a dot at the child with `P`, `Z`, `1` or the multiplicity as an end label, nothing at a parent of `1`, a hollow diamond at an optional parent |
| Comment | `uml.Comment`, `uml.CommentLink` | a note, a dashed line |

Rules (`src/er/er.js`): errors `column-names`, `fk-target` (a reference to no column), `identifying-key`,
`identifying-parent`, `relationship-ends` (an unreadable multiplicity), `relationship-tables`; warnings `pk-exists`,
`fk-target` (a reference to a column neither key nor unique), `fk-flag`, `relationship-fk`, `relationship-ends` (a
readable multiplicity none of the four forms, drawn as the nearest with its text), `notation`.

**Departures:** no claim of IDEF1X conformance (`proposal.md` §3.4): its ends are drawn, its key-based and fully
attributed levels are not checked, and a non-specific (many-to-many) relationship is drawn, not required to be resolved.
Crow's foot's dashed non-identifying line is a tool convention (Mermaid's `--` and `..`), not part of the notation.

## Left out

`notes/milestone-2.md` §13: Chen's notation; IDEF1X's key-based level; lines that end on columns; weak entities beyond
IDEF1X's dependent corners; subtype clusters; check constraints, defaults and indexes other than keys; SQL DDL; several
schemas; a DBML writer. And copy and paste, per-type `diff()` writers, deleting a view. Three things have no canvas
gesture and are commands through `apply()` for a host: deleting a column (`delete` by its id), switching `notation`
(`set { view, path: 'notation' }`), a column's flags as fields (they are changed by retyping its row).

Readers: `readMermaidEr` reads every construct on Mermaid 12.3.0's ER page; Mermaid's text says nothing of which column
a foreign key references (a `%% references:` comment carries it), and its relationship ends are read left to right, so
`DOCK }o--|| HARBOUR` (identifying, its many end first) is read as written and `identifying-parent` names it
(`tests/m2-fixtures.test.mjs` pins what `validate()` says of `tests/import/er.mmd`). `readDbml` reads a `Database`
`@dbml/core` parsed; umlimator does not depend on it.

Layout limits, measured on `examples/bookshop-schema.json` and `tests/er-stress.json`:

- Laid out right by default, with port repair and rerouting off (`repair: false`, `reroute: false`, §11).
- The example lays out clean right and down in both notations: `check()` finds nothing.
- `tests/m2-fixtures.test.mjs` pins the stress file. Its `edge-cases` view and its IDEF1X copy are clean both ways, one
  geometry. Its generated `all` view (50 entities, 60 relationships) crosses 18 times laid out right and 25 times down;
  no line runs through a node, no label lies over one.
- A row longer than the entity's width is cut with an ellipsis; its whole text is in the entity's accessible name,
  `describe()` and the PDF's rows.

## Writers: what each shows of an ER diagram

Measured on `examples/bookshop-schema.json` (0.24.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf`; the
PDF's text read back by `tests/cli.py`.

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Entities, rows and marks, both notations' ends, IDEF1X's letters | Yes | Yes | Yes, in vectors |
| The legend of line looks and ends | No: the legend is a piece of the page | No | Yes, under the picture |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each node's `aria-label` kept; the lines' `<title>` removed | None | None |
| Tables | None | None | "Elements": each table (Table) and its columns as rows, `referred_by bigint FK customer.id NULL`. "Lines": each relationship's text, `places: 1 to 0..*, non-identifying` (the type's `text`); a self-reference is left out, as the lines table leaves out every type's line from an element to itself |
| Mermaid `erDiagram` (`writeMermaidEr`) | | | Entities, columns with `PK`, `FK`, `UK` and `?`, relationships with their ends and identifying; ids and references in `%% id:` and `%% references:` comments; the IDEF1X notation named in `%% not written:` |

## Accessibility

Every piece has a name: "Table order_line, key order_id and line_no, 4 columns: order_id bigint PK FK order.id; …",
each row whole; "Identifying relationship contains
from order (exactly one) to order_line (one or more)". Tab reads the entities, then the lines. Text reads at 4.5:1,
lines and outlines at 3:1 in both themes (`tests/er.html`, `tests/m2.html`). Every gesture has a key
(`docs/editing.md`).

## Performance (P1)

`tests/m2-fixtures.test.mjs` on `tests/er-stress.json`'s `all` view (50 entities, 60 relationships), CPU time, best of
seven after a warm-up, on an Apple laptop under other agents' load (14 Nov 2026): a full layout and its SVG 28 to 54 ms;
a column added (its entity grows) 24 to 48 ms; a column's type set to one as wide, which lays nothing out (the test checks the memo's run count), 25 ms
(one run; most of it is drawing the SVG); a notation
switch 10 to 16 ms, laying nothing out (two runs). CI holds 1 s and prints the figures against the 100 ms target.

## Tests

`tests/er.test.mjs` and `tests/er.html` (the type, its rules each passing and failing, the ends in both notations, a
30-step session, every gesture by pointer and key); `tests/er-minimal.json` and `tests/er-stress.json` with
`tests/m2-fixtures.test.mjs` and `tests/m2.html` (§10's cases, P1); `tests/notation.html` (crow's foot's four ends,
IDEF1X's dot and diamond, by multiplicity, solid or dashed); `tests/mermaid-er.test.mjs`, `tests/dbml.test.mjs`;
`tests/cli.py` (render, check, stills, pdf and its tables, the diff Action's step); `tests/mcp.py`;
`tests/atlas.test.mjs` (the schema in the Bookshop atlas, opened from the C4 container view's database).
