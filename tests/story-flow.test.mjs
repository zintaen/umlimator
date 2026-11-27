// storyFromFlow (docs/diagrams/notes/layout-flow.md section 10): a story told from a view's main flow. On each view of the
// flow corpus (bench/models/f12.json) the story passes validate(), has a step per main card, and each tour is two cards the
// view draws a line between, so the page's tour() and the MCP tour tool (0.44.0's refusal rules) ride it. Playing it on the
// page and the Stories menu's "From the main flow": tests/stories.html; the MCP tool story_from_flow: tests/mcp.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as U from '../lib/umlimator-all.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const F12 = read('../bench/models/f12.json');
// a story and its chapters as the model's stories, each a Story validate() checks
const asStories = s => [{ id: s.id, title: s.title, steps: s.steps }, ...s.chapters.map(({ at, ...c }) => c)];
const storyProblems = (model, s) => U.validate({ ...model, stories: asStories(s) }).filter(p => p.path.startsWith('stories'));
// the view's main cards, from its lines marked flow "main" (in f12 they form one path), independent of storyFromFlow
const mainCards = (model, v) => { const ids = new Set(v.nodeIds), main = model.edges.filter(e => e.flow === 'main' && ids.has(e.from) && ids.has(e.to) && !e.loop);
  const start = main.find(e => !main.some(x => x.to === e.from)), out = [start.from]; for (let e = start; e; e = main.find(x => x.from === e.to)) out.push(e.to); return out; };
// the pairs of cards a view's picture draws a line between, either way
const drawnPairs = (model, vid) => new Set(U.layout(model, vid).edges.flatMap(e => [e.from + '>' + e.to, e.to + '>' + e.from]));

for (const v of F12.views) test(`f12 ${v.id}: the main flow's story passes validate(), a step per main card, each tour two cards joined by a drawn line`, () => {
  const s = U.storyFromFlow(F12, v.id), cards = mainCards(F12, v), drawn = drawnPairs(F12, v.id);
  assert.deepEqual(storyProblems(F12, s), []);
  assert.equal(s.steps.length, cards.length);
  assert.deepEqual(s.steps.map(x => x.select), cards, 'each step selects its main card, in order');
  const tours = s.steps.filter(x => x.tour);
  assert.equal(tours.length, cards.length - 1, 'every step but the first rides the main line into its card');
  tours.forEach((x, k) => { assert.equal(x.tour.length, 2); assert.deepEqual(x.tour, [cards[k], cards[k + 1]]); assert.ok(drawn.has(x.tour.join('>')), `${x.tour} is joined by a drawn line`); });
  s.steps.forEach((x, k) => { assert.equal(x.view, v.id); assert.match(x.caption, new RegExp(`^${k + 1}\\. .+[.?!]$`)); });
  s.chapters.forEach(c => { assert.ok(c.at >= 0 && c.at < s.steps.length); c.steps.forEach(x => { if (x.tour) assert.ok(drawn.has(x.tour.join('>'))); }); });
});

test('a caption says the main line into its card, else its what, and names the stores the card reads or writes', () => {
  const s = U.storyFromFlow(F12, 'order');
  assert.deepEqual(s.steps.map(x => x.caption), ['1. Storefront: Storefront starts the flow.', '2. Places: Storefront places Order API; writes Orders.',
    '3. Checks: Order API checks Cart.', '4. Charges: Cart charges Payments.', '5. Ships: Payments ships Shipping; reads Orders.', '6. Tells: Shipping tells Notify.']);
  assert.deepEqual(s.steps[3].highlight, ['o-pay', 'o-m2'], 'the card and the main line into it');
  const what = structuredClone(F12); what.edges.find(e => e.id === 'o-m2').what = 'The checkout **charges** the card. Then it waits.';
  assert.equal(U.storyFromFlow(what, 'order').steps[3].caption, '4. Charges: The checkout charges the card.');
  // a dependency line is no step, and its card is no main card
  assert.ok(!s.steps.some(x => ['o-db', 'o-ledger'].includes(x.select)));
});

