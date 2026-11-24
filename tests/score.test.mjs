// The layout quality score (docs/diagrams/notes/layout-flow.md section 4.4): each metric on hand-built geometries, the score
// of a fixed geometry against a stored number, the weights file, and that no host loads the score's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEIGHTS, viewMetrics, moved, scoreView, mainFlowOf } from '../src/layout/score.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const card = (id, x, y, more = {}) => ({ id, label: id, x, y, w: 100, h: 40, ...more });
// a geometry as layout() returns one: cards, lines with their ends and routes, bounds; a typed view unless map is set
function geo(nodes, lines, map = false) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = lines.map(([from, to, pts, more = {}], i) => ({ id: `e${i}`, _id: `e${i}`, ids: [`e${i}`], from, to, s: byId[from], t: byId[to], pts, ...more }));
  const xs = nodes.flatMap(n => [n.x, n.x + n.w]), ys = nodes.flatMap(n => [n.y, n.y + n.h]);
  return { map, nodes, edges, byId, families: [], lanes: [], blocks: [], stats: {}, bounds: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
}
const flowchart = { id: 'v', diagram: 'flowchart' };

test('score: two lines that cross count 1 in cross, and nothing else', () => {
  const g = geo([card('a', 0, 100), card('b', 300, 100), card('c', 150, 0), card('d', 150, 200)],
    [['a', 'b', [[100, 120], [300, 120]]], ['c', 'd', [[200, 40], [200, 200]]]]);
  const m = viewMetrics(g, { view: flowchart });
  assert.deepEqual([m.hard, m.cross, m.labels, m.reverse, m.straight], [0, 1, 0, 0, null]);
});

test('score: a label set on another line counts 1 in labels', () => {
  const g = geo([card('a', 0, 100), card('b', 300, 100), card('c', 150, 0), card('d', 150, 200)],
    [['a', 'b', [[100, 120], [300, 120]], { label: 'pays', lbl: { x: 230, y: 60, w: 40, h: 20, text: 'pays' } }],
     ['c', 'd', [[250, 40], [250, 200]]]]);
  assert.equal(viewMetrics(g, { view: flowchart }).labels, 1);
  g.edges[0].lbl = { x: 120, y: 125, w: 40, h: 20, text: 'pays' }; // moved off the other line
  assert.equal(viewMetrics(g, { view: flowchart }).labels, 0);
});

test('score: cards over each other count in hard', () => {
  const g = geo([card('a', 0, 0), card('b', 50, 10)], []);
  assert.equal(viewMetrics(g, { view: flowchart }).hard, 1);
});

// A and B on one row, C a row down, B to C with one corner: the main flow uses two rows (2) and one corner (1)
const mainModel = { edges: [{ id: 'e0', from: 'a', to: 'b', flow: 'main' }, { id: 'e1', from: 'b', to: 'c', flow: 'main' }] };
const mainGeo = () => geo([card('a', 0, 0), card('b', 200, 0), card('c', 400, 100)],
  [['a', 'b', [[100, 20], [200, 20]]], ['b', 'c', [[250, 40], [250, 120], [400, 120]]]]);

test('score: a main flow on two rows with one corner counts 3 in straight', () => {
  const g = mainGeo(), m = viewMetrics(g, { model: mainModel, view: flowchart });
  assert.deepEqual(mainFlowOf(g, mainModel, flowchart).cards, ['a', 'b', 'c']);
  assert.equal(m.straight, 3);
  assert.equal(m.reverse, 0);
  assert.equal(viewMetrics(g, { model: { edges: [] }, view: flowchart }).straight, null, 'no main flow: straight not counted');
});

test('score: a main card not past the one before counts in reverse', () => {
  const g = geo([card('a', 200, 0), card('b', 0, 100)], [['a', 'b', [[250, 40], [250, 120], [100, 120]]]]);
  const m = viewMetrics(g, { model: { edges: [{ id: 'e0', from: 'a', to: 'b', flow: 'main' }] }, view: flowchart });
  assert.equal(m.reverse, 2); // its line runs left 150 px, and b is not past a
});

