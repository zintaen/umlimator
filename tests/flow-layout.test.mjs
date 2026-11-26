// Layout by business flow, step 4 (docs/diagrams/notes/layout-flow.md sections 5 and 12): in a map view with arrange "flow",
// dependency lines (flow "dep", else kind state or guard) rank, order and row nothing; a card whose lines are all
// dependencies sits in the band under the flow, in the column of the median of the cards it is joined to; the router takes
// dependency lines after the flow lines, and check() lets them run either way. A view without arrange draws as before.
// Step 6 (section 6): the main flow (flow "main", else steps, else the longest path; layered.js's mainFlow) holds one row,
// each branch on one side of it, and a main line takes the middle port of both sides it meets, so it is one straight segment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, check, validate } from '../lib/umlimator-all.js';
import { viewMetrics } from '../src/layout/score.js';
import { mainFlow } from '../src/layout/layered.js';
import { readFileSync } from 'node:fs';

// section 5.4's view: A -> B -> C, each also writing to L with a state line
const ABC = (arrange, more = {}) => ({ schemaVersion: 2,
  nodes: [{ id: 'A', label: 'Take order' }, { id: 'B', label: 'Charge' }, { id: 'C', label: 'Ship' }, { id: 'L', label: 'Log', kind: 'database' }],
  edges: [{ id: 'ab', from: 'A', to: 'B', label: 'then' }, { id: 'bc', from: 'B', to: 'C', label: 'then' },
    ...['A', 'B', 'C'].map(x => ({ id: x + 'l', from: x, to: 'L', kind: 'state', label: 'writes' }))],
  views: [{ id: 'v', nodeIds: ['A', 'B', 'C', 'L'], ...(arrange && { arrange: 'flow' }), ...more }] });
const cells = g => Object.fromEntries(g.nodes.map(n => [n.id, [n.col, n.row]]));
const line = (g, from, to) => g.edges.find(e => e.from === from && e.to === to);
const maxX = e => Math.max(...e.pts.map(p => p[0]));

test('without arrange the view keeps today\'s cells: L in column 3, and the lines from A and B run across the view past C', () => {
  const g = layout(ABC(false), 'v'), c = g.nodes.find(n => n.id === 'C');
  assert.deepEqual(cells(g), { A: [0, 0], B: [1, 0], C: [2, 0], L: [3, 0] });
  for (const x of ['A', 'B']) assert.ok(maxX(line(g, x, 'L')) > c.x + c.w, `${x} -> L reaches past C`);
  assert.ok(g.edges.every(e => !e.dep), 'no line is a dependency line without arrange');
});

test('arranged, L is under the flow in column 1 (the median of its writers), no line runs past C, and reverse is 0', () => {
  const m = ABC(true), g = layout(m, 'v'), c = g.nodes.find(n => n.id === 'C');
  assert.deepEqual(cells(g), { A: [0, 0], B: [1, 0], C: [2, 0], L: [1, 1] });
  assert.ok(['A', 'B', 'C'].every(x => line(g, x, 'L').dep) && !line(g, 'A', 'B').dep && !line(g, 'B', 'C').dep);
  for (const x of ['A', 'B']) assert.ok(maxX(line(g, x, 'L')) <= c.x + c.w, `${x} -> L stays short of C's far side`);
  const s = viewMetrics(g, { model: m, view: m.views[0] });
  assert.equal(s.reverse, 0); assert.equal(s.hard, 0); assert.equal(s.cross, 0);
  assert.ok(s.length < viewMetrics(layout(ABC(false), 'v'), { model: ABC(false), view: ABC(false).views[0] }).length, 'shorter lines than today');
  assert.deepEqual(check(m, 'v'), [], 'a dependency line running right to left is not a problem');
});

test('flow on the line decides over its kind: a state line marked branch still ranks, and a calls line marked dep does not', () => {
  const m = ABC(true); m.edges.find(e => e.id === 'Cl').flow = 'branch';
  assert.deepEqual(cells(layout(m, 'v')), { A: [0, 0], B: [1, 0], C: [2, 0], L: [3, 0] });
  const d = ABC(true); d.edges.forEach(e => { if (e.to === 'L') { delete e.kind; e.flow = 'dep'; } });
  assert.deepEqual(cells(layout(d, 'v')), { A: [0, 0], B: [1, 0], C: [2, 0], L: [1, 1] });
});

