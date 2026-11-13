// Milestone 4b's engine (work package 4b.1, notes/milestone-4b.md §5.2, §6.2, §10, §14), with no BPMN code: a port's least
// length (portMin) on a node and a box; the circle end and the dotted line; laneBands' runs and boxes, right and down; and
// §14's spike, a test-only stand-in for the BPMN type over a view of 60 flow nodes, three pools, six lanes, ten boundary
// events and two expanded sub-processes. tests/bpmn-engine.html draws the same in Chrome under three fonts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometryKey, layoutTyped } from '../src/typed/layout.js';
import '../src/typed/draw.js';
import { svgOf } from '../src/draw/svg.js';
import { laneBands, laneOrder } from '../src/layout/lanes.js';
import { cpPlace } from '../src/uml/component.js';
import { routeAudit, overlapIssues } from '../src/layout/audit.js';
import { textW } from '../src/core/text.js';

const N = (id, col, row, w = 120, h = 64) => ({ id, label: id, col, row, w, h });
const along = (box, side) => (side === 'L' || side === 'R' ? box.h : box.w);
const mid = (box, side) => (side === 'L' || side === 'R' ? box.y + box.h / 2 : box.x + box.w / 2);
const endAt = (p, side) => (side === 'L' || side === 'R' ? p[1] : p[0]);

/* ---- portMin (§6.2): two boundary events on one side of a node, one alone on a node, one on a box's border; a port with
   three lines and a portMin under its need; one with portMin [from, to] */
function PORTS(direction, min = 32) {
  return { direction, repair: false, reroute: false, gap: 48, rgap: 64,
    nodes: [N('act', 0, 0, 140, 100), N('x', 1, 1), N('y', 1, 2), N('solo', 2, 0), N('z', 3, 1), N('b1', 4, 0), N('far', 5, 1), N('hub', 6, 0), ...[0, 1, 2].map(k => N('t' + k, 7, k)), N('two', 8, 0), N('end', 9, 0)],
    containers: [{ id: 'S', label: 'Sub', title: 'Sub', nodeIds: ['b1'] }],
    edges: [{ id: 'p1', from: 'act', to: 'x', fromPort: 'be1', fromSide: 'bottom', portRank: 1, portMin: min },
      { id: 'p2', from: 'act', to: 'y', fromPort: 'be2', fromSide: 'bottom', portRank: 0, portMin: min },
      { id: 'f', from: 'act', to: 'solo' }, { id: 'p3', from: 'solo', to: 'z', fromPort: 'be3', fromSide: 'bottom', portMin: min },
      { id: 'g', from: 'solo', to: 'S' }, { id: 'p4', from: 'S', to: 'far', fromPort: 'be4', fromSide: 'bottom', portMin: min },
      ...[0, 1, 2].map(k => ({ id: 'h' + k, from: 'hub', to: 't' + k, fromPort: 'h3', fromSide: 'right', portMin: 12 })),
      { id: 'tw', from: 'two', to: 'end', fromPort: 'o', toPort: 'i', fromSide: 'right', toSide: 'left', portMin: [min, 0] }] };
}
const portEnds = g => g.edges.flatMap(e => [['from', e.fromPort, e.fs, e.p1, e.fpb], ['to', e.toPort, e.ts, e.p2, e.tpb]]
  .filter(x => x[1] != null).map(([end, port, side, p, box]) => ({ e, end, port, side, p, box })));

