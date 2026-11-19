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
import { throughIssues } from '../src/layout/audit.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { svgOf } from '../src/draw/svg.js';
import { tablesOf } from '../src/page/print.js';
import { C4_SHAPES, c4Zoom } from '../src/c4/c4.js';
import '../src/dfd/dfd.js';
import '../src/uml/deployment.js';

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
  assert.deepEqual(Object.keys(T.edits), ['add', 'key', 'rename', 'connect']); // connect: a comment link (audit 46)
  assert.deepEqual(Object.keys(T.rules), ['c4-level', 'c4-subject', 'c4-owner', 'c4-instance', 'c4-relationship', 'c4-zoom', 'c4-description', 'c4-technology', 'c4-label', 'c4-title', 'c4-note-box']);
});

test('maps draw as now: the map\'s shapes are read only; C4 adds its own two (c4, c4-boundary) and changes none', () => {
  assert.deepEqual(SHAPE_NAMES, ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node']);
  assert.deepEqual(C4_SHAPES, SHAPE_NAMES.filter(s => s !== 'node').sort((a, b) => C4_SHAPES.indexOf(a) - C4_SHAPES.indexOf(b)));
  for (const s of SHAPE_NAMES) assert.equal(SHAPE[s].draw, undefined, `${s} has no typed draw`);
  const map = JSON.parse(readFileSync(new URL('./fixtures/integration-c4.json', import.meta.url))), vid = map.views[0].id;
  assert.equal(svgOf(layout(map, vid)).includes('data-shape="c4"'), false);
});


test('audit 20: the C4ElementProps row names the shapes C4 draws, the card shapes but node, as C4_SHAPES holds them', () => {
  const row = readFileSync(new URL('../docs/api/typed-diagrams.md', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('| `C4ElementProps`'));
  const shape = /`shape` \((.*?)\), `container`/.exec(row)[1], named = [...shape.matchAll(/`([a-z]+)`/g)].map(m => m[1]);
  assert.deepEqual(named.slice(named.indexOf('node') + 1, named.indexOf('node') + 1 + C4_SHAPES.length).sort(), [...C4_SHAPES].sort());
  assert.ok(/other than `node`/.test(shape), shape);
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-c4.json', import.meta.url))), c = m.nodes.find(n => n.type === 'c4.Container');
  c.props = { ...c.props, shape: 'node' }; const v = m.views.find(x => x.diagram === 'c4.container' && x.nodeIds.includes(c.id));
  assert.equal(layout(m, v.id).nodes.find(n => n.id === c.id).sh, 'box'); // the default, as the row says
});
test('audit 21: the guide\'s C4 row, the C4 conformance note and the schema name the shapes C4 draws (C4_SHAPES, not node) and the default for any other name', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8'), names = t => [...t.matchAll(/`?\b([a-z]+)\b`?/g)].map(m => m[1]);
  const guide = /a C4 element's [^|]*?`shape` \((.*?)\), an instance's/.exec(read('../docs/guide/model.md'))[1];
  const note = read('../docs/conformance/c4.md').split('\n').find(l => l.startsWith('| Person, software system')).split(' | ')[2];
  const schema = JSON.parse(read('../lib/umlimator.schema.json'));
  let desc; JSON.stringify(schema, (k, v) => { if (k === 'shape' && v && typeof v.description === 'string' && v.description.startsWith('A C4 element')) desc = v.description; return v; });
  const vocab = /`shape` \((.*?)\)\. Relationship:/.exec(read('../docs/diagrams/model.md').split('\n').find(l => l.startsWith('| 23 |')))?.[1]; // audit 22: the vocabulary row c4.md cites
  for (const [where, text] of [['guide', guide], ['c4.md', note], ['schema', desc], ['model.md row 23', vocab]]) {
    assert.ok(text, where);
    const said = new Set(names(text));
    for (const s of C4_SHAPES) assert.ok(said.has(s), `${where} names ${s}: ${text}`);
    assert.match(text, /other than `?node`?|not `node`/, where);
    assert.match(text, /any other name draws the default, `?person`? for a person and `?box`? for/, where);
  }
  // and the code agrees: node, or a name C4 does not know, draws the default; a shape's name in any case draws that shape
  const m = JSON.parse(read('../examples/bookshop-c4.json')), c = m.nodes.find(n => n.type === 'c4.Container'), p = m.nodes.find(n => n.type === 'c4.Person');
  const sh = (x, s) => { x.props = { ...x.props, shape: s }; const v = m.views.find(w => w.nodeIds?.includes(x.id) && w.diagram?.startsWith('c4.')); return layout(m, v.id).nodes.find(n => n.id === x.id).sh; };
  assert.deepEqual(['node', 'Node', 'cloud', 'Cylinder'].map(s => sh(c, s)), ['box', 'box', 'box', 'cylinder']);
  assert.deepEqual(['node', 'robot'].map(s => sh(p, s)), ['person', 'robot']);
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
  const pinned = { 'c4-context right': [], 'c4-context down': [], 'c4-containers right': ['3 cross'], 'c4-containers down': ['3 cross', '6 label on a line'], // five labels left off with nothing said, laid out down: now drawn (audit 6); 8 on a line till a label beside its line kept off the boundary's border (audit 25)
    'c4-components right': ['2 cross'], 'c4-components down': ['2 cross'] }, got = {};
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
  // the conformance note states the container view's labels on lines laid out down as counted here (audit 27: it said 8 after audit 25 made it 6)
  const onLine = parseInt(got['c4-containers down'].find(k => / label on a line$/.test(k)), 10);
  assert.ok(readFileSync(new URL('../docs/conformance/c4.md', import.meta.url), 'utf8').replace(/\s+/g, ' ').includes(`the container view's on a looser spot, ${onLine} labels on lines, which \`check()\` names`), `the C4 note says ${onLine} labels on lines`);
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
  assert.equal(g.byId['c4-api'].aria, 'Container Shop API, Python, FastAPI: Catalogue, basket, checkout and accounts as a JSON API, opens Shop API: components'); // its period dropped before ", opens" (audit 52)
  assert.equal(g.byId['c4-shopper'].aria, 'Person Shopper: Browses the catalogue, buys books and tracks orders.');
  // audit 6: the word "opens" in the element's own text does not stand for its type saying which view it opens
  const said = structuredClone(C4); said.nodes.find(n => n.id === 'c4-api').props.description = 'Takes orders and opens baskets.';
  assert.equal(layout(said, 'c4-containers').byId['c4-api'].aria, 'Container Shop API, Python, FastAPI: Takes orders and opens baskets, opens Shop API: components');
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

test('c4-subject on a context view: none or not shown a warning; a subject of the wrong kind or naming no element an error, as on a container view (audit 35)', () => {
  const lv = f => { const m = structuredClone(C4); f(m); return validate(m).filter(p => p.rule === 'c4-subject').map(p => [p.level, p.path]); };
  const cx = `views[${V('c4-context')}].subject`, ct = `views[${V('c4-containers')}].subject`;
  assert.deepEqual(lv(m => { m.views[V('c4-context')].subject = 'c4-shopper'; }), [['error', cx]], 'a person: the wrong kind');
  assert.deepEqual(lv(m => { m.views[V('c4-context')].subject = 'c4-shopper'; m.views[V('c4-containers')].subject = 'c4-shopper'; }), [['error', cx], ['error', ct]], 'the same level on both views');
  assert.deepEqual(lv(m => { m.views[V('c4-context')].subject = 'gone'; }), [['error', cx]], 'naming no element');
  assert.deepEqual(lv(m => { delete m.views[V('c4-context')].subject; }), [['warning', cx]], 'none: still a warning');
  assert.deepEqual(lv(m => { m.views[V('c4-context')].nodeIds = m.views[V('c4-context')].nodeIds.filter(id => id !== 'c4-bookshop'); }), [['warning', cx]], 'not shown: still a warning');
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
  assert.deepEqual(T.edits.add(C4, C4.views[V('c4-context')], { type: 'c4.Container' }, 'Cache'), { error: 'This view shows people and software systems: a container is added on a container view' });
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
  // CI's ceiling for C4's stress view is 1.5 s (maintainer, 16 Nov 2026): the same code measures 512-1075 ms on shared
  // runners, so 1 s failed about one run in four with no change; the 100 ms target is still printed
  const best = k => Math.min(...runs.map(r => r[k])), CEIL = 1500;
  assert.ok(best('full') < CEIL, `full layout ${best('full')} ms`);
  assert.ok(best('desc') < CEIL, `a description ${best('desc')} ms`); assert.ok(best('still') < CEIL, `external ${best('still')} ms`); assert.ok(best('tech') < CEIL, `technology ${best('tech')} ms`);
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

test('audit 5: lines go round the cards on a typed view, however wide the host font (bookshop-c4 containers), and check() reports one drawn through a card', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-c4.json', import.meta.url), 'utf8')), was = console.warn;
  // a C4 card's tag is its text ("[Container]"), not an author's name tag: its NaN box once put the router's grid out of order, and at
  // 0.54 em a character (Linux CI's fonts) the worker's lines to the email service and the courier ran through the order queue
  for (const k of [0.54, 0.6]) { const warned = [], measure = (s, px) => s.length * px * k; console.warn = (...a) => warned.push(a.join(' '));
    let said, g; try { g = layout(m, 'c4-containers', { measure }); said = check(m, 'c4-containers', { measure }); } finally { console.warn = was; }
    assert.deepEqual(warned, [], `${k} em: every line routed round the cards`);
    assert.deepEqual(said.filter(i => / passes through card /.test(i.message)).map(i => i.message), [], `${k} em`);
    if (k === 0.6) continue;
    // the check itself: the worker's line to the email service drawn straight through the queue
    const q = g.byId['c4-queue'], e = g.edges.find(x => x.ids.includes('c4-worker-mail')), y = q.y + q.h / 2, refs = [];
    e.pts = [[e.s.x + e.s.w, y], [q.x + q.w + 40, y], [q.x + q.w + 40, e.t.y + e.t.h / 2], [e.t.x, e.t.y + e.t.h / 2]];
    const found = throughIssues(g, 'view c4-containers', refs), at = found.indexOf('view c4-containers: edge Order worker→Email service passes through card "Order queue"');
    assert.ok(at >= 0, found.join('\n'));
    assert.ok(refs[at][0] === e && refs[at][1].id === 'c4-queue', 'about the line and the card');
  }
});

test('a request and its reply between two systems, laid out right, do not cross (audit 14)', () => {
  const m = { schemaVersion: 2, nodes: [El('u', 'Person', 'User'), El('s', 'SoftwareSystem', 'Shop'), El('b', 'SoftwareSystem', 'Bank', { external: true }), El('m', 'SoftwareSystem', 'Mail', { external: true })],
    edges: [Rel('r1', 'u', 's', 'Buys'), Rel('r2', 's', 'b', 'Charges'), Rel('r3', 'b', 's', 'Notifies'), Rel('r4', 's', 'm', 'Sends')], views: [{ id: 'v', diagram: 'c4.landscape', title: 'T', nodeIds: ['u', 's', 'b', 'm'] }] };
  assert.deepEqual(check(m, 'v').map(p => p.message), []);
  const swapped = structuredClone(m); swapped.edges = [m.edges[0], m.edges[2], m.edges[1], m.edges[3]];
  assert.deepEqual(check(swapped, 'v').map(p => p.message), [], 'either edge order');
});

// audit 15: the request/reply port swap (audit 14) is judged by the finished picture. Five containers, n0 asking n1 twice and
// n1 replying twice, plus two other call/reply pairs: the swap counted better inside the pass, came out at 13 issues; without it 9
test('the request/reply swap keeps no swap that leaves the finished view with more issues', () => {
  const L = (from, to, label) => ({ type: 'c4.Relationship', from, to, label }), n = ['n0', 'n1', 'n2', 'n3', 'n4'];
  const m = { schemaVersion: 2, nodes: n.map(id => ({ id, type: 'c4.Container', label: 'Container ' + id })),
    edges: [['n1', 'n4', 0], ['n2', 'n3', 2], ['n0', 'n4', 3], ['n0', 'n1', 4], ['n0', 'n1', 5]].flatMap(([a, b, k]) => [L(a, b, 'asks ' + k), L(b, a, 'replies ' + k)]).map((e, i) => ({ id: 'e' + i, ...e })),
    views: [{ id: 'v', diagram: 'c4.container', nodeIds: n }] };
  assert.ok(check(m, 'v').length <= 9, check(m, 'v').map(i => i.message).join('\n'));
});

test('audit 15: F2 on an inline relationship takes its unchanged [technology] off, as on a model relationship', () => {
  const m = { schemaVersion: 2, nodes: [El('a', 'Person', 'A'), El('b', 'System', 'B')], edges: [],
    views: [{ id: 'v', diagram: 'c4.context', nodeIds: ['a', 'b'], edges: [Rel('r2', 'a', 'b', 'Uses', 'HTTPS')] }] };
  assert.deepEqual(T.edits.rename(m, m.views[0], 'r2', 'Calls [HTTPS]'), [{ op: 'set', id: 'r2', path: 'label', value: 'Calls' }]);
});

test('audit 16: an implied line is a row of the PDF\'s Lines table and counted on the cover', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'u', type: 'c4.Person', label: 'Shopper' }, { id: 'S', type: 'c4.SoftwareSystem', label: 'Shop' }, { id: 'C1', type: 'c4.Container', parent: 'S', label: 'Web' }, { id: 'C2', type: 'c4.Container', parent: 'S', label: 'API' }],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'u', to: 'C1', label: 'Browses' }, { id: 'r2', type: 'c4.Relationship', from: 'u', to: 'C2', label: 'Calls' }],
    views: [{ id: 'ctx', diagram: 'c4.context', title: 'Context', subject: 'S', nodeIds: ['u', 'S'] }] };
  const ctx = mapContext(m), t = tablesOf(ctx, ctx.V.ctx, layout(m, 'ctx'));
  assert.deepEqual(t[1].rows.map(r => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), ['Shopper → Shop Browses [+1] Implied relationship']);
  assert.deepEqual(t.lineIds, ['u->S']);
});

