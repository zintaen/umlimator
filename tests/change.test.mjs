// diff() and drift() (#66, #68): models marked with what the map draws already, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diff, drift, validate, layout } from '../lib/umlimator.js';
import { svgOf } from '../src/draw/svg.js';
// the integration fixture holds typed views: the full bundle validates them, as the page draws them
import { validate as validateAll } from '../lib/umlimator-all.js';

// an example by its name, or the integration fixture by 'integration'
const modelUrl = f => new URL(f === 'integration' ? './fixtures/integration.json' : `../examples/${f}.json`, import.meta.url);
const fx = JSON.parse(readFileSync(modelUrl('integration')));
// a made-up pull request on the integration fixture's moped share: a queue between Trips and Payments, a rename, a card gone, a line relabelled
const next = (() => {
  const m = structuredClone(fx), sys = m.views.find(v => v.id === 'system');
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
  const d = diff(fx, next), card = id => d.model.nodes.find(n => n.id === id), line = id => d.model.edges.find(e => e.id === id);
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
  const sys = d.model.views.find(v => v.id === 'system'), was = fx.views.find(v => v.id === 'system');
  assert.ok(sys.nodeIds.includes('flags'), 'a removed card stays in its view');
  assert.deepEqual(sys.layout.flags, was.layout.flags, '…in its place');
  assert.deepEqual(validateAll(d.model), []);
  assert.deepEqual(next, (() => { const n = structuredClone(next); diff(fx, n); return n; })(), 'its inputs are left as they were');
});

test('diff() of a model with itself changes nothing; from nothing, everything is new; to nothing, everything is gone', () => {
  const same = diff(fx, fx);
  assert.deepEqual([same.summary, same.views], [[], []]);
  assert.deepEqual(same.model, fx);
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
    { parent: 'tile-cache', child: 'rider-app', callCount: 40 },        // no card for tile-cache (cdn names the cloud views' CDN cards since step 3)
  ] };
  const r = drift(fx, seen, { match: { 'trip-service': 'trips', 'fleet-service': 'fleet', 'trips-db': 'tripsdb' } });
  assert.deepEqual(r.counts, { carried: 2, undrawn: 1, idle: 3, unknown: 420, unmatched: ['tile-cache'] }); // 52 map lines (the rider shop's 11 among them; the fleet's f10 since step 4's review), the 8 of the trace's view (#96) and the shop's 8 own (api 2, checkout 6): 63; and, since step 3, the typed views' 306 model lines (the C4 worker's two to the database left in step 4's review; the components view's two interface realizations since audit 49) and 26 view-own lines; and, since step 4, dock-feed's 7 model lines and 3 own, demand's 5 own and help's 10 own
  const came = r.model.edges.filter(e => e.drift === 'undrawn'), idle = r.model.edges.filter(e => e.drift === 'idle').map(e => e.id);
  assert.deepEqual(came, [{ id: 'drift:ops-console->tripsdb', from: 'ops-console', to: 'tripsdb', label: 'not drawn', sublabel: '1,500 calls', style: 'security', drift: 'undrawn' }]);
  assert.deepEqual(idle, ['s8', 's12', 's17']); // trips→tripsdb and fleet→ops-console: both ends had traffic, these lines none
  assert.ok(r.model.edges.filter(e => e.drift === 'idle').every(e => e.style === 'faded'));
  assert.deepEqual(r.views, ['system']);
  assert.deepEqual(validateAll(r.model), []);
  assert.deepEqual(drift(fx, [{ from: 'trips', to: 'pricing' }]).counts.carried, 1, 'a plain list, without counts');
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
  const as = JSON.parse(readFileSync(modelUrl('integration'))), nul = structuredClone(as); nul.edges[1] = null;
  assert.doesNotThrow(() => diff(as, nul));
  assert.ok(diff(as, nul).summary.length > 0);
});

test('audit 19: diff() says a sequence view\'s own steps reordered, as its model lines\' are, and lists that view', () => {
  // the fixture's rider help (view-local cards and lines), its nightly forecast (lanes), its ride end and its rider shop's api
  for (const [f, vid] of [['integration', 'help'], ['integration', 'demand'], ['integration', 'ride-end'], ['integration', 'api']]) {
    const a = JSON.parse(readFileSync(modelUrl(f))), b = structuredClone(a), v = b.views.find(x => x.id === vid);
    [v.edges[0], v.edges[1]] = [v.edges[1], v.edges[0]];
    const d = diff(a, b);
    assert.deepEqual([d.summary, d.views], [[`reorders the steps in the view ${v.title || v.id}`], [vid]], f);
    assert.deepEqual(diff(a, structuredClone(a)).summary, [], f);
  }
  // an own step added or taken away is no reorder of the steps that stayed
  const as = JSON.parse(readFileSync(modelUrl('integration'))), less = structuredClone(as);
  less.views.find(x => x.id === 'help').edges.splice(1, 1);
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
  // a view that does not number its cards: nodeIds order is no step order. Its unpinned cards trade places, which is said as
  // a move (audit 42); pinned, they draw the same and nothing is said
  const p = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }, q = structuredClone(p); q.views[0].nodeIds = ['b', 'a'];
  assert.deepEqual(diff(p, q).summary, ['moves b to the start in the view v']);
  const pp = structuredClone(p); pp.views[0].layout = { a: [0, 0], b: [1, 0] }; const qq = structuredClone(pp); qq.views[0].nodeIds = ['b', 'a'];
  assert.deepEqual([diff(pp, qq).summary, diff(pp, qq).views], [[], []]);
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
  // the integration fixture's map part only: its strings are the ones this bundle's validate reads, and the three typed files cover the
  // typed strings (each string of the whole model, 52 views since step 4 of the one-model plan, cost the walk 20 s)
  const mapPart = m => ({ ...m, views: m.views.filter(v => !v.diagram), nodes: m.nodes.filter(n => !n.type), edges: m.edges.filter(e => !e.type) });
  for (const f of ['bookshop-schema', 'bookshop-timing', 'order-states', 'integration']) {
    const read = () => JSON.parse(readFileSync(modelUrl(f))), base = f === 'integration' ? mapPart(read()) : read(), was = new Set(validate(base).map(p => p.path + p.message));
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
  const m = structuredClone(fx); m.nodes[0].props = { ...(m.nodes[0].props || {}), n: 10n };
  const d = diff(fx, m); assert.ok(d.summary.length && d.model.nodes.some(n => n.change === 'changed'), d.summary);
  assert.deepEqual(diff(m, m).views, []); // the same BigInt both sides: no change
  const n = structuredClone(m); n.nodes[0].props.n = 11n; assert.ok(diff(m, n).model.nodes.some(x => x.change === 'changed'));
  for (const key of ['nodes', 'edges']) { const h = structuredClone(fx); h[key] = [...h[key]]; h[key].length += 1; delete h[key][1]; // a hole, and one at the end
    assert.doesNotThrow(() => diff(h, fx), key); assert.doesNotThrow(() => diff(fx, h), key); assert.doesNotThrow(() => validate(h), key); }
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
  const all = await fromSrc(), read = f => JSON.parse(readFileSync(modelUrl(f)));
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
  for (const f of ['bookshop-c4', 'bookshop-profile', 'bookshop-schema', 'integration']) assert.deepEqual(all.diff(read(f), read(f)).views, [], f);
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
  // a typed child: the fixture's rider shop mail card opening the composite view, one part added there
  const x = JSON.parse(readFileSync(modelUrl('integration'))); x.nodes.find(n => n.id === 'mail').opensView = 'trip-internals';
  const y = structuredClone(x); y.nodes.find(n => n.id === 'ride-service').members.push({ id: 'ride-service.audit', type: 'uml.Property', label: 'audit', props: { valueType: 'AuditLog', multiplicity: '1', aggregation: 'composite' } });
  const d = all.diff(x, y), pic = (m, v) => svgOf(all.layout(m, v)).replace(/\bg\d+-/g, 'g-');
  x.views.forEach(v => assert.equal(d.views.includes(v.id), pic(x, v.id) !== pic(y, v.id), v.id));
  assert.ok(d.views.includes('overview'));
  // hostile: a card that opens a view named for an Object.prototype key, or itself
  const H = structuredClone(A); H.nodes[0].view = 'constructor'; H.nodes.push({ id: '__proto__', view: '__proto__' }); H.views[0].nodeIds.push('__proto__', null, 7);
  const H2 = structuredClone(H); H2.views[1].nodeIds.push('db'); assert.deepEqual(all.diff(H, H2).views, ['inner']);
});

test('audit 41: diff() lists a typed view whose picture changes through a member\'s stereotype, a moved hidden element, an inline relationship, its parent view or the icons table', async () => {
  const all = await fromSrc(), read = f => JSON.parse(readFileSync(modelUrl(f)));
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
  for (const f of ['bookshop-c4', 'bookshop-profile', 'bookshop-schema', 'bookshop-data-flow', 'bookshop-aws', 'integration']) assert.deepEqual(all.diff(read(f), read(f)).views, [], f);
});

test('audit 42: diff() keys a typed card\'s icon by its view\'s pack, not by the key\'s tail in any pack', async () => {
  const all = await fromSrc(), read = f => JSON.parse(readFileSync(modelUrl(f)));
  const pic = (m, v) => svgOf(all.layout(m, v), { icons: m.icons }).replace(/\bg\d+-/g, 'g-'), png = 'data:image/svg+xml;base64,PHN2Zy8+';
  for (const [f, pack, other] of [['bookshop-aws', 'aws', 'gcp'], ['bookshop-gcp', 'gcp', 'azure'], ['bookshop-azure', 'azure', 'aws']]) {
    const m = read(f), icon = m.nodes.map(n => n.props && n.props.icon).find(x => typeof x === 'string');
    // another pack's entry of the same icon name: no card of this view draws it, so no view is listed
    const b = structuredClone(m); b.icons = { ...b.icons, [`${other}/${icon}`]: { src: png, name: icon } };
    assert.deepEqual(all.diff(m, b).views, [], `${f}: ${other}/${icon}`); m.views.forEach(v => assert.equal(pic(m, v.id), pic(b, v.id)));
    // the bare name and a key with the name as its tail in no pack: none
    const c = structuredClone(m); c.icons = { ...c.icons, [icon]: { src: png }, [`x/${icon}`]: { src: png } }; assert.deepEqual(all.diff(m, c).views, [], `${f}: bare ${icon}`);
    // its own pack's entry: each view whose picture changes, and only those
    const d = structuredClone(m); d.icons = { ...d.icons, [`${pack}/${icon}`]: { src: png, name: icon } }; const dv = all.diff(m, d).views;
    assert.ok(dv.length > 0, f); m.views.forEach(v => assert.equal(dv.includes(v.id), pic(m, v.id) !== pic(d, v.id), `${f} ${v.id}`)); }
  // hostile: a props.icon of __proto__ or constructor, a view whose diagram is __proto__, an icons key that is no text; nothing throws
  const h = read('bookshop-aws'); h.nodes.forEach((n, i) => { if (n.props && n.props.icon) n.props.icon = ['__proto__', 'constructor', '../x'][i % 3]; });
  const h2 = structuredClone(h); h2.icons = JSON.parse('{"__proto__": {"src": "x"}, "aws/constructor": {"src": "data:image/png;base64,iVBORw0KGgo="}}'); h2.views.push({ id: 'p', diagram: '__proto__', nodeIds: h.nodes.map(n => n.id) });
  assert.ok(Array.isArray(all.diff(h, h2).views)); assert.ok(all.diff(h, h2).views.includes(h.views[0].id));
});

test('audit 42: diff() says and lists a typed view whose picture changes with its nodeIds order: a sequence\'s lifelines, a timing view\'s lanes, an activity\'s partitions', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js'), read = f => JSON.parse(readFileSync(modelUrl(f)));
  const pic = (m, v) => svgOf(all.layout(m, v), { icons: m.icons }).replace(/\bg\d+-/g, 'g-');
  const moves = (m, v, id, index) => { const a = apply(m, [{ op: 'move', id, view: v.id, index }]), d = all.diff(m, a);
    assert.notEqual(pic(m, v.id), pic(a, v.id), `${v.id}'s picture changes`); assert.deepEqual(d.views, [v.id]); assert.ok(d.summary.some(s => /^moves .* in the view /.test(s)), d.summary.join('; ')); return d; };
  const sq = read('checkout-sequence'); moves(sq, sq.views[0], 'lifeline-shopper', 1);
  const tm = read('bookshop-timing'); moves(tm, tm.views[0], 'lifeline-worker', 1);
  const ac = read('fulfil-activity'), av = ac.views[0], parts = av.nodeIds.filter(id => (ac.nodes.find(n => n.id === id) || {}).type === 'uml.ActivityPartition');
  moves(ac, av, parts[0], av.nodeIds.indexOf(parts[1]));
  // and in every example: a swap of two neighbours in nodeIds is listed exactly when where the view draws its cards, lines and
  // bands changes (a map view's cards come in another document order, drawn the same: not listed, as before)
  const place = (m, v) => { const g = all.layout(m, v), at = l => (l || []).map(x => JSON.stringify([x.id, x.x, x.y, x.w, x.h, x.pts || x.d || null])).sort();
    return JSON.stringify([at(g.nodes), at(g.edges), at(g.bands), at(g.lanes), at(g.groups)]); };
  // and the integration fixture as version 1 too, the case above on a map view of a version-1 model; the fixture holds typed
  // views of every type, every one of them swapped
  for (const [f, m] of [...['bookshop-aws', 'bookshop-c4', 'integration'].map(f => [f, read(f)]),
    ['integration v1', (x => (delete x.schemaVersion, x))(read('integration'))]]) {
    for (const v of m.views) for (let i = 0; i + 1 < Math.min(arr(v.nodeIds).length, 4); i++) { const b = structuredClone(m), w = b.views.find(x => x.id === v.id);
      [w.nodeIds[i], w.nodeIds[i + 1]] = [w.nodeIds[i + 1], w.nodeIds[i]]; assert.equal(all.diff(m, b).views.includes(v.id), place(m, v.id) !== place(b, v.id), `${f} ${v.id} ${i}`); } }
  // many moved: one sentence; hostile ids (null, a number, __proto__, twice) and labels; a large view reversed stays quick
  const big = { schemaVersion: 2, title: 't', nodes: Array.from({ length: 300 }, (_, i) => ({ id: 'l' + i, type: 'uml.Lifeline', label: i ? 'L' + i : '__proto__' })), edges: [],
    views: [{ id: 's', diagram: 'uml.sequence', nodeIds: [...Array.from({ length: 300 }, (_, i) => 'l' + i), null, 7, '__proto__', 'l0'], nodeOverrides: JSON.parse('{"__proto__": {"label": 1}, "l1": "x"}') }] };
  const rev = structuredClone(big); rev.views[0].nodeIds = [...rev.views[0].nodeIds.slice(0, 300).reverse(), 'l0', '__proto__', 7, null];
  const t0 = Date.now(), d = all.diff(big, rev); assert.deepEqual(d.views, ['s']); assert.deepEqual(d.summary, ['reorders 299 cards in the view s']); assert.ok(Date.now() - t0 < 20000);
  const two = structuredClone(big); [two.views[0].nodeIds[0], two.views[0].nodeIds[1]] = ['l1', 'l0'];
  assert.deepEqual(all.diff(big, two).summary, ['moves L1 to the start in the view s']);
  assert.deepEqual(all.diff(big, big).views, []);
});
const arr = x => (Array.isArray(x) ? x : []);

test('audit 42: a story step may select a model line to a view\'s own node, which the C4 or DFD view draws (drawn and drawnKeys read the view\'s own nodes)', async () => {
  const all = await fromSrc(), { validate: check } = await import('../src/map/validate.js'), { diagramOf } = await import('../src/core/registry.js');
  const c4 = { schemaVersion: 2,
    nodes: [{ id: 'p', type: 'c4.Person', label: 'Shopper', props: { description: 'd' } }, { id: 's', type: 'c4.SoftwareSystem', label: 'Shop', props: { description: 'd' } },
      { id: 'a', type: 'c4.Container', label: 'Web', parent: 's', props: { description: 'd', technology: 'JS' } }],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'p', to: 'a', label: 'uses' }, { id: 'r2', type: 'c4.Relationship', from: 'a', to: 'x', label: 'calls' }],
    views: [{ id: 'con', diagram: 'c4.container', title: 'Containers', subject: 's', nodeIds: ['s', 'p', 'a', 'x'],
      nodes: [{ id: 'x', type: 'c4.Container', label: 'Sketch', parent: 's', props: { description: 'd', technology: 'Py' } }],
      edges: ['r1', 'r2', { id: 'r3', type: 'c4.Relationship', from: 'x', to: 'p', label: 'emails' }] }],
    stories: [{ id: 'st', title: 'S', steps: [{ view: 'con', select: 'r2' }, { view: 'con', select: 'r3' }] }] };
  const dfd = { schemaVersion: 2,
    nodes: [{ id: 'c', type: 'dfd.ExternalEntity', label: 'Customer' }, { id: 'p', type: 'dfd.Process', label: 'Take order', props: { number: '1' } }],
    edges: [{ id: 'f1', type: 'dfd.DataFlow', from: 'c', to: 'p', label: 'order' }, { id: 'f2', type: 'dfd.DataFlow', from: 'p', to: 'd', label: 'order line' }],
    views: [{ id: 'v', diagram: 'dfd', title: 'Level 1', nodeIds: ['c', 'p', 'd'], nodes: [{ id: 'd', type: 'dfd.DataStore', label: 'Scratch', props: { number: 'D1' } }] }],
    stories: [{ id: 'st', title: 'S', steps: [{ view: 'v', select: 'f2' }] }] };
  for (const [m, line] of [[c4, 'r2'], [dfd, 'f2']]) { const v = m.views[0];
    assert.ok(all.layout(m, v.id).edges.some(e => e._id === line), `${line} is drawn`);
    assert.ok(diagramOf(v).drawn(m, v).includes(line), `drawn says ${line}`);
    assert.deepEqual(check(m).filter(p => /select/.test(p.path)), [], `${line}: a story step may select it`);
    // the line's end moves to another of the view's own nodes: listed
    const b = structuredClone(m); b.views[0].nodes.push({ ...b.views[0].nodes[0], id: 'y', label: 'Other' }); b.views[0].nodeIds.push('y'); b.edges.find(e => e.id === line).to = 'y';
    assert.ok(all.diff(m, b).views.includes(v.id)); assert.deepEqual(all.diff(m, m).views, []); }
  // hostile: a view's own node of id __proto__, a line to it, a story selecting a line no view draws: still said
  const h = structuredClone(dfd); h.views[0].nodes.push({ id: '__proto__', type: 'dfd.DataStore', label: 'x', props: { number: 'D2' } }); h.views[0].nodeIds.push('__proto__');
  h.edges.push({ id: 'f3', type: 'dfd.DataFlow', from: 'p', to: '__proto__', label: 'y' }); h.stories[0].steps.push({ view: 'v', select: 'f3' }, { view: 'v', select: 'nope' });
  const said = check(h).filter(p => /select/.test(p.path)).map(p => p.message); assert.equal(said.length, 1); assert.match(said[0], /"nope"/);
});

