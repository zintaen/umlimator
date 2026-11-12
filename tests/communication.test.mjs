// The communication diagram, uml.communication (work package 3.5, notes/stage-3.md §6): its definition, the stacks of
// messages on a link (S7) and their numbers (S8), the validators, describe(), the reading order, the editing hooks through
// apply(), a session undone and redone, and §10's budgets. The fixtures live in tests/communication.html, which draws them
// in Chrome in both themes and three fonts; here they are laid out with the monospace estimate (no measurer in Node).
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
import { commProblems, commConnect, commMoveTo, commAdd, commRemove } from '../src/uml/communication.js';

const PAGE = readFileSync(new URL('./communication.html', import.meta.url), 'utf8');
const block = id => JSON.parse(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(PAGE)[1]);
const MINIMAL = block('minimal'), STRESS = block('stress');
const EX = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/12-communication.json', import.meta.url), 'utf8'));
const VIEW = m => m.views[0], errors = m => validate(m).filter(p => p.level === 'error');
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rowsOf = g => g.nodes.filter(n => n.shape === 'message-row');

// DoD 3 in Node: no two nodes overlap (a lifeline, a message row), no connector runs through a node but its two lifelines and
// its own rows, a connector's rows are one stack it runs into, every connector and every message of the view is drawn
// once. Connectors may cross: check() lists those, and they are returned
function clean(m, vid) {
  const g = layout(m, vid), v = m.views.find(x => x.id === vid), E = new Map(m.edges.map(e => [e.id, e])), bad = [];
  const cons = v.edges.map(id => E.get(id)).filter(e => e.type === 'uml.Connector'), msgs = v.edges.map(id => E.get(id)).filter(e => e.type === 'uml.Message');
  g.nodes.forEach((a, i) => g.nodes.slice(i + 1).forEach(b => { if (meets(a, b)) bad.push(`${a.id} and ${b.id} overlap`); }));
  g.edges.forEach(e => {
    const own = new Set(e.stack || []);
    e.pts.slice(1).forEach((q, k) => { const p = e.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 };
      g.nodes.forEach(n => { if (n.id !== e.from && n.id !== e.to && !own.has(n.id) && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }); });
    if (own.size) { const rs = [...own].map(id => g.byId[id]), x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)), st = { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y };
      if (rs.some(r => r.x !== x || r.w !== st.w) || st.h !== 16 * rs.length) bad.push(`${e.id}'s rows are not one stack`);
      if (!e.pts.slice(1).some((q, k) => { const p = e.pts[k]; return meets({ x: Math.min(p[0], q[0]) - .5, y: Math.min(p[1], q[1]) - .5, w: Math.abs(q[0] - p[0]) + 1, h: Math.abs(q[1] - p[1]) + 1 }, st); })) bad.push(`${e.id} misses its stack`); }
  });
  assert.deepEqual(g.edges.map(e => e.id).sort(), cons.map(c => c.id).sort(), `${vid}: every connector drawn, once`);
  assert.deepEqual(rowsOf(g).map(n => n.id).sort(), msgs.map(x => x.id).sort(), `${vid}: every message a row, once`);
  const problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
  return { g, bad, others: problems.filter(p => !crossings.includes(p)), crossings };
}

test('the definition: uml.communication is registered with its palette, its lines (a connector and one per sort), properties and hooks', () => {
  const T = diagramOf({ diagram: 'uml.communication' });
  assert.equal(T.name, 'uml.communication');
  assert.deepEqual(T.elements, [{ type: 'uml.Lifeline', label: 'Lifeline' }]);
  assert.deepEqual(T.lines.map(l => [l.type, l.label, l.props && l.props.sort]), [['uml.Connector', 'Connector', undefined], ['uml.Message', 'Call', 'call'], ['uml.Message', 'Async', 'async'],
    ['uml.Message', 'Reply', 'reply'], ['uml.Message', 'Create', 'create'], ['uml.Message', 'Delete', 'delete']]);
  assert.deepEqual(Object.keys(T.props).sort(), ['uml.Connector', 'uml.Lifeline', 'uml.Message']);
  assert.deepEqual(T.refs, { 'uml.Message': { 'props.replyTo': 'cascade' } });
  for (const k of ['layout', 'validate', 'describe']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'moveTo', 'remove']);
  assert.deepEqual(Object.keys(T.rules), ['message-link', 'reply-call', 'reply-once', 'create-once', 'delete-once', 'sort']);
});

