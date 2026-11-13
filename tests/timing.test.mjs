// The timing type, uml.timing (work package 6.5, notes/stage-6.md §7 to §9), in Node on the sources: its definition, an
// inline copy of 14-timing.json laid out clean (§11's timing predicate) with its names, reading order, legend and
// describe(), the values form, each validator with a passing and a failing model, F2's `@` forms, every gesture hook's
// commands through apply(), a 30-step session undone, redone and reopened, the PDF's rows, the sequence type ignoring a
// lifeline's states, and §12's budgets. tests/timing.html draws it in Chrome and edits it by pointer and keyboard.
// Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import '../src/map/typed.js';
import { layout } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { describe } from '../src/map/insight.js';
import { tablesOf } from '../src/page/print.js';
import { sqDescribe } from '../src/uml/sequence.js';
import { TM_TYPE, TM_RULER, tmRowId, tmProblems, tmParse, tmPrint, tmAdd, tmConnect, tmMoveTo, tmRename, tmRemove, tmKeyHook } from '../src/uml/timing.js';

// an inline copy of docs/diagrams/examples/14-timing.json (6.6 moves and revises the file; these tests keep this copy)
const EX = () => ({ schemaVersion: 2, title: 'Bookshop: one charge', root: 'charge',
  nodes: [{ id: 'worker', type: 'uml.Lifeline', label: 'worker', props: { represents: 'OrderWorker', states: ['Idle', 'Waiting for payment', 'Recording payment'] } },
    { id: 'payments', type: 'uml.Lifeline', label: 'payments', props: { represents: 'PaymentProvider', states: ['Idle', 'Authorising', 'Capturing'] } }],
  edges: [],
  views: [{ id: 'charge', diagram: 'uml.timing', title: 'One charge', parent: null, nodeIds: ['worker', 'payments'],
    edges: [{ id: 'm-charge', type: 'uml.Message', from: 'worker', to: 'payments', label: 'charge(total)', props: { sort: 'call', sentAt: 100, receivedAt: 140 } },
      { id: 'm-paid', type: 'uml.Message', from: 'payments', to: 'worker', label: 'paid', props: { sort: 'reply', replyTo: 'm-charge', sentAt: 720, receivedAt: 760 } }],
    timeline: { unit: 'ms',
      changes: [['w-idle', 'worker', 0, 'Idle'], ['w-waiting', 'worker', 100, 'Waiting for payment'], ['w-recording', 'worker', 760, 'Recording payment'], ['w-done', 'worker', 900, 'Idle'],
        ['p-idle', 'payments', 0, 'Idle'], ['p-authorising', 'payments', 140, 'Authorising'], ['p-capturing', 'payments', 480, 'Capturing'], ['p-done', 'payments', 720, 'Idle']]
        .map(([id, lifeline, at, state]) => ({ id, lifeline, at, state })),
      constraints: [{ id: 'c-wait', type: 'uml.DurationConstraint', from: 'w-waiting', to: 'w-recording', label: '{<= 800 ms}' },
        { id: 'c-finished', type: 'uml.TimeConstraint', from: 'w-done', label: '{<= 1000 ms}' }] } }] });
const V = m => m.views[0], TL = m => V(m).timeline, ch = (m, id) => TL(m).changes.find(c => c.id === id), msg = (m, id) => V(m).edges.find(e => e.id === id);
const errors = m => validate(m).filter(p => p.level === 'error');
const rules = m => tmProblems(m, V(m)).map(p => [p.level, p.rule, p.ids]);
const cmdsOf = r => (r && Array.isArray(r.commands) ? r.commands : r);
const run = (m, r) => { const c = cmdsOf(r); assert.ok(Array.isArray(c) && c.length, JSON.stringify(r)); const n = apply(m, c); assert.deepEqual(errors(n), []); return n; };
const LINE = sort => TM_TYPE.lines.find(l => l.props && l.props.sort === sort), DUR = () => TM_TYPE.lines.find(l => l.type === 'uml.DurationConstraint');
const ENTRY = type => TM_TYPE.elements.find(e => e.type === type);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (b, B, k = .5) => b.x >= B.x - k && b.y >= B.y - k && b.x + b.w <= B.x + B.w + k && b.y + b.h <= B.y + B.h + k;

/* §11's timing predicate on the type's geometry: steps and state rows in their lanes, every message's ends on its lanes'
   levels within 1 px (a state's row, the band's middle, else the lane's middle), no message label over a step, a value, a
   state row or another label, every constraint's label in its strip, every node in the bounds, and no layout problem */
