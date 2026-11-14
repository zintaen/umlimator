// C4's elements and static views, c4.landscape, c4.context, c4.container and c4.component (work package M2.6,
// notes/milestone-2.md §5.1, §5.2, §6.1, §6.5, §7.5, §7.5.1): the definition under its four names, the element on the map's
// shapes, boundaries, implied lines (G3) and their refusal, the scope rules and the model's, D, the key, names, reading
// order, describe(), the PDF's tables, the editing hooks, a 30-step session saved and reopened, maps untouched, and the P1
// view measured (§11). tests/c4.html draws it in a browser and edits it by pointer and keyboard. Imports src/ to reach the
// internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { SHAPE, SHAPE_NAMES } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { C4_SHAPES, c4Zoom } from '../src/c4/c4.js';

const C4 = JSON.parse(readFileSync(new URL('../examples/bookshop-c4.json', import.meta.url)));
const T = diagramOf({ diagram: 'c4.container' });
const STATIC = ['c4-context', 'c4-containers', 'c4-components'];
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const El = (id, t, label, props = {}, parent) => ({ id, type: 'c4.' + t, label, ...(parent ? { parent } : {}), props: { description: `${label}, described.`, ...props } });
const Rel = (id, from, to, label, technology) => ({ id, type: 'c4.Relationship', from, to, ...(label ? { label } : {}), ...(technology ? { props: { technology } } : {}) });
const withDir = (m, vid, direction) => { const c = structuredClone(m); c.views.find(v => v.id === vid).direction = direction; return c; };
const said = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } finally { console.warn = keep; } };
const mine = (m, rule) => validate(m).filter(p => p.rule === rule);
// each line's drawn path's two ends, from the markup (tests/deployment.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
// how far an end is from its node's outline, along the normal of the box side it sits on: the shape's own inset says where
// the outline is (a person's shoulders, a cylinder's lid); an end beside a person's head (inset null) counts as off
function offOutline(n, [x, y]) {
  const d = { L: Math.abs(x - n.x), R: Math.abs(x - n.x - n.w), T: Math.abs(y - n.y), B: Math.abs(y - n.y - n.h) }, near = (lo, v, hi) => v >= lo - 1 && v <= hi + 1;
  let best = Infinity;
  for (const s of ['L', 'R', 'T', 'B']) { const t = s === 'L' || s === 'R' ? y : x; if (!(s === 'L' || s === 'R' ? near(n.y, y, n.y + n.h) : near(n.x, x, n.x + n.w))) continue;
    const k = SHAPE.c4.inset(n, s, t); if (k == null) continue;
    best = Math.min(best, Math.abs(d[s] - k)); }
  return best;
}

test('the definition: one definition under the four static view names, its palette, lines, properties, hooks and rules', () => {
  assert.deepEqual(['c4.landscape', 'c4.context', 'c4.container', 'c4.component'].map(n => diagramOf({ diagram: n }).name), ['c4.landscape', 'c4.context', 'c4.container', 'c4.component']);
  assert.equal(diagramOf({ diagram: 'c4.context' }).layout, T.layout, 'one definition');
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['c4.Person', 'Person'], ['c4.SoftwareSystem', 'Software system'], ['c4.Container', 'Container'], ['c4.Component', 'Component'], ['uml.Comment', 'Comment']]);
  assert.deepEqual(T.lines.map(e => e.type), ['c4.Relationship', 'uml.CommentLink']);
  assert.deepEqual(T.props['c4.Container'].map(f => f.key), ['description', 'technology', 'external', 'shape']);
  assert.deepEqual(T.props['c4.Person'].map(f => f.key), ['description', 'external', 'shape']);
  assert.deepEqual(T.props['c4.Relationship'].map(f => f.key), ['technology']);
  assert.deepEqual(T.props['c4.Container'].find(f => f.key === 'shape').options, C4_SHAPES);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows', 'text', 'rankFlip']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits), ['add', 'key', 'rename']);
  assert.deepEqual(Object.keys(T.rules), ['c4-level', 'c4-subject', 'c4-owner', 'c4-instance', 'c4-relationship', 'c4-zoom', 'c4-description', 'c4-technology', 'c4-label', 'c4-title']);
});

