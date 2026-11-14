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
const example = JSON.parse(file('../docs/diagrams/examples/24-bpmn.json'));

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
  assert.match(w.xml, /<bpmn:participant id="bookshop" name="Bookshop" processRef="bookshop-process" \/>/);
  assert.match(w.xml, /<bpmn:participant id="payment-provider" name="Payment provider" \/>/);
  assert.match(w.xml, /<bpmn:lane id="sales" name="Sales">\s+<bpmn:flowNodeRef>order-received<\/bpmn:flowNodeRef>/);
  assert.match(w.xml, /<bpmn:boundaryEvent id="payment-timeout" name="No answer in 2 minutes" attachedToRef="take-payment">\s+<bpmn:timerEventDefinition \/>/);
  assert.match(w.xml, /<bpmndi:BPMNShape id="pick-pack_di" bpmnElement="pick-pack" isExpanded="false">/);
  assert.match(w.xml, /<bpmndi:BPMNDiagram id="pick-and-pack" name="Pick and pack">\s+<bpmndi:BPMNPlane id="pick-and-pack-plane" bpmnElement="pick-pack">/);
  assert.match(w.xml, /<bpmn:dataInputAssociation id="d-order-in">\s+<bpmn:sourceRef>order<\/bpmn:sourceRef>/);
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
    const props = kind === 'Task' ? { taskType: pick(['none', 'user', 'service']) } : kind === 'CallActivity' && some(.5) ? { calledElement: text() }
      : kind in defs ? { definition: pick(defs[kind]), ...(kind === 'BoundaryEvent' ? { attachedTo: pick(acts).id, cancelActivity: some(.5) } : {}) } : {};
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

test('read(write(model)) equals the model, for 500 generated models in the subset', needs, async () => {
  for (let seed = 1; seed <= 500; seed++) {
    const m = generated(seed), [w, back] = await roundTrip(m);
    assert.deepEqual(w.report, [], `seed ${seed}`);
    assert.deepEqual(back.report.filter(x => x !== R5 && x.message !== R5.message), [], `seed ${seed}\n${w.xml}`);
    assert.deepEqual(canon(back.model), canon(m), `seed ${seed}\n${w.xml}`);
  }
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
  const geo = { nodes: [{ id: 'bookshop', x: 10, y: 300, w: 900, h: 400 }, { id: 'sales', x: 40, y: 300, w: 870, h: 200 }, { id: 'take-payment', x: 120, y: 340, w: 100, h: 64 },
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
  assert.deepEqual(['shopper', 'bookshop', 'sales', 'warehouse'].map(id => shapes(main).get(id).isHorizontal), [true, true, true, true]);
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
