// SysML's internal block diagram, sysml.internal-block (work package M3.4, notes/milestone-3.md §8, §13): the type's
// definition, 18-internal-block.json drawn in its frame through M3.1's projection, ports on their parts' borders and the
// frame's, «proxy» and item names measured by the layout, a port's flow arrow and an item flow's triangle, names, reading
// order, the legend, describe(), each rule of §8.4 passing and failing (delegation and assembly each), the editing hooks on
// the projection mapped back to SysML's types, a 30-step session saved and reopened, the PDF's words, rows and line text, and
// the common edits' time with the projection's. tests/internal-block.html draws it in a browser and edits it by pointer and
// keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
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
import { SYS_AS_UML } from '../src/sysml/sysml.js';
import { SYS_IB_SPOT } from '../src/sysml/internal.js';

const M18 = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/18-internal-block.json', import.meta.url)));
const T = diagramOf({ diagram: 'sysml.internal-block' }), VID = 'inside-ebike';
const node = (m, id) => m.nodes.find(n => n.id === id), mem = (m, id) => m.nodes.flatMap(n => n.members || []).find(x => x.id === id);
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const errors = m => validate(m).filter(p => p.level === 'error');
const run = (m, r) => apply(m, Array.isArray(r) ? r : r.commands);
const ownerOf = (g, id) => g.byId[id] || g.families.find(f => f.id === id);
// 18 with what §8.2 draws: proxy ports of an interface block, one conjugated, a full port of one with both ways, and the
// subject's own port delegating to a part's
function rich() {
  const m = structuredClone(M18);
  mem(m, 'battery.charge').props = { kind: 'proxy', valueType: 'ChargeInterface' };
  mem(m, 'dock.charge').props = { kind: 'proxy', valueType: '~ChargeInterface' };
  mem(m, 'controller.supply').props = { kind: 'full', valueType: 'PowerIn' };
  const fp = (id, d) => ({ id, type: 'sysml.FlowProperty', label: id.split('.').pop(), props: { valueType: 'DCPower', direction: d } });
  m.nodes.push({ id: 'charge-interface', type: 'sysml.InterfaceBlock', label: 'ChargeInterface', members: [fp('charge-interface.dc', 'in')] },
    { id: 'power-in', type: 'sysml.InterfaceBlock', label: 'PowerIn', members: [fp('power-in.dc', 'in'), fp('power-in.soc', 'out')] });
  node(m, 'ebike').members.push({ id: 'ebike.plug', type: 'sysml.Port', label: 'plug', props: { kind: 'proxy', valueType: 'ChargeInterface' } });
  m.edges.push({ id: 'plug-battery', type: 'sysml.Connector', from: 'ebike.plug', to: 'battery.charge', props: { ends: { to: { part: 'ebike.battery' } } } });
  return m;
}
const RICH = rich(), V = RICH.views[0];

test('the definition: sysml.internal-block with its palette, two lines, §8.5\'s properties, the cascade on a part, its hooks', () => {
  assert.equal(T.name, 'sysml.internal-block');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['sysml.PartProperty', 'Part'], ['sysml.ReferenceProperty', 'Reference'], ['sysml.ValueProperty', 'Value'], ['sysml.Port', 'Port'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['sysml.Connector', 'Connector'], ['uml.CommentLink', 'Comment link']]);
  assert.deepEqual(T.props['sysml.Port'].map(f => [f.key, f.kind]), [['valueType', 'text'], ['kind', 'enum'], ['stereotypes', 'list']]);
  assert.deepEqual(T.props['sysml.Connector'].map(f => [f.path, f.kind]), [[['itemFlow', 'item'], 'text'], [['itemFlow', 'direction'], 'enum'], [undefined, 'list']]);
  assert.deepEqual(T.refs, { 'sysml.Connector': { 'props.ends.from.part': 'cascade', 'props.ends.to.part': 'cascade' } });
  assert.equal(T.layout.rank, false);
  for (const k of ['layout', 'draw', 'validate', 'describe', 'word', 'rows', 'text']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'member', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(Object.keys(T.rules), ['subject-block', 'connector-part', 'connector-scope', 'connector-drawn', 'part-type', 'item-flow', 'port-compatible']);
  assert.deepEqual(['sysml.Block', 'sysml.InterfaceBlock', 'uml.Comment'].map(t => T.member.holds({ type: t })), [true, false, false]);
});

