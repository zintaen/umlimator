// C10 (risks.md C10, M11): diff()'s words for typed models, and paths() on a sequence view in time order, as
// lib/umlimator-all.js gives them (the CLI, the diff Action and the MCP server run it). A reorder where order means
// something reads "moves"; maps diff and walk as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
  // audit 47: an edited member is said by its name, and the rest's new order still reads "moves"
  assert.deepEqual(all.diff(k, edit(k, m => { const c = m.nodes.find(x => x.id === 'customer'); c.members.reverse(); c.members[0].label = 'fullName'; })).summary, ['moves email after name in Customer', 'renames name to fullName in Customer']);
  // members with no ids: no move can be found, so "changes" as before, as lib/umlimator.js says
  const noIds = edit(k, m => m.nodes.find(x => x.id === 'customer').members.forEach(x => delete x.id)), rev = edit(noIds, m => m.nodes.find(x => x.id === 'customer').members.reverse());
  assert.deepEqual(all.diff(noIds, rev).summary, ['changes Customer (members)']);
  assert.deepEqual(all.diff(noIds, rev).summary, core.diff(noIds, rev).summary);
});

// the integration fixture is schema version 2; a copy without schemaVersion keeps the version-1 path compared on a real map
const fixtures = () => [load('tests/fixtures/integration.json'), edit(load('tests/fixtures/integration.json'), m => { delete m.schemaVersion; })];

test('maps diff as before, and lib/umlimator.js (no typed words) says what it said', () => {
  for (const fx of fixtures()) {
    assert.deepEqual(all.diff(fx, edit(fx, m => m.edges.reverse())).summary, []);
    const b = edit(fx, m => { m.nodes[0].label = 'X'; });
    assert.deepEqual(all.diff(fx, b), core.diff(fx, b));
  }
  assert.deepEqual(core.diff(seq, edit(seq, m => swap(m.views[0].edges, 2, 3))).summary, []);
});