test('a view whose lines are all dependencies has no flow, and ranks as without arrange', () => {
  const m = ABC(true), u = ABC(false); m.edges = m.edges.filter(e => e.to === 'L'); u.edges = m.edges;
  assert.deepEqual(cells(layout(m, 'v')), cells(layout(u, 'v')));
});

test('pins win: a pinned dependency-only card keeps its pin', () => {
  const g = layout(ABC(true, { layout: { L: [3, 0] } }), 'v');
  assert.deepEqual(cells(g).L, [3, 0]);
});

test('with boxes, a card whose lines are all dependencies sits under its group\'s flow rows', () => {
  const m = ABC(true, { containers: [{ id: 'app', label: 'App', nodeIds: ['A', 'B', 'C'] }] }), g = layout(m, 'v'), c = cells(g);
  assert.ok(c.L[1] > Math.max(c.A[1], c.B[1], c.C[1]), 'L below the box');
  assert.equal(c.L[0], c.B[0], 'in the median writer\'s column');
  const plain = cells(layout(ABC(false, { containers: m.views[0].containers }), 'v'));
  assert.ok(plain.L[0] > plain.C[0], 'without arrange L is ranked past C');
});

// section 6.4's view: an order pipeline of six main cards, with a two-card refund branch off Pay
const MAIN = ['web', 'api', 'cart', 'pay', 'ship', 'mail'];
const ORDER = (how = 'main', more = {}, refund = {}) => ({ schemaVersion: 2,
  nodes: [...MAIN, 'refund', 'credit'].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  edges: [...MAIN.slice(1).map((to, i) => ({ id: 'm' + i, from: MAIN[i], to, label: 'then', ...(how === 'main' ? { flow: 'main' } : how === 'step' ? { step: i === 3 ? '4a' : i + 1 } : {}) })),
    { id: 'r0', from: 'pay', to: 'refund', label: 'on failure', ...(how === 'step' && { step: '4b' }), ...refund }, { id: 'r1', from: 'refund', to: 'credit', label: 'credits' }],
  views: [{ id: 'v', nodeIds: ['refund', 'credit', ...MAIN], arrange: 'flow', ...more }] }); // the branch first: the main flow is not the order given

test('the main flow holds row 0: every main card on it, every main line two points, the refund branch on one side', () => {
  const m = ORDER(), g = layout(m, 'v'), c = cells(g);
  MAIN.forEach((id, i) => assert.deepEqual(c[id], [i, 0], id));
  for (let i = 1; i < MAIN.length; i++) assert.equal(line(g, MAIN[i - 1], MAIN[i]).pts.length, 2, `${MAIN[i - 1]} -> ${MAIN[i]} is one straight segment`);
  assert.ok(c.refund[1] > 0 && c.credit[1] > 0, 'the branch below the main row, both its cards');
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.equal(s.straight, 0); assert.equal(s.reverse, 0); assert.equal(s.hard, 0);
  assert.deepEqual(check(m, 'v'), []);
});

test('a main flow from steps gives the same cells as flow "main"; with neither, the longest path, ties to the first mentioned', () => {
  assert.deepEqual(cells(layout(ORDER('step'), 'v')), cells(layout(ORDER(), 'v')), 'steps 1, 2, 3, 4a, 5 (4b a branch)');
  const c = cells(layout(ORDER('none'), 'v')); // Web to Mail and Web to Credit are both five lines long; the view names Credit's first
  ['web', 'api', 'cart', 'pay', 'refund', 'credit'].forEach((id, i) => assert.deepEqual(c[id], [i, 0], id));
});

