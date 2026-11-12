// diff() and drift() (#66, #68): models marked with what the map draws already, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diff, drift, validate, layout } from '../lib/umlimator.js';

const bike = JSON.parse(readFileSync(new URL('../examples/bike-share.json', import.meta.url)));
// a made-up pull request on the bike share: a queue between Trips and Payments, a rename, a card gone, a line relabelled
const next = (() => {
  const m = structuredClone(bike), sys = m.views.find(v => v.id === 'system');
  m.nodes.push({ id: 'pay-queue', label: 'Payments queue', kind: 'queue' });
  sys.nodeIds.push('pay-queue'); sys.layout['pay-queue'] = [3, 3]; sys.layout.payments = [5, 3];
  m.edges = m.edges.filter(e => e.id !== 's9');
  m.edges.push({ id: 'q1', from: 'trips', to: 'pay-queue', label: 'charges' }, { id: 'q2', from: 'pay-queue', to: 'payments', label: 'charges' });
  m.nodes.find(n => n.id === 'accounts').label = 'Accounts and sign-in';
  m.edges.find(e => e.id === 's7').label = 'quotes a ride';
  m.nodes = m.nodes.filter(n => n.id !== 'flags'); sys.nodeIds = sys.nodeIds.filter(id => id !== 'flags'); delete sys.layout.flags;
  return m;
})();

test('diff() says what changed in words, marks it on the after model, and names the views that show it', () => {
  const d = diff(bike, next), card = id => d.model.nodes.find(n => n.id === id), line = id => d.model.edges.find(e => e.id === id);
  assert.deepEqual(d.summary, [
    'renames Accounts to Accounts and sign-in',
    'adds Payments queue between Trip service and Payment provider',
    'removes Feature flags',
    'changes the line from Trip service to Pricing (label prices a ride → quotes a ride)',
    'removes the line from Trip service to Payment provider (charges)',
  ]);
  assert.deepEqual(d.views, ['system']);
  assert.deepEqual([card('pay-queue').change, card('accounts').change, card('flags').change, card('trips').change], ['added', 'changed', 'removed', undefined]);
  assert.deepEqual([line('q1').style, line('s9').style, line('s7').edited, line('s3').style], ['added', 'removed', true, undefined]);
  const sys = d.model.views.find(v => v.id === 'system'), was = bike.views.find(v => v.id === 'system');
  assert.ok(sys.nodeIds.includes('flags'), 'a removed card stays in its view');
  assert.deepEqual(sys.layout.flags, was.layout.flags, '…in its place');
  assert.deepEqual(validate(d.model), []);
  assert.deepEqual(next, (() => { const n = structuredClone(next); diff(bike, n); return n; })(), 'its inputs are left as they were');
});

test('diff() of a model with itself changes nothing; from nothing, everything is new; to nothing, everything is gone', () => {
  const same = diff(bike, bike);
  assert.deepEqual([same.summary, same.views], [[], []]);
  assert.deepEqual(same.model, bike);
  const born = diff(null, { nodes: [{ id: 'a', label: 'A' }], edges: [], views: [{ id: 'v', nodeIds: ['a'] }] });
  assert.deepEqual([born.summary, born.views, born.model.nodes[0].change], [['adds the view v', 'adds A'], ['v'], 'added']);
  const gone = diff({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', title: 'Vee', nodeIds: ['a', 'b'] }] }, null);
  assert.deepEqual(gone.summary, ['removes the view Vee', 'removes A', 'removes B']);
  assert.deepEqual([gone.views, gone.model.edges[0].style], [['v'], 'removed']);
});

test('diff() marks a card put into a view or taken out of one there only, and a view\'s own cards and lines', () => {
  const base = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'b' }],
    views: [{ id: 'one', title: 'One', nodeIds: ['a', 'b', 'c'] }, { id: 'two', title: 'Two', nodeIds: ['a'], nodes: [{ id: 'x', label: 'X' }],
      edges: [{ from: 'a', to: 'x', label: 'old' }] }] };
  const after = structuredClone(base);
  after.views[0].nodeIds = ['a', 'b']; after.views[1].nodeIds = ['a', 'c'];
  after.views[1].nodes = [{ id: 'y', label: 'Y' }]; after.views[1].edges = [{ from: 'a', to: 'y' }];
  const d = diff(base, after), [one, two] = d.model.views;
  assert.deepEqual(d.summary, ['adds Y, from A', 'removes X', 'takes C out of the view One', 'puts C in the view Two']);
  assert.deepEqual([one.nodeOverrides.c.change, two.nodeOverrides.c.change, d.model.nodes.find(n => n.id === 'c').change], ['removed', 'added', undefined]);
  assert.deepEqual(two.edges.map(e => e.style), ['added', 'removed']);
  assert.deepEqual(d.views, ['one', 'two']);
});