test('paths() on a sequence view runs in time order; on other views as before', () => {
  const ids = r => r.map(x => x.id || x.ids[0]);
  assert.deepEqual(ids(all.paths(seq, 'checkout-sequence', 'lifeline-shopper', 'receipt')),
    ['lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt', 'm1', 'm2', 'm4', 'm5', 'm6']);
  assert.deepEqual(all.paths(seq, 'checkout-sequence', 'receipt', 'lifeline-shopper'), []); // receipt sends nothing
  assert.deepEqual(all.paths(seq, 'checkout-sequence', 'lifeline-api', 'lifeline-api'), [{ type: 'node', id: 'lifeline-api', view: 'checkout-sequence' }]); // as on a map
  for (const fx of fixtures()) {
    const v = fx.views[0], [a, b] = v.nodeIds;
    assert.deepEqual(all.paths(fx, v.id, a, b), core.paths(fx, v.id, a, b));
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
  assert.deepEqual([d.summary, ebike.members[0].id, ebike.members[0].change, all.validate(d.model).filter(p => p.level === 'error')], [['removes battery from CargoBike'], 'ebike.battery', 'removed', []]);
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
    ['examples/ebike-range.json', 'bind-usable-empty', 'range-analysis', 'the line from usable of usable to energy of empty']];
  for (const [f, id, view, it] of cases) { const m = load(f);
    const del = all.diff(m, all.apply(m, { op: 'delete', id })), set = all.diff(m, all.apply(m, { op: 'set', id, path: 'label', value: 'Zq' }));
    assert.deepEqual([del.summary, del.views], [[`removes ${it}`], [view]], `${f} ${id}: delete`);
    assert.deepEqual([set.summary, set.views], [[`changes ${it} (label - → Zq)`], [view]], `${f} ${id}: set`); }
  // a view that does not draw that kind of line is not named: the integration fixture's requirement and parametric views of
  // the e-moped (the SysML atlas's, since step 3 of the one-model plan), and its other typed views
  const at = load('tests/fixtures/integration.json');
  assert.deepEqual(all.diff(at, all.apply(at, { op: 'delete', id: 'battery-dock-charge' })).views, ['inside-emoped']);
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
  const at = load('tests/fixtures/integration.json'), rn = (m, id, label) => all.apply(m, { op: 'set', id, path: 'label', value: label }); // the atlases' typed views, since step 3
  // a package's box over the classes a class view lists; a deployed container's name on its instance; an overview's inline lifelines
  for (const [id, view] of [['payments-package', 'domain'], ['payments-package', 'payments-only'], ['c4-api', 'c4-deployment'], ['lifeline-worker', 'hire-overview']]) {
    const after = rn(at, id, 'Zq Renamed'), d = all.diff(at, after);
    assert.ok(all.layout(after, view).nodes.concat(all.layout(after, view).families || []).some(n => JSON.stringify(n).includes('Zq Renamed')), `${view} draws ${id}`);
    assert.ok(d.views.includes(view), `${id}: ${view} in ${JSON.stringify(d.views)}`); }
  // a part's type named by its name, and that type's ports
  const os = load('examples/order-service-structure.json');
  assert.deepEqual(all.diff(os, rn(os, 'checkout-class.requests', 'inbox')).views, ['internals']);
  // an element that only opens a view: its view's title is drawn in its name, the view's cards are not
  const eb = load('tests/fixtures/integration.json');
  assert.deepEqual(all.diff(eb, all.apply(eb, { op: 'delete', id: 'battery-dock-charge' })).views, ['inside-emoped']);
  // a hostile model: an element that names itself, owners in a cycle, a tree 20,000 deep and ids such as __proto__ throw
  // nothing and list only the views that draw the change
  const deep = { id: 'd0', type: 'uml.Class', label: 'D' }; let x = deep; for (let i = 1; i < 20000; i++) { x.members = [{ id: 'd' + i, type: 'uml.Property', label: 'p', props: { valueType: 'toString' } }]; x = x.members[0]; }
  const H = { schemaVersion: 2, nodes: [{ id: '__proto__', type: 'uml.Package', label: 'constructor', parent: 'q' }, { id: 'q', type: 'uml.Package', label: 'Q', parent: '__proto__' },
    { id: 'c', type: 'uml.Class', label: 'C', parent: '__proto__', props: { self: 'c', v: 'cv' } }, deep],
    edges: [], views: [{ id: 'cv', diagram: 'uml.class', nodeIds: ['c'] }, { id: 'dv', diagram: 'uml.class', nodeIds: ['d0'] }, { id: 'pv', diagram: 'uml.package', nodeIds: ['q'] }] };
  const relabel = (i, label) => ({ ...H, nodes: H.nodes.map((n, j) => (j === i ? { ...n, label } : n)) });
  assert.deepEqual(all.diff(H, relabel(1, 'Q2')).views, ['pv']); // audit 47: cv draws c's package, not that package's owner Q: the same picture
  assert.deepEqual(all.diff(H, relabel(0, 'Z')).views, ['cv']); // audit 47: pv draws Q closed, not the package inside it: the same picture
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

// audit 47: a flow node moved between lanes names the lane by its label, as a move into the pool or a package does
test('a BPMN task moved into another lane, or out of a lane removed, names the lane by its label', () => {
  const bz = load('examples/bookshop-order-to-shipment.json'), t = bz.nodes.find(n => n.type === 'bpmn.Task' && n.parent === 'bp-sales');
  assert.deepEqual(all.diff(bz, edit(bz, m => { m.nodes.find(n => n.id === t.id).parent = 'bp-warehouse'; })).summary, [`moves ${t.label} into Warehouse`]);
  assert.deepEqual(all.diff(bz, edit(bz, m => { m.nodes.find(n => n.id === t.id).parent = 'bp-bookshop'; })).summary, [`moves ${t.label} into Bookshop`]);
  const pool = bz.nodes.find(n => n.id === 'bp-bookshop'), lanes = pool.members.map(l => l.label);
  assert.ok(lanes.includes('Sales') && lanes.includes('Warehouse'));
  const s = all.diff(bz, edit(bz, m => { const P = m.nodes.find(n => n.id === 'bp-bookshop'); P.members = P.members.filter(l => l.id !== 'bp-warehouse'); m.nodes.forEach(n => { if (n.parent === 'bp-warehouse') n.parent = 'bp-sales'; }); })).summary;
  assert.ok(s.length > 1 && s.slice(1).every(x => x.endsWith(' into Sales')) && !s.some(x => /bp-(sales|warehouse)/.test(x)), s.join('; '));
});

// audit 49: a member moved to another owner is said once, and a shape drawn for it in its old place comes back removed
test('audit 49: a member moved between owners reads only "moves X out of A into B"; a moved port leaves a removed ghost', () => {
  const cl = load('tests/class-minimal.json'), mv = all.diff(cl, edit(cl, m => { const x = m.nodes[0].members.shift(); m.nodes[1].members = [x]; }));
  assert.deepEqual(mv.summary, ['moves total out of Order into OrderLine']);
  const cs = edit(load('tests/composite-minimal.json'), m => { m.edges = []; m.nodes[0].members.push({ id: 's.out', type: 'uml.Port', label: 'out' }); });
  for (const into of ['Engine', 'a class no view draws']) {
    const after = edit(cs, m => { const p = m.nodes[0].members.splice(2, 1)[0];
      if (into === 'Engine') m.nodes[1].members.push(p); else m.nodes.push({ id: 'Z', type: 'uml.Class', label: 'Zed', members: [p] }); });
    const d = all.diff(cs, after), g = all.layout(d.model, 'v'), ghost = g.nodes.filter(n => n.change === 'removed');
    assert.equal(d.summary.filter(s => /\(members\)/.test(s)).length, 0, d.summary.join('; '));
    assert.deepEqual(ghost.map(n => [n.label, n.owner, n.shape]), [['out', 's', 'port']], into);
    assert.notEqual(ghost[0].id, 's.out'); assert.deepEqual(all.validate(d.model), []);
  }
  // deleted, as before: the port itself comes back
  assert.deepEqual(all.layout(all.diff(cs, edit(cs, m => { m.nodes[0].members.splice(2, 1); })).model, 'v').nodes.filter(n => n.change === 'removed').map(n => n.id), ['s.out']);
});

test('audit 49: the object view and an open package box mark a name qualified through a renamed undrawn package', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package', label: 'sales' }, { id: 'q', type: 'uml.Package', label: 'orders', parent: 'p' },
    { id: 'c', type: 'uml.Class', label: 'Order', parent: 'p' }, { id: 'o', type: 'uml.InstanceSpecification', label: 'o1', parent: 'p', props: { classifier: 'Order' } }, { id: 'k', type: 'uml.Class', label: 'Line', parent: 'q' }],
  views: [{ id: 'ov', diagram: 'uml.object', nodeIds: ['c', 'o'] }, ...['uml.class', 'uml.package', 'uml.component', 'uml.profile', 'uml.object'].map((diagram, i) => ({ id: 'b' + i, diagram, nodeIds: ['q', 'k'] }))] };
  const d = all.diff(m, edit(m, x => { x.nodes[0].label = 'shop'; })), at = (v, id) => [...all.layout(d.model, v).nodes, ...(all.layout(d.model, v).families || [])].find(n => n.id === id);
  assert.deepEqual(d.summary, ['renames sales to shop']);
  assert.deepEqual(['c', 'o'].map(id => [at('ov', id).label, at('ov', id).change]), [['shop::Order', 'changed'], ['shop::o1 : Order', 'changed']]);
  for (const v of ['b0', 'b1', 'b2', 'b3', 'b4']) { assert.ok(d.views.includes(v), v); assert.equal(at(v, 'q').change, 'changed', v); assert.match(String(at(v, 'q').title), /shop::orders/, v); }
  // a rename that leaves the drawn names as they were marks nothing on them
  const e = all.diff(m, edit(m, x => { x.nodes[2].props = { isAbstract: false }; })), g = all.layout(e.model, 'b0');
  assert.equal([...g.nodes, ...(g.families || [])].find(n => n.id === 'q').change, undefined);
});

