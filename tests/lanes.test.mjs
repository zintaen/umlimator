// Lanes (work package 4.3, notes/stage-4.md §5.2): laneRows on hand-built positions, and laneBands on the geometry
// layoutTyped gives those rows, laid out right and down
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LN, laneOrder, laneRows, laneBands } from '../src/layout/lanes.js';
import { layoutTyped } from '../src/typed/layout.js';

// lanes: shop, then warehouse holding pick and pack (nested), then an empty lane, then mail; `order` puts mail last
const LANES = [{ id: 'mail', parent: null, order: 9 }, { id: 'shop', parent: null, order: 0 }, { id: 'warehouse', parent: null, order: 1 },
  { id: 'pick', parent: 'warehouse', order: 0 }, { id: 'pack', parent: 'warehouse', order: 1 }, { id: 'empty', parent: null, order: 2 }];
const IN = { start: 'shop', order: 'shop', pay: 'shop', stock: 'warehouse', take: 'pick', take2: 'pick', box: 'pack', label: 'pack', post: 'mail', done: 'mail', note: null };
const laneOf = id => IN[id] ?? null;
// as ranked: mixed up across lanes; `pin` rows (99, -5) as a pin gives them
const POS = { start: [0, 0], order: [1, 2], pay: [2, 1], stock: [1, 0], take: [2, 0], take2: [2, 3], box: [3, 0], label: [3, 99], post: [4, 0], done: [4, -5], note: [0, 1] };
const EDGES = [['start', 'order'], ['order', 'stock'], ['stock', 'take'], ['stock', 'take2'], ['order', 'pay'], ['take', 'box'], ['take2', 'label'], ['box', 'post'], ['label', 'post'], ['post', 'done']]
  .map(([from, to], i) => ({ id: 'e' + i, from, to }));
const within = (a, b) => a.x >= b.x - .5 && a.y >= b.y - .5 && a.x + a.w <= b.x + b.w + .5 && a.y + a.h <= b.y + b.h + .5;
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const rowsOf = (pos, lane) => Object.keys(pos).filter(id => laneOf(id) === lane).map(id => pos[id][1]);
const under = (lane, top) => { for (let l = lane; l; l = (LANES.find(x => x.id === l) || {}).parent) if (l === top) return true; return false; };

test('lanes come depth first, siblings by order; a lane whose parent is no lane, or on a cycle, is at the top', () => {
  assert.deepEqual(laneOrder(LANES).map(l => [l.id, l.depth]), [['shop', 0], ['warehouse', 0], ['pick', 1], ['pack', 1], ['empty', 0], ['mail', 0]]);
  assert.deepEqual(laneOrder([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }, { id: 'c', parent: 'gone' }, { id: 'd', parent: 'd' }]).map(l => [l.id, l.parent, l.depth]),
    [['c', null, 0], ['d', null, 0], ['a', null, 0], ['b', 'a', 1]]);
  assert.deepEqual(laneOrder(null), []);
});

