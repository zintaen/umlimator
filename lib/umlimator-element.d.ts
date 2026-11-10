// Types for lib/umlimator-element.js, `umlimator/element` (#92). Its header says what each attribute and event does.
import type { Events, Handle } from './umlimator.js';

/** <umlimator-map src view minimap controls wheel theme height>: the model from `src` (a URL) or a child
 *  <script type="application/json">, drawn by render(); its other children show until the map is drawn. */
export class UmlimatorMap extends HTMLElement {
  /** render()'s handle once the map is drawn (each `load` event), else null. */
  readonly map: Handle | null;
}

declare global {
  interface HTMLElementTagNameMap { 'umlimator-map': UmlimatorMap }
  /** The map's events, re-dispatched on the element (they bubble); preventDefault() on umlimator:open keeps the view. */
  interface HTMLElementEventMap {
    'umlimator:select': CustomEvent<Events['select']>;
    'umlimator:open': CustomEvent<Events['open']>;
    'umlimator:viewchange': CustomEvent<Events['viewchange']>;
  }
}
