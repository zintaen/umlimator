// SysML's parametric diagram, sysml.parametric (work package M3.5, notes/milestone-3.md §9, §13): the type's definition,
// 19-parametric.json drawn in its frame through M3.1's projection, every parameter on its constraint property's border, a
// constraint block subject's parameters on its frame, a constraint property's rounded corners and expression, names, reading
// order, the legend, describe(), each rule of §9 passing and failing, the editing hooks on the projection mapped back to
// SysML's types (a binding drawn from the canvas carries ends.to.part), a 30-step session saved and reopened, the PDF's
// words, rows and line text, and the common edits' time. tests/parametric.html draws it in a browser and edits it by pointer
// and keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
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
import { tablesOf } from '../src/page/print.js';
import '../src/sysml/parametric.js';

const M19 = JSON.parse(readFileSync(new URL('sysml-targets.json', import.meta.url)))['19-parametric'];
const T = diagramOf({ diagram: 'sysml.parametric' }), VID = 'range-analysis', V = M19.views[0];
const node = (m, id) => m.nodes.find(n => n.id === id), mem = (m, id) => m.nodes.flatMap(n => n.members || []).find(x => x.id === id);
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const errors = m => validate(m).filter(p => p.level === 'error');
const run = (m, r) => apply(m, Array.isArray(r) ? r : r.commands);
const ownerOf = (g, id) => g.byId[id] || g.families.find(f => f.id === id);
const onBorder = (g, n) => { const o = ownerOf(g, n.owner), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  return { L: Math.abs(cx - o.x), R: Math.abs(cx - o.x - o.w), T: Math.abs(cy - o.y), B: Math.abs(cy - o.y - o.h) }[n.side] < .01; };
const bind = (id, from, to, ends) => ({ id, type: 'sysml.BindingConnector', from, to, ...(ends ? { props: { ends } } : {}) });
// 19 with a constraint block built from others (§9): RangeModel's own parameters on its frame, bound through its constraint
// properties u and r, and a constraint block with parameters only (still a frame)
function nested() {
  const m = structuredClone(M19), p = (id, t) => ({ id: `range-model.${id}`, type: 'sysml.ConstraintParameter', label: id, props: { valueType: t } });
  m.nodes.push({ id: 'range-model', type: 'sysml.ConstraintBlock', label: 'RangeModel', members: [p('capacity', 'Energy'), p('share', 'Real'), p('range', 'Distance'), p('consumption', 'EnergyPerDistance'),
    { id: 'range-model.u', type: 'sysml.ConstraintProperty', label: 'u', props: { valueType: 'UsableEnergy' } }, { id: 'range-model.r', type: 'sysml.ConstraintProperty', label: 'r', props: { valueType: 'RangeEquation' } }] });
  m.edges.push(bind('n-capacity', 'range-model.capacity', 'usable-energy.capacity', { to: { part: 'range-model.u' } }), bind('n-share', 'range-model.share', 'usable-energy.share', { to: { part: 'range-model.u' } }),
    bind('n-usable', 'usable-energy.usable', 'range-equation.energy', { from: { part: 'range-model.u' }, to: { part: 'range-model.r' } }),
    bind('n-range', 'range-model.range', 'range-equation.range', { to: { part: 'range-model.r' } }), bind('n-consumption', 'range-model.consumption', 'range-equation.consumption', { to: { part: 'range-model.r' } }));
  m.views.push({ id: 'model', diagram: 'sysml.parametric', title: 'Range model', subject: 'range-model', nodeIds: ['range-model'] },
    { id: 'bare', diagram: 'sysml.parametric', subject: 'range-equation', nodeIds: ['range-equation'] });
  return m;
}
const NEST = nested();

