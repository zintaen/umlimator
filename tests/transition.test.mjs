// The transition micro-syntax (work package 4.2, notes/stage-4.md §7): parseTransition and printTransition on §7's
// examples, every transition and guard of the target examples, 500 generated parts and 500 generated texts each way, the
// refusals, and linear time. Imports src/ to reach the internals; lib/umlimator-all.js holds the same code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTransition as parse, printTransition as print, transitionText } from '../src/uml/transition.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const P = (trigger, guard, effect) => ({ trigger, guard, effect });

test('§7.1\'s forms: brackets and parentheses in triggers and guards, a / in a guard, lists and spaces in triggers', () => {
  const cases = [
    ['capture failed [attempts < 3] / count the attempt', P('capture failed', 'attempts < 3', 'count the attempt')],
    ['evt(a/b)', P('evt(a/b)')], ['pay(amount[0])', P('pay(amount[0])')], ['[a[0] > 1]', P(undefined, 'a[0] > 1')],
    ['go [max(a, b[1]) > 2] / log(x)', P('go', 'max(a, b[1]) > 2', 'log(x)')], ['tick [x / y > 1]', P('tick', 'x / y > 1')],
    ['after 30 days / erase', P('after 30 days', undefined, 'erase')], ['a, b, c', P('a, b, c')], ['[else]', P(undefined, 'else')],
    ['/ go', P(undefined, undefined, 'go')], ['  a  [ g ]  /  e  ', P('a', 'g', 'e')], ['', P()], ['   ', P()],
    ['a [] /', P('a')], ['a / b [c] / d', P('a', undefined, 'b [c] / d')], ['a [g]/e', P('a', 'g', 'e')],
    ['a / x ( [ ]', P('a', undefined, 'x ( [ ]')], // the effect is any text
  ];
  for (const [text, want] of cases) assert.deepEqual(parse(text), want, text);
  assert.equal(print(P('capture failed', 'attempts < 3', 'count the attempt')), 'capture failed [attempts < 3] / count the attempt');
  assert.equal(print(P(undefined, 'else')), '[else]');
  assert.equal(print(P(undefined, undefined, 'go')), '/ go');
  assert.equal(print(P()), '');
  assert.equal(print(P(' a ', '', null)), 'a'); // trimmed, an empty part absent
});

test('refused, with { error } and nothing else: unbalanced or crossed brackets, a second guard, text after the guard, over 4,096 characters', () => {
  const refused = { 'a [g': /\[ it opens is not closed/, 'a ]': /\] at 3 closes nothing/, 'f(x': /\( it opens is not closed/, 'f)': /\) at 2 closes nothing/,
    'a [(]': /\] at 5 meets an open \(/, 'f(x] [g]': /\] at 4 meets an open \(/, 'a [g] [h]': /second guard/, 'a [g] [h] / e': /second guard/,
    'a [g] b / e': /"b" after the guard/, 'a [g] ]': /"\]" after the guard/, [`a${' '.repeat(4096)}`]: /over 4096 characters/ };
  for (const [text, why] of Object.entries(refused)) { const r = parse(text);
    assert.deepEqual(Object.keys(r), ['error'], text); assert.match(r.error, /^a transition is trigger \[guard\] \/ effect: /); assert.match(r.error, why, text); }
  assert.ok(!parse('a'.repeat(4096)).error, '4,096 characters read');
  assert.match(parse('a [', 'a flow is name [guard]').error, /^a flow is name \[guard\]: /, 'the form the error names');
});

test('not printable (§7.1): parts a host wrote that would read back otherwise give null, and are drawn joined by spaces', () => {
  for (const p of [P('a [x]'), P('a / b'), P('a]'), P(undefined, 'g]'), P(undefined, 'a [b'), P('f(x'), P('a', 'b', 'c'.repeat(4100))]) {
    assert.equal(print(p), null, JSON.stringify(p).slice(0, 80)); }
  assert.equal(transitionText(P('a / b', 'g')), 'a / b [g]');
  assert.equal(print(P('evt(a/b)', 'x[0] > (1)', 'a [ / b')), 'evt(a/b) [x[0] > (1)] / a [ / b', 'brackets and / nested in a trigger and a guard print');
});

