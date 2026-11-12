// The time-axis layout and its shapes (work package 3.2, notes/stage-3.md §3.2, §4.2): layoutTimeAxis on hand-built inputs,
// one per case of risks.md §6 T and notes/stage-3.md §9. The cases live in tests/timeaxis.html, which draws them in Chrome
// in both themes and three fonts; here they are laid out with the monospace estimate (no measurer in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textW } from '../src/core/text.js';
import { SHAPE } from '../src/draw/shapes.js';
import { TA, layoutTimeAxis } from '../src/layout/timeaxis.js';
import { frame, tagSize, guardSize, useSize } from '../src/uml/frame.js';

const CASES = JSON.parse(/<script type="application\/json" id="cases">([\s\S]*?)<\/script>/.exec(readFileSync(new URL('./timeaxis.html', import.meta.url), 'utf8'))[1]);
const BY = Object.fromEntries(CASES.map(c => [c.id, c]));
const inputOf = c => ({ // as tests/timeaxis.html measures a case
  heads: c.heads.map(([id, label, st]) => ({ id, ...SHAPE.lifeline.size({ label, stereotypes: st }), born: (c.born || {})[id] ?? null, ends: (c.ends || {})[id] ?? null })),
  rows: c.rows.map(([id, kind, a, b, label, parent]) => ({ id, kind, a, b, parent: parent ?? null, ...(kind === 'span' ? useSize(label) : { w: Math.ceil(textW(label, 10.5) + 12), h: 16 }) })),
  groups: (c.groups || []).map(([id, op, parent, parts]) => ({ id, parent, tag: tagSize(op), parts: parts.map(([p, g]) => ({ id: p, guard: guardSize(g) })) })),
  bars: (c.bars || []).map(([head, from, to, depth]) => ({ head, from, to, depth })) });
const meets = (a, b, k = .5) => a.x + k < b.x + b.w && b.x + k < a.x + a.w && a.y + k < b.y + b.h && b.y + k < a.y + a.h;
const within = (a, b, k = .5) => a.x >= b.x - k && a.y >= b.y - k && a.x + a.w <= b.x + b.w + k && a.y + a.h <= b.y + b.h + k;
const segs = pts => pts.slice(1).map((q, k) => { const p = pts[k]; return { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 }; });
const ptsBox = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
// a row's band: its label and arrow (a loop's too), what a stem's gap must cover
const bandOf = l => { const b = ptsBox(l.pts); return [Math.min(l.lbl.y, b.y - TA.hit), Math.max(b.y + b.h, l.lbl.y + l.lbl.h) + TA.hit]; };

