// The BPMN diagram, bpmn (work package 4b.3, notes/milestone-4b.md §3 to §8, §11): its definition; examples/
// bookshop-order-to-shipment.json laid out clean right and down (pools and lanes as bands, every node in its own, no line through a node, no
// sequence flow outside its pool's band, boundary events on their activities' borders, message flows to a pool on its
// border); the lane pass (§8.1: a block whole, a pin an order in its lane, data in its pool's band); boundary events (§6.2:
// on an expanded sub-process, two on one side, one with no line, one that moves with its activity); anchors (§7.2); a memo's
// picture the same as a fresh one; names, reading order, describe(), the legend, the PDF's rows and words; every rule of §4
// failing on a case and passing on the example; the hooks through apply(); a 30-step session undone, redone and reopened;
// §14's budgets on a view of 60 flow nodes. tests/bpmn.html draws the example in Chrome and drives the gestures. Imports
// src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { storyFromFlow } from '../src/map/stories.js';
import { diff } from '../src/map/diff.js';
import { tablesOf } from '../src/page/print.js';
import { BZ_RULES, bzProblems, bzConnect, bzMoveTo, bzAdd, bzRemove, bzKey, bzOwners, bzOwner } from '../src/bpmn/process.js';

const EX = JSON.parse(readFileSync(new URL('../examples/bookshop-order-to-shipment.json', import.meta.url), 'utf8'));
const T = diagramOf({ diagram: 'bpmn' }), VID = 'order-to-shipment', V = (m, id = VID) => m.views.find(v => v.id === id);
const dir = (m, direction) => ({ ...m, views: m.views.map(v => ({ ...v, direction })) });
const errors = m => validate(m).filter(p => p.level === 'error');
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a, b, k = .5) => a.x >= b.x - k && a.y >= b.y - k && a.x + a.w <= b.x + b.w + k && a.y + a.h <= b.y + b.h + k;
const segs = p => p.slice(1).map((q, k) => ({ x: Math.min(p[k][0], q[0]), y: Math.min(p[k][1], q[1]), w: Math.abs(q[0] - p[k][0]) || .01, h: Math.abs(q[1] - p[k][1]) || .01 }));
const N = (id, type, label, more = {}) => ({ id, type: 'bpmn.' + type, ...(label ? { label } : {}), ...more });
const F = (id, from, to, type = 'SequenceFlow', more = {}) => ({ id, type: 'bpmn.' + type, from, to, ...more });
const one = (nodes, edges, more = {}) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'bpmn', nodeIds: nodes.map(n => n.id), ...more }] });
const unid = s => s.replace(/\bg\d+-/g, 'g-');

// the model's own reading of where a node sits: its innermost lane, else its pool (test-side, not the type's)
function homes(m) {
  const lanes = new Map(); m.nodes.forEach(n => (n.members || []).forEach(l => lanes.set(l.id, { l, pool: n.id })));
  const up = id => (lanes.has(id) ? lanes.get(id).l.parent ?? lanes.get(id).pool : (m.nodes.find(n => n.id === id) || {}).parent);
  const chain = id => { const out = []; for (let p = up(id), k = 0; p != null && k < 64; p = up(p), k++) out.push(p); return out; };
  return { lane: id => chain(id).find(p => lanes.has(p)) ?? null, pool: id => chain(id).find(p => (m.nodes.find(n => n.id === p) || {}).type === 'bpmn.Participant') ?? null, chain };
}
// DoD 3 in Node: no two nodes overlap (a boundary circle passes on its own activity), each flow node inside the band of its
// lane, no line through a node but its own ends, no sequence flow with a point outside its pool's band, every boundary
// circle centred on its activity's border; check()'s other findings, with the crossings counted apart
function clean(m, vid) {
  const g = layout(m, vid), bad = [], H = homes(m), band = new Map(g.bands.map(b => [b.id, b]));
  const drawn = g.nodes.filter(n => !n.aside), host = id => g.byId[id] || g.families.find(f => f.id === id);
  drawn.forEach((a, i) => drawn.slice(i + 1).forEach(b => { if (meets(a, b) && a.owner !== b.id && b.owner !== a.id) bad.push(`${a.id} and ${b.id} overlap`); }));
  drawn.filter(n => /Event$|Gateway$|Task|SubProcess|CallActivity/.test(n.type) && !n.owner).forEach(n => { const l = H.lane(n.id) ?? H.pool(n.id);
    if (l != null && band.has(l) && !within(n, band.get(l))) bad.push(`${n.id} is out of its band ${l}`); });
  const ends = e => new Set([e.from, e.to, e.s && e.s.owner, e.t && e.t.owner].filter(Boolean));
  g.edges.forEach(e => { const E = ends(e); segs(e.pts).forEach(s => [...drawn, ...g.families.map(f => ({ ...f, fam: true }))].forEach(n => {
    if (E.has(n.id) || (n.fam && [...E].some(x => H.chain(x).includes(n.id)))) return;
    const inner = n.fam ? null : { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 }; if (inner && meets(s, inner)) bad.push(`${e.id} runs through ${n.id}`); })); });
  const [A, S] = m.views.find(v => v.id === vid).direction === 'down' ? [0, 'x'] : [1, 'y'], W = S === 'x' ? 'w' : 'h';
  g.edges.filter(e => e.type === 'bpmn.SequenceFlow').forEach(e => { const b = band.get(H.pool(e.from)); if (b && e.pts.some(p => p[A] < b[S] - .5 || p[A] > b[S] + b[W] + .5)) bad.push(`${e.id} leaves its pool`); });
  drawn.filter(n => n.type === 'bpmn.BoundaryEvent' && n.owner).forEach(c => { const o = host(c.owner), cx = c.x + 16, cy = c.y + 16;
    const on = { B: cy - (o.y + o.h), T: cy - o.y, R: cx - (o.x + o.w), L: cx - o.x }[c.side];
    if (Math.abs(on) > .01) bad.push(`${c.id} is ${on} px off ${c.owner}'s border`); });
  const problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
  return { g, bad, others: problems.filter(p => !crossings.includes(p)), crossings };
}

test('the definition: bpmn with row 24\'s palette, its lines, properties, refs, hooks and §4\'s rules', () => {
  assert.equal(T.name, 'bpmn'); assert.equal(T.layout.rank, false);
  assert.deepEqual(T.elements.map(e => e.label), ['Pool', 'Lane', 'Task', 'User task', 'Service task', 'Sub-process', 'Call activity', 'Start', 'Message start', 'Timer start', 'Intermediate catch',
    'Intermediate throw', 'Boundary', 'End', 'Message end', 'Terminate end', 'Exclusive gateway', 'Parallel gateway', 'Data object', 'Data store', 'Text annotation', 'Group']);
  assert.ok(T.elements.filter(e => /Event|Gateway/.test(e.type)).every(e => e.name === false) && T.elements.filter(e => !/Event|Gateway/.test(e.type)).every(e => e.name !== false), 'events and gateways added with no name field (§11)');
  assert.deepEqual(T.elements.filter(e => e.opens).map(e => e.type), ['bpmn.SubProcess', 'bpmn.CallActivity']);
  assert.deepEqual(T.lines.map(l => l.label), ['Flow (sequence, message, association or data association, by its ends)'], 'one line entry: no picker of kinds (decision 8)');
  assert.ok(Object.entries(T.props).every(([, fs]) => fs[0].key === 'documentation'), 'documentation on every element (S2)');
  assert.deepEqual(T.props['bpmn.BoundaryEvent'].map(f => f.key), ['documentation', 'definition', 'categoryValueRef', 'cancelActivity']);
  assert.deepEqual(T.props['bpmn.IntermediateThrowEvent'][1].options, ['none', 'message'], 'decision 21: the none intermediate throw event');
  assert.deepEqual(T.refs['bpmn.BoundaryEvent'], { 'props.categoryValueRef': 'drop', 'props.attachedTo': 'cascade' });
  // a default flow: an exclusive gateway's or an activity's, never a parallel gateway's; a deleted flow is dropped
  assert.deepEqual(['bpmn.ExclusiveGateway', 'bpmn.ParallelGateway', 'bpmn.Task', 'bpmn.SubProcess', 'bpmn.CallActivity'].map(t => [T.props[t].some(f => f.key === 'default'), T.refs[t]['props.default']]),
    [[true, 'drop'], [false, undefined], [true, 'drop'], [true, 'drop'], [true, 'drop']]);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'key', 'moveTo', 'owner', 'remove']);
  assert.deepEqual(Object.keys(T.rules), ['sequence-scope', 'sequence-ends', 'message-scope', 'message-ends', 'event-definition', 'boundary-host', 'boundary-out', 'flow-start', 'gateway-flows',
    'lane-owner', 'in-lane', 'data-ends', 'group-ref', 'opens-view', 'default-flow']);
  for (const k of ['layout', 'draw', 'boxes', 'owners', 'validate', 'describe', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
});

test('example 24 validates clean and lays out clean right and down: bands, every node in its own, no line through a node, no sequence flow outside its pool', () => {
  assert.deepEqual(validate(EX), []);
  for (const [d, pinned] of [['right', 4], ['down', 6]]) { // right 5 before audit 14's request/reply swap
    const r = clean(dir(EX, d), VID), g = r.g;
    assert.deepEqual([r.bad, r.others], [[], []], d);
    console.log(`# example 24, ${d}: ${g.nodes.length} nodes, ${g.edges.length} lines, ${r.crossings.length} crossings`);
    assert.equal(r.crossings.length, pinned, `${d}: the crossings pinned here (no port repair, S16)`);
    assert.deepEqual(g.bands.map(b => [b.id, b.depth]), [['bp-shopper', 0], ['bp-bookshop', 0], ['bp-sales', 1], ['bp-warehouse', 1], ['bp-payment-provider', 0]]);
    // the pools apart, each header a node on its strip, named
    const [A, S] = d === 'down' ? ['x', 'w'] : ['y', 'h'], pools = g.bands.filter(b => !b.depth);
    pools.slice(1).forEach((p, i) => assert.ok(p[A] > pools[i][A] + pools[i][S], `${d}: ${pools[i].id} and ${p.id} apart`));
    g.bands.forEach(b => { const n = g.byId[b.id]; assert.deepEqual([n.shape, n.aside, n.x, n.y, n.w, n.h], [b.depth ? 'bpmn-lane' : 'bpmn-pool', true, b.head.x, b.head.y, b.head.w, b.head.h]); });
    assert.ok(pools[2][S] >= 120 - .5, `${d}: the black-box pool 120 px across at least`);
    // the boundary event on take-payment's far side, and the expanded sub-process absent (pick-pack collapsed here)
    assert.equal(g.byId['payment-timeout'].side, d === 'down' ? 'R' : 'B'); assert.equal(g.byId['payment-timeout'].owner, 'bp-take-payment');
    assert.equal(g.families.length, 0); assert.equal(g.byId['pick-pack'].shape, 'bpmn-task');
    // a message flow to a pool ends on its border, at the column it comes from; the anchors are gone
    assert.ok(!g.nodes.some(n => n.id.startsWith('\u0000')) && !Object.keys(g.byId).some(id => id.startsWith('\u0000')), `${d}: no anchor drawn`);
    const end = id => g.edges.find(e => e.id === id), pp = g.bands.find(b => b.id === 'bp-payment-provider'), sh = g.bands.find(b => b.id === 'bp-shopper');
    assert.equal(end('bp-m-charge').pts.at(-1)[d === 'down' ? 0 : 1], pp[A], 'm-charge ends on the provider\'s border');
    assert.equal(end('m-result').pts[0][d === 'down' ? 0 : 1], pp[A], 'm-result starts on it');
    assert.equal(end('m-notice').pts.at(-1)[d === 'down' ? 0 : 1], sh[A] + sh[S], 'm-notice ends on the shopper\'s border');
    assert.deepEqual([end('bp-m-charge').to, end('m-result').from, end('m-notice').t.id], ['bp-payment-provider', 'bp-payment-provider', 'bp-shopper']);
    // the labels outside: each event, gateway and data object with a name has one
    assert.deepEqual(g.labels.map(l => l.id).sort(), ['basket-ready', 'courier-pickup', 'bp-order', 'order-cancelled', 'order-placed', 'order-received', 'order-shipped', 'paid', 'payment-timeout', 'shipping-notice', 'bp-stock'].sort());
    // the group round its members
    const grp = g.byId.dispatch; ['courier-pickup', 'bp-ship', 'shipping-notice'].forEach(id => assert.ok(within(g.byId[id], grp), `${d}: ${id} in the group`));
    assert.equal(g.nodes[0].id, 'dispatch', 'the group drawn first, under everything');
    // data in the lane of the flow node it is associated with (decision 23)
    const band = id => g.bands.find(b => b.id === id);
    assert.ok(within(g.byId['bp-order'], band('bp-sales')) && within(g.byId['bp-stock'], band('bp-warehouse')) && within(g.byId['note-card'], band('bp-sales')), `${d}: data and the annotation in their lanes`);
  }
});

test('names, reading order, describe(), the legend, the PDF\'s words and rows', () => {
  const g = layout(EX, VID), aria = id => g.byId[id].aria;
  assert.deepEqual(['bp-take-payment', 'payment-timeout', 'paid', 'order-cancelled', 'bp-bookshop', 'bp-sales', 'bp-payment-provider', 'dispatch', 'pick-pack', 'note-card'].map(aria), ['Service task Take payment, in Sales',
    'Timer boundary event No answer in 2 minutes, on Take payment', 'Exclusive gateway Paid?, in Sales', 'Terminate end event Order cancelled, in Sales', 'Pool Bookshop, 2 lanes, 17 elements',
    'Lane Sales of Bookshop, 12 elements', 'Pool Payment provider, a black box', 'Group Dispatch, round 3 elements', 'Sub-process Pick and pack (collapsed), in Warehouse, opens Pick and pack',
    'Text annotation Card details go straight to the provider; the shop never sees them, in Sales']);
  assert.equal(g.edges.find(e => e.id === 'bp-f-paid').aria, 'Sequence flow from Paid? to parallel gateway, named yes');
  assert.equal(g.edges.find(e => e.id === 'bp-m-charge').aria, 'Message flow from Take payment to Payment provider, named Charge request');
  assert.deepEqual(g.order.slice(0, 6), ['bp-shopper', 'basket-ready', 'place-order', 'order-placed', 'bp-bookshop', 'bp-sales']);
  assert.ok(g.order.indexOf('payment-timeout') === g.order.indexOf('bp-take-payment') + 1, 'a boundary event read after its activity');
  assert.ok(g.order.indexOf('dispatch') > g.order.indexOf('bp-payment-provider') && g.order.indexOf('f-basket') > g.order.indexOf('dispatch'), 'the groups, then the lines');
  assert.deepEqual(g.legend.map(s => /<b>([^<]*)/.exec(s)[1]), ['Sequence flow', 'Message flow', 'Association', 'Data association']);
  assert.match(mapContext(EX).buildView(VID).markup, /<g class="bz-pools"><rect class="bz-pool" data-o="bp-shopper"/);
  assert.match(mapContext(EX).buildView(VID).markup, /<g class="bp-label" data-o="paid"/);
  const said = describe(EX, VID).split('\n');
  assert.deepEqual(said.slice(0, 6), ['From order to shipment: a BPMN diagram of 18 flow nodes, 21 flows and 3 pools.', 'Pool Shopper, 3 elements.', 'Pool Bookshop, 2 lanes, 17 elements.',
    'Lane Sales of Bookshop, 12 elements.', 'Lane Warehouse of Bookshop, 5 elements.', 'Pool Payment provider, a black box; message to Take payment (Payment result).'], 'a message flow leaving a pool said with its pool');
  assert.ok(said.includes('Service task Take payment, in Sales; then Paid?; message to Payment provider (Charge request).'));
  assert.ok(said.includes('Timer boundary event No answer in 2 minutes, on Take payment; then exclusive gateway.'), 'a boundary event after its activity, with its flow');
  assert.equal(said.at(-1), 'Group Dispatch: Courier\'s pickup at 16:00, Hand parcel to courier, Shipping notice sent.');
  const doc = apply(EX, { op: 'set', id: 'bp-take-payment', path: 'props.documentation', value: 'Charged once.' });
  assert.ok(describe(doc, VID).includes('Service task Take payment, in Sales (Charged once.); then'), 'documentation printed (S2, 2.2.6)');
  assert.deepEqual([T.word(EX, 'paid'), T.word(EX, 'payment-timeout'), T.word(EX, 'bp-f-paid'), T.rows(doc, V(doc), 'bp-take-payment'), T.rows(EX, V(EX), 'payment-timeout'), T.rows(EX, V(EX), 'note-card'), T.rows(EX, V(EX), 'bp-bookshop'), T.rows(EX, V(EX), 'bp-sales')],
    ['Exclusive gateway', 'Timer boundary event', null, ['in Sales', 'Charged once.'], ['on Take payment'], ['in Sales'], ['Sales', 'Warehouse'], ['in Bookshop']], 'a pool is in nothing; its row lists its lanes');
  // audit 10: a line's and a group's documentation, in describe() and the PDF's lines table
  const ld = apply(EX, [{ op: 'set', id: 'bp-f-paid', path: 'props.documentation', value: 'Card accepted.' }, { op: 'set', id: 'dispatch', path: 'props.documentation', value: 'Same day.' }]);
  assert.match(describe(ld, VID), /\(yes\) \(Card accepted\.\)/);
  assert.match(describe(ld, VID).split('\n').at(-1), /^Group Dispatch \(Same day\.\): /);
  assert.deepEqual([T.text(ld, V(ld), 'bp-f-paid'), T.text(EX, V(EX), 'bp-f-paid')], ['yes — Card accepted.', null]);
  // a group round nothing shown is not drawn, and describe() says so
  const hidden = apply(EX, ['courier-pickup', 'bp-ship', 'shipping-notice'].map(id => ({ op: 'hide', id, view: VID })));
  assert.equal(layout(hidden, VID).byId.dispatch, undefined); assert.equal(describe(hidden, VID).split('\n').at(-1), 'Group Dispatch, round nothing shown: not drawn.');
  // what the picture leaves out (§8.3) is said, as not drawn
  const pp = one([N('p', 'Participant', 'P'), N('q', 'Participant', 'Q')], [F('m', 'p', 'q', 'MessageFlow', { label: 'Invoice' })]);
  assert.deepEqual(describe(pp, 'v').split('\n'), ['v: a BPMN diagram of 0 flow nodes, 1 flow and 2 pools.', 'Pool P, a black box; message to Q (Invoice), not drawn.', 'Pool Q, a black box.']);
  const rework = one([N('s', 'StartEvent', 'S'), N('t', 'Task', 'T'), N('b', 'BoundaryEvent', 'B', { props: { attachedTo: 't', definition: 'timer' } }), N('e', 'EndEvent', 'E')], [F('f1', 's', 't'), F('f2', 'b', 't'), F('f3', 't', 'e')]);
  assert.ok(describe(rework, 'v').includes('Timer boundary event B, on T; then T, not drawn.'));
});
test('a model whose sub-processes are each other\'s parent lays out, with lanes and without, its cycle reported by validate()', () => {
  const L1 = { id: 'l1', type: 'bpmn.Lane', label: 'L1' };
  for (const lanes of [[], [N('p', 'Participant', 'P', { members: [L1] })]]) {
    const m = one([...lanes, N('a', 'SubProcess', 'A', { parent: 'b' }), N('b', 'SubProcess', 'B', { parent: 'a' }), N('x', 'Task', 'X', { parent: 'a' })], []);
    assert.equal(layout(m, 'v').families.length, 0); assert.ok(validate(m).some(p => /ends up inside itself/.test(p.message))); }
});
test('data in no pool takes rows after every pool, not the lane of what it is associated with (§8.3)', () => {
  const m = one([POOL('p', ['l1']), N('t', 'Task', 'T', { parent: 'l1' }), N('d', 'DataObject', 'D')], [F('a', 'd', 't', 'DataAssociation')]), g = layout(m, 'v'), b = g.bands.find(x => x.id === 'p');
  assert.ok(g.byId.d.y >= b.y + b.h, 'below the pool'); assert.equal(g.byId.d.aria, 'Data object D');
});

