// Stage 6's fixtures (work package 6.6, notes/stage-6.md §11): tests/profile-minimal.json, profile-stress.json,
// timing-minimal.json and timing-stress.json. A stress file's view edge-cases holds each case §11 lists; its view all is
// §11's P1 view, the generator tests/profile.test.mjs and tests/timing.test.mjs time, written out. timing-stress.json's
// view dense holds §11's "a view from 0 to 1,000,000 with changes 1 apart" on a view of its own, so the cap does not
// squeeze the other cases. A profile view is laid out right and down with no line through a node but its own two ends,
// and what check() finds pinned (the crossings that turning port repair and rerouting off leaves on the generated view
// all, §12). A timing view is held to §11's timing predicate, not the layout check (§6.5), with the ruler's own problems
// (timing-dense, timing-label) pinned. Then §12's budgets in CPU time, best of seven after a warm-up: a full layout and
// its SVG under 1 s; the common edits under CI's 1 s ceiling, printed against the 100 ms target. tests/stage6.html draws
// every view in Chrome under three fonts and both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { appliedOf } from '../src/uml/stereotypes.js';
import { diagramOf } from '../src/core/registry.js';
import '../src/uml/profile.js';
import { TM_TYPE, tmMoveTo, tmRename, tmAdd } from '../src/uml/timing.js';

const read = f => JSON.parse(readFileSync(new URL(`./${f}.json`, import.meta.url), 'utf8'));
const FIX = Object.fromEntries(['profile', 'timing'].flatMap(t => ['minimal', 'stress'].map(k => [`${t}-${k}`, read(`${t}-${k}`)])));
const V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id);
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });
const said = m => validate(m).map(p => [p.level, p.rule || null, p.ids || null]);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (b, B, k = .5) => b.x >= B.x - k && b.y >= B.y - k && b.x + b.w <= B.x + B.w + k && b.y + b.h <= B.y + B.h + k;
const segs = pts => pts.slice(1).map((q, k) => { const p = pts[k]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }; });

// ---- the profile views: no line through a node but its own two ends; check()'s findings, crossings counted apart
function profileClean(m, vid) {
  const g = layout(m, vid), bad = [];
  g.edges.forEach(e => segs(e.pts).forEach(s => g.nodes.forEach(n => { if (![e.from, e.to].includes(n.id) && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); })));
  const found = check(m, vid).map(p => p.message);
  return [found.filter(p => / cross$/.test(p)).length, found.filter(p => !/ cross$/.test(p)), bad];
}
// [crossings, check()'s other findings, lines through nodes]: only the generated view all crosses (§12's repair and
// rerouting off), stated in docs/conformance/uml-profile.md
const PINNED = {
  'profile-minimal': { v: { right: [0, [], []], down: [0, [], []] } },
  'profile-stress': { 'edge-cases': { right: [0, [], []], down: [0, [], []] }, all: { right: [17, [], []], down: [30, [], []] } },
};

test('every profile view, right and down: no line through a node, check()\'s findings only as pinned (the generated view\'s crossings)', () => {
  const seen = {};
  for (const f of ['profile-minimal', 'profile-stress']) for (const v of FIX[f].views) for (const d of ['right', 'down']) ((seen[f] ||= {})[v.id] ||= {})[d] = profileClean(turned(FIX[f], v.id, d), v.id);
  if (process.env.PIN) console.log(JSON.stringify(seen));
  assert.deepEqual(seen, PINNED);
});

