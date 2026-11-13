// Stage 4's fixtures (work package 4.10, notes/stage-4.md §16): for each of the use case, activity, state machine and
// interaction overview diagrams, tests/<type>-minimal.json and tests/<type>-stress.json, whose view edge-cases holds each
// case §16 lists and whose view all is §17's stress view (the generator each type's own test times, written out). Each
// view is laid out right and down with no overlap (check()), no line through a node or a lane's header but its own two
// ends, every line drawn once with both ends on their shapes' outlines (the drawn path, within 1 px), every node in its own
// lane, and what check() finds pinned here: the crossings that turning port repair off leaves (§17), and the few other
// findings it leaves, each stated in its type's conformance note. Then §17's budgets in CPU time, best of three after a
// warm-up: a full layout and its SVG under 1 s; the common edit and an edit that moves nothing under a 1 s ceiling, with
// their time printed against S15's 100 ms (the repository's rule for CI timing, from the maintainer's decision of 13 Nov
// 2026 on the wired state machine: CI runners are 2 to 5 times slower than a laptop; docs/conformance records the laptop's
// figures, at a load average of 6 to 8); each inline time axis and the Mermaid state reader and writer (500 transitions
// each way) under the same ceiling, printed against 5 ms and 100 ms. tests/stage4.html draws every view in Chrome under three
// fonts and both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apply } from '../src/core/apply.js';
import { SHAPE } from '../src/draw/shapes.js';
import '../src/map/typed.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import '../src/uml/usecase.js';
import { actRename, actMoveTo } from '../src/uml/activity.js';
import { stActivityRow } from '../src/uml/state.js';
import { ovRename } from '../src/uml/overview.js';
import { sqInput } from '../src/uml/sequence.js';
import { layoutTimeAxis } from '../src/layout/timeaxis.js';
import { readMermaidState, writeMermaidState } from '../src/readers/mermaid-state.js';

const read = f => JSON.parse(readFileSync(new URL(`./${f}.json`, import.meta.url), 'utf8'));
const TYPES = ['usecase', 'activity', 'state', 'overview'];
const FIX = Object.fromEntries(TYPES.flatMap(t => ['minimal', 'stress'].map(k => [`${t}-${k}`, read(`${t}-${k}`)])));
const V = (m, id) => m.views.find(v => v.id === id), node = (m, id) => m.nodes.find(n => n.id === id), edge = (m, id) => m.edges.find(e => e.id === id);
const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) });
const said = m => validate(m).map(p => [p.level, p.rule || null, p.ids || null]);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a, b) => a.x >= b.x - .5 && a.y >= b.y - .5 && a.x + a.w <= b.x + b.w + .5 && a.y + a.h <= b.y + b.h + .5;

