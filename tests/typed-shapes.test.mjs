// The typed engine for shapes, boxes and renames (work package 4.1, notes/stage-4.md §4.2, §6, §7.4, §8.2, §17): on a
// test-only type with an ellipse, a diamond, a bar and a 20 px circle, every line end is slid from its node's box onto its
// shape's outline when drawn, and the layout's points are never changed (a view drawn twice from one memo draws the same
// markup); ownersOn's look (box types, unqualified names, member boxes, shape and word); a box whose id is a member's,
// placed by blockPos; and §17's spike, timed. tests/type-hooks.html draws the same type in Chrome under three fonts and
// drives its gestures. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerDiagramType } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { esc } from '../src/core/text.js';
import { SHAPE, boxOut, r2 } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { mapContext } from '../src/map/context.js';
import { layoutTyped } from '../src/typed/layout.js';
import '../src/typed/draw.js';
import { ownersOn, readingOrder } from '../src/uml/owners.js';

// ---- the stand-in shapes (4.2 builds the real ones in src/uml/flow.js): size, inset (how far inside the box's side the
// outline is at t), draw; and onOutline, how far a point is from the outline
const dip = (e, u, r) => e * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); // an ellipse's depth at u from its axis
const ellInset = (n, s, t) => s === 'L' || s === 'R' ? dip(n.w / 2, t - n.y - n.h / 2, n.h / 2) : dip(n.h / 2, t - n.x - n.w / 2, n.w / 2);
const look = (cls, inner) => (n, c, f) => `<g class="node ${cls}" data-id="${esc(n.id)}" data-shape="${n.shape}" tabindex="-1" role="img" aria-label="${esc(n.aria || n.label || '')}">`
  + `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" class="n-mask" fill="transparent"/>${inner(n, c, f)}</g>`;
const SHAPES = {
  't-ellipse': { size: () => ({ w: 140, h: 64 }), out: boxOut(0), face: n => [n.y, n.y + n.h], inset: ellInset,
    draw: look('t-ellipse', (n, c, f) => `<ellipse cx="${r2(n.x + n.w / 2)}" cy="${r2(n.y + n.h / 2)}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${f}" stroke="${c}"/>`),
    off: (n, [x, y]) => Math.abs(Math.hypot((x - n.x - n.w / 2) / (n.w / 2), (y - n.y - n.h / 2) / (n.h / 2)) - 1) * Math.min(n.w, n.h) / 2 },
  't-diamond': { size: () => ({ w: 28, h: 28 }), out: boxOut(0), face: n => [n.y, n.y + n.h],
    inset: (n, s, t) => s === 'L' || s === 'R' ? n.w / 2 * Math.min(1, Math.abs(t - n.y - n.h / 2) / (n.h / 2)) : n.h / 2 * Math.min(1, Math.abs(t - n.x - n.w / 2) / (n.w / 2)),
    draw: look('t-diamond', (n, c, f) => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; return `<path d="M${cx} ${n.y}L${n.x + n.w} ${cy}L${cx} ${n.y + n.h}L${n.x} ${cy}Z" fill="${f}" stroke="${c}"/>`; }),
    off: (n, [x, y]) => Math.abs(Math.abs(x - n.x - n.w / 2) / (n.w / 2) + Math.abs(y - n.y - n.h / 2) / (n.h / 2) - 1) * n.w / 2 / Math.SQRT2 },
  't-circle': { size: () => ({ w: 20, h: 20 }), out: boxOut(0), face: n => [n.y, n.y + n.h], inset: ellInset,
    draw: look('t-circle', (n, c) => `<circle cx="${n.x + 10}" cy="${n.y + 10}" r="10" fill="${c}"/>`),
    off: (n, [x, y]) => Math.abs(Math.hypot(x - n.x - 10, y - n.y - 10) - 10) },
  't-bar': { size: () => ({ w: 6, h: 64 }), out: boxOut(0), face: n => [n.y, n.y + n.h], inset: () => 0,
    draw: look('t-bar', (n, c) => `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="${c}"/>`) },
};
Object.assign(SHAPE, SHAPES);
// a point's distance from a box's border (a bar's outline, a box's)
const offBox = (n, [x, y]) => { const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h);
  return dx || dy ? Math.hypot(dx, dy) : Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y); };
