// node --test tests/   (Node 18+; no browser: layout() needs no DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, check, history, validate } from '../lib/umlimator.js';
import { leaveIssues } from '../src/layout/audit.js';
import { mapContext } from '../src/map/context.js';
import { fit } from '../src/core/text.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
// the bench's geometry hash (bench/bench.py, #bench=1): FNV-1a over node boxes, route points and label spots
const hash = g => {
  const sig = JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null])]);
  let h = 2166136261; for (let k = 0; k < sig.length; k++) h = Math.imul(h ^ sig.charCodeAt(k), 16777619) >>> 0;
  return h.toString(16);
};
const expected = read('../bench/expected.json').results; // the reference geometry (bench.py --write-expected)

test('the module built from src/ exports what 0.16.0 exported, and migrate() from 0.17.0 (stage 1 note, §2.3)', async () => {
  assert.deepEqual(Object.keys(await import('../lib/umlimator.js')).sort(), ['apply', 'check', 'critical', 'describe', 'diff', 'drift', 'history',
    'layout', 'migrate', 'mountPage', 'otlpSpans', 'paths', 'reach', 'references', 'render', 'rules', 'sequenceFromTrace', 'validate', 'whatIf']);
});

test('layout() draws every benchmark view exactly as the browser did (bench/expected.json)', () => {
  const models = { ...Object.fromEntries(readdirSync(new URL('../bench/models/', import.meta.url)).map(f => [f.replace('.json', ''), read('../bench/models/' + f)])), 'bike-share': read('../examples/bike-share.json') };
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
// audit 15: a map's repair: false is no repair at all; the typed views' request/reply port swap (audit 14) left it alone in
// 0.39.0, so three cards joined both ways draw as then: n2's pair to n0 does not cross, 5 issues (6 with the swap)
test("a map's repair: false keeps its lines' ports (no request/reply swap)", () => {
  const n = ['n0', 'n1', 'n2'], m = { nodes: n.map(id => ({ id, label: id })), views: [{ id: 'v', nodeIds: n, keepPairs: true, repair: false }],
    edges: [['n0', 'n1'], ['n1', 'n0'], ['n2', 'n0'], ['n0', 'n2'], ['n1', 'n2'], ['n2', 'n1']].map(([from, to], i) => ({ from, to, label: 'l' + i })) };
  const c = check(m, 'v').map(i => i.message);
  assert.equal(c.length, 5, c.join('\n'));
  assert.ok(!c.some(s => /n2→n0 and n0→n2 cross/.test(s)), c.join('\n'));
});

test('an unknown view is an error', () => {
  assert.throws(() => layout(read('../examples/bike-share.json'), 'nope'), /no view "nope"/);
});

test('the module bakes in no colour: every colour is a --um-* variable (lib/umlimator-theme.css has the defaults)', () => {
  const src = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'); // everything umlimator.js has, and every family
  const found = src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/g) || [];
  assert.deepEqual(found, []);
  const theme = readFileSync(new URL('../lib/umlimator-theme.css', import.meta.url), 'utf8');
  for (const v of ['--um-bg', '--um-text', '--um-accent', '--um-edited', '--um-sans', '--um-mono']) assert.ok(theme.includes(v + ':'), v);
});

test('nothing is fetched at runtime: no web fonts, stylesheets or imports in the module or the page', () => {
  for (const f of ['../lib/umlimator.js', '../lib/umlimator-all.js', '../lib/umlimator-theme.css', '../engine/assets/template.html']) {
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

test("in a view with boxes, cards with no lines outside the boxes sit in the view's row under everything, side by side, as in a plain view (#46)", () => {
  const m = context(), loose = ['ledger', 'archive', 'printer'];
  m.views[0].containers = [{ id: 'core', label: 'Core', nodeIds: ['shop', 'mailer'] }];
  const g = layout(m, 'v'), at = id => g.nodes.find(n => n.id === id), box = g.families.find(f => f.id === 'core');
  const bottom = Math.max(box.y + box.h, ...g.nodes.filter(n => !loose.includes(n.id)).map(n => n.y + n.h));
  for (const id of loose) assert.ok(at(id).y > bottom, `${id} is under the cards with lines and their box, not in the sources' column: ${JSON.stringify([at(id).x, at(id).y])}`);
  assert.equal(new Set(loose.map(id => at(id).y)).size, 1, 'one row');
  const row = loose.map(at).sort((a, b) => a.x - b.x);
  assert.ok(row.every((n, k) => !k || n.x >= row[k - 1].x + row[k - 1].w + 24), `side by side: ${JSON.stringify(row.map(n => [n.x, n.w]))}`);
});

test('cards with no lines inside a box sit in a row at the bottom of their box: they do not lengthen its first column', () => {
  const m = context(), inside = ['ledger', 'archive'];
  m.views[0].containers = [{ id: 'core', label: 'Core', nodeIds: ['shop', 'mailer', 'ledger', 'archive'] }];
  const g = layout(m, 'v'), at = id => g.nodes.find(n => n.id === id), box = g.families.find(f => f.id === 'core');
  const floor = Math.max(...['shop', 'mailer'].map(id => at(id).y + at(id).h)); // the box's cards with lines
  for (const n of inside.map(at)) assert.ok(n.y > floor && n.x >= box.x && n.x + n.w <= box.x + box.w && n.y + n.h <= box.y + box.h,
    `${n.id} is in its box, under its cards with lines: ${JSON.stringify([n.x, n.y])} in ${JSON.stringify([box.x, box.y, box.w, box.h])}`);
  assert.equal(new Set(inside.map(id => at(id).y)).size, 1, 'one row at the bottom of the box');
  assert.ok(at('archive').x >= at('ledger').x + at('ledger').w + 24, 'side by side, not stacked in its first column');
  assert.ok(at('printer').y > box.y + box.h, "a card with no line outside the box is under it, in the view's row");
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

test("auto-layout orders a column so the lines between two columns don't cross when another order avoids it, and no line detours around its column (#53)", () => {
  const m = { root: 'v', nodes: [['front', 'Front'], ['kernel', 'Kernel'], ['frame', 'Frame'], ['backend', 'backend'], ['loose', 'Types with no component']].map(([id, label]) => ({ id, label, kind: 'backend' })),
    edges: [{ from: 'front', to: 'backend', label: 'calls · 82' }, { from: 'frame', to: 'kernel', label: 'calls · 3' }, { from: 'loose', to: 'front', label: 'calls · 32' }],
    views: [{ id: 'v', nodeIds: ['front', 'kernel', 'frame', 'backend', 'loose'] }] };
  for (const boxed of [false, true]) { // a plain view, and the same cards in a box (a container's components view)
    const g = layout(boxed ? { ...m, views: [{ ...m.views[0], containers: [{ id: 'app', label: 'App', nodeIds: ['front', 'kernel', 'frame', 'backend', 'loose'] }] }] } : m, 'v'), at = id => g.nodes.find(n => n.id === id);
    assert.ok(at('kernel').y < at('front').y, `${boxed ? 'boxed: ' : ''}kernel above front`);
    for (const e of g.edges) { const len = e.pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - e.pts[k][0]) + Math.abs(p[1] - e.pts[k][1]), 0);
      const direct = Math.abs(e.pts[0][0] - e.pts.at(-1)[0]) + Math.abs(e.pts[0][1] - e.pts.at(-1)[1]);
      assert.ok(len <= 1.1 * direct, `${boxed ? 'boxed: ' : ''}${e.from} -> ${e.to} is ${Math.round(len)} px for a direct route of ${Math.round(direct)}`); }
  }
});

test('auto-layout puts a card level with the card its line comes from, so the line runs straight, not at the top of its column (0.11.0)', () => {
  const card = id => ({ id, label: id.toUpperCase(), kind: 'backend' });
  const m = { nodes: ['x', 'y', 'z', 'w', 'v'].map(card), edges: [{ from: 'x', to: 'v' }, { from: 'y', to: 'v' }, { from: 'z', to: 'w' }],
    views: [{ id: 'v1', nodeIds: ['x', 'y', 'z', 'w', 'v'] }] };
  const g = layout(m, 'v1'), at = id => g.nodes.find(n => n.id === id), line = g.edges.find(e => e.from === 'z');
  assert.equal(at('w').y, at('z').y, 'W on Z\'s row');
  assert.equal(line.pts.length, 2, `Z -> W runs straight: ${JSON.stringify(line.pts)}`);
  // in a view with boxes: a box sits level with the card in another box that its line comes from
  const b = { nodes: ['y1', 'y2', 'y3', 'z1'].map(card), edges: [{ from: 'y1', to: 'y2' }, { from: 'y1', to: 'y3' }, { from: 'y3', to: 'z1' }],
    views: [{ id: 'v1', nodeIds: ['y1', 'y2', 'y3', 'z1'], containers: [{ id: 'Y', label: 'Y', nodeIds: ['y1', 'y2', 'y3'] }, { id: 'Z', label: 'Z', nodeIds: ['z1'] }] }] };
  const gb = layout(b, 'v1'), bt = id => gb.nodes.find(n => n.id === id);
  assert.equal(bt('z1').y, bt('y3').y, 'box Z level with Y3, the card its line comes from');
  assert.equal(gb.edges.find(e => e.from === 'y3').pts.length, 2, 'Y3 -> Z1 runs straight');
});

test('auto-layout puts a card no line comes into just before its callee when that routes better, not in the first column (0.11.0)', () => {
  const g = layout(read('../examples/bike-share.json'), 'overview'), at = id => g.nodes.find(n => n.id === id);
  assert.equal(at('grafana').col, at('api').col - 1, 'Dashboards, which only reads Shop API\'s metrics, sits in the column before it');
});

test("a line from a card's top into another's top on the top row goes up, across and down, not past its card and back (#80)", () => {
  const m = { nodes: ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase(), kind: 'backend' })), // no row above it: it can't come in from above
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { id: 'over', from: 'a', to: 'c', fromSide: 'top', toSide: 'top' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  const over = layout(m, 'v').edges.find(e => e.ids.includes('over')), docks = layout(read('../examples/bike-share.json'), 'fleet').edges.find(e => e.ids.includes('f2'));
  for (const e of [over, docks]) assert.equal(e.pts.length, 4, `${e.from} -> ${e.to}: ${JSON.stringify(e.pts.map(p => p.map(Math.round)))}`);
});

test("a box's cards sit level with the cards outside it that their lines come from, not stacked at its top (#86)", () => {
  const card = id => ({ id, label: id.toUpperCase(), kind: 'backend' });
  // L's top and bottom cards feed R past L4, which L2 feeds: R's two cards were stacked, and the box was levelled as a whole
  const m = { nodes: ['l1', 'l2', 'l3', 'l4', 'r1', 'r2'].map(card), edges: [{ from: 'l1', to: 'r1' }, { from: 'l2', to: 'l4' }, { from: 'l3', to: 'r2' }],
    views: [{ id: 'v', nodeIds: ['l1', 'l2', 'l3', 'l4', 'r1', 'r2'], containers: [{ id: 'L', label: 'L', nodeIds: ['l1', 'l2', 'l3', 'l4'] }, { id: 'R', label: 'R', nodeIds: ['r1', 'r2'] }] }] };
  const g = layout(m, 'v'), at = id => g.nodes.find(n => n.id === id);
  assert.deepEqual([at('r1').y, at('r2').y], [at('l1').y, at('l3').y], 'R1 and R2 level with L1 and L3');
  for (const e of g.edges) assert.equal(e.pts.length, 2, `${e.from} -> ${e.to} runs straight: ${JSON.stringify(e.pts)}`);
  // a generated map: the made-up monorepo with fewer imports (bench/models/r15.json), boxed by folder, crossed 9 times
  assert.deepEqual(check(read('../bench/models/r15.json'), 'boxed').map(i => i.message), []);
});

test("far ends level with each other take a side's ports by the angle they come in at: b10's Reports 7 runs into Inventory 9, not round the map", () => {
  const e = layout(read('../bench/models/b10.json'), 'overview').edges.find(x => x.from === 'n07' && x.to === 'n09');
  const len = e.pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - e.pts[k][0]) + Math.abs(p[1] - e.pts[k][1]), 0);
  const direct = Math.abs(e.pts[0][0] - e.pts.at(-1)[0]) + Math.abs(e.pts[0][1] - e.pts.at(-1)[1]);
  assert.ok(len <= 1.1 * direct, `${Math.round(len)} px for a direct route of ${Math.round(direct)} (1,399 px in 0.12.1)`);
});

// clinic's context and containers views, cut down: the line into the patient is the importer's loop back, from a card on the right
const CLINIC = (() => {
  const card = (id, label, kind, sublabel) => ({ id, label, kind, sublabel }), line = (from, to, label, sublabel, loop) => ({ id: from + '-' + to, from, to, label, sublabel, loop });
  return { nodes: [card('patient', 'Patient', 'frontend', 'Person'), card('reception', 'Receptionist', 'frontend', 'Person'), card('bookings', 'Clinic bookings', 'backend', 'Software system'),
    card('web', 'Booking site', 'frontend', 'React'), card('desk', 'Front desk app', 'frontend', 'React'), card('api', 'Booking API', 'backend', 'Go'), card('db', 'Bookings database', 'database', 'PostgreSQL'),
    card('jobs', 'Job queue', 'queue', 'RabbitMQ'), card('sender', 'Reminder sender', 'backend', 'Python'), card('sms', 'SMS gateway', 'external', 'Software system'), card('records', 'Patient records', 'external', 'Software system')],
  edges: [line('patient', 'bookings', 'Books appointments', 'HTTPS'), line('reception', 'bookings', 'Runs the day', 'HTTPS'), line('bookings', 'records', 'Checks the patient', 'FHIR'),
    line('bookings', 'sms', 'Sends texts', 'HTTPS'), line('sms', 'patient', 'Texts a reminder', undefined, true), line('patient', 'web', 'Books appointments', 'HTTPS'),
    line('reception', 'desk', 'Runs the day', 'HTTPS'), line('web', 'api', 'Books', 'JSON/HTTPS'), line('desk', 'api', 'Moves and cancels', 'JSON/HTTPS'), line('api', 'records', 'Checks the patient', 'FHIR'),
    line('api', 'db', 'Reads and writes', 'SQL'), line('api', 'jobs', 'Queues reminders', 'AMQP'), line('sender', 'jobs', 'Takes reminders', 'AMQP'), line('sender', 'sms', 'Sends texts', 'HTTPS')],
  views: [{ id: 'context', nodeIds: ['patient', 'reception', 'bookings', 'sms', 'records'], containers: [{ id: 'staff', label: 'Clinic staff', nodeIds: ['reception'] }],
    edges: ['patient-bookings', 'reception-bookings', 'bookings-records', 'bookings-sms', 'sms-patient'] },
  { id: 'containers', nodeIds: ['patient', 'reception', 'web', 'desk', 'api', 'db', 'jobs', 'sender', 'sms', 'records'],
    containers: [{ id: 'system', label: 'Clinic bookings', nodeIds: ['web', 'desk', 'api', 'db', 'jobs', 'sender'] }, { id: 'staff', label: 'Clinic staff', nodeIds: ['reception'] }],
    edges: ['patient-web', 'reception-desk', 'web-api', 'desk-api', 'api-records', 'api-db', 'api-jobs', 'sender-jobs', 'sender-sms', 'sms-patient'] }] };
})();

test("a line from a card on the right into a card on its left comes in on the near side and never runs round one of its own cards (clinic's reminder)", () => {
  // behind a card: past its side opposite the port; a line may go there only when its other end is there
  const behind = (n, side, [x, y]) => side === 'R' ? x < n.x - .5 : side === 'L' ? x > n.x + n.w + .5 : side === 'B' ? y < n.y - .5 : y > n.y + n.h + .5;
  for (const v of CLINIC.views) {
    const g = layout(CLINIC, v.id);
    for (const e of g.edges) for (const [n, side, far] of [[e.s, e.fs, e.pts.at(-1)], [e.t, e.ts, e.pts[0]]])
      assert.ok(behind(n, side, far) || !e.pts.some(p => behind(n, side, p)), `${v.id}: ${e.from} -> ${e.to} runs round ${n.id}: ${JSON.stringify(e.pts.map(p => p.map(Math.round)))}`);
    assert.equal(g.edges.find(e => e.from === 'sms').ts, 'R', `${v.id}: the reminder comes in on the patient's near side`);
    assert.deepEqual(check(CLINIC, v.id).map(i => i.message), [], v.id); // it went over the patient, down its far side and under it, and the check said nothing
  }
});

test("a line that only jogged between two cards facing each other runs straight: clinic's patient books on the booking site", () => {
  const e = layout(CLINIC, 'containers').edges.find(e => e.from === 'patient');
  assert.equal(e.pts.length, 2, JSON.stringify(e.pts)); // the patient's two ports are spread round its middle, the site's one port was in its middle
});

test("a model's edge ids don't change its picture: port repair tries every pair of lines either way (r19's edges have none)", () => {
  const m = read('../bench/models/r19.json'), named = structuredClone(m); named.edges.forEach((e, i) => { e.id = 'e' + i; });
  for (const v of m.views) assert.deepEqual(layout(m, v.id).edges.map(e => e.pts), layout(named, v.id).edges.map(e => e.pts), v.id);
});

test("a line's label finds the gap where it fits between the cards and lines beside it, not the box border by it (clinic's \"Queues reminders\")", () => {
  assert.deepEqual(check(read('../examples/clinic.json'), 'api-components').map(i => i.message), []);
});

test("a loop drawn under the boxes comes up beside its target into its near side, the lowest port there; two into one card nest (#128)", () => {
  const near = (g, from, to) => { const e = g.edges.find(e => e.from === from && e.to === to), t = e.t, [x, y] = e.pts.at(-1);
    assert.equal(e.how, 'under', `${from} -> ${to} runs under the boxes`); assert.equal(e.ts, 'R', `${from} -> ${to} comes into ${to}'s near side`);
    assert.equal(x, t.x + t.w); assert.ok(e.pts.slice(-3).every(([px]) => px >= t.x + t.w), JSON.stringify(e.pts)); // up the gap beside it
    assert.ok(g.edges.every(o => o === e || o.ts !== 'R' || o.t !== t || o.pts.at(-1)[1] <= y || o.under), 'the lowest port on that side');
    return e; };
  const w = read('../examples/weather.json'), g = layout(w, 'check');
  near(g, 'quarantine', 'readings'); assert.deepEqual(check(w, 'check').map(i => i.message), []);
  const b = layout(read('../bench/models/b26.json'), 'overview'), [i, o] = [near(b, 'n18', 'n21'), near(b, 'n14', 'n21')]; // o runs lower: it comes up nearer the card, into the lower port
  assert.ok(o.pts.at(-1)[1] > i.pts.at(-1)[1] && o.pts.at(-2)[0] < i.pts.at(-2)[0], JSON.stringify([i.pts, o.pts]));
});

test("lines into a card that six or more lines come into are routed first, and cross less: r19's logger has seven (#111)", () => {
  const m = read('../bench/models/r19.json'), n = v => check(m, v).length;
  assert.ok(n('boxed') <= 12 && n('plain') <= 13, JSON.stringify([n('boxed'), n('plain')])); // 16 and 15 before: the line crossings in boxed 15 → 10
});

test("lines into a busy card that still cross: one at a time goes round the outside, or its target to the foot of its column, kept with fewer issues: r19's logger (#149)", () => {
  const m = read('../bench/models/r19.json');
  const into = v => { const is = check(m, v).map(i => i.message); return [is.filter(s => / (cross|share a line)$/.test(s) && /→logger /.test(s.replace(/ (cross|share a line)$/, ' '))).length, is.length]; };
  assert.deepEqual([into('boxed'), into('plain')], [[1, 7], [3, 10]]); // [5, 12] and [6, 13] before
});

test("two cards that both feed the same two cards: one line goes round the outside, so the generated monorepo map checks clean (#111)", () => {
  const m = read('../examples/monorepo.json');
  for (const v of m.views) assert.deepEqual(check(m, v.id).map(i => i.message), [], v.id); // plain: web -> kit crossed admin's lines into api-client and charts
  const round = layout(m, 'plain').edges.filter(e => /apps\/(web|admin)/.test(e.from) && e.fs === 'L'); // out its source's far side, round the column
  assert.equal(round.length, 1, JSON.stringify(round.map(e => e.pts)));
});

// a numbered line from a card in one box past a card in another (#142), and two labelled lines that leave a card 16 px apart,
// one of them jogging 16 px into its target (#108, as assistant's "a draft"): each label shows its words, off the boxes' borders
const BOXES = (label, step) => ({ nodes: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }],
  edges: [{ from: 'a', to: 'b', label, step }, { from: 'c', to: 'b' }],
  views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], containers: [{ id: 'x', label: 'Left', nodeIds: ['a'] }, { id: 'y', label: 'Right', nodeIds: ['b', 'c'] }] }] });