test('audit 49: a C4 implied line drawn before and after reads changed when the only relationship behind it is replaced', () => {
  const El = (id, t, label, parent) => ({ id, type: 'c4.' + t, label, ...(parent ? { parent } : {}), props: {} });
  const base = () => ({ schemaVersion: 2, nodes: [El('S', 'SoftwareSystem', 'Shop'), El('T', 'SoftwareSystem', 'Pay'), El('a', 'Container', 'Web', 'S'), El('b', 'Container', 'API', 'S'), El('c', 'Container', 'Gateway', 'T')],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'b', to: 'c', label: 'charges' }], views: [{ id: 'ctx', diagram: 'c4.context', title: 'Context', nodeIds: ['S', 'T'] }] });
  const marks = (b, f) => { const a = edit(b, f); return all.layout(all.diff(b, a).model, 'ctx').edges.map(e => [e._id ?? e.id, e.label, e.change]); };
  assert.deepEqual(marks(base(), m => { m.edges = [{ id: 'r2', type: 'c4.Relationship', from: 'a', to: 'c', label: 'pays' }]; }), [['S->T', 'pays', 'changed']]);
  assert.deepEqual(marks(base(), m => { m.edges = [{ id: 'r2', type: 'c4.Relationship', from: 'b', to: 'c', label: 'charges' }]; }), [['S->T', 'charges', undefined]]);
  assert.deepEqual(marks(edit(base(), m => { m.edges = []; }), m => { m.edges = [{ id: 'r2', type: 'c4.Relationship', from: 'a', to: 'c', label: 'pays' }]; }), [['S->T', 'pays', 'added']]);
});

// audit 49: what a typed view draws through another view, or from what it does not list, marked on the diff page
test('audit 49: an inline interaction is marked changed when its sequence view changes through its own messages, fragments or what it shows; a changed message inside it has the edited dot', () => {
  const ov = load('examples/buy-book-overview.json'), sd = m => all.layout(m, 'buy-book').nodes.find(n => n.id === 'sd-queue');
  const q = m => m.views.find(v => v.id === 'queue-order');
  assert.equal(sd(all.diff(ov, ov).model).change, undefined);
  for (const [what, f] of [['relabel', m => { q(m).edges[2].label = 'orderQueued'; }],
    ['add', m => { q(m).edges.push({ id: 'queue-4', type: 'uml.Message', from: 'lifeline-worker', to: 'lifeline-queue', label: 'ack', props: { sort: 'async' } }); }],
    ['fragment', m => { q(m).fragments = [{ id: 'fx', type: 'uml.CombinedFragment', props: { operator: 'opt' }, members: [{ id: 'fx-1', type: 'uml.InteractionOperand', label: 'ok' }] }]; }],
    ['show', m => { q(m).nodeIds.push('lifeline-shopper'); }],
    ['hide', m => { q(m).nodeIds = q(m).nodeIds.filter(id => id !== 'lifeline-api'); q(m).edges = q(m).edges.filter(e => e.from !== 'lifeline-api' && e.to !== 'lifeline-api'); }]]) {
    const d = all.diff(ov, edit(ov, f)), n = sd(d.model);
    assert.deepEqual([d.views.includes('buy-book'), n.change], [true, 'changed'], what);
    if (what === 'relabel') assert.equal((n.sd.markup.match(/class="edited-dot"/g) || []).length, 1); }
});

test('audit 49: a timing view\'s constraints added, changed or removed are marked so, a removed one drawn back', () => {
  const tm = load('examples/bookshop-timing.json'), cs = m => m.views[0].timeline.constraints;
  const marked = b => { const d = all.diff(tm, edit(tm, b)); return all.layout(d.model, d.model.views[0].id).nodes.filter(n => n.change).map(n => [n.id, n.change]); };
  assert.deepEqual(marked(() => {}), []);
  assert.deepEqual(marked(m => { cs(m)[0].label = '{<= 500 ms}'; }), [['c-wait', 'changed']]);
  assert.deepEqual(marked(m => { cs(m).splice(0, 1); }), [['c-wait', 'removed']]);
  assert.deepEqual(marked(m => { cs(m).push({ id: 'c-new', type: 'uml.TimeConstraint', from: 'p-done', label: '{<= 2 s}' }); }), [['c-new', 'added']]);
  const d = all.diff(tm, edit(tm, m => { cs(m).splice(0, 1); }));
  assert.deepEqual([cs(d.model).map(c => c.id), cs(tm).length], [['c-wait', 'c-finished'], 2]);
});

test('audit 49: a BPMN group deleted from the model is drawn back, removed, round the elements that named it', () => {
  const bz = load('examples/bookshop-order-to-shipment.json'), vid = bz.views[0].id, gid = 'dispatch';
  const before = all.layout(bz, vid).nodes.find(n => n.id === gid), d = all.diff(bz, all.apply(bz, { op: 'delete', id: gid }));
  const g = all.layout(d.model, vid).nodes.find(n => n.id === gid);
  assert.ok(before && g, 'drawn');
  assert.deepEqual([g.change, d.summary.includes('removes Dispatch')], ['removed', true]);
  assert.deepEqual(bz.nodes.filter(n => ((n.props || {}).categoryValueRef || []).includes(gid)).map(n => n.id).sort(),
    d.model.nodes.filter(n => ((n.props || {}).categoryValueRef || []).includes(gid)).map(n => n.id).sort());
});

