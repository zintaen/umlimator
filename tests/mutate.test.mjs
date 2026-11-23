// Mutation testing (tools/evolve/mutate.mjs): which mutants it makes, that each still parses, that one seed picks the
// same ones, and a whole run against made-up repositories in a temporary folder: the share killed, the survivors with
// their place, a timeout counted as a kill, the budget, and a tree left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mutants, applyMutant, shuffle, relatedTests, mutate, parse, say, copied } from '../tools/evolve/mutate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOL = join(ROOT, 'tools/evolve/mutate.mjs');

const CALC = `// a made-up source
export function clamp(x, lo, hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
export function total(list) {
  let sum = 0;
  for (const n of list) sum = sum + n;
  return sum;
}
export function note(log, s) {
  log.push(s);
  return s.length;
}
`;
const CALC_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, total, note } from '../src/calc.js';
test('clamp', () => { assert.equal(clamp(5, 0, 10), 5); assert.equal(clamp(-1, 0, 10), 0); assert.equal(clamp(11, 0, 10), 10); });
test('total', () => { assert.equal(total([1, 2]), 3); });
test('note', () => { assert.equal(note([], 'ab'), 2); });
`;

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'umlimator-mutate-test-'));
  for (const [f, text] of Object.entries(files)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), text); }
  return dir;
}
// every file under a folder with its text and modification time
const snapshot = dir => {
  const out = {};
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out[p.slice(dir.length)] = [readFileSync(p, 'utf8'), statSync(p).mtimeMs]; } };
  walk(dir);
  return out;
};
const leftovers = () => readdirSync(tmpdir()).filter(f => f.startsWith('umlimator-mutate-') && !f.startsWith('umlimator-mutate-test-')).sort();

test('mutate: a comparison flipped, a logical or arithmetic operator swapped, a constant changed, a statement dropped', () => {
  const got = mutants(CALC).map(m => `${m.line}:${m.col} ${m.kind} ${m.from} -> ${m.to}`);
  assert.deepEqual(got, [
    '3:9 comparison < -> >=',
    '4:9 comparison > -> <=',
    '8:13 constant 0 -> 1',
    '9:35 arithmetic + -> -',
    '13:3 statement log.push(s) -> void 0',
  ]);
  const src = `function f(a, b) {
  const s = 'a < b && 1', t = \`\${a} > 2\`, r = /x+1/g; // a < b 3
  if (a <= -b || !true) g(a * 2.5, b / 4, 0x10, 1e3, 7n);
  x = { k: 1 }; y++;
  return -a + +b; /* 1 > 2 */
}
h(9); // mutate: skip
`;
  const all = mutants(src).map(m => `${m.line} ${m.from}->${m.to}`);
  assert.deepEqual(all, ['3 <=->>', '3 ||->&&', '3 true->false', '3 *->/', '3 2.5->3.5', '3 /->*', '3 4->5', '4 x = { k: 1 }->void 0', '4 1->0', '4 y++->void 0', '5 +->-'],
    'no string, template, regular expression, comment, unary sign, hex, exponent, bigint, top-level statement, statement after if () with no braces or skipped line is touched');
  const m = mutants(CALC)[0];
  assert.equal(applyMutant(CALC, m), CALC.replace('x < lo', 'x >= lo'));
});

test('mutate: every mutant of the module\'s own sources still parses', () => {
  const files = ['src/core/apply.js', 'src/core/history.js', 'src/core/text.js', 'src/core/warn.js'];
  const sources = files.flatMap(f => { const s = readFileSync(join(ROOT, f), 'utf8'); return mutants(s).map(m => [`${f}:${m.line}:${m.col} ${m.from} -> ${m.to}`, applyMutant(s, m)]); });
  assert.ok(sources.length > 200, `only ${sources.length} mutants`);
  const check = `const vm = require('node:vm'); const bad = [];
for (const [where, src] of JSON.parse(require('node:fs').readFileSync(0, 'utf8'))) { try { new vm.SourceTextModule(src); } catch (e) { bad.push(where + ': ' + e.message); } }
process.stdout.write(JSON.stringify(bad));`;
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '-e', check], { input: JSON.stringify(sources), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), []);
});

test('mutate: one seed gives one order, another seed another; the related tests are found, the one named for the source first', (t) => {
  const list = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(shuffle(list, 7), shuffle(list, 7));
  assert.notDeepEqual(shuffle(list, 7), shuffle(list, 8));
  assert.deepEqual([...shuffle(list, 7)].sort((a, b) => a - b), list);
  const dir = repo({ 'src/calc.js': CALC, 'tests/calc.test.mjs': CALC_TEST, 'tests/a.test.mjs': "import '../src/calc.js';\n", 'tests/b.test.mjs': "import '../src/other.js';\n" });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(relatedTests(dir, 'src/calc.js'), ['tests/calc.test.mjs', 'tests/a.test.mjs']);
});

