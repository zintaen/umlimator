// Interaction semantics (work package 3.1, notes/stage-3.md §11): the occurrence walk, activations by the five rules
// (notes/spike-sequence.md §2.3), message numbers (S8), reply matching (§5.2) and the shared validators (§4.3, §6.4).
// Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interactionWalk, activationBars, messageNumbers, replyCallFor, INTERACTION_RULES, interactionProblems } from '../src/uml/interaction.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const SEQ = read('../examples/checkout-sequence.json'), COM = read('../examples/checkout-communication.json');
const copy = x => JSON.parse(JSON.stringify(x));

// a sequence model of lifelines A to E with the given occurrences and fragments
const M = (id, from, to, sort, more = {}) => ({ id, type: 'uml.Message', from, to, label: id, ...(more.parent ? { parent: more.parent } : {}),
  props: { ...(sort === undefined ? {} : { sort }), ...(more.replyTo ? { replyTo: more.replyTo } : {}) } });
const ALT = (id, ...ops) => ({ id, type: 'uml.CombinedFragment', props: { operator: id.split('-')[0] }, members: ops.map(o => ({ id: o, type: 'uml.InteractionOperand', label: o })) });
const seq = (edges, fragments = []) => ({ schemaVersion: 2, nodes: 'ABCDE'.split('').map(id => ({ id, type: 'uml.Lifeline', label: id })), edges: [],
  views: [{ id: 'v', diagram: 'uml.sequence', nodeIds: 'ABCDE'.split(''), edges, fragments }] });
const on = (f, m, ...a) => f(m, m.views[0], ...a);
const bars = m => on(activationBars, m).map(b => [b.head, b.from, b.to, b.depth]);

test('the walk: example 11\'s occurrences in time order, with their operands; example 12\'s messages, past its connectors', () => {
  const w = on(interactionWalk, SEQ);
  assert.deepEqual(w.occ.map(o => o.id), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'f3', 'm8', 'm9', 'm10']);
  assert.deepEqual(w.occ.map(o => o.r), w.occ.map(o => o.i));
  assert.deepEqual(w.occ.filter(o => !o.message).map(o => [o.id, o.sort, o.parent]), [['f3', null, 'f1-paid']]);
  assert.deepEqual(w.occ.map(o => o.parent), [null, null, null, null, 'f1-paid', 'f1-paid', 'f2-notify', 'f1-paid', 'f1-declined', null, null]);
  assert.equal(w.occ[4].path, 'views[0].edges[4]');
  assert.deepEqual([...w.ops.keys()], ['f1-paid', 'f1-declined', 'f2-notify']);
  assert.equal(w.ops.get('f2-notify').fragment.parent, 'f1-paid');
  const c = on(interactionWalk, COM);
  assert.deepEqual(c.occ.map(o => o.id), ['cm1', 'cm2', 'cm3', 'cm4', 'cm5', 'cm6', 'cm7', 'cm8', 'cm9']);
  assert.deepEqual(c.occ.map(o => [o.i, o.path]).slice(0, 2), [[5, 'edges[5]'], [6, 'edges[6]']]);
  assert.deepEqual(on(interactionWalk, { views: [{}] }), { occ: [], ops: new Map() }); // a view with nothing in it
});

test('example 11 gives exactly its bars: storefront m1 to m10; api m2 to m9; api m3 at depth 2, one short step; payments m4 to m8, across the divider', () => {
  assert.deepEqual(bars(SEQ), [['lifeline-storefront', 'm1', 'm10', 1], ['lifeline-api', 'm2', 'm9', 1], ['lifeline-api', 'm3', 'm3', 2], ['lifeline-payments', 'm4', 'm8', 1]]);
});

