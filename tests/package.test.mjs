// The package diagram, uml.package, and the boxes a class view draws (work package 2.2, notes/stage-2.md §4 to §7, §10):
// which shown package is a box and what it holds, qualified names, lines at a box, the package type's definition, its
// validators, describe(), its views laid out, and a 30-step session saved and reopened. tests/package.html draws it in a
// browser and edits it by pointer and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { validate } from '../src/map/validate.js';
import { mapContext } from '../src/map/context.js';
import { tablesOf } from '../src/page/print.js';
import { describe } from '../src/map/insight.js';
import { SHAPE } from '../src/draw/shapes.js';
import { svgOf } from '../src/draw/svg.js';
import { ownersOn, readingOrder, ownerChoices } from '../src/uml/owners.js';
import '../src/uml/package.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const EX = read('../examples/bookshop-packages.json');
// the example as stage 2 made it, without the profile and its application 6.7 added for the Bookshop atlas (the last
// test draws those)
const PKG = { ...EX, nodes: EX.nodes.filter(n => n.id !== 'conventions'), edges: EX.edges.filter(e => e.id !== 'sales-applies-conventions'),
  views: [{ ...EX.views[0], nodeIds: EX.views[0].nodeIds.filter(id => id !== 'conventions'), edges: EX.views[0].edges.filter(id => id !== 'sales-applies-conventions') }] };
// the example lists its view's lines (so in the Bookshop atlas the class file's Order → Money «use» stays out of it); these
// tests add lines to the model and draw them by the package diagram's line types: the view with no edges list
const unlisted = () => { const m = structuredClone(PKG); delete m.views[0].edges; return m; };
const T = diagramOf({ diagram: 'uml.package' });
const N = (id, type, label, parent, more = {}) => ({ id, type: 'uml.' + type, label, ...(parent ? { parent } : {}), ...more });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x > f.x && o.y > f.y && o.x + o.w < f.x + f.w && o.y + o.h < f.y + f.h;

test('the definition: uml.package is registered with its palette, its four lines, its properties and its hooks', () => {
  assert.equal(T.name, 'uml.package');
  assert.deepEqual(T.elements.map(e => e.type), ['uml.Package', 'uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType', 'uml.Comment']);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['uml.PackageImport', 'Import'], ['uml.PackageMerge', 'Merge'], ['uml.Dependency', 'Dependency'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.props['uml.PackageImport'], [{ key: 'visibility', label: 'Visibility', kind: 'enum', options: ['public', 'private'] }]);
  for (const t of [...T.elements, ...T.lines]) assert.ok(Array.isArray(T.props[t.type]) || t.type === 'uml.Comment', t.type);
  for (const k of ['layout', 'validate', 'describe', 'rankFlip', 'boxes', 'owners']) assert.equal(typeof T[k], 'function', k);
  assert.equal(T.validate.length, 2, 'its rules run per view (line-inside, own-boxes)');
  assert.deepEqual(['uml.Class', 'uml.Package'].map(t => T.member.holds({ type: t })), [false, false], 'a classifier is drawn by its name; its members are edited in a class view');
  assert.deepEqual(Object.keys(T.rules).filter(r => ['import-ends', 'package-names', 'owner-kinds', 'line-inside', 'own-boxes', 'classifier-names'].includes(r)).length, 6);
  const C = diagramOf({ diagram: 'uml.class' });
  for (const k of ['boxes', 'owners']) assert.equal(typeof C[k], 'function', `uml.class gives ${k} too`);
});

