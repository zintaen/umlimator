// The class diagram, uml.class (work package 1.9): its definition, the member micro-syntax, its validators, describe(),
// and its views laid out. Imports src/ to reach the type's internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate, rules } from '../src/map/validate.js';
import { lensOf } from '../src/map/lens.js';
import '../src/uml/package.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { multBounds, parseMember, printMember, memberEdit, classProblems } from '../src/uml/class.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const CLASS = read('../examples/sales-classes.json');

test('the definition: uml.class is registered with its palette, its lines, a properties form per type and its hooks', () => {
  const T = diagramOf({ diagram: 'uml.class' });
  assert.equal(T.name, 'uml.class');
  assert.deepEqual(T.elements.map(e => e.type), ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType', 'uml.Package', 'uml.Comment']);
  assert.deepEqual(T.lines.map(e => e.type), ['uml.Association', 'uml.Generalization', 'uml.InterfaceRealization', 'uml.Dependency', 'uml.CommentLink']);
  for (const t of [...T.elements, ...T.lines]) assert.ok(Array.isArray(T.props[t.type]) || t.type === 'uml.Comment', t.type);
  assert.deepEqual(T.props['uml.Association'].filter(f => f.path).map(f => f.path.join('.')), ['ends.from.role', 'ends.from.multiplicity', 'ends.from.aggregation', 'ends.from.navigable',
    'ends.to.role', 'ends.to.multiplicity', 'ends.to.aggregation', 'ends.to.navigable']);
  for (const k of ['layout', 'validate', 'describe', 'rankFlip', 'boxes', 'owners']) assert.equal(typeof T[k], 'function', k);
  assert.equal(Object.keys(T.rules).length, 13, 'its ten, and owner-kinds, line-inside and own-boxes, since a class view draws packages as boxes (2.2)');
});

// ---- the member micro-syntax (risks.md E3, E4)
const CANON = [ // print(parse(x)) === x
  ['+ total: Money [1] = 0', 'uml.Property', { visibility: 'public', valueType: 'Money', multiplicity: '1', default: '0' }],
  ['- id: UUID', 'uml.Property', { visibility: 'private', valueType: 'UUID' }],
  ['# {static} count: Integer [0..1]', 'uml.Property', { visibility: 'protected', isStatic: true, valueType: 'Integer', multiplicity: '0..1' }],
  ['~ /size: Integer', 'uml.Property', { visibility: 'package', isDerived: true, valueType: 'Integer' }],
  ['tags: Map<String, List<Tag>> [*]', 'uml.Property', { valueType: 'Map<String, List<Tag>>', multiplicity: '*' }],
  ['name', 'uml.Property', {}],
  ['+ place(at: Date, in qty: Int): Order', 'uml.Operation', { visibility: 'public', parameters: [{ name: 'at', valueType: 'Date' }, { name: 'qty', valueType: 'Int', direction: 'in' }], returnType: 'Order' }],
  ['+ {abstract} settle()', 'uml.Operation', { visibility: 'public', isAbstract: true }],
  ['+ {static} {abstract} make(out log, inout n: Int)', 'uml.Operation', { visibility: 'public', isStatic: true, isAbstract: true, parameters: [{ name: 'log', direction: 'out' }, { name: 'n', valueType: 'Int', direction: 'inout' }] }],
  ['- index(m: Map<K, V>): List<K>', 'uml.Operation', { visibility: 'private', parameters: [{ name: 'm', valueType: 'Map<K, V>' }], returnType: 'List<K>' }],
  ['+ größe: Int', 'uml.Property', { visibility: 'public', valueType: 'Int' }], // names in any script (review of 1.9)
  ['名前: String', 'uml.Property', { valueType: 'String' }],
  ['café()', 'uml.Operation', {}],
  ['tags: String[] [0..1]', 'uml.Property', { valueType: 'String[]', multiplicity: '0..1' }], // an array type: [] is not a multiplicity
  ['+ tags: list[str] [0..1]', 'uml.Property', { visibility: 'public', valueType: 'list[str]', multiplicity: '0..1' }], // a bracket that is no multiplicity is the type's (audit 5)
  ['counts: Dict[str, int]', 'uml.Property', { valueType: 'Dict[str, int]' }],
  ['+ f(xs: Int[]): Int[]', 'uml.Operation', { visibility: 'public', parameters: [{ name: 'xs', valueType: 'Int[]' }], returnType: 'Int[]' }],
];
test('the micro-syntax: each fixture line parses to its props and prints back as written', () => {
  for (const [text, type, props] of CANON) {
    const r = parseMember(text);
    assert.deepEqual(r, { type, label: r.label, props }, text);
    assert.equal(printMember({ type: r.type, label: r.label, props: r.props }), text);
  }
  assert.deepEqual(parseMember('PAID', 'uml.EnumerationLiteral'), { type: 'uml.EnumerationLiteral', label: 'PAID', props: {} });
  assert.equal(printMember({ type: 'uml.EnumerationLiteral', label: 'PAID' }), 'PAID');
});

test('the micro-syntax: print(parse(x)) is stable, spacing written loosely or tightly', () => {
  for (const x of ['+total:Money[1]=0', '  -   id :  UUID ', '+place( at:Date ,in qty : Int ) : Order', '#{ static }/n:Int[ 1 .. * ]', '+ go()', 'x = a b']) {
    const once = printMember(parseMember(x)), twice = printMember(parseMember(once));
    assert.equal(twice, once, x);
  }
  assert.equal(printMember(parseMember('+total:Money[1]=0')), '+ total: Money [1] = 0');
});

test('the micro-syntax: an unparsable line is an error that says why, never a half-read member (E3)', () => {
  for (const x of ['+ total Money', '', '+ : Money', 'total: ', 'n [1..', 'n [3-4]', 'n [*..2]', '+ go(', '+ go(: Int)', '+ go() Order', '{final} n', '+ {abstract} n: Int', '/go()', 'a b', 'n = ']) {
    const r = parseMember(x);
    assert.ok(r.error && !r.label && !r.props, x);
    assert.match(r.error, /is not a member: /, x);
  }
  assert.ok(parseMember('pay()', 'uml.EnumerationLiteral').error);
  assert.ok(parseMember('total', 'uml.Operation').error);
});

test('multiplicities: n, *, n..m, n..*, read into bounds, the text kept as written (E4)', () => {
  assert.deepEqual(multBounds('1'), { lower: 1, upper: 1 });
  assert.deepEqual(multBounds('*'), { lower: 0, upper: Infinity });
  assert.deepEqual(multBounds('0..1'), { lower: 0, upper: 1 });
  assert.deepEqual(multBounds('1..*'), { lower: 1, upper: Infinity });
  assert.deepEqual(multBounds(' 2 .. 5 '), { lower: 2, upper: 5 });
  assert.deepEqual(multBounds('5..2'), { lower: 5, upper: 2 }); // read; the validator says it is wrong
  for (const x of ['', 'many', '1..', '*..1', '-1', '1,2', null]) assert.equal(multBounds(x), null, String(x));
  assert.equal(parseMember('n [ 1..* ]').props.multiplicity, '1..*');
});

test('a member edited as text: one transaction that sets its label and its props, keeping the props the syntax does not write', () => {
  const m = { id: 'o.t', type: 'uml.Property', label: 'total', props: { visibility: 'public', valueType: 'Money', stereotypes: ['id'], isDerived: true } };
  const r = memberEdit(m, '«id» - total: Decimal [0..1]'); // its stereotypes are its text's too (audit 16)
  assert.deepEqual(r.commands, [{ op: 'set', id: 'o.t', path: 'label', value: 'total' },
    { op: 'set', id: 'o.t', path: 'props', value: { stereotypes: ['id'], visibility: 'private', valueType: 'Decimal', multiplicity: '0..1' } }]);
  const model = { schemaVersion: 2, nodes: [{ id: 'o', type: 'uml.Class', label: 'O', members: [m] }], views: [] };
  assert.equal(printMember(apply(model, r.commands).nodes[0].members[0]), '«id» - total: Decimal [0..1]');
  assert.ok(memberEdit(m, '+ total Money').error, 'nothing to apply');
  assert.ok(memberEdit(m, 'go()').error, 'a property stays a property');
});

// ---- validators: each rule passes on the base model and fails on a model that breaks it, naming the rule and the elements
const C = (id, label, type = 'uml.Class', more = {}) => ({ id, type, label, ...more }), P = (id, label, props = {}) => ({ id, type: 'uml.Property', label, props });
const BASE = { schemaVersion: 2,
  nodes: [C('pkg', 'shop', 'uml.Package'), C('a', 'A', 'uml.Class', { parent: 'pkg', members: [P('a.x', 'x', { multiplicity: '0..1' }), { id: 'a.go', type: 'uml.Operation', label: 'go' }, { id: 'a.go2', type: 'uml.Operation', label: 'go', props: { parameters: [{ name: 'n', valueType: 'Int' }] } }] }),
    C('b', 'B', 'uml.Class', { parent: 'pkg' }), C('i', 'I', 'uml.Interface'), C('e', 'E', 'uml.Enumeration', { members: [{ id: 'e.1', type: 'uml.EnumerationLiteral', label: 'ONE' }] }),
    C('d', 'D', 'uml.DataType'), C('n', 'a note', 'uml.Comment'), C('a2', 'A', 'uml.Class')],
  edges: [{ id: 'ab', type: 'uml.Association', from: 'a', to: 'b', props: { ends: { from: { aggregation: 'composite', multiplicity: '1' }, to: { multiplicity: '1..*', role: 'bs' } } } },
    { id: 'ba', type: 'uml.Generalization', from: 'b', to: 'a' }, { id: 'ai', type: 'uml.InterfaceRealization', from: 'a', to: 'i' },
    { id: 'ad', type: 'uml.Dependency', from: 'a', to: 'd' }, { id: 'na', type: 'uml.CommentLink', from: 'n', to: 'a.x' }],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['pkg', 'a', 'b', 'i', 'e', 'd', 'n', 'a2'] }] };
