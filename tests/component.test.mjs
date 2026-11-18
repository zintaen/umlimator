// The component diagram, uml.component (work package 5.4, notes/stage-5.md §10.1): the type's definition, docs/diagrams/
// examples/05-component.json drawn (its own ranking, boxes, ports on borders, delegations inward, ball and socket), laid out
// clean right and down, line ends on their ports' squares, every port a node of its own (decision 22), a memo's picture the
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
import { tablesOf } from '../src/page/print.js';
import { svgOf } from '../src/draw/svg.js';
import { SHAPE, drawnPts } from '../src/draw/shapes.js';
import '../src/uml/component.js';

const CM = JSON.parse(readFileSync(new URL('../examples/bookshop-components.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.component' }), V = 'components';
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const inside = (p, r, m = 0) => p[0] >= r.x - m && p[0] <= r.x + r.w + m && p[1] >= r.y - m && p[1] <= r.y + r.h + m;
const ports = g => Object.values(g.byId).filter(n => n.shape === 'port');
const ownerOf = (g, id) => g.byId[id] || g.families.find(f => f.id === id);
const unid = s => s.replace(/\bg\d+-/g, 'g-');
const E = (id, type, from, to, props) => ({ id, type: 'uml.' + type, from, to, ...(props ? { props } : {}) });

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
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'key', 'member', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(Object.keys(T.rules).sort(), ['assembly-ends', 'ball-interface', 'component-owner', 'component-realization-ends', 'delegation-ends', 'line-inside', 'manifest-ends', 'own-boxes', 'port-owner', 'provided-ends', 'required-ends'].sort());
  assert.deepEqual(['uml.Component', 'uml.Interface', 'uml.Artifact'].map(t => T.member.holds({ type: t })), [true, true, false]);
});

for (const direction of ['right', 'down']) test(`05-component.json (${direction}) lays out clean: boxes, ports on their owners' borders, every port line ending on its square`, () => {
  const m = withDir(CM, direction), g = layout(m, V);
  assert.deepEqual(validate(m), []);
  assert.deepEqual(check(m, V), [], 'no overlap (a port is not its owner\'s), no crossing, no line through a node');
  assert.deepEqual(g.stats, { grid: 10 });
  assert.deepEqual(g.families.map(f => [f.id, f.shape]), [['shop-api', 'component']]);
  assert.ok(g.byId['checkout-component'].x - g.families[0].x >= 48 - .01, 'a box with ports has 48 px of padding');
  assert.deepEqual(['storefront-component', 'accounts-component', 'order-worker', 'i-orders', 'i-sign-in', 'shop-api-jar'].map(id => g.byId[id].shape), ['component', 'component', 'component', 'ball', 'classifier', 'artifact']);
  // every port is a node of the picture, on a node as on a box, carrying its owner, which the check passes (decision 22)
  assert.deepEqual(g.nodes.filter(n => n.shape === 'port').map(n => [n.id, n.owner]), [['shop-api.orders', 'shop-api'], ['shop-api.payments', 'shop-api'], ['checkout-component.orders', 'checkout-component'], ['checkout-component.payments', 'checkout-component'], ['payment-provider-component.charges', 'payment-provider-component']]);
  const ps = ports(g); assert.equal(ps.length, 5);
  ps.forEach(p => { const o = ownerOf(g, p.owner), v = p.side === 'L' || p.side === 'R', b = p.side === 'L' ? o.x : p.side === 'R' ? o.x + o.w : p.side === 'T' ? o.y : o.y + o.h;
    assert.ok(Math.abs((v ? p.x : p.y) + 6 - b) < .01, `${p.id} centred on ${o.id}'s border`); });
  // every line from or to a port ends on the square's face within 1 px; a delegation enters its box only at the port
  const sq = Object.fromEntries(ps.map(p => [p.id, p]));
  g.edges.forEach(e => [[e.fromPort, e.pts[0]], [e.toPort, e.pts.at(-1)]].forEach(([id, pt]) => { if (id) assert.ok(inside(pt, sq[id], 1), `${e.id} ends on ${id}: ${pt}`); }));
  assert.deepEqual(g.edges.filter(e => e.inner).map(e => [e.id, e.inner]), [['orders-to-checkout', 'from'], ['checkout-payments-out', 'to']]);
  // each delegation runs straight in: its two ports on one side; the ball's lines end on its circle (radius 8), right on its
  // left and right, laid out down the stem above it and the socket beside it, so neither crosses the name under it
  for (const [a, b] of [['shop-api.orders', 'checkout-component.orders'], ['shop-api.payments', 'checkout-component.payments']]) assert.equal(sq[a].side, sq[b].side);
  const ball = g.byId['i-orders'];
  g.edges.filter(e => e.to === 'i-orders').forEach(e => { const [x, y] = drawnPts(e, n => (n && SHAPE[n.shape] ? { ...n, S: SHAPE[n.shape] } : null)).at(-1); // slid onto the circle, as drawn
    assert.ok(Math.abs(Math.hypot(x - ball.x - ball.w / 2, y - ball.y - 8) - 8) < 1 && y < ball.y + 16, `${e.id} ends on the ball's circle: ${x}, ${y}`); });
  assert.deepEqual(g.edges.filter(e => e.to === 'i-orders').map(e => e.toSide), direction === 'down' ? ['left', 'top'] : ['left', 'right'], 'as laid out: down, the stem above and the socket on the left');
  assert.deepEqual(g.edges.filter(e => e.to === 'i-orders').map(e => [e.id, e.end.to, !!e.end.dashed]), [['api-provides-orders', 'none', false], ['storefront-requires-orders', 'socket', false]], 'stem and socket');
});

// a node's group in the markup, from its opening tag to the </g> that closes it
const groupOf = (s, id) => { const i = s.indexOf(`data-id="${id}"`), a = s.lastIndexOf('<g', i), re = /<g[\s>]|<\/g>/g; re.lastIndex = a;
  for (let d = 0, m; (m = re.exec(s));) if ((d += m[0] === '</g>' ? -1 : 1) === 0) return s.slice(a, re.lastIndex); return null; };
