// C10 (risks.md C10, M11): diff()'s words for typed models, and paths() on a sequence view in time order, as
// lib/umlimator-all.js gives them (the CLI, the diff Action and the MCP server run it). A reorder where order means
// something reads "moves"; maps diff and walk as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as all from '../lib/umlimator-all.js';
import * as core from '../lib/umlimator.js';

const load = f => JSON.parse(readFileSync(new URL('../' + f, import.meta.url)));
const edit = (m, f) => { const x = structuredClone(m); f(x); return x; };
const swap = (l, i, j) => { [l[i], l[j]] = [l[j], l[i]]; };
const seq = load('examples/checkout-sequence.json'), comm = load('examples/checkout-communication.json');

test('a sequence view: a reorder of its messages reads "moves", marks the line moved and names the view', () => {
  const d = all.diff(seq, edit(seq, m => swap(m.views[0].edges, 2, 3)));
  assert.deepEqual(d.summary, ['moves validate(order) after charge(total)']);
  assert.deepEqual(d.views, ['checkout-sequence']);
  assert.deepEqual(d.model.views[0].edges.filter(e => e.edited).map(e => e.id), ['m3']);
  // an interaction use is ordered among the messages too
  const u = all.diff(seq, edit(seq, m => { const E = m.views[0].edges, i = E.findIndex(e => e.id === 'f3'); E.unshift(...E.splice(i, 1)); }));
  assert.deepEqual(u.summary, ['moves Send receipt email to the start']);
});

test('a sequence view: a message into or out of an operand, and its combined fragments added, removed and changed', () => {
  assert.deepEqual(all.diff(seq, edit(seq, m => { m.views[0].edges.find(e => e.id === 'm7').parent = 'f1-declined'; })).summary, ['moves orderPlaced into else']);
  assert.deepEqual(all.diff(seq, edit(seq, m => { delete m.views[0].edges.find(e => e.id === 'm9').parent; m.views[0].edges.find(e => e.id === 'm10').parent = 'f2-notify'; })).summary,
    ['moves confirmation page into shopper is still on the page']);
  const op = all.diff(seq, edit(seq, m => { m.views[0].fragments[1].props.operator = 'loop'; }));
  assert.deepEqual([op.summary, op.views], [['changes the opt fragment (props)'], ['checkout-sequence']]);
  assert.deepEqual(all.diff(seq, edit(seq, m => { m.views[0].fragments.push({ id: 'f9', type: 'uml.CombinedFragment', props: { operator: 'par' }, members: [] }); })).summary, ['adds the par fragment']);
  const back = edit(seq, m => { m.views[0].fragments.pop(); m.views[0].edges.forEach(e => { if (e.parent === 'f2-notify') e.parent = 'f1-paid'; }); });
  assert.deepEqual(all.diff(seq, back).summary, ['moves orderPlaced into payment accepted', 'removes the opt fragment']);
});

test('a communication view: a reorder of its messages (the view\'s edges, which number them) reads "moves", on that view', () => {
  const s = m => { const E = m.views[0].edges, i = E.indexOf('cm3'); swap(E, i, i + 1); }, b = edit(comm, s);
  assert.notEqual(all.describe(comm, 'checkout-communication'), all.describe(b, 'checkout-communication')); // the numbers change
  const d = all.diff(comm, b);
  assert.deepEqual([d.summary, d.views], [['moves validate(order) after charge(total)'], ['checkout-communication']]);
  assert.deepEqual(d.model.edges.filter(e => e.edited).map(e => e.id), ['cm3']);
  // the model's edges order draws nothing, and reads nothing; nor does its connectors' order in the view
  const k = edit(comm, m => { const i = m.edges.findIndex(e => e.id === 'cm3'); swap(m.edges, i, i + 1); });
  assert.equal(all.describe(comm, 'checkout-communication'), all.describe(k, 'checkout-communication'));
  assert.deepEqual(all.diff(comm, k).summary, []);
  assert.deepEqual(all.diff(comm, edit(comm, m => swap(m.views[0].edges, 0, 1))).summary, []);
});