const breaks = {
  'member-names': m => { m.nodes[1].members.push(P('a.x2', 'x')); return ['a', 'a.x', 'a.x2']; },
  'classifier-names': m => { m.nodes[2].label = 'A'; return ['a', 'b']; },
  multiplicity: m => { m.nodes[1].members[0].props.multiplicity = '3..1'; return ['a.x']; },
  'generalization-cycle': m => { m.edges.push({ id: 'ab2', type: 'uml.Generalization', from: 'a', to: 'b' }); return ['a', 'b', 'ab2']; },
  'generalization-kinds': m => { m.edges.push({ id: 'id', type: 'uml.Generalization', from: 'i', to: 'd' }); return ['id', 'i', 'd']; },
  'realization-target': m => { m.edges[2].to = 'b'; return ['ai', 'a', 'b']; },
  'interface-composite': m => { m.edges.push({ id: 'ib', type: 'uml.Association', from: 'i', to: 'b', props: { ends: { from: { aggregation: 'composite' } } } }); return ['ib', 'i']; },
  'composite-multiplicity': m => { m.edges[0].props.ends.from.multiplicity = '0..*'; return ['ab', 'a']; },
  'member-kinds': m => { m.nodes[1].members.push({ id: 'a.lit', type: 'uml.EnumerationLiteral', label: 'TWO' }); return ['a', 'a.lit']; },
  'comment-link': m => { m.edges[4].from = 'd'; return ['na', 'd']; },
  'owner-kinds': m => { m.nodes[3].parent = 'a'; return ['i', 'a']; },
  'line-inside': m => { m.edges.push({ id: 'pa', type: 'uml.Dependency', from: 'pkg', to: 'a' }); return ['pa', 'pkg', 'a']; },
  'own-boxes': m => { m.views[0].containers = [{ id: 'k', label: 'K', nodeIds: ['i'] }]; return ['v']; },
};
const WARNS = ['owner-kinds', 'line-inside', 'own-boxes']; // a class view's rules about owners and boxes (2.2) are warnings
test('validators: the base model breaks no rule, and validate() reports no error in it', () => {
  assert.deepEqual(classProblems(BASE), []);
  assert.deepEqual(diagramOf({ diagram: 'uml.class' }).validate(BASE, BASE.views[0]), []);
  assert.deepEqual(validate(BASE).filter(p => p.level === 'error'), []);
  assert.deepEqual(classProblems(CLASS), [], 'the target example');
});
test('validators: each rule fails on a model that breaks it; the problem names its rule and its elements, and validate() reports it', () => {
  const T = diagramOf({ diagram: 'uml.class' });
  assert.deepEqual(Object.keys(breaks).sort(), Object.keys(T.rules).sort(), 'a failing fixture for every rule');
  for (const [rule, broke] of Object.entries(breaks)) {
    const m = structuredClone(BASE), ids = broke(m), got = T.validate(m, m.views[0]);
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.equal(p.rule, rule); assert.equal(p.level, WARNS.includes(rule) ? 'warning' : 'error'); assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.deepEqual([...new Set(p.ids)].sort(), [...new Set(ids)].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
});
test('validators: a model with no class view is not checked by the class type', () => {
  const m = structuredClone(BASE); breaks['member-names'](m); m.views[0].diagram = 'uml.object';
  assert.ok(!validate(m).some(p => p.rule));
});

// ---- describe() and the layout
test('describe(): the class view in words, each element with its members counted and its lines', () => {
  const d = describe(CLASS, 'domain').split('\n');
  assert.equal(d[0], 'Sales domain: a class diagram of 11 elements and 8 lines.');
  assert.equal(d[1], 'Package sales, holding 4 elements.', 'a box, then what it holds (2.2)');
  assert.ok(d.includes('Class Order (entity), 5 attributes, 3 operations; associated with Customer (1) ("places"); composed of OrderLine (lines, 1..*); aggregates payments::Payment (payments, 0..*); realizes payments::Payable; depends on shared::Money «use».'), d.join('\n'));
  assert.ok(d.includes('Class OrderLine, 2 attributes, 0 operations; part of Order (1); associated with catalog::Book (book, 1).'), d.join('\n'));
  assert.ok(d.includes('Class payments::card::CardPayment, 1 attribute, 1 operation; a kind of payments::Payment.'));
  assert.ok(d.includes('Enumeration OrderStatus, 4 literals.'));
  const p = describe(CLASS, 'payments-only').split('\n');
  assert.equal(p.length, 5);
  assert.equal(p[1], 'Class Order (entity), 5 attributes, 3 operations; aggregates payments::Payment (payments, 0..*); realizes payments::Payable.', 'the view\'s subject, sales, keeps its own names plain');
  // audit 5: every line's label and stereotypes, as drawn
  const m = { schemaVersion: 2, nodes: [{ id: 'o', type: 'uml.Class', label: 'Order' }, { id: 'p', type: 'uml.Class', label: 'Pricing' }, { id: 'i', type: 'uml.Interface', label: 'Payable' }],
    edges: [{ id: 'd', type: 'uml.Dependency', from: 'o', to: 'p', label: 'computes totals with' }, { id: 'r', type: 'uml.InterfaceRealization', from: 'o', to: 'i', label: 'since v2', props: { stereotypes: ['v2'] } }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['o', 'p', 'i'] }] };
  assert.equal(describe(m, 'v').split('\n')[1], 'Class Order, 0 attributes, 0 operations; depends on Pricing ("computes totals with"); realizes Payable «v2» ("since v2").');
});

const noOverlap = g => { for (const a of g.nodes) for (const b of g.nodes) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} and ${b.id} overlap`); };
test('the target example lays out clean: classifiers at their size, notes, the line-end table, the general class above, the check clean', () => {
  for (const v of CLASS.views) {
    const g = layout(CLASS, v.id), at = Object.fromEntries(g.nodes.map(n => [n.id, n]));
    noOverlap(g);
    assert.deepEqual(check(CLASS, v.id), [], v.id);
    assert.ok(g.nodes.every(n => n.shape === (n.type === 'uml.Comment' ? 'note' : 'classifier')), v.id);
    assert.deepEqual(g.families.map(f => [f.id, f.nodeIds.length]), v.id === 'domain' ? [['sales', 4]] : [], `${v.id}: sales, shown, is a box holding its classes (2.2)`);
    assert.ok(at.payment.y + at.payment.h < at['card-payment'].y, 'a generalization points up in a view laid out down');
    assert.ok(Array.isArray(g.legend) && g.legend.length, 'a legend of the line ends');
  }
  const g = layout(CLASS, 'domain'), e = Object.fromEntries(g.edges.map(x => [x.id, x]));
  assert.deepEqual(e['order-lines'].end, { from: 'filled-diamond', to: 'open', labels: { from: { role: undefined, mult: '1' }, to: { role: 'lines', mult: '1..*' } } });
  assert.deepEqual([e['order-payment'].end.from, e['card-is-payment'].end.to, e['order-payable'].end, e['order-uses-money'].end],
    ['diamond', 'triangle', { from: 'none', to: 'triangle', dashed: true }, { from: 'none', to: 'open', dashed: true }]);
  assert.equal(e['order-uses-money'].label, '«use»');
  assert.equal(e['customer-orders'].aria, 'Association from Customer (1) to Order (orders, 0..*): places');
  assert.equal(g.nodes.find(n => n.id === 'order').aria, 'Class Order (entity), 5 attributes, 3 operations');
  assert.deepEqual(g.nodes.find(n => n.id === 'book').collapsed, ['operations']); // present
});

test('an edit that moves nothing lays nothing out again; one that grows a class does (the memo, risks.md F7)', () => {
  const memos = {}, run = m => { const ctx = mapContext(m, { memos }); return ctx.buildGeo('domain'); };
  run(CLASS); assert.equal(memos.domain.runs, 1);
  run(apply(CLASS, [{ op: 'set', id: 'order', path: 'props.stereotypes', value: ['root'] }])); // same width: «root» is narrower than Order's rows
  run(apply(CLASS, [{ op: 'set', id: 'customer-orders', path: 'props.ends.to.role', value: 'buys' }])); // an end label is paint
  assert.equal(memos.domain.runs, 1);
  run(apply(CLASS, [{ op: 'add', owner: 'order', element: { id: 'order.more', type: 'uml.Property', label: 'more' } }]));
  assert.equal(memos.domain.runs, 2);
});

test('performance (risks.md P1): a 40-element class view lays out once in well under a second, and an edit that moves nothing in a few ms (timed)', () => {
  const nodes = [], edges = [];
  for (let i = 0; i < 40; i++) nodes.push({ id: 'c' + i, type: 'uml.Class', label: 'Class' + i, members: [P(`c${i}.a`, 'a', { valueType: 'Int' }), P(`c${i}.b`, 'b', { valueType: 'String' })] });
  for (let i = 1; i < 40; i++) edges.push(i % 3 ? { id: 'e' + i, type: 'uml.Association', from: 'c' + Math.floor((i - 1) / 2), to: 'c' + i, props: { ends: { to: { multiplicity: '*' } } } } : { id: 'e' + i, type: 'uml.Generalization', from: 'c' + i, to: 'c' + Math.floor((i - 1) / 2) });
  const m = { schemaVersion: 2, nodes, edges, views: [{ id: 'big', diagram: 'uml.class', nodeIds: nodes.map(n => n.id) }] };
  const memos = {}, t0 = performance.now(), g = mapContext(m, { memos }).buildGeo('big'), full = performance.now() - t0;
  noOverlap(g);
  const m2 = apply(m, [{ op: 'set', id: 'e1', path: 'props.ends.to.role', value: 'kids' }]), t1 = performance.now();
  mapContext(m2, { memos }).buildGeo('big'); const again = performance.now() - t1;
  console.log(`# 40 classes, 39 lines: full layout ${Math.round(full)} ms, an edit that moves nothing ${again.toFixed(1)} ms`);
  assert.ok(full < 1000, `full layout ${full} ms`); assert.ok(again < 100, `edit ${again} ms`); assert.equal(memos.big.runs, 1);
});

