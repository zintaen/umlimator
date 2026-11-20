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
  assert.deepEqual(Object.keys(T.edits).sort(), ['add', 'connect', 'moveTo', 'remove', 'rename']); // connect: a comment link (audit 46)
  assert.deepEqual(['uml.State', 'uml.Pseudostate', 'uml.FinalState'].map(t => T.member.holds({ type: t })), [true, false, false]);
  assert.equal(Object.keys(T.rules).length, 19); // comment-link (audit 46)
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
const PINNED = { // a pseudostate is named by its id (audit 5)
  // audit 27: payment-outcome's line into Fulfilling went in at its top, across the whole box and back to its left border from
  // inside; now it keeps out of the box it ends on, into the left border from outside, and crosses prepaid's line there instead
  // audit 36: the payment region grows to hold the retry loop under its header (its top run ran through the header room), and
  // the extra room takes payment-outcome's line into Fulfilling off prepaid's
  // audit 39: payment-outcome's line into Cancelled ran through Fulfilling, which holds neither end; routed again with the box
  // shut to it, it goes round and crosses nothing
  right: [],
  // audit 26: the payment region holds the retry loop and its label (its label no longer on two lines), and one more crossing;
  // audit 39: payment-outcome's line into Cancelled, routed again round Fulfilling, four fewer
  down: ['view order-life: edges payment-outcome→Fulfilling and prepaid→Payment captured cross', 'view order-life: edges Capturing payment→Cancelled and Capturing payment→Payment captured cross',
    // a label that found no spot and was left off with nothing said: drawn now, on a looser spot (audit 6)
    'view order-life: label "cancel requested / refund the payment" lies on edge Capturing payment→Cancelled',
    'view order-life: label "cancel requested / refund the payment" lies on edge Payment captured→ready'],
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
  'composite-inner': m => { m.edges.push(tr('bad', 'fulfilling', 'picking')); return ['bad', 'fulfilling', 'picking']; },
  'internal-trigger': m => { delete node(m, 'placed').members[0].props.trigger; return ['placed', 'placed.address']; },
  'pseudo-kind': m => { node(m, 'erased').props.kind = 'stop'; return ['erased']; },
  'label-syntax': m => { m.edges.find(e => e.id === 't-picked').props.trigger = 'all [books'; return ['t-picked']; },
  'comment-link': m => { m.edges.push({ id: 'cl', type: 'uml.CommentLink', from: 'placed', to: 'enquiry' }); return ['cl', 'placed', 'enquiry']; }, // audit 46
};
const WARNS = ['comment-link', 'choice-guards', 'composite-entry', 'region-mixed', 'region-cross', 'composite-inner', 'internal-trigger', 'pseudo-kind', 'label-syntax'];
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
  // a local transition (composite to a state it holds) is not drawn, so geo.order and describe() leave it out too (audit 7)
  const inner = structuredClone(SM); BREAKS['composite-inner'](inner);
  assert.ok(!layout(inner, 'order-life').order.includes('bad')); assert.doesNotMatch(describe(inner, 'order-life'), /Fulfilling to Picking/);
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
  assert.deepEqual(r('t-capture-retry', 'evt(a/b) [max(a, b[1]) > 2] / x / y'), ['trigger', 'guard', 'effect'].map((k, i) => ({ op: 'set', id: 't-capture-retry', path: 'props.' + k, value: ['evt(a/b)', 'max(a, b[1]) > 2', 'x / y'][i] })));
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

test('add: a pseudostate with its kind and no name, in the state selected; a region into the selected state, else { error }; anything else the default', () => {
  const add = (e, label, at) => T.edits.add(SM, V, e, label, at), entry = l => T.elements.find(e => e.label === l);
  assert.deepEqual(add(entry('Choice'), ''), [{ op: 'add', element: { id: 'choice1', type: 'uml.Pseudostate', props: { kind: 'choice' } }, view: 'order-life' }]);
  assert.deepEqual(add(entry('Deep history'), '', { sel: ['delivery'] })[0].element, { id: 'deep-history1', type: 'uml.Pseudostate', parent: 'delivery', props: { kind: 'deepHistory' } });
  // audit 14: a state holding substates directly gets a first region for them, the new one beside it, so no region-mixed
  const kids = ['delivery-start', 'in-transit', 'out-for-delivery', 'delivery-history'], rc = add(entry('Region'), 'Returns', { sel: ['delivery'] });
  assert.deepEqual(rc, [{ op: 'add', element: { id: 'delivery.region1', type: 'uml.Region' }, owner: 'delivery' }, ...kids.map(id => ({ op: 'reparent', id, parent: 'delivery.region1' })),
    { op: 'add', element: { id: 'delivery.region2', type: 'uml.Region', label: 'Returns' }, owner: 'delivery' }]);
  assert.deepEqual(validate(apply(SM, rc)).filter(p => p.rule === 'region-mixed'), []);
  assert.deepEqual(add(entry('Region'), '', { sel: ['fulfilling'] }), [{ op: 'add', element: { id: 'fulfilling.region1', type: 'uml.Region' }, owner: 'fulfilling' }], 'a state with regions: one more');
  assert.match(add(entry('Choice'), '', { sel: ['fulfilling'] }).error, /region-mixed.*one of its regions/, 'not directly in a state with regions');
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
  assert.deepEqual(T.edits.moveTo(m, m.views[0], 'cancelled', { pt: [f.x + 4, f.y + 4], geo: g }), [{ op: 'reparent', id: 'cancelled', parent: 'fulfilling.parcel' }, { op: 'set', view: 'order-life', path: ['layout', 'cancelled'], value: undefined }], 'into a region\'s own box: to it');
  // audit 13: a second initial, or a second history of a kind, dropped into a region is refused, not emitted; nor offered by the Owner field
  const k2 = apply(m, [{ op: 'add', element: { id: 'i2', type: 'uml.Pseudostate', props: { kind: 'initial' } } }, { op: 'add', element: { id: 'h2', type: 'uml.Pseudostate', props: { kind: 'shallowHistory' }, parent: 'fulfilling' } }]);
  ['delivery-start', 'delivery-history'].forEach(id => assert.equal(node(k2, id).parent, 'delivery.main'));
  for (const id of ['i2', 'h2']) {
    assert.match(T.edits.moveTo(k2, k2.views[0], id, { pt, geo: g }).error ?? '', /initial-one|history-one/, id);
    assert.ok(!T.owners(k2, node(k2, id)).some(o => o.id === 'delivery.main'), id); }
  assert.equal(T.edits.moveTo(m, m.views[0], 'cancelled', { by: [0, 1], geo: g }), null, 'Alt + arrows: a pin');
  assert.equal(T.edits.moveTo(m, m.views[0], 'delivery', { pt, geo: g }), null, 'into itself: never its own region');
  assert.deepEqual(validate(apply(m, T.edits.moveTo(m, m.views[0], 'cancelled', { pt, geo: g }))).filter(p => p.level === 'error'), []);
  // audit 14: dropped on a state with regions outside their boxes (its header) is refused; an imported region-mixed state
  // draws its direct substate beside its regions, never inside a region stretched over it
  const fu = g.families.find(x => x.id === 'fulfilling');
  assert.match(T.edits.moveTo(m, m.views[0], 'cancelled', { pt: [fu.x + 6, fu.y + 6], geo: g }).error ?? '', /region-mixed.*one of its regions/);
  const mx = layout(apply(SM, [{ op: 'reparent', id: 'cancelled', parent: 'fulfilling' }]), 'order-life'), c = mx.byId.cancelled;
  for (const r of mx.families.filter(x => x.id.startsWith('fulfilling.'))) assert.ok(c.x >= r.x + r.w || c.x + c.w <= r.x || c.y >= r.y + r.h || c.y + c.h <= r.y, r.id);
  // audit 15: one of two direct substates of an imported region-mixed state dropped into a region lessens the warning: allowed
  const rm = { schemaVersion: 2, nodes: [{ id: 's', type: 'uml.State', label: 'S', members: [{ id: 'r1', type: 'uml.Region' }, { id: 'r2', type: 'uml.Region' }] },
    { id: 'k1', type: 'uml.State', label: 'K1', parent: 's' }, { id: 'k2', type: 'uml.State', label: 'K2', parent: 's' }], edges: [], views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['s', 'k1', 'k2'] }] };
  const rg = { families: [{ id: 's', x: 0, y: 0, w: 400, h: 300 }, { id: 'r1', x: 10, y: 30, w: 180, h: 260 }] };
  assert.deepEqual(T.edits.moveTo(rm, rm.views[0], 'k1', { pt: [50, 100], geo: rg }), [{ op: 'reparent', id: 'k1', parent: 'r1' }]);
  assert.match(T.edits.moveTo(apply(rm, [{ op: 'reparent', id: 'k1', parent: 'r1' }]), rm.views[0], 'k1', { pt: [6, 6], geo: rg }).error ?? '', /region-mixed/, 'back out: refused');
});