test('example 12: it validates, each connector with messages carries them as a stack of rows numbered as §6.3 says, and describe() reads it', () => {
  assert.deepEqual(validate(EX), []);
  const g = layout(EX, 'checkout'), row = id => g.byId[id];
  assert.deepEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'].map(id => row(id).num), ['1', '1.1', '1.1.1', '1.1.2', '1.1.2.1', '1.1.3', '1.1.4', '1.1.5', '1.2']);
  assert.deepEqual(['m6', 'm8'].map(id => row(id).label), ['1.1.3: «create» new(order)', '1.1.5: result']);
  assert.deepEqual(g.edges.map(e => [e.id, e.stack || []]), [['shopper-storefront', ['m1', 'm9']], ['storefront-api', ['m2', 'm7', 'm8']], ['api-self', ['m3']], ['api-payments', ['m4', 'm5']], ['api-receipt', ['m6']]]);
  for (const e of g.edges) e.stack.forEach((id, k) => { const r = row(id), first = row(e.stack[0]); // a stack: one under another, as wide as its widest
    assert.deepEqual([r.x, r.y, r.w, r.h], [first.x, first.y + 16 * k, first.w, 16], id); });
  assert.deepEqual(g.edges.map(e => e.end), g.edges.map(() => ({ from: 'none', to: 'none' })), 'connectors have no arrows');
  // each row's arrow points the way the connector leaves the stack toward its receiver: storefront is right of shopper
  assert.ok(g.byId.storefront.x > g.byId.shopper.x);
  assert.deepEqual(['m1', 'm9', 'm2', 'm7', 'm8'].map(id => row(id).dir), ['right', 'left', 'right', 'left', 'left']);
  assert.equal(row('m4').aria, 'Message 4 of 9, 1.1.2: api to payments, charge(total), call');
  assert.equal(row('m5').aria, 'Message 5 of 9, 1.1.2.1: payments to api, paid, reply to 1.1.2');
  assert.equal(g.byId.shopper.aria, 'Lifeline shopper : Shopper (actor)');
  assert.deepEqual(g.edges.map(e => e.aria), ['Connector between shopper and storefront, 2 messages', 'Connector between storefront and api, 3 messages', 'Connector from api to itself, 1 message',
    'Connector between api and payments, 2 messages', 'Connector between api and receipt, 1 message']);
  assert.equal(g.legend.length, 5, 'the connector, then call, async, reply and create: the sorts drawn');
  assert.equal(describe(EX, 'checkout'), [
    'Checkout: payment accepted: a communication diagram of 5 lifelines, 5 connectors and 9 messages.',
    'Lifeline shopper : Shopper (actor); linked to storefront.', 'Lifeline storefront : Storefront; linked to shopper, api.',
    'Lifeline api : ShopApi; linked to storefront, itself, payments, receipt.', 'Lifeline payments : PaymentProvider; linked to api.', 'Lifeline receipt : Receipt; linked to api.',
    '1: shopper to storefront, checkout(), call.', '1.1: storefront to api, place(order), call.', '1.1.1: api to api, validate(order), call.', '1.1.2: api to payments, charge(total), call.',
    '1.1.2.1: payments to api, paid, reply to 1.1.2.', '1.1.3: api to receipt, new(order), create.', '1.1.4: api to storefront, orderPlaced, async.', '1.1.5: api to storefront, result, reply to 1.1.',
    '1.2: storefront to shopper, confirmation page, reply to 1.'].join('\n'));
});

test('reading order (S13): geo.order is the lifelines left to right, the connectors, then the message rows by number; the nodes are drawn in it', () => {
  const g = layout(EX, 'checkout'), rows = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9'];
  assert.deepEqual(g.order, ['shopper', 'storefront', 'api', 'payments', 'receipt', ...g.edges.map(e => e.id), ...rows]);
  assert.deepEqual(g.edges.map(e => e.id).sort(), VIEW(EX).edges.filter(id => !rows.includes(id)).sort());
  assert.deepEqual(g.nodes.map(n => n.id), g.order.filter(id => g.byId[id]));
  // the slots: after each lifeline its index in nodeIds (N adds there), after each row its id (L adds after it)
  assert.deepEqual(g.slots.map(s => [s.after, s.index ?? null, !!s.lifeline]), [...['shopper', 'storefront', 'api', 'payments', 'receipt'].map(id => [id, VIEW(EX).nodeIds.indexOf(id) + 1, true]), ...rows.map(id => [id, null, false])]);
  assert.ok(g.slots.every(s => Number.isFinite(s.x) && Number.isFinite(s.y)));
  const s = layout(STRESS, 'all'), heads = s.order.slice(0, 20), nums = s.order.slice(50).map(id => s.byId[id].num.split('.').map(Number));
  assert.ok(heads.every((id, i) => !i || s.byId[id].x >= s.byId[heads[i - 1]].x), 'lifelines left to right');
  assert.ok(nums.every((n, i) => !i || n.join('.') !== nums[i - 1].join('.') && (() => { const p = nums[i - 1]; for (let k = 0; k < Math.max(n.length, p.length); k++) if ((n[k] ?? -1) !== (p[k] ?? -1)) return (n[k] ?? -1) > (p[k] ?? -1); return false; })()), 'messages by number');
  assert.equal(s.order.length, 250);
});