test('branches are chapters, offered at the step where they leave the main flow, each a story validate() accepts', () => {
  const s = U.storyFromFlow(F12, 'ticket');
  assert.deepEqual(s.chapters.map(c => [c.at, c.steps.map(x => x.select)]), [[2, ['t-kb']]]);
  assert.equal(s.chapters[0].title, 'Branch from Triage to Knowledge base');
  assert.deepEqual(s.chapters[0].steps[0].tour, ['t-triage', 't-kb']);
  assert.deepEqual(U.storyFromFlow(F12, 'ticket', { chapters: false }).chapters, []);
  const o = U.storyFromFlow(F12, 'order', { id: 'walk', title: 'Walk' });
  assert.equal(o.id, 'walk'); assert.equal(o.title, 'Walk');
  assert.deepEqual(o.chapters.map(c => [c.id, c.at]), [['walk-branch-1', 3], ['walk-branch-2', 3]]);
});

test('the main flow from steps, with no line marked main; a typed view reads its lines as drawn', () => {
  const m = { schemaVersion: 2, nodes: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase() })),
    edges: [{ id: 'cd', from: 'c', to: 'd', step: 3, label: 'ends' }, { id: 'ab', from: 'a', to: 'b', step: 1, label: 'starts' }, { id: 'bc', from: 'b', to: 'c', step: 2 }, { id: 'ad', from: 'a', to: 'd' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'] }] };
  const s = U.storyFromFlow(m, 'v');
  assert.deepEqual(s.steps.map(x => x.select), ['a', 'b', 'c', 'd']);
  assert.equal(s.steps[2].caption, '3. C: B leads to C.');
  assert.deepEqual(storyProblems(m, s), []);
  const c4 = U.storyFromFlow(F12, 'checkout-c4');
  assert.equal(c4.steps[2].caption, '3. Places order: Web app places order Checkout API; writes Orders DB.');
});

test('a sequence view tells its messages in order; a BPMN view its path from the start event', () => {
  const seq = read('./sequence-minimal.json'), v = seq.views[0];
  v.edges.push({ id: 'self', type: 'uml.Message', from: 'server', to: 'server', label: 'check()', props: { sort: 'call' } });
  const s = U.storyFromFlow(seq, v.id), msgs = v.edges.filter(e => e.type === 'uml.Message').map(e => e.id);
  assert.deepEqual(s.steps.map(x => x.select), msgs);
  assert.match(s.steps[0].caption, /^1\. get\(id\): .+ to .+\.$/);
  assert.deepEqual(s.steps[0].tour, ['client', 'server']);
  assert.ok(!s.steps[2].tour, 'a message to itself has no tour');
  assert.match(s.steps[2].caption, /to itself\.$/);
  assert.deepEqual(storyProblems(seq, s), []);
  const bp = read('./bpmn-minimal.json'), b = U.storyFromFlow(bp, 'v');
  assert.deepEqual(b.steps.map(x => x.select), ['start', 'task', 'end']);
  assert.deepEqual(storyProblems(bp, b), []);
});

test('no view, or a view with no main flow, throws; the model is not changed', () => {
  const before = JSON.stringify(F12);
  U.storyFromFlow(F12, 'order');
  assert.equal(JSON.stringify(F12), before);
  assert.throws(() => U.storyFromFlow(F12, 'nope'), /no view "nope"/);
  assert.throws(() => U.storyFromFlow({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }, 'v'), /has no main flow/);
  assert.equal(typeof U.storyFromFlow, 'function');
});

test('lib/umlimator.js has storyFromFlow too, and lib/umlimator.d.ts types it', async () => {
  const core = await import('../lib/umlimator.js');
  assert.equal(core.storyFromFlow(F12, 'order').steps.length, 6);
  const dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  assert.match(dts, /export function storyFromFlow\(model: MapModel, viewId: string, options\?: \{ id\?: string; title\?: string; chapters\?: boolean; audience\?: string \}\): FlowStory;/);
  assert.match(dts, /export interface FlowStory extends Story/);
});