test('the Owner field: every state and region by its name from the top; deleting a state takes its regions and what they hold', () => {
  const o = T.owners(SM, node(SM, 'cancelled'));
  // a state with regions is no owner, its regions are (audit 14: region-mixed); but where x already is
  assert.deepEqual(o.slice(0, 3), [{ id: 'placed', label: 'Placed' }, { id: 'fulfilling.parcel', label: 'Fulfilling / Parcel' }, { id: 'fulfilling.payment', label: 'Fulfilling / Payment' }]);
  assert.equal(o.length, 9 + 2, 'nine of the ten other states, two regions');
  const mixed = apply(SM, [{ op: 'reparent', id: 'cancelled', parent: 'fulfilling' }]);
  assert.ok(T.owners(mixed, node(mixed, 'cancelled')).some(x => x.id === 'fulfilling'), 'where it is: kept');
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
  // and prints the edit against S15's 100 ms; docs/diagrams/conformance records the idle machine's figure
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
  // a pseudostate or final state, drawn with no name, is named by its kind, as its accessible name, never by its id (audit 30)
  assert.ok(!['created', 'payment-outcome', 'prepaid', 'delivery-history', 'erased', 'delivered'].some(id => row[id]), Object.keys(row).join(', '));
  assert.deepEqual(row['Initial pseudostate'], ['Initial pseudostate', []]);
  assert.deepEqual(row.Choice, ['Choice', []]);
  assert.deepEqual(row.Fork, ['Fork', []]);
  assert.deepEqual(row['Shallow history'], ['Shallow history', []]);
  assert.deepEqual(row.Terminate, ['Terminate', []]);
  assert.deepEqual(row['Final state'], ['Final state', []]);
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

test('audit 8: F2 and add never emit an edit that breaks a rule: { error } instead; a pseudostate goes into the state selected', () => {
  assert.match(T.edits.rename(SM, V, 't-created', 'go [ready]').error, /initial-out/);
  assert.match(T.edits.rename(SM, V, 't-prepaid-picking', '[g]').error, /fork-join/);
  const add = (kind, sel) => T.edits.add(SM, V, { type: 'uml.Pseudostate', props: { kind } }, '', { sel });
  assert.match(add('initial', []).error, /initial-one/); assert.match(add('shallowHistory', []).error, /history-owner/);
  const r = add('deepHistory', ['delivery']);
  assert.equal(r[0].element.parent, 'delivery'); assert.deepEqual(validate(apply(SM, r)).filter(p => p.level === 'error'), []);
});

test('audit 17: a region draws and says its «stereotypes»; a pseudostate and a final state, glyphs with no text, are not offered them', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/order-states.json', import.meta.url))), V = m.views[0], T = diagramOf(V);
  assert.deepEqual([T.props['uml.Pseudostate'].map(f => f.key), T.props['uml.FinalState'].map(f => f.key), T.props['uml.Region'].map(f => f.key)], [['kind'], [], ['stereotypes']]);
  const reg = m.nodes.flatMap(n => n.members || []).find(x => x.type === 'uml.Region' && x.label); (reg.props ||= {}).stereotypes = ['audited'];
  const g = layout(m, V.id), f = g.families.find(x => x.id === reg.id), svg = svgOf(g);
  assert.equal(f.rname, `«audited» ${reg.label}`);
  assert.match(f.aria, new RegExp(`^Region ${reg.label} \\(audited\\) of `));
  assert.ok(svg.includes(`>«audited» ${reg.label}</text>`), 'drawn');
  const plain = layout(JSON.parse(readFileSync(new URL('../examples/order-states.json', import.meta.url))), V.id).families.find(x => x.id === reg.id);
  assert.equal(plain.rname, reg.label); // no stereotypes: its name, as before
  const un = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.State', label: 'S', members: [{ id: 'S.r', type: 'uml.Region', props: { stereotypes: ['x'] } }, { id: 'S.q', type: 'uml.Region' }] },
    { id: 'a', type: 'uml.State', label: 'A', parent: 'S.r' }, { id: 'b', type: 'uml.State', label: 'B', parent: 'S.q' }], views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['S', 'a', 'b'] }] };
  assert.equal(layout(un, 'v').families.find(x => x.id === 'S.r').rname, '«x»'); // a region with no name: its stereotypes alone
});

test('audit 20: the state machine rules and F2 count a view\'s own transitions (view.edges objects), which the view draws', () => {
  const m = structuredClone(SM), v = m.views[0], t0 = m.edges.find(e => e.from === 'created'), fin = m.nodes.find(n => n.type === 'uml.FinalState');
  const auth = m.edges.find(e => e.id === 't-authorised'), own = { ...structuredClone(auth), id: 'own-auth' };
  m.edges = m.edges.filter(e => e !== t0 && e !== auth);
  v.edges = [...m.edges.map(e => e.id), t0, own, tr('own-from-final', fin.id, 'placed')];
  const g = layout(m, v.id); assert.ok(['t-created', 'own-from-final', 'own-auth'].every(id => g.edges.some(e => (e._id ?? e.id) === id)), 'drawn');
  const errs = validate(m).filter(p => p.level !== 'info');
  assert.deepEqual(errs.map(p => [p.level, p.rule, p.path]), [['error', 'final-out', `nodes[${m.nodes.indexOf(fin)}]`]]);
  assert.ok(errs[0].message.includes('(own-from-final)'), errs[0].message);
  // the same lines in the model: the same problems
  const same = structuredClone(SM); same.edges.push(tr('own-from-final', fin.id, 'placed'));
  assert.deepEqual(validate(same).filter(p => p.level !== 'info').map(p => [p.level, p.rule]), [['error', 'final-out']]);
  // a view's own transition out of a choice with no guard: choice-guards, at its path in the view
  const b = structuredClone(m); delete b.views[0].edges.find(e => e.id === 'own-auth').props;
  const cg = validate(b).filter(p => p.rule === 'choice-guards'); assert.equal(cg.length, 1); assert.ok(cg[0].ids.includes('own-auth'));
  // F2 on the view's own transition reads trigger [guard] / effect
  const r = T.edits.rename(m, v, 'own-auth', 'paid [card ok] / ship');
  assert.deepEqual(r, [{ op: 'set', id: 'own-auth', path: 'props.trigger', value: 'paid' }, { op: 'set', id: 'own-auth', path: 'props.guard', value: 'card ok' }, { op: 'set', id: 'own-auth', path: 'props.effect', value: 'ship' }]);
  const n = apply(m, r), ge = layout(n, v.id).edges.find(e => (e._id ?? e.id) === 'own-auth');
  assert.equal(ge.label, 'paid [card ok] / ship'); assert.equal(n.views[0].edges.find(e => e.id === 'own-auth').label, undefined);
  // the rules the add and move hooks guard with (stGuard): a second transition out of the initial, a view's own, is initial-out
  const two = structuredClone(m); two.views[0].edges.push(tr('own-2', 'created', 'cancelled'));
  assert.ok(validate(two).some(p => p.rule === 'initial-out' && p.level === 'error'));
});

