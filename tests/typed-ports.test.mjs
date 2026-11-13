// The router for ports and inner lines (work package 5.1, notes/stage-5.md §4, §5, §7, §9.2, §9.3, §14), at the layout's
// level, with no UML code: ports on nodes and boxes, a port with four lines on one face, ports pinned to each side, an inner
// line from a box's port at each of three levels, a round box, a long label; laid out right and down. tests/typed-ports.html
// draws the same fixture in Chrome under three fonts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPED } from '../src/core/registry.js';
import { geometryKey, layoutTyped } from '../src/typed/layout.js';
import '../src/typed/draw.js';
import { layout } from '../src/map/api.js';
import { svgOf } from '../src/draw/svg.js';
import { routeAudit, overlapIssues } from '../src/layout/audit.js';
import { held } from '../src/core/warn.js';

const OPP = { L: 'R', R: 'L', T: 'B', B: 'T' };
const LONG = 'replicates every order to the warehouse ledger, nightly and on demand';
// a view's layout input with ports, as a type gives it (src/typed/layout.js says what each field means). Boxes A ⊃ B ⊃ C,
// each with a port on its left border whose line runs inward (pA to pB to pC to c1's q); ext outside into pA; hub's h4 with
// four lines on one face; sq's ports pinned to each side; two's pa and pb to one node (their order by portRank); R a round box
function FIX(o = {}) {
  const N = (id, col, row, w = 120, h = 64) => ({ id, label: id.toUpperCase(), col, row, w, h });
  const L = (id, from, to, more) => ({ id, from, to, ...more });
  return { direction: o.direction, repair: false, reroute: false, gap: 48,
    nodes: [N('ext', 0, 1), N('c1', 1, 1), N('c2', 2, 1), N('b1', 1, 2.5), N('a1', 1, 4), N('hub', 4, 0), ...[1, 2, 3, 4].map(k => N('t' + k, 5, k - 1)),
      N('sq', 4, 3.5, 140, 90), N('up', 4, 5), N('lo', 4, 6.5), N('rt', 5, 4.5), N('two', 6, 0), N('far', 7, 0), N('r1', 6, 5.5), N('r2', 7, 5.5)],
    containers: [{ id: 'A', label: 'Alpha', title: 'Alpha', nodeIds: ['a1'], pad: 48 }, { id: 'B', label: 'Beta', title: 'Beta', nodeIds: ['b1'], parent: 'A', pad: 48 },
      { id: 'C', label: 'Gamma', title: 'Gamma', nodeIds: ['c1', 'c2'], parent: 'B', pad: 48 }, { id: 'R', label: 'Round', title: 'Round', nodeIds: ['r1', 'r2'], round: true }],
    edges: [L('in', 'ext', 'A', { toPort: 'pA', toSide: 'left', label: 'orders' }),
      L('dA', 'A', 'B', { fromPort: 'pA', toPort: 'pB', inner: 'from', fromSide: 'right', toSide: 'left' }),
      L('dB', 'B', 'C', { fromPort: 'pB', toPort: 'pC', inner: 'from', fromSide: 'right', toSide: 'left' }),
      L('dC', 'C', 'c1', { fromPort: 'pC', toPort: 'q', inner: 'from', fromSide: 'right', toSide: 'left' }),
      L('cc', 'c1', 'c2'), L('cs', 'c2', 'sq', { toPort: 'pL', toSide: 'left' }),
      ...[1, 2, 3, 4].map(k => L('h' + k, 'hub', 't' + k, { fromPort: 'h4', fromSide: 'right' })),
      L('sT', 'sq', 'hub', { fromPort: 'pT', fromSide: 'top', toSide: 'bottom' }), L('sR', 'sq', 'rt', { fromPort: 'pR', fromSide: 'right' }),
      L('sB', 'sq', 'up', { fromPort: 'pB', fromSide: 'bottom', toSide: 'top' }), L('ul', 'up', 'lo'),
      L('pa', 'two', 'far', { fromPort: 'pa', fromSide: 'right', portRank: o.swap ? 1 : 0 }), L('pb', 'two', 'far', { fromPort: 'pb', fromSide: 'right', portRank: o.swap ? 0 : 1 }),
      L('long', 't4', 'r1', { label: LONG, cut: 280 }), L('rr', 'r1', 'r2', { label: 'syncs' })] };
}
const ownerOf = (g, id) => g.byId[id] || g.families.find(f => f.id === id);
const inside = (p, r, m = 0) => p[0] >= r.x - m && p[0] <= r.x + r.w + m && p[1] >= r.y - m && p[1] <= r.y + r.h + m;
const touch = (a, b) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
// each port end: [line, end, its node or box, the border it is on, its point, its port's box]
const portEnds = g => g.edges.flatMap(e => [['from', e.fromPort, e.from, e.fs, e.p1, e.fpb, e.inner === 'from'], ['to', e.toPort, e.to, e.ts, e.p2, e.tpb, e.inner === 'to']]
  .filter(x => x[1] != null).map(([end, port, id, side, p, box, inner]) => ({ e, end, port, n: ownerOf(g, id), side: inner ? OPP[side] : side, p, box, inner })));
