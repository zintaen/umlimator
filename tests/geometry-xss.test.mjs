// A model is untrusted input (SECURITY.md): a card's geometry from the model (w, h, a view's nodeOverrides, a name tag) never
// reaches the markup as written. Audit cf1: a string w or h, or a tag object on a map card, was written into the card's
// rect, path and circle attributes as it was, and a page of such a model ran its script. Layout takes w and h only as finite
// positive numbers (else the default) and lays a map card's name tag out itself; svgOf, cardLook and the canvas's own marks
// write each card's numbers through num(). Drives the real code: every family's sources, laid out and drawn by mapContext.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// every source, so every typed family is registered as lib/umlimator-all.js registers it
const src = new URL('../src/', import.meta.url);
for (const f of readdirSync(src, { recursive: true }).filter(f => f.endsWith('.js')).map(f => f.replaceAll('\\', '/')).sort()) await import(new URL(f, src));
const { mapContext } = await import('../src/map/context.js');

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
// breaks out of an attribute and opens an element of its own
const P = '9" data-probe="1"><zz-probe a="', SCRIPT = '120"><script>alert(1)</script><x a="';
const bad = mk => /data-probe="1"|<zz-probe|<script|onmouseover=|onerror=/i.exec(mk);
const drawAll = (m, only = null) => { const c = mapContext(m), out = [];
  for (const v of m.views) if (v && typeof v.id === 'string' && (!only || only(v))) out.push([v.id, c.buildView(v.id).markup]);
  return out; };
const clean = (m, what) => { for (const [vid, mk] of drawAll(m)) { const hit = bad(mk); assert.equal(hit, null, `${what}, view ${vid}: ${hit && mk.slice(Math.max(0, hit.index - 120), hit.index + 40)}`); } };

const two = a => ({ schemaVersion: 2, title: 't', nodes: [{ id: 'a', label: 'A', ...a }, { id: 'b', label: 'B' }], edges: [{ id: 'e1', from: 'a', to: 'b', label: 'x' }], views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'] }] });

test('a map card: a tag, w or h from the model never reaches an attribute, and draws as the card with none', () => {
  const plain = drawAll(two({}))[0][1];
  const cases = {
    tag: two({ tag: { x: '0" onmouseover="alert(1)" data-probe="1', y: 0, w: 10, h: 10, text: 't' } }),
    tagImg: two({ tag: { x: '0"/><img src=x onerror="document.title=1"><x y="', y: 0, w: 10, h: 10, text: 't' } }),
    w: two({ w: '120" data-probe="1' }), h: two({ h: '64" data-probe="1' }),
    nan: two({ w: NaN, h: Infinity }), negative: two({ w: -5, h: 0 }),
    override: Object.assign(two({}), { views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], nodeOverrides: { a: { w: SCRIPT } } }] }),
    overrideTag: Object.assign(two({}), { views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b'], nodeOverrides: { a: { tag: { x: P, y: P, w: P, h: P, text: 't' } } } }] }),
  };
  for (const [k, m] of Object.entries(cases)) { const mk = drawAll(m)[0][1];
    assert.equal(bad(mk), null, k); assert.doesNotMatch(mk, /NaN|undefined|Infinity/, k);
    assert.equal(mk.replace(/\bg\d+\b/g, 'g#'), plain.replace(/\bg\d+\b/g, 'g#'), `${k}: the card draws as one with no such field`); }
  // every shape, its details too (shapes.js det)
  for (const shape of ['person', 'browser', 'window', 'terminal', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'folder', 'node']) {
    const mk = drawAll(two({ shape, w: '120" data-probe="1', h: '64" data-probe="1', tag: { x: P, y: P, w: P, h: P } }))[0][1];
    assert.equal(bad(mk), null, shape); assert.doesNotMatch(mk, /NaN|undefined/, shape); }
  // a card laid out with an author still gets layout's own name tag, at numbers
  const m = two({ author: 'ann', tag: { x: P, y: P, w: P, h: P, text: 'forged' } }); m.authors = { ann: { name: 'Ann' } };
  const mk = drawAll(m)[0][1]; assert.equal(bad(mk), null); assert.match(mk, /class="ntag-tx"[^>]*>@ann</); assert.doesNotMatch(mk, /forged/);
  // a number keeps its place: a model's own w is what the card is drawn at
  assert.match(drawAll(two({ w: 222 }))[0][1], /<rect x="[\d.-]+" y="[\d.-]+" width="222" height="[\d.]+"[^>]*class="n-mask"/);
});

test('every typed family: w, h and a tag on every element and in every view\'s nodeOverrides never reach an attribute', () => {
  const m = read('./fixtures/integration.json');
  const fams = new Set(m.views.map(v => String(v.diagram ?? 'map').split('.')[0]));
  for (const f of ['map', 'uml', 'c4', 'bpmn', 'sysml', 'aws', 'azure', 'gcp', 'dfd', 'er', 'flowchart', 'mindmap']) assert.ok(fams.has(f), f); // the fixture holds each family
  const put = o => { if (Array.isArray(o)) o.forEach(put); else if (o && typeof o === 'object') { Object.values(o).forEach(put); if (typeof o.id === 'string') Object.assign(o, { w: P, h: P, tag: { x: P, y: P, w: P, h: P, text: 't' } }); } };
  const mm = structuredClone(m); put(mm.nodes); put(mm.edges);
  mm.views.forEach(v => { v.nodeOverrides = Object.fromEntries((Array.isArray(v.nodeIds) ? v.nodeIds : mm.nodes.map(n => n.id)).map(id => [id, { w: SCRIPT, h: P, tag: { x: P, y: P, w: P, h: P } }])); });
  clean(mm, 'geometry on every element');
});

test('fuzz: every number in a model of every family, and each geometry field, as an attribute breakout', () => {
  const m = read('./fixtures/integration.json');
  const keys = new Set(['w', 'h', 'x', 'y', 'col', 'row', 'width', 'height']);
  const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && k !== 'schemaVersion') keys.add(k); walk(v); } };
  walk(m); assert.ok(keys.size > 12, [...keys].join());
  // key: every number of that name, and that field on every element of the model and of each view (nodeOverrides too); '*': all at once
  const set = (o, key, top = true) => { if (Array.isArray(o)) return o.map(x => set(x, key, false)); if (!o || typeof o !== 'object') return o;
    const r = {}; for (const [k, v] of Object.entries(o)) r[k] = typeof v === 'number' && k !== 'schemaVersion' && (key === '*' || k === key) ? P : set(v, key, false);
    if (!top && key !== '*' && typeof o.id === 'string' && !(key in o)) r[key] = P; return r; };
  for (const key of ['*', ...keys]) { const mm = set(m, key);
    if (key !== '*') mm.views.forEach(v => { v.nodeOverrides = Object.fromEntries((Array.isArray(v.nodeIds) ? v.nodeIds : []).map(id => [id, { [key]: P }])); });
    clean(mm, `field ${key}`); }
});