test('an exception branch (a guard line) goes above the main row, which stays one row', () => {
  const g = layout(ORDER('main', {}, { kind: 'guard', flow: 'branch' }), 'v'), c = cells(g), r = c.web[1];
  MAIN.forEach((id, i) => assert.deepEqual(c[id], [i, r], id));
  assert.ok(c.refund[1] < r && c.credit[1] < r, 'the branch above');
  for (let i = 1; i < MAIN.length; i++) assert.equal(line(g, MAIN[i - 1], MAIN[i]).pts.length, 2);
});

test('pins win: a main card pinned at row 2 stays there, and the other main cards stay at row 0', () => {
  const c = cells(layout(ORDER('main', { layout: { cart: [2, 2] } }), 'v'));
  assert.deepEqual(c.cart, [2, 2]);
  MAIN.filter(id => id !== 'cart').forEach(id => assert.equal(c[id][1], 0, id));
});

test('without arrange the main-flow fields change nothing, and the lines take no main port', () => {
  const m = ORDER(); delete m.views[0].arrange; const u = ORDER(); delete u.views[0].arrange; u.edges.forEach(e => { delete e.flow; });
  const g = layout(m, 'v'); assert.deepEqual(cells(g), cells(layout(u, 'v')));
  assert.ok(g.edges.every(e => !e.mainLine));
});

test('mainFlow: flow "main" first, then steps in step order with a step\'s first suffix, then run order, then the longest path', () => {
  const L = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'a', to: 'x' }, { from: 'x', to: 'y' }];
  assert.deepEqual(mainFlow(L), { cards: ['a', 'b', 'c', 'd'], lines: [0, 1, 2], by: 'path', breaks: [] });
  assert.deepEqual(mainFlow(L.map((e, i) => i > 2 ? { ...e, flow: 'main' } : e)).cards, ['a', 'x', 'y']);
  const S = [{ from: 'c', to: 'd', step: 3 }, { from: 'a', to: 'b', step: 1 }, { from: 'b', to: 'x', step: '2b' }, { from: 'b', to: 'c', step: '2a' }];
  assert.deepEqual(mainFlow(S), { cards: ['a', 'b', 'c', 'd'], lines: [1, 3, 0], by: 'step', breaks: [] });
  assert.deepEqual(mainFlow([{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }], { run: true }), { cards: ['c', 'd', 'e'], lines: [1, 2], by: 'run', breaks: [[1, 0]] });
  assert.equal(mainFlow(L, { dep: () => true }), null, 'no flow line, no main flow');
  assert.deepEqual(mainFlow(L, { back: new Set([1]), dep: e => e.to === 'y' }).cards, ['a', 'b'], 'a loop line and a dependency line rank nothing; ties to the first');
});

test('validate() warns where an arranged view\'s steps break into chains, and says nothing of one chain', () => {
  const m = ORDER('step'); assert.deepEqual(validate(m), []);
  m.edges.find(e => e.id === 'm1').from = 'web'; // step 2 starts at Web, not at Api where step 1 ends
  const said = validate(m).map(p => `${p.level} ${p.path} ${p.message}`);
  assert.deepEqual(said, ['warning edges[1] step 2 starts at "Web", not at "Api" where step 1 ends: the steps break into chains here, and the longest chain (4 lines, from "Web") is the main flow']);
});

// Step 7 (section 6.2, "With boxes"): in an arranged view with boxes, blockPos anchors each box that holds main cards by its
// first main card's row, so the main flow keeps one row across the boxes
const BOXES = [{ id: 'front', label: 'Front', nodeIds: ['web', 'api', 'cart'] }, { id: 'money', label: 'Money', nodeIds: ['pay', 'refund'] },
  { id: 'out', label: 'Fulfilment', nodeIds: ['ship', 'mail'] }];
const midY = n => n.y + n.h / 2;

