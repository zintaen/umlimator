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
