// The helpers (work package 3.7, notes/stage-3.md §7), in Node on the sources: example 11 with { f1: 'f1-paid' } gives
// example 12 except for ids; a numbered view (examples/bike-share.json's api, the rider shop's, one with no edges list) and a trace give views
// that validate with no error; no derived id contains "->"; a second run replaces the view; the reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../src/map/validate.js';
import { otlpSpans } from '../src/map/insight.js';
import { messageNumbers, interactionProblems } from '../src/uml/interaction.js';
import '../src/uml/sequence.js';
import '../src/uml/communication.js'; // empty until 3.5 (#187) merges; then validate() below runs its message-link rule too
import { sequenceFromView, communicationFromView, sequenceFromSpans } from '../src/uml/convert.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const EX11 = read('../examples/checkout-sequence.json'), EX12 = read('../examples/checkout-communication.json');
const errors = m => validate(m).filter(p => p.level === 'error');
const view = (m, id) => m.views.find(v => v.id === id);
// every id an element of the model has
const allIds = m => [...m.nodes, ...m.edges, ...m.views.flatMap(v => [v, ...(v.nodes || []), ...(v.edges || []).filter(e => typeof e === 'object')])].map(x => x.id).filter(id => id != null);

test('example 11 with { f1: "f1-paid" } gives example 12, except for ids', () => {
  const before = structuredClone(EX11), { model, report } = communicationFromView(EX11, 'checkout-sequence', { operands: { f1: 'f1-paid' }, view: 'checkout-communication' });
  assert.deepEqual(EX11, before, 'the model passed in is not changed');
  assert.deepEqual(report, [{ id: 'f3', status: 'skipped', message: 'interaction use f3 is left out' }]);
  // ids: a message by its place (example 12's cm<n>), a connector by its ends (example 12 names a self connector <a>-self)
  const P = 'checkout-communication.', name = new Map(EX12.edges.map(e => [e.type === 'uml.Message' ? `${P}m${e.id.slice(2)}` : `${P}${e.from}-${e.to}`, e.id]));
  const back = x => name.get(x) ?? x, un = e => ({ ...e, id: back(e.id), ...(e.props && e.props.replyTo ? { props: { ...e.props, replyTo: back(e.props.replyTo) } } : {}) });
  assert.equal(name.size, EX12.edges.length);
  assert.deepEqual(model.edges.map(un), EX12.edges);
  assert.deepEqual(model.nodes, EX12.nodes);
  assert.deepEqual(model.views[0], EX11.views[0], 'the sequence view stays, the communication view comes after it');
  assert.deepEqual(model.views.slice(1).map(v => ({ ...v, edges: v.edges.map(back) })), EX12.views);
  // model.md row 12, structurally (the type itself is 3.5's): no error, every message on a connector joining its ends,
  // the shared rules clean, and §6.3's numbers
  assert.deepEqual(errors(model), []);
  const v = model.views[1], byId = new Map(model.edges.map(e => [e.id, e])), listed = v.edges.map(id => byId.get(id));
  const links = listed.filter(e => e.type === 'uml.Connector'), msgs = listed.filter(e => e.type === 'uml.Message');
  assert.equal(listed.findIndex(e => e.type === 'uml.Message'), links.length, 'connectors first, then messages');
  msgs.forEach(m => assert.ok(links.some(c => (c.from === m.from && c.to === m.to) || (c.from === m.to && c.to === m.from)), `${m.id} has a connector`));
  assert.deepEqual(interactionProblems(model, v), []);
  assert.deepEqual([...messageNumbers(model, v).values()], ['1', '1.1', '1.1.1', '1.1.2', '1.1.2.1', '1.1.3', '1.1.4', '1.1.5', '1.2']);
  assert.ok(allIds(model).every(id => !id.includes('->')));
});