test('a communication view is told from its numbered messages, in time order: each step selects the message and rides the connector that carries it', () => {
  const m = read('./communication-minimal.json'), s = U.storyFromFlow(m, 'v'), drawn = drawnPairs(m, 'v');
  assert.deepEqual(s.steps.map(x => x.caption), ['1. get(id): client calls server.', '1.1. item: server replies to client.']);
  assert.deepEqual(s.steps.map(x => x.select), ['get', 'got']);
  assert.deepEqual(s.steps.map(x => x.tour), [['client', 'server'], ['server', 'client']]);
  s.steps.forEach(x => { assert.ok(drawn.has(x.tour.join('>'))); assert.deepEqual(x.highlight.slice(1).sort(), ['client', 'server']); });
  assert.deepEqual(storyProblems(m, s), []);
  // the stress fixture: every message once, numbered as its picture numbers it, and validate() clean
  const st = read('./communication-stress.json');
  for (const v of st.views) { let t; try { t = U.storyFromFlow(st, v.id); } catch (e) { assert.match(e.message, /has no messages to tell/); continue; }
    const rows = U.layout(st, v.id).nodes.filter(n => n.shape === 'message-row');
    assert.equal(t.steps.length, rows.length, v.id); assert.deepEqual(storyProblems(st, t), [], v.id);
    assert.deepEqual(t.steps.map(x => x.caption.split('. ')[0]).sort(), rows.map(n => String(n.num)).sort(), v.id); }
});

test('audience: kept on the story and its chapters; for "business" the captions leave out the stores a step reads or writes', () => {
  const plain = U.storyFromFlow(F12, 'order'), biz = U.storyFromFlow(F12, 'order', { audience: 'Business' }), eng = U.storyFromFlow(F12, 'order', { audience: 'engineering' });
  assert.equal(plain.audience, undefined);
  assert.deepEqual([biz.audience, ...biz.chapters.map(c => c.audience)], ['Business', 'Business', 'Business']);
  assert.equal(biz.steps[4].caption, '5. Ships: Payments ships Shipping.');
  assert.equal(plain.steps[4].caption, '5. Ships: Payments ships Shipping; reads Orders.');
  assert.deepEqual(eng.steps.map(x => x.caption), plain.steps.map(x => x.caption), 'another audience changes no caption');
  assert.deepEqual(storyProblems(F12, biz), []);
  // the story with its chapters in the model, as a story's own chapters: validate() accepts them
  assert.deepEqual(U.validate({ ...F12, stories: [biz] }).filter(p => p.path.startsWith('stories')), []);
});

// audit 66: a typed view's story reads its type's flowRole as the layout does, and tells the main flow the picture draws
// (typedMain, the lines marked mainLine): a DFD flow to or from a data store, or a comment link, is a dependency, named in the
// caption of the step that writes or reads it, never a step; a type with no flowRole (a use case view) has no main flow
const drawnMain = (model, vid) => { const g = U.layout(model, vid), main = g.edges.filter(e => e.mainLine), out = [];
  if (!main.length) return out; let e = main.find(x => !main.some(y => y.to === x.from)); out.push(e.from);
  for (; e; e = main.find(y => y.from === e.to)) out.push(e.to); return out; };
