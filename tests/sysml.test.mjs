// SysML's base (work package M3.1, notes/milestone-3.md §3, §5, §8.1): the table of SysML's types read by the stereotype
// check and the keywords, the projection of an internal block or parametric view onto the composite structure type with its
// filter by view kind and the texts the layout measures, the mapping back of what the composite type's hooks add, its
// problems re-said, the frame (its shape, header and the subject's card made a frame), the crosshair end, the classifier's
// compartment titles and ariaOwn, the class rule on SysML generalizations, and the canvas's drop on a frame that is no
// element. tests/notation.html draws the crosshair, a titled compartment, ariaOwn and the frame in both themes and three
// fonts. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { SHAPE } from '../src/draw/shapes.js';
import { svgOf } from '../src/draw/svg.js';
import '../src/map/typed.js';
import { ENDS } from '../src/typed/draw.js';
import { classProblems } from '../src/uml/class.js';
import { csGeo, csProblems, csConnect, csMember, csRename } from '../src/uml/composite.js';
import { metaOf, stereoProblems, appliedOf } from '../src/uml/stereotypes.js';
import { typedEditor } from '../src/canvas/edit.js';
import { layoutTyped } from '../src/typed/layout.js';
import { tagSize } from '../src/uml/frame.js';
import { merge } from '../tools/atlas.mjs';
import { SYS_TABLE, SYS_HEAD, SYS_FRAME, SYS_AS_UML, SYS_BACK, SYS_CS_PROBLEMS, SYS_DRESS } from '../src/sysml/sysml.js';
import '../src/sysml/requirement.js';
import '../src/sysml/blocks.js';
import '../src/sysml/internal.js';
import '../src/sysml/parametric.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const [M16, M17, M18, M19] = ['16-requirement', '17-block-definition', '18-internal-block', '19-parametric'].map(n => read(`../docs/diagrams/examples/${n}.json`));
// the four merged by id, as tools/atlas.mjs merges them (its merge, §15.2)
function atlas() {
  const out = { schemaVersion: 2, title: 'E-bike', nodes: [], edges: [], views: [] };
  for (const m of structuredClone([M16, M17, M18, M19])) {
    for (const k of ['nodes', 'edges']) m[k].forEach(x => { const i = out[k].findIndex(y => y.id === x.id); if (i < 0) out[k].push(x); else out[k][i] = merge(out[k][i], x, x.id); });
    out.views.push(...m.views); }
  return out;
}
const withView = (m, v) => { const c = structuredClone(m); c.views.push(v); return [c, c.views.at(-1)]; };
const geoOf = (m, v, memo = {}) => { const P = SYS_AS_UML(m, v); return csGeo({ model: P.model, view: P.view, pos: {}, memo }); };
const kept = (m, v) => { const S = SYS_AS_UML(m, v).model.nodes.find(n => n.id === v.subject); return (S.members || []).filter(x => x.type.startsWith('uml.')).map(x => x.id); };

// ---- the table (§3.2)
test('every sysml.* type the registry\'s SysML types, model.md rows 16 to 19 and the four examples use has a row of the table', () => {
  const used = new Set(), add = t => { if (typeof t === 'string' && t.startsWith('sysml.') && !t.includes('-') && /^sysml\.[A-Z]/.test(t)) used.add(t); };
  // the registry: each SysML type registered (M3.2 to M3.5 register theirs): its palette, lines, panel fields and refs
  for (const d of Object.keys({ 'sysml.requirement': 1, 'sysml.block-definition': 1, 'sysml.internal-block': 1, 'sysml.parametric': 1 })) {
    const T = diagramOf({ diagram: d }); if (!T) continue;
    [...(T.elements || []), ...(T.lines || [])].forEach(e => add(e.type)); Object.keys(T.props || {}).forEach(add); Object.keys(T.refs || {}).forEach(add); }
  const md = readFileSync(new URL('../docs/diagrams/model.md', import.meta.url), 'utf8').split('\n').filter(l => /^\| 1[6-9] \|/.test(l));
  assert.equal(md.length, 4);
  md.forEach(l => (l.match(/sysml\.[A-Z]\w+/g) || []).forEach(add));
  const walk = x => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { add(x.type); Object.values(x).forEach(walk); } };
  [M16, M17, M18, M19].forEach(walk);
  assert.ok(used.size >= 20, [...used]);
  assert.deepEqual([...used].filter(t => !Object.hasOwn(SYS_TABLE, t)), []);
  // every row is read: its metaclass by metaOf, its stereotype a known keyword (below), its projection a UML type or none
  for (const [t, r] of Object.entries(SYS_TABLE)) { assert.equal(metaOf({ type: t }), r.meta, t); assert.ok(r.as === null || r.as.startsWith('uml.'), t); }
  assert.equal(metaOf({ type: 'sysml.Nothing' }), undefined); assert.equal(metaOf({ type: 'uml.Class' }), 'Class');
});