// clean: what holds text never meets (heads, labels, tags, guards, uses' boxes), no label lies on a bar, no line runs through a
// head or a use, every line ends on a stem, a bar's side or (a create) its head's side, everything an operand holds lies in
// it, a nested frame sits 10 px or more inside its operand, every stem gap covers its rows, slots are as §3.2 says
function clean(o, inp) {
  const bad = [], H = Object.fromEntries(o.heads.map(h => [h.id, h])), S = Object.fromEntries(o.stems.map(s => [s.head, s]));
  const G = Object.fromEntries(inp.groups.map(g => [g.id, g])), part = Object.fromEntries(o.frames.flatMap(f => f.parts.map((p, k) => [p.id, { f, p, k }])));
  const rows = Object.fromEntries(inp.rows.map((r, i) => [r.id, { ...r, i }]));
  const solid = [...o.heads.map(h => ['head ' + h.id, h]), ...o.lines.map(l => ['label ' + l.id, l.lbl]), ...o.spans.map(s => ['use ' + s.id, s]),
    ...o.frames.flatMap(f => [['tag ' + f.id, { x: f.x, y: f.y, ...G[f.id].tag }], ...f.parts.map((p, k) => { const g = G[f.id].parts[k].guard; return g.w ? ['guard ' + p.id, { x: p.gx, y: p.gy, ...g }] : null; }).filter(Boolean)])];
  solid.forEach(([a, p], i) => solid.slice(i + 1).forEach(([b, q]) => { if (meets(p, q)) bad.push(`${a} meets ${b}`); }));
  o.lines.forEach(l => o.bars.forEach(b => { if (meets(l.lbl, b)) bad.push(`label ${l.id} on a bar of ${b.head}`); }));
  o.heads.forEach(h => { if (h.w > TA.cut) bad.push(`head ${h.id} wider than ${TA.cut}`); });
  o.lines.forEach(l => segs(l.pts).forEach(s => { o.heads.forEach(h => { if (meets(s, { x: h.x + 1, y: h.y + 1, w: h.w - 2, h: h.h - 2 }, 0)) bad.push(`${l.id} through head ${h.id}`); });
    o.spans.forEach(u => { if (meets(s, u, 0)) bad.push(`${l.id} through use ${u.id}`); }); }));
  const onEnd = (id, [x, y], created) => { const s = S[id], h = H[id];
    return x === s.x || o.bars.some(b => b.head === id && b.y - .5 <= y && y <= b.y + b.h + .5 && (Math.abs(x - b.x) < .01 || Math.abs(x - b.x - b.w) < .01))
      || (created && (x === h.x || x === h.x + h.w) && Math.abs(y - (h.y + h.h / 2)) < .01); };
  o.lines.forEach(l => { const r = rows[l.id], b = r.kind === 'self' ? r.a : r.b, created = (inp.heads.find(h => h.id === b) || {}).born === r.i;
    if (!onEnd(r.a, l.pts[0])) bad.push(`${l.id} starts off ${r.a}`); if (!onEnd(b, l.pts[l.pts.length - 1], created)) bad.push(`${l.id} ends off ${b}`); });
  // what an operand holds lies in it; a frame in an operand, 10 px or more inside it on each side
  const box = (f, p) => ({ x: f.x, y: p.y, w: f.w, h: p.h });
  o.lines.forEach(l => { const r = rows[l.id], P = part[r.parent]; if (P && (!within(ptsBox(l.pts), box(P.f, P.p)) || !within(l.lbl, box(P.f, P.p)))) bad.push(`${l.id} out of ${r.parent}`); });
  o.spans.forEach(u => { const P = part[rows[u.id].parent]; if (P && !within(u, { x: P.f.x + 10, y: P.p.y, w: P.f.w - 2 * 10, h: P.p.h })) bad.push(`use ${u.id} not inset in ${rows[u.id].parent}`); });
  o.frames.forEach(f => { const P = part[G[f.id].parent]; if (P && !within(f, { x: P.f.x + 10, y: P.p.y, w: P.f.w - 2 * 10, h: P.p.h })) bad.push(`frame ${f.id} not inset in ${G[f.id].parent}`); });
  // stems: each gap covers the band of every row over it
  o.lines.forEach(l => { const [t, u] = bandOf(l), b = ptsBox([...l.pts, [l.lbl.x, l.lbl.y], [l.lbl.x + l.lbl.w, l.lbl.y]]);
    o.stems.forEach(s => { if (s.x + TA.hit <= b.x || s.x - TA.hit >= b.x + b.w) return; const y1 = Math.max(t, s.y1), y2 = Math.min(u, s.y2);
      if (y2 > y1 && !s.gaps.some(g => g.y1 <= y1 + .01 && g.y2 >= y2 - .01)) bad.push(`stem ${s.head} has no gap over ${l.id}`); }); });
  o.spans.forEach(u => o.stems.forEach(s => { if (s.x > u.x && s.x < u.x + u.w && !s.gaps.some(g => g.y1 <= u.y + .01 && g.y2 >= u.y + u.h - .01)) bad.push(`stem ${s.head} has no gap over ${u.id}`); }));
  // slots: no two share a y; each after the occurrence before its index; in time order
  if (new Set(o.slots.map(s => s.y)).size !== o.slots.length) bad.push('two slots share a y');
  o.slots.forEach((s, i) => { if (s.after !== (s.index ? inp.rows[s.index - 1].id : null)) bad.push(`slot ${i}: after ${s.after}, index ${s.index}`);
    if (i && (s.y <= o.slots[i - 1].y || s.index < o.slots[i - 1].index)) bad.push(`slot ${i} out of order`); });
  // everything in the bounds
  const B = o.bounds; [...solid.map(x => x[1]), ...o.frames, ...o.lines.map(l => ptsBox(l.pts))].forEach(b => { if (!within(b, B)) bad.push(`out of bounds: ${JSON.stringify(b)}`); });
  return bad;
}
// slots §3.2 asks for: one between every two items of a container (the interaction, an operand) and one at each end of it;
// an empty container: its two ends. Items: its rows and its fragments
function slotsWanted(inp) {
  const parents = [null, ...inp.groups.flatMap(g => g.parts.map(p => p.id))];
  return parents.reduce((n, p) => n + Math.max(1, inp.rows.filter(r => (r.parent ?? null) === p).length + inp.groups.filter(g => (g.parent ?? null) === p).length) + 1, 0);
}
const lay = id => { const inp = inputOf(BY[id]), o = layoutTimeAxis(inp); return { inp, o, L: x => o.lines.find(l => l.id === x), S: x => o.stems.find(s => s.head === x),
  H: x => o.heads.find(h => h.id === x), F: x => o.frames.find(f => f.id === x), P: x => o.frames.flatMap(f => f.parts).find(p => p.id === x), B: (h, d = 1) => o.bars.find(b => b.head === h && b.depth === d) }; };

