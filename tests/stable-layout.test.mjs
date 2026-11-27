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

// the guard of section 8.2 scores a layout as the edit corpus does (section 4.1), the cards it moves counted
test('stable: the guard scores a layout with section 4\'s score and weights (src/layout/score.js)', async () => {
  const { mapContext } = await import('../src/map/context.js'), { viewMetrics, scoreView } = await import('../src/layout/score.js');
  const { STABLE_WEIGHTS } = await import('../src/layout/tune.js'), { readFileSync } = await import('node:fs');
  const file = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8')), W = file('bench/score-weights.json');
  assert.deepEqual({ ...STABLE_WEIGHTS }, W, 'tune.js\'s guard weights are bench/score-weights.json\'s');
  for (const [p, vid] of [['bench/models/b10.json', 'overview'], ['bench/models/f12.json', 'onboard'], ['bench/models/f12.json', 'signup-boxed'], ['bench/models/i59.json', 'trips'], ['bench/models/u21.json', 'shop']]) {
    const model = file(p), cx = mapContext(model, {}); cx.planOf(vid); const g = cx.buildGeo(vid), view = model.views.find(v => v.id === vid);
    for (const share of [0, 0.5]) assert.ok(Math.abs(cx.guardScore(vid, g, share) - scoreView(viewMetrics(g, { model, view }), W, share)) < 0.01, `${p} ${vid} ${share}`);
  }
});

// a pair of the edit corpus: the model before, after and the cards the edit touched
const pairOf = async id => { const { readFileSync } = await import('node:fs'), file = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
  const p = file('bench/edits/edits.json').pairs.find(x => x.id === id), before = file(p.model);
  return { before, after: apply(before, p.commands), view: p.view, touched: p.touched }; };

test('stable: a fresh layout that moves unchanged cards pays for them in the guard, so a stable one a little longer is kept', async () => {
  // u21's shop with a line added: the stable layout's lines are longer and turn more (scoreGeo 87 worse, past one label), and
  // the fresh one moves five of the eight cards the edit left alone; section 4's score counts both, and keeps the stable one
  const { before, after, view, touched } = await pairOf('u21/shop/5-add-line'), b = cells(layout(before, view));
  assert.ok(moved(b, cells(layout(after, view)), touched).length >= 4, 'laid out afresh, the cards move');
  assert.deepEqual(moved(b, cells(layout(after, view, { stableFrom: before })), touched), [], 'against the base, they keep their cells');
  assert.deepEqual(check(after, view, { stableFrom: before }).filter(i => / share a line$| which it does not hold$/.test(i.message)), [], 'with no hard issue');
});

const hardIn = (model, view, base) => check(model, view, { stableFrom: base }).filter(i => / share a line$| which it does not hold$| overlap$/.test(i.message));

test('stable: the ends of an added line may take their slots in the fresh layout, the other cards their old cells', async () => {
  // i59's overview with a line added: the fresh layout moves eleven cards the edit left alone; the stable one keeps them and
  // both ends of the new line take their fresh slots (f12's pipeline showed this until its arranged layout, D13's fixes, no
  // longer moved its cards for that edit)
  const { before, after, view, touched } = await pairOf('i59/overview/5-add-line'), b = cells(layout(before, view));
  assert.ok(moved(b, cells(layout(after, view)), touched).length >= 2, 'laid out afresh, cards move');
  const s = cells(layout(after, view, { stableFrom: before }));
  assert.deepEqual(moved(b, s, touched), [], 'against the base, none does');
  assert.ok(touched.some(i => i in b && String(b[i]) !== String(s[i])), 'an end of the new line takes its fresh slot');
  assert.deepEqual(hardIn(after, view, before), []);
});

test('stable: a card added past a snake\'s last card goes a column past it, as the fresh layout moved the rest', async () => {
  // f12's boxed onboarding flow, a card added after Go live, the end of the row that runs back: the fresh layout moves every
  // card one column right to make room; the stable one keeps them and puts the new card one column before Go live
  const { before, after, view, touched } = await pairOf('f12/onboard-boxed/1-add-card'), b = cells(layout(before, view));
  assert.equal(moved(b, cells(layout(after, view)), touched).length, Object.keys(b).length - 1, 'laid out afresh, every untouched card moves');
  const s = cells(layout(after, view, { stableFrom: before }));
  assert.deepEqual(moved(b, s, touched), [], 'against the base, none does');
  assert.deepEqual(s['zz-onboard-boxed-card'], [b['n-live'][0] - 1, b['n-live'][1]], 'the new card is a column past Go live, on its row');
  assert.deepEqual(hardIn(after, view, before), []);
});

