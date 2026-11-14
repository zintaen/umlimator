// The BPMN XML adapter (notes/milestone-4b.md §12, 4b.4): read(write(model)) equals the model for the BPMN example and
// 500 generated models, ids included; tests/import/descriptive.bpmn (every row of Table 2.1 and the extras) and
// weakened.bpmn read with their reports pinned (R1); the diagram interchange written from given geometry, as moddle reads
// it back; hostile files, many references among them, read or refused in under a second each, never thrown (R2).
//
// bpmn-moddle is never a dependency (D8): CI installs bpmn-moddle@10.3.1 and its four dependencies, each pinned
// (decision 24), with --no-save in a scratch folder named by UMLIMATOR_BPMN_MODDLE. Without it, the tests that need it
// say they skipped, except in CI, where the first test fails:
//   npm install --no-save --prefix /tmp/moddle bpmn-moddle@10.3.1 moddle@8.2.1 moddle-xml@12.3.2 min-dash@5.1.0 saxen@11.2.0
//   UMLIMATOR_BPMN_MODDLE=/tmp/moddle npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBpmnXml as read, writeBpmnXml as write } from '../src/readers/bpmn-xml.js';

const folder = process.env.UMLIMATOR_BPMN_MODDLE || process.cwd();
let BpmnModdle = null, why = '';
try { ({ BpmnModdle } = await import(pathToFileURL(createRequire(path.join(folder, 'x')).resolve('bpmn-moddle')))); } catch (e) { why = e.message.split('\n')[0]; }
const needs = { skip: !BpmnModdle && `bpmn-moddle is not in ${folder}: set UMLIMATOR_BPMN_MODDLE to a folder that has it (${why})` };
const file = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const example = JSON.parse(file('../examples/bookshop-order-to-shipment.json'));

// order is not meaning for nodes, lines or a view's nodes (a pool's lanes keep theirs)
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const canon = m => ({ ...m, nodes: [...m.nodes].sort(byId), edges: [...m.edges].sort(byId), views: m.views.map(v => ({ ...v, nodeIds: [...v.nodeIds].sort() })) });
const R5 = { line: '', status: 'skipped', message: 'positions and sizes in the diagram interchange are not kept: umlimator lays each view out (R5)' };
const roundTrip = async m => { const w = await write(m, m.root, null, BpmnModdle()); return [w, await read(w.xml, BpmnModdle())]; };

test('bpmn-moddle is found where UMLIMATOR_BPMN_MODDLE says; in CI its absence fails', t => {
  if (!BpmnModdle && !process.env.CI) return t.skip(needs.skip);
  assert.ok(BpmnModdle, `CI installs bpmn-moddle and names its folder in UMLIMATOR_BPMN_MODDLE: ${needs.skip}`);
});