// ---- the stereotype check (§3.3): a profile P applied to pkg, «cls» on Class and «prop» on Property
function profiled() {
  const N = (id, type, label, parent, more = {}) => ({ id, type, label, ...(parent ? { parent } : {}), ...more });
  return { schemaVersion: 2, nodes: [
    N('p', 'uml.Profile', 'P'), N('mc-class', 'uml.MetaclassReference', 'Class', 'p'), N('mc-prop', 'uml.MetaclassReference', 'Property', 'p'),
    N('cls', 'uml.Stereotype', 'cls', 'p'), N('prop', 'uml.Stereotype', 'prop', 'p'),
    N('pkg', 'uml.Package', 'pkg'),
    N('blk', 'sysml.Block', 'Blk', 'pkg', { props: { stereotypes: ['cls'] }, members: [N('blk.v', 'sysml.ValueProperty', 'v', null, { props: { stereotypes: ['prop'], valueType: 'Real' } })] }),
    N('req', 'sysml.Requirement', 'Req', 'pkg', { props: { stereotypes: ['cls', 'functionalRequirement'], reqId: 'R-1', text: 'x' } }),
    N('cb', 'sysml.ConstraintBlock', 'Cb', 'pkg', { props: { stereotypes: ['cls', 'constraintBlock'] } }),
    N('why', 'uml.Comment', 'because', 'pkg', { props: { stereotypes: ['rationale'] } }),
    N('odd', 'uml.Comment', 'odd', 'pkg', { props: { stereotypes: ['problem', 'block', 'deriveReqt', 'proxy'] } })],
  edges: [{ id: 'e1', type: 'uml.Extension', from: 'cls', to: 'mc-class' }, { id: 'e2', type: 'uml.Extension', from: 'prop', to: 'mc-prop' }, { id: 'ap', type: 'uml.ProfileApplication', from: 'pkg', to: 'p' }],
  views: [] };
}
test('a profile extending Class fits a block, a requirement and a constraint block, one extending Property a value property; SysML\'s names are keywords in its scope', () => {
  assert.deepEqual(stereoProblems(profiled()), []);
});
test('a stereotype on the wrong metaclass is warned on a SysML element, as on a UML one; a name no profile or standard has still is', () => {
  const m = profiled(); m.nodes.find(n => n.id === 'blk').props.stereotypes = ['prop']; m.nodes.find(n => n.id === 'blk').members[0].props.stereotypes = ['cls'];
  m.nodes.find(n => n.id === 'why').props.stereotypes.push('gizmo');
  assert.deepEqual(stereoProblems(m).map(p => p.message), [
    'stereotype-extends: «prop» on "Blk" extends Property, which a Class is not',
    'stereotype-extends: «cls» on "v" extends Class, which a Property is not',
    'stereotype-unknown: «gizmo» on "because" is no stereotype of P, applied here, and no standard one']);
});
test('a required extension of a profile in scope reaches a SysML element of its metaclass', () => {
  const m = profiled(); m.edges[0].props = { isRequired: true }; m.nodes.find(n => n.id === 'blk').props.stereotypes = [];
  assert.deepEqual(stereoProblems(m), []);
  assert.deepEqual(appliedOf(m, 'blk').map(e => [e.key, e.required]), [['cls', true]]);
  assert.deepEqual(appliedOf(m, 'blk.v').map(e => [e.key, e.required]), [['prop', false]], 'a property is no Class: its own stereotype only');
});

// ---- the class rule (§7.3, S20)
test('17 with a class view added has no generalization-kinds problem; a UML generalization between kinds still has', () => {
  const [m] = withView(M17, { id: 'cls', diagram: 'uml.class', nodeIds: ['ebike', 'rental-vehicle'] });
  assert.deepEqual(classProblems(m).filter(p => p.rule === 'generalization-kinds'), []);
  assert.ok(m.edges.some(e => e.type === 'uml.Generalization' && e.from === 'ebike' && e.to === 'rental-vehicle'));
  const bad = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'p', type: 'uml.Package', label: 'p' }], edges: [{ id: 'g', type: 'uml.Generalization', from: 'a', to: 'p' }], views: [] };
  assert.deepEqual(classProblems(bad).map(p => p.rule), ['generalization-kinds']);
  // an end of another notation is left to it (§7.3, option (a)); one untyped, or of a type of no notation, is still judged
  const to = t => ({ ...bad, nodes: [bad.nodes[0], { id: 'p', label: 'p', ...(t ? { type: t } : {}) }] });
  assert.deepEqual(classProblems(to(undefined)).filter(p => p.rule === 'generalization-kinds').length, 1);
  assert.deepEqual(classProblems(to('Class')).filter(p => p.rule === 'generalization-kinds').length, 1);
  assert.deepEqual(classProblems(to('c4.System')).filter(p => p.rule === 'generalization-kinds'), []);
});

