// The mindmap type, mindmap (work package 4a.4, notes/milestone-4a.md §7), in Node on the sources: its definition,
// examples/bookshop-opening-plan.json (target 25) laid out clean (no overlap, text in its topic, no branch curve through a topic,
// sampled every 4 px) with its names, reading order and describe(), the edge cases of §10.1 drawn clean, the branch
// colours and their contrast in both themes, each validator with a passing and a failing model, every gesture hook's
// commands through apply() (N, F2, Alt + arrows, drops, Delete, Shift + Delete, the outline's Show, L refused), a
// 30-step session undone, redone and reopened, the PDF's rows, Shift + Delete down a 20,000-topic chain, and §11's
// budgets. tests/mindmap.html draws it in Chrome and edits it by pointer and keyboard. Imports src/ to reach the
// internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { textW } from '../src/core/text.js';
import '../src/map/typed.js';
import { layout } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { MM_TYPE, MM_INK, mmProblems, mmAdd, mmMoveTo, mmRemove, mmRename, mmConnect, mmShow } from '../src/mindmap/mindmap.js';

const EX = () => JSON.parse(readFileSync(new URL('../examples/bookshop-opening-plan.json', import.meta.url), 'utf8'));
const V = m => m.views[0], VID = 'mm-plan', T = 'mindmap.Topic';
const errors = m => validate(m).filter(p => p.level === 'error');
const rules = m => mmProblems(m, V(m)).map(p => [p.level, p.rule, p.ids]);
const cmdsOf = r => (r && Array.isArray(r.commands) ? r.commands : r);
const run = (m, r) => { const c = cmdsOf(r); assert.ok(Array.isArray(c) && c.length, JSON.stringify(r)); const n = apply(m, c); assert.deepEqual(errors(n), []); return n; };
const node = (m, id) => m.nodes.find(n => n.id === id);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (b, B, k = .5) => b.x >= B.x - k && b.y >= B.y - k && b.x + b.w <= B.x + B.w + k && b.y + b.h <= B.y + B.h + k;
const ENTRY = MM_TYPE.elements[0];
// the children of a topic as drawn: in nodeIds order, among the shown topics whose parent it is
const kids = (m, id) => V(m).nodeIds.filter(k => node(m, k) && node(m, k).parent === id);

/* §10.1's predicate on the type's geometry: no two topics meet, each topic's text inside it (four lines at most, each
   200 px at most, padding kept), every topic in the bounds, no branch curve through a topic but at its two ends (sampled
   every 4 px), and no layout problem */
function unclean(g, { problems = true } = {}) {
  const bad = problems ? g.problems.map(p => p.message) : [];
  g.nodes.forEach((n, i) => {
    if (!within(n, g.bounds)) bad.push(`${n.id} out of the bounds`);
    g.nodes.slice(0, i).forEach(o => { if (meets(n, o)) bad.push(`${n.id} meets ${o.id}`); });
    const px = n.root ? 15 : 13, pad = n.root ? 14 : 10;
    if (n.lines.length > 4 || n.lines.some(l => textW(l, px) > 200.5) || n.tw + 2 * pad > n.w + .5) bad.push(`${n.id}'s text overflows`); });
  g.mm.links.forEach(l => { const [a, b] = l.p1, [c, e] = l.p2, x = (a + c) / 2, k = Math.max(2, Math.ceil((Math.abs(c - a) + Math.abs(e - b)) / 4));
    for (let i = 1; i < k; i++) { const t = i / k, u = 1 - t, X = u * u * u * a + 3 * u * u * t * x + 3 * u * t * t * x + t * t * t * c, Y = u * u * u * b + 3 * u * u * t * b + 3 * u * t * t * e + t * t * t * e;
      g.nodes.forEach(n => { if (X > n.x + .5 && X < n.x + n.w - .5 && Y > n.y + .5 && Y < n.y + n.h - .5) bad.push(`${l.from} to ${l.to} runs through ${n.id}`); }); } });
  return [...new Set(bad)];
}

test('the definition: the palette\'s Topic, no lines, a layout of its own with no pins, draw, the hooks, §7.2\'s rules, the PDF\'s word', () => {
  const D = diagramOf({ diagram: 'mindmap' });
  assert.equal(D, MM_TYPE);
  assert.deepEqual(D.elements, [{ type: T, label: 'Topic' }]);
  assert.deepEqual(D.lines, []);
  assert.deepEqual([typeof D.layout.run, D.layout.pins, typeof D.draw, typeof D.describe, typeof D.rows, D.word(null, 'x')], ['function', false, 'function', 'function', 'function', 'Topic']);
  assert.deepEqual(Object.keys(D.edits), ['connect', 'moveTo', 'add', 'remove', 'rename']);
  assert.deepEqual(Object.keys(D.rules), ['mindmap-root', 'topic-parent', 'side-first', 'mindmap-depth']);
});

