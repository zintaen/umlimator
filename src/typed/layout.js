import { TYPED } from '../core/registry.js';
import { warn } from '../core/warn.js';
import { NW, OWN_ROUTE, labelW, layoutGraph } from '../layout/layered.js';

/* A typed view's layout (work package 1.4): layoutGraph's plain layout with what a typed view needs, none of it on a map.
   The parts of layoutPass only a typed view takes are here too (TYPED, registry.js); only lib/umlimator-all.js holds this
   file, as a map never reaches it (risks.md C5).
   Rows as tall as their tallest node (stage 1 note §4); a line from a node to itself drawn as a loop (risks.md F1); lines
   between one pair each with its own ports and label (F2); `direction: "down"` (note §6); and a memo that lays the view out
   again only when its geometry changed (F7). Nodes come with their sizes, `w` and `h`, which their shapes give (1.5). */

// what moves a typed view's geometry: every field of the view layoutGraph reads but VIEW_PAINT (a test holds the two lists to
// layered.js), and these of a node and a line. Anything else (a colour, a `props` field) only repaints
const VIEW_GEO = ['abs', 'authors', 'blocks', 'containers', 'direction', 'fan', 'flipped', 'gap', 'groups', 'hub', 'intake', 'labelGaps', 'laneGap', 'lanes', 'mainSteps', 'nodeH', 'quick', 'repair', 'reroute', 'rgap', 'turned', 'typed'];
const VIEW_PAINT = ['tour', 'subAndChips'], NODE_GEO = ['id', 'col', 'row', 'w', 'h', 'ax', 'ay'], EDGE_GEO = ['id', 'from', 'to', 'label', 'step', 'fromSide', 'toSide', 'back', 'fixed', 'sublabel', 'cut', 'fromPort', 'toPort', 'inner', 'portRank'];
const geometryKey = dg => JSON.stringify([VIEW_GEO.map(k => dg[k]), (dg.nodes || []).map(n => NODE_GEO.map(k => n[k])), (dg.edges || []).map(e => EDGE_GEO.map(k => e[k]))]);

