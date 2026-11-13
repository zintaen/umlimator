/* ---------- diagram types (work package 1.3) ----------
   A typed view's `diagram` names its type; a view with none is a map, and the map registers itself as the default
   (src/map/typed.js). A type this release does not know is drawn as plain cards, with a warning. Internal until the
   API is documented. */
const TYPES = new Map();

function registerDiagramType(name, def = {}) {
  if (typeof name !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(name)) throw new TypeError(`a diagram type's name is <notation> or <notation>.<kind> (uml.class), not ${JSON.stringify(name)}`);
  if (TYPES.has(name)) throw new Error(`diagram type "${name}" is registered already`);
  const type = Object.freeze({ ...def, name });
  TYPES.set(name, type);
  return type;
}

/* A definition's fields are optional and provisional; absent, things go as before. notes/spike-sequence.md §1 says what
   each does (validate(model) with no view runs once a type, not once a view); 1.9's: rankFlip, member, rules, describe.
   2.1's (notes/stage-2.md §3, §4.2, §8):
   - boxes(model, view) -> [{ id, label, title, nodeIds, parent, shape, aria }]: the view's boxes, a map's container format plus
     the drawn title, the shape whose frame(f) draws it (SHAPE, src/draw/shapes.js: its border with class family-box, its title
     with class family-title, as svg.js says) and its accessible name. A box's id is in the view's nodeIds but takes no slot:
     the layout context places its nodeIds as a block (blockPos), and the type's layout passes the same boxes to layoutTyped as
     containers. A drop into, out of or between boxes emits reparent, and removes the node's pin; an edit that changes the box
     a shown element is drawn in lays the view out again (render.js withPlaces). None: no boxes, as before.
   - owners(model, element) -> [{ id, label }]: the properties panel's Owner field for that element, a select of these and
     "none", which emits reparent (the element itself and what it holds are left out; its owner is added when not offered).
     None, or not a list: no Owner field.
   - layout.pins false: pos is {}, no ranking; layout.rank false: pos is the view's pins alone, no ranking (risks.md P1).
     reroute is no registry field: reroute: false goes in the dg the type's own layout passes to layoutTyped (src/typed/layout.js).
   Stage 4's (notes/stage-4.md §12.1, §15): edits.rename(model, view, id, text); a hook's { pick, then }; name: false and
   opens on a palette entry; a line's cut, its label's width (150); rows(model, view, id) and word(model, id), the PDF's.
   Stage 5's: a line's fromPort, toPort, inner, portRank and a box's pad, round (src/typed/layout.js); edits.member,
   edits.key (src/typed/edit.js). */

/* A view's type: the map for a view with no diagram, the registered type, or null for one this release does not draw */
const diagramOf = view => TYPES.get(view && view.diagram != null ? view.diagram : 'map') || null;

/* What only a registered type's geometry uses, installed at load time by the files under src/typed/, which only
   lib/umlimator-all.js holds (tools/build.mjs): rows, rooms and routes in layoutPass, a typed line's ends in svgOf, the
   gestures of edit.js it takes over (edit). Empty in umlimator.js, where no view is laid out but as a map (risks.md C5) */
const TYPED = {};

const propRefs = type => Object.assign({}, ...[...TYPES.values()].map(T => T.refs && Object.hasOwn(T.refs, type) && T.refs[type]));

export { registerDiagramType, diagramOf, propRefs, TYPED };