test('drawn: each port a group of its own, after its owner\'s and outside it, so selecting the owner marks none of its ports (decision 22), with names; markup laid out from a memo is a fresh layout\'s, and drawing leaves the memo as it was', () => {
  const s = svgOf(layout(CM, V));
  assert.match(s, /<g class="node port" data-id="checkout-component.orders"[^>]*aria-label="Port orders of Checkout"/);
  for (const [o, p] of [['checkout-component', 'checkout-component.orders'], ['checkout-component', 'checkout-component.payments'], ['payment-provider-component', 'payment-provider-component.charges']]) {
    const own = groupOf(s, o); assert.ok(own && own.startsWith('<g class="node component"'), o); assert.ok(!own.includes(`data-id="${p}"`), `${p} is not drawn in ${o}'s group`);
    assert.ok(s.indexOf(`data-id="${p}"`) > s.indexOf(own) + own.length, `${p} after ${o}`); }
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
  assert.deepEqual(g.order.slice(0, 7), ['storefront-component', 'shop-api', 'shop-api.orders', 'shop-api.payments', 'checkout-component', 'checkout-component.orders', 'checkout-component.payments']);
  assert.equal(g.order.length, 9 + 5 + 10);
  const d = describe(CM, V).split('\n');
  assert.equal(d[0], 'Bookshop components: a component diagram of 9 elements and 10 lines.');
  assert.equal(d.length, 1 + 9 + 5 + 10);
  assert.equal(d.at(-3), 'Assembly from payments of Shop API to charges of Payment provider.');
  const legend = g.legend.map(x => x.match(/<b>([^<]*)/)[1]);
  assert.deepEqual(legend, ['Realization', 'Usage', 'Realization', 'Usage', 'Assembly', 'Delegation', 'Dependency', 'Manifestation'], 'stem, socket, then the rectangle\'s');
  assert.deepEqual([T.word(CM, 'shop-api'), T.word(CM, 'i-orders'), T.word(CM, 'shop-api.orders')], ['Component', 'Interface', null]);
  // audit 17: its ports alone; its connectors are rows of the Lines table (audit 3 lists a line drawn to a port's owner), not again here
  assert.deepEqual(T.rows(CM, CM.views[0], 'shop-api'), ['orders, provides Orders', 'payments']);
  assert.deepEqual(T.rows(CM, CM.views[0], 'shop-api-jar'), ['manifests Shop API']);
  const typed = structuredClone(CM); typed.nodes[1].members[0].props = { valueType: 'OrderApi' };
  assert.deepEqual(T.rows(typed, typed.views[0], 'shop-api')[0], 'orders : OrderApi, provides Orders');
  // audit 17: a connector from the component itself to another's port is a Lines row, not a member row too
  const own = structuredClone(CM); own.edges.push({ id: 'sf-orders', type: 'uml.Connector', from: 'storefront-component', to: 'shop-api.orders', label: 'calls', props: { kind: 'assembly' } });
  assert.deepEqual(T.rows(own, own.views[0], 'storefront-component'), []);
});

test('a class on a component view is drawn as a classifier, with no «component»', () => {
  const m = structuredClone(CM); m.nodes.push({ id: 'k', type: 'uml.Class', label: 'OrderService' }); m.edges.push(E('kr', 'ComponentRealization', 'k', 'accounts-component')); m.views[0].nodeIds.push('k');
  assert.deepEqual(T.validate(m, m.views[0]), []);
  const k = layout(m, V).byId.k; assert.equal(k.shape, 'classifier'); assert.deepEqual(k.stereotypes, []);
});

// what no line reaches: packed by size under the lined columns, so a box and a card beside it never overlap, right and down
const LC = (id, extra) => ({ id, type: 'uml.Component', label: id.toUpperCase(), ...extra });
const VIEWS = {
  'a box of two and a card, no line': [[LC('a'), LC('a1', { parent: 'a' }), LC('a2', { parent: 'a' }), LC('b')], []],
  'a box of three, two cards and a lined pair': [[LC('a'), LC('a1', { parent: 'a' }), LC('a2', { parent: 'a' }), LC('a3', { parent: 'a' }), LC('b'), LC('c'), LC('x'), LC('y')], [E('xy', 'Dependency', 'x', 'y')]],
  'three packages each holding a line, none between them': [['p1', 'p2', 'p3'].flatMap(p => [{ id: p, type: 'uml.Package', label: p }, LC(p + 'a', { parent: p }), LC(p + 'b', { parent: p })]), ['p1', 'p2', 'p3'].map(p => E(p + 'd', 'Dependency', p + 'a', p + 'b'))],
  'a ball with one provider and three requirers': [[LC('a'), LC('b'), LC('c'), LC('d'), { id: 'i', type: 'uml.Interface', label: 'Orders' }], [E('r', 'InterfaceRealization', 'a', 'i'), ...['b', 'c', 'd'].map(x => E('u' + x, 'Usage', x, 'i'))]],
};
for (const [name, [nodes, edges]] of Object.entries(VIEWS)) for (const direction of ['right', 'down']) test(`${name} (${direction}) lays out clean`, () => {
  const m = { schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.component', direction, nodeIds: nodes.map(n => n.id), present: { i: { as: 'ball' } } }] };
  assert.deepEqual(check(m, 'v'), []);
  if (!edges.some(e => e.to === 'i')) return;
  // the provider's stem and the requirers' sockets come into the ball from different sides
  const g = layout(m, 'v'), side = id => g.edges.find(e => e.id === id).toSide;
  assert.ok(['ub', 'uc', 'ud'].every(id => side(id) !== side('r')), JSON.stringify(g.edges.map(e => [e.id, e.toSide])));
});

test('pins: a pinned node keeps its place and a node it would cover moves down; present.<port>.side pins a port', () => {
  const m = structuredClone(CM), g0 = layout(m, V); m.views[0].layout = { 'accounts-component': [g0.byId['storefront-component'].col, g0.byId['storefront-component'].row] };
  const g = layout(m, V); assert.deepEqual([g.byId['accounts-component'].col, g.byId['accounts-component'].row], m.views[0].layout['accounts-component']); assert.ok(g.byId['storefront-component'].row > g.byId['accounts-component'].row);
  m.views[0].present['payment-provider-component.charges'] = { side: 'bottom' };
  assert.equal(layout(m, V).byId['payment-provider-component.charges'].side, 'B');
});

// ---- validators, each with a passing and a failing case
const BREAKS = {
  'port-owner': m => { m.nodes.find(n => n.id === 'i-orders').members = [{ id: 'bad', type: 'uml.Port', label: 'x' }]; return ['bad', 'i-orders']; },
  'provided-ends': m => { m.edges.push(E('bad', 'InterfaceRealization', 'shop-api-jar', 'i-orders')); return ['bad', 'shop-api-jar', 'i-orders']; },
  'required-ends': m => { m.edges.push(E('bad', 'Usage', 'storefront-component', 'accounts-component')); return ['bad', 'storefront-component', 'accounts-component']; },
  'ball-interface': m => { m.views[0].present['storefront-component'] = { as: 'ball' }; return ['storefront-component']; },
  'delegation-ends': m => { m.edges.push(E('bad', 'Connector', 'storefront-component', 'accounts-component', { kind: 'delegation' })); return ['bad', 'storefront-component', 'accounts-component']; },
  'assembly-ends': m => { m.edges.push(E('bad', 'Connector', 'shop-api.orders', 'checkout-component.orders', { kind: 'assembly' })); return ['bad', 'shop-api.orders', 'checkout-component.orders']; },
  'manifest-ends': m => { m.edges.push(E('bad', 'Manifestation', 'storefront-component', 'accounts-component')); return ['bad', 'storefront-component']; },
  'component-realization-ends': m => { m.edges.push(E('bad', 'ComponentRealization', 'storefront-component', 'i-orders')); return ['bad', 'storefront-component', 'i-orders']; },
  'component-owner': m => { m.nodes.find(n => n.id === 'accounts-component').parent = 'shop-api-jar'; return ['accounts-component', 'shop-api-jar']; },
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
  // a view that lists its lines checks only those
  const listed = structuredClone(CM); listed.edges.push(E('bad', 'Connector', 'storefront-component', 'accounts-component', { kind: 'delegation' })); listed.views[0].edges = ['api-provides-orders'];
  assert.deepEqual(T.validate(listed, listed.views[0]), []); assert.deepEqual(T.validate(listed).map(p => p.rule), ['delegation-ends']);
  const rules = edit => { const k = structuredClone(CM); edit(k); return T.validate(k, k.views[0]).map(p => p.rule); };
  // a connector with no kind is drawn as an assembly and checked as one
  assert.deepEqual(rules(k => k.edges.push(E('bad', 'Connector', 'shop-api.orders', 'checkout-component.payments'))), ['assembly-ends']);
  assert.deepEqual(rules(k => k.edges.push(E('bad', 'Connector', 'storefront-component', 'i-orders'))), ['assembly-ends']);
  // a delegation from a box with no port at its end is not drawn, so it is flagged
  assert.deepEqual(rules(k => k.edges.push(E('bad', 'Connector', 'shop-api', 'checkout-component', { kind: 'delegation' }))), ['delegation-ends']);
  // a usage with no to: the host's dangling end alone
  assert.deepEqual(rules(k => k.edges.push({ id: 'bad', type: 'uml.Usage', from: 'storefront-component' })), []);
});