test('the mindmap example lays out clean: 22 topics, the root at (0, 0), three branches right and three left as pinned, children in nodeIds order, a curve per topic, no problem', () => {
  const m = EX(), g = layout(m, VID);
  assert.deepEqual(validate(m), []);
  assert.deepEqual(unclean(g), []);
  assert.equal(g.nodes.length, 22); assert.deepEqual(g.edges, []); assert.equal(g.mm.links.length, 21);
  assert.deepEqual([g.byId['mm-opening'].x, g.byId['mm-opening'].y, g.byId['mm-opening'].root], [0, 0, true]);
  const first = g.nodes.filter(n => n.depth === 1);
  assert.deepEqual(first.map(n => [n.id, n.side]), [['mm-catalogue', 'right'], ['mm-website', 'right'], ['mm-launch', 'right'], ['mm-warehouse', 'left'], ['mm-legal', 'left'], ['mm-hosting', 'left']]);
  first.forEach(n => assert.ok(n.side === 'right' ? n.x > g.byId['mm-opening'].x + g.byId['mm-opening'].w : n.x + n.w < 0, n.id));
  // siblings top to bottom in nodeIds order; a parent centred on its children
  const ys = ids => ids.map(id => g.byId[id].y);
  for (const p of ['mm-catalogue', 'mm-website', 'mm-checkout', 'mm-legal']) { const k = kids(m, p), y = ys(k); assert.deepEqual(y, [...y].sort((a, b) => a - b), p);
    const c = n => n.y + n.h / 2, lo = c(g.byId[k[0]]), hi = c(g.byId[k.at(-1)]); assert.ok(Math.abs(c(g.byId[p]) - (lo + hi) / 2) < 30, p); }
  // each first-level branch in a colour of the kind palette, its topics and curves with it; the root in the text's
  assert.deepEqual(first.map(n => n.ink), MM_INK);
  assert.ok(g.nodes.every(n => (n.root ? n.ink === null : n.ink === g.byId[n.branch].ink)));
  assert.ok(g.mm.links.every(l => l.ink === g.byId[l.to].ink && l.first === (g.byId[l.to].depth === 1)));
});

test('the picture: branches as curves in the under layer, 2.5 px from the root and 1.5 px below, each in its branch\'s colour; topics drawn in their branch\'s colour; laid out twice from one memo, the same markup', () => {
  const m = EX(), memos = {}, draw = () => mapContext(m, { memos }).buildView(VID).markup.replace(/\bg\d+-/g, 'g-'), a = draw();
  assert.equal(a, draw());
  const curves = [...a.matchAll(/<path class="mm-branch" d="M[^"]*C[^"]*" fill="none" stroke="var\(--um-k-(\w+)\)" stroke-width="([\d.]+)"/g)];
  assert.equal(curves.length, 21);
  assert.equal(curves.filter(c => c[2] === '2.5').length, 6); assert.equal(curves.filter(c => c[2] === '1.5').length, 15);
  assert.ok(a.indexOf('class="mm-under"') < a.indexOf('class="nodes"'), 'under the topics');
  assert.match(a, /<g class="node mm-topic" data-id="mm-checkout"[^>]*aria-label="Topic Checkout, under Website, 2 subtopics"><title>Checkout<\/title><rect[^>]*class="n-mask"\/><rect[^>]*class="n-body" fill="transparent" stroke="var\(--um-k-lane\)"/);
  assert.match(a, /<g class="node mm-topic mm-root" data-id="mm-opening"[^>]*><title>[^<]*<\/title><rect[^>]*\/><rect[^>]*stroke="var\(--um-text\)" stroke-width="2"/);
  assert.match(a, /class="n-label mm-text" fill="var\(--um-text\)" style="font:600 15px var\(--um-sans\)"[^>]*><tspan[^>]*>Opening the bookshop<\/tspan>/);
  // a long topic wraps to two lines of 200 px at most, each its own tspan
  assert.match(a, /data-id="mm-first-titles"[^]*?<tspan[^>]*>Choose the first 500<\/tspan><tspan[^>]*>titles<\/tspan>/);
});

test('names (A1), reading order (the root, its right branches, then its left, each in pre-order), describe() as that outline, the PDF\'s rows', () => {
  const m = EX(), g = layout(m, VID);
  assert.equal(g.byId['mm-opening'].aria, 'Topic Opening the bookshop, the root, 6 subtopics');
  assert.equal(g.byId['mm-checkout'].aria, 'Topic Checkout, under Website, 2 subtopics');
  assert.equal(g.byId['mm-card-payments'].aria, 'Topic Card payments, under Checkout');
  assert.deepEqual(g.order, V(m).nodeIds, 'the example lists its right branches first, in pre-order');
  const L = apply(m, [{ op: 'set', view: VID, path: ['present', 'mm-catalogue', 'side'], value: 'left' }]), o = layout(L, VID).order;
  assert.deepEqual(o.slice(0, 9), ['mm-opening', 'mm-website', 'mm-storefront', 'mm-checkout', 'mm-card-payments', 'mm-order-emails', 'mm-launch', 'mm-newsletter', 'mm-opening-offer']);
  assert.deepEqual(o.slice(9, 12), ['mm-catalogue', 'mm-first-titles', 'mm-wholesalers'], 'a branch moved left reads after the right ones');
  assert.equal(describe(m, VID).split('\n').slice(0, 6).join('\n'), ['Opening the bookshop: a mindmap of 22 topics.', 'Opening the bookshop', '  Catalogue', '    Choose the first 500 titles', '    Agree terms with two wholesalers', '  Website'].join('\n'));
  assert.equal(describe(m, VID).split('\n').length, 23);
  // a topic that opens a view says so, and carries the drill-down mark
  const op = apply(m, [{ op: 'addView', view: { id: 'gcp', diagram: 'uml.class', title: 'On Google Cloud', nodeIds: [] } }, { op: 'set', id: 'mm-on-gcp', path: 'opensView', value: 'gcp' }]);
  const go = layout(op, VID);
  assert.equal(go.byId['mm-on-gcp'].aria, 'Topic On Google Cloud, under Hosting, opens On Google Cloud');
  assert.ok(go.byId['mm-on-gcp'].w === g.byId['mm-on-gcp'].w + 26 && !unclean(go).length);
  assert.match(mapContext(op).buildView(VID).markup, /data-id="mm-on-gcp"[^]*?<g class="open-hint depth-read"><title>Open On Google Cloud/);
  assert.match(describe(op, VID), /^ {4}On Google Cloud \(opens On Google Cloud\)$/m);
  // the PDF: word Topic, rows its depth and its parent
  assert.deepEqual(MM_TYPE.rows(m, VID, 'mm-checkout'), ['Depth 2', 'Under Website']);
  assert.deepEqual(MM_TYPE.rows(m, VID, 'mm-opening'), ['Depth 0', 'The root']);
  assert.equal(MM_TYPE.rows(m, VID, 'nobody'), null);
  const ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V[VID], ctx.buildGeo(VID)), row = els.rows.find(r => r.includes('<b>Checkout</b>'));
  assert.match(row, /<td>Topic<\/td>/); assert.match(row, /<p>Depth 2<\/p><p>Under Website<\/p>/);
});

