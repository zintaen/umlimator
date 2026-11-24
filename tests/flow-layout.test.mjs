// Layout by business flow, step 4 (docs/diagrams/notes/layout-flow.md sections 5 and 12): in a map view with arrange "flow",
// dependency lines (flow "dep", else kind state or guard) rank, order and row nothing; a card whose lines are all
// dependencies sits in the band under the flow, in the column of the median of the cards it is joined to; the router takes
// dependency lines after the flow lines, and check() lets them run either way. A view without arrange draws as before.
// Step 6 (section 6): the main flow (flow "main", else steps, else the longest path; layered.js's mainFlow) holds one row,
// each branch on one side of it, and a main line takes the middle port of both sides it meets, so it is one straight segment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, check, validate } from '../lib/umlimator-all.js';
import { viewMetrics } from '../src/layout/score.js';
import { mainFlow } from '../src/layout/layered.js';

// section 5.4's view: A -> B -> C, each also writing to L with a state line
const ABC = (arrange, more = {}) => ({ schemaVersion: 2,
  nodes: [{ id: 'A', label: 'Take order' }, { id: 'B', label: 'Charge' }, { id: 'C', label: 'Ship' }, { id: 'L', label: 'Log', kind: 'database' }],
  edges: [{ id: 'ab', from: 'A', to: 'B', label: 'then' }, { id: 'bc', from: 'B', to: 'C', label: 'then' },
    ...['A', 'B', 'C'].map(x => ({ id: x + 'l', from: x, to: 'L', kind: 'state', label: 'writes' }))],
  views: [{ id: 'v', nodeIds: ['A', 'B', 'C', 'L'], ...(arrange && { arrange: 'flow' }), ...more }] });
const cells = g => Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]]));
const line = (g, from, to) => g.edges.find(e => e.from === from && e.to === to);
const maxX = e => Math.max(...e.pts.map(p => p[0]));

test('without arrange the view keeps today\'s cells: L in column 3, and the lines from A and B run across the view past C', () => {
  const g = layout(ABC(false), 'v'), c = g.nodes.find(n => n.id === 'C');
  assert.deepEqual(cells(g), { A: [0, 0], B: [1, 0], C: [2, 0], L: [3, 0] });
  for (const x of ['A', 'B']) assert.ok(maxX(line(g, x, 'L')) > c.x + c.w, `${x} -> L reaches past C`);
  assert.ok(g.edges.every(e => !e.dep), 'no line is a dependency line without arrange');
});

test('arranged, L is under the flow in column 1 (the median of its writers), no line runs past C, and reverse is 0', () => {
  const m = ABC(true), g = layout(m, 'v'), c = g.nodes.find(n => n.id === 'C');
  assert.deepEqual(cells(g), { A: [0, 0], B: [1, 0], C: [2, 0], L: [1, 1] });
  assert.ok(['A', 'B', 'C'].every(x => line(g, x, 'L').dep) && !line(g, 'A', 'B').dep && !line(g, 'B', 'C').dep);
  for (const x of ['A', 'B']) assert.ok(maxX(line(g, x, 'L')) <= c.x + c.w, `${x} -> L stays short of C's far side`);
  const s = viewMetrics(g, { model: m, view: m.views[0] });
  assert.equal(s.reverse, 0); assert.equal(s.hard, 0); assert.equal(s.cross, 0);
  assert.ok(s.length < viewMetrics(layout(ABC(false), 'v'), { model: ABC(false), view: ABC(false).views[0] }).length, 'shorter lines than today');
  assert.deepEqual(check(m, 'v'), [], 'a dependency line running right to left is not a problem');
});

test('flow on the line decides over its kind: a state line marked branch still ranks, and a calls line marked dep does not', () => {
  const m = ABC(true); m.edges.find(e => e.id === 'Cl').flow = 'branch';
  assert.deepEqual(cells(layout(m, 'v')), { A: [0, 0], B: [1, 0], C: [2, 0], L: [3, 0] });
  const d = ABC(true); d.edges.forEach(e => { if (e.to === 'L') { delete e.kind; e.flow = 'dep'; } });
  assert.deepEqual(cells(layout(d, 'v')), { A: [0, 0], B: [1, 0], C: [2, 0], L: [1, 1] });
});

test('a view whose lines are all dependencies has no flow, and ranks as without arrange', () => {
  const m = ABC(true), u = ABC(false); m.edges = m.edges.filter(e => e.to === 'L'); u.edges = m.edges;
  assert.deepEqual(cells(layout(m, 'v')), cells(layout(u, 'v')));
});

test('pins win: a pinned dependency-only card keeps its pin', () => {
  const g = layout(ABC(true, { layout: { L: [3, 0] } }), 'v');
  assert.deepEqual(cells(g).L, [3, 0]);
});

test('with boxes, a card whose lines are all dependencies sits under its group\'s flow rows', () => {
  const m = ABC(true, { containers: [{ id: 'app', label: 'App', nodeIds: ['A', 'B', 'C'] }] }), g = layout(m, 'v'), c = cells(g);
  assert.ok(c.L[1] > Math.max(c.A[1], c.B[1], c.C[1]), 'L below the box');
  assert.equal(c.L[0], c.B[0], 'in the median writer\'s column');
  const plain = cells(layout(ABC(false, { containers: m.views[0].containers }), 'v'));
  assert.ok(plain.L[0] > plain.C[0], 'without arrange L is ranked past C');
});

