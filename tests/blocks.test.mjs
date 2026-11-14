// The block definition diagram, sysml.block-definition (work package M3.3, notes/milestone-3.md §7, §13): the type's
// definition; blocks, interface blocks, constraint blocks and value types drawn by the classifier with their keyword and
// SysML's titled compartments, in the frame (a package subject's box is the frame); the class type's lines; the validators
// of §7.3, each with a passing and a failing fixture; describe(), names, reading order, the legend, the PDF's rows, words
// and line text; members as text (print(parse(x)) stable), the panel's member rows and connect; a 30-step session saved and
// reopened; P1 (§14). tests/blocks.html draws it in a browser and edits it by pointer and keyboard. Imports src/ to reach the
// internals; lib/umlimator-all.js holds the same code. The example is an inline copy of
// docs/diagrams/examples/17-block-definition.json, so M3.7's move breaks nothing here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { classProblems } from '../src/uml/class.js';
import { BD_RULES, bdProblems, bdParse, bdPrint } from '../src/sysml/blocks.js';

const T = diagramOf({ diagram: 'sysml.block-definition' }), V = 'blocks';
const M17 = {"schemaVersion":2,"title":"E-bike: blocks","root":"blocks","nodes":[{"id":"rental-vehicle","type":"sysml.Block","label":"RentalVehicle"},{"id":"ebike","type":"sysml.Block","label":"EBike","members":[{"id":"ebike.battery","type":"sysml.PartProperty","label":"battery","props":{"valueType":"Battery","multiplicity":"1"}},{"id":"ebike.controller","type":"sysml.PartProperty","label":"controller","props":{"valueType":"Controller","multiplicity":"1"}},{"id":"ebike.motor","type":"sysml.PartProperty","label":"motor","props":{"valueType":"Motor","multiplicity":"1"}},{"id":"ebike.wheels","type":"sysml.PartProperty","label":"wheels","props":{"valueType":"Wheel","multiplicity":"2"}},{"id":"ebike.dock","type":"sysml.ReferenceProperty","label":"dock","props":{"valueType":"Dock","multiplicity":"0..1"}},{"id":"ebike.rangeEq","type":"sysml.ConstraintProperty","label":"rangeEq","props":{"valueType":"RangeEquation"}}]},{"id":"battery","type":"sysml.Block","label":"Battery","members":[{"id":"battery.capacity","type":"sysml.ValueProperty","label":"capacity","props":{"valueType":"Energy"}},{"id":"battery.cellVoltage","type":"sysml.ValueProperty","label":"cellVoltage","props":{"valueType":"Voltage","multiplicity":"10"}},{"id":"battery.charge","type":"sysml.Port","label":"charge","props":{"valueType":"ChargeInterface"}}]},{"id":"motor","type":"sysml.Block","label":"Motor","members":[{"id":"motor.ratedPower","type":"sysml.ValueProperty","label":"ratedPower","props":{"valueType":"Power"}}]},{"id":"controller","type":"sysml.Block","label":"Controller","members":[{"id":"controller.setAssistLevel","type":"uml.Operation","label":"setAssistLevel","props":{"parameters":[{"name":"level","valueType":"Integer"}]}}]},{"id":"dock","type":"sysml.Block","label":"Dock","members":[{"id":"dock.charge","type":"sysml.Port","label":"charge","props":{"valueType":"~ChargeInterface"}}]},{"id":"charge-interface","type":"sysml.InterfaceBlock","label":"ChargeInterface","members":[{"id":"charge-interface.dc","type":"sysml.FlowProperty","label":"dc","props":{"valueType":"DCPower","direction":"in"}},{"id":"charge-interface.stateOfCharge","type":"sysml.FlowProperty","label":"stateOfCharge","props":{"valueType":"Percent","direction":"out"}}]},{"id":"range-equation","type":"sysml.ConstraintBlock","label":"RangeEquation","props":{"constraint":"range = energy / consumption"},"members":[{"id":"range-equation.range","type":"sysml.ConstraintParameter","label":"range","props":{"valueType":"Distance"}},{"id":"range-equation.energy","type":"sysml.ConstraintParameter","label":"energy","props":{"valueType":"Energy"}},{"id":"range-equation.consumption","type":"sysml.ConstraintParameter","label":"consumption","props":{"valueType":"EnergyPerDistance"}}]},{"id":"voltage","type":"sysml.ValueType","label":"Voltage","props":{"unit":"V","quantityKind":"voltage"}},{"id":"energy","type":"sysml.ValueType","label":"Energy","props":{"unit":"Wh","quantityKind":"energy"}}],"edges":[{"id":"ebike-battery","type":"uml.Association","from":"ebike","to":"battery","props":{"ends":{"from":{"aggregation":"composite","multiplicity":"0..1"},"to":{"role":"battery","multiplicity":"1"}}}},{"id":"ebike-motor","type":"uml.Association","from":"ebike","to":"motor","props":{"ends":{"from":{"aggregation":"composite","multiplicity":"1"},"to":{"role":"motor","multiplicity":"1"}}}},{"id":"ebike-controller","type":"uml.Association","from":"ebike","to":"controller","props":{"ends":{"from":{"aggregation":"composite","multiplicity":"1"},"to":{"role":"controller","multiplicity":"1"}}}},{"id":"ebike-is-rental-vehicle","type":"uml.Generalization","from":"ebike","to":"rental-vehicle"},{"id":"dock-uses-charge-interface","type":"uml.Dependency","from":"dock","to":"charge-interface","props":{"stereotypes":["use"]}}],"views":[{"id":"blocks","diagram":"sysml.block-definition","title":"E-bike blocks","parent":null,"direction":"down","nodeIds":["rental-vehicle","ebike","battery","motor","controller","dock","charge-interface","range-equation","voltage","energy"]}]};
const by = (m, id) => m.nodes.find(n => n.id === id), mem = (m, id) => m.nodes.flatMap(n => n.members || []).find(x => x.id === id);
const unid = s => s.replace(/\bg\d+-/g, 'g-');
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const inside = (a, b) => a.x >= b.x - .5 && a.y >= b.y - .5 && a.x + a.w <= b.x + b.w + .5 && a.y + a.h <= b.y + b.h + .5;
const B = (id, label, members = [], more = {}) => ({ id, type: 'sysml.Block', label, ...(members.length ? { members } : {}), ...more });
const P = (id, type, label, props) => ({ id, type: 'sysml.' + type, label, ...(props ? { props } : {}) });