test('the geometry is a new object: laid out twice from one memo, the same markup, and nothing layoutTyped returned is changed (§2.4)', () => {
  for (const d of ['right', 'down']) { const m = dir(EX, d), memos = {}, strip = (k, v) => (k === 's' || k === 't' ? undefined : v);
    mapContext(m, { memos }).buildGeo(VID); const was = JSON.stringify(memos[VID].g, strip);
    const a = mapContext(m, { memos }).buildView(VID), b = mapContext(m, { memos }).buildView(VID);
    assert.equal(memos[VID].runs, 1); assert.equal(unid(a.markup), unid(b.markup));
    assert.equal(JSON.stringify(memos[VID].g, strip), was);
    assert.ok(!memos[VID].g.bands && !memos[VID].g.nodes.some(n => n.type === 'bpmn.BoundaryEvent' || n.shape === 'bpmn-pool'), 'the pools, circles and headers are the copy\'s'); }
});

/* ---- the lane pass (§8.1), expanded sub-processes (§8.2) and boundary events (§6.2) on small views ---- */
const POOL = (id, lanes, more = {}) => N(id, 'Participant', id.toUpperCase(), { members: lanes.map(l => (typeof l === 'string' ? { id: l, type: 'bpmn.Lane', label: l.toUpperCase() } : l)), ...more });
function blockView() {
  // lane a: a start, a sub-process S (start, two tasks, end inside) and an end; lane b: two tasks in S's columns, one pinned later
  const nodes = [POOL('p', ['a', 'b']), N('s', 'StartEvent', 'Go', { parent: 'a' }), N('S', 'SubProcess', 'Pack', { parent: 'a' }), N('i', 'StartEvent', 'In', { parent: 'S' }),
    N('t1', 'Task', 'Pick the books', { parent: 'S' }), N('t2', 'Task', 'Wrap them', { parent: 'S' }), N('o', 'EndEvent', 'Out', { parent: 'S' }), N('e', 'EndEvent', 'Done', { parent: 'a' }),
    N('x', 'Task', 'Write the label', { parent: 'b' }), N('y', 'Task', 'Weigh it', { parent: 'b' }), N('z', 'Task', 'Book the courier', { parent: 'a' }),
    N('bS', 'BoundaryEvent', 'Late', { parent: 'a', props: { attachedTo: 'S', definition: 'timer' } }), N('d', 'DataObject', 'Label', { parent: 'p' })];
  const edges = [F('f1', 's', 'S'), F('f2', 'S', 'e'), F('g1', 'i', 't1'), F('g2', 't1', 't2'), F('g3', 't2', 'o'), F('h1', 's', 'x'), F('h2', 'x', 'y'), F('h3', 'y', 'e'), F('h4', 's', 'z'), F('h5', 'z', 'e'),
    F('fb', 'bS', 'e'), F('da', 'd', 'x', 'DataAssociation')];
  return one(nodes, edges);
}
test('the lane pass (§8.1): a block in a lane with another node of that lane in its columns, the frame overlapping nothing; a pin an order in its lane; data in its pool\'s band; right and down', () => {
  for (const d of ['right', 'down']) {
    const m = dir(blockView(), d), r = clean(m, 'v'), g = r.g, f = g.families.find(x => x.id === 'S');
    assert.deepEqual([r.bad, r.others], [[], []], d);
    assert.ok(f && f.shape === 'bpmn-frame' && f.aria === 'Sub-process Pack (expanded)', `${d}: S is a box`);
    g.nodes.filter(n => !n.aside && !['i', 't1', 't2', 'o', 'bS'].includes(n.id)).forEach(n => assert.ok(!meets(n, f), `${d}: ${n.id} meets the frame`));
    ['i', 't1', 't2', 'o'].forEach(id => assert.ok(within(g.byId[id], f), `${d}: ${id} inside the frame`));
    const band = id => g.bands.find(b => b.id === id);
    assert.ok(within(f, band('a')) && within(g.byId.z, band('a')), `${d}: the block and z in lane a`);
    assert.ok(within(g.byId.d, band('b')), `${d}: the data object in the lane of x, the flow node it is associated with`);
    // the boundary event on the box: on its drawn frame, the frame 16 px in from the box laid out
    assert.equal(g.byId.bS.owner, 'S');
    // a pin on y, set to row 0: it stays in lane b, an order inside it
    const pinned = apply(m, { op: 'set', view: 'v', path: ['layout', 'y'], value: [0, 0] }), q = clean(pinned, 'v');
    assert.deepEqual(q.bad, [], d); assert.ok(within(q.g.byId.y, q.g.bands.find(b => b.id === 'b')), `${d}: a pin is an order in its lane`);
    assert.ok(q.g.byId.y.col === 0, `${d}: the pin's column kept`);
  }
  // with no lanes, a pin keeps its row
  const flat = one([N('s', 'StartEvent', 'Go'), N('t', 'Task', 'Do'), N('u', 'Task', 'Then'), N('e', 'EndEvent', 'Done')], [F('1', 's', 't'), F('2', 't', 'u'), F('3', 'u', 'e')]);
  const P = apply(flat, { op: 'set', view: 'v', path: ['layout', 'u'], value: [5, 3] });
  assert.deepEqual([layout(P, 'v').byId.u.col, layout(P, 'v').byId.u.row], [5, 3]); assert.deepEqual(layout(flat, 'v').bands, []);
});

function boundaryView(more = {}) {
  const nodes = [POOL('p', []), N('s', 'StartEvent', 'Go', { parent: 'p' }), N('t', 'Task', 'Take payment', { parent: 'p' }), N('e', 'EndEvent', 'Done', { parent: 'p' }), N('k', 'EndEvent', 'Gave up', { parent: 'p' }),
    N('b1', 'BoundaryEvent', 'Late', { parent: 'p', props: { attachedTo: 't', definition: 'timer' } }), N('b2', 'BoundaryEvent', 'Asked', { parent: 'p', props: { attachedTo: 't', definition: 'message', cancelActivity: false } }),
    N('b3', 'BoundaryEvent', 'Loose', { parent: 'p', props: { attachedTo: 't', definition: 'timer' } }), POOL('q', []), POOL('r', [])];
  const edges = [F('1', 's', 't'), F('2', 't', 'e'), F('3', 'b1', 'k'), F('4', 'b2', 'k'), F('m1', 't', 'q', 'MessageFlow'), F('m2', 'q', 't', 'MessageFlow'), F('m3', 'r', 'b2', 'MessageFlow')];
  return one(nodes, edges, more);
}
test('boundary events (§6.2): two on one side and one with no line, each a 32 px circle on its activity\'s border; one facing its message flow\'s pool; it moves with its activity', () => {
  for (const d of ['right', 'down']) {
    const m = dir(boundaryView(), d), r = clean(m, 'v'), g = r.g, c = id => g.byId[id];
    assert.deepEqual([r.bad, r.others], [[], []], d);
    ['b1', 'b2', 'b3'].forEach(id => assert.deepEqual([c(id).w, c(id).h, c(id).owner, c(id).shape], [32, 32, 't', 'bpmn-event'], `${d}: ${id}`));
    assert.equal(c('b1').side, d === 'down' ? 'R' : 'B', `${d}: across the flow by default`);
    assert.equal(c('b2').side, d === 'down' ? 'R' : 'B', `${d}: facing pool r, its message flow's`);
    assert.equal(c('b2').cancelActivity, false);
    // apart along their side: 8 px at least between circles
    const [a, b] = ['b1', 'b2'].map(c).sort((p, q) => (d === 'down' ? p.y - q.y : p.x - q.x)), gap = d === 'down' ? b.y - a.y - 32 : b.x - a.x - 32;
    assert.ok(gap >= 8 - .01, `${d}: ${gap} px between two on one side`);
    assert.ok(!meets(c('b3'), c('b1')) && !meets(c('b3'), c('b2')), `${d}: the one with no line clear of the others`);
    // the lines from a circle start on its outer face
    const e3 = g.edges.find(e => e.id === '3'), o = c('b1'), cx = o.x + 16, cy = o.y + 16;
    assert.ok(Math.abs(Math.hypot(e3.pts[0][0] - cx, e3.pts[0][1] - cy) - 16) < .01, `${d}: its line leaves the circle's outer side`);
    assert.equal(e3.from, 'b1'); assert.equal(e3.s.id, 'b1');
    // two message flows from one column to pool q keep apart (F2)
    const [p1, p2] = ['m1', 'm2'].map(id => g.edges.find(e => e.id === id)), at = (e, k) => e.pts.at(k)[d === 'down' ? 1 : 0];
    assert.ok(Math.abs(at(p1, -1) - at(p2, 0)) >= 8, `${d}: two flows to one pool from one column apart`);
  }
  // pinned, then the pin moved: the circle is on the border both times
  // (without b3: a side crowded with the ends of lines that name no port leaves a circle with no line no room, marked over)
  const crowded = apply(boundaryView({ layout: { t: [0, 0] } }), []), held = layout(crowded, 'v').byId.b3;
  assert.equal(held.over, true, 'held at the span\'s end, marked over');
  for (const at of [[0, 0], [3, 2]]) { const m = apply(boundaryView(), [{ op: 'delete', id: 'b3' }, { op: 'set', view: 'v', path: ['layout', 't'], value: at }]), r = clean(m, 'v');
    assert.deepEqual(r.bad, [], JSON.stringify(at)); assert.equal(r.g.byId.t.col, at[0]); }
  // present.<id>.side pins the side
  const top = apply(boundaryView(), { op: 'set', view: 'v', path: ['present', 'b1', 'side'], value: 'top' }), r = clean(top, 'v');
  assert.deepEqual(r.bad, []); assert.equal(r.g.byId.b1.side, 'T');
});

/* ---- validators (§4): each rule a failing case here, a passing one in example 24 ---- */
const P0 = () => [POOL('p', ['l1']), POOL('q', []), N('s', 'StartEvent', 'Go', { parent: 'l1' }), N('a', 'Task', 'A', { parent: 'l1' }), N('e', 'EndEvent', 'End', { parent: 'l1' })];
const P0E = () => [F('f1', 's', 'a'), F('f2', 'a', 'e')];
const cases = {
  'sequence-scope': [[N('qs', 'StartEvent', 'Q', { parent: 'q' })], [F('x', 'a', 'qs')], ['error']],
  'sequence-ends': [[N('d', 'DataObject', 'D', { parent: 'p' })], [F('x', 'a', 'd'), F('y', 'e', 'a'), F('z', 'a', 's')], ['error', 'error', 'error']],
  'message-scope': [[N('b', 'Task', 'B', { parent: 'l1' })], [F('x', 'a', 'b', 'MessageFlow'), F('y', 'b', 'a')], ['error']],
  'message-ends': [[N('qs', 'StartEvent', 'Q', { parent: 'q', props: { definition: 'none' } }), N('qe', 'IntermediateThrowEvent', 'T', { parent: 'q', props: { definition: 'none' } })], [F('x', 'a', 'qs', 'MessageFlow'), F('y', 'qe', 'a', 'MessageFlow')], ['error', 'error']],
  'event-definition': [[N('t', 'IntermediateCatchEvent', 'Wait', { parent: 'l1', props: { definition: 'terminate' } }), N('u', 'Task', 'U', { parent: 'l1', props: { cancelActivity: true } })], [F('x', 'a', 't'), F('y', 't', 'u'), F('z', 'u', 'e')], ['error', 'error']],
  'boundary-host': [[N('b1', 'BoundaryEvent', 'B', { parent: 'l1', props: { attachedTo: 'e', definition: 'timer' } }), N('b2', 'BoundaryEvent', 'C', { parent: 'p', props: { attachedTo: 'a', definition: 'timer' } })], [F('x', 'b1', 'e'), F('y', 'b2', 'e')], ['error', 'warning']],
  'boundary-out': [[N('b', 'BoundaryEvent', 'B', { parent: 'l1', props: { attachedTo: 'a', definition: 'timer' } }), N('c', 'BoundaryEvent', 'C', { parent: 'l1', props: { attachedTo: 'a', definition: 'message' } })], [F('m', 'c', 'q', 'MessageFlow')], ['warning', 'warning']],
  'flow-start': [[N('z', 'Task', 'Z', { parent: 'q' })], [], ['warning', 'warning', 'warning']],
  'gateway-flows': [[N('g', 'ExclusiveGateway', 'G', { parent: 'l1' }), N('h', 'ParallelGateway', null, { parent: 'l1' }), N('b', 'Task', 'B', { parent: 'l1' })], [F('x', 'a', 'g'), F('y', 'g', 'b'), F('w', 'g', 'e'), F('v', 'b', 'h'), F('u', 'h', 'e', 'SequenceFlow', { label: 'go' })], ['warning', 'warning']],
  'lane-owner': [[POOL('r', [{ id: 'l9', type: 'bpmn.Lane', label: 'L9', parent: 'l1' }]), N('d', 'DataObject', 'D', { parent: 'l1' }), N('b', 'Task', 'B', { parent: 'd' })], [F('x', 'a', 'b')], ['error', 'error', 'error']],
  'in-lane': [[N('b', 'Task', 'B', { parent: 'p' })], [F('x', 'a', 'b')], ['warning']],
  'data-ends': [[N('d', 'DataObject', 'D', { parent: 'p' }), N('n', 'TextAnnotation', 'Why')], [F('x', 'd', 's', 'DataAssociation'), F('y', 'e', 'd', 'DataAssociation'), F('z', 'a', 'e', 'Association'), F('w', 'd', 'd', 'DataAssociation'), F('ok', 'n', 'a', 'Association')], ['error', 'error', 'error', 'error']],
  'group-ref': [[N('b', 'Task', 'B', { parent: 'l1', props: { categoryValueRef: ['nowhere', 'a'] } })], [F('x', 'a', 'b')], ['warning', 'warning']],
  'opens-view': [[N('S', 'SubProcess', 'S', { parent: 'l1', opensView: 'nowhere' }), N('c', 'CallActivity', 'C', { parent: 'l1', opensView: 'v2' })], [F('x', 'a', 'S'), F('y', 'S', 'c'), F('z', 'c', 'e')], ['warning', 'warning']],
  // a default that is no flow out of its gateway, on a parallel gateway, naming no line, and one with a condition
  'default-flow': [[N('g', 'ExclusiveGateway', 'G', { parent: 'l1', props: { default: 'f1' } }), N('h', 'ParallelGateway', null, { parent: 'l1', props: { default: 'u' } }),
    N('b', 'Task', 'B', { parent: 'l1', props: { default: 'v' } }), N('c', 'Task', 'C', { parent: 'l1', props: { default: 'nowhere' } })],
  [F('x', 'a', 'g'), F('y', 'g', 'b', 'SequenceFlow', { label: 'yes' }), F('z', 'g', 'h', 'SequenceFlow', { label: 'no' }), F('u', 'h', 'c'), F('t', 'h', 'e'), F('v', 'b', 'e', 'SequenceFlow', { ext: { bpmn: { condition: '${ok}' } } }), F('w', 'c', 'e')],
  ['error', 'error', 'error', 'warning']],
};
test('§4\'s rules: each fails on its case at its level, naming its rule and its elements, and passes on example 24', () => {
  assert.deepEqual(Object.keys(cases), Object.keys(BZ_RULES));
  const base = one([...P0()], P0E());
  assert.deepEqual(validate(base), [], 'the base passes every rule');
  for (const [rule, [nodes, edges, levels]] of Object.entries(cases)) {
    const m = one([...P0(), ...nodes], [...P0E(), ...edges]), ps = validate(m).filter(p => p.rule === rule);
    assert.deepEqual(ps.map(p => p.level).sort(), levels.slice().sort(), `${rule}: ${JSON.stringify(ps.map(p => p.message))}`);
    assert.ok(ps.every(p => p.message.startsWith(rule + ': ') && p.ids.length && typeof p.path === 'string' && p.path), `${rule} names its rule, its elements and its path`);
  }
  assert.deepEqual(validate(EX).filter(p => Object.hasOwn(BZ_RULES, p.rule)), [], 'each passes on example 24');
  assert.match(validate(one([...P0(), N('qs', 'StartEvent', 'Q', { parent: 'q' })], [...P0E(), F('x', 'a', 'qs')])).find(p => p.rule === 'sequence-scope').message, /different pools: use a message flow$/);
  // with a view, only what it shows
  const m = one([...P0(), N('z', 'Task', 'Z', { parent: 'q' })], P0E()); m.views[0].nodeIds = m.views[0].nodeIds.filter(id => id !== 'z');
  assert.deepEqual(bzProblems(m, m.views[0]).filter(p => p.ids.includes('z')), []);
  // decision 21: a none intermediate throw event passes; a none catch event does not
  const thr = one([...P0(), N('t', 'IntermediateThrowEvent', 'Milestone', { parent: 'l1', props: { definition: 'none' } })], [F('f1', 's', 'a'), F('f2', 'a', 't'), F('f3', 't', 'e')]);
  assert.deepEqual(validate(thr), []);
});

