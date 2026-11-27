import { TYPED } from '../core/registry.js';
import { warn } from '../core/warn.js';
import { MAIN_SIDE, NW, OWN_ROUTE, PLAIN, SPAN, TURNS, labelW, layoutGraph } from '../layout/layered.js';
import { leaveIssues, overlapIssues, routeAudit, throughIssues } from '../layout/audit.js';

/* A typed view's layout (work package 1.4): layoutGraph's plain layout with what a typed view needs, none of it on a map.
   The parts of layoutPass only a typed view takes are here too (TYPED, registry.js); only lib/umlimator-all.js holds this
   file, as a map never reaches it (risks.md C5).
   Rows as tall as their tallest node (stage 1 note §4); a line from a node to itself drawn as a loop (risks.md F1); lines
   between one pair each with its own ports and label (F2); `direction: "down"` (note §6); and a memo that lays the view out
   again only when its geometry changed (F7). Nodes come with their sizes, `w` and `h`, which their shapes give (1.5). */

// what moves a typed view's geometry: every field of the view layoutGraph reads but VIEW_PAINT (a test holds the two lists to
// layered.js), and these of a node and a line. Anything else (a colour, a `props` field) only repaints
const VIEW_GEO = ['abs', 'authors', 'blocks', 'containers', 'direction', 'drawn', 'fan', 'flipped', 'gap', 'groups', 'hub', 'intake', 'labelGaps', 'laneGap', 'lanes', 'mainSteps', 'nest', 'nodeH', 'noSwap', 'quick', 'repair', 'reroute', 'rgap', 'shutBoxes', 'sideSwap', 'turned', 'typed'];
const VIEW_PAINT = ['tour', 'subAndChips'], NODE_GEO = ['id', 'col', 'row', 'w', 'h', 'ax', 'ay'], EDGE_GEO = ['id', 'from', 'to', 'label', 'step', 'fromSide', 'toSide', 'back', 'fixed', 'sublabel', 'cut', 'fromPort', 'toPort', 'inner', 'portRank', 'portMin'];
const geometryKey = dg => JSON.stringify([VIEW_GEO.map(k => dg[k]), (dg.nodes || []).map(n => NODE_GEO.map(k => n[k])), (dg.edges || []).map(e => EDGE_GEO.map(k => e[k]))]);

