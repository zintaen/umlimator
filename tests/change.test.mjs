// diff() and drift() (#66, #68): models marked with what the map draws already, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diff, drift, validate, layout } from '../lib/umlimator.js';
import { svgOf } from '../src/draw/svg.js';

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
    'moves Payment provider in the view What runs', // its pin, [5, 3] (audit 15)
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

test('audit 16: an added view of cards already there is listed, its own cards and lines marked added, as a removed one\'s are marked removed', () => {
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'one', nodeIds: ['a', 'b'] }] };
  const n = structuredClone(m); n.views.push({ id: 'two', title: 'Two', nodeIds: ['a', 'b', 'x'], nodes: [{ id: 'x', label: 'X' }], edges: [{ from: 'a', to: 'b', label: 'cancels' }, { from: 'b', to: 'x' }] });
  const d = diff(m, n), two = d.model.views[1];
  assert.deepEqual([d.views, d.summary], [['two'], ['adds the view Two', 'adds X']]);
  assert.deepEqual([two.nodes[0].change, two.edges.map(e => e.style)], ['added', ['added', 'added']]);
  const only = structuredClone(m); only.views.push({ id: 'two', nodeIds: ['a', 'b'] });
  assert.deepEqual(diff(m, only).views, ['two']);
});

test('audit 16: a card\'s present in a typed view is said with the card, and hiding it says the hide only', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [], views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], present: { a: { collapsed: ['ops'] } } }] };
  const hid = structuredClone(m); hid.views[0].nodeIds = ['b']; delete hid.views[0].present;
  assert.deepEqual(diff(m, hid).summary, ['takes A out of the view V']);
  const open = structuredClone(m); open.views[0].present = {};
  assert.deepEqual(diff(m, open).summary, ['changes A (present) in the view V']);
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
  assert.deepEqual(two.edges.map(e => e.style), ['removed', 'added']); // a view's removed line comes back in its place (audit 2)
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
  assert.deepEqual(d.summary, ['renames Book to Title (parent)', 'moves Payment into billing', 'moves Money out of shared', 'adds billing']);
  assert.deepEqual(['payment', 'money'].map(id => d.model.nodes.find(n => n.id === id).change), ['changed', 'changed']);
  // no owner, absent or null, is no move; and a map (schema version 1) keeps its words
  const nul = structuredClone(sales), none = structuredClone(sales); nul.nodes.find(n => n.id === 'payment').parent = null; delete none.nodes.find(n => n.id === 'payment').parent;
  assert.deepEqual([diff(none, nul).summary, diff(nul, none).summary], [['changes Payment (parent)'], ['changes Payment (parent)']]);
  const map = p => ({ nodes: [{ id: 'x', label: 'X', parent: p }, { id: 'y' }, { id: 'z' }] });
  assert.deepEqual(diff(map('y'), map('z')).summary, ['changes X (parent)']);
});

test('diff() puts a removed model line a view names by id back in its place: a sequence keeps its order (audit 3)', () => {
  const base = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'm1', from: 'a', to: 'b' }, { id: 'm2', from: 'b', to: 'c' }, { id: 'm3', from: 'c', to: 'a' }],
    views: [{ id: 'v', render: 'sequence', nodeIds: ['a', 'b', 'c'], edges: ['m1', 'm2', 'm3'] }] };
  const after = structuredClone(base); after.edges.splice(1, 1); after.views[0].edges = ['m1', 'm3'];
  assert.deepEqual(diff(base, after).model.views[0].edges, ['m1', 'm2', 'm3']);
});

test('diff() and drift() ignore a view\'s containers that is not a list, as validate() says (audit 3)', () => {
  for (const c of [1, 'ab', {}]) {
    const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: c }] }, n = structuredClone(m);
    n.edges[0].label = 'x';
    assert.doesNotThrow(() => diff(m, n), JSON.stringify(c)); assert.doesNotThrow(() => drift(m, []), JSON.stringify(c));
  }
});

test('audit 5: diff() says what only a view changes (a card renamed there, moved to another box, a box renamed, the view retitled) and lists that view', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b' }],
    views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], containers: [{ id: 'k', label: 'Box', nodeIds: ['a'] }, { id: 's', label: 'Shelf', nodeIds: ['b'] }] }] });
  const t = f => { const b = base(); f(b.views[0]); const d = diff(base(), b); return [d.summary, d.views, (d.model.views[0].nodeOverrides || {}).a]; };
  assert.deepEqual(t(v => { v.nodeOverrides = { a: { label: 'Alpha' } }; }), [['renames A to Alpha in the view V'], ['v'], { label: 'Alpha', change: 'changed' }]);
  assert.deepEqual(t(v => { v.containers[0].nodeIds = []; v.containers[1].nodeIds = ['a', 'b']; }), [['moves A out of Box into Shelf in the view V'], ['v'], { change: 'changed' }]);
  assert.deepEqual(t(v => { v.containers[0].label = 'Crate'; }), [['renames the box Box to Crate in the view V'], ['v'], undefined]);
  assert.deepEqual(t(v => { v.title = 'W'; }), [['retitles the view V to W'], ['v'], undefined]);
  assert.deepEqual(t(() => {}), [[], [], undefined]);
});

test('audit 6: diff() says a line a view hid or showed, and a sequence view\'s steps reordered, and lists that view', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'e1', from: 'a', to: 'b', label: 'calls' }, { id: 'e2', from: 'b', to: 'c' }],
    views: [{ id: 'v', title: 'V', render: 'sequence', nodeIds: ['a', 'b', 'c'], edges: ['e1', 'e2'] }] });
  const t = f => { const b = base(); f(b.views[0]); const d = diff(base(), b); return [d.summary, d.views, d.model.views[0].edges.map(e => typeof e === 'string' ? e : `${e.id}:${e.style}`)]; };
  assert.deepEqual(t(v => { v.edges = ['e1']; }), [['takes the line from B to C out of the view V'], ['v'], ['e1', 'e2:removed']]);
  assert.deepEqual(diff((m => { m.views[0].edges = ['e2']; return m; })(base()), base()).summary, ['puts the line from A to B (calls) in the view V']);
  assert.deepEqual(t(v => { v.edges = ['e2', 'e1']; }), [['reorders the steps in the view V'], ['v'], ['e2', 'e1']]);
  assert.deepEqual(t(() => {}), [[], [], ['e1', 'e2']]);
});

test('audit 11: diff() says a line with no id that a view stops drawing, lists the view and puts the line back removed', () => {
  const a = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'b', label: 'pays' }, { id: 'bc', from: 'b', to: 'c' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  const b = structuredClone(a); b.views[0].edges = ['bc'];
  const d = diff(a, b);
  assert.deepEqual([d.summary, d.views, d.model.views[0].edges.map(e => typeof e === 'string' ? e : `${e.from}->${e.to}:${e.style}`)],
    [['takes the line from A to B (pays) out of the view v'], ['v'], ['bc', 'a->b:removed']]);
  assert.deepEqual(diff(b, a).summary, ['puts the line from A to B (pays) in the view v']);
});

test('audit 12: diff() marks the line a view puts in when it drops its list of lines', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c', label: 'stores' }];
  const d = diff({ nodes, edges, views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], edges: ['ab'] }] }, { nodes, edges, views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] });
  assert.deepEqual([d.summary, d.model.views[0].edges], [['puts the line from b to c (stores) in the view v'], ['ab', { ...edges[1], change: 'added', style: 'added' }]]);
});