/* §10.1's edge cases, built here (4a.7 writes the fixture files): a branch of 30 children; every branch on one side; a
   200-character topic; a topic whose parent is hidden; two roots; a side on a second-level topic; a chain 70 deep; a
   topic whose parent is not a topic */
function edgeCases() {
  const nodes = [{ id: 'r', type: T, label: 'Root' }], ids = ['r'], add = (id, parent, label = id) => { nodes.push({ id, type: T, label, ...(parent ? { parent } : {}) }); ids.push(id); };
  ['a', 'b', 'c'].forEach(x => add(x, 'r', `Branch ${x}`));
  for (let i = 0; i < 30; i++) add(`a${i}`, 'a', `Child ${i}`);
  add('long', 'b', 'A topic of two hundred characters, which wraps to four lines of two hundred pixels and is cut with an ellipsis where it does not fit, so that its box never grows past the width the note sets for it, ever.'.padEnd(200, '.'));
  add('gone', 'b', 'Hidden'); add('orphan', 'gone', 'Its parent is hidden'); ids.splice(ids.indexOf('gone'), 1);
  add('second', null, 'A second root'); add('second-kid', 'second');
  let p = 'c'; for (let i = 1; i <= 70; i++) { add(`d${i}`, p, `Level ${i + 2}`); p = `d${i}`; }
  nodes.push({ id: 'note', type: 'uml.Comment', label: 'A note' }); add('stray', 'note', 'Its parent is a note');
  return { schemaVersion: 2, title: 'Edge cases', nodes, edges: [], views: [{ id: 'edge', diagram: 'mindmap', title: 'Edge cases', nodeIds: ids,
    present: { a: { side: 'right' }, b: { side: 'right' }, c: { side: 'right' }, a3: { side: 'left' } } }] };
}

test('§10.1\'s edge cases lay out clean: 30 children, every branch right, a 200-character topic in four lines, a hidden parent, two roots as two trees, a deep chain, a stray topic', () => {
  const m = edgeCases(), g = layout(m, 'edge');
  assert.deepEqual(unclean(g), []);
  assert.ok(g.nodes.filter(n => n.depth === 1).every(n => n.side === 'right'), 'every branch on one side');
  assert.equal(g.byId.a3.side, 'right', 'a side on a second-level topic is ignored');
  const L = g.byId.long; assert.equal(L.lines.length, 4); assert.ok(L.lines[3].endsWith('…') && L.w <= 220, L.lines);
  assert.equal(g.byId.orphan.parent, 'b', 'a topic whose parent is hidden hangs from its nearest shown ancestor');
  assert.equal(g.byId.d70.depth, 71);
  // the second root (and the stray topic, a root too: its parent is no topic) each drawn as its own tree, under the first
  const roots = g.nodes.filter(n => n.root).map(n => n.id), bottom = id => Math.max(...g.nodes.filter(n => n.root ? n.id === id : false).map(n => n.y));
  assert.deepEqual(roots, ['r', 'second', 'stray']);
  const tree = r => g.nodes.filter(n => n.id === r || n.branch && g.order.indexOf(n.id) > g.order.indexOf(r) && g.order.indexOf(n.id) < (g.order.indexOf(roots[roots.indexOf(r) + 1]) >>> 0));
  assert.ok(Math.max(...tree('r').map(n => n.y + n.h)) < g.byId.second.y && g.byId['second-kid'].y + g.byId['second-kid'].h < g.byId.stray.y, bottom('r'));
  assert.deepEqual(rules(m), [['error', 'topic-parent', ['stray']], ['warning', 'mindmap-root', ['r', 'second']], ['warning', 'mindmap-root', ['r', 'stray']],
    ['warning', 'side-first', ['a3']], ['warning', 'mindmap-depth', ['d63']]]);
  assert.match(describe(m, 'edge'), /^Edge cases: a mindmap of 109 topics in 3 trees\./);
});