const JOG = { nodes: [{ id: 'draft', label: 'Draft' }, { id: 'check', label: 'Check' }, { id: 'model', label: 'Model', kind: 'external' }, { id: 'tone', label: 'Tone guide', kind: 'database' }],
  edges: [{ from: 'draft', to: 'model', label: 'writes with' }, { from: 'draft', to: 'check', label: 'a draft' }, { from: 'tone', to: 'check', label: 'reviews' }],
  views: [{ id: 'v', render: 'sequence', lanes: false, nodeIds: ['draft', 'check', 'model', 'tone'], layout: { tone: [0, 0], draft: [0, 1], check: [1, 1], model: [1, 2] } }] };

test('a label keeps its words, off the boxes\' borders: on a line with a step past two box borders (#142), and beside a line that leaves its card 16 px from it (#108)', () => {
  const cases = [...['Sends', 'Sends the report', 'Sends the nightly report every day'].flatMap(l => [[`boxes, "${l}"`, BOXES(l)], [`boxes, "${l}", step 1`, BOXES(l, 1)]]), ['two lines side by side, one jogging', JOG]];
  for (const [name, m] of cases) {
    const g = layout(m, 'v');
    assert.deepEqual(g.edges.filter(e => e.label && (!e.lbl || e.lbl.short)).map(e => e.label), [], `${name}: a label cut to its step`);
    assert.deepEqual(check(m, 'v').map(i => i.message).filter(s => / sits on the border | has no room /.test(s)), [], name);
  }
  assert.ok(layout(JOG, 'v').edges.some(e => e.label === 'a draft' && e.pts.length === 4 && Math.abs(e.pts[3][1] - e.pts[0][1]) <= 16), 'the line jogs 16 px or less');
  // u21's shop with Orders unfolded: "orders", on the line down into Order API, sat on the box's left border
  assert.deepEqual(check(read('../bench/models/u21.json'), 'shop', { expand: ['orders'] }).map(i => i.message).filter(s => s.includes(' sits on the border ')), []);
});