// ---- §4.1: which shown package is a box, and what it holds
const OWN = { schemaVersion: 2,
  nodes: [N('a', 'Package', 'a'), N('b', 'Package', 'b', 'a'), N('x', 'Class', 'X', 'b'), N('y', 'Class', 'Y', 'a'), N('empty', 'Package', 'empty'),
    N('hid', 'Package', 'hid'), N('h1', 'Class', 'H1', 'hid'), N('some', 'Package', 'some'), N('s1', 'Class', 'S1', 'some'), N('s2', 'Class', 'S2', 'some'),
    N('pay', 'Package', 'payments'), N('card', 'Package', 'card', 'pay'), N('cp', 'Class', 'CardPayment', 'card'), N('top', 'Class', 'Top'),
    N('outer', 'Class', 'Outer', 'a'), N('inner', 'Class', 'Inner', 'outer')],
  edges: [], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['a', 'b', 'x', 'y', 'empty', 'hid', 'some', 's1', 'cp', 'top', 'inner'] }] };
test('§4.1: a shown package owning something shown is a box holding exactly that; an empty one, or one whose contents are hidden, is closed', () => {
  const pic = ownersOn(OWN, OWN.views[0]);
  assert.deepEqual(pic.boxes.map(b => [b.id, b.parent ?? null, b.nodeIds]), [['a', null, ['y', 'inner']], ['b', 'a', ['x']], ['some', null, ['s1']]]);
  assert.deepEqual([...pic.open], ['a', 'b', 'some']);
  assert.deepEqual(['x', 'y', 'b', 'empty', 'hid', 'cp', 'top', 'inner'].map(pic.owner), ['b', 'a', 'a', null, null, null, null, 'a'], 'a class owner is skipped (owner-kinds warns of it)');
  assert.deepEqual(pic.boxes.map(b => b.aria), ['Package a, holding 3 elements', 'Package b, holding 1 element', 'Package some, holding 1 element']);
  assert.deepEqual(readingOrder(pic), ['a', 'b', 'x', 'y', 'inner', 'empty', 'hid', 'some', 's1', 'cp', 'top'], 'each box, then what it holds, depth first');
  const g = layout(OWN, 'v');
  assert.deepEqual(g.nodes.map(n => [n.id, n.shape]).filter(([, s]) => s === 'package'), [['empty', 'package'], ['hid', 'package']], 'closed packages are folders');
  assert.deepEqual(g.families.map(f => f.id), ['a', 'b', 'some']);
  const F = Object.fromEntries(g.families.map(f => [f.id, f]));
  g.nodes.forEach(n => ['a', 'b', 'some'].forEach(b => assert.equal(inside(n, F[b]), [...pic.boxes.find(x => x.id === b).nodeIds, ...(b === 'a' ? ['x'] : [])].includes(n.id), `${b} and ${n.id}`)));
  assert.deepEqual(check(OWN, 'v'), []);
});

// ---- §6: qualified names
test('§6: names are qualified from the nearest shown owner, else the subject, else the top; only the drawn name changes', () => {
  const pic = ownersOn(OWN, OWN.views[0]);
  assert.deepEqual(['x', 'cp', 'top', 'inner', 's1', 'b'].map(pic.name), ['X', 'payments::card::CardPayment', 'Top', 'Outer::Inner', 'S1', 'b']);
  const sub = { ...OWN.views[0], subject: 'pay' }, inCard = { ...OWN.views[0], nodeIds: [...OWN.views[0].nodeIds, 'pay'] };
  assert.equal(ownersOn(OWN, sub).name('cp'), 'card::CardPayment', 'from the subject');
  assert.equal(ownersOn(OWN, inCard).name('cp'), 'card::CardPayment', 'inside payments, with card between hidden');
  const g = layout(OWN, 'v'), cp = g.nodes.find(n => n.id === 'cp');
  assert.equal(cp.label, 'payments::card::CardPayment'); assert.equal(cp.aria, 'Class payments::card::CardPayment');
  assert.equal(OWN.nodes.find(n => n.id === 'cp').label, 'CardPayment', 'the model keeps its label');
  // two classes named Order in two packages read apart; a long name widens the class to 320 px, then is cut
  const g2 = layout(PKG, 'packages'), orders = g2.nodes.filter(n => /Order$/.test(n.label));
  assert.deepEqual(layout({ ...PKG, views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['order', 'wholesale-order'] }] }, 'v').nodes.map(n => n.label), ['sales::Order', 'wholesale::Order']);
  assert.ok(orders.length === 2);
  const long = { schemaVersion: 2, nodes: [N('p', 'Package', 'a'.repeat(60)), N('c', 'Class', 'C', 'p')], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['c'] }] };
  assert.equal(layout(long, 'v').nodes[0].w, 320);
});