// ---- editing (§12)
test('connect: a connector to something inside the other\'s owner is a delegation, else an assembly; other lines are the default', () => {
  const v = CM.views[0], C = { type: 'uml.Connector', label: 'Assembly', props: { kind: 'assembly' } };
  assert.deepEqual(T.edits.connect(CM, v, 'shop-api.orders', 'checkout-component.orders', null, C), [{ op: 'add', element: { id: 'connector1', type: 'uml.Connector', from: 'shop-api.orders', to: 'checkout-component.orders', props: { kind: 'delegation' } }, view: V }]);
  assert.equal(T.edits.connect(CM, v, 'storefront-component', 'payment-provider-component.charges', null, C)[0].element.props.kind, 'assembly');
  assert.equal(T.edits.connect(CM, v, 'storefront-component', 'i-orders', null, { type: 'uml.Usage' }), null);
  assert.deepEqual(validate(apply(CM, T.edits.connect(CM, v, 'checkout-component.orders', 'shop-api.orders', null, C))), []);
  // refused, not added unseen: an element to itself or its own port, two ports of one element, a box to what it holds by no port
  for (const [a, b, says] of [['storefront-component', 'storefront-component', /two elements/], ['checkout-component.orders', 'checkout-component.payments', /two elements/], ['checkout-component', 'checkout-component.orders', /two elements/], ['shop-api', 'checkout-component', /port of the box/], ['checkout-component', 'shop-api', /port of the box/]])
    assert.match(T.edits.connect(CM, v, a, b, null, C).error, says, `${a} to ${b}`);
  assert.equal(T.edits.connect(CM, v, 'shop-api.orders', 'checkout-component', null, C)[0].element.props.kind, 'delegation', 'a box\'s port to what it holds');
});

test('moveTo: a port\'s side by Alt + arrows across it or a drop by a border; along its side nothing, as said; anything else the default', () => {
  const v = CM.views[0], geo = layout(CM, V), side = geo.byId['payment-provider-component.charges'].side;
  assert.equal(side, 'L');
  assert.deepEqual(T.edits.moveTo(CM, v, 'payment-provider-component.charges', { by: [1, 0], geo }), [{ op: 'set', view: V, path: ['present', 'payment-provider-component.charges', 'side'], value: 'right' }]);
  const r = T.edits.moveTo(CM, v, 'payment-provider-component.charges', { by: [0, 1], geo }); assert.deepEqual(r.commands, []); assert.match(r.say, /order along its side follows its lines/);
  const o = geo.byId['payment-provider-component'];
  assert.equal(T.edits.moveTo(CM, v, 'payment-provider-component.charges', { pt: [o.x + o.w / 2, o.y + o.h + 3], geo })[0].value, 'bottom');
  assert.equal(T.edits.moveTo(CM, v, 'storefront-component', { by: [1, 0], geo }), null);
  const m = apply(CM, T.edits.moveTo(CM, v, 'payment-provider-component.charges', { by: [1, 0], geo }));
  assert.equal(layout(m, V).byId['payment-provider-component.charges'].side, 'R');
});

test('add: a port into the selected component (or a port\'s owner), refused with none; an interface as a ball or a rectangle, picked', () => {
  const v = CM.views[0], P = { type: 'uml.Port', label: 'Port' };
  assert.deepEqual(T.edits.add(CM, v, P, 'events', { sel: ['checkout-component'] }), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'events' }, owner: 'checkout-component' }]);
  assert.equal(T.edits.add(CM, v, P, 'x', { sel: ['checkout-component.orders'] })[0].owner, 'checkout-component');
  assert.ok(T.edits.add(CM, v, P, 'x', { sel: ['i-orders'] }).error);
  const r = T.edits.add(CM, v, { type: 'uml.Interface' }, 'Stock', null);
  assert.deepEqual(r.pick, ['Ball', 'Rectangle']);
  const m = apply(CM, r.then(0)); assert.equal(m.views[0].present.interface1.as, 'ball'); assert.equal(layout(m, V).byId.interface1.shape, 'ball');
  assert.deepEqual(r.then(1), [{ op: 'add', element: { id: 'interface1', type: 'uml.Interface', label: 'Stock' }, view: V }]);
  assert.equal(T.edits.add(CM, v, { type: 'uml.Artifact' }, 'a', null), null);
});

