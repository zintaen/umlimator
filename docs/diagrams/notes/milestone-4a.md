# Milestone 4a design note: cloud architecture diagrams and the mindmap

Status: **approved** by the maintainer 14 Nov 2026, with every recommendation taken. Written against `main` at fcb953b
(stage 5 complete on `main`, 5.8 merged as #232; stage 6's 6.0, 6.1 and 6.2 merged, #237 and #238; 6.3 to 6.7 open or to
come). The approved notes of milestone 2 (`origin/milestone-2`, e4577cc) and milestone 4b (`origin/milestone-4b`,
c27c264) were read on their branches for the files they share with this one. Milestone 3's note is not written yet.
Symbols are named, not line numbers. Revised on 14 Nov 2026 after two reviews (the engineering one measured
`delete` and `validate()` on deep chains; the other read the note against the icon terms of 13 Nov 2026).

Milestone 4a ships release 0.26.0: the Google Cloud and Azure architecture diagrams (`gcp`, `azure`, `model.md` rows 27
and 28) and the mindmap (`mindmap`, row 25). The AWS diagram (`aws`, row 26) is built and tested in the same family, behind
a switch that stays off until AWS answers the question the maintainer sent on 14 Nov 2026 (§2.3). The plan's engine work
(`plan.md` §5, row M4a): icon packs as data, fetched and pinned; the tree strategy. Its reader: Mermaid mindmap. 0.27.0
(BPMN) follows it, and 0.27.0 is not followed by 1.0.0 (`plan.md` §1).

## 1. What this note settles