test('the classifier graphs\' edge cases (risks.md G1) lay out clean: 60 members, a reflexive association, four lines between two classes, an empty enumeration, nested packages', () => {
  const A = (id, f, t, ends) => ({ id, type: 'uml.Association', from: f, to: t, props: { ends } });
  const m = { schemaVersion: 2,
    nodes: [C('a', 'Person', 'uml.Class', { members: Array.from({ length: 60 }, (_, i) => P('a' + i, 'f' + i, { valueType: 'Int' })) }), C('b', 'Company'), C('e', 'Empty', 'uml.Enumeration'),
      C('abs', 'Base', 'uml.Class', { props: { isAbstract: true } }), C('p', 'outer', 'uml.Package'), C('q', 'inner', 'uml.Package', { parent: 'p' })],
    edges: [A('self', 'a', 'a', { from: { role: 'manager', multiplicity: '0..1' }, to: { role: 'reports', multiplicity: '*' } }), A('w1', 'a', 'b', { to: { role: 'employer' } }),
      A('w2', 'a', 'b', { to: { role: 'owner' } }), A('w3', 'b', 'a', { to: { role: 'staff', multiplicity: '*' } }), A('w4', 'a', 'b', { from: { aggregation: 'shared' } }), { id: 'g', type: 'uml.Generalization', from: 'b', to: 'abs' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'e', 'abs', 'p', 'q'] }, { id: 'd', diagram: 'uml.class', direction: 'down', nodeIds: ['a', 'b', 'e', 'abs', 'p', 'q'], present: { a: { rows: 8 } } }] };
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  for (const v of ['v', 'd']) {
    const g = layout(m, v); noOverlap(g);
    assert.deepEqual(check(m, v), [], v);
    assert.deepEqual(g.edges.map(e => e.id).sort(), ['g', 'self', 'w1', 'w2', 'w3', 'w4'], 'every line drawn, each on its own');
    assert.deepEqual([g.families.map(f => [f.id, f.nodeIds]), g.nodes.find(n => n.id === 'q').shape], [[['p', ['q']]], 'package'], 'outer is a box holding inner, a closed folder (2.2)');
  }
  assert.ok(layout(m, 'd').nodes.find(n => n.id === 'a').h < layout(m, 'v').nodes.find(n => n.id === 'a').h, 'rows: 8 caps the long class');
});

// ---- review of 1.9: fixes, each with its regression
test('a version-1 model is a map: a view that says diagram "uml.class" lays out and describes as it does without it (model.md rule 1)', () => {
  const m = read('./fixtures/integration-c4.json'), d = structuredClone(m), vid = m.views[0].id;
  assert.equal(m.schemaVersion, undefined);
  d.views[0].diagram = 'uml.class';
  const flat = g => JSON.stringify(g, (k, v) => (k === 'all' || k === 'ms' ? undefined : v)); // not `all` (a merged line lists itself) or `ms` (timings)
  assert.equal(flat(layout(d, vid)), flat(layout(m, vid)));
  assert.equal(layout(d, vid).map, true);
  assert.equal(describe(d, vid), describe(m, vid));
  assert.deepEqual(check(d, vid), check(m, vid));
});

test('ids, types and view ids named like Object\'s members (risks.md M3): a class view lays out, describes and validates, and Object.prototype is untouched', () => {
  for (const w of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const models = [
      { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: w, label: 'B' }], edges: [{ id: 'e', type: w, from: 'a', to: 'b' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] },
      { schemaVersion: 2, nodes: [{ id: w, type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }, { id: 'c', type: 'uml.Class', label: 'C' }],
        edges: [{ id: w + 'e', type: 'uml.Association', from: w, to: 'b' }, { id: 'g', type: 'uml.Generalization', from: 'c', to: w }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: [w, 'b', 'c'] }] },
      { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }], edges: [], views: [{ id: w, diagram: 'uml.class', nodeIds: ['a'] }] },
    ];
    for (const m of models) {
      const vid = m.views[0].id, g = layout(m, vid), at = new Set(g.nodes.map(n => n.x + ',' + n.y));
      assert.equal(g.nodes.length, m.nodes.length, `${w}: every node drawn`);
      assert.ok(g.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)) && at.size === g.nodes.length, `${w}: placed, apart`);
      assert.ok(g.nodes.every(n => (n.stereotypes || []).every(t => typeof t === 'string')), `${w}: no stereotype from Object`);
      describe(m, vid); validate(m);
      assert.deepEqual(Object.keys(Object.prototype), [], `${w}: Object.prototype untouched`);
    }
  }
});

test('the micro-syntax on a non-ASCII name: a member edited as text', () => {
  const r = memberEdit({ id: 'a.u', type: 'uml.Property', label: 'Größe' }, 'Größe: Integer');
  assert.deepEqual(r.commands, [{ op: 'set', id: 'a.u', path: 'label', value: 'Größe' }, { op: 'set', id: 'a.u', path: 'props', value: { valueType: 'Integer' } }]);
});

test('the member hooks: an enumeration takes a literal, or a property or an operation; a comment and a package hold no members', () => {
  const M = diagramOf({ diagram: 'uml.class' }).member, en = { type: 'uml.Enumeration' };
  assert.deepEqual(M.add('PAID', en), { type: 'uml.EnumerationLiteral', label: 'PAID', props: {} });
  assert.equal(M.add('code: Int', en).type, 'uml.Property');
  assert.equal(M.add('+ next(): Status', en).type, 'uml.Operation');
  assert.equal(M.add('PAID', { type: 'uml.Class' }).type, 'uml.Property');
  assert.deepEqual(['uml.Class', 'uml.Enumeration', 'uml.Interface', 'uml.Comment', 'uml.Package'].map(t => M.holds({ type: t })), [true, true, true, false, false]);
});

test('validators: a generalization joins classifiers only; a composite end with no element names none', () => {
  for (const [a, b] of [['uml.Comment', 'uml.Class'], ['uml.Class', 'uml.Package'], ['uml.Package', 'uml.Package']]) {
    const got = classProblems({ nodes: [{ id: 'x', type: a }, { id: 'y', type: b }], edges: [{ id: 'g', type: 'uml.Generalization', from: 'x', to: 'y' }] });
    assert.deepEqual(got.map(p => [p.rule, p.ids]), [['generalization-kinds', ['g', 'x', 'y']]], a + ' → ' + b);
  }
  const got = classProblems({ nodes: [{ id: 'a', type: 'uml.Class' }], edges: [{ id: 'x', type: 'uml.Association', from: 'a', props: { ends: { to: { aggregation: 'composite', multiplicity: '*' } } } }] });
  assert.deepEqual(got.map(p => [p.rule, p.ids]), [['composite-multiplicity', ['x']]]);
  assert.doesNotMatch(got[0].message, /undefined/);
});

