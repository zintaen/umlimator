import { NW, layoutGraph } from './layered.js';

/* A typed view's layout (work package 1.4): layoutGraph's plain layout with what a typed view needs, none of it on a map.
   Rows as tall as their tallest node (stage 1 note §4); a line from a node to itself drawn as a loop (risks.md F1); lines
   between one pair each with its own ports and label (F2); `direction: "down"` (note §6); and a memo that lays the view out
   again only when its geometry changed (F7). Nodes come with their sizes, `w` and `h`, which their shapes give (1.5). */

// what moves a typed view's geometry: every field of the view layoutGraph reads but VIEW_PAINT (a test holds the two lists to
// layered.js), and these of a node and a line. Anything else (a colour, a `props` field) only repaints
const VIEW_GEO = ['abs', 'authors', 'blocks', 'containers', 'direction', 'fan', 'flipped', 'gap', 'groups', 'hub', 'intake', 'laneGap', 'lanes', 'mainSteps', 'nodeH', 'quick', 'repair', 'rgap', 'turned', 'typed'];
const VIEW_PAINT = ['tour', 'subAndChips'], NODE_GEO = ['id', 'col', 'row', 'w', 'h', 'ax', 'ay'], EDGE_GEO = ['id', 'from', 'to', 'label', 'step', 'fromSide', 'toSide', 'back', 'fixed', 'sublabel'];
const geometryKey = dg => JSON.stringify([VIEW_GEO.map(k => dg[k]), (dg.nodes || []).map(n => NODE_GEO.map(k => n[k])), (dg.edges || []).map(e => EDGE_GEO.map(k => e[k]))]);

// direction "down": laid out left to right with every box turned, then turned back, x for y and the sides L for T, R for B
const SIDE_T = { L: 'T', T: 'L', R: 'B', B: 'R' }, swapXY = p => [p[1], p[0]];
const flipBox = r => { if (r) [r.x, r.y, r.w, r.h] = [r.y, r.x, r.h, r.w]; };
function transpose(g) {
  [...g.nodes, ...(g.families || []), g.bounds].forEach(flipBox);
  (g.groups || []).forEach(r => { [r.x, r.y, r.x2, r.y2] = [r.y, r.x, r.y2, r.x2]; });
  g.edges.forEach(e => { e.pts = e.pts.map(swapXY); if (e.fixed) e.fixed = e.pts; e.p1 = swapXY(e.p1); e.p2 = swapXY(e.p2);
    e.fs = SIDE_T[e.fs]; e.ts = SIDE_T[e.ts]; e.stubs = (e.stubs || []).map(s => s.map(swapXY)); flipBox(e.lbl); });
  return g;
}

// the geometry kept, with the paint of the view given in place of the paint it was laid out with: each node's own fields, and
// each line's, by its id (typed lines have ids); a field the view no longer gives goes. The geometric fields are the same in both
function repaint(g, was, dg) {
  const by = (list, key) => new Map((list || []).filter(x => x && x[key] != null).map(x => [x[key], x]));
  [[g.nodes, was.nodes, dg.nodes], [g.edges, was.edges, dg.edges]].forEach(([out, a, b]) => { const A = by(a, 'id'), B = by(b, 'id');
    out.forEach(x => { const old = A.get(x.id), now = B.get(x.id); if (!now) return; for (const k in old) if (!(k in now)) delete x[k]; Object.assign(x, now); }); });
  return g;
}

/* dg: layoutGraph's input, with `direction` ("right", the default, or "down"). memo: an object kept for the view between
   calls; while the geometry key is the same, the geometry it holds is repainted and returned, and nothing is laid out or
   routed. memo.runs counts the layouts. */
function layoutTyped(dg, memo) {
  const key = memo && geometryKey(dg);
  if (memo && memo.key === key) { const g = repaint(memo.g, memo.dg, dg); memo.dg = dg; return g; }
  const t = { ...dg, typed: true }, g = dg.direction === 'down'
    ? transpose(layoutGraph({ ...t, turned: true, nodes: (dg.nodes || []).map(n => ({ ...n, w: n.h || dg.nodeH || 64, h: n.w || NW })) }, false))
    : layoutGraph(t, false);
  if (memo) Object.assign(memo, { key, g, dg, runs: (memo.runs || 0) + 1 });
  return g;
}

export { VIEW_GEO, VIEW_PAINT, geometryKey, layoutTyped };
