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
import { readFileSync } from 'node:fs';
import '../src/sysml/internal.js';
import '../src/sysml/parametric.js';
import '../src/uml/profile.js';
import '../src/uml/usecase.js';
import { classProblems } from '../src/uml/class.js';
import { BD_RULES, bdProblems, bdParse, bdPrint } from '../src/sysml/blocks.js';

const T = diagramOf({ diagram: 'sysml.block-definition' }), V = 'blocks';
const M17 = {"schemaVersion":2,"title":"Cargo e-bike: blocks","root":"blocks","nodes":[{"id":"delivery-vehicle","type":"sysml.Block","label":"DeliveryVehicle"},{"id":"ebike","type":"sysml.Block","label":"CargoBike","members":[{"id":"ebike.battery","type":"sysml.PartProperty","label":"battery","props":{"valueType":"Battery","multiplicity":"1"}},{"id":"ebike.controller","type":"sysml.PartProperty","label":"controller","props":{"valueType":"Controller","multiplicity":"1"}},{"id":"ebike.motor","type":"sysml.PartProperty","label":"motor","props":{"valueType":"Motor","multiplicity":"1"}},{"id":"ebike.wheels","type":"sysml.PartProperty","label":"wheels","props":{"valueType":"Wheel","multiplicity":"2"}},{"id":"ebike.dock","type":"sysml.ReferenceProperty","label":"dock","props":{"valueType":"Dock","multiplicity":"0..1"}},{"id":"ebike.rangeEq","type":"sysml.ConstraintProperty","label":"rangeEq","props":{"valueType":"RangeEquation"}}]},{"id":"battery","type":"sysml.Block","label":"Battery","members":[{"id":"battery.capacity","type":"sysml.ValueProperty","label":"capacity","props":{"valueType":"Energy"}},{"id":"battery.cellVoltage","type":"sysml.ValueProperty","label":"cellVoltage","props":{"valueType":"Voltage","multiplicity":"10"}},{"id":"battery.charge","type":"sysml.Port","label":"charge","props":{"valueType":"ChargeInterface"}}]},{"id":"motor","type":"sysml.Block","label":"Motor","members":[{"id":"motor.ratedPower","type":"sysml.ValueProperty","label":"ratedPower","props":{"valueType":"Power"}}]},{"id":"controller","type":"sysml.Block","label":"Controller","members":[{"id":"controller.setAssistLevel","type":"uml.Operation","label":"setAssistLevel","props":{"parameters":[{"name":"level","valueType":"Integer"}]}}]},{"id":"dock","type":"sysml.Block","label":"Dock","members":[{"id":"dock.charge","type":"sysml.Port","label":"charge","props":{"valueType":"~ChargeInterface"}}]},{"id":"charge-interface","type":"sysml.InterfaceBlock","label":"ChargeInterface","members":[{"id":"charge-interface.dc","type":"sysml.FlowProperty","label":"dc","props":{"valueType":"DCPower","direction":"in"}},{"id":"charge-interface.stateOfCharge","type":"sysml.FlowProperty","label":"stateOfCharge","props":{"valueType":"Percent","direction":"out"}}]},{"id":"range-equation","type":"sysml.ConstraintBlock","label":"RangeEquation","props":{"constraint":"range = energy / consumption"},"members":[{"id":"range-equation.range","type":"sysml.ConstraintParameter","label":"range","props":{"valueType":"Distance"}},{"id":"range-equation.energy","type":"sysml.ConstraintParameter","label":"energy","props":{"valueType":"Energy"}},{"id":"range-equation.consumption","type":"sysml.ConstraintParameter","label":"consumption","props":{"valueType":"EnergyPerDistance"}}]},{"id":"voltage","type":"sysml.ValueType","label":"Voltage","props":{"unit":"V","quantityKind":"voltage"}},{"id":"energy","type":"sysml.ValueType","label":"Energy","props":{"unit":"Wh","quantityKind":"energy"}}],"edges":[{"id":"ebike-battery","type":"uml.Association","from":"ebike","to":"battery","props":{"ends":{"from":{"aggregation":"composite","multiplicity":"0..1"},"to":{"role":"battery","multiplicity":"1"}}}},{"id":"ebike-motor","type":"uml.Association","from":"ebike","to":"motor","props":{"ends":{"from":{"aggregation":"composite","multiplicity":"1"},"to":{"role":"motor","multiplicity":"1"}}}},{"id":"ebike-controller","type":"uml.Association","from":"ebike","to":"controller","props":{"ends":{"from":{"aggregation":"composite","multiplicity":"1"},"to":{"role":"controller","multiplicity":"1"}}}},{"id":"ebike-is-delivery-vehicle","type":"uml.Generalization","from":"ebike","to":"delivery-vehicle"},{"id":"dock-uses-charge-interface","type":"uml.Dependency","from":"dock","to":"charge-interface","props":{"stereotypes":["use"]}}],"views":[{"id":"blocks","diagram":"sysml.block-definition","title":"Cargo bike blocks","parent":null,"direction":"down","nodeIds":["delivery-vehicle","ebike","battery","motor","controller","dock","charge-interface","range-equation","voltage","energy"]}]};
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
  assert.deepEqual(Object.keys(T.edits), ['connect', 'member', 'field', 'rename']);
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
  assert.ok(g.byId['delivery-vehicle'].y + g.byId['delivery-vehicle'].h < g.byId.ebike.y, 'down: the general above its specialization');
  assert.equal(unid(svgOf(g)), unid(svgOf(layout(M17, V))), 'down by default');
  const memos = {}, first = mapContext(M17, { memos }).buildView(V), nodes = JSON.stringify(memos[V].g.nodes);
  const second = mapContext(M17, { memos }).buildView(V);
  assert.equal(memos[V].runs, 1); assert.equal(unid(second.markup), unid(first.markup)); assert.equal(JSON.stringify(memos[V].g.nodes), nodes, 'the geometry is not edited after the layout');
});

test('drawing (§7.1): the frame and its header; each kind\'s keyword over its name; every compartment titled, in SysML\'s order, the empty ones left out; rows with a port\'s kind, a flow\'s direction, an expression, a unit', () => {
  const g = layout(M17, V), s = svgOf(g), n = id => g.byId[id];
  const F = g.families.find(f => f.shape === 'sysml-frame');
  assert.deepEqual([F.id, F.title, F.aria], ['blocks->frame', 'bdd [Model] Cargo e-bike: blocks [Cargo bike blocks]', 'Block definition diagram of model Cargo e-bike: blocks: Cargo bike blocks']);
  assert.match(s, /<g class="family" data-family="blocks-&gt;frame" role="img" aria-label="Block definition diagram of model Cargo e-bike: blocks: Cargo bike blocks">/);
  assert.deepEqual(['ebike', 'charge-interface', 'range-equation', 'energy'].map(id => n(id).stereotypes), [['block'], ['interfaceBlock'], ['constraintBlock'], ['valueType']]);
  const comps = id => n(id).compartments.map(c => [c.name, c.title, c.members.map(m => m.label)]);
  assert.deepEqual(comps('ebike'), [['parts', true, ['battery', 'controller', 'motor', 'wheels']], ['references', true, ['dock']], ['constraints', true, ['rangeEq']]]);
  assert.deepEqual(comps('battery'), [['values', true, ['capacity', 'cellVoltage']], ['ports', true, ['charge']]]);
  assert.deepEqual(comps('charge-interface'), [['flow properties', true, ['in dc', 'out stateOfCharge']]]);
  assert.deepEqual(comps('range-equation'), [['constraints', true, ['{range = energy / consumption}']], ['parameters', true, ['range', 'energy', 'consumption']]]);
  assert.deepEqual(comps('energy'), [['quantity', true, ['unit = Wh', 'quantityKind = energy']]]);
  assert.deepEqual(comps('controller'), [['operations', true, ['setAssistLevel']]]);
  assert.deepEqual(comps('delivery-vehicle'), [], 'an empty compartment is not drawn');
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
  assert.deepEqual(gc.byId.ebike.stereotypes, ['block', 'vehicle']); assert.equal(gc.byId.ebike.aria, 'Block CargoBike (vehicle), 4 parts, 1 reference, 1 constraint');
  // the class type's lines and legend
  const edge = id => g.edges.find(e => e.id === id);
  assert.deepEqual(edge('ebike-battery').end, { from: 'filled-diamond', to: 'none', labels: { from: { role: undefined, mult: '0..1' }, to: { role: 'battery', mult: '1' } } });
  assert.deepEqual(edge('ebike-is-delivery-vehicle').end, { from: 'none', to: 'triangle' });
  assert.equal(edge('dock-uses-charge-interface').label, '«use»');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Association', 'Generalization', 'Dependency', 'Composition']);
});