test('18-internal-block.json draws clean in its frame, right and down: parts inside, every port centred on its part\'s border or the frame\'s, validates with no problem', () => {
  assert.deepEqual(validate(M18), []); assert.deepEqual(validate(RICH), []);
  for (const m of [M18, RICH]) for (const direction of ['right', 'down']) {
    const d = withDir(m, direction), g = layout(d, VID), F = g.families.find(f => f.id === 'ebike'), tag = `${m === RICH ? 'rich' : '18'}, ${direction}`;
    assert.deepEqual(check(d, VID), [], `${tag}: no overlap, no crossing, no line through a node`);
    assert.deepEqual([F.shape, F.title], ['sysml-frame', 'ibd [Block] EBike [Inside the e-bike]'], tag);
    node(m, 'ebike').members.filter(x => x.type !== 'sysml.Port').forEach(x => { const b = g.byId[x.id];
      assert.ok(b.x >= F.x && b.y >= F.y && b.x + b.w <= F.x + F.w && b.y + b.h <= F.y + F.h, `${tag}: ${x.id} in the frame`); });
    const ports = g.nodes.filter(n => n.shape === 'port');
    assert.equal(ports.length, m === RICH ? 12 : 11, tag);
    ports.forEach(n => { const o = ownerOf(g, n.owner), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      assert.ok({ L: Math.abs(cx - o.x), R: Math.abs(cx - o.x - o.w), T: Math.abs(cy - o.y), B: Math.abs(cy - o.y - o.h) }[n.side] < .01, `${tag}: ${n.id} on ${o.id}'s border`); });
    if (m === RICH) assert.equal(g.byId['ebike.plug'].owner, 'ebike', 'the subject\'s port on the frame');
  }
});

test('the texts the layout measures: «proxy» and «full» in a port\'s name with its type, ~ kept; an item flow is its line\'s label, given room', () => {
  const g = layout(RICH, VID), by = g.byId;
  assert.deepEqual(['ebike.plug', 'ebike.battery->battery.charge', 'ebike.dock->dock.charge', 'ebike.controller->controller.supply'].map(id => by[id].nameBox.text),
    ['«proxy» plug : ChargeInterface', '«proxy» charge : ChargeInterface', '«proxy» charge : ~ChargeInterface', '«full» supply : PowerIn']);
  const L = Object.fromEntries(g.edges.map(e => [e.id, (e.lbl || {}).text]));
  assert.deepEqual([L['battery-dock-charge'], L['battery-feeds-controller'], L['controller-drives-motor'], L['battery-controller-bus']], ['DCPower', 'DCPower', 'PhaseCurrent', undefined]);
  // a name box is as wide as its text: measured with «proxy», not drawn over what it was measured without
  const nb = by['ebike.dock->dock.charge'].nameBox; assert.ok(nb.w > 150, JSON.stringify(nb));
  assert.equal(mem(RICH, 'dock.charge').label, 'charge', 'the model is not edited');
});

test('a port typed by an interface block shows its flow: in, out (~ turns it round), both; drawn in its square pointing into or out of its owner', () => {
  const g = layout(RICH, VID), by = g.byId, F = ['ebike.plug', 'ebike.battery->battery.charge', 'ebike.dock->dock.charge', 'ebike.controller->controller.supply', 'ebike.battery->battery.power'];
  assert.deepEqual(F.map(id => by[id].flow), ['in', 'in', 'out', 'inout', undefined]);
  const { over } = T.draw(g), ds = [...over.matchAll(/<path class="ib-flow" d="([^"]+)"/g)].map(x => x[1]), paths = ds.flatMap(d => [...d.matchAll(/M([\d.-]+) ([\d.-]+)L/g)].map(x => [+x[1], +x[2]]));
  assert.deepEqual([ds.length, paths.length], [4, 5], 'one triangle each for in and out, two for both, a path for each port');
  assert.match(over, /^<g class="ib-marks" aria-hidden="true">/);
  // each one-way arrow's tip, against its square's centre, points into its owner (in) or out of it (out)
  for (const id of ['ebike.battery->battery.charge', 'ebike.dock->dock.charge', 'ebike.plug']) { const n = by[id], o = ownerOf(g, n.owner), c = [n.x + n.w / 2, n.y + n.h / 2];
    const tip = paths.find(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < 5), inward = [o.x + o.w / 2 - c[0], o.y + o.h / 2 - c[1]];
    const dot = (tip[0] - c[0]) * inward[0] + (tip[1] - c[1]) * inward[1];
    assert.ok(n.flow === 'in' ? dot > 0 : dot < 0, `${id}: ${n.flow}`); }
});