// ---- the example, laid out
test('03-package.json draws: open packages as boxes holding their classes, imports, an access and a merge, laid out clean right and down', () => {
  assert.deepEqual(validate(PKG), []);
  for (const direction of ['down', 'right']) {
    const m = structuredClone(PKG); if (direction === 'right') delete m.views[0].direction;
    const g = layout(m, 'packages'), F = Object.fromEntries(g.families.map(f => [f.id, f]));
    assert.deepEqual(check(m, 'packages'), [], direction);
    for (const a of g.nodes) for (const b of g.nodes) assert.ok(a === b || !meets(a, b), `${direction}: ${a.id} and ${b.id} overlap`);
    assert.deepEqual(g.families.map(f => [f.id, f.parent ?? null, f.nodeIds, f.title]), [['shared', null, ['money'], 'shared'], ['catalog', null, ['book'], 'catalog'],
      ['sales', null, ['customer', 'order', 'line', 'status'], 'sales'], ['payments-package', null, ['payable', 'payment'], 'payments'], ['card', 'payments-package', ['card-payment'], 'card'], ['wholesale', null, ['wholesale-order'], 'wholesale']]);
    assert.ok(inside(F.card, F['payments-package']));
    assert.ok(g.nodes.every(n => n.shape === 'classifier' && !n.compartments.length), 'classifiers by their names only');
    const e = Object.fromEntries(g.edges.map(x => [x.id, x]));
    assert.deepEqual(['catalog-imports-shared', 'payments-accesses-shared', 'wholesale-merges-sales', 'sales-needs-payments'].map(k => [e[k].label, e[k].end]),
      [['«import»', { from: 'none', to: 'open', dashed: true }], ['«access»', { from: 'none', to: 'open', dashed: true }], ['«merge»', { from: 'none', to: 'open', dashed: true }], [undefined, { from: 'none', to: 'open', dashed: true }]]);
    assert.ok(g.edges.filter(x => x.label).every(x => x.lbl), `${direction}: every keyword is drawn`);
    // a line to an open package ends on its border
    g.edges.forEach(x => { const t = F[x.to], p = x.pts.at(-1); assert.ok([t.x, t.x + t.w].includes(p[0]) || [t.y, t.y + t.h].includes(p[1]), `${direction}: ${x.id} ends on ${x.to}'s border at ${p}`); });
    assert.equal(e['payments-accesses-shared'].aria, 'Package import from payments to shared: «access»');
    assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Dependency', 'Package import', 'Package merge']);
  }
});

test('describe(): the package view in words, each box then what it holds, with its imports, access, merge and dependency', () => {
  assert.deepEqual(describe(PKG, 'packages').split('\n'), ['Bookshop packages: a package diagram of 16 elements and 5 lines.',
    'Package shared, holding 1 element.', 'Data type Money.', 'Package catalog, holding 1 element; imports shared.', 'Class Book.',
    'Package sales, holding 4 elements; imports catalog; depends on payments.', 'Class Customer.', 'Class Order (entity).', 'Class OrderLine.', 'Enumeration OrderStatus.',
    'Package payments, holding 3 elements; accesses shared.', 'Interface Payable.', 'Class Payment.', 'Package card, holding 1 element.', 'Class CardPayment.',
    'Package wholesale, holding 1 element; merges sales.', 'Class Order.']);
  const closed = { ...PKG, views: [{ id: 'v', diagram: 'uml.package', title: 'Two', nodeIds: ['sales', 'payments-package', 'card-payment'] }] };
  assert.deepEqual(describe(closed, 'v').split('\n'), ['Two: a package diagram of 3 elements and 1 line.', 'Package sales (closed); depends on payments.',
    'Package payments, holding 1 element.', 'Class card::CardPayment.']);
});