test('every case lays out clean: no overlap, no label on a bar, no line through a head, lines end on stems and bars, operands hold what they hold, gaps and slots as §3.2 says', () => {
  for (const c of CASES) {
    const inp = inputOf(c), o = layoutTimeAxis(inp);
    assert.deepEqual(clean(o, inp), [], c.id);
    assert.deepEqual(o.problems.map(p => p.ids.join()), c.problems || [], `${c.id}: problems`);
    assert.equal(o.slots.length, slotsWanted(inp), `${c.id}: one slot per gap and per operand end`);
    assert.equal(o.lines.length, c.rows.filter(r => r[1] !== 'span').length, `${c.id}: every message drawn`);
  }
});

test('a call and its reply: the bar from the call to the reply, the arrows on its side', () => {
  const { o, L, B, S } = lay('minimal'), b = B('b');
  assert.deepEqual([b.y, b.y + b.h], [L('m1').pts[0][1], L('m2').pts[0][1]]);
  assert.deepEqual([L('m1').pts[0][0], L('m1').pts[1][0], L('m2').pts[0][0]], [S('a').x, b.x, b.x]);
  assert.equal(o.problems.length, 0);
});

test('a self-message: a loop of three segments to a nested bar, 6 px right, from where the loop comes back; its label right of the loop', () => {
  const { L, B } = lay('self'), m = L('m2'), outer = B('api'), inner = B('api', 2);
  assert.equal(m.pts.length, 4);
  assert.equal(inner.x, outer.x + 6);
  assert.deepEqual([inner.y, inner.h], [m.pts[2][1], TA.short]);
  assert.deepEqual([m.pts[0][0], m.pts[3][0]], [outer.x + outer.w, inner.x + inner.w]);
  assert.ok(m.lbl.x > m.pts[1][0] && m.lbl.y >= m.pts[1][1] && m.lbl.y + m.lbl.h <= m.pts[2][1] + .01, JSON.stringify(m));
});

test('a call inside a call on one lifeline: a second bar inside the first, 6 px right', () => {
  const { L, B } = lay('reentrant'), b1 = B('b'), b2 = B('b', 2);
  assert.equal(b2.x, b1.x + 6);
  assert.ok(b2.y > b1.y && b2.y + b2.h < b1.y + b1.h);
  assert.deepEqual([L('m3').pts[1][0], L('m4').pts[0][0]], [b2.x, b2.x]);
  assert.equal(L('m2').pts[1][0], B('a').x + B('a').w);
});

