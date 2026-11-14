// The Bookshop atlas (0.21.0; the 14 UML types since 0.23.0; ER, flowchart, data flow, information flow and C4 since 0.24.0): examples/bookshop-atlas.json is what tools/atlas.mjs builds from the Bookshop examples and
// tools/atlas-links.json, byte for byte, so it cannot drift from them. It validates with no core error, every view lays
// out as in its own file, and every drill-down opens a view of the atlas: each link of the links file, the files' own, and
// no other. From the C4 context, the root since 0.24.0, and the map a reader reaches every view. An element is shared by id: the files that have it agree on it, or
// the build stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/map/typed.js';
import '../src/typed/layout.js';
import '../src/typed/draw.js';
import '../src/uml/class.js';
import '../src/uml/object.js';
import '../src/uml/package.js';
import { sqRemove } from '../src/uml/sequence.js';
import '../src/uml/communication.js';
import '../src/uml/usecase.js';
import '../src/uml/activity.js';
import '../src/uml/state.js';
import '../src/uml/overview.js';
import '../src/uml/component.js';
import '../src/uml/deployment.js';
import '../src/uml/composite.js';
import '../src/uml/profile.js';
import '../src/uml/timing.js';
import '../src/er/er.js';
import '../src/flowchart/flowchart.js';
import '../src/dfd/dfd.js';
import '../src/uml/information.js';
import '../src/c4/c4.js';
import '../src/c4/views.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { apply } from '../src/core/apply.js';
import { diagramOf } from '../src/core/registry.js';
import { appliedOf } from '../src/uml/stereotypes.js';
import { build } from '../tools/atlas.mjs';

const LINKS = JSON.parse(readFileSync(new URL('../tools/atlas-links.json', import.meta.url), 'utf8'));
const { model: M, shared, text } = build();
const id = ref => ref.slice(ref.indexOf('/') + 1);

test('the committed atlas is what tools/atlas.mjs builds, byte for byte', () => {
  assert.equal(readFileSync(new URL('../examples/bookshop-atlas.json', import.meta.url), 'utf8'), text,
    'examples/bookshop-atlas.json is stale: run node tools/atlas.mjs and commit it');
  assert.deepEqual(build().text, text); // the same on every run
  // one Order, one package sales: the class and package files' 14 elements, and the 5 lifelines the sequence,
  // communication and overview files share; one Shop API, its jar and where the jar runs: the component and deployment
  // files' 6 (0.22.0); the profile file's sales, Order and its placedAt, the profile and its application the package file
  // shows, and the timing file's two lifelines, the overview's worker and the sequence's payments (0.23.0); the information
  // flow file's shopper (the use case file's actor) and the component file's storefront, Shop API and payment provider
  // (0.24.0, notes/milestone-2.md §12.5)
  assert.deepEqual(shared.map(x => x.id), ['sales', 'shared', 'catalog', 'payments-package', 'card', 'customer', 'order', 'order.placedAt', 'line',
    'book', 'payable', 'payment', 'card-payment', 'status', 'money', 'conventions', 'sales-applies-conventions', 'lifeline-shopper',
    'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt', 'shopper', 'lifeline-worker', 'storefront-component', 'shop-api',
    'payment-provider-component', 'order-worker', 'shop-api-jar', 'app-server',
    'jvm', 'api-jar-manifests-api']);
  const ids = [...M.nodes, ...M.edges, ...M.views.flatMap(v => [...(v.edges || []).filter(e => typeof e === 'object'), ...(v.fragments || [])])].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'every element id once');
  assert.equal(new Set(M.views.map(v => v.id)).size, M.views.length, 'every view id once');
});

