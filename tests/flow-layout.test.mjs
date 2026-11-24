// Layout by business flow, step 4 (docs/diagrams/notes/layout-flow.md sections 5 and 12): in a map view with arrange "flow",
// dependency lines (flow "dep", else kind state or guard) rank, order and row nothing; a card whose lines are all
// dependencies sits in the band under the flow, in the column of the median of the cards it is joined to; the router takes
// dependency lines after the flow lines, and check() lets them run either way. A view without arrange draws as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, check } from '../lib/umlimator-all.js';
import { viewMetrics } from '../src/layout/score.js';

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
