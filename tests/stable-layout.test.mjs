// A layout that stays put across edits (docs/diagrams/notes/layout-flow.md section 8.4): laid out with the model before an
// edit (layout()'s and render()'s stableFrom, mapContext's base), the cards the edit left alone keep their cells; a stable
// layout that draws worse gives way to the fresh one; diff() hands the model before back for that (by default; not with
// stable: false); and with no base nothing draws differently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, check, diff, apply, validate } from '../lib/umlimator.js';
import { STABLE_SLACK } from '../src/layout/tune.js';
import { readFileSync } from 'node:fs';

const PINS = JSON.parse(readFileSync(new URL('../bench/tune-pins.json', import.meta.url), 'utf8')).values;

// ten cards of a shop's order flow, as a map view lays them out:
// web api auth|orders pay|stock ship mail|audit report, in seven columns
const IDS = ['web', 'api', 'auth', 'orders', 'pay', 'stock', 'ship', 'mail', 'audit', 'report'];
const LINES = [['web', 'api'], ['api', 'auth'], ['api', 'orders'], ['orders', 'pay'], ['orders', 'stock'], ['pay', 'ship'], ['stock', 'ship'], ['ship', 'mail'], ['ship', 'audit'], ['audit', 'report']];
const shop = (ids = IDS, lines = LINES) => ({
  nodes: ids.map(i => ({ id: i, label: i[0].toUpperCase() + i.slice(1) })),
  edges: lines.map(([from, to]) => ({ id: `${from}-${to}`, from, to })),
  views: [{ id: 'v', title: 'Shop', nodeIds: [...ids] }],
});
const cells = g => Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]]));
const moved = (a, b, skip = []) => Object.keys(a).filter(i => !skip.includes(i) && i in b && String(a[i]) !== String(b[i]));
const base = shop(), before = cells(layout(base, 'v'));

test('stable: adding one card with one line to a 10-card view leaves the other nine at their cells', () => {
  const after = apply(base, [{ op: 'add', element: { id: 'promo', label: 'Promo' }, view: 'v' }, { op: 'add', element: { id: 'promo-web', from: 'promo', to: 'web' } }]);
  const fresh = cells(layout(after, 'v')), stable = cells(layout(after, 'v', { stableFrom: base }));
  assert.ok(moved(before, fresh, ['web']).length >= 5, 'laid out afresh, the new source moves the flow (the case is worth testing)');
  assert.deepEqual(moved(before, stable, ['web']), [], 'against the base, the nine cards the edit left alone keep their cells');
  assert.ok(Array.isArray(stable.promo), 'the new card is placed');
  assert.deepEqual(check(after, 'v', { stableFrom: base }), [], 'and the stable picture is clean');
});

test('stable: removing a line moves only its two ends at most', () => {
  for (const [from, to] of [['web', 'api'], ['api', 'orders'], ['orders', 'pay'], ['ship', 'audit']]) {
    const after = shop(IDS, LINES.filter(l => !(l[0] === from && l[1] === to)));
    const fresh = cells(layout(after, 'v')), stable = cells(layout(after, 'v', { stableFrom: base }));
    assert.deepEqual(moved(before, stable, [from, to]), [], `${from} -> ${to} removed`);
    if (from === 'web') assert.ok(moved(before, fresh, [from, to]).length >= 5, 'laid out afresh, the rest of the flow moves');
  }
});

test('stable: a change whose stable layout would add a crossing falls back to the fresh layout', () => {
  // a refund after pay: with every card but pay at its old cell, refund takes the free row under ship, and its line from pay
  // crosses stock's line to ship; the fresh layout has none
  const after = shop([...IDS, 'refund'], [...LINES, ['pay', 'refund']]);
  const soft = Object.fromEntries(Object.entries(before).filter(([i]) => i !== 'pay'));
  const pinned = { ...after, views: [{ ...after.views[0], layout: soft }] };
  assert.ok(check(pinned, 'v').some(i => / cross$/.test(i.message)), 'the soft-pinned cells force a crossing');
  assert.equal(check(after, 'v').length, 0, 'the fresh layout has none');
  assert.deepEqual(cells(layout(after, 'v', { stableFrom: base })), cells(layout(after, 'v')), 'so the fresh layout is drawn');
  assert.equal(STABLE_SLACK, PINS.STABLE_SLACK, 'the guard: no more hard issues, and no worse than STABLE_SLACK labels not drawn (tune.js, pinned in bench/tune-pins.json)');
});

