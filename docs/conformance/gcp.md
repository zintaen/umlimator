# Conformance: Google Cloud architecture diagrams

Release 0.26.0 (milestone 4a, `docs/diagrams/notes/milestone-4a.md`). Support is claimed by level (decision D3): **render**
and **edit** on the subset below. There is no reader.

A view of a version-2 model (`"schemaVersion": 2`) whose `diagram` is `"gcp"` is a Google Cloud architecture
diagram. It is drawn by `lib/umlimator-all.js` (`umlimator/all`), which the CLI's page inlines; `lib/umlimator.js`, what
a map host loads, draws it as plain cards with a warning. The vocabulary is `docs/diagrams/model.md` §2, row 27; the
example is [`examples/bookshop-gcp.json`](../../examples/bookshop-gcp.json).

Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft.

## The subset

| Piece | In the model | Drawn as |
|---|---|---|
| Group | `gcp.Zone`, its kind in `props.zoneType`: `project`, `region`, `zone`, `network`, `subnetwork`, `generic` | a box holding what it owns by `parent`, at any depth, titled "<label> [<kind>]" ("europe-west1 [Region]"); dashed for a region and a zone, solid otherwise; no group icon (decision 10). A group holding nothing shown is a closed card of that title |
| Product | `gcp.Product`, its icon in `props.icon`, the pinned pack's own id (`Cloud-Run`) | a card 180 to 280 px wide and 56 px tall at least on the map's box outline: the icon, 32 px, on a 39 px tile (dark under a white icon), from the host's `icons` table at `gcp/<id>`; beside it the label (13 px, two lines of 180 px) and under it the full service name (11 px, muted), from the table's `name`, else the id with hyphens as spaces; a label equal to the name drawn once. With no icon in the table, a 24 px outlined square, the glyph |
| User | `gcp.User` | the map's person shape, no icon |
| Line | `gcp.Path` | solid, an open arrow at `to`, its label cut at 280 px. It may start or end at a group, drawn to the group's border |
| Google's legal line | none: drawn by the type | 10 px, muted, under any picture that draws a Google icon, in a card or the legend, inside its bounds; the legend and `describe()` end with it. Its words are in `icons/packs.json` and in the type, and a test keeps them equal |

