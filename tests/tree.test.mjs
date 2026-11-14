// The tree strategy (work package 4a.1, notes/milestone-4a.md §6): layoutTree alone, on hand-built inputs (sizes as the
// mindmap type would measure them). The mindmap type (4a.4) and its page draw what it returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TREE, layoutTree } from '../src/layout/tree.js';

// a topic: [id, parent, w, h, side]
const tp = (id, parent, w = 80, h = 24, side) => ({ id, parent, w, h, ...(side ? { side } : {}) });
const meets = (a, b) => a.x < b.x + b.w - .02 && b.x < a.x + a.w - .02 && a.y < b.y + b.h - .02 && b.y < a.y + a.h - .02;
const mid = n => n.y + n.h / 2;

// §6.3 worked out again, recursively (small inputs only): each topic's band and the order of its children
function bands(inp) {
  const gy = (inp.gap || {}).y ?? TREE.y, kids = new Map(), band = new Map();
  inp.topics.forEach(t => { if (t.id !== inp.root) kids.set(t.parent, [...(kids.get(t.parent) || []), t]); });
  const b = t => { const k = kids.get(t.id) || []; const s = k.reduce((s, c, i) => s + b(c) + (i ? gy : 0), 0); band.set(t.id, Math.max(t.h, s)); return band.get(t.id); };
  b(inp.topics.find(t => t.id === inp.root));
  return { band, kids };
}

// what every layout keeps (§6): no two nodes overlap; each child on its side, gap.x out from its parent's edge, in order
// down its parent's band; a parent centred on its children's bands; links from edge to edge; the bounds hold every node
function clean(o, inp) {
  const bad = [], gx = (inp.gap || {}).x ?? TREE.x, gy = (inp.gap || {}).y ?? TREE.y, at = new Map(o.nodes.map(n => [n.id, n]));
  o.nodes.forEach((a, i) => o.nodes.slice(0, i).forEach(b => { if (meets(a, b)) bad.push(`${a.id} meets ${b.id}`); }));
  const B = o.bounds;
  o.nodes.forEach(n => { if (n.x < B.x - .02 || n.y < B.y - .02 || n.x + n.w > B.x + B.w + .02 || n.y + n.h > B.y + B.h + .02) bad.push(`${n.id} out of the bounds`); });
  const { band } = bands(inp), kids = new Map();
  o.links.forEach(l => { const p = at.get(l.from), c = at.get(l.to), L = c.side === 'left';
    kids.set(p.id, [...(kids.get(p.id) || []), c]);
    if (Math.abs(L ? p.x - gx - c.w - c.x : p.x + p.w + gx - c.x) > .02) bad.push(`${c.id} not ${gx} px out from ${p.id}`);
    if (p.depth && c.side !== p.side) bad.push(`${c.id} not on its parent's side`);
    if (l.p1[0] !== (L ? p.x : p.x + p.w) || Math.abs(l.p1[1] - mid(p)) > .02 || l.p2[0] !== (L ? c.x + c.w : c.x) || Math.abs(l.p2[1] - mid(c)) > .02) bad.push(`link ${l.to} not edge to edge`); });
  kids.forEach((cs, pid) => { const p = at.get(pid);
    for (const side of ['right', 'left']) { const s = cs.filter(c => c.side === side); if (!s.length) continue;
      // bands stacked gap.y apart, in order, centred on the parent's middle: the first band's top, the last's bottom
      const top = mid(s[0]) - band.get(s[0].id) / 2, bottom = mid(s.at(-1)) + band.get(s.at(-1).id) / 2;
      if (Math.abs((top + bottom) / 2 - mid(p)) > .02) bad.push(`${pid} not centred on its ${side} children`);
      s.slice(1).forEach((c, i) => { const d = (mid(c) - band.get(c.id) / 2) - (mid(s[i]) + band.get(s[i].id) / 2); if (Math.abs(d - gy) > .02) bad.push(`${c.id} not ${gy} px below ${s[i].id}'s band`); }); } });
  return bad;
}

const TABLE = {
  'one topic': { root: 'r', topics: [tp('r', null, 120, 40)] },
  'a star of six': { root: 'r', topics: [tp('r', null, 120, 40), ...'abcdef'.split('').map(c => tp(c, 'r'))] },
  'a wide branch beside a deep one': { root: 'r', topics: [tp('r', null), tp('a', 'r'), ...Array.from({ length: 30 }, (_, i) => tp(`a${i}`, 'a', 40 + i * 5)),
    tp('b', 'r'), tp('b1', 'b'), tp('b2', 'b1'), tp('b3', 'b2'), tp('b4', 'b3')] },
  'every branch on one side': { root: 'r', topics: [tp('r', null), ...'abcd'.split('').flatMap(c => [tp(c, 'r', 80, 24, 'left'), tp(`${c}1`, c), tp(`${c}2`, c)])] },
  'a parent taller than its children': { root: 'r', topics: [tp('r', null), tp('a', 'r', 200, 120), tp('a1', 'a', 40, 12), tp('a2', 'a', 40, 12), tp('b', 'r', 60, 16)] },
  'sizes that vary at each depth': { root: 'r', topics: [tp('r', null, 50, 60), ...Array.from({ length: 40 }, (_, i) => tp(`t${i}`, i < 6 ? 'r' : `t${(i * 7) % i}`, 30 + (i * 37) % 170, 20 + (i * 13) % 60))] },
  'gaps of zero': { root: 'r', gap: { x: 0, y: 0 }, topics: [tp('r', null), tp('a', 'r'), tp('b', 'r'), tp('c', 'r'), tp('a1', 'a'), tp('a2', 'a')] },
  'wide gaps': { root: 'r', gap: { x: 120, y: 40 }, topics: [tp('r', null), tp('a', 'r'), tp('b', 'r'), tp('a1', 'a'), tp('b1', 'b'), tp('b2', 'b')] },
};

