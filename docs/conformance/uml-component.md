# Conformance: the UML component diagram

Release 0.22.0 (stage 5, `docs/diagrams/notes/stage-5.md`). Support is claimed by level (decision D3): **render** and
**edit** on the subset below. No interchange: Mermaid has no component notation, and there is no XMI and no UML diagram
interchange (`docs/diagrams/proposal.md` §8.1).

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"uml.component"` is a component diagram. It is
drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what a map host
loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 5; the example is
[`examples/bookshop-components.json`](../../examples/bookshop-components.json).

## The subset, and UML 2.5.1's clauses

| UML 2.5.1 | In the model | Drawn as |
|---|---|---|
| 11.6 Component | `uml.Component`; `props.stereotypes`; `parent` a component or a package | a rectangle, its name centred, UML's component icon (16 × 12 px) at the top right; holding a shown component, a box with its name and icon in the header room |
| 11.3 Port | a `uml.Port` member of a component or class; `props.valueType` | a 12 px square centred on its owner's border, on the side `present.<port>.side` names or the side facing most of its lines; longer along the border by 10 px for each further line on a face; its name `name : Type` outside, beside it |
| 10.4 Interface | `uml.Interface`; its members as the class type's | a rectangle with «interface» (the class type's look), or with `present.<id>.as: "ball"` a 16 px circle, its name under it |
| 10.4 InterfaceRealization (provided) | `uml.InterfaceRealization`, from a component, a class or a port to the interface | to a ball: a plain solid line (the stem); to a rectangle: dashed, a hollow triangle |
| 7.8 Usage (required) | `uml.Usage`, to the interface | to a ball: solid, a socket (a half circle of 11 px) round the ball; to a rectangle: dashed, an open arrowhead, «use» |
| 11.6 ComponentRealization | `uml.ComponentRealization`, from the realizing class or component to the component | dashed, a hollow triangle at the component |
| 11.8 Connector, assembly | `uml.Connector` with `props.kind: "assembly"` (or no kind), between two components or their ports, neither inside the other | a plain solid line |
| 11.8 Connector, delegation | `uml.Connector` with `props.kind: "delegation"`, between a box's port and something it holds | a solid line with an open arrowhead at its `to` end (a departure, below), entering the box at its port |
| 19.3 Manifestation | `uml.Manifestation`, from an artifact | dashed, an open arrowhead, «manifest» |
| 19.3 Artifact | `uml.Artifact` | a rectangle with «artifact» over its name and UML's document icon at the top right |
| 12.2 Package | `uml.Package`, holding components | a box, its name in the header room |
| 7.7 Dependency, 7.8 Comment | `uml.Dependency` (`props.stereotypes`), `uml.Comment`, `uml.CommentLink` | dashed with an open arrowhead; a note, a dashed line |

Rules, each `validate()` problem naming its `rule` and its elements (`notes/stage-5.md` §10.1): `port-owner` (a port is
a member of a component or a class), `provided-ends`, `delegation-ends` (as built: the outer end a port),
`assembly-ends`, `manifest-ends` (from an artifact; to anything but a component, a warning),
`component-realization-ends` (errors); `required-ends`, `ball-interface`, `component-owner` (warnings).

**Departures from UML 2.5.1:**

- The delegation's arrow (decision 20): UML 2.5.1 does not require an arrowhead on a delegation connector, and an open
  arrow on a solid line is also its look for a navigable association. Kept to show which way the port delegates.
- A realization or usage drawn from a port (`provided-ends`): in the metamodel a port's provided and required interfaces
  are derived from its type; a port does not realize or use an interface. The model stores the line from the port, as
  UML tools draw the lollipop on a port; a reader of the model must know it.
- «manifest» to a component only (`manifest-ends` warns on other targets).

## Left out

`notes/stage-5.md` §17: connector multiplicities; «subsystem» and «specification»; a component's parts drawn inside it
as a composite structure (nested components only); the black-box compartments («provided interfaces», «required
interfaces», «realizations», «artifacts»); provided and required interfaces as a port's own props; a ball and socket
joined with no interface node; the ball's stem kept short (it is a line the layout places; on the example it is one
column gap). And for all three stage 5 types: a port's multiplicity; behaviour, service and conjugated ports (`~`); XMI;
copy and paste; per-type `diff()` writers (a reorder reads as changed); a reader; storing a port's order (it follows
its lines); ELK in the module (5.7's trial).

Hiding (definition of done, item 4): a port is a member, drawn because its owner is, so it cannot be hidden. Delete on a
port deletes it from the model, with its lines, as Shift + Delete does; the hint line says so before it goes (decision
19, stage 3's precedent for messages).

Layout limits, measured on `examples/bookshop-components.json` and `tests/component-stress.json`:

- The type ranks its own view (`layout.rank: false`): each box's contents, then the top, by longest paths; what no line
  reaches is packed by size under the lined columns. It lays out with port repair off (`repair: false`,
  `reroute: false`), with `gap: 48`, `rgap: 56`, `cut: 280` and `labelGaps` (decision 9). A box whose ports have lines
  takes a 48 px padding.
- The example lays out clean right and down: no crossing, `check()` finds nothing, every line routed by the grid.
- `tests/stage5-fixtures.test.mjs` pins the stress file. Its `edge-cases` view: laid out right two crossings, down one,
  both between lines of the component whose four ports are pinned to the four sides (a pin against the ranking). Ten
  ports on one side of a box: a box is sized by its contents, not its ports (§4.1), so five are held at the start of the
  side's free span, marked `over`, and `check()` reports them overlapping (15 pairs); ten on one side of a node: the node
  grows and every port fits. A port with no line and a 40-character name: the name is drawn whole, but on a crowded side
  the end labels' search may place it far from its port (L5). Its generated `all` view (50 elements, 60 lines, 54 ports
  in boxes three deep): 126 crossings right and 128 down. Laid out right: two pairs of lines sharing a line, two box
  headers crossed, a ball's name under a port (`check()`: nodes "Api0" and "in" overlap), and a port's name over lines
  in eight cases and over a sibling component in one (`c0.b` over `c4`), since the layout keeps no room for names (§4.3).
  Laid out down: one pair of lines sharing a line and one line along a box's border. These are stated limits, not §13's
  "no overlap, no line along a box's border, no port name over a node or a line".
- Found in 5.8 (`tests/stage5.html`): in the browser under a font wider than the layout's estimate (the page's monospace
  font, laid out right), two of the `all` view's usages that come into a ball from below end on its node's bottom beside the circle, not on the circle
  (`risks.md` L17).
- A line's end labels and a port's name are placed apart from each other only as far as the end labels' search sees
  (§4.5, as built in 5.3).

## Writers: what each shows of a component diagram

Measured on `examples/bookshop-components.json` (0.22.0): `umlimator.py stills` (SVG and PNG) and `umlimator.py pdf` on
its rendered page. The PNG was looked at, the SVG read, the PDF's text read back (`tests/cli.py` reads its tables).

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Components with their icons, the box, the ports on the borders, the ball, the rectangle interface, the artifact | Yes | Yes | Yes, in vectors |
| Lines, dashes, the socket, the delegation's arrow, triangles, «use» and «manifest» | Yes | Yes | Yes |
| Port names | Yes, as text beside each port | Yes | Yes |
| The legend of line kinds (stem, socket, then the rectangle's realization and usage, assembly, delegation, dependency, manifestation) | No: the legend is a piece of the page, not of the picture | No | Yes, under the picture |
| Text | Text, in the page's font family; the font is not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each component's, port's, interface's and artifact's `aria-label` kept ("Port orders of Shop API, provides Orders"); the lines' `<title>` removed, as for maps | None | None |
| Theme | The page's, every colour resolved | The page's | `--theme`, light by default |
| Tables | None | None | "Elements": each component with its ports (`name : Type`, what each provides) and the connectors from them, an interface's kind and operations, what an artifact manifests; "Lines": each line between two elements, from → to and its kind. **Gap:** a line from or to a port is not a row of "Lines" (its ends are not cards; `risks.md` R10): a port's realization is in its row ("provides Orders"), its delegations and assemblies under its component |

The site builds every example's stills and PDF ([zintaen.github.io/umlimator](https://zintaen.github.io/umlimator/)).

## Accessibility

Every piece has a name: "Component Shop API, 2 ports, holding 1 component", "Port orders of Shop API, provides Orders",
"Interface Orders, as a ball, provided by Shop API, required by Storefront", "Delegation from orders of Shop API to
orders of Checkout", "Artifact shop-api.jar, manifests Shop API". Tab reads each box and what it holds, each element's
ports after it in their drawn order, then the lines (`geo.order`). `describe()` writes the view in sentences. Text reads
at 4.5:1 and lines, outlines and ports at 3:1 on the stage in both themes (`tests/component.html`, `tests/stage5.html`).
A port's hit area is 24 px. Every editing gesture has a key (`docs/editing.md`): `B` turns an interface into a ball and
back; `Alt + arrows` moves a port to another side.

## Performance (P1)

`tests/stage5-fixtures.test.mjs` on `tests/component-stress.json`'s `all` view (50 elements, 60 lines, 54 ports in boxes
three deep), CPU time, best of seven after a warm-up, on an Apple laptop at a load average of 3 to 8 (13 Nov 2026): a
full layout and its SVG 131 ms; a colour (an edit that moves nothing) 5.4 ms; a port renamed 5.5 ms (no layout); a
component renamed 139 ms; a stereotype set (it grows the header, so the view lays out again) 136 ms, against the 100 ms
target. CI holds 1 s and prints the figures (the maintainer's decision of 13 Nov 2026). The layout
is over the target on this view: the router's cost (5.4 measured 124 ms without `labelGaps`).

## Tests

`tests/component.test.mjs` and `tests/component.html` (the type, its rules with a passing and a failing case each, the
example under three fonts, both themes and both directions, every gesture by pointer and key through `apply()`, a
30-step session); `tests/structure.test.mjs` and `tests/structure.html` (the port, component, ball and artifact shapes);
`tests/typed-ports.test.mjs` and `tests/typed-ports.html` (the router's ports and inner lines);
`tests/component-minimal.json` and `tests/component-stress.json` with `tests/stage5-fixtures.test.mjs` and
`tests/stage5.html` (`notes/stage-5.md` §13: every edge case, laid out right and down, every port line on its square
within 1 px, every port on its owner's border, what `check()` finds pinned, P1); `tests/notation.html` (the socket, the
stem, the delegation's arrow, the triangles, «use» and «manifest», each tip on what it points to); `tests/cli.py`
(render, check, stills, pdf and its tables, the diff Action's step); `tests/mcp.py` (the MCP server's read tools, the
page drawing the view, a highlight); `tests/atlas.test.mjs` (the view in the Bookshop atlas, laid out as in its file).