test('audit 13: a view that drops its list of lines keeps its removed lines (to a removed card too) and brings its own lines back removed, put in or not', () => {
  const N = id => ({ id, label: id }), e = [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'c' }, { id: 'e3', from: 'c', to: 'd', label: 'gone' }];
  const before = es => ({ nodes: ['a', 'b', 'c', 'd'].map(N), edges: es, views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'], edges: ['e1', 'e3', { id: 'own', from: 'a', to: 'c', label: 'own line' }] }] });
  const after = es => ({ nodes: ['a', 'b', 'c'].map(N), edges: es, views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] });
  const drawn = d => layout(d.model, 'v').edges.map(x => `${x.from}->${x.to}:${x.style || ''}`);
  const put = diff(before(e), after(e.slice(0, 2))), none = diff(before([e[0], e[2]]), after([e[0]]));
  assert.deepEqual([put.summary, drawn(put)], [['removes d', 'removes the line from a to c (own line)', 'puts the line from b to c in the view v'], ['a->b:', 'b->c:added', 'c->d:removed', 'a->c:removed']]);
  assert.deepEqual([none.summary, drawn(none)], [['removes d', 'removes the line from a to c (own line)'], ['a->b:', 'c->d:removed', 'a->c:removed']]);
});

test('audit 13: a change named after a prototype key (constructor, __proto__) is no change: no badge, and the map draws', () => {
  for (const change of ['constructor', '__proto__', 'toString']) {
    const s = svgOf(layout({ nodes: [{ id: 'a', change }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }, 'v'));
    assert.doesNotMatch(s, /NEW|CHANGED|REMOVED|PLANNED/, change);
  }
});

test('diff(): a new line with no id, in a view that dropped its edges list, is said once (audit 14)', () => {
  const A = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'], edges: [{ from: 'a', to: 'b', label: 'own' }] }] };
  const B = structuredClone(A); delete B.views[0].edges; B.edges.push({ from: 'b', to: 'a', label: 'back' });
  assert.equal(diff(A, B).summary.filter(s => s === 'adds a line from B to A (back)').length, 1);
});

test('a card with no label, and its lines, are named by its id (audit 14)', () => {
  const s = svgOf(layout({ nodes: [{ id: 'a' }, { id: 'b', label: '' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] }, 'v'));
  const names = [...s.matchAll(/aria-label="([^"]*)"/g)].map(x => x[1]);
  assert.ok(names.includes('Line from a to C') && names.includes('Line from b to C'), names.join(' | '));
  assert.ok(!names.some(n => /undefined|^ |from {2}/.test(n)), names.join(' | '));
});

// audit 15: a change that only moves a card (a pin), sets a caption, lanes or a box's tone, or adds a rule a line breaks is
// said, and its view listed, so the CLI and the Action count it (they said nothing)
test('diff() says a pin, a caption, lanes, a box tone and a rule, and lists the view', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }],
    views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], containers: [{ id: 'box', label: 'Box', nodeIds: ['a'] }] }] });
  const t = f => { const B = base(); f(B); const d = diff(base(), B); return [d.summary, d.views]; };
  assert.deepEqual(t(B => { B.views[0].layout = { a: [3, 2] }; }), [['moves A in the view V'], ['v']]);
  assert.deepEqual(t(B => { B.views[0].caption = 'hello'; B.views[0].lanes = [{ title: 'L', nodeIds: ['a'] }]; }), [['changes the view V (caption, lanes)'], ['v']]);
  assert.deepEqual(t(B => { B.views[0].containers[0].tone = 'green'; }), [['changes the box Box (tone) in the view V'], ['v']]);
  assert.deepEqual(t(B => { B.rules = [{ id: 'r', title: 'A never calls B', from: { id: 'a' }, to: { id: 'b' } }]; }), [['adds the rule A never calls B'], ['v']]);
  assert.deepEqual(t(() => {}), [[], []]);
});

test('audit 17: present keyed by a member (a port\'s side, a part\'s ports) is said with its view', () => {
  const read = f => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url)));
  const os = read('order-service-structure.json'), os2 = structuredClone(os); os2.views[0].present = { ...os2.views[0].present, 'order-service.api': { side: 'right' } };
  assert.deepEqual([diff(os, os2).summary, diff(os, os2).views], [[`changes the view ${os.views[0].title} (present)`], [os.views[0].id]]);
  const bc = read('bookshop-components.json'), bc2 = structuredClone(bc), cv = bc2.views.find(v => v.id === 'components');
  cv.present = { ...cv.present, 'shop-api.orders': { side: 'left' } };
  assert.deepEqual([diff(bc, bc2).summary, diff(bc, bc2).views], [[`changes the view ${cv.title} (present)`], ['components']]);
  // a card's present stays said with the card, and a card taken out with its present says the hide only
  const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'A', members: [{ id: 'a.p', label: 'p' }] }, { id: 'b', label: 'B' }], edges: [],
    views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], present: { a: { collapsed: ['ops'] }, b: {} } }] };
  const both = structuredClone(m); both.views[0].present = { a: {}, b: {}, 'a.p': { side: 'top' } };
  assert.deepEqual(diff(m, both).summary, ['changes the view V (present)', 'changes A (present) in the view V']);
  const hid = structuredClone(m); hid.views[0].nodeIds = ['a']; delete hid.views[0].present.b;
  assert.deepEqual(diff(m, hid).summary, ['takes B out of the view V']);
  const odd = structuredClone(m); odd.views[0].present = 'all';
  assert.deepEqual(diff(m, odd).summary, ['changes the view V (present)', 'changes A (present) in the view V', 'changes B (present) in the view V']);
  assert.deepEqual(diff(m, structuredClone(m)).summary, []);
});

test('audit 17: diff() passes over a null in the after model\'s lines, as layout() and validate() do', () => {
  const as = JSON.parse(readFileSync(new URL('../examples/assistant.json', import.meta.url))), nul = structuredClone(as); nul.edges[1] = null;
  assert.doesNotThrow(() => diff(as, nul));
  assert.ok(diff(as, nul).summary.length > 0);
});

test('audit 19: diff() says a sequence view\'s own steps reordered, as its model lines\' are, and lists that view', () => {
  for (const [f, vid] of [['assistant.json', 'answer'], ['weather.json', 'forecaster'], ['bike-share.json', 'ride-end'], ['bookshop.json', 'api']]) {
    const a = JSON.parse(readFileSync(new URL('../examples/' + f, import.meta.url))), b = structuredClone(a), v = b.views.find(x => x.id === vid);
    [v.edges[0], v.edges[1]] = [v.edges[1], v.edges[0]];
    const d = diff(a, b);
    assert.deepEqual([d.summary, d.views], [[`reorders the steps in the view ${v.title || v.id}`], [vid]], f);
    assert.deepEqual(diff(a, structuredClone(a)).summary, [], f);
  }
  // an own step added or taken away is no reorder of the steps that stayed
  const as = JSON.parse(readFileSync(new URL('../examples/assistant.json', import.meta.url))), less = structuredClone(as);
  less.views.find(x => x.id === 'answer').edges.splice(1, 1);
  assert.ok(!diff(as, less).summary.some(s => s.startsWith('reorders')));
  assert.ok(!diff(less, as).summary.some(s => s.startsWith('reorders')));
});