const arranged = m => ({ ...structuredClone(m), views: m.views.map(v => ({ ...structuredClone(v), arrange: 'flow' })) });
test('a typed view tells the main flow its picture draws, its type\'s dependency lines named in captions, not steps', () => {
  const dfd = { schemaVersion: 2,
    nodes: [{ id: 'cust', type: 'dfd.ExternalEntity', label: 'Customer' }, { id: 'take', type: 'dfd.Process', label: 'Take order', props: { number: '1' } },
      { id: 'orders', type: 'dfd.DataStore', label: 'Orders', props: { number: 'D1' } }, { id: 'ship', type: 'dfd.Process', label: 'Ship order', props: { number: '2' } },
      { id: 'courier', type: 'dfd.ExternalEntity', label: 'Courier' }],
    edges: [{ id: 'f1', type: 'dfd.DataFlow', from: 'cust', to: 'take', label: 'order' }, { id: 'f2', type: 'dfd.DataFlow', from: 'take', to: 'orders', label: 'new order' },
      { id: 'f3', type: 'dfd.DataFlow', from: 'orders', to: 'ship', label: 'order to ship' }, { id: 'f4', type: 'dfd.DataFlow', from: 'ship', to: 'courier', label: 'parcel' }],
    views: [{ id: 'v', diagram: 'dfd', arrange: 'flow', nodeIds: ['cust', 'take', 'orders', 'ship', 'courier'] }] };
  const s = U.storyFromFlow(dfd, 'v');
  assert.deepEqual(s.steps.map(x => x.select), drawnMain(dfd, 'v'));
  assert.deepEqual(s.steps.map(x => x.select), ['cust', 'take']);
  assert.equal(s.steps[1].caption, '2. Take order: Customer sends order to Take order; new order to Orders.');
  assert.deepEqual(storyProblems(dfd, s), []);
  const min = arranged(read('./dfd-minimal.json')), sm = U.storyFromFlow(min, min.views[0].id);
  assert.deepEqual(sm.steps.map(x => x.select), ['customer', 'take']);
  assert.match(sm.steps[1].caption, /; saved order to Orders\.$/);
  // every view of the data flow example and of each typed example with a flowRole (copies kept in tests/fixtures/; dfd-gallery
  // is the DFD type page's model), arranged: the story's steps are the drawn main flow, and no data store is a step
  for (const f of ['./fixtures/bookshop-data-flow.json', './fixtures/dfd-gallery.json', './fixtures/returns-flowchart.json', './fixtures/fulfil-activity.json', './fixtures/bookshop-c4.json', './fixtures/bookshop-aws.json']) {
    const m = arranged(read(f)), store = new Set(m.nodes.filter(n => /DataStore$/.test(n.type)).map(n => n.id));
    for (const v of m.views) { const want = drawnMain(m, v.id); let got;
      try { got = U.storyFromFlow(m, v.id).steps.map(x => x.select); } catch (e) { assert.match(e.message, /has no main flow/); assert.deepEqual(want, [], `${f} ${v.id}`); continue; }
      // a flowchart's story is the drawn main flow carried back to its start terminal and on to its end (audit 68)
      if (v.diagram === 'flowchart') { const at = got.indexOf(want[0]); assert.ok(at >= 0, `${f} ${v.id}`); got = got.slice(at, at + want.length); }
      assert.deepEqual(got, want, `${f} ${v.id}: the story's steps are the drawn main flow`);
      assert.ok(!got.some(c => store.has(c)), `${f} ${v.id}: no data store is a step`); } }
  // an activity whose comment is linked to its first action: the story starts at the initial node, the comment named in the caption
  const nd = (id, t, label = id) => ({ id, type: 'uml.' + t, label }), fl = (id, from, to) => ({ id, type: 'uml.ControlFlow', from, to });
  const act = { schemaVersion: 2, nodes: [nd('i', 'InitialNode', ''), nd('take', 'Action', 'Take the order'), nd('pack', 'Action', 'Pack the books'), nd('f', 'ActivityFinalNode', ''), nd('note', 'Comment', 'Orders over 50 ship free')],
    edges: [{ id: 'n1', type: 'uml.CommentLink', from: 'note', to: 'take' }, fl('c1', 'i', 'take'), fl('c2', 'take', 'pack'), fl('c3', 'pack', 'f')],
    views: [{ id: 'v', diagram: 'uml.activity', arrange: 'flow', nodeIds: ['note', 'i', 'take', 'pack', 'f'] }] };
  const a = U.storyFromFlow(act, 'v');
  assert.deepEqual(a.steps.map(x => x.select), ['i', 'take', 'pack', 'f']);
  assert.ok(!a.steps.some(x => x.select === 'note') && /Orders over 50 ship free\.$/.test(a.steps[1].caption), a.steps[1].caption);
  // a use case view: its type reads no main flow (no step along a generalization), arranged or not
  const uc = read('./fixtures/use-case-shop.json'); // the shop's use case view, kept in tests/fixtures/
  for (const m of [uc, arranged(uc)]) assert.throws(() => U.storyFromFlow(m, 'shopping'), /has no main flow: a uml\.use-case view reads none/);
});