test('an element\'s members reordered read "moves" on every type with members; edited too, "changes" as before', () => {
  const cases = [
    ['examples/sales-classes.json', 'customer', 'moves email after name in Customer'],
    ['examples/order-objects.json', 'order-1042', null],
    ['examples/order-states.json', 'placed', null],
    ['examples/bookshop-components.json', 'shop-api', 'moves orders after payments in Shop API'],
    ['examples/order-service-structure.json', 'order-service', null],
  ];
  for (const [f, id, said] of cases) {
    const m = load(f), n = m.nodes.find(x => x.id === id);
    if (!n.members || n.members.length < 2) n.members = [...(n.members || []), { id: id + '.extra', type: n.members?.[0]?.type || 'uml.Property', label: 'extra' }];
    const got = all.diff(m, edit(m, x => x.nodes.find(y => y.id === id).members.reverse())).summary;
    assert.equal(got.length, n.members.length - 1, `${f}: ${got}`);
    assert.ok(got.every(s => s.startsWith('moves ') && s.endsWith(' in ' + (n.label || id))), `${f}: ${got}`);
    if (said) assert.deepEqual(got, [said]);
  }
  const k = load('examples/sales-classes.json');
  assert.deepEqual(all.diff(k, edit(k, m => { const c = m.nodes.find(x => x.id === 'customer'); c.members.reverse(); c.members[0].label = 'fullName'; })).summary, ['changes Customer (members)']);
  // members with no ids: no move can be found, so "changes" as before, as lib/umlimator.js says
  const noIds = edit(k, m => m.nodes.find(x => x.id === 'customer').members.forEach(x => delete x.id)), rev = edit(noIds, m => m.nodes.find(x => x.id === 'customer').members.reverse());
  assert.deepEqual(all.diff(noIds, rev).summary, ['changes Customer (members)']);
  assert.deepEqual(all.diff(noIds, rev).summary, core.diff(noIds, rev).summary);
});

// bike-share is schema version 2; a copy without schemaVersion keeps the version-1 path compared on a real map
const bikes = () => [load('examples/bike-share.json'), edit(load('examples/bike-share.json'), m => { delete m.schemaVersion; })];

test('maps diff as before, and lib/umlimator.js (no typed words) says what it said', () => {
  for (const bike of bikes()) {
    assert.deepEqual(all.diff(bike, edit(bike, m => m.edges.reverse())).summary, []);
    const b = edit(bike, m => { m.nodes[0].label = 'X'; });
    assert.deepEqual(all.diff(bike, b), core.diff(bike, b));
  }
  assert.deepEqual(core.diff(seq, edit(seq, m => swap(m.views[0].edges, 2, 3))).summary, []);
});

test('paths() on a sequence view runs in time order; on other views as before', () => {
  const ids = r => r.map(x => x.id || x.ids[0]);
  assert.deepEqual(ids(all.paths(seq, 'checkout-sequence', 'lifeline-shopper', 'receipt')),
    ['lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt', 'm1', 'm2', 'm4', 'm5', 'm6']);
  assert.deepEqual(all.paths(seq, 'checkout-sequence', 'receipt', 'lifeline-shopper'), []); // receipt sends nothing
  assert.deepEqual(all.paths(seq, 'checkout-sequence', 'lifeline-api', 'lifeline-api'), [{ type: 'node', id: 'lifeline-api', view: 'checkout-sequence' }]); // as on a map
  for (const bike of bikes()) {
    const v = bike.views[0], [a, b] = v.nodeIds;
    assert.deepEqual(all.paths(bike, v.id, a, b), core.paths(bike, v.id, a, b));
  }
});