test('the adapter imports nothing and package.json names no bpmn-moddle (D8)', () => {
  assert.doesNotMatch(file('../src/readers/bpmn-xml.js'), /^\s*import\b|\bimport\(|\brequire\(/m);
  assert.doesNotMatch(file('../package.json'), /moddle/);
});

test('read(write(model)) is the BPMN example, ids included; the writer reports nothing, the reader only positions', needs, async () => {
  const [w, back] = await roundTrip(example);
  assert.deepEqual(w.report, []);
  assert.deepEqual(back.report, [R5]);
  assert.deepEqual(canon(back.model), canon(example));
  // BPMN as a modelling tool writes it: pools with their processes, a black-box pool with none, lanes naming their
  // flow nodes, a collapsed sub-process whose own diagram is its view, data associations both ways
  assert.match(w.xml, /<bpmn:participant id="bp-bookshop" name="Bookshop" processRef="bp-bookshop-process" \/>/);
  assert.match(w.xml, /<bpmn:participant id="bp-payment-provider" name="Payment provider" \/>/);
  assert.match(w.xml, /<bpmn:lane id="bp-sales" name="Sales">\s+<bpmn:flowNodeRef>order-received<\/bpmn:flowNodeRef>/);
  assert.match(w.xml, /<bpmn:boundaryEvent id="payment-timeout" name="No answer in 2 minutes" attachedToRef="bp-take-payment">\s+<bpmn:timerEventDefinition \/>/);
  assert.match(w.xml, /<bpmndi:BPMNShape id="pick-pack_di" bpmnElement="pick-pack" isExpanded="false">/);
  assert.match(w.xml, /<bpmndi:BPMNDiagram id="pick-and-pack" name="Pick and pack">\s+<bpmndi:BPMNPlane id="pick-and-pack-plane" bpmnElement="pick-pack">/);
  assert.match(w.xml, /<bpmn:dataInputAssociation id="d-order-in">\s+<bpmn:sourceRef>bp-order<\/bpmn:sourceRef>/);
  assert.match(w.xml, /<bpmn:startEvent id="order-received" name="Order received">\s+<bpmn:dataOutputAssociation id="d-order-out">/);
});

// a seeded model in the subset: pools (black-box ones among them) with nested lanes, every node and line type, sub-
// processes nested and opened in views of their own, groups, documentation, and ids and names XML must escape
function generated(seed) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648, pick = a => a[Math.floor(rnd() * a.length)], some = p => rnd() < p;
  let k = 0;
  const id = () => `${pick(['n', '1n', 'n x', 'né', 'n<&>"\'', '_n', 'n.n', '__proto__', 'n\n', '中'])}${k++}`;
  const text = () => pick(['Take payment', 'a "quoted" <name> & more', 'two\nlines', 'Ünïcödé 中文 😀', "it's", '  spaced  ']);
  const named = () => (some(.8) ? { label: text() } : {}), doc = () => (some(.2) ? { documentation: text() } : {});
  const nodes = [], edges = [], pools = [], lanes = [], subs = [];
  const node = (type, parent, props = {}) => { const n = { id: id(), type, ...named(), ...(parent ? { parent } : {}) }; props = { ...props, ...doc() };
    if (Object.keys(props).length) n.props = props; nodes.push(n); return n; };
  for (let p = Math.floor(rnd() * 4); p > 0; p--) {
    const pool = node('bpmn.Participant', null, some(.3) ? { processRef: `proc${k}` } : {});
    pools.push(pool);
    const ms = []; // pre-order, as a lane set reads back
    const lane = (up, depth) => { const m = { id: id(), type: 'bpmn.Lane', ...named(), ...(up ? { parent: up } : {}) }, d = doc();
      if (d.documentation) m.props = d; ms.push(m); lanes.push(m); if (depth < 2) for (let c = Math.floor(rnd() * 3); c > 0; c--) lane(m.id, depth + 1); };
    for (let c = Math.floor(rnd() * 3); c > 0; c--) lane(null, 0);
    if (ms.length) pool.members = ms;
  }
  const holders = () => [null, ...pools.map(p => p.id), ...lanes.map(l => l.id), ...subs.map(x => x.id)];
  const flow = [], acts = [];
  for (let c = 1 + Math.floor(rnd() * 14); c > 0; c--) {
    const kind = pick(['Task', 'Task', 'SubProcess', 'CallActivity', 'StartEvent', 'EndEvent', 'IntermediateCatchEvent', 'IntermediateThrowEvent', 'BoundaryEvent', 'ExclusiveGateway', 'ParallelGateway']);
    const parent = pick(holders()), defs = { StartEvent: ['none', 'message', 'timer'], EndEvent: ['none', 'message', 'terminate'], IntermediateCatchEvent: ['message', 'timer'], IntermediateThrowEvent: ['none', 'message'], BoundaryEvent: ['message', 'timer'] };
    if (kind === 'BoundaryEvent' && !acts.length) continue;
    const def = kind in defs && pick(defs[kind]); // a default left out at times: the reader fills it in (filled)
    const props = kind === 'Task' ? (some(.8) ? { taskType: pick(['none', 'user', 'service']) } : {}) : kind === 'CallActivity' && some(.5) ? { calledElement: text() }
      : def ? { ...(def === 'none' && some(.5) ? {} : { definition: def }), ...(kind === 'BoundaryEvent' ? { attachedTo: pick(acts).id, ...(some(.7) ? { cancelActivity: some(.5) } : {}) } : {}) } : {};
    const n = node(`bpmn.${kind}`, parent, props);
    flow.push(n);
    if (['Task', 'SubProcess', 'CallActivity'].includes(kind)) acts.push(n);
    if (kind === 'SubProcess') subs.push(n);
  }
  const top = () => pick([null, ...pools.map(p => p.id)]), data = [], notes = [], groups = [];
  for (let c = Math.floor(rnd() * 3); c > 0; c--) data.push(node('bpmn.DataObject', top()));
  for (let c = Math.floor(rnd() * 3); c > 0; c--) data.push(node('bpmn.DataStoreReference', top(), some(.6) ? { dataStoreRef: pick(['Stock', 'CRM']) } : {}));
  for (let c = Math.floor(rnd() * 3); c > 0; c--) notes.push(node('bpmn.TextAnnotation', top()));
  for (let c = Math.floor(rnd() * 3); c > 0; c--) groups.push(node('bpmn.Group', top()));
  for (const n of [...flow, ...data, ...notes, ...pools]) if (groups.length && some(.3)) n.props = { ...n.props, categoryValueRef: [...new Set([pick(groups).id, pick(groups).id])] };
  const line = (type, from, to, props = {}) => { const e = { id: id(), type, from: from.id, to: to.id, ...(type.endsWith('Flow') ? named() : {}) };
    props = { ...props, ...doc() }; if (Object.keys(props).length) e.props = props; edges.push(e); };
  for (let c = Math.floor(rnd() * 12); c > 0 && flow.length; c--) line('bpmn.SequenceFlow', pick(flow), pick(flow));
  for (let c = Math.floor(rnd() * 4); c > 0 && pools.length; c--) line('bpmn.MessageFlow', pick([...flow, ...pools]), pick([...flow, ...pools]));
  for (const n of notes) if (some(.7)) line('bpmn.Association', n, pick([...flow, ...data, ...notes]), some(.5) ? { direction: pick(['one', 'both']) } : {});
  const into = flow.filter(n => ['bpmn.Task', 'bpmn.SubProcess', 'bpmn.CallActivity', 'bpmn.EndEvent', 'bpmn.IntermediateThrowEvent'].includes(n.type));
  const outOf = flow.filter(n => ['bpmn.Task', 'bpmn.SubProcess', 'bpmn.CallActivity', 'bpmn.StartEvent', 'bpmn.IntermediateCatchEvent', 'bpmn.BoundaryEvent'].includes(n.type));
  for (const d of data) {
    if (into.length && some(.6)) line('bpmn.DataAssociation', d, pick(into));
    if (outOf.length && some(.6)) line('bpmn.DataAssociation', pick(outOf), d);
  }
  // views: the top one, and one inside some sub-processes, which opens it; every node in a view
  const root = { id: id(), diagram: 'bpmn', ...(some(.7) ? { title: text() } : {}), parent: null, nodeIds: nodes.filter(() => some(.8)).map(n => n.id) };
  const views = [root];
  for (const sp of subs) if (some(.5)) {
    const v = { id: id(), diagram: 'bpmn', ...(some(.5) ? { title: text() } : {}), parent: null, subject: sp.id, nodeIds: nodes.filter(n => n.parent === sp.id && some(.8)).map(n => n.id) };
    views.push(v); sp.opensView = v.id;
  }
  for (const n of nodes) if (!views.some(v => v.nodeIds.includes(n.id))) root.nodeIds.push(n.id);
  for (const v of views) if (v.subject) v.parent = (views.find(w => w !== v && w.nodeIds.includes(v.subject)) || {}).id ?? null;
  return { schemaVersion: 2, ...(some(.5) ? { title: text() } : {}), root: root.id, nodes, edges, views };
}

// the defaults the reader writes out (row 24: a task's kind none, an event's definition none, cancelActivity true)
const DEFAULTS = { 'bpmn.Task': { taskType: 'none' }, 'bpmn.StartEvent': { definition: 'none' }, 'bpmn.EndEvent': { definition: 'none' },
  'bpmn.IntermediateThrowEvent': { definition: 'none' }, 'bpmn.BoundaryEvent': { cancelActivity: true } };
const filled = m => ({ ...m, nodes: m.nodes.map(n => (DEFAULTS[n.type] ? { ...n, props: { ...DEFAULTS[n.type], ...n.props } } : n)) });

test('read(write(model)) equals the model, its defaults filled in, for 500 generated models in the subset', needs, async () => {
  let left = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const m = generated(seed), [w, back] = await roundTrip(m);
    left += m.nodes.filter(n => DEFAULTS[n.type] && Object.keys(DEFAULTS[n.type]).some(k => !(n.props && k in n.props))).length;
    assert.deepEqual(w.report, [], `seed ${seed}`);
    assert.deepEqual(back.report.filter(x => x !== R5 && x.message !== R5.message), [], `seed ${seed}\n${w.xml}`);
    assert.deepEqual(canon(back.model), canon(filled(m)), `seed ${seed}\n${w.xml}`);
  }
  assert.ok(left > 100, left); // the generated models leave defaults out often enough to test the filling
});