test('the atlas validates with no core error; the UML rules find only what two files in one model raise', () => {
  const said = validate(M); // with a profile in the model, no stereotype rule speaks: not on a stored keyword (order-uses-money's «use»)
  assert.deepEqual(said.filter(p => p.level === 'error' && !p.rule), []);
  // the class type's rules run on the whole model: a generalization between two actors or two use cases is not one
  // between classifiers to them (the decision in docs/module-api.md's 0.21.0 section); nor is an interface realization from
  // a component or a port (realization-target, the class type's rule; the component type's provided-ends allows both, 0.22.0)
  assert.deepEqual(said.map(p => [p.level, p.rule, p.ids]), [
    ['error', 'generalization-kinds', ['member-is-shopper', 'member', 'shopper']],
    ['error', 'generalization-kinds', ['card-is-pay', 'pay-by-card', 'pay']],
    ['error', 'realization-target', ['api-provides-orders', 'shop-api.orders', 'i-orders']],
    ['error', 'realization-target', ['accounts-provides-sign-in', 'accounts-component', 'i-sign-in']],
    // as in examples/order-service-structure.json alone: two parts typed by classes the model does not hold
    ['warning', 'part-type', ['order-service.orders', 'order-service']], ['warning', 'part-type', ['order-service.listeners', 'order-service']]]);
});

test('every view lays out; check() finds only the crossings its own file keeps', () => {
  const found = [];
  for (const v of M.views) {
    const g = layout(M, v.id);
    assert.ok(g.nodes.length > 0 && g.edges.every(e => e.pts.length >= 2), v.id);
    found.push(...check(M, v.id).map(p => p.message));
  }
  // fulfil-activity's 2 and order-states' 2, as the CI loop counts them on their own files' plain pass; bookshop-c4's 8
  // and bookshop-data-flow's 2, as their own files' (0.24.0, repair and reroute off: notes/milestone-2.md §11)
  assert.ok(found.every(p => / cross$/.test(p)), found.join('\n'));
  const own = name => { const src = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    return src.views.flatMap(v => check(src, v.id).map(p => p.message)); };
  assert.deepEqual(found, ['fulfil-activity', 'order-states', ...LINKS.sources.slice(-5)].flatMap(own));
  assert.deepEqual(found.map(p => p.split(':')[0]), ['view fulfil', 'view fulfil', 'view order-life', 'view order-life',
    ...Array(3).fill('view c4-containers'), ...Array(2).fill('view c4-components'), ...Array(2).fill('view c4-placing-an-order'),
    'view c4-deployment', 'view dfd-level-1', 'view dfd-level-1']);
});

test('every drill-down opens a view of the atlas: the links file\'s, the files\' own, and no other', () => {
  const ctx = mapContext(M), opens = [];
  for (const v of M.views) for (const n of v.nodeIds) { const o = ctx.opensOf(n, v.id); if (o) opens.push([v.id, n, o]); }
  opens.forEach(([v, n, o]) => assert.ok(ctx.V[o], `${n} in ${v} opens ${o}, no view of the atlas`));
  LINKS.links.forEach(l => { const n = id(l.element), to = id(l.opens), on = opens.filter(x => x[1] === n);
    assert.ok(on.length && on.every(x => x[2] === to), `${l.element} opens ${l.opens} (${n} → ${to}) in every view that shows it: ${JSON.stringify(on)}`); });
  // a view of another kind of diagram opens and never unfolds in place (src/map/context.js); one of the same kind may
  // (fulfil's Take payment)
  const across = opens.filter(([v, , o]) => ctx.V[o].diagram !== ctx.V[v].diagram);
  assert.ok(across.length); across.forEach(([v, n]) => assert.equal(ctx.unfoldable(n, v), null, `${n} in ${v}`));
  assert.equal(ctx.unfoldable(id('fulfil-activity/call-payment'), 'fulfil'), 'take-payment');
  // a node opens a view by its opensView, or by being that view's id: only the map's Shop API, as in bookshop.json
  assert.deepEqual([...new Set(opens.filter(([, n]) => M.nodes.find(x => x.id === n).opensView == null).map(([, n, o]) => `${n}>${o}`))], ['api>api']);
  // from the map, every view but the C4 views and those only they open (0.24.0): by what opens it, or as a view's child
  const next = new Map(M.views.map(v => [v.id, new Set([...opens.filter(x => x[0] === v.id).map(x => x[2]), ...M.views.filter(w => w.parent === v.id).map(w => w.id)])]));
  const reach = from => { const seen = new Set([from]); for (const v of seen) next.get(v).forEach(w => seen.add(w)); return seen; };
  const NEW = ['c4-context', 'c4-containers', 'c4-components', 'c4-placing-an-order', 'c4-deployment', 'er-schema', 'returns', 'dfd-level-1',
    'dfd-level-2-take-order', 'order-flows'];
  assert.deepEqual([...reach('overview')].sort(), M.views.map(v => v.id).filter(v => !NEW.includes(v)).sort());
  // the root is the C4 context (decision 20): from it every milestone 2 view, and through its links the UML views they
  // open; the map's overview from the views list
  assert.equal(M.root, 'c4-context');
  assert.deepEqual([...reach(M.root)].filter(v => NEW.includes(v)).sort(), [...NEW].sort());
  assert.deepEqual([...new Set([...reach(M.root), ...reach('overview')])].sort(), M.views.map(v => v.id).sort());
  // the journeys the gallery names: map → classes → an order's state machine; use cases → activity → sequence; map's hosts
  // → deployment → components → the order service's structure (0.22.0)
  const step = (a, b) => assert.ok(next.get(a).has(b), `${a} opens ${b}`);
  step('overview', 'domain'); step('domain', 'order-life');
  step('overview', 'shopping'); step('shopping', 'take-payment'); step('take-payment', 'checkout-sequence');
  step('overview', 'production'); step('production', 'components'); step('components', 'internals');
  // the package view's profile opens the profile view; Take payment's "Record the payment" the timing view (0.23.0)
  step('overview', 'packages'); step('packages', 'profile'); step('take-payment', 'one-charge');
  // C4 down its levels, and out of them to the views each element's design is in (0.24.0, notes/milestone-2.md §12.5)
  step('c4-context', 'c4-containers'); step('c4-containers', 'c4-components'); step('c4-context', 'c4-deployment');
  step('c4-context', 'shopping'); step('c4-context', 'returns'); step('c4-containers', 'er-schema'); step('c4-containers', 'fulfil');
  step('c4-containers', 'order-flows'); step('c4-components', 'checkout-sequence'); step('c4-components', 'dfd-level-1');
  step('c4-deployment', 'production'); step('dfd-level-1', 'dfd-level-2-take-order');
});