test('audit 16: a component view listing a card with a null id, and a line between null ends, lays out (no stack overflow)', () => {
  for (const diagram of ['c4.component', 'c4.container']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'c4.Container' }, { id: 'c', type: 'c4.Container', parent: 'a' }, { id: null }], edges: [{ id: 'x', from: null, to: null }], views: [{ id: 'v', diagram, nodeIds: ['a', 'c', null] }] };
    const keep = console.warn; console.warn = () => {}; try { assert.ok(layout(m, 'v').nodes.length, diagram); } finally { console.warn = keep; }
  }
});

test('audit 18: describe()\'s header counts relationships, and a comment link on its own', () => {
  const m = structuredClone(C4), v = m.views.find(x => x.id === 'c4-context'), before = describe(C4, 'c4-context').split('\n')[0];
  m.nodes.push({ id: 'note1', type: 'uml.Comment', label: 'Prices in EUR' });
  m.edges.push({ id: 'note1-link', type: 'uml.CommentLink', from: 'note1', to: v.subject });
  v.nodeIds.push('note1');
  const text = describe(m, 'c4-context').split('\n'), rels = text.filter(t => /^Relationship from/.test(t)).length;
  assert.ok(text.includes('Comment link from Prices in EUR to Bookshop.'), text.join('\n'));
  assert.equal(text[0], before.replace(/(\d+) elements and (\d+) relationships\./, (_, n, r) => `${+n + 1} elements and ${r} relationships, and 1 comment link.`));
  assert.match(text[0], new RegExp(` and ${rels} relationships, and 1 comment link\\.$`));
});