// ---- §11's timing predicate on the type's geometry (tests/timing.test.mjs's, for any view): steps and state rows in their
// lanes, every message's ends on its lanes' levels within 1 px, no message label over a step, a value, a state row or
// another label unless the ruler said so (timing-label), every constraint's label in a strip, every node in the bounds
function timingUnclean(m, vid) {
  const g = layout(m, vid), o = g.tr, v = V(m, vid), TL = v.timeline, bad = [], lane = id => o.lanes.find(l => l.id === id);
  const said = new Set(o.problems.filter(p => p.rule === 'timing-label').flatMap(p => p.ids)), drawn = new Set(o.changes.map(c => c.id));
  const level = (id, t) => { const l = lane(id), c = TL.changes.filter(x => x.lifeline === id && x.at <= t && drawn.has(x.id)).sort((a, b) => a.at - b.at).pop();
    return !c || (v.present || {})[id]?.as === 'values' ? l.y + l.h / 2 : l.rows.find(r => r.state === c.state).y; };
  const steps = o.steps.flatMap(s => segs(s.pts).map(b => { if (!within(b, lane(s.lane))) bad.push(`a step of ${s.lane} leaves its lane`); return b; }));
  const rows = g.nodes.filter(n => n.shape === 'tm-row');
  rows.forEach(r => { if (!within(r, lane(r.id.split('->')[0]))) bad.push(`row ${r.id} leaves its lane`); });
  const vals = o.bands.flatMap(b => { const l = lane(b.lane); return b.segs.filter(s => s.text != null).map(s => ({ x: s.x0 + 6, y: l.y + l.h / 2 - 7, w: s.x1 - s.x0 - 12, h: 14 })); });
  g.edges.forEach((e, i) => { const p = v.edges.find(x => x.id === e.id).props;
    if (Math.abs(e.pts[0][1] - level(e.from, p.sentAt)) > 1) bad.push(`${e.id} starts off ${e.from}'s level`);
    if (Math.abs(e.pts.at(-1)[1] - level(e.to, p.receivedAt)) > 1) bad.push(`${e.id} ends off ${e.to}'s level`);
    if (!e.lbl || said.has(e.id)) return;
    [...steps, ...vals, ...rows].forEach(b => { if (meets(e.lbl, b)) bad.push(`${e.id}'s label meets ${b.id || 'a step or a value'}`); });
    g.edges.slice(0, i).forEach(f => { if (f.lbl && meets(e.lbl, f.lbl)) bad.push(`${e.id}'s label meets ${f.id}'s`); }); });
  g.nodes.filter(n => n.shape === 'tm-mark').forEach(n => { if (!o.lanes.some(l => n.lbl.y >= l.strip.y - .01 && n.lbl.y + n.lbl.h <= l.strip.y + l.strip.h + .01)) bad.push(`${n.id}'s label is in no strip`); });
  g.nodes.forEach(n => { if (!within(n, g.bounds)) bad.push(`${n.id} out of the bounds`); });
  return { g, bad, problems: g.problems.map(p => [p.rule, p.ids.length]) };
}

// the generated view all crowds 100 messages on 12 lanes: three labels of messages sent at 0 to 20 ms sit over the state
// column's names, and two over a step, which the ruler's label search (§6.5) does not count; stated in
// docs/conformance/uml-timing.md as limits of a crowded view, not of the examples or edge-cases
const CROWDED = ["m0's label meets L0->Waiting", "m1's label meets L3->Waiting", "m2's label meets L6->Idle", "m42's label meets a step or a value", "m78's label meets a step or a value"];
test('every timing view: §11\'s timing predicate holds (on all, but its five crowded labels, pinned); the ruler\'s own problems only as pinned (a value cut, the capped view, the stress view\'s labels it could not place)', () => {
  const seen = {};
  for (const f of ['timing-minimal', 'timing-stress']) for (const v of FIX[f].views) { const r = timingUnclean(FIX[f], v.id);
    assert.deepEqual(r.bad, f === 'timing-stress' && v.id === 'all' ? CROWDED : [], `${f} ${v.id}`);
    const by = {}; r.problems.forEach(([rule]) => { by[rule] = (by[rule] || 0) + 1; }); (seen[f] ||= {})[v.id] = by; }
  assert.deepEqual(seen, { 'timing-minimal': { v: {} }, 'timing-stress': { 'edge-cases': { 'timing-dense': 1 }, dense: { 'timing-dense': 1 }, all: { 'timing-label': 43 } } });
});

test('the minimal fixtures: what §11 says each holds, and no problem', () => {
  for (const f of ['profile-minimal', 'timing-minimal']) assert.deepEqual(said(FIX[f]), [], f);
  const p = FIX['profile-minimal'];
  assert.deepEqual(['prof', 'st', 'mc', 'pkg', 'cls'].map(id => node(p, id).type), ['uml.Profile', 'uml.Stereotype', 'uml.MetaclassReference', 'uml.Package', 'uml.Class']);
  assert.deepEqual(appliedOf(p, 'cls').map(e => [e.key, e.tags.map(t => [t.name, t.value])]), [['entity', [['table', 'orders']]]], 'a class applying the stereotype, its tag set');
  const t = FIX['timing-minimal'], g = layout(t, 'v');
  assert.deepEqual([g.tr.lanes.length, g.tr.lanes[0].rows.map(r => r.state), g.tr.changes.length, g.tr.ruler.unit], [1, ['Off', 'On'], 2, 's'], 'one lifeline, two states, two changes, the ruler');
});