test('member rows: on a component a row is a port, name or name : Type; refused when empty of a name; an interface\'s rows are the class type\'s', () => {
  const v = CM.views[0];
  assert.deepEqual(T.edits.member(CM, v, 'checkout-component', null, 'events : EventApi'), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'events', props: { valueType: 'EventApi' } }, owner: 'checkout-component' }]);
  assert.deepEqual(T.edits.member(CM, v, 'checkout-component', 'checkout-component.orders', 'requests'), [{ op: 'set', id: 'checkout-component.orders', path: 'label', value: 'requests' }, { op: 'set', id: 'checkout-component.orders', path: 'props.valueType', value: undefined }]);
  assert.ok(T.edits.member(CM, v, 'checkout-component', null, ': Type').error);
  assert.deepEqual(T.edits.member(CM, v, 'checkout-component', null, 'a : Map<K : V>')[0].element, { id: 'port1', type: 'uml.Port', label: 'a', props: { valueType: 'Map<K : V>' } }, 'the type is all after the first colon');
  assert.equal(T.edits.member(CM, v, 'i-orders', null, 'list(): Order'), null, 'the panel\'s own');
  assert.equal(T.member.print({ type: 'uml.Port', label: 'orders', props: { valueType: 'OrderApi' } }), 'orders : OrderApi');
  assert.equal(T.member.add('+ list(): Order').type, 'uml.Operation');
  const m = apply(CM, T.edits.member(CM, v, 'checkout-component', null, 'events : EventApi'));
  assert.equal(layout(m, V).byId.port1.aria, 'Port events : EventApi of Checkout');
});

test('B on an interface: a ball, and back; other keys and elements are the canvas\'s. Delete on a port deletes it from the model, as said', () => {
  const v = CM.views[0];
  assert.deepEqual(T.edits.key(CM, v, ['i-orders'], 'b'), [{ op: 'set', view: V, path: ['present', 'i-orders', 'as'], value: undefined }]);
  assert.deepEqual(T.edits.key(CM, v, ['i-sign-in'], 'B'), [{ op: 'set', view: V, path: ['present', 'i-sign-in', 'as'], value: 'ball' }]);
  assert.equal(T.edits.key(CM, v, ['storefront-component'], 'b'), null); assert.equal(T.edits.key(CM, v, ['i-orders'], 'x'), null);
  assert.equal(layout(apply(CM, T.edits.key(CM, v, ['i-orders'], 'b')), V).byId['i-orders'].shape, 'classifier');
  const r = T.edits.remove(CM, v, ['payment-provider-component.charges'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'payment-provider-component.charges' }]); assert.match(r.say, /Deleted port charges from the model: a port is not hidden/);
  assert.ok(!apply(CM, r.commands).edges.some(e => e.id === 'api-to-provider'), 'its lines go with it');
  assert.equal(T.edits.remove(CM, v, ['storefront-component'], false), null);
  assert.deepEqual(T.owners(CM, CM.nodes.find(n => n.id === 'checkout-component')).map(o => o.id), ['storefront-component', 'shop-api', 'accounts-component', 'payment-provider-component', 'order-worker'], 'not itself');
  assert.ok(!T.owners(CM, CM.nodes.find(n => n.id === 'shop-api')).some(o => ['shop-api', 'checkout-component'].includes(o.id)), 'nor what it holds');
  // a selection of a port and more: the port deleted, the rest hidden (Delete) or deleted (Shift + Delete), both said
  const mix = T.edits.remove(CM, v, ['shop-api.orders', 'storefront-component'], false);
  assert.deepEqual(mix.commands, [{ op: 'delete', id: 'shop-api.orders' }, { op: 'hide', id: 'storefront-component', view: V }]); assert.match(mix.say, /^Deleted port orders from the model: a port is not hidden from a view; hid 1 element$/);
  assert.deepEqual(T.edits.remove(CM, v, ['shop-api.orders', 'storefront-component'], true).commands, [{ op: 'delete', id: 'shop-api.orders' }, { op: 'delete', id: 'storefront-component' }]);
  assert.equal(T.owners(CM, CM.edges[0]), null);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: { id: `c${i}`, type: 'uml.Component', label: `Part ${i}` }, view: V }],
    [{ op: 'add', element: { id: `c${i}.p`, type: 'uml.Port', label: 'in' }, owner: `c${i}` }],
    [{ op: 'add', element: E(`a${i}`, 'Connector', `c${i}.p`, 'payment-provider-component.charges', { kind: 'assembly' }), view: V }],
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

test('P1 (§14): on 50 elements, 60 lines and 54 ports in boxes three deep, a full layout, a port renamed and a component renamed, laid out and drawn, under CI\'s 1 s (CPU, best of seven) (timed)', () => {
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
  assert.equal(ports.length, 54);
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

test('layout() of a chain of 3,000 components joined by assemblies: ranked without recursion (audit 2)', () => {
  const nodes = Array.from({ length: 3000 }, (_, i) => ({ id: 'c' + i, type: 'uml.Component', label: 'C' + i }));
  const edges = nodes.slice(1).map((n, i) => ({ id: 'a' + i, type: 'uml.Connector', from: nodes[i].id, to: n.id, props: { kind: 'assembly' } }));
  const g = layout({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.component', nodeIds: nodes.map(n => n.id) }] }, 'v');
  assert.ok(g.byId.c2999.x > g.byId.c0.x);
});

test('a port\'s PDF row is its name and type whole, even when the type holds " of <its component>" (audit 2)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Component', label: 'Order', members: [{ id: 'p', type: 'uml.Port', label: 'status', props: { valueType: 'List of Orders' } },
    { id: 'q', type: 'uml.Port', label: 'Port Authority feed' }] }], edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['c'] }] };
  assert.deepEqual(T.rows(m, m.views[0], 'c'), ['status : List of Orders', 'Port Authority feed']);
});

test('layout() of components nested 3,000 deep: the boxes placed and centred without recursion (audit 3)', () => {
  const nodes = Array.from({ length: 3000 }, (_, i) => ({ id: 'p' + i, type: 'uml.Component', label: 'P' + i, ...(i ? { parent: 'p' + (i - 1) } : {}) }));
  nodes.push({ id: 'c', type: 'uml.Component', label: 'C', parent: 'p2999' }, { id: 'd', type: 'uml.Component', label: 'D' });
  const g = layout({ schemaVersion: 2, nodes, edges: [{ id: 'e', type: 'uml.Dependency', from: 'c', to: 'd' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: nodes.map(n => n.id) }] }, 'v');
  assert.ok(g.byId.c && g.byId.d);
});

test('a component\'s operation or attribute row is edited as a member, not as a port (audit 3)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'shop', type: 'uml.Component', label: 'Shop', members: [
    { id: 'shop.place', type: 'uml.Operation', label: 'place', props: { returnType: 'Order' } }, { id: 'shop.api', type: 'uml.Port', label: 'api' }] }],
  edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['shop'] }] };
  assert.equal(T.edits.member(m, m.views[0], 'shop', 'shop.place', 'placeOrder(): Order'), null, 'member.edit\'s (memberEdit)');
  assert.deepEqual(T.edits.member(m, m.views[0], 'shop', 'shop.api', 'web : Http')[1], { op: 'set', id: 'shop.api', path: 'props.valueType', value: 'Http' });
});