test('with boxes, the main flow holds one row across them: every main line two points, the refund branch off it', () => {
  const m = ORDER('main', { containers: BOXES }), g = layout(m, 'v'), at = Object.fromEntries(g.nodes.map(n => [n.id, n])), y = midY(at.web);
  MAIN.forEach(id => assert.equal(midY(at[id]), y, id));
  for (let i = 1; i < MAIN.length; i++) assert.equal(line(g, MAIN[i - 1], MAIN[i]).pts.length, 2, `${MAIN[i - 1]} -> ${MAIN[i]} is one straight segment`);
  assert.ok(midY(at.refund) > y && midY(at.credit) > y, 'the branch below the main row, though Refund has a column of its own in Money');
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.equal(s.straight, 0); assert.equal(s.reverse, 0); assert.equal(s.hard, 0);
  assert.ok(g.edges.filter(e => e.mainLine).length === MAIN.length - 1, 'the main lines are drawn as such (mainLine)');
});

test('with boxes, an exception branch goes above, and a store only it writes to goes above with it, off the main row', () => {
  const m = ORDER('main', { containers: [...BOXES.slice(0, 1), { ...BOXES[1], nodeIds: ['pay', 'refund', 'ledger'] }, BOXES[2]] }, { kind: 'guard', flow: 'branch' });
  m.nodes.push({ id: 'ledger', label: 'Ledger', kind: 'database' }); m.edges.push({ id: 'l', from: 'refund', to: 'ledger', kind: 'state', label: 'writes' }); m.views[0].nodeIds.push('ledger');
  const g = layout(m, 'v'), at = Object.fromEntries(g.nodes.map(n => [n.id, n])), y = midY(at.web);
  MAIN.forEach(id => assert.equal(midY(at[id]), y, id));
  assert.ok(midY(at.refund) < y && midY(at.ledger) < y, 'Refund and its ledger above the main row');
  for (let i = 1; i < MAIN.length; i++) assert.equal(line(g, MAIN[i - 1], MAIN[i]).pts.length, 2);
  assert.equal(viewMetrics(g, { model: m, view: m.views[0] }).hard, 0);
});

test('with boxes and no arrange, the main-flow fields change nothing', () => {
  const m = ORDER('main', { containers: BOXES }); delete m.views[0].arrange; const u = ORDER('none', { containers: BOXES }); delete u.views[0].arrange;
  const g = layout(m, 'v'); assert.deepEqual(cells(g), cells(layout(u, 'v'))); assert.ok(g.edges.every(e => !e.mainLine));
});

test('f12\'s boxed views: straight 0 where the main flow passes each box once, and Sign-up, which comes back into App, on two rows', async () => {
  const { readFileSync } = await import('node:fs'), m = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url)));
  const s = id => viewMetrics(layout(m, id), { model: m, view: m.views.find(v => v.id === id) });
  for (const id of ['order-boxed', 'ticket-boxed', 'pipeline-boxed']) assert.equal(s(id).straight, 0, id);
  const g = layout(m, 'signup-boxed'), at = Object.fromEntries(g.nodes.map(n => [n.id, n]));
  assert.ok(['s-form', 's-acct', 's-check'].every(id => midY(at[id]) === midY(at['s-user'])), 'the flow up to where it leaves App holds one row');
  assert.ok(s('signup-boxed').straight <= 6);
});

// Step 9 (section 7): semantic zones on a map. In an arranged view a card's zone is its own, else the map's default (section
// 7.2): a person first, and a public card no line comes into; an external card last; a database, file or board card under.
// A first card sits in a column before every flow rank, a last card in one after, an under card below every flow row; the
// main flow keeps its place (but for its first card going first and its last going last). zones: false turns the defaults off.
const STEPS = ['a', 'b', 'c', 'd'];
const ZONED = (extra, lines, more = {}) => ({ schemaVersion: 2,
  nodes: [...STEPS.map(id => ({ id, label: id.toUpperCase() + ' step' })), ...extra],
  edges: [...STEPS.slice(1).map((to, i) => ({ id: 'm' + i, from: STEPS[i], to, label: 'then', flow: 'main' })), ...lines],
  views: [{ id: 'v', nodeIds: [...STEPS, ...extra.map(n => n.id)], arrange: 'flow', ...more }] });
