// The activity diagram, uml.activity (work package 4.5, notes/stage-4.md §9): its definition; its shapes (signal, object
// node, call behaviour action, partition); lanes from partitions, nested, with a node in no lane and an empty lane, and the
// partitions added back after the layout on their headers; examples/fulfil-activity.json laid out clean, down and
// right, no line along a divider for over 24 px; the validators, the shared flow rules run under this type; describe(),
// names, the reading order and the legend; the hooks through apply(); a 30-step session undone, redone and reopened; §17's
// budgets. tests/activity.html draws the example in Chrome in both themes and three fonts and drives the gestures. Imports
// src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { SHAPE, drawnPts } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { FLOW_RULES } from '../src/uml/flow.js';
import { actProblems, actConnect, actMoveTo, actAdd, actRemove, actRename, actOwners } from '../src/uml/activity.js';

const EX = JSON.parse(readFileSync(new URL('../examples/fulfil-activity.json', import.meta.url), 'utf8'));
const T = diagramOf({ diagram: 'uml.activity' }), V = (m, id = 'fulfil') => m.views.find(v => v.id === id);
const dir = (m, direction) => ({ ...m, views: m.views.map(v => ({ ...v, direction })) });
const errors = m => validate(m).filter(p => p.level === 'error');
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a, b) => a.x >= b.x - .5 && a.y >= b.y - .5 && a.x + a.w <= b.x + b.w + .5 && a.y + a.h <= b.y + b.h + .5;
const segs = p => p.slice(1).map((q, k) => ({ x: Math.min(p[k][0], q[0]), y: Math.min(p[k][1], q[1]), w: Math.abs(q[0] - p[k][0]) || .01, h: Math.abs(q[1] - p[k][1]) || .01, a: p[k], b: q }));
const N = (id, type, label, more = {}) => ({ id, type: 'uml.' + type, ...(label ? { label } : {}), ...more });
const F = (id, from, to, more = {}) => ({ id, type: 'uml.ControlFlow', from, to, ...more });
const one = (nodes, edges, more = {}) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.activity', nodeIds: nodes.map(n => n.id), ...more }] });

// DoD 3 in Node: no two nodes overlap, each node inside the band of its lane (and only there), no line through a node or a
// header but its two ends, every line drawn once; and no line runs along a divider for more than 24 px (§5.2). check()'s
// other findings are returned: crossings, which the views pin
function clean(m, vid) {
  const g = layout(m, vid), bad = [], nodes = g.nodes.filter(n => n.shape !== 'partition'), band = new Map(g.bands.map(b => [b.id, b]));
  nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => { if (meets(a, b)) bad.push(`${a.id} and ${b.id} overlap`); }));
  const laneOf = id => { const x = m.nodes.find(n => n.id === id); for (let p = x.parent; p != null; p = (m.nodes.find(n => n.id === p) || {}).parent) if (band.has(p)) return p; return null; };
  const under = (l, top) => { for (let p = l; p != null; p = (band.get(p) || {}).parent) if (p === top) return true; return false; };
  nodes.forEach(n => { const l = laneOf(n.id);
    g.bands.forEach(b => { const body = { ...b, ...(b.head.w < b.head.h ? { x: b.head.x + b.head.w, w: b.w - b.head.w } : { y: b.head.y + b.head.h, h: b.h - b.head.h }) };
      if (under(l, b.id) && !within(n, body)) bad.push(`${n.id} is out of its lane ${b.id}`); if (!under(l, b.id) && meets(n, b)) bad.push(`${n.id} is in ${b.id}, not its lane`); }); });
  g.edges.forEach(e => segs(e.pts).forEach(s => g.nodes.forEach(n => { if (n.id !== e.from && n.id !== e.to && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); })));
  // the dividers: each band's two edges across the flow
  const along = []; g.bands.forEach(b => { const flat = b.head.w < b.head.h; // a band along x: its dividers are horizontal
    (flat ? [b.y, b.y + b.h] : [b.x, b.x + b.w]).forEach(c => g.edges.forEach(e => segs(e.pts).forEach(s => { const run = flat ? s.a[1] === s.b[1] && Math.abs(s.a[1] - c) < 4 : s.a[0] === s.b[0] && Math.abs(s.a[0] - c) < 4;
      const lo = flat ? Math.max(s.x, b.x) : Math.max(s.y, b.y), hi = flat ? Math.min(s.x + s.w, b.x + b.w) : Math.min(s.y + s.h, b.y + b.h);
      if (run && hi - lo > 24) along.push(`${e.id} runs ${Math.round(hi - lo)} px along ${b.id}'s divider`); }))); });
  const problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
  return { g, bad, along, others: problems.filter(p => !crossings.includes(p)), crossings };
}

