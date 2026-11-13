// The deployment diagram, uml.deployment (work package 5.5, notes/stage-5.md §10.3): the type's definition, the cube (its
// size, outline and frame), boxes nested six deep, artifacts deployed by nesting and by a line, the lines' looks and labels,
// §8's small gap with labelGaps and cut, line ends on outlines and on a box's faces, accessible names, the reading order,
// the legend, the PDF's rows, the validators, describe(), the editing hooks, a 30-step session saved and reopened, and the
// common edits' time (§14). tests/deployment.html draws it in a browser and edits it by pointer and keyboard. Imports src/
// to reach the internals; lib/umlimator-all.js holds the same code.
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
import { layoutTyped } from '../src/typed/layout.js';
import '../src/uml/deployment.js';

const DEP = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/06-deployment.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.deployment' });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const N = (id, type, label, parent) => ({ id, type: 'uml.' + type, label, ...(parent ? { parent } : {}) });
const L = (id, type, from, to, label) => ({ id, type: 'uml.' + type, from, to, ...(label ? { label } : {}) });
const model = (nodes, edges, more = {}) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.deployment', nodeIds: nodes.map(n => n.id), ...more }] });
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const said = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } finally { console.warn = keep; } };
// each line's drawn path's two ends, from the markup (tests/usecase.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
// a point's distance from a cube's outline (SHAPE.node's, 10 px deep), closed or a box's: the frame holds the faces
const cubeOff = (n, [x, y]) => {
  const p = 10, poly = [[n.x, n.y + p], [n.x + p, n.y], [n.x + n.w, n.y], [n.x + n.w, n.y + n.h - p], [n.x + n.w - p, n.y + n.h], [n.x, n.y + n.h]];
  return Math.min(...poly.map((a, i) => { const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); })); };
const boxOff = (n, [x, y]) => { const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h); return dx || dy ? Math.hypot(dx, dy) : Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y); };

test('the definition: uml.deployment is registered with its palette, its five lines, its properties and its hooks', () => {
  assert.equal(T.name, 'uml.deployment');
  assert.deepEqual(T.elements.map(e => e.label), ['Node', 'Device', 'Execution environment', 'Artifact', 'Deployment specification', 'Component', 'Comment']);
  assert.deepEqual(T.lines.map(e => [e.type, e.label]), [['uml.Deployment', 'Deployment'], ['uml.Manifestation', 'Manifestation'], ['uml.CommunicationPath', 'Communication path'], ['uml.Dependency', 'Dependency'], ['uml.CommentLink', 'Comment link']]);
  for (const t of ['uml.Node', 'uml.Device', 'uml.ExecutionEnvironment', 'uml.Artifact', 'uml.DeploymentSpecification', 'uml.Component', 'uml.Deployment', 'uml.CommunicationPath']) assert.deepEqual(T.props[t].map(f => f.key), ['stereotypes'], t);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners', 'word', 'rows']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits), ['connect', 'remove']);
  assert.deepEqual(Object.keys(T.rules), ['deploy-ends', 'deployed-twice', 'nest-kinds', 'path-ends', 'manifest-ends']);
});