function unclean(g, m) {
  const o = g.tr, bad = [...g.problems.map(p => p.message)], lane = id => o.lanes.find(l => l.id === id), v = V(m);
  const level = (id, t) => { const l = lane(id), c = TL(m).changes.filter(x => x.lifeline === id && x.at <= t).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)).pop(), vals = (v.present || {})[id]?.as === 'values';
    return !c || vals ? l.y + l.h / 2 : l.rows.find(r => r.state === c.state).y; };
  const segs = o.steps.flatMap(s => { const l = lane(s.lane); return s.pts.slice(1).map((q, i) => { const p = s.pts[i], b = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) };
    if (!within(b, l)) bad.push(`a step of ${s.lane} leaves its lane`); return b; }); });
  const rows = g.nodes.filter(n => n.shape === 'tm-row');
  rows.forEach(r => { const l = lane(r.id.split('->')[0]); if (!within(r, l)) bad.push(`row ${r.id} leaves its lane`); });
  const vals = o.bands.flatMap(b => { const l = lane(b.lane); return b.segs.filter(s => s.text != null).map(s => ({ x: s.x0 + 6, y: l.y + l.h / 2 - 7, w: s.x1 - s.x0 - 12, h: 14 })); });
  g.edges.forEach((e, i) => { const p = msg(m, e.id).props;
    if (Math.abs(e.pts[0][1] - level(e.from, p.sentAt)) > 1) bad.push(`${e.id} starts off ${e.from}'s level`);
    if (Math.abs(e.pts[1][1] - level(e.to, p.receivedAt)) > 1) bad.push(`${e.id} ends off ${e.to}'s level`);
    if (!e.lbl) return;
    [...segs, ...vals, ...rows].forEach(b => { if (meets(e.lbl, b)) bad.push(`${e.id}'s label meets ${b.id || 'a step or a value'}`); });
    g.edges.slice(0, i).forEach(f => { if (f.lbl && meets(e.lbl, f.lbl)) bad.push(`${e.id}'s label meets ${f.id}'s`); });
    g.nodes.filter(n => n.shape === 'tm-mark').forEach(n => { if (meets(e.lbl, n.lbl)) bad.push(`${e.id}'s label meets ${n.id}'s`); }); });
  g.nodes.filter(n => n.shape === 'tm-mark').forEach(n => { const s = o.lanes.find(l => n.lbl.y >= l.strip.y - .01 && n.lbl.y + n.lbl.h <= l.strip.y + l.strip.h + .01); if (!s) bad.push(`${n.id}'s label is in no strip`); });
  g.nodes.forEach(n => { if (!within(n, g.bounds)) bad.push(`${n.id} out of the bounds`); });
  o.lanes.forEach((l, i) => o.lanes.slice(0, i).forEach(k => { if (meets(l, k)) bad.push(`lanes ${l.id} and ${k.id} meet`); }));
  return bad;
}

test('the definition: palette, lines with their sorts and the duration constraint, §8.2\'s properties, a layout of its own with no pins, the hooks, §7.2\'s rules', () => {
  const T = diagramOf({ diagram: 'uml.timing' });
  assert.equal(T, TM_TYPE);
  assert.deepEqual(T.elements.map(e => [e.type, e.label]), [['uml.Lifeline', 'Lifeline'], ['uml.StateInvariant', 'Change'], ['uml.TimeConstraint', 'Time constraint']]);
  assert.deepEqual(T.lines.map(l => [l.type, l.label, l.props && l.props.sort]), [['uml.Message', 'Call', 'call'], ['uml.Message', 'Async', 'async'], ['uml.Message', 'Reply', 'reply'], ['uml.DurationConstraint', 'Duration constraint', undefined]]);
  assert.deepEqual(T.props['uml.Lifeline'].map(f => [f.key, f.kind]), [['represents', 'text'], ['states', 'list'], ['stereotypes', 'list']]);
  assert.deepEqual(T.props['uml.Message'].map(f => [f.key, f.kind]), [['sort', 'enum'], ['replyTo', 'text']]);
  assert.deepEqual(T.refs, { 'uml.Message': { 'props.replyTo': 'cascade' } });
  assert.deepEqual([typeof T.layout.run, T.layout.pins, typeof T.draw, typeof T.describe, typeof T.rows], ['function', false, 'function', 'function', 'function']);
  assert.deepEqual(Object.keys(T.edits), ['connect', 'moveTo', 'add', 'remove', 'rename', 'key']);
  assert.deepEqual(Object.keys(T.rules), ['change-lifeline', 'change-time', 'change-state', 'change-instant', 'message-ends', 'message-times', 'sort', 'reply-call', 'constraint-ends', 'constraint-order']);
});

test('14-timing.json (an inline copy) lays out clean: two lanes, their state rows, eight changes, two messages with their sorts\' ends, two constraints, the ruler; no problem', () => {
  const m = EX(), g = layout(m, 'charge');
  assert.deepEqual(validate(m), []);
  assert.deepEqual(unclean(g, m), []);
  const by = s => g.nodes.filter(n => n.shape === s).map(n => n.id);
  assert.deepEqual(by('tm-lane'), ['worker', 'payments']);
  assert.deepEqual(by('tm-row'), ['Idle', 'Waiting for payment', 'Recording payment'].map(s => tmRowId('worker', s)).concat(['Idle', 'Authorising', 'Capturing'].map(s => tmRowId('payments', s))));
  assert.deepEqual(by('tm-change').sort(), TL(m).changes.map(c => c.id).sort());
  assert.deepEqual([by('tm-mark'), by('tm-ruler')], [['c-wait', 'c-finished'], [TM_RULER]]);
  assert.deepEqual(g.edges.map(e => [e.id, e.end.to, !!e.end.dashed]), [['m-charge', 'arrow', false], ['m-paid', 'open', true]]);
  assert.deepEqual(g.tr.steps.map(s => s.lane), ['worker', 'payments']);
  // the ruler: one base, 0 to its end, a 1-2-5 step; slots at every minor tick of every lane, with their x and time
  assert.deepEqual([g.tr.scale.t0, g.tr.scale.step], [0, 200]);
  assert.ok(g.slots.length > 20 && g.slots.every(s => Number.isFinite(s.x) && Number.isFinite(s.t) && ['worker', 'payments'].includes(s.parent)));
  assert.deepEqual(g.slots.filter(s => s.parent === 'worker').map(s => s.t).slice(0, 3), [0, 40, 80]);
  // each change's hit box on its upright, 12 px wide
  const wait = g.byId['w-waiting'], [up] = g.tr.steps[0].pts.filter(p => Math.abs(p[0] - (wait.x + 6)) < .01);
  assert.ok(up && wait.w === 12, 'the hit box is centred on its upright');
});

test('the layout is not edited after the ruler: laid out twice from one memo, the same markup; the input as the type measures it', () => {
  const m = EX(), memos = {}, draw = () => mapContext(m, { memos }).buildView('charge').markup.replace(/\bg\d+-/g, 'g-'), a = draw(), b = draw(); // a picture's marker ids count pictures
  assert.equal(a, b);
  assert.match(a, /class="tm-step"/); assert.match(a, /class="node tm-change"/); assert.match(a, /class="node tm-ruler"/);
});

