// The Bookshop atlas (0.21.0): examples/bookshop-atlas.json is what tools/atlas.mjs builds from the Bookshop examples and
// tools/atlas-links.json, byte for byte, so it cannot drift from them. It validates with no core error, every view lays
// out as in its own file, and every drill-down opens a view of the atlas: each link of the links file, the files' own, and
// no other. From the map a reader reaches every view. An element is shared by id: the files that have it agree on it, or
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
import '../src/uml/sequence.js';
import '../src/uml/communication.js';
import '../src/uml/usecase.js';
import '../src/uml/activity.js';
import '../src/uml/state.js';
import '../src/uml/overview.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { build } from '../tools/atlas.mjs';

const LINKS = JSON.parse(readFileSync(new URL('../tools/atlas-links.json', import.meta.url), 'utf8'));
const { model: M, shared, text } = build();
const id = ref => ref.slice(ref.indexOf('/') + 1);

test('the committed atlas is what tools/atlas.mjs builds, byte for byte', () => {
  assert.equal(readFileSync(new URL('../examples/bookshop-atlas.json', import.meta.url), 'utf8'), text,
    'examples/bookshop-atlas.json is stale: run node tools/atlas.mjs and commit it');
  assert.deepEqual(build().text, text); // the same on every run
  // one Order, one package sales: the class and package files' 14 elements, and the 5 lifelines the sequence,
  // communication and overview files share
  assert.deepEqual(shared.map(x => x.id), ['sales', 'shared', 'catalog', 'payments-package', 'card', 'customer', 'order', 'line', 'book',
    'payable', 'payment', 'card-payment', 'status', 'money', 'lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt']);
  const ids = [...M.nodes, ...M.edges, ...M.views.flatMap(v => [...(v.edges || []).filter(e => typeof e === 'object'), ...(v.fragments || [])])].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'every element id once');
  assert.equal(new Set(M.views.map(v => v.id)).size, M.views.length, 'every view id once');
});

test('the atlas validates with no core error; the UML rules find only what two files in one model raise', () => {
  const said = validate(M);
  assert.deepEqual(said.filter(p => p.level === 'error' && !p.rule), []);
  // the class type's rules run on the whole model: a generalization between two actors or two use cases is not one
  // between classifiers to them (the decision in docs/module-api.md's 0.21.0 section)
  assert.deepEqual(said.map(p => [p.level, p.rule, p.ids]), [
    ['error', 'generalization-kinds', ['member-is-shopper', 'member', 'shopper']],
    ['error', 'generalization-kinds', ['card-is-pay', 'pay-by-card', 'pay']]]);
});

test('every view lays out; check() finds only the crossings its own file keeps', () => {
  const found = [];
  for (const v of M.views) {
    const g = layout(M, v.id);
    assert.ok(g.nodes.length > 0 && g.edges.every(e => e.pts.length >= 2), v.id);
    found.push(...check(M, v.id).map(p => p.message));
  }
  // fulfil-activity's 2 and order-states' 2, as the CI loop counts them on their own files' plain pass
  assert.ok(found.every(p => / cross$/.test(p)), found.join('\n'));
  assert.deepEqual(found.map(p => p.split(':')[0]), ['view fulfil', 'view fulfil', 'view order-life', 'view order-life']);
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
  // from the map, every view: by what opens it, or as a view's child
  const next = new Map(M.views.map(v => [v.id, new Set([...opens.filter(x => x[0] === v.id).map(x => x[2]), ...M.views.filter(w => w.parent === v.id).map(w => w.id)])]));
  const reach = from => { const seen = new Set([from]); for (const v of seen) next.get(v).forEach(w => seen.add(w)); return seen; };
  assert.deepEqual([...reach(M.root)].sort(), M.views.map(v => v.id).sort());
  // the journeys the gallery names: map → classes → an order's state machine; use cases → activity → sequence
  const step = (a, b) => assert.ok(next.get(a).has(b), `${a} opens ${b}`);
  step('overview', 'domain'); step('domain', 'order-life');
  step('overview', 'shopping'); step('shopping', 'take-payment'); step('take-payment', 'checkout-sequence');
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
});