test('a reply with no call: from stem to stem, no bar', () => {
  const { o, L, S } = lay('no-call');
  assert.deepEqual(o.bars, []);
  assert.deepEqual(L('m1').pts.map(p => p[0]), [S('b').x, S('a').x]);
});

test('a create lowers the head to its arrow; the arrow ends on the head\'s side; the stem starts under it', () => {
  const { L, H, S } = lay('create'), m = L('m2'), c = H('c');
  assert.equal(c.y + c.h / 2, m.pts[0][1]);
  assert.equal(m.pts[1][0], c.x);
  assert.equal(S('c').y1, c.y + c.h);
  assert.ok(H('a').y === TA.top && H('b').y === TA.top);
});

test('a delete ends the stem at its arrow, with a cross', () => {
  const { L, S } = lay('delete');
  assert.deepEqual([S('b').y2, S('b').cross, S('a').cross], [L('m3').pts[0][1], true, false]);
  assert.ok(S('a').y2 > S('b').y2);
});

test('an operand with no messages keeps one empty row and both its slots', () => {
  const { o, P, F } = lay('empty-operand'), p = P('f1-no');
  assert.ok(p.h >= TA.empty + 2 * TA.band, JSON.stringify(p));
  assert.deepEqual(o.slots.filter(s => s.parent === 'f1-no').map(s => [s.index, s.after]), [[2, 'm2'], [2, 'm2']]);
  assert.deepEqual(F('f1').dividers, [{ part: 'f1-no', y: p.y }]);
});

test('a fragment inside a fragment: inset 10 px or more each side, its tag under its parent\'s', () => {
  const { F } = lay('nested'), f1 = F('f1'), f2 = F('f2');
  assert.ok(f2.x >= f1.x + 10 && f2.x + f2.w <= f1.x + f1.w - 10 && f2.y >= f1.y + tagSize('loop').h, JSON.stringify([f1, f2]));
});

test('an interaction use across two lifelines: its box over those two, clear of the third; their stems cut round it', () => {
  const { o, S } = lay('use'), u = o.spans[0];
  assert.ok(u.x < S('b').x - TA.bar / 2 && u.x + u.w > S('c').x + TA.bar / 2 && u.x > S('a').x + TA.bar / 2, JSON.stringify(u));
  assert.ok(['b', 'c'].every(h => S(h).gaps.some(g => g.y1 <= u.y && g.y2 >= u.y + u.h)) && !S('a').gaps.some(g => g.y1 < u.y + u.h && g.y2 > u.y));
  assert.equal(o.lines.length, 2);
});

test('a lifeline no message touches: its stem at full height, cut only where messages cross it', () => {
  const { S, L } = lay('untouched'), s = S('idle');
  assert.deepEqual([s.y2, s.cross], [S('a').y2, false]);
  assert.equal(s.gaps.length, 2);
  ['m1', 'm2'].forEach((m, k) => assert.ok(s.gaps[k].y1 <= L(m).pts[0][1] && s.gaps[k].y2 >= L(m).pts[0][1]));
});

test('replies to one call in two operands of an alt: the bar runs across the divider to the last; a guard lies over a bar', () => {
  const { L, B, F, P } = lay('alt-replies'), b = B('pay'), d = F('f1').dividers[0].y, g = P('f1-no'), api = B('api');
  assert.ok(b.y < d && b.y + b.h === L('m4').pts[0][1]);
  assert.ok(g.gx < api.x + api.w && g.gx + guardSize('else').w > api.x && api.y < g.gy && api.y + api.h > g.gy, 'the else guard is drawn across api\'s bar');
});

