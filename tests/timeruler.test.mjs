// The time ruler (work package 6.4, notes/stage-6.md §6): layoutTimeRuler alone, on hand-built inputs (sizes as the type
// would measure them: a name 16 px high, text 6 px a character). The timing type (6.5) and its pages draw what it returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TR, layoutTimeRuler } from '../src/layout/timeruler.js';

const W = s => String(s).length * 6;
// a lane: [id, form, states, changes as [id, at, state]]
const lane = (id, form, states, changes) => ({ id, name: { w: W(id), h: 16 }, form, rows: form === 'values' ? [] : states.map(s => ({ state: s, w: W(s) })),
  changes: changes.map(([cid, at, state]) => ({ id: cid, at, state, w: W(state) })) });
const msg = (id, from, to, sentAt, receivedAt, label = id) => ({ id, from, to, sentAt, receivedAt, w: W(label), h: 16 });
const dur = (id, from, to, label = id) => ({ id, kind: 'duration', from, to, w: W(label), h: 16 });
const tim = (id, from, label = id) => ({ id, kind: 'time', from, w: W(label), h: 16 });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segBoxes = pts => pts.slice(1).map((q, i) => { const p = pts[i]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) }; });
const within = (b, B, k = .5) => b.x >= B.x - k && b.y >= B.y - k && b.x + b.w <= B.x + B.w + k && b.y + b.h <= B.y + B.h + k;

// the drawn changes of a lane: by time, the id that sorts last at one instant
const drawn = l => { const s = [...l.changes].filter(c => Number.isFinite(c.at)).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  return s.filter((c, i) => !(s[i + 1] && s[i + 1].at === c.at)); };
// a lane's level at t, worked out again from the input and the lane's rows: §6.5
const levelAt = (inp, o, id, t) => { const l = inp.lanes.find(x => x.id === id), L = o.lanes.find(x => x.id === id), mid = L.y + L.h / 2;
  const c = drawn(l).filter(x => x.at <= t).pop(); if (!c) return mid; return l.form === 'values' ? mid : L.rows.find(r => r.state === c.state).y; };

// §11's timing predicate: no step or band text outside its lane, no label over a step (or a value, or another label) unless
// timing-label says it, every message's ends on its lanes' levels within 1 px; marks in their strips; all in the bounds
function timingClean(o, inp) {
  const bad = [], lab = new Set(o.problems.filter(p => p.rule === 'timing-label').flatMap(p => p.ids)), lane = id => o.lanes.find(l => l.id === id);
  const plot = L => ({ x: o.ruler.x0, y: L.y, w: o.ruler.x1 - o.ruler.x0, h: L.h });
  o.steps.forEach(s => segBoxes(s.pts).forEach(b => { if (!within(b, plot(lane(s.lane)))) bad.push(`step of ${s.lane} out of its lane`); }));
  const texts = o.bands.flatMap(b => { const L = lane(b.lane), mid = L.y + L.h / 2, l = inp.lanes.find(x => x.id === b.lane);
    return b.segs.filter(s => s.text != null).map(s => { const c = drawn(l).find(c => c.state === s.text) || { w: 0 }, w = Math.min(TR.cut, c.w, s.x1 - s.x0 - TR.room);
      const box = { x: (s.x0 + s.x1 - w) / 2, y: mid - 7, w, h: 14 };
      if (!within(box, plot(L)) || !within(box, { x: s.x0, y: L.y, w: s.x1 - s.x0, h: L.h })) bad.push(`value ${s.text} out of its segment`); return box; }); });
  const steps = o.steps.flatMap(s => segBoxes(s.pts));
  o.lines.forEach((l, i) => { if (lab.has(l.id)) return;
    if (steps.some(b => meets(l.lbl, b))) bad.push(`label ${l.id} over a step`);
    if (texts.some(b => meets(l.lbl, b))) bad.push(`label ${l.id} over a value`);
    o.lines.slice(0, i).forEach(m => { if (meets(l.lbl, m.lbl)) bad.push(`label ${l.id} meets label ${m.id}`); });
    o.marks.forEach(m => { if (meets(l.lbl, m.lbl)) bad.push(`label ${l.id} meets constraint ${m.id}`); }); });
  o.lines.forEach(l => { const m = inp.messages.find(x => x.id === l.id), [p, q] = l.pts;
    if (Math.abs(p[1] - levelAt(inp, o, m.from, m.sentAt)) > 1) bad.push(`${l.id} starts off ${m.from}'s level`);
    if (Math.abs(q[1] - levelAt(inp, o, m.to, m.receivedAt)) > 1) bad.push(`${l.id} ends off ${m.to}'s level`); });
  o.marks.forEach(m => { const ys = m.pts.map(p => p[1]), dim = m.kind === 'duration' ? ys[1] : (ys[0] + ys[1]) / 2;
    if (!o.lanes.some(L => dim >= L.strip.y && dim <= L.strip.y + L.strip.h)) bad.push(`constraint ${m.id} not in a strip`); });
  const B = o.bounds;
  [...o.lanes, ...o.lines.map(l => l.lbl), ...o.marks.map(m => m.lbl), ...o.changes].forEach(b => { if (!within(b, B)) bad.push(`out of bounds: ${JSON.stringify(b)}`); });
  return bad;
}