test('audit 21: each view\'s own transitions are checked with that view alone: two views together trip no rule neither has, and an edit in one is not refused for another\'s', () => {
  const st = (id, more = {}) => ({ id, type: 'uml.State', label: id.toUpperCase(), ...more });
  const m = { schemaVersion: 2, nodes: [{ id: 'i', type: 'uml.Pseudostate', props: { kind: 'initial' } }, st('a'), st('b')], edges: [],
    views: [{ id: 'v1', diagram: 'uml.state-machine', nodeIds: ['i', 'a', 'b'], edges: [tr('t1', 'i', 'a')] }, { id: 'v2', diagram: 'uml.state-machine', nodeIds: ['i', 'a', 'b'], edges: [tr('t2', 'i', 'b')] }] };
  assert.deepEqual(validate(m).filter(p => p.level !== 'info').map(p => p.message), [], 'each view draws one transition out of the initial');
  const both = structuredClone(m); both.views[0].edges.push(tr('t3', 'i', 'b'));
  assert.deepEqual(validate(both).filter(p => p.rule === 'initial-out').map(p => p.path), ['nodes[0]'], 'two in one view: initial-out, as before');
  // a fork whose targets view v1 draws in two regions of S; in v2, which draws none of its lines, y moved into x's region is no error of v2's
  const f = { schemaVersion: 2, nodes: [st('S', { members: [{ id: 'r1', type: 'uml.Region' }, { id: 'r2', type: 'uml.Region' }] }), st('x', { parent: 'r1' }), st('y', { parent: 'r2' }),
    { id: 'f', type: 'uml.Pseudostate', props: { kind: 'fork' } }], edges: [],
  views: [{ id: 'v1', diagram: 'uml.state-machine', nodeIds: ['S', 'x', 'y', 'f'], edges: [tr('fx', 'f', 'x'), tr('fy', 'f', 'y')] }, { id: 'v2', diagram: 'uml.state-machine', nodeIds: ['S', 'x', 'y', 'f'], edges: [] }] };
  const at = { pt: [50, 50], geo: { families: [{ id: 'r1', x: 0, y: 0, w: 100, h: 100 }] } };
  assert.deepEqual(T.edits.moveTo(f, f.views[1], 'y', at), [{ op: 'reparent', id: 'y', parent: 'r1' }]);
  assert.match(T.edits.moveTo(f, f.views[0], 'y', at).error, /^fork-join: /, 'in v1, which draws the fork\'s lines: refused');
});

// audit 23: a view's own nodes read as the model's in the PDF's Kind and Members columns (word, rows) and in the panel's
// Owner field (owners), which offers a view's own owner to what that view alone holds, never to a model element
test('word, rows and owners read a view\'s own nodes as the model\'s; a model element is offered no view-own owner (audit 23)', () => {
  const st = [{ id: 'init', type: 'uml.Pseudostate', props: { kind: 'initial' } }, { id: 'comp', type: 'uml.State', label: 'Busy', members: [{ id: 'r1', type: 'uml.Region', label: 'A' }, { id: 'r2', type: 'uml.Region', label: 'B' }] }, { id: 'sub', type: 'uml.State', label: 'Sub', parent: 'r1' }];
  const part = [{ id: 'lane', type: 'uml.ActivityPartition', label: 'Warehouse' }, { id: 'act', type: 'uml.CallBehaviorAction', label: 'Pack', parent: 'lane' }];
  const ask = (d, nodes, own, ids, ownerOf) => { const m = { schemaVersion: 2, nodes, edges: [], views: [{ id: 'v', diagram: d, nodeIds: [...nodes, ...own].map(n => n.id), nodes: own }] }, v = m.views[0], T = diagramOf(v);
    const x = [...nodes, ...own].find(n => n.id === ownerOf), c = mapContext(m), rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.join('');
    return { ...Object.fromEntries(ids.map(id => [id, [T.word(m, id), T.word(m, id, v), T.rows(m, v, id)]])), owners: [(T.owners(m, x) || []).map(o => o.id), (T.owners(m, x, v) || []).map(o => o.id)], rows }; };
  for (const [d, all, ids, ownerOf] of [['uml.state-machine', st, ['init', 'comp'], 'sub'], ['uml.activity', part, ['act', 'lane'], 'act']]) {
    const model = ask(d, all, [], ids, ownerOf), own = ask(d, [], all, ids, ownerOf);
    assert.deepEqual(own, model, d);
    assert.ok(model.owners[0].length && model.rows.length, d);
  }
  // a model element in the view: the view's own partition is no owner it is offered; the model's is
  const m = { schemaVersion: 2, nodes: [{ id: 'mp', type: 'uml.ActivityPartition', label: 'Shop' }, { id: 'a', type: 'uml.Action', label: 'Pack' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.activity', nodeIds: ['mp', 'a', 'lane', 'oa'], nodes: [{ id: 'lane', type: 'uml.ActivityPartition', label: 'Warehouse' }, { id: 'oa', type: 'uml.Action', label: 'Own' }] }] }, T = diagramOf(m.views[0]);
  assert.deepEqual(T.owners(m, m.nodes[1], m.views[0]).map(o => o.id), ['mp']);
  assert.deepEqual(T.owners(m, m.views[0].nodes[1], m.views[0]).map(o => o.id), ['mp', 'lane']);
});

test('audit 24: two transitions out of a substate and one into the next, a stub\'s length apart, are drawn apart (no shared line)', () => {
  const T = (id, from, to, trigger) => ({ id, type: 'uml.Transition', from, to, ...(trigger ? { props: { trigger } } : {}) });
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.State', label: 'Fulfilling' },
    { id: 'a', type: 'uml.State', label: 'Picking', parent: 'S' }, { id: 'b', type: 'uml.State', label: 'X', parent: 'S' }, { id: 'c', type: 'uml.State', label: 'Packed', parent: 'S' },
    { id: 'w', type: 'uml.State', label: 'Waiting for payment' }, { id: 'd', type: 'uml.State', label: 'Done' }],
    edges: [T('t0', 'a', 'b'), T('t1', 'b', 'c'), T('x0', 'w', 'c', 'e0'), T('x1', 'b', 'd', 'e1'), T('x3', 'b', 'd', 'e3')],
    views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['S', 'a', 'b', 'c', 'w', 'd'] }] };
  assert.deepEqual(check(m, 'v').map(p => p.message).filter(t => !/ cross$/.test(t)), []);
});

test('audit 25: Shift + Delete on a region of a state the view holds as its own says what went with it, as a model state\'s', () => {
  const own = { schemaVersion: 2, root: 'sm', nodes: [{ id: 'a', type: 'uml.State', label: 'A' }], edges: [],
    views: [{ id: 'sm', diagram: 'uml.state-machine', nodeIds: ['a', 's', 'b'], nodes: [
      { id: 's', type: 'uml.State', label: 'S', members: [{ id: 'r1', type: 'uml.Region', label: 'R1' }, { id: 'r2', type: 'uml.Region', label: 'R2' }] },
      { id: 'b', type: 'uml.State', label: 'B', parent: 'r1' }] }] };
  const inModel = { ...own, nodes: [...own.nodes, ...own.views[0].nodes], views: [{ ...own.views[0], nodes: undefined }] };
  const want = { commands: [{ op: 'delete', id: 'r1' }], say: 'Deleted region R1 and the 1 element it held' };
  assert.deepEqual(T.edits.remove(inModel, inModel.views[0], ['r1'], true), want);
  assert.deepEqual(T.edits.remove(own, own.views[0], ['r1'], true), want);
  assert.deepEqual(T.edits.remove(own, own.views[0], ['r1'], false), want, 'Delete deletes an own region too (the canvas\'s), and says so');
  assert.equal(T.edits.remove(own, own.views[0], ['r1', 'a'], false), null, 'with a model state in it: the canvas\'s Delete');
});