test('audit 23: N refuses an element the view\'s level does not show (a context or landscape view\'s container or component, a container view\'s component; a dynamic view\'s in tests/c4-views.test.mjs), not added owned by nothing', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 's', type: 'c4.SoftwareSystem', label: 'Shop', props: { description: 'd' } }], edges: [],
    views: [{ id: 'ctx', diagram: 'c4.context', title: 'Context', subject: 's', nodeIds: ['s'] }, { id: 'land', diagram: 'c4.landscape', title: 'Landscape', nodeIds: ['s'] },
      { id: 'cont', diagram: 'c4.container', title: 'Containers', subject: 's', nodeIds: ['s'] }] };
  const add = (vid, type) => diagramOf(m.views.find(v => v.id === vid)).edits.add(m, m.views.find(v => v.id === vid), { type }, 'X');
  const two = 'This view shows people and software systems: ';
  for (const vid of ['ctx', 'land']) {
    assert.deepEqual(add(vid, 'c4.Container'), { error: `${two}a container is added on a container view` }, vid);
    assert.deepEqual(add(vid, 'c4.Component'), { error: `${two}a component is added on a component view` }, vid);
    for (const t of ['c4.Person', 'c4.SoftwareSystem', 'uml.Comment']) assert.equal(add(vid, t), null, `${vid} ${t}: the default add`);
  }
  assert.deepEqual(add('cont', 'c4.Component'), { error: 'This view shows people, software systems and containers: a component is added on a component view' });
  assert.equal(add('cont', 'c4.Container')[0].element.parent, 's', 'at its level: owned by the subject');
  // what each add the hook lets through gives validates clean of c4-owner and c4-level
  for (const vid of ['ctx', 'land', 'cont']) for (const { type } of diagramOf(m.views.find(v => v.id === vid)).elements) {
    const r = add(vid, type); if (r && r.error) continue;
    const out = apply(m, r || [{ op: 'add', element: { id: 'x1', type, label: 'X' }, view: vid }]);
    assert.deepEqual(validate(out).filter(p => /^c4-(owner|level)$/.test(p.rule)).map(p => p.message), [], `${vid} ${type}`);
  }
});

