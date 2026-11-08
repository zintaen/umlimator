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

test("an edge whose end is a container is drawn to its box's border, and auto-layout puts its source before the box (#28)", () => {
  const box = { id: 'database', label: 'Database', nodeIds: ['e1', 'e2'] }, ids = ['audit', 'e1', 'e2'];
  const m = { nodes: [{ id: 'audit', label: 'Audit' }, { id: 'e1', label: 'Order', kind: 'database' }, { id: 'e2', label: 'Customer', kind: 'database' }],
    edges: [{ id: 'x', from: 'audit', to: 'database', label: 'writes' }, { id: 'own', from: 'e1', to: 'database' }],
    views: [{ id: 'v', nodeIds: ids, layout: { audit: [0, 0], e1: [2, 0], e2: [2, 1] }, containers: [box] }, { id: 'auto', nodeIds: ids, containers: [box] }] };
  const warns = [], warn = console.warn; console.warn = w => warns.push(w);
  try {
    for (const vid of ['v', 'auto']) {
      const g = layout(m, vid), f = g.families[0], a = g.nodes.find(n => n.id === 'audit'), e = g.edges.find(x => x.ids.includes('x'));
      assert.ok(e, `${vid}: the line is drawn`);
      const [x, y] = e.pts.at(-1);
      assert.ok(x === f.x && y > f.y && y < f.y + f.h, `${vid}: it ends on the box's left border`);
      assert.ok(a.x + a.w < f.x, `${vid}: its source sits before the box`);
      assert.equal(e.lbl && e.lbl.text, 'writes', `${vid}: with its label`);
      assert.ok(!g.edges.some(o => o.ids.includes('own')), `${vid}: a box and a card inside it get no line`);
    }
  } finally { console.warn = warn; }
  assert.ok(warns.some(w => /edge own/.test(w)), 'the edge left out is named in a warning');
});

test("a container's badges are tabs on its top border, right of its title, and the box is wide enough for both (#33)", () => {
  const g = layout({ nodes: [{ id: 'a', label: 'A' }], views: [{ id: 'v', nodeIds: ['a'], containers: [{ id: 'c', label: 'Database', nodeIds: ['a'], badges: ['TA-6', { text: 'Owner: data', tone: 'violet' }] }] }] }, 'v');
  const f = g.families[0], [t0, t1] = f.tabs || [];
  assert.equal((f.tabs || []).length, 2);
  assert.ok(t0.x > f.x + 12 + 'Database'.length * 6.7, 'right of the title');
  assert.ok(t1.x > t0.x + t0.w && t1.x + t1.w <= f.x + f.w - 12, 'left to right, inside the box');
  assert.deepEqual(f.tabs.map(t => [t.text, t.fill]), [['TA-6', 'var(--um-slate)'], ['Owner: data', 'var(--um-violet)']], 'tones as on a card; the text as given, which the sheet upper-cases (#43)');
});

test('a line to a container takes the sides that face across the wider gap, and ends in line with its other end where the border allows (#39)', () => {
  const model = (e1, edge = {}) => ({ nodes: ['audit', 'shell', 'm', 'm2', 'e1', 'e2'].map(id => ({ id, label: id === 'audit' ? 'Audit' : id })),
    edges: [{ id: 'audit-database', from: 'audit', to: 'database', ...edge }],
    views: [{ id: 'v', nodeIds: ['audit', 'shell', 'm', 'm2', 'e1', 'e2'], layout: { shell: [1, 0], audit: [1, 2], m: [2, 0], m2: [3, 0], e1, e2: [e1[0] + 1, 3] },
      containers: [{ id: 'app', label: 'App', nodeIds: ['audit', 'shell', 'm', 'm2'] }, { id: 'database', label: 'Database', nodeIds: ['e1', 'e2'] }] }] });
  const below = layout(model([2, 3]), 'v').edges[0]; // the box 74 px below the card and 32 px to its right
  assert.equal(`${below.fs}>${below.ts}`, 'B>T', 'bottom to top: the vertical gap is the wider');
  assert.ok(below.pts.every((p, k) => !k || p[1] >= below.pts[k - 1][1]), `it never turns back up: ${JSON.stringify(below.pts)}`);
  const under = layout(model([1, 3]), 'v').edges[0]; // the box under the card
  assert.ok(under.pts.length === 2 && under.pts[0][0] === under.pts[1][0], `a straight drop: ${JSON.stringify(under.pts)}`);
  const beside = layout({ nodes: ['a', 'e1', 'e2'].map(id => ({ id, label: id })), edges: [{ from: 'a', to: 'db' }],
    views: [{ id: 'v', nodeIds: ['a', 'e1', 'e2'], layout: { a: [0, 0], e1: [1, 0], e2: [1, 1] }, containers: [{ id: 'db', label: 'Database', nodeIds: ['e1', 'e2'] }] }] }, 'v').edges[0];
  assert.ok(beside.how === 'grid' && beside.pts.length === 2 && beside.pts[0][1] === beside.pts[1][1], `a box 32 px beside the card: a straight line, routed (${beside.how}): ${JSON.stringify(beside.pts)}`);
});