// audit 67: a BPMN collaboration (a customer's pool and the shop's, each with a start event) tells the main flow its picture
// draws, the start event whose path is longest (bzMain), not the first-listed pool's; arranged or not, the same story
test('a BPMN collaboration tells the main process the arranged picture draws, not the first-listed start event\'s path', () => {
  for (const [f, vid] of [['./fixtures/bookshop-order-to-shipment.json', 'order-to-shipment'], ['./fixtures/bpmn-gallery.json', 'order-to-shipment'], ['./fixtures/integration.json', 'repair-process'],
    ['./fixtures/bpmn-gallery.json', 'order-to-shipment-expanded']]) { // audit 68: the main process through an expanded sub-process, its box a step
    const m = read(f), a = arranged(m), want = drawnMain(a, vid);
    assert.ok(want.length > 3, `${f} ${vid}: the picture draws a main flow`);
    const firstStart = m.views.find(v => v.id === vid).nodeIds.find(id => m.nodes.find(n => n.id === id)?.type === 'bpmn.StartEvent');
    assert.notEqual(want[0], firstStart, `${f} ${vid}: the main process is not the first-listed pool's`);
    for (const x of [a, m]) { const s = U.storyFromFlow(x, vid);
      assert.deepEqual(s.steps.map(st => st.select), want, `${f} ${vid}: the story's steps are the drawn main flow`);
      assert.deepEqual(storyProblems(x, s), []); } }
});

// audit 67: an interaction overview is a control-flow diagram, as the activity: arrange "flow" is no structure warning, and its
// story is its flow from the initial node to the final one, the main flow an arranged picture draws, its comment no step
test('an interaction overview reads a main flow: arrange "flow" is not warned of, and its story tells the drawn main flow', () => {
  const m = read('./fixtures/integration.json'), vid = 'hire-overview', a = arranged(m);
  const at = `views[${m.views.findIndex(v => v.id === vid)}].arrange`;
  assert.deepEqual(U.validate(a).filter(p => p.path === at).map(p => p.message), []);
  const want = drawnMain(a, vid), kind = id => m.nodes.find(n => n.id === id).type;
  assert.equal(kind(want[0]), 'uml.InitialNode'); assert.match(kind(want[want.length - 1]), /FinalNode$/);
  for (const x of [a, m]) { const s = U.storyFromFlow(x, vid);
    assert.deepEqual(s.steps.map(st => st.select), want);
    assert.ok(!s.steps.some(st => kind(st.select) === 'uml.Comment'));
    assert.deepEqual(storyProblems(x, s), []); }
});

// audit 67: the refusal on a type that reads no flow takes "an" before a vowel ("an er view"), "a" before "uml"
test('storyFromFlow\'s refusal is grammatical: an er view, a uml.use-case view', () => {
  const er = read('./er-minimal.json');
  assert.throws(() => U.storyFromFlow(er, er.views[0].id), /has no main flow: an er view reads none$/);
  assert.throws(() => U.storyFromFlow(read('./fixtures/use-case-shop.json'), 'shopping'), /has no main flow: a uml\.use-case view reads none$/);
});

// audit 68: a main path through an expanded sub-process tells the box as a step, in one pool as in a collaboration; with no
// main path its type reads, BPMN's own path starts at the main process's start event, never the first-listed pool's
test('a BPMN main flow through an expanded sub-process is told, the box a step', () => {
  const N = (id, type, extra = {}) => ({ id, type, parent: 'pool', label: id.toUpperCase(), ...extra }), S = (id, from, to) => ({ id, type: 'bpmn.SequenceFlow', from, to });
  const m = { schemaVersion: 2, nodes: [{ id: 'pool', type: 'bpmn.Participant', label: 'Pool' }, N('s', 'bpmn.StartEvent'), N('sp', 'bpmn.SubProcess'),
    N('in', 'bpmn.StartEvent', { parent: 'sp' }), N('t', 'bpmn.Task', { parent: 'sp' }), N('out', 'bpmn.EndEvent', { parent: 'sp' }), N('e', 'bpmn.EndEvent')],
  edges: [S('f1', 's', 'sp'), S('f2', 'sp', 'e'), S('g1', 'in', 't'), S('g2', 't', 'out')],
  views: [{ id: 'v', diagram: 'bpmn', title: 'T', nodeIds: ['pool', 's', 'sp', 'in', 't', 'out', 'e'] }] };
  for (const x of [m, arranged(m)]) { const s = U.storyFromFlow(x, 'v');
    assert.deepEqual(s.steps.map(st => st.select), ['s', 'sp', 'e']);
    assert.equal(s.steps[1].caption, '2. SP: S leads to SP.'); assert.deepEqual(s.steps[1].tour, ['s', 'sp']);
    assert.deepEqual(storyProblems(x, s), []); }
});