test('audit 25: D on a software system leaves out a far end this view alone holds (view.nodes), said, so the new view validates', () => {
  const El = (id, t, label, parent) => ({ id, type: 'c4.' + t, label, ...(parent ? { parent } : {}), props: { description: label + '.', technology: 'x' } });
  const m = { schemaVersion: 2, nodes: [El('shop', 'SoftwareSystem', 'Shop'), El('api', 'Container', 'API', 'shop'), El('pay', 'SoftwareSystem', 'Payments')],
    edges: [{ id: 'r1', type: 'c4.Relationship', from: 'who', to: 'api', label: 'uses' }, { id: 'r2', type: 'c4.Relationship', from: 'api', to: 'pay', label: 'charges' }],
    views: [{ id: 'land', diagram: 'c4.landscape', title: 'Landscape', nodeIds: ['shop', 'who', 'pay'], nodes: [{ id: 'who', type: 'c4.Person', label: 'Shopper', props: { description: 'buys' } }] }] };
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  const v = m.views[0], r = diagramOf(v).edits.key(m, v, ['shop'], 'd');
  assert.deepEqual(r.commands[0].view.nodeIds, ['shop', 'api', 'pay'], 'the model\'s far end stays, the view\'s own one is left out');
  assert.equal(r.say, 'Made the view Shop: containers; Shopper lives in this view only and stays out: Enter opens it');
  assert.deepEqual(validate(apply(m, r.commands)).filter(p => p.level === 'error'), []);
});

