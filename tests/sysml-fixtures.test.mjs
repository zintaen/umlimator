// Milestone 3's fixtures (work package M3.7, notes/milestone-3.md §15.3): tests/<type>-minimal.json and <type>-stress.json for
// SysML's requirement, block definition, internal block and parametric diagrams. A stress file's view edge-cases (and the
// views beside it: a requirement view framed by a package, an internal block view of a block with ports and no parts, a
// parametric view of a constraint block) holds each case §15.3 lists; its view all is §14's P1 view, the generator each
// type's own test times, written out. Each view is laid out right and down with no line through a node but its own two
// ends, every line end within 1 px of its node's box, no line label over a node, every port centred on its owner's border
// (a part's, or the frame's), and what check() finds pinned: the crossings that repair and reroute off leave (§14, S18) and
// the few other findings, each stated in its type's conformance note (docs/conformance/sysml-*.md). Then §14's budgets on
// each fixture's all, in CPU time, best of seven after a warm-up: a full layout and its SVG under 1 s; the common edits under
// CI's 1 s ceiling, their time printed against the 100 ms target. tests/sysml.html draws every view in Chrome under three
// fonts and both themes, with the same checks on every view but the generated alls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import '../src/sysml/requirement.js';
import '../src/sysml/blocks.js';
import '../src/sysml/internal.js';
import '../src/sysml/parametric.js';
import { diagramOf } from '../src/core/registry.js';

const read = f => JSON.parse(readFileSync(new URL(`./${f}.json`, import.meta.url), 'utf8'));
const TYPES = ['requirement', 'block-definition', 'internal-block', 'parametric'];
const FIX = Object.fromEntries(TYPES.flatMap(t => ['minimal', 'stress'].map(k => [`${t}-${k}`, read(`${t}-${k}`)])));
const V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id);
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });
const said = m => validate(m).map(p => [p.level, p.rule || null, p.ids || null]);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segs = pts => pts.slice(1).map((q, k) => { const p = pts[k]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }; });
const off = (n, [x, y]) => Math.max(n.x - x, x - n.x - n.w, n.y - y, y - n.y - n.h, 0);
const quiet = f => { const was = console.warn, got = []; console.warn = (...a) => got.push(a.join(' ')); try { return [f(), got]; } finally { console.warn = was; } };

