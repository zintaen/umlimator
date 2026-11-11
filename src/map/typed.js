import { diagramOf, registerDiagramType } from '../core/registry.js';
import { warn } from '../core/warn.js';

/* The map: today's notation, and the default diagram type. A view of a version-1 model, or a version-2 view with no
   `diagram`, is a map and takes exactly today's code path. */
const MAP = registerDiagramType('map', { title: 'architecture map' });

/* A typed view whose diagram this release does not draw becomes a plain map view of its nodes, so it still shows what
   it holds (risks.md M13): its nodes as cards, and its typed lines between them, a line that ends on a member drawn to
   the node that owns it. Fragments, timelines and `present` are not drawn. Works on the copy of the model that
   mapContext makes; a version-1 model, or one whose typed views are all of known types, is left as it is. */
function plainViews(D) {
  const views = Array.isArray(D.views) ? D.views.filter(v => v && typeof v === 'object') : [];
  if (D.schemaVersion !== 2 || !views.some(v => v.diagram != null && !diagramOf(v))) return;
  const ownerOf = {}, own = (x, top) => (Array.isArray(x.members) ? x.members : []).forEach(m => { if (m && typeof m.id === 'string') { ownerOf[m.id] = top; own(m, top); } });
  (Array.isArray(D.nodes) ? D.nodes : []).forEach(n => { if (n && typeof n.id === 'string') own(n, n.id); });
  // the view's own copies of its lines, so a map view of the same model sees the model's lines as they are
  const byId = new Map((Array.isArray(D.edges) ? D.edges : []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  const toNodes = e => { const x = typeof e === 'string' ? byId.get(e) : e; if (!x || typeof x !== 'object') return e;
    const y = { ...x }; ['from', 'to'].forEach(k => { if (ownerOf[y[k]] != null) y[k] = ownerOf[y[k]]; }); return y; };
  views.forEach(v => { if (v.diagram == null || diagramOf(v)) return;
    warn(`view "${v.id}": diagram "${v.diagram}" is not drawn by this release; its nodes are drawn as plain cards`);
    v.edges = (Array.isArray(v.edges) ? v.edges : Array.isArray(D.edges) ? D.edges : []).map(toNodes);
    delete v.diagram; });
}

export { plainViews };