test('layout() of components nested 1,500 deep marks the padded boxes in one pass up (audit 3)', () => {
  const N = 1500, nodes = Array.from({ length: N }, (_, i) => ({ id: 'p' + i, type: 'uml.Component', label: 'P' + i, ...(i ? { parent: 'p' + (i - 1) } : {}) }));
  nodes.push({ id: 'c', type: 'uml.Component', label: 'C', parent: 'p' + (N - 1) }, { id: 'd', type: 'uml.Component', label: 'D' });
  const t = performance.now(), g = layout({ schemaVersion: 2, nodes, edges: [{ id: 'e', type: 'uml.Dependency', from: 'c', to: 'd' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: nodes.map(n => n.id) }] }, 'v');
  assert.equal(g.edges.length, 1);
  assert.ok(performance.now() - t < 10000, 'was cubic in the depth: about a minute and a half here');
});

test("a box owned by a node is titled without the node's name, as its aria and a closed component are (audit 5)", () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'srv', type: 'uml.Node', label: 'AppServer' }, { id: 'shop', type: 'uml.Component', label: 'Shop', parent: 'srv' },
    { id: 'cart', type: 'uml.Component', label: 'Cart', parent: 'shop' }, { id: 'pk', type: 'uml.Package', label: 'lib', parent: 'srv' }, { id: 'a', type: 'uml.Component', label: 'A', parent: 'pk' }],
  edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['shop', 'cart', 'pk', 'a'] }] };
  assert.deepEqual(T.boxes(m, m.views[0]).map(b => [b.title, b.aria]), [['Shop', 'Component Shop, holding 1 component'], ['lib', 'Package lib, holding 1 element']]);
});

test('line-inside: a dependency or usage between a component and what it holds, with no port, is not drawn and is warned (audit 5)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'shop', type: 'uml.Component', label: 'Shop' }, { id: 'cart', type: 'uml.Component', label: 'Cart', parent: 'shop' }, { id: 'I', type: 'uml.Interface', label: 'Pay', parent: 'shop' }],
    edges: [E('d1', 'Dependency', 'shop', 'cart'), E('u1', 'Usage', 'shop', 'I')], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['shop', 'cart', 'I'] }] };
  assert.deepEqual(layout(m, 'v').edges, []);
  assert.deepEqual(validate(m).map(p => [p.rule, p.level, p.ids]), [['line-inside', 'warning', ['d1', 'shop', 'cart']], ['line-inside', 'warning', ['u1', 'shop', 'I']]]);
});
test('audit 9: a component, deployment or composite structure view warns that its hand-written containers are ignored (own-boxes)', async () => {
  await import('../src/uml/deployment.js'); await import('../src/uml/composite.js');
  for (const n of ['bookshop-components', 'bookshop-deployment', 'order-service-structure']) {
    const m = JSON.parse(readFileSync(new URL(`../examples/${n}.json`, import.meta.url))), v = m.views[0];
    assert.ok(!validate(m).some(p => p.rule === 'own-boxes'), n);
    v.containers = [{ id: 'grp', label: 'My group', nodeIds: v.nodeIds.slice(0, 2) }];
    const p = validate(m).find(x => x.rule === 'own-boxes');
    assert.ok(p && p.level === 'warning' && p.ids.includes(v.id), n); assert.ok(diagramOf(v).rules['own-boxes'], n);
  }
});

test('audit 12: a line names its ends as the picture does, qualified: two components labelled Api read apart', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Package', label: 'orders' }, { id: 'b', type: 'uml.Package', label: 'billing' },
    { id: 'oa', type: 'uml.Component', label: 'Api', parent: 'a' }, { id: 'ba', type: 'uml.Component', label: 'Api', parent: 'b', members: [{ id: 'ba.p', type: 'uml.Port', label: 'charge' }] },
    { id: 'web', type: 'uml.Component', label: 'Web' }, { id: 'I', type: 'uml.Interface', label: 'Charge' }],
  edges: [E('c1', 'Connector', 'web', 'oa', { kind: 'assembly' }), E('c2', 'Connector', 'web', 'ba', { kind: 'assembly' }), E('r', 'InterfaceRealization', 'ba.p', 'I')],
  views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['oa', 'ba', 'web', 'I'] }] };
  const aria = Object.fromEntries(layout(m, 'v').edges.map(e => [e.id, e.aria]));
  assert.match(aria.c1, /from Web to orders::Api$/);
  assert.match(aria.c2, /from Web to billing::Api$/);
  assert.match(aria.r, /from charge of billing::Api to Charge$/);
  assert.match(describe(m, 'v'), /from Web to billing::Api\./);
});

test('audit 14: a line of a kind the view does not draw is a plain arrow named "Line", not a «dependency»', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Component', label: 'Base' }, { id: 'b', type: 'uml.Component', label: 'Special' }],
    edges: [{ id: 'g', type: 'uml.Generalization', from: 'b', to: 'a' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['a', 'b'], edges: ['g'] }] };
  const e = layout(m, 'v').edges[0];
  assert.deepEqual([e.end.to, !!e.end.dashed, e.aria], ['arrow', false, 'Line from Special to Base']);
});

test('audit 15: a kind outside the view\'s is drawn as a classifier with its keyword («node», «actor»); a port\'s and a ball\'s stereotypes are drawn and said, an artifact\'s and an interface\'s said', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c1', type: 'uml.Component', label: 'Shop', members: [{ id: 'p1', type: 'uml.Port', label: 'api', props: { stereotypes: ['rest'] } }] },
    { id: 'i1', type: 'uml.Interface', label: 'Orders', props: { stereotypes: ['remote'] } }, { id: 'i2', type: 'uml.Interface', label: 'Admin', props: { stereotypes: ['local'] } },
    { id: 'f', type: 'uml.Artifact', label: 'shop.jar', props: { stereotypes: ['library'] } }, { id: 'n1', type: 'uml.Node', label: 'Server' }, { id: 'a1', type: 'uml.Actor', label: 'Clerk' }],
  edges: [E('e1', 'InterfaceRealization', 'p1', 'i1')], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['c1', 'i1', 'i2', 'f', 'n1', 'a1'], present: { i1: { as: 'ball' } } }] };
  const g = layout(m, 'v'), n = id => g.nodes.find(x => x.id === id), svg = String(svgOf(mapContext(m).buildGeo('v')));
  assert.deepEqual([n('n1').shape, n('n1').stereotypes, n('a1').shape, n('a1').stereotypes], ['classifier', ['node'], 'classifier', ['actor']]);
  assert.equal(n('c1').shape, 'component');
  assert.equal(n('p1').aria, 'Port api (rest) of Shop, provides Orders'); assert.match(n('i1').aria, /^Interface Orders \(remote\), as a ball/);
  assert.equal(n('i2').aria, 'Interface Admin (local)'); assert.equal(n('f').aria, 'Artifact shop.jar (library)');
  for (const w of ['«node»', '«actor»', '«rest» api', '«remote» Orders', '«local»', '«library»']) assert.ok(svg.includes(w), w);
  assert.match(describe(m, 'v'), /^Artifact shop\.jar \(library\)\.$/m);
});