// ---- the projection (§8.1)
const IBD = { 'sysml.internal-block': 1 };
test('asUml keeps only the view kind\'s members of the subject, in each example and in the four merged', () => {
  const all = atlas(), ibd = all.views.find(v => v.id === 'inside-ebike'), par = all.views.find(v => v.id === 'range-analysis');
  assert.ok(IBD[ibd.diagram] && par.diagram === 'sysml.parametric');
  assert.deepEqual(kept(M18, M18.views[0]), ['ebike.battery', 'ebike.controller', 'ebike.motor', 'ebike.frontLight', 'ebike.rearLight', 'ebike.dock']);
  assert.deepEqual(kept(M19, M19.views[0]), ['ebike.batteryCapacity', 'ebike.usableShare', 'ebike.ecoConsumption', 'ebike.boostConsumption', 'ebike.ecoRange', 'ebike.boostRange', 'ebike.usable', 'ebike.eco', 'ebike.boost']);
  assert.deepEqual(kept(...withView(M17, { id: 'x', diagram: 'sysml.internal-block', subject: 'ebike', nodeIds: ['ebike'] })), ['ebike.battery', 'ebike.controller', 'ebike.motor', 'ebike.wheels', 'ebike.dock']);
  assert.deepEqual(kept(...withView(M16, { id: 'x', diagram: 'sysml.internal-block', subject: 'battery', nodeIds: ['battery'] })), []);
  // merged: the ibd shows no constraint property, the par view no part
  assert.deepEqual(kept(all, ibd), ['ebike.battery', 'ebike.controller', 'ebike.motor', 'ebike.wheels', 'ebike.dock', 'ebike.frontLight', 'ebike.rearLight',
    'ebike.batteryCapacity', 'ebike.usableShare', 'ebike.ecoConsumption', 'ebike.boostConsumption', 'ebike.ecoRange', 'ebike.boostRange']);
  assert.deepEqual(kept(all, par), ['ebike.rangeEq', 'ebike.batteryCapacity', 'ebike.usableShare', 'ebike.ecoConsumption', 'ebike.boostConsumption', 'ebike.ecoRange', 'ebike.boostRange', 'ebike.usable', 'ebike.eco', 'ebike.boost']);
  // what is not kept keeps its SysML type and its index: the arrays are as long, the ids in order
  const P = SYS_AS_UML(all, par);
  assert.deepEqual(P.model.nodes.map(n => [n.id, (n.members || []).map(x => x.id)]), all.nodes.map(n => [n.id, (n.members || []).map(x => x.id)]));
  assert.deepEqual(P.model.edges.map(e => e.id), all.edges.map(e => e.id));
  assert.equal(P.model.views.indexOf(P.view), all.views.indexOf(par));
  assert.deepEqual(P.model.edges.filter(e => e.type === 'uml.Connector').map(e => e.id), M19.edges.map(e => e.id), 'the par view projects bindings only');
  assert.deepEqual(SYS_AS_UML(all, ibd).model.edges.filter(e => e.type === 'uml.Connector').map(e => e.id), M18.edges.map(e => e.id), 'the ibd connectors only');
  assert.equal(P.view.diagram, 'uml.composite-structure'); assert.equal(par.diagram, 'sysml.parametric', 'the model is not edited');
});
test('asUml gives models the composite type validates with the problems listed here', () => {
  const all = atlas(), say = (m, v) => { const P = SYS_AS_UML(m, v); return csProblems(P.model, P.view).map(p => p.message); };
  const typed = n => `part-type: part "${n[0]}" of "EBike" is typed "${n[1]}", which names no class or component, so it shows only the ports its connectors reach through it`;
  const values = [['batteryCapacity', 'Energy'], ['usableShare', 'Real'], ['ecoConsumption', 'EnergyPerDistance'], ['boostConsumption', 'EnergyPerDistance'], ['ecoRange', 'Distance'], ['boostRange', 'Distance']].map(typed);
  assert.deepEqual(say(M18, M18.views[0]), []);
  assert.deepEqual(say(M19, M19.views[0]), values);
  assert.deepEqual(say(...withView(M17, { id: 'x', diagram: 'sysml.internal-block', subject: 'ebike', nodeIds: ['ebike'] })), [typed(['wheels', 'Wheel'])]);
  assert.deepEqual(say(...withView(M16, { id: 'x', diagram: 'sysml.internal-block', subject: 'battery', nodeIds: ['battery'] })), []);
  assert.deepEqual(say(all, all.views.find(v => v.id === 'inside-ebike')), [typed(['wheels', 'Wheel']), ...values]);
  assert.deepEqual(say(all, all.views.find(v => v.id === 'range-analysis')), values);
});
test('the texts the layout measures are set before it: an item flow is a connector\'s label, «proxy» and «full» before a port\'s name, ~ off its type, a reference shared', () => {
  const m = structuredClone(M18), b = m.nodes.find(n => n.id === 'battery');
  b.members[0].props = { kind: 'proxy', valueType: '~ChargeInterface' }; b.members[1].props = { kind: 'full', valueType: 'DCPower' };
  const P = SYS_AS_UML(m, m.views[0]), pb = P.model.nodes.find(n => n.id === 'battery'), eb = P.model.nodes.find(n => n.id === 'ebike');
  assert.deepEqual(pb.members.map(x => [x.type, x.label, (x.props || {}).valueType]), [['uml.Port', '«proxy» charge', 'ChargeInterface'], ['uml.Port', '«full» power', 'DCPower'], ['uml.Port', 'bus', undefined]]);
  assert.equal(eb.members.find(x => x.id === 'ebike.dock').props.aggregation, 'shared');
  assert.deepEqual(P.model.edges.map(e => e.label ?? null), ['DCPower', 'DCPower', 'PhaseCurrent', null, null, null]);
  const g = csGeo({ model: P.model, view: P.view, pos: {}, memo: {} });
  assert.deepEqual(g.edges.map(e => e.label ?? null), ['DCPower', 'DCPower', 'PhaseCurrent', null, null, null], 'the router gives the item room');
  assert.ok(g.nodes.some(n => n.id === 'ebike.battery->battery.charge' && n.label === '«proxy» charge'));
  assert.equal(m.nodes.find(n => n.id === 'battery').members[0].label, 'charge', 'the model is not edited');
  delete b.members[2].label; b.members[2].props = { kind: 'proxy' };
  assert.equal(SYS_AS_UML(m, m.views[0]).model.nodes.find(n => n.id === 'battery').members[2].label, '«proxy» battery.bus', 'a port with no label: its id, as the composite type names it');
});
// §8.1, §15.2: the filter by view kind keeps the other kind's members out, and the merged four's other nodes and views add
// nothing; what still differs is data the targets carry differently: the merged subject holds members of the view's kind
// other files give it, and 17 gives the parts multiplicities and battery.charge a type 18 does not. With the file's own
// nodes put back in the merged model, each view is its file's picture (what M3.7's atlas settles, §15.2)
test('each e-bike view laid out from the merged four is its own file\'s picture once the file\'s nodes agree', () => {
  const pic = (m, v) => { const P = SYS_AS_UML(m, v); return svgOf(SYS_DRESS(csGeo({ model: P.model, view: P.view, pos: {}, memo: {} }), m, v), { title: 't' }).replace(/\bg\d+-/g, 'g-'); };
  for (const [M, extra] of [[M18, ['ebike.wheels', 'ebike.batteryCapacity', 'ebike.usableShare', 'ebike.ecoConsumption', 'ebike.boostConsumption', 'ebike.ecoRange', 'ebike.boostRange']], [M19, ['ebike.rangeEq']]]) {
    const all = atlas(), v = all.views.find(x => x.id === M.views[0].id), own = pic(M, M.views[0]);
    assert.notEqual(pic(all, v), own);
    assert.deepEqual(kept(all, v).filter(id => !kept(M, M.views[0]).includes(id)), extra, 'what the merged subject adds of the view\'s kind');
    all.nodes = all.nodes.map(n => structuredClone(M.nodes.find(x => x.id === n.id) || n));
    assert.equal(pic(all, v), own, v.id);
  }
});