// DoD 3 in Node, on one view laid out one way: [crossings, check()'s other findings, what is wrong]. A port sits on its
// owner's border, so a line from it is not "through" its owner; a line through a part ends on the part's port
function clean(m, vid) {
  const [g] = quiet(() => layout(m, vid)), bad = [], by = id => g.byId[id], own = id => (by(id) || {}).owner;
  g.edges.forEach(e => {
    const a = e.fromPort || e.from, b = e.toPort || e.to, ends = [e.from, e.to, a, b, own(a), own(b)]; // a line through a part ends on its port
    segs(e.pts).forEach(s => g.nodes.forEach(n => { if (!ends.includes(n.id) && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }));
    [[a, e.pts[0]], [b, e.pts.at(-1)]].forEach(([id, p]) => { const n = by(id); if (n && off(n, p) > 1) bad.push(`${e.id} ends ${off(n, p).toFixed(1)} px off ${id}`); });
    if (e.lbl) g.nodes.forEach(n => { if (meets(e.lbl, n)) bad.push(`${e.id}'s label is over ${n.id}`); });
  });
  g.nodes.filter(n => n.shape === 'port').forEach(n => { const o = by(n.owner) || (g.families || []).find(f => f.id === n.owner), cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    if (!o || !({ L: Math.abs(cx - o.x), R: Math.abs(cx - o.x - o.w), T: Math.abs(cy - o.y), B: Math.abs(cy - o.y - o.h) }[n.side] < .01)) bad.push(`${n.id} is off ${n.owner}'s border`); });
  const [found] = quiet(() => check(m, vid).map(p => p.message));
  return [found.filter(p => / cross$/.test(p)).length, found.filter(p => !/ cross$/.test(p)), [...new Set(bad)]];
}

// what each view keeps, laid out right and down, counted: [crossings, check()'s other findings, what clean() calls wrong].
// The edge-cases views and the minimal ones are clean but for the crossings counted here and one finding: laid out down, a
// constraint block subject's parameter on the frame's top crosses its header band (M3.5's gap, stated in
// docs/conformance/sysml-parametric.md). The generated views all crowd 60 lines with repair and reroute off (§14): there
// lines share a track. Each is stated in its type's conformance note
const PINNED = {
  'requirement-minimal': { v: { right: [0, 0, 0], down: [0, 0, 0] } },
  'requirement-stress': { 'edge-cases': { right: [1, 0, 0], down: [1, 0, 0] }, 'ec-package': { right: [0, 0, 0], down: [0, 0, 0] }, all: { right: [204, 0, 0], down: [235, 2, 0] } },
  'block-definition-minimal': { v: { right: [0, 0, 0], down: [0, 0, 0] } },
  'block-definition-stress': { 'edge-cases': { right: [0, 0, 0], down: [0, 0, 0] }, all: { right: [54, 0, 0], down: [50, 0, 0] } },
  'internal-block-minimal': { v: { right: [0, 0, 0], down: [0, 0, 0] } },
  'internal-block-stress': { 'edge-cases': { right: [1, 0, 0], down: [2, 0, 0] }, 'ec-ports-only': { right: [0, 0, 0], down: [0, 0, 0] }, all: { right: [16, 0, 0], down: [32, 1, 0] } },
  'parametric-minimal': { v: { right: [0, 0, 0], down: [0, 0, 0] } },
  'parametric-stress': { 'edge-cases': { right: [1, 0, 0], down: [1, 0, 0] }, 'ec-constraint-block': { right: [0, 0, 0], down: [0, 1, 0] }, all: { right: [206, 26, 0], down: [202, 28, 0] } },
};

test('every view of the eight fixtures, right and down: a line through a node, an end off its node, a label over a node, a port off its owner\'s border and check()\'s findings, each only as pinned (the stated limits)', () => {
  const seen = {};
  for (const [f, m] of Object.entries(FIX)) for (const v of m.views) for (const d of ['right', 'down']) ((seen[f] ||= {})[v.id] ||= {})[d] = clean(turned(m, v.id, d), v.id);
  const counts = {}, other = [];
  for (const [f, vs] of Object.entries(seen)) for (const [vid, ds] of Object.entries(vs)) for (const [d, [c, o, bad]] of Object.entries(ds)) {
    ((counts[f] ||= {})[vid] ||= {})[d] = [c, o.length, bad.length];
    if (vid !== 'all') other.push(...o, ...bad); }
  if (process.env.PIN) console.log(JSON.stringify(counts));
  assert.deepEqual(counts, PINNED);
  // outside the generated views, no finding but crossings and M3.5's header band
  assert.deepEqual(other, ['view ec-constraint-block: family "par [ConstraintBlock] Top [A constraint block]": header crossed by edge Top→first : Half']);
});

test('the minimal fixtures: what §15.3 says each holds, and no problem', () => {
  for (const t of TYPES) assert.deepEqual(said(FIX[`${t}-minimal`]), [], t);
  const r = FIX['requirement-minimal'];
  assert.deepEqual([r.nodes.map(n => [n.type, n.parent ?? null]), r.edges.map(e => [e.type, e.from, e.to])],
    [[['sysml.Requirement', null], ['sysml.Requirement', 'need'], ['sysml.Block', null]], [['sysml.Satisfy', 'dock', 'lock']]], 'two requirements, one containing the other, a block satisfying one');
  const b = FIX['block-definition-minimal'];
  assert.deepEqual([node(b, 'bike').members.map(x => [x.type, x.props.valueType]), b.edges.map(e => [e.type, e.props.ends.from.aggregation])],
    [[['sysml.PartProperty', 'Wheel']], [['uml.Association', 'composite']]], 'a block with a part typed by a second block, one composite association');
  const i = FIX['internal-block-minimal'];
  assert.deepEqual([node(i, 'bike').members.map(x => x.type), i.edges.map(e => e.type)], [['sysml.PartProperty', 'sysml.PartProperty'], ['sysml.Connector']], 'a block with two parts and one connector between their ports');
  const p = FIX['parametric-minimal'];
  assert.deepEqual([node(p, 'bike').members.filter(x => x.type === 'sysml.ConstraintProperty').length, node(p, 'range-eq').members.length, p.edges.map(e => e.from)],
    [1, 2, ['bike.energy', 'bike.range']], 'a constraint property with two parameters, each bound to a value property');
});

test('requirement-stress.json, edge-cases: each case of §15.3, and what the rules say of it', () => {
  const m = FIX['requirement-stress'], r = id => node(m, id);
  assert.deepEqual(said(m), [
    ['warning', 'requirement-id', ['ec-dup-a', 'ec-dup-b']], // a duplicate reqId
    ['error', 'requirement-members', ['ec-member']], // a requirement with a member
    ['warning', 'requirement-text', ['ec-no-text']], // a requirement with no text
    ['error', 'copy-text', ['ec-copies', 'ec-copy', 'ec-src']], // a copy with another text
    ['error', 'satisfy-ends', ['ec-sat-block', 'ec-blk', 'ec-blk2']], // a satisfy to a block
    ['error', 'requirement-general', ['ec-gen', 'ec-gen-b', 'ec-gen-a']], // a generalization between requirements
    ['warning', 'verify-from', ['ec-verify-block', 'ec-blk', 'ec-l3']], // a verify from a block
    ['warning', 'derive-cycle', ['ec-d2', 'ec-d1', 'ec-d2-d1']], // a derive cycle
  ], 'nothing else: the containment four deep, the package, the long and capped texts, the rationale, the kinds and the long name are fine');
  let d = 'ec-l3', depth = 0; while (d) { depth++; d = r(d).parent; } assert.equal(depth, 4, 'containment four deep');
  assert.equal(r(r('ec-in-pkg').parent).type, 'uml.Package', 'a requirement in a package in the frame');
  assert.deepEqual([r('ec-long').props.text.length, V(m, 'edge-cases').present['ec-capped'].rows], [600, 3], 'a 600-character text, and one capped');
  const g = layout(m, 'edge-cases');
  assert.ok(g.byId['ec-capped'].h < g.byId['ec-long'].h / 2, 'the capped one drawn three rows and "+k more" tall');
  assert.deepEqual(r('ec-why').props.stereotypes, ['rationale']);
  assert.deepEqual(m.nodes.filter(n => n.id.startsWith('ec-kind-')).map(n => n.props.stereotypes[0]),
    ['functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint'], 'each of Mermaid\'s five kinds');
  assert.equal(r('ec-name').label.length, 40);
  // the frame with no subject names the model; with a package subject, the package, its box the frame
  assert.deepEqual(['edge-cases', 'ec-package'].map(v => layout(m, v).families[0].title), ['req [Model] Requirement, stress [Edge cases]', 'req [Package] Regulations [In a package]']);
  assert.match(describe(m, 'edge-cases'), /^Edge cases: a requirement diagram/);
});

test('block-definition-stress.json, edge-cases: each case of §15.3, and what the rules say of it', () => {
  const m = FIX['block-definition-stress'], b = id => node(m, id);
  assert.deepEqual(said(m), [
    ['warning', 'part-type', ['ec-odd', 'ec-odd.weight']], // a part typed by a value type
    ['error', 'constraint-type', ['ec-odd', 'ec-odd.eq']], // a constraint property typed by a block
    ['error', 'member-kinds', ['ec-bad-eq', 'ec-bad-eq.f']], // a flow property in a constraint block
    ['warning', 'part-agrees', ['ec-twice-part', 'ec-twice.part']], // a part member drawn also as a composite association, which disagrees
    ['error', 'general-kinds', ['ec-gen-kinds', 'ec-mass', 'ec-part']], // a generalization between a value type and a block
  ]);
  const g = layout(m, 'edge-cases'), comps = id => g.byId[id].compartments.map(c => c.name);
  assert.deepEqual(comps('ec-all'), ['parts', 'references', 'values', 'constraints', 'operations', 'ports'], 'a block with every compartment');
  assert.deepEqual(comps('ec-signals'), ['flow properties'], 'an interface block');
  assert.deepEqual(comps('ec-balance'), ['constraints', 'parameters'], 'a constraint block owning a constraint property');
  assert.deepEqual(comps('ec-mass'), ['quantity'], 'a value type with its unit and quantity kind');
  assert.deepEqual(b('ec-signals').members.map(x => x.props.direction), ['in', 'out', 'inout'], 'flow properties of each direction');
  assert.deepEqual(b('ec-all').members.filter(x => x.type === 'sysml.Port').map(x => [x.props.kind, x.props.valueType]), [['proxy', 'Signals'], ['full', 'Part'], ['proxy', '~Signals']], 'proxy, full and conjugated ports');
  assert.equal(b('ec-big').members.length, 40, 'a block of 40 rows');
  assert.deepEqual(g.families.filter(f => f.id !== 'edge-cases->frame').map(f => [f.id, f.nodeIds]), [['ec-pkg', ['ec-in-pkg-a', 'ec-in-pkg-b']]], 'a package holding blocks, a box in the frame');
});

test('internal-block-stress.json, edge-cases: each case of §15.3, and what the rules say of it', () => {
  const m = FIX['internal-block-stress'];
  assert.deepEqual(said(m), [
    ['warning', 'part-type', ['ec-sys.loose', 'ec-sys']], // a part typed by no block, its ports from its connectors only
    ['error', 'connector-part', ['ec-lacking', 'ec-sink.ret', 'ec-sys.src']], // a connector through a part to a port its type lacks
    ['error', 'connector-part', ['ec-lacking', 'ec-source.out', 'ec-sys.sink']],
  ], 'nothing else: the delegation to the frame\'s port is not warned');
  const g = layout(m, 'edge-cases'), e = id => m.edges.find(x => x.id === id);
  assert.deepEqual(['ec-flow-ft', 'ec-flow-tf'].map(id => e(id).props.itemFlow.direction), ['from-to', 'to-from'], 'item flows each way');
  assert.deepEqual(['ec-flow-ft', 'ec-flow-tf'].map(id => g.edges.find(x => x.id === id).label), ['Power', 'Heat'], 'each item the line\'s label');
  assert.equal(g.byId['ec-sys.peer'].shared, true, 'a reference part, drawn dashed');
  assert.ok(g.byId['ec-sys.mass'], 'a value property');
  assert.deepEqual(['ec-sys.src->ec-source.out', 'ec-sys.src->ec-source.back', 'ec-sys.sink->ec-sink.in'].map(id => g.byId[id].nameBox.text),
    ['«proxy» out : PowerIf', '«full» back : Sink', '«proxy» in : ~PowerIf'], 'proxy, full and conjugated ports');
  assert.equal(m.edges.filter(x => x.from === 'ec-source.both').length, 2, 'two connectors on one port');
  assert.equal(g.byId['ec-sys.plug'].owner, 'ec-sys', 'the frame\'s port, a delegation\'s end');
  assert.deepEqual(g.nodes.filter(n => n.id.startsWith('ec-sys.loose->')).map(n => n.id), ['ec-sys.loose->ec-source.out'], 'a part typed by no block shows the port its connector reaches');
  const bare = layout(m, 'ec-ports-only');
  assert.deepEqual([bare.families.map(f => f.shape), bare.nodes.map(n => [n.id, n.owner])], [['sysml-frame'], [['ec-bare.a', 'ec-bare'], ['ec-bare.b', 'ec-bare']]], 'a subject with ports and no parts: still a frame, its ports on it');
});

test('parametric-stress.json, edge-cases: each case of §15.3, and what the rules say of it', () => {
  const m = FIX['parametric-stress'];
  assert.deepEqual(said(m), [
    ['error', 'binding-parameter', ['ec-lacks', 'ec-long.p', 'ec-sys.h2']], // a binding to a parameter the type lacks
    ['warning', 'parameter-bound', ['ec-half.y', 'ec-sys.h2']], // an unbound parameter
  ], 'nothing else: the parameter bound twice, the binding between two values, the nested constraint block are fine');
  const top = layout(m, 'ec-constraint-block');
  assert.deepEqual(top.nodes.filter(n => n.owner === 'ec-top').map(n => n.id).sort(), ['ec-top.in', 'ec-top.out'], 'a constraint block subject: its parameters on its frame');
  assert.equal(top.nodes.filter(n => n.shape === 'sysml-constraint').length, 2, 'built from constraint properties of another constraint block');
  assert.equal(m.edges.filter(e => e.to === 'ec-half.x' && e.props.ends.to.part === 'ec-sys.h1').length, 2, 'a parameter bound twice');
  assert.deepEqual(m.edges.filter(e => node(m, 'ec-sys').members.filter(x => x.type === 'sysml.ValueProperty').map(x => x.id).includes(e.to)).map(e => e.id), ['ec-values'], 'a binding between two values');
  assert.deepEqual(['ec-sys.h1', 'ec-sys.h2'].map(id => node(m, 'ec-sys').members.find(x => x.id === id).props.valueType), ['Half', 'Half'], 'two constraint properties of one type');
  const long = node(m, 'ec-long').props.constraint, g = layout(m, 'edge-cases'), markup = mapContext(m).buildView('edge-cases').markup;
  assert.equal(long.length, 120);
  assert.ok(g.byId['ec-sys.long'].aria.includes(`{${long}}`), 'a 120-character expression, whole in its name');
  assert.ok(!markup.includes(`>{${long}}<`) && /\{p = a \* b[^<]*…</.test(markup), 'and cut to its box');
});

test('the stress views all are §14\'s P1 sizes', () => {
  const on = (f, v = V(FIX[f], 'all')) => new Set(v.nodeIds), ln = (f, ok) => FIX[f].edges.filter(ok).length, sub = f => node(FIX[f], 's').members;
  const req = FIX['requirement-stress'], shown = on('requirement-stress');
  assert.deepEqual([req.nodes.filter(n => shown.has(n.id) && n.type === 'sysml.Requirement').length, ln('requirement-stress', e => shown.has(e.from) && shown.has(e.to))], [50, 60]);
  const bd = on('block-definition-stress');
  assert.deepEqual([bd.size, ln('block-definition-stress', e => bd.has(e.from) && bd.has(e.to))], [50, 57]);
  assert.deepEqual([sub('internal-block-stress').filter(x => x.type === 'sysml.PartProperty').length, ln('internal-block-stress', e => !e.id.startsWith('ec-'))], [30, 60]);
  const s = sub('parametric-stress'), cps = s.filter(x => x.type === 'sysml.ConstraintProperty');
  assert.deepEqual([cps.length, cps.reduce((k, c) => k + node(FIX['parametric-stress'], 'k' + c.props.valueType.slice(2)).members.length, 0), s.filter(x => x.type === 'sysml.ValueProperty').length, ln('parametric-stress', e => !e.id.startsWith('ec-'))], [16, 48, 30, 60]);
});

// §14: per type, its common edits on the stress fixture's all
const T = t => diagramOf({ diagram: `sysml.${t}` });
const EDITS = {
  requirement: { 'a text edited': k => [{ op: 'set', id: 'r12', path: 'props.text', value: 'The system shall '.repeat(4 + k) }],
    'a satisfy added': k => [{ op: 'add', element: { id: `sx${k}`, type: 'sysml.Satisfy', from: 'b0', to: `r${k + 20}` }, view: 'all' }],
    'a containment line deleted': (k, M) => T('requirement').edits.remove(M, V(M, 'all'), [`r${5 * (k % 10)}->r${5 * (k % 10) + 1}`], false).commands },
  'block-definition': { 'a value row added': k => [{ op: 'add', element: { id: `b7.v${k}`, type: 'sysml.ValueProperty', label: `v${k}`, props: { valueType: 'Real' } }, owner: 'b7' }],
    'a block renamed': k => [{ op: 'set', id: 'b9', path: 'label', value: 'Renamed'.repeat(1 + k) }] },
  'internal-block': { 'an item flow set': k => [{ op: 'set', id: 'c1', path: ['props', 'itemFlow'], value: { item: 'Flow' + 'x'.repeat(k + 1), direction: 'to-from' } }],
    'a part added': (k, M) => T('internal-block').edits.add(M, V(M, 'all'), T('internal-block').elements[0], `extra${k} : Type1`, null) },
  parametric: { 'a binding added': k => [{ op: 'add', element: { id: `x${k}`, type: 'sysml.BindingConnector', from: `s.v${k}`, to: 'k0.a', props: { ends: { to: { part: 's.c0' } } } } }],
    'a constraint property\'s type changed': k => [{ op: 'set', id: 's.c1', path: 'props.valueType', value: `Eq${2 + (k % 2)}` }] },
};
test('§14\'s budgets on each stress view all: a full layout and its SVG under 1 s; each common edit, laid out and drawn, under CI\'s 1 s ceiling, the 100 ms target printed (CPU, best of seven after a warm-up) (timed)', () => {
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const out = [];
  quiet(() => { for (const t of TYPES) {
    const M = FIX[`${t}-stress`], memos = {}, draw = m => mapContext(m, { memos }).buildView('all').markup;
    draw(M); Object.values(EDITS[t]).forEach(f => draw(apply(M, f(20, M)))); // the warm-up
    const runs = [0, 1, 2, 3, 4, 5, 6].map(k => ({ full: timed(() => mapContext(M).buildView('all').markup),
      ...Object.fromEntries(Object.entries(EDITS[t]).map(([n, f]) => { const e = apply(M, f(k, M)); return [n, timed(() => draw(e))]; })) }));
    const best = k => Math.min(...runs.map(r => r[k]));
    for (const k of Object.keys(runs[0])) assert.ok(best(k) < 1000, `${t} ${k} ${best(k)} ms`);
    out.push(`${t}: ${Object.keys(EDITS[t]).map(k => `${k} ${best(k).toFixed(1)} ms`).join(', ')}, full layout and SVG ${best('full').toFixed(1)} ms`);
  } });
  console.log(`# P1 target 100 ms (milestone 3's fixtures): ${out.join('; ')}`);
});

test('DoD 1: the registry holds the four types, and the JSON Schema and the types name their vocabulary', () => {
  const schema = readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'), dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  const S = JSON.parse(schema).$defs, np = S.node.properties.props.anyOf[0].properties, ep = S.edge.properties.props.anyOf[0].properties;
  const mp = S.node.properties.members.anyOf[0].items.anyOf[0].properties.props.anyOf[0].properties; // a member's
  for (const t of TYPES) {
    const name = `sysml.${t}`, D = diagramOf({ diagram: name });
    assert.equal(D && D.name, name);
    assert.ok(S.view.properties.diagram.examples.includes(name) && dts.includes(`'${name}'`), `the schema's view.diagram and the types name ${name}`);
    for (const x of [...D.elements, ...D.lines].map(x => x.type).filter(x => x !== 'containment')) assert.ok(schema.includes(`"${x}"`) && dts.includes(`'${x}'`), `${name}: ${x}`);
    for (const [ty, fields] of Object.entries(D.props || {})) for (const f of fields) { const k = (f.key || f.path.join('.')).split('.');
      assert.ok(np[k.at(-1)] || mp[k.at(-1)] || ep[k.at(-1)] || ep[k[0]], `${name}: ${ty}'s ${k.join('.')} in the schema`); }
  }
  assert.ok(['SysmlElementType', 'SysmlRequirementProps', 'SysmlPortProps', 'SysmlItemFlow'].every(k => new RegExp(`export (type|interface) ${k} `).test(dts)));
  assert.match(np.risk.description, /low.*medium.*high/i);
  assert.match(ep.itemFlow.description, /from-to.*to-from/);
});