test('a view with no edges list draws the package diagram\'s line types only; a line it lists of another type is drawn', () => {
  const m = unlisted(); m.edges.push({ id: 'gen', type: 'uml.Generalization', from: 'card-payment', to: 'payment' });
  assert.ok(!layout(m, 'packages').edges.some(e => e.id === 'gen'));
  m.views[0].edges = ['gen', 'sales-needs-payments'];
  assert.deepEqual(layout(m, 'packages').edges.map(e => [e.id, e.end.to]), [['gen', 'triangle'], ['sales-needs-payments', 'open']]);
});

// ---- §7: lines at a box
test('§7: a line between a package and something it holds is not drawn, and warned of; a line from depth 3 to depth 0 crosses each border', () => {
  const m = { schemaVersion: 2, nodes: [N('p', 'Package', 'p'), N('q', 'Package', 'q', 'p'), N('r', 'Package', 'r', 'q'), N('deep', 'Class', 'Deep', 'r'), N('top', 'Class', 'Top')],
    edges: [{ id: 'far', type: 'uml.Dependency', from: 'deep', to: 'top' }, { id: 'own', type: 'uml.Dependency', from: 'p', to: 'deep' }],
    views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['p', 'q', 'r', 'deep', 'top'] }] };
  for (const direction of ['right', 'down']) {
    m.views[0].direction = direction;
    const g = layout(m, 'v'), F = Object.fromEntries(g.families.map(f => [f.id, f]));
    assert.deepEqual(g.edges.map(e => e.id), ['far'], direction);
    assert.deepEqual(check(m, 'v'), [], direction);
    assert.ok(inside(F.r, F.q) && inside(F.q, F.p) && inside(g.byId.deep, F.r) && !inside(g.byId.top, F.p), direction);
  }
  const w = validate(m).filter(p => p.rule === 'line-inside');
  assert.deepEqual(w.map(p => [p.level, p.path, p.ids]), [['warning', 'views[0]', ['own', 'p', 'deep']]]);
  assert.equal(describe(m, 'v').split('\n')[0], 'v: a package diagram of 5 elements and 1 line.');
});

test('§7: a line from an open package to itself is not drawn, and warned of, and describe() leaves it out; on a closed one it is a loop', () => {
  const m = unlisted(); m.edges.push({ id: 'self', type: 'uml.Dependency', from: 'sales', to: 'sales' });
  assert.ok(!layout(m, 'packages').edges.some(e => e.id === 'self'));
  assert.deepEqual(validate(m).filter(p => p.rule === 'line-inside').map(p => [p.ids, p.message]), [[['self', 'sales'], 'line-inside: self, from "sales" to itself, a box, is not drawn in view "packages"']]);
  const d = describe(m, 'packages');
  assert.equal(d.split('\n')[0], 'Bookshop packages: a package diagram of 16 elements and 5 lines.');
  assert.ok(!/depends on sales\b/.test(d), d);
  m.views[0].nodeIds = ['sales', 'catalog'];
  assert.equal(layout(m, 'packages').edges.find(e => e.id === 'self').pts.length, 5, 'closed: a loop');
  assert.deepEqual(validate(m).filter(p => p.rule === 'line-inside'), []);
});

test('an ownership cycle is broken on the picture: an element on it has no owner, one under it is held by the first element of it it meets', () => {
  const m = { schemaVersion: 2, nodes: [N('a', 'Package', 'a', 'b'), N('b', 'Package', 'b', 'a'), N('x', 'Class', 'X', 'a'), N('y', 'Class', 'Y'), N('s', 'Package', 's', 's')],
    edges: [], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['a', 'b', 'x', 'y', 's'] }] };
  const pic = ownersOn(m, m.views[0]);
  assert.deepEqual(['a', 'b', 'x', 'y', 's'].map(pic.owner), [null, null, 'a', null, null]);
  assert.deepEqual(['a', 'x', 's'].map(pic.full), ['a', 'a::X', 's']);
  assert.deepEqual(check(m, 'v'), []);
  assert.deepEqual(describe(m, 'v').split('\n'), ['v: a package diagram of 5 elements and 0 lines.', 'Package a, holding 1 element.', 'Class X.', 'Package b (closed).', 'Class Y.', 'Package s (closed).']);
});