test('a sequence view: the first operand by default, another by options.operands, par and a missing operand reported', () => {
  const dflt = communicationFromView(EX11, 'checkout-sequence', { view: 'checkout-sequence' }).model;
  assert.deepEqual(dflt, communicationFromView(EX11, 'checkout-sequence', { operands: { f1: 'f1-paid' }, view: 'checkout-sequence' }).model);
  const { model, report } = communicationFromView(EX11, 'checkout-sequence', { operands: { f1: 'f1-declined' } }), v = view(model, 'checkout-sequence.communication');
  assert.equal(model.views.length, 2, 'a new id: the view comes last');
  assert.equal(v.title, 'Checkout: else');
  assert.deepEqual(v.edges.filter(id => /\.m\d+$/.test(id)).map(id => model.edges.find(e => e.id === id).label), ['checkout()', 'place(order)', 'validate(order)', 'charge(total)', 'declined', 'result', 'confirmation page']);
  assert.deepEqual(report, []);
  assert.deepEqual(errors(model), []);
  assert.deepEqual(communicationFromView(EX11, 'checkout-sequence', { operands: { f1: 'nope' } }).report[0],
    { id: 'f1', status: 'approximated', message: 'alt f1 has no operand "nope": its first is taken' });
  const par = structuredClone(EX11); par.views[0].fragments[0].props.operator = 'par';
  const p = communicationFromView(par, 'checkout-sequence');
  assert.deepEqual(p.report.map(r => [r.id, r.status]), [['f1', 'approximated'], ['f3', 'skipped']]);
  assert.equal(view(p.model, 'checkout-sequence.communication').edges.filter(id => /\.m\d+$/.test(id)).length, 10, "par: both operands' messages, one after another");
});

test("the numbered view in examples/bike-share.json's rider shop gives a sequence view and a communication view that validate with no error", () => {
  const bk = read('../examples/bike-share.json'), before = structuredClone(bk);
  const s = sequenceFromView(bk, 'api'), v = view(s.model, 'api.sequence');
  assert.deepEqual(bk, before);
  assert.deepEqual(errors(s.model), []);
  assert.deepEqual(s.report, []);
  assert.deepEqual([v.diagram, v.parent, v.nodeIds[0], v.edges[0]], ['uml.sequence', 'overview', 'api.sequence.shoppers',
    { id: 'api.sequence.m1', type: 'uml.Message', from: 'api.sequence.shoppers', to: 'api.sequence.api', label: 'checks out', props: { sort: 'call' } }]);
  assert.equal(v.edges.length, 5, "the view's lines, in their order");
  const c = communicationFromView(bk, 'api'), cv = view(c.model, 'api.communication');
  assert.deepEqual(errors(c.model), []);
  assert.equal(cv.edges[0], 'api.communication.shoppers-api', 'a connector by its cards');
  [s.model, c.model].forEach(m => assert.ok(allIds(m).every(id => !id.includes('->'))));
});

test('a numbered view with no edges list: the order the core numbers in; a step that is not that number is reported', () => {
  const m = { nodes: [{ id: 'a', label: 'Web' }, { id: 'b' }, { id: 'c' }, { id: 'x' }],
    edges: [{ from: 'a', to: 'b', label: 'asks' }, { from: 'b', to: 'c', step: '2a' }, { from: 'a', to: 'x' }, { from: 'c', to: 'b', step: 3 }],
    views: [{ id: 'v', render: 'sequence', nodeIds: ['a', 'b', 'c'] }] };
  const { model, report } = sequenceFromView(m, 'v', { view: 'seq' }), v = view(model, 'seq');
  assert.deepEqual(errors(model), []);
  assert.deepEqual(v.nodeIds, ['seq.a', 'seq.b', 'seq.c']);
  assert.equal(model.nodes.find(n => n.id === 'seq.a').label, 'Web');
  assert.deepEqual(v.edges.map(e => [e.id, e.from, e.to]), [['seq.m1', 'seq.a', 'seq.b'], ['seq.m2', 'seq.b', 'seq.c'], ['seq.m3', 'seq.c', 'seq.b']]);
  assert.deepEqual(report.map(r => [r.id, r.status]), [['seq.m2', 'approximated']]);
  assert.ok(allIds(model).every(id => !id.includes('->')));
});