test('the layout check names a label that has no room on its line and shows only its step (#142)', () => {
  // six numbered lines from a card down to the six cards under it, in one column: their labels have no room beside each other
  const ids = [0, 1, 2, 3, 4, 5].map(i => 't' + i), m = { nodes: [{ id: 'a', label: 'A' }, ...ids.map((id, i) => ({ id, label: 'T' + i }))],
    edges: ids.map((id, i) => ({ from: 'a', to: id, label: 'hands over job ' + i, step: i + 1 })), views: [{ id: 'v', nodeIds: ['a', ...ids], layout: Object.fromEntries([['a', [0, 0]], ...ids.map((id, i) => [id, [0, i + 1]])]) }] };
  const cut = layout(m, 'v').edges.filter(e => e.lbl && e.lbl.short).map(e => `view v: label "${e.label}" has no room on edge A→${e.t.label}: only its step ${e.step} shows`);
  assert.ok(cut.length, 'a label cut to its step');
  assert.deepEqual(check(m, 'v').map(i => i.message).filter(s => s.includes(' has no room ')), cut);
});

test('a labelled line into a card in a box in a box gets room for both borders, as one into a lane does (#82)', () => {
  const m = nested => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: 'reads often' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], containers: nested ? [{ id: 'o', label: 'Outer', nodeIds: [] }, { id: 'i', label: 'Inner', nodeIds: ['b'], parent: 'o' }] : [{ id: 'o', label: 'Outer', nodeIds: ['b'] }] }] });
  const gap = g => g.nodes[1].x - (g.nodes[0].x + g.nodes[0].w);
  assert.equal(gap(layout(m(true), 'v')) - gap(layout(m(false), 'v')), 12);
});

