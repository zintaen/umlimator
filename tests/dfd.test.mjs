// The data flow diagram, dfd (work package M2.4, notes/milestone-2.md §4.3, §6.1, §6.4, §7.3): the type's definition, its
// six shapes (three symbols, two skins, one size), 22-data-flow.json laid out clean in both directions and both notations,
// line ends on outlines, a notation switch that lays nothing out, accessible names, the reading order, the legend, the
// validators, balancing, D making a level that balances by construction, the palette's numbers, the PDF's rows, a 30-step
// session saved and reopened, and the common edit's time. tests/dfd.html draws it in a browser and edits it by pointer and
// keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { SHAPE } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { DFD_TYPE } from '../src/dfd/dfd.js';
import '../src/er/er.js';
import '../src/flowchart/flowchart.js';
import '../src/uml/information.js';
import '../src/c4/c4.js';
import '../src/c4/views.js';

const DF = JSON.parse(readFileSync(new URL('../examples/bookshop-data-flow.json', import.meta.url)));
const T = diagramOf({ diagram: 'dfd' }), L1 = 'dfd-level-1', L2 = 'dfd-level-2-take-order';
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const P = (id, label, number, more = {}) => ({ id, type: 'dfd.Process', label, ...(number != null ? { props: { number } } : {}), ...more });
const S = (id, label, number) => ({ id, type: 'dfd.DataStore', label, ...(number != null ? { props: { number } } : {}) });
const X = (id, label) => ({ id, type: 'dfd.ExternalEntity', label });
const F = (id, from, to, label) => ({ id, type: 'dfd.DataFlow', from, to, ...(label != null ? { label } : {}) });
const look = (m, direction, notation) => { const c = structuredClone(m); c.views.forEach(v => { if (direction) v.direction = direction; if (notation) v.notation = notation; }); return c; };
const unid = s => s.replace(/\bg\d+-/g, 'g-');
// each line's drawn path's two ends, from the markup (tests/usecase.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
// a point's distance from a node's outline: Yourdon's process an ellipse, Gane and Sarson's a rectangle with 10 px corners, the rest their box
const off = (n, [x, y]) => {
  if (n.shape === 'dfd-process-yourdon') return Math.abs(Math.hypot((x - n.x - n.w / 2) / (n.w / 2), (y - n.y - n.h / 2) / (n.h / 2)) - 1) * Math.min(n.w, n.h) / 2;
  const r = n.shape === 'dfd-process-gane-sarson' ? 10 : 0, cx = Math.max(n.x + r, Math.min(x, n.x + n.w - r)), cy = Math.max(n.y + r, Math.min(y, n.y + n.h - r));
  const inner = x > n.x + r && x < n.x + n.w - r && y > n.y + r && y < n.y + n.h - r;
  return inner ? Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y) : Math.abs(Math.hypot(x - cx, y - cy) - r); };

test('the definition: dfd is registered with its palette, its two lines, its number fields, its hooks and its seven rules', () => {
  assert.equal(T.name, 'dfd');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['dfd.Process', 'Process'], ['dfd.DataStore', 'Data store'], ['dfd.ExternalEntity', 'External entity'], ['uml.Comment', 'Comment']]);
  assert.equal(T.elements[0].opens, 'dfd', 'V on a process picks the dfd view it opens');
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['dfd.DataFlow', 'Data flow'], ['uml.CommentLink', 'Comment link']]);
  for (const t of ['dfd.Process', 'dfd.DataStore']) assert.deepEqual(T.props[t], [{ key: 'number', label: 'Number', kind: 'text' }], t);
  for (const k of ['layout', 'validate', 'describe', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'key']);
  assert.deepEqual(Object.keys(T.rules).sort(), ['dfd-balance', 'dfd-flow-label', 'dfd-flow-process', 'dfd-level', 'dfd-notation', 'dfd-numbers', 'dfd-process-io']);
  assert.equal(T.unfolds, undefined, 'a level opens, never unfolds in place (§6.3)');
});

test('the shapes (§4.3): each symbol one size in both skins, its text inside; Yourdon\'s process an ellipse a slid end lies on; Gane and Sarson\'s holds its band', () => {
  for (const n of [{ label: 'Take order', number: '1' }, { label: 'Check the basket against the price list and the stock records', number: '1.12' }, { label: 'x' }, { label: 'Orders', number: 'D2' }]) for (const k of ['process', 'store', 'entity']) {
    const y = SHAPE[`dfd-${k}-yourdon`].size(n), g = SHAPE[`dfd-${k}-gane-sarson`].size(n);
    assert.deepEqual(y, g, `${k} ${n.label}`); assert.ok(y.w >= 96 && y.h >= 36, `${k}: ${JSON.stringify(y)}`); }
  const n = { label: 'Check the basket against the price list', number: '1.1' }, { w, h } = SHAPE['dfd-process-yourdon'].size(n), box = { ...n, x: 0, y: 0, w, h, shape: 'dfd-process-yourdon' };
  // Gane and Sarson: the number in the band (above y 22), each name line's box (its baseline less 12, 16 high) below it and inside the box
  const gsys = cls => [...SHAPE['dfd-process-gane-sarson'].draw({ ...n, id: 'p', x: 0, y: 0, w, h, shape: 'dfd-process-gane-sarson' }, '', '').matchAll(new RegExp(`<text x="[^"]*" y="([^"]*)"[^>]*class="${cls}"`, 'g'))].map(m => +m[1]);
  assert.ok(gsys('c-st').length === 1 && gsys('c-st')[0] < 22, `the number in the band: ${gsys('c-st')}`);
  assert.ok(gsys('c-name').length >= 2 && gsys('c-name').every(y => y - 12 >= 22 && y + 4 <= h), `the name below the band, inside the box: ${gsys('c-name')} in ${h}`);
  // a long number is cut, as a name is wrapped, at 160: the box does not grow with it
  for (const k of ['process', 'store']) assert.ok(SHAPE[`dfd-${k}-yourdon`].size({ label: 'x', number: '9'.repeat(200) }).w <= 260, k);
  for (const [s, ts] of [['L', [h / 4, h / 2]], ['R', [3, h / 2]], ['T', [w / 3, w / 2]], ['B', [w / 5]]]) for (const t of ts) {
    const d = SHAPE['dfd-process-yourdon'].inset(box, s, t), p = s === 'L' ? [d, t] : s === 'R' ? [w - d, t] : s === 'T' ? [t, d] : [t, h - d];
    assert.ok(off(box, p) < 0.01, `${s} ${t}`); }
  for (const k of ['store', 'entity']) assert.equal(SHAPE[`dfd-${k}-gane-sarson`].inset(box, 'L', 5), 0, `${k}: ends on its box`);
  const d = { id: 'p', x: 0, y: 0, w, h, label: n.label, number: '1.1' };
  assert.match(SHAPE['dfd-process-yourdon'].draw({ ...d, shape: 'dfd-process-yourdon' }, '#000', '#fff'), /<path d="M0 [^"]*A[^"]*" class="n-body"[^]*class="c-st"[^>]*>1\.1<\/text>[^]*class="c-name"[^>]*data-o="p"/);
  assert.match(SHAPE['dfd-process-gane-sarson'].draw({ ...d, shape: 'dfd-process-gane-sarson' }, '#000', '#fff'), /class="n-body"[^]*<path d="M0 22H[^"]*" class="n-det"[^]*>1\.1<\/text>/);
  assert.match(SHAPE['dfd-store-yourdon'].draw({ id: 's', x: 0, y: 0, w: 120, h: 36, label: 'Orders', number: 'D2' }, '#000', '#fff'), /d="M0 0H120M0 36H120" class="n-body"/);
  assert.match(SHAPE['dfd-store-gane-sarson'].draw({ id: 's', x: 0, y: 0, w: 120, h: 36, label: 'Orders', number: 'D2' }, '#000', '#fff'), /d="M120 0H0V36H120M28 0V36" class="n-body"/);
  assert.match(SHAPE['dfd-entity-gane-sarson'].draw({ id: 'e', x: 0, y: 0, w: 100, h: 36, label: 'Customer' }, '#000', '#fff'), /d="M4 4H100V36H4Z" class="n-det"[^]*d="M0 0H96V32H0Z" class="n-body"/);
});

