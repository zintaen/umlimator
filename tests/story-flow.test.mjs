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