test('mutate: a run reports the share killed and each survivor\'s place, and leaves the tree as it was', async (t) => {
  const dir = repo({ 'src/calc.js': CALC, 'tests/calc.test.mjs': CALC_TEST });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = snapshot(dir), tmpBefore = leftovers();
  const r = await mutate(dir, ['src/calc.js'], { seed: 1 });
  assert.equal(r.error, undefined);
  assert.deepEqual([r.mutants, r.chosen, r.run, r.killed, r.survived, r.timedOut, r.notRun, r.score], [5, 5, 5, 4, 1, 0, 0, 0.8]);
  assert.deepEqual(r.survivors, [{ file: 'src/calc.js', line: 13, col: 3, kind: 'statement', from: 'log.push(s)', to: 'void 0' }]);
  assert.deepEqual(r.tests, { 'src/calc.js': ['tests/calc.test.mjs'] });
  assert.match(say(r), /killed 4 of 5 \(80%\); 1 survived\n {2}survived src\/calc\.js:13:3 statement: "log\.push\(s\)" -> "void 0"$/);
  assert.deepEqual(snapshot(dir), before, 'no file changed, added or removed');
  assert.deepEqual(leftovers(), tmpBefore, 'the temporary copy is removed');
  // the same seed and --max pick the same mutants
  const a = await mutate(dir, ['src/calc.js'], { seed: 5, max: 2 }), b = await mutate(dir, ['src/calc.js'], { seed: 5, max: 2 });
  assert.equal(a.run, 2);
  assert.deepEqual([a.killed, a.survivors], [b.killed, b.survivors]);
});

test('mutate: a mutant that hangs is killed by the timeout; a budget spent leaves the rest not run', async (t) => {
  const dir = repo({
    'src/down.js': 'export function down(x) {\n  while (x > 0) x = x - 1;\n  return x;\n}\n',
    'tests/down.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { down } from '../src/down.js';\ntest('down', () => { assert.equal(down(3), 0); });\n",
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = await mutate(dir, ['src/down.js'], { timeoutMs: 1500 });
  assert.deepEqual([r.mutants, r.run, r.killed, r.timedOut, r.survived], [4, 4, 4, 2, 0], 'x + 1 and x - 0 never end');
  const spent = await mutate(dir, ['src/down.js'], { budgetMs: 0 });
  assert.deepEqual([spent.chosen, spent.run, spent.notRun, spent.score], [4, 0, 4, null]);
  assert.match(say(spent), /4 not run \(the budget ran out\)/);
});

test('mutate: tests that fail before any mutation measure nothing (exit 1); a bad option or no file is a usage error (exit 2)', (t) => {
  const dir = repo({ 'src/calc.js': CALC, 'tests/calc.test.mjs': CALC_TEST.replace('total([1, 2]), 3', 'total([1, 2]), 4') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...a) => spawnSync(process.execPath, [TOOL, '--root', dir, ...a], { encoding: 'utf8' });
  const failing = cli('src/calc.js');
  assert.equal(failing.status, 1);
  assert.match(failing.stdout, /the tests fail before any mutation \(tests\/calc\.test\.mjs\): nothing to measure/);
  writeFileSync(join(dir, 'tests/calc.test.mjs'), CALC_TEST);
  const ok = cli('src/calc.js', '--json', '--seed', '2', '--budget', '2m');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout).survivors.map(s => `${s.line}:${s.col}`), ['13:3']);
  for (const bad of [[], ['src/calc.js', '--bogus'], ['src/calc.js', '--max', '0'], ['src/calc.js', '--budget', 'soon']]) assert.equal(cli(...bad).status, 2, bad.join(' '));
  assert.equal(cli('src/none.js').status, 2);
  assert.match(cli('src/calc.js', '--tests', '').stderr + cli('src/lonely.js').stderr, /no such file/);
  assert.deepEqual(parse(['src/a.js', '--tests', 'tests/a.test.mjs,tests/b.test.mjs', '--budget', '90s', '--timeout', '20']), {
    files: ['src/a.js'], tests: ['tests/a.test.mjs', 'tests/b.test.mjs'], seed: 1, max: Infinity, budgetMs: 90_000, timeoutMs: 20_000, timed: false, json: false,
    root: join(ROOT, 'tools/evolve/../..'),
  });
});

test('mutate: the copy keeps the tracked .evolve/ files (the pinned strategy) and leaves out the loop\'s local state and other worktrees', () => {
  const r = '/repo', at = p => copied(r, join(r, p));
  assert.equal(at('.evolve/STRATEGY.md'), true);
  assert.equal(at('.evolve/strategy-feedback.md'), true);
  for (const p of ['.evolve/fuzz', '.evolve/lease.json', '.evolve/lease.json.lock', '.git', 'node_modules', '.claude/worktrees/x', 'docs/.vitepress/dist']) assert.equal(at(p), false, p);
});