test('audit 43: diff() lists a typed view only for what its elements name, not for an element of its own that shares the changed card\'s label', async () => {
  const { apply } = await import('../lib/umlimator.js');
  const m = { schemaVersion: 2, nodes: [{ id: 'api', label: 'Shop API', kind: 'backend' }, { id: 'web', label: 'Web' }, { id: 'c', type: 'uml.Class', label: 'Shop API' }, { id: 'd', type: 'uml.Class', label: 'Book' }],
    edges: [{ id: 'e1', from: 'web', to: 'api' }],
    views: [{ id: 'map', title: 'Map', nodeIds: ['web', 'api'] }, { id: 'classes', diagram: 'uml.class', title: 'Classes', nodeIds: ['c', 'd'] }] };
  assert.deepEqual(diff(m, apply(m, { op: 'set', id: 'api', path: 'sublabel', value: 'FastAPI' })).views, ['map']);
  // a namesake's own description or caption names nothing either; a field that does name the card (a type) still lists the view
  const n = structuredClone(m); n.nodes[3].props = { description: 'Shop API', note: 'Shop API' };
  assert.deepEqual(diff(n, apply(n, { op: 'set', id: 'api', path: 'sublabel', value: 'FastAPI' })).views, ['map']);
  const t = structuredClone(m); t.nodes[3].members = [{ id: 'd.api', type: 'uml.Property', label: 'api', props: { type: 'Shop API' } }];
  assert.deepEqual(diff(t, apply(t, { op: 'set', id: 'api', path: 'sublabel', value: 'FastAPI' })).views, ['map', 'classes']);
  // the integration fixture: renaming the rider shop's card api lists the map views
  // that draw it; renaming the map card trip-api lists the map views that draw it, not the component, C4, cloud or sequence
  // views whose own Trip API it is not
  const atlas = JSON.parse(readFileSync(modelUrl('integration')));
  assert.deepEqual(diff(atlas, apply(atlas, { op: 'set', id: 'api', path: 'label', value: 'Renamed' })).views, ['overview', 'api', 'checkout']);
  assert.ok(atlas.nodes.filter(n => n.label === 'Trip API' && n.type).length >= 5, 'the typed views\' namesakes');
  assert.deepEqual(diff(atlas, apply(atlas, { op: 'set', id: 'trip-api', path: 'label', value: 'Renamed' })).views, ['trips', 'ride-end']);
  // hostile: labels that are prototype keys or another element's id resolve to nothing they do not name
  const h = structuredClone(m); h.nodes[2].label = '__proto__'; h.nodes[3].label = 'api'; h.nodes[0].label = 'constructor';
  assert.deepEqual(diff(h, apply(h, { op: 'set', id: 'api', path: 'sublabel', value: 'x' })).views, ['map']);
});

test('audit 43: diff() of many views whose cards trade places lays out only the views whose grid slots change (timed)', () => {
  const V = 10, N = 30, nodes = [], edges = [], views = [];
  for (let v = 0; v < V; v++) { const ids = [];
    for (let i = 0; i < N; i++) { const id = `n${v}_${i}`; nodes.push({ id, label: id }); ids.push(id); if (i) edges.push({ id: `e${v}_${i}`, from: `n${v}_${Math.floor((i - 1) / 3)}`, to: id }); }
    views.push({ id: `v${v}`, title: `v${v}`, nodeIds: ids }); }
  const A = { title: 't', nodes, edges, views }, B = structuredClone(A); B.views.forEach(v => { const x = v.nodeIds; [x[1], x[2]] = [x[2], x[1]]; });
  let t = performance.now(); const d = diff(A, B), ms = performance.now() - t; console.log(`# ${V} trees of ${N} cards, siblings swapped: ${Math.round(ms)} ms`);
  assert.deepEqual([d.summary, d.views], [[], []]); assert.ok(ms < 1500, `${ms} ms`);
  // all pinned, with no lines: the same picture, said by its pins alone (with lines, the view is laid out: audit 44)
  const P = { ...structuredClone(A), edges: [] }; P.views.forEach(v => { v.layout = Object.fromEntries(v.nodeIds.map((id, i) => [id, [i % 6, Math.floor(i / 6)]])); });
  const Q = structuredClone(P); Q.views.forEach(v => { v.nodeIds.reverse(); });
  t = performance.now(); assert.deepEqual(diff(P, Q).summary, []); assert.ok(performance.now() - t < 1500);
  // cards with no lines that trade slots are still said, the view laid out
  const F = { nodes: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase() })), edges: [], views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b', 'c', 'd'] }] }, G = structuredClone(F); G.views[0].nodeIds = ['b', 'a', 'c', 'd'];
  assert.deepEqual([diff(F, G).summary, diff(F, G).views], [['moves B to the start in the view V'], ['v']]);
});