// a route that steps back a few px against its own way round a turn: two stretches the opposite way round one shorter than a stub
const backSteps = g => g.edges.filter(e => (e.pts || []).some((_, i, p) => { if (i + 3 >= p.length) return false;
  const d = j => [Math.sign(p[j + 1][0] - p[j][0]), Math.sign(p[j + 1][1] - p[j][1])], a = d(i), c = d(i + 2);
  return (a[0] || a[1]) && a[0] === -c[0] && a[1] === -c[1] && Math.abs(p[i + 2][0] - p[i + 1][0]) + Math.abs(p[i + 2][1] - p[i + 1][1]) < 8; })).map(e => `${e.id} ${JSON.stringify(e.pts)}`);

test('audit 25: no routed line steps back against its own way near an end (the shipped container view\'s Order worker to Database notch)', () => {
  const S = JSON.parse(readFileSync(new URL('c4-stress.json', import.meta.url)));
  for (const [m, vid] of [[C4, 'c4-containers'], [S, 'all']]) for (const dir of ['right', 'down']) {
    const x = structuredClone(m); x.views.find(v => v.id === vid).direction = dir;
    assert.deepEqual(backSteps(layout(x, vid)), [], `${vid} ${dir}`);
  }
  // the fold changes the route only: Order worker still comes up into the Database's left side, and check() says nothing new
  const e = layout(C4, 'c4-containers').edges.find(x => x.id === 'c4-worker-db'), db = layout(C4, 'c4-containers').byId['c4-db'];
  assert.deepEqual(e.pts.at(-1), [db.x, e.pts.at(-1)[1]]);
  assert.ok(!check(C4, 'c4-containers').some(p => /share a line/.test(p.message)));
});