test('names (A1), reading order (lanes, each with its rows and changes in time, then messages by sentAt, constraints, the ruler), legend and describe()', () => {
  const m = EX(), g = layout(m, 'charge'), aria = id => (g.byId[id] || g.edges.find(e => e.id === id)).aria;
  assert.equal(aria('worker'), 'Lifeline worker : OrderWorker, 3 states, 4 changes');
  assert.equal(aria('w-waiting'), 'worker: Waiting for payment from 100 ms');
  assert.equal(aria('m-charge'), 'Call charge(total) from worker at 100 ms to payments at 140 ms');
  assert.equal(aria('c-wait'), 'Duration constraint {<= 800 ms} on worker from 100 ms to 760 ms');
  assert.equal(aria('c-finished'), 'Time constraint {<= 1000 ms} on worker at 900 ms');
  assert.equal(aria(TM_RULER), 'Time ruler, 0 to 900 ms, a tick every 200 ms');
  assert.equal(aria(tmRowId('payments', 'Capturing')), 'State Capturing of payments');
  assert.deepEqual(g.order, ['worker', ...['Idle', 'Waiting for payment', 'Recording payment'].map(s => tmRowId('worker', s)), 'w-idle', 'w-waiting', 'w-recording', 'w-done',
    'payments', ...['Idle', 'Authorising', 'Capturing'].map(s => tmRowId('payments', s)), 'p-idle', 'p-authorising', 'p-capturing', 'p-done', 'm-charge', 'm-paid', 'c-wait', 'c-finished', TM_RULER]);
  assert.deepEqual(g.legend.map(l => l.match(/<b>([^<]*)<\/b>/)[1]), ['Call', 'Reply', 'Duration constraint', 'Time constraint', 'States']);
  assert.equal(describe(m, 'charge'), ['One charge: a timing diagram of 2 lifelines, 8 changes, 2 messages and 2 constraints, in ms.',
    'worker : OrderWorker: Idle from 0 ms; Waiting for payment from 100 ms; Recording payment from 760 ms; Idle from 900 ms.',
    'payments : PaymentProvider: Idle from 0 ms; Authorising from 140 ms; Capturing from 480 ms; Idle from 720 ms.',
    'Call charge(total) from worker at 100 ms to payments at 140 ms.', 'Reply paid from payments at 720 ms to worker at 760 ms.',
    'Duration constraint {<= 800 ms} on worker from 100 ms to 760 ms.', 'Time constraint {<= 1000 ms} on worker at 900 ms.'].join('\n'));
});

test('the values form (present.<id>.as "values"): a band crossed at each change, its value inside, no state rows; messages end on its middle', () => {
  const m = EX(); V(m).present = { payments: { as: 'values' } };
  const g = layout(m, 'charge'), band = g.tr.bands.find(b => b.lane === 'payments');
  assert.deepEqual(validate(m), []); assert.deepEqual(unclean(g, m), []);
  assert.deepEqual(band.segs.map(s => s.text), ['Idle', 'Authorising', 'Capturing', 'Idle']);
  assert.ok(!g.nodes.some(n => n.id.startsWith('payments->')) && g.tr.steps.every(s => s.lane !== 'payments'));
  assert.equal(g.byId.payments.aria, 'Value lifeline payments : PaymentProvider, 4 changes');
  assert.ok(g.legend.some(l => /<b>Values<\/b>/.test(l)));
  assert.match(describe(m, 'charge'), /^payments : PaymentProvider \(values\): Idle from 0 ms;/m);
  assert.match(mapContext(m).buildView('charge').markup, /class="tm-band"[^>]*\/><text[^>]*class="tm-value"[^>]*>Authorising</);
  // a state no list holds is fine there: a value lifeline's states are any text
  const n = apply(m, [{ op: 'set', id: 'p-capturing', path: 'state', value: '42' }]);
  assert.deepEqual(rules(n), []);
});

test('validators: the example breaks no rule; each rule fails on a model that breaks it, naming its rule, its elements and its level', () => {
  assert.deepEqual(rules(EX()), []);
  const bad = (f, want) => { const m = EX(); f(m); assert.deepEqual(rules(m), want); assert.ok(validate(m).some(p => p.rule === want[0][1])); };
  bad(m => { ch(m, 'w-done').lifeline = 'ghost'; }, [['error', 'change-lifeline', ['w-done']]]);
  bad(m => { ch(m, 'w-done').at = '900'; }, [['error', 'change-time', ['w-done']]]);
  bad(m => { msg(m, 'm-charge').props.sentAt = null; }, [['error', 'change-time', ['m-charge']]]);
  bad(m => { ch(m, 'w-done').state = 'Asleep'; }, [['warning', 'change-state', ['w-done', 'worker']]]);
  bad(m => { ch(m, 'w-done').at = 760; }, [['warning', 'change-instant', ['w-recording', 'w-done']]]);
  bad(m => { msg(m, 'm-charge').to = 'nobody'; }, [['error', 'message-ends', ['m-charge', 'nobody']], ['error', 'reply-call', ['m-paid', 'm-charge']]]);
  bad(m => { msg(m, 'm-paid').props.receivedAt = 700; }, [['error', 'message-times', ['m-paid']]]);
  bad(m => { msg(m, 'm-charge').props.sort = 'create'; }, [['warning', 'sort', ['m-charge']]]); // drawn as a call, so m-paid still answers a call
  bad(m => { msg(m, 'm-paid').props.replyTo = 'nothing'; }, [['error', 'reply-call', ['m-paid']]]);
  bad(m => { TL(m).constraints[0].to = 'ghost'; }, [['error', 'constraint-ends', ['c-wait']]]);
  bad(m => { TL(m).constraints[1].to = 'w-idle'; }, [['error', 'constraint-ends', ['c-finished']]]);
  bad(m => { TL(m).constraints[1].type = 'uml.Constraint'; }, [['error', 'constraint-ends', ['c-finished']]]);
  bad(m => { Object.assign(TL(m).constraints[0], { from: 'w-recording', to: 'w-waiting' }); }, [['warning', 'constraint-order', ['c-wait', 'w-recording', 'w-waiting']]]);
  // a hidden lifeline keeps its changes, not drawn and not warned (§7.2)
  const h = apply(EX(), { op: 'hide', id: 'payments', view: 'charge' });
  assert.deepEqual(rules(h), []); assert.equal(TL(h).changes.length, 8);
  assert.ok(!layout(h, 'charge').nodes.some(n => n.id.startsWith('p-')));
});

