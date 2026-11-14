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
| put an element in a package, or take it out | drop its card into a package's box, into another box, or outside every box (the box under the drag is highlighted) | the **Owner** field in the properties panel: "none" and every package by its qualified name (`payments::card`); the element's own owner is always listed | `reparent` to that package (outside every box: the view's `subject`, or none); either way, a `set` that removes the card's pin when it had one goes in the same transaction |
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

## The sequence and communication diagrams' gestures (0.20.0)

A type may take a gesture over through its `edits` hooks (`connect`, `moveTo`, `wrap`, `add`, `remove`;
`docs/diagrams/notes/stage-3.md` §5.1). Each hook gives one transaction, emitted as one `edit` event, or `null` to leave
the gesture as it was, or `{ error }`, which the hint line says and which emits nothing: a hook never emits an edit that
breaks one of its type's rules, and the host may still refuse one. On a typed view a line may run from an element to
itself (a self-message, a reflexive association); lines have key rings, read in the type's `geo.order`; Shift + click and
Shift + Enter add a line to the selection; `L` starts from a selected line too.

The **sequence diagram** (`uml.sequence`, `examples/checkout-sequence.json`) is laid out on a time axis and has no pins:

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a lifeline | the palette (Lifeline) | `N`, after the selected lifeline | `add` of a model node into `nodeIds`; a use that covers both its neighbours covers it too |
| reorder lifelines | drag a head sideways | `Alt + ← / →` | `move` on `nodeIds`; refused when it splits a use's `covers` |
| insert a message | drag from a stem, between two messages, to another stem (to its own: a self-message), then Call, Async, Reply, Create or Delete | select a message, `L`, the other end, Enter: it goes right after, sent from that message's receiver; from a lifeline, at the end | `add` with `view` and `index`, in the slot's operand; a reply also gets `replyTo`, the latest unanswered call back along it |
| move a message or a use in time, into or out of an operand | drag it up or down | `Alt + ↑ / ↓`: one slot | `move` on the view's `edges`, then `reparent` |
| move a fragment | drag its frame | `Alt + ↑ / ↓` | one `move` per occurrence it holds, then a `reparent`; into itself is refused |
| wrap in a fragment | select a run (Shift + click), `W`, pick alt, opt, loop, par or break | Shift + Enter on key rings, `W` | `add` of the fragment, with one operand (an `alt` gets two, the second "else"), then a `reparent` of each; a run that is not one piece, or has two parents, is refused |
| add, rename, reorder operands | the frame's member list in the properties panel | F2, Enter; `Alt + ↑ / ↓` in a row | `add` with `owner`, `set label`; a reorder also moves the operand's occurrences, so they stay one run |
| add an interaction use | the palette (Interaction use) | its palette button | `add` at the slot; `covers` is the selected lifeline, or every lifeline |
| rename a lifeline, a message or a guard | double-click it once selected | `F2` | `set label` |
| sort, replyTo, operator, covers, refersTo, represents | the properties panel | Enter | `set` |
| unwrap a fragment | Delete on its frame | `Delete`, `Shift + Delete` | `delete`: what it held goes to the operand around it |
| delete one operand | its member row's ✕ | | its occurrences move to just after the fragment, then `delete`; the last operand deletes the fragment |
| delete a message or a use | | `Delete` or `Shift + Delete` (it lives in the view) | `delete`; a call's replies go with it |
| remove a lifeline from the view | Remove from view | `Delete` | `hide`, which takes the messages to and from it, and a `set` of each `covers` without it; the hint says how many messages go |
| delete a lifeline | Delete from model | `Shift + Delete` | `delete`: its messages go, and `covers` drop it |

A message cannot be hidden from its own view; the gesture is to delete it. `Alt + ↑ / ↓` skips a fragment that would
hold only the moving run (it has no place in time); a drag to its slot still puts a message there.

The **communication diagram** (`uml.communication`, `examples/checkout-communication.json`) is laid out by the layered
layout, as a class diagram:

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a lifeline | the palette | `N` | `add` with `view` |
| add a connector or a message | the handle or a drag to another lifeline (or its own), then Connector, Call, Async, Reply, Create or Delete | `L`, the other end, Enter | `add`; a new message goes after the selected one, or last, and a connector is added in the same transaction when none joins its two lifelines |
| move a message in time | drag its row onto another row: it takes that row's place | `Alt + ↑ / ↓` on a row: one place | `move` on the view's `edges` |
| move a lifeline | drag it | `Alt + arrows` | a pin, as on a class view |
| hide or delete a message or a connector | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, with a hidden call's replies and a hidden connector's messages; or `delete`, which takes a connector's messages in every communication view where no other connector joins their lifelines |

Numbers are derived, so a move renumbers. `tests/sequence.html` and `tests/communication.html` test each gesture by
pointer and by key; the conformance notes (`docs/conformance/uml-sequence.md`, `uml-communication.md`) list what is left
out.

## The use case, activity, state machine and interaction overview diagrams' gestures (0.21.0)

Stage 4 (`docs/diagrams/notes/stage-4.md` §12) adds one hook, `edits.rename(model, view, id, text)`, which F2 (or a
double-click on a selected element) calls: a type reads the text into its parts and emits a `set` per part that changed,
or returns `{ error }`, said on the hint line, with the text kept in the field. A hook may also return
`{ pick: [labels], then }`: a picker opens under the element and the choice is handed back. A palette entry with
`name: false` (a control node, a pseudostate, a region) is added with no name prompt. `V` on a selected call behaviour
action, interaction use or inline interaction opens a picker of the model's views of the kind it opens, then emits
`set opensView`; Enter, or a double-click, on one opens that view.

The **use case diagram** (`uml.use-case`, `examples/shopping-use-cases.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add an actor, a use case, a subject, a comment | the palette | `N` (an actor) | `add` with `view` |
| add an association, include, extend, generalization, comment link | the handle or a drag, then the line's kind | `L`, the other end, Enter, the kind | `add`; an association drawn from a use case to an actor is added from the actor |
| an extend's condition and extension points | the properties panel | Enter | `set props.condition`, `set props.extensionPoints` (ids) |
| add, rename, reorder an extension point | the use case's member rows | F2, Enter; `Alt + ↑ / ↓` in a row | the member hook; deleting one drops it from every extend that names it |
| put a use case in a subject | drop it into the subject's box | the Owner field | `reparent` |
| rename | double-click once selected | `F2` | `set label` |
| hide, delete | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete` |

The **activity diagram** (`uml.activity`, `examples/fulfil-activity.json`), laid out in lanes:

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a node | the palette (every node of the subset, Partition, Comment); a node goes into the selected partition, or the selected node's lane | `N` | `add`, then `reparent` to the lane; a call behaviour action asks for the activity view it calls (a picker) |
| add a flow | the handle or a drag, then Control flow or Object flow | `L`, the other end, Enter | `add`; the second unguarded exit of a decision gets the guard `else`; a flow into an initial node, out of a final node or onto a partition is refused |
| a flow's name and guard | double-click once selected | `F2`: `name [guard]`; an effect or a `/` outside brackets is refused | `set label`, `set props.guard` |
| change a node's lane | drag it into another band (outside every band: no lane) | the Owner field | `reparent`, and its pin removed, in one transaction |
| move a node within its lane | drag | `Alt + arrows` | a pin (its row is an order inside the lane) |
| nest a partition | | the Owner field | `reparent` |
| move a lane | not by hand: a drag on a partition's header changes nothing | | (the lane's order is the view's `nodeIds` order) |
| delete a partition | | `Shift + Delete` | a `reparent` of what it held to its own parent, then `delete` |
| hide, delete anything else | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete` |

The **state machine diagram** (`uml.state-machine`, `examples/order-states.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a state, a pseudostate, a final state, a comment | the palette (State, Initial, Final state, Choice, Junction, Fork, Join, Shallow history, Deep history, Terminate, Comment) | `N` | `add`; a pseudostate's `props.kind` comes from its entry |
| add a region | the palette's Region with a state selected | | `add` of a `uml.Region` member; with no state selected the hint line says so |
| add a transition | the handle or a drag (to its own state: a self-transition) | `L`, the other end (or the state's own name), Enter | `add` |
| a transition's text | double-click once selected | `F2`: `trigger [guard] / effect` | one `set` per part that changed (`undefined` clears one); a text the parser refuses is kept, with why |
| an activity, an internal transition | the state's member rows: a row `entry / …`, `do / …` or `exit / …` sets that activity | F2, Enter | `set props.entry` …, or the member hook |
| a pseudostate's kind | the properties panel | Enter | `set props.kind`: its shape is drawn again |
| nest a state | drop it into an open state's box or a region's (a one-region state's drop goes to its region) | the Owner field: states and regions by their path, " / " between | `reparent` |
| reorder regions | the state's member rows | `Alt + ↑ / ↓` | the member order: the panel, the PDF and the reading order, not the picture |
| delete a region | its member row's ✕, or `Shift + Delete` on its box | | `delete`, with what it holds; the hint line says how many |
| hide a compartment | `present.collapsed: ['activities']`, `present.rows` | | (in the view) |
| hide, delete | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete`; a state takes its regions and substates with it |

The **interaction overview diagram** (`uml.interaction-overview`, `examples/buy-book-overview.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a control node, an interaction use, an inline interaction, a comment | the palette | `N` | `add`; a use or an inline interaction asks for its sequence view (a picker), and with no name takes the view's title |
| change the view it opens | | `V`, then the picker | `set opensView` |
| open its view | double-click it once selected | `Enter` | (the canvas opens the view) |
| add a flow | the handle or a drag | `L`, the other end, Enter | `add` |
| a flow's name and guard | double-click once selected | `F2`: `name [guard]` | `set label`, `set props.guard` |
| hide, delete | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete` |

An inline interaction is drawn read only: its lifelines and messages are edited in its own sequence view.

## The component, deployment and composite structure diagrams' gestures (0.22.0)

Stage 5 (`docs/diagrams/notes/stage-5.md` §12) adds two hooks, both in `lib/umlimator-all.js` and provisional:

- `edits.member(model, view, owner, id, text)`, asked on Enter or a change in a member row of the properties panel (the
  New member field has `id` null) before the panel's own `member.add` or `member.edit`. It hears the row's text trimmed
  (an empty row is never asked) and returns commands, `{ error }` (the row is marked invalid), `{ pick, then }` (the row
  is settled after the choice; a cancelled pick keeps the text as typed) or null (the panel's own reading, as before).
  The state machine's `entry / …`, `do / …` and `exit / …` rows now go through it; nothing changes for a reader. The
  state type's `member` is a non-enumerable property: a host that copies a type's `edits` copies `member` by name.
- `edits.key(model, view, ids, key)`, asked for a key with no Alt, Ctrl or Meta on a selection, before the canvas's own
  keys, when the host offers rename. It hears `e.key` only and returns null for a key it does not own.

A member drawn as a node (a port, a part, a role) is drawn because its owner is, so it cannot be hidden: Delete on one
deletes it from the model, as Shift + Delete does, and the hint line says so before it goes (stage 3's precedent for
messages). A port on a part is drawn under the geometry id `<part>-><port>`; the hooks map it back.

The **component diagram** (`uml.component`, `examples/bookshop-components.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a component, an interface, an artifact, a package, a comment | the palette (Interface asks ball or rectangle, a picker) | `N` (a component) | `add` with `view`; a ball also `set` of `present.<id>.as` |
| add a port | the palette's Port with a component or class selected (or a port, for its owner) | | `add` with `owner`; with nothing to hold it, refused and said |
| add or edit a port as a row | the component's member rows: `name` or `name : Type` | Enter | the member hook: `add` with `owner`, or `set label` and `set props.valueType` |
| add a line | the handle or a drag, then its kind (Realization, Component realization, Usage, Assembly, Delegation, Dependency, Manifestation, Comment link) | `L`, the other end, Enter, the kind | `add`; a connector's kind is set by nesting (a box's port to what it holds: a delegation, else an assembly); a line to an interface is the picker's Realization or Usage; a connector from an element to itself or its own port, or a delegation whose box end is not a port, is refused and said |
| an interface as a ball or a rectangle | | `B` on a selected interface | `set` of `present.<id>.as` to `ball`, or removed |
| a port's side | drag it to another side of its owner | `Alt + arrows` across its side | `set` of `present.<port>.side`; `Alt + arrows` along its side does nothing and the hint line says why (its order follows its lines) |
| a connector's kind, a port's type, stereotypes | the properties panel | Enter | `set props.kind`, `set props.valueType`, `set props.stereotypes` |
| nest a component | drop it into a component's or package's box | the Owner field (the element and what it holds are left out) | `reparent` |
| rename | double-click once selected | `F2` | `set label` |
| hide, delete | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete`; Delete on a port deletes it, with its lines, as said; in a mixed selection the rest is hidden |

The **deployment diagram** (`uml.deployment`, `examples/bookshop-deployment.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a node, a device, an execution environment, an artifact, a deployment specification, a component, a comment | the palette | `N` (a node) | `add` with `view` |
| deploy an artifact by nesting | drop it into a target's box | the Owner field (every target) | `reparent` |
| add a line | the handle or a drag, then Deployment, Manifestation, Communication path, Dependency or Comment link | `L`, the other end, Enter, the kind | `add`; a deployment drawn from a target to an artifact, or a manifestation from a component to an artifact, is added the other way round; a deployment or a path between ends that cannot hold one, and any line between a box and what it holds, at any depth, is refused and said |
| nest a target | drop it into another target's box | the Owner field | `reparent`; an unusual pair (a node in an execution environment) is warned (`nest-kinds`) |
| a path's label | double-click once selected | `F2` | `set label` |
| rename | double-click once selected | `F2` | `set label` |
| hide, delete | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete`; Shift + Delete on a target says how many elements it takes with it |

The **composite structure diagram** (`uml.composite-structure`, `examples/order-service-structure.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a part, a port, a role, a collaboration use, a collaboration, a comment | the palette: a part goes into the subject; a port into the selected subject or class (a part's goes to its type, said); a role into the selected collaboration | `N` | `add` with `owner` or `view` |
| add a part or a port as a row | the subject's member rows: `name : Type [multiplicity]` is a part, `port name` or `port name : Type` a port; a collaboration's rows are roles | Enter | the member hook: `add` with `owner`, or a `set` per part that changed |
| a part's text | double-click once selected | `F2`: `name : Type [multiplicity]` | `set label`, `set props.valueType`, `set props.multiplicity` |
| rename a port on a part | double-click once selected | `F2` | `set label` on its class's port: every part of that type shows it, as the hint line says |
| add a connector | the handle or a drag from a port, a part or a port on a part | `L`, the other end, Enter | `add`; an end through a part keeps `props.ends.<end>.part` |
| add a role binding | the handle or a drag from a part to a collaboration use | `L`, the other end, Enter, then the role (a picker of the collaboration's roles) | `add`, its `label` the role |
| a port's side | drag it to another side | `Alt + arrows` | `set` of `present.<port>.side`; on a part, `present.<part>.ports.<port>.side` |
| a part's aggregation, a collaboration use's collaboration, stereotypes | the properties panel | Enter | `set props.aggregation`, `set props.collaboration`, `set props.stereotypes` |
| delete a part | | `Delete` (said first), `Shift + Delete` | `delete`: its connectors go with it (the type's `refs` cascade), its role bindings by `delete`'s rule |
| delete a port on a part | | `Delete` | the connectors through that part to that port; `Shift + Delete` deletes the class's port |
| hide, delete anything else | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete`; where the view lists its lines, a line is hidden, else left and said |

`L` then a name cannot reach a part or a port (the canvas names a member by its owner's label): `L` then an arrow, or the
pointer, reaches them. A port selected on a part shows no properties: they are its class's, edited where the class's own
port is drawn.

## The profile and timing diagrams' gestures, and tags on every view (0.23.0)

Stage 6 (`docs/diagrams/notes/stage-6.md` §4.3, §5.7, §8) adds one slot to the properties panel, in
`lib/umlimator-all.js` and provisional: after a type's own fields, the panel lists `TYPED.fields(model, element)`'s, one
field per tag of each stereotype the element has (its own, a general's, and a required one the tool supplies), on every
typed view. A field's key is `p:<stereotype>:<tag>` and its `path` is `['tags', stereotype, tag]`, so a field commits
`set` of `props.tags.<stereotype>.<tag>` (the missing objects made on the way); an empty value removes the tag. A Boolean
or an enumeration tag is a choice, any other a text field. A tag stored under no stereotype the element has stays in the
model, is warned (`tag-defined`) and is not a field. With no field list for its type, the panel still lists every prop to
read, `tags` among them.

The **profile diagram** (`uml.profile`, `examples/bookshop-profile.json`):

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a profile, a stereotype, a metaclass, an enumeration, a package, a comment | the palette; a stereotype, metaclass or enumeration goes into the profile selected, else the profile holding what is selected, else the view's first; with none, refused ("add a profile first") | `N` (a profile, the palette's first) | `add` with `view` (and `parent`); a metaclass name not in UML's table opens a picker of the nearest names, then adds what was picked; a metaclass with no name is added unnamed and warned (`metaclass-known`) |
| add a line | the handle or a drag, then Extension, Generalization, Profile application or Comment link | `L`, the other end, Enter, the kind | `add`; an extension from a stereotype to a metaclass, an application from a package to a profile (not a profile to itself), a generalization between two stereotypes; anything else is refused and said with the rule's words |
| a stereotype's tag definitions | the stereotype's member rows, the class type's text (`name : Type [mult] = default`) | Enter | the class type's member hook |
| required, abstract | the properties panel: Required on an extension, Abstract on a stereotype (checkboxes) | | `set props.isRequired`, `set props.isAbstract` |
| show an element of the model here, to apply a stereotype | Show (the outline), Enter on it | | `set` of the view's `nodeIds` |
| apply a stereotype, set a tag | the Stereotypes list and the tag fields, on this view or any other | Enter | `set props.stereotypes`, `set props.tags.<stereotype>.<tag>` |
| rename | double-click once selected | `F2` | `set label`; a renamed or deleted stereotype does not rewrite the elements that name it: they are warned (`stereotype-unknown`) |
| hide, delete | Remove from view, Delete from model | `Delete`, `Shift + Delete` | `hide`, `delete`; a stereotype's compartment or a tag row is not hidden on its own: the element's whole node is |

The **timing diagram** (`uml.timing`, `examples/bookshop-timing.json`). Times snap to a minor tick (a fifth of the
ruler's step) by pointer and Alt + arrows; F2's `@` sets them exactly. A change, a message and a constraint cannot be
hidden: Delete deletes it, and the hint line says so first.

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| add a lifeline | the palette's Lifeline | `N`, then `name` or `name : Type` | `add` into `nodeIds` at the end |
| add a change | the palette's Change, on the slot of a lane at a time | the selected change's lane a minor tick after it; on a selected lifeline, its first free minor tick from the ruler's start | `set` of the view's `timeline.changes` (a state the lifeline does not list is added to `states` in the same transaction, said); never on another change's instant |
| add a time constraint | the palette's Time constraint, with a change selected | | `set` of `timeline.constraints`; with no change selected, refused and said |
| add a message | the handle from a lifeline or a change to another (or the same), then Call, Async or Reply | `L`, the other end, Enter, the sort | `add` inline in the view's `edges`, sent and received at the release slot's time, or at the two changes' times |
| add a duration constraint | the handle from a change to another change, then Duration constraint | `L`, the other change, Enter | `set` of `timeline.constraints`, in time order |
| move a change in time | drag it along its lane | `Alt + ←/→`: one minor tick | `set` of its `at`; refused onto another change's instant (`change-instant`) |
| a change's state | | `Alt + ↑/↓` on a states-form change: the state above or below (from the extra row of an unlisted state, ↑ goes to the last listed one) | `set` of its `state` |
| move a message in time | drag it | `Alt + ←/→`: both times by one minor tick | `set` of `sentAt` and `receivedAt`; Alt + ↑/↓ on a message does nothing |
| reorder lifelines | | `Alt + ↑/↓` on a lifeline | `set` of `nodeIds` |
| a value lifeline | | `S` on a lifeline | `set` of `present.<id>.as` to `values`, or removed |
| rename | double-click once selected | `F2`: a change `state` or `state @ t`; a message `label`, `label @ t` or `label @ t1 → t2` (`->` too); a constraint its label; a lifeline `name` or `name : Type`; a state's row its name (rewriting `states` and every change of that lifeline in it); the ruler the view's unit (empty removes it) | `set`; a text whose part after its last `@` is not one or two decimal numbers is all text; a message's ends and a constraint's are not re-attached (delete and connect again, as the hint line says) |
| hide a lifeline | Remove from view | `Delete` | `hide`: its changes and constraints stay in the timeline, not drawn; its messages go with it (the view's own lines), counted on the hint line first |
| delete | Delete from model | `Delete` on a change, a message or a constraint; `Shift + Delete` on a lifeline | `delete`: a lifeline takes its changes, their constraints and its messages, from every view (the core's cascade); the hint line counts them ("Deleted worker, 4 changes, 2 messages and 2 constraints") |

`L` then typing reaches a change by its id (`w-waiting`), not its state: the canvas names a node no view lists by its id
(decision 25). A state's row (`<lifeline>-><state>`) and the ruler (`->ruler`) are drawn under geometry ids; Delete on
either is refused, said.

## Milestone 2's gestures: ER, flowchart, data flow, information flow and C4 (0.24.0)

Milestone 2 (`docs/diagrams/notes/milestone-2.md` §6, §7) adds one command and one key, both through `apply()`. The
command is `addView { view, index? }`: a view added to `views`, refused when its id is taken; no command deletes a view.
The key is `D`, on a selected element that opens no view: it makes that element's level, a new view holding its context,
and sets the element's `opensView`, in one transaction (`addView`, `add`s and a `set`); Enter then opens it. On an
element that opens a view already, `D` says so on the hint line and emits nothing. The rest is the typed canvas's
gestures (1.7), with each type's hooks:

| Type | Edit | Pointer | Keyboard | Commands |
|---|---|---|---|---|
| ER (`er`) | a column, its type and flags | the panel's Members, one row per column | Enter; the row's text `name type [PK] [FK table.column] [UK] [NULL]` | the type's member hook: `add` or `set` of the column's label and props; `FK` names the referenced column by its table's and its own labels (or its id) and resolves it to `references` |
| | a relationship | the handle or a drag between two tables | `L`, the other table, Enter | `add` of an `er.Relationship`, `1` to `0..*`, non-identifying; one from or to anything but a table is refused |
| | a relationship's ends and identifying | the properties panel | | `set props.identifying`, `set props.ends.<from\|to>.multiplicity` |
| | a column deleted, the notation switched | | | for a host: `delete` of the column's id; `set { view, path: 'notation', value: 'idef1x' }` (a repaint) |
| Flowchart (`flowchart`) | a node of each of the ten symbols | the palette | `N` | `add` with `view` |
| | a flow | the handle or a drag | `L` | `add`; a decision's second exit is labelled to answer its first (`no` after `yes`); an end that is no flowchart node is refused |
| | move a node | drag it | `Alt + arrows` | `set` of its place (the canvas's); a flow is not dragged: "A flow follows its nodes: move a node instead" |
| Data flow (`dfd`) | a process, a store, an entity | the palette | `N` | `add`; a process or store is numbered (the next free under the view's parent process; a store `D<n>`) |
| | a level | | `D` on a process | `addView` of `<id>-level`, the child process `<n>.1`, each flow copied to it, `set` of the process's `opensView`: balanced from the start |
| | a number | the properties panel | | `set props.number`, checked by `dfd-numbers` |
| Information flow (`uml.information-flow`) | a flow | the handle or a drag between two classifiers or actors | `L`, the other end, Enter | a picker of what to convey (the model's items and classifiers), then `add` with `props.conveyed` |
| | what a flow conveys, its name | double-click once selected | `F2`: `[name:] Order, Card details` («flow» typed or not) | `set props.conveyed` and `set label`, each only when it changed; a name no element has is refused on the hint line |
| | delete an element | Delete from model | `Shift + Delete` | `delete`: dropped from every `conveyed`; a flow left conveying nothing is deleted with it, said |
| C4 (six views) | an element at the view's level | the palette | `N` | `add`; a container on a container view (or a dynamic view of a system) has the subject as `parent`, a component likewise |
| | a level | | `D` on a software system or a container | `addView` of its container or component view, `set` of its `opensView` |
| | an element's type, an instance's container | | `T`: a picker | `set type` (`c4-owner` and `c4-level` say what no longer fits); `set props.container` |
| | description, technology, external, shape | the properties panel | | `set props.<field>` |
| | a relationship | the handle or a drag | `L` | `add`; on a dynamic view between two elements a relationship already joins, that relationship becomes the last step (`set` of the view's `edges`) |
| | a step's place | | `Alt + ↑/↓` on a step | `move { id, view, index }` among the steps drawn |
| | an implied line | select it to read what it stands for | | none: F2, Delete, Shift + Delete and L emit nothing |

## Milestone 3's gestures: SysML's requirement, block definition, internal block and parametric diagrams (0.25.0)

Milestone 3 (`docs/diagrams/notes/milestone-3.md` §6.4, §7.4, §8.5, §9, §11) adds no command and binds no key: each type's
hooks on the typed canvas's gestures (1.7). A drop on a frame that is no element (a requirement or block definition view
with no subject) reparents the card to the view's subject, or to none; Delete on that frame emits nothing.

| Type | Edit | Pointer | Keyboard | Commands |
|---|---|---|---|---|
| Requirement (`sysml.requirement`) | a requirement, test case, block, package, comment | the palette | `N` | `add`; a requirement into the selected requirement or package (its `parent`), else the frame's subject |
| | containment | the palette's Containment line, or a drag | `L`, the owner, Enter | `reparent` of the first to the second |
| | derive, satisfy, verify, refine, trace, copy | the handle or a drag | `L`, a picker | `add`, checked against the rules' errors (`{ error }` with the rule's words); a copy also sets the client's `text` to the supplier's, in one transaction |
| | a name and id | double-click once selected | `F2`: `EB-1.2 Range` sets `reqId` and the name together | `set label`, `set props.reqId` |
| | id, text, risk, verify method | the properties panel | | `set props.<field>` |
| | a containment line deleted | | for a host: the type's `remove` hook on the line's id | the child re-homed to its owner's owner; Delete on the line from the canvas emits nothing (it is derived, no element) |
| | a requirement deleted | | `Shift + Delete` | what it contains re-homed to its owner, then `delete`, one transaction |
| Block definition (`sysml.block-definition`) | a block, interface block, constraint block, value type, package, comment | the palette | `N` | `add` |
| | a member | the panel's Members, one row each | Enter; `part`, `ref`, `value`, `constraint`, `port` (`proxy port`, `full port`), `in`, `out`, `inout`, `param` before `name : Type [mult]` | `add` or `set` of the member; with no keyword, a block's name makes a part, a constraint block's a constraint property, anything else a value |
| | a part association | the palette's Association (part) | `L` | `add` with `ends.from.aggregation: composite`, and the part property it draws, one transaction; to a constraint block a constraint property; to anything else refused |
| | an expression, unit, quantity kind, kind, direction | the properties panel | | `set props.<field>` |
| Internal block (`sysml.internal-block`) | a part, reference, value, port | the palette (a port goes to the selected part's type) | `N` | `add` into the subject or the part's type |
| | a connector | the handle or a drag from a port on a part | `L`, the other port, Enter | `add` of a `sysml.Connector` with `ends.<end>.part`, no label |
| | a port's side | | `Alt + arrows` on a port | `set { view, path: ['present', id, 'side'] }` |
| | a port's kind and `~` | | `F2`: `«proxy» charge : ~ChargeInterface` | `set props.kind`, `set props.valueType` |
| | an item flow | the properties panel | | `set props.itemFlow.item`, `set props.itemFlow.direction` |
| | a part deleted | | `Shift + Delete` | `delete`, its connectors with it (the type's `refs`) |
| Parametric (`sysml.parametric`) | a constraint or value property | the palette | `N` | `add`; a member row `name : Type` (a constraint or value property) or `param name : Type` (a parameter, on a constraint block only) |
| | a binding | a drag from a value to a parameter's square | `L`, the parameter, Enter | `add` of a `sysml.BindingConnector` with `ends.to.part`; one drawn from a parameter runs from the value; one to a constraint property's box is refused |
| | a constraint property's type | the properties panel | | `set props.valueType` |

## Milestone 4a's gestures: the mindmap, Google Cloud and Azure (0.26.0)

Milestone 4a (`docs/diagrams/notes/milestone-4a.md` §5.6, §7.3) adds no command and no canvas key: each gesture is the
typed canvas's (1.7) with the type's hooks, and every one goes through `apply()`.

| Type | Edit | Pointer | Keyboard | Commands |
|---|---|---|---|---|
| Mindmap (`mindmap`) | a topic | the palette's Topic | `N` | `add` of a child of the topic selected (the root when none), placed in `nodeIds` after its parent's last shown descendant; its id from its words |
| | its text | double-click once selected | `F2` | `set label`; an empty text is refused |
| | its place among its siblings | a drop between two siblings | `Alt + ↑/↓` | `move { id, view, index }` in `nodeIds`, reparenting when it came from elsewhere |
| | its parent | a drop on a topic (under it, last) | `Alt +` the arrow towards the root (promote: after its old parent), away from it (demote: into the sibling before it) | `reparent`; a topic is never put under itself |
| | a first-level topic's half | a drop on the root's other half | `Alt +` the arrow across the root | `set` of the view's `present.<id>.side`; each other first-level topic with no side given keeps the half it is drawn on, in the same transaction |
| | hide a branch | Delete | `Delete` | `hide` of the topic and its shown descendants, one transaction, counted on the hint line |
| | delete a branch | Delete from model | `Shift + Delete` | `delete` of the topic, which takes its descendants (`apply()`), counted on the hint line first |
| | show a hidden branch | Show (outline) | Enter on it | the topic and what was hidden with it, after its nearest shown ancestor's last shown descendant |
| | a line | | `L` | none: "A mindmap has no lines; drop a topic on another to move it" |
| Google Cloud (`gcp`), Azure (`azure`) | a group of each kind, a product or service (Google Cloud's user) | the palette | `N` | `add`, into the group selected, else at the top; a group's kind in `props.zoneType` (Google Cloud) or `props.groupType` (Azure) |
| | a line | the handle or a drag between two cards | `L` | `add` of a `gcp.Path` or `azure.Connector`; one between a group and what it holds is refused ("A line cannot join the VPC and what it holds"). A line from or to a group is written in the model or by a host: the canvas's handle and `L` end on cards |
| | the label, a line's label | double-click once selected | `F2` | `set label` |
| | move into a group | a drop on the group | `Alt + arrows`: a pin | `reparent` (stage 2's), or the canvas's pin |
| | the group's kind, the icon | the properties panel | | `set props.zoneType`, `props.groupType`, `props.icon` (the pack's own id: `umlimator.py check` names the nearest ids of one the pack lacks) |
| | hide a group | Delete | `Delete` | `hide`: what it holds is drawn in the next shown group |
| | delete a group | Delete from model | `Shift + Delete` | `delete`: it and what it holds (`apply()`'s cascade), counted on the hint line |

The icons a cloud view draws come from the host's `icons` table (`<pack>/<id>`), never from the module: the CLI builds it
from a pack the user fetched after reading the vendor's terms (`python3 umlimator.py pack fetch gcp`, `pack fetch azure`,
`pack list`; README's Icons section). Without it a card draws a glyph with the service's full name.

## BPMN's gestures (0.27.0)

The BPMN diagram (`docs/diagrams/notes/milestone-4b.md` §11, as built §8.3) adds no command and two keys, `A` and `X`,
both through the type's `key` hook and `apply()`; `E` stays the canvas's unfold (#71) on every node. The rest is the
typed canvas's gestures (1.7), with the type's hooks:

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| a pool, a lane, a task, an event, a gateway, data, an annotation, a group | the palette (22 entries) | `N` | `add`: into the lane, pool or expanded sub-process selected; a lane into the pool or lane selected (a member); data into the pool, never a lane; events and gateways with no name field |
| a boundary event | the palette's Boundary with an activity selected | `N` | `add` with `props.attachedTo`; refused with no activity selected |
| a flow | the handle or a drag between two elements | `L`, the other end, Enter | `add` of the one kind the ends allow (no picker): a sequence flow in one pool and one level, a message flow between pools, a data association with data at one end, an association with an annotation at one end; anything else refused with the rule's words ("A sequence flow cannot leave its pool: …") |
| a name, a flow's name, an annotation's text | double-click once selected | `F2` | `set label` |
| task type, event definition, interrupting, called element, data store, direction, documentation | the properties panel | | `set props.<field>` |
| move a flow node to another lane | drag it into the lane's band | | `reparent` to the lane, its pin removed; its boundary events with it; into another pool refused while it has sequence flows ("Move its sequence flows first"); a drop on a pool's header strip refused |
| move a boundary event | drag it onto another activity's border | `Alt + arrows` (its side) | `set props.attachedTo` (and `reparent` to that activity's owner); `set present.<id>.side` |
| attach a boundary event | | `A`: a picker of the activities it can move to without a new problem | `set props.attachedTo` |
| expand or collapse a sub-process in the view | | `X` | one `set` of the view's `nodeIds`: what it holds added or removed |
| hide | | `Delete` | `hide`; on a lane (a member, never hidden) the lane is deleted and what it held moves to its parent, said on the hint line first |
| delete | | `Shift + Delete` | `delete`; an activity takes its boundary events, a pool what it owns (counted on the hint line); a deleted group leaves the `categoryValueRef` entries that named it |

A message flow between two pools, a flow from a boundary event back to its own activity and an annotation joined to a
pool, a lane, a group or itself are refused, since the diagram does not draw them. The Owner field offers a flow node's
pools, lanes and sub-processes, and no owner for a lane.