test('a sequence view: a removed message comes back in its place, inside its operand, and an interaction use is named by its label (audit 2)', () => {
  const d = all.diff(seq, all.apply(seq, { op: 'delete', id: 'receipt' }));
  assert.deepEqual(d.model.views[0].edges.map(e => e.id ?? e), seq.views[0].edges.map(e => e.id ?? e));
  assert.deepEqual(all.validate(d.model).filter(p => p.level === 'error'), []);
  assert.deepEqual(d.summary, ['removes receipt', 'changes Send receipt email (props)']);
});

test('audit 12: diff() brings a removed message back with its fragment, and removed states with their region, both marked removed', () => {
  const b = edit(seq, x => { const v = x.views[0]; v.fragments = v.fragments.filter(f => f.id !== 'f2'); v.edges = v.edges.filter(e => e.id !== 'm7'); });
  const d = all.diff(seq, b);
  assert.deepEqual([d.model.views[0].fragments.find(f => f.id === 'f2').change, all.validate(d.model).filter(p => p.level === 'error')], ['removed', []]);
  const st = load('examples/order-states.json'), s = all.diff(st, all.apply(st, { op: 'delete', id: 'fulfilling.payment' }));
  assert.deepEqual([s.model.nodes.find(n => n.id === 'fulfilling').members.find(r => r.id === 'fulfilling.payment').change, all.validate(s.model).filter(p => p.level === 'error')], ['removed', []]);
});

test('audit 13: a deleted part or port comes back removed in its owner, so its connectors draw removed; the summary says it went; a deleted attribute is said, not drawn', () => {
  const eb = load('examples/ebike-structure.json'), d = all.diff(eb, all.apply(eb, { op: 'delete', id: 'ebike.battery' }));
  const ebike = d.model.nodes.find(n => n.id === 'ebike'), g = all.layout(d.model, 'inside-ebike');
  assert.deepEqual([d.summary, ebike.members[0].id, ebike.members[0].change, all.validate(d.model).filter(p => p.level === 'error')], [['removes battery from EBike'], 'ebike.battery', 'removed', []]);
  assert.deepEqual(g.edges.filter(e => e.from === 'ebike.battery').map(e => e.style), ['removed', 'removed', 'removed']);
  const os = load('examples/order-service-structure.json'), c = all.diff(os, all.apply(os, { op: 'delete', id: 'order-service.pricing' }));
  assert.deepEqual([c.summary, all.layout(c.model, 'internals').edges.filter(e => e.style === 'removed').length], [['removes pricing from OrderService'], 1]);
  const sc = load('examples/sales-classes.json'), a = all.diff(sc, all.apply(sc, { op: 'delete', id: 'customer.email' }));
  assert.deepEqual([a.summary, a.model.nodes.find(n => n.id === 'customer').members.some(x => x.id === 'customer.email')], [['removes email from Customer'], false]);
});

test('audit 18: a line that ends on a port or a part names the view that draws it, and its ends as describe() does', () => {
  const cases = [['examples/bookshop-components.json', 'api-provides-orders', 'components', 'the line from orders of Shop API to Orders'],
    ['examples/bookshop-components.json', 'orders-to-checkout', 'components', 'the line from orders of Shop API to orders of Checkout'],
    ['examples/ebike-structure.json', 'battery-dock-charge', 'inside-ebike', 'the line from charge of battery to charge of dock'],
    ['examples/order-service-structure.json', 'checkout-to-orders', 'internals', 'the line from checkout to orders'],
    ['examples/order-service-structure.json', 'api-to-checkout', 'internals', 'the line from api of OrderService to requests of checkout'],
    ['examples/ebike-range.json', 'bind-usable-eco', 'range-analysis', 'the line from usable of usable to energy of eco']];
  for (const [f, id, view, it] of cases) { const m = load(f);
    const del = all.diff(m, all.apply(m, { op: 'delete', id })), set = all.diff(m, all.apply(m, { op: 'set', id, path: 'label', value: 'Zq' }));
    assert.deepEqual([del.summary, del.views], [[`removes ${it}`], [view]], `${f} ${id}: delete`);
    assert.deepEqual([set.summary, set.views], [[`changes ${it} (label - → Zq)`], [view]], `${f} ${id}: set`); }
  // a view that does not draw that kind of line is not named: bike-share's requirement and parametric views of the e-bike
  // (the e-bike atlas's, since step 3 of the one-model plan), and its other typed views
  const at = load('examples/bike-share.json');
  assert.deepEqual(all.diff(at, all.apply(at, { op: 'delete', id: 'battery-dock-charge' })).views, ['inside-ebike']);
});