test('audit 20: diff() matches steps with no id by what they are, so taking out an earlier step of the same ends is no reorder', () => {
  const N = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], L = (from, to, label) => ({ from, to, label });
  const own = e => ({ nodes: N, views: [{ id: 's', render: 'sequence', nodeIds: ['a', 'b', 'c'], edges: e }] });
  const lines = e => ({ nodes: N, edges: e, views: [{ id: 's', render: 'sequence', nodeIds: ['a', 'b', 'c'] }] });
  const B = [L('a', 'b', 'login'), L('b', 'c', 'query'), L('a', 'b', 'logout')], re = (x, y) => diff(x, y).summary.some(s => s.startsWith('reorders'));
  for (const m of [own, lines]) {
    assert.ok(!re(m(B), m(B.slice(1))), 'first step out'); assert.ok(!re(m(B.slice(1)), m(B)), 'first step back');
    assert.ok(!re(m(B), m([B[0], B[2]])) && !re(m(B), m(B.slice(0, 2))), 'another step out');
    assert.ok(!re(m([B[0], B[1], B[0]]), m([B[1], B[0]])), 'the first of two alike out');
    assert.ok(re(m(B), m([B[1], B[0], B[2]])), 'a step moved'); assert.ok(re(m(B), m([B[2], B[1], B[0]])), 'two alike-ended steps swapped');
    assert.ok(re(m(B), m([B[1], L('a', 'b', 'sign in'), B[2]])), 'a step changed and moved: matched by its Ref name');
  }
});

test('audit 19: diff() says a numbered-card view with no stepIds reordered, since its cards number in nodeIds order', async () => {
  const { apply } = await import('../lib/umlimator.js');
  for (const how of [{ mainSteps: true }, { render: 'process' }]) {
    const a = { nodes: [{ id: 'a', label: 'Order' }, { id: 'b', label: 'Pay' }, { id: 'c', label: 'Ship' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }],
      views: [{ id: 'v', title: 'Flow', ...how, nodeIds: ['a', 'b', 'c'] }] };
    const b = apply(a, { op: 'move', id: 'c', view: 'v', index: 0 }), d = diff(a, b);
    assert.deepEqual(layout(b, 'v').nodes.map(n => n.step), [1, 2, 3]);
    assert.deepEqual([d.summary, d.views], [['reorders the steps in the view Flow'], ['v']], JSON.stringify(how));
    // a card added or taken out of the view is no reorder; with stepIds the order is stepIds', said as a change of the view
    const more = structuredClone(a); more.nodes.push({ id: 'd', label: 'Bill' }); more.views[0].nodeIds = ['a', 'd', 'b', 'c'];
    assert.deepEqual(diff(a, more).summary, ['adds Bill']);
    const s0 = structuredClone(a); s0.views[0].stepIds = ['a', 'b', 'c']; const s1 = structuredClone(s0); s1.views[0].nodeIds = ['c', 'a', 'b'];
    assert.deepEqual(diff(s0, s1).summary, []);
  }
  // a view that does not number its cards: nodeIds order is no step order
  const p = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }, q = structuredClone(p); q.views[0].nodeIds = ['b', 'a'];
  assert.deepEqual(diff(p, q).summary, []);
});

test('audit 19: a view\'s stepIds, tour or browserOrder that is no list is warned and drawn as absent', () => {
  const base = { nodes: [{ id: 'a', label: 'A' }, { id: 'ab', label: 'AB' }, { id: 'c', label: 'C' }], edges: [{ from: 'a', to: 'ab' }, { from: 'ab', to: 'c' }],
    views: [{ id: 'v', mainSteps: true, nodeIds: ['a', 'ab', 'c'] }] };
  const steps = m => layout(m, 'v').nodes.map(n => `${n.id}:${n.step}`).join(' ');
  for (const [k, x] of [['stepIds', 7], ['stepIds', 'ab'], ['stepIds', { 0: 'a' }], ['tour', 'ab'], ['tour', 3], ['browserOrder', 5]]) {
    const m = structuredClone(base); m.views[0][k] = x;
    assert.deepEqual(validate(m).map(p => [p.level, p.path, p.message]), [['warning', `views[0].${k}`, `${k} is a list: ignored`]], `${k} ${JSON.stringify(x)}`);
    assert.equal(steps(m), 'a:1 ab:2 c:3', `${k} ${JSON.stringify(x)}`);
    assert.equal(layout(m, 'v').tour, null);
  }
});

test('audit 21: diff() of a 20,000-step trace view pairs its steps in linear memory, in under CI\'s 1.5 s, and still finds a reorder (timed)', async () => {
  const { sequenceFromTrace } = await import('../lib/umlimator.js');
  const n = 20000, nodes = Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, label: 'svc' + i })), spans = [{ id: 'root', service: 's0', start: 0, end: n + 10 }];
  for (let i = 0; i < n; i++) spans.push({ id: 'x' + i, parent: i ? 'x' + (i - 1) : 'root', service: 's' + ((i + 1) % 20), name: 'op' + (i % 7), start: i + 1, end: i + 2 });
  const m = sequenceFromTrace({ nodes, edges: [], views: [{ id: 'all', nodeIds: nodes.map(x => x.id) }] }, spans, { view: 'trace' });
  const run = (f, label) => { const h = process.memoryUsage().heapUsed, t = performance.now(), d = diff(m, f(structuredClone(m)));
    const ms = performance.now() - t, mb = (process.memoryUsage().heapUsed - h) / 1e6; console.log(`# ${label}: ${Math.round(ms)} ms, heap ${Math.round(mb)} MB more`);
    assert.ok(ms < 1500 && mb < 400, `${label}: ${ms} ms, ${mb} MB`); return d.summary; }; // a (n+1) x (n+1) table: gigabytes, out of memory at 25,000
  assert.equal(m.views[1].edges.length, n);
  assert.deepEqual(run(x => { x.views[1].edges[0].label = 'renamed'; return x; }, 'one label'), ['changes the line from svc0 to svc1 (label op0 → renamed)']);
  assert.deepEqual(run(x => x, 'the same'), []);
  assert.deepEqual(run(x => { const E = x.views[1].edges; E.push(E.shift()); return x; }, 'the first step last'), ['reorders the steps in the view trace']);
  assert.deepEqual(run(x => { x.views[1].edges.reverse(); return x; }, 'reversed'), ['reorders the steps in the view trace']);
  assert.deepEqual(run(x => { x.views[1].edges.splice(n / 2, 1); return x; }, 'a step out'), ['removes the line from svc0 to svc1 (op4)']);
});

test('audit 22: diff() past the table\'s cap pairs a long view\'s id-less steps along a longest common run: its first and last taken out is no reorder', () => {
  const nodes = ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase() })), cyc = [['a', 'b', 'ask'], ['b', 'c', 'look'], ['c', 'b', 'found'], ['b', 'a', 'answer']];
  const view = n => ({ nodes, edges: [], views: [{ id: 'seq', render: 'sequence', nodeIds: ['a', 'b', 'c'], edges: Array.from({ length: n }, (_, i) => { const [from, to, label] = cyc[i % 4]; return { from, to, label }; }) }] });
  const said = (n, f) => { const m = view(n), x = structuredClone(m); f(x.views[0].edges); return diff(m, x).summary; };
  const cases = [['the ends out', E => { E.shift(); E.pop(); }, false], ['the ends and four in the middle out', E => { E.shift(); E.pop(); E.splice(E.length >> 1, 4); }, false],
    ['one out first, one in last', E => { E.shift(); E.push({ from: 'c', to: 'a', label: 'late' }); }, false],
    ['the first half relabelled', E => E.forEach((e, i) => { if (i < E.length / 2) e.label += '!'; }), false],
    ['the ends out and one step moved to the middle', E => { E.shift(); E.pop(); E.splice(E.length >> 1, 0, ...E.splice(0, 1)); }, true],
    ['the ends out and the rest reversed', E => { E.shift(); E.pop(); E.reverse(); }, true]];
  for (const [what, f, moved] of cases) { const small = said(600, f); // under the cap: the table
    assert.equal(small.includes('reorders the steps in the view seq'), moved, `600: ${what}`);
    for (const n of [2500, 6000]) assert.deepEqual(said(n, f).filter(s => /reorders/.test(s)), moved ? ['reorders the steps in the view seq'] : [], `${n}: ${what}`); }
  assert.deepEqual(said(2500, E => { E.shift(); E.pop(); }), ['removes the line from A to B (ask)', 'removes the line from B to A (answer)']);
});

