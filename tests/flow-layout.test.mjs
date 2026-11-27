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
import { readFileSync, readdirSync } from 'node:fs';

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

test('f12\'s boxed views: straight 0 where the main flow passes each box once; Sign-up, which leaves App for Risk and comes back, keeps App\'s runs on one row with Risk under the gap', async () => {
  const { readFileSync } = await import('node:fs'), m = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url)));
  const s = id => viewMetrics(layout(m, id), { model: m, view: m.views.find(v => v.id === id) });
  for (const id of ['order-boxed', 'ticket-boxed', 'pipeline-boxed']) assert.equal(s(id).straight, 0, id);
  const g = layout(m, 'signup-boxed'), at = Object.fromEntries(g.nodes.map(n => [n.id, n])), box = id => g.families.find(f => f.id === id), cx = n => n.x + n.w / 2;
  assert.ok(['s-form', 's-acct', 's-active', 's-welcome'].every(id => midY(at[id]) === midY(at['s-user'])), 'App\'s two runs on the main row');
  const app = box('sb-app'), risk = box('sb-risk');
  assert.ok(risk.y >= app.y + app.h && risk.x >= app.x && risk.x + risk.w <= app.x + app.w, 'Risk under App, within its columns');
  assert.ok(cx(at['s-acct']) < cx(at['s-check']) && cx(at['s-check']) < cx(at['s-active']), 'Risk check between the two runs');
  // the one card off the row costs 2 (two rows), and the lines into and out of it, which come into their cards at the top and
  // the bottom, one corner each: 4, where the second row was 6 with 4 lines back
  const r = s('signup-boxed'); assert.deepEqual([r.hard, r.straight, r.reverse], [0, 4, 0]);
  assert.deepEqual(['s-m2', 's-m3'].map(id => g.edges.find(e => e.id === id).pts.length), [3, 3], 'into Risk and back out: one corner each');
  assert.deepEqual(check(m, 'signup-boxed').filter(p => /right-to-left/.test(p.message)), []);
});

test('a main flow that leaves a box for one card and comes back: the box\'s runs on one row, the card under the gap, the box one rectangle not over it', () => {
  const C = ['a', 'b', 'c', 'd', 'e'], m = { schemaVersion: 2, nodes: C.map(i => ({ id: i, label: 'Step ' + i.toUpperCase() })),
    edges: C.slice(1).map((to, i) => ({ id: 'm' + i, from: C[i], to, label: 'then', flow: 'main' })),
    views: [{ id: 'v', arrange: 'flow', nodeIds: C, containers: [{ id: 'app', label: 'App', nodeIds: ['a', 'b', 'd', 'e'] }] }] };
  const g = layout(m, 'v'), at = Object.fromEntries(g.nodes.map(n => [n.id, n])), app = g.families.find(f => f.id === 'app'), c = at.c;
  assert.ok(['b', 'd', 'e'].every(id => midY(at[id]) === midY(at.a)), 'the box\'s runs on one row');
  assert.ok(c.y >= app.y + app.h && c.x > at.b.x + at.b.w && c.x + c.w < at.d.x, 'the card under the box, between its runs');
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.equal(s.hard, 0); assert.equal(s.reverse, 0); assert.equal(s.straight, 4);
});

test('a box that holds the flow\'s first card and comes back after a box beside it: no hole in its parent\'s columns, the box\'s runs on one row', async () => {
  const { readFileSync } = await import('node:fs'), m = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url)));
  m.views.find(v => v.id === 'ticket-boxed').containers = [{ id: 'tb-l1', label: 'First line', nodeIds: ['t-desk', 't-triage', 't-kb'] }, { id: 'tb-l2', label: 'Engineering', nodeIds: ['t-fix', 't-verify', 't-cust'] }];
  const g = layout(m, 'ticket-boxed'), at = id => g.byId[id]; // the edit corpus's move into a box, which threw in untangle
  assert.ok(['t-fix', 't-verify'].every(id => midY(at(id)) === midY(at('t-cust'))), 'Engineering\'s runs on one row');
  const s = viewMetrics(g, { model: m, view: m.views.find(v => v.id === 'ticket-boxed') }); assert.deepEqual([s.hard, s.straight, s.reverse], [0, 4, 0]);
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