// #40: the issue's hub models: one card feeding n cards in a 4-wide grid beside it, a card above and below it, and systems
// in a box of their own that call back into it (n = 4 with 5 systems is the issue's 12-card model)
const hub = (n, inbound = 0) => {
  const mods = Array.from({ length: n }, (_, i) => `m${i}`), sys = Array.from({ length: inbound }, (_, i) => `s${i}`);
  const nodes = [['hub', 'API'], ['top', 'Shell'], ['low', 'Audit'], ...mods.map(id => [id, `Module ${id}`]), ...sys.map(id => [id, `System ${id}`])].map(([id, label]) => ({ id, label }));
  return { nodes, edges: [...mods.map(id => ({ id: `hub-${id}`, from: 'hub', to: id })), ...sys.map(id => ({ id: `${id}-hub`, from: id, to: 'hub' }))],
    views: [{ id: 'v', nodeIds: nodes.map(x => x.id), layout: { hub: [0, 1], top: [0, 0], low: [0, 2], ...Object.fromEntries(mods.map((id, i) => [id, [1 + i % 4, Math.floor(i / 4)]])), ...Object.fromEntries(sys.map((id, i) => [id, [5, i]])) },
      ...(inbound ? { containers: [{ id: 'app', label: 'App', nodeIds: ['hub', 'top', 'low', ...mods] }, { id: 'sys', label: 'Systems', nodeIds: sys }] } : {}) }] };
};
const throughCards = g => g.edges.flatMap(e => g.nodes.filter(n => n.id !== e.from && n.id !== e.to && e.pts.slice(1).some((p, k) => { const a = e.pts[k];
  return Math.max(a[0], p[0]) > n.x + 2 && Math.min(a[0], p[0]) < n.x + n.w - 2 && Math.max(a[1], p[1]) > n.y + 2 && Math.min(a[1], p[1]) < n.y + n.h - 2; })).map(n => `${e.ids.join(' / ')} through ${n.id}`));

test('no line runs through a card it does not join: a line with no route gets room where it needs it, else goes around the cards (#40)', () => {
  const issue = layout(hub(4, 5), 'v');
  assert.deepEqual(throughCards(issue), [], "the issue's 12-card model");
  assert.equal(issue.stats.fallback, undefined, `every line of the issue's model routes once its gaps widen: ${JSON.stringify(issue.stats)}`);
  for (const n of [12, 13, 14, 15, 16]) for (const inbound of [0, 5]) assert.deepEqual(throughCards(layout(hub(n, inbound), 'v')), [], `one card feeding ${n} cards${inbound ? ', 5 boxed systems calling back' : ''}`);
  for (const [f, v] of [['d24', 'boxed'], ['d24', 'plain'], ['b26', 'overview']]) assert.deepEqual(throughCards(layout(read(`../bench/models/${f}.json`), v)), [], `${f}/${v}`); // b26: loops drawn under the boxes
});

test('a line that still runs through a card is named in a console.warn (#40)', () => {
  const m = { nodes: ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase(), kind: 'backend' })), edges: [{ id: 'a-to-c', from: 'a', to: 'c' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], layout: { a: [0, 0], b: [0, 1], c: [0, 2] }, rgap: 1 }] }; // 1 px between the cards: no way around b
  const warns = [], warn = console.warn; console.warn = w => warns.push(String(w));
  try { layout(m, 'v'); } finally { console.warn = warn; }
  assert.ok(warns.some(w => /edge a-to-c\b.*card "b"/.test(w)), warns.join('\n'));
});