test('the cube: as wide as its widest text and 10 px of depth, its keyword over the name; its inset puts a slid point on its outline; open, its frame holds its faces', () => {
  const C = SHAPE.cube, n = { type: 'uml.ExecutionEnvironment', label: 'Java 21 runtime', stereotypes: ['jvm'] }, { w, h } = C.size(n), box = { ...n, x: 0, y: 0, w, h };
  assert.ok(w >= 130 && w <= 330 && h >= 60, `${w} × ${h}`);
  assert.ok(C.size({ type: 'uml.Node', label: 'A' }).w === 130 && C.size({ type: 'uml.Node', label: 'A' }).h === 60, 'the smallest cube');
  assert.ok(C.size({ type: 'uml.Device', label: 'x' }).h === C.size({ type: 'uml.Node', label: 'x' }).h + 14 || C.size({ type: 'uml.Device', label: 'x' }).h === 60, 'a keyword adds a row');
  assert.equal(C.size({ type: 'uml.Node', label: 'y'.repeat(200) }).w, 330, 'a long name is cut at 320 px');
  for (const [s, ts] of [['L', [1, 5, h / 2]], ['R', [3, h / 2, h - 4]], ['T', [2, 9, w / 2]], ['B', [w / 3, w - 3]]]) for (const t of ts) {
    const d = C.inset(box, s, t), p = s === 'L' ? [d, t] : s === 'R' ? [w - d, t] : s === 'T' ? [t, d] : [t, h - d];
    assert.ok(cubeOff(box, p) < 0.01, `${s} ${t}: ${cubeOff(box, p)}`); }
  const svg = C.draw({ ...box, id: 'jvm', aria: 'Execution environment Java 21 runtime' });
  assert.match(svg, /data-shape="cube" tabindex="-1" role="img" aria-label="Execution environment Java 21 runtime"/);
  assert.match(svg, /class="c-st"[^>]*>«executionEnvironment»<\/text>[^]*class="c-st"[^>]*>«jvm»<\/text>[^]*class="c-name" data-o="jvm"[^>]*>Java 21 runtime</);
  const f = SHAPE.cube.frame({ id: 'b', x: 100, y: 100, w: 300, h: 120, title: '«device» Application server' });
  assert.match(f, /class="family-box" x="100" y="110" width="290" height="110"/, 'the front face');
  assert.match(f, /d="M100 110L110 100H400V210L390 220M390 110L400 100" class="dp-face"/, 'the outline and the faces\' edge, inside the frame');
  assert.match(f, /class="family-title" x="112" y="127"[^>]*>«device» Application server</, 'no keyword line: the title on one line, as before');
  // a keyword (and stereotypes) on a line above the name, as UML 2.5.1 draws them (decision of 13 Nov 2026): the name whole
  const two = SHAPE.cube.frame({ id: 'b', x: 100, y: 100, w: 220, h: 135, title: '«executionEnvironment» Web browser', kw: '«executionEnvironment»', name: 'Web browser', head: 15 });
  assert.deepEqual([...two.matchAll(/class="family-title" x="(\d+)" y="(\d+)"[^>]*>([^<]*)</g)].map(m => m.slice(1)), [['112', '127', '«executionEnvironment»'], ['112', '142', 'Web browser']]);
});

test('06-deployment.json draws: cubes, boxes nested by parent, artifacts, components, lines by kind; laid out clean right and down', () => {
  assert.deepEqual(validate(DEP), []);
  for (const direction of ['right', 'down']) {
    const m = withDir(DEP, direction), g = layout(m, 'production'), by = g.byId, fam = Object.fromEntries(g.families.map(f => [f.id, f]));
    assert.deepEqual(check(m, 'production'), [], direction);
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${direction}: ${p.id} and ${q.id} overlap`);
    assert.deepEqual(['edge', 'database', 'queue'].map(id => by[id].shape), ['cube', 'cube', 'cube'], 'a target holding nothing shown is a closed cube');
    assert.deepEqual(['storefront-bundle', 'edge-routes', 'shop-api-jar', 'shop-api-config'].map(id => by[id].shape), ['artifact', 'artifact', 'artifact', 'artifact']);
    assert.deepEqual(['shop-api', 'order-worker'].map(id => by[id].shape), ['component', 'component']);
    assert.deepEqual(Object.keys(fam).sort(), ['app-server', 'browser', 'jvm', 'shopper-device']);
    assert.ok(g.families.every(f => f.shape === 'cube'));
    assert.equal(fam.jvm.parent, 'app-server'); assert.ok(inside(fam.jvm, fam['app-server']));
    ['shop-api-jar', 'order-worker-jar', 'shop-api-config'].forEach(id => assert.ok(inside(by[id], fam.jvm), `${direction}: ${id} in the runtime`));
    assert.equal(fam.jvm.title, '«executionEnvironment» Java 21 runtime'); assert.equal(fam['app-server'].title, '«device» Application server');
    // each box's keyword on a line above its name, in 15 px more header room: what it holds keeps its 12 + 14 px under it
    assert.deepEqual(['browser', 'jvm', 'shopper-device', 'app-server'].map(id => [fam[id].kw, fam[id].name, fam[id].head]), [['«executionEnvironment»', 'Web browser', 15],
      ['«executionEnvironment»', 'Java 21 runtime', 15], ['«device»', 'Shopper\'s device', 15], ['«device»', 'Application server', 15]]);
    assert.ok(by['storefront-bundle'].y - fam.browser.y >= 10 + 24 + 15 + 12 + 14 - .01, `${direction}: storefront.js under the browser's two-line title`);
    const svg = svgOf(g);
    assert.match(svg, /data-o="browser">«executionEnvironment»<\/text><text class="family-title"[^>]*data-o="browser">Web browser</, `${direction}: the name whole, under the keyword`);
    assert.doesNotMatch(svg, /class="family-title"[^>]*>[^<]*…</, `${direction}: no title cut`);
    const e = Object.fromEntries(g.edges.map(x => [x.id, x]));
    assert.deepEqual(e['routes-on-edge'].end, { from: 'none', to: 'open', dashed: true }); assert.equal(e['routes-on-edge'].label, '«deploy»');
    assert.deepEqual(e['api-jar-manifests-api'].end, { from: 'none', to: 'open', dashed: true }); assert.equal(e['api-jar-manifests-api'].label, '«manifest»');
    assert.deepEqual(e['config-for-api-jar'].end, { from: 'none', to: 'open', dashed: true }); assert.equal(e['config-for-api-jar'].label, undefined);
    assert.deepEqual(e['app-to-database'].end, { from: 'none', to: 'none' }); assert.equal(e['app-to-database'].label, 'PostgreSQL wire protocol'); assert.equal(e['app-to-database'].cut, 280);
    assert.equal(e['routes-on-edge'].cut, undefined, 'only a communication path is cut');
  }
  // §8: the small gap, labelGaps, both flags off, as laid out
  const memos = {}; mapContext(DEP, { memos }).buildView('production');
  const { gap, rgap, labelGaps, repair, reroute } = memos.production.dg;
  assert.deepEqual({ gap, rgap, labelGaps, repair, reroute }, { gap: 48, rgap: 56, labelGaps: true, repair: false, reroute: false });
});