const borderAt = (n, side) => side === 'L' ? n.x : side === 'R' ? n.x + n.w : side === 'T' ? n.y : n.y + n.h;

for (const direction of ['right', 'down']) {
  test(`${direction}: every line of a port ends on its square within 1 px, and no port leaves its owner's side`, () => {
    const g = layoutTyped(FIX({ direction })), ends = portEnds(g), bad = [];
    assert.deepEqual([overlapIssues(g, ''), routeAudit(g, ''), g.stats], [[], [], { grid: 18 }], 'laid out clean');
    assert.equal(ends.length, 17);
    ends.forEach(({ e, end, port, n, side, p, box }) => { const v = side === 'L' || side === 'R', at = `${e.id} ${end} (${port} on ${n.id} ${side})`;
      if (!box) return bad.push(`${at}: no port box`);
      if (!inside(p, box, 1)) bad.push(`${at}: ${p} off its square ${JSON.stringify(box)}`);
      if (e.pts[end === 'from' ? 0 : e.pts.length - 1].join() !== p.join()) bad.push(`${at}: the route does not end at its port`);
      // the square straddles the border, 12 px across, and lies within the side
      const mid = v ? box.x + box.w / 2 : box.y + box.h / 2;
      if (Math.abs(mid - borderAt(n, side)) > .01 || (v ? box.w : box.h) !== 12) bad.push(`${at}: not centred on the border`);
      if (v ? box.y < n.y || box.y + box.h > n.y + n.h : box.x < n.x || box.x + box.w > n.x + n.w) bad.push(`${at}: ${JSON.stringify(box)} leaves ${n.id}'s side`); });
    assert.deepEqual(bad, []);
    // the ends of one port on one face are 10 px apart, and every port is as long as its busiest face needs
    const hub = ends.filter(x => x.port === 'h4'), H = g.byId.hub;
    assert.equal(hub.length, 4);
    assert.ok(hub.every(x => x.side === (direction === 'right' ? 'R' : 'B')), 'the four lines stay on their side: the side cap does not move them');
    if (direction === 'right') assert.equal(Math.floor(H.h * 0.84 / 14), 3, 'the side cap (layoutPass) would hold three ends on the hub\'s right side');
    const along = hub.map(x => x.p[direction === 'right' ? 1 : 0]).sort((a, b) => a - b);
    assert.deepEqual(along.slice(1).map((a, i) => a - along[i]), [10, 10, 10]);
    assert.equal(direction === 'right' ? hub[0].box.h : hub[0].box.w, 42);
    // ports pinned to each side are on it
    const sq = Object.fromEntries(ends.filter(x => x.n.id === 'sq').map(x => [x.port, x.side]));
    assert.deepEqual(sq, direction === 'right' ? { pL: 'L', pR: 'R', pT: 'T', pB: 'B' } : { pL: 'T', pR: 'B', pT: 'L', pB: 'R' });
  });

  test(`${direction}: an inner line enters its box only at its port, at each of three levels; nested boxes' ports do not touch`, () => {
    const g = layoutTyped(FIX({ direction })), F = Object.fromEntries(g.families.map(f => [f.id, f]));
    for (const [id, box] of [['dA', 'A'], ['dB', 'B'], ['dC', 'C']]) {
      const e = g.edges.find(x => x.id === id), f = F[box], [p0, p1] = e.pts, side = OPP[e.fs];
      assert.ok(e.pts.length >= 2 && e.how === 'grid', `${id} is routed clean (${e.how})`);
      assert.equal(p0[side === 'L' || side === 'R' ? 0 : 1], borderAt(f, side), `${id} starts on ${box}'s border`);
      assert.ok(inside(p0, e.fpb, 1), `${id} starts on its port`);
      e.pts.slice(1).forEach(p => assert.ok(p[0] > f.x + .5 && p[0] < f.x + f.w - .5 && p[1] > f.y + .5 && p[1] < f.y + f.h - .5, `${id}: ${p} is not inside ${box}`));
      assert.ok((p1[0] - p0[0]) * (f.x + f.w / 2 - p0[0]) + (p1[1] - p0[1]) * (f.y + f.h / 2 - p0[1]) > 0, `${id} leaves ${box}'s border inward`);
      // nor does it cut through the box (card) it ends on: every point along it, sampled each px, is outside that one's inside
      const t = ownerOf(g, e.to);
      e.pts.slice(1).forEach((b, i) => { const a = e.pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
        for (let j = 0; j <= n; j++) { const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n;
          assert.ok(!(x > t.x + .5 && x < t.x + t.w - .5 && y > t.y + .5 && y < t.y + t.h - .5), `${id} enters ${t.id} at ${x}, ${y}`); } });
    }
    // a box with ports has 48 px of padding: each nested box and card sits 48 px in from its owner's border, its header past that
    for (const [outer, inner] of [['A', F.B], ['B', F.C], ['C', g.byId.c1]]) assert.ok(inner.x - F[outer].x >= 48 - .01 && F[outer].x + F[outer].w - inner.x - inner.w >= 48 - .01, `${outer}'s padding`);
    const ports = ['dA', 'dB', 'dC'].map(id => g.edges.find(x => x.id === id).fpb);
    ports.forEach((a, i) => ports.slice(i + 1).forEach(b => assert.ok(!touch(a, b), `${JSON.stringify(a)} touches ${JSON.stringify(b)}`)));
  });
}

