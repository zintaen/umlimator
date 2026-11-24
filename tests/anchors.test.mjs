// Anchors for rowsFor and untangle (docs/diagrams/notes/layout-flow.md section 12 step 5, sections 6.2 and 14): an anchored
// item keeps its row and its place between the two sides of its column, with one anchored row a column or two (the snake's
// two main rows); with no anchor both functions give what they gave before anchors were added. No view passes anchors yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsFor, untangle } from '../src/layout/layered.js';

const hOf = hs => id => (hs && hs[id]) || 1;
const dict = o => Object.assign(Object.create(null), o || {});

// what untangle then rowsFor gave on audit-loop before anchors (a81000a8), recorded with that code
const BEFORE = [
  { cols: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h']], links: [['a', 'f'], ['b', 'e'], ['c', 'd'], ['d', 'h'], ['f', 'g'], ['a', 'h']],
    out: { cols: [['a', 'c', 'b'], ['f', 'd', 'e'], ['g', 'h']], row: { a: 0.5, c: 1.5, b: 2.5, f: 0.5, d: 1.5, e: 2.5, g: 0, h: 1 } } },
  { cols: [['s'], ['x', 'y', 'z'], ['t', 'u'], ['w']], links: [['s', 'x'], ['s', 'z'], ['x', 'u'], ['z', 't'], ['s', 'w'], ['y', 'w'], ['t', 'w']],
    out: { cols: [['s'], ['x', 'z', 'y'], ['u', 't'], ['w']], row: { s: 0.5, x: 0, z: 1, y: 2, u: 0, t: 1, w: 1 } } },
  { cols: [['p', 'q'], ['B', 'r'], ['m', 'n', 'o']], links: [['p', 'r'], ['q', 'B', null, 2], ['B', 'm', 0], ['r', 'o'], ['p', 'n']], hs: { B: 3 },
    out: { cols: [['q', 'p'], ['B', 'r'], ['m', 'n', 'o']], row: { q: 2, p: 3, B: 0, r: 3, m: 0, n: 2.5, o: 3.5 } } },
  { cols: [['k'], ['l', 'm2'], ['F']], links: [['k', 'm2'], ['l', 'F'], ['k', 'F']], fixed: { F: 4 },
    out: { cols: [['k'], ['l', 'm2'], ['F']], row: { k: 1.5, l: 0, m2: 1.5, F: 4 } } },
];
const run = (c, anchor) => { const h = hOf(c.hs), fixed = dict(c.fixed), cols = c.cols.map(x => x.slice());
  if (anchor === undefined) { untangle(cols, c.links, h, fixed); return { cols, row: { ...rowsFor(cols, c.links, h, fixed) } }; }
  untangle(cols, c.links, h, fixed, anchor); return { cols, row: { ...rowsFor(cols, c.links, h, fixed, anchor) } }; };

test('with no anchor, untangle and rowsFor give what they gave before anchors', () => {
  for (const c of BEFORE) {
    assert.deepEqual(run(c), c.out);
    for (const none of [null, {}, dict(), new Map(), { nowhere: 0 }, { a: NaN, s: 'x', p: null }]) assert.deepEqual(run(c, none), c.out, JSON.stringify(none));
  }
});

// a main flow a > b > c > d on row 0, a branch x above b's column and y below c's, a store z under b
const MAIN = { cols: [['a'], ['x', 'b', 'z'], ['c', 'y'], ['d']], links: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'x'], ['x', 'c'], ['b', 'y'], ['y', 'd'], ['a', 'z']] };
const ROW0 = { a: 0, b: 0, c: 0, d: 0 };
const ordered = (cols, row, h = () => 1) => cols.every(c => c.every((id, i) => !i || row[id] >= row[c[i - 1]] + h(c[i - 1])));

test('rowsFor never moves an anchor and keeps each column in order, above the anchor below its row and under it past it', () => {
  const cols = MAIN.cols.map(c => c.slice()), row = rowsFor(cols, MAIN.links, undefined, undefined, ROW0);
  for (const id in ROW0) assert.equal(row[id], 0, id);
  assert.ok(ordered(cols, row), JSON.stringify(row));
  assert.ok(row.x <= -1 && row.z >= 1 && row.y >= 1, JSON.stringify(row));
  // lines that pull an anchor elsewhere move it no more: d's only line in comes from a card at row 6
  const far = rowsFor([['a', 'q'], ['d']], [['q', 'd']], undefined, { q: 6 }, { d: 0 });
  assert.equal(far.d, 0); assert.ok(far.a < far.q);
  // a Map works as an object does, and a box's height counts: x, 3 rows tall, ends at the anchor's row
  const hs = hOf({ x: 3 }), r2 = rowsFor(MAIN.cols.map(c => c.slice()), MAIN.links, hs, undefined, new Map(Object.entries(ROW0)));
  for (const id in ROW0) assert.equal(r2[id], 0, id);
  assert.ok(r2.x + 3 <= 0, String(r2.x));
});

test('rowsFor with two anchored rows a column (the snake) fits each side into its own room and moves neither', () => {
  const cols = [['s', 't', 'u'], ['p', 'A', 'q', 'B', 'r'], ['v', 'w']];
  const links = [['s', 'p'], ['t', 'q'], ['u', 'r'], ['p', 'v'], ['q', 'w'], ['A', 'v'], ['B', 'w']];
  const anchor = { A: 0, B: 4 }, row = rowsFor(cols, links, undefined, { u: 20, t: -9 }, anchor); // t and u pull q and r far off
  assert.equal(row.A, 0); assert.equal(row.B, 4);
  assert.ok(row.p <= -1, 'p above A'); assert.ok(row.q >= 1 && row.q <= 3, 'q between A and B: ' + row.q); assert.ok(row.r >= 5, 'r under B');
  assert.ok(ordered(cols, row), JSON.stringify(row));
  // the middle side's room with tall items: two items of two rows between rows 0 and 6 sit at 1 and 3
  const r2 = rowsFor([['A', 'm', 'n', 'B']], [], hOf({ m: 2, n: 2 }), undefined, { A: 0, B: 5 });
  assert.deepEqual([r2.A, r2.m, r2.n, r2.B], [0, 1, 3, 5]);
});