test('the atlas holds a view of each of the 14 UML diagram kinds, information flow, ER, flowchart, data flow and C4\'s six; describe() and the PDF\'s tables read every view', () => {
  assert.deepEqual([...new Set(M.views.map(v => v.diagram).filter(d => d?.startsWith('uml.')))].sort(), ['uml.activity', 'uml.class',
    'uml.communication', 'uml.component', 'uml.composite-structure', 'uml.deployment', 'uml.information-flow', 'uml.interaction-overview', 'uml.object', 'uml.package',
    'uml.profile', 'uml.sequence', 'uml.state-machine', 'uml.timing', 'uml.use-case']);
  // C4's landscape view is not in the Bookshop: one software system of its own, so its context view says what a landscape would
  assert.deepEqual([...new Set(M.views.map(v => v.diagram).filter(d => d && !d.startsWith('uml.')))].sort(), ['c4.component', 'c4.container',
    'c4.context', 'c4.deployment', 'c4.dynamic', 'dfd', 'er', 'flowchart']);
  const ctx = mapContext(M);
  for (const v of M.views) { assert.ok(describe(M, v.id).length, v.id); assert.ok(tablesOf(ctx, ctx.V[v.id], ctx.buildGeo(v.id)).length, v.id); }
});

test('the five milestone 2 examples pass their types\' validate, each on its own and in the atlas: no problem at any level (0.24.0)', () => {
  for (const name of LINKS.sources.slice(-5)) {
    const src = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(validate(src), [], name);
    for (const v of src.views) {
      const T = diagramOf(v);
      assert.ok(T && T.validate, `${name} view ${v.id}: ${v.diagram} is registered`);
      assert.deepEqual(T.validate(src, v), [], `${name} view ${v.id}`);
      assert.deepEqual(T.validate(M, M.views.find(w => w.id === v.id)), [], `${name} view ${v.id} in the atlas`);
    }
  }
});

