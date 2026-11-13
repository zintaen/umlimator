// Stage 5's fixtures (work package 5.8, notes/stage-5.md §13): for each of the component, deployment and composite
// structure diagrams, tests/<type>-minimal.json and tests/<type>-stress.json, whose view edge-cases holds each case §13
// lists and whose view all is §14's stress view (the generator each type's own P1 test times, written out). Each view is
// laid out right and down with no line through a node but its own two ends (a port's line may run into its owner's box,
// not through a card), no line end off its port's square (by 1 px), no port off its owner's border, no port name over a
// node or a line, and what check() finds pinned here: the crossings that turning port repair off leaves (§14) and the
// few other findings, each stated in its type's conformance note (docs/conformance/uml-*.md). The six-level width is
// pinned. Then §14's budgets in CPU time, best of seven after a warm-up: a full layout and its SVG under 1 s; the common
// edit and an edit that moves nothing under a 1 s ceiling, their time printed against the 100 ms target (the
// repository's rule for CI timing). tests/stage5.html draws every view in Chrome under three fonts and both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import '../src/uml/component.js';
import '../src/uml/deployment.js';
import '../src/uml/composite.js';

const read = f => JSON.parse(readFileSync(new URL(`./${f}.json`, import.meta.url), 'utf8'));
const TYPES = ['component', 'deployment', 'composite'];
const FIX = Object.fromEntries(TYPES.flatMap(t => ['minimal', 'stress'].map(k => [`${t}-${k}`, read(`${t}-${k}`)])));
const V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id), edge = (m, id) => m.edges.find(e => e.id === id);
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });
const said = m => validate(m).map(p => [p.level, p.rule || null, p.ids || null]);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a, b) => a.x >= b.x - .5 && a.y >= b.y - .5 && a.x + a.w <= b.x + b.w + .5 && a.y + a.h <= b.y + b.h + .5;
const segs = e => e.pts.slice(1).map((q, k) => { const p = e.pts[k]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }; });

// DoD 3 in Node, on one view laid out one way: what is wrong ("bad"), and what check() finds, crossings counted apart
function clean(m, vid) {
  const g = layout(m, vid), bad = [], fams = g.families || [], by = id => g.byId[id] || fams.find(f => f.id === id);
  const ports = g.nodes.filter(n => n.shape === 'port'), mine = id => [id, (g.byId[id] || {}).owner].filter(x => x != null);
  // no line runs through a node but its own two ends (a port's end: the port and its owner)
  g.edges.forEach(e => segs(e).forEach(s => g.nodes.forEach(n => { if (![...mine(e.from), ...mine(e.to), e.fromPort, e.toPort].includes(n.id) && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); })));
  // a port's line ends on its square, within 1 px
  g.edges.forEach(e => [[e.fromPort, e.pts[0]], [e.toPort, e.pts.at(-1)]].forEach(([id, [x, y]]) => { if (id == null) return; const q = g.byId[id];
    if (!q || Math.max(q.x - x, x - q.x - q.w, q.y - y, y - q.y - q.h, 0) > 1) bad.push(`${e.id} ends off ${id}'s square at ${x},${y}`); }));
  // each port centred on its owner's border, on its side
  ports.forEach(p => { const o = by(p.owner), v = p.side === 'L' || p.side === 'R', b = !o ? NaN : p.side === 'L' ? o.x : p.side === 'R' ? o.x + o.w : p.side === 'T' ? o.y : o.y + o.h;
    if (!(Math.abs((v ? p.x + p.w / 2 : p.y + p.h / 2) - b) < .01)) bad.push(`${p.id} is off ${p.owner}'s border`); });
  // no port name over a node (but its own port) or a line
  ports.filter(p => p.nameBox).forEach(p => { const t = p.nameBox;
    g.nodes.forEach(n => { if (n.id !== p.id && meets(t, n)) bad.push(`${p.id}'s name is over ${n.id}`); });
    g.edges.forEach(e => { if (segs(e).some(s => meets(t, s))) bad.push(`${p.id}'s name is over ${e.id}`); }); });
  const found = check(m, vid).map(p => p.message), crossings = found.filter(p => / cross$/.test(p)).length;
  return { g, bad, crossings, other: found.filter(p => !/ cross$/.test(p)) };
}

