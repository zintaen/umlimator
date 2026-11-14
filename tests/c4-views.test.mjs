// C4's dynamic and deployment views, c4.dynamic and c4.deployment (work package M2.7, notes/milestone-2.md §7.5.2, §7.5.3,
// §5.1): the two definitions, 23-c4.json's two views laid out right and down, numbered steps reordered by Alt + arrows,
// a step by connect, deployment nodes as nested boxes, instances drawn as their container, a deleted container taking its
// instances (refs), the scope rules, names, reading order, the key, describe(), the PDF's tables, the editing hooks, and a
// 30-step session saved and reopened. tests/c4-views.html draws them in a browser and edits them by pointer and keyboard.
// Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
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
import '../src/c4/views.js';

const C4 = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/23-c4.json', import.meta.url)));
const DYN = diagramOf({ diagram: 'c4.dynamic' }), DEP = diagramOf({ diagram: 'c4.deployment' }), STATIC = diagramOf({ diagram: 'c4.container' });
const V = id => C4.views.findIndex(v => v.id === id), DV = 'c4-placing-an-order', PV = 'c4-deployment';
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const withDir = (m, vid, direction) => { const c = structuredClone(m); c.views.find(v => v.id === vid).direction = direction; return c; };
const said = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } finally { console.warn = keep; } };
const ours = m => validate(m).filter(p => /^c4-/.test(p.rule ?? ''));
const Rel = (id, from, to, label, technology) => ({ id, type: 'c4.Relationship', from, to, ...(label ? { label } : {}), ...(technology ? { props: { technology } } : {}) });
const names = g => g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]);
// each line's drawn path's two ends, from the markup, and how far each is from its element's outline (tests/c4.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, , d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, a: v.slice(0, 2), b: v.slice(-2) }; });
function offOutline(n, [x, y]) {
  const d = { L: Math.abs(x - n.x), R: Math.abs(x - n.x - n.w), T: Math.abs(y - n.y), B: Math.abs(y - n.y - n.h) }, near = (lo, v, hi) => v >= lo - 1 && v <= hi + 1;
  let best = Infinity;
  for (const s of ['L', 'R', 'T', 'B']) { const t = s === 'L' || s === 'R' ? y : x; if (!(s === 'L' || s === 'R' ? near(n.y, y, n.y + n.h) : near(n.x, x, n.x + n.w))) continue;
    const k = SHAPE.c4.inset(n, s, t); if (k == null) continue; best = Math.min(best, Math.abs(d[s] - k)); }
  return best;
}

test('the definitions: c4.dynamic and c4.deployment, each its own; the static type\'s palette and hooks on the dynamic view, the deployment view\'s own; c4-steps added to the rules', () => {
  assert.deepEqual([DYN.name, DEP.name], ['c4.dynamic', 'c4.deployment']);
  assert.notEqual(DYN.layout, STATIC.layout); assert.notEqual(DEP.layout, DYN.layout);
  assert.deepEqual(DYN.elements, STATIC.elements); assert.deepEqual(DYN.props, STATIC.props);
  assert.deepEqual(Object.keys(DYN.edits), ['add', 'key', 'connect', 'moveTo', 'rename']);
  assert.deepEqual(DEP.elements.map(e => [e.type, e.label, e.name ?? true]), [['c4.DeploymentNode', 'Deployment node', true], ['c4.ContainerInstance', 'Container instance', false], ['uml.Comment', 'Comment', true]]);
  assert.deepEqual(DEP.lines.map(e => e.type), ['c4.Relationship', 'uml.CommentLink']);
  assert.deepEqual(DEP.props['c4.DeploymentNode'].map(f => f.key), ['description', 'technology']);
  assert.deepEqual(DEP.props['c4.ContainerInstance'].map(f => f.key), ['container']);
  assert.deepEqual(Object.keys(DEP.edits), ['add', 'key']);
  for (const T of [DYN, DEP]) for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows', 'text']) assert.equal(typeof T[k], 'function', `${T.name} ${k}`);
  assert.deepEqual(Object.keys(DYN.rules), [...Object.keys(STATIC.rules), 'c4-steps']);
  assert.deepEqual(Object.keys(DEP.rules), [...Object.keys(STATIC.rules), 'c4-steps', 'c4-box-line']);
  assert.deepEqual(DEP.refs, { 'c4.ContainerInstance': { 'props.container': 'cascade' } });
  assert.deepEqual(STATIC.refs, undefined, 'the static type is as M2.6 left it');
});

const pinned = (m, vid) => { const kinds = {}; check(m, vid).map(p => p.message).forEach(p => { const k = / cross$/.test(p) ? 'cross' : / lies on edge /.test(p) ? 'label on a line' : p; kinds[k] = (kinds[k] || 0) + 1; });
  return Object.entries(kinds).map(([k, n]) => `${n} ${k}`); };