test('the fixtures (notes/stage-3.md §9) hold every case, validate, and lay out with no overlap and no connector through another element', () => {
  const ec = STRESS.views.find(v => v.id === 'edge-cases'), E = new Map(STRESS.edges.map(e => [e.id, e])), ms = ec.edges.map(id => E.get(id)).filter(e => e.type === 'uml.Message');
  const on = (a, b) => ms.filter(m => (m.from === a && m.to === b));
  assert.ok(on('client', 'server').length >= 2 && on('server', 'client').length >= 2, 'two messages each way on one link (G3)');
  assert.ok(ec.edges.some(id => E.get(id).type === 'uml.Connector' && E.get(id).from === E.get(id).to) && ms.some(m => m.from === m.to), 'a self-message on a self connector');
  assert.equal(on('server', 'store').length + on('store', 'server').length, 6, 'six messages on one link');
  assert.ok(ec.nodeIds.some(id => !ec.edges.some(e => E.get(e).type === 'uml.Connector' && (E.get(e).from === id || E.get(e).to === id))), 'a lifeline with no connector');
  assert.deepEqual([...new Set(ms.map(m => m.props.sort))].sort(), ['async', 'call', 'create', 'delete', 'reply'], 'every sort');
  const all = STRESS.views.find(v => v.id === 'all');
  assert.deepEqual([all.nodeIds.length, all.edges.filter(id => E.get(id).type === 'uml.Connector').length, all.edges.filter(id => E.get(id).type === 'uml.Message').length], [20, 30, 200]);
  assert.deepEqual(validate(MINIMAL), []);
  assert.deepEqual(validate(STRESS), []);
  for (const [m, vid, crossings] of [[MINIMAL, 'v', 0], [EX, 'checkout', 0], [STRESS, 'edge-cases', 0], [STRESS, 'all', 13]]) {
    const r = clean(m, vid);
    assert.deepEqual(r.bad, [], vid);
    assert.deepEqual(r.others, [], `${vid}: check() finds nothing but connectors that cross`);
    console.log(`# ${vid}: ${r.g.nodes.length} nodes (${rowsOf(r.g).length} message rows), ${r.g.edges.length} connectors, ${r.crossings.length} crossings`);
    assert.equal(r.crossings.length, crossings, `${vid}: the crossings stated here`);
  }
  // laid out down, and with a lifeline pinned: as clean
  const down = structuredClone(EX); VIEW(down).direction = 'down';
  assert.deepEqual(clean(down, 'checkout').bad, []);
  const pinned = apply(EX, { op: 'set', view: 'checkout', path: ['layout', 'receipt'], value: [0, 3] }), r = clean(pinned, 'checkout'), g0 = layout(EX, 'checkout');
  assert.deepEqual(r.bad, []);
  assert.deepEqual([r.g.byId.receipt.col, r.g.byId.receipt.row], [0, 3], 'the pin is the lifeline\'s place, in the columns and rows a drag or Alt + arrows reads');
  assert.ok(r.g.byId.receipt.y > g0.byId.receipt.y && r.g.byId.receipt.x < g0.byId.receipt.x);
});

// review of 3.5: a stack between its two lifelines, so a connector's halves leave it on opposite sides and its rows' arrows
// point both ways; no half sent back across the picture; a joined connector that never crosses itself outside its stack
const lifelines = n => Array.from({ length: n }, (_, i) => ({ id: 'L' + i, type: 'uml.Lifeline' }));
const con = (id, from, to) => ({ id, type: 'uml.Connector', from, to });
const view1 = (nodes, edges, extra = {}) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.communication', nodeIds: nodes.map(n => n.id), edges: edges.map(e => e.id), ...extra }] });
const crossings = P => { const out = []; P.slice(1).forEach((b, i) => P.slice(i + 3).forEach((d, k) => { const a = P[i], c = P[i + k + 2], h = a[1] === b[1];
  if (h === (c[1] === d[1])) return; const [A, B, C, D] = h ? [a, b, c, d] : [c, d, a, b];
  if (C[0] > Math.min(A[0], B[0]) && C[0] < Math.max(A[0], B[0]) && A[1] > Math.min(C[1], D[1]) && A[1] < Math.max(C[1], D[1])) out.push([C[0], A[1]]); })); return out; };
const outsideStack = (g, e) => { const rs = (e.stack || []).map(id => g.byId[id]), x = rs[0] ? rs[0].x : 0, y = rs[0] ? rs[0].y : 0, h = 16 * rs.length, w = rs[0] ? rs[0].w : 0;
  return crossings(e.pts).filter(([cx, cy]) => !(cx >= x && cx <= x + w && cy >= y && cy <= y + h)); };
