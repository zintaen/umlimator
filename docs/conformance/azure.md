# Conformance: Azure architecture diagrams

Release 0.26.0 (milestone 4a, `docs/diagrams/notes/milestone-4a.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below. There is no reader.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"azure"` is an Azure architecture
diagram. It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what
a map host loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 28; the
example is [`examples/bookshop-azure.json`](../../examples/bookshop-azure.json).

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.

## The subset

| Piece | In the model | Drawn as |
|---|---|---|
| Group | `azure.Group`, its kind in `props.groupType`: `subscription`, `resource-group`, `region`, `virtual-network`, `subnet`, `generic` | a box holding what it owns by `parent`, at any depth, titled "<label> [<kind>]" ("West Europe [Region]"); dashed for a region, solid otherwise; no group icon (decision 10). A group holding nothing shown is a closed card of that title |
| Service | `azure.Service`, its icon in `props.icon`, the pinned pack's own id (`Front-Door-and-CDN-Profiles`) | a card 180 to 280 px wide and 56 px tall at least on the map's box outline: the icon, 32 px, on a 39 px tile (dark under a white icon), from the host's `icons` table at `azure/<id>`; beside it the label (13 px, two lines of 180 px) and under it the full service name (11 px, muted), from the table's `name`, else the id with hyphens as spaces; a label equal to the name drawn once. With no icon in the table, a 24 px outlined square, the glyph |
| Line | `azure.Connector` | solid, an open arrow at `to`, its label cut at 280 px. It may start or end at a group, drawn to the group's border |

An icon is drawn only through `<image>` from a `data:image/` URL, with `preserveAspectRatio="xMidYMid meet"`, never cropped,
filtered, masked, faded or transformed, in screen, print or PDF; any other entry (another address, markup) draws the glyph.
The module never fetches an icon: the CLI builds the table from a pack the user fetched after reading Microsoft's terms
(`umlimator.py pack fetch azure`, the README's Icons section), and a host gives its own the same way.

Rules (`src/cloud/cloud.js`): errors `group-kind` (the kind is one of the row's) and `line-inside` (no line between a
group and what it holds: it cannot be drawn, and connecting one is refused); warnings `group-nesting` (a resource group in a subscription; a region in a subscription or a resource group; a virtual network in a region or a resource group; a subnet in a virtual network; `generic` anywhere), `icon-set` (a service has an icon) and `icon-missing` (where the host gave the pack, the service's icon is in it). `umlimator.py check` names an id the pack lacks with its three nearest ids, and an id an alias moved.

**Departures:** no claim to follow Microsoft Azure's architecture diagram guidelines; groups are drawn in the typed
look, not the vendor's colours; the full service name is drawn under the label, derived from the pack's id where the
pack gives no other.

## Left out

`notes/milestone-4a.md` §13: the vendor's group icons and colours (decision 10); icon search in the editor beyond the
properties panel's field (decision 9); older pack versions side by side; a reader. Drawing a line from or to a group by
pointer or `L` (the canvas's handle ends on cards: such a line is written in the model, §5.7's As built); an `update()` that
changes only the `icons` table keeps the view's picture (a later core package). And XMI, copy and paste, per-type `diff()` writers.

Layout limits, with port repair and rerouting off (`repair: false`, `reroute: false`, §11), measured on the example and
`tests/cloud-stress.json`:

- The example crosses once laid out right and 3 times down; no line runs through a node.
- `tests/m4a-fixtures.test.mjs` pins the stress file's `az-edge-cases` view (five levels of groups, a generic group, a
  subnet in a resource group, a line from a subnet to a service in a sibling group), clean both ways.
- A label is wrapped to two lines of 180 px, the full name to two, then cut with an ellipsis; both are in the card's
  accessible name, `describe()` and the PDF.

## Writers: what each shows of a Azure diagram

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Cards, groups, lines and their labels | Yes | Yes | Yes, in vectors |
| The vendor's icons | Those the host's `icons` table gave, as `<image>` from data URLs, scaled only; without the table, glyphs | The same, as pixels | The same, in the picture |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture: each icon drawn with its full name, the group kinds, the line |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each card's and group's `aria-label` kept | None | None |
| Tables | None | None | "Elements": a service's and a group's kind; a service's full name, icon id and group. "Lines": each line's ends and label |

A picture made where no pack was fetched, or with `UMLIMATOR_NO_PACKS=1` (every page and still this project publishes),
carries glyphs and full names only.

## Accessibility

Every piece has a name: "Service Shop API, App Services"; "Region West Europe, holding 4 elements"; a card drawn
with a glyph ends ", icon not available". The reading order is the groups and what they hold, depth first, then the
lines; `describe()` is the groups as an outline, each service with its full name, then the lines.
Text reads at 4.5:1, outlines and glyphs at 3:1 in both themes (`tests/cloud.html`, `tests/m4a.html`). Every gesture has a
key (`docs/editing.md`).

## Performance (P1)

The family's stress view is Google Cloud's (`docs/conformance/gcp.md`): the two types share one layout and card,
`src/cloud/cloud.js`'s `CL_FAM`.

## Tests

`tests/cloud.test.mjs` and `tests/cloud.html` (the definitions, the card, groups, icons, glyphs, the rules each passing and
failing, every gesture by pointer and key, a 30-step session); `tests/cloud-minimal.json` and `tests/cloud-stress.json` with
`tests/m4a-fixtures.test.mjs` and `tests/m4a.html`; `tests/packs.py` (the packs, on a synthetic pack: no vendor icon is
committed or fetched by CI); `tests/cli.py` (render, check, stills, pdf, the diff Action, map-repo's CLI); `tests/mcp.py`;
`tests/notation.html` (the open arrow, groups dashed by kind); `tests/atlas.test.mjs` (opened from the opening plan's
"On Azure").