for (const direction of ['right', 'down']) {
  test(`${direction}: a port with portMin keeps its length along the border, its end centred, and its neighbour 8 px off; on a node and on a box`, () => {
    const g = layoutTyped(PORTS(direction)), ends = portEnds(g), by = p => ends.filter(x => x.port === p), bad = [];
    for (const p of ['be1', 'be2', 'be3', 'be4']) { const [x] = by(p);
      if (along(x.box, x.side) !== 32) bad.push(`${p}: ${along(x.box, x.side)} px along`);
      if (Math.abs(endAt(x.p, x.side) - mid(x.box, x.side)) > .01) bad.push(`${p}: its end is not centred on its box`);
      if (x.side !== (direction === 'right' ? 'B' : 'R')) bad.push(`${p}: on ${x.side}`); }
    assert.deepEqual(bad, []);
    const [a, b] = ['be2', 'be1'].map(p => by(p)[0].box), v = direction === 'down';
    assert.equal(v ? b.y - (a.y + a.h) : b.x - (a.x + a.w), 8, 'two on one side keep 8 px apart');
    assert.ok(g.families.some(f => f.id === 'S') && g.edges.find(e => e.id === 'p4').s.box, 'be4 is on the box');
    // portMin under a port's need: the need wins; [from, to]: each end its own
    const h3 = by('h3');
    assert.equal(h3.length, 3); assert.equal(along(h3[0].box, h3[0].side), 32);
    assert.deepEqual(h3.map(x => endAt(x.p, x.side) - (v ? x.box.x : x.box.y)).sort((p, q) => p - q), [6, 16, 26], 'the ends of a port that needs its length are where they were');
    assert.deepEqual(['o', 'i'].map(p => along(by(p)[0].box, by(p)[0].side)), [32, 12]);
    assert.deepEqual([overlapIssues(g, ''), routeAudit(g, '')], [[], []], 'laid out clean');
  });
}

test('portMin moves the geometry: it is part of the geometry key, and a line without it lays out as before', () => {
  const d = PORTS('right'), memo = {};
  assert.notEqual(geometryKey(d), geometryKey(PORTS('right', 40)));
  layoutTyped(d, memo); layoutTyped(PORTS('right', 40), memo); assert.equal(memo.runs, 2);
  const none = PORTS('right'); none.edges.forEach(e => delete e.portMin);
  const g = layoutTyped(none);
  assert.ok(portEnds(g).filter(x => /^be/.test(x.port)).every(x => along(x.box, x.side) === 12), 'with no portMin, a one-line port is 12 px along');
});

/* ---- the circle end and the dotted line (§10), on hand-built geometry */
test('ENDS.circle: an open circle, filled with the stage, its far side the line\'s end; dashed "dot" dotted, true dashed as before', () => {
  const a = { id: 'a', label: 'A', k: 'file', x: 0, y: 0, w: 100, h: 60 }, b = { id: 'b', label: 'B', k: 'file', x: 300, y: 0, w: 100, h: 60 };
  const svg = end => svgOf({ nodes: [a, b], groups: [], bounds: { x: -50, y: -50, w: 600, h: 200 }, byId: { a, b }, edges: [{ id: 'm', from: 'a', to: 'b', s: a, t: b, pts: [[100, 30], [300, 30]], end }] });
  const msg = svg({ from: 'circle', to: 'triangle', dashed: true });
  assert.match(msg, /<marker id="g\d+-circle-d" markerWidth="8" markerHeight="8" refX="8" refY="4" [^>]*><path d="M0 4A4 4 0 1 0 8 4A4 4 0 1 0 0 4Z" fill="var\(--um-stage-bg\)"/);
  assert.match(msg, /class="edge" [^>]*stroke-dasharray="6 4"[^>]*marker-start="url\(#g\d+-circle-d\)"/);
  assert.match(msg, /<path d="M 100 30 L 300 30" class="edge"/, 'the line runs to its end: the circle\'s far side is on it (refX 8)');
  assert.match(msg, /<path d="M 108 30 L 287 30" class="flowline"/, 'its flow starts at the circle\'s near side');
  const dot = svg({ to: 'open', dashed: 'dot' });
  assert.match(dot, /class="edge" [^>]*stroke-dasharray="2 3"/);
  assert.doesNotMatch(dot, /-circle-/);
});

/* ---- laneBands' runs and boxes (§5.2): pool P1 (lanes a, b; b holds the box S across a's columns), an empty row, pool P2
   (lane c), an empty row, a black-box pool P3. The rows are the type's (runs), not laneRuns' count */