test('decision 21: what 06-deployment.json keeps laid out down, pinned: no label with no spot and none cut short, right and down; without labelGaps, one with no spot down', () => {
  const out = {}, sum = g => { const lab = g.edges.filter(e => e.label);
    return { labels: lab.length, noSpot: lab.filter(e => !e.lbl).map(e => e.id), cut: lab.filter(e => e.lbl && e.lbl.short).map(e => e.id), w: Math.round(g.bounds.w), h: Math.round(g.bounds.h), routes: g.stats }; };
  for (const direction of ['right', 'down']) { const memos = {}, m = withDir(DEP, direction); mapContext(m, { memos }).buildView('production');
    out[direction] = sum(layout(m, 'production'));
    out[direction + ' without labelGaps'] = sum(layoutTyped({ ...structuredClone(memos.production.dg), labelGaps: false })); }
  console.log(`# 5.5 decision 21: 06-deployment.json ${JSON.stringify(out)}`);
  for (const d of ['right', 'down']) assert.deepEqual([out[d].labels, out[d].noSpot, out[d].cut], [7, [], []], d);
  assert.deepEqual(out['right without labelGaps'].noSpot, [], 'laid out right, labelGaps changes nothing');
  assert.deepEqual(out['down without labelGaps'].noSpot, ['edge-to-app'], 'laid out down, labelGaps gives "HTTP" its spot');
  assert.ok(out.down.h > out['down without labelGaps'].h, 'for some height');
});

test('every line end is on its outline within 1 px: a closed cube\'s, an artifact\'s and a component\'s box, a cube box\'s', () => {
  for (const direction of ['right', 'down']) {
    const { g, markup } = mapContext(withDir(DEP, direction)).buildView('production'), E = ends(markup);
    assert.equal(E.length, g.edges.length);
    let faces = 0;
    E.forEach(({ from, to, i, a, b }) => [[from, a], [to, b]].forEach(([id, p]) => { const n = g.byId[id], f = !n && g.families.find(x => x.id === id);
      const d = n ? (n.shape === 'cube' ? cubeOff(n, p) : boxOff(n, p)) : cubeOff(f, p);
      if (f && (p[1] < f.y + 1 || p[0] > f.x + f.w - 1)) faces++;
      assert.ok(d <= 1, `${direction}: ${g.edges[i].id} ends ${d.toFixed(2)} px off ${id}`); }));
    assert.ok(faces > 0, `${direction}: some line ends on a box's face`);
  }
});

// six levels of boxes, side by side at the top, with a communication path from the deepest to a node at the top (L8)
const DEEP = (() => {
  const kinds = ['Node', 'Node', 'Device', 'Device', 'ExecutionEnvironment', 'ExecutionEnvironment'], nodes = [], edges = [];
  kinds.forEach((k, i) => nodes.push(N(`d${i + 1}`, k, `Level ${i + 1} ${k}`, i ? `d${i}` : null)));
  nodes.push(N('app', 'Artifact', 'app.war', 'd6'), N('lib', 'Artifact', 'lib.jar', 'd3'), N('top', 'Node', 'Monitor'), N('side', 'Device', 'Phone'), N('ui', 'Artifact', 'ui.apk', 'side'), N('comp', 'Component', 'App'));
  edges.push(L('deep-to-top', 'CommunicationPath', 'd6', 'top', 'metrics over a long-lived HTTPS connection'), L('phone-to-deep', 'CommunicationPath', 'side', 'd5', 'REST'), L('app-is', 'Manifestation', 'app', 'comp'),
    L('lib-for-app', 'Dependency', 'app', 'lib'));
  return model(nodes, edges);
})();
test('boxes six deep (§7, L8): each inside the one before, a path from the deepest to the top, laid out clean right and down; the width printed', () => {
  assert.deepEqual(validate(DEEP), []);
  const sizes = {};
  for (const direction of ['right', 'down']) {
    const m = withDir(DEEP, direction), g = layout(m, 'v'), fam = Object.fromEntries(g.families.map(f => [f.id, f]));
    assert.deepEqual(check(m, 'v'), [], direction);
    for (let i = 2; i <= 6; i++) assert.ok(inside(fam[`d${i}`], fam[`d${i - 1}`]) && fam[`d${i}`].parent === `d${i - 1}`, `${direction}: level ${i}`);
    assert.ok(inside(g.byId.app, fam.d6) && g.byId.top.shape === 'cube' && !meets(g.byId.top, fam.d1));
    const e = g.edges.find(x => x.id === 'deep-to-top'); assert.ok(e && e.pts.length >= 2 && e.lbl, `${direction}: the path from the deepest box is drawn and labelled`);
    assert.equal(g.byId.d1, undefined, 'a box is no node');
    sizes[direction] = [Math.round(fam.d1.w), Math.round(fam.d1.h)];
  }
  console.log(`# 5.5 six levels: the outer box ${JSON.stringify(sizes)} (w × h, right and down)`);
});