// what each view keeps, laid out right and down: [crossings, check()'s other findings, what clean() calls wrong]. Not §13's
// "no overlap, no line along a box's border, no port name over a node or a line": these are limits, stated in the type's
// conformance note and notes/stage-5.md §13's "As built". Port repair is off for the three types (§14). The stress views'
// all are generated: there the crowding leaves lines sharing a line or along a box's border, box headers crossed, a
// label on a line (deployment, down), and in the component view a ball's name under a port (Api0 and in) and port names
// over lines and, once, over a sibling component (c0.b over c4; the layout keeps no room for names, §4.3, L5). On
// edge-cases: ten ports on one side of a box, which cannot grow (§4.1), five held at its span's start (over), 15 pairs
const PINNED = {
  'component-minimal': {
    'v': {
      right: [0,[],[]],
      down: [0,[],[]] } },
  'component-stress': {
    'edge-cases': {
      right: [2,["view edge-cases: nodes \"p0\" and \"p1\" overlap","view edge-cases: nodes \"p0\" and \"p2\" overlap","view edge-cases: nodes \"p0\" and \"p3\" overlap","view edge-cases: nodes \"p0\" and \"p4\" overlap","view edge-cases: nodes \"p0\" and \"p5\" overlap","view edge-cases: nodes \"p1\" and \"p2\" overlap","view edge-cases: nodes \"p1\" and \"p3\" overlap","view edge-cases: nodes \"p1\" and \"p4\" overlap","view edge-cases: nodes \"p1\" and \"p5\" overlap","view edge-cases: nodes \"p2\" and \"p3\" overlap","view edge-cases: nodes \"p2\" and \"p4\" overlap","view edge-cases: nodes \"p2\" and \"p5\" overlap","view edge-cases: nodes \"p3\" and \"p4\" overlap","view edge-cases: nodes \"p3\" and \"p5\" overlap","view edge-cases: nodes \"p4\" and \"p5\" overlap"],[]],
      down: [1,["view edge-cases: nodes \"p0\" and \"p1\" overlap","view edge-cases: nodes \"p0\" and \"p2\" overlap","view edge-cases: nodes \"p0\" and \"p3\" overlap","view edge-cases: nodes \"p0\" and \"p4\" overlap","view edge-cases: nodes \"p0\" and \"p5\" overlap","view edge-cases: nodes \"p1\" and \"p2\" overlap","view edge-cases: nodes \"p1\" and \"p3\" overlap","view edge-cases: nodes \"p1\" and \"p4\" overlap","view edge-cases: nodes \"p1\" and \"p5\" overlap","view edge-cases: nodes \"p2\" and \"p3\" overlap","view edge-cases: nodes \"p2\" and \"p4\" overlap","view edge-cases: nodes \"p2\" and \"p5\" overlap","view edge-cases: nodes \"p3\" and \"p4\" overlap","view edge-cases: nodes \"p3\" and \"p5\" overlap","view edge-cases: nodes \"p4\" and \"p5\" overlap"],[]] },
    'all': {
      right: [126,["view all: nodes \"Api0\" and \"in\" overlap","view all: edges Box 1→Inner 1 and Component number 32→Api0 share a line","view all: edges Component number 0→Api0 and Component number 0→Api0 share a line","view all: family \"Box 0\": header crossed by edge Component number 8→Api0","view all: family \"Inner 0\": header crossed by edge Component number 0→Api0"],["c0.a's name is over r0","c0.a's name is over r9","c0.b's name is over c4","c0.b's name is over u9","c0.b's name is over u14","c0.b's name is over u21","c8.a's name is over r8","c8.a's name is over r9","c8.a's name is over r14"]],
      down: [128,["view all: edges Component number 33→Api1 and Component number 5→Api1 share a line","view all: edge Component number 10→Api2 runs along the border of family \"Box 2\""],[]] } },
  'deployment-minimal': {
    'v': {
      right: [0,[],[]],
      down: [0,[],[]] } },
  'deployment-stress': {
    'edge-cases': {
      right: [0,[],[]],
      down: [4,[],[]] },
    'all': {
      right: [15,["view all: edge Stack 1 level 3→Stack 2 level 3 runs along the border of family \"Stack 2 level 2\"","view all: edge Stack 1 level 4→Stack 3 level 0 runs along the border of family \"Stack 3 level 0\"","view all: edge Stack 2 level 3→Stack 3 level 3 runs along the border of family \"Stack 3 level 2\""],[]],
      down: [14,["view all: edges Stack 1 level 4→Stack 2 level 4 and Stack 1 level 4→Stack 3 level 0 share a line","view all: edges Stack 2 level 4→Stack 3 level 4 and Stack 3 level 4→Stack 0 level 0 share a line","view all: edges Stack 3 level 4→Stack 4 level 4 and Stack 4 level 4→Stack 1 level 0 share a line","view all: label \"HTTPS with mutual TLS\" lies on edge Stack 3 level 4→Stack 0 level 0","view all: label \"HTTPS with mutual TLS\" lies on edge Stack 1 level 4→Stack 3 level 0"],[]] } },
  'composite-minimal': {
    'v': {
      right: [0,[],[]],
      down: [0,[],[]] } },
  'composite-stress': {
    'edge-cases': {
      right: [1,[],[]],
      down: [1,[],[]] },
    'all': {
      right: [21,[],[]],
      down: [5,[],[]] } },
};