test('audit 26: Delete (out of the view) on a composite state takes the states and pseudostates shown within it, said on the hint line', () => {
  const r = T.edits.remove(SM, V, ['delivery'], false), subs = SM.nodes.filter(n => n.parent === 'delivery').map(n => n.id);
  assert.deepEqual(r.commands, ['delivery', ...V.nodeIds.filter(id => subs.includes(id))].map(id => ({ op: 'hide', id, view: V.id })));
  assert.equal(r.say, `Removed In delivery from the view with the ${subs.length} elements it holds`);
  const m = apply(SM, r.commands), g = layout(m, V.id);
  assert.deepEqual(g.nodes.filter(n => subs.includes(n.id)), [], 'no substate is drawn loose at the top');
  // a state of two regions: both regions' states go, at any depth
  const two = T.edits.remove(SM, V, ['fulfilling'], false), within = id => { for (let p = SM.nodes.find(n => n.id === id)?.parent; p; p = SM.nodes.find(n => n.id === p)?.parent ?? SM.nodes.find(n => (n.members || []).some(x => x.id === p))?.id) if (p === 'fulfilling') return true; return false; };
  assert.deepEqual(two.commands.map(c => c.id).slice(1).sort(), V.nodeIds.filter(within).sort());
  assert.ok(two.commands.every(c => c.op === 'hide'));
  // a simple state, and Delete from the model, are the canvas's as before
  assert.equal(T.edits.remove(SM, V, ['placed'], false), null);
  assert.equal(T.edits.remove(SM, V, ['delivery'], true), null);
});

test('audit 26: laid out down, a composite state holds a two-way pair\'s fanned labels and a loop\'s label, so none is set on another line', async () => {
  const { readMermaidState } = await import('../src/readers/mermaid-state.js');
  const on = (m, v) => check(m, v).map(p => p.message).filter(t => /lies on edge/.test(t));
  const kb = readMermaidState(['stateDiagram-v2', '[*] --> Active', 'state Active {', '  [*] --> NumLockOff', '  NumLockOff --> NumLockOn : EvNumLockPressed', '  NumLockOn --> NumLockOff : EvNumLockPressed', '}'].join('\n')).model;
  assert.equal(kb.views[0].direction ?? 'down', 'down', 'Mermaid\'s default');
  assert.deepEqual(on(kb, kb.views[0].id), [], 'Mermaid\'s keyboard example');
  const g = layout(kb, kb.views[0].id), box = g.families.find(f => f.id === 'Active');
  for (const e of g.edges.filter(x => x.lbl)) assert.ok(e.lbl.x >= box.x + 3 && e.lbl.x + e.lbl.w <= box.x + box.w - 3, `${e.id}: its label inside the composite`);
  const os = withDir(SM, 'down');
  assert.deepEqual(on(os, V.id).filter(t => /attempts < 3/.test(t)), [], 'the retry loop\'s label inside its region');
  // laid out right, as before (the room is the down view's alone)
  assert.deepEqual(on(SM, V.id), []);
});

// audit 27: laid out right, a self-loop and a two-way pair with sentence-length labels out of the same state: the pair's
// other line and its label left the outgoing line no clean track, and with reroute off it climbed through the loop
test('audit 28: a kind outside the view\'s own, or no type, is named in words, alike in the drawn box, describe() and the PDF', () => {
  for (const [d, t, own] of [['uml.state-machine', 'uml.State', 'State Idle'], ['uml.use-case', 'uml.UseCase', 'Use case Idle'], ['uml.activity', 'uml.Action', 'Action Idle']]) {
    const m = { schemaVersion: 2, title: 'f', nodes: [{ id: 's', type: t, label: 'Idle' }, { id: 'plain', label: 'Plain' }, { id: 'db', type: 'uml.DataType', label: 'Money' }, { id: 'order', type: 'uml.Class', label: 'Order' }], edges: [],
      views: [{ id: 'v', diagram: d, nodeIds: ['s', 'plain', 'db', 'order'] }] };
    const c = mapContext(m), svg = c.buildView('v').markup, aria = id => (new RegExp(`data-id="${id}"[^>]*aria-label="([^"]*)"`).exec(svg) || [])[1];
    assert.deepEqual(['s', 'plain', 'db', 'order'].map(aria), [own, 'Element Plain', 'Data type Money', 'Class Order'], `${d}: the drawn boxes`);
    assert.deepEqual(describe(m, 'v').split('\n').slice(1).filter(l => !/^Lines?:|^$/.test(l)).slice(0, 4), [own, 'Element Plain', 'Data type Money', 'Class Order'].map(x => x + '.'), `${d}: describe()`);
    const rows = tablesOf(c, c.V.v, c.buildGeo('v'))[0].rows.map(r => r.split('<td>').slice(1).map(x => x.replace(/<[^>]+>/g, '')));
    assert.deepEqual(['Plain', 'Money', 'Order'].map(l => rows.find(r => r[0] === l)[1]), ['Element', 'Data type', 'Class'], `${d}: the PDF's Kind`);
  }
});

test('audit 27: a self-loop beside a two-way pair laid out right (an ordinary Mermaid LR state diagram) crosses nothing', async () => {
  const { readMermaidState } = await import('../src/readers/mermaid-state.js');
  const src = ['stateDiagram-v2', 'direction LR', '[*] --> A', 'A --> B : go there now', 'B --> A : come back here', 'A --> A : self loop label'];
  for (const d of ['LR', 'TB']) {
    const m = readMermaidState(src.join('\n').replace('direction LR', 'direction ' + d)).model, v = m.views[0].id;
    assert.deepEqual(check(m, v), [], d);
    const g = layout(m, v), loop = g.edges.find(e => e.from === e.to), ab = g.edges.find(e => e.from !== e.to && e.label === 'go there now');
    assert.ok(loop && ab, d);
  }
});

test('audit 28: a line of another kind a view lists, which a state machine, requirement, sequence, timing, communication, mindmap or cloud view does not draw, is said by validate()', async () => {
  for (const p of ['sysml/requirement.js', 'uml/sequence.js', 'uml/timing.js', 'uml/communication.js', 'mindmap/mindmap.js', 'cloud/cloud.js', 'uml/class.js']) await import(`../src/${p}`);
  const kinds = { 'uml.state-machine': ['uml.State', 'a state machine diagram'], 'sysml.requirement': ['sysml.Requirement', 'a requirement diagram'], 'uml.sequence': ['uml.Lifeline', 'a sequence diagram'],
    'uml.timing': ['uml.Lifeline', 'a timing diagram'], 'uml.communication': ['uml.Lifeline', 'a communication diagram'], mindmap: ['mindmap.Topic', 'a mindmap'], gcp: ['gcp.Product', 'a Google Cloud diagram'],
    azure: ['azure.Service', 'an Azure diagram'], aws: ['aws.Service', 'an AWS diagram'] };
  for (const [d, [t, said]] of Object.entries(kinds)) {
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: t, label: 'A', props: { text: 't', reqId: 'R1' } }, { id: 'b', type: t, label: 'B', props: { text: 't', reqId: 'R2' } }],
      edges: [{ id: 'x', type: 'uml.Dependency', from: 'a', to: 'b', label: 'uses' }], views: [{ id: 'v', diagram: d, nodeIds: ['a', 'b'], edges: ['x', { id: 'y', from: 'a', to: 'b' }] }] };
    assert.ok(!layout(m, 'v').edges.some(e => e.id === 'x' || e.id === 'y'), `${d}: not drawn`);
    const ps = validate(m).filter(p => /not drawn$/.test(p.message) && /^views\[0\]\.edges\[\d+\]$/.test(p.path)); // the line's own; its type's says not drawn too (audit 30)
    assert.deepEqual(ps.map(p => [p.level, p.path, p.message]), [['warning', 'views[0].edges[0]', `view "v" lists dependency "x", a line ${said} does not draw: not drawn`],
      ['warning', 'views[0].edges[1]', `view "v" lists "y", a line with no type, which ${said} does not draw: not drawn`]], d);
  }
  // a kind the view draws is no problem; nor is a line of another kind in a view that draws it
  const st = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.State', label: 'A' }, { id: 'b', type: 'uml.State', label: 'B' }, { id: 'c', type: 'uml.Class', label: 'C' }],
    edges: [{ id: 't', type: 'uml.Transition', from: 'a', to: 'b' }, { id: 'x', type: 'uml.Dependency', from: 'a', to: 'c' }],
    views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['a', 'b'], edges: ['t'] }, { id: 'w', diagram: 'uml.class', nodeIds: ['c', 'a'], edges: ['x'] }] };
  assert.deepEqual(validate(st).filter(p => /not drawn$/.test(p.message)), []);
});