test('22-data-flow.json lays out clean right and down in both notations: no overlap, nothing but level 1\'s crossings, pinned', () => {
  assert.deepEqual(validate(DF), [], 'it validates, and balances');
  for (const direction of ['right', 'down']) for (const notation of ['yourdon', 'gane-sarson']) {
    const m = look(DF, direction, notation), tag = `${direction}, ${notation}`;
    for (const [vid, k] of [[L1, direction === 'right' ? 1 : 2], [L2, 0]]) { // L1 right 2 before audit 14
      const g = layout(m, vid), problems = check(m, vid).map(p => p.message), crossings = problems.filter(p => / cross$/.test(p));
      assert.deepEqual(problems.filter(p => !crossings.includes(p)), [], `${tag} ${vid}: check() finds nothing but crossings`);
      assert.equal(crossings.length, k, `${tag} ${vid}: ${crossings}`);
      for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${tag}: ${p.id} and ${q.id} overlap`);
      g.nodes.forEach(n => assert.equal(n.shape, `dfd-${{ 'dfd.Process': 'process', 'dfd.DataStore': 'store', 'dfd.ExternalEntity': 'entity' }[n.type]}-${notation}`, n.id));
      assert.ok(g.edges.every(e => e.label && e.cut === 280 && e.end.to === 'arrow' && !e.end.dashed), 'flows: solid, a filled arrow, labels cut at 280');
      console.log(`# 22-data-flow.json ${vid}, ${tag}: ${g.nodes.length} nodes, ${g.edges.length} flows, ${crossings.length} crossings`);
    }
  }
});

test('every line end is on its shape\'s outline within 1 px, in both skins, a comment\'s link too', () => {
  const m = structuredClone(DF); m.nodes.push({ id: 'n1', type: 'uml.Comment', label: 'nightly' }); m.edges.push({ id: 'n1-link', type: 'uml.CommentLink', from: 'n1', to: 'dfd-books' }); m.views[0].nodeIds.push('n1');
  for (const direction of ['right', 'down']) for (const notation of ['yourdon', 'gane-sarson']) {
    const { g, markup } = mapContext(look(m, direction, notation)).buildView(L1), E = ends(markup);
    assert.equal(E.length, g.edges.length);
    E.forEach(({ from, to, i, a, b }) => [[from, a], [to, b]].forEach(([id, p]) => { const n = g.byId[id];
      assert.ok(off(n, p) <= 1, `${direction}, ${notation}: ${g.edges[i].id} ends ${off(n, p).toFixed(2)} px off ${id} (${n.shape})`); }));
    if (notation === 'yourdon') assert.ok(E.some(({ i, a, b }) => String(a) !== String(g.edges[i].pts[0]) || String(b) !== String(g.edges[i].pts.at(-1))), 'ends slid onto the ellipse');
    assert.deepEqual(g.edges.find(e => e.id === 'n1-link').end, { from: 'none', to: 'none', dashed: true });
  }
});

test('a notation switch repaints and lays nothing out (§4.3, S3): the memo\'s run count holds, the geometry is the same, the shapes change', () => {
  const memos = {}, draw = m => mapContext(m, { memos }).buildView(L1);
  const a = draw(DF), runs = memos[L1].runs, geo = JSON.stringify(a.g.nodes.map(n => [n.x, n.y, n.w, n.h])), pts = JSON.stringify(a.g.edges.map(e => e.pts));
  const b = draw(apply(DF, [{ op: 'set', view: L1, path: 'notation', value: 'gane-sarson' }]));
  assert.equal(memos[L1].runs, runs, 'no layout');
  assert.equal(JSON.stringify(b.g.nodes.map(n => [n.x, n.y, n.w, n.h])), geo); assert.equal(JSON.stringify(b.g.edges.map(e => e.pts)), pts);
  assert.match(b.markup, /data-shape="dfd-process-gane-sarson"/); assert.doesNotMatch(b.markup, /dfd-process-yourdon/);
  assert.equal(unid(b.markup), unid(mapContext(look(DF, null, 'gane-sarson')).buildView(L1).markup), 'the repaint is what a fresh layout of that notation draws');
  draw(apply(DF, [{ op: 'set', id: 'dfd-basket', path: 'label', value: 'the basket' }]));
  assert.equal(memos[L1].runs, runs + 1, 'a flow\'s label lays the view out again');
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup (§2.6)', () => {
  const memos = {}, first = mapContext(DF, { memos }).buildView(L1), pts = JSON.stringify(memos[L1].g.edges.map(e => e.pts)), second = mapContext(DF, { memos }).buildView(L1);
  assert.equal(memos[L1].runs, 1);
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos[L1].g.edges.map(e => e.pts)), pts);
});

test('names, reading order and legend (A1): processes by number, stores, entities, then the flows; each symbol in the view\'s skin keyed', () => {
  const g = layout(DF, L1), s = svgOf(g);
  assert.equal(g.byId['dfd-take-order'].aria, 'Process 1 Take order, opens level 1 Take order, 2 flows in, 2 out');
  assert.equal(g.byId['dfd-courier'].aria, 'External entity Courier, 1 flow in, 0 out');
  assert.equal(g.byId['dfd-books'].aria, 'Data store D1 Books, 1 flow in, 1 out');
  assert.equal(g.edges.find(e => e.id === 'dfd-basket').aria, 'Data flow basket from Customer to 1 Take order');
  assert.match(s, /data-shape="dfd-process-yourdon" tabindex="-1" role="img" aria-label="Process 1 Take order, opens level 1 Take order, 2 flows in, 2 out"/);
  assert.deepEqual(g.order.slice(0, 8), ['dfd-take-order', 'dfd-take-payment', 'dfd-ship-order', 'dfd-books', 'dfd-orders', 'dfd-customer', 'dfd-provider', 'dfd-courier']);
  assert.deepEqual(g.order.slice(8), DF.edges.slice(0, 11).map(e => e.id), 'then every line, each a key ring');
  assert.equal((s.match(/class="um-key line-key node-key" data-node=/g) || []).length, 8);
  assert.equal((s.match(/class="um-key line-key[^"]*" data-i=/g) || []).length, 11);
  const legend = gg => gg.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]);
  assert.deepEqual(legend(g), ['Process', 'Data store', 'External entity', 'Data flow']);
  assert.match(g.legend[0], /<ellipse/); assert.match(layout(look(DF, null, 'gane-sarson'), L1).legend[0], /<rect[^>]*rx="3"/);
  const kids = layout(DF, L2); assert.equal(kids.byId['dfd-check-basket'].aria, 'Process 1.1 Check the basket, 2 flows in, 1 out');
  // a level draws its own flows only: one between two of its context elements, or its parent process's, is the parent level's
  const ctx = structuredClone(DF); ctx.edges.push(F('dfd-books-2', 'dfd-orders', 'dfd-take-order', 'old order')); ctx.views[1].nodeIds.push('dfd-take-order');
  assert.deepEqual(layout(ctx, L2).edges.map(e => e.id), DF.edges.filter(e => e.id.startsWith('dfd-l2-')).map(e => e.id));
  assert.equal(layout(ctx, L1).edges.length, 12, 'the parent view draws it');
  const listedCtx = structuredClone(ctx); listedCtx.views[1].edges = ['dfd-books-2']; assert.deepEqual(layout(listedCtx, L2).edges.map(e => e.id), ['dfd-books-2'], 'a view\'s own list is drawn as it is');
  const loose = structuredClone(DF); loose.views[1].nodeIds = ['dfd-check-basket']; assert.deepEqual(legend(layout(loose, L2)), ['Process']);
});