const PERSON = () => ZONED([{ id: 'p', label: 'Shopper', shape: 'person' }], [{ id: 'dp', from: 'd', to: 'p', label: 'tells' }]);
const BANK = () => ZONED([{ id: 'x', label: 'Bank', kind: 'external' }], [{ id: 'bx', from: 'b', to: 'x', label: 'pays' }]);
const STORE = () => ZONED([{ id: 's', label: 'Orders', kind: 'database' }, { id: 'e', label: 'E step' }],
  [{ id: 'bs', from: 'b', to: 's', label: 'feeds' }, { id: 'se', from: 's', to: 'e', label: 'feeds' }, { id: 'ce', from: 'c', to: 'e', label: 'then' }]);
const off = m => { m.views[0].zones = false; return m; };

test('a person card is in column 0 though a line comes into it from the last column, drawn as a line back', () => {
  const m = PERSON(), g = layout(m, 'v'), c = cells(g);
  assert.equal(c.p[0], 0, 'the person first');
  STEPS.forEach((id, i) => assert.deepEqual(c[id], [i + 1, c.a[1]], id));
  assert.ok(line(g, 'd', 'p').back, 'the line into the person runs back, as a loop does');
  assert.deepEqual(check(m, 'v'), [], 'check() says nothing of it running right to left');
  assert.equal(viewMetrics(g, { model: m, view: m.views[0] }).reverse, 0);
  assert.equal(cells(layout(off(PERSON()), 'v')).p[0], 4, 'zones: false: ranked after its caller');
});

test('an external card is in the last column, a database below every flow row, and zones: false ranks as section 5', () => {
  const b = cells(layout(BANK(), 'v')); assert.equal(b.x[0], Math.max(...Object.values(b).map(p => p[0])), 'the bank last');
  assert.ok(b.x[0] > b.d[0], 'past the last main card');
  assert.deepEqual(cells(layout(off(BANK()), 'v')).x, [2, 1], 'zones: false: right after its caller, below the row');
  const m = STORE(), c = cells(layout(m, 'v')), flow = Object.entries(c).filter(([id]) => id !== 's').map(([, p]) => p[1]);
  assert.ok(c.s[1] > Math.max(...flow), 'the store under every flow row');
  assert.ok(c.s[0] > c.b[0] && c.s[0] < c.e[0], 'between the card that feeds it and the one it feeds, so its lines run the reading way');
  assert.deepEqual(check(m, 'v'), []);
  assert.ok(cells(layout(off(STORE()), 'v')).s[1] < Math.max(...flow) + 1, 'zones: false: ranked in the flow rows');
});

test('a card\'s own zone wins over the default, in the card or the view\'s nodeOverrides; "flow" ranks it', () => {
  const m = BANK(); m.nodes.find(n => n.id === 'x').zone = 'flow';
  assert.deepEqual(cells(layout(m, 'v')).x, cells(layout(off(BANK()), 'v')).x, 'zone "flow": ranked');
  const f = BANK(); f.views[0].nodeOverrides = { x: { zone: 'first' } };
  assert.equal(cells(layout(f, 'v')).x[0], 0, 'zone "first" from the view');
  const z = off(BANK()); z.nodes.find(n => n.id === 'x').zone = 'last';
  assert.equal(cells(layout(z, 'v')).x[0], 4, 'a card\'s own zone holds with zones: false');
  const u = ZONED([], []); u.nodes.find(n => n.id === 'c').zone = 'under';
  const c = cells(layout(u, 'v')); assert.ok(c.c[1] > c.a[1], 'a main card under, when it says so');
});

test('the main flow keeps its place: a database on it is not moved under, an external that starts it is not moved last', () => {
  const m = ZONED([], []); m.nodes.find(n => n.id === 'b').kind = 'database'; m.nodes.find(n => n.id === 'a').kind = 'external';
  const c = cells(layout(m, 'v')); STEPS.forEach((id, i) => assert.deepEqual(c[id], [i, 0], id));
});

