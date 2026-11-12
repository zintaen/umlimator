// A typed view's layout (work package 1.4), at the layout's level: nodes carry their sizes, as shapes will give them (1.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph, hit } from '../src/layout/layered.js';
import { readFileSync } from 'node:fs';
import { VIEW_GEO, VIEW_PAINT, geometryKey, layoutTyped } from '../src/typed/layout.js';
import { routeAudit, overlapIssues } from '../src/layout/audit.js';
import { layout } from '../src/map/api.js';
import { textW } from '../src/core/text.js';

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
  const read = new Set(['../src/layout/layered.js', '../src/typed/layout.js'].flatMap(f => [...readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/\bdg\.(\w+)/g)].map(m => m[1])));
  ['nodes', 'edges', ...VIEW_GEO, ...VIEW_PAINT].forEach(k => read.delete(k));
  assert.deepEqual([...read], []);
});

// ---- boxes on typed views (work package 2.1, notes/stage-2.md §3 to §5), with a test-only type that depends on no UML code:
// a shown node that a shown node names as `parent` is a box holding the shown nodes it owns that are not boxes themselves
import { registerDiagramType } from '../src/core/registry.js';
import { SHAPE } from '../src/draw/shapes.js';
import { svgOf } from '../src/draw/svg.js';
const nestBoxes = (m, v) => { const shown = new Set(v.nodeIds), ns = m.nodes.filter(n => shown.has(n.id)), isBox = n => ns.some(k => k.parent === n.id);
  return ns.filter(isBox).map(p => ({ id: p.id, label: p.label, title: `«box» ${p.label}`, nodeIds: ns.filter(n => n.parent === p.id && !isBox(n)).map(n => n.id),
    ...(shown.has(p.parent) ? { parent: p.parent } : {}), shape: 'test-frame', aria: `Box ${p.label}` })); };
registerDiagramType('test.nest', { title: 'nested boxes',
  boxes: nestBoxes,
  layout: ({ model, view, pos, memo }) => { const bx = nestBoxes(model, view), skip = new Set(bx.map(b => b.id)), shown = new Set(view.nodeIds);
    const nodes = view.nodeIds.filter(id => !skip.has(id)).map(id => ({ id, label: model.nodes.find(n => n.id === id).label, col: pos[id][0], row: pos[id][1], w: 132, h: 56 }));
    const edges = model.edges.filter(e => shown.has(e.from) && shown.has(e.to)).map(e => ({ ...e }));
    return layoutTyped({ nodes, edges, containers: bx, direction: view.direction }, memo); } });
SHAPE['test-frame'] = { frame: f => `<rect class="family-box test-frame" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"/><text class="family-title" data-t="ft" data-o="${f.id}">${f.title}</text>` };
// three levels of boxes, A holding B holding C; c1 at depth 3 has a line to t0 at depth 0, one to c2 in its own box, and one in from
// b1 a box out; a1 calls t1, and t1 a box's border (B); D, a box beside A with no line, whose title is wider than its card
const NEST = (extra = {}) => ({ schemaVersion: 2,
  nodes: [{ id: 'A', label: 'Alpha' }, { id: 'B', label: 'Beta', parent: 'A' }, { id: 'C', label: 'Gamma', parent: 'B' },
    { id: 'c1', label: 'Deep', parent: 'C' }, { id: 'c2', label: 'Deeper', parent: 'C' }, { id: 'b1', label: 'Middle', parent: 'B' }, { id: 'a1', label: 'Outer', parent: 'A' },
    { id: 't0', label: 'Top' }, { id: 't1', label: 'Side' }, { id: 'D', label: 'Delta, a box whose title is longer than what it holds' }, { id: 'd1', label: 'Lone', parent: 'D' }],
  edges: [{ id: 'far', from: 'c1', to: 't0', label: 'reaches' }, { id: 'in', from: 'c1', to: 'c2' }, { id: 'down', from: 'b1', to: 'c1' }, { id: 'out', from: 'a1', to: 't1' }, { id: 'box', from: 't1', to: 'B', label: 'uses' }],
  views: [{ id: 'v', diagram: 'test.nest', nodeIds: ['A', 'B', 'C', 'c1', 'c2', 'b1', 'a1', 't0', 't1', 'D', 'd1'], ...extra }] });