test('the frame (§5): a package subject is the frame, its id the package\'s, no box of its own, what it owns laid out in it; a package it holds is a box inside the frame', () => {
  const m = structuredClone(M17);
  m.nodes.push({ id: 'eb', type: 'uml.Package', label: 'DeliveryFleet' }, { id: 'power', type: 'uml.Package', label: 'power', parent: 'eb' });
  ['ebike', 'motor', 'controller', 'dock', 'delivery-vehicle', 'charge-interface', 'range-equation', 'voltage', 'energy'].forEach(id => { by(m, id).parent = 'eb'; });
  by(m, 'battery').parent = 'power'; Object.assign(m.views[0], { subject: 'eb' }); m.views[0].nodeIds.push('eb', 'power');
  assert.deepEqual(validate(m), []);
  for (const d of ['down', 'right']) { const g = layout(withDir(m, d), V);
    assert.deepEqual(check(withDir(m, d), V), [], d);
    assert.deepEqual(g.families.map(f => [f.id, f.shape, f.parent ?? null]), [['eb', 'sysml-frame', null], ['power', 'package', 'eb']], d);
    const F = g.families[0], P = g.families[1];
    assert.equal(F.title, 'bdd [Package] DeliveryFleet [Cargo bike blocks]'); assert.ok(!g.byId.eb, 'the subject is no card');
    assert.ok(inside(g.byId.battery, P) && inside(P, F) && g.nodes.every(n => inside(n, F)), d);
    assert.equal(g.byId.battery.label, 'Battery', 'named from the subject, the box it is in'); }
  assert.deepEqual(T.boxes(m, m.views[0]).map(b => [b.id, b.nodeIds]), [['eb', ['delivery-vehicle', 'ebike', 'motor', 'controller', 'dock', 'charge-interface', 'range-equation', 'voltage', 'energy']], ['power', ['battery']]]);
  // with no subject, a package is a box in the frame; its block named as the package holds it
  const n = structuredClone(m); delete n.views[0].subject; n.views[0].nodeIds = n.views[0].nodeIds.filter(id => id !== 'eb');
  const g = layout(n, V); assert.deepEqual(g.families.map(f => [f.id, f.parent ?? null]), [['blocks->frame', null], ['power', 'blocks->frame']]);
  assert.equal(g.byId.motor.label, 'DeliveryFleet::Motor', 'qualified by the owner the view does not show');
  assert.deepEqual(T.owners(n, by(n, 'battery')).map(o => o.id), ['eb', 'power'], 'a block\'s Owner field offers the packages');
});

test('names (§13), the reading order and describe(): the frame, then each element in reading order, then each line; the PDF\'s word, rows and a line\'s text', () => {
  const g = layout(M17, V), s = svgOf(g);
  assert.equal(g.byId.ebike.aria, 'Block CargoBike, 4 parts, 1 reference, 1 constraint');
  assert.equal(g.byId['range-equation'].aria, 'Constraint block RangeEquation, {range = energy / consumption}, 3 parameters');
  assert.equal(g.byId.energy.aria, 'Value type Energy, unit = Wh, quantityKind = energy');
  assert.equal(g.byId['charge-interface'].aria, 'Interface block ChargeInterface, 2 flow properties');
  assert.match(s, /data-shape="classifier" tabindex="-1" role="img" aria-label="Block CargoBike, 4 parts, 1 reference, 1 constraint"/, 'the drawn node says it (ariaOwn)');
  assert.deepEqual(g.order, ['blocks->frame', ...M17.views[0].nodeIds, ...M17.edges.map(e => e.id)]);
  const d = describe(M17, V).split('\n');
  assert.deepEqual(d.slice(0, 3), ['Cargo bike blocks: a block definition diagram of 10 elements and 5 lines.', 'Block definition diagram of model Cargo e-bike: blocks: Cargo bike blocks.', 'Block DeliveryVehicle.']);
  assert.equal(d[3], 'Block CargoBike, 4 parts, 1 reference, 1 constraint.');
  assert.equal(d.at(-1), 'Dependency from Dock to ChargeInterface: «use».');
  assert.equal(d.length, 2 + 10 + 5);
  assert.deepEqual(['ebike', 'charge-interface', 'range-equation', 'energy', 'nowhere'].map(id => T.word(M17, id)), ['Block', 'Interface block', 'Constraint block', 'Value type', null]);
  assert.deepEqual(T.rows(M17, M17.views[0], 'ebike'), ['parts: battery: Battery [1]', 'parts: controller: Controller [1]', 'parts: motor: Motor [1]', 'parts: wheels: Wheel [2]', 'references: dock: Dock [0..1]', 'constraints: rangeEq: RangeEquation']);
  assert.deepEqual(T.rows(M17, M17.views[0], 'range-equation').slice(0, 2), ['constraints: {range = energy / consumption}', 'parameters: range: Distance']);
  assert.deepEqual(T.rows(M17, M17.views[0], 'voltage'), ['quantity: unit = V', 'quantity: quantityKind = voltage']);
  assert.equal(T.rows(M17, M17.views[0], 'nowhere'), null);
  assert.equal(T.text(M17, M17.views[0], 'ebike-battery'), '[0..1] · battery [1]');
  assert.equal(T.text(M17, M17.views[0], 'dock-uses-charge-interface'), '«use»');
  assert.equal(T.text(M17, M17.views[0], 'ebike-is-delivery-vehicle'), null);
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
  assert.equal(bdProblems((m => (BREAKS['part-type'](m), m))(structuredClone(M17)))[0].message, 'part-type: part "CargoBike".wheels is typed by "Energy", a value type, not a block');
  assert.equal(bdProblems((m => (BREAKS['part-agrees'](m), m))(structuredClone(M17)))[0].message, 'part-agrees: ebike-motor\'s part end (Motor [1]) and part "CargoBike".motor (Motor [2]) differ');
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
  for (const w of ['in', 'out', 'value', 'port', 'part', 'ref']) assert.deepEqual(bdParse(`${w} : Real`), bdParse(`${w}: Real`), 'a keyword named, a space before the colon');
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
  const M2 = { ...M17, nodes: [...M17.nodes, { id: 'ebike.spare', type: 'uml.Comment', label: 'x' }] }; // an id taken by an element that is no member of CargoBike
  assert.deepEqual(T.edits.member(M2, M2.views[0], 'ebike', null, 'spare: Battery')[0].element, { id: 'ebike.spare2', type: 'sysml.PartProperty', label: 'spare', props: { valueType: 'Battery' } }, 'the type picks part; a fresh id');
  assert.match(add('ebike', 'battery: Battery').error, /^member-names: "CargoBike" has a member named "battery" already/, 'a name CargoBike holds is refused (audit 39)');
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
  assert.deepEqual(T.edits.member(s, s.views[0], 'motor', 'motor.ratedPower', 'value «measured» ratedPower: Power = 250').commands.at(-1).value, { stereotypes: ['measured'], valueType: 'Power', default: '250' }, 'props the syntax does not write are kept');
  // the model-less fallbacks the panel uses when no hook answers
  assert.deepEqual(T.member.add('part p: X', by(M17, 'ebike')), { type: 'sysml.PartProperty', label: 'p', props: { valueType: 'X' } });
  assert.deepEqual(T.member.edit(mem(M17, 'ebike.wheels'), 'wheels: Wheel [3]').commands[0], { op: 'set', id: 'ebike.wheels', path: 'type', value: 'sysml.ValueProperty' });
});