// #46: a system in context: three people use it, it sends to one outside system, and three outside systems have no line
const context = (wide = false) => {
  const card = (id, kind) => ({ id, label: id === 'archive' && wide ? 'Archive of every signed contract since the shop opened' : id[0].toUpperCase() + id.slice(1), kind });
  return { root: 'v', nodes: [card('shop', 'backend'), card('buyer', 'frontend'), card('clerk', 'frontend'), card('courier', 'frontend'), card('mailer', 'external'),
      card('ledger', 'external'), card('archive', 'external'), card('printer', 'external')],
    edges: [{ from: 'buyer', to: 'shop', label: 'uses' }, { from: 'clerk', to: 'shop', label: 'uses' }, { from: 'courier', to: 'shop', label: 'uses' }, { from: 'shop', to: 'mailer', label: 'sends' }],
    views: [{ id: 'v', nodeIds: ['shop', 'buyer', 'clerk', 'courier', 'mailer', 'ledger', 'archive', 'printer'] }] };
};
test('cards with no lines sit in a row of their own under the view: they do not lengthen or widen a column that has lines (#46)', () => {
  for (const wide of [false, true]) {
    const m = context(wide), g = layout(m, 'v'), loose = ['ledger', 'archive', 'printer'];
    const linked = layout({ ...m, views: [{ id: 'v', nodeIds: m.views[0].nodeIds.filter(i => !loose.includes(i)) }] }, 'v'); // the connected part alone
    const at = id => g.nodes.find(n => n.id === id), bottom = Math.max(...linked.nodes.map(n => n.y + n.h));
    for (const n of linked.nodes) assert.deepEqual([at(n.id).x, at(n.id).y], [n.x, n.y], `${n.id} keeps its place${wide ? ' (a wide card in the row)' : ''}`);
    for (const id of loose) assert.ok(at(id).y > bottom, `${id} is under the connected part, not in the sources' column: ${JSON.stringify([at(id).x, at(id).y])}`);
    assert.equal(new Set(loose.map(id => at(id).y)).size, 1, 'one row');
    const row = loose.map(at).sort((a, b) => a.x - b.x);
    assert.ok(row.every((n, k) => !k || n.x >= row[k - 1].x + row[k - 1].w + 24), `apart: ${JSON.stringify(row.map(n => [n.x, n.w]))}`);
    assert.ok(g.bounds.h <= linked.bounds.h + 108 + 1, `the view keeps the height of its connected part plus one row: ${g.bounds.h} vs ${linked.bounds.h}`);
    // the row comes from the cards' slots and lines alone, so a view drawn again from the slots it had (render()'s stable
    // layout across update(), the layout umlimator.py render bakes into a page) is the same picture
    const again = layout({ ...m, views: [{ ...m.views[0], layout: Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]])) }] }, 'v');
    assert.deepEqual(again.nodes.map(n => [n.id, n.x, n.y]), g.nodes.map(n => [n.id, n.x, n.y]), 'the same from its own slots');
  }
});

test("a line's kind is the kind its edge names: no guess from label words unless the view asks (kindsFromLabels), and a merged line takes the first kind its edges name (#45)", () => {
  const m = (view = {}, pay = {}) => ({ root: 'v', nodes: [['web', 'Web', 'frontend'], ['api', 'API', 'backend'], ['db', 'Store', 'database'], ['pay', 'Payments', 'external']].map(([id, label, kind]) => ({ id, label, kind })),
    edges: [{ from: 'web', to: 'api', label: 'calls · 212' }, { from: 'api', to: 'db', label: 'reads, writes · 49' }, { from: 'pay', to: 'api', label: 'triggers · 1', ...pay }, { from: 'api', to: 'pay', label: 'calls · 2', kind: 'calls' }],
    views: [{ id: 'v', nodeIds: ['web', 'api', 'db', 'pay'], ...view }] });
  const kinds = g => Object.fromEntries(g.edges.map(e => [`${e.from}>${e.to}`, e.wk]));
  assert.deepEqual(kinds(layout(m(), 'v')), { 'web>api': 'calls', 'api>db': 'calls', 'pay>api': 'calls' }, 'the default kind whatever the label says; the pair takes the kind one of its edges names');
  assert.deepEqual(kinds(layout(m({ kindsFromLabels: true }), 'v')), { 'web>api': 'calls', 'api>db': 'state', 'pay>api': 'calls' }, 'the view asks for the guess; a named kind still wins');
  assert.deepEqual(kinds(layout(m({}, { kind: 'triggers' }), 'v')), { 'web>api': 'calls', 'api>db': 'calls', 'pay>api': 'triggers' }, 'both edges name one: the first in the model');
  const named = m(); named.edges[1].kind = 'state';
  assert.equal(kinds(layout(named, 'v'))['api>db'], 'state', 'a kind on an edge wins');
});