test('a stack sits between its two lifelines: rows sent each way point opposite ways, and no connector runs back through another one\'s rows', () => {
  const both = view1(lifelines(3), [con('L1-L2', 'L1', 'L2'), con('L0-L1', 'L0', 'L1'), msg('m3', 'L2', 'L0', 'async'), con('L2-L0', 'L2', 'L0'), msg('m6', 'L2', 'L0', 'async'), msg('m8', 'L0', 'L2', 'call')]);
  both.views[0].edges = ['L1-L2', 'L0-L1', 'L2-L0', 'm3', 'm6', 'm8'];
  assert.deepEqual(validate(both), []);
  let g = layout(both, 'v');
  assert.deepEqual(['m3', 'm6', 'm8'].map(id => g.byId[id].dir), ['left', 'left', 'right'], 'toward L0 (left), toward L2 (right)');
  const st = g.byId.m3; assert.ok(g.byId.L0.x + g.byId.L0.w < st.x && st.x + st.w < g.byId.L2.x, 'the stack between L0 and L2');
  const back = view1(lifelines(4), [msg('m1', 'L0', 'L2', 'call'), con('L0-L2', 'L0', 'L2'), con('L1-L3', 'L1', 'L3'), msg('m3', 'L1', 'L2', 'call'), con('L1-L2', 'L1', 'L2'),
    msg('m4', 'L0', 'L2', 'call'), msg('m6', 'L2', 'L0', 'call'), msg('m8', 'L2', 'L3', 'async'), con('L2-L3', 'L2', 'L3'), con('L3-L0', 'L3', 'L0')]);
  back.views[0].edges = ['L0-L2', 'L1-L3', 'L1-L2', 'L2-L3', 'L3-L0', 'm1', 'm3', 'm4', 'm6', 'm8'];
  assert.deepEqual(validate(back), []);
  const warned = [], warn = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  try { const r = clean(back, 'v'); assert.deepEqual([r.bad, r.others], [[], []]); } finally { console.warn = warn; }
  assert.deepEqual(warned, [], 'the router found a way round every row');
  // a three-lifeline cycle, a fourth message the other way round it, and three sent back: no connector loops round on itself
  const cyc = view1(lifelines(3), [con('ab', 'L0', 'L1'), con('bc', 'L1', 'L2'), con('ca', 'L2', 'L0'), msg('m1', 'L0', 'L1', 'async'), msg('m2', 'L1', 'L2', 'async'), msg('m3', 'L2', 'L0', 'async'), msg('m4', 'L0', 'L2', 'async')]);
  for (const m of [cyc, apply(cyc, ['x1', 'x2'].map(id => ({ op: 'add', element: msg(id, 'L2', 'L0', 'async'), view: 'v' })))]) {
    g = layout(m, 'v');
    g.edges.forEach(e => assert.deepEqual(outsideStack(g, e), [], e.id));
  }
});

test('random views (a seeded sweep of 80, laid out right and down, self-messages among them): no overlap, no connector through another element, rows sent each way point opposite ways, and no connector crosses itself outside its stack', () => {
  let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = a => a[Math.floor(rnd() * a.length)];
  const warned = [], warn = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  let loops = 0, twoWay = 0;
  try {
    for (let t = 0; t < 80; t++) {
      const ids = lifelines(2 + Math.floor(rnd() * 5));
      let m = view1(ids, [], { direction: rnd() < .3 ? 'down' : 'right' });
      for (let k = 0; k < 14; k++) { const a = pick(ids).id, b = rnd() < .15 ? a : pick(ids).id, cs = commConnect(m, VIEW(m), a, b, null, { type: 'uml.Message', props: { sort: pick(['call', 'async']) } }); if (Array.isArray(cs)) m = apply(m, cs); }
      const r = clean(m, 'v'), E = new Map(m.edges.map(e => [e.id, e]));
      assert.deepEqual([r.bad, r.others], [[], []], `view ${t}`);
      r.g.edges.filter(e => e.stack).forEach(e => {
        const ways = new Map(e.stack.map(id => [E.get(id).from, r.g.byId[id].dir]));
        if (ways.size === 2) { twoWay++; assert.notEqual(...ways.values(), `view ${t}, ${e.id}: a row each way`); }
        loops += e.from === e.to; assert.deepEqual(outsideStack(r.g, e), [], `view ${t}, ${e.id}`);
      });
    }
  } finally { console.warn = warn; }
  console.log(`# sweep: ${twoWay} stacks with rows each way, ${loops} self connectors with messages`);
  assert.deepEqual(warned, []);
  assert.ok(twoWay > 50 && loops > 20);
});

test('a view with no lifelines, or with messages and no connector, lays out and draws', () => {
  for (const v of [{ id: 'v', diagram: 'uml.communication', nodeIds: [], edges: [] }, { id: 'v', diagram: 'uml.communication', nodeIds: ['client', 'server'], edges: ['get', 'got'] }]) {
    const m = { ...MINIMAL, views: [v] }, g = layout(m, 'v');
    assert.deepEqual([g.edges.length, rowsOf(g).length], [0, 0]);
    assert.match(mapContext(m).buildView('v').markup, /^<svg /);
  }
});