test('a trace goes through its numbered view; overlapping calls are said in the caption', () => {
  const bike = read('../examples/bike-share.json'), spans = otlpSpans(read('../examples/traces/ride-end.json')), match = read('../examples/traces/match.json');
  const { model } = sequenceFromSpans(bike, spans, { view: 'ride-end', match }), v = view(model, 'ride-end');
  assert.deepEqual(errors(model), []);
  assert.equal(v.diagram, 'uml.sequence');
  assert.equal(v.edges.length, 8);
  assert.ok(allIds(model).every(id => !id.includes('->')));
  const m = { nodes: [{ id: 'web' }, { id: 'api' }, { id: 'db' }], views: [{ id: 'v', nodeIds: ['web', 'api', 'db'] }] };
  const S = [{ id: '1', service: 'web', start: 0, end: 100 }, { id: '2', parent: '1', service: 'api', start: 5, end: 50 },
    { id: '3', parent: '2', service: 'db', start: 10, end: 20 }, { id: '4', parent: '1', service: 'db', start: 30, end: 60 }];
  const t = view(sequenceFromSpans(m, S).model, 'trace');
  assert.equal(sequenceFromSpans(m, S).model.schemaVersion, 2); // m has no schemaVersion: the helper upgrades it
  assert.ok(t.caption.endsWith('2 calls overlapped in the trace and are drawn one after another.'), t.caption); // 2 and 4
  assert.ok(!view(sequenceFromSpans(m, S.slice(0, 3)).model, 'trace').caption.includes('overlapped'), 'a call inside another: no overlap');
});

test('running a helper again with the same options.view replaces that view and the lifelines only it listed', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'c' }],
    views: [{ id: 'one', render: 'sequence', nodeIds: ['a', 'b'] }, { id: 'two', render: 'sequence', nodeIds: ['b', 'c'] }] };
  const once = communicationFromView(m, 'one', { view: 'out' }).model;
  assert.deepEqual(communicationFromView(once, 'one', { view: 'out' }).model, once, 'the same again: the same model');
  const other = communicationFromView(once, 'two', { view: 'out' }).model;
  assert.deepEqual(other.nodes.map(n => n.id), ['a', 'b', 'c', 'out.b', 'out.c']);
  assert.deepEqual(other.edges.map(e => e.id), ['e1', 'e2', 'out.b-c', 'out.m1']);
  assert.deepEqual(errors(other), []);
  assert.throws(() => sequenceFromView(m, 'nope'), /no view "nope"/);
  assert.throws(() => sequenceFromView(EX11, 'checkout-sequence'), /not a numbered view/);
});

test('derived ids stay unique: cards with "-", a card m<n>, cards "a->b" and "a-b"; guards of untaken alts and inherited keys', () => {
  const nv = (ids, lines) => ({ nodes: ids.map(id => ({ id })), edges: lines.map(([from, to]) => ({ from, to })), views: [{ id: 'v', render: 'sequence', nodeIds: ids }] });
  const unique = m => { const ids = allIds(m); assert.equal(new Set(ids).size, ids.length, ids.join(' ')); assert.deepEqual(errors(m).filter(p => !p.message.startsWith('id "a->b"')), []); }; // the source's own card
  [nv(['a-b', 'c', 'a', 'b-c'], [['a-b', 'c'], ['a', 'b-c']]), nv(['m1', 'b'], [['m1', 'b']]), nv(['a->b', 'a-b'], [['a->b', 'a-b']])]
    .forEach(m => { unique(sequenceFromView(m, 'v', { view: 's' }).model); unique(communicationFromView(m, 'v', { view: 's' }).model); });
  const ex = structuredClone(EX11), cv = ex.views[0], msg = cv.edges.find(e => e.parent === 'f1-declined');
  cv.fragments.push({ id: 'f4', type: 'uml.CombinedFragment', parent: 'f1-declined', props: { operator: 'alt' },
    members: [{ id: 'retry', type: 'uml.InteractionOperand', label: 'retry' }, { id: 'give-up', type: 'uml.InteractionOperand', label: 'give up' }] });
  cv.edges.push({ ...msg, id: 'm99', parent: 'retry', props: { sort: 'call' } });
  assert.equal(view(communicationFromView(ex, 'checkout-sequence', { operands: { f1: 'f1-paid' } }).model, 'checkout-sequence.communication').title, 'Checkout: payment accepted');
  const proto = structuredClone(EX11); proto.views[0].fragments.find(f => f.id === 'f1').id = '__proto__';
  assert.deepEqual(communicationFromView(proto, 'checkout-sequence').report.filter(r => r.id === '__proto__'), []);
});