test('the CLI renders what render() draws: a card that opens a view the host loads later (#47), a line that ends on a box (#28); a dangling id still fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'umlimator-cli-')), cli = fileURLToPath(new URL('../umlimator.py', import.meta.url));
  const render = m => { const p = join(dir, 'map.json'); writeFileSync(p, JSON.stringify(m)); // every view laid out: no Chrome needed
    return spawnSync('python3', [cli, 'render', p, '--out', join(dir, 'map.html'), '--no-check'], { encoding: 'utf8' }); };
  const m = { nodes: [{ id: 'web', label: 'Web', opensView: 'web-inside', opensCount: 4 }, { id: 'api', label: 'API' }, { id: 'db', label: 'Store', kind: 'database' }],
    edges: [{ id: 'e1', from: 'web', to: 'data', label: 'reads' }],
    views: [{ id: 'v', nodeIds: ['web', 'api', 'db'], containers: [{ id: 'data', label: 'Data', nodeIds: ['api', 'db'] }], nodeOverrides: { api: { opensView: 'api-inside' } },
      edges: ['e1', { from: 'data', to: 'web', label: 'pushes' }], layout: { web: [0, 0], api: [1, 0], db: [1, 1] } }] };
  try {
    const ok = render(m);
    assert.equal(ok.status, 0, ok.stderr);
    const bad = structuredClone(m); bad.views[0].edges.push({ from: 'data', to: 'nowhere' }); bad.views[0].nodeIds.push('ghost');
    const no = render(bad);
    assert.notEqual(no.status, 0);
    assert.match(no.stderr, /view 'v': unknown node 'ghost'/);
    assert.match(no.stderr, /edge data->nowhere has an unknown end/);
    assert.doesNotMatch(no.stderr, /opens unknown view|data->web/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a map whose containers nest 3,000 deep lays out: its boxes placed and framed without recursion (audit 3)', () => {
  const containers = Array.from({ length: 3000 }, (_, i) => ({ id: 'b' + i, ...(i ? { parent: 'b' + (i - 1) } : {}), ...(i === 2999 ? { nodeIds: ['a'] } : {}) }));
  const g = layout({ nodes: [{ id: 'a' }, { id: 'z' }], edges: [{ from: 'a', to: 'z' }], views: [{ id: 'v', nodeIds: ['a', 'z'], containers }] }, 'v');
  assert.ok(g.byId.z.x > g.byId.a.x);
});

test('a pin that is not two numbers is no pin: laid out as unpinned, and validate() says so (audit 3)', () => {
  for (const p of [[0, 'x'], ['x', 0], [0, {}], ['a', 'b'], [0]]) {
    const m = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], layout: { a: p } }] };
    const a = layout(m, 'v').byId.a;
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), JSON.stringify(p));
    assert.ok(validate(m).some(q => q.path === 'views[0].layout.a' && /not two numbers/.test(q.message)), JSON.stringify(p));
  }
});

