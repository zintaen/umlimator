// A typed view's layout (work package 1.4), at the layout's level: nodes carry their sizes, as shapes will give them (1.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph, hit } from '../src/layout/layered.js';
import { readFileSync } from 'node:fs';
import { VIEW_GEO, VIEW_PAINT, geometryKey, layoutTyped } from '../src/layout/typed.js';
import { routeAudit, overlapIssues } from '../src/layout/audit.js';
import { layout } from '../src/map/api.js';

// routeAudit lets lines with a set route (a hub's comb) share and cross one another; a typed view's loops and fans are audited as any line
const clean = g => { assert.deepEqual(overlapIssues(g, ''), []); assert.deepEqual(routeAudit({ ...g, edges: g.edges.map(e => ({ ...e, fixed: undefined })) }, ''), []); };
const FOUR = dir => ({ direction: dir, nodes: [{ id: 'a', label: 'A', col: 0, row: 0, w: 140, h: 80 }, { id: 'b', label: 'B', col: 1, row: 0, w: 140, h: 80 }],
  edges: ['owner', 'buyer', 'seller', 'agent'].map(r => ({ id: r, from: 'a', to: 'b', label: r })) });
const LOOPS = { nodes: [{ id: 'up', label: 'Up', col: 0, row: 0, w: 140, h: 80 }, { id: 'st', label: 'Waiting', col: 0, row: 1, w: 140, h: 80 }, { id: 'nx', label: 'Next', col: 1, row: 1, w: 140, h: 80 }],
  edges: [{ id: 'retry', from: 'st', to: 'st', label: 'retry' }, { id: 'again', from: 'st', to: 'st', label: 'again' }, { id: 'go', from: 'st', to: 'nx', label: 'go' }, { id: 'in', from: 'up', to: 'st' }] };
const segs = e => e.pts.slice(1).map((p, i) => [e.pts[i], p]);
const cuts = (e, n) => segs(e).some(([a, b]) => Math.max(a[0], b[0]) > n.x && Math.min(a[0], b[0]) < n.x + n.w && Math.max(a[1], b[1]) > n.y && Math.min(a[1], b[1]) < n.y + n.h);
// a class of 20 members: 20 rows of 18 px under a 40 px name
const CLASS = { id: 'order', label: 'Order', col: 0, row: 0, w: 180, h: 20 * 18 + 40 };

test('a 20-member class lays out clean, its row as tall as it is; a row with no tall node keeps the view\'s node height', () => {
  const g = layoutTyped({ nodes: [CLASS, { id: 'line', label: 'Line', col: 1, row: 0 }, { id: 'pay', label: 'Payment', col: 1, row: 1 }, { id: 'cust', label: 'Customer', col: 0, row: 1 }, { id: 'note', label: 'Note', col: 2, row: .5 }],
    edges: [{ id: 'a', from: 'order', to: 'line', label: 'lines' }, { id: 'b', from: 'order', to: 'pay', label: 'paid by' }, { id: 'c', from: 'cust', to: 'pay', label: 'pays' }, { id: 'd', from: 'line', to: 'note' }] });
  clean(g);
  const at = Object.fromEntries(g.nodes.map(n => [n.id, n]));
  assert.equal(at.line.y, 0); assert.equal(at.pay.y, 400 + 44); assert.equal(at.cust.y, 400 + 44); // row 0 is 400 tall, then the 44 px gap
  assert.equal(at.note.y, (0 + 444) / 2); // a half row: halfway between its two rows' tops
  g.edges.forEach(e => assert.ok(e.lbl || !e.label, `line ${e.id} keeps its label`));
});

test('with every node the view\'s node height, a typed view\'s rows have a map\'s pitch: the same geometry as a plain layout', () => {
  const dg = { nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 1, row: .5 }, { id: 'c', col: 0, row: 1 }, { id: 'd', col: 1, row: 2 }], edges: [{ id: 'x', from: 'a', to: 'b' }, { id: 'y', from: 'c', to: 'd' }] };
  const box = g => g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]);
  assert.deepEqual(box(layoutTyped(dg)), box(layoutGraph(dg, false)));
});