test('describe(): the view in sentences, the level saying whose it is, each element in reading order, then each line', () => {
  const d = describe(DF, L1).split('\n');
  assert.equal(d[0], 'Bookshop, level 1: a data flow diagram of 8 elements and 11 lines.');
  assert.deepEqual(d.slice(1, 3), ['Process 1 Take order, opens level 1 Take order, 2 flows in, 2 out.', 'Process 2 Take payment, 2 flows in, 2 out.']);
  assert.equal(d.at(-1), 'Data flow shipping notice from 3 Ship order to Customer.');
  assert.equal(d.length, 1 + 8 + 11);
  assert.equal(describe(DF, L2).split('\n')[0], '1 Take order: a data flow diagram, the level of process "1 Take order", of 6 elements and 6 lines.');
});

// ---- §6.4, §7.3: validators, each with a passing and a failing case
const BREAKS = {
  'dfd-flow-process': m => { m.edges.push(F('bad', 'dfd-books', 'dfd-orders', 'copy')); return ['bad', 'dfd-books', 'dfd-orders']; },
  'dfd-process-io': m => { m.edges = m.edges.filter(e => e.id !== 'dfd-shipping-label' && e.id !== 'dfd-shipping-notice' && e.id !== 'dfd-stock-change'); return ['dfd-ship-order']; },
  'dfd-flow-label': m => { delete m.edges.find(e => e.id === 'dfd-amount-due').label; return ['dfd-amount-due']; },
  'dfd-numbers': m => { m.nodes.find(n => n.id === 'dfd-total-order').props.number = '2.2'; return ['dfd-total-order', 'dfd-take-order']; },
  'dfd-balance': m => { m.edges = m.edges.filter(e => e.id !== 'dfd-l2-basket'); return ['dfd-take-order', 'dfd-basket']; },
  'dfd-level': m => { m.views[1].parent = null; return ['dfd-take-order']; },
  // audit 12: an unknown notation is drawn as Yourdon, and said
  'dfd-notation': m => { m.views.find(v => v.id === L1).notation = 'gane-and-sarson'; return [L1]; },
};
test('validators: 22-data-flow.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(DF), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(DF), ids = broke(m), got = T.validate(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, 'warning', rule); // dfd-balance too, since 16 Nov 2026 (the maintainer's decision)
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  // a number used twice; a level opening a view that is no dfd view, or none; a flow from an entity to a store
  const twice = structuredClone(DF); twice.nodes.find(n => n.id === 'dfd-ship-order').props.number = '2';
  assert.deepEqual(T.validate(twice).map(p => [p.rule, p.ids]), [['dfd-numbers', ['dfd-take-payment', 'dfd-ship-order']]]);
  const nowhere = structuredClone(DF); nowhere.nodes[3].opensView = 'nowhere'; assert.match(T.validate(nowhere)[0].message, /opens "nowhere", which is no view/);
  const map = structuredClone(DF); map.views[1].diagram = 'map'; assert.deepEqual(T.validate(map).map(p => p.rule), ['dfd-level']);
  // a level is one process's: opened by two, its own parent, or showing its own process
  const two = structuredClone(DF); two.nodes.find(n => n.id === 'dfd-take-payment').opensView = L2;
  assert.deepEqual(T.validate(two).map(p => [p.rule, p.ids]), [['dfd-level', ['dfd-take-payment', 'dfd-take-order']]]);
  assert.match(T.validate(two)[0].message, /opens "dfd-level-2-take-order", which process "1 Take order" opens already/);
  const self = structuredClone(DF); self.views[1].parent = L2; self.views[1].nodeIds.push('dfd-take-order');
  assert.deepEqual(T.validate(self).map(p => p.message), ['dfd-level: process "1 Take order" opens "dfd-level-2-take-order", whose parent view is itself']);
  const own = structuredClone(DF); own.views[1].nodeIds.push('dfd-take-order');
  assert.deepEqual(T.validate(own).map(p => p.message), ['dfd-level: process "1 Take order" opens "dfd-level-2-take-order", which shows the process itself: its level shows its parts']);
  const es = structuredClone(DF); es.edges.push(F('es', 'dfd-customer', 'dfd-books', 'wish list')); assert.deepEqual(T.validate(es).map(p => p.rule), ['dfd-flow-process']);
});

test('balancing (§6.4): one flow removed from level 2 fails dfd-balance naming it; a flow added at the level, or turned round, or to another far end, too; a local store does not count', () => {
  const m = structuredClone(DF); m.edges = m.edges.filter(e => e.id !== 'dfd-l2-basket');
  const [p] = T.validate(m);
  assert.equal(p.message, 'dfd-balance: process "1 Take order" does not balance with level "1 Take order": its flow "basket" in from external entity "Customer" (dfd-basket) has none at the level');
  assert.equal(p.path, 'nodes[3]');
  const extra = structuredClone(DF); extra.edges.push(F('dfd-l2-receipt', 'dfd-record-order', 'dfd-customer', 'receipt'));
  assert.match(T.validate(extra)[0].message, /the level's flow "receipt" out to external entity "Customer" \(dfd-l2-receipt\) is not the process's$/);
  const back = structuredClone(DF), b = back.edges.find(e => e.id === 'dfd-l2-new-order'); [b.from, b.to] = [b.to, b.from];
  assert.deepEqual(T.validate(back).filter(q => q.rule === 'dfd-balance').map(q => q.ids.sort()), [['dfd-l2-new-order', 'dfd-new-order', 'dfd-take-order']], 'direction counts');
  const far = structuredClone(DF); far.edges.find(e => e.id === 'dfd-l2-price-and-stock').from = 'dfd-orders';
  assert.deepEqual(T.validate(far).map(q => q.rule), ['dfd-balance'], 'the far end counts');
  // a store the level shows and its parent view does not: its flows are inside the level
  // what a level draws counts, not what the model holds: a flow left off the level's list, a context element hidden on
  // either view
  const listed = structuredClone(DF); listed.views[1].edges = DF.edges.filter(e => e.id.startsWith('dfd-l2-') && e.id !== 'dfd-l2-basket').map(e => e.id);
  assert.deepEqual(T.validate(listed).map(q => q.ids), [['dfd-take-order', 'dfd-basket']], 'a flow the level does not list');
  assert.deepEqual(T.validate(apply(DF, [{ op: 'hide', id: 'dfd-customer', view: L2 }])).map(q => q.ids), [['dfd-take-order', 'dfd-basket', 'dfd-confirmation']], 'its far end hidden on the level');
  assert.deepEqual(T.validate(apply(DF, [{ op: 'hide', id: 'dfd-customer', view: L1 }])).map(q => q.ids), [['dfd-take-order', 'dfd-l2-basket', 'dfd-l2-confirmation']], 'its far end hidden on the parent view');
  const local = structuredClone(DF); local.nodes.push(S('dfd-baskets', 'Baskets', 'D3')); local.views[1].nodeIds.push('dfd-baskets');
  local.edges.push(F('l-keep', 'dfd-check-basket', 'dfd-baskets', 'held basket'), F('l-read', 'dfd-baskets', 'dfd-total-order', 'held basket'));
  assert.deepEqual(T.validate(local), []);
});