test('audit 4: check() names a card or box with no label by its id', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'], edges = [];
  ids.forEach(x => ids.forEach(y => { if (x < y) edges.push({ from: x, to: y }); }));
  const said = check({ nodes: ids.map(id => ({ id })), edges: [...edges, { from: 'e', to: 'a' }], views: [{ id: 'v', nodeIds: ids }] }, 'v').map(i => i.message);
  assert.ok(said.length && said.every(s => !s.includes('undefined')), said.join('\n'));
  const box = check({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], containers: [{ id: 'x', nodeIds: ['a', 'b'] }, { id: 'y', nodeIds: ['b', 'c'] }] }] }, 'v').map(i => i.message);
  assert.ok(box.includes('view v: families "x" and "y" overlap'), box.join('\n'));
});

test('audit 4: validate() says what a map view draws wrongly: a card listed twice, a card in two sibling boxes, a box with no cards, a box with a card\'s id', () => {
  const N = ids => ids.map(id => ({ id })), said = m => validate(m).map(p => `${p.level} ${p.path}: ${p.message}`);
  assert.deepEqual(said({ nodes: N(['a', 'b']), views: [{ id: 'v', nodeIds: ['a', 'a', 'b'] }] }), ['warning views[0].nodeIds[1]: "a" is listed twice: drawn twice']);
  assert.deepEqual(said({ nodes: N(['a', 'b']), edges: [{ from: 'a', to: 'x' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'x', nodeIds: [] }] }] }),
    ['warning views[0].containers[0]: box "x" holds no cards: it is not drawn, nor its lines']);
  assert.deepEqual(said({ nodes: N(['a', 'b', 'c']), views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], containers: [{ id: 'x', nodeIds: ['a', 'b'] }, { id: 'y', nodeIds: ['b', 'c'] }] }] }),
    ['warning views[0].containers[1].nodeIds[0]: "b" is in box "x" too, and neither box holds the other: they overlap']);
  // a card in a box and in a box inside it, or a box holding only a box with cards: fine
  assert.deepEqual(said({ nodes: N(['a', 'b']), views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'x', nodeIds: ['a'] }, { id: 'y', parent: 'x', nodeIds: ['a'] }, { id: 'z', nodeIds: [] }, { id: 'w', parent: 'z', nodeIds: ['b'] }] }] }), []);
  assert.deepEqual(said({ nodes: N(['web', 'pay', 'pay-api']), views: [{ id: 'v', nodeIds: ['web', 'pay', 'pay-api'], containers: [{ id: 'pay', nodeIds: ['pay-api'] }] }] }),
    ['error views[0].containers[0].id: box id "pay" is one of the view\'s cards']);
});

test('a labelled line whose label finds no spot is said by check(), on a map or a typed view; a numbered view\'s label gets the room it needs (audit 6)', () => {
  const A = { id: 'a', label: 'A' }, B = { id: 'b', label: 'B' }, line = x => ({ from: 'a', to: 'b', s: A, t: B, pts: [[0, 0], [10, 0]], lbl: null, ...x });
  for (const map of [true, false]) assert.deepEqual(leaveIssues({ map, nodes: [A, B], edges: [line({ label: 'pays' }), line({ step: 2 }), line({ step: 1, fixed: true }), line({})] }, 'view v'),
    ['view v: label "pays" has no room on edge A→B: not drawn', 'view v: step 2 has no room on edge A→B: not drawn']); // a comb line's step is on its card
  // weather's nightly run (a numbered view): "pushes warnings", between two cards of one lane 54 px apart, was left off
  const w = read('../examples/weather.json'), g = layout(w, 'forecaster');
  assert.deepEqual(g.edges.filter(e => e.label && !e.lbl).map(e => e.label), []);
  assert.deepEqual(check(w, 'forecaster'), []);
});

test('examples/layout.mjs reports a model with no title (optional in MapModel) by its file name, not a TypeError (audit 17)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'layout-mjs-')), p = join(dir, 'untitled.json');
  try {
    writeFileSync(p, JSON.stringify({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'main', nodeIds: ['a', 'b'] }] }));
    assert.deepEqual(validate(JSON.parse(readFileSync(p, 'utf8'))), []);
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../examples/layout.mjs', import.meta.url)), p], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^untitled\.json\s+main\s+2 cards\s+1 lines/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('examples/layout.mjs refuses a --max that is no number of at least 1, so a CI step with a typo fails, not passes (audit 18)', () => {
  const run = (...a) => spawnSync(process.execPath, [fileURLToPath(new URL('../examples/layout.mjs', import.meta.url)), ...a], { encoding: 'utf8' });
  const weather = fileURLToPath(new URL('../examples/weather.json', import.meta.url));
  for (const bad of [['--max', 'x2', weather], ['--max', '', weather], ['--max', '0.5', weather], ['--max', weather], ['--max=x', weather], [weather, '--max']]) {
    const r = run(...bad);
    assert.equal(r.status, 2, bad.join(' '));
    assert.match(r.stderr, /^--max takes a number of at least 1/, bad.join(' '));
  }
  assert.equal(run('--max', '1', weather).status, 1);   // weather's longest line runs about 1.3 times its direct route
  assert.equal(run('--max=1', weather).status, 1);
  assert.equal(run('--max', '3', weather).status, 0);
});