test('audit 23: diff() past the table\'s cap pairs the run the table pairs: the same edit reads as a reorder, or not, whatever the view\'s size', async () => {
  const { sameOrder } = await import('../src/map/diff.js');
  let seed = 23; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  // random steps of a few kinds that repeat and a few Ref names, short and long (the long ones walk the band in blocks)
  for (const [runs, len] of [[20000, 7], [2000, 40], [100, 300]]) for (let t = 0; t < runs; t++) {
    const kinds = 1 + Math.floor(rnd() * 4), refs = 1 + Math.floor(rnd() * 5);
    const gen = n => Array.from({ length: n }, () => ['k' + Math.floor(rnd() * kinds), 'r' + Math.floor(rnd() * refs)]);
    const p = gen(Math.floor(rnd() * len)), q = gen(Math.floor(rnd() * len));
    assert.equal(sameOrder(p, q, 0), sameOrder(p, q, Infinity), `${JSON.stringify(p)} ${JSON.stringify(q)}`);
  }
  assert.equal(sameOrder([['k0', 'r3'], ['k0', 'r6']], [['k2', 'r6'], ['k0', 'r5']], 0), true, 'the finding\'s pair, past the cap');
  // the same four-step edit among 5 or 2,001 unrelated steps taken out and put in: only the second passes the cap
  const core0 = [['a', 'a', 'x'], ['a', 'a', 'y'], ['b', 'b', 'x'], ['a', 'a', 'x']], core1 = [['b', 'b', 'y'], ['a', 'a', 'x'], ['b', 'b', 'y'], ['b', 'b', 'y']];
  const model = (pre, core, n) => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    views: [{ id: 'v', render: 'sequence', nodeIds: ['a', 'b'], edges: [...Array.from({ length: n }, (_, i) => ({ id: pre + i, from: 'a', to: 'b', label: pre + i })), ...core.map(([from, to, label]) => ({ from, to, label }))] }] });
  const said = n => diff(model('u', core0, n), model('w', core1, n)).summary.includes('reorders the steps in the view v');
  assert.equal(said(2001), said(5));
});

test('audit 21: drift() reads match as a table by name (a service may be named toString), and an entry with no end names no service', () => {
  const model = { nodes: [{ id: 'api', label: 'API' }, { id: 'db', label: 'Database' }], edges: [{ id: 'e', from: 'api', to: 'db' }], views: [{ id: 'v', nodeIds: ['api', 'db'] }] };
  const seen = [{ from: 'checkout-svc', to: 'pg-main', count: 4 }];
  for (const match of [{ 'checkout-svc': 'api', 'pg-main': 'db' }, { 'checkout-svc': 'api', 'pg-main': 'db', toString: 'api' }, { 'checkout-svc': 'api', 'pg-main': 'db', toString: { toString: 1 }, x: [1] }])
    assert.deepEqual(drift(model, seen, { match }).counts, { carried: 1, undrawn: 0, idle: 0, unknown: 0, unmatched: [] }, JSON.stringify(match));
  assert.deepEqual(drift(model, [{ from: 'toString', to: 'db', count: 1 }], { match: { toString: 'api' } }).counts.carried, 1, 'a service named toString');
  assert.deepEqual(drift(model, [{ from: 'x', to: 'db', count: 1 }], { match: { x: { toString: 1 } } }).counts.unmatched, ['x'], 'a match that is no name: no card');
  // a missing, null or left-out end, or one that is no name: no service named "undefined" or "null"
  const bad = JSON.parse('{"toString":1}');
  for (const o of [[{ parent: 'api', count: 3 }], [{ to: 'db', count: 3 }], [{ from: 'api', to: null, count: 2 }], [{ from: bad, to: 'db', count: 3 }], [{ parent: 'api', child: bad, callCount: 3 }], [{ from: { a: 1 }, to: 'db' }], [{ from: true, to: 'db' }]])
    assert.deepEqual(drift(model, o).counts, { carried: 0, undrawn: 0, idle: 0, unknown: 1, unmatched: [] }, JSON.stringify(o));
  assert.deepEqual(drift(model, [{ from: 'web', count: 1 }, { from: 7, to: 'db', count: 1 }]).counts.unmatched, ['7', 'web'], 'an end that is there and has no card is still said');
  assert.deepEqual(drift(model, [{ from: bad, to: 'b', count: 3 }, { from: 'api', to: 'db', count: 2 }]).counts, { carried: 1, undrawn: 0, idle: 0, unknown: 0, unmatched: ['b'] });
});

test('audit 21: validate() says a value it leaves out once, at its path, and not again as a missing end, type or name', () => {
  const m = JSON.parse('{"nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"}],"edges":[{"id":"ab","from":"a","to":"b"},{"from":{"toString":1},"to":"b"}],"views":[{"id":"v","nodeIds":["a","b","c"]}]}');
  assert.deepEqual(validate(m), [{ level: 'error', path: 'edges[1].from', message: 'an object with a "toString" key, which no text is read from: left out' }]);
  m.edges[1].from = 'z'; assert.deepEqual(validate(m).map(p => p.message), ['"z" is neither a card nor a box'], 'an end that names nothing is still said');
  // a typed model: a member's type, a timing change's lifeline; every example, each text value in turn
  for (const f of ['bookshop-schema.json', 'bookshop-timing.json', 'order-states.json', 'bike-share.json']) {
    const base = JSON.parse(readFileSync(new URL('../examples/' + f, import.meta.url))), was = new Set(validate(base).map(p => p.path + p.message));
    const at = [], walk = (o, p) => Object.entries(o).forEach(([k, v]) => { const q = Array.isArray(o) ? `${p}[${k}]` : p ? `${p}.${k}` : k;
      if (typeof v === 'string') at.push([o, k, q]); else if (v && typeof v === 'object') walk(v, q); });
    walk(base, '');
    for (const [o, k, q] of at) { const v = o[k]; o[k] = JSON.parse('{"toString":1}');
      const ps = validate(base).filter(p => !was.has(p.path + p.message) && p.path === q);
      assert.deepEqual(ps.map(p => p.message), ['an object with a "toString" key, which no text is read from: left out'], `${f} ${q}`); o[k] = v; }
  }
});