const LANES = [{ id: 'P1', order: 0 }, { id: 'a', parent: 'P1', order: 0 }, { id: 'b', parent: 'P1', order: 1 }, { id: 'P2', order: 1 }, { id: 'c', parent: 'P2', order: 0 }, { id: 'P3', order: 2 }, { id: 'ghost', parent: 'P2', order: 9 }];
const IN = { n1: 'a', n2: 'a', n3: 'a', n4: 'b', s1: 'b', s2: 'b', n5: 'c', n6: 'c' }, laneOf = id => IN[id] ?? null;
const RUNS = { a: [0, 0], b: [1, 1], '\u0000gap1': [2, 2], c: [3, 3], '\u0000gap2': [4, 4], P3: [5, 5] };
const BANDED = direction => ({ direction, repair: false, reroute: false, gap: 48, rgap: 64,
  nodes: [N('n1', 0, 0), N('n2', 1, 0), N('n3', 2, 0), N('n4', 0, 1), N('s1', 1, 1), N('s2', 2, 1), N('n5', 0, 3), N('n6', 2, 3)],
  containers: [{ id: 'S', label: 'Expanded', title: 'Expanded', nodeIds: ['s1', 's2'] }],
  edges: [['n1', 'n2'], ['n2', 'n3'], ['n4', 'S'], ['s1', 's2'], ['S', 'n3'], ['n2', 'n5'], ['n6', 'n3']].map(([from, to], i) => ({ id: 'e' + i, from, to })) });
const within = (r, b, m = .5) => r.x >= b.x - m && r.y >= b.y - m && r.x + r.w <= b.x + b.w + m && r.y + r.h <= b.y + b.h + m;
const meets = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

for (const direction of ['right', 'down']) {
  test(`${direction}: bands with runs cover their rows and a box's frame; pools apart by their empty row; a key that is no lane has no band`, () => {
    const down = direction === 'down', g = layoutTyped(BANDED(direction)), was = JSON.stringify(g), L = laneBands(g, LANES, laneOf, down, 64, RUNS), B = Object.fromEntries(L.bands.map(b => [b.id, b]));
    const moved = r => ({ ...r, x: r.x + L.shift.x, y: r.y + L.shift.y }), bad = [];
    assert.deepEqual(L.bands.map(b => b.id), ['P1', 'a', 'b', 'P2', 'c', 'P3'], 'a lane with no run and none nested has no band; the empty rows none');
    g.nodes.forEach(n => { if (!within(moved(n), B[laneOf(n.id)])) bad.push(`${n.id} outside ${laneOf(n.id)}`); });
    const S = moved(g.families.find(f => f.id === 'S'));
    if (!within(S, B.b)) bad.push('the box leaves its lane');
    ['a', 'c', 'P2', 'P3'].forEach(id => { if (meets(S, B[id])) bad.push(`the box meets ${id}`); });
    ['a', 'b'].forEach(id => { if (!within(B[id], B.P1)) bad.push(`${id} outside P1`); }); if (!within(B.c, B.P2)) bad.push('c outside P2');
    const [A, Sz] = down ? ['x', 'w'] : ['y', 'h'];
    [['P1', 'P2'], ['P2', 'P3']].forEach(([p, q]) => { const gap = B[q][A] - (B[p][A] + B[p][Sz]); if (!(gap >= 40)) bad.push(`${p} and ${q} ${gap} px apart`); });
    if (!(B.P3[Sz] >= 120)) bad.push(`the black-box pool is ${B.P3[Sz]} px across`);
    assert.deepEqual(bad, []);
    // without the box counted, the divider between a and b would cross its frame; without runs, c's band would miss its row
    const lanesOnly = laneBands({ ...g, families: [] }, LANES, laneOf, down, 64, RUNS).bands.find(b => b.id === 'b');
    assert.ok(!within(S, lanesOnly), 'the fixture needs the frame counted');
    const counted = Object.fromEntries(laneBands(g, LANES, laneOf, down, 64).bands.map(b => [b.id, b]));
    assert.ok(!within(moved(g.byId.n5), counted.c), 'the fixture needs runs');
    assert.equal(JSON.stringify(g), was, 'laneBands writes nothing in g');
  });
}

test('laneBands with no runs and no boxes is as before: runs and boxes are only read where given', () => {
  const g = layoutTyped({ ...BANDED('right'), containers: [] }), plain = laneBands(g, LANES, laneOf, false, 64);
  assert.deepEqual(laneBands(g, LANES, laneOf, false, 64, undefined), plain);
  assert.deepEqual(laneBands(g, LANES, laneOf, false, 64, { a: 'x', b: [2, 1] }).bands.map(b => b.id), [], 'runs that are not [first, last] give no band');
});