test('the definition: sysml.block-definition is registered with its palette, its five lines, its properties, its rules and its hooks', () => {
  assert.equal(T.name, 'sysml.block-definition');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['sysml.Block', 'Block'], ['sysml.InterfaceBlock', 'Interface block'], ['sysml.ConstraintBlock', 'Constraint block'], ['sysml.ValueType', 'Value type'], ['uml.Package', 'Package'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['uml.Association', 'Part association'], ['uml.Association', 'Reference association'], ['uml.Generalization', 'Generalization'], ['uml.Dependency', 'Dependency'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.lines[0].props, { ends: { from: { aggregation: 'composite' } } }, 'the part association sets the whole\'s end composite');
  assert.deepEqual(T.props['sysml.ValueType'].map(f => f.key), ['unit', 'quantityKind', 'stereotypes']);
  assert.deepEqual(T.props['sysml.ConstraintBlock'].map(f => f.key), ['constraint', 'stereotypes']);
  assert.deepEqual(T.props['sysml.Port'][0], { key: 'kind', label: 'Kind', kind: 'enum', options: ['proxy', 'full'] });
  assert.deepEqual(T.props['sysml.FlowProperty'][0].options, ['in', 'out', 'inout']);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows', 'text', 'rankFlip']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits), ['connect', 'member']);
  assert.deepEqual(Object.keys(BD_RULES), ['part-type', 'value-type', 'constraint-type', 'flow-direction', 'port-kind', 'member-kinds', 'general-kinds', 'part-agrees', 'part-unlisted']);
  for (const r of [...Object.keys(BD_RULES), 'generalization-kinds', 'composite-multiplicity', 'owner-kinds', 'line-inside']) assert.ok(Object.hasOwn(T.rules, r), r);
  assert.ok(T.rankFlip({ type: 'uml.Generalization' }) && !T.rankFlip({ type: 'uml.Association' }));
  assert.deepEqual(['sysml.Block', 'sysml.InterfaceBlock', 'sysml.ConstraintBlock', 'sysml.ValueType', 'uml.Package', 'uml.Comment'].map(t => T.member.holds({ type: t })), [true, true, true, true, false, false]);
});

test('17-block-definition.json (inline) validates clean, no part-agrees or part-unlisted, and lays out clean, down and right; down when the view says nothing; drawn twice from one memo, the same markup', () => {
  assert.deepEqual(validate(M17), []);
  for (const d of ['down', 'right']) { const m = withDir(M17, d), g = layout(m, V); assert.deepEqual(check(m, V), [], d);
    const F = g.families.find(f => f.shape === 'sysml-frame');
    g.nodes.forEach(n => assert.ok(inside(n, F), `${d}: ${n.id} inside the frame`)); }
  const plain = structuredClone(M17); delete plain.views[0].direction;
  const g = layout(plain, V);
  assert.ok(g.byId['rental-vehicle'].y + g.byId['rental-vehicle'].h < g.byId.ebike.y, 'down: the general above its specialization');
  assert.equal(unid(svgOf(g)), unid(svgOf(layout(M17, V))), 'down by default');
  const memos = {}, first = mapContext(M17, { memos }).buildView(V), nodes = JSON.stringify(memos[V].g.nodes);
  const second = mapContext(M17, { memos }).buildView(V);
  assert.equal(memos[V].runs, 1); assert.equal(unid(second.markup), unid(first.markup)); assert.equal(JSON.stringify(memos[V].g.nodes), nodes, 'the geometry is not edited after the layout');
});

test('drawing (§7.1): the frame and its header; each kind\'s keyword over its name; every compartment titled, in SysML\'s order, the empty ones left out; rows with a port\'s kind, a flow\'s direction, an expression, a unit', () => {
  const g = layout(M17, V), s = svgOf(g), n = id => g.byId[id];
  const F = g.families.find(f => f.shape === 'sysml-frame');
  assert.deepEqual([F.id, F.title, F.aria], ['blocks->frame', 'bdd [Model] E-bike: blocks [E-bike blocks]', 'Block definition diagram of model E-bike: blocks: E-bike blocks']);
  assert.match(s, /<g class="family" data-family="blocks-&gt;frame" role="img" aria-label="Block definition diagram of model E-bike: blocks: E-bike blocks">/);
  assert.deepEqual(['ebike', 'charge-interface', 'range-equation', 'energy'].map(id => n(id).stereotypes), [['block'], ['interfaceBlock'], ['constraintBlock'], ['valueType']]);
  const comps = id => n(id).compartments.map(c => [c.name, c.title, c.members.map(m => m.label)]);
  assert.deepEqual(comps('ebike'), [['parts', true, ['battery', 'controller', 'motor', 'wheels']], ['references', true, ['dock']], ['constraints', true, ['rangeEq']]]);
  assert.deepEqual(comps('battery'), [['values', true, ['capacity', 'cellVoltage']], ['ports', true, ['charge']]]);
  assert.deepEqual(comps('charge-interface'), [['flow properties', true, ['in dc', 'out stateOfCharge']]]);
  assert.deepEqual(comps('range-equation'), [['constraints', true, ['{range = energy / consumption}']], ['parameters', true, ['range', 'energy', 'consumption']]]);
  assert.deepEqual(comps('energy'), [['quantity', true, ['unit = Wh', 'quantityKind = energy']]]);
  assert.deepEqual(comps('controller'), [['operations', true, ['setAssistLevel']]]);
  assert.deepEqual(comps('rental-vehicle'), [], 'an empty compartment is not drawn');
  // a member of a type of no SysML kind (member-kinds refuses it) is drawn in the last compartment and counted, not hidden
  const o = structuredClone(M17); by(o, 'motor').members.push({ id: 'motor.torque', type: 'uml.Property', label: 'torque', props: { valueType: 'Real' } }, { id: 'motor.go', type: 'uml.Reception', label: 'go' });
  const go = layout(o, V).byId.motor; assert.deepEqual(go.compartments.map(c => [c.name, c.members.map(m => m.label)]), [['values', ['ratedPower']], ['other members', ['torque', 'go']]]);
  assert.equal(go.aria, 'Block Motor, 1 value, 2 other members'); assert.match(describe(o, V), /Block Motor, 1 value, 2 other members\./);
  // a view naming an id that is no node, with a line to it: laid out in its frame and checked, not thrown; validate() names it
  const d = { schemaVersion: 2, root: 'v', nodes: [B('a', 'A')], edges: [{ id: 'x', type: 'uml.Association', from: 'a', to: 'zz' }], views: [{ id: 'v', diagram: 'sysml.block-definition', nodeIds: ['a', 'zz'] }] };
  const gd = layout(d, 'v'); assert.deepEqual([gd.nodes.map(x => x.id), gd.families.map(f => f.shape)], [['a'], ['sysml-frame']]); assert.deepEqual(check(d, 'v'), []);
  assert.ok(validate(d).length > 0);
  // every compartment drawn with its title, a muted centred row
  const titles = [...s.matchAll(/class="c-title"[^>]*>([^<]+)</g)].map(x => x[1]);
  assert.deepEqual(titles.sort(), ['constraints', 'constraints', 'flow properties', 'operations', 'parameters', 'parts', 'ports', 'ports', 'quantity', 'quantity', 'references', 'values', 'values'].sort());
  for (const row of ['battery: Battery [1]', 'cellVoltage: Voltage [10]', 'charge: ~ChargeInterface', 'in dc: DCPower', '{range = energy / consumption}', 'unit = Wh', 'setAssistLevel(level: Integer)']) assert.match(s, new RegExp(`class="c-row"[^>]*>${row.replace(/[{}()[\]]/g, '\\$&')}</`), row);
  // a proxy and a full port, a value's default
  const m = structuredClone(M17); mem(m, 'dock.charge').props.kind = 'proxy'; mem(m, 'battery.charge').props.kind = 'full'; mem(m, 'motor.ratedPower').props.default = '250';
  const h = svgOf(layout(m, V));
  for (const row of ['«proxy» charge: ~ChargeInterface', '«full» charge: ChargeInterface', 'ratedPower: Power = 250']) assert.ok(h.includes(`>${row}</text>`), row);
  // collapsed by present, as in the class type; a stored stereotype after the keyword
  const c = structuredClone(M17); c.views[0].present = { ebike: { collapsed: ['parts'] } }; by(c, 'ebike').props = { stereotypes: ['vehicle'] };
  const gc = layout(c, V); assert.deepEqual(gc.byId.ebike.compartments.map(x => x.name).filter(x => !gc.byId.ebike.collapsed.includes(x)), ['references', 'constraints']);
  assert.deepEqual(gc.byId.ebike.stereotypes, ['block', 'vehicle']); assert.equal(gc.byId.ebike.aria, 'Block EBike (vehicle), 4 parts, 1 reference, 1 constraint');
  // the class type's lines and legend
  const edge = id => g.edges.find(e => e.id === id);
  assert.deepEqual(edge('ebike-battery').end, { from: 'filled-diamond', to: 'none', labels: { from: { role: undefined, mult: '0..1' }, to: { role: 'battery', mult: '1' } } });
  assert.deepEqual(edge('ebike-is-rental-vehicle').end, { from: 'none', to: 'triangle' });
  assert.equal(edge('dock-uses-charge-interface').label, '«use»');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Association', 'Generalization', 'Dependency', 'Composition']);
});

test('the frame (§5): a package subject is the frame, its id the package\'s, no box of its own, what it owns laid out in it; a package it holds is a box inside the frame', () => {
  const m = structuredClone(M17);
  m.nodes.push({ id: 'eb', type: 'uml.Package', label: 'E-bike' }, { id: 'power', type: 'uml.Package', label: 'power', parent: 'eb' });
  ['ebike', 'motor', 'controller', 'dock', 'rental-vehicle', 'charge-interface', 'range-equation', 'voltage', 'energy'].forEach(id => { by(m, id).parent = 'eb'; });
  by(m, 'battery').parent = 'power'; Object.assign(m.views[0], { subject: 'eb' }); m.views[0].nodeIds.push('eb', 'power');
  assert.deepEqual(validate(m), []);
  for (const d of ['down', 'right']) { const g = layout(withDir(m, d), V);
    assert.deepEqual(check(withDir(m, d), V), [], d);
    assert.deepEqual(g.families.map(f => [f.id, f.shape, f.parent ?? null]), [['eb', 'sysml-frame', null], ['power', 'package', 'eb']], d);
    const F = g.families[0], P = g.families[1];
    assert.equal(F.title, 'bdd [Package] E-bike [E-bike blocks]'); assert.ok(!g.byId.eb, 'the subject is no card');
    assert.ok(inside(g.byId.battery, P) && inside(P, F) && g.nodes.every(n => inside(n, F)), d);
    assert.equal(g.byId.battery.label, 'Battery', 'named from the subject, the box it is in'); }
  assert.deepEqual(T.boxes(m, m.views[0]).map(b => [b.id, b.nodeIds]), [['eb', ['rental-vehicle', 'ebike', 'motor', 'controller', 'dock', 'charge-interface', 'range-equation', 'voltage', 'energy']], ['power', ['battery']]]);
  // with no subject, a package is a box in the frame; its block named as the package holds it
  const n = structuredClone(m); delete n.views[0].subject; n.views[0].nodeIds = n.views[0].nodeIds.filter(id => id !== 'eb');
  const g = layout(n, V); assert.deepEqual(g.families.map(f => [f.id, f.parent ?? null]), [['blocks->frame', null], ['power', 'blocks->frame']]);
  assert.equal(g.byId.motor.label, 'E-bike::Motor', 'qualified by the owner the view does not show');
  assert.deepEqual(T.owners(n, by(n, 'battery')).map(o => o.id), ['eb', 'power'], 'a block\'s Owner field offers the packages');
});

test('names (§13), the reading order and describe(): the frame, then each element in reading order, then each line; the PDF\'s word, rows and a line\'s text', () => {
  const g = layout(M17, V), s = svgOf(g);
  assert.equal(g.byId.ebike.aria, 'Block EBike, 4 parts, 1 reference, 1 constraint');
  assert.equal(g.byId['range-equation'].aria, 'Constraint block RangeEquation, {range = energy / consumption}, 3 parameters');
  assert.equal(g.byId.energy.aria, 'Value type Energy, unit = Wh, quantityKind = energy');
  assert.equal(g.byId['charge-interface'].aria, 'Interface block ChargeInterface, 2 flow properties');
  assert.match(s, /data-shape="classifier" tabindex="-1" role="img" aria-label="Block EBike, 4 parts, 1 reference, 1 constraint"/, 'the drawn node says it (ariaOwn)');
  assert.deepEqual(g.order, ['blocks->frame', ...M17.views[0].nodeIds, ...M17.edges.map(e => e.id)]);
  const d = describe(M17, V).split('\n');
  assert.deepEqual(d.slice(0, 3), ['E-bike blocks: a block definition diagram of 10 elements and 5 lines.', 'Block definition diagram of model E-bike: blocks: E-bike blocks.', 'Block RentalVehicle.']);
  assert.equal(d[3], 'Block EBike, 4 parts, 1 reference, 1 constraint.');
  assert.equal(d.at(-1), 'Dependency from Dock to ChargeInterface: «use».');
  assert.equal(d.length, 2 + 10 + 5);
  assert.deepEqual(['ebike', 'charge-interface', 'range-equation', 'energy', 'nowhere'].map(id => T.word(M17, id)), ['Block', 'Interface block', 'Constraint block', 'Value type', null]);
  assert.deepEqual(T.rows(M17, M17.views[0], 'ebike'), ['parts: battery: Battery [1]', 'parts: controller: Controller [1]', 'parts: motor: Motor [1]', 'parts: wheels: Wheel [2]', 'references: dock: Dock [0..1]', 'constraints: rangeEq: RangeEquation']);
  assert.deepEqual(T.rows(M17, M17.views[0], 'range-equation').slice(0, 2), ['constraints: {range = energy / consumption}', 'parameters: range: Distance']);
  assert.deepEqual(T.rows(M17, M17.views[0], 'voltage'), ['quantity: unit = V', 'quantity: quantityKind = voltage']);
  assert.equal(T.rows(M17, M17.views[0], 'nowhere'), null);
  assert.equal(T.text(M17, M17.views[0], 'ebike-battery'), '[0..1] · battery [1]');
  assert.equal(T.text(M17, M17.views[0], 'dock-uses-charge-interface'), '«use»');
  assert.equal(T.text(M17, M17.views[0], 'ebike-is-rental-vehicle'), null);
});

// ---- §7.3: validators, each with a passing and a failing case (the example passes every one)
const BREAKS = {
  'part-type': m => { mem(m, 'ebike.wheels').props.valueType = 'Energy'; return ['ebike', 'ebike.wheels']; },
  'value-type': m => { mem(m, 'battery.capacity').props.valueType = 'Motor'; return ['battery', 'battery.capacity']; },
  'constraint-type': m => { mem(m, 'ebike.rangeEq').props.valueType = 'Battery'; return ['ebike', 'ebike.rangeEq']; },
  'flow-direction': m => { mem(m, 'charge-interface.dc').props.direction = 'up'; return ['charge-interface', 'charge-interface.dc']; },
  'port-kind': m => { mem(m, 'battery.charge').props.kind = 'full'; return ['battery', 'battery.charge']; },
  'member-kinds': m => { by(m, 'range-equation').members.push(P('range-equation.flow', 'FlowProperty', 'flow', { direction: 'in' })); return ['range-equation', 'range-equation.flow']; },
  'general-kinds': m => { m.edges.push({ id: 'g', type: 'uml.Generalization', from: 'energy', to: 'battery' }); return ['g', 'energy', 'battery']; },
  'part-agrees': m => { mem(m, 'ebike.motor').props.multiplicity = '2'; return ['ebike-motor', 'ebike.motor']; },
  'part-unlisted': m => { m.edges.find(e => e.id === 'ebike-motor').props.ends.to.role = 'engine'; return ['ebike-motor', 'ebike']; },
};
const WARN = ['part-type', 'value-type', 'part-agrees', 'part-unlisted'];
test('validators (§7.3): the example breaks none; each rule fails on a model that breaks it, naming its rule and its elements, at its level, through validate() too', () => {
  assert.deepEqual(bdProblems(M17), []); assert.deepEqual(T.validate(M17, M17.views[0]), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(M17), ids = broke(m), got = bdProblems(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, WARN.includes(rule) ? 'warning' : 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  assert.equal(bdProblems((m => (BREAKS['part-type'](m), m))(structuredClone(M17)))[0].message, 'part-type: part "EBike".wheels is typed by "Energy", a value type, not a block');
  assert.equal(bdProblems((m => (BREAKS['part-agrees'](m), m))(structuredClone(M17)))[0].message, 'part-agrees: ebike-motor\'s part end (Motor [1]) and part "EBike".motor (Motor [2]) differ');
});

test('validators (§7.3), the cases around each rule: what passes and what fails beyond the example', () => {
  const base = (members, more = []) => ({ schemaVersion: 2, nodes: [B('b', 'B', members), B('w', 'Wheel'), { id: 'ib', type: 'sysml.InterfaceBlock', label: 'Plug' }, { id: 'cb', type: 'sysml.ConstraintBlock', label: 'Eq' }, { id: 'vt', type: 'sysml.ValueType', label: 'Mass' }, ...more], edges: [], views: [{ id: 'v', diagram: 'sysml.block-definition', nodeIds: ['b'] }] });
  const rules = (members, more) => bdProblems(base(members, more)).map(p => p.rule);
  // passing: a part of a block or of no element; a reference of a block; a value of a value type, a primitive or no element; proxy of an interface block (conjugated too); full of a block; no kind
  assert.deepEqual(rules([P('b.a', 'PartProperty', 'a', { valueType: 'Wheel' }), P('b.x', 'PartProperty', 'x', { valueType: 'Unknown' }), P('b.r', 'ReferenceProperty', 'r', { valueType: 'Wheel' }),
    P('b.m', 'ValueProperty', 'm', { valueType: 'Mass' }), P('b.n', 'ValueProperty', 'n', { valueType: 'Real' }), P('b.o', 'ValueProperty', 'o', { valueType: 'Kilo' }), P('b.c', 'ConstraintProperty', 'c', { valueType: 'Eq' }),
    P('b.p', 'Port', 'p', { kind: 'proxy', valueType: 'Plug' }), P('b.q', 'Port', 'q', { kind: 'proxy', valueType: '~Plug' }), P('b.f', 'Port', 'f', { kind: 'full', valueType: 'Wheel' }), P('b.g', 'Port', 'g'),
    P('b.fl', 'FlowProperty', 'fl', { direction: 'inout' })]), []);
  // failing, one each
  assert.deepEqual(rules([P('b.a', 'ReferenceProperty', 'a', { valueType: 'Eq' })]), ['part-type']);
  assert.deepEqual(rules([P('b.c', 'ConstraintProperty', 'c')]), ['constraint-type'], 'untyped');
  assert.deepEqual(rules([P('b.c', 'ConstraintProperty', 'c', { valueType: 'Nothing' })]), ['constraint-type'], 'naming nothing');
  assert.deepEqual(rules([P('b.fl', 'FlowProperty', 'fl')]), ['flow-direction'], 'no direction');
  assert.deepEqual(rules([P('b.p', 'Port', 'p', { kind: 'proxy', valueType: 'Wheel' })]), ['port-kind'], 'a proxy port typed by a block');
  assert.deepEqual(rules([P('b.p', 'Port', 'p', { kind: 'proxy' })]), ['port-kind'], 'an untyped proxy port');
  assert.deepEqual(rules([P('b.p', 'Port', 'p', { kind: 'flow' })]), ['port-kind'], 'a flow port (left out, §17)');
  assert.deepEqual(rules([P('b.k', 'ConstraintParameter', 'k')]), ['member-kinds'], 'a parameter in a block');
  assert.deepEqual(rules([], [{ id: 'ib2', type: 'sysml.InterfaceBlock', label: 'I', members: [P('ib2.a', 'PartProperty', 'a', { valueType: 'Wheel' }), P('ib2.p', 'Port', 'p', { kind: 'full' }), P('ib2.f', 'FlowProperty', 'f', { direction: 'in' }), P('ib2.q', 'Port', 'q', { kind: 'proxy', valueType: 'Plug' }), { id: 'ib2.o', type: 'uml.Operation', label: 'o' }] }]),
    ['member-kinds', 'member-kinds'], 'an interface block holds no part and no full port');
  assert.deepEqual(rules([], [{ id: 'ib3', type: 'sysml.InterfaceBlock', label: 'I3', members: [P('ib3.p', 'Port', 'p')] }]), ['member-kinds'], 'an interface block holds proxy ports only, not a plain one (clause 9)');
  assert.deepEqual(rules([], [{ id: 'vt3', type: 'sysml.ValueType', label: 'V3', members: [P('vt3.v', 'ValueProperty', 'v', { valueType: 'Real' }), { id: 'vt3.o', type: 'uml.Operation', label: 'o' }] }]), [], 'a value type holds values and operations');
  assert.deepEqual(rules([], [{ id: 'vt4', type: 'sysml.ValueType', label: 'V4', members: [P('vt4.a', 'PartProperty', 'a', { valueType: 'Wheel' }), P('vt4.p', 'Port', 'p', { kind: 'full' })] }]), ['member-kinds', 'member-kinds'], 'a value type holds no part and no port');
  assert.deepEqual(rules([{ id: 'b.t', type: 'uml.Property', label: 't', props: { valueType: 'Real' } }, { id: 'b.r', type: 'uml.Reception', label: 'go' }]), ['member-kinds', 'member-kinds'], 'a block holds no member of a type of no SysML kind');
  assert.deepEqual(rules([], [{ id: 'cb2', type: 'sysml.ConstraintBlock', label: 'E', members: [P('cb2.v', 'ValueProperty', 'v'), P('cb2.k', 'ConstraintParameter', 'k'), P('cb2.c', 'ConstraintProperty', 'c', { valueType: 'Eq' })] }]), ['member-kinds'], 'a constraint block holds no value');
  assert.deepEqual(rules([], [{ id: 'vt2', type: 'sysml.ValueType', label: 'V', members: [P('vt2.f', 'FlowProperty', 'f', { direction: 'in' })] }]), ['member-kinds'], 'a value type holds no flow property');
  // general-kinds: one kind passes; a UML class specializing a block fails here, and the class rule leaves it (S20)
  const gen = (a, b) => { const m = base([], [{ id: 'u', type: 'uml.Class', label: 'U' }, B('b2', 'B2')]); m.edges.push({ id: 'g', type: 'uml.Generalization', from: a, to: b }); return m; };
  assert.deepEqual(bdProblems(gen('b2', 'b')), []); assert.deepEqual(bdProblems(gen('u', 'b')).map(p => p.rule), ['general-kinds']);
  assert.deepEqual(classProblems(gen('u', 'b')), [], 'the class rule leaves an end of another notation'); assert.deepEqual(classProblems(gen('vt', 'b')), []);
  // part-agrees and part-unlisted: a composite end at either end; a shared end is not judged
  const asc = (ends, members = [P('b.w', 'PartProperty', 'w', { valueType: 'Wheel', multiplicity: '1' })], [from, to] = ['b', 'w']) => { const m = base(members); m.edges.push({ id: 'a', type: 'uml.Association', from, to, props: { ends } }); return bdProblems(m).map(p => p.rule); };
  assert.deepEqual(asc({ from: { aggregation: 'composite' }, to: { role: 'w' } }), [], 'an unset multiplicity is 1 on both');
  assert.deepEqual(asc({ to: { aggregation: 'composite' }, from: { role: 'w' } }, undefined, ['w', 'b']), [], 'the whole at the to end');
  assert.deepEqual(asc({ to: { aggregation: 'composite' }, from: { role: 'w' } }, [], ['w', 'b']), ['part-unlisted'], 'the whole at the to end, holding no part w');
  assert.deepEqual(asc({ from: { aggregation: 'composite' }, to: { role: 'w', multiplicity: '0..1' } }), ['part-agrees']);
  assert.deepEqual(asc({ from: { aggregation: 'composite' }, to: {} }), ['part-unlisted'], 'no role');
  assert.deepEqual(asc({ from: { aggregation: 'composite' }, to: { role: 'w' } }, [P('b.w', 'ValueProperty', 'w')]), ['part-unlisted'], 'its role names a value');
  assert.deepEqual(asc({ from: { aggregation: 'shared' }, to: { role: 'x' } }), [], 'a shared end is a reference: not judged');
  assert.deepEqual(asc({ from: { aggregation: 'composite' }, to: { role: 'e' } }, [P('b.e', 'ConstraintProperty', 'e', { valueType: 'Eq' })], ['b', 'cb']), [], 'to a constraint block, its role names a constraint property');
});

// ---- §7.4: members as text, the panel's rows, connect
test('member rows (§7.4): a keyword picks the kind, the type picks it with none; print(parse(x)) is stable; a kind the owner may not hold refused (member-kinds)', () => {
  const rows = ['part battery: Battery [1]', 'ref dock: Dock [0..1]', 'value capacity: Energy = 500', 'constraint rangeEq: RangeEquation', 'port charge: ChargeInterface', 'proxy port charge: ~ChargeInterface',
    'full port socket: Socket', 'in dc: DCPower', 'out level: Percent', 'inout data: Bytes', 'param range: Distance', 'setAssistLevel(level: Integer): Boolean', 'value + {static} /total: Real [0..1]'];
  for (const x of rows) { const r = bdParse(x); assert.ok(!r.error, x); assert.equal(bdPrint({ id: 'm', ...r }), x, x); }
  assert.deepEqual(bdParse('proxy  port c: ~I'), { type: 'sysml.Port', label: 'c', props: { valueType: '~I', kind: 'proxy' } });
  assert.deepEqual(bdParse('inout x: T').props, { valueType: 'T', direction: 'inout' }); assert.equal(bdParse('in x').type, 'sysml.FlowProperty');
  assert.equal(bdParse('parts: Battery').type, 'sysml.ValueProperty', 'a name that starts as a keyword is a name');
  // no keyword: the model's names pick the kind
  assert.deepEqual(['b: Battery', 'r: RangeEquation', 'e: Energy', 'x: Nothing', 'go()'].map(x => bdParse(x, null, M17).type), ['sysml.PartProperty', 'sysml.ConstraintProperty', 'sysml.ValueProperty', 'sysml.ValueProperty', 'uml.Operation']);
  // an owner that may not hold it
  assert.deepEqual(bdParse('part p: Battery', by(M17, 'range-equation'), M17), { error: 'member-kinds: constraint block RangeEquation holds no part' });
  assert.deepEqual(bdParse('full port p: X', by(M17, 'charge-interface'), M17), { error: 'member-kinds: interface block ChargeInterface holds no full port' });
  assert.match(bdParse('part battery Battery').error, /is not a member/);
  // a stored direction or kind none of SysML's is printed as stored, so the row does not parse back unchanged; no direction is inout, SysML's default
  for (const [m, x] of [[P('f', 'FlowProperty', 'dc', { valueType: 'X', direction: 'sideways' }), 'sideways dc: X'], [P('p', 'Port', 'p', { kind: 'odd' }), 'odd port p'], [P('f', 'FlowProperty', 'dc', { valueType: 'X' }), 'inout dc: X']]) {
    assert.equal(bdPrint(m), x); assert.equal(!!bdParse(x).error, x !== 'inout dc: X', x); }
  // the printed rows of the example, then what the panel shows
  assert.deepEqual(by(M17, 'battery').members.map(T.member.print), ['value capacity: Energy', 'value cellVoltage: Voltage [10]', 'port charge: ChargeInterface']);
  assert.equal(T.member.print(by(M17, 'controller').members[0]), 'setAssistLevel(level: Integer)');
});

test('the panel\'s member rows (edits.member): New member adds the kind read, a row edited sets its kind, name and props in one transaction; errors said, nothing applied', () => {
  const add = (owner, text) => T.edits.member(M17, M17.views[0], owner, null, text);
  assert.deepEqual(add('motor', 'value torque: Torque [1]'), [{ op: 'add', element: { id: 'motor.torque', type: 'sysml.ValueProperty', label: 'torque', props: { valueType: 'Torque', multiplicity: '1' } }, owner: 'motor' }]);
  assert.deepEqual(add('ebike', 'battery: Battery')[0].element, { id: 'ebike.battery2', type: 'sysml.PartProperty', label: 'battery', props: { valueType: 'Battery' } }, 'the type picks part; a fresh id');
  assert.deepEqual(add('range-equation', 'value v: Real'), { error: 'member-kinds: constraint block RangeEquation holds no value' });
  assert.equal(T.edits.member(M17, M17.views[0], 'nowhere', null, 'x'), null); assert.equal(T.edits.member({ ...M17, nodes: [...M17.nodes, { id: 'c', type: 'uml.Comment' }] }, M17.views[0], 'c', null, 'x'), null);
  const r = T.edits.member(M17, M17.views[0], 'ebike', 'ebike.dock', 'part dock: Dock [1]');
  assert.deepEqual(r.commands, [{ op: 'set', id: 'ebike.dock', path: 'type', value: 'sysml.PartProperty' }, { op: 'set', id: 'ebike.dock', path: 'label', value: 'dock' }, { op: 'set', id: 'ebike.dock', path: 'props', value: { valueType: 'Dock', multiplicity: '1' } }]);
  const m = apply(M17, r.commands); assert.equal(mem(m, 'ebike.dock').type, 'sysml.PartProperty');
  assert.deepEqual(layout(m, V).byId.ebike.compartments.map(c => c.name), ['parts', 'constraints']);
  const k = T.edits.member(M17, M17.views[0], 'dock', 'dock.charge', 'proxy port charge: ~ChargeInterface').commands;
  assert.deepEqual(k, [{ op: 'set', id: 'dock.charge', path: 'label', value: 'charge' }, { op: 'set', id: 'dock.charge', path: 'props', value: { valueType: '~ChargeInterface', kind: 'proxy' } }]);
  assert.deepEqual(validate(apply(M17, k)), []);
  const s = structuredClone(M17); mem(s, 'motor.ratedPower').props.stereotypes = ['measured'];
  assert.deepEqual(T.edits.member(s, s.views[0], 'motor', 'motor.ratedPower', 'value ratedPower: Power = 250').commands.at(-1).value, { stereotypes: ['measured'], valueType: 'Power', default: '250' }, 'props the syntax does not write are kept');
  // the model-less fallbacks the panel uses when no hook answers
  assert.deepEqual(T.member.add('part p: X', by(M17, 'ebike')), { type: 'sysml.PartProperty', label: 'p', props: { valueType: 'X' } });
  assert.deepEqual(T.member.edit(mem(M17, 'ebike.wheels'), 'wheels: Wheel [3]').commands[0], { op: 'set', id: 'ebike.wheels', path: 'type', value: 'sysml.ValueProperty' });
});

test('connect (§7.4): a part association adds the part property it draws, named by its role, and validates clean; a generalization of two kinds and a comment link from a block refused; the rest the default', () => {
  const v = M17.views[0], c = (from, to, i) => T.edits.connect(M17, v, from, to, null, T.lines[i]);
  const r = c('motor', 'battery', 0);
  assert.deepEqual(r, [{ op: 'add', element: { id: 'motor.battery', type: 'sysml.PartProperty', label: 'battery', props: { valueType: 'Battery', multiplicity: '1' } }, owner: 'motor' },
    { op: 'add', element: { id: 'association1', type: 'uml.Association', from: 'motor', to: 'battery', props: { ends: { from: { aggregation: 'composite' }, to: { role: 'battery', multiplicity: '1' } } } }, view: 'blocks' }]);
  const m = apply(M17, r); assert.deepEqual(validate(m), []);
  assert.deepEqual(layout(m, V).byId.motor.compartments[0].members.map(x => x.label), ['battery']);
  assert.equal(c('ebike', 'battery', 0)[0].element.label, 'battery2', 'a role not taken');
  assert.deepEqual(c('range-equation', 'battery', 0), { error: 'A constraint block holds no part' });
  const k = c('ebike', 'range-equation', 0); // to a constraint block: a constraint property (SysML's composition to a constraint block)
  assert.deepEqual(k[0].element, { id: 'ebike.rangeEquation', type: 'sysml.ConstraintProperty', label: 'rangeEquation', props: { valueType: 'RangeEquation', multiplicity: '1' } });
  assert.deepEqual(validate(apply(M17, k)), []);
  assert.deepEqual(c('ebike', 'energy', 0), { error: 'A part association ends at a block or a constraint block, not value type' });
  assert.deepEqual(c('ebike', 'charge-interface', 0), { error: 'A part association ends at a block or a constraint block, not interface block' });
  assert.deepEqual(c('energy', 'battery', 0), { error: 'A value type holds no part' });
  assert.equal(c('motor', 'battery', 1), null, 'a reference association: the default');
  assert.deepEqual(c('energy', 'battery', 2), { error: 'A generalization joins two of one kind: value type and block differ' });
  assert.equal(c('motor', 'rental-vehicle', 2), null); assert.equal(c('dock', 'charge-interface', 3), null);
  assert.deepEqual(c('dock', 'battery', 4), { error: 'A comment link runs from a comment' });
  assert.equal(c('nowhere', 'battery', 0), null);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: B(`b${i}`, `Part${i}`, [P(`b${i}.mass`, 'ValueProperty', 'mass', { valueType: 'Real' })]), view: V }],
    [{ op: 'add', element: { id: `t${i}`, type: 'sysml.ValueType', label: `Unit${i}`, props: { unit: 'kg' } }, view: V }],
    [{ op: 'add', element: { id: `g${i}`, type: 'uml.Generalization', from: `b${i}`, to: 'rental-vehicle' }, view: V }],
    [{ op: 'add', element: P(`b${i}.port`, 'Port', 'port', { kind: 'proxy', valueType: 'ChargeInterface' }), owner: `b${i}` }],
    [[{ op: 'set', id: `t${i}`, path: 'props.quantityKind', value: 'mass' }], [{ op: 'set', id: 'range-equation', path: 'props.constraint', value: `range = energy / consumption * ${i}` }], [{ op: 'set', id: `b${i}`, path: 'label', value: `Renamed${i}` }]][i % 3],
    [[{ op: 'hide', id: `b${i}`, view: V }], [{ op: 'delete', id: `t${i}` }], [{ op: 'set', id: `b${i}.port`, path: 'props.kind', value: 'full' }, { op: 'set', id: `b${i}.port`, path: 'props.valueType', value: 'Battery' }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(M17), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, draw = (m, o) => unid(mapContext(m, o).buildView(V).markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos[V].runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, V), describe(JSON.parse(seen[30]), V));
});

// §14: 50 blocks, 57 lines: a tree of 49 part associations, each with its part property, and 8 generalizations; each block
// with a value and a port
const STRESS = (() => {
  const nodes = [], edges = [];
  for (let i = 0; i < 50; i++) nodes.push(B(`b${i}`, `Block${i}`, [P(`b${i}.mass`, 'ValueProperty', 'mass', { valueType: 'Real' }), P(`b${i}.io`, 'Port', 'io', { valueType: 'Plug' })]));
  for (let i = 1; i < 50; i++) { const w = (i - 1) >> 1; nodes[w].members.push(P(`b${w}.p${i}`, 'PartProperty', `p${i}`, { valueType: `Block${i}`, multiplicity: '1' }));
    edges.push({ id: `a${i}`, type: 'uml.Association', from: `b${w}`, to: `b${i}`, props: { ends: { from: { aggregation: 'composite' }, to: { role: `p${i}`, multiplicity: '1' } } } }); }
  for (let i = 0; i < 8; i++) edges.push({ id: `g${i}`, type: 'uml.Generalization', from: `b${42 + i}`, to: `b${i}` });
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'sysml.block-definition', nodeIds: nodes.map(n => n.id) }] };
})();
test('P1 (§14): on 50 blocks and 57 lines, a full layout, a value row added to a block and a block renamed, laid out and drawn under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of seven) (timed)', () => {
  assert.equal(STRESS.nodes.length, 50); assert.equal(STRESS.edges.length, 57); assert.deepEqual(validate(STRESS), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(STRESS);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => ({ full: timed(() => mapContext(STRESS).buildView('all')),
    value: timed(() => draw(apply(STRESS, [{ op: 'add', element: P(`b7.v${k}`, 'ValueProperty', `v${k}`, { valueType: 'Real' }), owner: 'b7' }]))),
    rename: timed(() => draw(apply(STRESS, [{ op: 'set', id: 'b9', path: 'label', value: 'Renamed'.repeat(1 + k) }]))) }));
  const best = k => Math.min(...runs.map(r => r[k]));
  for (const k of ['full', 'value', 'rename']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  console.log(`# P1 target 100 ms: a value row added ${best('value').toFixed(1)} ms, a block renamed ${best('rename').toFixed(1)} ms; full layout ${best('full').toFixed(1)} ms`);
});