for (const [name, inp] of Object.entries(TABLE)) {
  test(`${name}: no overlap, children in order on their side, parents centred, bounds hold every node`, () => {
    const o = layoutTree(inp);
    assert.equal(o.nodes.length, inp.topics.length);
    assert.deepEqual(o.problems, []);
    assert.deepEqual(clean(o, inp), []);
  });
}

test('the root at (0, 0), side and branch null, depth 0; depth and branch down the tree', () => {
  const o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r'), tp('a1', 'a'), tp('a11', 'a1'), tp('b', 'r')] }), n = id => o.nodes.find(x => x.id === id);
  assert.deepEqual(n('r'), { id: 'r', x: 0, y: 0, w: 80, h: 24, side: null, depth: 0, branch: null });
  assert.deepEqual(['a', 'a1', 'a11', 'b'].map(id => [n(id).depth, n(id).branch]), [[1, 'a'], [2, 'a'], [3, 'a'], [1, 'b']]);
  assert.deepEqual(o.nodes.map(x => x.id), ['r', 'a', 'a1', 'a11', 'b'], 'pre-order');
  assert.equal(n('a').x, 80 + TREE.x); assert.equal(n('b').x, -TREE.x - 80);
});

test('children keep their order down the band, so links from one parent never cross', () => {
  const inp = TABLE['a wide branch beside a deep one'], o = layoutTree(inp);
  const ys = o.links.filter(l => l.from === 'a').map(l => l.p2[1]);
  assert.deepEqual(o.links.filter(l => l.from === 'a').map(l => l.to), Array.from({ length: 30 }, (_, i) => `a${i}`));
  ys.slice(1).forEach((y, i) => assert.ok(y > ys[i]));
});

test('sides (§6.4): given where given, the rest to the shorter side so far in px, right on a tie; deeper topics follow their branch', () => {
  // a 24 px tall on the right; b to the left (0 < 24); c to the right? left 24 = right 24: a tie, right; d: left
  let o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r'), tp('b', 'r'), tp('c', 'r'), tp('d', 'r')] });
  assert.deepEqual(o.nodes.filter(n => n.depth === 1).map(n => n.side), ['right', 'left', 'right', 'left']);
  // by px, not by count: a tall a on the right takes b, c and d left until the left is as tall
  o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r', 80, 100), tp('b', 'r'), tp('c', 'r'), tp('d', 'r'), tp('e', 'r')] });
  assert.deepEqual(o.nodes.filter(n => n.depth === 1).map(n => n.side), ['right', 'left', 'left', 'left', 'left']);
  // gaps count: 24 + 12 + 24 on the left is 60, over the right's 50, so e goes right
  o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r', 80, 50), tp('b', 'r'), tp('c', 'r'), tp('e', 'r')] });
  assert.deepEqual(o.nodes.filter(n => n.depth === 1).map(n => n.side), ['right', 'left', 'left', 'right']);
  // a given side counts where it comes; a side on a second-level topic, or not left or right, is not read
  // (a left; b right, the shorter; c, 'up', on a tie right; d left)
  o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r', 80, 24, 'left'), tp('b', 'r'), tp('c', 'r', 80, 24, 'up'), tp('d', 'r'), tp('a1', 'a', 80, 24, 'right')] });
  assert.deepEqual(o.nodes.map(n => [n.id, n.side]), [['r', null], ['a', 'left'], ['a1', 'left'], ['b', 'right'], ['c', 'right'], ['d', 'left']]);
  // a band counts, not the topic: a's two children make it 60 px
  o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r'), tp('a1', 'a'), tp('a2', 'a'), tp('b', 'r', 80, 50), tp('c', 'r')] });
  assert.deepEqual(o.nodes.filter(n => n.depth === 1).map(n => n.side), ['right', 'left', 'left']);
});

test('each side\'s first-level bands centred on the root\'s middle', () => {
  const o = layoutTree({ root: 'r', topics: [tp('r', null, 80, 40), tp('a', 'r'), tp('b', 'r'), tp('c', 'r', 80, 24, 'right')] });
  const right = o.nodes.filter(n => n.side === 'right'), left = o.nodes.filter(n => n.side === 'left');
  assert.equal((right[0].y + right.at(-1).y + right.at(-1).h) / 2, 20);
  assert.equal(mid(left[0]), 20);
});

