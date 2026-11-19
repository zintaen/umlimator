// The bike share model, examples/bike-share.json: the one test and bench model, built by tools/bike-share.mjs from its
// part files in tools/bike-share/. The committed model is what the build writes, byte for byte, and so is each part
// file, so neither can drift from the other. The build stops on an id used twice, an unknown key, a view whose id is a
// card's (but trips, fleet and the shop's api), a new view id starting with "f", and a new view that lists accounts, flags or payments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, files, format, KEYS, INNER } from '../tools/bike-share.mjs';
import { validate, rules } from '../lib/umlimator-all.js';
import { execFileSync } from 'node:child_process';
import '../src/map/typed.js';
import '../src/typed/layout.js';
import '../src/typed/draw.js';
import '../src/uml/class.js';
import '../src/uml/object.js';
import '../src/uml/package.js';
import { sqRemove } from '../src/uml/sequence.js';
import '../src/uml/communication.js';
import '../src/uml/usecase.js';
import '../src/uml/activity.js';
import '../src/uml/state.js';
import '../src/uml/overview.js';
import '../src/uml/component.js';
import '../src/uml/deployment.js';
import '../src/uml/composite.js';
import '../src/uml/profile.js';
import '../src/uml/timing.js';
import '../src/er/er.js';
import '../src/flowchart/flowchart.js';
import '../src/dfd/dfd.js';
import '../src/uml/information.js';
import '../src/c4/c4.js';
import '../src/c4/views.js';
import '../src/mindmap/mindmap.js';
import '../src/cloud/cloud.js';
import '../src/bpmn/process.js';
import '../src/sysml/requirement.js';
import '../src/sysml/blocks.js';
import '../src/sysml/internal.js';
import '../src/sysml/parametric.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate as validateAll } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { svgOf } from '../src/draw/svg.js';
import { apply } from '../src/core/apply.js';
import { diagramOf } from '../src/core/registry.js';
import { appliedOf } from '../src/uml/stereotypes.js';
import { elementCount } from '../src/canvas/pieces.js';
import { layout as layoutAll } from '../lib/umlimator-all.js';

const read = name => JSON.parse(readFileSync(new URL(`../tools/bike-share/${name}.json`, import.meta.url), 'utf8'));

test('examples/bike-share.json is what tools/bike-share.mjs builds from its part files, byte for byte, and so is each part file', () => {
  const all = files();
  assert.deepEqual(all.filter(f => f.now !== f.text).map(f => f.path), [], 'run node tools/bike-share.mjs');
  assert.equal(all[0].now, build().text);
  assert.deepEqual(all.map(f => f.path).slice(0, 2), ['examples/bike-share.json', 'tools/bike-share/model.json']);
});

test('the built model validates and keeps its rules; the fleet card is battery-service, and no card is named battery', () => {
  const { model } = build();
  assert.deepEqual(validate(model), []);
  assert.deepEqual(rules(model), []);
  assert.deepEqual(model.views.slice(0, 5).map(v => v.id), ['context', 'system', 'trips', 'fleet', 'ride-end']);
  assert.ok(model.nodes.some(n => n.id === 'battery-service' && n.label === 'Battery monitor'));
  // the id battery is the e-bike's SysML block (step 3), never a map card
  assert.deepEqual(model.nodes.filter(n => n.id === 'battery').map(n => n.type), ['sysml.Block'], 'the id battery is the e-bike block\'s');
});