// Step 8 (section 14): the snake. An arranged map view whose main flow has more than SNAKE_AT (10) cards wraps it onto a
// second row that runs back under the first, joined by one turn line straight down; each line of the snake says its
// reading way (dir), which check() and the score read, and each main card its run.
const LONG = (n, { labels = () => 'next', more = {}, extra = [], lines = [] } = {}) => { const ids = Array.from({ length: n }, (_, i) => 'c' + i);
  return { schemaVersion: 2, nodes: [...ids.map(i => ({ id: i, label: 'Step ' + i.slice(1) })), ...extra],
    edges: [...ids.slice(1).map((to, i) => ({ id: 'm' + i, from: ids[i], to, flow: 'main', ...(labels(i) != null && { label: labels(i) }) })), ...lines],
    views: [{ id: 'v', arrange: 'flow', nodeIds: [...ids, ...extra.map(x => x.id)], ...more }] }; };
const ids = n => Array.from({ length: n }, (_, i) => 'c' + i);

test('a 14-card main flow is on two rows: seven at row 0 in columns 0 to 6, seven at one row M in columns 6 to 0, every main line two points, the turn line straight down, and check() says nothing', () => {
  const m = LONG(14), g = layout(m, 'v'), c = cells(g), M = c.c7[1];
  assert.ok(M > 0);
  ids(14).forEach((id, i) => assert.deepEqual(c[id], i < 7 ? [i, 0] : [13 - i, M], id));
  assert.ok(ids(14).slice(1).every((to, i) => line(g, 'c' + i, to).pts.length === 2), 'every main line is one segment');
  const turn = line(g, 'c6', 'c7'); assert.equal(turn.pts[0][0], turn.pts[1][0], 'the turn line is vertical'); assert.equal(turn.dir, 'down');
  assert.equal(line(g, 'c2', 'c3').dir, 'right'); assert.equal(line(g, 'c9', 'c10').dir, 'left');
  assert.deepEqual(g.nodes.map(n => n.run), ids(14).map((_, i) => i < 7 ? 0 : 1));
  assert.deepEqual(check(m, 'v'), []);
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.equal(s.straight, 0); assert.equal(s.reverse, 0);
});

test('a main flow of SNAKE_AT cards is one row, as step 6 draws it, and no line has a dir nor any card a run', () => {
  const g = layout(LONG(10), 'v');
  assert.deepEqual(cells(g), Object.fromEntries(ids(10).map((id, i) => [id, [i, 0]])));
  assert.ok(g.edges.every(e => !('dir' in e)) && g.nodes.every(n => !('run' in n)));
  for (const f of ['order', 'signup', 'order-boxed', 'signup-boxed']) { const f12 = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url))); assert.ok(layout(f12, f).edges.every(e => !('dir' in e)), f); }
});

test('the route audit reads each snake line against its dir: a line on the second row that runs right is still reported', () => {
  const m = LONG(14, { extra: [{ id: 'x', label: 'Extra' }], lines: [{ id: 'bx', from: 'c9', to: 'x', label: 'hands to' }, { id: 'xb', from: 'x', to: 'c11', label: 'back' }], more: { layout: { x: [9, 4] } } });
  const g = layout(m, 'v'); assert.equal(line(g, 'c9', 'x').dir, 'left'); assert.deepEqual(cells(g).x, [9, 4]);
  const said = check(m, 'v').map(p => p.message);
  assert.ok(said.includes('view v: edge Step 9→Extra runs left-to-right'), said.join('\n'));
  assert.ok(!said.some(s => /Step 1\d?→Step|bottom-to-top/.test(s) && !/Extra/.test(s)), said.join('\n'));
});

test('the cut falls on the main line with no label near the middle; it never makes the second run longer than the first', () => {
  const c = cells(layout(LONG(14, { labels: i => i === 7 ? null : 'next' }), 'v'));
  assert.equal(c.c7[1], 0); assert.ok(c.c8[1] > 0); assert.equal(c.c8[0], c.c7[0]);
  const d = cells(layout(LONG(13, { labels: i => i === 4 ? null : 'next' }), 'v')); // a cut after c4 would leave the second run longer
  assert.equal(d.c6[1], 0); assert.ok(d.c7[1] > 0);
});