test('an id that is not an XML name is written escaped, the model\'s id in umlimator:id; a view\'s id apart from the nodes\'', needs, async () => {
  const m = { schemaVersion: 2, root: 'a', nodes: [{ id: '1 a', type: 'bpmn.Task', props: { taskType: 'none' } }, { id: '_1_20_a', type: 'bpmn.Task', props: { taskType: 'none' } },
    { id: 'a', type: 'bpmn.Group' }], edges: [], views: [{ id: 'a', diagram: 'bpmn', parent: null, nodeIds: ['1 a', '_1_20_a', 'a'] }] };
  const [w, back] = await roundTrip(m);
  assert.match(w.xml, /<bpmn:task id="_1_20_a-2" umlimator:id="1 a" \/>/);
  assert.match(w.xml, /<bpmn:task id="_1_20_a" \/>/);
  assert.match(w.xml, /<bpmndi:BPMNDiagram id="_a" umlimator:id="a">/);
  assert.deepEqual(canon(back.model), canon(m));
});

test('tests/import/descriptive.bpmn: every row of Table 2.1 and the extras, read as the note maps them, and the report pinned (R1, R3)', needs, async () => {
  const xml = file('import/descriptive.bpmn'), { model, report } = await read(xml, BpmnModdle());
  assert.deepEqual(report, [{ line: 'Message_return', status: 'skipped', message: 'Message outside the subset: kept under ext.bpmn, not read' }, R5]);
  assert.deepEqual(model.ext, { bpmn: { skipped: [{ element: { $type: 'bpmn:Message', id: 'Message_return', name: 'Return request' } }] } });
  const node = id => model.nodes.find(n => n.id === id), edge = id => model.edges.find(e => e.id === id);
  assert.equal(model.title, 'Returns');
  // participant (a black-box pool, and one with its process named); laneSet, nested, an empty lane among them
  assert.deepEqual(node('customer'), { id: 'customer', type: 'bpmn.Participant', label: 'Customer' });
  assert.deepEqual(node('shop').props, { processRef: 'Process_returns' });
  assert.deepEqual(node('shop').members, [{ id: 'desk', type: 'bpmn.Lane', label: 'Returns desk', props: { documentation: 'Staffed 9 to 5' } },
    { id: 'desk-front', type: 'bpmn.Lane', label: 'Front', parent: 'desk' }, { id: 'desk-back', type: 'bpmn.Lane', label: 'Back', parent: 'desk' },
    { id: 'store', type: 'bpmn.Lane', label: 'Store room' }]);
  assert.deepEqual(['check-date', 'in-time', 'slow', 'form', 'opened'].map(id => node(id).parent), ['desk-front', 'desk', 'store', 'shop', 'inspect']);
  // tasks, sub-processes expanded and collapsed, call activity, data, annotation, group, documentation
  assert.deepEqual(['refuse', 'check-date', 'photograph'].map(id => node(id).props.taskType), ['none', 'user', 'service']);
  assert.deepEqual(node('check-date').props, { taskType: 'user', documentation: 'Against the delivery date on the order', categoryValueRef: ['group-checks'] });
  assert.deepEqual([node('inspect').opensView, node('restock').opensView], [undefined, 'restock-view']);
  assert.deepEqual(node('tell-customer'), { id: 'tell-customer', type: 'bpmn.CallActivity', label: 'Refund the customer', parent: 'desk', props: { calledElement: 'Refund' } });
  assert.deepEqual(node('form'), { id: 'form', type: 'bpmn.DataObject', label: 'Return form', parent: 'shop' });
  assert.deepEqual(node('crm'), { id: 'crm', type: 'bpmn.DataStoreReference', parent: 'shop', props: { dataStoreRef: 'Customer records' } });
  assert.deepEqual([node('note-policy').label, node('group-checks').label], ['30 days from delivery', 'Checks']);
  // events by kind and definition (Table 2.1; the extras of S1 and decision 21); gateways
  const ev = id => [node(id).type.slice(5), node(id).props.definition];
  assert.deepEqual(['nightly', 'request-in', 'opened', 'refunded', 'refused', 'tidied', 'reply-in', 'no-reply', 'chase', 'noted'].map(ev), [
    ['StartEvent', 'timer'], ['StartEvent', 'message'], ['StartEvent', 'none'], ['EndEvent', 'message'], ['EndEvent', 'terminate'], ['EndEvent', 'none'],
    ['IntermediateCatchEvent', 'message'], ['IntermediateCatchEvent', 'timer'], ['IntermediateThrowEvent', 'message'], ['IntermediateThrowEvent', 'none']]);
  assert.deepEqual([node('slow').props, node('late').props], [{ definition: 'timer', attachedTo: 'inspect', cancelActivity: true }, { definition: 'message', attachedTo: 'inspect', cancelActivity: false }]);
  assert.deepEqual([node('in-time').type, node('split').type], ['bpmn.ExclusiveGateway', 'bpmn.ParallelGateway']);
  // flows, associations both kinds
  assert.deepEqual(edge('f-yes'), { id: 'f-yes', type: 'bpmn.SequenceFlow', from: 'in-time', to: 'split', label: 'yes' });
  assert.deepEqual([edge('m-request'), edge('m-refund').to], [{ id: 'm-request', type: 'bpmn.MessageFlow', from: 'customer', to: 'request-in', label: 'Return request' }, 'customer']);
  assert.deepEqual(edge('a-policy'), { id: 'a-policy', type: 'bpmn.Association', from: 'note-policy', to: 'check-date', props: { direction: 'one' } });
  assert.deepEqual(['d-form-out', 'd-form-in', 'd-crm-write'].map(id => [edge(id).from, edge(id).to]), [['request-in', 'form'], ['form', 'check-date'], ['inspect', 'crm']]);
  assert.equal(model.edges.length, 32);
  // views: a diagram each, the expanded sub-process's contents in the first, the collapsed one's in its own
  assert.deepEqual(model.views.map(v => [v.id, v.title, v.parent, v.subject, v.nodeIds.length]), [['returns', 'Returns', null, undefined, 30], ['restock-view', 'Restock', 'returns', 'restock', 3]]);
  assert.equal(model.root, 'returns');
  assert.deepEqual((await read(xml, BpmnModdle())).model, model); // the same file, the same ids (R3)
});