test('the key order of every object of a known kind comes from the build, not from how a part file is written', () => {
  const { model } = build();
  // reverses the keys of each object of a known kind, every level down; a map (layout, props, nodeOverrides' ids) keeps its order
  const shuffle = (x, kind) => Array.isArray(x) ? x.map(y => shuffle(y, kind))
    : !x || typeof x !== 'object' ? x
    : kind === 'overrides' ? Object.fromEntries(Object.entries(x).map(([id, o]) => [id, shuffle(o, 'node')]))
    : KEYS[kind] ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, INNER[kind]?.[k] ? shuffle(v, INNER[kind][k]) : v])) : x;
  const shuffled = shuffle(model, 'file');
  assert.notDeepEqual(Object.keys(shuffled.nodes[0]), Object.keys(model.nodes[0]));
  assert.equal(format(shuffled), build().text);
  const props = format({ nodes: [{ props: { b: 1, a: 2 }, id: 'x' }] });
  assert.match(props, /"id": "x", "props": \{ "b": 1, "a": 2 \}/, 'a props map keeps its order');
  assert.throws(() => format({ ...model, nodes: [{ id: 'x', colour: 'red' }] }), /the model\.nodes\[x\] has colour, which KEYS\.node does not place/);
});

test('the build stops on what would break a pin without an error', () => {
  const load = (change, part = 'fleet') => name => { const x = read(name); if (name === part) change(x); return x; };
  const stops = (change, msg, part) => assert.throws(() => build(load(change, part)), msg);
  stops(x => x.nodes.push({ id: 'trips', label: 'Again' }), /trips is a card in system and a card in fleet/);
  stops(x => x.edges.push({ id: 's1', from: 'fleet', to: 'trips' }), /s1 is a line in system and a line in fleet/);
  stops(x => x.views.push({ id: 'ops', title: 'Ops', nodeIds: ['ops'] }), /view ops in fleet has a card's id; only trips, fleet and api may/);
  stops(x => { x.nodes.find(n => n.id === 'ops').opensView = 'ops'; x.views.push({ id: 'ops', title: 'Ops', nodeIds: ['ops'] }); },
    /view ops in context has a card's id; only trips, fleet and api may/, 'context'); // a card that opens it is no way out: trace still refuses the id
  stops(x => x.views.push({ id: 'gateway', title: 'G', nodeIds: [] }, { id: 'feed', title: 'Feed', nodes: [{ id: 'gateway', label: 'Gateway' }] }),
    /view gateway in fleet has a card's id/); // a view's own card counts
  stops(x => x.views.push({ id: 'dock', title: 'D', nodes: [{ id: 'gw', label: 'Gateway', colour: 'red' }] }), /part fleet\.views\[dock\]\.nodes\[gw\] has colour/);
  stops(x => x.views.push({ id: 'shop', title: 'Shop', nodeIds: ['riders', 'payments', 'accounts'] }), /view shop in fleet lists payments, accounts, which diff's views == \["system"\] pin/);
  stops(x => x.views.push({ id: 'flow', title: 'Flow', nodeIds: ['ops'] }), /view flow in fleet starts with "f"/);
  stops(x => x.views.push({ id: 'trips', title: 'Again', nodeIds: ['ops'] }), /view trips is in two parts/);
  stops(x => x.views.push({ id: 'boxes', title: 'Boxes', nodeIds: ['ops'], containers: [{ id: 'fleet-db', nodeIds: ['ops'] }] }), /box fleet-db of view boxes in fleet has a card's id/);
  stops(x => x.views.push({ id: 'bx', title: 'B', nodeIds: [], containers: [{ id: 'b1', nodeIds: [] }, { id: 'b1', nodeIds: [] }] }), /box b1 is in view bx twice \(fleet\)/);
  stops(x => { x.nodes[0].members = [{ id: 'm1' }, { id: 'm1' }]; }, /m1 is a member of .* and a member of/);
  stops(x => x.views.push({ id: 'vv', title: 'V', nodeIds: [], edges: [{ id: 's1', from: 'a', to: 'b' }] }), /s1 is a line in system and a line of view vv in fleet/);
  stops(x => x.views.push({ id: 'vv', title: 'V', nodeIds: [], containers: [{ id: 's1', nodeIds: [] }] }), /box s1 of view vv in fleet is a line in system too/);
  stops(x => { x.nodes[0].colour = 'red'; }, /part fleet\.nodes\[.*\] has colour, which KEYS\.node does not place/);
  stops(x => { x.extra = 1; }, /part fleet has extra/);
  const head = change => name => { const x = read(name); if (name === 'model') change(x); return x; };
  assert.throws(() => build(head(x => { x.nodes = []; })), /holds nodes: they belong in a part file/);
  assert.throws(() => build(head(x => { x.parts = []; })), /names no parts/);
});

// ---- the typed views (step 3 of the one-model plan): what tests/atlas.test.mjs and tests/ebike-atlas.test.mjs (gone in step 4) read of the
// Bookshop and e-bike atlases, read of the bike share, which holds a view of each of the 28 types
const M = JSON.parse(readFileSync(new URL('../examples/bike-share.json', import.meta.url), 'utf8'));
const MAPS = ['context', 'system', 'trips', 'fleet', 'ride-end', 'overview', 'api', 'checkout', 'dock-feed', 'demand', 'help'];
const view = id => M.views.find(v => v.id === id);

test('the bike share holds a view of each of the 28 types: the 14 UML diagrams and information flow, SysML\'s four, C4 (five of its levels), ER, data flow, flowchart, BPMN, the mindmap and the three clouds', () => {
  assert.deepEqual(M.views.filter(v => !v.diagram).map(v => v.id), MAPS);
  assert.deepEqual([...new Set(M.views.map(v => v.diagram).filter(Boolean))].sort(), ['aws', 'azure', 'bpmn', 'c4.component', 'c4.container', 'c4.context',
    'c4.deployment', 'c4.dynamic', 'dfd', 'er', 'flowchart', 'gcp', 'mindmap', 'sysml.block-definition', 'sysml.internal-block', 'sysml.parametric',
    'sysml.requirement', 'uml.activity', 'uml.class', 'uml.communication', 'uml.component', 'uml.composite-structure', 'uml.deployment',
    'uml.information-flow', 'uml.interaction-overview', 'uml.object', 'uml.package', 'uml.profile', 'uml.sequence', 'uml.state-machine', 'uml.timing',
    'uml.use-case']);
  for (const v of M.views.filter(v => v.diagram)) assert.ok(diagramOf(v)?.name === v.diagram, `${v.id}: ${v.diagram} is registered`);
  // the label of each pack the cloud views' icons were chosen from, as icons/packs.json pins it
  const packs = JSON.parse(readFileSync(new URL('../icons/packs.json', import.meta.url), 'utf8'));
  assert.deepEqual(M.iconPacks, { gcp: packs.gcp.label, azure: packs.azure.label, aws: packs.aws.label });
  const ids = [...M.nodes, ...M.edges, ...M.views.flatMap(v => [...(v.edges || []).filter(e => typeof e === 'object'), ...(v.fragments || [])])]
    .flatMap(x => [x, ...(x.members || [])]).map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'every element id once');
  // no typed view draws the planned card charging: timelapse removes it, and every other picture stays
  assert.ok(!M.views.some(v => v.diagram && (v.nodeIds || []).includes('charging')));
});

test('the model validates clean through every type\'s rules; the four problems the Bookshop atlas raised come back when their lines and types do', () => {
  assert.deepEqual(validateAll(M), []);
  for (const v of M.views.filter(v => v.diagram)) assert.deepEqual(diagramOf(v).validate(M, v), [], v.id);
  // the class type's rules run on the whole model: a generalization between two actors or two use cases is not one between
  // classifiers to them; a part typed by a class the model lacks warns. The components view's interface realizations from a
  // component and from a port pass the class rule as the component view's (audit 49)
  const back = structuredClone(M);
  assert.deepEqual(['api-provides-rides', 'accounts-provides-sign-in'].map(id => (M.edges.find(e => e.id === id) || {}).type), ['uml.InterfaceRealization', 'uml.InterfaceRealization']);
  back.edges.push({ id: 'member-is-rider', type: 'uml.Generalization', from: 'member', to: 'rider-actor' },
    { id: 'card-is-pay', type: 'uml.Generalization', from: 'pay-by-card', to: 'pay' });
  back.nodes = back.nodes.filter(n => !['ride-repository', 'ride-listener'].includes(n.id));
  assert.deepEqual(validateAll(back).map(p => [p.level, p.rule, p.ids]), [
    ['error', 'generalization-kinds', ['member-is-rider', 'member', 'rider-actor']],
    ['error', 'generalization-kinds', ['card-is-pay', 'pay-by-card', 'pay']],
    ['warning', 'part-type', ['ride-service.rides', 'ride-service']], ['warning', 'part-type', ['ride-service.listeners', 'ride-service']]]);
  // one state machine's initial pseudostate at the model's top: the bike's life is drawn inside its E-bike state
  const two = structuredClone(M); two.nodes.find(n => n.id === 'bl-new').parent = undefined;
  assert.deepEqual(validateAll(two).map(p => p.rule), ['initial-one']);
});

test('every view lays out; check() finds only the crossings of the typed views the Bookshop and e-bike files kept, and none on a map view', () => {
  const found = [];
  for (const v of M.views) {
    const g = layout(M, v.id);
    assert.ok(g.nodes.length > 0 && g.edges.every(e => e.pts.length >= 2), v.id);
    found.push(...check(M, v.id).map(p => p.message));
  }
  assert.ok(found.every(p => / cross$/.test(p)), found.join('\n'));
  assert.deepEqual(found.map(p => p.split(':')[0]), PINNED_CROSS);
});
// rebalance's 2 and the C4, data flow, cloud and BPMN views' as their Bookshop files' (repair-process 5, 4 in the Bookshop's,
// and hire-overview 1, none in the Bookshop's: the bike share's labels are other widths); counted in Node, where the CI loop's
// browser count may differ by a crossing or two (its ceiling is in .github/workflows/check.yml). Step 4's review took the
// worker's line to the database out of the C4 views, as out of bike-share.dsl: c4-containers kept 1 of its 3, and
// c4-end-ride's 2 and c4-deployment's 1 went with it
const PINNED_CROSS = ['view hire-overview', ...Array(2).fill('view rebalance'), 'view c4-containers', ...Array(2).fill('view c4-components'), 'view dfd-0', ...Array(5).fill('view repair-process'), 'view on-gcp', ...Array(2).fill('view on-azure'),
  ...Array(2).fill('view on-aws')];

test('every drill-down opens a view of the model; from the map, the C4 context, the mindmap and the rider shop a reader reaches every view', () => {
  const ctx = mapContext(M), opens = [];
  for (const v of M.views) for (const n of v.nodeIds || []) { const o = ctx.opensOf(n, v.id); if (o) opens.push([v.id, n, o]); }
  opens.forEach(([v, n, o]) => assert.ok(ctx.V[o], `${n} in ${v} opens ${o}, no view of the model`));
  // the map's cards that open a typed view (a cross-type link, which opens and never unfolds in place)
  assert.deepEqual(opens.filter(([v, , o]) => ['trips', 'fleet'].includes(v) && ctx.V[o].diagram).map(x => x.join(' ')), ['trips trip-api unlock-sequence', 'trips lifecycle trip-internals',
    'trips fare domain', 'fleet battery-service blocks', 'fleet planner rebalance']);
  const across = opens.filter(([v, , o]) => ctx.V[o].diagram !== ctx.V[v].diagram);
  assert.ok(across.length > 20); across.forEach(([v, n]) => assert.equal(ctx.unfoldable(n, v), null, `${n} in ${v}`));
  // one of the same kind may: Swap battery, a call behavior action, unfolds into its activity
  assert.equal(ctx.unfoldable('call-swap', 'rebalance'), 'swap-battery');
  // a node opens a view by its opensView, or by being that view's id: only the rider shop's api, as in bookshop.json (the map's trips and fleet name theirs)
  assert.deepEqual([...new Set(opens.filter(([, n]) => M.nodes.find(x => x.id === n).opensView == null).map(([, n, o]) => `${n}>${o}`))], ['api>api']);
  const next = new Map(M.views.map(v => [v.id, new Set([...opens.filter(x => x[0] === v.id).map(x => x[2]), ...M.views.filter(w => w.parent === v.id).map(w => w.id)])]));
  const reach = from => { const seen = new Set([from]); for (const v of seen) next.get(v).forEach(w => seen.add(w)); return seen; };
  assert.equal(M.root, 'context');
  assert.deepEqual([...reach('new-city')].sort(), ['new-city', 'on-aws', 'on-azure', 'on-gcp']);
  assert.deepEqual([...reach('overview')].sort(), ['api', 'checkout', 'overview']);
  assert.deepEqual([...new Set([...reach('context'), ...reach('c4-context'), ...reach('new-city'), ...reach('overview')])].sort(), M.views.map(v => v.id).sort());
  assert.ok(!opens.some(([, , o]) => ['new-city', 'c4-context', 'context'].includes(o)), 'nothing opens a root view: each is in the views list');
  // the typed views hang off three of those roots, the map, the C4 context and the mindmap, and the examples' README says so,
  // not that every one is joined to the map (audit 48)
  const typedRoots = ['context', 'c4-context', 'new-city', 'overview'].filter(r => [...reach(r)].some(v => M.views.find(x => x.id === v).diagram));
  assert.deepEqual(typedRoots, ['context', 'c4-context', 'new-city']);
  const row = readFileSync(new URL('../examples/README.md', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('| [`bike-share.json`]'));
  assert.match(row, /28 diagram types, reached by drill-down from the map, the C4 system context or the new city's mindmap, each a root in the views list \|$/);
  const step = (a, b) => assert.ok(next.get(a).has(b), `${a} opens ${b}`);
  // the journeys: a ride's fare to the classes to a ride's state machine; a bike's object to its state machine; the fleet to
  // the e-bike's blocks to inside the e-bike; the requirements to the range analysis; the fleet's planner to rebalancing (the
  // only way in to rebalance, swap-battery and dock-latch) to swapping a battery
  step('trips', 'domain'); step('domain', 'ride-life'); step('domain', 'ride-snapshot'); step('ride-snapshot', 'bike-life');
  step('fleet', 'blocks'); step('blocks', 'inside-ebike'); step('requirements', 'range-analysis'); step('requirements', 'blocks');
  step('fleet', 'rebalance'); step('rebalance', 'swap-battery'); step('rebalance', 'dock-latch');
  // the fleet's dock listener and demand forecast open its two map views of step 4: the live dock feed and the nightly forecast
  step('fleet', 'dock-feed'); step('fleet', 'demand');
  // the use cases to hiring a bike to its inner interactions; reporting a fault to the repair process to collecting the bike
  step('rider-uses', 'hire-overview'); step('hire-overview', 'hire-unlock'); step('rider-uses', 'repair-process'); step('repair-process', 'collect-bike');
  // C4 down its levels, and out of them to the views each element's design is in
  step('c4-context', 'c4-containers'); step('c4-containers', 'c4-components'); step('c4-context', 'c4-deployment'); step('c4-deployment', 'production');
  step('production', 'components'); step('components', 'trip-internals'); step('c4-components', 'packages'); step('packages', 'privacy'); step('packages', 'requirements');
  step('c4-components', 'dfd-0'); step('dfd-0', 'dfd-1'); step('c4-containers', 'trips-schema'); step('c4-context', 'triage'); step('c4-containers', 'rider-data');
  step('c4-components', 'unlock-communication'); step('new-city', 'on-gcp'); step('new-city', 'on-azure'); step('new-city', 'on-aws');
});

test('a typed view\'s key holds the titles of the views it opens: update() redraws "opens <view>" after a rename (atlas.test\'s audit 2)', () => {
  const R = structuredClone(M); R.views.forEach(v => { v.title = 'Renamed ' + (v.title ?? v.id); });
  for (const vid of ['hire-overview', 'rebalance', 'dfd-0', 'new-city']) {
    assert.notEqual(mapContext(M).viewKey(vid), mapContext(R).viewKey(vid), vid);
    assert.match(mapContext(R).buildView(vid).markup, /Renamed/, vid);
  }
});

test('describe() and the PDF\'s tables read every view; the e-bike views read as their own files did', () => {
  const ctx = mapContext(M);
  for (const v of M.views) { assert.ok(describe(M, v.id).length, v.id); assert.ok(tablesOf(ctx, ctx.V[v.id], ctx.buildGeo(v.id)).length, v.id); }
  assert.match(describe(M, 'inside-ebike'), /^Inside the e-bike: an internal block diagram of 24 elements and 6 lines\./);
  assert.deepEqual(['requirements', 'blocks', 'inside-ebike', 'range-analysis'].map(v => layout(M, v).families[0].title), ['req [Model] Bike share, an example [E-bike requirements]',
    'bdd [Model] Bike share, an example [E-bike blocks]', 'ibd [Block] EBike [Inside the e-bike]', 'par [Block] EBike [E-bike range]']);
});

test('the four e-bike views: each lays out as in its own example file, and the files\' shared elements are one element here', () => {
  const pic = (m, vid) => { const { ms, ...g } = layout(m, vid); return JSON.parse(JSON.stringify(g, (k, x) => k === 'opensTo' ? undefined : (k === 'aria' || k === 'ariaOwn') && typeof x === 'string' ? x.replace(/, opens [^,]*$/, '') : x)); };
  for (const name of ['ebike-requirements', 'ebike-blocks', 'ebike-structure', 'ebike-range']) {
    const src = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    for (const v of src.views) assert.deepEqual(pic({ ...M, title: src.title }, v.id), pic(src, v.id), `${name} view ${v.id}`);
  }
  // one range equation, of energy; EBike's part members drawn by the block view's composite associations, one type and multiplicity each
  const eq = M.nodes.find(n => n.id === 'range-equation');
  assert.deepEqual([eq.props.constraint, eq.members.map(m => m.label)], ['range = energy / consumption', ['range', 'energy', 'consumption']]);
  const ebike = M.nodes.find(n => n.id === 'ebike');
  for (const e of M.edges.filter(e => e.type === 'uml.Association' && e.from === 'ebike')) { const p = ebike.members.find(m => m.label === e.props.ends.to.role);
    assert.deepEqual([p.props.multiplicity, M.nodes.find(n => n.id === e.to).label], [e.props.ends.to.multiplicity, p.props.valueType], e.id); }
  // the SysML block battery keeps its id; the fleet map's card is battery-service
  assert.equal(M.nodes.find(n => n.id === 'battery').type, 'sysml.Block');
  assert.equal(M.nodes.find(n => n.id === 'battery-service').opensView, 'blocks');
});

test('the profile: personalData, required on Class, is supplied to exactly the classes of rides; startedAt\'s column stereotype and tags are the model\'s', () => {
  const all = M.nodes.flatMap(n => [n, ...(n.members || [])]);
  assert.deepEqual(all.filter(n => appliedOf(M, n.id).some(e => e.key === 'personalData')).map(n => n.id), PINNED_PERSONAL);
  const startedAt = M.nodes.find(n => n.id === 'ride').members.find(m => m.id === 'ride.startedAt');
  assert.deepEqual([startedAt.props.stereotypes, startedAt.props.tags], [['column'], { column: { name: 'started_at', indexed: 'true' } }]);
  assert.deepEqual(M.nodes.find(n => n.id === 'ride').props.tags.personalData, { retention: '2 years' });
});
// the classes of the package rides: RideRepository and RideListener, which type the ride service's parts, among them
const PINNED_PERSONAL = ['rider', 'ride', 'leg', 'ride-repository', 'ride-listener'];

test('Shift + Delete of a lifeline every interaction view shows: each view\'s hint counts the messages, connectors and timing changes the cascade takes', () => {
  const L = 'lifeline-dock', vs = M.views.filter(v => ['uml.sequence', 'uml.communication', 'uml.timing'].includes(v.diagram) && (v.nodeIds || []).includes(L));
  assert.deepEqual(vs.map(v => v.id), ['unlock-sequence', 'unlock-communication', 'hire-unlock', 'dock-latch']);
  const every = x => ({ messages: new Set([...x.edges, ...x.views.flatMap(v => (v.edges || []).filter(e => e && typeof e === 'object'))].filter(e => e.type === 'uml.Message').map(e => e.id)).size,
    changes: x.views.flatMap(v => (v.timeline || {}).changes || []).length });
  const says = Object.fromEntries(vs.map(v => { const r = diagramOf(v).edits.remove(M, v, [L], true), a = every(M), b = every(apply(M, r.commands));
    assert.deepEqual([a.messages - b.messages, a.changes - b.changes], [9, 4], v.id); return [v.id, r.say]; }));
  assert.deepEqual(says, PINNED_SAYS);
  const r = sqRemove(M, view('log-ride'), ['lifeline-worker'], true), n = apply(M, Array.isArray(r) ? r : r.commands), tl = n.views.find(v => v.id === 'dock-latch').timeline;
  assert.deepEqual(validateAll(n).filter(p => p.level === 'error' && !p.rule), []);
  assert.deepEqual([tl.changes.map(c => c.lifeline), tl.constraints], [Array(4).fill('lifeline-dock'), []]);
  assert.equal(r.say, 'Deleted worker, and 3 messages, 4 changes and 2 constraints with it');
  const A = 'lifeline-api', cons = x => [...x.edges, ...x.views.flatMap(v => (v.edges || []).filter(e => e && typeof e === 'object'))].filter(e => e.type === 'uml.Connector').map(e => e.id);
  for (const id of ['unlock-sequence', 'unlock-communication', 'hire-unlock']) { const v = view(id), q = diagramOf(v).edits.remove(M, v, [A], true);
    assert.deepEqual(cons(M).filter(c => !cons(apply(M, q.commands)).includes(c)), ['app-api', 'api-self', 'api-dock', 'api-ride'], id); }
  const cv = view('unlock-communication');
  assert.equal(diagramOf(cv).edits.remove(M, cv, [A], false).say, PINNED_HID);
});
const PINNED_SAYS = {
  'unlock-sequence': 'Deleted dock, and 9 messages, 1 connector and 4 changes with it', 'hire-unlock': 'Deleted dock, and 9 messages, 1 connector and 4 changes with it',
  'unlock-communication': 'Deleted lifeline "dock", its 1 connector ("api–dock") and its 9 messages: "release(bike)", "released", and 7 in other views, and 4 changes',
  'dock-latch': 'Deleted dock, 4 changes, 9 messages and 1 connector' };
const PINNED_HID = 'Hid lifeline "api", its 4 connectors ("app–api", "api–api", "api–dock", "api–ride") and its 7 messages: "start(ride)", "check(pass)", "release(bike)", "released", "new(ride)", "rideStarted", "result"';

test('each typed element that opens a view says so in its accessible name; every classifier box\'s SVG name is the one the type computes', () => {
  const was = console.warn; console.warn = () => {}; const silent = []; let n = 0;
  try { for (const x of M.nodes.filter(x => x.opensView && x.type && x.type !== 'mindmap.Topic')) for (const v of M.views.filter(v => (v.nodeIds || []).includes(x.id) && v.id !== x.opensView)) {
    const g = layout(M, v.id), c = g.nodes.find(y => y.id === x.id); if (!c) continue; n++;
    const said = (svgOf(g).match(new RegExp(`class="node[^"]*" data-id="${x.id}"[^>]*aria-label="([^"]*)"`)) || [])[1] || '';
    if (![c.aria || '', said].every(t => /\bopens\b/.test(t))) silent.push(`${v.id} ${x.id}: ${c.aria} | ${said}`); } } finally { console.warn = was; }
  assert.ok(n > 20, n); assert.deepEqual(silent, []);
  const ctx = mapContext(M), un = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let k = 0; const bad = [];
  for (const v of M.views.filter(v => v.diagram)) { const g = layout(M, v.id), mk = ctx.buildView(v.id).markup;
    for (const [, d, a] of mk.matchAll(/<g class="node classifier" data-id="([^"]*)"[^>]*aria-label="([^"]*)"/g)) { const x = g.nodes.find(y => y.id === un(d)); k++;
      if (x && x.aria && un(a) !== x.aria) bad.push(`${v.id} ${un(d)}: ${un(a)} | ${x.aria}`); } }
  assert.ok(k > 30, `${k} boxes`); assert.deepEqual(bad, []);
  const at = mk => mk.match(/<g class="node classifier" data-id="i-sign-in"[^>]*aria-label="([^"]*)"/)[1];
  assert.equal(un(at(ctx.buildView('components').markup)), 'Interface SignIn, provided by Accounts and sign-in, required by Rider app, Trip API');
});

test('MCP list_views counts a typed view\'s cards as the page does: the elements it draws, not its nodeIds', () => {
  const listed = JSON.parse(JSON.parse(execFileSync('python3', [new URL('../umlimator.py', import.meta.url).pathname, 'mcp', new URL('../examples/bike-share.json', import.meta.url).pathname, '--port', '0'], {
    input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_views', arguments: {} } }) + '\n', encoding: 'utf8', timeout: 120000 }).split('\n')[0]).result.content[0].text).views;
  let differs = 0;
  const want = M.views.map(v => { const n = elementCount(v, layoutAll(M, v.id)); differs += n != null && n !== v.nodeIds.length; return [v.id, n ?? v.nodeIds.length]; });
  assert.deepEqual(listed.map(v => [v.id, v.cards]), want);
  assert.ok(differs >= 5, `typed views that draw more than they list (${differs})`);
});

// the plan's sixth risk: the C4 views here and examples/bike-share.dsl, imported to examples/bike-share-c4.json, are two
// sources of one picture. Each static view the import reads holds the cards of its view here, by id (here with "c4-" in
// front) and by name: the subject a container or component view boxes is a box there, a card here
test('the C4 views and the Structurizr import agree on their cards: the context, the containers and the trip API\'s components', () => {
  const C4 = JSON.parse(readFileSync(new URL('../examples/bike-share-c4.json', import.meta.url), 'utf8'));
  const label = (m, id) => m.nodes.find(n => n.id === id)?.label;
  for (const [here, there] of [['c4-context', 'context'], ['c4-containers', 'containers'], ['c4-components', 'api-components']]) {
    const v = M.views.find(x => x.id === here), w = C4.views.find(x => x.id === there);
    const ours = v.nodeIds.map(id => id.replace(/^c4-/, '')).sort();
    const theirs = [...w.nodeIds, ...(w.containers || []).map(c => c.id).filter(id => label(C4, id))].sort();
    assert.deepEqual(ours, theirs, `${here} and ${there}`);
    for (const id of v.nodeIds) assert.equal(label(M, id), label(C4, id.replace(/^c4-/, '')), `${here}: ${id}`);
  }
  // the import is version 1 (a map), the second, different map the element page and the MCP server swap to
  assert.equal(C4.schemaVersion, undefined); assert.notEqual(C4.title, M.title);
});