test('every view of the six fixtures, right and down: line through a node, port line off its square, port off its owner\'s border, port name over a node or a line and check()\'s findings each only as pinned (the stated limits)', () => {
  const seen = {};
  for (const [f, m] of Object.entries(FIX)) for (const v of m.views) for (const d of ['right', 'down']) {
    const r = clean(turned(m, v.id, d), v.id);
    ((seen[f] ||= {})[v.id] ||= {})[d] = [r.crossings, r.other, r.bad];
  }
  if (process.env.PIN) console.log(JSON.stringify(seen));
  assert.deepEqual(seen, PINNED);
});

test('the minimal fixtures: what §13 says each holds, and no problem', () => {
  for (const t of TYPES) assert.deepEqual(said(FIX[`${t}-minimal`]), [], t);
  const c = FIX['component-minimal'], cg = layout(c, 'v');
  assert.deepEqual([cg.byId['provider.api'].shape, cg.byId.api.shape, cg.edges.map(e => [e.id, e.end.to])], ['port', 'ball', [['provides', 'none'], ['requires', 'socket']]], 'a port providing a ball, a component requiring it by a socket');
  const d = FIX['deployment-minimal'], dg = layout(d, 'v'), fam = id => dg.families.find(f => f.id === id);
  assert.deepEqual(['server', 'runtime', 'app'].map(id => node(d, id).type), ['uml.Device', 'uml.ExecutionEnvironment', 'uml.Artifact']);
  assert.ok(within(dg.byId.app, fam('runtime')) && within(fam('runtime'), fam('server')), 'a device holding an execution environment holding an artifact');
  const s = FIX['composite-minimal'], sg = layout(s, 'v');
  assert.deepEqual([sg.families.map(f => f.id), sg.edges.map(e => [e.id, e.inner, e.fromPort, e.toPort])], [['s'], [['c', 'from', 's.in', 's.p->t.in']]], 'the subject\'s port to its part\'s port, inner');
});

