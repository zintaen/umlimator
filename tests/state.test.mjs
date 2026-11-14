// The state machine diagram, uml.state-machine (work package 4.6, notes/stage-4.md §6, §10): the type's definition, its
// shapes (junction, history, terminate, the state with its compartment and decomposition indicator), composite states as
// boxes and their regions stacked with dividers across them, line ends on outlines, accessible names, the reading order,
// the legend, the validators, describe(), the editing hooks (add, rename, member rows, moveTo, the Owner field), a 30-step
// session saved and reopened, and P1's budgets. tests/state-machine.html draws it in a browser and edits it by pointer and
// keyboard. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
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
import { tablesOf } from '../src/page/print.js';
import { stActivityRow } from '../src/uml/state.js';
import '../src/uml/usecase.js';
import '../src/uml/activity.js';
import '../src/uml/overview.js';

const SM = JSON.parse(readFileSync(new URL('../examples/order-states.json', import.meta.url)));
const T = diagramOf({ diagram: 'uml.state-machine' }), V = SM.views[0];
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (o, f) => o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h;
const withDir = (m, direction) => { const c = structuredClone(m); c.views[0].direction = direction; return c; };
const tr = (id, from, to, props) => ({ id, type: 'uml.Transition', from, to, ...(props ? { props } : {}) });
const node = (m, id) => m.nodes.find(n => n.id === id);
// each line's drawn path's two ends, from the markup (tests/typed-shapes.test.mjs)
const ends = markup => [...markup.matchAll(/<g class="edge-g[^"]*" data-from="([^"]*)" data-to="([^"]*)" data-i="(\d+)">[\s\S]*?<path d="([^"]*)" class="edge/g)]
  .map(([, from, to, i, d]) => { const v = d.match(/-?\d+(\.\d+)?/g).map(Number); return { from, to, i: +i, a: v.slice(0, 2), b: v.slice(-2) }; });
// a point's distance from a node's outline: a circle, a diamond, else its box (a state's corners are 10 px arcs: a point
// on them is within 3 px of the box's border)
const CIRCLES = ['initial', 'final', 'junction', 'history'];
const off = (n, [x, y]) => {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
  if (CIRCLES.includes(n.shape)) return Math.abs(Math.hypot(x - cx, y - cy) - n.w / 2);
  if (n.shape === 'diamond') return Math.abs(Math.abs(x - cx) / (n.w / 2) + Math.abs(y - cy) / (n.h / 2) - 1) * n.w / 2 / Math.SQRT2;
  const dx = Math.max(n.x - x, 0, x - n.x - n.w), dy = Math.max(n.y - y, 0, y - n.y - n.h);
  return dx || dy ? Math.hypot(dx, dy) : Math.min(x - n.x, n.x + n.w - x, y - n.y, n.y + n.h - y); };

test('the definition: uml.state-machine with its palette (kinds and name: false), two lines, §10.3\'s properties and its hooks', () => {
  assert.equal(T.name, 'uml.state-machine');
  assert.deepEqual(T.elements.map(e => e.label), ['State', 'Initial', 'Final state', 'Choice', 'Junction', 'Fork', 'Join', 'Shallow history', 'Deep history', 'Terminate', 'Region', 'Comment']);
  assert.deepEqual(T.elements.filter(e => e.type === 'uml.Pseudostate').map(e => e.props.kind), ['initial', 'choice', 'junction', 'fork', 'join', 'shallowHistory', 'deepHistory', 'terminate']);
  assert.deepEqual(T.elements.filter(e => e.name === false).map(e => e.label), ['Initial', 'Final state', 'Choice', 'Junction', 'Fork', 'Join', 'Shallow history', 'Deep history', 'Terminate', 'Region']);
  assert.deepEqual(T.lines.map(l => l.label), ['Transition', 'Comment link']);
  assert.deepEqual(T.props['uml.State'].map(f => [f.key, f.kind]), [['entry', 'text'], ['do', 'text'], ['exit', 'text'], ['stereotypes', 'list']]);
  assert.deepEqual(T.props['uml.Pseudostate'][0], { key: 'kind', label: 'Kind', kind: 'enum', options: ['initial', 'choice', 'junction', 'fork', 'join', 'shallowHistory', 'deepHistory', 'terminate'] });
  assert.deepEqual(T.props['uml.Transition'].map(f => f.key), ['trigger', 'guard', 'effect', 'stereotypes']);
  for (const k of ['layout', 'validate', 'describe', 'boxes', 'owners']) assert.equal(typeof T[k], 'function', k);
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'moveTo', 'remove', 'rename']);
  assert.deepEqual(['uml.State', 'uml.Pseudostate', 'uml.FinalState'].map(t => T.member.holds({ type: t })), [true, false, false]);
  assert.equal(Object.keys(T.rules).length, 17);
});

test('the shapes: junction, history and terminate; a state\'s compartment, its rows cut by present.rows, hidden by collapsed, and the indicator', () => {
  for (const [k, D] of [['junction', 12], ['history', 24], ['terminate', 20]]) assert.deepEqual(SHAPE[k].size({}), { w: D, h: D }, k);
  // a point slid by inset lies on the circle
  const j = { x: 0, y: 0, w: 24, h: 24 };
  for (const [s, t] of [['L', 5], ['R', 12], ['T', 20], ['B', 3]]) { const d = SHAPE.history.inset(j, s, t), p = s === 'L' ? [d, t] : s === 'R' ? [24 - d, t] : s === 'T' ? [t, d] : [t, 24 - d];
    assert.ok(Math.abs(Math.hypot(p[0] - 12, p[1] - 12) - 12) < 0.01, `${s} ${t}`); }
  assert.match(SHAPE.history.draw({ ...j, id: 'h', deep: true }), />H\*<\/text>/);
  const S = SHAPE.state, plain = S.size({ label: 'Idle' }), rows = S.size({ label: 'Idle', acts: ['entry / a', 'do / b', 'exit / c'] });
  assert.deepEqual(plain, { w: 96, h: 36 });
  assert.equal(rows.h, 2 * 8 + 16 + 8 + 3 * 15);
  assert.equal(S.size({ label: 'Idle', acts: ['entry / a', 'do / b', 'exit / c'], collapsed: ['activities'] }).h, 36, 'collapsed: no compartment');
  assert.equal(S.size({ label: 'Idle', acts: ['entry / a', 'do / b', 'exit / c'], cap: 1 }).h, 2 * 8 + 16 + 8 + 2 * 15, 'one row and "+2 more"');
  assert.match(S.draw({ id: 's', x: 0, y: 0, ...S.size({ label: 'Idle', acts: ['entry / a', 'do / b'], cap: 1 }), label: 'Idle', acts: ['entry / a', 'do / b'], cap: 1 }), /class="c-more"[^>]*>\+1 more</);
  assert.equal(S.size({ label: 'Idle', composite: true }).h, 2 * 8 + 16 + 12, 'the indicator\'s strip');
  assert.match(S.draw({ id: 's', x: 0, y: 0, w: 96, h: 44, label: 'Idle', composite: true }), /class="st-dec"/);
  assert.match(S.frame({ id: 'f', x: 0, y: 0, w: 200, h: 100, title: 'Fulfilling' }), /class="family-box"[^]*rx="10"[^]*class="family-title"[^]*>Fulfilling<[^]*class="st-head"/);
  assert.doesNotMatch(SHAPE.region.frame({ id: 'r', x: 0, y: 0, w: 200, h: 100 }), /st-div|family-title/, 'the first region, unnamed: nothing but its box');
  assert.match(SHAPE.region.frame({ id: 'r', x: 0, y: 0, w: 200, h: 100, label: 'Parcel', div: [0, -16, 200, -16] }), /stroke-dasharray="6 4"[^]*>Parcel</);
});

// the crossings that turning port repair off leaves (notes/stage-4.md §17): pinned
const PINNED = {
  right: ['view order-life: edges →Fulfilling and Picking→Packed cross', 'view order-life: edges →Cancelled and Capturing payment→Cancelled cross'],
  down: ['view order-life: edges →Fulfilling and →Payment captured cross', 'view order-life: edges →Cancelled and →Payment captured cross', 'view order-life: edges →Cancelled and Payment captured→ cross',
    'view order-life: edges →Cancelled and Fulfilling→Cancelled cross', 'view order-life: edges Capturing payment→Cancelled and Capturing payment→Payment captured cross'],
};
test('order-states.json (example 10) draws: shapes by kind, composites as boxes, regions stacked with dividers across their state, laid out clean right and down', () => {
  assert.deepEqual(validate(SM), []);
  for (const direction of ['right', 'down']) {
    const m = withDir(SM, direction), g = layout(m, 'order-life'), by = g.byId, fam = id => g.families.find(f => f.id === id);
    assert.deepEqual(check(m, 'order-life').map(x => x.message), PINNED[direction], `${direction}: no overlap, no line through a node, only the pinned crossings`);
    for (const p of g.nodes) for (const q of g.nodes) assert.ok(p === q || !meets(p, q), `${direction}: ${p.id} and ${q.id} overlap`);
    assert.deepEqual(['created', 'payment-outcome', 'prepaid', 'ready', 'delivery-history', 'erased', 'delivered', 'placed'].map(id => by[id].shape),
      ['initial', 'diamond', 'bar', 'bar', 'history', 'terminate', 'final', 'state']);
    assert.equal(by.prepaid.w < by.prepaid.h, direction === 'right', `${direction}: the bar lies across the flow`);
    assert.deepEqual(g.families.map(f => [f.id, f.shape]).sort(), [['delivery', 'state'], ['fulfilling', 'state'], ['fulfilling.parcel', 'region'], ['fulfilling.payment', 'region']]);
    const S = fam('fulfilling'), [a, b] = [fam('fulfilling.parcel'), fam('fulfilling.payment')].sort((p, q) => (direction === 'right' ? p.y - q.y : p.x - q.x));
    [a, b].forEach(r => assert.ok(inside(r, S), `${direction}: ${r.id} in its state`));
    // stacked one above the other laid out right, side by side laid out down; stretched across the state; one divider, in the gap
    if (direction === 'right') { assert.ok(b.y >= a.y + a.h); assert.ok(a.x === b.x && a.w === b.w && a.w === S.w - 12, 'stretched across');
      assert.ok(!a.div && b.div[0] === S.x && b.div[2] === S.x + S.w && b.div[1] > a.y + a.h && b.div[1] < b.y, 'the divider across the state, in the gap'); }
    else { assert.ok(b.x >= a.x + a.w); assert.ok(a.y === b.y && a.h === b.h);
      assert.ok(!a.div && b.div[1] === S.y + 24 && b.div[3] === S.y + S.h && b.div[0] > a.x + a.w && b.div[0] < b.x); }
    [['parcel-start', 'picking', 'packed'], ['payment-start', 'capturing', 'captured']].forEach((ids, k) => ids.forEach(id => assert.ok(inside(by[id], [fam('fulfilling.parcel'), fam('fulfilling.payment')][k]), `${direction}: ${id} in its region`)));
    ['delivery-start', 'in-transit', 'out-for-delivery', 'delivery-history'].forEach(id => assert.ok(inside(by[id], fam('delivery')), `${direction}: ${id} in In delivery, its one implicit region`));
    // a bar's lines leave and enter on its long sides
    g.edges.filter(e => e.from === 'prepaid').forEach(e => assert.equal(e.fs, direction === 'right' ? 'R' : 'B'));
    g.edges.filter(e => e.to === 'ready').forEach(e => assert.equal(e.ts, direction === 'right' ? 'L' : 'T'));
    const e = Object.fromEntries(g.edges.map(x => [x.id, x]));
    assert.deepEqual(e['t-capture-retry'].end, { from: 'none', to: 'open' }); assert.equal(e['t-capture-retry'].cut, 280);
    assert.equal(e['t-capture-retry'].label, 'capture failed [attempts < 3] / count the attempt');
    assert.equal(e['t-handed-over'].label, '/ hand the parcel to the carrier');
  }
});

test('every line end is on its shape\'s outline within 1 px (circles, the diamond, a bar, states and composite borders), right and down', () => {
  let slid = 0;
  for (const direction of ['right', 'down']) {
    const { g, markup } = mapContext(withDir(SM, direction)).buildView('order-life'), E = ends(markup);
    assert.equal(E.length, g.edges.length);
    E.forEach(({ from, to, i, a, b }) => [[from, a], [to, b]].forEach(([id, p]) => { const n = g.byId[id] || g.families.find(f => f.id === id), d = n.shape === 'state' || !n.shape ? Math.max(0, off(n, p) - 3) : off(n, p);
      assert.ok(d <= 1, `${direction}: ${g.edges[i].id} ends ${d.toFixed(2)} px off ${id} (${n.shape})`); }));
    slid += E.filter(({ i, a, b }) => String(a) !== String(g.edges[i].pts[0]) || String(b) !== String(g.edges[i].pts.at(-1))).length;
  }
  assert.ok(slid >= 2, `${slid} lines slid onto outlines (a diamond's side away from its vertex)`);
});

test('the layout is not edited after layoutTyped: drawn twice from one memo, the same markup, the memo\'s points the router\'s (§2.4)', () => {
  const memos = {}, unid = s => s.replace(/\bg\d+-/g, 'g-');
  const first = mapContext(SM, { memos }).buildView('order-life'), pts = JSON.stringify(memos['order-life'].g.edges.map(e => e.pts)), fams = JSON.stringify(memos['order-life'].g.families);
  const second = mapContext(SM, { memos }).buildView('order-life');
  assert.equal(memos['order-life'].runs, 1);
  assert.equal(unid(second.markup), unid(first.markup));
  assert.equal(JSON.stringify(memos['order-life'].g.edges.map(e => e.pts)), pts);
  assert.equal(JSON.stringify(memos['order-life'].g.families), fams, 'the regions are stretched on a copy');
  assert.ok(!memos['order-life'].g.families.some(f => f.div), 'no divider in the memo');
});

test('names, reading order and legend (§14): states with their activities, composites and regions, pseudostates in their owner, transitions', () => {
  const g = layout(SM, 'order-life'), s = svgOf(g), fam = id => g.families.find(f => f.id === id);
  assert.equal(g.byId.placed.aria, 'State Placed, entry reserve the books, do poll the payment provider, exit log the payment result, 1 internal transition');
  assert.equal(fam('fulfilling').aria, 'Composite state Fulfilling, 2 regions');
  assert.equal(fam('fulfilling.parcel').aria, 'Region Parcel of Fulfilling, 3 states');
  assert.equal(fam('delivery').aria, 'Composite state In delivery, 4 states');
  assert.equal(g.byId['parcel-start'].aria, 'Initial pseudostate in Parcel');
  assert.equal(g.byId['payment-outcome'].aria, 'Choice'); assert.equal(g.byId.erased.aria, 'Terminate');
  assert.equal(g.byId['delivery-history'].aria, 'Shallow history in In delivery'); assert.equal(g.byId.delivered.aria, 'Final state');
  assert.equal(g.edges.find(e => e.id === 't-capture-retry').aria, 'Transition from Capturing payment to itself: capture failed [attempts < 3] / count the attempt');
  assert.match(s, /role="img" aria-label="Composite state Fulfilling, 2 regions"/);
  assert.match(s, /data-comp="activities"[^]*?>entry \/ reserve the books<\/text>/);
  assert.match(s, /<title>Transition from Capturing payment to itself: capture failed \[attempts &lt; 3\] \/ count the attempt<\/title>/);
  assert.deepEqual(g.order.slice(0, 7), ['created', 'placed', 'payment-outcome', 'prepaid', 'fulfilling', 'fulfilling.parcel', 'parcel-start']);
  assert.deepEqual(g.order.slice(-SM.edges.length), SM.edges.map(e => e.id));
  assert.deepEqual(g.legend.map(l => /<b>([^<]+)<\/b>/.exec(l)[1]), ['Transition', 'Initial', 'Final state', 'Choice', 'Fork or join', 'History', 'Terminate']);
  // a closed composite: its indicator, and its name says so; a pseudostate's label is not drawn but named
  const closed = structuredClone(SM); closed.views[0].nodeIds = closed.views[0].nodeIds.filter(id => !['delivery-start', 'in-transit', 'out-for-delivery', 'delivery-history'].includes(id));
  closed.nodes.find(n => n.id === 'payment-outcome').label = 'Paid?';
  const h = layout(closed, 'order-life');
  assert.equal(h.byId.delivery.aria, 'Composite state In delivery, 4 states, closed'); assert.equal(h.byId.delivery.composite, true);
  assert.match(svgOf(h), /data-id="delivery"[^]*?class="st-dec"/);
  assert.equal(h.byId['payment-outcome'].aria, 'Choice Paid?'); assert.equal(h.byId['payment-outcome'].label, '');
  // a state's rows collapsed by present
  const col = structuredClone(SM); col.views[0].present = { placed: { collapsed: ['activities'] } };
  assert.doesNotMatch(svgOf(layout(col, 'order-life')), /data-id="placed"[^>]*>(?:(?!<\/g><g class="node)[^])*data-comp/);
});

test('describe(): the view in sentences from the top initial pseudostate, in reading order, then each transition', () => {
  const d = describe(SM, 'order-life').split('\n');
  assert.equal(d[0], 'An order\'s life: a state machine diagram of 21 elements and 23 transitions.');
  assert.deepEqual(d.slice(1, 6), ['Initial pseudostate.', 'State Placed, entry reserve the books, do poll the payment provider, exit log the payment result, 1 internal transition.', 'Choice.', 'Fork.', 'Composite state Fulfilling, 2 regions.']);
  assert.equal(d.at(-1), 'Transition from Cancelled to Terminate: after 30 days / erase the shopper\'s details.');
  assert.equal(d.length, 1 + 21 + 2 + 23, 'the elements, the two regions and the transitions');
});

// ---- §10.2: validators, each with a passing and a failing case: [ids, level]
const BREAKS = {
  'transition-ends': m => { m.edges.push(tr('bad', 'placed', 'fulfilling.parcel')); return ['bad', 'fulfilling.parcel']; },
  'owner-kinds': m => { node(m, 'enquiry').parent = 'erased'; return ['enquiry', 'erased']; },
  'initial-one': m => { m.nodes.push({ id: 'x0', type: 'uml.Pseudostate', parent: 'fulfilling.parcel', props: { kind: 'initial' } }); m.edges.push(tr('x0-out', 'x0', 'packed')); return ['parcel-start', 'x0', 'fulfilling.parcel']; },
  'initial-out': m => { m.edges.push(tr('bad', 'packed', 'parcel-start')); return ['parcel-start', 'bad']; },
  'final-out': m => { m.edges.push(tr('bad', 'delivered', 'cancelled')); return ['delivered', 'bad']; },
  'final-kind': m => { node(m, 'delivered').props = { entry: 'wave' }; return ['delivered']; },
  'choice-guards': m => { delete m.edges.find(e => e.id === 't-prepaid').props; return ['payment-outcome', 't-prepaid']; },
  'fork-join': m => { m.edges.push(tr('bad', 'placed', 'prepaid')); return ['prepaid', 't-prepaid', 'bad']; },
  'history-owner': m => { delete node(m, 'delivery-history').parent; return ['delivery-history']; },
  'history-one': m => { m.nodes.push({ id: 'h2', type: 'uml.Pseudostate', parent: 'delivery', props: { kind: 'shallowHistory' } }); return ['delivery-history', 'h2', 'delivery']; },
  'composite-entry': m => { node(m, 'parcel-start').props.kind = 'junction'; m.edges = m.edges.filter(e => e.id !== 't-parcel-start'); m.nodes = m.nodes.filter(n => n.id !== 'parcel-start'); return ['t-authorised', 'fulfilling', 'fulfilling.parcel']; },
  'reserved-trigger': m => { node(m, 'placed').members[0].props.trigger = 'entry'; return ['placed', 'placed.address']; },
  'region-mixed': m => { m.nodes.push({ id: 'loose', type: 'uml.State', label: 'Loose', parent: 'fulfilling' }); return ['fulfilling', 'loose']; },
  'region-cross': m => { m.edges.push(tr('bad', 'picking', 'capturing')); return ['bad', 'fulfilling.parcel', 'fulfilling.payment']; },
  'internal-trigger': m => { delete node(m, 'placed').members[0].props.trigger; return ['placed', 'placed.address']; },
  'pseudo-kind': m => { node(m, 'erased').props.kind = 'stop'; return ['erased']; },
  'label-syntax': m => { m.edges.find(e => e.id === 't-picked').props.trigger = 'all [books'; return ['t-picked']; },
};
const WARNS = ['choice-guards', 'composite-entry', 'region-mixed', 'region-cross', 'internal-trigger', 'pseudo-kind', 'label-syntax'];
test('validators: order-states.json (example 10) breaks no rule; each rule fails on a model that breaks it, naming its rule and its elements, at its level', () => {
  assert.deepEqual(T.validate(SM), []);
  assert.deepEqual(Object.keys(BREAKS).sort(), Object.keys(T.rules).sort());
  for (const [rule, broke] of Object.entries(BREAKS)) {
    const m = structuredClone(SM), ids = broke(m), got = T.validate(m);
    assert.deepEqual(got.map(p => p.rule), [rule], `${rule}: ${JSON.stringify(got)}`);
    const [p] = got;
    assert.match(p.message, new RegExp('^' + rule + ': '));
    assert.equal(p.level, WARNS.includes(rule) ? 'warning' : 'error', rule);
    assert.deepEqual([...p.ids].sort(), [...ids].sort(), rule);
    assert.ok(validate(m).some(q => q.rule === rule && q.path === p.path), `${rule}: in validate()`);
  }
  // the levels S21 splits: an initial with no outgoing yet, a fork with one branch, warnings; a fork into one region an error
  const lone = structuredClone(SM); lone.edges = lone.edges.filter(e => e.id !== 't-created');
  assert.deepEqual(T.validate(lone).map(p => [p.rule, p.level]), [['initial-out', 'warning']]);
  const one = structuredClone(SM); one.edges = one.edges.filter(e => e.id !== 't-prepaid-captured');
  assert.deepEqual(T.validate(one).map(p => [p.rule, p.level]), [['fork-join', 'warning']]);
  const same = structuredClone(SM); same.edges.find(e => e.id === 't-prepaid-captured').to = 'packed';
  assert.deepEqual(T.validate(same).map(p => [p.rule, p.level, p.ids]), [['fork-join', 'error', ['prepaid', 'picking', 'packed']]]);
  const guard = structuredClone(SM); guard.edges.find(e => e.id === 't-packed-ready').props = { guard: 'x' };
  assert.deepEqual(T.validate(guard).map(p => [p.rule, p.level]), [['fork-join', 'error']]);
  const elses = structuredClone(SM); elses.edges.find(e => e.id === 't-prepaid').props.guard = 'else';
  assert.deepEqual(T.validate(elses).map(p => [p.rule, p.level]), [['choice-guards', 'warning']]);
  // a state with id "null": its history and one at the top are two owners, not one
  const top = structuredClone(SM); top.nodes.push({ id: 'null', type: 'uml.State', label: 'N' }, { id: 'hn', type: 'uml.Pseudostate', parent: 'null', props: { kind: 'shallowHistory' } }, { id: 'ht', type: 'uml.Pseudostate', props: { kind: 'shallowHistory' } });
  assert.deepEqual(T.validate(top).map(p => p.rule), ['history-owner']);
  // a state owned by its own region (hostile input) still draws
  const loop = structuredClone(SM); node(loop, 'fulfilling').parent = 'fulfilling.parcel';
  assert.ok(layout(loop, 'order-life').nodes.length); assert.match(mapContext(loop).buildView('order-life').markup, /<svg/);
  // a class model is not ours
  assert.deepEqual(T.validate({ nodes: [{ id: 'K', type: 'uml.Class' }], edges: [{ id: 'g', type: 'uml.Generalization', from: 'K', to: 'K' }] }), []);
});

// ---- §10.3: editing
test('F2 on a transition round-trips its parts: one set per part that changed; a text the parser refuses, or a line whose parts do not read back, is { error }', () => {
  const r = (id, t, m = SM) => T.edits.rename(m, V, id, t);
  assert.deepEqual(r('t-capture-retry', 'capture failed [attempts < 3] / count the attempt'), [], 'its own text: nothing changes');
  const c = r('t-capture-retry', 'capture failed [attempts < 5]');
  assert.deepEqual(c, [{ op: 'set', id: 't-capture-retry', path: 'props.guard', value: 'attempts < 5' }, { op: 'set', id: 't-capture-retry', path: 'props.effect', value: undefined }]);
  const m = apply(SM, c), e = m.edges.find(x => x.id === 't-capture-retry');
  assert.deepEqual(e.props, { trigger: 'capture failed', guard: 'attempts < 5' });
  assert.equal(layout(m, 'order-life').edges.find(x => x.id === 't-capture-retry').label, 'capture failed [attempts < 5]');
  assert.deepEqual(r('t-created', 'evt(a/b) [max(a, b[1]) > 2] / x / y'), ['trigger', 'guard', 'effect'].map((k, i) => ({ op: 'set', id: 't-created', path: 'props.' + k, value: ['evt(a/b)', 'max(a, b[1]) > 2', 'x / y'][i] })));
  assert.match(r('t-created', 'a [b').error, /is not closed/);
  assert.match(r('t-created', 'a [b] c').error, /after the guard/);
  const bad = structuredClone(SM); bad.edges.find(x => x.id === 't-picked').props.trigger = 'all [books';
  assert.match(r('t-picked', 'all books', bad).error, /properties panel/);
  assert.equal(r('placed', 'Placed again'), null, 'a state: set label, the default');
  // F2 opens the drawn label, «stereotypes» first: they are not read into the trigger
  const st = structuredClone(SM); st.edges.find(x => x.id === 't-capture-retry').props.stereotypes = ['async'];
  const text = layout(st, 'order-life').edges.find(x => x.id === 't-capture-retry').label;
  assert.equal(text, '«async» capture failed [attempts < 3] / count the attempt');
  assert.deepEqual(r('t-capture-retry', text, st), [], 'its own drawn text: nothing changes');
  assert.deepEqual(r('t-capture-retry', '«async» capture lost', st)[0], { op: 'set', id: 't-capture-retry', path: 'props.trigger', value: 'capture lost' });
});

test('member rows: an internal transition by its text, a region as `region <name>`; a row `entry / x` sets the prop (a second replaces the first, said)', () => {
  const M = T.member, it = node(SM, 'placed').members[0];
  assert.equal(M.print(it), 'address changed / update the delivery address');
  assert.equal(M.print({ type: 'uml.Region', label: 'Parcel' }), 'region Parcel');
  assert.deepEqual(M.add('paid [late] / say sorry'), { type: 'uml.InternalTransition', props: { trigger: 'paid', guard: 'late', effect: 'say sorry' } });
  assert.deepEqual(M.add('region Returns'), { type: 'uml.Region', label: 'Returns', props: {} });
  assert.match(M.add('a [b').error, /internal transition is trigger \[guard\] \/ effect/);
  assert.deepEqual(M.edit(it, 'address changed / note it').commands, [{ op: 'set', id: 'placed.address', path: 'props.effect', value: 'note it' }]);
  assert.deepEqual(M.edit({ id: 'fulfilling.parcel', type: 'uml.Region', label: 'Parcel' }, 'region Box').commands, [{ op: 'set', id: 'fulfilling.parcel', path: 'label', value: 'Box' }]);
  // the activity rows, which the panel's New member (and a row edited) hand to stActivityRow first
  assert.deepEqual(stActivityRow(SM, 'cancelled', 'exit / log it'), [{ op: 'set', id: 'cancelled', path: 'props.exit', value: 'log it' }]);
  const again = stActivityRow(SM, 'placed', 'entry / hold the books');
  assert.deepEqual(again, { commands: [{ op: 'set', id: 'placed', path: 'props.entry', value: 'hold the books' }], say: 'entry / hold the books replaces entry / reserve the books' });
  assert.deepEqual(stActivityRow(SM, 'placed', 'do / wait', 'placed.address').commands, [{ op: 'set', id: 'placed', path: 'props.do', value: 'wait' }, { op: 'delete', id: 'placed.address' }], 'an internal transition row rewritten as do / …');
  const m = apply(SM, stActivityRow(SM, 'cancelled', 'exit / log it'));
  assert.equal(node(m, 'cancelled').props.exit, 'log it'); assert.deepEqual(validate(m), []);
  assert.match(layout(m, 'order-life').byId.cancelled.aria, /exit log it/);
  assert.equal(stActivityRow(SM, 'placed', 'paid / thanks'), null, 'any other row: the member hook\'s');
  assert.match(stActivityRow(SM, 'placed', 'entry [x] / y').error, /no guard/);
  assert.match(stActivityRow(SM, 'placed', 'entry').error, /after the \//);
  assert.match(M.add('entry / x').error, /entry activity/, 'without the panel\'s reading: refused, never a reserved trigger');
  assert.equal(stActivityRow(SM, 'fulfilling', 'entry / start', 'fulfilling.parcel'), null, 'a region\'s row: never an activity, so the region and what it holds stay');
  assert.deepEqual(M.add('region changed / log'), { type: 'uml.InternalTransition', props: { trigger: 'region changed', effect: 'log' } }, 'a trigger that starts with region');
});

test('add: a pseudostate with its kind and no name; a region into the selected state, else { error }; anything else the default', () => {
  const add = (e, label, at) => T.edits.add(SM, V, e, label, at), entry = l => T.elements.find(e => e.label === l);
  assert.deepEqual(add(entry('Choice'), ''), [{ op: 'add', element: { id: 'choice1', type: 'uml.Pseudostate', props: { kind: 'choice' } }, view: 'order-life' }]);
  assert.deepEqual(add(entry('Deep history'), '')[0].element, { id: 'deep-history1', type: 'uml.Pseudostate', props: { kind: 'deepHistory' } });
  assert.deepEqual(add(entry('Region'), '', { sel: ['delivery'] }), [{ op: 'add', element: { id: 'delivery.region1', type: 'uml.Region' }, owner: 'delivery' }]);
  assert.match(add(entry('Region'), '', { sel: ['created'] }).error, /Select a state/);
  assert.equal(add(entry('State'), 'Idle'), null); assert.equal(add(entry('Final state'), ''), null);
  const m = apply(SM, add(entry('Fork'), ''));
  assert.equal(layout(m, 'order-life').byId.fork1.shape, 'bar');
});

test('a pseudostate\'s kind changed in the panel redraws its shape', () => {
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('order-life');
  assert.match(draw(SM).markup, /data-id="payment-outcome" data-shape="diamond"/);
  for (const [kind, shape] of [['junction', 'junction'], ['deepHistory', 'history'], ['terminate', 'terminate'], ['nonsense', 'junction']]) {
    const m = apply(SM, [{ op: 'set', id: 'payment-outcome', path: 'props.kind', value: kind }]), { g, markup } = draw(m);
    assert.equal(g.byId['payment-outcome'].shape, shape, kind); assert.match(markup, new RegExp(`data-id="payment-outcome" data-shape="${shape}"`)); }
});

test('moveTo: a node dropped into the box of a state with one region goes to that region; anything else the default', () => {
  const m = structuredClone(SM); node(m, 'delivery').members = [{ id: 'delivery.main', type: 'uml.Region' }];
  ['delivery-start', 'in-transit', 'out-for-delivery', 'delivery-history'].forEach(id => { node(m, id).parent = 'delivery.main'; });
  m.views[0].layout = { cancelled: [9, 9] };
  const g = layout(m, 'order-life'), box = g.families.find(f => f.id === 'delivery'), pt = [box.x + box.w / 2, box.y + box.h - 8];
  assert.equal(g.families.filter(f => f.id === 'delivery.main').length, 0, 'a lone region is no box');
  assert.deepEqual(T.edits.moveTo(m, m.views[0], 'cancelled', { pt, geo: g }), [{ op: 'reparent', id: 'cancelled', parent: 'delivery.main' }, { op: 'set', view: 'order-life', path: ['layout', 'cancelled'], value: undefined }]);
  assert.equal(T.edits.moveTo(m, m.views[0], 'in-transit', { pt, geo: g }), null, 'already in it: a pin');
  assert.equal(T.edits.moveTo(m, m.views[0], 'cancelled', { pt: [-500, -500], geo: g }), null, 'outside every box');
  const f = g.families.find(x => x.id === 'fulfilling.parcel');
  assert.equal(T.edits.moveTo(m, m.views[0], 'cancelled', { pt: [f.x + 4, f.y + 4], geo: g }), null, 'into a region\'s own box: the default reparent');
  assert.equal(T.edits.moveTo(m, m.views[0], 'cancelled', { by: [0, 1], geo: g }), null, 'Alt + arrows: a pin');
  assert.equal(T.edits.moveTo(m, m.views[0], 'delivery', { pt, geo: g }), null, 'into itself: never its own region');
  assert.deepEqual(validate(apply(m, T.edits.moveTo(m, m.views[0], 'cancelled', { pt, geo: g }))).filter(p => p.level === 'error'), []);
});

test('the Owner field: every state and region by its name from the top; deleting a state takes its regions and what they hold', () => {
  const o = T.owners(SM, node(SM, 'cancelled'));
  assert.deepEqual(o.slice(0, 4), [{ id: 'placed', label: 'Placed' }, { id: 'fulfilling', label: 'Fulfilling' }, { id: 'fulfilling.parcel', label: 'Fulfilling / Parcel' }, { id: 'fulfilling.payment', label: 'Fulfilling / Payment' }]);
  assert.equal(o.length, 10 + 2, 'the ten other states, two regions');
  assert.equal(T.owners(SM, SM.edges[0]), null);
  const of = T.owners(SM, node(SM, 'fulfilling')).map(x => x.id);
  assert.equal(of.length, 13 - 7, 'not itself, its regions, nor the five states under it');
  for (const id of ['fulfilling', 'fulfilling.parcel', 'fulfilling.payment', 'picking', 'packed', 'capturing', 'captured']) assert.ok(!of.includes(id), id);
  assert.deepEqual(validate(apply(SM, [{ op: 'reparent', id: 'fulfilling', parent: of.at(-1) }])).filter(p => p.rule === 'owner-kinds'), []);
  // a region deleted from the model says how many elements it held (§10.3); hidden from the view, the default
  const del = T.edits.remove(SM, V, ['fulfilling.parcel'], true);
  assert.deepEqual(del, { commands: [{ op: 'delete', id: 'fulfilling.parcel' }], say: 'Deleted region Parcel and the 3 elements it held' });
  assert.equal(apply(SM, del.commands).nodes.filter(n => ['parcel-start', 'picking', 'packed'].includes(n.id)).length, 0);
  assert.equal(T.edits.remove(SM, V, ['fulfilling.parcel'], false), null); assert.equal(T.edits.remove(SM, V, ['placed'], true), null);
  const m = apply(SM, [{ op: 'delete', id: 'fulfilling' }]);
  assert.ok(!m.nodes.some(n => ['picking', 'packed', 'capturing', 'captured', 'parcel-start', 'payment-start'].includes(n.id)));
});

test('save and reopen (DoD 6): a 30-step session undoes and redoes to byte-identical models, and reopening its saved JSON midway ends where the session does', () => {
  const steps = [], e = l => T.elements.find(x => x.label === l);
  for (let i = 0; i < 5; i++) steps.push(
    [{ op: 'add', element: { id: `s${i}`, type: 'uml.State', label: `Step ${i}` }, view: 'order-life' }],
    T.edits.add(SM, V, e('Junction'), '').map(c => ({ ...c, element: { ...c.element, id: `j${i}` } })),
    [{ op: 'add', element: tr(`t${i}`, 'cancelled', `s${i}`, { trigger: 'retry' }), view: 'order-life' }, { op: 'add', element: tr(`u${i}`, `s${i}`, `j${i}`), view: 'order-life' }, { op: 'add', element: tr(`w${i}`, `j${i}`, 'placed'), view: 'order-life' }],
    [{ op: 'add', element: { id: `s${i}.it`, type: 'uml.InternalTransition', props: { trigger: 'tick' } }, owner: `s${i}` }],
    [T.edits.rename({ ...SM, edges: [tr(`t${i}`, 'cancelled', `s${i}`, { trigger: 'retry' })] }, V, `t${i}`, `retry [n < ${i}] / count`), [{ op: 'set', id: `s${i}`, path: 'props.entry', value: `go ${i}` }], [{ op: 'reparent', id: `s${i}`, parent: 'delivery' }]][i % 3],
    [[{ op: 'hide', id: `s${i}`, view: 'order-life' }], [{ op: 'delete', id: `s${i}.it` }], [{ op: 'set', id: `s${i}`, path: 'label', value: `Renamed ${i}` }]][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(SM), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); assert.deepEqual(validate(h.model).filter(p => p.level === 'error'), [], `step ${seen.length - 1}`); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  const reopened = steps.slice(15).reduce((m, s) => apply(m, s), JSON.parse(seen[15]));
  assert.equal(JSON.stringify(reopened), seen[30]);
  const flat = g => JSON.stringify(g, (k, v) => (k === 'ms' ? undefined : v));
  assert.equal(flat(layout(reopened, 'order-life')), flat(layout(JSON.parse(seen[30]), 'order-life')));
  assert.equal(describe(reopened, 'order-life'), describe(JSON.parse(seen[30]), 'order-life'));
});

/* ---- P1 (S15, §17): 50 states and 60 transitions, composites three deep (two regions at each level), as 4.1's spike built
   them (tests/typed-shapes.test.mjs) but of this type. Wired as a state machine is drawn: each region's states in a chain and
   back, a nested composite entered from its region's state, 16 transitions across composites' borders. Scattered: the same
   states with 60 transitions between states taken 7 apart, most across region borders (the router's worst case) */
function machine(scattered) {
  const nodes = [], regions = [], st = (id, label, parent, more = {}) => { nodes.push({ id, type: 'uml.State', label, ...(parent ? { parent } : {}), ...more }); return id; };
  const comp = (id, parent, depth) => { const rs = ['a', 'b'].map(k => ({ id: `${id}.${k}`, type: 'uml.Region', label: k }));
    st(id, 'Composite ' + id, parent, { members: rs }); regions.push(...rs.map(r => r.id)); if (depth < 3) rs.forEach(r => comp(`${r.id}c`, r.id, depth + 1)); };
  comp('S', null, 1);
  const leafs = regions.filter(r => r.split('.').length === 4), mids = regions.filter(r => !leafs.includes(r));
  let k = 0; leafs.forEach(r => { for (let i = 0; i < 4; i++) st('s' + k++, 'State ' + k, r); }); mids.forEach(r => st('s' + k++, 'State ' + k, r));
  while (nodes.length < 50) st('s' + k++, 'State ' + k, null);
  const simple = nodes.filter(n => !n.members).map(n => n.id), edges = [];
  const line = (a, b) => edges.push(tr('t' + edges.length, a, b, edges.length % 2 ? { trigger: 'evt', guard: 'x > 0', effect: 'act' } : undefined));
  if (scattered) for (let i = 0; edges.length < 60; i++) { const a = simple[i % simple.length], b = simple[(i * 7 + 3) % simple.length]; if (a !== b) line(a, b); }
  else {
    const inR = r => simple.filter(id => nodes.find(n => n.id === id).parent === r), top = inR(undefined);
    leafs.forEach(r => { const l = inR(r); l.slice(1).forEach((b, i) => line(l[i], b)); line(l.at(-1), l[0]); });
    mids.forEach(r => line(inR(r)[0], inR(r + 'c.a')[0] || inR(r + 'c.a.ac.a')[0] || inR(r)[0]));
    top.slice(1).forEach((b, i) => line(top[i], b));
    leafs.forEach((r, i) => { line(inR(r).at(-1), top[i % top.length]); line(top[(i + 1) % top.length], inR(r)[1]); });
    while (edges.length < 60) line(top[edges.length % top.length], inR(leafs[edges.length % 8])[2]);
  }
  return { schemaVersion: 2, nodes, edges, views: [{ id: 'all', diagram: 'uml.state-machine', nodeIds: nodes.map(n => n.id) }] };
}
// CPU time, best of N after a warm-up: even though CI runs the timed tests one file at a time in their own step, CI runners
// are several times slower than a laptop (tests/communication.test.mjs)
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
function timeEdit(M, N) {
  const memos = {}, draw = m => mapContext(m, { memos }).buildView('all').markup;
  draw(M); draw(apply(M, [{ op: 'set', id: 't1', path: 'props.trigger', value: 'warm' }])); // the warm-up
  const runs = Array.from({ length: N }, (_, k) => { const was = memos.all.runs, m = apply(M, [{ op: 'set', id: 't1', path: 'props.trigger', value: `capture failed ${'x'.repeat(k + 1)}` }]);
    const r = { full: cpu(() => mapContext(M).buildView('all')), label: cpu(() => draw(m)) };
    assert.equal(memos.all.runs, was + 1, 'a label edit lays the view out again'); return r; });
  return k => Math.min(...runs.map(r => r[k]));
}
test(`P1 (S15): a state machine of 50 states, 60 transitions, composites three deep, wired as drawn: a label edit laid out and drawn and a full layout each under 1 s in CI, the label edit's time against S15's 100 ms printed (CPU, best of seven after a warm-up; the maintainer's decision of 13 Nov 2026) (timed)`, () => {
  const M = machine(false);
  assert.equal(M.nodes.length, 50); assert.equal(M.edges.length, 60); assert.equal(T.boxes(M, M.views[0]).length, 21, '7 composite states and 14 regions are boxes');
  const best = timeEdit(M, 7);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  // a CI runner is 2 to 5 times slower than an idle machine, where this edit takes about 87 ms: CI holds the 1 s ceiling
  // and prints the edit against S15's 100 ms; docs/conformance records the idle machine's figure
  assert.ok(best('label') < 1000, `a label edit ${best('label')} ms`);
  console.log(`# P1 wired: a label edit ${best('label').toFixed(1)} ms (target 100 ms), full layout ${best('full').toFixed(1)} ms`);
});
test('P1 (the maintainer\'s decision, 13 Nov 2026): the scattered worst case, most transitions across region borders, holds the 1 s budget of edits that move geometry (timed)', () => {
  const M = machine(true), best = timeEdit(M, 3);
  assert.ok(best('label') < 1000, `a label edit ${best('label')} ms`);
  assert.ok(best('full') < 1000, `full layout ${best('full')} ms`);
  if (process.env.ST_TIMES) console.log(`# scattered: full ${best('full')} ms, a label ${best('label')} ms`);
});

test('the PDF\'s tables (§15, decision 18): each element\'s kind by word, a state\'s entry, do and exit, then its internal transitions and regions', () => {
  const ctx = mapContext(SM), [els] = tablesOf(ctx, ctx.V[V.id], ctx.buildGeo(V.id));
  const row = Object.fromEntries(els.rows.map(r => { const [n, k, m] = [...r.matchAll(/<td>(.*?)<\/td>/g)].map(x => x[1]);
    return [n.replace(/<[^>]+>|\s*⤢/g, ''), [k, [...m.matchAll(/<p>(.*?)<\/p>/g)].map(x => x[1])]]; }));
  assert.deepEqual(row.created, ['Initial pseudostate', []]);
  assert.deepEqual(row['payment-outcome'], ['Choice', []]);
  assert.deepEqual(row.prepaid, ['Fork', []]);
  assert.deepEqual(row['delivery-history'], ['Shallow history', []]);
  assert.deepEqual(row.erased, ['Terminate', []]);
  assert.deepEqual(row.delivered, ['Final state', []]);
  assert.deepEqual(row.Placed, ['State', ['entry / reserve the books', 'do / poll the payment provider', 'exit / log the payment result', 'address changed / update the delivery address']]);
  assert.deepEqual(row.Fulfilling, ['Composite state', ['region Parcel', 'region Payment']]);
  assert.deepEqual(row['In delivery'], ['Composite state', []]);
  // a member with a guard reads back whole: trigger [guard] / effect
  const m = structuredClone(SM); node(m, 'placed').members = [{ id: 'it', type: 'uml.InternalTransition', props: { trigger: 'nudge', guard: 'unpaid', effect: 'remind' } }];
  assert.deepEqual(T.rows(m, m.views[0], 'placed').slice(-1), ['nudge [unpaid] / remind']);
  assert.equal(T.word(m, 'nope'), null);
});

test('a member with no string id is reported by validate(), not a throw (audit 1)', () => {
  const m = (members, type = 'uml.State') => ({ schemaVersion: 2, nodes: [{ id: 's', type, label: 'S', members }], edges: [], views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['s'] }] });
  for (const x of [m([{ type: 'uml.InternalTransition', props: { trigger: 'tick' } }]), m([{ id: 7, type: 'uml.InternalTransition', props: { trigger: 'tick' } }]), m([{ type: 'uml.Region' }], 'uml.FinalState')])
    assert.ok(validate(x).length);
});

test('the Owner field stops at a parent that is no element, for every element (audit 1)', () => {
  const o = { schemaVersion: 2, nodes: [{ id: 's1', type: 'uml.State', label: 'Idle', parent: 'gone' }, { id: 's2', type: 'uml.State', label: 'Busy' }], edges: [], views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['s1', 's2'] }] };
  assert.deepEqual(T.owners(o, o.nodes[1]), [{ id: 's1', label: 'Idle' }]);
});

test('a line listed twice in view.edges is drawn and said once: state, activity, use case, overview (audit 4)', () => {
  for (const f of ['order-states', 'fulfil-activity', 'shopping-use-cases', 'buy-book-overview']) {
    const m = JSON.parse(readFileSync(new URL(`../examples/${f}.json`, import.meta.url))), v = m.views[0];
    v.edges = layout(m, v.id).edges.map(e => e.id); const a = describe(m, v.id); v.edges.push(v.edges[0]);
    assert.equal(describe(m, v.id), a, f);
    const ids = layout(m, v.id).edges.map(e => e.id); assert.equal(ids.length, new Set(ids).size, f);
  }
});

test("describe()'s headline counts transitions, not comment links (audit 4)", () => {
  const m = structuredClone(SM), n = describe(m, V.id).split('\n')[0];
  m.nodes.push({ id: 'note1', type: 'uml.Comment', label: 'Paid orders only' }); m.edges.push({ id: 'cl1', type: 'uml.CommentLink', from: 'note1', to: m.edges.find(e => e.type === 'uml.Transition').to });
  if (Array.isArray(m.views[0].nodeIds)) m.views[0].nodeIds.push('note1'); if (Array.isArray(m.views[0].edges)) m.views[0].edges.push('cl1');
  const h = describe(m, V.id).split('\n')[0];
  assert.match(describe(m, V.id), /Comment link from Paid orders only/);
  assert.equal(h.match(/(\d+) transitions/)[1], n.match(/(\d+) transitions/)[1]);
});