test('profile-stress.json, edge-cases: each case of §11, and what the cross-model check says of each', () => {
  const m = FIX['profile-stress'], has = id => appliedOf(m, id).map(e => e.key);
  assert.deepEqual(said(m), [
    ['warning', 'metaclass-known', ['ec-mc-gizmo']], // a metaclass name not in the table
    ['warning', 'tag-defined', ['ec-c-chain', 'ec-leaf']], // a tag no stereotype defines
    ['error', 'stereotype-abstract', ['ec-c-abs', 'ec-abs']], // an abstract stereotype applied
    ['warning', 'stereotype-applied', ['ec-c-outside', 'ec-conv']], // applied outside the applying package
    ['warning', 'tag-defined', ['ec-c-outside']], // and so its tags are under no stereotype it has
    ['warning', 'stereotype-unknown', ['ec-c-unknown']], // an unknown name in scope
    ['warning', 'stereotype-ambiguous', ['ec-c-amb', 'ec-conv', 'ec-other']], // two applied profiles' name, plain
    ...['b', 'i', 'r', 'u', 'e'].map(k => ['warning', 'tag-value', ['ec-c-wrong', `ec-typed.${k}`]]), // every checked type, wrong
    ['warning', 'tag-required', ['ec-c-missing', 'ec-needs.code']], // a required tag missing
    ['warning', 'stereotype-required', ['ec-i-unmet', 'ec-areq']], // an abstract required stereotype, met by no specialization
  ], 'nothing else: the chain, the classifier, the standard name, the qualified name, the right values, the nested package, the long name, the two names, Entity and «use» are fine');
  assert.deepEqual(appliedOf(m, 'ec-c-chain').map(e => [e.key, e.tags.map(t => t.name)]), [['ecLeaf', ['owner', 'level']], ['ecAudited', ['audited']]], 'a chain of three: tags inherited from both generals; the required one supplied');
  assert.deepEqual(has('ec-c-plain'), ['ecAudited'], 'a required extension on a class that lists nothing');
  assert.deepEqual(has('ec-comp'), ['ecKind', 'ecAudited'], 'a stereotype on Classifier applied to a component (a Class, so the required one too)');
  assert.deepEqual([has('ec-c-std'), has('ec-c-qual'), has('ec-c-deep'), has('ec-c-ent')], [['ecAudited'], ['EcOther::shared', 'ecAudited'], ['ecBase', 'ecAudited'], ['entity', 'ecAudited']],
    'a standard name a keyword; qualified, fine; two deep under the applying package; entity meets Entity (first letter)');
  assert.deepEqual(appliedOf(m, 'ec-c-two').filter(e => e.key !== 'ecAudited').map(e => [e.key, e.tags.map(t => [t.name, t.value])]), [['ecNamed', [['name', 'first']]], ['ecTitled', [['name', 'second']]]], 'two stereotypes both defining name, each its value');
  assert.deepEqual([has('ec-c-chain.code'), m.edges.find(e => e.id === 'ec-dep').props.stereotypes, m.edges.find(e => e.id === 'ec-use').props.stereotypes], [['ecColumn'], ['ecLink'], ['use']], 'a member and a line applying stereotypes; «use» a keyword');
  assert.deepEqual([has('ec-i-met'), has('ec-i-unmet')], [['ecProvider'], []], 'an abstract required stereotype met by a specialization on one interface, missing on the other');
  assert.equal(node(m, 'ec-long').label.length, 40);
  const g = layout(m, 'edge-cases');
  assert.ok(g.byId['ec-long'].w > 200 && g.byId['ec-c-long'], 'a 40-character stereotype name drawn whole');
  const box = id => g.families.find(f => f.id === id);
  assert.ok(within(box('ec-sub2'), box('ec-sub1')) && within(box('ec-sub1'), box('ec-pkg')) && within(g.byId['ec-c-deep'], box('ec-sub2')), 'a package nested two deep');
  assert.match(describe(m, 'edge-cases'), /Class RightValues: «ecTyped» b = true, i = -3, r = 2\.5, u = \*, e = high, s = any text/);
});

