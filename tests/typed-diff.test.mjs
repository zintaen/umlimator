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

test('maps diff as before, and lib/umlimator.js (no typed words) says what it said', () => {
  const bike = load('examples/bike-share.json');
  assert.deepEqual(all.diff(bike, edit(bike, m => m.edges.reverse())).summary, []);
  const b = edit(bike, m => { m.nodes[0].label = 'X'; });
  assert.deepEqual(all.diff(bike, b), core.diff(bike, b));
  assert.deepEqual(core.diff(seq, edit(seq, m => swap(m.views[0].edges, 2, 3))).summary, []);
});

test('paths() on a sequence view runs in time order; on other views as before', () => {
  const ids = r => r.map(x => x.id || x.ids[0]);
  assert.deepEqual(ids(all.paths(seq, 'checkout-sequence', 'lifeline-shopper', 'receipt')),
    ['lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt', 'm1', 'm2', 'm4', 'm5', 'm6']);
  assert.deepEqual(all.paths(seq, 'checkout-sequence', 'receipt', 'lifeline-shopper'), []); // receipt sends nothing
  assert.deepEqual(all.paths(seq, 'checkout-sequence', 'lifeline-api', 'lifeline-api'), [{ type: 'node', id: 'lifeline-api', view: 'checkout-sequence' }]); // as on a map
  const bike = load('examples/bike-share.json'), v = bike.views[0], [a, b] = v.nodeIds;
  assert.deepEqual(all.paths(bike, v.id, a, b), core.paths(bike, v.id, a, b));
});

test('a sequence view: a removed message comes back in its place, inside its operand, and an interaction use is named by its label (audit 2)', () => {
  const d = all.diff(seq, all.apply(seq, { op: 'delete', id: 'receipt' }));
  assert.deepEqual(d.model.views[0].edges.map(e => e.id ?? e), seq.views[0].edges.map(e => e.id ?? e));
  assert.deepEqual(all.validate(d.model).filter(p => p.level === 'error'), []);
  assert.deepEqual(d.summary, ['removes receipt', 'changes Send receipt email (props)']);
});