test('audit 31: a message names a region as region "Parcel", not its name and id quoted as one name; one of no name by its id', () => {
  const m = structuredClone(SM), pick = m.nodes.find(n => /pick/.test(n.id)).id, cap = m.nodes.find(n => /captur/.test(n.id)).id;
  m.edges.push({ id: 'bad', type: 'uml.Transition', from: pick, to: cap });
  const ini = m.nodes.find(n => n.type === 'uml.Pseudostate' && n.props && n.props.kind === 'initial' && /parcel/.test(String(n.parent)));
  m.nodes = m.nodes.filter(n => n !== ini); m.edges = m.edges.filter(e => e.from !== ini.id && e.to !== ini.id); m.views.forEach(v => { v.nodeIds = v.nodeIds.filter(i => i !== ini.id); });
  const said = validate(m).map(p => p.message);
  assert.ok(said.some(s => s.startsWith('composite-entry: ') && s.endsWith(', and region "Parcel" has no initial pseudostate')), JSON.stringify(said));
  assert.ok(said.includes('region-cross: bad joins "Picking" in region "Parcel" and "Capturing payment" in region "Payment", two regions of "Fulfilling"'), JSON.stringify(said));
  assert.ok(!said.some(s => /fulfilling\.p/.test(s)), 'no named region\'s id');
  const u = structuredClone(m), f = u.nodes.find(n => n.id === 'fulfilling'); f.members.find(r => /parcel/.test(r.id)).label = undefined;
  const r = f.members.find(x => /parcel/.test(x.id)).id;
  assert.ok(validate(u).map(p => p.message).some(s => s.includes(`in region ${r} and`)), 'a region of no name by its id');
});

// audit 36: the 32 px a box keeps from a card outside it held one of the card's loops, not two: the second ran inside the
// composite state above it, 2 px from its border. The box holding the card let a third run out through its right side
test('a state with two, three or four self-transitions keeps its loops out of the composite state above it and inside the one that holds it, right and down (audit 36)', () => {
  const N = (id, label, parent) => ({ id, type: 'uml.State', label, ...(parent ? { parent } : {}) }), Tr = (id, from, to, label) => ({ id, type: 'uml.Transition', from, to, ...(label ? { label } : {}) });
  const inside = (p, b) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;
  for (const k of [1, 2, 3, 4]) for (const direction of ['right', 'down']) {
    const m = { schemaVersion: 2, nodes: [{ id: 'init', type: 'uml.Pseudostate', props: { kind: 'initial' } }, N('s1', 'Working'), N('s3', 'Idle', 's1'), N('s5', 'Busy', 's1'), N('s6', 'Inner', 's5'), N('s7', 'Done')],
      edges: [Tr('t0', 'init', 's1'), ...['tick', 'retry', 'again', 'more'].slice(0, k).map((l, i) => Tr('l' + i, 's3', 's3', l)), Tr('t5', 's6', 's7', 'finish')],
      views: [{ id: 'v', diagram: 'uml.state-machine', direction, nodeIds: ['init', 's1', 's3', 's5', 's6', 's7'] }] };
    const what = `${k} loops, ${direction}`;
    assert.deepEqual(check(m, 'v').map(p => p.message), [], what);
    const g = layout(m, 'v'), busy = g.families.find(f => f.id === 's5'), working = g.families.find(f => f.id === 's1');
    for (const e of g.edges.filter(x => x.from === 's3' && x.to === 's3')) {
      // every corner and the middle of every run: clear of Busy by 8 px, and inside Working
      const pts = e.pts.flatMap((p, j) => (j ? [p, [(p[0] + e.pts[j - 1][0]) / 2, (p[1] + e.pts[j - 1][1]) / 2]] : [p]));
      assert.ok(pts.every(p => !inside(p, { x: busy.x - 8, y: busy.y - 8, w: busy.w + 16, h: busy.h + 16 })), `${what}: ${e.id} ${JSON.stringify(e.pts)} keeps off Busy ${JSON.stringify([busy.x, busy.y, busy.w, busy.h])}`);
      assert.ok(pts.every(p => inside(p, working)), `${what}: ${e.id} stays in Working`);
    }
  }
});

// audit 37: four state machines the round-36 fuzzer found, laid out right. Small models, so each finding is the one named
const st37 = (nodes, edges) => {
  const N = ([id, label, parent]) => ({ id, type: 'uml.State', label, ...(parent ? { parent } : {}) });
  const ns = [{ id: 'init', type: 'uml.Pseudostate', props: { kind: 'initial' } }, ...nodes.map(N)], es = edges.map(([id, from, to, label]) => ({ id, type: 'uml.Transition', from, to, ...(label ? { label } : {}) }));
  return { schemaVersion: 2, nodes: ns, edges: es, views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ns.map(n => n.id) }] };
};
const notCross = m => check(m, 'v').map(p => p.message).filter(p => !/ cross$/.test(p));

// a line moved to the bottom of S0 (its right side held three) ran down onto the loop S2, below it, comes into its top by
test('audit 37: a line out of the bottom of a state keeps off the self-transition of the state under it, laid out right', () => {
  const m = st37([['s0', 'S0'], ['s2', 'S2'], ['s4', 'S4'], ['s6', 'S6'], ['s7', 'S7'], ['s8', 'S8'], ['s9', 'S9']],
    [['t0', 'init', 's0'], ['t1', 's9', 's7'], ['t3', 's0', 's8'], ['t4', 's0', 's6'], ['t5', 's2', 's6'], ['t6', 's2', 's2'], ['t9', 's4', 's2'], ['t10', 's7', 's8']]);
  m.nodes.push({ id: 'fin', type: 'uml.FinalState' }); m.views[0].nodeIds.push('fin');
  m.edges.push({ id: 't2', type: 'uml.Transition', from: 's0', to: 'fin' }, { id: 't8', type: 'uml.Transition', from: 's2', to: 'fin' });
  assert.deepEqual(notCross(m), []);
});

// S1 sat 8 px right of S4's loop: the port of S5→S1 on S1's left side lay level with the loop's first run, its stub ended on
// it, and the line was routed over S1, down through its name strip and in at its left side
test('audit 37: a composite state beside a state with a self-transition keeps a stub\'s room from the loop, laid out right', () => {
  const m = st37([['s0', 'S0'], ['s1', 'S1'], ['s2', 'S2', 's1'], ['s4', 'S4'], ['s5', 'S5']],
    [['t1', 's0', 's5', 'e1'], ['t3', 's5', 's1', 'e3'], ['t4', 's5', 's4', 'evt4 [x > 4] / act()'], ['t5', 's4', 's2', 'e5'], ['t8', 's4', 's4', 'e8']]);
  assert.deepEqual(notCross(m), []);
  const g = layout(m, 'v'), s1 = g.families.find(f => f.id === 's1'), loop = g.edges.find(e => e.id === 't8');
  assert.ok(s1.x - Math.max(...loop.pts.map(p => p[0])) >= 32, `S1 at ${s1.x}, the loop to ${Math.max(...loop.pts.map(p => p[0]))}`);
});