// audit 68: a step names an unnamed control node by its kind, as describe() and its accessible name do, never by its id; a
// comment linked to a step is said as a note, not named as a store the step takes from
test('storyFromFlow names an unnamed initial, merge, fork, join or final node by its kind, and a comment as a note', () => {
  for (const [f, vid] of [['./fixtures/integration.json', 'hire-overview'], ['./fixtures/integration.json', 'swap-battery'], ['./fixtures/fulfil-activity.json', 'take-payment'], ['./fixtures/fulfil-activity.json', 'fulfil']]) {
    const m = read(f), byId = new Map(m.nodes.map(n => [n.id, n])), s = U.storyFromFlow(m, vid), caps = [...s.steps, ...s.chapters.flatMap(c => c.steps)].map(x => x.caption);
    // the unnamed control nodes the picture draws no name on (an activity's diamond draws its id, audit 39: named as drawn)
    const drawn = new Map(U.layout(m, vid).nodes.map(n => [n.id, n]));
    const bare = m.views.find(v => v.id === vid).nodeIds.filter(id => byId.has(id) && !String(byId.get(id).label ?? '').trim() && /(Initial|Final|Merge|Fork|Join|Decision)Node$/.test(byId.get(id).type) && drawn.has(id) && !drawn.get(id).label);
    assert.ok(bare.length >= 2, `${f} ${vid}: unnamed control nodes`);
    for (const c of caps) for (const id of bare) assert.ok(!new RegExp(`(^|[ :.])${id}([ :.;,]|$)`).test(c), `${f} ${vid}: ${id} in ${c}`);
    assert.match(s.steps[0].caption, /^1\. The initial node: the initial node starts the flow/); }
  // the BPMN gallery's text annotation on Take payment
  const b = U.storyFromFlow(read('./fixtures/bpmn-gallery.json'), 'order-to-shipment');
  assert.match(b.steps[1].caption, /^2\. Take payment: .*, note: Card details go straight to the provider; the shop never sees them\.$/);
  assert.ok(!b.steps.some(x => /takes from Card details/.test(x.caption)));
});