// ---- validators: each rule has a passing fixture (example 12, the minimal view, the stress fixture: above) and a failing one
const rulesOf = m => commProblems(m, VIEW(m)).map(p => [p.level, p.rule, p.ids]);
const msg = (id, from, to, sort, more = {}) => ({ id, type: 'uml.Message', from, to, ...(sort === undefined ? {} : { props: { sort, ...more } }) });
const with_ = (edges, extra = {}) => ({ ...MINIMAL, edges: [...MINIMAL.edges, ...edges], views: [{ ...VIEW(MINIMAL), edges: [...VIEW(MINIMAL).edges, ...edges.map(e => e.id)], ...extra }] });
test('message-link: a message needs a connector of the view between its lifelines, a self-message a self connector, and both ends in the view', () => {
  assert.deepEqual(rulesOf(with_([msg('x', 'client', 'client', 'call')])), [['error', 'message-link', ['x', 'client', 'client']]]);
  assert.deepEqual(rulesOf(with_([{ id: 'cs', type: 'uml.Connector', from: 'client', to: 'client' }, msg('x', 'client', 'client', 'call')])), []);
  const hidden = { ...MINIMAL, views: [{ ...VIEW(MINIMAL), edges: ['get', 'got'] }] };
  assert.deepEqual(rulesOf(hidden).map(p => p[1]), ['message-link', 'message-link']);
  const out = { ...MINIMAL, views: [{ ...VIEW(MINIMAL), nodeIds: ['client'] }] }, p = commProblems(out, VIEW(out));
  assert.deepEqual(p.map(x => x.rule), ['message-link', 'message-link']);
  assert.match(p[0].message, /^message-link: get \("get\(id\)"\) runs from client to server, and server is not a lifeline of view v$/);
  assert.equal(p[0].path, 'edges[1]');
  assert.deepEqual(validate(out).filter(x => x.rule === 'message-link').length, 2, 'validate() runs the type\'s rules');
});
test('the shared rules (src/uml/interaction.js): reply-call, reply-once, create-once, delete-once and sort each fail on a fixture', () => {
  assert.deepEqual(rulesOf(with_([msg('r', 'server', 'client', 'reply', { replyTo: 'got' })])), [['error', 'reply-call', ['r', 'got']]]);
  assert.deepEqual(rulesOf(with_([msg('r', 'server', 'client', 'reply')])), [['warning', 'reply-call', ['r']]]);
  assert.deepEqual(rulesOf(with_([msg('r', 'server', 'client', 'reply', { replyTo: 'get' })])), [['error', 'reply-once', ['get', 'got', 'r']]], 'a call has one reply here: there are no operands');
  assert.deepEqual(rulesOf(with_([msg('c', 'client', 'server', 'create')])), [['error', 'create-once', ['c', 'server', 'get']]]);
  assert.deepEqual(rulesOf(with_([msg('d', 'client', 'server', 'delete'), msg('e', 'client', 'server', 'call')])), [['error', 'delete-once', ['d', 'server', 'e']]]);
  assert.deepEqual(rulesOf(with_([msg('s', 'client', 'server', 'ping'), msg('n', 'client', 'server')])).map(p => p.slice(0, 2)), [['warning', 'sort'], ['warning', 'sort']]);
  const g = layout(with_([msg('s', 'client', 'server', 'ping')]), 'v');
  assert.equal(g.byId.s.sort, 'call', 'a sort it does not know is drawn as a call');
});

// ---- editing (§5.1, §6.4): the hooks return commands, run here through apply(); none breaks a rule
const run = (m, cs) => { assert.ok(Array.isArray(cs), JSON.stringify(cs)); const n = apply(m, cs); assert.deepEqual(errors(n), []); return n; };
const order = m => VIEW(m).edges;
test('connect: a connector among the connectors; a message at the end or after one, with its connector when none joins its lifelines', () => {
  const V = VIEW(EX), CALL = { type: 'uml.Message', label: 'Call', props: { sort: 'call' } };
  assert.deepEqual(commConnect(EX, V, 'shopper', 'api', null, { type: 'uml.Connector' }), [{ op: 'add', element: { id: 'shopper-api', type: 'uml.Connector', from: 'shopper', to: 'api' }, view: 'checkout', index: 5 }]);
  assert.deepEqual(commConnect(EX, V, 'api', 'storefront', null, { type: 'uml.Connector' }), { error: 'api and storefront are linked already' });
  assert.deepEqual(commConnect(EX, V, 'api', 'api', null, { type: 'uml.Connector' }), { error: 'api is linked to itself already' });
  assert.ok(commConnect(EX, V, 'api', 'nobody', null, CALL).error);
  let m = run(EX, commConnect(EX, V, 'shopper', 'storefront', null, CALL));
  assert.deepEqual(order(m).slice(-2), ['m9', 'm10']);
  assert.equal(layout(m, 'checkout').byId.m10.num, '2');
  m = run(EX, commConnect(EX, V, 'api', 'payments', { after: 'm4' }, { ...CALL, props: { sort: 'async' } }));
  assert.deepEqual(order(m).slice(8, 11), ['m4', 'm10', 'm5']);
  assert.equal(layout(m, 'checkout').byId.m10.num, '1.1.3', 'numbered in its place: sent from api\'s activation, after m4');
  m = run(EX, commConnect(EX, V, 'payments', 'payments', { index: 0 }, CALL)); // a self-message, with its self connector; never among the connectors
  assert.deepEqual([order(m)[5], order(m)[6]], ['payments-self', 'm10']);
  m = run(EX, commConnect(EX, V, 'storefront', 'receipt', null, { ...CALL, props: { sort: 'reply' } }));
  assert.deepEqual(m.edges.find(e => e.id === 'm10').props, { sort: 'reply' }, 'no call from receipt to storefront to answer: a reply with no replyTo, which warns');
  m = run(EX, commConnect(EX, V, 'payments', 'api', { after: 'm5' }, { ...CALL, props: { sort: 'reply' } }));
  assert.deepEqual(m.edges.find(e => e.id === 'm10').props, { sort: 'reply' }, 'm4 is answered already');
  const n = apply(EX, { op: 'delete', id: 'm5' });
  m = run(n, commConnect(n, VIEW(n), 'payments', 'api', { after: 'm4' }, { ...CALL, props: { sort: 'reply' } }));
  assert.deepEqual(m.edges.at(-1).props, { sort: 'reply', replyTo: 'm4' }, 'the latest unanswered call from its receiver to its sender');
});