test('tests/import/weakened.bpmn: conditions, a default, send and receive tasks and a timer\'s time read as plain, each reported weakened and kept', needs, async () => {
  const { model, report } = await read(file('import/weakened.bpmn'), BpmnModdle());
  const w = (line, message) => ({ line, status: 'weakened', message: `${message}: kept under ext.bpmn, read as plain` });
  assert.deepEqual(report, [w('wait-form', 'a receive task'), w('days', 'a gateway\'s default flow'), w('ask-manager', 'a send task'),
    w('an-hour', 'a timer\'s timeDuration'), w('f-short', 'a condition'),
    { line: '', status: 'skipped', message: 'no diagram interchange: every element is in one view, process' }]);
  const node = id => model.nodes.find(n => n.id === id), edge = id => model.edges.find(e => e.id === id);
  assert.deepEqual([node('wait-form').props, node('wait-form').ext, node('ask-manager').ext], [{ taskType: 'none' }, { bpmn: { task: 'receive' } }, { bpmn: { task: 'send' } }]);
  assert.deepEqual([node('days').ext, edge('f-short').ext, edge('f-long').ext, node('an-hour').ext], [{ bpmn: { default: 'f-long' } }, { bpmn: { condition: '${days <= 3}' } }, undefined, { bpmn: { timer: { timeDuration: 'PT1H' } } }]);
  // what gateway-flows and flow-start (4b.3) read: the gateway keeps both flows out, each task its flow in
  assert.deepEqual(model.edges.filter(e => e.from === 'days').map(e => [e.type, e.to, e.label]), [['bpmn.SequenceFlow', 'approve-short', 'up to 3'], ['bpmn.SequenceFlow', 'ask-manager', 'more']]);
  assert.ok(['wait-form', 'approve-short', 'ask-manager'].every(t => model.edges.some(e => e.to === t && e.type === 'bpmn.SequenceFlow')));
  // written plain, and the writer says what it leaves
  const back = await write(model, 'process', null, BpmnModdle());
  assert.doesNotMatch(back.xml, /conditionExpression|default=|sendTask|receiveTask|timeDuration/);
  assert.deepEqual(back.report.map(x => `${x.line}: ${x.message}`), ['wait-form: what it keeps under ext.bpmn: not written', 'days: what it keeps under ext.bpmn: not written',
    'ask-manager: what it keeps under ext.bpmn: not written', 'an-hour: what it keeps under ext.bpmn: not written', 'f-short: what it keeps under ext.bpmn: not written']);
});