test('F2\'s micro-syntax (§8.1): `text`, `text @ t`, `text @ t1 → t2` (or ->) parse and print back; text with an @ that is no time stays text', () => {
  for (const [text, times] of [['Idle', []], ['Waiting for payment', [100]], ['charge(total)', [100, 140]], ['', [720, 760]], ['a b', [-2.5, 1e3]]]) {
    const s = tmPrint(text, ...times); assert.deepEqual(tmParse(s), { text, times }, s);
  }
  assert.deepEqual(tmParse(' paid@720->760 '), { text: 'paid', times: [720, 760] });
  assert.deepEqual(tmParse('mail me@home'), { text: 'mail me@home', times: [] });
  assert.deepEqual(tmParse('x @ 1 → 2 → 3'), { text: 'x @ 1 → 2 → 3', times: [] });
  assert.deepEqual(tmParse('x @ '), { text: 'x @', times: [] });
  const g = layout(EX(), 'charge');
  assert.equal(g.byId['w-waiting'].label, 'Waiting for payment @ 100', 'F2 opens on a change with its printed form');
  assert.equal(g.edges[0].label, 'charge(total) @ 100 → 140', 'and on a message with its');
});

test('rename (F2): a change, a message, a constraint, a lifeline with `name : Type`, a state\'s row with its changes, the ruler\'s unit', () => {
  const m = EX(), V0 = V(m);
  let n = run(m, tmRename(m, V0, 'w-waiting', 'Waiting for payment @ 120'));
  assert.deepEqual([ch(n, 'w-waiting').state, ch(n, 'w-waiting').at], ['Waiting for payment', 120]);
  const r = tmRename(m, V0, 'w-waiting', 'Polling @ 100');
  assert.match(r.say, /added state Polling to worker/); n = run(m, r);
  assert.deepEqual([ch(n, 'w-waiting').state, n.nodes[0].props.states.at(-1)], ['Polling', 'Polling']);
  assert.ok(tmRename(m, V0, 'w-waiting', 'X @ 1 → 2').error && tmRename(m, V0, 'w-waiting', '@ 5').error);
  n = run(m, tmRename(m, V0, 'm-charge', 'charge(sum) @ 110 -> 150'));
  assert.deepEqual([msg(n, 'm-charge').label, msg(n, 'm-charge').props.sentAt, msg(n, 'm-charge').props.receivedAt], ['charge(sum)', 110, 150]);
  n = run(m, tmRename(m, V0, 'm-charge', 'ping @ 130'));
  assert.deepEqual([msg(n, 'm-charge').props.sentAt, msg(n, 'm-charge').props.receivedAt], [130, 130]);
  n = run(m, tmRename(m, V0, 'm-charge', 'charge'));
  assert.deepEqual(msg(n, 'm-charge').props, msg(m, 'm-charge').props, 'a label alone keeps the times');
  assert.match(tmRename(m, V0, 'm-paid', 'paid @ 720 → 700').error, /message-times/);
  n = run(m, tmRename(m, V0, 'c-wait', '{<= 1 s}')); assert.equal(TL(n).constraints[0].label, '{<= 1 s}');
  n = run(m, tmRename(m, V0, 'worker', 'fulfiller : Worker'));
  assert.deepEqual([n.nodes[0].label, n.nodes[0].props.represents], ['fulfiller', 'Worker']);
  n = run(m, tmRename(m, V0, 'worker', 'fulfiller')); assert.equal(n.nodes[0].props.represents, 'OrderWorker');
  n = run(m, tmRename(m, V0, tmRowId('worker', 'Idle'), 'Ready'));
  assert.deepEqual(n.nodes[0].props.states, ['Ready', 'Waiting for payment', 'Recording payment']);
  assert.deepEqual(TL(n).changes.filter(c => c.lifeline === 'worker').map(c => c.state), ['Ready', 'Waiting for payment', 'Recording payment', 'Ready']);
  assert.equal(ch(n, 'p-idle').state, 'Idle', 'another lifeline\'s state of that name stays');
  assert.ok(tmRename(m, V0, tmRowId('worker', 'Idle'), 'Recording payment').error);
  n = run(m, tmRename(m, V0, TM_RULER, 's')); assert.equal(TL(n).unit, 's');
  n = run(m, tmRename(m, V0, TM_RULER, '')); assert.ok(!('unit' in TL(n)));
});