const fam = g => Object.fromEntries(g.families.map(f => [f.id, f]));
const within = (o, f) => o.x > f.x && o.y > f.y && o.x + o.w < f.x + f.w && o.y + o.h < f.y + f.h;
// boxes that do not nest, and a box and a card outside it, keep 32 px apart
const apart = (g, why) => g.families.forEach(f => [...g.families.filter(o => o !== f && !within(o, f) && !within(f, o)), ...g.nodes.filter(n => !within(n, f))]
  .forEach(o => assert.ok(!hit(f, o, 32 - 1), `${why}: ${f.id} within 32 px of ${o.id}`)));

test('three levels of boxes, a line from depth 3 to depth 0: laid out clean, right and down; each box holds exactly its contents', () => {
  for (const direction of ['right', 'down']) {
    const g = layout(NEST({ direction }), 'v'), F = fam(g);
    clean(g);
    assert.deepEqual(g.nodes.map(n => n.id).sort(), ['a1', 'b1', 'c1', 'c2', 'd1', 't0', 't1'], `${direction}: a box's id is not a card`);
    assert.deepEqual(g.families.map(f => [f.id, f.parent ?? null, f.nodeIds]), [['A', null, ['a1']], ['B', 'A', ['b1']], ['C', 'B', ['c1', 'c2']], ['D', null, ['d1']]], direction);
    // each box holds its cards and its boxes, and no card it does not hold
    const holds = { A: ['a1', 'b1', 'c1', 'c2'], B: ['b1', 'c1', 'c2'], C: ['c1', 'c2'] };
    Object.entries(holds).forEach(([b, ids]) => g.nodes.forEach(n => assert.equal(within(n, F[b]), ids.includes(n.id), `${direction}: ${b} and ${n.id}`)));
    assert.ok(within(F.C, F.B) && within(F.B, F.A), `${direction}: C in B in A`);
    // the far line crosses the three borders: it leaves C, B and A, and ends on t0
    const far = g.edges.find(e => e.id === 'far'), end = g.byId.t0;
    assert.ok(within({ x: far.pts[0][0] - 1, y: far.pts[0][1] - 1, w: 2, h: 2 }, F.C) && !within(end, F.A), direction);
    // the line to a box ends on its border, off its title (the header room: at the top, after the transpose too)
    const b = g.edges.find(e => e.id === 'box'), p = b.p2, B = F.B;
    assert.ok([B.x, B.x + B.w].includes(p[0]) || [B.y, B.y + B.h].includes(p[1]), `${direction}: ends on B's border at ${p}`);
    assert.ok(!(p[1] === B.y && p[0] < B.x + 8 + textW('«box» Beta', 11) + 16 + 8), `${direction}: off B's title`);
    g.nodes.forEach(n => [F.A, F.B, F.C].forEach(f => { if (within(n, f)) assert.ok(n.y >= f.y + 24 + 12, `${direction}: ${n.id} under ${f.id}'s header room`); }));
    // each box fits its title, at the top left, which no line or label crosses; boxes that do not nest, and a box and a card
    // outside it, keep 32 px apart (the audit checks the rest: contains, sticks out, a run along a border)
    g.families.forEach(f => { const t = { x: f.x + 8, y: f.y + 3, w: textW(f.title, 11) + 16, h: 22 };
      assert.ok(t.x + t.w <= f.x + f.w - 8, `${direction}: ${f.id} fits its title`);
      g.edges.forEach(e => { assert.ok(!e.pts.slice(1).some((q, i) => hit(t, { x: Math.min(q[0], e.pts[i][0]), y: Math.min(q[1], e.pts[i][1]), w: Math.abs(q[0] - e.pts[i][0]), h: Math.abs(q[1] - e.pts[i][1]) })), `${direction}: ${e.id} crosses ${f.id}'s title`);
        assert.ok(!e.lbl || !hit(t, e.lbl), `${direction}: ${e.id}'s label on ${f.id}'s title`); });
    });
    apart(g, direction);
  }
});

test('a pin on a half column or a half row: every box still keeps 32 px from other boxes and cards (the room goes after the whole column)', () => {
  for (const pin of [{ t1: [0.5, 0.5] }, { t1: [0.5, 0] }, { t0: [3.5, 2] }]) apart(layout(NEST({ layout: pin }), 'v'), JSON.stringify(pin));
});

test('a box named as a member every object inherits (constructor, __proto__, toString) is laid out as any other name', () => {
  const as = name => JSON.stringify({ ...layout(JSON.parse(JSON.stringify(NEST()).replaceAll('"B"', JSON.stringify(name))), 'v'), ms: 0 }).replaceAll(JSON.stringify(name), '"B"');
  ['constructor', '__proto__', 'toString'].forEach(name => assert.equal(as(name), as('B'), name));
  const map = layout({ nodes: [{ id: 'a', label: 'A' }], views: [{ id: 'm', nodeIds: ['a'], containers: [{ id: 'constructor', label: 'K', nodeIds: ['a'] }] }] }, 'm'); // a map's box too
  assert.deepEqual(map.families.map(f => [f.id, Number.isFinite(f.w)]), [['constructor', true]]);
});