| # | Point | Decision (recommended) | Section |
|---|---|---|---|
| S1 | What 0.26.0 ships | `gcp`, `azure` and `mindmap` at the definition of done, and the Mermaid mindmap reader and writer. `aws` is written, reviewed and tested with its siblings, but its registration and its pack row are off (decision 1); turning it on is work package 4a.8, which waits for AWS's answer | §2.3, §4.7 |
| S2 | The icon terms (answered 13 Nov 2026) | Never bundled; downloaded only when the user asks, from a pinned direct address, checked by SHA-256; the vendor's terms shown and a yes given before the first download; cached per user, never in what this project publishes; drawn unmodified, scaled only, on a tile for contrast; the full service name beside each icon; Google's legal line wherever Google's icons are drawn; a "not affiliated" line in the docs | §2.3 |
| S3 | Icon packs as data | `icons/packs.json`: one row per pack (vendor, label, the zips' addresses, SHA-256 and sizes, where each icon lies in a zip, the terms, the legal line, names, aliases). No AWS row until 4a.8. The module never fetches; the CLI fetches on `umlimator.py pack fetch <pack>` only | §4.1, §4.2 |
| S4 | The fetcher | Our own code, `umlimator_packs.py`, called by `umlimator.py pack`. `tools/fetch_icons.py` stays upstream's, unmodified, and is not called for packs | §4.2 |
| S5 | The terms and the yes | Shown in full before any byte of the pack is downloaded, with the "not affiliated" line; a yes typed at a terminal, or `--accept-terms <pack>@<label>` naming the pack and its label when there is none, which still prints the terms and is recorded as given by flag. The yes is recorded per pack and label, so a re-pin asks again. Azure's terms are the icons page's, copied word for word and pinned by hash; the zip's `Microsoft_Terms_of_Use.pdf` is checked against its pinned hash after the download (decision 5) | §4.3 |
| S6 | Drawing an icon | From the `icons` table the host gives with the model (the CLI builds it from the cache), keyed `<pack>/<icon>`: `<image>` from a data URL, never inlined markup (`risks.md` S2), on the logo tile maps use (`n-logo`, `n-logo dark` for a white icon). Never recoloured, cropped or reshaped: the icon scaled to 32 px with `preserveAspectRatio="xMidYMid meet"`, on a 39 px tile | §4.5, §5.2 |
| S7 | What cloud diagrams build on | Stage 2's boxes (`ownersOn`) as the deployment type nests them (stage 5), laid out by `layoutTyped` from the host's ranking; an icon card of the family's own; groups as boxes titled with their kind. Not a map view, not the map's 16 px typed card (decision 2) | §5.1 |
| S8 | The full service name | Drawn under the label on every card with an icon id, from the icons table's `name`, else derived from the id (`Cloud-Run`: "Cloud Run"). The model stores the pack's own ids; an alias table in `icons/packs.json` maps renamed and short ids | §5.2 |
| S9 | Google's legal line | Drawn under any picture that draws a `gcp/` icon, in a card or the legend, and printed in the legend, the PDF and every document that shows one. Its words are held twice, in `icons/packs.json` and in the type, and a test keeps them equal | §5.7 |
| S10 | Existing logos from Microsoft's zip | The logo manifest's three rows read from Azure's icon zip (`azuredevops`, `foundry`, `containerapps`) are drawn from the Azure pack once the user fetched it, and are never downloaded by a render again: a stated exception to "maps draw exactly as now" for a map naming them with no cached copy. `entra`, from Microsoft's Entra package, follows the same rule (decision 7) | §4.6 |
| S11 | The tree strategy | `src/layout/tree.js`, `layoutTree(input)`: a pure function, no DOM and no model, as the time axis and the time ruler are. Each subtree takes a band; bands are stacked; a topic is centred on its children's band. Linear, iterative, never overlapping and never crossing by construction | §6 |
| S12 | Sides | A first-level topic takes `present.<id>.side`; the rest go, in order, to the side whose first-level bands are shorter so far (px), right on a tie. Deeper topics follow their branch | §6.4 |
| S13 | The mindmap's look | The root a rounded box at 15 px, every other topic a rounded box at 13 px, wrapped to four lines of 200 px; branches drawn as curves by the type, each first-level branch in a colour of the map's kind palette, text always `--um-text` (decision 14) | §7.1 |
| S14 | Editing a mindmap | `N` adds a child of the selected topic; Alt + arrows move a topic in the tree (up and down among its siblings, towards the root to promote it, away to demote it into the sibling before it, across the root to change side); Delete hides its branch from the view; Shift + Delete deletes the branch. By pointer: a drop on a topic reparents, a drop between siblings reorders, a first-level topic dropped on the root's other half changes side | §7.3 |
| S15 | The Mermaid mindmap reader | Against Mermaid 12.3.0's mindmap page. Indentation is the tree; shapes, `::icon()`, `:::class` and Markdown strings are kept under `ext.mermaid` and written back, each reported `approximated`; front matter's `layout` reported `skipped`. Hostile input: 1 MiB, 64 levels, linear ids, prototype-safe tables, never a throw, each hostile file under 1 s | §8 |
| S16 | A deep `parent` chain | `apply()`'s `delete` recurses in `take` and throws a `RangeError` past about 4,000 levels (verified: 3,000 deleted, 6,000 throws at `take`, Node 24); taking 20,000 elements out of their lists one `splice` at a time costs 128 ms; `validate()`'s cycle check walks every element's whole chain, 9.5 s at 20,000 deep. A mindmap is the first type an agent may write that deep. 4a.2 makes all three linear, in the core, within the share (decision 18) | §2.4 |
| S17 | The core's budget (C5) | Milestone 4a's share is 700 B. 4a.2 targets 130 B; nothing else touches the core | §2.4 |
| S18 | What this project publishes | No vendor icon in the repository, the npm package, a release's assets, the gallery, the stills, the site or CI's artifacts. CI tests packs with a synthetic pack it builds itself and never contacts a vendor. A user's own render carries the icons they fetched (decision 6) | §4.4 |
| S19 | P1 | `repair: false` and `reroute: false` on every cloud layout; CPU, best of N after a warm-up; CI holds 1 s and prints each common edit against 100 ms; timed tests titled " (timed)" and run serially. The printed figure is recorded in the pull request, not a stop (decision 20) | §11 |
| S20 | The Bookshop atlas | The three examples join it with prefixed ids (`mm-`, `gcp-`, `az-`; `aws-` in 4a.8). The mindmap gains a "Hosting" branch whose topics open the cloud views; the mindmap is a root view of the atlas (decision 19) | §10.3 |
| S21 | Order with the work in flight | Code starts once this note is approved and M2.0 and 4b.0 have merged (`tools/build.mjs`'s order), with at most two of the project's five code lanes, behind lanes already open; 4a.1 and 4a.6 first. 0.26.0 after 0.25.0 | §12.3 |
| S22 | Departures | No claim of any vendor's diagram guidelines; groups drawn in the typed look, not the vendors' colours; the mindmap has no standard and claims none | §13 |

What is left out is in §13.

## 2. Where milestone 4a starts

### 2.1 What it builds on

| Piece | Built in | Used as it is | New here |
|---|---|---|---|
| The registry's hooks (`src/core/registry.js`, `src/typed/*.js`) | Stages 1 to 6 | `layout.run(model, view, { measure, pos, memo })`, `layout.key`, `draw`'s under and over layers, `boxes`, `owners`, `validate`, `rules`, `describe`, `rows` and `word` (the PDF's), `refs`, `edits` with `connect`, `moveTo`, `add`, `remove`, `rename`, `key` and `{ pick, then }` | |
| Nested boxes | Stage 2 (`ownersOn`, `src/uml/owners.js`), deepened by stage 5's deployment type (`src/uml/deployment.js`) | Groups as boxes from `parent` with `boxTypes`, `qualify: false`; a drop into a box emits `reparent`; a line ending on a box's border (`layoutPass`'s `boxEnd`) | The group's frame and title |
| The layered layout for typed views (`layoutTyped`) | Stage 1, with stage 5's `labelGaps` | Host ranking, `direction`, `cut`, both flags off | |
| The map's card shapes (`SHAPE`, `src/draw/shapes.js`) | One card-shape style since 0.21.0 | `box`'s outline for the service card; `person` for `gcp.User` (read only) | |
| The logo tile (`n-logo`, `src/canvas/styles.js`) | Maps | A white tile in both themes (`--um-logo-tile`), a dark one (`--um-logo-tile-dark`) for a white icon | |
| The CLI's icons (`icon_bytes`, `icon_table`, `page_model`, `cmd_pin_icons` in `umlimator.py`) | Maps | The cache folder, the page's `icons` table, `UMLIMATOR_OFFLINE`. `pin-icons` is not used for packs: it hashes single files `tools/fetch_icons.py` left in `icons/` and moves them to the cache, while a pack is pinned as whole zips by address, size and hash in `icons/packs.json` and is never in `icons/` | Pack rows: read from the cache only, never fetched by a render |
| A layout strategy of its own | Stage 3's time axis, stage 6's time ruler | The shape of a pure strategy: sized input, geometry out, problems listed, never `warn()` | `src/layout/tree.js` |
| The Mermaid readers (`src/readers/mermaid-*.js`) | Stages 1, 3, 4 | Hand-written and linear, a size limit, a report (R1, R2), ids from the source's names (R3), `%% id:` comments, Mermaid 12.3.0 pinned (R4), `umlimator.py import` through Node (R7) | |
| The Bookshop atlas (`tools/atlas.mjs`) | 4.10, grown by 5.8 and stage 6 | Merge by id, stop on a disagreement, `KEYS` | `iconPacks` at the file level (§10.3) |

### 2.2 What was read at fcb953b

| # | What was read | What it says | Where it is handled |
|---|---|---|---|
| Q1 | `mapContext`'s typed path (`src/map/context.js`, `ownLayout`) | A type's `layout.run` and `layout.key` get `D`, the context's copy of the model, which holds the `icons` table a host or the CLI gave with it | §4.5 |
| Q2 | `svgOf`'s mark (`src/draw/svg.js`) | An icon with `src` is drawn as an `<image>` on a tile `n-logo` (`n-logo dark` when the entry says `dark`); a map card's is 28 px, a typed card's 16 px | §5.1, §5.2 |
| Q3 | The theme (`lib/umlimator-theme.css`) | `--um-logo-tile` is `#ffffff` and `--um-logo-tile-dark` `#1b1f23`, in both themes: a coloured icon sits on white in the dark theme too, a white icon on dark in the light theme too. The terms' tile rule holds as drawn today | §4.5 |
| Q4 | `icon_bytes` (`umlimator.py`) | The first render that needs a brand mark downloads it from the manifest's `url` (a `zip#member` reads one file from a package), checks its SHA-256 and caches it in `~/.cache/umlimator/icons` (`$UMLIMATOR_ICON_CACHE`); no terms are shown. `UMLIMATOR_OFFLINE` makes every fetch fail | §4.2, §4.6 |
| Q5 | `icons/manifest.json` | 82 entries. Three read single files out of Microsoft's `Azure_Public_Service_Icons_V24.zip` (`azuredevops`, `foundry`, `containerapps`); one, `entra`, reads Microsoft's Entra icon package. None is AWS's or Google's. No example or test names the four | §4.6 |
| Q6 | `tools/fetch_icons.py` | Upstream's (caru-ini/stack-diagram at 30cbbb7), checked unmodified by CI. It finds AWS's zip by scraping AWS's icons page, reads Google's two unversioned zips (`core-products-icons.zip`, `category-icons.zip`) and Azure's `V<n>` zip, with alias tables (`s3` to `Amazon-Simple-Storage-Service`, `frontdoor` to `Front-Door-and-CDN-Profiles`) and a white-fill check | §4.2 |
| Q7 | The target examples 26 to 28 against the packs' file names | Their icon ids are short forms the packs do not use: `Amazon-S3`, `Amazon-SQS`, `Amazon-ECS` (AWS's files say `Amazon-Simple-Storage-Service`…), `Front-Door`, `Storage-Account`, `App-Service` (Azure's say `Front-Door-and-CDN-Profiles`, `Storage-Accounts`, `App-Services`). Their `iconPacks` labels (`2026-07-31`, `2025`, `V25`) are placeholders | §3, §10 |
| Q8 | `26-aws.json` | Two lines start at a group: `private-a-nat` (a subnet to a NAT gateway in a sibling subnet) and `vpc-monitoring` (the VPC to a service in the region that holds it). `layoutPass` ends a line on a box's border and refuses one between a box and what it holds | §5.4 |
| Q9 | `apply()`'s `delete` (`src/core/apply.js`) | What an element owns by `parent` goes with it, through a recursive `take`; a chain of 3,000 topics deletes, one of 6,000 throws `RangeError` (Node 24.20.0's default stack). Only `take` recurses: the walk up to the nearest owner left is a bounded loop. Without the recursion, a flat 20,000-topic root deletes in 128 ms: each element leaves its list by `indexOf` and `splice`, O(k·n). `set` and `hide` hold at 20,000. `validate()` does not throw but `typedProblems`' cycle check (`src/core/model.js`) walks from every element up its whole `parent` chain, quadratic: 0.4 s at 5,000 deep, 2.1 s at 10,000, 9.5 s at 20,000 | S16, §2.4 |
| Q10 | The atlas against the four examples (`examples/bookshop-atlas.json`) | `25-mindmap.json`'s `storefront` is a map card there and its `checkout` a view's id; the cloud files' `queue`, `db`, `worker`, `api` are map cards and `email` a lifeline; the three cloud files share 6 to 13 ids among themselves (`db`, `queue`, `region`, `assets`…) with other types. `tools/atlas.mjs` writes no `iconPacks` (`KEYS.file` lacks it) | §10.3 |
| Q11 | Mermaid 12.3.0's mindmap page (`docs/syntax/mindmap.md` at `mermaid@12.3.0`, read 14 Nov 2026) | Indentation sets the level, relative to the rows before (an unclear indent takes the nearest shallower row as parent); shapes `[ ]`, `( )`, `(( ))`, `)) ((`, `) (`, `{{ }}` and the default; `::icon(...)` and `:::class` on the line after a node; Markdown strings in backticks; front matter's `layout: tidy-tree`; one root. The page calls mindmaps experimental | §8 |
| Q12 | `umlimator_import.py` (`mermaid_typed`, `TYPED`) | A Mermaid source is routed by its first keyword to a JavaScript reader through Node; `mindmap` is not routed today | §8.4 |
| Q13 | The canvas's keys (`src/canvas/render.js`, `src/canvas/pieces.js`) | `E F L N O P V W` are the canvas's; a type's `key` hook hears a key before the canvas only where `rename` is offered | §5.6, §7.3 |
| Q14 | The core's size | `gzip -9 < lib/umlimator.js \| wc -c`: 185,426 B at fcb953b; the cap is 189,697 B | §2.4 |
| Q15 | `lib/umlimator-all.js`'s surface | `registerDiagramType` is not exported; a `src/` file's `export` is dropped by the build. `tests/type-hooks.html` and `tests/typed-edit.html` import `render` and the registry from `../src/` | §4.7, §10.1 |
| Q16 | `examples/bookshop.html`, `examples/stills/overview.svg`, `api.svg` | Hold 8, 7 and 1 `data:image` URLs today: map brand logos, from the maintainer's cache | §2.5 |

### 2.3 The icon terms, as answered (S2)

The maintainer's questions on the vendors' terms were answered on 13 Nov 2026; this is their summary, the rules every
package keeps.

| Rule | What it means here |
|---|---|
| Never bundle icons | No vendor icon in the repository, the npm package, `lib/`, a release, the gallery or CI (S18) |
| Download only at the user's explicit request | `umlimator.py pack fetch <pack>` only. A render, `check`, `stills`, `pdf`, the MCP server and the module never download a pack |
| From a pinned direct address, checked by SHA-256 | `icons/packs.json` holds each zip's address, size and SHA-256; nothing is scraped. AWS's zip name carries a SHA-1, which is not relied on. Google's files are unversioned: pinned by hash, they will change under the pin and need re-pinning (§4.2) |
| Show the vendor's terms and get a yes before the first download | §4.3: before any byte of the pack. Azure: the terms on Microsoft's icons page, word for word; the zip's `Microsoft_Terms_of_Use.pdf` checked against its pinned hash after |
| Cache per user, never in published output | `<icon cache>/packs/` (S18, decision 6) |
| Render icons unmodified | Scaled only; a coloured icon on a light tile and a white one on a dark tile (Q3) |
| The full service name beside each icon | S8 |
| Google's legal line wherever Google icons are used | S9 |
| A "not affiliated" line in the docs | `README.md`'s Icons section, each cloud conformance note, `pack fetch`'s terms prompt, `pack list`, and the gallery cards and atlas page of the cloud views: "Umlimator is not affiliated with, endorsed by or sponsored by Amazon Web Services, Google or Microsoft." |
| AWS is gated | Until the maintainer's emailed question to AWS (sent 14 Nov 2026) is answered, nothing offers AWS's icons: no `aws` row in `icons/packs.json` and the `aws` type not registered. Google and Azure ship. 4a.8's scope is set by AWS's reply, with any conditions it attaches (a trademark notice, an attribution, no direct fetch); the lead records the reply in `docs/diagrams/README.md`'s open questions, as the log of 14 Nov 2026 asks |

How AWS is gated:

| Option (decision 1) | For | Against |
|---|---|---|
| **(a) The whole `aws` type off: written and tested with the family, its registration behind `CLOUD_AWS = false` in `src/cloud/cloud.js`, no pack row; an `aws` view draws as plain cards with the registry's warning; 4a.8 turns both on (recommended)** | Nothing named AWS is offered before AWS answers; the shared code is reviewed once, with its siblings; turning it on is a small, separate pull request | About 2 kB of AWS's tables in `lib/umlimator-all.js` that do nothing until then |
| (b) The type on, only the pack off: AWS views draw with glyphs and full names | Users get AWS diagrams now | An "AWS diagram" with none of AWS's icons, shown in the gallery, before AWS answers |
| (c) AWS out of the milestone, built after the answer | No dormant code | The family is designed for three and tested for two; AWS's groups (five levels, a security group) are the deepest case and would be tested last |

If AWS answers no, 4a.8 is replaced by the maintainer's choice then: an `aws` type with glyphs only, or none.

### 2.4 The core's budget (C5, S17)

The cap is 189,697 B (0.16.0's 164,954 B plus 15%); the core is 185,426 B at fcb953b (Q14). The maintainer's split of
13 Nov 2026 gives milestone 4a 700 B.

| Change | File | Package | Target |
|---|---|---|---|
| `delete`'s `take` made iterative (a stack), so a deep `parent` chain deletes (S16) | `src/core/apply.js` | 4a.2 | 40 B |
| The deleted elements taken out of their lists with one `filter` per list, not one `splice` each, so a 20,000-topic delete meets 100 ms | `src/core/apply.js` | 4a.2 | 40 B |
| `typedProblems`' cycle check made linear: an element whose chain was walked is remembered, and a later walk stops at it | `src/core/model.js` | 4a.2 | 50 B |

As built (4a.2, 14 Nov 2026): 266 B in all, 185,873 B to 186,139 B, over the 130 B target and within the 700 B share,
since review added two linear walks to `delete` (below). The deleted elements leave each list they were in by one pass
written back into the same array, each element's first place only, as `indexOf` found it, so a list a view or an owner holds stays that list; the cycle check
marks each element with the walk that reached it first, and a walk that comes back to its own mark has found a cycle,
whose members are said in the order the old check said them. Measured on a loaded machine (CPU): `delete` of a 20,000
chain's root 18 ms and of a flat 20,000 root 13 ms; `validate()` of a 20,000 chain 9 ms. The tests use `uml.Package`
for topics, since the mindmap type is 4a.4's, and add a flat 100,000 root under the 1 s ceiling, which the `splice`
loop took 2.5 s over. Review found two more quadratic walks in `delete`, now linear: what stays under a gone chain and
is not taken with it (a view's fragment, a line with `parent`) finds its nearest owner left once per gone id, not once
per survivor (5,000 fragments under a 20,000 chain: 6.5 s before, 70 ms after); and lines to lines cascade from an index
of what names what, in one pass whatever their order (3,000 listed last first: 469 ms before, 3 ms after). A third case
stays: a view's `nodeIds` loses gone ids through `clear()`, shared with `hide` and outside 4a.2's Owns, one `splice`
each, so a 20,000-topic delete meets 100 ms only where the gone ids sit together in that list (10,000 scattered through
a breadth-first list: 65 ms; 20,000 through 40,000: 170 ms, loaded machine); a later package owning `clear()` makes it
one pass too.

Everything else is in files listed in `tools/build.mjs`'s `ALL` only: the tree strategy, both types, their shapes, rules,
hooks and the reader. The icons reach the cloud type through the model copy its hook already gets (Q1), so `svgOf` does
not change.

| Option (decision 18) | For | Against |
|---|---|---|
| **(a) All three rows in 4a.2, about 130 B within the share; the rest of the share to the reserve at 0.26.0 (recommended)** | A model an agent writes cannot make an edit throw or a validate stall; every type gains it; tests pin 20,000 levels for `delete` and `validate()` | Touches `apply.js`, which M2.1 also edits, and `model.js` (§12.4) |
| (b) `take` only (40 B); the deep-chain tests capped at 5,000 levels, which `validate()` checks in 0.4 s | Fewest core bytes | A deep mindmap an agent writes stalls every validate in the editor, the CLI and `check.mjs`; a 20,000 delete costs about 130 ms |
| (c) Leave the core: the reader reads 64 levels at most and the mindmap warns past 64 | No core byte | A model from JSON or the MCP server can still make `delete` throw and `validate()` stall; the warning does not stop it |

### 2.5 Rules every package keeps

- **Maps draw exactly as now**, but for decision 7's three logo rows. The geometry hashes (`bench/expected.json`), the
  examples' stills and every map test hold in every pull request.
- **Every typed example draws exactly as now.** `tests/core-diet.*` and each type's tests are unchanged.
- **The API is additive only.** The types and the reader are internal, in `lib/umlimator-all.js`; `umlimator.py pack` is a
  new command; `icons/packs.json` is new; the three logo rows of decision 7 change where they are read from, not their
  names.
- **Nothing after `layoutTyped` edits what it returned** (stage 4 §2.4): the legal line, glyphs and branch curves go on a
  copy. Each type lays a view out twice from one memo and checks the two pictures are byte-identical.
- **No vendor icon is committed, packed, published or downloaded by CI** (S18). Map logos are data URLs in committed
  pages today (Q16), so the test looks for pack content only: it fails when a committed file under `examples/` or `docs/`
  holds an `icons` key with a `/` (`<pack>/<id>`), or the synthetic pack's marker, or when `icons/` holds an SVG not in the
  manifest's Lucide rows. Every render whose page or stills are committed (the examples' pages, the gallery, the atlas;
  `docs/` and `examples/README.md` give the commands) runs with `UMLIMATOR_NO_PACKS=1`, which makes `page_model` skip
  pack rows and keep map logos, so a maintainer's cached packs never reach the repository; the test catches a render
  that forgot it.
- **No host application's name** appears in code, tests or docs (`plan.md` §8).

## 3. Vocabulary

| `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|
| `mindmap` | `mindmap.Topic` | | | The tree is `parent`; a topic with none is a root. A view shows one tree: one shown topic has no shown ancestor (`mindmap-root`). `present.<id>.side`: `left` or `right`, read on a first-level topic only. Children are drawn in the order of the view's `nodeIds`. `ext.mermaid` keeps a topic's Mermaid shape, icon, classes and Markdown flag (§8) |
| `aws` | `aws.Group`, `aws.Service`, `aws.Resource` | | `aws.Connection` | As the row, and: `props.icon` is an id of the pinned pack's own (S8). Off until 4a.8 |
| `gcp` | `gcp.Zone`, `gcp.Product`, `gcp.User` | | `gcp.Path` | As the row, with S8's ids. A user is drawn with the map's `person` shape and no icon |
| `azure` | `azure.Group`, `azure.Service` | | `azure.Connector` | As the row, with S8's ids |
| (model) | | | | `iconPacks: { <pack>: <label> }` records the label of the pin the model's icons were chosen from. The module does not read it; `umlimator.py check` says when it differs from the release's pin and which ids the alias table moved |

What changes in the target examples (4a.0): the icon ids become the packs' (`Amazon-Simple-Storage-Service`,
`Front-Door-and-CDN-Profiles`, `Cloud-Run`…, Q7); the ids take the atlas's prefixes (§10.3); the mindmap gains its
"Hosting" branch. The `iconPacks` labels are set by 4a.7 from the pins 4a.3 makes.

As built (4a.0, 14 Nov 2026): 25, 27 and 28 take `mm-`, `gcp-` and `az-` before every id, their views' too (`mm-plan`,
`gcp-on-gcp`, `az-on-azure`), as M2.0 did; 26 keeps its ids until 4a.8. The icon ids moved are Q7's six and two more
the packs name otherwise: `Amazon-SES` to `Amazon-Simple-Email-Service` (the upstream fetcher's alias) and `Key-Vault` to
`Key-Vaults` (the upstream fetcher's own example); Google's ids are left as written (Q7 found none to change), and 4a.3's
pins check every id, with `check`'s nearest ids for any that still differ. "Hosting" is a first-level topic on the left
(`mm-hosting`, `mm-on-gcp`, `mm-on-azure`); its topics carry no `opensView` in the target, since a standalone file has no
cloud view to open and `tools/atlas.mjs` stops on a node that opens a view already: 4a.7's links file sets both.

| Option, the ids `props.icon` holds (decision 8) | For | Against |
|---|---|---|
| **(a) The pack's own ids, derived from its file names; the alias table maps short and renamed ids (recommended)** | The full name derives from the id; an id is found in the zip by one pattern; a renamed icon is one alias row | Long ids (`Amazon-Simple-Storage-Service`) |
| (b) Short ids (`Amazon-S3`) with a table to the pack's | Short to write | A table of hundreds of rows to keep per pack; the full name needs it too |

## 4. Icon packs as data

### 4.1 `icons/packs.json` (4a.3)

```jsonc
{ "gcp": {
    "vendor": "Google Cloud", "label": "2026-11-14",           // the label models record in iconPacks
    "zips": [ { "url": "https://services.google.com/fh/files/misc/core-products-icons.zip", "bytes": 0, "sha256": "…" },
              { "url": "https://services.google.com/fh/files/misc/category-icons.zip", "bytes": 0, "sha256": "…" } ],
    "icons": "(?:Unique|Category) Icons/([^/]+)/SVG/[^/]+\\.svg",   // a member's path; group 1 is the id, spaces as hyphens
    "terms": { "url": "https://cloud.google.com/icons", "read": "2026-11-14", "text": "…", "sha256": "…" },
    "legal": "…",                                               // GCP_LEGAL, the same words
    "names": { },                                               // an id whose derived name is wrong: its full name
    "aliases": { } },                                           // an old or short id: the pinned id
  "azure": { "vendor": "Microsoft Azure", "label": "…", "zips": [ { "url": "…/Azure_Public_Service_Icons_V<n>.zip", "…": "…" } ],
    "icons": "Icons/[^/]+/\\d+-icon-service-([^/]+)\\.svg",          // `10261-icon-service-Azure-DevOps.svg`: `Azure-DevOps`
    "terms": { "url": "https://learn.microsoft.com/azure/architecture/icons", "read": "…", "text": "…", "sha256": "…",
               "member": "Microsoft_Terms_of_Use.pdf", "memberSha256": "…" },
    "names": { }, "aliases": { } } }
```

- **Ids.** Group 1 of `icons` is the id, spaces as hyphens. Google: `Unique Icons/Cloud Run/SVG/…svg` gives `Cloud-Run`,
  name "Cloud Run". Azure: the numeric prefix and `-icon-service-` are stripped, `…/10021-icon-service-Front-Door-and-CDN-Profiles.svg`
  gives `Front-Door-and-CDN-Profiles`, name "Front Door and CDN Profiles". The name is the id with hyphens as spaces
  unless `names` gives it; a test holds a `names` row for a case the rule gets wrong (an id with a hyphen of its own).
- **Duplicate ids.** Azure files one icon under more than one category folder. The member first in the zip's order wins;
  `pack fetch` lists the others once, and a duplicate id whose files differ in hash is an error at pin time, fixed by an
  alias row. Decision 7's three rows take their ids by the same rule (`Azure-DevOps`, `AI-Foundry`,
  `Container-Apps-Environments`).
- **The words.** `terms.text` and `legal` are not placeholders when 4a.3 merges: 4a.3's pull request quotes both, with
  their address and the date read, in this section, so the maintainer approves the words themselves; `terms.sha256` pins
  them. Google's icons page carries no licence text (`proposal.md` §6.5): what is shown as Google's terms is the page's
  own usage statement, the link to Google's brand guidance, and the legal line, each word for word.

- The patterns are matched against a zip's member names, which are short; each pattern is anchored and has no nested
  repetition (R2).
- The rows are pinned by the maintainer from the vendors' own addresses, read on the vendors' icon pages, never from a
  third-party bundle (`proposal.md` §6.5). A re-pin is a pull request changing `bytes`, `sha256` and `label`, with the
  aliases the new files need.
- No `aws` row until 4a.8 (decision 1).

As built (4a.3, 14 Nov 2026). The words, for the maintainer to approve:

- **Azure**, `terms.text`, from https://learn.microsoft.com/en-us/azure/architecture/icons/ read 14 Nov 2026 (the
  page's "Icon terms", above "I agree to the above terms" and the download link), word for word: "Microsoft permits the
  use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and
  display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all
  other rights." The page links `Azure_Public_Service_Icons_V25.zip` (label `V25`, 1,045,239 bytes by the server's
  `Content-Length`).
- **Google**, `terms.text`, from https://cloud.google.com/icons read 14 Nov 2026: the page's usage statement, word for
  word ("Welcome to the official library for Google Cloud product icons. Here you can find the Google Cloud product icons
  you need for your diagrams, technical documentation, and more."), the brand guidance's address
  (https://about.google/brand-resource-center/rules/; the icons page links none, so Google's own rules page is named),
  and the legal line. The page carries no legal line of its own: `legal` is "Google Cloud and the Google Cloud logo are
  trademarks of Google LLC.", Google's usual trademark attribution, which the maintainer confirms or replaces with the
  words of the answer of 13 Nov 2026 (one edit of `text`, `legal` and `terms.sha256`). Label `2026-11-14`.
- **Pinned (14 Nov 2026).** Each zip downloaded once from the address above and recorded by `wc -c` and
  `shasum -a 256`; the terms on both pages re-read and unchanged. Google `core-products-icons.zip`: 318,678 bytes,
  `6531a10f…1eece`; `category-icons.zip`: 795,968 bytes, `e5bc3abd…45002`. Azure `Azure_Public_Service_Icons_V25.zip`
  (still the page's link): 1,045,239 bytes, `f293d992…351339`; its `Microsoft_Terms_of_Use.pdf`, `983e83ce…0531c`. A real
  `pack fetch` of each into a scratch cache checks the pins: Google 45 icons (19 products, 26 category icons), Azure 643
  ids, 61 filed more than once (two of them, `Load-Balancer-Hub` and `Workspaces`, differ: the first is kept). What the
  examples' ids found: Azure's `Service-Bus` is `Azure-Service-Bus` in V25 (an alias row); decision 7's three ids are
  there; V25 has no plain Entra ID icon (`Entra-*` services only), so `entra` stays as it is. Google's zips carry no
  `Cloud-DNS`, `Cloud-Load-Balancing`, `Cloud-CDN` or `Pub-Sub` icon, so those cards draw a glyph until Google ships one
  (`check` names the nearest ids).
- **Departures.** The patterns take an optional top folder (`(?:[^/]+/)?`; Azure's zip files its icons under
  `Azure_Public_Service_Icons/Icons/…`), still anchored and with no nested repetition. A duplicate id whose files differ is
  named by `pack fetch` and the first kept, not an error that blocks a user's fetch; the pin's review adds the alias row.
  `entra` keeps its row and gains `"render": "cache"` (read from the cache, never downloaded by a render); the three Azure
  rows lose `url` and `sha256` (the zip's pin covers them) and gain `pack` and `id`. `.github/workflows/check.yml` gains a
  second edit besides `tests/packs.py`'s step: its "every brand logo still downloads" step skips the rows a render never
  downloads (`pack` and `render: "cache"`), which would otherwise fail on every run. `umlimator.py` gains `packs()`, the
  lazy import of `umlimator_packs.py` beside it (as `cmd_import` imports `umlimator_import`), used by the four places this
  row names.
  The messages name the pack by its row's `vendor`: "Google Cloud's file at …" (§4.2) and "download the Microsoft Azure
  icons (V25)" (§4.3). The one line per pack that says how to fetch it (§4.5) is shared by the pack entries and
  `icon_bytes`' three Azure rows, so a render prints it once per pack.

### 4.2 Fetching (4a.3, S4)

`umlimator.py pack fetch <pack>` and `umlimator.py pack list`, in a new `umlimator_packs.py` (`umlimator.py` stays the
entry, as `umlimator_import.py` is for `import`):

1. Refused with `UMLIMATOR_OFFLINE`, or for a pack with no row ("The AWS pack is not offered in this release").
2. The terms are shown and a yes asked (§4.3) before any byte is downloaded, except where the pack and label were
   accepted before.
3. Each zip is downloaded over HTTPS from its pinned address into a temporary file in the cache folder, reading no more
   than its pinned `bytes`; its SHA-256 is checked before anything reads it. A mismatch keeps nothing and says: "Google's
   file at <url> is not the one this release pinned (Google changes these files without a version). A later release pins
   the new one." (A copy that matches the pin is "fetched already" before any download, and a copy of an older pin is in
   a folder a render never reads, so no copy is "still used".) A download shorter than the pinned `bytes` is a failed
   download ("cannot download"), not a changed file.
4. Azure: the zip's `Microsoft_Terms_of_Use.pdf` is hashed in memory; a hash other than `memberSha256` keeps nothing
   and says Microsoft's terms changed, so the pack waits for a re-pin.
5. Kept as `<icon cache>/packs/<pack>/<label>/<n>.zip`, renamed into place (`replacing`, as `icon_bytes` does), with
   `accepted.json` beside it (§4.3).
6. `pack list` prints each pack's label, whether it is fetched and accepted, and the "not affiliated" line.

Icons are read from the zip by member name in memory, never extracted to a path, so a member's name cannot write outside
the cache (zip-slip); the white check (white paint and no other) is the module's own ten lines, the rule of
`fetch_icons.py`'s `white_fill`, so the CLI does not depend on an upstream file being beside it.

| Option, the fetcher (S4) | For | Against |
|---|---|---|
| **(a) Our own `umlimator_packs.py`: pinned addresses only, no scraping (recommended)** | The terms' rules hold by construction; `tools/fetch_icons.py` stays upstream's | A second fetcher next to upstream's |
| (b) Call `tools/fetch_icons.py` for packs | Existing code | It scrapes AWS's page for the zip, fetches icon by icon with no terms and no yes, and may not be edited |

### 4.3 The terms and the yes (S5)

Every pack's terms are shown in the terminal before any byte of it is downloaded, then the "not affiliated" line.

- **Google:** `terms.text` as §4.1 says (the icons page's usage statement, the brand-guidance link, the legal line), with
  its address and the date read.
- **Azure:** `terms.text`, the "Icon terms" of Microsoft's icons page (learn.microsoft.com/azure/architecture/icons), which
  the page shows above its download link, copied word for word with the date read and pinned by `terms.sha256`. After the
  yes the zip is downloaded and checked (§4.2), and its `Microsoft_Terms_of_Use.pdf` must match `memberSha256`, so the
  file Microsoft ships with the icons is the one the maintainer read at the pin. The PDF is kept beside the zip and its path
  printed.
- **The yes.** At a terminal: "Type yes to accept these terms and download the Azure icons (V25)". With no terminal (an
  agent, CI), `--accept-terms azure@V25` is the yes: it names the pack and its label, so a flag carried over from another
  pack or an older pin does not count. The flag path prints the full terms to stdout too, and records `"via": "flag"`.
- **Agents.** The MCP server exposes neither `pack fetch` nor `--accept-terms`. `plugins/umlimator/skills/map-repo/SKILL.md` and `docs/` say an
  agent shows its user the terms text and passes the flag only on the user's yes (§13).
- `accepted.json`: `{ pack, label, terms_sha256, via, date }`, `via` `terminal` or `flag`. A new label or a changed
  `terms_sha256` asks again.

| Option, Azure's terms (decision 5) | For | Against |
|---|---|---|
| **(a) Terms before any byte: the icons page's terms, word for word in `icons/packs.json`, pinned by hash, shown and accepted first; the zip's PDF checked against its pinned hash after the download (recommended)** | Microsoft's file is never on the user's disk before the yes, as the page's own click-through asks; the PDF still guards against terms changed in the zip; nothing parsed | The words shown are the page's, copied at the pin; a change on the page between pins shows at the next re-pin |
| (b) The PDF from the pinned zip, opened as it is; the zip kept only on yes | The very file in the zip | The zip is downloaded before the yes, skipping the page's agreement: against "terms before the first download" |
| (c) Text extracted from the PDF by the CLI | Shown in the terminal | No PDF text extraction without a dependency that is reliable; a wrong word in terms is worse than none |

| Option, how a yes is given (decision 4) | For | Against |
|---|---|---|
| **(a) Typed at a terminal, or `--accept-terms <pack>@<label>`, which prints the terms and is recorded `via: flag`; recorded per pack and label; never exposed by the MCP server (recommended)** | Explicit and specific; scriptable for a user who has read the terms; the record says how the yes came | A flag can still be passed without reading; the skill and the docs say whose yes it is |
| (b) One yes for every pack | One step | Not each vendor's terms |
| (c) A yes recorded once, then renders download as logos do | Close to today's logos | "Only at the user's explicit request" no longer holds for a later render |

### 4.4 The cache and what is published (S18)

The cache is the user's: `<icon cache>/packs/`, where `<icon cache>` is today's (`$UMLIMATOR_ICON_CACHE`, else
`~/.cache/umlimator/icons`). A render reads it and copies the icons it draws into the page it writes, as it copies a
logo today.

| Option, "never in published output" (decision 6) | For | Against |
|---|---|---|
| **(a) This project's outputs never carry a vendor icon: repository, npm package, releases, gallery, stills, site, CI artifacts. A user's own render, export and PDF carry what they fetched, which is the use the vendors grant: diagrams (recommended)** | The rule and the purpose both hold; checked by a test (§2.5) | The gallery's cloud cards show glyphs |
| (b) Icons on screen only: every export draws glyphs | The strictest reading | A cloud diagram can never be shared with its icons, which is what the vendors' terms allow them for |

CI never downloads a pack (S18): 4a.3 builds a synthetic pack in a scratch folder (two small zips of test SVGs, one white,
a PDF named as Azure's, their hashes) and points `UMLIMATOR_PACKS` (a file standing in for `icons/packs.json`) and the
cache at it, serving it from a local `http.server`. `UMLIMATOR_PACKS` redirects pack addresses, so it is test-only: it is
read only when `UMLIMATOR_TEST=1` is set too, and refused with a message otherwise; `risks.md` S2 lists it.

### 4.5 The icons table: the contract between the CLI and the types (S6)

`page_model` (CLI) adds, for every node of a cloud view whose `props.icon` the cached and accepted pack holds (after
aliases), an entry to the model copy's `icons`: key `<pack>/<id>`, value `{ src, dark, name }` (a data URL, the white
flag, the full name from `names` or derived). It adds `<pack>/` with `{ legal }` for Google. A pack not fetched adds
nothing, and one message per pack says how to fetch it. Keys of map logos have no `/`, so the two never meet.

A host that is not the CLI gives the same table with the model (`model.icons`), from icons it fetched under the same
terms; `docs/module-api.md` says so.

| Option, where the drawing gets icons (decision 3) | For | Against |
|---|---|---|
| **(a) The host's `icons` table, as logos come today; the module never fetches (recommended)** | The module keeps "no network calls"; the type reads `D.icons` in its own hook (Q1); no core byte | A host other than the CLI does its own fetching, under the terms |
| (b) The module fetches in the browser | Works without the CLI | Network calls from the core library; the terms' yes would be a page's |

### 4.6 The logo manifest's Microsoft rows (S10)

Today a map naming `azuredevops`, `foundry` or `containerapps` downloads Microsoft's whole icon zip on its first render,
with no terms shown (Q4, Q5).

| Option (decision 7) | For | Against |
|---|---|---|
| **(a) The three rows gain `"pack": "azure"` and the pack's id; `icon_bytes` reads them from the accepted Azure pack and never downloads them. `entra` is no longer fetched by a render: read from the cache if there, else the sigil; if the Azure zip holds an Entra ID icon (4a.3 checks at the pin), its row moves to the pack as the three do (recommended)** | One rule for every Microsoft icon: nothing downloads one without an explicit request and the yes | A stated exception: a map naming the four, on a machine without them cached, draws the card's sigil until `pack fetch azure`. No example or test names them |
| (b) As (a), and `entra` a small pinned pack row of its own, with the Entra package's terms | `entra` fetchable on request | A fourth set of terms to read and pin for one logo |
| (c) As (a), `entra` left as it is, its terms read later (a `risks.md` row) | No change for `entra` | A render still downloads a Microsoft package with no terms shown |
| (d) Keep the rows as they are | Maps exactly as now | Microsoft's zip downloaded with no terms shown, beside a pack that asks first |
| (e) Remove the four rows | Simplest | A model naming them loses its logo for good (an API change) |

### 4.7 The AWS switch (decision 1)

`src/cloud/cloud.js` registers `gcp` and `azure` and, behind `const CLOUD_AWS = false`, `aws`. The `aws` definition is a
module export of `src/cloud/cloud.js` only; the build drops a `src/` file's exports (Q15), so it is on no public or global
surface. Its tests import it from `src/cloud/cloud.js` and register it, so AWS is tested on every run; a test asserts
`lib/umlimator-all.js` exposes no `aws` definition and registers no `aws` type. The Chrome pages (`tests/cloud.html`,
`tests/m4a.html`) import `render` and the registry from `../src/` throughout, as `tests/type-hooks.html` does: a registry
from `src/` is not lib's. 4a.8 sets the constant, adds the pinned
`aws` row with AWS's terms, moves `26-aws.json`, adds the atlas link and `docs/conformance/aws.md`.

As built (4a.8, 14 Nov 2026). AWS accepted the maintainer's request by email (14 Nov 2026): the tool may download the
AWS Architecture Icons at a user's request, as the request described it (never bundled; downloaded only when the user
asks, from the pinned official address checked by SHA-256; AWS's terms shown and a yes first; cached on the user's
machine; icons unmodified with the service name beside each; a not-affiliated line and AWS's trademark line).
`CLOUD_AWS` is `true`. Where the build departs or settles what the note left open:

- **The pin.** `Icon-package_07312026.5846e924….zip` from `d1.awsstatic.com`, the address AWS's icons page links (read
  14 Nov 2026), 13,988,918 bytes, SHA-256 `d2d166c453526471749d520e0db022c459abef759d2946cf2dd1d1c992dc6526`: downloaded
  once by the lead into a scratch folder outside the repository, both match. Label `2026-07-31`, the date in the zip's
  folders, which the example's `iconPacks` already named. With that copy served locally, `pack fetch aws` indexes 768
  icons and every id of `examples/bookshop-aws.json` resolves. Three ids are filed twice with different files:
  `AWS-Compute-Optimizer` (`Arch_Compute`, `Arch_Management-Tools`), `Amazon-Kinesis-Video-Streams` (`Arch_Media-Services`,
  `Arch_Analytics`) and `AWS-Management-Console` (a 64 px service icon, a 48 px general resource icon). The first member
  is used on purpose and no alias row is added: an alias maps one id to another and cannot pick a member, and each
  pair draws the same service.
- **The pattern.** `Arch_<id>_64.svg` under `Architecture-Service-Icons_<date>/Arch_<category>/64/`, and `Res_<id>_48.svg`
  under `Resource-Icons_<date>/Res_<category>/` (the general icons' `Res_48_Light/` only); anchored, no nested
  repetition, and macOS's `__MACOSX/._…` copies match nothing. 400 resource ids hold `_` between service and resource,
  and two of AWS's file names hold a space (`Res_Amazon-Location-Service_Map _48.svg`, so the id
  `Amazon-Location-Service_Map-`). The derived name (`umlimator_packs.py`'s `name_of` and the family's fallback in
  `src/cloud/cloud.js`) reads hyphens and underscores as spaces and trims: "Amazon VPC NAT Gateway", "Amazon Location
  Service Map". Google's and Azure's ids hold neither, so their names do not change.
- **The words, for the maintainer to approve.** `terms.text`: the icons page's permission, word for word as read
  through a page reader ("We allow customers and partners to use these toolkits and assets to create architecture
  diagrams." "You can also put icons in materials like whitepapers, presentations, data sheets, and posters."), the
  conditions of the request AWS accepted, the trademark line and the address of AWS's trademark guidelines.
  `legal`: "Amazon Web Services, AWS and the AWS service icons shown are trademarks of Amazon.com, Inc. or its
  affiliates." Replacing either with the words of AWS's email is one edit of `text`, `legal`, `terms.sha256` and
  `AWS_LEGAL`.
- **AWS's trademark line** is drawn as Google's legal line is (§5.7): a family's `legal` in `CL_FAM`, under a picture that
  draws one of its icons, inside its bounds, at the end of the legend and `describe()`; `AWS_LEGAL` and the row's `legal`
  are kept equal by `tests/cloud.test.mjs`. Google's line and Azure's views draw exactly as before.
- **The example.** `26-aws.json` is `examples/bookshop-aws.json`, every id prefixed `aws-` (the view `aws-on-aws`) and
  nothing else changed; `check.mjs`'s `MOVED` names it. `tests/core-diet.json`'s entry for `26-aws.json` is re-recorded
  for the new ids, as 4a.0 re-recorded the other three (the layout and edit fingerprints change with the ids; describe
  and validate do not). `.github/workflows/check.yml`'s examples step gains `bookshop-aws) x=2`, the view's two
  crossings with repair and rerouting off, pinned in `tests/cloud.test.mjs` since 4a.6.
- **Tests outside Owns**, which turning AWS on changes: `tests/cloud.test.mjs` and `tests/cloud.html` read the moved
  example and no longer register `aws` themselves (the build does; a second registration throws), and assert the lib
  registers it, the trademark line and the name beside each icon; `tests/packs.py` holds the real row's pin and pattern
  and fetches and renders a synthetic AWS pack, its resource icon's name derived. With 4a.7's branch merged:
  `tests/m4a-fixtures.test.mjs`, `tests/m4a.html` and `tests/notation.html` no longer register `aws` either, so
  `cloud-stress.json`'s AWS view is drawn by the build's own registration; `tests/embed.py`'s description of
  `tests/cloud.html` names the moved example.
- **Docs outside Owns.** `docs/diagrams/README.md`'s open-questions row and a log entry of 14 Nov 2026 record AWS's
  answer (the lead's to accept); `docs/module-api.md`'s 0.26.0 section gains the AWS bullet, under 4a.7's heading.
- **`tools/fetch_icons.py`** keeps its `aws/` path (upstream's, unmodified, not in the npm package): it downloads
  without the pin, terms or yes, and the README's Icons section says it is not a way to get a pack.
- **Left for `umlimator_packs.py`'s next owner:** `pack fetch`'s message "the AWS pack is not offered in this release"
  now shows only for a packs file with no `aws` row (aws#1 quotes it).
- **The atlas's "On AWS"** is not in this pull request: the topic `mm-on-aws` under "Hosting" belongs to
  `examples/bookshop-opening-plan.json`, which 4a.7 owns and which its tests pin by topic (the Mermaid writer's text,
  the MCP server's 21 topics, the mindmap's moves, the fingerprints). A follow-up after 4a.7 merges adds the topic,
  `bookshop-aws` to `tools/atlas-links.json`'s sources with the link `mm-on-aws` to `aws-on-aws`, and builds
  `examples/bookshop-atlas.json` again.

## 5. The cloud types

### 5.1 What they build on (S7)

| Option (decision 2) | For | Against |
|---|---|---|
| **(a) Stage 2's boxes as the deployment type nests them, `layoutTyped` with the host's ranking, and an icon card of the family's own on the map's `box` outline (recommended)** | Five levels of groups, lines to a group's border and drops into groups are already tested (stage 5's 48 px padding is not needed: no ports); a 32 px icon and two lines of text; no core byte | One more shape |
| (b) The map's card through `svgOf`'s typed path (milestone 2's C4 precedent): `n.icon` and `n.sub` | No shape code | The icon is 16 px (Q2), too small to tell services apart; the card's text is the map's |
| (c) Map views (`diagram` absent), cards with `icon` and toned containers | Draws today | Untyped: no vocabulary, rules, palette or properties; `proposal.md`'s "approx." level, which the milestone is to replace |

### 5.2 The service card

`SHAPE['cloud-card']` in `src/cloud/cloud.js`, for `aws.Service`, `aws.Resource`, `gcp.Product`, `azure.Service`:

- `box`'s outline and inset; 180 to 280 px wide, 56 px tall at least; strokes `--um-muted`, fill the stage's background.
- The icon, 32 px, left, centred on the card's height, on the tile maps draw, which `svgOf`'s rule makes 34/28 of the
  icon (39 px; `n-logo`, `dark` for a white icon), through `<image>` with `preserveAspectRatio="xMidYMid meet"`, never
  `slice`, and no `clip-path`, `filter`, `opacity`, `mask` or transform on the image in screen, print or PDF (Microsoft
  forbids cropping). A test asserts these on every vendor `<image>` the fixtures draw. With no icon in the table: a 24 px outlined square in `--um-muted`, the
  glyph risks.md §6 asks for, and the accessible name says "icon not available".
- Beside it: the label (13 px, 600, two lines of 180 px), and under it the full service name (11 px, `--um-muted`, two
  lines), from the table's `name`, else the id with hyphens as spaces (S8). A label equal to the name is drawn once.
- The geometry key holds each card's drawn text, so a name arriving with a fetched pack lays the view out again.
- Accessible name: "Product Shop API, Cloud Run". `gcp.User`: the map's `person` shape, no icon.

### 5.3 Groups

Boxes through `ownersOn` with `boxTypes` the family's group type, `qualify: false`. The frame is stage 2's box in the
typed look; its title the label and the kind in brackets ("Bookshop VPC [VPC]"). No group icon is drawn (decision 10),
so every icon drawn has its full name beside it. Dashed: `region`, `availability-zone`, `zone`; solid
otherwise.

| Option, the groups' look (decision 10) | For | Against |
|---|---|---|
| **(a) The typed look, the kind in the title, no group icon, dashes by kind (recommended)** | Readable in both themes and in print; nothing imitates a vendor's style; no icon without its name; no `groups` table to pin | Not the vendors' group icons or coloured borders |
| (b) As (a), with the pack's group icon at 16 px before the title, and the icon's full name as the kind ("Bookshop VPC [Virtual Private Cloud]"); the legend and the accessible name the same | Closer to the vendors' diagrams | A `groups` table per pack to pin and re-pin; a long title; the legal-line trigger counts group icons |
| (c) Each vendor's group colours | Looks like the vendors' own diagrams | Imitates their brand styling, which the terms do not grant; each palette checked for contrast in both themes |

### 5.4 Connections

`aws.Connection`, `gcp.Path`, `azure.Connector`: solid, an open arrow at `to`, the label cut at 280 px. A line may start or
end at a group (Q8): it ends on the group's border. A line between a group and something it holds is an error
(`line-inside`), since it cannot be drawn.

### 5.5 Validation

| Rule | Level | Says |
|---|---|---|
| `group-kind` | error | `groupType` (`zoneType`) is one of the row's |
| `group-nesting` | warning | A group sits in a group its kind may sit in (table below); a service sits in a group or none |
| `line-inside` | error | A connection does not join a group and something inside it |
| `icon-set` | warning | A service, resource or product has `props.icon` |
| `icon-missing` | warning | Where the host gave the pack (`icons['<pack>/']`), a node's icon is in it; drawn as a glyph otherwise |

`umlimator.py check` adds what only the cached pack knows: an id the pack lacks, with the three nearest ids, and an id an
alias moved.

| Family | A group of this kind may sit in |
|---|---|
| AWS | `account`, `region` in `cloud` or `account`; `vpc` in `region`; `availability-zone` in `vpc` or `region`; `public-subnet`, `private-subnet` in `availability-zone` or `vpc`; `security-group` in a subnet or `vpc`; `generic` anywhere |
| Google | `region` in `project`; `network` in `project` or `region`; `subnetwork` in `network`; `zone` in `region` or `subnetwork`; `generic` anywhere |
| Azure | `resource-group` in `subscription`; `region` in `subscription` or `resource-group`; `virtual-network` in `region` or `resource-group`; `subnet` in `virtual-network`; `generic` anywhere |

### 5.6 Editing

| Hook | Called by | Cloud |
|---|---|---|
| `connect` | Connect by pointer and `L` | The family's line; refused between a group and what it holds ("A line cannot join the VPC and what it holds") |
| `moveTo` | A drop, Alt + arrows | A drop into a group: `reparent` (stage 2's); Alt + arrows: a pin |
| `add` | Palette, `N` | Into the group selected |
| `remove` | Delete, Shift + Delete | A group: Delete hides it, its contents drawn in the next shown group; Shift + Delete deletes it and what it holds (`apply()`'s cascade), the hint line counting them |
| `rename` | F2 | The label; a line's label |

Palette: one entry per group kind, then Service (Resource; Product and User). Properties: `groupType` or `zoneType` (an
enum), `icon` (text).

| Option, choosing an icon (decision 9) | For | Against |
|---|---|---|
| **(a) The properties panel's text field; `icon-missing` and `umlimator.py check` name the nearest ids (recommended)** | No index in the module; keyboard path through the panel (DoD 4) | No browsing of the pack in the editor |
| (b) A picker of the pack's ids (`I`, `{ pick, then }`) from an index the host gives | Browsing | Hundreds of labels in an unsearchable picker; the host must give the whole index |
| (c) A searchable picker in the canvas | The best to use | Core bytes in `src/canvas/` |

### 5.7 Names, legend and Google's legal line (S9)

- The legend lists each icon drawn with its full name, the group kinds and the line.
- A picture that draws any `gcp/` icon, in a card or in the legend, draws Google's legal line (a `gcp` view, or an atlas
  page that draws one), 10 px `--um-muted`, under the picture,
  inside its bounds, so the SVG, PNG and PDF carry it; the legend and the page's `describe()` end with it.
- Its words are in `icons/packs.json`'s `legal` and in the type (`GCP_LEGAL`); `tests/cloud.test.mjs` reads both and
  fails if they differ. A host that gives Google icons gets the line whatever it passes.

| Option (decision 11) | For | Against |
|---|---|---|
| **(a) In the picture, the legend, `describe()`, the PDF and every doc that shows Google icons (recommended)** | "Wherever Google icons are used", for an exported picture too | A line under every Google diagram |
| (b) In the legend and docs only | A cleaner picture | An exported SVG or PNG carries Google's icons without it |

`describe()`: the groups as an outline, each service with its full name, then the connections. PDF: `word` (Service,
Group's kind), `rows` (full name, icon id, group).

As built (4a.6, 14 Nov 2026). `src/cloud/cloud.js` holds one definition per family from one table (`CL_FAM`); `gcp` and
`azure` are registered, `aws` only under `CLOUD_AWS` (off), and the module exports `CLOUD_DEFS` for the tests. Where the
build departs or settles what the note left open:

- **The pack given.** `icon-missing` reads where the host's table holds `<pack>/` or any `<pack>/<id>` key: the CLI writes
  `<pack>/` for Google only (4a.3), so Azure's pack counts as given by its icons.
- **`group-nesting`.** A group with no parent passes; a `generic` group, or any group in a `generic` one, passes; a kind the
  table gives no parent (`cloud`, `project`, `subscription`) warns inside any other group.
- **An icon's entry.** Only a `src` that is a `data:image/` URL is drawn; any other entry (another address, markup) draws the
  glyph, its name kept. A card's accessible name ends ", icon not available" wherever the glyph is drawn, and the legend
  then holds an "Icon not available" entry.
- **The legal line** has its baseline 4 px below the picture's bounds (which hold the 36 px margin); the bounds grow by 18 px
  to hold it, and widen where the picture is narrower.
- **Hooks.** `connect`, `add` and `remove` only: `rename` (the label) and `moveTo` (a drop into a group is stage 2's
  `reparent`, Alt + arrows a pin) are the canvas's defaults. The canvas's L and handle end on cards only, so a line from or
  to an open group is written in the model (or by a host) and not drawn by pointer or key; the refusal of a line between a
  group and what it holds is the hook's and is tested on it. DoD 4 (§5.6's "by pointer and L") for a line with a group at
  an end: met by the `connect` command through `apply()` and the hook, as milestone 2 met DoD 4 for gestures the canvas
  lacks; drawing such a line by pointer or L is left to a later canvas package (`src/canvas/edit.js` is not this
  package's). Taken by the lead under the maintainer's standing approval (14 Nov 2026).
- **The targets** lay out with no overlap, no line through a node and every line routed; their crossings are pinned (1 to 3
  a view, right and down), as M2.7 pinned C4's, with repair and reroute off.
- **P1.** `cloud-stress.json` is 4a.7's; `tests/cloud.test.mjs` builds the same size in code (60 products in five levels,
  80 paths) and prints the figures against 100 ms under CI's 1 s; they are recorded in the pull request.
- **Not reached.** An `update()` that changes only the `icons` table keeps the view's picture: the context's view key
  (`src/map/context.js`, the core) reads a map card's `icon`, not `props.icon`. A host gives the table with the model, as
  the CLI does, so a page draws the icons; changing them in place is left to a later core package (§5.2 then holds in
  full). Taken by the lead under the maintainer's standing approval (14 Nov 2026).
- **Lifted in 0.28.0 (#293).** A typed view's key now covers the model's elements, lines and icons table, so an
  `update()` that changes only the `icons` table redraws the view (`docs/module-api.md`, 0.28.0).

## 6. The tree strategy (S11, S12)

### 6.1 Options

| Option (decision 12) | For | Against |
|---|---|---|
| **(a) Bands: each subtree's band is as tall as its topic or its children's bands stacked, whichever is taller; a topic is centred on its children's span; children start one gap out from their parent's edge (recommended)** | Linear; no two topics overlap, since bands are disjoint; no two branches cross, since children keep their order; a few dozen lines | Less compact than a tidy tree where a deep, narrow branch sits beside a wide one |
| (b) A tidy tree (Reingold and Tilford) | Compact | Contours, threads and shifts: several times the code for a mindmap's few hundred topics |
| (c) `layoutTyped` with the tree as lines | No new strategy | Ranks by columns, so a long topic widens its whole column; the router draws orthogonal lines a mindmap does not use |

### 6.2 The contract

```
layoutTree(input) -> out
input = { root, topics: [{ id, parent, w, h, side }], gap: { x: 48, y: 12 } }   // children in order; side on first-level topics
out   = { nodes: [{ id, x, y, w, h, side, depth, branch }], links: [{ from, to, p1, p2 }], bounds, problems }
```

No DOM, no model; sizes come measured (the type measures in the host's measure, as the time axis does). `branch` is the
first-level topic a node descends from. A link's `p1` is the parent's edge midpoint on the child's side, `p2` the child's
near edge midpoint. Problems: `{ level, message, ids }`, never `warn()`.

### 6.3 The algorithm

- Two passes over the topics in an explicit stack, never recursion (a chain of 20,000 is a test).
- Post-order: `band(t) = max(t.h, Σ band(children) + gap.y × (k − 1))`.
- Pre-order: a child's `x` is its parent's right edge plus `gap.x` on the right side, its parent's left edge minus
  `gap.x` and its width on the left; children's bands are stacked top to bottom inside the parent's band, centred on the
  parent's middle.
- The root is at `x = 0`; each side's first-level bands are stacked and centred on the root's middle.
- A cycle cannot reach it: the type passes the tree as `ownIndex` breaks cycles (stage 2). A topic whose parent is not shown
  hangs from its nearest shown ancestor.

As built (4a.1, 14 Nov 2026), where the contract left a choice: the root is at (0, 0), its `side` and `branch` null, its
`depth` 0; `bounds` is the tight box of the nodes as returned (rounded), so it holds each and the type adds its margin;
nodes and links come in pre-order, children in input order; sizes not numbers, or negative, count as 0, a gap not given
or negative takes 48 and 12, and a size or gap over 1e9 px counts as 1e9 so no sum overflows. Problems: no root, or a
root that is not a topic, draws nothing (an error); a topic with no id is not drawn and a topic listed twice draws the
first (warnings); a topic that does not descend from the root (its parent not in the input, a cycle, a second root) is
reached through the top of its chain, the topic whose parent is not here or, in a cycle, the member listed first; that
top hangs from the root after its other children, with all it holds, whatever order the topics come in (a warning), so the type passes the nearest shown ancestor as `parent` and lays out a second tree on its own call.
A given side counts where its topic comes in the order, so pinning a later topic's side moves no earlier one. Taken by the
lead under the maintainer's standing approval (14 Nov 2026).

### 6.4 Sides (S12)

| Option (decision 13) | For | Against |
|---|---|---|
| **(a) `present.<id>.side` where given; the rest, in order, to the side whose first-level bands, summed with their gaps, are shorter in px so far, right first on a tie (recommended)** | Balanced by what is drawn; stable while editing a branch's own topics | A branch that grows may make the next new first-level topic go left |
| (b) All right unless given | Predictable | A lopsided map |
| (c) Alternating | Simple | Ignores size |

## 7. The mindmap type (`src/mindmap/mindmap.js`)

### 7.1 Drawing (S13)

- `layout.run`: the shown topics measured, `layoutTree`, then the copy: nodes, no lines for the router. `layout.pins:
  false`; the layout keeps nothing a user pins (positions follow the tree, D1).
- Topics: `box`'s outline; the root 15 px, 600, padding 14 px; others 13 px, padding 10 px; text wrapped to four lines of
  200 px and cut with `fit`; a 24 px hit area at least.
- Branches: cubic curves from `p1` to `p2` with horizontal tangents, drawn in `draw`'s under layer, 2.5 px from the root and
  1.5 px below, each in its branch's colour; a topic's border in its branch's colour.
- A topic with `opensView` carries the drill-down mark (the atlas, §10.3); no other typed node draws one (notes/stage-4.md), they say "opens <view>" in their names (audit 5).
- `describe()`: the tree as an indented outline, pre-order, right branches then left. Focus order (Tab) and the reading
  order are that order too, tested on the stress view. PDF: `word` "Topic", `rows` its depth and its
  parent. Accessible names: "Topic Checkout, under Website, 2 subtopics".

| Option, branch colours (decision 14) | For | Against |
|---|---|---|
| **(a) The map's kind palette (`--um-k-public`, `--um-k-lane`, `--um-k-ext`, `--um-k-verb`, `--um-k-board`, `--um-k-hook`), cycled over first-level branches; text always `--um-text` (recommended)** | Tells branches apart; colours already checked in both themes; colour carries no meaning, so nothing is lost without it | Line contrast is checked per colour (3:1, DoD 8) |
| (b) One ink, `--um-muted` | The typed look | A large mindmap reads as one mass |

### 7.2 Validation

| Rule | Level | Says |
|---|---|---|
| `mindmap-root` | warning | A view shows one tree: exactly one shown topic has no shown ancestor; each further one is drawn as its own tree under the first |
| `topic-parent` | error | A topic's `parent` is a topic |
| `side-first` | warning | `present.<id>.side` is on a first-level topic, else ignored |
| `mindmap-depth` | warning | Deeper than 64 levels: drawn, but a reader writes it flat (§8) |

### 7.3 Editing (S14)

| Hook | Called by | Mindmap |
|---|---|---|
| `add` | Palette (Topic), `N` | A child of the selected topic (the root when none), put in `nodeIds` after its parent's last shown descendant |
| `moveTo` | A drop, Alt + arrows | A drop on a topic: `reparent` to it. A drop between two siblings (an insertion bar shows where): `move` there, reparenting if it came from elsewhere. A first-level topic dropped on the root's other half: `set present.<id>.side`. Alt + Up and Down: `move` among its siblings in `nodeIds`. Alt + the arrow towards the root: promote (`reparent` to its grandparent, placed after its old parent); away from the root: demote into the sibling before it. On a first-level topic, the arrow across the root: `set present.<id>.side`. On the root, Alt + arrows do nothing and the hint line says why |
| `remove` | Delete, Shift + Delete | Delete: `hide` the topic and its shown descendants in one transaction; Shift + Delete: `delete` the topic, which takes its descendants (`apply()`), the hint line counting them first |
| `rename` | F2 | The topic's text |
| `connect` | | Refused: "A mindmap has no lines; drop a topic on another to move it" |

A hidden branch is shown again through the outline's Show, by pointer or by Enter (`docs/editing.md`'s "show an
element here"); on a topic it shows the topic and its descendants hidden with it, in one transaction. Undo also brings it
back.

| Option, Delete on a topic (decision 15) | For | Against |
|---|---|---|
| **(a) Hides its branch (recommended)** | What mindmap tools do; matches Shift + Delete, which takes the branch | One key hides many topics; undo brings them back |
| (b) Hides the topic only; its children hang from its parent in the picture | One element per Delete | The picture rewires itself; a user rarely means it |

As built (4a.4, 14 Nov 2026), where §7 left a choice or the canvas could not do what it says. Levels count the root as
the first, so `mindmap-depth` warns from level 65 (depth 64), naming the topics there. A topic whose parent is not a topic
(`topic-parent`) is a root of its own; each further root's tree, and one tree for shown topics in a cycle, is laid out by
its own `layoutTree` call and stacked 48 px under the one before; the bounds take a 24 px margin. A topic's text breaks at
its newlines; a paragraph past 400 characters is cut before wrapping (four lines hold about 130). A topic that opens a view
is 26 px wider, for the ⤢ mark. No legend: a branch's colour means nothing. A new topic's id comes from its words, as the
reader's (`base`, `base-2`…). Alt + ↑ and ↓, every side change, and a first-level topic's move under another topic (Alt +
→ or ← away from the root, or a drop) set, in the same transaction, the drawn side of each other first-level topic that
has none given, so no other branch swings across; the moved topic's own side, if given, goes. A drop is read from the dropped topic's centre:
on a topic, under it, last; on the root, a first-level topic takes the half it fell on (its own half: nothing) and a deeper
one becomes first-level on that half; in the gap between two siblings' boxes, there, taking their side when they are
first-level. The canvas draws no insertion bar while a topic is dragged (it has no hook for one, and its files are the
core's). The outline's Show on a hidden topic brings back the topic and every descendant under it through hidden topics
only, after its nearest shown ancestor's last shown descendant: the canvas's Show adds one id and has no hook, so
`src/mindmap/mindmap.js` wraps `TYPED.edit` and hears that button's click first, on a mindmap view only; Enter on the
button clicks it. Delete's hide clears the topic's `present` entry (apply's `hide`), so a first-level topic brought back by
Show takes the side the balance gives it, which may be the other half; undo puts it back where it was. The canvas's palette still names its generic line ("Lines: line") for a type with no lines; L then says
the hook's refusal. Taken by the lead under the maintainer's standing approval (14 Nov 2026).

## 8. The Mermaid mindmap reader and writer (`src/readers/mermaid-mindmap.js`, S15)

### 8.1 Reading

`readMermaidMindmap(text) -> { model, report }`, written against Mermaid 12.3.0's mindmap page and its lexer (Q11):

- `mindmap`, then one topic per line; a line's level is the nearest earlier line with a smaller indent, as Mermaid's page
  describes for unclear indents. How a tab counts is taken from Mermaid 12.3.0's lexer by 4a.5 and pinned in the construct
  file.
- `id[text]`, `id(text)`, `id((text))`, `id))text((`, `id)text(`, `id{{text}}` and bare text. The id is the source's
  (R3); bare text takes an id from its words, the next free of base, base-2…, by a counter per base (linear). The shape is
  kept as `ext.mermaid.shape`, reported `approximated` once per kind ("drawn as a rounded box").
- `::icon(...)` and `:::a b` on the line after a topic: kept as `ext.mermaid.icon` and `ext.mermaid.classes`, reported
  `approximated` (not drawn).
- A Markdown string: the text between the backticks, `**` and `*` kept as written, newlines kept; `ext.mermaid.markdown:
  true`; reported `approximated` ("drawn as plain text"). `<br>` reads as a newline.
- Quoted text, `id["text"]` in any shape: the quotes removed; Mermaid's entities (`#quot;`, `#35;`, `#lt;`, `#gt;`,
  `#amp;`, and `#<n>;` for any code) decoded. An entity it does not know is kept as written, reported.
- Front matter: its `title` is the model's; its `config.layout` reported `skipped`. An `%%{init: …}%%` directive is not a
  comment: reported `skipped`. Other `%%` comments are skipped, but for the writer's hints.
- A second root (Mermaid refuses one): read as a topic with no parent, reported; `mindmap-root` then warns.
- One `mindmap` view, `nodeIds` in source order; no `present.side` unless a `%% side:` hint gives it; `opensView` from
  a `%% opens: <viewId>` hint.

### 8.2 Hostile input (R2)

| Input | What happens |
|---|---|
| Over 1 MiB | Refused before reading, one report item |
| 1,400 lines, each indented one space more (about 1 MiB in all) | Read to 64 levels; deeper lines hang at level 64, one report item; under 1 s |
| 10,000 lines, each indented one tab more | The same, through tabs (about 50 MB of spaces would be refused by size first) |
| `%%{init: …}%%`, an unknown entity, an unclosed quote | Skipped or kept as written, each reported |
| 100,000 bare topics with one text | Ids `x`, `x-2`…, by a counter; under 1 s |
| `__proto__`, `constructor` as ids or text | Tables are `Object.create(null)` or `Map`s; read as any id |
| An unclosed shape (`id((text`) | Read as bare text, reported |
| A 64 KiB line of `(` and `)` | Scanned once, left to right; no regular expression with nested repetition on a line |
| CRLF, a BOM, tabs and spaces mixed | Read; tabs as the lexer counts them |

The reader never throws: an unexpected failure becomes one report item and an empty model.

### 8.3 Writing

`writeMermaidMindmap(model, viewId?) -> text`: one view, two spaces per level, in `nodeIds` order. A topic is written
`id[text]` when its id is not what the reader would derive from its text, else as bare text; its kept shape, icon, classes
and Markdown string as they came. A side is written `%% side: left` above its first-level topic; an id the source cannot
carry as `%% id: <id>`; text that needs it in a quoted string (`id["…"]`) with Mermaid's entities (`"` as `#quot;`, `#` as `#35;`). A newline in
plain text is written `<br>`, which the reader reads back as a newline; a Markdown string keeps its own newlines.
`opensView` is written `%% opens: <viewId>`. What Mermaid cannot hold is reported by the writer, never written invalid:
a second root (the first tree is written, each further root reported and left out); a topic deeper than 64 levels
(written at level 64, reported, since the reader would hang it there). `read(write(model))` equals the model for the
example and 500 generated models of at most 64 levels and one root, with text holding brackets, quotes, `#` and
newlines.

### 8.4 The CLI

`umlimator_import.py`'s `TYPED` gains `mindmap`, so `umlimator.py import plan.mmd` reads it through Node as the other
Mermaid readers. Nothing else in the CLI changes for it.

As built (4a.5, 14 Nov 2026), with these departures:

- A tab counts one, as a space does: Mermaid 12.3.0's lexer reads an indent as a run of `[\s]+` and takes its length as
  the level (`mindmap.jison`, `mindmapDb.ts`'s `getParent`); pinned in `tests/import/mindmap.mmd`. So §8.2's 10,000 lines
  each a tab deeper hold 50 million characters and are refused by size first, as the spaces would be; the tab case is
  1,400 lines, as the spaces' is.
- §8.2's large inputs are built by `tests/mermaid-mindmap.test.mjs`, not committed; `tests/import/hostile/` holds the
  four small ones (`mindmap-directives`, `-proto`, `-unclosed`, `-crlf`).
- `[ ]` is the topic itself, not a kept shape: it is the writer's `id[text]`, so a topic with an id of its own reads back
  with no `ext.mermaid`. Mermaid draws it square; the other five shapes are kept.
- Icons, classes and Markdown strings are reported once per kind, as shapes are, not once per topic.
- What the writer cannot write is named in `%% not written:` lines, as the other Mermaid writers do.
- An id from text is its words in lower case joined by `-`, at most 60 characters, `topic` when it has none.
- `umlimator.py`'s reader table gains `mindmap` (one entry, outside the row's Owns: the CLI looks the reader up by the
  routed name), and `umlimator_import.py`'s `MERMAID` gains it with `TYPED`, so a source with no `.mmd` name is known by
  its content and the map importer says the module reads it.
- `read(write(model))` is compared with the model as one view shows it, as the flowchart's test does: the shown topics, and
  the view's title as the model's.
- A carriage return in a label is written as a line break, as `\n` is, and named in a `%% not written:` line; an
  unclosed Markdown string is its one line read as text, the lines after it read as they are.

| Option, Mermaid's shapes (decision 16) | For | Against |
|---|---|---|
| **(a) Kept under `ext.mermaid`, drawn in the one topic look, written back, reported (recommended)** | Round trip whole; a mindmap has no notation that gives shapes meaning; no new shapes | A source's circles and clouds draw as rounded boxes |
| (b) `props.shape`, drawn: `box`, `hexagon` and `mobile`'s outline exist, cloud and bang are new | Looks as in Mermaid | Two new shapes for decoration; a model field for paint (rule 10 puts paint in views) |

## 9. What the two types share with earlier stages' documents

- `docs/editing.md`: the mindmap's Alt + arrows, `N`, Delete; the cloud palette and fields; `umlimator.py pack`.
- `README.md`'s Icons section: packs, the terms and the yes, the cache, the "not affiliated" line, Google's legal line,
  that a render never downloads a pack.
- Conformance notes: `docs/conformance/mindmap.md`, `gcp.md`, `azure.md` (`aws.md` in 4a.8), each with its fidelity
  table: SVG and PNG carry the icons the host gave and the legal line; the PDF the same and its tables; a picture made
  without the pack carries glyphs.

## 10. Fixtures, examples and the atlas

### 10.1 Fixtures

Each lives in `tests/`, laid out in Node and in Chrome under three fonts and both themes, with no overlap, no text
overflow and no line through a node (a branch curve sampled every 4 px, for the mindmap).

| Fixture | Holds |
|---|---|
| `mindmap-minimal.json` | One topic |
| `mindmap-stress.json`, `edge-cases` | A branch with 30 children; every branch on one side; a 200-character topic; a topic whose parent is hidden; two roots in one view (warned); a side on a second-level topic (warned); a chain 70 deep (warned); a topic whose parent is not a topic (`topic-parent`, an error) |
| `mindmap-stress.json`, `all` | 300 topics, eight levels, six first-level branches (P1) |
| `cloud-minimal.json` | A `gcp` view: one project, one product; an `azure` view: one resource group, one service |
| `cloud-stress.json`, `edge-cases` | An icon the pack lacks; a view drawn with no table (offline): glyphs and full names; an alias moved by a re-pin; five levels of groups; a line from a group to a node in a sibling group; a line between a group and its content (an error, refused by `connect`); a white icon on the light theme; a coloured one on the dark; Google's legal line present with a Google icon and absent with none; a `gcp` view whose only Google icon is in the legend still draws the line; a wrong `groupType` (`group-kind`); a subnet outside its VPC (`group-nesting`); a service with no `icon` (`icon-set`) |
| `cloud-stress.json`, `all` | 60 services in five levels of groups, 80 connections (P1) |
| `aws-*` views in the same files | The AWS cases, drawn by registering `aws` in the test (§4.7); in Chrome, from `../src/` |
| `tests/import/mindmap.mmd` | Every construct of Mermaid's mindmap page, with quoted strings, entities and an `%%{init}%%` directive; the report pinned |
| `tests/import/hostile/mindmap-*.mmd` | §8.2's rows |
| `tests/packs/` (built by the test, not committed) | The synthetic pack (§4.4) |

The tables the cloud fixtures draw with are built by the tests from synthetic SVGs (a coloured square, a white circle), so
no vendor icon is committed.

### 10.2 Examples

`25-mindmap.json` moves to `examples/bookshop-opening-plan.json`, `27-gcp.json` to `examples/bookshop-gcp.json`,
`28-azure.json` to `examples/bookshop-azure.json`, with `check.mjs`'s `MOVED`; `26-aws.json` stays a target until 4a.8.
The gallery draws the cloud examples with no pack (`UMLIMATOR_NO_PACKS=1`, §2.5), so their stills show glyphs and full
names, and a line under each card says how to fetch the icons and that Umlimator is not affiliated with the vendors (S18).

### 10.3 The atlas (S20)

| Option (decision 19) | For | Against |
|---|---|---|
| **(a) Prefixed ids (`mm-`, `gcp-`, `az-`; `aws-` in 4a.8); the mindmap gains "Hosting" with "On Google Cloud", "On Azure" (and "On AWS" in 4a.8), each opening its cloud view; the mindmap is a root view (recommended)** | Every view reached by drill-down; the plan explains why three clouds; the build stops on nothing (Q10) | Three topics added to the example |
| (b) Prefixed ids, no links: four root views | No change to the mindmap | Three views reached only from the views list |
| (c) Not joined | Nothing to do | Against the maintainer's rule of 13 Nov 2026 with no reason a type needs its own domain |

The "Hosting" topics' `opensView` name the prefixed view ids (`gcp-…`, `az-…`). 4a.0's edit of `25-mindmap.json` adds
"On Google Cloud" and "On Azure" only; "On AWS" exists from 4a.8. The atlas is built with `UMLIMATOR_NO_PACKS=1`, and its
page carries the "not affiliated" line under the cloud views.

`tools/atlas.mjs` gains `iconPacks` in `KEYS.file` (merged by pack: one label per pack, a disagreement stops the build) and
writes it in the atlas; `KEYS.props` gains `icon`, `groupType`, `zoneType`. The links go in
`tools/atlas-links.json`.

As built (4a.7, 14 Nov 2026), where §10 left a choice or the build found what it did not say:

- **The fixtures.** `tests/cloud-stress.json` holds four edge-case views, since a view is one family: `edge-cases` (Google
  Cloud: every row of §10.1 but the AWS and Azure ones), `ec-no-product` (a Google Cloud view with no product, so no legal
  line with the pack given), `az-edge-cases` and `aws-edge-cases`; and `all`, §11's view, as `tests/cloud.test.mjs` builds
  it. "A Google view whose only Google icon is in the legend" cannot be built: the legend lists only icons a card draws,
  so a legend icon is a card icon and the line follows. A re-pin's alias is a test-side table entry under the old id with
  the pinned icon's name, as the CLI writes one (`icons/packs.json`'s aliases are empty at this pin); the CLI's alias path
  is `tests/packs.py`'s. The mindmap fixtures are §10.1's cases as `tests/mindmap.test.mjs` builds them, the 200-character
  topic cut to exactly 200.
- **What `check()` finds, pinned** (`tests/m4a-fixtures.test.mjs`, repair and reroute off): every mindmap view clean; the
  Google Cloud example 1 crossing right and down, Azure's 1 right and 3 down; the cloud stress view `all` 52 right and 54
  down, where one path's label lies on another (the only finding that is not a crossing, stated in
  `docs/conformance/gcp.md`). The line inside its group in `edge-cases` is not drawn (`line-inside`). CI's example loop
  holds `bookshop-gcp` and `bookshop-azure` at 1 and the atlas at 24 (22 before; 29 once merged with 4b.5's BPMN example, which adds 5), as Chrome counts them with `--expand`.
- **The atlas.** A mindmap topic that opens a view is 26 px wider (§7.3's As built) and the Hosting topics open the cloud
  views only in the atlas, so `tests/atlas.test.mjs` compares the opening plan's layout with its file's but for those two
  topics, 26 px wider and grown away from the root. The opening plan is a root view: nothing opens it, and the test reaches
  every view from the C4 context, the map's overview and it.
- **The not-affiliated line** is each cloud view's `caption` in its example (shown on its page, the atlas's page and the
  gallery's card), so the atlas carries it with no field of its own; the README's Icons section, the conformance notes,
  `examples/README.md` and the gallery say it too.
- **§2.5's test** (`tests/m4a-fixtures.test.mjs`): no committed `.json`, `.html`, `.svg`, `.md`, `.js` or `.mjs` file under
  `examples/` or `docs/` holds a pack's icons entry (a key `<pack>/<id>` holding an object) or the synthetic pack's marker, and every SVG in `icons/`
  is in one of the manifest's Lucide rows. The site's build in `check.yml` sets `UMLIMATOR_NO_PACKS=1`; CI has no pack cached either.
- **Import on each** is the mindmap's only (the cloud types have no reader): `tests/cli.py` writes the example's Mermaid
  with the module's writer and imports it back to the same topics, order and sides.
- **Existing tests edited:** `tests/atlas.test.mjs` (adds cases; names milestone 2's five files where it took the last
  five sources; its check that the opening plan lays out as in its file now lets `mm-on-gcp` and `mm-on-azure` be 26 px
  wider, x shifted when x < 0, as "The atlas" above says); `tests/cli.py`, `tests/mcp.py` and `tests/notation.html` (add the three examples and milestone 4a's
  ends); `tests/embed.py` (appends `tests/m4a.html`); `tests/core-diet.json` (two `edit` fingerprints); and the example
  paths in `tests/mindmap.test.mjs`, `tests/mindmap.html`, `tests/cloud.test.mjs` and `tests/cloud.html`. Taken by the lead
  under the maintainer's standing approval (14 Nov 2026).

## 11. Performance (P1, S19)

| Fixture | Budget, CPU time in Node, best of N after a warm-up; CI holds 1 s and prints the target |
|---|---|
| `mindmap-stress.json`'s `all` | A full layout and SVG markup: target 100 ms |
| The same | Common edits: a topic renamed, added, moved to the other side, promoted: 100 ms each |
| `cloud-stress.json`'s `all` | A full layout and SVG markup: CI's 1 s, the figure printed |
| The same | Common edits: a service renamed, its icon changed, moved into another group, a connection added: CI's 1 s, each printed against 100 ms |
| The reader | 5,000 topics read and written: 100 ms |
| `apply()` | `delete` of the root of a 20,000-topic chain and of a flat 20,000-topic root: no throw, 100 ms (the flat case measured 128 ms before 4a.2's `filter`) |
| `validate()` | A 20,000-topic chain: 100 ms (measured 9.5 s before 4a.2's linear check) |

`repair: false` and `reroute: false` on every cloud layout. The cloud stress view will likely print over 100 ms: its
precedent, `tests/deployment.test.mjs`'s P1 (50 nodes, 50 lines, boxes five deep), prints edits at 102 to 116 ms and a
full layout at 109 ms on a maintainer's laptop, and `cloud-stress.json`'s `all` is larger (60 services and their groups,
80 connections), past `risks.md` P1's 40-element fixture too. So, as stage 5 did, CI's 1 s is the gate and 100 ms is
printed and recorded in the pull request; it is not a stop in the middle of 4a.6 (decision 20).

| Option, P1 for the cloud family (decision 20) | For | Against |
|---|---|---|
| **(a) CI's 1 s is the gate; 100 ms printed and recorded; the stress view as sized (recommended)** | The maintainer's standing P1 policy; the stress view tests five levels and 80 lines; no package stops midway | An edit on the stress view may print over 100 ms |
| (b) The stress view sized to P1's definition (40 elements) and held to 100 ms; the large view untimed | 100 ms meant as a target | Two stress views; the larger case is never timed |
| (c) Over 100 ms on a common edit stops 4a.6 for the maintainer | The target taken strictly | Deployment, the precedent, already prints over it; a stop that is all but certain |

## 12. Work packages

### 12.1 Before milestone 4a starts

- This note is approved; `model.md` and `risks.md` take §15's changes with it.
- M2.0 and 4b.0 have merged, so `tools/build.mjs`'s `ALL` keeps the releases' order.
- No more than five code lanes are open across the project (the maintainer's cap, M2's decision 18).

### 12.2 The packages

Each is one pull request. "Owns" lists the only files it changes while open. Built files (`lib/umlimator.js`,
`lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`, after merging `main`,
never merged by hand (X2). The lead keeps `docs/diagrams/README.md`'s status table (X7); a package proposes its row and
writes its release notes in its pull request for 4a.7 to gather.

| # | Work package | Owns | Depends on | Done when |
|---|---|---|---|---|
| 4a.0 | **Files and ids** (the lead). `layout/tree`, `mindmap/mindmap`, `readers/mermaid-mindmap`, `cloud/cloud` as empty files in `ALL`, after milestone 4b's, in that load order. The four target examples take §10.3's ids, the packs' icon ids (Q7) and the mindmap's "Hosting" branch | `tools/build.mjs`, the four empty files, `docs/diagrams/examples/25-mindmap.json` to `28-azure.json` (an exception to stage 6's 6.6, milestone 2's M2.14 and milestone 4b's 4b.5 `docs/`, as M2.0 made: none edits these four); `tests/core-diet.json` (the four targets' entries, which `targets()` fingerprints, as M2.0 re-recorded its five: a departure found in the build, 14 Nov 2026) | This note; M2.0 and 4b.0 merged | `lib/umlimator-all.js` changes by blank lines only, `lib/umlimator.js` not at all; `check.mjs` passes; every renamed view lays out and describes as before, ids, icon ids and the Hosting branch aside; `tests/core-diet` passes with only the four targets' entries changed; no other 4a lane edits `ALL` |
| 4a.1 | **The tree strategy.** §6: `layoutTree`, tested alone on hand-built inputs | `src/layout/tree.js`, `tests/tree.test.mjs` (new) | 4a.0 | On a table of inputs: no two nodes overlap; children keep their order and side; a parent centred on its children; a chain of 20,000 laid out with no throw; the same input twice gives the same output; `bounds` hold every node; a " (timed)" test of 5,000 topics against 100 ms |
| 4a.2 | **A deep chain, linear.** §2.4's three rows: `take` iterative; deleted elements taken out with one `filter` per list; `typedProblems`' cycle check linear | `src/core/apply.js` (`delete` only), `src/core/model.js` (`typedProblems`' cycle check only), `tests/apply.test.mjs` and `tests/model.test.mjs` (add cases) | 4a.0; M2.1 merged, or the two merges rehearsed (X2) | A 20,000-topic chain and a flat 20,000-topic root delete in a " (timed)" test; `validate()` of a 20,000 chain timed, and a cycle still reported where it was; every `apply()` and `validate()` test unchanged; maps unchanged (hashes, stills); the core's bytes before and after, within 130 B |
| 4a.3 | **Icon packs.** §4: `icons/packs.json` with `gcp` and `azure` pinned (no `aws`); `umlimator_packs.py` (`pack fetch`, `pack list`, the terms and the yes, the cache, `accepted.json`); `page_model`'s pack entries (§4.5); `check`'s nearest ids; decision 7's three rows; the synthetic pack and its tests | `umlimator_packs.py` (new), `icons/packs.json` (new), `icons/manifest.json` (three rows), `umlimator.py` (`main()`'s subparser lines for `pack`, `page_model` with `UMLIMATOR_NO_PACKS`, `icon_bytes`' pack rows and `entra`, `cmd_check`'s call), `tests/packs.py` (new), `.github/workflows/check.yml` (one line running `tests/packs.py`) | 4a.0 | Each row of §4.2 and §4.3 by a test on the synthetic pack: a hash mismatch keeps nothing; a size over the pin stops the download; no terminal and no flag refuses; `--accept-terms` for another pack or label refuses; no byte is requested before the yes (the test server's log); the flag path prints the terms and records `via: flag`; an Azure PDF whose hash differs keeps nothing; `UMLIMATOR_PACKS` without `UMLIMATOR_TEST` refuses; `UMLIMATOR_NO_PACKS` draws glyphs with a pack cached; a re-pin asks again; `UMLIMATOR_OFFLINE` refuses; a render with no pack draws glyphs and says how to fetch; a render never opens a socket for a pack (asserted); the three logo rows read from the pack only and `entra` never fetched by a render; `tests/cli.py` and `tests/import.py` unchanged |
| 4a.4 | **The mindmap type.** §7 | `src/mindmap/mindmap.js`, `tests/mindmap.test.mjs` (new), `tests/mindmap.html` (new), `tests/embed.py` (appends its page) | 4a.1; 4a.2 for its Shift + Delete test of a deep chain | Definition of done 2, 4, 5, 6 and 8 on row 25; every gesture by pointer and key through `apply()`; a 30-step session undone, redone and reopened byte-identical; `25-mindmap.json` lays out clean; each branch colour's contrast at 3:1 or more in both themes |
| 4a.5 | **Mermaid mindmap reader and writer.** §8 | `src/readers/mermaid-mindmap.js`, `tests/mermaid-mindmap.test.mjs` (new), `tests/import/mindmap.mmd`, `tests/import/hostile/mindmap-*.mmd`, `umlimator_import.py` (`TYPED`), `tests/import.py` (adds cases) | 4a.0 (row 25 only) | `read(write(model))` equals the model for the example and 500 generated models; ids stable across two reads; the construct file's report pinned; §8.2's rows each under 1 s and never thrown; `umlimator.py import` of a `.mmd` mindmap writes a model `check.mjs` passes |
| 4a.6 | **The cloud family.** §5: the three definitions, `aws` behind `CLOUD_AWS = false`; the card, groups, glyphs, names, Google's legal line, rules, `describe()`, legend, `rows`, `word`, hooks. The P1 stress view's figures printed and recorded in the pull request (§11, decision 20) | `src/cloud/cloud.js`, `tests/cloud.test.mjs` (new), `tests/cloud.html` (new), `tests/embed.py` (appends its page) | 4a.0; §4.5's table format (not 4a.3's code) | Definition of done 2, 4, 5, 6 and 8 on rows 27 and 28, and on row 26 with `aws` imported from `src/cloud/cloud.js` and registered by the test; `tests/cloud.html` imports from `../src/` throughout; `lib/umlimator-all.js` neither exposes nor registers `aws` (asserted); every vendor `<image>` with `meet` and no clip, filter, mask, opacity or transform; the targets lay out clean; an icon drawn through `<image>` only, never inlined; the legal line's two copies equal; a view with no table draws glyphs and full names |
| 4a.7 | **Fixtures, examples, atlas, docs.** §10's files and tests (`tests/m4a-fixtures.test.mjs`, `tests/m4a.html`); the three examples moved, with `MOVED` and their `iconPacks` labels from `icons/packs.json`; the atlas (§10.3); `render`, `check`, `stills`, `pdf`, `import` on each; the schema and `.d.ts` (`iconPacks`, the three types); C10's tests (the MCP server, the diff Action); §2.5's test that nothing published holds a vendor icon; every document of `plan.md` §7; the three conformance notes; the lanes' release notes | `examples/`, `tests/mindmap-*.json`, `tests/cloud-*.json`, `tests/m4a-fixtures.test.mjs`, `tests/m4a.html`, `tests/notation.html`, `tests/cli.py`, `tests/mcp.py`, `tests/embed.py` (appends), `tests/atlas.test.mjs` (adds cases; the opening plan's layout check lets `mm-on-gcp` and `mm-on-azure` be 26 px wider), `tools/atlas.mjs` (`KEYS`, `iconPacks`), `tools/atlas-links.json`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/diagrams/examples/check.mjs`, `docs/` (but the status table), `README.md` (its Icons section), `plugins/umlimator/skills/map-repo/SKILL.md` (the pack line); departures found in the build (14 Nov 2026): `.github/workflows/check.yml` (the example loop's crossing ceilings for the two cloud examples and the atlas, and `UMLIMATOR_NO_PACKS` on the site's build, §2.5), `tests/core-diet.json` (the moved Google Cloud and Azure targets' `edit` fingerprints, which hash the whole model: the pin's label and the captions), and the example paths in `tests/mindmap.test.mjs`, `tests/mindmap.html`, `tests/cloud.test.mjs` and `tests/cloud.html` | 4a.1 to 4a.6; 6.6, 6.7, M2.13, M2.14 and 4b.5 merged, or rehearsed (§12.4) | Definition of done 1, 3, 7, 9, 10, 11 and 12 for the three types; the atlas builds with no clash and its links open; §11's budgets in CI; the stress fixtures' crossings pinned; the gallery's stills hold no vendor icon |
| 4a.8 | **AWS on** (waits). `CLOUD_AWS = true`; the pinned `aws` row with AWS's terms; `26-aws.json` moved with its `iconPacks`; the atlas's "On AWS"; `docs/conformance/aws.md`; its release notes; any conditions AWS's reply attaches (§2.3) | `src/cloud/cloud.js` (the constant), `icons/packs.json` (its row), `examples/bookshop-aws.json`, `docs/diagrams/examples/26-aws.json`, `check.mjs`'s `MOVED`, `tools/atlas-links.json`, `examples/bookshop-atlas.json`, `docs/conformance/aws.md`, the README's Icons section | AWS's answer, and the maintainer's go; 4a.7 | Definition of done for row 26; the AWS rows of `cloud-stress.json` drawn by the build's own registration |

Existing tests a package edits, and why: 4a.0 re-records the four targets' entries of `tests/core-diet.json`; 4a.2 adds cases to `tests/apply.test.mjs` and `tests/model.test.mjs`; 4a.5 to `tests/import.py`; 4a.7 edits
the tests its §10 As built lists under "Existing tests edited" (`tests/atlas.test.mjs`, `tests/cli.py`, `tests/mcp.py`,
`tests/notation.html`, `tests/embed.py`, `tests/core-diet.json`'s two `edit` fingerprints, and the example paths in
`tests/mindmap.test.mjs`, `tests/mindmap.html`, `tests/cloud.test.mjs` and `tests/cloud.html`); each page lane appends its
page to `tests/embed.py`. No other existing test changes.

### 12.3 What runs at the same time (S21)

```
approved, M2.0 and 4b.0 merged ─▶ 4a.0 ──┬─▶ 4a.6 cloud family ───────────────────────────┐
                                         ├─▶ 4a.3 icon packs ─────────────────────────────┤
                                         ├─▶ 4a.1 tree ──────┬─▶ 4a.4 mindmap type ───────┼─▶ 4a.7 ─▶ 0.26.0 (after 0.25.0)
                                         ├─▶ 4a.2 delete ────┘                            │        └─▶ 4a.8 AWS on, when answered
                                         └─▶ 4a.5 Mermaid mindmap ────────────────────────┘
```

- Five code lanes at most across the project, shared with milestone 2's fourteen packages, milestone 4b's five and stage
  6's 6.3 to 6.7. Milestone 4a holds at most two lanes at once (decision 21), and a free lane goes first to packages of
  notes approved earlier (stage 6, then milestone 2, then 4b), then to 4a's. In 4a's two lanes:
  - lane 1, the critical path: 4a.1, then 4a.4, then 4a.7;
  - lane 2: 4a.6; 4a.3 (Python; shares `umlimator.py` with M2.12 and 4b.4, and `check.yml` with 4b.4); 4a.5 (shares
    `umlimator_import.py` and `tests/import.py` with M2.12 and 4b.4); 4a.2 once M2.1 has merged, before 4a.4 needs it
    for its deep-chain test.
  The critical path is 4a.1 → 4a.4 → 4a.7, with 4a.2 (behind M2.1) joining before 4a.4 closes; 4a.7 also waits for lane
  2's four. A third lane opens to 4a only when the cap has one no earlier note's package can use.
- 4a.4 may write its definition, rules and `describe()` against §6.2's contract before 4a.1 merges; 4a.6 against §4.5's
  table before 4a.3 merges.
- Only 4a.2 touches the core.
- Milestone 4a's packages may merge to `main` before 0.25.0 ships, provisional until 0.26.0, as stage 5's did in 0.21.0.
  0.26.0 ships after 0.25.0, and 0.27.0 after it.
- One reviewing agent that did not write the code checks each pull request against the definition of done; before the first
  of two open branches that share a file merges, their merge is rehearsed in a scratch worktree (X2).

| Option, when to start (decision 21) | For | Against |
|---|---|---|
| **(a) On approval and after M2.0 and 4b.0, at most two 4a lanes, behind earlier notes' packages: lane 1 4a.1 → 4a.4 → 4a.7, lane 2 4a.6, 4a.3, 4a.5, 4a.2 (recommended)** | The critical path starts at once; the cloud type and the terms flow get their review before the release; earlier milestones keep their lanes | 4a takes longer than with more lanes; `lib/` rebuilt in more branches at once (X2) |
| (b) As (a) with one lane, in the order 4a.1, 4a.6, 4a.3, 4a.5, 4a.2, 4a.4, 4a.7 | Fewest merges against M2 and 4b at once | Everything serial; the terms flow reviewed late |
| (c) After 0.25.0 is released | No overlap | Lanes idle; the release order already serializes what ships |

### 12.4 Files shared with the work in flight

| File | Who else | Order |
|---|---|---|
| `tools/build.mjs` (`ALL`) | M2.0, M3's first package, 4b.0 | Each appends its list; 4a.0 after M2.0 and 4b.0 (§12.1); M3's, written later, goes before 4a's in `ALL` and rehearses |
| `src/core/apply.js` | M2.1 (`addView`) | M2.1 first, or the merge rehearsed; 4a.2 changes `delete` only |
| `src/core/model.js` | none in the approved notes; any later lane touching `typedProblems` | 4a.2 changes the cycle check's loop only; the second rehearses |
| `umlimator.py` | M2.12 (`cmd_import`), 4b.4 (`import` routing, the `export` command, and the whole file in its Owns) | 4a.3 changes `page_model`, `icon_bytes`, `cmd_check`, and `main()`'s `add_subparsers` lines for `pack`, which 4b.4 also edits for `export`: whichever merges second rehearses (X2) |
| `umlimator_import.py`, `tests/import.py` | M2.12, 4b.4 | 4a.5 adds `mindmap` to `TYPED` and its cases; the second rehearses |
| `.github/workflows/check.yml` | 4b.4 (its moddle install and variable) | 4a.3 adds one step line; the second rehearses |
| `icons/manifest.json` | none | |
| `tests/embed.py` | 6.3, 6.5, 6.6; M2.2 to M2.7, M2.14; 4b.1 to 4b.3, 4b.5 | Its pages are one list literal on one line (the motion pass's `for`), so every two lanes that add a page conflict on that line, not only by order: every such pair rehearses (X2), and the resolution is both entries kept |
| `docs/diagrams/examples/25-` to `28-*.json` | 6.6, M2.14 and 4b.5 own `docs/` but edit none of these | 4a.0; stated in its row |
| `docs/diagrams/examples/check.mjs` (`MOVED`), `tools/atlas.mjs`, `tools/atlas-links.json`, `examples/bookshop-atlas.json`, `tests/atlas.test.mjs` | 6.6, 6.7, M2.13, 4b.5 | Those first; 4a.7 rebuilds the atlas after merging `main` |
| `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/module-api.md`, `docs/editing.md`, `README.md`, `examples/README.md`, `examples/index.html`, `tests/cli.py`, `tests/mcp.py`, `tests/notation.html` | 6.6, M2.14, 4b.5 | Appends; 4a.7 after them |
| `docs/diagrams/model.md`, `risks.md` | Every note's changes on approval | Whichever note is approved first; the next merges |

Among milestone 4a's packages: no two own one file but `tests/embed.py` (4a.4, 4a.6, 4a.7, each pair rehearsed) and
`README.md`'s Icons section (4a.7, then 4a.8).

### 12.5 The release

0.26.0 after 4a.0 to 4a.7, and after 0.25.0, by the repository's rule: `package.json`, `## 0.26.0:` in
`docs/module-api.md`, merged when the maintainer approves that pull request by number. Its notes say: new, the Google
Cloud and Azure diagrams, icon packs fetched by `umlimator.py pack fetch` after the vendor's terms, the mindmap and its
Mermaid reader and writer; changed, decision 7's three logos (fetched with the Azure pack only) and `delete` down a deep
chain; the AWS diagram is built and not yet offered; left out, §13. The `map-repo` skill's pin does not move.

4a.8 ships in the first release after it merges, named in that release's notes.

| Option, C10 (decision 22) | For | Against |
|---|---|---|
| **(a) In 4a.7: the MCP server's read tools and the diff Action's step tested on the three examples, with no pack (recommended)** | Tests only; CI has no pack cached, so the MCP server's pages show glyphs there (on a user's machine with an accepted pack they draw the icons: `UMLIMATOR_OFFLINE` blocks fetches, not cache reads) | A reorder reads "changed" in `diff()` until per-type writers come |
| (b) Left to a later package | One less file | An untested type on the MCP server |

| Option, testing packs in CI (decision 23) | For | Against |
|---|---|---|
| **(a) A synthetic pack the tests build (recommended)** | CI never contacts a vendor; nothing to cache; the hash, size, terms and yes paths all tested | The vendors' real zips are not opened in CI: a change in their layout shows at the next re-pin, by the maintainer's run of `pack fetch` |
| (b) A CI job fetching the real packs | Tests the real files | CI downloads vendor icons and keeps them in its cache: published output by S18; Google's unversioned files break CI when they change |

## 13. Left out, and departures

| Left out | Why |
|---|---|
| Downloading packs from the module, the page or the MCP server | The module makes no network calls; the yes is the user's, at the CLI (§4.5) |
| AWS in 0.26.0 | Gated (§2.3) |
| Vendors' group colours and diagram style guides | Decision 10 |
| The vendors' other packs (AWS's PlantUML set, Microsoft's Entra and Power Platform sets, Google Workspace) | Each has its own terms; read before any is offered |
| Icon search in the editor beyond the panel's field | Decision 9 |
| Older pack versions side by side | One pin per pack; the alias table carries renames |
| Mermaid's shapes, icons, classes and Markdown formatting drawn | Decision 16; kept and written back |
| Folding a mindmap branch in place | Delete hides it, undo or the outline brings it back |
| A mindmap laid out down, radially or as Mermaid's tidy tree | Left and right only (§6) |
| Lines between mindmap topics other than the tree | Mermaid has none; row 25 has none |
| XMI, copy and paste (E7), per-type `diff()` writers | As every stage |

Departures, in the conformance notes: no claim to follow any vendor's architecture diagram guidelines; groups drawn in the
typed look; the full service name drawn under the label, derived from the pack's id where the pack's files give no other;
the mindmap follows no standard, and Mermaid's shapes are not drawn.

## 14. The decisions for the maintainer

Each is set out with its options and trade-offs in the section named; the recommendation is the first option there.

| # | Question | Recommended | Other options | Section |
|---|---|---|---|---|
| 1 | How AWS is gated | The whole `aws` type off behind `CLOUD_AWS`, no pack row; 4a.8 turns it on | Type on, pack off; AWS out of the milestone | §2.3 |
| 2 | What cloud diagrams build on | Stage 2's boxes as the deployment type nests them, an icon card of the family's own | The map's 16 px typed card; map views | §5.1 |
| 3 | Where the drawing gets icons | The host's `icons` table; the module never fetches | The module fetches | §4.5 |
| 4 | How a yes is given | At a terminal, or `--accept-terms <pack>@<label>`, which prints the terms and records `via: flag`; per pack and label; never through the MCP server | One yes for all; a yes then fetch on render | §4.3 |
| 5 | Azure's terms | Terms before any byte: the icons page's terms, word for word, pinned by hash; the zip's PDF checked against its pinned hash after | The PDF from the zip, downloaded before the yes; text extracted | §4.3 |
| 6 | What "published output" covers | This project's outputs; a user's render carries what they fetched | Users' exports too | §4.4 |
| 7 | The Microsoft logos in the manifest | The three read from the Azure pack; `entra` no longer fetched by a render (the cache, else the sigil; into the pack if the zip holds it); nothing downloaded by a render | `entra` its own pinned pack; `entra` as now, a risk row; keep all as now; remove | §4.6 |
| 8 | The ids `props.icon` holds | The pack's own, with an alias table | Short ids mapped | §3 |
| 9 | Choosing an icon | The panel's text field and the nearest ids | A picker; a searchable picker in the core | §5.6 |
| 10 | The groups' look | The typed look, kind in the title, no group icon | The group icon with its full name as the kind; the vendors' colours | §5.3 |
| 11 | Google's legal line | In the picture, legend, `describe()`, PDF and docs | Legend and docs only | §5.7 |
| 12 | The tree strategy | Bands | A tidy tree; `layoutTyped` | §6.1 |
| 13 | Sides | `present.side`, else the side whose first-level bands are shorter in px, right on a tie | All right; alternating | §6.4 |
| 14 | Branch colours | The map's kind palette per first-level branch | One ink | §7.1 |
| 15 | Delete on a topic | Hides its branch | Hides the topic only | §7.3 |
| 16 | Mermaid's shapes | Kept under `ext.mermaid`, written back, not drawn | `props.shape`, two new shapes | §8.4 |
| 17 | The reader's limits | 1 MiB, 64 levels, linear ids, never throws, each hostile file under 1 s | | §8.2 |
| 18 | The core | 4a.2 makes a deep chain linear: `take` iterative, one `filter` per list, the cycle check memoized (about 130 B, `apply.js` and `model.js`) within the 700 B share; the rest to the reserve | `take` only, deep tests capped at 5,000; leave the core, warn only | §2.4 |
| 19 | The atlas | Prefixed ids; the mindmap's "Hosting" topics open the cloud views | No links; not joined | §10.3 |
| 20 | P1 | Both flags off; CI's 1 s the gate, 100 ms printed and recorded, no stop mid-package; timed tests serial | Stress view sized to P1's 40 elements at 100 ms; a stop over 100 ms | §11 |
| 21 | When to start, and how many lanes | On approval after M2.0 and 4b.0; at most two 4a lanes behind earlier notes' packages: 4a.1 → 4a.4 → 4a.7, and 4a.6, 4a.3, 4a.5, 4a.2 | One lane; after 0.25.0 | §12.3 |
| 22 | C10 | Tested in 4a.7 | Later | §12.5 |
| 23 | Testing packs in CI | A synthetic pack | CI fetches the real packs | §12.5 |

## 15. What this note changes elsewhere

- **`model.md`.** Rows 25 to 28 as §3; `iconPacks` as §3 says; a pointer here.
- **`risks.md`.** S2 points to §4 and gains zip members read in memory, downloads capped at the pinned size, and
  `UMLIMATOR_PACKS`, read only under `UMLIMATOR_TEST`; §6's Tree
  and Cloud rows point to §10; C5 records milestone 4a's share and its spend; P1 gains §11's common edits; R2 gains the
  hostile mindmap files; new rows: a deep `parent` chain made `delete` throw and `validate()` stall (S16, closed by 4a.2);
  Google's unversioned files changing under their pin; Microsoft's icons page or PDF changing under their pin; the AWS
  gate and the conditions of AWS's reply.
- **`plan.md`.** §5's M4a row points here (done with this note); §4.3 lists `src/cloud/`, `src/mindmap/` and `tree` under
  `src/layout/`; §3's 0.26.0 row reads "GCP, Azure; mindmap; AWS when its switch is on" (the lead's).
- **`proposal.md`.** §6.5's recommendation points to §2.3 for the terms as answered.
- **`README.md` in this folder.** The open question "May a tool download the AWS and Google icon packs for its users?" is
  answered for Google and Azure (13 Nov 2026) and waits on AWS (asked 14 Nov 2026); the status table shows this note and,
  once approved, its work packages; the log records the decisions. (The lead's.)
