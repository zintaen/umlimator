// The BPMN diagram, bpmn (work package 4b.3, notes/milestone-4b.md §3 to §8, §11): its definition; docs/diagrams/examples/
// 24-bpmn.json laid out clean right and down (pools and lanes as bands, every node in its own, no line through a node, no
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
import { BZ_RULES, bzProblems, bzConnect, bzMoveTo, bzAdd, bzRemove, bzKey, bzOwners } from '../src/bpmn/process.js';

const EX = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/24-bpmn.json', import.meta.url), 'utf8'));
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
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'key', 'moveTo', 'remove']);
  assert.deepEqual(Object.keys(T.rules), ['sequence-scope', 'sequence-ends', 'message-scope', 'message-ends', 'event-definition', 'boundary-host', 'boundary-out', 'flow-start', 'gateway-flows',
    'lane-owner', 'in-lane', 'data-ends', 'group-ref', 'opens-view']);
  for (const k of ['layout', 'draw', 'boxes', 'owners', 'validate', 'describe', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
});

test('example 24 validates clean and lays out clean right and down: bands, every node in its own, no line through a node, no sequence flow outside its pool', () => {
  assert.deepEqual(validate(EX), []);
  for (const [d, pinned] of [['right', 5], ['down', 6]]) {
    const r = clean(dir(EX, d), VID), g = r.g;
    assert.deepEqual([r.bad, r.others], [[], []], d);
    console.log(`# example 24, ${d}: ${g.nodes.length} nodes, ${g.edges.length} lines, ${r.crossings.length} crossings`);
    assert.equal(r.crossings.length, pinned, `${d}: the crossings pinned here (no port repair, S16)`);
    assert.deepEqual(g.bands.map(b => [b.id, b.depth]), [['shopper', 0], ['bookshop', 0], ['sales', 1], ['warehouse', 1], ['payment-provider', 0]]);
    // the pools apart, each header a node on its strip, named
    const [A, S] = d === 'down' ? ['x', 'w'] : ['y', 'h'], pools = g.bands.filter(b => !b.depth);
    pools.slice(1).forEach((p, i) => assert.ok(p[A] > pools[i][A] + pools[i][S], `${d}: ${pools[i].id} and ${p.id} apart`));
    g.bands.forEach(b => { const n = g.byId[b.id]; assert.deepEqual([n.shape, n.aside, n.x, n.y, n.w, n.h], [b.depth ? 'bpmn-lane' : 'bpmn-pool', true, b.head.x, b.head.y, b.head.w, b.head.h]); });
    assert.ok(pools[2][S] >= 120 - .5, `${d}: the black-box pool 120 px across at least`);
    // the boundary event on take-payment's far side, and the expanded sub-process absent (pick-pack collapsed here)
    assert.equal(g.byId['payment-timeout'].side, d === 'down' ? 'R' : 'B'); assert.equal(g.byId['payment-timeout'].owner, 'take-payment');
    assert.equal(g.families.length, 0); assert.equal(g.byId['pick-pack'].shape, 'bpmn-task');
    // a message flow to a pool ends on its border, at the column it comes from; the anchors are gone
    assert.ok(!g.nodes.some(n => n.id.startsWith('\u0000')) && !Object.keys(g.byId).some(id => id.startsWith('\u0000')), `${d}: no anchor drawn`);
    const end = id => g.edges.find(e => e.id === id), pp = g.bands.find(b => b.id === 'payment-provider'), sh = g.bands.find(b => b.id === 'shopper');
    assert.equal(end('m-charge').pts.at(-1)[d === 'down' ? 0 : 1], pp[A], 'm-charge ends on the provider\'s border');
    assert.equal(end('m-result').pts[0][d === 'down' ? 0 : 1], pp[A], 'm-result starts on it');
    assert.equal(end('m-notice').pts.at(-1)[d === 'down' ? 0 : 1], sh[A] + sh[S], 'm-notice ends on the shopper\'s border');
    assert.deepEqual([end('m-charge').to, end('m-result').from, end('m-notice').t.id], ['payment-provider', 'payment-provider', 'shopper']);
    // the labels outside: each event, gateway and data object with a name has one
    assert.deepEqual(g.labels.map(l => l.id).sort(), ['basket-ready', 'courier-pickup', 'order', 'order-cancelled', 'order-placed', 'order-received', 'order-shipped', 'paid', 'payment-timeout', 'shipping-notice', 'stock'].sort());
    // the group round its members
    const grp = g.byId.dispatch; ['courier-pickup', 'ship', 'shipping-notice'].forEach(id => assert.ok(within(g.byId[id], grp), `${d}: ${id} in the group`));
    assert.equal(g.nodes[0].id, 'dispatch', 'the group drawn first, under everything');
    // data in the lane of the flow node it is associated with (decision 23)
    const band = id => g.bands.find(b => b.id === id);
    assert.ok(within(g.byId.order, band('sales')) && within(g.byId.stock, band('warehouse')) && within(g.byId['note-card'], band('sales')), `${d}: data and the annotation in their lanes`);
  }
});