const offOutline = (n, p) => (SHAPES[n.shape] && SHAPES[n.shape].off || offBox)(n, p);

// ---- the test type: nodes by type to a shape; states and their regions as boxes, through ownersOn's look
const SHAPE_OF = { 'test.Case': 't-ellipse', 'test.Decision': 't-diamond', 'test.Start': 't-circle', 'test.Fork': 't-bar' };
const LOOK = { boxTypes: ['test.State'], qualify: false, members: ['test.Region'], shape: () => 'package', word: x => x.type === 'test.Region' ? 'Region' : 'State' };
const shapesGeo = ({ model, view, pos, memo }) => {
  const pic = ownersOn(model, view, LOOK), at = id => pic.at.get(id), down = view.direction === 'down';
  const nodes = pic.ids.filter(id => !pic.open.has(id)).map(id => { const x = at(id), shape = SHAPE_OF[x.type] || 'classifier';
    const d = { id, label: x.label ?? '', type: x.type, kind: 'file', shape, aria: `${x.type.slice(5)} ${x.label ?? ''}`, col: (pos[id] || [0, 0])[0], row: (pos[id] || [0, 0])[1] };
    return { ...d, ...SHAPE[shape].size(d) }; });
  const drawnIds = new Set(nodes.map(n => n.id)), bar = id => at(id) && at(id).type === 'test.Fork';
  const edges = (model.edges || []).filter(e => drawnIds.has(e.from) && drawnIds.has(e.to)).map(e => ({ id: e.id, _id: e.id, type: e.type, from: e.from, to: e.to, label: e.label || undefined,
    end: { to: 'open' }, aria: `Line ${e.label ?? e.id}`, ...(view.cut ? { cut: view.cut } : {}),
    ...(bar(e.from) ? { fromSide: 'right' } : {}), ...(bar(e.to) ? { toSide: 'left' } : {}) })); // a bar's long sides (laid out turned when down)
  const g = layoutTyped({ nodes, edges, ...(pic.boxes.length ? { containers: pic.boxes } : {}), direction: down ? 'down' : 'right', gap: 64, rgap: 64, repair: false, reroute: false }, memo);
  return { ...g, order: [...readingOrder(pic), ...g.edges.map(e => e.id)] }; // a new object: what layoutTyped returned is never edited (§2.4)
};
registerDiagramType('test.shapes', {
  title: 'shapes stand-in',
  elements: ['Case', 'Decision', 'Start', 'Fork', 'State'].map(t => ({ type: 'test.' + t, label: t })),
  lines: [{ type: 'test.Flow', label: 'Flow' }],
  layout: shapesGeo,
  boxes: (model, view) => ownersOn(model, view, LOOK).boxes,
});

const N = (id, type, label, more = {}) => ({ id, type: 'test.' + type, label, ...more });
const E = (id, from, to, label) => ({ id, type: 'test.Flow', from, to, ...(label ? { label } : {}) });
// every shape, a diamond with a line on each side and two more, an ellipse with five lines on one side, a bar with three
// in and two out, a circle, and a state with two regions (the box with a member's id) holding two of them
const SHAPES_MODEL = {
  schemaVersion: 2,
  nodes: [N('s', 'Start', ''), N('d', 'Decision', 'Ready?'), N('u', 'Case', 'Check out'), N('v', 'Case', 'Pay'), N('w', 'Case', 'Ship'), N('x', 'Case', 'Wrap'), N('y', 'Case', 'Mail'),
    N('f', 'Fork', ''), N('z', 'Case', 'Done'), N('j', 'Case', 'Log'),
    N('S', 'State', 'Busy', { members: [{ id: 'S.r1', type: 'test.Region', label: 'left' }, { id: 'S.r2', type: 'test.Region', label: 'right' }] }),
    N('p', 'Case', 'Pick', { parent: 'S.r1' }), N('q', 'Case', 'Pack', { parent: 'S.r2' })],
  edges: [E('e1', 's', 'd'), E('e2', 'd', 'u', 'yes'), E('e3', 'd', 'v', 'no'), E('e4', 'd', 'w'), E('e5', 'x', 'd'), E('e6', 'y', 'd'),
    E('e7', 'u', 'f'), E('e8', 'v', 'f'), E('e9', 'w', 'f'), E('e10', 'f', 'z'), E('e11', 'f', 'j'),
    E('e12', 'x', 'u'), E('e13', 'y', 'u'), E('e14', 'z', 'u'), E('e15', 'j', 'u'), E('e16', 'p', 'q'), E('e17', 'z', 'p')],
  views: [{ id: 'all', diagram: 'test.shapes', nodeIds: ['s', 'd', 'u', 'v', 'w', 'x', 'y', 'f', 'z', 'j', 'S', 'p', 'q'] }],
};
const viewOf = (m, more) => ({ ...m, views: [{ ...m.views[0], ...more }] });
// each line's drawn path's two ends, from the markup: the first and last points of its .edge path
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
const unid = s => s.replace(/\bg\d+-/g, 'g-'); // svgOf numbers each picture's marker ids

