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
  const toNodes = e => { if (e && typeof e === 'object') ['from', 'to'].forEach(k => { if (ownerOf[e[k]] != null) e[k] = ownerOf[e[k]]; }); };
  (Array.isArray(D.edges) ? D.edges : []).forEach(e => { if (e && e.type != null) toNodes(e); });
  views.forEach(v => { if (v.diagram == null || diagramOf(v)) return;
    warn(`view "${v.id}": diagram "${v.diagram}" is not drawn by this release; its nodes are drawn as plain cards`);
    (Array.isArray(v.edges) ? v.edges : []).forEach(toNodes);
    delete v.diagram; });
}

export { plainViews };
