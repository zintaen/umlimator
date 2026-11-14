// The sequence type, uml.sequence (work package 3.3, notes/stage-3.md §4 and §5), in Node on the sources: its definition,
// example 11 laid out clean with its names and reading order (geo.order), each validator with a passing and a failing
// fixture, describe() and the legend, every gesture hook's commands through apply(), a 30-step session undone, redone and
// reopened, and P1's budget on a stress view. tests/sequence.html draws the same in Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { history } from '../src/core/history.js';
import { layout } from '../src/map/api.js';
import { validate } from '../src/map/validate.js';
import { describe as describeView } from '../src/map/insight.js';
import { mapContext } from '../src/map/context.js';
import { tagSize, guardSize } from '../src/uml/frame.js';
import { SEQ_TYPE, SQ_RULES, sqProblems, sqConnect, sqMoveTo, sqWrap, sqAdd, sqRemove } from '../src/uml/sequence.js';
import { check } from '../docs/diagrams/examples/check.mjs';

const SEQ = JSON.parse(readFileSync(new URL('../examples/checkout-sequence.json', import.meta.url)));
const V = m => m.views[0], ids = list => list.map(x => (typeof x === 'string' ? x : x.id)), at = (m, id) => V(m).edges.find(e => e.id === id);
const errors = m => validate(m).filter(p => p.level === 'error');
const rules = (m, level) => sqProblems(m, V(m)).filter(p => !level || p.level === level).map(p => [p.rule, p.ids]);
const M = (id, from, to, sort, more = {}) => ({ id, type: 'uml.Message', from, to, label: id, ...more, props: { sort, ...(more.props || {}) } });
// a small view: lifelines A, B, C; occurrences and fragments as given
const seq = (edges, fragments = [], more = {}) => ({ schemaVersion: 2, nodes: ['A', 'B', 'C'].map(id => ({ id, type: 'uml.Lifeline', label: id })), edges: [],
  views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['A', 'B', 'C'], edges, fragments, ...more }] });
const ALT = (id, ...ops) => ({ id, type: 'uml.CombinedFragment', props: { operator: 'alt' }, members: ops.map(o => ({ id: o, type: 'uml.InteractionOperand', label: o })) });
const FR = (id, op, parent, ...ops) => ({ id, type: 'uml.CombinedFragment', ...(parent ? { parent } : {}), props: { operator: op }, members: ops.map(o => ({ id: o, type: 'uml.InteractionOperand', label: o })) });
// a hook's commands ({ commands, say } too: remove with a lifeline) applied: the model, and it adds no error
const cmdsOf = r => (r && Array.isArray(r.commands) ? r.commands : r);
const run = (m, r) => { const cmds = cmdsOf(r); assert.ok(Array.isArray(cmds) && cmds.length, JSON.stringify(r)); const n = apply(m, cmds); assert.deepEqual(errors(n), []); return n; };

test('the definition: palette, lines with their sorts, items, wraps, refs, a layout of its own with no pins and no key, the hooks', () => {
  const T = diagramOf({ diagram: 'uml.sequence' });
  assert.equal(T, SEQ_TYPE);
  assert.deepEqual(T.elements.map(e => e.type), ['uml.Lifeline', 'uml.InteractionUse']); // never the fragment: add … in: 'view' puts it in fragments
  assert.deepEqual(T.lines.map(l => [l.type, l.label, l.props.sort]), [['uml.Message', 'Call', 'call'], ['uml.Message', 'Async', 'async'], ['uml.Message', 'Reply', 'reply'], ['uml.Message', 'Create', 'create'], ['uml.Message', 'Delete', 'delete']]);
  assert.deepEqual([T.items, T.wraps], [['uml.InteractionUse'], ['alt', 'opt', 'loop', 'par', 'break']]);
  assert.deepEqual(T.refs, { 'uml.Message': { 'props.replyTo': 'cascade' }, 'uml.InteractionUse': { 'props.covers': 'drop' } });
  assert.deepEqual([typeof T.layout.run, T.layout.pins, T.layout.key], ['function', false, undefined]);
  assert.deepEqual(Object.keys(T.edits), ['connect', 'moveTo', 'wrap', 'add', 'remove']);
  assert.deepEqual(Object.keys(T.rules), ['parent-operand', 'contiguous', 'message-ends', 'reply-call', 'reply-once', 'create-once', 'delete-once', 'sort', 'covers', 'operator', 'empty', 'view']);
  assert.ok(T.member.holds({ type: 'uml.CombinedFragment' }) && !T.member.holds({ type: 'uml.Lifeline' }));
  assert.deepEqual(T.member.edit({ id: 'f1-paid' }, ' paid '), { commands: [{ op: 'set', id: 'f1-paid', path: 'label', value: 'paid' }] });
});

// clean: what holds text never meets (heads, labels, tags, guards, uses), no label lies on a bar, no line runs through a head
function unclean(g, model) {
  const o = g.ta, v = V(model), F = new Map(v.fragments.map(f => [f.id, f])), bad = [];
  const meets = (a, b, k = .5) => a.x + k < b.x + b.w && b.x + k < a.x + a.w && a.y + k < b.y + b.h && b.y + k < a.y + a.h;
  const solid = [...o.heads.map(h => ['head ' + h.id, h]), ...o.lines.filter(l => l.lbl.w).map(l => ['label ' + l.id, l.lbl]), ...o.spans.map(s => ['use ' + s.id, s]),
    ...o.frames.flatMap(f => [['tag ' + f.id, { x: f.x, y: f.y, ...tagSize(F.get(f.id).props.operator) }],
      ...f.parts.map((p, k) => { const s = guardSize(F.get(f.id).members[k].label); return s.w ? ['guard ' + p.id, { x: p.gx, y: p.gy, ...s }] : null; }).filter(Boolean)])];
  solid.forEach(([a, p], i) => solid.slice(i + 1).forEach(([b, q]) => { if (meets(p, q)) bad.push(`${a} meets ${b}`); }));
  o.lines.forEach(l => o.bars.forEach(b => { if (l.lbl.w && meets(l.lbl, b)) bad.push(`label ${l.id} on a bar of ${b.head}`); }));
  o.lines.forEach(l => l.pts.slice(1).forEach((q, k) => { const p = l.pts[k], s = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]) || .01, h: Math.abs(q[1] - p[1]) || .01 };
    o.heads.forEach(h => { if (meets(s, { x: h.x + 1, y: h.y + 1, w: h.w - 2, h: h.h - 2 }, 0)) bad.push(`${l.id} through head ${h.id}`); }); }));
  return [...bad, ...g.problems.map(p => p.message)];
}