test('add: a lifeline; a change a minor tick after the one selected, on a selected lifeline at the first free minor tick from the ruler\'s start (a new state added, said), at a slot; a time constraint; each new id unused', () => {
  const m = EX(), V0 = V(m);
  let n = run(m, tmAdd(m, V0, ENTRY('uml.Lifeline'), 'bank : Bank', null));
  assert.deepEqual([n.nodes[2], V(n).nodeIds.at(-1)], [{ id: 'bank1', type: 'uml.Lifeline', label: 'bank', props: { represents: 'Bank' } }, 'bank1']);
  n = run(m, tmAdd(m, V0, ENTRY('uml.StateInvariant'), 'Recording payment', { sel: ['w-waiting'] }));
  assert.deepEqual(TL(n).changes.at(-1), { id: 'change1', lifeline: 'worker', at: 120, state: 'Recording payment' }, 'the next minor tick (a fifth of 200) after 100');
  const r = tmAdd(m, V0, ENTRY('uml.StateInvariant'), 'Retrying', { sel: ['payments'] });
  assert.match(r.say, /added state Retrying to payments/); n = run(m, r);
  assert.deepEqual([TL(n).changes.at(-1).at, TL(n).changes.at(-1).lifeline, n.nodes[1].props.states.at(-1)], [40, 'payments', 'Retrying']); // p-idle holds 0: the first free minor tick
  n = run(m, tmAdd(m, V0, ENTRY('uml.StateInvariant'), 'Idle', { parent: 'worker', t: 960, index: 4, sel: [] }));
  assert.deepEqual(TL(n).changes.at(-1), { id: 'change1', lifeline: 'worker', at: 960, state: 'Idle' });
  assert.ok(tmAdd(m, V0, ENTRY('uml.StateInvariant'), 'Idle', { sel: [] }).error && tmAdd(m, V0, ENTRY('uml.StateInvariant'), '', { sel: ['worker'] }).error);
  n = run(m, tmAdd(m, V0, ENTRY('uml.TimeConstraint'), '{t <= 200 ms}', { sel: ['w-waiting'] }));
  assert.deepEqual(TL(n).constraints.at(-1), { id: 'time1', type: 'uml.TimeConstraint', from: 'w-waiting', label: '{t <= 200 ms}' });
  assert.ok(tmAdd(m, V0, ENTRY('uml.TimeConstraint'), 'x', { sel: ['worker'] }).error);
  // the id is free in the whole model: a member, a node, a time item and a message already hold change1 to change4
  const busy = EX(); busy.nodes[0].members = [{ id: 'change1', type: 'uml.Property' }]; busy.nodes.push({ id: 'change2', type: 'uml.Class' });
  TL(busy).changes[0].id = 'change3'; V(busy).edges[1].id = 'change4'; V(busy).edges[1].props.replyTo = 'm-charge';
  n = run(busy, tmAdd(busy, V(busy), ENTRY('uml.StateInvariant'), 'Idle', { sel: ['worker'] }));
  assert.equal(TL(n).changes.at(-1).id, 'change5');
  assert.equal(tmAdd(m, V0, { type: 'uml.Comment' }, 'x', null), null, 'any other entry: the default');
});

test('connect: lifeline to lifeline at the slot\'s time; change to change across their times; a reply answers the call back; a duration constraint in time order; refusals said', () => {
  const m = EX(), V0 = V(m);
  let n = run(m, tmConnect(m, V0, 'worker', 'payments', { parent: 'payments', t: 200 }, LINE('async')));
  assert.deepEqual(V(n).edges.at(-1), { id: 'm1', type: 'uml.Message', from: 'worker', to: 'payments', props: { sort: 'async', sentAt: 200, receivedAt: 200 } });
  n = run(m, tmConnect(m, V0, 'w-waiting', 'p-authorising', null, LINE('call')));
  assert.deepEqual(V(n).edges.at(-1).props, { sort: 'call', sentAt: 100, receivedAt: 140 });
  n = run(m, tmConnect(m, V0, 'p-capturing', 'w-recording', null, LINE('reply')));
  assert.deepEqual(V(n).edges.at(-1).props, { sort: 'reply', sentAt: 480, receivedAt: 760, replyTo: 'm-charge' });
  n = run(m, tmConnect(m, V0, 'p-done', 'w-waiting', null, DUR()));
  assert.deepEqual(TL(n).constraints.at(-1), { id: 'duration1', type: 'uml.DurationConstraint', from: 'w-waiting', to: 'p-done' }, 'in time order, across two lanes');
  assert.ok(tmConnect(m, V0, 'worker', 'payments', null, DUR()).error);
  assert.match(tmConnect(m, V0, 'w-recording', 'p-authorising', null, LINE('call')).error, /message-times/);
  assert.match(tmConnect(m, V0, 'p-idle', 'worker', null, LINE('reply')).error, /reply-call/);
  assert.ok(tmConnect(m, V0, TM_RULER, 'worker', null, LINE('call')).error);
});

test('moveTo: a change dropped at a slot\'s time or by Alt + ←/→ a minor tick, Alt + ↑/↓ a state; a message both times; a lifeline its place; else null', () => {
  const m = EX(), V0 = V(m);
  assert.equal(ch(run(m, tmMoveTo(m, V0, 'w-waiting', { parent: 'worker', t: 160, x: 1, y: 1 })), 'w-waiting').at, 160);
  assert.equal(ch(run(m, tmMoveTo(m, V0, 'w-waiting', { by: [1, 0] })), 'w-waiting').at, 120);
  assert.equal(ch(run(m, tmMoveTo(m, V0, 'w-waiting', { by: [-1, 0] })), 'w-waiting').at, 80);
  assert.equal(ch(run(m, tmMoveTo(m, V0, 'p-authorising', { by: [-1, 0] })), 'p-authorising').at, 120, 'off the grid: to the tick before');
  assert.equal(ch(run(m, tmMoveTo(m, V0, 'w-waiting', { by: [0, 1] })), 'w-waiting').state, 'Recording payment');
  assert.equal(ch(run(m, tmMoveTo(m, V0, 'w-waiting', { by: [0, -1] })), 'w-waiting').state, 'Idle');
  assert.deepEqual(tmMoveTo(m, V0, 'w-idle', { by: [0, -1] }), [], 'no state above the first');
  let n = run(m, tmMoveTo(m, V0, 'm-charge', { parent: 'worker', t: 300 }));
  assert.deepEqual([msg(n, 'm-charge').props.sentAt, msg(n, 'm-charge').props.receivedAt], [300, 340]);
  n = run(m, tmMoveTo(m, V0, 'm-charge', { by: [1, 0] }));
  assert.deepEqual([msg(n, 'm-charge').props.sentAt, msg(n, 'm-charge').props.receivedAt], [140, 180]);
  assert.deepEqual(V(run(m, tmMoveTo(m, V0, 'payments', { by: [0, -1] }))).nodeIds, ['payments', 'worker']);
  assert.deepEqual(tmMoveTo(m, V0, 'worker', { by: [0, -1] }), []);
  assert.equal(tmMoveTo(m, V0, 'worker', { by: [1, 0] }), null);
  assert.equal(tmMoveTo(m, V0, 'c-wait', { by: [1, 0] }), null);
});