test('a port\'s outer and inner lines: the outer line ends on the outer face side, the inner leaves the other way from the same port', () => {
  const g = layoutTyped(FIX()), inn = g.edges.find(e => e.id === 'in'), dA = g.edges.find(e => e.id === 'dA');
  assert.equal(inn.ts, 'L'); assert.equal(dA.fs, 'R');
  assert.deepEqual(inn.tpb, dA.fpb, 'one port, one square');
  assert.ok(inn.pts.at(-2)[0] < inn.p2[0] && dA.pts[1][0] > dA.p1[0], 'one comes in from outside, the other goes on inward');
});

test('two ports with lines to one node keep their members\' order (portRank); a reorder of members lays the view out again', () => {
  const memo = {}, order = g => ['pa', 'pb'].sort((a, b) => g.edges.find(e => e.id === a).p1[1] - g.edges.find(e => e.id === b).p1[1]);
  assert.deepEqual(order(layoutTyped(FIX(), memo)), ['pa', 'pb']);
  assert.equal(memo.runs, 1);
  layoutTyped(FIX(), memo); assert.equal(memo.runs, 1, 'nothing moved: nothing laid out');
  assert.deepEqual(order(layoutTyped(FIX({ swap: true }), memo)), ['pb', 'pa']);
  assert.equal(memo.runs, 2, 'portRank is in the geometry key');
  for (const k of ['fromPort', 'toPort', 'inner']) { const d = FIX(); d.edges[0] = { ...d.edges[0], [k]: 'x' }; assert.notEqual(geometryKey(d), geometryKey(FIX()), k); }
});