test('audit 18: a C4 dynamic view whose steps are reordered says so and names the view; its steps renumbered are drawn', () => {
  const c4 = load('examples/bookshop-c4.json'), v = c4.views.find(x => x.diagram === 'c4.dynamic');
  const d = all.diff(c4, all.apply(c4, { op: 'move', id: v.edges[0], view: v.id, index: 1 }));
  assert.deepEqual([d.summary, d.views], [[`reorders the steps in the view ${v.title}`], [v.id]]);
  const same = all.diff(c4, all.apply(c4, { op: 'set', view: v.id, path: 'title', value: 'Z' }));
  assert.ok(!same.summary.some(s => /reorders/.test(s)), 'no reorder said when the order stays');
});

// audit 35: diff() named a box, a card's name in a view, a member end and the map's title labelled "" by the empty string,
// where the map draws them by their id (a box, a card whose override is "", a port) or as Map (the title): now by what is drawn
test('audit 35: diff() names what is labelled "" as it is drawn', () => {
  const a = { nodes: [{ id: 'x', label: 'X' }], views: [{ id: 'v', title: 'V', nodeIds: ['x'], containers: [{ id: 'shop', label: '', nodeIds: ['x'] }] }] };
  const b = structuredClone(a); b.views[0].containers[0].label = 'Shop';
  assert.deepEqual(core.diff(a, b).summary, ['renames the box shop to Shop in the view V']);
  assert.deepEqual(core.diff(b, a).summary, ['renames the box Shop to shop in the view V']);
  const t = structuredClone(a); t.views[0].containers[0] = { id: 'shop', title: '', nodeIds: ['x'] }; const t2 = structuredClone(t); t2.views[0].containers[0].nodeIds = [];
  assert.deepEqual(core.diff(t, t2).summary, ['moves X out of shop in the view V']);
  const c = structuredClone(a); c.views[0].nodeOverrides = { x: { label: '' } };
  assert.deepEqual(core.diff(a, c).summary, ['renames X to x in the view V'], 'an override "" draws the card by its id');
  const c2 = structuredClone(c); c2.views[0].layout = { x: [2, 0] };
  assert.deepEqual(core.diff(c, c2).summary, ['moves x in the view V']);
  const P = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Component', label: 'Shop', members: [{ id: 'p', type: 'uml.Port', label: '' }] }, { id: 'T', type: 'uml.Component', label: 'T' }],
    edges: [], views: [{ id: 'cv', diagram: 'uml.component', nodeIds: ['S', 'T'] }] };
  const P2 = structuredClone(P); P2.edges.push({ id: 'e', type: 'uml.Dependency', from: 'p', to: 'T' });
  assert.deepEqual(all.diff(P, P2).summary, ['adds a line from p of Shop to T']);
  for (const [t0, t1, want] of [['', 'Shop', ['titles the map Shop']], ['Shop', '', ['takes the title Shop off the map']], ['', undefined, []], [undefined, '', []], [0, '', ['takes the title 0 off the map']]]) {
    const A = { nodes: [] }, B = { nodes: [] }; if (t0 !== undefined) A.title = t0; if (t1 !== undefined) B.title = t1;
    assert.deepEqual(core.diff(A, B).summary, want, JSON.stringify([t0, t1])); }
  // a line's label "" is no label, as drawn
  const L = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', from: 'a', to: 'b', label: '' }] }, L2 = structuredClone(L); L2.edges[0].label = 'calls';
  assert.deepEqual(core.diff(L, L2).summary, ['changes the line from a to b (label - → calls)']);
});