test('a lifeline created in one operand: its stem runs on through the other (accepted, risk 4.5)', () => {
  const { S, P, H, L } = lay('created-in-operand');
  assert.equal(H('r').y + H('r').h / 2, L('m2').pts[0][1]);
  assert.ok(S('r').y2 > P('f1-b').y + P('f1-b').h);
});

test('a long lifeline name: its head cut at 320 px', () => {
  const { H } = lay('long-name');
  assert.equal(H('a').w, TA.cut);
});

test('a fragment with nothing in it: at its parent\'s end, a header and one empty row per operand, spanning its parent\'s lifelines, with a warning', () => {
  const { o, F, P, S } = lay('empty-fragment'), f2b = P('f2-b'), f3 = F('f3'), f1 = F('f1');
  assert.deepEqual(o.problems.map(p => [p.level, p.ids]), [['warning', ['f3']], ['warning', ['f1']]]);
  assert.ok(f3.y > f2b.y && f3.y + f3.h < f2b.y + f2b.h);
  assert.ok(f1.y > F('f2').y + F('f2').h && f1.x < S('a').x && f1.x + f1.w > S('b').x);
  assert.equal(f3.parts[0].h, tagSize('opt').h + TA.hdr + TA.empty + 2 * TA.band); // its one operand: under its tag, an empty row between its two slots
});

test('example 11 with 3.1\'s bars: storefront m1 to m10, api m2 to m9, api m3 at depth 2 one short step, payments m4 to m8 across the divider', () => {
  const { o, L, B, F, H } = lay('example-11'), y = id => L(id).pts[0][1];
  assert.deepEqual(o.problems, []);
  assert.deepEqual([B('storefront').y, B('storefront').y + B('storefront').h], [y('m1'), y('m10')]);
  assert.deepEqual([B('api').y, B('api').y + B('api').h], [y('m2'), y('m9')]);
  assert.deepEqual([B('api', 2).y, B('api', 2).h], [L('m3').pts[2][1], TA.short]);
  assert.ok(B('payments').y + B('payments').h === y('m8') && F('f1').dividers[0].y < y('m8') && F('f1').dividers[0].y > B('payments').y);
  assert.equal(H('receipt').y + H('receipt').h / 2, y('m6'));
  assert.deepEqual(o.frames.map(f => f.id), ['f1', 'f2']);
  assert.deepEqual(o.slots.map(s => s.parent), [null, null, null, null, null, 'f1-paid', 'f1-paid', 'f1-paid', 'f2-notify', 'f2-notify', 'f1-paid', 'f1-paid', 'f1-declined', 'f1-declined', null, null, null]);
});

test('input the layout cannot draw: reported as problems with their ids, never thrown', () => {
  const o = layoutTimeAxis({ heads: [{ id: 'a', w: 80, h: 28, born: 9 }, { id: 'b', w: 80, h: 28 }],
    rows: [{ id: 'm1', kind: 'line', a: 'a', b: 'zz', w: 40, h: 16 }, { id: 'm2', kind: 'line', a: 'a', b: 'b', w: 40, h: 16, parent: 'nope' }, { id: 'm3', kind: 'wave', a: 'a', b: 'b' }],
    groups: [{ id: 'g', parts: [] }], bars: [{ head: 'b', from: 2, to: 1, depth: 1 }, { head: 'q', from: 1, to: 1 }] });
  assert.deepEqual(o.problems.map(p => [p.level, p.ids.join()]), [['warning', 'a'], ['warning', 'g'], ['error', 'm1'], ['error', 'm2'], ['error', 'm3'], ['warning', 'b'], ['warning', 'q']]);
  assert.deepEqual([o.lines.map(l => l.id), o.slots.map(s => s.index), o.bars], [['m2'], [0, 3], []]);
  assert.deepEqual(layoutTimeAxis({}).slots.map(s => [s.index, s.parent]), [[0, null], [0, null]]);
  assert.deepEqual(layoutTimeAxis().lines, []);
});