test('four lines between two nodes are laid out apart: their own ports, no shared run, labels that do not overlap (risks.md F2)', () => {
  const g = layoutTyped(FOUR('right'));
  clean(g);
  assert.equal(g.edges.length, 4);
  for (const k of ['p1', 'p2']) assert.equal(new Set(g.edges.map(e => e[k].join())).size, 4, `four ports for ${k}`);
  const L = g.edges.map(e => e.lbl); L.forEach(l => assert.ok(l, 'every line keeps its label'));
  L.forEach((l, i) => L.slice(i + 1).forEach(m => assert.ok(!hit(l, m), `labels "${l.text}" and "${m.text}" overlap`)));
});

test('a line from a node to itself is a loop on its top right corner, clear of other nodes, with its label (risks.md F1)', () => {
  const g = layoutTyped(LOOPS);
  clean(g);
  const st = g.byId.st, loops = g.edges.filter(e => e.from === 'st' && e.to === 'st');
  assert.equal(loops.length, 2);
  loops.forEach(e => {
    assert.deepEqual([e.fs, e.ts, e.pts.length], ['R', 'T', 5]);
    assert.deepEqual(e.pts[0], [st.x + st.w, e.pts[0][1]]); assert.deepEqual(e.pts[4], [e.pts[4][0], st.y]); // on its right side, then its top
    assert.ok(e.lbl, 'the loop keeps its label');
    g.nodes.forEach(n => { assert.ok(!cuts(e, n), `loop ${e.id} cuts ${n.id}`); assert.ok(!hit(e.lbl, n), `label of ${e.id} on ${n.id}`); });
  });
  assert.ok(!hit(loops[0].lbl, loops[1].lbl));
  // other lines keep 10 px off a loop's corners (the line from above came down onto the outer loop's corner without that)
  const corners = loops.flatMap(e => e.pts.slice(1, 4)), others = g.edges.filter(e => !loops.includes(e));
  const away = (p, [a, b]) => Math.hypot(p[0] - Math.max(Math.min(a[0], b[0]), Math.min(Math.max(a[0], b[0]), p[0])), p[1] - Math.max(Math.min(a[1], b[1]), Math.min(Math.max(a[1], b[1]), p[1])));
  corners.forEach(p => others.forEach(e => segs(e).forEach(s => assert.ok(away(p, s) >= 10, `line ${e.id} passes ${away(p, s).toFixed(1)} px from a loop's corner`))));
  // a line pushed off level by the loops' ports runs straight again, its port moved level with its other end (port repair)
  assert.equal(g.edges.find(e => e.id === 'go').pts.length, 2);
});

test('a self-loop on a node whose id is a name objects inherit lays out', () => {
  for (const id of ['constructor', 'toString', '__proto__']) {
    const g = layoutTyped({ nodes: [{ id, label: id, col: 0, row: 0, w: 140, h: 80 }], edges: [{ id: 'l', from: id, to: id, label: 'again' }] });
    assert.equal(g.edges[0].pts.length, 5, id);
  }
});

test('a map line or view with a field named as one the typed layout uses lays out as without it', () => {
  const model = extra => ({ nodes: ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase() })), views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], ...extra.view }],
    edges: [{ id: 'e1', from: 'a', to: 'b', label: 'calls', ...extra.line }, { id: 'e2', from: 'a', to: 'c', label: 'reads', ...extra.line }, { id: 'e3', from: 'b', to: 'c' }] });
  const geo = m => { const g = layout(m, 'v'); return JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.pts, e.lbl && [e.lbl.x, e.lbl.y, e.lbl.w, e.lbl.h]]), g.bounds]); };
  const names = ['self', 'fan', 'how', 'corners', 'typed', 'turned', 'direction', 'lane'];
  const plain = geo(model({}));
  assert.equal(geo(model({ line: Object.fromEntries(names.map(k => [k, true])) })), plain);
  assert.equal(geo(model({ view: { typed: true, turned: true, direction: 'down' } })), plain);
});

test('direction "down" keeps the label of every line between one pair, as "right" does (risks.md F2)', () => {
  for (const dir of ['right', 'down']) {
    const g = layoutTyped(FOUR(dir)), L = g.edges.map(e => e.lbl);
    clean(g);
    assert.equal(L.filter(Boolean).length, 4, dir);
    assert.equal(new Set(g.edges.flatMap(e => [e.p1.join(), e.p2.join()])).size, 8, `${dir}: four ports on each node`);
    L.forEach((l, i) => L.slice(i + 1).forEach(m => assert.ok(!hit(l, m), `${dir}: labels "${l.text}" and "${m.text}" overlap`)));
  }
});

