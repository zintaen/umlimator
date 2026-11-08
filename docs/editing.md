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
| reorder | drag a card up or down within its column | `Alt + ↑ / ↓`; chips and badges (a card's or a container's) `Alt + ← / →` |

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