test('connect (§7.4): a part association adds the part property it draws, named by its role, and validates clean; a generalization of two kinds and a comment link with no comment refused, one drawn to a comment added from it; the rest the default', () => {
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
  assert.deepEqual(c('ebike', 'energy', 0), { error: 'A part association ends at a block or a constraint block, not a value type' });
  assert.deepEqual(c('ebike', 'charge-interface', 0), { error: 'A part association ends at a block or a constraint block, not an interface block' });
  assert.deepEqual(c('energy', 'battery', 0), { error: 'A value type holds no part' });
  assert.equal(c('motor', 'battery', 1), null, 'a reference association: the default');
  assert.deepEqual(c('energy', 'battery', 2), { error: 'A generalization joins two of one kind: value type and block differ' });
  assert.equal(c('motor', 'delivery-vehicle', 2), null); assert.equal(c('dock', 'charge-interface', 3), null);
  assert.deepEqual(c('dock', 'battery', 4), { error: 'A comment link runs from a comment' });
  // audit 48: drawn from a block to a comment, added from the comment, as every other SysML view's
  const n = { ...M17, nodes: [...M17.nodes, { id: 'note', type: 'uml.Comment', label: 'a note' }], views: [{ ...v, nodeIds: [...v.nodeIds, 'note'] }] };
  assert.deepEqual(T.edits.connect(n, n.views[0], 'dock', 'note', null, T.lines[4]), [{ op: 'add', element: { id: 'commentlink1', type: 'uml.CommentLink', from: 'note', to: 'dock' }, view: 'blocks' }]);
  assert.equal(T.edits.connect(n, n.views[0], 'note', 'dock', null, T.lines[4]), null, 'from the comment: the default');
  assert.equal(c('nowhere', 'battery', 0), null);
  // audit 32: "an" before a vowel, and an end of no type named as the view draws it, a class
  const u = { ...M17, nodes: [...M17.nodes, { id: 'thing', label: 'Thing' }], views: [{ ...v, nodeIds: [...v.nodeIds, 'thing'] }] };
  assert.deepEqual(T.edits.connect(u, u.views[0], 'charge-interface', 'battery', null, T.lines[0]), { error: 'An interface block holds no part' });
  assert.deepEqual(T.edits.connect(u, u.views[0], 'ebike', 'thing', null, T.lines[0]), { error: 'A part association ends at a block or a constraint block, not a class' });
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: B(`b${i}`, `Part${i}`, [P(`b${i}.mass`, 'ValueProperty', 'mass', { valueType: 'Real' })]), view: V }],
    [{ op: 'add', element: { id: `t${i}`, type: 'sysml.ValueType', label: `Unit${i}`, props: { unit: 'kg' } }, view: V }],
    [{ op: 'add', element: { id: `g${i}`, type: 'uml.Generalization', from: `b${i}`, to: 'delivery-vehicle' }, view: V }],
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

test('audit 8: a type name names an element with no label by its id, as drawn: no false constraint-type or port-kind, real ones kept', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'RangeEq', type: 'sysml.ConstraintBlock', members: [{ id: 'p1', type: 'sysml.ConstraintParameter', label: 'r', props: { valueType: 'Real' } }] },
    { id: 'Plug', type: 'sysml.InterfaceBlock' }, { id: 'Wheel', type: 'sysml.Block' },
    { id: 'Bike', type: 'sysml.Block', label: 'Bike', members: [
      { id: 'c', type: 'sysml.ConstraintProperty', label: 'eq', props: { valueType: 'RangeEq' } },
      { id: 'pt', type: 'sysml.Port', label: 'charge', props: { kind: 'proxy', valueType: 'Plug' } },
      { id: 'fp', type: 'sysml.Port', label: 'socket', props: { kind: 'full', valueType: 'Plug' } },
      { id: 'v', type: 'sysml.ValueProperty', label: 'cap', props: { valueType: 'Wheel' } }] }],
    edges: [], views: [{ id: 'v', diagram: 'sysml.block-definition', nodeIds: ['RangeEq', 'Plug', 'Wheel', 'Bike'] }] };
  assert.deepEqual(validate(m).filter(p => p.rule).map(p => p.rule).sort(), ['port-kind', 'value-type']);
});

test('audit 12: member-names judges a SysML classifier as a class: two parts named alike are an error, an overload by parameter types is not', () => {
  const m = structuredClone(M17); by(m, 'ebike').members.push(P('ebike.battery-2', 'PartProperty', 'battery', { valueType: 'Battery' }));
  by(m, 'controller').members.push({ id: 'controller.set2', type: 'uml.Operation', label: 'setAssistLevel', props: { parameters: [{ name: 'level', valueType: 'Real' }] } });
  assert.deepEqual(T.validate(m, m.views[0]).filter(p => p.rule === 'member-names').map(p => [p.ids, p.message]),
    [[['ebike', 'ebike.battery', 'ebike.battery-2'], 'member-names: "CargoBike" has two members named "battery" (ebike.battery, ebike.battery-2)']]);
  assert.deepEqual(T.validate(M17, M17.views[0]).filter(p => p.rule === 'member-names'), []);
});

test('audit 15: F2 on a line takes its «stereotype» off, so it is not drawn twice', () => {
  assert.deepEqual(T.edits.rename(M17, M17.views[0], 'dock-uses-charge-interface', '«use» powers'), [{ op: 'set', id: 'dock-uses-charge-interface', path: 'label', value: 'powers' }]);
  assert.equal(T.edits.rename(M17, M17.views[0], 'dock', 'Docking station'), null, 'a card: the canvas\'s');
});

test('audit 17: a part association names its part so that the part\'s row reads back, whatever the block\'s name starts with', () => {
  const roles = [];
  for (const label of ['Battery pack', '3D Printer', '(Spare) wheel', 'Ü-Motor', '_x', '---', '2']) {
    const m = { schemaVersion: 2, nodes: [B('bike', 'Bike'), B('b', label)], edges: [], views: [{ id: 'v', diagram: 'sysml.block-definition', nodeIds: ['bike', 'b'] }] };
    const r = T.edits.connect(m, m.views[0], 'bike', 'b', null, { type: 'uml.Association', props: { ends: { from: { aggregation: 'composite' } } } });
    const m2 = apply(m, r), x = m2.nodes[0].members[0], back = bdParse(bdPrint(x), m2.nodes[0], m2);
    assert.ok(!back.error, `${label}: ${bdPrint(x)} ${back.error}`); assert.equal(back.label, x.label); roles.push(x.label);
  }
  assert.deepEqual(roles, ['batterypack', 'part3DPrinter', 'sparewheel', 'üMotor', '_x', 'part', 'part2']);
});