/* ---- editing (§11): the hooks return commands, run here through apply(); none brings an error ---- */
const kept = m => validate(m).filter(p => ['boundary-host', 'in-lane'].includes(p.rule)).map(p => p.message);
// a deleted lane's flow nodes go to its pool (S12): in no lane, so remove is run without the warnings check
const run = (m, cs, warn = true) => { assert.ok(Array.isArray(cs) || (cs && Array.isArray(cs.commands)), JSON.stringify(cs)); const n = apply(m, cs.commands || cs), was = kept(m);
  assert.deepEqual(errors(n), []); if (warn) assert.deepEqual(kept(n).filter(w => !was.includes(w)), [], 'no new boundary-host or in-lane warning'); return n; };
test('connect: the kind by the ends, no picker (§7.1); a flow BPMN forbids refused with the rule\'s words', () => {
  const v = V(EX), el = cs => cs[0].element;
  assert.deepEqual(bzConnect(EX, v, 'cancel-order', 'send-invoice'), [{ op: 'add', element: { id: 'cancel-order-send-invoice', type: 'bpmn.SequenceFlow', from: 'cancel-order', to: 'send-invoice' }, view: VID }]);
  assert.equal(el(bzConnect(EX, v, 'cancel-order', 'bp-payment-provider')).type, 'bpmn.MessageFlow', 'to another pool: a message flow');
  assert.equal(el(bzConnect(EX, v, 'place-order', 'bp-take-payment')).type, 'bpmn.MessageFlow');
  assert.equal(el(bzConnect(EX, v, 'send-invoice', 'bp-order')).type, 'bpmn.DataAssociation');
  assert.equal(el(bzConnect(EX, v, 'note-card', 'paid')).type, 'bpmn.Association');
  assert.deepEqual(bzConnect(EX, v, 'cancel-order', 'basket-ready'), { error: 'A message flow cannot end at a start event' });
  assert.deepEqual(bzConnect(EX, v, 'order-placed', 'order-received'), { error: 'A message flow cannot start at an end event' });
  assert.deepEqual(bzConnect(EX, v, 'bp-order', 'order-received'), { error: 'A message start event only gives data: draw the line from the event to the data' });
  assert.deepEqual(bzConnect(EX, v, 'order-shipped', 'bp-order'), { error: 'An end event only takes data: draw the line from the data to the event' });
  assert.match(bzConnect(EX, v, 'paid', 'basket-ready').error, /^A message flow/);
  assert.match(bzConnect(EX, v, 'bp-take-payment', 'order-received').error, /^sequence-ends: /, 'into a start event: refused by its rule');
  assert.deepEqual(bzConnect(EX, v, 'bp-bookshop', 'bp-take-payment'), { error: 'A sequence flow cannot leave its pool: a message flow joins two pools' });
  assert.deepEqual(bzConnect(EX, v, 'dispatch', 'bp-ship'), { error: 'A group joins no flow' });
  assert.deepEqual(bzConnect(EX, v, 'pick-books', 'bp-ship'), { error: 'A sequence flow stays in its sub-process' });
  run(EX, bzConnect(EX, v, 'cancel-order', 'bp-payment-provider'));
  // what the picture leaves out is refused, not drawn as nothing
  assert.match(bzConnect(EX, v, 'bp-shopper', 'bp-payment-provider').error, /^A message flow between two pools is not drawn/);
  assert.match(bzConnect(EX, v, 'payment-timeout', 'bp-take-payment').error, /^A flow from a boundary event back to its own activity is not drawn/);
  for (const [a, b] of [['note-card', 'bp-sales'], ['note-card', 'note-card'], ['note-card', 'bp-bookshop'], ['dispatch', 'note-card']]) assert.match(bzConnect(EX, v, a, b).error, /^A text annotation is linked to an element in the flow/, a + ' ' + b);
  const free = apply(EX, { op: 'add', element: { id: 'loose', type: 'bpmn.Task', label: 'Loose' }, view: VID });
  assert.deepEqual(bzConnect(free, V(free), 'cancel-order', 'loose'), { error: 'A sequence flow cannot leave its pool: Loose is in no pool' });
});
test('moveTo: a drop in another lane reparents and drops the pin; into another pool only with no sequence flows; a boundary event\'s side by Alt + arrows, its activity by a drop; headers and groups move nothing', () => {
  const g = layout(EX, VID), band = id => g.bands.find(b => b.id === id), mid = b => [b.x + b.w / 2 + 40, b.y + b.h / 2 + 30], at = b => ({ pt: mid(b), geo: g });
  assert.deepEqual(bzMoveTo(EX, V(EX), 'send-invoice', at(band('bp-warehouse'))), [{ op: 'reparent', id: 'send-invoice', parent: 'bp-warehouse' }]);
  const pinned = apply(EX, { op: 'set', view: VID, path: ['layout', 'send-invoice'], value: [4, 1] });
  assert.deepEqual(bzMoveTo(pinned, V(pinned), 'send-invoice', at(band('bp-warehouse')))[1], { op: 'set', view: VID, path: ['layout', 'send-invoice'], value: undefined });
  assert.equal(bzMoveTo(EX, V(EX), 'send-invoice', at(band('bp-sales'))), null, 'in its own lane: a pin');
  assert.deepEqual(bzMoveTo(EX, V(EX), 'send-invoice', at(band('bp-shopper'))), { error: 'Move its sequence flows first: a sequence flow stays in its pool' });
  assert.deepEqual(bzMoveTo(EX, V(EX), 'bp-stock', at(band('bp-sales'))), null, 'data is in its pool, not a lane: within it, a pin');
  assert.deepEqual(bzMoveTo(EX, V(EX), 'bp-stock', at(band('bp-shopper'))), { error: 'Data stays in the pool of what it is associated with' });
  const lone = apply(EX, { op: 'add', element: { id: 'memo', type: 'bpmn.DataObject', label: 'Memo', parent: 'bp-bookshop' }, view: VID });
  assert.deepEqual(bzMoveTo(lone, V(lone), 'memo', at(band('bp-shopper'))), [{ op: 'reparent', id: 'memo', parent: 'bp-shopper' }], 'data with no association: into another pool');
  assert.equal(bzMoveTo(EX, V(EX), 'note-card', at(band('bp-warehouse'))), null, 'an annotation is in no pool: a pin');
  const head = band('bp-bookshop').head;
  assert.match(bzMoveTo(EX, V(EX), 'send-invoice', { pt: [head.x + head.w / 2, head.y + head.h / 2], geo: g }).error, /^in-lane: /, 'on a pool\'s header: refused, in no lane');
  // an activity takes its boundary events to its new lane; one moved to another activity goes to its owner
  const tp = run(EX, bzMoveTo(EX, V(EX), 'bp-take-payment', at(band('bp-warehouse'))));
  assert.deepEqual(['bp-take-payment', 'payment-timeout'].map(id => tp.nodes.find(n => n.id === id).parent), ['bp-warehouse', 'bp-warehouse']);
  const pp = g.byId['pick-pack'], onPick = bzMoveTo(EX, V(EX), 'payment-timeout', { pt: [pp.x + pp.w / 2, pp.y + pp.h + 3], geo: g });
  assert.deepEqual(onPick.slice(0, 2), [{ op: 'set', id: 'payment-timeout', path: 'props.attachedTo', value: 'pick-pack' }, { op: 'reparent', id: 'payment-timeout', parent: 'bp-warehouse' }]); run(EX, onPick);
  // into another pool: refused while its boundary events have sequence flows, or a message flow would join one pool
  const Q = (id, more = {}) => ({ id, type: 'bpmn.Lane', label: id.toUpperCase(), ...more }), two = (nodes, edges) => one([N('p', 'Participant', 'P', { members: [Q('l1')] }), N('q', 'Participant', 'Q', { members: [Q('l2')] }), ...nodes], edges);
  const be = two([N('t', 'Task', 'T', { parent: 'l1' }), N('b', 'BoundaryEvent', 'B', { parent: 'l1', props: { attachedTo: 't', definition: 'timer' } }), N('e', 'EndEvent', 'E', { parent: 'l1' })], [F('f', 'b', 'e')]);
  const into = m => { const gm = layout(m, 'v'), b = gm.bands.find(x => x.id === 'l2'); return bzMoveTo(m, m.views[0], 't', { pt: [b.x + b.w / 2, b.y + b.h / 2], geo: gm }); };
  assert.deepEqual(into(be), { error: 'Move its sequence flows first: a sequence flow stays in its pool' });
  assert.match(into(two([N('t', 'Task', 'T', { parent: 'l1' }), N('u', 'Task', 'U', { parent: 'l2' })], [F('m', 't', 'u', 'MessageFlow')])).error, /^message-scope: /);
  assert.equal(bzMoveTo(EX, V(EX), 'paid', { by: [0, 1], geo: g }), null, 'Alt + arrows: a pin');
  assert.deepEqual(bzMoveTo(EX, V(EX), 'payment-timeout', { by: [0, -1], geo: g }), [{ op: 'set', view: VID, path: ['present', 'payment-timeout', 'side'], value: 'top' }]);
  const c = g.byId['cancel-order'];
  assert.deepEqual(bzMoveTo(EX, V(EX), 'payment-timeout', { pt: [c.x + c.w / 2, c.y + c.h + 3], geo: g }), [{ op: 'set', id: 'payment-timeout', path: 'props.attachedTo', value: 'cancel-order' },
    { op: 'set', view: VID, path: ['present', 'payment-timeout', 'side'], value: 'bottom' }]);
  assert.deepEqual(bzMoveTo(EX, V(EX), 'payment-timeout', { pt: [-500, -500], geo: g }), { error: 'Drop a boundary event on an activity\'s border' });
  for (const id of ['bp-sales', 'bp-bookshop', 'dispatch']) assert.deepEqual(bzMoveTo(EX, V(EX), id, at(band('bp-warehouse'))), [], id);
  const m = run(EX, bzMoveTo(EX, V(EX), 'send-invoice', at(band('bp-warehouse'))));
  assert.ok(within(layout(m, VID).byId['send-invoice'], layout(m, VID).bands.find(b => b.id === 'bp-warehouse')));
});
test('add: into the lane, pool or sub-process selected; a lane into a pool, nested in the lane selected; a boundary event onto the activity selected; data in a pool', () => {
  const E = (label, type, props) => ({ type: 'bpmn.' + type, label, ...(props ? { props } : {}) });
  assert.deepEqual(bzAdd(EX, V(EX), E('Task', 'Task'), 'Pack gift', { sel: ['bp-warehouse'] }), [{ op: 'add', element: { id: 'pack-gift', type: 'bpmn.Task', label: 'Pack gift', parent: 'bp-warehouse' }, view: VID }]);
  assert.equal(bzAdd(EX, V(EX), E('Task', 'Task'), 'X', { sel: ['paid'] })[0].element.parent, 'bp-sales', 'a node selected: in its lane');
  assert.deepEqual(bzAdd(EX, V(EX), E('Timer start', 'StartEvent', { definition: 'timer' }), '', { sel: ['bp-shopper'] })[0].element, { id: 'timer-start', type: 'bpmn.StartEvent', props: { definition: 'timer' }, parent: 'bp-shopper' });
  assert.deepEqual(bzAdd(EX, V(EX), E('Lane', 'Lane'), 'Packing', { sel: ['bp-warehouse'] }), [{ op: 'add', element: { id: 'packing', type: 'bpmn.Lane', label: 'Packing', parent: 'bp-warehouse' }, owner: 'bp-bookshop' }]);
  assert.deepEqual(bzAdd(EX, V(EX), E('Lane', 'Lane'), 'Billing', { sel: ['bp-bookshop'] })[0], { op: 'add', element: { id: 'billing', type: 'bpmn.Lane', label: 'Billing' }, owner: 'bp-bookshop' });
  assert.deepEqual(bzAdd(EX, V(EX), E('Lane', 'Lane'), 'x', { sel: [] }), { error: 'Select a pool to add a lane to' });
  assert.deepEqual(bzAdd(EX, V(EX), E('Boundary', 'BoundaryEvent', { definition: 'timer' }), '', { sel: ['send-invoice'] })[0].element, { id: 'boundary', type: 'bpmn.BoundaryEvent', parent: 'bp-sales', props: { definition: 'timer', attachedTo: 'send-invoice' } });
  assert.deepEqual(bzAdd(EX, V(EX), E('Boundary', 'BoundaryEvent'), '', { sel: ['paid'] }), { error: 'Select an activity to attach a boundary event to' });
  assert.equal(bzAdd(EX, V(EX), E('Data object', 'DataObject'), 'Invoice', { sel: ['bp-sales'] })[0].element.parent, 'bp-bookshop', 'data in the pool, not the lane');
  assert.equal(bzAdd(EX, V(EX), E('Text annotation', 'TextAnnotation'), 'Why', { sel: ['bp-sales'] })[0].element.parent, undefined);
  // audit 4: a collapsed sub-process selected: beside it, in its owner (else it would open here holding the new task alone)
  assert.equal(bzAdd(EX, V(EX), E('Task', 'Task'), 'Count', { sel: ['pick-pack'] })[0].element.parent, 'bp-warehouse', 'beside the collapsed sub-process');
  const xp = run(EX, bzKey(EX, V(EX), ['pick-pack'], 'X'));
  assert.equal(bzAdd(xp, V(xp), E('Task', 'Task'), 'Count', { sel: ['pick-pack'] })[0].element.parent, 'pick-pack', 'into the expanded sub-process selected');
  assert.equal(bzAdd(EX, V(EX), { type: 'uml.Class' }, 'x', null), null);
  for (const [entry, sel] of [[E('Lane', 'Lane'), ['bp-warehouse']], [E('Boundary', 'BoundaryEvent', { definition: 'timer' }), ['send-invoice']], [E('Pool', 'Participant'), []], [E('Group', 'Group'), []]])
    run(EX, bzAdd(EX, V(EX), entry, 'New', { sel }));
});
test('remove: a lane deleted by Delete or Shift + Delete, what it held and its nested lanes moved to its owner; a pool deleted with what it owns, counted; an activity with its boundary events; a group out of categoryValueRef', () => {
  const nest = apply(EX, [{ op: 'add', element: { id: 'packing', type: 'bpmn.Lane', label: 'Packing', parent: 'bp-warehouse' }, owner: 'bp-bookshop' }, { op: 'reparent', id: 'bp-join', parent: 'packing' },
    { op: 'add', element: { id: 'boxes', type: 'bpmn.Lane', label: 'Boxes', parent: 'packing' }, owner: 'bp-bookshop' }, { op: 'reparent', id: 'bp-ship', parent: 'boxes' }]);
  let r = bzRemove(nest, V(nest), ['bp-warehouse'], false); const m = run(nest, r, false);
  // the two flow nodes Warehouse held, now in no lane of a pool that keeps lanes, said with the in-lane warnings they bring (audit 48)
  assert.equal(r.say, 'Deleted lane Warehouse from the model: a lane is not hidden from a view, keeping what it held; 2 flow nodes now in no lane of Bookshop: drag them into a lane');
  assert.deepEqual(validate(m).filter(p => p.rule === 'in-lane').map(p => p.ids[0]), ['pick-pack', 'courier-pickup']);
  // two lanes at once: what they held, the pronoun by the count (audit 57)
  assert.match(bzRemove(EX, V(EX), ['bp-sales', 'bp-warehouse'], true).say, /^Deleted 2 lanes from the model, keeping what they held(;|$)/);
  assert.match(bzRemove(EX, V(EX), ['bp-sales', 'bp-warehouse'], false).say, /^Deleted 2 lanes from the model: a lane is not hidden from a view, keeping what they held(;|$)/);
  const lanes = m.nodes.find(n => n.id === 'bp-bookshop').members;
  assert.deepEqual(lanes.map(l => [l.id, l.parent]), [['bp-sales', undefined], ['packing', undefined], ['boxes', 'packing']], 'the nested lanes kept, one level up');
  assert.deepEqual(['pick-pack', 'bp-join', 'bp-ship', 'courier-pickup'].map(id => m.nodes.find(n => n.id === id).parent), ['bp-bookshop', 'packing', 'boxes', 'bp-bookshop']);
  assert.deepEqual(errors(m), []);
  r = bzRemove(nest, V(nest), ['packing'], true); const m2 = run(nest, r, false);
  assert.deepEqual(m2.nodes.find(n => n.id === 'bp-bookshop').members.map(l => [l.id, l.parent]), [['bp-sales', undefined], ['bp-warehouse', undefined], ['boxes', 'bp-warehouse']]);
  assert.equal(m2.nodes.find(n => n.id === 'bp-join').parent, 'bp-warehouse');
  r = bzRemove(EX, V(EX), ['bp-payment-provider'], true);
  assert.equal(r.say, 'Deleted pool Payment provider and the 0 elements it holds');
  r = bzRemove(EX, V(EX), ['bp-bookshop'], true); assert.match(r.say, /^Deleted pool Bookshop and the 21 elements it holds$/);
  assert.equal(bzRemove(EX, V(EX), ['paid'], true), null); assert.equal(bzRemove(EX, V(EX), ['bp-bookshop'], false), null, 'Delete on a pool: hidden, the default');
  // apply()'s cascade and drops by the type's refs
  const noTask = apply(EX, { op: 'delete', id: 'bp-take-payment' });
  assert.ok(!noTask.nodes.some(n => n.id === 'payment-timeout'), 'an activity takes its boundary events');
  const noGroup = apply(EX, { op: 'delete', id: 'dispatch' });
  assert.deepEqual(['courier-pickup', 'bp-ship', 'shipping-notice'].map(id => noGroup.nodes.find(n => n.id === id).props.categoryValueRef), [[], [], []]);
  assert.deepEqual(errors(noGroup), []);
});
test('audit 50: the lane Delete hint counts only the flow nodes the view still shows, as many as the in-lane warnings after it', () => {
  const said = (m, ids, fm) => { const v = m.views[0], r = bzRemove(m, v, ids, fm), n = apply(m, r.commands);
    return [Number((/(\d+) flow nodes? now in no lane/.exec(r.say) || [0, 0])[1]), validate(n).filter(p => p.rule === 'in-lane' && p.ids[1] === 'bp-bookshop').length]; };
  const hid = structuredClone(EX); hid.views[0].nodeIds = hid.views[0].nodeIds.filter(x => x !== 'bp-join');
  for (const [m, ids, fm, k] of [[EX, ['bp-warehouse'], false, 4], [EX, ['bp-warehouse', 'pick-pack'], false, 3], [hid, ['bp-warehouse'], false, 3], [hid, ['bp-warehouse'], true, 3], [EX, ['bp-warehouse', 'pick-pack'], true, 3]])
    assert.deepEqual(said(m, ids, fm), [k, k], `${ids} ${fm ? 'Shift + Delete' : 'Delete'}`);
});
test('key: A on a boundary event picks another activity of its pool; X expands or collapses a sub-process in the view (decision 22); other keys are the canvas\'s', () => {
  const r = bzKey(EX, V(EX), ['payment-timeout'], 'a');
  assert.deepEqual(r.pick, ['Cancel order', 'Email invoice', 'Pick and pack', 'Hand parcel to courier'], 'the activities of its pool its flow can follow it to: none in a sub-process');
  assert.deepEqual(r.then(0), [{ op: 'set', id: 'payment-timeout', path: 'props.attachedTo', value: 'cancel-order' }]);
  const pk = run(EX, r.then(2)); assert.equal(pk.nodes.find(n => n.id === 'payment-timeout').parent, 'bp-warehouse', 'to its new activity\'s lane');
  const open = bzKey(EX, V(EX), ['pick-pack'], 'X'), m = run(EX, open);
  assert.deepEqual(V(m).nodeIds.slice(V(m).nodeIds.indexOf('pick-pack'), V(m).nodeIds.indexOf('pick-pack') + 5), ['pick-pack', 'picking-starts', 'pick-books', 'pack-parcel', 'parcel-packed']);
  const g = clean(m, VID); assert.deepEqual(g.bad, []); assert.equal(g.g.families[0].id, 'pick-pack');
  assert.equal(g.g.byId['pick-pack'], undefined, 'expanded: a box, not a node');
  assert.deepEqual(V(run(m, bzKey(m, V(m), ['pick-pack'], 'x'))).nodeIds, V(EX).nodeIds, 'X again collapses it');
  for (const k of ['e', 'E', 'b', 'Delete']) assert.equal(bzKey(EX, V(EX), ['pick-pack'], k), null, k);
  assert.equal(bzKey(EX, V(EX), ['paid'], 'a'), null);
  assert.deepEqual(bzKey(EX, V(EX), ['send-invoice'], 'x'), null);
});
test('the Owner field: a flow node\'s pools, sub-processes and lanes by their names from the top; data\'s pools; a lane\'s none', () => {
  const o = bzOwners(EX, EX.nodes.find(n => n.id === 'paid'));
  // with sequence flows, its pool's lanes only (audit 18): another pool or a sub-process would bring a sequence-scope error
  assert.deepEqual(o.map(x => x.label), ['Bookshop::Sales', 'Bookshop::Warehouse']);
  // with none, the other pools (not one with lanes) and the sub-processes too, by their names from the top
  const free = structuredClone(EX); free.edges = free.edges.filter(e => e.from !== 'paid' && e.to !== 'paid');
  assert.deepEqual(bzOwners(free, free.nodes.find(n => n.id === 'paid')).map(x => x.label), ['Shopper', 'Bookshop::Warehouse::Pick and pack', 'Payment provider', 'Bookshop::Sales', 'Bookshop::Warehouse']);
  assert.deepEqual(bzOwners(EX, EX.nodes.find(n => n.id === 'bp-order')).map(x => x.id), ['bp-shopper', 'bp-bookshop', 'bp-payment-provider']);
  assert.equal(bzOwners(EX, { id: 'bp-sales', type: 'bpmn.Lane' }), null); assert.equal(bzOwners(EX, EX.edges[0]), null);
});