test('remove (S17): a change, a message or a constraint is deleted, said; Delete hides a lifeline, its messages go with it and its changes stay, said with the count; Shift + Delete deletes it with its changes', () => {
  const m = EX(), V0 = V(m);
  for (const id of ['w-waiting', 'm-paid', 'c-finished']) for (const fromModel of [false, true]) {
    const r = tmRemove(m, V0, [id], fromModel); assert.deepEqual(r.commands, [{ op: 'delete', id }]); assert.match(r.say, /deleted, not hidden/); run(m, r); }
  let r = tmRemove(m, V0, ['worker'], false);
  assert.deepEqual(r.commands, [{ op: 'hide', id: 'worker', view: 'charge' }]);
  assert.equal(r.say, 'Hid worker; deleted its 2 messages; its changes stay in the timeline');
  let n = run(m, r);
  assert.deepEqual([V(n).nodeIds, V(n).edges, TL(n)], [['payments'], [], TL(m)]);
  r = tmRemove(m, V0, ['worker'], true); assert.equal(r.say, 'Deleted worker, 4 changes, 2 messages and 2 constraints');
  n = run(m, r);
  assert.deepEqual([TL(n).changes.map(c => c.lifeline), TL(n).constraints], [Array(4).fill('payments'), []]);
  assert.ok(tmRemove(m, V0, [tmRowId('worker', 'Idle')], false).error && tmRemove(m, V0, [TM_RULER], true).error);
});

test('the review of 6.5: a change never lands unseen on another\'s instant; an unlisted state\'s row is the lowest; a state listed twice is one row; a reply to a call with no sort; lanes are lifelines only; the hint line counts the cascade; rows as drawn; decimal times; name : Type read one way; the ruler named by its times', () => {
  const m = EX(), V0 = V(m);
  // a change added on a lifeline goes at the first free minor tick from the ruler's start (p-idle holds 0)
  let n = run(m, tmAdd(m, V0, ENTRY('uml.StateInvariant'), 'Capturing', { sel: ['payments'] }));
  assert.deepEqual(TL(n).changes.at(-1), { id: 'change1', lifeline: 'payments', at: 40, state: 'Capturing' });
  assert.ok(layout(n, 'charge').byId.change1, 'drawn'); assert.deepEqual(rules(n), []);
  // dropped, stepped or typed onto another change's instant: refused, said
  for (const r of [tmMoveTo(m, V0, 'w-waiting', { t: 0 }), tmRename(m, V0, 'w-waiting', 'Waiting for payment @ 760')]) assert.match(r.error, /^change-instant/);
  // Alt + Up/Down on a change in an unlisted state: its row is below the listed ones
  const u = apply(EX(), [{ op: 'set', id: 'w-waiting', path: 'state', value: 'Zzz' }]);
  assert.deepEqual(tmMoveTo(u, V(u), 'w-waiting', { by: [0, 1] }), []);
  assert.equal(ch(run(u, tmMoveTo(u, V(u), 'w-waiting', { by: [0, -1] })), 'w-waiting').state, 'Recording payment');
  // a message: Alt + Up/Down is used up
  assert.deepEqual(tmMoveTo(m, V0, 'm-charge', { by: [0, 1] }), []);
  // a state listed twice is one row
  const d = apply(EX(), [{ op: 'set', id: 'worker', path: 'props.states', value: ['Idle', 'Idle', 'Waiting for payment', 'Recording payment'] }]);
  const ids = layout(d, 'charge').nodes.map(x => x.id); assert.equal(ids.length, new Set(ids).size);
  // a reply connected to a call with no sort (drawn as a call) is accepted
  const ns = EX(); delete msg(ns, 'm-charge').props.sort;
  const rp = cmdsOf(tmConnect(ns, V(ns), 'payments', 'worker', { t: 800 }, { type: 'uml.Message', props: { sort: 'reply' } }));
  assert.ok(Array.isArray(rp), JSON.stringify(rp)); assert.equal(rp[0].element.props.replyTo, 'm-charge');
  // a node that is no lifeline in nodeIds is no lane
  const cm = EX(); cm.nodes.push({ id: 'note', type: 'uml.Comment', label: 'note' }); V(cm).nodeIds.push('note');
  assert.ok(!layout(cm, 'charge').byId.note);
  // the hint line counts what the cascade takes
  assert.equal(tmRemove(m, V0, ['m-charge'], false).say, 'Deleted 2 messages: a change, a message or a constraint is deleted, not hidden');
  assert.equal(tmRemove(m, V0, ['w-waiting'], false).say, 'Deleted 1 change and 1 constraint: a change, a message or a constraint is deleted, not hidden');
  assert.equal(tmRemove(m, V0, ['worker', 'p-idle'], false).say, 'Hid worker; deleted its 2 messages, and 1 change; its changes stay in the timeline');
  // the PDF's rows leave out a constraint on a hidden lifeline's change, as describe() does
  const hc = EX(); TL(hc).constraints.push({ id: 'x', type: 'uml.DurationConstraint', from: 'w-waiting', to: 'p-capturing' });
  const hh = apply(hc, { op: 'hide', id: 'payments', view: 'charge' });
  assert.ok(!TM_TYPE.rows(hh, V(hh), 'worker').some(t => /payments/.test(t)));
  // times are decimal numbers
  for (const t of ['a @ 0x10', 'a @ 0b11', 'a @ 0o7', 'a @ Infinity']) assert.deepEqual(tmParse(t).times, [], t);
  assert.deepEqual(tmParse('a @ -.5e2').times, [-50]);
  // name : Type: add and F2 read `a : B : C` the same
  assert.equal(cmdsOf(tmAdd(m, V0, ENTRY('uml.Lifeline'), 'a : B : C', {}))[0].element.props.represents, 'B:C');
  assert.equal(cmdsOf(tmRename(m, V0, 'worker', 'a : B : C'))[1].value, 'B:C');
  // the ruler is named by the span of the times, not the room after
  const late = apply(EX(), [{ op: 'set', id: 'w-done', path: 'at', value: 913 }]);
  assert.match(layout(late, 'charge').byId[TM_RULER].aria, /^Time ruler, 0 to 913 ms/);
});