test('moveTo: Alt + Up/Down moves a message one place in time, a drop onto a row takes that row\'s place; a lifeline is left to the pin', () => {
  const V = VIEW(EX), at = (m, id) => order(m).indexOf(id);
  let m = run(EX, commMoveTo(EX, V, 'm7', { by: [0, -1] }));
  assert.deepEqual(order(m).slice(8, 12), ['m4', 'm5', 'm7', 'm6']);
  m = run(EX, commMoveTo(EX, V, 'm7', { by: [0, 1] }));
  assert.ok(at(m, 'm7') === at(m, 'm8') + 1);
  m = run(EX, commMoveTo(EX, V, 'm9', { id: 'm7' }));
  assert.deepEqual(order(m).slice(-4), ['m6', 'm9', 'm7', 'm8']);
  m = run(EX, commMoveTo(EX, V, 'm6', { id: 'm8' }));
  assert.deepEqual(order(m).slice(-4), ['m7', 'm8', 'm6', 'm9'], 'down: after the row it was dropped on');
  m = run(EX, commMoveTo(EX, V, 'm9', { index: 11 })); // a slot: before the entry at that index of view.edges, m7's
  assert.deepEqual(order(m).slice(-5), ['m5', 'm6', 'm9', 'm7', 'm8']);
  m = run(EX, commMoveTo(EX, V, 'm2', { index: 11 }));
  assert.deepEqual(order(m).slice(5), ['m1', 'm3', 'm4', 'm5', 'm6', 'm2', 'm7', 'm8', 'm9']);
  assert.deepEqual(commMoveTo(EX, V, 'm1', { by: [0, -1] }), [], 'the first message goes no earlier');
  assert.deepEqual(commMoveTo(EX, V, 'm9', { by: [0, 1] }), []);
  assert.deepEqual(commMoveTo(EX, V, 'm4', { by: [1, 0] }), [], 'sideways moves no message');
  // never a transaction that breaks a rule (S5): { error } for the hint line, naming it
  assert.match(commMoveTo(EX, V, 'm5', { by: [0, -1] }).error, /^reply-call: m5 \("paid"\) answers "m4", which is not an earlier call/);
  assert.match(commMoveTo(EX, V, 'm1', { id: 'm9' }).error, /^reply-call: m9/, 'a call moved after its reply');
  const fill = run(EX, commConnect(EX, V, 'api', 'receipt', { after: 'm6' }, { type: 'uml.Message', props: { sort: 'call' } }));
  assert.match(commMoveTo(fill, VIEW(fill), 'm6', { by: [0, 1] }).error, /^create-once: m6 \("new\(order\)"\) creates receipt, but m10 reaches it first/);
  assert.match(commConnect(EX, V, 'api', 'receipt', { after: 'm5' }, { type: 'uml.Message', props: { sort: 'call' } }).error, /^create-once: /, 'a message before its receiver\'s create');
  assert.equal(commMoveTo(EX, V, 'api', { by: [0, 1] }), null);
  assert.equal(commMoveTo(EX, V, 'api-payments', { by: [0, 1] }), null);
  // the slots the canvas passes: a row's (by its id) takes that row's place, a lifeline's moves no message and starts no message
  // anywhere but last
  assert.deepEqual(commMoveTo(EX, V, 'm9', { after: 'm7', y: 0 }), commMoveTo(EX, V, 'm9', { id: 'm7' }));
  assert.deepEqual(commMoveTo(EX, V, 'm9', { index: 2, after: 'api', lifeline: true, y: 0 }), []);
  assert.equal(commConnect(EX, V, 'shopper', 'storefront', { index: 1, after: 'shopper', lifeline: true }, { type: 'uml.Message', props: { sort: 'call' } })[0].index, VIEW(EX).edges.length);
  const after = layout(run(EX, commMoveTo(EX, V, 'm7', { by: [0, -1] })), 'checkout');
  assert.deepEqual(['m4', 'm5', 'm7', 'm6'].map(id => after.byId[id].num), ['1.1.2', '1.1.2.1', '1.1.3', '1.1.4'], 'numbered again in the new order');
});

