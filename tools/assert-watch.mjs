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
import { createHook } from 'node:async_hooks';
import { writeSync } from 'node:fs';
import { beforeEach, afterEach } from 'node:test';

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
createHook({ before: look }).enable();
beforeEach(t => { look(); running = t.name; });
afterEach(t => { look(); last = t.name; running = null; });
process.on('exit', () => { look(); if (said) process.exitCode = 1; });