// DoD 3 in Node, on one view laid out one way: what is wrong ("bad"), and what check() finds, crossings counted apart
function clean(m, vid) {
  const g = layout(m, vid), markup = mapContext(m).buildView(vid).markup, bad = [], fams = g.families || [];
  const by = id => g.byId[id] || fams.find(f => f.id === id);
  // no line runs through a node, or a partition's header strip, but its own two ends
  g.edges.forEach(e => e.pts.slice(1).forEach((q, k) => { const p = e.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 };
    g.nodes.forEach(n => { if (n.id !== e.from && n.id !== e.to && meets(s, { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 })) bad.push(`${e.id} runs through ${n.id}`); }); }));
  // every line drawn once, each end on its shape's outline: on the box's side, slid inward by the shape's inset (§4.2),
  // within 1 px; a box (an open state, a subject, a region) has none
  const ends = [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)];
  if (ends.length !== g.edges.length) bad.push(`${ends.length} lines drawn of ${g.edges.length}`);
  ends.forEach(([, from, to, , d]) => { const xs = d.match(/-?\d+(\.\d+)?/g).map(Number);
    [[xs.slice(0, 2), from], [xs.slice(-2), to]].forEach(([[x, y], id]) => { const n = by(id), S = n && SHAPE[n.shape];
      const k = (side, t) => (S && S.inset && !n.box && !fams.includes(n) ? S.inset(n, side, t) || 0 : 0);
      const on = n && [[n.x + k('L', y), x, y, 'v'], [n.x + n.w - k('R', y), x, y, 'v'], [n.y + k('T', x), y, x, 'h'], [n.y + n.h - k('B', x), y, x, 'h']]
        .some(([want, got, t, o]) => Math.abs(want - got) <= 1 && (o === 'v' ? t >= n.y - 1 && t <= n.y + n.h + 1 : t >= n.x - 1 && t <= n.x + n.w + 1));
      if (!on) bad.push(`${from}>${to} ends off ${id}'s outline at ${x},${y}`); }); });
  // an activity view's lanes: each node inside the band of its innermost shown lane, and in no other
  const bands = new Map((g.bands || []).map(b => [b.id, b]));
  if (bands.size) g.nodes.filter(n => n.shape !== 'partition').forEach(n => {
    let lane = null; for (let p = (node(m, n.id) || {}).parent; p != null && lane == null; p = (node(m, p) || {}).parent) if (bands.has(p)) lane = p;
    const under = top => { for (let p = lane; p != null; p = (bands.get(p) || {}).parent) if (p === top) return true; return false; };
    bands.forEach(b => { if (under(b.id) && !within(n, b)) bad.push(`${n.id} is out of its lane ${b.id}`); if (!under(b.id) && meets(n, b) && !lane) bad.push(`${n.id}, in no lane, is in ${b.id}`); }); });
  const found = check(m, vid).map(p => p.message), crossings = found.filter(p => / cross$/.test(p)).length;
  return { g, markup, bad, crossings, other: found.filter(p => !/ cross$/.test(p)) };
}

// what check() finds on each view, laid out right and down: [crossings, other findings]. Port repair is off for the four
// types (§17): two lines that cross next to a shared side keep their ports. The other findings are on generated views
// (two lines between one pair, a guard beside the next decision's line) and one region's border (stated in the notes)
const PINNED = {
  'usecase-minimal': { v: { right: [0, []], down: [0, []] } },
  'usecase-stress': { 'edge-cases': { right: [1, []], down: [1, []] },
    all: { right: [2, ['view all: edges Use case number 5→Use case number 6 and Use case number 6→Use case number 5 share a line']], down: [4, []] } },
  'activity-minimal': { v: { right: [0, []], down: [0, []] } },
  'activity-stress': { 'edge-cases': { right: [1, []], down: [1, []] }, 'ec-take-payment': { right: [0, []], down: [0, []] }, all: { right: [9, []], down: [14, []] } },
  'state-minimal': { v: { right: [0, []], down: [0, []] } },
  'state-stress': { 'edge-cases': { right: [0, []], down: [1, ['view edge-cases: edge →Capturing payment runs along the border of family "Parcel"', 'view edge-cases: edge →Capturing payment runs along the border of family "Payment"']] },
    all: { right: [19, []], down: [26, []] } },
  'overview-minimal': { v: { right: [0, []], down: [0, []] } },
  'overview-stress': { 'edge-cases': { right: [0, []], down: [1, []] },
    all: { right: [0, []], down: [3, ['view all: label "[in stock]" lies on edge Check 0?→Use 0', 'view all: label "[in stock]" lies on edge Check 1?→Use 1', 'view all: label "[in stock]" lies on edge Check 2?→Use 2']] } },
};

test('every view of the eight fixtures lays out clean right and down: no line through a node or a header, every end on its outline, every node in its lane, check() finding only what is pinned', () => {
  const seen = {};
  for (const [f, m] of Object.entries(FIX)) for (const v of m.views.filter(v => v.diagram !== 'uml.sequence')) for (const d of ['right', 'down']) {
    const r = clean(turned(m, v.id, d), v.id);
    assert.deepEqual(r.bad, [], `${f} ${v.id} ${d}`);
    ((seen[f] ||= {})[v.id] ||= {})[d] = [r.crossings, r.other];
  }
  assert.deepEqual(seen, PINNED);
});