test('add: the palette\'s lifeline, last or at an index; remove: a connector takes its messages, a hidden call its replies', () => {
  const V = VIEW(EX);
  let m = run(EX, commAdd(EX, V, { type: 'uml.Lifeline' }, 'Audit log', { index: 2 }));
  assert.deepEqual(VIEW(m).nodeIds.slice(0, 3), ['shopper', 'storefront', 'audit-log']);
  assert.deepEqual(commAdd(m, VIEW(m), { type: 'uml.Lifeline' }, 'Audit log')[0].element, { id: 'audit-log-2', type: 'uml.Lifeline', label: 'Audit log' });
  assert.equal(commAdd(EX, V, { type: 'uml.Message' }, 'x'), null);
  assert.deepEqual(commRemove(EX, V, ['api-payments'], false), [{ op: 'hide', id: 'api-payments', view: 'checkout' }, { op: 'hide', id: 'm4', view: 'checkout' }, { op: 'hide', id: 'm5', view: 'checkout' }]);
  m = run(EX, commRemove(EX, V, ['api-payments'], false));
  assert.ok(m.edges.some(e => e.id === 'm4'), 'hidden, still in the model');
  m = run(EX, commRemove(EX, V, ['api-payments'], true));
  assert.ok(!m.edges.some(e => ['api-payments', 'm4', 'm5'].includes(e.id)));
  assert.deepEqual(commRemove(EX, V, ['m2'], false).map(c => c.id), ['m2', 'm8'], 'a call hidden takes its reply');
  run(EX, commRemove(EX, V, ['m2'], false));
  m = run(EX, commRemove(EX, V, ['m2'], true));
  assert.ok(!m.edges.some(e => e.id === 'm8'), 'a call deleted takes its reply (refs)');
  m = run(EX, commRemove(EX, V, ['payments'], false));
  assert.ok(!VIEW(m).edges.some(id => ['api-payments', 'm4', 'm5'].includes(id)), 'a lifeline hidden takes its connectors and messages');
  run(EX, commRemove(EX, V, ['payments', 'api-payments', 'm4'], true));
  // a connector deleted from the model takes the messages another view carries on it, and none another connector carries there
  const two = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Lifeline' }, { id: 'b', type: 'uml.Lifeline' }],
    edges: [{ id: 'c', type: 'uml.Connector', from: 'a', to: 'b' }, { id: 'c2', type: 'uml.Connector', from: 'b', to: 'a' }, msg('m1', 'a', 'b', 'call'), msg('m2', 'a', 'b', 'async'), msg('m3', 'b', 'a', 'async')],
    views: [{ id: 'v1', diagram: 'uml.communication', nodeIds: ['a', 'b'], edges: ['c', 'm1'] }, { id: 'v2', diagram: 'uml.communication', nodeIds: ['a', 'b'], edges: ['c', 'm2'] },
      { id: 'v3', diagram: 'uml.communication', nodeIds: ['a', 'b'], edges: ['c', 'c2', 'm3'] }] };
  assert.deepEqual(validate(two), []);
  assert.deepEqual(commRemove(two, two.views[0], ['c'], true), [{ op: 'delete', id: 'c' }, { op: 'delete', id: 'm1' }, { op: 'delete', id: 'm2' }], 'm3 stays on c2 in v3');
  run(two, commRemove(two, two.views[0], ['c'], true));
  assert.deepEqual(commRemove(two, two.views[0], ['c'], false), [{ op: 'hide', id: 'c', view: 'v1' }, { op: 'hide', id: 'm1', view: 'v1' }]);
});