test('a box\'s pin takes no slot: pins on box ids alone lay the view out as no pins do', () => {
  const at = g => g.nodes.map(n => [n.id, n.col, n.row]);
  assert.deepEqual(at(layout(NEST({ layout: { A: [0, 0], B: [0, 0], C: [0, 0] } }), 'v')), at(layout(NEST(), 'v')));
});

test('after a re-own every box holds exactly its contents: c2 moved to A lays the view out again', () => {
  const m = NEST(); m.nodes.find(n => n.id === 'c2').parent = 'A';
  const g = layout(m, 'v'), F = fam(g);
  clean(g);
  assert.deepEqual(F.A.nodeIds, ['c2', 'a1']); assert.deepEqual(F.C.nodeIds, ['c1']);
  g.nodes.forEach(n => assert.equal(within(n, F.C), n.id === 'c1', n.id));
  assert.ok(within(g.byId.c2, F.A) && !within(g.byId.c2, F.B));
});

test('a typed view\'s boxes take the type\'s, not the view\'s own containers; a map view of the model is laid out as before', () => {
  const g = layout(NEST({ containers: [{ id: 'own', label: 'Own', nodeIds: ['t0', 't1'] }] }), 'v');
  assert.deepEqual(g.families.map(f => f.id), ['A', 'B', 'C', 'D']);
  const m = NEST(), map = { id: 'm', nodeIds: ['c1', 't0'] }, alone = JSON.stringify(layout({ ...m, views: [map] }, 'm').nodes);
  assert.equal(JSON.stringify(layout({ ...m, views: [...m.views, map] }, 'm').nodes), alone);
});

test('svgOf draws a box whose shape has a frame by it, in the group the canvas selects, named; without one, as a map\'s box with its title', () => {
  const g = layout(NEST(), 'v'), s = svgOf(g);
  assert.match(s, /<g class="family" data-family="B" data-parent="A" role="img" aria-label="Box Beta"><rect class="family-box test-frame" [^>]*\/><text class="family-title" data-t="ft" data-o="B">«box» Beta<\/text><\/g>/);
  assert.equal((s.match(/class="family-box test-frame"/g) || []).length, 4); // the frame's own markup, with the class the canvas outlines a box by
  const plain = svgOf({ ...g, families: g.families.map(({ shape, ...f }) => f) });
  assert.equal((plain.match(/class="family-box"/g) || []).length, 4);
  assert.match(plain, /data-o="C">«box» Gamma<\/text>/);
});

// 3.5's speed flag (risks.md P1): reroute false lays the view out with no rip-up and reroute pass. Four cards each side of a
// middle column, every pair joined: the pass finds a better order (14 crossings, not 18); with the flag the first order stays
test('reroute false: lines that had to cross are not routed again in a new order; the cards are where they were', () => {
  const L = [0, 1, 2, 3].map(i => ({ id: 'l' + i, label: 'L' + i, col: 0, row: i })), R = [0, 1, 2, 3].map(i => ({ id: 'r' + i, label: 'R' + i, col: 2, row: i }));
  const edges = L.flatMap(a => R.map(b => ({ id: a.id + b.id, from: a.id, to: b.id }))).concat([{ id: 'x', from: 'm', to: 'm2' }, { id: 'y', from: 'l0', to: 'm2' }, { id: 'z', from: 'r0', to: 'm2' }]);
  const dg = { nodes: [...L, ...R, { id: 'm', label: 'M', col: 1, row: 0 }, { id: 'm2', label: 'M2', col: 1, row: 3 }], edges };
  const a = layoutTyped(dg), b = layoutTyped({ ...dg, reroute: false });
  assert.deepEqual([a.stats.cross, b.stats.cross], [14, 18], 'the pass is what finds the better order, and it is skipped');
  assert.deepEqual(b.nodes.map(n => [n.x, n.y]), a.nodes.map(n => [n.x, n.y]));
  b.edges.forEach(e => assert.ok(e.pts && e.pts.length >= 2, `line ${e.id} is routed`));
  assert.notEqual(geometryKey(dg), geometryKey({ ...dg, reroute: false }), 'the flag is part of the geometry key');
});