test('the minimal fixtures: what §16 says each holds, and no problem', () => {
  const types = (f, vid = 'v') => V(FIX[f], vid).nodeIds.map(id => node(FIX[f], id).type.slice(4));
  assert.deepEqual(types('usecase-minimal'), ['Actor', 'Subject', 'UseCase']);
  assert.equal(node(FIX['usecase-minimal'], 'browse').parent, 'shop');
  assert.deepEqual(types('activity-minimal'), ['InitialNode', 'Action', 'ActivityFinalNode']);
  assert.deepEqual(types('state-minimal'), ['Pseudostate', 'State', 'FinalState']);
  assert.deepEqual(types('overview-minimal'), ['InitialNode', 'InteractionUse', 'ActivityFinalNode']);
  assert.equal(V(FIX['overview-minimal'], node(FIX['overview-minimal'], 'use').opensView).diagram, 'uml.sequence');
  for (const t of TYPES) assert.deepEqual(said(FIX[`${t}-minimal`]), [], t);
  // the subject holds its use case: a box round it
  const g = layout(FIX['usecase-minimal'], 'v'), box = g.families.find(f => f.id === 'shop');
  assert.ok(box && within(g.byId.browse, box) && !within(g.byId.shopper, box));
});

test('usecase-stress.json, edge-cases: each case of §16, so it cannot be trimmed by accident', () => {
  const m = FIX['usecase-stress'], v = V(m, 'edge-cases'), g = layout(m, 'edge-cases'), shop = g.families.find(f => f.id === 'ec-shop');
  assert.ok(node(m, 'ec-help').parent == null && !within(g.byId['ec-help'], shop), 'a use case in no subject, drawn outside it (G3)');
  assert.deepEqual(['ec-g-actor', 'ec-g-case'].map(id => [node(m, edge(m, id).from).type, node(m, edge(m, id).to).type]), [['uml.Actor', 'uml.Actor'], ['uml.UseCase', 'uml.UseCase']], 'an actor\'s generalization; a use case\'s');
  assert.deepEqual([edge(m, 'ec-i1').to, edge(m, 'ec-i2').from], ['ec-pay', 'ec-pay'], 'an include chain');
  const into = m.edges.filter(e => e.type === 'uml.Extend' && e.to === 'ec-checkout');
  assert.deepEqual(into.map(e => [e.props.extensionPoints, !!e.props.condition]), [[['ec-checkout.payment'], true], [['ec-checkout.shipping'], false]], 'two extends into one base at two points, one with a condition');
  assert.equal(node(m, 'ec-browse').members.length, 6, 'six extension points');
  assert.match(g.byId['ec-browse'].label || node(m, 'ec-browse').label, /Browse/);
  const name = [...mapContext(m).buildView('edge-cases').markup.matchAll(/class="c-name" data-o="ec-bulk"[^>]*>([^<]*)</g)].map(x => x[1]);
  assert.deepEqual([name.length, name.join(' ')], [3, node(m, 'ec-bulk').label], 'a three-line name, whole');
  assert.ok(node(m, 'ec-partner').label.length > 60, 'a long actor name');
  assert.ok(v.nodeIds.includes('ec-back') && !v.nodeIds.includes('ec-restock') && !g.families.some(f => f.id === 'ec-back') && g.byId['ec-back'], 'a closed subject: drawn, not a box');
  assert.deepEqual(said(m), [['error', 'extend-points', ['ec-x-bad', 'ec-browse', 'ec-browse.missing']]], 'an extend naming a missing point; nothing else');
});