test('audit 18: part-type picks "an" before a vowel, and flow-direction says a missing direction plainly', () => {
  const m = { schemaVersion: 2, nodes: [B('bike', 'Bike', [P('bike.dock', 'PartProperty', 'dock', { valueType: 'Dock' }), P('bike.f', 'FlowProperty', 'f')]),
    { id: 'dock', type: 'sysml.InterfaceBlock', label: 'Dock' }], edges: [], views: [{ id: V, diagram: 'sysml.block-definition', nodeIds: ['bike', 'dock'] }] };
  const said = validate(m).map(p => p.message);
  assert.ok(said.includes('part-type: part "Bike".dock is typed by "Dock", an interface block, not a block'), said.join('\n'));
  assert.ok(said.includes('flow-direction: flow property "Bike".f has no direction: give it in, out or inout'), said.join('\n'));
});

test('audit 19: F2 on a frame with no subject sets the view\'s title, as on a requirement view (milestone-3 §5.1); a line still takes its label', () => {
  const m = { schemaVersion: 2, nodes: [B('bike', 'Bike'), B('wheel', 'Wheel')], edges: [{ id: 'g1', type: 'sysml.Generalization', from: 'bike', to: 'wheel' }],
    views: [{ id: 'b', diagram: 'sysml.block-definition', title: 'Blocks', nodeIds: ['bike', 'wheel'] }] }, v = m.views[0];
  assert.ok(layout(m, 'b').families.some(f => f.id === 'b->frame'), 'the frame is drawn as b->frame');
  const r = T.edits.rename(m, v, 'b->frame', 'Bike blocks');
  assert.deepEqual(r, [{ op: 'set', view: 'b', path: 'title', value: 'Bike blocks' }]);
  assert.equal(apply(m, r).views[0].title, 'Bike blocks');
  assert.deepEqual(T.edits.rename(m, v, 'g1', 'kind of'), [{ op: 'set', id: 'g1', path: 'label', value: 'kind of' }]);
  assert.equal(T.edits.rename(m, v, 'bike', 'Bicycle'), null, 'a block: the canvas\'s own label');
});

test('audit 20: what F2 on a frame edits (its field\'s text) is the view\'s title, or the package subject\'s name, never the whole header', () => {
  const m = { schemaVersion: 2, nodes: [B('bike', 'Bike')], edges: [], views: [{ id: 'b', diagram: 'sysml.block-definition', title: 'Blocks', nodeIds: ['bike'] }] };
  const F = (x, id) => layout(x, 'b').families.find(f => f.id === id);
  assert.deepEqual([F(m, 'b->frame').title, F(m, 'b->frame').edit], ['bdd [Model] [Blocks]', 'Blocks']);
  const p = structuredClone(m); p.nodes.push({ id: 'eb', type: 'uml.Package', label: 'DeliveryFleet' }); p.nodes[0].parent = 'eb'; Object.assign(p.views[0], { subject: 'eb', nodeIds: ['eb', 'bike'] });
  assert.deepEqual([F(p, 'eb').title, F(p, 'eb').edit], ['bdd [Package] DeliveryFleet [Blocks]', 'DeliveryFleet']);
  delete m.views[0].title; assert.equal(F(m, 'b->frame').edit, '', 'no title: an empty field');
});

test('audit 23: a view\'s own line (view.edges object) is checked as a model one, at its own path (general-kinds, part-agrees, the class rules), and gives its text', () => {
  const at = (m, id) => validate(m).filter(p => (p.ids || []).includes(id)).map(p => [p.rule, p.path]);
  const lines = [{ id: 'own-gen', type: 'uml.Generalization', from: 'battery', to: 'energy' },
    { id: 'own-part', type: 'uml.Association', from: 'ebike', to: 'battery', props: { ends: { from: { aggregation: 'composite' }, to: { role: 'battery', multiplicity: '3' } } } },
    { id: 'own-real', type: 'uml.InterfaceRealization', from: 'battery', to: 'motor' }];
  for (const line of lines) {
    const m = structuredClone(M17); m.edges.push(line); const own = structuredClone(M17); own.views[0].edges = [...M17.edges.map(e => e.id), structuredClone(line)];
    const want = at(m, line.id), k = `edges[${M17.edges.length}]`;
    assert.ok(want.length, `${line.id}: the model line is said`);
    assert.ok(layout(own, V).edges.some(e => e.id === line.id), `${line.id}: drawn`);
    assert.deepEqual(at(own, line.id), want.map(([r, p]) => [r, p.replace(k, `views[0].edges[${M17.edges.length}]`)]), `${line.id}: the own line alike, at its own path`);
    assert.equal(T.text(own, own.views[0], line.id), T.text(m, m.views[0], line.id));
  }
});

test('audit 31: an element of no type, drawn and named a class, is a class in the rules\' messages and the generalization refusal, never a missing word', () => {
  for (const type of [undefined, '']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'Loose', ...(type === undefined ? {} : { type }), members: [{ id: 'a.p', type: 'sysml.ConstraintParameter', label: 'p' }] }, { id: 'b', type: 'sysml.Block', label: 'Bike' }],
      edges: [{ id: 'g', type: 'uml.Generalization', from: 'a', to: 'b' }], views: [{ id: 'v', diagram: 'sysml.block-definition', nodeIds: ['a', 'b'] }] };
    const said = validate(m).map(p => p.message);
    assert.ok(said.includes('member-kinds: class "Loose" holds parameter "p", which it may not'), JSON.stringify(said));
    assert.ok(said.includes('general-kinds: class "Loose" specializes block "Bike" (g)'), JSON.stringify(said));
    assert.deepEqual(diagramOf(m.views[0]).edits.connect(m, m.views[0], 'a', 'b', null, { type: 'uml.Generalization' }), { error: 'A generalization joins two of one kind: class and block differ' });
  }
});

// audit 32: three blocks, one specializing the next, which depends on the third ("uses"), laid out down: the dependency's
// label was placed before the generalization was routed across it, and stayed there; a label a later line runs across is
// now placed again
test('a block definition view laid out down draws no label on another line (audit 32)', () => {
  for (const [d, t] of [['sysml.block-definition', 'sysml.Block'], ['uml.class', 'uml.Class']]) for (const direction of ['down', 'right']) {
    const m = { schemaVersion: 2, nodes: [0, 1, 2].map(i => ({ id: 'b' + i, type: t, label: 'Block ' + i })),
      edges: [{ id: 'dep', type: 'uml.Dependency', from: 'b1', to: 'b2', label: 'uses' }, { id: 'gen', type: 'uml.Generalization', from: 'b0', to: 'b1' }],
      views: [{ id: 'v', diagram: d, direction, nodeIds: ['b0', 'b1', 'b2'] }] };
    assert.deepEqual(check(m, 'v').map(p => p.message), [], `${d} ${direction}`);
    assert.ok(layout(m, 'v').edges.find(e => e.id === 'dep').lbl, `${d} ${direction}: the label is drawn`);
  }
});