test('every transition, internal transition and guard of the target examples 09, 10 and 13 prints and reads back; print(parse(x)) is stable on each', () => {
  let n = 0;
  for (const f of ['09-activity', '10-state-machine', '13-interaction-overview']) { const m = read(`../docs/diagrams/examples/${f}.json`);
    const parts = [...m.edges, ...m.nodes.flatMap(x => x.members || [])].map(x => x.props || {}).filter(p => ['trigger', 'guard', 'effect'].some(k => k in p));
    for (const p of parts) { const want = P(p.trigger, p.guard, p.effect), t = print(want);
      assert.notEqual(t, null, JSON.stringify(p)); assert.deepEqual(parse(t), want, t); assert.equal(print(parse(t)), t, t); n++; } }
  assert.ok(n >= 20, `${n} texts`);
});

// a seeded generator (mulberry32), so a failure names its case
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = rng(42), pick = a => a[Math.floor(R() * a.length)], words = ['a', 'pay', 'x', 'after 30 days', 'n', '<', '>=', '1', 'ok', '−', 'é', ',', '.', '=', '&&'];
const word = () => pick(words);
// a balanced run that may hold / at any depth, [ and ( nested (a guard's content, or what a trigger holds inside brackets)
const nested = d => Array.from({ length: 1 + Math.floor(R() * 3) }, () => { const r = R();
  return d < 3 && r < .25 ? `(${nested(d + 1)})` : d < 3 && r < .45 ? `[${nested(d + 1)}]` : r < .55 ? ' / ' : word(); }).join(' ');
// a trigger: words and calls whose brackets may hold [ and /, never a [ or / outside them
const trigger = () => Array.from({ length: 1 + Math.floor(R() * 3) }, () => (R() < .4 ? `${word()}(${nested(1)})` : word())).join(' ');
const maybe = (f, k = .6) => (R() < k ? f() : undefined);

test('parse(print(p)) equals p for 500 generated printable parts, with parentheses, brackets and / inside triggers and guards', () => {
  for (let i = 0; i < 500; i++) {
    const p = P(maybe(trigger), maybe(() => nested(1)), maybe(() => `${word()} ${pick(['/', '[', ']', '(', ')', 'x'])} ${word()}`));
    const want = P(...['trigger', 'guard', 'effect'].map(k => (p[k] == null || p[k].trim() === '' ? undefined : p[k].trim())));
    const t = print(p);
    assert.notEqual(t, null, `case ${i}: ${JSON.stringify(p)}`);
    assert.deepEqual(parse(t), want, `case ${i}: ${t}`);
  }
});

test('print(parse(x)) is stable for 500 generated texts; each is read or refused, never thrown on', () => {
  const chars = ['a', 'b', ' ', ' ', '[', ']', '(', ')', '/', 'x', '1', '<', ','];
  let read = 0, refused = 0;
  for (let i = 0; i < 500; i++) {
    const x = Array.from({ length: Math.floor(R() * 24) }, () => pick(chars)).join(''), r = parse(x);
    if (r.error) { refused++; assert.deepEqual(Object.keys(r), ['error'], x); continue; }
    read++; const t = print(r);
    assert.notEqual(t, null, `case ${i}: ${JSON.stringify(x)} read as ${JSON.stringify(r)} does not print`);
    assert.deepEqual(parse(t), r, `case ${i}: ${JSON.stringify(x)}`); assert.equal(print(parse(t)), t);
  }
  assert.ok(read > 100 && refused > 100, `${read} read, ${refused} refused`);
});

test('linear: 4,096 characters of nested brackets and of slashes read in a few milliseconds; no regular expression in the parser', () => {
  const deep = `t [${'('.repeat(2045)}${')'.repeat(2045)}]`, wide = 'a('.repeat(1000) + '/'.repeat(2000), flat = '[]'.repeat(2048);
  for (const x of [deep, wide, flat]) { let best = Infinity;
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); parse(x); best = Math.min(best, performance.now() - t0); }
    assert.ok(best < 20, `${x.slice(0, 12)}…: ${best.toFixed(2)} ms`); }
  assert.ok(!parse(deep).error && parse(wide).error && parse(flat).error);
  // R2: no regular expression with nested repetition. The parser has none at all; flow.js's two have no quantified group
  const src = f => readFileSync(new URL(`../src/uml/${f}`, import.meta.url), 'utf8');
  assert.doesNotMatch(src('transition.js').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /RegExp|\.(test|exec|match|replace|split)\(\//);
  assert.doesNotMatch(src('flow.js'), /\)[*+{]/);
});