// direction "down": laid out left to right with every box turned, then turned back, x for y and the sides L for T, R for B
const SIDE_T = { L: 'T', T: 'L', R: 'B', B: 'R' }, swapXY = p => [p[1], p[0]];
const flipBox = r => { if (r) [r.x, r.y, r.w, r.h] = [r.y, r.x, r.h, r.w]; };
function transpose(g) {
  g.down = true; // the canvas's drops and Alt + arrows read its columns down
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
function layoutTyped(dg0, memo) {
  // an arranged view's lines by their part in the flow (memo.flow, set by the host, src/map/context.js: layout-flow.md section
  // 12 step 10): a main line takes the middle port of its sides, a dependency line is routed after the flow lines, as a map's
  // and a main card is centred on its row, so main lines between cards of other heights run straight (layoutPass)
  // a snake's (memo.flow's run and dir): each main card's run and each line's reading way, which the route audit and the score read
  const F = memo && memo.flow, R = F && F.run, dg = F ? { ...dg0, nodes: (dg0.nodes || []).map(n => (F.cards && F.cards.has(n.id) ? { ...n, mainCard: true, ...(R && R[n.id] != null && { run: R[n.id] }) } : n)),
    edges: (dg0.edges || []).map(e => { const k = e._id ?? e.id, m = F.main.has(k), d = F.dep.has(k), w = F.dir && F.dir.get(k);
      return m || d || w ? { ...e, ...(m && { mainLine: true }), ...(d && { dep: true }), ...(w && { dir: w }) } : e; }) } : dg0;
  const key = memo && geometryKey(dg);
  if (memo && memo.key === key) { const g = repaint(memo.g, memo.dg, dg); memo.dg = dg; return g; }
  const t = { ...dg, typed: true, noSwap: !!(memo && memo.noSwap) }, lay = u => { const g = dg.direction === 'down'
    ? transpose(layoutGraph({ ...u, turned: true, nodes: (dg.nodes || []).map(n => ({ ...n, w: n.h || dg.nodeH || 64, h: n.w || NW })) }, false))
    : layoutGraph(u, false); unhook(g, dg.mainSteps ? 12 : 18); return g; };
  // a layout that took audit 38's ways (nesting the lines between one pair, a box grown for them, a route that meets its end's
  // stub from the side) and that check() still has more than crossings to say of: the view is laid out as before them too, and
  // the one with fewer such issues kept (then fewer in all), so none is drawn worse than it was
  // Each is judged as buildGeo will draw it (context.js): one that kept the request/reply port swap, in a view of up to 30
  // cards, laid out once more without it and the better of the two taken (audit 39: the layout as before, judged with its swap,
  // lost to the nested one by two crossings, and without the swap it had one fewer than that)
  // (each judged with its boxes as the type draws them, dg.drawn: a state's regions stretched across it, audit 44)
  const seen = h => (typeof dg.drawn === 'function' && (h.families || []).length ? { ...h, families: dg.drawn(h.nodes, h.families) || h.families } : h);
  const said = h0 => { const h = seen(h0), is = [...routeAudit(h, ''), ...throughIssues(h, '')]; return [is.filter(s => !/ cross$/.test(s)).length, is.length]; };
  const less = (b, a) => b[0] < a[0] || (b[0] === a[0] && b[1] < a[1]);
  // [layout, laid out without the swap too]: buildGeo need not try that one again
  // a layout whose lines to one card took its top and bottom by turns though the card has other lines (layoutPass, audit 39) is
  // laid out without those turns too, and that one kept when check() has less to say of it (audit 40: laid out right, the turns
  // of two lines into a composite crossed the lines between its state and the state beside it, twice)
  // a layout with a box side grown over its title (layoutPass, audit 44) is laid out without that too, and kept only when check()
  // has less to say of it; one whose main line kept its side of a card one port high (layoutPass, audit 68) is laid out with the
  // main line moved as before too, and that one kept when check() has less to say of it
  const best = u => { let g = lay(u), tried = false;
    if (g.grew) { const v = { ...u, [SPAN]: true }, h = lay(v); if (!less(said(g), said(h))) { g = h; u = v; } }
    if (g.turns) { const v = { ...u, [TURNS]: true }, h = lay(v); if (less(said(h), said(g))) { g = h; u = v; } }
    if (g.kept) { const v = { ...u, [MAIN_SIDE]: true }, h = lay(v); if (less(said(h), said(g))) { g = h; u = v; } }
    if (g.nested) { const a0 = said(g);
      const judged = (v, h = lay(v), b = said(h)) => { if (!memo || v.noSwap || !h.rr || (h.nodes || []).length > 30) return [h, b, false];
        const h2 = lay({ ...v, noSwap: true }), b2 = said(h2); return less(b2, b) ? [h2, b2, true] : [h, b, true]; };
      if (a0[0] || a0[1]) { const n = judged(u, g, a0), p = judged({ ...u, [PLAIN]: true }), w = less(p[1], n[1]) ? p : n; g = w[0]; tried = w[2]; } }
    return [g, tried]; };
  // a view whose port ends followed the far ports' places (spreadPorts, audit 39) is laid out with them in their own ports' order
  // too, as up to 0.41, and that one is kept unless following has no more crossings and no more other issues (check()'s), so
  // following them never draws a view worse
  let [g, tried] = best(t);
  if (g.edges.some(e => e[FOLLOWED])) { const told = h0 => { const h = seen(h0), is = [...overlapIssues(h, ''), ...routeAudit(h, ''), ...throughIssues(h, ''), ...leaveIssues(h, '')], k = is.filter(s => / cross$/.test(s)).length; return [k, is.length - k]; };
    const a = told(g); if (a[0] || a[1]) { const [h, ht] = best({ ...t, [PORTS_PLAIN]: true }), b = told(h); if (a[0] > b[0] || a[1] > b[1]) { g = h; tried = ht; } } }
  // main cards centred on their row (an arranged view's, memo.flow) are laid out top-aligned too, and that kept when check()
  // has less to say of it: a centred event can push a line into a crossing (tests/bpmn-stress.json's edge cases)
  if (F && (t.nodes || []).some(n => n.mainCard)) { const [h, ht] = best({ ...t, nodes: t.nodes.map(n => (n.mainCard ? { ...n, mainCard: false } : n)) }); if (less(said(h), said(g))) { g = h; tried = ht; } }
  if (memo) Object.assign(memo, { key, g, dg, runs: (memo.runs || 0) + 1, rr: !!g.rr && !tried });
  return g;
}

/* A route that steps back near a turn (audit 25): two stretches the opposite way round one shorter than a stub, an S-shaped
   notch the router's grid leaves where it meets an end's stub. Each is folded by moving one stretch onto another's line: the
   one between (the two opposite stretches each shorter by the less of them), one of the two opposite ones onto the other's
   (the one between gone), or the stretch before or after them onto the one between (the stretch that steps back gone). A fold is kept when it moves neither end nor the way a line leaves or
   meets its card, leaves the first and last stretches a stub long (or as long as they were), takes the route through no card
   it did not cross, takes no label off its line, and gives check() nothing new to say of that line; then the next. A forward
   stair, two stretches the same way round one shorter than a stub, is folded the same way where it is the last turns before
   an end (audit 26: the shipped container view's Order worker to Database, 10 px across and 7 px up into the card) */
const UH_EQ = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
const uhDir = (p, q) => [Math.sign(Math.round((q[0] - p[0]) * 1e6)), Math.sign(Math.round((q[1] - p[1]) * 1e6))];
const uhLen = (p, q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
// the points with no repeats and no point between two stretches along one line
const uhTidy = pts => { const o = [];
  for (const q of pts) { if (o.length && UH_EQ(o[o.length - 1], q)) continue;
    if (o.length >= 2) { const a = o[o.length - 2], b = o[o.length - 1]; if ((Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - q[0]) < 1e-6) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - q[1]) < 1e-6)) { o[o.length - 1] = q; continue; } }
    o.push(q); }
  return o; };