// ---- mapped back (§8.1)
test('what the composite type\'s hooks add on the projection takes its SysML type, and no command writes «proxy» or an item into the model', () => {
  const m = structuredClone(M18), v = m.views[0], P = SYS_AS_UML(m, v), back = r => SYS_BACK(r, m, v);
  m.nodes.find(n => n.id === 'battery').members[2].props = { kind: 'proxy' };
  const P2 = SYS_AS_UML(m, v);
  const c = back(csConnect(P2.model, P2.view, 'ebike.motor->motor.phases', 'ebike.rearLight->light.power', null, { type: 'uml.Connector', label: 'Connector' }));
  assert.equal(c.length, 1); assert.equal(c[0].element.type, 'sysml.Connector'); assert.deepEqual(c[0].element.props, { ends: { from: { part: 'ebike.motor' }, to: { part: 'ebike.rearLight' } } });
  assert.ok(!('label' in c[0].element));
  const part = back(csMember(P.model, P.view, 'ebike', null, 'spare : Battery')), value = back(csMember(P.model, P.view, 'ebike', null, 'mass : Real'));
  assert.deepEqual([part[0].element.type, value[0].element.type], ['sysml.PartProperty', 'sysml.ValueProperty']);
  const port = back(csMember(P.model, P.view, 'ebike', null, 'port plug : ChargeInterface'));
  assert.equal(port[0].element.type, 'sysml.Port');
  const ren = back(csRename(P2.model, P2.view, 'ebike.battery->battery.bus', 'canbus'));
  assert.ok(ren.commands.every(x => typeof x.value !== 'string' || !x.value.includes('«')), JSON.stringify(ren));
  assert.deepEqual(back({ commands: [{ op: 'set', id: 'battery.bus', path: 'label', value: '«proxy» bus2' }], say: 's' }).commands[0].value, 'bus2');
  const ref = back([{ op: 'add', owner: 'ebike', element: { id: 'r', type: 'uml.Property', label: 'r', props: { valueType: 'Dock', aggregation: 'shared' } } }]);
  assert.deepEqual(ref[0].element, { id: 'r', type: 'sysml.ReferenceProperty', label: 'r', props: { valueType: 'Dock' } });
  assert.deepEqual(back({ error: 'no' }), { error: 'no' }); assert.equal(back(null), null);
  const pick = back({ pick: ['a'], then: () => [{ op: 'add', element: { id: 'k', type: 'uml.Connector', from: 'a', to: 'b' } }] });
  assert.equal(pick.then(0)[0].element.type, 'sysml.Connector');
  // parametric: a binding, a constraint property, a value, a parameter of a constraint block
  const pm = M19, pv = pm.views[0], PP = SYS_AS_UML(pm, pv), pb = r => SYS_BACK(r, pm, pv);
  const bind = pb(csConnect(PP.model, PP.view, 'ebike.ecoRange', 'ebike.boost->range-equation.range', null, { type: 'uml.Connector', label: 'Binding' }));
  assert.deepEqual([bind[0].element.type, bind[0].element.props], ['sysml.BindingConnector', { ends: { to: { part: 'ebike.boost' } } }]);
  assert.deepEqual(pb([{ op: 'add', owner: 'ebike', element: { id: 'q', type: 'uml.Property', label: 'q', props: { valueType: 'RangeEquation' } } }])[0].element.type, 'sysml.ConstraintProperty');
  assert.deepEqual(pb([{ op: 'add', owner: 'ebike', element: { id: 'q', type: 'uml.Property', label: 'q', props: { valueType: 'Distance' } } }])[0].element.type, 'sysml.ValueProperty');
  assert.deepEqual(pb([{ op: 'add', owner: 'range-equation', element: { id: 'q', type: 'uml.Port', label: 'q' } }])[0].element.type, 'sysml.ConstraintParameter');
  // a property added to a constraint block is a parameter, not a value it may not hold (§7.3); typed by a constraint block, a constraint property
  assert.deepEqual(pb([{ op: 'add', owner: 'range-equation', element: { id: 'q', type: 'uml.Property', label: 'q', props: { valueType: 'Distance' } } }])[0].element.type, 'sysml.ConstraintParameter');
  assert.deepEqual(pb([{ op: 'add', owner: 'range-equation', element: { id: 'q', type: 'uml.Property', label: 'q', props: { valueType: 'RangeEquation' } } }])[0].element.type, 'sysml.ConstraintProperty');
});