// a cube box's faces: its top strip and its right strip, 10 px deep, inside its frame; their lines, the front face's top and
// right and the slanted edges
const faceStrips = f => [{ x: f.x + 10, y: f.y, w: f.w - 10, h: 10, along: 0 }, { x: f.x + f.w - 10, y: f.y + 10, w: 10, h: f.h - 10, along: 1 }];
const faceLines = ({ x, y, w, h }) => [[[x, y + 10], [x + w - 10, y + 10]], [[x + w - 10, y + 10], [x + w - 10, y + h]], [[x, y + 10], [x + 10, y]], [[x + w - 10, y + 10], [x + w, y]], [[x + w, y + h - 10], [x + w - 10, y + h]]];
const crosses = (L, [a, b]) => { for (let t = 0; t <= 1; t += 0.01) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (x > L.x + 1 && x < L.x + L.w - 1 && y > L.y + 1 && y < L.y + L.h - 1) return true; } return false; };
function faceIssues(g) {
  const out = [], F = new Set(g.families.map(f => f.id));
  for (const f of g.families) {
    for (const e of g.edges) for (let i = 0; i + 1 < e.pts.length; i++) { const [a, b] = [e.pts[i], e.pts[i + 1]];
      for (const s of faceStrips(f)) { const k = s.along, o = 1 - k, lo0 = [s.x, s.y][o], d = [s.w, s.h][o]; // a run along the strip, inside it
        if (Math.abs(a[o] - b[o]) < .5 && a[o] > lo0 + .5 && a[o] < lo0 + d - .5) { const lo = Math.max(Math.min(a[k], b[k]), [s.x, s.y][k]), hi = Math.min(Math.max(a[k], b[k]), [s.x, s.y][k] + [s.w, s.h][k]); if (hi - lo > 12) out.push(`${e.id} runs ${Math.round(hi - lo)} px in ${f.id}'s face`); } } }
    for (const e of g.edges) if (e.lbl && faceLines(f).some(l => crosses(e.lbl, l))) out.push(`${e.id}'s label "${e.lbl.text}" on ${f.id}'s face`);
  }
  // a line's end on a box: its last run long enough for an arrowhead (about 9 px)
  for (const e of g.edges) [[e.from, e.pts[0], e.pts[1]], [e.to, e.pts.at(-1), e.pts.at(-2)]].forEach(([id, p, q]) => { if (F.has(id) && Math.hypot(p[0] - q[0], p[1] - q[1]) < 12) out.push(`${e.id}'s end on ${id}: ${Math.hypot(p[0] - q[0], p[1] - q[1]).toFixed(1)} px`); });
  return out;
}

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup (notes/stage-5.md §2.4)', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(DEP, { memos }).buildView('production'), pts = JSON.stringify(memos.production.g.edges.map(e => e.pts)), second = mapContext(DEP, { memos }).buildView('production');
  assert.equal(memos.production.runs, 1);
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos.production.g.edges.map(e => e.pts)), pts);
});