test('audit 21: sequenceFromSpans() reads hostile spans and options as sequenceFromTrace() does: no throw, match a table by name', () => {
  const bad = () => JSON.parse('{"toString":1}');
  const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const spans = [{ id: '1', service: 'svc', start: 0, end: 10 }, { id: bad(), parent: '1', service: 'b', start: 1, end: 3 }, { id: '3', parent: '1', service: 'b', start: 2, end: 4, name: bad() }];
  const r = sequenceFromSpans(m, spans, { match: { svc: 'a', toString: 'a' }, view: bad() }), v = r.model.views.find(x => x.id === 'trace');
  assert.ok(v && v.edges.length === 2, JSON.stringify(v && v.edges));
});

test('audit 24: communicationFromView takes a sequence view\'s own lifelines along: the model\'s when the source stays, the new view\'s when it takes its place', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Lifeline', label: 'shop' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['A', 'B'], nodes: [{ id: 'B', type: 'uml.Lifeline', label: 'bank' }], edges: [{ id: 'm1', type: 'uml.Message', from: 'A', to: 'B', label: 'pay', props: { sort: 'call' } }] }] };
  const a = communicationFromView(m, 'v').model;
  assert.deepEqual(validate(a).filter(p => p.level !== 'info'), []);
  assert.ok(a.nodes.some(n => n.id === 'B') && !a.views[0].nodes, 'B is the model\'s, both views list it');
  const b = communicationFromView(m, 'v', { view: 'v' }).model;
  assert.deepEqual(validate(b).filter(p => p.level !== 'info'), []);
  assert.deepEqual([b.nodes.map(n => n.id), b.views[0].nodes.map(n => n.id)], [['A'], ['B']]);
});

test('audit 25: sequenceFromSpans() into a view it made before takes the lifelines only that view listed with it, as cmd_trace does', () => {
  const m = { schemaVersion: 2, root: 'root', nodes: [{ id: 'web', kind: 'frontend', label: 'web' }, { id: 'api', kind: 'service', label: 'api' }, { id: 'db', kind: 'database', label: 'db' }], edges: [], views: [{ id: 'root', nodeIds: ['web', 'api', 'db'] }] };
  const S = [{ id: '1', service: 'web', start: 0, end: 100 }, { id: '2', parent: '1', service: 'api', start: 10, end: 90 }, { id: '3', parent: '2', service: 'db', start: 20, end: 30 }];
  const one = sequenceFromSpans(m, S).model, two = sequenceFromSpans(one, S.slice(0, 2)).model;
  const lifelines = x => x.nodes.filter(n => n.type === 'uml.Lifeline').map(n => n.id).sort();
  assert.ok(lifelines(one).length === 3, JSON.stringify(lifelines(one)));
  assert.deepEqual(lifelines(two), [...view(two, 'trace').nodeIds].filter(id => lifelines(one).includes(id)).sort(), 'no lifeline left that no view lists');
  const listed = new Set(two.views.flatMap(v => v.nodeIds || [])), msgs = new Set(two.views.flatMap(v => (v.edges || []).map(e => (typeof e === 'string' ? e : e.id))));
  assert.deepEqual(two.nodes.filter(n => n.type === 'uml.Lifeline' && !listed.has(n.id)), []);
  assert.deepEqual(two.edges.filter(e => ['uml.Message', 'uml.Connector'].includes(e.type) && !msgs.has(e.id)), []);
  assert.deepEqual(errors(two), []);
  // a lifeline another view lists stays
  const kept = structuredClone(one); kept.views.push({ id: 'other', diagram: 'uml.sequence', nodeIds: lifelines(one) });
  assert.deepEqual(lifelines(sequenceFromSpans(kept, S.slice(0, 2)).model), lifelines(one));
});