test('a view laid out twice, from one memo and afresh, draws byte-identical markup; drawing leaves the memo\'s geometry as it was', () => {
  const memo = {}, g = layoutTyped(FIX(), memo), before = JSON.stringify(g.edges.map(e => [e.pts, e.fpb, e.tpb]));
  const draw = geo => { const c = { ...geo, nodes: [...geo.nodes, ...portEnds(geo).map(x => ({ id: `${x.n.id}->${x.port}`, label: x.port, k: 'file', ...x.box }))] }; c.byId = Object.fromEntries(c.nodes.map(n => [n.id, n])); return svgOf(c); };
  const unid = t => t.replace(/\bg\d+-/g, 'g-'), a = unid(draw(g)), b = unid(draw(layoutTyped(FIX(), memo))), fresh = layoutTyped(FIX()); // svgOf numbers each picture's marker ids
  assert.equal(memo.runs, 1); assert.equal(a, b); assert.notEqual(fresh, g, 'laid out again, not the memo\'s');
  assert.equal(unid(draw(fresh)), a);
  assert.equal(JSON.stringify(memo.g.edges.map(e => [e.pts, e.fpb, e.tpb])), before);
});

// the review's edge cases (5.1): small cards, minimal views
const N = (id, col, row, w = 120, h = 64) => ({ id, label: id, col, row, w, h }), clean = g => [...overlapIssues(g, ''), ...routeAudit(g, '')];
test('a self-loop beside a port on its node\'s top, and a self-loop with a port of its own, lay out clean', () => {
  for (const edges of [[{ id: 'l', from: 'a', to: 'a' }, { id: 'x', from: 'a', to: 'b', fromPort: 'p', fromSide: 'top' }], [{ id: 'l', from: 'a', to: 'a', fromPort: 'p', fromSide: 'right' }]]) {
    const g = layoutTyped({ repair: false, reroute: false, nodes: [N('a', 0, 1), N('b', 0, 0), N('c', 1, 1)], edges }), l = g.edges.find(e => e.id === 'l');
    assert.ok(l.p1 && l.p2 && l.pts.length === 5, JSON.stringify(l.pts)); assert.deepEqual(clean(g), []); }
});
test('ports that cannot fit their side are warned of; the fixture\'s fit', () => {
  const five = layoutTyped => layoutTyped({ repair: false, reroute: false, nodes: [N('a', 0, 2, 120, 40), ...[0, 1, 2, 3, 4].map(k => N('t' + k, 1, k))],
    edges: [0, 1, 2, 3, 4].map(k => ({ id: 'e' + k, from: 'a', to: 't' + k, fromPort: 'p' + k, fromSide: 'right' })) });
  assert.deepEqual(held(() => five(layoutTyped))[1], ['the ports on the right side of "a" do not fit it: they need 76 px, it has 40']);
  for (const direction of ['right', 'down']) assert.deepEqual(held(() => layoutTyped(FIX({ direction })))[1], [], direction);
});
test('a box\'s port with four lines on one face takes room beside the box: its lines do not cross', () => {
  const g = layoutTyped({ repair: false, reroute: false, nodes: [N('a', 0, 1), ...[0, 1, 2, 3].map(k => N('t' + k, 1, k))], containers: [{ id: 'K', label: 'K', title: 'K', nodeIds: ['a'], pad: 48 }],
    edges: [0, 1, 2, 3].map(k => ({ id: 'e' + k, from: 'K', to: 't' + k, fromPort: 'p', fromSide: 'right' })) });
  assert.deepEqual([clean(g), g.stats], [[], { grid: 4 }]);
});
test('an inner line with no port at its inner end is refused, as any line between a box and what it holds', () => {
  const [g, said] = held(() => layoutTyped({ repair: false, reroute: false, nodes: [N('a', 1, 0)], containers: [{ id: 'K', label: 'K', title: 'K', nodeIds: ['a'], pad: 48 }], edges: [{ id: 'd', from: 'K', to: 'a', inner: 'from', toPort: 'q' }] }));
  assert.equal(g.edges.length, 0); assert.match(said.join(), /no line for edge d/);
});

