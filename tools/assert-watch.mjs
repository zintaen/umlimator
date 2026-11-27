// A preload for tools/protect.mjs (node --import): it records node:assert's objects as the process starts, everything
// reachable from node:assert and node:assert/strict through own properties, and compares them again and again while the
// file loads and its tests run. A file that changed one, by whatever name it reached it (an import under another name,
// process.getBuiltinModule, createRequire, a dynamic import, an escaped identifier, Reflect.set: audit 69), makes the
// process say so on stderr at once and exit 1.
//
// When it compares (audit 70): before each test and after it (hooks at the root, which node:test runs around every test),
// before every callback the event loop runs (an async hook: after a load, a hook, a timer or an await of a test, so a
// change made in a describe's beforeEach and put back in its afterEach is seen before the test's own code goes on), and
// at exit. What it says it writes with the stderr descriptor it held from the start, so an exit listener placed ahead of
// its own, which puts node:assert back before exit, comes too late.
//
// What each test did (audit 73): node:test's child process reports its events on its own stdout, where the file can write
// event frames of its own (a pass for a test that never ran). So when tools/protect-run.mjs names a key file in
// PROTECT_KEY_FILE, this preload reads the key and removes the file and the variable before the file loads, and after
// each test adds a diagnostic to that test's report, { seq, name, status }, signed with the key: protect-run.mjs counts a
// pass only where a signed one stands for it. The functions it signs and reports with are taken as it loads (the context's
// getters as the first hook runs, before any of the file's hooks), so a file that replaces them later changes nothing here.
//
// What a signed diagnostic says is the test itself (audit 74), not only its title: a file that added a passing subtest of
// a protected test's title got an 'ok' signed for that title, and rewrote its own frames so that the protected test's
// fail read as a pass where it is called. So the diagnostic also holds the test's full name (its describes' and parent
// tests' titles), and the file, line and column of the call that made it (test(), it(), t.test()), as this preload saw
// them on the stack when node:test made the test (an async hook on each Test, node:test's async resource, as it is made):
// { seq, name, path, file, line, column, script, scripts, status }, where script is V8's id of the script that made the
// call and scripts how many scripts made tests under that file's name by then, so a call made from code evaluated under
// the file's name (eval with a sourceURL, vm with a filename) is told apart from the file's own, also when it runs first.
import { createHook } from 'node:async_hooks';
import { readFileSync, unlinkSync, writeSync } from 'node:fs';
import { hash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getCallSites } from 'node:util';
import { before, beforeEach, afterEach } from 'node:test';