test('score: a flow line that runs left for 40 px counts 1 in reverse; a dep line that does the same counts 0', () => {
  const pts = [[100, 20], [180, 20], [180, 60], [140, 60], [140, 90], [320, 90], [320, 40]];
  const g = () => geo([card('a', 0, 0), card('b', 300, 0)], [['a', 'b', pts.map(p => [...p])]]);
  assert.equal(viewMetrics(g(), { model: { edges: [{ id: 'e0', from: 'a', to: 'b' }] }, view: flowchart }).reverse, 1);
  assert.equal(viewMetrics(g(), { model: { edges: [{ id: 'e0', from: 'a', to: 'b', flow: 'dep' }] }, view: flowchart }).reverse, 0);
  const left8 = geo([card('a', 0, 0), card('b', 300, 0)], [['a', 'b', [[100, 20], [180, 20], [180, 60], [172, 60], [172, 90], [320, 90], [320, 40]]]]);
  assert.equal(viewMetrics(left8, { view: flowchart }).reverse, 0, '8 px back is not more than 8');
  // on a map a state line is a dependency by its kind, a calls line a flow line; a line closing a loop counts nothing
  const map = wk => { const m = geo([card('a', 0, 0), card('b', 300, 0)], [['a', 'b', pts.map(p => [...p]), { wk }]], true); return viewMetrics(m, { model: { edges: [] }, view: { id: 'v' } }).reverse; };
  assert.deepEqual([map('calls'), map('state'), map('guard')], [1, 0, 0]);
  const back = g(); back.edges[0].back = true;
  assert.equal(viewMetrics(back, { view: flowchart }).reverse, 0);
  assert.equal(viewMetrics(g(), { view: { id: 'v', diagram: 'uml.class' } }).reverse, null, 'a structure type has no flow');
});

test('score: moved is the share of untouched cards whose cell changed, and their mean shift', () => {
  const at = (id, col, row) => ({ id, col, row, x: col * 200, y: row * 100, w: 100, h: 40 });
  const before = { nodes: [at('a', 0, 0), at('b', 1, 0), at('c', 2, 0), at('gone', 3, 0)] };
  const after = { nodes: [at('a', 0, 0), at('b', 1, 1), at('c', 4, 0), at('new', 3, 0)] };
  assert.deepEqual(moved(before, after, ['c']), { share: 0.5, shift: 1, cards: 2 });
  assert.deepEqual(moved(before, after), { share: 2 / 3, shift: 1.5, cards: 3 });
  assert.deepEqual(moved(before, before), { share: 0, shift: 0, cards: 4 });
});

test('score: the weights file holds the score.js defaults, and a fixed geometry scores the stored number', () => {
  const w = JSON.parse(read('../bench/score-weights.json'));
  assert.deepEqual(Object.keys(w).sort(), Object.keys(WEIGHTS).sort());
  Object.keys(w).forEach(k => assert.ok(Math.abs(w[k] - WEIGHTS[k]) < 1e-12, k));
  const m = viewMetrics(mainGeo(), { model: mainModel, view: flowchart });
  // 30 * straight 3 + 330 px of line / 15 + 5 points * 12 + a 500 x 140 area / 4e5: a change of weight shows here
  assert.equal(scoreView(m, w), 172.18);
  assert.equal(scoreView(m, w, 0.5), 272.18, 'an edit pair adds 200 times its moved share');
});

test('score: no host loads the score: lib/ holds none of score.js', () => {
  for (const f of ['../lib/umlimator.js', '../lib/umlimator-all.js']) {
    const s = read(f);
    for (const name of ['scoreView', 'viewMetrics', 'mainFlowOf']) assert.ok(!s.includes(name), `${f} holds ${name}`);
  }
});

test('score: bench/score-expected.json covers the fixed corpus with the score.js metrics', () => {
  const e = JSON.parse(read('../bench/score-expected.json'));
  assert.equal(e.corpus, 'fixed');
  const keys = Object.keys(e.views);
  assert.equal(keys.length, e.total.views);
  assert.ok(keys.includes('b10/overview') && ['examples', 'tests'].every(dir => keys.some(k => k.split('/')[0] === dir)));
  for (const k of keys) assert.deepEqual(Object.keys(e.views[k]), ['hard', 'cross', 'labels', 'straight', 'reverse', 'score'], k);
  assert.ok(Math.abs(keys.reduce((a, k) => a + e.views[k].score, 0) - e.total.score) < 0.01 * keys.length);
});