test('audit 49: an internal block view marks the ports whose flow arrows an interface block\'s flow properties turned round', () => {
  const m = load('tests/internal-block-stress.json'), vid = 'edge-cases', flip = x => edit(x, a => a.nodes.find(n => n.label === 'PowerIf').members.filter(y => y.type === 'sysml.FlowProperty')
    .forEach(y => { y.props = { ...y.props, direction: y.props.direction === 'in' ? 'out' : 'in' }; }));
  const ports = g => g.nodes.filter(n => n.shape === 'port'), g0 = all.layout(m, vid), d = all.diff(m, flip(m)), g1 = all.layout(d.model, vid);
  const turned = ports(g1).filter(n => ports(g0).find(o => o.id === n.id).flow !== n.flow);
  assert.ok(turned.length >= 6, turned.length);
  assert.deepEqual(ports(g1).filter(n => n.change).map(n => n.id).sort(), turned.map(n => n.id).sort());
  const doc = all.diff(m, edit(m, a => { const B = a.nodes.find(n => n.label === 'PowerIf'); B.props = { ...B.props, documentation: 'x' }; }));
  assert.deepEqual(ports(all.layout(doc.model, vid)).filter(n => n.change), []);
});

test('audit 51: a profile card whose stereotypes and tags come from an undrawn stereotype or Extension is marked when they change', () => {
  const p = edit(load('examples/bookshop-profile.json'), m => m.views.push({ id: 'only', diagram: 'uml.profile', nodeIds: ['order'] }));
  const st = m => m.nodes.find(n => n.id === 'owned');
  const mark = (b, vid) => { const after = edit(p, b), d = all.diff(p, after), n = all.layout(d.model, vid).nodes.find(x => x.id === 'order');
    return [all.describe(p, vid) !== all.describe(after, vid), d.views.includes(vid), n.change ?? null]; };
  for (const vid of ['only', 'profile']) {
    assert.deepEqual(mark(m => { delete m.edges.find(e => e.id === 'owned-extends-class').props.isRequired; }, vid), [true, true, 'changed'], vid); // «owned» goes
    assert.deepEqual(mark(m => { st(m).label = 'team'; }, vid), [true, true, 'changed'], vid);
    assert.deepEqual(mark(m => { st(m).members[0].label = 'squad'; }, vid), [true, true, 'changed'], vid);
    assert.deepEqual(mark(m => { m.nodes.find(n => n.id === 'entity').members[0].label = 'tbl'; }, vid), [true, true, 'changed'], vid);
    // deleted, it comes back removed: the card drew otherwise before, so it is marked by diff()
    assert.deepEqual(mark(m => { m.edges = m.edges.filter(e => e.id !== 'owned-extends-class'); }, vid), [true, true, 'changed'], vid);
    assert.deepEqual(mark(m => { m.nodes = m.nodes.filter(n => n.id !== 'conventions'); }, vid), [true, true, 'changed'], vid); }
  // an undrawn Extension deleted that the card did not draw from: nothing on it
  assert.deepEqual(mark(m => { m.edges = m.edges.filter(e => e.id !== 'entity-extends-class'); }, 'profile'), [true, true, null]);
  // what the card draws as before marks nothing, and lists no view that shows only it
  assert.deepEqual(mark(m => { m.edges.find(e => e.id === 'entity-extends-class').label = 'x'; }, 'only'), [false, false, null]);
  assert.deepEqual(mark(m => { m.nodes.find(n => n.id === 'aggregate-root').members[0].label = 'ctx'; }, 'only'), [false, false, null]);
});

test('audit 53: a profile card is marked when the metaclass a required Extension reaches is renamed, or an owner leaves the applying package', () => {
  const p = load('examples/bookshop-profile.json');
  const mark = (b, a = p) => { const after = edit(a, b), g = all.layout(all.diff(a, after).model, 'profile'), n = [...g.nodes, ...(g.families || [])];
    return [all.describe(a, 'profile') !== all.describe(after, 'profile'), Object.fromEntries(n.filter(x => x.change).map(x => [x.id, x.change]))]; };
  // the «owned» extension now reaches components: Order loses its «owned» compartment
  assert.deepEqual(mark(m => { m.nodes.find(n => n.id === 'mc-class').label = 'Component'; }), [true, { 'mc-class': 'changed', order: 'changed' }]);
  // a package between Order and the one applying the profile moved out of it: Order leaves the profile's scope
  const nest = edit(p, m => { m.nodes.push({ id: 'shop', type: 'uml.Package', label: 'shop' }); m.nodes.find(n => n.id === 'sales').parent = 'shop';
    m.edges.find(e => e.id === 'sales-applies-conventions').from = 'shop'; });
  assert.deepEqual(mark(m => { delete m.nodes.find(n => n.id === 'sales').parent; }, nest)[1], { order: 'changed', sales: 'changed' });
  // an owner renamed, which the card does not draw: only the owner
  assert.deepEqual(mark(m => { m.nodes.find(n => n.id === 'sales').label = 'Sales'; })[1], { sales: 'changed' });
});

test('audit 51: an interaction overview\'s inline interaction marks a lifeline its sequence view holds as its own, added or removed', () => {
  const ov = load('examples/types/uml-interaction-overview.json'), L = { id: 'audit-log', type: 'uml.Lifeline', label: 'audit' };
  const withIt = own => edit(ov, m => { const q = m.views.find(v => v.id === 'queue-order'); if (own) q.nodes = [L]; else m.nodes.push(L); q.nodeIds.push(L.id); });
  const head = d => { const mk = all.layout(d.model, 'buy-book').nodes.find(n => n.id === 'sd-queue').sd.markup;
    const h = mk.split('<g class="lifeline"').slice(1).find(s => s.slice(0, 900).includes('>audit<')); return h && (/um-green|um-rose/.exec(h.slice(0, 900)) || ['none'])[0]; };
  for (const own of [false, true]) assert.deepEqual([head(all.diff(ov, withIt(own))), head(all.diff(withIt(own), ov))], ['um-green', 'um-rose'], own ? 'view-own' : 'model');
});