An icon is drawn only through `<image>` from a `data:image/` URL, with `preserveAspectRatio="xMidYMid meet"`, never cropped,
filtered, masked, faded or transformed, in screen, print or PDF; any other entry (another address, markup) draws the glyph.
The module never fetches an icon: the CLI builds the table from a pack the user fetched after reading Google's terms
(`umlimator.py pack fetch gcp`, the README's Icons section), and a host gives its own the same way.

Rules (`src/cloud/cloud.js`): errors `group-kind` (the kind is one of the row's) and `line-inside` (no line between a
group and what it holds: it cannot be drawn, and connecting one is refused); warnings `group-nesting` (a region in a project; a network in a project or a region; a subnetwork in a network; a zone in a region or a subnetwork; `generic` anywhere), `icon-set` (a product has an icon) and `icon-missing` (where the host gave the pack, the product's icon is in it). `umlimator.py check` names an id the pack lacks with its three nearest ids, and an id an alias moved.

**Departures:** no claim to follow Google Cloud's architecture diagram guidelines; groups are drawn in the typed
look, not the vendor's colours; the full service name is drawn under the label, derived from the pack's id where the
pack gives no other.

## Left out

`notes/milestone-4a.md` §13: the vendor's group icons and colours (decision 10); icon search in the editor beyond the
properties panel's field (decision 9); older pack versions side by side; a reader. Drawing a line from or to a group by
pointer or `L` (the canvas's handle ends on cards: such a line is written in the model, §5.7's As built); an `update()` that
changes only the `icons` table keeps the view's picture (a later core package). And XMI, copy and paste, per-type `diff()` writers.

Layout limits, with port repair and rerouting off (`repair: false`, `reroute: false`, §11), measured on the example and
`tests/cloud-stress.json`:

- The example crosses once laid out right and once down; no line runs through a node.
- `tests/m4a-fixtures.test.mjs` pins the stress file. Its `edge-cases` view (five levels of groups, an icon the pack lacks,
  an alias a re-pin moved, a line from a group to a product in a sibling group, one between a group and what it holds, a
  white icon and a coloured one, a wrong kind, a subnetwork outside a network, a product with no icon) is clean both ways but
  for the line inside its group, which is not drawn; `ec-no-product` draws no legal line. Its `all` view (60 products in
  five levels of groups, 80 paths) crosses 52 times laid out right and 54 down, where one path's label lies on another.
- A label is wrapped to two lines of 180 px, the full name to two, then cut with an ellipsis; both are in the card's
  accessible name, `describe()` and the PDF.

## Writers: what each shows of a Google Cloud diagram

| | SVG: `handle.toSVG()`, `umlimator.py stills` | PNG: `handle.toPNG()`, `umlimator.py stills` | PDF: `umlimator.py pdf` |
|---|---|---|---|
| Cards, groups, lines and their labels | Yes | Yes | Yes, in vectors |
| The vendor's icons | Those the host's `icons` table gave, as `<image>` from data URLs, scaled only; without the table, glyphs | The same, as pixels | The same, in the picture |
| Google's legal line | Under the picture, inside its bounds, wherever a Google icon is drawn | The same | The same, and in the legend |
| The legend | No: the legend is a piece of the page | No | Yes, under the picture: each icon drawn with its full name, the group kinds, the line, then Google's legal line |
| Text | Text, in the page's font family; not embedded unless `fontCSS` is given | Pixels | Selectable text |
| Accessible names | Each card's and group's `aria-label` kept | None | None |
| Tables | None | None | "Elements": a product's and a group's kind; a product's full name, icon id and group. "Lines": each line's ends and label |

A picture made where no pack was fetched, or with `UMLIMATOR_NO_PACKS=1` (every page and still this project publishes),
carries glyphs and full names only.

## Accessibility

Every piece has a name: "Product Shop API, Cloud Run"; "Region europe-west1, holding 3 elements"; a card drawn
with a glyph ends ", icon not available". The reading order is the groups and what they hold, depth first, then the
lines; `describe()` is the groups as an outline, each product with its full name, then the lines, then Google's legal line where a Google icon is drawn.
Text reads at 4.5:1, outlines and glyphs at 3:1 in both themes (`tests/cloud.html`, `tests/m4a.html`). Every gesture has a
key (`docs/editing.md`).

## Performance (P1)

`tests/m4a-fixtures.test.mjs` on `tests/cloud-stress.json`'s `all` view (60 products in five levels of groups, 80
paths), CPU time, best of five after a warm-up, on an Apple laptop under load (14 Nov 2026): a full layout and its SVG
155 to 180 ms; a product renamed 165 to 195 ms, its icon changed 27 to 31 ms, moved into another group 190 to 216 ms, a
path added 175 to 223 ms. Over the 100 ms target, as decision 20 expected: CI's 1 s is the gate and the figures are
printed and recorded in the pull request (4a.6 recorded 259 to 299 ms on CI's runner).

## Tests

`tests/cloud.test.mjs` and `tests/cloud.html` (the definitions, the card, groups, icons, glyphs, Google's legal line, the rules each passing and
failing, every gesture by pointer and key, a 30-step session); `tests/cloud-minimal.json` and `tests/cloud-stress.json` with
`tests/m4a-fixtures.test.mjs` and `tests/m4a.html`; `tests/packs.py` (the packs, on a synthetic pack: no vendor icon is
committed or fetched by CI); `tests/cli.py` (render, check, stills, pdf, the diff Action, map-repo's CLI); `tests/mcp.py`;
`tests/notation.html` (the open arrow, groups dashed by kind); `tests/atlas.test.mjs` (opened from the opening plan's
"On Google Cloud").