test('the definition: sysml.parametric with its palette, two lines, its properties, the cascade on a constraint property, its hooks', () => {
  assert.equal(T.name, 'sysml.parametric');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['sysml.ConstraintProperty', 'Constraint property'], ['sysml.ValueProperty', 'Value property'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['sysml.BindingConnector', 'Binding'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.props['sysml.ConstraintProperty'].map(f => f.key), ['valueType', 'multiplicity', 'stereotypes']);
  assert.deepEqual(T.props['sysml.ConstraintBlock'].map(f => f.key), ['constraint', 'stereotypes']);
  assert.deepEqual(T.refs, { 'sysml.BindingConnector': { 'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' } });
  assert.equal(T.layout.rank, false);
  for (const k of ['layout', 'validate', 'describe', 'word', 'rows', 'text']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'field', 'member', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(Object.keys(T.rules), ['subject-kind', 'binding-ends', 'binding-parameter', 'binding-types', 'parameter-bound', 'connector-drawn', 'value-type', 'constraint-type']);
  assert.deepEqual(['sysml.Block', 'sysml.ConstraintBlock', 'sysml.InterfaceBlock'].map(t => T.member.holds({ type: t })), [true, true, false]);
});

test('19-parametric.json draws clean in its frame, right and down: properties inside, every parameter centred on its constraint property\'s border, its name in the frame, validates with no problem', () => {
  assert.deepEqual(validate(M19), []); assert.deepEqual(validate(NEST), []);
  for (const direction of ['right', 'down']) {
    const d = withDir(M19, direction), g = layout(d, VID), F = g.families.find(f => f.id === 'ebike');
    assert.deepEqual(check(d, VID), [], `${direction}: no overlap, no crossing, no line through a node`);
    assert.deepEqual([F.shape, F.title], ['sysml-frame', 'par [Block] EBike [E-bike range]'], direction);
    node(M19, 'ebike').members.forEach(x => { const b = g.byId[x.id];
      assert.ok(b.x >= F.x && b.y >= F.y && b.x + b.w <= F.x + F.w && b.y + b.h <= F.y + F.h, `${direction}: ${x.id} in the frame`); });
    const ports = g.nodes.filter(n => n.shape === 'port');
    assert.equal(ports.length, 9, direction);
    ports.forEach(n => { assert.equal(g.byId[n.owner].shape, 'sysml-constraint', n.id); assert.ok(onBorder(g, n), `${direction}: ${n.id} on ${n.owner}'s border`);
      const b = n.nameBox; assert.ok(b && b.x >= F.x && b.y >= F.y && b.x + b.w <= F.x + F.w && b.y + b.h <= F.y + F.h, `${direction}: ${n.id}'s name in the frame`); });
    const all = [F, ...g.nodes, ...ports.map(n => n.nameBox)], B = g.bounds;
    assert.ok(all.every(b => b.x >= B.x && b.y >= B.y && b.x + b.w <= B.x + B.w && b.y + b.h <= B.y + B.h), `${direction}: the bounds hold the frame and the names`);
    assert.deepEqual(['usable', 'eco', 'boost'].map(k => g.byId['ebike.' + k].expr), ['{usable = capacity * share}', '{range = energy / consumption}', '{range = energy / consumption}']);
    assert.equal(g.edges.length, 8);
  }
  assert.equal(mem(M19, 'ebike.eco').type, 'sysml.ConstraintProperty', 'the model is not edited');
});

test('a constraint block subject: its parameters on its frame, its constraint properties inside, bindings to the frame\'s parameters drawn; one with parameters only is still a frame', () => {
  for (const direction of ['right', 'down']) {
    const d = withDir(NEST, direction); d.views.unshift(d.views.splice(1, 1)[0]); d.views[0].direction = direction;
    const g = layout(d, 'model'), F = g.families.find(f => f.id === 'range-model');
    // down, the frame's parameters on its top side cross its header band with their lines inward: a gap of the composite
    // geometry's subject box under a long SysML header, pinned here (the note's §9, as built); nothing else is found
    const found = check(d, 'model'), head = found.filter(x => / header crossed by edge /.test(x.message));
    assert.deepEqual(found.filter(x => !head.includes(x)), [], direction);
    assert.ok(head.every(x => x.targets[1].ids.every(id => g.byId[d.edges.find(e => e.id === id).from].side === 'T')), direction);
    assert.equal(head.length, direction === 'down' ? 2 : 0, direction);
    assert.deepEqual([F.shape, F.title, F.aria], ['sysml-frame', 'par [ConstraintBlock] RangeModel [Range model]', 'Parametric diagram of constraint block RangeModel: Range model']);
    for (const p of ['capacity', 'share', 'consumption', 'range']) { const n = g.byId['range-model.' + p]; assert.equal(n.owner, 'range-model'); assert.ok(onBorder(g, n), `${direction}: ${p} on the frame`); }
    assert.deepEqual(g.nodes.filter(n => n.shape === 'sysml-constraint').map(n => n.id), ['range-model.u', 'range-model.r']);
    assert.equal(g.nodes.filter(n => n.shape === 'port').length, 4 + 6);
    assert.equal(g.edges.length, 5);
    assert.ok(!g.byId['ebike.eco'], 'only the subject\'s members');
  }
  const b = layout(NEST, 'bare'), F = b.families.find(f => f.id === 'range-equation');
  assert.equal(F.shape, 'sysml-frame'); assert.equal(F.title, 'par [ConstraintBlock] RangeEquation');
  ['range', 'energy', 'consumption'].forEach(p => assert.ok(onBorder(b, b.byId['range-equation.' + p]), p));
});

test('a constraint property\'s shape: rounded corners, its name over its expression, each cut to the box', () => {
  const { markup } = mapContext(M19).buildView(VID);
  assert.match(markup, /<g class="node part constraint" data-id="ebike.eco"[^>]*aria-label="Constraint eco: RangeEquation \{range = energy \/ consumption\}, in EBike, 3 parameters">/);
  assert.equal((markup.match(/rx="10" class="n-body"/g) || []).length, 3, 'three constraint properties, rounded');
  // sized by the composite type from its name and its parameters (§17): the example's expressions are cut, whole in the name
  assert.match(markup, /class="c-expr"[^>]*>\{range = energy \/ c…<\/text>/);
  const long = structuredClone(M19); node(long, 'range-equation').props.constraint = ('range = ' + 'energy / consumption + '.repeat(5)).padEnd(120, 'x').slice(0, 120); // 120 characters
  assert.equal(node(long, 'range-equation').props.constraint.length, 120);
  const g = layout(long, VID), n = g.byId['ebike.eco'], cut = /class="c-expr"[^>]*>([^<]*)<\/text>/.exec(mapContext(long).buildView(VID).markup)[1];
  assert.ok(cut.endsWith('…') && cut.length < 30, cut); assert.equal(n.w, layout(M19, VID).byId['ebike.eco'].w, 'sized by its name, not its expression (§17)');
});

test('names, reading order, legend and describe() (§13)', () => {
  const g = layout(M19, VID), by = g.byId, E = Object.fromEntries(g.edges.map(e => [e.id, e.aria]));
  assert.equal(g.families[0].aria, 'Parametric diagram of block EBike: E-bike range');
  assert.equal(by['ebike.ecoRange'].aria, 'Value ecoRange: Distance, in EBike');
  assert.equal(by['ebike.eco->range-equation.range'].aria, 'Parameter range: Distance of eco');
  assert.equal(E['bind-eco-range'], 'Binding from value ecoRange to parameter range of eco');
  assert.equal(E['bind-usable-eco'], 'Binding from parameter usable of usable to parameter energy of eco');
  assert.equal(layout(NEST, 'model').byId['range-model.range'].aria, 'Parameter range: Distance of RangeModel');
  assert.equal(layout(NEST, 'model').edges.find(e => e.id === 'n-range').aria, 'Binding from parameter range of RangeModel to parameter range of r');
  assert.equal(g.order[0], 'ebike'); assert.deepEqual(g.order.slice(-8), M19.edges.map(e => e.id));
  assert.deepEqual(g.legend.map(s => s.match(/<b>(.*?)<\/b>/)[1]), ['Binding']);
  const said = describe(M19, VID).split('\n');
  assert.equal(said[0], 'E-bike range: a parametric diagram of 19 elements and 8 lines.');
  assert.equal(said[1], 'Parametric diagram of block EBike: E-bike range.');
  assert.equal(said.length, 1 + 19 + 8); assert.equal(said.at(-1), 'Binding from value boostRange to parameter range of boost.');
  const b = structuredClone(M19); b.views[0].nodeIds.push('range-equation');
  assert.ok(describe(b, VID).split('\n').some(l => l.startsWith('Constraint block RangeEquation')), 'a constraint block\'s card: not "Class"');
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(M19, { memos }).buildView(VID), second = mapContext(M19, { memos }).buildView(VID);
  assert.equal(unid(second.markup), unid(first.markup)); assert.equal(unid(mapContext(M19).buildView(VID).markup), unid(first.markup));
  assert.match(first.markup, /class="c-expr"/);
});

/* ---- validators (§9): each rule passes 19 (and the nested model) and fails on a model that breaks it, naming its rule and
   elements, at its level ---- */
const RULE_CASES = {
  'subject-kind': [m => { m.views[0].subject = 'ebike.eco'; }, 'error'],
  'binding-ends': [m => { m.edges.find(e => e.id === 'bind-eco-range').props.ends.to.part = 'ebike.ecoRange'; }, 'error'],
  'binding-parameter': [m => { m.edges.find(e => e.id === 'bind-eco-range').to = 'usable-energy.share'; }, 'error'],
  'binding-types': [m => { m.nodes.push({ id: 'distance', type: 'sysml.ValueType', label: 'Distance' }, { id: 'energy', type: 'sysml.ValueType', label: 'Energy' });
    m.edges.push(bind('mixed', 'ebike.batteryCapacity', 'range-equation.range', { to: { part: 'ebike.eco' } })); }, 'warning'],
  'parameter-bound': [m => { m.edges = m.edges.filter(e => e.id !== 'bind-eco-range'); }, 'warning'],
  'connector-drawn': [m => { m.views[0].subject = 'range-model'; m.views[0].nodeIds = ['range-model']; m.edges.push(bind('loop', 'range-model.capacity', 'range-model.range')); }, 'warning'],
  // the block definition view's two, said with a parametric view only (audit 20)
  'value-type': [m => { mem(m, 'ebike.ecoRange').props.valueType = 'RangeEquation'; }, 'warning'],
  'constraint-type': [m => { delete mem(m, 'ebike.eco').props.valueType; }, 'error'],
};
test('validators: each rule passes the examples and fails on a model that breaks it, at its level', () => {
  assert.deepEqual(Object.keys(RULE_CASES), Object.keys(T.rules));
  for (const [rule, [breakIt, level]] of Object.entries(RULE_CASES)) { const m = structuredClone(NEST); breakIt(m);
    const got = validate(m).filter(p => p.rule === rule);
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(validate(m))}`); assert.equal(got[0].level, level, rule);
    assert.ok(got[0].message.startsWith(rule + ': ') && got[0].ids.length, rule); }
  // a view with no subject: a warning; a binding through a value property, or to a value of another block, refused in words
  const none = structuredClone(M19); delete none.views[0].subject;
  assert.deepEqual(validate(none).filter(p => p.rule === 'subject-kind').map(p => p.level), ['warning']);
  const m = structuredClone(M19); RULE_CASES['binding-ends'][0](m);
  // audit 10: both its ends are now on ecoRange, one through a port: not drawn, and said
  assert.deepEqual(validate(m).map(p => [p.rule, p.path, p.message]), [['connector-drawn', 'edges[6]', 'connector-drawn: bind-eco-range runs from "ecoRange" to itself through its ports, which this view does not draw: no line runs from a box or a part to itself'], ['binding-ends', 'edges[6].props.ends.to.part', 'binding-ends: bind-eco-range\'s to end goes through "ecoRange", not a constraint property of "EBike": a binding reaches a parameter through a constraint property'],
    ['parameter-bound', 'nodes[2].members[0]', 'parameter-bound: parameter "range" of "eco" has no binding: nothing gives it a value']]);
  const o = structuredClone(M19); o.nodes.push({ id: 'other', type: 'sysml.Block', label: 'Other', members: [{ id: 'other.v', type: 'sysml.ValueProperty', label: 'v' }] });
  o.edges.push(bind('far', 'other.v', 'range-equation.range', { to: { part: 'ebike.eco' } }));
  assert.deepEqual(validate(o).map(p => [p.rule, p.path]), [['binding-ends', 'edges[8].from']]);
  // two values bound; a parameter bound twice; one type specializing the other: passing
  const ok = structuredClone(M19); ok.edges.push(bind('vv', 'ebike.ecoRange', 'ebike.boostRange'), bind('twice', 'ebike.boostRange', 'range-equation.range', { to: { part: 'ebike.eco' } }));
  ok.nodes.push({ id: 'distance', type: 'sysml.ValueType', label: 'Distance' }, { id: 'length', type: 'sysml.ValueType', label: 'Length' });
  mem(ok, 'ebike.boostRange').props.valueType = 'Length'; ok.edges.push({ id: 'g', type: 'uml.Generalization', from: 'length', to: 'distance' });
  assert.deepEqual(validate(ok), []);
  ok.edges.pop(); assert.deepEqual(validate(ok).map(p => [p.rule, p.ids[0]]), [['binding-types', 'bind-boost-range'], ['binding-types', 'vv'], ['binding-types', 'twice']]);
});

/* ---- editing (§9): the composite type's hooks on the projection, mapped back ---- */
test('connect: a binding drawn from the canvas is a sysml.BindingConnector carrying ends.to.part, from a value or from the parameter\'s end; a comment link to a parameter refused', () => {
  const want = { id: 'connector', type: 'sysml.BindingConnector', from: 'ebike.ecoRange', to: 'range-equation.consumption', props: { ends: { to: { part: 'ebike.boost' } } } };
  const line = T.lines[0];
  for (const [a, b] of [['ebike.ecoRange', 'ebike.boost->range-equation.consumption'], ['ebike.boost->range-equation.consumption', 'ebike.ecoRange']]) {
    const r = T.edits.connect(M19, V, a, b, null, line);
    assert.deepEqual(r, [{ op: 'add', element: want, view: VID }], `${a} to ${b}`); }
  const m = run(M19, T.edits.connect(M19, V, 'ebike.ecoRange', 'ebike.boost->range-equation.consumption', null, line));
  assert.deepEqual(errors(m), []); assert.ok(layout(m, VID).edges.some(e => e.id === 'connector'));
  const pp = T.edits.connect(M19, V, 'ebike.eco->range-equation.energy', 'ebike.boost->range-equation.energy', null, line)[0].element;
  assert.deepEqual(pp.props.ends, { from: { part: 'ebike.eco' }, to: { part: 'ebike.boost' } }, 'parameter to parameter');
  assert.equal(T.edits.connect(M19, V, 'ebike.ecoRange', 'ebike.boostRange', null, line), null, 'value to value: the default');
  assert.match(T.edits.connect(M19, V, 'ebike.eco->range-equation.range', 'ebike.eco', null, line).error, /pick a parameter of eco/, 'to a constraint property\'s box: refused');
  assert.ok(T.edits.connect(M19, V, 'ebike.eco->range-equation.range', 'ebike.ecoRange', null, T.lines[1]).error);
});
test('add: a constraint property and a value property into the subject by their palette entries; no value property in a constraint block', () => {
  const E = l => T.elements.find(e => e.label === l);
  assert.deepEqual(T.edits.add(M19, V, E('Constraint property'), 'city : RangeEquation', null), [{ op: 'add', element: { id: 'ebike.city', type: 'sysml.ConstraintProperty', label: 'city', props: { valueType: 'RangeEquation' } }, owner: 'ebike' }]);
  assert.equal(T.edits.add(M19, V, E('Value property'), 'mass : Mass', null)[0].element.type, 'sysml.ValueProperty');
  const m = run(M19, T.edits.add(M19, V, E('Constraint property'), 'city : RangeEquation', null)), g = layout(m, VID);
  assert.equal(g.byId['ebike.city'].shape, 'sysml-constraint'); assert.equal(g.nodes.filter(n => n.owner === 'ebike.city').length, 3, 'its parameters');
  assert.deepEqual(validate(m).map(p => p.rule), ['parameter-bound', 'parameter-bound', 'parameter-bound']);
  assert.match(T.edits.add(NEST, NEST.views[1], E('Value property'), 'x : Real', null).error, /no value property/);
  assert.equal(T.edits.add(M19, V, E('Comment'), 'note', null), null);
});
test('remove, rename, moveTo and member rows on the projection: SysML\'s types back, in SysML\'s words', () => {
  let r = T.edits.remove(M19, V, ['ebike.eco'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'ebike.eco' }]); assert.match(r.say, /property eco of EBike and its 3 lines/);
  const m = run(M19, r); assert.ok(!m.edges.some(e => ['bind-usable-eco', 'bind-eco-consumption', 'bind-eco-range'].includes(e.id)), 'its bindings go with it (refs)');
  assert.deepEqual(errors(m), []);
  r = T.edits.remove(M19, V, ['ebike.eco->range-equation.range'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'bind-eco-range' }]); assert.match(r.say, /the 1 binding through eco to its parameter range/);
  assert.deepEqual(T.edits.rename(M19, V, 'ebike.eco', 'city : RangeEquation'), [{ op: 'set', id: 'ebike.eco', path: 'label', value: 'city' }]);
  assert.deepEqual(T.edits.rename(M19, V, 'ebike.eco->range-equation.range', 'distance').commands, [{ op: 'set', id: 'range-equation.range', path: 'label', value: 'distance' }]);
  const geo = layout(M19, VID), side = geo.byId['ebike.eco->range-equation.range'].side, by = { L: [1, 0], R: [-1, 0], T: [0, 1], B: [0, -1] }[side];
  assert.equal(T.edits.moveTo(M19, V, 'ebike.eco->range-equation.range', { by, geo })[0].path.join('.'), 'present.ebike.eco.ports.range-equation.range.side');
  assert.deepEqual(T.edits.member(M19, V, 'ebike', null, 'city : RangeEquation'), [{ op: 'add', element: { id: 'ebike.city', type: 'sysml.ConstraintProperty', label: 'city', props: { valueType: 'RangeEquation' } }, owner: 'ebike' }]);
  assert.equal(T.edits.member(M19, V, 'ebike', null, 'mass : Real')[0].element.type, 'sysml.ValueProperty');
  assert.deepEqual(T.edits.member(M19, V, 'range-equation', null, 'param speed : Speed'), [{ op: 'add', element: { id: 'range-equation.speed', type: 'sysml.ConstraintParameter', label: 'speed', props: { valueType: 'Speed' } }, owner: 'range-equation' }]);
  assert.deepEqual(T.edits.member(M19, V, 'range-equation', 'range-equation.range', 'param range : Length'), [{ op: 'set', id: 'range-equation.range', path: 'props.valueType', value: 'Length' }]);
  assert.match(T.edits.member(M19, V, 'ebike', 'ebike.eco', 'param eco : RangeEquation').error, /keeps its member's kind/);
  assert.match(T.edits.member(M19, V, 'ebike', null, 'param x : Real').error, /belongs to a constraint block/, 'a param row on a block: no port added');
  // a property row's kind is its type's, as a new row's is: a retype across it, by the row or by F2, refused (audit 20)
  for (const [id, t] of [['ebike.ecoRange', 'ecoRange : RangeEquation'], ['ebike.eco', 'eco : Distance'], ['ebike.eco', 'eco2 : Real'], ['ebike.eco', 'eco']]) {
    assert.match(T.edits.member(M19, V, 'ebike', id, t).error, /^A row keeps its member's kind: /, t);
    if (t.includes(':')) assert.match(T.edits.rename(M19, V, id, t).error, /^A row keeps its member's kind: /, `F2 ${t}`); }
  assert.deepEqual(T.edits.member(M19, V, 'ebike', 'ebike.eco', 'eco : UsableEnergy'), [{ op: 'set', id: 'ebike.eco', path: 'props.valueType', value: 'UsableEnergy' }], 'another constraint block');
  assert.deepEqual(T.edits.member(M19, V, 'ebike', 'ebike.ecoRange', 'ecoRange : Real'), [{ op: 'set', id: 'ebike.ecoRange', path: 'props.valueType', value: 'Real' }]);
  // a port row adds no port this view never draws, new or over a value property's row (audit 14)
  for (const [id, t] of [[null, 'port zz : Real'], [null, 'Full Port zz : Real'], ['ebike.eco', 'proxy port eco : RangeEquation']]) assert.match(T.edits.member(M19, V, 'ebike', id, t).error, /constraint or value property/, t);
  assert.match(T.edits.member(M19, V, 'range-equation', null, 'x : Real').error, /holds parameters/, 'a plain row on a constraint block: refused');
  // the composite type's words said in SysML's: a parameter, a binding, a constraint property
  assert.equal(T.edits.rename(M19, V, 'ebike.eco->range-equation.range', 'dist : Length').say, 'Renamed RangeEquation\'s parameter: every constraint property of that type shows it');
  const along = { L: [0, 1], R: [0, 1], T: [1, 0], B: [1, 0] }[side];
  assert.match(T.edits.moveTo(M19, V, 'ebike.eco->range-equation.range', { by: along, geo }).error, /^A parameter's place along its side/);
  assert.match(T.edits.member(M19, V, 'range-equation', 'range-equation.range', 'param range : Length [2]').error, /^A parameter is param name : Type$/);
  assert.deepEqual(node(M19, 'range-equation').members.map(T.member.print), ['param range : Distance', 'param energy : Energy', 'param consumption : EnergyPerDistance']);
  assert.equal(T.member.print(mem(M19, 'ebike.eco')), 'eco : RangeEquation');
  assert.ok(T.member.add('x', node(M19, 'ebike')).error && T.member.edit(mem(M19, 'ebike.eco'), 'x').error);
});
test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const E = l => T.elements.find(e => e.label === l), steps = [];
  for (let i = 0; i < 5; i++) { const w = steps.reduce((m, s) => apply(m, s), M19), v = w.views[0];
    const cp = T.edits.add(w, v, E('Constraint property'), `c${i} : RangeEquation`, null), cid = cp[0].element.id, w2 = apply(w, cp);
    const val = T.edits.add(w2, w2.views[0], E('Value property'), `v${i} : Distance`, null), vid = val[0].element.id, w3 = apply(w2, val);
    const b = T.edits.connect(w3, w3.views[0], vid, `${cid}->range-equation.range`, null, T.lines[0]).map(x => ({ ...x, element: { ...x.element, id: `b${i}` } }));
    steps.push(cp, val, b, T.edits.rename(w3, w3.views[0], cid, `r${i} : RangeEquation`),
      [{ op: 'set', view: VID, path: ['present', cid, 'ports', 'range-equation.energy', 'side'], value: 'bottom' }],
      i % 2 ? T.edits.remove(w3, w3.views[0], [vid], false).commands : T.edits.member(w3, w3.views[0], 'ebike', vid, `v${i} : Length`));
  }
  assert.equal(steps.length, 30);
  const h = history(M19), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(errors(h.model), [], `step ${seen.length - 1}`); }
  assert.ok(!seen[30].includes('uml.Connector') && !seen[30].includes('uml.Property') && !seen[30].includes('uml.Port'), 'SysML\'s types only');
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const flat = g => JSON.stringify(g, (k, v) => (k === 'ms' ? undefined : v));
  assert.equal(flat(layout(reopened, VID)), flat(layout(JSON.parse(seen[30]), VID)));
  assert.equal(describe(reopened, VID), describe(JSON.parse(seen[30]), VID));
});

test('the PDF (§13): words, rows, a binding\'s ends as its line text', () => {
  assert.deepEqual(['ebike.eco', 'ebike.ecoRange', 'range-equation.range', 'ebike', 'range-equation', 'nope'].map(id => T.word(M19, id)),
    ['Constraint', 'Value', 'Parameter', 'Block', 'Constraint block', null]);
  assert.deepEqual(T.rows(M19, V, 'ebike.eco'), ['eco: RangeEquation', '{range = energy / consumption}']);
  assert.deepEqual(T.rows(M19, V, 'range-equation.range'), ['Distance']);
  assert.deepEqual(T.rows(M19, V, 'range-equation'), ['{range = energy / consumption}', 'param range : Distance', 'param energy : Energy', 'param consumption : EnergyPerDistance']);
  // its bindings are Lines rows, not member rows too (audit 18, as the internal block view since audit 17)
  assert.deepEqual(T.rows(M19, V, 'ebike').slice(8), ['boost : RangeEquation']);
  assert.deepEqual(['bind-eco-range', 'bind-usable-eco', 'nope'].map(id => T.text(M19, V, id)), ['ecoRange to range of eco', 'usable of usable to energy of eco', null]);
  const ctx = mapContext(M19), tables = tablesOf(ctx, ctx.V[VID], ctx.buildGeo(VID)), cards = tables.find(t => t.cls === 'cards');
  const lines = tables.find(t => t.cls === 'lines');
  assert.equal(lines.rows.filter(r => r.includes('ecoRange to range of eco')).length, 1, lines.rows.join('\n'));
  assert.equal(lines.rows.length, 8);
  // each binding's ends as the picture names them, not by member id (audit 32)
  const ends = lines.rows.map(r => r.replace(/<\/td>.*$/, '').replace(/<[^>]+>/g, ''));
  assert.ok(ends.includes('batteryCapacity : Energy → usable : UsableEnergy'), ends.join('\n'));
  assert.ok(!ends.some(r => /ebike\./.test(r)), ends.join('\n'));
  assert.ok(!cards.rows.some(r => /Binding from/.test(r)), cards.rows.join('\n'));
  // a constraint block as the subject: its nested binding is a Lines row too, and its rows hold none
  const nc = mapContext(NEST), nt = tablesOf(nc, nc.V.model, nc.buildGeo('model'));
  assert.ok(nt.find(t => t.cls === 'lines').rows.filter(r => r.includes('Binding connector')).length === 5, JSON.stringify(nt));
  assert.ok(!nt.find(t => t.cls === 'cards').rows.some(r => /Binding from/.test(r)), JSON.stringify(nt));
});

/* ---- P1 (§14): 16 constraint properties, 48 parameters, 30 value properties, 60 bindings; a binding added and a constraint
   property's type changed ---- */
function stress() {
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'sysml.Block', label: 'Big', members: [] }], edges: [], views: [{ id: 'all', diagram: 'sysml.parametric', subject: 's', nodeIds: ['s'] }] };
  for (let k = 0; k < 4; k++) m.nodes.push({ id: `k${k}`, type: 'sysml.ConstraintBlock', label: `Eq${k}`, props: { constraint: 'a = b + c' }, members: ['a', 'b', 'c'].map(p => ({ id: `k${k}.${p}`, type: 'sysml.ConstraintParameter', label: p })) });
  for (let i = 0; i < 16; i++) m.nodes[0].members.push({ id: `s.c${i}`, type: 'sysml.ConstraintProperty', label: `c${i}`, props: { valueType: `Eq${i % 4}` } });
  for (let i = 0; i < 30; i++) m.nodes[0].members.push({ id: `s.v${i}`, type: 'sysml.ValueProperty', label: `v${i}`, props: { valueType: 'Real' } });
  for (let i = 0; m.edges.length < 60; i++) { const c = i % 16, p = ['a', 'b', 'c'][Math.floor(i / 16) % 3];
    m.edges.push(bind(`b${i}`, `s.v${(i * 7) % 30}`, `k${c % 4}.${p}`, { to: { part: `s.c${c}` } })); }
  return m;
}
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('P1 (§14): 16 constraint properties, 48 parameters, 30 values, 60 bindings: a binding added and a constraint property\'s type changed, each laid out and drawn, and a full layout under 1 s in CI, the edits\' times against the 100 ms target printed (CPU, best of seven after a warm-up; the maintainer\'s decision of 13 Nov 2026) (timed)', () => {
  const M = stress(), memos = {}, draw = m => mapContext(m, { memos }).buildView('all').markup;
  assert.equal(M.edges.length, 60); const g = layout(M, 'all');
  assert.deepEqual([g.nodes.filter(n => n.shape === 'sysml-constraint').length, g.nodes.filter(n => n.shape === 'port').length, g.nodes.filter(n => n.shape === 'part').length], [16, 48, 30]);
  const add = k => apply(M, [{ op: 'add', element: bind(`x${k}`, `s.v${k}`, 'k0.a', { to: { part: 's.c0' } }) }]);
  const type = k => apply(M, [{ op: 'set', id: 's.c1', path: 'props.valueType', value: `Eq${2 + (k % 2)}` }]);
  draw(M); draw(add(20)); draw(type(20)); // the warm-up
  const runs = Array.from({ length: 7 }, (_, k) => { const was = memos.all.runs, a = add(k), t = type(k);
    const r = { full: cpu(() => mapContext(M).buildView('all')), add: cpu(() => draw(a)), type: cpu(() => draw(t)) };
    assert.equal(memos.all.runs, was + 2, 'each edit lays the view out again'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  for (const k of ['full', 'add', 'type']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  console.log(`# P1 parametric: a binding added ${best('add').toFixed(1)} ms, a constraint property's type changed ${best('type').toFixed(1)} ms (target 100 ms), full layout ${best('full').toFixed(1)} ms`);
});

test('the type ships in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ["registerDiagramType('sysml.parametric'", 'function SYS_PAR_GEO(']) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});

test('audit 4: the hint line\'s SysML words leave the element names as written', () => {
  const m = structuredClone(M19); mem(m, 'ebike.batteryCapacity').label = 'spare part count'; mem(m, 'ebike.eco').label = 'port connector';
  assert.match(T.edits.remove(m, m.views[0], ['ebike.batteryCapacity'], true).say, /^Deleted property spare part count of EBike/);
  assert.match(T.edits.remove(m, m.views[0], ['ebike.eco'], false).say, /property port connector of EBike and its 3 lines/);
});

test('audit 8: a constraint block with no label is named by its id: bindings to its parameters pass binding-parameter', () => {
  const m = JSON.parse(readFileSync(new URL('parametric-minimal.json', import.meta.url))), cb = m.nodes.find(n => n.type === 'sysml.ConstraintBlock'), old = cb.label;
  for (const n of m.nodes) for (const x of n.members || []) if (x.props && x.props.valueType === old) x.props.valueType = cb.id;
  delete cb.label;
  assert.deepEqual(validate(m).map(p => p.message), []);
});

test('binding-types names value types with no label by their id (audit 9)', () => {
  const m = JSON.parse(readFileSync(new URL('./parametric-minimal.json', import.meta.url), 'utf8'));
  m.nodes.push({ id: 'Wh', type: 'sysml.ValueType' }, { id: 'km', type: 'sysml.ValueType' });
  m.nodes[0].members[0].props.valueType = 'Wh'; m.nodes[1].members[0].props.valueType = 'km';
  const msg = validate(m).filter(p => p.rule === 'binding-types').map(p => p.message);
  assert.equal(msg.length, 1); assert.match(msg[0], /of type Wh to .* of type km/);
});

test('audit 15: "port : Integer" is a value property named port; "param : Real" with no name is refused', () => {
  assert.deepEqual(T.edits.member(M19, V, 'ebike', null, 'port : Integer')[0].element, { id: 'ebike.port', type: 'sysml.ValueProperty', label: 'port', props: { valueType: 'Integer' } });
  assert.ok(T.edits.member(M19, V, 'usable-energy', null, 'param : Real').error);
});

test('audit 18: a constraint property with no type: binding-parameter says it has none, never "a parameter of null"', () => {
  const m = run(M19, [{ op: 'set', id: 'ebike.eco', path: 'props.valueType', value: undefined }]);
  const said = validate(m).filter(p => p.rule === 'binding-parameter').map(p => p.message);
  assert.ok(said.length >= 1, said.join('\n'));
  for (const s of said) { assert.ok(!/null/.test(s), s); assert.match(s, /is not a parameter of "eco", which has no type: type it by a constraint block/); }
  // a type set but naming no constraint block keeps its quoted name
  const named = validate(run(M19, [{ op: 'set', id: 'ebike.eco', path: 'props.valueType', value: 'Nothing' }])).filter(p => p.rule === 'binding-parameter');
  assert.ok(named.length && named.every(p => /a parameter of "Nothing", the type of "eco"/.test(p.message)), named.map(p => p.message).join('\n'));
});

test('audit 23: a view\'s own binding (view.edges object) is drawn, named, described and checked as a model one: no arrowhead', () => {
  const c = M19.edges.find(e => e.id === 'bind-capacity'), own = structuredClone(M19);
  own.edges = own.edges.filter(e => e.id !== c.id); own.views[0].edges = M19.edges.map(e => (e.id === c.id ? structuredClone(c) : e.id));
  const pick = g => g.edges.map(e => [e.id, e.type, e.label, e.aria, e.end, e.pts]);
  assert.deepEqual(pick(layout(own, VID)), pick(layout(M19, VID)), 'the same picture');
  assert.equal(describe(own, VID), describe(M19, VID));
  assert.equal(T.text(own, own.views[0], c.id), T.text(M19, M19.views[0], c.id));
  const j = own.views[0].edges.findIndex(x => typeof x === 'object');
  own.views[0].edges[j].props.ends.to.part = 'ebike.batteryCapacity'; const m = structuredClone(M19); m.edges.find(e => e.id === c.id).props.ends.to.part = 'ebike.batteryCapacity';
  const at = x => validate(x).filter(p => (p.ids || []).includes(c.id)).map(p => [p.rule, p.path]);
  const want = at(m), k = `edges[${M19.edges.indexOf(c)}]`;
  assert.ok(want.some(([r]) => r === 'binding-ends'), 'the model line: said');
  assert.deepEqual(at(own), want.map(([r, p]) => [r, p.replace(k, `views[0].edges[${j}]`)]), 'the own line: said alike, at its own path');
});

test('audit 25: a view whose parameter names move inside the frame keeps the layout\'s margin round it, as one where none moves', () => {
  const margin = (m, vid, dir) => { if (dir) { m = structuredClone(m); m.views.find(x => x.id === vid).direction = dir; }
    const g = layout(m, vid), F = g.families[0], B = g.bounds; return [F.x - B.x, F.y - B.y, B.x + B.w - F.x - F.w, B.y + B.h - F.y - F.h]; };
  const S = JSON.parse(readFileSync(new URL('parametric-stress.json', import.meta.url))), E = JSON.parse(readFileSync(new URL('../examples/ebike-range.json', import.meta.url)));
  const ref = margin(S, 'edge-cases', 'right'); // no name moves
  assert.ok(ref.every(x => x >= 36), String(ref));
  for (const [m, vid, dir] of [[E, 'range-analysis'], [S, 'edge-cases', 'down'], [S, 'ec-constraint-block']]) { const got = margin(m, vid, dir);
    assert.ok(got.every(x => x >= Math.min(...ref)), `${vid} ${dir || ''}: ${got}`); }
});

test('audit 28: a listed line of another kind is keyed as it is drawn (a dependency, dashed with an open arrow), after the binding', () => {
  const m = { schemaVersion: 2, nodes: ['a', 'b', 'c'].map(id => ({ id, type: 'sysml.ConstraintProperty', label: id.toUpperCase() })),
    edges: [{ id: 'o', type: 'uml.Connector', from: 'a', to: 'b' }, { id: 'x', type: 'uml.Dependency', from: 'b', to: 'c', label: 'uses' }],
    views: [{ id: 'v', diagram: 'sysml.parametric', nodeIds: ['a', 'b', 'c'], edges: ['o', 'x'] }] };
  const g = layout(m, 'v');
  assert.deepEqual(g.edges.find(e => e.id === 'x').end, { from: 'none', to: 'open', dashed: true });
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Binding', 'Dependency']);
  assert.deepEqual(layout({ ...m, views: [{ ...m.views[0], edges: ['o'] }] }, 'v').legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Binding']);
});

test('audit 30: binding-types reads a generalization a block definition view draws as its own line, as one of the model', () => {
  const ok = structuredClone(M19); ok.edges.push(bind('vv', 'ebike.ecoRange', 'ebike.boostRange'));
  ok.nodes.push({ id: 'distance', type: 'sysml.ValueType', label: 'Distance' }, { id: 'length', type: 'sysml.ValueType', label: 'Length' });
  mem(ok, 'ebike.boostRange').props.valueType = 'Length'; mem(ok, 'ebike.ecoRange').props.valueType = 'Distance';
  const before = validate(ok).filter(p => p.rule === 'binding-types' && p.ids[0] === 'vv').length;
  assert.equal(before, 1, 'Length and Distance unrelated: vv warned');
  ok.views.push({ id: 'bdd', diagram: 'sysml.block-definition', nodeIds: ['distance', 'length'], edges: [{ id: 'g', type: 'uml.Generalization', from: 'length', to: 'distance' }] });
  assert.deepEqual(validate(ok).filter(p => p.rule === 'binding-types' && p.ids[0] === 'vv'), [], 'Length is a kind of Distance, in the block definition view');
});

// audit 36: SYS_PAR_NAME was elName, so a constraint or value property with no name was drawn ': RangeEq' / ': Real' but its
// accessible name, describe(), its parameters' and bindings' names and the PDF called it by its id, as internal.js did before audit 17
test('an unnamed constraint or value property is named as drawn, ": RangeEq", in its accessible name, describe(), its parameters, its bindings and the PDF (audit 36)', () => {
  const base = JSON.parse(readFileSync(new URL('parametric-minimal.json', import.meta.url)));
  for (const [what, cut] of [['no label', x => { delete x.label; }], ['an empty label', x => { x.label = ''; }]]) {
    const m = structuredClone(base); cut(mem(m, 'bike.eq')); cut(mem(m, 'bike.energy'));
    const g = layout(m, 'v'), aria = id => g.byId[id].aria, said = describe(m, 'v');
    assert.equal(aria('bike.eq'), 'Constraint : RangeEq {r = e / 7}, in Bike, 2 parameters', what);
    assert.equal(aria('bike.energy'), 'Value : Real, in Bike', what);
    assert.ok(g.nodes.filter(n => n.shape === 'port' && n.owner === 'bike.eq').every(n => / of : RangeEq$/.test(n.aria)), what);
    assert.equal(g.edges.find(e => e.id === 'bind-e').aria ?? g.byId['bind-e']?.aria, 'Binding from value : Real to parameter e of : RangeEq', what);
    assert.ok(!/bike\.(eq|energy)/.test(said), `${what}: ${said}`);
    const c = mapContext(m), [, lines] = tablesOf(c, c.V.v, c.buildGeo('v'));
    assert.ok(lines.rows.some(r => r.includes('<td>: Real to e of : RangeEq</td>')), what);
    // with neither name nor type, the id
    const bare = structuredClone(m); delete mem(bare, 'bike.energy').props;
    assert.equal(layout(bare, 'v').byId['bike.energy'].aria, 'Value bike.energy, in Bike', what);
  }
  // a named one keeps its name
  assert.equal(layout(base, 'v').byId['bike.eq'].aria, 'Constraint eq: RangeEq {r = e / 7}, in Bike, 2 parameters');
});

// audit 37: SYS_PAR_SAID named every unnamed member by its id, so the subject's PDF row listed 'bike.eq : RangeEq' where the
// picture, its own row and every name say ': RangeEq'; the id stays for a property with neither name nor type, as SYS_PAR_TEXT
test('the subject\'s row lists an unnamed typed property as drawn, ": RangeEq", in rows() and the PDF (audit 37)', () => {
  const base = JSON.parse(readFileSync(new URL('parametric-minimal.json', import.meta.url)));
  for (const [what, cut] of [['no label', x => { delete x.label; }], ['an empty label', x => { x.label = ''; }]]) {
    const m = structuredClone(base); cut(mem(m, 'bike.eq')); cut(mem(m, 'bike.energy'));
    const rows = T.rows(m, m.views[0], 'bike');
    assert.deepEqual(rows, [': Real', 'range : Real', ': RangeEq'], what);
    const c = mapContext(m), [cards] = tablesOf(c, c.V.v, c.buildGeo('v'));
    assert.ok(cards.rows.some(r => r.includes('<p>: RangeEq</p>') && r.includes('<p>: Real</p>')) && !cards.rows.some(r => /bike\.(eq|energy) :/.test(r)), `${what}: ${cards.rows.join('\n')}`);
    // with neither name nor type, the id
    const bare = structuredClone(m); delete mem(bare, 'bike.energy').props;
    assert.equal(T.rows(bare, bare.views[0], 'bike')[0], 'bike.energy', what);
  }
  assert.deepEqual(T.rows(base, base.views[0], 'bike'), ['energy : Real', 'range : Real', 'eq : RangeEq']);
});