test('a round box grows by √2 about its centre: the ellipse drawn in it holds every node it holds', () => {
  const g = layoutTyped(FIX()), R = g.families.find(f => f.id === 'R'), plain = layoutTyped({ ...FIX(), containers: FIX().containers.map(f => f.id === 'R' ? { ...f, round: false } : f) });
  const P = plain.families.find(f => f.id === 'R');
  assert.ok(Math.abs(R.w - P.w * Math.SQRT2) < 1e-6 && Math.abs(R.h - P.h * Math.SQRT2) < 1e-6, `${R.w} × ${R.h} against ${P.w} × ${P.h}`);
  const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
  ['r1', 'r2'].map(id => g.byId[id]).forEach(n => [[n.x, n.y], [n.x + n.w, n.y], [n.x, n.y + n.h], [n.x + n.w, n.y + n.h]]
    .forEach(([x, y]) => assert.ok(((x - cx) / (R.w / 2)) ** 2 + ((y - cy) / (R.h / 2)) ** 2 <= 1, `${n.id}'s corner ${x}, ${y} outside the ellipse`)));
  // the plain frame keeps 32 px from the boxes and cards outside, as any box
  g.nodes.filter(n => !['r1', 'r2'].includes(n.id)).forEach(n => assert.ok(!touch({ x: R.x - 31, y: R.y - 31, w: R.w + 62, h: R.h + 62 }, n), `${n.id} within 32 px of R`));
});

test('the long label is cut at the line\'s cut and placed; a box with neither pad nor round is the frame stage 2 measured, the same object', () => {
  const g = layoutTyped(FIX()), e = g.edges.find(x => x.id === 'long');
  assert.ok(e.lbl && /…$/.test(e.lbl.text), JSON.stringify(e.lbl));
  const b = { x: 1.1, y: 2.3, w: 7.7, h: 9.1 };
  assert.equal(TYPED.frame(b), b); assert.deepEqual(b, { x: 1.1, y: 2.3, w: 7.7, h: 9.1 });
  assert.deepEqual(TYPED.frame({ x: 0, y: 0, w: 10, h: 20, pad: 48 }), { x: -36, y: -36, w: 82, h: 92, pad: 48 });
});

test('a box\'s head grows its header room on its title\'s side, the top (laid out down, the left, which becomes the top), before its pad; the layout check sees a line across it', () => {
  assert.deepEqual(TYPED.frame({ x: 0, y: 0, w: 10, h: 20, head: 15 }), { x: 0, y: -15, w: 10, h: 35, head: 15 });
  assert.deepEqual(TYPED.frame({ x: 0, y: 0, w: 10, h: 20, head: 15 }, true), { x: -15, y: 0, w: 25, h: 20, head: 15 });
  assert.deepEqual(TYPED.frame({ x: 0, y: 0, w: 10, h: 20, head: 15, pad: 22 }), { x: -10, y: -25, w: 30, h: 55, head: 15, pad: 22 });
  // laid out right and down: the box is 15 px taller on its title's side, and what it holds as far under its header room
  const dg = head => ({ nodes: [{ id: 'a', label: 'A', w: 120, h: 60 }, { id: 'b', label: 'B', w: 120, h: 60 }], edges: [{ id: 'ab', from: 'a', to: 'b' }],
    containers: [{ id: 'K', label: 'K', title: '«executionEnvironment» K', nodeIds: ['b'], ...(head ? { head } : {}) }], repair: false });
  for (const direction of ['right', 'down']) {
    const [g, p] = [15, 0].map(h => layoutTyped({ ...dg(h), direction })), K = g.families[0], P = p.families[0], r = x => Math.round(x * 100) / 100;
    assert.deepEqual([K.w, K.h], [P.w, P.h + 15], direction);
    assert.equal(r(g.byId.b.y - K.y), r(p.byId.b.y - P.y + 15), `${direction}: B as far under the header as without it, 15 px further from the top`);
  }
  // the layout check: a line across the header, 30 px under the box's top, crosses its title's second line (a map's box has none)
  const fam = { id: 'K', label: 'K', x: 0, y: 0, w: 200, h: 120 }, A = { label: 'A' }, edge = { s: A, t: A, pts: [[-50, 30], [250, 30]] };
  const says = (f, map) => routeAudit({ map, nodes: [], edges: [edge], families: [f], byId: {} }, 'v').filter(x => /header/.test(x));
  assert.deepEqual(says({ ...fam, head: 15 }), ['v: family "K": header crossed by edge A→A']);
  assert.deepEqual([says(fam), says({ ...fam, head: 15 }, true)], [[], []]);
});