test('audit 22: validate() says a problem after a list entry it leaves out at that problem\'s own place, and does not drop it', async () => {
  const T = '{"toString":1}', J = s => JSON.parse(s), said = m => validate(m).map(p => [p.path, p.message]), LEFT = 'an object with a "toString" key, which no text is read from: left out';
  // a card with no id and a twice-used id after a left-out card; a line that is no object after a left-out line
  assert.deepEqual(said(J(`{"nodes":[${T},{"label":"no id"},{"id":"b"},{"id":"b"}],"edges":[${T},7,{"from":"b","to":"zz"}],"views":[{"id":"v","nodeIds":["b"]}]}`)),
    [['edges[0]', LEFT], ['nodes[0]', LEFT], ['nodes[1].id', 'a card needs an id'], ['nodes[3].id', 'card id "b" is used twice'], ['edges[1]', 'a line is an object with from and to'], ['edges[2].to', '"zz" is neither a card nor a box']]);
  // two left out of one list, and one in a view after a left-out view: each index as the model has it
  assert.deepEqual(said(J(`{"nodes":[{"id":"b"},${T},${T},{"id":"b"}],"views":[${T},{"id":"v","nodeIds":["b","q"]}]}`)),
    [['nodes[1]', LEFT], ['nodes[2]', LEFT], ['views[0]', LEFT], ['nodes[3].id', 'card id "b" is used twice'], ['views[1].nodeIds[1]', '"q" is not a card']]);
  // a typed model: a sequence's reply after a left-out step is said at its own place, and its id's other use names that place
  const seq = bad => ({ schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Lifeline', label: 'a' }, { id: 'b', type: 'uml.Lifeline', label: 'b' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['a', 'b'], edges: [{ id: 'm1', type: 'uml.Message', from: 'a', to: 'b', label: 'go', props: { sort: 'call' } }, ...(bad ? [J(T)] : []),
      { id: 'm2', type: 'uml.Message', from: 'a', to: 'b', label: 'back', props: { sort: 'reply', replyTo: 'm1' } }, { id: 'm2', type: 'uml.Message', from: 'b', to: 'a', label: 'again', props: { sort: 'reply', replyTo: 'm1' } }] }] });
  const all = (await import('../lib/umlimator-all.js')).validate, typed = m => all(m).map(p => [p.path, p.message]);
  const plain = typed(seq(false)), shifted = typed(seq(true)), up = p => p.replace(/edges\[(\d+)\]/g, (w, n) => `edges[${+n + 1}]`);
  assert.ok(plain.some(([, s]) => /^reply-call: m2/.test(s)) && plain.some(([, s]) => /used twice \(also views\[0\]\.edges\[1\]\)/.test(s)), JSON.stringify(plain));
  assert.deepEqual(shifted, [['views[0].edges[1]', LEFT], ...plain.map(([p, s]) => [up(p), up(s)])]);
});

// audit 24: past the cap the band spans only the steps of a kind both lists hold; with every step given a new kind (a trace
// re-imported with new line ids) it walked 20,000 x 40,001 cells for nothing, 5 to 33 times slower than before audit 23
test('audit 24: diff()\'s order check past the cap leaves out the steps no pairing can use, and pairs as the table does', async () => {
  const { sameOrder } = await import('../src/map/diff.js');
  const n = 30000, all = Array.from({ length: n }, (_, i) => ['x' + i, 'r']), none = Array.from({ length: n }, (_, i) => ['y' + i, 'r']);
  const half = all.map((s, i) => (i % 2 ? ['y' + i, 'r'] : s));
  for (const [what, p, q, want] of [['every step new', all, none, true], ['every other step new', all, half, true], ['two swapped among new ones', all, [...half.slice(0, 10), all[12], half[11], all[10], ...half.slice(13)], false]]) {
    const t = performance.now(); assert.equal(sameOrder(p, q), want, what);
    assert.ok(performance.now() - t < 2000, `${what}: ${Math.round(performance.now() - t)} ms`); } // before: about 6,000 ms or more each
  // kinds one list alone has, among shared ones, past the cap as under it
  let seed = 24; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let t = 0; t < 20000; t++) { const gen = (n, k) => Array.from({ length: n }, () => ['k' + Math.floor(rnd() * k), 'r' + Math.floor(rnd() * 3)]);
    const p = gen(Math.floor(rnd() * 12), 3 + Math.floor(rnd() * 6)), q = gen(Math.floor(rnd() * 12), 3 + Math.floor(rnd() * 6));
    assert.equal(sameOrder(p, q, 0), sameOrder(p, q, Infinity), `${JSON.stringify(p)} ${JSON.stringify(q)}`); }
});

// audit 27: diff() copies both models with copyOf(), which keeps a host's function (audit 24), but a member it brought back
// (one a removed line ends on), a changed card's copy with its lost members left out, and an owner it brought back were
// each copied with structuredClone, which threw a DOMException ("could not be cloned")
test('audit 27: diff() brings back a member or an owner, and compares a changed card, when they hold a host\'s function', async () => {
  const U = await import('../lib/umlimator-all.js'), fn = () => 1;
  const cls = members => ({ schemaVersion: 2, nodes: [{ id: 'k', type: 'uml.Class', label: 'K', members }, { id: 'j', type: 'uml.Class', label: 'J' }], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['k', 'j'] }] });
  const a = cls([{ id: 'm', type: 'uml.Property', label: 'm', onEdit() {} }]); a.edges = [{ id: 'e', type: 'uml.Association', from: 'j', to: 'm' }];
  const r = U.diff(a, cls([]));
  const p = cls([{ id: 'm', type: 'uml.Property', label: 'm' }]); p.edges = a.edges;
  assert.deepEqual(r.summary, U.diff(p, cls([])).summary); assert.deepEqual(r.summary, ['removes m from K']);
  assert.equal(typeof r.model.nodes[0].members[0].onEdit, 'function'); assert.equal(r.model.nodes[0].members[0].change, 'removed');
  const two = () => cls([{ id: 'm', type: 'uml.Property', label: 'm' }, { id: 'n', type: 'uml.Property', label: 'n' }]), one = () => cls([{ id: 'n', type: 'uml.Property', label: 'n' }]);
  const b0 = two(), b1 = one(); b0.nodes[0].hook = fn; b1.nodes[0].hook = fn; b1.nodes[0].label = 'K2';
  const c0 = two(), c1 = one(); c1.nodes[0].label = 'K2';
  assert.deepEqual(U.diff(b0, b1).summary, U.diff(c0, c1).summary); assert.deepEqual(U.diff(c0, c1).summary, ['removes m from K2', 'renames K to K2']);
  // an owner that left with what it held (a removed card whose parent was a member that left too) comes back, removed
  const own = gone => ({ schemaVersion: 2, nodes: [{ id: 'k', label: 'K', members: gone ? [] : [{ id: 'r', label: 'R', hook: fn }] }, ...(gone ? [] : [{ id: 's', label: 'S', parent: 'r' }])], edges: [], views: [{ id: 'v', nodeIds: gone ? ['k'] : ['k', 's'] }] });
  const o = U.diff(own(false), own(true)), back = o.model.nodes[0].members.find(x => x.id === 'r');
  assert.ok(back && back.change === 'removed' && back.hook === fn, JSON.stringify(o.model.nodes[0]));
  // and a fragment that left with its message, where no card changed (the owner chain alone copies it)
  const seq = () => JSON.parse(readFileSync(new URL('../examples/checkout-sequence.json', import.meta.url))), s0 = seq(), s1 = seq();
  s0.views[0].fragments[1].hook = fn; s1.views[0].fragments.pop(); s1.views[0].edges = s1.views[0].edges.filter(e => e.id !== 'm7');
  const f = U.diff(s0, s1); assert.deepEqual(f.summary, ['removes the line from api to storefront (orderPlaced)', 'removes the opt fragment']);
  assert.deepEqual(f.model.views[0].fragments.map(x => [x.id, x.change, typeof x.hook]), [['f1', undefined, 'undefined'], ['f2', 'removed', 'function']]);
});