test('with boxes the cut falls between two boxes, a box that holds the whole flow holds both rows, and a cut that must split a box leaves one row', () => {
  const box = (id, a, z) => ({ id, label: id.toUpperCase(), nodeIds: ids(14).slice(a, z) });
  const g = layout(LONG(14, { more: { containers: [box('a', 0, 8), box('b', 8, 14)] } }), 'v'), c = cells(g), F = id => g.families.find(f => f.id === id);
  assert.equal(c.c7[1], c.c0[1]); assert.ok(c.c8[1] > c.c7[1]); assert.equal(c.c8[0], c.c7[0]);
  assert.ok(F('b').y > F('a').y + F('a').h, 'B under A'); assert.equal(line(g, 'c7', 'c8').pts.length, 2);
  const w = layout(LONG(14, { more: { containers: [box('all', 0, 14)] } }), 'v'), cw = cells(w), A = w.families.find(f => f.id === 'all');
  assert.ok(cw.c7[1] > cw.c6[1]); assert.ok(w.nodes.every(n => n.y >= A.y && n.y + n.h <= A.y + A.h), 'the box holds both rows');
  const s = cells(layout(LONG(14, { more: { containers: [box('a', 0, 4), box('b', 4, 14)] } }), 'v'));
  assert.equal(new Set(ids(14).map(i => s[i][1])).size, 1, 'one row');
});

test('pins win: a pinned main card keeps its pin, and with half the main cards pinned the view is one row', () => {
  const p = cells(layout(LONG(14, { more: { layout: { c3: [3, 5] } } }), 'v'));
  assert.deepEqual(p.c3, [3, 5]); assert.ok(p.c10[1] > p.c2[1], 'the rest still snakes');
  const h = layout(LONG(14, { more: { layout: Object.fromEntries(ids(7).map((id, i) => [id, [i, 0]])) } }), 'v');
  assert.equal(new Set(h.nodes.map(n => n.row)).size, 1); assert.ok(h.edges.every(e => !('dir' in e)));
});

test('a first card and a last card are both at the left, on the first row and the second; a branch from the first run into the second sits between the rows; a store both runs write sits between them too', () => {
  const m = LONG(14, { extra: [{ id: 'p', label: 'Shopper', shape: 'person' }, { id: 'e', label: 'Bank', kind: 'external' }, { id: 'x', label: 'Side step' }, { id: 's', label: 'Orders', kind: 'database' }],
    lines: [{ id: 'pc', from: 'p', to: 'c0', label: 'starts' }, { id: 'ce', from: 'c13', to: 'e', label: 'settles' }, { id: 'cx', from: 'c4', to: 'x', label: 'skips' }, { id: 'xc', from: 'x', to: 'c10', label: 'joins' },
      { id: 'w1', from: 'c2', to: 's', label: 'writes', flow: 'dep' }, { id: 'w2', from: 'c11', to: 's', label: 'writes', flow: 'dep' }] });
  const g = layout(m, 'v'), c = cells(g);
  assert.ok(c.p[0] < c.c0[0] && c.p[1] === c.c0[1], 'the first card left of the flow, on its first row');
  assert.ok(c.e[0] < c.c13[0] && c.e[1] === c.c13[1], 'the last card left of the second run\'s end, on its row');
  for (const x of ['x', 's']) assert.ok(c[x][1] > c.c0[1] && c[x][1] < c.c13[1], x + ' between the rows');
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.equal(s.hard, 0); assert.equal(s.cross, 0); assert.equal(s.straight, 0);
});