test('names, reading order, describe(), the legend, the PDF\'s words and rows', () => {
  const g = layout(EX, VID), aria = id => g.byId[id].aria;
  assert.deepEqual(['take-payment', 'payment-timeout', 'paid', 'order-cancelled', 'bookshop', 'sales', 'payment-provider', 'dispatch', 'pick-pack', 'note-card'].map(aria), ['Service task Take payment, in Sales',
    'Timer boundary event No answer in 2 minutes, on Take payment', 'Exclusive gateway Paid?, in Sales', 'Terminate end event Order cancelled, in Sales', 'Pool Bookshop, 2 lanes, 16 elements',
    'Lane Sales of Bookshop, 10 elements', 'Pool Payment provider, a black box', 'Group Dispatch, round 3 elements', 'Sub-process Pick and pack (collapsed), in Warehouse',
    'Text annotation Card details go straight to the provider; the shop never sees them, in Sales']);
  assert.equal(g.edges.find(e => e.id === 'f-paid').aria, 'Sequence flow from Paid? to parallel gateway, named yes');
  assert.equal(g.edges.find(e => e.id === 'm-charge').aria, 'Message flow from Take payment to Payment provider, named Charge request');
  assert.deepEqual(g.order.slice(0, 6), ['shopper', 'basket-ready', 'place-order', 'order-placed', 'bookshop', 'sales']);
  assert.ok(g.order.indexOf('payment-timeout') === g.order.indexOf('take-payment') + 1, 'a boundary event read after its activity');
  assert.ok(g.order.indexOf('dispatch') > g.order.indexOf('payment-provider') && g.order.indexOf('f-basket') > g.order.indexOf('dispatch'), 'the groups, then the lines');
  assert.deepEqual(g.legend.map(s => /<b>([^<]*)/.exec(s)[1]), ['Sequence flow', 'Message flow', 'Association', 'Data association']);
  assert.match(mapContext(EX).buildView(VID).markup, /<g class="bz-pools"><rect class="bz-pool" data-o="shopper"/);
  assert.match(mapContext(EX).buildView(VID).markup, /<g class="bp-label" data-o="paid"/);
  const said = describe(EX, VID).split('\n');
  assert.deepEqual(said.slice(0, 6), ['From order to shipment: a BPMN diagram of 18 flow nodes, 21 flows and 3 pools.', 'Pool Shopper, 3 elements.', 'Pool Bookshop, 2 lanes, 16 elements.',
    'Lane Sales of Bookshop, 10 elements.', 'Lane Warehouse of Bookshop, 4 elements.', 'Pool Payment provider, a black box.']);
  assert.ok(said.includes('Service task Take payment, in Sales; then Paid?; message to Payment provider (Charge request).'));
  assert.ok(said.includes('Timer boundary event No answer in 2 minutes, on Take payment; then exclusive gateway.'), 'a boundary event after its activity, with its flow');
  assert.equal(said.at(-1), 'Group Dispatch: Courier\'s pickup at 16:00, Hand parcel to courier, Shipping notice sent.');
  const doc = apply(EX, { op: 'set', id: 'take-payment', path: 'props.documentation', value: 'Charged once.' });
  assert.ok(describe(doc, VID).includes('Service task Take payment, in Sales (Charged once.); then'), 'documentation printed (S2, 2.2.6)');
  assert.deepEqual([T.word(EX, 'paid'), T.word(EX, 'payment-timeout'), T.word(EX, 'f-paid'), T.rows(doc, V(doc), 'take-payment'), T.rows(EX, V(EX), 'payment-timeout'), T.rows(EX, V(EX), 'note-card')],
    ['Exclusive gateway', 'Timer boundary event', null, ['in Sales', 'Charged once.'], ['on Take payment'], ['in Sales']]);
  // a group round nothing shown is not drawn, and describe() says so
  const hidden = apply(EX, ['courier-pickup', 'ship', 'shipping-notice'].map(id => ({ op: 'hide', id, view: VID })));
  assert.equal(layout(hidden, VID).byId.dispatch, undefined); assert.equal(describe(hidden, VID).split('\n').at(-1), 'Group Dispatch, round nothing shown: not drawn.');
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
  'boundary-out': [[N('b', 'BoundaryEvent', 'B', { parent: 'l1', props: { attachedTo: 'a', definition: 'timer' } })], [], ['warning']],
  'flow-start': [[N('z', 'Task', 'Z', { parent: 'q' })], [], ['warning', 'warning', 'warning']],
  'gateway-flows': [[N('g', 'ExclusiveGateway', 'G', { parent: 'l1' }), N('h', 'ParallelGateway', null, { parent: 'l1' }), N('b', 'Task', 'B', { parent: 'l1' })], [F('x', 'a', 'g'), F('y', 'g', 'b'), F('w', 'g', 'e'), F('v', 'b', 'h'), F('u', 'h', 'e', 'SequenceFlow', { label: 'go' })], ['warning', 'warning']],
  'lane-owner': [[POOL('r', [{ id: 'l9', type: 'bpmn.Lane', label: 'L9', parent: 'l1' }]), N('d', 'DataObject', 'D', { parent: 'l1' }), N('b', 'Task', 'B', { parent: 'd' })], [F('x', 'a', 'b')], ['error', 'error', 'error']],
  'in-lane': [[N('b', 'Task', 'B', { parent: 'p' })], [F('x', 'a', 'b')], ['warning']],
  'data-ends': [[N('d', 'DataObject', 'D', { parent: 'p' }), N('n', 'TextAnnotation', 'Why')], [F('x', 'd', 's', 'DataAssociation'), F('y', 'e', 'd', 'DataAssociation'), F('z', 'a', 'e', 'Association'), F('w', 'd', 'd', 'DataAssociation'), F('ok', 'n', 'a', 'Association')], ['error', 'error', 'error', 'error']],
  'group-ref': [[N('b', 'Task', 'B', { parent: 'l1', props: { categoryValueRef: ['nowhere', 'a'] } })], [F('x', 'a', 'b')], ['warning', 'warning']],
  'opens-view': [[N('S', 'SubProcess', 'S', { parent: 'l1', opensView: 'nowhere' }), N('c', 'CallActivity', 'C', { parent: 'l1', opensView: 'v2' })], [F('x', 'a', 'S'), F('y', 'S', 'c'), F('z', 'c', 'e')], ['warning', 'warning']],
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
const run = (m, cs) => { assert.ok(Array.isArray(cs) || (cs && Array.isArray(cs.commands)), JSON.stringify(cs)); const n = apply(m, cs.commands || cs); assert.deepEqual(errors(n), []); return n; };
test('connect: the kind by the ends, no picker (§7.1); a flow BPMN forbids refused with the rule\'s words', () => {
  const v = V(EX), el = cs => cs[0].element;
  assert.deepEqual(bzConnect(EX, v, 'cancel-order', 'send-invoice'), [{ op: 'add', element: { id: 'cancel-order-send-invoice', type: 'bpmn.SequenceFlow', from: 'cancel-order', to: 'send-invoice' }, view: VID }]);
  assert.equal(el(bzConnect(EX, v, 'cancel-order', 'payment-provider')).type, 'bpmn.MessageFlow', 'to another pool: a message flow');
  assert.equal(el(bzConnect(EX, v, 'place-order', 'take-payment')).type, 'bpmn.MessageFlow');
  assert.equal(el(bzConnect(EX, v, 'send-invoice', 'order')).type, 'bpmn.DataAssociation');
  assert.equal(el(bzConnect(EX, v, 'note-card', 'paid')).type, 'bpmn.Association');
  assert.deepEqual(bzConnect(EX, v, 'cancel-order', 'basket-ready'), { error: 'A message flow cannot end at a start event' });
  assert.deepEqual(bzConnect(EX, v, 'order-placed', 'order-received'), { error: 'A message flow cannot start at a end event' });
  assert.deepEqual(bzConnect(EX, v, 'order', 'order-received'), { error: 'A message start event only gives data: draw the line from the event to the data' });
  assert.deepEqual(bzConnect(EX, v, 'order-shipped', 'order'), { error: 'An end event only takes data: draw the line from the data to the event' });
  assert.match(bzConnect(EX, v, 'paid', 'basket-ready').error, /^A message flow/);
  assert.match(bzConnect(EX, v, 'take-payment', 'order-received').error, /^sequence-ends: /, 'into a start event: refused by its rule');
  assert.deepEqual(bzConnect(EX, v, 'bookshop', 'take-payment'), { error: 'A sequence flow cannot leave its pool: a message flow joins two pools' });
  assert.deepEqual(bzConnect(EX, v, 'dispatch', 'ship'), { error: 'A group joins no flow' });
  assert.deepEqual(bzConnect(EX, v, 'pick-books', 'ship'), { error: 'A sequence flow stays in its sub-process' });
  run(EX, bzConnect(EX, v, 'cancel-order', 'payment-provider'));
});
test('moveTo: a drop in another lane reparents and drops the pin; into another pool only with no sequence flows; a boundary event\'s side by Alt + arrows, its activity by a drop; headers and groups move nothing', () => {
  const g = layout(EX, VID), band = id => g.bands.find(b => b.id === id), mid = b => [b.x + b.w / 2 + 40, b.y + b.h / 2 + 30], at = b => ({ pt: mid(b), geo: g });
  assert.deepEqual(bzMoveTo(EX, V(EX), 'send-invoice', at(band('warehouse'))), [{ op: 'reparent', id: 'send-invoice', parent: 'warehouse' }]);
  const pinned = apply(EX, { op: 'set', view: VID, path: ['layout', 'send-invoice'], value: [4, 1] });
  assert.deepEqual(bzMoveTo(pinned, V(pinned), 'send-invoice', at(band('warehouse')))[1], { op: 'set', view: VID, path: ['layout', 'send-invoice'], value: undefined });
  assert.equal(bzMoveTo(EX, V(EX), 'send-invoice', at(band('sales'))), null, 'in its own lane: a pin');
  assert.deepEqual(bzMoveTo(EX, V(EX), 'send-invoice', at(band('shopper'))), { error: 'Move its sequence flows first: a sequence flow stays in its pool' });
  assert.deepEqual(bzMoveTo(EX, V(EX), 'stock', at(band('sales'))), null, 'data is in its pool, not a lane: within it, a pin');
  assert.deepEqual(bzMoveTo(EX, V(EX), 'stock', at(band('shopper'))), [{ op: 'reparent', id: 'stock', parent: 'shopper' }], 'data with no sequence flow: into another pool');
  assert.equal(bzMoveTo(EX, V(EX), 'paid', { by: [0, 1], geo: g }), null, 'Alt + arrows: a pin');
  assert.deepEqual(bzMoveTo(EX, V(EX), 'payment-timeout', { by: [0, -1], geo: g }), [{ op: 'set', view: VID, path: ['present', 'payment-timeout', 'side'], value: 'top' }]);
  const c = g.byId['cancel-order'];
  assert.deepEqual(bzMoveTo(EX, V(EX), 'payment-timeout', { pt: [c.x + c.w / 2, c.y + c.h + 3], geo: g }), [{ op: 'set', id: 'payment-timeout', path: 'props.attachedTo', value: 'cancel-order' },
    { op: 'set', view: VID, path: ['present', 'payment-timeout', 'side'], value: 'bottom' }]);
  assert.deepEqual(bzMoveTo(EX, V(EX), 'payment-timeout', { pt: [-500, -500], geo: g }), { error: 'Drop a boundary event on an activity\'s border' });
  for (const id of ['sales', 'bookshop', 'dispatch']) assert.deepEqual(bzMoveTo(EX, V(EX), id, at(band('warehouse'))), [], id);
  const m = run(EX, bzMoveTo(EX, V(EX), 'send-invoice', at(band('warehouse'))));
  assert.ok(within(layout(m, VID).byId['send-invoice'], layout(m, VID).bands.find(b => b.id === 'warehouse')));
});
test('add: into the lane, pool or sub-process selected; a lane into a pool, nested in the lane selected; a boundary event onto the activity selected; data in a pool', () => {
  const E = (label, type, props) => ({ type: 'bpmn.' + type, label, ...(props ? { props } : {}) });
  assert.deepEqual(bzAdd(EX, V(EX), E('Task', 'Task'), 'Pack gift', { sel: ['warehouse'] }), [{ op: 'add', element: { id: 'pack-gift', type: 'bpmn.Task', label: 'Pack gift', parent: 'warehouse' }, view: VID }]);
  assert.equal(bzAdd(EX, V(EX), E('Task', 'Task'), 'X', { sel: ['paid'] })[0].element.parent, 'sales', 'a node selected: in its lane');
  assert.deepEqual(bzAdd(EX, V(EX), E('Timer start', 'StartEvent', { definition: 'timer' }), '', { sel: ['shopper'] })[0].element, { id: 'timer-start', type: 'bpmn.StartEvent', props: { definition: 'timer' }, parent: 'shopper' });
  assert.deepEqual(bzAdd(EX, V(EX), E('Lane', 'Lane'), 'Packing', { sel: ['warehouse'] }), [{ op: 'add', element: { id: 'packing', type: 'bpmn.Lane', label: 'Packing', parent: 'warehouse' }, owner: 'bookshop' }]);
  assert.deepEqual(bzAdd(EX, V(EX), E('Lane', 'Lane'), 'Billing', { sel: ['bookshop'] })[0], { op: 'add', element: { id: 'billing', type: 'bpmn.Lane', label: 'Billing' }, owner: 'bookshop' });
  assert.deepEqual(bzAdd(EX, V(EX), E('Lane', 'Lane'), 'x', { sel: [] }), { error: 'Select a pool to add a lane to' });
  assert.deepEqual(bzAdd(EX, V(EX), E('Boundary', 'BoundaryEvent', { definition: 'timer' }), '', { sel: ['send-invoice'] })[0].element, { id: 'boundary', type: 'bpmn.BoundaryEvent', parent: 'sales', props: { definition: 'timer', attachedTo: 'send-invoice' } });
  assert.deepEqual(bzAdd(EX, V(EX), E('Boundary', 'BoundaryEvent'), '', { sel: ['paid'] }), { error: 'Select an activity to attach a boundary event to' });
  assert.equal(bzAdd(EX, V(EX), E('Data object', 'DataObject'), 'Invoice', { sel: ['sales'] })[0].element.parent, 'bookshop', 'data in the pool, not the lane');
  assert.equal(bzAdd(EX, V(EX), E('Text annotation', 'TextAnnotation'), 'Why', { sel: ['sales'] })[0].element.parent, undefined);
  assert.equal(bzAdd(EX, V(EX), E('Task', 'Task'), 'Count', { sel: ['pick-pack'] })[0].element.parent, 'pick-pack', 'into the sub-process selected');
  assert.equal(bzAdd(EX, V(EX), { type: 'uml.Class' }, 'x', null), null);
  for (const [entry, sel] of [[E('Lane', 'Lane'), ['warehouse']], [E('Boundary', 'BoundaryEvent', { definition: 'timer' }), ['send-invoice']], [E('Pool', 'Participant'), []], [E('Group', 'Group'), []]])
    run(EX, bzAdd(EX, V(EX), entry, 'New', { sel }));
});
test('remove: a lane deleted by Delete or Shift + Delete, what it held and its nested lanes moved to its owner; a pool deleted with what it owns, counted; an activity with its boundary events; a group out of categoryValueRef', () => {
  const nest = apply(EX, [{ op: 'add', element: { id: 'packing', type: 'bpmn.Lane', label: 'Packing', parent: 'warehouse' }, owner: 'bookshop' }, { op: 'reparent', id: 'join', parent: 'packing' },
    { op: 'add', element: { id: 'boxes', type: 'bpmn.Lane', label: 'Boxes', parent: 'packing' }, owner: 'bookshop' }, { op: 'reparent', id: 'ship', parent: 'boxes' }]);
  let r = bzRemove(nest, V(nest), ['warehouse'], false); const m = run(nest, r);
  assert.equal(r.say, 'Deleted lane Warehouse from the model: a lane is not hidden from a view, keeping what it held');
  const lanes = m.nodes.find(n => n.id === 'bookshop').members;
  assert.deepEqual(lanes.map(l => [l.id, l.parent]), [['sales', undefined], ['packing', undefined], ['boxes', 'packing']], 'the nested lanes kept, one level up');
  assert.deepEqual(['pick-pack', 'join', 'ship', 'courier-pickup'].map(id => m.nodes.find(n => n.id === id).parent), ['bookshop', 'packing', 'boxes', 'bookshop']);
  assert.deepEqual(errors(m), []);
  r = bzRemove(nest, V(nest), ['packing'], true); const m2 = run(nest, r);
  assert.deepEqual(m2.nodes.find(n => n.id === 'bookshop').members.map(l => [l.id, l.parent]), [['sales', undefined], ['warehouse', undefined], ['boxes', 'warehouse']]);
  assert.equal(m2.nodes.find(n => n.id === 'join').parent, 'warehouse');
  r = bzRemove(EX, V(EX), ['payment-provider'], true);
  assert.equal(r.say, 'Deleted pool Payment provider and the 0 elements it holds');
  r = bzRemove(EX, V(EX), ['bookshop'], true); assert.match(r.say, /^Deleted pool Bookshop and the 21 elements it holds$/);
  assert.equal(bzRemove(EX, V(EX), ['paid'], true), null); assert.equal(bzRemove(EX, V(EX), ['bookshop'], false), null, 'Delete on a pool: hidden, the default');
  // apply()'s cascade and drops by the type's refs
  const noTask = apply(EX, { op: 'delete', id: 'take-payment' });
  assert.ok(!noTask.nodes.some(n => n.id === 'payment-timeout'), 'an activity takes its boundary events');
  const noGroup = apply(EX, { op: 'delete', id: 'dispatch' });
  assert.deepEqual(['courier-pickup', 'ship', 'shipping-notice'].map(id => noGroup.nodes.find(n => n.id === id).props.categoryValueRef), [[], [], []]);
  assert.deepEqual(errors(noGroup), []);
});
test('key: A on a boundary event picks another activity of its pool; X expands or collapses a sub-process in the view (decision 22); other keys are the canvas\'s', () => {
  const r = bzKey(EX, V(EX), ['payment-timeout'], 'a');
  assert.deepEqual(r.pick, ['Cancel order', 'Email invoice', 'Pick and pack', 'Hand parcel to courier', 'Pick books from the shelves', 'Pack and label parcel'], 'the activities of its pool, in sub-processes too');
  assert.deepEqual(r.then(0), [{ op: 'set', id: 'payment-timeout', path: 'props.attachedTo', value: 'cancel-order' }]);
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
  assert.deepEqual(o.map(x => x.label), ['Shopper', 'Bookshop', 'Bookshop::Warehouse::Pick and pack', 'Payment provider', 'Bookshop::Sales', 'Bookshop::Warehouse']);
  assert.deepEqual(bzOwners(EX, EX.nodes.find(n => n.id === 'order')).map(x => x.id), ['shopper', 'bookshop', 'payment-provider']);
  assert.equal(bzOwners(EX, { id: 'sales', type: 'bpmn.Lane' }), null); assert.equal(bzOwners(EX, EX.edges[0]), null);
});

test('save and reopen (DoD 6): a 30-step BPMN session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const E = T.edits, el = (label, type, props) => ({ type: 'bpmn.' + type, label, ...(props ? { props } : {}) }), g = m => layout(m, VID), band = (m, id) => g(m).bands.find(b => b.id === id);
  const mid = b => [b.x + b.w / 2 + 40, b.y + b.h / 2 + 30];
  const steps = [
    m => E.add(m, V(m), el('Task', 'Task'), 'Gift wrap', { sel: ['warehouse'] }), m => E.connect(m, V(m), 'join', 'gift-wrap'),
    m => [{ op: 'set', id: 'join-gift-wrap', path: 'label', value: 'wrap' }], m => E.moveTo(m, V(m), 'gift-wrap', { pt: mid(band(m, 'sales')), geo: g(m) }),
    m => [{ op: 'set', id: 'gift-wrap', path: 'props.taskType', value: 'user' }], m => E.add(m, V(m), el('Lane', 'Lane'), 'Packing', { sel: ['warehouse'] }),
    m => [{ op: 'reparent', id: 'join', parent: 'packing' }], m => [{ op: 'set', view: VID, path: ['layout', 'ship'], value: [9, 0] }],
    m => E.add(m, V(m), el('Boundary', 'BoundaryEvent', { definition: 'timer' }), '', { sel: ['ship'] }), m => E.connect(m, V(m), 'boundary', 'order-shipped'),
    m => E.moveTo(m, V(m), 'boundary', { by: [0, -1], geo: g(m) }), m => [{ op: 'set', id: 'boundary', path: 'props.cancelActivity', value: false }],
    m => E.remove(m, V(m), ['packing'], false).commands, m => [{ op: 'set', id: 'take-payment', path: 'props.documentation', value: 'Charged once.' }],
    m => E.key(m, V(m), ['pick-pack'], 'x'), m => E.add(m, V(m), el('Task', 'Task'), 'Count', { sel: ['pick-pack'] }),
    m => [{ op: 'delete', id: 'f-pack' }], m => E.connect(m, V(m), 'pick-books', 'count'), m => E.connect(m, V(m), 'count', 'pack-parcel'),
    m => E.key(m, V(m), ['boundary'], 'a').then(0), m => E.add(m, V(m), el('Data store', 'DataStoreReference'), 'Ledger', { sel: ['sales'] }),
    m => E.connect(m, V(m), 'send-invoice', 'ledger'), m => [{ op: 'hide', id: 'ledger', view: VID }],
    m => E.add(m, V(m), el('Text annotation', 'TextAnnotation'), 'Gifts only in December', null), m => E.connect(m, V(m), 'gifts-only-in-december', 'gift-wrap'),
    m => [{ op: 'delete', id: 'gifts-only-in-december' }], m => [{ op: 'set', view: VID, path: 'direction', value: 'down' }],
    m => E.key(m, V(m), ['pick-pack'], 'X'), m => E.remove(m, V(m), ['payment-provider'], true).commands, m => [{ op: 'set', id: 'sales', path: 'label', value: 'Sales desk' }],
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