test('component-stress.json, edge-cases: each case of §13', () => {
  const m = FIX['component-stress'], g = layout(m, 'edge-cases'), fam = id => g.families.find(f => f.id === id), port = id => g.byId[id];
  assert.ok(within(fam('ec-l3'), fam('ec-l2')) && within(fam('ec-l2'), fam('ec-l1')) && within(g.byId['ec-l4'], fam('ec-l3')), 'three deep (L8)');
  assert.deepEqual(g.edges.filter(e => e.inner).map(e => [e.id, e.inner]), [['ec-d1', 'from'], ['ec-d2', 'from'], ['ec-d3', 'from'], ['ec-d-out', 'to']], 'a delegation in at each level, and one out');
  assert.ok(['ec-l1', 'ec-l2', 'ec-l3'].every(id => g.byId['ec-l4'].x - fam(id).x >= 48 - .01), 'a box with ports has 48 px of padding');
  const hub = g.edges.filter(e => e.fromPort === 'ec-hub.out');
  assert.deepEqual([hub.length, [...new Set(hub.map(e => e.fs))], port('ec-hub.out').h], [3, ['R'], 32], 'a port with three lines on one face: 12 + 10 + 10 px along its border');
  assert.deepEqual(['north', 'east', 'south', 'west'].map(k => port(`ec-pinned.${k}`).side), ['T', 'R', 'B', 'L'], 'ports pinned to each side by present');
  assert.ok(!m.edges.some(e => e.from === 'ec-quiet.p' || e.to === 'ec-quiet.p') && port('ec-quiet.p'), 'a port with no line, drawn');
  assert.equal(port('ec-quiet.p').nameBox.text.length, 40, 'a 40-character port name, whole');
  assert.deepEqual(Array.from({ length: 10 }, (_, k) => port(`ec-ten.p${k}`).side + (port(`ec-ten.p${k}`).over ? '!' : '')).join(''), 'L'.repeat(10), 'ten ports on one side of a node: it grows to hold them');
  assert.deepEqual(Array.from({ length: 10 }, (_, k) => !!port(`ec-tenbox.p${k}`).over), [true, true, true, true, true, false, false, false, false, false],
    'ten on one side of a box, which does not grow: five held at its span\'s start, marked over (§4.1, pinned and stated)');
  assert.deepEqual([g.byId['ec-i-ball'].shape, g.edges.filter(e => e.to === 'ec-i-ball').map(e => e.end.to), g.byId['ec-i-rect'].shape], ['ball', ['none', 'socket', 'socket'], 'classifier'], 'a ball with two requirers; a rectangle');
  assert.deepEqual([edge(m, 'ec-asm').props.kind, node(m, 'ec-x').parent, node(m, 'ec-y').parent], ['assembly', 'ec-pair', 'ec-pair'], 'an assembly between two nested components\' ports');
  assert.equal(g.edges.find(e => e.id === 'ec-m1').end.to, 'open', 'a manifestation');
  assert.deepEqual(said(m), [['error', 'delegation-ends', ['ec-bad-d', 'ec-x.out', 'ec-to-e.in']]], 'a delegation out of a box that is not one; nothing else');
});

test('deployment-stress.json, edge-cases: each case of §13, and the six-level width pinned', () => {
  const m = FIX['deployment-stress'], g = layout(m, 'edge-cases'), fam = id => g.families.find(f => f.id === id);
  assert.ok(within(g.byId['ec-a1'], fam('ec-n1')) && g.edges.some(e => e.id === 'ec-dep2' && e.label === '«deploy»'), 'deployed by nesting, and by a line (G2)');
  assert.ok(within(g.byId['ec-a3'], fam('ec-n1')) && g.edges.some(e => e.id === 'ec-dep3'), 'one deployed both ways');
  for (let i = 2; i <= 6; i++) assert.ok(within(fam(`ec-d${i}`), fam(`ec-d${i - 1}`)), `level ${i} in level ${i - 1}`);
  assert.deepEqual([node(m, 'ec-d6').type, node(m, 'ec-d5').type], ['uml.ExecutionEnvironment', 'uml.ExecutionEnvironment'], 'an execution environment in one');
  assert.deepEqual([edge(m, 'ec-deep-path').from, edge(m, 'ec-deep-path').to, node(m, 'ec-top').parent], ['ec-d6', 'ec-top', undefined], 'a path from the deepest to the top (L8)');
  const long = g.edges.find(e => e.id === 'ec-long');
  assert.ok(long.lbl.w <= 300 && edge(m, 'ec-long').label.length > 80, 'a long path label, cut');
  assert.deepEqual([edge(m, 'ec-short').from, edge(m, 'ec-short').to], [edge(m, 'ec-long').from, edge(m, 'ec-long').to], 'two paths between one pair');
  assert.deepEqual([node(m, 'ec-spec').type, edge(m, 'ec-specdep').from], ['uml.DeploymentSpecification', 'ec-spec'], 'a deployment specification with its dependency');
  assert.deepEqual(['ec-man1', 'ec-man2'].map(id => node(m, edge(m, id).to).type), ['uml.Component', 'uml.Component'], 'manifestations into components');
  assert.deepEqual(said(m), [['warning', 'deployed-twice', ['ec-dep3', 'ec-a3', 'ec-n1', 'ec-n2']]], 'what it warns of; no error');
  // the six-level width (§7, L8), pinned: the cube's 10 px faces in each level's frame (5.5)
  const sizes = Object.fromEntries(['right', 'down'].map(d => { const f = layout(turned(m, 'edge-cases', d), 'edge-cases').families.find(x => x.id === 'ec-d1'); return [d, [f.w, f.h]]; }));
  console.log(`# six levels, the outer box: ${JSON.stringify(sizes)}`);
  assert.deepEqual(sizes, { right: [488, 574], down: [488, 574] });
});