test('a closed package\'s tab moves off the line ends on its top, and a line ending under it ends on the tab\'s top', () => {
  const m = { schemaVersion: 2, nodes: ['alpha', 'beta', 'gamma', 'library', 'box'].map(id => N(id, 'Package', id)).concat(N('c', 'Class', 'C', 'box')),
    edges: ['alpha', 'beta', 'gamma', 'c'].map((f, i) => ({ id: 'e' + i, type: i < 3 ? 'uml.PackageImport' : 'uml.Dependency', from: f, to: 'library' })),
    views: [{ id: 'v', diagram: 'uml.package', direction: 'down', nodeIds: ['alpha', 'beta', 'gamma', 'library', 'box', 'c'] }] };
  const g = layout(m, 'v'), L = g.byId.library, tx = L.tabX ?? L.x, tw = Math.min(48, Math.round(L.w * .4));
  const ends = g.edges.map(e => e.pts[e.pts.length - 1]);
  assert.ok(ends.every(([x, y]) => (x >= tx && x <= tx + tw) ? y === L.y - 8 : y === L.y && (x <= tx - 6 || x >= tx + tw + 6)), JSON.stringify([tx, ends]));
  assert.ok(ends.some(([, y]) => y === L.y - 8), 'some line ends on the tab');
  assert.match(svgOf(g), new RegExp(`data-id="library"[^]*?<path d="M${tx} ${L.y}V${L.y - 8}H${tx + tw}V${L.y}"`));
  assert.deepEqual(check(m, 'v'), []);
  const once = JSON.stringify(g.edges.map(e => e.pts)), memo = {}, T2 = diagramOf({ diagram: 'uml.package' });
  const run = () => JSON.stringify(T2.layout({ model: m, view: m.views[0], pos: Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]])), memo }).edges.map(e => e.pts));
  assert.equal(run(), run(), 'a memo\'s geometry is moved once');
  assert.ok(once.length > 0);
});

test('a line\'s accessible name qualifies a member\'s owner as it is drawn', () => {
  const m = { schemaVersion: 2, nodes: [N('s', 'Package', 'sales'), N('w', 'Package', 'wholesale'), N('o1', 'Class', 'Order', 's', { members: [{ id: 't1', type: 'uml.Property', label: 'total' }] }),
    N('o2', 'Class', 'Order', 'w', { members: [{ id: 't2', type: 'uml.Property', label: 'total' }] }), N('r', 'Class', 'Report')],
    edges: [{ id: 'd1', type: 'uml.Dependency', from: 'r', to: 't1' }, { id: 'd2', type: 'uml.Dependency', from: 'r', to: 't2' }, { id: 'd3', type: 'uml.Dependency', from: 'r', to: 'o2' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['o1', 'o2', 'r'] }] };
  assert.deepEqual(layout(m, 'v').edges.map(e => e.aria), ['Dependency from Report to sales::Order.total', 'Dependency from Report to wholesale::Order.total', 'Dependency from Report to wholesale::Order']);
});

