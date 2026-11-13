// The component diagram, uml.component (work package 5.4, notes/stage-5.md §10.1): the type's definition, docs/diagrams/
// examples/05-component.json drawn (its own ranking, boxes, ports on borders, delegations inward, ball and socket), laid out
// clean right and down, line ends on their ports' squares, the ports on a node drawn in its group, a memo's picture the
// same as a fresh one; accessible names, reading order, describe(), the legend, the PDF's rows and words; the validators;
// the editing hooks; a 30-step session saved and reopened; the common edit's time. tests/component.html draws it in a
// browser and edits it by pointer and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
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
import { SHAPE, drawnPts } from '../src/draw/shapes.js';
import '../src/uml/component.js';

const CM = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/05-component.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.component' }), V = 'components';
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const inside = (p, r, m = 0) => p[0] >= r.x - m && p[0] <= r.x + r.w + m && p[1] >= r.y - m && p[1] <= r.y + r.h + m;
const ports = g => Object.values(g.byId).filter(n => n.shape === 'port');
const ownerOf = (g, id) => g.byId[id] || g.families.find(f => f.id === id);
const unid = s => s.replace(/\bg\d+-/g, 'g-');

test('the definition: uml.component is registered with its palette, its eight lines, its properties, its own ranking and its hooks', () => {
  assert.equal(T.name, 'uml.component');
  assert.deepEqual(T.elements.map(e => e.label), ['Component', 'Interface', 'Artifact', 'Package', 'Port', 'Comment']);
  assert.deepEqual(T.lines.map(e => [e.label, e.type, e.props && e.props.kind]), [['Realization', 'uml.InterfaceRealization', undefined], ['Component realization', 'uml.ComponentRealization', undefined],
    ['Usage', 'uml.Usage', undefined], ['Assembly', 'uml.Connector', 'assembly'], ['Delegation', 'uml.Connector', 'delegation'], ['Dependency', 'uml.Dependency', undefined],
    ['Manifestation', 'uml.Manifestation', undefined], ['Comment link', 'uml.CommentLink', undefined]]);
  assert.deepEqual(T.props['uml.Port'].map(f => f.key), ['valueType', 'stereotypes']);
  assert.deepEqual(T.props['uml.Connector'][0], { key: 'kind', label: 'Kind', kind: 'enum', options: ['assembly', 'delegation'] });
  assert.equal(T.layout.rank, false, 'the type ranks the view: the host passes the pins');
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'key', 'member', 'moveTo', 'remove']);
  assert.deepEqual(Object.keys(T.rules).sort(), ['assembly-ends', 'ball-interface', 'component-owner', 'component-realization-ends', 'delegation-ends', 'manifest-ends', 'port-owner', 'provided-ends', 'required-ends']);
  assert.deepEqual(['uml.Component', 'uml.Interface', 'uml.Artifact'].map(t => T.member.holds({ type: t })), [true, true, false]);
});

