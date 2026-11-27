// A preload for tools/protect.mjs (node --import): it records node:assert's objects as the process starts, everything
// reachable from node:assert and node:assert/strict through own properties, and at exit compares them. A file that
// changed one, by whatever name it reached it (an import under another name, process.getBuiltinModule, createRequire, a
// dynamic import, an escaped identifier, Reflect.set: audit 69), makes the process say so on stderr and exit 1.
const MARK = 'protect: node:assert changed: ';
const roots = [['assert', process.getBuiltinModule('node:assert')], ['assert/strict', process.getBuiltinModule('node:assert/strict')]];
const own = o => Reflect.ownKeys(o).map(k => [k, Object.getOwnPropertyDescriptor(o, k)]);
const snap = () => {
  const seen = new Map(), todo = [...roots]; // breadth first, so each object is named by its shortest path
  for (let i = 0; i < todo.length; i++) {
    const [path, o] = todo[i];
    if (o === null || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue;
    const props = own(o);
    seen.set(o, { path, proto: Object.getPrototypeOf(o), extensible: Object.isExtensible(o), props });
    for (const [k, d] of props) if ('value' in d) todo.push([`${path}.${String(k)}`, d.value]);
  }
  return seen;
};
const same = (a, b) => ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(f => Object.is(a[f], b[f]));
const was = snap();
process.on('exit', () => {
  const now = snap();
  for (const [o, w] of was) {
    const n = now.get(o), at = n ? new Map(n.props) : null, key = at && w.props.find(([k, d]) => !at.has(k) || !same(d, at.get(k)));
    const why = !n ? `${w.path} is no longer reached` : n.proto !== w.proto ? `${w.path}'s prototype was changed`
      : n.extensible !== w.extensible ? `${w.path} was frozen or sealed` : key ? `${w.path}.${String(key[0])} was changed or deleted`
        : n.props.length !== w.props.length ? `${w.path} has a new property` : null;
    if (why) { process.stderr.write(MARK + why + '\n'); process.exitCode = 1; return; }
  }
  for (const [o, n] of now) if (!was.has(o)) { process.stderr.write(`${MARK}${n.path} is new\n`); process.exitCode = 1; return; }
});