test('audit 16: F2 on a component\'s port reads name : Type; a name alone keeps the type', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'P', type: 'uml.Component', label: 'Provider', members: [{ id: 'P.api', type: 'uml.Port', label: 'api', props: { valueType: 'Old' } }] }],
    edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['P'] }] };
  const v = m.views[0];
  assert.deepEqual(T.edits.rename(m, v, 'P.api', 'api : Rest'), [{ op: 'set', id: 'P.api', path: 'props.valueType', value: 'Rest' }]);
  assert.deepEqual(T.edits.rename(m, v, 'P.api', 'web'), [{ op: 'set', id: 'P.api', path: 'label', value: 'web' }]);
  assert.ok(T.edits.rename(m, v, 'P.api', ' : X').error);
});

test('audit 17: a manifestation to a component\'s port is laid out, said and checked, the port named as drawn; validate names the port', () => {
  const m = structuredClone(CM); m.edges.find(e => e.id === 'api-jar-manifests-api').to = 'shop-api.orders';
  const g = layout(m, V);
  assert.equal(g.edges.find(e => e.id === 'api-jar-manifests-api').aria, 'Manifestation from shop-api.jar to orders of Shop API');
  assert.match(describe(m, V), /Artifact shop-api\.jar, manifests orders of Shop API\./);
  assert.ok(Array.isArray(check(m, V)));
  assert.deepEqual(T.rows(m, m.views[0], 'shop-api-jar'), ['manifests orders of Shop API']);
  assert.match(validate(m).find(p => p.rule === 'manifest-ends').message, /runs to port shop-api\.orders \("orders"\)/);
  // a line of any kind from or to a port of a shown component, a nested one too: never a throw
  for (const k of ['uml.Manifestation', 'uml.Dependency', 'uml.Usage', 'uml.CommentLink']) for (const [f, t] of [['shop-api-jar', 'checkout-component.orders'], ['shop-api.payments', 'shop-api-jar']]) {
    const x = structuredClone(CM); x.edges.push(E('z', k.slice(4), f, t)); assert.doesNotThrow(() => { layout(x, V); describe(x, V); check(x, V); }, `${k} ${f} -> ${t}`); }
});

test('audit 17: the PDF lists each connector to a port once, in the Lines table, not again under its component', () => {
  const c = mapContext(CM), [els, lines] = tablesOf(c, c.V[V], c.buildGeo(V)), all = [...els.rows, ...lines.rows].join('');
  assert.equal((all.match(/Connector</g) || []).length, 3, 'three connectors: three Lines rows');
  assert.doesNotMatch(els.rows.join(''), /Delegation from|Assembly from/);
});

test('audit 18: the PDF\'s Lines row of a connector names its kind and the ports it joins; the palette\'s Port reads name : Type', () => {
  const c = mapContext(CM), [, lines] = tablesOf(c, c.V[V], c.buildGeo(V)), txt = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = lines.rows.map(txt).filter(r => /Connector$/.test(r));
  assert.deepEqual(rows, ['Shop API → Checkout Delegation from orders of Shop API to orders of Checkout Connector',
    'Checkout → Shop API Delegation from payments of Checkout to payments of Shop API Connector',
    'Shop API → Payment provider Assembly from payments of Shop API to charges of Payment provider Connector']);
  assert.equal(T.text(CM, CM.views[0], CM.edges.find(e => e.type !== 'uml.Connector').id), null, 'another line: its label, as before');
  const v = CM.views[0], P = { type: 'uml.Port', label: 'Port' };
  assert.deepEqual(T.edits.add(CM, v, P, 'audit : AuditApi', { sel: ['shop-api'] }), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'audit', props: { valueType: 'AuditApi' } }, owner: 'shop-api' }]);
  assert.deepEqual(T.edits.add(CM, v, P, 'audit : AuditApi', { sel: ['shop-api'] }), T.edits.member(CM, v, 'shop-api', null, 'audit : AuditApi'), 'as the panel\'s row');
  assert.match(T.edits.add(CM, v, P, ': AuditApi', { sel: ['shop-api'] }).error, /A port has a name/);
  assert.deepEqual(T.edits.add(CM, v, P, '', { sel: ['shop-api'] }), [{ op: 'add', element: { id: 'port1', type: 'uml.Port' }, owner: 'shop-api' }], 'no name: as before');
});

test('audit 19: the Assembly tool refuses an end that is no component nor a component\'s port (an interface, an artifact): assembly-ends would fail at once', () => {
  const m = structuredClone(CM), v = m.views[0], T = diagramOf(v), line = T.lines.find(l => l.label === 'Assembly');
  const iface = m.nodes.find(n => n.type === 'uml.Interface').id, art = m.nodes.find(n => n.type === 'uml.Artifact').id;
  for (const [a, b] of [['storefront-component', iface], ['storefront-component', art], [iface, 'storefront-component']]) {
    const r = T.edits.connect(m, v, a, b, null, line); assert.ok(r && r.error && /joins two components or their ports/.test(r.error), `${a} -> ${b}: ${JSON.stringify(r)}`); }
  const ok = T.edits.connect(m, v, 'storefront-component', 'shop-api', null, line);
  assert.ok(Array.isArray(ok) && ok[0].element.props.kind === 'assembly');
  assert.deepEqual(validate(apply(m, ok)).filter(p => p.level === 'error'), []);
});

test('audit 20: Realization, Component realization and Manifestation never add a line their rule calls an error; a manifestation drawn from the component starts at its artifact', () => {
  const m = structuredClone(CM), v = m.views[0], T = diagramOf(v), I = id => m.nodes.find(n => n.id === id);
  const line = label => T.lines.find(l => l.label === label);
  assert.deepEqual(T.edits.connect(m, v, 'shop-api', 'shop-api-jar', null, line('Manifestation')), [{ op: 'add', element: { id: 'manifestation1', type: 'uml.Manifestation', from: 'shop-api-jar', to: 'shop-api' }, view: 'components' }]);
  assert.equal(T.edits.connect(m, v, 'shop-api-jar', 'shop-api', null, line('Manifestation')), null, 'from the artifact: the default');
  assert.deepEqual(T.edits.connect(m, v, 'storefront-component', 'checkout-component', null, line('Realization')), { error: 'A realization runs from a component, a class or a port to an interface' });
  assert.deepEqual(T.edits.connect(m, v, 'storefront-component', 'i-orders', null, line('Component realization')), { error: 'A component realization runs from a class or a component to a component' });
  assert.equal(T.edits.connect(m, v, 'checkout-component', 'i-orders', null, line('Realization')), null, 'a component to an interface: the default');
  // every pair of ends, ports among them: what the hook (or the canvas default) adds breaks none of the three rules
  const ports = m.nodes.flatMap(n => (n.members || []).filter(x => x.type === 'uml.Port').map(x => x.id)), ends = [...v.nodeIds, ...ports];
  const rules = { 'Realization': 'provided-ends', 'Component realization': 'component-realization-ends', 'Manifestation': 'manifest-ends' };
  let added = 0, refused = 0;
  for (const [label, rule] of Object.entries(rules)) for (const a of ends) for (const b of ends) { if (a === b) continue;
    const t = line(label), r = T.edits.connect(m, v, a, b, null, t); if (r && r.error) { refused++; continue; }
    const cmds = r || [{ op: 'add', element: { id: 'zz', type: t.type, from: a, to: b }, view: v.id }], nid = cmds[0].element.id, m2 = apply(m, cmds); added++;
    assert.deepEqual(validate(m2).filter(p => p.level === 'error' && p.rule === rule && p.ids.includes(nid)).map(p => p.message), [], `${label} ${a} -> ${b} (${I(a) ? I(a).type : 'port'})`); }
  assert.ok(added > 0 && refused > 0);
});