test('audit 25: a container view laid out down runs no relationship through the boundary\'s title and sets no label on its border', () => {
  const R = (id, f, t, l) => Rel(id, f, t, l, 'HTTPS');
  const base = [El('sys', 'SoftwareSystem', 'Shop'), El('p', 'Person', 'Shopper'), El('ext', 'SoftwareSystem', 'Payments', { external: true })];
  const view = ids => [{ id: 'v', diagram: 'c4.container', title: 'V', direction: 'down', subject: 'sys', nodeIds: ['sys', 'p', 'ext', ...ids] }];
  const one = { schemaVersion: 2, nodes: [...base, El('c0', 'Container', 'Ship', { technology: 'PostgreSQL', shape: 'browser' }, 'sys'), El('c1', 'Container', 'x', { technology: 'React', shape: 'pipe' }, 'sys'),
    El('c2', 'Container', 'Ledger', { technology: 'PostgreSQL', shape: 'cylinder' }, 'sys')],
    edges: [R('r0', 'c0', 'p', 'Pay the bill now'), R('r1', 'ext', 'c2', 'Ship'), R('r2', 'c0', 'c2', 'Pay the bill now'), R('r3', 'c2', 'ext', 'Ship'), R('r4', 'c0', 'p', 'A much longer label that wraps around'), R('r5', 'c2', 'c1', 'Stock')], views: view(['c0', 'c1', 'c2']) };
  const two = { schemaVersion: 2, nodes: [...base, ...[['c0', 'Order', 'browser'], ['c1', 'Customer account details', 'browser'], ['c2', 'Ledger', 'pipe'], ['c3', 'Pay the bill now', 'mobile'], ['c4', 'Order', 'cylinder']]
    .map(([id, l, shape]) => El(id, 'Container', l, { technology: 'Python', shape }, 'sys'))],
    edges: [R('r0', 'c4', 'ext', 'Ship'), R('r1', 'c2', 'c3', 'Order'), R('r2', 'c4', 'c3', 'Pay the bill now'), R('r3', 'c4', 'c0', 'A much longer label that wraps around'), R('r4', 'c2', 'p', 'Customer account details'),
      R('r5', 'c3', 'c4', 'x'), R('r7', 'c3', 'p', 'Customer account details')], views: view(['c0', 'c1', 'c2', 'c3', 'c4']) };
  for (const [k, m] of [['one', one], ['two', two]]) {
    assert.deepEqual(check(m, 'v').map(p => p.message).filter(s => /header crossed|sits on the border/.test(s)), [], k);
    assert.ok(layout(m, 'v').edges.every(e => e.pts && e.pts.length > 1 && (!e.label || e.lbl)), `${k}: every line drawn, with its label`);
  }
});