test('the diagram interchange is written from the geometry given, and moddle reads it back; other views on a plain grid', needs, async () => {
  const geo = { nodes: [{ id: 'bp-bookshop', x: 10, y: 300, w: 900, h: 400 }, { id: 'bp-sales', x: 40, y: 300, w: 870, h: 200 }, { id: 'bp-take-payment', x: 120, y: 340, w: 100, h: 64 },
    { id: 'payment-timeout', x: 154, y: 388, w: 32, h: 32 }, { id: 'not-paid', x: 300, y: 352, w: 40, h: 40 }],
  edges: [{ id: 'f-timeout', pts: [[170, 420], [170, 440], [320, 440], [320, 392]] }] };
  const { xml, report } = await write(example, 'order-to-shipment', geo, BpmnModdle());
  assert.deepEqual(report, []);
  const { rootElement: defs, warnings } = await BpmnModdle().fromXML(xml);
  assert.deepEqual(warnings, []);
  const [main, inner] = defs.diagrams, shapes = d => new Map(d.plane.planeElement.filter(x => x.$type === 'bpmndi:BPMNShape').map(x => [x.bpmnElement.id, x]));
  const box = x => { const b = x.bounds; return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  for (const g of geo.nodes) assert.deepEqual(box(shapes(main).get(g.id)), { x: g.x, y: g.y, w: g.w, h: g.h }, g.id);
  const edge = main.plane.planeElement.find(x => x.bpmnElement && x.bpmnElement.id === 'f-timeout');
  assert.deepEqual(edge.waypoint.map(p => [p.x, p.y]), geo.edges[0].pts);
  assert.deepEqual(['bp-shopper', 'bp-bookshop', 'bp-sales', 'bp-warehouse'].map(id => shapes(main).get(id).isHorizontal), [true, true, true, true]);
  assert.equal(shapes(main).get('pick-pack').isExpanded, false);
  assert.equal(main.plane.bpmnElement.$type, 'bpmn:Collaboration');
  assert.equal(inner.plane.bpmnElement.id, 'pick-pack');
  // a shape no geometry gives, and every shape of another view, sits on the grid; a line between shapes has two points
  assert.deepEqual(box(shapes(inner).get('picking-starts')), { x: 40, y: 40, w: 36, h: 36 });
  assert.deepEqual(box(shapes(inner).get('pick-books')), { x: 220, y: 40, w: 100, h: 80 });
  assert.deepEqual(inner.plane.planeElement.find(x => x.bpmnElement.id === 'f-pick').waypoint.map(p => [p.x, p.y]), [[58, 58], [270, 80]]);
  assert.equal(main.plane.planeElement.filter(x => x.$type === 'bpmndi:BPMNEdge').length, 26); // every line of the view but the sub-process's own
  // an expanded sub-process: the view lists what it holds
  const open = { ...example, views: [{ ...example.views[0], nodeIds: [...example.views[0].nodeIds, 'picking-starts'] }] };
  const opened = await BpmnModdle().fromXML((await write(open, 'order-to-shipment', null, BpmnModdle())).xml);
  assert.equal(shapes(opened.rootElement.diagrams[0]).get('pick-pack').isExpanded, true);
});

test('the writer reports what it does not write: other diagrams, ext.bpmn, a line BPMN has no place for, a field outside row 24', needs, async () => {
  const m = { schemaVersion: 2, root: 'v', ext: { bpmn: { skipped: [{ element: { $type: 'bpmn:Message' } }] } },
    nodes: [{ id: 'c', type: 'uml.Class' }, { id: 's', type: 'bpmn.StartEvent', props: { definition: 'terminate', colour: 'red' }, kind: 'x' },
      { id: 't', type: 'bpmn.Task', props: { taskType: 'none' } }, { id: 'd', type: 'bpmn.DataObject' }, { id: 'u', type: 'bpmn.Mystery' }],
    edges: [{ id: 'e1', type: 'bpmn.DataAssociation', from: 'd', to: 's' }, { id: 'e2', type: 'bpmn.MessageFlow', from: 's', to: 't' },
      { id: 'e3', type: 'bpmn.Association', from: 't', to: 'd', label: 'x' }, { id: 'e4', type: 'bpmn.SequenceFlow', from: 's', to: 'gone' }],
    views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: ['s', 't', 'd'], direction: 'down' }, { id: 'w', diagram: 'uml.class', nodeIds: ['c'] }] };
  const { xml, report } = await write(m, 'v', null, BpmnModdle());
  assert.deepEqual(report.map(x => `${x.line}: ${x.message}`), [': elements of other diagrams (1): not written', ': views of other diagrams (1): not written',
    ': what the model keeps under ext.bpmn (elements a reader skipped): not written', 's: kind: not written', 's: props.colour: not written',
    's: the definition terminate, which a StartEvent may not take: not written', 'u: bpmn.Mystery, outside the subset: not written',
    'e1: a data association against BPMN\'s direction (data-ends): not written', 'e2: a message flow in a model with no participant: not written',
    'e3: label, which BPMN gives no association: not written', 'e4: bpmn.SequenceFlow whose target is not written: not written', 'v: the view\'s direction: not written']);
  assert.ok(report.every(x => x.status === 'skipped'));
  assert.match(xml, /<bpmn:startEvent id="s" \/>/);
});

test('the writer reports what a reader would read back otherwise, and writes a cycle of lanes at the top (§12.5)', needs, async () => {
  const pool = (id, props, members) => ({ id, type: 'bpmn.Participant', ...(props ? { props } : {}), ...(members ? { members } : {}) });
  const task = (id, more = {}) => ({ id, type: 'bpmn.Task', props: { taskType: 'none' }, ...more });
  const m = { schemaVersion: 2, root: 'w', nodes: [
    pool('P', null, [{ id: 'L1', type: 'bpmn.Lane', parent: 'L2' }, { id: 'L2', type: 'bpmn.Lane', parent: 'L1' }, { id: 'L3', type: 'bpmn.Lane', parent: 'L1' }]),
    pool('Q', { processRef: 'X' }), pool('R', { processRef: 'X' }), pool('S', { processRef: 'S-process-2' }), pool('T', { processRef: 'T-process' }),
    task('t', { parent: 'L1', props: { taskType: 'none', calledElement: 'x', attachedTo: 't', processRef: 'y', definition: 'none', dataStoreRef: 'z', cancelActivity: false } }),
    { id: 'g', type: 'bpmn.ExclusiveGateway', props: { taskType: 'user' } }, { id: 'grp', type: 'bpmn.Group', parent: 'L3', props: { categoryValueRef: ['grp'] } },
    { id: 'sp', type: 'bpmn.SubProcess' }, { id: 'sq', type: 'bpmn.SubProcess', opensView: 'v' }, task('lost')],
  edges: [{ id: 'f', type: 'bpmn.SequenceFlow', from: 't', to: 'g', props: { categoryValueRef: ['grp'] } }],
  views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: ['P', 'Q', 'R', 'S', 'T', 't', 'g', 'grp', 'sp', 'sq', 'L1'] },
    { id: 'w', diagram: 'bpmn', parent: null, nodeIds: [] }, { id: 'in-sp', diagram: 'bpmn', parent: 'w', subject: 'sp', nodeIds: [] },
    { id: 'in-t', diagram: 'bpmn', parent: 'v', subject: 't', nodeIds: [] }] };
  const many = Array.from({ length: 1200 }, (_, k) => task(`k${k}`, { props: { taskType: 'none', colour: 'red' } }));
  const [w, back] = await roundTrip(m), at = x => `${x.line}: ${x.message}`;
  assert.deepEqual(w.report.map(at), [
    't: props.calledElement: not written', 't: props.attachedTo: not written', 't: props.processRef: not written', 't: props.definition: not written',
    't: props.dataStoreRef: not written', 't: props.cancelActivity: not written', 'g: props.taskType: not written', 'grp: props.categoryValueRef: not written',
    'L1: parent L2, which leads round to this lane (written at the top of its pool): not written', 'L2: parent L1, which leads round to this lane (written at the top of its pool): not written',
    'R: props.processRef X, an id already taken (written as X-2): not written', 'S: props.processRef S-process-2, which a reader takes for S-process made unique: not written',
    'grp: parent L3, a lane, which BPMN gives no Group (written in its pool): not written', 'f: props.categoryValueRef: not written',
    'v: the view\'s node L1, which is no element written: not written', 'in-sp: the view\'s parent w (a reader takes v from its subject): not written',
    'in-t: the view\'s subject t, which is no sub-process written: not written', 'in-t: the view\'s parent v (a reader takes null from its subject): not written',
    'sp: opensView none (a reader takes in-sp, the first view with it as subject): not written', 'sq: opensView v (a reader takes null, the first view with it as subject): not written',
    'lost: in no view (a reader puts it in the first, w): not written']);
  // the root's diagram first; the lanes of a cycle at the top of their pool, their flow nodes named, L3 under L1
  assert.equal(back.model.root, 'w');
  assert.deepEqual(back.model.nodes.find(n => n.id === 'P').members, [{ id: 'L1', type: 'bpmn.Lane' }, { id: 'L3', type: 'bpmn.Lane', parent: 'L1' }, { id: 'L2', type: 'bpmn.Lane' }]);
  assert.deepEqual(['t', 'grp'].map(id => back.model.nodes.find(n => n.id === id).parent), ['L1', 'P']);
  assert.doesNotMatch(w.xml, /undefined/);
  // the writer's report, as the reader's, lists BX_MAX items and counts the rest in one
  const big = await write({ schemaVersion: 2, root: 'v', nodes: many, edges: [], views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: many.map(n => n.id) }] }, 'v', null, BpmnModdle());
  assert.deepEqual([big.report.length, big.report.at(-1).message], [1001, '200 more items like these: not listed']);
});