test('the profile in the atlas: «owned», required on Class, is supplied to exactly the classes of sales; placedAt\'s «column» and tags are the model\'s, and the class view reads as its own file', () => {
  const all = M.nodes.flatMap(n => [n, ...(n.members || [])]);
  assert.deepEqual(all.filter(n => appliedOf(M, n.id).some(e => e.key === 'owned')).map(n => n.id), ['customer', 'order', 'line']);
  const placedAt = M.nodes.find(n => n.id === 'order').members.find(m => m.id === 'order.placedAt');
  assert.deepEqual([placedAt.props.stereotypes, placedAt.props.tags], [['column'], { column: { name: 'placed_at', indexed: 'true' } }]);
  // the class view leaves member stereotypes undrawn, so its describe() and PDF rows are the class file's
  const S = JSON.parse(readFileSync(new URL('../examples/sales-classes.json', import.meta.url), 'utf8'));
  const rows = m => { const c = mapContext(m); return tablesOf(c, c.V.domain, c.buildGeo('domain')); };
  assert.equal(describe(M, 'domain'), describe(S, 'domain'));
  assert.deepEqual(rows(M), rows(S));
});

test('deleting lifeline-worker from the sequence view (Shift + Delete) takes its timing changes and their constraints', () => {
  const r = sqRemove(M, M.views.find(v => v.id === 'queue-order'), ['lifeline-worker'], true);
  const n = apply(M, Array.isArray(r) ? r : r.commands), tl = n.views.find(v => v.id === 'one-charge').timeline;
  assert.deepEqual(validate(n).filter(p => p.level === 'error' && !p.rule), []);
  assert.deepEqual([tl.changes.map(c => c.lifeline), tl.constraints], [Array(4).fill('lifeline-payments'), []]);
  assert.ok(!n.nodes.some(x => x.id === 'lifeline-worker'));
});

test('every view lays out in the atlas as in its own file: the same boxes, and lines through the same points', () => {
  for (const name of LINKS.sources) {
    const src = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    const pic = g => ({ nodes: g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), edges: g.edges.map(e => [e.from, e.to, e.pts]) });
    for (const v of src.views) assert.deepEqual(pic(layout(M, v.id)), pic(layout(src, v.id)), `${name} view ${v.id}`);
  }
});

// two small files, as build() reads them
const two = (a, b) => build({ title: 't', root: 'a/v', sources: ['a', 'b'], links: [] },
  name => ({ a: { nodes: a, views: [{ id: 'v', nodeIds: [] }] }, b: { nodes: b, views: [] } })[name]);
const order = (...members) => ({ id: 'order', type: 'uml.Class', label: 'Order', members: members.map(id => ({ id, type: 'uml.Property', label: id })) });

test('the files share an element by id: its members are the union of theirs, each written once', () => {
  const { model, shared } = two([{ ...order('id', 'total'), props: { isAbstract: true } }], [{ ...order('total', 'count'), props: { stereotypes: ['entity'] } }]);
  assert.deepEqual(model.nodes, [{ ...order('id', 'total', 'count'), props: { isAbstract: true, stereotypes: ['entity'] } }]);
  assert.deepEqual(shared.map(x => [x.id, x.files]), [['order', ['a', 'b']], ['total', ['a', 'b']]]);
});

test('the build stops where the files disagree on an element, naming it, the files and the field', () => {
  assert.throws(() => two([order()], [{ ...order(), label: 'Purchase' }]), /order in a and b disagree on its label: "Order" against "Purchase"/);
  assert.throws(() => two([order()], [{ ...order(), parent: 'sales' }]), /order in a and b disagree on its parent/);
  assert.throws(() => two([order('total')], [{ ...order('total'), members: [{ id: 'total', type: 'uml.Operation' }] }]), /member total of order in a and b disagree on its type/);
  assert.throws(() => two([order()], [{ id: 'order', type: 'uml.ObjectNode' }]), /disagree on its type: "uml.Class" against "uml.ObjectNode"/);
  assert.throws(() => two([], [{ id: 'v', type: 'uml.Class' }]), /node v in b would open a's view v/);
  assert.throws(() => two([{ id: 'a', props: { owner: 'a' } }], []), /owner/); // a field the atlas does not know
  // a timing view's changes and constraints are the view's own elements, with their own fields (0.23.0)
  const timed = timeline => build({ title: 't', root: 'a/v', sources: ['a', 'b'], links: [] },
    name => ({ a: { nodes: [order()], views: [{ id: 'v', nodeIds: [] }] }, b: { views: [{ id: 'w', nodeIds: [], timeline }] } })[name]);
  assert.throws(() => timed({ changes: [{ id: 'order', lifeline: 'x', at: 0 }] }), /order is a node in a and in view w in b/);
  assert.throws(() => timed({ scale: 2 }), /scale/);
});
