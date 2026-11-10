/* <umlimator-map> (#92): a map in any page from HTML alone, as `umlimator/element`.

     <umlimator-map src="model.json" view="system" minimap height="560">
       <img src="system.png" alt="The system view">
     </umlimator-map>

   The model comes from `src`, a URL (a data: URL too), or from a child <script type="application/json">, and render()
   draws it in the element's shadow root. The element's other children (a still, say) show until the map is drawn, and stay
   where scripts don't run. Changing src, view, minimap, controls (controls="false" hides them) or wheel draws it again,
   and removing the element destroys the map. wheel="ctrl": the wheel zooms only with Ctrl or ⌘, and scrolls the page
   otherwise, as a map in a document should. height: a number is pixels (default 480px; CSS may size it instead). theme:
   "light" or "dark", that map's palette from lib/umlimator-theme.css, whatever the page's; without it the map follows the
   page, a docs site's dark mode too (VitePress's html.dark, Docusaurus's html[data-theme="dark"]). The colours come from
   that file or the host's own --um-* variables; the element fetches nothing but its model.
   Events: the map's select, open and viewchange as umlimator:select, umlimator:open and umlimator:viewchange, the map's
   event as `detail` (preventDefault() on umlimator:open keeps the view); load each time the map is drawn, error (an
   ErrorEvent, whose message says why) when it can't be, a model with no view to draw too (its children show again).
   `el.map` is render()'s handle once drawn (toSVG(), highlight(), setView(), state ...), else null; `el.loading` is true
   while a draw waits for its model, when el.map is still the map drawn last. An attribute set to the value it has draws
   nothing again. */
import { render } from './umlimator.js';

const Base = globalThis.HTMLElement || class {}; // importable where there is no DOM (a docs site's server render)

export class UmlimatorMap extends Base {
  static observedAttributes = ['src', 'view', 'minimap', 'controls', 'wheel', 'height'];
  map = null;
  #drawn = 0; #due = false; #src = null; #model = null; #loading = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host { display: block; height: 480px; overflow: hidden; } ::slotted(img) { display: block; max-width: 100%; max-height: 100%; }</style>'
      + '<slot></slot><div hidden style="height: 100%"></div>';
  }
  get loading() { return this.#loading; } // a draw under way, waiting for its model (0.14.0)
  connectedCallback() { this.#soon(); }
  disconnectedCallback() { this.#loading = false; this.#drop(); }
  attributeChangedCallback(name, was, now) {
    if (was === now) return; // set to the value it has: nothing to draw again (0.14.0)
    if (name === 'height') this.style.height = now == null ? '' : /^\d+(\.\d+)?$/.test(now) ? now + 'px' : now;
    else this.#soon();
  }
  #soon() { // attributes set together draw once
    this.#loading = true;
    if (this.#due) return;
    this.#due = true;
    queueMicrotask(() => { this.#due = false; if (this.isConnected) this.#draw(); else this.#loading = false; });
  }
  #drop() {
    this.map?.destroy(); this.map = null;
    const [, slot, box] = this.shadowRoot.children; slot.hidden = false; box.hidden = true;
  }
  #fail(err) { // the children show again, and the error event says why
    this.#loading = false; this.#drop(); console.warn('<umlimator-map>:', err);
    this.dispatchEvent(new ErrorEvent('error', { message: String((err && err.message) || err), error: err }));
  }
  async #draw() {
    const n = ++this.#drawn, src = this.getAttribute('src'), get = a => this.getAttribute(a); // a later draw wins
    let model = src && src === this.#src ? this.#model : null;
    try {
      if (src && !model) {
        const r = await fetch(src);
        if (!r.ok) throw new Error(`${src}: ${r.status} ${r.statusText}`);
        model = await r.json();
      } else if (!src) {
        const json = this.querySelector(':scope > script[type="application/json"]');
        if (!json) throw new Error('no src, and no <script type="application/json"> child');
        model = JSON.parse(json.textContent);
      }
    } catch (err) { if (n === this.#drawn) this.#fail(err); return; }
    if (n !== this.#drawn) return; // a later draw has the element
    if (!this.isConnected) { this.#loading = false; return; }
    if (src) { this.#src = src; this.#model = model; }
    this.#drop();
    const [, slot, box] = this.shadowRoot.children; slot.hidden = true; box.hidden = false;
    // the map's events, as DOM events on the element; a host that cancels umlimator:open cancels the open
    const on = Object.fromEntries(['select', 'open', 'viewchange'].map(t => [t, e => {
      if (!this.dispatchEvent(new CustomEvent('umlimator:' + t, { detail: e, bubbles: true, composed: true, cancelable: t === 'open' }))) e.preventDefault();
    }]));
    try {
      this.map = render(box, model, { view: get('view') || undefined, minimap: this.hasAttribute('minimap') && get('minimap') !== 'false', controls: get('controls') !== 'false', wheel: get('wheel') === 'ctrl' ? 'ctrl' : 'zoom', on });
    } catch (err) { return this.#fail(err); }
    if (this.map.view == null) return this.#fail(new Error(`${src || 'the inline model'}: the model has no view to draw`)); // drawn, with nothing to see: an error, not a load (0.14.0)
    this.#loading = false;
    this.dispatchEvent(new Event('load'));
  }
}

if (globalThis.customElements && !customElements.get('umlimator-map')) customElements.define('umlimator-map', UmlimatorMap);
