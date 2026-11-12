// The helpers (work package 3.7, notes/stage-3.md §7), in Node on the sources: example 11 with { f1: 'f1-paid' } gives
// example 12 except for ids; a numbered view (examples/bookshop.json's, one with no edges list) and a trace give views
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
const EX11 = read('../docs/diagrams/examples/11-sequence.json'), EX12 = read('../docs/diagrams/examples/12-communication.json');
const errors = m => validate(m).filter(p => p.level === 'error');
const view = (m, id) => m.views.find(v => v.id === id);
// every id an element of the model has
const allIds = m => [...m.nodes, ...m.edges, ...m.views.flatMap(v => [v, ...(v.nodes || []), ...(v.edges || []).filter(e => typeof e === 'object')])].map(x => x.id).filter(id => id != null);

test('example 11 with { f1: "f1-paid" } gives example 12, except for ids', () => {
  const before = structuredClone(EX11), { model, report } = communicationFromView(EX11, 'checkout', { operands: { f1: 'f1-paid' }, view: 'checkout' });
  assert.deepEqual(EX11, before, 'the model passed in is not changed');
  assert.deepEqual(report, [{ id: 'f3', status: 'skipped', message: 'interaction use f3 is left out' }]);
  // ids: a message by its place, a connector by its ends (example 12 names a self connector <a>-self)
  const name = new Map(EX12.edges.map(e => [e.type === 'uml.Message' ? `checkout.${e.id}` : `checkout.${e.from}-${e.to}`, e.id]));
  const back = x => name.get(x) ?? x, un = e => ({ ...e, id: back(e.id), ...(e.props && e.props.replyTo ? { props: { ...e.props, replyTo: back(e.props.replyTo) } } : {}) });
  assert.equal(name.size, EX12.edges.length);
  assert.deepEqual(model.edges.map(un), EX12.edges);
  assert.deepEqual(model.nodes, EX12.nodes);
  assert.deepEqual(model.views.map(v => ({ ...v, edges: v.edges.map(back) })), EX12.views);
  // model.md row 12, structurally (the type itself is 3.5's): no error, every message on a connector joining its ends,
  // the shared rules clean, and §6.3's numbers
  assert.deepEqual(errors(model), []);
  const v = model.views[0], byId = new Map(model.edges.map(e => [e.id, e])), listed = v.edges.map(id => byId.get(id));
  const links = listed.filter(e => e.type === 'uml.Connector'), msgs = listed.filter(e => e.type === 'uml.Message');
  assert.equal(listed.findIndex(e => e.type === 'uml.Message'), links.length, 'connectors first, then messages');
  msgs.forEach(m => assert.ok(links.some(c => (c.from === m.from && c.to === m.to) || (c.from === m.to && c.to === m.from)), `${m.id} has a connector`));
  assert.deepEqual(interactionProblems(model, v), []);
  assert.deepEqual([...messageNumbers(model, v).values()], ['1', '1.1', '1.1.1', '1.1.2', '1.1.2.1', '1.1.3', '1.1.4', '1.1.5', '1.2']);
  assert.ok(allIds(model).every(id => !id.includes('->')));
});

test('a sequence view: the first operand by default, another by options.operands, par and a missing operand reported', () => {
  const dflt = communicationFromView(EX11, 'checkout', { view: 'checkout' }).model;
  assert.deepEqual(dflt, communicationFromView(EX11, 'checkout', { operands: { f1: 'f1-paid' }, view: 'checkout' }).model);
  const { model, report } = communicationFromView(EX11, 'checkout', { operands: { f1: 'f1-declined' } }), v = view(model, 'checkout.communication');
  assert.equal(model.views.length, 2, 'a new id: the view comes last');
  assert.equal(v.title, 'Checkout: else');
  assert.deepEqual(v.edges.filter(id => /\.m\d+$/.test(id)).map(id => model.edges.find(e => e.id === id).label), ['checkout()', 'place(order)', 'validate(order)', 'charge(total)', 'declined', 'result', 'confirmation page']);
  assert.deepEqual(report, []);
  assert.deepEqual(errors(model), []);
  assert.deepEqual(communicationFromView(EX11, 'checkout', { operands: { f1: 'nope' } }).report[0],
    { id: 'f1', status: 'approximated', message: 'alt f1 has no operand "nope": its first is taken' });
  const par = structuredClone(EX11); par.views[0].fragments[0].props.operator = 'par';
  const p = communicationFromView(par, 'checkout');
  assert.deepEqual(p.report.map(r => [r.id, r.status]), [['f1', 'approximated'], ['f3', 'skipped']]);
  assert.equal(view(p.model, 'checkout.communication').edges.filter(id => /\.m\d+$/.test(id)).length, 10, "par: both operands' messages, one after another");
});

test("the numbered view in examples/bookshop.json gives a sequence view and a communication view that validate with no error", () => {
  const bk = read('../examples/bookshop.json'), before = structuredClone(bk);
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
  assert.throws(() => sequenceFromView(EX11, 'checkout'), /not a numbered view/);
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
  assert.equal(view(communicationFromView(ex, 'checkout', { operands: { f1: 'f1-paid' } }).model, 'checkout.communication').title, 'Checkout: payment accepted');
  const proto = structuredClone(EX11); proto.views[0].fragments.find(f => f.id === 'f1').id = '__proto__';
  assert.deepEqual(communicationFromView(proto, 'checkout').report.filter(r => r.id === '__proto__'), []);
});