test('a fragment whose parent is not an operand, or lies inside it, is reported once on the fragment and drawn at the top', () => {
  const hd = [{ id: 'a', w: 80, h: 28 }, { id: 'b', w: 80, h: 28 }], tag = { w: 30, h: 17 }, gd = { w: 0, h: 0 };
  const L = (id, parent) => ({ id, kind: 'line', a: 'a', b: 'b', w: 40, h: 16, parent });
  const G = (id, parent) => ({ id, parent, tag, parts: [{ id: id + '-1', guard: gd }] });
  const run = (rows, groups) => { const o = layoutTimeAxis({ heads: hd, rows, groups }); return [o.problems.map(p => [p.level, p.ids.join()]), o.frames.map(f => f.id)]; };
  assert.deepEqual(run([L('m1', 'f-1'), L('m2', 'f-1'), L('m3', 'f-1')], [G('f', 'zz')]), [[['error', 'f']], ['f']]);
  assert.deepEqual(run([L('m1')], [G('e', 'zz')]), [[['error', 'e'], ['warning', 'e']], ['e']]);
  assert.deepEqual(run([L('m1')], [G('s', 's-1')]), [[['error', 's'], ['warning', 's']], ['s']]);
  assert.deepEqual(run([L('m1')], [G('g1', 'g2-1'), G('g2', 'g1-1')]), [[['error', 'g1'], ['warning', 'g1'], ['warning', 'g2']], ['g1', 'g2']]);
  assert.deepEqual(run([L('m1', 'g1-1')], [G('g1', 'g2-1'), G('g2', 'g1-1')]), [[['error', 'g1'], ['warning', 'g2']], ['g1', 'g2']]);
});

test('a fragment whose occurrences are not one run is drawn as two frames, with a warning', () => {
  const o = layoutTimeAxis({ heads: [{ id: 'a', w: 80, h: 28 }, { id: 'b', w: 80, h: 28 }],
    rows: ['f-1', null, 'f-1'].map((parent, i) => ({ id: 'm' + i, kind: 'line', a: 'a', b: 'b', w: 40, h: 16, parent })),
    groups: [{ id: 'f', parent: null, tag: { w: 30, h: 17 }, parts: [{ id: 'f-1', guard: { w: 0, h: 0 } }] }] });
  assert.deepEqual([o.frames.map(f => f.id), o.problems.map(p => p.ids.join())], [['f', 'f'], ['f']]);
});

test('200 rows lay out in under 5 ms (best of seven, after a warm-up): 20 lifelines, 10 nested fragments, clean', () => {
  const heads = Array.from({ length: 20 }, (_, j) => ({ id: 'h' + j, ...SHAPE.lifeline.size({ label: `h${j} : Type${j}` }) }));
  const groups = Array.from({ length: 10 }, (_, k) => ({ id: 'f' + k, parent: k ? `f${k - 1}-a` : null, tag: tagSize(['alt', 'loop', 'opt', 'par', 'break'][k % 5]),
    parts: [{ id: `f${k}-a`, guard: guardSize('guard ' + k) }, { id: `f${k}-b`, guard: guardSize('else') }] }));
  // the deepest fragment over row i: rows 10k to 190 - 10k sit in f(k)'s first operand, rows 190 - 10k to 195 - 2k in its second
  const parentOf = i => { let p = null; for (let k = 0; k < 10; k++) { if (i >= 10 * k + 5 && i < 185 - 10 * k) p = `f${k}-a`; else if (i >= 185 - 10 * k && i < 190 - 10 * k) { p = `f${k}-b`; break; } else break; } return p; };
  const rows = Array.from({ length: 200 }, (_, i) => { const a = (i * 7) % 20, b = (i * 13 + 5) % 20;
    return { id: 'm' + i, kind: i % 9 === 4 ? 'self' : 'line', a: 'h' + a, b: 'h' + (b === a ? (b + 1) % 20 : b), w: Math.ceil(textW('message' + i + '(x)', 10.5) + 12), h: 16, parent: parentOf(i) }; });
  const bars = rows.flatMap((r, i) => (r.kind === 'line' && i % 3 === 0 ? [{ head: r.b, from: i, to: Math.min(i + 1, 199), depth: 1 }] : []));
  const inp = { heads, rows, groups, bars };
  let best = Infinity, o;
  layoutTimeAxis(inp); // a warm-up: the first call compiles, and a busy CI runner pauses at random
  for (let k = 0; k < 7; k++) { const t = performance.now(); o = layoutTimeAxis(inp); best = Math.min(best, performance.now() - t); }
  assert.ok(best < 5, `best of seven: ${best.toFixed(2)} ms`);
  assert.deepEqual(o.problems, []);
  assert.deepEqual(clean(o, inp), []);
  assert.equal(o.slots.length, slotsWanted(inp));
  assert.equal(o.frames.length, 10);
});