test('the branch colours: the kind palette\'s six, cycled over first-level branches; each 3:1 or more against the stage and the panel, in both themes (DoD 8)', () => {
  const m = EX(); m.nodes.push({ id: 'mm-seventh', type: T, label: 'Seventh', parent: 'mm-opening' }); V(m).nodeIds.push('mm-seventh');
  assert.deepEqual(layout(m, VID).nodes.filter(n => n.depth === 1).map(n => n.ink), [...MM_INK, MM_INK[0]]);
  assert.deepEqual(MM_INK, ['public', 'lane', 'ext', 'verb', 'board', 'hook']);
  const cssText = readFileSync(new URL('../lib/umlimator-theme.css', import.meta.url), 'utf8');
  const block = start => { const i = cssText.indexOf(start); return cssText.slice(i, cssText.indexOf('}', i)); };
  const vars = b => Object.fromEntries([...b.matchAll(/--um-([\w-]+):\s*([^;]+);/g)].map(x => [x[1], x[2].trim()]));
  const light = vars(block(':root, umlimator-map[theme="light"] {')), dark = { ...light, ...vars(block(':root[data-theme="dark"]')) };
  const hex = (t, k) => { let v = t[k]; for (let i = 0; i < 4 && /^var\(--um-([\w-]+)\)$/.test(v); i++) v = t[v.match(/^var\(--um-([\w-]+)\)$/)[1]]; assert.match(v, /^#[0-9a-f]{6}$/i, k); return [1, 3, 5].map(j => parseInt(v.slice(j, j + 2), 16) / 255); };
  const lum = c => { const f = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [name, t] of [['light', light], ['dark', dark]]) for (const k of MM_INK) for (const bg of ['stage-bg', 'panel', 'mask']) {
    const r = ratio(hex(t, `k-${k}`), hex(t, bg)); assert.ok(r >= 3, `${name}: --um-k-${k} on --um-${bg} is ${r.toFixed(2)}:1`); }
});

test('validators: the example breaks no rule; each rule fails on a model that breaks it, naming its rule, its elements and its level', () => {
  assert.deepEqual(rules(EX()), []);
  const bad = (f, want) => { const m = EX(); f(m); assert.deepEqual(rules(m), want); assert.ok(validate(m).some(p => p.rule === want[0][1] && p.level === want[0][0])); };
  bad(m => { m.nodes.push({ id: 'note', type: 'uml.Comment', label: 'note' }); node(m, 'mm-bank').parent = 'note'; }, [['error', 'topic-parent', ['mm-bank']], ['warning', 'mindmap-root', ['mm-opening', 'mm-bank']]]);
  bad(m => { m.nodes.push({ id: 'x', type: T, label: 'Extra' }); V(m).nodeIds.push('x'); }, [['warning', 'mindmap-root', ['mm-opening', 'x']]]);
  bad(m => { V(m).present['mm-checkout'] = { side: 'left' }; }, [['warning', 'side-first', ['mm-checkout']]]);
  bad(m => { V(m).present['mm-catalogue'].side = 'up'; }, [['warning', 'side-first', ['mm-catalogue']]]);
  bad(m => { V(m).present['mm-opening'] = { side: 'left' }; }, [['warning', 'side-first', ['mm-opening']]]);
  bad(m => { let p = 'mm-bank'; for (let i = 0; i < 62; i++) { m.nodes.push({ id: `z${i}`, type: T, label: `z${i}`, parent: p }); V(m).nodeIds.push(`z${i}`); p = `z${i}`; } }, [['warning', 'mindmap-depth', ['z61']]]);
  // at 64 levels, no warning: the deepest topic one level up
  const ok = EX(); let p = 'mm-bank'; for (let i = 0; i < 61; i++) { ok.nodes.push({ id: `z${i}`, type: T, label: `z${i}`, parent: p }); V(ok).nodeIds.push(`z${i}`); p = `z${i}`; }
  assert.deepEqual(rules(ok), []);
  // a hidden topic's side, and a side on a topic of no view, say nothing; a hidden root's children are the view's root then
  const h = apply(EX(), { op: 'hide', id: 'mm-catalogue', view: VID }); assert.deepEqual(rules(h), []);
  const top = apply(EX(), { op: 'hide', id: 'mm-opening', view: VID });
  assert.deepEqual(rules(top).map(r => r[1]), ['mindmap-root', 'mindmap-root', 'mindmap-root', 'mindmap-root', 'mindmap-root', 'side-first', 'side-first', 'side-first', 'side-first', 'side-first', 'side-first']);
});

test('add (N, the palette): a child of the topic selected, after its parent\'s last shown descendant, its id from its words; the root when none is selected; a root when no topic is shown', () => {
  const m = EX(), V0 = V(m);
  assert.deepEqual(mmAdd(m, V0, ENTRY, 'Gift cards', { sel: ['mm-checkout'] }), [{ op: 'add', element: { id: 'gift-cards', type: T, label: 'Gift cards', parent: 'mm-checkout' }, view: VID, index: 9 }]);
  let n = run(m, mmAdd(m, V0, ENTRY, 'Gift cards', { sel: ['mm-checkout'] }));
  assert.deepEqual(kids(n, 'mm-checkout'), ['mm-card-payments', 'mm-order-emails', 'gift-cards']);
  n = run(n, mmAdd(n, V(n), ENTRY, 'Gift cards', { sel: [] }));
  assert.deepEqual([node(n, 'gift-cards-2').parent, V(n).nodeIds.at(-1)], ['mm-opening', 'gift-cards-2'], 'the root when none is selected; a second id from the same words');
  const empty = { schemaVersion: 2, nodes: [], edges: [], views: [{ id: 'e', diagram: 'mindmap', nodeIds: [] }] };
  assert.deepEqual(run(empty, mmAdd(empty, 'e', ENTRY, 'Plan', null)).nodes, [{ id: 'plan', type: T, label: 'Plan' }]);
  assert.ok(mmAdd(m, V0, ENTRY, '  ', { sel: [] }).error);
  assert.equal(mmAdd(m, V0, { type: 'uml.Comment' }, 'x', null), null);
});

test('rename (F2): the topic\'s text; an empty text refused; L refused, said', () => {
  const m = EX();
  assert.equal(node(run(m, mmRename(m, V(m), 'mm-checkout', ' Checkout and pay ')), 'mm-checkout').label, 'Checkout and pay');
  assert.ok(mmRename(m, V(m), 'mm-checkout', ' ').error);
  assert.equal(mmRename(m, V(m), 'nobody', 'x'), null);
  assert.equal(mmConnect(m, V(m), 'mm-checkout', 'mm-launch').error, 'A mindmap has no lines; drop a topic on another to move it');
});

test('Alt + arrows: up and down among its siblings; towards the root promotes, after its old parent; away demotes into the sibling before it; a first-level topic across the root changes side; the root says why it stays', () => {
  const m = EX(), V0 = V(m), mv = (id, by) => mmMoveTo(m, V0, id, { by });
  assert.deepEqual(mv('mm-catalogue', [0, 1]), [{ op: 'move', id: 'mm-catalogue', view: VID, index: 4 }]);
  assert.deepEqual(kids(run(m, mv('mm-catalogue', [0, 1])), 'mm-opening').slice(0, 3), ['mm-website', 'mm-catalogue', 'mm-launch']);
  assert.deepEqual(kids(run(m, mv('mm-order-emails', [0, -1])), 'mm-checkout'), ['mm-order-emails', 'mm-card-payments']);
  assert.deepEqual(mv('mm-catalogue', [0, -1]), [], 'the first stays first');
  assert.deepEqual(mv('mm-launch', [0, 1]), [], 'the last on its side stays last: the left side is not its');
  assert.deepEqual(mv('mm-catalogue', [-1, 0]), [{ op: 'set', view: VID, path: ['present', 'mm-catalogue', 'side'], value: 'left' }]);
  assert.deepEqual(mv('mm-legal', [1, 0]), [{ op: 'set', view: VID, path: ['present', 'mm-legal', 'side'], value: 'right' }], 'on the left, → is towards the root');
  assert.match(mv('mm-catalogue', [1, 0]).error, /No topic above Catalogue/);
  let n = run(m, mv('mm-website', [1, 0])); // demote: into Catalogue, last; its side goes
  assert.deepEqual([node(n, 'mm-website').parent, kids(n, 'mm-catalogue'), V(n).present['mm-website']], ['mm-catalogue', ['mm-first-titles', 'mm-wholesalers', 'mm-website'], {}]);
  assert.deepEqual(rules(n), []);
  n = run(m, mv('mm-checkout', [-1, 0])); // promote: under the root, after Website, on Website's side
  assert.deepEqual([node(n, 'mm-checkout').parent, kids(n, 'mm-opening').slice(0, 4), V(n).present['mm-checkout']], ['mm-opening', ['mm-catalogue', 'mm-website', 'mm-checkout', 'mm-launch'], { side: 'right' }]);
  n = run(m, mv('mm-card-payments', [-1, 0]));
  assert.deepEqual([node(n, 'mm-card-payments').parent, kids(n, 'mm-website')], ['mm-website', ['mm-storefront', 'mm-checkout', 'mm-card-payments']]);
  n = run(m, mv('mm-on-azure', [-1, 0])); assert.equal(node(n, 'mm-on-azure').parent, 'mm-on-gcp', 'on the left, ← is away from the root');
  assert.match(mv('mm-opening', [1, 0]).error, /Opening the bookshop is the root: it stays where it is/);
  assert.equal(mv('mm-catalogue', [1, 1]), null);
  // a first-level topic with no side given: the move sets the others' sides as drawn, so none swings across
  const u = EX(); V(u).present = {};
  const g = layout(u, VID), drawn = Object.fromEntries(g.nodes.filter(x => x.depth === 1).map(x => [x.id, x.side]));
  const c = mmMoveTo(u, V(u), 'mm-launch', { by: [0, -1] });
  assert.deepEqual(c.filter(x => x.op === 'set').map(x => [x.path[1], x.value]), Object.entries(drawn));
  const after = layout(apply(u, c), VID); assert.ok(Object.entries(drawn).every(([id, s]) => after.byId[id].side === s));
  // demoted with no side given: the others pinned as drawn, none on the demoted topic, so side-first stays quiet
  const d = mmMoveTo(u, V(u), 'mm-launch', { by: [1, 0] }), dn = apply(u, d), dg = layout(dn, VID);
  assert.ok(!d.some(x => x.op === 'set' && x.path[1] === 'mm-launch'), JSON.stringify(d));
  assert.deepEqual([node(dn, 'mm-launch').parent, mmProblems(dn, V(dn))], ['mm-catalogue', []]);
  assert.ok(Object.entries(drawn).every(([id, s]) => id === 'mm-launch' || dg.byId[id].side === s));
});

test('drops: on a topic, under it, last; between two siblings, there; a first-level topic on the root\'s other half changes side; a topic between two first-level ones takes their side; never under itself', () => {
  const m = EX(), V0 = V(m), g = layout(m, VID), at = id => [g.byId[id].x + g.byId[id].w / 2, g.byId[id].y + g.byId[id].h / 2], drop = (id, pt) => mmMoveTo(m, V0, id, { pt, geo: g });
  assert.deepEqual(drop('mm-courier', at('mm-launch')), [{ op: 'reparent', id: 'mm-courier', parent: 'mm-launch' }, { op: 'move', id: 'mm-courier', view: VID, index: 12 }]);
  assert.deepEqual(kids(run(m, drop('mm-courier', at('mm-launch'))), 'mm-launch'), ['mm-newsletter', 'mm-opening-offer', 'mm-courier']);
  const between = (a, b) => { const A = g.byId[a], B = g.byId[b]; return [A.x + 4, (A.y + A.h + B.y) / 2]; };
  let n = run(m, drop('mm-storefront', between('mm-newsletter', 'mm-opening-offer')));
  assert.deepEqual([node(n, 'mm-storefront').parent, kids(n, 'mm-launch')], ['mm-launch', ['mm-newsletter', 'mm-storefront', 'mm-opening-offer']]);
  n = run(m, drop('mm-order-emails', between('mm-first-titles', 'mm-wholesalers')));
  assert.deepEqual(kids(n, 'mm-catalogue'), ['mm-first-titles', 'mm-order-emails', 'mm-wholesalers']);
  const R = g.byId['mm-opening'];
  assert.deepEqual(drop('mm-legal', [R.x + R.w - 10, R.y + R.h / 2]), [{ op: 'set', view: VID, path: ['present', 'mm-legal', 'side'], value: 'right' }]);
  assert.deepEqual(drop('mm-legal', [R.x + 10, R.y + R.h / 2]), [], 'its own half: nothing');
  n = run(m, drop('mm-shelving', [R.x + R.w - 10, R.y + R.h / 2])); // a deeper topic on the root: first-level, on the half it was dropped on
  assert.deepEqual([node(n, 'mm-shelving').parent, V(n).present['mm-shelving']], ['mm-opening', { side: 'right' }]);
  n = run(m, drop('mm-legal', between('mm-catalogue', 'mm-website')));
  assert.deepEqual([kids(n, 'mm-opening').slice(0, 3), V(n).present['mm-legal']], [['mm-catalogue', 'mm-legal', 'mm-website'], { side: 'right' }]);
  n = run(m, drop('mm-legal', at('mm-checkout'))); // a first-level topic under another: its side goes
  assert.deepEqual([node(n, 'mm-legal').parent, V(n).present['mm-legal']], ['mm-checkout', {}]);
  assert.deepEqual(rules(n), []);
  assert.match(drop('mm-website', at('mm-card-payments')).error, /under one of its own subtopics/);
  assert.deepEqual(drop('mm-checkout', at('mm-website')), [], 'on its own parent: nothing');
  assert.match(drop('mm-checkout', [R.x - 2000, R.y]).error, /Drop a topic on another/);
  // without the canvas's geometry, the type lays the view out itself
  assert.deepEqual(mmMoveTo(m, V0, 'mm-courier', { pt: at('mm-launch') }), drop('mm-courier', at('mm-launch')));
  // a first-level topic dropped under another, no side given anywhere: the other branches pinned as drawn, none swings
  const u = EX(); V(u).present = {}; const ug = layout(u, VID), drawn = ug.nodes.filter(x => x.depth === 1 && x.id !== 'mm-catalogue');
  const uat = ug.byId['mm-checkout'], un = apply(u, mmMoveTo(u, V(u), 'mm-catalogue', { pt: [uat.x + uat.w / 2, uat.y + uat.h / 2], geo: ug })), after = layout(un, VID);
  assert.deepEqual([node(un, 'mm-catalogue').parent, drawn.filter(x => after.byId[x.id].side !== x.side).map(x => x.id), mmProblems(un, V(un))], ['mm-checkout', [], []]);
});

test('Delete hides a topic\'s branch, said with the count; Shift + Delete deletes it, apply() taking its descendants; the outline\'s Show brings back the topic and what was hidden with it', () => {
  const m = EX(), V0 = V(m);
  let r = mmRemove(m, V0, ['mm-checkout'], false);
  assert.deepEqual(r.commands, ['mm-checkout', 'mm-order-emails', 'mm-card-payments'].map(id => ({ op: 'hide', id, view: VID })));
  assert.equal(r.say, 'Hid Checkout and its 2 subtopics: the outline\'s Show, or undo, brings them back');
  const h = run(m, r); assert.deepEqual([h.nodes.length, V(h).nodeIds.length], [22, 19]);
  assert.equal(mmRemove(m, V0, ['mm-checkout', 'mm-card-payments'], false).commands.length, 3, 'a topic under another selected goes with it');
  r = mmRemove(m, V0, ['mm-website'], true);
  assert.deepEqual([r.commands, r.say], [[{ op: 'delete', id: 'mm-website' }], 'Deleted Website and its 4 subtopics']);
  const d = run(m, r); assert.deepEqual([d.nodes.length, V(d).nodeIds.length], [17, 17]);
  assert.equal(mmRemove(m, V0, ['mm-shelving'], true).say, 'Deleted Shelving and a packing table');
  assert.equal(mmRemove(m, V0, ['mm-catalogue', 'mm-legal'], true).say, 'Deleted Catalogue, Legal and money and their 4 subtopics');
  assert.equal(mmRemove(m, V0, ['ghost'], false), null);
  // Show on the hidden topic: it and the two hidden with it, back where they were
  const s = mmShow(h, V(h), 'mm-checkout');
  assert.deepEqual([s.commands, s.say], [[{ op: 'set', view: VID, path: 'nodeIds', value: V(m).nodeIds }], 'Showed Checkout and 2 subtopics hidden with it']);
  // a hidden topic's descendant shown on its own stays (drawn under Website then, so the branch comes back after it); one
  // with nothing hidden under it is the canvas's Show (null)
  const part = apply(h, { op: 'set', view: VID, path: 'nodeIds', value: [...V(h).nodeIds, 'mm-card-payments'] });
  assert.deepEqual(mmShow(part, V(part), 'mm-checkout').commands[0].value, [...V(h).nodeIds, 'mm-card-payments', 'mm-checkout', 'mm-order-emails']);
  assert.equal(mmShow(h, V(h), 'mm-card-payments'), null);
  assert.equal(mmShow(m, V0, 'mm-checkout'), null, 'shown already');
  // a parent cycle among the hidden (which validation reports) ends the walk: each topic once
  const cyc = { schemaVersion: 2, nodes: [{ id: 'r', type: T, label: 'R' }, { id: 'a', type: T, label: 'A', parent: 'b' }, { id: 'b', type: T, label: 'B', parent: 'a' }], edges: [], views: [{ id: 'v', diagram: 'mindmap', nodeIds: ['r'] }] };
  assert.deepEqual(mmShow(cyc, 'v', 'a').commands[0].value, ['r', 'a', 'b']);
});

/* ---- a 30-step session through the hooks (DoD 6) ---- */
const S = (f, ...a) => m => f(m, V(m), ...a);
const side = (m, id) => layout(m, VID).byId[id].side;
const dropOn = (id, on) => m => { const g = layout(m, VID), t = g.byId[on]; return mmMoveTo(m, V(m), id, { pt: [t.x + t.w / 2, t.y + t.h / 2], geo: g }); };
const STEPS = [
  S(mmAdd, ENTRY, 'Gift cards', { sel: ['mm-checkout'] }),
  S(mmRename, 'gift-cards', 'Gift cards and vouchers'),
  S(mmMoveTo, 'mm-catalogue', { by: [0, 1] }),
  S(mmMoveTo, 'mm-checkout', { by: [-1, 0] }),
  S(mmMoveTo, 'mm-legal', { by: [1, 0] }),
  S(mmRemove, ['mm-shelving'], false),
  S(mmAdd, ENTRY, 'Bookmarks', { sel: ['mm-opening-offer'] }),
  S(mmMoveTo, 'bookmarks', { by: [-1, 0] }),
  S(mmRename, 'mm-opening', 'Opening the bookshop in spring'),
  S(mmMoveTo, 'mm-on-azure', { by: [-1, 0] }),
  S(mmRemove, ['mm-courier'], true),
  dropOn('mm-storefront', 'mm-launch'),
  S(mmMoveTo, 'mm-launch', { by: [0, -1] }),
  S(mmAdd, ENTRY, 'Reviews', { sel: [] }),
  m => mmMoveTo(m, V(m), 'reviews', { by: [side(m, 'reviews') === 'right' ? -1 : 1, 0] }),
  S(mmRemove, ['mm-warehouse'], false),
  S(mmShow, 'mm-warehouse'),
  S(mmRename, 'mm-shelving', 'Shelves'),
  S(mmMoveTo, 'mm-company', { by: [0, 1] }),
  dropOn('mm-newsletter', 'mm-website'),
  S(mmRemove, ['mm-hosting'], true),
  S(mmAdd, ENTRY, 'Signage', { sel: ['mm-warehouse'] }),
  S(mmMoveTo, 'signage', { by: [0, -1] }),
  S(mmRename, 'signage', 'Shop signage'),
  m => mmMoveTo(m, V(m), 'mm-company', { by: [side(m, 'mm-company') === 'right' ? -1 : 1, 0] }),
  () => [{ op: 'set', view: VID, path: 'title', value: 'Opening, edited' }],
  S(mmRemove, ['mm-website'], false),
  S(mmAdd, ENTRY, 'Opening party', { sel: ['mm-launch'] }),
  S(mmMoveTo, 'mm-catalogue', { by: [-1, 0] }),
  S(mmRemove, ['mm-launch'], true),
];
test('a 30-step session through the hooks: each step a transaction that adds no error; undone, redone and reopened, byte-identical; laid out clean', () => {
  assert.equal(STEPS.length, 30);
  const h = history(EX()), seen = [JSON.stringify(h.model)];
  STEPS.forEach((step, k) => { const c = cmdsOf(step(h.model)); assert.ok(Array.isArray(c) && c.length, `step ${k + 1}: ${JSON.stringify(c)}`);
    h.push(run(h.model, c)); seen.push(JSON.stringify(h.model)); });
  const end = seen[30];
  for (let k = 29; k >= 0; k--) assert.equal(JSON.stringify(h.undo()), seen[k], `undo to ${k}`);
  for (let k = 1; k <= 30; k++) assert.equal(JSON.stringify(h.redo()), seen[k], `redo to ${k}`);
  let m = JSON.parse(seen[15]);
  STEPS.slice(15).forEach(step => { m = apply(m, cmdsOf(step(m))); });
  assert.equal(JSON.stringify(m), end);
  assert.deepEqual(rules(m), []);
  assert.deepEqual(unclean(layout(m, VID)), []);
  assert.deepEqual([node(m, 'mm-opening').label, node(m, 'mm-launch'), node(m, 'mm-shelving').label], ['Opening the bookshop in spring', undefined, 'Shelves']);
});

const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
const chain = n => ({ schemaVersion: 2, nodes: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, type: T, label: `t${i}`, ...(i ? { parent: `t${i - 1}` } : {}) })), edges: [],
  views: [{ id: 'c', diagram: 'mindmap', nodeIds: Array.from({ length: n }, (_, i) => `t${i}`) }] });