test('laneRows: each lane a run of rows in order, nested lanes inside their parents, none shared; a node in no lane after them', () => {
  const was = JSON.stringify(POS), pos = laneRows(POS, laneOf, LANES);
  assert.equal(JSON.stringify(POS), was, 'the input is not written');
  Object.keys(POS).forEach(id => assert.equal(pos[id][0], POS[id][0], `${id} keeps its column`));
  assert.ok(Object.values(pos).every(([, r]) => Number.isInteger(r) && r >= 0));
  // the runs, in rows: shop 1 (one node a column), warehouse's own 1, pick 2, pack 2, the empty lane 1, mail 2, then no lane
  const runs = {}; laneOrder(LANES).forEach(l => { const rs = Object.keys(pos).filter(id => under(laneOf(id), l.id)).map(id => pos[id][1]); runs[l.id] = rs.length ? [Math.min(...rs), Math.max(...rs)] : null; });
  assert.deepEqual(runs, { shop: [0, 0], warehouse: [1, 5], pick: [2, 3], pack: [4, 5], empty: null, mail: [7, 8] }); // row 6: the empty lane's
  // no two lanes share a row; each lane's run follows the one before
  const own = ['shop', 'warehouse', 'pick', 'pack', 'mail'].map(l => rowsOf(pos, l));
  own.forEach((a, i) => own.slice(i + 1).forEach(b => assert.ok(Math.max(...a) < Math.min(...b))));
  // nested lanes inside their parent's rows
  assert.ok(runs.pick[0] >= runs.warehouse[0] && runs.pack[1] <= runs.warehouse[1]);
  // a node in no lane: after every lane
  assert.deepEqual(pos.note, [0, 9]);
  // pins: label's 99 and done's -5 are orders inside their lanes, not rows that leave them
  assert.deepEqual([pos.box, pos.label], [[3, 4], [3, 5]]);
  assert.deepEqual([pos.done, pos.post], [[4, 7], [4, 8]]);
  // the ranked order inside a lane and a column is kept
  assert.ok(pos.take[1] < pos.take2[1]);
  assert.deepEqual(laneRows({}, laneOf, LANES), {});
  assert.deepEqual(laneRows({ a: [0, 3], b: [0, 1] }, () => null, []), { a: [0, 1], b: [0, 0] }); // no lanes: rows packed in ranked order
});

// the rows laid out as the activity type will (rgap 64, both flags off), and the bands on that geometry
const laid = (direction, memo) => { const pos = laneRows(POS, laneOf, LANES);
  return layoutTyped({ direction, rgap: 64, repair: false, reroute: false, nodes: Object.keys(pos).map(id => ({ id, label: id, col: pos[id][0], row: pos[id][1], w: 96 + id.length * 4, h: 40 })), edges: EDGES }, memo); };
const moved = (g, shift) => g.nodes.map(n => ({ id: n.id, x: n.x + shift.x, y: n.y + shift.y, w: n.w, h: n.h }));

for (const direction of ['right', 'down']) test(`laneBands, laid out ${direction}: each band covers its nodes and its nested bands, and no other lane's`, () => {
  const turned = direction === 'down', g = laid(direction), was = JSON.stringify(g), out = laneBands(g, LANES, laneOf, turned);
  assert.equal(JSON.stringify(g), was, 'the geometry is not written (§2.4)');
  const { bands, shift, bounds } = out, by = Object.fromEntries(bands.map(b => [b.id, b]));
  assert.deepEqual(bands.map(b => [b.id, b.parent, b.depth]), [['shop', null, 0], ['warehouse', null, 0], ['pick', 'warehouse', 1], ['pack', 'warehouse', 1], ['empty', null, 0], ['mail', null, 0]]);
  assert.deepEqual(shift, turned ? { x: 0, y: 2 * LN.head } : { x: 2 * LN.head, y: 0 }); // two levels of headers, at the start of the flow
  const nodes = moved(g, shift);
  nodes.forEach(n => bands.forEach(b => {
    const mine = under(laneOf(n.id), b.id);
    if (mine) assert.ok(within(n, b), `${n.id} inside ${b.id}`); else assert.ok(!meets(n, b), `${n.id} outside ${b.id}`);
    assert.ok(!meets(n, b.head), `${n.id} clear of ${b.id}'s header`);
  }));
  bands.filter(b => b.parent).forEach(b => assert.ok(within(b, by[b.parent]), `${b.id} inside ${b.parent}`));
  bands.forEach((a, i) => bands.slice(i + 1).forEach(b => { if (a.parent === b.parent) assert.ok(!meets(a, b), `${a.id} and ${b.id} apart`); }));
  // siblings meet at one divider: a band's far edge is the next one's near edge
  const [A, S] = turned ? ['x', 'w'] : ['y', 'h'], [L, T] = turned ? ['y', 'h'] : ['x', 'w'];
  [['shop', 'warehouse'], ['pick', 'pack'], ['warehouse', 'empty'], ['empty', 'mail']].forEach(([a, b]) => assert.equal(by[a][A] + by[a][S], by[b][A]));
  // along the flow: every band reaches the diagram's far end; its header is 22 px a level in from the start
  const far = Math.max(...nodes.map(n => n[L] + n[T]));
  bands.forEach(b => { assert.ok(b[L] + b[T] >= far); assert.equal(b[L], bands[0][L] + b.depth * LN.head); assert.equal(b.head[T], LN.head); assert.equal(b.head[S], b[S]); });
  // an empty lane keeps its row, at least 120 px across
  assert.ok(by.empty[S] >= 120, `the empty lane is ${by.empty[S]} px`);
  // the bounds hold the moved geometry and the bands
  [...nodes, ...bands].forEach(r => assert.ok(within(r, bounds)));
});

