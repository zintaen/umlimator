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
import { scan, record, check, update, add, remove, readList, say, assertLoads } from '../tools/protect.mjs';
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

test('protect: a protected test whose assert is swapped, rebound or patched to assert nothing is reported, and so is a changed import (audit 67)', (t) => {
  const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ASSERT = "import assert from 'node:assert/strict';", head = line => s => s.replace(ASSERT, line);
  const both = why => [`doubles: no longer asserts (${why})`, `quadruples: no longer asserts (${why})`];
  const off = [
    [head("import assert from './noop.mjs';"), 'assert is imported from ./noop.mjs, not node:assert'],
    [head("import { assert } from './helpers.mjs';"), 'assert is imported from ./helpers.mjs, not node:assert'],
    [head("import { ok as assert } from 'node:assert';"), "assert is node:assert's ok"],
    [head("globalThis.assert = () => {};"), 'assert is not imported from node:assert'],
    [head(`${ASSERT}\nassert.equal = () => {};`), 'assert is changed in the file (line 3)'],
    [head(`${ASSERT}\nassert['deepEqual'] = assert.ok;`), 'assert is changed in the file (line 3)'],
    [head(`${ASSERT}\nObject.assign(assert, { equal() {} });`), 'assert is changed in the file (line 3)'],
    [head(`${ASSERT}\nimport { mock } from 'node:test';\nmock.method(assert, 'equal', () => {});`), 'assert is changed in the file (line 4)'],
    [head(`${ASSERT}\ndelete assert.strict.equal;`), 'assert is changed in the file (line 3)'],
  ];
  const old = JSON.parse(readFileSync(join(dir, 'tests/protected.json'), 'utf8'));
  for (const e of Object.values(old.tests['tests/x.test.mjs'])) delete e.imports; // an entry recorded before audit 67
  for (const [change, why] of off) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.notEqual(readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8'), before, 'the case edits the file');
    assert.deepEqual(problems(dir), both(why), why);
    assert.deepEqual(check(dir, old).map(p => `${p.title}: ${p.problem}`), both(why), `${why}, with no imports recorded`);
    assert.throws(() => update(dir), /"doubles" does not assert/);
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
  const fine = [
    head("import { strict as assert } from 'node:assert';"),
    head("import * as assert from 'node:assert/strict';"),
    s => s.replace(ASSERT, `${ASSERT}\nconst eq = assert.equal, same = assert.deepEqual === assert.strict.deepEqual;`),
  ];
  for (const change of fine) {
    const before = readFileSync(join(dir, 'tests/x.test.mjs'), 'utf8');
    edit(dir, change);
    assert.deepEqual(check(dir, old), [], 'no assert problem');
    writeFileSync(join(dir, 'tests/x.test.mjs'), before);
  }
  // an entry records where the names it uses are imported from, and the modules imported only to run them
  const lib = repo(`import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { double } from './math.mjs';\n\ntest('doubles', () => { assert.equal(double(2), 4); });\n`, ['doubles']);
  t.after(() => rmSync(lib, { recursive: true, force: true }));
  assert.deepEqual(readList(lib).tests['tests/x.test.mjs'].doubles.imports, ['assert: node:assert/strict default', 'double: ./math.mjs double']);
  const swaps = [
    [s => s.replace("from './math.mjs'", "from './noop.mjs'"), 'was double: ./math.mjs double; now double: ./noop.mjs double'],
    [s => s.replace("import { double } from './math.mjs';", "import { half as double } from './math.mjs';"), 'was double: ./math.mjs double; now double: ./math.mjs half'],
    [s => s.replace(ASSERT, "import assert from 'node:assert';"), 'was assert: node:assert/strict default; now assert: node:assert default'],
    [s => s.replace(ASSERT, `${ASSERT}\nimport './patch.mjs';`), 'now ./patch.mjs'],
  ];
  for (const [change, why] of swaps) {
    const before = readFileSync(join(lib, 'tests/x.test.mjs'), 'utf8');
    edit(lib, change);
    assert.deepEqual(check(lib).map(p => `${p.title}: ${p.problem}`), [`doubles: changed (its imports: ${why})`]);
    writeFileSync(join(lib, 'tests/x.test.mjs'), before);
  }
  assert.deepEqual(check(lib), []);
});

test('protect: assert handed on through parentheses, an alias or its keys, or patched when a test asserts only through a helper, is reported (audit 68)', (t) => {
  const ASSERT = "import assert from 'node:assert/strict';", after = line => s => s.replace(ASSERT, `${ASSERT}\n${line}`);
  const both = why => [`doubles: no longer asserts (${why})`, `quadruples: no longer asserts (${why})`];
  const handed = n => `assert is handed on in the file, where it can be changed (line ${n})`;
  const off = [
    [after('(assert).equal = () => {};'), handed(3)],
    [after('const a = assert; a.equal = () => {};'), handed(3)],
    [after('for (const k of Object.keys(assert)) (assert)[k] = () => {};'), handed(3)],
    [after('const s = assert.strict;\ns.equal = () => {};'), handed(3)],
    [after('const { strict } = assert;'), handed(3)],
    [after('[assert][0].equal = () => {};'), handed(3)],
    [after('assert[`equal`]++;'), 'assert is changed in the file (line 3)'],
  ];
  for (const [change, why] of off) {
    const dir = repo(); t.after(() => rmSync(dir, { recursive: true, force: true }));
    edit(dir, change);
    assert.deepEqual(problems(dir), both(why), why);
    assert.throws(() => update(dir), /"doubles" does not assert/);
  }
  // a test that asserts only through a helper: a patch of assert reached it nowhere but in the helper
  const helped = SRC.replace("const double = x => x * 2;", "const double = x => x * 2;\nfunction same(a, b) { assert.equal(a, b); }")
    .replace("test(\"quadruples\", () => { assert.equal(twice(1), 4); });", "test(\"quadruples\", () => { same(twice(1), 4); });");
  const dir = repo(helped); t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(problems(dir), []);
  edit(dir, after('assert.equal = () => {};'));
  assert.deepEqual(problems(dir), both('assert is changed in the file (line 3)'));
  // what stays fine: calls, method reads, a property named assert, typeof, and a test that never uses assert
  const fine = repo(helped.replace(ASSERT, `${ASSERT}\nconst eq = assert.equal, E = assert.AssertionError, o = { assert: 1 }, ty = typeof assert;\nassert?.ok(true); assert['ok'](1);`)
    + "test('plain', () => { if (1 + 1 !== 2) throw new Error('no'); });\n", ['doubles', 'quadruples', 'plain']);
  t.after(() => rmSync(fine, { recursive: true, force: true }));
  assert.deepEqual(problems(fine), []);
  edit(fine, after('(assert).ok = () => {};'));
  assert.deepEqual(problems(fine), both(handed(3)), 'plain asserts with no assert, and is not reported');
});

test('protect: node:assert reached by another name (a second import, process.getBuiltinModule, createRequire, a dynamic import, an escaped name) and changed is reported (audit 69)', async (t) => {
  const ASSERT = "import assert from 'node:assert/strict';", after = line => s => s.replace(ASSERT, `${ASSERT}\n${line}`);
  const both = why => [`doubles: no longer asserts (${why})`, `quadruples: no longer asserts (${why})`];
  const loads = async dir => (await assertLoads(dir)).map(p => `${p.title}: ${p.problem}`), changed = what => `node:assert changed: ${what} was changed or deleted as the file loads`;
  const cases = [ // the change; what check() says of it (null: nothing, it reads no name the scan knows); what the load says
    [after("import other from 'node:assert';\nother.equal = () => {};"), "other, node:assert's default export, is changed in the file (line 4)", changed('assert.equal')],
    [after("import * as ns from 'node:assert/strict';\nns.default.ok = () => {};"), "ns, node:assert's namespace, is changed in the file (line 4)", changed('assert/strict.ok')],
    [after("process.getBuiltinModule('node:assert/strict').equal = () => {};"), 'node:assert is reached at run time (line 3)', changed('assert/strict.equal')],
    [after('ass\\u0065rt.equal = () => {};'), 'a name is written with an escape, which can spell assert (line 3)', changed('assert/strict.equal')],
    [after("import { createRequire } from 'node:module';\nReflect.set(createRequire(import.meta.url)('node:' + 'assert').strict, 'deepEqual', () => {});"), null, changed('assert/strict.deepEqual')],
    [after("const m = await import(['node', 'assert'].join(':')); Object.defineProperty(m.default, 'equal', { value: () => {} });"), null, changed('assert.equal')],
    [after("const p = process, k = 'getBuiltin' + 'Module'; delete p[k]('node:' + 'assert').strict.equal;"), null, changed('assert/strict.equal')],
  ];
  const SRC2 = SRC.replace("import { test } from 'node:test';", "import { test, it } from 'node:test';"); // it bound, so the file loads
  for (const [change, why, load] of cases) {
    const dir = repo(SRC2); t.after(() => rmSync(dir, { recursive: true, force: true }));
    edit(dir, change);
    if (why) assert.deepEqual(problems(dir), both(why), why);
    assert.deepEqual(await loads(dir), both(load), load);
  }
  // the command says both, each test once
  const dir = repo(SRC2); t.after(() => rmSync(dir, { recursive: true, force: true }));
  edit(dir, after("process.getBuiltinModule('node:assert/strict').equal = () => {};"));
  let out = '', code = 0;
  try { execFileSync(process.execPath, [tool, '--root', dir], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 1);
  assert.deepEqual(out.trim().split('\n'), ['tests/x.test.mjs: "doubles": no longer asserts (node:assert is reached at run time (line 3))',
    'tests/x.test.mjs: "quadruples": no longer asserts (node:assert is reached at run time (line 3))', '2 of 2 protected tests gone or changed: ask the maintainer, who runs node tools/protect.mjs --update after approving']);
  // what stays fine: a second import only called, a module loaded at run time that is not node:assert, a file that loads as it was
  const fine = repo(SRC2.replace(ASSERT, `${ASSERT}\nimport also from 'node:assert';\nalso.ok(true);\nconst fs = await import('node:' + 'fs');`)); t.after(() => rmSync(fine, { recursive: true, force: true }));
  assert.deepEqual(problems(fine), []);
  assert.deepEqual(await loads(fine), []);
});

test('every protected core test file loads and runs its tests with node:assert as it was (audit 69, audit 70)', async () => {
  assert.deepEqual((await assertLoads(root)).map(say), []);
});

test('protect: a string \'assert\' held as data, or a .binding read off anything but process, is no run-time reach of node:assert; a load given one is (audit 70)', async (t) => {
  const ASSERT = "import assert from 'node:assert/strict';", after = line => s => s.replace(ASSERT, `${ASSERT}\n${line}`);
  const SRC2 = SRC.replace("import { test } from 'node:test';", "import { test, it } from 'node:test';");
  const fine = [
    'const p = { binding: \'b1\' }; const used = p.binding, also = p?._linkedBinding, g = p.getBuiltinModule;',
    "const words = ['assert', 'expect'], says = `node:assert`, o = { 'assert/strict': 1 }, w = words.includes('assert');",
    "const pick = (k) => ({ assert: 1 })[k]; pick('assert'); console.log('node:assert', \"assert\");",
  ];
  for (const line of fine) {
    const dir = repo(SRC2); t.after(() => rmSync(dir, { recursive: true, force: true }));
    edit(dir, after(line));
    assert.deepEqual(problems(dir), [], line);
    assert.deepEqual((await assertLoads(dir)).map(say), [], line);
  }
  const reach = n => [`doubles: no longer asserts (node:assert is reached at run time (line ${n}))`, `quadruples: no longer asserts (node:assert is reached at run time (line ${n}))`];
  for (const line of ["const m = await import('node:assert');", "import { createRequire } from 'node:module';\nconst m = createRequire(import.meta.url)('assert');",
    "const m = process.getBuiltinModule(`assert/strict`);", 'const b = process.binding;', 'const g = globalThis.process?.getBuiltinModule;']) {
    const dir = repo(SRC2); t.after(() => rmSync(dir, { recursive: true, force: true }));
    edit(dir, after(line));
    assert.deepEqual(problems(dir), reach(3 + line.split('\n').length - 1), line);
  }
  // no protected test file of this repository reads as reaching node:assert
  for (const file of Object.keys(readList(root).tests)) assert.equal(scan(readFileSync(join(root, file), 'utf8')).assertWhy, null, file);
});

test('protect: node:assert changed by a name built at run time in an earlier test, a hook or a timer, or put back before exit, is reported as the tests run (audit 70)', async (t) => {
  const N = 'String.fromCharCode(110, 111, 100, 101, 58, 97, 115, 115, 101, 114, 116)'; // 'node:assert', which no scan reads
  const HEAD = "import { test, describe, beforeEach, afterEach } from 'node:test';\nimport assert from 'node:assert/strict';\n";
  const CORE = "test('core', () => {\n  assert.equal(1 + 1, 2);\n});\n";
  const at = (body, where) => [body, `core: no longer asserts (node:assert changed: assert/strict.equal was changed or deleted ${where})`];
  const cases = [
    at(`test('setup', async () => { const m = await import(${N}); m.default.strict.equal = () => {}; });\n${CORE}`, 'while "setup" ran'),
    at(`const m = await import(${N}), was = m.default.strict.equal; m.default.strict.equal = () => {};\nprocess.prependListener('exit', () => { m.default.strict.equal = was; });\n${CORE}`, 'as the file loads'),
    at(`describe('d', () => {\n  let m, was;\n  beforeEach(async () => { m = (await import(${N})).default.strict; was = m.equal; m.equal = () => {}; });\n  afterEach(() => { m.equal = was; });\n  ${CORE}});\n`, 'while "core" ran'),
    at(`test('first', () => {});\nlet was;\nafterEach(async () => { const m = (await import(${N})).default.strict; if (!was) { was = m.equal; m.equal = () => {}; } else m.equal = was; });\n${CORE}`, 'after "first" ran'),
    at(`test('late', () => { setTimeout(async () => { (await import(${N})).default.strict.equal = () => {}; }, 0); });\n${CORE}`, 'after "core" ran'), // the timer's change is seen once it is made
  ];
  for (const [body, why] of cases) {
    const dir = repo(HEAD + CORE, ['core']); t.after(() => rmSync(dir, { recursive: true, force: true }));
    edit(dir, () => HEAD + body);
    assert.deepEqual(problems(dir), [], 'the scan sees no name it knows');
    assert.deepEqual((await assertLoads(dir)).map(p => `${p.title}: ${p.problem}`), [why], body);
  }
  // a timed test is run in CI only where no protected test runs, so it is not run here; one that does not end is reported
  const timed = repo(HEAD + `test('slow (timed)', async () => { (await import(${N})).default.strict.equal = () => {}; });\n` + CORE, ['core']);
  t.after(() => rmSync(timed, { recursive: true, force: true }));
  assert.deepEqual(await assertLoads(timed), []);
  const hang = repo(HEAD + "test('waits', () => new Promise(() => setInterval(() => {}, 1000)));\n" + CORE, ['core']);
  t.after(() => rmSync(hang, { recursive: true, force: true }));
  assert.deepEqual((await assertLoads(hang, undefined, { timeout: 3000 })).map(p => p.problem), ['could not be checked: its tests did not end in 3 s']);
  // the command says it and exits 1
  const dir = repo(HEAD + CORE, ['core']); t.after(() => rmSync(dir, { recursive: true, force: true }));
  edit(dir, () => HEAD + cases[0][0]);
  let out = '', code = 0;
  try { execFileSync(process.execPath, [tool, '--root', dir], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 1);
  assert.match(out, /"core": no longer asserts \(node:assert changed: assert\/strict\.equal was changed or deleted while "setup" ran\)/);
});

test('protect: a protected test that its file\'s run does not show passing (the file exits before it, or it fails) is reported (audit 71)', async (t) => {
  const HEAD = "import { test, describe } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './code.mjs';\n";
  const CORE = "test('f is one', () => {\n  assert.equal(f(), 1);\n});\n";
  const NOT_RUN = 'f is one: does not run: node --test of its file did not run it (the file exits or stops before it?)';
  const make = (code = 'export const f = () => 1;\n') => {
    const dir = repo(HEAD + CORE, ['f is one']); t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'tests/code.mjs'), code);
    return dir;
  };
  const loads = async dir => (await assertLoads(dir)).map(p => `${p.title}: ${p.problem}`);
  assert.deepEqual(await loads(make()), [], 'a file that runs its test as recorded');
  for (const before of ['process.exit(0);', 'process.reallyExit(0);', "process.kill(process.pid, 'SIGKILL');", 'await new Promise(() => {}); // never settles, so node:test never starts',
    "throw new Error('stop');", "if (!process.env.PROTECT_NEVER_SET) process.exit();"]) {
    const dir = make('export const f = () => 2;\n'); // the regression the test should catch
    edit(dir, () => HEAD + before + '\n' + CORE);
    assert.deepEqual(problems(dir), [], 'the scan sees the test as it was recorded');
    assert.deepEqual(await loads(dir), [NOT_RUN], before);
  }
  // a test that runs and fails, one made a skip at run time, one cut short by an exit in an earlier test
  const fails = make('export const f = () => 2;\n');
  assert.deepEqual(await loads(fails), ['f is one: fails: node --test of its file ran it and it did not pass']);
  const skipped = make(); edit(skipped, () => HEAD + "import { beforeEach } from 'node:test';\nbeforeEach(t => t.skip());\n" + CORE);
  assert.deepEqual((await assertLoads(skipped, undefined, { skips: false })).map(p => `${p.title}: ${p.problem}`), ['f is one: does not run: node --test of its file skipped it'], 'in CI');
  assert.deepEqual(await assertLoads(skipped, undefined, { skips: true }), [], 'outside CI, where bpmn-xml\'s tests skip with no bpmn-moddle');
  const early = make(); edit(early, () => HEAD + "test('first', () => { process.exit(0); });\n" + CORE);
  assert.deepEqual(await loads(early), [NOT_RUN]);
  // a line printed to stdout that reads as TAP is no pass
  const forged = make('export const f = () => 2;\n'); edit(forged, () => HEAD + "console.log('ok 1 - f is one');\nprocess.exit(0);\n" + CORE);
  assert.deepEqual(await loads(forged), [NOT_RUN]);
  // what stays fine: a protected test in a describe, a title with # and \\ in it, a repeated title (the second one), a timed one (not run here)
  const NAMES = "describe('group', () => { test('inner # one \\\\ two', () => { assert.equal(f(), 1); }); });\ntest('again', () => { assert.ok(f()); });\ntest('again', () => { assert.equal(f(), 1); });\ntest('slow (timed)', () => { assert.equal(f(), 1); });\n";
  const fine = repo(HEAD + NAMES, ['inner # one \\ two', 'again #2', 'slow (timed)']); t.after(() => rmSync(fine, { recursive: true, force: true }));
  writeFileSync(join(fine, 'tests/code.mjs'), 'export const f = () => 1;\n');
  assert.deepEqual(await loads(fine), []);
  writeFileSync(join(fine, 'tests/code.mjs'), 'export const f = () => 2;\n');
  assert.deepEqual(await loads(fine), ['inner # one \\ two: fails: node --test of its file ran it and it did not pass', 'again #2: fails: node --test of its file ran it and it did not pass']);
  // the command says it and exits 1
  const dir = make('export const f = () => 2;\n'); edit(dir, () => HEAD + 'process.exit(0);\n' + CORE);
  let out = '', code = 0;
  try { execFileSync(process.execPath, [tool, '--root', dir], { encoding: 'utf8', stdio: 'pipe' }); } catch (e) { code = e.status; out = e.stdout; }
  assert.equal(code, 1);
  assert.deepEqual(out.trim().split('\n'), [`tests/x.test.mjs: "${NOT_RUN.replace(': ', '": ')}`, '1 of 1 protected tests gone or changed: ask the maintainer, who runs node tools/protect.mjs --update after approving']);
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