test('direction "down" is the left-to-right layout of the view with every box turned, transposed (stage 1 note §6)', () => {
  const dg = { nodes: [CLASS, { id: 'line', label: 'Line', col: 1, row: 0, w: 168, h: 64 }, { id: 'pay', label: 'Payment', col: 1, row: 1, w: 150, h: 90 }],
    edges: [{ id: 'a', from: 'order', to: 'line', label: 'lines' }, { id: 'b', from: 'order', to: 'pay', label: 'paid by' }, { id: 'c', from: 'line', to: 'pay', label: 'settles' }, { id: 's', from: 'pay', to: 'pay', label: 'retry' }] };
  const down = layoutTyped({ ...dg, direction: 'down' });
  const twin = layoutGraph({ ...dg, typed: true, turned: true, nodes: dg.nodes.map(n => ({ ...n, w: n.h, h: n.w })) }, false);
  const T = p => [p[1], p[0]], S = { L: 'T', T: 'L', R: 'B', B: 'R' }, box = r => r && [r.x, r.y, r.w, r.h], tbox = r => r && [r.y, r.x, r.h, r.w];
  assert.deepEqual(down.nodes.map(box), twin.nodes.map(tbox));
  assert.deepEqual(down.edges.map(e => [e.id, e.fs, e.ts, e.pts, box(e.lbl)]), twin.edges.map(e => [e.id, S[e.fs], S[e.ts], e.pts.map(T), tbox(e.lbl)]));
  assert.deepEqual(box(down.bounds), tbox(twin.bounds));
  clean(down);
  down.edges.forEach(e => { assert.ok(e.lbl, `line ${e.id} keeps its label`); assert.equal(e.lbl.h, 18); }); // labels upright: their real size
  assert.ok(down.byId.line.y > down.byId.order.y + down.byId.order.h, 'the next layer is below');
});

test('an edit that moves nothing (a colour, a props field) lays out and routes nothing; one that does lays out again (risks.md F7)', () => {
  const dg = { nodes: [{ id: 'a', label: 'A', col: 0, row: 0, w: 140, h: 80, color: 'teal', props: { abstract: false } }, { id: 'b', label: 'B', col: 1, row: 0, w: 140, h: 80 }],
    edges: [{ id: 'x', from: 'a', to: 'b', label: 'uses', color: 'grey' }] };
  const memo = {}, g = layoutTyped(dg, memo);
  assert.equal(memo.runs, 1);
  const g2 = layoutTyped({ ...dg, nodes: [{ ...dg.nodes[0], color: 'red', props: { abstract: true } }, dg.nodes[1]], edges: [{ ...dg.edges[0], color: 'blue' }] }, memo);
  assert.equal(memo.runs, 1, 'a paint edit lays out nothing');
  assert.equal(g2, g); assert.equal(g2.byId.a.color, 'red'); assert.equal(g2.byId.a.props.abstract, true); assert.equal(g2.edges[0].color, 'blue'); // repainted
  layoutTyped({ ...dg, nodes: [{ ...dg.nodes[0], h: 120 }, dg.nodes[1]] }, memo);
  assert.equal(memo.runs, 2, 'a size edit lays out again');
  layoutTyped({ ...dg, edges: [{ ...dg.edges[0], label: 'calls' }] }, memo);
  assert.equal(memo.runs, 3, 'a label edit lays out again: the label\'s size moves geometry');
  const m2 = {}, red = layoutTyped(dg, m2), plain = layoutTyped({ ...dg, nodes: [{ ...dg.nodes[0], color: undefined }, dg.nodes[1]].map(({ color, ...n }) => n) }, m2);
  assert.equal(m2.runs, 1); assert.equal(plain, red); assert.ok(!('color' in plain.byId.a), 'a colour taken off goes');
  for (const k of ['mainSteps', 'blocks']) assert.notEqual(geometryKey({ ...dg, [k]: k === 'blocks' ? [{ x: 0, y: 0, w: 9, h: 9 }] : true }), geometryKey(dg), k);
});

test('the geometry key holds every field of the view the layout reads that is not paint', () => {
  const read = new Set([...readFileSync(new URL('../src/layout/layered.js', import.meta.url), 'utf8').matchAll(/\bdg\.(\w+)/g)].map(m => m[1]));
  ['nodes', 'edges', ...VIEW_GEO, ...VIEW_PAINT].forEach(k => read.delete(k));
  assert.deepEqual([...read], []);
});
