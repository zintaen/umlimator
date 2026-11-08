// node --test tests/   (Node 18+; no browser: layout() needs no DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { layout, history } from '../lib/umlimator.js';

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

test('history(): undo and redo walk the models a host pushed; a new push drops the redo steps; limit caps the past', () => {
  const h = history('a', 2);
  assert.equal(h.canUndo, false); assert.equal(h.undo(), 'a');
  h.push('b'); h.push('c');
  assert.equal(h.undo(), 'b'); assert.equal(h.undo(), 'a'); assert.equal(h.undo(), 'a');
  assert.equal(h.redo(), 'b'); assert.equal(h.canRedo, true);
  h.push('x'); assert.equal(h.canRedo, false); assert.equal(h.redo(), 'x');
  h.push('y'); h.push('z'); h.undo(); h.undo(); assert.equal(h.undo(), 'x'); // limit 2: 'b' is gone
  assert.equal(h.model, 'x'); assert.equal(h.canUndo, false);
});

test("the package exports the module and the default theme (a host imports 'umlimator/theme.css')", () => {
  const req = createRequire(import.meta.url); // a package may resolve its own name through its exports
  assert.match(req.resolve('umlimator'), /lib[\\/]umlimator\.js$/);
  assert.match(req.resolve('umlimator/theme.css'), /lib[\\/]umlimator-theme\.css$/);
});

// containers (#27): a box holds exactly its own cards, and keeps 32 px from other boxes and from cards outside it
const ISSUE27 = { nodes: [['person:0', 'Shopper', 'frontend'], ['person:1', 'Clerk', 'frontend'], ['shell', 'App shell', 'frontend', ['TA-4']], ['api', 'API', 'backend', ['TA-3']],
    ['module:0', 'Returns', 'backend', [], ['FC-7', 'FC-8']], ['module:1', 'Orders', 'backend', [], ['FC-1', 'FC-2', 'FC-3', 'FC-4', 'FC-5']], ['module:2', 'Module · later', 'backend'],
    ['module:3', 'Billing', 'backend'], ['module:4', 'Catalogue', 'backend'], ['audit', 'Audit', 'security', ['TA-2', 'TA-9']], ['entity:0', 'ReturnRequest', 'database'],
    ['entity:1', 'Order', 'database'], ['entity:2', 'Customer', 'database'], ['signin', 'Sign-in', 'security', ['TA-1']], ['system:0', 'Payment gateway', 'external'], ['system:1', 'SMTP relay', 'external']]
    .map(([id, label, kind, badges = [], verbs]) => ({ id, label, kind, badges, verbs })),
  edges: [['person:0', 'shell'], ['person:1', 'shell'], ['signin', 'shell'], ['api', 'module:0'], ['api', 'module:1'], ['api', 'module:2'], ['api', 'module:3'], ['api', 'module:4'],
    ['system:0', 'api'], ['system:1', 'api']].map(([from, to]) => ({ from, to })),
  views: [{ id: 'target', nodeIds: [], containers: [{ id: 'people', label: 'People', nodeIds: ['person:0', 'person:1'] },
    { id: 'app', label: 'Target app', nodeIds: ['shell', 'api', 'module:0', 'module:1', 'module:2', 'module:3', 'module:4', 'audit'] },
    { id: 'database', label: 'Database · TA-6', nodeIds: ['entity:0', 'entity:1', 'entity:2'] }, { id: 'systems', label: 'Other systems · TA-5', nodeIds: ['signin', 'system:0', 'system:1'] }] }] };
ISSUE27.views[0].nodeIds = ISSUE27.nodes.map(n => n.id);
const boxesApart = (g, view) => {
  const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const apart = (a, b) => a.x + a.w + 32 <= b.x || b.x + b.w + 32 <= a.x || a.y + a.h + 32 <= b.y || b.y + b.h + 32 <= a.y;
  const defs = Object.fromEntries((view.containers || []).map(c => [c.id, c]));
  const holds = (f, id) => (defs[f.id].nodeIds || []).includes(id) || (view.containers || []).some(c => c.parent === f.id && holds(c, id));
  g.families.forEach((f, i) => {
    g.nodes.forEach(n => assert.equal(inside(n, f), holds(f, n.id), `box ${f.id} ${holds(f, n.id) ? 'holds' : 'does not hold'} card ${n.id}`));
    g.nodes.filter(n => !inside(n, f)).forEach(n => assert.ok(apart(f, n), `box ${f.id} keeps 32 px from card ${n.id}`));
    g.families.slice(i + 1).filter(o => !inside(o, f) && !inside(f, o)).forEach(o => assert.ok(apart(f, o), `boxes ${f.id} and ${o.id} keep 32 px apart`));
  });
};

test("containers: auto-layout keeps each container's cards together in a block, and boxes keep apart (#27)", () => {
  for (const [m, vid] of [[ISSUE27, 'target'], [read('../bench/models/b26.json'), 'overview']]) {
    const g = layout(m, vid); assert.ok(g.families.length >= 2); boxesApart(g, m.views.find(v => v.id === vid));
  }
});

test('containers: a layout keeps its slots, and the gaps between boxes widen: side by side, stacked, nested, next to a loose card (#27)', () => {
  const cards = ids => ids.map(id => ({ id, label: id.toUpperCase() }));
  const cases = [
    { a: [0, 0], b: [1, 0], boxes: [{ id: 'x', label: 'Box X', nodeIds: ['a'] }, { id: 'y', label: 'Box Y', nodeIds: ['b'] }] },          // the issue's 2-box layout
    { a: [0, 0], b: [0, 1], boxes: [{ id: 'x', label: 'Box X', nodeIds: ['a'] }, { id: 'y', label: 'Box Y', nodeIds: ['b'] }] },          // stacked
    { a: [0, 0], b: [1, 0], c: [2, 0], boxes: [{ id: 'p', label: 'Outer', nodeIds: ['a'] }, { id: 'k', label: 'Inner', nodeIds: ['b'], parent: 'p' }, { id: 'q', label: 'Next', nodeIds: ['c'] }] },
    { a: [0, 0], b: [1, 0], boxes: [{ id: 'x', label: 'Box X', nodeIds: ['a'] }] },                                                       // a loose card beside a box
  ];
  for (const { boxes, ...slots } of cases) {
    const ids = Object.keys(slots), view = { id: 'v', nodeIds: ids, layout: slots, containers: boxes };
    const g = layout({ nodes: cards(ids), edges: [{ from: ids[0], to: ids[1] }], views: [view] }, 'v');
    boxesApart(g, view);
    assert.deepEqual(Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]])), slots, 'cards keep their slots');
  }
});