test('every line end is on its shape\'s outline within 1 px: ellipse, diamond, 20 px circle, bar and a box, laid out right and down', () => {
  for (const direction of ['right', 'down']) {
    const { g, markup } = mapContext(viewOf(SHAPES_MODEL, { direction })).buildView('all'), L = ends(markup);
    assert.equal(L.length, g.edges.length, 'every line drawn');
    L.forEach(({ from, to, i, a, b }) => [[from, a, 'from'], [to, b, 'to']].forEach(([id, p, end]) => {
      const n = g.byId[id] || (g.families || []).find(f => f.id === id), off = offOutline(n, p);
      assert.ok(off <= 1, `${direction}: line ${g.edges[i].id}'s ${end} end (${p}) is ${off.toFixed(2)} px off ${id}'s outline (${n.shape})`); }));
    // the slide moved ends that the box alone would leave in the air: on a side's middle of a circle it is 0, elsewhere not
    const moved = L.filter(({ i, a, b }) => String(a) !== String(g.edges[i].pts[0]) || String(b) !== String(g.edges[i].pts.at(-1)));
    assert.ok(moved.length >= 5, `${direction}: ${moved.length} lines slid onto outlines`);
    // an arrowhead's tip is the slid end: the marker sits on the drawn path, which ends on the outline
    assert.match(markup, /marker-end="url\(#g\d+-open-d\)"/);
  }
});

test('the slide works on a copy: a view drawn twice from one memo draws the same markup, and the memo\'s points are the router\'s', () => {
  const memos = {}, m = SHAPES_MODEL;
  mapContext(m, { memos }).buildGeo('all'); const pts = JSON.stringify(memos.all.g.edges.map(e => e.pts)); // as routed, before any drawing
  const first = mapContext(m, { memos }).buildView('all'), second = mapContext(m, { memos }).buildView('all');
  assert.equal(memos.all.runs, 1, 'laid out once');
  assert.equal(second.g.edges[0].pts, first.g.edges[0].pts, 'the second picture is drawn from the memo\'s geometry');
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos.all.g.edges.map(e => e.pts)), pts, 'no point of the memo moved');
});

test('a typed line with no inset at either end is drawn from the router\'s own points (a classifier keeps its box end)', () => {
  const m = { schemaVersion: 2, nodes: [N('a', 'Thing', 'A'), N('b', 'Thing', 'B')], edges: [E('e', 'a', 'b')], views: [{ id: 'all', diagram: 'test.shapes', nodeIds: ['a', 'b'] }] };
  const { g, markup } = mapContext(m).buildView('all'), [l] = ends(markup);
  assert.deepEqual([l.a, l.b], [g.edges[0].pts[0], g.edges[0].pts.at(-1)]);
});