test('drift() brings in the lines traffic ran on but nobody drew, fades the drawn ones that carried nothing, and counts', () => {
  const seen = { data: [
    { parent: 'rider-app', child: 'trip-service', callCount: 51200 },   // drawn (s3): carried
    { parent: 'ops-console', child: 'trips-db', callCount: 1500 },      // not drawn: comes in
    { parent: 'Fleet Service', child: 'charging', callCount: 0 },       // drawn (s17), by label in any case, but no calls: idle
    { parent: 'ops-console', child: 'fleet-service', callCount: 310 },  // drawn (s6): carried
    { parent: 'cdn', child: 'rider-app', callCount: 40 },               // no card for cdn
  ] };
  const r = drift(bike, seen, { match: { 'trip-service': 'trips', 'fleet-service': 'fleet', 'trips-db': 'tripsdb' } });
  assert.deepEqual(r.counts, { carried: 2, undrawn: 1, idle: 3, unknown: 43, unmatched: ['cdn'] }); // 40 model lines, and the 8 of the trace's view (#96)
  const came = r.model.edges.filter(e => e.drift === 'undrawn'), idle = r.model.edges.filter(e => e.drift === 'idle').map(e => e.id);
  assert.deepEqual(came, [{ id: 'drift:ops-console->tripsdb', from: 'ops-console', to: 'tripsdb', label: 'not drawn', sublabel: '1,500 calls', style: 'security', drift: 'undrawn' }]);
  assert.deepEqual(idle, ['s8', 's12', 's17']); // trips→tripsdb and fleet→ops-console: both ends had traffic, these lines none
  assert.ok(r.model.edges.filter(e => e.drift === 'idle').every(e => e.style === 'faded'));
  assert.deepEqual(r.views, ['system']);
  assert.deepEqual(validate(r.model), []);
  assert.deepEqual(drift(bike, [{ from: 'trips', to: 'pricing' }]).counts.carried, 1, 'a plain list, without counts');
});

test('a line that stands for several edges shows the strongest of their marks, and fades only when all of them are idle', () => {
  const ab = (a, b) => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b', ...a }, { id: 'ba', from: 'b', to: 'a', ...b }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  const line = m => { const g = layout(m, 'v'); assert.equal(g.edges.length, 1, 'A→B and B→A draw as one line'); return g.edges[0]; };
  assert.equal(line(ab({}, { style: 'added' })).style, 'added', 'added wins over a plain first edge');
  assert.equal(line(ab({ style: 'added' }, { style: 'removed' })).style, 'removed', 'removed wins over added');
  assert.equal(line(ab({ edited: true }, { style: 'security', drift: 'undrawn' })).style, 'security', 'undrawn wins over changed');
  const both = line(ab({ edited: true, change: 'changed' }, { style: 'added' }));
  assert.deepEqual([both.style, both.strong], ['added', true], 'added wins over changed, whose dot it hides');
  assert.equal(line(ab({ style: 'faded', drift: 'idle' }, {})).style, undefined, 'one edge idle, one not: not faded');
  assert.equal(line(ab({ style: 'faded', drift: 'idle' }, { style: 'faded', drift: 'idle' })).style, 'faded', 'both idle: faded');
  assert.equal(line(ab({ style: 'faded' }, { style: 'emphasis' })).style, 'emphasis', 'a style that is no mark, when not all are idle');
  // drift counts model edges: here 1 idle edge, drawn inside a line that carried traffic, so no line fades
  const r = drift(ab({}, {}), [{ from: 'a', to: 'b', count: 5 }, { from: 'b', to: 'a', count: 0 }]);
  assert.deepEqual([r.counts.carried, r.counts.idle, line(r.model).style], [1, 1, undefined]);
});

test('diff() says a re-own on a class model in words: an element moved into a package, or out of one (M11)', () => {
  const sales = JSON.parse(readFileSync(new URL('../examples/sales-classes.json', import.meta.url))), after = structuredClone(sales), at = id => after.nodes.find(n => n.id === id);
  after.nodes.push({ id: 'billing', type: 'uml.Package', label: 'billing' });
  at('payment').parent = 'billing'; delete at('money').parent; at('book').parent = 'billing'; at('book').label = 'Title';
  const d = diff(sales, after);
  assert.deepEqual(d.summary, ['renames Book to Title (parent)', 'moves Payment into billing', 'moves Money out of sales', 'adds billing']);
  assert.deepEqual(['payment', 'money'].map(id => d.model.nodes.find(n => n.id === id).change), ['changed', 'changed']);
});