test('audit 51: a sequence view on the diff page counts the live messages, as the model after the change does', () => {
  const sq = load('examples/types/uml-sequence.json'), vid = sq.views[0].id, after = edit(sq, m => { m.views[0].edges = m.views[0].edges.filter(e => e.id !== 'm2'); });
  const names = m => all.layout(m, vid).edges.filter(e => e.type === 'uml.Message').map(e => e.aria);
  const page = names(all.diff(sq, after).model), alone = names(after);
  assert.deepEqual(page.filter(a => /^Message \d/.test(a)), alone);
  assert.deepEqual(page.filter(a => !/^Message \d/.test(a)), ['Message: storefront to api, place(order), call']); // the removed one: no place
  // a message added is counted among the live ones
  assert.deepEqual(names(all.diff(after, sq).model), names(sq));
});

test('audit 53: an interaction overview\'s inline interaction on the diff page counts the live lifelines and messages, as the model after the change does', () => {
  const ov = load('examples/buy-book-overview.json'), aria = m => all.layout(m, 'buy-book').nodes.find(n => n.id === 'sd-queue').aria;
  const afters = [edit(ov, m => { m.views.find(v => v.id === 'queue-order').edges.splice(2, 1); }),
    all.apply(ov, [{ op: 'hide', id: 'lifeline-worker', view: 'queue-order' }]), all.apply(ov, [{ op: 'delete', id: 'lifeline-worker' }])];
  assert.deepEqual(afters.map(a => aria(a).match(/\d+ lifelines?, \d+ messages?/)[0]), ['3 lifelines, 2 messages', '2 lifelines, 2 messages', '2 lifelines, 2 messages']);
  for (const a of afters) { assert.equal(aria(all.diff(ov, a).model), aria(a)); assert.equal(aria(all.diff(a, ov).model), aria(ov), 'added ones are counted'); }
});

test('audit 51: an undrawn relationship to an IDEF1X entity that comes or goes marks nothing on it, and lists no view', () => {
  const ent = id => ({ id, type: 'er.Entity', label: id, props: { columns: [{ name: 'id', pk: true }] } });
  const base = qid => ({ schemaVersion: 2, nodes: ['P', 'Q', 'C'].map(ent), edges: [{ id: 'pc', type: 'er.Relationship', from: 'P', to: 'C', props: { identifying: true } },
    { id: 'qc', type: 'er.Relationship', from: 'Q', to: 'C', label: 'refers', props: { identifying: qid } }],
    views: [{ id: 'all', diagram: 'er', nodeIds: ['P', 'Q', 'C'] }, { id: 'idef', diagram: 'er', notation: 'idef1x', nodeIds: ['P', 'C'] }] });
  const run = (a, b) => { const d = all.diff(a, b), C = all.layout(d.model, 'idef').nodes.find(n => n.id === 'C'); return [d.views, C.change ?? null, !!C.dep]; };
  const drop = (m, id) => edit(m, x => { x.edges = x.edges.filter(e => e.id !== id); });
  for (const qid of [false, true]) {
    assert.deepEqual(run(base(qid), drop(base(qid), 'qc')), [['all'], null, true], `removed, identifying ${qid}`);
    assert.deepEqual(run(drop(base(qid), 'qc'), base(qid)), [['all'], null, true], `added, identifying ${qid}`); }
  // the drawn identifying one removed: the child draws independent, marked changed; another identifying one left: as before
  assert.deepEqual(run(base(false), drop(base(false), 'pc')), [['all', 'idef'], 'changed', false]);
  assert.deepEqual(run(base(true), drop(base(true), 'pc')), [['all', 'idef'], null, true]);
  // an undrawn identifying one removed, the only one: the child draws independent
  assert.deepEqual(run(drop(base(true), 'pc'), drop(drop(base(true), 'pc'), 'qc')), [['all', 'idef'], 'changed', false]);
});

test('audit 52: an extension point renamed marks the extend that draws its name changed (its edited dot, ", changed"); a change it does not draw marks nothing', () => {
  const base = load('examples/types/uml-use-case.json'), point = m => m.nodes.find(n => n.id === 'check-out').members.find(x => x.id === 'check-out.payment');
  const after = structuredClone(base); point(after).label = 'pay step';
  const d = all.diff(base, after), e = all.layout(d.model, 'shopping').edges.find(x => x.id === 'voucher-extends-checkout');
  assert.equal(e.change, 'changed'); assert.match(e.label, /\(pay step\)/);
  // a use case's other change, which the extend does not draw, leaves it unmarked
  const other = structuredClone(base); other.nodes.find(n => n.id === 'check-out').props = { ...(other.nodes.find(n => n.id === 'check-out').props || {}), documentation: 'new words' };
  assert.equal(all.layout(all.diff(base, other).model, 'shopping').edges.find(x => x.id === 'voucher-extends-checkout').change ?? null, null);
});