// audit 36: connect makes a part and the part association naming it by its role together, and part-unlisted reads the role as
// the part's name; a rename of the part (a member row, F2 in the internal block or parametric view) left the role on the old name
test('a part or constraint property renamed renames the role of its part association in the same transaction, in every view that renames it (audit 36)', () => {
  const atlas = JSON.parse(readFileSync(new URL('./fixtures/integration.json', import.meta.url))); // the SysML atlas's views, in the integration fixture since step 3 of the one-model plan
  // a constraint property's part association, a line of the blocks view's own
  atlas.views.find(v => v.id === 'blocks').edges.push({ id: 'emoped-eco', type: 'uml.Association', from: 'emoped', to: 'range-equation', props: { ends: { from: { aggregation: 'composite' }, to: { role: 'eco', multiplicity: '1' } } } });
  const said = m => validate(m).map(p => p.message).sort(), before = said(atlas), view = id => atlas.views.find(v => v.id === id);
  const role = (m, id) => [...m.edges, ...m.views.flatMap(v => (v.edges || []).filter(e => typeof e === 'object'))].find(e => e.id === id).props.ends.to.role;
  const run1 = r => apply(atlas, Array.isArray(r) ? r : r.commands);
  for (const [what, r, line, name] of [
    ['bdd member row', diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.battery', 'part pack: Battery [1]'), 'emoped-battery', 'pack'],
    ['ibd F2', diagramOf(view('inside-emoped')).edits.rename(atlas, view('inside-emoped'), 'emoped.battery', 'pack : Battery [1]'), 'emoped-battery', 'pack'],
    ['ibd member row', diagramOf(view('inside-emoped')).edits.member(atlas, view('inside-emoped'), 'emoped', 'emoped.motor', 'drive : Motor [1]'), 'emoped-motor', 'drive'],
    ['bdd member row, a constraint property', diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.eco', 'constraint economy: RangeEquation [1]'), 'emoped-eco', 'economy'],
    ['par F2, a constraint property', diagramOf(view('range-analysis')).edits.rename(atlas, view('range-analysis'), 'emoped.eco', 'economy : RangeEquation'), 'emoped-eco', 'economy'],
  ]) {
    assert.ok(!r.error, `${what}: ${r.error}`);
    const n = run1(r);
    assert.equal(role(n, line), name, what);
    assert.deepEqual(said(n), before, what);
  }
  // a part made a value by its row is no part: its line keeps its role (part-unlisted then says so); an unchanged name adds nothing
  const val = diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.controller', 'value ctl: Controller [1]');
  assert.equal(role(run1(val), 'emoped-controller'), 'controller');
  const same = diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.battery', 'part battery: Battery [1]');
  assert.ok(!same.commands.some(c => c.path === 'props.ends.to.role'));
  // one transaction: the name and the role, so one undo takes back both
  const h = history(structuredClone(atlas)), r = diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.battery', 'part pack: Battery [1]');
  h.push(apply(h.model, r.commands)); assert.equal(role(h.model, 'emoped-battery'), 'pack'); assert.equal(role(h.undo(), 'emoped-battery'), 'battery');
});

// audit 36: connect let a generalization close a cycle (or join a block to itself), which validate() then reports as
// generalization-cycle; the class, profile and use case views' connect too (and an include cycle, an extend to itself)
test('connect refuses a generalization that closes a cycle or joins an element to itself, in the block definition, class, profile and use case views (audit 36)', () => {
  const ebike = JSON.parse(readFileSync(new URL('../examples/ebike-blocks.json', import.meta.url))), bv = ebike.views.find(v => v.diagram === 'sysml.block-definition');
  const G = { type: 'uml.Generalization' }, errs = m => validate(m).filter(p => p.level === 'error').map(p => p.rule);
  const gives = (m, v, from, to, line, error) => { const T = diagramOf(v), r = T.edits.connect(m, v, from, to, null, line);
    assert.deepEqual(r, error ? { error } : null, `${v.diagram} ${from} → ${to}`);
    // what the hook lets through, validate() takes; what it refuses, validate() flags
    const n = apply(m, [{ op: 'add', element: { id: 'l-new', ...line, from, to }, view: v.id }]);
    assert.equal(errs(n).some(k => /cycle|ends/.test(k)) && !errs(m).some(k => /cycle|ends/.test(k)), !!error, `${v.diagram} ${from} → ${to}: ${errs(n)}`); };
  gives(ebike, bv, 'delivery-vehicle', 'ebike', G, 'A generalization may not close a cycle: "DeliveryVehicle" → "CargoBike" → "DeliveryVehicle" would be its own ancestor');
  gives(ebike, bv, 'ebike', 'ebike', G, 'A generalization may not close a cycle: "CargoBike" → "CargoBike" would be its own ancestor');
  gives(ebike, bv, 'battery', 'delivery-vehicle', G, null);
  // a line of the view's own counts as the model's do
  const own = structuredClone(ebike), ov = own.views.find(v => v.diagram === 'sysml.block-definition');
  own.edges = own.edges.filter(e => e.type !== 'uml.Generalization'); ov.edges = [...(ov.edges || []).filter(e => typeof e !== 'string' || own.edges.some(x => x.id === e)), { id: 'g-own', type: 'uml.Generalization', from: 'ebike', to: 'delivery-vehicle' }];
  gives(own, ov, 'delivery-vehicle', 'ebike', G, 'A generalization may not close a cycle: "DeliveryVehicle" → "CargoBike" → "DeliveryVehicle" would be its own ancestor');
  // the class view: three deep
  const C = (id, label, type = 'uml.Class') => ({ id, type, label }), cls = { schemaVersion: 2, nodes: [C('a', 'A'), C('b', 'B'), C('c', 'C')],
    edges: [{ id: 'ab', type: 'uml.Generalization', from: 'a', to: 'b' }, { id: 'bc', type: 'uml.Generalization', from: 'b', to: 'c' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'c'] }] };
  gives(cls, cls.views[0], 'c', 'a', G, 'A generalization may not close a cycle: "C" → "A" → "B" → "C" would be its own ancestor');
  gives(cls, cls.views[0], 'a', 'c', G, null);
  // the profile view: two stereotypes
  const pro = { schemaVersion: 2, nodes: [C('s', 'S', 'uml.Stereotype'), C('t', 'T', 'uml.Stereotype')], edges: [{ id: 'st', type: 'uml.Generalization', from: 's', to: 't' }], views: [{ id: 'v', diagram: 'uml.profile', nodeIds: ['s', 't'] }] };
  gives(pro, pro.views[0], 't', 's', G, 'A generalization may not close a cycle: "T" → "S" → "T" would be its own ancestor');
  // the use case view: a generalization of actors, an include cycle, an extend to itself
  const uc = { schemaVersion: 2, nodes: [C('x', 'X', 'uml.Actor'), C('y', 'Y', 'uml.Actor'), C('p', 'Pay', 'uml.UseCase'), C('q', 'Quote', 'uml.UseCase')],
    edges: [{ id: 'xy', type: 'uml.Generalization', from: 'x', to: 'y' }, { id: 'pq', type: 'uml.Include', from: 'p', to: 'q' }], views: [{ id: 'v', diagram: 'uml.use-case', nodeIds: ['x', 'y', 'p', 'q'] }] };
  gives(uc, uc.views[0], 'y', 'x', G, 'A generalization may not close a cycle: "Y" → "X" → "Y" would be its own ancestor');
  gives(uc, uc.views[0], 'q', 'p', { type: 'uml.Include' }, 'An include may not close a cycle: "Quote" → "Pay" → "Quote" would include itself');
  gives(uc, uc.views[0], 'p', 'p', { type: 'uml.Include' }, 'An include may not close a cycle: "Pay" → "Pay" would include itself');
  assert.deepEqual(diagramOf(uc.views[0]).edits.connect(uc, uc.views[0], 'p', 'p', null, { type: 'uml.Extend' }), { error: 'An extend runs from a use case to another use case' });
});

// audit 37: SYS_ROLES picked the part associations to rename by their role text alone, so a part renamed to a name another part
// held took that part's association with it, and renamed back took both; a name another member holds is now refused, and only a
// role whose part end is the part's block (and no twin's) follows a rename
test('a part renamed to another member\'s name is refused, and a rename renames only the role that names that part (audit 37)', () => {
  const atlas = JSON.parse(readFileSync(new URL('./fixtures/integration.json', import.meta.url))), view = id => atlas.views.find(v => v.id === id); // the SysML atlas's views, in the integration fixture since step 3
  const said = m => validate(m).map(p => p.message).sort(), before = said(atlas);
  const role = (m, id) => m.edges.find(e => e.id === id).props.ends.to.role;
  const clash = /^member-names: "EMoped" has a member named "motor" already \(emoped\.motor\)/;
  for (const [what, r] of [
    ['bdd member row', diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.battery', 'part motor: Battery [1]')],
    ['ibd F2', diagramOf(view('inside-emoped')).edits.rename(atlas, view('inside-emoped'), 'emoped.battery', 'motor : Battery [1]')],
    ['ibd member row', diagramOf(view('inside-emoped')).edits.member(atlas, view('inside-emoped'), 'emoped', 'emoped.battery', 'motor : Battery [1]')],
    ['par F2, a constraint property', diagramOf(view('range-analysis')).edits.rename(atlas, view('range-analysis'), 'emoped.eco', 'motor : RangeEquation')],
    ['the Name field, ibd', diagramOf(view('inside-emoped')).edits.field(atlas, view('inside-emoped'), 'emoped.battery', 'label', 'motor')],
    ['the Name field, bdd', diagramOf(view('blocks')).edits.field(atlas, view('blocks'), 'emoped.battery', 'label', 'motor')],
  ]) assert.match(String(r && r.error), clash, what);
  // a name kept, or another member's of another kind of line (an operation's), is no clash
  assert.ok(!diagramOf(view('blocks')).edits.member(atlas, view('blocks'), 'emoped', 'emoped.battery', 'part battery: Battery [2]').error);
  // a model that holds two parts of one name already (a file written so): renaming one back renames its own association only,
  // the one whose part end is its block
  const twin = structuredClone(atlas); twin.nodes.find(n => n.id === 'emoped').members.find(x => x.id === 'emoped.battery').label = 'motor';
  twin.edges.find(e => e.id === 'emoped-battery').props.ends.to.role = 'motor';
  const back = diagramOf(view('blocks')).edits.member(twin, twin.views.find(v => v.id === 'blocks'), 'emoped', 'emoped.battery', 'part battery: Battery [1]');
  assert.ok(!back.error, back.error);
  const n = apply(twin, back.commands);
  assert.equal(role(n, 'emoped-battery'), 'battery'); assert.equal(role(n, 'emoped-motor'), 'motor');
  assert.deepEqual(said(n), before);
  // a role that names the part but whose part end is another block is not the part's: kept
  const far = structuredClone(atlas); far.edges.find(e => e.id === 'emoped-motor').props.ends.to.role = 'battery';
  const r2 = diagramOf(far.views.find(v => v.id === 'blocks')).edits.member(far, far.views.find(v => v.id === 'blocks'), 'emoped', 'emoped.battery', 'part pack: Battery [1]');
  const n2 = apply(far, r2.commands);
  assert.equal(role(n2, 'emoped-battery'), 'pack'); assert.equal(role(n2, 'emoped-motor'), 'battery');
  // two parts of one name and type: which one a role names is not known, so no role follows
  const two = structuredClone(atlas), eb = two.nodes.find(n => n.id === 'emoped');
  eb.members.push({ id: 'emoped.battery2', type: 'sysml.PartProperty', label: 'battery', props: { valueType: 'Battery' } });
  const r3 = diagramOf(two.views.find(v => v.id === 'blocks')).edits.member(two, two.views.find(v => v.id === 'blocks'), 'emoped', 'emoped.battery2', 'part spare: Battery [1]');
  assert.ok(!r3.commands.some(c => String(c.path).includes('role')), JSON.stringify(r3.commands));
});

// audit 37: the properties panel's Name field on a part and the Role field on its part association were a plain set, so the part
// and its line drifted apart (part-unlisted); the panel now asks the type's edits.field, which SysML's views answer with SYS_ROLES
test('the properties panel\'s Name field on a part renames its association\'s role, and the Role field renames the part (audit 37)', async () => {
  await import('../src/typed/edit.js');
  const { typedEditor } = await import('../src/canvas/edit.js');
  const atlas = JSON.parse(readFileSync(new URL('./fixtures/integration.json', import.meta.url))); // the SysML atlas's views, in the integration fixture since step 3 of the one-model plan
  const said = m => validate(m).map(p => p.message).sort(), before = said(atlas), role = (m, id) => m.edges.find(e => e.id === id).props.ends.to.role;
  const part = (m, id) => m.nodes.find(n => n.id === 'emoped').members.find(x => x.id === id).label;
  for (const vid of ['inside-emoped', 'blocks', 'range-analysis']) {
    const got = [], status = [];
    const I = typedEditor({ root: { addEventListener() {} }, stage: { addEventListener() {} }, can: () => true, say() {}, status: s => status.push(s), emit: c => got.push(c), view: () => vid, model: () => atlas, picked: () => [], sel: () => null,
      geo: () => ({ byId: {}, nodes: [] }), cam: () => null, focus() {}, touch() {} });
    const set = (id, path, value) => { got.length = 0; const ok = I.field(id, path, value, () => { got.push([{ op: 'set', id, path, value }]); return true; }); return { ok, c: got.flat() }; };
    // the Name field on a part: its role with it, one transaction
    const a = set('emoped.battery', 'label', 'pack'), na = apply(atlas, a.c);
    assert.equal(a.c.length, 2, `${vid}: ${JSON.stringify(a.c)}`); assert.equal(part(na, 'emoped.battery'), 'pack'); assert.equal(role(na, 'emoped-battery'), 'pack', vid);
    assert.deepEqual(said(na), before, vid);
    // the Role field on its part association: the part renamed with it
    const b = set('emoped-battery', ['props', 'ends', 'to', 'role'], 'pack'), nb = apply(atlas, b.c);
    assert.equal(part(nb, 'emoped.battery'), 'pack', vid); assert.equal(role(nb, 'emoped-battery'), 'pack', vid); assert.deepEqual(said(nb), before, vid);
    // a name another member holds: refused, nothing emitted, said
    const c = set('emoped.battery', 'label', 'motor');
    assert.equal(c.ok, false, vid); assert.deepEqual(c.c, [], vid); assert.match(status.join(), /member-names/, vid);
    const d = set('emoped-battery', ['props', 'ends', 'to', 'role'], 'motor');
    assert.equal(d.ok, false, vid); assert.deepEqual(d.c, [], vid);
    // another field, another element: the plain set, as before
    assert.deepEqual(set('emoped-battery', ['props', 'ends', 'to', 'multiplicity'], '2').c, [{ op: 'set', id: 'emoped-battery', path: ['props', 'ends', 'to', 'multiplicity'], value: '2' }], vid);
    assert.deepEqual(set('battery', 'label', 'Pack').c, [{ op: 'set', id: 'battery', path: 'label', value: 'Pack' }], vid);
  }
});

// audit 38: SYS_CLASH judged a member row's edit by the member's old type and by its bare label: a value turned into an
// operation named like a value was refused, an operation turned into a value named like a value let through
test('a member row edit is refused exactly when member-names would say the edited member clashes, by its new kind (audit 38)', () => {
  const m0 = apply(JSON.parse(readFileSync(new URL('./fixtures/integration.json', import.meta.url), 'utf8')), [{ op: 'add', owner: 'emoped', element: { id: 'emoped.op1', type: 'uml.Operation', label: 'compute' } },
    { op: 'add', owner: 'emoped', element: { id: 'emoped.op2', type: 'uml.Operation', label: 'charge', props: { parameters: [{ name: 'to', valueType: 'Real' }] } } }]);
  const v = m0.views.find(x => x.diagram === 'sysml.block-definition'), clashes = m => validate(m).filter(p => p.rule === 'member-names' && p.ids.includes('emoped')).length, base = clashes(m0);
  const texts = ['value ecoRange: Real', 'ecoRange(): Real', 'ecoRange(x: Real): Real', 'compute(): Real', 'compute(x: Real)', 'value compute: Real', 'charge(to: Real)', 'charge(to: Integer)', 'charge()', 'value charge: Real', 'part battery: Battery', 'value fresh: Real'];
  let refused = 0, applied = 0;
  for (const id of ['emoped.usableShare', 'emoped.ecoRange', 'emoped.op1', 'emoped.op2', 'emoped.battery']) for (const text of texts) {
    const r = T.edits.member(m0, v, 'emoped', id, text);
    if (r && r.commands) { applied++; assert.equal(clashes(apply(m0, r.commands)) > base, false, `${id} "${text}" was let through, and member-names then errors`); }
    else if (r && r.error && /^member-names:/.test(r.error)) { refused++; // and it was right to refuse: the same edit forced through would clash
      const m = structuredClone(m0), owner = m.nodes.find(n => n.id === 'emoped'), x = owner.members.find(y => y.id === id), p = bdParse(text, owner, m);
      Object.assign(x, { type: p.type, label: p.label, props: p.props }); assert.ok(clashes(m) > base, `${id} "${text}" was refused, though member-names allows it`); } }
  assert.ok(refused >= 5 && applied >= 10, `${refused} refused, ${applied} applied`);
  // the two the audit found
  assert.ok(T.edits.member(m0, v, 'emoped', 'emoped.usableShare', 'ecoRange(): Real').commands, 'an operation ecoRange() and a value ecoRange do not clash');
  assert.match(T.edits.member(m0, v, 'emoped', 'emoped.op1', 'value ecoRange: Real').error, /^member-names: "EMoped" has a member named "ecoRange" already \(emoped\.ecoRange\)/);
});

// audit 39: a member row added (id null) with a name its owner holds already went through in all three SysML views, where the
// same name given by a rename is refused; validate() then said member-names. An add is judged as the edit is
test('a member row added is refused exactly when member-names would say the new member clashes, in the bdd, ibd and par (audit 39)', () => {
  const m0 = apply(JSON.parse(readFileSync(new URL('./fixtures/integration.json', import.meta.url), 'utf8')), [{ op: 'add', owner: 'emoped', element: { id: 'emoped.op1', type: 'uml.Operation', label: 'compute' } }]);
  const clashes = m => validate(m).filter(p => p.rule === 'member-names').length, base = clashes(m0);
  assert.equal(base, 0);
  const rows = { 'sysml.block-definition': ['value battery : Real', 'part battery : Battery', 'value ecoRange : Real', 'compute(): Real', 'compute(x: Real)', 'value compute : Real', 'value fresh : Real', 'battery(): Real', '«x» value battery : Real', 'value " battery" : Real'],
    'sysml.internal-block': ['battery : Battery', 'ecoRange : Real', 'port battery : Power', 'compute : Real', 'fresh : Battery', '«full» battery : Battery'],
    'sysml.parametric': ['battery : Real', 'ecoRange : Real', 'fresh : Real', 'compute : Real'] };
  let refused = 0, applied = 0;
  for (const [diag, texts] of Object.entries(rows)) { const v = m0.views.find(x => x.diagram === diag), D = diagramOf(v), owner = diag === 'sysml.block-definition' ? 'emoped' : v.subject;
    assert.equal(owner, 'emoped');
    for (const text of texts) { const r = D.edits.member(m0, v, owner, null, text), cs = Array.isArray(r) ? r : r && r.commands;
      if (cs) { applied++; assert.equal(clashes(apply(m0, cs)), base, `${diag} "${text}" was added, and member-names then errors`); }
      else { assert.ok(r && r.error, `${diag} "${text}": ${JSON.stringify(r)}`); if (/^member-names:/.test(r.error)) refused++; } } }
  assert.ok(refused >= 8 && applied >= 6, `${refused} refused, ${applied} applied`);
  const v = m0.views.find(x => x.diagram === 'sysml.internal-block');
  assert.equal(diagramOf(v).edits.member(m0, v, 'emoped', null, 'battery : Battery').error, 'member-names: "EMoped" has a member named "battery" already (emoped.battery): a block\'s members have different names');
});

test('audit 41: validate() says an operation\'s parameter name, direction or type, and a block operation\'s return type, that is not text, at its own path, here and in the class view', () => {
  const op = props => ({ id: 'k.f', type: 'uml.Operation', label: 'f', props });
  const one = (type, diagram, props) => ({ schemaVersion: 2, title: 'c', nodes: [{ id: 'k', type, label: 'K', members: [op(props)] }], edges: [], views: [{ id: 'v', diagram, title: 'V', nodeIds: ['k'] }] });
  const said = m => validate(m).map(p => `${p.path}: ${p.message}`);
  for (const [type, diagram] of [['uml.Class', 'uml.class'], ['sysml.Block', 'sysml.block-definition']]) {
    assert.deepEqual(said(one(type, diagram, { parameters: [{ name: 'x', valueType: { a: 1 } }] })), ['nodes[0].members[0].props.parameters[0].valueType: valueType {"a":1} is not text: drawn as "[object Object]"'], type);
    assert.deepEqual(said(one(type, diagram, { parameters: [{ name: 'x', valueType: 'Int' }, { name: ['x', 'y'], valueType: 'Int' }] })), ['nodes[0].members[0].props.parameters[1].name: name ["x","y"] is not text: drawn as "x,y"'], type);
    assert.deepEqual(said(one(type, diagram, { parameters: [{ direction: { in: 1 }, name: 'x' }] })).length, 1, type);
    assert.deepEqual(said(one(type, diagram, { returnType: { a: 1 } })), ['nodes[0].members[0].props.returnType: returnType {"a":1} is not text: drawn as "[object Object]"'], type);
    assert.deepEqual(said(one(type, diagram, { parameters: [{ direction: 'in', name: 'x', valueType: 'Int' }, 7, null], returnType: 'Real' })), [], `${type}: text, or no parameter at all, is said nothing`);
  }
});

// audit 44: a row, the parametric palette's add, a panel field and the internal block view's port row that would bring a
// constraint-type or port-kind error are refused with the row's form; a type naming nothing stays a warning, let through
test('a member typed so it breaks constraint-type or port-kind is refused, by row, palette, field and port row (audit 44)', () => {
  const errs = m => validate(m).filter(p => p.level === 'error').map(p => p.message);
  const BL = JSON.parse(readFileSync(new URL('../examples/ebike-blocks.json', import.meta.url), 'utf8')), BV = BL.views[0], BT = diagramOf(BV);
  assert.deepEqual(errs(BL), []);
  const row = (text, id = null) => BT.edits.member(BL, BV, 'ebike', id, text);
  for (const [text, id] of [['constraint city', null], ['constraint city : Battery', null], ['constraint usable : Battery', 'ebike.usable'], ['proxy port p : Battery', null], ['proxy port p', null]]) {
    const r = row(text, id); assert.ok(r && typeof r.error === 'string', text);
    assert.match(r.error, /^(Constraint property|Proxy port) "CargoBike"\.\w+ is typed by .*: a (constraint property is name : ConstraintBlock|proxy port is typed by an interface block, a full port by none)$/, text); }
  for (const text of ['constraint city : UsableEnergy', 'constraint c : Nope', 'part city : UsableEnergy', 'full port q : Battery', 'port p : Battery', 'value v : Real']) {
    const r = row(text); assert.ok(Array.isArray(r), text); assert.deepEqual(errs(apply(BL, r)), [], text); }
  assert.ok(Array.isArray(row('constraint usable : UsableEnergy', 'ebike.usable').commands), 'an edit that keeps it typed');
  // the panel: a constraint property's type set to a block, or cleared, refused; to a constraint block, the default
  assert.match(BT.edits.field(BL, BV, 'ebike.usable', 'props.valueType', 'Battery').error, /^Constraint property "CargoBike"\.usable is typed by "Battery"/);
  assert.match(BT.edits.field(BL, BV, 'ebike.usable', 'props.valueType', undefined).error, /typed by nothing/);
  assert.equal(BT.edits.field(BL, BV, 'ebike.usable', 'props.valueType', 'UsableEnergy'), null);
  // a model with the error already: an edit that keeps it is not refused for it
  const bad = apply(BL, [{ op: 'set', id: 'ebike.usable', path: 'props.valueType', value: 'Battery' }]);
  assert.ok(Array.isArray(BT.edits.member(bad, bad.views[0], 'ebike', null, 'value v : Real')));
  // the parametric palette's Constraint property: typed by nothing refused; name : ConstraintBlock added
  const PR = JSON.parse(readFileSync(new URL('../examples/ebike-range.json', import.meta.url), 'utf8')), PV = PR.views[0], PT = diagramOf(PV), E = PT.elements.find(e => e.type === 'sysml.ConstraintProperty');
  assert.match(PT.edits.add(PR, PV, E, 'city', null).error, /typed by nothing, not a constraint block: a constraint property is name : ConstraintBlock$/);
  const ok = PT.edits.add(PR, PV, E, 'city : UsableEnergy', null); assert.ok(Array.isArray(ok)); assert.deepEqual(errs(apply(PR, ok)), []);
  // the internal block view: a proxy port row typed by a block refused
  const IB = diagramOf({ diagram: 'sysml.internal-block' }), iv = { id: 'ib', diagram: 'sysml.internal-block', subject: 'ebike', nodeIds: [] }, IM = { ...BL, views: [...BL.views, iv] };
  assert.match(IB.edits.member(IM, iv, 'ebike', null, 'proxy port p : Battery').error, /^Proxy port "CargoBike"\.p is typed by "Battery", not an interface block: /);
});

// audit 45: the internal block view's F2 on a port box is refused as the row and the field are, when it would set a kind or a
// type that breaks port-kind; and a refusal says the form once, a port of no SysML kind told the kinds
test('F2 on a port box that breaks port-kind is refused, and a refusal says its form once (audit 45)', () => {
  const errs = m => validate(m).filter(p => p.level === 'error').map(p => p.message);
  const A = JSON.parse(readFileSync(new URL('./fixtures/integration.json', import.meta.url), 'utf8')), IV = A.views.find(v => v.diagram === 'sysml.internal-block'), IT = diagramOf(IV);
  assert.deepEqual(errs(A), []);
  const box = 'emoped.battery->battery.charge', F = 'a proxy port is typed by an interface block, a full port by none';
  assert.equal(IT.edits.rename(A, IV, box, '«full»').error, `Full port "Battery".charge is typed by "ChargeInterface", an interface block: ${F}`);
  assert.equal(IT.edits.rename(A, IV, box, '«proxy» charge : Battery').error, `Proxy port "Battery".charge is typed by "Battery", not an interface block: ${F}`);
  for (const text of ['«proxy»', 'charger', '«proxy» charger : ChargeInterface']) { const r = IT.edits.rename(A, IV, box, text), cs = Array.isArray(r) ? r : r.commands;
    assert.ok(Array.isArray(cs), text); assert.deepEqual(errs(apply(A, cs)), [], text); }
  // the words: the form once, never twice; a kind that is none of SysML's told the kinds
  const BL = JSON.parse(readFileSync(new URL('../examples/ebike-blocks.json', import.meta.url), 'utf8')), BV = BL.views[0], BT = diagramOf(BV);
  assert.equal(BT.edits.member(BL, BV, 'ebike', null, 'proxy port p').error, `Proxy port "CargoBike".p is typed by nothing: ${F}`);
  assert.equal(BT.edits.field(BL, BV, 'battery.charge', 'props.kind', 'sideways').error, 'Port "Battery".charge has kind "sideways", not proxy or full: a port\'s kind is proxy, full or none');
  assert.equal(BT.edits.member(BL, BV, 'ebike', null, 'constraint city').error, 'Constraint property "CargoBike".city is typed by nothing, not a constraint block: a constraint property is name : ConstraintBlock');
});

// audit 52: a proxy port typed by a name that names nothing (its interface block deleted, or not made yet) is a port-kind
// warning saying so, as constraint-type's is (audit 18): the row is let through, and Shift + Delete of the interface block
// leaves no error
test('audit 52: a proxy port whose interface block is deleted or not made yet is a port-kind warning that says the name names nothing', () => {
  const M = JSON.parse(readFileSync(new URL('../examples/types/sysml-block-definition.json', import.meta.url), 'utf8')), V = M.views[0], T = diagramOf(V);
  const errs = m => validate(m).filter(p => p.level === 'error').map(p => p.message);
  assert.deepEqual(errs(M), []);
  const gone = apply(M, [{ op: 'delete', id: 'charge-interface' }]), ps = validate(gone).filter(p => p.rule === 'port-kind');
  assert.ok(ps.length >= 2); assert.deepEqual(errs(gone), []);
  ps.forEach(p => { assert.equal(p.level, 'warning'); assert.match(p.message, /is typed by "~?ChargeInterface", which names nothing, not an interface block$/); });
  const own = M.nodes.find(n => n.type === 'sysml.Block').id, r = T.edits.member(M, V, own, null, 'proxy port p : NotMadeYet');
  assert.ok(Array.isArray(r) || (r && Array.isArray(r.commands)), JSON.stringify(r)); assert.deepEqual(errs(apply(M, r.commands || r)), []);
  // a proxy port typed by a block that is there: still an error, still refused
  assert.match(T.edits.member(M, V, own, null, `proxy port p : ${M.nodes.find(n => n.type === 'sysml.Block').label}`).error, /not an interface block: /);
});