test('a divider lies 12 px off the gap\'s centre line toward the later lane, an outer edge 12 px inside it', () => {
  const n = (id, row, y) => ({ id, col: 0, row, x: 0, y, w: 100, h: 40 });
  const g = { nodes: [n('a', 0, 0), n('b', 1, 100), n('c', 2, 200)], bounds: { x: -36, y: -36, w: 172, h: 312 } }; // gaps of 60 px
  const { bands } = laneBands(g, [{ id: 'p' }, { id: 'q' }], id => (id === 'a' ? 'p' : 'q'), false);
  assert.deepEqual(bands.map(b => [b.y, b.y + b.h]), [[-30 + 12, 70 + 12], [70 + 12, 270 - 12]]);
  // an empty lane between two: its one row where the gap leaves it; at an end, a row of 64 px a default gap past the last
  const gap = { nodes: [n('a', 0, 0), n('b', 2, 200), n('c', 3, 300)], bounds: { x: -36, y: -36, w: 172, h: 412 } };
  assert.deepEqual(laneBands(gap, [{ id: 'p' }, { id: 'none' }, { id: 'q' }], id => (id === 'a' ? 'p' : 'q'), false).bands.map(b => [b.y, b.y + b.h]),
    [[-18, 82], [82, 182], [182, 358]]);
  const end = laneBands({ nodes: [n('a', 0, 0)], bounds: { x: -36, y: -36, w: 172, h: 112 } }, [{ id: 'p' }, { id: 'none' }], () => 'p', false);
  assert.deepEqual(end.bands.map(b => [b.y, b.y + b.h]), [[-22 + 12, 74], [74, 40 + LN.gap + 64 + LN.gap / 2 - 12]]);
  assert.equal(end.bounds.y + end.bounds.h, 158 + LN.pad);
  assert.deepEqual(laneBands(g, [], laneOf, false), { bands: [], shift: { x: 0, y: 0 }, bounds: g.bounds });
});

test('laid out twice from one memo, the bands are the same and the memo\'s geometry is untouched (§2.4)', () => {
  const memo = {}, g1 = laid('right', memo), a = JSON.stringify(laneBands(g1, LANES, laneOf, false)), key = JSON.stringify(g1);
  const g2 = laid('right', memo); assert.equal(memo.runs, 1); assert.equal(g2, g1);
  assert.equal(JSON.stringify(g2), key); assert.equal(JSON.stringify(laneBands(g2, LANES, laneOf, false)), a);
});

test('200 nodes in 10 lanes: rows and bands in under 5 ms (best of three)', () => {
  const lanes = Array.from({ length: 10 }, (_, k) => ({ id: 'L' + k, parent: k % 3 === 2 ? 'L' + (k - 1) : null })), pos = {}, lane = {};
  for (let i = 0; i < 200; i++) { pos['n' + i] = [i % 20, (i * 7) % 13]; lane['n' + i] = 'L' + (i % 10); }
  const of = id => lane[id];
  let best = Infinity, out;
  for (let k = 0; k < 3; k++) { const t = performance.now(), p = laneRows(pos, of, lanes);
    const g = { nodes: Object.keys(p).map(id => ({ id, col: p[id][0], row: p[id][1], x: p[id][0] * 180, y: p[id][1] * 108, w: 120, h: 64 })), bounds: { x: -36, y: -36, w: 3700, h: 4000 } };
    out = laneBands(g, lanes, of, false); best = Math.min(best, performance.now() - t); }
  assert.equal(out.bands.length, 10);
  assert.ok(best < 5, `${best.toFixed(2)} ms`);
});