test('save and reopen (DoD 6): a 30-step BPMN session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const E = T.edits, el = (label, type, props) => ({ type: 'bpmn.' + type, label, ...(props ? { props } : {}) }), g = m => layout(m, VID), band = (m, id) => g(m).bands.find(b => b.id === id);
  const mid = b => [b.x + b.w / 2 + 40, b.y + b.h / 2 + 30];
  const steps = [
    m => E.add(m, V(m), el('Task', 'Task'), 'Gift wrap', { sel: ['bp-warehouse'] }), m => E.connect(m, V(m), 'bp-join', 'gift-wrap'),
    m => [{ op: 'set', id: 'bp-join-gift-wrap', path: 'label', value: 'wrap' }], m => E.moveTo(m, V(m), 'gift-wrap', { pt: mid(band(m, 'bp-sales')), geo: g(m) }),
    m => [{ op: 'set', id: 'gift-wrap', path: 'props.taskType', value: 'user' }], m => E.add(m, V(m), el('Lane', 'Lane'), 'Packing', { sel: ['bp-warehouse'] }),
    m => [{ op: 'reparent', id: 'bp-join', parent: 'packing' }], m => [{ op: 'set', view: VID, path: ['layout', 'bp-ship'], value: [9, 0] }],
    m => E.add(m, V(m), el('Boundary', 'BoundaryEvent', { definition: 'timer' }), '', { sel: ['bp-ship'] }), m => E.connect(m, V(m), 'boundary', 'order-shipped'),
    m => E.moveTo(m, V(m), 'boundary', { by: [0, -1], geo: g(m) }), m => [{ op: 'set', id: 'boundary', path: 'props.cancelActivity', value: false }],
    m => E.remove(m, V(m), ['packing'], false).commands, m => [{ op: 'set', id: 'bp-take-payment', path: 'props.documentation', value: 'Charged once.' }],
    m => E.key(m, V(m), ['pick-pack'], 'x'), m => E.add(m, V(m), el('Task', 'Task'), 'Count', { sel: ['pick-pack'] }),
    m => [{ op: 'delete', id: 'f-pack' }], m => E.connect(m, V(m), 'pick-books', 'count'), m => E.connect(m, V(m), 'count', 'pack-parcel'),
    m => E.key(m, V(m), ['boundary'], 'a').then(0), m => E.add(m, V(m), el('Data store', 'DataStoreReference'), 'Ledger', { sel: ['bp-sales'] }),
    m => E.connect(m, V(m), 'send-invoice', 'ledger'), m => [{ op: 'hide', id: 'ledger', view: VID }],
    m => E.add(m, V(m), el('Text annotation', 'TextAnnotation'), 'Gifts only in December', null), m => E.connect(m, V(m), 'gifts-only-in-december', 'gift-wrap'),
    m => [{ op: 'delete', id: 'gifts-only-in-december' }], m => [{ op: 'set', view: VID, path: 'direction', value: 'down' }],
    m => E.key(m, V(m), ['pick-pack'], 'X'), m => E.remove(m, V(m), ['bp-payment-provider'], true).commands, m => [{ op: 'set', id: 'bp-sales', path: 'label', value: 'Sales desk' }],
  ];
  assert.equal(steps.length, 30);
  const h = history(EX), seen = [JSON.stringify(h.model)], cmds = [];
  for (const s of steps) { const c = s(h.model);
    assert.ok(Array.isArray(c) && c.length, `step ${seen.length}: ${JSON.stringify(c)}`); cmds.push(c);
    h.push(apply(h.model, c)); seen.push(JSON.stringify(h.model)); assert.deepEqual(errors(h.model), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = cmds.slice(15).reduce((m, c) => apply(m, c), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const geo = m => JSON.stringify(layout(m, VID), (k, v) => (k === 'ms' || k === 's' || k === 't' ? undefined : v));
  assert.equal(geo(reopened), geo(JSON.parse(seen[30])));
  assert.deepEqual(clean(reopened, VID).bad, []);
});

/* ---- §14 (S16): a view of 60 flow nodes, three pools, six lanes, ten boundary events, ten message flows and two expanded
   sub-processes; a full layout and the common edits, laid out and drawn, CPU best of five after a warm-up ---- */
function stress() {
  const nodes = [], edges = [], add = (id, type, label, more = {}) => nodes.push(N(id, type, label, more)), flow = (...a) => edges.push(F(...a));
  const POOLS = [['P0', ['a', 'b', 'c']], ['P1', ['d', 'e']], ['P2', ['f']]], tasks = {};
  POOLS.forEach(([P, lanes], p) => { add(P, 'Participant', 'Pool ' + p, { members: lanes.map(l => ({ id: l, type: 'bpmn.Lane', label: 'Lane ' + l, ...(l === 'c' ? { parent: 'b' } : {}) })) });
    const top = []; tasks[P] = [];
    for (let k = 0; k < 17; k++) { const id = `${P}n${k}`, lane = lanes[Math.floor(k / 4) % lanes.length];
      if (k === 0) add(id, 'StartEvent', 'Start ' + P, { parent: lane, props: { definition: 'none' } });
      else if (k === 16) add(id, 'EndEvent', 'End ' + P, { parent: lane, props: { definition: 'none' } });
      else if (k % 4 === 2) add(id, 'ExclusiveGateway', `Check ${P}.${k}?`, { parent: lane });
      else if (k === 9 && p < 2) add(id, 'SubProcess', `Sub-process ${P}`, { parent: lane });
      else { add(id, 'Task', `Task ${P}.${k}`, { parent: lane, props: { taskType: ['none', 'user', 'service'][k % 3] } }); tasks[P].push(id); }
      top.push(id); }
    top.forEach((id, i) => { if (i) flow(`s-${top[i - 1]}`, top[i - 1], id, 'SequenceFlow', /Gateway/.test(nodes.find(n => n.id === top[i - 1]).type) ? { label: 'yes' } : {}); });
    top.forEach((id, i) => { if (/Gateway/.test(nodes.find(n => n.id === id).type) && top[i + 2]) flow(`x-${id}`, id, top[i + 2], 'SequenceFlow', { label: 'no' }); });
    if (p < 2) { const S = `${P}n9`; add(`${S}s`, 'StartEvent', 'In', { parent: S, props: { definition: 'none' } }); add(`${S}t`, 'Task', 'Inside', { parent: S }); add(`${S}e`, 'EndEvent', 'Out', { parent: S, props: { definition: 'none' } });
      flow(`${S}f1`, `${S}s`, `${S}t`); flow(`${S}f2`, `${S}t`, `${S}e`); } });
  ['P0n1', 'P0n3', 'P0n3', 'P0n9', 'P1n1', 'P1n5', 'P1n13', 'P2n3', 'P2n7', 'P2n11'].forEach((on, i) => { const host = nodes.find(n => n.id === on);
    add('be' + i, 'BoundaryEvent', 'Late ' + i, { parent: host.parent, props: { attachedTo: on, definition: i % 2 ? 'message' : 'timer', ...(i % 3 ? {} : { cancelActivity: false }) } });
    flow('fbe' + i, 'be' + i, `${on.slice(0, 2)}n${Math.min(16, +on.slice(3) + 3)}`); });
  for (let i = 0; i < 10; i++) { const a = POOLS[i % 3][0], b = POOLS[(i + 1) % 3][0]; flow('m' + i, tasks[a][i % tasks[a].length], tasks[b][(i + 2) % tasks[b].length], 'MessageFlow', { label: 'Message ' + i }); }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'bpmn', title: 'Stress', nodeIds: nodes.map(n => n.id) }] };
}
test('the stress view: 60 flow nodes, three pools, six lanes, ten boundary events, ten message flows, two expanded sub-processes; valid; laid out clean right and down', () => {
  const M = stress(), H = homes(M);
  assert.equal(M.nodes.filter(n => /Event$|Gateway$|Task$|SubProcess$/.test(n.type) && n.type !== 'bpmn.BoundaryEvent').length + 10, 67);
  assert.deepEqual(validate(M), []);
  for (const d of ['right', 'down']) { const r = clean(dir(M, d), 'all');
    console.log(`# the stress view, ${d}: ${r.g.edges.length} lines, ${r.crossings.length} crossings`);
    assert.deepEqual([r.bad, r.others], [[], []], d); assert.equal(r.g.families.length, 2); assert.equal(r.g.nodes.filter(n => n.type === 'bpmn.BoundaryEvent').length, 10);
    assert.equal(r.g.bands.filter(b => b.depth).length, 6); }
});
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('performance (§14, S16): the stress view\'s full layout and the common edits, laid out and drawn, under 1 s in CI, each against its target printed (CPU, best of five after a warm-up) (timed)', () => {
  const M = stress(), g0 = layout(M, 'all'), band = id => g0.bands.find(b => b.id === id);
  const edits = { documentation: [{ op: 'set', id: 'P0n1', path: 'props.documentation', value: 'Checked twice.' }], 'a task renamed': [{ op: 'set', id: 'P1n7', path: 'label', value: 'Check the order against the stock ledger' }],
    'a sequence flow\'s name': [{ op: 'set', id: 's-P0n3', path: 'label', value: 'when the stock is short' }],
    'a flow node moved to another lane': bzMoveTo(M, M.views[0], 'P0n13', { pt: [band('c').x + band('c').w / 2, band('c').y + band('c').h / 2], geo: g0 }),
    'a boundary event\'s side': bzMoveTo(M, M.views[0], 'be0', { by: [0, -1], geo: g0 }) };
  assert.deepEqual(edits['a flow node moved to another lane'], [{ op: 'reparent', id: 'P0n13', parent: 'c' }]);
  const draw = (m, memos) => mapContext(m, { memos }).buildView('all').markup;
  const memos = {}; draw(M, memos); Object.values(edits).forEach(c => { draw(apply(M, c), memos); draw(M, memos); }); // the warm-up
  const best = {}, full = []; for (let k = 0; k < 5; k++) full.push(cpu(() => draw(M, {})));
  best['full layout'] = Math.min(...full);
  Object.entries(edits).forEach(([name, c]) => { const m = apply(M, c), t = []; for (let k = 0; k < 5; k++) { draw(M, memos); t.push(cpu(() => draw(m, memos))); } best[name] = Math.min(...t); });
  console.log('# 4b.3 timings: ' + Object.entries(best).map(([k, v]) => `${k} ${v.toFixed(1)} ms (target ${k === 'full layout' ? 1000 : 100} ms)`).join(', '));
  Object.entries(best).forEach(([k, v]) => assert.ok(v < 1000, `${k} ${v} ms`));
});

test('audit 1: deleting a lane keeps its nested lanes in its place', () => {
  const m = { schemaVersion: 2, nodes: [N('P', 'Participant', 'Shop', { members: [{ id: 'B', type: 'bpmn.Lane', label: 'B', parent: 'A' }, { id: 'A', type: 'bpmn.Lane', label: 'A', parent: 'G' },
    { id: 'G', type: 'bpmn.Lane', label: 'G' }, { id: 'H', type: 'bpmn.Lane', label: 'H' }] }), N('s', 'StartEvent', null, { parent: 'B' }), N('t', 'Task', 'T', { parent: 'A' }), N('e', 'EndEvent', null, { parent: 'H' })],
  edges: [F('f1', 's', 't'), F('f2', 't', 'e')], views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['P', 's', 't', 'e'] }] };
  const lanes = x => layout(x, 'v').bands.filter(b => b.depth).sort((a, b) => a.y - b.y).map(b => b.id).join(' ');
  assert.equal(lanes(m), 'G A B H');
  assert.equal(lanes(apply(m, bzRemove(m, m.views[0], ['G'], false).commands)), 'A B H');
});

test('audit 2: a pin far off the grid is held at its edge, laid out at once, and validate() says so (timed)', () => {
  for (const pin of [[1e308, 0], [0, -1e7]]) { const m = structuredClone(EX); V(m).layout = { ...(V(m).layout || {}), 'order-placed': pin };
    const t = performance.now(); assert.ok(layout(m, VID).byId['order-placed'], 'laid out'); assert.ok(performance.now() - t < 5000, 'quickly');
    assert.ok(validate(m).some(p => p.path === `views[${m.views.indexOf(V(m))}].layout.order-placed` && /off the grid/.test(p.message)), 'warned'); }
});

test('audit 3: sub-processes nested 600 deep lay out and are described in about linear time (before: cubic, 20 s) (timed)', () => {
  const nodes = Array.from({ length: 600 }, (_, i) => N('sp' + i, 'SubProcess', 'S' + i, i ? { parent: 'sp' + (i - 1) } : {})).concat(N('t', 'Task', 'T', { parent: 'sp599' }));
  const m = one(nodes, []), t = performance.now();
  assert.equal(layout(m, 'v').nodes.length, 1); assert.match(describe(m, 'v'), /S599/);
  assert.ok(performance.now() - t < 4000, `${Math.round(performance.now() - t)} ms`);
});

