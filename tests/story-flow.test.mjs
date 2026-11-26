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
  const seq = read('../examples/checkout-sequence.json'), s = U.storyFromFlow(seq, 'checkout-sequence');
  const msgs = seq.views[0].edges.filter(e => e.type === 'uml.Message').map(e => e.id);
  assert.deepEqual(s.steps.map(x => x.select), msgs);
  assert.equal(s.steps[0].caption, '1. checkout(): shopper to storefront.');
  assert.ok(!s.steps[2].tour, 'a message to itself has no tour');
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
  assert.match(dts, /export function storyFromFlow\(model: MapModel, viewId: string, options\?: \{ id\?: string; title\?: string; chapters\?: boolean \}\): FlowStory;/);
  assert.match(dts, /export interface FlowStory extends Story/);
});
