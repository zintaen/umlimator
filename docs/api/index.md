# API reference

umlimator is one ES module with no dependencies, no build step and no network calls. It draws a map model into any
element, and its functions that read a model run in Node as well as in a browser. The types are hand-written in
[`lib/umlimator.d.ts`](../../lib/umlimator.d.ts); these pages explain each export. The history of every change is in
the [changelog](../module-api.md).

```bash
npm install umlimator
```

```js
import { render } from 'umlimator';
import 'umlimator/theme.css';

const map = render(document.getElementById('map'), model, {
  on: { select: e => console.log(e.target) },
});
```

## Entry points

| Import | File | What it gives you |
|---|---|---|
| `umlimator` | `lib/umlimator.js` | Maps: every function below. A typed view (a diagram type) draws as plain cards, with a warning. |
| `umlimator/all` | `lib/umlimator-all.js` | The same exports, and every diagram type drawn in its own notation. See [Typed diagrams](./typed-diagrams.md). |
| `umlimator/theme.css` | `lib/umlimator-theme.css` | The default `--um-*` palette, light and dark, and the fonts. Optional: a host may set the variables itself. |
| `umlimator/schema.json` | `lib/umlimator.schema.json` | The model's JSON Schema, for editors and validators. See [Model and schema](./model-and-schema.md#json-schema). |
| `umlimator/element` | `lib/umlimator-element.js` | The `<umlimator-map>` custom element. See [Element and plugins](./element-and-plugins.md). |
| `umlimator/markdown-it` | `lib/umlimator-markdown-it.js` | A markdown-it plugin (VitePress) for `umlimator` fenced blocks. |
| `umlimator/remark` | `lib/umlimator-remark.js` | A remark plugin (Docusaurus, MDX) for the same blocks. |

`umlimator` and `umlimator/all` share one set of types and one API: switch the import to draw diagram types, and
nothing else changes.

From a CDN, with no install:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/umlimator@0.45.0/lib/umlimator-theme.css">
<script type="module">
  import { render } from 'https://cdn.jsdelivr.net/npm/umlimator@0.45.0/lib/umlimator.js';
</script>
```

## Functions

| Function | Needs a browser | What it does | Page |
|---|---|---|---|
| `render(container, model, options?)` | yes | Draws a model into an element and returns a `Handle`. | [render](./render.md#render) |
| `mountPage(container, model, options?)` | yes | The whole standalone viewer the CLI writes. | [render](./render.md#mountpage) |
| `layout(model, viewId, options?)` | no | One view's geometry: card boxes and line routes. | [render](./render.md#layout) |
| `check(model, viewId, options?)` | no | The layout check on that geometry: overlaps, crossings, detours, misplaced labels. | [render](./render.md#check) |
| `validate(model)` | no | The model's own errors and warnings, each with where it is. | [apply and commands](./apply-and-commands.md#validate) |
| `migrate(model)` | no | The model at the schema version this release reads. | [model and schema](./model-and-schema.md#migrate) |
| `apply(model, commands)` | no | The next model after a transaction of commands. | [apply and commands](./apply-and-commands.md#apply) |
| `history(model, limit?)` | no | Undo and redo for a host that applies models. | [apply and commands](./apply-and-commands.md#history) |
| `references(model, id)` | no | Every place a model names an element. | [apply and commands](./apply-and-commands.md#references) |
| `rules(model)` | no | Every rule in `model.rules` the model breaks, view by view. | [apply and commands](./apply-and-commands.md#rules) |
| `diff(before, after)` | no | What changed between two models, as one model to draw. | [apply and commands](./apply-and-commands.md#diff) |
| `drift(model, observed)` | no | The map against the traffic seen: lines nobody drew, lines that carried nothing. | [apply and commands](./apply-and-commands.md#drift) |
| `describe(model, viewId)` | no | A view in plain sentences. | [apply and commands](./apply-and-commands.md#describe) |
| `paths(model, viewId, from, to)` | no | Every card and line on a path between two cards. | [apply and commands](./apply-and-commands.md#paths) |
| `reach(model, viewId, from, options?)` | no | What a card leads to, or what leads to it. | [apply and commands](./apply-and-commands.md#reach) |
| `critical(model, viewId, options?)` | no | The slowest or costliest path along a view's lines. | [apply and commands](./apply-and-commands.md#critical) |
| `storyFromFlow(model, viewId, options?)` | no | A story told from a view's main flow, one step per main card, branches as chapters. | [apply and commands](./apply-and-commands.md#storyfromflow) |
| `whatIf(model, viewId, options)` | no | What loses its way when cards are taken out. | [apply and commands](./apply-and-commands.md#whatif) |
| `otlpSpans(otlp)` | no | The spans of an OpenTelemetry trace, ready for `replay()`. | [events and state](./events-and-state.md#otlpspans) |
| `sequenceFromTrace(model, spans, options?)` | no | A trace kept as a numbered view of the model. | [events and state](./events-and-state.md#sequencefromtrace) |

None of them changes the model it is given: each one that returns a model returns a new one.

## Types

| Group | Types | Page |
|---|---|---|
| Drawing | `RenderOptions`, `Handle`, `ExportOptions`, `Geometry`, `CheckIssue` | [render](./render.md) |
| The model | `MapModel`, `MapNode`, `MapEdge`, `MapView`, `Shape`, `Badge`, `WireKind`, `Element`, `Ref`, `Selector`, `LensSelector`, `Lens`, `Rule`, `Story`, `StoryStep`, `FlowStory` | [model and schema](./model-and-schema.md) |
| Changing and reading a model | `Command`, `History`, `Reference`, `Problem`, `RuleBreak`, `DiffResult`, `Observed`, `DriftResult` | [apply and commands](./apply-and-commands.md) |
| Events, state and marks | `Events`, `Change`, `Hint`, `MapState`, `StoryPlayer`, `Overlay`, `CardMark`, `LineMark`, `Lit`, `Span`, `Replay` | [events and state](./events-and-state.md) |
| The element | `UmlimatorMap` | [element and plugins](./element-and-plugins.md) |
| Diagram types | `UmlClassElementType`, `C4ViewType`, `BpmnElementProps` and the rest of each type's vocabulary | [typed diagrams](./typed-diagrams.md) |

## Pages

- [render](./render.md): `render()`, the `Handle` it returns, `mountPage()`, and `layout()` and `check()` in Node.
- [Model and schema](./model-and-schema.md): what a model holds, the JSON Schema, and `migrate()`.
- [Apply and commands](./apply-and-commands.md): changing a model with `apply()` and `history()`, and reading it with
  `validate()`, `rules()`, `diff()`, `drift()`, `describe()`, `paths()`, `reach()`, `critical()` and `whatIf()`.
- [Events and state](./events-and-state.md): the events a map emits, `MapState`, layers of marks, stories, tours and
  trace replays.
- [Element and plugins](./element-and-plugins.md): `<umlimator-map>`, and the markdown-it and remark plugins.
- [Typed diagrams](./typed-diagrams.md): `umlimator/all`, the typed element envelope and each diagram type's vocabulary.