test('ownersOn groups a view by owner once: a view of 8,800 elements reads its boxes and order in linear time (timed)', () => {
  const big = P => { const nodes = []; for (let i = 0; i < P; i++) { nodes.push(N('p' + i, 'Package', 'p' + i)); for (let j = 0; j < 10; j++) nodes.push(N(`c${i}_${j}`, 'Class', 'C' + j, 'p' + i)); }
    return { schemaVersion: 2, nodes, edges: [], views: [{ id: 'v', diagram: 'uml.package', nodeIds: nodes.map(n => n.id) }] }; };
  const time = m => { const t = performance.now(); const pic = ownersOn(m, m.views[0]); assert.equal(readingOrder(pic).length, m.nodes.length); return performance.now() - t; };
  // the best of five runs of each, after a warm-up, so a busy CI runner's pause does not read as quadratic time
  const [small, large] = [big(200), big(800)], best = m => Math.min(...Array.from({ length: 5 }, () => time(m))); time(small); time(large);
  assert.ok(best(large) < 10 * Math.max(2, best(small)), 'about 4x the time for 4x the elements, not 16x or more');
});

// ---- validators: each with a passing and a failing case
const BREAKS = {
  'import-ends': m => { m.edges.push({ id: 'bad', type: 'uml.PackageImport', from: 'sales', to: 'book' }); return ['bad', 'sales', 'book']; },
  'package-names': m => { m.nodes.push(N('sales2', 'Package', 'sales')); return ['sales', 'sales2']; },
  'owner-kinds': m => { m.nodes.find(n => n.id === 'line').parent = 'order'; return ['line', 'order']; },
  'line-inside': m => { m.edges.push({ id: 'in', type: 'uml.Dependency', from: 'payments-package', to: 'card-payment' }); return ['in', 'payments-package', 'card-payment']; },
  'own-boxes': m => { m.views[0].containers = [{ id: 'k', label: 'K', nodeIds: ['money'] }]; return ['packages']; },
};
test('validators: 03-package.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(PKG, PKG.views[0]), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = unlisted(), ids = broke(m), got = T.validate(m, m.views[0]);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, ['import-ends', 'package-names'].includes(rule) ? 'error' : 'warning', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  // an import to itself (on a box, not drawn either); a merge from a class; a package and a class may share a name in one owner
  for (const [e, rules] of [[{ id: 'self', type: 'uml.PackageImport', from: 'sales', to: 'sales' }, ['import-ends', 'line-inside']], [{ id: 'cm', type: 'uml.PackageMerge', from: 'book', to: 'sales' }, ['import-ends']]]) {
    const m = unlisted(); m.edges.push(e); assert.deepEqual(T.validate(m, m.views[0]).map(p => p.rule), rules, e.id); }
  const m = structuredClone(PKG); m.nodes.push(N('c2', 'Class', 'sales')); assert.deepEqual(T.validate(m, m.views[0]), []);
  // the class type warns of owners and boxes too; the classifier rules run on a model with only a package view
  const c = structuredClone(PKG); BREAKS['owner-kinds'](c); BREAKS['own-boxes'](c); c.views[0].diagram = 'uml.class';
  assert.deepEqual(validate(c).filter(p => p.rule).map(p => p.rule).sort(), ['own-boxes', 'owner-kinds']);
  const d = structuredClone(PKG); d.nodes.push(N('o2', 'Class', 'Order', 'sales'));
  assert.deepEqual(validate(d).filter(p => p.rule).map(p => p.rule), ['classifier-names']);
});

// ---- the Owner field and the frame
test('the Owner field lists every package by its name from the top, for an element a package may own; a line or member has none', () => {
  assert.deepEqual(ownerChoices(PKG, PKG.nodes.find(n => n.id === 'book')).map(o => `${o.id}=${o.label}`), ['shared=shared', 'catalog=catalog', 'sales=sales', 'payments-package=payments', 'card=payments::card', 'wholesale=wholesale']);
  assert.equal(ownerChoices(PKG, PKG.edges[0]), null);
  assert.equal(ownerChoices(PKG, { id: 'm', type: 'uml.Property' }), null);
  assert.equal(T.owners, diagramOf({ diagram: 'uml.class' }).owners);
});