test('timing-stress.json, edge-cases and dense: each case of §11', () => {
  const m = FIX['timing-stress'], g = layout(m, 'edge-cases'), o = g.tr, lane = id => o.lanes.find(l => l.id === id), x = id => o.changes.find(c => c.id === id).x;
  assert.deepEqual(said(m), [['warning', 'change-instant', ['ec-a2', 'ec-a3']], ['error', 'message-times', ['ec-m-back']], ['warning', 'constraint-order', ['ec-back', 'ec-b1', 'ec-b0']]],
    'two changes at one instant on one lifeline, a message received before sent, a constraint whose to is earlier; nothing else');
  assert.equal(x('ec-a1'), x('ec-b1'), 'two lifelines change at one instant, at one x (T)');
  assert.ok(!o.changes.some(c => c.id === 'ec-a2') && o.changes.some(c => c.id === 'ec-a3'), 'of two at one instant on one lifeline, the id sorting last is drawn');
  assert.equal(o.scale.t0, -50, 'a change before 0: the ruler starts there');
  assert.deepEqual([o.bands.map(b => b.lane), lane('ec-v').rows], [['ec-v'], []], 'a values lifeline, beside states lifelines');
  const line = id => o.lines.find(l => l.id === id).pts;
  assert.equal(line('ec-m-instant')[0][0], line('ec-m-instant')[1][0], 'sent and received at one instant: upright');
  assert.ok(line('ec-m-values')[1][1] > lane('ec-v').y && line('ec-m-values')[1][1] < lane('ec-v').y + lane('ec-v').h, 'a message from a states lifeline into the values one');
  assert.equal(V(m, 'edge-cases').edges.find(e => e.id === 'ec-m-reply').props.replyTo, 'ec-m-call', 'a reply');
  assert.equal(line('ec-m-self')[0][1], line('ec-m-self')[1][1], 'a message within one lane');
  const dim = id => o.marks.find(k => k.id === id).pts[1][1];
  assert.ok(new Set(['ec-d1', 'ec-d2', 'ec-d3'].map(dim)).size >= 2 && ['ec-d1', 'ec-d2', 'ec-d3'].every(id => dim(id) >= lane('ec-a').strip.y && dim(id) <= lane('ec-a').strip.y + lane('ec-a').strip.h), 'overlapping durations on one lane: levels in its strip');
  const s = lane('ec-b').strip; assert.ok(dim('ec-across') >= s.y && dim('ec-across') <= s.y + s.h, 'a duration across two lanes: in the lower lane\'s strip');
  assert.equal(o.marks.find(k => k.id === 'ec-tc').kind, 'time', 'a time constraint');
  assert.equal(lane('ec-twenty').rows.length, 20, 'a lifeline of 20 states');
  assert.deepEqual(o.bands[0].segs.filter(v => v.cut).map(v => v.text), ['a value of exactly forty characters long'], 'a 40-character value in a short segment, cut');
  assert.deepEqual([o.steps.some(st => st.lane === 'ec-none'), !!lane('ec-none')], [false, true], 'a lifeline with no change: its lane, no step');
  assert.deepEqual([V(m, 'edge-cases').timeline.unit, o.ruler.unit], [undefined, null], 'no unit');
  const d = layout(m, 'dense').tr;
  assert.deepEqual([d.scale.t1 - d.scale.t0 >= 1e6, Math.round((d.ruler.x1 - d.ruler.x0)), d.problems.map(p => [p.rule, p.ids])], [true, 4800, [['timing-dense', ['ec-dn1', 'ec-dn2', 'ec-dn3']]]], 'from 0 to 1,000,000 with changes 1 apart: capped at 4,800 px, the crowded ones named');
});

test('the views all: §11\'s sizes, every element shown', () => {
  const p = FIX['profile-stress'], pv = V(p, 'all'), types = t => pv.nodeIds.filter(id => node(p, id).type === t).length;
  assert.deepEqual([types('uml.Profile'), types('uml.Stereotype'), types('uml.MetaclassReference') + types('uml.Class'), p.edges.filter(e => !e.id.startsWith('ec-')).length], [3, 40, 50, 60]);
  const t = FIX['timing-stress'], tv = V(t, 'all');
  assert.deepEqual([tv.nodeIds.length, tv.timeline.changes.length, tv.edges.length, tv.timeline.constraints.length], [12, 400, 100, 40]);
  assert.deepEqual([layout(p, 'all').nodes.length + layout(p, 'all').families.length, layout(t, 'all').tr.changes.length], [96, 400]);
});

