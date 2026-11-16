# Embedding

umlimator is one ES module with no dependencies and no build step. `render()` draws a model into any element of your
page, and the `<umlimator-map>` element does the same from HTML alone. This page covers both, and the setup for
VitePress, Docusaurus and MkDocs.

## render()

```js
import { render } from 'umlimator';   // one ES module, no dependencies, no build step
import 'umlimator/theme.css';         // the default --um-* palette and fonts (or set the variables yourself)

const map = render(document.getElementById('map'), model, {
  on: { select: e => showDetails(e.target), open: e => { e.preventDefault(); router.push(e.view); } },
});
map.update(nextModel);                        // redraws only what changed; keeps the view, camera and selection
const svg = map.toSVG({ scale: 2 });          // the current view as a stand-alone file
const png = await map.toPNG({ view: 'api' }); // any view, without showing it
map.destroy();
```

`render` draws one view at a time into a shadow root (give the element a height), with pan, zoom and drill-down.
Events (`click`, `select`, `open`, `viewchange`, `change`, `expand`) name what they are about by ids from the model.

### In React

Mount once and pass new models to `update`:

```jsx
function MapView({ model, onSelect }) {
  const el = useRef(null), map = useRef(null), cb = useRef(onSelect);
  cb.current = onSelect;
  useEffect(() => { map.current = render(el.current, model, { on: { select: e => cb.current?.(e.target) } }); return () => map.current.destroy(); }, []);
  useEffect(() => { map.current?.update(model); }, [model]);
  return <div ref={el} style={{ height: 600 }} />;
}
```

### Diagram types

- `import { render, apply, history } from 'umlimator/all'` draws diagram types too: a class, object, package, sequence, communication, use case, activity, state machine, interaction overview, component, deployment, composite structure, profile, timing, information flow, entity-relationship, flowchart, data flow, C4 or BPMN diagram, a mindmap, a Google Cloud, Azure or AWS architecture diagram, or one of SysML's requirement, block definition, internal block and parametric diagrams.
- Their gestures emit `edit` transactions that `apply(model, e.commands)` turns into the next model
  ([`examples/class-editor.html`](../../examples/class-editor.html) is a working host; see [Editing](./editing.md)).
- `umlimator` alone draws maps, and a typed view as plain cards with a warning.

### What the handle does

| Call | What it does |
|---|---|
| `map.update(model)` | redraws only what changed, keeping the view, camera and selection; eases into the next model (`ease: false` draws it at once) |
| `map.expand(id)`, `map.collapse(id)` | unfolds a stacked card in place, and folds it again |
| `map.toSVG()`, `map.toPNG()` | a view as a stand-alone file, with the host's marks drawn at rest |
| `map.overlay(name, layer)`, `highlight(refs)`, `tour(path)`, `replay(spans)` | the host's marks, a tour and a trace on the map ([Stories, lenses and live data](./stories-lenses-live.md)) |
| `map.lens(id)`, `map.play(id)` | one of the model's lenses, or one of its stories |
| `map.destroy()` | takes the map out of the page |

Functions that need no DOM run in Node too:

| Function | Returns |
|---|---|
| `layout(model, viewId, { expand })` | a view's geometry, unfolded cards included |
| `check(model, viewId)` | the layout check: crossings, shared lines, detours, labels on lines, text that overflows its card |
| `validate(model)` | dangling or repeated ids and other errors and warnings, before anything is drawn |
| `rules(model)` | every rule the model breaks, view by view |
| `paths()`, `reach()`, `describe()` | a view walked, and put in words |
| `critical()`, `whatIf()`, `sequenceFromTrace()` | the slowest or costliest path, what loses its way when cards go down, a trace kept as a numbered view |
| `diff(before, after)`, `drift(model, observed)` | models to draw, marked with what changed or what traffic ran on ([GitHub Action and diff](./github-action.md)) |

The API, its types and the decisions behind it: [`docs/module-api.md`](../module-api.md) and
[`lib/umlimator.d.ts`](../../lib/umlimator.d.ts).

### Colours and fonts

Colours are `--um-*` CSS variables, fonts are the host's (`--um-sans`, `--um-mono`), text is measured in that font,
and nothing is fetched. `--um-tint` sets how deep the cards' and the boxes' tints are: 1 by default, 0 for none, 2 for
twice as deep (a tint stops at 18% of its colour, so text on it keeps 4.5:1).