test('the shapes: a lifeline is the classifier\'s head with its stem\'s hit strip cut at the gaps; frames, operands and uses are named nodes; every text is escaped', () => {
  const ll = SHAPE.lifeline.draw({ id: 'a', label: 'a : A<B>', x: 0, y: 0, w: 100, h: 28, k: 'file', stem: { x: 50, y1: 28, y2: 200, gaps: [{ y1: 60, y2: 80 }, { y1: 120, y2: 130 }] } }, 'c', 'f');
  assert.match(ll, /^<g class="node lifeline" data-id="a" data-shape="lifeline"/);
  assert.match(ll, /aria-label="Lifeline a : A&lt;B&gt;"/);
  assert.match(ll, /<path d="M50 28V60M50 80V120M50 130V200" class="ll-hit" fill="none" stroke="transparent" stroke-width="24"\/><\/g>$/);
  assert.match(SHAPE.lifeline.draw({ id: 'a', label: 'a', aria: 'Lifeline one', x: 0, y: 0, w: 60, h: 28, k: 'file' }, 'c', 'f'), /aria-label="Lifeline one"/);
  assert.deepEqual(SHAPE.lifeline.size({ label: 'a : A' }), SHAPE.classifier.size({ label: 'a : A', compartments: [] }));
  const fr = SHAPE.frame.draw({ id: 'f"1', label: 'a<lt', x: 10, y: 20, w: 200, h: 100 });
  assert.match(fr, /^<g class="node frame" data-id="f&quot;1" data-shape="frame" tabindex="-1" role="img" aria-label="Combined fragment a&lt;lt">/);
  assert.match(fr, /class="f-hit" fill="none" stroke="transparent"/);
  const op = SHAPE.operand.draw({ id: 'o', label: 'x & y', x: 10, y: 40, w: 200, h: 50, gx: 18, gy: 43 });
  assert.match(op, /aria-label="Operand x &amp; y"/); assert.match(op, />\[x &amp; y\]<\/text>/);
  assert.doesNotMatch(SHAPE.operand.draw({ id: 'o', label: '', x: 10, y: 40, w: 200, h: 50, gx: 18, gy: 43 }), /<text/);
  const use = SHAPE.use.draw({ id: 'u', label: 'Pay <now>', x: 0, y: 0, ...useSize('Pay <now>') });
  assert.match(use, /aria-label="Interaction use Pay &lt;now&gt;"/); assert.match(use, />ref<\/text>/); assert.match(use, />Pay &lt;now&gt;<\/text>/);
  assert.equal(frame(0, 0, 100, 50, [20]), '<g class="frame-box"><rect x="0" y="0" width="100" height="50" fill="none" stroke="var(--um-muted)" stroke-width="1.2"/><path d="M0 20H100" stroke="var(--um-muted)" stroke-width="1.2" stroke-dasharray="5 4"/></g>');
  assert.deepEqual([guardSize(''), guardSize(null)], [{ w: 0, h: 0 }, { w: 0, h: 0 }]);
});