test('the definition: uml.activity with row 9\'s palette, its lines, properties, hooks and rules', () => {
  assert.equal(T.name, 'uml.activity');
  assert.deepEqual(T.elements.map(e => e.type.slice(4)), ['Action', 'InitialNode', 'ActivityFinalNode', 'FlowFinalNode', 'DecisionNode', 'MergeNode', 'ForkNode', 'JoinNode',
    'CallBehaviorAction', 'SendSignalAction', 'AcceptEventAction', 'ObjectNode', 'DataStoreNode', 'ActivityPartition', 'Comment']);
  assert.deepEqual(T.elements.filter(e => e.name === false).map(e => e.type), ['uml.InitialNode', 'uml.ActivityFinalNode', 'uml.FlowFinalNode', 'uml.ForkNode', 'uml.JoinNode'], 'control nodes are added with no name (§9.4)');
  assert.deepEqual(T.elements.filter(e => e.opens).map(e => [e.type, e.opens]), [['uml.CallBehaviorAction', 'uml.activity']]);
  assert.deepEqual(T.lines.map(l => l.type), ['uml.ControlFlow', 'uml.ObjectFlow', 'uml.CommentLink']);
  assert.deepEqual(T.props['uml.ControlFlow'].map(f => f.key), ['guard', 'stereotypes']);
  assert.deepEqual(T.props['uml.Action'].map(f => f.key), ['stereotypes']);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(Object.keys(T.rules), [...Object.keys(FLOW_RULES), 'object-flow', 'partition-owner', 'in-lane', 'calls-view']);
  for (const k of ['layout', 'draw', 'owners', 'validate', 'describe', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
});

// ---- the shapes: a point on any side slid by inset (drawnPts, as a typed line's end is) lies on the outline out draws
const poly = d => { const v = d.match(/[MLHVZ]|-?\d+(\.\d+)?/g), pts = []; let i = 0, x = 0, y = 0;
  while (i < v.length) { const c = v[i++]; if (c === 'M' || c === 'L') { x = +v[i++]; y = +v[i++]; pts.push([x, y]); } else if (c === 'H') { x = +v[i++]; pts.push([x, y]); } else if (c === 'V') { y = +v[i++]; pts.push([x, y]); } else if (c === 'Z') pts.push(pts[0]); }
  return pts; };
const offPoly = (P, [px, py]) => Math.min(...P.slice(1).map((b, k) => { const a = P[k], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }));
test('shapes: send, accept and the object node have outlines a slid end lies on; the call action is the rounded box and a rake; each drawn with its name and text', () => {
  for (const shape of ['send', 'accept', 'object']) for (const label of ['Pay', 'Restock request for every book the order is short of']) {
    const n = { id: 'x', shape, label, x: 30.5, y: 40.25, ...SHAPE[shape].size({ label }) }, P = poly(SHAPE[shape].out(n)), S = SHAPE[shape];
    assert.equal(n.w, SHAPE.rounded.size({ label }).w + (shape === 'object' ? 0 : 14), `${shape}: 14 px for its point or notch`);
    for (const side of ['L', 'R', 'T', 'B']) for (let k = 0; k <= 20; k++) {
      const v = side === 'L' || side === 'R', t = v ? n.y + n.h * k / 20 : n.x + n.w * k / 20, p = v ? [side === 'L' ? n.x : n.x + n.w, t] : [t, side === 'T' ? n.y : n.y + n.h];
      const [q] = drawnPts({ s: n, t: null, fs: side, pts: [p, [p[0] + 50, p[1] + 50]] }, m => ({ ...m, S }));
      assert.ok(offPoly(P, q) < .02, `${shape} ${side} at ${t}: ${offPoly(P, q)} px off`); }
    const s = S.draw({ ...n, aria: 'A name' });
    assert.match(s, new RegExp(`^<g class="node ${shape}" data-id="x" data-shape="${shape}" tabindex="-1" role="img" aria-label="A name"><path d="${S.out(n).replace(/[.]/g, '\\.')}" class="n-mask"/>`));
  }
  assert.ok(SHAPE.accept.inset({ x: 0, y: 0, w: 100, h: 40 }, 'L', 20) === 14 && SHAPE.send.inset({ x: 0, y: 0, w: 100, h: 40 }, 'R', 20) === 0, 'the notch at the left middle; the point at the right middle');
  const c = { id: 'c', label: 'Take payment', x: 0, y: 0, ...SHAPE.call.size({ label: 'Take payment' }) };
  assert.equal(c.h, SHAPE.rounded.size({ label: 'Take payment' }).h + 10);
  assert.match(SHAPE.call.draw(c), /class="n-det ac-rake"/);
  const head = SHAPE.partition.draw({ id: 'p', label: 'Warehouse', x: 0, y: 0, w: 22, h: 200 });
  assert.match(head, /class="fl-hit" fill="transparent"/); assert.match(head, /width="24"/, 'a 24 px strip to hit'); assert.match(head, /rotate\(-90/, 'a header along y reads up');
  assert.doesNotMatch(SHAPE.partition.draw({ id: 'p', label: 'Warehouse', x: 0, y: 0, w: 200, h: 22 }), /rotate/);
});

test('example 9: it validates and lays out clean down and right: lanes as bands, every node in its own, no line along a divider for over 24 px', () => {
  assert.deepEqual(validate(EX), []);
  for (const [d, crossings] of [['down', 2], ['right', 0]]) {
    const m = dir(EX, d), r = clean(m, 'fulfil');
    assert.deepEqual(r.bad, [], d); assert.deepEqual(r.others, [], `${d}: check() finds nothing but crossings`); assert.deepEqual(r.along, [], d);
    console.log(`# example 9, ${d}: ${r.g.nodes.length} nodes, ${r.g.edges.length} flows, ${r.crossings.length} crossings`);
    assert.equal(r.crossings.length, crossings, `${d}: the crossings pinned here (no port repair, §17)`);
    const g = r.g;
    assert.deepEqual(g.edges.filter(e => e.label).map(e => [e.id, e.lbl && e.lbl.text]), [['f-in-stock', '[all books in stock]'], ['f-short', '[else]']], `${d}: every guard drawn, whole`);
    assert.deepEqual(g.bands.map(b => [b.id, b.depth]), [['lane-worker', 0], ['lane-warehouse', 0], ['lane-email', 0]]);
    // the bands follow each other across the flow, each as long as the diagram; each header strip at the flow's start
    g.bands.forEach((b, i) => { const L = d === 'down' ? ['y', 'h', 'x', 'w'] : ['x', 'w', 'y', 'h'];
      assert.equal(b[L[1]], g.bands[0][L[1]]); if (i) assert.equal(b[L[2]], g.bands[i - 1][L[2]] + g.bands[i - 1][L[3]]);
      assert.equal(b.head[L[1]], 22); assert.ok(within(b, g.bounds)); assert.ok(g.nodes.filter(n => n.shape !== 'partition').every(n => n[L[0]] >= b.head[L[0]] + 22)); });
    // each partition a node on its header, named, in the reading order before what it holds
    assert.deepEqual(g.partitions, ['lane-worker', 'lane-warehouse', 'lane-email']);
    g.bands.forEach(b => { const n = g.byId[b.id]; assert.deepEqual([n.shape, n.x, n.y, n.w, n.h], ['partition', b.head.x, b.head.y, b.head.w, b.head.h]); });
    assert.equal(g.byId['lane-warehouse'].aria, 'Partition Warehouse, 10 nodes');
    assert.deepEqual(g.order.slice(0, 7), ['lane-worker', 'start', 'take-order', 'order', 'split', 'pay', 'lane-warehouse']);
    assert.deepEqual(g.nodes.map(n => n.id), [...g.order.filter(id => g.byId[id] && g.byId[id].shape !== 'partition'), ...g.partitions], 'the nodes are drawn in reading order, then the headers');
    // a bar lies across the flow; its lines enter on one long side and leave on the other
    const split = g.byId.split; assert.deepEqual(d === 'down' ? [split.h, split.w >= 48] : [split.w, split.h >= 48], [6, true]);
    g.edges.filter(e => e.from === 'split').forEach(e => assert.equal(e.fs, d === 'down' ? 'B' : 'R', e.id));
    assert.equal(g.edges.find(e => e.to === 'split').ts, d === 'down' ? 'T' : 'L');
  }
  const g = layout(EX, 'fulfil'), aria = id => g.byId[id].aria, line = id => g.edges.find(e => e.id === id);
  assert.deepEqual(['start', 'take-order', 'pay', 'in-stock', 'stock-ready', 'split', 'packed-and-paid', 'told', 'stock'].map(aria), ['Initial node, in Order worker',
    'Action Take the next order from the queue, in Order worker', 'Call behaviour action Take payment, opens Take payment, in Order worker', 'Decision All books in stock?, 2 exits, in Warehouse',
    'Merge, 2 entries, in Warehouse', 'Fork, 3 branches, in Order worker', 'Join, 2 branches, in Warehouse', 'Flow final, in Email service', 'Data store Stock levels, in Warehouse']);
  assert.equal(line('f-in-stock').aria, 'Control flow from All books in stock? to merge, guard all books in stock');
  assert.deepEqual([line('f-in-stock').label, line('f-short').label, line('f-start').label], ['[all books in stock]', '[else]', undefined]);
  assert.equal(line('f-order-out').aria, 'Object flow from Take the next order from the queue to Order');
  assert.deepEqual(g.byId.stock.stereotypes, ['datastore']);
  assert.deepEqual(g.legend.map(s => /<b>([^<]*)/.exec(s)[1]), ['Control flow', 'Object flow', 'Initial node', 'Activity final', 'Flow final', 'Fork', 'Join', 'Decision', 'Merge'], 'each line kind and control glyph drawn');
  assert.match(mapContext(EX).buildView('fulfil').markup, /<g class="ac-lanes"><g class="frame-box">/, 'the bands in the under layer');
  assert.equal(describe(EX, 'fulfil').split('\n').slice(0, 7).join('\n'), [
    'Fulfilling an order: an activity diagram of 17 nodes, 19 flows and 3 partitions.', 'Partition Order worker, 5 nodes.', 'Partition Warehouse, 10 nodes.', 'Partition Email service, 2 nodes.',
    'Initial node, in Order worker; then Take the next order from the queue.', 'Action Take the next order from the queue, in Order worker; then Order, an object flow.',
    'Object node Order, in Order worker; then Check the stock of each book, an object flow.'].join('\n'));
  assert.match(describe(EX, 'fulfil'), /\nDecision All books in stock\?, 2 exits, in Warehouse; then merge \[all books in stock\]; then Restock request \[else\]\.\n/);
  assert.equal(describe(EX, 'fulfil').split('\n').length, 4 + 17, 'each node once, from the initial node');
  assert.deepEqual([T.word(EX, 'in-stock'), T.rows(EX, V(EX), 'in-stock'), T.rows(EX, V(EX, 'take-payment'), 'charge')], ['Decision', ['in Warehouse'], null], 'the PDF\'s word and rows (§15)');
});

test('the geometry is a new object: laid out twice from one memo, the same markup, and nothing layoutTyped returned is changed (§2.4)', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  mapContext(EX, { memos }).buildGeo('fulfil'); const was = JSON.stringify(memos.fulfil.g, (k, v) => (k === 's' || k === 't' ? undefined : v));
  const a = mapContext(EX, { memos }).buildView('fulfil'), b = mapContext(EX, { memos }).buildView('fulfil');
  assert.equal(memos.fulfil.runs, 1);
  assert.equal(unid(a.markup), unid(b.markup));
  assert.equal(JSON.stringify(memos.fulfil.g, (k, v) => (k === 's' || k === 't' ? undefined : v)), was);
  assert.ok(!memos.fulfil.g.nodes.some(n => n.shape === 'partition') && !memos.fulfil.g.bands);
});

test('lanes (§5, §9.2): nested two deep, a node in no lane after the lanes (warned), an empty lane kept, a hidden partition\'s node in the nearest shown one above', () => {
  const m = one([N('shop', 'ActivityPartition', 'Shop'), N('wh', 'ActivityPartition', 'Warehouse'), N('pick', 'ActivityPartition', 'Picking', { parent: 'wh' }), N('pack', 'ActivityPartition', 'Packing', { parent: 'wh' }),
    N('bins', 'ActivityPartition', 'Bins', { parent: 'pick' }), N('none', 'ActivityPartition', 'Empty'), N('i', 'InitialNode', null, { parent: 'shop' }), N('a', 'Action', 'Take order', { parent: 'shop' }),
    N('b', 'Action', 'Find the books', { parent: 'bins' }), N('c', 'Action', 'Box them', { parent: 'pack' }), N('d', 'Action', 'Check', { parent: 'wh' }), N('x', 'Action', 'Mail it'), N('f', 'ActivityFinalNode', null, { parent: 'shop' })],
  [F('1', 'i', 'a'), F('2', 'a', 'b'), F('3', 'b', 'c'), F('4', 'c', 'd'), F('5', 'd', 'x'), F('6', 'x', 'f')]);
  V(m, 'v').nodeIds = V(m, 'v').nodeIds.filter(id => id !== 'bins'); // bins hidden: b is drawn in picking
  for (const d of ['right', 'down']) {
    const r = clean(dir(m, d), 'v'), g = r.g;
    assert.deepEqual([r.bad, r.along, r.others], [[], [], []], d);
    assert.deepEqual(g.bands.map(b => [b.id, b.parent, b.depth]), [['shop', null, 0], ['wh', null, 0], ['pick', 'wh', 1], ['pack', 'wh', 1], ['none', null, 0]]);
    const L = d === 'down' ? ['x', 'w'] : ['y', 'h'], band = id => g.bands.find(b => b.id === id);
    assert.ok(band('none')[L[1]] >= 80, `${d}: the empty lane keeps a row`);
    assert.ok(g.byId.x[L[0]] > band('none')[L[0]] + band('none')[L[1]], `${d}: a node in no lane after the lanes`);
    assert.equal(band('pick').head.depth, undefined); assert.ok(within(band('pick'), band('wh')) && within(band('pack'), band('wh')));
    assert.ok(g.order.indexOf('wh') < g.order.indexOf('pick') && g.order.indexOf('pack') < g.order.indexOf('d'), `${d}: a partition, its nested partitions, then its own nodes`);
  }
  assert.equal(layout(m, 'v').byId.b.aria, 'Action Find the books, in Picking');
  assert.deepEqual(actProblems(m, V(m, 'v')).map(p => [p.level, p.rule, p.ids]), [['warning', 'in-lane', ['x', 'v']]]);
  // a view with no partition shown draws no band, and its rows are the host's ranking
  const flat = one([N('i', 'InitialNode'), N('a', 'Action', 'Pack'), N('f', 'ActivityFinalNode')], [F('1', 'i', 'a'), F('2', 'a', 'f')]);
  assert.deepEqual([layout(flat, 'v').bands, actProblems(flat, V(flat, 'v'))], [[], []]);
  assert.equal(mapContext(flat).buildView('v').markup.includes('ac-lanes'), false);
});

// ---- validators: each rule a passing case (example 9, above, and the cases here) and a failing one
const rulesOf = m => validate(m).map(p => [p.level, p.rule]);
test('a view of partitions only draws, and a node added with one selected goes in it; a cycle of partition owners in loaded JSON lays out every node, each partition on it at the top', () => {
  const m = one([N('p', 'ActivityPartition', 'P')], []), g = layout(m, 'v');
  assert.match(mapContext(m).buildView('v').markup, /data-shape="partition"/);
  const s = g.slots.find(x => x.after === 'p');
  assert.equal(s.parent, 'p', 'a slot per partition header');
  assert.equal(actAdd(m, V(m, 'v'), { type: 'uml.Action' }, 'A', { ...s, sel: ['p'] })[0].element.parent, 'p');
  const cyc = more => one([N('p', 'ActivityPartition', 'P', { parent: 'q' }), N('q', 'ActivityPartition', 'Q', { parent: 'p' }), ...more, N('a', 'Action', 'A', { parent: 'p' })], []);
  for (const c of [cyc([N('r', 'ActivityPartition', 'R')]), cyc([])]) { const h = layout(c, 'v');
    assert.ok(h.nodes.some(n => n.id === 'a') && h.order.includes('a'), 'a node in a lane on the cycle is laid out and read');
    assert.equal(h.byId.p.aria, 'Partition P, 1 node'); }
});
test('the shared flow rules (flow.js) run under this type: each passes on example 9 and fails here, at S21\'s levels', () => {
  const base = [N('i', 'InitialNode'), N('a', 'Action', 'A'), N('b', 'Action', 'B'), N('f', 'ActivityFinalNode')];
  const cases = {
    'flow-ends': [[N('p', 'ActivityPartition', 'P')], [F('x', 'a', 'p')], ['error']],
    'initial-flows': [[], [F('x', 'a', 'i'), F('y', 'i', 'a'), F('z', 'i', 'b')], ['error', 'error']],
    'final-flows': [[], [F('y', 'i', 'a'), F('x', 'f', 'a')], ['error']],
    'fork-join': [[N('k', 'ForkNode'), N('j', 'JoinNode')], [F('y', 'i', 'k'), F('x', 'a', 'k'), F('z', 'k', 'b'), F('w', 'b', 'j'), F('v', 'j', 'f')], ['error', 'warning', 'warning']],
    'decision-merge': [[N('d', 'DecisionNode', 'Ok?'), N('m', 'MergeNode')], [F('y', 'i', 'd'), F('x', 'a', 'd'), F('z', 'd', 'b', { props: { guard: 'yes' } }), F('w', 'b', 'm'), F('v', 'm', 'f')], ['error', 'warning', 'warning']],
    'decision-guards': [[N('d', 'DecisionNode', 'Ok?')], [F('y', 'i', 'd'), F('z', 'd', 'a'), F('w', 'd', 'b', { props: { guard: 'else' } }), F('v', 'd', 'f', { props: { guard: 'else' } })], ['warning', 'warning']],
  };
  for (const [rule, [nodes, edges, levels]] of Object.entries(cases)) {
    const got = rulesOf(one([...base, ...nodes], edges)).filter(([, r]) => r === rule).map(([l]) => l).sort();
    assert.deepEqual(got, levels.sort(), rule);
    assert.ok(validate(one([...base, ...nodes], edges)).filter(p => p.rule === rule).every(p => p.message.startsWith(rule + ': ') && p.ids.length), `${rule} names its rule and its elements`);
  }
  assert.deepEqual(validate(EX).filter(p => Object.hasOwn(FLOW_RULES, p.rule)), [], 'each passes on example 9');
});
test('object-flow, partition-owner, in-lane and calls-view: each fails on a case and passes on example 9', () => {
  const m = one([N('a', 'Action', 'A'), N('o', 'ObjectNode', 'Order'), N('c', 'Comment', 'note'), N('p', 'ActivityPartition', 'P', { parent: 'c' }), N('b', 'Action', 'B', { parent: 'c' }),
    N('k', 'CallBehaviorAction', 'Pay', { opensView: 'nowhere' }), N('k2', 'CallBehaviorAction', 'Pay too')],
  [{ id: 'x', type: 'uml.ObjectFlow', from: 'a', to: 'b' }, F('y', 'a', 'o')]);
  assert.deepEqual(actProblems(m, V(m, 'v')).filter(p => !Object.hasOwn(FLOW_RULES, p.rule)).map(p => [p.level, p.rule, p.ids]), [
    ['warning', 'object-flow', ['x', 'a', 'b']], ['warning', 'object-flow', ['y', 'o']], ['error', 'partition-owner', ['p', 'c']], ['error', 'partition-owner', ['b', 'c']],
    ['warning', 'calls-view', ['k']], ['warning', 'calls-view', ['k2']], ['warning', 'in-lane', ['a', 'v']], ['warning', 'in-lane', ['o', 'v']], ['warning', 'in-lane', ['b', 'v']], ['warning', 'in-lane', ['k', 'v']], ['warning', 'in-lane', ['k2', 'v']]]);
  assert.match(actProblems(m, V(m, 'v')).find(p => p.rule === 'calls-view').message, /^calls-view: k \("Pay"\) opens "nowhere", which is no view of the model$/);
  assert.equal(validate(m).filter(p => p.rule === 'partition-owner').length, 2, 'validate() runs the type\'s rules');
  assert.deepEqual(validate(EX).filter(p => ['object-flow', 'partition-owner', 'in-lane', 'calls-view'].includes(p.rule)), []);
});

// ---- editing (§9.4, §12.1): the hooks return commands, run here through apply(); none breaks a rule
const run = (m, cs) => { assert.ok(Array.isArray(cs), JSON.stringify(cs)); const n = apply(m, cs); assert.deepEqual(errors(n), []); return n; };
const bandsOf = (m, vid = 'fulfil') => layout(m, vid).bands, mid = b => [b.x + b.w / 2 + 40, b.y + b.h / 2 + 30];
test('moveTo: a drop in another band changes lane and drops the pin, in one transaction; in its own band or by Alt + arrows a pin; a partition\'s header moves nothing', () => {
  const g = layout(EX, 'fulfil'), at = (id, pt) => ({ pt, col: 0, geo: g });
  const wh = g.bands.find(b => b.id === 'lane-warehouse'), em = g.bands.find(b => b.id === 'lane-email');
  assert.deepEqual(actMoveTo(EX, V(EX), 'take-order', at('take-order', mid(wh))), [{ op: 'reparent', id: 'take-order', parent: 'lane-warehouse' }]);
  const pinned = apply(EX, { op: 'set', view: 'fulfil', path: ['layout', 'pick'], value: [3, 4] });
  const cs = actMoveTo(pinned, V(pinned), 'pick', at('pick', mid(em)));
  assert.deepEqual(cs, [{ op: 'reparent', id: 'pick', parent: 'lane-email' }, { op: 'set', view: 'fulfil', path: ['layout', 'pick'], value: undefined }]);
  const m = run(pinned, cs); assert.equal(m.nodes.find(n => n.id === 'pick').parent, 'lane-email'); assert.ok(!Object.hasOwn(V(m).layout, 'pick'));
  assert.equal(layout(m, 'fulfil').byId.pick.aria, 'Action Pick and pack the books, in Email service');
  assert.equal(actMoveTo(EX, V(EX), 'pick', at('pick', mid(wh))), null, 'within its own lane: a pin');
  assert.deepEqual(actMoveTo(EX, V(EX), 'pick', at('pick', [g.bounds.x + g.bounds.w + 400, 0])), [{ op: 'reparent', id: 'pick', parent: null }], 'out of every band: no lane');
  assert.equal(actMoveTo(EX, V(EX), 'pick', { by: [0, 1], geo: g }), null, 'Alt + arrows: a pin, its row an order in its lane');
  for (const a of [at('x', mid(em)), { by: [1, 0], geo: g }, null]) assert.deepEqual(actMoveTo(EX, V(EX), 'lane-warehouse', a), [], 'a partition\'s header: nothing, and no pin');
  const noted = apply(EX, [{ op: 'add', element: N('note', 'Comment', 'Why'), view: 'fulfil' }]);
  assert.equal(actMoveTo(noted, V(noted), 'note', at('note', mid(wh))), null, 'a comment is in no lane: a drop pins it');
  assert.equal(actMoveTo(EX, V(EX, 'take-payment'), 'charge', { pt: [0, 0], geo: layout(EX, 'take-payment') }), null, 'no bands: a pin');
  // the pin it then gets is an order inside its lane: it never takes the node to another lane (§5.2)
  const p2 = apply(EX, { op: 'set', view: 'fulfil', path: ['layout', 'tell-shopper'], value: [0, 0] }), r = clean(dir(p2, 'right'), 'fulfil');
  assert.deepEqual(r.bad, []);
});
test('the Owner field lists the partitions by their names from the top; a partition is nested by it', () => {
  const nest = apply(EX, { op: 'add', element: N('lane-packing', 'ActivityPartition', 'Packing', { parent: 'lane-warehouse' }) });
  assert.deepEqual(actOwners(nest, nest.nodes.find(n => n.id === 'pick')), [{ id: 'lane-worker', label: 'Order worker' }, { id: 'lane-warehouse', label: 'Warehouse' },
    { id: 'lane-email', label: 'Email service' }, { id: 'lane-packing', label: 'Warehouse::Packing' }]);
  assert.ok(actOwners(EX, EX.nodes.find(n => n.id === 'lane-email')));
  assert.equal(actOwners(EX, EX.edges[0]), null); assert.equal(actOwners(EX, { id: 'c', type: 'uml.Comment' }), null);
});
test('remove: Shift + Delete on a partition keeps what it holds, which goes to its own owner; Delete hides as before', () => {
  const nest = apply(EX, [{ op: 'add', element: N('lane-packing', 'ActivityPartition', 'Packing', { parent: 'lane-warehouse' }), view: 'fulfil' }, { op: 'reparent', id: 'pick', parent: 'lane-packing' }]);
  let cs = actRemove(nest, V(nest), ['lane-warehouse'], true);
  assert.deepEqual(cs.at(-1), { op: 'delete', id: 'lane-warehouse' });
  assert.deepEqual(cs.slice(0, -1).map(c => [c.op, c.id, c.parent]).sort(), ['check-stock', 'stock', 'in-stock', 'ask-restock', 'books-arrive', 'stock-ready', 'packed-and-paid', 'ship', 'done', 'lane-packing'].sort().map(id => ['reparent', id, null]));
  let m = run(nest, cs);
  assert.ok(['check-stock', 'pick', 'done', 'lane-packing'].every(id => m.nodes.some(n => n.id === id)), 'its nodes and nested partition are kept');
  assert.equal(m.nodes.find(n => n.id === 'pick').parent, 'lane-packing');
  cs = actRemove(nest, V(nest), ['lane-packing'], true); m = run(nest, cs);
  assert.equal(m.nodes.find(n => n.id === 'pick').parent, 'lane-warehouse', 'a nested partition\'s nodes go to its parent');
  m = run(nest, actRemove(nest, V(nest), ['lane-warehouse', 'lane-packing', 'pick'], true));
  assert.ok(!m.nodes.some(n => n.id === 'pick') && m.nodes.find(n => n.id === 'ship').parent === undefined, 'what was selected goes; the rest to no lane');
  assert.equal(actRemove(EX, V(EX), ['lane-warehouse'], false), null); assert.equal(actRemove(EX, V(EX), ['pick'], true), null);
  assert.deepEqual(apply(EX, { op: 'delete', id: 'lane-email' }).nodes.filter(n => n.id === 'told'), [], 'without the hook, apply()\'s cascade would take them');
});
test('connect: a flow of the kind picked; a decision\'s second exit gets else; a flow that breaks a rule is refused with its reason', () => {
  const CF = { type: 'uml.ControlFlow' };
  const m0 = apply(EX, { op: 'delete', id: 'f-short' });
  assert.deepEqual(actConnect(m0, V(m0), 'in-stock', 'ask-restock', null, CF), [{ op: 'add', element: { id: 'in-stock-ask-restock', type: 'uml.ControlFlow', from: 'in-stock', to: 'ask-restock', props: { guard: 'else' } }, view: 'fulfil' }]);
  run(m0, actConnect(m0, V(m0), 'in-stock', 'ask-restock', null, CF));
  assert.deepEqual(actConnect(EX, V(EX), 'pick', 'ship', null, { type: 'uml.ObjectFlow' })[0].element, { id: 'pick-ship', type: 'uml.ObjectFlow', from: 'pick', to: 'ship' }, 'no guard but out of a decision');
  assert.equal(actConnect(EX, V(EX), 'in-stock', 'ship', null, CF)[0].element.props, undefined, 'a third exit: no else');
  assert.match(actConnect(EX, V(EX), 'take-order', 'start', null, CF).error, /^initial-flows: /);
  assert.match(actConnect(EX, V(EX), 'take-order', 'lane-email', null, CF).error, /^flow-ends: /);
  assert.match(actConnect(EX, V(EX), 'done', 'ship', null, CF).error, /^final-flows: /);
  assert.equal(actConnect(EX, V(EX), 'start', 'ship', null, { type: 'uml.CommentLink' }), null, 'a comment link is the default\'s');
  assert.equal(actConnect(apply(EX, { op: 'add', element: F('start-pick', 'start', 'pick') }), V(EX), 'pick', 'ship', null, CF)[0].element.id, 'pick-ship');
});
test('add: a node in the partition selected, or in the lane of the node selected; control nodes with no label; a call behaviour action asks which activity view it opens', () => {
  const at = sel => ({ after: 'pick', parent: 'lane-warehouse', sel });
  assert.deepEqual(actAdd(EX, V(EX), { type: 'uml.Action' }, 'Wrap the books', at(['lane-warehouse'])), [{ op: 'add', element: { id: 'wrap-the-books', type: 'uml.Action', label: 'Wrap the books', parent: 'lane-warehouse' }, view: 'fulfil' }]);
  assert.deepEqual(actAdd(EX, V(EX), { type: 'uml.ForkNode' }, '', at(['pick'])), [{ op: 'add', element: { id: 'fork', type: 'uml.ForkNode', parent: 'lane-warehouse' }, view: 'fulfil' }], 'a node selected: in its lane');
  assert.equal(actAdd(EX, V(EX), { type: 'uml.ForkNode' }, '', at([]))[0].element.parent, undefined, 'nothing selected: the last slot\'s lane is not taken');
  assert.equal(actAdd(EX, V(EX), { type: 'uml.Comment' }, 'Why', at(['pick']))[0].element.parent, undefined, 'a comment: in no lane');
  assert.deepEqual(actAdd(EX, V(EX), { type: 'uml.ActivityPartition' }, 'Packing', at(['lane-warehouse']))[0].element, { id: 'packing', type: 'uml.ActivityPartition', label: 'Packing', parent: 'lane-warehouse' });
  const r = actAdd(EX, V(EX), { type: 'uml.CallBehaviorAction' }, 'Refund', null);
  assert.deepEqual(r.pick, ['Fulfilling an order', 'Take payment']);
  assert.deepEqual(run(EX, r.then(1)).nodes.at(-1), { id: 'refund', type: 'uml.CallBehaviorAction', label: 'Refund', opensView: 'take-payment' });
  assert.deepEqual(actAdd({ ...EX, views: [] }, V(EX), { type: 'uml.CallBehaviorAction' }, 'x', null).pick, [], 'no view: the picker says so (src/typed/edit.js)');
  assert.equal(actAdd(EX, V(EX), { type: 'uml.Class' }, 'x', null), null);
  assert.equal(actAdd(EX, V(EX), { type: 'uml.Action' }, 'Pick and pack the books', null)[0].element.id, 'pick-and-pack-the-books');
});
test('rename: F2 on a flow reads "name [guard]" and sets each part that changed; a text it refuses is { error }; on a node, null', () => {
  assert.deepEqual(actRename(EX, V(EX), 'f-in-stock', 'in stock [every book on the shelf]'), [{ op: 'set', id: 'f-in-stock', path: 'label', value: 'in stock' }, { op: 'set', id: 'f-in-stock', path: 'props.guard', value: 'every book on the shelf' }]);
  assert.deepEqual(actRename(EX, V(EX), 'f-in-stock', '[all books in stock]'), []);
  assert.deepEqual(actRename(EX, V(EX), 'f-start', '[ready]'), [{ op: 'set', id: 'f-start', path: 'props.guard', value: 'ready' }]);
  let m = run(EX, actRename(EX, V(EX), 'f-start', '[ready]'));
  assert.equal(layout(m, 'fulfil').edges.find(e => e.id === 'f-start').label, '[ready]');
  m = run(m, actRename(m, V(m), 'f-start', 'go'));
  assert.deepEqual(m.edges.find(e => e.id === 'f-start'), { id: 'f-start', type: 'uml.ControlFlow', from: 'start', to: 'take-order', label: 'go', props: {} }, 'the guard cleared');
  assert.match(actRename(EX, V(EX), 'f-start', 'go / now').error, /it has an effect/);
  assert.match(actRename(EX, V(EX), 'f-start', 'go [x').error, /^a flow is name \[guard\]: /);
  assert.equal(actRename(EX, V(EX), 'pick', 'Pick'), null);
});

test('save and reopen (DoD 6): a 30-step activity session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const E = T.edits, CF = { type: 'uml.ControlFlow' }, g = m => layout(m, 'fulfil'), band = (m, id) => g(m).bands.find(b => b.id === id);
  const steps = [
    m => E.add(m, V(m), { type: 'uml.Action' }, 'Wrap the books', { sel: ['lane-warehouse'] }), m => E.connect(m, V(m), 'pick', 'wrap-the-books', null, CF),
    m => E.rename(m, V(m), 'pick-wrap-the-books', 'wrapped [gift]'), m => E.moveTo(m, V(m), 'wrap-the-books', { pt: mid(band(m, 'lane-email')), geo: g(m) }),
    m => [{ op: 'set', id: 'wrap-the-books', path: 'props.stereotypes', value: ['manual'] }], m => E.add(m, V(m), { type: 'uml.ActivityPartition' }, 'Packing', { sel: ['lane-warehouse'] }),
    m => [{ op: 'reparent', id: 'pick', parent: 'packing' }], m => [{ op: 'set', view: 'fulfil', path: ['layout', 'ship'], value: [9, 0] }],
    m => E.moveTo(m, V(m), 'ship', { pt: mid(band(m, 'lane-worker')), geo: g(m) }), m => E.add(m, V(m), { type: 'uml.FlowFinalNode' }, '', { sel: ['lane-email'] }),
    m => E.connect(m, V(m), 'wrap-the-books', 'flow-final', null, CF), m => E.rename(m, V(m), 'f-short', 'short [else]'),
    m => E.remove(m, V(m), ['packing'], true), m => [{ op: 'set', id: 'f-in-stock', path: 'props.guard', value: 'every book' }],
    m => E.add(m, V(m), { type: 'uml.DecisionNode' }, 'Gift?', { sel: ['lane-worker'] }), m => [{ op: 'delete', id: 'pick-wrap-the-books' }],
    m => E.connect(m, V(m), 'pick', 'gift', null, CF), m => E.connect(m, V(m), 'gift', 'wrap-the-books', null, { ...CF, props: { guard: 'gift' } }),
    m => E.connect(m, V(m), 'gift', 'packed-and-paid', null, CF), m => [{ op: 'delete', id: 'f-packed' }],
    m => E.rename(m, V(m), 'gift', 'A gift?') ?? [{ op: 'set', id: 'gift', path: 'label', value: 'A gift?' }], m => E.add(m, V(m), { type: 'uml.ObjectNode' }, 'Parcel', { sel: ['lane-warehouse'] }),
    m => E.remove(m, V(m), ['parcel'], false) ?? [{ op: 'hide', id: 'parcel', view: 'fulfil' }], m => E.add(m, V(m), { type: 'uml.CallBehaviorAction' }, 'Refund', null).then(1),
    m => [{ op: 'set', id: 'refund', path: 'props.stereotypes', value: ['rare'] }], m => E.remove(m, V(m), ['refund'], true) ?? [{ op: 'delete', id: 'refund' }],
    m => [{ op: 'set', view: 'fulfil', path: 'direction', value: 'right' }], m => E.moveTo(m, V(m), 'gift', { pt: mid(band(m, 'lane-warehouse')), geo: g(m) }),
    m => E.remove(m, V(m), ['lane-email'], true), m => [{ op: 'set', id: 'lane-worker', path: 'label', value: 'Worker' }],
  ];
  assert.equal(steps.length, 30); // a hook's null is the canvas's own gesture, written out after ??
  const h = history(EX), seen = [JSON.stringify(h.model)], cmds = [];
  for (const s of steps) { const c = s(h.model);
    assert.ok(Array.isArray(c) && c.length, `step ${seen.length}: ${JSON.stringify(c)}`); cmds.push(c);
    h.push(apply(h.model, c)); seen.push(JSON.stringify(h.model)); assert.deepEqual(errors(h.model), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = cmds.slice(15).reduce((m, c) => apply(m, c), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const geo = m => JSON.stringify(layout(m, 'fulfil'), (k, v) => (k === 'ms' || k === 's' || k === 't' ? undefined : v));
  assert.equal(geo(reopened), geo(JSON.parse(seen[30])));
  const last = JSON.parse(seen[30]);
  assert.ok(['told', 'tell-shopper', 'flow-final'].every(id => last.nodes.find(n => n.id === id).parent === undefined), 'the email lane deleted, its nodes kept');
  assert.deepEqual(clean(reopened, 'fulfil').bad, []);
});

// ---- §17: 50 nodes, 60 flows and four lanes; a full layout under 1 s, and the common edit (a guard, a stereotype, an
// action moved to another lane) laid out and drawn under 100 ms, best of three after a warm-up, in this process's CPU time
function stress() {
  const lanes = ['l0', 'l1', 'l2', 'l3'].map((id, k) => N(id, 'ActivityPartition', 'Lane ' + k)), nodes = [...lanes], edges = [];
  const kinds = ['Action', 'Action', 'DecisionNode', 'Action', 'MergeNode', 'Action', 'ForkNode', 'Action', 'JoinNode', 'Action'];
  nodes.push(N('n0', 'InitialNode', null, { parent: 'l0' }));
  for (let i = 1; i < 49; i++) nodes.push(N('n' + i, kinds[i % 10], kinds[i % 10] === 'Action' || kinds[i % 10] === 'DecisionNode' ? `Step ${i} of the order` : null, { parent: 'l' + (Math.floor(i / 3) % 4) }));
  nodes.push(N('n49', 'ActivityFinalNode', null, { parent: 'l3' }));
  for (let i = 0; i < 49; i++) edges.push(F('e' + i, 'n' + i, 'n' + (i + 1), kinds[i % 10] === 'DecisionNode' ? { props: { guard: 'yes' } } : {}));
  for (let k = 0; edges.length < 60; k++) { const a = 2 + 10 * (k % 5), b = a + 2 + (k % 3) * 10; edges.push(F('x' + k, 'n' + a, 'n' + Math.min(48, b), { props: { guard: 'no ' + k } })); }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'uml.activity', nodeIds: nodes.map(n => n.id) }] };
}
test('performance (§17, risks.md P1): 50 nodes, 60 flows, four lanes: a full layout under 1 s; a guard, a stereotype or a lane change laid out and drawn under 100 ms', () => {
  const M = stress(); assert.deepEqual([M.nodes.length - 4, M.edges.length], [50, 60]);
  const g0 = layout(M, 'all'); assert.equal(g0.bands.length, 4);
  const edits = { guard: actRename(M, V(M, 'all'), 'x0', '[no stock at all]'), stereotype: [{ op: 'set', id: 'n5', path: 'props.stereotypes', value: ['manual'] }],
    lane: actMoveTo(M, V(M, 'all'), 'n5', { pt: mid(g0.bands[3]), geo: g0 }) };
  assert.deepEqual(edits.lane, [{ op: 'reparent', id: 'n5', parent: 'l3' }]);
  const timed = f => { const c = process.cpuUsage(), t = performance.now(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000, performance.now() - t]; };
  const runs = [];
  for (let i = 0; i < 4; i++) { // the first is a warm-up (the JIT warms up on it)
    const memos = {}, r = {};
    [, r.full, r.fullWall] = timed(() => mapContext(M, { memos }).buildView('all').markup);
    for (const [k, c] of Object.entries(edits)) { const m = apply(M, c); let out;
      [out, r[k], r[k + 'Wall']] = timed(() => mapContext(m, { memos }).buildView('all').markup); assert.match(out, /^<svg /); }
    if (i) runs.push(r);
  }
  const best = k => Math.min(...runs.map(r => r[k])), ms = k => runs.map(r => Math.round(r[k])).join(', ');
  console.log(`# 50 nodes, 60 flows, 4 lanes, CPU (wall) ms: full ${ms('full')} (${ms('fullWall')}); a guard ${ms('guard')} (${ms('guardWall')}), a stereotype ${ms('stereotype')} (${ms('stereotypeWall')}), a lane change ${ms('lane')} (${ms('laneWall')})`);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  for (const k of Object.keys(edits)) assert.ok(best(k) < 100, `${k}: ${best(k)} ms`);
});
