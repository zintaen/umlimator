# Editing (step 5 design note, for approval)

Status: approved with every recommendation, and built, 6 Nov 2026. Types: `lib/umlimator.d.ts` (`Change`, `Hint`).
Tests: `tests/edit.html` (run by `python3 tests/embed.py`). Demo: `examples/edit.html` (serve the repository over HTTP).

## Principle

The canvas proposes, the host decides. An edit gesture on the map never changes what is drawn: it emits a `change`
event describing what the user meant. The host validates it, applies it to its own data (and persists, undoes,
syncs, as it likes), and passes the result back with `handle.update(model)`. The library keeps no copy of the
host's data beyond the model it was last given, and stores nothing.

Positions are not meaning. Every event carries the meaning (which card, which container, which order) and, apart
from it, an optional `hint` saying where the user dropped it. A host may keep hints as presentation (a view's
`layout`), or ignore them.

## Turning it on

```ts
render(el, model, { editable: true });                       // every operation below
render(el, model, { editable: { add: true, rename: true } }); // only these
```

Off by default, so read-only embeds and the standalone page are unchanged.

## The event

```ts
interface Events { change: Change }   // added to the existing click / select / open / viewchange

type Change = { id: string; view: string; hint?: Hint } & (   // id: unique per event, for the host's own log or undo
  | { op: 'add'; kind: 'node'; label: string; container?: string }        // a new card; the host chooses its id
  | { op: 'add'; kind: 'edge'; from: string; to: string; label?: string }  // a new line between two cards
  | { op: 'rename'; target: Ref; label: string }                          // a card, line or container
  | { op: 'move'; target: NodeRef; to: string | null }                    // into a container (null: out of all)
  | { op: 'delete'; target: Ref }                                         // card, line, container, chip or badge
  | { op: 'reorder'; target: Ref; index: number }                          // a card among its column / container
);                                                                         // siblings, or a chip or badge in its list
type Hint = { col: number; row: number } & { x: number; y: number };     // grid slot and point, in the view
```

- `add` has no id: ids belong to the host. The new card appears when the host's `update` contains it.
- A `move` or `reorder` that also changes position carries a `hint`. A move with only a hint (a card dragged to an
  empty spot, same container, same order) emits a `move` whose `to` is its current container, plus the `hint`; a host
  that stores positions keeps the hint, and one that does not ignores the event.
- Deleting a card says only that; whether its lines go with it is the host's rule.

## Gestures

Chosen not to collide with what the map already does (double-click a card opens it, double-click empty space zooms,
Backspace goes up a level):

| Edit | Pointer | Keyboard |
|---|---|---|
| add a card | double-click empty space while holding Alt, or the **+** control | `N` |
| add a line | drag from the handle on a selected card's edge to another card | — |
| rename | `F2`, or double-click the label of a selected card | `F2`, Enter to commit, Esc to cancel |
| move to a container | drag a card into (or out of) a container box | — |
| delete | — | `Delete` (never Backspace) |
| reorder | drag a card up or down within its column | `Alt + ↑ / ↓`; chips and badges (a card's or a container's) `Alt + ← / →` after a click on one (or Enter on a focused tab) |

Rename edits in place: a text field over the label inside the shadow root. While dragging, a ghost card and the
target (container, slot) are highlighted; nothing else moves.

## After the host applies an edit

`update(model)` already redraws only changed views and keeps view, camera and selection. Two additions:

1. **Partial layouts.** Today a view's `layout` is all or nothing; a card missing from it lands in the wrong place.
   With editing, `layout` may list some cards: those sit where it says, the rest are placed around them.