// audit 68: a flowchart's story is told from its start terminal to an end one: the drawn main flow carried back across the
// data symbols' band to the start and on to the end, and on through an on-page connector pair (A ... a), as describe() reads it
test('a flowchart story runs from its start terminal to its end, through the data symbols\' band', () => {
  const r = read('./fixtures/returns-flowchart.json');
  for (const x of [r, arranged(r)]) { const s = U.storyFromFlow(x, 'returns');
    assert.deepEqual(s.steps.map(st => st.select), ['return-arrives', 'slip', 'key-in', 'inspect', 'resaleable', 'refund', 'wait', 'restock', 'stock-records', 'join', 'end']);
    assert.equal(s.steps[0].caption, '1. Returned parcel arrives: Returned parcel arrives starts the flow.');
    assert.deepEqual(storyProblems(x, s), []); }
});
test('a flowchart story carries on through an on-page connector pair, as describe() and the reachable rule do', () => {
  const n = (id, t, label) => ({ id, type: 'flow.' + t, label }), fl = (id, from, to) => ({ id, type: 'flow.Flow', from, to });
  const m = { schemaVersion: 2, nodes: [n('s', 'Terminator', 'Start'), n('p1', 'Process', 'Pick the books'), n('p2', 'Process', 'Pack the books'), n('ca', 'Connector', 'A'),
    n('cb', 'Connector', 'a '), n('p3', 'Process', 'Label the parcel'), n('p4', 'Process', 'Hand to courier'), n('e', 'Terminator', 'Done')],
  edges: [fl('f1', 's', 'p1'), fl('f2', 'p1', 'p2'), fl('f3', 'p2', 'ca'), fl('f4', 'cb', 'p3'), fl('f5', 'p3', 'p4'), fl('f6', 'p4', 'e')],
  views: [{ id: 'v', diagram: 'flowchart', title: 'Ship', nodeIds: ['s', 'p1', 'p2', 'ca', 'cb', 'p3', 'p4', 'e'] }] };
  assert.deepEqual(U.validate(m), []);
  for (const x of [m, arranged(m)]) { const s = U.storyFromFlow(x, 'v');
    assert.deepEqual(s.steps.map(st => st.select), ['s', 'p1', 'p2', 'ca', 'cb', 'p3', 'p4', 'e']);
    assert.equal(s.steps[4].caption, '5. a: the flow carries on from A.'); assert.equal(s.steps[4].tour, undefined); assert.deepEqual(s.steps[4].highlight, ['cb']);
    assert.deepEqual(storyProblems(x, s), []); }
});

// audit 69: a flowchart's connectors of one label are one group of links, never a link for each two of them, and the story
// searches its lines and links from indexes: N alike connectors with no flow in or out (a stale chart: 78 s at 1,000 before),
// and a branch that carries on through every connector of a label (the worst: 460 s at 400), take time near linear in N
const fcAlike = (N, chain) => { const n = (id, t, label) => ({ id, type: 'flow.' + t, label }), fl = (id, from, to, label) => ({ id, type: 'flow.Flow', from, to, ...(label ? { label } : {}) });
  const nodes = [n('s', 'Terminator', 'Start'), n('d', chain ? 'Decision' : 'Process', chain ? 'Ok?' : 'Work'), n('e', 'Terminator', 'End')];
  for (let i = 0; i < N; i++) nodes.push(n('c' + i, 'Connector', 'Z'));
  const edges = [fl('f1', 's', 'd'), fl('f2', 'd', 'e', chain ? 'yes' : ''), ...(chain ? [fl('f3', 'd', 'c0', 'no')] : [])];
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'flowchart', title: 'v', nodeIds: nodes.map(x => x.id), edges: edges.map(e => e.id) }] }; };
const bestOf = (f, r = 3) => { let best = Infinity; for (let k = 0; k < r; k++) { const t = performance.now(); f(); best = Math.min(best, performance.now() - t); } return best; };
test('a flowchart story over many connectors of one label: four times the connectors take at most a small multiple of the time (audit 69) (timed)', () => {
  for (const [chain, q] of [[false, 100], [true, 40]]) {
    const s = U.storyFromFlow(fcAlike(q, chain), 'v');
    assert.deepEqual(s.steps.map(x => x.select), ['s', 'd', 'e']);
    if (chain) assert.deepEqual(s.chapters[0].steps.map(x => x.select), Array.from({ length: q }, (_, i) => 'c' + i), 'the branch carries on through each connector of its label');
    else assert.deepEqual(s.chapters, []);
    U.storyFromFlow(fcAlike(10, chain), 'v'); // warm
    const t1 = bestOf(() => U.storyFromFlow(fcAlike(q, chain), 'v')), t4 = bestOf(() => U.storyFromFlow(fcAlike(4 * q, chain), 'v'));
    assert.ok(t4 <= 16 * t1 + 50, `${chain ? 'a branch through' : 'isolated'}: ${4 * q} connectors took ${t4.toFixed(0)} ms, ${q} took ${t1.toFixed(0)} ms`);
  }
});