/* ---- §14's spike: a test-only stand-in for the BPMN type ----
   Pools P0 (lanes a, b, c), P1 (d, e), P2 (f); 20 flow nodes each (a start, an end, a gateway every fourth, tasks), each
   pool's flow chained with a gateway's second way two on; two expanded sub-processes (S0 in a, S1 in d) of three nodes; ten
   boundary events, two on one task and one on S0, each with a sequence flow out three on; ten message flows across pools.
   Ranked by cpPlace (exported for this, §8.1) over sequence and message flows, then a lane pass of the stand-in's own: each
   lane its items in cpPlace's order, a block whole, pools apart by an empty row: runs for laneBands. Boundary events leave
   the layout: their lines are their activity's, with fromPort, fromSide and portMin 32, the activity grown 16 px on that
   side (§6.2); on the copy the activity is drawn at its own size and each event a 32 px circle on its border */
const POOLS = [['P0', ['a', 'b', 'c']], ['P1', ['d', 'e']], ['P2', ['f']]], BOXES = { S0: ['P0', 5, 'a'], S1: ['P1', 9, 'd'] };
const BES = [['P0', 1], ['P0', 3], ['P0', 3], ['S0'], ['P1', 1], ['P1', 5], ['P1', 13], ['P2', 3], ['P2', 7], ['P2', 11]];
function standIn(o = {}) {
  const down = o.direction === 'down', nodes = new Map(), lane = new Map(), owner = new Map(), seq = [], msg = [], be = [];
  POOLS.forEach(([P, lanes], p) => { const top = [];
    for (let k = 0; k < 20; k++) { const id = `${P}n${k}`, kind = k === 0 ? 'start' : k === 19 ? 'end' : k % 4 === 2 ? 'gateway' : 'task';
      const label = o.rename === id ? 'Check the order against the stock ledger' : `Task ${P}.${k}`;
      nodes.set(id, { id, kind, label, ...(kind === 'task' ? { w: Math.max(100, Math.ceil(textW(label, 13)) + 24), h: 64 } : kind === 'gateway' ? { w: 40, h: 40 } : { w: 32, h: 32 }) });
      lane.set(id, o.move === id ? lanes[(lanes.indexOf(lanes[Math.floor(k / 4) % lanes.length]) + 1) % lanes.length] : lanes[Math.floor(k / 4) % lanes.length]); }
    const box = Object.entries(BOXES).find(([, [q]]) => q === P);
    for (let k = 0; k < 20; k++) { const id = `${P}n${k}`;
      if (box && k >= box[1][1] && k < box[1][1] + 3) { owner.set(id, box[0]); lane.set(id, box[1][2]); if (k > box[1][1]) seq.push([`${P}n${k - 1}`, id]); if (k === box[1][1]) top.push(box[0]); }
      else top.push(id); }
    if (box) lane.set(box[0], box[1][2]);
    top.forEach((id, i) => { if (i) seq.push([top[i - 1], id]); if (nodes.get(id)?.kind === 'gateway' && top[i + 2]) seq.push([id, top[i + 2]]); });
    POOLS[p].top = top; });
  BES.forEach(([P, k], i) => { const on = k == null ? P : `${P}n${k}`, top = POOLS.find(([q]) => q === (k == null ? BOXES[P][0] : P)).top, at = top.indexOf(on);
    be.push({ id: 'be' + i, on, to: top[Math.min(at + 3, top.length - 1)], side: o.side === 'be' + i ? 'top' : 'bottom' }); });
  const tasks = POOLS.map(p => p.top.filter(id => nodes.get(id)?.kind === 'task'));
  for (let i = 0; i < 10; i++) msg.push([tasks[i % 3][i % tasks[i % 3].length], tasks[(i + 1) % 3][(i + 2) % tasks[(i + 1) % 3].length]]);
  // ranked: cpPlace over the sequence flows (a boundary event's from its activity) and the message flows
  const items = [...nodes.keys(), ...Object.keys(BOXES)], open = new Set(Object.keys(BOXES)), held = g => items.filter(x => (owner.get(x) ?? null) === g);
  const pic = { open, holds: held, owner: x => owner.get(x) ?? null };
  const lines = [...seq.map(([a, b]) => ({ f: { at: a }, t: { at: b } })), ...be.map(b => ({ f: { at: b.on }, t: { at: b.to } })), ...msg.map(([a, b]) => ({ f: { at: a }, t: { at: b } }))];
  const pos = cpPlace(pic, lines, {});
  // the lane pass: each lane its top-level items in cpPlace's order, stacked in its columns from its first row, a block whole
  const span = x => { const ps = open.has(x) ? held(x).map(id => pos[id]) : [pos[x]], c = ps.map(q => q[0]), r = ps.map(q => q[1]);
    return { c0: Math.min(...c), c1: Math.max(...c), r0: Math.min(...r), h: Math.max(...r) - Math.min(...r) + 1 }; };
  const at = {}, runs = {}; let base = 0;
  POOLS.forEach(([P, lanes], p) => { lanes.forEach(l => { const its = held(null).filter(x => lane.get(x) === l).map(x => ({ x, ...span(x) })).sort((u, v) => u.r0 - v.r0 || u.c0 - v.c0), next = {};
      its.forEach(it => { let r = 0; for (let c = it.c0; c <= it.c1; c++) r = Math.max(r, next[c] ?? 0); for (let c = it.c0; c <= it.c1; c++) next[c] = r + it.h;
        (open.has(it.x) ? held(it.x) : [it.x]).forEach(id => { at[id] = [pos[id][0], base + r + pos[id][1] - it.r0]; }); });
      const n = Math.max(1, ...Object.values(next)); runs[l] = [base, base + n - 1]; base += n; });
    if (p < POOLS.length - 1) { runs['\u0000gap' + p] = [base, base]; base++; } });
  // the layout's input: an activity with boundary events grown 16 px on each side that holds them
  const grow = new Map(); be.forEach(b => grow.set(b.on, [...new Set([...(grow.get(b.on) || []), b.side])]));
  // and long enough along each such side for its events: 16 + Σ (32 + 8) px (§6.2)
  const sized = n => { const s = grow.get(n.id) || [], ac = s.filter(x => x === 'top' || x === 'bottom').length * 16, al = s.filter(x => x === 'left' || x === 'right').length * 16;
    const need = side => 16 + 40 * be.filter(b => b.on === n.id && side.includes(b.side)).length, tb = need(['top', 'bottom']), lr = need(['left', 'right']);
    return down ? { w: Math.max(n.w, lr) + ac, h: Math.max(n.h, tb) + al } : { w: Math.max(n.w, tb) + al, h: Math.max(n.h, lr) + ac }; }; // down: the layout's bottom is the picture's right
  const rank = new Map(), portRank = b => { const list = be.filter(x => x.on === b.on && x.side === b.side); return list.indexOf(b); };
  be.forEach(b => rank.set(b.id, portRank(b)));
  const dg = { direction: o.direction, repair: false, reroute: false, gap: 48, rgap: 64,
    nodes: [...nodes.values()].map(n => ({ id: n.id, label: n.label, col: at[n.id][0], row: at[n.id][1], ...n, ...sized(n) })).map(({ kind, ...n }) => n),
    containers: Object.keys(BOXES).map(id => ({ id, label: 'Sub-process ' + id, title: 'Sub-process ' + id, nodeIds: held(id), ...(grow.has(id) ? { pad: 28 } : {}) })),
    edges: [...seq.map(([from, to], i) => ({ id: 's' + i, from, to, kind: 'seq', label: o.flow === 's' + i ? 'when the stock is short' : undefined, end: { to: 'arrow' } })),
      ...be.map(b => ({ id: 'f' + b.id, from: b.on, to: b.to, kind: 'seq', fromPort: b.id, fromSide: b.side, portRank: rank.get(b.id), portMin: 32, end: { to: 'arrow' } })),
      ...msg.map(([from, to], i) => ({ id: 'm' + i, from, to, kind: 'msg', end: { from: 'circle', to: 'triangle', dashed: true } }))] };
  const poolOf = id => { const l = lane.get(id); return POOLS.find(([, ls]) => ls.includes(l))[0]; };
  return { dg, runs, be, grow, poolOf, lanes: POOLS.flatMap(([P, ls], p) => [{ id: P, order: p }, ...ls.map((l, k) => ({ id: l, parent: P, order: k }))]), laneOf: id => lane.get(id) ?? null };
}
const SIDE = { B: [0, -1], T: [0, 1], R: [-1, 0], L: [1, 0] };
// the drawn copy (§2.4: g is never written): bands moved back by laneBands' shift, each grown activity at its own size, each
// boundary event a 32 px circle centred on its own border, 16 px in from its port's box
function drawn(S, g) {
  const L = laneBands(g, S.lanes, S.laneOf, S.dg.direction === 'down', 64, S.runs), back = b => ({ ...b, x: b.x - L.shift.x, y: b.y - L.shift.y });
  const circles = S.be.map(b => { const e = g.edges.find(x => x.fromPort === b.id), [dx, dy] = SIDE[e.fs], box = e.fpb;
    return { id: b.id, label: '', k: 'file', owner: b.on, x: box.x + box.w / 2 + 16 * dx - 16, y: box.y + box.h / 2 + 16 * dy - 16, w: 32, h: 32, side: e.fs, e }; });
  const own = n => { if (!S.grow.has(n.id)) return n; const c = { ...n }; circles.filter(x => x.owner === n.id).forEach(x => { if (c[x.side + 'done']) return; c[x.side + 'done'] = 1;
    if (x.side === 'B') c.h -= 16; if (x.side === 'R') c.w -= 16; if (x.side === 'T') { c.y += 16; c.h -= 16; } if (x.side === 'L') { c.x += 16; c.w -= 16; } }); return c; };
  const nodes = [...g.nodes.map(own), ...circles], copy = { ...g, nodes, families: g.families.map(own), byId: Object.fromEntries(nodes.map(n => [n.id, n])), bands: L.bands.map(back), bounds: back(L.bounds) };
  return { copy, circles, svg: () => svgOf(copy, { under: copy.bands.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="var(--um-muted)"/>`).join('') }) };
}
// lines that cross a boundary event's circle (not its own), and sequence flows with a point outside their pool's band
// (as laneBands gives it, and grown 24 px outward on its outer edges: 12 px outside the router's line, §5.2a)
function spikeCounts(S, g) {
  const { copy, circles } = drawn(S, g), band = Object.fromEntries(copy.bands.map(b => [b.id, b])), [A, Z] = S.dg.direction === 'down' ? [0, 'x'] : [1, 'y'], W = Z === 'x' ? 'w' : 'h';
  const near = (p, q, c) => { const cx = c.x + 16, cy = c.y + 16, x = Math.max(Math.min(p[0], q[0]), Math.min(cx, Math.max(p[0], q[0]))), y = Math.max(Math.min(p[1], q[1]), Math.min(cy, Math.max(p[1], q[1]))); return Math.hypot(x - cx, y - cy) < 15.5; };
  const through = circles.flatMap(c => g.edges.filter(e => e !== c.e && e.pts.slice(1).some((q, k) => near(e.pts[k], q, c))).map(e => `${e.id} through ${c.id}`));
  const outside = m => g.edges.filter(e => e.kind === 'seq').filter(e => { const b = band[S.poolOf(e.from)] || band[S.poolOf(e.to)]; return e.pts.some(p => p[A] < b[Z] - m - .5 || p[A] > b[Z] + b[W] + m + .5); }).map(e => e.id);
  return { through, outside: outside(0), outsideGrown: outside(24), issues: [...overlapIssues(copy, ''), ...routeAudit(g, '')] };
}

test('the stand-in builds §14\'s view: 60 flow nodes, three pools, six lanes, ten boundary events, two expanded sub-processes, ten message flows', () => {
  const S = standIn(), g = layoutTyped(S.dg);
  assert.equal(g.nodes.length, 60); assert.equal(g.families.length, 2); assert.equal(S.lanes.filter(l => l.parent).length, 6);
  assert.equal(S.be.length, 10); assert.equal(g.edges.filter(e => e.kind === 'msg').length, 10);
  assert.ok(S.be.some(b => b.on === 'S0'), 'a boundary event on an expanded sub-process');
  // ranked by cpPlace: every sequence flow at the top level runs forward or within a column
  assert.ok(g.edges.filter(e => e.kind === 'seq' && !e.fromPort).every(e => (g.byId[e.from] || {}).col == null || (g.byId[e.to] || {}).col == null || g.byId[e.from].col <= g.byId[e.to].col));
});

for (const direction of ['right', 'down']) {
  test(`${direction}: the spike's counts (§14): every boundary circle on its activity's border, lines through circles and sequence flows outside their pool counted and printed`, () => {
    const S = standIn({ direction }), g = layoutTyped(S.dg), { copy, circles } = drawn(S, g), c = spikeCounts(S, g);
    circles.forEach(x => { const n = copy.byId[x.owner] || copy.families.find(f => f.id === x.owner), cx = x.x + 16, cy = x.y + 16;
      const onIt = x.side === 'B' ? cy === n.y + n.h : x.side === 'T' ? cy === n.y : x.side === 'R' ? cx === n.x + n.w : cx === n.x;
      assert.ok(onIt, `${x.id} on ${x.owner}'s border`); });
    const crossings = c.issues.filter(m => / cross$/.test(m)), other = c.issues.filter(m => !/ cross$/.test(m));
    console.log(`# 4b.1 spike, ${direction}: ${c.through.length} lines through a boundary circle${c.through.length ? ' (' + c.through.join(', ') + ')' : ''}; ${c.outside.length} sequence flows outside their pool's band as laneBands gives it${c.outside.length ? ' (' + c.outside.join(', ') + ')' : ''}, ${c.outsideGrown.length} with the band grown to 12 px past the router's line; ${crossings.length} crossings; ${other.length} other layout issues${other.length ? ': ' + other.slice(0, 4).join('; ') : ''}; routes ${JSON.stringify(g.stats)}`);
    assert.ok(Array.isArray(c.through) && Array.isArray(c.outside));
  });
}

test('the stand-in lays out twice from one memo to byte-identical pictures; the copy never writes the layout', () => {
  const S = standIn(), memo = {}, g = layoutTyped(S.dg, memo), was = JSON.stringify(g.nodes), a = drawn(S, g).svg(), b = drawn(S, layoutTyped(standIn().dg, memo)).svg();
  const unid = t => t.replace(/\bg\d+-/g, 'g-');
  assert.equal(memo.runs, 1); assert.equal(unid(a), unid(b)); assert.equal(JSON.stringify(g.nodes), was);
});

const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('4b.1\'s spike (§14): a full layout and the common edits, ranked, laned, laid out and drawn, under 1 s in CI, each against its target printed (CPU, best of five after a warm-up) (timed)', () => {
  const memo = {}, run = (o, m = memo) => { const S = standIn(o); return drawn(S, layoutTyped(S.dg, m)).svg(); };
  const edits = { documentation: k => ({}), rename: k => ({ rename: k % 2 ? 'P1n7' : 'P0n9' }), 'flow name': k => ({ flow: 's' + (3 + k % 2) }), 'move to another lane': k => ({ move: k % 2 ? 'P0n13' : 'P1n15' }), 'boundary side': k => ({ side: 'be' + (k % 2 ? 0 : 4) }) };
  run({}); Object.values(edits).forEach(f => { run(f(0)); run({}); }); // the warm-up
  const best = {}, full = []; for (let k = 0; k < 5; k++) full.push(cpu(() => run({}, {})));
  best['full layout'] = Math.min(...full);
  Object.entries(edits).forEach(([name, f]) => { const t = []; for (let k = 0; k < 5; k++) { run({}); t.push(cpu(() => run(f(k)))); } best[name] = Math.min(...t); });
  console.log('# 4b.1 spike timings: ' + Object.entries(best).map(([k, v]) => `${k} ${v.toFixed(1)} ms (target ${k === 'full layout' ? 1000 : 100} ms)`).join(', '));
  Object.entries(best).forEach(([k, v]) => assert.ok(v < 1000, `${k} ${v} ms`));
});