test('23-c4.json\'s dynamic and deployment views lay out right and down: every line routed, no overlap, ends on outlines, boxes holding what they hold; the crossings and labels on lines pinned', () => {
  const want = { [`${DV} right`]: ['2 cross'], [`${DV} down`]: ['4 cross', '2 label on a line'], [`${PV} right`]: ['1 cross'], [`${PV} down`]: ['1 cross'] }, got = {};
  for (const vid of [DV, PV]) for (const direction of ['right', 'down']) {
    const m = withDir(C4, vid, direction), [g, warned] = said(() => layout(m, vid)), tag = `${vid} ${direction}`;
    assert.deepEqual(warned, [], `${tag}: drawn, every line routed`);
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${tag}: ${p.id} and ${q.id} overlap`);
    for (const f of g.families || []) for (const id of f.nodeIds) assert.ok(inside(g.byId[id], f), `${tag}: ${id} inside ${f.id}`);
    const { markup } = mapContext(m).buildView(vid), off = ends(markup).flatMap(({ from, to, a, b }) => [[from, a], [to, b]].map(([id, p]) => [id, offOutline(g.byId[id], p)]).filter(([, d]) => d > 1));
    assert.deepEqual(off, [], `${tag}: ends on outlines`);
    got[tag] = pinned(m, vid);
  }
  console.log(`# M2.7 23-c4.json check(): ${JSON.stringify(got)}`);
  assert.deepEqual(got, want, 'no overlap, overflow or line through a node; the crossings and labels on lines pinned (repair and reroute off, §11)');
});

test('the dynamic view (§7.5.2): each step numbered by its place, "k · description [technology]" (the layout\'s step), over the elements it shows; no line implied; people first', () => {
  const g = layout(C4, DV);
  assert.equal(g.nodes.length, 9); assert.equal((g.families || []).length, 0, 'its subject is not listed: no boundary');
  assert.deepEqual(g.edges.map(e => [e.id, e.step, e.label]), C4.views[V(DV)].edges.map((id, k) => [id, k + 1, `${C4.edges.find(e => e.id === id).label} [${C4.edges.find(e => e.id === id).props.technology}]`]));
  assert.deepEqual(g.edges.map(e => e.lbl.text.split(' · ')[0]), g.edges.map(e => String(e.step)), 'each label drawn with its number before it');
  assert.match(svgOf(g), />1 · Fills a basket and checks out in \[HTTPS\]</);
  assert.ok(!g.edges.some(e => e.implied), 'only steps are drawn');
  assert.equal(g.byId['c4-shopper'].sh, 'person'); assert.equal(g.byId['c4-payments'].ext, true);
  assert.ok(g.byId['c4-shopper'].col < g.byId['c4-mail'].col, 'a step into a person ranked as from them (M2.6\'s rankFlip)');
  // a step whose end is not shown is not drawn; a step listed twice is drawn once; the numbers are those drawn, 1, 2, 3 (S13)
  const m = structuredClone(C4); m.views[V(DV)].nodeIds = m.views[V(DV)].nodeIds.filter(id => id !== 'c4-payments'); m.views[V(DV)].edges.push('c4-api-db');
  assert.deepEqual(layout(m, DV).edges.map(e => e.step), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // listing its subject draws the boundary; a step to the boundary is not drawn
  const b = structuredClone(C4); b.views[V(DV)].nodeIds.unshift('c4-bookshop'); b.views[V(DV)].edges.unshift('c4-shopper-bookshop');
  const h = layout(b, DV);
  assert.deepEqual(h.families.map(f => f.title), ['Bookshop [Software System]']);
  assert.equal(h.edges.length, 10); assert.equal(h.edges[0].step, 1);
  // a view with no steps draws no line
  const none = structuredClone(C4); delete none.views[V(DV)].edges;
  assert.deepEqual(layout(none, DV).edges, []);
});

test('the deployment view (§7.5.3): deployment nodes nest as solid boxes titled "<name> [Deployment Node: technology]"; an instance drawn as its container; a node holding nothing shown as the map\'s node shape', () => {
  const g = layout(C4, PV), f = new Map(g.families.map(x => [x.id, x]));
  assert.deepEqual(g.families.map(x => [x.id, x.title, x.parent ?? null, x.shape]), [
    ['c4-device', 'User\'s device [Deployment Node: Laptop, tablet or phone]', null, 'c4-node'], ['c4-browser', 'Web browser [Deployment Node: Chrome, Firefox, Safari or Edge]', 'c4-device', 'c4-node'],
    ['c4-web-host', 'Web server [Deployment Node: Ubuntu 24.04 LTS]', null, 'c4-node'], ['c4-docker', 'Docker Compose [Deployment Node: Docker Engine 27]', 'c4-web-host', 'c4-node'],
    ['c4-db-host', 'Database server [Deployment Node: Ubuntu 24.04 LTS]', null, 'c4-node'], ['c4-postgres', 'PostgreSQL [Deployment Node: PostgreSQL 16]', 'c4-db-host', 'c4-node']]);
  assert.ok(inside(f.get('c4-browser'), f.get('c4-device')) && inside(f.get('c4-postgres'), f.get('c4-db-host')));
  const api = g.byId['c4-api-1'];
  assert.deepEqual([api.label, api.tag, api.desc, api.sh, api.shape], ['Shop API', '[Container: Python, FastAPI]', 'Catalogue, basket, checkout and accounts as a JSON API.', 'box', 'c4']);
  assert.equal(api.aria, 'Instance of container Shop API, Python, FastAPI: Catalogue, basket, checkout and accounts as a JSON API.');
  const s = svgOf(g);
  assert.match(s, /<rect class="family-box"[^>]*rx="6" fill="none" stroke="var\(--um-muted\)" stroke-width="1.4"\/><text class="family-title"[^>]*>Docker Compose<\/text><text class="family-title"[^>]*>\[Deployment Node: Docker Engine 27\]</);
  assert.ok(!/family-title[^>]*>[^<]*…</.test(s), 'every box as wide as its title: none cut');
  assert.ok(!/family-box[^>]*stroke-dasharray/.test(s), 'solid: a dashed box is a boundary');
  // the container's shape and external tone carry over; a node holding nothing shown is the map's node
  const m = structuredClone(C4); m.nodes.find(n => n.id === 'c4-db').props.shape = 'cylinder'; m.nodes.find(n => n.id === 'c4-db').props.external = true;
  m.views[V(PV)].nodeIds = m.views[V(PV)].nodeIds.filter(id => id !== 'c4-storefront-1');
  const h = layout(m, PV);
  assert.deepEqual([h.byId['c4-db-1'].sh, h.byId['c4-db-1'].ext, h.byId['c4-db-1'].kind], ['cylinder', true, 'external']);
  assert.deepEqual([h.byId['c4-browser'].sh, h.byId['c4-browser'].tag, h.byId['c4-browser'].aria], ['node', '[Deployment Node: Chrome, Firefox, Safari or Edge]', 'Deployment node Web browser, Chrome, Firefox, Safari or Edge']);
  assert.ok(!h.families.some(x => x.id === 'c4-browser'), 'holding nothing shown: a node, not a box');
  // relationships are the model's: none derived from the containers'; one whose instance is not shown is lifted to its node (§5.2)
  assert.deepEqual(g.edges.map(e => e.id), ['c4-storefront-1-api-1', 'c4-api-1-db-1', 'c4-api-1-queue-1', 'c4-worker-1-queue-1', 'c4-worker-1-db-1']);
  const lift = structuredClone(C4); lift.views[V(PV)].nodeIds = lift.views[V(PV)].nodeIds.filter(id => id !== 'c4-db-1' && id !== 'c4-queue-1');
  assert.deepEqual(layout(lift, PV).edges.filter(e => e.implied).map(e => [e.id, e.label]), [['c4-api-1->c4-postgres', 'Reads from and writes to [+1]'], ['c4-worker-1->c4-postgres', 'Claims paid orders from [+1]']]);
});

test('the layout is not edited after layoutTyped: each view drawn twice from one memo gives the same markup', () => {
  for (const vid of [DV, PV]) {
    const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-'), first = mapContext(C4, { memos }).buildView(vid), pts = JSON.stringify(memos[vid].g.edges.map(e => e.pts));
    assert.equal(unid(mapContext(C4, { memos }).buildView(vid).markup), unid(first.markup), vid);
    assert.equal(memos[vid].runs, 1, vid); assert.equal(JSON.stringify(memos[vid].g.edges.map(e => e.pts)), pts, vid);
  }
});

// ---- steps reordered by key (§7.5.2), a step by connect
test('steps reordered: Alt + Down, Up, Right and Left on a selected step move it one place (move { id, view, index }), the numbers follow, undone byte-identical; a card or a step at an end: the canvas\'s own or nothing', () => {
  const v = C4.views[V(DV)], mv = (id, by) => DYN.edits.moveTo(C4, v, id, { by });
  assert.deepEqual(mv('c4-api-db', [0, 1]), [{ op: 'move', id: 'c4-api-db', view: DV, index: 4 }]);
  assert.deepEqual(mv('c4-api-db', [0, -1]), [{ op: 'move', id: 'c4-api-db', view: DV, index: 2 }]);
  assert.deepEqual(mv('c4-api-db', [1, 0]), mv('c4-api-db', [0, 1])); assert.deepEqual(mv('c4-api-db', [-1, 0]), mv('c4-api-db', [0, -1]));
  assert.deepEqual(mv('c4-shopper-storefront', [0, -1]), []); assert.deepEqual(mv('c4-worker-db', [0, 1]), []);
  assert.equal(mv('c4-api', [0, 1]), null, 'a card: its pin, as before');
  assert.equal(DYN.edits.moveTo(C4, v, 'c4-api-db', null), null, 'a line dropped where there is no slot');
  assert.deepEqual(DYN.edits.moveTo(C4, v, 'c4-api-db', { index: 0 }), [{ op: 'move', id: 'c4-api-db', view: DV, index: 0 }]);
  const h = history(C4), was = JSON.stringify(h.model);
  h.push(apply(h.model, mv('c4-api-db', [0, 1])));
  assert.deepEqual(h.model.views[V(DV)].edges.slice(2, 6), ['c4-api-payments', 'c4-api-queue', 'c4-api-db', 'c4-worker-queue']);
  const num = id => layout(h.model, DV).edges.find(e => e.id === id).step;
  assert.equal(num('c4-api-db'), 5); assert.equal(num('c4-api-queue'), 4);
  assert.equal(JSON.stringify(h.undo()), was);
  // a comment link between steps does not count as a place
  const n = structuredClone(C4); n.nodes.push({ id: 'note', type: 'uml.Comment', label: 'Paid first' }); n.edges.push({ id: 'nl', type: 'uml.CommentLink', from: 'note', to: 'c4-api' });
  n.views[V(DV)].nodeIds.push('note'); n.views[V(DV)].edges.splice(3, 0, 'nl');
  assert.deepEqual(DYN.edits.moveTo(n, n.views[V(DV)], 'c4-api-payments', { by: [0, 1] }), [{ op: 'move', id: 'c4-api-payments', view: DV, index: 4 }]);
  assert.deepEqual(apply(n, DYN.edits.moveTo(n, n.views[V(DV)], 'c4-api-payments', { by: [0, 1] })).views[V(DV)].edges.slice(2, 6), ['nl', 'c4-api-db', 'c4-api-payments', 'c4-api-queue']);
  assert.deepEqual(layout(n, DV).edges.filter(e => e.type === 'uml.CommentLink').map(e => [e.id, e.label]), [['nl', undefined]]);
  // numbers are derived among the steps drawn (S13): a step listed twice or not drawn takes no number and no place
  const g = structuredClone(C4); g.views[V(DV)].edges = ['c4-shopper-storefront', 'c4-storefront-api', 'c4-shopper-storefront', 'c4-worker-mail', 'c4-api-db'];
  g.views[V(DV)].nodeIds = g.views[V(DV)].nodeIds.filter(id => id !== 'c4-mail');
  assert.deepEqual(layout(g, DV).edges.map(e => [e.id, e.step]), [['c4-shopper-storefront', 1], ['c4-storefront-api', 2], ['c4-api-db', 3]]);
  assert.equal(DYN.text(g, g.views[V(DV)], 'c4-api-db'), '3 · Reads and writes books, baskets and orders in [SQL]');
  assert.deepEqual(DYN.edits.moveTo(g, g.views[V(DV)], 'c4-api-db', { by: [0, -1] }), [{ op: 'move', id: 'c4-api-db', view: DV, index: 1 }]);
  assert.equal(DYN.edits.moveTo(g, g.views[V(DV)], 'c4-worker-mail', { by: [0, -1] }), null, 'not drawn: no step to move');
});

test('connect on a dynamic view: a relationship the model has between the two, not yet a step, is added as the last step; else the canvas\'s add (a new relationship, listed last); a comment link the canvas\'s', () => {
  const v = C4.views[V(DV)], line = { type: 'c4.Relationship', label: 'Relationship' };
  assert.deepEqual(DYN.edits.connect(C4, v, 'c4-shopper', 'c4-storefront', null, line), null, 'a step already: a new relationship');
  const m = structuredClone(C4); m.views[V(DV)].edges = m.views[V(DV)].edges.filter(id => id !== 'c4-api-db');
  const r = DYN.edits.connect(m, m.views[V(DV)], 'c4-api', 'c4-db', null, line);
  assert.deepEqual(r, [{ op: 'set', view: DV, path: 'edges', value: [...m.views[V(DV)].edges, 'c4-api-db'] }]);
  assert.deepEqual([layout(apply(m, r), DV).edges.at(-1).step, layout(apply(m, r), DV).edges.at(-1).label], [10, 'Reads and writes books, baskets and orders in [SQL]']);
  assert.equal(DYN.edits.connect(m, m.views[V(DV)], 'c4-api', 'c4-db', null, { type: 'uml.CommentLink' }), null);
  assert.equal(DYN.edits.connect(m, m.views[V(DV)], 'c4-db', 'c4-api', null, line), null, 'no relationship that way');
  // the canvas's add on a view that lists its lines lists the new one last: a new step
  const added = apply(C4, [{ op: 'add', element: Rel('new', 'c4-mail', 'c4-courier', 'Tells'), view: DV }]);
  assert.deepEqual([layout(added, DV).edges.at(-1).step, layout(added, DV).edges.at(-1).label], [11, 'Tells']);
});

test('F2 on a step (rename): its drawn text, number and technology, read back as its description; text typed without them is the description; a relationship that is no step, the canvas\'s', () => {
  const v = C4.views[V(DV)], r = (id, t) => DYN.edits.rename(C4, v, id, t);
  assert.deepEqual(r('c4-api-payments', 'Charges cards with [HTTPS]'), [], 'unchanged: nothing');
  assert.deepEqual(r('c4-api-payments', '3 · Charges cards with [HTTPS]'), [], 'its number typed before it: nothing');
  assert.deepEqual(r('c4-api-payments', '3. Charges the card with [HTTPS]'), [{ op: 'set', id: 'c4-api-payments', path: 'label', value: 'Charges the card with' }]);
  assert.deepEqual(r('c4-api-payments', 'Bills'), [{ op: 'set', id: 'c4-api-payments', path: 'label', value: 'Bills' }]);
  assert.deepEqual(r('c4-api-payments', 'Bills [SOAP]'), [{ op: 'set', id: 'c4-api-payments', path: 'label', value: 'Bills [SOAP]' }], 'another technology is text');
  assert.deepEqual(r('c4-api-payments', '3.'), [{ op: 'set', id: 'c4-api-payments', path: 'label', value: undefined }]);
  assert.equal(r('c4-bookshop-mail', 'x'), null); assert.equal(r('c4-api', 'x'), null);
});

test('deleting a container deletes its instances (refs: props.container, cascade), with their relationships, from every view; hiding it from a view does not', () => {
  const m = apply(C4, [{ op: 'delete', id: 'c4-worker' }]);
  assert.ok(!m.nodes.some(n => n.id === 'c4-worker' || n.id === 'c4-worker-1'));
  assert.ok(!m.edges.some(e => [e.from, e.to].includes('c4-worker-1')));
  assert.ok(!m.views[V(PV)].nodeIds.includes('c4-worker-1'));
  assert.deepEqual(validate(m).filter(p => p.level === 'error'), []);
  assert.deepEqual(layout(m, PV).edges.map(e => e.id), ['c4-storefront-1-api-1', 'c4-api-1-db-1', 'c4-api-1-queue-1']);
  // the instance's own node kept, and one deleted in the same transaction passed over
  assert.ok(m.nodes.some(n => n.id === 'c4-docker'));
  assert.deepEqual(apply(C4, [{ op: 'delete', id: 'c4-worker-1' }, { op: 'delete', id: 'c4-worker' }]).nodes.map(n => n.id), m.nodes.map(n => n.id));
  const hid = apply(C4, [{ op: 'hide', id: 'c4-worker', view: 'c4-containers' }]);
  assert.ok(hid.nodes.some(n => n.id === 'c4-worker-1'));
});

// ---- §5.1: the views' rules, each with a passing and a failing case
const BREAKS = {
  'c4-steps': [m => { m.views[V(DV)].edges.push('c4-nowhere'); return ['c4-nowhere']; }, 'error'],
  'c4-level': [m => { m.views[V(PV)].nodeIds.push('c4-api'); return ['c4-api']; }, 'error'],
  'c4-subject': [m => { m.views[V(PV)].subject = 'c4-api'; return ['c4-api']; }, 'error'],
  'c4-label': [m => { delete m.edges.find(e => e.id === 'c4-api-1-db-1').label; return ['c4-api-1-db-1', 'c4-api-1', 'c4-db-1']; }, 'warning'],
  'c4-title': [m => { delete m.views[V(PV)].title; return []; }, 'warning'],
  'c4-box-line': [m => { m.edges.push(Rel('sd', 'c4-storefront-1', 'c4-docker', 'Calls')); return ['sd', 'c4-docker']; }, 'warning'],
};
test('validators: 23-c4.json breaks no rule in its two views; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(ours(C4), []);
  for (const [rule, [broke, level]] of Object.entries(BREAKS)) {
    const m = structuredClone(C4), ids = broke(m), got = ours(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    assert.match(got[0].message, new RegExp('^' + rule + ': ')); assert.equal(got[0].level, level, rule); assert.deepEqual([...got[0].ids].sort(), [...ids].sort(), rule);
  }
  const msg = (f, m = structuredClone(C4)) => { f(m); return ours(m).map(p => `${p.level} ${p.path} ${p.message}`); }, d = `views[${V(DV)}]`, p = `views[${V(PV)}]`;
  // c4-steps: written in the view, twice, not shown
  assert.deepEqual(msg(m => m.views[V(DV)].edges.push(Rel('inl', 'c4-api', 'c4-db', 'Writes'))), [`error ${d}.edges[10] c4-steps: step inl is written in the view: a step names a relationship of the model`]);
  assert.deepEqual(msg(m => m.views[V(DV)].edges.push('c4-api-db')), [`error ${d}.edges[10] c4-steps: c4-api-db is a step twice: each relationship is one step`]);
  assert.deepEqual(msg(m => { m.views[V(DV)].nodeIds = m.views[V(DV)].nodeIds.filter(id => id !== 'c4-mail'); }), [
    `warning ${d}.edges[7] c4-steps: c4-worker-mail, from "Order worker" to "Email service", is not drawn: the view does not show "Email service"`,
    `warning ${d}.edges[8] c4-steps: c4-mail-shopper, from "Email service" to "Shopper", is not drawn: the view does not show "Email service"`]);
  // c4-level at the subject's level: a software system's as a container view, a container's as a component view, none as a landscape
  assert.deepEqual(msg(m => m.views[V(DV)].nodeIds.push('c4-catalogue')).slice(0, 2), [`error ${d}.nodeIds[9] c4-level: "Catalogue", a component, is not drawn in a dynamic view of "Bookshop"`,
    `warning ${d}.edges[1] c4-steps: c4-storefront-api, from "Storefront" to "Shop API", is not drawn: the view draws "Shop API" as a boundary`]);
  assert.deepEqual(msg(m => { m.views[V(DV)].subject = 'c4-api'; m.views[V(DV)].nodeIds.push('c4-catalogue'); }).filter(x => / c4-(level|subject): /.test(x)), [], 'a container\'s components at its level');
  assert.deepEqual(msg(m => { delete m.views[V(DV)].subject; }), ['c4-storefront', 'c4-api', 'c4-db', 'c4-queue', 'c4-worker'].map(id => `error ${d}.nodeIds[${C4.views[V(DV)].nodeIds.indexOf(id)}] c4-level: "${C4.nodes.find(n => n.id === id).label}", a container, is not drawn in a dynamic view`));
  assert.deepEqual(msg(m => { m.views[V(DV)].subject = 'c4-shopper'; }), [`error ${d}.subject c4-subject: its subject "Shopper" is a person: a dynamic view zooms into a software system, a container or nothing`, ...msg(m => { delete m.views[V(DV)].subject; })]);
  // the deployment view: a static element; an instance of another system's container when it has a subject; a subject that is no software system
  assert.deepEqual(msg(m => m.views[V(PV)].nodeIds.push('c4-shopper')), [`error ${p}.nodeIds[11] c4-level: "Shopper", a person, is not drawn in a deployment view`]);
  assert.deepEqual(msg(m => { m.views[V(PV)].subject = 'c4-bookshop'; }), []);
  assert.deepEqual(msg(m => { m.nodes.push({ id: 'pc', type: 'c4.Container', label: 'Gateway', parent: 'c4-payments', props: { description: 'Card API.', technology: 'Go' } }, { id: 'pc-1', type: 'c4.ContainerInstance', label: 'Gateway', parent: 'c4-docker', props: { container: 'pc' } });
    m.views[V(PV)].subject = 'c4-bookshop'; m.views[V(PV)].nodeIds.push('pc-1'); }), [`error ${p}.nodeIds[11] c4-level: "Gateway", an instance of "Gateway", is not drawn in a deployment view of "Bookshop": "Gateway" is not one of its containers`]);
  assert.deepEqual(msg(m => { m.views[V(PV)].subject = 'c4-api'; }), [`error ${p}.subject c4-subject: its subject "Shop API" is a container: a deployment view is of a software system or of all`]);
  // the model's rules hold in these views too, said once
  assert.deepEqual(msg(m => { m.nodes.find(n => n.id === 'c4-db-1').props.container = 'c4-catalogue'; }).map(x => x.split(' c4-')[1].split(':')[0]), ['instance']);
  // c4-steps: a step written in the view that is no relationship; a view listing no step
  assert.deepEqual(msg(m => m.views[V(DV)].edges.push({})), [`error ${d}.edges[10] c4-steps: step null is written in the view and is no relationship: a step names a relationship of the model`]);
  assert.deepEqual(msg(m => { delete m.views[V(DV)].edges; }), [`warning ${d}.edges c4-steps: view "${DV}" lists no step: a dynamic view draws its steps alone`]);
  // c4-box-line: an instance hidden while its node still holds something shown: its relationships are not drawn, and said so;
  // with the node holding nothing shown they are lifted onto it (no warning)
  const hide = ids => m => { m.views[V(PV)].nodeIds = m.views[V(PV)].nodeIds.filter(id => !ids.includes(id)); };
  assert.deepEqual(msg(hide(['c4-db-1'])), [
    `warning edges[${C4.edges.findIndex(e => e.id === 'c4-api-1-db-1')}] c4-box-line: c4-api-1-db-1, from "Shop API" to "Database", is not drawn: the view draws "PostgreSQL" as a box, which no line ends on`,
    `warning edges[${C4.edges.findIndex(e => e.id === 'c4-worker-1-db-1')}] c4-box-line: c4-worker-1-db-1, from "Order worker" to "Database", is not drawn: the view draws "PostgreSQL" as a box, which no line ends on`]);
  assert.deepEqual(msg(hide(['c4-db-1', 'c4-queue-1'])), []);
  // the dynamic view's own c4-label, c4-description and c4-technology, as on a static view
  assert.deepEqual(msg(m => { delete m.edges.find(e => e.id === 'c4-api-queue').label; }).map(x => x.split(' ').slice(0, 3).join(' ')), ['warning edges[11].label c4-label:']);
});

// ---- names, the key, describe(), the PDF
test('names, reading order and the key (A1): steps named by number; boxes then what they hold; each view\'s key', () => {
  const g = layout(C4, DV);
  assert.equal(g.edges[0].aria, 'Step 1: Relationship from Shopper to Storefront: Fills a basket and checks out in [HTTPS]');
  assert.match(svgOf(g), /<title>Step 10: Relationship from Order worker to Database: Marks orders as fulfilled in \[SQL\]<\/title>/);
  assert.deepEqual(names(g), ['Person', 'Container', 'External software system', 'Relationship']);
  const h = layout(C4, PV);
  assert.deepEqual(h.order.slice(0, 6), ['c4-device', 'c4-browser', 'c4-storefront-1', 'c4-web-host', 'c4-docker', 'c4-api-1']);
  assert.equal(h.order.length, 11 + 5);
  assert.equal(h.families.find(f => f.id === 'c4-docker').aria, 'Deployment node Docker Compose, Docker Engine 27, a box holding 2 container instances');
  assert.match(svgOf(h),  /class="family" data-family="c4-docker" data-parent="c4-web-host" role="img" aria-label="Deployment node Docker Compose, Docker Engine 27, a box holding 2 container instances"/);
  assert.deepEqual(names(h), ['Deployment node', 'Container instance', 'Relationship']);
  const m = structuredClone(C4); m.nodes.find(n => n.id === 'c4-db').props.shape = 'cylinder';
  assert.deepEqual(names(layout(m, PV)), ['Deployment node', 'Container instance', 'Container instance, cylinder', 'Relationship']);
});

test('describe(): each view in sentences, what it holds in reading order, then each step or relationship', () => {
  const d = describe(C4, DV).split('\n');
  assert.equal(d[0], 'Placing an order: a C4 dynamic diagram of 9 elements and 10 steps.');
  assert.equal(d[1], 'Person Shopper: Browses the catalogue, buys books and tracks orders.');
  assert.equal(d[10], 'Step 1: Relationship from Shopper to Storefront: Fills a basket and checks out in [HTTPS].');
  assert.equal(d.length, 1 + 9 + 10);
  const e = describe(C4, PV).split('\n');
  assert.equal(e[0], 'Bookshop: production deployment: a C4 deployment diagram of 11 elements and 5 relationships.');
  assert.deepEqual(e.slice(1, 4), ['Deployment node User\'s device, Laptop, tablet or phone, a box holding 1 deployment node.', 'Deployment node Web browser, Chrome, Firefox, Safari or Edge, a box holding 1 container instance.',
    'Instance of container Storefront, TypeScript, React: The shop in the browser: catalogue, basket and checkout, and the admin pages for staff.']);
  assert.equal(e.length, 1 + 11 + 5);
  assert.throws(() => DEP.describe(C4, 'nowhere'), /no view "nowhere"/);
});

test('the PDF\'s tables (§9): a step\'s number before its text; a deployment node\'s technology and description; an instance\'s container, its technology and description', () => {
  const dv = C4.views[V(DV)], pv = C4.views[V(PV)];
  assert.equal(DYN.text(C4, dv, 'c4-api-payments'), '3 · Charges cards with [HTTPS]');
  assert.equal(DYN.text(C4, dv, 'c4-bookshop-mail'), 'Sends order confirmations with [HTTPS]', 'not a step: its text alone');
  assert.equal(DEP.text(C4, pv, 'c4-api-1-db-1'), 'Reads from and writes to [SQL, port 5432, private network]');
  assert.deepEqual(['c4-device', 'c4-api-1', 'c4-api'].map(id => DEP.word(C4, id)), ['Deployment node', 'Container instance', 'Container']);
  assert.deepEqual(DEP.rows(C4, pv, 'c4-web-host'), ['Ubuntu 24.04 LTS', 'The web tier\'s server.']);
  assert.deepEqual(DEP.rows(C4, pv, 'c4-api-1'), ['Instance of Shop API', 'Python, FastAPI', 'Catalogue, basket, checkout and accounts as a JSON API.']);
  assert.deepEqual(DEP.rows(C4, pv, 'c4-api'), STATIC.rows(C4, pv, 'c4-api')); assert.equal(DEP.rows(C4, pv, 'nowhere'), null);
});

// ---- editing (§7.5): the deployment view's hooks
test('the deployment view\'s hooks: the palette\'s instance picks its container and goes into the first node holding no other; T on an instance picks its container; the Owner field offers deployment nodes', () => {
  const v = C4.views[V(PV)], r = DEP.edits.add(C4, v, { type: 'c4.ContainerInstance' }, '');
  assert.deepEqual(r.pick, ['Storefront', 'Shop API', 'Order worker', 'Database', 'Order queue']);
  assert.deepEqual(r.then(1), [{ op: 'add', element: { id: 'c4-api-instance', type: 'c4.ContainerInstance', label: 'Shop API', parent: 'c4-browser', props: { container: 'c4-api' } }, view: PV }]);
  const m = apply(C4, r.then(1));
  assert.deepEqual(ours(m), []); assert.ok(layout(m, PV).families.find(f => f.id === 'c4-browser').nodeIds.includes('c4-api-instance'));
  assert.equal(DEP.edits.add(m, v, { type: 'c4.ContainerInstance' }, 'API 2').then(1)[0].element.id, 'c4-api-instance-2');
  assert.equal(DEP.edits.add(m, v, { type: 'c4.ContainerInstance' }, 'API 2').then(1)[0].element.label, 'API 2');
  assert.equal(DEP.edits.add(C4, v, { type: 'c4.DeploymentNode' }, 'Cache host'), null, 'a deployment node: the canvas\'s add');
  assert.deepEqual(DEP.edits.add(C4, { ...v, nodeIds: [] }, { type: 'c4.ContainerInstance' }, ''), { error: 'Add a deployment node first: an instance runs on one' });
  const t = DEP.edits.key(C4, v, ['c4-db-1'], 'T');
  assert.deepEqual(t.pick, r.pick);
  assert.deepEqual(t.then(4), [{ op: 'set', id: 'c4-db-1', path: 'props.container', value: 'c4-queue' }]); assert.deepEqual(t.then(3), []);
  assert.equal(DEP.edits.key(C4, v, ['c4-docker'], 'T'), null); assert.equal(DEP.edits.key(C4, v, ['c4-docker'], 'D'), null);
  assert.deepEqual(DEP.owners(C4, C4.nodes.find(n => n.id === 'c4-api-1')).map(o => o.id), ['c4-device', 'c4-browser', 'c4-web-host', 'c4-docker', 'c4-db-host', 'c4-postgres']);
  // a deployment node: not itself nor a node inside it
  assert.deepEqual(DEP.owners(C4, C4.nodes.find(n => n.id === 'c4-docker')).map(o => o.id), ['c4-device', 'c4-browser', 'c4-web-host', 'c4-db-host', 'c4-postgres']);
  assert.deepEqual(DEP.owners(C4, C4.nodes.find(n => n.id === 'c4-web-host')).map(o => o.id), ['c4-device', 'c4-browser', 'c4-db-host', 'c4-postgres']);
  // the instance's id is free of every id in the model, a relationship's too
  const taken = structuredClone(C4); taken.edges.push(Rel('c4-api-instance', 'c4-api', 'c4-db', 'Reads'));
  const ops = DEP.edits.add(taken, taken.views[V(PV)], { type: 'c4.ContainerInstance' }, '').then(1);
  assert.equal(ops[0].element.id, 'c4-api-instance-2'); assert.ok(apply(taken, ops).nodes.some(x => x.id === 'c4-api-instance-2'));
  assert.deepEqual(DEP.owners(C4, C4.nodes.find(n => n.id === 'c4-api')), STATIC.owners(C4, C4.nodes.find(n => n.id === 'c4-api')));
  // the dynamic view: add at its subject's level (a container owned by the software system; a component, as on a container view, the canvas's own)
  const dv = C4.views[V(DV)], add = DYN.edits.add(C4, dv, { type: 'c4.Container' }, 'Search');
  assert.deepEqual(add, [{ op: 'add', element: { id: 'container1', type: 'c4.Container', label: 'Search', parent: 'c4-bookshop' }, view: DV }]);
  assert.deepEqual(ours(apply(C4, add)).filter(p => p.level === 'error'), []);
  assert.equal(DYN.edits.add(C4, dv, { type: 'c4.Component' }, 'X'), null); assert.equal(DYN.edits.add(C4, { ...dv, subject: undefined }, { type: 'c4.Container' }, 'X'), null);
  assert.equal(DYN.edits.add(C4, { ...dv, subject: 'c4-api' }, { type: 'c4.Component' }, 'X')[0].element.parent, 'c4-api');
  // the dynamic view: D and T as on a static view
  assert.deepEqual(DYN.edits.key(C4, C4.views[V(DV)], ['c4-worker'], 'T').pick, ['Person', 'Software system', 'Container', 'Component']);
});

test('save and reopen (DoD 6): a 30-step session across both views undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: { id: `n${i}`, type: 'c4.DeploymentNode', label: `Host ${i}`, props: { technology: 'Linux' } }, view: PV }],
    [{ op: 'add', element: { id: `i${i}`, type: 'c4.ContainerInstance', label: 'Shop API', parent: `n${i}`, props: { container: 'c4-api' } }, view: PV }],
    [{ op: 'add', element: Rel(`r${i}`, `i${i}`, 'c4-db-1', 'Reads from', 'SQL') }],
    [{ op: 'set', id: `n${i}`, path: 'props.description', value: `Host number ${i}.` }],
    [[{ op: 'move', id: 'c4-api-db', view: DV, index: 4 }], [{ op: 'move', id: 'c4-api-db', view: DV, index: 3 }], [{ op: 'set', view: DV, path: 'edges', value: [...C4.views[V(DV)].edges.filter(id => id !== 'c4-worker-db'), 'c4-worker-db'] }]][i % 3],
    [[{ op: 'hide', id: `i${i}`, view: PV }], [{ op: 'delete', id: `n${i}` }], [{ op: 'set', id: `i${i}`, path: 'props.container', value: 'c4-worker' }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(C4), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  for (const vid of [DV, PV]) {
    const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-'), draw = (m, o) => unid(mapContext(m, o).buildView(vid).markup);
    let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
    assert.ok(memos[vid].runs > 1, vid);
    assert.equal(session, draw(reopened), vid);
    assert.equal(describe(reopened, vid), describe(JSON.parse(seen[30]), vid));
  }
});