test('ownersOn\'s look: box types, names unqualified, a state\'s regions as boxes when it has two in the model, shape and word', () => {
  const pic = ownersOn(SHAPES_MODEL, SHAPES_MODEL.views[0], LOOK);
  assert.deepEqual(pic.boxes.map(b => [b.id, b.parent ?? null, b.nodeIds, b.shape]), [['S', null, [], 'package'], ['S.r1', 'S', ['p'], 'package'], ['S.r2', 'S', ['q'], 'package']]);
  assert.equal(pic.boxes[1].aria, 'Region left, holding 1 element');
  assert.equal(pic.boxes[0].aria, 'State Busy, holding 2 elements');
  assert.deepEqual(pic.ids.includes('S.r1'), false, 'a region is no node of the picture');
  assert.equal(pic.owner('p'), 'S.r1'); assert.equal(pic.owner('S.r2'), 'S');
  assert.deepEqual(readingOrder(pic).slice(-5), ['S', 'S.r1', 'p', 'S.r2', 'q'], 'regions in members order');
  // with only one region holding something shown, that region is still a box: the state has two in the model (§6.1, 2)
  const one = ownersOn(SHAPES_MODEL, { ...SHAPES_MODEL.views[0], nodeIds: ['S', 'p'] }, LOOK);
  assert.deepEqual(one.boxes.map(b => [b.id, b.nodeIds]), [['S', []], ['S.r1', ['p']]]);
  // the state not shown: its regions are no boxes either
  assert.deepEqual(ownersOn(SHAPES_MODEL, { ...SHAPES_MODEL.views[0], nodeIds: ['p', 'q'] }, LOOK).boxes, []);
  // names: qualified by default (stage 2), not with qualify false
  const pk = { nodes: [N('P', 'Pkg', 'Shop'), N('c', 'Case', 'Cart', { parent: 'P' })], views: [{ id: 'v', nodeIds: ['c'] }] };
  assert.equal(ownersOn(pk, pk.views[0], { boxTypes: ['test.Pkg'] }).name('c'), 'Shop::Cart');
  assert.equal(ownersOn(pk, pk.views[0], { boxTypes: ['test.Pkg'], qualify: false }).name('c'), 'Cart');
  // with no look, a member is not indexed: the chain stops at it, as before
  assert.deepEqual(ownersOn(SHAPES_MODEL, SHAPES_MODEL.views[0]).boxes, []);
});

test('a box whose id is a member\'s is placed by blockPos and holds exactly its own (notes/stage-4.md §6.3)', () => {
  for (const direction of ['right', 'down']) {
    const g = mapContext(viewOf(SHAPES_MODEL, { direction })).buildGeo('all'), box = id => g.families.find(f => f.id === id);
    const inside = (n, f) => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
    assert.ok(box('S.r1') && box('S.r2') && box('S'), 'the state and both regions are boxes');
    assert.ok(inside(g.byId.p, box('S.r1')) && inside(g.byId.q, box('S.r2')) && !inside(g.byId.p, box('S.r2')), `${direction}: each region holds its own`);
    assert.ok(inside(box('S.r1'), box('S')) && inside(box('S.r2'), box('S')), `${direction}: the regions in their state`);
    g.nodes.filter(n => !['p', 'q'].includes(n.id)).forEach(n => assert.ok(!inside(n, box('S')), `${n.id} is not in the state`));
  }
  // a reparent to a member applies (apply()'s reparent takes a member as the parent), and the picture follows
  const m = apply(SHAPES_MODEL, [{ op: 'reparent', id: 'q', parent: 'S.r1' }]), g = mapContext(m).buildGeo('all');
  assert.deepEqual(g.families.map(f => f.id).sort(), ['S', 'S.r1'], 'one region holds both now: its box, the empty one not drawn');
});

test('a typed line\'s cut: its label is cut at that width, not 150 px; a change of it lays the view out again (notes/stage-4.md S7)', () => {
  const label = 'capture failed [attempts < 3] / count the attempt, then wait for the next payment provider callback';
  const m = { schemaVersion: 2, nodes: [N('a', 'Thing', 'A'), N('b', 'Thing', 'B')], edges: [E('e', 'a', 'b', label)], views: [{ id: 'all', diagram: 'test.shapes', nodeIds: ['a', 'b'] }] };
  const memos = {}, wide = v => mapContext(viewOf(m, v), { memos }).buildGeo('all').edges[0].lbl;
  const at150 = wide({}), at280 = wide({ cut: 280 });
  assert.equal(memos.all.runs, 2, 'cut is in the geometry key');
  assert.ok(at150.w <= 150 + 12 && at280.w > 150 + 12 && at280.w <= 280 + 12, `${at150.w} then ${at280.w}`);
  assert.ok(at280.text.length > at150.text.length && at280.text.endsWith('…'), `${at150.text} then ${at280.text}`);
});