test('problems: the root not a topic draws nothing; a topic listed twice draws the first; one not under the root hangs from it, last', () => {
  let o = layoutTree({ root: 'x', topics: [tp('r', null)] });
  assert.deepEqual(o, { nodes: [], links: [], bounds: { x: 0, y: 0, w: 0, h: 0 }, problems: [{ level: 'error', message: 'the root x is not a topic here: nothing drawn', ids: ['x'] }] });
  assert.deepEqual(layoutTree().nodes, []);

  o = layoutTree({ root: 'r', topics: [tp('r', null), tp('a', 'r', 80), tp('a', 'r', 300)] });
  assert.deepEqual(o.nodes.map(n => [n.id, n.w]), [['r', 80], ['a', 80]]);
  assert.deepEqual(o.problems, [{ level: 'warning', message: 'topic a is listed twice: the first is drawn', ids: ['a'] }]);

  // a parent not here, a cycle (p and q), a second root with a child, a topic its own parent: each hung, its subtree with it
  const inp = { root: 'r', topics: [tp('r', null), tp('a', 'r'), tp('m', 'gone'), tp('p', 'q'), tp('q', 'p'), tp('s', null), tp('s1', 's'), tp('z', 'z')] };
  o = layoutTree(inp);
  assert.deepEqual(o.problems.map(p => p.ids[0]), ['m', 'p', 's', 'z']);
  assert.ok(o.problems.every(p => p.level === 'warning' && /does not descend from the root r: hung from it/.test(p.message)));
  assert.deepEqual(o.links.map(l => `${l.from}>${l.to}`), ['r>a', 'r>m', 'r>p', 'p>q', 'r>s', 's>s1', 'r>z']);
  assert.deepEqual(clean(o, { ...inp, topics: inp.topics.map(t => (['m', 'p', 's', 'z'].includes(t.id) ? { ...t, parent: 'r' } : t)) }), []);

  // a clean input lists none
  assert.deepEqual(layoutTree(TABLE['a star of six']).problems, []);
});

test('sizes that are not numbers count as 0; a gap not given or negative takes the default', () => {
  const o = layoutTree({ root: 'r', gap: { x: -5 }, topics: [{ id: 'r', w: 'x', h: NaN }, { id: 'a', parent: 'r', w: -3, h: 20 }] });
  assert.deepEqual(o.nodes.map(n => [n.w, n.h]), [[0, 0], [0, 20]]);
  assert.equal(o.nodes[1].x, TREE.x);
});

test('the same input twice gives the same output, and the input is not changed', () => {
  for (const inp of Object.values(TABLE)) {
    const before = JSON.stringify(inp), a = layoutTree(inp), b = layoutTree(inp);
    assert.deepEqual(a, b); assert.equal(JSON.stringify(inp), before);
  }
});

test('a chain of 20,000 topics lays out with no throw, each a gap out from the one before', () => {
  const topics = [tp('t0', null, 40, 20), ...Array.from({ length: 19999 }, (_, i) => tp(`t${i + 1}`, `t${i}`, 40, 20))];
  const o = layoutTree({ root: 't0', topics });
  assert.equal(o.nodes.length, 20000); assert.deepEqual(o.problems, []);
  const last = o.nodes.at(-1);
  assert.deepEqual([last.depth, last.branch, last.side, last.x, last.y], [19999, 't1', 'right', 19999 * (40 + TREE.x), 0]);
  assert.deepEqual(o.bounds, { x: 0, y: 0, w: 19999 * (40 + TREE.x) + 40, h: 20 });
});

// 5,000 topics, six first-level branches, up to eight levels deep, sizes varied
function big() {
  const topics = [tp('t0', null, 160, 40)];
  for (let i = 1; i < 5000; i++) { const parent = i <= 6 ? 't0' : `t${Math.max(1, Math.floor((i - 1) / 3))}`; topics.push(tp(`t${i}`, parent, 40 + (i * 37) % 160, 20 + (i * 13) % 50)); }
  return { root: 't0', topics };
}

test('5,000 topics: no two overlap and the bounds hold them all', () => {
  const inp = big(), o = layoutTree(inp);
  assert.ok(Math.max(...o.nodes.map(n => n.depth)) >= 7);
  const s = [...o.nodes].sort((a, b) => a.y - b.y), bad = [];
  s.forEach((a, i) => { for (let j = i + 1; j < s.length && s[j].y < a.y + a.h; j++) if (meets(a, s[j])) bad.push(`${a.id} meets ${s[j].id}`); });
  assert.deepEqual(bad, []);
  const B = o.bounds; assert.ok(o.nodes.every(n => n.x >= B.x && n.y >= B.y && n.x + n.w <= B.x + B.w + .02 && n.y + n.h <= B.y + B.h + .02));
});

test('5,000 topics laid out under CI\'s 1 s, printed against 100 ms (CPU, best of seven, after a warm-up) (timed)', () => {
  const inp = big(); layoutTree(inp);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const best = Math.min(...Array.from({ length: 7 }, () => timed(() => layoutTree(inp))));
  assert.ok(best < 1000, `${best} ms`);
  console.log(`# P1 target 100 ms: the tree strategy on 5,000 topics ${best} ms`);
});