test('stable: a real pin wins over a soft pin, and the soft pins are never written to the model', () => {
  const after = shop([...IDS, 'promo'], [...LINES, ['promo', 'web']]);
  after.views[0].layout = { report: [4, 0] }; // on ship's old cell
  const copy = structuredClone(after), stable = cells(layout(after, 'v', { stableFrom: base }));
  assert.deepEqual(stable.report, [4, 0], 'the pinned card takes its pin');
  assert.notDeepEqual(stable.ship, [4, 0], 'the card a soft pin held there is placed afresh');
  assert.deepEqual(after, copy, 'the model is as it was: no soft pin in its layout');
});

test('stable: diff() keeps unchanged cards\' cells, by default and with stable: true; with stable: false the result has no stableFrom', () => {
  const after = shop([...IDS, 'promo'], [...LINES, ['promo', 'web']]);
  const plain = diff(base, after, { stable: false }), d = diff(base, after, { stable: true });
  assert.ok(!('stableFrom' in plain), 'stable: false gives no stableFrom');
  assert.deepEqual(diff(base, after), d, 'the default is stable (layout-flow.md section 12, step 14)');
  assert.deepEqual({ ...d, stableFrom: undefined }, { ...plain, stableFrom: undefined }, 'the model, summary and views are the same');
  assert.deepEqual(d.stableFrom, base, 'stableFrom is the model before');
  const g = cells(layout(d.model, 'v', { stableFrom: d.stableFrom }));
  assert.deepEqual(moved(before, g, ['web']), [], 'drawn with it, the diff keeps the cards the change left alone at their cells');
  assert.ok(moved(before, cells(layout(d.model, 'v')), ['web']).length >= 5, 'drawn without it, they move');
  // a removed card comes back where it was
  const gone = shop(IDS.filter(i => i !== 'mail'), LINES.filter(l => !l.includes('mail'))), r = diff(base, gone, { stable: true });
  const back = cells(layout(r.model, 'v', { stableFrom: r.stableFrom }));
  assert.deepEqual(moved(before, back, ['ship']), [], 'a removed card and the others keep their cells');
});

test('stable: with no base, or the same model as base, nothing draws differently', () => {
  const g0 = layout(base, 'v'), g1 = layout(base, 'v', { stableFrom: base });
  assert.deepEqual(cells(g1), cells(g0));
  assert.deepEqual(g1.edges.map(e => e.pts), g0.edges.map(e => e.pts), 'the same routes');
  assert.deepEqual(cells(layout(base, 'v', { stableFrom: null })), cells(g0));
});

test('stable: a typed view keeps the cells of the elements an edit left alone', () => {
  // a returned parcel, as a flowchart laid out down: a new step before the first moves every rank, unless it is laid out stable
  const T = { a: 'Terminator', b: 'InputOutput', c: 'ManualInput', d: 'Process', e: 'Decision', f: 'PredefinedProcess', g: 'Delay', h: 'Process', i: 'Database', j: 'Document', k: 'Process', l: 'Connector', m: 'Terminator' };
  const flows = ['ab', 'bc', 'cd', 'de', 'ef', 'ej', 'fg', 'gh', 'hi', 'il', 'jk', 'kl', 'lm'];
  const ex = { schemaVersion: 2, nodes: Object.entries(T).map(([id, t]) => ({ id, type: 'flow.' + t, label: 'Step ' + id.toUpperCase() })),
    edges: flows.map(([from, to]) => ({ id: from + to, type: 'flow.Flow', from, to })),
    views: [{ id: 'returns', diagram: 'flowchart', title: 'Returns', direction: 'down', nodeIds: Object.keys(T) }] };
  const after = apply(ex, [{ op: 'add', element: { id: 'z', type: 'flow.Terminator', label: 'Step Z' }, view: 'returns' }, { op: 'add', element: { id: 'za', type: 'flow.Flow', from: 'z', to: 'a' } }]);
  assert.equal(validate(after).filter(p => p.level === 'error').length, 0);
  const b = cells(layout(ex, 'returns')), f = cells(layout(after, 'returns')), s = cells(layout(after, 'returns', { stableFrom: ex }));
  assert.ok(moved(b, f, ['a']).length >= 6, 'laid out afresh, the ranks move');
  assert.deepEqual(moved(b, s, ['a']), [], 'against the base, the twelve elements the edit left alone keep their cells');
});