// §6.3's scale and ticks, checked on any output: one base, linear; the plot 480 to 4,800 px; the step 1, 2 or 5 × 10ⁿ, the
// least whose ticks are 64 px apart; minor ticks a fifth of it, from the first multiple at or after t0
function scaleOk(o) {
  const bad = [], { t0, t1, k, step } = o.scale, P = (t1 - t0) * k, near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  if (P < TR.plot - .01 || P > TR.max + .01) bad.push(`plot ${P}`);
  const m = step / 10 ** Math.floor(Math.log10(step) + 1e-9); if (![1, 2, 5].some(x => near(m, x))) bad.push(`step ${step} is not 1, 2 or 5 × 10ⁿ`);
  if (step * k < TR.tick - 1e-6) bad.push(`majors ${step * k} px apart`);
  const less = near(m, 1) ? step / 2 : near(m, 2) ? step / 2 : step / 2.5; if (less * k >= TR.tick) bad.push(`step ${less} would do`);
  if (!near(o.ruler.x0 + (t1 - t0) * k, o.ruler.x1)) bad.push('x1 is not x(t1)');
  const T = o.ruler.ticks; if (!T.length) bad.push('no ticks');
  if (T[0].t < t0 - 1e-9 || T[0].t - step / 5 >= t0 - 1e-9) bad.push(`first tick ${T[0].t}`);
  T.forEach((tk, i) => { if (Math.abs(tk.x - (o.ruler.x0 + (tk.t - t0) * k)) > .01) bad.push(`tick ${tk.t} off x(t)`);
    if (i && !near(tk.t - T[i - 1].t, step / 5)) bad.push(`ticks ${T[i - 1].t} to ${tk.t} not a fifth of the step`);
    const maj = near(Math.round(tk.t / step) * step, tk.t); if (tk.major !== maj || (tk.label == null) === maj) bad.push(`tick ${tk.t}: major ${tk.major}`); });
  return bad;
}