test('activity-stress.json, edge-cases: each case of §16', () => {
  const m = FIX['activity-stress'], v = V(m, 'edge-cases'), g = layout(m, 'edge-cases'), out = id => m.edges.filter(e => e.from === id);
  assert.deepEqual(out('ec-kind').map(e => (e.props || {}).guard ?? null), ['express', 'standard', null], 'a decision with three exits, one with no guard (warned)');
  assert.deepEqual([node(m, 'ec-sent').type, edge(m, 'ec-f17').to, node(m, 'ec-signed').type], ['uml.MergeNode', 'ec-signed', 'uml.DecisionNode'], 'a merge and a decision side by side');
  assert.deepEqual([out('ec-split').length, edge(m, 'ec-f8').to, node(m, 'ec-told').type, out('ec-told').length], [2, 'ec-told', 'uml.FlowFinalNode', 0], 'a fork with a branch that ends early in a flow final');
  assert.deepEqual(['ec-o2', 'ec-o3'].map(id => [edge(m, id).type, node(m, id === 'ec-o2' ? edge(m, id).to : edge(m, id).from).type]), [['uml.ObjectFlow', 'uml.ObjectNode'], ['uml.ObjectFlow', 'uml.ObjectNode']], 'an object flow through an object node');
  assert.equal(node(m, edge(m, 'ec-o1').from).type, 'uml.DataStoreNode', 'a data store');
  assert.deepEqual([node(m, 'ec-mail').type, node(m, 'ec-order').type], ['uml.SendSignalAction', 'uml.AcceptEventAction'], 'send and accept');
  assert.equal(V(m, node(m, 'ec-pay').opensView).diagram, 'uml.activity', 'a call behaviour action opening a view');
  const band = id => g.bands.find(b => b.id === id);
  assert.ok(within(band('ec-front'), band('ec-shop')) && within(band('ec-store'), band('ec-shop')) && band('ec-front').depth === 1, 'partitions nested two deep (L10)');
  assert.ok(!node(m, 'ec-done').parent && !g.bands.some(b => within(g.byId['ec-done'], b)), 'a node in no lane, outside every band');
  assert.ok(band('ec-bank') && !m.nodes.some(n => n.parent === 'ec-bank'), 'an empty lane keeps its band');
  const f = g.edges.find(e => e.id === 'ec-f11'), st = band('ec-store'), across = st.head.w < st.head.h ? 'y' : 'x';
  const span = f.pts.map(p => p[across === 'y' ? 1 : 0]);
  assert.ok(Math.min(...span) < st[across] && Math.max(...span) > st[across] + (across === 'y' ? st.h : st.w), 'a flow across three lanes: it crosses the warehouse\'s band');
  assert.deepEqual([edge(m, 'ec-f5').from, edge(m, 'ec-f5').to, node(m, 'ec-retry').type], ['ec-paid', 'ec-retry', 'uml.MergeNode'], 'a loop back through a merge');
  const ec = said(m).filter(([, , ids]) => ids && ids.some(id => String(id).startsWith('ec-') || id === 'edge-cases'));
  assert.deepEqual(ec, [['warning', 'decision-guards', ['ec-kind', 'ec-f13']], ['warning', 'in-lane', ['ec-done', 'edge-cases']]]);
  assert.ok(v.nodeIds.length > 20);
});