test('an item flow\'s triangle: filled, on its line\'s longest segment, pointing the way it flows, 12 px off the label', () => {
  for (const direction of ['right', 'down']) { const g = layout(withDir(RICH, direction), VID), { over } = T.draw(g);
    for (const id of ['battery-dock-charge', 'battery-feeds-controller', 'controller-drives-motor']) { const e = g.edges.find(x => x.id === id), it = e.item, L = e.lbl;
      assert.ok(it, `${direction}: ${id} has a triangle`);
      assert.match(over, new RegExp(`<path class="ib-item" data-edge="${id}" d="M[^"]+Z" fill="var\\(--um-muted\\)"/>`));
      assert.ok(it.x + 16 <= L.x || it.x - 16 >= L.x + L.w || it.y + 16 <= L.y || it.y - 16 >= L.y + L.h, `${direction}: ${id} 12 px off its label`);
      // on a segment of the line, and pointing along it toward the end the item flows to
      const k = e.pts.slice(1).findIndex((q, j) => { const p = e.pts[j]; return Math.abs((q[0] - p[0]) * (it.y - p[1]) - (q[1] - p[1]) * (it.x - p[0])) < .01 && it.x >= Math.min(p[0], q[0]) - .01 && it.x <= Math.max(p[0], q[0]) + .01 && it.y >= Math.min(p[1], q[1]) - .01 && it.y <= Math.max(p[1], q[1]) + .01; });
      assert.ok(k >= 0, `${direction}: ${id} on its line`);
      const seg = [e.pts[k + 1][0] - e.pts[k][0], e.pts[k + 1][1] - e.pts[k][1]], along = seg[0] * it.u[0] + seg[1] * it.u[1], dir = mem(RICH, id) ? null : RICH.edges.find(x => x.id === id).props.itemFlow.direction;
      assert.ok(dir === 'from-to' ? along > 0 : along < 0, `${direction}: ${id} points ${dir}`); }
    assert.ok(!g.edges.find(x => x.id === 'battery-controller-bus').item, 'no item flow, no triangle'); }
  // the spot: the middle of the longest segment; slid off a label; the middle when no spot is clear
  assert.deepEqual(SYS_IB_SPOT({ pts: [[0, 0], [10, 0], [10, 100]] }), { x: 10, y: 50, u: [0, 1] });
  const s = SYS_IB_SPOT({ pts: [[0, 0], [200, 0]], lbl: { x: 80, y: -9, w: 40, h: 18 } }); assert.ok(s.x <= 80 - 16 || s.x >= 120 + 16, JSON.stringify(s));
  assert.deepEqual(SYS_IB_SPOT({ pts: [[0, 0], [20, 0]], lbl: { x: 0, y: -9, w: 20, h: 18 } }), { x: 10, y: 0, u: [1, 0] });
  assert.equal(SYS_IB_SPOT({ pts: [[0, 0]] }), null);
});

test('names, reading order, legend and describe() (§13)', () => {
  const g = layout(RICH, VID), by = g.byId, E = Object.fromEntries(g.edges.map(e => [e.id, e.aria]));
  assert.equal(g.families[0].aria, 'Internal block diagram of block EBike: Inside the e-bike');
  assert.equal(by['ebike.battery'].aria, 'Part battery: Battery, in EBike, 3 ports');
  assert.equal(by['ebike.dock'].aria, 'Reference dock: Dock [0..1], in EBike, 1 port');
  assert.equal(by['ebike.dock->dock.charge'].aria, 'Proxy port charge: ChargeInterface of dock, conjugated, flow out');
  assert.equal(by['ebike.controller->controller.supply'].aria, 'Full port supply: PowerIn of controller, flow in and out');
  assert.equal(by['ebike.plug'].aria, 'Proxy port plug: ChargeInterface of EBike, flow in');
  assert.equal(by['ebike.motor->motor.phases'].aria, 'Port phases of motor');
  assert.equal(E['battery-feeds-controller'], 'Connector from power of battery to supply of controller, carrying DCPower from power to supply');
  assert.equal(E['battery-dock-charge'], 'Connector from charge of battery to charge of dock, carrying DCPower from charge of dock to charge of battery');
  assert.equal(E['plug-battery'], 'Connector from plug of EBike to charge of battery');
  assert.deepEqual(g.order.slice(0, 4), ['ebike', 'ebike.plug', 'ebike.battery', 'ebike.battery->battery.charge']);
  assert.deepEqual(g.order.slice(-7), RICH.edges.map(e => e.id));
  assert.deepEqual(g.legend.map(s => s.match(/<b>(.*?)<\/b>/)[1]), ['Connector', 'Item flow', 'Proxy port', 'Full port']);
  assert.deepEqual(layout(M18, VID).legend.map(s => s.match(/<b>(.*?)<\/b>/)[1]), ['Connector', 'Item flow'], 'only what is drawn');
  const said = describe(RICH, VID).split('\n');
  assert.equal(said[0], 'Inside the e-bike: an internal block diagram of 19 elements and 7 lines.');
  assert.equal(said[1], 'Internal block diagram of block EBike: Inside the e-bike.');
  assert.equal(said.length, 1 + 19 + 7); assert.equal(said.at(-1), 'Connector from plug of EBike to charge of battery.');
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(RICH, { memos }).buildView(VID), second = mapContext(RICH, { memos }).buildView(VID);
  assert.equal(unid(second.markup), unid(first.markup)); assert.equal(unid(mapContext(RICH).buildView(VID).markup), unid(first.markup));
  assert.match(first.markup, /class="ib-item"/); assert.match(first.markup, /class="ib-flow"/);
});