// audit 27: diff()'s canon() is JSON.stringify with a replacer that writes each object's keys sorted, into a new object each
// time, so JSON.stringify's own check never saw a cycle (which copyOf(), validate() and layout() keep) and the stack overflowed
test('audit 27: diff() compares a model that holds a cycle, and says what changed', () => {
  const m = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  const self = m(); self.nodes[0].self = self.nodes[0];
  const owner = m(); owner.nodes[0].props = { owner: owner.nodes[0] };
  const deep = m(); deep.nodes[0].props = { a: { b: {} } }; deep.nodes[0].props.a.b.up = deep.nodes[0].props; deep.nodes[0].props.a.list = [deep.nodes[0].props.a];
  for (const c of [self, owner, deep]) {
    assert.deepEqual(diff(c, c).summary, []);
    assert.equal(diff(m(), c).summary.length, 1); assert.match(diff(m(), c).summary[0], /^changes A \((self|props)\)$/);
    const d = structuredClone(c); d.nodes[1].label = 'B2'; assert.deepEqual(diff(c, d).summary, ['renames B to B2'], 'the cycle copied the same way is no change');
  }
  // the same object twice, side by side, is no cycle: it is written out each time, as before
  const shared = m(), t = { x: 1 }; shared.nodes[0].props = { p: t, q: t }; const flat = m(); flat.nodes[0].props = { p: { x: 1 }, q: { x: 1 } };
  assert.deepEqual(diff(shared, flat).summary, []);
});

// audit 27: an added card's sentence named its far card once for each line that joins them
test('audit 27: diff() names each card an added card is joined to once, however many lines join them', () => {
  const a = { nodes: [{ id: 'q', label: 'Queue' }, { id: 'd', label: 'DB' }], edges: [], views: [{ id: 'v', nodeIds: ['q', 'd'] }] };
  const add = edges => ({ nodes: [...a.nodes, { id: 'w', label: 'Worker' }], edges, views: [{ id: 'v', nodeIds: ['q', 'd', 'w'] }] });
  const said = edges => diff(a, add(edges)).summary;
  assert.deepEqual(said([{ from: 'w', to: 'q', label: 'reads' }, { from: 'w', to: 'q', label: 'acks' }]), ['adds Worker, to Queue']);
  assert.deepEqual(said([{ from: 'q', to: 'w', label: 'push' }, { from: 'q', to: 'w', label: 'retry' }, { from: 'w', to: 'q', label: 'ack' }]), ['adds Worker, to and from Queue']);
  assert.deepEqual(said([{ from: 'q', to: 'w' }, { from: 'w', to: 'd' }]), ['adds Worker between Queue and DB']);
  assert.deepEqual(said([{ from: 'q', to: 'w' }, { from: 'q', to: 'w' }, { from: 'w', to: 'd' }, { from: 'w', to: 'd' }]), ['adds Worker between Queue and DB']);
  assert.deepEqual(said([{ from: 'q', to: 'w' }, { from: 'd', to: 'w' }, { from: 'w', to: 'q' }]), ['adds Worker, from DB, to and from Queue']);
  assert.deepEqual(said([{ from: 'w', to: 'q' }, { from: 'w', to: 'd' }, { from: 'w', to: 'q' }]), ['adds Worker, to Queue and DB']);
});

test('audit 28: diff() reads a BigInt in a card and a list with a hole, as validate() and layout() do', () => {
  const m = structuredClone(bike); m.nodes[0].props = { ...(m.nodes[0].props || {}), n: 10n };
  const d = diff(bike, m); assert.ok(d.summary.length && d.model.nodes.some(n => n.change === 'changed'), d.summary);
  assert.deepEqual(diff(m, m).views, []); // the same BigInt both sides: no change
  const n = structuredClone(m); n.nodes[0].props.n = 11n; assert.ok(diff(m, n).model.nodes.some(x => x.change === 'changed'));
  for (const key of ['nodes', 'edges']) { const h = structuredClone(bike); h[key] = [...h[key]]; h[key].length += 1; delete h[key][1]; // a hole, and one at the end
    assert.doesNotThrow(() => diff(h, bike), key); assert.doesNotThrow(() => diff(bike, h), key); assert.doesNotThrow(() => validate(h), key); }
});

// audit 31: diff() said nothing of a change to the map's title, a story or a lens, so diff --base wrote "No map model changed." and
// the Action counted 0; and it compared values unmarked, so the text "2n" and the BigInt 2n (or NaN and null) read as one value
test('audit 31: diff() says a change to the title, a story, a lens or another field of the model, and tells "2n" from 2n and NaN from null', () => {
  const b = { title: 'Shop', root: 'main', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b' }], views: [{ id: 'main', title: 'Main', nodeIds: ['a', 'b'] }],
    stories: [{ id: 's', title: 'Checkout', steps: [{ view: 'main', select: 'a', caption: 'one' }] }], lenses: [{ id: 'l', title: 'Team', pick: { owner: 'x' } }] };
  const t = f => { const a = structuredClone(b); f(a); return diff(b, a).summary; };
  assert.deepEqual(t(a => { a.title = 'Shop v2'; }), ['retitles the map Shop to Shop v2']);
  assert.deepEqual(t(a => { delete a.title; }), ['takes the title Shop off the map']);
  assert.deepEqual(t(a => { a.stories.push({ id: 's2', title: 'Refund', steps: [] }); }), ['adds the story Refund']);
  assert.deepEqual(t(a => { a.stories[0].steps[0].caption = 'two'; }), ['changes the story Checkout']);
  assert.deepEqual(t(a => { a.stories = []; }), ['removes the story Checkout']);
  assert.deepEqual(t(a => { a.lenses[0].pick = { owner: 'y' }; }), ['changes the lens Team']);
  assert.deepEqual(t(a => { delete a.lenses; }), ['removes the lens Team']);
  assert.deepEqual(t(a => { a.root = 'other'; a.meta = { root: 'src' }; }), ['changes the model (root, meta)']);
  assert.deepEqual(t(a => { a.title = 'Shop v2'; a.nodes[0].label = 'A2'; }), ['retitles the map Shop to Shop v2', 'renames A to A2']);
  assert.deepEqual(t(() => {}), []);
  const m = w => ({ root: 'v', nodes: [{ id: 'a', label: 'A', what: w }], edges: [{ id: 'e', from: 'a', to: 'a', weight: w }], views: [{ id: 'v', nodeIds: ['a'] }] });
  for (const [x, y] of [['2n', 2n], [null, NaN], ['\u00002n', 2n], [Infinity, null]]) assert.deepEqual(diff(m(x), m(y)).summary, ['changes A (what)', 'changes the line from A to A (weight)'], String(y));
  assert.deepEqual(diff(m(2n), m(2n)).summary, []);
});

test('audit 36: diff() names a box as the map draws it, by its label or else its id: a `title` it never draws is no rename', () => {
  const base = () => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b' }],
    views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], containers: [{ id: 'box', title: 'Shop', nodeIds: ['a'] }, { id: 's', label: 'Shelf', title: 'Rack', nodeIds: ['b'] }] }] });
  const t = f => { const b = base(); f(b.views[0]); return diff(base(), b).summary; };
  // the map draws the boxes "box" and "Shelf" (svg.js: a box's label, else its id)
  assert.match(svgOf(layout(base(), 'v'), {}), />box</);
  assert.deepEqual(t(v => { v.containers[0].title = 'Store'; }), []);
  assert.deepEqual(t(v => { v.containers[1].title = 'Store'; }), []);
  assert.deepEqual(t(v => { v.containers[0].label = 'Crate'; }), ['renames the box box to Crate in the view V']);
  assert.deepEqual(t(v => { v.containers[0].nodeIds = []; v.containers[1].nodeIds = ['a', 'b']; }), ['moves A out of box into Shelf in the view V']);
});

// the source modules, every diagram type's registered, so layout() and svgOf() draw each type as the page does (lib's own
// layout() registers them in its own copy, which src's svgOf does not see)
const fromSrc = async () => { const { readdirSync } = await import('node:fs');
  for (const d of ['map', 'typed', 'uml', 'sysml', 'c4', 'er', 'dfd', 'flowchart', 'bpmn', 'cloud', 'mindmap'])
    for (const f of readdirSync(new URL(`../src/${d}/`, import.meta.url)).filter(f => f.endsWith('.js')).sort()) await import(`../src/${d}/${f}`);
  return { ...(await import('../src/map/diff.js')), ...(await import('../src/map/api.js')) }; };

