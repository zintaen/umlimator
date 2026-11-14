// Milestone 4a's fixtures (work package 4a.7, notes/milestone-4a.md §10, §11): tests/mindmap-minimal.json,
// tests/mindmap-stress.json, tests/cloud-minimal.json and tests/cloud-stress.json, with the three examples that moved to
// examples/ (bookshop-opening-plan, bookshop-gcp, bookshop-azure). Every view is laid out with no overlap and no text past
// its topic or card; a mindmap's branch curves, sampled every 4 px, run through no topic; a cloud view, right and down, routes
// every line, keeps each element in its group and each end on its outline, and what check() finds is pinned: the crossings
// that repair and reroute off leave (§11) and nothing else. Then §10.1's cases one by one, §11's budgets on the fixtures'
// views all (CPU, best of five after a warm-up, CI's 1 s held, the 100 ms target printed), DoD 1 (the registry, the JSON
// Schema and the types), the moved examples and the atlas's links, and §2.5: nothing this project publishes holds a vendor
// icon. AWS's views are drawn by the build's own registration (src/cloud/cloud.js, CLOUD_AWS on since 4a.8). The icons are
// synthetic data URLs the test builds: no vendor icon is committed or fetched (S18). tests/m4a.html draws every view in
// Chrome under three fonts and both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { textW } from '../src/core/text.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { mmProblems, mmRename, mmMoveTo, mmAdd, MM_TYPE } from '../src/mindmap/mindmap.js';
import { GCP_LEGAL } from '../src/cloud/cloud.js';
import { check as checkTarget, targets } from '../docs/diagrams/examples/check.mjs';

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const FIX = { 'mindmap-minimal': read('./mindmap-minimal.json'), 'mindmap-stress': read('./mindmap-stress.json'), 'cloud-minimal': read('./cloud-minimal.json'),
  'cloud-stress': read('./cloud-stress.json'), 'bookshop-opening-plan': read('../examples/bookshop-opening-plan.json'), 'bookshop-gcp': read('../examples/bookshop-gcp.json'),
  'bookshop-azure': read('../examples/bookshop-azure.json') };
const V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id);
const PACK = { gcp: 'gcp', azure: 'azure', aws: 'aws' };
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const quiet = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } finally { console.warn = keep; } };
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });

// synthetic icons (S18): a coloured square and a white circle, carrying the synthetic pack's marker; the table the CLI
// builds from a fetched pack (§4.5), every icon a model names but those `lacks` leaves out, Google's legal entry with its pack
const svg = body => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><!-- umlimator-synthetic-pack -->${body}</svg>`).toString('base64');
const SQ = svg('<rect width="16" height="16" fill="#3367d6"/>'), WH = svg('<circle cx="8" cy="8" r="7" fill="#fff"/>');
const WHITE = new Set(['Cloud-SQL', 'SQL-Database', 'Amazon-RDS']), LACKS = new Set(['Cloud-Search-Appliance']);
// a re-pin's alias (icons/packs.json's aliases): the model keeps the old id, the CLI's entry carries the pinned icon's name
const ALIAS = { 'Cloud-PubSub': 'Pub-Sub' };
const table = m => Object.fromEntries([['gcp/', { legal: GCP_LEGAL }], ...m.nodes.filter(n => n.props && n.props.icon && !LACKS.has(n.props.icon)).map(n => {
  const pack = n.type.split('.')[0], id = n.props.icon, pinned = ALIAS[id] || id;
  return [`${PACK[pack]}/${id}`, { src: WHITE.has(pinned) ? WH : SQ, dark: WHITE.has(pinned), name: pinned.replace(/-/g, ' ') }]; })]);
const withIcons = m => ({ ...structuredClone(m), icons: table(m) });

// a mindmap view's picture, as tests/mindmap.test.mjs reads it: topics apart, text inside, in the bounds, no curve through a topic
function mindmapBad(g) {
  const bad = [];
  g.nodes.forEach((n, i) => {
    if (!inside(n, { x: g.bounds.x - .5, y: g.bounds.y - .5, w: g.bounds.w + 1, h: g.bounds.h + 1 })) bad.push(`${n.id} out of the bounds`);
    g.nodes.slice(0, i).forEach(o => { if (meets(n, o)) bad.push(`${n.id} meets ${o.id}`); });
    const px = n.root ? 15 : 13, pad = n.root ? 14 : 10;
    if (n.lines.length > 4 || n.lines.some(l => textW(l, px) > 200.5) || n.tw + 2 * pad > n.w + .5) bad.push(`${n.id}'s text overflows`); });
  g.mm.links.forEach(l => { const [a, b] = l.p1, [c, e] = l.p2, x = (a + c) / 2, k = Math.max(2, Math.ceil((Math.abs(c - a) + Math.abs(e - b)) / 4));
    for (let i = 1; i < k; i++) { const t = i / k, u = 1 - t, X = u * u * u * a + 3 * u * u * t * x + 3 * u * t * t * x + t * t * t * c, Y = u * u * u * b + 3 * u * u * t * b + 3 * u * t * t * e + t * t * t * e;
      g.nodes.forEach(n => { if (X > n.x + .5 && X < n.x + n.w - .5 && Y > n.y + .5 && Y < n.y + n.h - .5) bad.push(`${l.from} to ${l.to} runs through ${n.id}`); }); } });
  return [...new Set(bad)];
}
// a cloud view's picture: no two cards meet, each in its group, each group in its own, every end on its card's or group's outline
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, , d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, a: v.slice(0, 2), b: v.slice(-2) }; });
const boxOff = (n, [x, y]) => { const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h); return dx || dy ? Math.hypot(dx, dy) : Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y); };
function cloudBad(m, vid, g) {
  const bad = [], fam = Object.fromEntries(g.families.map(f => [f.id, f]));
  g.nodes.forEach((p, i) => g.nodes.slice(0, i).forEach(q => { if (meets(p, q)) bad.push(`${p.id} meets ${q.id}`); }));
  g.families.forEach(f => { f.nodeIds.forEach(id => { if (!inside(g.byId[id], f)) bad.push(`${id} outside ${f.id}`); }); if (f.parent && !inside(f, fam[f.parent])) bad.push(`${f.id} outside ${f.parent}`); });
  ends(mapContext(m).buildView(vid).markup).forEach(({ from, to, a, b }) => [[from, a], [to, b]].forEach(([id, p]) => {
    const n = g.byId[id] || fam[id]; if (n && n.shape !== 'cloud-user' && boxOff(n, p) > 1) bad.push(`${from} to ${to} ends ${boxOff(n, p).toFixed(1)} px off ${id}`); }));
  return [...new Set(bad)];
}

// what each view keeps: [crossings, check()'s other findings, what the picture gets wrong, lines left unrouted]. A mindmap has
// one direction; a cloud view right and down. Every view is clean but for its crossings (repair and reroute off, §11),
// stated in docs/conformance/gcp.md and azure.md; the line between a group and what it holds, which cannot be drawn
// (line-inside, an error the JSON holds and connect refuses); and on the cloud stress view all laid out down, one path's
// label on another path (the 80 paths' crossings and that label are what repair and reroute off leave, decision 20)
const PINNED = {
  'mindmap-minimal': { v: [0, 0, 0, 0] },
  'mindmap-stress': { 'edge-cases': [0, 0, 0, 0], all: [0, 0, 0, 0] },
  'cloud-minimal': { gcp: { right: [0, 0, 0, 0], down: [0, 0, 0, 0] }, azure: { right: [0, 0, 0, 0], down: [0, 0, 0, 0] } },
  'cloud-stress': { 'edge-cases': { right: [0, 0, 0, 1], down: [0, 0, 0, 1] }, 'ec-no-product': { right: [0, 0, 0, 0], down: [0, 0, 0, 0] },
    'az-edge-cases': { right: [0, 0, 0, 0], down: [0, 0, 0, 0] }, 'aws-edge-cases': { right: [0, 0, 0, 0], down: [0, 0, 0, 0] }, all: { right: [52, 0, 0, 0], down: [54, 1, 0, 0] } },
  'bookshop-opening-plan': { 'mm-plan': [0, 0, 0, 0] },
  'bookshop-gcp': { 'gcp-on-gcp': { right: [1, 0, 0, 0], down: [1, 0, 0, 0] } },
  'bookshop-azure': { 'az-on-azure': { right: [1, 0, 0, 0], down: [3, 0, 0, 0] } },
};