/* ---- validators (§8.4): each rule passes RICH and fails on a model that breaks it, naming its rule and elements, at its level ---- */
const conn = (id, from, to, ends, more = {}) => ({ id, type: 'sysml.Connector', from, to, props: { ...(ends ? { ends } : {}), ...more } });
const RULE_CASES = {
  'subject-block': [m => { m.views[0].subject = 'battery'; }, 'error'],
  'connector-part': [m => { m.edges.find(e => e.id === 'battery-controller-bus').props.ends.from.part = 'ebike.motor'; }, 'error'],
  'connector-scope': [m => { m.edges.push(conn('bare', 'ebike', 'battery.bus', { to: { part: 'ebike.battery' } })); }, 'error'],
  'connector-drawn': [m => { node(m, 'ebike').members.push({ id: 'ebike.plug2', type: 'sysml.Port', label: 'plug2' }); m.edges.push(conn('loop', 'ebike.plug', 'ebike.plug2')); }, 'warning'],
  'part-type': [m => { mem(m, 'ebike.motor').props.valueType = 'Nothing'; }, 'warning'],
  'item-flow': [m => { m.edges[0].props.itemFlow.direction = 'sideways'; }, 'warning'],
};
test('validators: each rule passes the rich example and fails on a model that breaks it, at its level', () => {
  assert.deepEqual(Object.keys(RULE_CASES), Object.keys(T.rules).filter(r => r !== 'port-compatible'));
  for (const [rule, [breakIt, level]] of Object.entries(RULE_CASES)) { const m = structuredClone(RICH); breakIt(m);
    const got = validate(m).filter(p => p.rule === rule);
    assert.equal(got.length, 1, `${rule}: ${JSON.stringify(validate(m))}`); assert.equal(got[0].level, level, rule);
    assert.ok(got[0].message.startsWith(rule + ': ') && got[0].ids.length, rule); }
  // a view with no subject at all (deleted, or hidden from it): a warning, as the composite type's
  const none = structuredClone(RICH); delete none.views[0].subject;
  assert.deepEqual(validate(none).filter(p => p.rule === 'subject-block').map(p => p.level), ['warning']);
  // in SysML's words; an item that is no text
  const m = structuredClone(RICH); RULE_CASES['part-type'][0](m);
  assert.match(validate(m).find(p => p.rule === 'part-type').message, /names no block, so it shows only the ports its connectors reach through it$/);
  const t = structuredClone(RICH); t.edges[0].props.itemFlow = { item: 7, direction: 'to-from' };
  assert.deepEqual(validate(t).map(p => [p.rule, p.path]), [['item-flow', 'edges[0].props.itemFlow']]);
});
test('port-compatible, assembly: two parts\' proxy ports of one interface block meet conjugate; both conjugated or neither warned; other ports not judged', () => {
  const m = structuredClone(RICH); mem(m, 'dock.charge').props.valueType = 'ChargeInterface';
  const got = validate(m);
  assert.deepEqual(got.map(p => [p.level, p.rule, p.path, p.ids]), [['warning', 'port-compatible', 'edges[0]', ['battery-dock-charge', 'battery.charge', 'dock.charge']]]);
  assert.equal(got[0].message, 'port-compatible: battery-dock-charge joins "charge" of "battery" and "charge" of "dock", proxy ports typed ChargeInterface neither conjugated: one end is conjugated (~), so what flows out of one flows into the other');
  mem(m, 'battery.charge').props.valueType = '~ChargeInterface'; mem(m, 'dock.charge').props.valueType = '~ChargeInterface';
  m.edges.find(e => e.id === 'plug-battery').props.ends = {}; m.edges.pop(); // the delegation out of the way
  assert.match(validate(m).map(p => p.message).join(), /both conjugated/);
  // a full port, or two interface blocks, are not this rule's
  const f = structuredClone(RICH); mem(f, 'dock.charge').props = { kind: 'full', valueType: 'ChargeInterface' };
  assert.deepEqual(validate(f).filter(p => p.rule === 'port-compatible'), []);
  // an interface block whose flow properties are all inout: neither conjugated (or both) flows both ways at each end, passing
  for (const vt of ['ChargeInterface', '~ChargeInterface']) { const io = structuredClone(RICH); node(io, 'charge-interface').members[0].props.direction = 'inout';
    mem(io, 'battery.charge').props.valueType = vt; mem(io, 'dock.charge').props.valueType = vt; mem(io, 'ebike.plug').props.valueType = vt;
    assert.deepEqual(validate(io).filter(p => p.rule === 'port-compatible'), [], vt); }
  const mixed = structuredClone(RICH); node(mixed, 'charge-interface').members.push({ id: 'charge-interface.x', type: 'sysml.FlowProperty', label: 'x', props: { direction: 'inout' } });
  mem(mixed, 'dock.charge').props.valueType = 'ChargeInterface';
  assert.equal(validate(mixed).filter(p => p.rule === 'port-compatible').length, 1, 'one in among inouts: warned');
});
test('port-compatible, delegation: the frame\'s port and a part\'s port of one type, conjugated alike; another type or one ~ warned', () => {
  for (const [vt, ok] of [['ChargeInterface', true], ['~ChargeInterface', false], ['PowerIn', false]]) { const m = structuredClone(RICH); mem(m, 'ebike.plug').props.valueType = vt;
    const got = validate(m).filter(p => p.rule === 'port-compatible');
    assert.equal(got.length, ok ? 0 : 1, vt);
    if (!ok) assert.equal(got[0].message, `port-compatible: plug-battery delegates "plug" of "EBike" (${vt}) to "charge" of "battery" (ChargeInterface): a delegation joins ports of one type, conjugated alike, so both flow the same way`); }
  const u = structuredClone(RICH); delete mem(u, 'ebike.plug').props.valueType;
  assert.deepEqual(validate(u).filter(p => p.rule === 'port-compatible'), [], 'an untyped end: not judged');
});