// the stretches k between two opposite ones, k shorter than a stub; and between two the same way next to an end's stretch
const uhAt = (p, stub) => { const o = []; for (let k = 1; k + 2 < p.length; k++) { const a = uhDir(p[k - 1], p[k]), c = uhDir(p[k + 1], p[k + 2]);
  if ((a[0] || a[1]) && uhLen(p[k], p[k + 1]) < stub && ((a[0] === -c[0] && a[1] === -c[1]) || (a[0] === c[0] && a[1] === c[1] && (k === 2 || k === p.length - 4)))) o.push(k); } return o; };
// stretch k (points k and k + 1) moved onto the line through point q, along the other axis
const uhMove = (p, k, q) => { const o = p.map(x => [...x]), ax = Math.abs(p[k][1] - p[k + 1][1]) < 1e-6 ? 1 : 0; o[k][ax] = q[ax]; o[k + 1][ax] = q[ax]; return o; };
const uhIn = (a, b, r) => Math.max(a[0], b[0]) > r.x + 0.5 && Math.min(a[0], b[0]) < r.x + r.w - 0.5 && Math.max(a[1], b[1]) > r.y + 0.5 && Math.min(a[1], b[1]) < r.y + r.h - 0.5;
// (each card grown by 7 px: a port drawn later on its border stands 6 px out of it, and a fold ran through one, audit 25)
// and each port box a line ends in (e.fpb, e.tpb), grown by 2 px, so no fold runs through a port with lines either (audit 26)
const uhGrow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
const uhCards = (g, p) => [...(g.nodes || []).map(n => [n, 7]), ...(g.edges || []).flatMap(e => [e.fpb, e.tpb]).filter(b => b && typeof b.x === 'number').map(b => [b, 2])]
  .filter(([r, d]) => p.slice(1).some((b, i) => uhIn(p[i], b, uhGrow(r, d)))).map(([r]) => r);
const uhNear = (p, L) => Math.min(...p.slice(1).map((b, i) => { const a = p[i], x = Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), L.x + L.w / 2)), y = Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), L.y + L.h / 2));
  return Math.max(0, Math.abs(x - L.x - L.w / 2) - L.w / 2) + Math.max(0, Math.abs(y - L.y - L.h / 2) - L.h / 2); }));