test('the reader says what it does not read: a host not read, a sub-process\'s lanes, an activity\'s own data, a line\'s groups', needs, async () => {
  const { model, report } = await read(`<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">
    <category id="c"><categoryValue id="cv" value="G" /></category>
    <process id="p"><adHocSubProcess id="ah" /><boundaryEvent id="b" attachedToRef="ah"><timerEventDefinition /></boundaryEvent>
      <task id="t"><ioSpecification id="io" /><property id="pr" /></task><task id="u" />
      <sequenceFlow id="f" sourceRef="t" targetRef="u" categoryValueRef="cv" /><group id="g" categoryValueRef="cv" />
      <subProcess id="sp"><laneSet id="ls"><lane id="l" /></laneSet></subProcess></process></definitions>`, BpmnModdle());
  assert.deepEqual(report.map(x => `${x.line} ${x.status}: ${x.message}`), ['ah skipped: AdHocSubProcess outside the subset: kept under ext.bpmn, not read',
    'io skipped: InputOutputSpecification outside the subset: kept under ext.bpmn, not read', 'pr skipped: Property outside the subset: kept under ext.bpmn, not read',
    'ls skipped: LaneSet of a sub-process: kept under ext.bpmn, not read', 'b skipped: its host ah is not read: attachedTo not read',
    'f skipped: its groups (categoryValueRef, which row 24 gives no line): kept under ext.bpmn, not read', ' skipped: no diagram interchange: every element is in one view, process']);
  assert.deepEqual(model.nodes.find(n => n.id === 'b').props, { definition: 'timer', cancelActivity: true });
  assert.deepEqual(model.edges[0].ext, { bpmn: { categoryValueRef: ['cv'] } });
  assert.deepEqual(model.ext.bpmn.skipped.map(x => [x.parent, x.element.id]), [[undefined, 'ah'], ['t', 'io'], ['t', 'pr'], ['sp', 'ls']]);
});

test('neither function throws: no moddle, not text, a moddle that throws, a model that is not one', async () => {
  const none = { line: '', status: 'skipped', message: 'no bpmn-moddle instance given (npm install bpmn-moddle@10.3.1): nothing read' };
  assert.deepEqual(await read('<definitions/>', null), { model: { schemaVersion: 2, nodes: [], edges: [], views: [] }, report: [none] });
  assert.deepEqual((await read(42, {})).report, [{ line: '', status: 'skipped', message: 'not text: nothing read' }]);
  const boom = { fromXML: async () => { throw new RangeError('Maximum call stack size exceeded'); }, create: () => { throw new Error('no'); } };
  assert.deepEqual((await read('<x/>', boom)).report, [{ line: '', status: 'skipped', message: 'the file could not be read (Maximum call stack size exceeded): nothing read' }]);
  assert.deepEqual(await write({ nodes: [{ id: 't', type: 'bpmn.Task' }] }, null, null, boom), { xml: '', report: [{ line: '', status: 'skipped', message: 'the model (no): not written' }] });
  assert.deepEqual((await write({}, null, null, undefined)).report, [{ line: '', status: 'skipped', message: 'no bpmn-moddle instance given (npm install bpmn-moddle@10.3.1): not written' }]);
  assert.equal((await read(`<definitions>${' '.repeat(1 << 20)}</definitions>`, boom)).report[0].message, `over ${1 << 20} characters: nothing read (R2)`);
});