/* ---- editing (§8.5): the composite type's hooks on the projection, mapped back ---- */
test('connect: a connector drawn from the canvas is a sysml.Connector through its parts, carrying no projected label; a comment link to a port refused', () => {
  const r = T.edits.connect(RICH, V, 'ebike.motor->motor.phases', 'ebike.rearLight->light.power', null, { type: 'sysml.Connector', label: 'Connector' });
  assert.deepEqual(r, [{ op: 'add', element: { id: 'connector', type: 'sysml.Connector', from: 'motor.phases', to: 'light.power', props: { ends: { from: { part: 'ebike.motor' }, to: { part: 'ebike.rearLight' } } } }, view: VID }]);
  const m = run(RICH, r); assert.deepEqual(errors(m), []); assert.ok(layout(m, VID).edges.some(e => e.id === 'connector'));
  const d = T.edits.connect(RICH, V, 'ebike.plug', 'ebike.dock->dock.charge', null, { type: 'sysml.Connector' });
  assert.deepEqual(d[0].element, { id: 'connector', type: 'sysml.Connector', from: 'ebike.plug', to: 'dock.charge', props: { ends: { to: { part: 'ebike.dock' } } } }, 'a delegation');
  assert.ok(!JSON.stringify([r, d]).includes('«') && !('label' in r[0].element));
  assert.equal(T.edits.connect(RICH, V, 'ebike.motor', 'ebike.dock', null, { type: 'sysml.Connector' }), null, 'part to part: the default');
  assert.ok(T.edits.connect(RICH, V, 'ebike.motor->motor.phases', 'ebike.dock', null, { type: 'uml.CommentLink', label: 'Comment link' }).error);
});
test('add: a part, a reference and a value into the subject by their palette entries; a port into the subject or a selected part\'s type', () => {
  const E = l => T.elements.find(e => e.label === l);
  assert.deepEqual(T.edits.add(RICH, V, E('Part'), 'spare : Battery [0..1]', null), [{ op: 'add', element: { id: 'ebike.spare', type: 'sysml.PartProperty', label: 'spare', props: { valueType: 'Battery', multiplicity: '0..1' } }, owner: 'ebike' }]);
  assert.equal(T.edits.add(RICH, V, E('Reference'), 'station : Dock', null)[0].element.type, 'sysml.ReferenceProperty');
  assert.equal(T.edits.add(RICH, V, E('Value'), 'mass : Mass', null)[0].element.type, 'sysml.ValueProperty');
  const m = run(RICH, T.edits.add(RICH, V, E('Reference'), 'station : Dock', null)), g = layout(m, VID);
  assert.ok(g.byId['ebike.station'].shared, 'a reference drawn dashed'); assert.deepEqual(errors(m), []);
  assert.deepEqual(T.edits.add(RICH, V, E('Port'), 'service', { sel: ['ebike'] }), [{ op: 'add', element: { id: 'ebike.service', type: 'sysml.Port', label: 'service', props: {} }, owner: 'ebike' }]);
  const p = T.edits.add(RICH, V, E('Port'), 'temp', { sel: ['ebike.battery'] });
  assert.equal(p.commands[0].owner, 'battery'); assert.equal(p.commands[0].element.type, 'sysml.Port'); assert.match(p.say, /the type of battery/);
  assert.equal(T.edits.add(RICH, V, E('Comment'), 'note', null), null);
});
test('remove, rename, moveTo and member rows on the projection: SysML\'s types back, no «proxy» written, a port\'s kind by its row', () => {
  let r = T.edits.remove(RICH, V, ['ebike.battery'], false);
  assert.deepEqual(r.commands, [{ op: 'delete', id: 'ebike.battery' }]); assert.match(r.say, /part battery of EBike and its 4 lines/);
  const m = run(RICH, r); assert.deepEqual(m.edges.map(e => e.id), ['controller-drives-motor', 'controller-front-light', 'controller-rear-light'], 'its connectors go with it (refs)');
  assert.deepEqual(errors(m), []);
  r = T.edits.rename(RICH, V, 'ebike.dock->dock.charge', 'inlet');
  assert.deepEqual(r.commands, [{ op: 'set', id: 'dock.charge', path: 'label', value: 'inlet' }]);
  assert.deepEqual(T.edits.rename(RICH, V, 'ebike.dock->dock.charge', 'charge').commands, [], 'its own name: nothing set (the projection\'s name carries «proxy»)');
  const geo = layout(RICH, VID);
  assert.deepEqual(T.edits.moveTo(RICH, V, 'ebike.plug', { by: [0, 1], geo }).error.slice(0, 16), 'A port\'s place a');
  assert.equal(T.edits.moveTo(RICH, V, 'ebike.plug', { by: [1, 0], geo })[0].value, 'right');
  assert.deepEqual(T.edits.member(RICH, V, 'ebike', null, 'proxy port aux : ChargeInterface'), [{ op: 'add', element: { id: 'ebike.aux', type: 'sysml.Port', label: 'aux', props: { valueType: 'ChargeInterface', kind: 'proxy' } }, owner: 'ebike' }]);
  assert.equal(T.edits.member(RICH, V, 'ebike', null, 'ref home : Dock')[0].element.type, 'sysml.ReferenceProperty');
  assert.equal(T.edits.member(RICH, V, 'ebike', null, 'mass : Real')[0].element.type, 'sysml.ValueProperty');
  assert.deepEqual(T.edits.member(RICH, V, 'ebike', 'ebike.plug', 'full port plug : ChargeInterface'), [{ op: 'set', id: 'ebike.plug', path: 'props.kind', value: 'full' }]);
  assert.deepEqual(T.edits.member(RICH, V, 'ebike', 'ebike.plug', 'port plug : ChargeInterface'), [{ op: 'set', id: 'ebike.plug', path: 'props.kind', value: undefined }]);
  assert.deepEqual(node(RICH, 'ebike').members.map(T.member.print).slice(-2), ['ref dock : Dock [0..1]', 'proxy port plug : ChargeInterface']);
  assert.equal(T.member.print(mem(RICH, 'dock.charge')), 'proxy port charge : ~ChargeInterface');
  assert.ok(T.member.add('x', node(RICH, 'ebike')).error && T.member.edit(mem(RICH, 'ebike.battery'), 'x').error);
});
test('a port\'s ~ and kind by F2 and its row, both ways; nothing changed says nothing; a row keeps its member\'s kind', () => {
  const P = 'ebike.dock->dock.charge', set = (path, value) => [{ op: 'set', id: 'dock.charge', path, value }];
  assert.deepEqual(T.edits.rename(RICH, V, P, 'charge : ChargeInterface').commands, set('props.valueType', 'ChargeInterface'), 'F2 takes the ~ off');
  assert.deepEqual(T.edits.rename(RICH, V, P, 'charge : ~ChargeInterface'), { commands: [] }, 'its own type: nothing set, nothing said');
  assert.deepEqual(T.edits.rename(RICH, V, P, 'charge'), { commands: [] });
  assert.deepEqual(T.edits.rename(RICH, V, P, '«full» charge').commands, set('props.kind', 'full'), '«full» in F2: the kind');
  assert.deepEqual(T.edits.member(RICH, V, 'dock', 'dock.charge', 'proxy port charge : ChargeInterface'), set('props.valueType', 'ChargeInterface'), 'the row takes the ~ off');
  const off = run(RICH, T.edits.member(RICH, V, 'dock', 'dock.charge', 'proxy port charge : ChargeInterface'));
  assert.deepEqual(T.edits.member(off, off.views[0], 'dock', 'dock.charge', 'proxy port charge : ~ChargeInterface'), set('props.valueType', '~ChargeInterface'), 'and puts it back');
  assert.match(T.edits.member(RICH, V, 'ebike', 'ebike.battery', 'proxy port battery : Battery').error, /keeps its member's kind/);
  assert.match(T.edits.member(RICH, V, 'ebike', 'ebike.battery', 'ref battery : Battery').error, /keeps its member's kind/);
  assert.deepEqual(T.edits.member(RICH, V, 'ebike', 'ebike.dock', 'ref dock : Dock [1]'), [{ op: 'set', id: 'ebike.dock', path: 'props.multiplicity', value: '1' }], 'a reference\'s own row');
});
test('a block\'s card is named a block; an item flow with no direction is no label; a lone ~ conjugates nothing', () => {
  const b = structuredClone(RICH); b.views[0].nodeIds.push('battery');
  assert.ok(describe(b, VID).split('\n').includes('Block Battery.'));
  const n = structuredClone(RICH); n.views[0].subject = null; assert.equal(describe(n, VID).split('\n')[1], 'Block EBike.');
  const f = structuredClone(RICH); f.edges[0].props.itemFlow = { item: 'Data' };
  const g = layout(f, VID), e = g.edges.find(x => x.id === f.edges[0].id);
  assert.equal(e.label, undefined); assert.equal(e.item, undefined); assert.doesNotMatch(mapContext(f).buildView(VID).markup, />Data</);
  assert.deepEqual(validate(f).map(p => p.rule), ['item-flow']);
  const w = structuredClone(RICH); mem(w, 'battery.charge').props.valueType = '~';
  assert.equal(layout(w, VID).byId['ebike.battery->battery.charge'].aria, 'Proxy port charge of battery');
});
test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const E = l => T.elements.find(e => e.label === l), steps = [];
  for (let i = 0; i < 5; i++) { const w = steps.reduce((m, s) => apply(m, s), RICH), v = w.views[0];
    const part = T.edits.add(w, v, E('Part'), `p${i} : Light [1]`, null), pid = part[0].element.id, w2 = apply(w, part);
    const c = T.edits.connect(w2, w2.views[0], `${pid}->light.power`, 'ebike.controller->controller.lights', null, { type: 'sysml.Connector' }).map(x => ({ ...x, element: { ...x.element, id: `c${i}` } }));
    steps.push(part, c, [{ op: 'set', id: `c${i}`, path: ['props', 'itemFlow'], value: { item: `Light${i}`, direction: 'to-from' } }],
      T.edits.member(w2, w2.views[0], 'ebike', null, `proxy port q${i} : ChargeInterface`),
      T.edits.rename(w2, w2.views[0], pid, `r${i} : Light [0..1]`),
      i % 2 ? T.edits.remove(w2, w2.views[0], [pid], false).commands : [{ op: 'set', view: VID, path: ['present', 'ebike.plug', 'side'], value: 'bottom' }]);
  }
  assert.equal(steps.length, 30);
  const h = history(RICH), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(errors(h.model), [], `step ${seen.length - 1}`); }
  assert.ok(!seen[30].includes('«') && !seen[30].includes('uml.Connector') && !seen[30].includes('uml.Port'), 'SysML\'s types only');
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const flat = g => JSON.stringify(g, (k, v) => (k === 'ms' ? undefined : v));
  assert.equal(flat(layout(reopened, VID)), flat(layout(JSON.parse(seen[30]), VID)));
  assert.equal(describe(reopened, VID), describe(JSON.parse(seen[30]), VID));
});