// section 6.4's view: an order pipeline of six main cards, with a two-card refund branch off Pay
const MAIN = ['web', 'api', 'cart', 'pay', 'ship', 'mail'];
const ORDER = (how = 'main', more = {}, refund = {}) => ({ schemaVersion: 2,
  nodes: [...MAIN, 'refund', 'credit'].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  edges: [...MAIN.slice(1).map((to, i) => ({ id: 'm' + i, from: MAIN[i], to, label: 'then', ...(how === 'main' ? { flow: 'main' } : how === 'step' ? { step: i === 3 ? '4a' : i + 1 } : {}) })),
    { id: 'r0', from: 'pay', to: 'refund', label: 'on failure', ...(how === 'step' && { step: '4b' }), ...refund }, { id: 'r1', from: 'refund', to: 'credit', label: 'credits' }],
  views: [{ id: 'v', nodeIds: ['refund', 'credit', ...MAIN], arrange: 'flow', ...more }] }); // the branch first: the main flow is not the order given

test('the main flow holds row 0: every main card on it, every main line two points, the refund branch on one side', () => {
  const m = ORDER(), g = layout(m, 'v'), c = cells(g);
  MAIN.forEach((id, i) => assert.deepEqual(c[id], [i, 0], id));
  for (let i = 1; i < MAIN.length; i++) assert.equal(line(g, MAIN[i - 1], MAIN[i]).pts.length, 2, `${MAIN[i - 1]} -> ${MAIN[i]} is one straight segment`);
  assert.ok(c.refund[1] > 0 && c.credit[1] > 0, 'the branch below the main row, both its cards');
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.equal(s.straight, 0); assert.equal(s.reverse, 0); assert.equal(s.hard, 0);
  assert.deepEqual(check(m, 'v'), []);
});

test('a main flow from steps gives the same cells as flow "main"; with neither, the longest path, ties to the first mentioned', () => {
  assert.deepEqual(cells(layout(ORDER('step'), 'v')), cells(layout(ORDER(), 'v')), 'steps 1, 2, 3, 4a, 5 (4b a branch)');
  const c = cells(layout(ORDER('none'), 'v')); // Web to Mail and Web to Credit are both five lines long; the view names Credit's first
  ['web', 'api', 'cart', 'pay', 'refund', 'credit'].forEach((id, i) => assert.deepEqual(c[id], [i, 0], id));
});

test('an exception branch (a guard line) goes above the main row, which stays one row', () => {
  const g = layout(ORDER('main', {}, { kind: 'guard', flow: 'branch' }), 'v'), c = cells(g), r = c.web[1];
  MAIN.forEach((id, i) => assert.deepEqual(c[id], [i, r], id));
  assert.ok(c.refund[1] < r && c.credit[1] < r, 'the branch above');
  for (let i = 1; i < MAIN.length; i++) assert.equal(line(g, MAIN[i - 1], MAIN[i]).pts.length, 2);
});

test('pins win: a main card pinned at row 2 stays there, and the other main cards stay at row 0', () => {
  const c = cells(layout(ORDER('main', { layout: { cart: [2, 2] } }), 'v'));
  assert.deepEqual(c.cart, [2, 2]);
  MAIN.filter(id => id !== 'cart').forEach(id => assert.equal(c[id][1], 0, id));
});

test('without arrange the main-flow fields change nothing, and the lines take no main port', () => {
  const m = ORDER(); delete m.views[0].arrange; const u = ORDER(); delete u.views[0].arrange; u.edges.forEach(e => { delete e.flow; });
  const g = layout(m, 'v'); assert.deepEqual(cells(g), cells(layout(u, 'v')));
  assert.ok(g.edges.every(e => !e.mainLine));
});

test('mainFlow: flow "main" first, then steps in step order with a step\'s first suffix, then run order, then the longest path', () => {
  const L = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'a', to: 'x' }, { from: 'x', to: 'y' }];
  assert.deepEqual(mainFlow(L), { cards: ['a', 'b', 'c', 'd'], lines: [0, 1, 2], by: 'path', breaks: [] });
  assert.deepEqual(mainFlow(L.map((e, i) => i > 2 ? { ...e, flow: 'main' } : e)).cards, ['a', 'x', 'y']);
  const S = [{ from: 'c', to: 'd', step: 3 }, { from: 'a', to: 'b', step: 1 }, { from: 'b', to: 'x', step: '2b' }, { from: 'b', to: 'c', step: '2a' }];
  assert.deepEqual(mainFlow(S), { cards: ['a', 'b', 'c', 'd'], lines: [1, 3, 0], by: 'step', breaks: [] });
  assert.deepEqual(mainFlow([{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }], { run: true }), { cards: ['c', 'd', 'e'], lines: [1, 2], by: 'run', breaks: [[1, 0]] });
  assert.equal(mainFlow(L, { dep: () => true }), null, 'no flow line, no main flow');
  assert.deepEqual(mainFlow(L, { back: new Set([1]), dep: e => e.to === 'y' }).cards, ['a', 'b'], 'a loop line and a dependency line rank nothing; ties to the first');
});

test('validate() warns where an arranged view\'s steps break into chains, and says nothing of one chain', () => {
  const m = ORDER('step'); assert.deepEqual(validate(m), []);
  m.edges.find(e => e.id === 'm1').from = 'web'; // step 2 starts at Web, not at Api where step 1 ends
  const said = validate(m).map(p => `${p.level} ${p.path} ${p.message}`);
  assert.deepEqual(said, ['warning edges[1] step 2 starts at "Web", not at "Api" where step 1 ends: the steps break into chains here, and the longest chain (4 lines, from "Web") is the main flow']);
});