test('example 11 lays out clean: five heads, ten messages, two frames and a use; 3.1\'s bars; no problem', () => {
  const g = layout(SEQ, 'checkout-sequence');
  assert.deepEqual(unclean(g, SEQ), []);
  assert.deepEqual([g.map, g.nodes.filter(n => n.shape === 'lifeline').length, g.edges.length, g.ta.frames.map(f => f.id), g.ta.spans.map(s => s.id)], [false, 5, 10, ['f1', 'f2'], ['f3']]);
  assert.deepEqual(g.ta.bars.map(b => [b.head, b.depth]), [['lifeline-storefront', 1], ['lifeline-api', 1], ['lifeline-payments', 1], ['lifeline-api', 2]]);
  assert.equal(g.ta.heads.find(h => h.id === 'receipt').y > g.ta.heads.find(h => h.id === 'lifeline-api').y, true); // created by m6: lowered to its arrow
  // the ends each sort draws (src/typed/draw.js's table), the labels, and a slot per gap and per operand end
  assert.deepEqual(Object.fromEntries(g.edges.map(e => [e.id, [e.end.to, !!e.end.dashed]])), { m1: ['arrow', false], m2: ['arrow', false], m3: ['arrow', false], m4: ['arrow', false],
    m5: ['open', true], m6: ['open', true], m7: ['open', false], m8: ['open', true], m9: ['open', true], m10: ['open', true] });
  assert.deepEqual(g.edges.map(e => e.lbl.text), V(SEQ).edges.filter(e => e.type === 'uml.Message').map(e => e.label));
  assert.equal(g.slots.length, 17); // one per gap between occurrences and per operand end, and one at each end of the interaction
  assert.equal(g.byId.f1.shape, 'frame'); assert.equal(g.byId['f1-declined'].shape, 'operand'); assert.equal(g.byId.f3.shape, 'use');
});

test('reading order (S13): heads left to right, then each fragment before its first operand, each operand before what it holds, in time order', () => {
  assert.deepEqual(layout(SEQ, 'checkout-sequence').order, ['lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt', 'm1', 'm2', 'm3', 'm4', 'f1', 'f1-paid', 'm5', 'm6', 'f2', 'f2-notify', 'm7', 'f3', 'f1-declined', 'm8', 'm9', 'm10']);
  // an empty fragment, drawn at its parent's end, is read there
  const m = seq([M('a', 'A', 'B', 'call')], [FR('e', 'opt', null, 'e1')]);
  assert.deepEqual(layout(m, 'v').order, ['A', 'B', 'C', 'a', 'e', 'e1']);
});

test('accessible names (A1): heads, messages with their place and operand, fragments, operands, uses', () => {
  const g = layout(SEQ, 'checkout-sequence'), name = id => (g.byId[id] || g.edges.find(e => e.id === id)).aria;
  assert.equal(name('lifeline-api'), 'Lifeline api : ShopApi');
  assert.equal(name('lifeline-shopper'), 'Lifeline shopper : Shopper (actor)');
  assert.equal(name('m4'), 'Message 4 of 10: api to payments, charge(total), call');
  assert.equal(name('m5'), 'Message 5 of 10: payments to api, paid, reply, in alt, payment accepted');
  assert.equal(name('f1'), 'Combined fragment alt, 2 operands');
  assert.equal(name('f1-paid'), 'Operand payment accepted of alt, 3 occurrences');
  assert.equal(name('f3'), 'Interaction use Send receipt email, over api to receipt');
});

test('draw: outlines, stems, the use\'s box, the bars and a deleted lifeline\'s cross under the lines, in that order (§4.2)', () => {
  const m = seq([M('a', 'A', 'B', 'call'), M('d', 'A', 'B', 'delete'), { id: 'u', type: 'uml.InteractionUse', label: 'More', props: { covers: ['A', 'B'] } }], [], {});
  const { markup } = mapContext(m, {}).buildView('v'), pos = s => markup.indexOf(s);
  assert.ok(pos('class="seq-stem"') < pos('class="seq-use"') && pos('class="seq-use"') < pos('class="seq-bar"') && pos('class="seq-bar"') < pos('<g class="edges">'), markup.slice(0, 2000));
  assert.ok(pos('class="seq-bar"') < pos('class="seq-cross"') && pos('class="seq-cross"') < pos('<g class="edges">') && pos('class="seq-over"') < 0);
  assert.ok(pos('data-shape="lifeline"') > 0 && pos('data-shape="use"') > 0);
  const { markup: ex } = mapContext(SEQ, {}).buildView('checkout-sequence');
  assert.equal((ex.match(/class="frame-box"/g) || []).length, 3); // f1, f2 and the use's outline
  assert.equal((ex.match(/class="seq-bar"/g) || []).length, 4);
});