// ---- §17's spike: 50 nodes and 60 lines with four lanes (simulated: each lane a run of rows, as laneRows will give), and
// 50 states and 60 transitions with composites three deep, two regions at each level; repair: false, reroute: false. A
// full layout, then the common edit (a label; a lane change) laid out and drawn, best of three in this process's CPU time
const spikeLanes = () => {
  const lane = i => i % 4, nodes = Array.from({ length: 50 }, (_, i) => N('n' + i, ['Case', 'Decision', 'Start', 'Fork', 'Thing'][i % 5], i % 5 === 2 || i % 5 === 3 ? '' : 'Step ' + i, { props: { lane: lane(i) } }));
  const edges = Array.from({ length: 60 }, (_, k) => k < 49 ? E('l' + k, 'n' + k, 'n' + (k + 1), k % 3 ? '' : 'guard ' + k) : E('l' + k, 'n' + (k - 49) * 4, 'n' + ((k - 49) * 4 + 7), '[else]'));
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'test.lanes', nodeIds: nodes.map(n => n.id), cut: 280 }] };
};
// lanes simulated: within each column, the nodes keep their ranked order, sorted by lane; lane k takes the rows its
// busiest column needs, and the lanes follow each other
registerDiagramType('test.lanes', { elements: [{ type: 'test.Case', label: 'Case' }], lines: [{ type: 'test.Flow', label: 'Flow' }],
  layout: ({ model, view, pos, memo }) => {
    const laneOf = id => model.nodes.find(n => n.id === id).props.lane, cols = {};
    view.nodeIds.forEach(id => { const [c, r] = pos[id] || [0, 0]; (cols[c] ||= []).push([id, r]); });
    const rows = [0, 1, 2, 3].map(k => Math.max(1, ...Object.values(cols).map(l => l.filter(([id]) => laneOf(id) === k).length))), start = rows.map((_, k) => rows.slice(0, k).reduce((a, b) => a + b, 0));
    const P = {}; Object.entries(cols).forEach(([c, l]) => [0, 1, 2, 3].forEach(k => l.filter(([id]) => laneOf(id) === k).sort((a, b) => a[1] - b[1]).forEach(([id], j) => { P[id] = [+c, start[k] + j]; })));
    return shapesGeo({ model, view, pos: P, memo }); } });