test('audit 44: diff() says a fully pinned view whose reorder routes its lines another way, and lists it; one whose picture holds is not said', () => {
  // twelve cards, each pinned, their order shuffled: no card moves, but lines e11 and e12 take other ports and tracks
  const m = {"nodes":[{"id":"n0","label":"Card 0"},{"id":"n1","label":"Card 1"},{"id":"n2","label":"Card 2"},{"id":"n3","label":"Card 3"},{"id":"n4","label":"Card 4"},{"id":"n5","label":"Card 5"},{"id":"n6","label":"Card 6"},{"id":"n7","label":"Card 7"},{"id":"n8","label":"Card 8"},{"id":"n9","label":"Card 9"},{"id":"n10","label":"Card 10"},{"id":"n11","label":"Card 11"}],"edges":[{"id":"e1","from":"n7","to":"n2"},{"id":"e2","from":"n11","to":"n10","label":"calls"},{"id":"e3","from":"n2","to":"n1"},{"id":"e5","from":"n4","to":"n10"},{"id":"e6","from":"n2","to":"n3"},{"id":"e7","from":"n2","to":"n8"},{"id":"e8","from":"n5","to":"n7","label":"calls"},{"id":"e9","from":"n10","to":"n11"},{"id":"e10","from":"n1","to":"n5","label":"calls"},{"id":"e11","from":"n8","to":"n0","label":"calls"},{"id":"e12","from":"n0","to":"n2"},{"id":"e13","from":"n10","to":"n3","label":"calls"},{"id":"e14","from":"n4","to":"n3","label":"calls"},{"id":"e15","from":"n2","to":"n9"},{"id":"e16","from":"n7","to":"n6"},{"id":"e17","from":"n4","to":"n3","label":"calls"}],"views":[{"id":"v","label":"V","nodeIds":["n0","n1","n2","n3","n4","n5","n6","n7","n8","n9","n10","n11"],"layout":{"n0":[0,0],"n1":[0,3],"n2":[3,1],"n3":[0,1],"n4":[3,2],"n5":[1,2],"n6":[1,1],"n7":[2,2],"n8":[3,3],"n9":[1,3],"n10":[2,3],"n11":[3,0]}}]};
  const b = structuredClone(m); b.views[0].nodeIds = ["n8","n6","n11","n0","n7","n4","n10","n3","n2","n5","n1","n9"];
  const lines = g => JSON.stringify(Object.fromEntries(g.edges.map(e => [e._id ?? e.id, e.pts])));
  assert.notEqual(lines(layout(m, 'v')), lines(layout(b, 'v')));
  assert.deepEqual([diff(m, b).summary, diff(m, b).views], [['reorders 8 cards in the view v'], ['v']]);
  // the same view with no lines: the pins say the whole picture, nothing is said
  const m0 = { ...m, edges: [] }, b0 = { ...b, edges: [] }; assert.deepEqual([diff(m0, b0).summary, diff(m0, b0).views], [[], []]);
  // pinned with one line whose reorder leaves its route alone: laid out, and still nothing said
  const p = { nodes: ['a', 'b', 'c'].map(id => ({ id, label: id })), edges: [{ id: 'e', from: 'a', to: 'b' }], views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b', 'c'], layout: { a: [0, 0], b: [1, 0], c: [2, 0] } }] };
  const q = structuredClone(p); q.views[0].nodeIds = ['c', 'b', 'a']; assert.deepEqual(diff(p, q).summary, []);
  // hostile: pins and ids that are prototype keys, a pin that is no pair, a line to a card that is not there
  const h = structuredClone(m); h.nodes.push({ id: '__proto__', label: 'x' }); h.views[0].nodeIds.push('__proto__', 'constructor'); h.views[0].layout.__proto__ = 'x'; h.edges.push({ id: 'eh', from: 'n0', to: 'gone' });
  const k = structuredClone(h); k.views[0].nodeIds.reverse(); assert.doesNotThrow(() => diff(h, k));
});

test('audit 44: a typed view draws diff()\'s marks as a map does: a removed element faded, dashed and struck through, an added or changed one tabbed, each said in its name', async () => {
  const all = await fromSrc(), read = f => JSON.parse(readFileSync(modelUrl(f)));
  const tagOf = (s, id) => { const a = s.lastIndexOf('<g', s.indexOf(`data-id="${id}"`)); return s.slice(a, s.indexOf('>', a) + 1); };
  const bodyOf = (s, id) => { const a = s.lastIndexOf('<g', s.indexOf(`data-id="${id}"`)); let d = 0, i = a; const re = /<g\b|<\/g>/g; re.lastIndex = a;
    for (let m; (m = re.exec(s));) { d += m[0] === '</g>' ? -1 : 1; if (!d) { i = m.index + 4; break; } } return s.slice(a, i); };
  const keyOf = (s, id) => (s.match(new RegExp(`data-node="${id}"[^>]*aria-label="([^"]*)"`)) || [])[1];
  // the class example: OrderStatus removed with its lines, Customer renamed to Client, Coupon added
  const a = read('sales-classes'), b = structuredClone(a);
  b.nodes = b.nodes.filter(n => n.id !== 'status'); b.edges = b.edges.filter(e => e.from !== 'status' && e.to !== 'status');
  b.views.forEach(v => { v.nodeIds = v.nodeIds.filter(i => i !== 'status'); }); b.nodes.find(n => n.id === 'customer').label = 'Client';
  b.nodes.push({ id: 'coupon', type: 'uml.Class', label: 'Coupon', parent: 'sales' }); b.views[0].nodeIds.push('coupon');
  const d = all.diff(a, b), s = svgOf(all.layout(d.model, b.views[0].id));
  assert.deepEqual(d.summary, ['renames Customer to Client', 'adds Coupon', 'removes OrderStatus']);
  assert.match(tagOf(s, 'status'), /aria-label="Enumeration OrderStatus, 4 literals, removed"/); assert.doesNotMatch(tagOf(s, 'status'), /opacity/); assert.match(bodyOf(s, 'status'), /<(rect|path)\b[^>]*opacity="\.6"/); // its outlines faded, not its group (audit 45) assert.match(tagOf(s, 'status'), /stroke-dasharray="6 4"/);
  const texts = bodyOf(s, 'status').match(/<text\b[^>]*>/g).filter(t => !/badge-tx/.test(t)); assert.ok(texts.length > 1 && texts.every(t => /line-through/.test(t)), 'every text of the removed class struck through');
  assert.match(bodyOf(s, 'status'), />REMOVED<\/text>/); assert.match(bodyOf(s, 'coupon'), />NEW<\/text>/); assert.match(bodyOf(s, 'customer'), />CHANGED<\/text>/);
  assert.match(tagOf(s, 'coupon'), /, new"/); assert.match(tagOf(s, 'customer'), /, changed"/); assert.doesNotMatch(tagOf(s, 'customer'), /opacity/);
  assert.match(keyOf(s, 'coupon'), /, new$/); assert.match(keyOf(s, 'status'), /, removed$/);
  // an element that did not change draws as before
  assert.equal(bodyOf(s, 'order').replace(/\bg\d+-/g, 'g-'), bodyOf(svgOf(all.layout(b, b.views[0].id)), 'order').replace(/\bg\d+-/g, 'g-'));
  // the ER example: payment removed, customer renamed; the flowchart: a step removed, one added
  const er = read('bookshop-schema'), er2 = structuredClone(er); er2.nodes = er2.nodes.filter(n => n.id !== 'er-payment'); er2.edges = er2.edges.filter(e => e.from !== 'er-payment' && e.to !== 'er-payment');
  er2.views[0].nodeIds = er2.views[0].nodeIds.filter(i => i !== 'er-payment'); er2.nodes.find(n => n.id === 'er-customer').label = 'client';
  const se = svgOf(all.layout(all.diff(er, er2).model, 'er-schema'));
  assert.match(tagOf(se, 'er-payment'), /, removed"/); assert.match(bodyOf(se, 'er-payment'), /<(rect|path)\b[^>]*opacity="\.6"/); assert.match(tagOf(se, 'er-customer'), /, changed"/); assert.match(bodyOf(se, 'er-payment'), /line-through/);
  const fc = read('returns-flowchart'), fc2 = structuredClone(fc); fc2.nodes = fc2.nodes.filter(n => n.id !== 'wait'); fc2.edges = fc2.edges.filter(e => e.from !== 'wait' && e.to !== 'wait');
  fc2.views[0].nodeIds = fc2.views[0].nodeIds.filter(i => i !== 'wait'); fc2.nodes.push({ id: 'note-it', type: 'flow.Process', label: 'Log the return' }); fc2.views[0].nodeIds.push('note-it');
  const sf = svgOf(all.layout(all.diff(fc, fc2).model, 'returns'));
  assert.match(tagOf(sf, 'wait'), /, removed"/); assert.match(tagOf(sf, 'note-it'), /, new"/);
  // the lines diff() marks on a typed view keep their marks: a removed one rose and dashed
  assert.match(s, /stroke="var\(--um-rose\)"/);
  // every typed example with every element marked in turn: each element's name says its mark, and no tag holds an attribute twice
  for (const f of ['sales-classes', 'bookshop-schema', 'returns-flowchart', 'bookshop-c4', 'order-states', 'bookshop-data-flow', 'ebike-blocks', 'shopping-use-cases']) {
    const m = read(f), x = structuredClone(m); x.nodes.forEach((n, i) => { n.change = ['added', 'changed', 'removed', 'planned'][i % 4]; });
    for (const v of m.views.filter(v => v.diagram && v.diagram !== 'map')) { const g = all.layout(x, v.id), t = svgOf(g);
      g.nodes.filter(n => n.change && t.includes(`data-id="${n.id}"`)).forEach(n => assert.match(tagOf(t, n.id), /, (new|changed|removed|planned)"/, `${f} ${v.id} ${n.id}`));
      (t.match(/<(g|text|rect)\b[^>]*>/g) || []).forEach(tag => { const at = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map(y => y[1]); assert.equal(new Set(at).size, at.length, `${f}: ${tag}`); }); } }
  // hostile: a change that is a prototype key, an object or a quote, and a label that closes the tag, mark nothing and break nothing
  const h = structuredClone(b); h.nodes.find(n => n.id === 'order').change = '__proto__'; h.nodes.find(n => n.id === 'line').change = { toString: 'x' };
  h.nodes.find(n => n.id === 'coupon').change = '" onload="x'; h.nodes.find(n => n.id === 'customer').label = '"><script>alert(1)</script>'; h.nodes.find(n => n.id === 'customer').change = 'removed';
  const sh = svgOf(all.layout(h, h.views[0].id));
  assert.doesNotMatch(sh, /<script|onload=/); ['order', 'line', 'coupon'].forEach(id => assert.doesNotMatch(tagOf(sh, id), /data-change/)); assert.match(tagOf(sh, 'customer'), /data-change="removed"/);
});

// audit 45: the marks diff() puts on what a typed view draws but the model does not hold as a card or a model line
const read45 = f => JSON.parse(readFileSync(modelUrl(f)));
const tag45 = (s, at) => { const i = s.indexOf(at); if (i < 0) return null; const a = s.lastIndexOf('<g', i); return s.slice(a, s.indexOf('>', a) + 1); };
const keyAt45 = (s, i) => (s.match(new RegExp(`class="um-key line-key[^"]*" data-i="${i}"[^>]*aria-label="([^"]*)"`)) || [])[1];

test('audit 45: every typed view of the atlas draws each mark on what it draws: its shapes, its boxes, its own lines, its fragments and its implied lines, each said in its name and key', async () => {
  // the integration fixture holds a typed view of every type: every one of them
  const all = await fromSrc(), m = read45('integration'), W = ['added', 'changed', 'removed', 'planned'], WL = ['added', 'changed', 'removed'], word = { added: 'new', changed: 'changed', removed: 'removed', planned: 'planned' };
  const x = structuredClone(m); let k = 0;
  const deep = o => { const s = [o]; while (s.length) { const y = s.pop(); if (!y || typeof y !== 'object') continue; y.change = W[k++ % 4]; (y.members || []).forEach(z => s.push(z)); } };
  x.nodes.forEach(deep); x.edges.forEach(e => { e.change = WL[k++ % 3]; });
  x.views.forEach(v => { (v.fragments || []).forEach(deep); (v.edges || []).forEach(e => { if (e && typeof e === 'object') e.change = WL[k++ % 3]; }); });
  let boxes = 0, own = 0;
  for (const v of x.views.filter(v => v.diagram && v.diagram !== 'map')) {
    const g = all.layout(x, v.id), s = svgOf(g), at = `${v.diagram} ${v.id}`;
    for (const f of g.families || []) { if (!f.change) continue; boxes++; const t = tag45(s, `data-family="${f.id}"`);
      assert.ok(t, `${at}: box ${f.id} drawn`); assert.match(t, new RegExp(`data-change="${word[f.change]}"`), `${at}: ${f.id}`); if (/aria-label/.test(t)) assert.match(t, new RegExp(`, ${word[f.change]}"`), `${at}: ${f.id}`); }
    // what the view owns itself (a message, a fragment, an operand) is marked as the model has it
    const mine = new Map([...(v.edges || []), ...(v.fragments || [])].flatMap(function f(y) { return y && typeof y === 'object' ? [[y.id, y.change], ...(y.members || []).flatMap(f)] : []; }));
    g.nodes.filter(n => mine.has(n.id)).forEach(n => { own++; assert.equal(n.change, mine.get(n.id), `${at}: ${n.id}`); assert.match(tag45(s, `data-id="${n.id}"`), new RegExp(`, ${word[n.change]}"`), `${at}: ${n.id}`); });
    g.edges.forEach((e, i) => { const id = e._id ?? e.id; if (mine.has(id)) { own++; assert.equal(e.change, mine.get(id), `${at}: ${id}`); }
      if (Array.isArray(e.implied)) assert.ok(e.change, `${at}: implied ${id}`);
      const key = keyAt45(s, i); if (e.change && key != null) assert.ok(key.endsWith(', ' + word[e.change]), `${at}: ${id} ${key}`); });
    (s.match(/<(g|text|rect|path|circle|ellipse|line|polygon|polyline)\b[^>]*(data-change|opacity|line-through)[^>]*>/g) || []).forEach(tg => { ['opacity', 'data-change', 'stroke-dasharray', 'text-decoration', 'aria-label'].forEach(n => assert.ok(tg.split(` ${n}=`).length <= 2, `${at}: ${n} twice in ${tg}`)); }); }
  assert.ok(boxes > 30 && own > 30, `boxes ${boxes}, own ${own}`);
});

test('audit 45: a sequence\'s, a timing\'s and a class view\'s own lines carry diff()\'s marks: a removed message rose and dashed, an added one green, each said in its key and title; an inline interaction\'s messages too', async () => {
  const all = await fromSrc(), lineOf = (s, i) => (s.match(new RegExp(`<g class="edge-g[^"]*"[^>]*data-i="${i}">[\\s\\S]*?</g>`)) || [''])[0];
  // the sequence: m2 removed, m1 relabelled, mx added
  const a = read45('checkout-sequence'), b = structuredClone(a), E = b.views[0].edges;
  E.splice(1, 1); E[0].label = 'checkout(cart)'; E.push({ id: 'mx', type: 'uml.Message', from: 'lifeline-api', to: 'lifeline-payments', label: 'audit()', props: { sort: 'call' } });
  const g = all.layout(all.diff(a, b).model, 'checkout-sequence'), s = svgOf(g), at = id => g.edges.findIndex(e => e.id === id);
  assert.deepEqual(['m1', 'm2', 'mx', 'm3'].map(id => g.edges[at(id)].change ?? null), ['changed', 'removed', 'added', null]);
  // audit 47: rose and faded with its notation's stroke, a call's solid one (dashed, it read as a reply)
  assert.match(lineOf(s, at('m2')), /class="edge" stroke="var\(--um-rose\)"  opacity="0\.7"/); assert.doesNotMatch(lineOf(s, at('m2')), /stroke-dasharray/); assert.match(lineOf(s, at('mx')), /class="edge[^"]*" stroke="var\(--um-green\)"/);
  assert.match(lineOf(s, at('m1')), /class="edited-dot"/); assert.match(lineOf(s, at('m2')), /<title>Message: [^<]*, removed<\/title>/); // no place among the live ones (audit 51)
  assert.match(keyAt45(s, at('m2')), /, removed$/); assert.match(keyAt45(s, at('mx')), /, new$/); assert.match(keyAt45(s, at('m1')), /, changed$/); assert.doesNotMatch(keyAt45(s, at('m3')), /, (new|changed|removed)$/);
  // its fragments: one whose operator changed is CHANGED; one removed with its messages comes back REMOVED
  const c = structuredClone(a); c.views[0].fragments.find(f => f.id === 'f2').props.operator = 'loop';
  const sc = svgOf(all.layout(all.diff(a, c).model, 'checkout-sequence'));
  assert.match(tag45(sc, 'data-id="f2"'), /aria-label="Combined fragment loop, 1 operand, changed" data-change="changed"/); assert.doesNotMatch(tag45(sc, 'data-id="f1"'), /data-change/);
  const r = structuredClone(a), v = r.views[0], gone = new Set(v.fragments.find(f => f.id === 'f2').members.map(o => o.id));
  v.fragments = v.fragments.filter(f => f.id !== 'f2'); v.edges = v.edges.filter(e => !gone.has(e.parent));
  const sr = svgOf(all.layout(all.diff(a, r).model, 'checkout-sequence'));
  assert.match(tag45(sr, 'data-id="f2"'), /, removed" data-change="removed" stroke-dasharray="6 4"/); assert.match(sr, /data-node="f2"[^>]*aria-label="[^"]*, removed"/);
  // timing: an added message
  const t0 = read45('bookshop-timing'), t1 = structuredClone(t0);
  t1.views[0].edges.push({ id: 'm-poll', type: 'uml.Message', from: 'lifeline-worker', to: 'lifeline-payments', label: 'poll', props: { sort: 'async', sentAt: 400, receivedAt: 420 } });
  const gt = all.layout(all.diff(t0, t1).model, 'one-charge'), st = svgOf(gt), it = gt.edges.findIndex(e => e.id === 'm-poll');
  assert.equal(gt.edges[it].change, 'added'); assert.match(lineOf(st, it), /stroke="var\(--um-green\)"/); assert.match(keyAt45(st, it), /, new$/);
  // a class view's own association, removed and added: the key says it, as a model line's does
  const N = (id, l) => ({ id, type: 'uml.Class', label: l }), mk = own => ({ schemaVersion: 2, nodes: [N('a', 'A'), N('b', 'B')], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'], edges: own }] });
  const l = [{ id: 'l', type: 'uml.Association', from: 'a', to: 'b' }];
  assert.match(svgOf(all.layout(all.diff(mk(l), mk([])).model, 'v')), /aria-label="Association from A to B, removed"/);
  assert.match(svgOf(all.layout(all.diff(mk([]), mk(l)).model, 'v')), /aria-label="Association from A to B, new"/);
  // an inline interaction draws its sequence's removed message rose and dashed, an added one green
  const o0 = read45('buy-book-overview'), o1 = structuredClone(o0), q = o1.views.find(w => w.id === 'queue-order');
  q.edges = q.edges.slice(1); q.edges.push({ ...structuredClone(q.edges[0]), id: 'q-new', label: 'again' });
  const so = svgOf(all.layout(all.diff(o0, o1).model, 'buy-book')), msgs = so.match(/<g class="ov-msg"[^>]*><path [^>]*>/g);
  assert.equal(msgs.filter(x => /stroke="var\(--um-rose\)" stroke-width="1.4" stroke-dasharray="5 5"/.test(x)).length, 1); assert.equal(msgs.filter(x => /stroke="var\(--um-green\)"/.test(x)).length, 1);
  assert.doesNotMatch(svgOf(all.layout(o0, 'buy-book')), /ov-msg"[^>]*><path [^>]*(um-rose|um-green)/);
});

test('audit 45: a line diff() marks changed on a typed view draws its edited dot, as a map\'s does, and its title says changed', async () => {
  const all = await fromSrc();
  for (const [f, v] of [['bookshop-schema', 'er-schema'], ['returns-flowchart', 'returns'], ['bookshop-data-flow', 'dfd-level-1'], ['order-information-flow', 'order-flows'], ['bookshop-c4', 'c4-context']]) {
    const a = read45(f), b = structuredClone(a), e0 = b.edges.find(e => all.layout(a, v).edges.some(x => (x._id ?? x.id) === e.id));
    if (e0.label) e0.label = String(e0.label) + ' (v2)'; else e0.props = { ...e0.props, conveyed: ['Refund'] };
    const g = all.layout(all.diff(a, b).model, v), s = svgOf(g), i = g.edges.findIndex(x => (x._id ?? x.id) === e0.id), line = (s.match(new RegExp(`<g class="edge-g[^"]*"[^>]*data-i="${i}">[\\s\\S]*?</g>`)) || [''])[0];
    assert.equal((s.match(/class="edited-dot"/g) || []).length, 1, f); assert.match(line, /class="edited-dot"/, f); assert.match(line, /, changed<\/title>/, f);
    assert.equal((svgOf(all.layout(a, v)).match(/class="edited-dot"/g) || []).length, 0, f); }
});

test('audit 45: a C4 implied relationship drawn for one an edit added or removed is drawn added or removed, and says so', async () => {
  const all = await fromSrc(), base = { schemaVersion: 2, nodes: [{ id: 'P', type: 'c4.Person', label: 'Shopper' }, { id: 'S', type: 'c4.SoftwareSystem', label: 'Shop' },
    { id: 'web', type: 'c4.Container', label: 'Web', parent: 'S' }, { id: 'Pay', type: 'c4.SoftwareSystem', label: 'Pay', props: { external: true } }],
  edges: [{ id: 'r0', type: 'c4.Relationship', from: 'P', to: 'S', label: 'visits' }], views: [{ id: 'ctx', diagram: 'c4.context', subject: 'S', nodeIds: ['P', 'S', 'Pay'] }] };
  const rel = (id, label) => ({ id, type: 'c4.Relationship', from: 'web', to: 'Pay', label }), withRel = (...r) => { const m = structuredClone(base); m.edges.push(...r); return m; };
  const drawn = (a, b) => { const g = all.layout(all.diff(a, b).model, 'ctx'), i = g.edges.findIndex(e => Array.isArray(e.implied)), s = svgOf(g); return [g.edges[i].change, keyAt45(s, i), s]; };
  const [c1, k1, s1] = drawn(base, withRel(rel('r1', 'charges'))); assert.equal(c1, 'added'); assert.match(k1, /, new$/); assert.match(s1, /class="edge[^"]*" stroke="var\(--um-green\)"/);
  const [c2, k2, s2] = drawn(withRel(rel('r1', 'charges')), base); assert.equal(c2, 'removed'); assert.match(k2, /, removed$/); assert.match(s2, /stroke="var\(--um-rose\)" stroke-dasharray/);
  // standing for one that stayed and one that came: changed; for none that changed: unmarked
  assert.equal(drawn(withRel(rel('r1', 'charges')), withRel(rel('r1', 'charges'), rel('r2', 'refunds')))[0], 'changed');
  assert.equal(drawn(withRel(rel('r1', 'charges')), withRel(rel('r1', 'charges')))[0], undefined);
});

test('audit 45: a box a typed view draws for an element (a package, a component, a node, a boundary, a cloud group, a composite state and its regions) is marked as a shape is', async () => {
  const all = await fromSrc();
  const cases = [['bookshop-packages', 'shared'], ['bookshop-deployment', 'shopper-device'], ['bookshop-components', 'shop-api'], ['order-service-structure', 'order-service'], ['bookshop-gcp', 'gcp-project'], ['order-states', 'fulfilling'], ['sales-classes', 'sales'], ['bookshop-c4', 'c4-bookshop']];
  for (const [f, id] of cases) { const a = read45(f), v = a.views.find(w => (w.diagram === 'c4.container') || f !== 'bookshop-c4').id, b = structuredClone(a); b.nodes.find(n => n.id === id).label = 'Zrenamed';
    const s = svgOf(all.layout(all.diff(a, b).model, v)), t = tag45(s, `data-family="${id}"`);
    assert.ok(t, `${f} ${id} drawn as a box`); assert.match(t, /, changed" data-change="changed"/, f); assert.doesNotMatch(t, /opacity/, f);
    assert.match(s.slice(s.indexOf(`data-family="${id}"`)), /^[^]*?<g class="change-tab" aria-hidden="true">[^]*?>CHANGED<\/text>/, f);
    assert.doesNotMatch(tag45(svgOf(all.layout(a, v)), `data-family="${id}"`), /data-change/, f); }
  // removed with what it holds: faded outlines, its title struck through, a REMOVED tab; its regions too
  const a = read45('order-states'), b = structuredClone(a), gone = new Set(['fulfilling', ...a.nodes.find(n => n.id === 'fulfilling').members.map(r => r.id)]);
  b.nodes.forEach(n => { if (gone.has(n.parent)) gone.add(n.id); });
  b.nodes = b.nodes.filter(n => !gone.has(n.id)); b.edges = b.edges.filter(e => !gone.has(e.from) && !gone.has(e.to)); b.views.forEach(v => { v.nodeIds = v.nodeIds.filter(i => !gone.has(i)); });
  const g = all.layout(all.diff(a, b).model, 'order-life'), s = svgOf(g), boxes = (g.families || []).filter(f => f.change === 'removed');
  assert.ok(boxes.length >= 2, 'the composite state and its regions'); boxes.forEach(f => { const at = s.indexOf(`data-family="${f.id}"`), body = s.slice(at, s.indexOf('class="change-tab"', at));
    assert.match(tag45(s, `data-family="${f.id}"`), /data-change="removed" stroke-dasharray="6 4"/); assert.match(body, /class="family-box"[^>]*opacity="\.6"/); });
  assert.match(s, /class="family-title"[^>]*text-decoration="line-through"/);
  // a box of a SysML package, added
  const p0 = read45('ebike-blocks'), p1 = structuredClone(p0), bdd = p1.views[0];
  p1.nodes.push({ id: 'pkg-acc', type: 'uml.Package', label: 'Accessories' }, { id: 'rack', type: 'sysml.Block', label: 'Rack', parent: 'pkg-acc' }); bdd.nodeIds.push('pkg-acc', 'rack');
  assert.match(tag45(svgOf(all.layout(all.diff(p0, p1).model, bdd.id)), 'data-family="pkg-acc"'), /, new" data-change="new"/);
});

test('audit 45: a removed shape fades its outlines, never its group (the page takes a group\'s opacity off) nor a vendor\'s icon', async () => {
  const all = await fromSrc(), a = read45('bookshop-aws'), icon = a.nodes.find(n => n.id === 'aws-db').props.icon;
  a.icons = { ['aws/' + icon]: { src: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>').toString('base64'), name: 'Amazon RDS' } };
  const b = structuredClone(a);
  b.nodes = b.nodes.filter(n => n.id !== 'aws-db'); b.edges = b.edges.filter(e => e.from !== 'aws-db' && e.to !== 'aws-db'); b.views.forEach(v => { v.nodeIds = v.nodeIds.filter(i => i !== 'aws-db'); });
  const s = svgOf(all.layout(all.diff(a, b).model, a.views[0].id)), i = s.indexOf('data-id="aws-db"'), card = s.slice(s.lastIndexOf('<g', i), s.indexOf('class="change-tab"', i));
  assert.match(tag45(s, 'data-id="aws-db"'), /data-change="removed"/); assert.doesNotMatch(tag45(s, 'data-id="aws-db"'), /opacity/);
  assert.match(card, /class="n-body"[^>]*opacity="\.6"/); assert.match(card, /<image class="cl-icon"/);
  assert.doesNotMatch(card, /<image[^>]*opacity|class="n-logo[^"]*"[^>]*opacity/, 'the icon and its tile drawn as they are');
  assert.ok([...card.matchAll(/<g\b[^>]*>/g)].every(m => !/ opacity=/.test(m[0])), 'no group around the icon faded');
});

test('audit 45: a map line diff() adds or removes says so in its key and title', async () => {
  const all = await fromSrc();
  const a = { title: 'm', nodes: [{ id: 'a', label: 'Shop' }, { id: 'b', label: 'DB' }, { id: 'c', label: 'Cache' }, { id: 'x', label: 'Old' }],
    edges: [{ id: 'e1', from: 'a', to: 'b', label: 'reads' }, { id: 'e2', from: 'a', to: 'x' }], views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b', 'c', 'x'] }] };
  const b = structuredClone(a); b.edges = [b.edges[0], { id: 'e3', from: 'a', to: 'c', label: 'caches' }]; b.nodes = b.nodes.filter(n => n.id !== 'x'); b.views[0].nodeIds = ['a', 'b', 'c'];
  const s = svgOf(all.layout(all.diff(a, b).model, 'v')), keys = [...s.matchAll(/class="um-key line-key[^"]*"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(keys.sort(), ['Line from Shop to Cache: caches, new', 'Line from Shop to DB: reads', 'Line from Shop to Old, removed']);
  assert.match(s, /<title>Shop → Old, removed<\/title>/);
});

test('audit 45: a change in another case draws as its lower-case one; validate() says one the renderer has no mark for', async () => {
  const all = await fromSrc();
  // "Removed" draws as "removed" does: a map card faded and dashed, a map line rose, a typed line rose
  const m = { title: 'm', nodes: [{ id: 'a', label: 'Shop', change: 'Removed' }, { id: 'b', label: 'DB', change: 'removed' }], edges: [{ id: 'e', from: 'a', to: 'b', change: 'Removed', kind: 'calls' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const sm = svgOf(all.layout(m, 'v')), body = id => (sm.match(new RegExp(`data-id="${id}"[\\s\\S]*?class="n-body"[^>]*>`)) || [''])[0].replace(/^[\s\S]*</, '<').replace(/ x="[^"]*"/, '');
  assert.equal(body('a').replace(/ (x|y)="[^"]*"/g, ''), body('b').replace(/ (x|y)="[^"]*"/g, '')); assert.match(body('a'), /stroke-dasharray="6 4" opacity="\.6"/);
  assert.match(sm, /class="edge[^"]*" stroke="var\(--um-rose\)"/);
  const t = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }], edges: [{ id: 'l', type: 'uml.Association', from: 'a', to: 'b', change: 'REMOVED' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] };
  assert.match(svgOf(all.layout(t, 'v')), /class="edge[^"]*" stroke="var\(--um-rose\)"/);
  // validate(): a change with no mark, a card's, a member's, a line's (a line is not planned), a view's own line's
  const w = validate({ nodes: [{ id: 'a', change: 'bogus' }, { id: 'b', change: 'Removed', members: [{ id: 'm', change: 'nope' }] }], edges: [{ id: 'e', from: 'a', to: 'b', change: 'planned' }, { id: 'f', from: 'a', to: 'b', change: 'Added' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: [{ id: 'q', from: 'a', to: 'b', change: '__proto__' }] }] }).filter(p => /change$/.test(p.path)).map(p => p.path);
  // audit 47: one rule for the letter case: "Removed" and "Added" draw, and validate() says to write them in lower case, as the schema lists them
  assert.deepEqual(w, ['nodes[0].change', 'nodes[1].change', 'nodes[1].members[0].change', 'edges[0].change', 'edges[1].change', 'views[0].edges[0].change']);
  assert.deepEqual(validate(all.diff(read45('checkout-sequence'), read45('sales-classes')).model).filter(p => /change$/.test(p.path)), [], 'what diff() writes is valid');
});

test('audit 45: hostile marks: a change on a box, a fragment or an own line that is a prototype key, an object or a quote marks nothing; a box\'s or a line\'s name that closes its tag stays text; nothing names a URL', async () => {
  const all = await fromSrc(), a = read45('checkout-sequence'), b = structuredClone(a), v = b.views[0];
  v.fragments[0].change = '__proto__'; v.fragments[1].change = { toString: 'removed' }; v.edges[0].change = '" onload="x'; v.edges[1].change = 'constructor';
  v.edges[2].label = '"><image href="https://track.example/p.gif"/><script>x</script>'; v.edges[2].change = 'removed';
  const s = svgOf(all.layout(b, 'checkout-sequence'));
  assert.doesNotMatch(s, /<script|onload="|<image|href="http/); assert.equal((s.match(/data-change=/g) || []).length, 0, 'a message is marked by its line, not a data-change');
  ['f1', 'f2'].forEach(id => assert.doesNotMatch(tag45(s, `data-id="${id}"`), /data-change/));
  const p = read45('bookshop-packages'), q = structuredClone(p); q.nodes.find(n => n.id === 'shared').change = 'removed'; q.nodes.find(n => n.id === 'shared').label = '"><image href="https://track.example/p.gif"/>';
  q.nodes.find(n => n.id === 'catalog').change = '__proto__';
  const sp = svgOf(all.layout(q, q.views[0].id));
  assert.doesNotMatch(sp, /<image|href="http/); assert.match(tag45(sp, 'data-family="shared"'), /data-change="removed"/); assert.doesNotMatch(tag45(sp, 'data-family="catalog"') || '', /data-change/);
});

// audit 45: bpMark wrote stroke-width="1.5" and then the gear's teeth's and the timer's hands' own, so those tags held
// stroke-width twice (no well-formed XML; the page kept the first, so the teeth and hands drew at 1.5). Every view of every
// example, and a hostile BPMN model, is drawn: no tag holds an attribute twice, and the teeth and hands carry 2.5 and 1.2
test('audit 45: no tag of any example\'s views holds an attribute twice; a service task\'s gear teeth draw at 2.5, a timer\'s hands at 1.2', async () => {
  const all = await fromSrc(), { readdirSync } = await import('node:fs');
  const twice = t => (t.match(/<[a-zA-Z][\w:-]*\b[^>]*>/g) || []).filter(tag => { const at = [...tag.replace(/"[^"]*"/g, '""').matchAll(/\s([a-zA-Z_:][\w:.-]*)=/g)].map(y => y[1]); return new Set(at).size !== at.length; });
  let views = 0;
  for (const f of [...readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)), 'integration']) { // and the fixture's views of every type
    const m = JSON.parse(readFileSync(modelUrl(f)));
    for (const v of m.views || []) { assert.deepEqual(twice(svgOf(all.layout(m, v.id))), [], `${f} ${v.id}`); views++; } }
  assert.ok(views > 40, `${views} views drawn`);
  const bp = label => ({ schemaVersion: 2, nodes: [{ id: 's', type: 'bpmn.StartEvent', label, props: { definition: 'timer' } }, { id: 't', type: 'bpmn.Task', label, props: { taskType: 'service' } }, { id: 'e', type: 'bpmn.EndEvent' }],
    edges: [{ id: 'f1', type: 'bpmn.SequenceFlow', from: 's', to: 't' }, { id: 'f2', type: 'bpmn.SequenceFlow', from: 't', to: 'e' }], views: [{ id: 'v', diagram: 'bpmn', nodeIds: ['s', 't', 'e'] }] });
  for (const label of ['Charge', '" stroke-width="9', '"/><path stroke-width="9', 2024]) {
    const t = svgOf(all.layout(bp(label), 'v'));
    assert.deepEqual(twice(t), [], String(label)); assert.doesNotMatch(t, /stroke-width="9"/);
    const marks = [...t.matchAll(/<path d="([^"]*)" class="bp-mark"[^>]*stroke-width="([\d.]+)"/g)];
    assert.ok(marks.some(([, d, w]) => (d.match(/M/g) || []).length === 8 && w === '2.5'), 'the gear\'s eight teeth at 2.5');
    assert.ok(marks.some(([, d, w]) => /v2M/.test(d) && w === '1.2'), 'the timer\'s ticks and hands at 1.2');
  }
});

// audit 46: marks on what a type draws for a model line, a member, or from what it does not draw itself
test('audit 46: a communication view\'s message rows carry diff()\'s marks: a removed message faded and struck, an added one new, a changed one changed, each said in its name', async () => {
  const all = await fromSrc(), a = read45('checkout-communication'), b = structuredClone(a), E = b.views.find(v => v.id === 'checkout-communication').edges, ids = E.map(e => (typeof e === 'string' ? e : e.id));
  const msgs = b.edges.filter(e => ids.includes(e.id) && e.type === 'uml.Message'), [c, r] = [msgs[1], msgs[msgs.length - 1]];
  c.label = String(c.label) + ' (v2)'; b.edges = b.edges.filter(e => e.id !== r.id); b.views.forEach(v => { if (Array.isArray(v.edges)) v.edges = v.edges.filter(e => (typeof e === 'string' ? e : e.id) !== r.id); });
  for (const [x, y, gone, word] of [[a, b, r.id, 'removed'], [b, a, r.id, 'new']]) {
    const g = all.layout(all.diff(x, y).model, 'checkout-communication'), s = svgOf(g), t = tag45(s, `data-id="${gone}"`);
    assert.ok(t, gone); assert.match(t, new RegExp(`, ${word}" data-change="${word}"`));
    if (word === 'removed') { assert.match(t, /stroke-dasharray/); assert.match(tag45(s, `data-id="${c.id}"`), /, changed" data-change="changed"/); } }
  assert.doesNotMatch(svgOf(all.layout(a, 'checkout-communication')), /data-change/);
});

test('audit 46: a dashed typed line diff() adds keeps its notation\'s dash (a dependency, an include, a message flow, a satisfy), green', async () => {
  const all = await fromSrc(), m = read45('integration'), e2 = m; let n = 0; // the integration fixture's typed views
  for (const [x, ty] of [[m, 'uml.Dependency'], [m, 'uml.Include'], [m, 'bpmn.MessageFlow'], [m, 'bpmn.Association'], [e2, 'sysml.Satisfy']]) {
    const e = x.edges.find(y => y.type === ty), v = x.views.find(w => w.diagram && w.diagram !== 'map' && all.layout(x, w.id).edges.some(l => (l._id ?? l.id) === e.id));
    const less = structuredClone(x); less.edges = less.edges.filter(y => y.id !== e.id);
    const at = (mm, id) => { const g = all.layout(mm, v.id), i = g.edges.findIndex(l => (l._id ?? l.id) === id); return (svgOf(g).match(new RegExp(`<g class="edge-g[^"]*"[^>]*data-i="${i}">[\\s\\S]*?class="edge[^"]*"[^>]*>`)) || [''])[0]; };
    const plain = at(x, e.id).match(/stroke-dasharray="([^"]+)"/), added = at(all.diff(less, x).model, e.id);
    assert.ok(plain, `${ty} dashed`); assert.match(added, /stroke="var\(--um-green\)"/, ty); assert.match(added, new RegExp(`stroke-dasharray="${plain[1]}"`), ty); n++; }
  assert.equal(n, 5);
});

test('audit 46: diff() marks a member new to an element that stayed and says "adds X to Y"; one gone that a view drew as its own shape comes back removed (a part, a port, a lane)', async () => {
  const all = await fromSrc(), eb = read45('ebike-structure'), e1 = structuredClone(eb);
  e1.nodes.find(n => n.id === 'ebike').members.push({ id: 'ebike.battery2', type: 'uml.Property', label: 'battery2', props: { valueType: 'Battery', multiplicity: '1' } });
  const keep = JSON.stringify(e1), d = all.diff(eb, e1); assert.equal(JSON.stringify(e1), keep, 'the after model is not changed');
  assert.deepEqual(d.summary, ['adds battery2 to CargoBike']); assert.match(tag45(svgOf(all.layout(d.model, 'inside-ebike')), 'data-id="ebike.battery2"'), /, new" data-change="new"/);
  const back = all.diff(e1, eb); assert.deepEqual(back.summary, ['removes battery2 from CargoBike']);
  assert.match(tag45(svgOf(all.layout(back.model, 'inside-ebike')), 'data-id="ebike.battery2"'), /, removed" data-change="removed"/);
  // a lane added to a pool, and one removed (its elements moved to the pool)
  const bp = read45('bookshop-order-to-shipment'), pool = bp.nodes.find(n => n.type === 'bpmn.Participant' && (n.members || []).some(x => x.type === 'bpmn.Lane')), lane = pool.members.find(x => x.type === 'bpmn.Lane');
  const add = structuredClone(bp); add.nodes.find(n => n.id === pool.id).members.push({ id: 'lane-new', type: 'bpmn.Lane', label: 'Returns desk' });
  const rem = structuredClone(bp), p2 = rem.nodes.find(n => n.id === pool.id); p2.members = p2.members.filter(x => x.id !== lane.id); rem.nodes.forEach(n => { if (n.parent === lane.id) n.parent = pool.id; });
  const v = bp.views[0].id, da = all.diff(bp, add), dr = all.diff(bp, rem);
  assert.ok(da.summary.includes(`adds Returns desk to ${pool.label}`)); assert.match(tag45(svgOf(all.layout(da.model, v)), 'data-id="lane-new"'), /data-change="new"/);
  assert.ok(dr.summary.includes(`removes ${lane.label} from ${pool.label}`)); assert.match(tag45(svgOf(all.layout(dr.model, v)), `data-id="${lane.id}"`), /data-change="removed"/);
  // a component's new port: its owner is not said changed for it
  const c0 = read45('bookshop-components'), c1 = structuredClone(c0); c1.nodes.find(n => n.id === 'order-worker').members = [{ id: 'order-worker.jobs', type: 'uml.Port', label: 'jobs' }];
  const dc = all.diff(c0, c1); assert.deepEqual(dc.summary, ['adds jobs to Order worker']); assert.match(tag45(svgOf(all.layout(dc.model, 'components')), 'data-id="order-worker.jobs"'), /data-change="new"/);
});

test('audit 46: marks follow what a type derives: the ports drawn on a removed or added part, a SysML containment line to a removed requirement', async () => {
  const all = await fromSrc(), os = read45('order-service-structure'), less = structuredClone(os), owner = less.nodes.find(n => (n.members || []).some(x => x.id === 'order-service.pricing'));
  owner.members = owner.members.filter(x => x.id !== 'order-service.pricing'); less.edges = less.edges.filter(e => ![e.from, e.to, ((e.props || {}).ends || {}).from?.part, ((e.props || {}).ends || {}).to?.part].includes('order-service.pricing'));
  for (const [x, y, word] of [[os, less, 'removed'], [less, os, 'new']]) {
    const g = all.layout(all.diff(x, y).model, 'internals'), s = svgOf(g), ports = g.nodes.filter(n => n.id.startsWith('order-service.pricing->'));
    assert.ok(ports.length, word); ports.forEach(p => assert.match(tag45(s, `data-id="${p.id.replace('>', '&gt;')}"`), new RegExp(`, ${word}" data-change="${word}"`))); }
  const rq = read45('ebike-requirements'), v = rq.views[0].id, r1 = structuredClone(rq);
  r1.nodes = r1.nodes.filter(n => n.id !== 'assist'); r1.views.forEach(w => { w.nodeIds = (w.nodeIds || []).filter(x => x !== 'assist'); }); r1.edges = r1.edges.filter(e => e.from !== 'assist' && e.to !== 'assist');
  const g = all.layout(all.diff(rq, r1).model, v), s = svgOf(g), i = g.edges.findIndex(e => (e.from === 'assist' || e.to === 'assist') && /ontain/.test(e.aria || ''));
  assert.ok(i >= 0); assert.equal(g.edges[i].change, 'removed'); assert.match(keyAt45(s, i), /, removed$/);
  assert.ok(all.layout(rq, v).edges.every(e => !e.change));
});

test('audit 46: an overview\'s inline interaction colours a message its sequence view lists by id when diff() adds or removes it', async () => {
  const all = await fromSrc(), m0 = read45('buy-book-overview'), sv = m0.views.find(v => v.id === 'queue-order');
  m0.edges.push(...sv.edges); sv.edges = sv.edges.map(e => e.id);
  const gone = sv.edges[sv.edges.length - 1], m1 = structuredClone(m0); m1.edges = m1.edges.filter(e => e.id !== gone); m1.views.find(v => v.id === 'queue-order').edges = sv.edges.filter(x => x !== gone);
  const msgs = (a, b) => svgOf(all.layout(all.diff(a, b).model, 'buy-book')).match(/<g class="ov-msg"[^>]*><path [^>]*>/g);
  assert.equal(msgs(m0, m1).filter(x => /stroke="var\(--um-rose\)"[^>]*stroke-dasharray/.test(x)).length, 1);
  assert.equal(msgs(m1, m0).filter(x => /stroke="var\(--um-green\)"/.test(x)).length, 1);
});

test('audit 46: a view diff() lists because its picture changed through what it does not draw shows where: a container instance drawn from a changed container, an implied line through a moved container, an IDEF1X entity, an information flow', async () => {
  const all = await fromSrc(), c4 = read45('bookshop-c4'), c4b = structuredClone(c4); c4b.nodes.find(n => n.id === 'c4-api').label = 'Shop API v2';
  const dep = all.layout(all.diff(c4, c4b).model, 'c4-deployment'), inst = dep.nodes.find(n => n.label === 'Shop API v2');
  assert.equal(inst.change, 'changed'); assert.match(tag45(svgOf(dep), `data-id="${inst.id}"`), /data-change="changed"/);
  assert.ok(all.layout(c4, 'c4-deployment').nodes.every(n => !n.change));
  const a = { schemaVersion: 2, nodes: [{ id: 'P', type: 'c4.Person', label: 'Shopper' }, { id: 'S1', type: 'c4.SoftwareSystem', label: 'Shop' }, { id: 'S2', type: 'c4.SoftwareSystem', label: 'Billing' },
    { id: 'X', type: 'c4.Container', parent: 'S1', label: 'API' }], edges: [{ id: 'r1', type: 'c4.Relationship', from: 'P', to: 'X', label: 'uses' }], views: [{ id: 'ctx', diagram: 'c4.context', nodeIds: ['P', 'S1', 'S2'] }] };
  const b = structuredClone(a); b.nodes[3].parent = 'S2';
  assert.equal(all.layout(all.diff(a, b).model, 'ctx').edges.find(e => e.to === 'S2').change, 'added'); // new to the picture (audit 50)
  const er = read45('bookshop-schema'); er.views.push({ id: 'lines', diagram: 'er', title: 'Lines', notation: 'idef1x', nodeIds: ['er-order_line'] });
  const er2 = structuredClone(er); er2.edges.filter(e => ['er-order-lines', 'er-book-lines'].includes(e.id)).forEach(e => { e.props.identifying = false; });
  assert.equal(all.layout(all.diff(er, er2).model, 'lines').nodes[0].change, 'changed'); assert.ok(!all.layout(er, 'lines').nodes[0].change);
  const fl = read45('order-information-flow'), fl2 = structuredClone(fl), item = fl2.nodes.find(n => n.type === 'uml.InformationItem' && n.label === 'Card details'); item.label = 'Payment card';
  const gf = all.layout(all.diff(fl, fl2).model, 'order-flows'), says = gf.edges.filter(e => /Payment card/.test(e.label || ''));
  assert.ok(says.length); says.forEach(e => assert.equal(e.change, 'changed', e.id));
});

test('audit 46: a C4 implied line standing for planned relationships is not drawn changed', async () => {
  const all = await fromSrc(), m = { schemaVersion: 2, nodes: [{ id: 'P', type: 'c4.Person', label: 'Shopper' }, { id: 'S', type: 'c4.SoftwareSystem', label: 'Shop' }, { id: 'web', type: 'c4.Container', label: 'Web', parent: 'S' }],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'P', to: 'web', label: 'uses', change: 'planned' }], views: [{ id: 'ctx', diagram: 'c4.context', subject: 'S', nodeIds: ['P', 'S'] }] };
  const g = all.layout(m, 'ctx'), s = svgOf(g); assert.ok(g.edges.every(e => !e.change)); assert.doesNotMatch(s, /class="edited-dot"/);
});

test('audit 46: a removed mindmap topic\'s branch is drawn dashed and faded with it; hostile reads and ids mark nothing and fetch nothing', async () => {
  const all = await fromSrc(), m = read45('bookshop-opening-plan'), v = m.views.find(w => w.diagram === 'mindmap').id, after = structuredClone(m);
  const kids = new Set(['mm-legal']); for (let grew = true; grew;) { grew = false; after.nodes.forEach(n => { if (kids.has(n.parent) && !kids.has(n.id)) { kids.add(n.id); grew = true; } }); }
  after.nodes = after.nodes.filter(n => !kids.has(n.id));
  const { mapContext } = await import('../src/map/context.js'), mk = mapContext(all.diff(m, after).model).buildView(v).markup, br = mk.match(/<path class="mm-branch"[^>]*>/g);
  assert.equal(br.filter(b => /data-change="removed" stroke-dasharray="6 4" opacity=".6"/.test(b)).length, kids.size);
  assert.doesNotMatch(mapContext(m).buildView(v).markup, /mm-branch"[^>]*data-change/);
  // hostile: ids with "->", prototype keys and a URL in a part's label and a port's id; nothing is marked that did not change, no URL is drawn as one
  const os = read45('order-service-structure'), h = structuredClone(os), o = h.nodes.find(n => (n.members || []).some(x => x.id === 'order-service.pricing'));
  o.members.push({ id: '__proto__', type: 'uml.Property', label: '"><image href="https://track.example/p.gif"/>', props: { valueType: 'constructor' } }, { id: 'x->__proto__', type: 'uml.Property', label: 'p', change: 'removed' });
  const d = all.diff(os, h), s = svgOf(all.layout(d.model, 'internals'));
  assert.doesNotMatch(s, /<image|href="http|<script/); assert.doesNotMatch(tag45(s, 'data-id="order-service.pricing"'), /data-change/);
});

test('audit 46: a change that is not text (a list ["removed"], an object) draws unmarked on a map, as validate() says and the typed views draw it', async () => {
  const all = await fromSrc();
  const hostile = [['removed'], ['Added'], { toString: () => 'removed' }, ['https://track.example/p.gif'], 7];
  hostile.forEach(ch => {
    const m = { title: 'm', nodes: [{ id: 'a', label: 'A', change: ch }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'e', from: 'a', to: 'b', change: ch }, { id: 'f', from: 'a', to: 'c', kind: 'calls', change: ch }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
    const s = svgOf(all.layout(m, 'v')).replace(/<defs>[\s\S]*?<\/defs>/, '');
    assert.doesNotMatch(s, /REMOVED|>NEW<|CHANGED|, removed|, added|um-rose|um-green|track\.example/, `change ${JSON.stringify(ch)} draws no mark`);
    assert.deepEqual(validate(m).filter(p => /change$/.test(p.path)).map(p => p.path), ['nodes[0].change', 'edges[0].change', 'edges[1].change'], 'and validate() says it draws unmarked');
  });
  // the text words still draw: the same models with "removed" are marked
  const m = { title: 'm', nodes: [{ id: 'a', label: 'A', change: 'removed' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b', change: 'Added' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const s = svgOf(all.layout(m, 'v')); assert.match(s, /REMOVED/); assert.match(s, /class="edge[^"]*" stroke="var\(--um-green\)"/);
});

test('audit 46: lib/umlimator.d.ts and the schema list the map line changes validate() and the renderer take, and say a line draws by its change alone', async () => {
  const all = await fromSrc(), words = ['added', 'new', 'modified', 'changed', 'removed', 'planned', 'bogus'];
  const ok = words.filter(w => !validate({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', from: 'a', to: 'b', kind: 'calls', change: w }] }).some(p => p.path === 'edges[0].change'));
  const schema = JSON.parse(readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'));
  const find = (o, f) => { if (!o || typeof o !== 'object') return null; if (f(o)) return o; for (const v of Object.values(o)) { const r = find(v, f); if (r) return r; } return null; };
  const edge = find(schema, o => o.properties && o.properties.from && o.properties.to && o.properties.change);
  assert.deepEqual([...edge.properties.change.enum].sort(), [...ok].sort(), 'the schema\'s line change enum is what validate() takes');
  const dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8'), me = dts.slice(dts.indexOf('export interface MapEdge'));
  const ty = /\n {2}change\?: ([^;]+);/.exec(me)[1].split('|').map(x => x.trim().replace(/'/g, ''));
  assert.deepEqual(ty.sort(), [...ok].sort(), 'the d.ts type is what validate() takes');
  assert.doesNotMatch(me.slice(0, me.indexOf('\n}')), /draw only with the matching `style`/);
  // and the picture: a wired line with change and no style draws by its change, as the d.ts now says
  const m = { title: 'm', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'e', from: 'a', to: 'b', kind: 'calls', change: 'removed' }, { id: 'f', from: 'a', to: 'c', kind: 'calls', change: 'new' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  const s = svgOf(all.layout(m, 'v')); assert.match(s, /stroke="var\(--um-rose\)"/); assert.match(s, /stroke="var\(--um-green\)"/);
});

/* ---- audit 47: diff marks and views ---- */
const fx47 = () => JSON.parse(readFileSync(modelUrl('integration')));
const shape47 = (g, id) => [...g.nodes, ...(g.families || [])].find(x => x.id === id);
const same47 = (a, b) => svgOf(a).replace(/\bg\d+/g, '') === svgOf(b).replace(/\bg\d+/g, '');

test('audit 47: a member drawn as its own shape that was renamed or retyped is marked: a part, a port on a part, and a retyped part\'s old ports removed and new ones added', async () => {
  const all = await fromSrc(), a = fx47(), el = (m, o, id) => m.nodes.find(n => n.id === o).members.find(x => x.id === id);
  const part = structuredClone(a); el(part, 'emoped', 'emoped.battery').label = 'pack';
  const d1 = all.diff(a, part); assert.ok(d1.summary.includes('renames battery to pack in EMoped'), d1.summary.join('; '));
  assert.equal(shape47(all.layout(d1.model, 'inside-emoped'), 'emoped.battery').change, 'changed');
  const port = structuredClone(a); el(port, 'battery', 'battery.charge').label = 'inlet';
  const d2 = all.diff(a, port), g2 = all.layout(d2.model, 'inside-emoped');
  assert.ok(d2.summary.includes('renames charge to inlet in Battery'), d2.summary.join('; ')); assert.ok(d2.views.includes('inside-emoped'));
  assert.equal(shape47(g2, 'emoped.battery->battery.charge').change, 'changed'); assert.equal(shape47(g2, 'emoped.battery->battery.power').change, undefined);
  assert.match(svgOf(g2), /CHANGED/);
  // retyped: Battery's ports no longer on the part are removed, Controller's are added; the part changed
  const re = structuredClone(a), bp = new Set(a.nodes.find(n => n.id === 'battery').members.map(x => x.id)), cut = new Set(re.edges.filter(e => [e.from, e.to].some(x => bp.has(x))).map(e => e.id));
  re.edges = re.edges.filter(e => !cut.has(e.id)); re.views.forEach(w => { if (Array.isArray(w.edges)) w.edges = w.edges.filter(x => !cut.has(typeof x === 'string' ? x : x && x.id)); });
  el(re, 'emoped', 'emoped.battery').props.valueType = 'Controller';
  const g3 = all.layout(all.diff(a, re).model, 'inside-emoped'), on = p => (shape47(g3, 'emoped.battery->' + p) || {}).change;
  assert.equal(shape47(g3, 'emoped.battery').change, 'changed');
  assert.deepEqual(['controller.supply', 'controller.drive', 'controller.bus'].map(on), ['added', 'added', 'added']);
  assert.deepEqual(['battery.charge', 'battery.power'].map(on), ['removed', 'removed']);
  // no edit: nothing marked, and the picture is the one the model draws
  assert.ok(same47(all.layout(all.diff(a, structuredClone(a)).model, 'inside-emoped'), all.layout(a, 'inside-emoped')));
});

test('audit 47: an element moved to another owner leaves the line its type derived from the old one as a removed ghost: a C4 implied line, a requirement\'s containment (new: added)', async () => {
  const all = await fromSrc(), line = (g, id) => g.edges.find(e => (e._id ?? e.id) === id);
  const c4 = { schemaVersion: 2, nodes: [{ id: 'S1', type: 'c4.SoftwareSystem', label: 'One' }, { id: 'S2', type: 'c4.SoftwareSystem', label: 'Two' }, { id: 'X', type: 'c4.SoftwareSystem', label: 'Ext' },
    { id: 'a', type: 'c4.Container', label: 'A', parent: 'S1' }], edges: [{ id: 'r1', type: 'c4.Relationship', from: 'a', to: 'X', label: 'calls' }],
  views: [{ id: 'ctx', diagram: 'c4.context', title: 'Context', nodeIds: ['S1', 'S2', 'X'] }] };
  const c4b = structuredClone(c4); c4b.nodes[3].parent = 'S2';
  const d = all.diff(c4, c4b), g = all.layout(d.model, 'ctx'), was = line(g, 'S1->X');
  assert.deepEqual(d.views, ['ctx']); assert.equal(line(g, 'S2->X').change, 'added', 'the new implied line: added, new to the picture (audit 50)');
  assert.ok(was && was.change === 'removed', 'the old implied line comes back removed'); assert.match(svgOf(g), /Implied relationship from One to Ext, removed/);
  const rq = (id, label, parent) => ({ id, type: 'sysml.Requirement', label, ...(parent ? { parent } : {}), props: { id: id.toUpperCase(), text: label + ' text' } });
  const r0 = { schemaVersion: 2, nodes: [rq('r1', 'Range'), rq('r2', 'Battery life', 'r1'), rq('r3', 'Safety')], edges: [], views: [{ id: 'req', diagram: 'sysml.requirement', title: 'Reqs', nodeIds: ['r1', 'r2', 'r3'] }] };
  const r1 = structuredClone(r0); r1.nodes[1].parent = 'r3';
  const gr = all.layout(all.diff(r0, r1).model, 'req');
  assert.deepEqual([line(gr, 'r3->r2').change, (line(gr, 'r1->r2') || {}).change, shape47(gr, 'r2').change], ['added', 'removed', 'changed']);
  // the models themselves draw no ghost
  assert.equal(line(all.layout(r1, 'req'), 'r1->r2'), undefined); assert.equal(line(all.layout(c4b, 'ctx'), 'S1->X'), undefined);
});

test('audit 47: a shape drawn from what it reads is marked only when its picture changed: a C4 implied line, an IDEF1X entity; and views lists no view whose picture is the same', async () => {
  const all = await fromSrc();
  const c4 = { schemaVersion: 2, nodes: [{ id: 'P', type: 'c4.Person', label: 'Rider' }, { id: 'S1', type: 'c4.SoftwareSystem', label: 'Shop' },
    { id: 'X', type: 'c4.Container', parent: 'S1', label: 'API', props: { description: 'old', technology: 'Go' } }], edges: [{ id: 'r1', type: 'c4.Relationship', from: 'P', to: 'X', label: 'uses' }],
  views: [{ id: 'ctx', diagram: 'c4.context', nodeIds: ['P', 'S1'] }] };
  const c4b = structuredClone(c4); c4b.nodes[2].props = { description: 'new words', technology: 'Rust' };
  const d = all.diff(c4, c4b), g = all.layout(d.model, 'ctx');
  assert.deepEqual(d.views, []); assert.deepEqual(g.edges.map(e => e.change ?? null), [null], 'no mark on a view diff() leaves out');
  // an IDEF1X entity reads its undrawn identifying relationship: a label edit draws nothing, a flag flip draws it independent
  const col = (id, l) => ({ id, type: 'er.Column', label: l, props: { primaryKey: true } });
  const er = { schemaVersion: 2, nodes: [{ id: 'P', type: 'er.Entity', label: 'Parent', members: [col('P.id', 'id')] }, { id: 'C', type: 'er.Entity', label: 'Child', members: [col('C.id', 'id')] }],
    edges: [{ id: 'r', type: 'er.Relationship', from: 'P', to: 'C', label: 'has', props: { identifying: true, ends: { from: { multiplicity: '1' }, to: { multiplicity: '0..*' } } } }],
    views: [{ id: 'v', diagram: 'er', notation: 'idef1x', title: 'Child', nodeIds: ['C'] }, { id: 'w', diagram: 'er', notation: 'idef1x', title: 'Both', nodeIds: ['P', 'C'] }] };
  const lab = structuredClone(er); lab.edges[0].label = 'owns';
  const dl = all.diff(er, lab); assert.deepEqual(dl.views, ['w']); assert.equal(shape47(all.layout(dl.model, 'v'), 'C').change, undefined);
  const flip = structuredClone(er); flip.edges[0].props.identifying = false;
  const df = all.diff(er, flip); assert.ok(df.views.includes('v')); assert.equal(shape47(all.layout(df.model, 'v'), 'C').change, 'changed');
  // views: a context-level line relabelled is not drawn on the container view (its subject is the boundary); a lane added to a
  // pool lists only views whose picture changed
  const a = fx47(), rel = structuredClone(a); rel.edges.find(e => e.id === 'c4-rider-mopedshare').label = 'Rents mopeds with';
  assert.ok(!all.diff(a, rel).views.includes('c4-containers')); assert.ok(all.diff(a, rel).views.includes('c4-context'));
  const lane = structuredClone(a); lane.nodes.find(x => x.id === 'bp-mopedshare').members.push({ id: 'bp-returns', type: 'bpmn.Lane', label: 'Returns' });
  for (const [m, b] of [[a, rel], [a, lane]]) all.diff(m, b).views.forEach(v => assert.ok(!same47(all.layout(m, v), all.layout(b, v)), `${v} is listed and draws differently`));
});

test('audit 47: an IDEF1X entity whose only identifying relationship was removed draws independent on the diff page', async () => {
  const all = await fromSrc(), col = (id, l) => ({ id, type: 'er.Column', label: l, props: { primaryKey: true } });
  const er = { schemaVersion: 2, nodes: [{ id: 'P', type: 'er.Entity', label: 'Parent', members: [col('P.id', 'id')] }, { id: 'C', type: 'er.Entity', label: 'Child', members: [col('C.id', 'id')] }],
    edges: [{ id: 'r', type: 'er.Relationship', from: 'P', to: 'C', label: 'has', props: { identifying: true, ends: { from: { multiplicity: '1' }, to: { multiplicity: '0..*' } } } }],
    views: [{ id: 'v', diagram: 'er', notation: 'idef1x', title: 'Child', nodeIds: ['C'] }, { id: 'w', diagram: 'er', notation: 'idef1x', title: 'Both', nodeIds: ['P', 'C'] }] };
  const b = structuredClone(er); b.edges = [];
  assert.equal(shape47(all.layout(er, 'w'), 'C').dep, true);
  const d = all.diff(er, b);
  for (const v of ['v', 'w']) { const g = all.layout(d.model, v); assert.equal(shape47(g, 'C').dep, undefined, v); assert.equal(shape47(g, 'C').change, 'changed', v); }
  assert.equal(all.layout(d.model, 'w').edges.find(e => e.id === 'r').change, 'removed', 'the relationship still comes back removed');
});

test('audit 47: an added or removed typed line keeps its notation\'s stroke on the diff page and in stills: a generalization and an association solid, a realization dashed', async () => {
  const all = await fromSrc(), C = (id, t = 'uml.Class') => ({ id, type: t, label: id.toUpperCase() });
  const A = { schemaVersion: 2, nodes: [C('a'), C('b'), C('c'), C('d'), C('i', 'uml.Interface')], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'c', 'd', 'i'] }] };
  const B = structuredClone(A); B.edges = [{ id: 'g', type: 'uml.Generalization', from: 'a', to: 'b' }, { id: 'r', type: 'uml.InterfaceRealization', from: 'c', to: 'i' }, { id: 's', type: 'uml.Association', from: 'b', to: 'd' }];
  const path = (s, id) => { const g = all.layout(s, 'v'), i = g.edges.findIndex(e => e.id === id), m = svgOf(g).match(new RegExp(`<g class="edge-g[^"]*"[^>]*data-i="${i}">[\\s\\S]*?class="edge[^"]*"[^>]*>`)); return m && m[0].slice(m[0].lastIndexOf('<path')); };
  for (const [m, word, c] of [[all.diff(A, B).model, 'added', 'green'], [all.diff(B, A).model, 'removed', 'rose']]) {
    for (const id of ['g', 's']) { const p = path(m, id); assert.match(p, new RegExp(`stroke="var\\(--um-${c}\\)"`), `${id} ${word}`); assert.doesNotMatch(p, /stroke-dasharray|class="edge flow"/, `${id} ${word} stays solid`); }
    assert.match(path(m, 'r'), /stroke-dasharray="6 4"/, `the realization ${word} stays dashed`);
  }
  assert.doesNotMatch(path(B, 'g'), /stroke-dasharray|um-green|um-rose/, 'with no diff, as before');
});

test('audit 47: a change mark has one rule for its letter case: written in lower case, as the schema and the types list it; validate() warns on another case, which still draws', async () => {
  const all = await fromSrc(), m = { nodes: [{ id: 'a', label: 'A', change: 'Added' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b', change: 'REMOVED' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const w = validate(m).filter(p => /change$/.test(p.path));
  assert.deepEqual(w.map(p => [p.level, p.path]), [['warning', 'nodes[0].change'], ['warning', 'edges[0].change']]); assert.match(w[0].message, /write it in lower case/);
  const s = svgOf(all.layout(m, 'v')); assert.match(s, />NEW</); assert.match(s, /stroke="var\(--um-rose\)"/);
  const schema = JSON.parse(readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'));
  assert.ok(schema.$defs.edge.properties.change.enum.every(x => x === x.toLowerCase()) && schema.$defs.node.properties.change.enum.every(x => x === x.toLowerCase()));
  assert.match(readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8'), /A change mark, written in lower case/);
  assert.deepEqual(validate(all.diff(read45('sales-classes'), fx47()).model).filter(p => /change$/.test(p.path)), [], 'what diff() writes is lower case');
});

test('audit 47: hostile diffMarks: prototype keys, values that are no mark, a ghost line with a URL or markup for its label or ends draw nothing fetched and mark only what they say', async () => {
  const all = await fromSrc(), C = (id, t) => ({ id, type: t, label: id });
  const m = { schemaVersion: 2, nodes: [C('S1', 'c4.SoftwareSystem'), C('X', 'c4.SoftwareSystem')], edges: [], views: [{ id: 'ctx', diagram: 'c4.context', nodeIds: ['S1', 'X'],
    diffMarks: { marks: JSON.parse('{"__proto__": "removed", "constructor": "added", "S1": {"toString": "removed"}, "X": ["removed"]}'),
      gone: [{ id: 'S1->X', from: 'S1', to: 'X', label: '"><image href="https://track.example/p.gif"/><script>x</script>' }, { id: 'nolink', from: 'S1', to: 'X' },
        { id: 'a->b', from: 'https://track.example/a', to: 'X' }, { id: { toString: () => 'S1->X' }, from: 'S1', to: 'X' }, null, 7, 'S1->X'] } }] };
  const g = all.layout(m, 'ctx'), s = svgOf(g);
  assert.doesNotMatch(s, /<script|<image|href="http|onload=/); assert.ok(s.includes('&lt;script&gt;') || !s.includes('script'));
  assert.deepEqual(g.edges.map(e => [e.id, e.change]), [['S1->X', 'removed']], 'only the well-formed ghost between drawn shapes');
  assert.deepEqual(g.nodes.map(n => n.change ?? null), [null, null], 'a mark that is no mark marks nothing');
  assert.equal(Object.getPrototypeOf(validateAll(m)), Array.prototype); assert.equal(({}).removed, undefined);
  // a requirement view's ghost: the same reading
  const rq = { schemaVersion: 2, nodes: [{ id: 'r1', type: 'sysml.Requirement', label: 'R1', props: { id: 'R1', text: 't' } }, { id: 'r2', type: 'sysml.Requirement', label: 'R2', props: { id: 'R2', text: 't' } }],
    edges: [], views: [{ id: 'req', diagram: 'sysml.requirement', nodeIds: ['r1', 'r2'], diffMarks: { gone: [{ id: 'r1->r2', from: 'r2', to: 'r1' }, { id: 'r1->zz', from: 'zz', to: 'r1' }] } }] };
  assert.deepEqual(all.layout(rq, 'req').edges.map(e => [e.id, e.change]), [['r1->r2', 'removed']]);
});

/* ---- audit 48: diff views and marks, a container cycle, the edited dot ---- */
const pic48 = (all, m, v) => svgOf(all.layout(m, v)).replace(/\bg\d+/g, '');

test('audit 48: a context-level relationship added or deleted lists the container view whose cards it moves; a relabel still does not', async () => {
  const all = await fromSrc();
  for (const [f, id] of [['integration', 'c4-rider-mopedshare'], ['bookshop-c4', 'c4-shopper-bookshop'], ['bookshop-c4', 'c4-bookshop-mail']]) {
    const a = read45(f), b = structuredClone(a); b.edges = b.edges.filter(e => e.id !== id);
    assert.notEqual(pic48(all, a, 'c4-containers'), pic48(all, b, 'c4-containers'), `${f}: the container view draws otherwise`);
    for (const [x, y, w] of [[a, b, 'deleted'], [b, a, 'added']]) assert.deepEqual(all.diff(x, y).views, ['c4-context', 'c4-containers'], `${f} ${id} ${w}`);
  }
  const a = read45('integration'), rel = structuredClone(a); rel.edges.find(e => e.id === 'c4-rider-mopedshare').label = 'Rents mopeds with';
  assert.deepEqual(all.diff(a, rel).views, ['c4-context']);
});

test('audit 48: a view a card opens is listed when retitled, though a map card has the view\'s id', async () => {
  // the integration fixture, with a map card named after the view its C4 container c4-app opens (the Atlas's mcp card did
  // this; a test reads no showcase model, audit 53): the same views as with no such card, the container view among them
  const all = await fromSrc(), a = read45('integration'), retitle = m => { const x = structuredClone(m); x.views.find(v => v.id === 'rider-data').title += ' X'; return x; };
  const plain = structuredClone(a); a.nodes.push({ id: 'rider-data', label: 'Rider data' }); a.views.find(v => v.id === 'context').nodeIds.push('rider-data');
  const b = retitle(a);
  assert.equal(a.nodes.find(n => n.id === 'c4-app').opensView, 'rider-data', 'the container opens the view');
  assert.notEqual(pic48(all, a, 'c4-containers'), pic48(all, b, 'c4-containers'));
  assert.ok(all.diff(a, b).views.includes('c4-containers') && all.diff(a, b).views.includes('rider-data'), all.diff(a, b).views.join());
  assert.deepEqual(all.diff(a, b).views, all.diff(plain, retitle(plain)).views);
});

test('audit 48: the diff page marks the shape drawn through a renamed element it does not draw: a class through its package, an overview\'s inline interaction, a constraint property through its block', async () => {
  const all = await fromSrc();
  for (const [f, id, v, want] of [['sales-classes', 'card', 'domain', ['card-payment']], ['integration', 'shared', 'domain', ['money']], ['integration', 'lifeline-queue', 'hire-overview', ['sd-queue']],
    ['buy-book-overview', 'lifeline-api', 'buy-book', ['sd-queue']], ['integration', 'range-equation', 'range-analysis', ['emoped.eco', 'emoped.boost']]]) {
    const a = read45(f), b = structuredClone(a), n = b.nodes.find(x => x.id === id); n.label = (n.label || id) + 'X';
    const d = all.diff(a, b), g = all.layout(d.model, v);
    assert.ok(d.views.includes(v), `${f}: ${v} listed`);
    assert.deepEqual([...g.nodes, ...(g.families || [])].filter(x => x.change).map(x => [x.id, x.change]), want.map(x => [x, 'changed']), `${f}: ${id} renamed, ${v}`);
    assert.match(svgOf(g), /CHANGED/);
  }
  // a change the shape does not draw marks nothing: a class's package given a description
  const a = read45('sales-classes'), b = structuredClone(a); b.nodes.find(x => x.id === 'card').props = { ...(b.nodes.find(x => x.id === 'card').props || {}), documentation: 'cards' };
  const g = all.layout(all.diff(a, b).model, 'domain'); assert.equal(g.nodes.find(x => x.id === 'card-payment').change, undefined);
});

test('audit 48: the diff page counts no relationship diff() brings back removed when it lifts C4 lines', async () => {
  const all = await fromSrc(), lines = g => g.edges.map(e => [e._id ?? e.id, e.label, e.change ?? null]);
  // a direct relationship removed: the implied line the model after draws in its place is drawn too, added
  const a = read45('bookshop-c4'), b = structuredClone(a); b.edges = b.edges.filter(e => e.id !== 'c4-shopper-bookshop');
  const after = lines(all.layout(b, 'c4-context')).filter(l => l[0].includes('shopper')), page = lines(all.layout(all.diff(a, b).model, 'c4-context')).filter(l => l[0].includes('shopper'));
  assert.ok(after.some(l => l[0] === 'c4-shopper->c4-bookshop'));
  assert.deepEqual(page.filter(l => l[2] !== 'removed'), after.map(l => (l[0] === 'c4-shopper->c4-bookshop' ? [l[0], l[1], 'added'] : l)), 'the lines the model after draws, the new implied one added');
  assert.deepEqual(page.filter(l => l[2] === 'removed').map(l => l[0]), ['c4-shopper-bookshop'], 'and the removed relationship as a ghost');
  // two lifted to one implied line, one removed: drawn as the model after draws it, marked changed
  const m = { schemaVersion: 2, nodes: [{ id: 'P', type: 'c4.Person', label: 'Shopper' }, { id: 'S1', type: 'c4.SoftwareSystem', label: 'Shop' },
    { id: 'X1', type: 'c4.Container', parent: 'S1', label: 'API' }, { id: 'X2', type: 'c4.Container', parent: 'S1', label: 'Web' }],
  edges: [{ id: 'r1', type: 'c4.Relationship', from: 'P', to: 'X1', label: 'calls' }, { id: 'r2', type: 'c4.Relationship', from: 'P', to: 'X2', label: 'browses' }],
  views: [{ id: 'ctx', diagram: 'c4.context', nodeIds: ['P', 'S1'] }] };
  for (const [gone, kept] of [['r2', 'calls'], ['r1', 'browses']]) {
    const m2 = structuredClone(m); m2.edges = m2.edges.filter(e => e.id !== gone);
    const g = all.layout(all.diff(m, m2).model, 'ctx'), g2 = all.layout(m2, 'ctx');
    assert.deepEqual(lines(g), [['P->S1', kept, 'changed']]); assert.equal(g.edges[0].aria, g2.edges[0].aria); assert.match(g.edges[0].aria, /standing for 1 relationship:/);
  }
  // both removed: the implied line comes back removed, as before
  assert.deepEqual(lines(all.layout(all.diff(m, { ...m, edges: [] }).model, 'ctx')).map(l => [l[0], l[2]]), [['P->S1', 'removed']]);
});

test('audit 48: svgOf draws a map view whose container is its own parent, or in a cycle, with no stack overflow', () => {
  const mk = cs => ({ title: 'm', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'e', from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], containers: cs }] });
  for (const cs of [[{ id: 'box', label: 'Box', parent: 'box', nodeIds: ['a'] }], [{ id: 'x', label: 'X', parent: 'y', nodeIds: ['a'] }, { id: 'y', label: 'Y', parent: 'x', nodeIds: ['b'] }],
    [{ id: 'x', label: 'X', parent: 'y', nodeIds: ['a'] }, { id: 'y', label: 'Y', parent: 'z', nodeIds: ['b'] }, { id: 'z', label: 'Z', parent: 'y', nodeIds: ['c'] }]]) {
    const m = mk(cs); assert.ok(validate(m).some(p => p.level === 'error' && /inside itself/.test(p.message)));
    const s = svgOf(layout(m, 'v')); cs.forEach(c => assert.match(s, new RegExp(`data-family="${c.id}"`)));
  }
  // a nested box still draws as nested (a cyan border), the top one as before
  const s = svgOf(layout(mk([{ id: 'x', label: 'X', nodeIds: ['a'] }, { id: 'y', label: 'Y', parent: 'x', nodeIds: ['b'] }]), 'v'));
  assert.match(s, /data-family="x"[^>]*>(?:(?!data-family)[\s\S])*?stroke="var\(--um-border-2\)"/); assert.match(s, /data-family="y"[^>]*>(?:(?!data-family)[\s\S])*?stroke="var\(--um-cyan\)"/);
});

test('audit 48: a line\'s edited dot is drawn clear of its own label, and of every label: an edited line, a changed and a modified one', () => {
  const m = { title: 'Line change', nodes: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: id.toUpperCase(), kind: 'service' })),
    edges: [{ id: 'ab', from: 'a', to: 'b', label: 'changed', change: 'changed' }, { id: 'ac', from: 'a', to: 'c', label: 'modified', change: 'modified' },
      { id: 'ad', from: 'a', to: 'd', label: 'plain' }, { id: 'ae', from: 'a', to: 'e', label: 'edited', edited: true }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd', 'e'] }] };
  for (const [model, v, n] of [[m, 'v', 3], [fx, 'system', 1]]) {
    const g = layout(model, v), s = svgOf(g), labs = g.edges.filter(e => e.lbl).map(e => e.lbl);
    const dots = [...s.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="4" class="edited-dot"><title>/g)].map(x => [+x[1], +x[2]]);
    assert.equal(dots.length, n, v);
    dots.forEach(([x, y]) => assert.ok(!labs.some(l => x + 5 > l.x && x - 5 < l.x + l.w && y + 5 > l.y && y - 5 < l.y + l.h), `${v}: the dot at ${x},${y} is under a label`));
    // on a line: within a pixel of one of a line's segments
    const near = ([x, y], [a, b], [c, d]) => { const l = (c - a) ** 2 + (d - b) ** 2, t = l ? Math.max(0, Math.min(1, ((x - a) * (c - a) + (y - b) * (d - b)) / l)) : 0; return Math.hypot(x - a - t * (c - a), y - b - t * (d - b)) < 1; };
    dots.forEach(p => assert.ok(g.edges.some(e => e.pts.slice(1).some((q, k) => near(p, e.pts[k], q))), `${v}: the dot at ${p} sits on a line`));
  }
});

test('audit 48: on the diff page a communication view numbers its live messages as the model after the change does, counts only them, and a removed one keeps its old number', async () => {
  const all = await fromSrc(), a = read45('checkout-communication'), V = 'checkout-communication';
  const rows = g => Object.fromEntries(g.nodes.filter(n => n.shape === 'message-row').map(n => [n.id, [n.num, n.aria]]));
  for (const gone of ['cm3', 'cm5', 'cm8']) {
    const b = structuredClone(a); b.views.forEach(v => { if (Array.isArray(v.edges)) v.edges = v.edges.filter(e => (typeof e === 'string' ? e : e.id) !== gone); }); b.edges = b.edges.filter(e => e.id !== gone);
    const was = rows(all.layout(a, V)), now = rows(all.layout(b, V)), d = rows(all.layout(all.diff(a, b).model, V));
    for (const [id, [num, aria]] of Object.entries(now)) assert.deepEqual(d[id], [num, aria], `${gone} removed: ${id}`);
    assert.equal(d[gone][0], was[gone][0], `${gone}: its number as before`); assert.doesNotMatch(d[gone][1], / of \d+,/, `${gone}: not counted`); }
});

test('audit 48: a removed extend whose extension point went with it reads on the diff page as before, its point by name', async () => {
  const all = await fromSrc(), a = read45('shopping-use-cases'), b = structuredClone(a), co = b.nodes.find(n => n.id === 'check-out');
  co.members = co.members.filter(m => m.id !== 'checkout.extras'); b.edges = b.edges.filter(e => !(e.props && (e.props.extensionPoints || []).includes('checkout.extras')));
  const ext = g => g.edges.filter(e => e.type === 'uml.Extend').map(e => [e.id, e.label ?? e.lbl?.text ?? null]);
  const was = new Map(ext(all.layout(a, 'shopping'))), d = ext(all.layout(all.diff(a, b).model, 'shopping'));
  assert.equal(d.length, was.size); d.forEach(([id, t]) => assert.equal(t, was.get(id), id));
  assert.match(svgOf(all.layout(all.diff(a, b).model, 'shopping')), /«extend» \(extras\)/);
});

test('audit 48: an interaction overview\'s inline interaction marks what the sequence view marks: an added fragment and its operand new, a lifeline taken out faded, dashed and struck', async () => {
  const all = await fromSrc(), a = read45('buy-book-overview'), marks = s => (s.match(/data-change="[^"]*"/g) || []).sort();
  // what the frame draws inside it: the frame's own tag is left out, as diff() marks the frame changed when a lifeline it reads is
  // marked (the other audit 48 test above), apart from the marks its parts carry
  const frame = s => { const i = s.indexOf('<g class="node ov-inline"'); return s.slice(i, s.indexOf('>', i) + 1); };
  const inline = s => { const i = s.indexOf('<g class="node ov-inline"'); return s.slice(s.indexOf('>', i) + 1, s.indexOf('<g class="node', i + 1)); };
  const b = structuredClone(a), q = b.views.find(v => v.id === 'queue-order');
  q.fragments = [{ id: 'fopt', type: 'uml.CombinedFragment', props: { operator: 'opt' }, members: [{ id: 'fopt-1', type: 'uml.InteractionOperand', label: 'in stock' }] }]; q.edges[2].parent = 'fopt-1';
  const c = structuredClone(a), q2 = c.views.find(v => v.id === 'queue-order');
  q2.nodeIds = q2.nodeIds.filter(x => x !== 'lifeline-worker'); q2.edges = q2.edges.filter(e => e.to !== 'lifeline-worker');
  for (const [y, want] of [[b, ['data-change="new"', 'data-change="new"']], [c, ['data-change="removed"']]]) { const d = all.diff(a, y).model;
    const sq = svgOf(all.layout(d, 'queue-order')), ov = inline(svgOf(all.layout(d, 'buy-book')));
    assert.deepEqual(marks(sq), want); assert.deepEqual(marks(ov), want, 'the inline frame marks as the sequence view does'); }
  const ov = inline(svgOf(all.layout(all.diff(a, b).model, 'buy-book'))); assert.match(ov, />NEW<\/text>/);
  const gone = inline(svgOf(all.layout(all.diff(a, c).model, 'buy-book'))), head = gone.slice(gone.lastIndexOf('<g', gone.indexOf('data-change="removed"')));
  assert.match(frame(svgOf(all.layout(all.diff(a, c).model, 'buy-book'))), /data-change="changed"/, 'the frame that read the lifeline is marked too');
  assert.match(head, /stroke-dasharray="6 4"/); assert.match(head, /text-decoration="line-through">worker : OrderWorker</); assert.match(head, />REMOVED<\/text>/);
  assert.doesNotMatch(inline(svgOf(all.layout(a, 'buy-book'))), /data-change/, 'no change: no mark');
});

test('audit 50: a C4 implied line new to the picture is added, whatever it stands for (a container moved into a new system)', async () => {
  const all = await fromSrc(), A = read45('bookshop-c4'); A.edges = A.edges.filter(e => e.id !== 'c4-bookshop-courier');
  const B = structuredClone(A); B.nodes.push({ id: 'c4-fulfil', type: 'c4.SoftwareSystem', label: 'Fulfilment' });
  B.nodes.find(n => n.id === 'c4-worker').parent = 'c4-fulfil'; B.views.find(v => v.id === 'c4-context').nodeIds.push('c4-fulfil');
  const g = all.layout(all.diff(A, B).model, 'c4-context'), from = g.edges.filter(e => e.from === 'c4-fulfil');
  assert.deepEqual(from.map(e => [e._id, e.change]), [['c4-fulfil->c4-bookshop', 'added'], ['c4-fulfil->c4-courier', 'added'], ['c4-fulfil->c4-mail', 'added']]);
  assert.deepEqual(g.edges.filter(e => e.change === 'removed').map(e => e._id ?? e.id), ['c4-bookshop->c4-courier'], 'the old one back removed');
  assert.doesNotMatch(svgOf(g), /edited-dot/, 'no edited dot on a new line');
});

test('audit 50: the C4 diff page draws a deleted container back with the implied line it drew, removed', async () => {
  const all = await fromSrc(), El = (id, t, label, parent) => ({ id, type: 'c4.' + t, label, ...(parent ? { parent } : {}), props: { description: 'd' } });
  const base = { schemaVersion: 2, nodes: [El('S', 'SoftwareSystem', 'Shop'), El('T', 'SoftwareSystem', 'Pay'), El('a', 'Container', 'Web', 'S'), El('b', 'Container', 'API', 'S'), El('c', 'Container', 'Gateway', 'T')],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'a', to: 'c', label: 'charges' }, { id: 'r2', type: 'c4.Relationship', from: 'a', to: 'b', label: 'calls' }],
    views: [{ id: 'cv', diagram: 'c4.container', title: 'C', subject: 'S', nodeIds: ['a', 'b', 'T'] }] };
  const after = { ...structuredClone(base), nodes: base.nodes.filter(n => n.id !== 'a'), edges: [], views: [{ ...base.views[0], nodeIds: ['b', 'T'] }] };
  const g = all.layout(all.diff(base, after).model, 'cv');
  assert.deepEqual(g.nodes.map(n => [n.id, n.change ?? null]).sort(), [['T', null], ['a', 'removed'], ['b', null]]);
  assert.deepEqual(g.edges.map(e => [e._id ?? e.id, e.label, e.change]).sort(), [['a->T', 'charges', 'removed'], ['r2', 'calls', 'removed']]);
  // and a container whose two systems' line goes with it, the other end a removed system: both back
  const after2 = { ...structuredClone(base), nodes: base.nodes.filter(n => !['a', 'T', 'c'].includes(n.id)), edges: [], views: [{ ...base.views[0], nodeIds: ['b'] }] };
  assert.deepEqual(all.layout(all.diff(base, after2).model, 'cv').edges.map(e => [e._id ?? e.id, e.change]).sort(), [['a->T', 'removed'], ['r2', 'removed']]);
});

test('audit 50: renaming a C4 element no view draws marks no line, as diff().views lists no view', async () => {
  const all = await fromSrc(), El = (id, t, label, parent) => ({ id, type: 'c4.' + t, label, ...(parent ? { parent } : {}), props: {} });
  const base = { schemaVersion: 2, nodes: [El('S', 'SoftwareSystem', 'Shop'), El('T', 'SoftwareSystem', 'Pay'), El('a', 'Container', 'Web', 'S'), El('c', 'Container', 'Gateway', 'T'), El('k', 'Component', 'K', 'a')],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'k', to: 'c', label: 'charges' }], views: [{ id: 'ctx', diagram: 'c4.context', title: 'Context', nodeIds: ['S', 'T'] }] };
  const after = structuredClone(base); after.nodes[4].label = 'K2';
  const d = all.diff(base, after), e = all.layout(d.model, 'ctx').edges[0];
  assert.deepEqual([d.summary, d.views], [['renames K to K2'], []]);
  assert.equal(e.change, undefined, 'the line looks as it did'); assert.match(e.aria, /K2 to Gateway/, 'its name says the new name');
  // its label changed with the relationship's: listed, and marked
  const b2 = structuredClone(base); b2.edges[0].label = 'bills'; const d2 = all.diff(base, b2);
  assert.deepEqual([d2.views, all.layout(d2.model, 'ctx').edges[0].change], [['ctx'], 'changed']);
});

test('audit 50: the diff page draws the port a retyped part lost, removed, beside the ones it gained (composite structure, SysML internal block)', async () => {
  const all = await fromSrc();
  const A = read45('order-service-structure'); A.edges = A.edges.filter(e => e.id !== 'checkout-to-pricing');
  const B = structuredClone(A); B.nodes.find(n => n.id === 'order-service').members.find(m => m.id === 'order-service.pricing').props.valueType = 'CheckoutFlow';
  const g = all.layout(all.diff(A, B).model, 'internals'), on = g.nodes.filter(n => n.id.startsWith('order-service.pricing->')).map(n => [n.id, n.change]);
  assert.deepEqual(on, [['order-service.pricing->checkout-class.requests', 'added'], ['order-service.pricing->checkout-class.quotes', 'added'], ['order-service.pricing->checkout-class.charges', 'added'], ['order-service.pricing->price-calculator.quotes', 'removed']]);
  assert.match(svgOf(g), /data-id="order-service\.pricing-&gt;price-calculator\.quotes"[^>]*data-change="removed"|data-change="removed"[^>]*data-id="order-service\.pricing-&gt;price-calculator\.quotes"/, 'drawn removed');
  assert.ok(!all.layout(B, 'internals').nodes.some(n => n.id === 'order-service.pricing->price-calculator.quotes'), 'the model after draws it no more');
  const E = read45('ebike-structure'); E.edges = E.edges.filter(e => !JSON.stringify(e).includes('frontLight'));
  const F = structuredClone(E); F.nodes.find(n => n.id === 'ebike').members.find(m => m.id === 'ebike.frontLight').props.valueType = 'Motor';
  assert.deepEqual(all.layout(all.diff(E, F).model, 'inside-ebike').nodes.filter(n => n.id.startsWith('ebike.frontLight->')).map(n => [n.id, n.change]),
    [['ebike.frontLight->motor.phases', 'added'], ['ebike.frontLight->light.power', 'removed']]);
});

test('audit 50: a message marked removed in another letter case is numbered as a removed one is', async () => {
  const all = await fromSrc(), { messageNumbers } = await import('../src/uml/interaction.js'), a = read45('checkout-communication'), V = 'checkout-communication';
  const mark = w => { const c = structuredClone(a); c.edges.find(e => e.id === 'cm1').change = w; return c; };
  const nums = c => Object.fromEntries(messageNumbers(c, c.views.find(v => v.id === V)));
  assert.deepEqual(nums(mark('Removed')), nums(mark('removed'))); assert.notDeepEqual(nums(mark('Removed')), nums(a));
  const rows = c => all.layout(c, V).nodes.filter(n => n.shape === 'message-row').map(n => [n.id, n.num, n.aria]);
  assert.deepEqual(rows(mark('REMOVED')), rows(mark('removed')), 'the rows drawn, counted and said alike');
});

test('audit 51: deleting the subject of a composite structure, internal block or parametric view draws the view back as it was, its parts, ports and connectors removed', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js');
  for (const [f, id, V] of [['order-service-structure', 'order-service', 'internals'], ['ebike-structure', 'ebike', 'inside-ebike'], ['ebike-range', 'ebike', 'range-analysis']]) {
    const m = read45(f), r = apply(m, [{ op: 'delete', id }]), d = all.diff(m, r.model || r), g0 = all.layout(m, V), g = all.layout(d.model, V);
    const shapes = x => [...x.nodes, ...(x.families || [])].map(n => n.id).sort();
    assert.deepEqual(shapes(g), shapes(g0), `${f}: every shape drawn back`); assert.equal(g.edges.length, g0.edges.length, `${f}: every connector drawn back`);
    const own = [...g.nodes, ...(g.families || [])].filter(n => n.id === id || n.id.startsWith(id + '.'));
    assert.ok(own.length > 1 && own.every(n => n.change === 'removed'), `${f}: the subject and what it holds marked removed`);
    const mine = x => x === id || String(x).startsWith(id + '.'), conn = g.edges.filter(e => mine(e.from) || mine(e.to));
    assert.ok(conn.length && conn.every(e => e.change === 'removed'), `${f}: its connectors marked removed`);
  }
});

test('audit 51: a two-way or parallel line that stands for a removed or added edge says so in its title and key', () => {
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'ab', from: 'a', to: 'b', label: 'asks' }, { id: 'ba', from: 'b', to: 'a', label: 'answers' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const said = x => { const s = svgOf(layout(diff(...x).model, 'v')); return [s.match(/<title>([^<\n]*)/)[1], s.match(/line-key[^>]*aria-label="([^"]*)"/)[1]]; };
  const without = (x, id) => ({ ...x, edges: x.edges.filter(e => e.id !== id) });
  for (const id of ['ab', 'ba']) for (const t of said([m, without(m, id)])) assert.match(t, /, removed$/, `${id} removed: ${t}`);
  for (const t of said([without(m, 'ba'), m])) assert.match(t, /, new$/, 'a reply added');
  const p = { ...m, edges: [{ id: 'x1', from: 'a', to: 'b', label: 'reads' }, { id: 'x2', from: 'a', to: 'b', label: 'writes' }] };
  for (const t of said([p, without(p, 'x2')])) assert.match(t, /reads \+1, removed$/, 'a parallel line removed');
  assert.doesNotMatch(said([m, m])[0], /, (removed|new)/, 'no change: no word');
});

test('audit 51: a card hidden from a view that lists its lines is drawn back with those lines, removed', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js');
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], edges: ['ab', 'bc'] }] };
  const drawn = (x, V, h) => { const r = apply(x, [{ op: 'hide', id: h, view: V }]); return Object.fromEntries(all.layout(all.diff(x, r.model || r).model, V).edges.map(e => [e._id ?? e.id, e.change ?? null])); };
  assert.deepEqual(drawn(m, 'v', 'c'), { ab: null, bc: 'removed' });
  assert.equal(drawn(read45('bookshop-atlas'), 'shopping', 'browse')['shopper-browses'], 'removed', 'a use case view');
  assert.equal(drawn(read45('bookshop-deployment'), 'production', 'database')['app-to-database'], 'removed', 'a deployment view');
});

test('audit 51: a C4 dynamic view draws a step hidden, taken out of its list or put into it, in place and marked (audit 52: a removed one unnumbered)', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js'), B = read45('bookshop-c4'), V = 'c4-placing-an-order';
  const steps = x => all.layout(x, V).edges.slice(0, 3).map(e => [e.step, e._id ?? e.id, e.change ?? null]);
  const r = apply(B, [{ op: 'hide', id: 'c4-shopper-storefront', view: V }]), d = all.diff(B, r.model || r);
  assert.deepEqual(steps(d.model)[0], [undefined, 'c4-shopper-storefront', 'removed'], 'a hidden step');
  const { validate: check } = await import('../src/map/validate.js');
  assert.ok(!check(d.model).some(p => p.rule === 'c4-steps'), 'the marked copy names the model relationship');
  const A = structuredClone(B), v = A.views.find(x => x.id === V); v.edges = v.edges.filter(x => x !== 'c4-storefront-api');
  assert.deepEqual(steps(all.diff(A, B).model)[1], [2, 'c4-storefront-api', 'added'], 'a step put into the list');
  assert.deepEqual(steps(all.diff(B, A).model)[1], [undefined, 'c4-storefront-api', 'removed'], 'a step taken out of it');
  assert.match(svgOf(all.layout(all.diff(B, A).model, V)), /Reads the catalogue/);
});

test('audit 51: a deleted timing lifeline is drawn back with its state rows, changes and the constraints on them, removed', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js'), m = read45('bookshop-timing');
  const r = apply(m, [{ op: 'delete', id: 'lifeline-worker' }]), g = all.layout(all.diff(m, r.model || r).model, 'one-charge');
  const ch = Object.fromEntries(g.nodes.map(n => [n.id, n.change ?? null]));
  assert.deepEqual(Object.keys(ch).sort(), all.layout(m, 'one-charge').nodes.map(n => n.id).sort(), 'every shape drawn back');
  for (const id of ['lifeline-worker', 'lifeline-worker->Idle', 'lifeline-worker->Waiting for payment', 'w-idle', 'w-waiting', 'w-recording', 'w-done', 'c-wait', 'c-finished']) assert.equal(ch[id], 'removed', id);
  for (const id of ['lifeline-payments', 'lifeline-payments->Idle', 'p-idle']) assert.equal(ch[id], null, id);
  // a change taken out of a lifeline that stays is not drawn back (it would change the lane's steps)
  const k = structuredClone(m); k.views[0].timeline.changes = k.views[0].timeline.changes.filter(c => c.id !== 'p-capturing');
  assert.ok(!all.layout(all.diff(m, k).model, 'one-charge').nodes.some(n => n.id === 'p-capturing'));
});

// audit 52
const types52 = f => JSON.parse(readFileSync(new URL(`../examples/types/${f}.json`, import.meta.url)));
test('audit 52: a deleted lifeline or timing lane is drawn back in its old place, and an interaction use covering it keeps its width', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js');
  const m = types52('uml-sequence'), V = m.views[0].id, d = all.diff(m, apply(m, { op: 'delete', id: 'storefront' }));
  assert.deepEqual(d.model.views[0].nodeIds, m.views[0].nodeIds, 'storefront back between shopper and api');
  const g = all.layout(d.model, V), at = id => g.nodes.find(n => n.id === id), u = at('u1');
  assert.equal(at('storefront').change, 'removed');
  assert.ok(at('storefront').x < at('api').x && at('shopper').x < at('storefront').x, 'in its place');
  assert.ok(u.x + u.w < at('hold').x, `u1 covers storefront and api only: ${u.x}+${u.w} against hold at ${at('hold').x}`);
  const t = types52('uml-timing'), T = t.views[0], lane = T.nodeIds[0], dt = all.diff(t, apply(t, { op: 'delete', id: lane })), gt = all.layout(dt.model, T.id);
  assert.deepEqual(dt.model.views[0].nodeIds, T.nodeIds);
  const y = id => gt.nodes.find(n => n.id === id).y; assert.ok(T.nodeIds.slice(1).every(id => y(lane) < y(id)), 'the removed lane stays at the top');
  // a card taken out of a map view comes back in its place too, and a card that stays keeps its own
  const p = { nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })), views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'] }] }, q = structuredClone(p);
  q.views[0].nodeIds = ['d', 'a', 'c']; assert.deepEqual(all.diff(p, q).model.views[0].nodeIds, ['d', 'a', 'b', 'c']);
  q.views[0].nodeIds = ['c', 'd']; assert.deepEqual(all.diff(p, q).model.views[0].nodeIds, ['a', 'b', 'c', 'd']);
});

test('audit 52: a card hidden from a view that lists no lines, and a removed view, bring their lines back removed', async () => {
  const all = await fromSrc(), { apply } = await import('../src/core/apply.js');
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], edges: [{ id: 'e1', from: 'a', to: 'b', label: 'x' }, { id: 'e2', from: 'b', to: 'c' }, { from: 'c', to: 'a' }],
    views: [{ id: 'w', title: 'W', nodeIds: ['a', 'b', 'c'] }, { id: 'u', title: 'U', nodeIds: ['a', 'b', 'c'] }] };
  const lines = (x, V) => Object.fromEntries(all.layout(x, V).edges.map(e => [e._id ?? e.id, e.change ?? null]));
  const h = structuredClone(m); h.views[0].nodeIds = ['b', 'c'];
  const d = all.diff(m, h); assert.deepEqual(d.summary, ['takes A out of the view W']);
  assert.deepEqual(lines(d.model, 'w'), { e1: 'removed', e2: null, 'c->a#0': 'removed' });
  assert.match(svgOf(all.layout(d.model, 'w')), /<title>A → B: x, removed<\/title>/);
  const r = structuredClone(m); r.views = r.views.slice(0, 1); const dr = all.diff(m, r);
  assert.deepEqual(lines(dr.model, 'u'), { e1: 'removed', e2: 'removed', 'c->a#0': 'removed' }, 'a removed view');
  // a typed view: its type picks its lines, so they are marked in view.diffMarks
  const s = read45('sales-classes'), dv = s.views.find(v => v.id === 'domain'), ds = all.diff(s, apply(s, { op: 'hide', id: 'customer', view: 'domain' }));
  assert.ok(!Array.isArray(dv.edges)); assert.equal(lines(ds.model, 'domain')['customer-orders'], 'removed', 'a class view');
  // a removed typed view: what it draws, its fragments and its timeline's changes, removed
  for (const f of ['uml-timing', 'uml-communication', 'bpmn', 'uml-sequence']) { const x = types52(f), y = { ...structuredClone(x), views: [] }, dx = all.diff(x, y);
    for (const v of x.views) { const g = all.layout(dx.model, v.id);
      const live = [...g.nodes, ...(g.families || []), ...g.edges].filter(n => n.change !== 'removed').map(n => n._id ?? n.id);
      assert.deepEqual(live, [], `${f} ${v.id}`); } }
  const sq = types52('uml-sequence'), w0 = all.diff(sq, { ...sq, views: [] }).model.views[0];
  assert.ok(w0.fragments.length && w0.fragments.every(f => f.change === 'removed'), 'a removed sequence view\'s fragments');
  const tm = types52('uml-timing'), t0 = all.diff(tm, { ...tm, views: [] }).model.views[0];
  assert.ok(t0.timeline.changes.every(c => c.change === 'removed'), 'a removed timing view\'s changes');
});

test('audit 52: a box removed from or added to a map view is said, and drawn marked', async () => {
  const all = await fromSrc(), m = JSON.parse(readFileSync(new URL('fixtures/map-shop.json', import.meta.url))), V = m.views[0]; // the old map type page's model, kept as a fixture
  const box = (f, ...want) => { const b = structuredClone(m); f(b.views[0]); const d = all.diff(m, b); want.forEach(w => assert.ok(d.summary.includes(`${w} in the view ${V.title}`), `${w}: ${d.summary}`)); return d; };
  const gone = box(v => { v.containers = v.containers.filter(c => c.id !== 'support'); }, 'removes the box Support');
  const g = all.layout(gone.model, V.id), sup = (g.families || []).find(f => f.id === 'support');
  assert.equal(sup && sup.change, 'removed', 'drawn back, removed');
  assert.match(svgOf(g), /data-family="support"[^>]*data-change="removed"/);
  const came = box(v => { v.containers.push({ id: 'nb', label: 'New box', nodeIds: [v.nodeIds[0]] }); }, 'adds the box New box');
  assert.equal(all.layout(came.model, V.id).families.find(f => f.id === 'nb').change, 'added');
  assert.deepEqual(box(v => { v.containers[0].label = 'Platform 2'; }).summary, [`renames the box Shop platform to Platform 2 in the view ${V.title}`], 'a rename as before');
  assert.doesNotMatch(svgOf(all.layout(m, V.id)), /data-family="[^"]*"[^>]*data-change/, 'a map box with no change: no mark');
});

test('audit 52: a C4 dynamic view on the diff page numbers its live steps only, as the model after does', async () => {
  const all = await fromSrc();
  const mk = (steps, rels = ['r1', 'r2', 'r3']) => ({ schemaVersion: 2, nodes: [{ id: 'S', type: 'c4.SoftwareSystem', label: 'Shop' },
    { id: 'a', type: 'c4.Container', label: 'Web', parent: 'S' }, { id: 'b', type: 'c4.Container', label: 'Api', parent: 'S' }, { id: 'c', type: 'c4.Container', label: 'Db', parent: 'S' }],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'a', to: 'b', label: 'one' }, { id: 'r2', type: 'c4.Relationship', from: 'b', to: 'c', label: 'two' }, { id: 'r3', type: 'c4.Relationship', from: 'b', to: 'a', label: 'three' }].filter(e => rels.includes(e.id)),
    views: [{ id: 'd', diagram: 'c4.dynamic', subject: 'S', nodeIds: ['a', 'b', 'c'], edges: steps }] });
  const nums = x => (svgOf(all.layout(x, 'd')).match(/>(\d · )?[a-z]+<\/text>/g) || []).map(t => t.slice(1, -7));
  const arias = x => (svgOf(all.layout(x, 'd')).match(/aria-label="Step[^"]*"/g) || []);
  for (const [b, label] of [[mk(['r2', 'r3']), 'taken out of the view'], [mk(['r2', 'r3'], ['r2', 'r3']), 'its relationship deleted']]) {
    const d = all.diff(mk(['r1', 'r2', 'r3']), b).model;
    assert.deepEqual(nums(d), ['one', '1 · two', '2 · three'], label); assert.deepEqual(nums(b), ['1 · two', '2 · three']);
    assert.deepEqual(arias(d), ['aria-label="Step: Relationship from Web to Api: one, removed"', 'aria-label="Step 1: Relationship from Api to Db: two"', 'aria-label="Step 2: Relationship from Api to Web: three"'], label); }
  assert.deepEqual(nums(all.diff(mk(['r1', 'r3']), mk(['r1', 'r2', 'r3'])).model), ['1 · one', '2 · two', '3 · three'], 'a step put in is numbered');
});

test('audit 52: a moved requirement\'s old containment is drawn back when its old owner was taken out of the view', async () => {
  const all = await fromSrc(), a = read45('ebike-requirements'), b = structuredClone(a);
  b.views[0].nodeIds = b.views[0].nodeIds.filter(x => x !== 'spec'); b.nodes.find(n => n.id === 'range').parent = 'docking';
  const g = all.layout(all.diff(a, b).model, a.views[0].id), ch = Object.fromEntries(g.edges.filter(e => e.type === 'containment').map(e => [`${e.from}->${e.to}`, e.change ?? null]));
  assert.equal(ch['range->spec'], 'removed'); assert.equal(ch['range->docking'], 'added'); assert.equal(ch['docking->spec'], 'removed');
});

const edit = (m, f) => { const x = structuredClone(m); f(x); return x; };
test('audit 53: what diff() writes validates when a card is taken out of a map view, a line hidden or a map view removed: a line drawn back removed is no second line', async () => {
  const all = await fromSrc(), { validate: check } = await import('../src/map/validate.js'), errs = x => check(x).filter(p => p.level === 'error');
  const m = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }],
    views: [{ id: 'main', nodeIds: ['a', 'b', 'c'] }, { id: 'side', title: 'Side', nodeIds: ['a', 'b'] }] };
  const listed = edit(m, x => { x.views[0].edges = ['ab', 'bc']; });
  for (const [name, a, b] of [['hidden card', m, edit(m, x => { x.views[0].nodeIds = ['a', 'b']; })], ['removed view', m, edit(m, x => { x.views.pop(); })],
    ['hidden card, listed lines', listed, edit(listed, x => { x.views[0].nodeIds = ['a', 'b']; x.views[0].edges = ['ab']; })], ['hidden line', listed, edit(listed, x => { x.views[0].edges = ['ab']; })]]) {
    const d = all.diff(a, b); assert.ok(d.model.views.some(v => (v.edges || []).some(e => e && e.change === 'removed')), name); assert.deepEqual(errs(d.model), [], name); }
  // the rule holds for anything else: a view's own line under a model line's id, live or between other ends
  for (const e of [{ id: 'bc', from: 'b', to: 'c' }, { id: 'bc', from: 'a', to: 'c', change: 'removed' }])
    assert.match(errs(edit(m, x => { x.views[0].edges = ['ab', e]; })).map(p => p.message).join(), /line id "bc" is used twice/, JSON.stringify(e));
  // every example: each map view removed, and each of its first cards taken out
  for (const f of ['shapes', 'integration']) { const x = read45(f), e0 = new Set(errs(x).map(p => p.message));
    for (const v of x.views.filter(w => w && !(x.schemaVersion === 2 && w.diagram != null && w.diagram !== 'map') && w.id !== x.root)) {
      const n = d => errs(all.diff(x, d).model).filter(p => !e0.has(p.message)).map(p => p.message);
      assert.deepEqual(n(edit(x, y => { y.views = y.views.filter(w => w.id !== v.id); y.views.forEach(w => { if (w.parent === v.id) delete w.parent; }); })), [], `${f}: ${v.id} removed`);
      for (const id of v.nodeIds.slice(0, 3)) assert.deepEqual(n(edit(x, y => { const w = y.views.find(z => z.id === v.id); w.nodeIds = w.nodeIds.filter(z => z !== id);
        (w.containers || []).forEach(c => { if (c && Array.isArray(c.nodeIds)) c.nodeIds = c.nodeIds.filter(z => z !== id); }); })), [], `${f}: ${id} out of ${v.id}`); } }
});

test('audit 53: a map box\'s change is checked as a card\'s, and the schema and the types list it', async () => {
  const { validate: check } = await import('../src/map/validate.js');
  const box = ch => check({ nodes: [{ id: 'a' }, { id: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'box', label: 'Box', nodeIds: ['a'], change: ch }] }] });
  for (const ch of ['removed', 'added', 'planned']) assert.deepEqual(box(ch), [], ch);
  assert.deepEqual(box('Removed').map(p => [p.level, p.path]), [['warning', 'views[0].containers[0].change']]); assert.match(box('Removed')[0].message, /write it in lower case/);
  for (const ch of ['bogus', ['removed']]) assert.match(box(ch).map(p => `${p.path} ${p.message}`).join(), /views\[0\]\.containers\[0\]\.change .*drawn unmarked/, JSON.stringify(ch));
  const schema = JSON.parse(readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.$defs.container.properties.change.enum, schema.$defs.node.properties.change.enum);
  assert.match(readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8'), /containers\?: \{[^}]*change\?: 'added'/);
});

test('audit 53: an information flow\'s conveyed item taken out of or put into the view marks the item only: the flows draw as they did', async () => {
  const all = await fromSrc(), m = read45('order-information-flow'), V = m.views[0].id, out = edit(m, x => { x.views[0].nodeIds = x.views[0].nodeIds.filter(id => id !== 'stock-info'); });
  const marked = x => { const g = all.layout(x, V); return Object.fromEntries([...g.nodes, ...g.edges].filter(n => n.change).map(n => [n._id ?? n.id, n.change])); };
  assert.deepEqual(marked(all.diff(m, out).model), { 'stock-info': 'removed' }, 'taken out');
  assert.deepEqual(marked(all.diff(out, m).model), { 'stock-info': 'added' }, 'put in');
  assert.deepEqual(marked(all.diff(m, edit(m, x => { x.nodes.find(n => n.id === 'stock-info').label = 'Stock'; })).model),
    { 'stock-info': 'changed', 'warehouse-api': 'changed', 'api-storefront': 'changed' }, 'renamed: the flows name it, as before');
});

test('audit 53: an IDEF1X view that lists its lines marks no entity when one relationship is taken out of the list', async () => {
  const all = await fromSrc(), m = read45('bookshop-schema'), V = m.views[0];
  V.notation = 'idef1x'; V.edges = m.edges.map(e => e.id);
  for (const id of V.edges) { const b = structuredClone(m); b.views[0].edges = b.views[0].edges.filter(x => x !== id);
    const g = all.layout(all.diff(m, b).model, V.id);
    assert.deepEqual(g.nodes.filter(n => n.change).map(n => n.id), [], `${id} taken out: no entity marked`);
    assert.equal(g.edges.find(e => (e._id ?? e.id) === id).change, 'removed', `${id} drawn back removed`); }
  // a relationship deleted from the model still marks its child, which draws otherwise
  const b = structuredClone(m); b.edges = b.edges.filter(e => e.id !== 'er-order-lines'); b.views[0].edges = b.views[0].edges.filter(x => x !== 'er-order-lines');
  assert.equal(all.layout(all.diff(m, b).model, V.id).nodes.find(n => n.id === 'er-order_line').change, 'changed');
});

test('audit 53: a namesake interface or constraint block that comes or goes marks the ports and constraint properties it leaves unresolved', async () => {
  const all = await fromSrc();
  const cases = [['ebike-structure', 'inside-ebike', { id: 'ci2', type: 'sysml.InterfaceBlock', label: 'ChargeInterface' }, ['ebike.battery->battery.charge', 'ebike.dock->dock.charge'], n => n.flow ?? null],
    ['ebike-range', 'range-analysis', { id: 're2', type: 'sysml.ConstraintBlock', label: 'RangeEquation' }, ['ebike.empty', 'ebike.laden'], n => n.expr ?? null]];
  for (const [f, vid, twin, ids, look] of cases) { const m = read45(f), b = structuredClone(m); b.nodes.push(twin);
    for (const [x, y, word] of [[m, b, 'added'], [b, m, 'deleted']]) { const d = all.diff(x, y), g = all.layout(d.model, vid), at = id => g.nodes.find(n => n.id === id);
      assert.ok(d.views.includes(vid), `${f}: namesake ${word}, the view listed`);
      assert.deepEqual(ids.map(id => at(id).change), ids.map(() => 'changed'), `${f}: namesake ${word}, marked`);
      assert.deepEqual(ids.map(id => look(at(id))), ids.map(id => look(all.layout(y, vid).nodes.find(n => n.id === id))), `${f}: namesake ${word}, drawn as the model after`); } }
});

test('audit 53: an interface, constraint or part type block re-created under a new id draws on the diff page as in the model after', async () => {
  const all = await fromSrc();
  const remake = (f, id, nid) => { const m = read45(f), a = structuredClone(m), i = a.nodes.findIndex(n => n.id === id), o = a.nodes[i];
    a.nodes[i] = { ...o, id: nid, members: (o.members || []).map(x => ({ ...x, id: x.id.replace(id + '.', nid + '.') })) };
    a.edges.forEach(e => { for (const k of ['from', 'to']) if (typeof e[k] === 'string') e[k] = e[k].replace(id + '.', nid + '.'); }); return [m, a]; };
  { const [m, a] = remake('ebike-range', 'usable-energy', 'ue2'), pick = g => g.nodes.find(n => n.id === 'ebike.usable');
    const g = all.layout(all.diff(m, a).model, 'range-analysis');
    assert.equal(pick(g).expr, '{usable = capacity * share}'); assert.equal(pick(g).expr, pick(all.layout(a, 'range-analysis')).expr); assert.equal(pick(g).change, undefined, 'drawn as it was: no mark'); }
  { const [m, a] = remake('ebike-structure', 'charge-interface', 'ci2'), d = all.diff(m, a);
    const flow = x => all.layout(x, 'inside-ebike').nodes.find(n => n.id === 'ebike.battery->battery.charge').flow;
    assert.equal(flow(a), 'inout'); assert.equal(flow(d.model), 'inout'); }
  { const [m, a] = remake('ebike-structure', 'battery', 'bat2'), g = all.layout(all.diff(m, a).model, 'inside-ebike');
    const ports = g.nodes.filter(n => n.id.startsWith('ebike.battery->')).map(n => `${n.id.split('->')[1]}:${n.change}`).sort();
    assert.deepEqual(ports.filter(p => p.startsWith('bat2.')), all.layout(a, 'inside-ebike').nodes.filter(n => n.id.startsWith('ebike.battery->')).map(n => `${n.id.split('->')[1]}:added`).sort(), 'the new block\'s ports drawn, added'); }
});

// audit 54
test('audit 54: a stereotype removed from a profile marks no card or box of its scope that draws as before, as the reverse diff marks none', async () => {
  const all = await fromSrc(), b = read45('bookshop-profile'), V = 'profile';
  const marked = (x, y) => Object.fromEntries([...all.layout(all.diff(x, y).model, V).nodes, ...(all.layout(all.diff(x, y).model, V).families || [])].filter(n => n.change).map(n => [n.id, n.change]));
  for (const st of ['column', 'entity']) { const a = structuredClone(b); a.nodes = a.nodes.filter(n => n.id !== st); a.edges = a.edges.filter(e => e.from !== st && e.to !== st);
    const out = marked(b, a), back = marked(a, b);
    assert.equal(out.sales, undefined, `removing «${st}» marks the package sales: ${JSON.stringify(out)}`);
    assert.equal(out[st], 'removed'); assert.equal(back[st], 'added');
    // what else it marks is what the reverse marks too: a card that draws the tag compartment
    assert.deepEqual(Object.keys(out).sort(), Object.keys(back).sort(), `both ways mark the same: ${JSON.stringify(out)} ${JSON.stringify(back)}`); }
});

test('audit 54: a C4 dynamic view on the diff page draws the steps through a card taken out of it removed and unnumbered, the live ones numbered as the model after', async () => {
  const all = await fromSrc(), B = read45('bookshop-c4'), V = 'c4-placing-an-order';
  const A = structuredClone(B), w = A.views.find(v => v.id === V); w.nodeIds = w.nodeIds.filter(id => id !== 'c4-shopper');
  const steps = m => all.layout(m, V).edges.map(e => [e._id ?? e.id, e.step ?? null, e.change ?? null]);
  const live = (m, ch) => steps(m).filter(s => s[2] !== ch).map(s => s.slice(0, 2));
  const out = steps(all.diff(B, A).model);
  assert.deepEqual(out.filter(s => s[2] === 'removed').map(s => s.slice(0, 2)), [['c4-shopper-storefront', null], ['c4-mail-shopper', null]]);
  assert.deepEqual(live(all.diff(B, A).model, 'removed'), live(A), 'the live steps as the model after numbers them');
  assert.match(svgOf(all.layout(all.diff(B, A).model, V)), /aria-label="Step 8: Relationship from Order worker to Database/);
  // put back: drawn added, numbered as the model after
  const back = steps(all.diff(A, B).model);
  assert.deepEqual(back.filter(s => s[2] === 'added').map(s => s.slice(0, 2)), [['c4-shopper-storefront', 1], ['c4-mail-shopper', 9]]);
  assert.deepEqual(back.map(s => s.slice(0, 2)), steps(B).map(s => s.slice(0, 2)));
});

test('audit 54: a C4 deployment view on the diff page draws both sides of an instance taken out or put back: its line and the implied line from its node', async () => {
  const all = await fromSrc(), B = read45('bookshop-c4'), V = 'c4-deployment';
  const A = structuredClone(B), w = A.views.find(v => v.id === V); w.nodeIds = w.nodeIds.filter(id => id !== 'c4-storefront-1');
  const lines = m => Object.fromEntries(all.layout(m, V).edges.map(e => [e._id ?? e.id, e.change ?? null]));
  // every line diff() marks in the view is drawn (view.diffMarks: marks and gone)
  const drawsMarks = (d, why) => { const dm = d.model.views.find(v => v.id === V).diffMarks || {}, L = lines(d.model);
    for (const [k, h] of Object.entries(dm.marks || {})) assert.equal(L[k], h, `${why}: ${k} drawn ${h}: ${JSON.stringify(L)}`);
    for (const x of dm.gone || []) assert.equal(L[x.id], 'removed', `${why}: ${x.id} drawn back removed: ${JSON.stringify(L)}`); };
  const out = all.diff(B, A); drawsMarks(out, 'taken out');
  const g = all.layout(out.model, V), at = id => g.nodes.find(n => n.id === id);
  assert.ok(at('c4-browser'), 'Web browser drawn as a card, as the model after draws it');
  assert.equal(at('c4-storefront-1').change, 'removed');
  assert.deepEqual([lines(out.model)['c4-browser->c4-api-1'], lines(out.model)['c4-storefront-1-api-1']], ['added', 'removed']);
  const back = all.diff(A, B); drawsMarks(back, 'put back');
  assert.deepEqual([lines(back.model)['c4-browser->c4-api-1'], lines(back.model)['c4-storefront-1-api-1']], ['removed', 'added']);
  for (const d of [out, back]) assert.doesNotThrow(() => svgOf(all.layout(d.model, V)));
});

// audit 55
test('audit 55: a map sequence view on the diff page numbers its live steps as the model after does; a removed step has no number', async () => {
  const { describe } = await import('../lib/umlimator.js'), A = JSON.parse(readFileSync(new URL('fixtures/map-shop.json', import.meta.url))), V = 'shop-run';
  const steps = m => layout(m, V).edges.map(e => [e._id ?? e.id, e.step ?? null, e.change ?? null]);
  // the price step: deleted from the model, taken out of the view's list, or its card taken out of the view
  const cases = { deleted: edit(A, m => { m.edges = m.edges.filter(e => e.id !== 'price'); m.views.forEach(v => { if (Array.isArray(v.edges)) v.edges = v.edges.filter(e => e !== 'price'); }); }),
    hidden: edit(A, m => { const v = m.views.find(x => x.id === V); v.edges = (v.edges || layout(A, V).edges.map(e => e._id ?? e.id)).filter(e => e !== 'price'); }),
    'card out': edit(A, m => { const v = m.views.find(x => x.id === V); v.nodeIds = v.nodeIds.filter(id => id !== 'pricing'); }) };
  for (const [why, B] of Object.entries(cases)) { const d = diff(A, B).model, s = steps(d);
    assert.deepEqual(s.filter(x => x[2] === 'removed').map(x => x.slice(0, 2)), [['price', null]], why);
    assert.deepEqual(s.filter(x => x[2] !== 'removed').map(x => x.slice(0, 2)), steps(B).map(x => x.slice(0, 2)), `${why}: live steps as the model after numbers them`);
    const svg = svgOf(layout(d, V)); assert.doesNotMatch(svg, /Step \d+: Shop API → Pricing/, why); assert.match(svg, /Step 3: Shop API → Fraud check/, why);
    const said = describe(d, V); assert.match(said, /Removed step: Shop API calls Pricing/, why); assert.match(said, /Step 6: Shop API reads or writes Order queue/, why); assert.doesNotMatch(said, /Step 7/, why); }
});

test('audit 55: a view\'s own lines to a card taken out of it (or put back) are drawn removed (added) on the diff page, as the model lines it lists', async () => {
  const all = await fromSrc(), A = read45('integration');
  for (const [V, card, own] of [['ride-end', 'pricing', ['ride-end-4']], ['unlock-sequence', 'lifeline-dock', ['m4', 'm5', 'm8']]]) {
    const B = edit(A, m => { const v = m.views.find(x => x.id === V); v.nodeIds = v.nodeIds.filter(id => id !== card); });
    const marks = m => all.layout(m, V).edges.filter(e => e.change).map(e => [e._id ?? e.id, e.change]);
    assert.deepEqual(marks(all.diff(A, B).model), own.map(id => [id, 'removed']), `${V}: ${card} taken out`);
    assert.deepEqual(marks(all.diff(B, A).model), own.map(id => [id, 'added']), `${V}: ${card} put back`);
    for (const d of [all.diff(A, B), all.diff(B, A)]) assert.deepEqual(validateAll(d.model).filter(p => p.level === 'error'), [], V); }
  // the map sequence view's live steps keep the model after's numbers
  const B = edit(A, m => { const v = m.views.find(x => x.id === 'ride-end'); v.nodeIds = v.nodeIds.filter(id => id !== 'pricing'); });
  const titles = m => [...svgOf(all.layout(m, 'ride-end')).matchAll(/<title>(Step \d+)?([^<]*?)(?:\(|<)/g)].map(x => x[1] ?? 'none').filter(x => x !== 'none');
  assert.deepEqual(titles(all.diff(A, B).model), titles(B));
});

test('audit 55: a component view that lists its lines draws a line between ports removed (added) with the card that holds its far port', async () => {
  const all = await fromSrc(), A = edit(read45('bookshop-components'), m => { m.views[0].edges = m.edges.map(e => e.id); }), V = A.views[0].id;
  const B = edit(A, m => { m.views[0].nodeIds = m.views[0].nodeIds.filter(id => id !== 'payment-provider-component'); });
  const at = m => (all.layout(m, V).edges.find(e => (e._id ?? e.id) === 'api-to-provider') || {}).change ?? null;
  assert.equal(at(all.diff(A, B).model), 'removed'); assert.equal(at(all.diff(B, A).model), 'added');
});
