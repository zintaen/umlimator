// node --test tests/   (Node 18+; no browser: layout() needs no DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layout } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
// the bench's geometry hash (bench/bench.py, #bench=1): FNV-1a over node boxes, route points and label spots
const hash = g => {
  const sig = JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null])]);
  let h = 2166136261; for (let k = 0; k < sig.length; k++) h = Math.imul(h ^ sig.charCodeAt(k), 16777619) >>> 0;
  return h.toString(16);
};
const expected = read('../bench/results/' + readdirSync(new URL('../bench/results/', import.meta.url)).filter(f => /^\d{4}-\d\d-\d\d-[0-9a-f]+\.json$/.test(f)).sort().pop()).results;

test('layout() draws every benchmark view exactly as the browser did (bench/results)', () => {
  const models = { ...Object.fromEntries(readdirSync(new URL('../bench/models/', import.meta.url)).map(f => [f.replace('.json', ''), read('../bench/models/' + f)])), bookshop: read('../examples/bookshop.json') };
  let n = 0;
  for (const [name, m] of Object.entries(models)) for (const v of m.views) {
    const want = expected[`${name}/${v.id}`];
    if (!want || !want.hashes) continue;
    assert.deepEqual([hash(layout(m, v.id))], want.hashes, `${name}/${v.id}`); n++;
  }
  assert.ok(n >= 8, `checked ${n} views`);
});

test('layout() is deterministic and leaves the model alone', () => {
  const m = read('../bench/models/b26.json'), before = JSON.stringify(m);
  assert.equal(hash(layout(m, 'overview')), hash(layout(m, 'overview')));
  assert.equal(JSON.stringify(m), before);
});

test('edges carry stable ids: the model id, else from->to#n; a drawn line lists every model edge it stands for', () => {
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e1', from: 'a', to: 'b', label: 'calls' }, { from: 'a', to: 'b', label: 'reads' }, { from: 'b', to: 'a', label: 'replies' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const g = layout(m, 'v');
  assert.equal(g.edges.length, 1); // parallel and opposite edges merge into one line
  assert.deepEqual(g.edges[0].ids, ['e1', 'a->b#1', 'b->a#0']);
});

test("a view's repair: false turns port repair off", () => {
  const m = read('../bench/models/b10.json');
  assert.equal(layout(m, 'norepair').ms.rounds, 0);
  assert.ok(layout(m, 'overview').ms.rounds > 0);
  assert.equal(layout(m, 'overview', { repair: false }).ms.rounds, 0);
});

test('an unknown view is an error', () => {
  assert.throws(() => layout(read('../examples/bookshop.json'), 'nope'), /no view "nope"/);
});