// four transitions from a composite state to the state beside it: two went to its top, both up the one track by the box
test('audit 37: four to seven transitions between a composite state and the state beside it each keep a track of their own, laid out right', () => {
  for (const two of [false, true]) for (const k of [4, 5, 6, 7]) {
    const m = st37([['a', 'Idle'], ['a1', 'Inner', 'a'], ['b', 'Busy']], [['t0', 'init', 'a'],
      ...Array.from({ length: k }, (_, i) => ['p' + i, two && i % 2 ? 'b' : 'a', two && i % 2 ? 'a' : 'b', i % 2 ? 'evt' + i + ' [x > 1] / act()' : 'e' + i])]);
    assert.deepEqual(notCross(m), [], `${k}${two ? ', both ways' : ''}`);
  }
});

// a line into S3 crossed S2's left border inside its name strip: the room S5's loop takes moved the box down level with
// S4's port, and the router's last resort ran through the title, which it held no worse than a crossing
test('audit 37: a transition into a nested state enters the composite state below its name, laid out right', () => {
  const m = st37([['s0', 'S0'], ['s1', 'S1'], ['s2', 'S2'], ['s3', 'S3', 's2'], ['s4', 'S4'], ['s5', 'State with a longer name 5', 's2']],
    [['t1', 's3', 's5', 'e1'], ['t2', 's4', 's3', 'evt2 [x > 2] / act()'], ['t5', 's0', 's4', 'e5'], ['t6', 's2', 's4', 'evt6 [x > 6] / act()'], ['t7', 's5', 's5', 'e7'], ['t8', 's1', 's3', 'e8']]);
  m.nodes.shift(); m.views[0].nodeIds.shift();
  assert.deepEqual(notCross(m), []);
});

// audit 38: state machines the round-37 fuzzer and the lanes found. A spur: a run that goes back against the run two before it
// across a step shorter than a stub (the line runs out, steps aside and runs back along itself)
const spur = P => P.slice(3).some((d, i) => { const [a, b, c] = [P[i], P[i + 1], P[i + 2]], u = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], w = [Math.sign(d[0] - c[0]), Math.sign(d[1] - c[1])];
  return u[0] === -w[0] && u[1] === -w[1] && (u[0] || u[1]) && Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]) < 18; });

// the 32 px a box keeps right of a state's loop moved a two-level composite state so that its bottom border lay 3 px over the
// row of S6 and S7; S6→S7, shut in by S7→S6, ran along the border into S7, as the router kept to coming into S7's stub head on
test('audit 38: a transition from a state beside a two-level composite state keeps off the composite\'s border, laid out right', () => {
  const m = st37([['s0', 'S0'], ['s1', 'S1'], ['s2', 'S2', 's1'], ['s3', 'S3'], ['s4', 'S4', 's2'], ['s5', 'S5', 's2'], ['s6', 'S6'], ['s7', 'S7']],
    [['t0', 'init', 's0'], ['t1', 's0', 's6', 'e1'], ['t2', 's7', 's7'], ['t3', 's6', 's7', 'evt3 [x > 3] / act()'], ['t4', 's1', 's6', 'evt4 [x > 4] / act()'], ['t5', 's6', 's6', 'e5'], ['t6', 's4', 's6', 'e6'],
      ['t7', 's3', 's7', 'evt7 [x > 7] / act()'], ['t8', 's6', 's1'], ['t9', 's3', 's3'], ['t10', 's0', 's0'], ['t11', 's5', 's7'], ['t12', 's7', 's6', 'e12'], ['t13', 's6', 's3', 'evt13 [x > 13] / act()']]);
  assert.deepEqual(notCross(m), []);
});

// five or more transitions between a composite state (one to four states in it) or a plain state and the state beside it: two
// shared a track up the gap, or crossed, and one ran out and stepped back along itself. Each now meets the composite level with
// where it runs, and the lines between the pair nest
test('audit 38: five to seven transitions between a composite or a plain state and the state beside it neither cross nor share a line, laid out right', () => {
  for (const inner of [1, 2, 3, 4, 0]) for (const both of [false, true]) for (const k of [5, 6, 7]) {
    const kids = Array.from({ length: inner || 3 }, (_, i) => ['c' + i, 'Inner ' + i, ...(inner ? ['w'] : [])]);
    const m = st37([['w', 'Working'], ...kids, ['d', 'Done']], [['t0', 'init', 'w'],
      ...Array.from({ length: k }, (_, i) => ['x' + i, both && i % 2 ? 'd' : 'w', both && i % 2 ? 'w' : 'd', i % 2 ? 'evt' + i + ' [x > 1] / act()' : 'ev' + i])]);
    const what = `${inner ? inner + ' in the composite' : 'a plain state'}, ${k}${both ? ', both ways' : ''}`;
    assert.deepEqual(check(m, 'v').map(p => p.message), [], what);
    for (const e of layout(m, 'v').edges) assert.ok(!spur(e.pts), `${what}: ${e.id} ${JSON.stringify(e.pts)}`);
  }
});

// laid out down, a composite state's ports on its top went right of its title, and its box was only as wide as the title: the
// line out of the state inside it to the state above crossed the title
test('audit 38: laid out down, a transition out of a composite state with a long name keeps off its name', () => {
  const m = st37([['s0', 'S0'], ['s1', 'State with a longer name 1'], ['s2', 'S2'], ['s3', 'S3', 's1'], ['s4', 'S4']],
    [['t0', 'init', 's0'], ['t1', 's1', 's1'], ['t2', 's3', 's1', 'evt2 [x > 2] / act()'], ['t3', 's0', 's0', 'evt3 [x > 3] / act()'], ['t4', 's3', 's4'], ['t5', 's2', 's3', 'e5'], ['t6', 's4', 's2', 'evt6 [x > 6] / act()'], ['t7', 's0', 's4']]);
  m.views[0].direction = 'down';
  assert.deepEqual(notCross(m), []);
});

// laid out down, S1→S0 and S1→S0 crossed; their ports swapped, and the one moved ran down the track of S3→S4, which has no end in
// common with it: a swap that saves a crossing so is no gain
test('audit 38: laid out down, transitions with no end in common keep off each other\'s track', () => {
  const m = st37([['s0', 'S0'], ['s1', 'State with a longer name 1'], ['s2', 'S2'], ['s3', 'S3'], ['s4', 'State with a longer name 4'], ['s5', 'State with a longer name 5']],
    [['t0', 'init', 's0'], ['t1', 's4', 's0', 'evt1 [x > 1] / act()'], ['t2', 's0', 's5', 'evt2 [x > 2] / act()'], ['t3', 's1', 's3', 'e3'], ['t4', 's3', 's4', 'e4'], ['t5', 's1', 's0', 'e5'], ['t6', 's2', 's2', 'e6'], ['t7', 's0', 's5', 'evt7 [x > 7] / act()'], ['t8', 's1', 's0', 'e8']]);
  m.nodes.push({ id: 'fin', type: 'uml.FinalState' }); m.views[0].nodeIds.push('fin'); m.views[0].direction = 'down';
  assert.deepEqual(notCross(m), []);
});