test('composite-stress.json, edge-cases: each case of §13', () => {
  const m = FIX['composite-stress'], g = layout(m, 'edge-cases');
  assert.deepEqual(['ec-s.a->ec-worker.job', 'ec-s.b->ec-worker.job'].map(id => g.byId[id].shape), ['port', 'port'], 'two parts of one type, each with the type\'s port (G2)');
  assert.deepEqual(['ec-c1', 'ec-c2'].map(id => { const e = g.edges.find(x => x.id === id); return [e.fromPort, e.toPort]; }), [['ec-s.in', 'ec-s.a->ec-worker.job'], ['ec-s.b->ec-worker.job', 'ec-s.out']], 'each with its own connector');
  assert.ok(g.byId['ec-s.cache'].shared, 'a shared part, dashed');
  assert.ok(g.families.find(f => f.id === 'ec-collab').round && ['ec-collab.r1', 'ec-collab.r2', 'ec-collab.r3'].every(id => g.byId[id]) && g.edges.filter(e => /^ec-r\d\d$/.test(e.id)).length === 2, 'an open collaboration: three roles, two connectors');
  assert.deepEqual(['ec-use1', 'ec-use2'].map(id => [g.byId[id].shape, m.edges.filter(e => e.type === 'uml.RoleBinding' && e.to === id).length]), [['collab-use', 2], ['collab-use', 1]], 'two collaboration uses with role bindings');
  const ins = g.edges.filter(e => e.fromPort === 'ec-s.in' || e.toPort === 'ec-s.in');
  assert.deepEqual(ins.map(e => [e.id, e.inner || null]), [['ec-c1', 'from'], ['ec-bad', 'from'], ['ec-note-link', null]], 'the subject\'s port with lines inside and one outside');
  assert.deepEqual(said(m).filter(([, , ids]) => ids.some(id => String(id).startsWith('ec-'))),
    [['warning', 'part-type', ['ec-s.ghost', 'ec-s']], ['error', 'connector-part', ['ec-bad', 'ec-worker.job', 'ec-s.cache']]], 'a part typed by no class (warned); a connector through a part to another type\'s port (error)');
});

test('the views all: §13\'s sizes, and every element shown', () => {
  const c = FIX['component-stress'], cv = V(c, 'all'), cg = layout(c, 'all');
  assert.deepEqual([cv.nodeIds.length, cg.edges.length, cg.nodes.filter(n => n.shape === 'port').length], [50, 60, 54], 'component: 50 elements, 60 lines, 54 ports (§13 asks 40)');
  assert.ok(cg.families.some(f => f.id === 'b0i' && cg.byId.c0 && within(cg.byId.c0, f)), 'component: boxes three deep (a box, its inner box, a component in it)');
  const d = FIX['deployment-stress'], dg = layout(d, 'all'), fam = id => dg.families.find(f => f.id === id);
  assert.deepEqual([V(d, 'all').nodeIds.length, dg.edges.length], [50, 50]);
  assert.ok([1, 2, 3, 4].every(i => within(fam(`s0t${i}`), fam(`s0t${i - 1}`))), 'deployment: boxes five deep');
  const s = FIX['composite-stress'], sg = layout(s, 'all');
  assert.deepEqual([node(s, 's').members.filter(x => x.type === 'uml.Property').length, sg.edges.length, sg.nodes.filter(n => n.shape === 'port' && n.id.includes('->')).length], [30, 50, 20], 'composite: 30 parts, 50 connectors, 20 ports on parts');
});

