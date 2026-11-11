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
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { multBounds, parseMember, printMember, memberEdit, classProblems } from '../src/uml/class.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const CLASS = read('../docs/diagrams/examples/01-class.json');

test('the definition: uml.class is registered with its palette, its lines, a properties form per type and its hooks', () => {
  const T = diagramOf({ diagram: 'uml.class' });
  assert.equal(T.name, 'uml.class');
  assert.deepEqual(T.elements.map(e => e.type), ['uml.Class', 'uml.Interface', 'uml.Enumeration', 'uml.DataType', 'uml.PrimitiveType', 'uml.Package', 'uml.Comment']);
  assert.deepEqual(T.lines.map(e => e.type), ['uml.Association', 'uml.Generalization', 'uml.InterfaceRealization', 'uml.Dependency', 'uml.CommentLink']);
  for (const t of [...T.elements, ...T.lines]) assert.ok(Array.isArray(T.props[t.type]) || t.type === 'uml.Comment', t.type);
  assert.deepEqual(T.props['uml.Association'].filter(f => f.path).map(f => f.path.join('.')), ['ends.from.role', 'ends.from.multiplicity', 'ends.from.aggregation', 'ends.from.navigable',
    'ends.to.role', 'ends.to.multiplicity', 'ends.to.aggregation', 'ends.to.navigable']);
  for (const k of ['layout', 'validate', 'describe', 'rankFlip']) assert.equal(typeof T[k], 'function', k);
  assert.equal(Object.keys(T.rules).length, 10);
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
  const r = memberEdit(m, '- total: Decimal [0..1]');
  assert.deepEqual(r.commands, [{ op: 'set', id: 'o.t', path: 'label', value: 'total' },
    { op: 'set', id: 'o.t', path: 'props', value: { stereotypes: ['id'], visibility: 'private', valueType: 'Decimal', multiplicity: '0..1' } }]);
  const model = { schemaVersion: 2, nodes: [{ id: 'o', type: 'uml.Class', label: 'O', members: [m] }], views: [] };
  assert.equal(printMember(apply(model, r.commands).nodes[0].members[0]), '- total: Decimal [0..1]');
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
};
test('validators: the base model breaks no rule, and validate() reports no error in it', () => {
  assert.deepEqual(classProblems(BASE), []);
  assert.deepEqual(validate(BASE).filter(p => p.level === 'error'), []);
  assert.deepEqual(classProblems(CLASS), [], 'the target example');
});
test('validators: each rule fails on a model that breaks it; the problem names its rule and its elements, and validate() reports it', () => {
  const T = diagramOf({ diagram: 'uml.class' });
  assert.deepEqual(Object.keys(breaks).sort(), Object.keys(T.rules).sort(), 'a failing fixture for every rule');
  for (const [rule, broke] of Object.entries(breaks)) {
    const m = structuredClone(BASE), ids = broke(m), got = classProblems(m);
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.equal(p.rule, rule); assert.equal(p.level, 'error'); assert.match(p.message, new RegExp('^' + rule + ': '));
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
  assert.ok(d.includes('Class Order (entity), 5 attributes, 3 operations; associated with Customer (1) ("places"); composed of OrderLine (lines, 1..*); aggregates Payment (payments, 0..*); realizes Payable; depends on Money «use».'), d.join('\n'));
  assert.ok(d.includes('Class OrderLine, 2 attributes, 0 operations; part of Order (1); associated with Book (book, 1).'), d.join('\n'));
  assert.ok(d.includes('Class CardPayment, 1 attribute, 1 operation; a kind of Payment.'));
  assert.ok(d.includes('Enumeration OrderStatus, 4 literals.'));
  assert.equal(describe(CLASS, 'payments').split('\n').length, 5);
});

const noOverlap = g => { for (const a of g.nodes) for (const b of g.nodes) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} and ${b.id} overlap`); };
test('the target example lays out clean: classifiers at their size, notes, the line-end table, the general class above, the check clean', () => {
  for (const v of CLASS.views) {
    const g = layout(CLASS, v.id), at = Object.fromEntries(g.nodes.map(n => [n.id, n]));
    noOverlap(g);
    assert.deepEqual(check(CLASS, v.id), [], v.id);
    assert.ok(g.nodes.every(n => n.shape === (n.type === 'uml.Comment' ? 'note' : 'classifier')), v.id);
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

test('performance (risks.md P1): a 40-element class view lays out once in well under a second, and an edit that moves nothing in a few ms', () => {
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
  }
  assert.ok(layout(m, 'd').nodes.find(n => n.id === 'a').h < layout(m, 'v').nodes.find(n => n.id === 'a').h, 'rows: 8 caps the long class');
});

// ---- review of 1.9: fixes, each with its regression
test('a version-1 model is a map: a view that says diagram "uml.class" lays out and describes as it does without it (model.md rule 1)', () => {
  const m = read('../examples/bookshop.json'), d = structuredClone(m), vid = m.views[0].id;
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