test('a map\'s lines and boxes with the typed fields lay out as without them: no port, no inner line, no padding, no taller header', () => {
  const m = extra => ({ nodes: ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase() })),
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], containers: [{ id: 'K', label: 'K', nodeIds: ['b', 'c'], ...extra.box }] }],
    edges: [{ id: 'e1', from: 'a', to: 'b', label: 'calls', ...extra.line }, { id: 'e2', from: 'K', to: 'c', ...extra.line }, { id: 'e3', from: 'a', to: 'c', ...extra.line }] });
  const geo = x => { const g = layout(m(x), 'v'); return JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.id, e.pts]), g.families.map(f => [f.x, f.y, f.w, f.h]), g.bounds]); };
  assert.equal(geo({ line: { fromPort: 'p', toPort: 'q', inner: 'from', portRank: 1, fromSide: 'right' }, box: { pad: 48, round: true, head: 15 } }), geo({ line: { fromSide: 'right' }, box: {} }));
});

test('the socket: a half circle of radius 11 round the ball, its middle 3 px before the line\'s end, its centre 8 px past it', () => {
  const n = id => ({ id, x: 0, y: 0, w: 10, h: 10 });
  const T = TYPED.lines({ id: 'g1', edges: [{ end: { to: 'socket' }, pts: [[0, 0], [50, 0]], s: n('a'), t: n('b') }], drawn: [[[0, 0], [50, 0]]], lstyle: () => ({ m: 'd' }), MC: { d: '#000' } });
  const m = /<marker id="g1-socket-d" markerWidth="3" markerHeight="22" refX="3" refY="11"[^>]*><path d="M11 0A11 11 0 0 0 11 22" fill="none"/.exec(T.defs);
  assert.ok(m, T.defs);
  // in the marker's space the line's end is (3, 11): the arc's centre (11, 11) is 8 px past it, its leftmost point (0, 11) 3 px before
  assert.match(T.edge({ end: { to: 'socket' } }, 0).marks, /marker-end="url\(#g1-socket-d\)"/);
});

/* ---- 5.1's spike (§14): a test-only view of 50 nodes, 60 lines with long labels, 40 ports, boxes six deep with inner lines.
   The common edit, a label changed (laid out again and drawn), and a full layout: CPU time, best of seven after a warm-up; CI
   holds the 1 s ceiling and prints the time against the 100 ms target (the maintainer's decision of 13 Nov 2026), with the
   labels left with no spot under §8's small gap */