test('Shift + Delete on the root of a 20,000-topic chain: no throw, every topic gone, the count said; Delete hides the chain; under 1 s in CI, printed against the 100 ms target (CPU, best of three) (timed)', () => {
  const m = chain(20000), best = f => Math.min(...Array.from({ length: 3 }, () => cpu(f)));
  let r; const t = best(() => { r = mmRemove(m, 'c', ['t0'], true); }), n = apply(m, r.commands);
  assert.equal(r.say, 'Deleted t0 and its 19999 subtopics');
  assert.deepEqual([n.nodes.length, V(n).nodeIds.length], [0, 0]);
  let h; const u = best(() => { h = mmRemove(m, 'c', ['t10000'], false); });
  assert.equal(h.commands.length, 10000);
  const d = best(() => layout(m, 'c'));
  for (const [k, v] of Object.entries({ delete: t, hide: u, layout: d })) assert.ok(v < 1000, `${k} ${v} ms`);
  console.log(`# a 20,000-topic chain (target 100 ms): Shift + Delete on its root ${t.toFixed(1)} ms, Delete half of it ${u.toFixed(1)} ms, its layout ${d.toFixed(1)} ms`);
});

/* ---- P1 (§11): 300 topics, eight levels, six first-level branches ---- */
function stress() {
  const nodes = [{ id: 't0', type: T, label: 'The plan' }], par = i => (i <= 6 ? 0 : i <= 42 ? i - 6 : 1 + (i * 7) % 36);
  for (let i = 1; i < 300; i++) nodes.push({ id: `t${i}`, type: T, label: `Topic ${i}${i % 5 ? '' : ' with a longer text that wraps'}`, parent: `t${par(i)}` });
  return { schemaVersion: 2, nodes, edges: [], views: [{ id: 'all', diagram: 'mindmap', nodeIds: nodes.map(n => n.id) }] };
}
test('P1 (§11): 300 topics in eight levels: a full layout with markup, a topic renamed, added, moved to the other side and promoted, laid out and drawn, each under 1 s in CI, printed against the 100 ms target (CPU, best of seven after a warm-up) (timed)', () => {
  const M = stress(), g = layout(M, 'all'), draw = m => mapContext(m).buildView('all').markup;
  assert.deepEqual([g.nodes.length, Math.max(...g.nodes.map(n => n.depth)) + 1, g.nodes.filter(n => n.depth === 1).length], [300, 8, 6]);
  assert.deepEqual(errors(M), []); assert.deepEqual(unclean(g), []);
  const edits = { rename: m => mmRename(m, 'all', 't77', 'renamed'), add: m => mmAdd(m, 'all', ENTRY, 'New topic', { sel: ['t9'] }),
    side: m => mmMoveTo(m, 'all', 't3', { by: [layout(m, 'all').byId.t3.side === 'right' ? -1 : 1, 0] }), promote: m => mmMoveTo(m, 'all', 't20', { by: [layout(m, 'all').byId.t20.side === 'right' ? -1 : 1, 0] }) };
  const step = e => m => apply(m, cmdsOf(e(m)));
  draw(M); Object.values(edits).forEach(e => draw(step(e)(M))); // the warm-up
  const best = f => Math.min(...Array.from({ length: 7 }, () => cpu(f)));
  const t = { full: best(() => draw(M)), ...Object.fromEntries(Object.entries(edits).map(([k, e]) => [k, best(() => draw(step(e)(M)))])) };
  for (const [k, v] of Object.entries(t)) assert.ok(v < 1000, `${k} ${v} ms`);
  console.log(`# P1 mindmap (target 100 ms): renamed ${t.rename.toFixed(1)} ms, added ${t.add.toFixed(1)} ms, other side ${t.side.toFixed(1)} ms, promoted ${t.promote.toFixed(1)} ms; full layout and markup ${t.full.toFixed(1)} ms`);
});

test('the type ships in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ["registerDiagramType('mindmap'", 'function mmRun(', "SHAPE['mm-topic'] = "]) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});