test('describe(): the view in words, in time order, nested as drawn', () => {
  const d = describeView(SEQ, 'checkout-sequence').split('\n');
  assert.equal(d[0], 'Checkout: a sequence diagram of 5 lifelines, 10 messages, 1 interaction use and 2 combined fragments.');
  assert.ok(d.includes('3. api calls itself: validate(order).'), d);
  assert.ok(d.includes('alt [payment accepted]:') && d.includes('  5. payments replies to api (answers 4): paid.') && d.includes('    7. api sends to storefront: orderPlaced.'), d);
  assert.ok(d.includes('  ref "Send receipt email" over api, payments, receipt.'), d);
  assert.equal(d[d.length - 1], '10. storefront replies to shopper (answers 1): confirmation page.');
});

test('the legend: each sort of message the view draws, in the order of the palette', () => {
  const g = layout(SEQ, 'checkout-sequence');
  assert.deepEqual(g.legend.map(h => /<b>([^<]+)<\/b>/.exec(h)[1]), ['Call', 'Async', 'Reply', 'Create']);
  assert.ok(g.legend[2].includes('stroke-dasharray'));
});

/* ---- validators: each rule with a passing fixture (example 11, and the small view below) and a failing one ---- */
const OK = seq([M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply', { props: { replyTo: 'c' } })]);
test('validators: example 11 and a call with its reply break no rule; validate() joins them', () => {
  assert.deepEqual(rules(SEQ), []);
  assert.deepEqual(rules(OK), []);
  assert.deepEqual(errors(SEQ), []);
  const m = structuredClone(SEQ); at(m, 'm5').parent = 'nowhere';
  assert.ok(validate(m).some(p => p.rule === 'parent-operand' && p.path === 'views[0].edges[4].parent'));
});
const FAILS = {
  'parent-operand': [seq([M('a', 'A', 'B', 'call', { parent: 'f1' })], [ALT('f1', 'o1', 'o2')]), ['a']],
  'parent-operand ': [seq([M('a', 'A', 'B', 'call', { parent: 'o1' })], [{ ...ALT('f1', 'o1'), parent: 'o1' }]), ['f1', 'o1']], // a fragment inside itself
  contiguous: [seq([M('a', 'A', 'B', 'async', { parent: 'o1' }), M('b', 'A', 'B', 'async'), M('c', 'A', 'B', 'async', { parent: 'o1' })], [FR('f1', 'opt', null, 'o1')]), ['f1', 'a', 'c']],
  'contiguous ': [seq([M('a', 'A', 'B', 'async', { parent: 'o2' }), M('b', 'A', 'B', 'async', { parent: 'o1' })], [ALT('f1', 'o1', 'o2')]), ['f1', 'a', 'b']], // operands out of members order
  'message-ends': [seq([M('a', 'A', 'Z', 'call')]), ['a', 'Z']],
  'reply-call': [seq([M('c', 'A', 'B', 'call'), M('r', 'C', 'A', 'reply', { props: { replyTo: 'c' } })]), ['r', 'c']],
  'reply-once': [seq([M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply', { props: { replyTo: 'c' } }), M('s', 'B', 'A', 'reply', { props: { replyTo: 'c' } })]), ['c', 'r', 's']],
  'create-once': [seq([M('a', 'A', 'C', 'async'), M('n', 'A', 'C', 'create')]), ['n', 'C', 'a']],
  'delete-once': [seq([M('d', 'A', 'C', 'delete'), M('a', 'A', 'C', 'async')]), ['d', 'C', 'a']],
  covers: [seq([{ id: 'u', type: 'uml.InteractionUse', label: 'u', props: { covers: ['A', 'C'] } }]), ['u', 'A', 'C']],
  'covers ': [seq([{ id: 'u', type: 'uml.InteractionUse', label: 'u', props: { covers: ['A', 'Q'] } }]), ['u', 'Q']],
};
const WARNS = {
  'reply-call': [seq([M('r', 'B', 'A', 'reply')]), ['r']],
  sort: [seq([M('a', 'A', 'B', 'shout')]), ['a']],
  covers: [seq([{ id: 'u', type: 'uml.InteractionUse', label: 'u' }]), ['u']],
  operator: [seq([M('a', 'A', 'B', 'async', { parent: 'o1' })], [FR('f1', 'neg', null, 'o1')]), ['f1']],
  'operator ': [seq([M('a', 'A', 'B', 'async', { parent: 'o1' })], [FR('f1', 'opt', null, 'o1', 'o2')]), ['f1']],
  empty: [seq([M('a', 'A', 'B', 'async', { parent: 'o1' })], [ALT('f1', 'o1', 'o2')]), ['o2', 'f1']],
  'empty ': [seq([M('a', 'A', 'B', 'async')], [FR('f1', 'loop', null, 'o1')]), ['f1']],
  view: [seq([M('a', 'A', 'B', 'async')], [], { layout: { A: [0, 0] } }), ['A']],
  'view ': [seq([M('a', 'A', 'B', 'async')], [], { direction: 'right' }), []],
};
for (const [k, [m, who]] of Object.entries(FAILS)) test(`validator ${k.trim()}: an error naming its rule and its elements`, () => {
  const p = sqProblems(m, V(m)).filter(x => x.rule === k.trim());
  assert.deepEqual(p.map(x => [x.level, x.ids]), [['error', who]], JSON.stringify(sqProblems(m, V(m))));
  assert.ok(p[0].message.startsWith(k.trim() + ': ') && p[0].path.startsWith('views[0]'));
  assert.ok(errors(m).some(x => x.rule === k.trim())); // and validate() says so
});
for (const [k, [m, who]] of Object.entries(WARNS)) test(`validator ${k.trim()}: a warning naming its rule and its elements`, () => {
  assert.deepEqual(sqProblems(m, V(m)).filter(x => x.rule === k.trim()).map(x => [x.level, x.ids]), [['warning', who]], JSON.stringify(sqProblems(m, V(m))));
});
test('every rule has a failing fixture above, and check.mjs reports the type\'s errors (spike risk 4.8)', () => {
  assert.deepEqual(Object.keys(SQ_RULES).filter(r => ![...Object.keys(FAILS), ...Object.keys(WARNS)].map(k => k.trim()).includes(r)), []);
  assert.deepEqual(check(FAILS.contiguous[0], 'uml.sequence'), ['views[0].fragments[0]: contiguous: fragment f1\'s occurrences (a, c) are not one run in edges']);
  assert.deepEqual(check(WARNS.empty[0], 'uml.sequence'), []); // a warning is not a target example's failure
});

/* ---- the gesture hooks (notes/stage-3.md §5.1, §5.2) ---- */
const LINE = sort => SEQ_TYPE.lines.find(l => l.props.sort === sort);
test('connect: a new message at the end with no slot (L from a lifeline), at a slot with its operand, a reply with its call, a self-message', () => {
  const c = sqConnect(SEQ, V(SEQ), 'lifeline-shopper', 'lifeline-storefront', null, LINE('async'));
  assert.deepEqual(c, [{ op: 'add', element: { id: 'm11', type: 'uml.Message', from: 'lifeline-shopper', to: 'lifeline-storefront', props: { sort: 'async' } }, view: 'checkout-sequence', index: 11, in: 'view' }]);
  assert.equal(V(run(SEQ, c)).edges[11].id, 'm11');
  // into the declined operand, just before m8, at its slot
  const r = sqConnect(SEQ, V(SEQ), 'lifeline-api', 'lifeline-payments', { index: 8, parent: 'f1-declined' }, LINE('async'));
  assert.deepEqual(r[0].element, { id: 'm11', type: 'uml.Message', from: 'lifeline-api', to: 'lifeline-payments', parent: 'f1-declined', props: { sort: 'async' } });
  assert.deepEqual(ids(V(run(SEQ, r)).edges).slice(7, 10), ['f3', 'm11', 'm8']);
  // a reply answers the latest call back along it that nothing answers
  const c2 = run(SEQ, sqConnect(SEQ, V(SEQ), 'lifeline-api', 'lifeline-payments', null, LINE('call'))), r2 = sqConnect(c2, V(c2), 'lifeline-payments', 'lifeline-api', null, LINE('reply'));
  assert.deepEqual(r2[0].element.props, { sort: 'reply', replyTo: 'm11' });
  const s = sqConnect(SEQ, V(SEQ), 'lifeline-api', 'lifeline-api', { index: 3, parent: null }, LINE('call'));
  assert.deepEqual(ids(V(run(SEQ, s)).edges).slice(2, 5), ['m3', 'm11', 'm4']);
});
test('connect refuses what breaks a rule, with the reason for the hint line: a create after the first message, a self-delete, an end off the view', () => {
  assert.match(sqConnect(SEQ, V(SEQ), 'lifeline-api', 'lifeline-payments', null, LINE('create')).error, /^create-once: /);
  assert.match(sqConnect(SEQ, V(SEQ), 'lifeline-api', 'lifeline-payments', { index: 2, parent: null }, LINE('delete')).error, /^delete-once: /);
  assert.match(sqConnect(SEQ, V(SEQ), 'lifeline-api', 'lifeline-api', null, LINE('delete')).error, /does not delete itself/);
  assert.match(sqConnect(SEQ, V(SEQ), 'lifeline-api', 'nobody', null, LINE('call')).error, /two lifelines/);
});
test('moveTo: a message to a slot across operands (E9) is a move then a reparent; one slot by Alt + Up/Down; nothing moves with it', () => {
  const c = sqMoveTo(SEQ, V(SEQ), 'm7', { index: 9, parent: 'f1-declined' });
  assert.deepEqual(c, [{ op: 'move', id: 'm7', view: 'checkout-sequence', index: 8 }, { op: 'reparent', id: 'm7', parent: 'f1-declined' }]);
  const m = run(SEQ, c);
  assert.deepEqual(ids(V(m).edges), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'f3', 'm8', 'm7', 'm9', 'm10']);
  // Alt + Down from m6 (the end of f1-paid's own messages): into f2's operand, first; Alt + Up back out
  const d = run(SEQ, sqMoveTo(SEQ, V(SEQ), 'm6', { by: [0, 1] }));
  assert.deepEqual([ids(V(d).edges).slice(4, 7), at(d, 'm6').parent], [['m5', 'm6', 'm7'], 'f2-notify']);
  const u = run(d, sqMoveTo(d, V(d), 'm6', { by: [0, -1] }));
  assert.equal(JSON.stringify(u), JSON.stringify(SEQ));
  // a reply moved above its call, or the first message moved up: refused, or nothing
  assert.match(sqMoveTo(SEQ, V(SEQ), 'm5', { index: 3, parent: null }).error, /^reply-call: /);
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'm1', { by: [0, -1] }), []);
  // the only content of a fragment: Alt + Down steps out past it and on to the end, never back into the empty fragment
  const walk = (m, id, dy) => { const seen = []; for (let k = 0; k < 30; k++) { const c = sqMoveTo(m, V(m), id, { by: [0, dy] }); if (!c.length) return [m, seen];
    m = run(m, c); const e = at(m, id); seen.push([V(m).edges.indexOf(e), e.parent ?? null]); } assert.fail(`${id} never reached the end: ${JSON.stringify(seen)}`); };
  const one = seq([M('a', 'A', 'B', 'async'), M('b', 'A', 'B', 'async', { parent: 'o' })], [FR('f', 'opt', null, 'o')]);
  assert.deepEqual(walk(one, 'b', 1)[1], [[1, null]]);
  const [end, down] = walk(SEQ, 'm7', 1);
  assert.deepEqual(down, [[6, 'f1-paid'], [7, 'f1-paid'], [7, 'f1-declined'], [8, 'f1-declined'], [8, null], [9, null], [10, null]]);
  assert.deepEqual(walk(end, 'm7', -1)[1].at(-1), [0, null]); // and all the way back up
  assert.equal(sqMoveTo(SEQ, V(SEQ), 'm1', { by: [1, 0] }), null); // sideways: not the type's
});
test('moveTo: a fragment moves with everything it holds, one move per occurrence in order, then a reparent; never into itself', () => {
  const c = sqMoveTo(SEQ, V(SEQ), 'f2', { by: [0, -1] }); // up one slot: above m6, still in f1-paid
  assert.deepEqual(c, [{ op: 'move', id: 'm7', view: 'checkout-sequence', index: 5 }]);
  assert.deepEqual(ids(V(run(SEQ, c)).edges).slice(4, 8), ['m5', 'm7', 'm6', 'f3']);
  const out = sqMoveTo(SEQ, V(SEQ), 'f2', { index: 10, parent: null }); // after m9, at the top level
  assert.deepEqual(out, [{ op: 'move', id: 'm7', view: 'checkout-sequence', index: 9 }, { op: 'reparent', id: 'f2', parent: null }]);
  assert.deepEqual(ids(V(run(SEQ, out)).edges).slice(7, 11), ['m8', 'm9', 'm7', 'm10']);
  const f1 = sqMoveTo(SEQ, V(SEQ), 'f1', { index: 10, parent: null }); // the alt after m9: five moves
  assert.deepEqual(f1.map(x => [x.id, x.index]), [['m5', 9], ['m6', 9], ['m7', 9], ['f3', 9], ['m8', 9]]);
  assert.deepEqual(ids(V(run(SEQ, f1)).edges), ['m1', 'm2', 'm3', 'm4', 'm9', 'm5', 'm6', 'm7', 'f3', 'm8', 'm10']);
  assert.match(sqMoveTo(SEQ, V(SEQ), 'f1', { index: 0, parent: null }).error, /^reply-call: /); // above the call its replies answer
  assert.match(sqMoveTo(SEQ, V(SEQ), 'f1', { index: 6, parent: 'f2-notify' }).error, /into itself/);
  assert.match(sqMoveTo(SEQ, V(SEQ), 'f1', { index: 6, parent: null }).error, /into itself/);
});
test('moveTo: a lifeline one place left or right (Alt + Left/Right), or to its place in nodeIds (a drag); never apart from what a use covers', () => {
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'lifeline-api', { by: [1, 0] }), [{ op: 'move', id: 'lifeline-api', view: 'checkout-sequence', index: 3 }]);
  assert.deepEqual(V(run(SEQ, sqMoveTo(SEQ, V(SEQ), 'lifeline-storefront', { by: [-1, 0] }))).nodeIds, ['lifeline-storefront', 'lifeline-shopper', 'lifeline-api', 'lifeline-payments', 'receipt']);
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'receipt', { by: [1, 0] }), []);
  assert.deepEqual(V(run(SEQ, sqMoveTo(SEQ, V(SEQ), 'lifeline-storefront', { index: 0 }))).nodeIds[0], 'lifeline-storefront');
  // f3 covers api, payments and receipt: a move that takes one of them away, or puts another between, is refused
  for (const [id, to] of [['lifeline-api', { by: [-1, 0] }], ['lifeline-api', { index: 0 }], ['lifeline-shopper', { index: 3 }]]) assert.match(sqMoveTo(SEQ, V(SEQ), id, to).error, /^covers: /, `${id} ${JSON.stringify(to)}`);
  assert.equal(sqMoveTo(SEQ, V(SEQ), 'lifeline-api', { by: [0, 1] }), null); // up or down: nothing (pins: false)
  // a head dropped (the canvas's slot and the drop's point): its place among the heads as laid out, never the slot's index
  const xs = layout(SEQ, 'checkout-sequence').nodes.filter(n => n.shape === 'lifeline').map(n => n.x + n.w / 2);
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'lifeline-shopper', { index: 4, y: 300, parent: null, pt: [(xs[1] + xs[2]) / 2, 60] }), [{ op: 'move', id: 'lifeline-shopper', view: 'checkout-sequence', index: 1 }]);
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'lifeline-shopper', { index: 4, y: 300, parent: null, pt: [xs[0] + 20, 60] }), []); // back where it was
  assert.equal(sqMoveTo(SEQ, V(SEQ), 'lifeline-storefront', { index: 0, y: 300, parent: null }), null); // a slot with no point: not a place in nodeIds
  // the canvas's col (the heads it draws left of the drop, in the host's font) wins over pt measured again here
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'lifeline-shopper', { index: 4, y: 300, parent: null, pt: [xs[0] + 20, 60], col: 1 }), [{ op: 'move', id: 'lifeline-shopper', view: 'checkout-sequence', index: 1 }]);
  assert.match(sqMoveTo(SEQ, V(SEQ), 'lifeline-shopper', { index: 4, y: 300, parent: null, pt: [xs[0] + 20, 60], col: 2 }).error, /^covers: /);
});
test('moveTo: an operand up or down among its fragment\'s (the member list), and what it holds moves with it; the member hook adds and renames', () => {
  const c = sqMoveTo(SEQ, V(SEQ), 'f1-declined', { by: [0, -1] });
  assert.deepEqual(c, [{ op: 'move', id: 'f1-declined', index: 0 }, { op: 'move', id: 'm8', view: 'checkout-sequence', index: 4 }]);
  const m = run(SEQ, c);
  assert.deepEqual([ids(V(m).edges), V(m).fragments[0].members.map(o => o.id)], [['m1', 'm2', 'm3', 'm4', 'm8', 'm5', 'm6', 'm7', 'f3', 'm9', 'm10'], ['f1-declined', 'f1-paid']]);
  assert.equal(JSON.stringify(run(m, sqMoveTo(m, V(m), 'f1-declined', { by: [0, 1] }))), JSON.stringify(SEQ)); // and back down
  assert.deepEqual(sqMoveTo(SEQ, V(SEQ), 'f2-notify', { by: [0, 1] }), []); // the only one
  const k = run(SEQ, [{ op: 'add', element: { id: 'f1-late', type: 'uml.InteractionOperand', ...SEQ_TYPE.member.add(' late ') }, owner: 'f1' }]);
  assert.deepEqual([V(k).fragments[0].members[2].label, rules(k, 'warning')], ['late', [['empty', ['f1-late', 'f1']]]]);
  assert.deepEqual(sqMoveTo(k, V(k), 'f1-late', { index: 0 }), [{ op: 'move', id: 'f1-late', index: 0 }]); // an empty operand moves alone
  assert.equal(sqMoveTo(SEQ, V(SEQ), 'f1-declined', { index: 0, y: 200, parent: null, pt: [300, 200] }), null); // an operand dropped: not a reorder
  assert.equal(SEQ_TYPE.member.print(V(SEQ).fragments[0].members[0]), 'payment accepted');
});
test('wrap: a run of one parent becomes a fragment\'s first operand (an alt gets an else); a run with a gap, two parents or no operator is refused', () => {
  const c = sqWrap(SEQ, V(SEQ), ['m9', 'm10'], 'loop');
  assert.deepEqual(c, [{ op: 'add', element: { id: 'f4', type: 'uml.CombinedFragment', props: { operator: 'loop' }, members: [{ id: 'f4.1', type: 'uml.InteractionOperand' }] }, view: 'checkout-sequence', in: 'view' },
    { op: 'reparent', id: 'm9', parent: 'f4.1' }, { op: 'reparent', id: 'm10', parent: 'f4.1' }]);
  assert.deepEqual(ids(V(run(SEQ, c)).fragments), ['f1', 'f2', 'f4']);
  const a = run(SEQ, sqWrap(SEQ, V(SEQ), ['m6', 'f2', 'f3'], 'alt')); // in f1-paid, round the opt
  assert.deepEqual([V(a).fragments[2].parent, V(a).fragments[2].members.map(o => o.label), V(a).fragments[1].parent, at(a, 'm6').parent], ['f1-paid', [undefined, 'else'], 'f4.1', 'f4.1']);
  assert.deepEqual(layout(a, 'checkout-sequence').problems, []);
  assert.match(sqWrap(SEQ, V(SEQ), ['m1', 'm3'], 'opt').error, /m2 lies between/);
  assert.match(sqWrap(SEQ, V(SEQ), ['m4', 'm5'], 'opt').error, /different operands/);
  assert.match(sqWrap(SEQ, V(SEQ), ['m1'], 'neg').error, /operator is one of/);
  assert.match(sqWrap(SEQ, V(SEQ), ['m6', 'm7'], 'opt').error, /different operands/);
});
test('add: a lifeline after the selected one (a model node), an interaction use at a slot covering every lifeline', () => {
  const l = sqAdd(SEQ, V(SEQ), { type: 'uml.Lifeline' }, 'audit', { after: 'lifeline-storefront' });
  assert.deepEqual(l, [{ op: 'add', element: { id: 'audit1', type: 'uml.Lifeline', label: 'audit' }, view: 'checkout-sequence', index: 2 }]);
  const m = run(SEQ, l);
  assert.deepEqual([V(m).nodeIds[2], m.nodes.length], ['audit1', 6]);
  // between two lifelines f3 covers: f3 covers it too
  const c = sqAdd(SEQ, V(SEQ), { type: 'uml.Lifeline' }, 'Api', { after: 'lifeline-api' });
  assert.deepEqual(c[1], { op: 'set', id: 'f3', path: 'props.covers', value: ['lifeline-api', 'api1', 'lifeline-payments', 'receipt'] });
  assert.deepEqual(V(run(SEQ, c)).nodeIds, ['lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'api1', 'lifeline-payments', 'receipt']);
  assert.equal(sqAdd(SEQ, V(SEQ), { type: 'uml.Lifeline' }, 'x', { after: 'receipt' }).length, 1); // after the last f3 covers: f3 stays
  assert.equal(sqAdd(SEQ, V(SEQ), { type: 'uml.Lifeline' }, null, null)[0].index, 5); // last
  const u = sqAdd(SEQ, V(SEQ), { type: 'uml.InteractionUse' }, 'Log in', { index: 1, parent: null });
  assert.deepEqual(u[0], { op: 'add', element: { id: 'ref1', type: 'uml.InteractionUse', label: 'Log in', props: { covers: ['lifeline-shopper', 'lifeline-storefront', 'lifeline-api', 'lifeline-payments', 'receipt'] } }, view: 'checkout-sequence', index: 1, in: 'view' });
  assert.deepEqual(ids(V(run(SEQ, u)).edges).slice(0, 3), ['m1', 'ref1', 'm2']);
  assert.equal(sqAdd(SEQ, V(SEQ), { type: 'uml.Message' }, 'x', null), null); // not the palette's
  // from the canvas: the selection (at.sel) places a lifeline after the selected one, and a use over the selected lifelines
  assert.equal(sqAdd(SEQ, V(SEQ), { type: 'uml.Lifeline' }, 'audit', { index: 11, y: 900, parent: null, sel: ['lifeline-storefront'] })[0].index, 2);
  assert.deepEqual(sqAdd(SEQ, V(SEQ), { type: 'uml.InteractionUse' }, 'Pay', { index: 11, parent: null, sel: ['lifeline-payments', 'lifeline-storefront'] })[0].element.props.covers, ['lifeline-storefront', 'lifeline-api', 'lifeline-payments']);
});
test('remove: Delete takes a lifeline out of the view with its messages and out of each covers; Shift + Delete deletes it; a message or a fragment is deleted', () => {
  const h = sqRemove(SEQ, V(SEQ), ['receipt'], false);
  assert.deepEqual(h, { commands: [{ op: 'set', id: 'f3', path: 'props.covers', value: ['lifeline-api', 'lifeline-payments'] }, { op: 'hide', id: 'receipt', view: 'checkout-sequence' }], say: 'Removed receipt from the view, and 1 message with it' });
  const m = run(SEQ, h);
  assert.deepEqual([V(m).nodeIds.includes('receipt'), !!at(m, 'm6'), m.nodes.length], [false, false, 5]);
  assert.deepEqual(sqRemove(SEQ, V(SEQ), ['receipt'], true), { commands: [{ op: 'delete', id: 'receipt' }], say: 'Deleted receipt, and 1 message with it' });
  assert.equal(sqRemove(SEQ, V(SEQ), ['lifeline-api'], false).say, 'Removed api from the view, and 8 messages with it');
  assert.deepEqual(ids(V(run(SEQ, sqRemove(SEQ, V(SEQ), ['m4'], false))).edges), ['m1', 'm2', 'm3', 'm6', 'm7', 'f3', 'm9', 'm10']); // a call takes its replies
  const u = run(SEQ, sqRemove(SEQ, V(SEQ), ['f2'], false)); // unwrap: m7 stays, in f1-paid
  assert.deepEqual([ids(V(u).fragments), at(u, 'm7').parent], [['f1'], 'f1-paid']);
});
test('remove: an operand\'s content moves to just after its fragment, then the operand goes (S6); the last operand takes its fragment', () => {
  const m = seq([M('a', 'A', 'B', 'async', { parent: 'o1' }), M('b', 'A', 'B', 'async', { parent: 'o1' }), M('c', 'B', 'C', 'async', { parent: 'o2' }), M('d', 'C', 'A', 'async')], [ALT('f', 'o1', 'o2')]);
  const c = sqRemove(m, V(m), ['o1'], false);
  assert.deepEqual(c, [{ op: 'move', id: 'a', view: 'v', index: 2 }, { op: 'move', id: 'b', view: 'v', index: 2 }, { op: 'delete', id: 'o1' }]);
  const n = run(m, c);
  assert.deepEqual([ids(V(n).edges), at(n, 'a').parent, V(n).fragments[0].members.map(o => o.id)], [['c', 'a', 'b', 'd'], undefined, ['o2']]);
  assert.deepEqual(sqRemove(n, V(n), ['o2'], false), [{ op: 'delete', id: 'f' }]);
  assert.deepEqual(sqRemove(m, V(m), ['o2'], true), [{ op: 'delete', id: 'o2' }]); // the last in order: its content is after the fragment already
  // every operand at once: the fragment goes, and what they held stays where it is, at the top level
  const both = run(m, sqRemove(m, V(m), ['o1', 'o2'], false));
  assert.deepEqual([V(both).fragments, ids(V(both).edges), V(both).edges.map(e => e.parent ?? null)], [[], ['a', 'b', 'c', 'd'], [null, null, null, null]]);
  // example 11's paid operand: its reply would then answer charge beside the declined one, outside the alt: refused
  assert.match(sqRemove(SEQ, V(SEQ), ['f1-paid'], false).error, /^reply-once: /);
});

/* ---- definition of done 6: a 30-step session through the hooks and apply(), undone, redone, and reopened midway ---- */
const STEPS = [
  m => sqAdd(m, V(m), { type: 'uml.Lifeline' }, 'audit', { after: 'lifeline-storefront' }),
  m => sqConnect(m, V(m), 'lifeline-api', 'audit1', null, LINE('call')),
  m => [{ op: 'set', id: 'm11', path: 'label', value: 'record(order)' }],
  m => sqConnect(m, V(m), 'audit1', 'lifeline-api', null, LINE('reply')),
  m => sqMoveTo(m, V(m), 'm3', { by: [0, 1] }),
  m => sqMoveTo(m, V(m), 'm3', { by: [0, -1] }),
  m => sqWrap(m, V(m), ['m11', 'm12'], 'opt'),
  m => [{ op: 'set', id: 'f4.1', path: 'label', value: 'audited' }],
  m => sqAdd(m, V(m), { type: 'uml.InteractionUse' }, 'Archive', null),
  m => [{ op: 'set', id: 'ref1', path: 'props.refersTo', value: 'archive' }],
  m => sqMoveTo(m, V(m), 'f2', { by: [0, -1] }),
  m => sqMoveTo(m, V(m), 'f2', { by: [0, 1] }),
  m => [{ op: 'set', id: 'm7', path: 'label', value: 'orderPlaced(id)' }],
  m => sqMoveTo(m, V(m), 'lifeline-api', { by: [1, 0] }),
  m => sqMoveTo(m, V(m), 'lifeline-api', { by: [-1, 0] }),
  m => sqRemove(m, V(m), ['ref1'], false),
  m => sqConnect(m, V(m), 'lifeline-shopper', 'lifeline-storefront', null, LINE('async')),
  m => sqRemove(m, V(m), ['m13'], false),
  m => sqWrap(m, V(m), ['m7'], 'loop'),
  m => sqRemove(m, V(m), ['f5'], false),
  m => sqAdd(m, V(m), { type: 'uml.Lifeline' }, 'cache', null),
  m => sqConnect(m, V(m), 'lifeline-api', 'cache1', null, LINE('create')),
  m => sqRemove(m, V(m), ['cache1'], false),
  m => sqMoveTo(m, V(m), 'm6', { by: [0, 1] }),
  m => [{ op: 'set', id: 'f1-declined', path: 'label', value: 'payment declined' }],
  m => sqConnect(m, V(m), 'lifeline-storefront', 'lifeline-storefront', null, LINE('call')),
  m => sqRemove(m, V(m), ['audit1'], true),
  m => [{ op: 'set', view: 'checkout-sequence', path: 'title', value: 'Checkout, edited' }],
  m => sqMoveTo(m, V(m), 'm1', { by: [0, 1] }),
  m => sqMoveTo(m, V(m), 'm1', { by: [0, -1] }),
];
test('a 30-step session through the hooks: each step a transaction that adds no error; undone, redone and reopened, byte-identical', () => {
  assert.equal(STEPS.length, 30);
  const h = history(SEQ), seen = [JSON.stringify(SEQ)];
  STEPS.forEach((step, k) => { const c = cmdsOf(step(h.model)); assert.ok(Array.isArray(c) && c.length, `step ${k + 1}: ${JSON.stringify(c)}`);
    h.push(run(h.model, c)); seen.push(JSON.stringify(h.model)); });
  const end = seen[30];
  assert.notEqual(end, seen[0]);
  for (let k = 29; k >= 0; k--) assert.equal(JSON.stringify(h.undo()), seen[k], `undo to ${k}`);
  for (let k = 1; k <= 30; k++) assert.equal(JSON.stringify(h.redo()), seen[k], `redo to ${k}`);
  // saved as JSON after step 15, reopened, and the rest of the session run on what was read
  let m = JSON.parse(seen[15]);
  STEPS.slice(15).forEach(step => { m = apply(m, cmdsOf(step(m))); });
  assert.equal(JSON.stringify(m), end);
  // deleting audit took its messages, so the opt round them is empty: a warning, drawn at the end, and no error
  assert.deepEqual([errors(m), layout(m, 'checkout-sequence').problems.map(p => [p.level, p.ids])], [[], [['warning', ['f4']]]]);
});

/* ---- P1: a stress view (20 lifelines, 200 messages, 10 nested fragments) laid out and drawn as SVG markup under 100 ms ---- */
function stress() {
  const L = Array.from({ length: 20 }, (_, i) => `L${i}`), edges = [], frags = [];
  for (let k = 0; k < 10; k++) frags.push(FR(`f${k}`, k % 2 ? 'opt' : 'loop', k ? `o${k - 1}` : null, `o${k}`));
  const parent = i => { let p = null; for (let k = 0; k < 10; k++) if (i >= 50 + 5 * k && i < 150 - 5 * k) p = `o${k}`; return p; };
  for (let i = 0; i < 200; i += 2) { const a = L[i % 20], b = L[(i * 7 + 3) % 20] === a ? L[(i + 1) % 20] : L[(i * 7 + 3) % 20];
    edges.push(M(`m${i}`, a, b, 'call', parent(i) ? { parent: parent(i) } : {}), M(`m${i + 1}`, b, a, 'reply', { ...(parent(i + 1) ? { parent: parent(i + 1) } : {}), props: { replyTo: `m${i}` } })); }
  return { schemaVersion: 2, nodes: L.map(id => ({ id, type: 'uml.Lifeline', label: id, props: { represents: 'Service' } })), edges: [],
    views: [{ id: 'all', diagram: 'uml.sequence', nodeIds: L, edges, fragments: frags }] };
}
test('P1: a stress view of 20 lifelines, 200 messages and 10 nested fragments lays out and draws as SVG markup in under 100 ms (best of three) (timed)', () => {
  const m = stress();
  assert.deepEqual(sqProblems(m, V(m)).filter(p => p.level === 'error'), []);
  const best = Math.min(...[0, 1, 2].map(() => { const t = performance.now(); mapContext(m, {}).buildView('all'); return performance.now() - t; }));
  const g = layout(m, 'all');
  assert.deepEqual([g.edges.length, g.ta.frames.length, g.problems], [200, 10, []]);
  assert.ok(best < 100, `${best.toFixed(1)} ms`);
});

test('a lifeline listed twice in nodeIds is one head, drawn once (audit 1)', () => {
  const m = structuredClone(SEQ), v = V(m), id = v.nodeIds[0]; v.nodeIds.push(id);
  assert.deepEqual(layout(m, v.id).nodes.map(n => n.id), layout(SEQ, v.id).nodes.map(n => n.id));
});

test('wrap picks a fragment id whose operand ids are free too: another fragment\'s operand f1.1 makes it f2 (audit 1)', () => {
  const Mg = (id, parent) => ({ id, type: 'uml.Message', from: 'A', to: 'B', label: id, ...(parent ? { parent } : {}), props: { sort: 'async' } });
  const m = { schemaVersion: 2, nodes: ['A', 'B'].map(id => ({ id, type: 'uml.Lifeline', label: id })), edges: [],
    views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: ['A', 'B'], edges: [Mg('m0'), Mg('m1', 'f1.1')],
      fragments: [{ id: 'g', type: 'uml.CombinedFragment', props: { operator: 'opt' }, members: [{ id: 'f1.1', type: 'uml.InteractionOperand', label: 'x' }] }] }] };
  const r = sqWrap(m, 'v', ['m0'], 'alt');
  assert.ok(Array.isArray(r), JSON.stringify(r));
  assert.deepEqual(r[0].element.members.map(o => o.id), ['f2.1', 'f2.2']);
});