// ---- §6.1, §7.3: editing
test('D on a process that opens no view makes its level in one transaction, balanced by construction; undone in one step; refused on one that opens a level', () => {
  const v = DF.views[0], r = T.edits.key(DF, v, ['dfd-take-payment'], 'D');
  assert.equal(r.say, 'Made level 2 Take payment, balanced with 4 flows: Enter opens it');
  assert.deepEqual(r.commands[0], { op: 'addView', view: { id: 'dfd-take-payment-level', diagram: 'dfd', title: '2 Take payment', parent: L1, notation: 'yourdon', nodeIds: ['dfd-orders', 'dfd-provider', 'dfd-ship-order'] } });
  assert.deepEqual(r.commands[1], { op: 'add', element: { id: 'dfd-take-payment-2.1', type: 'dfd.Process', label: 'Take payment', props: { number: '2.1' } }, view: 'dfd-take-payment-level' });
  assert.deepEqual(r.commands.slice(2, 6).map(c => [c.element.id, c.element.from, c.element.to, c.element.label]), [
    ['dfd-amount-due-2.1', 'dfd-orders', 'dfd-take-payment-2.1', 'amount due'], ['dfd-charge-request-2.1', 'dfd-take-payment-2.1', 'dfd-provider', 'charge request'],
    ['dfd-charge-result-2.1', 'dfd-provider', 'dfd-take-payment-2.1', 'charge result'], ['dfd-paid-order-2.1', 'dfd-take-payment-2.1', 'dfd-ship-order', 'paid order']]);
  assert.deepEqual(r.commands.at(-1), { op: 'set', id: 'dfd-take-payment', path: 'opensView', value: 'dfd-take-payment-level' });
  const h = history(DF); h.push(apply(DF, r.commands)); const m = h.model;
  assert.deepEqual(validate(m), [], 'it balances, and its numbers sit under 2');
  // clean, right and down, in both notations (right, its request/reply pair to an entity crossed before audit 14)
  for (const direction of ['right', 'down']) for (const notation of ['yourdon', 'gane-sarson'])
    assert.deepEqual(check(look(m, direction, notation), 'dfd-take-payment-level').map(p => p.message), [], `${direction}, ${notation}`);
  assert.equal(layout(m, L1).byId['dfd-take-payment'].aria, 'Process 2 Take payment, opens level 2 Take payment, 2 flows in, 2 out');
  assert.equal(JSON.stringify(h.undo()), JSON.stringify(DF), 'one undo takes it all back');
  // the level made is a level: split its process and balancing still holds while the flows stay at the edge
  const s = apply(m, [{ op: 'add', element: P('dfd-charge', 'Charge the card', '2.2'), view: 'dfd-take-payment-level' }, { op: 'set', id: 'dfd-charge-request-2.1', path: 'label', value: 'charge request' }]);
  assert.deepEqual(T.validate(s).map(p => p.rule), ['dfd-process-io'], 'the new process wants flows, nothing else');
  // a second D, a free id; on a process with no number, 1; a process opening a level, refused; anything else, the canvas's
  const again = structuredClone(DF); again.views.push({ id: 'dfd-take-payment-level', diagram: 'map', nodeIds: [] }); again.nodes.push(P('dfd-take-payment-2.1', 'taken'));
  const r2 = T.edits.key(again, again.views[0], ['dfd-take-payment'], 'd');
  assert.equal(r2.commands[0].view.id, 'dfd-take-payment-level-2'); assert.equal(r2.commands[1].element.id, 'dfd-take-payment-2.1-2');
  const bare = structuredClone(DF); delete bare.nodes.find(n => n.id === 'dfd-ship-order').props;
  const r3 = T.edits.key(bare, bare.views[0], ['dfd-ship-order'], 'D'); assert.equal(r3.commands[0].view.title, 'Ship order'); assert.equal(r3.commands[1].element.props.number, '3', 'the next free');
  // the child's number the next free under the process's: with a 2.1 taken, 2.2, and the level checks clean
  const t21 = structuredClone(DF); t21.nodes.push(P('x21', 'Elsewhere', '2.1')); const r4 = T.edits.key(t21, t21.views[0], ['dfd-take-payment'], 'D');
  assert.deepEqual([r4.commands[1].element.id, r4.commands[1].element.props.number, r4.commands[2].element.id], ['dfd-take-payment-2.2', '2.2', 'dfd-amount-due-2.2']);
  assert.deepEqual(T.validate(apply(t21, r4.commands)).filter(p => p.rule !== 'dfd-process-io'), []);
  // the level copies the flows the view draws: not one between two of its context elements
  const ctx = structuredClone(DF); ctx.edges.push(F('z2', 'dfd-ship-order', 'dfd-provider', 'pickup'));
  const r5 = T.edits.key(ctx, ctx.views[0], ['dfd-take-payment'], 'D'), m5 = apply(ctx, r5.commands);
  assert.equal(layout(m5, 'dfd-take-payment-level').edges.length, 4); assert.deepEqual(T.validate(m5), []);
  assert.deepEqual(T.edits.key(DF, v, ['dfd-take-order'], 'D'), { error: 'process "1 Take order" opens "dfd-level-2-take-order" already: Enter opens it' });
  for (const [ids, k] of [[['dfd-books'], 'D'], [['dfd-take-payment', 'dfd-ship-order'], 'D'], [['dfd-take-payment'], 'x'], [[], 'D']]) assert.equal(T.edits.key(DF, v, ids, k), null, `${ids} ${k}`);
  // laid out down in Gane and Sarson: the level keeps both
  const gs = look(DF, 'down', 'gane-sarson'); const rv = T.edits.key(gs, gs.views[0], ['dfd-ship-order'], 'D').commands[0].view;
  assert.equal(rv.notation, 'gane-sarson'); assert.equal(rv.direction, 'down');
});

test('audit 22: D takes the level\'s view id from every id in the model, so an element already named <process>-level keeps its meaning', () => {
  const m = structuredClone(DF), v = m.views[0];
  m.nodes.push({ id: 'dfd-ship-order-level', type: 'uml.Comment', label: 'Couriers collect at 4 pm' }); v.nodeIds.push('dfd-ship-order-level');
  const r = T.edits.key(m, v, ['dfd-ship-order'], 'D');
  assert.equal(r.commands[0].view.id, 'dfd-ship-order-level-2');
  const m2 = apply(m, r.commands), ctx = mapContext(m2);
  assert.equal(ctx.opensOf('dfd-ship-order-level', v.id), null, 'the comment opens nothing');
  assert.equal(ctx.opensOf('dfd-ship-order', v.id), 'dfd-ship-order-level-2');
  assert.equal(layout(m2, v.id).byId['dfd-ship-order-level'].aria, 'Comment: Couriers collect at 4 pm');
  assert.deepEqual(validate(m2), []);
});