test('audit 39: views lists a typed view that draws a changed element it does not list', () => {
  const at = load('examples/bike-share.json'), rn = (m, id, label) => all.apply(m, { op: 'set', id, path: 'label', value: label }); // the atlases' typed views, since step 3
  // a package's box over the classes a class view lists; a deployed container's name on its instance; an overview's inline lifelines
  for (const [id, view] of [['payments-package', 'domain'], ['payments-package', 'payments-only'], ['c4-api', 'c4-deployment'], ['lifeline-worker', 'hire-overview']]) {
    const after = rn(at, id, 'Zq Renamed'), d = all.diff(at, after);
    assert.ok(all.layout(after, view).nodes.concat(all.layout(after, view).families || []).some(n => JSON.stringify(n).includes('Zq Renamed')), `${view} draws ${id}`);
    assert.ok(d.views.includes(view), `${id}: ${view} in ${JSON.stringify(d.views)}`); }
  // a part's type named by its name, and that type's ports
  const os = load('examples/order-service-structure.json');
  assert.deepEqual(all.diff(os, rn(os, 'checkout-class.requests', 'inbox')).views, ['internals']);
  // an element that only opens a view: its view's title is drawn in its name, the view's cards are not
  const eb = load('examples/bike-share.json');
  assert.deepEqual(all.diff(eb, all.apply(eb, { op: 'delete', id: 'battery-dock-charge' })).views, ['inside-ebike']);
  // a hostile model: an element that names itself, owners in a cycle, a tree 20,000 deep and ids such as __proto__ throw
  // nothing and list only the views that draw the change
  const deep = { id: 'd0', type: 'uml.Class', label: 'D' }; let x = deep; for (let i = 1; i < 20000; i++) { x.members = [{ id: 'd' + i, type: 'uml.Property', label: 'p', props: { valueType: 'toString' } }]; x = x.members[0]; }
  const H = { schemaVersion: 2, nodes: [{ id: '__proto__', type: 'uml.Package', label: 'constructor', parent: 'q' }, { id: 'q', type: 'uml.Package', label: 'Q', parent: '__proto__' },
    { id: 'c', type: 'uml.Class', label: 'C', parent: '__proto__', props: { self: 'c', v: 'cv' } }, deep],
    edges: [], views: [{ id: 'cv', diagram: 'uml.class', nodeIds: ['c'] }, { id: 'dv', diagram: 'uml.class', nodeIds: ['d0'] }, { id: 'pv', diagram: 'uml.package', nodeIds: ['q'] }] };
  const relabel = (i, label) => ({ ...H, nodes: H.nodes.map((n, j) => (j === i ? { ...n, label } : n)) });
  assert.deepEqual(all.diff(H, relabel(1, 'Q2')).views, ['cv', 'pv']);
  assert.deepEqual(all.diff(H, relabel(0, 'Z')).views, ['cv', 'pv']);
  assert.deepEqual(all.diff(H, relabel(3, 'D2')).views, ['dv']);
});

test('audit 39: a schemaVersion change lists every typed view, which then draws as plain cards or as its type', () => {
  const m = load('tests/state-minimal.json'), b = edit(m, x => { x.schemaVersion = 1; });
  assert.notDeepEqual(all.layout(m, m.views[0].id).nodes.map(n => n.shape), all.layout(b, m.views[0].id).nodes.map(n => n.shape));
  assert.deepEqual(all.diff(m, b).views, m.views.filter(v => v.diagram && v.diagram !== 'map').map(v => v.id));
  assert.deepEqual(all.diff(b, m).views, m.views.filter(v => v.diagram && v.diagram !== 'map').map(v => v.id));
  const map = { nodes: [{ id: 'a' }], views: [{ id: 'v', nodeIds: ['a'] }] };
  assert.deepEqual(core.diff(map, { ...map, schemaVersion: 2 }).views, [], 'a map view draws the same at either version');
});