// wired: as a state machine is drawn, each region's states in a chain and back, a nested composite entered from its
// region's state, and 16 transitions across composites' borders (out of a substate to the top, into one from the top);
// scattered: the same states with 60 transitions between states taken 7 apart, most of them across regions (region-cross
// warns of each), the worst case for the router, which routes every line across each border it meets
const spikeStates = (scattered = false) => {
  const nodes = [], regions = [], st = (id, label, parent, more = {}) => { nodes.push(N(id, 'State', label, { ...(parent ? { parent } : {}), ...more })); return id; };
  // composites: S (two regions), each region holding a composite with two regions, each of those one with two: 7 composites, 14 regions
  const comp = (id, parent, depth) => { const rs = ['a', 'b'].map(k => ({ id: `${id}.${k}`, type: 'test.Region', label: k }));
    st(id, 'Composite ' + id, parent, { members: rs }); regions.push(...rs.map(r => r.id)); if (depth < 3) rs.forEach(r => comp(`${r.id}c`, r.id, depth + 1)); };
  comp('S', null, 1);
  // 43 simple states: four in each of the 8 innermost regions, one in each of the other 6, the rest at the top
  const leafs = regions.filter(r => r.split('.').length === 4), mids = regions.filter(r => !leafs.includes(r));
  let k = 0; leafs.forEach(r => { for (let i = 0; i < 4; i++) st('s' + k++, 'State ' + k, r); }); mids.forEach(r => { for (let i = 0; i < 1; i++) st('s' + k++, 'State ' + k, r); });
  while (nodes.length < 50) st('s' + k++, 'State ' + k, null);
  const simple = nodes.filter(n => !n.members).map(n => n.id), edges = [];
  const line = (a, b) => edges.push(E('t' + edges.length, a, b, edges.length % 2 ? 'evt [x > 0] / act' : ''));
  if (scattered) for (let i = 0; edges.length < 60; i++) { const a = simple[i % simple.length], b = simple[(i * 7 + 3) % simple.length]; if (a !== b) line(a, b); }
  else {
    const inR = r => simple.filter(id => nodes.find(n => n.id === id).parent === r), top = inR(undefined);
    leafs.forEach(r => { const l = inR(r); l.slice(1).forEach((b, i) => line(l[i], b)); line(l.at(-1), l[0]); });
    mids.forEach(r => line(inR(r)[0], inR(r + 'c.a')[0] || inR(r + 'c.a.ac.a')[0] || inR(r)[0]));
    top.slice(1).forEach((b, i) => line(top[i], b));
    leafs.forEach((r, i) => { line(inR(r).at(-1), top[i % top.length]); line(top[(i + 1) % top.length], inR(r)[1]); });
    while (edges.length < 60) line(top[edges.length % top.length], inR(leafs[edges.length % 8])[2]);
  }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'test.shapes', nodeIds: nodes.map(n => n.id), cut: 280 }] };
};
const timed = f => { const c = process.cpuUsage(), t = performance.now(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000, performance.now() - t]; };
function spike(M, edits) {
  const runs = [];
  for (let i = 0; i < 3; i++) { // the first run is cold (the JIT warms up on it)
    const memos = {}, r = {};
    [, r.full, r.fullWall] = timed(() => mapContext(M, { memos }).buildView('all').markup);
    for (const [k, c] of Object.entries(edits)) { const m = apply(M, c), was = memos.all.runs; let out;
      [out, r[k], r[k + 'Wall']] = timed(() => mapContext(m, { memos }).buildView('all').markup);
      assert.equal(memos.all.runs, was + 1, `${k} lays the view out again`); assert.match(out, /^<svg /); }
    runs.push(r);
  }
  return { best: k => Math.min(...runs.map(r => r[k])), ms: k => runs.map(r => Math.round(r[k])).join(', ') };
}
test('§17\'s spike: the common edit on 50 nodes in four lanes and on 50 states three composites deep, repair and reroute off (timed)', () => {
  const L = spikeLanes(), S = spikeStates();
  assert.equal(S.nodes.length, 50); assert.equal(S.edges.length, 60);
  assert.equal(ownersOn(S, S.views[0], LOOK).boxes.length, 21, '7 composite states and 14 regions are boxes');
  const lanes = spike(L, { label: [{ op: 'set', id: 'l3', path: 'label', value: 'all books in stock [yes]' }], lane: [{ op: 'set', id: 'n10', path: 'props.lane', value: 3 }] });
  const edit = { label: [{ op: 'set', id: 't1', path: 'label', value: 'capture failed [attempts < 3] / count the attempt' }] }, states = spike(S, edit), worst = spike(spikeStates(true), edit);
  console.log(`# §17 spike, CPU (wall) ms, three runs: lanes, 50 nodes / 60 lines: full ${lanes.ms('full')} (${lanes.ms('fullWall')}); a label ${lanes.ms('label')} (${lanes.ms('labelWall')}); a lane change ${lanes.ms('lane')} (${lanes.ms('laneWall')})`);
  [['wired', states], ['scattered', worst]].forEach(([k, r]) => console.log(`# §17 spike, CPU (wall) ms, three runs: composites three deep, 50 states / 60 transitions ${k}: full ${r.ms('full')} (${r.ms('fullWall')}); a label ${r.ms('label')} (${r.ms('labelWall')})`));
  assert.ok(lanes.best('full') < 1000 && states.best('full') < 1000, 'a full layout under 1 s');
});