// the table: each case an input and what it asks of the scale
const S = ['Idle', 'Waiting for payment', 'Recording payment'];
const CASES = [
  { id: 'example', note: '14-timing.json: two lanes, a message each way, a duration and a time constraint; ms', step: 200, t0: 0, t1: 1100,
    inp: { unit: 'ms', lanes: [lane('worker', 'states', S, [['w0', 0, 'Idle'], ['w1', 100, 'Waiting for payment'], ['w2', 520, 'Recording payment'], ['w3', 1000, 'Idle']]),
      lane('payments', 'states', ['Idle', 'Charging'], [['p0', 0, 'Idle'], ['p1', 140, 'Charging'], ['p2', 480, 'Idle']])],
      messages: [msg('m1', 'worker', 'payments', 100, 140, 'charge(total)'), msg('m2', 'payments', 'worker', 480, 520, 'charged')],
      constraints: [dur('c-wait', 'w1', 'w2', '{<= 800 ms}'), tim('c-start', 'p1', '{t = 140}')] } },
  { id: 'gaps', note: 'changes 1 unit apart: 12 px a unit, over the 480 px floor', k: 12, step: 10,
    inp: { lanes: [lane('a', 'states', ['0', '1'], Array.from({ length: 61 }, (_, i) => [`a${i}`, i, String(i % 2)]))] } },
  { id: 'zero-gap', note: 'two changes at one instant on one lane are skipped, the id that sorts last drawn; the gap does not set k', k: 480 / 22.5, step: 5, t1: 22.5,
    inp: { lanes: [lane('a', 'states', ['x', 'y'], [['b', 10, 'x'], ['a', 10, 'y'], ['c', 20, 'y']])] } },
  { id: 'before-zero', note: 'a change before 0: t0 is its time', t0: -50,
    inp: { lanes: [lane('a', 'states', ['x', 'y'], [['a0', -50, 'x'], ['a1', 30, 'y']])] } },
  { id: 'values', note: 'a values lane: each text plus 12 px inside its segment sets k', k: (W('authorised') + TR.room) / 2,
    inp: { lanes: [lane('v', 'values', [], [['v0', 0, 'new'], ['v1', 10, 'authorised'], ['v2', 12, 'captured'], ['v3', 40, 'settled']])] } },
  { id: 'empty', note: 'no change and no message: one unit from 0, 480 px', t0: 0, t1: 1, step: .2,
    inp: { lanes: [lane('a', 'states', ['x'], [])] } },
  { id: 'dense', note: 'from 0 to 1,000,000 with changes 1 apart: capped at 4,800 px, timing-dense names them', dense: ['a1', 'a2', 'a3'],
    inp: { lanes: [lane('a', 'states', ['x', 'y'], [['a0', 0, 'x'], ['a1', 1, 'y'], ['a2', 2, 'x'], ['a3', 3, 'y'], ['a4', 1000000, 'x']])] } },
  { id: 'dense-values', note: 'capped: a value whose segment cannot hold it is cut and named', dense: ['v0', 'v1'],
    inp: { lanes: [lane('v', 'values', [], [['v0', 0, 'a long value here'], ['v1', 10, 'next'], ['v2', 1000000, 'end']])] } },
];

test('the scale and the step (§6.3) on a table of inputs: one linear base, 480 to 4,800 px, the least 1-2-5 step 64 px apart, minor ticks a fifth of it', () => {
  for (const c of CASES) {
    const o = layoutTimeRuler(c.inp), s = o.scale;
    assert.deepEqual(scaleOk(o), [], c.id);
    if (c.k != null) assert.ok(Math.abs(s.k - c.k) < 1e-9, `${c.id}: k ${s.k}, wanted ${c.k}`);
    for (const f of ['step', 't0', 't1']) if (c[f] != null) assert.equal(s[f], c[f], `${c.id}: ${f}`);
    assert.deepEqual(timingClean(o, c.inp), [], c.id);
    const dense = o.problems.filter(p => p.rule === 'timing-dense');
    assert.deepEqual(dense.flatMap(p => p.ids), c.dense || [], `${c.id}: timing-dense`);
    assert.ok(dense.length <= 1, `${c.id}: timing-dense is said once`);
    if (c.dense) assert.ok(Math.abs((s.t1 - s.t0) * s.k - TR.max) < .01, `${c.id}: at the cap`);
  }
  // a fifth of the step, majors labelled in the step's digits; the unit kept for the type to draw after the last label
  const o = layoutTimeRuler(CASES[0].inp);
  assert.deepEqual(o.ruler.ticks.filter(t => t.major).map(t => t.label), ['0', '200', '400', '600', '800', '1000']);
  assert.equal(o.ruler.unit, 'ms');
  assert.deepEqual(layoutTimeRuler(CASES.find(c => c.id === 'empty').inp).ruler.ticks.filter(t => t.major).map(t => t.label), ['0.0', '0.2', '0.4', '0.6', '0.8', '1.0']);
  assert.equal(layoutTimeRuler({ lanes: [] }).ruler.unit, null);
});

