import { leaveIssues, overlapIssues, routeAudit } from '../layout/audit.js';
import { mapContext } from './context.js';

const edgeRefIds = e => [...new Set((e.all || [e]).map(x => x._id).filter(Boolean))];

/* layout(model, viewId): one view's geometry, as the canvas draws it. No DOM. */
export function layout(model, viewId, options = {}) {
  const ctx = mapContext(model, { measure: options.measure, ...(options.expand ? { expand: { [viewId]: options.expand } } : {}) }); // expand: cards unfolded in place (#71)
  if (!ctx.V[viewId]) throw new Error(`umlimator: no view ${JSON.stringify(viewId)}`);
  ctx.planOf(viewId);
  const g = ctx.buildGeo(viewId, undefined, options.repair);
  g.edges.forEach(e => { e.ids = edgeRefIds(e); });
  if (options.expand) g.unfolded = ctx.unfolded[viewId] || [];
  return g;
}

/** The layout check's geometry for one view, without a browser: overlapping cards, crossing or shared lines, detours,
 *  lines round their own ends, against reading order or through a card, labels on lines or off their own, boxes and lanes. The page's check
 *  (`umlimator.py check`) adds what it measures in the DOM: text that overflows its card or touches its mark, titles
 *  that overflow, edge labels on cards or on each other. Each issue names the cards and lines it is about. */
export function check(model, viewId, options = {}) {
  const g = layout(model, viewId, options), where = `view ${viewId}`, about = [], lines = new Set(g.edges), boxes = new Set(g.families || []);
  const ref = x => lines.has(x) ? { type: 'edge', ids: x.ids, view: viewId } : boxes.has(x) ? { type: 'container', id: x.id, view: viewId } : { type: 'node', id: x.id, view: viewId };
  return [...overlapIssues(g, where, about), ...routeAudit(g, where, null, about), ...leaveIssues(g, where, about)]
    .map((message, i) => ({ message, targets: about[i].filter(Boolean).map(ref) }));
}

export { edgeRefIds };