for (const direction of ['right', 'down']) test(`05-component.json (${direction}) lays out clean: boxes, ports on their owners' borders, every port line ending on its square`, () => {
  const m = withDir(CM, direction), g = layout(m, V);
  assert.deepEqual(validate(m), []);
  assert.deepEqual(check(m, V), [], 'no overlap (a port is not its owner\'s), no crossing, no line through a node');
  assert.deepEqual(g.stats, { grid: 10 });
  assert.deepEqual(g.families.map(f => [f.id, f.shape]), [['shop-api', 'component']]);
  assert.ok(g.byId.checkout.x - g.families[0].x >= 48 - .01, 'a box with ports has 48 px of padding');
  assert.deepEqual(['storefront', 'accounts', 'order-worker', 'i-orders', 'i-sign-in', 'shop-api-jar'].map(id => g.byId[id].shape), ['component', 'component', 'component', 'ball', 'classifier', 'artifact']);
  // the ports on a node are drawn in its group (shape 'ported'), not as nodes of their own: the check does not take them for overlaps
  assert.deepEqual(g.nodes.filter(n => n.shape === 'ported').map(n => [n.id, n.base, n.held.map(p => p.id)]), [['checkout', 'component', ['checkout.orders', 'checkout.payments']], ['payment-provider', 'component', ['payment-provider.charges']]]);
  assert.deepEqual(g.nodes.filter(n => n.shape === 'port').map(n => n.id), ['shop-api.orders', 'shop-api.payments'], 'a box\'s ports are nodes');
  const ps = ports(g); assert.equal(ps.length, 5);
  ps.forEach(p => { const o = ownerOf(g, p.owner), v = p.side === 'L' || p.side === 'R', b = p.side === 'L' ? o.x : p.side === 'R' ? o.x + o.w : p.side === 'T' ? o.y : o.y + o.h;
    assert.ok(Math.abs((v ? p.x : p.y) + 6 - b) < .01, `${p.id} centred on ${o.id}'s border`); });
  // every line from or to a port ends on the square's face within 1 px; a delegation enters its box only at the port
  const sq = Object.fromEntries(ps.map(p => [p.id, p]));
  g.edges.forEach(e => [[e.fromPort, e.pts[0]], [e.toPort, e.pts.at(-1)]].forEach(([id, pt]) => { if (id) assert.ok(inside(pt, sq[id], 1), `${e.id} ends on ${id}: ${pt}`); }));
  assert.deepEqual(g.edges.filter(e => e.inner).map(e => [e.id, e.inner]), [['orders-to-checkout', 'from'], ['checkout-to-payments', 'to']]);
  // each delegation runs straight in: its two ports on one side; the ball's lines end on its circle (radius 8), level with it
  for (const [a, b] of [['shop-api.orders', 'checkout.orders'], ['shop-api.payments', 'checkout.payments']]) assert.equal(sq[a].side, sq[b].side);
  const ball = g.byId['i-orders'];
  g.edges.filter(e => e.to === 'i-orders').forEach(e => { const [x, y] = drawnPts(e, n => (n && SHAPE[n.shape] ? { ...n, S: SHAPE[n.shape] } : null)).at(-1); // slid onto the circle, as drawn
    assert.ok(Math.abs(Math.hypot(x - ball.x - ball.w / 2, y - ball.y - 8) - 8) < 1 && Math.abs(y - ball.y - 8) < 8, `${e.id} ends on the ball's circle: ${x}, ${y}`); });
  assert.deepEqual(g.edges.filter(e => e.to === 'i-orders').map(e => [e.id, e.end.to, !!e.end.dashed]), [['api-provides-orders', 'none', false], ['storefront-requires-orders', 'socket', false]], 'stem and socket');
});