test('state-stress.json, edge-cases: each case of §16', () => {
  const m = FIX['state-stress'], v = V(m, 'edge-cases'), g = layout(m, 'edge-cases'), fam = id => g.families.find(f => f.id === id), kind = id => (node(m, id).props || {}).kind;
  assert.equal(edge(m, 'ec-t2').from, edge(m, 'ec-t2').to, 'a self-transition (F)');
  assert.equal(kind(edge(m, 'ec-t18').to), 'shallowHistory', 'a transition to a shallow history (F)');
  assert.deepEqual(m.edges.filter(e => e.from === 'ec-choice').map(e => e.props.guard), ['card authorised', 'fraud suspected'], 'a choice with no else (choice-guards warns only of an exit with no guard, or two elses)');
  assert.ok(fam('ec-ful.parcel') && fam('ec-ful.pay'), 'a composite with two regions, each a box (L11)');
  assert.deepEqual([node(m, 'ec-tracked').parent, node(m, 'ec-held').parent, edge(m, 'ec-t17').from, edge(m, 'ec-t17').to], ['ec-transit.track', 'ec-ship', 'ec-tracked', 'ec-held'], 'a transition from a substate to a state outside its composite');
  assert.deepEqual([edge(m, 'ec-t22').from, node(m, 'ec-label').parent], ['ec-delivered', 'ec-returns.a'], 'one into a substate from outside');
  assert.deepEqual([kind('ec-fork'), node(m, 'ec-picking').parent, node(m, 'ec-capturing').parent, kind('ec-join')], ['fork', 'ec-ful.parcel', 'ec-ful.pay', 'join'], 'a fork into two regions and a join out');
  assert.ok(fam('ec-ship') && fam('ec-transit') && fam('ec-hub') && within(fam('ec-hub'), fam('ec-transit')) && within(fam('ec-transit'), fam('ec-ship')), 'composites nested three deep');
  const placed = node(m, 'ec-placed');
  assert.deepEqual([Object.keys(placed.props), placed.members.length], [['entry', 'do', 'exit'], 3], 'a state with entry, do, exit and three internal transitions');
  assert.deepEqual(['ec-term', 'ec-junction', 'ec-deep'].map(kind), ['terminate', 'junction', 'deepHistory']);
  const long = g.edges.find(e => e.id === 'ec-t10');
  assert.ok(long.lbl.w <= 300 && /capture failed after the provider timed out three times \[attempts &lt; 3 and the card is still valid\] \/ count the attempt and schedule a retry/.test(mapContext(m).buildView('edge-cases').markup), 'a 300 px label: cut, its full text in its name');
  assert.deepEqual([edge(m, 'ec-t11').from, edge(m, 'ec-t11').to], [edge(m, 'ec-t10').from, edge(m, 'ec-t10').to], 'two transitions between one pair (F2)');
  assert.equal(node(m, 'ec-extra').parent, 'ec-returns', 'a state with regions and a direct substate (warned)');
  assert.ok(!v.nodeIds.includes('ec-cold') && g.byId['ec-archive'] && !fam('ec-archive') && /st-dec/.test(mapContext(m).buildView('edge-cases').markup), 'a closed composite, with its decomposition indicator');
  assert.deepEqual(stActivityRow(m, 'ec-held', 'entry / note the depot'), [{ op: 'set', id: 'ec-held', path: 'props.entry', value: 'note the depot' }], 'a row entry / x is read as the prop');
  assert.deepEqual(said(m), [['warning', 'region-mixed', ['ec-returns', 'ec-extra']], ['warning', 'composite-entry', ['ec-t15', 'ec-transit', 'ec-transit.leg', 'ec-transit.track']],
    ['warning', 'composite-entry', ['ec-t16', 'ec-hub', 'ec-hub.sort']], ['warning', 'composite-entry', ['ec-t21', 'ec-returns', 'ec-returns.a', 'ec-returns.b']], ['warning', 'composite-entry', ['ec-t23', 'ec-archive', 'ec-archive.r']]],
    'what it warns of; no error');
});