// ---- problems re-said (§8.1)
test('the composite type\'s problems are kept where their words fit, in SysML\'s words: part-type for parts and references only', () => {
  assert.deepEqual(SYS_CS_PROBLEMS(M18, M18.views[0]), []);
  assert.deepEqual(SYS_CS_PROBLEMS(M19, M19.views[0]), [], 'value properties are value-type\'s to judge');
  const m = structuredClone(M18), v = m.views[0];
  m.nodes[0].members.push({ id: 'ebike.ghost', type: 'sysml.PartProperty', label: 'ghost', props: { valueType: 'Nothing' } }, { id: 'ebike.mass', type: 'sysml.ValueProperty', label: 'mass', props: { valueType: 'Mass' } });
  m.edges.push({ id: 'bad', type: 'sysml.Connector', from: 'motor.phases', to: 'light.power', props: { ends: { from: { part: 'ebike.battery' }, to: { part: 'ebike.rearLight' } } } },
    { id: 'self', type: 'sysml.Connector', from: 'ebike', to: 'battery.bus', props: { ends: { to: { part: 'ebike.battery' } } } });
  const got = SYS_CS_PROBLEMS(m, v);
  assert.deepEqual(got.map(p => [p.level, p.rule, p.path, p.ids, p.message]), [
    ['warning', 'part-type', 'nodes[0].members[6].props.valueType', ['ebike.ghost', 'ebike'], 'part-type: part "ghost" of "EBike" is typed "Nothing", which names no block, so it shows only the ports its connectors reach through it'],
    ['error', 'connector-part', 'edges[6].from', ['bad', 'motor.phases', 'ebike.battery'], 'connector-part: bad\'s from end "phases" is not a port of "Battery", the type of "battery"'],
    ['error', 'connector-scope', 'edges[7].from', ['self', 'ebike'], 'connector-scope: self\'s from end is "EBike" itself: a connector joins the subject\'s ports and parts']]);
  // parametric: a binding through a value property, not a constraint property
  const p = structuredClone(M19); p.edges.push({ id: 'b2', type: 'sysml.BindingConnector', from: 'ebike.ecoRange', to: 'range-equation.range', props: { ends: { to: { part: 'ebike.missing' } } } });
  assert.deepEqual(SYS_CS_PROBLEMS(p, p.views[0]).map(x => x.message), ['connector-part: b2\'s to end goes through "ebike.missing", not a constraint property of the subject',
    'connector-scope: b2 joins "ecoRange" and "range", which lie in no structure of this view: its ends are the subject\'s parameters and properties']);
});