test('the component type names an element by its components and packages only: an artifact deployed in a node is not qualified by it (0.22.0)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'pk', type: 'uml.Package', label: 'shop' }, { id: 'api', type: 'uml.Component', label: 'API', parent: 'pk' },
    { id: 'host', type: 'uml.Node', label: 'Host' }, { id: 'jar', type: 'uml.Artifact', label: 'api.jar', parent: 'host' }],
  edges: [{ id: 'm', type: 'uml.Manifestation', from: 'jar', to: 'api' }], views: [{ id: 'v', diagram: 'uml.component', nodeIds: ['api', 'jar'] }] };
  const g = layout(m, 'v');
  assert.deepEqual([g.byId.api.label, g.byId.jar.label, g.byId.jar.aria], ['shop::API', 'api.jar', 'Artifact api.jar, manifests shop::API']);
});

// ---- §14: budgets, in this process's CPU time, best of seven after a warm-up
const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
// each edit set's first is a colour, the edit that moves nothing (§14; risks.md F7), checked to lay out nothing again
const colour = id => i => [{ op: 'set', id, path: 'color', value: ['red', 'blue'][i % 2] }];
function budgets(f, edits) {
  const m = FIX[f], runs = [];
  for (let i = 0; i < 8; i++) { // the first is a warm-up
    const memos = {}, t = {};
    [, t.full] = cpu(() => mapContext(m, { memos }).buildView('all').markup);
    for (const [k, c] of Object.entries(edits)) { const e = apply(m, typeof c === 'function' ? c(i) : c), was = memos.all.runs; let out; [out, t[k]] = cpu(() => mapContext(e, { memos }).buildView('all').markup); assert.match(out, /^<svg /, k);
      if (k === 'colour') assert.equal(memos.all.runs, was, 'a colour lays out nothing again (F7)'); }
    if (i) runs.push(t);
  }
  const best = k => Math.min(...runs.map(t => t[k]));
  console.log(`# ${f} all, CPU ms, best of seven: full ${best('full').toFixed(1)}; ${Object.keys(edits).map(k => `${k} ${best(k).toFixed(1)}`).join('; ')} (target 100 ms each)`);
  // the repository's rule for CI timing: a hard budget in CI is the 1 s ceiling, and each edit is printed against 100 ms
  assert.ok(best('full') < 1000, `full ${best('full')} ms`);
  for (const k of Object.keys(edits)) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
}

test('P1 (§14): component-stress.json all: a full layout under 1 s; a colour (moving nothing), a port renamed, a component renamed and a stereotype (a header grown, laid out again), laid out and drawn, printed against 100 ms (timed)', () => {
  budgets('component-stress', { colour: colour('c9'), port: i => [{ op: 'set', id: 'c5.a', path: 'label', value: 'p'.repeat(3 + i) }], component: i => [{ op: 'set', id: 'c7', path: 'label', value: `Renamed ${'x'.repeat(i)}` }],
    stereotype: i => [{ op: 'set', id: 'c9', path: 'props.stereotypes', value: [`v${i}`] }] });
});

test('P1 (§14): deployment-stress.json all: a full layout under 1 s; a colour (moving nothing), a path\'s label, an artifact moved into another node and a stereotype (a header grown, laid out again), laid out and drawn, printed against 100 ms (timed)', () => {
  budgets('deployment-stress', { colour: colour('s2a1'), label: i => [{ op: 'set', id: 'p1-2', path: 'label', value: `TCP ${'x'.repeat(4 + 3 * i)}` }], move: i => [{ op: 'reparent', id: 's0a4', parent: `s${1 + i % 4}t${i % 5}` }],
    stereotype: i => [{ op: 'set', id: 's2a1', path: 'props.stereotypes', value: [`v${i}`] }] });
});

test('P1 (§14): composite-stress.json all: a full layout under 1 s; a colour (moving nothing), a part\'s type and a stereotype, laid out and drawn, printed against 100 ms (timed)', () => {
  // each run's value its own, so no run reuses a layout an earlier one made
  budgets('composite-stress', { colour: colour('s.p13'), type: i => [{ op: 'set', id: 's.p12', path: 'props.valueType', value: 'Plain' + 'x'.repeat(i + 1) }], stereotype: i => [{ op: 'set', id: 's.p13', path: 'props.stereotypes', value: [`v${i}`] }] });
});