test('overview-stress.json, edge-cases: each case of §16', () => {
  const m = FIX['overview-stress'], g = layout(m, 'edge-cases'), sq = id => V(m, node(m, id).opensView);
  assert.deepEqual([edge(m, 'ec-f10').from, edge(m, 'ec-f10').to, node(m, 'ec-again').type], ['ec-ok', 'ec-again', 'uml.MergeNode'], 'a decision looping back through a merge');
  assert.deepEqual(m.edges.filter(e => e.from === 'ec-split').map(e => node(m, e.to).type), ['uml.Interaction', 'uml.InteractionUse'], 'a fork round an inline interaction and a use');
  assert.deepEqual(m.edges.filter(e => e.to === 'ec-both').map(e => e.from), ['ec-buy', 'ec-gone'], 'and a join');
  assert.equal(node(m, edge(m, 'ec-f12').to).type, 'uml.FlowFinalNode', 'a branch ending in a flow final');
  const buy = sq('ec-buy');
  assert.deepEqual([buy.nodeIds.length, buy.edges.filter(e => e.type === 'uml.Message').length, buy.fragments.length, buy.edges.filter(e => e.type === 'uml.InteractionUse').length], [6, 12, 1, 1],
    'an inline interaction of 6 lifelines and 12 messages, with a fragment and an interaction use in it');
  const markup = mapContext(m).buildView('edge-cases').markup;
  assert.match(markup, /alt/); assert.match(markup, /Log the order/);
  assert.equal(sq('ec-audit-all').nodeIds.length, 9, 'one of 9 lifelines');
  assert.ok(g.byId['ec-audit-all'].h < g.byId['ec-buy'].h, 'drawn as its frame only');
  assert.equal(V(m, node(m, 'ec-gone').opensView), undefined, 'a use whose view is missing');
  assert.deepEqual(said(m).filter(p => p[1]), [['warning', 'inline-size', ['ec-audit-all', 'ec-sq-audit']], ['error', 'opens-sequence', ['ec-gone']]]);
});

test('the views all: §16\'s sizes, and every element shown', () => {
  const count = (f, pred) => V(FIX[f], 'all').nodeIds.filter(id => pred(node(FIX[f], id))).length, lines = f => layout(FIX[f], 'all').edges.length;
  assert.deepEqual([V(FIX['usecase-stress'], 'all').nodeIds.length, lines('usecase-stress')], [50, 60]);
  assert.deepEqual([count('activity-stress', n => n.type !== 'uml.ActivityPartition'), lines('activity-stress'), count('activity-stress', n => n.type === 'uml.ActivityPartition')], [50, 60, 4]);
  assert.deepEqual([V(FIX['state-stress'], 'all').nodeIds.length, lines('state-stress')], [50, 60]);
  const sf = id => layout(FIX['state-stress'], 'all').families.find(f => f.id === id);
  assert.ok(sf('S.ac.ac') && within(sf('S.ac.ac'), sf('S.ac')) && within(sf('S.ac'), sf('S')), 'state: composites three deep');
  assert.deepEqual([V(FIX['overview-stress'], 'all').nodeIds.length, lines('overview-stress'), count('overview-stress', n => n.type === 'uml.Interaction')], [40, 50, 10]);
});

// ---- §17: budgets, in this process's CPU time, best of three after a warm-up
const cpu = f => { const c = process.cpuUsage(), out = f(), u = process.cpuUsage(c); return [out, (u.user + u.system) / 1000]; };
function timed(m, vid, edits) {
  const runs = [];
  for (let i = 0; i < 4; i++) { // the first is a warm-up
    const memos = {}, t = {};
    [, t.full] = cpu(() => mapContext(m, { memos }).buildView(vid).markup);
    for (const [k, c] of Object.entries(edits)) { const e = apply(m, c); let out; [out, t[k]] = cpu(() => mapContext(e, { memos }).buildView(vid).markup); assert.match(out, /^<svg /, k); }
    if (i) runs.push(t);
  }
  return k => Math.min(...runs.map(t => t[k]));
}
function budgets(f, edits) {
  const m = FIX[f], best = timed(m, 'all', edits);
  console.log(`# ${f} all, CPU ms, best of three: full ${best('full').toFixed(1)}; ${Object.keys(edits).map(k => `${k} ${best(k).toFixed(1)}`).join('; ')} (target 100 ms each)`);
  assert.ok(best('full') < 1000, `full ${best('full')} ms`);
  // the repository's rule for CI timing (from the maintainer's decision of 13 Nov 2026 on the wired state machine, §10.4):
  // a hard budget in CI is the 1 s ceiling, and the edit is printed against S15's 100 ms
  for (const k of Object.keys(edits)) assert.ok(best(k) < 1000, `${k} ${best(k)} ms`);
}

