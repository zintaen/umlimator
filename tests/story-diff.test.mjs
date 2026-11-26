// storyFromDiff (product item 4: a pull request's diff told as a story): a step per card and line diff() marks added, changed
// or removed on a view, along its main flow as it was and is, else in the view's order; captions say what happened. By
// default it plays on the model after (validate() accepts it there), with on: 'diff' on diff()'s model. The CLI's diff
// --story: tests/cli.py; the MCP tool story_from_diff: tests/mcp.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as U from '../lib/umlimator-all.js';

const F12 = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url), 'utf8'));
const problems = (model, s) => U.validate({ ...model, stories: [s] }).filter(p => p.path.startsWith('stories'));
// a pull request on the order view: a card and its line added off Cart, Shipping renamed, the line Payments ships Shipping
// and the store Ledger removed (with the line that writes it)
const head = (() => { const m = structuredClone(F12);
  m.nodes.push({ id: 'o-fraud', label: 'Fraud check', what: 'Scores the order.' }); m.views.find(v => v.id === 'order').nodeIds.push('o-fraud');
  m.edges.push({ id: 'o-fr', from: 'o-cart', to: 'o-fraud', label: 'asks' });
  m.nodes.find(n => n.id === 'o-ship').label = 'Shipping svc';
  m.edges = m.edges.filter(e => e.id !== 'o-m3' && e.from !== 'o-ledger' && e.to !== 'o-ledger');
  m.nodes = m.nodes.filter(n => n.id !== 'o-ledger');
  m.views.forEach(v => { v.nodeIds = v.nodeIds.filter(i => i !== 'o-ledger'); if (v.layout) delete v.layout['o-ledger']; });
  return m; })();

test('a step per card and line the change marks, along the main flow; captions say added, changed or removed', () => {
  const s = U.storyFromDiff(F12, head, 'order');
  assert.equal(s.id, 'diff-order'); assert.match(s.title, /what changed$/);
  assert.deepEqual(s.steps.map(x => x.caption), [
    '1. Added: Cart asks Fraud check.', '2. Added: Fraud check: Scores the order.', '3. Removed: Refunds writes Ledger.',
    '4. Removed: Ledger, which was joined to Refunds.', '5. Removed: Payments ships Shipping svc.', '6. Changed: Shipping svc, renamed from Shipping.']);
  assert.deepEqual(s.steps[0].tour, ['o-cart', 'o-fraud'], 'an added line is ridden');
  assert.deepEqual(s.steps[0].select, 'o-fr'); assert.deepEqual(s.steps[5].select, 'o-ship');
  // played on the model after: a removed card or line is selected by no step, and the cards it was joined to are lit
  assert.equal(s.steps[3].select, undefined); assert.deepEqual(s.steps[3].highlight, ['o-refund']);
  assert.equal(s.steps[4].select, undefined); assert.deepEqual(s.steps[4].highlight, ['o-pay', 'o-ship']);
  assert.deepEqual(problems(head, s), []);
});

test("on: 'diff' tells it on diff()'s model, selecting the removed cards and lines; id, title and audience are the caller's", () => {
  const s = U.storyFromDiff(F12, head, 'order', { on: 'diff', id: 'pr', title: 'PR 12', audience: 'business' });
  assert.deepEqual([s.id, s.title, s.audience], ['pr', 'PR 12', 'business']);
  assert.deepEqual(s.steps.map(x => x.select), ['o-fr', 'o-fraud', 'o-d3', 'o-ledger', 'o-m3', 'o-ship']);
  assert.deepEqual(problems(U.diff(F12, head).model, s), []);
});

test("a view with no main flow is told in the view's order; a changed card names the fields; no change, or no view, throws", () => {
  const before = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', kind: 'service' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const after = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'Bee', kind: 'database' }, { id: 'c', label: 'C' }], views: [{ id: 'v', nodeIds: ['c', 'a', 'b'] }] };
  assert.deepEqual(U.storyFromDiff(before, after, 'v').steps.map(x => x.caption), ['1. Added: C.', '2. Changed: Bee, renamed from B (kind).']);
  assert.throws(() => U.storyFromDiff(before, before, 'v'), /view "v" shows no change/);
  assert.throws(() => U.storyFromDiff(before, after, 'nope'), /no view "nope"/);
  const gone = { ...after, views: [{ id: 'w', nodeIds: ['a'] }] };
  assert.throws(() => U.storyFromDiff(after, gone, 'v'), /not in the model after/);
  assert.equal(U.storyFromDiff(after, gone, 'v', { on: 'diff' }).steps.length >= 1, true);
});

test('lib/umlimator.js has storyFromDiff too, and lib/umlimator.d.ts types it', async () => {
  const core = await import('../lib/umlimator.js');
  assert.equal(core.storyFromDiff(F12, head, 'order').steps.length, 6);
  const dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  assert.match(dts, /export function storyFromDiff\(before: MapModel, after: MapModel, viewId: string, options\?: \{ id\?: string; title\?: string; audience\?: string; on\?: 'after' \| 'diff' \}\): Story;/);
});