test('drawn: ports in their owner\'s group with names; markup laid out from a memo is a fresh layout\'s, and drawing leaves the memo as it was', () => {
  const s = svgOf(layout(CM, V));
  assert.match(s, /<g class="node component" data-id="checkout"[^>]*>.*<g class="node port" data-id="checkout.orders"[^>]*aria-label="Port orders of Checkout"/);
  assert.match(s, /class="port-name"[^>]*>charges</);
  assert.match(s, /marker-end="url\(#[^)]*-socket-/);
  const memos = {}, draw = m => unid(mapContext(m, { memos }).buildView(V).markup), a = draw(CM), was = JSON.stringify(memos[V].g.edges.map(e => e.pts));
  assert.equal(draw(structuredClone(CM)), a); assert.equal(memos[V].runs, 1);
  assert.equal(unid(mapContext(CM).buildView(V).markup), a);
  assert.equal(JSON.stringify(memos[V].g.edges.map(e => e.pts)), was);
});

test('names, reading order, describe(), the legend, and the PDF\'s words and rows', () => {
  const g = layout(CM, V), by = g.byId;
  assert.equal(g.families[0].aria, 'Component Shop API, 2 ports, holding 1 component');
  assert.equal(by['shop-api.orders'].aria, 'Port orders of Shop API, provides Orders');
  assert.equal(by['i-orders'].aria, 'Interface Orders, as a ball, provided by Shop API, required by Storefront');
  assert.equal(by['shop-api-jar'].aria, 'Artifact shop-api.jar, manifests Shop API');
  assert.equal(g.edges.find(e => e.id === 'orders-to-checkout').aria, 'Delegation from orders of Shop API to orders of Checkout');
  assert.deepEqual(g.order.slice(0, 7), ['storefront', 'shop-api', 'shop-api.orders', 'shop-api.payments', 'checkout', 'checkout.orders', 'checkout.payments']);
  assert.equal(g.order.length, 9 + 5 + 10);
  const d = describe(CM, V).split('\n');
  assert.equal(d[0], 'Bookshop components: a component diagram of 9 elements and 10 lines.');
  assert.equal(d.length, 1 + 9 + 5 + 10);
  assert.equal(d.at(-3), 'Assembly from payments of Shop API to charges of Payment provider.');
  const legend = g.legend.map(x => x.match(/<b>([^<]*)/)[1]);
  assert.deepEqual(legend, ['Realization', 'Usage', 'Realization', 'Usage', 'Assembly', 'Delegation', 'Dependency', 'Manifestation'], 'stem, socket, then the rectangle\'s');
  assert.deepEqual([T.word(CM, 'shop-api'), T.word(CM, 'i-orders'), T.word(CM, 'shop-api.orders')], ['Component', 'Interface', null]);
  assert.deepEqual(T.rows(CM, CM.views[0], 'shop-api'), ['orders, provides Orders', 'payments']);
  assert.deepEqual(T.rows(CM, CM.views[0], 'shop-api-jar'), ['manifests Shop API']);
  const typed = structuredClone(CM); typed.nodes[1].members[0].props = { valueType: 'OrderApi' };
  assert.deepEqual(T.rows(typed, typed.views[0], 'shop-api')[0], 'orders : OrderApi, provides Orders');
});

test('pins: a pinned node keeps its place and a node it would cover moves down; present.<port>.side pins a port', () => {
  const m = structuredClone(CM), g0 = layout(m, V); m.views[0].layout = { accounts: [g0.byId.storefront.col, g0.byId.storefront.row] };
  const g = layout(m, V); assert.deepEqual([g.byId.accounts.col, g.byId.accounts.row], m.views[0].layout.accounts); assert.ok(g.byId.storefront.row > g.byId.accounts.row);
  m.views[0].present['payment-provider.charges'] = { side: 'bottom' };
  assert.equal(layout(m, V).byId['payment-provider.charges'].side, 'B');
});

// ---- validators, each with a passing and a failing case
const E = (id, type, from, to, props) => ({ id, type: 'uml.' + type, from, to, ...(props ? { props } : {}) });
const BREAKS = {
  'port-owner': m => { m.nodes.find(n => n.id === 'i-orders').members = [{ id: 'bad', type: 'uml.Port', label: 'x' }]; return ['bad', 'i-orders']; },
  'provided-ends': m => { m.edges.push(E('bad', 'InterfaceRealization', 'shop-api-jar', 'i-orders')); return ['bad', 'shop-api-jar', 'i-orders']; },
  'required-ends': m => { m.edges.push(E('bad', 'Usage', 'storefront', 'accounts')); return ['bad', 'storefront', 'accounts']; },
  'ball-interface': m => { m.views[0].present.storefront = { as: 'ball' }; return ['storefront']; },
  'delegation-ends': m => { m.edges.push(E('bad', 'Connector', 'storefront', 'accounts', { kind: 'delegation' })); return ['bad', 'storefront', 'accounts']; },
  'assembly-ends': m => { m.edges.push(E('bad', 'Connector', 'shop-api.orders', 'checkout.orders', { kind: 'assembly' })); return ['bad', 'shop-api.orders', 'checkout.orders']; },
  'manifest-ends': m => { m.edges.push(E('bad', 'Manifestation', 'storefront', 'accounts')); return ['bad', 'storefront']; },
  'component-realization-ends': m => { m.edges.push(E('bad', 'ComponentRealization', 'storefront', 'i-orders')); return ['bad', 'storefront', 'i-orders']; },
  'component-owner': m => { m.nodes.find(n => n.id === 'accounts').parent = 'shop-api-jar'; return ['accounts', 'shop-api-jar']; },
};
test('validators: 05-component.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(CM, CM.views[0]), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(CM), ids = broke(m), got = T.validate(m, m.views[0]).filter(p => p.rule === rule && p.level === (['required-ends', 'ball-interface', 'component-owner'].includes(rule) ? 'warning' : 'error'));
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(T.validate(m, m.views[0]))}`);
    assert.match(got[0].message, new RegExp('^' + rule + ': '));
    assert.deepEqual([...got[0].ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule), `${rule}: in validate()`);
  }
  // a view checks what it shows: a broken line between elements it does not show is another view's
  const m = structuredClone(CM); m.nodes.push({ id: 'x', type: 'uml.Component', label: 'X' }, { id: 'y', type: 'uml.Component', label: 'Y' }); m.edges.push(E('xy', 'Connector', 'x', 'y', { kind: 'delegation' }));
  assert.deepEqual(T.validate(m, m.views[0]), []); assert.deepEqual(T.validate(m).map(p => p.rule), ['delegation-ends']);
});

// ---- editing (§12)
test('connect: a connector to something inside the other\'s owner is a delegation, else an assembly; other lines are the default', () => {
  const v = CM.views[0], C = { type: 'uml.Connector', label: 'Assembly', props: { kind: 'assembly' } };
  assert.deepEqual(T.edits.connect(CM, v, 'shop-api.orders', 'checkout.orders', null, C), [{ op: 'add', element: { id: 'connector1', type: 'uml.Connector', from: 'shop-api.orders', to: 'checkout.orders', props: { kind: 'delegation' } }, view: V }]);
  assert.equal(T.edits.connect(CM, v, 'storefront', 'payment-provider.charges', null, C)[0].element.props.kind, 'assembly');
  assert.equal(T.edits.connect(CM, v, 'storefront', 'i-orders', null, { type: 'uml.Usage' }), null);
  assert.deepEqual(validate(apply(CM, T.edits.connect(CM, v, 'checkout.orders', 'shop-api.orders', null, C))), []);
});

test('moveTo: a port\'s side by Alt + arrows across it or a drop by a border; along its side nothing, as said; anything else the default', () => {
  const v = CM.views[0], geo = layout(CM, V), side = geo.byId['payment-provider.charges'].side;
  assert.equal(side, 'L');
  assert.deepEqual(T.edits.moveTo(CM, v, 'payment-provider.charges', { by: [1, 0], geo }), [{ op: 'set', view: V, path: ['present', 'payment-provider.charges', 'side'], value: 'right' }]);
  const r = T.edits.moveTo(CM, v, 'payment-provider.charges', { by: [0, 1], geo }); assert.deepEqual(r.commands, []); assert.match(r.say, /order along its side follows its lines/);
  const o = geo.byId['payment-provider'];
  assert.equal(T.edits.moveTo(CM, v, 'payment-provider.charges', { pt: [o.x + o.w / 2, o.y + o.h + 3], geo })[0].value, 'bottom');
  assert.equal(T.edits.moveTo(CM, v, 'storefront', { by: [1, 0], geo }), null);
  const m = apply(CM, T.edits.moveTo(CM, v, 'payment-provider.charges', { by: [1, 0], geo }));
  assert.equal(layout(m, V).byId['payment-provider.charges'].side, 'R');
});

test('add: a port into the selected component (or a port\'s owner), refused with none; an interface as a ball or a rectangle, picked', () => {
  const v = CM.views[0], P = { type: 'uml.Port', label: 'Port' };
  assert.deepEqual(T.edits.add(CM, v, P, 'events', { sel: ['checkout'] }), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'events' }, owner: 'checkout' }]);
  assert.equal(T.edits.add(CM, v, P, 'x', { sel: ['checkout.orders'] })[0].owner, 'checkout');
  assert.ok(T.edits.add(CM, v, P, 'x', { sel: ['i-orders'] }).error);
  const r = T.edits.add(CM, v, { type: 'uml.Interface' }, 'Stock', null);
  assert.deepEqual(r.pick, ['Ball', 'Rectangle']);
  const m = apply(CM, r.then(0)); assert.equal(m.views[0].present.interface1.as, 'ball'); assert.equal(layout(m, V).byId.interface1.shape, 'ball');
  assert.deepEqual(r.then(1), [{ op: 'add', element: { id: 'interface1', type: 'uml.Interface', label: 'Stock' }, view: V }]);
  assert.equal(T.edits.add(CM, v, { type: 'uml.Artifact' }, 'a', null), null);
});

test('member rows: on a component a row is a port, name or name : Type; refused when empty of a name; an interface\'s rows are the class type\'s', () => {
  const v = CM.views[0];
  assert.deepEqual(T.edits.member(CM, v, 'checkout', null, 'events : EventApi'), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'events', props: { valueType: 'EventApi' } }, owner: 'checkout' }]);
  assert.deepEqual(T.edits.member(CM, v, 'checkout', 'checkout.orders', 'requests'), [{ op: 'set', id: 'checkout.orders', path: 'label', value: 'requests' }, { op: 'set', id: 'checkout.orders', path: 'props.valueType', value: undefined }]);
  assert.ok(T.edits.member(CM, v, 'checkout', null, ': Type').error);
  assert.equal(T.edits.member(CM, v, 'i-orders', null, 'list(): Order'), null, 'the panel\'s own');
  assert.equal(T.member.print({ type: 'uml.Port', label: 'orders', props: { valueType: 'OrderApi' } }), 'orders : OrderApi');
  assert.equal(T.member.add('+ list(): Order').type, 'uml.Operation');
  const m = apply(CM, T.edits.member(CM, v, 'checkout', null, 'events : EventApi'));
  assert.equal(layout(m, V).byId.port1.aria, 'Port events : EventApi of Checkout');
});

test('B on an interface: a ball, and back; other keys and elements are the canvas\'s. Delete on a port deletes it from the model, as said', () => {
  const v = CM.views[0];
  assert.deepEqual(T.edits.key(CM, v, ['i-orders'], 'b'), [{ op: 'set', view: V, path: ['present', 'i-orders', 'as'], value: undefined }]);
  assert.deepEqual(T.edits.key(CM, v, ['i-sign-in'], 'B'), [{ op: 'set', view: V, path: ['present', 'i-sign-in', 'as'], value: 'ball' }]);
  assert.equal(T.edits.key(CM, v, ['storefront'], 'b'), null); assert.equal(T.edits.key(CM, v, ['i-orders'], 'x'), null);
  assert.equal(layout(apply(CM, T.edits.key(CM, v, ['i-orders'], 'b')), V).byId['i-orders'].shape, 'classifier');
  const r = T.edits.remove(CM, v, ['payment-provider.charges'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'payment-provider.charges' }]); assert.match(r.say, /Deleted port charges from the model: a port is not hidden/);
  assert.ok(!apply(CM, r.commands).edges.some(e => e.id === 'api-to-provider'), 'its lines go with it');
  assert.equal(T.edits.remove(CM, v, ['storefront'], false), null);
  assert.deepEqual(T.owners(CM, CM.nodes.find(n => n.id === 'checkout')).map(o => o.id), ['storefront', 'shop-api', 'checkout', 'accounts', 'payment-provider', 'order-worker']);
  assert.equal(T.owners(CM, CM.edges[0]), null);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: { id: `c${i}`, type: 'uml.Component', label: `Part ${i}` }, view: V }],
    [{ op: 'add', element: { id: `c${i}.p`, type: 'uml.Port', label: 'in' }, owner: `c${i}` }],
    [{ op: 'add', element: E(`a${i}`, 'Connector', `c${i}.p`, 'payment-provider.charges', { kind: 'assembly' }), view: V }],
    [{ op: 'set', view: V, path: ['present', `c${i}.p`, 'side'], value: 'right' }],
    [[{ op: 'reparent', id: `c${i}`, parent: 'shop-api' }], [{ op: 'set', view: V, path: ['present', 'i-sign-in', 'as'], value: i % 2 ? undefined : 'ball' }], [{ op: 'set', id: `c${i}.p`, path: 'props.valueType', value: 'Api' }]][i % 3],
    [[{ op: 'hide', id: `c${i}`, view: V }], [{ op: 'delete', id: `c${i}.p` }], [{ op: 'set', id: `c${i}`, path: 'label', value: `Renamed ${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(CM), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, draw = (m, o) => unid(mapContext(m, o).buildView(V).markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos[V].runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, V), describe(JSON.parse(seen[30]), V));
});