test('SHAPE.package: an open package\'s frame draws its border with class family-box and its title as family-title; a closed one is a folder, named', () => {
  const g = layout(PKG, 'packages'), s = svgOf(g);
  assert.match(s, /<g class="family" data-family="card" data-parent="payments-package" role="img" aria-label="Package card, holding 1 element"><rect class="family-box" [^>]*stroke="var\(--um-muted\)"\/><path [^>]*class="pk-tab"[^>]*\/><text class="family-title" [^>]*data-t="ft" data-o="card">card<\/text><\/g>/);
  assert.equal((s.match(/class="family-box"/g) || []).length, 6);
  const f = { id: 'p', x: 0, y: 0, w: 60, h: 80, title: '«subsystem» a very long name indeed' };
  assert.match(SHAPE.package.frame(f), /data-o="p">«subs…<\/text>$/, 'cut to the box');
  const closed = layout({ ...PKG, views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['sales', 'shared'] }] }, 'v'), sv = svgOf(closed);
  assert.deepEqual(closed.nodes.map(n => [n.id, n.shape, n.aria]), [['sales', 'package', 'Package sales (closed)'], ['shared', 'package', 'Package shared (closed)']]);
  assert.match(sv, /<g class="node package" data-id="sales" data-shape="package" tabindex="-1" role="img" aria-label="Package sales \(closed\)">/);
  const st = { schemaVersion: 2, nodes: [N('p', 'Package', 'p', null, { props: { stereotypes: ['subsystem'] } })], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['p'] }] };
  const n = layout(st, 'v').nodes[0]; assert.equal(n.aria, 'Package p (subsystem, closed)'); assert.ok(n.h > SHAPE.package.size({ label: 'p' }).h, 'a stereotype takes a row');
});

test('a pinned class in a box stays in it (a pin far outside its box is §4.3\'s known limit, which the check reports); renaming an open package lays the view out again, a closed one\'s rename is a node\'s', () => {
  const m = structuredClone(PKG); m.views[0].layout = { payment: [2, 4] }; // past CardPayment's box, in its own column
  const g = layout(m, 'packages'), F = Object.fromEntries(g.families.map(f => [f.id, f]));
  assert.ok(inside(g.byId.payment, F['payments-package']) && !inside(g.byId.payment, F.card)); assert.deepEqual(check(m, 'packages'), []);
  m.views[0].layout = { payment: [3, 3] }; // in shared's column: payments grows over it
  assert.deepEqual(check(m, 'packages').map(p => p.message), ['view packages: families "payments" and "shared" overlap']);
  const memos = {}, run = x => mapContext(x, { memos }).buildGeo('packages');
  run(PKG); run(apply(PKG, [{ op: 'set', id: 'catalog-imports-shared', path: 'props.visibility', value: 'public' }])); // a prop that draws nothing new
  assert.equal(memos.packages.runs, 1);
  const r = run(apply(PKG, [{ op: 'set', id: 'sales', path: 'label', value: 'sales and orders, the whole of them' }]));
  assert.equal(memos.packages.runs, 2, 'the box\'s title is its geometry');
  assert.deepEqual(['title', 'label'].map(k => r.families.find(f => f.id === 'sales')[k]), ['sales and orders, the whole of them', 'sales and orders, the whole of them']);
  const cl = { ...PKG, views: [{ id: 'packages', diagram: 'uml.package', nodeIds: ['sales', 'shared'] }] }, ms = {};
  mapContext(cl, { memos: ms }).buildGeo('packages'); mapContext(apply(cl, [{ op: 'set', id: 'sales', path: 'label', value: 'sales, every order and its lines' }]), { memos: ms }).buildGeo('packages');
  assert.equal(ms.packages.runs, 2, 'a closed package\'s name sizes it, as a class\'s does');
});

