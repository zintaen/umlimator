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
const expected = read('../bench/expected.json').results; // the reference geometry (bench.py --write-expected)

test('layout() draws every benchmark view exactly as the browser did (bench/expected.json)', () => {
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

test('the module bakes in no colour: every colour is a --um-* variable (lib/umlimator-theme.css has the defaults)', () => {
  const src = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  const found = src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/g) || [];
  assert.deepEqual(found, []);
  const theme = readFileSync(new URL('../lib/umlimator-theme.css', import.meta.url), 'utf8');
  for (const v of ['--um-bg', '--um-text', '--um-accent', '--um-edited', '--um-sans', '--um-mono']) assert.ok(theme.includes(v + ':'), v);
});

test('nothing is fetched at runtime: no web fonts, stylesheets or imports in the module or the page', () => {
  for (const f of ['../lib/umlimator.js', '../lib/umlimator-theme.css', '../engine/assets/template.html']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /<link\b|@import|url\(\s*['"]?https?:|fetch\(|XMLHttpRequest|fonts\.googleapis/, f);
  }
});

test('layout() measures text with the measurer it is given (render() passes the host font)', () => {
  const m = { nodes: [{ id: 'a', label: 'i'.repeat(40) }], views: [{ id: 'v', nodeIds: ['a'] }] };
  const est = layout(m, 'v').nodes[0].w, narrow = layout(m, 'v', { measure: (s, px) => s.length * px * 0.25 }).nodes[0].w;
  assert.ok(narrow < est, `${narrow} < ${est}`);
});

test('several badges per node: each gets its own tab, and the card is wide enough for all of them', () => {
  const one = layout({ nodes: [{ id: 'a', label: 'A', badge: 'BUILT' }], views: [{ id: 'v', nodeIds: ['a'] }] }, 'v').nodes[0];
  const three = layout({ nodes: [{ id: 'a', label: 'A', badges: ['BUILT', { text: 'Owner: platform', tone: 'violet' }, 'Q3'] }], views: [{ id: 'v', nodeIds: ['a'] }] }, 'v').nodes[0];
  assert.equal(one.decoT.length, 1); assert.equal(three.decoT.length, 3);
  const span = three.decoT.reduce((a, [, w]) => a + w, 0);
  assert.ok(three.w >= span, `${three.w} >= ${span}`);
  assert.ok(three.decoT.every(([x], i) => i === 0 || x > three.decoT[i - 1][0]), 'left to right');
});

test('a layout may place only some cards: they stay put, the rest take free slots', () => {
  const m = read('../bench/models/b10.json'), v = m.views[0];
  const auto = layout(m, 'overview'), first = v.nodeIds[0], other = v.nodeIds[1];
  v.layout = { [first]: [5, 3] };
  const g = layout(m, 'overview'), at = id => g.nodes.find(n => n.id === id);
  assert.deepEqual([at(first).col, at(first).row], [5, 3]);
  assert.deepEqual([at(other).col, at(other).row], [auto.nodes.find(n => n.id === other).col, auto.nodes.find(n => n.id === other).row]);
  const slots = g.nodes.map(n => n.col + ',' + n.row);
  assert.equal(new Set(slots).size, slots.length, 'no two cards share a slot');
});