function SPIKE(label = '') {
  const nodes = [], edges = [], containers = [], words = ['reads the ledger', 'publishes order events over the message bus', 'replicates nightly to the archive store', 'calls'];
  // six nested boxes, each with a port on its left border and an inner line to the next box's port; a card in each
  for (let d = 0; d < 6; d++) { containers.push({ id: 'B' + d, label: 'Box ' + d, title: 'Box ' + d, nodeIds: ['k' + d], ...(d ? { parent: 'B' + (d - 1) } : {}), pad: 48 });
    nodes.push({ id: 'k' + d, label: 'K' + d, col: 1 + d % 2, row: 6 - d, w: 120, h: 64 });
    edges.push({ id: 'in' + d, from: 'B' + d, to: d < 5 ? 'B' + (d + 1) : 'k5', fromPort: 'p' + d, toPort: d < 5 ? 'p' + (d + 1) : 'q', inner: 'from', fromSide: 'right', toSide: 'left' }); }
  // 44 cards in six columns of eight, each wired to the cards level with it and one row off in the next column: 53 lines, the
  // first 40 from one of two ports on their card's right side
  for (let i = 0; nodes.length < 50; i++) nodes.push({ id: 'n' + i, label: 'Node ' + i, col: 3 + Math.floor(i / 8), row: i % 8, w: 140, h: 72 });
  const at = (c, r) => nodes.find(n => n.col === c && n.row === r && n.id[0] === 'n');
  edges.push({ id: 'deep', from: 'k5', to: 'n0', label: words[1], cut: 280 }); // the deepest card to one at the top
  for (let j = 0; edges.length < 60; j++) for (const a of nodes.filter(n => n.id[0] === 'n')) { const b = at(a.col + 1, a.row + [0, 1, -1][j]); if (!b || edges.length >= 60) continue;
    const k = edges.length - 7, ported = k < 40;
    edges.push({ id: 'e' + k, from: a.id, to: b.id, label: (k === 0 ? label : '') + words[k % words.length], cut: 280, ...(ported ? { fromPort: 'o' + (j % 2), fromSide: 'right', portRank: j % 2 } : {}) }); }
  return { repair: false, reroute: false, gap: 48, nodes, edges, containers };
}
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('5.1\'s spike (§14): 50 nodes, 60 lines with long labels, 40 ports, boxes six deep with inner lines: a label edit and a full layout under 1 s in CI, the edit against 100 ms printed (CPU, best of seven after a warm-up)', () => {
  const dg = SPIKE(), g0 = layoutTyped(dg);
  assert.equal(g0.nodes.length, 50); assert.equal(g0.families.length, 6);
  assert.equal(portEnds(g0).length, 52, '40 lines from ports, and the six inner lines\' twelve ends');
  const draw = (d, memo) => svgOf(layoutTyped(d, memo));
  const memo = {}; draw(dg, memo); draw(SPIKE('warm '), memo); // the warm-up
  const runs = Array.from({ length: 7 }, (_, k) => ({ full: cpu(() => layoutTyped(dg)), label: cpu(() => draw(SPIKE('x'.repeat(k + 1) + ' '), memo)) }));
  assert.equal(memo.runs, 9, 'each label edit lays the view out again');
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('label') < 1000, `a label edit ${best('label')} ms`);
  const labelled = g0.edges.filter(e => e.label), none = labelled.filter(e => !e.lbl).length, cutShort = labelled.filter(e => e.lbl && e.lbl.short).length;
  console.log(`# 5.1 spike: a label edit ${best('label').toFixed(1)} ms (target 100 ms), full layout ${best('full').toFixed(1)} ms; ${labelled.length} labels, ${none} with no spot, ${cutShort} cut to fit; routes ${JSON.stringify(g0.stats)}`);
  // labelGaps (§8, decision 9): the view laid out once more with the column gaps its tight labels need; rows do not move
  const lg = d => ({ ...d, labelGaps: true }), g1 = layoutTyped(lg(dg)), l1 = g1.edges.filter(e => e.label), none1 = l1.filter(e => !e.lbl).length;
  assert.ok(none1 < none, `labelGaps leaves ${none1} labels with no spot, against ${none}`);
  assert.deepEqual(g1.nodes.map(n => n.y), g0.nodes.map(n => n.y), 'column gaps only');
  const m1 = {}; draw(lg(dg), m1); draw(lg(SPIKE('warm ')), m1);
  const runs1 = Array.from({ length: 7 }, (_, k) => ({ full: cpu(() => layoutTyped(lg(dg))), label: cpu(() => draw(lg(SPIKE('x'.repeat(k + 1) + ' ')), m1)) }));
  const best1 = k => Math.min(...runs1.map(r => r[k]));
  assert.ok(best1('full') < 1000 && best1('label') < 1000, `with labelGaps: full ${best1('full')} ms, label ${best1('label')} ms`);
  console.log(`# 5.1 spike with labelGaps: a label edit ${best1('label').toFixed(1)} ms, full layout ${best1('full').toFixed(1)} ms; ${none1} with no spot, ${l1.filter(e => e.lbl && e.lbl.short).length} cut to fit; ${Math.round(g1.bounds.w)} px wide (${Math.round(g0.bounds.w)} without); routes ${JSON.stringify(g1.stats)}`);
  // laid out down, the view is laid out turned: its column gaps are the picture's row gaps, widened by each label's height, so
  // labelGaps gains less (§8, decision 21); printed, and it must not leave more labels with no spot
  const dn = d => layoutTyped({ ...d, direction: 'down' }), noSpot = g => g.edges.filter(e => e.label && !e.lbl).length, d0 = dn(dg), d1 = dn(lg(dg));
  assert.ok(noSpot(d1) <= noSpot(d0), `laid out down, labelGaps leaves ${noSpot(d1)} labels with no spot, against ${noSpot(d0)}`);
  console.log(`# 5.1 spike laid out down: ${noSpot(d0)} with no spot, ${Math.round(d0.bounds.h)} px high, routes ${JSON.stringify(d0.stats)}; with labelGaps ${noSpot(d1)}, ${Math.round(d1.bounds.h)} px high, routes ${JSON.stringify(d1.stats)}`);
});