test('rule 1: a call opens an activation on its receiver at its own row, never on its caller; a self-call on itself', () => {
  assert.deepEqual(bars(seq([M('a', 'A', 'B', 'async'), M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply', { replyTo: 'c' })])), [['B', 'c', 'r', 1]]);
  assert.deepEqual(bars(seq([M('s', 'A', 'A', 'call')])), [['A', 's', 's', 1]]);
});

test('rule 2: an activation closes at the last reply naming its call, across the operands of an alt; without replyTo the reply closes nothing', () => {
  const alt = [ALT('alt-1', 'o1', 'o2')];
  assert.deepEqual(bars(seq([M('c', 'A', 'B', 'call'), M('r1', 'B', 'A', 'reply', { replyTo: 'c', parent: 'o1' }), M('r2', 'B', 'A', 'reply', { replyTo: 'c', parent: 'o2' })], alt)), [['B', 'c', 'r2', 1]]);
  // the reply names its call: the bar ends there though B sends later; unnamed, rule 3 runs it to B's last message
  assert.deepEqual(bars(seq([M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply', { replyTo: 'c' }), M('n', 'B', 'C', 'async')])), [['B', 'c', 'r', 1]]);
  assert.deepEqual(bars(seq([M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply'), M('n', 'B', 'C', 'async')])), [['B', 'c', 'n', 1]]);
  // a reply before its call closes nothing
  assert.deepEqual(bars(seq([M('r', 'B', 'A', 'reply', { replyTo: 'c' }), M('c', 'A', 'B', 'call')])), [['B', 'c', 'c', 1]]);
});

test('rule 3: with no reply, a self-call returns at once, and any other call when its caller next sends, after the receiver\'s own last message before that', () => {
  // c: A next sends f; B's last message before f is e (to B), not g (after f)
  const m = seq([M('c', 'A', 'B', 'call'), M('d', 'B', 'C', 'call'), M('e', 'C', 'B', 'reply', { replyTo: 'd' }), M('f', 'A', 'D', 'async'), M('g', 'B', 'A', 'async')]);
  assert.deepEqual(bars(m), [['B', 'c', 'e', 1], ['C', 'd', 'e', 1]]);
  // nothing from B before A sends again: one short step
  assert.deepEqual(bars(seq([M('c', 'A', 'B', 'call'), M('f', 'A', 'C', 'async'), M('g', 'B', 'A', 'async')])), [['B', 'c', 'c', 1]]);
  // not a call stack: example 11's validate(order) holds nothing, so charge(total) is sent from place(order)'s bar ...
  assert.equal(on(messageNumbers, SEQ).get('m4'), '1.1.2');
  // ... and a self-call with a reply holds what comes before its reply
  assert.deepEqual(bars(seq([M('s', 'A', 'A', 'call'), M('t', 'A', 'B', 'async'), M('u', 'A', 'A', 'reply', { replyTo: 's' })])), [['A', 's', 'u', 1]]);
});

test('rule 4: async, create and delete open no activation, nor does a reply; a call in their place does', () => {
  const m = seq([M('a', 'A', 'B', 'async'), M('n', 'A', 'C', 'create'), M('x', 'A', 'C', 'delete'), M('r', 'B', 'A', 'reply', { replyTo: 'a' })]);
  assert.deepEqual(bars(m), []);
  m.views[0].edges[0].props.sort = 'call';
  assert.deepEqual(bars(m), [['B', 'a', 'r', 1]]);
});

test('rule 5: an activation inside another of its lifeline is one level deeper (a re-entrant call); bars one after another are not', () => {
  const m = seq([M('c0', 'C', 'A', 'call'), M('c1', 'A', 'B', 'call'), M('c2', 'B', 'A', 'call'), M('r2', 'A', 'B', 'reply', { replyTo: 'c2' }),
    M('r1', 'B', 'A', 'reply', { replyTo: 'c1' }), M('r0', 'A', 'C', 'reply', { replyTo: 'c0' })]);
  assert.deepEqual(bars(m), [['A', 'c0', 'r0', 1], ['B', 'c1', 'r1', 1], ['A', 'c2', 'r2', 2]]);
  assert.deepEqual(bars(seq([M('c1', 'A', 'B', 'call'), M('r1', 'B', 'A', 'reply', { replyTo: 'c1' }), M('c2', 'A', 'B', 'call'), M('r2', 'B', 'A', 'reply', { replyTo: 'c2' })])),
    [['B', 'c1', 'r1', 1], ['B', 'c2', 'r2', 1]]);
  // a bar that opens on the row another closes on (rule 3, on an incoming call) only touches it; a self-call there nests
  assert.deepEqual(bars(seq([M('c', 'A', 'B', 'call'), M('d', 'C', 'B', 'call'), M('y', 'A', 'D', 'async'), M('r', 'B', 'C', 'reply', { replyTo: 'd' })])),
    [['B', 'c', 'd', 1], ['B', 'd', 'r', 1]]);
  assert.deepEqual(bars(seq([M('c', 'A', 'B', 'call'), M('s', 'B', 'B', 'call'), M('y', 'A', 'D', 'async')])), [['B', 'c', 's', 1], ['B', 's', 's', 2]]);
});

test('message numbers (S8): example 12 gives §6.3\'s table, replies included', () => {
  assert.deepEqual(Object.fromEntries(on(messageNumbers, COM)),
    { cm1: '1', cm2: '1.1', cm3: '1.1.1', cm4: '1.1.2', cm5: '1.1.2.1', cm6: '1.1.3', cm7: '1.1.4', cm8: '1.1.5', cm9: '1.2' });
  // an interaction use has no number, and both replies of an alt take their place in the activation they are sent from
  const n = on(messageNumbers, SEQ);
  assert.equal(n.has('f3'), false);
  assert.deepEqual([n.get('m5'), n.get('m8'), n.get('m10')], ['1.1.2.1', '1.1.2.2', '1.2']);
  // a self-call's reply is sent from the self-call's own activation; the self-call from the one around it
  assert.deepEqual(Object.fromEntries(on(messageNumbers, seq([M('s', 'A', 'A', 'call'), M('u', 'A', 'A', 'reply', { replyTo: 's' }), M('t', 'A', 'B', 'async')]))), { s: '1', u: '1.1', t: '2' });
});

test('reply matching (§5.2): the latest unanswered call from the reply\'s receiver to its sender; a call answered only in another operand of an alt is unanswered', () => {
  // f1-paid already answers m4 (m5); f1-declined does too (m8), and without m8 it does not
  assert.equal(on(replyCallFor, SEQ, 'lifeline-payments', 'lifeline-api', { index: 4, parent: 'f1-paid' }), null);
  assert.equal(on(replyCallFor, SEQ, 'lifeline-payments', 'lifeline-api', { index: 9, parent: 'f1-declined' }), null);
  const noM8 = copy(SEQ); noM8.views[0].edges.splice(8, 1);
  assert.equal(on(replyCallFor, noM8, 'lifeline-payments', 'lifeline-api', { index: 8, parent: 'f1-declined' }), 'm4');
  assert.equal(on(replyCallFor, noM8, 'lifeline-payments', 'lifeline-api', { index: 8, parent: null }), null, 'after the alt, m5 answers it');
  // at the end (no slot): m2 is answered by m9; without m9 it is the one
  assert.equal(on(replyCallFor, SEQ, 'lifeline-api', 'lifeline-storefront'), null);
  const noM9 = copy(SEQ); noM9.views[0].edges.splice(9, 1);
  assert.equal(on(replyCallFor, noM9, 'lifeline-api', 'lifeline-storefront'), 'm2');
  // the latest of two, the earlier once the latest is answered, and only calls before the slot
  const two = seq([M('c1', 'A', 'B', 'call'), M('c2', 'A', 'B', 'call')]);
  assert.equal(on(replyCallFor, two, 'B', 'A'), 'c2');
  assert.equal(on(replyCallFor, two, 'B', 'A', { index: 1, parent: null }), 'c1');
  assert.equal(on(replyCallFor, two, 'A', 'B'), null, 'it goes back along the call');
  two.views[0].edges.push(M('r2', 'B', 'A', 'reply', { replyTo: 'c2' }));
  assert.equal(on(replyCallFor, two, 'B', 'A'), 'c1');
  // a reply placed before a call answers nothing (reply-call rejects it, and it closes no bar)
  assert.equal(on(replyCallFor, seq([M('r', 'B', 'A', 'reply', { replyTo: 'c' }), M('c', 'A', 'B', 'call')]), 'B', 'A'), 'c');
  // a call made in one operand of an alt is not answered from another
  const alt = seq([M('c', 'A', 'B', 'call', { parent: 'o1' })], [ALT('alt-1', 'o1', 'o2')]);
  assert.equal(on(replyCallFor, alt, 'B', 'A', { index: 1, parent: 'o2' }), null);
  assert.equal(on(replyCallFor, alt, 'B', 'A', { index: 1, parent: null }), 'c');
});

// ---- the shared validators: the examples pass; each rule fails on a model that breaks it, naming its rule and elements
const one = (m, rule, ids, level = 'error') => {
  const got = on(interactionProblems, m);
  assert.equal(got.length, 1, `${rule}: ${JSON.stringify(got)}`);
  const [p] = got;
  assert.deepEqual([p.rule, p.level], [rule, level]); assert.match(p.message, new RegExp('^' + rule + ': '));
  assert.deepEqual(p.ids, ids); assert.ok(p.path.startsWith('views[0].edges['), p.path);
  return p;
};

test('validators: examples 11 and 12 break no rule', () => {
  assert.deepEqual(on(interactionProblems, SEQ), []);
  assert.deepEqual(on(interactionProblems, COM), []);
  assert.deepEqual(Object.keys(INTERACTION_RULES).sort(), ['create-once', 'delete-once', 'reply-call', 'reply-once', 'sort']);
});

test('reply-call: a reply names an earlier call and goes back along it; with no replyTo, a warning', () => {
  const ok = [M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply', { replyTo: 'c' })];
  assert.deepEqual(on(interactionProblems, seq(ok)), []);
  one(seq([M('r', 'B', 'A', 'reply', { replyTo: 'c' }), M('c', 'A', 'B', 'call')]), 'reply-call', ['r', 'c']); // a later call
  one(seq([M('c', 'A', 'B', 'async'), M('r', 'B', 'A', 'reply', { replyTo: 'c' })]), 'reply-call', ['r', 'c']); // not a call
  assert.equal(one(seq([M('r', 'B', 'A', 'reply', { replyTo: 'zz' })]), 'reply-call', ['r']).path, 'views[0].edges[0].props.replyTo'); // nothing
  one(seq([M('c', 'A', 'B', 'call'), M('r', 'B', 'C', 'reply', { replyTo: 'c' })]), 'reply-call', ['r', 'c']); // not back along it
  one(seq([M('c', 'A', 'B', 'call'), M('r', 'B', 'A', 'reply')]), 'reply-call', ['r'], 'warning');
});

test('reply-once: two replies to one call lie in different operands of one alt, not of a par, nor one operand', () => {
  const r = (id, parent) => M(id, 'B', 'A', 'reply', { replyTo: 'c', parent });
  assert.deepEqual(on(interactionProblems, seq([M('c', 'A', 'B', 'call'), r('r1', 'o1'), r('r2', 'o2')], [ALT('alt-1', 'o1', 'o2')])), []);
  one(seq([M('c', 'A', 'B', 'call'), r('r1', 'o1'), r('r2', 'o2')], [ALT('par-1', 'o1', 'o2')]), 'reply-once', ['c', 'r1', 'r2']);
  one(seq([M('c', 'A', 'B', 'call'), r('r1', 'o1'), r('r2', 'o1')], [ALT('alt-1', 'o1', 'o2')]), 'reply-once', ['c', 'r1', 'r2']);
  one(seq([M('c', 'A', 'B', 'call'), r('r1', 'o1'), r('r2')], [ALT('alt-1', 'o1', 'o2')]), 'reply-once', ['c', 'r1', 'r2']);
  // replies to what is not an earlier call answer nothing: reply-call says so, once each, and reply-once is silent
  for (const c of [M('c', 'A', 'B', 'async'), M('c', 'A', 'B', 'reply')]) assert.deepEqual(on(interactionProblems, seq([c, r('r1'), r('r2')])).filter(p => p.level === 'error').map(p => [p.rule, p.ids]), [['reply-call', ['r1', 'c']], ['reply-call', ['r2', 'c']]]);
  assert.deepEqual(on(interactionProblems, seq([r('r1'), r('r2'), M('c', 'A', 'B', 'call')])).map(p => p.rule), ['reply-call', 'reply-call']);
  // a communication view has no operands: one reply to a call
  const m = copy(COM); m.edges.push({ ...m.edges.find(e => e.id === 'cm5'), id: 'cm5b' }); m.views[0].edges.push('cm5b');
  const [p] = on(interactionProblems, m);
  assert.deepEqual([p.rule, p.ids, p.path], ['reply-once', ['cm4', 'cm5', 'cm5b'], `edges[${m.edges.length - 1}].props.replyTo`]);
});

test('create-once: a lifeline is created at most once, by the first message to or from it', () => {
  assert.deepEqual(on(interactionProblems, seq([M('a', 'A', 'B', 'async'), M('n', 'A', 'C', 'create'), M('x', 'C', 'A', 'async')])), []);
  one(seq([M('a', 'A', 'C', 'async'), M('n', 'A', 'C', 'create')]), 'create-once', ['n', 'C', 'a']);
  one(seq([M('a', 'C', 'B', 'async'), M('n', 'A', 'C', 'create')]), 'create-once', ['n', 'C', 'a']);
  assert.match(one(seq([M('n1', 'A', 'C', 'create'), M('n2', 'B', 'C', 'create')]), 'create-once', ['n2', 'C', 'n1']).message, /created twice/);
});

test('delete-once: a lifeline is deleted at most once, by the last message to or from it', () => {
  assert.deepEqual(on(interactionProblems, seq([M('a', 'A', 'C', 'async'), M('x', 'A', 'C', 'delete'), M('b', 'A', 'B', 'async')])), []);
  one(seq([M('x', 'A', 'C', 'delete'), M('a', 'C', 'B', 'async')]), 'delete-once', ['x', 'C', 'a']);
  assert.match(one(seq([M('x1', 'A', 'C', 'delete'), M('x2', 'B', 'C', 'delete')]), 'delete-once', ['x1', 'C', 'x2']).message, /deleted twice/);
});

test('sort: a sort other than the five, or none, is a warning, and the message is read as a call', () => {
  const m = seq([M('s', 'A', 'B', 'signal'), M('u', 'A', 'C')]);
  const got = on(interactionProblems, m);
  assert.deepEqual(got.map(p => [p.rule, p.level, p.ids, p.path]), [['sort', 'warning', ['s'], 'views[0].edges[0].props.sort'], ['sort', 'warning', ['u'], 'views[0].edges[1].props.sort']]);
  assert.deepEqual(bars(m), [['B', 's', 's', 1], ['C', 'u', 'u', 1]]);
  for (const s of ['call', 'async', 'reply', 'create', 'delete']) assert.ok(!on(interactionProblems, seq([M('s', 'A', 'B', s)])).some(p => p.rule === 'sort'), s);
});

test('a malformed view reads without throwing: unknown entries, a message with no id or ends, a cycle of operands, ids that are Object\'s names', () => {
  const m = seq([null, 7, 'nothing', { type: 'uml.Message' }, M('constructor', 'A', 'B', 'call', { parent: 'o1' }), M('toString', 'B', 'A', 'reply', { replyTo: 'constructor', parent: 'o2' })],
    [{ ...ALT('alt-1', 'o1'), parent: 'o2' }, { ...ALT('alt-2', 'o2'), parent: 'o1' }]);
  assert.deepEqual(on(interactionWalk, m).occ.map(o => o.id), ['constructor', 'toString']);
  assert.deepEqual(bars(m), [['B', 'constructor', 'toString', 1]]);
  assert.ok(Array.isArray(on(interactionProblems, m)));
  assert.equal(on(replyCallFor, m, 'B', 'A', { index: 9, parent: 'o1' }), null);
});