// audit 25: a text's widest line was Math.max(...lines): every line one argument, and a box title, a card's name or a typed
// line's label broken on some 120,000 lines (a file under 1 MiB) threw a RangeError from layout() and check(). Now a loop
test('audit 25: a name or line label broken on 200,000 lines lays out and is checked, in every family', async () => {
  const L = await import('../lib/umlimator-all.js'), many = 'P' + '\n'.repeat(200000) + 'Q';
  const kinds = [['uml.package', 'uml.Package'], ['uml.class', 'uml.Class'], ['er', 'er.Entity'], ['flowchart', 'flowchart.Process'], ['mindmap', 'mindmap.Topic'],
    ['uml.state-machine', 'uml.State'], ['uml.sequence', 'uml.Lifeline'], ['sysml.requirement', 'sysml.Requirement']];
  for (const [d, T] of kinds) {
    const m = { schemaVersion: 2, nodes: [{ id: 'p', type: T, label: many }, { id: 'c', type: T, label: 'C' }], views: [{ id: 'v', diagram: d, nodeIds: ['p', 'c'] }] };
    assert.ok(L.layout(m, 'v').nodes.length >= 1, d); assert.ok(Array.isArray(L.check(m, 'v')), d);
  }
  // a package holding a class: the box's title; a typed line's label; a map card and line
  const box = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package', label: many }, { id: 'c', type: 'uml.Class', label: 'C', parent: 'p' }], views: [{ id: 'v', diagram: 'uml.package', nodeIds: ['p', 'c'] }] };
  assert.equal(L.layout(box, 'v').nodes.length, 1); assert.ok(Array.isArray(L.check(box, 'v')));
  const line = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }],
    edges: [{ id: 'e', type: 'uml.Association', from: 'a', to: 'b', label: many, props: { ends: { from: { role: many }, to: { mult: many } } } }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] };
  assert.equal(L.layout(line, 'v').edges.length, 1); assert.ok(Array.isArray(L.check(line, 'v')));
  const map = { nodes: [{ id: 'a', label: many }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: many }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'g', label: many, nodeIds: ['a'] }] }] };
  assert.equal(L.layout(map, 'v').nodes.length, 2); assert.ok(Array.isArray(L.check(map, 'v')));
  // the width is still the widest line's
  const two = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Class', label: 'P\n' + 'W'.repeat(30) }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['p'] }] };
  const one = { schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Class', label: 'W'.repeat(30) }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['p'] }] };
  assert.equal(L.layout(two, 'v').nodes[0].w, L.layout(one, 'v').nodes[0].w);
});

// audit 25: a card's details cut in two at a space pushed every space as an argument (a spread) and counted the backticks
// before each one again: a body of 150,000 words threw, and a long one took seconds
test('audit 25: a card\'s details of 150,000 words are cut into points, quickly', async () => {
  const { detailBullets } = await import('../src/canvas/pieces.js');
  const t = Date.now(), out = detailBullets('word '.repeat(150000));
  assert.ok(out.length >= 2); assert.ok(Date.now() - t < 2000, `${Date.now() - t} ms`);
  assert.deepEqual(detailBullets('A short one. And `a b` then c.'), ['A short one.', 'And `a b` then c.']);
});

// audit 25: a map view whose box shares the id of a card it holds (validate's error) overflowed the stack in blockPos: the
// box 'a' was read as the card 'a' again, for ever. It lays out, as every other invalid view does
test('audit 25: a map box with the id of a card it holds lays out', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', kind: 'service', label: 'A' }, { id: 'b', kind: 'service', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'a', label: 'Box', nodeIds: ['a'] }] }] };
  assert.ok(validate(m).some(p => p.level === 'error' && /box id "a" is one of the view's cards/.test(p.message)));
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(layout(m, 'v').nodes.length, 2);
    const nest = structuredClone(m); nest.views[0].containers = [{ id: 'g', label: 'G', nodeIds: ['a'] }, { id: 'a', label: 'In', nodeIds: ['a', 'b'], parent: 'g' }];
    assert.equal(layout(nest, 'v').nodes.length, 2);
    const both = structuredClone(m); both.views[0].containers.push({ id: 'b', label: 'B box', nodeIds: ['b'], parent: 'a' });
    assert.equal(layout(both, 'v').nodes.length, 2);
  } finally { console.warn = warn; }
});

// audit 26: wrap2() measured both halves at every word of a text and fit() shrank one character at a time, so drawing a map
// card whose 'what' (its sub-line) or name ran to some thousands of characters measured text quadratic in its length: 16,000
// characters froze render() for seconds. Now each cut is searched for, in a few measures of the text
const longCards = n => { const long = 'word '.repeat(n / 5).trim();
  return [{ nodes: [{ id: 'a', label: 'A', kind: 'service', what: long }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] },
    { nodes: [{ id: 'a', label: long, kind: 'service' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }]; };
test('audit 26: a card whose what or name runs to 16,000 characters is drawn measuring its text a few times, not once per word', () => {
  let chars = 0; const measure = (s, px) => { chars += s.length; return s.length * px * .55; };
  for (const [k, m] of longCards(16000).entries()) { chars = 0;
    const out = mapContext(m, { measure }).buildView('v').markup; assert.match(out, /word word/, `#${k}: the text drawn, cut`);
    assert.ok(chars < 100 * 16000, `#${k}: ${chars} characters measured`); }
  // the cut is where it was: a sub-line on two lines at the word where the wider line is narrowest, a name cut between words
  const lines = (label, what) => mapContext({ nodes: [{ id: 'a', label, kind: 'service', what }], views: [{ id: 'v', nodeIds: ['a'] }] }, { measure }).buildView('v').markup.match(/<tspan[^>]*>[^<]*<\/tspan>/g);
  assert.deepEqual(lines('Order and invoice service for shops', 'Reads the orders and writes the invoices for every shop'), ['<tspan x="54">Reads the orders and writes</tspan>', '<tspan x="54" dy="12">the invoices for every shop</tspan>']);
  assert.deepEqual(lines('Order and invoice service for every shop in the whole land of shops'), ['<tspan x="54">Order and invoice service for every</tspan>', '<tspan x="54" dy="15">shop in the whole land of shops</tspan>']);
  assert.equal(fit('alpha beta gamma delta', 10, 80, true), 'alpha beta…'); assert.equal(fit('ab', 10, 5), 'ab…');
});
test('audit 26: a card whose what or name runs to 40,000 characters is drawn in well under a second, in a measurer that reads every character (timed)', () => {
  const measure = (s, px) => { let w = 0; for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) === 32 ? .28 * px : .55 * px; return w; }; // as a canvas does: each character read
  for (const [k, m] of longCards(40000).entries()) { const t = performance.now(); mapContext(m, { measure }).buildView('v');
    const ms = performance.now() - t; assert.ok(ms < 1000, `#${k}: ${Math.round(ms)} ms`); }
});

test('audit 28: a line whose fromSide or toSide is named like an Object.prototype key is laid out as one with no side, as validate() says', () => {
  const at = (k, side) => ({ nodes: [{ id: 'a', kind: 'service', label: 'A' }, { id: 'b', kind: 'service', label: 'B' }, { id: 'c', kind: 'service', label: 'C' }],
    edges: [{ from: 'a', to: 'b', ...(side == null ? {} : { [k]: side }) }, { from: 'b', to: 'c', ...(side == null ? {} : { [k]: side }) }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] });
  const none = { from: layout(at('fromSide'), 'v').edges.map(e => e.pts), to: layout(at('toSide'), 'v').edges.map(e => e.pts) };
  for (const side of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'bogus']) for (const k of ['fromSide', 'toSide']) {
    const m = at(k, side);
    assert.match(validate(m).map(p => p.message).join(' | '), /is not left, right, top or bottom: ignored/, `${k} ${side}`);
    assert.deepEqual(layout(m, 'v').edges.map(e => e.pts), none[k === 'fromSide' ? 'from' : 'to'], `${k} ${side}`);
    assert.doesNotThrow(() => check(m, 'v'), `${k} ${side}`); }
  // a real side still holds
  assert.notDeepEqual(layout(at('toSide', 'top'), 'v').edges.map(e => e.pts), none.to);
});