test('DoD 1: the registry holds both types, and the JSON Schema and the types name their vocabulary', () => {
  const schema = readFileSync(new URL('../lib/umlimator.schema.json', import.meta.url), 'utf8'), dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  const S = JSON.parse(schema).$defs;
  for (const name of ['uml.profile', 'uml.timing']) {
    const T = diagramOf({ diagram: name });
    assert.equal(T && T.name, name);
    assert.ok(S.view.properties.diagram.examples.includes(name), `the schema's view.diagram names ${name}`);
    // the timing palette's Change is the entry uml.StateInvariant, which writes a timeline item, never a node of that type (§8.2)
    for (const t of [...T.elements, ...T.lines].map(x => x.type).filter(t => t !== 'uml.StateInvariant')) assert.ok(schema.includes(t) && dts.includes(`'${t}'`), `${name}: ${t}`);
    for (const [t, fields] of Object.entries(T.props)) for (const f of fields) assert.ok(schema.includes(`"${f.key.split('.')[0]}"`), `${name}: ${t}'s ${f.key} in the schema`);
  }
  const np = S.node.properties.props.anyOf[0].properties;
  assert.ok(np.tags && np.states && S.edge.properties.props.anyOf[0].properties.sentAt && S.view.properties.timeline.anyOf[0].properties.changes, 'tags, states, sentAt and the timeline described');
  assert.ok(['UmlProfileElementType', 'UmlTags', 'UmlStereotypedProps', 'UmlExtensionProps', 'UmlTimingElementType', 'UmlTimeline', 'UmlTimingPresent'].every(k => new RegExp(`export (type|interface) ${k} `).test(dts)));
});

// ---- §12: budgets, in this process's CPU time, best of seven after a warm-up
const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
function budgets(f, edits) {
  const m = FIX[f], runs = [];
  for (let i = 0; i < 8; i++) { // the first is a warm-up
    const memos = {}, t = {};
    [, t.full] = cpu(() => mapContext(m, { memos }).buildView('all').markup);
    for (const [k, c] of Object.entries(edits)) { const e = apply(m, c(m, i)); let out; [out, t[k]] = cpu(() => mapContext(e, { memos }).buildView('all').markup); assert.match(out, /^<svg /, k); }
    if (i) runs.push(t);
  }
  const best = k => Math.min(...runs.map(t => t[k]));
  console.log(`# ${f} all, CPU ms, best of seven: full ${best('full').toFixed(1)}; ${Object.keys(edits).map(k => `${k} ${best(k).toFixed(1)}`).join('; ')} (target 100 ms each)`);
  assert.ok(best('full') < 1000, `full ${best('full')} ms`);
  for (const k of Object.keys(edits)) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
}
const cmds = r => (r && Array.isArray(r.commands) ? r.commands : r);

test('P1 (§12): profile-stress.json all: a full layout under 1 s; a tag value set and a stereotype added, laid out and drawn, printed against 100 ms (timed)', () => {
  budgets('profile-stress', { tag: (m, i) => [{ op: 'set', id: 'c4', path: ['props', 'tags', 'stereo4', 'tag4'], value: 'x'.repeat(4 + i) }],
    stereotype: (m, i) => [{ op: 'set', id: 'c7', path: 'props.stereotypes', value: ['stereo7', `stereo${[1, 4, 10, 13, 16, 19, 22, 25][i]}`] }] });
});

test('P1 (§12): timing-stress.json all: a full layout under 1 s; a change moved one tick, a message renamed and a state added, laid out and drawn, printed against 100 ms (timed)', () => {
  const v = m => V(m, 'all'), entry = TM_TYPE.elements.find(e => e.type === 'uml.StateInvariant');
  budgets('timing-stress', { move: m => cmds(tmMoveTo(m, v(m), 'L3-c5', { by: [1, 0] })), rename: (m, i) => cmds(tmRename(m, v(m), 'm7', `renamed ${i}`)),
    state: (m, i) => cmds(tmAdd(m, v(m), entry, `Fresh${i}`, { sel: ['L5-c9'] })) });
});