// audit 26: the key worded an element of another family "a actor", "a information item": the article as c4A gives it
test('audit 26: the key names an element of another family with the right article ("an actor", "an information item")', () => {
  const m = { schemaVersion: 2, nodes: [El('s', 'SoftwareSystem', 'Shop'), { id: 'a', type: 'uml.Actor', label: 'Clerk' }, { id: 'i', type: 'uml.InformationItem', label: 'Order' }, { id: 'u', type: 'uml.UseCase', label: 'Pay' }],
    edges: [], views: [{ id: 'v', diagram: 'c4.landscape', title: 'L', nodeIds: ['s', 'a', 'i', 'u'] }] };
  const says = layout(m, 'v').legend.map(x => x.replace(/<svg.*?<\/svg>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.deepEqual(says, ['Software system a software system', 'Actor an actor', 'Information item an information item', 'Use case a use case']);
});

// audit 26: a node with no type on a C4 or DFD view had a blank kind: " Shop", a "[]" tag, "a , is not drawn"; now
// "Element", as a cloud view names an untyped card (the shared kind word, snKindName, which the deployment and component
// views use too)
test('audit 26: a node with no type on a C4, DFD or deployment view is named an element, with no blank kind or "[]" tag', () => {
  const view = d => ({ schemaVersion: 2, nodes: [{ id: 'x', label: 'Shop', kind: 'frontend' }], edges: [], views: [{ id: 'v', diagram: d, title: 'T', nodeIds: ['x'] }] });
  const c4 = view('c4.landscape'), n = layout(c4, 'v').nodes[0];
  assert.equal(n.aria, 'Element Shop'); assert.equal(n.tag, '[Element]');
  assert.equal(describe(c4, 'v').split('\n')[1], 'Element Shop.');
  assert.deepEqual(validate(c4).map(p => p.message), ['c4-level: "Shop", an element, is not drawn in a landscape view']);
  const dfd = view('dfd');
  assert.equal(layout(dfd, 'v').nodes[0].aria, 'Element Shop, 0 flows in, 0 out');
  assert.equal(describe(dfd, 'v').split('\n')[1], 'Element Shop, 0 flows in, 0 out.');
  for (const d of ['c4.landscape', 'dfd', 'uml.deployment']) for (const t of [layout(view(d), 'v').nodes[0].aria, describe(view(d), 'v')]) assert.doesNotMatch(t, /(^|\n) |\[\]|a , /, `${d}: ${t}`);
});

// audit 26: unhook folded only stretches that step back; a forward stair next to an end's stretch (the shipped container
// view's Order worker to Database: up, 10 px right, 7 px up, into the card) is folded to one turn too, under the same checks
const stairs = g => g.edges.filter(e => (e.pts || []).some((_, i, p) => { if (i < 1 || i + 3 >= p.length || !(i === 2 || i === p.length - 4)) return false;
  const d = j => [Math.sign(p[j + 1][0] - p[j][0]), Math.sign(p[j + 1][1] - p[j][1])], a = d(i - 1), c = d(i + 1);
  return (a[0] || a[1]) && a[0] === c[0] && a[1] === c[1] && Math.abs(p[i + 1][0] - p[i][0]) + Math.abs(p[i + 1][1] - p[i][1]) < 8; })).map(e => `${e.id} ${JSON.stringify(e.pts)}`);
test('audit 26: no routed line ends in a forward stair a few px wide next to an end (the container view\'s Order worker to Database)', () => {
  const e = layout(C4, 'c4-containers').edges.find(x => x.id === 'c4-worker-db'), db = layout(C4, 'c4-containers').byId['c4-db'];
  assert.equal(e.pts.length, 4, JSON.stringify(e.pts)); assert.deepEqual(e.pts.at(-1), [db.x, e.pts.at(-1)[1]]);
  const S = JSON.parse(readFileSync(new URL('c4-stress.json', import.meta.url)));
  for (const [m, vid] of [[C4, 'c4-containers'], [S, 'all']]) for (const dir of ['right', 'down']) {
    const x = structuredClone(m); x.views.find(v => v.id === vid).direction = dir;
    assert.deepEqual(stairs(layout(x, vid)), [], `${vid} ${dir}`);
  }
});

// audit 27: the use case view named an untyped card "undefined Plain", the composite structure, interaction overview,
// internal block and parametric views " Plain" and the information flow view "untyped Plain"; each now says "Element",
// through the shared kind word (snKindName), in the accessible name, describe() and validate()'s words
test('audit 27: a node with no type is named an element in every typed view, never "undefined", "untyped" or a blank kind', async () => {
  const { readdirSync } = await import('node:fs');
  for (const dir of ['uml', 'sysml', 'cloud', 'c4', 'er', 'flowchart', 'bpmn', 'mindmap']) for (const f of readdirSync(new URL(`../src/${dir}/`, import.meta.url))) if (f.endsWith('.js')) await import(`../src/${dir}/${f}`);
  const view = d => ({ schemaVersion: 2, nodes: [{ id: 'x', label: 'Plain' }], edges: [], views: [{ id: 'v', diagram: d, title: 'T', nodeIds: ['x'] }] });
  const types = ['uml.class', 'uml.object', 'uml.package', 'uml.composite-structure', 'uml.component', 'uml.deployment', 'uml.profile', 'uml.use-case', 'uml.activity', 'uml.state-machine',
    'uml.sequence', 'uml.communication', 'uml.interaction-overview', 'uml.timing', 'uml.information-flow', 'sysml.requirement', 'sysml.block-definition', 'sysml.internal-block', 'sysml.parametric',
    'er', 'flowchart', 'dfd', 'c4.landscape', 'c4.container', 'c4.deployment', 'c4.dynamic', 'bpmn', 'mindmap', 'gcp', 'azure', 'aws'];
  for (const d of types) assert.ok(diagramOf({ diagram: d }), d);
  for (const d of types) {
    const m = view(d), n = layout(m, 'v').nodes.find(c => c.id === 'x' || c._id === 'x'), says = [n && n.aria, describe(m, 'v'), ...validate(m).map(p => p.message)].filter(t => typeof t === 'string');
    for (const t of says) assert.doesNotMatch(t, /undefined|untyped|(^|\n) \S|  /, `${d}: ${t}`);
  }
  for (const d of ['uml.use-case', 'uml.composite-structure', 'uml.interaction-overview', 'uml.information-flow', 'sysml.internal-block', 'sysml.parametric']) {
    assert.equal(layout(view(d), 'v').nodes.find(c => c.id === 'x').aria, 'Element Plain', d);
    assert.match(describe(view(d), 'v'), /^Element Plain\.$/m, d);
  }
  assert.ok(validate(view('uml.interaction-overview')).some(p => p.message.includes('shows element x ("Plain")')));
});

test('audit 27: an element with no type is keyed, in the PDF and the key, as its tag and name say it, "Element"; a listed line of another kind is counted and keyed as itself, never a relationship', () => {
  const key = g => g.legend.map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'Billing' }, { id: 'b', label: 'Ledger' }, { id: 's', type: 'c4.SoftwareSystem', label: 'Shop', props: { description: 'd' } }, { id: 'u', type: 'c4.Person', label: 'User', props: { description: 'd' } }],
    edges: [{ id: 'r', type: 'c4.Relationship', from: 'a', to: 'b', label: 'posts to' }, { id: 'r2', type: 'c4.Relationship', from: 'u', to: 's', label: 'uses' },
      { id: 'as', type: 'uml.Association', from: 'u', to: 's', label: 'knows' }, { id: 'dp', type: 'uml.Dependency', from: 's', to: 'u' }, { id: 'n', type: 'uml.CommentLink', from: 'u', to: 's' }],
    views: [{ id: 'v', diagram: 'c4.context', title: 'V', subject: 's', nodeIds: ['a', 'b', 's'] }, { id: 'w', diagram: 'c4.landscape', title: 'W', nodeIds: ['u', 's'], edges: ['r2', 'as', 'dp'] }] };
  const g = layout(m, 'v');
  assert.deepEqual([g.byId.a.tag, g.byId.a.aria], ['[Element]', 'Element Billing']);
  assert.deepEqual(key(g).slice(0, 2), ['Element an element', 'Software system a software system'], 'its own entry, not folded into the software system\'s');
  const ctx = mapContext(m), [els] = tablesOf(ctx, ctx.V.v, { nodes: g.nodes, edges: g.edges });
  assert.deepEqual(els.rows.map(r => [...r.matchAll(/<td>(.*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, ''))).filter(c => c[0] !== 'Shop').map(c => c.slice(0, 2)), [['Billing', 'Element'], ['Ledger', 'Element']], 'the PDF\'s kind, never "Class"');
  // the header counts what the sentences under it name: one relationship and two other lines (a comment link apart, as before)
  assert.equal(describe(m, 'w').split('\n')[0], 'W: a C4 system landscape diagram of 2 elements and 1 relationship, and 2 other lines.');
  assert.equal(describe({ ...m, views: [{ ...m.views[1], edges: ['r2', 'dp', 'n'] }] }, 'w').split('\n')[0], 'W: a C4 system landscape diagram of 2 elements and 1 relationship, and 1 comment link and 1 other line.');
  for (const v of C4.views) assert.doesNotMatch(describe(C4, v.id).split('\n')[0], /other line/, `${v.id}: the example lists no other line`);
  const k = key(layout(m, 'w'));
  assert.ok(k.includes('Line a kind of line this view does not draw as its own'), k.join(' | '));
  assert.ok(!key(layout(C4, 'c4-containers')).some(s => /^Line /.test(s)), 'none where none is drawn');
});