test('names, reading order and legend (A1): each box and what it holds, then the rest, then the lines; each kind keyed', () => {
  const g = layout(DEP, 'production'), s = svgOf(g), fam = Object.fromEntries(g.families.map(f => [f.id, f]));
  assert.equal(fam['app-server'].aria, 'Device Application server, holding 1 execution environment');
  assert.equal(fam.jvm.aria, 'Execution environment Java 21 runtime, in Application server, 3 artifacts deployed');
  assert.equal(g.byId['shop-api-jar'].aria, 'Artifact shop-api.jar, on Java 21 runtime, manifests Shop API');
  assert.equal(g.byId['shop-api-config'].aria, 'Deployment specification shop-api.yaml, on Java 21 runtime');
  assert.equal(g.byId['edge-routes'].aria, 'Artifact routes.conf, on Edge proxy', 'deployed by a line');
  assert.equal(g.byId.edge.aria, 'Node Edge proxy, 1 artifact deployed');
  assert.equal(g.byId.database.aria, 'Node Database');
  assert.equal(g.byId['shop-api'].aria, 'Component Shop API');
  const e = id => g.edges.find(x => x.id === id).aria;
  assert.equal(e('device-to-edge'), 'Communication path HTTPS from Shopper\'s device to Edge proxy');
  assert.equal(e('routes-on-edge'), 'Deployment from routes.conf to Edge proxy');
  assert.equal(e('api-jar-manifests-api'), 'Manifestation from shop-api.jar to Shop API');
  assert.match(s, /data-shape="cube" tabindex="-1" role="img" aria-label="Node Edge proxy, 1 artifact deployed"/);
  assert.match(s, /role="img" aria-label="Execution environment Java 21 runtime, in Application server, 3 artifacts deployed"/);
  assert.deepEqual(g.order.slice(0, 7), ['shopper-device', 'browser', 'storefront-bundle', 'edge', 'edge-routes', 'app-server', 'jvm']);
  assert.deepEqual(g.order.slice(14), DEP.edges.map(x => x.id), 'then every line');
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Deployment', 'Manifestation', 'Communication path', 'Dependency']);
  // stereotypes: over a cube's name, in a box's title and names
  const m = structuredClone(DEP); m.nodes.find(n => n.id === 'database').props = { stereotypes: ['managed'] }; m.nodes.find(n => n.id === 'jvm').props = { stereotypes: ['container'] };
  const h = layout(m, 'production');
  assert.equal(h.byId.database.aria, 'Node Database (managed)'); assert.match(svgOf(h), /class="c-st"[^>]*>«managed»<\/text>/);
  assert.equal(h.families.find(f => f.id === 'jvm').title, '«executionEnvironment» «container» Java 21 runtime');
});

test('describe(): the view in sentences, each element in reading order, then each line by its accessible name', () => {
  const d = describe(DEP, 'production').split('\n');
  assert.equal(d[0], 'Production: a deployment diagram of 14 elements and 8 lines.');
  assert.deepEqual(d.slice(1, 4), ['Device Shopper\'s device, holding 1 execution environment.', 'Execution environment Web browser, in Shopper\'s device, 1 artifact deployed.', 'Artifact storefront.js, on Web browser.']);
  assert.equal(d.at(-1), 'Communication path AMQP from Application server to Order queue.');
  assert.equal(d.length, 1 + 14 + 8);
});

test('the PDF\'s tables (§11): a target\'s kind and what is deployed on it, by nesting or by a line; an artifact\'s, what it manifests', () => {
  const v = DEP.views[0];
  assert.deepEqual(['jvm', 'app-server', 'edge', 'shop-api-config', 'shop-api', 'nowhere'].map(id => T.word(DEP, id)), ['Execution environment', 'Device', 'Node', 'Deployment specification', 'Component', null]);
  assert.deepEqual(T.rows(DEP, v, 'jvm'), ['shop-api.jar', 'order-worker.jar', 'shop-api.yaml']);
  assert.deepEqual(T.rows(DEP, v, 'edge'), ['routes.conf, by «deploy»']);
  assert.deepEqual(T.rows(DEP, v, 'database'), []);
  assert.deepEqual(T.rows(DEP, v, 'shop-api-jar'), ['manifests Shop API']);
  assert.equal(T.rows(DEP, v, 'shop-api'), null);
  // a «deploy» line from what is no artifact (deploy-ends' error) is no artifact deployed
  const bad = structuredClone(DEP); bad.edges.push(L('bad', 'Deployment', 'database', 'edge'));
  assert.deepEqual(T.rows(bad, v, 'edge'), ['routes.conf, by «deploy»']);
  assert.equal(layout(bad, 'production').byId.edge.aria, 'Node Edge proxy, 1 artifact deployed');
});