test('the PDF (§13): words, rows, a connector\'s item flow as its line text', () => {
  assert.deepEqual(['ebike.battery', 'ebike.dock', 'ebike.plug', 'controller.supply', 'motor.phases', 'ebike', 'charge-interface', 'nope'].map(id => T.word(RICH, id)),
    ['Part', 'Reference', 'Proxy port', 'Full port', 'Port', 'Block', 'Interface block', null]);
  assert.deepEqual(T.rows(RICH, V, 'ebike.dock'), ['dock: Dock [0..1]']);
  assert.deepEqual(T.rows(RICH, V, 'dock.charge'), ['ChargeInterface, conjugated', 'flow out']);
  assert.deepEqual(T.rows(RICH, V, 'ebike').slice(5, 8), ['ref dock : Dock [0..1]', 'proxy port plug : ChargeInterface', 'Connector from charge of battery to charge of dock, carrying DCPower from charge of dock to charge of battery']);
  assert.equal(T.rows(RICH, V, 'battery'), null);
  assert.deepEqual(['battery-dock-charge', 'battery-feeds-controller', 'battery-controller-bus', 'nope'].map(id => T.text(RICH, V, id)), ['DCPower, dock to battery', 'DCPower, battery to controller', null, null]);
  const ctx = mapContext(RICH), tables = tablesOf(ctx, ctx.V[VID], ctx.buildGeo(VID)), cards = tables.find(t => t.cls === 'cards');
  // the connectors join members, which the Lines table leaves out: the subject's rows carry them, as the composite type's (0.22.0)
  assert.ok(cards.rows.some(r => r.includes('carrying DCPower from power to supply')), cards.rows.join('\n'));
  assert.ok(T.rows(RICH, V, 'ebike').some(r => /carrying DCPower/.test(r)));
});