test('audit 3: lanes, and sub-processes, nested 3,000 deep lay out (the lane pass and the boxes\' placement walk with their own stacks)', () => {
  const subs = Array.from({ length: 3000 }, (_, i) => N('sp' + i, 'SubProcess', 'S' + i, i ? { parent: 'sp' + (i - 1) } : {})).concat(N('t', 'Task', 'T', { parent: 'sp2999' }));
  assert.equal(layout(one(subs, []), 'v').nodes.length, 1);
  const members = Array.from({ length: 3000 }, (_, i) => ({ id: 'l' + i, type: 'bpmn.Lane', label: 'L' + i, ...(i ? { parent: 'l' + (i - 1) } : {}) }));
  const m = one([N('P', 'Participant', 'P', { members }), N('s', 'StartEvent', null, { parent: 'l2999' }), N('e', 'EndEvent', null, { parent: 'l2999' })], [F('f', 's', 'e')]);
  assert.equal(layout(m, 'v').nodes.length, 3003);
});

test('audit 7: a line listed twice in view.edges is drawn, read and counted once, and crosses nothing', () => {
  const once = structuredClone(EX); V(once).edges = once.edges.map(e => e.id);
  const m = structuredClone(once); V(m).edges.push('f-basket');
  const g = layout(m, VID);
  assert.equal(g.edges.filter(e => e.id === 'f-basket').length, 1); assert.equal(g.order.filter(x => x === 'f-basket').length, 1);
  assert.equal(describe(m, VID), describe(once, VID));
  assert.deepEqual(check(m, VID).map(p => p.message), check(once, VID).map(p => p.message));
});

test('audit 7: a flow named for an Object.prototype key, or a pool named __proto__, lays out and draws', () => {
  const m = { schemaVersion: 2, title: 'T', nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'Shop' },
    { id: 'start', type: 'bpmn.StartEvent', label: 'Order in', parent: 'pool', props: { definition: 'none' } }, { id: 'ship', type: 'bpmn.Task', label: 'Ship', parent: 'pool' },
    { id: 'end', type: 'bpmn.EndEvent', label: 'Done', parent: 'pool', props: { definition: 'none' } }],
    edges: [{ id: 'toString', type: 'bpmn.SequenceFlow', from: 'start', to: 'ship' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 'ship', to: 'end' }],
    views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['pool', 'start', 'ship', 'end'] }] };
  for (const x of [m, JSON.parse(JSON.stringify(m).replaceAll('"toString"', '"constructor"').replaceAll('"pool"', '"__proto__"'))]) {
    const g = layout(x, 'v'); assert.deepEqual(g.nodes.map(n => n.id).sort(), x.nodes.map(n => n.id).sort()); assert.ok(svgOf(g, {}).length); }
});

test('audit 11: a documented pool keeps its lanes in its PDF row, and a lane\'s documentation is printed there', () => {
  const m = apply(EX, [{ op: 'set', id: 'bp-bookshop', path: 'props.documentation', value: 'The shop itself' }, { op: 'set', id: 'bp-sales', path: 'props.documentation', value: 'Takes orders' }]);
  assert.deepEqual(T.rows(m, V(m), 'bp-bookshop'), ['The shop itself', 'Sales — Takes orders', 'Warehouse']);
});

test('audit 11: Delete of a lane with a model line, on a view with no edges list, deletes the lane and skips the line (apply() refuses its hide)', () => {
  assert.ok(!Array.isArray(V(EX).edges));
  const r = bzRemove(EX, V(EX), ['bp-sales', 'f-basket'], false);
  assert.ok(!r.commands.some(c => c.id === 'f-basket'), 'the line is not hidden');
  assert.match(r.say, /Shift \+ Delete deletes the line/);
  const m = apply(EX, r.commands);
  assert.ok(!JSON.stringify(m.nodes).includes('"bp-sales"') && m.edges.some(e => e.id === 'f-basket'));
});

test('audit 12: Delete of a lane with a node it holds both selected deletes the lane and hides the node, kept in the model; Shift + Delete deletes both', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'Shop', members: [{ id: 'l1', type: 'bpmn.Lane', label: 'Sales' }, { id: 'l2', type: 'bpmn.Lane', label: 'Store' }] },
    { id: 'start', type: 'bpmn.StartEvent', parent: 'l1', props: { definition: 'none' } }, { id: 'task', type: 'bpmn.Task', label: 'Pack', parent: 'l1' }, { id: 'end', type: 'bpmn.EndEvent', parent: 'l2', props: { definition: 'none' } }],
  edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 'start', to: 'task' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 'task', to: 'end' }],
  views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['pool', 'start', 'task', 'end'] }] };
  const n = apply(m, bzRemove(m, m.views[0], ['l1', 'task'], false).commands);
  assert.equal(n.nodes.find(x => x.id === 'task').parent, 'pool'); assert.ok(!n.views[0].nodeIds.includes('task') && !JSON.stringify(n.nodes).includes('"l1"'));
  assert.ok(!apply(m, bzRemove(m, m.views[0], ['l1', 'task'], true).commands).nodes.some(x => x.id === 'task'));
});

test('audit 11: a boundary event\'s side named for an Object.prototype key is no pin: the event stays on its activity\'s bottom border', () => {
  const at = side => { const m = structuredClone(EX); if (side) V(m).present = { ...V(m).present, 'payment-timeout': { side } };
    const g = layout(m, VID), c = g.byId['payment-timeout'], h = g.byId['bp-take-payment']; return [c.x + c.w / 2 - h.x, c.y + c.h / 2 - h.y]; };
  const plain = at();
  for (const side of ['toString', 'constructor', '__proto__', 'valueOf']) assert.deepEqual(at(side), plain, side);
});

test('audit 15: a flow node added with a pool that has lanes selected goes in its first lane: no in-lane warning', () => {
  const r = bzAdd(EX, V(EX), { type: 'bpmn.Task' }, 'New step', { sel: ['bp-bookshop'] });
  assert.equal(r[0].element.parent, 'bp-sales');
  assert.deepEqual(bzProblems(apply(EX, r)).filter(p => p.rule === 'in-lane'), []);
});

test('audit 16: the first lane added to a pool holding flow nodes takes them in: no in-lane warning', () => {
  const m = JSON.parse(readFileSync(new URL('./bpmn-minimal.json', import.meta.url), 'utf8')), r = bzAdd(m, m.views[0], { type: 'bpmn.Lane' }, 'Sales', { sel: ['pool'] });
  assert.deepEqual(r.slice(1).map(c => [c.op, c.id, c.parent]), [['reparent', 'start', 'sales'], ['reparent', 'task', 'sales'], ['reparent', 'end', 'sales']]);
  assert.deepEqual(bzProblems(apply(m, r), m.views[0]).filter(p => p.rule === 'in-lane'), []);
});

test('audit 18: the Owner field moves an activity with its boundary events, offers no owner a drop refuses, and guards the rest', () => {
  const act = EX.nodes.find(n => n.id === 'bp-take-payment'), key = p => p.rule + ' ' + p.ids.join(' '), was = new Set(validate(EX).map(key));
  assert.deepEqual(bzOwners(EX, act).map(o => o.id).sort(), ['bp-sales', 'bp-warehouse']);
  assert.deepEqual(T.edits.owner(EX, V(EX), 'bp-take-payment', 'bp-warehouse'), [{ op: 'reparent', id: 'bp-take-payment', parent: 'bp-warehouse' }, { op: 'reparent', id: 'payment-timeout', parent: 'bp-warehouse' }]);
  // every owner the field could hold, offered or not: commands that bring no new problem, or a refusal
  for (const o of [...EX.nodes.filter(n => ['bpmn.Participant', 'bpmn.SubProcess'].includes(n.type)).map(n => n.id), 'bp-sales', 'bp-warehouse', null]) {
    const r = bzOwner(EX, V(EX), 'bp-take-payment', o);
    if (r && r.error) continue;
    const m = apply(EX, r), now = validate(m).filter(p => !was.has(key(p)) && (p.level === 'error' || ['boundary-host', 'in-lane'].includes(p.rule)));
    assert.deepEqual(now, [], String(o));
  }
  assert.match(bzOwner(EX, V(EX), 'bp-take-payment', 'bp-payment-provider').error, /Move its sequence flows first/);
  assert.match(bzOwner(EX, V(EX), 'bp-take-payment', 'bp-bookshop').error, /^in-lane/);
  // a node with no sequence flow is offered the other pools, and a pool with lanes still not
  const lone = one([N('p', 'Participant', 'P', { members: [{ id: 'l1', type: 'bpmn.Lane', label: 'L1' }, { id: 'l2', type: 'bpmn.Lane', label: 'L2' }] }), N('q', 'Participant', 'Q'), N('t', 'Task', 'T', { parent: 'l1' })], []);
  assert.deepEqual(bzOwners(lone, lone.nodes[2]).map(o => o.id).sort(), ['l1', 'l2', 'q']);
  assert.deepEqual(bzOwner(lone, lone.views[0], 't', 'q'), [{ op: 'reparent', id: 't', parent: 'q' }]);
  // a boundary event moves with its activity: another owner is refused (audit 19; the field offers none)
  assert.deepEqual(bzOwner(EX, V(EX), 'payment-timeout', 'bp-warehouse'), { error: 'A boundary event moves with its activity: move Take payment' });
});

test('audit 18: Delete on an activity hides its boundary events with it, said on the hint line', () => {
  const r = bzRemove(EX, V(EX), ['bp-take-payment'], false);
  assert.deepEqual(r.commands, [{ op: 'hide', id: 'bp-take-payment', view: VID }, { op: 'hide', id: 'payment-timeout', view: VID }]);
  assert.equal(r.say, 'Hid its boundary event No answer in 2 minutes with Take payment');
  const m = apply(EX, r.commands);
  assert.ok(!V(m).nodeIds.includes('payment-timeout'));
  assert.ok(!describe(m, VID).includes('No answer'), describe(m, VID));
  // the event selected too: hidden once; Shift + Delete is still the model's cascade; a task with none: the default
  assert.deepEqual(bzRemove(EX, V(EX), ['bp-take-payment', 'payment-timeout'], false), null);
  assert.equal(bzRemove(EX, V(EX), ['bp-take-payment'], true), null);
  assert.equal(bzRemove(EX, V(EX), ['cancel-order'], false), null);
  // an expanded sub-process: what the view shows in it hidden with it, as X's collapse does
  const open = apply(EX, T.edits.key(EX, V(EX), ['pick-pack'], 'x')), s = bzRemove(open, V(open), ['pick-pack'], false);
  assert.deepEqual(s.commands.map(c => c.id), ['pick-pack', 'picking-starts', 'pick-books', 'pack-parcel', 'parcel-packed']);
  assert.equal(s.say, 'Hid the 4 elements shown in or on it with Pick and pack');
  assert.deepEqual(V(apply(open, s.commands)).nodeIds, V(EX).nodeIds.filter(id => id !== 'pick-pack'));
});

test('audit 19: a data association across pools is refused by connect, as a move refuses it, and is a data-ends error', () => {
  const v = V(EX);
  assert.deepEqual(bzConnect(EX, v, 'bp-order', 'place-order'), { error: 'Data stays in the pool of what it is associated with' });
  assert.deepEqual(bzConnect(EX, v, 'place-order', 'bp-order'), { error: 'Data stays in the pool of what it is associated with' });
  const ok = bzConnect(EX, v, 'bp-order', 'bp-take-payment'); // the same pool: drawn
  assert.ok(Array.isArray(ok) && ok[0].element.type === 'bpmn.DataAssociation', JSON.stringify(ok));
  const m = structuredClone(EX); m.edges.push({ id: 'd-x', type: 'bpmn.DataAssociation', from: 'bp-order', to: 'place-order' });
  assert.deepEqual(errors(m).map(p => p.message), ['data-ends: d-x joins bp-order ("Order"), data of bp-bookshop ("Bookshop"), and place-order ("Place order") in bp-shopper ("Shopper"): data stays in the pool (process) of what it is associated with']);
  // data and activities in no pool at all: nothing to keep apart
  const free = one([N('d', 'DataObject', 'D'), N('t', 'Task', 'T')], []);
  assert.ok(Array.isArray(bzConnect(free, V(free, 'v'), 'd', 't')));
});

test('audit 20: data in no pool joins an activity of any pool: connect, a move and validate keep one rule', () => {
  const top = structuredClone(EX); delete top.nodes.find(n => n.id === 'bp-stock').parent;
  assert.ok(!errors(top).some(p => /data-ends|lane-owner/.test(p.message)), 'a store outside every pool, read in the bookshop: no problem');
  const r = bzConnect(top, V(top), 'bp-stock', 'bp-take-payment');
  assert.ok(Array.isArray(r) && r[0].element.type === 'bpmn.DataAssociation', JSON.stringify(r));
  assert.ok(!errors(apply(top, r)).some(p => /data-ends/.test(p.message)));
  const back = bzConnect(top, V(top), 'place-order', 'bp-stock'); // another pool's task: drawn too, as validate allows it
  assert.ok(Array.isArray(back) && !errors(apply(top, back)).some(p => /data-ends/.test(p.message)), JSON.stringify(back));
  // a move of associated data to no pool is no move to another pool; into another pool it still is
  const out = bzOwner(EX, V(EX), 'bp-stock', null);
  assert.ok(Array.isArray(out) && out[0].op === 'reparent' && out[0].parent === null, JSON.stringify(out));
  assert.deepEqual(bzOwner(EX, V(EX), 'bp-stock', 'bp-shopper'), { error: 'Data stays in the pool of what it is associated with' });
});

test('audit 19: a boundary event has no Owner field; an owner other than its activity\'s is refused, said', () => {
  const be = EX.nodes.find(n => n.id === 'payment-timeout'), v = V(EX);
  assert.equal(bzOwners(EX, be), null);
  assert.equal(T.owners(EX, be), null);
  assert.deepEqual(bzOwner(EX, v, 'payment-timeout', 'bp-warehouse'), { error: 'A boundary event moves with its activity: move Take payment' });
  assert.deepEqual(bzOwner(EX, v, 'payment-timeout', 'bp-sales'), [], 'where it is: nothing');
  const lone = one([N('p', 'Participant', 'P'), N('q', 'Participant', 'Q'), N('t', 'Task', 'T', { parent: 'p' }), N('b', 'BoundaryEvent', 'B', { parent: 'p', props: { attachedTo: 't' } })], []);
  assert.equal(bzOwners(lone, lone.nodes[3]), null);
  assert.deepEqual(bzOwner(lone, V(lone, 'v'), 'b', 'q'), { error: 'A boundary event moves with its activity: move T' });
  const m = structuredClone(lone); m.nodes[3].parent = 'q'; // out of line already: back to its activity's owner, the default
  assert.equal(bzOwner(m, V(m, 'v'), 'b', 'p'), null);
});

test('audit 21: the rules, the guard and the Owner field read a view\'s own lines (view.edges objects), which it draws', () => {
  const m = structuredClone(EX), v = V(m), f = m.edges.find(e => e.id === 'f-basket');
  m.edges = m.edges.filter(e => e !== f); v.edges = [...m.edges.map(e => e.id), { ...f }];
  assert.ok(layout(m, VID).edges.some(e => e.id === 'f-basket'));
  assert.deepEqual(validate(m).filter(p => p.ids.includes('place-order')), [], 'the same picture, no false flow-start');
  const bad = { id: 'own-bad', type: 'bpmn.SequenceFlow', from: 'order-placed', to: 'basket-ready' }; v.edges.push(bad);
  const got = bzProblems(m, v).filter(p => p.ids.includes('own-bad')), asModel = bzProblems({ ...structuredClone(EX), edges: [...EX.edges, bad] }, V(EX)).filter(p => p.ids.includes('own-bad'));
  assert.deepEqual(got.map(p => p.message), asModel.map(p => p.message), 'the errors a model line gets');
  assert.equal(got.length, 2);
  assert.ok(got.every(p => p.path === `views[0].edges[${v.edges.length - 1}]`), 'its path is in the view');
  assert.deepEqual(bzProblems(m, V(m, 'pick-and-pack')).filter(p => p.ids.includes('own-bad')), [], 'another view does not read it');
  assert.match(bzOwner(m, v, 'basket-ready', 'bp-bookshop').error, /sequence flow stays in its pool/, 'an own sequence flow holds its ends in their pool');
  assert.ok('error' in bzConnect(m, v, 'order-placed', 'basket-ready'), 'the guard sees them too');
});

test('audit 22: a view\'s own node (add ... in: \'view\') is a flow node for the rules, drawn, and described; a sequence flow to it is valid', () => {
  const base = { schemaVersion: 2, nodes: [{ id: 's', type: 'bpmn.StartEvent', label: 'Start' }, { id: 't', type: 'bpmn.Task', label: 'Work' }],
    edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' }], views: [{ id: 'p', diagram: 'bpmn', nodeIds: ['s', 't'] }] };
  let m = apply(base, [{ op: 'add', element: { id: 'e', type: 'bpmn.EndEvent', label: 'Done' }, view: 'p', in: 'view' }]);
  m = apply(m, [{ op: 'add', element: { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }, view: 'p' }]);
  assert.deepEqual(validate(m), [], 'no sequence-ends error, no flow-start warning');
  const g = layout(m, 'p');
  assert.deepEqual([g.nodes.map(n => n.id).sort(), g.edges.map(e => e.id).sort()], [['e', 's', 't'], ['f1', 'f2']]);
  assert.match(describe(m, 'p'), /End event Done/);
  // a view-own line to it in the view's edges, too
  const own = structuredClone(m); own.edges = own.edges.filter(e => e.id !== 'f2'); own.views[0].edges = ['f1', { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }];
  assert.deepEqual(validate(own), []);
  // a real error still found on a view-own node: a sequence flow out of an end event
  const bad = structuredClone(own); bad.views[0].edges.push({ id: 'f3', type: 'bpmn.SequenceFlow', from: 'e', to: 't' });
  assert.ok(validate(bad).some(p => p.rule === 'end-out' || /end event/.test(p.message)), JSON.stringify(validate(bad)));
});

test('audit 22: Delete with a view-own line selected beside an activity with a boundary event, or a lane, deletes the line and applies', () => {
  const M = { schemaVersion: 2, nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'Pool', members: [{ id: 'lane', type: 'bpmn.Lane', label: 'Lane' }] },
    { id: 'start', type: 'bpmn.StartEvent', label: 'Start', parent: 'lane', props: { definition: 'none' } },
    { id: 'task', type: 'bpmn.Task', label: 'Task', parent: 'lane' }, { id: 'end', type: 'bpmn.EndEvent', label: 'End', parent: 'lane', props: { definition: 'none' } },
    { id: 'be', type: 'bpmn.BoundaryEvent', label: 'Timeout', parent: 'lane', props: { definition: 'timer', attachedTo: 'task' } }],
  edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 'start', to: 'task' }],
  views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['pool', 'start', 'task', 'end', 'be'], edges: ['f1', { id: 'own', type: 'bpmn.SequenceFlow', from: 'task', to: 'end' }, { id: 'own2', type: 'bpmn.SequenceFlow', from: 'be', to: 'end' }] }] };
  for (const [ids, gone] of [[['task', 'own'], ['own', 'own2']], [['own2', 'task'], ['own', 'own2']], [['lane', 'own'], ['own']], [['task', 'own2'], ['own', 'own2']], [['start', 'own'], ['own']]]) {
    const r = bzRemove(M, M.views[0], ids, false), cs = r ? r.commands : null;
    if (!cs) { assert.ok(!ids.includes('task') && !ids.includes('lane'), `${ids}: bzRemove's own path`); continue; }
    const m2 = apply(M, cs), left = m2.views[0].edges.map(e => (typeof e === 'string' ? e : e.id));
    for (const id of gone) assert.ok(!left.includes(id), `${ids}: ${id} gone`);
    assert.deepEqual(m2.nodes.map(n => n.id), M.nodes.map(n => n.id), `${ids}: the model keeps its nodes`);
  }
  // the line deleted, not hidden: its first command
  assert.deepEqual(bzRemove(M, M.views[0], ['task', 'own'], false).commands[0], { op: 'delete', id: 'own' });
});

