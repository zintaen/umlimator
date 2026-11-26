// The protected core tests (tests/protected.json, tools/protect.mjs): each listed test is still there under its title and
// reads as recorded, so a deleted, renamed or weakened core test fails here until the maintainer approves the change and
// records it again with node tools/protect.mjs --update. The rest checks the tool itself on small made-up repositories.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, record, check, update, add, remove, readList, say } from '../tools/protect.mjs';
import { tokenize, literal } from '../tools/jsscan.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tool = fileURLToPath(new URL('../tools/protect.mjs', import.meta.url));

test('every protected core test is still there and reads as recorded (the maintainer records a change with node tools/protect.mjs --update)', () => {
  const problems = check(root);
  assert.deepEqual(problems.map(say), [], 'a protected test was deleted, renamed or changed: ask the maintainer to approve it and run node tools/protect.mjs --update');
});

test('the protected list covers the core: layout geometry, validate and apply, diff, the readers\' round trips and hostile input', () => {
  const list = readList(root), titles = Object.entries(list.tests).flatMap(([f, e]) => Object.keys(e).map(t => `${f}: ${t}`));
  const has = (re, what) => assert.ok(titles.some(t => re.test(t)), `no protected test for ${what}`);
  has(/^tests\/layout\.test\.mjs: layout\(\) draws every benchmark view .*bench\/expected\.json/, 'the bench hashes');
  has(/^tests\/unfold\.test\.mjs: .*bench\/expected\.json/, 'the unfolded bench hashes');
  has(/^tests\/model\.test\.mjs: validate\(\)/, 'validate()');
  has(/^tests\/apply\.test\.mjs: a transaction is all or nothing/, 'apply()');
  has(/^tests\/change\.test\.mjs: diff\(\) of a model with itself changes nothing/, 'diff()');
  for (const r of ['class', 'er', 'flowchart', 'mindmap', 'requirement', 'sequence', 'state']) has(new RegExp(`^tests/mermaid-${r}\\.test\\.mjs: read\\(write\\(model\\)\\) equals the model`), `the Mermaid ${r} round trip`);
  has(/^tests\/bpmn-xml\.test\.mjs: read\(write\(model\)\)/, 'the BPMN XML round trip');
  has(/hostile/, 'hostile input');
  has(/__proto__|Object\.prototype/, 'prototype keys');
  for (const [file, entries] of Object.entries(list.tests)) for (const [title, e] of Object.entries(entries)) {
    assert.match(e.sha256, /^[0-9a-f]{16}$/, `${file}: ${title}`);
    assert.ok(e.asserts >= 1, `${file}: "${title}" asserts nothing`);
  }
});

// a made-up repository with one test file
const SRC = `import { test } from 'node:test';
import assert from 'node:assert/strict';
const double = x => x * 2;
const twice = x => double(double(x));

test('doubles', () => {
  assert.equal(double(2), 4);
  assert.deepEqual([double(1)], [2]);
});

test("quadruples", () => { assert.equal(twice(1), 4); });

it('an it with a "quote" and \\n', () => { assert.ok(true); });
`;