// direction "down": laid out left to right with every box turned, then turned back, x for y and the sides L for T, R for B
const SIDE_T = { L: 'T', T: 'L', R: 'B', B: 'R' }, swapXY = p => [p[1], p[0]];
const flipBox = r => { if (r) [r.x, r.y, r.w, r.h] = [r.y, r.x, r.h, r.w]; };
function transpose(g) {
  [...g.nodes, ...(g.families || []), ...new Set(g.edges.flatMap(e => [e.s, e.t]).filter(n => n && n.box)), g.bounds].forEach(flipBox); // a line's end on a box too
  (g.groups || []).forEach(r => { [r.x, r.y, r.x2, r.y2] = [r.y, r.x, r.y2, r.x2]; });
  g.edges.forEach(e => { e.pts = e.pts.map(swapXY); if (e.fixed) e.fixed = e.pts; e.p1 = swapXY(e.p1); e.p2 = swapXY(e.p2);
    e.fs = SIDE_T[e.fs]; e.ts = SIDE_T[e.ts]; e.stubs = (e.stubs || []).map(s => s.map(swapXY)); flipBox(e.lbl); flipBox(e.fpb); flipBox(e.tpb); });
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
   routed. memo.runs counts the layouts. dg.reroute false: lines that had to cross are not routed again in a new order (the
   rip-up and reroute pass, layered.js), for a type whose edits must be quick (risks.md P1); a map never sets it. */
function layoutTyped(dg, memo) {
  const key = memo && geometryKey(dg);
  if (memo && memo.key === key) { const g = repaint(memo.g, memo.dg, dg); memo.dg = dg; return g; }
  const t = { ...dg, typed: true }, g = dg.direction === 'down'
    ? transpose(layoutGraph({ ...t, turned: true, nodes: (dg.nodes || []).map(n => ({ ...n, w: n.h || dg.nodeH || 64, h: n.w || NW })) }, false))
    : layoutGraph(t, false);
  if (memo) Object.assign(memo, { key, g, dg, runs: (memo.runs || 0) + 1 });
  return g;
}

/* Ports on borders and lines from a box's port inward (work package 5.1, notes/stage-5.md §4, §5, §7, §9.3). The fields a
   typed view's layout input may carry for them, optional and provisional, none of them read on a map (registry.js points here):
   - a line's fromPort and toPort: the port (any name, the type's id for it) its from or to end leaves by, on the border of the
     node or box it names. The type gives every line of a port the port's side as its fromSide or toSide (§4.2); the router
     never moves it (the side cap's move is undone here), and the ends of one port sit side by side on one square
   - a line's inner: 'from' or 'to', the end on a box that leaves the box's port inward, to something the box holds (a
     delegation, §5): the line is not refused for joining a box and what it holds; that end's fromSide or toSide is the way it
     leaves (a port on the left border leaves right) and its point is on the port's own border
   - a line's portRank: the port's place in its owner's members, breaking ties in the order of ports along a side; a number,
     or [from, to] for a line with a port at each end
   - a box's pad: its padding in px where it is more than stage 2's 12 (48 where it or a box it holds has ports with lines, §7);
     a box's round: true grows its frame by √2 about its centre, so the ellipse drawn in it holds its contents (§9.3)
   - a view's labelGaps: true lays the view out once more where a line's label found no spot, was cut short or sits on a box's
     border, with the column gap it needs widened by the label's width (a map's labelRoom, layered.js; column gaps only, as a
     typed view's rows are of mixed height); kept if it has fewer issues and labels cut short (§8). The component and
     deployment types set it (5.4, 5.5); a view without it lays out as before
   Out of the layout, each line with a port has e.fpb and e.tpb, its port's box at each end: 12 px across the border, centred
   on it, and 12 + 10 (k - 1) px along it for k lines on one face. A view with ports passes repair: false (risks.md P1): port
   repair would swap a port's end with another line's.
   placePorts(sides, turned), from LP.ports: every end that names a port leaves its side's list for the border its port is on,
   with the other ends on that border, each a group of one; the groups are ordered by the mean of their far ends along the
   border, ties by portRank, and spread over the border's free span (a box's: below its title, off its corners, as layoutPass
   spreads a box's ends), 8 px apart (down to 4 where they do not fit, and a warning where they still leave the side),
   centred; a port's ends 10 px apart on each face */
const PORT_SIDE = { left: 'L', right: 'R', top: 'T', bottom: 'B' }, PORT_OPP = { L: 'R', R: 'L', T: 'B', B: 'T' };
function placePorts(sides, turned) {
  const hot = new Map(), at = (n, side) => { const k = n.id + '|' + side; if (!hot.has(k)) hot.set(k, { n, side, ends: [] }); return hot.get(k).ends; };
  Object.entries(sides).forEach(([key, list]) => { sides[key] = list.filter(it => { const { e, n } = it, from = n === e.s && (e.s !== e.t || key.endsWith('|R')), port = from ? e.fromPort : e.toPort;
    if (port == null) return true;
    const leave = PORT_SIDE[from ? e.fromSide : e.toSide] || key.slice(-1), inner = e.inner === (from ? 'from' : 'to');
    e[from ? 'fs' : 'ts'] = leave; at(n, inner ? PORT_OPP[leave] : leave).push({ ...it, from, port, inner }); return false; }); });
  hot.forEach((H, k) => { (sides[k] || []).forEach(it => H.ends.push({ ...it, from: it.n === it.e.s && (it.e.s !== it.e.t || k.endsWith('|R')) })); delete sides[k]; });
  Object.keys(sides).forEach(k => { if (!sides[k].length) delete sides[k]; });
  hot.forEach(H => spreadPorts(H, turned));
}
function spreadPorts({ n, side, ends }, turned) {
  const v = side === 'L' || side === 'R', a0 = v ? n.y : n.x, len = v ? n.h : n.w, far = x => v ? x.other.y + x.other.h / 2 : x.other.x + x.other.w / 2;
  const rank = x => { const r = x.e.portRank; return (Array.isArray(r) ? r[x.from ? 0 : 1] : r) ?? 1e9; }, byFar = (a, b) => far(a) - far(b), groups = [];
  ends.forEach(x => { const g = x.port != null && groups.find(o => o.port === x.port); if (g) g.ends.push(x); else groups.push({ port: x.port, ends: [x] }); });
  groups.forEach(g => { g.faces = [g.ends.filter(x => !x.inner).sort(byFar), g.ends.filter(x => x.inner).sort(byFar)];
    g.at = g.ends.reduce((a, x) => a + far(x), 0) / g.ends.length; g.L = g.port == null ? 2 : 2 + 10 * Math.max(...g.faces.map(f => f.length)); });
  groups.sort((a, b) => a.at - b.at || rank(a.ends[0]) - rank(b.ends[0]));
  let lo = a0 + 8, hi = a0 + len - 8;
  if (n.box) { const across = turned ? !v : v; // as layoutPass spreads a box's ends: below the title on a side, off the title and corners elsewhere
    lo = across ? a0 + 40 : Math.max(a0 + 20, turned && side === 'L' ? n.y + n.hd + 16 : -Infinity, ...(side === 'T' ? n.decoT : []).map(([x, w]) => x + w + 8));
    hi = a0 + len - (across ? 16 : 20); }
  const sum = groups.reduce((a, g) => a + g.L, 0), k = groups.length - 1, gap = k ? Math.max(4, Math.min(8, (hi - lo - sum) / k)) : 0;
  if (sum + gap * k > (n.box ? hi - lo : len)) warn(`the ports on the ${Object.keys(PORT_SIDE).find(w => PORT_SIDE[w] === (turned ? SIDE_T[side] : side))} side of "${n.id}" do not fit it: they need ${Math.ceil(sum + gap * k)} px, it has ${Math.floor(n.box ? hi - lo : len)}`);
  const B = side === 'L' ? n.x : side === 'R' ? n.x + n.w : side === 'T' ? n.y : n.y + n.h;
  let s = (lo + hi - sum - gap * k) / 2;
  groups.forEach(g => { const box = v ? { x: B - 6, y: s, w: 12, h: g.L } : { x: s, y: B - 6, w: g.L, h: 12 };
    g.faces.forEach(face => face.forEach((x, j) => { const c = g.port == null ? s + 1 : s + 6 + 10 * j;
      x.e[x.from ? 'p1' : 'p2'] = v ? [B, c] : [c, B]; if (g.port != null) x.e[x.from ? 'fpb' : 'tpb'] = { ...box }; }));
    s += g.L + gap; });
}
// A typed view's box as frameOf measured it with stage 2's 12 px of padding: its pad widens that on every side, and round
// grows it by √2 about its centre (above). Neither: the box as it was
TYPED.frame = b => { const d = b.pad > 12 ? b.pad - 12 : 0, k = b.round ? Math.SQRT2 : 1; if (!d && k === 1) return b;
  const w = (b.w + 2 * d) * k, h = (b.h + 2 * d) * k; return Object.assign(b, { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h }); };

// A typed view's lines from a node to itself (risks.md F1) are loops round its top right corner, nested, the first innermost:
// each one's top run D px above the node, its label on that run clear of the node's stub room and of the loop inside; its
// right run R px right of the node, far enough for the top run to hold the label. out: how far each loop's port on the
// node's top lies left of its right side (0 before ports are known, for the room: above the node's row, right of its column)
const loopDims = (dg, STUB, SEP) => (list, out) => { let D = 0, R = 0, half = 0;
  return list.map((e, k) => { const lw = e.label || e.step != null ? labelW(e) : 0, [bw, bh] = dg.turned ? [lw && 18, lw] : [lw, lw && 18];
    D = k ? D + half + bh / 2 + 10 : STUB + 6 + bh / 2; half = bh / 2;
    R = Math.max(k ? R + 2 * SEP : STUB + 4, bw + 12 - out[k]); return { D, R, top: D + half }; }); };
// layoutPass's loops (LP): fills loops (by node id, the lines from it to itself) and makes room for them; then mark(edges),
// each such line routed here, not by the router; ports(pushSide, sides): the top port of the node's right side and the right port
// of its top, the inner loop the nearer the corner, then the ends of lines that name a port (placePorts, above); route(): each
// loop out of the right side, up, left and down into the top, and its corners, which the other routes keep SEP px off, so none
// touches it or turns where it does
TYPED.loops = (loops, dg, { byId, extraX, extraY, STUB, RG, CG, SEP, gapAfter }) => {
  const dims = loopDims(dg, STUB, SEP); let edges = [];
  (dg.edges || []).forEach(e => { if (e.from === e.to && byId[e.from]) (loops[e.from] ||= []).push(e); });
  Object.entries(loops).forEach(([id, list]) => { const n = byId[id], d = dims(list, list.map(() => 0)).at(-1);
    extraY[n.row - .5] = Math.max(extraY[n.row - .5] || 0, d.top + STUB + 7 - RG);
    extraX[n.col] = Math.max(extraX[n.col] || 0, d.R + STUB + 6 - Math.max(CG, gapAfter[n.col] || 0)); });
  // a port with k lines on one face (5.1) needs k tracks between its stubs and the next column's (row's): room beside it. A
  // box's port: beside the column (row) of its cards its border faces, and its pad more
  const boxes = dg.containers || [], inBox = (id, seen = new Set()) => seen.has(id) ? [] : (seen.add(id), boxes.filter(f => f.id === id)
    .flatMap(f => [...(f.nodeIds || []).map(i => byId[i]).filter(Boolean), ...boxes.filter(c => c.parent === id).flatMap(c => inBox(c.id, seen))]));
  const busy = {}; (dg.edges || []).forEach(e => [[e.from, e.fromPort, e.fromSide, 'from'], [e.to, e.toPort, e.toSide, 'to']].forEach(([id, p, side, end]) => {
    if (p != null && e.inner !== end && PORT_SIDE[side]) { const k = id + '|' + PORT_SIDE[side] + '|' + p; busy[k] = (busy[k] || 0) + 1; } }));
  Object.entries(busy).forEach(([k, m]) => { const [id, side] = k.split('|'), ns = byId[id] ? [byId[id]] : inBox(id); if (m < 2 || !ns.length) return;
    const need = m * SEP + 2 * STUB + 8 + (byId[id] ? 0 : Math.max(12, ...boxes.filter(f => f.id === id).map(f => f.pad || 0))), at = x => ns.map(n => n[x]);
    if (side === 'R' || side === 'L') { const c = side === 'R' ? Math.floor(Math.max(...at('col'))) : Math.ceil(Math.min(...at('col'))) - 1; extraX[c] = Math.max(extraX[c] || 0, need - Math.max(CG, gapAfter[c] || 0)); }
    else { const r = side === 'B' ? Math.max(...at('row')) + .5 : Math.min(...at('row')) - .5; extraY[r] = Math.max(extraY[r] || 0, need - RG); } });
  const loopsOf = n => edges.filter(e => e[OWN_ROUTE] === 'loop' && e.s === n);
  return {
    mark(all) { edges = all; edges.forEach(e => { if (e.s === e.t) Object.assign(e, { [OWN_ROUTE]: 'loop', fixed: true, fs: 'R', ts: 'T', stubs: [], how: 'self' }); }); }, // its loop is drawn once its ports are known
    ports(pushSide, sides) { edges.filter(e => e[OWN_ROUTE] === 'loop').forEach(e => { const n = e.s, k = loopsOf(n).indexOf(e);
      pushSide(n, 'R', e, { x: n.x + n.w, y: -1e6 + k, w: 0, h: 0 }); pushSide(n, 'T', e, { x: 1e6 - k, y: n.y, w: 0, h: 0 }); });
      if (sides) placePorts(sides, dg.turned); },
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