test('f12\'s onboarding views snake: two rows, straight 0 and reverse 0, with and without boxes', () => {
  const f12 = JSON.parse(readFileSync(new URL('../bench/models/f12.json', import.meta.url)));
  for (const id of ['onboard', 'onboard-boxed']) { const v = f12.views.find(x => x.id === id), g = layout(f12, id), s = viewMetrics(g, { model: f12, view: v });
    assert.deepEqual([s.hard, s.straight, s.reverse], [0, 0, 0], id); assert.equal(new Set(g.nodes.filter(n => n.run != null).map(n => n.y)).size, 2, id);
    assert.deepEqual(check(f12, id), [], id); }
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

// a typed view with boxes (blockPos with the type's boxes) holds its main flow on one row as a map's: a C4 boundary whose
// branches are mentioned before the main lines put the main cards on other rows when blockPos read no main flow
const C4BOX = () => ({ schemaVersion: 2,
  nodes: [{ id: 'u', type: 'c4.Person', label: 'Shopper' }, { id: 'sys', type: 'c4.SoftwareSystem', label: 'Shop' },
    ...[['web', 'Web app'], ['cache', 'Cache warmer'], ['api', 'API'], ['audit', 'Audit'], ['worker', 'Worker']].map(([id, label]) => ({ id, type: 'c4.Container', label, parent: 'sys', props: { technology: 'Go' } })),
    { id: 'psp', type: 'c4.SoftwareSystem', label: 'Payments', props: { external: true } }],
  edges: [{ id: 'r0', type: 'c4.Relationship', from: 'web', to: 'cache', label: 'Warms' }, { id: 'r0b', type: 'c4.Relationship', from: 'api', to: 'audit', label: 'Logs' },
    ...[['u', 'web'], ['web', 'api'], ['api', 'worker'], ['worker', 'psp']].map(([from, to], i) => ({ id: 'r' + (i + 1), type: 'c4.Relationship', from, to, label: 'then', flow: 'main' }))],
  views: [{ id: 'v', diagram: 'c4.container', subject: 'sys', arrange: 'flow', nodeIds: ['u', 'sys', 'web', 'cache', 'api', 'audit', 'worker', 'psp'] }] });

test('a typed view with boxes: the main flow on one row across the boundary, the branches off it, straight 0', () => {
  const m = C4BOX(), g = layout(m, 'v'), at = id => g.byId[id];
  assert.ok(['web', 'api', 'worker', 'psp'].every(id => midY(at(id)) === midY(at('u'))), 'every main card on the main row');
  assert.ok(['cache', 'audit'].every(id => midY(at(id)) !== midY(at('u'))), 'the branches off it');
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.deepEqual([s.hard, s.straight, s.reverse], [0, 0, 0]);
});

// the snake (section 14) for a typed view: its main flow from the type's typedMain, its cards' runs and lines' ways in memo.flow
const DFD = n => { const P = Array.from({ length: n }, (_, i) => 'p' + i);
  return { schemaVersion: 2, nodes: [{ id: 'cust', type: 'dfd.ExternalEntity', label: 'Customer' }, ...P.map((id, i) => ({ id, type: 'dfd.Process', label: 'Step ' + (i + 1), props: { number: String(i + 1) } })),
    { id: 'st', type: 'dfd.DataStore', label: 'Orders', props: { number: 'D1' } }],
  edges: [{ id: 'f0', type: 'dfd.DataFlow', from: 'cust', to: 'p0', label: 'order', flow: 'main' }, ...P.slice(1).map((to, i) => ({ id: 'm' + i, type: 'dfd.DataFlow', from: P[i], to, flow: 'main' })),
    { id: 'd1', type: 'dfd.DataFlow', from: 'p2', to: 'st', label: 'saves', flow: 'dep' }],
  views: [{ id: 'v', diagram: 'dfd', arrange: 'flow', nodeIds: ['cust', ...P, 'st'] }] }; };

test('a typed view whose main flow is longer than SNAKE_AT snakes: two rows, the second reading back, runs and ways marked, check() silent', () => {
  const m = DFD(14), g = layout(m, 'v'), main = ['cust', ...Array.from({ length: 14 }, (_, i) => 'p' + i)];
  assert.equal(new Set(main.map(id => midY(g.byId[id]))).size, 2, 'two rows');
  assert.deepEqual(main.map(id => g.byId[id].run), [...Array(8).fill(0), ...Array(7).fill(1)]);
  assert.equal(g.edges.find(e => e.id === 'm6').dir, 'down'); assert.ok(g.edges.filter(e => e.dir === 'left').length === 6 && g.edges.filter(e => e.dir === 'down').every(e => e.pts.length === 2));
  const s = viewMetrics(g, { model: m, view: m.views[0] }); assert.deepEqual([s.hard, s.straight, s.reverse], [0, 0, 0]);
  assert.deepEqual(check(m, 'v'), []);
  const short = DFD(9), h = layout(short, 'v'); assert.ok(h.nodes.every(n => n.run == null) && h.edges.every(e => !e.dir), 'a flow of SNAKE_AT cards or fewer: one row, nothing marked');
});

// audit 66: a box holding a last card and an under card the main flow found as the longest path runs through (Bank -> Order
// API -> Orders DB) left the box's last card unplaced (its rank -Infinity, from a gap the flow leaves for the API that
// moved the under store), and blockPos read its row: layout(), check() and render() threw a TypeError
test('an arranged boxed view whose box holds a last card and an under card on the longest path lays out, each card in a cell of its own', () => {
  const m = { schemaVersion: 1, title: 'Orders', nodes: [{ id: 'db', label: 'Orders DB', kind: 'database', zone: 'under' }, { id: 'bank', label: 'Bank', kind: 'external', zone: 'last' }, { id: 'api', label: 'Order API', kind: 'backend' }],
    edges: [{ from: 'bank', to: 'api', label: 'confirms' }, { from: 'api', to: 'db', label: 'writes' }],
    views: [{ id: 'v', title: 'Orders', arrange: 'flow', nodeIds: ['db', 'bank', 'api'], containers: [{ id: 'outside', label: 'Outside', nodeIds: ['db', 'bank'] }] }] };
  assert.deepEqual(validate(m), []);
  for (const zone of ['last', 'first', 'under', undefined]) { const z = structuredClone(m); z.nodes[1].zone = zone;
    const g = layout(z, 'v'), at = new Set(g.nodes.map(n => n.col + ',' + n.row));
    assert.equal(at.size, 3, `bank ${zone}: three cells`); assert.deepEqual(check(z, 'v').filter(p => / overlap$/.test(p.message)), [], `bank ${zone}`); }
  const g = layout(m, 'v'), c = cells(g);
  assert.ok(c.bank[0] > c.api[0], 'the last card after the API');
});

// audit 66: two joined cards of one zone (a shopper and the storefront it uses, both first; a gateway and the bank it
// settles with, both last) took one column and both the main row; an under store a step writes and the next reads put
// that step in the writer's column, both on the main row
test('two joined first or last cards take a column each, and a card an under store feeds is ranked past its writer', () => {
  const view = ids => [{ id: 'v', title: 'Checkout', arrange: 'flow', nodeIds: ids }];
  const cases = [
    { schemaVersion: 1, nodes: [{ id: 'user', label: 'Shopper', kind: 'person', zone: 'first' }, { id: 'web', label: 'Storefront', kind: 'frontend', zone: 'first' }, { id: 'api', label: 'Order API', kind: 'backend' }, { id: 'db', label: 'Orders', kind: 'database' }],
      edges: [{ from: 'user', to: 'web', label: 'browses' }, { from: 'web', to: 'api', label: 'places' }, { from: 'api', to: 'db', label: 'writes' }], views: view(['user', 'web', 'api', 'db']) },
    { schemaVersion: 1, nodes: [{ id: 'api', label: 'Order API', kind: 'backend' }, { id: 'gw', label: 'Payment gateway', kind: 'external', zone: 'last' }, { id: 'bank', label: 'Bank', kind: 'external', zone: 'last' }],
      edges: [{ from: 'api', to: 'gw', label: 'charges' }, { from: 'gw', to: 'bank', label: 'settles' }], views: view(['api', 'gw', 'bank']) },
    { schemaVersion: 1, nodes: [{ id: 'api', label: 'Order API', kind: 'backend' }, { id: 'db', label: 'Orders DB', kind: 'database', zone: 'under' }, { id: 'etl', label: 'Reporting', kind: 'backend' }],
      edges: [{ from: 'api', to: 'db', label: 'writes' }, { from: 'db', to: 'etl', label: 'exports' }], views: view(['api', 'db', 'etl']) }];
  const order = [['user', 'web', 'api'], ['api', 'gw', 'bank'], ['api', 'etl']];
  cases.forEach((m, k) => { assert.deepEqual(validate(m), []);
    for (const boxed of [false, true]) { const b = structuredClone(m); if (boxed) b.views[0].containers = [{ id: 'box', label: 'Box', nodeIds: b.views[0].nodeIds.slice(0, 2) }];
      assert.deepEqual(check(b, 'v').filter(p => / overlap$/.test(p.message)), [], `case ${k}${boxed ? ' boxed' : ''}`); }
    const c = cells(layout(m, 'v')); order[k].slice(1).forEach((id, j) => assert.ok(c[id][0] > c[order[k][j]][0], `case ${k}: ${id} after ${order[k][j]}`)); });
  const c = cells(layout(cases[2], 'v')); assert.ok(c.db[1] > c.etl[1], 'the store under the flow');
});

// audit 71: an arranged typed view was laid out only in arranged ways (bestTyped, src/map/context.js), so where every one drew
// more than ranked (an activity laid out down whose decision's [no] line ran straight to its merge across a fork's branches,
// 2 crossings against none; C4's landscape laid out down, 6 against none) arrange "flow" drew it worse. The ranked layout is a
// way too, kept when every arranged one draws more problems: no view of the test fixtures draws more arranged than ranked
test('audit 71: arranged, no typed view of the test fixtures draws more layout check problems than ranked, laid out right or down', () => {
  const dir = new URL('./fixtures/', import.meta.url), worse = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json')).sort()) { const m = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const v of Array.isArray(m.views) ? m.views : []) { if (!v.diagram || v.diagram === 'map' || v.layout) continue;
      for (const direction of ['right', 'down']) { const said = arrange => { const c = structuredClone(m), w = c.views.find(x => x.id === v.id);
        w.direction = direction; if (arrange) w.arrange = 'flow'; else delete w.arrange; return check(c, v.id).length; };
        const r = said(false), a = said(true); if (a > r) worse.push(`${f} ${v.id} ${direction}: ${a} arranged, ${r} ranked`); } } }
  assert.deepEqual(worse, []);
});
test('audit 71: arranged and laid out down, a decision whose [no] line runs straight to its merge past a fork in its [yes] branch draws no crossing', () => {
  const n = (id, t, label) => ({ id, type: 'uml.' + t, ...(label && { label }) });
  // the audit's generated view (its ids, which order the cards): one fork branch of one action, the other of two
  const nodes = [n('n0', 'InitialNode'), n('n1', 'Action', 'Do thing 1 xxxxxxxxxxxxx'), n('n2', 'DecisionNode', 'ok2?'), n('n3', 'MergeNode'), n('n4', 'ForkNode'), n('n5', 'JoinNode'),
    n('n6', 'SendSignalAction', 'Do thing 6 xxx'), n('n9', 'Action', 'Do thing 9 xxxxx'), n('n10', 'SendSignalAction', 'Do thing 10 xxx'), n('n18', 'ActivityFinalNode')];
  const edges = [['e7', 'n4', 'n6'], ['e8', 'n6', 'n5'], ['e11', 'n9', 'n10'], ['e12', 'n4', 'n9'], ['e13', 'n10', 'n5'], ['e14', 'n2', 'n4', '[yes]'], ['e15', 'n5', 'n3'],
    ['e16', 'n2', 'n3', '[no]'], ['e17', 'n1', 'n2'], ['e19', 'n0', 'n1'], ['e20', 'n3', 'n18']].map(([id, f, t, label]) => ({ id, type: 'uml.ControlFlow', from: f, to: t, ...(label && { label }) }));
  for (const direction of ['down', 'right']) for (const arrange of [undefined, 'flow']) {
    const m = { schemaVersion: 2, title: 't', root: 'v', nodes, edges, views: [{ id: 'v', diagram: 'uml.activity', title: 'A', nodeIds: nodes.map(x => x.id), direction, ...(arrange && { arrange }) }] };
    assert.deepEqual(check(m, 'v').map(p => p.message), [], `${direction} ${arrange || 'ranked'}`); }
});