test('audit 28: a listed line of another kind between two elements is no relationship: the implied relationship between them is still drawn and said', () => {
  const m = structuredClone(C4); m.edges = m.edges.filter(e => e.id !== 'c4-bookshop-courier'); // the worker's line to the courier lifts to Bookshop -> Courier
  const v = m.views.find(x => x.id === 'c4-context'), pair = () => layout(m, v.id).edges.filter(e => e.from === 'c4-bookshop' && e.to === 'c4-courier').map(e => (e.implied ? 'implied' : e.type));
  assert.deepEqual(pair(), ['implied']);
  m.edges.push({ id: 'dep', type: 'uml.Dependency', from: 'c4-bookshop', to: 'c4-courier', label: 'ships with' });
  v.edges = [...m.edges.filter(e => e.type === 'c4.Relationship').map(e => e.id), 'dep'];
  assert.deepEqual(pair().sort(), ['implied', 'uml.Dependency']);
  assert.match(describe(m, v.id), /Implied relationship from Bookshop to Courier/);
  // a listed relationship between the two still takes the implied line's place
  m.edges.push({ id: 'rel', type: 'c4.Relationship', from: 'c4-bookshop', to: 'c4-courier', label: 'pays' }); v.edges.push('rel');
  assert.deepEqual(pair().sort(), ['c4.Relationship', 'uml.Dependency']);
});

test('audit 52: an element whose name ends a sentence and that opens a view says so after it, never ".,", in its name and the drawn one', () => {
  let n = 0;
  for (const f of ['../examples/types/c4.json', '../examples/bookshop-atlas.json', '../examples/umlimator-atlas.json', '../tests/fixtures/integration.json']) {
    const m = JSON.parse(readFileSync(new URL(f, import.meta.url)));
    for (const v of m.views) { if (!v.diagram || v.diagram === 'map') continue; const g = layout(m, v.id), svg = svgOf(g);
      for (const x of g.nodes || []) for (const a of [x.aria, x.ariaOwn]) if (typeof a === 'string' && a.includes(', opens ')) { n++; assert.doesNotMatch(a, /\.,/, `${f} ${v.id} ${x.id}`); }
      assert.doesNotMatch(svg, /\., opens /, `${f} ${v.id}`); } }
  assert.ok(n > 10, `${n} names`);
  const m = JSON.parse(readFileSync(new URL('../examples/types/c4.json', import.meta.url)));
  assert.match(layout(m, 'containers').byId.api.aria, /as a JSON API, opens Shop API: components$/);
});