test('changes: 12 px apart (or timing-dense), a zero gap skipped, hit boxes 12 px wide and as tall as their step, levels before the first change at the lane\'s middle', () => {
  for (const c of CASES) { const o = layoutTimeRuler(c.inp), dense = new Set(o.problems.filter(p => p.rule === 'timing-dense').flatMap(p => p.ids));
    c.inp.lanes.forEach(l => { const d = drawn(l), X = d.map(x => o.changes.find(h => h.id === x.id).x);
      d.forEach((x, i) => { if (i && X[i] - X[i - 1] < TR.gap - .01 && !dense.has(x.id)) assert.fail(`${c.id}: ${x.id} ${X[i] - X[i - 1]} px after the one before, not reported`); }); }); }
  const z = layoutTimeRuler(CASES.find(c => c.id === 'zero-gap').inp);
  assert.deepEqual(z.changes.map(c => c.id), ['b', 'c'], 'of a and b at 10, b (the id that sorts last) is drawn');
  assert.deepEqual(z.steps[0].pts.map(p => p[1]), [28, 28, 52, 52], 'b in x (not a in y), then c in y');
  const e = layoutTimeRuler(CASES[0].inp), w1 = e.changes.find(c => c.id === 'w1'), w0 = e.changes.find(c => c.id === 'w0'), L = e.lanes[0];
  assert.equal(w1.w, TR.hit); assert.equal(w1.h, L.rows[1].y - L.rows[0].y, 'as tall as its step');
  assert.equal(w0.h, TR.hit, 'the first change: 12 px');
  assert.ok(Math.abs(w1.x + 6 - e.steps[0].pts[1][0]) < .01, 'centred on its upright');
  // nothing drawn before a lane's first change; a message there, or on a lane with no change, at the lane's middle
  const pre = { lanes: [lane('a', 'states', ['x', 'y', 'z'], [['a0', 50, 'x']]), lane('b', 'states', ['x'], [])],
    messages: [msg('m0', 'a', 'b', 10, 20), msg('m1', 'b', 'a', 60, 70)] };
  const p = layoutTimeRuler(pre), A = p.lanes[0], B = p.lanes[1];
  assert.equal(p.steps.length, 1, 'b has no step'); assert.equal(p.steps[0].pts[0][0], p.changes[0].x + 6, 'a\'s step starts at its first change');
  assert.deepEqual(p.lines[0].pts.map(q => q[1]), [A.y + A.h / 2, B.y + B.h / 2]);
  assert.deepEqual(p.lines[1].pts.map(q => q[1]), [B.y + B.h / 2, A.rows[0].y]);
  assert.deepEqual(timingClean(p, pre), []);
  // a state not in the lane's list: an extra row at the bottom
  const x = layoutTimeRuler({ lanes: [lane('a', 'states', ['x'], [['a0', 0, 'x'], ['a1', 5, 'gone']])] });
  assert.deepEqual(x.lanes[0].rows.map(r => r.state), ['x', 'gone']); assert.equal(x.lanes[0].h, 2 * TR.row);
});

test('values: inside their segments, a short segment without text, a text over 160 px cut, and cut and reported only at the cap', () => {
  const o = layoutTimeRuler(CASES.find(c => c.id === 'values').inp), segs = o.bands[0].segs;
  segs.forEach(s => { assert.equal(s.cut, false); assert.ok(s.x1 - s.x0 >= W(s.text) + TR.room - .01, `${s.text} fits`); });
  assert.equal(o.steps.length, 0); assert.equal(o.changes[0].h, TR.band);
  const long = 'x'.repeat(40), l = layoutTimeRuler({ lanes: [lane('v', 'values', [], [['a', 0, long], ['b', 1, 'b'], ['c', 1.5, 'c'], ['d', 100, 'd']])] }).bands[0].segs;
  assert.deepEqual(l.map(s => [s.text, s.cut]), [[long, true], ['b', false], ['c', false], ['d', false]], 'a 40-character value cut at 160 px, not reported');
  const d = layoutTimeRuler(CASES.find(c => c.id === 'dense-values').inp);
  assert.deepEqual(d.bands[0].segs.map(s => [s.text, s.cut]), [[null, true], ['next', false], ['end', false]], 'under 16 px no text');
  assert.ok(d.bands[0].segs[0].x1 - d.bands[0].segs[0].x0 < TR.bare);
});