test('labelGaps widens column gaps only: a tight label between two cards of one column moves no card up or down', () => {
  // one column, so no column gap: the old candidate list (a row gap on a typed view too) moved b and c down by 32 and 64 px
  const dg = { repair: false, reroute: false, nodes: ['a', 'b', 'c'].map((id, row) => ({ id, label: id.toUpperCase(), col: 0, row })),
    edges: [['a', 'b'], ['b', 'c']].map(([from, to]) => ({ id: from + to, from, to, label: LONG, fromSide: 'bottom', toSide: 'top' })) };
  const g0 = layoutTyped(dg), g1 = layoutTyped({ ...dg, labelGaps: true });
  assert.ok(g0.edges.some(e => !e.lbl), 'the fixture keeps a label with no spot');
  assert.deepEqual(g1.nodes.map(n => n.y), g0.nodes.map(n => n.y));
});

test('labelGaps is opt-in: a typed view without it lays out as before, and turning it on lays the view out again', () => {
  const dg = SPIKE(), memo = {}, svg = (d, m) => svgOf(layoutTyped(d, m)).replace(/\bg\d+-/g, ''); // each drawing numbers its markers
  assert.equal(svg({ ...dg, labelGaps: false }), svg(dg, memo));
  layoutTyped({ ...dg, labelGaps: true }, memo);
  assert.equal(memo.runs, 2);
});

test('the layout check passes a port half inside the node its owner names, and nothing else (decision 22); a map card\'s owner is a name and passes nothing', () => {
  const N = (id, x, more) => ({ id, label: id, x, y: 0, w: 100, h: 60, ...more }), msgs = geo => overlapIssues(geo, 'v');
  const nodes = [N('c', 0), N('c.p', 94, { w: 12, h: 12, owner: 'c' }), N('d', 100, { w: 40 })];
  assert.deepEqual(msgs({ nodes }), ['v: nodes "c.p" and "d" overlap'], 'the port on its owner passes; the same port on another node is reported');
  assert.deepEqual(msgs({ nodes: [nodes[1], nodes[0]] }), [], 'in either order');
  assert.deepEqual(msgs({ map: true, nodes: [N('ops', 0), N('api', 50, { owner: 'ops' })] }), ['v: nodes "ops" and "api" overlap'], 'a map: two cards overlap however they are owned');
});