// audit 66: a card the fresh layout gives no cell (here its id is also a box's, validate()'s error) named like an
// Object.prototype member: the stable ways read the member (a function) as its slot and threw "function is not iterable"
test('a stable layout of a card named like an Object.prototype member with no fresh cell draws as the fresh one', () => {
  for (const [a, b] of [['toString', 'valueOf'], ['constructor', 'hasOwnProperty'], ['valueOf', '__proto__']]) {
    const m = { schemaVersion: 1, title: 'p', nodes: [{ id: a }, { id: b }], edges: [], views: [{ id: 'v', nodeIds: [a, b], containers: [{ id: b, label: 'Box', nodeIds: [a] }] }] };
    const fresh = layout(m, 'v'), xy = g => g.nodes.map(n => [n.id, n.x, n.y]);
    assert.deepEqual(xy(layout(m, 'v', { stableFrom: m })), xy(fresh), `${a}, ${b}`);
    const d = diff(m, m); assert.deepEqual(xy(layout(d.model, 'v', { stableFrom: d.stableFrom })), xy(fresh), `${a}, ${b}: diff`); }
});

// audit cf1: a view's listed line ids are found through one table of the model's lines by id, and a card's flow lines (what
// a stable layout compares) for every card of the view in one pass. Before: a linear find for each id, in each of a dozen
// callers (16,000 ids over 16,000 lines 1.9 s), and the lines again for each card shared with the base (8,000 7.4 s).
// Timed by growth against a quarter, CPU, best of two
test('audit cf1: a view listing thousands of line ids over thousands of lines lays out in near linear time, stable or not (timed)', () => {
  const cpuOf = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const growth = (n, f) => { const q = Math.min(cpuOf(() => f(n / 4)), cpuOf(() => f(n / 4))), ms = Math.min(cpuOf(() => f(n)), cpuOf(() => f(n))); return [ms, q]; };
  // ids that name no line (missed), and ids that name lines whose ends are not on the view
  const plain = (n, hit) => ({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, from: hit ? 'zz' : 'a', to: 'b' })),
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: Array.from({ length: n }, (_, i) => (hit ? 'e' : 'x') + i) }] });
  const chain = (C, n) => { const nodes = Array.from({ length: C }, (_, i) => ({ id: 'c' + i, label: 'C' + i })), edges = [], list = [];
    for (let i = 0; i + 1 < C; i++) { edges.push({ id: 'k' + i, from: 'c' + i, to: 'c' + (i + 1) }); list.push('k' + i); }
    for (let i = 0; i < n; i++) { edges.push({ id: 'p' + i, from: 'zz', to: 'zz' }); list.push('x' + i); }
    if (n) nodes.push({ id: 'new', label: 'N' }); return { nodes, edges, views: [{ id: 'v', nodeIds: nodes.map(x => x.id), edges: list }] }; };
  const before = chain(40, 0), runs = [['missed', 16000, n => layout(plain(n, false), 'v')], ['off the view', 16000, n => layout(plain(n, true), 'v')],
    ['stable', 8000, n => layout(chain(40, n), 'v', { stableFrom: before })]];
  for (const [name, n, f] of runs) { const [ms, q] = growth(n, f); // the finds were about 16x a quarter
    assert.ok(ms < 400 || ms / Math.max(q, 1) < 8, `${name}: ${Math.round(ms)} ms, a quarter ${Math.round(q)} ms`); }
  // the lines the view lists still resolve as before: the first line of an id, once for an id listed twice, none for one that names no line
  const m = { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    edges: [{ id: 'e', from: 'a', to: 'b', label: 'first' }, { id: 'e', from: 'b', to: 'c', label: 'second' }, { id: 'f', from: 'b', to: 'c' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], edges: ['e', 'e', 'nope', 'f'] }] };
  assert.deepEqual(layout(m, 'v').edges.map(e => [e.from, e.to]).sort(), [['a', 'b'], ['b', 'c']]);
  const lay = layout(m, 'v', { stableFrom: { ...m, views: [{ ...m.views[0], nodeIds: ['a', 'b'] }] } });
  assert.deepEqual(lay.edges.map(e => [e.from, e.to]).sort(), [['a', 'b'], ['b', 'c']]);
});
