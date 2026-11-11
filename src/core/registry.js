/* ---------- diagram types (work package 1.3) ----------
   A typed view's `diagram` names its type; a view with none is a map, and the map registers itself as the default
   (src/map/typed.js). A type this release does not know is drawn as plain cards, with a warning. Provisional: what a
   definition holds is settled after the sequence spike (1.12), so the registry is not exported from the package yet. */
const TYPES = new Map();

function registerDiagramType(name, def = {}) {
  if (typeof name !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(name)) throw new TypeError(`a diagram type's name is <notation> or <notation>.<kind> (uml.class), not ${JSON.stringify(name)}`);
  if (TYPES.has(name)) throw new Error(`diagram type "${name}" is registered already`);
  const type = Object.freeze({ ...def, name });
  TYPES.set(name, type);
  return type;
}

/* A view's type: the map for a view with no diagram, the registered type, or null for one this release does not draw */
const diagramOf = view => TYPES.get(view && view.diagram != null ? view.diagram : 'map') || null;

export { registerDiagramType, diagramOf };