test('audit 40: diff() lists a typed view whose picture changes through what it does not draw itself: an implied C4 line, a required stereotype, an IDEF1X dependent entity', async () => {
  const all = await fromSrc(), read = f => JSON.parse(readFileSync(new URL(`../examples/${f}.json`, import.meta.url)));
  const pic = (m, v) => svgOf(all.layout(m, v)).replace(/\bg\d+-/g, 'g-');
  // each listed exactly when its picture changes, for the views the edit is about
  const sees = (b, a, ids) => { const d = all.diff(b, a); ids.forEach(id => { assert.ok(pic(b, id) !== pic(a, id), `${id}'s picture changes`); assert.ok(d.views.includes(id), `${id} is listed: ${d.views}`); }); return d; };
  // C4: with no system-level relationship, the context view draws Bookshop -> Payment provider implied by the container's
  const c4 = read('bookshop-c4'); c4.edges = c4.edges.filter(e => e.id !== 'c4-bookshop-payments');
  const ed = f => { const a = structuredClone(c4); f(a); return a; };
  sees(c4, ed(a => { a.edges.find(e => e.id === 'c4-api-payments').label = 'Totally new words'; }), ['c4-context']);
  sees(c4, ed(a => { a.edges = a.edges.filter(e => !/payment/.test(e.id) || e.id === 'c4-checkout-payment-client'); }), ['c4-context']);
  sees(c4, ed(a => { a.edges.push({ id: 'zz', type: 'c4.Relationship', from: 'c4-worker', to: 'c4-payments', label: 'Refunds' }); }), ['c4-context']);
  // the system-level relationship kept: the implied line is not drawn, and the context view is not listed for the container's label
  const kept = read('bookshop-c4'), k2 = structuredClone(kept); k2.edges.find(e => e.id === 'c4-api-payments').label = 'Totally new words';
  assert.ok(!all.diff(kept, k2).views.includes('c4-context'));
  // a profile view showing a class whose package applies a profile with a required extension: isRequired off drops «owned»
  const pr = read('bookshop-profile'); pr.views.push({ id: 'orders', diagram: 'uml.profile', title: 'Orders', nodeIds: ['sales', 'order'] });
  const pr2 = structuredClone(pr); pr2.edges.find(e => e.id === 'owned-extends-class').props.isRequired = false;
  sees(pr, pr2, ['orders']); sees(pr2, pr, ['orders']);
  // an IDEF1X view of the child alone: the relationship no longer identifying takes its dependent corners away
  const er = read('bookshop-schema'), rel = er.edges.find(e => e.type === 'er.Relationship' && e.props && e.props.identifying);
  er.views.push({ id: 'children', diagram: 'er', notation: 'idef1x', title: 'Children only', nodeIds: [rel.to] });
  const er2 = structuredClone(er); er2.edges.find(e => e.id === rel.id).props.identifying = false;
  sees(er, er2, ['children']);
  // crow's foot draws no dependent corners: not listed
  const cf = structuredClone(er), cf2 = structuredClone(er2); [cf, cf2].forEach(m => { m.views.at(-1).notation = 'crowsfoot'; });
  assert.ok(!all.diff(cf, cf2).views.includes('children'));
  // no change, no view, for every example; hostile: hooks given odd lines and ids throw nothing
  for (const f of ['bookshop-c4', 'bookshop-profile', 'bookshop-schema', 'bookshop-atlas']) assert.deepEqual(all.diff(read(f), read(f)).views, [], f);
  const h = structuredClone(pr2); h.edges.push(null, 7, { id: '__proto__', type: 'uml.Extension', from: 'owned', to: { x: 1 } }, { id: 'constructor', type: 'uml.Generalization', from: 'owned', to: 'owned' });
  h.views.at(-1).nodeIds.push({ toString: 1 }, 'ghost', '__proto__');
  assert.ok(all.diff(pr, h).views.includes('orders'));
});