test('P1 (§14): on 50 elements, 60 lines and 40 ports in boxes three deep, a full layout, a port renamed and a component renamed, laid out and drawn, under CI\'s 1 s (CPU, best of seven) (timed)', () => {
  const nodes = [], edges = [];
  for (let b = 0; b < 4; b++) { nodes.push({ id: `b${b}`, type: 'uml.Component', label: `Box ${b}`, members: [{ id: `b${b}.p`, type: 'uml.Port', label: 'in' }] },
    { id: `b${b}i`, type: 'uml.Component', label: `Inner ${b}`, parent: `b${b}`, members: [{ id: `b${b}i.p`, type: 'uml.Port', label: 'in' }] });
    edges.push(E(`d${b}`, 'Connector', `b${b}.p`, `b${b}i.p`, { kind: 'delegation' })); }
  for (let i = 0; i < 34; i++) nodes.push({ id: `c${i}`, type: 'uml.Component', label: `Component number ${i}`, ...(i < 12 ? { parent: `b${i % 4}i` } : {}),
    members: [{ id: `c${i}.a`, type: 'uml.Port', label: 'provides' }, ...(i % 3 ? [] : [{ id: `c${i}.b`, type: 'uml.Port', label: 'requires' }])] });
  for (let i = 0; i < 8; i++) nodes.push({ id: `i${i}`, type: 'uml.Interface', label: `Api${i}` });
  const ports = nodes.flatMap(n => (n.members || []).map(m => m.id)); assert.equal(nodes.length, 50);
  for (let i = 0; i < 34; i++) edges.push(E(`r${i}`, 'InterfaceRealization', `c${i}.a`, `i${i % 8}`));
  for (let i = 0; i < 22; i++) edges.push(E(`u${i}`, 'Usage', `c${(i * 5 + 3) % 34}`, `i${(i + 3) % 8}`));
  assert.equal(edges.length, 60);
  const M = { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'uml.component', nodeIds: nodes.map(n => n.id), present: { i0: { as: 'ball' }, i1: { as: 'ball' } } }] };
  assert.ok(ports.length >= 40, `${ports.length} ports`);
  assert.deepEqual(validate(M).filter(p => p.level === 'error'), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(M);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => ({ full: timed(() => mapContext(M).buildView('all')),
    port: timed(() => draw(apply(M, [{ op: 'set', id: 'c5.a', path: 'label', value: 'p'.repeat(3 + k) }]))),
    comp: timed(() => draw(apply(M, [{ op: 'set', id: 'c7', path: 'label', value: `Renamed ${'x'.repeat(k)}` }]))) }));
  const best = k => Math.min(...runs.map(r => r[k]));
  for (const k of ['full', 'port', 'comp']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  console.log(`# P1 target 100 ms: a full layout ${best('full')} ms, a port renamed ${best('port')} ms, a component renamed ${best('comp')} ms`);
});