// audit 23: Delete on a view-own expanded sub-process holding a model task deletes the sub-process and hides the task, which
// stays in the model, under the sub-process's owner (apply() takes no model node with a view's own owner)
test('audit 23: Delete on a view-own sub-process that holds a model task applies, and keeps the task in the model', () => {
  const m0 = JSON.parse(readFileSync(new URL('./bpmn-minimal.json', import.meta.url), 'utf8')), vid = m0.views[0].id;
  const m = apply(m0, [{ op: 'add', in: 'view', view: vid, element: { id: 'sub', type: 'bpmn.SubProcess', label: 'Check', parent: 'pool' } },
    { op: 'add', in: 'view', view: vid, element: { id: 'own', type: 'bpmn.Task', label: 'Own work', parent: 'sub' } }]);
  m.nodes.push({ id: 'inner', type: 'bpmn.Task', label: 'Inner work', parent: 'sub' }); m.views[0].nodeIds.push('inner'); // as a model saved before audit 23 holds it
  for (const fromModel of [false, true]) {
    const r = diagramOf(m.views[0]).edits.remove(m, m.views[0], ['sub'], fromModel), cmds = r == null ? [{ op: 'delete', id: 'sub' }] : Array.isArray(r) ? r : r.commands; // null: the canvas's own delete
    const a = apply(m, cmds);
    assert.ok(a.nodes.some(n => n.id === 'inner' && n.parent === 'pool'), `${fromModel}: the model task kept, in the pool`);
    assert.ok(!(a.views[0].nodes || []).some(n => n.id === 'sub' || n.id === 'own'), `${fromModel}: the view's own sub-process and task gone`);
    assert.deepEqual(validate(a).filter(p => p.level === 'error'), []);
  }
  assert.ok(!apply(m, diagramOf(m.views[0]).edits.remove(m, m.views[0], ['sub'], false).commands).views[0].nodeIds.includes('inner'), 'Delete: hidden from this view');
});

test('audit 24: a line to a task one view alone holds is judged by that view only: another BPMN view gives no false sequence-ends', () => {
  const m = { schemaVersion: 2, root: 'v', nodes: [{ id: 's', type: 'bpmn.StartEvent' }, { id: 't', type: 'bpmn.Task', label: 'Do' }, { id: 'e', type: 'bpmn.EndEvent' }],
    edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }],
    views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['s', 't', 'e', 'own'], nodes: [{ id: 'own', type: 'bpmn.Task', label: 'Own task' }] }, { id: 'w', diagram: 'bpmn', nodeIds: ['s', 't', 'e'] }] };
  const errs = x => validate(x).filter(p => p.level === 'error').map(p => p.message);
  assert.deepEqual(errs(m), []);
  const r = T.edits.connect(m, m.views[0], 't', 'own'), after = apply(m, r);
  assert.deepEqual(errs(after), [], 'the gesture brings no error');
  assert.ok(layout(after, 'v').edges.some(e => e.from === 't' && e.to === 'own'), 'drawn in the view that holds its end');
  // a line whose end no view holds is still an error
  const lost = structuredClone(after); lost.views[0].nodes = []; lost.views[0].nodeIds.pop();
  assert.ok(errs(lost).some(x => /sequence-ends: t-own/.test(x)));
});

test('audit 24: the PDF\'s line text reads a view\'s own line as a model one: its documentation kept', () => {
  const mk = own => { const f = { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e', label: 'done', props: { documentation: 'Only after the payment cleared' } };
    return { schemaVersion: 2, root: 'v', nodes: [{ id: 's', type: 'bpmn.StartEvent' }, { id: 't', type: 'bpmn.Task', label: 'Pay' }, { id: 'e', type: 'bpmn.EndEvent' }],
      edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' }, ...(own ? [] : [f])], views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['s', 't', 'e'], ...(own ? { edges: ['f1', f] } : {}) }] }; };
  for (const own of [false, true]) { const m = mk(own); assert.equal(T.text(m, m.views[0], 'f2'), 'done — Only after the payment cleared', own ? 'own line' : 'model line'); }
});

// audit 26: a categoryValueRef written as a lone id, not a list, was read as nothing with no word (the group not drawn); and
// two messages put "a" before a kind that starts with a vowel ("a end event")
test('audit 26: a categoryValueRef that is not a list is warned of; the event and parent messages take "an" before a vowel', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'bpmn.Participant', label: 'Shop' }, { id: 's', type: 'bpmn.StartEvent', parent: 'p', label: 'Go' }, { id: 't', type: 'bpmn.Task', parent: 'p', label: 'Pack', props: { categoryValueRef: 'g' } },
    { id: 'e', type: 'bpmn.EndEvent', parent: 'p', label: 'Done' }, { id: 'g', type: 'bpmn.Group', label: 'Dispatch' }],
  edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }], views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['p', 's', 't', 'e', 'g'] }] };
  const ps = validate(m).filter(p => p.rule === 'group-ref');
  assert.deepEqual(ps.map(p => [p.level, p.path, p.message]), [['warning', 'nodes[2].props.categoryValueRef', 'group-ref: t ("Pack")\'s categoryValueRef is "g", not a list of group ids: it is ignored']]);
  m.nodes[2].props.categoryValueRef = ['g']; assert.deepEqual(validate(m).filter(p => p.rule === 'group-ref'), []);
  m.nodes[3].props = { definition: 'timer' }; m.nodes.push({ id: 'e2', type: 'bpmn.EndEvent', parent: 'p', label: 'Stop' }, { id: 'x', type: 'bpmn.Task', parent: 'e2', label: 'Odd' }); m.views[0].nodeIds.push('e2', 'x');
  const said = validate(m).map(p => p.message).join('\n');
  assert.match(said, /e \("Done"\) is an end event with definition "timer"/); assert.match(said, /x \("Odd"\)'s parent e2 \("Stop"\) is an end event:/);
  assert.doesNotMatch(said, /\ba [aeiou]/);
});

test('audit 27: describe() counts a listed line of another kind and says it by its accessible name, as drawn', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'bpmn.Task', label: 'A' }, { id: 'b', type: 'bpmn.Task', label: 'B' }],
    edges: [{ id: 'd', type: 'uml.Dependency', from: 'a', to: 'b', label: 'needs' }], views: [{ id: 'v', diagram: 'bpmn', title: 'V', nodeIds: ['a', 'b'], edges: ['d'] }] };
  const g = layout(m, 'v'), d = describe(m, 'v').split('\n');
  assert.equal(d[0], 'V: a BPMN diagram of 2 flow nodes, 0 flows, 0 pools and 1 other line.');
  assert.ok(d.includes(g.edges.find(e => e._id === 'd').aria + '.'), d.join(' | '));
  assert.doesNotMatch(describe(EX, VID), /other line/, 'the example: none');
});

// audit 27: a node of a kind outside the subset (a typo, another notation's) was drawn and named a task, with no word on its
// kind, and lane-owner called such a parent a task; validate() says its type, and its name is its own
test('audit 27: a kind outside BPMN\'s subset is said by validate() and named by its own type, not called a task', () => {
  for (const [t, w] of [['bpmn.InclusiveGateway', 'InclusiveGateway'], ['bpmn.Taks', 'Taks'], ['uml.Class', 'Class']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'bpmn.StartEvent', label: 'Go' }, { id: 'x', type: t, label: 'Which way' }, { id: 'e', type: 'bpmn.EndEvent', label: 'Done' },
      { id: 'k', type: 'bpmn.Task', label: 'Pack', parent: 'x' }],
    edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 'x' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 'x', to: 'e' }], views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['s', 'x', 'e', 'k'] }] };
    const said = validate(m).filter(p => p.path === 'nodes[1].type');
    assert.deepEqual(said.map(p => [p.level, p.message]), [['warning', `x ("Which way") is of type "${t}", which is no BPMN element umlimator draws: drawn as a task`]], t);
    const g = layout(m, 'v');
    assert.equal(g.byId.x.shape, 'bpmn-task', 'drawn as a task'); assert.equal(g.byId.x.aria, `${w} Which way`, t);
    assert.match(validate(m).find(p => p.rule === 'lane-owner').message, new RegExp(`'s parent x \\("Which way"\\) is an? ${w.toLowerCase()}:`), t);
    assert.equal(T.word(m, 'x'), t.startsWith('bpmn.') ? w : null, 'the PDF\'s word');
  }
  assert.deepEqual(validate(EX).filter(p => /no BPMN element/.test(p.message)), [], 'example 24 holds none');
});

// audit 27: a message flow between two pools and a line from a boundary event to its own activity are kept and not drawn
// (§8.3); describe() alone said so. check() says each, as the import's report does (tests/bpmn-xml.test.mjs)
test('audit 27: check() says a line the picture leaves out: a message flow between two pools, a boundary event\'s line to its own activity', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'bpmn.Participant', label: 'Bank' }, { id: 'b', type: 'bpmn.Participant', label: 'Customer' },
    { id: 'c', type: 'bpmn.Participant', label: 'Shop' }, { id: 's', type: 'bpmn.StartEvent', parent: 'c' }, { id: 't', type: 'bpmn.Task', label: 'Call', parent: 'c' },
    { id: 'r', type: 'bpmn.BoundaryEvent', label: 'retry', parent: 'c', props: { definition: 'timer', attachedTo: 't' } }, { id: 'e', type: 'bpmn.EndEvent', parent: 'c' }],
  edges: [{ id: 'm1', type: 'bpmn.MessageFlow', from: 'a', to: 'b', label: 'statement' }, { id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' },
    { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }, { id: 'f3', type: 'bpmn.SequenceFlow', from: 'r', to: 't', label: 'try again' }],
  views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['a', 'b', 'c', 's', 't', 'r', 'e'] }] };
  const said = check(m, 'v').filter(p => /not drawn$/.test(p.message));
  assert.deepEqual(said, [{ message: 'view v: Message flow from Bank to Customer, named statement: not drawn', targets: [{ type: 'edge', ids: ['m1'], view: 'v' }] },
    { message: 'view v: Sequence flow from retry to Call, named try again: not drawn', targets: [{ type: 'edge', ids: ['f3'], view: 'v' }] }]);
  assert.deepEqual(layout(m, 'v').edges.map(e => e.id).sort(), ['f1', 'f2'], 'neither drawn');
  assert.deepEqual(check(EX, VID).filter(p => /not drawn$/.test(p.message)), [], 'example 24 draws every line it shows');
});

// audit 27: a node with no type is said to have none, never 'of type undefined' (the untyped-node wording every typed view shares)
test('audit 27: an untyped node on a BPMN view is said to have no type, never "undefined"', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'x', label: 'Plain' }], edges: [], views: [{ id: 'v', diagram: 'bpmn', title: 'T', nodeIds: ['x'] }] };
  const said = validate(m).filter(p => (p.ids || []).includes('x')).map(p => p.message);
  assert.ok(said.includes('x ("Plain") has no type, so it is no BPMN element umlimator draws: drawn as a task'), said.join(' | '));
  for (const t of said) assert.doesNotMatch(t, /undefined/);
});

test('audit 28: a listed line of another kind is drawn plain, never with a sequence flow\'s filled arrow, and keyed "Line"', () => {
  const m = { schemaVersion: 2, nodes: ['a', 'b', 'c'].map(id => ({ id, type: 'bpmn.Task', label: id.toUpperCase() })),
    edges: [{ id: 'f', type: 'bpmn.SequenceFlow', from: 'a', to: 'b' }, { id: 'x', type: 'uml.Dependency', from: 'b', to: 'c', label: 'uses' }],
    views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['a', 'b', 'c'], edges: ['f', 'x'] }] };
  const g = layout(m, 'v'), x = g.edges.find(e => e.id === 'x');
  assert.deepEqual(x.end, { from: 'none', to: 'none' });
  assert.deepEqual(g.edges.find(e => e.id === 'f').end, { from: 'none', to: 'arrow' });
  const svg = svgOf(g), at = svg.indexOf('data-from="b" data-to="c"'), path = svg.slice(at, svg.indexOf('</g>', at));
  assert.ok(at >= 0 && /class="edge"/.test(path), path); assert.doesNotMatch(path, /marker-end/, 'no arrowhead on it');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Sequence flow', 'Line']);
  assert.ok(!layout(EX, EX.views[0].id).legend.some(l => /<b>Line<\/b>/.test(l)), 'the example lists no other kind: no Line key');
});

// audit 29: a listed line of another kind that ends on a pool (or a lane) was dropped without a word: neither drawn, nor in
// check() or describe(); now said as not drawn, as BPMN's own kinds are
test('audit 29: a listed line of another kind the picture cannot draw is said as not drawn by check() and describe()', () => {
  for (const to of ['bp-payment-provider', 'order-received']) {
    const m = structuredClone(EX), v = V(m);
    m.edges.push({ id: 'zz', type: 'uml.Dependency', from: 'place-order', to, label: 'ZLABEL' }); v.edges = m.edges.map(e => e.id);
    const drawn = layout(m, VID).edges.some(e => e.id === 'zz'), name = `Line from Place order to ${to === 'order-received' ? 'Order received' : 'Payment provider'}, named ZLABEL`;
    const said = check(m, VID).filter(p => /ZLABEL/.test(p.message)).map(p => p.message), d = describe(m, VID).split('\n');
    assert.equal(drawn, to === 'order-received', to);
    assert.deepEqual(said, drawn ? [] : [`view ${VID}: ${name}: not drawn`], to);
    assert.match(d[0], /, 3 pools and 1 other line\.$/, to);
    assert.ok(d.includes(`${name}${drawn ? '' : ', not drawn'}.`), d.join('\n'));
  }
});

test('audit 30: a line whose type is an Object.prototype name is named a line, never a function\'s source', () => {
  for (const type of ['toString', 'constructor', 'valueOf']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'bpmn.Task', label: 'A' }, { id: 'b', type: 'bpmn.Task', label: 'B' }], edges: [{ id: 'e', type, from: 'a', to: 'b', label: 'x' }],
      views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['a', 'b'], edges: ['e'] }] };
    assert.equal(layout(m, 'v').edges.find(e => e.id === 'e').aria, 'Line from A to B, named x', type);
    assert.doesNotMatch(describe(m, 'v'), /native code|function/, type);
  }
});

test('audit 30: the PDF names an unnamed gateway by its kind, as its accessible name and describe() do, never by its model id', () => {
  const ctx = mapContext(EX), [els, lines] = tablesOf(ctx, ctx.V[VID], ctx.buildGeo(VID));
  const txt = r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '').trim());
  const all = [...els.rows, ...lines.rows].map(r => txt(r).join(' | '));
  assert.equal(layout(EX, VID).nodes.find(n => n.id === 'bp-join').aria, 'Parallel gateway, in Warehouse');
  assert.ok(!all.some(r => /\b(bp-join|fork|not-paid)\b/.test(r)), all.join('\n'));
  assert.ok(all.includes('Parallel gateway | Parallel gateway | in Warehouse'), all.join('\n'));
  assert.ok(all.includes('Pick and pack → Parallel gateway |  | Sequence flow'), all.join('\n'));
  assert.ok(all.includes('Paid? → Exclusive gateway | no | Sequence flow'), 'a named gateway keeps its name; an unnamed one is named by its kind');
});

// audit 31: flow-start judged a pool's process by the flow nodes one view shows, so a view of one stretch of the pool said
// the pool had no start or end event, though the model's process has both
test('audit 31: a view showing part of a pool judges the pool\'s whole process: no false flow-start; a process the view shows none of is not judged', () => {
  const m = structuredClone(EX);
  m.views.push({ id: 'shipping', diagram: 'bpmn', title: 'Shipping only', nodeIds: ['bp-bookshop', 'courier-pickup', 'bp-ship', 'shipping-notice'] });
  assert.deepEqual(validate(m).filter(p => p.rule === 'flow-start'), []);
  assert.deepEqual(bzProblems(m, V(m, 'shipping')).filter(p => p.rule === 'flow-start'), []);
  // the model's process missing its end event is still said, in the part view and with no view, at the pool
  const n = structuredClone(m); n.nodes = n.nodes.filter(x => !['order-cancelled', 'order-shipped'].includes(x.id)); n.edges = n.edges.filter(e => !['order-cancelled', 'order-shipped'].includes(e.to));
  for (const got of [bzProblems(n, V(n, 'shipping')), bzProblems(n)]) assert.deepEqual(got.filter(p => p.rule === 'flow-start').map(p => [p.path, p.message]), [['nodes[4]', 'flow-start: bp-bookshop ("Bookshop") has no end event']]);
  // a view of the shopper's pool alone does not judge the bookshop's process
  assert.deepEqual(bzProblems(n, { id: 'shop', diagram: 'bpmn', nodeIds: ['bp-shopper', 'basket-ready', 'place-order', 'order-placed'] }).filter(p => p.rule === 'flow-start'), []);
});