### The page's pieces, embedded

`mountPage` is the whole standalone viewer that the CLI writes ([The standalone page](./standalone-page.md)).
`render()` can draw its pieces too, each on its own or any mix, inside the map's element; the host keeps its own header:

```js
render(el, model, { nav: true, details: true, legend: true, hints: true });
```

| Option | What it adds |
|---|---|
| `nav` | the views list left of the map, opened and shut by its ☰ button or O. Picking a view emits `viewchange` |
| `details` | the selected card's panel under the map, with its tabs (`[` and `]`). Its Open and Unfold here buttons emit `open` and `expand`, as the canvas does, so a host can load a view first |
| `legend`, `hints` | the legend, and the line saying what the pointer does, over the map |

They share the page's code and look, take the `--um-*` colours (the theme adds `--um-mark` and `--um-scrim` for them),
and follow `update()` and `destroy()`. [`examples/embed.html`](../../examples/embed.html) uses them.

## The `<umlimator-map>` element

`<umlimator-map>` (`umlimator/element`) loads a model and draws it, with no script of your own. Its children show until
the map is drawn, and stay where scripts don't run ([`examples/element.html`](../../examples/element.html)):

```html
<link rel="stylesheet" href="node_modules/umlimator/lib/umlimator-theme.css">
<script type="module" src="node_modules/umlimator/lib/umlimator-element.js"></script>

<umlimator-map src="bookshop.json" view="api" minimap height="520">
  <img src="stills/api.png" alt="An order, step by step">
</umlimator-map>
```

| Part | What to know |
|---|---|
| **The model** | `src`, a URL resolved as an `<img>`'s is (a `data:` URL too), or the model in a child `<script type="application/json">`. A model of schema version 2, which may hold diagram types, is drawn by `umlimator-all.js`, which the element loads from beside itself only then |
| **Attributes** | `view`, `minimap`, `controls="false"`, `wheel="ctrl"` (the wheel zooms only with Ctrl or ⌘, and scrolls the page otherwise, as a map in a document should), `height` (a number is pixels; 480 by default, or size it in CSS) and `theme` (`light` or `dark`: theme.css's palette for that map, whatever the page's). Changing one draws the map again, and removing the element destroys it |
| **Events** | `umlimator:select`, `umlimator:open` (cancel it to stay) and `umlimator:viewchange`, the map's event as `detail`; `load` once it is drawn, `error` when it can't be. `el.map` is the `render()` handle |
| **Colours** | theme.css, or your own `--um-*` variables. The element fetches nothing but its model |
| **Dark mode** | without `theme`, the map follows the page, a docs site's dark mode included: VitePress's `<html class="dark">` and Docusaurus's `<html data-theme="dark">` |

## In a docs site

A fenced `umlimator` block becomes the element. It names the model's `src`, with `view` or any other attribute, or
holds the model in JSON:

````markdown
```umlimator
src: /maps/bookshop.json
view: api
```
````

A block the element can't use (an unknown key, a broken model, neither `src` nor a model, or both) fails the build.

### VitePress

In `.vitepress/config`:

```js
import umlimator from 'umlimator/markdown-it';

export default {
  markdown: { config: md => md.use(umlimator) },
  vue: { template: { compilerOptions: { isCustomElement: t => t === 'umlimator-map' } } },
};
```

In `.vitepress/theme/index`, `import 'umlimator/element'` and `import 'umlimator/theme.css'`.

### Docusaurus

Add `remarkPlugins: [umlimator]` (`import umlimator from 'umlimator/remark'`) to the docs preset's options, and a
client module (`clientModules: ['./src/umlimator.js']`) that imports `umlimator/element` and `umlimator/theme.css`.

### MkDocs, or any site that allows HTML

Write the element itself in the Markdown. Copy `lib/umlimator.js`, `lib/umlimator-element.js` and
`lib/umlimator-theme.css` (and `lib/umlimator-all.js`, for diagram types) into `docs/js/`, and load them in
`mkdocs.yml`:

```yaml
extra_javascript: [{ path: js/umlimator-element.js, type: module }]
extra_css: [js/umlimator-theme.css]
```