// ---- DoD 6: save and reopen
test('save and reopen (DoD 6): a 30-step session on 03-package.json undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: N(`p${i}`, 'Package', `pack${i}`, i % 2 ? 'payments-package' : null), view: 'packages' }],
    [{ op: 'add', element: N(`c${i}`, 'Class', `Thing${i}`, `p${i}`), view: 'packages' }],
    [{ op: 'add', element: { id: `i${i}`, type: 'uml.PackageImport', from: `p${i}`, to: 'shared' }, view: 'packages' }],
    [{ op: 'set', id: `i${i}`, path: ['props', 'visibility'], value: i % 2 ? 'private' : 'public' }],
    [[{ op: 'reparent', id: `c${i}`, parent: 'sales' }], [{ op: 'set', id: `p${i}`, path: 'props.stereotypes', value: ['layer'] }], [{ op: 'add', element: { id: `m${i}`, type: 'uml.PackageMerge', from: `p${i}`, to: 'catalog' }, view: 'packages' }]][i % 3],
    [[{ op: 'hide', id: `c${i}`, view: 'packages' }], [{ op: 'delete', id: `i${i}` }], [{ op: 'reparent', id: 'book', parent: i % 2 ? `p${i}` : 'catalog' }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(PKG), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const flat = g => JSON.stringify(g, (k, v) => (k === 'ms' ? undefined : v));
  assert.equal(flat(layout(reopened, 'packages')), flat(layout(JSON.parse(seen[30]), 'packages')));
  assert.equal(describe(reopened, 'packages'), describe(JSON.parse(seen[30]), 'packages'));
  assert.deepEqual(check(reopened, 'packages'), []);
});

test('the example as 6.7 made it (the Bookshop atlas, decision 18): sales applies the profile BookshopConventions, a closed «profile» folder, by an «apply» line; clean right and down, every keyword drawn', () => {
  assert.deepEqual(validate(EX), []);
  for (const direction of ['down', 'right']) {
    const m = structuredClone(EX); if (direction === 'right') delete m.views[0].direction;
    const g = layout(m, 'packages'), p = g.nodes.find(n => n.id === 'conventions'), e = g.edges.find(x => x.id === 'sales-applies-conventions');
    assert.deepEqual(check(m, 'packages'), [], direction);
    // the view lists the «apply» line third: listed last, catalog's «import» went undrawn (down), and check() said nothing
    assert.ok(g.edges.filter(x => x.label).every(x => x.lbl), `${direction}: every keyword is drawn`);
    assert.deepEqual([p.shape, p.stereotypes, p.aria], ['package', ['profile'], 'Profile BookshopConventions (closed)']);
    assert.deepEqual([e.label, e.end, e.aria, !!e.lbl], ['«apply»', { from: 'none', to: 'open', dashed: true }, 'Profile application from sales to BookshopConventions: «apply»', true]);
    assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Dependency', 'Package import', 'Package merge', 'Profile application']);
  }
  const d = describe(EX, 'packages').split('\n');
  assert.deepEqual([d[0], d[5], d.at(-1)], ['Bookshop packages: a package diagram of 17 elements and 6 lines.',
    'Package sales, holding 4 elements; imports catalog; applies BookshopConventions; depends on payments.', 'Profile BookshopConventions (closed).']);
});

test('import-ends: a package may import or merge a profile, a profile being a package (audit 4)', () => {
  const m = { schemaVersion: 2, nodes: [N('sales', 'Package', 'sales'), N('conv', 'Profile', 'Conventions'), N('c', 'Class', 'C')],
    edges: [{ id: 'imp', type: 'uml.PackageImport', from: 'sales', to: 'conv' }, { id: 'bad', type: 'uml.PackageImport', from: 'sales', to: 'c' }], views: [] };
  assert.deepEqual(T.validate(m, { id: 'v', nodeIds: [] }).filter(p => p.rule === 'import-ends').map(p => p.ids[0]), ['bad']);
});

test("the PDF's Elements table lists no members for a classifier drawn by its name (audit 4)", () => {
  const m = { schemaVersion: 2, nodes: [N('o', 'Class', 'Order', null, { members: [{ id: 'o.id', type: 'uml.Property', label: 'id' }] })], edges: [], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['o'] }] };
  const c = mapContext(m), [els] = tablesOf(c, c.V.v, c.buildGeo('v'));
  assert.ok(!els.rows[0].includes('<p>'), els.rows[0]);
});
