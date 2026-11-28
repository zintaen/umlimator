# Element and plugins

A map from HTML alone with the `<umlimator-map>` custom element, and a map from a fenced block in Markdown with the
markdown-it and remark plugins. Back to the [API reference](./index.md).

## umlimator-map

`umlimator/element` (`lib/umlimator-element.js`) defines `<umlimator-map>`. It loads a model and draws it with
[`render()`](./render.md#render), with no script of your own. Its children (a still image, say) show until the map is
drawn, and stay where scripts don't run.

```html
<link rel="stylesheet" href="node_modules/umlimator/lib/umlimator-theme.css">
<script type="module" src="node_modules/umlimator/lib/umlimator-element.js"></script>

<umlimator-map src="umlimator-atlas.json" view="overview" minimap height="520">
  <img src="stills/overview.png" alt="umlimator's parts and who uses each">
</umlimator-map>
```

Or with the model inline:

```html
<umlimator-map view="system">
  <script type="application/json">
    { "nodes": [{ "id": "web", "label": "Web app" }], "views": [{ "id": "system", "nodeIds": ["web"] }] }
  </script>
</umlimator-map>
```

A model of schema version 2 is drawn by `umlimator-all.js`, which the element loads from beside itself only then, so
diagram types draw in their own notation. `examples/element.html` is a working page.

### Attributes

| Attribute | What it does |
|---|---|
| `src` | The model's URL, resolved as an `<img>`'s is (a `data:` URL too). Without it, the model is read from a child `<script type="application/json">`. |
| `view` | The view shown first. |
| `minimap` | Present: draw the minimap. |
| `controls` | `"false"` hides the zoom and fit buttons. |
| `wheel` | `"ctrl"`: the wheel zooms only with Ctrl or ⌘, and scrolls the page otherwise. |
| `images` | Which images the model names are drawn, `render()`'s [`images`](./render.md#renderoptions): none but `data:` images without it; `"local"` also a path on the page's own site; `"remote"` any http(s) address too, which a model from someone else can use to make each reader's browser call an address it names. |
| `height` | A number is pixels; anything else is a CSS length. Default 480px; CSS may size the element instead. |
| `theme` | `"light"` or `"dark"`: that palette from `umlimator-theme.css` for this map, whatever the page's. Without it the map follows the page, including a docs site's dark mode (VitePress's `html.dark`, Docusaurus's `html[data-theme="dark"]`). |

Changing `src`, `view`, `minimap`, `controls`, `wheel` or `images` draws the map again (a model already fetched from the same `src`
is reused); setting an attribute to the value it has draws nothing. Removing the element destroys the map. Without
`images`, the element fetches nothing but its model.

### Events

| Event | When | `detail` |
|---|---|---|
| `umlimator:select` | the map's [`select`](./events-and-state.md#select) | the map's event |
| `umlimator:open` | the map's [`open`](./events-and-state.md#open); `preventDefault()` keeps the view | the map's event |
| `umlimator:viewchange` | the map's [`viewchange`](./events-and-state.md#viewchange) | the map's event |
| `load` | each time the map is drawn | none |
| `error` | the map can't be drawn: a failed fetch, JSON that doesn't parse, no model, or no view to draw. An `ErrorEvent` whose `message` says why; the children show again. | none |

The `umlimator:` events bubble.

```js
const el = document.querySelector('umlimator-map');
el.addEventListener('umlimator:select', e => console.log(e.detail.target));
el.addEventListener('umlimator:open', e => { e.preventDefault(); location.href = '/docs/' + e.detail.view; });
el.addEventListener('error', e => console.warn(e.message));
```

## UmlimatorMap

```ts
class UmlimatorMap extends HTMLElement {
  readonly map: Handle | null;
  readonly loading: boolean;
}
```

The element's class, exported by `umlimator/element` and typed in `lib/umlimator-element.d.ts`. `HTMLElementTagNameMap`
maps `'umlimator-map'` to it, so `document.querySelector('umlimator-map')` is typed.

| Property | What it is |
|---|---|
| `map` | [`render()`](./render.md#render)'s [`Handle`](./render.md#handle) once the map is drawn (on each `load`), else `null`. Use it for `toSVG()`, `highlight()`, `setView()`, `state` and the rest. |
| `loading` | `true` while a draw waits for its model; `map` is then still the map drawn last. `load` or `error` ends it. |

```js
el.addEventListener('load', () => {
  el.map.highlight([{ type: 'node', id: 'api', view: el.map.view }]);
});
```

The module can be imported where there is no DOM (a docs site's server render): it defines the class but draws nothing.

## markdown-it plugin

```ts
// umlimator/markdown-it
export default function umlimator(md: any): void;
export function attrs(text: string): Record<string, string>;
```

The default export is a markdown-it plugin: each fenced block whose info string starts with `umlimator` becomes a
`<umlimator-map>` element. Other fences are left to the host's renderer.

````markdown
```umlimator
src: /maps/umlimator-atlas.json
view: overview
```
````

The block's `key: value` lines are the element's attributes: `src`, `view`, `minimap`, `controls`, `wheel`, `images`,
`theme` and `height`. After them, or instead of `src`, the block may hold a model in JSON, which goes into `src` as a `data:` URL
(VitePress compiles each page as a Vue template, which drops a `<script>` child). A block the element can't use throws,
so the site's build fails where the mistake is seen: an unknown key, a broken model, or neither or both of `src` and a
model.

`attrs(text)` is the parser on its own: a block's text as the element's attributes.

```js
import { attrs } from 'umlimator/markdown-it';
attrs('src: /maps/shop.json\nview: api');   // { src: '/maps/shop.json', view: 'api' }
```

### VitePress

```ts
// .vitepress/config.mts
import { defineConfig } from 'vitepress';
import umlimator from 'umlimator/markdown-it';

export default defineConfig({
  markdown: { config: md => md.use(umlimator) },
  vue: { template: { compilerOptions: { isCustomElement: t => t === 'umlimator-map' } } },
});
```

```js
// .vitepress/theme/index.js
import DefaultTheme from 'vitepress/theme';
import 'umlimator/element';   // safe in the server render: it defines the element only where there is a DOM
import 'umlimator/theme.css';

export default DefaultTheme;
```

## remark plugin

```ts
// umlimator/remark
export default function umlimator(): (tree: any) => void;
```

A remark plugin for Docusaurus, MDX, or any remark-rehype pipeline: each `umlimator` fenced block, at any depth,
becomes a `<umlimator-map>` element with the same attributes the markdown-it plugin gives it (it uses the same
`attrs()`). The block's node becomes one that names the element (`data.hName`, `data.hProperties`), which MDX and
remark-rehype both turn into it.

### Docusaurus

```js
// docusaurus.config.js
import umlimator from 'umlimator/remark';

export default {
  presets: [['classic', { docs: { remarkPlugins: [umlimator] } }]],
  clientModules: ['./src/umlimator.js'],
};
```

```js
// src/umlimator.js
import 'umlimator/element';
import 'umlimator/theme.css';
```

### MkDocs, or any site that allows HTML

Write the element itself in the Markdown. Copy `lib/umlimator.js`, `lib/umlimator-element.js` and
`lib/umlimator-theme.css` (and `lib/umlimator-all.js`, for diagram types) into `docs/js/`, and load them in
`mkdocs.yml`:

```yaml
extra_javascript:
  - path: js/umlimator-element.js
    type: module
extra_css:
  - js/umlimator-theme.css
```

## See also

- [render](./render.md): the `Handle` that `el.map` holds.
- [Events and state](./events-and-state.md): the map events behind `umlimator:select`, `umlimator:open` and
  `umlimator:viewchange`.