test("an edge's weight (1, 2 or 3) and its sublabel reach the geometry: the line's weight, a label box with a second line, and a column gap that fits it (#44)", () => {
  const m = (calls = {}, reads = {}) => ({ root: 'v', nodes: [['web', 'Web', 'frontend'], ['api', 'API', 'backend'], ['db', 'Store', 'database']].map(([id, label, kind]) => ({ id, label, kind })),
    edges: [{ from: 'web', to: 'api', label: 'calls · 2', ...calls }, { from: 'api', to: 'db', label: 'reads, writes · 486', ...reads }], views: [{ id: 'v', nodeIds: ['web', 'api', 'db'] }] });
  const plain = layout(m(), 'v'), g = layout(m({ weight: 1, sublabel: 'http' }, { weight: 3, sublabel: 'dapper, ef, sql-command, ef-raw, ado' }), 'v');
  const line = (geo, to) => geo.edges.find(e => e.to === to), at = (geo, id) => geo.nodes.find(n => n.id === id);
  assert.deepEqual(plain.edges.map(e => e.weight), [1, 1], 'weight 1 by default');
  assert.deepEqual(g.edges.map(e => e.weight), [1, 3]);
  const L = line(g, 'db').lbl, L0 = line(plain, 'db').lbl;
  assert.equal(L.text, 'reads, writes · 486'); assert.equal(L.sub, 'dapper, ef, sql-command, ef-raw, ado');
  assert.ok(L.h > L0.h && L.w > L0.w, `a taller box, as wide as its longer line: ${JSON.stringify([L, L0])}`);
  assert.ok(at(g, 'db').x - (at(g, 'api').x + at(g, 'api').w) >= L.w + 54, 'the column gap fits the box with 27 px of line on each side');
  assert.equal(line(plain, 'db').lbl.sub, undefined);
  // a line that stands for several edges: the largest weight, every sublabel; a weight that is not 2 or 3 is 1
  const both = layout({ ...m({}, { weight: 2, sublabel: 'ef' }), edges: [...m({}, { weight: 2, sublabel: 'ef' }).edges, { from: 'db', to: 'api', label: 'notifies', weight: 3, sublabel: 'triggers' }, { from: 'web', to: 'db', weight: 7 }] }, 'v');
  assert.deepEqual([line(both, 'db').weight, line(both, 'db').lbl.sub, both.edges.find(e => e.from === 'web' && e.to === 'db').weight], [3, 'ef / triggers', 1]);
});

// #49: cards in one column all point to one card (made-up names)
const PEOPLE = ['ann', 'ben', 'cal', 'dee', 'eve', 'fay'];
const users = n => ({ root: 'v', nodes: [{ id: 'shop', label: 'Shop', kind: 'backend' }, ...PEOPLE.slice(0, n).map(id => ({ id, label: id[0].toUpperCase() + id.slice(1), kind: 'frontend' }))],
  edges: PEOPLE.slice(0, n).map(id => ({ from: id, to: 'shop', label: 'uses' })), views: [{ id: 'v', nodeIds: ['shop', ...PEOPLE.slice(0, n)] }] });
test("lines from one column into one card nest: the card's ports on a side follow the order of their sources, and no line detours around its own column (#49)", () => {
  for (const n of [3, 4, 5, 6]) {
    const g = layout(users(n), 'v'), along = (side, k) => g.edges.filter(e => e.ts === side).sort((a, b) => a.p2[k] - b.p2[k]).map(e => e.from);
    const inOrder = list => list.every((id, i) => !i || PEOPLE.indexOf(list[i - 1]) < PEOPLE.indexOf(id));
    assert.ok(inOrder(along('L', 1)), `${n} sources: shop's left side, top to bottom: ${along('L', 1)}`);
    assert.ok(inOrder(along('B', 0)), `${n} sources: shop's bottom side, left to right: ${along('B', 0)}`);
    if (n === 3) assert.deepEqual(along('L', 1), ['ann', 'ben', 'cal'], "the issue's model");
    for (const e of g.edges) { const len = e.pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - e.pts[k][0]) + Math.abs(p[1] - e.pts[k][1]), 0);
      const direct = Math.abs(e.pts[0][0] - e.pts.at(-1)[0]) + Math.abs(e.pts[0][1] - e.pts.at(-1)[1]);
      assert.ok(len <= 1.1 * direct, `${n} sources: ${e.from}'s line is ${Math.round(len)} px for a direct route of ${Math.round(direct)}: ${JSON.stringify(e.pts.map(p => p.map(Math.round)))}`); }
  }
});
