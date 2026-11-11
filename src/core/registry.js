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
   each does (validate(model) with no view runs once a type, not once a view); 1.9's: rankFlip, member, rules, describe. */

/* A view's type: the map for a view with no diagram, the registered type, or null for one this release does not draw */
const diagramOf = view => TYPES.get(view && view.diagram != null ? view.diagram : 'map') || null;

/* What only a registered type's geometry uses, installed at load time by the files under src/typed/, which only
   lib/umlimator-all.js holds (tools/build.mjs): rows, rooms and routes in layoutPass, a typed line's ends in svgOf. Empty in
   umlimator.js, where no view is laid out but as a map (risks.md C5) */
const TYPED = {};

const propRefs = type => Object.assign({}, ...[...TYPES.values()].map(T => T.refs && Object.hasOwn(T.refs, type) && T.refs[type]));

export { registerDiagramType, diagramOf, propRefs, TYPED };