test('constraints: durations on levels 20 px apart in the strip of their lower lane, a time constraint a tick, a lane with none no strip', () => {
  const inp = { lanes: [lane('a', 'states', ['x', 'y'], [['a0', 0, 'x'], ['a1', 100, 'y'], ['a2', 300, 'x'], ['a3', 500, 'y']]), lane('b', 'states', ['x'], [['b0', 200, 'x']]), lane('c', 'states', ['x'], [])],
    constraints: [dur('d1', 'a0', 'a2'), dur('d2', 'a1', 'a3'), dur('d3', 'a3', 'a3'), dur('across', 'a1', 'b0', 'd'), tim('t1', 'a0'), dur('back', 'a2', 'a1')] };
  const o = layoutTimeRuler(inp), M = id => o.marks.find(m => m.id === id), A = o.lanes[0], B = o.lanes[1];
  const lvl = m => ((m.kind === 'time' ? (m.pts[0][1] + m.pts[1][1]) / 2 : m.pts[1][1]) - A.strip.y - TR.level + TR.lift) / TR.level;
  // greedy by start: t1 (the tick starts 3 px before a0) on level 0, d1 over it, d2 overlapping d1 over that; back starts
  // after t1's label ends, and d3 (zero span, a3 to a3) after back's: both on level 0
  assert.deepEqual(['t1', 'back', 'd3', 'd1', 'd2'].map(id => lvl(M(id))), [0, 0, 0, 1, 2]);
  assert.equal(M('d2').pts[1][1] - M('d1').pts[1][1], TR.level);
  assert.ok(M('across').pts[1][1] > B.strip.y && M('across').pts[1][1] < B.strip.y + B.strip.h, 'across two lanes: the lower lane\'s strip');
  assert.equal(M('across').pts[0][1], A.rows[1].y, 'its extension line reaches the upper change'); assert.equal(M('across').pts[3][1], B.rows[0].y);
  assert.ok(M('back').pts[0][0] < M('back').pts[3][0], 'drawn in time order whatever from and to say');
  assert.equal(M('t1').pts[1][1] - M('t1').pts[0][1], TR.mark);
  assert.equal(o.lanes[2].strip.h, 0); assert.ok(A.strip.h >= 3 * TR.level);
  assert.equal(B.y, A.strip.y + A.strip.h, 'the next lane starts under the strip');
  assert.deepEqual(timingClean(o, inp), []);
  const bad = layoutTimeRuler({ lanes: inp.lanes, constraints: [dur('x', 'a0', 'nope')] });
  assert.deepEqual(bad.problems.map(p => [p.rule, p.ids.join()]), [['constraint-ends', 'x']]); assert.equal(bad.marks.length, 0);
});

test('message labels clear of steps, values and each other within the lane\'s height, else timing-label', () => {
  // six messages at one instant between two tall lanes: each label climbs above the ones before
  const inp = { lanes: [lane('a', 'states', Array.from({ length: 10 }, (_, i) => `s${i}`), [['a0', 0, 's9'], ['a1', 50, 's0']]), lane('b', 'values', [], [['b0', 0, 'ready'], ['b1', 50, 'busy']])],
    messages: Array.from({ length: 6 }, (_, i) => msg(`m${i}`, 'a', 'b', 20, 30, 'call')) };
  const o = layoutTimeRuler(inp);
  assert.deepEqual(o.problems, []); assert.deepEqual(timingClean(o, inp), []);
  assert.equal(new Set(o.lines.map(l => l.lbl.y)).size, 6, 'six heights');
  // a lane too low for them: the ones that do not fit are reported, each once, and left at their first place
  const low = { ...inp, lanes: [lane('a', 'states', ['x'], [['a0', 0, 'x']]), inp.lanes[1]] }, l = layoutTimeRuler(low);
  const said = l.problems.filter(p => p.rule === 'timing-label').flatMap(p => p.ids);
  assert.ok(said.length >= 1 && said.length < 6, said.join()); assert.deepEqual(timingClean(l, low), []);
  said.forEach(id => assert.equal(l.lines.find(x => x.id === id).lbl.y, l.lines[0].lbl.y));
  // a self message and one sent and received at one instant
  const s = { lanes: [lane('a', 'states', ['x', 'y'], [['a0', 0, 'x'], ['a1', 10, 'y']])], messages: [msg('self', 'a', 'a', 5, 15), msg('now', 'a', 'a', 12, 12)] };
  const so = layoutTimeRuler(s); assert.deepEqual(timingClean(so, s), []);
  assert.equal(so.lines[1].pts[0][0], so.lines[1].pts[1][0], 'equal times: upright');
  const bad = layoutTimeRuler({ lanes: s.lanes, messages: [msg('x', 'a', 'z', 0, 1), msg('y', 'a', 'a', 0, NaN)] });
  assert.deepEqual(bad.problems.map(p => [p.rule, p.ids.join()]), [['message-ends', 'x'], ['change-time', 'y']]); assert.equal(bad.lines.length, 0);
});