test('every view of the four fixtures and the three examples (cloud views right and down, with a synthetic icons table): nothing meets, texts inside, no curve through a topic, each element in its group, ends on outlines; check()\'s findings only as pinned', () => {
  const counts = {}, other = [];
  const one = (m, vid) => {
    const [g, warned] = quiet(() => layout(m, vid)), mind = V(m, vid).diagram === 'mindmap';
    const found = quiet(() => check(m, vid))[0].map(p => p.message), bad = mind ? mindmapBad(g) : cloudBad(m, vid, g);
    other.push(...found.filter(p => !/ cross$/.test(p)).map(p => `${vid}: ${p}`), ...bad.map(p => `${vid}: ${p}`));
    return [found.filter(p => / cross$/.test(p)).length, found.filter(p => !/ cross$/.test(p)).length, bad.length, warned.filter(w => /not routed|cannot be drawn|no route/i.test(w)).length || (g.edges.length < (m.edges || []).filter(e => V(m, vid).nodeIds.includes(e.from) && V(m, vid).nodeIds.includes(e.to)).length ? 1 : 0)];
  };
  for (const [f, M] of Object.entries(FIX)) {
    const m = withIcons(M);
    for (const v of m.views) (counts[f] ||= {})[v.id] = v.diagram === 'mindmap' ? one(m, v.id) : { right: one(turned(m, v.id, 'right'), v.id), down: one(turned(m, v.id, 'down'), v.id) };
  }
  if (process.env.PIN) console.log(JSON.stringify(counts), other);
  assert.deepEqual(counts, PINNED);
  assert.deepEqual(other, ['all: view all: label "HTTPS" lies on edge Service 52→Service 5']);
});

test('the minimal fixtures: one topic; a gcp view of one project and one product, an azure view of one resource group and one service; no problem', () => {
  const mm = FIX['mindmap-minimal'], cl = FIX['cloud-minimal'];
  assert.deepEqual([validate(mm), mm.nodes.map(n => n.type)], [[], ['mindmap.Topic']]);
  assert.match(describe(mm, 'v'), /^One topic: a mindmap of 1 topic/);
  assert.deepEqual(validate(cl), []);
  assert.deepEqual(cl.views.map(v => [v.diagram, v.nodeIds.map(id => node(cl, id).type)]), [['gcp', ['gcp.Zone', 'gcp.Product']], ['azure', ['azure.Group', 'azure.Service']]]);
  assert.deepEqual(validate(withIcons(cl)), [], 'with the pack given, every icon in it');
});

test('mindmap-stress.json, edge-cases (§10.1): 30 children, every branch on one side, a 200-character topic in four lines, a hidden parent, two roots as two trees, a side on a second-level topic, a chain 70 deep, a topic whose parent is no topic; what the rules say', () => {
  const m = FIX['mindmap-stress'], g = layout(m, 'edge-cases');
  assert.equal(m.nodes.filter(n => n.parent === 'a').length, 30);
  assert.ok(g.nodes.filter(n => n.depth === 1).every(n => n.side === 'right'), 'every branch right');
  assert.equal(g.byId.a3.side, 'right', 'a side on a second-level topic is ignored');
  assert.equal(node(m, 'long').label.length, 200); assert.equal(g.byId.long.lines.length, 4);
  assert.equal(g.byId.orphan.parent, 'b', 'a topic whose parent is hidden hangs from its nearest shown ancestor');
  assert.equal(g.byId.d70.depth, 71);
  assert.deepEqual(g.nodes.filter(n => n.root).map(n => n.id), ['r', 'second', 'stray']);
  assert.deepEqual(mmProblems(m, V(m, 'edge-cases')).map(p => [p.level, p.rule, p.ids]), [['error', 'topic-parent', ['stray']], ['warning', 'mindmap-root', ['r', 'second']],
    ['warning', 'mindmap-root', ['r', 'stray']], ['warning', 'side-first', ['a3']], ['warning', 'mindmap-depth', ['d64']]]);
  assert.deepEqual(mmProblems(m, V(m, 'all')).map(p => p.rule), ['topic-parent'], 'the stress view all breaks no rule of its own (topic-parent is the model\'s: edge-cases\' stray topic)');
  assert.match(describe(m, 'edge-cases'), /^Edge cases: a mindmap of 109 topics in 3 trees\./);
});