// in this process's CPU time, a slow run tried twice more, its best kept (a cold or busy runner is several times slower)
const cpu = async f => { const c = process.cpuUsage(), out = await f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
const best = async f => { let [out, ms] = await cpu(f); for (let i = 0; i < 2 && ms >= 1000; i++) ms = Math.min(ms, (await cpu(f))[1]); return [out, ms]; };
const NS = 'xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="defs" targetNamespace="http://example.com/bpmn/hostile"';

test('hostile files are read or refused in under a second each, and never throw (R2) (timed)', needs, async () => {
  const hostile = Object.fromEntries(readdirSync(new URL('import/hostile/', import.meta.url)).map(f => [f, file(`import/hostile/${f}`)]));
  const flows = n => Array.from({ length: n }, (_, k) => `<sequenceFlow id="f${k}" sourceRef="a" targetRef="b" />`).join('');
  hostile['over-1-mib (made here)'] = `<definitions ${NS}><process id="p">${' '.repeat(1 << 20)}</process></definitions>`;
  hostile['10000-levels (made here)'] = `<definitions ${NS}><process id="p">${Array.from({ length: 10000 }, (_, k) => `<subProcess id="s${k}">`).join('')}${'</subProcess>'.repeat(10000)}</process></definitions>`;
  const many = `<definitions ${NS}><process id="p"><task id="a" /><task id="b" />${flows(18500)}</process></definitions>`;
  hostile['many-references (made here)'] = many;
  // as many diagrams as sub-processes, each one's plane, and one diagram showing them all: just under 1 MiB, linear
  const n = 7300, subs = Array.from({ length: n }, (_, k) => `<subProcess id="s${k}" />`).join('');
  hostile['many-views (made here)'] = `<definitions ${NS} xmlns:di="http://www.omg.org/spec/BPMN/20100524/DI"><process id="p">${subs}</process>${Array.from({ length: n }, (_, k) =>
    `<di:BPMNDiagram id="d${k}"><di:BPMNPlane bpmnElement="s${k}" /></di:BPMNDiagram>`).join('')}<di:BPMNDiagram id="all"><di:BPMNPlane bpmnElement="p">${Array.from({ length: n }, (_, k) =>
    `<di:BPMNShape bpmnElement="s${k}" />`).join('')}</di:BPMNPlane></di:BPMNDiagram></definitions>`;
  assert.ok(hostile['many-views (made here)'].length < 1 << 20 && hostile['many-views (made here)'].length > 0.9 * (1 << 20));
  assert.ok(many.length < 1 << 20 && many.length > 0.9 * (1 << 20), many.length);
  const said = {};
  for (const [name, xml] of Object.entries(hostile)) {
    const [r, ms] = await best(() => read(xml, BpmnModdle()));
    console.log(`${name}: ${ms.toFixed(0)} ms CPU (target and ceiling 1000 ms)`);
    assert.ok(ms < 1000, `${name}: ${ms} ms`);
    assert.ok(r.report.length <= 1001);
    said[name] = r;
  }
  const msgs = name => said[name].report.map(x => `${x.line} ${x.status}: ${x.message}`);
  assert.deepEqual(msgs('over-1-mib (made here)'), [` skipped: over ${1 << 20} characters: nothing read (R2)`]);
  assert.deepEqual(msgs('entities.bpmn'), [' skipped: unparsable content ]>: not read', ' skipped: no diagram interchange: every element is in one view, process']);
  assert.deepEqual(said['entities.bpmn'].model.nodes.map(n => n.label), ['&e;', 'Plain']); // never expanded
  assert.deepEqual(msgs('dangling.bpmn'), ['b skipped: unresolved reference <nowhere>: not read', 'f skipped: unresolved reference <nowhere>: not read',
    's skipped: unresolved reference <ghost>: not read', 'f skipped: SequenceFlow whose target is not read: kept under ext.bpmn, not read', R5.line + ' skipped: ' + R5.message]);
  assert.deepEqual(msgs('no-di.bpmn'), [' skipped: no diagram interchange: every element is in one view, process']);
  assert.deepEqual(said['no-di.bpmn'].model.views, [{ id: 'process', diagram: 'bpmn', parent: null, nodeIds: ['s', 't', 'e'] }]);
  assert.deepEqual(msgs('unknown-namespace.bpmn'), [' skipped: unparsable content <x:settings> detected: not read', ' skipped: unparsable content <x:robot> detected: not read',
    ' skipped: the attribute x:flavour: not read', 'p skipped: the attribute x:owner: not read', 't skipped: the attribute x:retries: not read',
    't skipped: ExtensionElements (an extension): kept under ext.bpmn, not read', ' skipped: no diagram interchange: every element is in one view, process']);
  const deep = said['10000-levels (made here)'];
  assert.ok(deep.model.nodes.length === 10000 || deep.report.some(x => /could not be read/.test(x.message)), deep.report.slice(0, 3));
  const lots = said['many-references (made here)'];
  assert.deepEqual([lots.model.nodes.length, lots.model.edges.length], [2, 18500]);
  const views = said['many-views (made here)'].model.views;
  assert.deepEqual([views.length, views[0].parent, views[0].subject, views.at(-1).id], [7301, 'all', 's0', 'all']);
});

test('500 elements are read and written in time, each way (P1) (timed)', needs, async () => {
  const nodes = [{ id: 'pool', type: 'bpmn.Participant', members: [{ id: 'l1', type: 'bpmn.Lane' }, { id: 'l2', type: 'bpmn.Lane' }] }], edges = [];
  for (let k = 0; k < 250; k++) nodes.push({ id: `t${k}`, type: 'bpmn.Task', label: `Task ${k}`, parent: k % 2 ? 'l1' : 'l2', props: { taskType: 'none' } });
  for (let k = 1; k < 250; k++) edges.push({ id: `f${k}`, type: 'bpmn.SequenceFlow', from: `t${k - 1}`, to: `t${k}` });
  const m = { schemaVersion: 2, root: 'v', nodes, edges, views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: nodes.map(n => n.id) }] };
  const moddle = BpmnModdle();
  await write(m, 'v', null, moddle); // warm-up
  const [w, writeMs] = await best(() => write(m, 'v', null, moddle));
  const [r, readMs] = await best(() => read(w.xml, moddle));
  console.log(`500 elements: written in ${writeMs.toFixed(0)} ms, read in ${readMs.toFixed(0)} ms CPU (target 100 ms, ceiling 1000 ms)`);
  assert.ok(writeMs < 1000 && readMs < 1000, `${writeMs} ${readMs}`);
  assert.deepEqual(canon(r.model), canon(m));
});

test('an extension on the definitions, a collaboration, a process, a lane or a line is reported and kept (audit 1)', needs, async () => {
  const x = '<extensionElements><x:prop xmlns:x="urn:x" k="v"/></extensionElements>';
  const { model, report } = await read(`<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">${x}
    <collaboration id="c">${x}<participant id="pool" processRef="p"/></collaboration>
    <process id="p">${x}<laneSet id="ls"><lane id="lane">${x}<flowNodeRef>a</flowNodeRef></lane></laneSet>
      <task id="a"/><task id="b"/><sequenceFlow id="f" sourceRef="a" targetRef="b">${x}</sequenceFlow></process></definitions>`, BpmnModdle());
  assert.deepEqual(report.filter(r => /extension/.test(r.message)).length, 5);
  assert.deepEqual(model.ext.bpmn.skipped.map(s => s.parent ?? null), [null, null, 'lane', 'pool', 'f']);
});