function unhook(g, stub) {
  for (const e of g.edges || []) {
    if (e.fixed || e.from === e.to || !Array.isArray(e.pts) || e.pts.length < 4 || e.pts.some((b, i) => i && e.pts[i - 1][0] !== b[0] && e.pts[i - 1][1] !== b[1])) continue;
    for (let round = 0; round < 6; round++) {
      const p = e.pts, ks = uhAt(p, stub); if (!ks.length) break;
      const n = p.length - 1, first = uhLen(p[0], p[1]), last = uhLen(p[n - 1], p[n]), d0 = uhDir(p[0], p[1]), d1 = uhDir(p[n - 1], p[n]);
      let was = null, cards = null, got = null;
      for (const k of ks) { const a = uhLen(p[k - 1], p[k]), c = uhLen(p[k + 1], p[k + 2]);
        const tries = [uhMove(p, k, a <= c ? p[k - 1] : p[k + 2]), ...(k - 1 >= 1 ? [uhMove(p, k - 1, p[k + 1])] : []), ...(k + 1 <= n - 2 ? [uhMove(p, k + 1, p[k])] : []),
          ...(k - 2 >= 1 ? [uhMove(p, k - 2, p[k])] : []), ...(k + 2 <= n - 2 ? [uhMove(p, k + 2, p[k])] : [])];
        for (const t of tries.map(uhTidy)) { const m = t.length - 1;
          if (m < 1 || !UH_EQ(t[0], p[0]) || !UH_EQ(t[m], p[n]) || uhAt(t, stub).length >= ks.length) continue;
          const e0 = uhDir(t[0], t[1]), e1 = uhDir(t[m - 1], t[m]);
          if (e0[0] !== d0[0] || e0[1] !== d0[1] || e1[0] !== d1[0] || e1[1] !== d1[1] || uhLen(t[0], t[1]) < Math.min(stub, first) || uhLen(t[m - 1], t[m]) < Math.min(stub, last)) continue;
          if (e.lbl && uhNear(t, e.lbl) > uhNear(p, e.lbl) + 0.5) continue;
          cards ||= uhCards(g, p); if (uhCards(g, t).some(x => !cards.includes(x))) continue;
          if (was == null) was = new Set(routeAudit(g, '', new Set([e])));
          e.pts = t; if (routeAudit(g, '', new Set([e])).every(x => was.has(x))) { got = t; break; } e.pts = p; }
        if (got) break; }
      if (!got) break;
    }
  }
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
   - a line's portMin: the least length in px of its port's box along the border (milestone 4b's boundary event, a 32 px
     circle: notes/milestone-4b.md §6.2), its ends centred in it; a number, or [from, to] as portRank. None: 2 + 10 k px
   - a box's pad: its padding in px where it is more than stage 2's 12 (48 where it or a box it holds has ports with lines, §7);
     a box's round: true grows its frame by √2 about its centre, so the ellipse drawn in it holds its contents (§9.3)
   - a box's head: px of header room over stage 2's 24, on the side its title is on (the top; laid out down, the left, which
     becomes the top): a second line of title, a keyword above the name (the deployment type's, decision of 13 Nov 2026);
     its two lines go in the box's kw and name, and its title (both lines) is measured at their 12 px (layered.js headW)
   - a view's labelGaps: true lays the view out once more where a line's label found no spot, was cut short or sits on a box's
     border, with the column gap it needs widened by the label's width (a map's labelRoom, layered.js; column gaps only, as a
     typed view's rows are of mixed height; laid out down, the picture's row gaps, by the label's height, so fewer labels
     gain room); kept if it has fewer issues and labels cut short (§8). The component and
     deployment types set it (5.4, 5.5); a view without it lays out as before
   Out of the layout, each line with a port has e.fpb and e.tpb, its port's box at each end: 12 px across the border, centred
   on it, and 12 + 10 (k - 1) px along it for k lines on one face. A view with ports passes repair: false (risks.md P1): port
   repair would swap a port's end with another line's.
   placePorts(sides, turned), from LP.ports: every end that names a port leaves its side's list for the border its port is on,
   with the other ends on that border, each a group of one; the groups are ordered by the mean of their far ends along the
   border, ties as spreadPorts orders them, and spread over the border's free span (a box's: below its title, off its corners, as layoutPass
   spreads a box's ends), 8 px apart (down to 4 where they do not fit, and a warning where they still leave the side),
   centred; a port's ends 10 px apart on each face */
const PORT_SIDE = Object.assign(Object.create(null), { left: 'L', right: 'R', top: 'T', bottom: 'B' }), PORT_OPP = { L: 'R', R: 'L', T: 'B', B: 'T' };
function placePorts(sides, turned, plain) {
  const hot = new Map(), at = (n, side) => { const k = n.id + '|' + side; if (!hot.has(k)) hot.set(k, { n, side, ends: [] }); return hot.get(k).ends; };
  Object.entries(sides).forEach(([key, list]) => { sides[key] = list.filter(it => { const { e, n } = it, from = n === e.s && (e.s !== e.t || key.endsWith('|R')), port = from ? e.fromPort : e.toPort;
    if (port == null) return true;
    const leave = PORT_SIDE[from ? e.fromSide : e.toSide] || key.slice(-1), inner = e.inner === (from ? 'from' : 'to');
    e[from ? 'fs' : 'ts'] = leave; at(n, inner ? PORT_OPP[leave] : leave).push({ ...it, from, port, inner }); return false; }); });
  hot.forEach((H, k) => { (sides[k] || []).forEach(it => H.ends.push({ ...it, from: it.n === it.e.s && (it.e.s !== it.e.t || k.endsWith('|R')) })); delete sides[k]; });
  Object.keys(sides).forEach(k => { if (!sides[k].length) delete sides[k]; });
  // in order of node id, so a node's ends to a node whose id sorts earlier can follow where that node's ports were put (audit 39)
  const placed = new Map(), id = H => String(H.n.id);
  [...hot.values()].sort((a, b) => id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0).forEach(H => spreadPorts(H, turned, placed, plain));
}
// ends whose far ends are level (two parts joined by several lines) tie on far. Ordered by their own ports' ranks alone (as up
// to 0.41), a side draws an X wherever the two types list their ports in opposite orders (audit 38), and following the far
// port's rank drew one where the far side had not put its ports in rank order (audit 39: one of them also had a line elsewhere).
// So the nodes are spread in order of id, and an end whose far end was already put on a parallel border follows where it was
// put; then its own port's rank; then, for two lines from one port to two ports of one part, the far ports' ranks (audit 39).
// Where that orders a side otherwise than the ranks alone, its ends are marked FOLLOWED and layoutTyped lays the view out the
// old way too (PORTS_PLAIN), keeping the one check() has less to say of
const FOLLOWED = Symbol('followed'), PORTS_PLAIN = Symbol('portsPlain');
function spreadPorts({ n, side, ends }, turned, placed, plain) {
  const v = side === 'L' || side === 'R', a0 = v ? n.y : n.x, len = v ? n.h : n.w, far = x => v ? x.other.y + x.other.h / 2 : x.other.x + x.other.w / 2;
  const per = (x, r) => Array.isArray(r) ? r[x.from ? 0 : 1] : r, least = x => { const m = per(x, x.e.portMin); return Number.isFinite(m) ? m : 0; };
  const at = x => { const p = x.other && x.other !== n && placed.get(x.e)?.[x.from ? 'to' : 'from']; return p && p.v === v ? p.c : null; };
  const rk = r => Number.isFinite(r) ? r : 1e9, own = x => rk(per(x, x.e.portRank)), farRank = x => rk(Array.isArray(x.e.portRank) ? x.e.portRank[x.from ? 1 : 0] : null);
  const follow = (a, b) => { const p = at(a), q = at(b); return (p != null && q != null ? p - q : 0) || own(a) - own(b) || farRank(a) - farRank(b); };
  const groups = [];
  ends.forEach(x => { const g = x.port != null && groups.find(o => o.port === x.port); if (g) g.ends.push(x); else groups.push({ port: x.port, ends: [x] }); });
  // three or more named lines inward from one port (a composite's delegations) sit 28 px apart, so each one's label keeps clear of
  // the next line: 10 px apart, the first one's label shut the second out of the gap between the parts, and it went round and crossed (audit 6)
  const pitch = f => f.filter(x => x.inner && x.e.label).length > 2 ? 28 : 10;
  // of a port's inward lines, two whose far ends are level (a part behind a part): the one farther off goes round the nearer one's part, so it
  // takes the outer place, the first on the low side of the lines' middle, the last on the high side
  const deep = x => v ? Math.abs(x.other.x + x.other.w / 2 - n.x) : Math.abs(x.other.y + x.other.h / 2 - n.y);
  const order = fw => { const t = fw ? follow : () => 0, byFar = (a, b) => far(a) - far(b) || t(a, b);
    const named = f => { const mid = f.reduce((a, x) => a + far(x), 0) / f.length;
      return f.sort((a, b) => far(a) - far(b) || (far(a) <= mid ? deep(b) - deep(a) : deep(a) - deep(b)) || t(a, b)); };
    return [...groups].sort((a, b) => a.at - b.at || (fw ? follow : (x, y) => own(x) - own(y))(a.ends[0], b.ends[0]))
      .map(g => ({ g, faces: [g.ends.filter(x => !x.inner).sort(byFar), named(g.ends.filter(x => x.inner).sort(byFar))] })); };
  groups.forEach(g => g.at = g.ends.reduce((a, x) => a + far(x), 0) / g.ends.length);
  const was = order(false), now = order(true), key = o => o.flatMap(({ faces }) => faces.flat()).map(x => ends.indexOf(x)).join();
  if (key(was) !== key(now)) ends.forEach(x => x.e[FOLLOWED] = true);
  (plain ? was : now).forEach(({ g, faces }, j) => { g.faces = faces; groups[j] = g; });
  groups.forEach(g => { g.need = g.port == null ? 2 : 2 + Math.max(...g.faces.map(f => pitch(f) * f.length));
    g.L = g.port == null ? 2 : Math.max(g.need, ...g.ends.map(least)); });
  let lo = a0 + 8, hi = a0 + len - 8;
  if (n.box) { const across = turned ? !v : v; // as layoutPass spreads a box's ends: below the title on a side, off the title and corners elsewhere
    lo = across ? a0 + 40 : Math.max(a0 + 20, turned && side === 'L' ? n.y + n.hd + 16 : -Infinity, ...(side === 'T' ? n.decoT : []).map(([x, w]) => x + w + 8));
    hi = a0 + len - (across ? 16 : 20); }
  const sum = groups.reduce((a, g) => a + g.L, 0), k = groups.length - 1, gap = k ? Math.max(4, Math.min(8, (hi - lo - sum) / k)) : 0;
  if (sum + gap * k > (n.box ? hi - lo : len)) warn(`the ports on the ${Object.keys(PORT_SIDE).find(w => PORT_SIDE[w] === (turned ? SIDE_T[side] : side))} side of "${n.id}" do not fit it: they need ${Math.ceil(sum + gap * k)} px, it has ${Math.floor(n.box ? hi - lo : len)}`);
  const B = side === 'L' ? n.x : side === 'R' ? n.x + n.w : side === 'T' ? n.y : n.y + n.h;
  let s = (lo + hi - sum - gap * k) / 2;
  groups.forEach(g => { const box = v ? { x: B - 6, y: s, w: 12, h: g.L } : { x: s, y: B - 6, w: g.L, h: 12 };
    g.faces.forEach(face => face.forEach((x, j) => { const c = g.port == null ? s + 1 : s + (g.L - g.need) / 2 + 6 + pitch(face) * j;
      x.e[x.from ? 'p1' : 'p2'] = v ? [B, c] : [c, B]; if (g.port != null) x.e[x.from ? 'fpb' : 'tpb'] = { ...box };
      if (!placed.has(x.e)) placed.set(x.e, {}); placed.get(x.e)[x.from ? 'from' : 'to'] = { c, v }; }));
    s += g.L + gap; });
}
// A typed view's box as frameOf measured it with stage 2's 12 px of padding and 24 px of header room: its head grows the
// header room (turned: laid out down), its pad widens the padding on every side, and round grows it by √2 about its centre
// (above). None of them: the box as it was
TYPED.frame = (b, turned) => { const d = b.pad > 12 ? b.pad - 12 : 0, k = b.round ? Math.SQRT2 : 1, t = b.head > 0 ? b.head : 0;
  if (t) Object.assign(b, turned ? { x: b.x - t, w: b.w + t } : { y: b.y - t, h: b.h + t });
  if (!d && k === 1) return b;
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
    // how far a node's loops reach: above its top (to the outer label's far side) and right of its right side (audit 26: a box laid
    // out down holds them, so a loop and its label keep inside the box that holds the node)
    reach(id) { const list = loops[id]; if (!list) return null; const d = dims(list, list.map(() => 0)).at(-1); return { top: d.top, right: d.R }; },
    mark(all) { edges = all; edges.forEach(e => { if (e.s === e.t) Object.assign(e, { [OWN_ROUTE]: 'loop', fixed: true, fs: 'R', ts: 'T', stubs: [], how: 'self' }); }); }, // its loop is drawn once its ports are known
    ports(pushSide, sides) { edges.filter(e => e[OWN_ROUTE] === 'loop').forEach(e => { const n = e.s, k = loopsOf(n).indexOf(e);
      pushSide(n, 'R', e, { x: n.x + n.w, y: -1e6 + k, w: 0, h: 0 }); pushSide(n, 'T', e, { x: 1e6 - k, y: n.y, w: 0, h: 0 }); });
      if (sides) placePorts(sides, dg.turned, !!dg[PORTS_PLAIN]); },
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
TYPED.fan = (free, { simplify, through, STUB, SEP, families = [], heads = [], nest = false }) => { const pairs = new Map(), lr = e => e.fs === 'R' ? [e.p1, e.p2] : [e.p2, e.p1]; let held = false;
  free.forEach(e => { const [l, r] = e.fs === 'R' ? [e.s, e.t] : [e.t, e.s], k = l.id + '\u0001' + r.id;
    if (/^(RL|LR)$/.test(e.fs + e.ts) && l.x + l.w < r.x) pairs.set(k, [...(pairs.get(k) || []), e]); });
  pairs.forEach(list => { if (list.length < 2 || !list.some(e => e.label || e.step != null)) return;
    list.sort((a, b) => lr(a)[0][1] - lr(b)[0][1]); if (list.some((e, i) => i && lr(e)[1][1] <= lr(list[i - 1])[1][1])) return;
    const bh = list.map(e => e.label || e.step != null ? labelW(e) : 0), gaps = bh.map((h, i) => i ? Math.max(SEP, (bh[i - 1] + h) / 2 + 6) : 0);
    const mid = list.reduce((a, e) => a + lr(e)[0][1] + lr(e)[1][1], 0) / (2 * list.length), lanes = [];
    gaps.reduce((y, g, i) => (lanes[i] = y + g), mid - gaps.reduce((a, g) => a + g, 0) / 2);
    // each line's turn on each side: the k-th line turning towards its lane from the outside turns k SEP px past the stub
    // (nest: a state machine's) lines of the pair the side could not hold leave the same side past the fanned ones and go round
    // the far card: each takes a turn nearer that side than the fanned lines on its way (audit 39: laid out down, six to nine
    // transitions between a composite state and the state below it, the moved one turned where the outer fanned line did and crossed it)
    const ends = [list[0].fs === 'R' ? list[0].s : list[0].t, list[0].fs === 'R' ? list[0].t : list[0].s];
    const round = side => { const n = ends[side], sd = side ? 'L' : 'R', ys = list.map(e => lr(e)[side][1]), o = [0, 0];
      if (nest) free.forEach(e => { if (list.includes(e) || !((e.s === ends[0] && e.t === ends[1]) || (e.s === ends[1] && e.t === ends[0]))) return;
        const p = e.s === n && e.fs === sd ? e.p1 : e.t === n && e.ts === sd ? e.p2 : null; if (!p) return;
        if (p[1] < Math.min(...ys)) o[0]++; else if (p[1] > Math.max(...ys)) o[1]++; });
      return o; };
    let gave = false; const turns = side => { const at = [], o = round(side); if (o[0] || o[1]) gave = true; const up = list.map((e, i) => i).filter(i => lanes[i] < lr(list[i])[side][1]), down = list.map((e, i) => i).filter(i => lanes[i] >= lr(list[i])[side][1]).reverse();
      [up, down].forEach((g, u) => g.forEach((i, k) => { at[i] = lr(list[i])[side][0] + (side ? -1 : 1) * (STUB + (k + o[u]) * SEP); })); return at; };
    const xl = turns(0), xr = turns(1);
    if (Math.min(...xr) - Math.max(...xl) < 18 + 16) return;
    const pts = list.map((e, i) => { const [a, b] = lr(e), P = simplify([a, [xl[i], a[1]], [xl[i], lanes[i]], [xr[i], lanes[i]], [xr[i], b[1]], b]); return e.fs === 'R' ? P : P.reverse(); });
    // each lane keeps 4 px off every other card: the router's test lets a line run 2 px inside one, and a pair's second lane,
    // pushed out by the first's label, ran 1 px inside the card beyond the gap for its whole height (audit 20)
    if (list.some((e, i) => through(pts[i], e, -4))) return;
    // and each lane keeps off every box (a C4 boundary, a deployment node): it neither runs along a border (8 px, 40 px long:
    // check()'s test) nor crosses one, but where the box holds one end of it (audit 21)
    if (list.some((e, i) => families.some(f => fanBox(pts[i], f, e)))) return;
    // nor through a box's title (audit 25: a line out of a boundary ran up through "Shop [Software System]")
    if (list.some((e, i) => heads.some(h => pts[i].slice(1).some((b, k) => uhIn(pts[i][k], b, h))))) return;
    if (gave) held = true; list.forEach((e, i) => { Object.assign(e, { [OWN_ROUTE]: 'fan', fixed: pts[i], pts: pts[i], stubs: [], how: 'fan' }); free.splice(free.indexOf(e), 1); }); });
  return held; }; // (a turn held for a line round the far card: the layout took audit 38's ways, layoutTyped's PLAIN)

// a fanned path's trouble with box f: a run along one of its borders, or a crossing of one where f holds neither end or both
const fanIn = (f, n) => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
const fanBox = (pts, f, e) => pts.slice(1).some((b, i) => { const a = pts[i], v = a[0] === b[0], c = v ? a[0] : a[1], p = v ? [a[1], b[1]] : [a[0], b[0]];
  const lo = Math.max(Math.min(...p), v ? f.y : f.x), hi = Math.min(Math.max(...p), v ? f.y + f.h : f.x + f.w);
  if (hi - lo > 40 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(c - u) < 8)) return true;
  if (fanIn(f, e.s) !== fanIn(f, e.t)) return false;
  const inA = a[0] > f.x && a[0] < f.x + f.w && a[1] > f.y && a[1] < f.y + f.h, inB = b[0] > f.x && b[0] < f.x + f.w && b[1] > f.y && b[1] < f.y + f.h;
  return inA !== inB || (!inA && (v ? c > f.x && c < f.x + f.w && Math.min(...p) < f.y && Math.max(...p) > f.y + f.h : c > f.y && c < f.y + f.h && Math.min(...p) < f.x && Math.max(...p) > f.x + f.w)); });

// a type's lines, each with its path: the model's, then those written inline in the edges of the views keep(view) takes (model.md)
function typedLines(model, keep) {
  const arr = x => (Array.isArray(x) ? x : []), es = arr(model && model.edges), seen = new Set(es), out = es.map((e, i) => [e, `edges[${i}]`]);
  arr(model && model.views).forEach((v, i) => { if (v && typeof v === 'object' && keep(v)) arr(v.edges).forEach((e, k) => { if (e && typeof e === 'object' && !seen.has(e)) { seen.add(e); out.push([e, `views[${i}].edges[${k}]`]); } }); });
  return out;
}
// the lines a type derived in the model before a diff and no longer draws (audit 47: a C4 implied line, a requirement's
// containment, from an element that moved to another owner): view.diffMarks.gone, as diff() writes it, read as hostile. Each
// between two shapes the view draws (ids: the drawn ids), its geometry id one no element takes ('->' in it, model.md rule 5)
// and no line of the view's own (taken): { id, from, to, label }, the label text only
function goneLines(view, ids, taken) {
  const d = view && typeof view.diffMarks === 'object' && view.diffMarks ? view.diffMarks.gone : null, seen = new Set();
  return (Array.isArray(d) ? d : []).filter(x => x && typeof x === 'object' && typeof x.id === 'string' && x.id.includes('->') && !taken.has(x.id) && !seen.has(x.id)
    && typeof x.from === 'string' && typeof x.to === 'string' && x.from !== x.to && ids.has(x.from) && ids.has(x.to) && seen.add(x.id))
    .map(x => ({ id: x.id, from: x.from, to: x.to, ...(typeof x.label === 'string' && x.label ? { label: x.label } : {}) }));
}
export { VIEW_GEO, VIEW_PAINT, geometryKey, goneLines, layoutTyped, typedLines };