test('save and reopen (DoD 6): a 30-step communication session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const T = diagramOf({ diagram: 'uml.communication' }), E = T.edits, CALL = { type: 'uml.Message', props: { sort: 'call' } }, REPLY = { type: 'uml.Message', props: { sort: 'reply' } };
  const steps = [
    m => E.add(m, VIEW(m), { type: 'uml.Lifeline' }, 'Audit'), m => E.connect(m, VIEW(m), 'api', 'audit', { after: 'm5' }, CALL), m => [{ op: 'set', id: 'm10', path: 'label', value: 'record(payment)' }],
    m => E.connect(m, VIEW(m), 'audit', 'api', { after: 'm10' }, REPLY), m => E.moveTo(m, VIEW(m), 'm11', { by: [0, 1] }), m => E.moveTo(m, VIEW(m), 'm11', { by: [0, -1] }),
    m => [{ op: 'set', id: 'audit', path: 'props.represents', value: 'AuditLog' }], m => E.connect(m, VIEW(m), 'audit', 'audit', null, CALL), m => [{ op: 'set', id: 'm12', path: 'label', value: 'flush()' }],
    m => E.moveTo(m, VIEW(m), 'm12', { id: 'm11' }), m => E.remove(m, VIEW(m), ['m12'], false), m => E.connect(m, VIEW(m), 'shopper', 'storefront', null, CALL),
    m => [{ op: 'set', id: 'm13', path: 'label', value: 'track()' }], m => E.connect(m, VIEW(m), 'storefront', 'shopper', null, REPLY), m => [{ op: 'set', id: 'm7', path: 'props.sort', value: 'call' }],
    m => E.moveTo(m, VIEW(m), 'm7', { by: [0, -1] }), m => E.remove(m, VIEW(m), ['m13'], true), m => [{ op: 'set', view: 'checkout', path: ['layout', 'receipt'], value: [6, 2] }],
    m => E.connect(m, VIEW(m), 'api', 'receipt', { after: 'm6' }, { type: 'uml.Message', props: { sort: 'delete' } }), m => E.moveTo(m, VIEW(m), 'm13', { by: [0, 1] }), // m13 again: deleted at step 17, with its reply
    m => E.add(m, VIEW(m), { type: 'uml.Lifeline' }, 'Spare'), m => E.connect(m, VIEW(m), 'spare', 'audit', null, { type: 'uml.Connector' }), m => E.remove(m, VIEW(m), ['spare-audit'], true),
    m => [{ op: 'set', id: 'spare', path: 'props.stereotypes', value: ['actor'] }], m => E.remove(m, VIEW(m), ['spare'], false), m => E.moveTo(m, VIEW(m), 'm3', { by: [0, 1] }),
    m => E.connect(m, VIEW(m), 'api', 'payments', { after: 'm5' }, { type: 'uml.Message', props: { sort: 'async' } }), m => [{ op: 'set', id: 'm14', path: 'label', value: 'audit()' }],
    m => E.remove(m, VIEW(m), ['api-receipt'], false), m => E.moveTo(m, VIEW(m), 'm14', { id: 'm1' }),
  ];
  assert.equal(steps.length, 30);
  const h = history(EX), seen = [JSON.stringify(h.model)], cmds = [];
  for (const s of steps) { const c = s(h.model); assert.ok(Array.isArray(c) && c.length, `step ${seen.length}: ${JSON.stringify(c)}`); cmds.push(c);
    h.push(apply(h.model, c)); seen.push(JSON.stringify(h.model)); assert.deepEqual(errors(h.model), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = cmds.slice(15).reduce((m, c) => apply(m, c), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const geo = m => JSON.stringify(layout(m, 'checkout'), (k, v) => (k === 'ms' || k === 's' || k === 't' ? undefined : v));
  assert.equal(geo(reopened), geo(JSON.parse(seen[30])));
  assert.deepEqual(clean(reopened, 'checkout').bad, []);
});

test('performance (§10, risks.md P1): the stress view lays out in under 1 s, and a message added, renamed or reordered is laid out again and drawn (SVG markup) in under 100 ms', () => {
  // best of three, in this process's CPU time: node --test runs the suites side by side, and on a busy machine the wall
  // clock counts the time other processes hold the CPU. Both are printed
  const V = STRESS.views.find(v => v.id === 'all'), edits = {
    add: commConnect(STRESS, V, 'gateway', 'auth', { after: 'a100' }, { type: 'uml.Message', props: { sort: 'call' } }),
    rename: [{ op: 'set', id: 'a5', path: 'label', value: 'renamed(with, a, longer, label)' }],
    reorder: commMoveTo(STRESS, V, 'a40', { by: [0, -1] }) };
  const timed = f => { const c = process.cpuUsage(), t = performance.now(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000, performance.now() - t]; };
  const runs = [];
  for (let i = 0; i < 3; i++) { // the first run is cold (the JIT warms up on it)
    const memos = {}, r = {};
    [, r.full, r.fullWall] = timed(() => mapContext(STRESS, { memos }).buildGeo('all'));
    for (const [k, c] of Object.entries(edits)) { const m = apply(STRESS, c), was = memos.all.runs; let out;
      [out, r[k], r[k + 'Wall']] = timed(() => mapContext(m, { memos }).buildView('all').markup);
      assert.equal(memos.all.runs, was + 1, `${k} lays the view out again`); assert.match(out, /^<svg /); }
    runs.push(r);
  }
  const best = k => Math.min(...runs.map(r => r[k])), ms = k => runs.map(r => Math.round(r[k])).join(', ');
  console.log(`# 20 lifelines, 30 connectors, 200 messages, CPU (wall) ms: full layout ${ms('full')} (${ms('fullWall')}); a message added ${ms('add')} (${ms('addWall')}), renamed ${ms('rename')} (${ms('renameWall')}), reordered ${ms('reorder')} (${ms('reorderWall')})`);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  for (const k of Object.keys(edits)) assert.ok(best(k) < 100, `a message ${k}: ${best(k)} ms`);
});