// ---- §10.3: validators, each with a passing and a failing case
const BREAKS = {
  'deploy-ends': m => { m.edges.push(L('bad', 'Deployment', 'edge', 'database')); return ['bad', 'edge', 'database']; },
  'deployed-twice': m => { m.edges.push(L('twice', 'Deployment', 'shop-api-jar', 'database')); return ['twice', 'shop-api-jar', 'jvm', 'database']; },
  'nest-kinds': m => { m.nodes.find(n => n.id === 'database').parent = 'shop-api'; return ['database', 'shop-api']; },
  'path-ends': m => { m.edges.push(L('bad', 'CommunicationPath', 'edge', 'shop-api-jar')); return ['bad', 'edge', 'shop-api-jar']; },
  'manifest-ends': m => { m.edges.push(L('bad', 'Manifestation', 'edge', 'shop-api')); return ['bad', 'edge']; },
};
test('validators: 06-deployment.json breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(DEP, DEP.views[0]), []);
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(DEP), ids = broke(m), got = T.validate(m, m.views[0]);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, rule === 'deployed-twice' ? 'warning' : 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  // nest-kinds: every usual pair passes, the unusual ones warn; a manifestation to a node warns (shared with the component type)
  const pair = (k, up) => T.validate(model([N('o', up, 'O'), N('i', k, 'I', 'o')], [])).map(p => `${p.level} ${p.rule}`);
  for (const [k, up] of [['ExecutionEnvironment', 'Node'], ['ExecutionEnvironment', 'Device'], ['ExecutionEnvironment', 'ExecutionEnvironment'], ['Device', 'Node'], ['Device', 'Device'], ['Node', 'Node']]) assert.deepEqual(pair(k, up), [], `${k} in ${up}`);
  for (const [k, up] of [['Node', 'Device'], ['Node', 'ExecutionEnvironment'], ['Device', 'ExecutionEnvironment']]) assert.deepEqual(pair(k, up), ['warning nest-kinds'], `${k} in ${up}`);
  assert.equal(T.validate(model([N('o', 'ExecutionEnvironment', 'O'), N('i', 'Node', 'I', 'o')], []))[0].message, 'nest-kinds: "I", a node, is in "O", an execution environment: an unusual pair');
  assert.equal(T.validate(model([N('a', 'Artifact', 'A'), N('n', 'Node', 'N', 'a')], []))[0].message, 'nest-kinds: "N", a node, is owned by "A", an artifact: its owner is a node, a device or an execution environment');
  assert.equal(T.validate(model([N('o', 'Node', 'O'), N('i', 'Device', 'I', 'o'), N('a', 'Artifact', 'a')], [L('x', 'Manifestation', 'a', 'o')]))[0].message, 'manifest-ends: x runs to node o ("O"): «manifest» is drawn to a component only');
  // an artifact nested and deployed by a line to its own target is said once, by neither rule; a path from a node to itself is not one
  const own = structuredClone(DEP); own.edges.push(L('again', 'Deployment', 'shop-api-jar', 'jvm')); assert.deepEqual(T.validate(own), []);
  const loop = structuredClone(DEP); loop.edges.push(L('loop', 'CommunicationPath', 'edge', 'edge')); assert.deepEqual(T.validate(loop).map(p => p.rule), ['path-ends']);
  // nor is one from a target to what it holds, at any depth (never drawn)
  for (const [a, b] of [['jvm', 'app-server'], ['app-server', 'jvm'], ['shopper-device', 'browser']]) { const m = structuredClone(DEP); m.edges.push(L('in', 'CommunicationPath', a, b));
    assert.deepEqual(T.validate(m).map(p => p.rule), ['path-ends'], `${a} to ${b}`); }
});