// audit 23: a kind outside the component, deployment, use case or information flow view's own is said in words, as the class
// view and the PDF's Kind column say it: "Use case Pay", "Data type Money", never the type's name "UseCase Pay"
test('a kind outside the view\'s own is said in words in its accessible name and describe() (audit 23)', async () => {
  for (const f of ['deployment', 'usecase', 'information']) await import(`../src/uml/${f}.js`);
  const want = ['Use case Pay', 'Data type Money', 'Execution environment JVM', 'Instance specification ada'];
  for (const d of ['uml.component', 'uml.deployment', 'uml.use-case', 'uml.information-flow']) {
    const nodes = [{ id: 'uc', type: 'uml.UseCase', label: 'Pay' }, { id: 'dt', type: 'uml.DataType', label: 'Money' }, { id: 'ee', type: 'uml.ExecutionEnvironment', label: 'JVM' }, { id: 'is', type: 'uml.InstanceSpecification', label: 'ada' }]
      .filter(n => !(d === 'uml.use-case' && n.id === 'uc')); // the use case view's own: "Use case Pay" already
    const m = { schemaVersion: 2, nodes, edges: [], views: [{ id: 'v', diagram: d, nodeIds: nodes.map(n => n.id) }] }, g = layout(m, 'v'), said = describe(m, 'v').split('\n');
    want.filter(w => nodes.some(n => w.endsWith(' ' + n.label))).forEach(w => {
      assert.ok(g.nodes.some(n => n.aria === w || String(n.aria).startsWith(w + ',')), `${d}: "${w}" (${g.nodes.map(n => n.aria).join(' | ')})`);
      assert.ok(said.some(l => l === w + '.' || l.startsWith(w + ',')), `${d}: describe() says "${w}"`); });
  }
});

test('audit 24: Delete on a port of a component the view holds as its own deletes it, as on a model component\'s', () => {
  let m = { schemaVersion: 2, nodes: [{ id: 'shop', type: 'uml.Component', label: 'Shop', members: [{ id: 'shop.api', type: 'uml.Port', label: 'api' }] }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['shop'] }] };
  m = apply(m, { op: 'add', in: 'view', view: 'v', element: { id: 'pay', type: 'uml.Component', label: 'Payments', members: [{ id: 'pay.in', type: 'uml.Port', label: 'in' }] } });
  const T = diagramOf(m.views[0]), r = T.edits.remove(m, m.views[0], ['pay.in'], false);
  assert.deepEqual(r && r.commands, [{ op: 'delete', id: 'pay.in' }]);
  assert.match(r.say, /^Deleted port in from the model/);
  assert.deepEqual(apply(m, r.commands).views[0].nodes[0].members, []);
});

test('audit 28: an element of no type, drawn as a component holding its port, may hold it; the rules name it an element', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'u', label: 'Billing', members: [{ id: 'pt', type: 'uml.Port', label: 'api' }] }, { id: 'k', type: 'uml.Package', label: 'Pk', members: [{ id: 'pt2', type: 'uml.Port', label: 'api2' }] }],
    edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['u', 'k'] }] };
  const g = layout(m, 'v');
  assert.deepEqual([g.byId.u.shape, g.byId.pt.shape], ['component', 'port']);
  assert.deepEqual(validate(m).map(p => p.message), ['port-owner: port pt2 ("api2") is a member of package k ("Pk"); a port is a member of a component or a class'], 'a package still may not');
  const c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.map(r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '')));
  assert.equal(rows.find(r => r[0] === 'Billing')[1], 'Element', 'the PDF\'s Kind, as its accessible name');
  // a view that does not draw it as a component (composite structure) still refuses the port, naming its kind in words
  const cs = { ...m, views: [{ id: 'v', diagram: 'uml.composite-structure', nodeIds: ['u'] }] };
  assert.ok(validate(cs).some(p => p.message === 'port-owner: port pt ("api") is a member of element u ("Billing"); a port is a member of a component or a class'));
});

test('audit 29: an element of no type, drawn as a component holding its ports, is one to the rules and to connect(): an assembly from its port is no error', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'A', members: [{ id: 'a.p', type: 'uml.Port', label: 'p' }] },
    { id: 'b', type: 'uml.Component', label: 'B', members: [{ id: 'b.q', type: 'uml.Port', label: 'q' }] }, { id: 'i', type: 'uml.Interface', label: 'I' }],
    edges: [{ id: 'c1', type: 'uml.Connector', from: 'a.p', to: 'b.q' }, { id: 'r1', type: 'uml.InterfaceRealization', from: 'a', to: 'i' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['a', 'b', 'i'] }] };
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  const T = diagramOf(m.views[0]), r = T.edits.connect({ ...m, edges: [] }, m.views[0], 'a.p', 'b.q', {}, { type: 'uml.Connector' });
  assert.ok(Array.isArray(r) && r[0].element.props.kind === 'assembly', JSON.stringify(r));
  assert.equal(layout(m, 'v').nodes.find(n => n.id === 'a').aria, 'Element A, 1 port');
  assert.deepEqual(T.rows(m, m.views[0], 'a'), ['p'], 'its ports, as a component\'s');
  // type "" is no type: drawn as a component too (audit 29)
  const e = structuredClone(m); e.nodes[0].type = '';
  assert.equal(layout(e, 'v').nodes.find(n => n.id === 'a').shape, 'component');
});