// audit 31: X on a collapsed sub-process listed a boundary event inside it twice: once as a child, once as its activity's event
test('audit 31: X on a collapsed sub-process whose task has a boundary event lists that event once', () => {
  const m = structuredClone(EX);
  m.nodes.push({ id: 'pick-late', type: 'bpmn.BoundaryEvent', label: 'Too slow', parent: 'pick-pack', props: { definition: 'timer', attachedTo: 'pick-books' } });
  const r = bzKey(m, V(m), ['pick-pack'], 'X'), ids = r[0].value;
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
  assert.deepEqual(ids.slice(ids.indexOf('pick-pack') + 1, ids.indexOf('pick-pack') + 6), ['picking-starts', 'pick-books', 'pack-parcel', 'parcel-packed', 'pick-late']);
  assert.equal(new Set(ids).size, new Set([...V(m).nodeIds, 'picking-starts', 'pick-books', 'pack-parcel', 'parcel-packed', 'pick-late']).size);
});

// audit 32: an element of no type, or of a type outside BPMN's subset, is drawn as a task, yet connect refused it as "A task
// joins no flow" (a real task joins one) and describe() counted it with no flow node it listed it among
test('an element drawn as a task for want of a BPMN type is refused by connect in the validator\'s words and counted by describe (audit 32)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'bpmn.Participant', label: 'Pool' }, { id: 's', type: 'bpmn.StartEvent', parent: 'p', label: 'Go', props: { definition: 'none' } },
    { id: 'u', parent: 'p', label: 'Mystery' }, { id: 'x', type: 'bpmn.Taks', parent: 'p', label: 'Typo' }, { id: 'e', type: 'bpmn.EndEvent', parent: 'p', label: 'Stop', props: { definition: 'none' } }],
  edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 'u' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 'u', to: 'x' }, { id: 'f3', type: 'bpmn.SequenceFlow', from: 'x', to: 'e' }],
  views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['p', 's', 'u', 'x', 'e'] }] };
  const v = m.views[0];
  assert.deepEqual(T.edits.connect(m, v, 'u', 'e', null, null), { error: 'Mystery has no BPMN type: give it a BPMN type to join it' });
  assert.deepEqual(T.edits.connect(m, v, 's', 'x', null, null), { error: 'Typo is of type "bpmn.Taks", which umlimator does not draw as BPMN: give it a BPMN type to join it' });
  assert.equal(describe(m, 'v').split('\n')[0], 'v: a BPMN diagram of 4 flow nodes, 3 flows and 1 pool.');
  assert.equal(describe(m, 'v').split('\n').filter(l => /^(Start event|Task|Taks|End event) /.test(l)).length, 4);
});

// audit 34: a pool or lane labelled "" was named "Pool , 2 lanes", "Lane  of , 1 element" and "Start event Go, in "
test('audit 34: a pool and a lane labelled "" are named by their ids, and what they hold is said in them', () => {
  const m = { schemaVersion: 2, title: 'T', nodes: [
    { id: 'Participant_1', type: 'bpmn.Participant', label: '', members: [{ id: 'Lane_1', type: 'bpmn.Lane', label: '' }, { id: 'Lane_2', type: 'bpmn.Lane', label: 'Sales' }] },
    { id: 's', type: 'bpmn.StartEvent', label: 'Go', parent: 'Lane_1' }, { id: 't', type: 'bpmn.Task', label: 'Do', parent: 'Lane_2' }, { id: 'e', type: 'bpmn.EndEvent', label: 'Done', parent: 'Lane_2' }],
    edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }],
    views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['Participant_1', 's', 't', 'e'] }] };
  const by = Object.fromEntries(layout(m, 'v').nodes.map(n => [n.id, n.aria])), said = describe(m, 'v');
  assert.equal(by.Participant_1, 'Pool Participant_1, 2 lanes, 3 elements'); assert.equal(by.Lane_1, 'Lane Lane_1 of Participant_1, 1 element');
  assert.equal(by.s, 'Start event Go, in Lane_1');
  assert.ok(!/ ,| of ,|in $/m.test(said), said);
});

// audit 34 (the flowchart index's sibling): the process rules looked up each node's sequence flows by scanning every flow,
// so a long process was judged in quadratic time; they are gathered once now
test('audit 34: a process of 16000 tasks in a row is judged by bzProblems() in under 300 ms (timed)', () => {
  const K = 16000, nodes = [{ id: 's', type: 'bpmn.StartEvent' }, ...Array.from({ length: K }, (_, i) => ({ id: `t${i}`, type: 'bpmn.Task', label: 'T' })), { id: 'e', type: 'bpmn.EndEvent' }];
  const edges = Array.from({ length: K + 1 }, (_, i) => ({ id: `f${i}`, type: 'bpmn.SequenceFlow', from: i ? `t${i - 1}` : 's', to: i < K ? `t${i}` : 'e' }));
  const m = { schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'bpmn', nodeIds: nodes.map(n => n.id) }] };
  const t = performance.now(), found = bzProblems(m, m.views[0]), ms = performance.now() - t;
  assert.deepEqual(found, []);
  assert.ok(ms < 300, `bzProblems() ${Math.round(ms)} ms`);
  // the lookups as before: a task with no flow in and a gateway with one in and one out are still said
  m.edges.splice(5, 1); m.nodes.push({ id: 'g', type: 'bpmn.ExclusiveGateway' }); m.views[0].nodeIds.push('g');
  m.edges.push({ id: 'g1', type: 'bpmn.SequenceFlow', from: 't3', to: 'g' }, { id: 'g2', type: 'bpmn.SequenceFlow', from: 'g', to: 't4' });
  assert.deepEqual(bzProblems(m, m.views[0]).map(p => [p.rule, p.ids[0]]), [['flow-start', 't5'], ['gateway-flows', 'g']]);
});

// audit 35: a message flow to or from a pool with no name was "Message flow from pool to Task", and describe() said "message to
// pool", where the pool's card and the PDF's Lines rows name it by its id: two black-box pools could not be told apart
test('audit 35: a line names an unnamed pool by its id, as the pool\'s card and the PDF do; an unnamed flow node keeps its kind word', () => {
  const m = JSON.parse(readFileSync(new URL('./bpmn-minimal.json', import.meta.url), 'utf8'));
  m.nodes.push({ id: 'customer', type: 'bpmn.Participant' }, { id: 'customer2', type: 'bpmn.Participant', label: '' });
  m.edges.push({ id: 'm1', type: 'bpmn.MessageFlow', from: 'customer', to: 'task' }, { id: 'm2', type: 'bpmn.MessageFlow', from: 'end', to: 'customer2' });
  m.views[0].nodeIds.push('customer', 'customer2');
  const g = layout(m, 'v'), aria = id => (g.nodes.find(n => n.id === id) || g.edges.find(e => e.id === id)).aria, said = describe(m, 'v').split('\n');
  assert.equal(aria('customer'), 'Pool customer, a black box'); assert.equal(aria('customer2'), 'Pool customer2, a black box');
  assert.equal(aria('m1'), 'Message flow from customer to Task'); assert.equal(aria('m2'), 'Message flow from End to customer2');
  assert.ok(said.includes('Pool customer, a black box; message to Task.'), said.join('\n'));
  assert.ok(said.includes('End event End, in Pool; message to customer2.'), said.join('\n'));
  const ctx = mapContext(m), rows = tablesOf(ctx, ctx.V.v, layout(m, 'v')).flatMap(t => t.rows).join('\n');
  assert.match(rows, /customer → Task/); assert.match(rows, /End → customer2/);
  // a flow node with no name is still said by its kind, as the picture draws it unnamed
  delete m.nodes.find(n => n.id === 'end').label;
  assert.equal(layout(m, 'v').edges.find(e => e.id === 'm2').aria, 'Message flow from end event to customer2');
});

test('audit 38: a rework loop (check, gateway, fix, back to check) is laid out clean, with lanes and without, right and down, either order', () => {
  const N = (id, type, label, parent) => ({ id, type, label, parent }), S = (id, from, to, label) => ({ id, type: 'bpmn.SequenceFlow', from, to, ...(label ? { label } : {}) });
  const mk = (lanes, dir, order) => { const p = lanes ? ['l1', 'l1', 'l1', 'l2', 'l1', 'l2'] : Array(6).fill('pool');
    return { schemaVersion: 2, nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'Shop', ...(lanes ? { members: [{ id: 'l1', type: 'bpmn.Lane', label: 'Sales' }, { id: 'l2', type: 'bpmn.Lane', label: 'Warehouse' }] } : {}) },
      N('s', 'bpmn.StartEvent', 'Order in', p[0]), N('a', 'bpmn.Task', 'Check order', p[1]), N('g', 'bpmn.ExclusiveGateway', 'OK?', p[2]),
      N('b', 'bpmn.Task', 'Pick', p[3]), N('c', 'bpmn.Task', 'Fix order', p[4]), N('e', 'bpmn.EndEvent', 'Shipped', p[5])],
    edges: [S('f1', 's', 'a'), S('f2', 'a', 'g'), S('f3', 'g', 'b', 'yes'), S('f4', 'g', 'c', 'no'), S('f5', 'c', 'a'), S('f6', 'b', 'e')],
    views: [{ id: 'v', diagram: 'bpmn', direction: dir, nodeIds: order }] }; };
  for (const lanes of [false, true]) for (const dir of ['right', 'down']) for (const order of [['pool', 's', 'a', 'g', 'b', 'c', 'e'], ['pool', 's', 'a', 'g', 'c', 'b', 'e']]) {
    const m = mk(lanes, dir, order), at = `${lanes ? 'lanes' : 'no lanes'} ${dir} ${order.join(',')}`;
    assert.deepEqual(check(m, 'v').map(p => p.message), [], at);
    const g = layout(m, 'v'), pool = g.bands.find(b => b.id === 'pool');
    for (const [x, y] of g.edges.find(e => e.id === 'f5').pts) assert.ok(x >= pool.x && x <= pool.x + pool.w && y >= pool.y && y <= pool.y + pool.h, `${at}: the loop stays in its pool`);
  }
});

test('audit 43: the example\'s timer moved to each side by Alt + arrows, laid out right or down, leaves no two lines on one run', () => {
  const quiet = f => { const k = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = k; } };
  const v = EX.views[0], by = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  for (const direction of ['right', 'down']) for (const s of Object.keys(by)) {
    const m = structuredClone(EX); m.views[0].direction = direction;
    const c = bzMoveTo(m, m.views[0], 'payment-timeout', { by: by[s] }), n = Array.isArray(c) && c.length ? apply(m, c) : m;
    assert.equal(n.views[0].present?.['payment-timeout']?.side ?? s, s, `${direction} ${s}`);
    const bad = quiet(() => check(n, v.id)).map(p => p.message).filter(t => / share a line| overlap/.test(t));
    assert.deepEqual(bad, [], `${direction}, the timer on the ${s}`);
  }
});

// 0.45.0's known gap (audit 61 finding 6): Alt + Up on the gallery example's timer put "Payment result" on the Charge request
// line, as the line was routed again after the label was placed; a line's label on another line now slides along its own line.
// The models are copies in tests/fixtures/ of the bookshop order-to-shipment example and the gallery BPMN example
test('known gap of 0.45.0: Alt + each arrow on every boundary event of the BPMN examples, laid out as is, right or down, puts no label on another line', () => {
  const quiet = f => { const k = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = k; } };
  const onLine = (m, vid) => quiet(() => check(m, vid)).map(p => p.message).filter(t => / lies on edge /.test(t));
  const by = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  let moves = 0;
  for (const file of ['./fixtures/bookshop-order-to-shipment.json', './fixtures/bpmn-gallery.json']) {
    const M = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    for (const v of M.views.filter(w => w.diagram === 'bpmn')) for (const direction of [null, 'right', 'down']) {
      const base = structuredClone(M); if (direction) V(base, v.id).direction = direction;
      const before = new Set(onLine(base, v.id));
      for (const b of M.nodes.filter(n => n.type === 'bpmn.BoundaryEvent' && v.nodeIds.includes(n.id))) for (const [k, d] of Object.entries(by)) {
        const c = bzMoveTo(base, V(base, v.id), b.id, { by: d }); if (!Array.isArray(c) || !c.length) continue;
        moves++; assert.deepEqual(onLine(apply(base, c), v.id).filter(t => !before.has(t)), [], `${file} ${v.id} ${direction || 'as is'}: ${b.id} ${k}`);
      }
    }
  }
  assert.ok(moves >= 40, `every move tried (${moves})`);
  // the case of the note: the label is drawn by its own line, clear of the Charge request line
  const G = JSON.parse(readFileSync(new URL('./fixtures/bpmn-gallery.json', import.meta.url), 'utf8'));
  const m = apply(G, bzMoveTo(G, V(G), 'payment-timeout', { by: [0, -1] })), g = layout(m, VID), e = g.edges.find(x => x.id === 'm-result');
  assert.ok(e.lbl && !segs(g.edges.find(x => x.id === 'bp-m-charge').pts).some(s => meets(s, { x: e.lbl.x + 1, y: e.lbl.y + 1, w: e.lbl.w - 2, h: e.lbl.h - 2 })), 'Payment result off Charge request');
  assert.ok(segs(e.pts).some(s => meets(s, { x: e.lbl.x - 5, y: e.lbl.y - 5, w: e.lbl.w + 10, h: e.lbl.h + 10 })), 'and by its own line');
});

// audit 52: Delete of a lane keeps what it held whichever view makes it: another view's own flow node in the lane (or in a
// nested lane moved up) is moved too, which apply()'s delete would take otherwise; Shift + Delete of a pool counts it
test('audit 52: Delete of a lane keeps a flow node another view holds as its own in it; a pool\'s Shift + Delete counts it', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'Shop', members: [{ id: 'l1', type: 'bpmn.Lane', label: 'Sales' }, { id: 'l1a', type: 'bpmn.Lane', label: 'Sub', parent: 'l1' }, { id: 'l2', type: 'bpmn.Lane', label: 'Stock' }] },
    { id: 's', type: 'bpmn.StartEvent', label: 'Start', parent: 'l1' }, { id: 't', type: 'bpmn.Task', label: 'Sell', parent: 'l1a' }], edges: [],
    views: [{ id: 'v1', diagram: 'bpmn', nodeIds: ['pool', 's', 't'] }, { id: 'v2', diagram: 'bpmn', nodeIds: ['pool', 's', 't', 'own', 'own2'],
      nodes: [{ id: 'own', type: 'bpmn.Task', label: 'Own', parent: 'l1' }, { id: 'own2', type: 'bpmn.Task', label: 'Own two', parent: 'l1a' }] }] };
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  for (const vid of ['v1', 'v2']) { const v = m.views.find(x => x.id === vid), r = bzRemove(m, v, ['l1'], false), n = apply(m, r.commands), w = n.views[1];
    assert.deepEqual(w.nodes.map(x => [x.id, x.parent]), [['own', 'pool'], ['own2', 'l1a']], vid);
    assert.match(r.say, /keeping what it held/, vid); }
  // the hint counts in-lane only what this view shows: v1 shows s alone of what lands in the pool
  assert.match(bzRemove(m, m.views[0], ['l1'], false).say, /; 1 flow node now in no lane of Shop/);
  // Shift + Delete of the pool: s, t and v2's own two go
  assert.match(bzRemove(m, m.views[0], ['pool'], true).say, /deleted pool Shop and the 4 elements it holds/i);
});

test('audit 54: 26 expanded sub-processes nested, each holding a start event, lay out in about linear time (before: the reading order\'s rank worked each box out twice per child, 2^depth, 7 s here, over 60 s at 30); a task named with 200,000 dashes is added in linear time (timed)', () => {
  const nodes = [N('p', 'Participant', 'P')];
  for (let i = 0, par = 'p'; i < 26; par = 'sp' + i++) nodes.push(N('sp' + i, 'SubProcess', 'S' + i, { parent: par }), N('st' + i, 'StartEvent', null, { parent: 'sp' + i }));
  const m = one(nodes, []); let t = performance.now(); const g = layout(m, 'v');
  assert.ok(performance.now() - t < 1000, `${Math.round(performance.now() - t)} ms`);
  assert.deepEqual(nodes.map(n => n.id).filter(id => !g.order.includes(id)), []);
  const d = '-'.repeat(200000); t = performance.now();
  const [c] = bzAdd(one([], []), one([], []).views[0], { type: 'bpmn.Task' }, `-a${d}b-`, null);
  assert.ok(performance.now() - t < 500, `${Math.round(performance.now() - t)} ms`); assert.equal(c.element.id, `a${d}b`);
});

test('audit 55: 150 sequence flows into one gateway lay out in about linear time (before: the lines into its side, too many for its tracks, each fell to the last resort, whose grid held every line before it and whose search visited all of it, 30 s; and each line marked its grid cell by cell) (timed)', () => {
  const nodes = [N('p', 'Participant', 'P'), N('j', 'ExclusiveGateway', 'J', { parent: 'p' })], edges = [];
  for (let i = 0; i < 150; i++) { nodes.push(N('t' + i, 'Task', 'T' + i, { parent: 'p' })); edges.push({ id: 'e' + i, type: 'bpmn.SequenceFlow', from: 't' + i, to: 'j' }); }
  const t = performance.now(), g = layout(one(nodes, edges), 'v'), ms = performance.now() - t;
  assert.ok(ms < 4000, `${Math.round(ms)} ms`);
  assert.equal(g.edges.filter(e => e.pts && e.pts.length >= 2).length, 150, 'every flow drawn');
});