// ---- §12: editing
test('the Owner field, connect and remove: targets own artifacts and targets; a deployment or manifestation drawn backwards starts at the artifact; ends no path can join are refused; a target deleted says what it held', () => {
  const art = DEP.nodes.find(n => n.id === 'shop-api-jar'), targets = ['shopper-device', 'browser', 'edge', 'app-server', 'jvm', 'database', 'queue'];
  assert.deepEqual(T.owners(DEP, art).map(o => o.id), targets);
  assert.deepEqual(T.owners(DEP, DEP.nodes.find(n => n.id === 'jvm')).map(o => o.label), ['Shopper\'s device', 'Web browser', 'Edge proxy', 'Application server', 'Java 21 runtime', 'Database', 'Order queue']);
  assert.equal(T.owners(DEP, DEP.nodes.find(n => n.id === 'shop-api')), null); assert.equal(T.owners(DEP, DEP.edges[0]), null);
  const v = DEP.views[0], line = t => ({ type: 'uml.' + t });
  assert.deepEqual(T.edits.connect(DEP, v, 'database', 'edge-routes', null, line('Deployment')), [{ op: 'add', element: { id: 'deployment1', type: 'uml.Deployment', from: 'edge-routes', to: 'database' }, view: 'production' }]);
  assert.deepEqual(T.edits.connect(DEP, v, 'shop-api', 'shop-api-jar', null, line('Manifestation')), [{ op: 'add', element: { id: 'manifestation1', type: 'uml.Manifestation', from: 'shop-api-jar', to: 'shop-api' }, view: 'production' }]);
  assert.equal(T.edits.connect(DEP, v, 'edge-routes', 'database', null, line('Deployment')), null, 'from the artifact: the default');
  assert.equal(T.edits.connect(DEP, v, 'edge', 'database', null, line('CommunicationPath')), null);
  assert.equal(T.edits.connect(DEP, v, 'edge', 'shop-api', null, line('Dependency')), null);
  assert.match(T.edits.connect(DEP, v, 'edge', 'database', null, line('Deployment')).error, /^A deployment runs from an artifact/);
  assert.match(T.edits.connect(DEP, v, 'edge', 'shop-api-jar', null, line('CommunicationPath')).error, /^A communication path joins two/);
  assert.match(T.edits.connect(DEP, v, 'edge', 'edge', null, line('CommunicationPath')).error, /^A communication path joins two/, 'not to itself');
  // a line between a box and what it holds is never drawn (a line from a box to what it holds is left out): refused, either way, at any depth
  assert.deepEqual(T.edits.connect(DEP, v, 'jvm', 'shop-api-jar', null, line('Deployment')), { error: 'shop-api.jar is already deployed on Java 21 runtime by nesting' });
  assert.deepEqual(T.edits.connect(DEP, v, 'shop-api-jar', 'app-server', null, line('Deployment')), { error: 'shop-api.jar is already deployed on Application server by nesting' });
  assert.deepEqual(T.edits.connect(DEP, v, 'jvm', 'app-server', null, line('CommunicationPath')), { error: 'A communication path cannot join a node and what it holds' });
  assert.deepEqual(T.edits.connect(DEP, v, 'shopper-device', 'storefront-bundle', null, line('Dependency')), { error: 'A dependency cannot join a node and what it holds' });
  assert.deepEqual(validate(apply(DEP, T.edits.connect(DEP, v, 'database', 'edge-routes', null, line('Deployment')))), []);
  // Shift + Delete on a target that holds something: what goes is counted; on anything else, or Delete, the default
  assert.deepEqual(T.edits.remove(DEP, v, ['app-server'], true), { commands: [{ op: 'delete', id: 'app-server' }], say: 'Deleted device Application server and the 4 elements it held' });
  assert.equal(T.edits.remove(DEP, v, ['app-server'], false), null);
  assert.equal(T.edits.remove(DEP, v, ['database'], true), null);
  assert.equal(T.edits.remove(DEP, v, ['shop-api-jar'], true), null);
  assert.equal(T.edits.remove(DEP, v, ['app-server', 'shopper-device'], true).say, 'Deleted 2 targets and the 6 elements they held');
  const gone = apply(DEP, T.edits.remove(DEP, v, ['app-server'], true).commands);
  assert.deepEqual(['app-server', 'jvm', 'shop-api-jar', 'order-worker-jar', 'shop-api-config'].filter(id => gone.nodes.some(n => n.id === id)), [], 'what it owns goes with it');
  assert.ok(!gone.edges.some(e => ['api-jar-manifests-api', 'edge-to-app'].includes(e.id)), 'and the lines to them');
  assert.deepEqual(validate(gone), []);
  // a drop into a box and the Owner field emit reparent (stage 2's): the artifact is then deployed by nesting
  const moved = apply(DEP, [{ op: 'reparent', id: 'edge-routes', parent: 'edge' }]), g = layout(moved, 'production');
  assert.ok(g.families.some(f => f.id === 'edge' && f.nodeIds.includes('edge-routes')) && !g.edges.some(e => e.id === 'routes-on-edge'), 'the edge proxy is a box now; the line from it to what it holds is left out');
  assert.equal(g.byId['edge-routes'].aria, 'Artifact routes.conf, on Edge proxy');
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: N(`n${i}`, i % 2 ? 'Device' : 'Node', `Host ${i}`), view: 'production' }],
    [{ op: 'add', element: N(`a${i}`, 'Artifact', `job-${i}.jar`), view: 'production' }],
    [{ op: 'reparent', id: `a${i}`, parent: `n${i}` }],
    [{ op: 'add', element: L(`p${i}`, 'CommunicationPath', `n${i}`, 'database', 'TCP'), view: 'production' }],
    [[{ op: 'set', id: `p${i}`, path: 'label', value: `TLS ${i}` }], [{ op: 'add', element: L(`m${i}`, 'Manifestation', `a${i}`, 'shop-api'), view: 'production' }], [{ op: 'set', id: `n${i}`, path: 'props.stereotypes', value: ['cloud'] }]][i % 3],
    [[{ op: 'hide', id: `a${i}`, view: 'production' }], [{ op: 'delete', id: `n${i}` }], [{ op: 'set', id: `n${i}`, path: 'label', value: `Renamed ${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(DEP), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-'), draw = (m, o) => unid(mapContext(m, o).buildView('production').markup);
  let session; for (let i = 1; i <= 30; i++) session = draw(JSON.parse(seen[i]), { memos });
  assert.ok(memos.production.runs > 1);
  assert.equal(session, draw(reopened));
  assert.equal(describe(reopened, 'production'), describe(JSON.parse(seen[30]), 'production'));
});

// §14: 50 nodes and artifacts, 50 lines, boxes five deep: ten stacks of five targets, an artifact in each, paths between the
// stacks at each level, a few artifacts deployed by a line, and dependencies between artifacts
const STRESS = (() => {
  const kinds = ['Node', 'Device', 'ExecutionEnvironment', 'ExecutionEnvironment', 'ExecutionEnvironment'], nodes = [], edges = [];
  for (let s = 0; s < 5; s++) kinds.forEach((k, i) => { nodes.push(N(`s${s}t${i}`, k, `Stack ${s} level ${i}`, i ? `s${s}t${i - 1}` : null)); nodes.push(N(`s${s}a${i}`, 'Artifact', `service-${s}-${i}.jar`, `s${s}t${i}`)); });
  for (let s = 0; s < 4; s++) for (let i = 0; i < 5; i++) edges.push(L(`p${s}-${i}`, 'CommunicationPath', `s${s}t${i}`, `s${s + 1}t${i}`, i % 2 ? 'gRPC' : 'HTTPS with mutual TLS'));
  for (let s = 0; s < 5; s++) for (let i = 0; i < 4; i++) edges.push(L(`d${s}-${i}`, 'Dependency', `s${s}a${i + 1}`, `s${s}a${i}`));
  for (let s = 0; s < 5; s++) edges.push(L(`x${s}`, 'CommunicationPath', `s${s}t4`, `s${(s + 2) % 5}t0`, 'AMQP'), L(`y${s}`, 'Dependency', `s${s}a0`, `s${(s + 1) % 5}a4`));
  return model(nodes, edges);
})();
test('a cube box\'s faces, in its frame: no line runs inside a face, no line\'s last run on a box is shorter than 12 px, no label on a face\'s line; 06, six levels and the stress view, right and down', () => {
  for (const [name, m, v] of [['06', DEP, 'production'], ['six levels', DEEP, 'v'], ['stress', STRESS, 'v']]) for (const direction of ['right', 'down']) {
    const g = layout(withDir(m, direction), v); assert.ok(g.families.length > 0); assert.deepEqual(faceIssues(g), [], `${name} ${direction}`); }
});

test('P1 (§14): on 50 nodes and artifacts, 50 lines and boxes five deep, a full layout, a path\'s label, an artifact moved into another node and a stereotype (moving nothing), laid out and drawn under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of seven) (timed)', () => {
  assert.equal(STRESS.nodes.length, 50); assert.equal(STRESS.edges.length, 50); assert.deepEqual(validate(STRESS), []);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('v');
  draw(STRESS);
  const runs = [0, 1, 2, 3, 4, 5, 6].map(k => { const was = memos.v.runs, r = { full: timed(() => mapContext(STRESS).buildView('v')),
    label: timed(() => draw(apply(STRESS, [{ op: 'set', id: 'p1-2', path: 'label', value: `TCP ${'x'.repeat(4 + 3 * k)}` }]))),
    move: timed(() => draw(apply(STRESS, [{ op: 'reparent', id: 's0a4', parent: `s${1 + k % 4}t${k % 5}` }]))),
    stereo: timed(() => draw(apply(STRESS, [{ op: 'set', id: 's2a1', path: 'props.stereotypes', value: [`v${k}`] }]))) };
    assert.equal(memos.v.runs, was + 3, 'each edit lays the view out again'); return r; });
  const best = k => Math.min(...runs.map(r => r[k]));
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  // CI holds the 1 s ceiling and prints the edits against the 100 ms target (the maintainer's decision of 13 Nov 2026)
  assert.ok(best('label') < 1000, `a path's label ${best('label')} ms`); assert.ok(best('move') < 1000, `an artifact moved ${best('move')} ms`); assert.ok(best('stereo') < 1000, `a stereotype ${best('stereo')} ms`);
  console.log(`# P1 target 100 ms: a path's label ${best('label').toFixed(1)} ms, an artifact moved into another node ${best('move').toFixed(1)} ms, a stereotype ${best('stereo').toFixed(1)} ms; full layout ${best('full').toFixed(1)} ms; routes ${JSON.stringify(layout(STRESS, 'v').stats)}`);
});