2. **Stable positions in a session.** After an edit, the cards that were already there keep their slots (unless the
   model's `layout` says otherwise), and new or moved cards go to their hint or the nearest free slot, so one edit
   does not reshuffle the picture. This lives in the handle's memory only; it is never written to the model.

The selection follows a renamed or moved card; a new card is selected when it first appears if the last `add` asked
for it.

## Decisions to approve

1. **What the user sees between the drop and the host's `update`.**
   - (a) The card snaps back at once; the host's update moves it. Simplest, but a slow (network) host shows a jump.
   - (b) A faint ghost stays at the drop spot until the next `update`, or 3 s. Feels immediate, and still never
     claims the edit was accepted. **Recommended.**
2. **Stable positions across updates (above).** Without it, any edit can rearrange the whole view through the auto
   layout. Keeping it in the handle (never in the model) keeps the host's data clean. **Recommended: yes**, with
   `stableLayout: false` to opt out.
3. **Rename UI.** In place in the canvas (**recommended**: no host work), or a `rename` request event the host
   answers with its own dialog. With `editable: { rename: false }` the canvas offers no renaming; the host can still rename
   from its own panel by editing its data and calling `update`.
4. **Gesture set (table above).** In particular Alt + double-click to add, and Delete only (not Backspace).
5. **Standalone page.** It stays read-only. A small `examples/edit.html` shows the events (a log beside the map) and
   is what the browser tests drive.

## Tests

Headless Chrome (`tests/embed.py`), each gesture driven by synthetic pointer and key events: the exact `change`
payloads; that nothing redraws until `update`; partial layouts; stable positions across an `add` and a `move`;
`editable: false` emits nothing; a read-only embed has no handles or editor in its DOM. Node: partial layouts in
`layout()`.

## Not in step 5

Undo and redo (the host's, using the event ids; since built in the demo), multi-select (since built), editing containers' nesting, editing view structure
(creating views, drill-down targets), collaborative cursors.

## As built: notes

- **Pending hints.** Only the latest gesture's hint waits for the host, and only until the next `update`: an edit the
  host never answered leaves no trace in a later, unrelated update.
- **Where cards land after an update.** In order: the host's own `layout`; a reordered column group, exactly (the
  same slots, the card at its new place); every other card in the slot it had; then a moved or new card at its hint,
  or the nearest free slot below it, so it never pushes an existing card aside. Hub views (one card fanning out to
  lanes) keep, for each card that was there, its lane (by title), its column in the lane and its order; a new card
  takes the place the fresh plan gives it, after the cards already in that column. `stableLayout: false` lays them out
  afresh.
- **An identical model** passed to `update` redraws nothing, unless it accepts a pending move or reorder (a change
  that alters no data, only a position).
- **A drag is not a click**: the click a browser sends after a drag is dropped; the next press ends that, or 400 ms.
- **Demo and tests.** `examples/edit.html` imports the module over HTTP and plays the host (an "apply edits" box
  refuses every edit when unticked); `tests/embed.py` serves the repository locally, drives `tests/edit.html` with
  synthetic pointer and key events, and checks that the demo draws.
- **Several cards** (added after step 5): Shift, Cmd or Ctrl + click adds a card to the selection, or takes it out; a
  plain click goes back to one. `handle.selected` lists every selected thing, the latest last (`handle.selection` is
  the latest), and `select` events carry the same list as `targets`. Delete emits one `delete` per selected card, each
  with its own id, so a host applies, refuses or undoes them one by one. Dragging still moves one card.
- **Undo** belongs to the host; `history(model)` is a small helper for it: the host pushes each model it applies, and
  hands `undo()` / `redo()` results to `update()`. The canvas never sees it. `examples/edit.html` uses it for Cmd/Ctrl +
  Z (Shift for redo); the canvas leaves Cmd/Ctrl keys to the page.

## Commands for typed models (0.17.0)

Map views keep the `change` event above, and a host applies it by hand as before. For schema version 2
(`docs/diagrams/model.md`) the library also applies edits itself: `apply(model, commands)` returns the model after a
transaction of `set`, `add`, `move`, `hide`, `delete` and `reparent`, and `references(model, id)` says what names an element.
`docs/module-api.md` § 0.17.0 describes each command. Two kinds of removal, as a modelling tool has them:

| Command | Takes away | Keeps |
|---|---|---|
| `hide` (Delete, from 1.7) | all one view says of the element: its place, pin, `present`, box, tour, the view's lines to it, the story steps on that view | the element, and every other view of it |
| `delete` (Shift + Delete, from 1.7) | the element, its members, what it owns, the lines to them, and every place that names them | nothing of it; undo brings all of it back |

Undo is a snapshot of the model before (`history()`), so undo and redo give back byte-identical models. The canvas
emits these commands as an `edit` event from work package 1.7.

From 0.18.0 (the sequence spike's findings, `docs/diagrams/notes/spike-sequence.md` §3):

- `add { element, view, index, in: 'view' }` puts the element in the view itself: a line, or an item of the view's
  type (an interaction use), into `view.edges` at `index`; a node of the type's palette (or any node, for a type with
  none) into `view.nodes`, its id into `nodeIds` at `index`; anything else into `view.fragments` (a node not in the
  palette too: a comment added to a sequence view whose palette is lifelines goes there and is not drawn as a card).
  This is how a sequence view's inline messages are inserted at a time position. `in: 'model'`, the default, is `add`
  as before.
- `delete` re-homes what it held and that stays: a message, a fragment or an interaction use inside a deleted fragment
  or operand goes to the nearest owner that stays (unwrapping an `opt` leaves its messages in the operand around it),
  not to the top. What a diagram type declares its properties name goes too (a reply with its call) or leaves the
  list (a deleted lifeline leaves an interaction use's `covers`); `references()` lists those with kind `prop`.

## Typed views: the `edit` event (1.7)

With `editable`, a typed view of a version-2 model (its `diagram` set and not `'map'`) emits `edit` instead of `change`:

```ts
interface Events { edit: { view: string; commands: Command[] } }   // one transaction: apply(model, commands), then update()
```

As on a map, nothing is drawn until the host's `update()` (risks.md E12). One gesture is one transaction: one per
committed field, per drag, per multi-select delete (E2). New elements get ids the canvas picks, free in the model
(`class1`, `uses2`). A map view, and every view of a version-1 model, keeps `change` exactly as above.

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| rename a node or line | double-click a selected card's name | `F2`, Enter | `set label` |
| move a card | drag it to a slot | `Alt + arrows` | `set` of the view's `layout` pin, `['layout', id]` |
| remove from this view | Remove from view (properties) | `Delete` | `hide` (an element that lives in this view only: `delete`) |
| delete from the model | Delete from model (properties), ✕ (outline) | `Shift + Delete` | `delete` |
| add a line | drag a selected card's handle to a card, then pick its kind | `L`, then arrows or type a name, Enter; the picker by arrows and Enter | `add` of a line, shown in the view |
| add an element | a palette entry, then its name | `N` (the first entry), or Enter on an entry | `add` with `view` |
| a member row | edit its row; ↑ ↓; the new row | Enter; `Alt + ↑ / ↓` in a row; Enter in the new row | `set label`, `move`, `add` with `owner` |
| a property | edit the field | Enter (a text field), Space, arrows | `set` of `props.<key>` |
| show an element here | Show (outline) | Enter on it | `set` of the view's `nodeIds` (or `edges`) |

The panels sit over the map's left side, only on a typed view with `editable`:

- the palette: the type's `elements`;
- properties: the selected element's name, the type's `props` schema, its member rows, and the two removals;
- problems: what `validate()` finds about this view's elements; choosing one selects it;
- the outline (risks.md M5): the model's nodes (`nodes`) and lines (`edges`), then each view's own cards and lines
  (its `nodes`, and the objects in its `edges`), marked "only in" that view. Members are not listed: they show in their
  owner's properties. "In no diagram" leaves what no view shows.

The relationship picker offers the type's `lines`; an entry may carry `props`, which the new line takes (a reply is a
`uml.Message` with `sort: 'reply'`). A type may give its own commands for a new line (its `edits.connect`, provisional),
which the canvas emits in place of the `add`. A type this release does not draw offers one generic node and one
generic line, `core.Node` and `core.Line`. Every control is a button or a field with a name. Escape in a panel puts back
the field's value and goes back to the map. An empty name, of an element or a member, changes nothing, as on the map;
an empty property field removes the property.

The `editable` flags hold for the panels too: without `add` there is no palette, handle, Show or new-member row; without
`delete` no Remove, Delete or ✕; without `reorder` no ↑ ↓ on member rows; without `rename` the fields are shown
disabled, to read; `move` is the pin.

Not built yet: member rows drawn on the card itself (they come with the class type, 1.9, which draws them); offering
only the lines allowed between two ends (E6); selecting an element after the host adds it. The relationship picker
closes on any `update()` that draws the view again, even one unrelated to the line being added.

## The class diagram's gestures (0.18.0)

A `uml.class` view (`examples/class-editor.html` is a working host) takes every gesture above, with the type's own
palette, lines and fields. Each is one `edit` event; the host applies it with `apply()`.

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a classifier, a package or a comment | a palette entry (Class, Interface, Enumeration, Data type, Primitive type, Package, Comment), then its name | `N` adds a class; Enter on an entry | `add` with `view` |
| add a line | the handle to another element, then Association, Generalization, Realization, Dependency or Comment link | `L`, a name or arrows, Enter, then the picker | `add` of the line, shown in the view |
| edit a member | its row in the properties panel, as one line of UML text: `+ /total: Money [1] = 0`, `- {static} count: Integer`, `+ place(at: Date, in qty: Int): Order` | Enter commits; Escape puts the row back | `set label` and `set props`, one transaction; the props the text does not write (stereotypes, a host's own) are kept |
| add a member | the New member row | Enter | `add` with `owner`: an operation when it has brackets, else an attribute; on an enumeration, a bare name is a literal |
| reorder members | ↑ ↓ by a row | `Alt + ↑ / ↓` in a row | `move` |
| abstract, stereotypes | Abstract (a class), Stereotypes (`entity, root`: a list, written as text) | Space; Enter | `set` of `props.isAbstract`, `props.stereotypes` |
| an association's ends | From and To: role, multiplicity, aggregation (none, shared, composite), navigable | Enter, arrows, Space | `set` of `['props', 'ends', 'from' or 'to', key]` |

A member line the syntax does not read (`+ total Money`) is kept in its row as typed, marked invalid with the reason
in the hint line, and nothing is applied (risks.md E3); a good line, or Escape, clears the mark. A comment and a package
have no Members section. What breaks a rule of the class diagram (`validate()`, `docs/conformance/uml-class.md`) shows
in the problems list, by its rule and its elements, and choosing it selects them.

## Ownership, and the object and package diagrams' gestures (0.19.0)

From 0.19.0 a class, object or package view draws a shown package that owns something the view shows as a box holding
it (`docs/diagrams/notes/stage-2.md` §4). Ownership is `parent`, and it is edited two ways:

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| put an element in a package, or take it out | drop its card into a package's box, into another box, or outside every box (the box under the drag is highlighted) | the **Owner** field in the properties panel: "none" and every package by its qualified name (`payments::card`); the element's own owner is always listed | `reparent` to that package (outside every box: the view's `subject`, or none); a drop also sends a `set` that removes the card's pin when it had one, in the same transaction, while the Owner field sends the `reparent` alone, so a pin stays |
| select a package drawn as a box | a click on its border or its title | the outline of elements | a container selection: F2, Delete, Shift + Delete and the properties panel act on the package |
| rename it | F2 on the box | `F2`, Enter | `set label`: the package's own name, not the qualified one |
| hide it from the view | Remove from view (properties) | `Delete` | `hide`: what it held stays on the picture, its names qualified (`sales::Order`) |
| delete it from the model | Delete from model (properties) | `Shift + Delete` | `delete`: the package and everything it owns, at any depth; undo brings all of it back |

A drop in the box the card is already drawn in pins it, as before. After a re-own the view is laid out again, so each box
holds exactly its contents; the picture moves on that edit (`notes/stage-2.md` §3.2). A package is not offered as its own
owner or under itself. A new element is not created inside the selected package: add it, then set its Owner. Dragging a
box does nothing, and neither do `Alt + arrows` on it; its place comes from what it holds.

The **package diagram** (`uml.package`) has the class diagram's palette (Package, Class, Interface, Enumeration, Data
type, Primitive type, Comment; `N` adds a package) and four lines in the picker: Import, Merge, Dependency, Comment link.
An import's **Visibility** field is public («import») or private («access»): a `set` of `props.visibility`. A classifier
is drawn by its name here; its members are edited in a class view.

The **object diagram** (`uml.object`) has two elements, Instance and Comment (`N` adds an instance), and two lines,
Link and Comment link.

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| name an instance | double-click a selected instance's head | `F2`: the name alone, not `name : Classifier` | `set label` |
| its classifier, stereotypes | the Classifier and Stereotypes fields | Enter | `set` of `props.classifier`, `props.stereotypes` |
| a slot | its row in the properties panel, as `feature = value` (or `feature` with no value) | Enter commits; Escape puts the row back | `set label` and `set props`, one transaction |
| add a slot | the New member row | Enter | `add` with `owner` |
| reorder slots | ↑ ↓ by a row | `Alt + ↑ / ↓` in a row | `move` |
| a link's association and roles | Association, From role, To role | Enter | `set` of `props.association`, `['props', 'ends', 'from' or 'to', 'role']` |

A slot line with no feature name (`= 3`) is kept in its row as typed, marked invalid, and nothing is applied (risks.md
E3). `examples/order-objects.json` and `examples/bookshop-packages.json` are the examples; `tests/object.html` and
`tests/package.html` test each gesture by pointer and by key.