test('maps draw as now: the map\'s shapes are read only; C4 adds its own two (c4, c4-boundary) and changes none', () => {
  assert.deepEqual(SHAPE_NAMES, ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node']);
  assert.deepEqual(C4_SHAPES, SHAPE_NAMES.filter(s => s !== 'node').sort((a, b) => C4_SHAPES.indexOf(a) - C4_SHAPES.indexOf(b)));
  for (const s of SHAPE_NAMES) assert.equal(SHAPE[s].draw, undefined, `${s} has no typed draw`);
  const map = JSON.parse(readFileSync(new URL('../examples/bookshop.json', import.meta.url))), vid = map.views[0].id;
  assert.equal(svgOf(layout(map, vid)).includes('data-shape="c4"'), false);
});

test('the element (§7.5): the shape props.shape names (a person by default, else a box), sized by its three lines, 160 to 280 px wide; its texts and outline', () => {
  const C = SHAPE.c4, base = { label: 'Shop API', tag: '[Container: Python, FastAPI]', desc: 'Catalogue, basket, checkout and accounts as a JSON API.' };
  const sizes = Object.fromEntries(C4_SHAPES.map(sh => [sh, C.size({ ...base, sh })]));
  for (const [sh, s] of Object.entries(sizes)) assert.ok(s.w >= 160 && s.w <= 280 && s.h >= 60, `${sh}: ${s.w} × ${s.h}`);
  assert.ok(sizes.person.h > sizes.box.h && sizes.cylinder.h > sizes.box.h && sizes.browser.h > sizes.box.h, 'a head, a lid and a title bar take room above the text');
  assert.equal(C.size({ ...base, sh: 'box', label: 'x'.repeat(300) }).w, 280, 'cut at 280 px');
  assert.equal(C.size({ label: 'A', tag: '[Person]', sh: 'box' }).w, 160, 'at least 160 px');
  const four = C.size({ ...base, sh: 'box', desc: 'word '.repeat(300) }), one = C.size({ ...base, sh: 'box', desc: 'Short.' });
  assert.equal(four.h - one.h, 3 * 14, 'four description lines at most, then cut');
  for (const sh of C4_SHAPES) {
    const n = { ...base, sh, id: 'api', k: 'frontend', x: 10, y: 20, ...sizes[sh], aria: 'Container Shop API' }, svg = C.draw(n, 'var(--um-cyan)', 'var(--um-cyan-f)');
    assert.ok(svg.includes(`d="${SHAPE[sh].out(n)}" class="n-body"`), `${sh}: the map shape's outline`);
    assert.match(svg, /data-shape="c4" data-c4="[a-z]+" tabindex="-1" role="img" aria-label="Container Shop API"/);
    assert.match(svg, /class="c-name" data-o="api"[^>]*>Shop API<\/text>[^]*class="c-st"[^>]*>\[Container: Python, FastAPI\]<\/text>[^]*class="c-desc"[^>]*>Catalogue, basket, checkout and<\/text>[^]*class="c-desc"[^>]*>accounts as a JSON API\.<\/text>/, sh);
    const y = [...svg.matchAll(/<text x="[^"]+" y="([^"]+)" text-anchor="middle" class="c-/g)].map(m => +m[1]), [top, bot] = SHAPE[sh].face(n);
    assert.ok(y[0] - 13 >= top - .5 && y.at(-1) + 3 <= n.y + n.h, `${sh}: the text inside the face`);
  }
});

test('23-c4.json\'s static views draw: people and boxes, external grey, the subject a dashed boundary; laid out right and down with no overlap, no line through a node, ends on outlines; the crossings pinned', () => {
  const pinned = { 'c4-context right': [], 'c4-context down': [], 'c4-containers right': ['3 cross'], 'c4-containers down': ['3 cross'], 'c4-components right': ['2 cross'], 'c4-components down': ['2 cross', '1 label on a line'] }, got = {};
  for (const vid of STATIC) for (const direction of ['right', 'down']) {
    const m = withDir(C4, vid, direction), [g, warned] = said(() => layout(m, vid)), tag = `${vid} ${direction}`;
    assert.deepEqual(warned.filter(w => !/is not drawn by this release/.test(w)), [], `${tag}: every line routed`);
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${tag}: ${p.id} and ${q.id} overlap`);
    const probs = check(m, vid).map(p => p.message), kinds = {};
    probs.forEach(p => { const k = / cross$/.test(p) ? 'cross' : / lies on edge /.test(p) ? 'label on a line' : p; kinds[k] = (kinds[k] || 0) + 1; });
    got[tag] = Object.entries(kinds).map(([k, n]) => `${n} ${k}`);
    if (g.byId['c4-shopper']) assert.equal(g.byId['c4-shopper'].sh, 'person');
    assert.equal(g.byId['c4-payments'].ext, true); assert.equal(g.byId['c4-db'] ? g.byId['c4-db'].sh : 'box', 'box');
    assert.ok(g.nodes.filter(n => n.shape === 'c4').every(n => n.kind === (n.ext ? 'external' : 'frontend')));
    const { markup } = mapContext(m).buildView(vid), off = ends(markup).flatMap(({ from, to, a, b }) => [[from, a], [to, b]].map(([id, p]) => [id, offOutline(g.byId[id], p)]).filter(([, d]) => d > 1));
    assert.deepEqual(off, [], `${tag}: ends on outlines`);
  }
  console.log(`# M2.6 23-c4.json check(): ${JSON.stringify(got)}`);
  assert.deepEqual(got, pinned, 'no overlap, overflow, line through a node or label over a node; the crossings and one label on a line pinned (repair and reroute off, §11)');
  const g = layout(C4, 'c4-containers'), f = g.families;
  assert.deepEqual(f.map(x => [x.id, x.title, x.shape]), [['c4-bookshop', 'Bookshop [Software System]', 'c4-boundary']]);
  ['c4-storefront', 'c4-api', 'c4-worker', 'c4-db', 'c4-queue'].forEach(id => assert.ok(inside(g.byId[id], f[0]), id));
  ['c4-shopper', 'c4-payments'].forEach(id => assert.ok(!meets(g.byId[id], f[0]), id));
  assert.equal(g.byId['c4-bookshop'], undefined, 'a boundary is no node');
  assert.ok(!g.edges.some(e => e.from === 'c4-bookshop' || e.to === 'c4-bookshop'), 'its own relationships are not drawn');
  assert.match(svgOf(g), /<rect class="family-box"[^>]*stroke-dasharray="6 4"\/><text class="family-title"[^>]*>Bookshop \[Software System\]</);
  assert.equal(layout(C4, 'c4-components').families[0].title, 'Shop API [Container]');
  // §11: the small gap, labelGaps, both flags off, as laid out
  const memos = {}; mapContext(C4, { memos }).buildView('c4-containers');
  const { gap, rgap, labelGaps, repair, reroute } = memos['c4-containers'].dg;
  assert.deepEqual({ gap, rgap, labelGaps, repair, reroute }, { gap: 48, rgap: 64, labelGaps: true, repair: false, reroute: false });
  assert.deepEqual(memos['c4-containers'].dg.edges.map(e => e.cut), memos['c4-containers'].dg.edges.map(() => 280));
});

test('people first: a line into a person is ranked as from them (rankFlip), so the shopper is not ranked after the email service', () => {
  const g = layout(C4, 'c4-containers'), x = id => g.byId[id].col;
  assert.ok(x('c4-shopper') < x('c4-storefront') && x('c4-shopper') < x('c4-mail'));
  assert.equal(T.rankFlip({ from: 'c4-mail', to: 'c4-shopper' }), true); assert.equal(T.rankFlip({ from: 'c4-shopper', to: 'c4-storefront' }), false);
});

test('a landscape view: people and software systems, laid out clean right and down', () => {
  const m = { schemaVersion: 2, nodes: [El('u', 'Person', 'Customer'), El('a', 'SoftwareSystem', 'Shop'), El('b', 'SoftwareSystem', 'Warehouse'), El('c', 'SoftwareSystem', 'Bank', { external: true })],
    edges: [Rel('r1', 'u', 'a', 'Buys from'), Rel('r2', 'a', 'b', 'Ships through', 'HTTPS'), Rel('r3', 'a', 'c', 'Takes payments with', 'HTTPS')],
    views: [{ id: 'l', diagram: 'c4.landscape', title: 'Landscape', nodeIds: ['u', 'a', 'b', 'c'] }] };
  assert.deepEqual(validate(m), []);
  for (const d of ['right', 'down']) { const x = withDir(m, 'l', d); assert.deepEqual(check(x, 'l'), [], d); assert.equal(layout(x, 'l').edges.length, 3); }
  assert.equal(layout(m, 'l').edges.find(e => e.id === 'r2').label, 'Ships through [HTTPS]');
});

// ---- implied relationships (§5.2, G3)
const G3 = (() => { const m = structuredClone(C4);
  m.edges = m.edges.filter(e => e.id !== 'c4-bookshop-payments'); // the system's own line to the payment provider gone: its containers' and components' are implied
  m.views.push({ id: 'ctx', diagram: 'c4.context', title: 'Implied', subject: 'c4-bookshop', nodeIds: ['c4-shopper', 'c4-bookshop', 'c4-payments', 'c4-courier', 'c4-mail'] });
  return m; })();
test('implied lines (§5.2, G3): one dashed line a pair for what the view does not show, its id <from>-><to>, its label the first relationship\'s and [+k]; none where a relationship joins the pair; none lifted onto one element; a boundary is no end', () => {
  const g = layout(G3, 'ctx'), imp = g.edges.filter(e => e.implied);
  assert.deepEqual(imp.map(e => [e.id, e._id, e.from, e.to, e.label, e.implied]), [['c4-bookshop->c4-payments', 'c4-bookshop->c4-payments', 'c4-bookshop', 'c4-payments', 'Charges cards with [+1]', ['c4-api-payments', 'c4-payment-client-payments']]]);
  assert.deepEqual(imp[0].end, { from: 'none', to: 'open', dashed: true });
  assert.equal(imp[0].aria, 'Implied relationship from Bookshop to Payment provider, standing for 2 relationships: Shop API to Payment provider, Charges cards with; Payment client to Payment provider, Starts a card payment with. Edit them where their own ends are shown');
  // the worker's lines to the courier and the email service are hidden by the system's own; the shopper's to the storefront by its own to the system
  assert.deepEqual(g.edges.filter(e => !e.implied).map(e => e.id).sort(), ['c4-bookshop-courier', 'c4-bookshop-mail', 'c4-mail-shopper', 'c4-shopper-bookshop']);
  assert.ok(!g.edges.some(e => e.from === e.to), 'the containers\' lines among themselves lift onto the system: dropped');
  assert.match(svgOf(g), /data-from="c4-bookshop" data-to="c4-payments"[^]*?stroke-dasharray="6 4"/);
  assert.deepEqual(check(G3, 'ctx'), []);
  // a boundary is no end: the container view's subject holds the containers, so nothing is lifted onto it
  const c = structuredClone(G3); c.views.find(v => v.id === 'c4-containers').nodeIds = c.views.find(v => v.id === 'c4-containers').nodeIds.filter(id => id !== 'c4-api');
  const h = layout(c, 'c4-containers');
  assert.ok(!h.edges.some(e => e.implied), 'the API hidden: its lines go, none to the boundary');
  // a view that lists its lines: what it leaves out between shown elements is hidden, never implied
  const l = structuredClone(G3); l.views.find(v => v.id === 'ctx').edges = ['c4-shopper-bookshop'];
  assert.deepEqual(layout(l, 'ctx').edges.map(e => e.id), ['c4-shopper-bookshop', 'c4-bookshop->c4-payments']);
  // derived when drawn: an edit to the model shows; nothing is stored
  const more = apply(G3, [{ op: 'add', element: Rel('new', 'c4-worker', 'c4-payments', 'Refunds with') }]);
  assert.equal(layout(more, 'ctx').edges.find(e => e.implied).label, 'Charges cards with [+2]');
  assert.deepEqual(G3.edges.filter(e => String(e.id).includes('->')), []);
});

test('an implied line is refused for editing: no element has its id, so no command can name it, no hook acts on it, and the canvas leaves a positional id out of every gesture', () => {
  const id = 'c4-bookshop->c4-payments', ctx = G3.views.find(v => v.id === 'ctx');
  assert.ok(layout(G3, 'ctx').edges.some(e => e.id === id && e.implied), 'the implied line is drawn');
  for (const k of ['T', 'D']) assert.equal(T.edits.key(G3, ctx, [id], k), null, `${k} on an implied line`);
  assert.equal(T.text(G3, ctx, id), null);
  for (const c of [{ op: 'set', id, path: 'label', value: 'x' }, { op: 'delete', id }, { op: 'hide', id, view: 'ctx' }]) assert.throws(() => apply(G3, c), new RegExp(id.replace(/[->]/g, '.')));
  // what the canvas's selection of it holds (src/canvas/edit.js idsOf): a line id holding '->' is no element's, left out
  const src = readFileSync(new URL('../src/canvas/edit.js', import.meta.url), 'utf8');
  assert.match(src, /r\.type === 'edge' \? arrOf\(r\.ids\)\.filter\(x => !String\(x\)\.includes\('->'\)\)/, 'the canvas refuses a positional line id (tests/c4.html drives the gestures)');
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup; a person\'s body raised on a copy', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(C4, { memos }).buildView('c4-containers'), pts = JSON.stringify(memos['c4-containers'].g.edges.map(e => e.pts)), second = mapContext(C4, { memos }).buildView('c4-containers');
  assert.equal(memos['c4-containers'].runs, 1);
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos['c4-containers'].g.edges.map(e => e.pts)), pts);
  assert.ok(memos['c4-containers'].g.nodes.every(n => n.portTop === undefined), 'layoutTyped\'s nodes untouched');
});

test('names, reading order and the key (A1, §7.5): each element by type, technology and description; the boundary and what it holds first; each type, shape, external, the relationship and the implied line keyed', () => {
  const g = layout(C4, 'c4-containers'), s = svgOf(g);
  assert.equal(g.byId['c4-api'].aria, 'Container Shop API, Python, FastAPI: Catalogue, basket, checkout and accounts as a JSON API.');
  assert.equal(g.byId['c4-shopper'].aria, 'Person Shopper: Browses the catalogue, buys books and tracks orders.');
  assert.equal(g.byId['c4-payments'].aria, 'External software system Payment provider: Takes card payments and makes refunds.');
  assert.equal(g.families[0].aria, 'Software system Bookshop, a boundary holding 5 containers');
  assert.equal(g.edges.find(e => e.id === 'c4-storefront-api').aria, 'Relationship from Storefront to Shop API: Reads the catalogue and places orders through [JSON over HTTPS]');
  assert.match(s, /role="img" aria-label="Container Shop API, Python, FastAPI: Catalogue/);
  assert.match(s, /class="family" data-family="c4-bookshop" role="img" aria-label="Software system Bookshop, a boundary holding 5 containers"/);
  assert.deepEqual(g.order.slice(0, 6), ['c4-bookshop', 'c4-storefront', 'c4-api', 'c4-worker', 'c4-db', 'c4-queue']);
  assert.equal(g.order.length, 11 + 11);
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Person', 'Container', 'External software system', 'Relationship']);
  assert.deepEqual(layout(G3, 'ctx').legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]).filter(w => /elationship/.test(w)), G3.views.find(v => v.id === 'ctx').nodeIds.length && layout(G3, 'ctx').edges.some(e => !e.implied) ? ['Relationship', 'Implied relationship'] : ['Implied relationship']);
  const only = structuredClone(G3); only.views.find(v => v.id === 'ctx').nodeIds = ['c4-bookshop', 'c4-payments'];
  assert.deepEqual(layout(only, 'ctx').legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Software system', 'External software system', 'Implied relationship'], 'only implied lines: no solid line keyed');
  const shaped = structuredClone(C4); shaped.nodes.find(n => n.id === 'c4-db').props.shape = 'cylinder';
  assert.ok(layout(shaped, 'c4-containers').legend.some(l => /<b>Container, cylinder<\/b>/.test(l)));
  assert.equal(layout(shaped, 'c4-containers').byId['c4-db'].sh, 'cylinder');
  assert.deepEqual(layout(G3, 'ctx').legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Person', 'Software system', 'External software system', 'Relationship', 'Implied relationship']);
});

test('describe(): the view in sentences, the boundary and each element in reading order, then each relationship, implied ones counted', () => {
  const d = describe(C4, 'c4-containers').split('\n');
  assert.equal(d[0], 'Bookshop: containers: a C4 container diagram of 11 elements and 11 relationships.');
  assert.deepEqual(d.slice(1, 3), ['Software system Bookshop, a boundary holding 5 containers.', 'Container Storefront, TypeScript, React: The shop in the browser: catalogue, basket and checkout, and the admin pages for staff.']);
  assert.equal(d.length, 1 + 11 + 11);
  assert.equal(describe(G3, 'ctx').split('\n')[0], 'Implied: a C4 system context diagram of 5 elements and 5 relationships, 1 of them implied.');
  assert.match(describe(G3, 'ctx'), /\nImplied relationship from Bookshop to Payment provider, standing for 2 relationships: [^\n]+ shown\.$/);
});

test('the PDF\'s tables (§9): an element\'s type, its technology and description; a relationship\'s text with its technology', () => {
  const v = C4.views[1];
  assert.deepEqual(['c4-shopper', 'c4-bookshop', 'c4-api', 'c4-catalogue', 'nowhere'].map(id => T.word(C4, id)), ['Person', 'Software system', 'Container', 'Component', null]);
  assert.deepEqual(T.rows(C4, v, 'c4-api'), ['Python, FastAPI', 'Catalogue, basket, checkout and accounts as a JSON API.']);
  assert.deepEqual(T.rows(C4, v, 'c4-payments'), ['Takes card payments and makes refunds.', 'external']);
  assert.equal(T.rows(C4, v, 'c4-device'), null);
  assert.equal(T.text(C4, v, 'c4-storefront-api'), 'Reads the catalogue and places orders through [JSON over HTTPS]');
  assert.equal(T.text(C4, v, 'c4-checkout-order-store'), 'Saves the paid order with');
  assert.equal(T.text(C4, v, 'c4-bookshop->c4-payments'), null, 'an implied line: its label');
});

// ---- §5.1, §6.5: validators, each with a passing and a failing case
const V = id => C4.views.findIndex(v => v.id === id);
const BREAKS = {
  'c4-level': [m => { m.views[V('c4-containers')].nodeIds.push('c4-catalogue'); return ['c4-catalogue']; }, 'error'],
  'c4-subject': [m => { m.views.push({ id: 'x', diagram: 'c4.container', title: 'X', subject: 'c4-api', nodeIds: ['c4-shopper'] }); return ['c4-api']; }, 'error'],
  'c4-owner': [m => { m.nodes.find(n => n.id === 'c4-browser').parent = 'c4-api'; return ['c4-browser', 'c4-api']; }, 'error'],
  'c4-instance': [m => { m.nodes.find(n => n.id === 'c4-db-1').props.container = 'c4-catalogue'; return ['c4-db-1', 'c4-catalogue']; }, 'error'],
  'c4-relationship': [m => { m.edges.push(Rel('bad', 'c4-api', 'c4-db-1', 'Writes')); return ['bad', 'c4-api', 'c4-db-1']; }, 'error'],
  'c4-zoom': [m => { m.nodes.find(n => n.id === 'c4-api').opensView = 'c4-containers'; return ['c4-api', 'c4-bookshop']; }, 'warning'],
  'c4-description': [m => { delete m.nodes.find(n => n.id === 'c4-courier').props.description; return ['c4-courier']; }, 'warning'],
  'c4-technology': [m => { delete m.nodes.find(n => n.id === 'c4-worker').props.technology; return ['c4-worker']; }, 'warning'],
  'c4-label': [m => { delete m.edges.find(e => e.id === 'c4-api-db').label; return ['c4-api-db', 'c4-api', 'c4-db']; }, 'warning'],
  'c4-title': [m => { delete m.views[V('c4-components')].title; return []; }, 'warning'],
};
test('validators: 23-c4.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level, once in validate()', () => {
  const ours = m => validate(m).filter(p => /^c4-/.test(p.rule ?? ''));
  assert.deepEqual(ours(C4), []);
  for (const [rule, [broke, level]] of Object.entries(BREAKS)) {
    const m = structuredClone(C4), ids = broke(m), got = ours(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, level, rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
  }
  const msg = (f, m = structuredClone(C4)) => { f(m); return ours(m).map(p => p.message); };
  assert.deepEqual(msg(m => m.views[V('c4-containers')].nodeIds.push('c4-catalogue')), ['c4-level: "Catalogue", a component, is not drawn in a container view']);
  assert.deepEqual(msg(m => m.views[V('c4-components')].nodeIds.push('c4-db-1')), ['c4-level: "Database", a container instance, is not drawn in a component view']);
  assert.deepEqual(msg(m => { m.nodes.push(El('c', 'Component', 'Elsewhere', { technology: 'Go' }, 'c4-worker')); m.views[V('c4-components')].nodeIds.push('c'); }), ['c4-level: "Elsewhere", a component of "Order worker", is not drawn in a component view']);
  assert.deepEqual(msg(m => { m.views[V('c4-context')].nodeIds.push('c4-storefront'); }), ['c4-level: "Storefront", a container, is not drawn in a context view']);
  assert.deepEqual(msg(m => { m.views[V('c4-context')].nodeIds = m.views[V('c4-context')].nodeIds.filter(id => id !== 'c4-bookshop'); }), ['c4-subject: "Bookshop" is not shown: a context view shows its software system']);
  assert.deepEqual(msg(m => { delete m.views[V('c4-context')].subject; }), ['c4-subject: a context view names the software system it is about as its subject']);
  assert.deepEqual(msg(m => { m.views.push({ id: 'x', diagram: 'c4.container', title: 'X', nodeIds: ['c4-shopper'] }); }), ['c4-subject: the view has no subject: a container view zooms into a software system']);
  assert.deepEqual(msg(m => { m.views.push({ id: 'x', diagram: 'c4.component', title: 'X', subject: 'c4-bookshop', nodeIds: ['c4-shopper'] }); }), ['c4-subject: its subject "Bookshop" is a software system: a component view zooms into a container']);
  assert.deepEqual(msg(m => { delete m.nodes.find(n => n.id === 'c4-api').parent; }), ['c4-owner: "Shop API", a container, is owned by nothing: its owner is a software system']);
  assert.deepEqual(msg(m => { m.nodes.find(n => n.id === 'c4-browser').parent = 'c4-api'; }), ['c4-owner: "Web browser", a deployment node, is owned by "Shop API", a container: its owner is a deployment node or none']);
  assert.deepEqual(msg(m => { m.edges.push(Rel('own', 'c4-catalogue', 'c4-api', 'Lives in')); }), ['c4-relationship: own joins "Catalogue" and its own owner or part "Shop API"']);
  // §7.5.1: only the subject is a boundary; an element listed with any other owner is an error (it would be boxed, its lines dropped)
  assert.deepEqual(msg(m => { m.views[V('c4-components')].nodeIds.push('c4-bookshop'); }), ['Shop API', 'Storefront', 'Database', 'Order queue'].map(x => `c4-level: "${x}" is listed with its owner "Bookshop", which is not the view's subject: only the subject is drawn as a boundary`));
  assert.deepEqual(msg(m => { m.nodes.push(El('pc', 'Container', 'Gateway', { technology: 'Go' }, 'c4-payments')); m.views[V('c4-containers')].nodeIds.push('pc'); }), ['c4-level: "Gateway" is listed with its owner "Payment provider", which is not the view\'s subject: only the subject is drawn as a boundary']);
  // a person or software system is owned by nothing (T can leave a parent on one)
  assert.deepEqual(msg(m => { m.nodes.find(n => n.id === 'c4-staff').parent = 'c4-payments'; }), ['c4-owner: "Shop staff", a person, is owned by "Payment provider", a software system: it is owned by nothing',
    ...[0, 1].map(() => 'c4-level: "Shop staff" is listed with its owner "Payment provider", which is not the view\'s subject: only the subject is drawn as a boundary')], 'in the context and the container view');
  // a relationship written inline in the view's edges is checked and named by its own path
  const inl = structuredClone(C4), cv = inl.views[V('c4-containers')]; cv.edges = [...inl.edges.filter(e => cv.nodeIds.includes(e.from) && cv.nodeIds.includes(e.to)).map(e => e.id), { id: 'il', type: 'c4.Relationship', from: 'c4-worker', to: 'c4-courier', props: { technology: 'HTTPS' } }, Rel('ib', 'c4-api', 'c4-db-1', 'Writes')];
  assert.deepEqual(ours(inl).map(p => [p.rule, p.path]), [['c4-relationship', `views[${V('c4-containers')}].edges[${cv.edges.length - 1}]`], ['c4-label', `views[${V('c4-containers')}].edges[${cv.edges.length - 2}].label`]]);
  assert.equal(T.text(inl, cv, 'il'), '[HTTPS]', 'the PDF reads an inline relationship\'s technology');
  // the landscape view: a container is an error; the model's rules are said once whatever the number of views
  const land = structuredClone(C4); land.views.push({ id: 'land', diagram: 'c4.landscape', title: 'All', nodeIds: ['c4-shopper', 'c4-bookshop', 'c4-api'] });
  assert.deepEqual(ours(land).map(p => p.message), ['c4-level: "Shop API", a container, is not drawn in a landscape view']);
  const twice = structuredClone(land); twice.nodes.find(n => n.id === 'c4-worker').parent = 'c4-api';
  assert.equal(ours(twice).filter(p => p.rule === 'c4-owner').length, 1);
  // §6.5: a view of another notation opened is not checked
  const er = structuredClone(C4); er.nodes.find(n => n.id === 'c4-db').opensView = 'schema'; er.views.push({ id: 'schema', diagram: 'er', nodeIds: [] });
  assert.deepEqual(ours(er), []);
});

// ---- editing (§6.1, §7.5)
test('D (§6.1): a software system that opens no view makes its container view, a container its component view: one transaction, laid out clean, undone byte-identical', () => {
  const m0 = structuredClone(C4); delete m0.nodes.find(n => n.id === 'c4-bookshop').opensView; delete m0.nodes.find(n => n.id === 'c4-api').opensView;
  const ctx = m0.views[V('c4-context')], r = T.edits.key(m0, ctx, ['c4-bookshop'], 'D');
  assert.equal(r.say, 'Made the view Bookshop: containers: Enter opens it');
  assert.deepEqual(r.commands, [{ op: 'addView', view: { id: 'c4-bookshop-containers', diagram: 'c4.container', title: 'Bookshop: containers', parent: 'c4-context', subject: 'c4-bookshop',
    nodeIds: ['c4-bookshop', 'c4-storefront', 'c4-api', 'c4-worker', 'c4-db', 'c4-queue', 'c4-shopper', 'c4-staff', 'c4-payments', 'c4-courier', 'c4-mail'] } },
  { op: 'set', id: 'c4-bookshop', path: 'opensView', value: 'c4-bookshop-containers' }]);
  const h = history(m0), was = JSON.stringify(h.model); h.push(apply(h.model, r.commands));
  const m1 = h.model, [g, warned] = said(() => layout(m1, 'c4-bookshop-containers'));
  assert.deepEqual(warned.filter(w => !/is not drawn by this release/.test(w)), []); assert.equal(g.families[0].id, 'c4-bookshop'); assert.equal(g.nodes.length, 10);
  assert.deepEqual(validate(m1).filter(p => /^c4-/.test(p.rule ?? '')), []);
  assert.equal(JSON.stringify(h.undo()), was, 'undo takes it all back');
  // a container: its components and what their relationships reach, a level down (a component of another container as its container)
  const c = T.edits.key(m1, m1.views[V('c4-containers')], ['c4-api'], 'd').commands[0].view;
  assert.deepEqual([c.id, c.diagram, c.title, c.subject, c.parent], ['c4-api-components', 'c4.component', 'Shop API: components', 'c4-api', 'c4-containers']);
  assert.deepEqual(c.nodeIds, ['c4-api', 'c4-catalogue', 'c4-checkout', 'c4-accounts', 'c4-payment-client', 'c4-order-store', 'c4-storefront', 'c4-payments', 'c4-db', 'c4-queue']);
  assert.deepEqual(validate(apply(m1, T.edits.key(m1, m1.views[V('c4-containers')], ['c4-api'], 'd').commands)).filter(p => p.level === 'error'), []);
  // the next free id; an element that opens a view, a person, a component, no selection or another key: the canvas's own
  const taken = structuredClone(m0); taken.views.push({ id: 'c4-bookshop-containers' });
  assert.equal(T.edits.key(taken, ctx, ['c4-bookshop'], 'D').commands[0].view.id, 'c4-bookshop-containers-2');
  assert.deepEqual(T.edits.key(C4, ctx, ['c4-bookshop'], 'D'), { error: 'Bookshop opens "c4-containers" already: Enter opens it' }, 'it opens a view already: said on the hint line');
  for (const [ids, k] of [[['c4-shopper'], 'D'], [['c4-catalogue'], 'D'], [[], 'D'], [['c4-bookshop'], 'x']]) assert.equal(T.edits.key(m0, ctx, ids, k), null, `${ids} ${k}`);
});

test('T: an element\'s type picked among the four; add: a container in a container view is owned by its subject; the Owner field', () => {
  const v = C4.views[V('c4-containers')], r = T.edits.key(C4, v, ['c4-worker'], 'T');
  assert.deepEqual(r.pick, ['Person', 'Software system', 'Container', 'Component']);
  assert.deepEqual(r.then(3), [{ op: 'set', id: 'c4-worker', path: 'type', value: 'c4.Component' }]);
  assert.deepEqual(r.then(2), [], 'its own type: nothing');
  assert.deepEqual(mine(apply(C4, r.then(3)), 'c4-owner').map(p => p.ids), [['c4-worker', 'c4-bookshop']], 'c4-owner says what no longer fits');
  assert.equal(T.edits.key(C4, v, ['c4-device'], 'T'), null);
  assert.deepEqual(T.edits.add(C4, v, { type: 'c4.Container' }, 'Cache'), [{ op: 'add', element: { id: 'container1', type: 'c4.Container', label: 'Cache', parent: 'c4-bookshop' }, view: 'c4-containers' }]);
  assert.deepEqual(T.edits.add(C4, C4.views[V('c4-components')], { type: 'c4.Component' }, 'Search')[0].element.parent, 'c4-api');
  assert.equal(T.edits.add(C4, v, { type: 'c4.Person' }, 'Clerk'), null, 'the default add');
  assert.equal(T.edits.add(C4, C4.views[V('c4-context')], { type: 'c4.Container' }, 'Cache'), null);
  const added = apply(C4, T.edits.add(C4, v, { type: 'c4.Container' }, 'Cache'));
  assert.ok(layout(added, 'c4-containers').families[0].nodeIds.includes('container1'));
  assert.deepEqual(T.owners(C4, C4.nodes.find(n => n.id === 'c4-api')).map(o => o.id), ['c4-bookshop', 'c4-payments', 'c4-mail', 'c4-courier']);
  assert.deepEqual(T.owners(C4, C4.nodes.find(n => n.id === 'c4-catalogue')).map(o => o.id), ['c4-storefront', 'c4-api', 'c4-worker', 'c4-db', 'c4-queue']);
  assert.equal(T.owners(C4, C4.nodes.find(n => n.id === 'c4-shopper')), null); assert.equal(T.owners(C4, C4.edges[0]), null);
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [], vid = 'c4-containers';
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: El(`c${i}`, 'Container', `Service ${i}`, { technology: 'Go' }, 'c4-bookshop'), view: vid }],
    [{ op: 'add', element: Rel(`r${i}`, `c${i}`, 'c4-db', 'Reads from', 'SQL') }],
    [{ op: 'set', id: `c${i}`, path: 'props.description', value: `Does part ${i} of the work.` }],
    [{ op: 'set', id: `c${i}`, path: 'props.shape', value: C4_SHAPES[i + 2] }],
    [[{ op: 'set', id: `r${i}`, path: 'label', value: `Writes ${i}` }], [{ op: 'set', id: `c${i}`, path: 'props.external', value: true }], [{ op: 'set', id: `r${i}`, path: 'props.technology', value: 'gRPC' }]][i % 3],
    [[{ op: 'hide', id: `c${i}`, view: vid }], [{ op: 'delete', id: `c${i}` }], [{ op: 'set', id: `c${i}`, path: 'label', value: `Renamed ${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(C4), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-'), draw = (m, o) => unid(mapContext(m, o).buildView(vid).markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos[vid].runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, vid), describe(JSON.parse(seen[30]), vid));
});

// §10, §11: 50 elements and 70 relationships in a container view: a system holding 30 containers (a third of them cylinders),
// 5 people and 14 external systems; long descriptions
const STRESS = (() => {
  const nodes = [El('sys', 'SoftwareSystem', 'Platform')], edges = [];
  for (let i = 0; i < 5; i++) nodes.push(El(`p${i}`, 'Person', `Person ${i}`, { description: `A user of kind ${i} who signs in and works with the platform every day.` }));
  for (let i = 0; i < 30; i++) nodes.push(El(`c${i}`, 'Container', `Service ${i}`, { technology: i % 3 ? 'Go' : 'PostgreSQL', shape: i % 3 ? 'box' : 'cylinder', description: `Handles part ${i} of the work: ${'reads, writes and checks records '.repeat(1 + i % 3)}` }, 'sys'));
  for (let i = 0; i < 14; i++) nodes.push(El(`x${i}`, 'SoftwareSystem', `External ${i}`, { external: true }));
  let k = 0; const rel = (a, b, t) => edges.push(Rel(`r${k++}`, a, b, t, 'HTTPS'));
  for (let i = 0; i < 5; i++) rel(`p${i}`, `c${i * 6}`, 'Uses');
  for (let i = 0; i < 29; i++) rel(`c${i}`, `c${i + 1}`, 'Calls');
  for (let i = 0; i < 14; i++) rel(`c${(i * 2 + 1) % 30}`, `x${i}`, 'Sends to');
  for (let i = 0; i < 22; i++) rel(`c${(i * 7) % 30}`, `c${(i * 11 + 3) % 30}`, 'Reads from');
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'c4.container', title: 'All', subject: 'sys', nodeIds: nodes.map(n => n.id) }] };
})();
test('P1 (§11), C4\'s view measured first: on 50 elements and 70 relationships, a full layout, an element\'s description (its node grows) and the edits that move nothing (external; §11\'s technology), laid out and drawn under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of seven) (timed)', () => {
  assert.equal(STRESS.nodes.length, 50); assert.equal(STRESS.edges.length, 70); assert.deepEqual(validate(STRESS), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all');
  said(() => draw(STRESS));
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => said(() => { const r = { full: timed(() => mapContext(STRESS).buildView('all')) };
    const grown = apply(STRESS, [{ op: 'set', id: 'c4', path: 'props.description', value: 'More to say. '.repeat(4 + 3 * k) }]), was = memos.all.runs;
    r.desc = timed(() => draw(grown));
    assert.equal(memos.all.runs, was + 1, 'a description that grows its node lays the view out again');
    r.still = timed(() => draw(apply(grown, [{ op: 'set', id: 'c5', path: 'props.external', value: true }])));
    assert.equal(memos.all.runs, was + 1, 'external repaints: nothing laid out');
    r.tech = timed(() => draw(apply(grown, [{ op: 'set', id: 'c5', path: 'props.technology', value: 'Rust' }]))); assert.equal(memos.all.runs, was + 1, 'a technology that keeps the node\'s size repaints: nothing laid out');
    draw(STRESS); return r; })[0]);
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  assert.ok(best('desc') < 1000, `a description ${best('desc')} ms`); assert.ok(best('still') < 1000, `external ${best('still')} ms`); assert.ok(best('tech') < 1000, `technology ${best('tech')} ms`);
  console.log(`# P1 target 100 ms (C4, M2.6): an element's description ${best('desc').toFixed(1)} ms, external (moves nothing) ${best('still').toFixed(1)} ms, a container's technology (§11's named edit, moves nothing) ${best('tech').toFixed(1)} ms; full layout ${best('full').toFixed(1)} ms; routes ${JSON.stringify(said(() => layout(STRESS, 'all'))[0].stats)}`);
});

test('audit 1: D leaves a container reached with its system to it; c4-relationship on a non-C4 end; a container view may show other systems\' containers', () => {
  const d = { description: 'd' }, dt = { description: 'd', technology: 't' };
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'c4.SoftwareSystem', label: 'Shop', props: d }, { id: 'a', type: 'c4.Container', label: 'API', parent: 's', props: dt },
    { id: 's2', type: 'c4.SoftwareSystem', label: 'Payments', props: d }, { id: 'c2', type: 'c4.Container', label: 'Payments API', parent: 's2', props: dt }],
  edges: [Rel('r1', 'a', 's2', 'pays via'), Rel('r2', 'a', 'c2', 'calls')], views: [{ id: 'land', diagram: 'c4.landscape', title: 'L', nodeIds: ['s', 's2'] }] };
  const z = apply(m, c4Zoom(m, m.views[0], ['s']).commands);
  assert.deepEqual(z.views.at(-1).nodeIds, ['s', 'a', 's2'], 'Payments API is left to Payments, its lines lifted onto it');
  assert.deepEqual(validate(z).filter(p => p.level === 'error'), []);
  const n = { ...m, nodes: [...m.nodes, { id: 'n', type: 'uml.Comment', label: 'a note' }], edges: [Rel('r3', 's', 'n', 'reads')], views: [{ id: 'v', diagram: 'c4.landscape', title: 'L', nodeIds: ['s', 'n'] }] };
  assert.deepEqual(validate(n).filter(p => p.rule === 'c4-relationship').map(p => p.message),
    ['c4-relationship: r3 joins "Shop", a software system, and "a note", a comment: a relationship joins two static elements or two deployment elements']);
  const cv = { ...m, edges: [], views: [{ id: 'v', diagram: 'c4.container', title: 'C', subject: 's', nodeIds: ['s', 'a', 'c2'] }] };
  assert.deepEqual(validate(cv).filter(p => p.rule === 'c4-level'), [], 'another system\'s container on a container view');
  assert.match(readFileSync(new URL('../docs/conformance/c4.md', import.meta.url), 'utf8'), /containers too \(its subject's and other systems'\)/);
});
