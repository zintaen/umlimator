# Editing

Editing is opt-in, and it follows one principle: **the canvas proposes, the host decides**. An edit gesture never
changes what is drawn. It emits an event describing what the user meant; the host validates it, applies it to its own
data (and persists, undoes, syncs, as it likes), and passes the result back with `update()`. The library keeps no copy
of the host's data beyond the model it was last given, and stores nothing.

The design note with every decision and each diagram type's gestures is [`docs/editing.md`](../editing.md).

## Turning it on

```js
render(el, model, { editable: true });                       // every operation
render(el, model, { editable: { add: true, rename: true } }); // only these
```

Off by default, so read-only embeds and the standalone page are unchanged.

## Maps: the `change` event

On a map view, each gesture emits a `change`:

```ts
type Change = { id: string; view: string; hint?: Hint } & (   // id: unique per event, for the host's own log or undo
  | { op: 'add'; kind: 'node'; label: string; container?: string }        // a new card; the host chooses its id
  | { op: 'add'; kind: 'edge'; from: string; to: string; label?: string }  // a new line between two cards
  | { op: 'rename'; target: Ref; label: string }                          // a card, line or container
  | { op: 'move'; target: NodeRef; to: string | null }                    // into a container (null: out of all)
  | { op: 'delete'; target: Ref }                                         // card, line, container, chip or badge
  | { op: 'reorder'; target: Ref; index: number }                          // a card among its column / container
);                                                                         // siblings, or a chip or badge in its list
```

Positions are not meaning: every event carries the meaning (which card, which container, which order) and, apart from
it, an optional `hint` saying where the user dropped it. A host may keep hints as a view's `layout`, or ignore them.

| Edit | Pointer | Keyboard |
|---|---|---|
| add a card | double-click empty space while holding Alt, or the **+** control | `N` |
| add a line | drag from the handle on a selected card's edge to another card | — |
| rename | `F2`, or double-click the label of a selected card | `F2`, Enter to commit, Esc to cancel |
| move to a container | drag a card into (or out of) a container box | — |
| delete | — | `Delete` (never Backspace) |
| reorder | drag a card up or down within its column | `Alt + ↑ / ↓`; chips and badges `Alt + ← / →` after a click on one |

Shift, Cmd or Ctrl + click adds a card to the selection; Delete then emits one `delete` per selected card, so a host
applies, refuses or undoes them one by one. After the host's `update()`, cards that were already there keep their
slots, and new or moved cards go to their hint or the nearest free slot, so one edit does not reshuffle the picture
(`stableLayout: false` lays them out afresh). [`examples/edit.html`](../../examples/edit.html) is a working host.

## Diagram types: the `edit` event and `apply()`

On a typed view of a version-2 model, the canvas emits `edit` instead of `change`, and the library applies it for you:

```js
import { render, apply, history } from 'umlimator/all';

let model = load();
const undo = history(model);
const map = render(el, model, {
  editable: true,
  on: { edit: e => { model = apply(model, e.commands); undo.push(model); map.update(model); } },
});
```

One gesture is one transaction of commands: `set`, `add`, `move`, `hide`, `delete` and `reparent`. New elements get
ids the canvas picks, free in the model. `references(model, id)` says what names an element. There are two kinds of
removal:

| Command | Takes away | Keeps |
|---|---|---|
| `hide` (Delete) | all one view says of the element: its place, pin, `present`, box, tour, the view's lines to it, the story steps on that view. The view's `subject` (or what owns it) is refused: change the subject, or delete it from the model (Shift + Delete; no command deletes a view). So is an element only this view holds (its own node or line), since hiding it would delete it: Delete on one, or on a member of one, sends `delete` instead and removes it from the model | the element, and every other view of it; not an element only this view holds |
| `delete` (Shift + Delete) | the element, its members, what it owns, the lines to them, and every place that names them | nothing of it, except a model element under a node only this view holds: it moves to its nearest owner left, else to none. Undo brings all of it back |

Undo is a snapshot of the model before (`history()`), so undo and redo give back byte-identical models.

| Edit | Pointer | Keyboard | Commands |
|---|---|---|---|
| rename a node or line | double-click a selected card's name | `F2`, Enter | `set label` |
| move a card | drag it to a slot | `Alt + arrows` | `set` of the view's `layout` pin |
| remove from this view | Remove from view (properties) | `Delete` | `hide` (`delete` for an element only this view holds) |
| delete from the model | Delete from model (properties), ✕ (outline) | `Shift + Delete` | `delete` |
| add a line | drag a selected card's handle to a card, then pick its kind | `L`, then arrows or type a name, Enter | `add` of a line |
| add an element | a palette entry, then its name | `N` (the first entry), or Enter on an entry | `add` with `view` |
| a member row | edit its row; ↑ ↓; the new row | Enter; `Alt + ↑ / ↓` in a row | `set label`, `move`, `add` with `owner` |
| a property | edit the field | Enter (a text field), Space, arrows | `set` of `props.<key>` |
| show an element here | Show (outline) | Enter on it | `set` of the view's `nodeIds` (or `edges`) |

A typed view with `editable` shows panels over the map's left side: the palette of the type's elements, the selected
element's properties, the problems `validate()` finds, and an outline of the model. Each diagram type adds its own
gestures (members as one line of UML text, messages moved in time, a port's side, a state's region, a BPMN lane);
[`docs/editing.md`](../editing.md) lists them type by type, and
[`examples/class-editor.html`](../../examples/class-editor.html) is a working host.

## Undo

Undo belongs to the host. `history(model)` is a small helper for it: the host pushes each model it applies, and hands
`undo()` and `redo()` results to `update()`. The canvas never sees it, and leaves Cmd/Ctrl keys to the page.