test('P1 (§17): usecase-stress.json all: a full layout under 1 s; a use case renamed and a stereotype set, laid out and drawn, printed against 100 ms (timed)', () => {
  budgets('usecase-stress', { rename: [{ op: 'set', id: 'u7', path: 'label', value: 'Case renamed' }], stereotype: [{ op: 'set', id: 'u9', path: 'props.stereotypes', value: ['manual'] }] });
});

test('P1 (§17): activity-stress.json all: a full layout under 1 s; a guard, a lane change and a stereotype, laid out and drawn, printed against 100 ms (timed)', () => {
  const m = FIX['activity-stress'], v = V(m, 'all'), g = layout(m, 'all'), b = g.bands[3];
  const lane = actMoveTo(m, v, 'n5', { pt: [b.x + b.w / 2, b.y + b.h / 2], geo: g });
  assert.deepEqual(lane, [{ op: 'reparent', id: 'n5', parent: 'l3' }]);
  budgets('activity-stress', { guard: actRename(m, v, 'x0', '[no stock at all]'), lane, stereotype: [{ op: 'set', id: 'n5', path: 'props.stereotypes', value: ['manual'] }] });
});

test('P1 (§17): state-stress.json all: a full layout under 1 s; a transition\'s label and a stereotype, laid out and drawn, printed against 100 ms (timed)', () => {
  budgets('state-stress', { label: [{ op: 'set', id: 't1', path: 'props.trigger', value: 'capture failed' }], stereotype: [{ op: 'set', id: 's3', path: 'props.stereotypes', value: ['manual'] }] });
});

test('P1 (§17): overview-stress.json all: a full layout under 1 s; a guard and a stereotype printed against 100 ms; each inline time axis under a 1 s ceiling, printed against 5 ms (timed)', () => {
  const m = FIX['overview-stress'];
  budgets('overview-stress', { guard: ovRename(m, V(m, 'all'), 'f2', '[in stock and paid]'), stereotype: [{ op: 'set', id: 'u3', path: 'props.stereotypes', value: ['audit'] }] });
  const sq = V(m, 'all').nodeIds.filter(id => node(m, id).type === 'uml.Interaction').map(id => sqInput(m, V(m, node(m, id).opensView)));
  assert.equal(sq.length, 10);
  const axis = Math.min(...[0, 1, 2, 3].map(() => cpu(() => sq.map(layoutTimeAxis))[1] / sq.length).slice(1)); // the first is a warm-up
  console.log(`# one inline time axis: ${axis.toFixed(2)} ms (target 5 ms)`);
  assert.ok(axis < 1000, `${axis} ms`);
});

test('P1 (§17): the Mermaid state reader and writer, 500 transitions each way, under a 1 s ceiling, printed against 100 ms (timed)', () => {
  const nodes = Array.from({ length: 50 }, (_, k) => ({ id: 's' + k, type: 'uml.State', label: 's' + k }));
  const edges = Array.from({ length: 500 }, (_, k) => ({ id: `t${k}`, type: 'uml.Transition', from: 's' + (k % 50), to: 's' + ((k * 7 + 1) % 50), props: { trigger: 'e' + k, guard: `x > ${k}`, effect: 'act' } }));
  const m = { schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: nodes.map(n => n.id) }] };
  const best = f => { let r; for (let i = 0; i < 4; i++) { const t = cpu(f); if (i === 1) r = t; else if (i) r = [t[0], Math.min(r[1], t[1])]; } return r; }; // the first is a warm-up
  const [text, w] = best(() => writeMermaidState(m, 'v')), [back, r] = best(() => readMermaidState(text));
  console.log(`# Mermaid state, 500 transitions: written in ${w.toFixed(1)} ms, read in ${r.toFixed(1)} ms (target 100 ms each)`);
  assert.equal(back.model.edges.length, 500);
  assert.ok(w < 1000 && r < 1000, `write ${w} ms, read ${r} ms`);
});