test('audit 77: a huge finite w or h (1e308) lays out, held at CARD_MAX, and validate() says so; huge and tiny numbers in every geometry field of every family throw nothing', async () => {
  const { layout } = await import('../src/map/api.js');
  const { validate } = await import('../src/map/validate.js');
  const { CARD_MAX } = await import('../src/layout/layered.js');
  // the finding: three cards, two lines into one (bestFlow's ways), a card w of 1e306 or more scored NaN and no way was kept
  for (const [w, at] of [[1e308, 'card'], [1e306, 'card'], [1e308, 'override'], [Number.MAX_VALUE, 'card']]) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a' }, { id: 'b', ...(at === 'card' ? { w } : {}) }, { id: 'c' }], edges: [{ id: 'e0', from: 'a', to: 'c' }, { id: 'e1', from: 'b', to: 'c' }],
      views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], ...(at === 'override' ? { nodeOverrides: { b: { w } } } : {}) }] };
    const g = layout(m, 'v'), b = g.nodes.find(n => n.id === 'b');
    assert.equal(b.w, CARD_MAX, `${at} w ${w}`); assert.ok(g.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)), `${at} w ${w}`);
    assert.ok(validate(m).some(p => p.level === 'warning' && /\.w$/.test(p.path) && p.message.includes(`over ${CARD_MAX} px`)), `${at} w ${w}: validate() says it`); }
  // with a pin on another card (the finding's other message), and a huge h beside (a map card's height is layout's own)
  const pinned = { schemaVersion: 2, nodes: [{ id: 'a', h: 1e308 }, { id: 'b', w: 1e308 }, { id: 'c' }], edges: [{ id: 'e0', from: 'a', to: 'c' }, { id: 'e1', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], layout: { c: [2, 0] } }] };
  assert.equal(layout(pinned, 'v').nodes.find(n => n.id === 'b').w, CARD_MAX);
  // a size within the cap is the card's own, and validate() is silent about it
  const fine = { schemaVersion: 2, nodes: [{ id: 'a' }, { id: 'b', w: 900 }, { id: 'c' }], edges: [{ id: 'e0', from: 'a', to: 'c' }, { id: 'e1', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  assert.equal(layout(fine, 'v').nodes.find(n => n.id === 'b').w, 900); assert.deepEqual(validate(fine).filter(p => /\.w$/.test(p.path)), []);
  // fuzz: each geometry field, and every number at once, huge and tiny, on every element and in every view's nodeOverrides and pins
  const m = read('./fixtures/integration.json');
  const set = (o, key, P, top = true) => { if (Array.isArray(o)) return o.map(x => set(x, key, P, false)); if (!o || typeof o !== 'object') return o;
    const r = {}; for (const [k, v] of Object.entries(o)) r[k] = typeof v === 'number' && k !== 'schemaVersion' && (key === '*' || k === key) ? P : set(v, key, P, false);
    if (!top && key !== '*' && typeof o.id === 'string' && !(key in o)) r[key] = P; return r; };
  for (const P of [1e308, 5e-324]) for (const key of ['*', 'w', 'h', 'x', 'y', 'gap', 'rgap', 'nodeH']) { const mm = set(m, key, P);
    if (key !== '*') mm.views.forEach(v => { v.nodeOverrides = Object.fromEntries((Array.isArray(v.nodeIds) ? v.nodeIds : []).map(id => [id, { [key]: P }])); if (v.layout) v.layout = Object.fromEntries(Object.keys(v.layout).map(k => [k, [P, P]])); });
    const c = mapContext(mm);
    for (const v of mm.views) { let out; assert.doesNotThrow(() => { out = c.buildView(v.id); }, `${key} ${P}, view ${v.id}`); assert.ok(out && out.markup, `${key} ${P}, view ${v.id}`); } }
});

// audit 78: audit 77's warning said "drawn as 100000" of a map card's h and a typed card's w and h, which the drawing never uses
// (a map card's height is the layout's, a typed card's size its type's). It is said of a w a map view draws only: the card's own
// on a map view, or a map view's override
test('audit 78: validate() says a w over CARD_MAX is held only where a map draws it, and nothing of a map card\'s h or a typed card\'s size', async () => {
  const { layout } = await import('../src/map/api.js');
  const { validate } = await import('../src/map/validate.js');
  const { CARD_MAX } = await import('../src/layout/layered.js');
  await import('../src/map/typed.js'); await import('../src/uml/class.js');
  const big = 2 * CARD_MAX, said = m => validate(m).filter(p => /\.(w|h)$/.test(p.path)).map(p => `${p.path}: ${p.message}`);
  const map = { schemaVersion: 2, nodes: [{ id: 'a', h: big }, { id: 'b', w: big }], edges: [{ id: 'e', from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  assert.notEqual(layout(map, 'v').nodes.find(n => n.id === 'a').h, CARD_MAX, 'a map card\'s h is the layout\'s');
  assert.deepEqual(said(map), [`nodes[1].w: w ${big} is over ${CARD_MAX} px: drawn as ${CARD_MAX}`]);
  const cls = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A', w: big, h: big }, { id: 'b', type: 'uml.Class', label: 'B' }], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] };
  const a = layout(cls, 'v').nodes.find(n => n.id === 'a');
  assert.ok(a.w < CARD_MAX && a.h < CARD_MAX, 'a typed card is sized by its type');
  assert.deepEqual(said(cls), []);
  // the same card on a map view too: its w is drawn there, and said
  const both = structuredClone(cls); both.views.push({ id: 'm', diagram: 'map', nodeIds: ['a', 'b'] });
  assert.deepEqual(said(both), [`nodes[0].w: w ${big} is over ${CARD_MAX} px: drawn as ${CARD_MAX}`]);
  // a map view's override, and a map card in no view (drawn nowhere)
  const ov = { schemaVersion: 2, nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c', w: big }], edges: [], views: [{ id: 'v', nodeIds: ['a', 'b'], nodeOverrides: { a: { w: big, h: big } } }] };
  assert.deepEqual(said(ov), [`views[0].nodeOverrides.a.w: w ${big} is over ${CARD_MAX} px: drawn as ${CARD_MAX}`]);
  // a version-1 model: every view a map
  assert.deepEqual(said({ nodes: [{ id: 'a', w: big, h: big }], edges: [], views: [{ id: 'v', nodeIds: ['a'] }] }), [`nodes[0].w: w ${big} is over ${CARD_MAX} px: drawn as ${CARD_MAX}`]);
});