test('audit 30: an element of no type, which the component view draws as a component, is one to the manifest rule, the palette\'s Port, the member rows and member.holds', () => {
  const T = diagramOf({ diagram: 'uml.component' });
  for (const type of [undefined, '']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'shop', label: 'Shop', ...(type === undefined ? {} : { type }), members: [{ id: 'p1', type: 'uml.Port', label: 'api' }] }, { id: 'jar', type: 'uml.Artifact', label: 'shop.jar' }],
      edges: [{ id: 'mf', type: 'uml.Manifestation', from: 'jar', to: 'shop' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['shop', 'jar'] }] };
    const v = m.views[0], q = JSON.stringify(type);
    assert.deepEqual(validate(m).filter(p => p.rule === 'manifest-ends'), [], `${q}: a manifestation to it is drawn, so no warning`);
    assert.deepEqual(T.edits.add(m, v, { type: 'uml.Port' }, 'web', { sel: ['shop'] }), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'web' }, owner: 'shop' }], q);
    assert.deepEqual(T.edits.member(m, v, 'shop', null, 'web'), [{ op: 'add', element: { id: 'port1', type: 'uml.Port', label: 'web' }, owner: 'shop' }], q);
    assert.equal(T.member.holds(m.nodes[0]), true, q);
  }
  // a class is still no component to the manifest rule: drawn as a classifier
  const c = { schemaVersion: 2, nodes: [{ id: 'k', type: 'uml.Class', label: 'K' }, { id: 'jar', type: 'uml.Artifact', label: 'j' }], edges: [{ id: 'mf', type: 'uml.Manifestation', from: 'jar', to: 'k' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['k', 'jar'] }] };
  assert.equal(validate(c).filter(p => p.rule === 'manifest-ends').length, 1);
});

test('audit 30: the PDF\'s Members column of a class lists the ports the view draws on its border, as a component\'s does', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Class', label: 'Order', members: [{ id: 'p', type: 'uml.Port', label: 'api', props: { valueType: 'Rest' } }, { id: 'op', type: 'uml.Operation', label: 'pay' }] },
    { id: 'k', type: 'uml.Component', label: 'Shop', members: [{ id: 'q', type: 'uml.Port', label: 'api', props: { valueType: 'Rest' } }] }, { id: 'i', type: 'uml.Interface', label: 'IPay' }],
    edges: [{ id: 'r', type: 'uml.InterfaceRealization', from: 'p', to: 'i' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['c', 'k', 'i'] }] };
  assert.equal(layout(m, 'v').byId.p.aria, 'Port api : Rest of Order, provides IPay', 'the view draws the class\'s port');
  const c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.map(r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '').trim()));
  assert.deepEqual(rows.find(r => r[0] === 'Order'), ['Order', 'Class', 'api : Rest, provides IPay'], 'its port, not the operation the box does not draw');
  assert.deepEqual(rows.find(r => r[0] === 'Shop'), ['Shop', 'Component', 'api : Rest']);
  // a class with no ports: an empty cell, as before
  const n = structuredClone(m); n.nodes[0].members = [n.nodes[0].members[1]]; n.edges = [];
  assert.deepEqual(T.rows(n, n.views[0], 'c'), []);
});

test('audit 31: an element of no type, drawn as a component, is a box for a component it owns, as a typed one is; the rule says nothing and the Owner field offers it', () => {
  for (const type of [undefined, '', 'uml.Component']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'u', label: 'Shop', ...(type === undefined ? {} : { type }), members: [{ id: 'u.p', type: 'uml.Port', label: 'api' }] }, { id: 'c', type: 'uml.Component', label: 'Cart', parent: 'u' }],
      edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['u', 'c'] }] };
    const g = layout(m, 'v'), word = type ? 'Component' : 'Element';
    assert.deepEqual(g.families.map(f => f.id), ['u'], String(type));
    assert.equal(g.families[0].shape, 'component', String(type));
    assert.ok(describe(m, 'v').split('\n').includes(`${word} Shop, 1 port, holding 1 component.`), String(type));
    assert.deepEqual(validate(m).filter(p => p.rule === 'component-owner'), [], String(type));
    assert.ok(T.owners(m, m.nodes[1]).some(o => o.id === 'u'), String(type));
  }
});

test('audit 31: a class in a component view is named with the ports drawn on its border, as a component is', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.Class', label: 'Shop', members: [{ id: 's.p', type: 'uml.Port', label: 'api' }, { id: 's.q', type: 'uml.Port', label: 'admin' }] }, { id: 'k', type: 'uml.Class', label: 'Plain' }],
    edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['s', 'k'] }] };
  const g = layout(m, 'v');
  assert.equal(g.nodes.find(n => n.id === 's').aria, 'Class Shop, 2 ports');
  assert.equal(g.nodes.find(n => n.id === 'k').aria, 'Class Plain');
  assert.ok(describe(m, 'v').split('\n').includes('Class Shop, 2 ports.'));
});

test('audit 31: component-owner writes the owner\'s kind in words with its article: "an artifact", never "a Artifact" or "a undefined"', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'j', type: 'uml.Artifact', label: 'jar' }, { id: 'c', type: 'uml.Component', label: 'Pay', parent: 'j' }, { id: 'i', type: 'uml.Interface', label: 'Api' }, { id: 'd', type: 'uml.Component', label: 'D', parent: 'i' }],
    edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['j', 'c', 'i', 'd'] }] };
  assert.deepEqual(validate(m).filter(p => p.rule === 'component-owner').map(p => p.message), [
    'component-owner: "Pay" is owned by "jar", an artifact: a component\'s owner is a component or a package',
    'component-owner: "D" is owned by "Api", an interface: a component\'s owner is a component or a package']);
});

test('audit 33: component-owner judges an element of no type, drawn as a component, as it judges a typed one', () => {
  for (const type of [undefined, '', 'uml.Component']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'i', type: 'uml.Interface', label: 'Orders' }, { id: 'c', ...(type === undefined ? {} : { type }), label: 'Shop', parent: 'i' }, { id: 'k', type: 'uml.Class', label: 'Plain', parent: 'i' }],
      edges: [], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['i', 'c', 'k'] }] };
    assert.deepEqual(validate(m).filter(p => p.rule === 'component-owner').map(p => p.message),
      ['component-owner: "Shop" is owned by "Orders", an interface: a component\'s owner is a component or a package'], String(type));
    m.nodes[0].type = 'uml.Package';
    assert.deepEqual(validate(m).filter(p => p.rule === 'component-owner'), [], `${type} in a package`);
  }
});

test('audit 34: Shift + Delete of a port with other elements says them, as the deployment hook does', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-components.json', import.meta.url), 'utf8')), v = m.views[0];
  const port = m.nodes.flatMap(n => (n.members || []).filter(x => x.type === 'uml.Port'))[0];
  const r = T.edits.remove(m, v, [port.id, 'storefront-component', 'order-worker'], true);
  assert.deepEqual(r.commands.map(c => c.op + ' ' + c.id), [`delete ${port.id}`, 'delete storefront-component', 'delete order-worker']);
  assert.equal(r.say, `Deleted port ${port.label} from the model, and 2 other elements`);
  assert.equal(T.edits.remove(m, v, [port.id, 'storefront-component'], false).say, `Deleted port ${port.label} from the model: a port is not hidden from a view; hid 1 element`);
  assert.equal(T.edits.remove(m, v, [port.id], true).say, `Deleted port ${port.label} from the model`);
});