test('key: S on a lifeline turns its values form on and off; any other key, or S on what is not a lifeline, is the canvas\'s', () => {
  const m = EX(), V0 = V(m), on = tmKeyHook(m, V0, ['payments'], 'S');
  assert.deepEqual(on, [{ op: 'set', view: 'charge', path: ['present', 'payments', 'as'], value: 'values' }]);
  const n = run(m, on); assert.equal(V(n).present.payments.as, 'values');
  assert.deepEqual(V(run(n, tmKeyHook(n, V(n), ['payments'], 's'))).present, { payments: {} });
  for (const k of ['F2', 'Delete', 'ArrowUp', 'Enter', 'x']) assert.equal(tmKeyHook(m, V0, ['payments'], k), null, k);
  assert.equal(tmKeyHook(m, V0, ['w-waiting'], 'S'), null);
});

/* ---- a 30-step session through the hooks (DoD 6) ---- */
const S = (f, ...a) => m => f(m, V(m), ...a);
const STEPS = [
  S(tmAdd, ENTRY('uml.Lifeline'), 'bank : Bank', null),
  S(tmAdd, ENTRY('uml.StateInvariant'), 'Open', { sel: ['bank1'] }),
  S(tmAdd, ENTRY('uml.StateInvariant'), 'Closed', { sel: ['change1'] }),
  S(tmMoveTo, 'change2', { by: [1, 0] }),
  S(tmConnect, 'change2', 'p-capturing', null, LINE('async')),
  S(tmRename, 'm1', 'settle @ 480 → 500'),
  S(tmKeyHook, ['bank1'], 'S'),
  S(tmAdd, ENTRY('uml.TimeConstraint'), '{t <= 600}', { sel: ['change2'] }),
  S(tmConnect, 'change1', 'change2', null, DUR()),
  S(tmRename, 'duration1', '{<= 100}'),
  S(tmRename, tmRowId('worker', 'Idle'), 'Ready'),
  S(tmMoveTo, 'w-waiting', { parent: 'worker', t: 120 }),
  S(tmMoveTo, 'm-charge', { by: [-1, 0] }),
  S(tmMoveTo, 'payments', { by: [0, 1] }),
  S(tmRename, TM_RULER, 'milliseconds'),
  S(tmRename, 'c-wait', '{<= 900 ms}'),
  S(tmRemove, ['c-finished'], false),
  S(tmAdd, ENTRY('uml.StateInvariant'), 'Retrying', { sel: ['p-capturing'] }),
  S(tmMoveTo, 'change3', { by: [0, -1] }),
  S(tmKeyHook, ['bank1'], 'S'),
  S(tmRename, 'payments', 'payments : Psp'),
  S(tmConnect, 'worker', 'bank1', { parent: 'bank1', t: 800 }, LINE('call')),
  S(tmConnect, 'bank1', 'worker', { parent: 'worker', t: 840 }, LINE('reply')),
  S(tmRemove, ['m2'], true),
  S(tmMoveTo, 'w-done', { by: [1, 0] }),
  S(tmRename, 'w-done', 'Ready @ 1000'),
  m => [{ op: 'set', view: 'charge', path: 'title', value: 'One charge, edited' }],
  S(tmRemove, ['bank1'], false),
  S(tmMoveTo, 'payments', { by: [0, -1] }),
  S(tmRemove, ['worker'], true),
];
test('a 30-step session through the hooks: each step a transaction that adds no error; undone, redone and reopened, byte-identical', () => {
  assert.equal(STEPS.length, 30);
  const h = history(EX()), seen = [JSON.stringify(h.model)];
  STEPS.forEach((step, k) => { const c = cmdsOf(step(h.model)); assert.ok(Array.isArray(c) && c.length, `step ${k + 1}: ${JSON.stringify(c)}`);
    h.push(run(h.model, c)); seen.push(JSON.stringify(h.model)); });
  const end = seen[30];
  for (let k = 29; k >= 0; k--) assert.equal(JSON.stringify(h.undo()), seen[k], `undo to ${k}`);
  for (let k = 1; k <= 30; k++) assert.equal(JSON.stringify(h.redo()), seen[k], `redo to ${k}`);
  let m = JSON.parse(seen[15]);
  STEPS.slice(15).forEach(step => { m = apply(m, cmdsOf(step(m))); });
  assert.equal(JSON.stringify(m), end);
  assert.deepEqual([V(m).nodeIds, TL(m).changes.some(c => c.lifeline === 'worker'), TL(m).unit], [['payments'], false, 'milliseconds']);
  assert.deepEqual(unclean(layout(m, 'charge'), m), []);
});