test('the palette\'s add numbers a process under the view\'s parent process, else 1, 2, …; a store D1, D2, …; the rest is the canvas\'s', () => {
  assert.deepEqual(T.edits.add(DF, DF.views[1], { type: 'dfd.Process' }, 'Check stock'), [{ op: 'add', element: { id: 'process1', type: 'dfd.Process', label: 'Check stock', props: { number: '1.4' } }, view: L2 }]);
  assert.deepEqual(T.edits.add(DF, DF.views[0], { type: 'dfd.Process' }, '')[0].element.props, { number: '4' });
  assert.deepEqual(T.edits.add(DF, DF.views[0], { type: 'dfd.DataStore' }, 'Couriers'), [{ op: 'add', element: { id: 'store1', type: 'dfd.DataStore', label: 'Couriers', props: { number: 'D3' } }, view: L1 }]);
  assert.equal(T.edits.add(DF, DF.views[0], { type: 'dfd.ExternalEntity' }, 'Bank'), null);
  const m = apply(DF, T.edits.add(DF, DF.views[1], { type: 'dfd.Process' }, 'Check stock'));
  assert.deepEqual(T.validate(m).map(p => p.rule), ['dfd-process-io'], 'numbered right: only its flows are wanting');
  assert.equal(T.edits.add(m, m.views[1], { type: 'dfd.Process' }, 'x')[0].element.id, 'process2');
});

test('the PDF\'s tables (§9): a process\'s word, number and the level it opens; a store\'s number; an entity\'s word', () => {
  assert.deepEqual(T.rows(DF, DF.views[0], 'dfd-take-order'), ['number 1', 'opens level 1 Take order']);
  assert.deepEqual(T.rows(DF, DF.views[0], 'dfd-orders'), ['number D2']);
  assert.equal(T.rows(DF, DF.views[0], 'dfd-customer'), null);
  assert.deepEqual(['dfd-take-order', 'dfd-books', 'dfd-customer', 'nowhere'].map(id => T.word(DF, id)), ['Process', 'Data store', 'External entity', null]);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: P(`p${i}`, `Step ${i}`, `1.${4 + i}`), view: L2 }],
    [{ op: 'add', element: F(`fi${i}`, 'dfd-total-order', `p${i}`, `lines ${i}`) }, { op: 'add', element: F(`fo${i}`, `p${i}`, 'dfd-record-order', `checked ${i}`) }],
    [{ op: 'set', id: `p${i}`, path: 'props.number', value: `1.${9 + i}` }],
    [{ op: 'set', view: L1, path: 'notation', value: i % 2 ? 'yourdon' : 'gane-sarson' }],
    [[{ op: 'set', id: `fi${i}`, path: 'label', value: `all lines ${i}` }], [{ op: 'set', id: `p${i}`, path: 'label', value: `Renamed ${i}` }], [{ op: 'add', element: S(`s${i}`, `Store ${i}`, `D${3 + i}`), view: L2 }]][i % 3],
    [[{ op: 'hide', id: `p${i}`, view: L2 }], [{ op: 'delete', id: `fo${i}` }, { op: 'delete', id: `fi${i}` }, { op: 'delete', id: `p${i}` }], [{ op: 'set', view: L2, path: 'direction', value: 'down' }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(DF), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, draw = (m, o, vid) => unid(mapContext(m, o).buildView(vid).markup);
  for (const vid of [L1, L2]) { let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos }, vid);
    assert.equal(session, draw(reopened, {}, vid), vid); assert.equal(describe(reopened, vid), describe(JSON.parse(seen[30]), vid)); }
  assert.ok(memos[L2].runs > 1);
});

test('P1 (S19): on 50 nodes and 60 flows, a full layout under 1 s, and a flow\'s label edited, laid out and drawn under 100 ms (CPU, best of seven) (timed)', () => {
  const nodes = [], edges = [];
  for (let i = 0; i < 30; i++) nodes.push(P(`p${i}`, `Process number ${i}`, String(i + 1)));
  for (let i = 0; i < 10; i++) nodes.push(S(`s${i}`, `Store ${i}`, `D${i + 1}`));
  for (let i = 0; i < 10; i++) nodes.push(X(`x${i}`, `Entity ${i}`));
  // a chain of processes, each fed by an entity or a store of its own neighbourhood, as a drawn level has them
  for (let i = 0; i < 29; i++) edges.push(F(`c${i}`, `p${i}`, `p${i + 1}`, `step ${i}`));
  for (let i = 0; i < 10; i++) edges.push(F(`xi${i}`, `x${i}`, `p${i * 3}`, `request ${i}`), F(`sw${i}`, `p${i * 3 + 1}`, `s${i}`, `record ${i}`));
  for (let i = 0; i < 11; i++) edges.push(F(`sr${i}`, `s${i % 10}`, `p${(i * 3 + 2) % 30}`, `read ${i}`));
  const M = { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'dfd', nodeIds: nodes.map(n => n.id) }] };
  assert.equal(nodes.length, 50); assert.equal(edges.length, 60); assert.deepEqual(validate(M).filter(p => p.level === 'error'), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  draw(M);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => { const was = memos.all.runs, r = { full: timed(() => mapContext(M).buildView('all')), label: timed(() => draw(apply(M, [{ op: 'set', id: 'c7', path: 'label', value: `step ${'x'.repeat(4 + 3 * k)}` }]))) };
    assert.equal(memos.all.runs, was + 1, 'a label lays the view out again'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  // CI holds the 1 s ceiling and prints the edit against S19's 100 ms (the maintainer's decision of 13 Nov 2026)
  assert.ok(best('label') < 1000, `a flow's label ${best('label')} ms`);
  console.log(`# P1 target 100 ms: a flow's label ${best('label')} ms; full layout ${best('full')} ms`);
});

test('audit 3: a comment with no label is named by the id it draws', () => {
  const m = { schemaVersion: 2, nodes: [P('p', 'Take order', '1'), { id: 'note-on-p', type: 'uml.Comment' }], edges: [{ id: 'c', type: 'uml.CommentLink', from: 'note-on-p', to: 'p' }],
    views: [{ id: 'v', diagram: 'dfd', nodeIds: ['p', 'note-on-p'] }] };
  assert.equal(layout(m, 'v').nodes.find(x => x.id === 'note-on-p').aria, 'Comment: note-on-p');
  assert.match(describe(m, 'v'), /Comment: note-on-p\./);
});

test('audit 4: a node typed by an Object.prototype name is drawn as a plain classifier; validate() and describe() do not throw', () => {
  for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const m = { schemaVersion: 2, nodes: [P('p', 'Take order', '1'), { id: 'x', type, label: 'Odd' }], edges: [F('f', 'x', 'x')], views: [{ id: 'v', diagram: 'dfd', title: 'L1', nodeIds: ['p', 'x'] }] };
    assert.equal(layout(m, 'v').byId.x.shape, 'classifier', type);
    assert.ok(validate(m).length, type);
    assert.doesNotMatch(describe(m, 'v'), /native code/, type);
  }
});