function repo(src = SRC, entries = ['doubles', 'quadruples']) {
  const dir = mkdtempSync(join(tmpdir(), 'umlimator-protect-'));
  mkdirSync(join(dir, 'tests'));
  writeFileSync(join(dir, 'tests/x.test.mjs'), src);
  writeFileSync(join(dir, 'tests/protected.json'), JSON.stringify({ tests: {} }));
  add(dir, 'tests/x.test.mjs', entries);
  return dir;
}
const edit = (dir, f) => writeFileSync(join(dir, 'tests/x.test.mjs'), f(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8')));
const problems = dir => check(dir).map(p => `${p.title}: ${p.problem}`);

test('protect: a change of layout or of a comment is no change; the hash covers the body and the helpers it uses', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(problems(dir), []);
  const e = readList(dir).tests['tests/x.test.mjs'];
  assert.deepEqual(e.doubles.helpers, ['double']);
  assert.deepEqual(e.quadruples.helpers, ['double', 'twice']);
  assert.equal(e.doubles.asserts, 2);
  edit(dir, s => s.replace("assert.equal(double(2), 4);", "// two doubled\n    assert.equal( double(2),   4 ); /* still four */"));
  assert.deepEqual(problems(dir), []);
});

test('protect: a deleted or renamed protected test is gone; a file gone takes its tests', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  edit(dir, s => s.replace("test('doubles'", "test('doubles a number'"));
  assert.deepEqual(problems(dir), ['doubles: gone: deleted or renamed']);
  edit(dir, s => s.replace(/test\("quadruples"[^\n]*\n/, ''));
  assert.deepEqual(problems(dir), ['doubles: gone: deleted or renamed', 'quadruples: gone: deleted or renamed']);
  rmSync(join(dir, 'tests/x.test.mjs'));
  assert.deepEqual(problems(dir), ['doubles: its file is gone', 'quadruples: its file is gone']);
});

test('protect: an assertion dropped, weakened or edited, a skip, or a helper changed is a change', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cases = [
    [s => s.replace("  assert.deepEqual([double(1)], [2]);\n", ''), ['doubles: changed (asserts 2 -> 1)']],
    [s => s.replace('assert.deepEqual([double(1)], [2])', 'assert.ok([double(1)])'), ['doubles: changed (its body or a helper changed)']],
    [s => s.replace('assert.equal(double(2), 4)', 'assert.equal(double(2), 5)'), ['doubles: changed (its body or a helper changed)']],
    [s => s.replace("test('doubles'", "test.skip('doubles'"), ['doubles: changed (its body or a helper changed)']],
    [s => s.replace("test('doubles', () => {", "test('doubles', { skip: true }, () => {"), ['doubles: changed (its body or a helper changed)']],
    [s => s.replace('x => x * 2', 'x => x + x'), ['doubles: changed (its body or a helper changed)', 'quadruples: changed (its body or a helper changed)']],
    [s => s.replace('double(double(x))', 'x * 4'), ['quadruples: changed (its body or a helper changed; no longer uses double)']],
  ];
  for (const [change, want] of cases) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.notEqual(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8'), before, 'the case edits the file');
    assert.deepEqual(problems(dir), want);
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
  assert.deepEqual(problems(dir), []);
});

test('protect: a protected test wrapped so that node --test no longer runs it is reported; one in a describe that runs is not (audit 65)', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const DOUBLES = /test\('doubles', \(\) => \{\n[^]*?\n\}\);\n/, wrap = (pre, post) => s => s.replace(DOUBLES, m => `${pre}${m}${post}`);
  const off = [
    [wrap("describe('off', { skip: true }, () => {\n", '});\n'), 'inside describe(..., { skip })'],
    [wrap("describe('off', { todo: 'later' }, () => {\n", '});\n'), 'inside describe(..., { todo })'],
    [wrap("describe.skip('off', () => {\n", '});\n'), 'inside describe.skip'],
    [wrap("describe('a', () => { describe.skip('b', () => {\n", '}); });\n'), 'inside describe.skip'],
    [wrap("describe('a', () => { describe('b', { skip: 'no' }, async () => {\n", '}); });\n'), 'inside describe(..., { skip })'],
    [wrap('if (false) {\n', '}\n'), 'inside if { ... }'],
    [wrap('if (false)\n', ''), 'after if (...)'],
    [wrap('false && ', ''), 'after &&'],
    [wrap('function off() {\n', '}\n'), null], // inside a top-level declaration: the scanner reads it as a helper's body
    [wrap('const off = () => {\n', '};\n'), null],
    [wrap('setup(() => {\n', '});\n'), 'inside a function that is no test callback'],
    [wrap('[].forEach(() => {\n', '});\n'), 'inside a function that is no test callback'],
    [wrap('for (const x of []) {\n', '}\n'), 'inside for { ... }'],
  ];
  for (const [change, why] of off) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.notEqual(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8'), before, 'the case edits the file');
    assert.deepEqual(problems(dir), [why ? `doubles: no longer runs (${why})` : 'doubles: gone: deleted or renamed'], why);
    assert.throws(() => update(dir), why ? /"doubles" does not run/ : /no test titled "doubles"/);
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
  const runs = [
    wrap("describe('on', () => {\n", '});\n'),
    wrap("describe('on', { skip: false }, function () {\n", '});\n'),
    wrap("describe.only('on', async () => {\n", '});\n'),
    wrap("suite('a', () => { describe('b', { timeout: 5 }, () => {\n", '}); });\n'),
    wrap("test('outer', async t => {\n", '});\n'),
    s => s.replace("test('doubles'", "await test('doubles'"),
  ];
  for (const change of runs) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.notEqual(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8'), before, 'the case edits the file');
    assert.deepEqual(problems(dir), []);
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
  edit(dir, wrap('if (process.env.X) {\n', '}\n'));
  assert.throws(() => add(dir, 'tests/x.test.mjs', ['doubles']), /tests\/x\.test\.mjs: "doubles" does not run \(inside if \{ \.\.\. \}\)/);
  let out = '', code = 0;
  try { execFileSync(process.execPath, [tool, '--root', dir], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 1);
  assert.match(out, /^tests\/x\.test\.mjs: "doubles": no longer runs \(inside if \{ \.\.\. \}\)\n/);
});

test('protect: a protected test whose test (or describe around it) is bound to anything but node:test\'s own is reported (audit 66)', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const IMPORT = "import { test } from 'node:test';", head = line => s => s.replace(IMPORT, line);
  const DOUBLES = /test\('doubles', \(\) => \{\n[^]*?\n\}\);\n/, wrap = (pre, post) => s => s.replace(DOUBLES, m => `${pre}${m}${post}`);
  const off = [
    [head("import { skip as test } from 'node:test';"), "test is node:test's skip"],
    [head("import { todo as test } from 'node:test';"), "test is node:test's todo"],
    [head("import { test as real, skip as test } from 'node:test';"), "test is node:test's skip"],
    [head("import { 'skip' as test } from 'node:test';"), "test is node:test's skip"],
    [head("import * as test from 'node:test';"), "test is node:test's namespace"],
    [head("import { test } from './helpers.mjs';"), 'test is imported from ./helpers.mjs, not node:test'],
    [head("import { test as real, skip } from 'node:test';\nconst test = skip;"), "test is declared in the file, not node:test's test"],
    [head("import nt from 'node:test';\nconst { skip: test } = nt;"), "test is declared in the file, not node:test's test"],
    [head("import {\n  test as real,\n  skip as test,\n} from 'node:test'"), "test is node:test's skip"],
    [s => wrap("describe('around', () => {\n", '});\n')(s.replace(IMPORT, `${IMPORT}\nimport { skip as describe } from 'node:test';`)), "describe is node:test's skip"],
    [s => wrap("describe('a', () => { suite('b', () => {\n", '}); });\n')(s.replace(IMPORT, `${IMPORT}\nlet suite = () => {};`)), "suite is declared in the file, not node:test's suite"],
  ];
  for (const [change, why] of off) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.notEqual(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8'), before, 'the case edits the file');
    const want = [`doubles: no longer runs (${why})`];
    if (!/describe|suite/.test(why)) want.push(`quadruples: no longer runs (${why})`);
    assert.deepEqual(problems(dir), want, why);
    assert.throws(() => update(dir), /"doubles" does not run/);
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
  const runs = [
    head("import test from 'node:test';"),
    head("import { default as test } from 'node:test';"),
    head("import { it as test } from 'node:test';"),
    head("import { test, describe as suite, skip } from 'node:test';\nimport assertOk from 'node:assert';"),
    s => wrap("suite('on', () => {\n", '});\n')(s.replace(IMPORT, "import { test, suite } from 'node:test';")),
    s => s.replace(IMPORT, `${IMPORT}\nconst it = () => {};`), // it is rebound, and only the unprotected it() test calls it
  ];
  for (const change of runs) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.notEqual(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8'), before, 'the case edits the file');
    assert.deepEqual(problems(dir), []);
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
});

test('protect: --update records a change again, all, one file or some titles; a title not found is an error', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  edit(dir, s => s.replace('assert.equal(double(2), 4)', 'assert.equal(double(3), 6)').replace('twice(1), 4', 'twice(2), 8'));
  assert.equal(check(dir).length, 2);
  assert.deepEqual(update(dir, 'tests/x.test.mjs', ['doubles']), ['tests/x.test.mjs: "doubles"']);
  assert.deepEqual(problems(dir), ['quadruples: changed (its body or a helper changed)']);
  assert.deepEqual(update(dir), ['tests/x.test.mjs: "doubles"', 'tests/x.test.mjs: "quadruples"']);
  assert.deepEqual(problems(dir), []);
  edit(dir, s => s.replace("test('doubles'", "test('doubles it'"));
  assert.throws(() => update(dir), /no test titled "doubles" \(renamed\? --remove it and --add the new title\)/);
  assert.throws(() => update(dir, 'tests/y.test.mjs'), /tests\/y\.test\.mjs has no protected tests/);
  remove(dir, 'tests/x.test.mjs', ['doubles']);
  add(dir, 'tests/x.test.mjs', ['doubles it']);
  assert.deepEqual(problems(dir), []);
  assert.deepEqual(Object.keys(readList(dir).tests['tests/x.test.mjs']).sort(), ['doubles it', 'quadruples']);
  assert.throws(() => add(dir, 'tests/x.test.mjs', ['no such']), /no test titled "no such"/);
  assert.throws(() => remove(dir, 'tests/x.test.mjs', ['no such']), /"no such" is not protected/);
  remove(dir, 'tests/x.test.mjs', ['doubles it', 'quadruples']);
  assert.deepEqual(readList(dir).tests, {});
});

test('protect: the command exits 0 when every protected test is as recorded, 1 when one is not, 2 on a bad option', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (...a) => { try { return [0, execFileSync(process.execPath, [tool, '--root', dir, ...a], { encoding: 'utf8', stdio: 'pipe' })]; } catch (e) { return [e.status, e.stdout + e.stderr]; } };
  assert.deepEqual(run(), [0, '2 protected tests as recorded\n']);
  edit(dir, s => s.replace("  assert.deepEqual([double(1)], [2]);\n", ''));
  const [code, out] = run();
  assert.equal(code, 1);
  assert.match(out, /tests\/x\.test\.mjs: "doubles": changed \(asserts 2 -> 1\)\n1 of 2 protected tests gone or changed: ask the maintainer/);
  assert.match(run('--list')[1], /"doubles" \(2 asserts; helpers double\)/);
  assert.equal(run('--update')[0], 0);
  assert.equal(run()[0], 0);
  assert.equal(run('--bogus')[0], 2);
  assert.equal(run('--add', 'tests/x.test.mjs')[0], 2);
});

test('protect: the scanner finds test() and it() with a literal title, numbers a repeated title, and passes over a computed one', () => {
  const { tests } = scan(`${SRC}
test('doubles', () => { assert.equal(1, 1); });
for (const n of [1, 2]) test(\`case \${n}\`, () => { assert.ok(n); });
test(\`plain template\`, () => { assert.ok(1); });
obj.test('a method, not a test', () => {});
`);
  assert.deepEqual([...tests.keys()], ['doubles', 'quadruples', 'an it with a "quote" and \n', 'doubles #2', 'plain template']);
  assert.equal(record(SRC, 'no such'), null);
});

test('jsscan: a / after an operand divides, else starts a regular expression; strings, templates and comments are one token each', () => {
  const kinds = s => tokenize(s).filter(t => t.type !== 'ws').map(t => `${t.type}:${t.text}`);
  assert.deepEqual(kinds('a / b / c'), ['id:a', 'punct:/', 'id:b', 'punct:/', 'id:c']);
  assert.deepEqual(kinds('x = /a\\/[/]b/g.test(y)'), ['id:x', 'punct:=', 're:/a\\/[/]b/g', 'punct:.', 'id:test', 'punct:(', 'id:y', 'punct:)']);
  assert.deepEqual(kinds('return /x/'), ['id:return', 're:/x/']);
  assert.deepEqual(kinds('`a ${ {b: `c${d}`}.b } e` // done'), ['tpl:`a ${ {b: `c${d}`}.b } e`', 'comment:// done']);
  assert.deepEqual(kinds("'it\\'s' /* a */ 1_000 x?.y a?.5:1"), ["str:'it\\'s'", 'comment:/* a */', 'num:1_000', 'id:x', 'punct:?.', 'id:y', 'id:a', 'punct:?', 'num:.5', 'punct::', 'num:1']);
  assert.equal(literal(tokenize("'a\\u0041\\x42\\n'")[0]), 'aAB\n');
  assert.equal(literal(tokenize('`a ${b}`')[0]), null);
});
