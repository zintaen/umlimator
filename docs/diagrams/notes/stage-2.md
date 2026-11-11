# Stage 2 design note: object and package diagrams

Status: **proposed** 12 Nov 2026, against `main` at 9c1cf4f (0.17.0 released; 1.9 to 1.12 merged; the core's diet, C5,
not started). The maintainer approves it before work package 2.1 starts. Symbols are named, not line numbers.

Stage 2 ships release 0.19.0: the object diagram (`uml.object`) and the package diagram (`uml.package`), and the class
view drawing ownership as nesting (`plan.md` §5, row 2).

## 1. What this note settles

| # | Point | Recommendation | Section |
|---|---|---|---|
| S1 | The vocabulary of `model.md` rows 2 and 3 | Kept, with refinements: link ends carry roles; an instance may be anonymous; a slot may have no value; a package import's `visibility` is `public` or `private`; row 3's classifiers are row 1's | §2 |
| S2 | How compound nodes are laid out | Reuse the map's boxes: `containers`, `blockPos` and the layered layout's box code, opened to typed views. A change of owner lays the view out again | §3 |
| S3 | Which shown element is a box, and what it holds | A package with something it owns shown is a box; each shown element sits in its nearest shown owner that may be a box. A type hands over its boxes with a new registry field, `boxes(model, view)` | §4 |
| S4 | How a package is drawn | Open: a frame whose border is the box's border, with its name in a tab inside the header room. Closed: a folder with its name in the body. The family file draws both; `svgOf` asks the shape for a box's frame | §5 |
| S5 | Qualified names (M6) | `::` names, written from the nearest shown owner, the view's `subject`, or the top. Only the drawn name changes | §6 |
| S6 | Lines at a box | A line to an open package ends on its border. A line between a package and something it holds is not drawn, with a warning. No line is lifted to an owner | §7 |
| S7 | Editing ownership | Drag into or out of a box: `reparent`. By keyboard: an Owner field in the properties panel. Deleting a package deletes what it owns, as `apply()` does today | §8 |
| S8 | The object diagram | The classifier shape with an underlined head, `name : Classifier`; slots as `feature = value` rows; links with a name and end roles | §9 |
| S9 | What the class view gains | Packages drawn as nesting in every class view, from 0.19.0: an exception to `plan.md` §1 and §8 that the maintainer approves; 0.18.0 says it is coming | §10 |
| S10 | The Mermaid reader's namespaces | The reader is unchanged. The writer keeps nested braces and names an owner the view does not show in its `%% not written:` lines | §11 |
| S11 | The core's budget (C5) | The diet lands first. Stage 2's core changes are the ones listed in §12; everything else goes in family files | §12 |
| S12 | The PDF's tables (R8) and a re-own in `diff()` (M11) | In this stage, as their own lane, in the core | §13 |

Left open on purpose: drawing containment with the ⊕ anchor, element import, and the semantics of package merge (all out,
§14); what other stages draw as boxes (states and regions in stage 4, nodes and components in stage 5), which use S2 to S4.

## 2. Vocabulary (S1)

The rows of `model.md`, refined. `uml.Comment` and `uml.CommentLink` are on every UML view already (`model.md` §2).

| # | `diagram` | Nodes | Members | Edges | Notes |
|---|---|---|---|---|---|
| 2 | `uml.object` | `uml.InstanceSpecification`, `uml.Comment` | `uml.Slot` | `uml.Link`, `uml.CommentLink` | Instance: `label` is its name and may be left out (an anonymous instance); `props.classifier`, text (M8); `props.stereotypes`. Slot: `label` is the feature, `props.value` its value as text, which may be left out. Link: `label` is its name; `props.association`, text; `props.ends.<end>.role` |
| 3 | `uml.package` | `uml.Package`, the classifiers of row 1, `uml.Comment` | | `uml.PackageImport`, `uml.PackageMerge`, `uml.Dependency`, `uml.CommentLink` | Nesting is `parent`. PackageImport `props.visibility`: `public` (the default, drawn «import») or `private` (drawn «access»). Package `props.stereotypes` |

What changed against `model.md`:

- **Link ends carry roles.** UML adorns a link's ends with the association's end names. `02-object.json` already writes
  `props.ends.to.role`. Multiplicity, aggregation and navigability on a link are left out: an instance has no multiplicity.
- **An anonymous instance** has no `label`. It is drawn `: Order`. An instance with no classifier is drawn by its name alone.
- **A slot with no value** is drawn by its feature's name.
- **`visibility` has two values.** UML's «access» is a private package import, so `uml.PackageImport` carries it, and
  `proposal.md` §3.2's "access" needs no type of its own.
- **Row 3's classifiers are row 1's.** `model.md` says "any classifier"; components, use cases and the like come with their
  own stages.