test('audit 9: a listed line whose type is an Object.prototype name takes the data flow\'s ends, as an unknown type does, and keeps its arrowhead', () => {
  const m = JSON.parse(readFileSync(new URL('./dfd-minimal.json', import.meta.url)));
  for (const type of ['constructor', 'toString', 'valueOf', '__proto__', 'nonsense']) {
    const n = structuredClone(m); n.edges[0].type = type; n.views[0].edges = n.edges.map(e => e.id);
    assert.deepEqual(layout(n, 'v').edges.find(e => e.id === 'order').end, { from: 'none', to: 'arrow' }, type);
  }
});

// audit 13: a line written inline in a view's edges (model.md) is checked like a model line, in dfd, er, flowchart and
// information flow alike, its path views[i].edges[k]
test('validate: an inline line in dfd, er, flowchart and information flow views is checked as a model line is', async () => {
  for (const f of ['er/er.js', 'flowchart/flowchart.js', 'uml/information.js']) await import(`../src/${f}`);
  const pk = id => ({ id: `${id}.id`, type: 'er.Column', label: 'id', props: { primaryKey: true } });
  const cases = {
    'uml.information-flow': [[{ id: 'a', type: 'uml.Actor', label: 'Shopper' }, { id: 'n', type: 'uml.InformationItem', label: 'Order' }],
      { id: 'f', type: 'uml.InformationFlow', from: 'a', to: 'n', props: { conveyed: [] } }, ['conveyed-some', 'flow-ends']],
    er: [[{ id: 'a', type: 'er.Entity', label: 'A', members: [pk('a')] }, { id: 'b', type: 'er.Entity', label: 'B', members: [pk('b')] }],
      { id: 'r', type: 'er.Relationship', from: 'a', to: 'b', props: { ends: { from: { multiplicity: 'lots' }, to: { multiplicity: '0..*' } } } }, ['relationship-ends']],
    dfd: [[{ id: 's', type: 'dfd.DataStore', label: 'S' }, { id: 'x', type: 'dfd.ExternalEntity', label: 'X' }], { id: 'f', type: 'dfd.DataFlow', from: 'x', to: 's' }, ['dfd-flow-process']],
    flowchart: [[{ id: 's', type: 'flow.Terminator', label: 'Start' }, { id: 'c', type: 'uml.Comment', label: 'note' }], { id: 'f', type: 'flow.Flow', from: 's', to: 'c' }, ['flow-ends']],
  };
  for (const [diagram, [nodes, line, rules]] of Object.entries(cases)) {
    const m = { schemaVersion: 2, nodes, edges: [], views: [{ id: 'v', diagram, title: 'T', nodeIds: nodes.map(n => n.id), edges: [line] }] };
    const got = validate(m).filter(p => rules.includes(p.rule));
    assert.deepEqual([...new Set(got.map(p => p.rule))].sort(), rules, diagram);
    assert.ok(got.every(p => p.path.startsWith('views[0].edges[0]')), `${diagram}: ${got.map(p => p.path)}`);
  }
});

test('audit 25: D on a process with a flow to a store this view alone holds leaves that store and its flow out of the level, said; describe() reads only what a view draws; another kind in words', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'dfd.Process', label: 'Sell', props: { number: '1' } }, { id: 'cust', type: 'dfd.ExternalEntity', label: 'Customer' }],
    edges: [{ id: 'f1', type: 'dfd.DataFlow', from: 'cust', to: 'p', label: 'order' }, { id: 'f2', type: 'dfd.DataFlow', from: 'p', to: 'st', label: 'order rec' }],
    views: [{ id: 'ctx', diagram: 'dfd', title: 'Context', nodeIds: ['p', 'cust', 'st'], nodes: [{ id: 'st', type: 'dfd.DataStore', label: 'Orders', props: { number: 'D1' } }] }] };
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  const r = T.edits.key(m, m.views[0], ['p'], 'd'), m2 = apply(m, r.commands), lv = m2.views[1];
  assert.equal(r.say, 'Made level 1 Sell with 1 flow; D1 Orders lives in this view only, so its flow stays out: Enter opens it');
  assert.deepEqual(lv.nodeIds, ['cust', 'p-1.1']);
  assert.deepEqual(validate(m2).filter(p => p.level === 'error'), [], 'no error after one gesture');
  assert.ok(!m2.edges.some(e => e.to === 'st' && e.id !== 'f2'), 'the flow to the view\'s own store is not copied');
  // a view listing an id that is no node: its line is not drawn, so describe() does not read it either
  const bad = structuredClone(DF), v = bad.views.find(x => x.id === L1), e = bad.edges.find(x => v.nodeIds.includes(x.from) && v.nodeIds.includes(x.to));
  bad.nodes = bad.nodes.filter(x => x.id !== e.to);
  assert.equal(layout(bad, L1).edges.some(x => x.id === e.id), false);
  assert.ok(!describe(bad, L1).includes(` to ${e.to}.`), 'describe() reads only what is drawn');
  // a node of another kind in words, as C4 and information flow say it: "Data type Money", never "DataType Money"
  const k = { schemaVersion: 2, nodes: [{ id: 'p', type: 'dfd.Process', label: 'Sell', props: { number: '1' } }, { id: 'dt', type: 'sysml.DataType', label: 'Money' }],
    edges: [{ id: 'f', type: 'dfd.DataFlow', from: 'p', to: 'dt', label: 'cash' }], views: [{ id: 'v', diagram: 'dfd', nodeIds: ['p', 'dt'] }] };
  assert.match(describe(k, 'v'), /^Data type Money, 1 flow in, 0 out\.$/m);
  assert.equal(layout(k, 'v').byId.dt.aria, 'Data type Money, 1 flow in, 0 out');
});

// audit 31: D on a process the view alone holds made a level no describe() or palette number could tie to its process
test('audit 31: D on a process that lives in one view only refuses, as C4\'s D does; the same process in the model still makes its level', () => {
  const own = { schemaVersion: 2, nodes: [{ id: 'c', type: 'dfd.ExternalEntity', label: 'Customer' }], edges: [],
    views: [{ id: 'v', diagram: 'dfd', title: 'Ctx', nodes: [P('p', 'Take order', '1')], nodeIds: ['c', 'p'],
      edges: [{ id: 'f1', type: 'dfd.DataFlow', from: 'c', to: 'p', label: 'order' }] }] };
  for (const k of ['D', 'd']) assert.deepEqual(T.edits.key(own, own.views[0], ['p'], k), { error: 'process "1 Take order" lives in this view only: no other view can show it' });
  const mod = structuredClone(own); mod.nodes.push(mod.views[0].nodes.pop()); delete mod.views[0].nodes;
  const r = T.edits.key(mod, mod.views[0], ['p'], 'D'), m2 = apply(mod, r.commands);
  assert.equal(r.say, 'Made level 1 Take order, balanced with 1 flow: Enter opens it');
  assert.match(describe(m2, 'p-level').split('\n')[0], /, the level of process "1 Take order",/);
  assert.equal(T.edits.add(m2, m2.views.find(v => v.id === 'p-level'), { type: 'dfd.Process' })[0].element.props.number, '1.2');
});