test('audit 54: a typed view whose edges list drops a line: the diff model validates, its removed copy no second element', () => {
  const errs = m => all.validate(m).filter(p => p.level === 'error').map(p => p.path + ' ' + p.message);
  const pk = { schemaVersion: 2, nodes: ['a', 'b', 'c'].map(id => ({ id, type: 'uml.Package', label: id.toUpperCase() })),
    edges: [{ id: 'ab', type: 'uml.PackageImport', from: 'a', to: 'b', members: [{ id: 'ab.note', type: 'uml.Comment' }] }, { id: 'bc', type: 'uml.PackageImport', from: 'b', to: 'c', members: [{ id: 'bc.note', type: 'uml.Comment' }] }],
    views: [{ id: 'p', diagram: 'uml.package', title: 'P', nodeIds: ['a', 'b', 'c'], edges: ['ab', 'bc'] }] };
  const d = all.diff(pk, edit(pk, m => { m.views[0].edges = ['ab']; }));
  assert.equal(d.model.views[0].edges[1].change, 'removed');
  assert.deepEqual(errs(d.model), []);
  // an own line of the same id that is no removed copy (other ends, or not removed) is still a second element
  assert.match(errs(edit(d.model, m => { m.views[0].edges[1].to = 'a'; })).join('\n'), /id "bc" is used twice/);
  assert.match(errs(edit(d.model, m => { delete m.views[0].edges[1].change; })).join('\n'), /id "bc" is used twice/);
  // every typed view of the examples that lists its lines, each line dropped in turn (a C4 dynamic view, a communication view, ...)
  for (const f of ['examples/bookshop-c4.json', 'examples/checkout-communication.json', 'examples/bookshop-packages.json', 'examples/bookshop-atlas.json']) {
    const m = load(f);
    m.views.forEach((v, i) => { if (!v.diagram || v.diagram === 'map' || !Array.isArray(v.edges)) return;
      v.edges.forEach((e, j) => { if (typeof e !== 'string') return; const a = edit(m, x => { x.views[i].edges.splice(j, 1); }), before = new Set(errs(a));
        assert.deepEqual(errs(all.diff(m, a).model).filter(x => !before.has(x)), [], `${f} ${v.id} without ${e}`); }); }); }
});

test('audit 55: a card or a line put back into a view that lists its lines: the diff model validates, its added copy no second element', () => {
  const errs = m => all.validate(m).filter(p => p.level === 'error').map(p => p.path + ' ' + p.message);
  for (const f of ['examples/bookshop-c4.json', 'examples/bookshop-atlas.json', 'tests/fixtures/map-shop.json', 'examples/types/sysml-block-definition.json', 'examples/types/uml-class.json', 'examples/types/uml-communication.json']) {
    const m = load(f);
    m.views.forEach((v, i) => { if (!Array.isArray(v.edges) || !Array.isArray(v.nodeIds)) return;
      const less = [...v.nodeIds.map(id => [`card ${id}`, edit(m, x => { x.views[i].nodeIds = x.views[i].nodeIds.filter(y => y !== id); })]),
        ...v.edges.flatMap((e, j) => typeof e === 'string' ? [[`line ${e}`, edit(m, x => { x.views[i].edges.splice(j, 1); })]] : [])];
      less.forEach(([what, a]) => { const before = new Set([...errs(a), ...errs(m)]);
        assert.deepEqual(errs(all.diff(a, m).model).filter(x => !before.has(x)), [], `${f} ${v.id}: ${what} put back`); }); }); }
  // an own line of the same id that is no added copy (other ends) is still a second element
  const mp = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], edges: ['ab', 'bc'] }] };
  const d = all.diff(edit(mp, x => { x.views[0].edges = ['ab']; }), mp).model;
  assert.equal(d.views[0].edges[1].change, 'added'); assert.deepEqual(errs(d), []);
  assert.match(errs(edit(d, x => { x.views[0].edges[1].to = 'a'; })).join('\n'), /line id "bc" is used twice/);
});

test('audit 55: on the diff page an owner\'s name counts what it holds as the model after does, not what diff() drew back removed', () => {
  // [example, view, element deleted, owner whose name counts it]: the mindmap topic and cloud groups the audit found, and every
  // other type whose owner names a count (use case subject, C4 boundary and deployment node, BPMN lane and pool, partition,
  // region and composite state, component, composite structure, deployment node and target)
  const cases = [['examples/types/mindmap.json', 'plan', 'order-emails', 'checkout'], ['examples/types/aws.json', 'on-aws', 'nat-b', 'public-b'], ['examples/types/aws.json', 'on-aws', 'db', 'db-sg'],
    ['examples/types/azure.json', 'on-azure', 'az-rg', 'az-subscription'], ['examples/types/uml-use-case.json', 'shopping', 'browse', 'bookshop'], ['examples/types/c4.json', 'containers', 'storefront', 'bookshop'],
    ['examples/bookshop-c4.json', 'c4-deployment', 'c4-storefront-1', 'c4-browser'], ['examples/types/bpmn.json', 'order-to-shipment', 'basket-ready', 'bp-shopper'],
    ['examples/types/bpmn.json', 'order-to-shipment', 'order-received', 'bp-sales'], ['examples/types/uml-activity.json', 'fulfil', 'take-order', 'lane-desk'], ['examples/types/uml-activity.json', 'fulfil', 'take-order', 'lane-shop'],
    ['examples/types/uml-state-machine.json', 'order-life', 'picking', 'fulfilling.parcel'], ['examples/types/uml-state-machine.json', 'order-life', 'in-transit', 'delivery'],
    ['examples/types/uml-component.json', 'components', 'basket', 'shop-api'], ['examples/types/uml-composite-structure.json', 'inside', 'order-events', 'order-service'],
    ['examples/types/uml-deployment.json', 'production', 'browser', 'shopper-device'], ['examples/types/uml-deployment.json', 'production', 'storefront-js', 'browser'], ['examples/types/uml-package.json', 'packages', 'money', 'shared']];
  const name = (m, vid, id) => { const g = all.layout(m, vid), n = g.nodes.find(x => x.id === id) || (g.families || []).find(x => x.id === id);
    return n && n.aria ? n.aria : (all.svgOf(g).match(new RegExp(`data-family="${id}"[^>]*aria-label="([^"]*)"`)) || [])[1]; };
  for (const [f, vid, gone, owner] of cases) {
    const m = load(f), after = all.apply(m, [{ op: 'delete', id: gone }]), was = name(m, vid, owner), now = name(after, vid, owner), why = `${f} ${gone} in ${owner}`;
    assert.ok(was && now && was !== now, `${why}: the count changes (${was} / ${now})`);
    assert.equal(name(all.diff(m, after).model, vid, owner), now, why);
    assert.equal(name(all.diff(after, m).model, vid, owner), was, `${why}: an added one is counted`);
  }
});