test('slots: on every lane one at every minor tick, after the change before it', () => {
  for (const c of CASES) { const o = layoutTimeRuler(c.inp), T = o.ruler.ticks;
    assert.equal(o.slots.length, T.length * c.inp.lanes.length, c.id);
    c.inp.lanes.forEach(l => { const d = drawn(l), L = o.lanes.find(x => x.id === l.id), mine = o.slots.filter(s => s.parent === l.id);
      mine.forEach((s, i) => { const before = d.filter(x => x.at <= s.t);
        assert.deepEqual([s.t, s.x, s.y, s.index, s.after], [T[i].t, T[i].x, L.y + L.h / 2, before.length, before.length ? before.pop().id : null], `${c.id} ${l.id} slot ${i}`); }); }); }
});

test('the same input twice gives the same output, and the input is not changed', () => {
  for (const c of CASES) { const before = JSON.stringify(c.inp), a = layoutTimeRuler(c.inp), b = layoutTimeRuler(JSON.parse(before));
    assert.equal(JSON.stringify(a), JSON.stringify(b), c.id); assert.equal(JSON.stringify(c.inp), before, `${c.id}: input unchanged`); }
  // the order changes are listed in is not meaning (notes/stage-6.md §3)
  const e = CASES[0].inp, r = { ...e, lanes: e.lanes.map(l => ({ ...l, changes: [...l.changes].reverse() })) };
  assert.equal(JSON.stringify(layoutTimeRuler(r)), JSON.stringify(layoutTimeRuler(e)));
});

// §11's timing-stress view `all`: 12 lifelines, 400 changes, 100 messages, 40 constraints
function stress() {
  const lanes = Array.from({ length: 12 }, (_, j) => { const st = Array.from({ length: 4 + (j % 3) }, (_, s) => `State ${j}.${s}`), n = j < 4 ? 34 : 33;
    return j % 4 === 3 ? lane(`l${j}`, 'values', [], Array.from({ length: n }, (_, i) => [`l${j}c${i}`, i * 30 + j, `v${i}`]))
      : lane(`lifeline number ${j}`, 'states', st, Array.from({ length: n }, (_, i) => [`l${j}c${i}`, i * 30 + j, st[(i * 7 + j) % st.length]])); });
  const ids = lanes.map(l => l.id), all = lanes.flatMap(l => l.changes);
  const messages = Array.from({ length: 100 }, (_, i) => msg(`m${i}`, ids[i % 12], ids[(i * 5 + 1) % 12], i * 10, i * 10 + 15, `message ${i}`));
  const constraints = Array.from({ length: 40 }, (_, i) => (i % 4 ? dur(`k${i}`, all[i * 9].id, all[i * 9 + 3].id, `{<= ${i} ms}`) : tim(`k${i}`, all[i * 9].id, `{t = ${i}}`)));
  return { unit: 'ms', lanes, messages, constraints };
}

test('the stress fixture\'s size: 400 changes, 100 messages, 40 constraints laid out clean, under CI\'s 1 s, printed against 100 ms (CPU, best of seven) (timed)', () => {
  const inp = stress();
  assert.equal(inp.lanes.flatMap(l => l.changes).length, 400);
  const o = layoutTimeRuler(inp);
  assert.deepEqual(scaleOk(o), []); assert.deepEqual(timingClean(o, inp), []);
  assert.equal(o.lines.length, 100); assert.equal(o.marks.length, 40);
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const best = Math.min(...Array.from({ length: 7 }, () => timed(() => layoutTimeRuler(inp))));
  assert.ok(best < 1000, `${best} ms`);
  console.log(`# P1 target 100 ms: the time ruler on 12 lifelines, 400 changes, 100 messages, 40 constraints ${best} ms`);
});