test('a view whose cards all have a zone has no flow left, and ranks as without zones (section 7.4)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'u', label: 'User', shape: 'person' }, { id: 'd', label: 'Data', kind: 'database' }, { id: 'f', label: 'File', kind: 'file' }],
    edges: [{ id: 'ud', from: 'u', to: 'd', label: 'saves' }, { id: 'df', from: 'd', to: 'f', label: 'exports' }], views: [{ id: 'v', nodeIds: ['u', 'd', 'f'], arrange: 'flow' }] };
  m.nodes.forEach(n => { n.zone = n.id === 'u' ? 'first' : 'under'; });
  assert.deepEqual(cells(layout(m, 'v')), cells(layout(off(structuredClone(m)), 'v')));
  const n = structuredClone(m); n.nodes.forEach(x => { delete x.zone; });
  assert.deepEqual(cells(layout(m, 'v')), cells(layout(n, 'v')));
});

test('pins win over zones, and boxes too: a store in a box sits under that box\'s flow', () => {
  const pin = PERSON(); pin.views[0].layout = { p: [5, 0] }; assert.deepEqual(cells(layout(pin, 'v')).p, [5, 0], 'a pin beats a zone');
  const m = STORE(); m.views[0].containers = [{ id: 'box', label: 'Box', nodeIds: ['a', 'b', 's'] }];
  const g = layout(m, 'v'), c = cells(g); assert.ok(c.s[1] > Math.max(c.a[1], c.b[1]), 'under the box\'s flow');
  const box = g.families.find(x => x.id === 'box'), s = g.nodes.find(n => n.id === 's');
  assert.ok(s.x >= box.x && s.x + s.w <= box.x + box.w && s.y + s.h <= box.y + box.h, 'inside its box');
});

test('a default zone that would draw more problems is dropped; a card\'s own zone holds even then', () => {
  const sign = { schemaVersion: 2, nodes: ['user', 'form', 'acct', 'check', 'review', 'active', 'mail'].map(id => ({ id, label: id }))
      .concat([{ id: 'staff', label: 'Staff', kind: 'public' }, { id: 'users', label: 'Users', kind: 'database' }]),
    edges: [['user', 'form'], ['form', 'acct'], ['acct', 'check'], ['check', 'active'], ['active', 'mail']].map(([from, to], i) => ({ id: 'm' + i, from, to, label: 'then', flow: 'main' }))
      .concat([{ id: 'b1', from: 'check', to: 'review', label: 'flags' }, { id: 'b2', from: 'staff', to: 'review', label: 'approves' }, { id: 'b3', from: 'review', to: 'active', label: 'releases' },
        { id: 'd1', from: 'acct', to: 'users', label: 'writes', flow: 'dep' }, { id: 'd2', from: 'active', to: 'users', label: 'updates', flow: 'dep' }]),
    views: [{ id: 'v', nodeIds: ['user', 'form', 'acct', 'check', 'review', 'staff', 'active', 'mail', 'users'], arrange: 'flow' }] };
  // Staff first would run its line under the flow, across the one Accounts writes Users with
  assert.deepEqual(cells(layout(sign, 'v')), cells(layout(off(structuredClone(sign)), 'v')));
  assert.equal(viewMetrics(layout(sign, 'v'), { model: sign, view: sign.views[0] }).cross, 0);
  const own = structuredClone(sign); own.nodes.find(n => n.id === 'staff').zone = 'first';
  assert.equal(cells(layout(own, 'v')).staff[0], 0);
});

test('without arrange a zone changes nothing', () => {
  const m = BANK(); delete m.views[0].arrange; m.nodes.find(n => n.id === 'x').zone = 'first';
  const u = BANK(); delete u.views[0].arrange; assert.deepEqual(cells(layout(m, 'v')), cells(layout(u, 'v')));
});

test('f12: reverse and cross of every arranged map view are not above the same view with zones: false (section 7.4)', () => {
  const f12 = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url)));
  for (const v of f12.views.filter(x => !x.diagram && x.zones !== false)) {
    const z = viewMetrics(layout(f12, v.id), { model: f12, view: v }), o = structuredClone(f12), ov = o.views.find(x => x.id === v.id); ov.zones = false;
    const b = viewMetrics(layout(o, v.id), { model: o, view: ov });
    assert.ok(z.reverse <= b.reverse && z.cross <= b.cross, `${v.id}: reverse ${z.reverse} (${b.reverse}), cross ${z.cross} (${b.cross})`);
  }
});

