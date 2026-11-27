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
import { createHook } from 'node:async_hooks';
import { readFileSync, unlinkSync, writeSync } from 'node:fs';
import { hash } from 'node:crypto';
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
let ctx = null, seq = 0; // TestContext's name and passed getters and its diagnostic(), as the first hook saw them
const take = t => { if (!ctx) { const p = protoOf(t); ctx = { name: getOwn(p, 'name').get, passed: getOwn(p, 'passed').get, diagnostic: p.diagnostic }; } };
const sign = t => {
  if (KEY === null) return;
  take(t);
  const name = apply(ctx.name, t, []), body = stringify({ __proto__: null, seq: seq++, name: typeof name === 'string' ? name : '', status: apply(ctx.passed, t, []) === true ? 'ok' : 'not ok' });
  apply(ctx.diagnostic, t, [`protect-ran ${hash('sha256', KEY + hash('sha256', KEY + body))} ${body}`]);
};
createHook({ before: look }).enable();
before(t => { take(t); });
beforeEach(t => { take(t); look(); running = t.name; });
afterEach(t => { sign(t); look(); last = t.name; running = null; });
process.on('exit', () => { look(); if (said) process.exitCode = 1; });