test('a boundary event on an activity one view alone holds lives in that view too; Delete of such an activity deletes its events and says so (audit 58)', () => {
  const E = T.edits, be = T.elements.find(e => e.type === 'bpmn.BoundaryEvent');
  let m = apply(EX, [{ op: 'add', element: N('own-t', 'Task', 'Own task', { parent: 'bp-sales' }), view: VID, in: 'view' }]);
  // the palette's add on the selected view-own task: into the view's own nodes, not the model
  const add = E.add(m, V(m), be, 'Late', { sel: ['own-t'] });
  assert.equal(add[0].in, 'view'); m = apply(m, add);
  assert.ok(V(m).nodes.some(n => n.id === 'late') && !m.nodes.some(n => n.id === 'late')); assert.deepEqual(errors(m), []);
  // Delete: both deleted, said as deleted, not hid
  const r = E.remove(m, V(m), ['own-t'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'own-t' }, { op: 'delete', id: 'late' }]);
  assert.match(r.say, /^Deleted its boundary event Late with Own task: it lived in this view only/);
  const m1 = apply(m, r.commands); assert.ok(!m1.nodes.some(n => n.id === 'own-t' || n.id === 'late') && !(V(m1).nodes || []).some(n => n.id === 'own-t' || n.id === 'late'));
  // a model event on it (written so by hand): the cascade takes it, no hide that apply() refuses
  const m2 = structuredClone(m); V(m2).nodes = V(m2).nodes.filter(n => n.id !== 'late'); m2.nodes.push(N('late', 'BoundaryEvent', 'Late', { parent: 'bp-sales', props: { definition: 'timer', attachedTo: 'own-t' } }));
  const r2 = E.remove(m2, V(m2), ['own-t'], false);
  assert.deepEqual(r2.commands, [{ op: 'delete', id: 'own-t' }]); assert.match(r2.say, /^Deleted its boundary event Late/);
  assert.ok(!apply(m2, r2.commands).nodes.some(n => n.id === 'late'));
  // a model event is not moved onto it: not offered by A, refused by a drop on its border
  const pick = E.key(m, V(m), ['payment-timeout'], 'A'); assert.ok(pick.pick.length && !pick.pick.includes('Own task'));
  const g = layout(m, VID), b = g.byId['own-t'];
  assert.match(E.moveTo(m, V(m), 'payment-timeout', { pt: [b.x + 2, b.y + b.h], geo: g }).error, /^Own task lives in this view only/);
  // a model task keeps its model events as before
  assert.equal(E.add(m, V(m), be, 'Late 2', { sel: ['cancel-order'] })[0].in, undefined);
});
test('Delete of a view-own activity with the model boundary event on it also selected deletes the activity alone, in either order (audit 59)', () => {
  const E = T.edits;
  const m = structuredClone(apply(EX, [{ op: 'add', element: N('own-t', 'Task', 'Own task', { parent: 'bp-sales' }), view: VID, in: 'view' }]));
  m.nodes.push(N('late', 'BoundaryEvent', 'Late', { parent: 'bp-sales', props: { definition: 'timer', attachedTo: 'own-t' } })); V(m).nodeIds.push('late');
  for (const sel of [['own-t', 'late'], ['late', 'own-t']]) {
    const r = E.remove(m, V(m), sel, false);
    assert.deepEqual(r.commands, [{ op: 'delete', id: 'own-t' }], sel.join());
    assert.match(r.say, /^Deleted its boundary event Late with Own task: a boundary event goes with its activity/);
    const a = apply(m, r.commands); assert.ok(!a.nodes.some(n => n.id === 'late' || n.id === 'own-t'));
  }
  // a model event on a model task, selected with it: still hidden, as before
  const r = E.remove(m, V(m), ['cancel-order', 'payment-timeout'], false);
  assert.ok(r == null || !r.commands.some(c => c.op === 'delete'));
});

test('layout.keepsRow and keepsRank: Alt + an arrow on an item alone in its lane\'s columns, across, or on data drawn beside its flow node, is refused and said, and only where its pin would move nothing (audit 64)', () => {
  const V = EX.views.find(v => v.diagram === 'bpmn'), L = diagramOf(V).layout, g = layout(EX, V.id), box = m => JSON.stringify(layout(m, V.id).nodes.map(n => [n.id, n.x, n.y]));
  assert.equal(L.keepsRow(EX, V, 'pick-pack', g, [0, 1]), 'Pick and pack is the only item of Warehouse here: the Owner field, or a drag into another lane, moves it to another lane');
  assert.equal(L.keepsRank(EX, V, 'pick-pack', g, [1, 0]), null, 'along the flow: a pin');
  assert.equal(L.keepsRank(EX, V, 'bp-stock', g, [1, 0]), 'Stock database is drawn beside Pick and pack, the flow node it is associated with');
  const base = box(EX); let refused = 0;
  for (const n of g.nodes) for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    if (!L[d[0] ? 'keepsRank' : 'keepsRow'](EX, V, n.id, g, d) || n.col + d[0] < 0 || n.row + d[1] < 0) continue; refused++;
    assert.equal(box(apply(EX, [{ op: 'set', view: V.id, path: ['layout', n.id], value: [n.col + d[0], n.row + d[1]] }])), base, `${n.id} ${d}: refused, so its pin moves nothing`);
  }
  assert.ok(refused > 10, refused);
});

// audit 65: Alt + an arrow on the first or last item of a lane's rows, stepped outward, or on one the lane pass settles back,
// wrote a pin that moved nothing (keepsRow said only an item alone in its lane's columns): asked of the layout, every row step
// is refused exactly where its pin moves nothing, in the example and the stress model's lane views, laid out right and down; so
// is a step along the flow
test('layout.keepsRow and keepsRank: Alt + an arrow that the lane pass settles back (the first or last item of a lane\'s rows stepped outward) is refused and said; every other step pins (audit 65)', () => {
  const V = EX.views.find(v => v.diagram === 'bpmn'), L = diagramOf(V).layout, g = layout(EX, V.id);
  assert.equal(g.byId['send-invoice'].row, 2);
  assert.equal(L.keepsRow(EX, V, 'send-invoice', g, [0, -1]), 'Email invoice keeps its place in Sales: the lane stacks its items in their columns from its first row; the Owner field, or a drag into another lane, moves it to another lane');
  assert.equal(L.keepsRow(EX, V, 'send-invoice', g, [0, 1]), null, 'toward cancel-order, below it in its lane: a pin');
  const stress = JSON.parse(readFileSync(new URL('./bpmn-stress.json', import.meta.url), 'utf8'));
  let refused = 0, pinned = 0;
  for (const [M, vid] of [[EX, V.id], [stress, 'edge-cases'], [stress, 'ec-closed']]) for (const direction of ['right', 'down']) for (const held of [false, true]) {
    // held: every third card pinned a row below its cell, as a hand-moved view holds
    const pins = vid => { if (!held) return {}; const G0 = layout({ ...M, views: M.views.map(v => (v.id === vid ? { ...v, direction } : v)) }, vid);
      return Object.fromEntries(G0.nodes.filter((n, i) => i % 3 === 0 && Number.isFinite(n.col)).map(n => [n.id, [n.col, n.row + 1]])); };
    const m = { ...M, views: M.views.map(v => (v.id === vid ? { ...v, direction, ...(held ? { layout: pins(vid) } : {}) } : v)) }, v = m.views.find(x => x.id === vid), G = layout(m, vid);
    const box = x => JSON.stringify(layout(x, vid).nodes.map(n => [n.id, n.x, n.y])), base = box(m);
    // each step in cells, whichever way the view runs, as the canvas asks it: [0, s] across the flow (keepsRow), [s, 0] along it
    // (keepsRank), of a card whose Alt + arrows moveTo leaves to the canvas (a boundary event's set its side; a pool's, a lane's
    // and a group's are refused there)
    for (const n of G.nodes) for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!Number.isFinite(n.col) || !Number.isFinite(n.row) || diagramOf(v).edits.moveTo(m, v, n.id, { by: G.down ? [d[1], d[0]] : d, geo: G }) != null) continue;
      const why = L[d[0] ? 'keepsRank' : 'keepsRow'](m, v, n.id, G, d), moved = box(apply(m, [{ op: 'set', view: vid, path: ['layout', n.id], value: [n.col + d[0], n.row + d[1]] }])) !== base;
      // pinned, a refusal moves nothing (where audit 64's "only item" said so of a pin that moved others); a step onto a pin is the canvas's to step past
      if (held) assert.ok(!(why && moved), `${vid} ${direction} pinned ${n.id} ${d}: ${why}`); else assert.equal(!why, moved, `${vid} ${direction} ${n.id} ${d}: ${why}`); if (why) refused++; else pinned++;
    }
  }
  assert.ok(refused > 20 && pinned > 20, `${refused} ${pinned}`);
});

// Layout by business flow, section 12 step 10 (docs/diagrams/notes/layout-flow.md sections 6.1 and 7.2): BPMN's flowRole and
// zoneOf, read only in an arranged view. The model has no default-flow field, so a gateway's main flow is its first
test('flowRole: the main flow runs from the start event along each gateway\'s first flow to an end event; a data association is a dependency. zoneOf: start first, end last, data under', () => {
  const n = (id, type, more = {}) => ({ id, type: 'bpmn.' + type, label: id, ...more }), sf = (id, from, to) => ({ id, type: 'bpmn.SequenceFlow', from, to });
  const m = { schemaVersion: 2, nodes: [n('s', 'StartEvent', { props: { definition: 'none' } }), n('g', 'ExclusiveGateway'),
    n('a', 'Task'), n('b', 'Task'), n('b2', 'Task'), n('e1', 'EndEvent', { props: { definition: 'none' } }), n('e2', 'EndEvent', { props: { definition: 'none' } }), n('d', 'DataObject')],
  edges: [sf('f1', 's', 'g'), sf('f2', 'g', 'a'), sf('f3', 'a', 'e1'), sf('f4', 'g', 'b'), sf('f5', 'b', 'b2'), sf('f6', 'b2', 'e2'), { id: 'da', type: 'bpmn.DataAssociation', from: 'a', to: 'd' }],
  views: [{ id: 'v', diagram: 'bpmn', arrange: 'flow', nodeIds: ['s', 'g', 'a', 'b', 'b2', 'e1', 'e2', 'd'] }] };
  const v = m.views[0], el = id => m.nodes.find(x => x.id === id);
  assert.deepEqual(m.edges.map(e => T.flowRole(e, m, v)), ['main', 'main', 'main', 'branch', 'branch', 'branch', 'dep'], 'the gateway\'s first flow, though the other branch is longer');
  assert.deepEqual(['s', 'g', 'a', 'e1', 'd'].map(id => T.zoneOf(el(id), m, v)), ['first', null, null, 'last', 'under']);
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  const g = layout(m, 'v'), at = id => g.byId[id];
  assert.equal(new Set(['s', 'g', 'a', 'e1'].map(id => at(id).row)).size, 1, 'the main flow on one row');
  assert.ok(at('e1').col > at('b2').col && at('e2').col === at('e1').col, 'the end events after the flow');
  assert.deepEqual(g.edges.filter(e => e.mainLine).map(e => e.id), ['f1', 'f2', 'f3']);
  assert.ok(g.edges.find(e => e.id === 'da').dep);
  assert.ok(g.edges.filter(e => e.mainLine).every(e => e.pts.length === 2), 'each main line one straight segment: in no pool, a column the main flow passes keeps its row free');
  delete v.arrange; const g0 = layout(m, 'v'); assert.ok(g0.edges.every(e => !e.mainLine && !e.dep), 'without arrange: nothing marked');
});

// audit 66: an activity's main step is its own flow out, never a boundary event's exception flow, whatever the order of the
// edges (a .bpmn file may list the exception flow first); flowRole, the rows and storyFromFlow agree
test('audit 66: the arranged main flow skips a boundary event\'s exception flow in any edge order', () => {
  const nodes = [N('s', 'StartEvent', 'Order in', { props: { definition: 'none' } }), N('a', 'Task', 'Take payment'),
    N('t', 'BoundaryEvent', '2 minutes', { props: { definition: 'timer', attachedTo: 'a' } }), N('x', 'Task', 'Cancel order'), N('e2', 'EndEvent', 'Cancelled', { props: { definition: 'none' } }),
    N('b', 'Task', 'Pack'), N('c', 'Task', 'Ship'), N('e', 'EndEvent', 'Shipped', { props: { definition: 'none' } })];
  const all = [F('f0', 's', 'a'), F('ft', 't', 'x'), F('fx', 'x', 'e2'), F('f1', 'a', 'b'), F('f2', 'b', 'c'), F('f3', 'c', 'e')];
  const orders = [all, [all[0], ...all.slice(3), all[1], all[2]], [...all].reverse(), [all[1], all[3], all[0], all[5], all[2], all[4]]];
  for (const def of ['timer', 'message']) for (const edges of orders) {
    const m = one(structuredClone(nodes), structuredClone(edges), { arrange: 'flow' }); m.nodes[2].props.definition = def;
    assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
    const v = m.views[0], main = m.edges.filter(e => T.flowRole(e, m, v) === 'main').map(e => e.id).sort();
    assert.deepEqual(main, ['f0', 'f1', 'f2', 'f3'], `${def}, ${edges.map(e => e.id)}`);
    assert.deepEqual(storyFromFlow(m, 'v').steps.map(x => x.select), ['s', 'a', 'b', 'c', 'e'], 'the story tells the same path');
    const g = layout(m, 'v'); assert.equal(new Set(['s', 'a', 'b', 'c', 'e'].map(id => g.byId[id].row)).size, 1, 'the normal path on one row');
    assert.ok(!['x', 'e2'].some(id => g.byId[id].row === g.byId.a.row), 'the exception path off the main row');
  }
  // an activity whose only flow out is its boundary event's: the main flow ends there (the exception path stays a branch)
  const only = one(structuredClone(nodes.slice(0, 5)), [F('f0', 's', 'a'), F('ft', 't', 'x'), F('fx', 'x', 'e2')], { arrange: 'flow' });
  assert.deepEqual(only.edges.map(e => T.flowRole(e, only, only.views[0])), ['main', 'branch', 'branch']);
});

/* ---- a default flow (props.default): an exclusive gateway's or an activity's, the way taken when no condition holds. The
   view draws it with a slash near its source and names it; the main flow (an arranged view's), describe() and storyFromFlow
   follow it, not the first flow out; deleting the flow drops it; diff() says the gateway changed ---- */
test('a gateway\'s default flow: a slash near its source, named; the main flow and storyFromFlow take it; a delete drops it; diff() says it', () => {
  const m = one([N('s', 'StartEvent', 'Go', { props: { definition: 'none' } }), N('g', 'ExclusiveGateway', 'Big?', { props: { default: 'g-b' } }), N('a', 'Task', 'Ask'), N('b', 'Task', 'Book'),
    N('e', 'EndEvent', 'Done', { props: { definition: 'none' } })], [F('s-g', 's', 'g'), F('g-a', 'g', 'a', 'SequenceFlow', { label: 'yes' }), F('g-b', 'g', 'b', 'SequenceFlow', { label: 'no' }), F('a-e', 'a', 'e'), F('b-e', 'b', 'e')], { arrange: 'flow' });
  assert.deepEqual(validate(m), []);
  const g = layout(m, 'v'), by = Object.fromEntries(g.edges.map(e => [e.id, e]));
  assert.deepEqual(g.edges.filter(e => e.end.from === 'slash').map(e => e.id), ['g-b']);
  assert.equal(by['g-b'].aria, 'Sequence flow from Big? to Book, named no, the default flow');
  assert.match(svgOf(g), /<marker id="[^"]*-slash-[^"]*"[^>]*><path d="M-14 1L-8 11"/, 'the slash marker is drawn');
  assert.match(g.legend.join(''), /<b>Default flow<\/b>/);
  assert.match(describe(m, 'v'), /^Exclusive gateway Big\?; then Ask \(yes\); then Book \(no\) by default\.$/m);
  // the main flow takes the default, not the first flow out; without one, the first
  const role = (x, id) => T.flowRole(x.edges.find(e => e.id === id), x, x.views[0]);
  assert.deepEqual(['g-a', 'g-b'].map(id => role(m, id)), ['branch', 'main']);
  assert.deepEqual(storyFromFlow(m, 'v').steps.map(x => x.select), ['s', 'g', 'b', 'e']);
  const plain = structuredClone(m); delete plain.nodes[1].props;
  assert.deepEqual(['g-a', 'g-b'].map(id => role(plain, id)), ['main', 'branch']);
  assert.deepEqual(storyFromFlow(plain, 'v').steps.map(x => x.select), ['s', 'g', 'a', 'e']);
  assert.ok(layout(plain, 'v').edges.every(e => e.end.from === 'none'), 'no default: no slash');
  // the flow deleted: the gateway names none (refs: drop), and the model stays valid
  const cut = apply(m, [{ op: 'delete', id: 'g-b' }]);
  assert.deepEqual(cut.nodes.find(n => n.id === 'g').props, {});
  assert.deepEqual(validate(cut).filter(p => p.rule === 'default-flow'), []);
  // diff(): another default is a change of the gateway, drawn on the diff page
  const moved = structuredClone(m); moved.nodes[1].props.default = 'g-a';
  const d = diff(m, moved);
  assert.deepEqual(d.summary, ['changes Big? (props)']);
  assert.equal(d.model.nodes.find(n => n.id === 'g').change, 'changed');
  // an activity's default flow, out of a task with two flows out
  const t = one([N('s', 'StartEvent', 'Go', { props: { definition: 'none' } }), N('a', 'Task', 'Ask', { props: { default: 'a-e2' } }), N('e', 'EndEvent', 'Done', { props: { definition: 'none' } }), N('e2', 'EndEvent', 'Other', { props: { definition: 'none' } })],
    [F('s-a', 's', 'a'), F('a-e', 'a', 'e'), F('a-e2', 'a', 'e2')]);
  assert.deepEqual(validate(t), []);
  assert.deepEqual(layout(t, 'v').edges.filter(e => e.end.from === 'slash').map(e => e.id), ['a-e2']);
  assert.deepEqual(storyFromFlow(t, 'v').steps.map(x => x.select), ['s', 'a', 'e2']);
});
