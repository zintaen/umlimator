// The sequence diagram's fixtures (work package 3.8, notes/stage-3.md §9): tests/sequence-minimal.json, a call and its
// reply, and tests/sequence-stress.json, its view edge-cases holding every T case of §9 and its view all the spike's 20
// lifelines, 200 messages and 10 nested fragments, laid out within P1's budget. Each lays out with no overlap of what
// holds text, no label on a bar and no line through a head. tests/sequence-fixtures.html draws them in a browser, in both
// themes and three fonts. (The communication fixtures are tested in tests/communication.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/uml/sequence.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { tagSize, guardSize } from '../src/uml/frame.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const MINIMAL = read('./sequence-minimal.json'), STRESS = read('./sequence-stress.json');
const view = (m, id) => m.views.find(v => v.id === id);
const meets = (a, b, k = .5) => a.x + k < b.x + b.w && b.x + k < a.x + a.w && a.y + k < b.y + b.h && b.y + k < a.y + a.h;

// DoD 3 in Node: heads, labels, tags, guards and uses never meet; no label lies on a bar; no line runs through a head
function unclean(m, vid) {
  const g = layout(m, vid), o = g.ta, F = new Map((view(m, vid).fragments || []).map(f => [f.id, f])), bad = [];
  const solid = [...o.heads.map(h => ['head ' + h.id, h]), ...o.lines.filter(l => l.lbl.w).map(l => ['label ' + l.id, l.lbl]), ...o.spans.map(s => ['use ' + s.id, s]),
    ...o.frames.flatMap(f => [['tag ' + f.id, { x: f.x, y: f.y, ...tagSize(F.get(f.id).props.operator) }],
      ...f.parts.map((p, k) => { const s = guardSize(F.get(f.id).members[k].label); return s.w ? ['guard ' + p.id, { x: p.gx, y: p.gy, ...s }] : null; }).filter(Boolean)])];
  solid.forEach(([a, p], i) => solid.slice(i + 1).forEach(([b, q]) => { if (meets(p, q)) bad.push(`${a} meets ${b}`); }));
  o.lines.forEach(l => o.bars.forEach(b => { if (l.lbl.w && meets(l.lbl, b)) bad.push(`label ${l.id} on a bar of ${b.head}`); }));
  o.lines.forEach(l => l.pts.slice(1).forEach((q, k) => { const p = l.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 };
    o.heads.forEach(h => { if (meets(s, { x: h.x + 1, y: h.y + 1, w: h.w - 2, h: h.h - 2 }, 0)) bad.push(`${l.id} through head ${h.id}`); }); }));
  return { g, bad, problems: g.problems.map(p => [p.level, p.ids]), checked: check(m, vid).map(p => p.message) };
}

test('the minimal fixture: two lifelines, a call and its reply; clean, no problem', () => {
  const v = view(MINIMAL, 'v'), r = unclean(MINIMAL, 'v');
  assert.deepEqual([v.nodeIds, v.edges.map(e => e.props.sort)], [['client', 'server'], ['call', 'reply']]);
  assert.deepEqual([validate(MINIMAL), r.bad, r.problems, r.checked], [[], [], [], []]);
  assert.deepEqual(r.g.ta.bars.map(b => [b.head, b.depth]), [['server', 1]], 'one bar, on the receiver');
});