test('the PDF\'s tables (§9): a lifeline\'s changes in time order, the messages it sends and the constraints on its changes', () => {
  const m = EX(), ctx = mapContext(m), [els, lines] = tablesOf(ctx, ctx.V.charge, ctx.buildGeo('charge')), row = els.rows.find(r => r.includes('<b>worker</b>'));
  assert.deepEqual(TM_TYPE.rows(m, 'charge', 'worker'), ['0 ms: Idle', '100 ms: Waiting for payment', '760 ms: Recording payment', '900 ms: Idle', 'charge(total) to payments at 100 ms → 140 ms',
    'Duration constraint {<= 800 ms} on worker from 100 ms to 760 ms', 'Time constraint {<= 1000 ms} on worker at 900 ms']);
  assert.match(row, /<td>Lifeline<\/td>/); assert.match(row, /<p>760 ms: Recording payment<\/p>/);
  assert.equal(lines.rows.length, 2);
  assert.equal(TM_TYPE.rows(m, 'charge', 'w-idle'), null);
});

test('the sequence type ignores a lifeline\'s states: its panel lists no states field and its describe() reads the same (§14)', () => {
  const T = diagramOf({ diagram: 'uml.sequence' }), seq = st => ({ schemaVersion: 2, nodes: ['A', 'B'].map(id => ({ id, type: 'uml.Lifeline', label: id, props: { represents: 'R', ...(st ? { states: ['Idle', 'Busy'] } : {}) } })), edges: [],
    views: [{ id: 's', diagram: 'uml.sequence', nodeIds: ['A', 'B'], edges: [{ id: 'm', type: 'uml.Message', from: 'A', to: 'B', label: 'go', props: { sort: 'call' } }] }] });
  assert.ok(!T.props['uml.Lifeline'].some(f => f.key === 'states'));
  assert.equal(sqDescribe(seq(true), 's'), sqDescribe(seq(false), 's'));
  assert.deepEqual(validate(seq(true)), validate(seq(false)));
});

/* ---- P1 (§12): the timing stress view's size, 12 lifelines, 400 changes, 100 messages, 40 constraints ---- */
function stress() {
  const L = Array.from({ length: 12 }, (_, i) => `L${i}`), states = ['Idle', 'Busy', 'Waiting', 'Done'], changes = [], edges = [], cons = [];
  L.forEach((l, i) => { for (let k = 0; k < (i < 4 ? 34 : 33); k++) changes.push({ id: `${l}-c${k}`, lifeline: l, at: k * 30 + i, state: states[k % 4] }); });
  for (let k = 0; k < 100; k++) { const a = L[k % 12], b = L[(k * 5 + 1) % 12] === a ? L[(k + 1) % 12] : L[(k * 5 + 1) % 12];
    edges.push({ id: `m${k}`, type: 'uml.Message', from: a, to: b, label: `msg${k}`, props: { sort: k % 3 ? 'async' : 'call', sentAt: 10 * k, receivedAt: 10 * k + 7 } }); }
  for (let k = 0; k < 40; k++) { const l = L[k % 12], a = `${l}-c${k % 30}`, b = `${l}-c${k % 30 + 2}`;
    cons.push(k % 4 ? { id: `d${k}`, type: 'uml.DurationConstraint', from: a, to: b, label: `{<= ${k}}` } : { id: `t${k}`, type: 'uml.TimeConstraint', from: a, label: `{t${k}}` }); }
  return { schemaVersion: 2, nodes: L.map(id => ({ id, type: 'uml.Lifeline', label: id, props: { represents: 'Service', states } })), edges: [],
    views: [{ id: 'all', diagram: 'uml.timing', nodeIds: L, edges, timeline: { unit: 'ms', changes, constraints: cons } }] };
}
const cpu = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
test('P1 (§12): 12 lifelines, 400 changes, 100 messages, 40 constraints: a full layout with markup, a change moved one tick, a message renamed and a state added, laid out and drawn, each under 1 s in CI, printed against the 100 ms target (CPU, best of seven after a warm-up) (timed)', () => {
  const M = stress(), draw = m => mapContext(m).buildView('all').markup;
  assert.deepEqual([TL(M).changes.length, V(M).edges.length, TL(M).constraints.length], [400, 100, 40]);
  assert.deepEqual(errors(M), []);
  const edits = { move: m => cmdsOf(tmMoveTo(m, V(m), 'L3-c5', { by: [1, 0] })), rename: m => cmdsOf(tmRename(m, V(m), 'm7', 'renamed')), state: m => cmdsOf(tmAdd(m, V(m), ENTRY('uml.StateInvariant'), 'Fresh', { sel: ['L5-c9'] })) };
  draw(M); Object.values(edits).forEach(e => draw(apply(M, e(M)))); // the warm-up
  const best = f => Math.min(...Array.from({ length: 7 }, () => cpu(f)));
  const t = { full: best(() => draw(M)), ...Object.fromEntries(Object.entries(edits).map(([k, e]) => [k, best(() => draw(apply(M, e(M))))])) };
  for (const [k, v] of Object.entries(t)) assert.ok(v < 1000, `${k} ${v} ms`);
  console.log(`# P1 timing (target 100 ms): a change moved ${t.move.toFixed(1)} ms, a message renamed ${t.rename.toFixed(1)} ms, a state added ${t.state.toFixed(1)} ms; full layout and markup ${t.full.toFixed(1)} ms`);
});

test('the type ships in lib/umlimator-all.js only (risks.md C5)', () => {
  const all = readFileSync(new URL('../lib/umlimator-all.js', import.meta.url), 'utf8'), core = readFileSync(new URL('../lib/umlimator.js', import.meta.url), 'utf8');
  for (const k of ["registerDiagramType('uml.timing'", 'function tmRun(', "SHAPE['tm-lane'] = "]) { assert.ok(all.includes(k), k); assert.ok(!core.includes(k), k); }
});