// a box (family) over a card it does not hold, by the cards each box lists and the boxes in it
const foreignUnder = (m, vid, g) => { const fs = g.families || [], out = [];
  const holds = (b, id, k = 0) => k <= fs.length && ((b.nodeIds || []).includes(id) || fs.some(c => c.parent === b.id && holds(c, id, k + 1)));
  fs.forEach(f => g.nodes.forEach(n => { if (n.id !== f.id && !holds(f, n.id) && n.x < f.x + f.w - 1 && f.x < n.x + n.w - 1 && n.y < f.y + f.h - 1 && f.y < n.y + n.h - 1) out.push(`${f.id} over ${n.id}`); }));
  return out; };
test('audit 41: a card with no pin in a pinned view goes by its box\'s pinned cards: no box grows over a card it does not hold, and no line to the box is dropped', async () => {
  const U = await import('../lib/umlimator-all.js'), warns = [], keep = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  try {
    // edit.html's own add-in-box: a new card in each box of each bike-share view (the rider shop's checkout among them), with no pin
    const shop = read('../examples/bike-share.json');
    for (const v0 of shop.views) for (const c of v0.containers || []) { const m = structuredClone(shop), v = m.views.find(x => x.id === v0.id);
      m.nodes.push({ id: 'new-1', label: 'New card', kind: 'backend' }); v.nodeIds.push('new-1'); v.containers.find(x => x.id === c.id).nodeIds.push('new-1');
      const g = U.layout(m, v.id); assert.deepEqual(foreignUnder(m, v.id, g), [], `${v.id}: new card in ${c.id}`);
      assert.ok(!U.check(m, v.id).some(p => / lies over /.test(p.message)), `${v.id}: ${c.id}`); }
    // each pin of each example view with boxes taken out in turn
    for (const f of ['bike-share.json', 'bookshop-atlas.json', 'states.json']) { const base = read('../examples/' + f);
      for (const v of base.views) if (v && v.layout && (U.layout(base, v.id).families || []).length) for (const k of Object.keys(v.layout)) {
        const m = structuredClone(base); delete m.views.find(x => x.id === v.id).layout[k]; warns.length = 0;
        const g = U.layout(m, v.id); assert.deepEqual(foreignUnder(m, v.id, g), [], `${f} ${v.id} with no pin for ${k}`);
        assert.ok(!warns.some(w => /something inside it/.test(w)), `${f} ${v.id} with no pin for ${k}: ${warns}`); } }
    // bike-share's system view with pricing unpinned: the line from monitoring to box rides is drawn
    const bike = read('../examples/bike-share.json'); delete bike.views.find(v => v.id === 'system').layout.pricing;
    assert.ok(U.layout(bike, 'system').edges.some(e => (e.all || [e]).some(x => x._id === 's16')));
    // hostile boxes: a parent cycle, a card listed by two boxes, a box that lists itself, pins that are no places: laid out, no throw, soon
    const t0 = performance.now(), hm = { nodes: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: id, kind: 'service' })), edges: [{ from: 'a', to: 'b' }, { from: 'c', to: 'p' }],
      views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd', 'e'], layout: { a: [0, 0], b: ['x', 1], c: [1e308, 0], d: null },
        containers: [{ id: 'p', nodeIds: ['a', 'e', 'p'], parent: 'q' }, { id: 'q', nodeIds: ['a', 'b'], parent: 'p' }, { id: '__proto__', nodeIds: ['d'] }] }] };
    assert.doesNotThrow(() => { U.layout(hm, 'v'); U.check(hm, 'v'); }); assert.ok(performance.now() - t0 < 5000);
  } finally { console.warn = keep; }
});
test('audit 41: a box and something inside it is decided by what the box holds, not where it lies; check() says a box lies over a card it does not hold', async () => {
  const { routeAudit } = await import('../src/layout/audit.js'), warns = [], keep = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  try {
    // pinned so: box holds a and b, and c sits between them; the line from c to the box is drawn, and check() names the overlap
    const m = { nodes: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id.toUpperCase(), kind: 'service' })), edges: [{ id: 'c-box', from: 'c', to: 'box' }, { id: 'a-b', from: 'a', to: 'b' }, { id: 'd-c', from: 'd', to: 'c' }],
      views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'], containers: [{ id: 'box', label: 'Box', nodeIds: ['a', 'b'] }], layout: { a: [1, 0], c: [1, 1], b: [1, 2], d: [0, 1] } }] };
    assert.ok(layout(m, 'v').edges.some(e => e._id === 'c-box'), warns.join(' '));
    assert.ok(!warns.some(w => /something inside it/.test(w)));
    assert.ok(check(m, 'v').some(p => p.message === 'view v: family "Box" lies over "C", which it does not hold'));
    // a line from a box to its own card, or a box in it, is still no line
    const own = structuredClone(m); own.edges.push({ id: 'box-a', from: 'box', to: 'a' }); own.views[0].containers.push({ id: 'in', label: 'In', nodeIds: [], parent: 'box' });
    warns.length = 0; assert.ok(!layout(own, 'v').edges.some(e => e._id === 'box-a')); assert.ok(warns.some(w => /box-a: it joins the box "box"/.test(w)));
    // routeAudit on its own: a family over a card it holds through a family in it, a port, a frame and its own card say nothing
    const geo = cards => ({ edges: [], byId: {}, nodes: cards, families: [{ id: 'f', label: 'F', x: 0, y: 0, w: 400, h: 300, nodeIds: ['a', 'f'] }, { id: 'g', label: 'G', parent: 'f', x: 10, y: 150, w: 200, h: 100, nodeIds: ['b'] }] });
    const card = (id, x, y, more) => ({ id, label: id, x, y, w: 80, h: 40, ...more });
    assert.deepEqual(routeAudit(geo([card('a', 20, 40), card('b', 20, 180), card('f', 300, 40), card('p', 380, 40, { owner: 'a' }), card('h', 200, 40, { holder: true })]), 'v'), []);
    assert.deepEqual(routeAudit(geo([card('a', 20, 40), card('c', 200, 40), card('d', 30, 200)]), 'v'), ['v: family "F" lies over "c", which it does not hold', 'v: family "F" lies over "d", which it does not hold', 'v: family "G" lies over "d", which it does not hold']);
    // a parent cycle and an id from Object.prototype: no throw
    assert.doesNotThrow(() => routeAudit({ edges: [], byId: {}, nodes: [card('x', 0, 0)], families: [{ id: 'constructor', parent: '__proto__', x: 0, y: 0, w: 99, h: 99 }, { id: '__proto__', parent: 'constructor', x: 0, y: 0, w: 99, h: 99 }] }, 'v'));
  } finally { console.warn = keep; }
});
test('audit 42: a box keeps clear of a card half a row from it, on an auto layout and a pinned one', () => {
  const issues = (m, v = 'v') => check(m, v).map(p => p.message).filter(s => / lies over |families .* overlap/.test(s));
  // no pins: the box's room went after the whole row, moving the card on the half row above with the box, and the box's top ran 6 px into it
  const m = { nodes: [['n0', 'Card n0 xxxx', 'db'], ['n1', 'Card n1 ', 'db'], ['n2', 'Card n2 ', 'board'], ['n3', 'Card n3 xxx', 'queue'], ['n4', 'Card n4 x', 'board'], ['n5', 'Card n5 ', 'db'],
    ['n6', 'Card n6 xxxxxxxxx', 'service'], ['n7', 'Card n7 xxxxxx', 'agent'], ['n8', 'Card n8 xxxxxxx', 'board'], ['n9', 'Card n9 xxxxx', 'agent'], ['n10', 'Card n10 xxxxxxxxxxxxx', 'service']].map(([id, label, kind]) => ({ id, label, kind })),
    edges: [['n5', 'n3'], ['n7', 'n3'], ['n4', 'n9'], ['n2', 'n5'], ['n1', 'n2'], ['n10', 'n1'], ['n2', 'n8'], ['n5', 'n10'], ['n10', 'n9'], ['n7', 'n6'], ['n7', 'n3'], ['n7', 'n0']].map(([from, to], k) => ({ id: 'e' + k, from, to })),
    views: [{ id: 'v', nodeIds: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10'], containers: [{ id: 'A', label: 'Box A wwwwwwwwwwwww', nodeIds: ['n1'] }, { id: 'B', label: 'Box B', nodeIds: ['n2', 'n8'] }] }] };
  const g = layout(m, 'v'), A = g.families.find(f => f.id === 'A'), n4 = g.nodes.find(n => n.id === 'n4');
  assert.ok(n4.y + n4.h + 32 <= A.y, `box A at ${A.y}, card n4 ends at ${n4.y + n4.h}`); assert.deepEqual(issues(m), []);
  // pinned: box X's cards on row .5, box Y's on rows 1 and 1.5 (c with no pin goes beside d)
  const h = { nodes: ['a', 'b', 'c', 'd'].map(id => ({ id, label: 'Card ' + id })), edges: [],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'], containers: [{ id: 'bx', label: 'Box X', nodeIds: ['a', 'b'] }, { id: 'by', label: 'Box Y', nodeIds: ['c', 'd'] }], layout: { a: [0, 0.5], b: [2, 0.5], d: [3, 1] } }] };
  assert.deepEqual(issues(h), []);
});
test('audit 42: a card with no pin in no box, or the first placed of its box, goes clear of the other boxes', () => {
  const issues = (m, v, re = / lies over |families .* overlap/) => check(m, v).map(p => p.message).filter(s => re.test(s));
  // bike-share's system view: a card in no box, with a line from Riders, as a host adds one
  const bike = read('../examples/bike-share.json'), sys = bike.views.find(v => v.id === 'system');
  bike.nodes.push({ id: 'free', label: 'Free card', kind: 'service' }); sys.nodeIds.push('free'); bike.edges.push({ id: 'fe', from: 'riders', to: 'free' });
  assert.deepEqual(issues(bike, 'system'), []);
  // monorepo's boxed view with one card dragged: packages/ui's charts is placed before any card of its box
  const mono = read('../examples/monorepo.json'); mono.views.find(v => v.id === 'boxed').layout = { 'apps/web': [5, 1] };
  assert.deepEqual(issues(mono, 'boxed'), []);
  // a box in a box: outer's b and e, which is in no box, have no pin
  const nested = { nodes: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: 'Card ' + id })), edges: [{ id: 'e1', from: 'a', to: 'c' }, { id: 'e2', from: 'b', to: 'e' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd', 'e'], containers: [{ id: 'outer', label: 'Outer', nodeIds: ['a', 'b'] }, { id: 'inner', label: 'Inner', parent: 'outer', nodeIds: ['c'] }], layout: { a: [0, 0], c: [2, 0] } }] };
  assert.deepEqual(issues(nested, 'v'), []);
});
test('audit 42: a card boxFit moves keeps its lines left to right where a slot does', () => {
  const issues = (m, v, re) => check(m, v).map(p => p.message).filter(s => re.test(s));
  // the rider shop's checkout with queue's pin taken out: queue goes left of the worker it feeds, not under it
  const shop = read('../examples/bike-share.json'); delete shop.views.find(v => v.id === 'checkout').layout.queue;
  const g = layout(shop, 'checkout'), at = id => g.nodes.find(n => n.id === id);
  assert.ok(at('queue').x + at('queue').w < at('worker').x); assert.deepEqual(issues(shop, 'checkout', /right-to-left| lies over /), []);
  // bike-share: a card added to box apps with a line from Rider app goes where that line takes no detour round Ops console
  const b2 = read('../examples/bike-share.json'), s2 = b2.views.find(v => v.id === 'system');
  b2.nodes.push({ id: 'new0', label: 'New card 0', kind: 'service' }); s2.nodeIds.push('new0'); s2.containers.find(c => c.id === 'apps').nodeIds.push('new0'); b2.edges.push({ id: 'ne0', from: 'rider-app', to: 'new0' });
  assert.deepEqual(issues(b2, 'system', /detour| lies over /), []);
});
test('audit 43: a card with no pin whose clean auto-layout slot runs its lines back goes where they run ahead, with or without boxes', () => {
  const back = (m, v) => check(m, v).map(p => p.message).filter(s => /right-to-left/.test(s));
  // each pin of the rider shop's checkout (Orders box) and assistant's answer (no boxes) dropped in turn: no line runs back
  for (const [f, vid] of [['bike-share', 'checkout'], ['assistant', 'answer']]) {
    const m = read(`../examples/${f}.json`), pins = Object.keys(m.views.find(v => v.id === vid).layout);
    for (const id of pins) { const b = structuredClone(m); delete b.views.find(v => v.id === vid).layout[id]; assert.deepEqual(back(b, vid), [], `${f} ${vid} without ${id}`); }
  }
  // hostile: a chain pinned right to left at every other card; the cards between still get a slot each, quickly
  const N = 40, h = { nodes: Array.from({ length: N }, (_, i) => ({ id: 'n' + i, label: 'n' + i })), edges: Array.from({ length: N - 1 }, (_, i) => ({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) })),
    views: [{ id: 'v', nodeIds: Array.from({ length: N }, (_, i) => 'n' + i), layout: Object.fromEntries(Array.from({ length: N / 2 }, (_, k) => ['n' + 2 * k, [N - 2 * k, 0]])) }] };
  const g = layout(h, 'v'); assert.equal(new Set(g.nodes.map(n => n.x + ',' + n.y)).size, N);
});