// audit 26: a view whose edges list names a line of another family drew and named it as its own kind ("Comment link" in
// ER and DFD, a data flow's arrow, "Flow", "Relationship"); listed, it is still drawn (#343), but plain, by its own kind
test('audit 26: a listed line of another family is drawn plain and named by its own kind in ER, DFD, flowchart, information flow and C4 views', () => {
  const cases = {
    dfd: [{ id: 'a', type: 'dfd.ExternalEntity', label: 'A' }, { id: 'b', type: 'dfd.Process', label: 'B' }],
    er: [{ id: 'a', type: 'er.Entity', label: 'A' }, { id: 'b', type: 'er.Entity', label: 'B' }],
    flowchart: [{ id: 'a', type: 'flow.Process', label: 'A' }, { id: 'b', type: 'flow.Process', label: 'B' }],
    'uml.information-flow': [{ id: 'a', type: 'uml.Class', label: 'A' }, { id: 'b', type: 'uml.Class', label: 'B' }],
    'c4.landscape': [{ id: 'a', type: 'c4.Person', label: 'A', props: { description: 'd' } }, { id: 'b', type: 'c4.SoftwareSystem', label: 'B', props: { description: 'd' } }],
    'c4.deployment': [{ id: 'a', type: 'c4.DeploymentNode', label: 'A', props: { description: 'd' } }, { id: 'b', type: 'c4.DeploymentNode', label: 'B', props: { description: 'd' } }],
  };
  for (const [d, nodes] of Object.entries(cases)) {
    const m = { schemaVersion: 2, nodes, edges: [{ id: 'as', type: 'uml.Association', from: 'a', to: 'b', label: 'owns' }, { id: 'nt', from: 'b', to: 'a' }], views: [{ id: 'v', diagram: d, title: 'T', nodeIds: ['a', 'b'], edges: ['as', 'nt'] }] };
    const g = layout(m, 'v'), e = g.edges.find(x => x.id === 'as'), u = g.edges.find(x => x.id === 'nt');
    assert.match(e.aria, /^Association (owns )?from A to B(: owns)?$/, d);
    // a line of no type is a plain "Line"; in a DFD a data flow, as audit 9 draws a line of no family
    if (d === 'dfd') assert.deepEqual([u.aria, u.end], ['Data flow from B to A', { from: 'none', to: 'arrow' }]); else assert.match(u.aria, /^Line from B to A$/, d);
    for (const x of d === 'dfd' ? [e] : [e, u]) assert.deepEqual([x.end.from, x.end.to, !!x.end.dashed], ['none', 'none', false], `${d} ${x.id}`);
    assert.match(describe(m, 'v'), /Association (owns )?from A to B/, d);
  }
});

test('audit 27: a listed line of another family is keyed as "Line"; a node with no type is "Element" in the PDF, as named', async () => {
  const { tablesOf } = await import('../src/page/print.js');
  const m = { schemaVersion: 2, nodes: [P('p', 'Take order', '1'), { id: 'e', type: 'dfd.ExternalEntity', label: 'Customer' }, { id: 'u', label: 'Untyped' }],
    edges: [{ id: 'f', type: 'dfd.DataFlow', from: 'e', to: 'p', label: 'order' }, { id: 'd', type: 'uml.Dependency', from: 'p', to: 'u' }],
    views: [{ id: 'v', diagram: 'dfd', nodeIds: ['p', 'e', 'u'], edges: ['f', 'd'] }] };
  const g = layout(m, 'v'), key = g.legend.map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.ok(key.includes('Line a kind of line this view does not draw as its own'), key.join(' | '));
  for (const v of DF.views) assert.ok(!layout(DF, v.id).legend.some(s => /<b>Line<\/b>/.test(s)), `${v.id}: none where none is drawn`);
  assert.equal(g.byId.u.aria, 'Element Untyped, 0 flows in, 0 out');
  const ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V.v, { nodes: g.nodes, edges: g.edges }), rows = els.rows.map(r => [...r.matchAll(/<td>(.*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, '')));
  assert.deepEqual(rows.find(c => c[0] === 'Untyped').slice(0, 2), ['Untyped', 'Element']);
  assert.deepEqual(rows.find(c => c[0] === 'Customer').slice(0, 2), ['Customer', 'External entity'], 'a typed one as before');
});

// audit 29: a listed line of no type is drawn as a data flow (audit 9), so it is keyed, counted and checked as one too
test('audit 29: a listed line of no type is a data flow throughout: the key, the flow counts, the rules and D read it as drawn', () => {
  for (const type of [undefined, 'nonsense']) {
    const m = { schemaVersion: 2, nodes: [X('c', 'Customer'), P('p', 'Take order', '1')], edges: [],
      views: [{ id: 'v', diagram: 'dfd', title: 'Level 0', nodeIds: ['c', 'p'], edges: [{ id: 'e', from: 'c', to: 'p', label: 'order', ...(type ? { type } : {}) }] }] };
    const g = layout(m, 'v'), key = g.legend.map(s => /<b>([^<]+)<\/b>/.exec(s)[1]);
    assert.deepEqual([g.edges[0].end, g.edges[0].aria], [{ from: 'none', to: 'arrow' }, 'Data flow order from Customer to 1 Take order'], String(type));
    assert.deepEqual(key, ['Process', 'External entity', 'Data flow'], String(type));
    assert.equal(g.byId.p.aria, 'Process 1 Take order, 1 flow in, 0 out', String(type));
    assert.match(describe(m, 'v'), /^External entity Customer, 0 flows in, 1 out\.$/m, String(type));
    assert.deepEqual(validate(m).filter(p => p.rule === 'dfd-process-io').map(p => p.message), ['dfd-process-io: process "1 Take order" has no flow out'], String(type));
    // D copies it to the level as a data flow, so the level balances
    const m2 = apply(m, T.edits.key(m, m.views[0], ['p'], 'd').commands);
    assert.deepEqual(validate(m2).filter(p => p.rule === 'dfd-balance'), [], String(type));
  }
  // not listed, a line of no type is drawn by no view, and no rule reads it
  const n = { schemaVersion: 2, nodes: [X('c', 'Customer'), P('p', 'Take order', '1')], edges: [{ id: 'e', from: 'c', to: 'p', label: 'order' }], views: [{ id: 'v', diagram: 'dfd', nodeIds: ['c', 'p'] }] };
  assert.equal(layout(n, 'v').edges.length, 0);
  assert.equal(validate(n).filter(p => p.rule === 'dfd-process-io').length, 1);
  assert.match(validate(n).find(p => p.rule === 'dfd-process-io').message, /no flow in and no flow out/);
});