// ---- the frame (§5)
test('the header: kind [ElementType] name [view title]; [Model] and the model\'s title with no subject; a title equal to the name left out', () => {
  assert.deepEqual(SYS_HEAD(M18, M18.views[0]), { el: M18.nodes[0], title: 'ibd [Block] EBike [Inside the e-bike]', aria: 'Internal block diagram of block EBike: Inside the e-bike' });
  assert.equal(SYS_HEAD(M19, M19.views[0]).title, 'par [Block] EBike [E-bike range]');
  assert.deepEqual(SYS_HEAD(M17, M17.views[0]), { el: null, title: 'bdd [Model] E-bike: blocks [E-bike blocks]', aria: 'Block definition diagram of model E-bike: blocks: E-bike blocks' });
  assert.equal(SYS_HEAD(M16, M16.views[0]).title, 'req [Model] E-bike: requirements [E-bike requirements]');
  const pk = { title: 'T', nodes: [{ id: 'eb', type: 'uml.Package', label: 'E-bike' }, { id: 'cb', type: 'sysml.ConstraintBlock', label: 'RangeEquation' }] };
  assert.deepEqual(SYS_HEAD(pk, { id: 'v', diagram: 'sysml.block-definition', subject: 'eb', title: 'E-bike blocks' }), { el: pk.nodes[0], title: 'bdd [Package] E-bike [E-bike blocks]', aria: 'Block definition diagram of package E-bike: E-bike blocks' });
  assert.equal(SYS_HEAD(pk, { id: 'v', diagram: 'sysml.block-definition', subject: 'eb', title: 'E-bike' }).title, 'bdd [Package] E-bike');
  assert.deepEqual(SYS_HEAD(pk, { id: 'v', diagram: 'sysml.parametric', subject: 'cb' }), { el: pk.nodes[1], title: 'par [ConstraintBlock] RangeEquation', aria: 'Parametric diagram of constraint block RangeEquation' });
  assert.equal(SYS_HEAD(pk, { id: 'v', diagram: 'sysml.requirement', subject: 'nowhere', title: 'R' }).title, 'req [Model] T [R]');
  // each kind names only its own element types (§17): a block on a bdd, a package on an ibd, a constraint block on an ibd: [Model]
  const bk = { title: 'T', nodes: [...pk.nodes, { id: 'b', type: 'sysml.Block', label: 'B' }] };
  assert.equal(SYS_FRAME(bk, { id: 'v', diagram: 'sysml.block-definition', subject: 'b' }, ['b']).id, 'v->frame', 'no box shares a card\'s id');
  assert.equal(SYS_HEAD(bk, { id: 'v', diagram: 'sysml.block-definition', subject: 'b' }).title, 'bdd [Model] T');
  assert.equal(SYS_HEAD(bk, { id: 'v', diagram: 'sysml.internal-block', subject: 'eb' }).title, 'ibd [Model] T');
  assert.equal(SYS_HEAD(bk, { id: 'v', diagram: 'sysml.internal-block', subject: 'cb' }).title, 'ibd [Model] T');
  assert.equal(SYS_HEAD(bk, { id: 'v', diagram: 'sysml.parametric', subject: 'b' }).title, 'par [Block] B');
  // no subject and a package with no id: no match on undefined
  const f = SYS_FRAME({ title: 'T', nodes: [{ type: 'uml.Package', label: 'X' }] }, { id: 'v', diagram: 'sysml.requirement' }, []);
  assert.deepEqual([f.id, f.title], ['v->frame', 'req [Model] T']);
});
test('a req or bdd frame is a box of the layout: the package subject\'s id, else <view>->frame; 38 px above its cards', () => {
  const pk = { title: 'T', nodes: [{ id: 'eb', type: 'uml.Package', label: 'E-bike' }] };
  assert.deepEqual(SYS_FRAME(pk, { id: 'v', diagram: 'sysml.block-definition', subject: 'eb', title: 'B' }, ['a']),
    { id: 'eb', label: 'bdd [Package] E-bike [B]', title: 'bdd [Package] E-bike [B]', nodeIds: ['a'], shape: 'sysml-frame', head: 14, aria: 'Block definition diagram of package E-bike: B' });
  assert.equal(SYS_FRAME(pk, { id: 'v', diagram: 'sysml.requirement' }, []).id, 'v->frame');
  // laid out down and right: its head is on top either way (laid out down, the turned layout's left), the tag above its cards
  for (const direction of ['right', 'down']) {
    const nodes = ['a', 'b', 'c'].map((id, i) => ({ id, label: id, shape: 'classifier', kind: 'file', w: 120, h: 60, col: i % 2, row: i >> 1 }));
    const g = layoutTyped({ nodes, edges: [{ id: 'e', from: 'a', to: 'b' }], containers: [SYS_FRAME({ title: 'E-bike: blocks' }, { id: 'v', diagram: 'sysml.block-definition', title: 'E-bike blocks' }, ['a', 'b', 'c'])], direction, gap: 96, rgap: 56 });
    const F = g.families[0], top = Math.min(...g.nodes.map(n => n.y)), left = Math.min(...g.nodes.map(n => n.x));
    assert.deepEqual([top - F.y, left - F.x], [64, 48], direction);
    assert.ok(tagSize(F.title).h + 8 <= top - F.y && tagSize(F.title).w <= F.w, direction);
  }
});
test('the frame shape: a rectangle and the pentagon tag, the tag cut to a narrow frame, its title selectable as a box\'s', () => {
  const f = { id: 'v->frame', x: 10, y: 20, w: 600, h: 300, title: 'bdd [Model] E-bike: blocks [E-bike blocks]' }, s = SHAPE['sysml-frame'].frame(f);
  assert.match(s, /^<rect class="family-box" x="10" y="20" width="600" height="300" stroke="var\(--um-muted\)"\/><path d="M10 20H/);
  assert.match(s, /<text class="family-title" data-t="ft" data-o="v-&gt;frame" [^>]*>bdd \[Model\] E-bike: blocks \[E-bike blocks\]<\/text>$/);
  const n = SHAPE['sysml-frame'].frame({ ...f, w: 80 });
  assert.match(n, /M10 20H90V/, 'the tag no wider than the frame'); assert.match(n, />[^<]*…<\/text>$/, 'its text cut');
});
test('ibd and par: the subject\'s box is the frame; a subject with ports and no parts, and one with nothing, is a frame too, its ports on it', () => {
  const g = SYS_DRESS(geoOf(M18, M18.views[0]), M18, M18.views[0]), f = g.families.find(x => x.id === 'ebike');
  assert.deepEqual([f.shape, f.title, f.aria], ['sysml-frame', 'ibd [Block] EBike [Inside the e-bike]', 'Internal block diagram of block EBike: Inside the e-bike']);
  const one = mem => ({ schemaVersion: 2, title: 'T', nodes: [{ id: 'b', type: 'sysml.Block', label: 'B', members: mem }, { id: 'c', type: 'uml.Comment', label: 'note' }], edges: [],
    views: [{ id: 'v', diagram: 'sysml.internal-block', subject: 'b', title: 'Inside', nodeIds: ['b', 'c'] }] });
  for (const m of [one([]), one([{ id: 'b.p', type: 'sysml.Port', label: 'p', props: { kind: 'proxy' } }, { id: 'b.q', type: 'sysml.Port', label: 'q' }])]) {
    const v = m.views[0], raw = geoOf(m, v), was = JSON.stringify(raw), d = SYS_DRESS(raw, m, v), F = d.families.find(x => x.id === 'b');
    assert.ok(F && F.shape === 'sysml-frame' && F.title === 'ibd [Block] B [Inside]' && F.w > 0 && F.h > 0, JSON.stringify(d.families));
    assert.ok(!d.nodes.some(n => n.id === 'b') && !Object.hasOwn(d.byId, 'b') && Object.hasOwn(d.byId, 'c'));
    d.nodes.filter(n => n.owner === 'b').forEach(p => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      assert.ok([Math.abs(cx - F.x), Math.abs(cx - F.x - F.w)].some(x => x < .51) || [Math.abs(cy - F.y), Math.abs(cy - F.y - F.h)].some(x => x < .51), `${p.id} on the frame's border`); });
    assert.equal(JSON.stringify(raw), was, 'what the layout returned is not edited');
    // a line to the subject keeps its end, as it does when the subject holds parts (the composite type's box): a box, no card
    const ml = structuredClone(m); ml.edges.push({ id: 'cl', type: 'uml.CommentLink', from: 'c', to: 'b' });
    const dl = SYS_DRESS(geoOf(ml, ml.views[0]), ml, ml.views[0]);
    assert.ok(dl.edges.some(e => e.id === 'cl' && e.to === 'b' && e.pts.length >= 2) && !Object.hasOwn(dl.byId, 'b') && dl.families.some(x => x.id === 'b'));
    const svg = svgOf(d, { title: 't' });
    assert.match(svg, /<g class="family" data-family="b" role="img" aria-label="Internal block diagram of block B: Inside"><rect class="family-box"/);
  }
});
test('dressing lays the same picture out twice from one memo, and renames by SysML\'s names when given', () => {
  const memo = {}, pic = () => svgOf(SYS_DRESS(geoOf(M19, M19.views[0], memo), M19, M19.views[0]), { title: 't' }).replace(/\bg\d+-/g, 'g-'); // svgOf numbers each picture's markers
  assert.equal(pic(), pic());
  const g = SYS_DRESS(geoOf(M18, M18.views[0]), M18, M18.views[0], id => (id === 'ebike.battery' ? 'Part battery : Battery' : id === 'battery-dock-charge' ? 'Connector carrying DCPower' : null));
  assert.equal(g.byId['ebike.battery'].aria, 'Part battery : Battery'); assert.equal(g.nodes.find(n => n.id === 'ebike.battery'), g.byId['ebike.battery']);
  assert.equal(g.edges.find(e => e.id === 'battery-dock-charge').aria, 'Connector carrying DCPower');
  assert.match(g.edges.find(e => e.id === 'battery-controller-bus').aria, /^Connector from bus of battery to bus of controller/);
});