test('audit 40: diff() lists a map view whose card opens a view whose drawn count changed, a map view or a typed one', async () => {
  const all = await fromSrc();
  const A = { title: 'm', nodes: [{ id: 'shop', label: 'Shop', view: 'inner' }, { id: 'db', label: 'DB' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    edges: [{ from: 'shop', to: 'db' }, { from: 'a', to: 'b' }], views: [{ id: 'root', title: 'Root', nodeIds: ['shop', 'db'] }, { id: 'inner', title: 'Inner', nodeIds: ['a', 'b'] }] };
  const B = structuredClone(A); B.nodes.push({ id: 'c', label: 'C' }); B.views[1].nodeIds.push('c');
  assert.deepEqual(all.diff(A, B).views, ['root', 'inner']);
  // a relabel inside leaves the count: only the inner view
  const C = structuredClone(A); C.nodes[2].label = 'A2'; assert.deepEqual(all.diff(A, C).views, ['inner']);
  // a view whose node is the card, and an override that opens it
  const O = structuredClone(A); delete O.nodes[0].view; O.views[1].node = 'shop'; const O2 = structuredClone(O); O2.nodes.push({ id: 'c' }); O2.views[1].nodeIds.push('c');
  assert.deepEqual(all.diff(O, O2).views, ['root', 'inner']);
  // a typed child: the atlas's mail card opening the composite view, one part added there
  const x = JSON.parse(readFileSync(new URL('../examples/bookshop-atlas.json', import.meta.url))); x.nodes.find(n => n.id === 'mail').opensView = 'internals';
  const y = structuredClone(x); y.nodes.find(n => n.id === 'order-service').members.push({ id: 'order-service.audit', type: 'uml.Property', label: 'audit', props: { valueType: 'AuditLog', multiplicity: '1', aggregation: 'composite' } });
  const d = all.diff(x, y), pic = (m, v) => svgOf(all.layout(m, v)).replace(/\bg\d+-/g, 'g-');
  x.views.forEach(v => assert.equal(d.views.includes(v.id), pic(x, v.id) !== pic(y, v.id), v.id));
  assert.ok(d.views.includes('overview'));
  // hostile: a card that opens a view named for an Object.prototype key, or itself
  const H = structuredClone(A); H.nodes[0].view = 'constructor'; H.nodes.push({ id: '__proto__', view: '__proto__' }); H.views[0].nodeIds.push('__proto__', null, 7);
  const H2 = structuredClone(H); H2.views[1].nodeIds.push('db'); assert.deepEqual(all.diff(H, H2).views, ['inner']);
});

test('audit 41: diff() lists a typed view whose picture changes through a member\'s stereotype, a moved hidden element, an inline relationship, its parent view or the icons table', async () => {
  const all = await fromSrc(), read = f => JSON.parse(readFileSync(new URL(`../examples/${f}.json`, import.meta.url)));
  const pic = (m, v) => svgOf(all.layout(m, v), { icons: m.icons }).replace(/\bg\d+-/g, 'g-');
  const sees = (b, a, ids) => { const d = all.diff(b, a); ids.forEach(id => { assert.ok(pic(b, id) !== pic(a, id), `${id}'s picture changes`); assert.ok(d.views.includes(id), `${id} is listed: ${d.views}`); }); return d; };
  // a required stereotype on Property: the class's attribute row prints its tag, in a view that shows only the package and the class
  const pr = def => ({ schemaVersion: 2, title: 't', nodes: [
    { id: 'P', type: 'uml.Profile', label: 'Audit' }, { id: 'mp', type: 'uml.MetaclassReference', label: 'Property', parent: 'P' },
    { id: 'aud', type: 'uml.Stereotype', label: 'audited', parent: 'P', members: [{ id: 'aud.by', type: 'uml.Property', label: 'by', props: { valueType: 'String', default: def } }] },
    { id: 'sales', type: 'uml.Package', label: 'sales' },
    { id: 'order', type: 'uml.Class', label: 'Order', parent: 'sales', members: [{ id: 'order.total', type: 'uml.Property', label: 'total', props: { valueType: 'Money' } }, null, 7, { id: '__proto__', type: 'uml.Operation', label: 'go', members: [{ id: 'deep' }] }] }],
    edges: [{ id: 'ext', type: 'uml.Extension', from: 'aud', to: 'mp', props: { isRequired: true } }, { id: 'app', type: 'uml.ProfileApplication', from: 'sales', to: 'P' }],
    views: [{ id: 'pv', diagram: 'uml.profile', title: 'Sales', nodeIds: ['sales', 'order', 'ghost', '__proto__', null] }, { id: 'all', diagram: 'uml.profile', title: 'Defs', nodeIds: ['P', 'mp', 'aud'] }] });
  sees(pr('alice'), pr('bob'), ['pv', 'all']);
  assert.deepEqual(all.diff(pr('alice'), pr('alice')).views, []);
  // C4: a hidden container moved to another system moves the landscape's implied line; an instance moved to another host the deployment view's
  const c4 = { schemaVersion: 2, nodes: [{ id: 'shopper', type: 'c4.Person', label: 'Shopper' }, { id: 'a', type: 'c4.SoftwareSystem', label: 'System A' },
    { id: 'b', type: 'c4.SoftwareSystem', label: 'System B' }, { id: 'c', type: 'c4.Container', label: 'Web app', parent: 'a' }, { id: 'k', type: 'c4.Component', label: 'Cart', parent: 'c' }],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'shopper', to: 'k', label: 'Uses' }], views: [{ id: 'land', diagram: 'c4.landscape', title: 'Landscape', nodeIds: ['shopper', 'a', 'b'] }] };
  const c4b = structuredClone(c4); c4b.nodes.find(n => n.id === 'c').parent = 'b';
  assert.deepEqual(sees(c4, c4b, ['land']).views, ['land']);
  const c4c = structuredClone(c4); c4c.nodes.find(n => n.id === 'c').label = 'Web shop'; // a hidden element renamed: its line stays, not listed
  assert.deepEqual(all.diff(c4, c4c).views, []);
  const dep = { schemaVersion: 2, nodes: [{ id: 's', type: 'c4.SoftwareSystem', label: 'Shop' }, { id: 'api', type: 'c4.Container', label: 'API', parent: 's' }, { id: 'db', type: 'c4.Container', label: 'DB', parent: 's' },
    { id: 'n1', type: 'c4.DeploymentNode', label: 'Web box' }, { id: 'n2', type: 'c4.DeploymentNode', label: 'Spare box' }, { id: 'n3', type: 'c4.DeploymentNode', label: 'DB box' },
    { id: 'api-1', type: 'c4.ContainerInstance', label: 'API', parent: 'n1', props: { container: 'api' } }, { id: 'db-1', type: 'c4.ContainerInstance', label: 'DB', parent: 'n3', props: { container: 'db' } }],
    edges: [{ id: 'r', type: 'c4.Relationship', from: 'api-1', to: 'db-1', label: 'Reads' }], views: [{ id: 'dep', diagram: 'c4.deployment', title: 'Deployment', nodeIds: ['n1', 'n2', 'n3'] }] };
  const dep2 = structuredClone(dep); dep2.nodes.find(n => n.id === 'api-1').parent = 'n2';
  sees(dep, dep2, ['dep']);
  // ER: an identifying relationship written inline in another view; the IDEF1X view of the child alone loses its dependent corners
  const col = (id, l, p) => ({ id, type: 'er.Column', label: l, props: p });
  const er = { schemaVersion: 2, nodes: [{ id: 'order', type: 'er.Entity', label: 'order', members: [col('order.id', 'id', { dataType: 'int', primaryKey: true })] },
    { id: 'line', type: 'er.Entity', label: 'order_line', members: [col('line.order', 'order_id', { dataType: 'int', primaryKey: true, foreignKey: true, references: 'order.id' })] }], edges: [],
    views: [{ id: 'all', diagram: 'er', title: 'All', nodeIds: ['order', 'line'], edges: [{ id: 'contains', type: 'er.Relationship', from: 'order', to: 'line', props: { identifying: true } }, null, 'nope'] },
      { id: 'lines', diagram: 'er', notation: 'idef1x', title: 'Lines only', nodeIds: ['line'] }] };
  const er2 = structuredClone(er); er2.views[0].edges[0].props.identifying = false;
  sees(er, er2, ['all', 'lines']);
  // DFD: a level that also shows Orders draws the parent level's flow from Orders once level 1 no longer shows Orders
  const { dfdKey } = await import('../src/dfd/dfd.js'), { apply } = await import('../src/core/apply.js');
  let df = read('bookshop-data-flow'); df = apply(df, dfdKey(df, df.views[0], ['dfd-ship-order'], 'D').commands); const lv = df.views.at(-1); lv.nodeIds.push('dfd-orders');
  const df2 = structuredClone(df); df2.views[0].nodeIds = df2.views[0].nodeIds.filter(x => x !== 'dfd-orders');
  sees(df, df2, [df.views[0].id, lv.id]);
  // the icons table: a cloud view drawing the icon, and a map view whose card's icon entry changed; a view drawing neither is not listed
  const aws = read('bookshop-aws'), aws2 = structuredClone(aws); aws2.icons = { ...aws2.icons, 'aws/Amazon-CloudFront': { src: 'data:image/png;base64,iVBORw0KGgo=' } };
  const d = sees(aws, aws2, aws.views.filter(v => pic(aws, v.id) !== pic(aws2, v.id)).map(v => v.id)); assert.ok(d.views.length > 0);
  aws.views.forEach(v => assert.equal(d.views.includes(v.id), pic(aws, v.id) !== pic(aws2, v.id), v.id));
  const mp = { title: 'm', icons: { db: { src: 'data:image/svg+xml;base64,PHN2Zy8+' } }, nodes: [{ id: 'a', label: 'A', icon: 'db' }, { id: 'b', label: 'B' }],
    views: [{ id: 'one', nodeIds: ['a', 'b'] }, { id: 'two', nodeIds: ['b'] }] };
  const mp2 = structuredClone(mp); mp2.icons.db = { src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIvPg==' };
  assert.deepEqual(sees(mp, mp2, ['one']).views, ['one']);
  // hostile icons tables: an Object.prototype key, an array, text; nothing throws, and a no-op lists nothing
  for (const ic of [{ __proto__: null, constructor: 1, toString: { src: 'x' } }, JSON.parse('{"__proto__": {"src": "x"}}'), [1, 2], 'icons', null]) {
    const h = { ...structuredClone(mp), icons: ic }; h.nodes[0].icon = 'constructor'; h.nodes[1].props = { icon: '__proto__' };
    assert.deepEqual(all.diff(h, h).views, []); assert.ok(Array.isArray(all.diff(mp, h).views)); }
  // no change, no view, for every example
  for (const f of ['bookshop-c4', 'bookshop-profile', 'bookshop-schema', 'bookshop-data-flow', 'bookshop-aws', 'bookshop-atlas']) assert.deepEqual(all.diff(read(f), read(f)).views, [], f);
});