test('save and reopen (DoD 6): a 30-step class session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const T = diagramOf({ diagram: 'uml.class' }), steps = [];
  const memberOf = id => CLASS.nodes.flatMap(n => n.members || []).find(m => m.id === id);
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: { id: `k${i}`, type: 'uml.Class', label: `Kind${i}` }, view: 'domain' }],
    [{ op: 'add', element: { id: `k${i}.v`, ...T.member.add(`- {static} väärtus${i}: Money [0..1] = 0`, { type: 'uml.Class' }) }, owner: `k${i}` }],
    [{ op: 'add', element: { id: `a${i}`, type: 'uml.Association', from: 'order', to: `k${i}` }, view: 'domain' }],
    [{ op: 'set', id: `a${i}`, path: ['props', 'ends', 'from', 'aggregation'], value: 'composite' }, { op: 'set', id: `a${i}`, path: ['props', 'ends', 'to', 'navigable'], value: true }],
    i % 2 ? [{ op: 'add', element: { id: `g${i}`, type: 'uml.Generalization', from: `k${i}`, to: `k${i - 1}` }, view: 'domain' }] : T.member.edit(memberOf('order.total'), `+ /total: Money [${i % 3 ? 1 : '0..1'}]`).commands,
    [[{ op: 'set', id: `k${i}`, path: 'props.stereotypes', value: ['entity'] }], [{ op: 'move', id: 'order.cancel', index: 0 }], [{ op: 'delete', id: `a${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(CLASS), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15])); // saved as JSON at step 15, read back, continued
  assert.equal(JSON.stringify(reopened), seen[30]);
  assert.equal(JSON.stringify(layout(reopened, 'domain'), (k, v) => (k === 'ms' ? undefined : v)), JSON.stringify(layout(JSON.parse(seen[30]), 'domain'), (k, v) => (k === 'ms' ? undefined : v)));
});

// ---- 2.2: a class view draws packages as nesting and qualifies names (notes/stage-2.md §10.1, approved: plan.md §1)
test('a class view draws a shown package owning something shown as a box, and names an element by the owners it does not show', () => {
  const g = layout(CLASS, 'domain'), F = g.families[0];
  assert.deepEqual([F.id, F.title, F.shape, F.aria], ['sales', 'sales', 'package', 'Package sales, holding 4 elements']);
  g.nodes.forEach(n => assert.equal(n.x > F.x && n.y > F.y && n.x + n.w < F.x + F.w && n.y + n.h < F.y + F.h, ['customer', 'order', 'line', 'status'].includes(n.id), n.id));
  assert.ok(!g.nodes.some(n => n.id === 'sales'), 'a box takes no slot');
  const bare = structuredClone(CLASS); delete bare.views[1].subject;
  assert.deepEqual(layout(bare, 'payments-only').nodes.map(n => n.label), ['sales::Order', 'payments::Payable', 'payments::Payment', 'payments::card::CardPayment'], 'with no subject, from the top');
  assert.deepEqual(layout(CLASS, 'payments-only').nodes.map(n => n.label), ['Order', 'payments::Payable', 'payments::Payment', 'payments::card::CardPayment'], 'from the subject');
  assert.equal(layout(bare, 'payments-only').nodes[0].aria, 'Class sales::Order (entity), 5 attributes, 3 operations');
});

test('a typed view\'s key changes with an element it draws but does not list: update() redraws a renamed package that qualifies a name (audit 1)', () => {
  const after = structuredClone(CLASS); after.nodes.find(n => n.id === 'shared').label = 'Renamed';
  assert.ok(!CLASS.views.find(v => v.id === 'domain').nodeIds.includes('shared'));
  assert.notEqual(mapContext(CLASS).viewKey('domain'), mapContext(after).viewKey('domain'));
  assert.match(mapContext(after).buildView('domain').markup, /Renamed::Money/);
});

test('a typed view\'s key changes with the model\'s schemaVersion: update() redraws the class diagram a version-1 model drew as a map (audit 38)', () => {
  // two classes and no package: nothing else in the key told the two versions apart
  const bare = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }],
    edges: [{ id: 'e', type: 'uml.Association', from: 'a', to: 'b' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] };
  for (const [m, id] of [[bare, 'v'], [CLASS, 'domain']]) {
    const v1 = structuredClone(m); delete v1.schemaVersion;
    const one = mapContext(v1), two = mapContext(m);
    assert.notEqual(one.viewKey(id), two.viewKey(id), id);
    assert.notEqual(one.buildView(id).markup, two.buildView(id).markup, 'version 1 draws the view as a map');
  }
});

test('a class view with a box lays out a line to a listed id that is no element: the line is left out, as without the box (backlog M3.3)', () => {
  const C = id => ({ id, type: 'uml.Class', label: id.toUpperCase() });
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package', label: 'p' }, { ...C('a'), parent: 'p' }, C('b')], edges: [{ id: 'e', type: 'uml.Dependency', from: 'a', to: 'ghost' }, { id: 'f', type: 'uml.Dependency', from: 'a', to: 'b' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['p', 'a', 'b', 'ghost'] }] };
  assert.ok(validate(m).some(p => p.level === 'error' && /ghost/.test(p.message)));
  const g = layout(m, 'v');
  assert.deepEqual(g.edges.map(e => e.id), ['f']);
});

test('audit 16: rules() and lenses judge no hand-written box of a class view, which draws its packages as boxes and ignores them (own-boxes)', () => {
  const C = id => ({ id, type: 'uml.Class', label: id.toUpperCase() });
  const m = { schemaVersion: 2, nodes: [C('a'), C('b')], edges: [{ id: 'ab', type: 'uml.Association', from: 'a', to: 'b' }, { id: 'ba', type: 'uml.Dependency', from: 'b', to: 'a' }],
    views: [{ id: 'cls', diagram: 'uml.class', nodeIds: ['a', 'b'], containers: [{ id: 'left', label: 'Left', nodeIds: ['a'] }, { id: 'right', label: 'Right', nodeIds: ['b'] }] }],
    rules: [{ id: 'cyc', noCycles: true }, { id: 'nr', from: { container: 'left' }, to: { container: 'right' } }] };
  assert.ok(validate(m).some(p => p.rule === 'own-boxes'));
  assert.deepEqual(rules(m), []);
  assert.deepEqual(Object.keys(lensOf(mapContext(m), 'cls', { pick: { container: 'left' } }).layer.nodes), []);
});

test('class and package views: Tab reaches every element, then every line (one node-key ring per card, audit 1)', () => {
  for (const [m, vid] of [[CLASS, 'domain'], [read('./package-minimal.json'), 'v']]) {
    const s = mapContext(m).buildView(vid).markup, cards = (s.match(/<g class="node[ "]/g) || []).length;
    assert.ok(cards > 0, vid);
    assert.equal((s.match(/node-key/g) || []).length, cards, `${m.title}: a ring per card`);
  }
});

test('a generalization chain 20,000 deep is walked without recursion; a cycle at its end is still said once, naming it (audit 1)', () => {
  const n = 20000, nodes = Array.from({ length: n }, (_, i) => ({ id: 'c' + i, type: 'uml.Class', label: 'C' + i }));
  const edges = Array.from({ length: n - 1 }, (_, i) => ({ id: 'g' + i, type: 'uml.Generalization', from: 'c' + i, to: 'c' + (i + 1) }));
  assert.deepEqual(classProblems({ schemaVersion: 2, nodes, edges }), []);
  edges.push({ id: 'back', type: 'uml.Generalization', from: 'c' + (n - 1), to: 'c' + (n - 3) });
  const cyc = classProblems({ schemaVersion: 2, nodes, edges }).filter(p => p.rule === 'generalization-cycle');
  assert.equal(cyc.length, 1); assert.deepEqual(cyc[0].ids, ['c' + (n - 3), 'c' + (n - 2), 'c' + (n - 1), 'back']);
});

test('describe() of a view of packages nested 3,000 deep: the reading order without recursion (audit 2)', () => {
  const nodes = Array.from({ length: 3000 }, (_, i) => ({ id: 'p' + i, type: 'uml.Package', label: 'p' + i, ...(i ? { parent: 'p' + (i - 1) } : {}) }));
  nodes.push({ id: 'c', type: 'uml.Class', label: 'C', parent: 'p2999' });
  assert.match(describe({ schemaVersion: 2, nodes, edges: [], views: [{ id: 'all', diagram: 'uml.class', nodeIds: nodes.map(n => n.id) }] }, 'all'), /p2999/);
});

test('layout() of a view of packages nested 3,000 deep: the boxes placed without recursion; a line from 70 deep still orders them (audit 3)', () => {
  const deep = n => { const nodes = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, type: 'uml.Package', label: 'p' + i, ...(i ? { parent: 'p' + (i - 1) } : {}) }));
    nodes.push({ id: 'c', type: 'uml.Class', label: 'C', parent: 'p' + (n - 1) }, { id: 'd', type: 'uml.Class', label: 'D' });
    return { schemaVersion: 2, nodes, edges: [{ id: 'e', type: 'uml.Dependency', from: 'c', to: 'd' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['d', ...nodes.filter(x => x.id !== 'd').map(x => x.id)] }] }; };
  assert.equal(layout(deep(3000), 'v').nodes.length, 2);
  const g = layout(deep(70), 'v'), d = g.byId.d;
  assert.ok(d.x > g.byId.c.x, 'the line runs forward: D after the block that holds C');
  assert.deepEqual(g.families.filter(f => d.x < f.x + f.w && d.x + d.w > f.x && d.y < f.y + f.h && d.y + d.h > f.y).map(f => f.id), [], 'D in no box');
});

test('validate() of a model with a null in nodes and a class view reports it, and does not throw (audit 3)', () => {
  const p = validate({ schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class' }, null], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a'] }] });
  assert.ok(p.some(x => x.path === 'nodes[1]' && x.level === 'error'), JSON.stringify(p));
});

test('every labelled line of a typed view gets a spot or check() says it has none (audit 6): sales-classes\' "places", one 56 px run between two classes side by side in a view laid out down, gets its row gap widened', () => {
  for (const direction of ['down', 'right']) {
    const m = { ...CLASS, views: CLASS.views.map(v => v.id === 'domain' ? { ...v, direction } : v) }, g = layout(m, 'domain');
    assert.deepEqual(g.edges.filter(e => (e.label || e.step != null) && !e.lbl).map(e => e.id), [], direction);
    assert.deepEqual(check(m, 'domain').map(p => p.message), [], direction);
  }
});

// audit 6: a line or a card a structural view lists twice is drawn, read and counted once (class, package, object, component,
// deployment, composite structure, profile)
const STRUCT = ['sales-classes', 'bookshop-packages', 'order-objects', 'bookshop-components', 'bookshop-deployment', 'order-service-structure', 'bookshop-profile'];
const structOf = async () => { for (const t of ['object', 'component', 'deployment', 'composite', 'profile']) await import(`../src/uml/${t}.js`); return STRUCT.map(n => read(`../examples/${n}.json`)); };
test('audit 6: a line listed twice in view.edges is drawn and counted once', async () => {
  for (const a of await structOf()) { const m = structuredClone(a), v = m.views[0]; v.edges = Array.isArray(v.edges) ? v.edges : layout(a, v.id).edges.map(e => e.id); v.edges.push(v.edges[0]);
    const g = layout(m, v.id), id = v.edges[0];
    assert.equal(g.edges.filter(e => e.id === id).length, 1, a.views[0].id); assert.equal(g.order.filter(x => x === id).length, 1, a.views[0].id);
    assert.equal(describe(m, v.id).split('\n')[0], describe(a, v.id).split('\n')[0], a.views[0].id); }
});
test('audit 6: a card listed twice in view.nodeIds is drawn once', async () => {
  for (const a of await structOf()) { const m = structuredClone(a), v = m.views[0], id = layout(a, v.id).nodes.at(-1).id; v.nodeIds.push(id);
    assert.equal(layout(m, v.id).nodes.filter(n => n.id === id).length, 1, v.id); assert.equal(describe(m, v.id), describe(a, v.id), v.id); }
});
test('audit 6: describe names every line a class view draws, of any kind', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'o', type: 'uml.Class', label: 'Order' }, { id: 'p', type: 'uml.Class', label: 'Payment' }, { id: 'i', type: 'uml.Interface', label: 'Payable' }],
    edges: [{ id: 'u', type: 'uml.Usage', from: 'o', to: 'i' }, { id: 'r', type: 'uml.Realization', from: 'p', to: 'o', label: 'implements' }, { id: 'd', type: 'uml.Abstraction', from: 'p', to: 'i' }, { id: 'x', type: 'uml.Trace', from: 'i', to: 'o' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['o', 'p', 'i'], edges: ['u', 'r', 'd', 'x'] }] }; // listed: a class view draws only its own row's lines by itself (audit 9)
  const d = describe(m, 'v');
  for (const s of ['uses Payable', 'realizes Order ("implements")', 'abstracts Payable', 'linked to Order']) assert.ok(d.includes(s), s + ' in ' + d);
});
test('audit 7: describe names an association\'s stereotypes, as its line draws them', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Class', label: 'Customer' }, { id: 'o', type: 'uml.Class', label: 'Order' }],
    edges: [{ id: 'a', type: 'uml.Association', from: 'c', to: 'o', label: 'places', props: { stereotypes: ['audited'] } }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['c', 'o'] }] };
  assert.ok(describe(m, 'v').includes('associated with Customer «audited» ("places")'), describe(m, 'v'));
});

test('audit 6: a member row with a function type keeps it whole', () => {
  assert.deepEqual(parseMember('onClick: (e: Event) => void'), { type: 'uml.Property', label: 'onClick', props: { valueType: '(e: Event) => void' } });
  assert.deepEqual(parseMember('next: Fn(a)->B [0..1]'), { type: 'uml.Property', label: 'next', props: { valueType: 'Fn(a)->B', multiplicity: '0..1' } });
  assert.deepEqual(parseMember('f: Map<K, V> = x').props, { valueType: 'Map<K, V>', default: 'x' });
});

test('audit 8: an operation whose parameter has a function type keeps the parameters after it', () => {
  assert.deepEqual(parseMember('+on(handler: (e: Event) => void, opts: Options): void').props.parameters, [{ name: 'handler', valueType: '(e: Event) => void' }, { name: 'opts', valueType: 'Options' }]);
  assert.deepEqual(parseMember('f(a: () -> Unit, b: Int)').props.parameters, [{ name: 'a', valueType: '() -> Unit' }, { name: 'b', valueType: 'Int' }]);
});
test('audit 9: a class view with no edges list draws its own row\'s lines only; a listed usage, realization or connector is drawn with its notation', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'Checkout', members: [{ id: 'A.p', type: 'uml.Property', label: 'p' }, { id: 'A.q', type: 'uml.Property', label: 'q' }] },
    { id: 'B', type: 'uml.Class', label: 'PriceList' }, { id: 'C', type: 'uml.Class', label: 'Tax' }],
  edges: [{ id: 'u', type: 'uml.Usage', from: 'A', to: 'B' }, { id: 'r', type: 'uml.Realization', from: 'C', to: 'B' }, { id: 'd', type: 'uml.Dependency', from: 'A', to: 'C' },
    { id: 'k', type: 'uml.Connector', from: 'A.p', to: 'A.q' }, { id: 'k2', type: 'uml.Connector', from: 'A.p', to: 'C' }],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['A', 'B', 'C'] }, { id: 'w', diagram: 'uml.class', nodeIds: ['A', 'B', 'C'], edges: ['u', 'r', 'k', 'k2'] }] };
  assert.deepEqual(layout(m, 'v').edges.map(e => e.id), ['d']);
  assert.match(describe(m, 'v'), /and 1 line\./);
  const g = layout(m, 'w'), at = id => g.edges.find(e => e.id === id);
  assert.deepEqual(g.edges.map(e => e.id), ['u', 'r', 'k2'], 'two members of one class: no loop on it');
  assert.deepEqual([at('u').end, at('u').label, at('u').aria], [{ from: 'none', to: 'open', dashed: true }, '«use»', 'Usage from Checkout to PriceList: «use»']);
  assert.deepEqual(at('r').end, { from: 'none', to: 'triangle', dashed: true }); assert.deepEqual(at('k2').end, { from: 'none', to: 'none' });
  assert.deepEqual(g.legend.map(s => s.match(/<b>([^<]*)<\/b>/)[1]), ['Usage', 'Realization', 'Connector']);
});

test('audit 11: member-names judges classifiers\' and instances\' named members only: a state\'s two unnamed regions beside a class view are not "named twice"', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'busy', type: 'uml.State', label: 'Busy', members: [{ id: 'busy.r1', type: 'uml.Region' }, { id: 'busy.r2', type: 'uml.Region' }] },
    { id: 'order', type: 'uml.Class', label: 'Order', members: [{ id: 'order.a', type: 'uml.Property' }, { id: 'order.b', type: 'uml.Property' }, { id: 'order.x', type: 'uml.Property', label: 'x' }, { id: 'order.x2', type: 'uml.Property', label: 'x' }] }],
  edges: [], views: [{ id: 'c', diagram: 'uml.class', nodeIds: ['order'] }] };
  assert.deepEqual(classProblems(m).filter(p => p.rule === 'member-names').map(p => p.ids), [['order', 'order.x', 'order.x2']]);
});

test('audit 14: F2 on a UML line edits its label alone: its keyword and «stereotypes» are not stored, and not drawn twice', async () => {
  await Promise.all(['profile', 'component', 'deployment'].map(t => import(`../src/uml/${t}.js`)));
  const run = (diagram, [ta, tb], e, edit, want, drawn) => {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: ta, label: 'A' }, { id: 'b', type: tb, label: 'B' }], edges: [{ from: 'a', to: 'b', ...e, id: 'e' }], views: [{ id: 'v', diagram, nodeIds: ['a', 'b'] }] };
    const opens = layout(m, 'v').edges.find(x => x.id === 'e').label, r = diagramOf(m.views[0]).edits.rename(m, m.views[0], 'e', edit(opens)), m2 = apply(m, r);
    assert.equal(m2.edges[0].label, want, diagram); assert.equal(layout(m2, 'v').edges.find(x => x.id === 'e').label, drawn, diagram);
    assert.equal(diagramOf(m.views[0]).edits.rename(m, m.views[0], 'a', 'Z'), null, 'a node: the canvas\'s own');
  };
  run('uml.class', ['uml.Class', 'uml.Class'], { type: 'uml.Dependency', label: 'audits', props: { stereotypes: ['trace'] } }, t => t.replace('audits', 'logs'), 'logs', '«trace» logs');
  run('uml.package', ['uml.Package', 'uml.Package'], { type: 'uml.PackageImport', label: 'books' }, t => t.replace('books', 'titles'), 'titles', '«import» titles');
  run('uml.package', ['uml.Package', 'uml.Package'], { type: 'uml.PackageMerge' }, t => t + ' all', 'all', '«merge» all'); // no label: the field opens with the keyword alone
  run('uml.profile', ['uml.Stereotype', 'uml.MetaclassReference'], { type: 'uml.Extension', label: 'x', props: { isRequired: true } }, t => t.replace('x', 'y'), 'y', '{required} y');
  run('uml.component', ['uml.Artifact', 'uml.Component'], { type: 'uml.Manifestation', label: 'built' }, t => t.replace('built', 'packaged'), 'packaged', '«manifest» packaged');
  run('uml.deployment', ['uml.Artifact', 'uml.Node'], { type: 'uml.Deployment', label: 'nightly' }, t => t.replace('nightly', 'hourly'), 'hourly', '«deploy» hourly');
});
test('audit 15: F2 on a line the view owns (an object in view.edges) edits its label alone, in the class and object views too', async () => {
  await import('../src/uml/object.js');
  const own = (diagram, ty, e) => ({ schemaVersion: 2, nodes: [{ id: 'a', type: ty, label: 'A' }, { id: 'b', type: ty, label: 'B' }], edges: [], views: [{ id: 'v', diagram, nodeIds: ['a', 'b'], edges: [{ id: 'e', from: 'a', to: 'b', ...e }] }] });
  for (const m of [own('uml.class', 'uml.Class', { type: 'uml.Usage', label: 'x' }), own('uml.object', 'uml.InstanceSpecification', { type: 'uml.Link', props: { association: 'owns' } })]) {
    const T = diagramOf(m.views[0]), drawn = layout(m, 'v').edges[0].label;
    assert.deepEqual(T.edits.rename(m, m.views[0], 'e', drawn), [], `${m.views[0].diagram}: unchanged, nothing`);
    const m2 = apply(m, T.edits.rename(m, m.views[0], 'e', drawn + ' y'));
    assert.equal(layout(m2, 'v').edges[0].label, drawn + ' y', m.views[0].diagram);
  }
});

test('audit 16: a member\'s stereotypes are drawn before its row, printed for the PDF and the panel, and read back', async () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'order', type: 'uml.Class', label: 'Order', props: { stereotypes: ['entity'] }, members: [
    { id: 'order.id', type: 'uml.Property', label: 'id', props: { valueType: 'UUID', stereotypes: ['id'] } },
    { id: 'order.place', type: 'uml.Operation', label: 'place', props: { stereotypes: ['command'] } }] }],
  edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['order'] }] };
  const svg = String((await import('../src/draw/svg.js')).svgOf(mapContext(m).buildGeo('v')));
  for (const w of ['«id» id: UUID', '«command» place()']) assert.ok(svg.includes(w), w);
  assert.equal(printMember(m.nodes[0].members[0]), '«id» id: UUID');
  assert.deepEqual(parseMember('«id» «key» - id: UUID'), { type: 'uml.Property', label: 'id', props: { stereotypes: ['id', 'key'], visibility: 'private', valueType: 'UUID' } });
  assert.deepEqual(memberEdit(m.nodes[0].members[0], 'id: UUID').commands[1].value, { valueType: 'UUID' }, 'taking «id» off the text drops it');
});

test('audit 17: on an enumeration, a bare name after its «stereotypes» is a literal, as printMember writes one', () => {
  const T = diagramOf({ diagram: 'uml.class' }), E = { id: 'Color', type: 'uml.Enumeration', label: 'Color', members: [] };
  const lit = { id: 'c.r', type: 'uml.EnumerationLiteral', label: 'Red', props: { stereotypes: ['deprecated'] } };
  assert.deepEqual(T.member.add(printMember(lit), E), { type: 'uml.EnumerationLiteral', label: 'Red', props: { stereotypes: ['deprecated'] } });
  assert.deepEqual(T.member.add('«a» «b»Red', E), { type: 'uml.EnumerationLiteral', label: 'Red', props: { stereotypes: ['a', 'b'] } });
  assert.equal(T.member.add('«deprecated» red: Int', E).type, 'uml.Property', 'not a bare name: an attribute');
  assert.equal(T.member.add('«deprecated» Red', { id: 'K', type: 'uml.Class', label: 'K' }).type, 'uml.Property', 'on a class: an attribute');
});

test('audit 19: a component, an actor or a node shown in a class or package view is drawn with its kind\'s keyword, as its accessible name says it', () => {
  for (const diagram of ['uml.class', 'uml.package']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Component', label: 'Shop' }, { id: 'a', type: 'uml.Actor', label: 'Buyer' }, { id: 'n', type: 'uml.Node', label: 'Server' },
      { id: 'k', type: 'uml.Class', label: 'Order' }, { id: 'i', type: 'uml.Interface', label: 'Pay' }], views: [{ id: 'v', diagram, nodeIds: ['c', 'a', 'n', 'k', 'i'] }] };
    const g = layout(m, 'v'), st = id => g.byId[id].stereotypes;
    assert.deepEqual([st('c'), st('a'), st('n'), st('k'), st('i')], [['component'], ['actor'], ['node'], [], ['interface']], diagram);
    const { markup } = mapContext(m).buildView('v');
    assert.ok(markup.includes('«component»') && markup.includes('«actor»') && markup.includes('«node»'), diagram);
  }
});

test('audit 23: a class view\'s own line (view.edges object) is checked as a model one, at its own path (generalization-kinds, realization-target)', () => {
  const at = (m, id) => validate(m).filter(p => (p.ids || []).includes(id)).map(p => [p.rule, p.path]);
  for (const line of [{ id: 'own-gen', type: 'uml.Generalization', from: 'order', to: 'payable' }, { id: 'own-real', type: 'uml.InterfaceRealization', from: 'order', to: 'book' }]) {
    const m = structuredClone(CLASS); m.edges.push(line); const own = structuredClone(CLASS); own.views[0].edges = [...CLASS.edges.map(e => e.id), structuredClone(line)];
    const want = at(m, line.id), k = `edges[${CLASS.edges.length}]`;
    assert.ok(want.length, `${line.id}: the model line is said`);
    assert.deepEqual(at(own, line.id), want.map(([r, p]) => [r, p.replace(k, `views[0].edges[${CLASS.edges.length}]`)]), `${line.id}: the own line alike, at its own path`);
  }
});

test('audit 26: a comment\'s line breaks are drawn a line each (SHAPE.note), a blank line kept, the note growing to fit', () => {
  const texts = (m, v) => [...mapContext(m).buildView(v).markup.matchAll(/data-shape="note"[\s\S]*?<\/g><\/g>/g)].map(g => [...g[0].matchAll(/<text[^>]*>([^<]*)</g)].map(x => x[1]));
  for (const [diagram, other] of [['uml.class', 'uml.Class'], ['uml.package', 'uml.Package']]) { // SHAPE.note, which every type that draws a uml.Comment shares
    const m = { schemaVersion: 2, nodes: [{ id: 'k', type: other, label: 'Order' }, { id: 'n', type: 'uml.Comment', label: 'Total is the sum of lines\nTax added at checkout' },
      { id: 'p', type: 'uml.Comment', label: 'one\r\n\r\ntwo' }, { id: 'q', type: 'uml.Comment', label: 'a plain note that is long enough to wrap at two hundred and twenty pixels wide' }],
    views: [{ id: 'v', diagram, nodeIds: ['k', 'n', 'p', 'q'] }] };
    const [n, p, q] = texts(m, 'v');
    assert.deepEqual(n, ['Total is the sum of lines', 'Tax added at checkout'], diagram);
    assert.deepEqual(p, ['one', '', 'two'], `${diagram}: the blank line stays`);
    assert.ok(q.length > 1 && q.every(l => l), `${diagram}: a note with no break is still wrapped at 220 px, with no empty line`);
    const g = layout(m, 'v'); assert.ok(g.byId.p.h > g.byId.n.h, `${diagram}: the note grows a line for each`);
  }
});

test('audit 28: an element of no type, drawn and named a class, is judged as a class by the class rules', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'u', label: 'Thing' }, { id: 'k', type: 'uml.Class', label: 'Order' }, { id: 'i', type: 'uml.Interface', label: 'Payable' }, { id: 'w', label: 'Other' }],
    edges: [{ id: 'g', type: 'uml.Generalization', from: 'u', to: 'k' }, { id: 'g2', type: 'uml.Generalization', from: 'w', to: 'u' }, { id: 'r', type: 'uml.InterfaceRealization', from: 'u', to: 'i' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['u', 'k', 'i', 'w'] }] };
  assert.match(layout(m, 'v').byId.u.aria, /^Class Thing/);
  assert.deepEqual(validate(m), [], 'a class specializing a class, and realizing an interface');
  // a class specializing an interface is still refused, the untyped end said as the class it is drawn as
  const bad = { ...m, edges: [{ id: 'g', type: 'uml.Generalization', from: 'u', to: 'i' }] };
  assert.deepEqual(validate(bad).map(p => p.message), ['generalization-kinds: class "Thing" specializes interface "Payable" (g)']);
});

test('audit 29: a node with no type the view shows is judged a class by every class rule, as it is drawn and named; one no class view shows is not', () => {
  const mk = t => ({ schemaVersion: 2, nodes: [
    { id: 'a', ...(t ? { type: t } : {}), label: 'Order', parent: 'b', members: [{ id: 'a1', type: 'uml.Property', label: 'id' }, { id: 'a2', type: 'uml.Property', label: 'id' }, { id: 'a3', type: 'uml.EnumerationLiteral', label: 'RED' }] },
    { id: 'b', type: 'uml.Class', label: 'Order' }, { id: 'c', type: 'uml.Class', label: 'Order', parent: 'b' }],
    edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'c'] }] });
  const said = m => validate(m).filter(p => p.path !== 'nodes[0].type').map(p => `${p.rule} ${p.path}`).sort();
  const typed = said(mk('uml.Class'));
  assert.deepEqual(typed, ['classifier-names nodes[2]', 'member-kinds nodes[0].members[2]', 'member-names nodes[0].members[1]', 'owner-kinds nodes[0].parent', 'owner-kinds nodes[2].parent']);
  assert.deepEqual(said(mk()), typed, 'untyped: the same problems as a uml.Class');
  assert.equal(describe(mk(), 'v').split('\n')[1], 'Class Order::Order, 2 attributes, 0 operations.');
  // a map's untyped nodes beside a class view that does not show them: no class rule judges them
  const map = mk(); map.views[0].nodeIds = ['b', 'c'];
  assert.ok(!validate(map).some(p => p.ids.includes('a')), JSON.stringify(validate(map)));
});

test('audit 31: the PDF Members column lists what the class box draws, not a port or a reception it leaves out', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.Class', label: 'Shop', members: [{ id: 's.n', type: 'uml.Property', label: 'name', props: { valueType: 'String' } },
    { id: 's.pay', type: 'uml.Operation', label: 'pay' }, { id: 's.api', type: 'uml.Port', label: 'api', props: { valueType: 'Api' } }, { id: 's.r', type: 'uml.Reception', label: 'Paid' }] },
  { id: 'u', label: 'Loose', members: [{ id: 'u.n', type: 'uml.Property', label: 'n' }, { id: 'u.p', type: 'uml.Port', label: 'p' }] }],
  edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['s', 'u'] }] };
  const ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V.v, ctx.buildGeo('v')), row = id => els.rows.find(r => r.includes(`<b>${id}</b>`));
  assert.match(row('Shop'), /<p>name: String<\/p><p>\+? ?pay\(\)<\/p><\/td>/);
  assert.doesNotMatch(row('Shop'), /api|Paid/, 'the port and the reception the box does not draw are not listed');
  assert.doesNotMatch(row('Loose'), /<p>p<\/p>/, 'nor on an element of no type, drawn as a class');
  assert.deepEqual(diagramOf({ diagram: 'uml.class' }).rows(m, m.views[0], 's'), ['name: String', printMember(m.nodes[0].members[1])]);
});

test('audit 31: owner-kinds writes the owner\'s kind as the view draws it, with its article: "a class" (of no type), "an interface", never "a undefined"', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'o', label: 'Outer' }, { id: 'c', type: 'uml.Class', label: 'Inner', parent: 'o' }, { id: 'i', type: 'uml.Interface', label: 'Api' }, { id: 'd', type: 'uml.Class', label: 'D', parent: 'i' },
    { id: 't', type: 'uml.DataType', label: 'Money' }, { id: 'e', type: 'uml.Class', label: 'E', parent: 't' }],
  edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['o', 'c', 'i', 'd', 't', 'e'] }] };
  assert.deepEqual(validate(m).filter(p => p.rule === 'owner-kinds').map(p => p.message), [
    'owner-kinds: "Inner" is owned by "Outer", a class, not a package',
    'owner-kinds: "D" is owned by "Api", an interface, not a package',
    'owner-kinds: "E" is owned by "Money", a data type, not a package']);
});

test('audit 33: an element that opens a view titled "" is named "opens" with the view\'s id (the map context\'s opensTo)', () => {
  const m = { schemaVersion: 2, edges: [], nodes: [{ id: 'k', type: 'uml.Class', label: 'Order', opensView: 'other' }],
    views: [{ id: 'cv', diagram: 'uml.class', nodeIds: ['k'] }, { id: 'other', title: '', nodeIds: [] }] };
  const n = mapContext(m).buildGeo('cv').nodes.find(x => x.id === 'k');
  assert.equal(n.opensTo, 'other'); assert.match(n.aria, /, opens other$/);
});

// audit 38: an end label (role, multiplicity) is placed clear of its own line's name label and of every class drawn
const endLabs = svg => [...svg.matchAll(/<text[^>]*class="end-lab"[^>]*data-box="([-\d. ]+)"[^>]*>([^<]*)</g)].map(x => { const [X, Y, W, H] = x[1].split(' ').map(Number); return { x: X, y: Y, w: W, h: H, t: x[2] }; });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const assoc = (id, from, to, ends, label) => ({ id, type: 'uml.Association', from, to, ...(label ? { label } : {}),
  props: { ends: { from: { role: ends[0], multiplicity: ends[1] }, to: { role: ends[2], multiplicity: ends[3] } } } });

test('audit 38: an association\'s role and multiplicity keep clear of its own name label', async () => {
  const { svgOf } = await import('../src/draw/svg.js');
  const m = { schemaVersion: 2, nodes: ['Customer', 'Order', 'Product'].map((l, i) => ({ id: 'c' + i, type: 'uml.Class', label: l })),
    edges: [assoc('a0', 'c1', 'c2', ['items', '1', 'owner', '*'], 'owns'), assoc('a1', 'c0', 'c2', ['children', '1..*', 'owner', '*'])],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['c0', 'c1', 'c2'], direction: 'right' }] };
  for (const d of ['right', 'down']) {
    m.views[0].direction = d;
    const g = layout(m, 'v'), labs = endLabs(String(svgOf(g)));
    assert.equal(labs.length, 8, d);
    for (const e of g.edges.filter(x => x.lbl)) for (const b of labs) assert.ok(!overlap(b, e.lbl), `${d}: "${b.t}" at ${b.x},${b.y} over the label "${e.label}"`);
  }
  const g = layout(CLASS, 'domain'), labs = endLabs(String(svgOf(g)));
  for (const e of g.edges.filter(x => x.lbl)) for (const b of labs) assert.ok(!overlap(b, e.lbl), `sales-classes: "${b.t}" over the label "${e.label}"`);
});

test('audit 38: an end label is never drawn over a class its line does not end on', async () => {
  const { svgOf } = await import('../src/draw/svg.js');
  const m = { schemaVersion: 2, nodes: [0, 1, 2, 3, 4].map(i => ({ id: 'c' + i, type: 'uml.Class', label: 'Class' + i,
    members: i === 0 || i === 2 ? [{ id: `c${i}.a`, type: 'uml.Property', label: 'attr', props: { valueType: 'String' } }] : [] })),
  edges: [assoc('a0', 'c3', 'c3', ['items', '1..*', 'items', '1..*']), assoc('a1', 'c3', 'c1', ['orders', '0..1', 'owner', '1..*'], 'owns'),
    assoc('a2', 'c2', 'c4', ['children', '*', 'items', '*']), assoc('a3', 'c3', 'c1', ['buyer', '*', 'children', '*'])],
  views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['c0', 'c1', 'c2', 'c3', 'c4'], direction: 'down' }] };
  for (const d of ['down', 'right']) {
    m.views[0].direction = d;
    const g = layout(m, 'v'), labs = endLabs(String(svgOf(g)));
    assert.equal(labs.length, 16, d);
    for (const n of g.nodes) for (const b of labs) assert.ok(!overlap(b, n), `${d}: "${b.t}" at ${b.x},${b.y} over ${n.id}`);
  }
});

test('audit 38: connect on a class or package view refuses a realization or a package import or merge its own rule calls an error, and only those', () => {
  const m = { schemaVersion: 2, title: 'T', nodes: [{ id: 'p', type: 'uml.Package', label: 'sales' }, { id: 'q', type: 'uml.Package', label: 'catalog' }, { id: 'f', type: 'uml.Profile', label: 'ext' },
    { id: 'c', type: 'uml.Class', label: 'Order' }, { id: 'd', type: 'uml.Class', label: 'Line' }, { id: 'i', type: 'uml.Interface', label: 'Payable' }, { id: 'e', type: 'uml.Enumeration', label: 'State' },
    { id: 'u', label: 'Untyped' }, { id: 'n', type: 'uml.Comment', label: 'note' }], edges: [],
  views: [{ id: 'cv', diagram: 'uml.class', nodeIds: ['p', 'q', 'c', 'd', 'i', 'e', 'u', 'n'] }, { id: 'pv', diagram: 'uml.package', nodeIds: ['p', 'q', 'f', 'c', 'd', 'u'] }] };
  const ids = ['p', 'q', 'f', 'c', 'd', 'i', 'e', 'u', 'n', 'gone'], said = new Set();
  for (const [vid, types] of [['cv', ['uml.InterfaceRealization']], ['pv', ['uml.PackageImport', 'uml.PackageMerge']]]) for (const type of types) for (const from of ids) for (const to of ids) {
    const v = m.views.find(x => x.id === vid), r = diagramOf(v).edits.connect(m, v, from, to, null, { type });
    const m2 = structuredClone(m); m2.edges.push({ id: 'x', type, from, to });
    const bad = validate(m2).some(p => p.level === 'error' && /^(realization-target|import-ends):/.test(p.message));
    assert.equal(!!(r && r.error), bad, `${vid} ${type} ${from} -> ${to}: ${JSON.stringify(r)}`);
    if (r && r.error) said.add(r.error); }
  assert.deepEqual([...said].sort(), ['A package import runs from a package to another package', 'A package merge runs from a package to another package', 'A realization runs from a class, a component, a port, an enumeration or a data type to an interface']);
  // the class view still refuses a generalization that closes a cycle, and leaves any other line to the default
  const cv = m.views[0], loop = { ...m, edges: [{ id: 'g', type: 'uml.Generalization', from: 'c', to: 'd' }] };
  assert.match(diagramOf(cv).edits.connect(loop, cv, 'd', 'c', null, { type: 'uml.Generalization' }).error, /may not close a cycle/);
  assert.equal(diagramOf(cv).edits.connect(m, cv, 'c', 'd', null, { type: 'uml.Association' }), null);
  assert.equal(diagramOf(m.views[1]).edits.connect(m, m.views[1], 'c', 'd', null, { type: 'uml.Dependency' }), null);
});

// audit 40: the panel's New member row and a member row's edit added, or renamed to, a name the class holds already, and
// validate() then said member-names, an error; they are refused in member-names' words, as the SysML block rows refuse one
test('audit 40: a member added or edited to a name another member of its class holds is refused; an overload, or the name it keeps, is not', () => {
  const T = diagramOf({ diagram: 'uml.class' }), m = structuredClone(CLASS), n = id => m.nodes.find(x => x.id === id), mem = (o, id) => n(o).members.find(x => x.id === id);
  const C = n('customer'), O = n('order'), errs = x => validate(x).filter(p => p.level === 'error').map(p => p.message);
  assert.deepEqual(errs(m), []);
  const no = /^member-names: "Customer" has a member named "email" already \(customer\.email\): a classifier's members have different names$/;
  assert.match(T.member.add('email: Text', C).error, no);
  assert.match(T.member.edit(mem('customer', 'customer.name'), '- email: Text', C).error, no);
  assert.match(T.member.edit(mem('order', 'order.id'), 'total: Money', O).error, /"Order" has a member named "total" already \(order\.total\)/);
  // what it lets through leaves validate() clean: an overload (other parameter types), a member keeping its name, a new name
  const ok = [[T.member.add('add(book: Book): Order', O), 'order'], [T.member.add('phone: Text', C), 'customer']];
  ok.forEach(([r]) => assert.equal(r.error, undefined, JSON.stringify(r)));
  const m2 = apply(m, [...ok.map(([r, o], i) => ({ op: 'add', element: { id: 'k' + i, type: r.type, label: r.label, props: r.props }, owner: o })),
    ...T.member.edit(mem('customer', 'customer.name'), '+ name: Text [1]', C).commands, ...T.member.edit(mem('order', 'order.add'), 'add(book: Book, quantity: Integer): Order', O).commands]);
  assert.deepEqual(errs(m2), []);
  // an operation renamed to an attribute's name is a clash only by member-names' key: name(params) for an operation
  assert.equal(T.member.edit(mem('order', 'order.cancel'), 'total()', O).error, undefined);
  // without its owner (a host calling member.edit as before) the edit is read as it was
  assert.ok(T.member.edit(mem('customer', 'customer.name'), 'email: Text').commands);
});

test('audit 43: validate() says an association end\'s role that is not text, at its own path, as a member\'s type', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }],
    edges: [{ id: 'l', type: 'uml.Association', from: 'a', to: 'b', props: { ends: { from: { role: 'x' }, to: { role: { z: 3 } } } } }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] };
  const p = validate(m).filter(x => / is not text/.test(x.message));
  assert.deepEqual(p.map(x => [x.level, x.path, x.message]), [['warning', 'edges[0].props.ends.to.role', 'role {"z":3} is not text: drawn as "[object Object]"']]);
});

test('audit 49: an interface realization from a component, or from a port a component or class owns, passes the class view\'s rule and connect, as the component view\'s', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'uml.Component', label: 'API', members: [{ id: 'c.p', type: 'uml.Port', label: 'p' }] },
    { id: 'k', type: 'uml.Class', label: 'K', members: [{ id: 'k.q', type: 'uml.Port', label: 'q' }, { id: 'k.a', type: 'uml.Property', label: 'a' }] },
    { id: 'i', type: 'uml.Interface', label: 'IRides' }, { id: 'j', type: 'uml.Interface', label: 'IOther' }],
  edges: [{ id: 'r1', type: 'uml.InterfaceRealization', from: 'c', to: 'i' }, { id: 'r2', type: 'uml.InterfaceRealization', from: 'c.p', to: 'i' }, { id: 'r3', type: 'uml.InterfaceRealization', from: 'k.q', to: 'i' }],
  views: [{ id: 'cp', diagram: 'uml.component', nodeIds: ['c', 'i'] }, { id: 'cv', diagram: 'uml.class', nodeIds: ['k'] }] };
  assert.deepEqual(validate(m).filter(p => p.level === 'error').map(p => p.rule), []);
  const cv = m.views[1], connect = (from, to) => diagramOf(cv).edits.connect(m, cv, from, to, null, { type: 'uml.InterfaceRealization' });
  assert.equal(connect('c', 'i'), null); assert.equal(connect('c.p', 'i'), null); assert.equal(connect('k.q', 'i'), null);
  // still refused: an interface realizing one, a property, a realization to a component
  for (const [from, to] of [['j', 'i'], ['k.a', 'i'], ['k', 'c']]) {
    assert.match(connect(from, to).error, /^A realization runs from a class, a component, a port, an enumeration or a data type to an interface$/, `${from} -> ${to}`);
    const m2 = structuredClone(m); m2.edges.push({ id: 'x', type: 'uml.InterfaceRealization', from, to });
    assert.deepEqual(validate(m2).filter(p => p.rule === 'realization-target').map(p => p.ids[0]), ['x'], `${from} -> ${to}`); }
});

test('audit 53: a realization from a port whose owner has type "" passes the class view\'s rule and connect, as the class view draws the owner a class', () => {
  for (const type of [undefined, '', 'uml.Class']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'svc', ...(type === undefined ? {} : { type }), label: 'Service', members: [{ id: 'svc.api', type: 'uml.Port', label: 'api' }] },
      { id: 'i', type: 'uml.Interface', label: 'Api' }], edges: [{ id: 'r', type: 'uml.InterfaceRealization', from: 'svc.api', to: 'i' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['svc', 'i'] }] }, v = m.views[0];
    assert.deepEqual(validate(m).filter(p => p.rule === 'realization-target'), [], JSON.stringify(type));
    assert.equal(diagramOf(v).edits.connect(m, v, 'svc.api', 'i', null, { type: 'uml.InterfaceRealization' }), null, JSON.stringify(type)); }
});

test('audit 58: a comment with no spaces (Chinese) wraps at 220 px between two characters', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'n', type: 'uml.Comment', label: '为书店开业准备第一批五百种图书并与两家批发商谈好退货条款和付款期限为书店开业准备第一批五百种图书并与两家批发商谈好退货条款和付款期限' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['n'] }] };
  const ls = [...mapContext(m).buildView('v').markup.matchAll(/data-shape="note"[\s\S]*?<\/g><\/g>/g)].flatMap(g => [...g[0].matchAll(/<text[^>]*>([^<]*)</g)].map(x => x[1]));
  assert.ok(ls.length > 1 && ls.join('') === '为书店开业准备第一批五百种图书并与两家批发商谈好退货条款和付款期限为书店开业准备第一批五百种图书并与两家批发商谈好退货条款和付款期限', JSON.stringify(ls));
});