// ---- the classifier (§6.1, §7.1) and the crosshair (§6.2)
test('a titled compartment draws its name as a muted, centred first row, counted in its size; ariaOwn replaces the accessible name', () => {
  const m = (title, extra = {}) => ({ id: 'b', label: 'EBike', type: 'sysml.Block', stereotypes: ['block'], compartments: [{ name: 'parts', title, members: [{ type: 'sysml.PartProperty', label: 'battery', props: { valueType: 'Battery' } }] }], ...extra });
  const plain = SHAPE.classifier.size(m(undefined)), titled = SHAPE.classifier.size(m(true));
  assert.equal(titled.h - plain.h, 15);
  const s = SHAPE.classifier.draw({ ...m(true, { ariaOwn: 'Block EBike, 1 part' }), x: 0, y: 0, ...titled }, 'c', 'f');
  assert.match(s, /aria-label="Block EBike, 1 part"/);
  assert.match(s, /<g class="c-comp" data-comp="parts" [^>]*><path [^>]*\/><text x="\d+(\.\d+)?" y="[\d.]+" text-anchor="middle" class="c-title" fill="var\(--um-muted\)" [^>]*>parts<\/text><text [^>]*class="c-row"[^>]*>battery: Battery<\/text>/);
  const u = SHAPE.classifier.draw({ ...m(undefined), x: 0, y: 0, ...plain }, 'c', 'f');
  assert.ok(!u.includes('c-title') && u.includes('aria-label="Block EBike (block), 1 part"'), 'no title, no ariaOwn: as before');
});
test('the crosshair end: a 14 px hollow circle with a cross, drawn as a typed line\'s end (tests/notation.html: its tip on the outline)', () => {
  const [L, H, , fill] = ENDS.crosshair;
  assert.deepEqual([L, H, fill], [14, 7, 'hollow']);
  const n = (id, x) => ({ id, x, y: 0, w: 100, h: 40, shape: 'classifier', k: 'file', label: id, compartments: [] });
  const nodes = [n('a', 0), n('b', 300)], byId = Object.fromEntries(nodes.map(x => [x.id, x]));
  const s = svgOf({ nodes, edges: [{ from: 'a', to: 'b', pts: [[100, 20], [300, 20]], aria: 'Containment', end: { from: 'none', to: 'crosshair' } }], groups: [], bounds: { x: 0, y: 0, w: 400, h: 40 }, byId }, { title: 't' });
  assert.match(s, /<marker id="[^"]+-crosshair-d" markerWidth="14" markerHeight="14" refX="14" refY="7"[^>]*><path d="M0 7A7 7 0 1 0 14 7A7 7 0 1 0 0 7ZM7 0V14M0 7H14" fill="var\(--um-stage-bg\)"/);
  assert.match(s, /marker-end="url\(#[^)]+-crosshair-d\)"/);
});