test('audit 56: every count a name says on the diff page is the model after\'s: not a port, member, line or card diff() drew back removed, nor a card only taken out of the view; a box taken out counts what it held live in its owner', () => {
  const name = (m, vid, id) => { const g = all.layout(m, vid), n = [...g.nodes, ...(g.families || []), ...g.edges].find(x => x.id === id);
    return n && n.aria ? n.aria : (all.svgOf(g).match(new RegExp(`data-family="${id}"[^>]*aria-label="([^"]*)"`)) || [])[1]; };
  const del = (...ids) => () => ids.map(id => ({ op: 'delete', id })), hide = (view, ...ids) => () => ids.map(id => ({ op: 'hide', id, view }));
  const lines = (...ends) => m => m.edges.filter(e => ends.includes(e.from) || ends.includes(e.to)).map(e => ({ op: 'delete', id: e.id }));
  const also = (a, b) => m => [...a(m), ...b(m)];
  // [example, view, the change, the names it counts in]
  const cases = [
    // component and composite structure ports (finding 3), a collaboration use taken out of the view (4)
    ['examples/types/uml-component.json', 'components', del('shop-api.orders'), ['shop-api']], ['examples/types/uml-component.json', 'components', del('basket.orders'), ['basket']],
    ['examples/types/uml-composite-structure.json', 'inside', del('order-service.api'), ['order-service']], ['examples/types/uml-composite-structure.json', 'inside', del('checkout-flow.requests'), ['order-service.checkout']],
    ['examples/types/uml-composite-structure.json', 'inside', hide('inside', 'order-events'), ['order-service']],
    // a nested package or a deployment node taken out of the view: what it held counts in its owner, as the model after holds it (5)
    ['examples/types/uml-package.json', 'packages', hide('packages', 'card'), ['payments']], ['examples/types/uml-class.json', 'sales', hide('sales', 'card'), ['payments']],
    ['examples/types/uml-deployment.json', 'production', hide('production', 'app-server'), ['datacentre']], ['examples/types/aws.json', 'on-aws', hide('on-aws', 'region'), ['prod']],
    // a composite state's states are the model's: one only taken out of the view still counts (audit 55 counted it out)
    ['examples/types/uml-state-machine.json', 'order-life', hide('order-life', 'in-transit'), ['delivery']],
    // flowchart, data flow and information flow lines (8)
    ['examples/returns-flowchart.json', 'returns', del('resaleable-yes'), ['resaleable']], ['examples/returns-flowchart.json', 'returns', del('join-end'), ['end']],
    ['examples/bookshop-data-flow.json', 'dfd-level-1', del('dfd-basket'), ['dfd-take-order']], ['examples/types/dfd.json', 'level-1', hide('level-1', 'customer'), ['take-order']],
    ['examples/order-information-flow.json', 'order-flows', del('api-email'), ['receipt-info']],
    // activity and interaction overview lines, a partition's nodes, a connector's messages: the same rule
    ['examples/types/uml-activity.json', 'fulfil', hide('fulfil', 'ask-restock'), ['in-stock']], ['examples/types/uml-activity.json', 'fulfil', hide('fulfil', 'start'), ['lane-shop']],
    ['examples/types/uml-interaction-overview.json', 'buy-book', del('try-payment'), ['payment-ok']], ['examples/types/uml-communication.json', 'checkout', del('m-checkout'), ['c-shopper-storefront']],
    // BPMN: a removed lane, a removed group member, a task taken out of the view, a boundary event left alone (9)
    ['examples/types/bpmn.json', 'order-to-shipment', del('bp-picking'), ['bp-bookshop', 'bp-warehouse']], ['examples/types/bpmn.json', 'order-to-shipment', del('courier-pickup'), ['dispatch']],
    ['examples/types/bpmn.json', 'order-to-shipment', hide('order-to-shipment', 'count-stock'), ['bp-picking', 'bp-bookshop']], ['examples/types/bpmn.json', 'order-to-shipment', hide('order-to-shipment', 'bp-take-payment'), ['bp-sales']],
    ['examples/types/bpmn.json', 'order-to-shipment', del('a-note-card'), ['bp-sales']],
    // a mindmap topic taken out of the view, a leaf and one with subtopics (10)
    ['examples/types/mindmap.json', 'plan', hide('plan', 'first-titles'), ['catalogue']], ['examples/types/mindmap.json', 'plan', hide('plan', 'catalogue'), ['opening']],
    // SysML ports and parameters (11)
    ['examples/types/sysml-internal-block.json', 'inside-ebike', also(del('battery.bus'), lines('battery.bus')), ['ebike.battery']],
    ['examples/types/sysml-parametric.json', 'range', also(del('usable-energy.share'), lines('usable-energy.share')), ['ebike.usable']]];
  for (const [f, vid, ops, ids] of cases) {
    const m = load(f), after = all.apply(m, ops(m)), d = all.diff(m, after).model, back = all.diff(after, m).model;
    for (const id of ids) { const was = name(m, vid, id), now = name(after, vid, id), why = `${f} ${vid}: ${id}`;
      assert.ok(was && now, `${why} is named (${was} / ${now})`);
      assert.equal(name(d, vid, id), now, why);
      assert.equal(name(back, vid, id), was, `${why}: what comes back is counted`); }
  }
  // a box that holds only removed cards says no count, as the model after's says none; one itself removed, what it held (7)
  const uc = load('examples/types/uml-use-case.json'), held = uc.nodes.filter(n => n.parent === 'bookshop').map(n => n.id);
  assert.equal(name(all.diff(uc, all.apply(uc, del(...held)())).model, 'shopping', 'bookshop'), 'Subject Online bookshop');
  assert.equal(name(all.diff(uc, all.apply(uc, del('bookshop', ...held)())).model, 'shopping', 'bookshop'), name(uc, 'shopping', 'bookshop'));
  const sm = load('examples/types/uml-state-machine.json'), parcel = sm.nodes.filter(n => n.parent === 'fulfilling.parcel').map(n => n.id);
  assert.equal(name(all.diff(sm, all.apply(sm, del(...parcel)())).model, 'order-life', 'fulfilling.parcel'), 'Region Parcel of Fulfilling');
});