const MARK = 'protect: node:assert changed: ', write = writeSync, Is = Object.is;
const roots = [['assert', process.getBuiltinModule('node:assert')], ['assert/strict', process.getBuiltinModule('node:assert/strict')]];
const { ownKeys, getPrototypeOf, isExtensible } = Reflect, describe = Object.getOwnPropertyDescriptor;
const own = o => ownKeys(o).map(k => [k, describe(o, k)]);
const snap = () => {
  const seen = new Map(), todo = [...roots]; // breadth first, so each object is named by its shortest path
  for (let i = 0; i < todo.length; i++) {
    const [path, o] = todo[i];
    if (o === null || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue;
    const props = own(o);
    seen.set(o, { path, proto: getPrototypeOf(o), extensible: isExtensible(o), props });
    for (const [k, d] of props) if ('value' in d) todo.push([`${path}.${String(k)}`, d.value]);
  }
  return seen;
};
const same = (a, b) => ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(f => Is(a[f], b[f]));
const was = snap();
const changed = () => { // what changed, or null
  const now = snap();
  for (const [o, w] of was) {
    const n = now.get(o), at = n ? new Map(n.props) : null, key = at && w.props.find(([k, d]) => !at.has(k) || !same(d, at.get(k)));
    const why = !n ? `${w.path} is no longer reached` : n.proto !== w.proto ? `${w.path}'s prototype was changed`
      : n.extensible !== w.extensible ? `${w.path} was frozen or sealed` : key ? `${w.path}.${String(key[0])} was changed or deleted`
        : n.props.length !== w.props.length ? `${w.path} has a new property` : null;
    if (why) return why;
  }
  for (const [o, n] of now) if (!was.has(o)) return `${n.path} is new`;
  return null;
};
let said = false, busy = false, last = null, running = null; // the test that ran last, the one running now
const where = () => running !== null ? `while "${running}" ran` : last !== null ? `after "${last}" ran` : 'as the file loads';
const look = () => {
  if (said || busy) return;
  busy = true;
  try {
    const why = changed();
    if (why) { said = true; write(2, `${MARK}${why} ${where()}\n`); process.exitCode = 1; }
  } finally { busy = false; }
};
const KEY = (() => {
  const at = process.env.PROTECT_KEY_FILE;
  if (!at) return null;
  delete process.env.PROTECT_KEY_FILE;
  try { return readFileSync(at, 'utf8'); } catch { return null; } finally { try { unlinkSync(at); } catch {} }
})();
const apply = Reflect.apply, stringify = JSON.stringify, getOwn = Object.getOwnPropertyDescriptor, protoOf = Object.getPrototypeOf;
const sites = getCallSites, toPath = fileURLToPath, SELF = import.meta.url, startsWith = String.prototype.startsWith;
// where each test was made: node:test's Test is an async resource, so this hook sees each one as it is made, with the call
// that made it on the stack; the first frame that is neither node's own nor this preload's is that call
const made = [], at = new WeakMap(), wmGet = WeakMap.prototype.get, wmSet = WeakMap.prototype.set; // [Test, where], then by the Test's signal
const scripts = { __proto__: null }; // file -> { n, ids }: how many scripts made tests under that name so far
const made1 = (id, type, trigger, test) => {
  if (KEY === null || type !== 'Test') return;
  let where = null;
  try {
    const frames = sites(64);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], s = f.scriptName;
      if (typeof s !== 'string' || s === SELF || apply(startsWith, s, ['node:'])) continue;
      where = { file: apply(startsWith, s, ['file:']) ? toPath(s) : s, line: f.lineNumber, column: f.column, script: String(f.scriptId) };
      const seen = scripts[where.file] ??= { n: 0, ids: { __proto__: null } };
      if (!seen.ids[where.script]) { seen.ids[where.script] = true; seen.n++; }
      break;
    }
  } catch {}
  made[made.length] = [test, where];
};
let ctx = null, seq = 0; // TestContext's getters and its diagnostic(), as the first hook saw them
const take = t => { if (!ctx) { const p = protoOf(t); ctx = { name: getOwn(p, 'name').get, fullName: getOwn(p, 'fullName').get, passed: getOwn(p, 'passed').get, signal: getOwn(p, 'signal').get, diagnostic: p.diagnostic }; } };
const sign = t => {
  if (KEY === null) return;
  take(t);
  const name = apply(ctx.name, t, []), path = apply(ctx.fullName, t, []), signal = apply(ctx.signal, t, []);
  for (let i = 0; i < made.length; i++) if (made[i][0].signal) apply(wmSet, at, [made[i][0].signal, made[i]]); // made by now
  made.length = 0;
  const found = (signal && apply(wmGet, at, [signal])) || null, test = found && found[0], where = found && found[1]; // the Test this context runs (each has its own signal)
  const status = test?.skipped === true ? 'skip' : apply(ctx.passed, t, []) === true ? 'ok' : 'not ok';
  const body = stringify({ __proto__: null, seq: seq++, name: typeof name === 'string' ? name : '', path: typeof path === 'string' ? path : '', file: where?.file ?? null, line: where?.line ?? null, column: where?.column ?? null, script: where?.script ?? null, scripts: where ? scripts[where.file].n : 0, status });
  apply(ctx.diagnostic, t, [`protect-ran ${hash('sha256', KEY + hash('sha256', KEY + body))} ${body}`]);
};
createHook({ before: look, init: made1 }).enable();
before(t => { take(t); });
beforeEach(t => { take(t); look(); running = t.name; });
afterEach(t => { sign(t); look(); last = t.name; running = null; });
process.on('exit', () => { look(); if (said) process.exitCode = 1; });