test('the edge-cases view holds every T case of notes/stage-3.md §9, so it cannot be trimmed by accident', () => {
  const v = view(STRESS, 'edge-cases'), E = Object.fromEntries(v.edges.map(e => [e.id, e])), r = unclean(STRESS, 'edge-cases'), o = r.g.ta;
  const H = Object.fromEntries(o.heads.map(h => [h.id, h])), St = Object.fromEntries(o.stems.map(s => [s.head, s])), Fr = Object.fromEntries(o.frames.map(f => [f.id, f]));
  const row = id => o.lines.find(l => l.id === id).pts[0][1], bars = head => o.bars.filter(b => b.head === head), top = Math.max(...o.stems.map(s => s.y2));
  // a self-message, and a call into a lifeline that is already active (re-entrant): each a second bar inside the first
  assert.equal(E.check.from, E.check.to);
  assert.ok(bars('server').some(b => b.depth === 2 && b.y >= row('check')), 'the self-message: a loop to a nested bar');
  assert.ok(bars('server').some(b => b.depth === 2 && b.y === row('notify')), 're-entrant: a second bar inside the first (rule 5)');
  // a reply with no call: drawn, and warned
  assert.ok(E.stray.props.sort === 'reply' && !E.stray.props.replyTo);
  // a create lowers the head to its arrow; a delete ends the stem in a cross, at its row
  assert.equal(H.cache.y + H.cache.h / 2, row('open'), 'the created head is centred on its create row');
  assert.deepEqual([St.cache.cross, St.cache.y2], [true, row('close')]);
  // an operand with no messages keeps a row; a fragment with nothing in it is drawn at the end, and both are warned
  assert.ok(!v.edges.some(e => e.parent === 'alt-none'));
  assert.ok(Fr['opt-never'].y > Math.max(...o.lines.map(l => l.pts[0][1])), 'the empty fragment comes after every occurrence');
  // a fragment in a fragment: inset 10 px on its right, inside its parent
  assert.ok(Fr['opt-stock'].x > Fr['loop-each'].x && Fr['loop-each'].x + Fr['loop-each'].w - (Fr['opt-stock'].x + Fr['opt-stock'].w) === 10 && Fr['opt-stock'].y > Fr['loop-each'].y);
  // an interaction use over two lifelines: its box over their stems, clear of every other
  const u = o.spans.find(s => s.id === 'use-log');
  assert.ok(u.x < St.session.x && u.x + u.w > St.audit.x && u.x > St.cache.x && u.x + u.w < St.idle.x, JSON.stringify(u));
  // a lifeline no message touches: its stem at full height
  assert.ok(!v.edges.some(e => e.from === 'idle' || e.to === 'idle') && St.idle.y1 === H.idle.y + H.idle.h && St.idle.y2 === top);
  // replies to one call in two operands of an alt: one bar from the call across the divider to the last reply, and that
  // bar runs across the guard of the second operand (spike risk 4.3)
  const pay = bars('server').find(b => b.y === row('pay')), div = Fr['alt-pay'].dividers[0].y;
  assert.ok(pay && pay.y + pay.h === row('declined') && pay.y < div && div < pay.y + pay.h, JSON.stringify(pay));
  // a lifeline created in one operand: its stem runs on through the other (spike risk 4.5, accepted)
  assert.ok(H.session.y > Fr['alt-pay'].y && St.session.y2 === top && div > H.session.y);
  // a long lifeline name, cut at 320 px
  assert.equal(H.ledger.w, 320);
  assert.deepEqual(validate(STRESS).map(p => [p.level, p.rule, p.ids]),
    [['warning', 'reply-call', ['stray']], ['warning', 'empty', ['alt-none', 'alt-status']], ['warning', 'empty', ['opt-never']]], 'what the fixture warns of; no error');
});

test('both views of the stress fixture lay out clean: nothing that holds text meets, no label on a bar, no line through a head, the page\'s check clean', () => {
  const ec = unclean(STRESS, 'edge-cases'), all = unclean(STRESS, 'all');
  assert.deepEqual([ec.bad, ec.problems, ec.checked], [[], [['warning', ['opt-never']]], []]);
  assert.deepEqual([all.bad, all.problems, all.checked], [[], [], []]);
  assert.deepEqual([all.g.edges.length, all.g.ta.frames.length, all.g.ta.heads.length], [200, 10, 20]);
});

test('performance (risks.md P1, notes/stage-3.md §10): the view all lays out and draws as SVG markup in under 100 ms (best of three)', () => {
  const runs = [0, 1, 2].map(() => { const t = performance.now(); mapContext(STRESS, {}).buildView('all'); return performance.now() - t; });
  console.log(`# 20 lifelines, 200 messages, 10 fragments: laid out and drawn in ${runs.map(t => t.toFixed(1)).join(', ')} ms`);
  assert.ok(Math.min(...runs) < 100, `${Math.min(...runs)} ms`);
});