/* ---- P1 (§14): 30 parts, 60 connectors; an item flow set (its label grows) and a part added, the projection's time beside ---- */
function stress() {
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'sysml.Block', label: 'Big', members: [{ id: 's.in', type: 'sysml.Port', label: 'in', props: { kind: 'proxy', valueType: 'Io' } }] }, { id: 'io', type: 'sysml.InterfaceBlock', label: 'Io', members: [{ id: 'io.x', type: 'sysml.FlowProperty', label: 'x', props: { direction: 'in' } }] }], edges: [], views: [{ id: 'all', diagram: 'sysml.internal-block', subject: 's', nodeIds: ['s'] }] };
  for (let k = 0; k < 5; k++) m.nodes.push({ id: `t${k}`, type: 'sysml.Block', label: `Type${k}`, members: ['a', 'b'].map(p => ({ id: `t${k}.${p}`, type: 'sysml.Port', label: p, props: { kind: 'proxy', valueType: p === 'a' ? 'Io' : '~Io' } })) });
  for (let i = 0; i < 30; i++) m.nodes[0].members.push({ id: `s.p${i}`, type: 'sysml.PartProperty', label: `part${i}`, props: { valueType: `Type${i % 5}` } });
  for (let i = 0; m.edges.length < 60; i++) { const a = i % 30, b = (i * 7 + 3) % 30; if (a === b) continue;
    m.edges.push(conn(`c${i}`, `t${a % 5}.a`, `t${b % 5}.b`, { from: { part: `s.p${a}` }, to: { part: `s.p${b}` } }, i % 3 ? {} : { itemFlow: { item: `Item${i}`, direction: 'from-to' } })); }
  return m;
}
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('P1 (§14): 30 parts, 60 connectors: an item flow set and a part added, each laid out and drawn, and a full layout under 1 s in CI, the edits\' times against the 100 ms target and the projection\'s printed (CPU, best of seven after a warm-up; the maintainer\'s decision of 13 Nov 2026) (timed)', () => {
  const M = stress(), memos = {}, draw = m => mapContext(m, { memos }).buildView('all').markup;
  assert.equal(M.edges.length, 60); assert.equal(layout(M, 'all').nodes.filter(n => n.shape === 'part').length, 30);
  const flow = k => apply(M, [{ op: 'set', id: 'c1', path: ['props', 'itemFlow'], value: { item: 'Flow' + 'x'.repeat(k + 1), direction: 'to-from' } }]);
  const add = k => apply(M, T.edits.add(M, M.views[0], T.elements[0], `extra${k} : Type1`, null));
  draw(M); draw(flow(20)); draw(add(20)); // the warm-up
  const runs = Array.from({ length: 7 }, (_, k) => { const was = memos.all.runs, f = flow(k), a = add(k);
    const r = { full: cpu(() => mapContext(M).buildView('all')), flow: cpu(() => draw(f)), add: cpu(() => draw(a)), proj: cpu(() => SYS_AS_UML(M, M.views[0])) };
    assert.equal(memos.all.runs, was + 2, 'each edit lays the view out again'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  for (const k of ['full', 'flow', 'add']) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
  console.log(`# P1 internal block: an item flow set ${best('flow').toFixed(1)} ms, a part added ${best('add').toFixed(1)} ms (target 100 ms), full layout ${best('full').toFixed(1)} ms, the projection ${best('proj').toFixed(2)} ms`);
});

test('the type ships in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ["registerDiagramType('sysml.internal-block'", 'function SYS_IB_GEO(']) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});