test('cloud-stress.json, edge-cases (§10.1): five levels of groups, an icon the pack lacks, an alias a re-pin moved, a view with no table, a line from a group to a node in a sibling group, one between a group and its content (an error, refused by connect), a white icon on its dark tile, a coloured one on the light, Google\'s legal line with a Google icon and none without; what the rules say', () => {
  const M = FIX['cloud-stress'], m = withIcons(M), T = diagramOf({ diagram: 'gcp' }), g = layout(m, 'edge-cases'), { markup } = mapContext(m).buildView('edge-cases');
  // five levels: project, region, network, subnetwork, zone
  const depth = id => { let k = 0; for (let f = g.families.find(x => x.id === id); f && f.parent; f = g.families.find(x => x.id === f.parent)) k++; return k; };
  assert.equal(depth('ec-zone-a'), 4);
  // the rules: a wrong kind, a subnetwork outside a network, a product with no icon, the pack lacking one, a line inside
  const said = validate(m).filter(p => p.ids?.some(id => V(M, 'edge-cases').nodeIds.includes(id) || id.startsWith('ec-'))).map(p => [p.level, p.rule, p.ids]);
  assert.deepEqual(said, [['warning', 'icon-missing', ['ec-lacks']], ['warning', 'icon-set', ['ec-plain']], ['error', 'group-kind', ['ec-odd']],
    ['warning', 'group-nesting', ['ec-loose', 'ec-project']], ['error', 'line-inside', ['ec-inside', 'ec-zone-a', 'ec-api']]]);
  assert.deepEqual(T.edits.connect(m, V(m, 'edge-cases'), 'ec-zone-a', 'ec-api'), { error: 'A line cannot join the zone and what it holds' });
  assert.equal(g.edges.find(e => e.id === 'ec-inside'), undefined, 'the line inside is not drawn');
  // the icon the pack lacks: its glyph and the name derived from its id; the alias: the pinned icon's name
  assert.equal(g.byId['ec-lacks'].aria, 'Product Search index, Cloud Search Appliance, icon not available');
  assert.equal(g.byId['ec-alias'].name, 'Pub Sub');
  // a line from a group ends on its border, to a node in a sibling group
  const e = ends(markup).find(x => x.from === 'ec-sub-a'), sub = g.families.find(f => f.id === 'ec-sub-a');
  assert.ok(e && e.to === 'ec-lacks' && boxOff(sub, e.a) <= 1, 'from the apps subnet\'s border');
  // a white icon on the dark tile, a coloured one on the light; the legal line under the picture
  assert.match(markup, /class="n-logo dark"\/><image class="cl-icon" href="data:image\/svg\+xml;base64,/);
  assert.match(markup, /class="n-logo"\/><image class="cl-icon"/);
  assert.equal(g.legal.text, GCP_LEGAL); assert.ok(g.legend.at(-1).includes(GCP_LEGAL));
  // a gcp view with no product draws no Google icon, so no legal line, the pack given or not
  const none = layout(m, 'ec-no-product');
  assert.ok(!none.legal && !describe(m, 'ec-no-product').includes(GCP_LEGAL));
  // the view with no table (offline): glyphs and full names, no legal line, no icon-missing
  const bare = layout(M, 'edge-cases');
  assert.ok(!bare.legal && bare.nodes.filter(n => n.type === 'gcp.Product' && node(M, n.id).props?.icon).every(n => / icon not available$/.test(n.aria)));
  assert.ok(!validate(M).some(p => p.rule === 'icon-missing'), 'no pack given: nothing to miss');
  assert.ok(!/<image/.test(mapContext(M).buildView('edge-cases').markup));
});

test('cloud-stress.json, Azure\'s and AWS\'s edge cases: Azure five levels deep, a generic group, a subnet in a resource group; AWS seven, a security group in a private subnet, a line from a subnet to a NAT gateway in its sibling and from the VPC to a service it does not hold', () => {
  const m = withIcons(FIX['cloud-stress']), az = layout(m, 'az-edge-cases'), aws = layout(m, 'aws-edge-cases');
  const chain = (g, id) => { const out = []; for (let f = g.families.find(x => x.id === id); f; f = g.families.find(x => x.id === f.parent)) out.push(f.id); return out; };
  assert.deepEqual(chain(az, 'az-snet'), ['az-snet', 'az-vnet', 'az-region', 'az-rg', 'az-sub']);
  assert.deepEqual(chain(aws, 'aws-sg'), ['aws-sg', 'aws-private', 'aws-az', 'aws-vpc', 'aws-region', 'aws-account', 'aws-cloud']);
  assert.equal(az.families.find(f => f.id === 'az-shared').title, 'Shared [Group]');
  const said = validate(m).filter(p => p.ids?.some(id => /^(az|aws)-/.test(id))).map(p => [p.level, p.rule, p.ids]);
  assert.deepEqual(said, [['warning', 'group-nesting', ['az-stray', 'az-rg']]]);
  for (const id of ['aws-c2', 'aws-c3', 'az-c3']) assert.ok([...az.edges, ...aws.edges].some(e => e.id === id), `${id} drawn, from a group`);
  assert.match(mapContext(m).buildView('aws-edge-cases').markup, /class="n-logo dark"/, 'Amazon RDS white, on its dark tile');
});

test('the stress views all are §11\'s P1 sizes: 300 topics in eight levels and six first-level branches; 60 products in five levels of groups and 80 paths', () => {
  const mm = FIX['mindmap-stress'], g = layout(mm, 'all');
  assert.deepEqual([g.nodes.length, Math.max(...g.nodes.map(n => n.depth)) + 1, g.nodes.filter(n => n.depth === 1).length], [300, 8, 6]);
  const cl = FIX['cloud-stress'], on = new Set(V(cl, 'all').nodeIds), c = layout(cl, 'all');
  assert.deepEqual([cl.nodes.filter(n => on.has(n.id) && n.type === 'gcp.Product').length, cl.edges.filter(e => on.has(e.from) && on.has(e.to)).length, Math.max(...c.families.map(f => {
    let k = 1; for (let x = f; x.parent; x = c.families.find(y => y.id === x.parent)) k++; return k; }))], [60, 80, 5]);
});

// §11: each stress view's full layout and SVG, and its common edits, under CI's 1 s, the 100 ms target printed
test('§11\'s budgets on the fixtures\' views all: a full layout and its SVG, and the common edits (a topic renamed, added, moved to the other side, promoted; a product renamed, its icon changed, moved into another group, a path added), each under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of five after a warm-up) (timed)', () => {
  const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const MM = FIX['mindmap-stress'], CL = withIcons(FIX['cloud-stress']), cmds = r => (r && Array.isArray(r.commands) ? r.commands : r);
  const side = (m, id) => layout(m, 'all').byId[id].side === 'right' ? -1 : 1;
  const cases = {
    mindmap: [MM, { 'a topic renamed': cmds(mmRename(MM, 'all', 't77', 'renamed')), 'a topic added': cmds(mmAdd(MM, 'all', MM_TYPE.elements[0], 'New topic', { sel: ['t9'] })),
      'a topic moved to the other side': cmds(mmMoveTo(MM, 'all', 't3', { by: [side(MM, 't3'), 0] })), 'a topic promoted': cmds(mmMoveTo(MM, 'all', 't20', { by: [side(MM, 't20'), 0] })) }],
    cloud: [CL, { 'a product renamed': [{ op: 'set', id: 's7', path: 'label', value: 'Renamed service' }], 'its icon changed': [{ op: 'set', id: 's8', path: 'props.icon', value: 'Cloud-SQL' }],
      'moved into another group': [{ op: 'reparent', id: 's20', parent: 'r1s0z0' }], 'a path added': [{ op: 'add', element: { id: 'new-path', type: 'gcp.Path', from: 's2', to: 's31' }, view: 'all' }] }] };
  const out = [];
  for (const [k, [M, edits]] of Object.entries(cases)) {
    const memos = {}, draw = (m, mm) => mapContext(m, { memos: mm }).buildView('all').markup;
    draw(M, memos); Object.values(edits).forEach(c => { draw(apply(M, c), memos); draw(M, memos); }); // the warm-up
    const best = { 'full layout and SVG': Math.min(...[0, 1, 2, 3, 4].map(() => cpu(() => draw(M, {})))) };
    for (const [name, c] of Object.entries(edits)) { const m = apply(M, c), t = []; for (let i = 0; i < 5; i++) { draw(M, memos); t.push(cpu(() => draw(m, memos))); } best[name] = Math.min(...t); }
    for (const [name, ms] of Object.entries(best)) assert.ok(ms < 1000, `${k}: ${name} ${ms} ms`);
    out.push(`${k}: ` + Object.entries(best).map(([n, ms]) => `${n} ${ms.toFixed(1)} ms`).join(', '));
  }
  console.log('# P1 (milestone 4a\'s fixtures, target 100 ms, CI ceiling 1 s): ' + out.join('; '));
});

test('the PDF\'s tables (DoD 7): a topic\'s word, depth and parent; a product\'s word, full name, icon id and group', () => {
  const rows = (m, vid) => { const ctx = mapContext(m); return JSON.stringify(tablesOf(ctx, ctx.V[vid], ctx.buildGeo(vid))); };
  const mm = rows(FIX['bookshop-opening-plan'], 'mm-plan');
  for (const w of ['<td>Topic</td>', 'Depth 2', 'Under Website']) assert.ok(mm.includes(w), w);
  const gcp = rows(withIcons(FIX['bookshop-gcp']), 'gcp-on-gcp');
  for (const w of ['Product', 'Cloud Run', 'icon Cloud-Run', 'in europe-west1 [Region]']) assert.ok(gcp.includes(w), w);
  const az = rows(FIX['bookshop-azure'], 'az-on-azure');
  for (const w of ['Service', 'App Services', 'icon App-Services', 'in snet-apps [Subnet]']) assert.ok(az.includes(w), w);
});

test('the examples moved (§10.2): check.mjs\'s MOVED, clean, as the targets were; their iconPacks the pins\' labels; the atlas\'s Hosting topics open the cloud views; AWS\'s moved by 4a.8', () => {
  const packs = read('../icons/packs.json');
  for (const [f, to, type] of [['25-mindmap.json', 'bookshop-opening-plan', 'mindmap'], ['27-gcp.json', 'bookshop-gcp', 'gcp'], ['28-azure.json', 'bookshop-azure', 'azure']]) {
    const [, url] = targets().find(([x]) => x === f);
    assert.ok(url.href.endsWith(`/examples/${to}.json`), f);
    assert.deepEqual(checkTarget(FIX[to], type), [], to);
    assert.deepEqual(validate(FIX[to]), [], to);
  }
  assert.deepEqual([FIX['bookshop-gcp'].iconPacks, FIX['bookshop-azure'].iconPacks], [{ gcp: packs.gcp.label }, { azure: packs.azure.label }]);
  assert.ok(targets().find(([x]) => x === '26-aws.json')[1].href.endsWith('/examples/bookshop-aws.json'), 'AWS moved (4a.8)');
  assert.equal(FIX['bookshop-opening-plan'].nodes.filter(n => n.opensView).length, 0, 'the standalone file opens nothing');
  const atlas = read('../examples/bookshop-atlas.json');
  assert.deepEqual(['mm-on-gcp', 'mm-on-azure', 'mm-on-aws'].map(id => atlas.nodes.find(n => n.id === id).opensView), ['gcp-on-gcp', 'az-on-azure', 'aws-on-aws']);
  assert.deepEqual(atlas.iconPacks, { gcp: packs.gcp.label, azure: packs.azure.label, aws: packs.aws.label });
});

test('DoD 1: the registry holds mindmap, gcp, azure and aws, and the JSON Schema, the types and the README name their vocabulary and iconPacks', () => {
  const schema = readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'), dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  const S = JSON.parse(schema), np = S.$defs.node.properties.props.anyOf[0].properties;
  for (const d of ['mindmap', 'gcp', 'azure', 'aws']) {
    const T = diagramOf({ diagram: d });
    assert.ok(T && S.$defs.view.properties.diagram.examples.includes(d) && dts.includes(`\`${d}\``), d);
    for (const t of [...T.elements, ...(T.lines || [])].map(x => x.type)) assert.ok(schema.includes(`"${t}"`) && dts.includes(`'${t}'`), t);
    for (const [t, fields] of Object.entries(T.props || {})) for (const f of fields) assert.ok(np[f.key.split('.').at(-1)], `${t}'s ${f.key} in the schema`);
  }
  assert.ok(S.properties.iconPacks && /iconPacks\?: Record<string, string>/.test(dts));
  assert.ok(['MindmapElementType', 'GcpElementType', 'GcpLineType', 'AzureElementType', 'AzureLineType', 'AwsElementType', 'AwsLineType', 'CloudElementProps'].every(k => new RegExp(`export (type|interface) ${k} `).test(dts)));
  const all = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('\n').find(l => l.includes("from 'umlimator/all'` draws diagram types"));
  assert.ok(['mindmap', 'Google Cloud', 'Azure', 'AWS'].every(w => all.includes(w)), 'README\'s umlimator/all line names the 0.26.0 types');
  const model = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('\n').find(l => l.includes('`"gcp"`'));
  assert.ok(['`"gcp"`', '`"azure"`', '`"aws"`'].every(w => model.includes(w)), 'README\'s Model section lists every 0.26.0 diagram value (audit 2)');
});

// §2.5 (S18): nothing this project publishes holds a vendor icon. Map logos are data URLs in committed pages today, so
// the test looks for pack content: an icons key with a / (<pack>/<id>), the synthetic pack's marker, or an SVG in icons/
// that the manifest does not list
test('nothing published holds a vendor icon (§2.5): no committed file under examples/ or docs/ holds a pack\'s icons entry or the synthetic pack\'s marker, and icons/ holds only the manifest\'s SVGs', () => {
  const root = new URL('../', import.meta.url), files = [];
  const walk = dir => { for (const f of readdirSync(new URL(dir, root))) { const p = dir + f; if (statSync(new URL(p, root)).isDirectory()) walk(p + '/'); else files.push(p); } };
  walk('examples/'); walk('docs/');
  const MARK = 'umlimator-synthetic' + '-pack', bad = [];
  for (const f of files.filter(f => /\.(json|html|svg|md|js|mjs)$/.test(f))) {
    const s = readFileSync(new URL(f, root), 'utf8');
    if (s.includes(MARK)) bad.push(`${f}: the synthetic pack's marker`);
    // an icons table's pack key, "gcp/Cloud-Run": { … }, or the legal entry "gcp/": in a model or a page's embedded model
    if (/"(gcp|azure|aws)\/[^"]*"\s*:\s*\{/.test(s)) bad.push(`${f}: a pack's icons entry`);
  }
  assert.deepEqual(bad, []);
  const manifest = read('../icons/manifest.json'), listed = new Set(Object.values(manifest).flatMap(e => (e && typeof e === 'object' && e.source === 'lucide' ? [e.file, ...Object.values(e).filter(x => typeof x === 'string')] : [])));
  const svgs = readdirSync(new URL('../icons/', import.meta.url)).filter(f => f.endsWith('.svg'));
  assert.deepEqual(svgs.filter(f => ![...listed].some(x => x === f || x.endsWith('/' + f) || x === f.replace(/\.svg$/, ''))), [], 'an SVG in icons/ not in the manifest\'s Lucide rows (§2.5)');
});