// laid out down, S2→final had no route and its last resort ran down past the final state's top, along the self-transition of the
// state above it and back up into its top: the end goes to another side of the final state
test('audit 38: laid out down, a last-resort transition into a final state keeps off the self-transition above it and runs no further than the final state', () => {
  const m = st37([['s0', 'State with a longer name 0'], ['s1', 'S1'], ['s2', 'S2'], ['s3', 'S3']],
    [['t0', 'init', 's0'], ['t1', 's2', 's0'], ['t2', 's2', 'fin'], ['t3', 's3', 's2'], ['t4', 's3', 's1'], ['t5', 's0', 'fin'], ['t6', 's0', 's0']]);
  m.nodes.push({ id: 'fin', type: 'uml.FinalState' }); m.views[0].nodeIds.push('fin'); m.views[0].direction = 'down';
  assert.deepEqual(notCross(m), []);
  const g = layout(m, 'v'), fin = g.nodes.find(n => n.id === 'fin'), t2 = g.edges.find(e => e.id === 't2');
  assert.ok(t2.pts.slice(1, -1).every(p => !(p[0] > fin.x - 18 && p[0] < fin.x + fin.w + 18 && p[1] > fin.y + 0.5 && p[1] < fin.y + fin.h + 18) || p === t2.pts.at(-2)), JSON.stringify(t2.pts));
});

// audit 39: round 38's nesting of the lines between one pair, the layout as before it, and state machines its fuzzer found.
// k transitions between Working (a composite of one state) and Done beside it; `both`: every other one back; `also`: more lines
const pair39 = (k, { inner = true, both = false, also = [] } = {}) => st37([['w', 'Working'], ...(inner ? [['c0', 'Inner', 'w']] : []), ['d', 'Done'],
  ...also.flatMap(([, f, t]) => [f, t]).filter(id => id === 'o').slice(0, 1).map(() => ['o', 'Other'])],
[['t0', 'init', 'w'], ...also, ...Array.from({ length: k }, (_, i) => { const back = both && i % 2; return ['e' + i, back ? 'd' : 'w', back ? 'w' : 'd', i % 2 ? 'evt' + i + ' [x > 1] / act()' : 'ev' + i]; })]);

// a third line into Done (from the initial state, from a state beside the pair, from the composite's own state) left the moved
// lines all on one side of Done, and the composite's ports were never set level with them: 5 to 7 crossed 4 to 13 times
test('audit 39: five to eight transitions between a composite state and the state beside it nest though another line ends at that state too, laid out right', () => {
  for (const also of [[['t1', 'init', 'd']], [['t2', 'init', 'o'], ['t3', 'o', 'd']], [['t4', 'c0', 'd']]]) for (const both of [false, true]) for (const k of [5, 6, 7, 8]) {
    const m = pair39(k, { both, also });
    assert.deepEqual(check(m, 'v').map(p => p.message), [], `${also.map(a => a.slice(1).join('->')).join(', ')}: ${k}${both ? ', both ways' : ''}`);
  }
});

// laid out down the composite's ports were never set by turns over and under Done, the lines Done's side could not hold all went
// round one side of it, and the fan took the turn they needed: six to nine crossed once to four times; between two plain states
// the lines into a card that only the other one feeds were routed first, so those one way took the inner tracks
test('audit 39: six to nine transitions between a composite or a plain state and the state beside it nest laid out down, and between two plain states with others in the view', () => {
  // (as the audit wrote them: Done listed before the composite's state, each transition named by its trigger, every third back)
  const pair = (k, inner, extra, direction) => { const nodes = [{ id: 'init', type: 'uml.Pseudostate', props: { kind: 'initial' } }, { id: 'a', type: 'uml.State', label: 'Working' }, { id: 'b', type: 'uml.State', label: 'Done' },
    ...(inner ? [{ id: 'in1', type: 'uml.State', label: 'Inner', parent: 'a' }] : []), ...Array.from({ length: extra }, (_, i) => ({ id: 'x' + i, type: 'uml.State', label: 'Idle ' + i }))];
    const edges = [{ id: 't0', type: 'uml.Transition', from: 'init', to: 'a' }, ...Array.from({ length: k }, (_, i) => ({ id: 'e' + i, type: 'uml.Transition', from: i % 3 === 2 ? 'b' : 'a', to: i % 3 === 2 ? 'a' : 'b', props: { trigger: 'ev' + i } }))];
    return { schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: nodes.map(n => n.id), direction }] }; };
  for (const k of [5, 6, 7, 8, 9]) for (const [inner, extra, direction] of [[true, 0, 'down'], [true, 2, 'down'], [false, 0, 'down'], [false, 2, 'down'], [false, 0, 'right'], [false, 2, 'right']])
    assert.deepEqual(check(pair(k, inner, extra, direction), 'v').map(p => p.message), [], `${direction}, ${inner ? 'composite' : 'plain'}, ${extra} more, ${k}`);
});

const F39 = JSON.parse(readFileSync(new URL('./state-fuzz39.json', import.meta.url), 'utf8'));
// the layout as before round 38 was judged with its request/reply swap and lost to the nested one; buildGeo would have laid it
// out again without the swap, with one crossing, after the choice was made. Now each is judged as it will be drawn
test('audit 39: a state machine round 38 drew with two transitions between one pair crossing keeps the one crossing it had before', () => {
  const m = F39['down-3-89'];
  assert.deepEqual(check(m, 'v').map(p => p.message), ['view v: edges S4→S2 and S2→State with a longer name 3 cross']);
});

// fuzz state machines that drew a transition across a composite's title, two on one track or one along a box's border: each line
// that does is routed again with every box that holds neither of its ends shut to it, from each side of each end
test('audit 39: fuzz state machines draw no transition across a title, on another\'s track or along a border', () => {
  for (const name of ['down-2-34', 'down-1-97', 'down-1-72', 'right-2-21', 'right-3-19', 'right-3-46']) assert.deepEqual(notCross(F39[name]), [], name);
});

// round 39's turns (lines to a composite level with the card take its top and bottom by turns, though the card has other lines)
// are judged: the view is laid out without them too, and the one check() has less to say of kept (audit 40: laid out right, the
// turns of two transitions into a composite crossed the transitions between its state and the state beside it, twice; 0.41 drew
// it with none)
test('audit 40: a state machine whose turns into a composite would cross other transitions draws with no crossing', () => {
  assert.deepEqual(check(F39['right-11-15'], 'v').map(p => p.message), []);
});

// laid out right, the initial transition ran through a composite that holds neither of its ends and across its region's title:
// the router judged the region where the layout put it, and state.js stretches regions across their state after the layout,
// which moved the title onto the line. Each box is now judged as the type draws it (layoutTyped's drawn)
test('audit 44: a transition past a composite with regions goes round it, clear of the title its region is drawn with', () => {
  const m = F39['right-4-10'], g = layout(m, 'v'), e = g.edges.find(x => x.from === 'init'), s2 = g.families.find(f => f.id === 's2');
  const inside = e.pts.slice(1).some(([x, y], i) => { const [px, py] = e.pts[i]; return Math.max(px, x) > s2.x && Math.min(px, x) < s2.x + s2.w && Math.max(py, y) > s2.y && Math.min(py, y) < s2.y + s2.h; });
  assert.ok(!inside, `init→S0 keeps out of S2: ${JSON.stringify(e.pts)}`);
  assert.deepEqual(notCross(m), []);
});