// ---- the canvas (§5.1): a frame that is no element
function editor(model, picked = []) {
  const got = [], I = typedEditor({ root: null, stage: null, can: () => true, say() {}, status() {}, emit: c => got.push(c), view: () => 'v', model: () => model, picked: () => picked, sel: () => picked[0] || null,
    geo: () => ({ byId: {}, nodes: [] }), cam: () => null, focus() {}, touch() {} });
  return { I, got };
}
test('a card dropped on a frame that is no element is reparented to the view\'s subject, or to none; Delete on that frame emits nothing', () => {
  const m = (subject) => ({ schemaVersion: 2, nodes: [{ id: 'eb', type: 'uml.Package', label: 'E-bike' }, { id: 'pk', type: 'uml.Package', label: 'inner', parent: 'eb' }, { id: 'a', type: 'sysml.Block', label: 'A', parent: 'pk' }],
    edges: [], views: [{ id: 'v', diagram: 'sysml.block-definition', nodeIds: ['eb', 'pk', 'a'], ...(subject ? { subject } : {}) }] });
  const drop = (model, into, from) => { const { I, got } = editor(model); I.drop({ id: 'a', col: 0, row: 0 }, { col: 0, row: 0, x: 0, y: 0 }, into, from); return got; };
  assert.deepEqual(drop(m(), 'v->frame', 'pk'), [[{ op: 'reparent', id: 'a', parent: null }]]);
  assert.deepEqual(drop(m('eb'), 'v->frame', 'pk'), [[{ op: 'reparent', id: 'a', parent: 'eb' }]]);
  assert.deepEqual(drop(m(), 'eb', 'pk'), [[{ op: 'reparent', id: 'a', parent: 'eb' }]], 'a box that is an element: as before');
  assert.deepEqual(drop(m('eb'), null, 'pk'), [[{ op: 'reparent', id: 'a', parent: 'eb' }]], 'out of every box: as before');
  for (const fromModel of [false, true]) { const { I, got } = editor(m(), [{ type: 'container', id: 'v->frame' }]); assert.equal(I.remove(fromModel), false); assert.deepEqual(got, []); }
});