test('untangle with an anchored item keeps it between the two sides and orders each side on its own', () => {
  // without the anchor, x and y swap across m to undo the crossing of s1 > y and s2 > x
  const links = [['s1', 'y'], ['s2', 'x'], ['m0', 'm']], free = [['s1', 'm0', 's2'], ['x', 'm', 'y']];
  untangle(free, links); assert.ok(free[1].indexOf('y') < free[1].indexOf('x'), 'the free order swaps: ' + free[1]);
  const cols = [['s1', 'm0', 's2'], ['x', 'm', 'y']]; untangle(cols, links, undefined, undefined, { m0: 0, m: 0 });
  assert.deepEqual(cols[1], ['x', 'm', 'y']); assert.deepEqual(cols[0], ['s1', 'm0', 's2']);
  // each side is still ordered to cut crossings: x1 and x2 above m swap
  const two = [['s1', 's2', 'm0'], ['x1', 'x2', 'm']]; untangle(two, [['s1', 'x2'], ['s2', 'x1'], ['m0', 'm']], undefined, undefined, { m0: 0, m: 0 });
  assert.deepEqual(two[1], ['x2', 'x1', 'm']);
  // two anchors in a column (the snake): three sides, each kept, though the lines would swap p and r across both rows
  const snake = [['a', 'b', 'c'], ['p', 'A', 'q', 'B', 'r']]; untangle(snake, [['a', 'r'], ['c', 'p'], ['b', 'q']], undefined, undefined, { A: 0, B: 4 });
  assert.deepEqual(snake[1], ['p', 'A', 'q', 'B', 'r']);
  // anchors given out of row order go in row order, and a free item keeps as many anchors before it as it had
  const back = [['a'], ['B', 'p', 'A', 'q']]; untangle(back, [['a', 'q']], undefined, undefined, { A: 0, B: 4 });
  assert.deepEqual(back[1], ['A', 'p', 'B', 'q']);
});

test('a line past an anchored column leaves no point behind and the anchor keeps its place', () => {
  const cols = [['a', 'm0'], ['m1', 'x'], ['b', 'm2']];
  untangle(cols, [['a', 'b'], ['m0', 'm1'], ['m1', 'm2'], ['a', 'x']], undefined, undefined, { m0: 0, m1: 0, m2: 0 });
  assert.deepEqual(cols.map(c => c.slice().sort()), [['a', 'm0'], ['m1', 'x'], ['b', 'm2']]);
  assert.ok(cols[1].indexOf('m1') < cols[1].indexOf('x'), 'x stays under m1');
});

// a small seeded generator: random columns, lines forward, anchors on some cards, sides as given
const rng = seed => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
test('on random views anchors never move, sides hold and columns stay in order', () => {
  for (let s = 1; s <= 60; s++) {
    const R = rng(s), n = 3 + Math.floor(R() * 5), cols = [], anchor = Object.create(null), rows = [0, 4];
    for (let k = 0; k < n; k++) { const m = 1 + Math.floor(R() * 5), c = []; for (let i = 0; i < m; i++) c.push(k + '.' + i); cols.push(c);
      const nA = Math.floor(R() * 3), picked = new Set([...c].sort(() => R() - .5).slice(0, nA)), first = nA === 1 ? rows[Math.floor(R() * 2)] : 0;
      c.filter(id => picked.has(id)).forEach((id, j) => { anchor[id] = first + rows[1] * j; }); } // a column's anchors in row order, one a row
    const links = []; for (let i = 0; i < n * 3; i++) { const ka = Math.floor(R() * (n - 1)), kb = ka + 1 + Math.floor(R() * (n - 1 - ka)); links.push([cols[ka][Math.floor(R() * cols[ka].length)], cols[kb][Math.floor(R() * cols[kb].length)]]); }
    const before = cols.map(c => { const as = c.filter(id => id in anchor); return c.filter(id => !(id in anchor)).map(id => [id, as.filter(a => c.indexOf(a) < c.indexOf(id)).map(a => anchor[a]).join()]); });
    untangle(cols, links, undefined, undefined, anchor);
    cols.forEach((c, k) => { const as = c.filter(id => id in anchor); assert.deepEqual(as.map(a => anchor[a]), as.map(a => anchor[a]).slice().sort((x, y) => x - y), 'anchors in row order, seed ' + s);
      for (const [id, was] of before[k]) assert.equal(as.filter(a => c.indexOf(a) < c.indexOf(id)).map(a => anchor[a]).join(), was, 'side of ' + id + ', seed ' + s); });
    const row = rowsFor(cols, links, undefined, undefined, anchor);
    for (const id in anchor) assert.equal(row[id], anchor[id], 'anchor ' + id + ', seed ' + s);
    // in order, wherever a side has the room (between rows 0 and 4 there are three)
    cols.forEach(c => { const as = c.filter(id => id in anchor); if (as.length < 2 || c.indexOf(as[1]) - c.indexOf(as[0]) <= 4)
      assert.ok(c.every((id, i) => !i || row[id] >= row[c[i - 1]] + 1), 'order in ' + c.join() + ' ' + c.map(id => row[id]).join() + ', seed ' + s); });
  }
});