// laid out right, a flat state's self-transition and its transition to the state over its neighbour: the router found no way
// between the loop and the row above, and the last resort's turn ran on the loop's top run, half a pixel off. The late
// re-route now takes a line the last resort drew on a loop, as it took one drawn on a line into a box
test('audit 44: a transition the last resort drew along a self-transition\'s top run is routed again, clear of it', () => {
  const m = {"schemaVersion":2,"title":"g","root":"v","nodes":[{"id":"i","type":"uml.Pseudostate","props":{"kind":"initial"}},{"id":"s0","type":"uml.State","label":"State 0"},{"id":"s1","type":"uml.State","label":"State 1"},{"id":"s2","type":"uml.State","label":"State 2"},{"id":"s3","type":"uml.State","label":"State 3"},{"id":"s4","type":"uml.State","label":"State 4"},{"id":"s5","type":"uml.State","label":"State 5"}],"edges":[{"id":"t0","type":"uml.Transition","from":"i","to":"s0"},{"id":"t1","type":"uml.Transition","from":"s4","to":"s3","props":{"trigger":"ev0"}},{"id":"t2","type":"uml.Transition","from":"s2","to":"s0","props":{}},{"id":"t3","type":"uml.Transition","from":"s5","to":"s1","props":{}},{"id":"t4","type":"uml.Transition","from":"s4","to":"s1","props":{"trigger":"ev3"}},{"id":"t5","type":"uml.Transition","from":"s5","to":"s5","props":{}},{"id":"t6","type":"uml.Transition","from":"s1","to":"s1","props":{"trigger":"ev5"}},{"id":"t7","type":"uml.Transition","from":"s5","to":"s0","props":{"trigger":"ev6"}},{"id":"t8","type":"uml.Transition","from":"s5","to":"s4","props":{}}],"views":[{"id":"v","diagram":"uml.state-machine","title":"V","parent":null,"direction":"right","nodeIds":["i","s0","s1","s2","s3","s4","s5"]}]};
  const g = layout(m, 'v'), loop = g.edges.find(e => e.id === 't5'), t7 = g.edges.find(e => e.id === 't7'), top = loop.pts[2][1];
  const runs = t7.pts.slice(1).map((p, i) => [t7.pts[i], p]).filter(([a, b]) => a[1] === b[1] && Math.abs(a[1] - top) < 2 && Math.max(a[0], b[0]) > loop.pts[3][0] && Math.min(a[0], b[0]) < loop.pts[2][0]);
  assert.deepEqual(runs, [], `t7 keeps off the loop's top run: ${JSON.stringify(t7.pts)}`);
  assert.deepEqual(notCross(m), []);
});

// audit 47: Shift + Delete of a region of a view's own state counts only what apply() deletes: a model state in it is lifted out
test('audit 47: Shift + Delete of a view\'s own region does not count the model states it lifts out', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'x', type: 'uml.State', label: 'X', parent: 'R' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['S', 'x', 'y'], nodes: [{ id: 'S', type: 'uml.State', label: 'S', members: [{ id: 'R', type: 'uml.Region', label: 'r' }] }, { id: 'y', type: 'uml.State', label: 'Y', parent: 'R' }] }] };
  const r = T.edits.remove(m, m.views[0], ['R'], true);
  assert.equal(r.say, 'Deleted region r and the 1 element it held');
  const after = apply(m, r.commands); assert.deepEqual([after.nodes.map(n => n.id), after.views[0].nodes.map(n => n.id)], [['x'], ['S']]);
});

// audit 47: comment-link is said by the views that draw the line, never by a use case or state machine view that does not
test('audit 47: a class view\'s comment link is not warned again by use case and state machine views that do not draw it', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Actor', label: 'Clerk' }, { id: 'U', type: 'uml.UseCase', label: 'Buy' }, { id: 'S', type: 'uml.State', label: 'Idle' },
    { id: 'S2', type: 'uml.State', label: 'Busy' }, { id: 'K1', type: 'uml.Class', label: 'K1' }, { id: 'K2', type: 'uml.Class', label: 'K2' }],
    edges: [{ id: 'as', type: 'uml.Association', from: 'A', to: 'U' }, { id: 'cl', type: 'uml.CommentLink', from: 'K1', to: 'K2' }],
    views: [{ id: 'cv', diagram: 'uml.class', nodeIds: ['K1', 'K2'] }, { id: 'uv', diagram: 'uml.use-case', nodeIds: ['A', 'U'] }, { id: 'sv', diagram: 'uml.state-machine', nodeIds: ['S'] }] };
  const ps = validate(m).filter(p => p.rule === 'comment-link');
  assert.deepEqual(ps.map(p => p.level), ['error'], ps.map(p => p.message).join('; '));
  // a line each view draws is still said, once a view
  const k = structuredClone(m); k.edges.push({ id: 'c2', type: 'uml.CommentLink', from: 'A', to: 'U' }, { id: 'c3', type: 'uml.CommentLink', from: 'S', to: 'S2' }); k.views[2].nodeIds.push('S2');
  assert.deepEqual(validate(k).filter(p => p.rule === 'comment-link' && p.level === 'warning').map(p => p.ids[0]).sort(), ['c2', 'c3']);
});

test('connect: a transition that brings an error (into an initial pseudostate, out of a final state or a terminate, onto a region) is refused in its words; any other added (audit 48)', () => {
  const C = (from, to) => T.edits.connect(SM, V, from, to, null, T.lines[0]);
  assert.deepEqual(C('placed', 'created'), { error: 'initial-out: "Initial pseudostate created" has 1 incoming transition (transition1); it may have none' });
  for (const [f, t, rule] of [['delivered', 'placed', 'final-out'], ['erased', 'placed', 'final-out'], ['placed', 'fulfilling.parcel', 'transition-ends']]) assert.match(C(f, t).error, new RegExp(`^${rule}: `), `${f} -> ${t}`);
  for (const [f, t] of [['placed', 'erased'], ['picking', 'delivery-history']]) { const r = C(f, t);
    assert.deepEqual(r, [{ op: 'add', element: { id: 'transition1', type: 'uml.Transition', from: f, to: t }, view: V.id }]); assert.deepEqual(validate(apply(SM, r)).filter(p => p.level === 'error'), []); }
});

// audit 51: Shift + Delete of a model region counts another view's own states in it too, which apply() deletes all the same (as cloud's)
test('audit 51: Shift + Delete of a model region counts the states another view holds as its own in it', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.State', label: 'S', members: [{ id: 'R', type: 'uml.Region', label: 'r' }] }, { id: 'x', type: 'uml.State', label: 'X', parent: 'R' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.state-machine', nodeIds: ['S', 'x'] }, { id: 'v2', diagram: 'uml.state-machine', nodeIds: ['S', 'y'], nodes: [{ id: 'y', type: 'uml.State', label: 'Y', parent: 'R' }] }] };
  const r = T.edits.remove(m, m.views[0], ['R'], true);
  assert.equal(r.say, 'Deleted region r and the 2 elements it held');
  const after = apply(m, r.commands); assert.deepEqual([after.nodes.map(n => n.id), after.views[1].nodes], [['S'], []]);
});

test('audit 55: a vertex in an unnamed region is said in it as the region\'s own name numbers it, never by the region\'s id', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'moving', type: 'uml.State', label: 'Moving', members: [{ id: 'moving.r1', type: 'uml.Region' }, { id: 'moving.r2', type: 'uml.Region', label: 'Sound' }] },
    { id: 'i1', type: 'uml.Pseudostate', parent: 'moving.r1', props: { kind: 'initial' } }, { id: 'slow', type: 'uml.State', label: 'Slow', parent: 'moving.r1' },
    { id: 'i2', type: 'uml.Pseudostate', parent: 'moving.r2', props: { kind: 'initial' } }, { id: 'quiet', type: 'uml.State', label: 'Quiet', parent: 'moving.r2' }],
    edges: [{ id: 't1', type: 'uml.Transition', from: 'i1', to: 'slow' }, { id: 't2', type: 'uml.Transition', from: 'i2', to: 'quiet' }],
    views: [{ id: 'sm', diagram: 'uml.state-machine', nodeIds: ['moving', 'i1', 'slow', 'i2', 'quiet'] }] };
  const g = layout(m, 'sm'), fam = id => g.families.find(f => f.id === id);
  assert.deepEqual([fam('moving.r1').aria, g.byId.i1.aria], ['Region 1 of Moving, 2 states', 'Initial pseudostate in region 1 of Moving']);
  assert.equal(g.byId.i2.aria, 'Initial pseudostate in Sound'); // a named one by its name, as before
  const d = describe(m, 'sm'); assert.match(d, /^Initial pseudostate in region 1 of Moving\.$/m); assert.doesNotMatch(d + [...svgOf(g).matchAll(/aria-label="([^"]*)"/g)].map(x => x[1]).join('\n'), /moving\.r1/);
});