// audit 60's known gap of 0.45.0 (docs/diagrams/notes/typed-repoint.md): in a typed view that lists its lines, a line re-pointed
// while the view stopped listing it, or while its old end left the view, was drawn back removed under the model line's id between
// its old ends, and validate() said the id was used twice. Its copy now has an id of its own, the line's id and "~old"; a view
// that numbers its steps (a C4 dynamic view, whose step names a model relationship) draws none and says it is taken out
test('known gap of 0.45.0: a typed view\'s re-pointed line it stopped listing or lost an end of comes back under a free id, or not at all in a C4 dynamic view; the diff model validates', () => {
  const quiet = f => { const k = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = k; } };
  const twice = m => quiet(() => all.validate(m)).filter(p => p.level === 'error' && /used twice|needs an id/.test(p.message)).map(p => p.message);
  const files = ['c4-gallery', 'sysml-block-definition', 'uml-class', 'uml-communication', 'uml-deployment', 'uml-package'].map(f => `tests/fixtures/${f}.json`); // copies of the gallery models
  let cases = 0;
  for (const f of files) { const M = load(f);
    M.views.forEach((v, vi) => { if (!Array.isArray(v.edges)) return; const lid = v.edges.find(x => typeof x === 'string' && M.edges.some(e => e.id === x && v.nodeIds.includes(e.to)));
      if (!lid) return; const e = M.edges.find(x => x.id === lid), type = id => (M.nodes.find(n => n.id === id) || {}).type;
      const to = M.nodes.find(n => n.id !== e.to && n.id !== e.from && n.type === type(e.to)); if (!to) return;
      for (const hide of [false, true]) {
        const b = edit(M, x => { x.edges.find(y => y.id === lid).to = to.id; x.views[vi].edges = x.views[vi].edges.filter(y => y !== lid); if (hide) x.views[vi].nodeIds = x.views[vi].nodeIds.filter(y => y !== e.to); });
        const d = quiet(() => all.diff(M, b)), tag = `${f} ${v.id} ${lid}${hide ? ' with its old end hidden' : ''}`; cases++;
        assert.deepEqual(twice(d.model), [], tag);
        const own = d.model.views[vi].edges.filter(x => x && typeof x === 'object' && x.type === e.type && x.from === e.from && x.to === e.to && x.change === 'removed');
        if (v.diagram === 'c4.dynamic') assert.deepEqual(own, [], tag + ': no step of its own');
        else assert.deepEqual(own.map(x => x.id), [`${lid}~old`], tag);
        if (!hide) assert.ok(d.summary.some(s => s.startsWith('takes the line from ') && s.includes(' out of the view ')), tag + ': said');
      } }); }
  assert.ok(cases >= 20, `every view tried (${cases})`);
  // drawn removed between its old ends, under its own id; an id the model holds already is passed over
  const C = load('tests/fixtures/uml-class.json'), B = edit(C, x => { x.edges.find(y => y.id === 'customer-orders').to = 'line'; x.views[0].edges = x.views[0].edges.filter(y => y !== 'customer-orders'); });
  const g = quiet(() => all.layout(all.diff(C, B).model, 'sales'));
  assert.deepEqual(g.edges.filter(x => x.change).map(x => [x.id, x.from, x.to, x.change]), [['customer-orders~old', 'customer', 'order', 'removed']]);
  const held = edit(C, x => { x.nodes.find(n => n.id === 'note-total').id = 'customer-orders~old'; x.edges.forEach(y => { if (y.from === 'note-total') y.from = 'customer-orders~old'; }); x.views.forEach(w => { w.nodeIds = w.nodeIds.map(i => i === 'note-total' ? 'customer-orders~old' : i); }); });
  const d2 = quiet(() => all.diff(held, edit(held, x => { x.edges.find(y => y.id === 'customer-orders').to = 'line'; x.views[0].edges = x.views[0].edges.filter(y => y !== 'customer-orders'); })));
  assert.deepEqual(twice(d2.model), []); assert.ok(d2.model.views[0].edges.some(x => x && x.id === 'customer-orders~old2'));
});

test('a typed model deleted (after null) keeps its schemaVersion and own fields, as one added does: its views draw typed (audit 73)', () => {
  const typed = readdirSync(new URL('fixtures/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => [f, load('tests/fixtures/' + f)]).filter(([, m]) => m.schemaVersion === 2);
  assert.ok(typed.length > 10);
  const own = x => Object.fromEntries(Object.entries(x).filter(([k]) => !['nodes', 'edges', 'views', 'rules', 'stories', 'lenses'].includes(k)));
  for (const [f, m] of typed) {
    const gone = all.diff(m, null), born = all.diff(null, m);
    assert.equal(gone.model.schemaVersion, 2, f); assert.equal(born.model.schemaVersion, 2, f);
    assert.deepEqual(own(gone.model), own(m), f);
    assert.deepEqual(gone.model.views.map(v => v.diagram), m.views.map(v => v.diagram), f);
    assert.ok(gone.model.nodes.every(n => n.change === 'removed'), f);
  }
});
