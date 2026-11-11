import { TYPED } from '../core/registry.js';
import { NW, OWN_ROUTE, labelW, layoutGraph } from '../layout/layered.js';

/* A typed view's layout (work package 1.4): layoutGraph's plain layout with what a typed view needs, none of it on a map.
   The parts of layoutPass only a typed view takes are here too (TYPED, registry.js); only lib/umlimator-all.js holds this
   file, as a map never reaches it (risks.md C5).
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

// A typed view's lines from a node to itself (risks.md F1) are loops round its top right corner, nested, the first innermost:
// each one's top run D px above the node, its label on that run clear of the node's stub room and of the loop inside; its
// right run R px right of the node, far enough for the top run to hold the label. out: how far each loop's port on the
// node's top lies left of its right side (0 before ports are known, for the room: above the node's row, right of its column)
const loopDims = (dg, STUB, SEP) => (list, out) => { let D = 0, R = 0, half = 0;
  return list.map((e, k) => { const lw = e.label || e.step != null ? labelW(e) : 0, [bw, bh] = dg.turned ? [lw && 18, lw] : [lw, lw && 18];
    D = k ? D + half + bh / 2 + 10 : STUB + 6 + bh / 2; half = bh / 2;
    R = Math.max(k ? R + 2 * SEP : STUB + 4, bw + 12 - out[k]); return { D, R, top: D + half }; }); };
// layoutPass's loops (LP): fills loops (by node id, the lines from it to itself) and makes room for them; then mark(edges),
// each such line routed here, not by the router; ports(pushSide): the top port of the node's right side and the right port
// of its top, the inner loop the nearer the corner; route(): each loop out of the right side, up, left and down into the
// top, and its corners, which the other routes keep SEP px off, so none touches it or turns where it does
TYPED.loops = (loops, dg, { byId, extraX, extraY, STUB, RG, CG, SEP, gapAfter }) => {
  const dims = loopDims(dg, STUB, SEP); let edges = [];
  (dg.edges || []).forEach(e => { if (e.from === e.to && byId[e.from]) (loops[e.from] ||= []).push(e); });
  Object.entries(loops).forEach(([id, list]) => { const n = byId[id], d = dims(list, list.map(() => 0)).at(-1);
    extraY[n.row - .5] = Math.max(extraY[n.row - .5] || 0, d.top + STUB + 7 - RG);
    extraX[n.col] = Math.max(extraX[n.col] || 0, d.R + STUB + 6 - Math.max(CG, gapAfter[n.col] || 0)); });
  const loopsOf = n => edges.filter(e => e[OWN_ROUTE] === 'loop' && e.s === n);
  return {
    mark(all) { edges = all; edges.forEach(e => { if (e.s === e.t) Object.assign(e, { [OWN_ROUTE]: 'loop', fixed: true, fs: 'R', ts: 'T', stubs: [], how: 'self' }); }); }, // its loop is drawn once its ports are known
    ports: pushSide => edges.filter(e => e[OWN_ROUTE] === 'loop').forEach(e => { const n = e.s, k = loopsOf(n).indexOf(e);
      pushSide(n, 'R', e, { x: n.x + n.w, y: -1e6 + k, w: 0, h: 0 }); pushSide(n, 'T', e, { x: 1e6 - k, y: n.y, w: 0, h: 0 }); }),
    route() { const corners = []; [...new Set(edges.filter(e => e[OWN_ROUTE] === 'loop').map(e => e.s))].forEach(n => { const list = loopsOf(n);
      dims(list, list.map(e => n.x + n.w - e.p2[0])).forEach(({ D, R }, k) => { const e = list[k], x = n.x + n.w + R, y = n.y - D;
        e.pts = e.fixed = [e.p1, [x, e.p1[1]], [x, y], [e.p2[0], y], e.p2];
        e.pts.slice(1, 4).forEach(([px, py]) => corners.push({ x: px - SEP, y: py - SEP, w: 2 * SEP, h: 2 * SEP })); }); });
      return corners; },
  };
};

// a typed view's rows (stage 1 note §4): each as tall as its tallest node, a node on a half row counting toward both rows, and
// NH with none. With every node NH tall, the pitch is a map's. at(r): a row's top; ht(r): its height, a half row's the taller of its two
TYPED.rows = (dg, nodes, pitch, NH, RG) => {
  const rowH = {}, rowTop = {}; if (!dg.abs && nodes.length) {
    nodes.forEach(n => [Math.floor(n.row), Math.ceil(n.row)].forEach(k => { rowH[k] = Math.max(rowH[k] ?? 0, n.h); }));
    const r0 = Math.min(...Object.keys(rowH).map(Number)), r1 = Math.max(...Object.keys(rowH).map(Number));
    for (let k = r0, y = r0 * pitch; k <= r1 + 1; k++) { rowTop[k] = y; y += (rowH[k] ?? NH) + RG; } }
  return { at: r => { const k = Math.floor(r), f = r - k; return rowTop[k] == null || rowTop[k + 1] == null ? r * pitch : rowTop[k] + f * (rowTop[k + 1] - rowTop[k]); },
    ht: r => Math.max(rowH[Math.floor(r)] ?? NH, rowH[Math.ceil(r)] ?? NH) };
};

// A view laid out down (turned): the labels of lines between one pair are wider than the 16 px between the lines, so the
// lines fan out in the gap between the pair's columns, each to a lane of its own that holds its label. Above the middle, the
// outer line turns nearer each node, so none crosses another; a group the gap or another node leaves no room for goes to the router
TYPED.fan = (free, { simplify, through, STUB, SEP }) => { const pairs = new Map(), lr = e => e.fs === 'R' ? [e.p1, e.p2] : [e.p2, e.p1];
  free.forEach(e => { const [l, r] = e.fs === 'R' ? [e.s, e.t] : [e.t, e.s], k = l.id + '\u0001' + r.id;
    if (/^(RL|LR)$/.test(e.fs + e.ts) && l.x + l.w < r.x) pairs.set(k, [...(pairs.get(k) || []), e]); });
  pairs.forEach(list => { if (list.length < 2 || !list.some(e => e.label || e.step != null)) return;
    list.sort((a, b) => lr(a)[0][1] - lr(b)[0][1]); if (list.some((e, i) => i && lr(e)[1][1] <= lr(list[i - 1])[1][1])) return;
    const bh = list.map(e => e.label || e.step != null ? labelW(e) : 0), gaps = bh.map((h, i) => i ? Math.max(SEP, (bh[i - 1] + h) / 2 + 6) : 0);
    const mid = list.reduce((a, e) => a + lr(e)[0][1] + lr(e)[1][1], 0) / (2 * list.length), lanes = [];
    gaps.reduce((y, g, i) => (lanes[i] = y + g), mid - gaps.reduce((a, g) => a + g, 0) / 2);
    // each line's turn on each side: the k-th line turning towards its lane from the outside turns k SEP px past the stub
    const turns = side => { const at = []; const up = list.map((e, i) => i).filter(i => lanes[i] < lr(list[i])[side][1]), down = list.map((e, i) => i).filter(i => lanes[i] >= lr(list[i])[side][1]).reverse();
      [up, down].forEach(g => g.forEach((i, k) => { at[i] = lr(list[i])[side][0] + (side ? -1 : 1) * (STUB + k * SEP); })); return at; };
    const xl = turns(0), xr = turns(1);
    if (Math.min(...xr) - Math.max(...xl) < 18 + 16) return;
    const pts = list.map((e, i) => { const [a, b] = lr(e), P = simplify([a, [xl[i], a[1]], [xl[i], lanes[i]], [xr[i], lanes[i]], [xr[i], b[1]], b]); return e.fs === 'R' ? P : P.reverse(); });
    if (list.some((e, i) => through(pts[i], e))) return;
    list.forEach((e, i) => { Object.assign(e, { [OWN_ROUTE]: 'fan', fixed: pts[i], pts: pts[i], stubs: [], how: 'fan' }); free.splice(free.indexOf(e), 1); }); }); };

export { VIEW_GEO, VIEW_PAINT, geometryKey, layoutTyped };