// section 12 step 10: the typed types that read the flow (flowRole, zoneOf). An arranged C4 or DFD view of f12 holds its main
// flow on one row, its stores under it and its dependency lines out of the ranks; the same view without arrange draws as before
test('typed C4 and DFD views: the main flow on one row, people first, stores under, and nothing new without arrange', () => {
  const f12 = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url), 'utf8')), off = structuredClone(f12);
  off.views.forEach(v => { delete v.arrange; });
  const d = layout(f12, 'orders-dfd'), row = id => d.byId[id].row;
  assert.deepEqual(['d-cust', 'd-take', 'd-bill', 'd-ship'].map(row), [1, 1, 1, 1], 'the main flow on one row');
  assert.ok(['d-orders', 'd-stock'].every(s => row(s) > 1), 'the stores under it');
  assert.deepEqual(d.edges.filter(e => e.mainLine).map(e => e.id), ['d-f1', 'd-f2', 'd-f3']);
  assert.deepEqual(d.edges.filter(e => e.dep).map(e => e.id), ['d-f5', 'd-f6', 'd-f7']);
  assert.ok(d.edges.filter(e => e.mainLine && e.id !== 'd-f1').every(e => e.pts.length === 2), 'a main line between two processes is one straight segment');
  const c = layout(f12, 'checkout-c4'), x = id => c.byId[id].col;
  assert.ok(['c-web', 'c-api', 'c-worker', 'c-psp'].every(i => x('c-shopper') < x(i)) && x('c-psp') > x('c-worker'), 'the shopper first, the provider after the flow');
  for (const v of ['orders-dfd', 'checkout-c4']) { const g = layout(off, v); assert.ok(g.edges.every(e => !e.dep && !e.mainLine), `${v} without arrange: no line marked`); }
  assert.notDeepEqual(cells(layout(off, 'orders-dfd')), cells(d), 'the arranged DFD lays out otherwise than without arrange');
});

test('a typed flowchart: the main flow straight down one column, the decision\'s "no" branch above it, the store in the band under it', () => {
  const f12 = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url), 'utf8')), g = layout(f12, 'request-flow'), at = id => g.byId[id];
  const main = ['f-start', 'f-read', 'f-ok', 'f-do', 'f-end'];
  assert.deepEqual(new Set(main.map(i => at(i).row)).size, 1, 'one row (laid out down: one column)');
  assert.ok(g.edges.filter(e => e.mainLine).length === 4 && g.edges.filter(e => e.mainLine).every(e => e.pts.length === 2), 'every main line one straight segment');
  assert.ok(at('f-reject').row < at('f-ok').row && at('f-save').row > at('f-ok').row, 'the "no" branch on one side, the store on the other');
  assert.equal(viewMetrics(g, { model: f12, view: f12.views.find(v => v.id === 'request-flow') }).cross, 0);
});

test('a typed BPMN view (its type ranks its own cells, cpPlace): the main flow from the start event marked, its items held on one row of the ranking, and no more crossings than without arrange', () => {
  const ex = JSON.parse(readFileSync(new URL('./fixtures/bookshop-order-to-shipment.json', import.meta.url), 'utf8')), on = structuredClone(ex), V = 'order-to-shipment';
  on.views.find(v => v.id === V).arrange = 'flow';
  const g = layout(on, V), g0 = layout(ex, V), cross = (m, h) => viewMetrics(h, { model: m, view: m.views.find(v => v.id === V) }).cross;
  assert.ok(g.edges.filter(e => e.mainLine).length >= 5 && g.edges.some(e => e.dep), 'a main flow and dependency lines');
  assert.ok(g0.edges.every(e => !e.mainLine && !e.dep), 'without arrange: nothing marked');
  assert.ok(cross(on, g) <= cross(ex, g0), `crossings ${cross(on, g)} against ${cross(ex, g0)}`);
});