// audit 69: storyFromFlow on a typed view asks the type's flowRole once a line and reads each card's lines from an index:
// before, each card's caption asked it of every line (through a merge of the whole model each time), cubic in the cards (a
// 1,000-step flowchart took 25 s). A test type with a layout of its own that costs next to nothing, so the time is the story's
import { registerDiagramType } from '../src/core/registry.js';
import { storyFromFlow as storyFromFlowSrc } from '../src/map/stories.js';
let rowRoles = 0;
registerDiagramType('test.storyrow', { title: 'story row', flowRole: e => (rowRoles++, /^st/.test(e.to) ? 'dep' : 'branch'),
  layout: ({ model, view }) => { const at = new Map(model.nodes.map(n => [n.id, n])), nodes = view.nodeIds.map((id, i) => ({ id, label: at.get(id).label, x: i * 200, y: /^st/.test(id) ? 200 : 0, w: 120, h: 50 }));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n])), edges = model.edges.map(e => ({ ...e, pts: [[byId[e.from].x + 120, 25], [byId[e.to].x, 25]] }));
    return { nodes, edges, byId, families: [], width: nodes.length * 200, height: 300 }; } });
const storyRow = n => { const nodes = [], edges = [];
  for (let i = 0; i < n; i++) { nodes.push({ id: 'p' + i, label: 'Step ' + i }); if (i) edges.push({ id: 'f' + i, from: 'p' + (i - 1), to: 'p' + i, label: 'next' });
    if (i % 2 === 0) { nodes.push({ id: 'st' + i, label: 'Store ' + i }); edges.push({ id: 'w' + i, from: 'p' + i, to: 'st' + i, label: 'writes' }); } }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'test.storyrow', nodeIds: nodes.map(x => x.id), edges: edges.map(e => e.id) }] }; };
test('a typed view\'s story: four times the cards take at most a small multiple of the time, the type asked a few times a line (audit 69) (timed)', () => {
  rowRoles = 0; const s = storyFromFlowSrc(storyRow(300), 'v');
  assert.equal(s.steps.length, 300); assert.equal(s.steps[2].caption, '3. Next: Step 1 next Step 2; writes Store 2.');
  assert.ok(rowRoles <= 10 * 450, `flowRole asked ${rowRoles} times for 450 lines`);
  storyFromFlowSrc(storyRow(20), 'v'); // warm
  const t1 = bestOf(() => storyFromFlowSrc(storyRow(300), 'v')), t4 = bestOf(() => storyFromFlowSrc(storyRow(1200), 'v'));
  assert.ok(t4 <= 16 * t1 + 50, `1,200 steps took ${t4.toFixed(0)} ms, 300 took ${t1.toFixed(0)} ms`);
});

// audit 69: a cloud line's label names what goes along it on every cloud notation (the type's storyNouns), as GCP's did:
// "Order queue: Shop API to Order queue (paid order)", never "Paid order: Shop API paid order Order queue"
test('a cloud view\'s story reads a line label as what goes along the line, on AWS, Azure and GCP alike (audit 69)', () => {
  const aws = U.storyFromFlow(read('./fixtures/bookshop-aws.json'), 'aws-on-aws').steps.map(x => x.caption);
  assert.equal(aws[2], '3. Load balancer: CDN to Load balancer (/api).');
  assert.equal(aws[4], '5. Order queue: Shop API to Order queue (paid order).');
  const I = read('./fixtures/integration.json'), az = U.storyFromFlow(I, 'on-azure').steps.map(x => x.caption);
  assert.equal(az[2], '3. Ride queue: Trip API to Ride queue (ended ride).');
  assert.equal(az[4], '5. Secrets: Ride worker to Secrets (secrets).');
  for (const [d, item, line] of [['aws', 'aws.Service', 'aws.Connection'], ['azure', 'azure.Service', 'azure.Connector'], ['gcp', 'gcp.Product', 'gcp.Path']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: item, label: 'Shop API' }, { id: 'b', type: item, label: 'Order queue' }], edges: [{ id: 'l', type: line, from: 'a', to: 'b', label: 'paid order' }],
      views: [{ id: 'v', diagram: d, nodeIds: ['a', 'b'], edges: ['l'] }] };
    assert.equal(U.storyFromFlow(m, 'v').steps[1].caption, '2. Order queue: Shop API to Order queue (paid order).', d); }
});