test('audit 38: validate() says a story step names a line its DFD or C4 view does not draw by the type\'s own rule, as layout() draws it', () => {
  const m = { schemaVersion: 2, title: 'T', root: 'top',
    nodes: [{ id: 'p1', type: 'dfd.Process', label: 'Take order', props: { number: '1' }, opensView: 'lv' }, { id: 'p2', type: 'dfd.Process', label: 'Ship', props: { number: '2' } },
      { id: 'st', type: 'dfd.DataStore', label: 'Orders', props: { number: 'D1' } }, { id: 'k', type: 'dfd.Process', label: 'Take order', props: { number: '1.1' } }],
    edges: [{ id: 'a', type: 'dfd.DataFlow', from: 'p1', to: 'st', label: 'order' }, { id: 'b', type: 'dfd.DataFlow', from: 'st', to: 'p2', label: 'order' }, { id: 'a1', type: 'dfd.DataFlow', from: 'k', to: 'st', label: 'order' }],
    views: [{ id: 'top', title: 'Top', diagram: 'dfd', nodeIds: ['p1', 'p2', 'st'] }, { id: 'lv', title: 'Level 1', diagram: 'dfd', parent: 'top', nodeIds: ['k', 'st', 'p2'] }],
    stories: [{ id: 's', title: 'S', steps: [{ view: 'lv', select: 'b' }, { view: 'lv', select: 'a1' }, { view: 'top', select: 'b' }] }] };
  assert.deepEqual(layout(m, 'lv').edges.map(e => e.id), ['a1'], 'the level leaves out its parent level\'s flow');
  assert.deepEqual(validate(m).filter(p => p.path.startsWith('stories')).map(p => `${p.path}: ${p.message}`), ['stories[0].steps[0].select: "b" is no line of view "lv": the view does not draw it']);
  // every line of every DFD and C4 view of the examples, and of the stress fixtures: a step that selects it is said not drawn
  // exactly when layout() draws it neither as itself nor inside an implied line
  for (const f of ['../examples/bookshop-atlas.json', '../examples/bookshop-c4.json', '../examples/bookshop-data-flow.json', './c4-stress.json', './dfd-stress.json']) {
    const x = JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
    for (const v of x.views.filter(v => /^(dfd|c4\.)/.test(v.diagram || ''))) {
      const g = layout(x, v.id), drew = new Set(g.edges.flatMap(e => [e.id, ...(e.implied || []), ...(e.of || []).map(r => (r && typeof r === 'object' ? r.id : r))]));
      const ids = x.edges.map(e => e.id), y = { ...x, stories: [{ id: 's', title: 'S', steps: ids.map(id => ({ view: v.id, select: id })) }] };
      const said = new Map(validate(y).filter(p => p.path.startsWith('stories[0]')).map(p => [ids[+/steps\[(\d+)\]/.exec(p.path)[1]], p.message]));
      ids.forEach(id => { const not = /the view does not draw it$/.test(said.get(id) || '');
        if (said.has(id) && !not) return; // said otherwise: an end the view does not show, or its edges list leaving it out
        assert.equal(not, !drew.has(id), `${f} ${v.id} ${id}: ${said.get(id)}`); }); } }
  // C4: a relationship to the subject the container view draws as a boundary
  const c = JSON.parse(readFileSync(new URL('../examples/bookshop-c4.json', import.meta.url), 'utf8'));
  c.stories = [{ id: 's', title: 'S', steps: [{ view: 'c4-containers', select: 'c4-shopper-bookshop', highlight: ['c4-shopper-bookshop'] }] }];
  assert.deepEqual(validate(c).filter(p => p.path.startsWith('stories')).map(p => p.message), Array(2).fill('"c4-shopper-bookshop" is no line of view "c4-containers": the view does not draw it'));
  // a hostile model: odd lines and steps are read without a throw
  const h = structuredClone(m); h.edges.push(null, 7, { id: '__proto__', type: 'dfd.DataFlow', from: 'st', to: 'p2' }, { id: 'constructor', from: { x: 1 }, to: [] });
  h.stories[0].steps.push({ view: 'lv', select: '__proto__' }, { view: 'lv', select: 'constructor', highlight: [null, 3, { type: 'edge', ids: ['b', 'toString'] }] });
  const said = validate(h).filter(p => p.path.startsWith('stories')).map(p => p.message);
  assert.ok(said.includes('"__proto__" is no line of view "lv": the view does not draw it'), said.join('\n'));
  assert.ok(said.filter(s => s === '"b" is no line of view "lv": the view does not draw it').length === 2, said.join('\n'));
});

// audit 44: a node of no DFD kind (none, a typo such as dfd.Entity, another notation's) is drawn with its keyword, so it is not
// read as a Yourdon external entity, and keyed "Element"; a comment, drawn as a note, keyed "Comment", as the flowchart keys it
test('a node of no DFD kind is headed by its keyword and keyed, and a comment is keyed (audit 44)', () => {
  const keys = g => g.legend.map(x => x.match(/<b>(.*?)<\/b>/)[1]);
  for (const [t, word] of [[undefined, 'element'], ['dfd.Entity', 'element'], ['uml.Class', 'class'], ['', 'element']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'c', type: 'dfd.ExternalEntity', label: 'Customer' }, { id: 'p', type: 'dfd.Process', label: 'Take order', props: { number: '1' } }, { id: 'b', ...(t !== undefined ? { type: t } : {}), label: 'Bank' }],
      edges: [{ id: 'e1', type: 'dfd.DataFlow', from: 'c', to: 'p', label: 'order' }, { id: 'e2', type: 'dfd.DataFlow', from: 'p', to: 'b', label: 'payment' }], views: [{ id: 'v', diagram: 'dfd', nodeIds: ['c', 'p', 'b'] }] };
    for (const notation of ['yourdon', 'gane-sarson']) { m.views[0].notation = notation;
      const g = layout(m, 'v'), b = g.nodes.find(n => n.id === 'b'), s = svgOf(g), at = s.indexOf('data-id="b"');
      assert.deepEqual(b.stereotypes, [word], `${t} in ${notation}`);
      assert.ok(s.slice(at, s.indexOf('</g>', at)).includes(`«${word}»`), 'its keyword drawn');
      assert.deepEqual(keys(g), ['Process', 'External entity', 'Element', 'Data flow']); }
  }
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'dfd.Process', label: 'Take order' }, { id: 'x', label: 'Loose element' }, { id: 'c', type: 'uml.Comment', label: 'A note' }], edges: [], views: [{ id: 'v', diagram: 'dfd', nodeIds: ['p', 'x', 'c'] }] };
  assert.deepEqual(keys(layout(m, 'v')), ['Process', 'Element', 'Comment']);
  m.views[0].nodeIds = ['p', 'c']; assert.deepEqual(keys(layout(m, 'v')), ['Process', 'Comment'], 'a comment alone: no Element');
  assert.deepEqual(keys(layout(DF, DF.views[0].id)), keys(layout(DF, DF.views[0].id)).filter(k => k !== 'Element' && k !== 'Comment'), 'the example: neither');
});

// audit 45: a node of a dfd kind the view does not know (the typo dfd.Entity) is named by the word its keyword gives, "Element",
// in its accessible name, describe() and the PDF's kind, so a screen reader does not hear an external entity either
test('a node of an unknown dfd kind is named Element, as it is keyed (audit 45)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'p', type: 'dfd.Process', label: 'Take order' }, { id: 'e', type: 'dfd.Entity', label: 'Ent' }, { id: 'k', type: 'uml.Class', label: 'Klass' }, { id: 'x', label: 'Loose' }],
    edges: [], views: [{ id: 'v', diagram: 'dfd', nodeIds: ['p', 'e', 'k', 'x'] }] };
  const aria = id => layout(m, 'v').nodes.find(n => n.id === id).aria;
  assert.equal(aria('e'), 'Element Ent, 0 flows in, 0 out');
  assert.equal(aria('x'), 'Element Loose, 0 flows in, 0 out');
  assert.equal(aria('k'), 'Class Klass, 0 flows in, 0 out', 'another notation\'s kind keeps its own name');
  assert.ok(describe(m, 'v').includes('Element Ent, 0 flows in, 0 out.'), describe(m, 'v'));
  assert.equal(DFD_TYPE.word(m, 'e'), 'Element');
  assert.equal(DFD_TYPE.word(m, 'p'), 'Process');
});