test('an umlimator:id holding "->" is read with "-" and said; a blank one is the file\'s id (audit 1)', needs, async () => {
  const { model, report } = await read(`<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:u="https://zintaen.github.io/umlimator/bpmn" id="d">
    <process id="p"><task id="t1" u:id="a->b"/><task id="t2" u:id=" "/><sequenceFlow id="f" u:id="b->>c" sourceRef="t1" targetRef="t2"/></process></definitions>`, BpmnModdle());
  assert.deepEqual([model.nodes.map(n => n.id), model.edges.map(e => e.id)], [['a-b', 't2'], ['b-c']]);
  assert.equal(report.filter(r => r.status === 'weakened').length, 2);
});

test('the writer reports an empty label, a model.ext key but bpmn, and a lane whose parent is in another pool, written at the top of its own (audit 1, backlog 4b.4)', needs, async () => {
  const m = { schemaVersion: 2, root: 'v', ext: { camunda: { x: 1 } },
    nodes: [{ id: 'p1', type: 'bpmn.Participant', label: 'A', members: [{ id: 'l1', type: 'bpmn.Lane', label: 'L1' }] },
      { id: 'p2', type: 'bpmn.Participant', label: 'B', members: [{ id: 'l2', type: 'bpmn.Lane', label: 'L2', parent: 'l1' }] },
      { id: 't', type: 'bpmn.Task', label: '', parent: 'l2', props: { taskType: 'none' } }],
    edges: [], views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: ['p1', 'p2', 't'] }] };
  const [w, back] = await roundTrip(m);
  assert.deepEqual(w.report.map(x => `${x.line}: ${x.message}`), [': what the model keeps under ext.camunda: not written', 't: an empty label, which a reader reads as none: not written',
    'l2: parent l1, which is no lane of its pool (written at the top of its pool): not written']);
  assert.equal(back.model.nodes.find(n => n.id === 't').parent, 'l2');
});

test('sub-processes nested 3,000 deep are written unindented, in linear size, and read back (audit 1, R2)', needs, async () => {
  const nodes = Array.from({ length: 3000 }, (_, k) => ({ id: `s${k}`, type: 'bpmn.SubProcess', ...(k ? { parent: `s${k - 1}` } : {}) }));
  const w = await write({ schemaVersion: 2, root: 'v', nodes, edges: [], views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: nodes.map(n => n.id) }] }, 'v', null, BpmnModdle());
  assert.ok(w.xml.length < 1 << 20, `${w.xml.length} characters`);
  assert.equal((await read(w.xml, BpmnModdle())).model.nodes.length, 3000);
});

test('a taskType or direction outside row 24 ("constructor" among them) is reported, the rest written; a data input association\'s second source is said and kept (audit 2)', needs, async () => {
  for (const [k, v] of [['taskType', 'toString'], ['taskType', 'constructor'], ['direction', 'constructor'], ['direction', 'foo']]) {
    const m = { schemaVersion: 2, root: 'v', nodes: [{ id: 't', type: 'bpmn.Task', label: 'Pack', ...(k === 'taskType' ? { props: { taskType: v } } : {}) }, { id: 'n', type: 'bpmn.TextAnnotation', label: 'note' }],
      edges: [{ id: 'a', type: 'bpmn.Association', from: 'n', to: 't', ...(k === 'direction' ? { props: { direction: v } } : {}) }], views: [{ id: 'v', diagram: 'bpmn', parent: null, nodeIds: ['t', 'n'] }] };
    const [w, back] = await roundTrip(m);
    assert.deepEqual([w.report.map(x => `${x.line}: ${x.message}`), back.model.nodes.length, back.model.edges[0].props], [[`${k === 'taskType' ? 't' : 'a'}: props.${k} ${v}: not written`], 2, undefined], `${k} ${v}`);
  }
  const { model, report } = await read(`<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d"><process id="p"><dataObjectReference id="a" dataObjectRef="o"/>
    <dataObjectReference id="b" dataObjectRef="o"/><dataObject id="o"/><task id="t"><dataInputAssociation id="da"><sourceRef>a</sourceRef><sourceRef>b</sourceRef></dataInputAssociation></task></process></definitions>`, BpmnModdle());
  assert.deepEqual([model.edges.map(e => `${e.from}-${e.to}`), report[0].message, model.ext.bpmn.skipped[0].parent], [['a-t'], 'its sources after the first (b): kept under ext.bpmn, not read', 't']);
});

test('a BPMN attribute outside the subset, set off its default, is reported once per name; isExecutable is passed over (audit 3)', needs, async () => {
  const { report } = await read('<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x"><process id="p" isExecutable="true">'
    + '<task id="t" startQuantity="3" isForCompensation="true"/><task id="u" isForCompensation="true" startQuantity="1"/><dataObject id="o" isCollection="true"/></process></definitions>', BpmnModdle());
  assert.deepEqual(report.filter(r => r.line !== '').map(r => `${r.line} ${r.message}`), [
    't the attribute startQuantity="3": not read, here or elsewhere in the file', 't the attribute isForCompensation="true": not read, here or elsewhere in the file',
    'o the attribute isCollection="true": not read, here or elsewhere in the file']);
});

test('a lane naming another process\'s flow node, and a second pool on one process, are reported; nothing moves pools (audit 5)', needs, async () => {
  const D = b => `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x">${b}</definitions>`;
  const parents = m => Object.fromEntries(m.nodes.filter(n => n.type === 'bpmn.Task').map(n => [n.id, n.parent]));
  const a = await read(D('<collaboration id="c"><participant id="A" processRef="p"/><participant id="B" processRef="q"/></collaboration>'
    + '<process id="p"><laneSet><lane id="L"><flowNodeRef>t2</flowNodeRef></lane></laneSet><task id="t1"/></process><process id="q"><task id="t2"/></process>'), BpmnModdle());
  assert.deepEqual([parents(a.model), a.report.filter(r => r.line !== '').map(r => `${r.line} ${r.message}`)], [{ t1: 'A', t2: 'B' }, ['L flowNodeRef t2: a flow node of another process, left in its own']]);
  const b = await read(D('<collaboration id="c"><participant id="A" processRef="p"/><participant id="B" processRef="p"/></collaboration><process id="p"><task id="t"/></process>'), BpmnModdle());
  assert.deepEqual([parents(b.model), b.report.filter(r => r.line !== '').map(r => `${r.line} ${r.message}`)], [{ t: 'A' }, ["B its process p is also A's: its content is read into A"]]);
});