- **Owners in rows 1 to 3 are packages.** A classifier, a package or an instance may have a package as `parent`
  (nested classifiers stay out, `proposal.md` §8.2). Rule `owner-kinds` (§9.3, §10.3) warns of any other owner. Comments
  are not checked: later stages put them in states and components.
- **`subject` on a class, package or object view** names the package whose inside the view shows. Names are qualified
  from there (§6). It is not listed in `nodeIds` and not drawn; listed, it is drawn as any package is, a box holding the
  rest. Nothing else reads it in these views.

## 3. Laying out compound nodes (S2)

### 3.1 Options

| Option | For | Against |
|---|---|---|
| **(a) Reuse the map's boxes (recommended)** | It exists and is tested on maps: `containers` with `parent` nest boxes (#82); `blockPos` keeps each box's contents together and orders blocks by the lines between them and by lines from outside (#86); the layered layout widens gaps so boxes never touch, ends a line on a box's border, routes around box borders and keeps titles clear; the canvas already selects a box and highlights the box under a drag. One compound layout for stages 4 and 5 and C4 | Core bytes (§12). `blockPos`'s known limits now reach UML: a far end that moves in its last pass, and a pin that puts a node outside its box (§4.3). The map's 24 px header and 32 px gap become UML's |
| (b) Recursive, in a family file: lay out each package's inside alone, then the package as one sized node at its owner's level | No core bytes | A line across a border belongs to neither level: it needs a last routing pass over the flat picture, around boxes, which the typed router does not do. Each level is ordered without the lines that leave it, so more crossings. It rewrites what `blockPos` does |
| (c) ELK, as an optional adapter | Compound graphs with lines across levels, natively | A dependency (D8: an optional adapter only). Stage 5 holds the time-boxed trial of ELK (L9); choosing it now decides that trial early |

### 3.2 What (a) changes

- **Positions.** `autoPos` in `src/map/context.js` lays out a typed view whose type gives `boxes` with `blockPos`, and one
  with none with `flowPos`, as now. `blockPos` takes the boxes as an argument (a map passes `view.containers`), leaves box
  ids out of its cards, and turns the lines the type's `rankFlip` names, as `flowPos` does.
- **Box ids are not cards.** An open package is in `nodeIds` but takes no slot: `fillLayout` (`src/map/context.js`) and
  `withPlaces` (`src/canvas/render.js`) skip the ids the type gives as boxes, so a box's id and its kept pin do not push a
  real node down a row.
- **A change of owner lays the view out again.** `withPlaces` keeps every node's previous place after an edit, so
  `fillLayout` sees a complete layout and `blockPos` never runs. Kept after a re-own, the boxes, built from their members'
  rectangles (`framesNow`), would stretch over nodes they do not hold, which on a UML picture says the wrong owner.
  So `withPlaces` drops a typed view's kept places when the edit changed the owner on the picture of a shown element.

| Option | For | Against |
|---|---|---|
| **(a) Lay the view out again on a change of owner (recommended)** | Every box holds exactly its contents; a re-own is rare | The picture moves on that edit, not only the dragged node |
| (b) Keep places, as maps do: the dropped node takes its drop slot, the rest stay | Nothing else moves | A box can cover a node it does not hold until the user lays out again; the layout check reports it |

- **Geometry.** `classGeo` passes the open packages to `layoutTyped` as `containers`, not as nodes, so `boxEnd` is found
  for them. `layoutPass` runs its box code for a typed view with containers as it does for a map: boxes kept 32 px apart, a
  line ending on a box's border (`boxEnd`), box borders in the routing grid, a box's title kept clear of labels. Each guard
  becomes "a map, or a typed view". A map takes exactly today's path: the geometry hashes prove it.
- **Direction down.** A box's header room (24 px) is put above its contents. Laid out turned, it must go on the side that
  becomes the top after the transpose (`notes/stage-1.md` §6). `transpose()` already turns `families`.
- **The memo.** `containers` is in `VIEW_GEO` with its `label`, so a change of owner or a rename of an open package lays the
  geometry out again; a rename of a closed node's name and a property change follow the memo's rules as now.

## 4. Boxes (S3)

### 4.1 The rule

1. A type names which of its node types may be a box. In stage 2: `uml.Package`.
2. A shown element's **owner on the picture** is its nearest ancestor by `parent` that the view shows and whose type may
   be a box. Owners the view does not show are skipped (their names go into the qualified name, §6). An owner that may not
   be a box (a class, against `owner-kinds`) is skipped too.
3. A shown package that is the owner on the picture of at least one shown element is **open**: a box. A shown package that
   is the owner of nothing shown is **closed**: a node (M6, "owner alone").
4. A box holds exactly the shown elements whose owner on the picture it is (M6, "some children: only those"), and the
   boxes nested in it.
5. A typed view whose type gives boxes ignores its own hand-written `containers`, with a warning (rule `own-boxes`), so the
   model's ownership and a view's boxes cannot drift apart (`proposal.md` §3.3, row 3). `validate()` still accepts them on
   any view.

### 4.2 The registry field

`boxes(model, view) → [{ id, label, title, nodeIds, parent, shape, aria }]`: the map's container format, plus `title`,
the drawn text (stereotypes and the qualified name), the shape that draws the frame and its accessible name. `label` stays
the package's own name, because renaming a container fills the editor with it. Optional; with none, a typed view has no
boxes, as now. The layout context calls it for positions and `classGeo` for geometry, so the two agree. It is added to the
provisional fields in `src/core/registry.js` (`notes/spike-sequence.md` §1).

### 4.3 Pins

- A node's pin is its `[col, row]` in the view, as on maps. A box takes its place from what it holds.
- An open package's pin is kept in the model and used when it is closed. Dragging a box does nothing; Alt + arrows on it
  does nothing.
- A pin that puts a node outside its owner's columns grows the box to hold it, as on maps. The box may then come near
  another box: the layout check reports it. The minimal fixture has a pinned node in a box; a pin far outside it is a
  known limit, stated in the conformance note.

## 5. Drawing a package (S4)

- **Open:** a rectangle whose border is the box's (`f.x`, `f.y`, `f.w`, `f.h`), so `boxEnd`, the 32 px gap, the routing
  grid and the audit's header box hold as on maps. The tab is drawn inside the header room (24 px) at the top left,
  closed by a line under it and one on its right; it holds the stereotypes (`«…»`) and the name, cut to the box's width
  (`fit`). The stroke is the typed views' `--um-muted` (5.95:1 light, 7.05:1 dark), so its border passes 3:1.
- **Closed:** a folder: an empty tab on a body, the stereotypes and the name centred in the body (UML 2.5.1, 12.2.4). Its
  size comes from its name, as a classifier's does.

| Option | For | Against |
|---|---|---|
| **(a) The tab inside the header room (recommended)** | No change to `boxEnd`, the gap or the audit | The open package reads like UML's frame notation: the border right of the tab is level with the tab's top. The closed folder is UML's true shape. Stated in the conformance note |
| (b) The tab above the body, `boxEnd` and the ports on the body's rectangle | UML's exact shape | Core bytes in `layoutPass`; a second rectangle per box in the router and the audit |
| (c) The tab above `f.y`, nothing else changed | No core bytes | The tab breaks the 32 px gap and the routing grid at `f.y - 16` |

- **Where the code goes.** A family shape, `SHAPE.package`, in the family file: `size`, `out`, `face`, `inset`, `ports` and
  `draw` for the closed node, as `SHAPE.note` is added by `src/uml/class.js`; and `frame(f)` for the open box. `frame(f)`
  keeps `<text class="family-title" data-t="ft" data-o="<id>">`: the audit checks title overflow with it, and
  `render.js` reads it to announce "Box …, selected". In `svgOf`, a family whose `shape` has a `frame` is drawn by it,
  inside the same `<g class="family" data-family>` the canvas selects; every other family is drawn as now. Maps never set
  `shape` on a container.
- **Accessible names:** "Package sales (closed)", "Package sales, holding 4 elements". A frame is not a Tab stop (the
  canvas focuses `.node`, `.um-key` and badges); the keyboard path to an open package is the outline of elements (M5).
  The reading order (a box, then what it holds, depth first) is the outline's and `describe()`'s.

`SHAPE.folder`, the map's card skin, is not reused: it is a card with tabs and badges, and a map's look must not change.

## 6. Qualified names (S5)

- A shown element whose owners are not all shown is drawn with the names of the owners between it and its owner on the
  picture, joined by `::` (UML's separator):
  - inside a shown owner, with one owner between hidden: `card::CardPayment` inside `payments`;
  - with no owner shown: from the view's `subject` when that is one of its owners, else from the top:
    `payments::card::CardPayment`.
- An element whose owner is shown, or that has no owner, is drawn by its own name.
- Only the drawn name, its accessible name and `describe()` change. The model's `label` is unchanged, and F2 edits it alone.
- A long qualified name widens the box up to the classifier's 320 px, then is cut (`fit`).
- The class example's "Payments only" view shows four classes of `sales` without `sales`: it gains `subject: "sales"`
  (2.2), so its classes keep their plain names.
- **Options weighed:** (a) **qualify from the nearest shown owner, the `subject`, or the top (recommended)**: what UML
  draws, and a view of one package reads without its prefix. (b) Always from the top: simpler, but "Payments only", with
  its subject, would still say `sales::` on every class. (c) Never qualify: two classes named `Order` in two packages
  would look the same (`03-package.json` has them).

## 7. Lines at a box (S6)

- A line whose end is an open package ends on the box's border, as a map's line to a box does. A line to a closed package
  ends on the folder.
- A line between a package and something it holds, at any depth, is not drawn. `classGeo` leaves it out before the layout,
  so `layoutPass`'s own warning ("joins the box and something inside it") does not repeat it; the package type's
  `validate(model, view)` warns of it (rule `line-inside`). UML draws containment with ⊕, which is out of the subset.
- A line to an element the view does not show is not drawn, as now. It is never moved to the element's owner.
- A line from an element in a box to anything outside crosses each border between them. The router already crosses box
  borders on maps (L8). The fixture (§15) has one from depth 3 to depth 0.

## 8. Editing ownership (S7)

- **By pointer:** dropping a node into a box, or out of every box, emits one transaction: `reparent` to the package under
  the drop point, then the node's pin. Outside every box, the new owner is the view's `subject`, or none when the view has
  no subject. A drop in the box it is already drawn in emits the pin only, as now, even when its model owner is a hidden
  package inside that box. The box under the drag is highlighted, as on maps. `render.js` finds it (`boxAt`) but
  `endGesture` calls `tx.drop(n, hint)` alone: 2.1 passes the box and the box the node was in (`boxOf`, which reads
  `geo.families`) to the typed editor.
- **By keyboard:** the properties panel gains an **Owner** field for an element of a type that may be owned (a select of
  every package by its qualified name, and "none"). It emits `reparent`. A package is not offered as its own owner or
  under itself: `apply()` would refuse it anyway.
- **Selecting a box:** clicking an open package selects it as a container. The typed editor reads a container
  selection's id, so F2, Delete, Shift + Delete and the properties panel work on it. F2 edits `label`, the plain name.
- **Hiding a package** (Delete) from a view leaves what it held on the picture, qualified (§6).
- **Deleting a package** (Shift + Delete):

| Option | For | Against |
|---|---|---|
| (a) Its contents stay, moved to the package's own owner | Nothing goes that was not selected | A change to `apply()`'s `delete` (core bytes, against C5) and a change of behaviour (`plan.md` §8, M4) |
| **(b) Its contents go with it (recommended)** | What `apply()` does now: `take()` walks what the package owns (M4), and only things not taken, such as a line with a `parent`, are moved to the nearest owner left. No command changes; undo restores all of it | One key deletes a whole subtree |
| (c) Refused while it holds anything | Safe | A step for every package; a canvas change |

- **Not added:** a new element created inside the selected package. Add it, then set its Owner.

## 9. The object diagram (S8)

### 9.1 Drawing

- An instance is the classifier shape (1.5) with one compartment, `slots`. Its head is `name : Classifier`, underlined, or
  `: Classifier`, or `name`. Its stereotypes are drawn over it, as on a class.
- A slot is a row: `feature = value`, or `feature` with no value. `memberText` prints `props.default`, so `object.js`
  passes each slot to the shape as `{ label: feature, props: { default: value } }`: no core change.
- A link is drawn as an association with no end marks: its `label`, or with none its `props.association`, on the line, and
  each end's `role` by its end (1.5's end labels). UML does not require the link's name underlined (9.8.4), so lines'
  labels are drawn as they are.
- **The underline:**

| Option | For | Against |
|---|---|---|
| **(a) A flag on the classifier shape, `underline` (recommended)** | One attribute on the name's `<text>` in `classSvg`; the static member's underline is drawn the same way. `classGeo` passes the type's look's `underline` through | Core bytes: a few tens, gzipped |
| (b) A family shape that edits the classifier's markup as text | No core bytes | Couples the family to `classSvg`'s markup |
| (c) A whole instance shape in the family file | No core bytes, no coupling | Copies `classSvg` |

### 9.2 Editing

- Palette: Instance, Comment. Lines: Link, Comment link. Properties: an instance's classifier and stereotypes; a link's
  association and both roles.
- A slot is edited as a member row in the micro-syntax `feature = value`: the feature a name (as `parseMember` reads one),
  the value the rest of the line, trimmed. `print(parse(x))` is stable; a line with no name is refused and kept as written
  (E3). The type's `member` hook gives it, as `uml.class` does.
- F2 renames the instance (its `label`); the classifier is set in the properties panel.

| Option | For | Against |
|---|---|---|
| **(a) F2 edits the name; the classifier is a property (recommended)** | No change to the canvas; the classifier keeps one place to be edited | The name editor shows `order1042` over a head that reads `order1042 : Order` |
| (b) F2 edits the whole head, `name : Classifier`, through a type hook | What is seen is what is edited | A new hook in `src/canvas/edit.js` (core); a second micro-syntax to keep stable |

### 9.3 Validators

Each has a passing and a failing fixture. `validate()` runs a type's rules only for the types of the model's views
(`src/map/validate.js`), so a model with only an object view gets no class rules. The object type's `validate` calls
`classProblems` (for `member-names`, which covers two slots for one feature) and the shared rules of `owners.js`; the
same problem from two types is reported once (de-duplicated by level, path and message).

| Rule | Level | Says |
|---|---|---|
| `slot-kinds` | error | an instance holds slots only; a slot belongs to an instance |
| `link-ends` | error | a link joins two instance specifications |
| `instance-of` | warning | when `props.classifier` names exactly one classifier of the model (by its name or qualified name), each slot names an attribute of it or of one of its generals (`proposal.md` §3.3, row 2) |
| `owner-kinds` | warning | an instance's owner is a package (shared with §10.3) |

Not checked: a classifier name that matches no classifier or several (types are text, M8); that `props.association` names
an association; that a slot's value fits its feature's type. Integrity across diagrams is out of the milestone
(`proposal.md` §8.1).

## 10. The class view and the package view (S9)

### 10.1 The class view draws nesting

1.9 draws a package in a class view as a node with its name only, and 0.18.0 releases that. Drawing it as nesting in
0.19.0 changes a picture that drew before, against `plan.md` §1 ("every model that drew before draws the same"), §2
item 12 and §8. X3 covers the geometry hashes only, so this is the maintainer's decision, not a rewrite X3 allows.

| Option | For | Against |
|---|---|---|
| **(a) Every class view draws packages as boxes and qualifies names, from 0.19.0 (recommended)** | UML's picture; M6 holds in every view; one code path. 0.18.0's release notes and `docs/conformance/uml-class.md` say packages are drawn as nodes until 0.19.0 | An exception to `plan.md` §1 and §8, approved by the maintainer; said in 0.19.0's release notes |
| (b) Opt in, by a view field | The rule holds | A field kept forever; two pictures of one model |
| (c) 0.18.0 waits for 2.1 and 2.2's class part | The rule holds; no forever field | 0.18.0 waits for core work and the diet's budget; stage 1's release is tied to stage 2 |

What changes under (a): the geometry hashes (`bench/expected.json`) are maps only and do not move; there are no stills of
`examples/sales-classes.json`. Tests change, in a commit that says why: `tests/class.test.mjs` ("every node drawn"),
`tests/class.html` (11 nodes, 10 of them classifiers), and `tests/class-fixtures.test.mjs`'s counts and the stress
fixture's pinned crossings (29 and 2). The stress fixture's `all` view turns `shop` and `catalog` into boxes; it gains
two classes so P1's 50-node full layout is still measured.

### 10.2 The package view

- `uml.package` is its own registered type, built on the class view's code. `classGeo` takes the type's look (which
  compartments, which line looks, which line types, `underline`) so the class, package and object views share it.
- **Classifiers are drawn with their name only:** (a) **name only (recommended)**: a package diagram shows what is where,
  and its class view shows the members; (b) as in the class view: one look, but large boxes in a picture about packages.
- Lines: import dashed with an open arrow, labelled «import» or «access»; merge the same, labelled «merge»; dependency as
  in the class view. The view's legend names them.
- A view with no `edges` list draws its own row's line types only. A listed line of another type is drawn.

### 10.3 Validators of the package type

The package type's `validate` calls `classProblems` too, so `classifier-names` (names per owner) runs on a model with
only a package view. The class type calls `owner-kinds` and `own-boxes`, since class views draw boxes now.

| Rule | Level | Says |
|---|---|---|
| `import-ends` | error | a package import or a package merge runs from a package to a package, not to itself |
| `package-names` | error | packages in one owner have different names |
| `owner-kinds` | warning | a classifier, package or instance of rows 1 to 3 is owned by a package; other types are not checked |
| `line-inside` | warning | a line between a package and something it holds is not drawn (per view, §7) |
| `own-boxes` | warning | a view's hand-written `containers` are ignored where the type gives boxes (per view, §4.1) |

Ownership cycles are the core's check already (M7).

## 11. The Mermaid reader's namespaces (S10)

Read on `main`: 1.10 reads `namespace` blocks as packages, labelled (`namespace Auth["…"]`), dotted (`Company.Engineering`,
nested packages) and nested by braces; ids come from the dotted path. The writer writes nesting as nested braces. A
relation that names a class by a dotted name (`D --> A.B.C`) is reported "not understood". Already done, and kept:
a second class with one name is written by its id with its name as the label (`class wholesale-order["Order"]`); a
`uml.package` or `uml.object` view is written as one `%% not written:` line.

Stage 2's changes, all in `src/readers/mermaid-class.js` and its tests:

- **Nesting stays in nested braces.** Written dotted, a nested package would read back with an id from its path
  (`payments.card`) and need an `%% id:` hint each, and `namespace A.B["x"]` labels the last segment only. 2.4 confirms
  that Mermaid 12.3.0 draws nested braces; if it does not, 2.4 stops and this note is amended.
- **An owner the view does not show.** Today the class is written at the top and its owner is dropped silently.

| Option | For | Against |
|---|---|---|
| **(a) Report it: `%% not written: <id>: its parent <owner>, which the view does not show` (recommended)** | One line in the writer; the loss is stated, as for any other | `read(write(model))` drops that `parent` |
| (b) Write the hidden owner as an empty namespace with an id hint | `parent` survives | Mermaid draws a package the view does not show; reading back adds it to the view |
| (c) A `%% parent: <id>` hint | The class keeps its `parent` | The owner is not in the text, so the model read back has a `parent` that is not an element, and `validate()` errors; the reader changes too |

- `tests/import/classes.mmd`'s report is pinned again; the 500 generated models gain nested owners and hidden owners, with
  a hidden owner's `parent` dropped from the expected model.

## 12. The core's budget (S11)

On `main` the core is 14.93% over 0.16.0 gzipped (Node's zlib), 2 to 112 bytes under C5's 15% by the measure. Stage 2
needs these changes in the core; nothing else of it does:

| Change | File | Lane | Why it cannot be a family file's |
|---|---|---|---|
| `blockPos` takes boxes and the type's flips; `autoPos` calls it for a type's boxes; `fillLayout` skips box ids | `src/map/context.js` | 2.1 | Positions are found before the type's layout runs |
| Box guards open to typed views; header room on the turned side | `src/layout/layered.js` | 2.1 | The box code lives inside `layoutPass` |
| A family drawn by its shape's `frame` | `src/draw/svg.js` | 2.1 | `svgOf` draws families |
| `withPlaces` skips box ids and drops a typed view's places on a change of owner; the drop passes the box to the typed editor | `src/canvas/render.js` | 2.1 | The kept places and the gestures are the canvas's |
| The drop's `reparent`; a container selection's id; the Owner field | `src/canvas/edit.js` | 2.1 | The typed editor and the properties panel are the canvas's |
| The `boxes` field documented | `src/core/registry.js` | 2.1 | A comment only |
| The classifier's `underline` flag (§9.1, if (a)) | `src/draw/shapes.js` | 2.3 | The classifier shape is the core's |
| Typed tables in the PDF (R8) | `src/page/print.js` | 2.5 | `print.js` is in the core's `ORDER` |
| A re-own reads "moved into …" in `diff()`'s summary (M11) | `src/map/diff.js` | 2.5 | `diff()` is the core's |

| Option | For | Against |
|---|---|---|
| **(a) The diet first, then these changes, each pull request stating its bytes (recommended)** | C5 holds; the box code is shared with maps, not copied | Stage 2 waits for the diet. If the diet frees too little, these are weighed again in this order: §9.1 falls back to (b), then M11's words, then the Owner field |
| (b) Copy the map's box code into a family file | No core bytes | Two copies of `blockPos` and the box routing to keep in step |
| (c) Raise C5's budget | No wait | The maintainer's call; maps' hosts pay for UML |

## 13. The PDF's tables and `diff()` (S12)

`risks.md` R8: the PDF's tables of a typed view are the map's ("Script" from `KIND`, "calls", no members). They are built
in `src/page/print.js`; `umlimator.py pdf` only has Chrome print the page. Stage 2 adds two types that would print the
same. `risks.md` M11: a reorder, and now a re-own, reads only "changed" in `diff()`.

- **(a) Fix both in stage 2, as their own lane (recommended):** for a typed view, `print.js` lists the element's type word
  (from its `type`, as `typeWord` does), a line's type word, and members or slots through the type's `member.print`. No
  new registry field, so the lane does not touch `registry.js`. `diff()` says "`X` moved into `Y`" when only `parent`
  changed. It runs beside the rest; 2.5 shows it on the class type, and 2.6 shows it on the object and package types.
- (b) Leave both listed in each conformance note: no work now; three notes with the same limits.

## 14. Out of the subsets

| Type | Left out |
|---|---|
| Package | The semantics of package merge; element import; the ⊕ containment notation; a line between a package and what it holds; package URIs; visibility marks on a package's elements; a diagram frame (`pkg`); the tab above the body on an open package (§5); nested classifiers (a class owned by a class); models and profiles (stage 6) |
| Object | Checking slot values against their types; classifiers and associations by reference (M8); a classifier name that matches no classifier or several; a link's multiplicity, aggregation and navigability; an instance's value specification (`= value` in its body); nested instances in slots; n-ary links; links drawn as instances of an association class |
| Both | XMI (R6); a reader for either: Mermaid has neither notation; `paths()` reads their lines as a map's |

## 15. Fixtures

From `risks.md` §6 G1 and L4's L8, and M6. Each is laid out with no overlap, no text overflow, no line through a node, none
along a box's border and none through a tab, under three fonts and both themes, in both directions.

| Fixture | Holds |
|---|---|
| `tests/package-minimal.json` | G1: a package holding a package; an empty package (closed); a package whose contents are all hidden (closed); a package with some of its contents shown. L8: three levels of packages with a class at depth 3, and a line from it to a class at depth 0; a line between two classes in one box; a line between two boxes; an import between two open packages; an import to a closed package; an access; a merge. M6: a class shown without its owner; one with the owner between hidden; a view with `subject`. Two classes named `Order` in two packages. A pinned class in a box. A line from a package to a class it holds (not drawn, warned). A view with hand-written `containers` (ignored, warned). A class owned by a class (`owner-kinds`) |
| `tests/package-stress.json` | 50 elements over three levels, 60 lines (P1: a full layout under 1 s, an edit that moves nothing under 100 ms) |
| `tests/object-minimal.json` | An anonymous instance; an instance with no classifier; one with no slots; a slot with no value; a long slot value (cut); a link with a name; a link naming its association only; roles at both ends; two links between one pair (F2); a link from an instance to itself (F1); an instance in a package shown without it (qualified); an instance whose classifier is in the model, with a slot it lacks (`instance-of`) |
| `tests/object-stress.json` | 50 instances, 60 links (P1) |

`tests/class-stress.json` already holds packages (`shop`, `catalog` in `shop`); it draws them as boxes from 2.2 and gains
two classes (§10.1). `tests/class-minimal.json` has none.

## 16. Work packages

### 16.1 Before stage 2 starts

- The core's diet (C5) is merged and 0.18.0 is released, its notes saying packages are drawn as nodes until 0.19.0.
- This note is approved, and `model.md` and `risks.md` take §17's changes with it.
- No open pull request touches the files 2.1 owns.

### 16.2 The packages

Each is one pull request. "Owns" is the files only that package may change while it is open. Built files
(`lib/umlimator.js`, `lib/umlimator-all.js`) and `examples/bookshop.html` are rebuilt by every package that changes `src/`,
after merging `main`, never merged by hand. The lead keeps `docs/diagrams/README.md`'s status table (X7); a package
proposes its row in its pull request's description.

| # | Work package | Owns | Needs | Done when |
|---|---|---|---|---|
| 2.1 | **Boxes on typed views.** §3.2, §4.2, §5's `frame` call, §8's drop, container selection and Owner field. Tested with a test-only type that returns hand-written boxes, so it depends on no UML code | `src/layout/layered.js`, `src/layout/typed.js`, `src/map/context.js`, `src/draw/svg.js`, `src/canvas/render.js`, `src/canvas/edit.js`, `src/core/registry.js`, `tests/layout-typed.test.mjs`, `tests/typed-edit.html`, `tests/registry.test.mjs` | The diet, this note | Maps unchanged: geometry hashes, the examples' stills and every suite. Three levels of boxes with a line from depth 3 to depth 0 lay out clean, right and down. A drop into, out of and between boxes, and the Owner field, each emit their tested transaction, by pointer and by key; after a re-own every box holds exactly its contents. The core is within C5's 15% over 0.16.0, gzipped by Node's zlib at its default level |
| 2.2 | **The package type, and nesting in the class view.** §4.1's rule, §6's names and `SHAPE.package` in a shared family file; `uml.package` (§10.2, §10.3); the class type's `boxes` and rules; `classGeo` taking a type's look; `describe()`, accessible names, legend | `src/uml/owners.js` (new), `src/uml/package.js` (new), `src/uml/class.js`, `tools/build.mjs` (`ALL`), `tests/package.test.mjs` (new), `tests/class.test.mjs`, `tests/class-fixtures.test.mjs`, `tests/class.html`, `tests/class-stress.json`, `examples/sales-classes.json` (`subject` on "Payments only") | 2.1 to merge; it may start on `owners.js` and the validators beside 2.1 | The definition of done's items 2, 4, 5, 6 and 8 on row 3's subset; every validator with a passing and a failing case; `03-package.json` draws; a 30-step session on it undoes, redoes and reopens to byte-identical models. The class tests, counts and pinned crossings rewritten in a commit that says why (§10.1) |
| 2.3 | **The object type.** §9: the instance's look, the slot micro-syntax, validators, `describe()`, accessible names, legend; the classifier's `underline` | `src/uml/object.js` (new), `src/draw/shapes.js` (`classSvg`'s name only), `tools/build.mjs` (`ALL`, one line, after 2.2), `tests/object.test.mjs` (new), `tests/object.html` (new) | 2.2 (`classGeo`'s look, `owners.js`) | Items 2, 4, 5, 6 and 8 on row 2's subset; `print(parse(x))` stable for every fixture slot; `02-object.json` draws, and a 30-step session on it returns byte-identical models. Within C5 |
| 2.4 | **Mermaid namespaces.** §11 | `src/readers/mermaid-class.js`, `tests/mermaid-class.test.mjs`, `tests/import/` | This note | Nested braces confirmed against Mermaid 12.3.0; `read(write(model))` equals the model, less hidden owners named in the report, for `03-package.json`'s classes in a class view, `sales-classes.json`'s "Payments only" view, and 500 generated models with nested and hidden owners; the pinned report updated |
| 2.5 | **The PDF's tables (R8) and a re-own in `diff()` (M11).** §13 | `src/page/print.js`, `src/map/diff.js`, `tests/change.test.mjs`, `tests/cli.py` (the `pdf` checks) | The diet, this note | A class example's PDF lists element types, line kinds and members; `diff()` says "moved into" for a re-own on a class model. Within C5 |
| 2.6 | **Fixtures, examples, docs.** `02-object.json` and `03-package.json` move to `examples/`, into the gallery and CI; §15's fixtures; C10; every document of `plan.md` §7 | `examples/` (but `sales-classes.json`), `docs/diagrams/examples/check.mjs`, `tests/package-*.json`, `tests/object-*.json`, `tests/package-fixtures.test.mjs`, `tests/object-fixtures.test.mjs` (new), `tests/cli.py` (after 2.5), `tests/mcp.py`, `lib/umlimator.d.ts`, `lib/umlimator.schema.json`, `docs/conformance/` (new `uml-package.md`, `uml-object.md`; `uml-class.md`), `docs/module-api.md`, `docs/editing.md`, `README.md`, `docs/diagrams/` (but the status table) | 2.2, 2.3, 2.4, 2.5 | Items 1, 3, 7, 9, 10, 11 and 12 for both types: the registry and the generated schema hold both; the fixtures lay out clean; fidelity tables measured on the examples; P1 enforced on both stress fixtures; `render`, `check`, `stills` and `pdf` succeed on both examples, the object PDF listing slots and the package PDF element kinds; the MCP server and the diff Action each tested with one object and one package model (C10); the stress fixtures' crossings pinned and stated; R8 closed in `risks.md` |

### 16.3 What runs at the same time

```
diet ──▶ 0.18.0 ──▶ note approved ──┬─▶ 2.1 (boxes) ──▶ 2.2 (package, class view) ──▶ 2.3 (object) ──┐
                                    ├─▶ 2.4 (Mermaid namespaces) ─────────────────────────────────────┼─▶ 2.6 ──▶ 0.19.0
                                    └─▶ 2.5 (PDF tables, diff) ───────────────────────────────────────┘
```

- Three lanes from the start: 2.1 (the core's layout, drawing and canvas files), 2.4 (the reader), 2.5 (`print.js`,
  `diff.js`, the CLI's checks). They share no source file. 2.1 and 2.5 both spend core bytes: the second to merge states
  its bytes against `main` with the first merged.
- 2.2 may start beside 2.1 on `owners.js` and the validators, which need no layout; it merges after 2.1.
- 2.2 and 2.3 both add a line to `tools/build.mjs`'s `ALL`, one after the other. 2.3 changes one line of
  `src/draw/shapes.js` and nothing else in the core.
- Before the first of two open branches merges, their merge is rehearsed in a scratch worktree (X2). One reviewing agent,
  which did not write the code, checks each pull request against the definition of done.

### 16.4 The release

0.19.0 after 2.1 to 2.6, by the repository's rule: `package.json`, `## 0.19.0:` in `docs/module-api.md`, merged when the
maintainer approves that pull request by number. Its notes say:

- new: the object and package diagrams; boxes on typed views; the Owner field and drop to re-own; the PDF's typed tables;
  "moved into" in `diff()`;
- changed: class views draw packages as boxes and qualify names (0.18.0's class pictures differ, by the maintainer's
  decision, §10.1); a re-own lays a typed view out again; the Mermaid writer names a hidden owner in `%% not written:`;
- left out: §14.

The `map-repo` skill's pin does not move: the skill writes neither type.

## 17. What this note changes elsewhere

- `model.md`: rows 2 and 3 as §2; rule 6 says a type draws `parent` as nesting where it names boxes; `subject` on class,
  package and object views (§2, §6); §3 gains a stage 2 row pointing here.
- `risks.md`: M6 points here and closes with 0.19.0; L8 points to §15's fixtures; G1's package rows are fixtures; a new row
  for `blockPos`'s limits on typed views (§4.3); R8 names `src/page/print.js`, not `umlimator.py pdf`, and moves to
  stage 2; M11 points to §13; C10 records stage 2's tests.
- `plan.md` §5: stage 2's row points here. §1 and §8 record the exception of §10.1 if the maintainer takes (a).
- `proposal.md` §3.3 row 2: "classifier and slots exist when linked" is the warning `instance-of`, by name (M8).
- 0.18.0's release notes and `docs/conformance/uml-class.md`: packages are drawn as nodes until 0.19.0.
- `README.md` in this folder: the status table shows this note, and the log records the decisions taken.
