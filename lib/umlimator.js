/*! umlimator: embeddable, layered architecture maps. MIT, see LICENSE.
 *
 *   import { render, layout, mountPage } from './umlimator.js';
 *   const map = render(element, model, { on: { select: e => ... } });   // map.update(model), map.destroy()
 *
 * Derived from the /visual page template of super-board by Eric Tech (MIT, THIRD_PARTY_NOTICES.md), whose section
 * layout adapts BuilderIO/skills (MIT) and whose diagram style, router approach and viewer UX (camera with reading
 * depths, minimap, node focus, finder, export) adapt tt-a1i/archify (MIT). See THIRD_PARTY_NOTICES.md.
 * Built from src/ by tools/build.mjs: edit the sources, not this file. No dependencies, no network calls;
 * docs/module-api.md describes the API.
 */
// an object that holds itself (a host's cycle, which copyOf() keeps) is written "[cycle]" where it comes back on its own path (audit 27:
// the sorted copy the replacer gives is new each time, so JSON.stringify's own check never fired and the stack overflowed)
// a BigInt marked, so jsonText() writes it bare (2n), not as the text "2n"; a text that starts as the mark does gets one more (audit 29).
// Always marked, so diff() never reads the text "2n" and the BigInt 2n as one value (audit 31: it compared unmarked); so is a number
// JSON writes as null (NaN, Infinity, -Infinity), which jsonText() writes bare and diff() tells from null (audit 31)
// A value nested deeper than JSON.stringify's stack takes (members thousands deep) is written by canonDeep, the same text (audit 35)
const canon = x => { try { return canonFast(x); } catch (e) { if (e instanceof RangeError) return canonDeep(x); throw e; } };
const canonFast = x => { const path = [], of = new WeakMap(); // path: the objects above the value written, as the model has them
  return JSON.stringify(x, function (k, v) { const h = of.get(this) || this, i = path.lastIndexOf(h); if (i < 0) path.push(h); else path.length = i + 1;
    if (typeof v === 'bigint') return '\u0000' + v + 'n'; if (typeof v === 'number' && !Number.isFinite(v)) return '\u0000' + v; if (typeof v === 'string' && v[0] === '\u0000') return '\u0000' + v;
    if (!v || typeof v !== 'object') return v; if (path.includes(v)) return '[cycle]'; // a BigInt, which JSON cannot write, as 10n (audit 28)
    const y = Array.isArray(v) ? v : Object.fromEntries(Object.keys(v).sort().map(f => [f, v[f]])); of.set(y, v); return y; }); };
/* canon() with no recursion: JSON.stringify's own steps (a toJSON run with its key, then canon's replacer, then the value
   written; undefined, a function or a Symbol left out of an object and null in a list) on a stack of open objects and lists,
   each with its parts written so far. above: the objects open, as the model has them (canon's path) */
const canonDeep = x => {
  const above = new Set(), q = JSON.stringify;
  const one = (v, k) => { if (v !== null && (typeof v === 'object' || typeof v === 'bigint')) { const f = v.toJSON; if (typeof f === 'function') v = f.call(v, k); }
    if (typeof v === 'bigint') v = '\u0000' + v + 'n'; else if (typeof v === 'number' && !Number.isFinite(v)) v = '\u0000' + v; else if (typeof v === 'string' && v[0] === '\u0000') v = '\u0000' + v;
    else if (v && typeof v === 'object') { if (above.has(v)) v = '[cycle]';
      else { const list = Array.isArray(v), y = list ? v : Object.fromEntries(Object.keys(v).sort().map(f => [f, v[f]])), keys = list ? null : Object.keys(y);
        return { v, list, y, keys, n: list ? y.length : keys.length, i: 0, parts: [], k }; } }
    return v === null ? 'null' : v === true ? 'true' : v === false ? 'false' : typeof v === 'string' ? q(v) : typeof v === 'number' ? String(v) : undefined; };
  const put = (F, k, r) => { if (F.list) F.parts.push(r === undefined ? 'null' : r); else if (r !== undefined) F.parts.push(q(k) + ':' + r); };
  const top = one(x, ''); if (typeof top !== 'object') return top;
  const s = [top]; above.add(top.v);
  for (;;) { const F = s[s.length - 1];
    if (F.i < F.n) { const k = F.list ? String(F.i) : F.keys[F.i]; F.i++; const r = one(F.y[k], k);
      if (r !== null && typeof r === 'object') { s.push(r); above.add(r.v); } else put(F, k, r); continue; }
    s.pop(); above.delete(F.v); const t = F.list ? '[' + F.parts.join(',') + ']' : '{' + F.parts.join(',') + '}';
    if (!s.length) return t; put(s[s.length - 1], F.k, t); }
};
// any value as text, to show or tell two apart: JSON, else (a host's cycle or BigInt, which JSON.stringify throws on) as canon() writes it (audit 28),
// each text value canon() marked read back: a BigInt's mark bare (2n), a text that starts with NUL with the one NUL it has (audit 30: it kept
// the second). A key (a text followed by :) is never marked, so it is left as written. A number JSON writes as null (NaN, Infinity) is
// written bare too, as the host wrote it (audit 31: "time null is not a number"). A value that throws even so (a host's toJSON
// that throws, which JSON.stringify runs again) is "[unreadable]", never an error out of a message (audit 31). The replacer runs only
// when JSON wrote a null, so a whole model (render.js's same-model test) is written at JSON.stringify's own speed
const FINITE = (k, v) => { if (typeof v === 'number' && !Number.isFinite(v)) throw v; return v; };
const jsonText = x => { try { const s = JSON.stringify(x); return s === undefined || !s.includes('null') ? s : JSON.stringify(x, FINITE); } catch { try { return canon(x).replace(/"(?:[^"\\]|\\.)*"(:?)/g, (t, key) =>
  key || !t.startsWith('"\\u0000') ? t : /^"\\u0000(?:-?\d+n|NaN|-?Infinity)"$/.test(t) ? t.slice(7, -1) : '"' + t.slice(7)); } catch { return '[unreadable]'; } } };

/* ---------- the model's version and the typed core (schema version 2: docs/diagrams/model.md) ----------
   A model with no schemaVersion is version 1, a map, and reads as it always has. Version 2 adds typed elements: each in
   one envelope ({ id, type, label, parent, props, members }), with nodes, edges, members, fragments and a timing view's
   changes and constraints in one id space; a view with a `diagram` is a typed view. This release reads both, and
   refuses a newer version rather than draw it wrongly (risks.md F6). */
const SCHEMA_VERSION = 2;

/* What is wrong with a model's schemaVersion, or null: { level, message }. A whole number newer than 2 is an error: that
   model is drawn wrongly otherwise (F6). Any other value that is not 1 or 2 (0, 1.5, "2"), which a host may have set
   for its own reasons before version 2 existed, is a warning and the model reads as a map. None and null are fine. */
function versionProblem(model) {
  const v = model && typeof model === 'object' ? model.schemaVersion : undefined;
  if (v == null || v === 1 || v === SCHEMA_VERSION) return null;
  if (!Number.isInteger(v) || v < 1) return { level: 'warning', message: `schemaVersion ${jsonText(v)} is not a version (1 or 2): read as a map (1)` };
  return { level: 'error', message: `schemaVersion ${v} is newer than this release reads (${SCHEMA_VERSION}): upgrade umlimator to read it` };
}

/* migrate(model): the model at the version this release reads. Versions 1 and 2 are read as they are, so the model comes
   back unchanged: lines without an id keep their positional names ("a->b#0"), which stories, lenses and hosts hold
   (risks.md F9). A newer version throws. */
export function migrate(model) {
  const p = versionProblem(model);
  if (p && p.level === 'error') throw new Error(p.message);
  return model;
}

/* String() throws on an object whose own toString is no function, and {"toString": 1} is valid JSON (audit 19).
   unreadable(model): the paths of such objects, and the model without them (itself when it has none, else a copy).
   A map by id or name may have a key named toString: only what it holds is checked. So may a map one level further down,
   by name too: a stereotype's tagged values (tags.<stereotype>.<tag>) and a part's ports (present.<part>.ports.<port>)
   (audit 20). Any value may be read this way: a host's spans or traffic too. A walk with a list, no recursion.
   A list's entry left out moves the entries after it up one in the copy: back(path) names a path in the copy as the model
   has it (audit 22: a problem with the next entry was said one entry too early, on the left-out one, and dropped). */
const BY_ID = new Set(['layout', 'nodeOverrides', 'present', 'authors', 'icons', 'tags']);
// a value unreadable() leaves out: an object it cannot read the keys of, or a value that throws when read (a host's Proxy,
// a getter), stands in its copy as one more object whose toString is no function (audit 24); never in what copyOf() gives
// anyone else, where such a value is left out (audit 25: a shared frozen stand-in in apply()'s model took no set)
const GONE = Object.freeze({ toString: undefined });
/* a deep copy of a host's model: structuredClone, and when that throws (a function, a Symbol, a Proxy: audit 24) a copy
   walked by hand, cycles and gaps kept, with a list, no recursion. Each key is written as an own one (a key named __proto__
   stays a key, never the copy's prototype). An object that is no plain object or list (a Date, a Map, a Set) is
   structuredClone'd alone (audit 25: they came back as {}); when that throws too (a class's instance with a method, a Map
   holding a function) it is copied by hand all the same, a Map or Set entry by entry, anything else key by key into a plain
   object, as structuredClone copies a class's instance (audit 26: it was kept as it was, and apply() and layout() wrote into
   the host's model). Kept as they are: what is no object (a function, a Symbol), and an object whose contents cannot be
   read (a WeakMap, a WeakSet, a Promise). A value that cannot be read is left out, a list's entries after it moved up one;
   mark: what stands in its place instead (GONE, for unreadable() to find) */
const SEALED = [WeakMap, WeakSet, globalThis.WeakRef, Promise].filter(Boolean);
const ownKey = (o, k, value) => Object.defineProperty(o, k, { value, writable: true, enumerable: true, configurable: true });
function copyOf(model, mark) {
  try { return structuredClone(model); } catch { /* not cloneable: copied by hand below */ }
  const obj = x => x !== null && typeof x === 'object', made = new Map(), todo = [], NONE = mark || {}, index = /^(?:0|[1-9]\d*)$/;
  const take = x => { if (!obj(x)) return x; if (made.has(x)) return made.get(x); let keys, list, plain, n;
    try { list = Array.isArray(x); const p = Object.getPrototypeOf(x); plain = p === null || (list ? Array.isArray(p) : Object.getPrototypeOf(p) === null);
      keys = Object.keys(x); n = list ? x.length : 0; } catch { return NONE; } // a list's prototype is a list: Array.prototype, in any realm
    if (!plain) { try { const y = structuredClone(x); made.set(x, y); return y; } catch { /* copied by hand below (audit 26) */ }
      if (SEALED.some(C => x instanceof C)) { made.set(x, x); return x; } // a WeakMap's entries cannot be read: kept as it is
      let es = null; try { es = x instanceof Map ? [...x] : x instanceof Set ? [...x].map(v => [v, v]) : null; } catch { return NONE; }
      if (es) { const y = x instanceof Map ? new Map() : new Set(); made.set(x, y); todo.push([x, y, es, 'entries']); return y; }
    } // anything else as a plain object or list is (structuredClone too makes a class's instance a plain object)
    const y = list ? new Array(n) : {}; made.set(x, y); todo.push([x, y, keys, list]); return y; };
  const out = take(model);
  while (todo.length) { const [x, y, keys, list] = todo.pop(); let off = 0;
    if (list === 'entries') { for (const [k, v] of keys) { const a = take(k), b = take(v); if (a === NONE || b === NONE) continue; if (y instanceof Map) y.set(a, b); else y.add(a); } continue; }
    for (const k of keys) { let v; try { v = take(x[k]); } catch { v = NONE; } const at = list && index.test(k);
      if (v === NONE && !mark) { if (at) off++; continue; }
      ownKey(y, at && off ? String(+k - off) : k, v); }
    if (off) y.length -= off; }
  return out === NONE ? {} : out;
}
/* usedIds(model, into): every id the model holds, into a Set (a new one by default): each string under a key named id, in any
   object or list, at any depth, as JSON.stringify's replacer read them before (a new element's id is the first one free). A walk
   with a list and a seen set, no recursion, so a host's cycle or a BigInt, which JSON.stringify throws on, is read too (audit 28);
   a value that throws when read (a getter, a Proxy) holds no id. */
function usedIds(model, into = new Set()) {
  const todo = [model], seen = new Set();
  while (todo.length) { const o = todo.pop(); if (o === null || typeof o !== 'object' || seen.has(o)) continue; seen.add(o);
    let keys; try { keys = Object.keys(o); } catch { continue; }
    for (const k of keys) { let v; try { v = o[k]; } catch { continue; }
      if (k === 'id' && typeof v === 'string') into.add(v); else if (v !== null && typeof v === 'object') todo.push(v); } }
  return into;
}
// a value no text is read from though it has a toString: a Symbol (String() writes one, a template or + throws), an object whose
// toString or toPrimitive throws, and one whose toJSON throws (JSON.stringify runs it: jsonText(), diff()'s canon). Each is left
// out as unreadable() leaves out a toString that is no function (audit 31: validate(), describe(), diff() and the Mermaid writers
// threw). Only a host's own conversion is run: Object's and Array's toString (which reads the entries, each checked) and Date's
// toJSON are not
const STOCK = new Set([Object.prototype.toString, Array.prototype.toString, Date.prototype.toJSON, Object.prototype.valueOf]);
const noTextIn = x => { if (typeof x === 'symbol') return true; if (x === null || typeof x !== 'object') return false;
  try { const t = x.toString, p = x[Symbol.toPrimitive], j = x.toJSON, v = x.valueOf;
    if (typeof j === 'function' && !STOCK.has(j)) j.call(x, '');
    if (typeof p === 'function' || (typeof t === 'function' && !STOCK.has(t))) String(x); // no function: the copy is a plain object (bare)
    // + and == read a value by its valueOf first (the default hint), String() by its toString: a host's own valueOf that
    // throws, its toString fine, threw out of the class writer's parameters and validate()'s parent (audit 32)
    if (typeof p === 'function' || typeof v === 'function' && !STOCK.has(v)) void ('' + x);
    return false; } catch { return true; } };
function unreadable(model) {
  const bad = x => { try { return x !== null && typeof x === 'object' && Object.hasOwn(x, 'toString') && typeof x.toString !== 'function'; } catch { return true; } };
  // role: what the object walked is. 'tags' (its values are maps by tag name), 'present' (by element id), 'part' (one
  // element's entry in present, whose ports is a map by port id)
  const cut = new Map(); // a list's path -> the indices left out of it, as the model has them, rising
  // an object whose keys or values cannot be read (a host's Proxy, a getter that throws) is left out as one with a toString
  // that is no function is, in a map by id too (audit 24)
  const thrown = new Set(), mute = new Set(); // paths of values that threw when read; of values no text is read from (noTextIn)
  // an object String() finds no toString in (one with no prototype: a host's table by name, a parsed query string) is read, not left
  // out: the copy is a plain object, whose toString is Object's (audit 30: validate() and the ER, requirement and state writers threw)
  let bare = false; const noText = o => { try { return typeof o.toString !== 'function' && typeof o[Symbol.toPrimitive] !== 'function'; } catch { return false; } };
  const walk = (root, fix) => { const at = [], todo = [[root, '', null]], seen = new Set();
    while (todo.length) { const [o, p, role] = todo.pop(); if (seen.has(o)) continue; seen.add(o); if (!fix && !bare && noText(o)) bare = true;
      // keys that cannot be read: said at the object's own path (the copy holds it as one more left-out value: copyOf)
      const list = Array.isArray(o); let keys; try { keys = Object.keys(o); } catch { at.push(p); if (!fix) thrown.add(p); continue; }
      for (let i = keys.length - 1; i >= 0; i--) { const k = keys[i], q = list ? `${p}[${k}]` : p ? `${p}.${k}` : k; let x, gone = false;
        try { x = o[k]; } catch { gone = true; }
        const map = !list && (BY_ID.has(k) || role === 'tags' || (role === 'part' && k === 'ports'));
        // in the copy, what the model's walk found (a class's instance whose toString throws is a plain object there)
        const odd = fix ? mute.has(q) : !gone && x !== GONE && !map && !bad(x) && noTextIn(x);
        if (gone || x === GONE || bad(x) && !map || odd) { at.push(q); if (gone && !fix) thrown.add(q); if (odd && !fix) mute.add(q); if (fix && list) { o.splice(+k, 1); cut.set(p, [+k, ...cut.get(p) || []]); } else if (fix) delete o[k]; }
        else if (x !== null && typeof x === 'object') todo.push([x, q, list ? null : role === 'present' ? 'part' : role ? null : k === 'tags' || k === 'present' ? k : null]); } }
    return at; };
  const same = path => path;
  if (!model || typeof model !== 'object') return { paths: [], model, back: same, thrown, mute };
  const paths = walk(model, false);
  if (!paths.length && !bare) return { paths, model, back: same, thrown, mute };
  const copy = copyOf(model, GONE); walk(copy, true);
  // each [n] in turn, under the path before it as the model has it: the n-th entry of that list the copy kept
  const back = path => typeof path !== 'string' || !cut.size ? path : path.replace(/\[(\d+)\]/g, (w, n, i, s) => { const gone = cut.get(back(s.slice(0, i)));
    if (!gone) return w; let j = +n; for (const g of gone) if (g <= j) j++; else break; return `[${j}]`; });
  return { paths: paths.sort(), model: copy, back, thrown, mute };
}
// a value as text, read as the model unreadable() gives back reads it: one it would leave out reads as no value
// ("undefined"), so a raw model names a line as the drawn page names it (audit 21); a Symbol, and a value whose own toString
// throws, too (audit 31)
const textOf = x => { try { return typeof x === 'symbol' ? 'undefined' : x === null || typeof x !== 'object' ? String(x) : Object.hasOwn(x, 'toString') && typeof x.toString !== 'function' ? 'undefined' : String(unreadable(x).model); } catch { return 'undefined'; } };
// a table by name a host hands in (drift's and sequenceFromTrace's match): each own key, any name toString too, to text or a
// number; any other value is no entry (audit 21)
const nameTable = x => { const t = new Map(); if (x && typeof x === 'object' && !Array.isArray(x)) Object.keys(x).forEach(k => { const v = x[k]; if (typeof v === 'string' || typeof v === 'number') t.set(k, String(v)); }); return t; };

/* The typed core's structural problems, as validate() words them: { level, path, message }. Only for schema version 2;
   a version-1 model has nothing typed. Ids, references, ownership and typed views; what a type's own properties mean
   is the type's to check (a registered type, from 1.3). */
// a label that is neither text nor a number (a list, an object, true) is drawn and announced as String() writes it, "[object Object]":
// said by validate() for a card, a line, a member and every other element (audit 29). A number is drawn as written; null is no label
// what names an element: its label, else its id. A number is a label, 0 too (audit 30: `label || id` named a card labelled 0 by its id).
// Text of only spaces or line breaks shows nothing, so it names as "" does (audit 52: a lifeline labelled "   " was "Lifeline     : T")
const labelOr = (label, id) => label == null || (typeof label === 'string' && label.trim() === '') ? id : label;
// what every typed view calls an element, in its picture, accessible names, describe(), PDF, hints and messages: its label,
// else its id, so a label "" names it as no label does, as a map's card (audit 35: each type's own `label ?? id` kept "" blank)
const elName = x => String(labelOr(x.label, x.id));
// the one element a name resolves to among its namesakes: one diff() drew back removed makes no live name ambiguous (audit 53:
// a constraint block re-created under a new id lost its expression on the diff page), so the others first, else all of them
const oneNamed = c => { const live = c.filter(n => !isGone(n)), l = live.length ? live : c; return l.length === 1 ? l[0] : null; };
// what diff() drew back removed, the one test every count on the diff page reads (audit 56), so a name there counts as the
// model after's does: an element whose change is 'removed' in any letter case. goneIn, liveLine and liveOf (src/typed/draw.js)
// ask it of a picture's cards and lines
const isGone = x => x !== null && typeof x === 'object' && typeof x.change === 'string' && x.change.toLowerCase() === 'removed';
// key: the field read, a label by default; a view's title too (audit 31: a view's title, a box's label and a card's label in a
// view's nodeOverrides were drawn as "[object Object]" and said nowhere)
// as: what happens to its text, "drawn as" by default; a panel field the picture never draws says so (audit 44)
function labelProblem(x, at, key = 'label', as = 'drawn as') {
  const l = x && typeof x === 'object' ? x[key] : undefined; if (l == null || typeof l === 'string' || typeof l === 'number') return null;
  let shown; try { shown = String(l); } catch { shown = ''; }
  return { level: 'warning', path: `${at}.${key}`, message: `${key} ${jsonText(l)} is not text: ${as} ${jsonText(shown)}` };
}
// the props a typed view draws as text (a requirement's text, a part's multiplicity, a task's documentation), each said as a
// label is when it is not text: a warning at its own path, never a silent "[object Object]" (audit 40)
function propTextProblems(x, at, keys) {
  const P = x && typeof x === 'object' && x.props && typeof x.props === 'object' && !Array.isArray(x.props) ? x.props : null;
  return P ? keys.flatMap(k => (Object.hasOwn(P, k) ? [labelProblem(P, `${at}.props`, k)] : []).filter(Boolean)) : [];
}
// A view's marked copy of a model line, with its id and its ends, is that line drawn back removed, as diff() writes it for a line
// taken out of a view, or with a card or a view (audit 53), or drawn added, for a line or a card put back into a view that lists
// its lines (audit 55): it names the model line, so it is no second element. lines: id -> line
const markedCopy = (lines, e) => { const l = e && typeof e === 'object' ? lines.get(e.id) : null;
  return !!l && typeof l === 'object' && l !== e && typeof e.change === 'string' && /^(removed|added)$/i.test(e.change) && l.from === e.from && l.to === e.to; };
function typedProblems(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => x && typeof x === 'object';
  if (m.schemaVersion !== SCHEMA_VERSION) return out;
  const views = arr(m.views).filter(isObj), TYPE = /^[a-z0-9]+\.[A-Z][A-Za-z0-9]*$/;
  const where = new Map(), kindOf = new Map(), ownerOf = new Map(), parents = [], up = new Set(); // id -> its path, its kind, its owner; [element, path]; the elements whose members are being read
  // on a stack of its own, each member's subtree then its type, in the order a recursion took: members nested thousands
  // deep are read, never a stack overflow (audit 35)
  // a typed view's marked copy of a model line (markedCopy) and its members name the model line's: read, their ids not held
  // again (audit 54: a typed view whose edges list dropped a line had diff() models validate() said "used twice")
  const modelL = new Map(Array.from(arr(m.edges), e => [e && e.id, e]));
  const element = (x0, at0, kind0, owner0, copy0) => { const todo = [() => one(x0, at0, kind0, owner0, copy0)]; while (todo.length) todo.pop()();
  function one(x, at, kind, owner, copy) { // a node, typed edge, member, fragment or timeline item: one id space
    if (!isObj(x)) return err(at, 'an element is an object');
    if (typeof x.id !== 'string' || !x.id) return err(at + '.id', 'a typed element needs an id');
    if (x.id.includes('->')) err(at + '.id', `id "${x.id}" contains "->", which names lines by position`);
    if (!copy) { if (where.has(x.id)) err(at + '.id', `id "${x.id}" is used twice (also ${where.get(x.id)})`); else { where.set(x.id, at); kindOf.set(x.id, kind); } }
    if (owner != null) ownerOf.set(x.id, owner);
    if (kind !== 'node') { const l = labelProblem(x, at); if (l) out.push(l); } // a node's is validate()'s card check, in a map too
    // a stereotype entry that is not text, drawn «[object Object]» over its name in every view that keys it (audit 43)
    const st = isObj(x.props) ? x.props.stereotypes : null; if (Array.isArray(st)) st.forEach((s, k) => { const l = labelProblem({ [`stereotypes[${k}]`]: s }, `${at}.props`, `stereotypes[${k}]`); if (l) out.push(l); });
    if (x.parent != null) parents.push([x, at]);
    if (up.has(x)) return; up.add(x); // a host's member that holds its owner: said used twice, and not read again (audit 28)
    todo.push(() => up.delete(x)); const ms = arr(x.members);
    for (let j = ms.length - 1; j >= 0; j--) { if (!(j in ms)) continue; const y = ms[j]; todo.push(() => typeOf(y, `${at}.members[${j}]`, true, 'member'), () => one(y, `${at}.members[${j}]`, 'member', x.id, copy)); }
  } };
  /* what: 'node', 'line' or 'member'. The warning says what each view that lists the element does with it, as its type draws it
     (audit 30): a member of no kind is drawn in no view; a card or line a map lists is drawn plain; a typed view draws an
     element of no type (or "") as its type's untyped kind (registry.js untypedKind: "drawn as a task") and a line whose type
     has no notation as its untypedLine ("drawn as a data flow"), or not at all. A card's other type no view knows is named as
     written, which the warning does not guess at; nor does it for a card or line no view lists */
  const typedView = v => v.diagram != null && v.diagram !== 'map'; // a view with diagram 'map' is a map: the map's checks
  const VIEWS = arr(m.views).map((v, i) => [v, i]).filter(([v]) => isObj(v));
  const shows = (v, i, x, what, at) => { const own = /^views\[(\d+)\]/.exec(at); if (own) return +own[1] === i;
    if (what === 'node') return arr(v.nodeIds).includes(x.id);
    return Array.isArray(v.edges) ? v.edges.includes(x.id) : arr(v.nodeIds).includes(x.from) && arr(v.nodeIds).includes(x.to); };
  // at: the element's path. A typed view that lists no lines draws only its type's own kinds of line between its cards (each
  // type's writer: a use case view its associations, includes and the like), so a model line of no notation is not drawn there
  // (audit 31: it was said "drawn as a plain line"), unless its type draws every line (T.allLines: a block definition diagram)
  const drawnAs = (v, x, what, at) => { const T = typedView(v) ? diagramOf(v) : null, none = x.type == null || x.type === '', bare = !String(x.type ?? '').includes('.');
    if (!T) return `drawn as a plain ${what === 'line' ? 'line' : 'card'}`;
    if (what === 'line' && bare && !T.allLines && !Array.isArray(v.edges) && !/^views\[/.test(at)) return 'not drawn';
    if (what === 'line') { const w = bare ? untypedLine(T) : Array.isArray(T.drawsOnly) || T.untypedLine === null ? null : 'Line'; return w ? `drawn as ${w === 'Line' ? 'a plain line' : aWord(w.toLowerCase())}` : 'not drawn'; }
    if (!none) return null; const w = untypedKind(T); return w ? `drawn as ${aWord(w.toLowerCase())}` : 'not drawn'; };
  const typeOf = (x, at, needed, what = 'node') => { if (!isObj(x)) return;
    if (!(x.type == null ? needed : typeof x.type !== 'string' || !TYPE.test(x.type))) return;
    let said = what === 'member' ? 'not drawn' : null;
    if (!said) { const by = new Map(); let quiet = false;
      VIEWS.forEach(([v, i]) => { if (!shows(v, i, x, what, at)) return; const p = drawnAs(v, x, what, at); if (p) by.set(p, [...by.get(p) || [], v.id]); else quiet = true; });
      said = !by.size ? null // listed by no view, or by none that says how: drawn nowhere it can tell of
        : by.size === 1 && !quiet ? [...by.keys()][0] : [...by].map(([p, ids]) => `${p} in view ${ids.map(id => jsonText(id)).join(', ')}`).join('; '); }
    // no type at all is said so, not as the value undefined (audit 31: "type undefined is not ...")
    const eg = what === 'line' ? 'uml.Dependency' : what === 'member' ? 'uml.Property' : 'uml.Class';
    warn(at + '.type', `${x.type == null ? `has no <notation>.<Name> type (${eg})` : `type ${jsonText(x.type)} is not <notation>.<Name> (${eg})`}${said ? ': ' + said : ''}`); };
  const nodes = arr(m.nodes);
  nodes.forEach((n, i) => { element(n, `nodes[${i}]`, 'node'); typeOf(n, `nodes[${i}]`, false); });
  const typedEdge = e => isObj(e) && e.type != null;
  arr(m.edges).forEach((e, i) => { if (typedEdge(e)) { element(e, `edges[${i}]`, 'edge'); typeOf(e, `edges[${i}]`, true, 'line'); } });
  views.forEach((v, i) => { if (!typedView(v)) return;
    arr(v.nodes).forEach((n, j) => element(n, `views[${i}].nodes[${j}]`, 'node'));
    arr(v.edges).forEach((e, j) => { if (isObj(e)) { element(e, `views[${i}].edges[${j}]`, 'edge', undefined, markedCopy(modelL, e)); typeOf(e, `views[${i}].edges[${j}]`, true, 'line'); } });
    arr(v.fragments).forEach((f, j) => element(f, `views[${i}].fragments[${j}]`, 'fragment'));
    ['changes', 'constraints'].forEach(k => arr((v.timeline || {})[k]).forEach((c, j) => element(c, `views[${i}].timeline.${k}[${j}]`, 'time'))); });
  const has = id => where.has(id), name = id => jsonText(id); // a host's BigInt written 3n, never thrown on (audit 32)
  const boxes = new Set(views.flatMap(v => arr(v.containers).map(c => isObj(c) && c.id)));
  // ownership: a parent is a node, a member or a fragment, and nothing ends up inside itself, counting a member as
  // inside its owner (M7). Any element may have one: a node, a member, a message (its operand), a fragment
  const homeOf = p => { const r = /^views\[(\d+)\]\./.exec(p); return r ? +r[1] : null; }, heldIn = p => { const r = /^views\[(\d+)\]\.nodes\[/.exec(String(p)); return r ? +r[1] : null; };
  const parentOf = new Map(ownerOf), written = new Set(); // written: elements whose parent is in the model, where a cycle is said
  parents.forEach(([x, at]) => { const k = kindOf.get(x.parent);
    if (!['node', 'member', 'fragment'].includes(k)) err(at + '.parent', `parent ${name(x.parent)} is not ${k ? 'an owner: it is ' + (k === 'edge' ? 'an edge' : 'a timing item') : 'an element'}`);
    else { if (where.get(x.id) === at) { parentOf.set(x.id, x.parent); written.add(x.id); }
      // a parent one view alone holds (its own node, a member of one) is no owner in the other views: a model element, or
      // another view's own one, under it is drawn with no owner there and lifted out when it goes (registry.js ownGuard, audit 24)
      const h = heldIn(where.get(x.parent)); if (h != null && h !== homeOf(at)) warn(at + '.parent', `parent ${name(x.parent)} lives in view ${name(views[h].id)} only: ${homeOf(at) == null ? 'an element of the model' : 'an element of another view'} cannot go under it`); } });
  const walked = new Map(), loop = new Set(); // linear: a walk stops where one went before, a cycle if this one
  for (const id of written) { let p = id;
    for (; p != null && !walked.has(p); p = parentOf.get(p)) walked.set(p, id);
    if (walked.get(p) === id) for (; !loop.has(p); p = parentOf.get(p)) loop.add(p); }
  for (const id of written) if (loop.has(id)) err(where.get(id) + '.parent', `"${id}" ends up inside itself`);
  // a typed edge's ends: a node, a member or a box; a part named on an end is an element
  const ends = (e, at, viewBoxes) => {
    ['from', 'to'].forEach(k => { if (!has(e[k]) && !viewBoxes.has(e[k])) err(`${at}.${k}`, `${name(e[k])} is not an element or a box`);
      const part = (((e.props || {}).ends || {})[k] || {}).part; if (part != null && !has(part)) err(`${at}.props.ends.${k}.part`, `part ${name(part)} is not an element`); });
  };
  arr(m.edges).forEach((e, i) => { if (typedEdge(e)) ends(e, `edges[${i}]`, boxes); });
  const nodeIds = new Set(nodes.filter(isObj).map(n => n.id)), modelEdge = new Map();
  arr(m.edges).forEach(e => { if (typedEdge(e) && typeof e.id === 'string' && !modelEdge.has(e.id)) modelEdge.set(e.id, e); });
  // a line's kind in words: 'uml.Dependency' "dependency", 'sysml.DeriveReqt' "derive reqt"
  const lineWord = t => (String(t).includes('.') ? kindWord(t).toLowerCase() : String(t)); // of no notation: as written (audit 30)
  views.forEach((v, i) => { if (!typedView(v)) return; const at = `views[${i}]`;
    if (typeof v.diagram !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(v.diagram)) warn(at + '.diagram', `diagram ${name(v.diagram)} is not <notation> or <notation>.<kind> (uml.class)`);
    // a type that draws every view one way (layout.direction: a sequence down, a timing diagram right) says a direction itself, in
    // its own words; the core's "drawn right" would be false for it (audit 52)
    const fixed = T0 => T0 && T0.layout && typeof T0.layout === 'object' && typeof T0.layout.direction === 'string';
    if (v.direction != null && !['right', 'down'].includes(v.direction) && !fixed(diagramOf(v))) warn(at + '.direction', `direction ${name(v.direction)} is not right or down: drawn right`);
    arr(v.nodeIds).forEach((id, j) => { if (!nodeIds.has(id) && !arr(v.nodes).some(n => isObj(n) && n.id === id)) err(`${at}.nodeIds[${j}]`, `${name(id)} is not a node`); });
    const mine = new Set(arr(v.containers).map(c => isObj(c) && c.id)), T = diagramOf(v); // an item (the type's items; else no ends) is no line
    const item = e => (T ? arr(T.items).includes(e.type) : e.from == null && e.to == null);
    arr(v.edges).forEach((e, j) => { if (typeof e === 'string') { if (kindOf.get(e) !== 'edge') err(`${at}.edges[${j}]`, `${name(e)} is not a typed edge`); } else if (isObj(e) && !item(e)) ends(e, `${at}.edges[${j}]`, mine); });
    // a type that draws only its own kinds of line (T.drawsOnly: a state machine, a mindmap, a cloud diagram) leaves any other
    // a view lists out of the picture: said, as the interaction overview says it (overview-kinds), never lost silently (audit 28)
    if (T && Array.isArray(T.drawsOnly)) arr(v.edges).forEach((e, j) => { const x = typeof e === 'string' ? modelEdge.get(e) : e;
      if (!isObj(x) || item(x) || T.drawsOnly.includes(x.type)) return; const what = String(T.title || T.name), a = /^[aeiou]/i.test(what) ? 'an' : 'a';
      out.push({ level: 'warning', path: `${at}.edges[${j}]`, ids: typeof x.id === 'string' ? [x.id] : [], message: x.type == null || x.type === ''
        ? `view ${name(v.id)} lists ${name(x.id)}, a line with no type, which ${a} ${what} does not draw: not drawn`
        : `view ${name(v.id)} lists ${lineWord(x.type)} ${name(x.id)}, a line ${a} ${what} does not draw: not drawn` }); });
    if (v.subject != null && !has(v.subject)) err(at + '.subject', `subject ${name(v.subject)} is not an element`);
    ['layout', 'present'].forEach(k => Object.keys(isObj(v[k]) ? v[k] : {}).forEach(id => { if (!has(id)) warn(`${at}.${k}.${id}`, `${name(id)} is not an element: ignored`); })); });
  return out;
}

// the names a Ref gives the lines with no id: "<from>-><to>#<n>", n counting every line with those ends in its list, as
// context.js edgeIds() does. namesOf(list): name -> line. lineNames(m): list -> its names, the list keyed -1 for the model's
// (drawn by a view with no edges list) and i for view i's own; listOf(m, i): the key of the list view i draws
const namesOf = l => { const out = new Map(), seen = {};
  (Array.isArray(l) ? l : []).forEach(e => { if (!e || typeof e !== 'object') return; const k = textOf(e.from) + '->' + textOf(e.to), n = seen[k] = (seen[k] ?? -1) + 1;
    if (e.id == null) out.set(`${k}#${n}`, e); }); return out; };
const listOf = (m, i) => (Array.isArray(m.views[i] && m.views[i].edges) ? i : -1);
const lineNames = m => { const out = new Map([[-1, namesOf(m && m.edges)]]);
  (Array.isArray(m && m.views) ? m.views : []).forEach((v, i) => { if (v && Array.isArray(v.edges)) out.set(i, namesOf(v.edges)); }); return out; };
/* ---------- diagram types (work package 1.3) ----------
   A typed view's `diagram` names its type; a view with none is a map, and the map registers itself as the default
   (src/map/typed.js). A type this release does not know is drawn as plain cards, with a warning. Internal until the
   API is documented. */
const TYPES = new Map();

function registerDiagramType(name, def = {}) {
  if (typeof name !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(name)) throw new TypeError(`a diagram type's name is <notation> or <notation>.<kind> (uml.class), not ${jsonText(name)}`);
  if (TYPES.has(name)) throw new Error(`diagram type "${name}" is registered already`);
  const type = Object.freeze({ ...(def.ownNodes === false ? def : withOwnNodes(def)), name });
  TYPES.set(name, type);
  return type;
}

/* A typed view's own nodes (view.nodes: what apply()'s add { in: 'view' } puts there, docs/editing.md "From 0.18.0") read as
   the model's, for every type (audit 22 did five, audit 23 all): ownMerge(model, views) is the model with the views' own
   nodes after its nodes, one whose id a model node takes being that node (as mapContext reads them); at: each one's
   [view index, place in view.nodes], k: where they start in nodes. registerDiagramType gives a type's layout, boxes,
   validate, describe, rows, text, word, owners and edits that model, and says a problem at one of them at its own path,
   views[i].nodes[j]. A type that reads view.nodes itself says ownNodes: false. Its edits are held to one rule too (ownGuard):
   a model node never has a parent other views lack */
const R_OBJ = x => x !== null && typeof x === 'object' && !Array.isArray(x), R_ARR = x => (Array.isArray(x) ? x : []);
function ownMerge(model, views) {
  const base = R_ARR(R_OBJ(model) ? model.nodes : null), ids = new Set(base.filter(R_OBJ).map(n => n.id)), add = [], at = [], all = R_ARR(R_OBJ(model) ? model.views : null);
  views.forEach(v => { const vi = all.indexOf(v); R_ARR(R_OBJ(v) ? v.nodes : null).forEach((n, j) => { if (R_OBJ(n) && typeof n.id === 'string' && !ids.has(n.id)) { ids.add(n.id); add.push(n); at.push([vi, j]); } }); });
  return { model: add.length ? { ...model, nodes: [...base, ...add] } : model, at, k: base.length };
}
const ownNodes = (model, view) => ownMerge(model, [view]);
// the model with every view's own nodes, the view's first: what a Shift + Delete's hint counts, as apply() deletes one under a
// model element in any view (audit 51)
const everyOwn = (model, view) => ownMerge(model, [...(R_OBJ(view) ? [view] : []), ...R_ARR(R_OBJ(model) ? model.views : null).filter(w => R_OBJ(w) && w !== view && !(R_OBJ(view) && w.id === view.id))]);
// what one view alone holds: its own nodes (none a model element's id takes) and their members, at any depth, by id
function heldBy(model) {
  // members on a stack, in the order a recursion took: thousands deep are read, never a stack overflow (audit 35)
  const mine = new Set(), out = new Map(), put = (x0, s) => { for (const q = [x0]; q.length;) { const x = q.pop(); if (!R_OBJ(x) || typeof x.id !== 'string' || s.has(x.id)) continue;
    if (s === out) out.set(x.id, x); else s.add(x.id); const ms = R_ARR(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) q.push(ms[j]); } };
  [...R_ARR(R_OBJ(model) ? model.nodes : null), ...R_ARR(R_OBJ(model) ? model.edges : null)].forEach(x => put(x, mine));
  R_ARR(R_OBJ(model) ? model.views : null).forEach(v => R_ARR(R_OBJ(v) ? v.nodes : null).forEach(n => { if (R_OBJ(n) && !mine.has(n.id)) put(n, out); }));
  return out;
}
/* a hook's result held to the rule: an add of a model node under what one view alone holds is added to that view (in:
   'view', as mindmap's add does since audit 22) where its palette takes it, else with no parent; a reparent of a model
   element under one is refused, said on the hint line (audit 23: an action added in a view's own partition, deleted with it) */
function ownGuard(model, r) {
  if (R_OBJ(r) && Array.isArray(r.pick) && typeof r.then === 'function') return { ...r, then: i => ownGuard(model, r.then(i)) };
  const list = Array.isArray(r) ? r : R_OBJ(r) && Array.isArray(r.commands) ? r.commands : null; if (!list) return r;
  // a node's cascade refs (a boundary event's props.attachedTo) hold it as its parent does: what one view alone holds and it goes
  // with them (audit 58), so a model node never hangs on one either
  const ties = x => Object.entries(propRefs(x.type)).filter(([, how]) => /\bcascade\b/.test(how)).flatMap(([p]) => [].concat(p.split('.').reduce((o, k) => (R_OBJ(o) ? o[k] : undefined), x)));
  const els = new Map([...R_ARR(model.nodes)].filter(R_OBJ).map(n => [n.id, n]));
  const held = heldBy(model), hold = x0 => { for (const q = [x0], seen = new Set(); q.length;) { const x = q.pop(); if (!R_OBJ(x) || typeof x.id !== 'string' || seen.has(x)) continue; seen.add(x); held.set(x.id, x); for (const y of R_ARR(x.members)) q.push(y); } }, out = [];
  for (const c of list) {
    const x = R_OBJ(c) && c.op === 'add' && R_OBJ(c.element) ? c.element : null;
    // where add { in: 'view' } puts it (apply.js): a view's nodes, not its lines nor its fragments (a sequence's)
    const node = () => { const v = R_ARR(model.views).find(w => R_OBJ(w) && w.id === c.view), T = v ? diagramOf(v) || {} : {}, pal = R_ARR(T.elements);
      return !!v && x.from == null && x.to == null && !R_ARR(T.items).includes(x.type) && (!pal.length || pal.some(t => R_OBJ(t) && t.type === x.type)); };
    if (x && c.in === 'view') { if (node()) hold(x); }
    else if (x && c.owner == null && x.from == null && x.to == null && ((x.parent != null && held.has(x.parent)) || ties(x).some(t => held.has(t)))) {
      if (!(x.parent != null && held.has(x.parent))) { if (node()) { out.push({ ...c, in: 'view' }); hold(x); continue; }
        const t = held.get(ties(x).find(i => held.has(i))); return { error: `${elName(t)} lives in this view only: an element of the model cannot be attached to it` }; }
      if (node()) { out.push({ ...c, in: 'view' }); hold(x); continue; }
      const { parent, ...y } = x; out.push({ ...c, element: y }); continue; }
    else if (R_OBJ(c) && c.op === 'reparent' && c.parent != null && held.has(c.parent) && !held.has(c.id)) {
      const p = held.get(c.parent); return { error: `${elName(p)} lives in this view only: an element of the model cannot go under it` }; }
    else if (R_OBJ(c) && c.op === 'set' && c.view == null && els.has(c.id) && !held.has(c.id) && els.get(c.id).from == null && held.has(c.value)
      && Object.entries(propRefs(els.get(c.id).type)).some(([p, how]) => /\bcascade\b/.test(how) && p === (Array.isArray(c.path) ? c.path.join('.') : c.path))) { // a model node re-attached to one (a boundary event, A or a drop)
      const p = held.get(c.value); return { error: `${elName(p)} lives in this view only: an element of the model cannot be attached to it` }; }
    else if (R_OBJ(c) && c.op === 'move' && c.owner != null && held.has(c.owner) && !held.has(c.id)) { // a member moved to a new owner: the same rule (audit 35)
      const p = held.get(c.owner); return { error: `${elName(p)} lives in this view only: an element of the model cannot go under it` }; }
    out.push(c);
  }
  return Array.isArray(r) ? out : { ...r, commands: out };
}
// each hook wrapped once, by kind: a function two types share (C4's four static names, the Owner field of class and object
// views) stays one function
const OWN_WRAPS = new Map(), ownWrap = (kind, f, make) => { const w = OWN_WRAPS.get(kind) || OWN_WRAPS.set(kind, new WeakMap()).get(kind);
  if (!w.has(f)) w.set(f, Object.assign(make(f), f)); return w.get(f); }; // a hook's own fields (rename.empty, layout.rank) stay
function withOwnNodes(def) {
  const out = { ...def }, L = def.layout, views = model => R_ARR(R_OBJ(model) ? model.views : null), viewOf = (model, id) => views(model).find(v => R_OBJ(v) && v.id === id);
  const M = (model, view) => ownNodes(model, R_OBJ(view) ? view : viewOf(model, view)).model; // a view, or its id (mindmap's hooks take either)
  const typed = model => views(model).filter(v => R_OBJ(v) && v.diagram != null && v.diagram !== 'map'), all = model => ownMerge(model, typed(model));
  const said = (o, ps) => (!o.at.length || !Array.isArray(ps) ? ps : ps.map(p => { const r = /^nodes\[(\d+)\]/.exec(String((R_OBJ(p) ? p.path : '') ?? '')), i = r ? Number(r[1]) - o.k : -1;
    return i >= 0 && i < o.at.length ? { ...p, path: `views[${o.at[i][0]}].nodes[${o.at[i][1]}]` + p.path.slice(r[0].length) } : p; }));
  if (typeof L === 'function') out.layout = ownWrap('layout', L, f => a => f({ ...a, model: M(a.model, a.view) }));
  else if (R_OBJ(L) && typeof L.run === 'function') out.layout = { ...L, run: ownWrap('run', L.run, f => (model, view, o) => f(M(model, view), view, o)) };
  ['boxes', 'rows', 'text', 'touches', 'drawn', 'drawnKeys'].forEach(k => { if (typeof def[k] === 'function') out[k] = ownWrap('view', def[k], f => (model, view, ...rest) => f(M(model, view), view, ...rest)); });
  // with no view (the PDF's word, the Owner field asked by a host): every view's own nodes
  if (typeof def.word === 'function') out.word = ownWrap('word', def.word, f => (model, id, view) => f(view ? M(model, view) : all(model).model, id));
  // the Owner field: a view's own owners too, for what one view alone holds; never for a model element (ownGuard's rule)
  if (typeof def.owners === 'function') out.owners = ownWrap('owners', def.owners, f => (model, x, view) => { const os = f(view ? M(model, view) : all(model).model, x), held = heldBy(model);
    return Array.isArray(os) && R_OBJ(x) && !held.has(x.id) ? os.filter(o => !(R_OBJ(o) && held.has(o.id))) : os; });
  if (typeof def.validate === 'function') out.validate = def.validate.length < 2 ? ownWrap('validate1', def.validate, f => model => { const o = all(model); return said(o, f(o.model)); })
    // a view's, its own nodes first, then the other typed views' (audit 24: a model line from one view's own node is not "from
    // nothing" to another view's rules); a problem at another view's own node is that view's to say, not this one's
    : ownWrap('validate', def.validate, f => (model, view) => { const vs = typed(model), o = ownMerge(model, [view, ...vs.filter(v => v !== view)]), vi = views(model).indexOf(view);
      return said(o, f(o.model, view)).filter(p => { const r = /^views\[(\d+)\]\.nodes\[/.exec(String((R_OBJ(p) ? p.path : '') ?? '')); return !r || Number(r[1]) === vi || !o.at.some(([i]) => i === Number(r[1])); }); });
  if (typeof def.describe === 'function') out.describe = ownWrap('describe', def.describe, f => (model, viewId) => f(M(model, viewOf(model, viewId)), viewId));
  if (R_OBJ(def.edits)) { const ed = {}; Object.getOwnPropertyNames(def.edits).forEach(k => { const d = Object.getOwnPropertyDescriptor(def.edits, k);
      // remove tells a view's own node from the model's: it gets the model as it is
      if (typeof d.value === 'function') d.value = ownWrap(k === 'remove' ? 'remove' : 'edit', d.value, f => (model, view, ...rest) => { const V = R_OBJ(view) ? view : viewOf(model, view);
        return ownGuard(model, f(k === 'remove' || !V ? model : M(model, V), view, ...rest)); });
      Object.defineProperty(ed, k, d); });
    out.edits = ed; }
  return out;
}

/* A definition's fields are optional and provisional; absent, things go as before. notes/spike-sequence.md §1 says what
   each does (validate(model) with no view runs once a type, not once a view); 1.9's: rankFlip, member, rules, describe.
   2.1's (notes/stage-2.md §3, §4.2, §8):
   - boxes(model, view) -> [{ id, label, title, nodeIds, parent, shape, aria }]: the view's boxes, a map's container format plus
     the drawn title, the shape whose frame(f) draws it (SHAPE, src/draw/shapes.js: its border with class family-box, its title
     with class family-title, as svg.js says) and its accessible name. A box's id is in the view's nodeIds but takes no slot:
     the layout context places its nodeIds as a block (blockPos), and the type's layout passes the same boxes to layoutTyped as
     containers. A drop into, out of or between boxes emits reparent, and removes the node's pin; an edit that changes the box
     a shown element is drawn in lays the view out again (render.js withPlaces). None: no boxes, as before.
   - owners(model, element) -> [{ id, label }]: the properties panel's Owner field for that element, a select of these and
     "none", which emits reparent, or what the type's edits.owner returns (src/typed/edit.js) (the element itself and what it
     holds are left out; its owner is added when not offered).
     None, or not a list: no Owner field.
   - layout.pins false: pos is {}, no ranking; layout.rank false: pos is the view's pins alone, no ranking (risks.md P1).
     layout.direction 'down' or 'right': the type draws every view that way and warns of another direction itself (audit 52).
     reroute is no registry field: reroute: false goes in the dg the type's own layout passes to layoutTyped (src/typed/layout.js).
   Stage 4's (notes/stage-4.md §12.1, §15): edits.rename(model, view, id, text); a hook's { pick, then }; name: false and
   opens on a palette entry; a line's cut, its label's width (150); rows(model, view, id) and word(model, id), the PDF's.
   Stage 5's: a line's fromPort, toPort, inner, portRank, a box's pad, round, head, a view's labelGaps (src/typed/layout.js);
   edits.member, edits.key (src/typed/edit.js). Audit 18's: steps true, a view whose lines are numbered by their order in its
   edges (a C4 dynamic view), so diff() says a reorder as it does a map's sequence. Audit 21's: unnamed, the element types
   whose label nothing draws nor says (a combined fragment, a transition): the properties panel offers them no Name field.
   Audit 40's: touches(model, view) -> ids, the elements and lines outside the view's own whose change changes its picture (a
   required stereotype's extension, an identifying relationship that makes a shown entity dependent): diff() lists the view
   when one of them, in the model before or after, is marked; with drawn (the model lines the view draws, an implied line's too). */

/* An element's kind in words, one rule for every type and the PDF (audit 30): a type's last part split at its capitals,
   first letter up ('uml.DataType' "Data type"); a type of no notation, no dot, as written ("toString", "dataflow"), as audit 26
   names one; no type, or "", is no word (''): the type's untypedKind names it. untypedKind(T): the kind a type draws and names
   an element of no type (or "") as, its `untyped` field ("Task", "Lifeline"), "Element" by default, null for a type that does
   not draw one. untypedLine(T): what it draws a line of no notation as (no type, "", or no dot), its `untypedLine` field
   ("Data flow"), "Line" (a plain line) by default, null for none; a type with drawsOnly draws none */
const kindWord = t => { const s = String(t ?? ''); if (!s.includes('.')) return s;
  const w = s.split('.').pop().replace(/([a-z])([A-Z])/g, (_, a, b) => a + ' ' + b.toLowerCase()); return w.charAt(0).toUpperCase() + w.slice(1); };
const untypedKind = T => (T && Object.hasOwn(T, 'untyped') ? T.untyped : 'Element');
const untypedLine = T => (!T ? 'Line' : Array.isArray(T.drawsOnly) ? null : Object.hasOwn(T, 'untypedLine') ? T.untypedLine : 'Line');
// the kind an element is drawn, edited and judged as in a view of type T (audit 30): its type's `untypedAs`, a type (an element of
// no type, or "", drawn as a class: 'uml.Class') or a function of the element (the object view's instance of no UML kind), else its own type
const drawnKind = (T, x) => { if (!x || typeof x !== 'object') return undefined; const a = T && T.untypedAs, k = typeof a === 'function' ? a(x) : x.type == null || x.type === '' ? a : null; return k || x.type; };
const aWord = w => (/^(?!us|uni)[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
// a count of a kind word that varies (a kind outside the view's own): "2 classes", "2 activities", "2 people", never "2 classs" (audit 32)
const countOf = (k, w) => `${k} ${k === 1 ? w : /person$/i.test(w) ? w.slice(0, -4) + 'ople' : /(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : w + 's'}`;
// x's kind in a message, as a view of type T draws it, with its article: "an interface", "a class" (of no type in a class view), "an
// element" (of no type where T draws none, or with no T), never the type's tail behind a fixed "a" (audit 31: "a undefined", "a Interface")
const aKind = (T, x) => aWord((kindWord(drawnKind(T, x)) || untypedKind(T) || 'Element').toLowerCase());

/* A view's type: the map for a view with no diagram, the registered type, or null for one this release does not draw */
const diagramOf = view => TYPES.get(view && view.diagram != null ? view.diagram : 'map') || null;

/* What only a registered type's geometry uses, installed at load time by the files under src/typed/, which only
   lib/umlimator-all.js holds (tools/build.mjs): rows, rooms and routes in layoutPass, a typed line's ends in svgOf, the
   gestures of edit.js it takes over (edit), diff()'s words for typed models (diff, order: src/uml/diff.js). Empty in
   umlimator.js, where no view is laid out but as a map (risks.md C5).
   Stage 6's: across(model), validate()'s rules on the whole model; fields(model, x), more panel fields (notes/stage-6.md §5)
   Milestone 2's (notes/milestone-2.md §6.3, §9): unfolds; text(model, view, id), the PDF's line text; ENDS open to
   families */
const TYPED = {};

// an id-keyed table with no prototype: an id named constructor, toString or __proto__ is an own key like any other
const idTable = (o = {}) => Object.assign(Object.create(null), o);
// a type is text: any other value (one with a toString key, which no key is read from) refers to nothing (audit 21)
const propRefs = type => typeof type !== 'string' ? {} : Object.assign({}, ...[...TYPES.values()].map(T => T.refs && Object.hasOwn(T.refs, type) && T.refs[type]));
const warned = new Set(), warn = m => { if (hush) hush.push(m); else if (!warned.has(m)) { warned.add(m); console.warn('umlimator: ' + m); } }; // each warning once
let hush = null; // a layout tried and maybe dropped (unfolding, #71) keeps its warnings here: only the one kept says them
/* f(), with the warnings it gives held back: [its result, what it would have said] */
const held = f => { const prev = hush; hush = []; try { return [f(), hush]; } finally { hush = prev; } };
// Text width. Without a measurer: a monospace estimate (font-independent, so layouts are the same on every machine;
// the bench and layout() in Node use it). render() measures in the host's own font while it lays out a view: measured().
let measureText = null;
const measured = (M, f) => { const prev = measureText; measureText = M; try { return f(); } finally { measureText = prev; } };
/* markup-safe text: & < > " ' as entities, and a character no XML document may hold (a C0 control but tab, line feed and carriage
   return; U+FFFE, U+FFFF; a lone surrogate) as U+FFFD, as the readers write one (MERMAID_RAWS): a label pasted with one drew it
   raw into <text>, <title> and aria-label, and the page's Export SVG and a still's .svg were no well-formed XML (audit 53).
   One code unit for one: a text is as wide, and wraps where it did */
const XML_BAD = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|\p{Cs}/u, XML_BADS = /[\0-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]|\p{Cs}/gu;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(XML_BADS, '\uFFFD');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/==([^=]+)==/g, '<mark>$1</mark>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const md = s => String(s ?? '').trim().split(/\n{2,}/).map(b => /^\s*[-*] /.test(b)
    ? '<ul>' + b.split(/\n/).map(l => '<li>' + inline(l.replace(/^\s*[-*] /, '')) + '</li>').join('') + '</ul>'
    : '<p>' + inline(b).replace(/\n/g, '<br>') + '</p>').join('');
/* a text's first sentence: up to a period and the white space after it, where the word the period ends is no abbreviation (audit
   54: "Carries orders, e.g. book orders" was cut at "e.g.", "Approx. 100 calls" at "Approx.") and no letter chain ("U.S.", "p.m.").
   Audit 55 ran on past a title, a capital initial and a list number too, but read each anywhere, so "within 200 ms.", "service
   A." and "port 443." never ended a sentence (audit 56). Now: a title (Dr. Mr. Mrs. Ms. Prof., capitalised as written) and "ca."
   only before the word they lead to (a capital; a digit); a capital initial only before a capitalised word, and only after the
   text's start, another initial ("J. R. Tolkien") or "by"/"cc" ("by J. Smith"); a list number only at the text's or a line's
   start ("1. Validates the basket."). Audit 57: a capitalised word or "from", "for", "with", "and", "of" before an initial
   ran on past "Service B.", "Plan A.", "from A.": those now end a sentence, and so does a middle initial after a given name
   ("John F. Kennedy" is cut at "F.": a name such as "Team X." looks the same, and "Service B." is far more common in a model's
   text). A sentence may open in lower case (a model's "play() returns null." or "tour() starts one"), so what follows is read
   only for those */
const ABBR = /(?:^|[^\p{L}\p{N}.])(?:approx|vs|cf|incl|esp|viz|\p{L}(?:\.\p{L}){1,3})\.$/iu;
const TITLE = /(?:^|[^\p{L}\p{N}.])(?:Dr|Mr|Mrs|Ms|Prof)\.$/u, CIRCA = /(?:^|[^\p{L}\p{N}.])ca\.$/iu;
const LISTNO = /(?:^|\n)[ \t]{0,8}\p{N}{1,3}\.$/u; // on a 14-character tail: ^ holds only where the text is that short
const INITIAL = /(?:^|[^\p{L}\p{N}.])\p{Lu}\.$/u, NAMEWORD = /^(?:by|cc)$/i;
// a capital initial ends h, and a capitalised word follows: does a name lead to it? The 40-character tail holds the words before it
const leadsToName = h => { const w = h.slice(-40).trim().split(/\s+/), p = w[w.length - 2];
  if (p === undefined) return h.length <= 40; // the text's own start ("J. Smith wrote it")
  return /^\p{Lu}\.$/u.test(p) || NAMEWORD.test(p); }; // "J. R. Tolkien", "by J. Smith"
const firstSentence = s => { s = String(s ?? ''); for (const m of s.matchAll(/(?<=\.)\s+/g)) { const h = s.slice(0, m.index), e = h.slice(-9), nx = s[m.index + m[0].length] ?? '';
  const cap = /\p{Lu}/u.test(nx);
  if (ABBR.test(e) || LISTNO.test(h.slice(-14)) || (cap && TITLE.test(e)) || (/\p{N}/u.test(nx) && CIRCA.test(e)) || (cap && INITIAL.test(e) && leadsToName(h))) continue;
  return h; } return s; }; // the longest abbreviation with its period is 8 characters ("a.b.c.d."), 9 with its boundary: ^ is true only at the text's start, and each test stays constant time
/* a text without the period that closes it, as the text a clause follows (", opens ...", "; " before the next item): an
   abbreviation's or a letter chain's own period stays ("gift cards etc., opens ...", audit 55), and so does an ellipsis */
const ETC = /(?:^|[^\p{L}\p{N}.])etc\.$/iu;
const unstop = s => { s = String(s ?? ''); const t = s.trimEnd(), e = t.slice(-9);
  return !/\.$/.test(t) || /\.\.$/.test(t) || ABBR.test(e) || ETC.test(e) ? s : t.slice(0, -1); };
// a Markdown text (md()'s: `code`, **bold**, ==mark==, [links](https://…), - bullets, blank-line paragraphs) as plain words, its
// first sentence only: what a tooltip and an accessible name say for it (audit 49: a weighted line read its markers aloud).
// Its first paragraph only, and a bullet list's items each after a "; ", or a ":" that leads in to them (audit 54: they ran on
// into one phrase, "orders refunds"), an item before a "; " without its closing period (audit 55: "card.; Sends"); a line's
// break kept until its first sentence is found, so a list number that opens a line stays one (audit 57: "steps: 1." was cut).
// A number opens a list only after a line that ends a sentence or leads in (. : ! ?), or next to another numbered line: a
// hard-wrapped "Retries up to\n3. Then gives up." ends at "3." (audit 58), its break read as a space
const LISTLINE = /^[ \t]{0,8}\p{N}{1,3}\.(?:\s|$)/u;
const mdPlain = s => { const b = String(s ?? '').split(/\n[ \t\r]*\n/).find(p => p.trim()) ?? '';
  const q = b.split(/\r?\n/).filter(l => l.trim()).map((l, i) => { const li = /^\s*[-*] /.test(l), x = li ? l.replace(/^\s*[-*] /, '') : l; return i && li ? '\0' + x : x; });
  const u = q.map((x, i) => q[i + 1]?.[0] === '\0' ? unstop(x) : x); // a line break kept only before a list number (audit 58, below)
  const t = u.reduce((a, x, i) => a + (!i ? '' : LISTLINE.test(x) && (/[.:!?]\s*$/.test(u[i - 1]) || LISTLINE.test(u[i - 1]) || LISTLINE.test(u[i + 1] ?? '')) ? '\n' : ' ') + x, '').replace(/(:?)\s*\0/g, (_, c) => c ? ': ' : '; ');
  return firstSentence(t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/==([^=]+)==/g, '$1').trim()).replace(/\s+/g, ' ').trim(); };
const textW = (s, px) => measureText ? measureText(String(s ?? ''), px) : String(s ?? '').length * px * 0.6;
// a text's lines where its author broke it (a Mermaid <br>, F2's Shift+Enter), one line where it has none: each drawn on its
// own line, not as a space (audit 22, as flowWrap since audit 21); a broken text is as wide as its widest line (audit 24)
// the largest f(x) over xs (-Infinity for none), in a loop: Math.max(...xs) spreads every x as an argument, and a text
// broken on some 120,000 lines (a file under 1 MiB) throws a RangeError there (audit 25)
const widest = (xs, f) => { let w = -Infinity; for (const x of xs) w = Math.max(w, f(x)); return w; };
const brLines = t => String(t ?? '').split(/\r\n?|[\n\u2028\u2029]/), linesW = (s, px) => widest(brLines(s), l => textW(l, px));
const sansW = (s, px, k) => measureText ? measureText(String(s ?? ''), px) : textW(s, px) * k; // k: the estimate's sans correction
let ctx2d; // the 2D context text is measured on, probed once per module: jsdom has none, and says so on every try
function hostMeasure(el) { // widths in the font the host gives the map (--um-sans), memoised; null without a 2D canvas (jsdom)
  if (ctx2d === undefined) ctx2d = document.createElement('canvas').getContext('2d');
  const c = ctx2d; if (!c) return null;
  const cs = getComputedStyle(el), family = cs.getPropertyValue('--um-sans').trim() || cs.fontFamily || 'sans-serif', memo = new Map();
  return (s, px) => { const k = px + '\u0000' + s; let w = memo.get(k); if (w === undefined) { c.font = `600 ${px}px ${family}`; w = c.measureText(s).width; memo.set(k, w); } return w; };
}
/* the last i in [lo, hi] where ok(i) holds, ok true up to some i and false after it; lo - 1 when it holds for none. A text's
   width grows as words or characters are added, so wrap2() and fit() search their cut in a few measures rather than
   measuring every one: a card's 'what' or name of some thousands of characters froze render() for seconds (audit 26) */
const lastOk = (lo, hi, ok) => { let r = lo - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ok(m)) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
/* where a line may break (audit 58: a text with no spaces, Chinese, Japanese, a long URL, was one word, drawn as one cut line).
   Between words, at white space. UAX 14 lets a line break before and after each ideograph, kana and hangul syllable
   (class ID), so each is a word of its own, joined to the next with no space; a closing mark (。、」) stays with the
   character before it, an opening one (「) with the one after. A word still wider than the line (a URL, Thai, which breaks
   only by dictionary) breaks between any two of its characters. Each word: [text, a space before it, the first piece of a word too wide]; a text with spaces and
   no word wider than max gives its words as before */
const WB_IDEO = /[\u1100-\u11FF\u2E80-\u2FDF\u3005-\u3007\u3021-\u3029\u3031-\u303C\u3040-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFF66-\uFF9F]|[\uD840-\uD87F][\uDC00-\uDFFF]/;
const WB_NOSTART = /^[\p{Pe}\p{Pf}\p{Po}\p{M}\u200D\uFE0F\u30FC\u3005\u309D\u309E\u30FD\u30FEぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ\u31F0-\u31FF]/u, WB_NOEND = /[\p{Ps}\p{Pi}\u200D"]$/u;
let WB_SEG; // a grapheme splitter, made once: Intl.Segmenter where the host has it, code points where not
const wbGraphemes = w => { if (WB_SEG === undefined) WB_SEG = typeof Intl === 'object' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  return WB_SEG ? Array.from(WB_SEG.segment(w), x => x.segment) : Array.from(w); };
// w's pieces, a break allowed between two where brk(previous, next) holds and next may open a line and the piece before may end one
const wbSplit = (w, brk) => { const out = []; let cur = '', prev = '';
  for (const g of wbGraphemes(w)) { if (cur && brk(prev, g) && !WB_NOSTART.test(g) && !WB_NOEND.test(cur)) { out.push(cur); cur = g; } else cur += g; prev = WB_NOSTART.test(g) && prev ? prev : g; }
  if (cur) out.push(cur); return out; };
function breakWords(s, px, max, spaces) { const out = []; // spaces: split at each ' ' as written (wrap2's), not at white space
  String(s ?? '').split(spaces ? ' ' : /\s+/).forEach(w => { if (!w && !spaces) return; let gap = true;
    for (const p of WB_IDEO.test(w) ? wbSplit(w, (a, b) => WB_IDEO.test(a) || WB_IDEO.test(b)) : [w])
      (textW(p, px) > max ? wbSplit(p, () => true) : [p]).forEach((q, i, a) => { out.push([q, gap && out.length > 0, a.length > 1 && !i]); gap = false; }); });
  return out; }
const joinWords = ws => ws.map(([t, gap], i) => (i && gap ? ' ' : '') + t).join('');
// a paragraph's lines of at most max px, filled word by word; a line holds at least one word, and says whether a space came
// before it. A word too wide for any line starts a line of its own before it breaks (CSS's overflow-wrap: break-word)
function wrapLines(s, px, max) { const out = []; let line = null;
  for (const [t, gap, wide] of breakWords(s, px, max)) { const next = line ? line[0] + (gap ? ' ' : '') + t : t;
    if (line && (wide || textW(next, px) > max)) { out.push(line); line = [t, gap]; } else line = line ? [next, line[1]] : [t, gap]; }
  if (line) out.push(line); return out; }
// a text on two lines: split at the word where the wider line is narrowest (the first such word), each line then fit to max.
// Between two ideographs too (audit 58); inside a word wider than max only when chars is set (a cloud card's label): a map
// card's one long word keeps its smaller font and its cut
function wrap2(s, px, max, chars) { const w = breakWords(s, px, chars ? max : Infinity, true), n = w.length; if (n < 2) return null;
  const A = i => textW(joinWords(w.slice(0, i)), px), B = i => textW(joinWords(w.slice(i)), px), m = i => Math.max(A(i), B(i));
  // the first line widens and the second narrows as the split moves on: the narrowest wider line is where they cross
  const c = lastOk(1, n - 1, i => A(i) < B(i)) + 1; let i = c > n - 1 ? n - 1 : c > 1 && m(c - 1) <= m(c) ? c - 1 : c;
  if (m(i) > max) i = Math.max(1, lastOk(2, n - 1, j => A(j) <= max)); // too wide all the same: as much on the first line as fits
  return [fit(joinWords(w.slice(0, i)), px, max, true), fit(joinWords(w.slice(i)), px, max, true)]; }
// a text fits its room when its width is within a hair of it: a room worked out by subtraction (an ER row's, its entity sized
// to hold the widest name) loses 1e-14 to floating point, and the name the box was made for must not be cut (audit 33)
const fits = (s, px, max) => textW(s, px) <= max + 1e-6;
function clauseFit(s, px, max) { s = String(s ?? ''); if (fits(s, px, max)) return s; for (const sep of ['; ', ', ', ' (']) { const q = s.split(sep); let o = q[0]; if (textW(o, px) > max) continue; for (const x of q.slice(1)) { if (textW(o + sep + x, px) > max) break; o += sep + x; } return o; } return fit(s, px, max, true); }
function fit(s, px, max, words) { s = String(s ?? ''); if (fits(s, px, max)) return s; // words: cut between words where it can (a card's texts)
  let k; if (measureText) k = s.length <= 3 ? s.length : lastOk(4, s.length, j => textW(s.slice(0, j) + '…', px) <= max); // 3: none fits
  else k = Math.max(Math.floor(max / (px * 0.6)) - 1, 3);
  if (/[\uD800-\uDBFF]/.test(s[k - 1])) k--; // never half an emoji: a lone surrogate draws as a broken glyph
  const w = words ? s.slice(0, k + 1).replace(/\S*$/, '').replace(/[\s,;:]+$/, '') : '';
  return (w || s.slice(0, k)) + '…'; }

// A model's icon glyph (icons[k].g) as inert vector shapes (risks.md S2: an icon's SVG may carry script and is never
// inlined as it comes). Kept: the shape elements and their geometry and presentation attributes, each tag as written when
// all of it passes, its values quoted (a Lucide glyph comes back unchanged); a value holds plain characters only (no url(), entity or quote).
// Dropped: every other element and attribute (an event handler, href, style; image, use, foreignObject, script, a comment)
// and text, which a glyph never draws. A tag left open is closed, so a glyph never swallows the card's own marks (audit 18).
const GLYPH_EL = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g']);
const GLYPH_AT = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'pathLength',
  'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'vector-effect']);
const GLYPH_TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
const GLYPH_ATTR = /\s+([^\s"'<>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
const glyphs = new Map();
function glyph(g) {
  const s = typeof g === 'string' ? g : ''; let o = glyphs.get(s); if (o !== undefined) return o;
  // a character no XML document may hold (a vertical tab or form feed, which JS's \s takes for white space, any other control
  // character, a lone surrogate) is read as a space: kept as written, it reached the SVG raw (audit 54)
  const open = [], t = s.replace(XML_BADS, ' '); o = '';
  for (let i = 0; i < t.length;) {
    if (t[i] !== '<') { if (/\s/.test(t[i])) o += t[i]; i++; continue; }
    GLYPH_TAG.lastIndex = i; const m = GLYPH_TAG.exec(t);
    if (!m) { i++; continue; }
    i = GLYPH_TAG.lastIndex; const [tag, close, el, attrs, self] = m;
    if (!GLYPH_EL.has(el)) continue;
    if (close) { if (open[open.length - 1] === el) { open.pop(); o += `</${el}>`; } continue; } // never as written: an end tag's attributes are no XML (audit 56)
    // an attribute with no value, or one named again in the same tag, is dropped: either made the SVG no well-formed XML (audit 55)
    const all = [...attrs.matchAll(GLYPH_ATTR)], seen = new Set();
    const kept = all.map(([, k, v]) => [k, v == null ? null : /^["']/.test(v) ? v.slice(1, -1) : v])
      .filter(([k, v]) => v != null && GLYPH_AT.has(k) && /^[\w\s.,#%+\-()]*$/.test(v) && !/url\s*\(/i.test(v) && !seen.has(k) && seen.add(k));
    // as written only when every attribute is kept and quoted: an unquoted value (stroke-width=2) is no XML either (audit 56)
    o += kept.length === all.length && all.every(x => x[2] == null || /^["']/.test(x[2])) ? tag : `<${el}${kept.map(([k, v]) => ` ${k}="${v}"`).join('')}${self ? '/' : ''}>`;
    if (!self) open.push(el);
  }
  o += open.reverse().map(el => `</${el}>`).join('');
  if (glyphs.size < 512) glyphs.set(s, o);
  return o;
}

// a line break in a typed view's line label: each part its own line, EDGE_LH px below the one before (audit 22)
const EDGE_BREAK = /\r\n?|[\n\u2028\u2029]/, EDGE_LH = 12;
/* s without its leading and trailing '-', by index: `.replace(/^-+|-+$/g, '')` retries `-+$` at each dash of an inner run the slug
   kept, so a typed name of 200k dashes froze an add for 16 s (audit 54) */
const trimDash = s => { let i = 0, j = s.length; while (i < j && s[i] === '-') i++; while (j > i && s[j - 1] === '-') j--; return s.slice(i, j); };
/* undo for a host: the models it had and has undone, in order. The host makes it, holds it and decides what goes in;
   render() never sees it. `limit` caps how many steps back are kept. */
export function history(model, limit = 100) {
  const past = [], future = []; let now = model;
  return {
    get model() { return now; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(m) { past.push(now); if (past.length > limit) past.shift(); future.length = 0; return (now = m); },
    undo() { if (past.length) { future.push(now); now = past.pop(); } return now; },
    redo() { if (future.length) { past.push(now); now = future.pop(); } return now; },
  };
}
/* ---------- commands: apply() and references() (work package 1.6) ----------
   apply(model, commands) runs a transaction, one command or a list run in order, on a copy of the model and returns the
   new model; the one given is never changed. A command that cannot run throws, and none of the transaction is applied.
   Undo is the model before: history() keeps those, so undo and redo give back byte-identical models (risks.md P3:
   snapshots, until a model passes 2 MB).

   The commands, each { op, ... }:
     set       { id | view, path, value }   a field of an element or a view. path: 'label', 'props.visibility', or a
                                             list of keys when a key holds a dot (['present', 'order.total', 'rows']);
                                             value undefined removes it. Through objects only; id, members, parent,
                                             from and to change by their own commands. A label set also sets what
                                             a type's refs say is `named` as the element and was (C4's instances)
     add       { element, owner?, index?, view? }  a node (no from/to), a line, or with `owner` a member, at `index`
                                             among the owner's members, else among the view's; `view` shows it there;
                                             in 'view' (not 'model'): in its edges, nodes or fragments (registry.js)
     move      { id, index, owner? }         a member to another place among its owner's members, or to a new owner
               { id, view, index }           an element or line to another place in a view's order (its nodeIds or edges)
     hide      { id, view }                  out of one view, with all the view says of it: its place, pin, present,
                                             box, tour, the view's lines to it, the story steps on that view (on
                                             the lines to it it draws no more too, audit 36); the model
                                             keeps it (risks.md E5). A line that lives only in that view goes with it
                                             (a later delete of it in the transaction is passed over, audit 32).
                                             The view's subject (or what owns it) is refused (audit 17)
     delete    { id }                        out of the model, with its members, what it owns, the lines to them, and
                                             every place that names them (references()). One already gone in the same
                                             transaction is passed over, so a selection deletes in one transaction (E2).
                                             What it held and stays goes to its nearest owner left. A type's refs:
                                             'cascade' takes what names it; 'drop' takes it out of a list; with
                                             'empties', an element whose list it empties goes too (audit 19)
     reparent  { id, parent }                a new owner by `parent`, or none with parent null
     addView   { view, index? }              a view, added to views at index (else at the end); refused when its id is
                                             a view's already, or it is not an object with a string id. Nothing else is
                                             checked: validate() says what it lacks (notes/milestone-2.md §6.2)
   An element is a node, a member, a model line or a view's own line or item with an id, or a fragment (schema version 2's
   id space). */

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x), arr = x => (Array.isArray(x) ? x : []);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']); // never a field of an element or view (risks.md M3)
// a key below the first is an own key, whatever its name (layout.constructor, present.__proto__: an id): written as
// one, never through a prototype, so no path reaches Object.prototype
const putOwn = (o, k, value) => Object.defineProperty(o, k, { value, writable: true, enumerable: true, configurable: true });
const isLine = x => isObj(x) && (x.from != null || x.to != null);
const dig = (x, path) => path.split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), x);

/* Every element by id: { x, list, kind, owner, view } (owner: the element whose member it is; view: the view a line or
   fragment of its own lives in) */
function index(m) {
  const at = new Map(), seen = new Set(); // seen: each element walked once, so a host's member that holds its owner ends (audit 28)
  // members on a stack of its own, in the order a recursion took: thousands deep are read, never a stack overflow (audit 35)
  const put = (x0, list0, kind0, owner0, view) => { for (const s = [[x0, list0, kind0, owner0]]; s.length;) { const [x, list, kind, owner] = s.pop();
    if (!isObj(x) || typeof x.id !== 'string' || seen.has(x)) continue; seen.add(x);
    if (!at.has(x.id)) at.set(x.id, { x, list, kind, owner, view }); const ms = arr(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], x.members, 'member', x]); } };
  arr(m.nodes).forEach(n => put(n, m.nodes, 'node'));
  arr(m.edges).forEach(e => put(e, m.edges, 'edge'));
  arr(m.views).forEach(v => { if (!isObj(v)) return; arr(v.nodes).forEach(n => put(n, v.nodes, 'node', undefined, v)); // a card of one view only
    arr(v.edges).forEach(e => put(e, v.edges, 'edge', undefined, v)); arr(v.fragments).forEach(f => put(f, v.fragments, 'fragment', undefined, v));
    ['changes', 'constraints'].forEach(k => arr(isObj(v.timeline) && v.timeline[k]).forEach(c => put(c, v.timeline[k], 'time', undefined, v))); });
  return at;
}

/* Where a model names any of `ids` (a Set): [{ path, kind }], path a list of keys from the model down. Kinds: end, parent,
   part, prop, view, pin, present, override, subject, story, lens, rule. Neither the element itself nor its members are listed.
   only(viewIndex): look in those views and their story steps only (hide), else in all of the model; top: also in what
   is not a view's (its nodes and lines, lenses, rules), by default when only is not given. */
function refs(m, ids, only, top = !only) {
  const out = [], say = (path, kind) => out.push({ path, kind }), has = id => typeof id === 'string' && ids.has(id), up = new Set();
  // a member's path is kept as a link to its owner's, { p, j }, and written out only when said; members on a stack of its own,
  // in the order a recursion took: thousands deep are read, never a stack overflow (audit 35)
  const keys = a => { const ks = []; for (; !Array.isArray(a); a = a.p) ks.push(a.j, 'members'); return [...a, ...ks.reverse()]; };
  const element = (x0, at0, line0) => { const todo = [() => one(x0, at0, line0)]; while (todo.length) todo.pop()();
  function one(x, a, line) { if (!isObj(x) || up.has(x)) return; // line: x is a line, not a node or member that has a field named to; up: the elements x is a member of (a host's cycle ends: audit 28)
    let kp; const at = () => (kp ||= keys(a)); // written out when said only
    if (has(x.parent)) say([...at(), 'parent'], 'parent');
    if (line) ['from', 'to'].forEach(k => { if (has(x[k])) say([...at(), k], 'end');
      if (has((((x.props || {}).ends || {})[k] || {}).part)) say([...at(), 'props', 'ends', k, 'part'], 'part'); });
    Object.keys(propRefs(x.type)).forEach(p => { const v = dig(x, p), ks = p.split('.');
      if (has(v)) say([...at(), ...ks], 'prop'); else arr(v).forEach((id, j) => { if (has(id)) say([...at(), ...ks, j], 'prop'); }); });
    up.add(x); todo.push(() => up.delete(x)); const ms = arr(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) todo.push(() => one(ms[j], { p: a, j }, false)); } };
  if (top) { arr(m.nodes).forEach((n, i) => element(n, ['nodes', i], false)); arr(m.edges).forEach((e, i) => element(e, ['edges', i], true)); }
  const vids = new Set(), views = new Set(arr(m.views).map(v => isObj(v) && v.id));
  arr(m.views).forEach((v, i) => { if (!isObj(v) || (only && !only(i))) return; const at = ['views', i]; vids.add(v.id);
    ['nodeIds', 'tour', 'stepIds'].forEach(k => arr(v[k]).forEach((id, j) => { if (has(id)) say([...at, k, j], 'view'); }));
    arr(v.nodes).forEach((n, j) => element(n, [...at, 'nodes', j], false));
    arr(v.edges).forEach((e, j) => { if (has(e)) say([...at, 'edges', j], 'view'); else element(e, [...at, 'edges', j], true); });
    arr(v.fragments).forEach((f, j) => element(f, [...at, 'fragments', j], false));
    ['changes', 'constraints'].forEach(k => arr(isObj(v.timeline) && v.timeline[k]).forEach((c, j) => isObj(c) && ['lifeline', 'from', 'to'].forEach(f => { if (has(c[f])) say([...at, 'timeline', k, j, f], 'end'); })));
    [['layout', 'pin'], ['present', 'present'], ['nodeOverrides', 'override']].forEach(([k, kind]) => Object.keys(isObj(v[k]) ? v[k] : {}).forEach(id => { if (has(id)) say([...at, k, id], kind); }));
    if (has(v.subject)) say([...at, 'subject'], 'subject');
    if (top) ['parent', 'node'].forEach(k => { if (has(v[k]) && !(k === 'parent' && views.has(v[k]))) say([...at, k], 'parent'); }); // a view opened from a card (a parent that is also a view's id names that view)
    ['containers', 'lanes'].forEach(k => arr(v[k]).forEach((b, j) => arr(isObj(b) && b.nodeIds).forEach((id, n) => { if (has(id)) say([...at, k, j, 'nodeIds', n], 'view'); })));
    arr(v.intake).forEach((x, j) => { if (isObj(x) && has(x.to)) say([...at, 'intake', j], 'view'); }); });
  // a step's select and highlight: an id or a Ref (a line's Ref names several edges: it goes with any of them)
  const named = x => has(x) || isObj(x) && x.type !== 'container' && (has(x.id) || has(x.node) || arr(x.ids).some(has));
  arr(m.stories).forEach((s, i) => arr(isObj(s) && s.steps).forEach((st, j) => { if (!isObj(st) || (only && !vids.has(st.view))) return; const at = ['stories', i, 'steps', j];
    if (named(st.select)) say([...at, 'select'], 'story');
    ['highlight', 'tour'].forEach(k => arr(st[k]).forEach((id, n) => { if (named(id)) say([...at, k, n], 'story'); }));
    if (isObj(st.camera) && has(st.camera.card)) say([...at, 'camera'], 'story'); }));
  if (!top) return out;
  const picks = (sel, at, kind) => { if (!isObj(sel)) return;
    if (has(sel.id)) say([...at, 'id'], kind); else arr(sel.id).forEach((id, k) => { if (has(id)) say([...at, 'id', k], kind); });
    picks(sel.not, [...at, 'not'], kind); };
  arr(m.lenses).forEach((l, i) => isObj(l) && picks(l.pick, ['lenses', i, 'pick'], 'lens'));
  arr(m.rules).forEach((r, i) => isObj(r) && ['from', 'to'].forEach(k => picks(r[k], ['rules', i, k], 'rule')));
  return out;
}

/* references(model, id): where the model names an element, other than the element itself: { path, kind }, path a list of
   keys from the model down (['views', 0, 'nodeIds', 2]). A host with a store of its own deletes what apply() would. */
export function references(model, id) {
  const ids = new Set([id]);
  if (!isObj(model)) return refs({}, ids);
  // a host's getter or Proxy that throws: read again in a copy where each value that cannot be read is an empty object in
  // its place, so every path still names the model's own place (audit 25: the host's error was thrown)
  try { return refs(model, ids); } catch { return refs(copyOf(model, {}), ids); }
}

const get = (m, path) => path.reduce((o, k) => o[k], m);

/* takes out what refs() found: an entry of a list, a key of an object; a line without an id to what is gone goes too */
function clear(m, found) {
  const drop = new Map(), out = (a, k) => { if (!drop.has(a)) drop.set(a, new Set()); drop.get(a).add(k); };
  for (const { path, kind } of found) {
    const o = get(m, path.slice(0, -1)), k = path[path.length - 1];
    if (kind === 'end') out(get(m, path.slice(0, -2)), path[path.length - 2]); // the line itself
    else if (Array.isArray(o)) out(o, k);
    else if (kind === 'lens' || kind === 'rule') o[k] = []; // it picked what is gone: now it picks nothing, not everything
    else delete o[k];
  }
  drop.forEach((ks, a) => [...ks].sort((x, y) => y - x).forEach(k => a.splice(k, 1)));
}

/* after a delete or hide: what named a line with no id ("b->c#0", a step's select or highlight) goes with the line, or
   follows it to its new name when lines before it in its list went (names0: lineNames() before). A name counts in one list:
   the model's, named where a view with no edges list is and in what is not a view's; or a view's own, named in that view */
function follow(m, names0, only) {
  names0.forEach((was, L) => {
    const where = i => (!only || only(i)) && listOf(m, i) === L, top = L < 0 && !only;
    let now;
    for (;;) { now = new Map(); namesOf(L < 0 ? m.edges : m.views[L].edges).forEach((l, k) => now.set(l, k));
      const lost = new Set([...was].filter(([, l]) => !now.has(l)).map(([k]) => k)), found = lost.size ? refs(m, lost, where, top) : [];
      if (!found.length) break; clear(m, found); } // a line to a line that went goes too, and may move the names again
    const to = new Map(); was.forEach((l, k) => { const n = now.get(l); if (n && n !== k) to.set(k, n); });
    if (!to.size) return;
    const keys = [], name = x => typeof x === 'string' ? to.get(x) ?? x : !isObj(x) ? x
      : { ...x, ...('id' in x && { id: name(x.id) }), ...('node' in x && { node: name(x.node) }), ...(Array.isArray(x.ids) && { ids: x.ids.map(name) }) };
    for (const { path, kind } of refs(m, new Set(to.keys()), where, top)) { const o = get(m, path.slice(0, -1)), k = path[path.length - 1];
      if (['pin', 'present', 'override'].includes(kind)) keys.push([o, k]); else o[k] = name(o[k]); }
    const vs = keys.map(([o, k]) => o[k]); keys.forEach(([o, k]) => delete o[k]); keys.forEach(([o, k], i) => { o[to.get(k)] = vs[i]; }); // all at once: names may swap
  });
}

/* registry.js ownGuard's rule, kept by apply() too (audit 24): what one view alone holds (its own node, a member of one) owns
   nothing of the model's nor of another view's; it is no owner in the other views, and goes with its view's nodes */
function ownParent(at, op, id, parent, home) {
  const p = at.get(parent); if (!p || !p.view) return;
  let t = p; for (let n = 0; t && t.kind === 'member' && t.owner && n++ < at.size;) t = at.get(t.owner.id);
  if (!t || t.kind !== 'node' || p.view === home) return;
  throw new Error(`${op}: ${jsonText(parent)} lives in view ${jsonText(p.view.id)} only: ${home ? `"${id}", an element of view ${jsonText(home.id)},` : `"${id}", an element of the model,`} cannot go under it`);
}

function checkNew(x, at) { // an element to add: an object with a new id that is not positional, and its members alike
  const seen = new Set(); // on a stack of its own, in the order a recursion took (audit 35)
  for (const s = [[x, () => 'the element']]; s.length;) { const [y, what] = s.pop();
    if (!isObj(y) || typeof y.id !== 'string' || !y.id) throw new Error(`add: ${what()} needs an id`);
    if (y.id.includes('->')) throw new Error(`add: id "${y.id}" contains "->"`);
    if (at.has(y.id) || seen.has(y.id)) throw new Error(`add: id "${y.id}" is used already`);
    seen.add(y.id); if (y.members != null && !Array.isArray(y.members)) throw new Error(`add: members of "${y.id}" is not a list`);
    const ms = arr(y.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], () => `member ${j} of "${y.id}"`]); }
}

function run(m, c, gone) {
  if (!isObj(c)) throw new TypeError('a command is an object with an op');
  const at = index(m), need = id => { const e = at.get(id); if (!e) throw new Error(`${c.op}: ${jsonText(id)} is not an element`); return e; };
  const viewOf = id => { const v = arr(m.views).find(x => isObj(x) && x.id === id); if (!v) throw new Error(`${c.op}: ${jsonText(id)} is not a view`); return v; };
  const up = id => { const r = at.get(id); return r ? r.x.parent ?? (r.owner && r.owner.id) : undefined; }; // its owner: a parent, or the element it is a member of
  const inside = (id, of) => { for (let o = of, seen = new Set(); o != null && !seen.has(o); seen.add(o), o = up(o)) if (o === id) return true; return false; };
  const place = (list, i) => { if (i == null) return list.length; if (!Number.isInteger(i)) throw new Error(`${c.op}: index ${jsonText(i)} is not a whole number`); return Math.max(0, Math.min(list.length, i)); };
  switch (c.op) {
    case 'set': {
      if (c.id != null && c.view != null) throw new Error('set: an element (id) or a view, not both');
      const keys = typeof c.path === 'string' ? c.path.split('.') : Array.isArray(c.path) && c.path.every(k => typeof k === 'string') ? c.path : null;
      if (!keys || !keys.length || keys.some(k => k === '') || UNSAFE.has(keys[0])) throw new Error(`set: ${jsonText(c.path)} is not a path of keys`);
      if (c.view == null && ['id', 'members', 'parent', 'from', 'to'].includes(keys[0])) throw new Error(`set: ${keys[0]} changes by its own command (add, move, delete, reparent), not set`);
      if (c.view != null && keys[0] === 'id') throw new Error('set: a view keeps its id');
      let o = c.view != null ? viewOf(c.view) : need(c.id).x;
      for (const k of keys.slice(0, -1)) {
        if (!Object.hasOwn(o, k) || o[k] === undefined) { if (c.value === undefined) return; putOwn(o, k, {}); } // an inherited key (toString) is none
        else if (!isObj(o[k])) throw new Error(`set: ${keys.join('.')} goes through ${k}, which is not an object`);
        o = o[k];
      }
      const last = keys[keys.length - 1], was = o[last];
      if (c.value === undefined) delete o[last]; else putOwn(o, last, copyOf(c.value)); // delete takes an own key only
      if (c.view == null && keys.length === 1 && last === 'label' && was !== undefined) for (const [, r] of at)
        if (r.x !== o && r.x.label === was && Object.entries(propRefs(r.x.type)).some(([p, how]) => /\bnamed\b/.test(how) && dig(r.x, p) === c.id)) {
          if (c.value === undefined) delete r.x.label; else r.x.label = copyOf(c.value); }
      return;
    }
    case 'add': {
      if ('to' in c) throw new Error('add: the owner of a member is `owner`');
      if (c.in != null && c.in !== 'view' && c.in !== 'model') throw new Error(`add: in is 'view' or 'model', not ${jsonText(c.in)}`);
      checkNew(c.element, at);
      const x = copyOf(c.element), owner = c.owner != null ? need(c.owner) : null;
      if (c.in === 'view') {
        if (c.view == null || owner) throw new Error('add: in \'view\' needs a view, and no owner');
        const v = viewOf(c.view), T = diagramOf(v) || {}, pal = arr(T.elements);
        if (x.parent != null) ownParent(at, 'add', x.id, x.parent, v);
        const k = isLine(x) || arr(T.items).includes(x.type) ? 'edges' : !pal.length || pal.some(t => isObj(t) && t.type === x.type) ? 'nodes' : 'fragments';
        if (k === 'edges' && !Array.isArray(v.edges) && arr(m.edges).length) throw new Error(`add: view "${c.view}" shows every line between its cards; list its lines first`);
        const list = (v[k] ||= []);
        if (k === 'nodes') { list.push(x); (v.nodeIds ||= []).splice(place(v.nodeIds, c.index), 0, x.id); } else list.splice(place(list, c.index), 0, x);
        return;
      }
      if (owner && owner.kind !== 'node' && owner.kind !== 'member' && owner.kind !== 'fragment') throw new Error(`add: "${c.owner}" holds no members`);
      if (!owner && x.parent != null) ownParent(at, 'add', x.id, x.parent, undefined);
      const v = c.view != null ? viewOf(c.view) : null, list = owner ? (owner.x.members ||= []) : isLine(x) ? (m.edges ||= []) : (m.nodes ||= []);
      list.splice(owner ? place(list, c.index) : list.length, 0, x);
      if (v && !owner) { const shown = isLine(x) ? (Array.isArray(v.edges) ? v.edges : null) : (v.nodeIds ||= []); // a view that lists no lines shows every line between its cards
        if (shown) shown.splice(place(shown, c.index), 0, x.id); }
      return;
    }
    case 'move': {
      const e = need(c.id);
      if (c.view != null && c.owner != null) throw new Error('move: in a view\'s order (view) or to an owner (owner), not both');
      if (c.view != null) { const v = viewOf(c.view), list = e.kind === 'edge' ? arr(v.edges) : arr(v.nodeIds), i = list.findIndex(y => y === c.id || (isObj(y) && y.id === c.id));
        if (i < 0) throw new Error(`move: "${c.id}" is not in view "${c.view}"`);
        const [y] = list.splice(i, 1); list.splice(place(list, c.index), 0, y); return; }
      if (e.kind !== 'member') throw new Error(`move: "${c.id}" is not a member; with view, it moves in a view's order`);
      const to = c.owner != null ? need(c.owner) : { x: e.owner, kind: 'node' };
      if (to.kind !== 'node' && to.kind !== 'member' && to.kind !== 'fragment') throw new Error(`move: "${c.owner}" holds no members`);
      if (inside(c.id, to.x.id)) throw new Error(`move: "${c.id}" would end up inside itself`);
      if (c.owner != null) ownParent(at, 'move', c.id, c.owner, e.view); // as reparent and add: a model member goes under no view's own node (audit 35)
      e.list.splice(e.list.indexOf(e.x), 1); const list = (to.x.members ||= []); list.splice(place(list, c.index), 0, e.x);
      return;
    }
    case 'hide': {
      const v = viewOf(c.view), vi = m.views.indexOf(v), e = need(c.id);
      if (e.kind === 'member') throw new Error(`hide: "${c.id}" is a member, shown with its owner: collapse its compartment with set present, or delete it`);
      if (e.view) throw new Error(`hide: "${c.id}" lives only in view "${e.view.id}": delete it`);
      if (e.kind === 'edge' && !Array.isArray(v.edges)) throw new Error(`hide: view "${c.view}" shows every line between its cards; hide a card, or list its lines`);
      const names0 = lineNames(m);
      const ids = new Set(), own = x0 => { for (const s = [x0], seen = new Set(); s.length;) { const x = s.pop(); if (seen.has(x)) continue; seen.add(x); ids.add(x.id); // a stack: thousands deep (audit 35)
        arr(x.members).forEach(y => isObj(y) && typeof y.id === 'string' && s.push(y)); } }; own(e.x);
      if (ids.has(v.subject)) throw new Error(`hide: "${v.subject}" is the subject of view "${c.view}": change the view's subject, or delete it from the model (no command deletes a view)`); // audit 17, 18
      // the lines that go with it, worked out whole before the view's list is filtered, whatever order it lists them in (audit 37):
      // the model lines to it, which the view draws no more, the view's own lines to it, and lines to those lines (audit 36).
      // What names them in this view (a story step's select or highlight) goes too, as the element's own
      { const to = new Map(); [...arr(m.edges), ...arr(v.edges)].forEach(l => { if (isObj(l) && typeof l.id === 'string') [l.from, l.to].forEach(k => { if (typeof k === 'string') (to.get(k) || to.set(k, []).get(k)).push(l.id); }); });
        for (const q = [...ids]; q.length;) arr(to.get(q.pop())).forEach(k => { if (!ids.has(k)) { ids.add(k); q.push(k); } }); }
      const ends = l => isObj(l) && (ids.has(l.from) || ids.has(l.to) || (typeof l.id === 'string' && ids.has(l.id)));
      // a line the view holds goes for good: a later delete of it in this transaction finds it gone, as after a delete (audit 32)
      if (Array.isArray(v.edges)) v.edges = v.edges.filter(y => { const l = typeof y === 'string' ? (at.get(y) || {}).x : y, out = y === c.id || ends(l);
        if (out && isObj(l) && typeof l.id === 'string') { ids.add(l.id); if (l === y) gone.add(l.id); } return !out; });
      // a prop names model elements, kept, but for an interaction use's covers: lifelines of its view (audit 14)
      clear(m, refs(m, ids, i => i === vi).filter(r => !['end', 'parent', 'part'].includes(r.kind) && (r.kind !== 'prop' || r.path[r.path.length - 2] === 'covers')));
      follow(m, names0, i => i === vi);
      return;
    }
    case 'delete': {
      if (!at.has(c.id) && gone.has(c.id)) return; // gone with an earlier command of this transaction
      need(c.id); const now = new Set(), kids = new Map(), names0 = lineNames(m);
      for (const [k, o] of at) if ((o.kind === 'node' || o.kind === 'member') && o.x.parent != null) { if (!kids.has(o.x.parent)) kids.set(o.x.parent, []); kids.get(o.x.parent).push(k); }
      // what one view alone holds (its own node, a member of one): a model element in it is no part of it (audit 23)
      const hc = new Map(), held = id => { if (hc.has(id)) return hc.get(id); const way = []; let r = at.get(id), h; // once an id: a member chain walked once
        for (let n = 0; r && !hc.has(r.x.id) && r.owner && n++ < at.size;) { way.push(r.x.id); r = at.get(r.owner.id); }
        h = !r ? false : hc.has(r.x.id) ? hc.get(r.x.id) : !!(r.view && r.kind === 'node'); [...way, ...r ? [r.x.id] : []].forEach(k => hc.set(k, h)); hc.set(id, h); return h; };
      const take = id => { for (const s = [id]; s.length;) { const k = s.pop(), r = at.get(k); if (!r || now.has(k)) continue; now.add(k); const h = held(k);
        arr(r.x.members).forEach(y => isObj(y) && s.push(y.id)); arr(kids.get(k)).forEach(x => (!h || held(x)) && s.push(x)); } }; // what it owns goes with it
      take(c.id);
      // lines to what is gone go too, lines to those lines, a timeline's items, and what a type's refs cascade (a reply with its call)
      const by = new Map(); for (const [k, o] of at) [...o.kind === 'edge' ? [o.x.from, o.x.to] : o.kind === 'time' ? [o.x.lifeline, o.x.from, o.x.to] : [],
        ...Object.entries(propRefs(o.x.type)).flatMap(([p, how]) => /\bcascade\b/.test(how) ? [].concat(dig(o.x, p)) : [])].forEach(i => by.has(i) ? by.get(i).push(k) : by.set(i, [k]));
      for (const id of now) arr(by.get(id)).forEach(take); // a Set's loop meets what take adds to it
      // a refs list marked `empties` (a flow's conveyed) takes its element when every id it lists is gone: never left naming nothing (audit 19)
      const lists = []; for (const [k, o] of at) Object.entries(propRefs(o.x.type)).forEach(([p, how]) => { const v = dig(o.x, p);
        if (/\bempties\b/.test(how) && Array.isArray(v) && v.length) lists.push([k, v]); });
      for (let more = true; more;) { more = false; for (const [k, v] of lists) if (!now.has(k) && v.every(i => now.has(i))) { more = true; take(k); for (const id of now) arr(by.get(id)).forEach(take); } }
      // what stays in something gone goes to its nearest owner left; an operand's messages to its fragment's parent
      const above = id => { const r = at.get(id); return r && (r.x.parent ?? (r.owner && above(r.owner.id))); };
      const left = new Map(); // a gone id's nearest owner left, once found
      const leftM = new Map(); // the same for a model element: past what one view alone holds too
      for (const [k, o] of at) if (!now.has(k) && now.has(o.x.parent)) { let p = o.x.parent; const way = [];
        if (!held(k)) { // a model element: to its nearest owner left that no view alone holds, else none (as mindmap's remove lifts a topic, audit 22)
          for (let n = 0; p != null && (now.has(p) || held(p)) && !leftM.has(p) && n++ < at.size;) way.push(p), p = above(p);
          if (leftM.has(p)) p = leftM.get(p); else if (p != null && (now.has(p) || held(p))) p = undefined; way.forEach(i => leftM.set(i, p));
          if (p === k) p = undefined; } // round a loop back to itself: none
        else { for (let n = 0; p != null && now.has(p) && !left.has(p) && n++ < at.size;) way.push(p), p = above(p);
          if (left.has(p)) p = left.get(p); else if (now.has(p)) p = undefined; way.forEach(i => left.set(i, p)); }
        if (p != null) o.x.parent = p; else delete o.x.parent; }
      const ls = new Map(); for (const [k, o] of at) if (now.has(k) && !(o.owner && now.has(o.owner.id))) (ls.get(o.list) || ls.set(o.list, new Set()).get(o.list)).add(o.x);
      ls.forEach((xs, l) => { let j = 0; for (let i = 0; i < l.length; i++) if (!(i in l)) delete l[j++]; else if (!xs.delete(l[i])) l[j++] = l[i]; l.length = j; }); // its first time in its list, as indexOf found
      for (let found = refs(m, now); found.length; found = refs(m, now)) clear(m, found); // a line without an id to a gone line goes in a second round
      follow(m, names0);
      now.forEach(id => gone.add(id));
      return;
    }
    case 'reparent': {
      if (!('parent' in c)) throw new Error('reparent: give `parent`, or null for none');
      const e = need(c.id);
      if (e.kind === 'member') throw new Error(`reparent: "${c.id}" is a member of "${e.owner.id}": move it to another owner with move`);
      if (c.parent == null) { delete e.x.parent; return; }
      const p = need(c.parent);
      if (p.kind === 'edge' || p.kind === 'time') throw new Error(`reparent: "${c.parent}" is not an owner`);
      if (inside(c.id, c.parent)) throw new Error(`reparent: "${c.id}" would end up inside itself`);
      ownParent(at, 'reparent', c.id, c.parent, e.view);
      e.x.parent = c.parent;
      return;
    }
    case 'addView': {
      const v = c.view, list = (m.views ||= []);
      if (!isObj(v) || typeof v.id !== 'string') throw new Error('addView: a view is an object with a string id');
      if (list.some(x => isObj(x) && x.id === v.id)) throw new Error(`addView: view "${v.id}" is there already`);
      list.splice(place(list, c.index), 0, copyOf(v));
      return;
    }
    default: throw new Error(`${jsonText(c.op)} is not a command (set, add, move, hide, delete, reparent, addView)`);
  }
}

/* apply(model, commands): the model after a transaction (a command, or a list of them run in order). See above. */
export function apply(model, commands) {
  if (!isObj(model)) throw new TypeError('apply() needs a model');
  const m = copyOf(model), gone = new Set(); // a host's function stays as it is (audit 24)
  for (const c of Array.isArray(commands) ? commands : [commands]) run(m, c, gone);
  return m;
}
const r2 = v => Math.round(v * 100) / 100;
function rrect(x, y, w, h, r) { // a rounded rect's path; r: one radius, or [top left, top right, bottom right, bottom left]
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r], A = (q, X, Y) => q ? `A${r2(q)} ${r2(q)} 0 0 1 ${r2(X)} ${r2(Y)}` : '';
  return `M${r2(x + a)} ${r2(y)}H${r2(x + w - b)}${A(b, x + w, y + b)}V${r2(y + h - c)}${A(c, x + w - c, y + h)}H${r2(x + d)}${A(d, x, y + h - d)}V${r2(y + a)}${A(a, x + a, y)}Z`;
}
const cornerIn = (r, t, a, b) => t < a + r ? r - Math.sqrt(Math.max(0, r * r - (a + r - t) ** 2)) : t > b - r ? r - Math.sqrt(Math.max(0, r * r - (t - b + r) ** 2)) : 0;
const rectIn = (n, s, t, r) => s === 'L' || s === 'R' ? cornerIn(r, t, n.y, n.y + n.h) : cornerIn(r, t, n.x, n.x + n.w);
const ellIn = (e, u, r) => e * (1 - Math.sqrt(Math.max(0, 1 - (u / r) ** 2))); // an ellipse's depth at u from its axis
const grown = (n, d) => ({ ...n, x: n.x - d, y: n.y - d, w: n.w + 2 * d, h: n.h + 2 * d });
const deeper = (k, p) => `color-mix(in srgb, var(--um-${KIND[k][0]}) ${p}%, var(--um-${KIND[k][0]}-f))`; // a detail's tint, over the card's own
const BAR = 14; // a window's title bar: browser, window, terminal
function chrome(n, c, k, what) { // a tinted title bar, three dots after the card's tabs, then an address field (browser) or a prompt (terminal)
  const { x, y, w } = n, x0 = Math.max(x, n.tabEnd || x), end = n.chromeEnd || x + w - 10;
  const dots = [9, 15.5, 22].map(d => `<circle cx="${r2(x0 + d)}" cy="${y + 7}" r="2.1" class="n-dot depth-read" fill="${c}"/>`).join('');
  const more = what === 'browser' && end - x0 - 30 > 24 ? `<path d="${rrect(x0 + 30, y + 3.5, end - x0 - 30, 7, 3.5)}" class="n-field depth-read" stroke="${c}"/>`
    : what === 'terminal' && end - x0 - 30 > 14 ? `<text x="${r2(x0 + 31)}" y="${y + 10.6}" class="n-prompt" fill="${c}">&gt;_</text>` : '';
  return `<path d="${rrect(x + .75, y + .75, w - 1.5, BAR - .75, [9.25, 9.25, 0, 0])}" fill="${deeper(k, 10)}"/><path d="M${x} ${y + BAR}H${x + w}" class="n-det n-accent" stroke="${c}"/>${dots}${more}`;
}
// where a person's or robot's body starts: b px down, or just above the highest line or feed that ends on its left or right
// side (n.portTop, from the lines as laid out), so each one lands on its outline
const bodyTop = (n, b) => Math.min(n.y + b, (n.portTop ?? Infinity) - 1);
// each card's highest line end on its left side and on its right (a view's feeds end on the left), as laid out
function sidePorts(g) {
  const m = new Map(), at = (n, side, y) => { if (!n || (side !== 'L' && side !== 'R')) return; const o = m.get(n) || { L: Infinity, R: Infinity }; o[side] = Math.min(o[side], y); m.set(n, o); };
  (g.edges || []).forEach(e => { if (e.pts && e.pts.length) { at(e.s, e.fs, e.pts[0][1]); at(e.t, e.ts, e.pts[e.pts.length - 1][1]); } });
  (g.intake || []).forEach(b => at((g.byId || {})[b.to], 'L', b.pts[b.pts.length - 1][1]));
  return m;
}
const boxOut = r => (n, d = 0) => { const g = grown(n, d); return rrect(g.x, g.y, g.w, g.h, r + d); };
const SHAPE = {
  box: { out: boxOut(10), face: n => [n.y, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10) },
  person: { // the C4 model's person: a head over a body with wide, flat shoulders. The body starts 12 px down, or higher where
    // a line ends on its side above that (bodyTop)
    head: 13,
    g(n, d = 0) { const r = 13 + d, cx = n.hx ?? n.x + n.w / 2, hy = n.y + 13, bt = bodyTop(n, 12) - d, sx = 20 + d, sy = 12 + d; return { r, cx, hy, bt, sx, sy, k: Math.sqrt(Math.max(0, r * r - (bt - hy) ** 2)) }; },
    out(n, d = 0) { const { r, cx, hy, bt, sx, sy, k } = this.g(n, d), x = n.x - d, w = n.w + 2 * d, b = n.y + n.h + d, R = 10 + d;
      return `M${r2(x)} ${r2(bt + sy)}A${sx} ${sy} 0 0 1 ${r2(x + sx)} ${r2(bt)}H${r2(cx - k)}A${r} ${r} 0 ${bt > hy ? 1 : 0} 1 ${r2(cx + k)} ${r2(bt)}H${r2(x + w - sx)}A${sx} ${sy} 0 0 1 ${r2(x + w)} ${r2(bt + sy)}V${r2(b - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(b)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(b - R)}Z`; },
    face: n => [bodyTop(n, 12), n.y + n.h], tabY: n => bodyTop(n, 12),
    det(n, c) { const { r, cx, hy, bt, k } = this.g(n); return `<path d="M${r2(cx - k)} ${r2(bt)}A${r} ${r} 0 ${bt < hy ? 1 : 0} 0 ${r2(cx + k)} ${r2(bt)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const { r, cx, hy, bt, sx, sy } = this.g(n);
      if (s === 'L' || s === 'R') return t < bt ? null : t < bt + sy ? ellIn(sx, bt + sy - t, sy) : rectIn(n, s, t, 10);
      if (s === 'B') return rectIn(n, s, t, 10);
      const u = t - cx; if (Math.abs(u) < r) return Math.min(hy - Math.sqrt(r * r - u * u), bt) - n.y;
      const e = t < n.x + sx ? n.x + sx - t : t > n.x + n.w - sx ? t - n.x - n.w + sx : 0; return bt - n.y + ellIn(sy, e, sx); } },
  robot: { // Structurizr's robot, and UML's non-human actor: the person's body under a square head with ears
    head: 19,
    // a body that starts higher than 14 px down (bodyTop) has a head as much shorter, its ears and corners with it
    g(n, d = 0) { const B = bodyTop(n, 14), f = (B - n.y) / 14; return { cx: n.hx ?? n.x + n.w / 2, hw: 14 + d, ht: n.y - d, bt: B - d, ew: 19 + d, e0: n.y + 4 * f - d, e1: n.y + 10 * f + d, S: 8 + d, hr: 5 * f + d, ey: n.y + 7.5 * f }; },
    out(n, d = 0) { const { cx, hw, ht, bt, ew, e0, e1, S, hr } = this.g(n, d), x = n.x - d, w = n.w + 2 * d, b = n.y + n.h + d, R = 10 + d;
      return `M${r2(x)} ${r2(bt + S)}A${S} ${S} 0 0 1 ${r2(x + S)} ${r2(bt)}H${r2(cx - hw)}V${r2(e1)}H${r2(cx - ew)}V${r2(e0)}H${r2(cx - hw)}V${r2(ht + hr)}A${hr} ${hr} 0 0 1 ${r2(cx - hw + hr)} ${r2(ht)}H${r2(cx + hw - hr)}A${hr} ${hr} 0 0 1 ${r2(cx + hw)} ${r2(ht + hr)}V${r2(e0)}H${r2(cx + ew)}V${r2(e1)}H${r2(cx + hw)}V${r2(bt)}H${r2(x + w - S)}A${S} ${S} 0 0 1 ${r2(x + w)} ${r2(bt + S)}V${r2(b - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(b)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(b - R)}Z`; },
    face: n => [bodyTop(n, 14), n.y + n.h], tabY: n => bodyTop(n, 14),
    det(n, c) { const { cx, ey } = this.g(n); return [-5.5, 5.5].map(o => `<circle cx="${r2(cx + o)}" cy="${r2(ey)}" r="1.6" class="n-det n-accent" fill="${c}" stroke="${c}"/>`).join(''); },
    inset(n, s, t) { const { cx, hw, ew, e0, bt, S, hr } = this.g(n);
      if (s === 'L' || s === 'R') return t < bt ? null : t < bt + S ? S - Math.sqrt(S * S - (bt + S - t) ** 2) : rectIn(n, s, t, 10);
      if (s === 'B') return rectIn(n, s, t, 10);
      const u = Math.abs(t - cx); return u < hw ? cornerIn(hr, u, -1e6, hw) : u < ew ? e0 - n.y : bt - n.y + cornerIn(S, t, n.x, n.x + n.w); } },
  browser: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'browser') },
  window: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'window') },
  terminal: { out: boxOut(10), face: n => [n.y + BAR, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 10), det: (n, c, k) => chrome(n, c, k, 'terminal') },
  mobile: { // a phone on its side, as the C4 model's example draws its mobile app (MobileDeviceLandscape): a screen, a home button, a speaker
    out: boxOut(14), face: n => [n.y, n.y + n.h], inset: (n, s, t) => rectIn(n, s, t, 14),
    det(n, c) { const { x, y, w, h } = n, cy = y + h / 2;
      return `<path d="${rrect(x + 11, y + 5, w - 22, h - 10, 5)}" class="n-screen n-accent" stroke="${c}"/><circle cx="${x + 6.6}" cy="${r2(cy)}" r="2.1" class="n-det" stroke="${c}"/><path d="M${r2(x + w - 6.2)} ${r2(cy - 7)}V${r2(cy + 7)}" class="n-det n-speaker" stroke="${c}"/>`; } },
  cylinder: { // a data store: its lid tinted, the lid's front edge its accent
    ry: n => Math.max(5, Math.round(n.h * .11)),
    out(n, d = 0) { const ry = this.ry(n), { x, y, w, h } = grown(n, d); return `M${r2(x)} ${r2(y + ry)}A${r2(w / 2)} ${ry} 0 0 1 ${r2(x + w)} ${r2(y + ry)}V${r2(y + h - ry)}A${r2(w / 2)} ${ry} 0 0 1 ${r2(x)} ${r2(y + h - ry)}Z`; },
    face(n) { return [n.y + this.ry(n), n.y + n.h]; },
    det(n, c, k) { const ry = this.ry(n), { x, y, w } = n;
      return `<ellipse cx="${r2(x + w / 2)}" cy="${y + ry}" rx="${r2(w / 2 - .75)}" ry="${ry - .75}" fill="${deeper(k, 10)}"/><path d="M${x} ${y + ry}A${r2(w / 2)} ${ry} 0 0 0 ${r2(x + w)} ${y + ry}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const ry = this.ry(n), rx = n.w / 2; if (s === 'T' || s === 'B') return ellIn(ry, t - n.x - rx, rx);
      const a = n.y + ry, b = n.y + n.h - ry; return t >= a && t <= b ? 0 : ellIn(rx, t < a ? a - t : t - b, ry); } },
  pipe: { // a queue: a cylinder on its side, open at the right where the work leaves; dots on its floor move with the flow
    e: n => Math.max(5, Math.round(n.h * .11)),
    out(n, d = 0) { const e = this.e(n), { x, y, w, h } = grown(n, d); return `M${r2(x + e)} ${r2(y)}H${r2(x + w - e)}A${e} ${r2(h / 2)} 0 0 1 ${r2(x + w - e)} ${r2(y + h)}H${r2(x + e)}A${e} ${r2(h / 2)} 0 0 1 ${r2(x + e)} ${r2(y)}Z`; },
    face: n => [n.y, n.y + n.h],
    det(n, c, k) { const e = this.e(n), { x, y, w, h } = n;
      return `<ellipse cx="${x + w - e}" cy="${r2(y + h / 2)}" rx="${e - .75}" ry="${r2(h / 2 - .75)}" fill="${deeper(k, 10)}"/><path d="M${x + w - e} ${y}A${e} ${r2(h / 2)} 0 0 0 ${x + w - e} ${y + h}" class="n-det n-accent" stroke="${c}"/><path d="M${x + e + 6} ${r2(y + h - 6.5)}H${x + w - 2 * e - 6}" class="n-floor" stroke="${c}"/>`; },
    inset(n, s, t) { const e = this.e(n), ry = n.h / 2; if (s === 'L' || s === 'R') return ellIn(e, t - n.y - ry, ry);
      const a = n.x + e, b = n.x + n.w - e; return t >= a && t <= b ? 0 : ellIn(ry, t < a ? a - t : t - b, e); } },
  document: { // a file: UML's artifact, a page with its corner folded (and umlimator's own file sigil)
    out(n, d = 0) { const { x, y, w, h } = grown(n, d), R = 10 + d, f = 10;
      return `M${r2(x + R)} ${r2(y)}H${r2(x + w - f)}L${r2(x + w)} ${r2(y + f)}V${r2(y + h - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(y + h)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(y + h - R)}V${r2(y + R)}A${R} ${R} 0 0 1 ${r2(x + R)} ${r2(y)}Z`; },
    face: n => [n.y, n.y + n.h],
    det(n, c, k) { const { x, y, w } = n; return `<path d="M${x + w - 10} ${y}V${y + 7.5}Q${x + w - 10} ${y + 10} ${x + w - 7.5} ${y + 10}H${x + w}Z" fill="${deeper(k, 16)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { if (s === 'R' && t < n.y + 10) return 10 - (t - n.y); if (s === 'T' && t > n.x + n.w - 10) return t - (n.x + n.w - 10); return rectIn(n, s, t, 10); } },
  hexagon: { // the hook card's hexagon, for any card
    hx: n => Math.min(16, n.h / 3),
    out(n, d = 0) { const hx = this.hx(n), { x, y, w, h } = grown(n, d); return `M${r2(x + hx)} ${r2(y)}H${r2(x + w - hx)}L${r2(x + w)} ${r2(y + h / 2)}L${r2(x + w - hx)} ${r2(y + h)}H${r2(x + hx)}L${r2(x)} ${r2(y + h / 2)}Z`; },
    face: n => [n.y, n.y + n.h],
    inset(n, s, t) { const hx = this.hx(n); if (s === 'L' || s === 'R') return hx * Math.abs(t - n.y - n.h / 2) / (n.h / 2);
      const a = n.x + hx, b = n.x + n.w - hx; return t < a ? (a - t) * n.h / 2 / hx : t > b ? (t - b) * n.h / 2 / hx : 0; } },
  folder: { // UML's package: a folder with its tab on top, after the card's own tabs
    tw: n => Math.min(64, Math.round(n.w * .34)),
    out(n, d = 0) { const tw = this.tw(n), x0 = n.tabX ?? n.x, { x, y, w, h } = grown(n, d), r = 4 + d, R = 8 + d, th = 9, X0 = x0 - d, T1 = x0 + tw + d;
      const head = X0 <= x + .5 ? `M${r2(x)} ${r2(y + h - R)}V${r2(y + r)}A${r} ${r} 0 0 1 ${r2(x + r)} ${r2(y)}`
        : `M${r2(x)} ${r2(y + h - R)}V${r2(y + th + R)}A${R} ${R} 0 0 1 ${r2(x + R)} ${r2(y + th)}H${r2(X0)}V${r2(y + r)}A${r} ${r} 0 0 1 ${r2(X0 + r)} ${r2(y)}`;
      return `${head}H${r2(T1 - 3)}Q${r2(T1)} ${r2(y)} ${r2(T1 + 1.5)} ${r2(y + 2.5)}L${r2(T1 + 5)} ${r2(y + th)}H${r2(x + w - R)}A${R} ${R} 0 0 1 ${r2(x + w)} ${r2(y + th + R)}V${r2(y + h - R)}A${R} ${R} 0 0 1 ${r2(x + w - R)} ${r2(y + h)}H${r2(x + R)}A${R} ${R} 0 0 1 ${r2(x)} ${r2(y + h - R)}Z`; },
    face: n => [n.y + 9, n.y + n.h], tabY: n => n.y + 9,
    det(n, c, k) { const tw = this.tw(n), x0 = n.tabX ?? n.x;
      return `<path d="M${r2(x0 + .75)} ${n.y + 9}V${n.y + 4}A3.25 3.25 0 0 1 ${r2(x0 + 4)} ${n.y + .75}H${r2(x0 + tw - 3)}Q${r2(x0 + tw)} ${n.y + .75} ${r2(x0 + tw + 1.5)} ${n.y + 3}L${r2(x0 + tw + 4.4)} ${n.y + 9}Z" fill="${deeper(k, 14)}"/><path d="M${r2(x0)} ${n.y + 9}H${r2(x0 + tw + 5)}" class="n-det n-accent" stroke="${c}"/>`; },
    inset(n, s, t) { const tw = this.tw(n), x0 = n.tabX ?? n.x;
      if (s === 'T') return t >= x0 && t <= x0 + tw ? 0 : 9 + cornerIn(8, t, x0 > n.x + .5 ? n.x : -1e6, n.x + n.w);
      if (s === 'B') return rectIn(n, s, t, 8);
      // the side's top: a tab at the card's left corner has a 4 px corner at the top; elsewhere the body starts 9 px down, 8 px round
      const top = s === 'L' && x0 <= n.x + .5 ? cornerIn(4, t, n.y, 1e6) : t < n.y + 9 ? null : cornerIn(8, t, n.y + 9, 1e6);
      return top == null || top > 0 ? top : cornerIn(8, t, -1e6, n.y + n.h); } },
  node: { // UML's node: a box seen in perspective, for hosts and devices
    out(n, d = 0) { const p = 7, { x, y, w, h } = grown(n, d); return `M${r2(x)} ${r2(y + p)}L${r2(x + p)} ${r2(y)}H${r2(x + w)}V${r2(y + h - p)}L${r2(x + w - p)} ${r2(y + h)}H${r2(x)}Z`; },
    face: n => [n.y + 7, n.y + n.h],
    det(n, c, k) { const p = 7, { x, y, w, h } = n;
      return `<path d="M${x + 1} ${y + p}L${x + p} ${y + 1}H${x + w - 1}L${x + w - p} ${y + p}Z" fill="${deeper(k, 12)}"/><path d="M${x + w - p} ${y + p}L${x + w - 1} ${y + 1}V${y + h - p}L${x + w - p} ${y + h - 1}Z" fill="${deeper(k, 22)}"/>`
        + `<path d="M${x} ${y + p}H${x + w - p}V${y + h}" class="n-det n-accent" stroke="${c}"/><path d="M${x + w - p} ${y + p}L${x + w} ${y}" class="n-det" stroke="${c}"/>`; },
    inset(n, s, t) { const p = 7; return s === 'L' ? Math.max(0, n.y + p - t) : s === 'R' ? Math.max(0, t - n.y - n.h + p) : s === 'T' ? Math.max(0, n.x + p - t) : Math.max(0, t - n.x - n.w + p); } },
};
// what every shape reports (1.5): size(n), the box layout gives it (a map's card: mapNodeW wide, a row high; the classifier,
// src/typed/draw.js: from its text), and ports(n, side, k), k line ends spread evenly along a side ('L', 'R', 'T', 'B'), each on the outline
for (const S of Object.values(SHAPE)) { S.size ||= n => ({ w: mapNodeW(n), h: 64 }); S.ports = (n, side, k = 1) => portsOn(S, n, side, k); }
const SHAPE_NAMES = ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node']; // all 13
// a card's shape: its own `shape` first, then (a map's card: byKind) the one its kind draws, else a box
const shapeOf = (n, byKind = true) => { const sh = String(n.shape ?? '').toLowerCase(); if (SHAPE_NAMES.includes(sh)) return sh;
  const k = String(n.kind ?? '').toLowerCase(); return byKind && ((hasKey(NOTED, k) && NOTED[k]) || (hasKey(NOTED, n.k) && NOTED[n.k])) || 'box'; };
// a card as it is drawn (null for a box): its shape, and where its head, folder tab and title bar go, clear of its
// tabs, ⤢ and change badge. Drawing only: layout never sees it. ports: the card's highest line ends on its sides (sidePorts)
function cardLook(n, byKind, hint, ports) {
  const sh = shapeOf(n, byKind); if (sh === 'box') return null;
  const S = SHAPE[sh], L = { ...n, sh, S, portTop: ports ? Math.min(ports.L, ports.R) : Infinity, portL: ports ? ports.L : Infinity }, tabs = mapTabs(n), spans = []; let tx = n.x + 12;
  // a step keeps 16 px above the highest line into the left side (svgOf): where that is above a person's or robot's shoulder,
  // the shoulder comes up under it, 5 px below its middle (it floated 4 px above the shoulder)
  if (n.step && S.head && L.portL - 16 < S.tabY(L)) L.portTop = Math.min(L.portTop, Math.max(n.y, L.portL - 16) + 6);
  tabs.forEach(t => { spans.push([tx, tx + t.w]); tx += t.w + 4; });
  L.tabEnd = tabs.length ? tx - 2 : 0;
  const right = []; if (hint) right.push([n.x + n.w - 44, n.x + n.w - 8]);
  const ch = typeof n.change === 'string' && CHG[n.change.toLowerCase()]; if (ch) { const bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8 - (hint ? 40 : 0); right.push([bx, bx + bw]); }
  L.chromeEnd = Math.min(n.x + n.w - 10, ...right.map(s => s[0] - 6));
  const half = (S.head || 0) + 4;
  if (S.head) { // a head in the middle, unless a tab or a badge is there: then in the widest gap they leave
    const all = [...spans, ...right], lo = n.x + 22, hi = n.x + n.w - 22, mid = n.x + n.w / 2;
    let gaps = [[lo, hi]]; all.forEach(([a, b]) => { gaps = gaps.flatMap(([p, q]) => b <= p || a >= q ? [[p, q]] : [[p, a], [b, q]].filter(([u, v]) => v > u)); });
    const fits = gaps.filter(([p, q]) => q - p >= 2 * half), best = fits.find(([p, q]) => p <= mid - half && q >= mid + half) ? [mid - half, mid + half]
      : fits.sort((u, v) => Math.abs((u[0] + u[1]) / 2 - mid) - Math.abs((v[0] + v[1]) / 2 - mid))[0];
    L.hx = best ? Math.min(Math.max(mid, best[0] + half), best[1] - half) : mid;
  }
  if (sh === 'folder') L.tabX = tabs.length ? Math.min(L.tabEnd + 4, n.x + n.w - SHAPE.folder.tw(n) - 14) : n.x;
  // what else is on the tab line after the card's own tabs: ⤢, the change badge, a head (a robot's with its ears), a folder's tab
  L.busy = [...right, ...(S.head ? [[L.hx - S.head, L.hx + S.head]] : []), ...(sh === 'folder' ? [[L.tabX, L.tabX + SHAPE.folder.tw(n) + 5]] : [])];
  return L;
}
// where a tab w wide goes after the card's own tabs (an overlay's or a lens's badge): on a shape, the first place inside the
// card 2 px clear of what L.busy names, else the place inside it that covers least of them; on a box, or where the card's
// own tabs fill it, right after them
function tabAfter(n, L, w) {
  const x0 = mapTabs(n).reduce((a, t) => a + t.w + 4, n.x + 12); if (!L) return x0;
  const max = n.x + n.w - 2 - w, over = x => L.busy.reduce((s, [a, b]) => s + Math.max(0, Math.min(x + w, b + 2) - Math.max(x, a - 2)), 0);
  return [x0, ...L.busy.map(b => b[1] + 4), max].filter(x => x >= x0 && x <= max).reduce((b, x) => over(x) < over(b) ? x : b, x0);
}
// the line a card's tabs, ⤢, change badge and step sit on: a shape's top (a person's shoulders), else the box's
const tabLine = (n, L) => L && L.S.tabY ? L.S.tabY(L) : n.y;
const SIDE_OUT = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };
// a point p on a side of a card's box, slid onto the card's outline along the side's normal (S: its shape)
const slide = (S, L, side, p) => { const [ox, oy] = SIDE_OUT[side] || [0, 0], k = S.inset(L, side, side === 'L' || side === 'R' ? p[1] : p[0]) || 0; return [r2(p[0] - ox * k), r2(p[1] - oy * k)]; };
function portsOn(S, n, side, k) { const v = side === 'L' || side === 'R', [a, b] = v ? S.face(n) : [n.x, n.x + n.w]; // a side's span: its face on the left and right
  return Array.from({ length: k }, (_, i) => { const t = a + (b - a) * (i + 1) / (k + 1);
    return slide(S, n, side, v ? [side === 'L' ? n.x : n.x + n.w, t] : [t, side === 'T' ? n.y : n.y + n.h]); }); }
// a line as drawn: its ends slid from the card's box onto the card's outline, along the side's normal (the stub lengthens
// by as much); layout's points stay as they are. look(n): the card's look, or null for a box
function drawnPts(e, look) {
  const a = e.s && !e.s.box ? look(e.s) : null, b = e.t && !e.t.box ? look(e.t) : null;
  if (!a && !b) return e.pts;
  const pts = e.pts.map(p => p.slice());
  if (a) pts[0] = slide(a.S, a, e.fs, pts[0]);
  if (b) pts[pts.length - 1] = slide(b.S, b, e.ts, pts[pts.length - 1]);
  return pts;
}

// a typed shape's or box's change, as a card's: a NEW, CHANGED or PLANNED tab on its top; removed, its outlines faded, dashed and its
// text struck through; its accessible name says it (audit 44: the diff page drew a removed class as live, an added one unmarked).
// The fade is on its outlines, not its group, as a map card's is on its body: the page takes a drawn group's opacity off for its
// highlights, and a vendor's icon is never faded (audit 45). svgOf marks each typed shape so, and the interaction overview each
// shape of an inline interaction (audit 48)
const FADE = /<(rect|path|circle|ellipse|line|polyline|polygon)\b((?:[^>"]|"[^"]*")*?)(\/?)>/g;
function markShape(n, out) { const ch = CHG[typeof n.change === 'string' ? n.change.toLowerCase() : '']; if (!ch || typeof out !== 'string' || !/^\s*<g\b/.test(out)) return out;
  const word = ch[1].toLowerCase(), gone = word === 'removed', dash = gone || word === 'planned', bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8;
  let o = out.replace(/^(\s*<g\b[^>]*?)(\s*>)/, (_, a, b) => a.replace(/ aria-label="([^"]*)"/, (m, t) => ` aria-label="${t}, ${word}"`) + ` data-change="${word}"` + (dash ? ' stroke-dasharray="6 4"' : '') + b);
  if (gone) o = o.replace(/<text\b([^>]*)>/g, (m, a) => / text-decoration="/.test(a) ? m.replace(/ text-decoration="([^"]*)"/, (x, v) => ` text-decoration="${v} line-through"`) : `<text${a} text-decoration="line-through">`)
    .replace(FADE, (m, t, a, c) => / opacity="|\bn-logo\b/.test(a) ? m : `<${t}${a} opacity=".6"${c}>`);
  return !(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.w)) ? o : o.replace(/<\/g>\s*$/, `<g class="change-tab" aria-hidden="true"><rect x="${r2(bx)}" y="${r2(n.y - 8)}" width="${bw}" height="16" rx="8" fill="var(--um-mask)" stroke="var(--um-${ch[0]})" stroke-dasharray="none"/><text x="${r2(bx + bw / 2)}" y="${r2(n.y + 3)}" text-anchor="middle" class="badge-tx" fill="var(--um-${ch[0]})" text-decoration="none">${ch[1]}</text></g></g>`); }
// pts shortened by a at the start and b at the end, along its own segments: a line's flow stops where an arrowhead begins
const trimLine = (pts, a, b) => {
  const cut = (p, d) => { p = p.map(q => q.slice());
    while (d > 0 && p.length > 1) { const [x0, y0] = p[p.length - 2], [x1, y1] = p[p.length - 1], len = Math.hypot(x1 - x0, y1 - y0);
      if (len > d) { const t = (len - d) / len; p[p.length - 1] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; break; }
      d -= len; p.pop(); }
    return p; };
  return cut(cut(pts, b).reverse(), a).reverse();
};
function roundPath(pts, r = 9) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 1) { d += ` L ${x} ${y}`; continue; }
    const ax = x - (x - px) / l1 * rr, ay = y - (y - py) / l1 * rr, bx = x + (nx - x) / l2 * rr, by = y + (ny - y) / l2 * rr;
    d += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1]; return d + ` L ${last[0]} ${last[1]}`;
}
let svgSeq = 0;
/* SVG markup. opts: { childCount(id) -> n, subject: id, title, under, over } */
function svgOf(geo, opts = {}) {
  const id = 'g' + (svgSeq++), { nodes, edges, groups, bounds: B, map } = geo;
  const LINE = map ? 'var(--um-arrow)' : 'var(--um-muted)'; // a typed view's lines: 3:1 or more in both themes
  const col = k => `var(--um-${KIND[k][0]})`, fill = k => `var(--um-${KIND[k][0]}-f)`;
  const lc = x => (typeof x.change === 'string' ? x.change.toLowerCase() : ''), ech = e => { const c = lc(e); return c === 'added' || c === 'new' ? 'added' : c === 'removed' ? 'removed' : ''; }; // a change in any case, as CHG reads it (audit 45); text only, as validate() and the typed views read it (audit 46: a list ["removed"] drew REMOVED)
  const estyle = e => {
    if (e.style === 'faded') return { ...(map && e.wk ? { c: `var(--um-w-${e.wk})`, m: e.wk, cls: ' w-' + e.wk + ' faded' } : { c: LINE, m: 'd', cls: ' faded' }), dash: '', op: .35 }; // its own colour, faint, no flow (drift's idle lines)
    if (map && e.wk && !e.style && !ech(e)) return { c: `var(--um-w-${e.wk})`, m: e.wk, dash: e.back ? '6 5' : '', cls: ' w-' + e.wk + (e.back ? ' back' : '') };
    const st = e.style || ech(e);
    if (st === 'added' || st === 'emphasis') return { c: 'var(--um-green)', m: 'g', dash: '', flow: st === 'added' || e.animate };
    if (st === 'removed') return { c: 'var(--um-rose)', m: 'r', dash: '5 5', op: .7 };
    if (st === 'security') return { c: 'var(--um-rose)', m: 'r', dash: '5 5' };
    if (st === 'dashed' || st === 'async') return { c: 'var(--um-violet)', m: 'v', dash: '4 4' };
    return { c: LINE, m: 'd', dash: '' };
  };
  // a line that breaks a rule (#70): rose, with a "!" just after its start that names the rule (opts.broken: rule titles by edge id)
  const broke = e => opts.broken ? [...new Set((e.all || [e]).flatMap(x => opts.broken[x._id] || []))] : [];
  const lstyle = e => broke(e).length ? { ...estyle(e), c: 'var(--um-rose)', m: 'r' } : estyle(e);
  const ruleMark = (e, why) => { const [a, b] = e.pts, L = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) || 1, t = Math.min(18, L / 2) / L, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    return `<g class="rule-mark"><title>Breaks rule: ${esc(why.join('; '))}</title><circle cx="${x}" cy="${y}" r="6.5"/><text x="${x}" y="${y + 3.4}" text-anchor="middle">!</text></g>`; };
  const marker = (n, c, k = 1) => `<marker id="${id}-${n}" markerWidth="${10 * k}" markerHeight="${8 * k}" refX="${9 * k}" refY="${4 * k}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0 0 L${10 * k} ${4 * k} L0 ${8 * k} Z" fill="${c}"/></marker>`;
  const MC = { d: LINE, g: 'var(--um-green)', r: 'var(--um-rose)', v: 'var(--um-violet)', h: 'var(--um-cyan)', ...Object.fromEntries(WIRES.map(w => [w[0], `var(--um-w-${w[0]})`])) };
  const heavy = [...new Set(edges.filter(e => e.weight > 1).map(e => lstyle(e).m + '-w' + e.weight))]; // a heavier line's arrowhead grows with it
  // each card's look (0.15.0), and each line as drawn, its ends on the cards' outlines (a map's cards only)
  const kidsOf = n => n.kids != null ? n.kids : opts.childCount ? opts.childCount(n.id) : 0;
  // another view's node is drawn in its own shape, when it names one (1.5): its lines end where its ports() put them, on
  // its outline already, so they are drawn as given
  const ports = map ? sidePorts(geo) : null, looks = new Map(map ? nodes.map(n => [n, cardLook(n, true, !!(kidsOf(n) || n.opens) && opts.openHint !== false, ports.get(n))])
    : nodes.map(n => [n, n.shape != null && cardLook(n, false, false, null)]).filter(x => x[1]));
  const drawn = edges.map(e => map && looks.size ? drawnPts(e, n => looks.get(n) || null) : e.pts);
  const T = !map && TYPED.lines ? TYPED.lines({ id, nodes, families: geo.families, edges, drawn, lstyle, MC }) : null; // a typed view's line ends and end labels (src/typed/draw.js)
  let s = `<svg viewBox="${B.x} ${B.y} ${B.w} ${B.h}" data-w="${B.w}" data-h="${B.h}" role="group" aria-label="${esc(opts.title == null || opts.title === '' ? 'Diagram' : opts.title)}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>${marker('d', LINE)}${marker('g', 'var(--um-green)')}${marker('r', 'var(--um-rose)')}${marker('v', 'var(--um-violet)')}${marker('h', 'var(--um-cyan)')}${map ? WIRES.map(w => marker(w[0], `var(--um-w-${w[0]})`)).join('') : ''}${heavy.map(m => { const [c, k] = m.split('-w'); return marker(m, MC[c], 1 + (k - 1) * .35); }).join('')}${T ? T.defs : ''}</defs>`;
  const chWord = x => { const c = CHG[lc(x)]; return c ? ', ' + c[1].toLowerCase() : ''; }; // a key and a line's title say its change (audits 44, 45)
  // a line says only the marks a line is drawn with ('planned' is drawn unmarked, as validate() warns), and its edit mark, as
  // a card's name does (audit 56: a planned line was announced planned, an edited one's amber dot was never said)
  // a line diff() marks changed carries edited too: one amber dot, said once as changed (audit 57: "changed (edited)")
  const lnWord = e => { const c = CHG[lc(e)]; return (lc(e) === 'planned' ? '' : chWord(e)) + (!(c && c[0] === 'amber') && (e.all || [e]).some(x => x && x.edited) && !e.strong ? ' (edited)' : ''); };
  // a map line's weight (2 or 3) shows as its width on hover, selection and focus only; its title and name say why: its what
  // (Markdown for the details panel: as plain words, its first sentence, as a card's sub-line), else "weight 2 of 3"
  const wtWord = e => { if (!map || !(e.weight > 1)) return ''; const w = [...new Set((e.all || [e]).map(x => x.what).filter(x => x != null && x !== '').map(mdPlain).filter(Boolean))].join(' / ');
    return w || `weight ${e.weight} of 3`; };
  const marked = markShape; // a typed shape's or box's change (src/draw/shapes.js)
  // how many boxes a box sits in, each counted once: a container that names itself, or another in a cycle, as its parent
  // (validate()'s "ends up inside itself") draws, as BPMN draws an owner cycle (audit 48: the recursion overflowed the stack)
  const families = geo.families || [], familyDepth = f => { let d = 0; for (let p = f, seen = new Set([f]); p && p.parent != null && (p = families.find(q => q.id === p.parent)) && !seen.has(p); d++) seen.add(p); return d; };
  families.slice().sort((a,b) => familyDepth(a)-familyDepth(b)).forEach(f => {
    // a typed view's box whose shape draws a frame (notes/stage-2.md §5): the shape's markup, in the group the canvas selects. It keeps
    // .family-title (the audit, the canvas's "Box …, selected") and draws its border with class family-box: the canvas outlines a
    // selected box and the box under a drag by .family-box alone (src/canvas/styles.js)
    if (!map && hasKey(SHAPE, f.shape) && SHAPE[f.shape].frame) { s += marked(f, `<g class="family" data-family="${esc(f.id)}"${f.parent ? ` data-parent="${esc(f.parent)}"` : ''}${f.aria ? ` role="img" aria-label="${esc(f.aria)}"` : ''}>${SHAPE[f.shape].frame(f)}</g>`); return; }
    s += marked(f, `<g class="family${f.tone ? ' toned' : ''}" data-family="${esc(f.id)}"${f.parent ? ` data-parent="${esc(f.parent)}"` : ''}${f.tone ? ` style="--um-tone:${toneOf(f)}"` : ''}><rect class="family-box" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" stroke="var(--um-${familyDepth(f) ? 'cyan' : 'border-2'})"/>
      ${(map ? [f.label || f.id] : String(f.title || f.label || f.id).split(/\r\n?|[\n\u2028\u2029]/)).map((t, i) => `<text class="family-title" x="${f.x+12}" y="${f.y+18+i*14}" fill="var(--um-muted)" data-t="ft" data-o="${esc(f.id)}">${esc(t)}</text>`).join('')}${(f.tabs || []).map(t => t.fold ? `
      <g class="fold-hint"><title>Fold back into one card (E, or Alt + click a card in it)</title><rect x="${t.x}" y="${f.y - 8}" width="${t.w}" height="16" rx="8" class="n-mask" stroke="var(--um-accent)"/><text x="${t.x + t.w / 2}" y="${f.y + 4}" text-anchor="middle" class="badge-tx" fill="var(--um-accent)">⤡</text></g>` : `
      <g class="pub-tab" data-badge="${t.badge}"><rect x="${t.x}" y="${f.y - 8}" width="${t.w}" height="15" rx="4" fill="${t.fill}"/><text x="${t.x + t.w / 2}" y="${f.y + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`).join('')}</g>`);
  });
  (geo.lanes || []).forEach((l, i) => {
    s += `<g class="lane" data-lane="${i}">${l.bare ? '' : `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="14" class="lane-box"/>`}
      <circle cx="${l.x + 20}" cy="${l.y + 20}" r="8" class="lane-num"/><text x="${l.x + 20}" y="${l.y + 24}" text-anchor="middle" class="lane-num-tx">${i + 1}</text>
      <text x="${l.x + 34}" y="${l.y + 24}" class="lane-t" data-t="lt" data-o="lane:${i}">${esc(l.title)}</text>
      <text x="${l.x + 34 + sansW(l.title, 11, .95) + 8}" y="${l.y + 24}" class="lane-c">${l.ids.length} ${l.ids.length === 1 ? 'part' : 'parts'}</text></g>`;
    if (!l.bare && i < geo.lanes.length - 1) s += `<text x="${l.x + l.w + (l.gap || 32) / 2}" y="${l.y + 25}" text-anchor="middle" class="lane-arrow">→</text>`;
  });
  groups.forEach(g => {
    s += `<g class="grp"><rect x="${g.x}" y="${g.y}" width="${g.x2 - g.x}" height="${g.y2 - g.y}" rx="12" fill="${fill(g.k)}" fill-opacity=".35" stroke="${col(g.k)}" stroke-opacity=".55" stroke-dasharray="6 4"/>
      <text x="${g.x + 12}" y="${g.y + 16}" class="g-label" fill="${col(g.k)}">${esc(fit(g.label, 10, g.x2 - g.x - 24))}</text></g>`;
  });
  // tour (map): one ticket dot rides the view's loop; each stop pulses and each wire glows as it passes
  const TOUR = 8, f2 = v => +Math.min(1, Math.max(0, v)).toFixed(4), tour = map && opts.tour !== false && (geo.tour || []).length > 1 ? (() => {
    const pts = [], legs = {}, at = Object.create(null), ends = [];
    for (let i = 0; i + 1 < geo.tour.length; i++) {
      const a = geo.tour[i], b = geo.tour[i + 1], k = edges.findIndex(e => (e.from === a && e.to === b) || (e.both && e.from === b && e.to === a));
      if (k < 0) return null;
      const p = edges[k].from === a ? drawn[k] : [...drawn[k]].reverse();
      if (pts.length) pts.push([pts[pts.length - 1][0], p[0][1]]); // through the card to the next port
      const from = pts.length; pts.push(...p); ends.push([k, from, pts.length - 1, b]);
    }
    const P = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]), L = [0];
    pts.slice(1).forEach((p, i) => L.push(L[i] + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1])));
    const tot = L[L.length - 1] || 1; at[geo.tour[0]] = 0;
    ends.forEach(([k, a, b, to]) => { legs[k] = [L[a] / tot, L[b] / tot]; if (!(to in at)) at[to] = L[b] / tot; });
    return { d: roundPath(P), legs, at };
  })() : null;
  const tourAnim = (vals, times) => `<animate attributeName="opacity" values="${vals}" keyTimes="${times.map(f2).join(';')}" dur="${TOUR}s" repeatCount="indefinite"/>`;
  s += (opts.under || '') + '<g class="edges">'; // a type's layers (registry.js draw)
  (geo.intake || []).forEach(b => {
    const bp = roundPath(looks.size ? drawnPts({ pts: b.pts, t: geo.byId[b.to], ts: 'L' }, n => looks.get(n) || null) : b.pts); // its end on the card's outline, as a line's
    s += `<g class="intake"><title>${esc(b.label)} feeds ${esc((geo.byId[b.to] || {}).label || b.to)}</title><path d="${bp}" class="edge" stroke="var(--um-w-feeds)" marker-end="url(#${id}-feeds)"/>
      <circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" class="intake-chip${b.dashed ? ' dashed' : ''}"/>${b.logo ? `<image href="${esc(b.logo)}" x="${b.cx - 9}" y="${b.cy - 9}" width="18" height="18"/>` : b.mark ? `<text x="${b.cx}" y="${b.cy + 4.5}" text-anchor="middle" class="intake-mark">${esc(b.mark)}</text>` : ''}
      <text x="${b.cx - b.r - 7}" y="${b.cy + 3.5}" text-anchor="end" class="intake-tx">${esc(b.label)}</text>
      ${tour ? `<circle r="3.2" class="tour tour-packet" opacity="0"><animateMotion path="${bp}" keyPoints="0;0;1" keyTimes="0;.86;1" calcMode="linear" dur="${TOUR}s" repeatCount="indefinite"/>${tourAnim('0;0;.8;.8;0', [0, .86, .88, .99, 1])}</circle>` : ''}</g>`;
  });
  /* where a line's edited dot goes: the middle of its longest stretch clear of its own label, which is drawn over the lines (audit
     48: centred on the longest segment, where the label sits too, the dot was hidden under it, so a changed labelled line showed
     no mark). Each segment, the label's box widened by the dot's size cut out of it; the middle of a segment when none is clear */
  const dotAt = e => { const P = e.pts, L = e.lbl, m = 7, len = (a, b) => Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const box = L && [L.x, L.y, L.w, L.h].every(Number.isFinite) ? [L.x - m, L.y - m, L.x + L.w + m, L.y + L.h + m] : null;
    let best = null, mid = [P[0], P[1]];
    for (let k = 1; k < P.length; k++) { const a = P[k - 1], b = P[k], d = len(a, b); if (d > len(mid[0], mid[1])) mid = [a, b]; if (!(d > 0)) continue;
      // the part of the segment inside the box, as [t0, t1] along it (Liang-Barsky), and what is left either side of it
      let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
      if (box) for (const [p, q] of [[-dx, a[0] - box[0]], [dx, box[2] - a[0]], [-dy, a[1] - box[1]], [dy, box[3] - a[1]]]) {
        if (p === 0) { if (q < 0) { t0 = 1; t1 = 0; } } else { const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); } }
      const free = !box || t0 > t1 ? [[0, 1]] : [[0, t0], [t1, 1]];
      free.forEach(([u, w]) => { const l = (w - u) * d; if (l > 0 && (!best || l > best[0])) best = [l, [a[0] + dx * (u + w) / 2, a[1] + dy * (u + w) / 2]]; }); }
    return best && best[0] >= 8 ? best[1] : [(mid[0][0] + mid[1][0]) / 2, (mid[0][1] + mid[1][1]) / 2]; };
  edges.forEach((e, i) => {
    const E = T && T.edge(e, i), st = E ? E.st : lstyle(e), why = broke(e), d = roundPath(drawn[i]), mk = st.m, hk = st.m + (e.weight > 1 ? '-w' + e.weight : ''), ww = wtWord(e);
    // the flow stops where the arrowhead begins (its length, marker refX): weight 1's at rest; a heavier line's heavier one, drawn
    // on hover, selection and focus, a second flow line the styles swap in (audit 50: trimmed for it at rest, the pulses stopped short)
    const tip = w => 9 * (w > 1 ? 1 + (w - 1) * .35 : 1), fl = w => roundPath(trimLine(drawn[i], e.both ? tip(w) : 0, tip(w))), fd = E ? roundPath(E.pts) : fl(1);
    const marks = E ? E.marks : `marker-end="url(#${id}-${mk})" ${e.both ? `marker-start="url(#${id}-${mk})"` : ''}`;
    if (tour && tour.legs[i]) { const [a, b] = tour.legs[i];
      s += `<path d="${d}" class="tour-glow" stroke="${st.c}" opacity="0">${tourAnim('0;0;.55;.55;0;0', [0, a, Math.min(a + .01, b), b, b + .03, 1])}</path>`; }
    s += `<g class="edge-g${st.cls || ''}${e.weight > 1 ? ' wt-' + e.weight : ''}"${e.weight > 1 && !E ? ` style="--um-mk: url(#${id}-${hk})${e.both ? `; --um-mk-s: url(#${id}-${hk})` : ''}"` : ''} data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-i="${i}"><path d="${d}" class="halo"/><path d="${d}" class="hitline"/>
      <path d="${d}" class="edge${st.flow ? ' flow' : ''}" stroke="${st.c}" ${st.dash && !st.flow ? `stroke-dasharray="${st.dash}"` : ''} ${st.op ? `opacity="${st.op}"` : ''} ${marks}/>
      <path d="${fd}" class="flowline" stroke="${st.c}"/>${e.weight > 1 && !E ? `<path d="${fl(e.weight)}" class="flowline fl-hv" stroke="${st.c}"/>` : ''}${(e.all || [e]).some(x => x.edited || (CHG[lc(x)] || [])[1] === 'CHANGED') && !e.strong ? (() => { const [x, y] = dotAt(e);
        return `<circle cx="${x}" cy="${y}" r="4" class="edited-dot"><title>Edited</title></circle>`; })() : ''}${why.length ? ruleMark(e, why) : ''}
      <title>${!map && e.aria != null ? esc(e.aria + lnWord(e)) : `${e.step != null ? 'Step ' + esc(e.step) + ': ' : ''}${esc(e.s.label || e.s.id)} ${e.both ? '⇄' : '→'} ${esc(e.t.label || e.t.id)}${e.label ? ': ' + esc(e.label) : ''}${esc(lnWord(e))}`}${e.label && e.sublabel ? ' (' + esc(e.sublabel) + ')' : ''}${ww ? '\n' + esc(ww) : ''}${e.when ? '\n' + esc(e.when) : ''}${why.length ? '\nBreaks rule: ' + esc(why.join('; ')) : ''}</title></g>`;
  });
  // the tour's dot rides over the lines and boxes but under the cards: it goes into a card and comes out at its next
  // line, rather than across the card's name
  s += '</g>' + (tour ? `<g class="tour" aria-hidden="true"><circle r="5.5" class="tour-dot"><animateMotion path="${tour.d}" dur="${TOUR}s" repeatCount="indefinite"/></circle></g>` : '') + '<g class="nodes">';
  nodes.forEach(n => {
    if (!map && hasKey(SHAPE, n.shape) && SHAPE[n.shape].draw) { s += marked(n, SHAPE[n.shape].draw(n, col(n.k), fill(n.k))); return; } // a typed view's own shape: a class box (1.5), a note (1.9)
    const c = col(n.k), f = fill(n.k), removed = lc(n) === 'removed', planned = lc(n) === 'planned';
    const L = looks.get(n) || null, S = L && L.S; // a shaped card (0.15.0); null: a box, drawn as before
    const pub = map && n.k === 'm-public', priv = map && n.k === 'm-script', ext = map && n.k === 'm-ext', verb = map && n.k === 'm-verb';
    const dash = removed || ext || planned || (map && n.k === 'external'); // an external card is dashed (the legend says so)
    const rx = verb ? n.h / 2 : map ? 10 : 9;
    const kids = kidsOf(n), stacked = !!(kids || n.opens); // opens a view, loaded or not (#47)
    const subject = opts.subject === n.id;
    const verbs = map && (n.verbs || []).length ? n.verbs : null;
    const subTxt = n.noSub ? '' : String(n.sub || (map && n.origin ? n.origin : '') || (map ? (n.what ? (typeof n.what === 'string' ? mdPlain(n.what) : firstSentence(String(n.what))) : KIND[n.k][1]) : '')); // a Markdown what as plain words, as a line's (audit 58: a link, ==mark== and bullets were drawn raw); a model's text may be a number or a list: drawn as written
    const third = !!(verbs && subTxt && !priv && geo.subAndChips); // the view's subAndChips: the sub-line, then the chips on a third line (a script card shows no sub-line)
    const sw = map ? n.w - 70 : n.w - 24;  // map cards: text runs from 54 px in (after the mark) to 16 px from the right
    // a shape's face: the rows its mark and text use (a box's: the card). A short face takes a two-line sub-line to one, and
    // gives up the sub-line under a two-line name (the tooltip and the details panel keep it)
    const [ft, fb] = L ? S.face(L) : [n.y, n.y + n.h], fh = fb - ft, fy = (ft + fb) / 2;
    const labelPx = n.emphasis ? 15 : 13;
    const lw = map ? n.w - 70 : n.w - 72;  // the mark (sigil, icon or logo tile) reaches 27 px in; the name keeps 36 px each side
    const wraps = map && textW(n.label, labelPx) > lw && (!L || fh >= 30);
    const sub2 = map && subTxt && !verbs && textW(subTxt, 10) > sw && textW(n.label, n.emphasis ? 15 : 13) <= sw && (!L || fh >= 56) ? wrap2(subTxt, 10, sw) : null;
    const sub = subTxt && (!verbs || third) && !(L && wraps && fh < 44) ? (sub2 ? sub2.join(' ') : clauseFit(subTxt, 10, sw)) : '';
    const two = wraps ? wrap2(n.label, labelPx, lw) : null;
    const lpx = two ? labelPx : textW(n.label, labelPx) > lw ? (measureText ? Math.max(11, labelPx * lw / textW(n.label, labelPx)) : Math.max(11, lw / (String(n.label).length * 0.6))) : labelPx;
    const ly = fy + (third ? -14 : sub || verbs ? -3 : 4) - (two ? 8 : 0) - (sub2 ? 6 : 0);
    // A card is a button named by what it shows, in the order it shows it, so its visible text is a run of whole words of its
    // name (WCAG 2.5.3, as axe checks it) at every zoom: what always shows comes first, then the sub-line and chips (faded out
    // when zoomed far out). What is not shown, or not in full, goes in parentheses, which that check leaves out. The card's
    // texts are apart (whitespace between them), so text-based tools read separate words.
    const said = [], plain = t => String(t ?? '').replace(/…/g, '').replace(/\s+/g, ' ').trim();
    const part = (shown, full) => plain(shown) === plain(full) ? plain(full) : `${plain(shown)} (in full: ${plain(full)})`;
    const tx0 = map ? n.x + 54 : n.x + n.w / 2, anchor = map ? 'start' : 'middle', lines = (t, dy) => `<tspan x="${tx0}">${esc(t[0])}</tspan> <tspan x="${tx0}" dy="${dy}">${esc(t[1])}</tspan>`;
    const label = two ? two.join(' ') : fit(n.label, lpx, lw, true), subShown = sub && !priv; // a script card hides its sub-line
    said.push((plain(n.label) ? part(label, n.label) : plain(n.id)) + (subTxt && !subShown ? ` (${subTxt})` : ''));
    const parts = [`<title>${esc(n.label || n.id)}${subTxt ? ' · ' + esc(subTxt) : ''}${n.note ? '\n' + esc(n.note) : ''}${stacked ? '\nDouble-click to open' : ''}</title>`];
    if (L) { // a shape: its outline twice behind it when stacked, then the mask, the body and its details
      const o = S.out(L);
      if (stacked) parts.push([8, 4].map(k => `<path d="${o}" transform="translate(${k} ${k})" class="n-stack" stroke="${c}"/>`).join(''));
      if (pub) parts.push(`<path d="${S.out(L, 4)}" class="n-ring" stroke="${c}"/>`);
      parts.push(`<path d="${o}" class="n-mask"/><path d="${o}" class="n-body" fill="${f}" stroke="${c}"${dash ? ' stroke-dasharray="6 4"' : ''}${removed ? ' opacity=".6"' : ''}/>${S.det ? S.det(L, c, n.k) : ''}`); }
    else {
      if (stacked) parts.push(`<rect x="${n.x + 8}" y="${n.y + 8}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/><rect x="${n.x + 4}" y="${n.y + 4}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-stack" stroke="${c}"/>`);
      if (pub) parts.push(`<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="14" class="n-ring" stroke="${c}"/>`);
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-mask"/>
      <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${rx}" class="n-body" fill="${f}" stroke="${c}" ${dash ? 'stroke-dasharray="6 4"' : ''} ${removed ? 'opacity=".6"' : ''}/>`); }
    // the mark, centred on the face
    const mark = L && SIGIL[L.sh] ? L.sh : n.k; // a person's, robot's, phone's, terminal's, folder's or node's own mark
    parts.push((() => { const I = (opts.icons || {})[n.icon], x = map ? n.x + 14 : n.x + (verb ? 14 : 9), y = map ? fy - 14 : n.y + (priv ? 8 : 11), M = map ? 28 : 16;  // map: one 28 px mark, left, centred
return I && I.src ? `<rect x="${x - M * 3 / 28}" y="${y - M * 3 / 28}" width="${M * 34 / 28}" height="${M * 34 / 28}" rx="${M / 4}" class="n-logo${I.dark ? ' dark' : ''}"/><image href="${esc(I.src)}" x="${x}" y="${y}" width="${M}" height="${M}"/>`
  : I && I.g ? `<g transform="translate(${x} ${y}) scale(${M / 24})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 24 / M}" stroke-linecap="round" stroke-linejoin="round">${glyph(I.g)}</g>`
  : `<g transform="translate(${x} ${y}) scale(${M / 16})" class="n-sigil" fill="none" stroke="${c}" stroke-width="${1.75 * 16 / M}" stroke-linecap="round" stroke-linejoin="round">${SIGIL[mark]}</g>`; })());
    parts.push(`<text x="${tx0}" y="${ly}" text-anchor="${anchor}" class="n-label" data-o="${esc(n.id)}" data-t="nl" style="font-size:${lpx.toFixed(1)}px" ${removed ? 'text-decoration="line-through"' : ''}>${two ? lines(two, 15) : esc(label)}</text>`);
    const ty = tabLine(n, L); // the line the tabs, ⤢, the change badge and a step sit on
    if (map) { let tx = n.x + 12; mapTabs(n, c).forEach(t => { const tw = t.w; // each badge is its own tab, clickable on its own
      parts.push(`<g class="pub-tab"${t.badge != null ? ` data-badge="${t.badge}"` : ''}><rect x="${tx}" y="${ty - 8}" width="${tw}" height="15" rx="4" fill="${t.fill}"/><text x="${tx + tw / 2}" y="${ty + 3}" text-anchor="middle" class="tab-tx">${esc(t.text)}</text></g>`);
      said.push(t.badge != null ? badgesOf(n)[t.badge].text : t.text.toLowerCase()); tx += tw + 4; }); }
    if (map && n.edited) parts.push(`<g class="edited"><title>Edited</title><circle cx="${n.x + n.w - 10}" cy="${n.y + n.h - 10}" r="4" class="edited-dot"/></g>`);
    // a step on a shape's tab line (a person's shoulder), but never down over the arrow of a line into its left side: as low as
    // keeps 6 px clear of the highest one, and no higher than the box's corner
    if (map && n.step) { const t = String(n.step), sw = Math.max(20, sansW(t, 9.5, .9) + 10), sy = L ? Math.max(n.y, Math.min(ty, L.portL - 16)) : ty;
      parts.push(`<g class="step"><title>Step ${esc(t)}</title><rect x="${n.x - 10}" y="${sy - 10}" width="${sw}" height="20" rx="10" class="stp"/><text x="${n.x - 10 + sw / 2}" y="${sy + 3.5}" text-anchor="middle" class="stp-tx">${esc(t)}</text></g>`);
      said.push(`(step) ${t}`); }
    if (n.tag) { // author name tag under the card: a bigger headshot + @handle (avatar inlined by render)
      const T = n.tag, cxp = T.x + 11, cyp = T.y + 11, cid = 'av-' + id + '-' + String(n.id).replace(/[^\w-]/g, '_');
      const ini = T.img ? '' : [...String(n.author || '?').split(/[\s_-]+/).map(w => [...w][0]).join('')].slice(0, 2).join('').toUpperCase();
      parts.push(`<g class="ntag"><title>${esc(T.name ? 'by ' + T.name + ' (@' + n.author + ')' : n.author ? '@' + n.author : 'author unknown')}</title><rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" rx="${T.h / 2}" class="ntag-bg"/>`
        + (T.img ? `<clipPath id="${cid}"><circle cx="${cxp}" cy="${cyp}" r="13"/></clipPath><image href="${esc(T.img)}" x="${cxp - 13}" y="${cyp - 13}" width="26" height="26" clip-path="url(#${cid})" preserveAspectRatio="xMidYMid slice"/><circle cx="${cxp}" cy="${cyp}" r="13" class="ntag-ring" stroke="${c}"/>`
          : `<circle cx="${cxp}" cy="${cyp}" r="13" class="n-mask" stroke="${c}" stroke-width="1.4" stroke-dasharray="2 2"/><text x="${cxp}" y="${cyp + 3}" text-anchor="middle" class="ini-tx2" fill="${c}">${esc(ini)}</text> `)
        + `<text x="${T.x + 30}" y="${T.y + 14.5}" class="ntag-tx" data-t="nt" data-o="${esc(n.id)}">${esc(T.text)}</text></g>`);
      said.push(`(by${T.name ? ' ' + T.name : ''}) ${plain([ini, T.text].filter(Boolean).join(' '))}`);
    }
    const hint = stacked && opts.openHint !== false;
    if (hint) { const kx = map ? n.x + n.w - 44 : n.x + n.w - 40, ky = map ? ty - 8 : n.y + n.h - 11;
      parts.push(`<g class="open-hint${map ? '' : ' depth-read'}"><title>Open the inner view (or double-click the card)</title><rect x="${kx}" y="${ky}" width="36" height="16" rx="8" class="n-mask" stroke="${c}"/><text x="${kx + 18}" y="${ky + 12}" text-anchor="middle" class="badge-tx" fill="${c}">⤢${kids ? ' ' + kids : ''}</text></g>`);
      said.push(kids ? `${kids} (cards inside, opens the inner view)` : '(opens the inner view)'); }
    const ch = CHG[lc(n)];
    if (ch) {
      const bw = ch[1].length * 6 + 12, bx = n.x + n.w - bw - 8 - (hint && map ? 40 : 0); // left of a map card's ⤢ pill, which sits on the same edge
      parts.push(`<rect x="${bx}" y="${ty - 8}" width="${bw}" height="16" rx="8" fill="var(--um-mask)" stroke="var(--um-${ch[0]})"/>
        <text x="${bx + bw / 2}" y="${ty + 3}" text-anchor="middle" class="badge-tx" fill="var(--um-${ch[0]})">${ch[1]}</text>`);
      said.push(ch[1].toLowerCase());
    }
    if (sub) { parts.push(`<text x="${tx0}" y="${ly + 16 + (two ? 15 : 0)}" text-anchor="${anchor}" class="n-sub depth-read" data-o="${esc(n.id)}" data-t="ns">${sub2 ? lines(sub2, 12) : esc(sub)}</text>`);
      if (subShown) said.push(part(sub, subTxt)); }
    if (verbs) { // verb chips: the node's public surface, at a glance
      let vx = 0; const chips = [], maxW = third ? sw : n.w - 24; // on a third line they keep to the text's column, clear of the mark
      for (let i = 0; i < verbs.length; i++) {
        const wv = textW(verbs[i], 9.5) + 10, rest = verbs.length - i - 1, more = rest ? textW('+' + rest, 9.5) + 10 : 0;
        if (vx + wv + (rest ? more + 4 : 0) > maxW) { chips.push(['+' + (verbs.length - i), textW('+' + (verbs.length - i), 9.5) + 10, true]); break; } // the first too: a verb wider than any card is "+N" (#84)
        chips.push([verbs[i], wv]); vx += wv + 4;
      }
      const total = chips.reduce((a, c2) => a + c2[1], 0) + (chips.length - 1) * 4;
      let px = third ? tx0 : n.x + (n.w - total) / 2; const py = third ? ly + 23 + (two ? 15 : 0) : ly + 7;
      parts.push(`<g class="verbs depth-read">${chips.map(([t, wv], ci) => { const m = `<rect x="${px}" y="${py}" width="${wv}" height="14" rx="7" class="verb-chip" data-chip="${ci}" stroke="${c}"/><text x="${px + wv / 2}" y="${py + 10}" text-anchor="middle" class="verb-tx" data-chip="${ci}" data-o="${esc(n.id)}" data-t="nv" fill="${c}">${esc(t)}</text>`; px += wv + 4; return m; }).join('\n')}</g>`);
      chips.forEach(([t, , more], ci) => said.push(more ? `${t} (more: ${verbs.slice(ci).join(', ')})` : t));
    }
    if (map) {
      const ports = new Map();
      edges.forEach((e, i) => { const point = e.from === n.id ? (L ? drawn[i][0] : e.p1) : e.to === n.id ? (L ? drawn[i][drawn[i].length - 1] : e.p2) : null; if (!point) return; // a shape's ports on its outline
        const key = point.join(','); const port = ports.get(key) || { point, indices: [] }; port.indices.push(i); ports.set(key, port); });
      ports.forEach(({ point, indices }) => { parts.push(`<circle cx="${point[0]}" cy="${point[1]}" r="3.5" class="n-port" data-edges="${indices.join(',')}" stroke="${c}"/>`); });
    }
    const name = (s0 => (!map && n.opensTo ? `${unstop(s0)}, opens ${n.opensTo}` : s0))(said.join(', ') + (n.edited ? ' (edited)' : '') + (stacked && !hint ? ' (opens inner view)' : '')); // no ".," (audit 52)
    s += `<g class="node${pub ? ' pub' : ''}${priv ? ' priv' : ''}${stacked ? ' has-child' : ''}${subject ? ' subject' : ''}${n.emphasis ? ' main-step' : ''}${planned ? ' planned' : ''}${tour && n.id in tour.at ? ' tour-stop' : ''}"${tour && n.id in tour.at ? ` style="animation-delay:${(tour.at[n.id] * TOUR - .32).toFixed(2)}s"` : ''}${L ? ` data-shape="${L.sh}" data-face="${r2(ft)} ${r2(fb)}"` : ''} data-id="${esc(n.id)}" tabindex="${map ? 0 : -1}" role="${map ? 'button' : 'img'}" aria-label="${esc(name)}">
      ${parts.join('\n')}
    </g>`;
  });
  // focus targets after the cards (#43), under the labels: each line's (a typed one's named by e.aria), or one per id of geo.order (notes/stage-3.md S13)
  const ring = (a, name, d) => `<g class="um-key line-key${a}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(name)}"><path d="${d}" class="key-ring"/></g>`;
  const line = (e, i, said = e.label ? `: ${e.label}${e.sublabel ? ` (${e.sublabel})` : ''}` : '') => ring(`${e.weight > 1 ? ' wt-' + e.weight : ''}" data-i="${i}`, !map && e.aria != null ? e.aria + lnWord(e)
    : `${e.step != null ? `Step ${e.step}: ` : ''}Line ${e.both ? `between ${e.s.label || e.s.id} and ${e.t.label || e.t.id}, both ways` : `from ${e.s.label || e.s.id} to ${e.t.label || e.t.id}`}${said}${lnWord(e)}${wtWord(e) ? ', ' + wtWord(e) : ''}${broke(e).length ? `, breaks rule ${broke(e).join('; ')}` : ''}`, roundPath(drawn[i]));
  s += '</g><g class="keys">' + (!map && Array.isArray(geo.order) ? geo.order.map(id => { const n = hasKey(geo.byId || {}, id) && geo.byId[id], i = edges.findIndex(e => e.id === id);
    return n ? ring(` node-key" data-node="${esc(id)}`, String(n.aria || n.label || id) + chWord(n), `M${n.x} ${n.y}h${n.w}v${n.h}h${-n.w}z`) : i < 0 ? '' : line(edges[i], i); }) : edges.map((e, i) => line(e, i))).join('');
  s += '</g>' + (opts.over || '') + '<g class="labels depth-read">';
  edges.forEach((e, i) => {
    if (T) s += T.labels(i);
    if (!e.lbl) return;
    const L = e.lbl;
    if (map) {
      const sw = L.sw || 16, cy = L.y + L.h / 2; // the step mark: a circle, or a pill as wide as a longer number (#82)
      const st = L.step != null ? `${sw > 16 ? `<rect x="${L.x + 3}" y="${cy - 8}" width="${sw}" height="16" rx="8" class="e-step"/>` : `<circle cx="${L.x + 11}" cy="${cy}" r="8" class="e-step"/>`}<text x="${L.x + 3 + sw / 2}" y="${cy + 3.3}" text-anchor="middle" class="e-step-tx" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.step)}</text>` : '';
      const ax = L.step != null ? L.x + 7 + sw : L.x + L.w / 2, an = L.step != null ? '' : 'text-anchor="middle"';
      const tx = L.text ? `<text x="${ax}" y="${L.y + 14}" ${an} class="e-label" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.text)}</text>` : '';
      const sb = L.sub ? `<text x="${ax}" y="${L.y + 26}" ${an} class="e-sub" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${esc(L.sub)}</text>` : '';
      s += `<g class="e-lab${L.tag ? ' ctag' : ''}${e.wk ? ' w-' + e.wk : ''}" data-i="${i}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${Math.min(L.h / 2, 10)}" class="e-lbg"/>${st}${tx}${sb}</g>`;
    } else
    // a typed line's label: a line break starts a new line where the label placer sized the box for its lines (audit 22); a box
    // of one line draws its text on one line, as SVG draws a break; the sequence and timing types size theirs 13 px a line, the placer 12
    { const cx = L.x + L.w / 2, part = String(L.text ?? '').split(EDGE_BREAK), rows = L.h >= 16 + EDGE_LH * (part.length - 1) ? part : [part.join(' ')];
      s += `<g class="e-lab" data-i="${i}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="5" class="e-lbg"/><text x="${cx}" y="${L.y + 12.5}" text-anchor="middle" class="e-label" data-t="el" data-o="${esc(e.from)}>${esc(e.to)}">${rows.length < 2 ? esc(L.text) : rows.map((r, k) => `<tspan x="${cx}"${k ? ` dy="${EDGE_LH}"` : ''}>${esc(r)}</tspan>`).join('')}</text></g>`; }
  });
  return s + '</g></svg>';
}
const CHG = Object.assign(Object.create(null), { added: ['green', 'NEW'], new: ['green', 'NEW'], modified: ['amber', 'CHANGED'], changed: ['amber', 'CHANGED'], removed: ['rose', 'REMOVED'], planned: ['cyan', 'PLANNED'] }); // no prototype: a change named constructor is none
// a line's fromSide or toSide, as its side's letter; no prototype: a side named toString is none, as validate() says (audit 28: it was a function)
const EDGE_SIDE = Object.assign(Object.create(null), { left: 'L', right: 'R', top: 'T', bottom: 'B' });
const NW = 168, CG0 = 84, RG0 = 44;
const pillW = (label, sub, max = 440) => Math.max(sansW(fit(label, 10.5, max), 10.5, .92), sub ? sansW(fit(sub, 9.5, max), 9.5, .92) : 0) + 18; // a line's label, and its sublabel under it (#44)
const stepW = s => String(s).length > 1 ? Math.max(20, sansW(String(s), 9.5, .9) + 8) : 16; // a line's step mark: a 16 px circle, or a pill for 2a, 12 or 4.1 (#82)
// steps in order: numbers by value, text by its leading number and then the rest (2 < 2a < 2b < 3); no step last
const stepKey = s => { const t = String(s ?? ''), m = /^\d+(?:\.\d+)?/.exec(t); return [s == null ? 1 : 0, m ? +m[0] : Infinity, m ? t.slice(m[0].length) : t]; };
const stepOrder = (a, b) => { const p = stepKey(a), q = stepKey(b); return p[0] - q[0] || p[1] - q[1] || (p[2] < q[2] ? -1 : p[2] > q[2] ? 1 : 0); };
const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
// a plain (not a map's) line label's width: one line of 10 px text, its step first, as layoutPass's sizeOf measures it
// a line whose route layoutPass draws itself in a typed view: 'loop' (a node to itself) or 'fan'. A symbol, so no field of a
// model's line can set it
const OWN_ROUTE = Symbol('own route');
// a typed view laid out as before audit 38 (layoutTyped's try when the new one leaves check() something to say): a symbol, so
// no field of a model's view can set it
const PLAIN = Symbol('plain');
// a typed view whose lines to one card took its top and bottom by turns though the card's other lines go elsewhere (audit 39),
// laid out without those turns too (layoutTyped): a symbol, so no field of a model's view can set it
const TURNS = Symbol('turns');
// a typed view whose box side, past its title, had no room for its lines and grew over the title (audit 44), laid out without
// that too (layoutTyped): a symbol, as TURNS
const SPAN = Symbol('span');
// a typed view's labels placed only once routing was done, on a looser spot (layoutPass's last try): they ask for room as a lost one does
const LOOSE = new WeakSet();
// gridRoute's working arrays, kept between its searches and cleared for each: a fresh set for every search (a view of 90 cards
// makes some 270, on grids of up to 64000 cells) was most of a route's time spent in allocating and collecting them. Kept for
// grids of up to GR_MAX cells (some 15 MB), and a heap of up to a million items; a bigger one is made for its search alone
const GR_MAX = 1 << 18, GR_POOL = { n: 0, hn: 0 };
const grPool = N => { const P = N > GR_MAX ? { n: 0, hn: 0 } : GR_POOL; if (P.n < N) { const n = P === GR_POOL ? Math.min(GR_MAX, Math.max(N, 2 * P.n)) : N;
    P.u8 = Array.from({ length: 7 }, () => new Uint8Array(n)); P.near = new Uint8Array(2 * n); P.dist = new Float64Array(4 * n); P.prev = new Int32Array(4 * n); P.n = n; }
  if (!P.hn || P.hn > 1 << 20) { P.hd = new Float64Array(256); P.hk = new Int32Array(256); P.hn = 256; }
  return P; };
const labelW = e => widest(String((e.step != null ? e.step + ' · ' : '') + (e.label || '')).split(EDGE_BREAK), r => textW(fit(r, 10, e.cut || 150), 10)) + 12; // its widest line

/* Layered auto-layout for views that carry no col/row: longest-path layers (cycles broken by DFS),
   barycentre ordering sweeps, integer rows so row gaps stay free as routing channels. */
/* Lines cross as little as the order of the cards in a column allows (#53): a few barycentre sweeps (each card goes where
   its neighbours in the next or previous column lie, its place now breaking ties), and the best order found is kept only
   when it crosses less than the order given. A line that skips columns has a point in each column it passes (Sugiyama's
   dummy nodes), so it orders the cards it runs between too. cols: columns of ids in reading order, changed in place;
   links: [a, b] with b in a later column.
   A box is one item of its column, h(id) rows tall, and a line meets it at the row of its card inside (#86): [a, b, oa, ob]
   leaves a at row oa inside it and reaches b at row ob, as rowsFor's links do (the middle when not given). Each line into a
   box has its own entry, so two that cross on the way in to its cards count as crossing; they all met it at one point.
   fixed: items at a set row in columns of their own, which stay as they are (a box's far ends, in blockPos). */
function untangle(cols, links, h = () => 1, fixed = Object.create(null)) { // maps by id: no prototype (M3)
  const colOf = Object.create(null); cols.forEach((c, k) => c.forEach(id => { colOf[id] = k; }));
  const segs = [], extra = new Set(), want = Object.create(null), hh = id => extra.has(id) ? 1 : h(id), mid = (id, o) => o ?? (hh(id) - 1) / 2;
  const tops = () => { const at = Object.create(null); cols.forEach(c => { let r = 0; c.forEach(id => { at[id] = fixed[id] ?? r; r += hh(id); }); }); return at; }; // each item's top row
  const at0 = tops();
  links.forEach(([a, b, oa, ob], n) => {
    const ka = colOf[a], kb = colOf[b]; if (ka == null || kb == null || kb <= ka) return;
    let prev = a, po = mid(a, oa); const ra = at0[a] + po, rb = at0[b] + mid(b, ob);
    for (let k = ka + 1; k < kb; k++) { // a point first goes where the straight line between its ends would be
      const p = '\u0001' + n + '.' + k; extra.add(p); colOf[p] = k; want[p] = ra + (rb - ra) * (k - ka) / (kb - ka);
      segs.push([prev, p, po, 0]); prev = p; po = 0; }
    segs.push([prev, b, po, mid(b, ob)]);
  });
  if (extra.size) cols.forEach((c, k) => { const ps = [...extra].filter(p => colOf[p] === k);
    if (ps.length) cols[k] = [...c.map(id => [id, at0[id], 0]), ...ps.map(p => [p, want[p], 1])].sort((x, y) => x[1] - y[1] || x[2] - y[2]).map(x => x[0]); });
  const ins = Object.create(null), outs = Object.create(null); segs.forEach(([a, b, oa, ob]) => { (outs[a] ||= []).push([b, ob, oa]); (ins[b] ||= []).push([a, oa, ob]); });
  // two lines out of one column cross when their order at its end is the other way round from their order at their start (a
  // tie either end is no crossing): sorted by their start (ties by their end), the crossings are the pairs an earlier one ends
  // below a later one, counted with a Fenwick tree over their ends. Each pair tested made a view of 150 lines into one card,
  // which pass through some 30 columns, spend a second here (audit 55)
  const crossings = () => { const at = tops(); let n = 0; const byCol = new Map();
    for (const [a, b, oa, ob] of segs) { const k = colOf[a]; let L = byCol.get(k); if (!L) byCol.set(k, L = []); L.push([at[a] + oa, at[b] + ob]); }
    for (const L of byCol.values()) { if (L.length < 2) continue; L.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const vs = [...new Set(L.map(p => p[1]))].sort((x, y) => x - y), rank = new Map(vs.map((v, i) => [v, i + 1])), bit = new Int32Array(vs.length + 1);
      L.forEach(([, v], seen) => { const r = rank.get(v); let le = 0; for (let i = r; i > 0; i -= i & -i) le += bit[i]; n += seen - le; for (let i = r; i <= vs.length; i += i & -i) bit[i]++; }); }
    return n; };
  let best = segs.length > 1 ? crossings() : 0, keep = cols.map(c => c.slice()); // the order given, unless one crosses less
  for (let it = 0; it < 8 && best; it++) {
    const down = it % 2 === 0, seq = cols.map((_, k) => k).filter(k => (down ? k > 0 : k < cols.length - 1) && !cols[k].every(id => id in fixed));
    if (!down) seq.reverse();
    for (const k of seq) { const at = tops(), side = down ? k - 1 : k + 1; // where each item would be for its lines to run level
      const key = id => { const nb = ((down ? ins : outs)[id] || []).filter(([x]) => colOf[x] === side).map(([x, ox, o]) => at[x] + ox - o);
        return nb.length ? nb.reduce((x, y) => x + y, 0) / nb.length : at[id]; };
      cols[k] = cols[k].map((id, i) => [id, key(id), i]).sort((p, q) => p[1] - q[1] || p[2] - q[2]).map(x => x[0]); }
    const n = crossings(); if (n < best) { best = n; keep = cols.map(c => c.slice()); }
  }
  keep.forEach((c, k) => { cols[k] = c.filter(id => !extra.has(id)); });
}
/* A card no line comes into goes just before its nearest callee, not in the first column: its lines get shorter. Returns
   the ranks with it moved, or null when none moves (bestFlow keeps them when they route better). */
function pullSources(ids, links, rank) {
  const into = new Set(links.map(([, b]) => b)); let moved = false; const out = { ...rank };
  ids.forEach(i => { const to = links.filter(([a]) => a === i).map(([, b]) => rank[b]).filter(r => r != null);
    if (to.length && !into.has(i) && Math.min(...to) - 1 > rank[i]) { out[i] = Math.min(...to) - 1; moved = true; } });
  return moved ? out : null;
}
/* Rows for ordered columns: each card level with the cards its lines come from (the median row), then with those they go
   to, then again from the left, as near as the order allows with its height between it and the next (least squares: pool
   adjacent violators); on half rows from 0. A line between cards on one row runs straight, past fewer cards. h: an item's
   height in rows (a box in a view with boxes); a link [a, b, oa, ob] leaves a at row oa inside it and reaches b at row
   ob (a box's card), else at its middle. fixed: items at a set row, in columns of their own that stay (as untangle's). */
function rowsFor(cols, links, h = () => 1, fixed = Object.create(null)) {
  const row = Object.create(null); if (!cols.length) return row; // an empty view
  const colOf = Object.create(null); cols.forEach((c, k) => { let r = 0; c.forEach(id => { row[id] = fixed[id] ?? r; r += h(id); colOf[id] = k; }); });
  const ins = Object.create(null), outs = Object.create(null), at = (id, o) => o ?? (h(id) - 1) / 2; // where a link meets an item, in rows from its top
  links.forEach(([a, b, oa, ob]) => { if (colOf[a] == null || colOf[b] == null || colOf[b] <= colOf[a]) return;
    (outs[a] ||= []).push([b, at(b, ob), at(a, oa)]); (ins[b] ||= []).push([a, at(a, oa), at(b, ob)]); });
  const median = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const fit = (list, want) => { const blocks = []; let off = 0;
    list.forEach(id => { blocks.push({ ids: [id], sum: want[id] - off, n: 1 }); off += h(id);
      while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).n > blocks.at(-1).sum / blocks.at(-1).n) { const b = blocks.pop(), a = blocks.at(-1); a.ids.push(...b.ids); a.sum += b.sum; a.n += b.n; } });
    off = 0; blocks.forEach(b => b.ids.forEach(id => { row[id] = b.sum / b.n + off; off += h(id); })); };
  for (const [from, to, step] of [[1, cols.length, 1], [cols.length - 2, -1, -1], [1, cols.length, 1]])
    for (let k = from; k !== to; k += step) { if (cols[k].every(id => id in fixed)) continue; const want = Object.create(null);
      cols[k].forEach(id => { const nb = (step > 0 ? ins : outs)[id] || []; want[id] = nb.length ? median(nb.map(([x, ox, o]) => row[x] + ox - o)) : row[id]; });
      fit(cols[k], want); }
  const low = Math.min(...Object.keys(row).filter(id => !(id in fixed)).map(id => row[id]));
  cols.forEach(c => !c.every(id => id in fixed) && c.forEach((id, i) => { row[id] = Math.round((row[id] - low) * 2) / 2; if (i) row[id] = Math.max(row[id], row[c[i - 1]] + h(c[i - 1])); }));
  return row;
}
/* A typed view's pins, settled (audit 58): two pins on one cell, a pin on the cell of a card in a box it is not in or in such
   a box's cells, or one that grows its own box over a card or box it does not hold, drew one thing over another (Alt + an
   arrow, or a drag, onto any of them). The pins are taken in order, each kept where it is clean, else moved to the nearest
   clean slot: a row down, then up, then across, then a ring further out, as far as the cards placed reach and two cells past.
   With none there (its box hemmed in, a pin far off: audit 59), it goes in a fresh row under its box, what lies below moved
   down to make it, which is always clean. pins: [[id, [col, row]]]; at: the other cards that hold a place (by id); up(id): the
   boxes a card, or a box, lies in, innermost first; fixed: those of them whose cell no pin shares, in a box or not. A box's
   cells run from its cards' first column and row to their last, a card more than half a row (column) into them in it (as
   boxFit, src/map/context.js). The result: the pins' cells by id, and under MOVED the other cards a fresh row moved down.
   Each box's cells are found once a pin, not once a cell tried (audit 59: seconds a layout) */
const MOVED = Symbol('moved');
function settlePins(pins, at, up, fixed = null, rows = .5) { // rows: how far past a box's last row a card is in it (1: a whole row)
  const pos = Object.assign(Object.create(null), at), out = Object.create(null), moved = Object.create(null), ups = Object.create(null), upOf = x => (ups[x] ||= up(x) || []);
  const boxes = [...new Set([...Object.keys(pos), ...pins.map(p => p[0])].flatMap(upOf))];
  const over = (R, c, r) => !!R && c > R.c0 - .5 && c < R.c1 + .5 && r > R.r0 - rows && r < R.r1 + rows, meet = (A, B) => !!A && !!B && A.c0 < B.c1 + .5 && B.c0 < A.c1 + .5 && A.r0 < B.r1 + rows && B.r0 < A.r1 + rows;
  const grow = (R, c, r) => (R ? { c0: Math.min(R.c0, c), c1: Math.max(R.c1, c), r0: Math.min(R.r0, r), r1: Math.max(R.r1, r) } : { c0: c, c1: c, r0: r, r1: r });
  pins.forEach(([i, p]) => { let q = p; delete pos[i];
    const R = Object.create(null), col = new Map(), ui = upOf(i), mine = new Set(Object.keys(out)); // each box's cells, and the cards by column, as placed so far
    for (const j in pos) { const [c, r] = pos[j]; upOf(j).forEach(b => { R[b] = grow(R[b], c, r); }); if (!col.has(c)) col.set(c, []); col.get(c).push(j); }
    const clean = (c, r) => {
      for (const j of col.get(c) || []) if (Math.abs(pos[j][1] - r) < 1 && (mine.has(j) || fixed && fixed.has(j) || upOf(j).some(b => !ui.includes(b)))) return false; // an earlier pin's cell, or a card of a box it is not in
      for (const b of boxes) { if (ui.includes(b)) continue; if (over(R[b], c, r)) return false; } // in such a box's cells
      for (const b of ui) { const R0 = R[b], R1 = grow(R0, c, r); if (R0 && R1.c0 === R0.c0 && R1.c1 === R0.c1 && R1.r0 === R0.r0 && R1.r1 === R0.r1) continue; // not grown
        for (const j in pos) if (!upOf(j).includes(b) && over(R1, ...pos[j]) && !over(R0, ...pos[j])) return false; // its box grown over a card it does not hold
        for (const o of boxes) if (o !== b && !ui.includes(o) && !upOf(o).includes(b) && meet(R1, R[o]) && !meet(R0, R[o])) return false; } // or over another box
      return true; };
    if (!clean(p[0], p[1])) { let c0 = p[0], c1 = p[0], r0 = p[1], r1 = p[1]; for (const j in pos) { const [c, r] = pos[j]; c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
      c0 -= 2; c1 += 2; r0 -= 2; r1 += 2; // the cells tried: as far as the cards placed reach, and two past
      const lim = Math.min(pins.length + Object.keys(pos).length + 4, Math.max(p[0] - c0, c1 - p[0]) + Math.max(p[1] - r0, r1 - p[1])), neg = (v, v0) => v < 0 && v0 >= 0; q = null;
      for (let m = 1; !q && m <= lim; m++) { const ring = []; for (let dc = -m; dc <= m; dc++) { const k = m - Math.abs(dc); ring.push([dc, k]); if (k) ring.push([dc, -k]); }
        ring.sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]) || (a[1] < 0) - (b[1] < 0) || (a[0] < 0) - (b[0] < 0));
        for (const [dc, dr] of ring) { const c = p[0] + dc, r = p[1] + dr; if (c < c0 || c > c1 || r < r0 || r > r1 || neg(c, p[0]) || neg(r, p[1])) continue; if (clean(c, r)) { q = [c, r]; break; } } }
      if (!q) { // a fresh row under its innermost box with cards placed, in the column nearest the pin; with none, under every card
        const b = ui.find(x => R[x]), B = b ? R[b] : null, low = B ? B.r1 : Math.max(p[1], ...Object.values(pos).map(x => x[1]));
        const below = Object.keys(pos).filter(j => pos[j][1] > low), d = B && below.length ? Math.max(0, Math.ceil(low + 2 - Math.min(...below.map(j => pos[j][1])))) : 0;
        if (d) below.forEach(j => { pos[j] = [pos[j][0], pos[j][1] + d]; if (mine.has(j)) out[j] = pos[j]; else moved[j] = pos[j]; });
        q = B ? [Math.min(B.c1, Math.max(B.c0, p[0])), low + 1] : [p[0], Math.floor(low) + 2]; } }
    out[i] = pos[i] = q; });
  Object.defineProperty(out, MOVED, { value: moved });
  return out;
}
/* A view that ranks its own cards (component, BPMN, requirement) with pins: at, its ranked cells by id, the pins [[id, cell]]
   settled (settlePins) and put in, then each other card, in order, at its cell, or down a row while a card is there, and on
   to the nearest clean slot when its box would grow there over what it does not hold (the component gallery's Basket pinned
   on Checkout's cell, Checkout down past Payment provider). at is changed and returned */
function pinCells(at, P, up, order = Object.keys(at)) {
  const pinned = new Set(P.map(([id]) => id)), S = settlePins(P, Object.fromEntries(Object.entries(at).filter(([id]) => !pinned.has(id))), up), held = new Set(pinned);
  let taken = P.map(([id]) => S[id]); const free = (c, r) => !taken.some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1);
  P.forEach(([id]) => { at[id] = S[id]; }); Object.assign(at, S[MOVED]); // what a fresh row a pin went in moved down
  order.forEach(id => { if (pinned.has(id) || !Object.hasOwn(at, id)) return; let [c, r] = at[id]; if (!free(c, r)) { while (!free(c, r)) r++;
    const rest = Object.assign(Object.create(null), at); delete rest[id]; const S2 = settlePins([[id, [c, r]]], rest, up, held); [c, r] = S2[id];
    if (Object.keys(S2[MOVED]).length) { Object.assign(at, S2[MOVED]); taken = [...held].map(h => at[h]); } }
    at[id] = [c, r]; taken.push([c, r]); held.add(id); });
  return at;
}
/* Geometry: node boxes, ports, orthogonal routes, label slots. A view with lines the router found no route for is laid
   out once more, with room where those lines need it (#40); a view whose lines all route keeps its geometry. */
function layoutGraph(dg, map) {
  let g = layoutPass(dg, map, null), rr = g.rr, turns = g.turns, grew = g.grew;
  if (g.room) { const g2 = layoutPass(dg, map, g.room, true); g2.ms.probe = g.ms.probe; g = g2; rr ||= g.rr; turns ||= g.turns; grew ||= g.grew; }
  // a label with no room where it fits: the view laid out again with room for it, kept with fewer issues and labels cut short
  if (g.labelRoom) { const g2 = layoutPass(dg, map, g.labelRoom, true), cut = h => h.edges.reduce((n, e) => n + (e.label || e.step != null ? !e.lbl ? 2 : e.lbl.short || LOOSE.has(e) ? 1 : 0 : 0), 0); // a label not drawn the worst
    delete g.labelRoom; rr ||= g2.rr; turns ||= g2.turns; grew ||= g2.grew; if (routeAudit(g2, '').length + cut(g2) < routeAudit(g, '').length + cut(g)) g = g2; }
  if (turns) g.turns = true; // layoutTyped judges those turns
  if (grew) g.grew = true; // and a side grown over a box's title
  if (rr) g.rr = true; // a typed view's request/reply swap kept: buildGeo (context.js) judges it by the finished picture
  // two lines that still cross: one takes another side, and the view is laid out so once more, kept if it has fewer issues. A
  // line that closes a loop leaves its source on the far side, out round the map as a loop under the boxes does, and still comes
  // in on its target's near side (clinic's reminder, from the SMS gateway under Patient records, crossed the line into Patient
  // records); of two other lines, the steeper comes into its target's top or bottom (clinic's "Sends texts" with Clinic bookings
  // unfolded, up past Patient records into the SMS gateway's bottom). ponytail: a layout more, so only up to 30 cards (as
  // bestFlow); a larger view keeps its crossings
  const refs = [], pairs = map && !dg.quick && !dg.flipped && dg.nodes.length <= 30 ? routeAudit(g, '', null, refs).flatMap((s, k) => s.endsWith(' cross') ? [refs[k]] : []) : [];
  const far = { L: 'right', R: 'left', T: 'bottom', B: 'top' }, dy = e => (e.s.y + e.s.h / 2) - (e.t.y + e.t.h / 2), out = new Map();
  pairs.forEach(p => p.forEach(e => { if (e.back && !e.fixed && !e.fromSide) out.set(e.from + '>' + e.to, ['fromSide', far[e.fs]]); }));
  pairs.forEach(p => { const e = p.filter(e => !e.back && !e.fixed && !e.toSide && /[LR]/.test(e.ts) && dy(e)).sort((a, b) => Math.abs(dy(b)) - Math.abs(dy(a)))[0];
    if (e && !p.some(o => out.has(o.from + '>' + o.to))) out.set(e.from + '>' + e.to, ['toSide', dy(e) > 0 ? 'bottom' : 'top']); });
  let best = g, bestDg = dg, n = pairs.length ? routeAudit(g, '').length : 0;
  const attempt = d => { const h = layoutGraph({ ...d, flipped: true }, map), k = routeAudit(h, '').length; if (k < n) { best = h; bestDg = d; n = k; } };
  if (out.size) attempt({ ...dg, edges: dg.edges.map(e => out.has(e.from + '>' + e.to) ? { ...e, [out.get(e.from + '>' + e.to)[0]]: out.get(e.from + '>' + e.to)[1] } : e) });
  // two lines that still cross where neither can take another side without crossing the other (two cards that each feed the
  // same two cards, as web and admin feed kit and api-client in r15's monorepo, issue 111): one of them goes round the outside,
  // out its source's far side and into its target's top (bottom) from beyond. Of the first two crossing pairs, the lines from
  // two cards that both feed both their targets are tried first, then the pairs' own lines, each on its own (on the layout kept so far,
  // and on the first), and the best layout kept. ponytail: up to four layouts more, on views of up to 30 cards; r19/plain takes
  // about four times as long for them, and gains nothing
  const r2 = [], left = n && best !== g ? routeAudit(best, '', null, r2).flatMap((s, k) => s.endsWith(' cross') ? [r2[k]] : []) : pairs;
  const feeds = (s, t) => best.edges.some(o => o.s === s && o.t === t), both = ([a, b]) => { const k = a.t !== b.t && best.edges.filter(o => [a.t, b.t].includes(o.t) && feeds(o.s, a.t) && feeds(o.s, b.t)); return k && k.length >= 4 ? k : []; };
  const round = [...new Set([...left.slice(0, 2).flatMap(both), ...left.slice(0, 2).flat()])].filter(e => !e.back && !e.fixed && !e.fromSide && !e.toSide && /[LR]/.test(e.fs) && /[LR]/.test(e.ts));
  let tries = 4;
  round.forEach(e => { const side = { fromSide: e.fs === 'R' ? 'left' : 'right', toSide: dy(e) >= 0 ? 'top' : 'bottom' };
    [...new Set([bestDg, dg])].forEach(d => { if (n && tries-- > 0) attempt({ ...d, edges: d.edges.map(x => x.from === e.from && x.to === e.to ? { ...x, ...side } : x) }); }); });
  // fan-in (issue 149): lines into a card that six or more lines come into still cross. One line of such a pair at a time, of
  // the first pair first, goes round the outside (out its source's far side, or into its target's), or its target moves to
  // the foot of its column; a layout with fewer such crossings and no more issues is kept, and the search goes on from it; the
  // view keeps the one found only when it has fewer issues than at the start.
  // r19's logger: boxed 5 → 1, plain 6 → 3. ponytail: 14 layouts more at most, on views of up to 30 cards; a crossing-aware
  // placement would reach plain's last ones (search beside db)
  const fan = Object.create(null); best.edges.forEach(e => { if (!e.back) fan[e.to] = (fan[e.to] || 0) + 1; });
  if (map && dg.fan && !dg.quick && !dg.flipped && dg.nodes.length <= 30 && Object.values(fan).some(k => k >= 6)) {
    const audit = h => { const r = [], is = routeAudit(h, '', null, r), hot = r.filter((p, k) => / (cross|share a line)$/.test(is[k]) && p.some(e => fan[e.to] >= 6));
      return { hot, n: is.length }; };
    const far = { L: 'right', R: 'left', T: 'bottom', B: 'top' }, tried = new Set(), start = audit(best), g0 = [best, bestDg], lined = new Set(dg.edges.flatMap(e => [e.from, e.to]));
    let cur = start, left = 14;
    const ways = e => [['fromSide', far[e.fs]], ['toSide', far[e.ts]], ['foot', e.to]].map(([k, s]) => {
      if (k !== 'foot') return !e[k] && s && { key: e.from + '>' + e.to + k, d: { ...bestDg, edges: bestDg.edges.map(x => x.from === e.from && x.to === e.to ? { ...x, [k]: s } : x) } };
      const nodes = bestDg.nodes.map(n => ({ ...n })), me = nodes.find(n => n.id === s), col = nodes.filter(n => n !== me && n.col === me.col), rows = col.filter(n => lined.has(n.id)).map(n => n.row);
      if (!rows.length || me.row > Math.max(...rows)) return null; const r = Math.max(...rows) + 1;
      col.forEach(n => { if (!lined.has(n.id) && n.row > r - 1) n.row++; }); me.row = r; // cards with no line stay under it
      return { key: 'foot ' + s, d: { ...bestDg, nodes } }; });
    for (let more = true; more && cur.hot.length && left > 0;) { more = false;
      for (const e of [...new Set(cur.hot.flat())]) { if (more || e.back || e.fixed) continue;
        for (const w of ways(e)) { if (more || left <= 0 || !w || tried.has(w.key)) continue; tried.add(w.key); left--;
          const h = layoutGraph({ ...w.d, flipped: true }, map), a = audit(h);
          if (a.n <= cur.n && (a.hot.length < cur.hot.length || a.hot.length === cur.hot.length && a.n < cur.n)) { best = h; bestDg = w.d; cur = a; more = true; } } } }
    if (cur.n >= start.n) [best, bestDg] = g0; // kept only with fewer issues
  }
  return best;
}
function layoutPass(dg, map, room, last) { // room: { x: { col: px }, y: { row: px } } (lx, ly: a label's, past the boxes'); last: lay out with it, find no more
  const __ms = { t: performance.now() }, t0 = __ms.t, NEST = !map && !!dg.typed && !!dg.nest && !dg[PLAIN]; let used = false, turns = false, grew = false; // NEST: audit 38's ways (PLAIN); used: one of them changed the layout
  const px = x => typeof x === 'number' && x > 0 ? Math.min(x, 2000) : 0; // a gap that is no positive number is the default (audit 9)
  const CG = px(dg.gap) || (map ? (dg.mainSteps && !(Array.isArray(dg.containers) && dg.containers.length) ? 38 : 66) : CG0), RG = px(dg.rgap) || (map ? 44 : RG0); // family borders also need clearance between columns; containers: [] is no boxes (audit 38)
  const NH = dg.nodeH || 64, pitch = NH + RG;
  const C = map ? 16 : 12, STUB = dg.mainSteps ? C : C + 6, SEP = 10; // maps: 16 px clear of other nodes
  const lim = (dg.nodes || []).length + 64, cl = v => Math.max(-lim, Math.min(lim, v)); // a pin far off the grid (1e6, 1e308) is held at its edge: the column and row loops walk every index between
  const nodes = (dg.nodes || []).map((n, i) => {
    const k = kindOf(n.kind, map);
    const w = n.w || (map ? mapNodeW(n) : NW);
    return { ...n, k, col: cl(n.col ?? i), row: cl(n.row ?? 0), w, h: n.h || NH };
  });
  const byId = idTable(Object.fromEntries(nodes.map(n => [n.id, n]))); // a card named constructor is found only if drawn
  const cols = dg.abs ? [] : [...new Set(nodes.map(n => n.col))].sort((a, b) => a - b);
  const colX = {}, colW = {}; let x = 0;
  // a card with no line, in a row under every card that has one, sits in a row of its own (#46): it never widens a column
  const ends = new Set((dg.edges || []).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), low = Math.max(-Infinity, ...nodes.filter(n => ends.has(n.id)).map(n => n.row));
  if (low === -Infinity) ends.clear(); // no lines at all: no such row
  const boxed = new Set((dg.containers || []).flatMap(f => f.nodeIds || [])); // a box's row keeps to the box's columns
  nodes.forEach(n => { n.aside = map && !dg.abs && !ends.has(n.id) && n.row > low && !boxed.has(n.id); });
  cols.forEach(c => { const ns = nodes.filter(n => n.col === c && !n.aside); if (ns.length) colW[c] = Math.max(...ns.map(n => n.w)); });
  // a labelled line between neighbouring columns gets a gap wide enough for its label and 27 px of line on each side (a
  // numbered line with no label: for its step mark). A typed view's too, so lines between one pair keep their own labels (risks.md F2)
  const gapAfter = {}, colOf = Object.create(null), boxOf = id => ((dg.containers || []).filter(f => (f.nodeIds || []).includes(id)).pop() || {}).id; if ((map || dg.typed) && !dg.abs) { nodes.forEach(n => colOf[n.id] = n.col);
    // labelled lines that leave (or reach) one card side by side run 16 px apart, too close for their pills to stack,
    // so the pills sit next to each other: the gap fits them all, with 6 px between pills
    const sum = {};
    // a line to a container ends on its box's border, beside the box's nearest column of cards
    const inBox = (b, seen = new Set()) => { const c = !seen.has(b) && seen.add(b) && (dg.containers || []).find(f => f.id === b);
      return c ? [...(c.nodeIds || []), ...(dg.containers || []).filter(k => k.parent === b).flatMap(k => inBox(k.id, seen))] : []; };
    const near = (b, other) => { const cs = inBox(b).map(i => colOf[i]).filter(c => c != null); if (other == null || !cs.length) return null;
      const lo = Math.min(...cs), hi = Math.max(...cs); return other < lo ? lo : other > hi ? hi : null; };
    // a box in a box (an unfolded numbered view's lane, #82, or any nested box): a line to a card in one, or to the box that
    // holds it, crosses two borders
    const inLane = id => (dg.containers || []).some(f => f.parent && (f.parent === id || (f.nodeIds || []).includes(id)));
    (dg.edges || []).forEach(e => { const p = colOf[e.from] ?? near(e.from, colOf[e.to]), q = colOf[e.to] ?? near(e.to, colOf[e.from]); if (p == null || q == null || (!e.label && e.step == null) || Math.abs(p - q) !== 1) return;
      const c = Math.min(p, q), w = !map ? (dg.turned ? 18 : labelW(e)) : (e.label ? pillW(e.label, e.sublabel) : 0) + (e.step != null ? stepW(e.step) + (e.label ? 4 : 6) : 0), box = boxOf(e.from) !== boxOf(e.to) || !(e.from in colOf) || !(e.to in colOf) ? 48 + ([e.from, e.to].some(inLane) ? 12 : 0) : 0;
      gapAfter[c] = Math.max(gapAfter[c] || 0, w + 54 + box);
      [e.from, e.to].forEach(id => { const k = c + '|' + id, t = sum[k] ||= { w: -6, box: 0 }; t.w += w + 6; t.box = Math.max(t.box, box); gapAfter[c] = Math.max(gapAfter[c], t.w + 54 + t.box); }); }); }
  const extraX = { ...(room || {}).x }, extraY = { ...(room || {}).y }; // more room after a column (row): for lines with no route, and where a box would touch another box (below)
  // a typed view's lines from a node to itself, drawn as loops (risks.md F1): the room they take, their ports and routes (src/typed/layout.js)
  const loops = Object.create(null), LP = dg.typed && !dg.abs ? TYPED.loops(loops, dg, { byId, extraX, extraY, STUB, RG, CG, SEP, gapAfter }) : null;
  const rows = dg.typed && TYPED.rows(dg, nodes, pitch, NH, RG); // a typed view's rows (src/typed/layout.js)
  const gap = c => Math.max(CG, gapAfter[c] || 0) + (extraX[c] || 0);
  const cx = c => Number.isInteger(c) ? colX[c] : colX[Math.floor(c)] + (c % 1) * ((colW[Math.floor(c)] || NW) + gap(Math.floor(c)));
  const rowY = r => Object.keys(extraY).reduce((y, k) => +k < r ? y + extraY[k] : y, rows ? rows.at(r) : r * pitch);
  const place = () => {
    x = 0; for (let c = Math.floor(cols[0] ?? 0); c <= Math.ceil(cols[cols.length - 1] ?? 0); c++) { colX[c] = x; x += (colW[c] || NW) + gap(c); }
    nodes.forEach(n => { n.x = cx(n.col) + ((colW[n.col] || n.w) - n.w) / 2; n.y = rowY(n.row); if (map && n.k === 'm-script') { n.h = NH - 22; n.y += 11; } });
    let prev = null; // that row in column order: each card at its column, or right of the one before when that one is wider
    nodes.filter(n => n.aside).sort((a, b) => a.row - b.row || a.col - b.col).forEach(n => { if (prev && prev.row === n.row) n.x = Math.max(n.x, prev.x + prev.w + CG); prev = n; });
  };
  if (dg.abs) nodes.forEach(n => { n.x = n.ax; n.y = n.ay; if (map && n.k === 'm-script') { n.h -= 22; n.y += 11; } });
  else place();
  // Family frames enclose ordinary cards, so clicks, ports and focus keep their existing owners.
  // Children contribute their entire frame to their parent's bounds, rather than just their cards.
  // A typed view's boxes (notes/stage-2.md §3.2) take the same code as a map's: their title is the type's (`title`), and a box
  // grows to hold it; laid out turned (direction down), the 24 px header room goes left, the side that becomes the top
  const familyDefs = dg.containers || [], tagged = n => map && (n.author || n.k === 'm-ext'), TB = !map && dg.turned; // tagged: a name tag hangs under the card
  const headW = f => (map ? textW(f.label || f.id, 11) : linesW(f.title || f.label || f.id, f.head ? 12 : 11)) + 16; // a box's title, as the audit measures it (two lines: at 12 px); a broken one by its widest line (audit 24)
  const kids = new Map(), held = new Set(familyDefs.flatMap(f => f.nodeIds || [])); // a box's boxes; the cards in a box
  familyDefs.forEach(f => { kids.has(f.parent) || kids.set(f.parent, []); kids.get(f.parent).push(f); });
  // a card in a box (a port: on its owner's border) is in what it lies within; a card in none is in none, though a deep box's padding covers it
  // a box whose title the author broke (its header room grown for the lines) holds only the cards it or a box in it holds:
  // grown up over another box's card, it would otherwise take that card for its own and never move off it (audit 24). Nor
  // does any box hold a card of a box it lies in (outer): grown wider than its cards for its title, it covered that card, and no
  // rule between two boxes moves them apart (audit 41: a deployment node six deep over its parent's artifact)
  const boxesOf = new Map(), upOf = new Map(familyDefs.map(f => [f.id, f.parent])); // a card's boxes; a box's parent (a walk up, no recursion: boxes nest 3,000 deep)
  familyDefs.forEach(f => (f.nodeIds || []).forEach(id => { boxesOf.has(id) || boxesOf.set(id, []); boxesOf.get(id).push(f.id); }));
  const under = (f, id) => (boxesOf.get(id) || []).some(b => { for (let k = 0; b != null && k <= familyDefs.length; b = upOf.get(b), k++) if (b === f.id) return true; return false; });
  const outer = (f, id) => (boxesOf.get(id) || []).some(b => { for (let k = 0, x = upOf.get(f.id); x != null && k <= familyDefs.length; x = upOf.get(x), k++) if (x === b) return true; return false; }); // a card of a box f lies in
  const within = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h, owns = (f, n) => within(n, f) && (n.owner != null || under(f, n.id) || held.has(n.id) && !(f.head > 0 && brLines(f.title ?? f.label ?? f.id).length > 1) && !outer(f, n.id));
  // laid out down (TB): two or more labelled lines between one pair of a box's cards in neighbouring columns fan out across the
  // pair (TYPED.fan), each label across its own lane; the box holds those lanes and labels, so they keep inside it and off its
  // border. Narrower, the labels found no spot inside and each was set on the other line (audit 26: Mermaid's keyboard example)
  const fanPairs = new Map(); if (TB && dg.typed) (dg.edges || []).forEach(e => { const a = byId[e.from], b = byId[e.to];
    if (!a || !b || a === b || a.row !== b.row || Math.abs(a.col - b.col) !== 1) return; const k = a.col < b.col ? a.id + '\u0001' + b.id : b.id + '\u0001' + a.id;
    fanPairs.set(k, [...(fanPairs.get(k) || []), e]); });
  const fanRoom = members => { const ids = new Set(members.map(n => n.id)), out = [];
    fanPairs.forEach((list, k) => { const [i, j] = k.split('\u0001'); if (list.length < 2 || !ids.has(i) || !ids.has(j) || !list.some(e => e.label || e.step != null)) return;
      const a = byId[i], b = byId[j], bh = list.map(e => (e.label || e.step != null ? labelW(e) : 0)), span = bh.reduce((t, h, q) => t + (q ? Math.max(SEP, (bh[q - 1] + h) / 2 + 6) : 0), 0);
      const mid = (a.y + a.h / 2 + b.y + b.h / 2) / 2, half = span / 2 + Math.max(...bh) / 2 + 8;
      out.push({ x: Math.min(a.x, b.x), y: mid - half, w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: 2 * half }); });
    return out; };
  // and a card's loops (TYPED.loops), with their labels, laid out down: each runs out past the card's top, and its label across
  // that run, which the card's 36 px no longer held (audit 26: order-states laid out down)
  const loopRoom = n => { const r = LP.reach(n.id); return r && { x: n.x, y: n.y - r.top - 8, w: n.w + r.right + 8, h: n.h + r.top + 8 }; };
  // laid out across, a box's 14 px over its card and 24 px of header room hold one loop, 36 px beside the card hold two; more
  // run out through its border (audit 36): the box grows to keep each loop as far inside as one, 26 px under its top
  const loopSide = n => { const r = LP.reach(n.id); return r && { x: n.x, y: n.y - r.top + 10, w: n.w + r.right + 8, h: n.h + r.top - 10 }; };
  const framesNow = () => { const cache = Object.create(null); // a box may be named 'constructor'
    const make = (f, children) => {
      const members = (f.nodeIds || []).map(id => byId[id]).filter(Boolean);
      // laid out right, a typed box with more lines to a card outside it than the card's side holds reaches past the card's top
      // and bottom by a port for each line that goes round, below its title: each line meets the box level with where it runs,
      // none turning in the gap between them (audit 38: five transitions from a composite state of one state crossed)
      const reach = NEST && !TB && !dg.abs ? nodes.flatMap(c => { if (held.has(c.id) && under(f, c.id)) return [];
        const k = (dg.edges || []).filter(e => (e.from === f.id && e.to === c.id) || (e.to === f.id && e.from === c.id)).length, m = k - Math.max(1, Math.floor(c.h * 0.84 / 14));
        return m >= 2 && members.length ? [{ x: members[0].x, y: c.y - STUB - 16 * Math.ceil(m / 2) - 4, w: 1, h: c.h + 2 * (STUB + 16 * Math.ceil(m / 2)) + 8 }] : []; }) : [];
      if (reach.length) used = true;
      const rects = [...reach, ...members.map(n => TB ? { x: n.x - 14, y: n.y - 36, w: n.w + 44, h: n.h + 72 } : {x:n.x - 36,y:n.y - 14,w:n.w + 72,h:n.h + 44 + (tagged(n) ? 14 : 0)}), ...(TB ? fanRoom(members) : []), ...(LP ? members.map(n => (TB ? loopRoom : loopSide)(n)).filter(Boolean) : []), ...children];
      if (!rects.length) return null;
      const p = 12, x = Math.min(...rects.map(r => r.x)) - p - (TB ? 24 : 0), y = Math.min(...rects.map(r => r.y)) - p - (TB ? 0 : 24);
      const b = {...f, x, y, w:Math.max(...rects.map(r => r.x+r.w)) + p - x, h:Math.max(...rects.map(r => r.y+r.h)) + p - y};
      // laid out down, its title runs along its top, and the ports there go right of it: the box holds a port's room for each
      // line out of it, up to four (audit 38: as wide as its title, every line through its top met it at one point, or crossed the title)
      const outs = NEST && TB ? Math.min(4, (dg.edges || []).filter(e => { const i = id => id === f.id || under(f, id); return i(e.from) !== i(e.to); }).length) : 0;
      if (!map) { const k = TB ? 'h' : 'w', was = Math.max(b[k], headW(f) + 16); b[k] = Math.max(b[k], headW(f) + 16 + (outs ? 36 + 16 * outs : 0)); if (b[k] > was) used = true; }
      return cache[f.id] = dg.typed ? TYPED.frame(b, TB) : b;
    };
    // a box's frame holds its children's: a stack, not recursion, so boxes nest to any depth; a box already on it closes a parent cycle
    const frameOf = f => { const st = [[f, 0, []]], on = new Set([f.id]); let r = cache[f.id];
      while (!r && st.length) { const t = st[st.length - 1], c = (kids.get(t[0].id) || [])[t[1]++];
        if (c) { if (cache[c.id]) t[2].push(cache[c.id]); else if (!on.has(c.id)) { on.add(c.id); st.push([c, 0, []]); } continue; }
        st.pop(); on.delete(t[0].id); const b = make(t[0], t[2]); if (!st.length) return b; if (b) st[st.length - 1][2].push(b); }
      return r; };
    const out = familyDefs.map(f => frameOf(f)).filter(Boolean);
    if (map) out.forEach(f => { // the box fits its title and its badges, which are tabs on its top border, at the right
      const tabs = [...badgesOf(f).map((b, i) => ({ text: b.text, fill: toneOf(b), badge: i, w: b.text.length * 6.4 + 10 })), ...(f.unfolds ? [{ text: '⤡', fold: true, w: 28 }] : [])], all = tabs.reduce((a, t) => a + t.w + 4, -4); // an unfolded card's box: its ⤡ folds it (#71)
      f.w = Math.max(f.w, String(f.label || f.id).length * 6.7 + 32 + (tabs.length ? all + 8 : 0));
      let tx = f.x + f.w - 12 - all; f.tabs = tabs.map(t => { const o = { ...t, x: tx }; tx += t.w + 4; return o; }); });
    return out;
  };
  // Boxes keep apart: a column (row) gap widens wherever a box would come within 32 px of another box, or of a card outside
  // it, so their borders never touch and a line can run between them. Frames are measured again until nothing is too close.
  if (!dg.abs && familyDefs.length) for (let pass = 0, BOXGAP = 32; pass < 4; pass++) {
    const span = ns => ns.length ? { c0: Math.min(...ns.map(n => n.col)), c1: Math.max(...ns.map(n => n.col)), r0: Math.min(...ns.map(n => n.row)), r1: Math.max(...ns.map(n => n.row)) } : null;
    const fr = framesNow().map(f => ({ ...f, s: span(nodes.filter(n => owns(f, n))) })).filter(f => f.s);
    const cards = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h + (tagged(n) ? 14 : 0), s: span([n]), n }));
    const wantX = {}, wantY = {}, want = (o, k, v) => { if (v > 0) o[k] = Math.max(o[k] || 0, Math.ceil(v)); };
    const at = v => v; // the room goes after that row, a half row too: a card on row .5 leaves a box on 1.5 (a map floored it, audit 42: the room went after row 1, and a card on 1.5 moved down with the box on 2.5, 6 px into it)
    // a column's room goes after a whole column k (gap(k) reads no other), and moves a column c in (k, k + 1) by c - k of it
    // a box beside a card it has more lines to than the card's side holds: the extras go to the card's top (bottom), each up
    // (down) a track of its own between the box and the card, which 32 px holds one of (audit 37: laid out right, four
    // transitions from a composite state to the state beside it, two of them on one track)
    const tracks = (f, n) => { const k = (dg.edges || []).filter(e => (e.from === f.id && e.to === n.id) || (e.to === f.id && e.from === n.id)).length, m = k - Math.max(1, Math.floor(n.h * 0.84 / 14));
      return !TB && m >= 2 ? STUB + C + (m - 1) * SEP + 4 : 0; };
    fr.forEach((A, i) => [...fr.slice(i + 1), ...cards].forEach(B => {
      const gap = Math.max(BOXGAP, B.n ? tracks(A, B.n) : 0);
      if (within(A, B) || (B.n ? owns(A, B.n) : within(B, A)) || !hit(A, B, gap)) return;
      const a = A.s, b = B.s;
      if (a.c1 < b.c0 || b.c1 < a.c0) { const [L, R] = a.c1 < b.c0 ? [A, B] : [B, A], k = Math.floor(L.s.c1); want(wantX, k, (L.x + L.w + gap - R.x) / (Math.min(1, R.s.c0 - k) - L.s.c1 + k)); }
      else if (a.r1 < b.r0 || b.r1 < a.r0) { const [T, U] = a.r1 < b.r0 ? [A, B] : [B, A]; want(wantY, at(T.s.r1), T.y + T.h + BOXGAP - U.y); }
    }));
    // a card's loops (TYPED.loops) run up past its top and right past its right side, and the 32 px a box keeps from the card
    // does not hold the outer ones: a box above the loops keeps 8 px from them, the room a single loop has (audit 36: a second
    // loop ran inside the box above, along its border); a box right of them 32 px, a stub's room and a loop corner's (audit 37:
    // 8 px off, a line into the box took its port level with the loop's first run, its stub ended on the loop, and the router
    // took it over the box and down through its name strip)
    if (LP) nodes.forEach(n => { const r = LP.reach(n.id); if (!r) return;
      const B = { x: n.x, y: n.y - r.top, w: n.w + r.right, h: n.h + r.top, s: span([n]) };
      fr.forEach(A => { if (owns(A, n) || !hit(A, B, 32)) return; const a = A.s, b = B.s;
        if (a.c1 < b.c0 || b.c1 < a.c0) { if (b.c1 < a.c0) { const k = Math.floor(b.c1); want(wantX, k, (B.x + B.w + 32 - A.x) / (Math.min(1, a.c0 - k) - b.c1 + k)); } }
        else if (a.r1 < b.r0 && hit(A, B, 8)) want(wantY, at(a.r1), A.y + A.h + 8 - B.y); }); });
    if (!Object.keys(wantX).length && !Object.keys(wantY).length) break;
    Object.entries(wantX).forEach(([k, v]) => { extraX[k] = (extraX[k] || 0) + v; }); Object.entries(wantY).forEach(([k, v]) => { extraY[k] = (extraY[k] || 0) + v; });
    place();
  }
  // a label's room comes on top of what keeps the boxes apart
  if (room && (room.lx || room.ly)) { for (const [k, o] of [['lx', extraX], ['ly', extraY]]) Object.entries(room[k] || {}).forEach(([g, v]) => { o[g] = (o[g] || 0) + v; }); place(); }
  // decorations hanging on a node's top/bottom border (kind tab, step badge, ⤢ badge, author name tag):
  // ports keep off them, routes and labels treat the name tag as an obstacle
  if (map) nodes.forEach(n => {
    n.decoT = []; n.decoB = [];
    let tx = n.x + 12; mapTabs(n).forEach(t => { n.decoT.push([tx - 6, t.w + 12]); tx += t.w + 4; });
    if (n.step) n.decoT.push([n.x - 10, 24]);
    if (n.kids || n.opens) n.decoT.push([n.x + n.w - 46, 40]);
    if (n.author || n.k === 'm-ext') {
      const A = (dg.authors || {})[n.author] || {}, max = n.w - 40;
      let t = n.author ? '@' + n.author : 'unknown';
      while (t.length > 4 && sansW(t, 10, .92) + 42 > max) t = [...t].slice(0, -2).join('') + '…'; // whole characters: never half an emoji
      const w = Math.ceil(sansW(t, 10, .92) + 42);
      n.tag = { x: n.x + n.w - 12 - w, y: n.y + n.h - 9, w, h: 22, text: t, img: A.avatar || '', name: A.name || '' };
      n.decoB.push([n.tag.x - 2, n.tag.w + 4]);
    }
  });
  // an author's name tag only: a typed card's tag is its text ("[Container]"), and its NaN box sorted the grid's lines out of order,
  // so the router's binary search marked no card in the way and lines ran through cards (bookshop-c4's order queue)
  const tagRects = nodes.filter(n => n.tag?.w).map(n => ({ x: n.tag.x - 2, y: n.tag.y - 2, w: n.tag.w + 4, h: n.tag.h + 6 }));
  const families = framesNow();
  families.forEach(f => (f.tabs || []).forEach(t => tagRects.push({ x: t.x - 2, y: f.y - 10, w: t.w + 4, h: 19 }))); // lines and labels keep off a box's tabs
  // intake sources: brand badges stacked left of the node they feed, each with its own short feeds line
  const intake = map ? (dg.intake || []).filter(b => byId[b.to]).map((b, i, all) => {
    const n = byId[b.to], mine = all.filter(o => o.to === b.to), k = mine.indexOf(b), off = k - (mine.length - 1) / 2;
    const cx = n.x - 72, cy = n.y + n.h / 2 + off * 34, py = n.y + n.h / 2 + off * Math.min(16, (n.h - 20) / Math.max(1, mine.length - 1));
    const ex = n.x - 38 + Math.abs(off) * 6; // nested elbows: an outer badge turns nearer the card, so lines never cross
    return { ...b, cx, cy, r: 14, pts: simplify([[cx + 15, cy], [ex, cy], [ex, py], [n.x, py]]) };
  }) : [];
  intake.forEach(b => tagRects.push({ x: b.cx - b.r - 4, y: b.cy - b.r - 4, w: 2 * b.r + 8, h: 2 * b.r + 8 }));
  /* ---- routing: one orthogonal route per edge, no shared trunks ----
     Ported in approach from archify's router (MIT): renderers/shared/route-quality.mjs
     shortestOrthogonalGridRoute + renderers/architecture/routing.mjs. Each edge gets its own
     port, spread along the node side in the order its far end lies; then a sparse orthogonal
     visibility grid (node edges ± clearance, endpoint stubs, gap centre lines, earlier routes
     ± separation) is searched with Dijkstra, carrying the incoming direction so turns cost a
     bend penalty. Earlier routes may never be overlapped and are crossed only when no clean
     route exists; earlier labels are obstacles, so later routes keep clear of them. */
  // an end may be a container: the line ends on its box's border, whose title the ports keep clear of (not a box and
  // something inside it: that has no line, but a typed view's inner line)
  const headOf = f => Math.min((TB ? f.h : f.w) - 16, headW(f)); // the length of a box's title along its header
  const boxEnd = Object.fromEntries(families.map(f => [f.id, { id: f.id, label: f.label || f.id, box: true, x: f.x, y: f.y, w: f.w, h: f.h, hd: TB ? headOf(f) : 0,
    decoT: TB ? [] : [[f.x + 8, headOf(f)], ...(f.tabs || []).map(t => [t.x - 6, t.w + 12])], decoB: [] }]));
  const endOf = Object.assign(Object.create(null), boxEnd, byId), end = id => endOf[id], holds = (b, n) => b.box && n !== b && n.x >= b.x && n.y >= b.y && n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h;
  // a line between a box and something inside it is no line: inside by what the box holds (its cards, its boxes and theirs), not by
  // where it lies, as viewEdges decides it for a map; a box grown over a card it does not hold dropped that card's line to the box
  // (audit 41: the integration fixture's system view, pricing with no pin). A port, on its owner's border, by where it lies, as before
  const famIn = (b, x) => { for (let k = 0, y = upOf.get(x); y != null && k <= familyDefs.length; y = upOf.get(y), k++) if (y === b) return true; return false; };
  const joins = (b, n) => b.box && n !== b && (n.box ? famIn(b.id, n.id) : n.owner != null ? holds(b, n) : under(b, n.id));
  const edges = (dg.edges || []).filter(e => { const s = end(e.from), t = end(e.to); if (!s || !t || (e.from === e.to && !loops[e.from])) return false;
    if (!(LP && e[e.inner + 'Port'] != null) && (joins(s, t) || joins(t, s))) { warn(`no line for edge ${e.id ?? e.from + '->' + e.to}: it joins the box "${(joins(s, t) ? s : t).id}" and something inside it`); return false; }
    return true; }).map(e => ({ ...e, s: end(e.from), t: end(e.to) }));
  const segsOf = pts => pts.slice(0, -1).map((a, i) => [a, pts[i + 1]]);
  const segHitsRect = (a, b, r) => { const x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]); return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h; };
  const through = (pts, e, m = 2) => nodes.find(n => n !== e.s && n !== e.t && segsOf(pts).some(([a, b]) => segHitsRect(a, b, { x: n.x + m, y: n.y + m, w: n.w - 2 * m, h: n.h - 2 * m }))); // a card it does not join (m: how far in it may run; less than 0, how far off it keeps)
  // fixed edges arrive with their route already drawn (the hub comb); the router works around them
  // a loop back out of a family runs under the frames: out the source's right side, down past every frame and card it
  // would cut through, left along the bottom, and up the gap right of its target into its near side, the lowest port
  // there (issue 128); where that would cut through a card, up into the target's bottom, as before. Loops into one target
  // nest: the outer comes up nearer the card, into the lower port.
  const inFam = n => families.filter(f => n.x >= f.x && n.x + n.w <= f.x + f.w && n.y >= f.y && n.y + n.h <= f.y + f.h);
  const unders = edges.filter(e => map && e.back && !e.fixed && (inFam(e.s).length || inFam(e.t).length));
  unders.forEach((e, k) => {
    // the source's other outgoing wires keep its middle port; the loop leaves lower down
    const { s, t } = e, sy = s.y + s.h / 2 + (edges.some(o => o !== e && o.from === s.id && !o.back) ? s.h / 4 : 0);
    const xr = Math.max(s.x + s.w + 22, ...inFam(s).map(f => f.x + f.w + 14)) + k * 10;
    const tx = t.tag ? Math.max(t.x + 12, (t.x + t.tag.x - 2) / 2) : t.x + t.w / 2, ty = t.y + t.h + (t.kids || t.opens ? 8 : 0);
    const xn = t.x + t.w + 16 + 10 * unders.slice(k + 1).filter(o => o.t === t).length, near = xn < xr;
    const span = nodes.filter(n => n.x < xr && n.x + n.w > (near ? xn : tx)), yb = Math.max(...[...inFam(s), ...inFam(t)].map(f => f.y + f.h), ...span.map(n => n.y + n.h + (n.tag ? 22 : 8))) + 24 + k * 10;
    const pts = [[s.x + s.w, sy], [xr, sy], [xr, yb]], up = [[xn, yb], [xn, t.y + t.h / 2], [t.x + t.w, t.y + t.h / 2]], bottom = [[tx, yb], [tx, ty]];
    if (near && !through([...pts, ...up], e)) { e.fixed = [...pts, ...up]; e.under = k + 1; }
    else if (!through([...pts, ...bottom], e)) { e.fixed = [...pts, ...bottom]; e.under = true; } // one that would cut through a card is left to the router
  });
  if (LP) LP.mark(edges);
  const free = edges.filter(e => !e.fixed);
  edges.filter(e => e.fixed && !e[OWN_ROUTE]).forEach(e => { e.pts = e.fixed; e.p1 = e.pts[0]; e.p2 = e.pts[e.pts.length - 1]; e.fs = 'R'; e.ts = e.under > 0 ? 'R' : e.under ? 'B' : 'L'; e.stubs = []; e.how = e.under ? 'under' : 'comb'; });
  const sides = {};
  const pushSide = (n, side, e, other) => ((sides[n.id + '|' + side] ||= []).push({ e, other, n }));
  free.forEach(e => {
    const { s, t } = e, sc = s.x + s.w / 2, tc = t.x + t.w / 2, sy = s.y + s.h / 2, ty = t.y + t.h / 2;
    const gapX = tc > sc ? t.x - (s.x + s.w) : s.x - (t.x + t.w), gapY = ty >= sy ? t.y - (s.y + s.h) : s.y - (t.y + t.h);
    if (s.box || t.box ? gapX >= gapY : gapX > 24) { e.fs = tc > sc ? 'R' : 'L'; e.ts = tc > sc ? 'L' : 'R'; } // a box: the sides facing across the wider gap
    else { e.fs = ty >= sy ? 'B' : 'T'; e.ts = ty >= sy ? 'T' : 'B'; }
    if (EDGE_SIDE[e.fromSide]) e.fs = EDGE_SIDE[e.fromSide]; if (EDGE_SIDE[e.toSide]) e.ts = EDGE_SIDE[e.toSide];
  });
  // a side holds only as many ports as fit 14px apart; the steepest extras move to the top/bottom side
  const sideSpan = (n, side) => { // longest stretch of a top/bottom border free of decorations
    const decos = side === 'T' ? n.decoT : side === 'B' ? n.decoB : null;
    if (!decos || !decos.length) return null;
    let spans = [[n.x + 8, n.x + n.w - 8]];
    decos.forEach(([dx, dw]) => { spans = spans.flatMap(([a, b]) => { const c = dx - 8, d = dx + dw + 8; if (d <= a || c >= b) return [[a, b]]; return [[a, c], [d, b]].filter(([p, q]) => q - p > 0); }); });
    const best = spans.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    return best && best[1] - best[0] >= 24 ? best : null;
  };
  const PORT = 14, cap = (n, side) => { const sp = sideSpan(n, side); return Math.max(1, Math.floor(((side === 'L' || side === 'R') ? n.h : sp ? sp[1] - sp[0] : n.w) * 0.84 / PORT)); };
  // a card's loops (TYPED.loops) take the room over its top and right of it: the bottom (top) of another card that faces that
  // room takes no extra line, whose stub would end on a loop (audit 37: laid out right, a line moved to the bottom of the card
  // over a card with a loop ran along the loop's last run); a card's own top holds its lines left of its loop's port
  const loopRooms = LP ? nodes.map(m => { const r = LP.reach(m.id); return r && { m, x: m.x + m.w / 2 - SEP, y: m.y - r.top - SEP, w: m.w / 2 + r.right + 2 * SEP, h: r.top + SEP }; }).filter(Boolean) : [];
  const facesLoop = (n, side) => loopRooms.some(r => r.m !== n && hit(r, side === 'T' ? { x: n.x, y: n.y - STUB, w: n.w, h: STUB } : { x: n.x, y: n.y + n.h, w: n.w, h: STUB }));
  for (let pass = 0; pass < 2; pass++) nodes.forEach(n => {
    ['R', 'L'].forEach(side => {
      const mine = free.filter(e => (e.s === n && e.fs === side) || (e.t === n && e.ts === side));
      const over = mine.length - cap(n, side); if (over <= 0) return;
      const far = e => { const o = e.s === n ? e.t : e.s; return (o.y + o.h / 2) - (n.y + n.h / 2); };
      // lines to a box level with the card (NEST: or to a card on its row) take its top and bottom by turns: on one side, two of them leave the box's side one
      // above the other and turn the same way, and the lower one's track ran up through the upper one's stub end (audit 37: laid
      // out right, four transitions from a composite state to the state beside it, two of them on one track; audit 38: seven
      // between two states, all moved went under the card, where the row below left one track)
      const oth = e => e.s === n ? e.t : e.s, level = o => (!TB || NEST) && o.box && o.y < n.y && o.y + o.h > n.y + n.h, turn = new Map();
      const moved = mine.sort((a, b) => Math.abs(far(b)) - Math.abs(far(a))).filter(e => !facesLoop(n, far(e) < 0 ? 'T' : 'B')).slice(0, over);
      moved.forEach(e => {
        const o = oth(e), k = turn.get(o) || 0, all = mine.every(d => oth(d) === o), two = !!(level(o) || NEST && !o.box && Math.abs(far(e)) < 1) && (all || NEST && !dg[TURNS] && (TB || !!level(o)) && moved.filter(d => oth(d) === o).length > 1) && moved.length > 1; turn.set(o, k + 1); if (two && (TB || !level(o))) used = true; if (two && !all) turns = true;
        const ns = (far(e) < 0) !== (two && k % 2 === 1) ? 'T' : 'B';
        if (e.s === n) e.fs = ns; else e.ts = ns;
      });
    });
  });
  free.forEach(e => { pushSide(e.s, e.fs, e, e.t); pushSide(e.t, e.ts, e, e.s); });
  edges.filter(e => e.under > 0).forEach(e => pushSide(e.t, 'R', e, e.s)); // a loop under the boxes takes its port with the side's other lines
  if (LP) LP.ports(pushSide, sides);
  const portAt = (it, side, p) => { if (it.n === it.e.s && it.e.fs === side) it.e.p1 = p; else it.e.p2 = p; };
  Object.entries(sides).sort(([, a], [, b]) => !!a[0].n.box - !!b[0].n.box).forEach(([key, list]) => { // cards first: a box's port lines up with them
    const side = key.split('|').pop(), vertical = side === 'L' || side === 'R';
    const n = list[0].n;
    if (n.box) { // each port in line with its line's other end where the border allows (a straight line): below the title on
      // a side, off the title, tabs and corners on top or bottom; in that order, 16 (26) px apart
      const want = it => { const q = it.e.s === n ? it.e.p2 : it.e.p1, o = it.other; return q ? q[vertical ? 1 : 0] : vertical ? o.y + o.h / 2 : o.x + o.w / 2; };
      // (turned: the title runs down the left side, and the sides across the header room are the top and bottom)
      const across = TB ? !vertical : vertical, a0 = vertical ? n.y : n.x, len = vertical ? n.h : n.w;
      const sp = across ? [a0 + 40, a0 + len - 16] : TB ? [side === 'L' ? n.y + n.hd + 16 : n.y, n.y + n.h] : sideSpan(n, side) || [n.x, n.x + n.w];
      let lo = across ? sp[0] : Math.max(sp[0], a0 + 20), hi = across ? sp[1] : Math.min(sp[1], a0 + len - 20); if (hi < lo) lo = hi = (lo + hi) / 2;
      // a typed view's span too short for its lines (a title that fills the side, audit 44: laid out down, two paths into an
      // execution environment's top met at one point) grows over the title until its ports lie PORT apart; layoutTyped lays the
      // view out without that too and keeps the one check() has less to say of (a dense view's other lines took worse ways)
      let gap = Math.min(vertical ? 16 : 26, (hi - lo) * 0.84 / list.length);
      if (dg.typed && !dg[SPAN] && list.length > 1 && gap < PORT) { grew = true; const need = (list.length - 1) * PORT, f0 = a0 + 20, f1 = a0 + len - 20;
        lo = Math.max(Math.min(f0, lo), Math.min(lo, hi - need)); if (hi - lo < need) hi = Math.max(hi, Math.min(f1, lo + need)); gap = Math.min(PORT, (hi - lo) / (list.length - 1)); }
      const ws = list.map(want), order = list.map((_, i) => i).sort((a, b) => ws[a] - ws[b]);
      const v = order.map(i => Math.min(hi, Math.max(lo, ws[i])));
      for (let k = 1; k < v.length; k++) v[k] = Math.max(v[k], v[k - 1] + gap);
      for (let k = v.length - 1; k >= 0; k--) v[k] = Math.min(v[k], k === v.length - 1 ? hi : v[k + 1] - gap);
      order.forEach((i, k) => portAt(list[i], side, vertical ? [side === 'R' ? n.x + n.w : n.x, v[k]] : [v[k], side === 'T' ? n.y : n.y + n.h]));
      return;
    }
    // order ports by where the far end lies, so neighbouring routes do not cross at the node: on a left or right side by its
    // y; on a top or bottom side by its angle from the side, swept from the side's left end (#49). By x, then a y tie-break
    // in one direction, cards in one column on the left of a bottom side came in the wrong order, and their lines crossed.
    const mx = n.x + n.w / 2, my = n.y + n.h / 2, turn = it => { let a = Math.atan2(it.other.y + it.other.h / 2 - my, it.other.x + it.other.w / 2 - mx) - (side === 'T' ? -Math.PI / 2 : Math.PI / 2);
      while (a <= -Math.PI) a += 2 * Math.PI; while (a > Math.PI) a -= 2 * Math.PI; return side === 'T' ? a : -a; };
    // Far ends level with each other go by the angle they come in at, as on a top or bottom side: of two above the card, the
    // nearer takes the higher port, since the farther one's line passes under it (b10/overview's Reports 7 took the port
    // under Billing 1's, whose line ran below Reports, and had no way in but round the map)
    const lean = it => Math.atan2(it.other.y + it.other.h / 2 - my, Math.abs(it.other.x + it.other.w / 2 - mx));
    list.sort((a, b) => vertical ? ((a.e.under || 0) - (b.e.under || 0)) || (a.other.y - b.other.y) || (lean(a) - lean(b)) || ((side === 'R' ? -1 : 1) * (a.other.x - b.other.x)) : turn(a) - turn(b));
    const sp = vertical ? null : sideSpan(n, side);
    const len = vertical ? n.h : sp ? sp[1] - sp[0] : n.w, mid = sp ? (sp[0] + sp[1]) / 2 : n.x + n.w / 2;
    const gap = Math.min(vertical ? 16 : 26, (len * 0.84) / Math.max(1, list.length)), cy = n.y + n.h / 2;
    list.forEach((it, i) => {
      const off = (i - (list.length - 1) / 2) * gap;
      const p = side === 'R' ? [n.x + n.w, cy + off] : side === 'L' ? [n.x, cy + off]
        : side === 'T' ? [mid + off, n.y] : [mid + off, n.y + n.h];
      portAt(it, side, p);
    });
  });
  // a typed view's lines between one pair take their ports so that they nest (audit 38: laid out right, five transitions from a
  // composite state to the state beside it, two of them crossed and one ran on another): walked round each end clockwise from
  // the side away from the other, the lines meet one end in the order they meet the other in reverse, as strands between two
  // discs do. Each line keeps its port on the pair's first end; the other end's ports go round among them
  if (NEST && !dg.abs) { const pairsOf = new Map();
    free.forEach(e => { if (e.s === e.t || e.inner || e.fromPort != null || e.toPort != null || !e.p1 || !e.p2) return; const k = e.s.id < e.t.id ? e.s.id + '\u0001' + e.t.id : e.t.id + '\u0001' + e.s.id; pairsOf.set(k, [...(pairsOf.get(k) || []), e]); });
    const TAU = 2 * Math.PI, param = (m, o, p) => { const cx = m.x + m.w / 2, cy = m.y + m.h / 2, a = Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(cy - o.y - o.h / 2, cx - o.x - o.w / 2); return ((a % TAU) + TAU) % TAU; };
    const at = (e, m) => e.s === m ? ['p1', 'fs'] : ['p2', 'ts'];
    pairsOf.forEach(list => { if (list.length < 2) return; const n = list[0].s, o = list[0].t;
      const byN = [...list].sort((a, b) => param(n, o, a[at(a, n)[0]]) - param(n, o, b[at(b, n)[0]]));
      const O = list.map(e => { const [k, sk] = at(e, o); return [e[k], e[sk]]; }).sort((a, b) => param(o, n, b[0]) - param(o, n, a[0]));
      byN.forEach((e, i) => { const [k, sk] = at(e, o); if (e[k] !== O[i][0]) used = true; [e[k], e[sk]] = O[i]; });
      // a box beside a card, laid out right, with every line of the pair on its side that faces the card: each line meets the box
      // level with where it runs, so none turns in the gap between them. One into the card's side runs straight; one into its
      // top (bottom) runs over (under) the card and turns down (up) into it, the line into the port nearest the box lowest
      // (highest), each a track apart. The gap held a track for each of them, and five crossed or ran on one another (audit 38)
      const B = n.box ? n : o.box ? o : null, Cd = B === n ? o : n; if (!B || Cd.box || TB) return;
      const bs = Cd.x > B.x + B.w ? 'R' : Cd.x + Cd.w < B.x ? 'L' : null; if (!bs || list.some(e => at(e, B)[1] && e[at(e, B)[1]] !== bs)) return;
      const cs = bs === 'R' ? 'L' : 'R', near = p => Math.abs(p[0] - (bs === 'R' ? B.x + B.w : B.x)), ys = new Map();
      list.filter(e => e[at(e, Cd)[1]] === cs).forEach(e => ys.set(e, e[at(e, Cd)[0]][1]));
      for (const [side, sg] of [['T', -1], ['B', 1]]) list.filter(e => e[at(e, Cd)[1]] === side).sort((a, b) => near(a[at(a, Cd)[0]]) - near(b[at(b, Cd)[0]]))
        .forEach((e, i) => ys.set(e, (side === 'T' ? Cd.y : Cd.y + Cd.h) + sg * (STUB + (i + 1) * 16)));
      const lo = B.y + 40, hi = B.y + B.h - 16, mine = new Set(list);
      // a box too short for them: the lines over (under) the card come down (up) to where it starts (ends), in turn
      for (const [side, sg] of [['T', 1], ['B', -1]]) { const g = list.filter(e => e[at(e, Cd)[1]] === side), v = g.map(e => ys.get(e)), d = sg > 0 ? lo - Math.min(...v) : hi - Math.max(...v);
        if (g.length && d * sg > 0) g.forEach(e => ys.set(e, ys.get(e) + d)); }
      const others = (sides[B.id + '|' + bs] || []).filter(it => !mine.has(it.e)).map(it => (it.e.s === B ? it.e.p1 : it.e.p2)[1]);
      const all = [...ys.values()].sort((a, b) => a - b);
      if (ys.size !== list.length || all[0] < lo || all.at(-1) > hi || all.some((y, i) => i && y - all[i - 1] < PORT) || others.some(y => all.some(v => Math.abs(v - y) < PORT))) return;
      list.forEach(e => { const k = at(e, B)[0]; if (e[k][1] !== ys.get(e)) used = true; e[k] = [e[k][0], ys.get(e)]; });
    });
  }
  edges.filter(e => e.under > 0).forEach(e => { const P = e.fixed; e.pts = e.fixed = [...P.slice(0, 4), [P[3][0], e.p2[1]], e.p2]; });
  const corners = LP ? LP.route() : []; // a loop's corners: obstacles to the other routes
  // and each box's title, which the router keeps clear of (audit 25: a fanned line ran up through a boundary's title)
  const headRect = f => { const t = 22 + (!map && f.head || 0); return TB ? { x: f.x + 3, y: f.y + 8, w: t, h: headOf(f) } : { x: f.x + 8, y: f.y + 3, w: headOf(f), h: t }; };
  if (dg.typed && dg.turned && TYPED.fan(free, { simplify, through, STUB, SEP, families, heads: families.map(headRect), nest: NEST })) used = true; // a view laid out down: lines between one pair fan out (src/typed/layout.js)
  const BEND = map ? 60 : 26, CROSS = 900; // maps: few bends
  const OUT = { R: [1, 0], L: [-1, 0], T: [0, -1], B: [0, 1] };
  const nodeRects = nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  const gapLinesX = [], gapLinesY = [];
  if (dg.abs) {
    (dg.lanes || []).forEach(l => gapLinesX.push(l.x - (dg.laneGap || 32) / 2, l.x + 8, l.x + l.w - 8, l.x + l.w + (dg.laneGap || 32) / 2));
    nodes.forEach(n => gapLinesY.push(n.y - RG / 2, n.y + n.h + RG / 2));
  } else {
    Object.keys(colX).map(Number).forEach(c => gapLinesX.push(colX[c] - CG / 2, colX[c] + (colW[c] || NW) + CG / 2));
    [...new Set(nodes.map(n => n.y))].forEach(y => gapLinesY.push(y - RG / 2, y + (rows ? rows.ht(nodes.find(n => n.y === y).row) : NH) + RG / 2));
  }
  const routed = [], reserved = [];
  const inRect = (p, r) => p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h;
  const colinear = (a, b, c, d) => {
    if (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < SEP - 1) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 0;
    if (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < SEP - 1) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 0;
    return false;
  };
  const crosses = (p, q, r, s) => { // perpendicular interior crossing
    const pv = p[0] === q[0], rv = r[0] === s[0]; if (pv === rv) return false;
    const [v, hz] = pv ? [[p, q], [r, s]] : [[r, s], [p, q]];
    return hz[0][1] > Math.min(v[0][1], v[1][1]) && hz[0][1] < Math.max(v[0][1], v[1][1]) && v[0][0] > Math.min(hz[0][0], hz[1][0]) && v[0][0] < Math.max(hz[0][0], hz[1][0]); };
  const onSegInterior = (p, a, b) => (a[0] === b[0] && Math.abs(p[0] - a[0]) < 0.5 && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1]))
    || (a[1] === b[1] && Math.abs(p[1] - a[1]) < 0.5 && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]));
  let shut = false; // gridRoute shuts each box that holds neither end of its line (NEST's box pass)
  let headOn = false, sidedIn = false; // headOn: in head on whatever the side costs; sidedIn: a search took the way in from the side, head on costing more (audit 60's rule)
  // the work the last resort (a search that may cross or run along lines) may spend in this pass, in cells built and visited
  // (audit 55: 150 lines into one card's side, too many for its tracks, each fell to the last resort, whose grid holds every
  // line before it and whose search, its crossings dear, visits all of it: 30 s). Past it, the last resort keeps off cards,
  // tags and labels but not other lines, whose grid is small and whose search goes nearly straight to its end.
  // ponytail: 4e6 is some six times what the largest test model spends (requirement-stress: 0.66e6)
  let anyWork = 0; const ANY_WORK = 4e6;
  // a search near its ends (win) that fails for its start or end being shut in, where the grid near them is the whole grid's,
  // fails the same on the whole grid: wide() then skips that search, whose grid of the whole view was most of the time a view
  // of many lines into one card spent (audit 55). sealed: the last search so failed (as bare, or not)
  let sealed = null;
  const wide = (e, allowCross, spare) => gridRoute(e, allowCross, 320, spare)
    || (sealed !== null && sealed === (allowCross >= 2 && anyWork > ANY_WORK) ? null : gridRoute(e, allowCross, 0, spare));
  function gridRoute(e, allowCross, win, spare, soft) {
    sealed = null;
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB];
    const en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    // ends that face each other closer than two stubs (a card 32 px beside a box) leave the grid no room: the plain
    // elbow between them is the route, when it keeps off cards and tags and does not run along or across another line
    if (OUT[e.fs][0] === -OUT[e.ts][0] && OUT[e.fs][1] === -OUT[e.ts][1] && (en[0] - st[0]) * OUT[e.fs][0] + (en[1] - st[1]) * OUT[e.fs][1] < 0) {
      const lines = routed.flatMap(r => segsOf(r.pts)), clear = (p, ls) => segsOf(p).every(([a, b]) => ![...nodeRects, ...tagRects].some(r => segHitsRect(a, b, r)) && !ls.some(([c, d]) => colinear(a, b, c, d) || (!allowCross && crosses(a, b, c, d))));
      // nor along the stub of a line not yet routed: its turn half way across ran along the stub of another line into the box's
      // end beside its own, and the two joined there (audit 39); so the turn moves 5 px at a time toward either end until it is clear
      const stubs = free.filter(o => o !== e && !routed.includes(o)).flatMap(o => o.stubs || []), ax = OUT[e.fs][0] ? 0 : 1, half = Math.abs(e.p2[ax] - e.p1[ax]) / 2;
      for (let d = 0; d < half - 4; d = d > 0 ? -d : 5 - d) { const p = fallback(e, d); if (clear(p, [...lines, ...stubs])) return p; }
      const p = fallback(e); if (clear(p, lines)) return p;
    }
    const W = win ? { x: Math.min(st[0], en[0]) - win, y: Math.min(st[1], en[1]) - win, x2: Math.max(st[0], en[0]) + win, y2: Math.max(st[1], en[1]) + win } : null;
    const any = allowCross >= 2, bare = any && anyWork > ANY_WORK; // the last resort: only cards and tags stand in the way; crossing or running along a line, or a label, costs
    // past it (3, a typed view's line that would else run through a card, audit 21): a loop's corners cost as a crossing, and the
    // line may run round its own end
    // the name strip of a box the line enters (one that holds one of its ends itself, and not the other), shut to the last resort;
    // (NEST) and of a box that holds neither end (audit 39: a transition from a state over a composite to the state under it ran
    // in through the composite's title)
    const loose = allowCross === 3, heads = any && !loose && !soft && families.length ? families.filter(f => ((f.nodeIds || []).includes(e.s.id) !== (f.nodeIds || []).includes(e.t.id) && holds(boxEnd[f.id], e.s) !== holds(boxEnd[f.id], e.t)) || (NEST && !holds(boxEnd[f.id], e.s) && !holds(boxEnd[f.id], e.t))).map(headRect) : [], hard = heads.length > 0;
    const obs = [...nodeRects.map(r => ({ x: r.x - C, y: r.y - C, w: r.w + 2 * C, h: r.h + 2 * C })), ...tagRects, ...(loose ? [] : corners), ...heads, ...(any ? [] : reserved.map(r => ({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 })))];
    // a typed view's line out of a box to something outside it keeps out of that box once it has left it: the box's inside is
    // shut to it, as a card is, though its border makes no grid line (audit 27: a dependency out of an open package turned back
    // in, ran down inside it and crossed its border again)
    // (shut, the box pass below) and a box that holds neither end, as a card is
    const own = dg.typed && !loose && !e.inner ? [...[[e.s, e.t], [e.t, e.s]].filter(([b, o]) => b.box && !holds(b, o)).map(([b]) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      ...(shut ? families.filter(f => !holds(boxEnd[f.id], e.s) && !holds(boxEnd[f.id], e.t)).map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h })) : [])] : [];
    const avoid = bare ? [] : [...routed.flatMap(r => segsOf(r.pts)), ...free.filter(o => o !== e && !routed.includes(o)).flatMap(o => o.stubs || [])];
    const xs = new Set([st[0], en[0], ...gapLinesX]), ys = new Set([st[1], en[1], ...gapLinesY]);
    obs.forEach(r => { xs.add(r.x - 1); xs.add(r.x + r.w + 1); ys.add(r.y - 1); ys.add(r.y + r.h + 1); });
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) { xs.add(a[0]); xs.add(a[0] - SEP); xs.add(a[0] + SEP); } else { ys.add(a[1]); ys.add(a[1] - SEP); ys.add(a[1] + SEP); } });
    const keep = new Set([st[0], en[0], st[1], en[1]]);
    avoid.forEach(([a, b]) => { if (a[0] === b[0]) keep.add(a[0]); else keep.add(a[1]); }); // a route's own line is never merged away
    const co = vals => { const s = Float64Array.from(vals).sort(), o = []; for (let i = 0; i < s.length; i++) if (i === 0 || keep.has(s[i]) || s[i] - s[i - 1] >= 5) o.push(s[i]); return o; };
    families.forEach(f => { xs.add(f.x - 16); xs.add(f.x + f.w + 16); ys.add(f.y - 16); ys.add(f.y + f.h + 16); });
    let X = co([...xs]), Y = co([...ys]);
    if (families.length) { const far = (v, bs) => keep.has(v) || bs.every(u => Math.abs(v - u) >= 8);
      const fx = families.flatMap(f => [f.x, f.x + f.w]), fy = families.flatMap(f => [f.y, f.y + f.h]); X = X.filter(v => far(v, fx)); Y = Y.filter(v => far(v, fy)); } // once, not per line
    const XF = X, YF = Y; // the whole grid's lines, which the window's are among
    if (W) { X = X.filter(v => keep.has(v) || (v >= W.x && v <= W.x2)); Y = Y.filter(v => keep.has(v) || (v >= W.y && v <= W.y2)); }
    const nx = X.length, ny = Y.length, N = nx * ny; if (any && !bare) anyWork += N;
    // an end that lies in an obstacle (or, without crossings, on an earlier line) fails the search: say so before building the grid
    const blockedAt = p => obs.some(r => inRect(p, r)) || (!allowCross && avoid.some(([a, b]) => onSegInterior(p, a, b)));
    if (blockedAt(st) || blockedAt(en)) { if (!soft) sealed = bare; return null; }
    // the grid on lines X and Y: which cells are open, which moves are shut, and which cost a crossing or a run along a line
    const grid = (X, Y) => { const nx = X.length, ny = Y.length, N = nx * ny;
      const P = grPool(N), U = (k, v = 0) => P.u8[k].subarray(0, N).fill(v);
      // a cell is open (ok) until an obstacle covers it, or an earlier line runs through it and the route may not cross; one an
      // earlier line runs through costs a crossing (crossAt, read only on an open cell)
      const ok = U(0, 1), crossAt = U(1);
      // each obstacle and earlier line marks only the cells and moves near it (found by binary search, then tested
      // exactly as inRect, segHitsRect, onSegInterior and colinear do); every cell testing every obstacle and line
      // made one route cost O(cells x obstacles)
      const from = (A, v) => { let a = 0, b = A.length; while (a < b) { const m = (a + b) >> 1; if (A[m] < v) a = m + 1; else b = m; } return a; };
      const blockH = U(2), blockV = U(3), alongH = any ? U(4) : blockH, alongV = any ? U(5) : blockV;
      for (const r of [...obs, ...own]) {
        const i0 = from(X, r.x - 1), j0 = from(Y, r.y - 1), qx = r.x + .5, qy = r.y + .5, qx2 = qx + (r.w - 1), qy2 = qy + (r.h - 1);
        for (let i = i0; i < nx && X[i] <= r.x + r.w + 1; i++) for (let j = j0; j < ny && Y[j] <= r.y + r.h + 1; j++)
          if (X[i] > r.x && X[i] < r.x + r.w && Y[j] > r.y && Y[j] < r.y + r.h) ok[i * ny + j] = 0;
        const lx = Math.min(qx, qx2), hx = Math.max(qx, qx2), ly = Math.min(qy, qy2), hy = Math.max(qy, qy2), jl = from(Y, ly - 1);
        for (let i = Math.max(0, from(X, lx - 1) - 1); i < nx - 1 && X[i] <= hx + 1; i++) for (let j = jl; j < ny && Y[j] <= hy + 1; j++)
          if (X[i + 1] > qx && X[i] < qx2 && Y[j] > qy && Y[j] < qy2) blockH[i * ny + j] = 1;
        for (let i = from(X, lx - 1); i < nx && X[i] <= hx + 1; i++) for (let j = Math.max(0, jl - 1); j < ny - 1 && Y[j] <= hy + 1; j++)
          if (X[i] > qx && X[i] < qx2 && Y[j + 1] > qy && Y[j] < qy2) blockV[i * ny + j] = 1;
      }
      const onAv = allowCross ? crossAt : ok, onV = allowCross ? 1 : 0; // a cell on an earlier line: a crossing, or shut
      // each line marks whole runs of cells: a vertical one a run down a column, which lies in one piece in the arrays (a fill); a
      // horizontal one a run along a row, noted only at its two ends (+1 where it starts, -1 past it) and summed column by column
      // once every line is in. Cell by cell, the lines into one card's side (each beside the others and spanning the view) cost
      // O(lines x cells) a route (audit 55). The runs are the cells the tests marked: upto finds the first value past v
      const upto = (A, v) => { let a = 0, b = A.length; while (a < b) { const m = (a + b) >> 1; if (A[m] <= v) a = m + 1; else b = m; } return a; };
      let onD = null, alD = null; const D = () => { if (!P.dn || P.dn < N + ny) { P.dn = Math.max(N + ny, 2 * (P.dn || 0)); P.d1 = new Int32Array(P.dn); P.d2 = new Int32Array(P.dn); }
        onD = P.d1.subarray(0, N + ny).fill(0); alD = P.d2.subarray(0, N + ny).fill(0); };
      for (const [c, d] of avoid) {
        const x1 = Math.min(c[0], d[0]), x2 = Math.max(c[0], d[0]), y1 = Math.min(c[1], d[1]), y2 = Math.max(c[1], d[1]);
        if (c[0] === d[0]) { // vertical: cells on its interior; vertical moves alongside it
          const lo = upto(Y, y1), hi = from(Y, y2), alo = Math.max(0, lo - 1), ahi = Math.min(ny - 1, hi);
          if (lo < hi) for (let i = from(X, x1 - 1); i < nx && X[i] <= x2 + 1; i++) if (Math.abs(X[i] - c[0]) < 0.5) onAv.fill(onV, i * ny + lo, i * ny + hi);
          if (y2 > y1 && alo < ahi) for (let i = from(X, x1 - SEP - 1); i < nx && X[i] <= x2 + SEP + 1; i++) if (Math.abs(X[i] - c[0]) < SEP - 1) alongV.fill(1, i * ny + alo, i * ny + ahi);
        }
        if (c[1] === d[1]) { // horizontal: the same, across
          const lo = upto(X, x1), hi = from(X, x2), alo = Math.max(0, lo - 1), ahi = Math.min(nx - 1, hi);
          if (lo < hi) for (let j = from(Y, y1 - 1); j < ny && Y[j] <= y2 + 1; j++) if (Math.abs(Y[j] - c[1]) < 0.5) { if (!onD) D(); onD[lo * ny + j]++; onD[hi * ny + j]--; }
          if (x2 > x1 && alo < ahi) for (let j = from(Y, y1 - SEP - 1); j < ny && Y[j] <= y2 + SEP + 1; j++) if (Math.abs(Y[j] - c[1]) < SEP - 1) { if (!onD) D(); alD[alo * ny + j]++; alD[ahi * ny + j]--; }
        }
      }
      if (onD) for (let i = 0; i < nx; i++) for (let j = 0, k = i * ny; j < ny; j++, k++) { // the runs along rows, summed
        if (i) { onD[k] += onD[k - ny]; alD[k] += alD[k - ny]; } if (onD[k] > 0) onAv[k] = onV; if (alD[k] > 0) alongH[k] = 1; }
      // routed after a port swap, it keeps off the end of its partner's stub, where the partner, routed next, starts
      if (spare) for (const p of [spare.stubs[0][1], spare.stubs[1][0]]) { const i = X.indexOf(p[0]), j = Y.indexOf(p[1]); if (i >= 0 && j >= 0) { if (allowCross) crossAt[i * ny + j] = 1; else ok[i * ny + j] = 0; } }
      // a line never runs round one of its own ends: the grid behind each (past the side opposite its port) is shut to it, unless its
      // other end is there. A route with no crossing went any length, round its own card too (clinic's reminder went over the
      // patient, down its far side and under it to reach the port below the patient's other line), and port repair saw nothing
      if (!loose) for (const [n, side, far] of [[e.s, e.fs, en], [e.t, e.ts, st]]) if (!behind(n, side, far)) {
        const lr = side === 'R' || side === 'L';
        (lr ? X : Y).forEach((v, a) => { if (behind(n, side, lr ? [v, n.y] : [n.x, v])) for (let b = 0; b < (lr ? ny : nx); b++) ok[lr ? a * ny + b : b * ny + a] = 0; });
      }
      if (any) for (const r of [...reserved, ...(loose ? corners : [])]) for (let i = from(X, r.x - 3); i < nx && X[i] < r.x + r.w + 3; i++) for (let j = from(Y, r.y - 3); j < ny && Y[j] < r.y + r.h + 3; j++) crossAt[i * ny + j] = 1;
      return { nx, ny, N, P, U, ok, crossAt, blockH, blockV, alongH, alongV }; };
    const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1]; // the four moves: right, left, down, up
    // a target shut in a small pocket that does not hold the start cannot be reached: flood out from it (moves work
    // both ways) and give up at once, instead of letting the search visit every cell it can reach. 'shut' when it is so shut in;
    // 'part' when, too, a cell of the pocket lies next to a line of this grid not next to it on the whole grid (XF, YF) or at
    // this grid's edge and not the whole one's: on the whole grid the pocket may go on; '' when the target is not shut in
    const at = (A, F) => { const g = new Int32Array(A.length); for (let a = 0, b = 0; a < A.length; a++) { while (F[b] !== A[a]) b++; g[a] = b; } return g; };
    const same = (g, a, n, nf) => (a + 1 < n ? g[a + 1] === g[a] + 1 : g[a] === nf - 1) && (a ? g[a - 1] === g[a] - 1 : g[a] === 0);
    const flood = (G, X, Y, s0, t0) => { const { nx, ny, ok, blockH, blockV } = G, gx = X === XF ? null : at(X, XF), gy = gx && at(Y, YF);
      const seen = G.U(6), q = [t0]; seen[t0] = 1; let whole = true;
      const passable = (i1, j1, i2, j2) => !(i1 !== i2 ? blockH[Math.min(i1, i2) * ny + j1] : blockV[i1 * ny + Math.min(j1, j2)]);
      for (let h = 0; h < q.length && q.length < 4000; h++) { const c = q[h], i = Math.floor(c / ny), j = c % ny;
        if (c === s0) break;
        if (gx && whole && !(same(gx, i, nx, XF.length) && same(gy, j, ny, YF.length))) whole = false;
        for (let nd = 0; nd < 4; nd++) { const i2 = i + DI[nd], j2 = j + DJ[nd]; if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
          const c2 = i2 * ny + j2; if (!seen[c2] && ok[c2] && passable(i, j, i2, j2)) { seen[c2] = 1; q.push(c2); } } }
      return q.length < 4000 && (s0 < 0 || !seen[s0]) ? whole ? 'shut' : 'part' : ''; };
    // on a big grid, the pocket is first looked for on a small one round the target: when it lies the same on the whole grid
    // (and so on this one, whose lines near the target are the whole grid's), the search fails without the big grid being built
    // (audit 55: the lines into one card's side, each beside the others, shut most of them in by its port, each on a grid of
    // the whole view)
    if (N > 20000) { const lX = X.filter(v => Math.abs(v - en[0]) <= 160), lY = Y.filter(v => Math.abs(v - en[1]) <= 160), L = grid(lX, lY);
      const li = v => lX.indexOf(v), lj = v => lY.indexOf(v), t = li(en[0]) * L.ny + lj(en[1]), s = li(st[0]) < 0 || lj(st[1]) < 0 ? -1 : li(st[0]) * L.ny + lj(st[1]);
      if (!L.ok[t] || (s >= 0 && !L.ok[s]) || flood(L, lX, lY, s, t) === 'shut') { if (!soft) sealed = bare; return null; } }
    const { P, U, ok, crossAt, blockH, blockV, alongH, alongV } = grid(X, Y);
    // a run within 8 px of a box's border costs ten times its length: the grid keeps a port's track and an earlier line's however
    // near a border, and a box levelled half a row from a card (#86) puts its border right by that card's ports
    const near = families.length ? P.near.subarray(0, 2 * N).fill(0) : null, nearY = families.length && Y.map(y => families.filter(f => Math.abs(y - f.y) < 8 || Math.abs(y - f.y - f.h) < 8)), nearX = families.length && X.map(x => families.filter(f => Math.abs(x - f.x) < 8 || Math.abs(x - f.x - f.w) < 8));
    const ix = v => X.indexOf(v), iy = v => Y.indexOf(v);
    const s0 = ix(st[0]) * ny + iy(st[1]), t0 = ix(en[0]) * ny + iy(en[1]);
    if (!ok[s0] || !ok[t0]) { if (!soft) sealed = bare; return null; }
    { const f = flood({ nx, ny, ok, blockH, blockV, U }, X, Y, s0, t0); if (f) { if (!soft && (!W || f === 'shut')) sealed = bare; return null; } }
    // Dijkstra over (cell, incoming direction)
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], dist = P.dist.subarray(0, N * 4).fill(Infinity), prev = P.prev.subarray(0, N * 4).fill(-1);
    // a binary heap in typed arrays, with the same sift steps as before, so equal keys pop in the same order (each sift moves
    // a hole and writes the item once, where it stops, as the swaps it stands for would leave it)
    let hd = P.hd, hk = P.hk, hn = 0, pd = 0, pk = 0;
    const hpush = (k, d) => { if (hn === hd.length) { const d2 = new Float64Array(hn * 2), k2 = new Int32Array(hn * 2); d2.set(hd); k2.set(hk); hd = P.hd = d2; hk = P.hk = k2; P.hn = hn * 2; }
      let i = hn++; while (i) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hd[i] = hd[p]; hk[i] = hk[p]; i = p; } hd[i] = d; hk[i] = k; };
    const hpop = () => { pd = hd[0]; pk = hk[0]; hn--; if (hn) { const d = hd[hn], k = hk[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, dm = d;
      if (l < hn && hd[l] < dm) { m = l; dm = hd[l]; } if (r < hn && hd[r] < dm) m = r; if (m === i) break; hd[i] = hd[m]; hk[i] = hk[m]; i = m; } hd[i] = d; hk[i] = k; } };
    const d0 = DIRS.findIndex(d => d[0] === OUT[e.fs][0] && d[1] === OUT[e.fs][1]);
    const dEnd = DIRS.findIndex(d => d[0] === -OUT[e.ts][0] && d[1] === -OUT[e.ts][1]);
    // A*: the heap is keyed by distance plus the straight distance left, which never overestimates (every move costs
    // at least its length), so each route keeps its cost; the search stops visiting cells far from the target
    const hx = Float64Array.from(X, x => Math.abs(x - en[0])), hy = Float64Array.from(Y, y => Math.abs(y - en[1]));
    dist[s0 * 4 + d0] = 0; hpush(s0 * 4 + d0, hx[(s0 / ny) | 0] + hy[s0 % ny]);
    let best = -1;
    const nearOf = (nd, i, j, i2, j2) => (nd < 2 ? nearY[j].some(f => Math.max(X[i], X[i2]) > f.x && Math.min(X[i], X[i2]) < f.x + f.w) : nearX[i].some(f => Math.max(Y[j], Y[j2]) > f.y && Math.min(Y[j], Y[j2]) < f.y + f.h)) ? 2 : 1;
    while (hn) {
      if (any && !bare && ++anyWork > ANY_WORK) return gridRoute(e, allowCross, win, spare, soft); // past the budget: bare
      hpop(); const k = pk, cell = k >> 2, dir = k & 3, i = (cell / ny) | 0, j = cell - i * ny;
      if (pd > dist[k] + (hx[i] + hy[j])) continue;
      // (NEST) head on only for up to two bends more than the cheapest way in: a route that kept to it at any cost ran along a
      // box's border into its end (audit 38: laid out right, a transition past a two-level composite state, 3616 for 1950)
      if (NEST && best >= 0 && pd > dist[best] + 2 * BEND) { used = true; break; }
      // (a typed view with boxes) nor at the cost of a run along a box's border, which costs more than that and eight px of it:
      // the way in from the side is kept (audit 60: laid out down, a cloud service three groups deep to one outside them all, its
      // port 4 px inside the outer group's border, came in head on down that border for 42 px)
      if (!headOn && !NEST && !map && near && best >= 0 && pd > dist[best] + 2 * BEND + 80) { sidedIn = true; break; }
      const d = dist[k];
      // in head-on if it can; else the cheapest way in, the first found (it kept the last, the dearest: a top-to-top line on
      // the top row ran past its card and back, #80)
      if (cell === t0) { if (dir === dEnd) { best = k; break; } if (best < 0) best = k; continue; }
      const xi = X[i], yj = Y[j];
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === dir && ((nd >> 1) === (dir >> 1))) continue; // no reversal
        const i2 = i + DI[nd], j2 = j + DJ[nd];
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue;
        // the move's own index: a move right or left between columns i and i2 at row j; up or down between rows j and j2
        const mv = nd < 2 ? (nd === 0 ? i : i2) * ny + j : i * ny + (nd === 2 ? j : j2);
        const c2 = i2 * ny + j2; if (!ok[c2] || (nd < 2 ? blockH[mv] : blockV[mv])) continue;
        const len = nd < 2 ? Math.abs(X[i2] - xi) : Math.abs(Y[j2] - yj);
        let w = len + (nd === dir ? 0 : BEND) + (crossAt[c2] ? CROSS : 0);
        if (any && (nd < 2 ? alongH[mv] : alongV[mv])) w += 2 * CROSS + 3 * len;
        if (near) { const q = 2 * mv + (nd < 2 ? 0 : 1); // each move's answer found once a search
          if (!near[q]) near[q] = nearOf(nd, i, j, i2, j2);
          if (near[q] === 2) w += 10 * len; }
        if (c2 === t0 && nd !== dEnd) w += BEND;
        const k2 = c2 * 4 + nd; if (d + w < dist[k2]) { dist[k2] = d + w; prev[k2] = k; hpush(k2, d + w + (hx[i2] + hy[j2])); }
      }
    }
    if (best < 0) return hard ? gridRoute(e, allowCross, win, spare, true) : null;
    const cells = []; for (let k = best; k >= 0; k = prev[k]) { cells.push(k >> 2); if (k === s0 * 4 + d0) break; }
    const pts = simplify([e.p1, ...cells.reverse().map(c => [X[Math.floor(c / ny)], Y[c % ny]]), e.p2]);
    // a box's title is shut to the last resort too (audit 37: laid out right, a line into a nested card ran in through its
    // box's name strip), unless keeping out of it makes the line run on another (check()'s share a line): then it costs
    if (hard && segsOf(pts).some(([a, b]) => avoid.some(([c, d]) => a[0] === b[0] ? c[0] === d[0] && Math.abs(a[0] - c[0]) < 1 && Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 1
      : c[1] === d[1] && Math.abs(a[1] - c[1]) < 1 && Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 1))) return gridRoute(e, allowCross, win, spare, true);
    return pts;
  }
  function simplify(pts) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], a = out[out.length - 1];
      if (Math.abs(p[0] - a[0]) < .01 && Math.abs(p[1] - a[1]) < .01) continue;
      if (out.length > 1) { const b = out[out.length - 2]; if ((b[0] === a[0] && a[0] === p[0]) || (b[1] === a[1] && a[1] === p[1])) out.pop(); }
      out.push(p);
    }
    return out;
  }
  function fallback(e, d = 0) { // last resort: a plain elbow, its turn d px off half way
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    const horiz = e.fs === 'R' || e.fs === 'L', mid = (horiz ? (st[0] + en[0]) / 2 : (st[1] + en[1]) / 2) + d;
    return simplify(horiz ? [e.p1, st, [mid, st[1]], [mid, en[1]], en, e.p2] : [e.p1, st, [st[0], mid], [en[0], mid], en, e.p2]);
  }
  // labels: on the edge's own segment, in free space — never across another route, node, or label
  const placed = [];
  // every spot on e's line where a label of this text fits, best first, at pass 0 (strict), 1 (strict, but it may touch a box
  // border) or 2 (relaxed); a typed view's late tries (placeLabel) also 3 (relaxed, off box borders), 4 (strict, beside the line)
  // and 5 (relaxed, beside the line, off box borders: a long label on a short line in a box sat on its border, audit 25)
  const subOf = (e, text) => map && text && e.sublabel ? fit(e.sublabel, 9.5, e.under ? 320 : 440) : ''; // a second, smaller line under the label (#44)
  const sizeOf = (e, text, sub = subOf(e, text)) => { const two = !!(text && sub), pill = map && e.step != null;
    // a typed view's label: one line per line break, as wide as its widest, 12 px a line more (audit 22)
    const rows = map ? null : String(text ?? '').split(EDGE_BREAK);
    const w = map ? (text ? pillW(text, two && sub) : 0) + (pill ? stepW(e.step) + (text ? 4 : 6) : 0) : widest(rows, r => textW(r, 10)) + 12, hgt = map ? (two ? 32 : 20) : 18 + EDGE_LH * (rows.length - 1);
    return dg.turned ? { two, w: hgt, hgt: w } : { two, w, hgt }; }; // a view laid out down: turned, as its nodes are (stage 1 note §6)
  function* fits(e, text, pass) { const relax = pass === 2 || pass === 3 || pass === 5, sub = subOf(e, text);
    const segs = segsOf(e.pts).map((s, i) => ({ a: s[0], b: s[1], i, l: Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), h: s[0][1] === s[1][1] }));
    const order = [...segs].sort((p, q) => (q.h - p.h) * 40 + (q.l - p.l));
    // the runs of the other routed lines, as boxes (for spots) and as their ends' least and most x and y (for a box a label would
    // take), found once a call: routed does not change while it yields. Found for every spot, they made a view of 150 labelled
    // lines into one card spend seconds here (audit 55)
    let runs = null, ends = null;
    const cards = nodeRects.map(r => relax ? { x: r.x, y: r.y - 10, w: r.w, h: r.h + 10 } : { x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 }); // each card and the room its stubs take
    const lines = () => runs ||= [...routed.filter(r => r !== e).map(r => r.pts), e.pts].flatMap(P => segsOf(P).map(([p, q]) => ({ x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]) })));
    const onLine = g => { if (!ends) { const B = []; for (const r of routed) if (r !== e) for (const [a, b] of segsOf(r.pts)) B.push(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])); ends = Float64Array.from(B); }
      for (let k = 0; k < ends.length; k += 4) if (ends[k + 1] > g.x && ends[k] < g.x + g.w && ends[k + 3] > g.y && ends[k + 2] < g.y + g.h) return true; return false; }; // segHitsRect
    // the strict spots along a segment: the middle, a third and a fifth of the way, then those just clear of each card's stub room,
    // tag, label and line beside it, the middle's nearest first: where the label fits, one of them is in. The five alone missed a
    // gap 15 px wide, and the label sat on a box's border (clinic's "Queues reminders")
    const spots = (sg, w, hgt, off = 0) => { const v = sg.h ? 0 : 1, lo = sg.a[v], len = sg.b[v] - lo, half = (v ? hgt : w) / 2 + 3.5, mid = sg.a[1 - v] + off, across = (v ? w : hgt) / 2 + 3;
      const span = r => [[r.x, r.x + r.w], [r.y, r.y + r.h]], rs = [...nodeRects.map(r => ({ x: r.x - STUB - 4, y: r.y - STUB - 4, w: r.w + 2 * STUB + 8, h: r.h + 2 * STUB + 8 })), ...tagRects, ...placed, ...lines()];
      return [.5, .32, .68, .2, .8, ...rs.map(span).filter(s => s[1 - v][0] < mid + across && s[1 - v][1] > mid - across).flatMap(s => [s[v][0] - half, s[v][1] + half])
        .map(u => (u - lo) / len).filter(f => f >= 0 && f <= 1).sort((p, q) => Math.abs(p - .5) - Math.abs(q - .5))]; };
    const { two, w, hgt } = sizeOf(e, text, sub), pill = map && e.step != null;
    for (const sg of order) {
      if (!relax && sg.h && sg.l < w + 10) continue;
      if (!relax && !sg.h && sg.l < hgt + 14) continue;
      // pass 4: beside the segment, either side, as strict (a line along a box's border leaves no spot on itself)
      for (const off of (pass === 4 || pass === 5 ? [-1, 1].map(k => k * ((sg.h ? hgt : w) / 2 + 4)) : [0])) for (const f of (relax ? [.5, .32, .68, .2, .8, .1, .9, .42, .58, .26, .74, .05, .95] : spots(sg, w, hgt, off))) {
        const lx = sg.a[0] + (sg.b[0] - sg.a[0]) * f + (sg.h ? 0 : off), ly = sg.a[1] + (sg.b[1] - sg.a[1]) * f + (sg.h ? off : 0);
        const box = { x: lx - w / 2, y: ly - hgt / 2, w, h: hgt };
        const grow = { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 };
        if (cards.some(r => hit(r, box))) continue; // keep port stubs free
        if (tagRects.some(r => hit(r, grow))) continue;
        if (placed.some(r => (pass === 0 || pass >= 3 || !r.band) && hit(r, grow))) continue;
        if (!relax && onLine(grow)) continue;
        if (!relax && segs.some(s2 => s2.i !== sg.i && segHitsRect(s2.a, s2.b, box))) continue;
        yield { box, grow, lbl: { ...box, text, ...(two ? { sub } : {}), step: map ? e.step : null, ...(pill ? { sw: stepW(e.step) } : {}) } };
      }
    }
  }
  const put = (e, s, full) => { placed.push(s.box); reserved.push(s.grow); e.lbl = { ...s.lbl, short: s.lbl.text !== full }; };
  const unput = e => { const L = e.lbl, same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)), q = reserved.findIndex(same(3)); if (p >= 0) placed.splice(p, 1); if (q >= 0) reserved.splice(q, 1); e.lbl = null; };
  const fullOf = e => map ? fit(e.label || '', 10.5, e.under ? 320 : 440) : String((e.step != null ? e.step + ' · ' : '') + (e.label || '')).split(EDGE_BREAK).map(r => fit(r, 10, e.cut || 150)).join('\n');
  function placeLabel(e, late) { // late: a line left with no spot, once every line is routed: a typed view's takes a map's fallbacks too
    if (!e.label && e.step == null) return;
    const full = fullOf(e);
    const tries = [full]; if (e.step != null && e.label && !dg.abs) tries.push(map ? '' : String(e.step));
    const first = (x, text, pass) => fits(x, text, pass).next().value;
    let s = first(e, full, 0); if (s) return put(e, s, full);
    // a label whose spots are all taken by a label placed before it: that label moves to each of its other spots in turn, until
    // this one fits too. Both centred on their lines, the labels of two lines that leave a card side by side (16 px apart, too
    // close to stack) left the second no room, and it fell back to its step (assistant's "a draft", by a jog of 16 px)
    // Only a label within reach of e's line can be in its way: the others are passed over (each try scans every spot of both
    // lines, and over every line it made the late tries of a large typed view three times as slow)
    const { w: lw, hgt: lh } = sizeOf(e, full), xs = e.pts.map(p => p[0]), ys = e.pts.map(p => p[1]);
    const reach = { x: Math.min(...xs) - lw / 2 - 4, y: Math.min(...ys) - lh / 2 - 4, w: Math.max(...xs) - Math.min(...xs) + lw + 8, h: Math.max(...ys) - Math.min(...ys) + lh + 8 };
    if (map ? !late : late) for (const o of routed) { if (o === e || !o.lbl || o.lbl.short || o.fixed || !hit(o.lbl, reach)) continue;
      const was = o.lbl, back = () => put(o, { box: { x: was.x, y: was.y, w: was.w, h: was.h }, grow: { x: was.x - 3, y: was.y - 3, w: was.w + 6, h: was.h + 6 }, lbl: was }, was.text);
      unput(o); if (!first(e, full, 0)) { back(); continue; } // e finds no spot even without it
      for (const so of fits(o, was.text, 0)) { put(o, so, was.text); if ((s = first(e, full, 0))) return put(e, s, full); unput(o); }
      back(); }
    for (const pass of (late ? (map ? [4, 3] : [0, 4, 3, 5, 1, 2]) : map ? [0, 1, 2] : [0])) for (const text of tries) if ((pass || text !== full) && (s = first(e, text, pass))) return put(e, s, full);
  }
  let stats = {};
  free.forEach(e => { // every port's stub is reserved before routing starts
    const st = [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB], en = [e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB];
    e.stubs = [[e.p1, st], [en, e.p2]];
  });
  const runRouting = order => {
    routed.length = 0; reserved.length = 0; placed.length = 0; stats = {};
    (dg.blocks || []).forEach(b => { reserved.push(b); placed.push(b); });
    families.forEach(f => { const h = headRect(f); reserved.push(h); placed.push(h);
      placed.push(...[{ x: f.x, y: f.y - 3, w: f.w, h: 6 }, { x: f.x, y: f.y + f.h - 3, w: f.w, h: 6 }, { x: f.x - 3, y: f.y, w: 6, h: f.h }, { x: f.x + f.w - 3, y: f.y, w: 6, h: f.h }].map(r => ({ ...r, band: true }))); }); // lane headers and arrows stay clear
    edges.filter(e => e.fixed).forEach(e => { routed.push(e); if (e.under || e[OWN_ROUTE]) { placeLabel(e); stats[e.how] = (stats[e.how] || 0) + 1; return; } if (e.lbl) { placed.push(e.lbl); reserved.push({ x: e.lbl.x - 3, y: e.lbl.y - 3, w: e.lbl.w + 6, h: e.lbl.h + 6 }); } stats.comb = (stats.comb || 0) + 1; });
    order.forEach(e => {
      let how = 'grid'; e.lbl = null; e.pts = wide(e, false);
      if (!e.pts) { how = 'cross'; e.pts = gridRoute(e, true, 0); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
      stats[how] = (stats[how] || 0) + 1; e.how = how;
      routed.push(e); placeLabel(e);
    });
    return (stats.cross || 0) + (stats.fallback || 0);
  };
  __ms.place = performance.now() - __ms.t; __ms.t = performance.now();
  let order = [...free].sort((a, b) => (Math.abs(a.p1[0] - a.p2[0]) + Math.abs(a.p1[1] - a.p2[1])) - (Math.abs(b.p1[0] - b.p2[0]) + Math.abs(b.p1[1] - b.p2[1])));
  // lines into one side of a card nest (#49). The router turns a line as late as it can, so the line whose turn must lie
  // nearest the card goes first and each next one takes the track beside it: coming from below, the lowest port first;
  // from above, the highest. Shortest first, the last line found no track left and went round its own column.
  const into = {}; free.forEach(e => (into[e.t.id + '|' + e.ts] ||= []).push(e));
  Object.entries(into).forEach(([k, list]) => { if (list.length < 2) return; const ax = /\|[LR]$/.test(k) ? 1 : 0;
    const nearFirst = e => { const d = e.p1[ax] - e.p2[ax]; return d > 0 ? -e.p2[ax] : d < 0 ? e.p2[ax] - 1e6 : 1e7; };
    const slots = list.map(e => order.indexOf(e)).sort((a, b) => a - b), turns = [...list].sort((a, b) => nearFirst(a) - nearFirst(b));
    slots.forEach((at, i) => { order[at] = turns[i]; }); });
  // fan-in (issue 111): lines into a card that six or more lines come into go first, in that order, so they take the tracks by
  // the card and the rest go round them (r19's logger has seven; its lines crossed the ones routed before them).
  // ponytail: six fits the bench (five made d24's hub worse); a fan-in card's own layout row is what is left
  // (NEST) not a card whose lines all come from one other, which nest (shortest first, above): taken first, the lines one way
  // between two states took the inner tracks, and those the other way went round them and crossed (audit 39: eight
  // transitions, laid out right)
  const srcs = Object.create(null); if (NEST) free.forEach(e => { (srcs[e.t.id] ||= new Set()).add(e.s.id); });
  const fan = Object.create(null), hot = e => fan[e.t.id] >= 6 && !(NEST && srcs[e.t.id].size < 2); free.forEach(e => { fan[e.t.id] = (fan[e.t.id] || 0) + 1; });
  order = [...order.filter(hot), ...order.filter(e => !hot(e))];
  let bad = runRouting(order);
  // rip-up and reroute: an edge that had to cross goes first next time; keep the best attempt (not when the view is laid
  // out again with room for lines: that layout's tries seldom gained anything, and they cost a third of its time; with room for
  // a label it tries, as the layout it may replace did; none with reroute: false)
  // reroute: false still tries once when a line that had to cross runs across its own card's loop (audit 27: laid out right, a
  // two-way pair's line out of a card with a loop climbed through the loop; routed first, it keeps clear of it)
  const acrossLoop = () => { const L = edges.filter(e => e[OWN_ROUTE] === 'loop' && e.pts);
    return L.length > 0 && order.some(e => e.how !== 'grid' && L.some(l => (l.s === e.s || l.s === e.t) && segsOf(e.pts || []).some(([p, q]) => segsOf(l.pts).some(([r, s]) => crosses(p, q, r, s))))); };
  for (let tries = 0; bad && (dg.reroute !== false || !tries && acrossLoop()) && (!last || room.lx) && tries < 4; tries++) {
    const stuck = order.filter(e => e.how !== 'grid');
    const next = [...stuck, ...order.filter(e => e.how === 'grid')];
    const snap = order.map(e => [e, e.pts, e.lbl, e.how]), snapStats = stats, snapR = [routed.slice(), reserved.slice(), placed.slice()];
    const b2 = runRouting(next);
    if (b2 < bad) { bad = b2; order = next; }
    else { snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; }); stats = snapStats; routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); break; }
  }
  __ms.route = performance.now() - __ms.t; __ms.t = performance.now(); __ms.rounds = 0; __ms.reroutes = 0;
  // Lines left with no route get room (#40). Each one's route around the cards (the last resort's, below) shows where it
  // would run along another line: that column (row) gap widens by two lanes for it, and the view is laid out again.
  if (!last && !dg.quick && map && !dg.abs && free.some(e => e.how === 'fallback')) {
    const need = { x: {}, y: {} }, cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs));
    const gapAt = (v, vertical) => { if (vertical) return cs.find(c => colX[c] + (colW[c] || NW) < v && v < colX[c + 1]);
      for (let r = r0; r < r1; r++) if (rowY(r) + NH < v && v < rowY(r + 1)) return r; };
    free.filter(e => e.how === 'fallback').forEach(e => { routed.splice(routed.indexOf(e), 1); const p = wide(e, 2), mine = { x: new Set(), y: new Set() };
      segsOf(p || []).forEach(([a, b]) => { if (!routed.some(o => segsOf(o.pts).some(([c, d]) => colinear(a, b, c, d)))) return;
        const v = a[0] === b[0], g = gapAt(v ? a[0] : a[1], v); if (g != null) mine[v ? 'x' : 'y'].add(g); });
      for (const k of ['x', 'y']) mine[k].forEach(g => { need[k][g] = (need[k][g] || 0) + 2 * SEP; }); });
    if (Object.keys(need.x).length + Object.keys(need.y).length) {
      for (const k of ['x', 'y']) Object.entries((room || {})[k] || {}).forEach(([g, v]) => { need[k][g] = (need[k][g] || 0) + v; });
      return { room: need, ms: { probe: performance.now() - t0 } };
    }
  }
  // port repair: two routes that cross next to a shared node side swap ports, keep it if issues drop. On a map a detour
  // counts, as the layout check counts it: a swap that took u21's Web shop's two lines round the map to save one crossing
  // was kept (unfolding Catalog)
  // a typed view's line on another, or along a box's border, counts as more than a crossing: a swap that saves a crossing so is
  // no gain (audit 38: laid out down, two transitions between one pair swapped ports, and one ran down another's track)
  const issueCount = only => routeAudit({ edges }, '', only).reduce((k, s) => k + (!NEST || / cross$/.test(s) ? 1 : (used = true, 3)), 0) + (map ? (only ? [...only] : edges).filter(e => detour(e.pts)).length : 0);
  const endAt = (e, n, side) => (e.s === n && e.fs === side) ? 'p1' : (e.t === n && e.ts === side) ? 'p2' : null;
  let issues = issueCount();
  // a swap re-routes only the two swapped edges (ripped up, then routed after every other route), not the whole
  // graph; a round goes on after an improvement; and repair spends at most 2 routings per free edge, so its cost
  // grows with the graph instead of with crossings x edges x routing (it stalled on 26 nodes / 44 edges)
  const restub = e => { e.stubs = [[e.p1, [e.p1[0] + OUT[e.fs][0] * STUB, e.p1[1] + OUT[e.fs][1] * STUB]], [[e.p2[0] + OUT[e.ts][0] * STUB, e.p2[1] + OUT[e.ts][1] * STUB], e.p2]]; };
  const ripUp = e => { const i = routed.indexOf(e); if (i >= 0) routed.splice(i, 1); const L = e.lbl; if (!L) return;
    const same = m => r => r.x === L.x - m && r.y === L.y - m && r.w === L.w + 2 * m && r.h === L.h + 2 * m;
    const p = placed.findIndex(same(0)); if (p >= 0) placed.splice(p, 1); const q = reserved.findIndex(same(3)); if (q >= 0) reserved.splice(q, 1); };
  // a swapped edge tries a clean route near its ends, then one that may cross (near its ends, then anywhere); it
  // skips the clean whole-grid search, which mostly fails here and visits every cell when it does
  const routeOne = (e, spare) => { let how = 'grid'; e.lbl = null; e.pts = gridRoute(e, false, 320, spare);
    if (!e.pts) { how = 'cross'; e.pts = wide(e, true, spare); } if (!e.pts) { how = 'fallback'; e.pts = fallback(e); }
    e.how = how; routed.push(e); placeLabel(e); return true; };
  let budget = 2 * free.length, swapped = false, rrSwap = false;
  // a route moved onto its end's new port: its last run follows it
  const moved = (e, k, P) => { const [i, j] = k === 'p1' ? [0, 1] : [P.length - 1, P.length - 2], v = P[i][1] === P[j][1];
    return P.length > 2 && simplify(P.map((p, x) => x === i ? e[k] : x === j ? (v ? [p[0], e[k][1]] : [e[k][0], p[1]]) : p)); };
  const segsE = e => e.pts.slice(0, -1).map((p, i) => [p, e.pts[i + 1]]), xing = (a, b) => segsE(a).some(([p, q]) => segsE(b).some(([r, s]) => crosses(p, q, r, s)));
  // with repair off (S19), two lines between the same two cards that cross (a request and its reply, laid out right) swap their
  // ports at both cards, else at one: their tie in the port order on a side is the model's edge order, which need not match where
  // each turns. Kept when the issues drop; the pairs are found by card pair, so it costs little more than the lines it looks at.
  // A typed view's only: a map's repair:false is its author's, no repair at all
  // the pair's routes moved onto each other's ports are kept only with no more lines along a box's border or across its title
  // (issueCount sees no box): else the two are routed again, the grid keeping off borders (audit 61: laid out right, a call each
  // way between two services beside an account group, one moved route ran 4 px under the group's border)
  const rims = (...l) => families.length ? routeAudit({ edges: l, families, byId }, '').filter(s => / runs along the border | header crossed by /.test(s)).length : 0;
  if (issues && dg.typed && dg.repair === false && !dg.noSwap) { const by = new Map(); free.forEach(e => { if (e.fixed || e.s === e.t || e.fromPort != null || e.toPort != null || e.inner) return; /* a port's end stays on its port */ const k = [e.s.id, e.t.id].sort().join('\n'); by.set(k, [...(by.get(k) || []), e]); });
    by.forEach(l => l.forEach((a, i) => l.slice(i + 1).forEach(b => {
      if (!xing(a, b)) return;
      const ks = [a.s, a.t].flatMap(n => ['L', 'R', 'T', 'B'].map(side => [endAt(a, n, side), endAt(b, n, side)]).filter(([x, y]) => x && y));
      if (ks.length !== 2) return;
      const snap = [a, b].map(e => [e, e.pts, e.lbl, e.how, e.p1, e.p2]), snapR = [routed.slice(), reserved.slice(), placed.slice()], ab = new Set([a, b]), was = issueCount(ab), b0 = rims(a, b);
      const undo = () => { snap.forEach(([e, p, lb, hw, p1, p2]) => { Object.assign(e, { pts: p, lbl: lb, how: hw, p1, p2 }); restub(e); });
        routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); };
      for (const sw of [ks, [ks[0]], [ks[1]]]) {
        ripUp(a); ripUp(b);
        let ma = a.pts, mb = b.pts; sw.forEach(([ka, kb]) => { [a[ka], b[kb]] = [b[kb], a[ka]]; ma = ma && moved(a, ka, ma); mb = mb && moved(b, kb, mb); }); restub(a); restub(b);
        let now = Infinity;
        if (ma && mb) { a.pts = ma; b.pts = mb; a.lbl = b.lbl = null; routed.push(a, b); placeLabel(a); placeLabel(b); now = issues - was + issueCount(ab); if (now >= issues || rims(a, b) > b0) { ripUp(a); ripUp(b); now = Infinity; } }
        if (now >= issues) { routeOne(a); routeOne(b); now = issues - was + issueCount(ab); }
        if (now < issues) { issues = now; swapped = rrSwap = true; return; }
        undo();
      }
    })));
  }
  for (let round = 0; issues && dg.repair !== false && round < 8 && budget > 0; round++) {
    let fixed = false; __ms.rounds++;
    const pairs = []; edges.forEach((a, i) => edges.slice(i + 1).forEach(b => { if (xing(a, b)) pairs.push([a, b]); }));
    // a crossing pair, or a pair where one shares a node side with the other's crossing partner
    // each pair once, crossing pairs first; by place, since a model's edges need no id (by id, every pair of r15's was one)
    const cand = [], seen = new Set(), add = (a, b) => { const k = edges.indexOf(a) + '|' + edges.indexOf(b); if (!seen.has(k)) { seen.add(k); cand.push([a, b]); } };
    pairs.forEach(([a, b]) => add(a, b)); pairs.forEach(([a, b]) => free.forEach(o => { if (o !== a && o !== b) { add(a, o); add(b, o); } }));
    outer3: for (const [a, b] of cand.filter(([x, y]) => !x.fixed && !y.fixed)) {
      for (const n of [a.s, a.t]) for (const side of ['L', 'R', 'T', 'B']) {
        const ka = endAt(a, n, side), kb = endAt(b, n, side); if (!ka || !kb) continue;
        if (budget <= 0) break outer3;
        const pa = a[ka], pb = b[kb]; a[ka] = pb; b[kb] = pa; restub(a); restub(b);
        const snap = [a, b].map(e => [e, e.pts, e.lbl, e.how]), snapR = [routed.slice(), reserved.slice(), placed.slice()];
        const ab = new Set([a, b]), was = issueCount(ab); // issues away from a and b cannot change
        budget -= 2; __ms.reroutes++;
        if (!was) { a[ka] = pa; b[kb] = pb; restub(a); restub(b); continue; } // nothing to gain: the count can only drop by their own issues
        ripUp(a); ripUp(b);
        // first the routes they have, each moved onto the other's port: two lines that cross where they leave one side no longer
        // cross (r15's web: its line to kit turned down past the line to api-client, and routed again they crossed again)
        const ma = moved(a, ka, a.pts), mb = moved(b, kb, b.pts); let now = Infinity;
        if (ma && mb) { a.pts = ma; b.pts = mb; a.lbl = b.lbl = null; routed.push(a, b); placeLabel(a); placeLabel(b); now = issues - was + issueCount(ab); if (now >= issues) { ripUp(a); ripUp(b); } }
        if (now >= issues) now = routeOne(a, b) && routeOne(b) ? issues - was + issueCount(ab) : Infinity;
        if (now < issues) { issues = now; fixed = swapped = true; if (!issues) break outer3; continue outer3; }
        a[ka] = pa; b[kb] = pb; restub(a); restub(b);
        snap.forEach(([e, p, l, hw]) => { e.pts = p; e.lbl = l; e.how = hw; });
        routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
      }
    }
    if (!fixed) break;
  }
  if (swapped) { ['grid', 'cross', 'fallback'].forEach(k => { delete stats[k]; }); free.forEach(e => { stats[e.how] = (stats[e.how] || 0) + 1; }); }
  // a line that jogs 16 px or less between sides that face each other runs straight when one of its ends is the only port on its
  // side: that port moves level with the other end, if no issue comes with it. Ports are spread round the middle of a side, so a
  // line from the lower of a card's two ports into a card level with it jogged just before it (clinic's "Books appointments")
  if ((map || dg.typed) && dg.repair !== false) free.forEach(e => {
    const P = e.pts, ax = e.fs === 'L' || e.fs === 'R' ? 1 : 0, d = P[P.length - 1][ax] - P[0][ax];
    if (P.length !== 4 || !d || Math.abs(d) > 16 || OUT[e.fs][1 - ax] !== -OUT[e.ts][1 - ax]) return;
    const lone = (n, side) => !n.box && sides[n.id + '|' + side]?.length === 1, [k, n, side, v] = lone(e.t, e.ts) ? ['p2', e.t, e.ts, P[0][ax]] : lone(e.s, e.fs) ? ['p1', e.s, e.fs, P[3][ax]] : [];
    const sp = n && (ax ? [n.y + n.h * .08, n.y + n.h * .92] : sideSpan(n, side) || [n.x + n.w * .08, n.x + n.w * .92]);
    if (!k || v < sp[0] || v > sp[1]) return;
    const was = e[k], before = issueCount(new Set([e])), snap = [e.pts, e.lbl, e.how], snapR = [routed.slice(), reserved.slice(), placed.slice()];
    ripUp(e); e[k] = ax ? [was[0], v] : [v, was[1]]; restub(e); routeOne(e);
    if (e.pts.length === 2 && issueCount(new Set([e])) <= before) return;
    e[k] = was; restub(e); [e.pts, e.lbl, e.how] = snap;
    routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]);
  });
  // the last resort for a line still with no route: around the cards, across or along other lines if it must (it was a
  // plain elbow through whatever lay in its way, and a card's mask made the line look like a connection to that card)
  // A typed view's line first tries one of its ends on its card's top or bottom: two cards a gap of two stubs apart, each with
  // ports on the sides that face, leave a line out of one no track that keeps off a line into the other at its level (audit 24:
  // a state machine's X→Done ran along Waiting→Packed in the gap between X and Packed). Kept only when clean
  let tbBudget = 48; // ponytail: grid searches for all of a view's ends moved so, ample for the few lines a view leaves with no route
  const lenOf = P => segsOf(P).reduce((k, [a, b]) => k + Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]), 0) + BEND * (P.length - 2);
  const onTB = (e, cross = false) => { if (!dg.typed || e.inner || e.fromPort != null || e.toPort != null || e.s === e.t) return false;
    const was = [e.p1, e.p2, e.fs, e.ts]; let best = null;
    for (const k of ['p1', 'p2']) { const n = k === 'p1' ? e.s : e.t, o = k === 'p1' ? e.t : e.s, fk = k === 'p1' ? 'fs' : 'ts';
      if (n.box || e[fk] === 'T' || e[fk] === 'B') continue;
      for (const side of ['T', 'B']) { const y = side === 'T' ? n.y : n.y + n.h, taken = edges.filter(x => x !== e && x.pts).flatMap(x => [[x.s, x.fs, x.p1], [x.t, x.ts, x.p2]]).filter(([m, sd]) => m === n && sd === side).map(([, , q]) => q[0]);
        const lo = n.x + n.w * .08, hi = n.x + n.w * .92, ox = o.x + o.w / 2, xs = [0, -1, 1, -2, 2].map(j => n.x + n.w / 2 + j * PORT).filter(x => x >= lo && x <= hi && taken.every(t => Math.abs(t - x) >= PORT)).sort((a, b) => Math.abs(a - ox) - Math.abs(b - ox));
        for (const x of xs) { if (tbBudget-- <= 0) break; e[k] = [x, y]; e[fk] = side; restub(e); const P = wide(e, cross);
          if (P && !(cross && heads(P)) && (!best || lenOf(P) < lenOf(best[0]))) best = [P, k, [x, y], side];
          [e.p1, e.p2, e.fs, e.ts] = was; restub(e); } } }
    if (!best) return false;
    const [P, k, q, side] = best; e[k] = q; e[k === 'p1' ? 'fs' : 'ts'] = side; restub(e); e.pts = P; e.how = 'grid'; return true; };
  // (a box's title the line crosses counts as a line it runs on: the last resort's search, kept out of a title only at the cost
  // of a shared line, goes through it, audit 60: laid out down, a third line out of a card's top in a virtual network, between
  // two that took the one track under its title; its end moved to the card's side clears both). headRect: the title as laid
  // out, turned or not, which check() measures on the picture turned back
  const issuesOf = e => { const ps = routeAudit({ edges, families, byId }, '', new Set([e])), hd = dg.typed ? families.filter(f => segsOf(e.pts).some(([a, b]) => segHitsRect(a, b, headRect(f)))).length : 0;
    return [ps.filter(p => / share a line$/.test(p)).length + hd, ps.filter(p => !/ header crossed by /.test(p)).length + hd, ps.filter(p => / lies on edge /.test(p)).length + lateOn(e)]; };
  // a labelled line with no spot for its label yet: 1 when the first spot the late tries find (placeLabel, the labels before it
  // left where they are) lies on another line, or there is none
  const lateOn = e => { if (e.lbl || (!e.label && e.step == null)) return 0; const full = fullOf(e), tries = [full, ...(e.step != null && e.label && !dg.abs ? [String(e.step)] : [])];
    for (const pass of [0, 4, 3, 5, 1, 2]) for (const text of tries) { if (!pass && text === full) continue; const s = fits(e, text, pass).next().value; if (!s) continue;
      const r = { x: s.box.x + 1, y: s.box.y + 1, w: s.box.w - 2, h: s.box.h - 2 }; return edges.some(o => o !== e && o.pts && segsOf(o.pts).some(([a, b]) => segHitsRect(a, b, r))) ? 1 : 0; }
    return 1; };
  const heads = P => dg.typed && families.some(f => segsOf(P).some(([a, b]) => segHitsRect(a, b, headRect(f))));
  const lastR = dg.quick ? [] : free.filter(e => e.how === 'fallback');
  // a line the search brought in from the side rather than head on (audit 60's rule) is routed head on too, and that way kept when
  // it has fewer issues: the rule weighs what the grid knows, and a way in from the side can cross more of the lines into that
  // side (bookshop-c4's containers in Linux CI's fonts: the worker's line to the database came in from above, over the API's two)
  // or, no more issues, fewer of them a shared line (audit 62: laid out down, a GCP service's line into one that two lines from
  // another reach, in from the side, ran down the stub track of one of those; head on it crosses it once)
  lastR.forEach(e => { ripUp(e); sidedIn = false; e.pts = wide(e, 2) || (dg.typed && through(e.pts, e) && gridRoute(e, 3, 0)) || e.pts; const sided = sidedIn; e.lbl = null; routed.push(e); placeLabel(e);
    if (!sided || !dg.typed) return;
    const k0 = issuesOf(e), was = e.pts; ripUp(e); headOn = true; const P = wide(e, 2); headOn = false;
    if (P) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e); if (k1[1] < k0[1] || (k1[0] < k0[0] && k1[1] <= k0[1] && k1[2] <= k0[2])) return; ripUp(e); }
    e.pts = was; e.lbl = null; routed.push(e); placeLabel(e); });
  // then each of them whose route runs round one of its own ends (the last resort may: audit 21), that end tried on each other
  // side of its card, kept when the route there runs round neither end and has no more issues (audit 28: er-through2-min laid
  // out down left its source's bottom and went left of it, over it and down its right side, and crossed a line anyway)
  // or (NEST) one that passes the line of its end's side and comes back to it (audit 38: laid out down, a line into a final state
  // ran down past its top, under the self-transition of the state above, and back up into it)
  const past = (n, side, p) => side === 'T' ? p[1] > n.y + .5 : side === 'B' ? p[1] < n.y + n.h - .5 : side === 'L' ? p[0] > n.x + .5 : p[0] < n.x + n.w - .5;
  const roundOwn = (e, P) => [[e.s, e.fs, P[P.length - 1]], [e.t, e.ts, P[0]]].find(([n, side, far]) => n && !n.box && !behind(n, side, far) && P.some(p => behind(n, side, p)))
    || (NEST ? [[e.s, e.fs, P[P.length - 1], P.slice(2, -1)], [e.t, e.ts, P[0], P.slice(1, -2)]].find(([n, side, far, mid]) => n && !n.box && !past(n, side, far) && mid.some(p => past(n, side, p))) : undefined);
  if (dg.typed) lastR.forEach(e => { const r = roundOwn(e, e.pts); if (!r || e.inner || e.fromPort != null || e.toPort != null || e.s === e.t) return;
    const k = r[0] === e.s && r[1] === e.fs ? 'p1' : 'p2', fk = k === 'p1' ? 'fs' : 'ts', n = r[0], o = k === 'p1' ? e.t : e.s, k0 = issuesOf(e)[1];
    const was = [e.p1, e.p2, e.fs, e.ts, e.pts, e.how]; let best = null; ripUp(e);
    for (const side of ['R', 'L', 'B', 'T'].filter(sd => sd !== e[fk])) { const lr = side === 'L' || side === 'R';
      const taken = edges.filter(x => x !== e && x.pts).flatMap(x => [[x.s, x.fs, x.p1], [x.t, x.ts, x.p2]]).filter(([m, sd]) => m === n && sd === side).map(([, , q]) => q[lr ? 1 : 0]);
      const mid = lr ? n.y + n.h / 2 : n.x + n.w / 2, len = lr ? n.h : n.w, lo = mid - len * .42, hi = mid + len * .42, to = lr ? o.y + o.h / 2 : o.x + o.w / 2;
      const vs = [0, -1, 1, -2, 2].map(j => mid + j * PORT).filter(v => v >= lo && v <= hi && taken.every(t => Math.abs(t - v) >= PORT)).sort((a, b) => Math.abs(a - to) - Math.abs(b - to));
      for (const v of vs.slice(0, 1)) { if (tbBudget-- <= 0) break;
        e[k] = lr ? [side === 'L' ? n.x : n.x + n.w, v] : [v, side === 'T' ? n.y : n.y + n.h]; e[fk] = side; restub(e);
        const P = wide(e, 2) || gridRoute(e, 3, 0);
        if (P && !roundOwn(e, P) && !through(P, e)) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e)[1];
          if (k1 <= k0 && (!best || k1 < best[0] || (k1 === best[0] && lenOf(P) < lenOf(best[1])))) best = [k1, P, e[k], side]; ripUp(e); }
        [e.p1, e.p2, e.fs, e.ts] = was; restub(e); } }
    if (best) { e[k] = best[2]; e[fk] = best[3]; restub(e); e.pts = best[1]; e.how = 'grid'; } else { e.pts = was[4]; e.how = was[5]; }
    e.lbl = null; routed.push(e); placeLabel(e); });
  // then each of them that runs along another line, its end moved (onTB), when that leaves it none and no more issues, nor a label
  // more on a line (its own or another's on it) or with no spot (audit 61: laid out down, the second of two lines from one service
  // to another moved out of its side found no spot for its label, which the late tries then put on the first)
  if (dg.typed) lastR.forEach(e => { const k0 = issuesOf(e); if (!k0[0]) return;
    const was = [e.p1, e.p2, e.fs, e.ts, e.pts, e.how]; ripUp(e);
    if (onTB(e) || (heads(e.pts) && onTB(e, 2))) { e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e); if (!k1[0] && k1[1] <= k0[1] && k1[2] <= k0[2]) return; ripUp(e); }
    // else the last resort again, round what the lines before it moved: kept when it runs along fewer (a label more on a line is
    // no bar here: c4-stress's generated view laid out down kept a shared line and crossed 3 more lines with it, tests/m2-fixtures)
    [e.p1, e.p2, e.fs, e.ts, e.pts, e.how] = was; restub(e); const P = wide(e, 2);
    if (P) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = issuesOf(e); if (k1[0] < k0[0] && k1[1] <= k0[1]) return; ripUp(e); e.pts = was[4]; }
    e.lbl = null; routed.push(e); placeLabel(e); });
  // (a typed view with repair off) then each line the grid routed that runs along another, routed again round every other line,
  // kept on the same terms (audit 61: laid out down, a line into the top of a card under its source, its port level with another
  // line's port on the card's other side, ran on that line, routed earlier, for the 6 px where it turned into its end's track)
  if (dg.typed && dg.repair === false && !NEST && !dg.quick) free.filter(e => e.how === 'grid' && !e.fixed && e.s !== e.t).forEach(e => { const k0 = issuesOf(e); if (!k0[0] || !routeAudit({ edges }, '', new Set([e])).some(p => / share a line$/.test(p))) return;
    const was = [e.pts, e.lbl]; ripUp(e); e.lbl = null; const P = wide(e, false);
    if (P) { e.pts = P; routed.push(e); placeLabel(e); const k1 = issuesOf(e); if (k1[0] < k0[0] && k1[1] <= k0[1] && k1[2] <= k0[2]) return; ripUp(e); }
    const L = e.lbl = was[1]; e.pts = was[0]; routed.push(e); if (L) { placed.push(L); reserved.push({ x: L.x - 3, y: L.y - 3, w: L.w + 6, h: L.h + 6 }); } });
  // (NEST) then each line that crosses a box's title, runs along a box's border, runs through a box that holds neither of its
  // ends (drawn so it seems to enter the box and leave it, and a region's title, which state.js draws later, may lie on its
  // way) or runs along a line the last resort drew into a box or along a loop (audit 44: laid out right, the last resort's turn
  // ran on a state's self-transition's top run, half a pixel off, where no grid track lay between the loop and the row above): the line routed again with every box that holds neither end
  // shut to it, from its own sides and with each end on each other side of its card, and the best kept by check()'s rule (a
  // title crossed or a border or line run along before crossings, then all issues, then boxes run through). Audit 39: laid out
  // down, a transition from a state over a composite to the state under it, its way in shut by a loop, ran in through the
  // composite's title and out through its bottom; its way into the state's side was clear. (Each title as headRect has it:
  // routeAudit's strip lies along a box's top, and a turned view's title runs down its left)
  // and each box as the type draws it (dg.drawn: state.js stretches a state's regions across it, so a region's title moves to the
  // state's left; audit 44: laid out right, the initial transition ran through a composite whose region's title, drawn there,
  // it crossed, while a route round the composite crossed one line), in the view's own axes
  const drawnAs = (() => { if (!NEST || typeof dg.drawn !== 'function' || !families.length) return null;
    const flip = r => (TB ? { ...r, x: r.y, y: r.x, w: r.h, h: r.w } : r), out = dg.drawn(nodes.map(flip), families.map(flip)) || [];
    const by = new Map(families.map(f => [f.id, f])), m = new Map();
    out.forEach(d => { const f = by.get(d.id), q = d && flip(d); if (f && q && (q.x !== f.x || q.y !== f.y || q.w !== f.w || q.h !== f.h)) m.set(f, { ...f, x: q.x, y: q.y, w: q.w, h: q.h }); }); return m.size ? m : null; })();
  const titles = e => families.filter(f => segsOf(e.pts).some(([a, b]) => segHitsRect(a, b, headRect(f)) || (drawnAs && drawnAs.has(f) && segHitsRect(a, b, headRect(drawnAs.get(f)))))).length;
  const boxIn = e => families.filter(f => !holds(boxEnd[f.id], e.s) && !holds(boxEnd[f.id], e.t) && segsOf(e.pts).some(([a, b]) => segHitsRect(a, b, { x: f.x + 1, y: f.y + 1, w: f.w - 2, h: f.h - 2 }))).length;
  // [issues other than crossings, all, boxes run through] of the lines in `only` (all: the view's, once each)
  const boxSaid = only => { const ps = routeAudit({ edges, families, byId }, '', only).filter(p => !/ header crossed by /.test(p)), x = ps.filter(p => / cross$/.test(p)).length;
    const L = only ? [...only] : edges.filter(e => e.pts), b = L.reduce((k, e) => k + titles(e), 0); return [ps.length - x + b, ps.length + b, L.reduce((k, e) => k + boxIn(e), 0)]; };
  const lt3 = (u, w) => u[0] < w[0] || (u[0] === w[0] && (u[1] < w[1] || (u[1] === w[1] && u[2] < w[2])));
  const relabel = (e, L) => { e.lbl = L; routed.push(e); if (L) { placed.push(L); reserved.push({ x: L.x - 3, y: L.y - 3, w: L.w + 6, h: L.h + 6 }); } };
  // (the pass is kept only when the view as a whole is better for it: a line's move can take a track another line wanted)
  // ponytail: a dozen grid searches a layout, and a line that only runs through a box tried in views of up to 30 cards (as
  // bestFlow): the stress file's 50 states laid out in twice the time
  let boxBudget = 12;
  if (NEST) { const r0 = [], is0 = routeAudit({ edges, families, byId }, '', null, r0), bad = new Set();
    is0.forEach((p, k) => { if (/ along the border of /.test(p)) bad.add(r0[k][0]); else if (/ share a line$/.test(p) && r0[k].some(x => lastR.includes(x) && (x.s.box || x.t.box || r0[k].some(y => y.s === y.t)))) r0[k].forEach(x => bad.add(x)); });
    const todo = free.filter(e => !e.fixed && !e.inner && e.fromPort == null && e.toPort == null && e.s !== e.t && e.pts && (bad.has(e) || titles(e) || (nodes.length <= 30 && boxIn(e))));
    const v0 = todo.length ? boxSaid() : null, snap = todo.length ? edges.map(e => [e, e.p1, e.p2, e.fs, e.ts, e.pts, e.how, e.lbl, e.stubs]) : null, snapR = todo.length ? [routed.slice(), reserved.slice(), placed.slice()] : null, used0 = used;
    todo.forEach(e => { const k0 = boxSaid(new Set([e])), was = [e.p1, e.p2, e.fs, e.ts, e.pts, e.how, e.lbl]; let best = null; ripUp(e);
      for (const [k, fk, n, o, given] of [['p1', 'fs', e.s, e.t, e.fromSide], ['p2', 'ts', e.t, e.s, e.toSide]]) { if (n.box) continue;
        // (an end whose side the type gives, a bar's long side, stays on it)
        for (const side of ['R', 'L', 'B', 'T'].filter(sd => sd === e[fk] ? k === 'p1' : !EDGE_SIDE[given])) { const lr = side === 'L' || side === 'R', same = side === e[fk];
          const taken = edges.filter(x => x !== e && x.pts).flatMap(x => [[x.s, x.fs, x.p1], [x.t, x.ts, x.p2]]).filter(([m, sd]) => m === n && sd === side).map(([, , q]) => q[lr ? 1 : 0]);
          const mid = lr ? n.y + n.h / 2 : n.x + n.w / 2, len = lr ? n.h : n.w, to = lr ? o.y + o.h / 2 : o.x + o.w / 2;
          const v = [0, -1, 1, -2, 2].map(j => mid + j * PORT).filter(x => Math.abs(x - mid) <= len * .42 && taken.every(t => Math.abs(t - x) >= PORT)).sort((a, b) => Math.abs(a - to) - Math.abs(b - to))[0];
          if ((!same && v == null) || boxBudget-- <= 0) continue; // (its own side: the route again, every such box shut)
          if (!same) { e[k] = lr ? [side === 'L' ? n.x : n.x + n.w, v] : [v, side === 'T' ? n.y : n.y + n.h]; e[fk] = side; restub(e); }
          shut = true; const P = gridRoute(e, true, 320) || gridRoute(e, 2, 320); shut = false;
          if (P && !roundOwn(e, P) && !through(P, e)) { e.pts = P; e.lbl = null; routed.push(e); placeLabel(e); const k1 = boxSaid(new Set([e]));
            if (lt3(k1, k0) && (!best || lt3(k1, best[0]) || (!lt3(best[0], k1) && lenOf(P) < lenOf(best[1])))) best = [k1, P, k, fk, e[k], side]; ripUp(e); }
          [e.p1, e.p2, e.fs, e.ts] = was; restub(e); } }
      if (best) { e[best[2]] = best[4]; e[best[3]] = best[5]; restub(e); e.pts = best[1]; e.how = 'grid'; used = true; e.lbl = null; routed.push(e); placeLabel(e); }
      else { e.pts = was[4]; e.how = was[5]; relabel(e, was[6]); } });
    if (todo.length && !lt3(boxSaid(), v0)) { snap.forEach(([e, p1, p2, fs, ts, pts, how, lbl, stubs]) => Object.assign(e, { p1, p2, fs, ts, pts, how, lbl, stubs }));
      routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); used = used0; } }
  if (!dg.quick) edges.forEach(e => { const n = through(e.pts, e); if (n) warn(`the line for edge ${edgeRefIds(e).join(' / ') || e.from + '->' + e.to} runs through card "${n.name ?? n.id}", which it does not join: no route found around it`); });
  __ms.repair = performance.now() - __ms.t; delete __ms.t;
  // a label on a box's border, cut to its step or with no spot asks for room where it is: the column gap it sits in widens by
  // the label's width, else the row gap by its height and 14 px; a label in neither, or with no spot, the gap its line's longest
  // run crosses, a column's first. layoutGraph lays the view out again with it, and keeps that layout if it is better
  // a label still with no spot, once every line is routed: a typed view's tries an earlier label moved, a spot beside its line,
  // one over a line but off box borders, then a map's looser ones; a map's (which had those) the two between. Drawn so, it still
  // asks for room below (it was left off with nothing said, audit 6). One left with none, check() names (leaveIssues). A
  // numbered view's comb places its own labels
  // a typed view's label that a line routed after it, or moved later, runs across is taken off first, and placed again so (audit
  // 32: a block definition view laid out down drew a dependency's label on the generalization, which check() names)
  // with a typed view's late tries; where those find no spot off every line, or only its step, it stays where it was
  const STAYS = new Set(); // labels left on a line: the view is laid out again with room for them, as for one with no spot
  const onLine = (e, L) => { const r = { x: L.x + 1, y: L.y + 1, w: L.w - 2, h: L.h - 2 }; return edges.some(o => o !== e && o.pts && segsOf(o.pts).some(([a, b]) => segHitsRect(a, b, r))); };
  if (!map) edges.forEach(e => { const L = e.lbl; if (!L || e.fixed || !onLine(e, L)) return;
    unput(e); placeLabel(e, true);
    if (e.lbl && !(e.lbl.short && !L.short) && !onLine(e, e.lbl)) { LOOSE.add(e); return; }
    if (e.lbl) unput(e); STAYS.add(e);
    placed.push({ x: L.x, y: L.y, w: L.w, h: L.h }); reserved.push({ x: L.x - 3, y: L.y - 3, w: L.w + 6, h: L.h + 6 }); e.lbl = L; });
  edges.forEach(e => { if ((e.label || e.step != null) && !e.lbl && e.pts && !(map && e.fixed)) { placeLabel(e, true); if (e.lbl) LOOSE.add(e); } });
  // (a typed view with repair off) a label the late tries left on other lines: those lines, up to three, routed again round it
  // (its box is reserved; crossing lines if they must), kept when the view has fewer issues but crossings, no more in all and
  // no label less (audit 62: the use case gallery example with one association added or deleted, a long extend label on the one
  // gap its line crosses, an include and another extend through it). Not in a nested view (a state machine's, NEST or PLAIN:
  // its own passes weigh its labels) nor one whose boxes have more padding than 12 px (a cube's faces lie there, deployment.js,
  // which the grid does not know)
  if (!map && dg.repair === false && !dg.nest && !dg.quick && !families.some(f => f.pad > 12)) { let lb = 4; const said = () => { const ps = routeAudit({ edges, families, byId }, ''); return [ps.filter(p => !/ cross$/.test(p)).length, ps.length]; }, lbls = () => edges.filter(o => o.lbl).length;
    edges.forEach(e => { const L = e.lbl; if (!L || e.fixed || lb <= 0 || !onLine(e, L)) return; const r = { x: L.x + 1, y: L.y + 1, w: L.w - 2, h: L.h - 2 };
      const os = edges.filter(o => o !== e && o.pts && segsOf(o.pts).some(([a, b]) => segHitsRect(a, b, r)));
      if (!os.length || os.length > 3 || os.some(o => o.fixed || o.inner || o.s === o.t || o.fromPort != null || o.toPort != null)) return; lb--;
      const k0 = [said(), lbls()], snap = os.map(o => [o, o.pts, o.lbl, o.how]), snapR = [routed.slice(), reserved.slice(), placed.slice()];
      os.forEach(ripUp); let all = true; os.forEach(o => { o.lbl = null; const P = wide(o, false), Q = P || wide(o, true); if (Q) { o.pts = Q; o.how = P ? 'grid' : 'cross'; } else all = false; routed.push(o); });
      if (all) { os.forEach(o => { placeLabel(o); if (!o.lbl && (o.label || o.step != null)) placeLabel(o, true); }); const k1 = said(); if (k1[0] < k0[0][0] && k1[1] <= k0[0][1] && lbls() >= k0[1]) return; }
      snap.forEach(([o, P, l, hw]) => { o.pts = P; o.lbl = l; o.how = hw; }); routed.splice(0, routed.length, ...snapR[0]); reserved.splice(0, reserved.length, ...snapR[1]); placed.splice(0, placed.length, ...snapR[2]); }); }
  let labelRoom = null;
  const lost = e => !e.lbl || LOOSE.has(e) || STAYS.has(e) && !dg.labelGaps; // a typed view's rows are of mixed height: only such a label widens a row gap, by its row's foot
  // ponytail: a typed view without labelGaps is laid out again for such a label only up to 30 cards (as bestFlow): the layout
  // more doubled the time of a generated view of 50 (requirement-stress, past CI's 1 s); a larger one keeps the looser spot
  const tight = !last && !dg.quick && !dg.abs ? free.filter(e => (e.label || e.step != null) && (lost(e) && (map || dg.labelGaps || nodes.length <= 30) || (map || dg.labelGaps) && (e.lbl.short || families.some(f => onBorder(e.lbl, f))))) : [];
  if (tight.length) {
    const cs = Object.keys(colX).map(Number), rs = nodes.map(n => n.row), r0 = Math.floor(Math.min(...rs)), r1 = Math.ceil(Math.max(...rs)), need = { x: {}, y: {} };
    const gaps = [...cs.filter(c => colX[c + 1] != null).map(c => ['x', c, colX[c] + (colW[c] || NW), colX[c + 1]]),
      ...Array.from({ length: r1 - r0 }, (_, k) => ['y', r0 + k, map ? rowY(r0 + k) + NH : Math.max(rowY(r0 + k), ...nodes.filter(n => n.row === r0 + k).map(n => n.y + n.h)), rowY(r0 + k + 1)])];
    tight.forEach(e => { const { w, hgt: h } = sizeOf(e, fullOf(e)), L = !LOOSE.has(e) && e.lbl, c = L && { x: L.x + L.w / 2, y: L.y + L.h / 2 }, gs = map || lost(e) ? gaps : gaps.filter(g => g[0] === 'x');
      let best = c && ['x', 'y'].map(k => gs.find(([gk, g, p, q]) => gk === k && c[k] >= p && c[k] <= q)).find(Boolean);
      if (!best) segsOf(e.pts).forEach(([a, b]) => { const k = a[1] === b[1] ? 'x' : 'y', i = k === 'x' ? 0 : 1, lo = Math.min(a[i], b[i]), hi = Math.max(a[i], b[i]);
        gs.forEach(([gk, g, p, q]) => { const run = Math.min(hi, q) - Math.max(lo, p); if (gk === k && run > 0 && (!best || (k === 'x') > (best[0] === 'x') || ((k === 'x') === (best[0] === 'x') && run > best[2]))) best = [k, g, run]; }); });
      if (best) need[best[0]][best[1]] = (need[best[0]][best[1]] || 0) + (best[0] === 'x' ? w : h + 14); });
    if (Object.keys(need.x).length + Object.keys(need.y).length) labelRoom = { ...room, lx: need.x, ly: need.y };
  }
  const groups = (dg.groups || []).map(g => {
    const ms = (g.nodes || []).map(i => byId[i]).filter(Boolean);
    if (!ms.length) return null;
    const P = 18;
    return { ...g, k: kindOf(g.kind || 'external'), x: Math.min(...ms.map(n => n.x)) - P, y: Math.min(...ms.map(n => n.y)) - P - 16,
      x2: Math.max(...ms.map(n => n.x + n.w)) + P, y2: Math.max(...ms.map(n => n.y + n.h)) + P };
  }).filter(Boolean);
  const xs = [...families.flatMap(f => [f.x,f.x+f.w]), ...(dg.lanes || []).flatMap(l => [l.x, l.x + l.w]), ...nodes.flatMap(n => [n.x - 14, n.x + n.w + 8]), ...groups.flatMap(g => [g.x, g.x2]), ...edges.flatMap(e => e.pts.map(p => p[0])), ...placed.flatMap(p => [p.x, p.x + p.w])];
  const ys = [...families.flatMap(f => [f.y,f.y+f.h]), ...(dg.lanes || []).flatMap(l => [l.y, l.y + l.h]), ...nodes.flatMap(n => [n.y - 14, n.y + n.h + (n.tag ? 18 : 8)]), ...groups.flatMap(g => [g.y, g.y2]), ...edges.flatMap(e => e.pts.map(p => p[1])), ...placed.flatMap(p => [p.y, p.y + p.h])];
  intake.forEach(b => { xs.push(b.cx - b.r - 8 - textW(b.label || '', 10.5), b.cx + b.r); ys.push(b.cy - b.r, b.cy + b.r); });
  if (!xs.length) xs.push(0), ys.push(0); // a view with nothing in it: an empty stage
  const M = 36, minX = Math.min(...xs) - M, minY = Math.min(...ys) - M;
  return { ms: __ms, ...(used ? { nested: true } : {}), ...(turns ? { turns: true } : {}), ...(grew ? { grew: true } : {}), ...(labelRoom ? { labelRoom } : {}), ...(rrSwap ? { rr: true } : {}), stats, nodes, edges, subAndChips: !!dg.subAndChips, groups, families, intake, tour: dg.tour || null, byId, map, hub: dg.hub || null, lanes: dg.lanes || [], blocks: dg.blocks || [], bounds: { x: minX, y: minY, w: Math.max(...xs) - minX + M, h: Math.max(...ys) - minY + M } };
}
// an issue's message, and what it is about (the cards, lines and boxes it names) when the caller keeps a list of that: check()
// turns those into Refs; the page's check reads only the messages
// a card or box by its label, else its id; a typed node with no text (a choice, a fork, a final node) by its id too
const nm = x => x.type ? x.label || x.id : x.label ?? x.id, name = e => `${nm(e.s)}→${nm(e.t)}`;
const teller = (issues, refs) => (message, ...about) => { issues.push(message); if (refs) refs.push(about); };
// a label's box L across one of box f's borders
const onBorder = (L, f) => { const xin = L.x + L.w > f.x && L.x < f.x + f.w, yin = L.y + L.h > f.y && L.y < f.y + f.h;
  return (xin && [f.y, f.y + f.h].some(u => L.y < u && L.y + L.h > u)) || (yin && [f.x, f.x + f.w].some(u => L.x < u && L.x + L.w > u)); };
// a detour: a route 2.5 times longer than the straight distance between its ends, or than 100 px; [its length, that distance]
const detour = pts => { const len = pts.slice(1).reduce((a, p, k) => a + Math.abs(p[0] - pts[k][0]) + Math.abs(p[1] - pts[k][1]), 0);
  const d = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]); return len > 2.5 * Math.max(d, 100) ? [len, d] : null; };
// behind a card a line meets on its side `side` (R, L, T or B): past the opposite side
const behind = (n, side, [x, y]) => side === 'R' ? x < n.x - .5 : side === 'L' ? x > n.x + n.w + .5 : side === 'B' ? y < n.y - .5 : y > n.y + n.h + .5;
// [the end, its side] that a line runs round: its route goes behind one of its own ends while its other end is not there. A
// long line passed the detour rule however it went round (clinic's reminder: over the patient, down its far side, under it)
const roundEnd = e => [[e.s, e.fs, e.pts[e.pts.length - 1]], [e.t, e.ts, e.pts[0]]].find(([n, side, far]) => n && side && !behind(n, side, far) && e.pts.some(p => behind(n, side, p)));
// a slanted segment (a timing view's message): exact tests in place of the axis-aligned ones below, which read it as level (audit 6)
const slant = (a, b) => a[0] !== b[0] && a[1] !== b[1], turn = (p, q, r) => { const t = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return Math.abs(t) < 1e-6 ? 0 : Math.sign(t); };
const slantCross = ([a, b], [c, d]) => { const o = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
  if (o.every(t => !t)) { const k = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1; // on one line: a shared run where they overlap
    return Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) - Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) > 1 ? 'share' : null; }
  return o[0] * o[1] < 0 && o[2] * o[3] < 0 ? 'cross' : null; };
// segment a-b through the inside of box r (Liang-Barsky); an axis-aligned one by its bounding box, as before
const segIn = (a, b, r) => { if (!(Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h)) return false;
  if (!slant(a, b)) return true; let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r.x], [dx, r.x + r.w - a[0]], [-dy, a[1] - r.y], [dy, r.y + r.h - a[1]]]) { const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
  return t0 < t1; };
function routeAudit(geo, where, only, refs) { // only: a set of edges; counts just the issues that involve one of them
  const sk = e => only && !only.has(e);
  const issues = [], say = teller(issues, refs);
  // routes: no crossings, no shared runs, no label lying across another route
  const segs = geo.edges.map(e => e.pts.slice(0, -1).map((a, i) => [a, e.pts[i + 1]]));
  const crossing = ([a, b], [c, d]) => {
    if (slant(a, b) || slant(c, d)) return slantCross([a, b], [c, d]);
    const av = a[0] === b[0], cv = c[0] === d[0];
    if (av === cv) { // parallel: overlapping collinear run = shared trunk
      if (av && Math.abs(a[0] - c[0]) < 1) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > 1 ? 'share' : null;
      if (!av && Math.abs(a[1] - c[1]) < 1) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > 1 ? 'share' : null;
      return null;
    }
    const [v, hz] = av ? [[a, b], [c, d]] : [[c, d], [a, b]];
    const x = v[0][0], y = hz[0][1];
    const inV = y > Math.min(v[0][1], v[1][1]) + .5 && y < Math.max(v[0][1], v[1][1]) - .5, inH = x > Math.min(hz[0][0], hz[1][0]) + .5 && x < Math.max(hz[0][0], hz[1][0]) - .5;
    return inV && inH ? 'cross' : null;
  };
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    if (geo.edges[i].fixed && geo.edges[j].fixed) continue; // one comb: its branches share the trunk by design
    if (sk(geo.edges[i]) && sk(geo.edges[j])) continue;
    let found = null;
    for (const s1 of segs[i]) { for (const s2 of segs[j]) { found = crossing(s1, s2); if (found) break; } if (found) break; }
    if (found === 'cross') say(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} cross`, geo.edges[i], geo.edges[j]);
    if (found === 'share') say(`${where}: edges ${name(geo.edges[i])} and ${name(geo.edges[j])} share a line`, geo.edges[i], geo.edges[j]);
  }
  geo.edges.forEach((e, i) => { if (!e.lbl) return; const L = { x: e.lbl.x + 1, y: e.lbl.y + 1, w: e.lbl.w - 2, h: e.lbl.h - 2 };
    geo.edges.forEach((o, j) => { if (j !== i && !(sk(e) && sk(o)) && segs[j].some(([a, b]) => segIn(a, b, L))) say(`${where}: label "${e.lbl.text || e.lbl.step}" lies on edge ${name(o)}`, e, o); }); });
  const segHit = (r, i) => segs[i].some(([a, b]) => segIn(a, b, r));
  if (geo.map) {
    const ex = 12, drawn = new Set(geo.edges.map(e => e.from + '>' + e.to)); // A→B and B→A both drawn: a pair the view keeps apart
    geo.edges.forEach((e, i) => {
      // clearance: a route keeps 12+ px from every node it does not connect
      geo.nodes.forEach(n => { if (n.id === e.from || n.id === e.to) return;
        if (segHit({ x: n.x - ex + .5, y: n.y - ex + .5, w: n.w + 2 * ex - 1, h: n.h + 2 * ex - 1 }, i)) say(`${where}: edge ${name(e)} passes within ${ex}px of node "${nm(n)}"`, e, n); });
      const dt = detour(e.pts); if (dt) say(`${where}: edge ${name(e)} takes a detour (${Math.round(dt[0])}px for ${Math.round(dt[1])}px)`, e);
      const r = roundEnd(e); if (r) say(`${where}: edge ${name(e)} runs round its own end "${nm(r[0])}"`, e, r[0].box ? (geo.families || []).find(f => f.id === r[0].id) : r[0]);
      // reading order: every wire runs left to right, except one that closes a loop or answers its pair (keepPairs)
      if (!e.back && !e.both && !drawn.has(e.to + '>' + e.from) && e.t.x + e.t.w / 2 <= e.s.x + e.s.w / 2) say(`${where}: edge ${name(e)} runs right-to-left`, e);
    });
    if (geo.hub) { // hub views: one visible line into each callee
      const into = Object.create(null); geo.edges.forEach(e => { (into[e.to] ||= []).push(e); });
      Object.entries(into).forEach(([id, es]) => { es = es.filter(e => !e.back); if (es.some(e => e.from === geo.hub) && es.length > 1) say(`${where}: hub callee "${(geo.byId[id] || {}).label || id}" has ${es.length} incoming lines`, geo.byId[id]); });
    }
  }
  // author name tags hang under their card: no route may run through one
  (geo.nodes || []).forEach(n => { if (!n.tag) return; const r = { x: n.tag.x + 1, y: n.tag.y + 1, w: n.tag.w - 2, h: n.tag.h - 2 };
    geo.edges.forEach((o, j) => { if (segHit(r, j)) say(`${where}: name tag "${n.tag.text}" lies on edge ${name(o)}`, n, o); }); });
  // lanes: every part sits inside its own lane, lanes never overlap, no route crosses a lane header
  const lanes = geo.lanes || [];
  lanes.forEach((l, i) => {
    lanes.slice(i + 1).forEach(m => { if (hit(l, m, -1)) say(`${where}: lanes "${l.title}" and "${m.title}" overlap`); });
    (geo.nodes || []).forEach(n => {
      if (n.lane === i && (n.x < l.x || n.x + n.w > l.x + l.w || n.y < l.y || n.y + n.h + (n.tag ? 14 : 0) > l.y + l.h)) say(`${where}: lane "${l.title}": node "${nm(n)}" sticks out`, n);
      if (n.lane != null && n.lane !== i && hit(n, l, -1)) say(`${where}: lane "${l.title}": node "${nm(n)}" of another lane sits in it`, n);
      if (n.lane == null && hit(n, l, -1)) say(`${where}: lane "${l.title}": node "${nm(n)}" belongs to no lane but sits in it`, n);
    });
  });
  (geo.blocks || []).forEach(b => geo.edges.forEach((o, j) => { if (segHit({ x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 }, j)) say(`${where}: lane "${b.title || ''}": header crossed by edge ${name(o)}`, o); }));
  const families = geo.families || [], inside = (a,b) => b.x > a.x && b.y > a.y && b.x+b.w < a.x+a.w && b.y+b.h < a.y+a.h;
  if (!only) boxOver(geo, (f, n) => say(`${where}: family "${nm(f)}" lies over "${nm(n)}", which it does not hold`, f, n));
  families.forEach(f => {
    const parent = families.find(p => p.id === f.parent);
    if (f.parent && (!parent || !inside(parent,f))) say(`${where}: family "${nm(f)}" sticks out of its parent`, f);
    (f.nodeIds || []).forEach(id => { const n = geo.byId[id]; if (n && !inside(f,n)) say(`${where}: family "${nm(f)}" does not contain "${nm(n)}"`, f, n); });
    families.filter(g => g !== f && g.parent === f.parent && g.id > f.id).forEach(g => { if (hit(f,g,-1)) say(`${where}: families "${nm(f)}" and "${nm(g)}" overlap`, f, g); });
    geo.edges.forEach((e,i) => { if (segHit({x:f.x+8,y:f.y+3,w:Math.min(f.w-16,linesW(f.label || f.id,11)+16),h:22+(!geo.map&&f.head||0)},i)) say(`${where}: family "${nm(f)}": header crossed by edge ${name(e)}`, f, e); });
    geo.edges.forEach((e,i) => { if (segs[i].some(([a,b]) => { const v = a[0] === b[0], c = v ? a[0] : a[1], p = v ? [a[1], b[1]] : [a[0], b[0]];
      const lo = Math.max(Math.min(...p), v ? f.y : f.x), hi = Math.min(Math.max(...p), v ? f.y + f.h : f.x + f.w);
      return hi - lo > 40 && (v ? [f.x, f.x + f.w] : [f.y, f.y + f.h]).some(u => Math.abs(c - u) < 8); })) say(`${where}: edge ${name(e)} runs along the border of family "${nm(f)}"`, e, f); });
    geo.edges.forEach(e => { const L = e.lbl; if (L && onBorder(L, f)) say(`${where}: label "${L.text || L.step}" sits on the border of family "${nm(f)}"`, e, f); });
  });
  return issues;
}

// a box over a card it does not hold, itself or through a box in it (audit 41: a pinned box grown round a card with no pin
// covered its neighbour, which then read as the box's own); a port by its owner, a frame that holds what it meets, a box's own card
function boxOver(geo, say) {
  const families = geo.families || [], fam = Object.create(null), upTo = (f, id) => { for (let k = 0, x = id; x != null && k <= families.length; x = (fam[x] || {}).parent, k++) if (x === f.id) return true; return false; };
  if (!families.length || !geo.nodes) return; families.forEach(f => { fam[f.id] = f; });
  const homes = Object.create(null); families.forEach(f => (f.nodeIds || []).forEach(id => { (homes[id] ||= []).push(f.id); }));
  families.forEach(f => geo.nodes.forEach(n => { if (n.id === f.id || n.holder || n.owner != null || !hit(f, n, -1) || (homes[n.id] || []).some(h => upTo(f, h))) return; say(f, n); }));
}
// what a typed view's pins may not do (audit 58): a box over a card it does not hold, two boxes in one box over each other, two
// cards over each other; the boxes and cards met (buildGeo, src/map/context.js, moves a pin that does any of them)
function boxClash(geo) {
  const met = new Set(), F = geo.families || [], refs = [], two = (a, b) => { met.add(a.id); met.add(b.id); };
  boxOver(geo, two);
  F.forEach((f, i) => F.slice(i + 1).forEach(g => { if (g.parent === f.parent && hit(f, g, -1)) two(f, g); }));
  overlapIssues(geo, '', refs); refs.forEach(([a, b]) => two(a, b));
  return met;
}
/* The layout check's geometry, which needs no fonts: check() runs it on layout()'s geometry, and the page adds what it
   measures in the DOM (text against its card, a lane's or box's title, edge labels against each other). */
const box = n => ({ x: n.x, y: n.y, w: n.w, h: n.h });
function overlapIssues(geo, where, refs) {
  const issues = [], nodes = geo.nodes, say = teller(issues, refs);
  const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
  const holds = (a, b) => (a.holder && inside(b, a)) || (b.holder && inside(a, b)) || !geo.map && ((a.owner || 0) === b.id || (b.owner || 0) === a.id); // a holder (a sequence's frame) may hold what it meets, not cross it; a port its owner
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (hit(box(nodes[i]), box(nodes[j]), -1) && !holds(nodes[i], nodes[j])) say(`${where}: nodes "${nm(nodes[i])}" and "${nm(nodes[j])}" overlap`, nodes[i], nodes[j]);
  return issues;
}
// a typed view's line through a card it does not join, its owner, its ports or a box round one of its ends (a map's 12 px
// clearance in routeAudit covers maps; a communication diagram's message rows sit on their own link (another link's are said, audit 14) and a timing view's marks on its lanes by design; kept out of routeAudit, which the layouts also score with, so no picture changes)
function throughIssues(geo, where, refs) {
  const issues = [], say = teller(issues, refs); if (geo.map) return issues;
  const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
  geo.edges.forEach(e => { const ends = [e.s, e.t].filter(Boolean), P = e.pts || [];
    geo.nodes.forEach(n => { if (n.holder || n.shape === 'message-row' && (e.stack || []).includes(n.id) || /^tm-/.test(n.shape) || ends.some(m => m === n || n.owner === m.id || m.owner === n.id || inside(m, n) || inside(n, m))) return;
      if (P.some((a, k) => k && Math.max(a[0], P[k - 1][0]) > n.x + 1 && Math.min(a[0], P[k - 1][0]) < n.x + n.w - 1 && Math.max(a[1], P[k - 1][1]) > n.y + 1 && Math.min(a[1], P[k - 1][1]) < n.y + n.h - 1))
        say(`${where}: edge ${name(e)} passes through card "${nm(n)}"`, e, n); });
    // a line out of a box (an open package, a node) to something outside it that runs back inside that box past its first and
    // before its last run (audit 27: the router shuts the box to it; what it cannot avoid is said, as a map's roundEnd is)
    if (!e.inner) [[e.s, e.t], [e.t, e.s]].forEach(([b, o]) => { if (!b || !b.box || !o || inside(o, b)) return;
      if (P.some((a, k) => k > 1 && k < P.length - 1 && Math.max(a[0], P[k - 1][0]) > b.x + 1 && Math.min(a[0], P[k - 1][0]) < b.x + b.w - 1 && Math.max(a[1], P[k - 1][1]) > b.y + 1 && Math.min(a[1], P[k - 1][1]) < b.y + b.h - 1))
        say(`${where}: edge ${name(e)} runs back inside its own box "${nm(b)}"`, e, (geo.families || []).find(f => f.id === b.id) || b); }); });
  return issues;
}
function leaveIssues(geo, where, refs) {
  const issues = [], say = teller(issues, refs);
  // a labelled line, on a map or a typed view, whose label found no spot at all: not drawn, so said (audit 6). A numbered
  // view's comb line with no label has its step on its card; a timing view's message's `label` is its text and times, which
  // it edits (its drawn label, in lbl, is always placed)
  if (!geo.tr) geo.edges.forEach(e => { if (!e.lbl && (e.label || e.step != null && !e.fixed)) say(`${where}: ${e.label ? `label "${e.label}"` : `step ${e.step}`} has no room on edge ${name(e)}: not drawn`, e); });
  // a numbered line's label with no room on it: only its step shows, its words in the line's title and the details only; on a
  // map or a typed view (a C4 dynamic view's step, its lbl.step null there: audit 23)
  // a line the view shows that its type leaves out of the picture (geo.notDrawn: BPMN's, audit 27)
  (geo.notDrawn || []).forEach(x => say(`${where}: ${x.what}: not drawn`, x));
  if (!geo.tr) geo.edges.forEach(e => { if (e.label && e.lbl && e.lbl.short) say(`${where}: label "${e.label}" has no room on edge ${name(e)}: only its step ${e.lbl.step ?? e.step} shows`, e); });
  if (geo.map) geo.edges.forEach(e => { const L = e.lbl; if (!L || (!e.label && L.step == null) || !e.pts) return; // a label, or a step's mark, must leave some of its own line visible
    const c = [L.x + L.w / 2, L.y + L.h / 2], P = e.pts; let s = 0, at = null, half = 0, tot = 0;
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (at == null) { const onH = a[1] === b[1] && Math.abs(c[1] - a[1]) < 2 && c[0] >= Math.min(a[0], b[0]) - 1 && c[0] <= Math.max(a[0], b[0]) + 1;
        const onV = a[0] === b[0] && Math.abs(c[0] - a[0]) < 2 && c[1] >= Math.min(a[1], b[1]) - 1 && c[1] <= Math.max(a[1], b[1]) + 1;
        if (onH || onV) { at = tot + Math.abs(c[0] - a[0]) + Math.abs(c[1] - a[1]); half = onH ? L.w / 2 : L.h / 2; } }
      tot += len; }
    if (at == null) return; const room = Math.min(at - half, tot - at - half);
    if (room < 16) say(`${where}: label "${e.label || L.step}" leaves its line ${Math.max(0, Math.round(room))} px (${name(e)})`, e); });
  return issues;
}

/* label-overlap audit used by `visual.py check` (world coordinates, real font metrics) */
function auditSvg(svg, geo, where) {
  const issues = overlapIssues(geo, where), R = box;
  const T = [...svg.querySelectorAll('text[data-t]')].map(t => { let b; try { b = t.getBBox(); } catch (_) { return null; } return { t: t.dataset.t, o: t.dataset.o, txt: t.textContent, b: { x: b.x, y: b.y, w: b.width, h: b.height } }; }).filter(x => x && x.b.w);
  const nodes = geo.nodes.filter(n => !n.holder), faces = Object.fromEntries([...svg.querySelectorAll('.node[data-face]')].map(g => [g.dataset.id, g.dataset.face.split(' ').map(Number)])); // a shape's face (0.15.0)
  T.forEach(a => {
    if (a.t === 'lt' || a.t === 'ft') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: lane "${a.txt}": header covers node "${nm(n)}"`); });
      if (a.t === 'ft') { const f = (geo.families || []).find(f => f.id === a.o); if (f && (a.b.x < f.x || a.b.x+a.b.w > f.x+f.w)) issues.push(`${where}: family title "${a.txt}" overflows its box`); }
    } else if (a.t === 'el') {
      nodes.forEach(n => { if (hit(a.b, R(n), -1)) issues.push(`${where}: edge label "${a.txt}" covers node "${nm(n)}"`); });
    } else {
      const own = geo.byId[a.o];
      if (own && (a.b.x < own.x + 1 || a.b.x + a.b.w > own.x + own.w - 1)) issues.push(`${where}: text "${a.txt}" overflows node "${nm(own)}"`);
      const face = own && faces[own.id], fy = face ? (face[0] + face[1]) / 2 : own && own.y + own.h / 2; // a shape's mark and text keep to its face
      if (own && geo.map && (a.t === 'nl' || a.t === 'ns') && hit(a.b, { x: own.x + 11, y: fy - 17, w: 34, h: 34 }, 2)) issues.push(`${where}: text "${a.txt}" touches the mark on node "${nm(own)}"`);
      if (face && (a.b.y < face[0] - 1 || a.b.y + a.b.h > face[1] + 1)) issues.push(`${where}: text "${a.txt}" overflows the shape of node "${nm(own)}"`);
      nodes.forEach(n => { if (n !== own && hit(a.b, R(n), -1)) issues.push(`${where}: text "${a.txt}" overlaps node "${nm(n)}"`); });
    }
  });
  svg.querySelectorAll('rect.verb-chip').forEach(r => { const own = geo.byId[r.closest('[data-id]').dataset.id], x = +r.getAttribute('x'); // a chip's pill, not only its text (#84)
    if (own && (x < own.x + 1 || x + +r.getAttribute('width') > own.x + own.w - 1)) issues.push(`${where}: chip "${r.nextElementSibling.textContent}" overflows node "${nm(own)}"`); });
  issues.push(...routeAudit(geo, where), ...throughIssues(geo, where), ...leaveIssues(geo, where));
  const els = T.filter(a => a.t === 'el');
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) if (hit(els[i].b, els[j].b, -1)) issues.push(`${where}: edge labels "${els[i].txt}" and "${els[j].txt}" overlap`);
  return issues;
}
/* ================= diagram engine (shared by document diagrams and the map) =================
   Style adapted from tt-a1i/archify (MIT): semantic palette, opaque mask under a translucent
   fill, per-kind sigils, grid canvas, orthogonal rounded routes, arrow markers. */
const KIND = {
  frontend: ['cyan', 'Client / UI', 'people and screens'], backend: ['green', 'Service / API', 'runs the logic'], database: ['violet', 'Data store', 'keeps data'],
  cloud: ['amber', 'Infra / Cloud', 'hosts, observability'], security: ['rose', 'Auth / Security', 'checks and holds secrets'], queue: ['orange', 'Queue / Event', 'hands work on'],
  external: ['slate', 'External', 'outside the system'], file: ['slate', 'File / Doc', 'a document or config'], ai: ['fuchsia', 'Agent / AI', 'an agent or model'],
  // map-mode kinds (skill / architecture maps)
  'm-public': ['k-public', 'Public skill', 'you run it'], 'm-lane': ['k-lane', 'Board lane', 'the board starts it'],
  'm-ext': ['k-ext', 'External skill', 'from another pack'], 'm-verb': ['k-verb', 'Impeccable verb', 'a design command'],
  'm-script': ['k-script', 'Script', 'code a skill runs'], 'm-hook': ['k-hook', 'Hook / guard', 'fires on its own'],
  'm-board': ['k-board', 'State', 'board, config, ledgers'],
  'm-step': ['k-public', 'Process step', 'open for implementation details'],
};
const MAPK = { /* umlimator */ public: 'm-public', lane: 'm-lane', script: 'm-script', 'skill-dep': 'm-ext', dep: 'm-ext', verb: 'm-verb', step: 'm-step', hook: 'm-hook', guard: 'm-hook', board: 'm-board', state: 'm-board' };
const ALIAS = { client: 'frontend', ui: 'frontend', web: 'frontend', page: 'frontend', browser: 'frontend', app: 'frontend', person: 'frontend', mobile: 'frontend',
  api: 'backend', service: 'backend', server: 'backend', function: 'backend', endpoint: 'backend', route: 'backend', script: 'backend', cli: 'backend', worker: 'backend', module: 'backend', package: 'backend',
  db: 'database', store: 'database', storage: 'database', cache: 'database', table: 'database', data: 'database',
  infra: 'cloud', cdn: 'cloud', deploy: 'cloud', host: 'cloud', ci: 'cloud',
  auth: 'security', secret: 'security', policy: 'security', guard: 'security', hook: 'security',
  bus: 'queue', event: 'queue', stream: 'queue', webhook: 'queue', cron: 'queue', job: 'queue',
  user: 'external', human: 'external', thirdparty: 'external', vendor: 'external',
  doc: 'file', config: 'file', skill: 'file', md: 'file', template: 'file', output: 'file',
  agent: 'ai', llm: 'ai', model: 'ai' };
const hasKey = (o, k) => Object.hasOwn(o, k); // a table's own key: "constructor" or "__proto__" is no kind or shape
const kindOf = (k, map) => { k = String(k || '').toLowerCase(); if (map && hasKey(MAPK, k)) return MAPK[k]; return hasKey(KIND, k) ? k : hasKey(ALIAS, k) ? ALIAS[k] : map ? 'm-script' : 'backend'; };
const SIGIL = {
  frontend: '<rect x="2" y="3" width="12" height="8.5" rx="1.2"/><path d="M5.5 14h5M8 11.5V14"/>',
  backend: '<rect x="2.5" y="2.5" width="11" height="4.5" rx="1"/><rect x="2.5" y="9" width="11" height="4.5" rx="1"/><path d="M5 4.75h.01M5 11.25h.01"/>',
  database: '<ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
  cloud: '<path d="M4.3 12.5h7.3a2.4 2.4 0 0 0 .2-4.8 4 4 0 0 0-7.5-1.3A3.1 3.1 0 0 0 4.3 12.5Z"/>',
  security: '<path d="M8 2.2 13 4v3.5c0 3.1-1.8 5.4-5 6.5-3.2-1.1-5-3.4-5-6.5V4Z"/><path d="m5.8 8 1.5 1.5 3-3"/>',
  queue: '<path d="M2 5h8M2 8h11M2 11h8"/><path d="m11 3.5 2 1.5-2 1.5M11 9.5l2 1.5-2 1.5"/>',
  external: '<rect x="2.5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M8 2.5h5.5V8M13.5 2.5 7.5 8.5"/>',
  file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3M6 8.5h4M6 11h4"/>',
  ai: '<path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z"/>',
  'm-public': '<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.8"/><path d="m4.6 6.3 2 1.8-2 1.8M8.4 10.4h3"/>',
  'm-lane': '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.2h12M2 9.8h12"/><path d="m9.5 3.4 1.2.95-1.2.95"/>',
  'm-script': '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/><path d="m7 8.3-1.5 1.6L7 11.5M9 8.3l1.5 1.6L9 11.5"/>',
  'm-ext': '<path d="M6.6 9.4 9.4 6.6"/><path d="m7.2 4.6 1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M8.8 11.4l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/>',
  'm-hook': '<path d="M8 2.2 13 4v3.5c0 3.1-1.8 5.4-5 6.5-3.2-1.1-5-3.4-5-6.5V4Z"/><path d="m5.8 8 1.5 1.5 3-3"/>',
  'm-verb': '<path d="M3 13 9.5 6.5M8 3l.7 1.6L10.3 5.3 8.7 6 8 7.6 7.3 6 5.7 5.3 7.3 4.6zM12 8.5l.45 1.05L13.5 10l-1.05.45L12 11.5l-.45-1.05L10.5 10l1.05-.45z"/>',
  'm-step': '<path d="M2 8h11M9 4l4 4-4 4"/>',
  'm-board': '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 2.5v11M10 2.5v11"/><path d="M3.4 5.2h1.2M7.4 5.2h1.2M7.4 7.6h1.2M11.4 5.2h1.2"/>',
  // a shape's own mark (0.15.0), for a card with no icon whose shape says more than its kind does
  person: '<circle cx="8" cy="5.2" r="2.7"/><path d="M3 13.6c.5-2.7 2.5-4.2 5-4.2s4.5 1.5 5 4.2"/>',
  robot: '<rect x="3" y="5.2" width="10" height="8" rx="1.8"/><path d="M8 5.2V3M6.2 9.2h.01M9.8 9.2h.01M1.6 9.2h1.4M13 9.2h1.4"/>',
  mobile: '<rect x="4.4" y="1.8" width="7.2" height="12.4" rx="1.5"/><path d="M7.3 11.9h1.4"/>',
  terminal: '<rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.6"/><path d="m4.6 6.2 2 1.8-2 1.8M8.4 10.2h3"/>',
  folder: '<path d="M2 4.3c0-.7.5-1.2 1.2-1.2h3l1.4 1.6h5.2c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2H3.2C2.5 13.3 2 12.8 2 12.1Z"/>',
  node: '<path d="M2.4 5.6 5 3h8.6v7.4L11 13H2.4Z"/><path d="M2.4 5.6H11V13M11 5.6 13.6 3"/>',
};
/* ================= card shapes (0.15.0; one style since 0.21.0) =================
   Maps draw each card as a shape (the union of what the C4 model's tools and UML 2.5 draw): people, browser apps, phones,
   terminals, queues, packages, hosts, robots, data stores, files and hooks, and a rounded box where no shape says more. A
   card's own `shape` wins. Each shape is drawn inside its card's own box, so layout, routing, widths and the layout check
   never see it: an outline (for the mask, the body, the stack, rings, the minimap and the glow), a face (the rows its mark
   and text use), details drawn over the body (one of them its accent, which lights as something arrives) and
   inset(side, t), how far inside the box's side the outline runs at t, which slides a line's end from the box onto the outline. */
// the shape a card is drawn as: by the kind word the model wrote, then by the kind it means (docs/module-api.md)
const NOTED = { person: 'person', user: 'person', human: 'person', agent: 'robot', mobile: 'mobile', cli: 'terminal', frontend: 'browser',
  queue: 'pipe', module: 'folder', package: 'folder', cloud: 'node', database: 'cylinder', file: 'document', 'm-hook': 'hexagon' };
/* The map: today's notation, and the default diagram type. A view of a version-1 model, or a version-2 view with no
   `diagram`, is a map and takes exactly today's code path. */
const MAP = registerDiagramType('map', { title: 'architecture map' });

/* A typed view whose diagram this release does not draw becomes a plain map view of its nodes, so it still shows what
   it holds (risks.md M13): its nodes as cards, and its typed lines between them, a line that ends on a member drawn to
   the node that owns it. Fragments, timelines and `present` are not drawn. Works on the copy of the model that
   mapContext makes; a version-1 model, or one whose typed views are all of known types, is left as it is. */
function plainViews(D) {
  const views = Array.isArray(D.views) ? D.views.filter(v => v && typeof v === 'object') : [];
  if (D.schemaVersion !== 2 || !views.some(v => v.diagram != null && !diagramOf(v))) return;
  const ownerOf = Object.create(null), own = (x, top) => { // a stack: members thousands deep (audit 62)
    for (const s = [x], seen = new Set(); s.length;) { const y = s.pop(); for (const m of Array.isArray(y.members) ? y.members : []) if (m && typeof m.id === 'string' && !seen.has(m)) { seen.add(m); ownerOf[m.id] = top; s.push(m); } } };
  (Array.isArray(D.nodes) ? D.nodes : []).forEach(n => { if (n && typeof n.id === 'string') own(n, n.id); });
  // the view's own copies of its lines, so a map view of the same model sees the model's lines as they are
  const byId = new Map((Array.isArray(D.edges) ? D.edges : []).filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  const toNodes = e => { const x = typeof e === 'string' ? byId.get(e) : e; if (!x || typeof x !== 'object') return e;
    const y = { ...x }; ['from', 'to'].forEach(k => { if (ownerOf[y[k]] != null) y[k] = ownerOf[y[k]]; }); return y; };
  views.forEach(v => { if (v.diagram == null || diagramOf(v)) return;
    warn(`view "${v.id}": diagram "${v.diagram}" is not drawn by this release; its nodes are drawn as plain cards`);
    v.edges = (Array.isArray(v.edges) ? v.edges : Array.isArray(D.edges) ? D.edges : []).map(toNodes);
    delete v.diagram; });
}
/* wire kinds on maps: colour says what the line means; state reads/writes stay light */
const WIRES = [['calls', 'calls', 'runs or invokes it'], ['feeds', 'feeds', 'hands work on'], ['triggers', 'triggers', 'suggests, offers, fires'], ['state', 'state', 'reads or writes a file, board, config'], ['guard', 'guard', 'a hook steps in']];
// a node's badges: `badges` (strings or {text, tone}), else the single `badge`
const badgesOf = n => (Array.isArray(n.badges) && n.badges.length ? n.badges : n.badge ? [n.badge] : [])
  .map(b => b && typeof b === 'object' ? { text: String(b.text ?? ''), tone: b.tone } : { text: String(b ?? '') }).filter(b => b.text);
const toneOf = b => { if (b.tone) return 'var(--um-' + String(b.tone).replace(/[^\w-]/g, '') + ')'; const w = b.text.toUpperCase().split('·')[0].trim();
  return 'var(--um-' + (['BUILT', 'DECIDED'].includes(w) ? 'green' : ['PARTIAL', 'OPEN', 'OPT-IN'].includes(w) ? 'amber' : w === 'NOT BUILT' ? 'rose'
    : ['PROPOSED', 'AGREED', 'TARGET'].includes(w) ? 'accent' : 'slate') + ')'; };
// the tabs on a card's top border, left to right: its badges, else what its kind says (public, external, lane)
const mapTabs = (n, c) => { const tw = t => t.toUpperCase().length * 6.4 + 10, b = badgesOf(n); // the text as given: the sheet upper-cases it (#43)
  if (b.length) return b.map((x, i) => ({ text: x.text, fill: toneOf(x), badge: i, w: tw(x.text) }));
  const t = n.k === 'm-public' ? 'PUBLIC' : n.k === 'm-ext' ? 'EXTERNAL' : n.k === 'm-lane' ? 'LANE' : ''; return t ? [{ text: t, fill: c, w: tw(t) }] : []; };
const mapNodeW = n => {
  const px = n.emphasis ? 15 : 13;
  const sub = n.sub || n.sublabel || '', chips = (n.verbs || []).reduce((a, v) => a + textW(v, 9.5) + 14, -4); // its chips as svgOf draws them: each verb and 10 px, 4 px apart (#84)
  return Math.min(n.emphasis ? 205 : 386, Math.max(n.emphasis ? 146 : 138,
    Math.ceil(textW(n.label, px) + 70), badgesOf(n).length ? Math.ceil(badgesOf(n).reduce((a, b) => a + b.text.length * 6.4 + 10, 0) + (badgesOf(n).length - 1) * 4 + 120) : 0,
    Math.min(386, Math.ceil(Math.max(textW(sub, 10), chips) + 70))));
};
/* Swimlanes for run-order views. A view may set `lanes` ([{title, nodeIds}] or false); otherwise a
   sequence view is read step by step and each part is filed under the first workflow phase its own
   label (then the step's label, then its sub line) names. Phases only move forward, so a lane is a
   contiguous stretch of the run order. Fewer than three lanes, or a lane layout that would need a
   crossing, falls back to the free graph. */
const PHASES = [
  ['Ask', /\b(grill|ask|interview|question|intake|taste|intent|clarif)/i],
  ['Plan', /\b(plan|spec\b|scope|claim|triage|ticket|backlog)/i],
  ['Build', /\b(build|implement|launch|scaffold|develop)/i],
  ['Check', /\b(check|review|detect|shots?\b|screenshot|audit|test|qa\b|verif|critique|lint|scan|grade)/i],
  ['Fix', /\b(fix|polish|refine|repair|patch|rework)/i],
  ['Finish', /\b(pr\b|pull request|merge|ship|publish|release|deploy|human|ledger|manifest|report)/i],
];
function phaseOf(texts) {
  for (const t of texts) {
    let best = null;
    PHASES.forEach((p, i) => { const m = p[1].exec(String(t || '')); if (m && (!best || m.index < best[1])) best = [i, m.index]; });
    if (best) return best[0];
  }
  return null;
}

/* ================= map: one model, many views =================
   Viewer UX ported in spirit from archify (MIT): camera with reading depths, minimap, node focus,
   node finder, export. Drill-down views, swimlanes, breadcrumbs and deep links are super-board's /visual. */

// every model edge gets an id for events: its own, else "<from>-><to>#<n>" (n: its place among edges with the same ends)
// by-id maps with no prototype, so an id named __proto__, constructor or toString is a key like any other (M3, audit 8)
// what marks() put a change on, which it takes off again when a type's kept drawing is drawn for another model (a memo outlives its context)
const MARKED = new WeakSet();
const O = () => Object.create(null), byId = es => Object.assign(O(), Object.fromEntries(es));
function edgeIds(list) {
  const seen = {};
  (list || []).forEach(e => { if (!e || typeof e !== 'object') return; const k = e.from + '->' + e.to, n = seen[k] = (seen[k] ?? -1) + 1; e._id = e.id != null ? String(e.id) : `${k}#${n}`; });
}

// on a map view, whether box b holds the card or box x: no line joins the two (layered.js), so the view leaves such a
// line out of what it says it draws (describe, rules, the print's tables), and validate() warns of it
function boxHolds(v) {
  const by = O(), at = O(); // a box by id; the boxes that list a card
  (Array.isArray(v.containers) ? v.containers : []).forEach(c => { if (!c || c.id == null || by[c.id]) return; by[c.id] = c;
    (Array.isArray(c.nodeIds) ? c.nodeIds : []).forEach(id => (at[id] ||= []).push(c.id)); });
  const holds = (b, x) => { for (const s = by[x] ? [by[x].parent] : [...(at[x] || [])], seen = new Set(); s.length;) { const p = s.pop(); // a walk up, not recursion: boxes nested any deep
    if (p === b) return true; if (by[p] && !seen.has(p)) { seen.add(p); s.push(by[p].parent); } } return false; };
  return (b, x) => (v.diagram == null || v.diagram === 'map') && !!by[b] && holds(b, x); // b is a box that holds x
}

// how many elements a typed view draws, as the page's view pill, its About box and the views list count them (audit 37): its
// laid-out nodes that are model elements, less the pieces a type draws on or in another (a port, an operand, a fragment's
// frame, a message's row; a timing view's rows, changes and ruler carry no type), and its boxes, once each. null for a map,
// whose every laid-out node is a card. An element with no type that the view lists counts too (a flowchart's or C4 view's
// untyped element, drawn by its default word: audit 38); a box that names no element does not (a SysML bdd or requirement
// view's diagram frame, "<view>->frame": no element id holds "->")
const PIECES = new Set(['port', 'operand', 'frame', 'use', 'message-row']);
const elementCount = (v, g) => { if (!v || v.diagram == null || v.diagram === 'map' || !g) return null; const ids = new Set(), listed = new Set(arrOf(v.nodeIds));
  const isEl = id => !String(id).includes('->');
  arrOf(g.nodes).forEach(n => { if (n && !PIECES.has(n.shape) && ((typeof n.type === 'string' && n.type) || (n.type == null && listed.has(n.id) && isEl(n.id)))) ids.add(n.id); });
  arrOf(g.families).forEach(f => { if (f && f.id != null && isEl(f.id)) ids.add(f.id); }); return ids.size; };

/* The model's views and everything that lays one out. Works on its own copy of the model, needs no DOM. */
function mapContext(model, opts = {}) {
  const D = copyOf(unreadable(migrate(model)).model || {}); // a newer schemaVersion throws: drawn wrongly otherwise (F6); no text String() throws on (audit 19)
  plainViews(D); // typed views of a diagram this release does not draw: plain cards
  const M = opts.measure || null, withM = f => (...a) => measured(M, () => f(...a));
  // a field that must be a list and is not (validate() says so) is left out, as a missing one is
  const lists = (o, ks) => o && ks.forEach(k => { if (o[k] != null && !Array.isArray(o[k])) delete o[k]; });
  // an entry that is no object (validate() says so) is left out, as a null view is: the rest draws (audit 9)
  const objs = (o, k) => { if (o && Array.isArray(o[k])) o[k] = o[k].filter(x => x && typeof x === 'object'); };
  lists(D, ['nodes', 'edges', 'views']); ['nodes', 'edges', 'views'].forEach(k => objs(D, k)); D.views = D.views || [];
  D.views.forEach(v => ['nodes', 'containers'].forEach(k => objs(v, k)));
  // a number is drawn as written (validate()'s label check): as text, so every later `label || id` reads 0 as a label, not as none (audit 30);
  // a boolean too, drawn "false": its card's tooltip and its lines' names said the id (audit 33)
  const written = x => { if (x && typeof x === 'object' && (typeof x.label === 'number' || typeof x.label === 'bigint' || typeof x.label === 'boolean')) x.label = String(x.label); };
  [D.nodes, D.edges].forEach(l => Array.isArray(l) && l.forEach(written));
  D.views.forEach(v => { [v.nodes, v.edges, v.containers, v.lanes].forEach(l => Array.isArray(l) && l.forEach(written)); if (v.nodeOverrides && typeof v.nodeOverrides === 'object') Object.values(v.nodeOverrides).forEach(written); });
  edgeIds(D.edges); D.views.forEach(v => { if (Array.isArray(v.edges)) edgeIds(v.edges); });
  const views = D.views.filter(v => v.id);
  const nodes = [...(D.nodes || []), ...views.flatMap(v => v.nodes || [])];
  views.forEach(v => { lists(v, ['nodeIds', 'containers', 'intake', 'stepIds', 'tour', 'browserOrder']); [...(v.containers || []), ...(Array.isArray(v.lanes) ? v.lanes : [])].forEach(c => lists(c, ['nodeIds'])); Object.values(v.nodeOverrides || {}).forEach(o => lists(o, ['verbs'])); }); nodes.forEach(n => lists(n, ['verbs']));
  // by id, with no prototype: a node or view named constructor is no view an element opens (M3, audit 7)
  const N = byId(nodes.map(n => [n.id, n]));
  const V = byId(views.map(v => [v.id, v]));
  const viewOfParent = p => V[p] ? p : (views.find(v => v.id === p || v.node === p) || {}).id; // parent may name a node
  views.forEach(v => { if (v.parent) v.parent = viewOfParent(v.parent) || null; });
  const rootId = (D.root && V[D.root]) ? D.root : (views.find(v => !v.parent) || views[0] || {}).id;
  const nodeIn = (nid, vid) => ({ ...(N[nid] || {}), ...((V[vid] || {}).nodeOverrides || {})[nid] });
  const childOf = (nid, vid) => { const n = nodeIn(nid, vid); const o = n.view || n.opensView; return o && V[o] ? o : V[nid] ? nid : (views.find(v => v.node === nid) || {}).id; };
  const opensOf = (nid, vid) => { const n = nodeIn(nid, vid), o = childOf(nid, vid) || n.view || n.opensView; return o != null && String(o) !== vid ? String(o) : null; }; // loaded or not (#47)
  const subjectOf = v => v.node || (N[v.id] ? v.id : null);
  const viewsWith = nid => views.filter(v => (v.nodeIds || []).includes(nid));
  const kidsOf = id => views.filter(x => (x.parent || null) === id);
  const chain = vid => { const out = []; let c = V[vid]; const seen = new Set(); while (c && !seen.has(c.id)) { seen.add(c.id); out.unshift(c.id); c = V[c.parent]; } return out; };
  const viewEdges = (v, say) => { // an edge's ends are cards of the view or its containers; say: warn of one left out for joining a box and what it holds
    const ids = new Set([...(v.nodeIds || []), ...(v.containers || []).map(c => c && c.id).filter(Boolean)]);
    const list = Array.isArray(v.edges) ? v.edges : (D.edges || []).filter(e => ids.has(e.from) && ids.has(e.to));
    const once = new Set(); // a line id listed twice is one line, drawn once (audit 7)
    const inside = boxHolds(v), apart = e => { const b = inside(e.from, e.to) ? e.from : inside(e.to, e.from) ? e.to : null;
      if (b != null && say) warn(`no line for edge ${e.id ?? e.from + '->' + e.to}: it joins the box "${b}" and something inside it`); return b == null; };
    return list.filter(e => typeof e !== 'string' || !once.has(e) && once.add(e)).map(e => typeof e === 'string' ? (D.edges || []).find(x => x.id === e) : e).filter(e => e && ids.has(e.from) && ids.has(e.to) && apart(e));
  };
  /* ---------- reading order: every view runs left → right ----------
     The trigger sits at the far left; each next step or callee goes one column to the right, branches
     stack inside a column, state (board, config, repo) sits at the end of its column. A view whose
     focus node starts three or more things is a hub: its callees go into phase lanes, and one comb of
     lines feeds them — a single trunk, one split per lane, one short branch per callee with its label
     just left of the callee. A line that closes a loop is the only one allowed to run right to left. */
  const HUB_PHASES = [
    ['Prepare', /\b(grill|ask|interview|plan|spec|scope|shape|sharpen|ladder|docs?\b|reads?\b|design|picks?|init|triage|on-ramp|vocabular|idea|requires|climbs)/i],
    ['Build', /\b(build|implement|routes?|test|tdd|writes?|fix|diagnos|resolv|fetch|runs?\b|prototype|split|code|finds?|drafts?|bridges?|wires?)/i],
    ['Check', /\b(review|verif|proves?|audit|critique|judge|coverage|polish|humaniz|hunts?|checks?|grades?)/i],
    ['Hand off', /\b(pr\b|moves? card|files?\b|board|merges?|gate|closes?|bounces?|ships?|posts?|parks?|ticks|updates|backlog)/i],
  ];
  const latestPhase = texts => { for (const t of texts) { let best = null; HUB_PHASES.forEach((p, i) => { if (p[1].test(String(t || ''))) best = i; }); if (best != null) return best; } return null; };
  const isState = id => (N[id] || {}).kind === 'board';
  function loopsOf(v) { // edges that close a cycle, found depth-first in run order from the roots
    const ids = (v.nodeIds || []).filter(i => N[i]), edges = viewEdges(v), back = new Set(), st = O();
    edges.forEach((e, k) => { if (e.loop) back.add(k); }); // an edge marked `loop: true` is the view's loop back
    const dfs = u => { const fr = [[u, 0]]; st[u] = 1; // a stack of frames, not recursion: a chain of any length
      while (fr.length) { const f = fr[fr.length - 1]; if (f[1] === edges.length) { fr.pop(); st[f[0]] = 2; continue; }
        const k = f[1]++, e = edges[k]; if (e.from !== f[0] || e.from === e.to || e.loop) continue; if (st[e.to] === 1) back.add(k); else if (!st[e.to]) { st[e.to] = 1; fr.push([e.to, 0]); } } };
    [...ids.filter(i => !edges.some(e => e.to === i && e.from !== i && !e.loop)), ...ids].forEach(i => { if (!st[i]) dfs(i); });
    if (v.render === 'sequence') { // run order: a step back to a part an earlier step already reached loops back (state may be written again later)
      const first = O(); edges.forEach((e, k) => { if (first[e.from] == null && !edges.some((x, j) => j < k && x.to === e.from)) first[e.from] = -1; if (first[e.to] == null) first[e.to] = k; });
      edges.forEach((e, k) => { if (first[e.to] < k && !isState(e.to) && e.from !== e.to) back.add(k); });
    }
    return { edges, back, keys: new Set(edges.filter((e, k) => back.has(k)).map(e => e.from + '>' + e.to)) };
  }
  function deriveLanes(v, hub) { // sequence views: lanes named by workflow phase, in run order
    if (v.lanes === false) return null;
    const ids = (v.nodeIds || []).filter(i => N[i]), edges = viewEdges(v);
    if (Array.isArray(v.lanes)) {
      const lanes = v.lanes.map(l => ({ title: [labelOr(labelOr(l.title, l.label), '')].map(t => typeof t === 'number' ? String(t) : t)[0], ids: (l.nodeIds || []).filter(i => ids.includes(i) && i !== hub) })).filter(l => l.ids.length);
      return lanes.length ? { lanes, explicit: true } : null;
    }
    if (v.render !== 'sequence' || edges.length < 4) return null;
    const lanes = [], laneOf = O(), pending = [];
    let curP = -1, named = 0, filed = 0;
    const file = (id, p) => {
      filed++; if (p != null) named++;
      if (p == null) { if (!lanes.length) { pending.push(id); return; } lanes[lanes.length - 1].ids.push(id); laneOf[id] = lanes.length - 1; return; }
      if (p > curP) { curP = p; lanes.push({ title: PHASES[p][0], ids: [] }); }
      lanes[lanes.length - 1].ids.push(id); laneOf[id] = lanes.length - 1;
    };
    edges.forEach(e => [e.from, e.to].forEach(id => {
      if (id === hub || laneOf[id] != null || pending.includes(id)) return;
      const n = N[id];
      file(id, phaseOf([n.label, id === e.to ? e.label : '', n.sublabel || n.sub]));
    }));
    if (lanes.length < 3 || lanes.length > 6 || named < filed * 0.6) return null; // lanes only when most parts name their phase
    lanes[0].ids.unshift(...pending);
    ids.forEach(i => { if (i !== hub && laneOf[i] == null && !pending.includes(i)) lanes[lanes.length - 1].ids.push(i); });
    return { lanes };
  }
  function hubPlan(v, hub, lp) {
    const ids = (v.nodeIds || []).filter(i => N[i] && i !== hub), seq = v.render === 'sequence';
    const fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    const callees = []; lp.edges.forEach(e => { if (e.from === hub && e.to !== hub && !callees.includes(e.to)) callees.push(e.to); });
    const laneOf = O(); let titles = [], boxed = true;
    const dl = deriveLanes(v, hub);
    if (dl) { titles = dl.lanes.map(l => l.title); dl.lanes.forEach((l, i) => l.ids.forEach(id => { laneOf[id] = i; })); }
    else if (seq) { // run order, three to a column
      boxed = false;
      const stepOf = id => lp.edges.findIndex(e => e.from === hub && e.to === id) + 1;
      callees.forEach((id, k) => { laneOf[id] = Math.floor(k / 3); });
      for (let i = 0; i * 3 < callees.length; i++) { const grp = callees.slice(i * 3, i * 3 + 3).map(stepOf); titles.push(grp.length > 1 ? `Steps ${grp[0]}–${grp[grp.length - 1]}` : `Step ${grp[0]}`); }
    } else { // by the kind of work the line names; unnamed ones follow the previous callee
      let prev = 1;
      lp.edges.forEach(e => { if (e.from !== hub || laneOf[e.to] != null) return; const p = isState(e.to) ? 3 : latestPhase([condTag(e.label) ? 'routes' : e.label, N[e.to].label]); laneOf[e.to] = p == null ? prev : p; prev = laneOf[e.to]; });
      titles = HUB_PHASES.map(p => p[0]);
    }
    const raise = () => { for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (e.from === hub || laneOf[e.from] == null) return; if (laneOf[e.to] == null || laneOf[e.to] < laneOf[e.from]) laneOf[e.to] = laneOf[e.from]; }); };
    raise();
    ids.forEach(i => { if (laneOf[i] == null) { const t = fwd.filter(e => e.from === i && laneOf[e.to] != null).map(e => laneOf[e.to]); laneOf[i] = t.length ? Math.min(...t) : 0; } });
    if (!dl && !seq) { const last = Math.max(...ids.map(i => laneOf[i])); ids.forEach(i => { if (isState(i)) laneOf[i] = Math.max(laneOf[i], last); }); raise(); }
    const used = [...new Set(ids.map(i => laneOf[i]))].sort((a, b) => a - b);
    // branches: hub → callee is drawn unless the callee already has another line coming in
    const branch = new Set(callees.filter(c => !isState(c) && !lp.edges.some(e => e.to === c && e.from !== hub)));
    const sub = O(); ids.forEach(i => { sub[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (e.from === hub || e.to === hub) return; if (laneOf[e.from] === laneOf[e.to] && sub[e.to] < sub[e.from] + 1) sub[e.to] = Math.min(3, sub[e.from] + 1); });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id); return k < 0 ? 999 + lp.edges.findIndex(e => e.from === id) : k; };
    const lanes = used.map(u => {
      const mine = ids.filter(i => laneOf[i] === u), nCols = Math.max(...mine.map(i => sub[i])) + 1;
      const cols = Array.from({ length: nCols }, (_, j) => mine.filter(i => sub[i] === j)
        .sort((a, b) => (branch.has(b) - branch.has(a)) || (isState(a) - isState(b)) || (seen(a) - seen(b))));
      return { title: titles[u] || `Lane ${u + 1}`, ids: mine, cols };
    });
    return { lanes, branch, boxed: boxed && lanes.length > 1 };
  }
  /* a hub plan made stable against the one before it: a card that was there keeps its lane (by title), column and
     order; a new card takes its place in the fresh plan, after the cards already in that column */
  function keepHub(P, Q) {
    const at = O(); Q.lanes.forEach(L => L.cols.forEach((col, j) => col.forEach((id, r) => { at[id] = { t: L.title, j, r }; })));
    const titles = Q.lanes.map(L => L.title);
    P.lanes.forEach((L, i) => { if (titles.includes(L.title)) return; const before = P.lanes.slice(0, i).map(x => x.title).filter(t => titles.includes(t)).pop();
      titles.splice(before == null ? 0 : titles.indexOf(before) + 1, 0, L.title); });
    const lanes = titles.map(title => ({ title, ids: [], cols: [] })), lane = byId(lanes.map(L => [L.title, L]));
    const put = (id, t, j, r) => { const L = lane[t]; L.ids.push(id); (L.cols[j] ||= []).push([r, id]); };
    P.lanes.forEach(L => L.cols.forEach((col, j) => col.forEach((id, r) => { const a = at[id]; if (a) put(id, a.t, a.j, a.r); else put(id, L.title, j, 1e6 + r); })));
    lanes.forEach(L => { L.cols = L.cols.filter(c => c && c.length).map(c => c.sort((a, b) => a[0] - b[0]).map(x => x[1])); });
    const out = lanes.filter(L => L.ids.length);
    return { ...P, lanes: out, boxed: Q.boxed && out.length > 1 };
  }
  const planCache = O();
  function planOf(vid) {
    if (Object.hasOwn(planCache, vid)) return planCache[vid];
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), lp = loopsOf(v);
    const outs = id => lp.edges.filter(e => e.from === id && e.to !== id).length;
    let hub = subjectOf(v); if (hub && !ids.includes(hub)) hub = null;
    const sources = ids.filter(i => outs(i) && !lp.edges.some(e => e.to === i && e.from !== i));
    if (!hub && lp.edges.length && outs(lp.edges[0].from) >= 3 && sources.length === 1 && /^(public|lane|verb|external)$/.test(N[lp.edges[0].from]?.kind || '')) hub = lp.edges[0].from; // one trigger only; an overview with several stays a flow
    if (hub && outs(hub) < 3) hub = null;
    const steps = O(); if (v.render === 'sequence') { const k = runSteps(lp.edges); lp.edges.forEach((e, i) => { if (k[i] != null) (steps[e.to] ||= []).push(k[i]); }); }
    const flow = { flow: true, backKeys: lp.keys, steps, hub: null };
    // a type with its own layout has no hub plan: a typed view named as one of its cards is no drill-down into it (audit 24)
    if (!hub || (Array.isArray(v.containers) && v.containers.length) || v.mainSteps || v.render === 'process' || ownLayout(vid)) return (planCache[vid] = flow);
    planCache[vid] = { ...hubPlan(v, hub, lp), hub, backKeys: lp.keys, steps };
    const was = opts.prev && opts.prev[vid]; // after an update: cards keep the lane, column and order they had
    if (was && was.hub === hub && was.lanes) return (planCache[vid] = keepHub(planCache[vid], was));
    // a hub plan that cannot route cleanly gives way to the plain left-to-right flow, if that does better
    const bad = g => { const st = g.stats || {}; return routeAudit(g, '').length + ((st.cross || 0) + (st.fallback || 0)) * 5; };
    let hb = bad(buildGeo(vid, undefined, undefined, true));
    if (hb) { // try other orders inside each lane column before giving up on the hub layout
      const P0 = planCache[vid]; let evals = 0;
      for (let pass = 0; pass < 2 && hb && evals < 80; pass++) P0.lanes.forEach(L => L.cols.forEach(col => {
        for (let a = 0; a < col.length && hb && evals < 80; a++) for (let b = a + 1; b < col.length && hb && evals < 80; b++) {
          if (P0.branch.has(col[a]) !== P0.branch.has(col[b])) continue;
          [col[a], col[b]] = [col[b], col[a]]; evals++;
          const nb = bad(buildGeo(vid, undefined, undefined, true)); if (nb < hb) hb = nb; else [col[a], col[b]] = [col[b], col[a]];
        }
      }));
    }
    if (hb) { const keep = planCache[vid]; planCache[vid] = flow; const fb = bad(buildGeo(vid, undefined, undefined, true)); if (fb >= hb) planCache[vid] = keep; }
    return planCache[vid];
  }
  /* a layout may place only some cards: they keep their slots, the rest take their auto-layout slot or the next free
     row below it (a complete layout is used as it is) */
  // a pin far off the grid (1e6, 1e308) held at 64 cells past the view's count: laying out walks every column and row between;
  // one that is not two numbers is no pin (validate warns of both)
  function onGrid(vid, L) { const lim = ((V[vid] || {}).nodeIds || []).length + 64, off = x => typeof x === 'number' && !(Math.abs(x) <= lim), cut = p => (Array.isArray(p) && !(typeof p[0] === 'number' && typeof p[1] === 'number') ? null : Array.isArray(p) && p.some(off) ? p.map(x => (off(x) ? Math.max(-lim, Math.min(lim, x || 0)) : x)) : p);
    return Object.values(L).some(p => cut(p) !== p) ? Object.fromEntries(Object.entries(L).map(([k, p]) => [k, cut(p)]).filter(e => e[1])) : L; }
  function fillLayout(vid, L, typed = false) {
    L = onGrid(vid, L);
    const bx = boxesOf(vid), ids = (V[vid].nodeIds || []).filter(i => N[i] && !bx.some(b => b.id === i)); // a box takes its place from what it holds
    const boxes = bx.length ? bx : (V[vid].containers || []).filter(b => b && b.id != null);
    let A = null; const autoOf = () => (A ||= autoPos(vid));
    const fill = L => {
      if (ids.every(i => Array.isArray(L[i]))) return L;
      const auto = autoOf(), out = O(), taken = (c, r) => Object.values(out).some(([c2, r2]) => c2 === c && Math.abs(r2 - r) < 1);
      ids.forEach(i => { if (Array.isArray(L[i])) out[i] = L[i]; });
      // a map's lines, which a card boxFit moves keeps left to right (a typed view's may be drawn turned or flipped)
      const lp = bx.length ? null : loopsOf(V[vid]), fwd = lp ? lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to) : [];
      const fit = boxes.length || fwd.length ? boxFit(boxes, ids, out, fwd) : null;
      // the auto-layout slot is kept when it is clean and its lines run ahead; a clean slot whose lines run back gives way only to
      // one whose lines run back less (audit 43: a card with its pin dropped went under the card that feeds it, a slot free beside)
      ids.forEach(i => { if (out[i]) return; let [c, r] = auto[i] || [0, 0]; while (taken(c, r)) r++; // auto rows may be half rows: a row apart
        const k = fit && fit.clean(i, c, r) ? fit.cost(i)(c, r) : null;
        out[i] = fit && k !== 0 ? fit.near(i, taken, c, r, k) || [c, r] : [c, r]; });
      return out; };
    let out = fill(L);
    // a typed view's pins settled (settlePins, layered.js) among the cards as placed, and the rest placed again round them; a
    // map's pins stay as given. Rows count a whole row out: a typed view's tall row reaches over the half row after it (audit
    // 58: the profile example's Order one column down, its package box over the half row of the profile beside it)
    for (let k = 0; typed && k < 3; k++) { const L2 = typedPins(L, out, ids, boxes); if (L2 === L) break; L = L2; out = fill(L); }
    return out;
  }
  function typedPins(L, out, ids, boxes) {
    const P = ids.filter(i => Array.isArray(L[i])).map(i => [i, L[i]]); if (!P.length) return L;
    const byB = O(), home = O(); boxes.forEach(b => { byB[b.id] = b; }); boxes.forEach(b => arrOf(b.nodeIds).forEach(i => { if (b.id !== i) home[i] = b.id; }));
    const chain = x => { const a = []; for (let k = 0, y = x; y != null && Object.hasOwn(byB, y) && k <= boxes.length; y = byB[y].parent, k++) a.push(y); return a; };
    const up = x => (Object.hasOwn(byB, x) ? chain(byB[x].parent) : chain(home[x]));
    const at = O(); ids.forEach(i => { if (!Array.isArray(L[i]) && Array.isArray(out[i])) at[i] = out[i]; });
    const S = settlePins(P, at, up);
    return P.every(([i, p]) => S[i] === p) ? L : { ...L, ...S };
  }
  /* a card with no pin in a pinned view with boxes (audit 41): its auto-layout slot is from another layout, and its box, drawn
     round its cards, grew over cards it does not hold (the integration fixture's pricing with no pin; a card a host adds to a box). The slot
     is kept when no box then lies over a card or box it does not hold and its lines run ahead (audit 43; a view with no boxes too); else the card goes in the first such slot by its box's
     pinned cards: under them (nearest its auto-layout column first), in a gap among them, beside them, above them, further out a row at a time. Slots are grid cells: a
     box's cells run from its cards' first column and row to their last; a card more than half a row (column) into them is in it,
     as a half row on a typed view of tall rows lies past a box on the row before, and on a map the layout's box gap keeps a
     card half a row off a box's cells clear of it (audit 42: that gap went after the whole row, and moved the card with the box).
     A card in no box, or whose boxes have no card placed yet, goes in the first such slot round its auto-layout slot: below it,
     beside it, then further out (audit 42: it kept a slot inside another box). Of those slots, the first that keeps each of its
     lines (fwd) to a placed card left to right is taken; else the one whose lines run back least (audit 42: a queue went under
     the worker it feeds) */
  function boxFit(boxes, ids, out, fwd = []) {
    const byB = O(); boxes.forEach(b => { byB[b.id] = b; });
    const home = O(); boxes.forEach(b => arrOf(b.nodeIds).forEach(i => { if (b.id !== i) home[i] = b.id; })); // the box a card is drawn in (the last that lists it)
    const up = x => { const a = []; for (let k = 0, y = x; y != null && Object.hasOwn(byB, y) && k <= boxes.length; y = byB[y].parent, k++) a.push(y); return a; };
    const chain = O(), inC = O(); ids.forEach(i => { chain[i] = up(home[i]); inC[i] = new Set(chain[i]); }); const boxUp = O(); boxes.forEach(b => { boxUp[b.id] = new Set(up(b.id)); });
    const rects = skip => { const R = O(); ids.forEach(j => { const p = out[j]; if (!p || j === skip) return;
      chain[j].forEach(b => { const q = R[b]; R[b] = q ? { c0: Math.min(q.c0, p[0]), c1: Math.max(q.c1, p[0]), r0: Math.min(q.r0, p[1]), r1: Math.max(q.r1, p[1]) } : { c0: p[0], c1: p[0], r0: p[1], r1: p[1] }; }); }); return R; };
    const over = (R, c, r) => !!R && c > R.c0 - .5 && c < R.c1 + .5 && r > R.r0 - .5 && r < R.r1 + .5, meet = (A, B) => !!A && !!B && A.c0 < B.c1 + .5 && B.c0 < A.c1 + .5 && A.r0 < B.r1 + .5 && B.r0 < A.r1 + .5;
    // the faults card i at [c, r] adds: a box of its own grown over a card or box it does not hold, or i in another box's cells
    const faults = (i, c, r) => { const R0 = rects(i), was = out[i]; out[i] = [c, r]; const R1 = rects(); if (was) out[i] = was; else delete out[i]; let k = 0;
      boxes.forEach(b => { const R = R1[b.id]; if (!R) return;
        if (!inC[i].has(b.id)) { if (over(R, c, r)) k++; return; }
        ids.forEach(j => { const p = out[j]; if (j !== i && p && !inC[j].has(b.id) && over(R, p[0], p[1]) && !over(R0[b.id], p[0], p[1])) k++; });
        boxes.forEach(o => { if (inC[i].has(o.id) || boxUp[o.id].has(b.id)) return; if (meet(R, R1[o.id]) && !meet(R0[b.id], R1[o.id])) k++; }); });
      return k; };
    const clean = (i, c, r) => !boxes.length || !faults(i, c, r);
    // ac, ar: the card's auto-layout slot; its box's columns are tried nearest to ac first
    // what a slot costs card i's lines to placed cards: one running back or down its column, and one more for each card on the way down it
    const costOf = i => { const ln = fwd.filter(e => (e.from === i) !== (e.to === i) && out[e.from === i ? e.to : e.from]);
      return (c, r) => ln.reduce((k, e) => { const o = out[e.from === i ? e.to : e.from], back = e.from === i ? c >= o[0] : o[0] >= c;
        return k + (back ? 1 + (o[0] === c ? ids.filter(j => j !== i && out[j] && out[j][0] === c && (out[j][1] - r) * (out[j][1] - o[1]) < 0).length : 0) : 0); }, 0); };
    // k0: the cost of the auto-layout slot when it is clean (null when it is not)
    const near = (i, taken, ac, ar, k0 = null) => { const R = rects(i), b = chain[i].find(x => R[x]), B = b == null ? null : R[b], cost = costOf(i);
      // how far a slot is: the rows and columns it adds to its box's cells, or its distance from the auto-layout slot
      const far = (c, r) => B ? Math.max(0, B.c0 - c, c - B.c1) + Math.max(0, B.r0 - r, r - B.r1) : Math.max(Math.abs(c - ac), Math.abs(r - ar));
      let tries = 0, best = null, lim = Infinity;
      if (k0 != null) { lim = far(ac, ar) + 1; best = { p: [ac, ar], t: 0, k: k0 }; }
      // a slot: null to go on; the slot to take: the first clean one whose lines all run ahead, else the clean one whose run back
      // least, once 40 more give none; a slot further out than the first clean one, and one more, is not taken for its lines
      // (audit 42: a box stretched four columns to keep one line ahead)
      const ok = (c, r) => { if (tries++ >= 400 || (best && tries > best.t + 40)) return best ? best.p : false; if (taken(c, r) || !clean(i, c, r)) return null;
        const k = cost(c, r), f = far(c, r); if (best && f > lim) return null; if (!k) return [c, r];
        if (!best) { lim = f + 1; best = { p: [c, r], t: tries, k }; } else if (k < best.k) best = { ...best, p: [c, r], k }; return null; };
      const span = (a, z) => Array.from({ length: Math.max(0, Math.round(z - a) + 1) }, (_, k) => a + k).sort((x, y) => Math.abs(x - ac) - Math.abs(y - ac));
      const slots = function* () {
        if (!B) { for (let d = 1; d <= ids.length + 1; d++) { const ring = [];
          for (let dc = -d; dc <= d; dc++) for (let dr = -d; dr <= d; dr++) if (Math.max(Math.abs(dc), Math.abs(dr)) === d) ring.push([dc, dr]);
          ring.sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - Math.abs(q[0]) - Math.abs(q[1]) || (p[1] < 0) - (q[1] < 0) || Math.abs(p[0]) - Math.abs(q[0]) || q[0] - p[0] || p[1] - q[1]);
          for (const [dc, dr] of ring) yield [ac + dc, ar + dr]; } return; }
        for (const c of span(B.c0, B.c1)) yield [c, B.r1 + 1];
        for (const r of span(B.r0, B.r1)) for (const c of span(B.c0, B.c1)) yield [c, r];
        for (let d = 1; d <= ids.length + 1; d++) {
          for (const r of span(B.r0, B.r1)) { yield [B.c1 + d, r]; yield [B.c0 - d, r]; }
          for (const c of span(B.c0, B.c1)) { yield [c, B.r0 - d]; yield [c, B.r1 + 1 + d]; } } };
      for (const [c, r] of slots()) { const k = ok(c, r); if (k === false) return null; if (k) return k; }
      return best && best.p; };
    return { clean, near, cost: costOf };
  }
  /* plain views: longest-path columns from the roots, state at the bottom of its column */
  /* views with containers: each container is a block in columns of its own, its cards in call order inside it; blocks (and
     cards in no container) run left to right by the lines between them, and those with no line between them stack in the
     same columns. A nested container is a block inside its parent's.
     A box is laid out three times (#86): by the lines inside it, as before; then each of its cards level with the cards its
     lines come from and go to outside it too, where the pass before put them; then ordered by those lines as well. Its far
     ends are items at their rows, in a column before its first (a line from the left) or after its last. A box's cards were
     placed by its own lines alone, so a box fed from outside, and the lines that pass it, ran into the cards beside it. */
  // A typed view whose type gives boxes (notes/stage-2.md §3.2) passes them, T: { boxes, flip }; their ids are not cards
  function blockPos(vid, T) {
    const v = T ? flipView(vid, T.flip) : V[vid], boxes = T ? T.boxes : (v.containers || []).filter(c => c && c.id), ids = (v.nodeIds || []).filter(i => typeof i === 'string' && N[i] && !(T && boxes.some(b => b.id === i))), isId = new Set(ids), lp = loopsOf(v);
    const byBox = byId(boxes.map(b => [b.id, b])), known = x => ids.includes(x) || Object.hasOwn(byBox, x), fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to && known(e.from) && known(e.to)); // not a line to an id that is neither (M3.3)
    const home = byId(ids.map(i => [i, (boxes.filter(b => b.id !== i && (b.nodeIds || []).includes(i)).pop() || {}).id ?? null])); // the box a card is drawn in
    const boxUp = x => byBox[x] && byBox[byBox[x].parent] ? byBox[x].parent : null, up = x => isId.has(x) ? home[x] : boxUp(x); // the box a box, or a card or box, sits in
    const kids = new Map(), tin = new Map(), tout = new Map(), dep = new Map([[null, 0]]), path = new Map(), st = [[null, 0]]; let t = 0;
    boxes.forEach(b => { const p = boxUp(b.id); kids.has(p) || kids.set(p, []); kids.get(p).push(b.id); });
    // a walk of the box tree with a stack, not recursion, so boxes nest to any depth: each box's span (x holds y when x's span
    // holds y's), and the boxes inner first (tout's order), the order they are laid out in
    while (st.length) { const f = st[st.length - 1], c = (kids.get(f[0]) || [])[f[1]++];
      if (c === undefined) tout.set(st.pop()[0], t++); else if (!tin.has(c)) { tin.set(c, t++); dep.set(c, st.length); st.push([c, 0]); } }
    // x and its boxes from the top, once (a step per box at most, so a cycle, validate's error, ends); what in group g holds x
    const anc = x => { if (!path.has(x)) { const a = []; for (let k = 0, y = x; y != null && k <= boxes.length; k++, y = k > 1 ? boxUp(y) : up(y)) a.push(y); path.set(x, a.reverse()); } return path.get(x); };
    const itemIn = (x, g) => { const v = anc(x)[dep.get(g)]; return v != null && (v === x ? up(v) : boxUp(v)) === g ? v : undefined; };
    // a box read as a box past the card it starts from: a box may share a card's id (validate's error), and holds(x, 'a') read
    // the box 'a' as the card again, for ever; nor is a card in a box of its own id (audit 25)
    const inBox = (x, y) => x === y || tin.get(x) < tin.get(y) && tout.get(y) < tout.get(x), holds = (x, y) => x === y || (isId.has(y) ? home[y] != null && inBox(x, home[y]) : inBox(x, y));
    const first = x => { const k = lp.edges.findIndex(e => holds(x, e.from) || holds(x, e.to)); return k < 0 ? Infinity : k; };
    const sink = x => ids.includes(x) && isState(x) && !fwd.some(e => e.from === x); // state that leads nowhere goes last
    const lined = x => lp.edges.some(e => e.from !== e.to && (holds(x, e.from) || holds(x, e.to)));
    let was = O(), now = O(); // each box as the pass before laid it out, and as this one does
    const block = (g, P, order) => { // a group's cards at [col, row] from its top left, and its size in slots; P: where the pass before put each card
      const all = [...ids.filter(i => home[i] === g), ...(kids.get(g) || [])];
      // cards with no line go in rows of their own under the group's columns, as under a plain view (#46): at the bottom of
      // their box, or under the view; they stacked in the first column with the sources
      const loose = all.some(lined) ? all.filter(x => ids.includes(x) && !lined(x)) : [], items = all.filter(x => !loose.includes(x)), size = O(), out = O();
      items.forEach(x => { size[x] = isId.has(x) ? { w: 1, h: 1, pos: { [x]: [0, 0] } } : now[x]; out[x] = []; });
      fwd.forEach(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g); if (a !== undefined && b !== undefined && a !== b && !out[a].includes(b)) out[a].push(b); });
      const st = O(), dag = [], into = new Set(Object.values(out).flat()); // lines that close a loop do not order the blocks
      const dfs = u => { st[u] = 1; out[u].forEach(w => { if (st[w] === 1) return; dag.push([u, w]); if (!st[w]) dfs(w); }); st[u] = 2; };
      [...items.filter(x => !into.has(x)), ...items].forEach(x => { if (!st[x]) dfs(x); });
      const rank = byId(items.map(x => [x, 0]));
      for (let it = 0; it < items.length; it++) dag.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) rank[b] = rank[a] + 1; });
      const cols = [], pos = O(); let c0 = 0, h = 0;
      items.forEach(x => (cols[rank[x]] ||= []).push(x));
      const main = cols.map(l => (l || []).filter(x => !sink(x)).sort((a, b) => first(a) - first(b)));
      const inside = (x, id) => ids.includes(x) ? 0 : (size[x].pos[id] || [0, null])[1]; // the row of a box's card that a line meets
      const dagged = new Set(dag.map(([a, b]) => a + '\u0000' + b)), lines = fwd.map(e => { const a = itemIn(e.from, g), b = itemIn(e.to, g);
        return a !== undefined && b !== undefined && a !== b ? { e, link: [a, b, inside(a, e.from), inside(b, e.to)] } : null; }).filter(Boolean);
      // the box's lines to cards outside it (#86): each far end at its row from the box's top, where the pass before put both.
      // ponytail: three passes, so a far end that moves in the last one is followed where it was, and a far end in the card's
      // own column, or a line to a box, places nothing; passes until nothing moves, if a map needs them
      const far = [], fixed = Object.create(null), top = P && g != null && was[g] ? Object.keys(was[g].pos).map(c => P[c] && P[c][1] - was[g].pos[c][1]).find(r => r != null) : null;
      if (top != null) fwd.forEach(e => { const fin = holds(g, e.from); if (fin === holds(g, e.to)) return;
        const [mine, other] = fin ? [e.from, e.to] : [e.to, e.from], x = itemIn(mine, g), p = P[mine], q = P[other]; if (x === undefined || !p || !q || p[0] === q[0]) return;
        const id = '\u0002' + far.length, left = q[0] < p[0]; fixed[id] = q[1] - top;
        far.push({ e, id, left, link: left ? [id, x, 0, inside(x, mine)] : [x, id, inside(x, mine), 0] }); });
      const L = far.filter(f => f.left).map(f => f.id), R = far.filter(f => !f.left).map(f => f.id), M = [...(L.length ? [L] : []), ...main, ...(R.length ? [R] : [])];
      const hh = x => size[x] ? size[x].h : 1;
      untangle(M, [...lines.filter(l => dagged.has(l.link[0] + '\u0000' + l.link[1])), ...(order ? far : [])].map(l => l.link), hh, fixed); // in call order, unless another order crosses less (#53)
      main.splice(0, main.length, ...M.slice(L.length ? 1 : 0, M.length - (R.length ? 1 : 0)));
      const row = rowsFor(M, [...lines, ...far].filter(l => level(l.e)).map(l => l.link), hh, fixed); // each block level with the cards its lines come from and go to
      main.forEach((l, k) => { cols[k] = [...l, ...(cols[k] || []).filter(sink).sort((a, b) => first(a) - first(b))]; });
      cols.forEach(list => { let r0 = 0, w = 0;
        list.forEach(x => { const sz = size[x]; if (row[x] != null) r0 = Math.max(r0, row[x]);
          Object.entries(sz.pos).forEach(([id, [c, r]]) => { pos[id] = [c0 + c, r0 + r]; }); r0 += sz.h; w = Math.max(w, sz.w); });
        c0 += w; h = Math.max(h, r0); });
      const per = Math.max(2, c0); loose.forEach((x, k) => { pos[x] = [k % per, h + Math.floor(k / per)]; });
      if (loose.length) { c0 = Math.max(c0, Math.min(per, loose.length)); h += Math.ceil(loose.length / per); }
      return (now[g] = { w: c0, h, pos });
    };
    const run = (P, order) => { tout.forEach((_, g) => block(g, P, order)); return now[null].pos; };
    let P = run();
    for (const order of [false, true]) { was = now; now = O(); P = run(P, order); } // levelled by the lines from outside, then ordered by them too
    return P;
  }
  // a typed view whose type lays it out (1.9): the plain flow's ranking, with the lines the type turns round for it
  const ownLayout = vid => { if (D.schemaVersion !== 2) return null; const T = diagramOf(V[vid]); return T && T.layout && (T.layout.run || typeof T.layout === 'function') ? T : null; }; // version 1: a map
  // its boxes (registry.js): the type's, from the model; a map's are its containers
  const boxesOf = vid => { const T = ownLayout(vid); return T && T.boxes ? arrOf(T.boxes(D, V[vid])).filter(b => b && b.id != null) : []; };
  const autoPos = vid => { const T = ownLayout(vid), bx = boxesOf(vid);
    return T ? bx.length ? blockPos(vid, { boxes: bx, flip: T.rankFlip }) : flowPos(vid, { flip: T.rankFlip }) : ((V[vid] || {}).containers || []).length ? blockPos(vid) : bestFlow(vid); };
  const memos = opts.memos || Object.create(null); // per view, layoutTyped's memo, kept across update()s: an edit that moves nothing lays out nothing
  const level = e => !/^(top|bottom)$/.test(e.fromSide) && !/^(top|bottom)$/.test(e.toSide); // a line into a card's top or bottom asks for no row
  /* A small plain view is routed a few ways and keeps the one the layout check scores best: cards level with their
     neighbours, or packed from the top as before, with cards no line comes into beside their callee or not. A cheap
     version of the CLI's search (optimize), affordable up to 30 cards; a larger view takes the first way. */
  function bestFlow(vid) {
    const first = flowPos(vid), n = ((V[vid] || {}).nodeIds || []).length;
    if (n > 30 || n < 3) return first;
    const seen = new Set([JSON.stringify(first)]), ways = [first];
    for (const o of [{ pull: true }, { packed: true }, { pull: true, packed: true }]) { const p = flowPos(vid, o), k = JSON.stringify(p); if (!seen.has(k)) { seen.add(k); ways.push(p); } }
    if (ways.length < 2) return first;
    let best = first, score = Infinity;
    scouting = true; ways.forEach(p => { const g = buildGeo(vid, p), s = scoreGeo(g); if (s < score - 0.5) { score = s; best = p; drawn[vid] = { pos: p, g }; } }); scouting = false; // as it will be drawn: with port repair
    if (fanIn(vid)) delete drawn[vid];
    return best;
  }
  let scouting = false;
  const fanIn = vid => { const k = O(); return viewEdges(V[vid] || {}).some(e => e.from !== e.to && (k[e.to] = (k[e.to] || 0) + 1) >= 6); };
  const drawn = O(); // the way bestFlow kept, routed already: the view's next buildGeo takes it once instead of routing it again
  const flipView = (vid, flip) => flip ? { ...V[vid], edges: viewEdges(V[vid]).map(e => flip(e) ? { ...e, from: e.to, to: e.from } : e) } : V[vid];
  function flowPos(vid, o = {}) {
    const v = flipView(vid, o.flip);
    const lp = loopsOf(v), fwd = lp.edges.filter((e, k) => !lp.back.has(k) && e.from !== e.to);
    // cards with no line go in rows of their own under the view (#46), as wide as its columns; they stacked with the sources
    const all = (v.nodeIds || []).filter(i => N[i]), lined = new Set(lp.edges.filter(e => e.from !== e.to).flatMap(e => [e.from, e.to]));
    const loose = lined.size ? all.filter(i => !lined.has(i)) : [], ids = all.filter(i => !loose.includes(i));
    const rank = Object.create(null); ids.forEach(i => { rank[i] = 0; });
    for (let it = 0; it <= ids.length; it++) fwd.forEach(e => { if (rank[e.to] < rank[e.from] + 1) rank[e.to] = rank[e.from] + 1; });
    const seen = id => { const k = lp.edges.findIndex(e => e.to === id || e.from === id); return k < 0 ? 999 : k; };
    const sink = i => isState(i) && !fwd.some(e => e.from === i); // state that leads nowhere sits along the bottom
    const pos = Object.create(null), links = fwd.map(e => [e.from, e.to]);
    const order = rk => { const cols = {}; ids.forEach(i => (cols[rk[i]] ||= []).push(i));
      const ranks = Object.keys(cols).map(Number).sort((a, b) => a - b), mains = ranks.map(c => cols[c].filter(i => !sink(i)).sort((a, b) => seen(a) - seen(b)));
      untangle(mains, links); return { cols, ranks, mains }; }; // in reading order, unless another order crosses less (#53)
    const { cols, ranks, mains } = order((o.pull && pullSources(ids, links, rank)) || rank);
    const row = o.packed ? byId(mains.flatMap(m => m.map((i, r) => [i, r]))) : rowsFor(mains, fwd.filter(level).map(e => [e.from, e.to]));
    const height = Math.max(0, ...Object.values(row)) + 1;
    Object.entries(cols).forEach(([c, list]) => {
      const main = mains[ranks.indexOf(+c)], st = list.filter(sink).sort((a, b) => seen(a) - seen(b));
      main.forEach(i => { pos[i] = [+c, row[i]]; });
      st.forEach((i, r) => { pos[i] = [+c, height + r]; }); // state along the bottom, never above the flow
    });
    const per = Math.max(2, Object.keys(cols).length), under = Math.max(...Object.values(pos).map(p => p[1])) + 1;
    loose.forEach((i, k) => { pos[i] = [k % per, under + Math.floor(k / per)]; });
    return pos;
  }

  function buildView(vid, opts = {}) { // a view's geometry and its picture
    const g = buildGeo(vid), v = V[vid], T = ownLayout(vid), L = T && T.draw && T.draw(g, { esc, r2, textW }); // its two layers only
    return { g, markup: svgOf(g, { title: labelOr(v.title, vid), subject: subjectOf(v), icons: D.icons, broken: brokenIn(vid), ...opts, ...(L && { under: L.under, over: L.over }) }) };
  }
  // the rules a view's lines break (#70), by model edge id: svgOf draws such a line rose, with a mark that names them
  let ruled = null;
  const brokenIn = vid => {
    if (!arrOf(D.rules).length) return null;
    const by = O(), title = id => { const r = D.rules.find(x => x && x.id === id); return String((r && labelOr(r.title, r.id)) ?? id); };
    (ruled ||= rules(D)).forEach(b => { if (b.view === vid) b.targets.forEach(t => { if (t.type === 'edge') t.ids.forEach(i => { const l = by[i] ||= []; if (!l.includes(title(b.rule))) l.push(title(b.rule)); }); }); });
    return Object.keys(by).length ? by : null;
  };
  const layoutCache = O(); // M3
  // the cards a card opens: its inner view's, else the count the host gives for one it has not loaded (opensCount)
  // a typed view's count is what it draws, as its pill, the views list and the search palette say (audit 39: a card that opens it
  // said 3, its pill 9): laid out once for it, which its first visit then takes (its memo); one that cannot be, its cards
  const drawsN = c => { try { return elementCount(V[c], buildGeo(c)) ?? (V[c].nodeIds || []).length; } catch { return (V[c].nodeIds || []).length; } };
  const kidN = O(), kidCount = (nid, vid) => { const c = childOf(nid, vid), k = c && c !== vid ? (ownLayout(c) ? (kidN[c] ??= drawsN(c)) : (V[c].nodeIds || []).length) : 0, n = Number(nodeIn(nid, vid).opensCount); // Number(), not +: a host's BigInt is a count too (audit 29)
    return k || (opensOf(nid, vid) && n > 0 ? Math.floor(n) : 0); };
  // a line's kind: the first one its edges name (#45); else a hook's line is a guard and a board's is state; else, only where
  // a legend says what the colours mean (the standalone page, or a view's kindsFromLabels), a guess from the label's words
  const wireKind = (e, words) => { const t = N[e.to] || {}, f = N[e.from] || {}, l = String(e.label || '');
    const named = (e.all || [e]).map(x => x.kind).find(k => WIRES.some(w => w[0] === k)); if (named) return named;
    if (f.kind === 'hook') return 'guard';
    if (t.kind === 'board' || f.kind === 'board' || words && /\b(reads?|writes? config|saves?|records?|appends?)\b/i.test(l)) return 'state';
    if (t.kind === 'hook' || words && /\b(trigger|fires|suggests?|offers?|requires|wires)/i.test(l)) return 'triggers';
    if (words && /\b(feeds?|hands? off|routes?|passes|returns|bounces|then)\b/i.test(l)) return 'feeds';
    return 'calls'; };
  function prepEdges(vid, edges, backKeys) {
    const par = {}; // parallel edges between one pair read as one edge listing every relation
    const merged = edges.filter(e => { const k = e.from + '>' + e.to + ((V[vid] || {}).keepPairs ? '#' + e.id : ''), m = par[k]; if (!m) { par[k] = e; e.all = [e]; return true; } m.all.push(e); return false; })
      .map(e => e.all.length < 2 ? e : { ...e, label: (e.label || '') + ' +' + (e.all.length - 1), when: e.all.map(x => (x.step != null ? x.step + '. ' : '') + (x.label || '')).join('\n') });
    const out = merged.map(e => ({ ...e, back: !(V[vid] || {}).keepPairs && backKeys && backKeys.has(e.from + '>' + e.to) }));
    const pair = {}; // A→B plus B→A reads as one two-way edge
    return out.filter(e => { const r = !(V[vid] || {}).keepPairs && pair[e.to + '>' + e.from]; if (r) { r.both = true; r.back = false; r.all = [...(r.all || [r]), ...(e.all || [e])]; if (e.label && e.label !== r.label) r.label = (r.label ? r.label + ' / ' : '') + e.label;
      if (r.all.some(x => x.step != null)) r.when = r.all.map(x => (x.step != null ? x.step + '. ' : '') + (x.label || '')).join('\n'); else if (e.when) r.when = [r.when, e.when].filter(Boolean).join(' · '); return false; } pair[e.from + '>' + e.to] = e; return true; })
      .map(e => { const all = e.all || [e], subs = [...new Set(all.map(x => x.sublabel).filter(x => x != null && x !== '').map(String))];
        return { ...e, wk: wireKind(e, opts.kinds || (V[vid] || {}).kindsFromLabels), weight: Math.max(...all.map(x => [2, 3].includes(x.weight) ? x.weight : 1)), sublabel: subs.join(' / ') || undefined, ...markOf(all), ...chOfAll(all) }; });
  }
  // the change a line that stands for several edges says in its title and key: the strongest of theirs, as markOf draws it
  // (audit 51: a pair drawn removed was named with the first edge's change, none)
  const chOfAll = all => { if (all.length < 2) return {}; const c = w => all.find(x => typeof x.change === 'string' && w.includes(x.change.toLowerCase()));
    const top = c(['removed']) || c(['added', 'new']); return top ? { change: top.change } : {}; };
  const condTag = l => { const m = /^(?:routes|on-ramp:?)\s+(\S+)$/i.exec(String(l || '').trim()); return m ? m[1] : null; }; // "routes bug" → a "bug" tag
  // quick: a candidate the layout searches below score and may drop, laid out once, as it was before 0.6.0 (no room for lines
  // with no route, no way round the cards for them, no warning)
  // a typed element's or line's change (diff's added, changed or removed; an author's planned), the view's own over the model's,
  // on what its type drew for it, which a type builds from the model and leaves out (audit 44: a removed class drawn as live)
  const CHANGES = ['added', 'new', 'changed', 'modified', 'removed', 'planned'], chOf = x => x && typeof x.change === 'string' && CHANGES.includes(x.change.toLowerCase()) ? x.change.toLowerCase() : null, CHG_IS = { added: ['added', 'new'], removed: ['removed'] };
  // what the view owns itself, by id: its own lines (a sequence's or timing's messages, a class view's own association), its
  // fragments and their operands; then every element's members (a region, a part, a port a type draws as its own shape or box).
  // Each the first of its id (audit 45: a removed message, fragment, package or region drawn as live)
  // A member of what came or went came or went with it (a removed composite state's regions)
  const ownCh = (lists, into = O()) => { const s = lists.flatMap(l => (Array.isArray(l) ? l : []).map(x => [x, null])), seen = new Set();
    for (let i = 0; i < s.length; i++) { const [x, up] = s[i]; if (!x || typeof x !== 'object' || seen.has(x)) continue; seen.add(x); const c = chOf(x) || up;
      if (typeof x.id === 'string' && !(x.id in into)) into[x.id] = c; if (Array.isArray(x.members)) x.members.forEach(m => s.push([m, c === 'changed' || c === 'modified' || c === 'planned' ? null : c])); }
    return into; };
  let memberCh; const memberOf = id => (memberCh ||= ownCh([nodes]))[id] || null;
  // the element a member (a state's region) is a member of, at any depth: the first of its id
  let memberTop; const topOf = id => { if (!memberTop) { memberTop = O(); const s = nodes.map(n => [n, n && n.id]);
    for (let i = 0; i < s.length; i++) { const [x, t] = s[i]; if (!x || typeof x !== 'object' || !Array.isArray(x.members)) continue;
      x.members.forEach(m => { if (m && typeof m === 'object' && typeof m.id === 'string' && !(m.id in memberTop)) { memberTop[m.id] = t; s.push([m, t]); } }); } }
    return memberTop[id] ?? null; };
  const put = (x, c) => { if (c) { x.change = c; MARKED.add(x); } else if (MARKED.has(x)) { delete x.change; MARKED.delete(x); } };
  // a timing view's constraints are its own too (audit 49)
  const ownLists = v => [v.edges, v.fragments, ...(v.timeline && typeof v.timeline === 'object' ? [v.timeline.constraints, v.timeline.changes] : [])]; // and its changes (audit 51: a removed lifeline's, drawn back)
  function marks(g, vid) { const v = V[vid] || {}, own = ownCh(ownLists(v)), ev = O(), lines = new Set();
    (D.edges || []).forEach(e => { if (e && typeof e.id === 'string') { lines.add(e.id); if (chOf(e)) ev[e.id] ??= chOf(e); } });
    // a shape a type draws for a model line (a communication view's message row) takes the line's change (audit 46)
    // a member drawn as its own box goes or comes with the element it is a member of, which the view alone took out or put in
    // (audit 58: a composite state taken out of the view, its regions drawn live inside it)
    const viaTop = id => { const t = topOf(id), c = t != null && N[t] ? chOf(nodeIn(t, vid)) : null; return came(c) || gone(c) ? c : null; };
    const lineCh = k => (k in own ? own[k] : ev[k]) || null, boxCh = id => (N[id] ? chOf(nodeIn(id, vid)) : id in own ? own[id] : (m => came(m) || gone(m) ? m : viaTop(id) || m)(memberOf(id) || ev[id] || null));
    const came = c => !!c && CHG_IS.added.includes(c), gone = c => !!c && CHG_IS.removed.includes(c), diffCh = c => came(c) || gone(c) || c === 'changed' || c === 'modified';
    // a shape a type draws for a member on another, <part>-><port> (no element id holds '->', model.md rule 5): removed with the
    // part it sits on or its own member, else added with either (audit 46: the ports on a removed or added part drawn live)
    // or changed with its own member, a port renamed or retyped (audit 47; a part's own change is the part's, not its ports')
    // A shape on a model element that went (a timing lane's state row, <lifeline>-><state>) is removed with it (audit 51)
    const onCh = id => { const s = id.split('->'); if (s.length < 2) return null; if (N[s[0]]) return gone(boxCh(s[0])) ? boxCh(s[0]) : null; const cs = s.map(x => (x ? boxCh(x) : null)), c = cs[cs.length - 1];
      return cs.find(gone) || cs.find(came) || (c === 'changed' || c === 'modified' ? 'changed' : null); };
    // what diff() worked out from the view laid out before and after (audit 47: view.diffMarks.marks, by shape id): a port a
    // retyped part gained or lost, a containment line that is new, and "none" for a shape drawn from what it reads, or for an
    // implied or derived line, that the change leaves as it was. It is read only where the type's own reading would mark it
    const dm = v.diffMarks && typeof v.diffMarks === 'object' && v.diffMarks.marks && typeof v.diffMarks.marks === 'object' && !Array.isArray(v.diffMarks.marks) ? v.diffMarks.marks : null;
    const dg = v.diffMarks && typeof v.diffMarks === 'object' && Array.isArray(v.diffMarks.gone) ? new Set(v.diffMarks.gone.filter(x => x && typeof x === 'object' && typeof x.id === 'string').map(x => x.id)) : null; // a ghost the type drew back: removed
    const hint = (k, c) => { if (!dm || typeof k !== 'string' || !Object.hasOwn(dm, k)) return c; const h = dm[k];
      return h === 'none' ? null : h === 'added' || h === 'removed' || h === 'changed' ? h : c; };
    // what a type draws from elements or lines it does not draw itself (x.reads: their ids): a container instance drawn as its
    // container, an implied line through a hidden owner, an information flow's conveyed items (audit 46)
    // read in the view the shape draws (x.readsIn: an inline interaction's sequence view), its own lines and its overrides
    // there (audit 49: a message of that view's own relabelled, added or hidden marked nothing)
    const ownIn = O(), boxIn = (id, w) => { if (w === vid || !V[w]) return boxCh(id); if (N[id]) return chOf(nodeIn(id, w));
      const o = ownIn[w] ||= ownCh(ownLists(V[w])); return id in o ? o[id] : memberOf(id) || ev[id] || null; };
    const readsCh = x => Array.isArray(x.reads) && x.reads.some(r => typeof r === 'string' && diffCh(boxIn(r, typeof x.readsIn === 'string' ? x.readsIn : vid))) ? 'changed' : null;
    (g.nodes || []).forEach(n => { if (!n || typeof n.id !== 'string') return;
      if (N[n.id]) { const c = chOf(nodeIn(n.id, vid)) || hint(n.id, readsCh(n)); if (c) n.change = c; else delete n.change; } else put(n, boxCh(n.id) || hint(n.id, onCh(n.id) || readsCh(n))); });
    // a box a type draws for an element (a package, a node, a boundary, a group, a composite state and its regions), as a shape
    (g.families || []).forEach(f => { if (f && typeof f.id === 'string') put(f, boxCh(f.id) || hint(f.id, readsCh(f))); });
    // a line drawn for others (a C4 implied relationship): added or removed when all it stands for were, else changed when any
    // was; an author's planned is no change of the line's (audit 46: drawn as edited)
    const implied = l => { const cs = l.map(k => (typeof k === 'string' ? lineCh(k) : null)).map(c => (diffCh(c) ? c : null)); if (!cs.some(Boolean)) return null;
      const all = w => cs.every(c => c && CHG_IS[w].includes(c)); return all('added') ? 'added' : all('removed') ? 'removed' : 'changed'; };
    // a line a type derives from its ends (a SysML containment line, <owner>-><child>), no model line's: with an end that came or went
    const endCh = new Map([...(g.nodes || []), ...(g.families || [])].filter(x => x && typeof x.id === 'string').map(x => [x.id, x.change || null]));
    const derived = e => { const a = endCh.get(e.from), b = endCh.get(e.to); return gone(a) || gone(b) ? 'removed' : came(a) || came(b) ? 'added' : null; };
    // a line diff() marked changed (its label edited) that goes with a card the view no longer shows, or comes with one it now
    // shows, or with the view itself: removed (added), as on a map view (audit 56: drawn live, amber, to the card's ghost)
    const gw = k => { const h = dm && Object.hasOwn(dm, k) ? dm[k] : null, c = lineCh(k); return (h === 'removed' || h === 'added') && (c === 'changed' || c === 'modified') ? h : c; };
    (g.edges || []).forEach(e => { const k = e && (e._id ?? e.id); if (typeof k !== 'string') return;
      const c = gw(k) || (dg && dg.has(k) && !lines.has(k) && !(k in own) ? 'removed' : null) || hint(k, (Array.isArray(e.implied) ? implied(e.implied) : !lines.has(k) && !(k in own) && k.includes('->') ? derived(e) : null) || readsCh(e));
      if (c) e.change = c; else delete e.change; });
    return g; }
  function buildGeo(vid, override, repair = (V[vid] || {}).repair !== false, quick = false) { // a view's repair: false turns port repair off
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), T = ownLayout(vid);
    if (T) { // the type's layout (registry.js), in the host's measure (R2)
      const L = T.layout, memo = memos[vid] ||= {}, k = !override && L.key ? L.key(D, v) : null;
      if (k != null && memo.runKey === k) return marks(memo.runGeo, vid);
      const pos = override || (L.pins === false ? {} : L.rank === false ? onGrid(vid, v.layout || {}) : v.layout ? fillLayout(vid, v.layout, true) : (layoutCache[vid] ||= autoPos(vid))); // pins: false, no ranking either (notes/stage-3.md Q9)
      const run = (pos, memo) => (L.run ? L.run(D, v, { measure: M, pos, memo }) : L({ model: D, view: v, pos, memo }));
      let g; // a pinned view's warnings held back: pinsClear may drop the layout that gave them, and only the one kept says its own (audit 59)
      if (!override && v.layout && L.pins !== false) { let said; [g, said] = held(() => run(pos, memo)); [g, said] = pinsClear(vid, v, L, g, memo, said, run); said.forEach(warn); } else g = run(pos, memo);
      // the request/reply port swap (layered.js) is judged inside a pass; the later passes and the type's own steps can undo
      // it, so a view that kept one is laid out once more without it, and that kept when it has fewer issues (audit 15).
      // ponytail: a layout more, so only up to 30 cards (as bestFlow); a larger view keeps the swap as the pass judged it
      if (memo.rr && (memo.rr = false, (g.nodes || []).length <= 30)) { const m2 = { noSwap: true }, g2 = L.run ? L.run(D, v, { measure: M, pos, memo: m2 }) : L({ model: D, view: v, pos, memo: m2 });
        // a line on another or along a border counts before crossings (audit 38: the try without the swap, one shared line for
        // four crossings, was kept)
        const said = h => { const is = routeAudit(h, ''); return [g.nested || g2.nested ? is.filter(s => !/ cross$/.test(s)).length : 0, is.length]; }, a = said(g2), b = said(g);
        if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) { g = g2; Object.assign(memo, { key: m2.key, g: m2.g, dg: m2.dg }); } }
      // an element that opens a view says which in its name, as a map card does, unless its type's name says so already
      // (saysOpens; a typed node draws no ⤢ mark: notes/stage-4.md)
      (g.nodes || []).forEach(n => { const o = N[n.id] && opensOf(n.id, vid); if (!o || n.saysOpens) return;
        // a name that ends a sentence (a C4 description) drops its period before the suffix: never ".," (audit 52)
        n.opensTo = String(labelOr((V[o] || {}).title, o)); const t = a => `${unstop(a)}, opens ${n.opensTo}`; if (n.aria) n.aria = t(String(n.aria)); if (typeof n.ariaOwn === 'string' && n.ariaOwn) n.ariaOwn = t(n.ariaOwn); });
      if (k != null) Object.assign(memo, { runKey: k, runGeo: g });
      return marks(g, vid);
    }
    const edges = viewEdges(v, true).map(e => ({ ...e }));
    if (v.render === 'sequence') { const k = runSteps(edges); edges.forEach((e, i) => { e.step = k[i]; }); } // a removed line: no step (audit 55)
    const P = planCache[vid] || { flow: true, backKeys: loopsOf(v).keys, steps: O() };
    if (!override && P.hub) return hubGeo(vid, P, edges, repair, quick);
    const pos = override || (v.layout ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid)));
    const ready = drawn[vid]; delete drawn[vid]; if (ready && !override && ready.pos === pos && repair === (v.repair !== false) && !quick) return ready.g;
    const mainSteps = v.mainSteps || v.render === 'process';
    const stepIds = v.stepIds || ids;
    const dg = { nodeH: mainSteps ? 82 : v.subAndChips ? 80 : 64, subAndChips: !!v.subAndChips, mainSteps, containers: v.containers, nodes: ids.map(i => { const n = nodeIn(i, vid), step = mainSteps && stepIds.includes(i); return { ...n, sub: n.sub || n.sublabel, emphasis: !!step || !!n.emphasis, step: step ? stepIds.indexOf(i) + 1 : (v.cardSteps || O())[i] || null, verbs: step ? [] : n.verbs, kids: kidCount(i, vid), opens: !!opensOf(i, vid), col: (pos[i] || [0, 0])[0], row: (pos[i] || [0, 0])[1] }; }),
      edges: prepEdges(vid, edges, P.backKeys) };
    dg.authors = D.authors; dg.fan = !scouting; dg.repair = repair; dg.intake = v.intake; dg.tour = v.tour; dg.gap = v.gap; dg.rgap = v.rgap; dg.quick = quick;
    return layoutGraph(dg, true);
  }
  /* a typed view whose pins, as drawn, leave a box over a card it does not hold, two boxes over each other or two cards over each
     other (settlePins goes by cells, and a tall row reaches over the half row after it: audit 58, the profile example's Order
     one column down, its package box over the profile beside it): a pin moves to a cell round it, nearest first, a pin of what
     they meet before the others (a pin moves cards with none too), until none is left (12 layouts at most), the fewest kept. ponytail: a cell model that knows each row's reach */
  function pinsClear(vid, v, L, g, memo, said, run) { // said: what the layout g warned of; returns [the layout kept, what it warned of]
    // and a line of a pinned card on another (check()'s share a line), counted after the boxes (audit 60: laid out down, the SysML
    // internal block gallery's battery stepped a column on, its bus to the controller fanned on the track a line out of the
    // controller's same side takes from its port, and the two shared a line)
    // (a pin of a card the view draws though its nodeIds do not list it: an internal block's part, under its block)
    const ids = v.nodeIds || [], pinned = [...ids, ...Object.keys(v.layout).filter(i => !ids.includes(i) && (g.byId || {})[i])].filter(i => Object.hasOwn(v.layout, i) && Array.isArray(v.layout[i])), share = (h, ids) => { const own = new Set(ids);
      return routeAudit(h, '', new Set((h.edges || []).filter(e => own.has(e.from) || own.has(e.to)))).filter(s => / share a line$/.test(s)).length; };
    // and what else check() says of the picture but crossings (a line along a box's border or across its title, a label on a line or
    // with no room, a line through a card), past what the view says with no pin (audit 61: a region's initial pseudostate dragged
    // right of its composite, its line through the region's title and along its border; one Alt + arrow on a gallery card, a label
    // then not drawn). All of those weigh less than one shared line of a pinned card
    const soft = h => [...routeAudit(h, ''), ...throughIssues(h, ''), ...leaveIssues(h, '')].filter(s => !/ cross$/.test(s)).length;
    let base = null; const over = h => { const k = soft(h); if (!k) return 0; if (base == null) { const [b] = held(() => run(L.rank === false ? {} : (layoutCache[vid] ||= autoPos(vid)), {})); base = soft(b); } return Math.min(99, Math.max(0, k - base)); };
    const score = h => 100 * (1000 * boxClash(h).size + share(h, pinned)) + over(h);
    const met = boxClash(g), n0 = 100 * (1000 * met.size + share(g, pinned)) + over(g); if (!n0) return [g, said];
    pinned.forEach(i => { if (share(g, [i])) met.add(i); });
    // a pinned card a line of which (or which itself) check() names past those: met too
    if (n0 % 100) { const a1 = [], a2 = [], ps = [...routeAudit(g, '', null, a1).map((s, k) => [s, a1[k]]), ...throughIssues(g, '', a2).map((s, k) => [s, a2[k]])];
      ps.forEach(([s, a]) => { if (!/ cross$/.test(s)) (a || []).forEach(x => { if (x) [x.id, x.from, x.to].forEach(i => { if (pinned.includes(i)) met.add(i); }); }); });
      (g.edges || []).forEach(e => { if ((e.label || e.step != null) && !e.lbl) [e.from, e.to].forEach(i => { if (pinned.includes(i)) met.add(i); }); }); }
    const fam = O(), homes = O(); (g.families || []).forEach(f => { fam[f.id] = f; arrOf(f.nodeIds).forEach(i => { (homes[i] ||= []).push(f.id); }); });
    const hit = i => { if (met.has(i)) return true; const st = [...(homes[i] || [])]; for (let k = 0; st.length && k <= 4096; k++) { const f = st.pop(); if (met.has(f)) return true; if (fam[f] && fam[f].parent != null) st.push(fam[f].parent); } return false; };
    const all = [...pinned].reverse(), pins = [...all.filter(hit), ...all.filter(i => !hit(i))]; // what they meet first, then the rest, last first
    if (!pins.length) return [g, said];
    // a picture with nothing but what weighs less than a box over another or a shared line never settles a pin one step from the
    // cell its card takes with no pin of its own (Alt + an arrow on a card with none) back on that cell, nor short of the pin on
    // the way from it; beside it or past it is kept (audit 62: Alt + Right on the AWS view's CDN, a label then on a group's border,
    // drew the card back where it was, and a row down at best: the model held the pin, and each further Alt + Right wrote it again)
    const fr = O(), cell = (h, i) => { const n = (h.byId || {})[i] || (h.nodes || []).find(x => x.id === i); return n && Number.isFinite(n.col) ? [n.col, n.row] : null; };
    const freeOf = i => { if (!Object.hasOwn(fr, i)) { const L2 = { ...v.layout }; delete L2[i]; const q = (L.rank === false ? onGrid(vid, L2) : fillLayout(vid, L2, true))[i]; fr[i] = Array.isArray(q) ? q : null; } return fr[i]; };
    const back = (h, ids) => n0 < 100 && ids.some(i => { const p = v.layout[i], f = Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? freeOf(i) : null, q = f && cell(h, i);
      if (!q) return false; const d = [p[0] - f[0], p[1] - f[1]], k = Math.abs(d[0]) + Math.abs(d[1]); return k > .01 && k <= 1.01 && (q[0] - f[0]) * d[0] + (q[1] - f[1]) * d[1] < k * k - .01; });
    let best = { g, n: n0, memo: null, said }, left = 12; const seen = new Set();
    for (const i of pins) { const n0 = (g.byId || {})[i] || (g.nodes || []).find(n => n.id === i), p = n0 && Number.isFinite(n0.col) ? [n0.col, n0.row] : v.layout[i];
      for (let m = 1; m <= 2 && best.n && left > 0; m++) for (let dc = -m; dc <= m && best.n && left > 0; dc++) for (const dr of new Set([m - Math.abs(dc), Math.abs(dc) - m])) {
        if (!best.n || left <= 0) break; const c = p[0] + dc, r = p[1] + dr; if (c < 0 || r < 0) continue;
        const L2 = { ...v.layout, [i]: [c, r] }, pos = L.rank === false ? onGrid(vid, L2) : fillLayout(vid, L2, true), key = JSON.stringify(pos); if (seen.has(key)) continue; seen.add(key); left--;
        const m2 = {}, [h, w] = held(() => run(pos, m2)), k = score(h);
        if (k < best.n && !back(h, [i])) best = { g: h, n: k, memo: m2, said: w }; } }
    // none of those clean (a region's box reaches past the cells the pins settle by: audit 60, order-states' parcel-start dropped
    // right of Fulfilling, its box over In delivery): the pins that meet something dropped, so those cards take a slot as a card
    // with no pin does (boxFit), the pins the picture can keep kept. One at a time first, in that order (audit 61: a pin in the
    // composite's other region, which met nothing itself, went with the one that did, and a clean drag there did nothing), then all
    const hits = pins.filter(hit), drop = ids => { const L2 = { ...v.layout }; ids.forEach(i => { delete L2[i]; });
      const pos = L.rank === false ? onGrid(vid, L2) : fillLayout(vid, L2, true), m2 = {}, [h, w] = held(() => run(pos, m2)), k = score(h);
      if (k < best.n && !back(h, ids)) best = { g: h, n: k, memo: m2, said: w }; };
    if (best.n && hits.length) { if (hits.length > 1) for (const i of hits.slice(0, 6)) { if (!best.n) break; drop([i]); } if (best.n) drop(hits); }
    if (best.memo) { Object.keys(memo).forEach(k => { delete memo[k]; }); Object.assign(memo, best.memo); }
    return [best.g, best.said];
  }
  function hubGeo(vid, P, edges, repair, quick) {
    const NH = V[vid].subAndChips ? 80 : 64, CG = 108, RG = 44, pitch = NH + RG, hub = P.hub;
    const all = P.lanes.flatMap(l => l.ids).concat(hub);
    const widths = byId(all.map(i => [i, mapNodeW(nodeIn(i, vid))]));
    const nodeW = widths[hub];
    const stepTxt = id => { const s = (P.steps || O())[id] || []; return s.length > 2 ? s[0] + '+' : s.join('·'); };
    const nodesOut = [{ ...nodeIn(hub, vid), sub: nodeIn(hub, vid).sub || nodeIn(hub, vid).sublabel, kids: kidCount(hub, vid), opens: !!opensOf(hub, vid), ax: 0, ay: 0, w: nodeW, h: NH }];
    const lanes = [], blocks = [], spine = [];
    let x = nodeW + CG, maxRows = 1;
    const rowAt = O();
    P.lanes.forEach((L, li) => {
      const x0 = x; spine[li] = x0 - CG + 28;
      const SUBG = 54; // columns inside a lane carry no branch labels, so they sit closer
      L.cols.forEach((col, j) => {
        const colW = Math.max(...col.map(id => widths[id]));
        const taken = new Set();
        col.forEach((id, r) => { // a follow-on part lines up with the part that leads to it
          let row = r;
          if (j > 0) { const src = edges.find(e => e.to === id && rowAt[e.from] != null && P.lanes[li].ids.includes(e.from)); row = src ? rowAt[src.from] : r; while (taken.has(row)) row++; }
          taken.add(row); rowAt[id] = row; maxRows = Math.max(maxRows, row + 1);
          nodesOut.push({ ...nodeIn(id, vid), sub: nodeIn(id, vid).sub || nodeIn(id, vid).sublabel, kids: kidCount(id, vid), opens: !!opensOf(id, vid), ax: x, ay: row * pitch, w: widths[id], h: NH, lane: li, step: stepTxt(id) });
        });
        // a labelled line to the next column holds its label and step mark, with 27 px of line each side (layoutPass's gapAfter;
        // at 54 px its label found no spot and was left off, audit 6)
        const next = new Set(L.cols[j + 1] || []), w = Math.max(0, ...edges.filter(e => e.label && (col.includes(e.from) && next.has(e.to) || col.includes(e.to) && next.has(e.from)))
          .map(e => pillW(e.label, e.sublabel) + (e.step != null ? stepW(e.step) + 4 : 0) + 54));
        x += colW + (j < L.cols.length - 1 ? Math.max(SUBG, w) : CG);
      });
      const right = x - CG + 16;
      const lx = P.boxed ? x0 - CG + 40 : x0 - 12, lw = P.boxed ? right - lx : right - 4 - lx;
      lanes.push({ title: L.title, ids: L.ids, x: lx, y: -62, w: lw, h: 0, gap: 24, bare: !P.boxed });
      const hx = P.boxed ? lx : x0 - 12;
      blocks.push({ x: hx + 12, y: -52, w: Math.min(lw - 24, 34 + sansW(L.title, 11, .95) + 8 + textW('00 parts', 11)), h: 22, title: L.title });
      if (P.boxed && li < P.lanes.length - 1) blocks.push({ x: lx + lw + 4, y: -48, w: 16, h: 18, title: L.title + ' → next' });
    });
    lanes.forEach(l => { l.h = maxRows * pitch - RG + 30 + 62; });
    // the comb: trunk from the hub, a spine per lane, a branch into each callee with its label at the end
    const yh = NH / 2, yt = -24, hubR = nodeW, byIdLocal = byId(nodesOut.map(n => [n.id, n]));
    const comb = [], others = [];
    const prepared = prepEdges(vid, edges.filter(e => e.from !== hub || P.branch.has(e.to)), P.backKeys);
    prepared.forEach(e => {
      if (e.from !== hub) return others.push(e);
      const c = byIdLocal[e.to]; if (!c) return;
      const li = c.lane, xs = spine[li], yc = c.ay + NH / 2;
      let pts = li === 0 ? [[hubR, yh], [xs, yh], [xs, yc], [c.ax, yc]] : [[hubR, yh], [spine[0], yh], [spine[0], yt], [xs, yt], [xs, yc], [c.ax, yc]];
      pts = pts.filter((p, k) => !k || p[0] !== pts[k - 1][0] || p[1] !== pts[k - 1][1]);
      pts = pts.filter((p, k) => k === 0 || k === pts.length - 1 || !((pts[k - 1][0] === p[0] && p[0] === pts[k + 1][0]) || (pts[k - 1][1] === p[1] && p[1] === pts[k + 1][1])));
      const tag = condTag(e.label), avail = c.ax - 26 - (xs + 10);
      const text = avail >= 44 ? fit(tag || e.label || '', 10.5, Math.max(30, avail - 20) / .92) : '', sub = text && e.sublabel ? fit(e.sublabel, 9.5, Math.max(30, avail - 20) / .92) : '';
      const w = Math.min(avail, pillW(text, sub)), h = sub ? 32 : 20;
      e.fixed = pts; e.lbl = text ? { x: c.ax - 26 - w, y: yc - h / 2, w, h, text, ...(sub ? { sub } : {}), step: null, tag: !!tag } : null;
      comb.push(e);
    });
    return layoutGraph({ nodeH: NH, subAndChips: !!V[vid].subAndChips, abs: true, nodes: nodesOut, edges: [...comb, ...others], lanes, blocks, laneGap: 24, repair, hub, tour: V[vid].tour, authors: D.authors, quick }, true);
  }
  /* crossing-minimising local search over rows and sides; `visual.py render` bakes the result into the page */
  function scoreGeo(g) {
    const bad = routeAudit(g, '').length, len = g.edges.reduce((a, e) => a + e.pts.slice(1).reduce((s, p, i) => s + Math.abs(p[0] - e.pts[i][0]) + Math.abs(p[1] - e.pts[i][1]), 0), 0);
    const bends = g.edges.reduce((a, e) => a + e.pts.length, 0), drop = g.edges.filter(e => e.label && !e.lbl).length;
    const st = g.stats || {};
    return bad * 1000 + ((st.cross || 0) + (st.fallback || 0)) * 150 + drop * 40 + len / 15 + bends * 12 + g.bounds.w * g.bounds.h / 4e5;
  }
  function optimize(vid, budget = 160) {
    budget = Math.max(budget, Math.min(400, 20 * (V[vid].nodeIds || []).length));
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]);
    let pos = JSON.parse(JSON.stringify(autoPos(vid)));
    const start = JSON.stringify(pos), boxed = (v.containers || []).length, homeOf = i => ((v.containers || []).filter(c => (c.nodeIds || []).includes(i)).pop() || {}).id; // blocks stay whole
    const lined = new Set(viewEdges(v).filter(e => e.from !== e.to).flatMap(e => [e.from, e.to])), loose = i => lined.size && !lined.has(i);
    let best = scoreGeo(buildGeo(vid, pos, false, true)), evals = 1;
    // a cap on work, not on a clock, so every machine bakes the same layout (audit 7). An evaluation costs about lines²;
    // the caps are what 4 s (12 s while problems remain) gave on a fast laptop.
    // ponytail: lines² is a proxy for a routing's cost (boxes make it dearer); count the router's own steps if it drifts
    const cost = Math.max(1, viewEdges(v).length) ** 2, more = () => evals < budget * (best >= 1000 ? 2.5 : 1) && evals * cost < (best >= 1000 ? 120000 : 40000);
    const hub = subjectOf(v), hubCol = hub && pos[hub] ? pos[hub][0] : null;
    const tryPos = cand => { evals++; const s = scoreGeo(buildGeo(vid, cand, false, true)); if (s < best - 0.5) { best = s; pos = cand; return true; } return false; };
    let improved = true;
    while (improved && more()) {
      improved = false;
      for (const a of ids) {
        if (!more()) break;
        if (loose(a)) continue; // the row of cards with no line (#46) routes nothing
        const [ca, ra] = pos[a];
        const moves = [];
        // columns are the reading order, so only the order inside a column may change
        const band = i => isState(i) && !viewEdges(v).some(e => e.from === i);
        const stateFloor = () => Math.max(-1, ...ids.filter(i => !band(i) && !loose(i)).map(i => pos[i][1]));
        ids.forEach(b => { if (b !== a && !loose(b) && pos[b][0] === ca && band(a) === band(b) && (!boxed || homeOf(a) === homeOf(b))) moves.push(['swap', b]); });
        if (!boxed) moves.push(['row', -1], ['row', 1]);
        for (const [kind, arg] of moves) {
          if (evals >= budget) break;
          const c = JSON.parse(JSON.stringify(pos));
          if (kind === 'swap') { if (a === hub) continue; const t2 = c[a]; c[a] = c[arg]; c[arg] = t2; }
          else if (kind === 'col') { const nc = ca + arg; let r = ra; while (ids.some(b => b !== a && c[b][0] === nc && Math.abs(c[b][1] - r) < 1)) r++; c[a] = [nc, r]; }
          else if (kind === 'row') {
            let r = ra + arg;
            if (band(a) && r <= stateFloor()) r = stateFloor() + 1;
            while (ids.some(b => b !== a && c[b][0] === ca && Math.abs(c[b][1] - r) < 1)) r += arg > 0 ? 1 : -1; // rows may be half rows: keep a row apart
            if (r < 0 || (band(a) && r <= stateFloor())) continue;
            c[a][1] = r;
          }
          else { const nc = 2 * hubCol - ca; const occ = ids.find(b => c[b][0] === nc && c[b][1] === ra); if (occ) c[occ][0] = ca; c[a][0] = nc; }
          if (Math.min(...ids.map(i => c[i][0])) < 0) { const m = Math.min(...ids.map(i => c[i][0])); ids.forEach(i => { c[i][0] -= m; }); }
          if (tryPos(c)) { improved = true; break; }
        }
      }
    }
    // it scores without port repair: render()'s layout stays unless the one it found routes better as the page draws it (#86: for
    // r15's monorepo it baked in a crossing that render()'s layout has not)
    if (JSON.stringify(pos) !== start && scoreGeo(buildGeo(vid, JSON.parse(start))) <= scoreGeo(buildGeo(vid, pos))) pos = JSON.parse(start);
    return { pos, score: best, evals };
  }
  // what a view's picture is drawn from: an update keeps the layout of every view whose key did not change (jsonText: a host's cycle or BigInt in a card is no throw, audit 28)
  const viewKey = vid => {
    const v = V[vid], ids = (v.nodeIds || []).filter(i => N[i]), ns = ids.map(i => nodeIn(i, vid));
    const icons = [...new Set(ns.map(n => n.icon).filter(Boolean))].map(k => (D.icons || {})[k]), who = [...new Set(ns.map(n => n.author).filter(Boolean))].map(k => (D.authors || {})[k]);
    return jsonText([v, ns, viewEdges(v), ids.map(i => [kidCount(i, vid), opensOf(i, vid)]), icons, who, boxesOf(vid), v.diagram && v.diagram != 'map' && [D.nodes, D.edges, D.icons, views, (V[v.parent] || {}).nodeIds, D.schemaVersion]]); // a type's boxes lay it out; a typed view also draws what it does not list (a package's name, the title of a view it opens, a DFD parent's cards, the lifelines, messages and fragments of the sequence view an overview's inline interaction draws, audit 30): the whole model, and its schemaVersion (version 1 draws it as a map, audit 38)
  };
  /* ---------- unfolding in place (#71): a stacked card opens into a box on the view it is on ----------
     The card becomes a box with its id and name, holding its inner view's own cards: those not on this view already (the
     inner view's other cards are this view's, its neighbours). Inside, the inner view's lines between them. This view's
     lines stay this view's: one to the card moves onto every card inside that the inner view joins to that neighbour, the
     same way round, or, with none, ends on the box's border; the inner view's other lines to neighbours are not added. The
     box is the inner view's own cards in their own order, at the card's place: later columns move right by its width, and
     the cards under it in its column move down by its height, so the rest of the picture keeps its places (a hub view, which
     has no columns, is laid out again). The inner view's boxes that hold its own cards come along inside, and a numbered
     (sequence) view's run order: its numbers, its loops back and its lanes (#82). Not in a numbered view: its own steps
     would be numbered again; that card opens. Nor into another kind of diagram: that card opens too. */
  // the inner view's own cards: those this view shows neither as cards nor as boxes (a card unfolded here already is one, #98)
  const ownOf = (v, C, nid) => (C.nodeIds || []).filter(i => N[i] && i !== nid && !(v.nodeIds || []).includes(i) && !(v.containers || []).some(b => b && b.id === i));
  const unfoldable = (nid, vid) => { const v = V[vid], ids = (v && v.nodeIds) || [], c = ids.includes(nid) && N[nid] && v.render !== 'sequence' ? childOf(nid, vid) : null;
    if (!c || c === vid || chain(vid).includes(c) || (v.containers || []).some(b => b && b.id === nid) || V[c].diagram != v.diagram || v.diagram && v.diagram != 'map' && !(diagramOf(v) || {}).unfolds) return null;
    return ownOf(v, V[c], nid).length ? c : null; };
  function unfold(vid, nid) {
    const v = V[vid], c = unfoldable(nid, vid); if (!c) return false;
    const C = V[c], outer = (v.nodeIds || []).filter(i => N[i]), inner = ownOf(v, C, nid);
    const n0 = nodeIn(nid, vid), holder = (v.containers || []).filter(b => b && (b.nodeIds || []).includes(nid)).pop();
    const boxes = (v.containers || []).filter(b => b && b.id).map(b => ({ ...b, nodeIds: (b.nodeIds || []).filter(i => i !== nid) }));
    const taken = new Set([...outer, ...inner, ...boxes.map(b => b.id)]);
    const cb = (C.containers || []).filter(b => b && b.id && !taken.has(b.id) && (b.nodeIds || []).some(i => inner.includes(i))), kept = new Set(cb.map(b => b.id));
    const above = b => { let p = b.parent; for (let k = 0; p != null && !kept.has(p) && k < 64; k++) p = ((C.containers || []).find(x => x && x.id === p) || {}).parent; return kept.has(p) ? p : nid; };
    // a numbered view drawn around one card (a hub) brings its lanes, boxed as it draws them, in their order (#82)
    const hp = C.render === 'sequence' && planOf(c).hub ? planOf(c) : null;
    const lanes = hp && hp.boxed ? hp.lanes.map((L, j) => ({ id: `${nid}:lane${j + 1}`, label: L.title, lane: true, nodeIds: L.ids.filter(i => inner.includes(i)), parent: nid })).filter(b => b.nodeIds.length) : [];
    const own = [...cb.map(b => ({ ...b, nodeIds: b.nodeIds.filter(i => inner.includes(i)), parent: above(b) })), ...lanes], boxed = new Set(own.flatMap(b => b.nodeIds));
    const box = { id: nid, label: n0.label || nid, nodeIds: inner.filter(i => !boxed.has(i)), unfolds: c, ...(holder ? { parent: holder.id } : {}), ...(badgesOf(n0).length ? { badges: badgesOf(n0) } : {}) };
    const isIn = id => inner.includes(id) || kept.has(id), mine = viewEdges(v);
    const to = new Set(mine.filter(e => e.to === nid).map(e => e.from)), from = new Set(mine.filter(e => e.from === nid).map(e => e.to)); // this view's neighbours of the card
    let theirs = viewEdges(C).filter(e => isIn(e.from) ? isIn(e.to) || from.has(e.to) : isIn(e.to) && to.has(e.from));
    // a line drawn both ways stays a pair: it moves inside only if the inner view joins that neighbour to one card both ways
    const ends = (a, out) => [...new Set(theirs.filter(e => out ? isIn(e.from) && e.to === a : e.from === a && isIn(e.to)).map(e => out ? e.from : e.to))].join();
    const split = new Set([...to].filter(a => from.has(a) && (ends(a, true) || ends(a, false)) && (ends(a, true) !== ends(a, false) || ends(a, true).includes(','))));
    theirs = theirs.filter(e => !split.has(isIn(e.from) ? e.to : e.from));
    /* a numbered view's run order comes along (#82): its lines keep their numbers, and a step back stays a loop back. A step
       between the card itself and a card inside has no line (the card is the box), and a hub's steps show on the cards they
       reach, as the numbered view draws them: those numbers go on that card inside. On a numbered card (a process view's
       step, or one an unfolded numbered view numbered) they go under its number: step 4's are 4.1, 4.2 */
    const tags = O(), onCard = e => e.from === nid ? e.to : e.to === nid ? e.from : hp && e.from === hp.hub ? e.to : null;
    const sid = v.stepIds || outer, at = (v.mainSteps || v.render === 'process') && sid.includes(nid) ? sid.indexOf(nid) + 1 : (v.cardSteps || O())[nid];
    const num = j => /^\d+(\.\d+)*$/.test(String(at ?? '')) ? `${at}.${j + 1}` : j + 1; // a card with several numbers (2·3) holds no one step
    if (C.render === 'sequence') { const lq = loopsOf(C);
      lq.edges.forEach((e, j) => { const o = onCard(e); if (inner.includes(o)) (tags[o] ||= []).push(num(j)); });
      theirs = theirs.map(e => { const j = lq.edges.indexOf(e); return { ...e, ...(inner.includes(onCard(e)) ? {} : { step: num(j) }), ...(lq.back.has(j) ? { loop: true } : {}) }; }); }
    const exact = new Set(theirs.flatMap(e => isIn(e.from) === isIn(e.to) ? [] : isIn(e.to) ? [e.from + '>'] : ['>' + e.to])); // neighbours the inner view joins to a card inside
    const k = (v.nodeIds || []).indexOf(nid), grid = !planOf(vid).hub;
    const pos = grid ? (v.layout ? fillLayout(vid, v.layout) : (layoutCache[vid] ||= autoPos(vid))) : null;
    Object.assign(v, { nodeIds: [...v.nodeIds.slice(0, k), ...inner, ...v.nodeIds.slice(k + 1)], containers: [...boxes, box, ...own],
      edges: [...mine.filter(e => !(e.to === nid && exact.has(e.from + '>')) && !(e.from === nid && exact.has('>' + e.to))), ...theirs] });
    if ((v.tour || []).includes(nid)) delete v.tour;
    if (v.mainSteps || v.render === 'process') v.stepIds = v.stepIds || outer; // the steps keep their numbers; the cards inside are not steps
    if (Array.isArray(v.intake)) v.intake = v.intake.filter(s => s && s.to !== nid);
    if (+C.gap > (v.gap || 66)) v.gap = +C.gap; if (+C.rgap > (v.rgap || 44)) v.rgap = +C.rgap; // the room the inner view's lines were given
    Object.entries(tags).forEach(([i, s]) => { (v.cardSteps ||= O())[i] = s.length > 2 ? s[0] + '+' : s.join('·'); }); // as hubGeo's stepTxt; buildGeo draws them
    delete v.layout; delete planCache[vid]; delete layoutCache[vid]; delete drawn[vid];
    if (!grid) return true; // a hub view has no columns to keep: laid out again, with its boxes
    /* the box's slots: the inner view's own cards in its columns, or in this view's reading order, and in its rows packed,
       upside down, or each card level with its neighbours (the median row of the cards outside it joins to, and of those to
       its left inside, as rowsFor does). Each way is routed, and the one the layout check scores best is kept */
    const [xc, xr] = pos[nid] || [0, 0], seen = new Set(), ways = [], med = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const levelled = (ic, ir) => { const R = O(), cols = [...new Set(inner.map(ic))].sort((a, b) => a - b);
      cols.forEach(k => { const want = O(), col = inner.filter(i => ic(i) === k);
        col.forEach(i => { const nb = theirs.flatMap(e => e.from === i ? [e.to] : e.to === i ? [e.from] : []).map(o => !isIn(o) && pos[o] ? pos[o][1] - xr : R[o]).filter(r => r != null);
          want[i] = nb.length ? med(nb) : ir(i); });
        let prev = -1; col.sort((a, b) => want[a] - want[b] || ir(a) - ir(b)).forEach(i => { R[i] = prev = Math.max(0, Math.round(want[i]), prev + 1); }); });
      return i => R[i]; };
    // with boxes of its own, the inner view keeps its slots, moved to the box's corner: empty slots are its boxes' room. Else
    // its columns, or columns in this view's own reading order: a loop the inner view closes with one line may close here
    // with another, or not at all
    const inBox = (id, seen = new Set()) => seen.has(id) ? [] : (seen.add(id), [...((boxes.find(x => x.id === id) || {}).nodeIds || []), ...boxes.filter(k => k.parent === id).flatMap(k => inBox(k.id, seen))]);
    const xBoxes = new Set(); for (let b = holder, k = 0; b && k < 64; k++, b = boxes.find(x => x.id === b.parent)) xBoxes.add(b.id); // the boxes the card is in
    // a hub's slots, as it draws them: the hub, then its lanes' columns in order (#82). ponytail: rows in each column's order,
    // not level with the part before as hubGeo lines them up; do that if a lane of several columns reads badly
    const hs = hp && byId([[hp.hub, [0, 0]]]);
    if (hs) hp.lanes.flatMap(L => L.cols).map(col => col.filter(i => inner.includes(i))).filter(col => col.length).forEach((col, j) => col.forEach((i, r) => { hs[i] = [j + 1, r]; }));
    const ip0 = hs || (C.layout ? fillLayout(c, C.layout) : (layoutCache[c] ||= autoPos(c))), lp = loopsOf(v), rk = byId(inner.map(i => [i, 0]));
    const fwd = lp.edges.filter((e, j) => !lp.back.has(j) && e.from !== e.to && inner.includes(e.from) && inner.includes(e.to));
    for (let it = 0; it < inner.length; it++) fwd.forEach(e => { if (rk[e.to] < rk[e.from] + 1) rk[e.to] = rk[e.from] + 1; });
    const one = own.length || v.nodeIds.length > 30; // its boxes' room to keep, or too big to route seven times: its own slots only
    // the sides the inner view gave its lines are for its own picture: with its own slots they stay; elsewhere each way is
    // also routed with the router picking them (copies, which keep the ids)
    const keepE = v.edges, freeE = theirs.some(e => e.fromSide || e.toSide) ? keepE.map(e => theirs.includes(e) && (e.fromSide || e.toSide) ? (({ fromSide, toSide, ...r }) => r)(e) : e) : null;
    [ip0, ...(one ? [] : [byId(inner.map(i => [i, [rk[i], (ip0[i] || [0, 0])[1]]]))])].forEach(ip => (one ? [false] : [false, true, 'level']).forEach(flip => {
      const at = (i, j) => (ip[i] || [0, 0])[j], rank = j => { const u = [...new Set(inner.map(i => at(i, j)))].sort((a, b) => flip === true && j ? b - a : a - b), lo = u[0];
        const k = j && u.some(r => r % 1) ? 2 : 1; // half rows doubled: a box that ends on a half row gets no gap under it (layoutPass widens whole rows)
        return own.length ? i => (at(i, j) - lo) * k : i => u.indexOf(at(i, j)); };
      const ic = rank(0), ir = flip === 'level' ? levelled(rank(0), rank(1)) : rank(1), w = Math.max(...inner.map(ic)) + 1, h = Math.max(...inner.map(ir)) + 1, L = O();
      outer.forEach(i => { if (i === nid) return; const [c0, r0] = pos[i] || [0, 0]; L[i] = c0 >= xc + .5 ? [c0 + w - 1, r0] : Math.abs(c0 - xc) < .5 && r0 > xr ? [c0, r0 + h - 1] : [c0, r0]; });
      inner.forEach(i => { L[i] = [xc + ic(i), xr + ir(i)]; });
      // a box of this view with cards on both sides of the card's column, under it, would now reach into the unfolded box:
      // it moves down under it, whole; then a card on a taken slot moves down a row
      boxes.forEach(b => { if (xBoxes.has(b.id)) return; const ms = inBox(b.id).filter(i => L[i]); if (!ms.length) return;
        const cs = ms.map(i => L[i][0]), rs = ms.map(i => L[i][1]);
        if (Math.max(...cs) < xc || Math.min(...cs) > xc + w - 1 || Math.max(...rs) < xr || Math.min(...rs) > xr + h - 1) return;
        const dr = xr + h - Math.min(...rs); ms.forEach(i => { L[i] = [L[i][0], L[i][1] + dr]; }); });
      const slots = inner.map(i => L[i]); outer.forEach(i => { if (i === nid) return; let [c0, r0] = L[i];
        while (slots.some(([c1, r1]) => c1 === c0 && Math.abs(r1 - r0) < 1)) r0++; slots.push(L[i] = [c0, r0]); });
      const key = JSON.stringify(inner.map(i => L[i])); if (seen.has(key)) return; seen.add(key);
      ways.push({ L, free: false }); if (freeE && (ip !== ip0 || flip !== false)) ways.push({ L, free: true }); }));
    // a card inside a box it is not in reads as one of the box's (and loses a line to the box): a way with one loses
    const strays = g => (g.families || []).reduce((a, f) => a + g.nodes.filter(n => !(f.nodeIds || []).includes(n.id) && n.x + n.w / 2 > f.x && n.x + n.w / 2 < f.x + f.w && n.y + n.h / 2 > f.y && n.y + n.h / 2 < f.y + f.h
      && !(g.families || []).some(o => o.id !== f.id && (o.nodeIds || []).includes(n.id) && o.x >= f.x && o.y >= f.y && o.x + o.w <= f.x + f.w && o.y + o.h <= f.y + f.h)).length, 0);
    let best = null; // ponytail: up to 12 routings per unfold, a view of over 30 cards one; a smarter search when a bigger map needs it
    const score = ({ L, free }) => { v.edges = free ? freeE : keepE; const [g, said] = held(() => buildGeo(vid, L)); g.said = said;
      const s = scoreGeo(g) + (strays(g) * 5 + leaveIssues(g, '').length) * 1000; if (!best || s < best.s - .5) best = { L, g, s, free }; };
    ways.forEach(score);
    // still an issue, and cards under the card in its column: the box one column to the right instead, so they keep their slots
    if (best.s >= 1000 && v.nodeIds.length <= 30 && outer.some(i => i !== nid && pos[i] && Math.abs(pos[i][0] - xc) < .5)) { const B = best.L, L = O();
      outer.forEach(i => { if (i === nid) return; const [c0, r0] = pos[i] || [0, 0]; L[i] = c0 >= xc + .5 ? [c0 + 1 + Math.max(...inner.map(j => B[j][0])) - xc, r0] : [c0, r0]; });
      inner.forEach(i => { L[i] = [B[i][0] + 1, B[i][1]]; }); score({ L, free: best.free }); }
    best.g.said.forEach(warn); delete best.g.said;
    v.edges = best.free ? freeE : keepE; v.layout = best.L; drawn[vid] = { pos: best.L, g: best.g }; // drawn as scored, without routing it again
    return true;
  }
  const unfolded = O(); // per view: the cards opts.expand named that did unfold, in order (one inside another unfolds after it)
  withM(() => Object.entries(opts.expand || {}).forEach(([vid, ids]) => { let todo = V[vid] ? [...new Set([].concat(ids || []))] : [];
    for (let more = true; more && todo.length;) { more = false; todo = todo.filter(nid => { if (!unfold(vid, nid)) return true; (unfolded[vid] ||= []).push(nid); return !(more = true); }); } }))();
  const geoCache = O();
  /* what a plain view's picture takes from the order of its cards, before routing (diff, audit 43): its grid slots, each way
     bestFlow tries, by card; null where only laying it out tells (a type's own layout, a hub plan, a view with some cards pinned,
     a fully pinned view with lines: it keeps its slots, but its ports and lines are routed in the order of its cards, audit 44) */
  function gridKey(vid) { const v = V[vid]; if (!v || ownLayout(vid) || (planCache[vid] || O()).hub) return null;
    const ids = [...new Set((v.nodeIds || []).filter(i => N[i]))].sort(), key = l => JSON.stringify(l.map(p => ids.map(i => p[i] || null)));
    if (v.layout) { if (viewEdges(v).length) return null; const L = onGrid(vid, v.layout); return ids.every(i => Array.isArray(L[i])) ? key([L]) : null; }
    if ((v.containers || []).length) return key([blockPos(vid)]);
    const n = (v.nodeIds || []).length;
    return key(n > 30 || n < 3 ? [flowPos(vid)] : [{}, { pull: true }, { packed: true }, { pull: true, packed: true }].map(o => flowPos(vid, o))); }
  return { D, views, nodes, N, V, rootId, nodeIn, childOf, opensOf, subjectOf, viewsWith, kidsOf, chain, viewEdges, isState, planOf: withM(planOf), planCache,
    layoutCache, geoCache, memos, buildGeo: withM(buildGeo), buildView: withM(buildView), optimize: withM(optimize), flowPos, kidCount, viewKey, brokenIn, unfoldable, unfolded, gridKey: withM(gridKey) };
}
const edgeRefIds = e => [...new Set((e.all || [e]).map(x => x._id).filter(Boolean))];

/* layout(model, viewId): one view's geometry, as the canvas draws it. No DOM. */
export function layout(model, viewId, options = {}) {
  const ctx = mapContext(model, { measure: options.measure, ...(options.expand ? { expand: { [viewId]: options.expand } } : {}) }); // expand: cards unfolded in place (#71)
  if (!ctx.V[viewId]) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  ctx.planOf(viewId);
  const g = ctx.buildGeo(viewId, undefined, options.repair);
  g.edges.forEach(e => { e.ids = edgeRefIds(e); });
  if (options.expand) g.unfolded = ctx.unfolded[viewId] || [];
  return g;
}

/** The layout check's geometry for one view, without a browser: overlapping cards, crossing or shared lines, detours,
 *  lines round their own ends, against reading order or through a card, labels on lines or off their own, boxes and lanes. The page's check
 *  (`umlimator.py check`) adds what it measures in the DOM: text that overflows its card or touches its mark, titles
 *  that overflow, edge labels on cards or on each other. Each issue names the cards and lines it is about. */
export function check(model, viewId, options = {}) {
  const g = layout(model, viewId, options), where = `view ${viewId}`, about = [], lines = new Set([...g.edges, ...(g.notDrawn || [])]), boxes = new Set(g.families || []);
  const ref = x => lines.has(x) ? { type: 'edge', ids: x.ids, view: viewId } : boxes.has(x) ? { type: 'container', id: x.id, view: viewId } : { type: 'node', id: x.id, view: viewId };
  return [...overlapIssues(g, where, about), ...routeAudit(g, where, null, about), ...throughIssues(g, where, about), ...leaveIssues(g, where, about)]
    .map((message, i) => ({ message, targets: about[i].filter(Boolean).map(ref) }));
}
const WIRE_KINDS = ['calls', 'feeds', 'triggers', 'state', 'guard'], SIDES = ['left', 'right', 'top', 'bottom'];
/* A typed view's panel text fields (its type's props: a C4 element's description, a guard, a lifeline's represents, a column's
   type) on the elements it lists, its nodes, their members and its lines, each drawn or said as text: one that is not text is
   drawn "[object Object]", said as a label is, at its own path (audit 43: the structural views' instance classifier, link
   association, end role, collaboration use, port and role types were drawn so with no warning, and every other type's fields).
   A field its type marks drawn: false (a reference: a reply's call, a use's interaction, a call activity's element) is never
   drawn, so its warning says the panel alone shows it (audit 44: each was said "drawn as" what no picture held); drawn: a
   function (model, element) says whether some view draws it, as a C4 deployment node's description is on a leaf, never on a box
   (audit 45) */
const NOT_DRAWN = 'not drawn, and the panel shows it as';
function fieldTextProblems(m, v, T, memos = new Map()) {
  const memoOf = f => memos.get(f) || memos.set(f, new Map()).get(f);
  const F = T && T.props && typeof T.props === 'object' ? T.props : null; if (!F) return [];
  const arr = x => (Array.isArray(x) ? x : []), obj = x => x && typeof x === 'object' && !Array.isArray(x), out = [], vi = arr(m.views).indexOf(v), shown = new Set(arr(v.nodeIds)), mems = new Set();
  const check = (x, at, kind) => { if (!obj(x.props) || typeof kind !== 'string' || !Object.hasOwn(F, kind)) return;
    arr(F[kind]).forEach(f => { if (!obj(f) || f.kind !== 'text' || typeof f.key !== 'string') return; const path = Array.isArray(f.path) ? f.path.map(String) : [f.key];
      let o = x.props; for (const k of path.slice(0, -1)) o = obj(o) && Object.hasOwn(o, k) ? o[k] : undefined;
      const key = path[path.length - 1], where = `${at}.props${path.slice(0, -1).map(k => '.' + k).join('')}`;
      // drawn asked only of a value that is not text, to word its warning (audit 46: a C4 deployment node's text description
      // ran depLeaf, a depPic per view, on every node: validate() went quadratic); memo: one per validate() run, for drawn's own use
      const p = obj(o) && Object.hasOwn(o, key) ? labelProblem(o, where, key) : null;
      if (p) out.push(f.drawn === false || (typeof f.drawn === 'function' && !f.drawn(m, x, memoOf(f))) ? labelProblem(o, where, key, NOT_DRAWN) : p); }); };
  const nodes = new Map(); [...Array.from(arr(m.nodes), (n, i) => [n, `nodes[${i}]`]), ...Array.from(arr(v.nodes), (n, j) => [n, `views[${vi}].nodes[${j}]`])].forEach( // Array.from: a hole is an undefined entry (audit 57)
    ([n, at]) => { if (obj(n) && typeof n.id === 'string' && !nodes.has(n.id)) nodes.set(n.id, [n, at]); });
  shown.forEach(id => { if (!nodes.has(id)) return; const [n, at] = nodes.get(id); check(n, at, drawnKind(T, n));
    arr(n.members).forEach((x, j) => { if (obj(x)) { check(x, `${at}.members[${j}]`, x.type); mems.add(x.id); } }); });
  const lines = new Map(); arr(m.edges).forEach((e, i) => { if (obj(e) && typeof e.id === 'string' && !lines.has(e.id)) lines.set(e.id, [e, `edges[${i}]`]); });
  if (Array.isArray(v.edges)) v.edges.forEach((e, j) => { const r = typeof e === 'string' ? lines.get(e) : obj(e) ? [e, `views[${vi}].edges[${j}]`] : null; if (r) check(r[0], r[1], r[0].type); });
  else { const on = id => shown.has(id) || mems.has(id); arr(m.edges).forEach((e, i) => { if (obj(e) && on(e.from) && on(e.to)) check(e, `edges[${i}]`, e.type); }); }
  return out;
}

/** A model's own problems, before anything is drawn: errors draw as holes or not at all (ids that are missing,
 *  repeated or name nothing, boxes inside themselves); warnings draw other than they say (an unknown kind or weight,
 *  a side that is not one, a view opened before the host has loaded it, a line to itself, which is not drawn). Each says where: `views[2].nodeIds[4]`. */
export function validate(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  // an object with a toString key is no text (String() throws on it): said, and the rest checked without it (audit 19)
  const read = unreadable(model), left = new Set(read.paths); model = read.model; read.paths.forEach(at => err(at, read.thrown.has(at) ? 'a value that throws when it is read (a getter, a Proxy): left out'
    : read.mute.has(at) ? 'a value no text is read from (a Symbol, or a toString, valueOf, toJSON or Symbol.toPrimitive that throws): left out' : 'an object with a "toString" key, which no text is read from: left out'));
  const arr = x => (Array.isArray(x) ? x : []), m = model && typeof model === 'object' ? model : {}, views = arr(m.views).filter(v => v && typeof v === 'object');
  const ver = versionProblem(m); if (ver) (ver.level === 'error' ? err : warn)('schemaVersion', ver.message); // a model this release cannot read is drawn wrongly: say so (F6)
  if (!Array.isArray(m.nodes)) err('nodes', 'the model needs a list of cards');
  if (!views.length) err('views', 'the model has no views');
  arr(m.views).forEach((v, i) => { if (!v || typeof v !== 'object') err(`views[${i}]`, 'a view is an object: left out'); });
  if (m.edges != null && !Array.isArray(m.edges)) err('edges', 'edges is a list: no line is drawn');
  const ids = new Set(), vids = new Set(), lineIds = new Set();
  // schema version 2: typed lines and typed views are the typed core's to check (src/core/model.js), the rest is a map's
  const typed = m.schemaVersion === 2, typedView = v => typed && v.diagram != null && v.diagram !== 'map';
  const card = (n, at) => {
    if (!n || typeof n.id !== 'string' || !n.id) return err(at + '.id', 'a card needs an id');
    if (ids.has(n.id)) err(at + '.id', `card id "${n.id}" is used twice`); ids.add(n.id);
    const k = String(n.kind ?? '').toLowerCase();
    if (n.kind != null && !(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(at + '.kind', `unknown kind "${n.kind}": drawn as a script card`);
    if (n.owner != null && typeof n.owner !== 'string') warn(at + '.owner', 'an owner is a name: ignored');
    const l = labelProblem(n, at); if (l) out.push(l);
    ['when', 'what', 'how', 'origin', 'author', 'note'].forEach(k => { if (n[k] != null && typeof n[k] !== 'string') warn(`${at}.${k}`, `${k} is text: drawn as written`); });
    if (n.source != null && !(typeof n.source === 'string' || Array.isArray(n.source) && n.source.every(s => typeof s === 'string'))) warn(at + '.source', 'source is a path or a list of paths: what is not text is ignored');
    list(n, at, 'verbs');
    shapeIs(n, at);
  };
  const shapeIs = (n, at) => { if (n && n.shape != null && !SHAPE_NAMES.includes(String(n.shape).toLowerCase())) warn(at + '.shape', `unknown shape "${n.shape}": drawn by its kind (the shapes: ${SHAPE_NAMES.join(', ')})`); };
  // a field that must be a list and is not: drawn as if missing (a view's cards: none)
  const list = (x, at, k, box) => { if (x[k] != null && !Array.isArray(x[k])) (k == 'nodeIds' ? err : warn)(`${at}.${k}`, `${k} is a list: ${k != 'nodeIds' ? 'ignored' : box ? 'the box holds no cards' : 'the view draws no cards'}`); };
  const gone = (x, at) => { if (x && x.shapes !== undefined) warn(at + 'shapes', 'shapes is no longer read: maps draw in one style'); }; // the box/c4/uml choice, removed in 0.21.0
  gone(m, '');
  if (m.meta && m.meta.root != null && typeof m.meta.root !== 'string') warn('meta.root', 'meta.root is a path: drawn as written');
  arr(m.nodes).forEach((n, i) => card(n, `nodes[${i}]`));
  views.forEach((v, i) => arr(v.nodes).forEach((n, j) => card(n, `views[${i}].nodes[${j}]`)));
  views.forEach((v, i) => { if (typeof v.id !== 'string' || !v.id) err(`views[${i}].id`, 'a view needs an id'); else if (vids.has(v.id)) err(`views[${i}].id`, `view id "${v.id}" is used twice`); else vids.add(v.id);
    const t = labelProblem(v, `views[${i}]`, 'title'); if (t) out.push(t); // a title that is not text, as a card's label (audit 31)
    // its caption, description and note are drawn too: the About box, the PDF's contents and page header, a walkthrough's note (audit 39)
    ['caption', 'description', 'note'].forEach(k => { const c = labelProblem(v, `views[${i}]`, k); if (c) out.push(c); }); });
  // the map's, a story's, a lens's, a rule's and a lane's title are drawn too: the brand, the menus, a rule's mark (audit 34)
  const titled = (x, at, key = 'title') => { const t = labelProblem(x, at, key); if (t) out.push(at ? t : { ...t, path: key }); };
  titled(m, '');
  views.forEach((v, i) => { if (Array.isArray(v.lanes)) v.lanes.forEach((l, j) => { if (l && typeof l === 'object') titled(l, `views[${i}].lanes[${j}]`, l.title == null || l.title === '' ? 'label' : 'title'); }); });
  if (m.root != null && !vids.has(m.root)) err('root', `root "${m.root}" is not a view`);
  const later = (x, at) => { if (x && x.opensView && !vids.has(x.opensView)) warn(at + '.opensView', `opens "${x.opensView}", a view the model does not have: fine if the host loads it when it is opened`); };
  arr(m.nodes).forEach((n, i) => later(n, `nodes[${i}]`));
  views.forEach((v, i) => { gone(v, `views[${i}].`); ['nodeIds', 'containers', 'intake', 'stepIds', 'tour', 'browserOrder'].forEach(k => list(v, `views[${i}]`, k)); });
  // a frontend card is drawn as a browser: a person's icon on one says the model means a person (0.15.0); not said of a card
  // only typed views hold, which keep their own notation (0.21.0)
  const typedOnly = id => { const vs = views.filter(v => arr(v.nodeIds).includes(id)); return vs.length && vs.every(v => typedView(v) && diagramOf(v)); };
  arr(m.nodes).forEach((n, i) => { if (!n || n.shape != null || !['user', 'users', 'usercheck'].includes(n.icon) || typedOnly(n.id)) return;
    if (shapeOf({ ...n, k: kindOf(n.kind, true) }) === 'browser') warn(`nodes[${i}].kind`, `"${labelOr(n.label, n.id)}" has a person's icon, but a ${n.kind} card is drawn as a browser: kind "person" (or shape "person") draws a person`); });
  const line = (e, at, ends) => {
    if (!e || typeof e !== 'object') return err(at, 'a line is an object with from and to');
    ['from', 'to'].forEach(k => { if (!ends.has(e[k])) err(`${at}.${k}`, `"${e[k]}" is neither a card nor a box`); });
    if (e.from != null && e.from === e.to) warn(at, `a line from "${e.from}" to itself: not drawn`); // a self-loop (risks.md F1); typed views will draw one
    if (e.kind != null && !WIRE_KINDS.includes(e.kind)) warn(at + '.kind', `unknown line kind "${e.kind}": drawn as calls`);
    const l = labelProblem(e, at); if (l) out.push(l);
    if (e.weight != null && ![1, 2, 3].includes(e.weight)) warn(at + '.weight', `weight ${jsonText(e.weight)} is not 1, 2 or 3: drawn as 1`);
    ['fromSide', 'toSide'].forEach(k => { if (e[k] != null && !SIDES.includes(e[k])) warn(`${at}.${k}`, `"${e[k]}" is not left, right, top or bottom: ignored`); });
    ['latency', 'cost'].forEach(k => { if (e[k] != null && !(typeof e[k] === 'number' && e[k] >= 0)) warn(`${at}.${k}`, `${k} ${jsonText(e[k])} is not a number of 0 or more: counted as 0`); }); // budgets (#95)
    if (e.step != null && !(typeof e.step === 'number' ? e.step >= 0 : typeof e.step === 'string' && e.step.length >= 1 && e.step.length <= 3))
      warn(at + '.step', `step ${jsonText(e.step)} is not a number of 0 or more, or text of 1 to 3 characters (2a): drawn as written`);
  };
  // a card's id is no line's (model-and-schema.md): apply(), references() and a lens read one id space, where the card wins (audit 29)
  const shared = (e, at) => { if (typeof e.id === 'string' && ids.has(e.id)) err(at + '.id', `line id "${e.id}" is also a card's id`); };
  // a view's own line is in that id space too: an id another view's own line or a model line holds sends apply()'s set or delete, and
  // references(), to the first of them, not the line selected (audit 30). lineAt: each line id -> where it is first
  // a view's marked copy of a model line, removed or added (core/model.js markedCopy, as diff() writes it) names the model line: no second line
  const modelL = new Map(Array.from(arr(m.edges), e => [e && e.id, e])), ghostOf = e => markedCopy(modelL, e);
  const lineAt = new Map(), ownLine = (e, at) => { if (e.id == null || ghostOf(e)) return; if (lineAt.has(e.id)) err(at + '.id', `line id "${e.id}" is used twice (also ${lineAt.get(e.id)})`); else lineAt.set(e.id, at); };
  // a model line may end on any view's box (#28); a view's own line only on that view's boxes
  const anyBox = new Set(views.flatMap(v => arr(v.containers).map(c => c && c.id)));
  arr(m.edges).forEach((e, i) => { if (!(typed && e && e.type != null)) line(e, `edges[${i}]`, new Set([...ids, ...anyBox]));
    if (e && e.id != null) { if (lineIds.has(e.id)) err(`edges[${i}].id`, `line id "${e.id}" is used twice`); else lineAt.set(e.id, `edges[${i}]`); lineIds.add(e.id); shared(e, `edges[${i}]`); } });
  views.forEach((v, i) => { const lim = arr(v.nodeIds).length + 64; // a pin far off the grid, any view's: held there (context.js onGrid, layered.js)
    Object.entries(v.layout || {}).forEach(([id, p]) => { if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') warn(`views[${i}].layout.${id}`, `"${id}"'s place ${jsonText(p)} is not two numbers: ignored`);
      else if (p.some(x => !(Math.abs(x) <= lim))) warn(`views[${i}].layout.${id}`, `"${id}"'s place ${jsonText(p)} is off the grid: held at ${lim} columns or rows out`); });
    ['gap', 'rgap'].forEach(k => { if (v[k] != null && !(typeof v[k] === 'number' && v[k] > 0 && v[k] <= 2000)) warn(`views[${i}].${k}`, v[k] > 2000 && typeof v[k] === 'number' ? `${k} ${v[k]} is over 2000 px: drawn as 2000` : `${k} ${jsonText(v[k])} is not a number above 0: ignored`); });
    if (typedView(v)) return;
    const at = `views[${i}]`, mine = new Set(), boxes = Object.create(null), home = Object.create(null), full = new Set(); // no prototype: a box or card named toString is no box (M3, audit 8)
    if (v.parent != null && !vids.has(v.parent) && !ids.has(v.parent)) err(at + '.parent', `parent "${v.parent}" is not a view`);
    arr(v.nodeIds).forEach((id, j) => { if (!ids.has(id)) err(`${at}.nodeIds[${j}]`, `"${id}" is not a card`); else if (mine.has(id)) warn(`${at}.nodeIds[${j}]`, `"${id}" is listed twice: drawn twice`); mine.add(id); });
    Object.entries(v.nodeOverrides || {}).forEach(([id, o]) => { if (!ids.has(id)) err(`${at}.nodeOverrides.${id}`, `"${id}" is not a card`); later(o, `${at}.nodeOverrides.${id}`); shapeIs(o, `${at}.nodeOverrides.${id}`);
      const l = labelProblem(o, `${at}.nodeOverrides.${id}`); if (l) out.push(l); }); // its label is the card's here (audit 31)
    arr(v.nodes).forEach((n, j) => later(n, `${at}.nodes[${j}]`));
    ['stepIds', 'tour'].forEach(k => arr(v[k]).forEach((id, j) => { if (!mine.has(id)) err(`${at}.${k}[${j}]`, `"${id}" is not one of the view's cards`); }));
    arr(v.browserOrder).forEach((id, j) => { if (!vids.has(id)) err(`${at}.browserOrder[${j}]`, `"${id}" is not a view`); });
    arr(v.intake).forEach((s, j) => { if (!mine.has(s && s.to)) err(`${at}.intake[${j}].to`, `"${s && s.to}" is not one of the view's cards`); });
    arr(v.containers).forEach((c, j) => { if (!c || !c.id) err(`${at}.containers[${j}].id`, 'a box needs an id'); else if (Object.hasOwn(boxes, c.id)) err(`${at}.containers[${j}].id`, `box id "${c.id}" is used twice`); else if (mine.has(c.id)) err(`${at}.containers[${j}].id`, `box id "${c.id}" is one of the view's cards`); else boxes[c.id] = c; });
    const outer = b => { const a = new Set(); for (let p = b; boxes[p] && !a.has(p); p = boxes[p].parent) a.add(p); return a; }; // b and the boxes it sits in
    arr(v.containers).forEach((c, j) => { if (!c) return; list(c, `${at}.containers[${j}]`, 'nodeIds', 1); const l = labelProblem(c, `${at}.containers[${j}]`); if (l) out.push(l);
      arr(c.nodeIds).forEach((id, k) => { if (!mine.has(id)) return err(`${at}.containers[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards`);
        const h = home[id]; if (h && !outer(c.id).has(h) && !outer(h).has(c.id)) warn(`${at}.containers[${j}].nodeIds[${k}]`, `"${id}" is in box "${h}" too, and neither box holds the other: they overlap`);
        if (!h || outer(c.id).has(h)) home[id] = c.id; for (let p = c.id; boxes[p] && !full.has(p); p = boxes[p].parent) full.add(p); });
      if (c.parent != null && !boxes[c.parent]) err(`${at}.containers[${j}].parent`, `"${c.parent}" is not a box of this view`);
      if (c.tone != null && typeof c.tone !== 'string') warn(`${at}.containers[${j}].tone`, `tone ${jsonText(c.tone)} is not a palette name (green, amber, ...): ${c.tone ? 'drawn in slate' : 'ignored'}`);
      for (let p = c.parent, seen = new Set([c.id]); p != null && boxes[p]; p = boxes[p].parent) { if (seen.has(p)) { err(`${at}.containers[${j}].parent`, `box "${c.id}" ends up inside itself`); break; } seen.add(p); } });
    arr(v.containers).forEach((c, j) => { if (c && boxes[c.id] === c && !full.has(c.id)) warn(`${at}.containers[${j}]`, `box "${c.id}" holds no cards: it is not drawn, nor its lines`); });
    const ends = new Set([...ids, ...Object.keys(boxes)]);
    const listed = new Set(), byId = new Map(Array.from(arr(m.edges), e => [e && e.id, e])), here = x => mine.has(x) || !!boxes[x]; // audit 7: a listed line is drawn once, between this view's cards and boxes
    if (Array.isArray(v.edges)) v.edges.forEach((e, j) => { const p = `${at}.edges[${j}]`;
      if (typeof e !== 'string') { line(e, p, ends); if (e && typeof e === 'object') { shared(e, p); ownLine(e, p); } } else if (!lineIds.has(e)) return err(p, `"${e}" is not a line`); else if (listed.has(e)) return warn(p, `"${e}" is listed twice: drawn once`); else listed.add(e);
      const l = typeof e === 'string' ? byId.get(e) : e, off = l && [l.from, l.to].find(x => (ids.has(x) || anyBox.has(x)) && !here(x)); // a card or any view's box (audit 8)
      if (off != null) warn(p, `${typeof e === 'string' ? `"${e}"` : 'the line'} ends on "${off}", which is not one of the view's cards or boxes: not drawn`); });
    // a line from a box to a card or box inside it has no line (audit 11): said, as a line to itself is
    const inside = boxHolds(v), joins = (l, p) => { if (!l || typeof l !== 'object' || !here(l.from) || !here(l.to)) return;
      const [b, x] = inside(l.from, l.to) ? [l.from, l.to] : inside(l.to, l.from) ? [l.to, l.from] : [];
      if (b != null) warn(p, `joins the box "${b}" and "${x}", which it holds: not drawn${p.startsWith('edges[') ? ` in view "${v.id}"` : ''}`); };
    if (Array.isArray(v.edges)) v.edges.forEach((e, j) => joins(typeof e === 'string' ? byId.get(e) : e, `${at}.edges[${j}]`)); else arr(m.edges).forEach((e, j) => joins(e, `edges[${j}]`));
    Object.keys(v.layout || {}).forEach(id => { if (!mine.has(id)) warn(`${at}.layout.${id}`, `"${id}" is not one of the view's cards: its place is ignored`); });
    if (Array.isArray(v.lanes)) v.lanes.forEach((l, j) => arr(l && l.nodeIds).forEach((id, k) => { if (!mine.has(id)) warn(`${at}.lanes[${j}].nodeIds[${k}]`, `"${id}" is not one of the view's cards: left out of the lane`); }));
  });
  // rules (#70): an id, and from, to or noCycles; a selector that names nothing picks nothing, and a misspelt kind picks script cards
  if (m.rules != null && !Array.isArray(m.rules)) err('rules', 'rules is a list');
  const ruleIds = new Set(), allBoxes = new Set(anyBox), each = (x, at, f) => (Array.isArray(x) ? x : [x]).forEach((y, j) => { if (y != null) f(y, Array.isArray(x) ? `${at}[${j}]` : at); });
  const owners = new Set([...arr(m.nodes), ...views.flatMap(v => [...arr(v.nodes), ...Object.values(v.nodeOverrides || {})])].map(n => n && n.owner).filter(o => typeof o === 'string'));
  const pick = (s, at, lens) => { // lens: a lens's pick (#94), which also takes line kinds at its top
    if (s == null) return;
    if (typeof s !== 'object' || Array.isArray(s)) return err(at, `a selector is an object: id, kind, container, owner${lens ? ', line' : ''} or not`);
    Object.keys(s).forEach(k => { if (!['id', 'kind', 'container', 'owner', 'not', ...(lens ? ['line'] : [])].includes(k)) warn(`${at}.${k}`, `unknown key "${k}": ignored, so the selector picks more cards`); });
    each(s.id, at + '.id', (x, p) => { if (!ids.has(x) && !allBoxes.has(x)) warn(p, `"${x}" is neither a card nor a box: it picks nothing`); });
    each(s.kind, at + '.kind', (x, p) => { const k = String(x).toLowerCase(); if (!(hasKey(KIND, k) || hasKey(MAPK, k) || hasKey(ALIAS, k))) warn(p, `unknown kind "${x}": it picks script cards`); });
    each(s.container, at + '.container', (x, p) => { if (!allBoxes.has(x)) warn(p, `"${x}" is not a box: it picks nothing`); });
    each(s.owner, at + '.owner', (x, p) => { if (!owners.has(x)) warn(p, `no card's owner is "${x}": it picks nothing`); });
    if (lens) each(s.line, at + '.line', (x, p) => { if (!WIRE_KINDS.includes(x)) warn(p, `"${x}" is not a line kind (calls, feeds, triggers, state, guard): it picks no line`); });
    pick(s.not, at + '.not');
  };
  arr(m.rules).forEach((r, i) => {
    const at = `rules[${i}]`;
    if (!r || typeof r !== 'object') return err(at, 'a rule is an object with an id');
    titled(r, at);
    if (typeof r.id !== 'string' || !r.id) err(at + '.id', 'a rule needs an id'); else if (ruleIds.has(r.id)) err(at + '.id', `rule id "${r.id}" is used twice`); else ruleIds.add(r.id);
    if (!r.from && !r.to && !r.noCycles) err(at, 'a rule needs from, to or noCycles');
    pick(r.from, at + '.from'); pick(r.to, at + '.to');
    arr(r.views).forEach((v, j) => { if (!vids.has(v)) err(`${at}.views[${j}]`, `"${v}" is not a view`); });
  });
  // lenses (#94): an id each, and a pick as a rule's selector, which also takes line kinds
  if (m.lenses != null && !Array.isArray(m.lenses)) err('lenses', 'lenses is a list');
  const lensIds = new Set();
  arr(m.lenses).forEach((l, i) => {
    const at = `lenses[${i}]`;
    if (!l || typeof l !== 'object') return err(at, 'a lens is an object with an id');
    titled(l, at);
    if (typeof l.id !== 'string' || !l.id) err(at + '.id', 'a lens needs an id'); else if (lensIds.has(l.id)) err(at + '.id', `lens id "${l.id}" is used twice`); else lensIds.add(l.id);
    pick(l.pick, at + '.pick', true);
    if (l.color != null && l.color !== 'owner') warn(at + '.color', `color ${jsonText(l.color)} is not "owner": ignored`);
  });
  // stories (#69): each step's view, and the cards, lines and tour it names there
  if (m.stories != null && !Array.isArray(m.stories)) err('stories', 'stories is a list of stories');
  const modelLine = new Map(arr(m.edges).filter(e => e && typeof e === 'object' && typeof e.id === 'string').map(e => [e.id, e])), cardIds = new Set(arr(m.nodes).filter(n => n && typeof n === 'object').map(n => n.id));
  // a line written in a view is that view's (audit 39: a step on another view named it, and selected nothing there)
  const drewOf = new Map(), geoOf = new Map(), posLines = lineNames(m), sids = new Set(), inline = new Map();
  views.forEach(v => arr(v.edges).forEach(e => { if (e && e.id != null && !inline.has(e.id)) inline.set(e.id, v.id); }));
  let ctx; // the model laid out, for what a typed view draws when its type does not say (audit 39), made once and only if asked
  arr(m.stories).forEach((s, i) => {
    const at = `stories[${i}]`;
    if (s && typeof s === 'object') titled(s, at);
    if (!s || typeof s.id !== 'string' || !s.id) return err(at + '.id', 'a story needs an id');
    if (sids.has(s.id)) err(at + '.id', `story id "${s.id}" is used twice`); sids.add(s.id);
    if (!arr(s.steps).length) err(at + '.steps', 'a story needs steps');
    arr(s.steps).forEach((st, j) => {
      const p = `${at}.steps[${j}]`, v = views.find(x => x.id === (st && st.view));
      if (!v) return err(p + '.view', `"${st && st.view}" is not a view`);
      const mine = new Set(arr(v.nodeIds)), listed = Array.isArray(v.edges), boxes = new Set(arr(v.containers).map(c => c && c.id));
      // the model lines a typed view draws: its type's drawn hook says (a DFD level leaves out its parent level's flows, a C4 view a
      // relationship to a boundary it opens, audit 38), else its picture does, the lines a step can select there (audit 39: a class,
      // ER, flowchart, BPMN, cloud or mindmap view draws only its own kinds), and the model lines it draws as a piece the page
      // selects by id (audit 40: a communication view's messages are rows, not lines). null: a map, or a model that could not be laid out
      const drawn = () => { if (!drewOf.has(v)) { const T = typedView(v) && diagramOf(v); let d = null;
        if (T) try { d = new Set(typeof T.drawn === 'function' ? arr(T.drawn(m, v)) : (g => [...g.edges.flatMap(e => (e.all || [e]).map(x => x._id)),
          ...Object.keys(g.byId || {})])(held(() => (ctx ||= mapContext(m)).buildGeo(v.id))[0])); } catch { d = null; }
        drewOf.set(v, d); } return drewOf.get(v); };
      // the ids of the lines a typed view's picture draws, an implied line's ("a->b") too; null: a model that could not be laid out
      const lineIdsOf = () => { if (!geoOf.has(v)) { let d = null; try { d = new Set(held(() => (ctx ||= mapContext(m)).buildGeo(v.id))[0].edges.map(e => e._id)); } catch { d = null; }
        geoOf.set(v, d); } return geoOf.get(v); };
      const why = (x, seen) => { // why a model line x is no line of the view, or undefined
        if (typeof x !== 'string' || mine.has(x) || !modelLine.has(x) || seen.has(x) || arr(v.edges).some(e => e && e.id === x)) return undefined; seen.add(x);
        const l = modelLine.get(x), card = [l.from, l.to].find(k => cardIds.has(k) && !mine.has(k) && !boxes.has(k));
        if (card != null) return `its end "${card}" is not one of the view's cards`;
        if (listed && !v.edges.includes(x)) return 'the view\'s edges list leaves it out';
        if (drawn() && !drawn().has(x)) return 'the view does not draw it';
        const line = [l.from, l.to].find(k => why(k, seen) != null);
        return line != null ? `its end "${line}" is no line of the view` : undefined; };
      // "a->b" with no "#n" names a typed view's implied line (C4), which it must draw (audit 41: one a direct line replaced, or
      // one another view draws, selected nothing); a map's lines with no id are named "a->b#n" only
      const named = (x, q) => { // a card of the view or a line ("a->b#0" names a line with no id)
        // a model line to a card the view does not show is no line of it, as such a card is no card of it (audit 36); nor is one
        // its edges list leaves out, or one to a line it does not draw (audit 37)
        const off = why(x, new Set());
        if (off != null) err(q, `"${x}" is no line of view "${v.id}": ${off}`);
        else if (typeof x === 'string' && !mine.has(x) && !lineIds.has(x) && inline.has(x) && !arr(v.edges).some(e => e && e.id === x)) err(q, `"${x}" is no line of view "${v.id}": it is written in view "${inline.get(x)}"`);
        else if (typeof x === 'string' && !mine.has(x) && !lineIds.has(x) && !inline.has(x)) { if (!x.includes('->')) err(q, `"${x}" is neither one of view "${v.id}"'s cards nor a line`); else if (/#\d+$/.test(x) ? !posLines.get(listOf(m, m.views.indexOf(v))).has(x) : typedView(v) ? lineIdsOf() && !lineIdsOf().has(x) : true) warn(q, `"${x}" names no line: the step shows nothing for it`); }
        else if (x && typeof x === 'object') [x.type !== 'container' && x.id, x.node, ...arr(x.ids)].forEach(y => typeof y === 'string' && named(y, q)); }; // a Ref
      named(st.select, p + '.select');
      arr(st.highlight).forEach((x, k) => named(x, `${p}.highlight[${k}]`));
      arr(st.tour).forEach((x, k) => { if (!mine.has(x)) err(`${p}.tour[${k}]`, `"${x}" is not one of the view's cards`); });
      const c = st.camera, fit = ': the step shows the whole view';
      if (c && typeof c === 'object' && c.card != null) { if (!mine.has(c.card)) warn(p + '.camera.card', `"${c.card}" is not one of the view's cards${fit}`); }
      else if (c != null && c !== 'fit' && !(c && Number.isFinite(c.x) && Number.isFinite(c.y))) warn(p + '.camera', `the camera is "fit", { x, y, zoom } or { card, zoom }${fit}`);
      if (st.duration != null && !(st.duration > 0)) warn(p + '.duration', `duration ${jsonText(st.duration)} is not a number of ms: 4000`);
    });
  });
  if (typed) {
    const said = new Set(out.map(p => p.path)); // a duplicate id both checks find is said once
    out.push(...typedProblems(m).filter(p => !(p.level === 'error' && said.has(p.path))));
    views.forEach((v, i) => { const at = `views[${i}].diagram`; // a well-formed name of a type this release does not draw (M13)
      if (typedView(v) && !diagramOf(v) && !out.some(p => p.path === at)) warn(at, `diagram "${v.diagram}" is not drawn by this release: its nodes are drawn as plain cards`); });
    const once = new Set(), say = p => { const k = JSON.stringify([p.level, p.path, p.message]); if (!once.has(k)) { once.add(k); out.push(p); } };
    // each view's type's rules, a problem once; a validate(model) that takes no view, once a type
    views.filter(typedView).forEach(v => { const T = diagramOf(v); if (!T || !T.validate || once.has(T)) return; if (T.validate.length < 2) once.add(T); T.validate(m, v).forEach(say); });
    if (TYPED.across) arrOf(TYPED.across(m)).forEach(say);
    // a panel's text field that is not text, unless a type's own rule says that path already (audit 43)
    const ruled = new Set(out.map(p => p.path)); const memos = new Map(); views.filter(typedView).forEach(v => fieldTextProblems(m, v, diagramOf(v), memos).forEach(p => { if (!ruled.has(p.path)) say(p); }));
  }
  // a change the renderer has no mark for draws unmarked, though a key may say it (audit 45: "bogus" passed, and a line's
  // "planned" was said and not drawn). In any case, as the renderer reads it; a card's and a member's, a line's, each its own words
  const CARD_CH = ['added', 'new', 'modified', 'changed', 'removed', 'planned'], LINE_CH = ['added', 'new', 'modified', 'changed', 'removed'];
  const chIs = (x, at, ok, line) => { if (!x || typeof x !== 'object' || x.change == null) return;
    if (!(typeof x.change === 'string' && ok.includes(x.change.toLowerCase()))) warn(at + '.change', `change ${jsonText(x.change)} is not ${line ? 'added, changed or removed' : 'added, changed, removed or planned'}: drawn unmarked`);
    // one rule for its letter case (audit 47): written in lower case, as the schema and lib/umlimator.d.ts list it; the
    // renderer reads another case as its lower-case word, and this says so, so a schema check and validate() agree
    else if (x.change !== x.change.toLowerCase()) warn(at + '.change', `change ${jsonText(x.change)} is drawn as ${jsonText(x.change.toLowerCase())}: write it in lower case, as the schema lists it`); };
  const deep = (x, at) => { const s = [[x, at]], seen = new Set(); for (let k = 0; k < s.length; k++) { const [y, p] = s[k]; if (!y || typeof y !== 'object' || seen.has(y)) continue; seen.add(y); chIs(y, p, CARD_CH);
    arr(y.members).forEach((z, j) => s.push([z, `${p}.members[${j}]`])); } };
  arr(m.nodes).forEach((n, i) => deep(n, `nodes[${i}]`)); arr(m.edges).forEach((e, i) => chIs(e, `edges[${i}]`, LINE_CH, true));
  views.forEach(v => { const i = arr(m.views).indexOf(v); arr(v.nodes).forEach((n, j) => deep(n, `views[${i}].nodes[${j}]`)); arr(v.fragments).forEach((f, j) => deep(f, `views[${i}].fragments[${j}]`));
    arr(v.edges).forEach((e, j) => chIs(e, `views[${i}].edges[${j}]`, LINE_CH, true));
    arr(v.containers).forEach((c, j) => chIs(c, `views[${i}].containers[${j}]`, CARD_CH)); // a box's, as a card's: diff() writes it on a map's boxes (audit 53)
    if (v.nodeOverrides && typeof v.nodeOverrides === 'object') Object.entries(v.nodeOverrides).forEach(([id, o]) => chIs(o, `views[${i}].nodeOverrides.${id}`, CARD_CH)); });
  /* a text holding a character no XML document may hold (a C0 control but tab, line feed and carriage return; U+FFFE, U+FFFF;
     a lone surrogate, as Word's paste can bring) is drawn with U+FFFD there (esc), so the SVG stays well-formed: said, at its
     path (audit 53: a native model's label drew it raw and the export was no XML, with no warning). A walk with a list; a value
     another problem is said of already (a gap that is no number), and what it holds, is not said again */
  { const said = new Set(out.map(q => q.path)), s = [[m, '']], seen = new Set(); for (let k = 0; k < s.length; k++) { const [y, p] = s[k]; if (seen.has(y)) continue; seen.add(y);
      const list = Array.isArray(y); for (const key of Object.keys(y)) { const x = y[key], at = list ? `${p}[${key}]` : p ? `${p}.${key}` : key; if (said.has(at)) continue;
        // an icon's glyph (text.js glyph) reads one as a space, which its markup holds as white space (audit 54)
        if (typeof x === 'string') { if (XML_BAD.test(x)) warn(at, `holds a character XML cannot hold (a control character, U+FFFE, U+FFFF or a lone surrogate): ${key === 'g' && p.startsWith('icons.') && m.icons && typeof m.icons === 'object' && m.icons[p.slice(6)] === y ? 'read as a space' : 'drawn as U+FFFD'}`); }
        else if (x && typeof x === 'object') s.push([x, at]); } } }
  // a value left out is said once, as left out: not again at its path as a missing end, type or name (audit 21: a line's
  // end {"toString": 1} was also '"undefined" is neither a card nor a box'). A path in the copy, where a list's entry
  // left out moved the ones after it up, is said as the model has it, so the next entry's problem is said, at its own
  // place (audit 22), and only a value taken out of an object is compared
  if (!left.size) return out;
  const back = p => { const q = read.back(p.path), also = / \(also ([^()]*)\)$/.exec(p.message);
    return q === p.path && !also ? p : { ...p, path: q, ...also && { message: p.message.slice(0, also.index) + ` (also ${read.back(also[1])})` } }; };
  return out.map((p, i) => i < read.paths.length ? p : back(p)).filter((p, i) => i < read.paths.length || !left.has(p.path));
}

/* ================= rules (#70): what a model says must hold =================
   A rule forbids lines from the cards `from` picks to the cards `to` picks (a side left out picks every card), or, with
   noCycles, boxes that reach each other through their lines. A line counts between the two boxes that hold its ends right
   under the box (or view) they share, so a box is weighed against its siblings, at every depth, and a line into a box's
   own inner box counts for nothing. A selector picks cards by id, kind (as the map draws it: "db" is a database) or box
   (at any depth), each a value or a list; every key it has must hold, and `not` turns a selector round. A line's end on
   a box (#28) is that box: in it, and of no kind. A rule that names a box (a container, or a box's id, in from, to or a
   not) holds only in the views that draw one of the boxes it names, as a box belongs to its view; any other rule holds in
   every view. `views` narrows that further. */
const boxesNamed = (s, isBox) => !s || typeof s !== 'object' ? []
  : [...[s.container].flat(), ...[s.id].flat().filter(isBox), ...boxesNamed(s.not, isBox)].filter(x => x != null);
const picks = (s, end) => !s || ((s.id == null || [s.id].flat().includes(end.id))
  && (s.kind == null || [s.kind].flat().some(k => end.kind != null && kindOf(k, true) === end.kind))
  && (s.container == null || [s.container].flat().some(c => end.boxes.includes(c)))
  && (s.owner == null || [s.owner].flat().includes(end.owner))
  && (s.not == null || !picks(s.not, end)));
const andList = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs.join(''), arrOf = x => (Array.isArray(x) ? x : []);
// a map sequence view's step numbers, its lines in run order: on the diff page over the live ones only, as the model after counts
// them; a line marked removed has no number (null) and is said without a place (audit 55, as the C4 dynamic, sequence and
// communication views)
const runSteps = l => { let k = 0; return Array.from(l, e => e && typeof e === 'object' && typeof e.change === 'string' && e.change.toLowerCase() === 'removed' ? null : ++k); };
// a view's cards and boxes as a selector sees them (rules, lenses): a card's kind as drawn, the boxes it is in (outermost
// first) and its owner; a box is in itself and its parents, and has no kind or owner
// a view's hand-written boxes: none on a typed view whose type lays it out, which draws its own boxes (own-boxes, audit 10)
const handBoxes = v => ((v.diagram ?? 'map') !== 'map' && (diagramOf(v) || {}).layout ? [] : arrOf(v.containers));
function endsIn(ctx, v) {
  const cs = handBoxes(v).filter(c => c && c.id), box = Object.create(null); cs.forEach(c => { box[c.id] ||= c; }); // no prototype (M3, audit 8)
  const home = Object.create(null); cs.forEach(c => arrOf(c.nodeIds).forEach(id => { home[id] ??= c.id; }));
  const chain = b => { const c = []; for (const seen = new Set(); b != null && box[b] && !seen.has(b); b = box[b].parent) { seen.add(b); c.unshift(b); } return c; }; // outermost first
  const end = id => box[id] ? { id, kind: null, boxes: chain(id), label: box[id].label || id }
    : (n => ({ id, kind: kindOf(n.kind, true), boxes: chain(home[id]), owner: typeof n.owner === 'string' ? n.owner : undefined, label: n.label || id }))(ctx.nodeIn(id, v.id));
  return { box, end };
}
// on the diff page's model, what the model after has in a view (audit 57: rules(), describe(), paths() and reach() read the
// removed lines and cards diff() draws back as live): a card or box isGone() leaves, here or in the model; a line too, and one
// with an end that left. Each a test: card(id), box(c), line(e)
function liveIn(ctx, v) {
  const bx = Object.create(null); handBoxes(v).forEach(c => { if (c && c.id != null) bx[c.id] ||= c; });
  const card = id => (bx[id] ? !isGone(bx[id]) : !isGone(ctx.nodeIn(id, v.id)));
  return { card, box: c => !isGone(c), line: e => !isGone(e) && card(e.from) && card(e.to) };
}
/** Every rule the model breaks, in each view that draws it broken: a line a rule forbids, or a cycle of boxes. */
export function rules(model) {
  model = unreadable(model).model; // read as validate() and mapContext read it: no text String() throws on (audit 20)
  const list = arrOf(model && model.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles));
  if (!list.length) return [];
  const ctx = mapContext(model), { views, N, viewEdges } = ctx, out = [];
  const anyBox = new Set(views.flatMap(v => handBoxes(v).map(c => c && c.id).filter(Boolean)));
  const named = new Map(list.map(r => [r, [r.from, r.to].flatMap(s => boxesNamed(s, id => anyBox.has(id) && !N[id]))]));
  views.forEach(v => {
    const live = liveIn(ctx, v), { box, end } = endsIn(ctx, { ...v, containers: handBoxes(v).filter(live.box) }), order = Object.values(box).map(c => c.id); // what the model after has (audit 57)
    // a target names the drawn line, which may stand for several edges: grouped as prepEdges groups them (parallel edges, and
    // A→B with B→A, unless keepPairs), in its order, so select() finds it
    // ponytail: a copy of prepEdges' grouping; share one helper if that grouping changes
    const lines = viewEdges(v).filter(e => e.from !== e.to && live.line(e)), par = new Map(), drawn = new Map(), ends = new Map();
    lines.forEach(e => { const k = e.from + '>' + e.to + (v.keepPairs ? '#' + e.id : ''); par.has(k) ? par.get(k).push(e) : par.set(k, [e]); });
    par.forEach(es => { const back = !v.keepPairs && ends.get(es[0].to + '>' + es[0].from);
      if (back) back.push(...es); else ends.set(es[0].from + '>' + es[0].to, es); es.forEach(e => drawn.set(e, back || es)); });
    const line = e => ({ type: 'edge', ids: [...new Set(drawn.get(e).map(x => x._id))], view: v.id });
    let rings = null; // the cycles of boxes, worked out for the first noCycles rule: [boxes, the lines between them]
    const cycles = () => {
      const next = Object.create(null); // box -> Map(box -> the lines from the one to the other)
      lines.forEach(e => { const A = end(e.from).boxes, B = end(e.to).boxes; let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
        if (i < A.length && i < B.length) { const m = next[A[i]] ||= new Map(); m.set(B[i], [...(m.get(B[i]) || []), e]); } });
      const reach = b => { const seen = new Set(), todo = [b]; while (todo.length) for (const c of (next[todo.pop()] || new Map()).keys()) if (!seen.has(c)) { seen.add(c); todo.push(c); } return seen; };
      const R = Object.fromEntries(order.map(b => [b, reach(b)])), done = new Set(), found = [];
      order.forEach(b => { if (done.has(b) || !R[b].has(b)) return;
        const ring = order.filter(c => R[b].has(c) && R[c].has(b)); ring.forEach(c => done.add(c));
        found.push([ring, ring.flatMap(a => ring.flatMap(c => (next[a] && next[a].get(c)) || []))]); });
      return found;
    };
    list.forEach(r => {
      if (Array.isArray(r.views) && !r.views.includes(v.id)) return;
      if (named.get(r).length && !named.get(r).some(b => box[b])) return; // it names boxes, none of them this view's
      const breaks = `breaks rule "${labelOr(r.title, r.id)}"`;
      if (r.noCycles) (rings ||= cycles()).forEach(([ring, via]) => out.push({ rule: r.id, view: v.id,
        message: `view ${v.id}: boxes ${andList(ring.map(c => `"${box[c].label || c}"`))} form a cycle, which ${breaks}`,
        targets: [...ring.map(c => ({ type: 'container', id: c, view: v.id })), ...[...new Set(via.map(e => drawn.get(e)))].map(es => line(es[0]))] }));
      else { const said = new Set(); // parallel edges that break it read as one line, once
        lines.forEach(e => { const a = end(e.from), b = end(e.to), message = `view ${v.id}: edge ${a.label}→${b.label} ${breaks}`;
          if (picks(r.from, a) && picks(r.to, b) && !said.has(drawn.get(e))) { said.add(drawn.get(e)); out.push({ rule: r.id, view: v.id, message, targets: [line(e)] }); } }); }
    });
  });
  return out;
}
/* ---------- change: diff (#66) and drift (#68) ----------
   Each returns a model marked with what the map draws already, so a page the CLI writes, or a still, shows the marks
   with nothing to call at run time: a card's change (a NEW or CHANGED tab; REMOVED is faded, dashed and struck
   through), a line's style (added: green and flowing; removed: rose, dashed and faded; security: rose and dashed;
   faded: its own colour, faint and still) and edited (an amber dot on the line). */
const plain = t => Object.fromEntries(Object.entries(t)); // an own-key table back to a plain object, for JSON and deepEqual
// a line's identity in a list, as a Ref names it: its id, else "<from>-><to>#<n>"; "=<id>" for a view's reference to a model line
const lineKeys = list => { const seen = {}; return list.map(e => typeof e === 'string' ? '=' + e : e && typeof e === 'object'
  ? (e.id != null ? String(e.id) : (k => `${k}#${seen[k] = (seen[k] ?? -1) + 1}`)(e.from + '->' + e.to)) : ''); };
// a line that stands for several edges (A→B and B→A, parallel edges) shows the strongest of their marks: removed or
// undrawn, then added, then changed (its edited dot, which a stronger mark hides); it fades as idle only when every one
// of them is idle, and otherwise takes the first style that is no mark
const markOf = all => { const top = all.find(x => x.style === 'removed' || x.drift === 'undrawn') || all.find(x => x.style === 'added');
  if (top) return { style: top.style, strong: true };
  return { style: all.every(x => x.style === 'faded') ? 'faded' : (all.find(x => x.style && x.style !== 'faded') || {}).style }; };
// the lines a view draws: its own list (a model line by id, or one of its own), else every model line between its cards and boxes;
// with ups (id -> the ids of its owners), also each line of a kind the view's type draws whose ends are members of them (a port, a
// part, or a port on a part: audit 18)
const linesOf = (m, v, ups) => { const all = Array.isArray(m.edges) ? m.edges.filter(Boolean) : [];
  if (Array.isArray(v.edges)) { const byId = new Map(all.filter(e => e.id != null).map(e => [String(e.id), e])); return v.edges.map(e => typeof e === 'string' ? byId.get(e) : e).filter(Boolean); }
  const ids = new Set([...arrOf(v.nodeIds), ...arrOf(v.containers).map(c => c && c.id)]), on = id => id != null && (ids.has(id) || ups(id).some(u => ids.has(u)));
  const kinds = ups ? new Set(arrOf((diagramOf(v) || {}).lines).map(t => t && t.type)) : null, end = (e, k) => on(e[k]) || on((((e.props && e.props.ends) || {})[k] || {}).part);
  return all.filter(e => ids.has(e.from) && ids.has(e.to) || ups && kinds.has(e.type) && end(e, 'from') && end(e, 'to')); }; // a list it is not is ignored, as validate() says

// the box a card sits in on a view: the innermost of the boxes that list it
const boxOf = (v, id) => { const cs = arrOf(v.containers).filter(Boolean), by = new Map(cs.map(c => [c.id, c]));
  const depth = c => { let d = 0; for (const seen = new Set(); c && !seen.has(c); c = by.get(c.parent)) { seen.add(c); d++; } return d; };
  return cs.filter(c => arrOf(c.nodeIds).includes(id)).reduce((a, c) => !a || depth(c) > depth(a) ? c : a, null); };
// In the same order (diff() says "reorders the steps" when not): the steps in both, paired along a longest common run of what
// they are, then the rest by what they are and last by Ref name, run in the same order in both lists (a step can repeat, so
// a pairing, not a lookup). p, q: [what, Ref name] per step. The common head and tail pair as they stand, so the table spans
// only the steps between them, and only up to cap cells (a trace's view of 20,000 steps, audit 21; a full table ran Node out
// of memory). The run the table pairs is its own: a step on a tie is skipped in p first. A step left unpaired by a longest
// run whose kind the other list also has unpaired pairs across that run, so the steps are in a new order; so past the cap
// the run is looked for only among the paths with no such step, a band of the table's diagonals as wide as the edits they
// make, and when none has a run that long the answer is a reorder. In the band the table's own run is walked, a few of its
// rows kept and the rest worked out again (audit 23: Myers' diff there paired another run as long, and a step's Ref name
// then read the same edit as a reorder or not by the view's size). Time and memory: the rows x the band, and its root
const LCS = 4e6;
// what moved from k0 to k1, the same ids in another order: those off a longest run kept in the old order (O(n log n)), each
// with the id now before it (null: first)
const movedIn = (k0, k1) => { const at = new Map(k0.map((x, i) => [x, i])), p = k1.map(x => at.get(x)), tail = [], prev = new Array(p.length).fill(-1);
  p.forEach((x, i) => { let lo = 0, hi = tail.length; while (lo < hi) { const m = (lo + hi) >> 1; if (p[tail[m]] < x) lo = m + 1; else hi = m; } if (lo) prev[i] = tail[lo - 1]; tail[lo] = i; });
  const run = new Set(); for (let i = tail.length ? tail[tail.length - 1] : -1; i >= 0; i = prev[i]) run.add(i);
  return k1.flatMap((x, i) => run.has(i) ? [] : [[x, i ? k1[i - 1] : null]]); };
const sameOrder = (p, q, cap = LCS) => { let s = 0, e = 0; while (s < p.length && s < q.length && p[s][0] === q[s][0]) s++;
  if (s === p.length && s === q.length) return true;
  while (e < p.length - s && e < q.length - s && p[p.length - 1 - e][0] === q[q.length - 1 - e][0]) e++;
  const pairs = [], P = new Set(), Q = new Set(), by = f => { const n = new Map(); q.forEach((y, j) => { if (Q.has(j)) return; const l = n.get(y[f]); if (l) l.push(j); else n.set(y[f], [j]); });
    const at = new Map(); p.forEach((x, i) => { const js = !P.has(i) && n.get(x[f]), k = at.get(js) || 0; if (js && k < js.length) { const j = js[k]; at.set(js, k + 1); pairs.push([i, j]); P.add(i); Q.add(j); } }); };
  const two = (i, j) => { pairs.push([i, j]); P.add(i); Q.add(j); };
  for (let k = 0; k < s; k++) two(k, k);
  for (let k = 1; k <= e; k++) two(p.length - k, q.length - k);
  const a = p.length - e, b = q.length - e, w = b - s + 1; // the middle: p[s, a) and q[s, b)
  if ((a - s + 1) * w <= cap) { const T = new Int32Array((a - s + 1) * w), t = (i, j) => T[(i - s) * w + j - s];
    for (let i = a - 1; i >= s; i--) for (let j = b - 1; j >= s; j--) T[(i - s) * w + j - s] = p[i][0] === q[j][0] ? t(i + 1, j + 1) + 1 : Math.max(t(i + 1, j), t(i, j + 1));
    for (let i = s, j = s; i < a && j < b;) if (p[i][0] === q[j][0]) two(i++, j++); else if (t(i + 1, j) >= t(i, j + 1)) i++; else j++; }
  else { const id = new Map(), num = x => id.get(x[0]) ?? id.set(x[0], id.size).get(x[0]), A0 = Int32Array.from(p.slice(s, a), num), B0 = Int32Array.from(q.slice(s, b), num), c = new Int32Array(2 * id.size);
    A0.forEach(k => c[2 * k]++); B0.forEach(k => c[2 * k + 1]++);
    let most = 0; for (let k = 0; k < id.size; k++) most += Math.min(c[2 * k], c[2 * k + 1]);
    // the band spans only the steps of a kind both middles hold (audit 24: with the rest in, 20,000 new ids walked 20,000 x
    // 40,001 cells for nothing). A step of a kind one list alone has changes no cell of the table, t(i, j) = T(fa[i], fb[j]),
    // so the walk below goes step by step in the lists as they are, reading the band, and pairs the table's own run
    const N0 = A0.length, M0 = B0.length, both = k => c[2 * k] && c[2 * k + 1];
    if (most) { const fa = new Int32Array(N0 + 1), fb = new Int32Array(M0 + 1);
      for (let i = 0; i < N0; i++) fa[i + 1] = fa[i] + (both(A0[i]) ? 1 : 0); for (let j = 0; j < M0; j++) fb[j + 1] = fb[j] + (both(B0[j]) ? 1 : 0);
      const A = A0.filter(both), B = B0.filter(both);
      // the table's cell (i, j), i - j from most - m to n - most, at row i and column j - i + hi; NO off the band or the lists
      const n = A.length, m = B.length, hi = n - most, W = n + m - 2 * most + 1, NO = -(1 << 29), K = Math.ceil(Math.sqrt(n + 1));
      const row = (i, nx, cur) => { for (let c = W - 1; c >= 0; c--) { const j = i - hi + c;
        cur[c] = j < 0 || j > m ? NO : i === n || j === m ? 0 : A[i] === B[j] ? nx[c] + 1 : Math.max(c ? nx[c - 1] : NO, c < W - 1 ? cur[c + 1] : NO); } };
      const kept = new Map(); let nx = new Int32Array(W), cur = new Int32Array(W);
      for (let i = n; i >= 0; i--) { row(i, nx, cur); if (i % K === 0 || i === n) kept.set(i, cur.slice()); [nx, cur] = [cur, nx]; }
      if (nx[hi] < most) return false;
      for (let i = 0, j = 0, r0 = 0; i < N0 && j < M0; r0 += K) { const r1 = Math.min(r0 + K, n), R = new Array(r1 - r0 + 1); R[r1 - r0] = kept.get(r1);
        for (let r = r1 - 1; r >= r0; r--) { R[r - r0] = new Int32Array(W); row(r, R[r - r0 + 1], R[r - r0]); }
        const t = (i, j) => { const x = fa[i], y = fb[j], c = y - x + hi; return c < 0 || c >= W ? NO : R[x - r0][c]; };
        while (i < N0 && j < M0 && (fa[i] < r1 || r1 === n)) { if (A0[i] === B0[j]) two(s + i++, s + j++);
          else if (t(i + 1, j) >= t(i, j + 1)) i++; else j++; } } } }
  by(0); by(1); return pairs.sort((x, y) => x[0] - y[0]).every((x, k, l) => !k || l[k - 1][1] < x[1]); };

/** What changed from one model to the next, as one model to draw: `after`, with each card and line marked added, changed
 *  or removed (removed ones come back from `before`, in their views, boxes and places), a summary in words, and the
 *  views that show a change. Cards and lines are matched by id (a line without one by its ends, as a Ref names it). */
export function diff(before, after) {
  before = unreadable(before).model; after = unreadable(after).model; // each read as validate() and mapContext read it (audit 20)
  const arr = arrOf, A = copyOf(before || {}), out = copyOf(after || {}); // a host's function stays as it is (audit 24)
  const how = new Map(), was = new Map(), said = []; // each marked card or line: added, changed or removed; a changed one's [before, after]
  const ours = new WeakSet(), our = y => (ours.add(y), y); // the marks this diff writes
  const card = (x, h) => our({ ...x, change: h });
  const line = (x, h) => our({ ...x, change: h, ...(h === 'changed' ? { edited: true } : { style: h }) });
  // a mark the model carries of its own (an author's NEW or REMOVED tab, a line's added or removed style or edited dot) on what
  // this diff does not mark is dropped (audit 61: drawn and named as this change's, while the summary said nothing of it). A
  // planned mark stays: it is drawn as itself, and no diff writes it. On a copy of after's, or before's for what comes back removed
  const planned = c => typeof c === 'string' && c.toLowerCase() === 'planned';
  const unmark = (x, ln) => { if (!x || typeof x !== 'object' || Array.isArray(x) || ours.has(x)) return;
    if (x.change != null && !planned(x.change)) delete x.change; if (ln) { delete x.edited; if (x.style === 'added' || x.style === 'removed') delete x.style; } };
  function mark(old, now, put, keys = l => l.map(x => x && x.id), inPlace) { // now's items, marked; old's that left come back, marked removed; inPlace: the removed model lines' ids
    const ko = keys(old), kn = keys(now), O = new Map(Array.from(old, (x, i) => [ko[i], x])), kept = new Set(kn); // a list's hole as undefined, as map() would keep it and Map() throws on (audit 28)
    const res = now.map((x, i) => { if (!x || typeof x !== 'object') return x; const o = O.get(kn[i]);
      if (o && typeof o === 'object' && canon(o) === canon(x)) return x;
      const h = o && typeof o === 'object' ? 'changed' : 'added', y = put(x, h); how.set(y, h); if (h === 'changed') was.set(y, [o, x]); return y; });
    const R = [...res]; let at = 0; // in a view's lines (a sequence's are its time order) after the old one before it that stayed, else at the end
    old.forEach((x, i) => { if (kept.has(ko[i])) at = res.indexOf(R[kn.indexOf(ko[i])]) + 1;
      else if (x && typeof x === 'object') { const y = put(x, 'removed'); how.set(y, 'removed'); res.splice(inPlace ? at++ : res.length, 0, y); }
      else if (inPlace && inPlace.has(x)) res.splice(at++, 0, inPlace.get(x)); }); // a removed model line a view named, or one it hid, in its place too
    return res;
  }
  out.nodes = mark(arr(A.nodes), arr(out.nodes), card); out.nodes.forEach(n => unmark(n));
  const E1 = arr(out.edges); // the after model's lines as given, before the removed ones come back
  out.edges = mark(arr(A.edges), arr(out.edges), line, lineKeys); out.edges.forEach(e => unmark(e, true));
  const goneLines = new Map(out.edges.filter(e => how.get(e) === 'removed' && e.id != null).map(e => [String(e.id), String(e.id)]));
  const keyed = l => { const k = lineKeys(l); return new Map(Array.from(l, (e, i) => [e, k[i]])); }, k1 = new Set(lineKeys(arr(after && after.edges)));
  const line0 = new Map([...keyed(arr(A.edges))].filter(([e, k]) => e && typeof e === 'object' && k1.has(k)).map(([e, k]) => [k, e])); // model lines in both, by their Ref name (an id-less one by its ends)
  // a line whose end moved (re-pointed), by its Ref name, as the model after has it: said as changed, and as put in or taken out of
  // a view only when the view drew it on one side alone (audit 58: never where it drew it both times; audit 59: always where not)
  const moved1 = new Map([...keyed(E1)].filter(([e, k]) => e && typeof e === 'object' && line0.has(k) && (line0.get(k).from !== e.from || line0.get(k).to !== e.to)).map(([e, k]) => [k, e]));
  // a view as mapContext reads one: an object with an id; any other entry stays as it is, neither added nor removed (audit 57:
  // a string view read as an added view {0:'w'}, "adds the view undefined", and diff().views listed undefined)
  const isView = v => !!v && typeof v === 'object' && !!v.id;
  const V0 = new Map(arr(A.views).filter(isView).map(v => [v.id, v])), V1 = new Set(arr(out.views).filter(isView).map(v => v.id));
  const stepped = x => x.render === 'sequence' || (diagramOf(x) || {}).steps === true; // a view that numbers its lines by their order (a C4 dynamic view's steps, audit 18)
  // a view its type lays out (version 2), which picks the lines it draws; version 1, or a map view, is drawn as a map
  const typedL = x => out.schemaVersion === 2 && (T => !!(T && T.layout && (T.layout.run || typeof T.layout === 'function')))(diagramOf(x));
  const hidIn = [], rmTyped = []; // typed views whose lines to a card they no longer show, or that went, are marked in view.diffMarks
  const listedIn = new Map(); // a view's model lines it still lists to a card taken out of it, drawn removed (view.diffMarks.listed)
  // a line's ends as cards: each end, an end through a part, and the elements that hold them (a port by its card, audit 55: a
  // listed line between ports was drawn live with its far card taken out of the view). onCard(e, S): an end on a card in S
  let upOf = null; const onCard = (e, S) => { if (!upOf) { upOf = new Map();
      const seen = new Set(); [...arr(A.nodes), ...arr(out.nodes)].forEach(n => { for (const s = [[n, null]]; s.length;) { const [y, u] = s.pop(); if (!y || typeof y !== 'object' || y.id == null || seen.has(y)) continue;
        seen.add(y); if (u != null && !upOf.has(y.id)) upOf.set(y.id, u); arr(y.members).forEach(z => s.push([z, y.id])); } }); }
    const p = (e.props && e.props.ends) || {};
    return [e.from, e.to, (p.from || {}).part, (p.to || {}).part].some(id => { for (const seen = new Set(); id != null && !seen.has(id); id = upOf.get(id)) { if (S.has(id)) return true; seen.add(id); } return false; }); };
  const moved = [], touched = new Set(), viewSaid = []; // cards put into or taken out of a view; views whose cards the diff marks there; what only a view changes
  // a view's picture, as its nodes, lines and bands are placed: the old model's, and the old model's with the view's kept cards
  // in their new order (audit 42); null where it cannot be laid out, which reads as changed
  let c0; const geoOf = (c, id) => { try { const [g] = held(() => c().buildGeo(id)), at = l => arr(l).filter(x => x && typeof x === 'object');
    const set = l => l.map(x => canon(x)).sort(); // as a set: the lists' own order follows nodeIds, the picture need not
    return canon([set(at(g.nodes).map(n => [n.id, n.x, n.y, n.w, n.h])), set(at(g.edges).map(e => [e._id ?? e.id, e.pts ?? null])), ...['bands', 'lanes', 'groups'].map(k => set(at(g[k]).map(b => [b.id, b.x, b.y, b.w, b.h])))]); } catch { return null; } };
  // audit 43: each view laid out twice, in a context of the whole model made for it, took a second a view. Now one context holds
  // every view's new order; a plain view whose grid slots do not change (each card ranked to the same slot, or pinned with no
  // lines) draws the same and is not laid out (a pinned one with lines is: they are routed in its cards' order, audit 44); the
  // others are, once in each context
  const keptOrder = (o, k1) => { const q = [...k1], put = new Set(k1), seen = new Set(); return arr(o.nodeIds).map(x => typeof x === 'string' && put.has(x) && !seen.has(x) && seen.add(x) ? q.shift() : x); };
  const order1 = new Map(); arr(out.views).forEach(v => { const o = v && V0.get(v.id); if (!o) return;
    const ks = new Set(arr(v.nodeIds).filter(x => typeof x === 'string')), ko = new Set(arr(o.nodeIds).filter(x => typeof x === 'string'));
    const k0 = [...ko].filter(x => ks.has(x)), k1 = [...ks].filter(x => ko.has(x)); if (k0.some((x, i) => x !== k1[i])) order1.set(o, keptOrder(o, k1)); });
  let c1; const ctx0 = () => (c0 ||= held(() => mapContext(A))[0]), ctx1 = () => (c1 ||= held(() => mapContext({ ...A, views: arr(A.views).map(w => order1.has(w) ? { ...w, nodeIds: order1.get(w) } : w) }))[0]);
  const reordered = o => { if (!order1.has(o) || arr(A.views).indexOf(o) < 0) return true;
    let a = null, b = null; try { a = held(() => ctx0().gridKey(o.id))[0]; b = a == null ? null : held(() => ctx1().gridKey(o.id))[0]; } catch { a = null; }
    if (a != null && a === b) return false;
    const g0 = geoOf(ctx0, o.id), g1 = geoOf(ctx1, o.id);
    return g0 == null || g1 == null || g0 !== g1; };
  const views = arr(out.views).map(v => {
    if (!isView(v)) return v; const o = V0.get(v.id);
    if (!o) { touched.add(v.id); // an added view comes with everything of its own added, as a removed one goes
      const w = { ...v }; if (Array.isArray(v.nodes)) w.nodes = v.nodes.map(n => { if (!n || typeof n !== 'object') return n; const y = card(n, 'added'); how.set(y, 'added'); return y; });
      if (Array.isArray(v.edges)) w.edges = v.edges.map(e => e && typeof e === 'object' ? line(e, 'added') : e); return w; }
    const w = { ...v }, ids = arr(v.nodeIds), oldIds = arr(o.nodeIds);
    if (v.nodes || o.nodes) { w.nodes = mark(arr(o.nodes), arr(v.nodes), card); w.nodes.forEach(n => unmark(n)); }
    const at = new Map([...out.nodes, ...arr(w.nodes)].filter(Boolean).map(n => [n.id, n]));
    // a removed subject (apply()'s delete drops the view's subject with it) stays the view's subject, so its frame is drawn
    // back with its parts, ports and connectors, removed with it (audit 51), not as a plain card
    if (o.subject != null && v.subject == null && how.get(at.get(o.subject)) === 'removed') w.subject = o.subject;
    const left = oldIds.filter(id => !ids.includes(id)), came = ids.filter(id => !oldIds.includes(id)), ov = idTable(v.nodeOverrides); // ov['__proto__'] = ... is an own key
    Object.keys(ov).forEach(id => { const x = ov[id]; if (x && typeof x === 'object' && !Array.isArray(x) && x.change != null && !planned(x.change)) ov[id] = (({ change, ...r }) => r)(x); }); // an author's mark, as on a card
    // each card that left back in its old place, after the nearest one before it that stayed (audit 52: at the end, a removed
    // lifeline or timing lane was drawn at the far side, and an interaction use covering it spanned every lifeline between)
    { const kept = new Set(ids), after = new Map(); let prev = null; // each that left, by the one that stayed before it (null: the start)
      oldIds.forEach(id => { if (kept.has(id)) prev = id; else if (after.has(prev)) after.get(prev).push(id); else after.set(prev, [id]); });
      const done = new Set(); w.nodeIds = [...(after.get(null) || []), ...ids.flatMap(id => done.has(id) || !after.has(id) ? [id] : (done.add(id), [id, ...after.get(id)]))]; }
    left.forEach(id => { if (how.get(at.get(id)) !== 'removed') { ov[id] = { ...(o.nodeOverrides || {})[id], change: 'removed' }; moved.push(['takes', id, v]); } });
    came.forEach(id => { if (at.get(id) && how.get(at.get(id)) !== 'added') { ov[id] = { ...ov[id], change: 'added' }; moved.push(['puts', id, v]); } });
    if (left.length || came.length) touched.add(v.id);
    // what only the view changes: its title, a box's name, a card's name here (nodeOverrides) or the box it sits in
    const vn = labelOr(v.title, v.id), says = t => { viewSaid.push(`${t} in the view ${vn}`); touched.add(v.id); }, bn = c => String(labelOr(c.label, c.id)); // a box labelled "" is drawn by its id (audit 35); by its label alone, as drawn: a box has no title (audit 36)
    if (String(labelOr(o.title, o.id)) !== String(vn)) { viewSaid.push(`retitles the view ${labelOr(o.title, o.id)} to ${vn}`); touched.add(v.id); }
    // and what else it draws differently (audit 15): its caption, lanes and the like, a box's tone or badges, a card's pin
    const other = (x, y, skip) => [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => !skip.includes(k) && canon(x[k]) !== canon(y[k]));
    const vk = other(o, v, ['id', 'title', 'nodeIds', 'nodes', 'edges', 'containers', 'nodeOverrides', 'layout', 'present', 'fragments']); // a card's pin and present: said with the card
    // present keyed by what is no card of the view (a port's side, a part's ports, audit 17), or present that is no table: said with the view
    const tb = x => x && typeof x === 'object' && !Array.isArray(x), P0 = tb(o.present) ? o.present : {}, P1 = tb(v.present) ? v.present : {};
    if (canon(o.present) !== canon(v.present) && ((o.present != null && !tb(o.present)) || (v.present != null && !tb(v.present))
      || [...new Set([...Object.keys(P0), ...Object.keys(P1)])].some(k => !ids.includes(k) && !oldIds.includes(k) && canon(P0[k]) !== canon(P1[k])))) vk.push('present');
    if (vk.length) { viewSaid.push(`changes the view ${vn} (${vk.join(', ')})`); touched.add(v.id); }
    const ob = new Map(arr(o.containers).filter(Boolean).map(c => [c.id, c]));
    arr(v.containers).forEach(c => { const b = c && ob.get(c.id); if (!b) return; if (bn(b) !== bn(c)) says(`renames the box ${bn(b)} to ${bn(c)}`);
      const bk = other(b, c, ['id', 'label', 'title', 'nodeIds']); if (bk.length) says(`changes the box ${bn(c)} (${bk.join(', ')})`); });
    ids.filter(id => oldIds.includes(id)).forEach(id => { const a = (o.nodeOverrides || {})[id] || {}, b = (v.nodeOverrides || {})[id] || {}, base = labelOr((at.get(id) || {}).label, id), cardName = l => (l == null ? base : labelOr(l, id)); // an override "" draws the card by its id (audit 35)
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => canon(a[k]) !== canon(b[k])), b0 = boxOf(o, id), b1 = boxOf(v, id);
      if (canon((o.present || {})[id]) !== canon((v.present || {})[id])) keys.push('present'); // its compartments shown (a typed view's present, by card)
      const rest = keys.filter(k => k !== 'label');
      if (keys.length) says((keys.includes('label') ? `renames ${cardName(a.label)} to ${cardName(b.label)}` : `changes ${cardName(b.label)}`) + (rest.length ? ` (${rest.join(', ')})` : ''));
      if ((b0 && b0.id) !== (b1 && b1.id)) says(`moves ${cardName(b.label)} ${b0 ? 'out of ' + bn(b0) : ''}${b0 && b1 ? ' ' : ''}${b1 ? 'into ' + bn(b1) : ''}`);
      else if (canon((o.layout || {})[id]) !== canon((v.layout || {})[id])) says(`moves ${cardName(b.label)}`);
      if ((keys.length || (b0 && b0.id) !== (b1 && b1.id)) && !how.has(at.get(id))) ov[id] = { ...ov[id], change: 'changed' }; });
    if (Object.keys(ov).length) w.nodeOverrides = plain(ov);
    if (left.length && Array.isArray(v.containers)) // a removed card stays in its box, and in its place on a view laid out by hand when that is free
      w.containers = v.containers.map(c => { const back = left.filter(id => c && arr(o.containers).some(b => b && b.id === c.id && arr(b.nodeIds).includes(id))); return back.length ? { ...c, nodeIds: [...arr(c.nodeIds), ...back] } : c; });
    if (left.length && v.layout && o.layout) { const L = idTable(v.layout), taken = new Set(Object.values(L).map(String));
      left.forEach(id => { const p = o.layout[id]; if (Array.isArray(p) && !taken.has(String(p))) { L[id] = p; taken.add(String(p)); } }); w.layout = plain(L); }
    // and drawn as the view drew it (audit 58: a removed ball interface came back a rectangle, its socket a «use» line)
    { const back = left.filter(id => Object.hasOwn(P0, id) && !Object.hasOwn(P1, id));
      if (back.length && (v.present == null || tb(v.present))) { const Q = idTable(v.present || {}); back.forEach(id => { Q[id] = P0[id]; }); w.present = plain(Q); } }
    // a box the view gained is said and marked added; one it lost is said and comes back, removed, in its place, round the cards
    // it held that no box holds now (audit 52: neither was said or drawn; an empty box is not drawn)
    { const nb = new Set(arr(v.containers).filter(Boolean).map(c => c.id)), lost = arr(o.containers).filter(c => c && typeof c === 'object' && c.id != null && !nb.has(c.id));
      const got = arr(v.containers).filter(c => c && typeof c === 'object' && c.id != null && !ob.has(c.id));
      got.forEach(c => says(`adds the box ${bn(c)}`)); lost.forEach(c => says(`removes the box ${bn(c)}`));
      if (got.length || lost.length) { const res = arr(w.containers || v.containers).map(c => c && typeof c === 'object' && c.id != null && !ob.has(c.id) ? { ...c, change: 'added' } : c);
        const ghost = c => ({ ...c, change: 'removed', nodeIds: arr(c.nodeIds).filter(id => w.nodeIds.includes(id) && !boxOf(v, id)) });
        let at = 0; arr(o.containers).forEach(c => { if (lost.includes(c)) res.splice(at++, 0, ghost(c)); else { const i = res.findIndex(x => x && c && x.id === c.id); if (i >= 0) at = i + 1; } });
        const has = new Set(res.filter(Boolean).map(c => c.id));
        w.containers = res.map(c => c && c.change === 'removed' && c.parent != null && !has.has(c.parent) ? (({ parent, ...r }) => r)(c) : c); } }
    // a model line the view hid or showed (its ends staying), and a sequence's steps in a new order: said, and marked in a list
    const shown = (m, x) => { const K = keyed(arr(m.edges));
      // a re-pointed line is kept when an end left or came (audit 62: re-pointed while its old end left the view, it was lost from
      // the picture): hid holds it and it is drawn back removed by its old ends; its sentence goes with the card's (below)
      return linesOf(m, x).filter(e => line0.has(K.get(e)) && (moved1.has(K.get(e)) || ![e.from, e.to].some(i => left.includes(i) || came.includes(i)))).map(e => K.get(e)); };
    // a line a view lists is drawn only when both its ends are on the view (a card, a box, or one that holds the end): audit 60, a
    // re-pointed line a view still lists, its new end not on the view, read as drawn there, and was neither said nor drawn back removed
    const drew = (m, x) => { const K = keyed(arr(m.edges)), S = new Set([...arr(x.nodeIds), ...arr(x.containers).map(c => c && c.id), ...arr(x.nodes).map(n => n && n.id)]);
      return new Set(linesOf(m, x).filter(e => !Array.isArray(x.edges) || typedL(v) || onCard({ from: e.from }, S) && onCard({ from: e.to }, S)).map(e => K.get(e))); };
    const d0 = moved1.size ? drew(A, o) : null, d1 = moved1.size ? drew(out, v) : null;
    const s0 = shown(A, o), s1 = shown(out, v), hid = s0.filter(id => moved1.has(id) ? d0.has(id) && !d1.has(id) : !s1.includes(id)), put = s1.filter(id => moved1.has(id) ? d1.has(id) && !d0.has(id) : !s0.includes(id));
    // a line taken out by its ends before, one put in by its ends after (audit 59: a re-pointed line put in read its old ends)
    const ln = (id, now) => { const e = now && moved1.get(id) || line0.get(id); return `the line from ${labelOr((at.get(e.from) || {}).label, e.from)} to ${labelOr((at.get(e.to) || {}).label, e.to)}${labelOr(e.label, null) != null ? ` (${e.label})` : ''}`; };
    const withCard = (e, l) => e && typeof e === 'object' && [e.from, e.to].some(i => l.includes(i)); // said with the card that left or came
    hid.forEach(id => { touched.add(v.id); if (!withCard(line0.get(id), left)) viewSaid.push(`takes ${ln(id)} out of the view ${vn}`); });
    put.forEach(id => { if (withCard(moved1.get(id), came)) touched.add(v.id); else says(`puts ${ln(id, true)}`); });
    // a re-pointed line taken out, drawn back removed by its old ends wherever the view drew it (audit 60: only a view that stopped
    // listing it drew it back; one that still lists it, or lists none, drew nothing). Without its id: a copy between other ends
    // under the model line's id is a second line (validate()), and the sketch would draw it for the model's line. Not in a typed view,
    // whose own line needs an id and whose type may read it as the model's (a C4 step): there it is as audit 59 left it
    const ghost = new Map(typedL(v) ? [] : hid.filter(id => moved1.has(id)).map(id => [id, (({ id: _, ...e }) => line(e, 'removed'))(line0.get(id))]));
    // the steps' order: a view's list as it runs (a model line by id, one of its own by its id), else its model lines. A step
    // with no id is matched by what it is (its ends and label), and by its Ref name only when nothing matches it, so taking
    // out an earlier a->b step does not read as the later one moving (audit 20)
    const what = e => 'c' + canon([e.from, e.to, e.label ?? null]);
    const ord = (x, s, E) => { if (Array.isArray(x.edges)) { const k = lineKeys(x.edges);
        return x.edges.map((e, i) => typeof e === 'string' ? (s.includes(e) ? ['=' + e, '=' + e] : null) : e && typeof e === 'object' ? [e.id != null ? '+' + e.id : what(e), '+' + k[i]] : null).filter(Boolean); }
      const K = keyed(E); return linesOf({ edges: E }, x).map(e => e.id != null ? ['=' + e.id, '=' + e.id] : [what(e), '=' + K.get(e)]); };
    const q0 = ord(o, s0, arr(A.edges)), q1 = ord(v, s1, E1), two = l => l.map(k => [k, k]);
    // a numbered-card view with no stepIds numbers its cards in nodeIds order (audit 19)
    const numbered = x => (x.mainSteps || x.render === 'process') && !Array.isArray(x.stepIds);
    if ((stepped(v) && stepped(o) && !sameOrder(q0, q1)) || (numbered(v) && numbered(o) && !sameOrder(two(oldIds), two(ids)))) says('reorders the steps');
    // the cards it keeps in a new order (audit 42): a sequence's lifelines, a timing view's lanes, an activity's partitions, a
    // mindmap's subtopics, a layered view's ranks are drawn in nodeIds order. Said, and the view listed, when the picture of
    // the old model with only that order changed differs from the old one's (a view whose cards are pinned draws the same)
    else if (!(numbered(v) && numbered(o))) { const ks = new Set(ids.filter(x => typeof x === 'string')), ko = new Set(oldIds.filter(x => typeof x === 'string'));
      const k0 = [...ko].filter(x => ks.has(x)), k1 = [...ks].filter(x => ko.has(x));
      if (k0.some((x, i) => x !== k1[i]) && reordered(o)) { const mv = movedIn(k0, k1), ovr = v.nodeOverrides && typeof v.nodeOverrides === 'object' ? v.nodeOverrides : {};
        const cn = id => { const x = Object.hasOwn(ovr, id) ? ovr[id] : null; return String(labelOr(x && typeof x === 'object' && x.label != null ? x.label : (at.get(id) || {}).label, id)); };
        if (mv.length > 3) says(`reorders ${mv.length} cards`); else mv.forEach(([id, p]) => says(`moves ${cn(id)} ${p == null ? 'to the start' : 'after ' + cn(p)}`)); } }
    if (Array.isArray(v.edges)) { const back = new Map([...goneLines, ...hid.map(id => [id, ghost.get(id) || line(line0.get(id), 'removed')])]), now = new Set(v.edges);
      // a model line the view listed to a card it no longer shows (hidden: the line stays in the model) goes with the card,
      // back in its place, removed (audit 51: the card was drawn back, its line was not)
      const leftS = new Set(left); if (Array.isArray(o.edges)) o.edges.forEach(x => { const e = typeof x === 'string' && !now.has(x) && !back.has(x) && line0.get(x);
        if (e && onCard(e, leftS)) back.set(x, line(e, 'removed')); });
      w.edges = mark(arr(o.edges), v.edges, line, lineKeys, back).map(e => typeof e !== 'string' ? e : put.includes(e) ? line(out.edges.find(x => x && String(x.id) === e), 'added') : ghost.has(e) ? back.get(e) : e);
      w.edges.forEach(e => unmark(e, true)); // a line of its own the diff does not mark: no mark an author wrote, as a model line
      hid.forEach(id => { if (!w.edges.includes(back.get(id))) w.edges.push(back.get(id)); }); // hidden from a view that listed none: at the end
      // a line it still lists to a card it no longer shows is drawn no more: removed, in its place; one to a card it now shows is
      // drawn now: added (audit 54: a dynamic view's steps through a card taken out of it were drawn live and numbered, and every
      // later step kept its old number). A model line it lists by id, and one of its own (audit 55: only the model's were marked),
      // an end on a member by the card that holds it (a port, a part)
      const lineAt = new Map(out.edges.filter(e => e && typeof e === 'object' && e.id != null).map(e => [String(e.id), e]));
      const outS = new Set(left.filter(id => how.get(at.get(id)) !== 'removed')), inS = new Set(came.filter(id => at.get(id) && how.get(at.get(id)) !== 'added'));
      if (outS.size || inS.size) w.edges = w.edges.map(x => { const own = x && typeof x === 'object' && (how.get(x) === 'changed' || !how.has(x) && x.change == null);
        const e = typeof x === 'string' ? now.has(x) && lineAt.get(x) : own && x, h0 = e && how.get(e);
        if (!e || h0 === 'added' || h0 === 'removed') return x; const h = onCard(e, outS) ? 'removed' : onCard(e, inS) ? 'added' : null;
        if (h === 'removed' && typeof x === 'string') (listedIn.get(w) || listedIn.set(w, []).get(w)).push(x);
        return h ? line(e, h) : x; }); } // said with the card (as audit 51's), not as a line of the model
    else if (Array.isArray(o.edges)) { // a view that dropped its list: its lines listed (to the cards that left too), the ones it puts marked, and the old
      // list's own and removed lines back in their place (as tags first: mark() keeps a string, so only those come back marked)
      const K = keyed(arr(out.edges)), all = linesOf(out, w), tag = all.map((e, i) => e.id != null ? String(e.id) : '\0' + i), by = new Map(tag.map((t, i) => [t, all[i]]));
      w.edges = mark(arr(o.edges), tag, line, lineKeys, new Map([...goneLines, ...ghost])).map(t => { const e = typeof t === 'string' && by.get(t);
        return !e ? t : put.includes(K.get(e)) ? line(e, 'added') : e.id != null ? t : e; }); }
    // a lifeline that left, back in its place, back in the covers of each interaction use that covered it (audit 62: the use's
    // covers skipped it, and the model failed validate(), "not next to each other in nodeIds")
    if (left.length && Array.isArray(w.edges) && Array.isArray(o.edges)) { const O = new Map(o.edges.filter(x => x && typeof x === 'object' && x.id != null).map(x => [String(x.id), x])), cv = x => x && x.props && typeof x.props === 'object' && Array.isArray(x.props.covers) ? x.props.covers : null;
      w.edges.forEach(x => { const c1 = x && typeof x === 'object' && ours.has(x) && x.id != null && cv(x), c0 = c1 && cv(O.get(String(x.id)));
        if (c0 && c0.some(id => left.includes(id) && !c1.includes(id))) x.props = { ...x.props, covers: [...c0.filter(id => c1.includes(id) || left.includes(id)), ...c1.filter(id => !c0.includes(id))] }; }); }
    // a line to a card the view no longer shows, in a view that lists none (it draws every line between its cards), goes with the
    // card, removed (audit 52: drawn live; audit 51 did it for a view that lists its lines). A view drawn as a map gets its lines
    // listed, as it draws them; a typed one, whose type picks the lines it draws, a mark by line in view.diffMarks (below)
    // And a line to a card it now shows, drawn now and not before: added (audit 54: an instance put back into a deployment view
    // drew its line unmarked, where the model before drew an implied line)
    // a line the diff marked changed (its label edited) goes or comes with the card too, as in a view that lists its lines
    // (audit 56: it stayed live, amber, to the card's ghost)
    const free = e => e && typeof e === 'object' && (!e.change || how.get(e) === 'changed');
    const hidL = left.filter(id => how.get(at.get(id)) !== 'removed'), hidS = new Set(hidL), hidOn = e => free(e) && (hidS.has(e.from) || hidS.has(e.to));
    const camL = came.filter(id => at.get(id) && how.get(at.get(id)) !== 'added'), camS = new Set(camL), camOn = e => free(e) && (camS.has(e.from) || camS.has(e.to));
    const lineNow = e => hidOn(e) ? line(e, 'removed') : camOn(e) ? line(e, 'added') : null;
    if ((hidL.length || camL.length) && !Array.isArray(v.edges)) { const byId = new Map(arr(out.edges).filter(e => e && typeof e === 'object' && e.id != null).map(e => [String(e.id), e]));
      if (Array.isArray(w.edges)) w.edges = w.edges.map(x => { const e = typeof x === 'string' ? byId.get(x) : x; return lineNow(e) || x; });
      else if (typedL(v)) hidIn.push([w, hidL, camL]);
      else w.edges = linesOf(out, w).map(e => lineNow(e) || (typeof e.id === 'string' ? e.id : e)); }
    // a map view that lists none gets its lines listed, as it draws them, with a re-pointed line it drew back removed in its place,
    // and one re-pointed onto it marked added, as a view that lists its lines marks it (audit 61: drawn changed). Its lines as the
    // model holds them, each by what the list above made of it (audit 61: read through that list, a line marked with a card that
    // came or went was a copy, no model line, and was not drawn)
    if ((ghost.size || put.length) && !Array.isArray(v.edges) && !Array.isArray(o.edges) && !typedL(v)) { const K = keyed(arr(out.edges)), src = linesOf(out, { ...w, edges: undefined });
      const L = Array.isArray(w.edges) ? w.edges : src.map(e => typeof e.id === 'string' ? e.id : e), now1 = new Map(src.map((e, i) => [e, put.includes(K.get(e)) ? line(e, 'added') : L[i]]));
      // a re-pointed line taken out is drawn by its old ends alone, never also by its new ones to a card that left with it: the view
      // never drew it there
      w.edges = arr(out.edges).flatMap(e => e && ghost.has(K.get(e)) ? [ghost.get(K.get(e))] : now1.has(e) ? [now1.get(e)] : []); }
    // a box in both an author marked: no mark, as a card (one it gained is added, one it lost comes back removed, above)
    { const C = w.containers || v.containers, kept = new Set(arr(v.containers).filter(c => c && typeof c === 'object').map(c => c.id)), mine = c => c && typeof c === 'object' && c.change != null && !planned(c.change) && ob.has(c.id) && kept.has(c.id);
      if (Array.isArray(C) && C.some(mine)) w.containers = C.map(c => mine(c) ? (({ change, ...r }) => r)(c) : c); }
    return w;
  });
  arr(A.views).forEach(o => { if (!isView(o) || V1.has(o.id)) return; // a removed view comes back with everything in it removed
    const ov = idTable(o.nodeOverrides);
    arr(o.nodeIds).forEach(id => { ov[id] = { ...ov[id], change: 'removed' }; });
    const w = { ...o, nodeOverrides: plain(ov) };
    if (o.nodes) w.nodes = o.nodes.map(n => { const y = card(n, 'removed'); how.set(y, 'removed'); return y; });
    // its lines too, its boxes, its fragments and its timeline's changes and constraints (audit 52: drawn live): a view drawn as a map gets
    // its lines listed, each marked; a typed one keeps its list, and what its type draws for it is marked in view.diffMarks (below)
    const byId = new Map(arr(A.edges).filter(e => e && typeof e === 'object' && e.id != null).map(e => [String(e.id), e])), once = new Set();
    if (typedL(o)) { if (Array.isArray(o.edges)) w.edges = o.edges.map(e => e && typeof e === 'object' ? line(e, 'removed') : e); rmTyped.push(w); }
    else w.edges = (Array.isArray(o.edges) ? o.edges : linesOf(A, o)).flatMap(e => { const x = typeof e === 'string' ? byId.get(e) : e;
      if (!x || typeof x !== 'object') return [e]; if (typeof e === 'string') { if (once.has(e)) return []; once.add(e); } return [line(x, 'removed')]; });
    const gone = l => Array.isArray(l) ? l.map(x => x && typeof x === 'object' && !Array.isArray(x) ? { ...x, change: 'removed' } : x) : l;
    if (Array.isArray(o.fragments)) w.fragments = gone(o.fragments);
    if (!typedL(o) && Array.isArray(o.containers)) w.containers = gone(o.containers); // a map's boxes
    if (o.timeline && typeof o.timeline === 'object' && !Array.isArray(o.timeline)) w.timeline = { ...o.timeline, ...['changes', 'constraints'].reduce((t, k) => Array.isArray(o.timeline[k]) ? { ...t, [k]: gone(o.timeline[k]) } : t, {}) };
    touched.add(o.id); views.push(w); });
  out.views = views;
  // a member's own mark an author wrote (one this diff marks is marked below: added, changed, or a copy back removed). Not in a
  // card that comes back removed: its members are the model before's, which is laid out as it was. On copies: a changed card
  // shares its members with the after side the summary compares (audit 62: "renames Order to Purchase (members)")
  [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { if (how.get(n) === 'removed' || !n || typeof n !== 'object') return; const seen = new Set();
    const own = y => { const c = []; if (Array.isArray(y.members)) y.members = y.members.map(z => z && typeof z === 'object' && !Array.isArray(z) && !seen.has(z) ? (seen.add(z), c[c.length] = { ...z }) : z); return c; };
    for (const s = own(n); s.length;) { const x = s.pop(); unmark(x); s.push(...own(x)); } });

  // a removed item whose owner left too (a message in a fragment's operand, a state in a region) brings that owner back,
  // removed, in its place: a member into its element, a fragment into its view
  const at0 = new Map(), have = new Map(), ownIn = (x, to, up, i) => { // id -> [the object, where it sits]
    for (const s = [[x, up, i]]; s.length;) { const [y, u, j] = s.pop(); if (!y || typeof y !== 'object' || y.id == null || to.has(y.id)) continue;
      to.set(y.id, [y, u, j]); arr(y.members).forEach((z, k) => s.push([z, y.id, k])); } };
  arr(A.nodes).forEach(n => ownIn(n, at0)); arr(A.views).forEach(v => v && arr(v.fragments).forEach((f, i) => ownIn(f, at0, { view: v.id }, i)));
  out.nodes.forEach(n => ownIn(n, have)); views.forEach(v => v && [...arr(v.nodes), ...arr(v.fragments)].forEach(n => ownIn(n, have)));
  // a member that left an element that stayed: the summary says it went, not that its owner's members changed; one a removed
  // line ends on (a part, a port) comes back, removed, in its place, so the line's ends hold and it is drawn
  const lost = new Map(), need = new Set(), top = id => { let t = id; while (at0.has(t) && typeof at0.get(t)[1] === 'string') t = at0.get(t)[1]; return t; };
  [...out.edges, ...views.flatMap(v => arr(v && v.edges))].forEach(e => { if (!e || how.get(e) !== 'removed') return; const p = (e.props && e.props.ends) || {};
    [e.from, e.to, (p.from || {}).part, (p.to || {}).part].forEach(r => { for (let t = r; at0.has(t) && !have.has(t) && !need.has(t); t = at0.get(t)[1]) need.add(t); }); });
  at0.forEach(([x, up, i], id) => { if (typeof up !== 'string' || have.has(id) || !have.has(up)) return; lost.set(id, [x, top(up), up]);
    if (!need.has(id)) return; const o = have.get(up)[0], y = { ...copyOf(x), change: 'removed' };
    (o.members = [...arr(o.members)]).splice(Math.min(i, o.members.length), 0, y); ownIn(y, have, up, i); });
  // a removed extend that names an extension point gone with it (a row of its use case, not put back): the point's name as it
  // was, on the line (pointNames), so it reads as it did, "(extras)", not by the point's id (audit 48)
  [...out.edges, ...views.flatMap(v => arr(v && v.edges))].forEach(e => { if (!e || how.get(e) !== 'removed' || !e.props || !Array.isArray(e.props.extensionPoints)) return;
    const names = e.props.extensionPoints.filter(id => typeof id === 'string' && at0.has(id) && !have.has(id)).map(id => { const x = at0.get(id)[0]; return [id, x && typeof x === 'object' ? elName(x) : id]; });
    if (names.length) e.pointNames = Object.fromEntries(names); });
  // a member new to an element that stayed (audit 46: an added part, port or lane drawn as live): marked added, and said
  // "adds X to Y"; what it holds is new with it. Only an element's (a card's) members: a fragment's operands are the sequence's
  const rooted = new Set(); [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { for (const s = [n]; s.length;) { const x = s.pop();
    if (!x || typeof x !== 'object' || x.id == null || rooted.has(x.id)) continue; rooted.add(x.id); arr(x.members).forEach(y => s.push(y)); } });
  const gained = new Map(); have.forEach(([x, up], id) => { if (typeof up !== 'string' || at0.has(id) || !at0.has(up) || !rooted.has(id)) return;
    gained.set(id, [x, top(up), up]); x.change = 'added'; });
  // a member in both whose own fields changed, or that another element of the model now holds (audit 47: a renamed or retyped
  // part or port, drawn as its own shape, was drawn as live): marked changed, and said by its name, as a card is. What it
  // holds is its own; a member's change (an author's) is no field of its own here
  const ownOf = y => { const z = { ...y }; delete z.members; delete z.change; return canon(z); }, edited = new Map();
  have.forEach(([x, up], id) => { if (typeof up !== 'string' || !at0.has(id) || !rooted.has(id) || gained.has(id)) return; const [o, up0] = at0.get(id);
    if (o === x || !o || typeof o !== 'object' || ownOf(o) === ownOf(x) && up0 === up) return; edited.set(id, [x, top(up), up, o, up0]); x.change = 'changed'; });
  // an element as it was or is with the members that came or went taken out, and one edited as it was (said on its own, and
  // kept in its place, so a reorder of the rest still reads "moves")
  // A member moved to another owner is taken out on both sides too (audit 49: "changes A (members)" and "changes B (members)"
  // were said beside "moves X out of A into B")
  const movedM = id => edited.has(id) && edited.get(id)[2] !== edited.get(id)[4];
  const strip = x => { const y = copyOf(x), seen = new Set(); for (const s = [y]; s.length;) { const z = s.pop(); if (seen.has(z)) continue; seen.add(z); if (Array.isArray(z.members)) { const k = z.members.filter(m => !(m && typeof m === 'object' && (lost.has(m.id) || gained.has(m.id) || movedM(m.id)))).map(m => m && typeof m === 'object' && edited.has(m.id) ? { ...copyOf(edited.get(m.id)[3]), ...(Array.isArray(m.members) ? { members: m.members } : {}) } : m); if (!k.length) delete z.members; else z.members = k; arr(z.members).forEach(m => m && typeof m === 'object' && s.push(m)); } } return y; };

  // the summary: views, then cards, then lines, in model order; a line to a card that came or went goes with the card
  const cards = [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].filter(Boolean);
  const named = new Map([...views.flatMap(v => arr(v && v.containers)), ...cards, ...[...lost.values(), ...gained.values(), ...edited.values()].map(([y]) => y), ...[...lost.values(), ...gained.values(), ...edited.values()].map(([, , u]) => (have.get(u) || [])[0])].filter(Boolean).map(n => [n.id, n]));
  const name = id => String(labelOr((named.get(id) || (have.get(id) || at0.get(id) || [])[0] || {}).label, id)); // a member that stayed (a lane in its pool, audit 47) by its label too
  // a line's end on a member, as describe() names it (audit 18): a port by its owner ("orders of Shop API"), an end through a part by
  // that part ("charge of battery"); else a member by its own name
  const ups = id => { const s = []; for (let t = id, r; (r = have.get(t) || at0.get(t)) && typeof r[1] === 'string' && !s.includes(r[1]);) s.push(t = r[1]); return s; };
  const endName = (e, k) => { const id = e[k], r = have.get(id) || at0.get(id), part = (((e.props && e.props.ends) || {})[k] || {}).part, own = r && r[1];
    if (!r || typeof own !== 'string') return name(id); const m = r[0], word = elName, pr = part != null && (have.get(part) || at0.get(part));
    return word(m) + (part != null && part !== id ? ' of ' + (pr ? word(pr[0]) : name(part)) : /\.Port$/.test(String(m.type)) ? ' of ' + name(own) : ''); };
  const cardHow = new Map([...cards.filter(n => how.has(n)).map(n => [n.id, how.get(n)]), ...[...lost.keys()].map(id => [id, 'removed'])]);
  const lines = [...new Set([...out.edges.filter(e => e && typeof e === 'object'), ...views.flatMap(v => arr(v && v.edges).filter(e => e && typeof e === 'object'))])]; // a view that dropped its list holds the model's lines themselves
  const diffKeys = ([o, x]) => [...new Set([...Object.keys(o), ...Object.keys(x)])].filter(k => canon(o[k]) !== canon(x[k]));
  views.forEach(v => { if (isView(v) && !V0.has(v.id)) said.push(`adds the view ${labelOr(v.title, v.id)}`); });
  arr(A.views).forEach(o => { if (isView(o) && !V1.has(o.id)) said.push(`removes the view ${labelOr(o.title, o.id)}`); });
  cards.forEach(n => { const h = how.get(n);
    if (h === 'added') { // each card at the far end named once, however many lines join them (audit 27: "to Queue and Queue")
      const far = (k, j) => [...new Set(lines.filter(e => e[k] === n.id && how.get(e) === 'added').map(e => name(e[j])))], ins = far('to', 'from'), outs = far('from', 'to');
      const both = ins.filter(x => outs.includes(x)), only = (l, w) => (l = l.filter(x => !both.includes(x))).length ? `, ${w} ${andList(l)}` : '';
      said.push(`adds ${name(n.id)}` + (ins.length === 1 && outs.length === 1 && !both.length ? ` between ${ins[0]} and ${outs[0]}` : only(ins, 'from') + only(outs, 'to') + (both.length ? `, to and from ${andList(both)}` : ''))); }
    if (h === 'removed') said.push(`removes ${name(n.id)}`);
    lost.forEach(([y, t, u]) => { if (t === n.id) said.push(`removes ${name(y.id)} from ${name(u)}`); });
    gained.forEach(([y, t, u]) => { if (t === n.id) said.push(`adds ${name(y.id)} to ${name(u)}`); });
    if (h === 'changed') (() => { const [o, x] = [...lost.values(), ...gained.values(), ...edited.values()].some(([, t]) => t === n.id) || [...edited.values()].some(([, , u, , u0]) => u0 !== u && typeof u0 === 'string' && top(u0) === n.id) ? was.get(n).map(strip) : was.get(n); if (canon(o) === canon(x)) return; const keys = diffKeys([o, x]), rest = keys.filter(k => k !== 'label'), p0 = o.parent ?? null, p1 = x.parent ?? null;
      if (keys.join() === 'parent' && p0 !== p1 && A.schemaVersion === 2 && out.schemaVersion === 2) return said.push(`moves ${name(n.id)} ${p1 != null ? 'into ' + name(p1) : 'out of ' + name(p0)}`); // a re-own (schema version 2; absent or null is no owner)
      const t = TYPED.diff && TYPED.diff(o, x, name, [A, out]); if (t) return said.push(...t); // a typed element's own words (src/uml/diff.js)
      said.push((keys.includes('label') ? `renames ${labelOr(o.label, o.id)} to ${labelOr(x.label, x.id)}` : `changes ${name(n.id)}`) + (rest.length ? ` (${rest.join(', ')})` : '')); })();
    // its edited members after it (audit 47)
    edited.forEach(([y, t, u, o, u0]) => { if (t !== n.id) return; const ks = diffKeys([o, y]).filter(k => !['members', 'change', 'label'].includes(k)), n0 = elName(o), n1 = elName(y);
      if (n0 !== n1) said.push(`renames ${n0} to ${n1} in ${name(u)}` + (ks.length ? ` (${ks.join(', ')})` : ''));
      else if (ks.length) said.push(`changes ${n1} of ${name(u)} (${ks.join(', ')})`);
      if (u0 !== u) said.push(`moves ${n1} ${typeof u0 === 'string' ? 'out of ' + String(labelOr(((have.get(u0) || at0.get(u0) || [])[0] || {}).label, u0)) + ' ' : ''}into ${name(u)}`); }); });
  lines.forEach(e => { const h = how.get(e), p = (e.props && e.props.ends) || {}; // an end on a part: the part counts as its card
    if (!h || h !== 'changed' && [e.from, e.to, (p.from || {}).part, (p.to || {}).part].some(id => id != null && cardHow.get(id) === h)) return;
    const ends = e.from == null && e.to == null ? null : `${endName(e, 'from')} to ${endName(e, 'to')}`, lab = labelOr(e.label, null) != null ? ` (${e.label})` : '', it = ends ? 'the line from ' + ends : labelOr(e.label, e.id); // an item with no ends (an interaction use) by its name
    if (h === 'added') said.push(ends ? `adds a line from ${ends}${lab}` : `adds ${it}`);
    if (h === 'removed') said.push(ends ? `removes ${it}${lab}` : `removes ${it}`);
    if (h === 'changed') { const [o, x] = was.get(e), t = TYPED.diff && TYPED.diff(o, x, name, [A, out]); if (t) return said.push(...t);
      said.push(`changes ${it} (${diffKeys([o, x]).map(k => k === 'label' ? `label ${labelOr(o.label, '-')} → ${labelOr(x.label, '-')}` : k).join(', ')})`); } });
  // the rules: each added, removed or changed said, and the views where what they find changes touched
  const R0 = arr(A.rules), R1 = arr(out.rules);
  if (canon(R0) !== canon(R1)) { const rk = (r, i) => r && typeof r === 'object' && r.id != null ? String(r.id) : '#' + i, rn = r => String(labelOr(r && typeof r === 'object' ? labelOr(r.title, r.id) : null, 'a rule')); // a title 0 by it (audit 34)
    const m0 = new Map(R0.map((r, i) => [rk(r, i), r])), m1 = new Map(R1.map((r, i) => [rk(r, i), r]));
    m1.forEach((r, k) => { if (!m0.has(k)) said.push(`adds the rule ${rn(r)}`); else if (canon(m0.get(k)) !== canon(r)) said.push(`changes the rule ${rn(r)}`); });
    m0.forEach((r, k) => { if (!m1.has(k)) said.push(`removes the rule ${rn(r)}`); });
    const found = m => { const by = new Map(); rules(m).forEach(b => by.set(b.view, [...(by.get(b.view) || []), b.message].sort())); return by; }, f0 = found(A), f1 = found(out);
    views.forEach(v => { if (v && canon(f0.get(v.id) || []) !== canon(f1.get(v.id) || [])) touched.add(v.id); }); }
  // the stories and lenses, as the rules are, and the map's title and any other field of the model's own: none is drawn on a
  // view, but a change to one is a change (audit 31: diff --base said "No map model changed." for a story's caption)
  const listed = (k, word) => { const L0 = arr(A[k]), L1 = arr(out[k]); if (canon(L0) === canon(L1)) return;
    const key = (x, i) => x && typeof x === 'object' && x.id != null ? String(x.id) : '#' + i, nm = x => String(labelOr(x && typeof x === 'object' ? labelOr(x.title, x.id) : null, `a ${word}`));
    const m0 = new Map(L0.map((x, i) => [key(x, i), x])), m1 = new Map(L1.map((x, i) => [key(x, i), x]));
    m1.forEach((x, k) => { if (!m0.has(k)) said.push(`adds the ${word} ${nm(x)}`); else if (canon(m0.get(k)) !== canon(x)) said.push(`changes the ${word} ${nm(x)}`); });
    m0.forEach((x, k) => { if (!m1.has(k)) said.push(`removes the ${word} ${nm(x)}`); }); };
  listed('stories', 'story'); listed('lenses', 'lens');
  const T0 = labelOr((before || {}).title, null), T1 = labelOr((after || {}).title, null); // a title "" is none: the page draws Map (audit 35)
  if (canon(T0) !== canon(T1)) said.unshift(T1 == null ? `takes the title ${String(T0)} off the map` : T0 == null ? `titles the map ${String(T1)}` : `retitles the map ${String(T0)} to ${String(T1)}`);
  const own = new Set(['nodes', 'edges', 'views', 'rules', 'stories', 'lenses', 'title']), B0 = before && typeof before === 'object' ? before : {}, B1 = after && typeof after === 'object' ? after : {};
  const rest = [...new Set([...Object.keys(B0), ...Object.keys(B1)])].filter(k => !own.has(k) && canon(B0[k]) !== canon(B1[k]));
  if (rest.length) said.push(`changes the model (${rest.join(', ')})`);
  moved.forEach(([verb, id, v]) => said.push(`${verb} ${name(id)} ${verb === 'puts' ? 'in' : 'out of'} the view ${labelOr(v.title, v.id)}`));
  said.push(...viewSaid);
  if (TYPED.order) TYPED.order(A, out, views.filter(v => !v || V1.has(v.id)), V0, said, touched, name); // a removed view's own lists went with it, said so already

  const W = new Map(views.filter(Boolean).map(v => [v.id, v]));
  const back = [...out.nodes, ...out.edges, ...views.flatMap(v => v ? [...arr(v.nodes), ...arr(v.edges)] : [])].filter(x => x && how.get(x) === 'removed').map(x => x.parent);
  while (back.length) { const chain = []; // the owners that left, from the item's up to one still there
    for (let id = back.pop(); id != null && !have.has(id) && at0.has(id) && !chain.includes(id); id = at0.get(id)[1]) chain.push(id);
    for (const id of chain.reverse()) { if (have.has(id)) continue; const [x, up, i] = at0.get(id), y = { ...copyOf(x), change: 'removed' };
      const v = up && typeof up === 'object' ? W.get(up.view) : null, o = v ? null : (have.get(up) || [])[0];
      if (!v && !o) break;
      const l = v ? (v.fragments = [...arr(v.fragments)]) : (o.members = [...arr(o.members)]); l.splice(Math.min(i, l.length), 0, y);
      ownIn(y, have, up, i); if (v) back.push(y.parent); } }

  /* what the core's delete took out of others' lists (a type's refs, 'drop': a BPMN element's groups) comes back for an element
     that comes back removed, where it stood, so the type draws it as it was (audit 49: a deleted group drawn round nothing, so
     not drawn). After the summary: the element that named it changed, and is said and marked so */
  { const walk = (l, f) => { for (const s = [...arr(l)]; s.length;) { const x = s.pop(); if (x && typeof x === 'object' && !Array.isArray(x)) { f(x); s.push(...arr(x.members)); } } };
    const all1 = [out.nodes, out.edges, ...views.flatMap(v => v ? [v.nodes, v.edges, v.fragments] : [])], gone = new Set();
    all1.forEach(l => walk(l, x => { if (x.change === 'removed' && x.id != null) gone.add(x.id); }));
    if (gone.size) { const old = new Map(); [A.nodes, A.edges, ...arr(A.views).flatMap(v => v ? [v.nodes, v.edges, v.fragments] : [])].forEach(l => walk(l, x => { if (x.id != null && !old.has(x.id)) old.set(x.id, x); }));
      all1.forEach(l => walk(l, y => { const o = y.change === 'removed' ? null : old.get(y.id), R = o && propRefs(y.type);
        if (!R || !o.props || typeof o.props !== 'object' || !y.props || typeof y.props !== 'object') return;
        Object.keys(R).forEach(path => { const k = /^props\.([^.]+)$/.exec(path); if (R[path] !== 'drop' || !k) return; const was0 = o.props[k[1]], now = y.props[k[1]];
          if (!Array.isArray(was0) || (now != null && !Array.isArray(now))) return; const res = [...arr(now)];
          was0.forEach((r, i) => { if (gone.has(r) && !res.includes(r)) res.splice(Math.min(i, res.length), 0, r); });
          if (res.length !== arr(now).length) y.props = { ...y.props, [k[1]]: res }; }); })); } }
  // the views that show a change: a card or line the diff marks, or a card it put in or took out
  // a typed view of a model at another schemaVersion draws otherwise (version 1 draws it as a map, audit 39)
  const typedV = v => v.diagram != null && v.diagram !== 'map';
  if (canon(B0.schemaVersion) !== canon(B1.schemaVersion)) views.forEach(v => { if (v && typedV(v)) touched.add(v.id); });
  /* a typed view draws more than it lists (audit 39): a package's box or name over its classes, a part's type and that type's
     ports, a deployed container's name on its instance, the lifelines and messages of the interaction an overview draws
     inline. So it shows a change to any element its own elements name (an id written anywhere in them: a member, a prop, a
     type) or own (their owners, up the tree), and to a view they open. Conservative: a change to such an element that the view
     does not draw lists it too */
  const topOf = new Map(), elOf = new Map(), vids = new Set(views.filter(Boolean).map(v => v.id));
  [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { if (!n || typeof n !== 'object' || n.id == null || elOf.has(n.id)) return; elOf.set(n.id, n);
    for (const s = [n], seen = new Set(); s.length;) { const x = s.pop(); if (!x || typeof x !== 'object' || seen.has(x)) continue; seen.add(x); if (x.id != null && !topOf.has(x.id)) topOf.set(x.id, n.id); arr(x.members).forEach(y => s.push(y)); } });
  // an element named by its name (a part's valueType, an attribute's type), as it was or is: by the name before a rename too,
  // and every element of that name (audit 53: a second interface block named as a port's type, which leaves it no arrow)
  const named0 = new Map(); [...arr(A.nodes), ...arr(A.views).flatMap(v => arr(v && v.nodes)), ...elOf.values()].forEach(n => { if (n && typeof n === 'object' && typeof n.label === 'string' && topOf.has(n.id)) { const l = named0.get(n.label) || named0.set(n.label, []).get(n.label), t = topOf.get(n.id); if (!l.includes(t)) l.push(t); } });
  // the strings an element's fields hold, but for its own words (audit 43: a C4 container labelled Shop API read as naming the
  // map card Shop API, and its views were listed with the card's change): a name, a caption, a description names nothing
  const wordKeys = new Set(['label', 'sublabel', 'title', 'description', 'note', 'notes', 'doc', 'body', 'text', 'technology', 'caption', 'icon']);
  const texts = x => { const l = []; for (const s = [x], seen = new Set(); s.length;) { const y = s.pop(); if (typeof y === 'string') l.push(y); else if (y && typeof y === 'object' && !seen.has(y)) { seen.add(y); Object.entries(y).forEach(([k, z]) => { if (Array.isArray(y) || !wordKeys.has(k)) s.push(z); }); } } return l; };
  const refs = v => { const ids = new Set(), vs = new Set(), name = s => topOf.has(s) ? [topOf.get(s)] : typeof s !== 'string' ? [] : named0.get(s) ?? named0.get(s.split('::').pop()) ?? [];
    const up = (t, l) => { for (let k = 0; t != null && !ids.has(t) && k < 1e4; k++) { ids.add(t); l.push(t); const p = (elOf.get(t) || {}).parent; t = topOf.has(p) ? topOf.get(p) : null; } };
    let now = []; [...arr(v.nodeIds), ...arr(v.nodes).map(n => n && n.id)].forEach(id => topOf.has(id) && up(topOf.get(id), now));
    linesOf(out, v, ups).forEach(e => [e.from, e.to, ...texts(e.props)].forEach(s => name(s).forEach(n => up(n, now))));
    // what its elements name, and what those name in turn (a part's type's port's type), each with its owners; a view too when
    // an element has the view's id (audit 48: a map card named after the view it opens hid a retitle of that view)
    for (let d = 0; d < 2 && now.length; d++) { const next = []; now.forEach(t => texts(elOf.get(t)).forEach(s => { name(s).forEach(n => up(n, next)); if (vids.has(s)) vs.add(s); })); now = next; }
    return { ids, vs }; };
  // a typed view whose type says which lines it draws (drawn) shows a line's change only through what it draws (audit 47: a
  // context-level line between a container view's subject, drawn as its boundary, and a person was counted as drawn there)
  const ownLines = v => !(typedV(v) && out.schemaVersion === 2 && typeof (diagramOf(v) || {}).drawn === 'function');
  const changed = new Set(views.filter(v => v && (touched.has(v.id) || arr(v.nodeIds).some(id => cardHow.has(id)) || ownLines(v) && linesOf(out, v, ups).some(e => how.has(e)))).map(v => v.id));
  const sure = new Set(changed); // listed by what it lists itself; the rest below by what it draws from others, and a typed one of those only when its picture changed
  // a line that came or went still counts (audit 48: auto placement reads every line among the view's cards, so they move), when the picture changed
  views.forEach(v => { if (v && !changed.has(v.id) && !ownLines(v) && linesOf(out, v, ups).some(e => how.has(e) && how.get(e) !== 'changed')) changed.add(v.id); });
  /* what a typed view draws from beyond its own elements and lines (audit 40): the relationships an implied C4 line stands for
     (its type's drawn), a required stereotype's extension, the identifying relationship that makes a shown IDEF1X entity
     dependent (its type's touches), each in the model before and after: listed when one of them is marked */
  // a line a view writes inline is one too (audit 41: an inline identifying relationship makes an IDEF1X entity of another view dependent)
  const lineHow = new Set([...out.edges, ...views.flatMap(v => arr(v && v.edges))].filter(e => e && typeof e === 'object' && e.id != null && how.has(e)).map(e => String(e.id)));
  // and the lines it draws, compared before and after (audit 41): a DFD level's flows change with its parent view's cards, a C4
  // implied line moves with a hidden element moved to another owner (its type's drawnKeys: each line by its ends, else drawn)
  const byId = m => new Map(arr(m.views).filter(w => w && typeof w === 'object').map(w => [w.id, w])), W0 = byId(B0), W1 = byId(B1);
  const keysOf = (T, m, w) => { const f = typeof T.drawnKeys === 'function' ? T.drawnKeys : T.drawn; try { return canon([...new Set(arr(f(m, w)).map(x => String(x)))].sort()); } catch { return null; } };
  if (out.schemaVersion === 2) views.forEach(v => { const T = v && !changed.has(v.id) && typedV(v) && diagramOf(v); if (!T || !T.drawn && !T.touches) return;
    for (const [m, w] of [[out, v], [A, V0.get(v.id)]]) for (const f of [T.drawn, T.touches]) { if (!w || typeof f !== 'function' || changed.has(v.id)) continue;
      try { if (arr(f(m, w)).some(id => cardHow.has(id) || lineHow.has(String(id)))) changed.add(v.id); } catch { /* a model the hook cannot read: as before */ } }
    const w0 = W0.get(v.id), w1 = W1.get(v.id);
    if (!changed.has(v.id) && T.drawn && w0 && w1 && B0.schemaVersion === 2) { const k0 = keysOf(T, B0, w0), k1 = keysOf(T, B1, w1); if (k0 != null && k1 != null && k0 !== k1) changed.add(v.id); } });
  /* the icons table (audit 41): a view is listed when it shows a card whose icon's entry changed, came or went: a map card's
     icon, or a typed card's props.icon (a cloud card's, keyed "<pack>/<icon>"), or one of their owners' (a group's) */
  const icons = m => m.icons && typeof m.icons === 'object' && !Array.isArray(m.icons) ? m.icons : {}, ic0 = icons(B0), ic1 = icons(B1), own1 = (o, k) => Object.hasOwn(o, k) ? o[k] : undefined;
  const iconK = new Set([...Object.keys(ic0), ...Object.keys(ic1)].filter(k => canon(own1(ic0, k)) !== canon(own1(ic1, k))));
  if (iconK.size) { const at = new Map(); [...out.nodes, ...views.flatMap(v => arr(v && v.nodes))].forEach(n => { if (n && typeof n === 'object' && !at.has(n.id)) at.set(n.id, n); });
    // a typed card's props.icon is looked up as its view's pack's key, "<diagram>/<icon>", as clIcon does (audit 42: not by the
    // key's tail in any pack, which listed an AWS view for a "gcp/Users" entry)
    const hit = (n, pack) => n && typeof n === 'object' && (typeof n.icon === 'string' && iconK.has(n.icon)
      || pack != null && n.props && typeof n.props === 'object' && typeof n.props.icon === 'string' && iconK.has(pack + '/' + n.props.icon));
    views.forEach(v => { if (!v || changed.has(v.id)) return; const ov = v.nodeOverrides && typeof v.nodeOverrides === 'object' ? v.nodeOverrides : {};
      const pack = out.schemaVersion === 2 && typedV(v) && typeof v.diagram === 'string' ? v.diagram : null;
      if ([...arr(v.nodeIds), ...arr(v.nodes).map(n => n && n.id)].some(id => { if (typeof id === 'string' && hit(own1(ov, id), pack)) return true;
        for (let t = id, k = 0, seen = new Set(); t != null && !seen.has(t) && k < 1e4; k++) { seen.add(t); const n = at.get(t); if (hit(n, pack)) return true; t = n && n.parent; } return false; })) changed.add(v.id); }); }
  const typedRefs = out.schemaVersion === 2 ? views.filter(v => v && typedV(v) && !changed.has(v.id)).map(v => [v.id, refs(v)]) : [];
  // a view its elements open: its title is drawn in their names (", opens Checkout"), and an overview draws an interaction inline
  const titled = new Set(views.filter(v => v && V0.has(v.id) && String(labelOr(V0.get(v.id).title, v.id)) !== String(labelOr(v.title, v.id))).map(v => v.id));
  for (let more = true; more;) { more = false; typedRefs.forEach(([id, r]) => { const inl = (diagramOf(W.get(id)) || {}).inlines;
    if (!changed.has(id) && ([...r.ids].some(t => cardHow.has(t)) || [...r.vs].some(x => x !== id && (titled.has(x) || inl && changed.has(x))))) more = !!changed.add(id); }); }
  // a map card's open pill counts what the view it opens draws (audit 40): a map view holding a card that opens a listed view
  // is listed when that count changed, the two models laid out only when asked (a typed view draws no pill)
  let cx; const ctx = i => (cx ||= [before, after].map(m => { try { return held(() => mapContext(m || {}))[0]; } catch { return null; } }))[i];
  const kids = (i, id, vid) => { try { const c = ctx(i); return c ? c.kidCount(id, vid) : null; } catch { return null; } };
  const opened = (i, id, vid) => { try { const c = ctx(i); return c ? c.childOf(id, vid) : null; } catch { return null; } };
  // a card that may open a listed view, as childOf finds one (its view or opensView, a view of its id, a view whose node it is), before or after
  const nodesOf = m => [...arr(m.nodes), ...arr(m.views).flatMap(w => arr(w && w.nodes))].filter(n => n && typeof n === 'object'), byNode = new Map();
  [...nodesOf(A), ...nodesOf(out)].forEach(n => { const l = byNode.get(n.id) || byNode.set(n.id, []).get(n.id); l.push(n); });
  const ofNode = new Set([...arr(A.views), ...views].filter(w => w && changed.has(w.id)).map(w => w.node));
  const may = (id, v) => changed.has(id) || ofNode.has(id) || [...(byNode.get(id) || []), ...[v, V0.get(v.id)].map(w => w && w.nodeOverrides && typeof w.nodeOverrides === 'object' ? w.nodeOverrides[id] : null)]
    .some(n => n && typeof n === 'object' && [n.view, n.opensView].some(o => typeof o === 'string' && changed.has(o)));
  views.forEach(v => { if (v && !changed.has(v.id) && !(out.schemaVersion === 2 && typedV(v)) && arr(v.nodeIds).some(id => typeof id === 'string' && may(id, v) && [0, 1].some(i => changed.has(opened(i, id, v.id))) && kids(0, id, v.id) !== kids(1, id, v.id))) changed.add(v.id); });
  /* a member gone from an element that stayed comes back, removed, in its place when a listed view drew it as its own shape
     (audit 46: a part, port or lane with no line went from the picture): a box, a lane, a region, or a port drawn on a part
     ("<part>-><port>"). A class's attribute or a state's internal transition is a row of its owner, drawn as it is: said, not
     put back. Only the listed typed views are laid out, in the model before, and only when such a member went */
  const back2 = [...lost].filter(([id]) => !need.has(id) && rooted.has(lost.get(id)[2]) && have.has(lost.get(id)[2]));
  /* and one moved to another owner (audit 49: a port moved from Service into Engine went from Service's frame with no mark),
     when a shape a listed view drew for it in the model before is drawn no more: a copy, removed, in its old place, under an id
     of its own (the member holds its id where it is now) */
  const moved2 = [...edited].filter(([, [, , u, , u0]]) => u0 !== u && typeof u0 === 'string' && rooted.has(u0) && have.has(u0));
  if (back2.length || moved2.length) { const drew = new Set(), raw0 = new Set(), raw1 = new Set();
    const shapesOf = (c, v, into, raw) => { try { const [g] = held(() => c().buildGeo(v.id)); ['nodes', 'families', 'lanes', 'groups', 'bands'].forEach(k => arr(g && g[k]).forEach(x => { if (!x || typeof x.id !== 'string') return;
        raw.add(x.id); if (!into) return; into.add(x.id); const j = x.id.lastIndexOf('->'); if (j >= 0) into.add(x.id.slice(j + 2)); })); } catch { /* a view a model cannot lay out: nothing to bring back from it */ } };
    for (const v of views) { if (!v || !changed.has(v.id) || !typedV(v) || !V0.has(v.id)) continue;
      shapesOf(ctx0, v, drew, raw0); if (moved2.length) shapesOf(() => ctx(1), v, null, raw1); }
    back2.forEach(([id, [x, , up]]) => { const [, , i] = at0.get(id), o = have.get(up)[0]; if (!drew.has(id) || arr(o.members).some(m => m && m.id === id)) return; const y = { ...copyOf(x), change: 'removed' };
      (o.members = [...arr(o.members)]).splice(Math.min(i, o.members.length), 0, y); ownIn(y, have, up, i); });
    // a shape drawn for it before, its id or "<on>-><id>" (a port on a part), that the model after does not draw
    let used; const free = x => { used ||= usedIds(out); let k = x; for (let j = 2; used.has(k); j++) k = `${x}-${j}`; used.add(k); return k; };
    const re = z => { const c = { ...z, id: free(`${z.id}~moved`), change: 'removed' }; if (Array.isArray(z.members)) c.members = z.members.map(m => m && typeof m === 'object' && m.id != null ? re(m) : m); return c; };
    moved2.forEach(([id, [, , , o0, u0]]) => { if (![...raw0].some(k => (k === id || k.endsWith('->' + id)) && !raw1.has(k))) return;
      const [, , i] = at0.get(id), o = have.get(u0)[0], y = re(copyOf(o0));
      (o.members = [...arr(o.members)]).splice(Math.min(i, o.members.length), 0, y); ownIn(y, have, u0, i); }); }
  /* what a typed view draws that is no element or line of its own (audit 47), from the view laid out in the model before and
     after: a port a retyped part gained or lost, a containment line that is new, and a line the type derived from an owner an
     element left (a C4 implied line, a requirement's containment), which comes back removed (view.diffMarks.gone); and "none"
     for a shape drawn from what it reads (x.reads), an implied or a derived line, that looks as it did, so a change it does not
     draw (a container's description, an undrawn relationship's label) marks nothing. Written to view.diffMarks, which marks()
     and the types read. Laid out: the listed typed views, and a view whose type draws from what it does not list (drawn,
     touches) */
  views.forEach(v => { if (v && typeof v === 'object') delete v.diffMarks; }); // what an earlier diff worked out is no mark of this one (a copy: the input stays)
  if (out.schemaVersion === 2 && B0.schemaVersion === 2 && B1.schemaVersion === 2) {
    const GEO = new Set(['x', 'y', 'w', 'h', 'col', 'row', 'gx', 'gy', 'nx', 'ny', 'tx', 'tw', 'pts', 'p1', 'p2', 'stubs', 'lbl', 's', 't', 'fs', 'ts', 'stack', 'fromSide', 'toSide',
      'fixed', 'portRank', 'tpb', 'fpb', 'portMin', 'how', 'sort', 'cut', 'nameBox', 'points', 'ticks', 'busy', 'head', 'pad', 'depth', 'div', 'down', 'portTop', 'change', 'edited',
      'reads', 'implied', 'ids', '_id', 'aria']); // and its accessible name, which names what it reads, drawn or not (audit 50)
    const sig = x => canon(Object.keys(x).filter(k => !GEO.has(k)).sort().map(k => [k, x[k]]));
    // a view's whole picture, but for the marks an author wrote (a typed view's own lines are drawn by their geometry, not their ends' objects)
    // and the ids a shape reads or a line stands for, which are never drawn (audit 51: an undrawn relationship to an IDEF1X entity
    // that came or went listed the view, its picture the same), and its accessible name, as sig() leaves it out (audit 59: a C4
    // implied line's name read a relabelled relationship whose label it does not draw, and the view was listed with no mark on it)
    const picture = g => canon([g.legend ?? null, g.bounds ?? null, ...['nodes', 'families', 'edges', 'lanes', 'groups', 'bands'].map(k => arr(g[k]).map(x => x && typeof x === 'object'
      ? Object.keys(x).filter(q => !['change', 'edited', 's', 't', 'reads', 'implied', 'aria'].includes(q)).sort().map(q => [q, x[q]]) : x))]);
    const lay = (i, id) => { try { const c = ctx(i); return c ? held(() => c.buildGeo(id))[0] : null; } catch { return null; } };
    const shapes = g => new Map(['nodes', 'families'].flatMap(k => arr(g && g[k])).filter(x => x && typeof x.id === 'string').map(x => [x.id, x]));
    const linesG = g => new Map(arr(g && g.edges).filter(x => x && typeof (x._id ?? x.id) === 'string').map(x => [String(x._id ?? x.id), x]));
    const modelLine = new Set([...arr(A.edges), ...arr(after && after.edges), ...arr(A.views).flatMap(w => arr(w && w.edges)), ...arr(after && after.views).flatMap(w => arr(w && w.edges))]
      .filter(e => e && typeof e === 'object' && e.id != null).map(e => String(e.id)));
    const elId = id => at0.has(id) || have.has(id);
    // what diff() marks: a "none" only where marks() would put a mark (a shape reading, or an implied line standing for, one of them)
    const hit = new Set([...cardHow.keys(), ...lineHow, ...edited.keys(), ...gained.keys()].map(String));
    // and what one view marks of its own, which marks() reads there: a model line taken out of its list or put in, its own lines,
    // fragments and timeline, a card hidden by its overrides (audit 53: an IDEF1X entity reading a relationship its view no longer
    // lists was marked changed, though it draws as it did). A shape reads in its view, or in the one it names (x.readsIn)
    const VW = new Map(views.filter(w => w && typeof w === 'object').map(w => [w.id, w])), vHit = new Map();
    const ownHit = id => { if (vHit.has(id)) return vHit.get(id); const w = VW.get(id), s = new Set(); vHit.set(id, s); if (!w) return s;
      const tl = w.timeline && typeof w.timeline === 'object' ? [w.timeline.constraints, w.timeline.changes] : [];
      for (const q = [w.edges, w.fragments, ...tl].flatMap(arr); q.length;) { const x = q.pop(); if (!x || typeof x !== 'object') continue; if (x.change != null && x.id != null) s.add(String(x.id)); arr(x.members).forEach(m => q.push(m)); }
      const ov = w.nodeOverrides && typeof w.nodeOverrides === 'object' ? w.nodeOverrides : {}; Object.keys(ov).forEach(k => { if (ov[k] && typeof ov[k] === 'object' && ov[k].change != null) s.add(k); });
      return s; };
    const hitsAt = (vid, x, k) => { const l = x && x[k]; if (!Array.isArray(l)) return false; const o = ownHit(typeof x.readsIn === 'string' ? x.readsIn : vid); return l.some(r => typeof r === 'string' && (hit.has(r) || o.has(r))); };
    // a port on a part, <part>-><port>: both ends elements of the model, before or after
    const onPart = id => { const j = id.lastIndexOf('->'); return j > 0 && elId(id.slice(0, j)) && elId(id.slice(j + 2)) ? id.slice(0, j) : null; };
    const derivedL = (e, k) => Array.isArray(e.implied) || (k.includes('->') && !modelLine.has(k));
    views.forEach(v => { if (!v || !typedV(v) || !V0.has(v.id)) return; const T = diagramOf(v); let listed = changed.has(v.id);
      // and a card this view alone marks, one taken out of it or put into it (its nodeOverrides' change, as diff() wrote it): a shape
      // that reads it (an information flow's conveyed item) and draws as it did is "none" too (audit 53: both flows marked changed).
      // Only that: one that read it and reads it no more is marked by what the type draws, as before
      const ov = x => x && typeof x.nodeOverrides === 'object' && x.nodeOverrides ? x.nodeOverrides : {}, ov0 = ov(V0.get(v.id)), ov1 = ov(v);
      const mine = Object.keys(ov1).filter(id => ov1[id] && typeof ov1[id] === 'object' && ov1[id].change != null && ov1[id].change !== (Object.hasOwn(ov0, id) && ov0[id] && typeof ov0[id] === 'object' ? ov0[id].change : undefined));
      const vh = mine.length ? new Set([...hit, ...mine]) : hit, hitsV = l => Array.isArray(l) && l.some(r => typeof r === 'string' && vh.has(r));
      if (!T || !listed && typeof T.drawn !== 'function' && typeof T.touches !== 'function') return;
      const g1 = lay(1, v.id); if (!g1) return; const S1 = shapes(g1), L1 = linesG(g1);
      // both audit 53 lanes: what the view marks of its own (hitsAt) and what diff() wrote into its nodeOverrides (hitsV)
      const hits1 = (x, k = 'reads') => hitsAt(v.id, x, k), reading = [...S1.values(), ...L1.values()].some(x => hits1(x) || hitsV(x.reads) || hits1(x, 'implied'));
      if (!listed && !reading) return;
      const g0 = lay(0, v.id); if (!g0) return; const S0 = shapes(g0), L0 = linesG(g0), marks = Object.create(null), gone = [];
      // listed for what it draws from others (refs, drawn, touches), with the same picture before and after: not listed (audit 47)
      if (listed && !sure.has(v.id) && picture(g0) === picture(g1)) { changed.delete(v.id); listed = false; }
      const same = (x, y) => y && sig(x) === sig(y);
      S1.forEach((x, id) => { const y = S0.get(id), part = onPart(id);
        if ((hits1(x) || hitsV(x.reads)) && same(x, y)) marks[id] = 'none';
        else if (listed && part != null && !y && S0.has(part)) marks[id] = 'added';
        // one that read a marked element before and draws otherwise now, reading it no more (audit 48: a constraint property whose
        // block was renamed names no block, and draws no expression)
        else if (listed && y && !hits1(x) && hits1(y) && !same(x, y)) marks[id] = 'changed'; });
      L1.forEach((x, k) => { if (!derivedL(x, k) && !Array.isArray(x.reads)) return; const y = L0.get(k);
        if (same(x, y)) { if (hits1(x) || hitsV(x.reads) || hits1(x, 'implied')) marks[k] = 'none'; } else if (listed && !y && !Array.isArray(x.implied) && derivedL(x, k)) marks[k] = 'added';
        // an implied line that came, or stands for other relationships, with none of them marked (audit 48: one it stood for removed,
        // or a direct relationship removed between its ends): added, or changed. One drawn before too is changed, though every one
        // it stands for now is new (audit 49: the only relationship behind it replaced by one of another label read as added).
        // One new to the picture is added, whatever it stands for (audit 50: from a container moved into a new system, read changed)
        else if (listed && Array.isArray(x.implied)) marks[k] = y ? 'changed' : 'added'; });
      if (listed) { S0.forEach((y, id) => { const part = onPart(id); if (part != null && !S1.has(id) && S1.has(part)) marks[id] = 'removed'; });
        // between two shapes drawn after, or a removed element the view draws back (audit 50: a deleted container's implied line)
        // or one taken out of the view, drawn back removed too (audit 52: a moved requirement's old containment went missing)
        const ovr = v.nodeOverrides && typeof v.nodeOverrides === 'object' ? v.nodeOverrides : {}, out1 = id => Object.hasOwn(ovr, id) && ovr[id] && ovr[id].change === 'removed';
        const end = id => S1.has(id) || (cardHow.get(id) === 'removed' || out1(id)) && arr(v.nodeIds).includes(id);
        L0.forEach((y, k) => { if (L1.has(k) || !derivedL(y, k) || !end(y.from) || !end(y.to)) return;
          gone.push({ id: k, from: y.from, to: y.to, ...(typeof y.label === 'string' && y.label ? { label: y.label } : {}) }); }); }
      if (Object.keys(marks).length || gone.length) v.diffMarks = { ...(Object.keys(marks).length ? { marks: plain(marks) } : {}), ...(gone.length ? { gone } : {}) }; });
  }
  /* a typed view's lines to a card it no longer shows, and everything a removed typed view draws (as laid out in the model
     before), removed (audit 52): view.diffMarks.marks, which marks() reads where the line or shape has no change of its own */
  if (hidIn.length || rmTyped.length) { const gone = (v, ids, h = 'removed') => { if (!ids.length) return; const dm = v.diffMarks && typeof v.diffMarks === 'object' ? v.diffMarks : {};
      v.diffMarks = { ...dm, marks: plain({ ...(dm.marks || {}), ...Object.fromEntries(ids.map(k => [k, h])) }) }; };
    const touching = (L, ok) => { const S = new Set(L), on = id => id != null && (S.has(id) || ups(id).some(u => S.has(u)));
      return out.edges.filter(e => e && typeof e === 'object' && typeof e.id === 'string' && ok(how.get(e))
        && [e.from, e.to, ...['from', 'to'].map(k => (((e.props && e.props.ends) || {})[k] || {}).part)].some(on)).map(e => e.id); };
    // a line to a card put into it: added, where it has no change of its own and none to a card that left (audit 54)
    hidIn.forEach(([v, L, C]) => { const rm = touching(L, h => h !== 'removed'); gone(v, touching(C, h => h == null || h === 'changed').filter(k => !rm.includes(k)), 'added'); gone(v, rm); });
    rmTyped.forEach(v => { let g = null; try { g = held(() => ctx0().buildGeo(v.id))[0]; } catch { g = null; } if (!g) return;
      gone(v, [...new Set([...arr(g.nodes), ...arr(g.families), ...arr(g.edges)].map(x => x && (x._id ?? x.id)).filter(k => typeof k === 'string'))]); }); }
  // a model line the view after still lists, drawn removed with a card taken out of it: view.diffMarks.listed, so a reader of
  // the model after (describe()) tells it from a line the view stopped listing, drawn back removed alike (audit 59)
  listedIn.forEach((ids, v) => { v.diffMarks = { ...(v.diffMarks && typeof v.diffMarks === 'object' ? v.diffMarks : {}), listed: [...new Set(ids)] }; });
  return { model: out, summary: said, views: views.filter(v => isView(v) && changed.has(v.id)).map(v => v.id) };
}

/** The map against the traffic seen: a line that carries traffic but is not drawn comes in, dashed rose ("not drawn",
 *  with its calls); a drawn line between two cards that traffic was seen at, with none of its own, fades. `observed`:
 *  [{ from, to, count }], or a Jaeger or Tempo dependency list ([{ parent, child, callCount }], or { data: [...] }). A
 *  service is a card by `options.match[service]`, else by id, else by label (case aside). Counts: lines that carried
 *  traffic, came in undrawn, are idle, or could not be judged (an end traffic never reached), and services with no card,
 *  each a count of model edges (a drawn line that stands for several fades only when all are idle); views: those that
 *  show drift. */
export function drift(model, observed, options = {}) {
  // the model and the traffic: no text String() throws on (audit 20); the match table by name, where a service may be named toString (audit 21)
  const match = nameTable(options && options.match); [model, observed] = [model, observed].map(x => unreadable(x).model);
  const arr = arrOf, out = copyOf(model || {});
  const list = Array.isArray(observed) ? observed : arr(observed && observed.data);
  const cards = [...arr(out.nodes), ...arr(out.views).flatMap(v => arr(v && v.nodes))].filter(n => n && n.id != null);
  const ids = new Set(cards.map(n => String(n.id))), lower = new Map();
  cards.forEach(n => [n.id, n.label].forEach(s => { if (s != null && !lower.has(String(s).toLowerCase())) lower.set(String(s).toLowerCase(), String(n.id)); }));
  const cardOf = s => { s = String(s); const id = match.has(s) ? match.get(s) : ids.has(s) ? s : lower.get(s.toLowerCase()); return ids.has(id) ? id : null; };
  const seen = new Map(), live = new Set(), unmatched = new Set(); let counted = false;
  // an end is a service's name, text or a number: an end that is not (missing, null, or one unreadable() left out) names no
  // service (audit 21: it was listed as a service named "undefined"), and its entry is no traffic; the entry's other end,
  // a name with no card, is still listed in unmatched (audit 22: the docs said the whole entry was skipped)
  const end = x => typeof x === 'string' || typeof x === 'number' ? x : null;
  list.forEach(o => { if (!o || typeof o !== 'object') return;
    const f = end(o.from ?? o.parent), t = end(o.to ?? o.child), n = o.count ?? o.callCount, a = f == null ? null : cardOf(f), b = t == null ? null : cardOf(t);
    if (f != null && a == null) unmatched.add(String(f)); if (t != null && b == null) unmatched.add(String(t));
    if (a == null || b == null || a === b) return;
    live.add(a); live.add(b);
    if (n != null) { counted = true; if (!(+n > 0)) return; } // seen with no calls: both ends were watched, the line carried nothing
    const k = a + '\n' + b, s = seen.get(k) || { a, b, n: 0 }; s.n += +n || 0; seen.set(k, s); });
  const counts = { carried: 0, undrawn: 0, idle: 0, unknown: 0, unmatched: [...unmatched].sort() }, drawn = new Set();
  const judge = e => { if (!e || typeof e !== 'object') return e; const k = e.from + '\n' + e.to;
    if (seen.has(k)) { drawn.add(k); counts.carried++; return e; }
    if (live.has(String(e.from)) && live.has(String(e.to))) { counts.idle++; return { ...e, style: 'faded', drift: 'idle' }; }
    counts.unknown++; return e; };
  out.edges = arr(out.edges).map(judge);
  arr(out.views).forEach(v => { if (v && Array.isArray(v.edges)) v.edges = v.edges.map(judge); });
  // a new line's id "drift:a->b", or "drift:a->b-2" and on where the model holds that id, or names "a->b" two ways (audit 41,
  // as sequenceFromTrace(): the model came back failing validate() with a line id used twice)
  const used = usedIds(out), free = x => { let k = x; for (let j = 2; used.has(k); j++) k = `${x}-${j}`; used.add(k); return k; };
  seen.forEach(({ a, b, n }, k) => { if (drawn.has(k)) return; counts.undrawn++;
    const e = { id: free(`drift:${a}->${b}`), from: a, to: b, label: 'not drawn', ...(counted ? { sublabel: `${n.toLocaleString('en-US')} calls` } : {}), style: 'security', drift: 'undrawn' };
    out.edges.push(e);
    arr(out.views).forEach(v => { if (v && Array.isArray(v.edges) && arr(v.nodeIds).includes(a) && arr(v.nodeIds).includes(b)) v.edges.push(e.id); }); });
  return { model: out, counts, views: arr(out.views).filter(v => v && linesOf(out, v).some(e => e.drift)).map(v => v.id) };
}
/* ---------- paths(), reach(), describe() and otlpSpans(): a view's lines walked and put in words, with no DOM (#62, #64, #65) ----------
   A line runs from → to as the model gives it. Each result is a list of Refs a host can hand to highlight(); a line's Ref
   names one model edge (a drawn line that stands for several takes the strongest mark among them). */
// a version-2 view's type, when it is not drawn as a map: a view with no diagram, or "map", is walked as a map, its own
// lines with their labels, steps and latency (it was walked as drawn, by model line, which lost a view's own lines' fields)
const viewType = (model, viewId) => { const v = model && model.schemaVersion === 2 && arrOf(model.views).find(x => x && x.id === viewId);
  return v && v.diagram != null && v.diagram !== 'map' ? diagramOf(v) : null; };
// on the diff page's model, the model after's: a card, box or line diff() drew back removed is not walked or counted (audit 57);
// gone: a map sequence view's lines with the removed ones in their places, which describe() says as removed steps (audit 55)
function lineGraph(model, viewId) {
  const ctx = mapContext(model), v = ctx.V[viewId];
  if (!v) throw new Error(`umlimator: no view ${jsonText(viewId)}`);
  const live = liveIn(ctx, v), ids = (v.nodeIds || []).filter(i => ctx.N[i] && live.card(i)), M = new Map(arrOf(ctx.D.edges).map(e => [e && e._id, e]));
  if (!viewType(model, viewId)) { const all = ctx.viewEdges(v).filter(e => e.from !== e.to); return { ctx, v, ids, edges: all.filter(live.line), gone: all }; }
  // a typed view: its lines as drawn (a port's between the cards it is on)
  const g = ctx.buildGeo(viewId), out = new Set(g.nodes.filter(n => isGone(n) || !live.card(n.id)).map(n => n.id)), ok = id => !out.has(id) && live.card(id);
  return { ctx, v, ids: [...new Set([...ids, ...g.nodes.map(n => n.id).filter(ok)])], edges: g.edges.flatMap(d => d.from === d.to || isGone(d) || !ok(d.from) || !ok(d.to) ? [] : edgeRefIds(d).map(_id => ({ ...M.get(_id), _id, from: d.from, to: d.to })).filter(e => !isGone(e))) };
}
// the model after a diff model stands for, as a type's own describe() reads it: what diff() drew back removed left out (a card,
// a member, a line or one to what went, a view's card taken out, its own lines, boxes and fragments), every other mark kept
// (audit 58: an ER, flowchart, DFD, C4 or information flow view counted and listed them). A model with nothing removed: as it is
function afterOf(model) {
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x), gone = new Set(), lost = new Set(); let any = false;
  // a host's member that holds its owner (audit 28) is read once, and members nested 4,000 deep (audit 35) with no recursion
  const seen = new Set(), walk = top => { for (const st = [top]; st.length;) { const x = st.pop(); if (!obj(x) || seen.has(x)) continue; seen.add(x);
    if (isGone(x)) { any = true; if (typeof x.id === 'string') gone.add(x.id); } st.push(...arrOf(x.members)); } };
  arrOf(model.nodes).forEach(walk); arrOf(model.edges).forEach(e => { if (isGone(e)) { any = true; if (obj(e) && e.id != null) lost.add(String(e.id)); } });
  arrOf(model.views).forEach(v => { if (!obj(v)) return; arrOf(v.nodes).forEach(walk);
    if (obj(v.nodeOverrides) && Object.values(v.nodeOverrides).some(isGone)) any = true;
    if ([v.edges, v.containers, v.fragments].some(l => arrOf(l).some(isGone)) || v.diffMarks != null) any = true; });
  if (!any) return model;
  // one copy per element: a member that holds its owner keeps that loop in the copy, as the model has it
  const copy = new Map(), keep = root => { if (!obj(root) || !Array.isArray(root.members)) return root; if (copy.has(root)) return copy.get(root);
    const todo = [], mk = x => { const y = { ...x }; copy.set(x, y); todo.push(x); return y; }, out = mk(root);
    while (todo.length) { const x = todo.pop(); copy.get(x).members = x.members.filter(m => !isGone(m)).map(m => !obj(m) || !Array.isArray(m.members) ? m : copy.has(m) ? copy.get(m) : mk(m)); }
    return out; };
  const live = l => (Array.isArray(l) ? l.filter(x => !isGone(x)).map(keep) : l), endsOk = e => !obj(e) || (!gone.has(e.from) && !gone.has(e.to));
  const edges = Array.isArray(model.edges) ? model.edges.filter(e => !isGone(e) && endsOk(e)) : model.edges;
  arrOf(edges).forEach(e => { if (obj(e) && e.id != null) lost.delete(String(e.id)); });
  arrOf(model.edges).forEach(e => { if (obj(e) && e.id != null && !arrOf(edges).includes(e)) lost.add(String(e.id)); });
  const model1 = new Set(arrOf(edges).filter(e => obj(e) && e.id != null).map(e => String(e.id)));
  const views = Array.isArray(model.views) ? model.views.map(v => { if (!obj(v)) return v;
    const ov = obj(v.nodeOverrides) ? v.nodeOverrides : {}, out = new Set([...gone, ...Object.keys(ov).filter(k => Object.hasOwn(ov, k) && isGone(ov[k]))]);
    const w = { ...v }; delete w.diffMarks;
    if (Array.isArray(v.nodeIds)) w.nodeIds = v.nodeIds.filter(id => !out.has(id));
    if (Array.isArray(v.nodes)) w.nodes = live(v.nodes);
    if (obj(v.nodeOverrides)) w.nodeOverrides = Object.fromEntries(Object.entries(v.nodeOverrides).filter(([k]) => !out.has(k)));
    // a model line it still lists to a card taken out of it: listed, as the model after lists it (diff() marked it removed there,
    // and named it in view.diffMarks.listed); one it stopped listing, drawn back removed alike, is not (audit 59: apply()'s hide)
    const dm = obj(v.diffMarks) ? v.diffMarks : {}, still = new Set(arrOf(dm.listed).filter(x => typeof x === 'string'));
    const back = x => obj(x) && isGone(x) && x.id != null && still.has(String(x.id)) && model1.has(String(x.id)) && (out.has(x.from) || out.has(x.to)) ? String(x.id) : x;
    if (Array.isArray(v.edges)) w.edges = v.edges.map(back).filter(x => typeof x === 'string' ? !lost.has(x) : !isGone(x) && endsOk(x) && !(obj(x) && (out.has(x.from) || out.has(x.to))));
    if (Array.isArray(v.containers)) w.containers = v.containers.filter(c => !isGone(c)).map(c => obj(c) && Array.isArray(c.nodeIds) ? { ...c, nodeIds: c.nodeIds.filter(id => !out.has(id)) } : c);
    if (Array.isArray(v.fragments)) w.fragments = live(v.fragments);
    if (v.subject != null && out.has(v.subject)) delete w.subject;
    return w; }) : model.views;
  return { ...model, nodes: Array.isArray(model.nodes) ? model.nodes.filter(n => !isGone(n)).map(keep) : model.nodes, edges, views };
}
const walkFrom = (edges, start, back) => { const seen = new Set([start]); // breadth first along lines (back: against them)
  for (let q = [start]; q.length;) { const u = q.shift(); edges.forEach(e => { const [a, b] = back ? [e.to, e.from] : [e.from, e.to]; if (a === u && !seen.has(b)) { seen.add(b); q.push(b); } }); }
  return seen; };

/** Every card and line on a path from one card to another, following lines forward: the cards both reachable from `from`
 *  and leading to `to`, and the lines between them. [] when no path joins them. */
export function paths(model, viewId, from, to) {
  model = unreadable(model).model; // read as mapContext reads it: a host's getter that throws is no value (audit 25)
  const T = viewType(model, viewId); if (T && T.paths) return T.paths(model, viewId, from, to); // a type's own walk (a sequence's, in time)
  const { ids, edges } = lineGraph(model, viewId);
  if (!ids.includes(from) || !ids.includes(to)) return [];
  const F = walkFrom(edges, from), B = walkFrom(edges, to, true), on = id => F.has(id) && B.has(id);
  if (!F.has(to)) return [];
  return [...ids.filter(on).map(id => ({ type: 'node', id, view: viewId })), ...edges.filter(e => on(e.from) && on(e.to)).map(e => ({ type: 'edge', ids: [e._id], view: viewId }))];
}

/** Everything a card's lines lead to (forward), or everything that leads to it (`backward`: for calls, who depends on it),
 *  each with its distance in lines; `depth` stops the walk that many lines out. The card itself is first, at 0. */
export function reach(model, viewId, from, options = {}) {
  model = unreadable(model).model; // as paths() (audit 25)
  const { ids, edges } = lineGraph(model, viewId), back = !!options.backward, depth = options.depth ?? Infinity;
  if (!ids.includes(from)) return [];
  const ends = e => back ? [e.to, e.from] : [e.from, e.to], dist = new Map([[from, 0]]);
  for (let q = [from]; q.length;) { const u = q.shift(), d = dist.get(u); if (d >= depth) continue;
    edges.forEach(e => { const [a, b] = ends(e); if (a === u && !dist.has(b)) { dist.set(b, d + 1); q.push(b); } }); }
  const near = (x, y) => x.distance - y.distance; // a stable sort: the view's order among equals
  return [...ids.filter(id => dist.has(id)).map(id => ({ type: 'node', id, view: viewId, distance: dist.get(id) })).sort(near),
    ...edges.filter(e => { const [a, b] = ends(e); return dist.has(a) && dist.has(b) && dist.get(a) < depth; })
      .map(e => ({ type: 'edge', ids: [e._id], view: viewId, distance: dist.get(ends(e)[0]) + 1 })).sort(near)];
}

// describe()'s sentences are one per line: a line break in a label, a title or any text but an id is a space there, as
// mmOne says a topic (audit 22). A text that is an id stays as it is, so every reference still names what it names
const LINE_BREAK = /\s*[\r\n\u2028\u2029]\s*/g;
function oneLine(model) {
  let text; try { text = JSON.stringify(model); } catch { return model; } // a model JSON cannot write (a cycle): as it is
  if (typeof text !== 'string' || !/\\[nr]|[\u2028\u2029]/.test(text)) return model;
  const ids = new Set(); JSON.parse(text, (k, x) => { if (k === 'id' && typeof x === 'string') ids.add(x); return x; });
  return JSON.parse(text, (k, x) => (typeof x === 'string' && !ids.has(x) ? x.replace(LINE_BREAK, ' ') : x));
}

/** A view in plain sentences: its cards and their kinds, its boxes, what each card's lines do (in run order on a sequence
 *  view), and the cards with no line. The same model gives the same words: a text alternative, docs, or an AI's context. */
export function describe(model, viewId) {
  model = oneLine(unreadable(model).model); // as paths(): its view read once a host's getter is no value (audit 25)
  const T = viewType(model, viewId); if (T && T.describe) return T.describe(afterOf(model), viewId); // a type's own words (1.9), read as mapContext reads them (audit 19)
  const { ctx, v, ids, edges, gone } = lineGraph(model, viewId), boxes = (v.containers || []).filter(c => c && c.id && !isGone(c));
  const name = id => ctx.N[id] ? ctx.nodeIn(id, viewId).label || id : (boxes.find(c => c.id === id) || {}).label || id;
  const list = xs => xs.length < 3 ? xs.join(' and ') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // a line's kind as its colour says it: the one it names, else a hook's line guards and a board's is state (no guesses from words)
  const kind = e => WIRE_KINDS.includes(e.kind) ? e.kind : (ctx.N[e.from] || {}).kind === 'hook' ? 'guard' : [e.from, e.to].some(i => (ctx.N[i] || {}).kind === 'board') ? 'state' : 'calls';
  const VERB = { calls: 'calls', feeds: 'feeds', triggers: 'triggers', state: 'reads or writes', guard: 'guards' };
  const what = (e, n = 1) => { const t = [e.label && `"${e.label}"`, e.sublabel, v.render !== 'sequence' && e.step != null && `step ${e.step}`, n > 1 && `${n} lines`].filter(Boolean); return t.length ? ` (${t.join(', ')})` : ''; };
  // each card at the far end named once, with how many lines say the same (audit 28: "A calls B and B", as diff() said in audit 27)
  const far = es => { const by = new Map(); es.forEach(e => { const k = e.to + '\0' + what(e), g = by.get(k); if (g) g.n++; else by.set(k, { e, n: 1 }); }); return [...by.values()].map(g => name(g.e.to) + what(g.e, g.n)); };
  const out = [`${labelOr(v.title, v.id)}: ${count(ids.length, 'card')} and ${count(edges.length, 'line')}.`];
  if (ids.length) out.push(`Cards: ${ids.map(id => `${name(id)} (${KIND[kindOf(ctx.nodeIn(id, viewId).kind, true)][1]})`).join(', ')}.`);
  boxes.forEach(c => { const ins = (c.nodeIds || []).filter(i => ids.includes(i)); if (ins.length) out.push(`${name(c.id)} holds ${list(ins.map(name))}.`); });
  if (v.render === 'sequence') { const steps = gone || edges, k = runSteps(steps); steps.forEach((e, i) => out.push(`${k[i] == null ? 'Removed step' : 'Step ' + k[i]}: ${name(e.from)} ${VERB[kind(e)]} ${name(e.to)}${what(e)}.`)); } // audit 55
  else [...ids, ...boxes.map(c => c.id)].forEach(id => { const outs = edges.filter(e => e.from === id); if (!outs.length) return;
    out.push(`${name(id)} ${[...new Set(outs.map(kind))].map(k => `${VERB[k]} ${list(far(outs.filter(e => kind(e) === k)))}`).join('; ')}.`); });
  const alone = ids.filter(id => !edges.some(e => e.from === id || e.to === id));
  if (alone.length) out.push(`Not connected here: ${list(alone.map(name))}.`);
  return out.join('\n');
}

/** The spans of an OpenTelemetry trace exported as OTLP JSON, as replay() takes them: { id, parent, service, name, start,
 *  end }, times in milliseconds. */
export function otlpSpans(data) {
  const objs = x => Array.isArray(x) ? x.filter(y => y && typeof y === 'object') : []; // a malformed export: what is no list or object is skipped
  data = unreadable(data).model; // no value String() or Number() throws on (audit 20)
  const prim = x => x == null || typeof x === 'object' ? null : x; // text or a number; anything else no service
  const out = [], attr = (list, k) => { const v = (objs(list).find(a => a.key === k) || {}).value; return v && typeof v === 'object' ? prim(v.stringValue) ?? prim(v.intValue) : null; };
  objs(data && data.resourceSpans).forEach(rs => { const service = attr(rs.resource && rs.resource.attributes, 'service.name');
    objs(rs.scopeSpans || rs.instrumentationLibrarySpans).forEach(ss => objs(ss.spans).forEach(s => out.push({ id: s.spanId, parent: s.parentSpanId || null,
      service, name: typeof s.name === 'string' ? s.name : null, start: Number(s.startTimeUnixNano) / 1e6, end: Number(s.endTimeUnixNano) / 1e6 }))); });
  return out;
}
// a service's card (#65, #96): the card `match` names, else the card with that id, else the one with that label (any case)
// match is a table by name (a service may be named toString), read for text or a number; a service is text or a number
// too, anything else no service (audit 21)
const cardMatcher = (cards, match) => { const m = nameTable(match), ids = new Set(cards.map(n => String(n.id))), low = x => String(x ?? '').trim().toLowerCase();
  return s => typeof s !== 'string' && typeof s !== 'number' ? null : m.has(String(s)) ? (ids.has(m.get(String(s))) ? m.get(String(s)) : null)
    : ids.has(String(s)) ? String(s) : (n => n ? String(n.id) : null)(cards.find(n => low(n.label) === low(s))); };
// a duration in words, as replay() labels a line and a trace's view says a step's: "37 ms", "1.2 s"
const msText = x => x >= 1000 ? `${+(x / 1000).toFixed(x >= 1e4 ? 0 : 1)} s` : `${x >= 10 ? Math.round(x) : +x.toFixed(1)} ms`;

/** The path along a view's lines with the highest total of `by` (#95): `latency` (ms, the default) or `cost`, summed over
 *  its lines (a line without one counts 0). It starts at `from` and ends at `to`, either left out for any card, and never
 *  comes back to a card. { refs, total }: its cards in order, then its lines, as Refs for highlight(); no refs and 0 when
 *  no line leads from `from` (to `to`). */
export function critical(model, viewId, options = {}) {
  model = unreadable(model).model; // as paths() (audit 25)
  const { ids, edges } = lineGraph(model, viewId), by = options.by === 'cost' ? 'cost' : 'latency', { from, to } = options, none = { refs: [], total: 0 };
  if ((from != null && !ids.includes(from)) || (to != null && !ids.includes(to))) return none;
  const w = e => typeof e[by] === 'number' && e[by] > 0 ? e[by] : 0, path = [], on = new Set();
  let best = null;
  // ponytail: every path, depth first: exponential on a dense view with many ways between two cards; a longest-path pass
  // over the lines in run order (few loop back) if a map's size makes the page wait. Walked on a stack of frames, not by
  // recursion: a chain of thousands of cards overflowed the call stack (audit 36)
  const outs = new Map(), at = new Set(ids);
  edges.forEach(e => { if (!outs.has(e.from)) outs.set(e.from, []); outs.get(e.from).push(e); });
  const walk = start => { const st = [{ u: start, sum: 0, i: 0 }]; on.add(start);
    while (st.length) { const f = st[st.length - 1], out = outs.get(f.u) || [];
      if (f.i >= out.length) { on.delete(f.u); st.pop(); if (st.length) path.pop(); continue; } // back to the card before, off the line that led here
      const e = out[f.i++]; if (on.has(e.to)) continue;
      const s = f.sum + w(e); path.push(e);
      if ((to == null ? at.has(e.to) : e.to === to) && (!best || s > best.total)) best = { total: s, lines: [...path] };
      if (e.to !== to) { on.add(e.to); st.push({ u: e.to, sum: s, i: 0 }); } else path.pop(); } };
  (from != null ? [from] : ids).forEach(id => walk(id));
  if (!best) return none;
  const cards = [best.lines[0].from, ...best.lines.map(e => e.to)].filter(id => ids.includes(id));
  return { refs: [...cards.map(id => ({ type: 'node', id, view: viewId })), ...best.lines.map(e => ({ type: 'edge', ids: [e._id], view: viewId }))],
    total: +best.total.toPrecision(12) };
}

/** What taking cards out would cost (#95), with the model left as it is: `unreachable`, what loses its way to them in the
 *  view (backward, as reach() finds it: for calls, what depends on them), each with its distance in lines from the nearest,
 *  the cards themselves at 0. No rule breaks: rules only forbid lines and cycles, which taking cards out never adds. */
export function whatIf(model, viewId, options = {}) {
  const gone = new Set([].concat(options.remove ?? []).map(String)), near = new Map();
  gone.forEach(id => reach(model, viewId, id, { backward: true }).forEach(r => { const k = r.type === 'node' ? r.id : '>' + r.ids[0];
    if (!near.has(k) || r.distance < near.get(k).distance) near.set(k, r); }));
  return { unreachable: [...near.values()].sort((a, b) => (a.type === 'edge') - (b.type === 'edge') || a.distance - b.distance) };
}

/** A trace kept as a numbered view (#96): `model` with a sequence view (`render: "sequence"`) made from `spans` (as
 *  otlpSpans() reads them). Each call from one card to another (a span and its parent's) is a step, in time order, its
 *  line labelled with the span's name and its duration under it. A span's service is a card as replay() matches it:
 *  through `match`, else by id, else by label (any case); a span with no card, or whose caller has none, is no step, and
 *  the view's caption names the services with no card. The view (`view`, default "trace"; `title`) takes the place of one
 *  with its id, else comes last, under the view that shows the most of its cards. The model passed in is not changed. */
export function sequenceFromTrace(model, spans, options = {}) {
  // read as mapContext reads a model (audit 20); the match table by name, where a service may be named toString (audit 21)
  const match = options && options.match; [model, spans, options] = [model, [].concat(spans || []), { ...options, match: null }].map(x => unreadable(x).model);
  const out = copyOf(model || {}), id = String(options.view ?? 'trace'), views = arrOf(out.views);
  const cards = [...arrOf(out.nodes), ...views.flatMap(v => arrOf(v && v.nodes))].filter(n => n && n.id != null);
  const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end));
  const span = new Map(list.map(s => [String(s.id), s])), cardOf = cardMatcher(cards, match), hops = [], lost = new Set();
  list.forEach(s => { const to = cardOf(s.service); if (!to) { if (typeof s.service === 'string' || typeof s.service === 'number') lost.add(String(s.service)); return; }
    const p = s.parent != null ? span.get(String(s.parent)) : null, from = p && cardOf(p.service);
    if (from && from !== to) hops.push([from, to, s]); }); // a root span, a caller with no card, or work inside one card: no step
  hops.sort((a, b) => +a[2].start - +b[2].start); // stable: calls that start together keep the trace's order
  const nodeIds = [...new Set(hops.flatMap(([a, b]) => [a, b]))], n = hops.length, took = s => msText(+s.end - +s.start);
  // each line "<view>-<n>", unless the model holds that id (a line, a card, a view): then "<view>-<n>-2" and on, the first free;
  // the lines of the view it replaces go with it (audit 41: a model with a line "trace-1" came back failing validate())
  const used = usedIds({ ...out, views: views.filter(v => !(v && String(v.id) === id)) }), free = b => { let k = b; for (let j = 2; used.has(k); j++) k = `${b}-${j}`; used.add(k); return k; };
  const edges = hops.map(([from, to, s], i) => ({ id: free(`${id}-${i + 1}`), from, to, ...(s.name ? { label: String(s.name), sublabel: took(s) } : { label: took(s) }) }));
  // never under itself: the view it replaces and every view below that one are no home (a parent cycle), walked with a list
  const kids = new Map(), below = new Set([id]), todo = [id];
  views.forEach(v => { if (v && v.parent != null) { const p = String(v.parent); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(String(v.id)); } });
  while (todo.length) (kids.get(todo.pop()) || []).forEach(c => { if (!below.has(c)) { below.add(c); todo.push(c); } });
  const home = views.reduce((a, v) => { const k = v && !below.has(String(v.id)) ? nodeIds.filter(x => arrOf(v.nodeIds).includes(x)).length : 0; return k > a[1] ? [v.id, k] : a; }, [null, 0])[0];
  const view = { id, ...(home != null ? { parent: home } : {}), title: options.title || id,
    caption: `From a trace: ${n} call${n === 1 ? '' : 's'} between cards, in time order, each with its duration.${lost.size ? ` No card for ${andList([...lost])}.` : ''}`,
    render: 'sequence', lanes: false, nodeIds, edges };
  const at = views.findIndex(v => v && v.id === id);
  out.views = at < 0 ? [...views, view] : views.map((v, k) => k === at ? view : v);
  return out;
}
/* a lens (#94): what it lights on a view, as a layer of marks. Without `line`, the cards its pick picks and the lines
   between two of them; with `line` (line kinds), the lines of those kinds between two cards the rest of it picks, and the
   cards at their ends. The rest dims. With color 'owner', each lit card is ringed in its owner's tone, the same on every
   view (owners in name order); `owners`: the view's lit owners and their tones, for a legend. */
const OWNER_TONES = ['cyan', 'violet', 'green', 'amber', 'fuchsia', 'orange', 'rose', 'slate'];
function lensOf(ctx, vid, lens) {
  const v = ctx.V[vid], s = lens.pick && typeof lens.pick === 'object' && !Array.isArray(lens.pick) ? lens.pick : {}, { end } = endsIn(ctx, v), ok = id => picks(s, end(id));
  const kinds = s.line == null ? null : [s.line].flat(), cards = arrOf(v.nodeIds).filter(id => ctx.N[id]), all = ctx.viewEdges(v);
  const lines = all.filter(e => (!kinds || kinds.includes(WIRE_KINDS.includes(e.kind) ? e.kind : 'calls')) && ok(e.from) && ok(e.to));
  const lit = new Set(kinds ? lines.flatMap(e => [e.from, e.to]) : cards.filter(ok));
  // ponytail: eight tones, so the ninth owner shares the first's; a host that needs more rings cards itself with overlay()
  const names = [...new Set([...ctx.nodes, ...ctx.views.flatMap(w => Object.values(w.nodeOverrides || {}))].map(n => n && n.owner).filter(o => typeof o === 'string'))].sort();
  const tone = o => lens.color === 'owner' && names.includes(o) ? OWNER_TONES[names.indexOf(o) % OWNER_TONES.length] : null;
  const nodes = idTable(Object.fromEntries(cards.filter(id => lit.has(id)).map(id => [id, tone(end(id).owner) ? { tone: tone(end(id).owner) } : {}])));
  const owners = [...new Set(Object.keys(nodes).map(id => end(id).owner).filter(tone))].sort().map(o => [o, tone(o)]);
  const dim = Object.keys(nodes).length < cards.length || lines.length < all.length; // a lens that lights everything leaves the selection its own dimming
  return { layer: { nodes, edges: idTable(Object.fromEntries(lines.map(e => [e._id, {}]))), dim }, owners };
}
const STYLES = `
  /* diagrams */
  figure.dia { margin: 0 0 18px; padding: 18px 18px 14px; overflow: hidden; }
  @media (min-width: 1300px) { #diagram { position: relative; left: 50%; transform: translateX(-50%); width: min(1640px, calc(100vw - 64px)); } }
  figure.dia figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 18px; margin-bottom: 10px; }
  figure.dia .ft { font-weight: 600; font-size: 16px; }
  figure.dia .fc { color: var(--um-muted); font-size: 14px; margin-top: 10px; }
  .canvas { position: relative; overflow: hidden; border-radius: 10px; border: 1px solid var(--um-border); background-color: var(--um-bg-2); touch-action: none; cursor: grab; outline: none;
    background-image: radial-gradient(circle, var(--um-dot) 1.1px, transparent 1.4px), linear-gradient(var(--um-gridline) 1px, transparent 1px), linear-gradient(90deg, var(--um-gridline) 1px, transparent 1px); }
  .canvas:focus-visible { box-shadow: 0 0 0 2px var(--um-cyan); }
  .canvas.grabbing, .stage.grabbing { cursor: grabbing; }
  .canvas svg { display: block; position: absolute; inset: 0; }
  .canvas.full { position: fixed; inset: 12px; z-index: 60; border-radius: 14px; box-shadow: var(--um-shadow); height: auto !important; }
  body.noscroll { overflow: hidden; }
  .cam-hint { position: absolute; left: 10px; bottom: 8px; font: 500 11px var(--um-mono); color: var(--um-dim); pointer-events: none; opacity: 0; transition: opacity .2s; }
  .canvas:hover .cam-hint { opacity: 1; }
  .ctl { position: absolute; right: 10px; bottom: 10px; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 11px; background: var(--um-chrome); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); backdrop-filter: blur(10px); z-index: 4; }
  .ctl button { min-width: 30px; height: 28px; border: 0; background: none; color: var(--um-text); font: 600 13px var(--um-mono); border-radius: 8px; cursor: pointer; padding: 0 7px; }
  .ctl button:hover:not(:disabled) { background: var(--um-panel-2); color: var(--um-cyan); }
  .ctl button:disabled { opacity: .35; cursor: default; }
  .ctl .pct { min-width: 54px; font-weight: 500; color: var(--um-muted); }
  .ctl .sep { width: 1px; height: 18px; background: var(--um-border-2); margin: 0 3px; }
  .ctl .depth { font: 700 10px var(--um-mono); letter-spacing: .12em; color: var(--um-muted); padding: 0 8px; }
  .mini-ctl { opacity: .0; transition: opacity .2s; } .canvas:hover .mini-ctl, .canvas:focus-within .mini-ctl, .canvas.full .mini-ctl { opacity: 1; }
  @media (hover: none) { .mini-ctl { opacity: 1; } }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font: 600 11px var(--um-mono); color: var(--um-muted); align-items: center; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid; margin-right: 6px; vertical-align: -1px; }
  svg .n-mask { fill: var(--um-mask); }
  svg .n-body { stroke-width: 1.5; transition: stroke-width .15s, filter .15s; }
  svg .n-label { fill: var(--um-text); font: 600 13px var(--um-mono); letter-spacing: -.01em; }
  svg .n-sub { fill: var(--um-muted); font: 10px var(--um-mono); }
  svg .e-label { fill: var(--um-muted); font: 600 10px var(--um-mono); }
  svg .e-lbg { fill: var(--um-bg-2); stroke: var(--um-border); }
  svg .g-label { font: 700 10px var(--um-mono); letter-spacing: .12em; text-transform: uppercase; }
  svg .badge-tx { font: 700 8.5px var(--um-mono); letter-spacing: .08em; }
  /* a line's weight (#44) scales what is drawn for it, on hover, selection and keyboard focus only: at rest every line has
     weight 1's width and arrowhead; then --um-ew is 1.75 or 2.5 and the heavier arrowhead svgOf names (--um-mk) takes over */
  :host { --um-ew: 1; } svg .edge-g.wt-2:is(.hov, .hot, .key-on), .stage:not(.um-still) svg .edge-g.wt-2:hover, svg .line-key.wt-2 { --um-ew: 1.75; }
  svg .edge-g.wt-3:is(.hov, .hot, .key-on), .stage:not(.um-still) svg .edge-g.wt-3:hover, svg .line-key.wt-3 { --um-ew: 2.5; }
  svg .edge-g:is(.wt-2, .wt-3):is(.hov, .hot, .key-on) .edge, .stage:not(.um-still) svg .edge-g:is(.wt-2, .wt-3):hover .edge { marker-end: var(--um-mk); marker-start: var(--um-mk-s, none); }
  /* and the flow stops where that arrowhead begins: the flow line trimmed for it (fl-hv) in place of weight 1's */
  svg .fl-hv, svg .edge-g:is(.wt-2, .wt-3):is(.hov, .hot, .key-on) .flowline:not(.fl-hv), .stage:not(.um-still) svg .edge-g:is(.wt-2, .wt-3):hover .flowline:not(.fl-hv) { display: none; }
  svg .edge-g:not(.faded):is(.wt-2, .wt-3):is(.hov, .hot, .key-on) .fl-hv, .stage:not(.um-still) svg .edge-g:not(.faded):is(.wt-2, .wt-3):hover .fl-hv { display: inline; }
  svg .edge { fill: none; stroke-width: calc(1.6px * var(--um-ew, 1)); stroke-linecap: round; stroke-linejoin: round; transition: stroke-width .15s, opacity .2s; }
  svg .halo { fill: none; stroke: var(--um-bg-2); stroke-width: calc(6px + 1.8px * (var(--um-ew, 1) - 1)); }
  svg .hitline { fill: none; stroke: transparent; stroke-width: calc(12px + 1.8px * (var(--um-ew, 1) - 1)); }
  /* a line's flow: pulses in the canvas colour moving along it, as wide as the line (never a bump on it), and stopping
     where its arrowhead begins (svgOf trims the path), so the arrow keeps its shape */
  svg .flowline { fill: none; stroke: var(--um-bg-2); stroke-width: calc(1.6px * var(--um-ew, 1)); stroke-linecap: round; stroke-dasharray: 10 70; opacity: 0; pointer-events: none; }
  .flowing svg .flowline { opacity: .9; animation: flowdash 2.4s linear infinite; }
  .flowing svg .edge { opacity: .8; }
  @keyframes flowdash { to { stroke-dashoffset: -160; } }
  /* intake badges and the view tour: a ticket dot rides the loop while flow is on */
  svg .n-logo { fill: var(--um-logo-tile); stroke: var(--um-border-2); stroke-width: .8; } svg .n-logo.dark { fill: var(--um-logo-tile-dark); }
  .ph .big.logo { background: var(--um-logo-tile) !important; box-shadow: inset 0 0 0 1px var(--um-border-2); } .ph .big.logo.dark { background: var(--um-logo-tile-dark) !important; }
  svg .intake-chip { fill: var(--um-logo-tile); stroke: var(--um-border-2); stroke-width: 1.2; }
  svg .intake-tx { fill: var(--um-muted); font: 600 10.5px var(--um-sans); }
  svg .intake-chip.dashed { fill: var(--um-panel); stroke: var(--um-w-feeds); stroke-dasharray: 3 3; }
  svg .intake-mark { fill: var(--um-intake-mark); font: 700 13px var(--um-sans); }
  svg .intake-chip.dashed + .intake-mark { fill: var(--um-w-feeds); }
  svg .tour, svg .tour-glow { display: none; pointer-events: none; }
  .flowing svg .tour, .flowing svg .tour-glow { display: inline; }
  svg .tour-glow { fill: none; stroke-width: 7; stroke-linecap: round; filter: blur(2.5px); }
  svg .tour-dot { fill: var(--um-w-feeds); stroke: var(--um-bg-2); stroke-width: 1.5; filter: drop-shadow(0 0 6px var(--um-w-feeds)); }
  svg .tour-packet { fill: var(--um-w-feeds); }
  .flowing svg .node.tour-stop { transform-box: fill-box; transform-origin: center; animation: tour-pulse 8s ease-in-out infinite; }
  @keyframes tour-pulse { 0%, 9%, 100% { transform: none; filter: none; } 4% { transform: scale(1.04); filter: drop-shadow(0 0 10px color-mix(in srgb, var(--um-w-feeds) 60%, transparent)); } }
  .flowing svg .edge-g.back .edge { animation: march 1.1s linear infinite; }
  @keyframes march { to { stroke-dashoffset: -22; } }
  @media (prefers-reduced-motion: reduce) { svg .tour, svg .tour-glow { display: none !important; } .flowing svg .node.tour-stop, .flowing svg .edge-g.back .edge { animation: none; } }
  /* reduced motion: no flow is drawn, so ≋ isn't offered (as the page hides its ❚❚); the stage's class outranks :host .flowing below */
  @media (prefers-reduced-motion: reduce) { :host .stage.flowing svg .flowline { animation: none; opacity: 0; } .flowing svg .edge { opacity: 1; } .ctl [data-z="flow"] { display: none; } }
  .ctl button.on { color: var(--um-cyan); background: var(--um-cyan-f); }
  svg .flow { stroke-dasharray: 6 6; animation: flow 1.2s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -12; } }
  @media (prefers-reduced-motion: reduce) { svg .flow { animation: none; } }
  /* reading depths (archify): far out = shapes + names; closer = subs, verbs, edge labels */
  .depth-read { transition: opacity .18s; }
  [data-depth="map"] .depth-read { opacity: 0; pointer-events: none; }
  /* typed node styles (map) */
  svg .node { cursor: pointer; outline: none; }
  svg .node .n-ring { fill: none; stroke-width: 1.2; stroke-opacity: .38; }
  svg .node.pub .n-body { stroke-width: 2.6; }
  svg .node.pub .n-label { font-weight: 700; }
  svg .node.priv .n-body { stroke-width: 1; stroke-opacity: .7; fill-opacity: .5; }
  svg .node.priv .n-label { fill: var(--um-muted); font-weight: 500; font-size: 11.5px !important; }
  svg .node.priv .n-sub { display: none; }
  svg .node.priv .n-sigil { opacity: .7; }
  svg .node .n-stack { fill: var(--um-mask); stroke-width: 1; stroke-opacity: .45; }
  svg .node .ini-tx { font: 700 7.5px var(--um-mono); }
  svg .node .tab-tx, svg .family .tab-tx { font: 800 8px var(--um-mono); letter-spacing: .14em; fill: var(--um-mask); text-transform: uppercase; } svg .family .pub-tab { cursor: pointer; outline: none; }
  /* focus targets for lines and a card's tabs (#43): outside the cards, never hit by the pointer, a ring when focused by key */
  svg .um-key { outline: none; pointer-events: none; } svg .key-ring { fill: none; stroke: none; }
  svg .line-key:focus-visible .key-ring { stroke: var(--um-cyan); stroke-opacity: .8; stroke-width: calc(7.8px + 1.8px * (var(--um-ew, 1) - 1)); stroke-linecap: round; stroke-linejoin: round; }
  svg .tab-key:focus-visible .key-ring, svg .chip-key:focus-visible .key-ring, svg .family .pub-tab:focus-visible rect { stroke: var(--um-cyan); stroke-width: 2; }
  svg .node .verb-chip { fill: var(--um-mask); stroke-width: .9; stroke-opacity: .6; }
  svg .node .verb-tx { font: 600 9.5px var(--um-mono); }
  svg .node.subject .n-body { stroke-dasharray: none; filter: drop-shadow(0 0 10px color-mix(in srgb, currentColor 0%, transparent)); }
  svg .node:hover .n-body, svg .node:focus-visible .n-body { stroke-width: 3; }
  svg .node.priv:hover .n-body { stroke-opacity: 1; }
  svg .node.priv:hover .n-label { fill: var(--um-text); }
  svg .node:focus-visible .n-mask { stroke: var(--um-cyan); stroke-width: 3; }
  svg .edge-g.hov .edge, svg .edge-g.hot .edge { stroke-width: calc(2.6px * var(--um-ew, 1)); }
  .focusing:not(.um-lit) svg .node:not(.sel):not(.nb) { opacity: .28; }
  .focusing:not(.um-lit) svg .edge-g:not(.hot) { opacity: .15; }
  .focusing:not(.um-lit) svg .e-lab:not(.hot) { opacity: .15; }
  svg .node, svg .edge-g, svg .e-lab { transition: opacity .2s; }
  svg .node.sel .n-body { stroke-width: 3.2; }
  svg .node.sel .n-mask { stroke: var(--um-accent); stroke-width: 2; }
  svg .node.sel .n-body { animation: select-glow .65s ease-out; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--um-accent) 40%, transparent)); }
  svg .node.nb .n-body { stroke-width: 2.6; stroke-opacity: 1; }
  svg .n-port { fill: var(--um-panel); stroke-width: 1.5; pointer-events: none; transition: fill .2s, stroke-width .2s; }
  svg .node.sel .n-port, svg .node.nb .n-port.hot { fill: var(--um-accent); stroke: var(--um-accent); stroke-width: 2.2; }
  :host .focusing svg .edge-g.hot .flowline { opacity: .95; stroke-width: calc(2.8px * var(--um-ew, 1)); stroke-dasharray: 8 13; animation: selected-flow 1.1s linear infinite; }
  :host .focusing svg .edge-g.hot .edge { stroke-width: calc(2.8px * var(--um-ew, 1)); }
  @keyframes selected-flow { to { stroke-dashoffset: -42; } }
  @keyframes select-glow { from { filter: drop-shadow(0 0 12px color-mix(in srgb, var(--um-accent) 70%, transparent)); stroke-width: 5; } }
  svg .node.main-step .n-body { stroke-width: 2.2; }
  svg .node.main-step .n-label { font-weight: 800; }
  @media (prefers-reduced-motion: reduce) {
    svg .node, svg .edge-g, svg .e-lab, svg .n-port { transition: none; }
    svg .node.sel .n-body, svg .node.flash .n-mask { animation: none; }
    :host .focusing svg .edge-g.hot .flowline { animation: none; opacity: .8; }
    .panel { animation: none !important; }
  }
  svg .node.flash .n-mask { animation: flash 1.3s ease-out; }
  /* card shapes (0.15.0): their details, and their motion: what arrives lights a shape's accent (a head, a lid, a title bar,
     a fold); a queue's floor moves with the flow. Neither under reduced motion, nor in a picture at rest (an export) */
  svg .n-det { fill: none; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
  svg .n-dot { opacity: .75; } svg .n-field, svg .n-screen { fill: var(--um-panel); stroke-opacity: .55; stroke-width: 1; } svg .n-speaker { stroke-width: 1.9; }
  svg .n-prompt { font: 700 9px var(--um-mono); }
  svg .n-floor { fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: .1 7; opacity: 0; transition: opacity .2s; }
  .flowing svg .n-floor { opacity: .7; animation: floor 1.07s linear infinite; }
  @keyframes floor { to { stroke-dashoffset: -71; } }
  svg .node.flash .n-accent { animation: accent 1.3s ease-out; }
  @keyframes accent { 0%, 35% { stroke-width: 3.6; } }
  @media (prefers-reduced-motion: reduce) { svg .node.flash .n-accent, .flowing svg .n-floor { animation: none; } .flowing svg .n-floor { opacity: 0; } }
  @keyframes flash { 0%, 40% { stroke: var(--um-amber); stroke-width: 8; } 100% { stroke-width: 0; } }


  /* map: rounded wires with pill labels, lanes, step badges, author name tags */
  :host svg .e-lbg { fill: var(--um-panel); stroke: var(--um-border-2); }
  :host svg .e-label { fill: var(--um-text); font: 600 10.5px var(--um-sans); }
  :host svg .edge { stroke-width: calc(1.8px * var(--um-ew, 1)); }
  :host svg .w-state .edge { stroke-width: calc(1.4px * var(--um-ew, 1)); }
  :host .flowing svg .flowline { opacity: .45; }
  :host .flowing svg .edge { opacity: 1; }
  :host .flowing svg .w-state .flowline { opacity: 0; }
  svg .e-lab.ctag .e-lbg { fill: var(--um-accent-f); stroke: color-mix(in srgb, var(--um-accent) 45%, transparent); } svg .e-lab.ctag .e-label { fill: var(--um-accent); }
  svg .e-lab.w-state .e-label { fill: var(--um-muted); font-weight: 500; }
  svg .e-sub { fill: var(--um-muted); font: 500 9.5px var(--um-sans); }
  .lgi i.w { width: 18px; height: 0; border: 0; border-top: 2px solid; border-radius: 0; }
  .lgi i.w.dash { border-top-style: dashed; }
  svg .e-step { fill: var(--um-accent); } svg .e-step-tx { fill: var(--um-accent-fg); font: 700 9.5px var(--um-sans); }
  svg .lane-box { fill: var(--um-lane); stroke: var(--um-border); }
  svg .lane-num { fill: var(--um-accent); } svg .lane-num-tx { fill: var(--um-accent-fg); font: 700 11px var(--um-sans); }
  svg .lane-t { fill: var(--um-text); font: 700 11px var(--um-sans); } svg .lane-c { fill: var(--um-muted); font: 500 11px var(--um-sans); }
  svg .lane-arrow { fill: var(--um-dim); font: 600 16px var(--um-sans); }
  svg .stp { fill: var(--um-text); } svg .stp-tx { fill: var(--um-bg); font: 700 9.5px var(--um-sans); }
  svg .ntag-bg { fill: var(--um-panel); stroke: var(--um-border-2); }
  svg .ntag-tx { fill: var(--um-muted); font: 600 10px var(--um-sans); }
  svg .ntag-ring { fill: none; stroke-width: 1.6; }
  svg .ini-tx2 { font: 700 9px var(--um-sans); }
  :host svg .n-label, :host svg .e-label { font-family: var(--um-sans); }
  :host svg .n-sub, :host svg .verb-tx { font-family: var(--um-sans); }
  :host svg .n-label { font-weight: 650; letter-spacing: 0; }
  .stage.paused svg, .stage.paused svg * { animation-play-state: paused !important; }
  :host { font: 15px/1.6 var(--um-sans); color: var(--um-text); -webkit-font-smoothing: antialiased; }
  .stage { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; outline: none; background: var(--um-stage-bg); }
  .stage svg.map-svg { position: absolute; inset: 0; display: block; transition: opacity .13s ease; }
  .stage.fading svg.map-svg { opacity: 0; }
  /* controls + minimap, bottom right */
  .mctl { position: absolute; right: 16px; bottom: 40px; z-index: 3; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .minimap { width: 200px; height: 112px; border-radius: 10px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); overflow: hidden; cursor: crosshair; padding: 6px; transition: opacity .2s; }
  .minimap.all { opacity: .6; } .minimap:hover { opacity: 1; }
  .minimap svg { width: 100%; height: 100%; display: block; }
  .minimap .vp { fill: color-mix(in srgb, var(--um-accent) 10%, transparent); stroke: var(--um-accent); }
  .mctl .ctl { position: static; border-radius: 12px; padding: 4px; background: var(--um-panel); border-color: var(--um-border-2); }
  .mctl .ctl button.on { color: var(--um-accent); background: color-mix(in srgb, var(--um-accent) 14%, transparent); }
  .mctl .ctl button:hover:not(:disabled) { color: var(--um-accent); }
  .empty-view { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%); text-align: center; width: min(380px, 86%); z-index: 2; }
  .empty-view .ico { font-size: 28px; color: var(--um-dim); }
  .empty-view h2 { margin: 6px 0 4px; font: 650 16px var(--um-sans); }
  .empty-view p { margin: 0 0 12px; color: var(--um-muted); font-size: 13px; }
  svg .family-box { fill: var(--um-panel); fill-opacity: .45; stroke-width: 1.5; }
  svg .family-title { font: 650 11px var(--um-mono); }
  /* a box with a tone (--um-tone, set on it): a region tinted in the tone, as deep as --um-tint makes the cards, with its
     border dashed and its title in the tone, darkened (lightened in dark) to keep 4.5:1; an unknown tone is slate */
  svg .family.toned .family-box { fill: color-mix(in srgb, var(--um-tone, var(--um-slate)) min(7% * var(--um-tint, 1), 18%), var(--um-panel)); fill-opacity: 1;
    stroke: color-mix(in srgb, var(--um-tone, var(--um-slate)) 60%, transparent); stroke-dasharray: 7 5; }
  svg .family.toned .family-title { fill: color-mix(in srgb, var(--um-tone, var(--um-slate)) 75%, var(--um-text)); }
  svg .family.sel .family-box { stroke: var(--um-accent); stroke-width: 2; }
  svg .fold-hint { cursor: pointer; } svg .fold-hint:hover rect { stroke-width: 2; }
  svg .edited-dot { fill: var(--um-edited); stroke: var(--um-mask); stroke-width: 1.5; }
  svg .rule-mark circle { fill: var(--um-rose); stroke: var(--um-mask); stroke-width: 1.5; } svg .rule-mark text { fill: var(--um-mask); font: 800 10px var(--um-sans); pointer-events: none; }
  svg .edge-g.faded .flowline { display: none; }
  .um-rename { position: absolute; z-index: 5; box-sizing: border-box; font-family: var(--um-sans); font-weight: 600; color: var(--um-text); background: var(--um-panel); border: 1.5px solid var(--um-accent); border-radius: 6px; padding: 0 6px; outline: none; box-shadow: var(--um-shadow); }
  textarea.um-rename { resize: none; overflow: hidden; padding: 2px 6px; line-height: 1.3; }
  svg .um-ghost { opacity: .6; pointer-events: none; } svg .um-ghost.um-pending { opacity: .3; }
  svg .family.um-target .family-box { stroke: var(--um-accent); stroke-width: 2.5; stroke-dasharray: 6 4; }
  svg .um-handle circle { fill: var(--um-accent); stroke: var(--um-mask); stroke-width: 2; cursor: crosshair; }
  .um-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .um-still *, .um-still *::before, .um-still *::after { transition: none !important; animation: none !important; }
  svg .um-link { fill: none; stroke: var(--um-accent); stroke-width: 2; stroke-dasharray: 5 4; pointer-events: none; }
  /* a typed view's editing (1.7): the panels over the map's left side, the relationship picker, a line's other end */
  svg .node.um-target .n-mask { stroke: var(--um-accent); stroke-width: 2.5; stroke-dasharray: 6 4; }
  .um-editor { position: absolute; left: 8px; top: 8px; bottom: 8px; width: 236px; overflow: auto; z-index: 5; box-sizing: border-box; padding: 2px 10px 10px; border-radius: 10px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); font: 12px/1.45 var(--um-sans); color: var(--um-text); }
  .um-editor h3 { margin: 10px 0 4px; font: 700 10px var(--um-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--um-muted); }
  .um-editor ul { list-style: none; margin: 0; padding: 0; } .um-editor li, .um-editor .um-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 3px 0; }
  .um-editor li > :first-child { flex: 1; min-width: 0; text-align: left; } .um-editor small { color: var(--um-muted); }
  .um-editor label { display: block; margin: 4px 0; color: var(--um-muted); } .um-editor label.um-check { display: flex; gap: 6px; align-items: center; }
  .um-editor input:not([type]), .um-editor select, .um-editor textarea { display: block; width: 100%; min-height: 24px; box-sizing: border-box; border: 1px solid var(--um-border-2); border-radius: 6px; background: var(--um-bg-2); color: var(--um-text); font: inherit; padding: 1px 6px; }
  .um-editor textarea { resize: vertical; } .um-editor li input { display: inline-block; }
  .um-editor button, .um-pick button { min-height: 24px; min-width: 24px; border: 1px solid var(--um-border-2); border-radius: 6px; background: var(--um-bg-2); color: var(--um-text); font: inherit; padding: 1px 7px; cursor: pointer; }
  .um-editor button:hover, .um-editor button:focus-visible, .um-pick button:hover, .um-pick button:focus { border-color: var(--um-accent); color: var(--um-accent); outline: none; }
  .um-editor .um-err { border-color: color-mix(in srgb, var(--um-rose) 60%, var(--um-border-2)); } .um-editor .um-warn { border-color: color-mix(in srgb, var(--um-amber) 60%, var(--um-border-2)); }
  .um-editor .um-note, .um-editor dd { margin: 2px 0; color: var(--um-muted); } .um-editor dl { margin: 4px 0; } .um-editor dt { font-weight: 600; }
  .um-pick { position: absolute; z-index: 6; display: grid; gap: 2px; padding: 4px; border-radius: 8px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); font: 12px var(--um-sans); }
  @media (max-width: 820px) { .minimap { display: none; } .mctl { bottom: 14px; right: 12px; } }
  /* marks (#63): a ring around a card, a glow under a line, tabs and labels over the map; a layer that dims (um-lit)
     sets how lit each thing is, in place of the selection's dimming */
  svg .um-ring { fill: none; stroke-width: 2.5; opacity: .9; } svg .um-glow { fill: none; stroke-width: calc(8px + 1.8px * (var(--um-ew, 1) - 1)); stroke-linecap: round; stroke-linejoin: round; opacity: .4; }
  svg .um-pulse { animation: um-pulse 1.1s ease-in-out infinite; } @keyframes um-pulse { 50% { opacity: .08; } }
  svg .um-marks .tab-tx { font: 800 8px var(--um-mono); letter-spacing: .14em; fill: var(--um-mask); text-transform: uppercase; }
  svg .um-lab rect { fill: var(--um-panel); stroke: var(--um-border-2); } svg .um-lab text { fill: var(--um-text); font: 600 10px var(--um-sans); }
  svg .um-trip { pointer-events: none; }
  @media (prefers-reduced-motion: reduce) { svg .um-pulse { animation: none; } }
  /* a story's caption bar (#69), bottom left, clear of the controls */
  .um-story { position: absolute; left: 16px; bottom: 40px; z-index: 5; box-sizing: border-box; max-width: min(560px, calc(100% - 290px)); display: flex; align-items: flex-end; gap: 10px; padding: 9px 8px 9px 14px; border-radius: 12px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); color: var(--um-text); font: 13px/1.45 var(--um-sans); }
  .um-story .um-st { display: block; font: 600 11px var(--um-mono); color: var(--um-muted); margin-bottom: 2px; }
  .um-story p { margin: 0; } .um-story .um-sb { display: flex; gap: 2px; flex: none; }
  .um-story button { min-width: 30px; height: 28px; border: 0; border-radius: 8px; background: none; color: var(--um-text); font: 600 13px var(--um-mono); cursor: pointer; padding: 0 7px; }
  .um-story button:hover:not([aria-disabled="true"]) { background: var(--um-panel-2); color: var(--um-accent); } .um-story button[aria-disabled="true"] { opacity: .35; cursor: default; }
  @media (max-width: 820px) { .um-story { left: 12px; right: 12px; bottom: 60px; max-width: none; } }
  /* the standalone page's pieces (#99): the views list, the legend, the hint line and the details panel, in the page and,
     when a host asks, in render()'s shadow root, where these first rules give them what the page gives its whole page */
  :where(.outline, .m-legend, .hint, .panel, .lightbox, .um-navbtn), :where(.outline, .m-legend, .hint, .panel, .lightbox, .um-navbtn) * { box-sizing: border-box; }
  :where(.outline, .m-legend, .panel, .lightbox) button:focus-visible, .um-navbtn:focus-visible { outline: 2px solid var(--um-cyan); outline-offset: 2px; }
  :where(.panel, .lightbox) a { color: var(--um-cyan); }
  :where(.panel) code { font-family: var(--um-mono); font-size: .86em; overflow-wrap: anywhere; background: var(--um-panel-2); border: 1px solid var(--um-border); padding: .05em .35em; border-radius: 5px; }
  .ibtn { width: 32px; height: 32px; flex: none; border-radius: 8px; border: 1px solid var(--um-border-2); background: var(--um-panel); color: var(--um-text); cursor: pointer; font: 600 14px var(--um-sans); }
  .ibtn:hover, .ibtn[aria-expanded="true"] { border-color: var(--um-accent); color: var(--um-accent); }
  .ibtn[aria-pressed="true"] { border-color: var(--um-accent); color: var(--um-accent); }
  .ibtn.sm { width: 26px; height: 26px; font-size: 12px; border-radius: 7px; }
  /* views: Finder-style column browser */
  .outline { overflow: hidden; border-right: 1px solid var(--um-border); background: var(--um-bg); visibility: hidden; min-width: 0; }
  .tree-open .outline { visibility: visible; }
  .miller { display: flex; height: 100%; overflow-x: auto; overflow-y: hidden; scroll-behavior: smooth; scrollbar-width: thin; }
  .mcol { flex: 0 0 224px; min-width: 224px; border-right: 1px solid var(--um-border); padding: 8px 6px; overflow-y: auto; }
  .mcol:last-child { border-right: 0; flex-grow: 1; }
  .mch { font: 700 10px var(--um-sans); letter-spacing: .08em; text-transform: uppercase; color: var(--um-muted); padding: 2px 8px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mit { display: flex; justify-content: space-between; align-items: center; gap: 6px; width: 100%; min-height: 34px; padding: 7px 8px; border-radius: 6px; border: 0; background: none; color: var(--um-text); font: 500 12.5px/1.4 var(--um-sans); cursor: pointer; text-align: left; }
  .mit span { min-width: 0; overflow-wrap: anywhere; white-space: normal; }
  .mit em { font-style: normal; color: var(--um-muted); font-size: 11px; white-space: nowrap; flex: none; }
  .mit:hover { background: var(--um-panel-2); }
  .mit.path { background: var(--um-panel-2); font-weight: 650; }
  .mit.on { background: var(--um-accent-f); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--um-accent) 40%, transparent); font-weight: 650; }
  /* legend: a box in the corner that folds away */
  .m-legend { position: absolute; left: 16px; bottom: 40px; z-index: 3; background: var(--um-panel); border: 1px solid var(--um-border-2); border-radius: 12px; box-shadow: var(--um-shadow); padding: 8px 12px; font: 11.5px var(--um-sans); display: grid; grid-template-columns: repeat(2, auto); gap: 3px 16px; max-width: calc(100% - 290px); }
  .m-legend .t { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 12px; font: 700 10px var(--um-sans); letter-spacing: .1em; color: var(--um-muted); }
  .m-legend .t button { border: 0; background: none; color: var(--um-muted); cursor: pointer; font: 700 13px var(--um-sans); padding: 0 2px; line-height: 1; }
  .m-legend.folded .lgi { display: none; }
  .lgi { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
  .lgi i { width: 14px; height: 10px; border: 1.5px solid var(--um-muted); border-radius: 3px; flex: none; }
  .lgi svg.lgs { width: 21px; height: 14px; flex: none; overflow: visible; } .lgs * { vector-effect: non-scaling-stroke; stroke-width: 1.3; } .lgs .n-det, .lgs .n-screen { stroke-width: 1; }
  .lgi i.p { border-radius: 999px; } .lgi i.d { border-style: dashed; } .lgi i.h { border-radius: 0; clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 50%, calc(100% - 3px) 100%, 3px 100%, 0 50%); border: 0; }
  .lgi i.s { box-shadow: 2px 2px 0 -.5px var(--um-panel), 2px 2px 0 .5px var(--um-muted); background: var(--um-panel); }
  .lgi i.num { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--um-text); color: var(--um-bg); font: 700 8px/14px var(--um-sans); text-align: center; font-style: normal; }
  .lgi i.tag { width: 20px; border-radius: 999px; border-width: 1px; }
  .lgi b { font-weight: 650; } .lgi span { color: var(--um-muted); }
  /* help: one quiet line at the bottom */
  .hint { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; display: flex; gap: 16px; justify-content: center; align-items: center; height: 28px; padding: 0 12px; font: 11.5px var(--um-sans); color: var(--um-muted); background: color-mix(in srgb, var(--um-bg) 88%, transparent); border-top: 1px solid var(--um-border); white-space: nowrap; overflow: hidden; }
  .hint b { color: var(--um-text); font-weight: 600; }
  .hint.msg { color: var(--um-accent); font-weight: 600; }
  /* details: a short strip under the map — compact header, then When to use · What it is · How it works · Example · Behind the scenes tabs */
  .panel { flex: none; height: 234px; max-height: 44%; overflow: auto; border-top: 1px solid var(--um-border-2); background: var(--um-panel); z-index: 5; animation: rise .2s ease; }
  .panel[hidden] { display: none; }
  @keyframes rise { from { transform: translateY(12px); opacity: 0; } }
  .ph { display: flex; align-items: center; gap: 12px; padding: 12px 18px 6px; }
  .ph .big { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: var(--um-accent-fg); flex: none; }
  .ph .pt { min-width: 0; flex: 1; }
  .ph h2 { margin: 0; font: 650 17px var(--um-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ph small { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; color: var(--um-muted); font-size: 12.5px; }
  .ph .acts { display: flex; gap: 8px; align-items: center; flex: none; }
  .vis { font: 700 9px var(--um-sans); letter-spacing: .1em; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--um-border-2); color: var(--um-muted); }
  .vis.pub { background: color-mix(in srgb, var(--um-k-public) 8%, var(--um-panel)); border-color: var(--um-k-public); color: var(--um-k-public); } .vis.ext { border-style: dashed; border-color: var(--um-k-ext); color: var(--um-k-ext); }
  .author { display: inline-flex; align-items: center; gap: 6px; padding: 1px 9px 1px 1px; border-radius: 999px; border: 1px solid var(--um-border-2); color: var(--um-text); text-decoration: none; background: var(--um-panel); font-size: 12px; }
  .author:hover { border-color: var(--um-accent); }
  .author img, .author i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font: 700 9px var(--um-sans); font-style: normal; background: var(--um-panel-2); }
  .author b { color: var(--um-muted); font-weight: 500; }
  .origin { color: var(--um-muted); font-size: 12px; }
  .obtn { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 10%, var(--um-panel)); color: var(--um-text); font: 600 13px var(--um-sans); cursor: pointer; white-space: nowrap; }
  .obtn span { font-weight: 500; color: var(--um-muted); font-size: 11.5px; }
  .obtn:hover { background: color-mix(in srgb, var(--c) 20%, var(--um-panel)); }
  .ptabs { display: flex; align-items: center; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--um-border); }
  .ptablist { display: flex; align-items: center; gap: 2px; min-width: 0; } /* only tabs in it: ‹ › stand beside it */
  .ptab { border: 0; border-bottom: 2px solid transparent; background: none; color: var(--um-muted); font: 500 13px var(--um-sans); padding: 7px 10px; cursor: pointer; white-space: nowrap; }
  .ptab em { font-style: normal; font-size: 11px; color: var(--um-muted); margin-left: 4px; }
  .ptab:hover { color: var(--um-text); }
  .ptab[aria-selected="true"] { color: var(--um-text); font-weight: 650; border-bottom-color: var(--um-accent); }
  .pnav { margin-left: auto; display: flex; gap: 4px; }
  .pbody { padding: 10px 18px 14px; }
  .pbody h3 { margin: 0 0 4px; font: 700 10px var(--um-sans); letter-spacing: .1em; text-transform: uppercase; color: var(--um-muted); display: flex; gap: 6px; }
  .pbody h3 span { color: var(--um-muted); }
  .clamp { font-size: 14px; line-height: 1.55; max-width: 980px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .clamp.open { display: block; -webkit-line-clamp: unset; }
  .clamp p { margin: 0 0 6px; } .clamp ul { margin: 0 0 6px; padding-left: 18px; }
  .detail-bullets { margin: 0; padding-left: 18px; max-width: 1100px; font-size: 13px; line-height: 1.65; }
  .detail-bullets li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 2px; }
  .detail-bullets li::before { content: '•'; margin-right: 8px; color: var(--um-accent); }
  .links ul { margin: 0; padding: 0; list-style: none; }
  .links li { margin: 0; }
  .morebtn { border: 0; background: none; color: var(--um-accent); font: 600 12px var(--um-sans); padding: 2px 0 0; cursor: pointer; }
  .pnone { color: var(--um-muted); font-size: 13px; }
  .pverbs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pverb { font: 600 12px var(--um-sans); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); background: color-mix(in srgb, var(--c) 8%, transparent); padding: 1px 9px; border-radius: 999px; }
  button.pverb { cursor: pointer; } button.pverb:hover { background: color-mix(in srgb, var(--c) 18%, transparent); }
  .links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 22px; }
  .src { display: flex; align-items: center; gap: 6px; min-width: 0; } .src a, .src span { font: 12px var(--um-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  .rel { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 0 8px; align-items: center; text-align: left; background: none; border: 0; padding: 4px 6px; margin: 0 -6px; width: calc(100% + 12px); border-radius: 6px; cursor: pointer; color: var(--um-text); font: 13px var(--um-sans); }
  .rel:hover { background: var(--um-panel-2); }
  .rel i { width: 8px; height: 8px; border-radius: 50%; }
  .rel-l { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rel-e { font-size: 11.5px; color: var(--um-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
  .rel-none { color: var(--um-muted); font-size: 12.5px; padding: 2px 0; }
  /* one yellow highlighter phrase per section (==text== in the model) */
  .pbody mark { background: var(--um-mark); color: inherit; padding: 0 3px; border-radius: 3px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  /* Example tab: a data-driven gallery (node.examples = [{title, caption, thumb, full, href}]) */
  .exs { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin: 4px 0 0; padding: 0; list-style: none; max-width: 1100px; }
  .ex { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ex-thumb { display: block; padding: 0; border: 1px solid var(--um-border-2); border-radius: 8px; background: var(--um-panel-2); overflow: hidden; cursor: zoom-in; aspect-ratio: 16 / 10; }
  .ex-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
  .ex-thumb:hover, .ex-thumb:focus-visible { border-color: var(--um-accent); outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--um-accent) 30%, transparent); }
  .ex b { font: 650 13px var(--um-sans); }
  .ex small { color: var(--um-muted); font-size: 12px; line-height: 1.4; }
  .ex a { color: var(--um-accent); font: 600 12px var(--um-sans); text-decoration: none; }
  .ex a:hover { text-decoration: underline; }
  .lightbox { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 20px; background: var(--um-scrim); }
  .lightbox[hidden] { display: none; }
  .lightbox figure { margin: 0; max-width: min(1280px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: 10px; background: var(--um-panel); border-radius: 12px; padding: 12px; box-shadow: var(--um-shadow); }
  .lightbox img { max-width: 100%; max-height: calc(100dvh - 140px); object-fit: contain; border-radius: 6px; border: 1px solid var(--um-border); background: var(--um-logo-tile); }
  .lightbox figcaption { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font: 600 14px var(--um-sans); }
  .lightbox figcaption span { flex: 1; min-width: 0; }
  .lightbox figcaption a { color: var(--um-accent); text-decoration: none; font-size: 13px; }
  .pviews { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .pview { font: 500 12px var(--um-sans); color: var(--um-muted); background: var(--um-panel-2); border: 1px solid var(--um-border); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  .pview:hover { color: var(--um-text); border-color: var(--um-accent); }
  @media (max-width: 820px) {
    .ph { padding-top: 6px; } .ph .obtn span { display: none; }
    /* audit 61: on a phone the buttons move to a row under the name when the name would have less than 160 px, and wrap
       there if they must, so the name shows and Close stays on the screen */
    .ph { flex-wrap: wrap; row-gap: 8px; } .ph .pt { flex: 1 1 160px; }
    .ph .acts { flex: 0 1 auto; margin-left: auto; min-width: 0; flex-wrap: wrap; justify-content: flex-end; } .ph .obtn { max-width: 100%; min-width: 0; overflow: hidden; }
    .links { grid-template-columns: 1fr; }
    .ptabs, .ptablist { flex-wrap: wrap; } .pnav { display: none; } .ptab { padding: 7px 8px; }
    .detail-bullets li { white-space: normal; overflow: visible; }
    .exs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .m-legend, .hint:not(.msg) { display: none; } /* a message shows, as a toast (issue 134) */
    .hint.msg { left: 12px; right: 12px; bottom: 12px; height: auto; min-height: 28px; padding: 6px 12px; white-space: normal; text-align: center; border: 1px solid var(--um-border); border-radius: 10px; box-shadow: var(--um-shadow); }
  }
  /* render()'s pieces (#99), laid out as the page lays them out: the views list left of the map (☰ or O), the details under
     it, the legend and the hint line over it; while a story is told, the legend gives way to its caption bar */
  .um-frame { position: absolute; inset: 0; display: grid; grid-template: minmax(0, 1fr) / 0 minmax(0, 1fr); transition: grid-template-columns .22s ease; }
  .um-frame.tree-open { grid-template-columns: min(var(--browser-width, 224px), 38%) minmax(0, 1fr); }
  .um-main { grid-area: 1 / 2; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .um-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .um-frame > .outline { grid-area: 1 / 1; }
  .um-navbtn { grid-area: 1 / 2; align-self: start; justify-self: start; margin: 14px 16px; z-index: 4; }
  .um-stage:has(.um-story) > .m-legend { display: none; }
  /* a lens's legend (#94): each owner's tone, over the controls */
  .um-lens { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; box-sizing: border-box; max-width: 300px; padding: 6px 11px; border-radius: 10px; background: var(--um-panel); border: 1px solid var(--um-border-2); box-shadow: var(--um-shadow); color: var(--um-text); font: 12px/1.5 var(--um-sans); }
  .um-lens b { font: 700 10px var(--um-sans); letter-spacing: .1em; text-transform: uppercase; color: var(--um-muted); } .um-lens span { white-space: nowrap; }
  .um-lens i { display: inline-block; width: 8px; height: 8px; border: 2.5px solid; border-radius: 4px; margin-right: 6px; vertical-align: -1px; }
` +/* each tone's tint (--um-<tone>-f), mixed at the map from the tone and panel in effect there: mixed on :root (as the theme
     file does, for page chrome) a tint keeps the tone it was mixed from, whatever an ancestor of the map sets later. A kind's
     tint (every tone but the accent) is --um-tint times as deep: 1 by default, 0 for none, never past 18%, where a card's
     sub-line would fall below 4.5:1 */
  `:host { ${Object.entries({ accent: 12, cyan: 9, green: 9, violet: 9, amber: 10, rose: 8, orange: 9, slate: 8, fuchsia: 8, 'k-public': 8, 'k-lane': 8,
    'k-ext': 7, 'k-verb': 7, 'k-script': 5, 'k-hook': 12, 'k-board': 9 }).map(([t, p]) => `--um-${t}-f: color-mix(in srgb, var(--um-${t}) ${t === 'accent' ? p + '%' : `min(${p}% * var(--um-tint, 1), 18%)`}, var(--um-panel));`).join(' ')} }`;
/* ================= camera: wheel/pinch zoom, drag pan, animated moves =================
   Ported in spirit from archify's viewer camera (MIT): reading depths by zoom level
   (map / read / full), fit + 100% presets, keyboard steps. Implemented on the SVG viewBox
   so text stays crisp at every zoom. */
class Camera {
  constructor(el, svg, o = {}) {
    this.el = el; this.svg = svg; this.o = o; this.s = { cx: 0, cy: 0, k: 1 }; this.touched = false;
    this.ptrs = new Map(); this.anim = 0;
    el.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    el.addEventListener('pointerdown', e => this.onDown(e));
    el.addEventListener('pointermove', e => this.onMove(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, e => this.onUp(e)));
    el.addEventListener('click', e => { if (this.dragged) { e.stopPropagation(); e.preventDefault(); this.dragged = false; } }, true);
    el.addEventListener('dblclick', e => { if (e.target.closest('.node')) return; const r = el.getBoundingClientRect(); this.zoomAt(2, e.clientX - r.left, e.clientY - r.top, true); });
  }
  setSvg(svg, bounds) { this.svg = svg; this.b = bounds; }
  size() { return [this.el.clientWidth || 800, this.el.clientHeight || 500]; }
  fitState(pad = 0.94, sets) { // fits the bounds inside the viewport minus the overlay insets (header pill, hint line); sets: these insets instead
    const [W, H] = this.size(), b = this.b, opts = [].concat(sets || (this.o.inset ? this.o.inset() : { t: 0, r: 0, b: 0, l: 0 }));
    const kOf = I => Math.min(Math.max(80, W - I.l - I.r) / b.w, Math.max(80, H - I.t - I.b) / b.h);
    const I = opts.reduce((a, o) => kOf(o) > kOf(a) + 1e-6 ? o : a); // several inset sets: keep the one that leaves the map largest
    const aw = Math.max(80, W - I.l - I.r), ah = Math.max(80, H - I.t - I.b);
    const k = Math.min(Math.min(aw / b.w, ah / b.h) * pad, this.o.maxFit || 1.25);
    const sx = I.l + aw / 2 - W / 2, sy = I.t + ah / 2 - H / 2;
    return { cx: b.x + b.w / 2 - sx / k, cy: b.y + b.h / 2 - sy / k, k };
  }
  limits() { const f = this.fitState(); return [Math.min(f.k * 0.5, 0.2), this.o.max || 4]; }
  clamp(s) {
    const [lo, hi] = this.limits(), b = this.b;
    const k = Math.min(hi, Math.max(lo, s.k)), [W, H] = this.size(), mx = W / (2 * k) * .5, my = H / (2 * k) * .5;
    return { k, cx: Math.min(b.x + b.w + mx, Math.max(b.x - mx, s.cx)), cy: Math.min(b.y + b.h + my, Math.max(b.y - my, s.cy)) };
  }
  apply() {
    const [W, H] = this.size(), { cx, cy, k } = this.s;
    const vx = cx - W / (2 * k), vy = cy - H / (2 * k);
    this.svg.setAttribute('viewBox', `${vx} ${vy} ${W / k} ${H / k}`);
    this.svg.setAttribute('width', W); this.svg.setAttribute('height', H);
    const g = 24 * k, G = g * 5;
    this.el.style.backgroundSize = `${g}px ${g}px, ${G}px ${G}px, ${G}px ${G}px`;
    const ox = -vx * k, oy = -vy * k;
    this.el.style.backgroundPosition = `${ox}px ${oy}px, ${ox}px ${oy}px, ${ox}px ${oy}px`;
    this.el.dataset.depth = k < (this.o.mapDepth || 0.5) ? 'map' : k < 1.6 ? 'read' : 'full';
    this.o.onChange && this.o.onChange(this);
  }
  stopAnimation() {
    cancelAnimationFrame(this.anim); this.anim = 0;
    // Resize/refit interrupts camera motion. Navigation awaits that motion, so cancellation
    // must settle its promise too; otherwise go() never releases its busy flag. It settles false: cut short (a story's step glides again)
    const done = this.animationDone; this.animationDone = null; if (done) done(false);
  }
  set(s) { this.stopAnimation(); this.s = this.clamp({ ...this.s, ...s }); this.apply(); }
  animate(to, ms = 380) { // resolves true once there, false when cut short
    this.stopAnimation();
    const from = { ...this.s }, dest = this.clamp({ ...this.s, ...to });
    if (this.o.still ? this.o.still() : reducedMotion()) { this.set(dest); return Promise.resolve(true); }
    return new Promise(res => {
      this.animationDone = res;
      const t0 = performance.now(), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const lk0 = Math.log(from.k), lk1 = Math.log(dest.k);
      const step = now => {
        const t = Math.min(1, (now - t0) / ms), e = ease(t);
        this.s = { cx: from.cx + (dest.cx - from.cx) * e, cy: from.cy + (dest.cy - from.cy) * e, k: Math.exp(lk0 + (lk1 - lk0) * e) };
        this.apply();
        if (t < 1) this.anim = requestAnimationFrame(step); else { this.anim = 0; this.animationDone = null; res(true); }
      };
      this.anim = requestAnimationFrame(step);
    });
  }
  toWorld(sx, sy) { const [W, H] = this.size(), { cx, cy, k } = this.s; return [cx + (sx - W / 2) / k, cy + (sy - H / 2) / k]; }
  zoomAt(f, sx, sy, anim) {
    const [W, H] = this.size(); if (sx == null) { sx = W / 2; sy = H / 2; }
    const [wx, wy] = this.toWorld(sx, sy), [lo, hi] = this.limits();
    const k = Math.min(hi, Math.max(lo, this.s.k * f));
    const to = { k, cx: wx - (sx - W / 2) / k, cy: wy - (sy - H / 2) / k };
    this.touched = true;
    return anim ? this.animate(to, 220) : this.set(to);
  }
  fit(anim = true) { this.touched = false; return anim ? this.animate(this.fitState()) : this.set(this.fitState()); }
  actual(anim = true) { this.touched = true; return anim ? this.animate({ k: 1 }) : this.set({ k: 1 }); }
  pan(dx, dy, anim) { this.touched = true; const to = { cx: this.s.cx - dx / this.s.k, cy: this.s.cy - dy / this.s.k }; return anim ? this.animate(to, 160) : this.set(to); }
  reveal(r, anim = true) { // pan (no zoom change) until rect r is comfortably inside the viewport
    const [W, H] = this.size(), { cx, cy, k } = this.s, hw = W / (2 * k), hh = H / (2 * k), m = 60 / k;
    let nx = cx, ny = cy;
    if (r.x - m < cx - hw) nx = r.x - m + hw; else if (r.x + r.w + m > cx + hw) nx = r.x + r.w + m - hw;
    if (r.y - m < cy - hh) ny = r.y - m + hh; else if (r.y + r.h + m > cy + hh) ny = r.y + r.h + m - hh;
    if (r.w + 2 * m > 2 * hw) nx = r.x + r.w / 2;
    if (nx !== cx || ny !== cy) return anim ? this.animate({ cx: nx, cy: ny }, 300) : this.set({ cx: nx, cy: ny });
    return Promise.resolve();
  }
  zoomTo(r, fill = 0.9) { const [W, H] = this.size(); return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, k: Math.min(W / r.w, H / r.h) * fill }; }
  onWheel(e) {
    const pinch = e.ctrlKey || e.metaKey;
    if (this.o.wheel === 'ctrl' && !pinch && !this.el.classList.contains('full')) return; // page scroll wins in documents
    e.preventDefault();
    const r = this.el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
    const trackpadPan = !pinch && e.deltaMode === 0 && (Math.abs(dx) > 0 || (Math.abs(dy) < 40 && !Number.isInteger(dy)));
    if (trackpadPan) return this.pan(-dx, -dy);
    this.zoomAt(Math.exp(-dy * (pinch ? 0.012 : 0.0022)), sx, sy);
  }
  onDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.ctl, .minimap, button, a, input, .um-edit, .um-story') || (this.o.skip && this.o.skip(e))) return;
    this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    this.start = { x: e.clientX, y: e.clientY, s: { ...this.s }, dist: this.pinchDist() };
    this.moved = 0; this.dragged = false;
    this.stopAnimation(); // settles the glide's promise: a press during a navigation or a story's step lets it go on
  }
  pinchDist() { const p = [...this.ptrs.values()]; return p.length > 1 ? Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) : 0; }
  onMove(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.ptrs.size > 1) { // pinch
      const d = this.pinchDist(); if (!this.start.dist) { this.start.dist = d; this.start.s = { ...this.s }; return; }
      const p = [...this.ptrs.values()], r = this.el.getBoundingClientRect();
      this.s = { ...this.start.s }; this.zoomAt(d / this.start.dist, (p[0][0] + p[1][0]) / 2 - r.left, (p[0][1] + p[1][1]) / 2 - r.top);
      this.dragged = true; return;
    }
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    this.moved = Math.max(this.moved, Math.hypot(dx, dy));
    if (this.moved > 4) {
      if (!this.dragged) { this.dragged = true; this.el.classList.add('grabbing'); try { this.el.setPointerCapture(e.pointerId); } catch (_) {} }
      this.touched = true;
      this.set({ cx: this.start.s.cx - dx / this.s.k, cy: this.start.s.cy - dy / this.s.k });
    }
  }
  onUp(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId); this.el.classList.remove('grabbing');
    if (this.ptrs.size === 1) { const [p] = [...this.ptrs.values()]; this.start = { x: p[0], y: p[1], s: { ...this.s }, dist: 0 }; }
    if (!this.dragged) this.dragged = false;
  }
}
/* ---------- editing a typed view (work package 1.7) ----------
   In a schema version 2 model drawn with `editable`, a view whose `diagram` is set and is not 'map' is edited with
   commands (src/core/apply.js): each gesture emits one `edit` event, { view, commands }, a transaction the host applies with
   apply() and hands back with update(). Nothing is drawn before that (risks.md E12). A map view keeps the `change` event.
   The type's definition drives the panels (registry.js): `elements` the palette, `lines` the relationship picker, `props`
   the properties form. A type this release does not know gets one generic node and one generic line,
   core.Node and core.Line: a typed view's lines are typed, or validate() refuses them.

   Keys on a typed view: F2 renames, N adds the palette's first element, L connects (arrows or type a name, Enter),
   Alt + arrows move the card's pin, Delete hides it from this view, Shift + Delete deletes it from the model. A box the type
   gives (registry.js boxes) is selected as a container and takes F2, Delete and the panel as a card does; a card dropped in
   another box, or the Owner field, gives it a new owner (reparent). L on a line starts at its far end, with edits.connect;
   layout.pins false: no pin. src/typed/edit.js takes gestures over (TYPED.edit, registry.js). */

const GENERIC_NODE = { type: 'core.Node', label: 'Node' }, GENERIC_LINE = { type: 'core.Line', label: 'Line' };
const isRec = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/* every element of a model by id: { x, kind, owner } (owner: the element a member belongs to) */
function elementsOf(m) {
  const at = new Map(), put = (x0, kind0) => { for (const s = [[x0, kind0]]; s.length;) { const [x, kind, owner] = s.pop(); if (!isRec(x) || typeof x.id !== 'string' || at.has(x.id)) continue; // a stack: thousands deep (audit 35)
    at.set(x.id, { x, kind, owner }); const ms = arrOf(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], 'member', x]); } };
  arrOf(m && m.nodes).forEach(n => put(n, 'node')); arrOf(m && m.edges).forEach(e => put(e, 'edge'));
  arrOf(m && m.views).forEach(v => { if (isRec(v)) { [...arrOf(v.nodes), ...arrOf(TYPED.edit && v.fragments)].forEach(n => put(n, 'node')); arrOf(v.edges).forEach(e => put(e, 'edge')); } });
  return at;
}

/* the element a validate() problem's path names last ('nodes[2].members[0].type': that member), or null */
function elementAt(m, path) {
  let o = m, id = null;
  for (const [, k, i] of String(path).matchAll(/(\w+)(?:\[(\d+)\])?/g)) {
    o = isRec(o) ? o[k] : undefined; if (i != null) o = Array.isArray(o) ? o[+i] : undefined;
    if (i != null && ['nodes', 'edges', 'members'].includes(k) && isRec(o) && typeof o.id === 'string') id = o.id;
  }
  return id;
}

/* api: what render() lends: root, stage, can, say, status, emit(commands), view(), model() (the host's), geo(), svg(),
   cam(), sel(), picked(), selectId(id), drawn(id), nearest(node, key), nameOf(id), editor(box, text, done), rename(), focus(), touch() */
function typedEditor(api) {
  const { root, can, say } = api;
  let link = null, menu = null, panel = null, orphans = false, last = {};
  const model = () => api.model() || {};
  const view = () => arrOf(model().views).find(v => isRec(v) && v.id === api.view()) || null;
  const on = () => { const v = view(); return model().schemaVersion === 2 && !!v && v.diagram != null && v.diagram !== 'map'; };
  const def = () => diagramOf(view()) || {};
  const entries = k => arrOf(def()[k]).filter(t => isRec(t) && typeof t.type === 'string');
  const nodeTypes = () => entries('elements').length ? entries('elements') : [GENERIC_NODE];
  const lineTypes = () => entries('lines').length ? entries('lines') : [GENERIC_LINE];
  const emit = commands => { if (commands.length) api.emit(commands); return true; };
  const newId = base => { // the base and the first number free in the model: 'class1', 'line2'
    const used = new Set(); usedIds(model(), used);
    const b = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'el'; let k = 1; while (used.has(b + k)) k++; return b + k; };
  const typeOf = x => typeof x.type === 'string' && x.type ? x.type : null; // a model may hold anything in type
  const typed = (t, base) => { const ty = typeOf(t); return { id: newId(ty ? ty.split('.').pop() : base), ...(ty ? { type: ty } : {}) }; };
  const idsOf = r => !r ? [] : r.type === 'node' || r.type === 'container' && elementsOf(model()).has(r.id) ? [r.id] : r.type === 'edge' ? arrOf(r.ids).filter(x => !String(x).includes('->')) : []; // not a positional line id
  const selId = (at = elementsOf(model())) => { const id = idsOf(api.sel())[0]; return id && at.has(id) ? id : null; };
  const top = (id, at = elementsOf(model())) => { let e = at.get(id); while (e && e.owner) e = at.get(e.owner.id); return e ? e.x.id : id; }; // a member: its node

  /* the gestures */
  const label = (ref, value) => { const at = elementsOf(model()), id = idsOf(ref).find(x => at.has(x)); if (id && can('rename')) emit([{ op: 'set', id, path: 'label', value }]); };
  const pin = (id, c, r) => can('move') && (def().layout || {}).pins !== false && Number.isFinite(c) && Number.isFinite(r) && c >= 0 && r >= 0 && emit([{ op: 'set', view: api.view(), path: ['layout', id], value: [c, r] }]);
  // a drop (notes/stage-2.md §8): in the box it is drawn in, its pin; into another box, or out of every box, a new owner (the
  // box's, else the view's subject or none), in one transaction. The view is then laid out again (§3.2), so a slot read off the
  // picture before would land elsewhere and stretch a box over cards it does not hold: no pin, and a pin it had is removed.
  // into, from: the box under the drop, the box it was in; a box that is no element (a frame) is the view's subject
  // a re-own, by a drop or the Owner field: reparent, and the removal of a pin it had
  const reown = (id, parent) => { const L = view().layout; return [{ op: 'reparent', id, parent }, ...(isRec(L) && Object.hasOwn(L, id) ? [{ op: 'set', view: api.view(), path: ['layout', id], value: undefined }] : [])]; };
  // a model element never goes into a box one view alone holds (registry.js ownGuard, audit 23): said, nothing emitted
  // a drop that gives no new owner is a pin: in the box it was in, and a member's anywhere, which keeps its owner (a part dropped
  // in or out of its frame, the view's subject: apply() refuses a reparent of a member, audit 34)
  const stays = (id, into, from) => { if (into === from) return true; const e = elementsOf(model()).get(id); return !!e && e.kind === 'member'; };
  const drop = (n, hint, into = null, from = null) => { if (stays(n.id, into, from)) return (hint.col !== n.col || hint.row !== n.row) && pin(n.id, hint.col, hint.row);
    // the new owner first, then the rule on it: out of every box, the view's subject may be one this view alone holds (audit 24)
    const to = elementsOf(model()).has(into) ? into : view().subject ?? null;
    const H = heldBy(model()), b = H.get(to); if (b && !H.has(n.id)) { api.status(`${elName(b)} lives in this view only: an element of the model cannot go under it`); return false; }
    return can('move') && emit(reown(n.id, to)); };
  const picks = () => [...new Set(api.picked().flatMap(idsOf))];
  function remove(fromModel, ids = picks()) { // Delete: out of this view; Shift + Delete: out of the model (risks.md E5). One transaction for the selection (E2)
    if (!can('delete') || !ids.length) return false;
    if (fromModel) return emit(ids.map(id => ({ op: 'delete', id })));
    // what this view holds as its own, and their members at any depth (a port of its own component: audit 24)
    const v = view(), at = elementsOf(model()), own = new Set(), out = [], put = x0 => { for (const s = [x0], seen = new Set(); s.length;) { const x = s.pop(); if (!isRec(x) || typeof x.id !== 'string' || seen.has(x)) continue; seen.add(x); own.add(x.id); for (const y of arrOf(x.members)) s.push(y); } };
    [...arrOf(v.nodes), ...arrOf(v.edges), ...arrOf(TYPED.edit && v.fragments)].forEach(put);
    const holds = id => { for (let s = at.get(v.subject); s; s = s.owner && at.get(s.owner.id)) if (s.x.id === id) return true; return false; }; // the subject, or a member path to it (apply() refuses its hide)
    ids.forEach(id => { const e = at.get(id);
      if (own.has(id)) out.push({ op: 'delete', id }); // lives in this view only: hiding it is deleting it
      else if (e && e.kind === 'edge' && !Array.isArray(v.edges)) api.status('This view shows every line between its cards: Shift + Delete deletes the line');
      else if (holds(id)) api.status(`This box ${id === v.subject ? 'is' : 'holds'} the view's subject: change the view's subject, or Shift + Delete deletes it`); // audit 17
      else out.push({ op: 'hide', id, view: v.id }); });
    return emit(out);
  }
  function addNode(i) {
    const t = nodeTypes()[i], cam = api.cam(); if (!t || !can('add') || !cam) return;
    api.editor({ x: cam.s.cx - 80, y: cam.s.cy - 13, w: 160, h: 26 }, '', value => emit([{ op: 'add', element: { ...typed(t, 'node'), label: value }, view: api.view() }]));
  }
  const hook = k => { const E = def().edits; return isRec(E) && typeof E[k] === 'function' ? E[k] : null; }; // registry.js edits
  const addLine = (from, to, t, at) => { const c = hook('connect'), dflt = () => emit([{ op: 'add', element: { ...typed(t, 'line'), from, to, ...(isRec(t.props) ? { props: copyOf(t.props) } : {}) }, view: api.view() }]); // at: a slot (src/typed/edit.js)
    return c ? (I.ran || (r => emit(arrOf(r))))(c(model(), view(), from, to, at, t), dflt) : dflt(); }; // I.ran: src/typed/edit.js's null and { error }
  function connect(from, to, ev, at = null) { // the relationship picker, when the type has more than one kind of line
    if (!can('add') || !from || !to || from === to && !I.self) return;
    const types = lineTypes();
    if (types.length === 1) addLine(from, to, types[0], at); else picker(to, types, t => addLine(from, to, t, at));
  }
  function closeMenu(back) { const m = menu; if (!m) return false; menu = null; m.remove(); if (back) api.focus(); api.touch(); return true; }
  function picker(at, types, done) {
    closeMenu(false);
    const n = api.geo().byId[at], cam = api.cam(); if (!n || !cam) return;
    const [W, H] = cam.size(), k = cam.s.k, m = document.createElement('div');
    m.className = 'um-edit um-pick'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Kind of line');
    m.innerHTML = types.map((t, i) => `<button role="menuitem" data-i="${i}">${esc(t.label || t.type)}</button>`).join('');
    Object.assign(m.style, { left: Math.round((n.x + n.w / 2 - cam.s.cx) * k + W / 2) + 'px', top: Math.round((n.y + n.h - cam.s.cy) * k + H / 2 + 4) + 'px' });
    api.stage.appendChild(m); menu = m; api.touch();
    const items = [...m.querySelectorAll('button')];
    m.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button'); if (!b) return; closeMenu(true); done(types[+b.dataset.i]); });
    m.addEventListener('keydown', e => { e.stopPropagation(); const i = items.indexOf(root.activeElement), K = e.key;
      if (K === 'ArrowDown' || K === 'ArrowUp') { e.preventDefault(); items[(i + (K === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      else if (K === 'Enter' && i >= 0) { e.preventDefault(); items[i].click(); }
      else if (K === 'Escape') { e.preventDefault(); closeMenu(true); } });
    m.addEventListener('focusout', e => { if (!m.contains(e.relatedTarget)) closeMenu(false); });
    m.addEventListener('pointerdown', e => e.stopPropagation());
    items[0].focus();
  }

  /* keyboard connect: L on a selected card, then arrows or a name typed to pick the other end, Enter to choose */
  function mark() {
    const svg = api.svg(); if (!svg) return;
    svg.querySelectorAll('.node.um-target').forEach(g => g.classList.remove('um-target')); svg.querySelectorAll('.um-klink').forEach(p => p.remove());
    if (!link || !link.to) return;
    const g = [...svg.querySelectorAll('.node')].find(x => x.dataset.id === link.to), a = api.geo().byId[link.from], b = api.geo().byId[link.to];
    if (g) g.classList.add('um-target');
    if (a && b) svg.insertAdjacentHTML('beforeend', `<path class="um-edit um-link um-klink" d="M ${a.x + a.w} ${a.y + a.h / 2} L ${b.x + b.w / 2} ${b.y + b.h / 2}"/>`);
    say(`Line from ${api.nameOf(link.from)} to ${api.nameOf(link.to)}: Enter to choose`);
  }
  const endLink = () => { const was = !!link; link = null; mark(); if (was) api.touch(); return was; };
  function linkKey(e) {
    const K = e.key;
    if (K === 'Escape') { endLink(); say('No line added'); return true; }
    if (K === 'Enter') { const { from, to } = link; if (!to || to === from && !I.self) { say('Pick another card first'); return true; } endLink(); I.connect(from, to); return true; }
    if (K.startsWith('Arrow')) { const g = api.geo(), at = link.to || link.from, n = Object.hasOwn(g.byId, at) && api.nearest(g.byId[at], K); if (n) { link.to = n.id; mark(); } return true; }
    if (K.length === 1 && !e.altKey) { const now = performance.now(); link.find = (now - link.t < 900 ? link.find : '') + K.toLowerCase(); link.t = now;
      const ns = api.geo().nodes.filter(n => String(api.nameOf(n.id)).toLowerCase().startsWith(link.find)), hit = ns.find(n => n.id !== link.from) || I.self && ns[0];
      if (hit) { link.to = hit.id; mark(); } return true; }
    return false;
  }
  function key(e) { // a key on the canvas of a typed view: true when it was an edit
    if (link) return linkKey(e);
    const K = e.key, s = api.sel();
    if (e.altKey) { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[K], n = s && s.type === 'node' && api.geo().byId[s.id];
      if (!d || !n) return false; if (!Number.isFinite(n.col)) return true; if (api.geo().down) d.reverse();
      // a cell another card is pinned to is stepped over (audit 58: Alt + Left onto it drew the two cards one over the other)
      // and so is the cell the card's own pin names when the card is drawn elsewhere: the layout settled that pin back (a box over
      // another there), and writing it again changed nothing, so the card could not be stepped past it by keyboard (audit 62)
      const L = (view() || {}).layout, onPin = (c, r) => isRec(L) && Object.entries(L).some(([k, p]) => k !== n.id && Array.isArray(p) && p[0] === c && Math.abs(p[1] - r) < 1);
      const own = isRec(L) && Object.hasOwn(L, n.id) && Array.isArray(L[n.id]) ? L[n.id] : null, mine = (c, r) => !!own && own[0] === c && Math.abs(own[1] - r) < 1;
      let c = n.col + d[0], r = n.row + d[1]; for (let k = 0; (onPin(c, r) || mine(c, r)) && k < 64; k++) { c += d[0]; r += d[1]; }
      pin(n.id, c, r); return true; }
    if (K === 'F2' && s && can('rename')) { api.rename(); return true; }
    if ((K === 'n' || K === 'N') && can('add')) { I.addNode(0); return true; }
    const from = s && (s.type === 'node' ? s.id : s.type === 'edge' && hook('connect') && (api.geo().edges.find(x => idsOf(s).includes(x._id)) || {}).to);
    if ((K === 'l' || K === 'L') && can('add') && from) {
      // a line's far end may be a box (a package, a component, a node box): no card the arrows can move from (audit 37)
      if (!Object.hasOwn(api.geo().byId, from)) { say('Pick a card to start the line from'); return true; }
      link = { from, to: null, find: '', t: 0 }; api.touch();
      say(`Line from ${api.nameOf(from)}: arrows or type a name, Enter to choose, Escape to stop`); return true; }
    if (K === 'Delete' && s) { I.remove(e.shiftKey); return true; }
    return false;
  }

  /* the panels: palette, properties, problems, and the outline of elements (risks.md M5) */
  function put(sel, html) { // a section drawn again only when it changed; the field that had the focus keeps it, and its text (E1)
    if (last[sel] === html) return; last[sel] = html;
    const el = panel.querySelector(sel); el.hidden = !html; // a palette with nothing to add is not there
    const a = root.activeElement, f = a && el.contains(a) ? a.dataset.f : null, text = f && a.type !== 'checkbox' ? a.value : null;
    el.innerHTML = html;
    const b = f && [...el.querySelectorAll('[data-f]')].find(x => x.dataset.f === f);
    if (b) { if (text != null && (b.tagName === 'INPUT' || b.tagName === 'TEXTAREA')) b.value = text; b.focus(); }
  }
  const nameOf = x => String(labelOr(x.label, x.from != null ? `${x.from} → ${x.to}` : x.id));
  function palette() { // with `add` only
    if (!can('add')) return '';
    return '<h3>Add</h3><div class="um-row">' + nodeTypes().map((t, i) => `<button data-f="add:${i}" data-add="${i}"${i ? '' : ' title="N"'}>${esc(t.label || t.type)}</button>`).join('') + '</div>'
      + `<p class="um-note">Lines: ${lineTypes().map(t => esc(t.label || t.type)).join(', ')}. Drag a card's handle, or L</p>`;
  }
  function props() {
    const at = elementsOf(model()), id = selId(at), e = id && at.get(id);
    if (!e) return '<h3>Properties</h3><p class="um-note">Select a card or a line</p>';
    // the fields and owners of the kind the view draws it as: an element of no type a class view draws as a class has a class's (audit 30)
    const x = e.x, k = e.kind === 'node' ? drawnKind(def(), x) : x.type, P = isRec(x.props) ? x.props : {}, F = a => arrOf(a).filter(f => isRec(f) && typeof f.key === 'string'), own = F(isRec(def().props) && typeof k === 'string' && Object.hasOwn(def().props, k) ? def().props[k] : null), schema = [...own, ...F(TYPED.fields && TYPED.fields(model(), x))];
    const off = can('rename') ? '' : ' disabled'; // the editable flags: a field the host does not offer is shown, to read
    // a value of more than one line in a <textarea>, which keeps its breaks (an <input> drops them, and Enter then wrote the
    // lines joined, audit 20); the newline after its tag is the one the parser drops, so a value's own first one stays
    const text = (f, v, name, more = '') => /[\r\n]/.test(v) ? `<label>${esc(name)}<textarea data-f="${esc(f)}" data-was="${esc(v)}" rows="${String(v).split(/\r\n|\r|\n/).length}"${more}${off}>\n${esc(v)}</textarea></label>`
      : `<label>${esc(name)}<input data-f="${esc(f)}" data-was="${esc(v)}" value="${esc(v)}"${more}${off}></label>`;
    // no Name field for an element whose name nothing draws nor says (the type's unnamed): it wrote a label that changed nothing (audit 21)
    let h = `<h3>Properties${x.type != null ? ': ' + esc(x.type) : ''}</h3>` + (arrOf(def().unnamed).includes(x.type) ? '' : text('label', x.label ?? '', 'Name'));
    schema.forEach(f => { const v = Array.isArray(f.path) ? f.path.reduce((o, k) => isRec(o) ? o[k] : undefined, P) : P[f.key], name = f.label || f.key; // path: a field inside props (ends.from.role)
      const key = ` data-key="${esc(f.key)}"${Array.isArray(f.path) ? ` data-path="${esc(JSON.stringify(f.path))}"` : ''}`;
      if (f.kind === 'bool') h += `<label class="um-check"><input type="checkbox" data-f="p:${esc(f.key)}"${key}${v ? ' checked' : ''}${off}>${esc(name)}</label>`;
      else if (f.kind === 'enum') h += `<label>${esc(name)}<select data-f="p:${esc(f.key)}"${key}${off}>${['', ...arrOf(f.options)].map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
      else h += text('p:' + f.key, f.kind === 'list' ? arrOf(v).join(', ') : v ?? '', name, key + (f.kind === 'list' ? ' data-list' : '')); });
    // the Owner field (notes/stage-2.md §8): the owners the type offers, less the element and what it holds, and none
    const O = def().owners, os = e.kind !== 'member' && typeof O === 'function' ? O(model(), k === x.type ? x : { ...x, type: k }, view()) : null, under = id => { for (let k = 0, p = id; p != null && k < 64; k++, p = (at.get(p) || { x: {} }).x.parent) if (p === x.id) return true; return false; };
    // its owner is offered too when the type does not offer it (a class in a class), so the field says it and "none" is a change
    const offer = Array.isArray(os) && [{ id: '', label: 'none' }, ...os.filter(o => isRec(o) && o.id != null && !under(o.id))];
    if (offer && x.parent != null && !offer.some(o => o.id === x.parent)) offer.push({ id: x.parent, label: (at.get(x.parent) || { x: {} }).x.label });
    if (offer) h += `<label>Owner<select data-f="owner" data-owner${can('move') ? '' : ' disabled'}>${offer.map(o => `<option value="${esc(o.id)}"${o.id === (x.parent ?? '') ? ' selected' : ''}>${esc(elName(o))}</option>`).join('')}</select></label>`;
    const rest = own.length ? [] : Object.entries(P); // no schema: what it holds, to read
    if (rest.length) h += '<dl>' + rest.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'string' ? v : jsonText(v))}</dd>`).join('') + '</dl>';
    const M = def().member;
    if (e.kind === 'node' && !(M && M.holds && !M.holds(x))) { // a comment holds none
      const ms = arrOf(x.members).filter(m => isRec(m) && typeof m.id === 'string'), line = m => M ? M.print(m) : m.label ?? ''; // a type's member text: "+ total: Money [1]" (1.9)
      h += '<h3>Members</h3><ul>' + ms.map((m, i) => `<li><input data-f="m:${esc(m.id)}" data-m="${esc(m.id)}" data-was="${esc(line(m))}" value="${esc(line(m))}" aria-label="Member ${i + 1} of ${ms.length}${can('reorder') ? ', Alt + arrows to move it' : ''}"${off}>`
        + (can('reorder') ? `<button data-f="up:${esc(m.id)}" data-up="${esc(m.id)}" aria-label="Move ${esc(nameOf(m))} up">↑</button><button data-f="down:${esc(m.id)}" data-down="${esc(m.id)}" aria-label="Move ${esc(nameOf(m))} down">↓</button>` : '')
          + (can('delete') ? `<button data-f="mx:${esc(m.id)}" data-del="${esc(m.id)}" aria-label="Delete ${esc(nameOf(m))} from the model">✕</button>` : '') + '</li>').join('') // a member is not hidden: deleted, through the type's remove (audit 18)
        + '</ul>' + (can('add') ? '<input data-f="new" data-new placeholder="New member, Enter adds it" aria-label="New member">' : '');
    }
    return h + (can('delete') ? '<div class="um-row"><button data-f="hide" data-hide title="Delete">Remove from view</button><button data-f="kill" data-kill title="Shift + Delete">Delete from model</button></div>' : '');
  }
  function problems() {
    const m = model(), vi = arrOf(m.views).indexOf(view()), at = elementsOf(m), drawn = id => api.drawn(top(id, at)); // one index for every problem; validate() itself is about 1 ms on 1000 nodes
    let list = []; try { list = validate(m); } catch (_) { /* a model validate() cannot read: no list */ }
    const mine = list.map(p => ({ ...p, id: elementAt(m, p.path) })).filter(p => p.id ? at.has(p.id) && drawn(p.id) : String(p.path).startsWith(`views[${vi}]`));
    return `<h3>Problems (${mine.length})</h3>` + (mine.length ? '<ul>' + mine.map((p, i) => `<li><button class="um-${p.level === 'error' ? 'err' : 'warn'}" data-f="pr:${i}" data-go="${esc(p.id || '')}">${esc(p.level)}: ${esc(p.message)}</button></li>`).join('') + '</ul>' : '<p class="um-note">None</p>');
  }
  function outline() {
    const m = model(), v = view(), views = arrOf(m.views).filter(isRec);
    // own: the view an element of one view only lives in (a card or a line of its own), which shows it there alone
    const shows = (w, x, line, own) => own ? w === own : line ? (Array.isArray(w.edges) ? w.edges.includes(x.id) : arrOf(w.nodeIds).includes(x.from) && arrOf(w.nodeIds).includes(x.to)) : arrOf(w.nodeIds).includes(x.id);
    const rows = [...arrOf(m.nodes).map(x => [x, false, null]), ...arrOf(m.edges).map(x => [x, true, null]),
      ...views.flatMap(w => [...arrOf(w.nodes).map(x => [x, false, w]), ...arrOf(w.edges).map(x => [x, true, w])])]
      .filter(([x, line, own]) => isRec(x) && typeof x.id === 'string' && (!orphans || !views.some(w => shows(w, x, line, own))));
    return `<h3>Elements</h3><label class="um-check"><input type="checkbox" data-f="orphans" data-orphans${orphans ? ' checked' : ''}>In no diagram</label><ul>` + rows.map(([x, line, own]) => { const n = esc(nameOf(x)), id = esc(x.id), ty = typeOf(x);
      return `<li><button data-f="go:${id}" data-go="${id}">${n}${ty ? ` <small>${esc(ty.split('.').pop())}</small>` : ''}${own ? ` <small>only in ${esc(labelOr(own.title, own.id))}</small>` : ''}</button>`
        + (can('add') && !own && !shows(v, x, line) && (!line || Array.isArray(v.edges)) ? `<button data-f="show:${id}" data-show="${id}" aria-label="Show ${n} in this view">Show</button>` : '')
        + (can('delete') ? `<button data-f="x:${id}" data-del="${id}" aria-label="Delete ${n} from the model">✕</button>` : '') + '</li>'; }).join('') + '</ul>';
  }
  function refresh() { if (!panel || !on()) return; put('.um-pal', palette()); put('.um-props', props()); put('.um-probs', problems()); put('.um-els', outline()); }

  function commit(t) { // a field of the properties panel: one transaction
    const d = t.dataset, at = elementsOf(model()), id = selId(at);
    const M = def().member, bad = why => { t.setAttribute('aria-invalid', 'true'); api.status(why); }; // a line the type cannot read: kept as written, nothing applied (E3)
    if (d.new != null) { const value = t.value.trim(), x = id && at.get(id); if (!value || !x || !can('add')) return;
      const r = M && M.add(value, x.x); if (r && r.error) return bad(r.error);
      const prev = arrOf(x.x.members).filter(isRec).pop(); t.value = ''; t.removeAttribute('aria-invalid');
      return emit([{ op: 'add', element: r ? { ...typed(r, 'member'), label: r.label, ...(Object.keys(r.props).length ? { props: r.props } : {}) } : { ...typed(prev || {}, 'member'), label: value }, owner: id }]); }
    if (d.owner != null) { const p = t.value || null; return id && can('move') && p !== (at.get(id).x.parent ?? null) && I.owner(id, p); }
    if (!can('rename') || (!id && d.m == null)) return;
    let value = t.type === 'checkbox' ? t.checked : t.value.trim();
    if (t.type !== 'checkbox') { if (t.value === d.was) return;
      if (value === '' && d.key == null) { t.value = d.was; return; } // an empty name does nothing, as on the map; an empty property is removed
      // a member row: given its owner, so a name another member holds is refused (audit 40)
      if (d.m != null && M) { const e = at.get(d.m) || {}, m = e.x, r = m && M.edit(m, value, e.owner); if (!r || r.error) return bad(r ? r.error : 'not a member');
        t.removeAttribute('aria-invalid'); d.was = t.value; return emit(r.commands); }
      if (value === '') value = undefined; else if (d.list != null) value = value.split(',').map(x => x.trim()).filter(Boolean)
        // a stereotype typed as the card draws it, «entity» or <<entity>>: its name, without the marks (audit 47)
        .map(x => (d.key === 'stereotypes' ? x.replace(/^«(.*)»$/s, '$1').replace(/^<<(.*)>>$/s, '$1').trim() || x : x)); }
    const path = d.path ? ['props', ...JSON.parse(d.path)] : d.key == null ? 'label' : d.key.includes('.') ? ['props', d.key] : 'props.' + d.key;
    const set = () => emit([{ op: 'set', id: d.m ?? id, path, value }]);
    // the type's edits.field first (src/typed/edit.js); one it refuses marks the field, kept as typed, as a member row's (audit 37)
    const ok = I.field ? I.field(d.m ?? id, path, value, set) : set();
    if (t.type !== 'checkbox') { if (ok === false) t.setAttribute('aria-invalid', 'true'); else { t.removeAttribute('aria-invalid'); d.was = t.value; } }
    return ok;
  }
  function moveMember(id, by) {
    const e = elementsOf(model()).get(id); if (!e || !e.owner || !can('reorder')) return;
    const i = e.owner.members.indexOf(e.x) + by; if (i >= 0 && i < e.owner.members.length) emit([{ op: 'move', id, index: i }]);
  }
  function show(id) {
    const v = view(), x = elementsOf(model()).get(id); if (!x || !can('add')) return;
    emit([x.kind === 'edge' ? { op: 'set', view: v.id, path: 'edges', value: [...arrOf(v.edges), id] } : { op: 'set', view: v.id, path: 'nodeIds', value: [...arrOf(v.nodeIds), id] }]);
  }
  function build() {
    panel = document.createElement('aside');
    panel.className = 'um-editor'; panel.setAttribute('aria-label', 'Edit this diagram');
    panel.innerHTML = '<section class="um-pal" aria-label="Palette"></section><section class="um-props" aria-label="Properties"></section><section class="um-probs" aria-label="Problems"></section><section class="um-els" aria-label="Elements"></section>';
    panel.addEventListener('click', e => { const b = e.target.closest('button, [data-orphans]'); if (!b) return; const d = b.dataset;
      if (d.add != null) I.addNode(+d.add);
      else if (d.go != null) { if (!d.go || !api.selectId(top(d.go))) api.status('Not drawn in this view'); }
      else if (d.show != null) show(d.show);
      else if (d.del != null) I.remove(true, [d.del]);
      else if (d.up != null || d.down != null) moveMember(d.up ?? d.down, d.up != null ? -1 : 1);
      else if (d.hide != null || d.kill != null) I.remove(d.kill != null);
      else if (d.orphans != null) { orphans = b.checked; put('.um-els', outline()); } });
    panel.addEventListener('change', e => { if (e.target.dataset.orphans == null) commit(e.target); });
    panel.addEventListener('keydown', e => { e.stopPropagation(); const t = e.target, K = e.key; // the panel's keys stay in it
      if (K === 'Escape') { if ((t.tagName === 'INPUT' && t.type !== 'checkbox') || t.tagName === 'TEXTAREA') { t.value = t.dataset.was ?? ''; t.removeAttribute('aria-invalid'); } api.focus(); } // what was typed is not kept
      else if (K === 'Enter' && t.tagName === 'BUTTON') { e.preventDefault(); t.click(); }
      else if (K === 'Enter' && ((t.tagName === 'INPUT' && t.type !== 'checkbox') || (t.tagName === 'TEXTAREA' && !e.shiftKey))) { e.preventDefault(); commit(t); } // Shift + Enter breaks a line
      else if (e.altKey && t.dataset.m != null && (K === 'ArrowUp' || K === 'ArrowDown')) { e.preventDefault(); moveMember(t.dataset.m, K === 'ArrowUp' ? -1 : 1); } });
    root.appendChild(panel);
  }
  function mount() { // a new picture: a line being picked stops; the panels come with a typed view only
    link = null; closeMenu(false);
    if (!on()) { if (panel) { panel.remove(); panel = null; last = {}; } return; }
    if (!panel) build();
    refresh();
  }

  const I = { on, key, label, drop, connect, mount, refresh, addNode, remove,
    owner: (id, parent) => emit(reown(id, parent)), // the Owner field's choice (src/typed/edit.js asks the type's owner hook first)
    paint: () => { if (panel && on()) put('.um-props', props()); },
    add: () => I.addNode(0),
    cancel: () => { const a = endLink(), b = closeMenu(false); return a || b; },
    linking: () => !!link || !!menu,
    width: () => panel ? panel.offsetWidth + 8 : 0 };
  if (TYPED.edit) TYPED.edit(I, { api, model, view, def, hook, emit, typed, nodeTypes, picker, picks, stays });
  return I;
}
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// the reader's setting; a handle drawn instant (the page's #check, #still and #shot hooks) is still on top of it, on its own
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let SHEET = null;
const sheet = () => { if (!SHEET) { SHEET = new CSSStyleSheet(); SHEET.replaceSync(STYLES); } return SHEET; };
const INNER = Symbol('umlimator.inner'); // what mountPage needs from render() beyond the public handle

/* render(container, model, options) -> handle: the canvas for one view at a time, with drill-down. */
/* an SVG file drawn onto a canvas: a PNG Blob, or null when there is nothing to draw */
async function pngOf(file) {
  if (!file) return null;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(file); await img.decode();
  const size = k => Math.ceil(+(file.match(new RegExp('^<svg[^>]*?\\s' + k + '="([\\d.]+)"')) || [])[1] || 0); // the file's own size, not the rounded one
  const c = document.createElement('canvas'); c.width = size('width') || img.naturalWidth; c.height = size('height') || img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

export function render(container, model, options = {}) {
  const P = options._page || {}; // the standalone page's hooks: status line, overlay insets, still and reader drawing
  const instant = !!P.instant, still = () => instant || reducedMotion(); // this map's motion: an instant page stills only itself
  const ctrlWheel = options.wheel === 'ctrl'; // the wheel zooms only with Ctrl or ⌘ (a trackpad's pinch too), and else scrolls the page: a map in a document
  const OPS = ['add', 'rename', 'move', 'delete', 'reorder'], ed = options.editable;
  const E = ed === true ? Object.fromEntries(OPS.map(o => [o, true])) : ed && typeof ed === 'object' ? Object.fromEntries(OPS.map(o => [o, !!ed[o]])) : null;
  const can = op => !!(E && E[op]);
  const host = document.createElement('div');
  host.className = 'umlimator'; host.style.cssText = 'display:block;position:relative;width:100%;height:100%;min-height:0';
  container.appendChild(host);
  // text is measured in the host's font (--um-sans); measure: false keeps the font-independent estimate
  const own = typeof options.measure === 'function' ? options.measure : null;
  let measure = options.measure === false ? null : own || hostMeasure(host), current = model;
  const O = o => Object.assign(Object.create(null), o); // by-id maps with no prototype: a card or view named toString or __proto__ is a key like any other (M3, audit 8)
  const expanded = O(); // per view: the cards unfolded in place (#71), in the order they unfolded; in this handle only, never in the model
  const asked = O(); // per view: card id -> the inner view it waits for, when E or Alt + click asked to unfold it before the host loaded that view
  let ctx = mapContext(model, { measure, kinds: !!P.kinds, expand: expanded }); // kinds: the standalone page guesses line kinds from label words, for its legend
  const root = host.attachShadow({ mode: 'open', delegatesFocus: true }); // host.focus() lands in the map (on the selected card)
  root.adoptedStyleSheets = [sheet()];
  // the standalone page's pieces a host asks for (#99), in a frame around the canvas: the views list left of the map (after
  // it in the tab order, so focus given to the element still lands on the map), the details panel under it, the legend and
  // the hint line over it. With none of them the map is drawn as it always was.
  const framed = ['nav', 'details', 'legend', 'hints'].some(k => options[k]);
  root.innerHTML = `<div class="um-live" role="status" aria-live="polite"></div>${framed ? '<div class="um-frame"><div class="um-main"><div class="um-stage">' : ''}<div class="stage" tabindex="-1">
      <div class="mctl">${options.minimap ? '<div class="minimap" title="Overview — click or drag to move"></div>' : ''}${options.controls === false ? '' : `
        <div class="ctl">
          <button data-z="up" title="Up one level (Esc)" aria-label="Up one level">↑</button><span class="sep"></span>
          <button data-z="out" title="Zoom out (−)" aria-label="Zoom out">−</button><button data-z="fit" class="pct" title="Fit to screen (0)">100%</button><button data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button><span class="sep"></span>
          <button data-z="one" title="Actual size (1)">1:1</button><button data-z="flow" title="Animate flow direction (F)" aria-label="Animate flow">≋</button>${E && E.add ? '<span class="sep"></span><button data-z="add" title="Add a card (N, or Alt + double-click)" aria-label="Add a card">＋</button>' : ''}<span class="depth" title="Reading depth follows zoom">READ</span>
        </div>`}</div></div>${!framed ? '' : (options.legend ? '<div class="m-legend"></div>' : '') + (options.hints ? `<div class="hint">${hintHTML('', ctrlWheel)}</div>` : '') + '</div>'
          + (options.details ? '<aside class="panel" aria-label="Node details" hidden></aside>' : '') + '</div>'
          + (options.nav ? '<button class="ibtn um-navbtn" title="Views (O)" aria-label="Toggle the views list" aria-expanded="false">☰</button><aside class="outline" aria-label="Views"></aside>' : '') + '</div>'}`;
  const stage = root.querySelector('.stage'), q = s => root.querySelector(s);
  const tell = q('.hint') && hinter(q('.hint'), hintHTML('', ctrlWheel)); // the hint line says what just happened, for a while
  const subs = {};
  // each listener on its own: an error in one is reported, and the map's own transition goes on (a host's bug never wedges it)
  const fail = err => { if (typeof reportError === 'function') reportError(err); else console.error(err); };
  const emit = (type, e, last = false) => { if (dead && !last) return; [(options.on || {})[type], ...(subs[type] || [])].forEach(fn => { if (typeof fn !== 'function') return; try { fn(e); } catch (err) { fail(err); } }); if (type !== 'state') touch(); };
  /* the map's state for hosts and agents (0.14.0): handle.state is a fresh, frozen, JSON-serializable snapshot, and the state
     event says which of its keys changed, once a frame at most (on a 16 ms timer, so a page in a hidden tab still says it).
     The camera is the exception: a pan, zoom, glide or drag is one state event, once it comes to rest; until then the
     event's camera is where it last rested (handle.state reads it live) */
  const KEYS = ['view', 'navigating', 'selection', 'expanded', 'lens', 'overlays', 'story', 'tour', 'replay', 'paused', 'camera', 'flow', 'motion', 'gesture', 'destroyed'];
  let lastState = null, stateT = 0, camRest = null, restT = 0; // the last state event's snapshot and the flush to come; the camera at rest, and its check to come
  const listensState = () => !!((options.on || {}).state || (subs.state || []).length);
  function touch() { if (!stateT && !dead && listensState()) stateT = setTimeout(flushState, 16); }
  function flushState(last = false) { clearTimeout(stateT); stateT = 0; if (!listensState() || (dead && !last)) return;
    const s = snapshot(true), changed = KEYS.filter(k => JSON.stringify(s[k]) !== JSON.stringify(lastState ? lastState[k] : undefined)); lastState = s;
    if (changed.length) emit('state', { state: s, changed }, last); }
  // at rest: 150 ms with no change, no glide, no press on the map and no move under way; a moving camera is looked at again
  function camMoved() { clearTimeout(restT); restT = !dead && listensState() ? setTimeout(rested, 150) : 0; }
  function rested() { restT = 0; if (dead) return; if (cam && (cam.anim || cam.ptrs.size) || nav) return camMoved(); camRest = camNow(); touch(); }
  let cam = null, geo = null, svg = null, cur = null, sel = null, more = [], busy = false, paused = false, dead = false;
  const pic = vid => ctx.geoCache[vid] ||= ctx.buildView(vid, { tour: P.tour !== false, openHint: P.openHint !== false }); // a view's picture: laid out once
  // each card's look, for what is drawn over the picture: rings, the minimap, a tour's or replay's dot
  const lookIn = g => { const m = new Map(), ports = sidePorts(g); return n => { if (!m.has(n)) m.set(n, g.map ? cardLook(n, true, !!(n.kids || n.opens) && P.openHint !== false, ports.get(n)) : cardLook(n, false, false, null)); return m.get(n); }; };
  const looker = () => lookIn(geo);
  const timers = new Set(), later = (f, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) f(); }, ms); timers.add(t); return t; };
  const sleeping = new Set(); // a sleep resolves on its own, or when the map is destroyed: nothing that awaits one is left pending
  const sleep = ms => new Promise(r => { if (dead) return r(); const wake = () => { sleeping.delete(wake); r(); }; sleeping.add(wake); later(wake, still() ? 0 : ms); });
  const status = t => P.status ? P.status(t) : tell && tell(t);
  const wide = P.wide || (() => (cam ? cam.size()[0] : stage.clientWidth) > 820);

  // the views the reader walked through, the one shown last: up goes back along them, then to the model's parent (issue 137)
  let trail = [];
  const upOf = () => (P.upTarget ? P.upTarget() : trail.length > 1 ? trail[trail.length - 2] : (ctx.V[cur] || {}).parent) || null;
  const boxHere = id => !Object.hasOwn(geo.byId, id) && (geo.families || []).some(f => f.id === id); // an element this view draws as a box
  const nodeRef = id => ({ type: 'node', id, view: cur });
  const idRef = id => boxHere(id) ? { type: 'container', id, view: cur } : nodeRef(id); // a card, or a box by its id: Find's, the details panel's and go({ select })'s way to one (audit 8)
  const copyRef = r => r && { ...r, ...(Array.isArray(r.ids) ? { ids: [...r.ids] } : {}) }; // a host gets copies: the map's Refs stay its own
  const picked = () => sel ? [...more, sel].map(copyRef) : []; // every selected thing, the latest last (more: the others' refs)
  const say = t => { const l = root.querySelector('.um-live'); if (l) l.textContent = t; };
  const nodeG = id => [...svg.querySelectorAll('.node')].find(x => x.dataset.id === id), ringOf = id => [...svg.querySelectorAll('.node-key')].find(x => x.dataset.node === id); // no CSS.escape: jsdom has none
  const nameOf = id => ctx.nodeIn(id, cur).label || ((geo.families || []).find(f => f.id === id) || {}).label || id;
  let said = '[]'; // the selection last reported: a select event means it changed, or a click asked again (again)
  const emitSel = (again = false) => {
    const now = JSON.stringify(picked()); if (now === said && !again) return; said = now;
    say(!sel ? 'Nothing selected' : (sel.type === 'node' ? (geo.byId[sel.id] || (geo.families || []).find(f => f.id === sel.id) || {}).aria || nameOf(sel.id) : sel.type === 'edge' ? (e => e ? e.aria || `Line from ${nameOf(e.from)} to ${nameOf(e.to)}` : 'Line')(geo.edges[edgeIndex(sel)])
      : `Box ${[...svg.querySelectorAll(`.family[data-family="${CSS.escape(sel.id)}"] .family-title`)].map(t => t.textContent).join(' ') || sel.id}`) + (more.length ? `, ${more.length + 1} ${picked().every(r => r.type === 'node') ? 'cards ' : ''}selected` : ', selected'));
    emit('select', { target: copyRef(sel), targets: picked() });
  };
  const edgeRef = e => ({ type: 'edge', ids: edgeRefIds(e), view: cur });
  const edgeIndex = ref => geo.edges.findIndex(e => { const ids = edgeRefIds(e); return ids.length === ref.ids.length && ids.every((x, i) => x === ref.ids[i]); });
  const exists = ref => !ref ? true : ref.type === 'node' ? !!geo.byId[ref.id] : ref.type === 'edge' ? edgeIndex(ref) >= 0
    : ref.type === 'container' ? (geo.families || []).some(f => f.id === ref.id) : false;

  // focus in the map goes back on the same card or line in a new picture, else on the canvas; focus outside the map stays there
  const focusOf = () => { const a = root.activeElement; if (!a || !(a === stage || (svg && svg.contains(a)) || a.closest('.empty-view'))) return null;
    const lk = a.closest('.line-key'), k = a.closest('[data-node]'), g = a.closest('.node');
    return lk && geo.edges[+lk.dataset.i] ? edgeRef(geo.edges[+lk.dataset.i]) : k ? nodeRef(k.dataset.node) : g ? nodeRef(g.dataset.id) : {}; };
  const refocus = ref => { if (!ref) return; if ((ref.type === 'node' || ref.type === 'edge') && exists(ref)) focusMap(ref, false); else stage.focus({ preventScroll: true }); };
  function mount(vid) { // vid: a view of the model, checked first (one it lacks changes nothing: false), or null for a model with no views
    const v = vid == null ? null : ctx.V[vid]; if (vid != null && !v) return false;
    const back = focusOf();
    cancelGesture(!!v && vid === cur); // a new picture: a drag or a line under way stops; a name field stays over its card if the view draws it still
    cur = v ? vid : null; if (v) ctx.planOf(vid);
    if (v) { trail = trail.filter(id => ctx.V[id]); if (!trail.includes(vid)) trail = [vid]; } // the first view, or after an update() took the walk's views away
    stage.querySelectorAll('svg.map-svg, .empty-view').forEach(s => s.remove());
    if (!v || !(v.nodeIds || []).some(i => ctx.N[i])) { // a view with nothing in it, or a model with no views, gets a friendly card, not a blank canvas
      geo = { nodes: [], edges: [], groups: [], lanes: [], families: [], byId: idTable(), stats: {}, bounds: { x: 0, y: 0, w: 400, h: 300 } };
      stage.insertAdjacentHTML('afterbegin', '<svg class="map-svg" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"></svg>');
      const p = v && v.parent;
      stage.insertAdjacentHTML('beforeend', `<div class="empty-view"><div class="ico">◌</div><h2>Nothing here yet</h2><p>${v ? 'This view has no nodes yet.' : 'This map has no views yet.'}</p>${p ? `<button class="btn" data-v="${esc(p)}">← Back to ${esc(String(labelOr(ctx.V[p].title, p)).split(' · ')[0])}</button>` : ''}</div>`);
    } else {
      const c = pic(vid);
      stage.insertAdjacentHTML('afterbegin', c.markup); geo = c.g;
    }
    svg = stage.querySelector('svg'); svg.classList.add('map-svg'); if (paused) svg.pauseAnimations();
    if (!cam) cam = new Camera(stage, svg, { wheel: ctrlWheel ? 'ctrl' : 'zoom', maxFit: 1.15, max: 4, mapDepth: 0.3, onChange: onCam, still, skip: e => !!((can('move') || can('reorder') || can('add')) && e.target.closest && e.target.closest('.node, .um-handle')), inset: () => clearOf([].concat(P.inset ? P.inset() : fitIn())) });
    cam.setSvg(svg, geo.bounds);
    const ub = q('[data-z="up"]'); if (ub) ub.disabled = !upOf();
    if (options.minimap) buildMini();
    if (v && !geo.hub && geo.nodes.length && !(expanded[vid] || []).length && geo.nodes.every(n => Number.isFinite(n.col) && Number.isFinite(n.row))) placed[vid] = O(Object.fromEntries(geo.nodes.map(n => [n.id, [n.col, n.row]]))); // unfolded: the places folded stay
    sel = null; more = []; sub = null; tabKeys(); paint(); // no select event here: the caller reports, once, what became of the selection
    endTrip(); relens(); drawMarks(); // a new picture: a tour or replay on the old one ends; the host's marks and the lens go on again (#63, #94)
    if (naming) { if (naming.ref && !exists(naming.ref)) naming.close(false); else naming.place(); }
    refocus(back);
    if (v && pc) pc.chrome();
    if (v && P.onMount) P.onMount(inner);
    if (tx) tx.mount(); // a typed view's panels (1.7)
    touch();
    return true;
  }
  // at fit the cards keep off the pieces over the map (#99): the views list's button, the hint line, and the legend, which
  // the map leaves room for above it or to its right, whichever leaves the map larger
  const lg = q('.m-legend'), fitIn = () => { const I = { t: q('.um-navbtn') ? 54 : 16, r: 16, b: tell ? 40 : 16, l: 16 + (tx ? tx.width() : 0) }; // a typed view's panels, left
    return lg && !lg.hidden ? [{ ...I, b: 48 + lg.offsetHeight }, { ...I, l: 24 + lg.offsetWidth }] : I; };

  /* at fit, the zoom controls and the minimap keep off the cards (#50): when a card would sit under one of them, the fit
     also tries room for them at the bottom and at the right, and keeps whichever leaves the map larger */
  let clear = null; // the last answer, for one view, size and set of insets: the camera asks on every frame of a pan or zoom
  function clearOf(base) {
    if (!cam || !geo) return base;
    const [W, H] = cam.size(), key = JSON.stringify([W, H, base]); if (clear && clear.geo === geo && clear.key === key) return clear.sets;
    const boxes = [...stage.querySelectorAll('.ctl, .minimap, .um-story, .um-lens')].map(x => x.getBoundingClientRect()).filter(r => r.width && r.height);
    let sets = base; // none shown, or no layout (a test DOM): as before
    if (boxes.length) {
      const S = stage.getBoundingClientRect(), top = Math.min(...boxes.map(r => r.top)) - S.top - 8, left = Math.min(...boxes.map(r => r.left)) - S.left - 8;
      const f = cam.fitState(0.94, base), at = (x, y) => [(x - f.cx) * f.k + W / 2 + S.left, (y - f.cy) * f.k + H / 2 + S.top];
      const covered = geo.nodes.some(n => { const [x0, y0] = at(n.x, n.y), [x1, y1] = at(n.x + n.w, n.y + n.h);
        return boxes.some(r => x0 < r.right + 8 && r.left - 8 < x1 && y0 < r.bottom + 8 && r.top - 8 < y1); });
      if (covered) sets = base.flatMap(I => [{ ...I, b: Math.max(I.b, H - top) }, { ...I, r: Math.max(I.r, W - left) }]);
    }
    clear = { geo, key, sets }; return sets;
  }
  function onCam(c) {
    camMoved(); // the state event says where the camera comes to rest, once
    if (naming) naming.place(); // a name field stays over what it names
    const pct = q('.pct'), depth = q('.depth');
    if (pct) pct.textContent = Math.round(c.s.k * 100) + '%';
    if (depth) depth.textContent = (stage.dataset.depth || 'read').toUpperCase();
    if (mini.vp) {
      const [W, H] = c.size(), k = c.s.k;
      mini.vp.setAttribute('x', c.s.cx - W / (2 * k)); mini.vp.setAttribute('y', c.s.cy - H / (2 * k));
      mini.vp.setAttribute('width', W / k); mini.vp.setAttribute('height', H / k);
      const b = geo.bounds; q('.minimap').classList.toggle('all', W / k >= b.w && H / k >= b.h);
    }
  }

  /* minimap */
  const mini = {};
  function buildMini() {
    const b = geo.bounds, el = q('.minimap'), bw = Math.max(2, b.w / 300);
    // a box's tone, as its region, dashed as in the picture
    const rg = (geo.families || []).filter(f => f.tone).map(f => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="14" style="--um-tone:${toneOf(f)}" fill="var(--um-tone, var(--um-slate))" fill-opacity=".14" stroke="var(--um-tone, var(--um-slate))" stroke-width="${bw}" stroke-dasharray="${bw * 4} ${bw * 3}"/>`).join('');
    const ln = (geo.lanes || []).map(l => `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="14" fill="none" stroke="var(--um-border-2)" stroke-width="${Math.max(2, b.w / 300)}"/>`).join('');
    const look = looker(), r = geo.nodes.map(n => { const L = look(n), paint = `fill="var(--um-${KIND[n.k][0]})" opacity="${n.k === 'm-public' ? .95 : .55}"`;
      return L ? `<path d="${L.S.out(L)}" ${paint}/>` : `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" ${paint}/>`; }).join('');
    const l = geo.edges.map(e => `<polyline points="${e.pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--um-arrow)" stroke-width="${Math.max(2, b.w / 260)}" opacity=".6"/>`).join('');
    el.innerHTML = `<svg viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet">${rg}${ln}${l}${r}<rect class="vp" rx="${b.w / 80}"/></svg>`;
    mini.svg = el.firstChild; mini.vp = el.querySelector('.vp');
    mini.vp.setAttribute('stroke-width', Math.max(2, b.w / 160));
    cam && onCam(cam);
  }
  if (options.minimap) {
    const el = q('.minimap'); let down = false;
    const go2 = (e, anim) => { const p = mini.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const w = p.matrixTransform(mini.svg.getScreenCTM().inverse()); cam.touched = true; anim ? cam.animate({ cx: w.x, cy: w.y }, 240) : cam.set({ cx: w.x, cy: w.y }); };
    el.addEventListener('pointerdown', e => { down = true; el.setPointerCapture(e.pointerId); go2(e, true); e.stopPropagation(); });
    el.addEventListener('pointermove', e => { if (down) go2(e, false); });
    el.addEventListener('pointerup', () => { down = false; });
  }

  /* a card's or box's tab, and a card's chip, is a button only for a host that listens for click (#43): it can act on one.
     A card's tabs and chips get focus targets right after the card, outside it (a button inside the card's button is
     invalid), tabs first; a box's tab is one itself. */
  const listening = () => !!((options.on || {}).click || (subs.click || []).length);
  let keysFor = null; // the picture and state the tabs were last set up for: a second listener changes nothing, focus stays
  function tabKeys() {
    const on = listening(); if (!svg || (keysFor && keysFor[0] === svg && keysFor[1] === on)) return; keysFor = [svg, on];
    svg.querySelectorAll('.tab-key, .chip-key').forEach(k => k.remove());
    const cards = Object.fromEntries([...svg.querySelectorAll('.node')].map(g => [g.dataset.id, g]));
    svg.querySelectorAll('.family [data-badge]').forEach(t => { if (on) { t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button'); } else { t.removeAttribute('tabindex'); t.removeAttribute('role'); } });
    const look = looker();
    if (on && geo.map) geo.nodes.forEach(n => { let tx = n.x + 12, html = ''; const card = cards[n.id], ty = tabLine(n, look(n)); if (!card) return;
      mapTabs(n).forEach(t => { if (t.badge != null) html += `<g class="um-key tab-key" data-node="${esc(n.id)}" data-badge="${t.badge}" tabindex="0" role="button" aria-label="${esc(t.text)}"><rect x="${tx - 2}" y="${ty - 10}" width="${t.w + 4}" height="19" rx="6" class="key-ring"/></g>`; tx += t.w + 4; });
      card.querySelectorAll('rect.verb-chip').forEach(r => { const i = +r.dataset.chip, { value } = chipRef(card, i), at = k => +r.getAttribute(k), verb = (n.verbs || [])[i];
        const name = value === verb ? value : `${value} (more: ${(n.verbs || []).slice(i).join(', ')})`; // the last chip may stand for the rest
        html += `<g class="um-key chip-key" data-node="${esc(n.id)}" data-chip="${i}" tabindex="0" role="button" aria-label="${esc(name)}"><rect x="${at('x') - 2}" y="${at('y') - 2}" width="${at('width') + 4}" height="${at('height') + 4}" rx="9" class="key-ring"/></g>`; });
      if (html) card.insertAdjacentHTML('afterend', html); });
  }
  const badgeRef = (node, box, i) => { const b = badgesOf(box != null ? boxDef(box) : ctx.nodeIn(node, cur))[i];
    return { type: 'badge', ...(box != null ? { container: box } : { node }), index: i, value: b ? b.text : '', view: cur }; };
  const chipRef = (card, i) => { const tx = card.querySelector(`text[data-chip="${i}"]`); return { type: 'chip', node: card.dataset.id, index: i, value: tx ? tx.textContent : '', view: cur }; };
  function activate(ref, ev) { // a click on something, or Enter on a tab: the host may take it (preventDefault), else it is selected
    sub = ref && (ref.type === 'chip' || ref.type === 'badge') ? ref : null;
    let keep = false; emit('click', { target: ref, event: ev, preventDefault() { keep = true; } });
    return !keep;
  }

  /* selection: the selected node, its neighbours and wires stay lit; the rest dims */
  function paint() {
    if (!svg) return;
    if (tx) tx.paint();
    svg.querySelectorAll('.um-handle').forEach(h => h.remove());
    if (can('add') && sel && sel.type === 'node' && geo.byId[sel.id]) { const n = geo.byId[sel.id];
      svg.insertAdjacentHTML('beforeend', `<g class="um-edit um-handle" data-from="${esc(n.id)}"><title>Drag to another card to add a line</title><circle cx="${n.x + n.w + 12}" cy="${n.y + n.h / 2}" r="6"/></g>`); }
    svg.querySelectorAll('.sel,.nb,.hot').forEach(g => g.classList.remove('sel', 'nb', 'hot')); stage.classList.remove('focusing');
    const pk = picked(), ns = pk.filter(r => r.type === 'node').map(r => r.id), li = pk.filter(r => r.type === 'edge').map(edgeIndex);
    svg.querySelectorAll('.line-key').forEach(k => k.setAttribute('aria-pressed', li.includes(+k.dataset.i))); svg.querySelectorAll('.node:not([role=img]), .node-key').forEach(g => g.setAttribute('aria-pressed', ns.includes(g.dataset.id ?? g.dataset.node)));
    if (!sel) return;
    if (sel.type === 'node') {
      const nid = sel.id, ups = new Set(), downs = new Set();
      geo.edges.forEach(e => { if (e.to === nid) ups.add(e.from); if (e.from === nid) downs.add(e.to); });
      svg.querySelectorAll('.node').forEach(g => { const id = g.dataset.id; g.classList.toggle('sel', ns.includes(id)); g.classList.toggle('nb', ups.has(id) || downs.has(id)); });
      svg.querySelectorAll('.edge-g').forEach(g => g.classList.toggle('hot', g.dataset.from === nid || g.dataset.to === nid));
      svg.querySelectorAll('.e-lab').forEach(g => { const e = geo.edges[g.dataset.i]; g.classList.toggle('hot', e.from === nid || e.to === nid); });
      svg.querySelectorAll('.n-port[data-edges]').forEach(p => p.classList.toggle('hot', p.dataset.edges.split(',').some(i => geo.edges[i] && (geo.edges[i].from === nid || geo.edges[i].to === nid)))); // not an ease's fading copy (#67)
      stage.classList.add('focusing');
    } else if (sel.type === 'edge') {
      const e = geo.edges[edgeIndex(sel)];
      svg.querySelectorAll('.node').forEach(g => { g.classList.toggle('sel', ns.includes(g.dataset.id)); g.classList.toggle('nb', g.dataset.id === e.from || g.dataset.id === e.to); }); // a card selected before the line stays selected
      stage.classList.add('focusing');
    } else if (sel.type === 'container') {
      const f = svg.querySelector(`.family[data-family="${CSS.escape(sel.id)}"]`); if (f) f.classList.add('sel');
    }
    li.forEach(i => svg.querySelectorAll(`.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(g => g.classList.add('hot'))); // the lines selected
  }
  function select(ref, o = {}) {
    if (ref && (ref.type === 'chip' || ref.type === 'badge')) ref = ref.container != null ? { type: 'container', id: ref.container } : nodeRef(ref.node); // a chip or badge: its card (box)
    if (ref && (!geo || !exists(ref))) return false;
    if (!o.story) readerMoved(); // a selection the story didn't make: a story playing waits (0.14.0)
    more = []; selectNew = false; // the reader moved on: an add the host has not answered selects nothing later
    sel = ref ? { ...copyRef(ref), view: cur } : null;
    if (!ofSel(sub)) sub = null; // a chip or badge acts for Delete and Alt + arrows only while its card or box is the one selected
    paint();
    if (sel && sel.type === 'node' && o.reveal !== false) { const n = geo.byId[sel.id]; requestAnimationFrame(() => { if (!dead) cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h }); }); }
    emitSel(!!o.again);
    return true;
  }

  /* keyboard: the nearest card in an arrow's direction, by distance along it plus twice the distance across it; within 45
     degrees of it, so a card almost level is not the one above (none there: focus stays) */
  function nearest(n, k) {
    if (!n || typeof n !== 'object') return null; // no card: none
    const [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k] || [0, 0], cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    let best = null, bs = Infinity;
    geo.nodes.forEach(m => { if (m.id === n.id) return; const ax = m.x + m.w / 2 - cx, ay = m.y + m.h / 2 - cy, along = ax * dx + ay * dy, across = Math.abs(ax * dy - ay * dx);
      if (along <= 0 || across > along) return; const sc = along + 2 * across; if (sc < bs) { bs = sc; best = m; } });
    return best;
  }

  /* several cards: Shift (or Cmd / Ctrl) + click adds a card to the selection, or takes it out; on a typed view a line too, and
     Shift + Enter on its ring (notes/stage-3.md §5.1). ref: a nodeRef or edgeRef */
  const kinds = () => typed() ? ['node', 'edge'] : ['node'], refKey = r => JSON.stringify([r.type, r.id, r.ids]);
  function toggle(ref) {
    const k = refKey(ref);
    if (k === refKey(sel)) { if (!more.length) return select(null); sel = more.pop(); }
    else if (more.some(r => refKey(r) === k)) more = more.filter(r => refKey(r) !== k);
    else { more.push(sel.type === 'node' ? nodeRef(sel.id) : sel); sel = ref; }
    sub = null; selectNew = false; paint(); emitSel();
  }

  /* navigation: zoom into the card that opens a view, out to the card a view came from. One move at a time, the latest
     wins: a setView() (or open, up) during a move takes it to its own view instead, and every request's promise says
     whether its view was shown (false: unknown, superseded, or the map destroyed). Under reduced motion a move is done
     before go() returns. */
  let nav = null; // the move under way: { to, how, waiting: the resolvers of the requests it answers }
  const answer = ok => { if (nav) nav.waiting.splice(0).forEach(r => r(ok)); };
  function go(vid, how = {}) {
    if (dead) return Promise.resolve(false);
    if (!ctx.V[vid]) { warn(`setView("${vid}"): the model has no such view; its views are ${ctx.views.map(v => `"${v.id}"`).join(', ') || 'none'}`); return Promise.resolve(false); }
    if (!nav && vid === cur) { if (how.select) select(idRef(how.select)); return Promise.resolve(true); }
    if (!how.story) readerMoved(); // a move the story didn't ask for: a story playing waits (0.14.0)
    return new Promise(res => {
      if (nav) { if (nav.to !== vid) answer(false); nav.to = vid; nav.how = how; nav.waiting.push(res); touch(); return; } // superseded: those requests learn so now
      nav = { to: vid, how, waiting: [res] }; move();
    });
  }
  async function move() { // takes the map from view to view until it shows the latest target; finishes or rolls back (busy, fading)
    const mine = nav, start = cur; let left = false; busy = true; touch();
    try {
      for (;;) {
        const prev = cur, via = () => nav.how.via; // a request's via: the card it opens, when the request is the latest
        const modeOf = v => prev && ctx.chain(v).includes(prev) || (v === nav.to && via()) ? 'in' : prev && ctx.chain(prev).includes(v) ? 'out' : 'jump';
        if (prev && !still() && nav.to !== prev) { // leave: into the card, or out, then fade
          const m = modeOf(nav.to), n = m === 'in' && via() && geo.byId[via()];
          if (n) await cam.animate(cam.zoomTo({ x: n.x, y: n.y, w: n.w, h: n.h }, 1.1), 420);
          else await cam.animate({ k: cam.s.k * (m === 'out' ? 0.6 : 1) }, m === 'out' ? 260 : 1);
          stage.classList.add('fading'); left = true; await sleep(130);
          if (dead || nav !== mine) return;
        }
        const vid = nav.to; // the latest request: one made during the leave is the view drawn
        if (!ctx.V[vid] || vid === cur) break; // gone from the model (an update() during the move), or back where it started
        const mode = modeOf(vid);
        delete asked[prev]; // an unfold asked for on the view left is not waited for (#71)
        if (P.onNavigate) P.onNavigate(vid, prev, mode);
        const at = trail.indexOf(vid); trail = at >= 0 ? trail.slice(0, at + 1) : trail.length === 1 && vid === (ctx.V[prev] || {}).parent ? [vid] : [...trail, vid];
        mount(vid); emitSel(); left = false;
        const fitS = startView(), back = mode === 'out' ? geo.nodes.find(n => ctx.childOf(n.id, cur) === prev) : null;
        if (prev && !still()) {
          if (mode === 'in') cam.set({ ...fitS, k: fitS.k * 0.55 });
          else if (mode === 'out') cam.set(back ? cam.zoomTo({ x: back.x, y: back.y, w: back.w, h: back.h }, 1.1) : { ...fitS, k: fitS.k * 1.6 });
          else cam.set(fitS);
          stage.classList.remove('fading');
          await cam.animate(fitS, mode === 'jump' ? 1 : 460);
        } else { cam.set(fitS); stage.classList.remove('fading'); }
        if (dead || nav !== mine) return;
        cam.touched = false;
        if (back) { flash(back.id); if (root.activeElement === stage) focusMap(nodeRef(back.id), false); } // keys go on from the card come back to
        if (nav.to === cur) break; // else a request during the zoom-in: on from here
      }
      // done: settled before any event, so a listener's own setView() starts a move of its own
      const ok = nav.to === cur, how = nav.how, shown = cur;
      answer(ok); nav = null; busy = false; stage.classList.remove('fading');
      if (left && cur) cam.animate(startView()); // left, and no other view drawn: the camera comes back
      if (shown && shown !== start) { say('Showing ' + labelOr(ctx.V[shown].title, shown)); emit('viewchange', { view: shown, from: start }); }
      if (ok && how.select && cur === shown) select(idRef(how.select), { reveal: true });
    } catch (err) { fail(err); } // a bug of ours or of a page hook: reported, and the map left usable below
    finally { if (nav === mine) { answer(false); nav = null; busy = false; stage.classList.remove('fading'); } touch(); }
  }
  /* where the camera starts: fit on a desk; on a phone a readable zoom from the top-left corner */
  function startView() {
    const f = cam.fitState();
    if (wide() || f.k >= 0.6) return f;
    const [W, H] = cam.size(), k = 0.6, b = geo.bounds;
    return { k, cx: b.x + (W / 2 - 12) / k, cy: b.y + (H / 2 - 56) / k };
  }
  function open(nid) { // a view the host has not loaded (#47): it can load it, update(), then setView(), or update() right here
    const c = ctx.opensOf(nid, cur);
    if (!c) return status('No inner view for this node');
    let stop = false;
    emit('open', { target: nodeRef(nid), view: c, preventDefault() { stop = true; } });
    if (!stop && ctx.V[c]) go(c, { via: nid });
  }
  const up = () => { const p = upOf(); if (p) go(p); else status('Already at the top'); };
  /* unfolding in place (#71): a stacked card opens into a box on this view (mapContext's unfold), and folds back. Off in
     an editable map: an edit names the model's own views and boxes, and an unfolded box is neither. */
  const unfoldBox = id => { const f = ((ctx.V[cur] || {}).containers || []).find(b => b && b.id === id); return f && f.unfolds ? f : null; };
  const foldOf = id => { const bs = (ctx.V[cur] || {}).containers || []; let b = bs.filter(x => x && (x.nodeIds || []).includes(id)).pop(); // the unfolded box a card is in
    for (let k = 0; b && k < 64; k++, b = bs.find(x => x && x.id === b.parent)) if (b.unfolds) return b.id; return null; };
  function setUnfold(nid, on) { // true when the picture changed
    const list = expanded[cur] || [];
    if (!on && asked[cur]) asked[cur].delete(nid); // folded back before its view came: no longer waited for
    if (E || dead || !cur || (on ? list.includes(nid) || !ctx.unfoldable(nid, cur) : !list.includes(nid))) return false;
    expanded[cur] = on ? [...list, nid] : list.filter(x => x !== nid);
    update(current, false, true);
    if ((expanded[cur] || []).includes(nid) !== on) { emitSel(); return false; } // the model would not have it after all
    unfolded(nid, on);
    return true;
  }
  function unfolded(nid, on) { // the box a card became is selected and brought into view, or the card it folded back into: one select event
    const f = on && (geo.families || []).find(x => x.id === nid);
    if (f) { cam.reveal({ x: f.x, y: f.y, w: f.w, h: f.h }); select({ type: 'container', id: nid }, { reveal: false }); }
    else if (!on && geo.byId[nid]) select(nodeRef(nid));
    else emitSel();
    say(`${nameOf(nid)} ${on ? 'unfolded here' : 'folded'}`);
  }
  function gesture(id, how) { // E, or Alt + click: a stacked card unfolds; an unfolded box, or a card in one, folds it
    if (E || !id || !geo) return false;
    const c = geo.byId[id] ? ctx.opensOf(id, cur) : null, on = !!c && (!ctx.V[c] || !!ctx.unfoldable(id, cur)), nid = on ? id : unfoldBox(id) ? id : foldOf(id);
    if (!nid) return false;
    let stop = false; // the host may take it, or load a view it has not yet and update() right here
    emit('expand', { target: nodeRef(nid), view: ctx.opensOf(nid, cur), expanded: on, preventDefault() { stop = true; } });
    if (stop || dead) return true;
    if (!setUnfold(nid, on)) {
      const c2 = on && ctx.opensOf(nid, cur);
      if (c2 && !ctx.V[c2]) { (asked[cur] ||= new Map()).set(nid, c2); say(`${nameOf(nid)}: its inner view is not loaded yet; it unfolds here once it is`); } // the update() that brings it unfolds it
      if (on) status(c2 && !ctx.V[c2] ? 'Its inner view is not loaded yet' : 'Nothing more to show here');
      return true; }
    if (how === 'key') { const f = on && (geo.families || []).find(x => x.id === nid), inside = n => n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
      const n0 = f ? geo.nodes.filter(inside).sort((a, b) => a.x - b.x || a.y - b.y)[0] : null; focusMap(n0 ? nodeRef(n0.id) : sel); } // keys go on inside, or on the card
    return true;
  }
  function flash(nid) { const g = svg.querySelector(`.node[data-id="${CSS.escape(nid)}"]`); if (!g) return; g.classList.add('flash'); later(() => g.classList.remove('flash'), 1400); }
  function setFlow(on, save = true) { // save: the page keeps it as the reader's choice
    stage.classList.toggle('flowing', on);
    const b = q('[data-z="flow"]'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    if (save && P.onFlow) P.onFlow(on);
    touch();
  }
  function pause(on) { const was = paused; paused = on; stage.classList.toggle('paused', on); if (svg) on ? svg.pauseAnimations() : svg.unpauseAnimations();
    if (on !== was) touch(); // MapState.paused (0.15.0)
    if (story && on !== was) { if (on) clearTimeout(story.timer); else arm(story); } } // the page's Pause holds every clock: a dot that rides (startTrip), and a story's step, given its time again after

  /* keys on the canvas; the page forwards the same keys when the focus is elsewhere */
  function key(e) {
    const k = e.key, nk = e.target && e.target.closest && e.target.closest('.node-key'), g = nk ? nodeG(nk.dataset.node) : e.target && e.target.closest && e.target.closest('.node'); // a node's ring (svg.js): the node
    if (k === 'Escape' && cancelGesture()) return true; // Escape stops a gesture in progress before anything else
    if (story) { const r = storyKey(e); if (r != null) return r; } // a story's keys first (#69)
    if (k === 'Escape' && trip && trip.kind) { const was = trip.kind; endTrip(); say(was === 'replay' ? 'Replay stopped' : 'Tour stopped'); return true; } // Esc ends a tour or a replay first
    if (E && (typed() ? tx.key(e) : editKey(e))) return true;
    if (e.altKey) return false;
    const lk = e.target && e.target.closest && e.target.closest('.line-key'), tk = e.target && e.target.closest && e.target.closest('.tab-key, .family [data-badge]');
    const ck = e.target && e.target.closest && e.target.closest('.chip-key'), card = ck && [...svg.querySelectorAll('.node')].find(x => x.dataset.id === ck.dataset.node);
    const add = k === 'Enter' && e.shiftKey && sel && kinds().includes(sel.type) && typed(); // Shift + Enter: into the selection, or out of it
    if (k === 'Enter' && lk && geo.edges[+lk.dataset.i]) add ? toggle(edgeRef(geo.edges[+lk.dataset.i])) : select(edgeRef(geo.edges[+lk.dataset.i]), { again: true }); // as a click on the line (#43)
    else if (k === 'Enter' && tk) { const fam = tk.closest('.family'), ref = badgeRef(tk.dataset.node, fam ? fam.dataset.family : null, +tk.dataset.badge); if (activate(ref, e)) select(ref); }
    else if (k === 'Enter' && card) { const ref = chipRef(card, +ck.dataset.chip); if (activate(ref, e)) select(ref); } // as a click on the chip
    else if (k === 'e' || k === 'E') return gesture(g ? g.dataset.id : sel && (sel.type === 'node' || sel.type === 'container') ? sel.id : null, 'key'); // unfold here, or fold back (#71)
    else if (k === '+' || k === '=') cam.zoomAt(1.4, null, null, true);
    else if (k === '-' || k === '_') cam.zoomAt(1 / 1.4, null, null, true);
    else if (k === '0') cam.fit();
    else if (k === '1') cam.actual();
    else if (k === 'Enter' && (g || (sel && sel.type === 'node'))) { // a selected card opens its inner view; without one it is selected again, as a click does
      const id = g ? g.dataset.id : sel.id;
      if (add) toggle(nodeRef(id)); else if (sel && sel.type === 'node' && sel.id === id && ctx.opensOf(id, cur)) open(id); else select(nodeRef(id), { again: true }); }
    else if (k === 'Escape' || k === 'Backspace') { if (sel) select(null); else up(); }
    else if ((k === 'f' || k === 'F') && !reducedMotion()) setFlow(!stage.classList.contains('flowing')); // under reduced motion no flow is drawn, and ≋ isn't offered
    else if (k.startsWith('Arrow') && g && geo.byId[g.dataset.id]) { const to = nearest(geo.byId[g.dataset.id], k); if (!to) return false;
      (ringOf(to.id) || nodeG(to.id)).focus({ preventScroll: true }); cam.reveal({ x: to.x, y: to.y, w: to.w, h: to.h }); }
    else if (k.startsWith('Arrow')) { const d = 80, m = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[k]; if (!m) return false; cam.pan(m[0], m[1], true); }
    else return false;
    readerMoved(); // a key the map acted on: a story playing waits
    return true;
  }


  /* ---------- editing: a gesture never changes the picture; it emits a `change` the host may apply (then update()) ----------
     Each event carries what the user meant and, apart from it, an optional hint: where the card was dropped. */
  let seq = 0, sub = null, drag = null, conn = null, naming = null, stale = false, selectNew = false, swallow = 0;
  /* the gesture in progress, one at a time: a card dragged, a line drawn from the handle, or a name field open (naming:
     { ref, place, close }). Escape, a new picture (setView, an update that redraws, unfolding) and destroy() cancel it,
     with no change emitted; keepName leaves a name field open over the same view's card, which mount() checks */
  const gestureNow = () => conn || (tx && tx.linking()) ? 'connecting' : drag && drag.on ? 'dragging' : naming ? 'naming' : 'idle';
  function cancelGesture(keepName = false) { // true when something was in progress
    let was = false;
    if (conn) { if (conn.path) conn.path.remove(); conn = null; was = stale = true; } // its pointerup and click then do nothing
    if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.on) was = stale = true; drag = null; }
    if (naming && !keepName) { naming.close(false); was = true; }
    if (tx && tx.cancel()) was = true;
    if (was) touch();
    return was;
  }
  const placed = O();  // per view: the slot every card had when last drawn (stable positions across updates; never in the model)
  /* an edit's places wait for the host's answer, and the next update() says from its model whether it applied the edit:
     a move into or out of a box shows in the boxes, an add as a new card with its name, and a place alone (a move to a
     spot, a reorder) as the card's own `layout` entry the host wrote, or as the model unchanged (the host answering an
     edit that changes no field). Any other update drops it: an edit the host refused moves nothing, whatever comes next.
     Places an update applied are kept with the models before and after it, so an update back to either (undo, redo)
     puts the cards back where they were then */
  let pending = null; // the latest gesture's: { op, view, card, place, to, exact, label, ids, base, at }
  const moves = []; // { view, base, after, before, then }: places an update applied, and the ones before it
  const viewIn = (m, vid) => arrOf(m && m.views).find(v => v && v.id === vid) || {};
  const boxIdOf = (m, vid, id) => { const bs = arrOf(viewIn(m, vid).containers).filter(b => b && b.id != null && arrOf(b.nodeIds).includes(id)); // the innermost box listing it
    return ((bs.find(b => !bs.some(o => o.parent === b.id)) || bs[0]) || {}).id ?? null; };
  const norm = t => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const labelIn = (m, v, id) => norm(((v.nodeOverrides || {})[id] || {}).label ?? ([...arrOf(m.nodes), ...arrOf(m.views).flatMap(w => arrOf(w && w.nodes))].find(n => n && n.id === id) || {}).label);
  function change(c, exact) {
    const ev = { id: 'c' + Date.now().toString(36) + '-' + (++seq), view: cur, ...c };
    // only the latest gesture waits for the host: an edit the host never answered leaves no trace
    const place = ev.hint && Number.isFinite(ev.hint.col) ? [ev.hint.col, ev.hint.row] : null, card = c.target && c.target.type === 'node' ? c.target.id : null, v = viewIn(current, cur);
    pending = (place || exact) && (card || (c.op === 'add' && c.kind === 'node')) ? { op: c.op, view: cur, card, place, exact, label: norm(c.label), ids: arrOf(v.nodeIds),
      to: c.op === 'move' && (c.to ?? null) !== boxIdOf(current, cur, card) ? c.to ?? null : undefined, base: modelText(current), at: jsonText((v.layout || {})[card] ?? null) } : null;
    selectNew = c.op === 'add' && c.kind === 'node'; // the latest gesture's: an add the host never answered selects nothing later
    emit('change', ev);
    return ev;
  }
  // a whole model as text, to tell two apart: as mapContext reads it (unreadable() leaves out a value that throws when read, a
  // host's getter) when JSON cannot write it, never the one text "[unreadable]" for any two such models (audit 32: update() kept
  // the old picture). UNREAD still, the model is no model it was before: never the same
  const UNREAD = '[unreadable]', modelText = m => { const s = jsonText(m); return s === UNREAD ? jsonText(unreadable(m).model) : s; };
  function answered(p, m2, json) { // the update's model shows the edit: the card its places go to, else null
    const v = viewIn(m2, p.view), was = new Set(p.ids);
    if (p.op === 'add') return arrOf(v.nodeIds).find(id => !was.has(id) && labelIn(m2, v, id) === p.label) ?? null; // a new card with its name
    if (p.to !== undefined) return boxIdOf(m2, p.view, p.card) === p.to ? p.card : null; // into or out of a box
    if (p.typed) return jsonText((v.layout || {})[p.card] ?? null) === jsonText(p.place) ? p.card : null; // a typed pin: the host wrote it (an unchanged model refused it)
    return json !== UNREAD && json === p.base || jsonText((v.layout || {})[p.card] ?? null) !== p.at ? p.card : null; // a place alone
  }
  const worldOf = e => { const r = stage.getBoundingClientRect(); return cam.toWorld(e.clientX - r.left, e.clientY - r.top); };
  const area = f => f.w * f.h;
  const boxAt = (x, y) => (geo.families || []).filter(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h).sort((a, b) => area(a) - area(b))[0] || null;
  const boxOf = id => (geo.families || []).filter(f => (f.nodeIds || []).includes(id)).sort((a, b) => area(a) - area(b))[0] || null;
  const gridView = () => !geo.hub && geo.nodes.length && geo.nodes.every(n => Number.isFinite(n.col) && Number.isFinite(n.row));
  function hintAt(x, y) { // a point in the view, and on a column view its column and row
    const h = { x: Math.round(x), y: Math.round(y) };
    if (!gridView()) return h;
    const T = geo.down, X = n => T ? n.y + n.h / 2 : n.x + n.w / 2, Y = n => T ? n.x : n.y; // a typed view laid out down: its columns run down
    if (T) [x, y] = [y, x];
    const cols = [...new Set(geo.nodes.filter(n => !n.aside).map(n => n.col))].sort((a, b) => a - b); // the row of cards with no line keeps off the columns
    const mid = c => { const ns = geo.nodes.filter(n => n.col === c && !n.aside); return ns.reduce((a, n) => a + X(n), 0) / ns.length; };
    const first = cols[0], last = cols[cols.length - 1], step = cols.length > 1 ? (mid(last) - mid(first)) / (last - first) : 260;
    let col = first, best = Infinity; cols.forEach(c => { const d = Math.abs(mid(c) - x); if (d < best) { best = d; col = c; } });
    if (x > mid(last) + step / 2) col = last + Math.round((x - mid(last)) / step);
    else if (x < mid(first) - step / 2) col = Math.max(0, first - Math.round((mid(first) - x) / step));
    const a = geo.nodes[0], b = geo.nodes.find(n => n.row !== a.row), pitch = b ? (Y(b) - Y(a)) / (b.row - a.row) : 108;
    const on = geo.nodes.find(n => n.col === col && !n.aside && y >= Y(n) && y <= Y(n) + (T ? n.w : n.h)); // on a card of the column: its row, half rows too
    h.col = col; h.row = on ? on.row : Math.max(0, Math.round((y - (Y(a) - a.row * pitch) - 32) / pitch));
    return h;
  }
  const siblings = n => { const b = boxOf(n.id); return geo.nodes.filter(m => m.col === n.col && !m.aside === !n.aside && boxOf(m.id) === b).sort((p, q) => p.y - q.y); };
  // a reorder rearranges the card's whole column group: the same slots, the card at its new place among them
  const reorderSlots = (n, i) => { const sib = siblings(n), rows = sib.map(m => m.row), order = sib.filter(m => m !== n); order.splice(i, 0, n);
    return Object.fromEntries(order.map((m, k) => [m.id, [n.col, rows[k]]])); };
  const boxDef = id => ((ctx.V[cur] || {}).containers || []).find(c => c && c.id === id) || {};
  const listOf = r => { if (r.container != null) return badgesOf(boxDef(r.container)); const n = ctx.nodeIn(r.node, cur); return r.type === 'badge' ? badgesOf(n) : n.verbs || []; };
  const ofSel = r => !!(r && sel && (sel.type === 'node' ? r.node === sel.id : sel.type === 'container' && r.container === sel.id)); // a chip or badge of the selection
  function editKey(e) {
    const k = e.key;
    if (e.altKey && can('reorder') && k.startsWith('Arrow')) {
      if (ofSel(sub) && (k === 'ArrowLeft' || k === 'ArrowRight')) { // a chip or badge in its list
        const i = sub.index + (k === 'ArrowRight' ? 1 : -1); if (i < 0 || i >= listOf(sub).length) return true;
        change({ op: 'reorder', target: sub, index: i }); return true; }
      if (sel && sel.type === 'node' && gridView() && (k === 'ArrowUp' || k === 'ArrowDown')) { // a card among its column
        const n = geo.byId[sel.id], sib = siblings(n), at = sib.indexOf(n), i = at + (k === 'ArrowDown' ? 1 : -1);
        if (i < 0 || i >= sib.length) return true;
        const o = sib[i]; change({ op: 'reorder', target: nodeRef(n.id), index: i, hint: { x: Math.round(o.x + o.w / 2), y: Math.round(o.y + o.h / 2), col: o.col, row: o.row } }, reorderSlots(n, i)); return true; }
      return false;
    }
    if (e.altKey) return false;
    if (k === 'F2' && sel && can('rename')) { rename(sel); return true; }
    if ((k === 'n' || k === 'N') && can('add')) { addAt(cam.s.cx, cam.s.cy); return true; }
    if (k === 'Delete' && can('delete') && sel && more.length) { picked().forEach(t => change({ op: 'delete', target: t })); return true; } // one event per card
    if (k === 'Delete' && can('delete') && sel) { change({ op: 'delete', target: ofSel(sub) ? sub : sel }); return true; }
    return false;
  }
  /* a text field over the canvas: names a new card, or renames a card, line or container. It follows the camera, and a
     redraw of the same view keeps it over its card (a new view, or its card gone, closes it: see mount) */
  const nameBox = ref => { // where the field sits, in map units: over a card's name, a line's label (or its middle), a box's title
    if (ref.type === 'node') { const n = geo.byId[ref.id]; return n ? { x: n.x + 50, y: n.y + n.h / 2 - 13, w: n.w - 58, h: 26 } : null; }
    if (ref.type === 'edge') { const e = geo.edges[edgeIndex(ref)]; if (!e) return null; const L = e.lbl, m = e.pts[Math.floor(e.pts.length / 2)];
      return L ? { x: L.x - 8, y: L.y - 2, w: L.w + 16, h: L.h + 4 } : { x: m[0] - 60, y: m[1] - 12, w: 120, h: 24 }; }
    const f = ref.type === 'container' && (geo.families || []).find(x => x.id === ref.id); return f ? { x: f.x + 8, y: f.y + 2 + (f.head || 0), w: Math.min(f.w - 16, 220), h: 24 } : null; };
  function editor(where, text, done, ref = null, empty = false) { // where: a box in map units (a new card's), or ref names what the field sits over; empty: an emptied field is a change
    if (naming) naming.close(false);
    // a name of more than one line (a mindmap topic's, one Mermaid's <br> wrote) in a field that keeps its breaks: an <input>
    // drops them, so F2 then Enter joined the lines (audit 20). Enter commits there too, Shift + Enter breaks a line
    const lines = /[\r\n]/.test(text), inp = document.createElement(lines ? 'textarea' : 'input');
    inp.className = 'um-edit um-rename'; inp.value = text; if (lines) inp.rows = text.split(/\r\n|\r|\n/).length; inp.setAttribute('aria-label', ref ? 'New name' : 'Name of the new card'); // a rename by what it renames, an empty name too (audit 21)
    const place = () => { const box = ref ? nameBox(ref) : where; if (!box) return; const k = cam.s.k, [W, H] = cam.size();
      Object.assign(inp.style, { left: (box.x - cam.s.cx) * k + W / 2 + 'px', top: (box.y - cam.s.cy) * k + H / 2 + 'px', width: Math.max(120, box.w * k) + 'px', height: Math.max(22, box.h * k) * (lines ? inp.rows : 1) + 'px', fontSize: Math.max(11, 13 * k) + 'px' }); };
    place(); stage.appendChild(inp); inp.focus(); inp.select();
    // once only: removing a focused field can fire blur (cancel) in the middle of a commit
    let closed = false;
    // the field's value has its line breaks as \n (a textarea's does): \r\n in the name is no change made (audit 21)
    const finish = ok => { if (closed) return; closed = true; naming = null; touch(); const v = inp.value.trim(); if (ok && (v || empty) && v !== text.replace(/\r\n?/g, '\n').trim()) done(v); inp.remove(); stage.focus({ preventScroll: true }); };
    naming = { ref, place, close: finish }; touch();
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !(lines && e.shiftKey)) { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    inp.addEventListener('blur', () => finish(false));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
    return inp;
  }
  function rename(ref) {
    ref = copyRef(ref); if (!can('rename') || !ref || !nameBox(ref)) return;
    const n = ref.type === 'node' && geo.byId[ref.id], e = ref.type === 'edge' && geo.edges[edgeIndex(ref)], f = ref.type === 'container' && (geo.families || []).find(x => x.id === ref.id);
    // a box whose drawn title is not its name (a SysML frame's header) says what F2 edits in edit (audit 20)
    const text = n ? String(ctx.nodeIn(n.id, cur).label ?? n.label ?? '') : e ? String((e.all || [e])[0].label || '') : f.edit != null ? String(f.edit) : String(f.label || f.id);
    editor(null, text, v => typed() ? tx.label(ref, v) : change({ op: 'rename', target: ref, label: v }), ref, typed() && !!(tx && tx.empty && tx.empty(ref)));
  }
  function addAt(x, y) {
    if (!can('add') || !geo) return;
    if (typed()) return tx.add();
    const hint = hintAt(x, y), box = boxAt(x, y);
    editor({ x: x - 80, y: y - 13, w: 160, h: 26 }, '', label => change({ op: 'add', kind: 'node', label, ...(box ? { container: box.id } : {}), hint }));
  }
  stage.addEventListener('dblclick', e => { if (!can('add') || !e.altKey || e.target.closest('.node, .ctl, .minimap')) return; e.preventDefault(); e.stopPropagation(); const [x, y] = worldOf(e); addAt(x, y); }, true);
  // the click a browser sends after a drag is not a click on the card; a new press ends that, or 400 ms
  stage.addEventListener('click', e => { if (swallow > performance.now()) { swallow = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  /* focus: put it on a card (default: the selected one), else on the canvas. Focus that reaches the canvas from outside
     and not by a press (host.focus(), as a dialog does when it gives focus back) goes on to the selected card. */
  let pressed = false;
  stage.addEventListener('pointerdown', () => { swallow = 0; pressed = true; }, true);
  ['pointerup', 'pointercancel'].forEach(t => stage.addEventListener(t, () => { pressed = false; }, true));
  function focusMap(ref = sel, reveal = true) {
    const line = ref && ref.type === 'edge' && svg && svg.querySelector(`.line-key[data-i="${edgeIndex(ref)}"]`); if (line) return line.focus({ preventScroll: true }); // a line (#43)
    const id = ref && (ref.type === 'node' ? ref.id : ref.node), g = id && svg && (ringOf(id) || nodeG(id));
    if (!g) return stage.focus({ preventScroll: true });
    g.focus({ preventScroll: true }); const n = geo.byId[id]; if (n && reveal) cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h });
  }
  stage.addEventListener('focus', e => { if (!pressed && sel && (sel.type === 'node' || sel.type === 'edge') && !(e.relatedTarget && root.contains(e.relatedTarget))) focusMap(); });
  stage.addEventListener('focusin', e => { const t = e.target; if (pressed || !cam || !t.closest || !t.closest('.node, .um-key, .family [data-badge]') || typeof t.getBBox !== 'function') return;
    const b = t.getBBox(); cam.reveal({ x: b.x, y: b.y, w: b.width, h: b.height }); }); // Tab to something out of view brings it in
  /* dragging a card: into or out of a container (move), along its column (reorder), or to another spot (move + hint) */
  stage.addEventListener('pointerdown', e => {
    if (!E || e.button !== 0 || e.altKey || !geo) return;
    const hd = e.target.closest('.um-handle');
    if (hd && can('add')) { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (_) {} conn = { from: hd.dataset.from, path: null }; touch(); return; }
    const g = e.target.closest('.node');
    if (g && geo.byId[g.dataset.id] && (can('move') || can('reorder'))) drag = { id: g.dataset.id, g, x0: e.clientX, y0: e.clientY, on: false, ghost: null, pid: e.pointerId };
  });
  stage.addEventListener('pointermove', e => {
    if (conn) {
      const n = geo.byId[conn.from], [x, y] = worldOf(e);
      if (!conn.path) { svg.insertAdjacentHTML('beforeend', '<path class="um-edit um-link"/>'); conn.path = svg.lastElementChild; }
      conn.path.setAttribute('d', `M ${n.x + n.w + 12} ${n.y + n.h / 2} L ${x} ${y}`);
      return;
    }
    if (!drag) return;
    const k = cam.s.k, dx = (e.clientX - drag.x0) / k, dy = (e.clientY - drag.y0) / k;
    if (!drag.on) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.on = true; try { stage.setPointerCapture(drag.pid); } catch (_) {} drag.ghost = drag.g.cloneNode(true); drag.ghost.classList.add('um-ghost'); drag.ghost.classList.remove('sel'); svg.appendChild(drag.ghost); touch(); }
    drag.ghost.setAttribute('transform', `translate(${dx} ${dy})`);
    const n = geo.byId[drag.id], into = boxAt(n.x + n.w / 2 + dx, n.y + n.h / 2 + dy);
    svg.querySelectorAll('.family.um-target').forEach(f => f.classList.remove('um-target'));
    if (into) { const f = svg.querySelector(`.family[data-family="${CSS.escape(into.id)}"]`); if (f) f.classList.add('um-target'); }
  });
  const endGesture = e => {
    if (conn || drag) touch(); // the gesture ends
    if (stale) { stale = false; swallow = performance.now() + 400; return; } // the release of a gesture Escape or a new picture cancelled
    if (conn) { const c = conn; conn = null; if (c.path) c.path.remove(); swallow = performance.now() + 400;
      const g = root.elementFromPoint(e.clientX, e.clientY), t = g && g.closest && g.closest('.node');
      if (t && geo.byId[t.dataset.id]) typed() ? tx.connect(c.from, t.dataset.id, e) : t.dataset.id !== c.from && change({ op: 'add', kind: 'edge', from: c.from, to: t.dataset.id }); // a typed view: maybe to itself (I.self, edit.js)
      return; }
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return;
    swallow = performance.now() + 400;
    svg.querySelectorAll('.family.um-target').forEach(f => f.classList.remove('um-target'));
    const k = cam.s.k, dx = (e.clientX - d.x0) / k, dy = (e.clientY - d.y0) / k, n = geo.byId[d.id];
    const x = n.x + n.w / 2 + dx, y = n.y + n.h / 2 + dy, hint = hintAt(x, y), from = boxOf(n.id), into = boxAt(x, y);
    const fromId = from ? from.id : null, toId = into ? into.id : null;
    let ev = null;
    if (typed()) ev = tx.drop(n, hint, toId, fromId); // a typed view: the card's pin, and its owner when it left its box (notes/stage-2.md §8)
    else if (toId !== fromId && can('move')) ev = change({ op: 'move', target: nodeRef(n.id), to: toId, hint });
    else if (gridView() && hint.col === n.col && can('reorder')) {
      const sib = siblings(n), at = sib.indexOf(n), i = sib.filter(m => m !== n && m.y + m.h / 2 < y).length;
      if (i !== at) ev = change({ op: 'reorder', target: nodeRef(n.id), index: i, hint }, reorderSlots(n, i));
    }
    else if (can('move') && (!gridView() || hint.col !== n.col || hint.row !== n.row)) ev = change({ op: 'move', target: nodeRef(n.id), to: fromId, hint });
    if (ev) { d.ghost.classList.add('um-pending'); later(() => d.ghost.remove(), 3000); } // stays at the drop until the host's update, or 3 s
    else d.ghost.remove();
  };
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); if (conn && conn.path) conn.path.remove(); drag = conn = null; stale = false; });
  /* the model to draw after an update: cards keep the slots they had (the host's own layout wins), a moved or added card
     takes its hint; kept in this handle only, never written to the host's model. A typed view's boxes take no slot, and an edit
     that changed the box an element shown before and after is drawn in lays the view out again, so every box holds exactly its
     contents (notes/stage-2.md §3.2); hiding or deleting a card keeps the places */
  const boxesIn = (m, v) => { const T = m && m.schemaVersion === 2 && v && v.diagram != null && diagramOf(v); return T && T.boxes ? arrOf(T.boxes(m, v)).filter(b => b && b.id != null) : []; };
  const ownersOn = bs => new Map(bs.flatMap(b => [[b.id, b.parent ?? null], ...arrOf(b.nodeIds).map(id => [id, b.id])])); // id -> the box it is drawn in
  function withPlaces(m, use = null, prev = null) { // use: an edit the update applied, { view, hv: id -> its place, ex: a reordered group's places }; prev: the model before
    if (options.stableLayout === false) return m;
    const out = copyOf(m);
    (out.views || []).forEach(v => {
      const bx = boxesIn(out, v), pv = viewIn(prev, v.id), A = ownersOn(boxesIn(prev, pv)), B = ownersOn(bx);
      const shown = new Set(arrOf(pv.nodeIds)), again = A.size + B.size > 0 && arrOf(v.nodeIds).some(id => shown.has(id) && (A.get(id) ?? null) !== (B.get(id) ?? null));
      const { hv = {}, ex = {} } = use && use.view === v.id && !again ? use : {}, was = again ? null : placed[v.id] && O(placed[v.id]), H = O(hv), E = O(ex);
      if (!was && !Object.keys(hv).length && !Object.keys(ex).length) return;
      const ids = (v.nodeIds || []).filter(id => typeof id === 'string' && !bx.some(b => b.id === id)), mine = O(v.layout), L = O(), taken = new Set(), key = p => p[0] + ',' + p[1];
      // a card the model before pinned, its pin gone in this one: the slot it kept is the pin's, so it is laid out again (audit 33)
      const pins = O(pv.layout), unpinned = id => Array.isArray(pins[id]) && !Array.isArray(mine[id]) && was && Array.isArray(was[id]) && was[id][0] === pins[id][0] && was[id][1] === pins[id][1];
      const put = (id, p) => { let [c, r] = p; while (taken.has(key([c, r]))) r++; L[id] = [c, r]; taken.add(key([c, r])); };
      // the host's pins of what the view draws as cards but does not list (a composite's parts): kept, as its own (audit 35)
      Object.keys(mine).forEach(id => { if (!ids.includes(id)) L[id] = mine[id]; });
      ids.forEach(id => { if (Array.isArray(mine[id])) { L[id] = mine[id]; taken.add(key(mine[id])); } });    // the host's own layout
      ids.forEach(id => { if (!L[id] && E[id]) put(id, E[id]); });                                               // a reordered column group
      ids.filter(id => !L[id] && !H[id] && was && was[id] && !unpinned(id)).sort((a, b) => was[a][0] - was[b][0] || was[a][1] - was[b][1]).forEach(id => put(id, was[id])); // everyone stays
      ids.forEach(id => { if (!L[id] && H[id]) put(id, H[id]); });                                              // a moved or added card: its drop, or the nearest free slot
      if (Object.keys(L).length) v.layout = L;
    });
    return out;
  }

  /* events: each clickable thing reports its reference */
  // the card a double-click's first click hit: that click may open the details panel, refit the view and move the card
  // from under the second, which still opens it (a dblclick with no two clicks before it, sent by a script, opens its target)
  let hit1 = null;
  stage.addEventListener('click', e => {
    const t = e.target;
    if (e.detail === 1) hit1 = { id: (t.closest('.node') || { dataset: {} }).dataset.id, at: performance.now(), v: cur }; else if (e.detail === 2 && hit1) hit1.two = true;
    const bv = t.closest('.empty-view [data-v]'); if (bv) return go(bv.dataset.v);
    if (t.closest('.ctl, .minimap')) return;
    const g = t.closest('.node'), chip = t.closest('[data-chip]'), badge = t.closest('[data-badge]'), eg = t.closest('.edge-g, .e-lab'), fam = t.closest('.family');
    if (g && t.closest('.open-hint')) { if (e.detail <= 1) open(g.dataset.id); return; } // the ⤢ badge opens (a double-click on it opens once)
    if (fam && t.closest('.fold-hint')) { if (e.detail <= 1) gesture(fam.dataset.family); return; } // an unfolded box's ⤡ tab folds it (#71)
    if (g && e.altKey && !E && e.detail <= 1 && gesture(g.dataset.id)) return; // Alt + click: unfold the card here, or fold the box it is in
    let ref = null;
    if (g && badge) ref = badgeRef(g.dataset.id, null, +badge.dataset.badge);
    else if (g && chip) ref = chipRef(g, +chip.dataset.chip);
    else if (g) ref = nodeRef(g.dataset.id);
    else if (eg && geo.edges[+eg.dataset.i]) ref = edgeRef(geo.edges[+eg.dataset.i]);
    else if (fam && badge) ref = badgeRef(null, fam.dataset.family, +badge.dataset.badge);
    else if (fam) ref = { type: 'container', id: fam.dataset.family, view: cur };
    sub = null;
    if (ref) {
      if (!activate(ref, e)) return; // the host took the click (a chip as a link, say): the selection stays as it was
      if ((e.shiftKey || e.metaKey || e.ctrlKey) && sel && kinds().includes(ref.type) && kinds().includes(sel.type)) return toggle(ref); // several cards, and lines
      return select(ref, { again: ref.type === 'node' }); }
    select(null);
    if (P.onBackground) P.onBackground();
  });
  const fresh = () => hit1 && hit1.v === cur && performance.now() - hit1.at < 1000 && hit1.id;
  // the second click may land outside the map, on page chrome the first click's details panel moved there (the
  // standalone page's legend): it still opens the card the first click hit (audit 9)
  const away = e => { if (e.composedPath().includes(host) || !fresh()) return; // the path, not e.target: in a shadow root it is the outer host (audit 10)
    if (e.type === 'click') { if (e.detail === 2) hit1.two = true; else hit1 = null; return; }
    const id = hit1.two && hit1.id; hit1 = null; if (id) { e.preventDefault(); open(id); } };
  const doc = host.ownerDocument; doc.addEventListener('click', away, true); doc.addEventListener('dblclick', away, true);
  stage.addEventListener('dblclick', e => { const g = e.target.closest('.node'), id = (hit1 && hit1.two && fresh()) || g && g.dataset.id; hit1 = null;
    if (!id) return; e.preventDefault(); if (e.target.closest('.open-hint') || (e.altKey && !E)) return; // Alt: its click unfolded
    if (can('rename') && sel && sel.type === 'node' && sel.id === id && g && g.dataset.id === id && e.target.closest('.n-label')) return rename(sel); // a selected card's name edits
    open(id); });
  stage.addEventListener('keydown', e => { if (e.defaultPrevented || e.metaKey || e.ctrlKey || (e.altKey && !E) || e.target.closest('input')) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('button')) return; // a button of the map's own (zoom, ↑, ≋, Back) presses itself
    if (key(e)) { e.preventDefault(); e.stopPropagation(); } });
  stage.addEventListener('pointerover', e => { const g = e.target.closest('.node'); if (!g) return; svg.querySelectorAll('.edge-g').forEach(x => x.classList.toggle('hov', x.dataset.from === g.dataset.id || x.dataset.to === g.dataset.id)); });
  stage.addEventListener('pointerout', e => { if (e.target.closest('.node')) svg.querySelectorAll('.edge-g.hov').forEach(x => x.classList.remove('hov')); });
  // a line focused by key shows its weight as hover does (its key is outside the line's group, so the sheet cannot reach it)
  const keyOn = e => { if (!svg) return; svg.querySelectorAll('.edge-g.key-on').forEach(x => x.classList.remove('key-on')); const k = e.type === 'focusin' && e.target.closest && e.target.closest('.line-key');
    if (k) { const g = svg.querySelector(`.edge-g[data-i="${k.dataset.i}"]`); if (g) g.classList.add('key-on'); } };
  stage.addEventListener('focusin', keyOn); stage.addEventListener('focusout', keyOn);
  const ctl = q('.ctl');
  if (ctl) ctl.addEventListener('click', e => { const z = e.target.closest('button')?.dataset.z; if (!z) return; readerMoved(); // a press by key too: a story playing waits
    if (z === 'in') cam.zoomAt(1.4, null, null, true); else if (z === 'out') cam.zoomAt(1 / 1.4, null, null, true); else if (z === 'fit') cam.fit(); else if (z === 'one') cam.actual(); else if (z === 'up') up(); else if (z === 'flow') setFlow(!stage.classList.contains('flowing')); else if (z === 'add') addAt(cam.s.cx, cam.s.cy); });
  setFlow(options.flow ?? !reducedMotion(), false); // the default, or the host's: not saved as the page reader's choice

  // the stage changes size with its container: keep the zoom, refit only an untouched view (no ResizeObserver, as in
  // jsdom: the view is fitted once)
  let rz;
  const ro = typeof ResizeObserver === 'function' && new ResizeObserver(() => { if (!cam || dead) return; cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (dead) return; if (!cam.touched) cam.set(startView()); else cam.apply(); if (sel && sel.type === 'node' && geo.byId[sel.id]) { const n = geo.byId[sel.id]; cam.reveal({ x: n.x, y: n.y, w: n.w, h: n.h }); } }); });
  if (ro) ro.observe(stage);

  /* the picture as a file: CSS variables resolved into attributes so it stands alone. It is drawn at rest: no
     selection, hover, flow animation or edit handles, whatever the screen shows; the screen is left as it was. */
  function standalone(scale = 1, vid = cur, fontCSS = '') {
    if (settle) settle(); // an export right after update() draws where things end up, not mid-ease
    if (!svg || !geo || vid == null) return ''; // a model with no views draws nothing
    let s = svg, g = geo, off = null;
    if (vid !== cur) { // another view: drawn off screen, inside the shadow root so the same styles apply
      const v = ctx.V[vid]; if (!v || !(v.nodeIds || []).some(i => ctx.N[i])) return '';
      const c = pic(vid);
      off = document.createElement('div'); off.style.cssText = 'position:absolute;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none';
      off.innerHTML = c.markup; stage.parentNode.appendChild(off); s = off.querySelector('svg'); s.classList.add('map-svg'); g = c.g;
    }
    if (off) { const mine = layers.get('lens'), L = mine && arrOf(ctx.D.lenses).find(x => x && x.id === lensId); // the host's marks, on another view too (#63), and the lens as it lights that view
      if (L) layers.set('lens', lensOf(ctx, vid, L).layer); drawMarks(s, g, vid); if (L) layers.set('lens', mine); }
    const s0 = sel, flowing = stage.classList.contains('flowing'), hov = [...svg.querySelectorAll('.hov')], kon = [...svg.querySelectorAll('.key-on')];
    sel = null; paint(); stage.classList.remove('flowing'); hov.forEach(x => x.classList.remove('hov')); kon.forEach(x => x.classList.remove('key-on')); stage.classList.add('um-still');
    const clone = s.cloneNode(true), b = g.bounds;
    const src = s.querySelectorAll('*'), dst = clone.querySelectorAll('*');
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'visibility'];
    const unvar = (t, cs) => t.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (m, n, f) => cs.getPropertyValue(n).trim() || (f || '').trim());
    try { src.forEach((el, i) => { const cs = getComputedStyle(el), d = dst[i];
      [...d.attributes].forEach(a => { if (a.value.includes('var(')) d.setAttribute(a.name, unvar(a.value, cs)); });
      props.forEach(p => { const v = cs.getPropertyValue(p); if (v) d.style.setProperty(p, v); });
      if (cs.textTransform === 'uppercase' && !d.childElementCount) d.textContent = d.textContent.toUpperCase(); }); } // tab text, as drawn
    finally { stage.classList.remove('um-still'); hov.forEach(x => x.classList.add('hov')); kon.forEach(x => x.classList.add('key-on')); if (flowing) stage.classList.add('flowing'); sel = s0; paint(); if (off) off.remove(); }
    clone.querySelectorAll('title, .flowline, .um-edit, .um-ghost, .um-link, .keys, .um-key, .um-trip').forEach(t => t.remove());
    clone.setAttribute('role', 'img'); clone.querySelectorAll('[tabindex], [aria-pressed]').forEach(t => ['tabindex', 'role', 'aria-pressed'].forEach(a => t.removeAttribute(a)));
    clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`); clone.setAttribute('width', b.w * scale); clone.setAttribute('height', b.h * scale);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, fill: getComputedStyle(stage).backgroundColor }).forEach(([k2, v]) => bg.setAttribute(k2, v));
    clone.insertBefore(bg, clone.firstChild.nextSibling);
    if (fontCSS) { const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = fontCSS; clone.insertBefore(st, clone.firstChild); } // the host's own @font-face rules, carried into the file
    return new XMLSerializer().serializeToString(clone);
  }

  /* the time-lapse (#67): an update that redraws the view eases into it. Cards that moved glide from where they were; new
     cards, and lines whose route changed, fade in; cards and lines that left fade out where they were, copied from the
     picture before (as nothing that can be clicked, focused, found or exported). CSS on the new picture only: the
     geometry is the update's own. Nothing moves under reduced motion. */
  let settle = null; // ends an ease still running (before an export, or the next update)
  function easeIn(oldGeo, oldSvg) {
    if (settle) settle();
    if (options.ease === false || still() || !oldGeo || !oldSvg || !geo || !svg || oldSvg === svg) return;
    const T = 600, moves = [], key = e => edgeRefIds(e).join(' ') || e.from + '>' + e.to, all = (s, q) => [...s.querySelectorAll(q)];
    const was = new Map(oldGeo.nodes.map(n => [n.id, n])), now = new Set(geo.nodes.map(n => n.id));
    const lines = new Map(oldGeo.edges.map((e, i) => [key(e), [e, i]])), kept = new Set(geo.edges.map(key));
    geo.nodes.forEach(n => { const g = svg.querySelector(`.node[data-id="${CSS.escape(n.id)}"]`), o = was.get(n.id); if (!g) return;
      if (!o) moves.push([g, 'opacity', '0', 0]);
      else if (o.x !== n.x || o.y !== n.y) moves.push([g, 'transform', `translate(${o.x - n.x}px, ${o.y - n.y}px)`, 0]); });
    geo.edges.forEach((e, i) => { const o = lines.get(key(e)); if (o && canon(o[0].pts) === canon(e.pts)) return;
      all(svg, `.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(x => moves.push([x, 'opacity', '0', T / 2])); });
    const gone = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gone.setAttribute('class', 'um-leaving'); gone.setAttribute('aria-hidden', 'true'); gone.style.pointerEvents = 'none';
    const leave = x => { const c = x.cloneNode(true);
      [c, ...c.querySelectorAll('*')].forEach(y => { ['tabindex', 'role', 'data-id', 'data-i', 'data-from', 'data-to', 'data-o', 'data-t', 'data-chip', 'data-badge', 'data-edges'].forEach(a => y.removeAttribute(a)); y.classList.remove('node', 'edge-g', 'e-lab', 'sel', 'hot', 'hov', 'key-on'); }); // a port's data-edges named lines the new picture may lack
      gone.appendChild(c); };
    oldGeo.nodes.forEach(n => { if (!now.has(n.id)) all(oldSvg, `.node[data-id="${CSS.escape(n.id)}"]`).forEach(leave); });
    lines.forEach(([, i], k) => { if (!kept.has(k)) all(oldSvg, `.edge-g[data-i="${i}"], .e-lab[data-i="${i}"]`).forEach(leave); });
    if (!moves.length && !gone.childNodes.length) return;
    svg.appendChild(gone);
    moves.forEach(([el, p, v]) => { el.style.transition = 'none'; el.style.setProperty(p, v); });
    svg.getBoundingClientRect(); // the start, drawn: each change below is a transition from it
    moves.forEach(([el, p, , d]) => { el.style.transition = `${p} ${T}ms ease ${d}ms`; el.style.removeProperty(p); });
    gone.style.transition = `opacity ${T / 2}ms ease`; gone.style.opacity = '0';
    const t = later(() => settle && settle(), T * 2);
    settle = () => { clearTimeout(t); timers.delete(t); moves.forEach(([el]) => el.style.removeProperty('transition')); gone.remove(); settle = null; };
  }

  function update(model2, relayout = false, unfolding = false) { // unfolding: the same model, a card unfolded or folded
    if (dead) return;
    if (!model2 || typeof model2 !== 'object' || Array.isArray(model2)) throw new TypeError(`umlimator: update(model) takes a map model, an object with nodes and views; it got ${model2 === null ? 'null' : Array.isArray(model2) ? 'an array' : typeof model2}`);
    // an identical model: nothing to redraw, unless it answers an edit (one that changed only a place)
    const json = modelText(model2), same = json !== UNREAD && json === modelText(current), own = relayout || unfolding; // own: the map drawing its own model again, no answer to an edit
    if (!own && !pending && same) return;
    // the model before or after a move an update applied (undo, redo): the cards go back where they were then
    const back = !own && !same && json !== UNREAD && [...moves].reverse().find(x => x.base === json || x.after === json);
    if (back) placed[back.view] = structuredClone(back.base === json ? back.before : back.then);
    // the edit waiting for this answer: its places if the model shows it, else none (it is dropped either way)
    const p = own ? null : pending, card = p && answered(p, model2, json);
    if (!own) pending = null;
    const use = card ? { view: p.view, hv: p.place ? { [card]: p.place } : {}, ex: p.exact || {} } : null, from = use && structuredClone(placed[p.view] || null);
    // a card E or Alt + click asked to unfold before its view was loaded unfolds once a model brings that view (#71)
    const brought = []; Object.entries(asked).forEach(([vid, m]) => m.forEach((c, nid) => { if (!arrOf(model2.views).some(v => v && v.id === c)) return;
      m.delete(nid); const l = expanded[vid] ||= []; if (!l.includes(nid)) { l.push(nid); if (vid === cur) brought.push(nid); } }));
    const old = ctx, keys = O(), wantNew = selectNew && !own, before = current;
    old.views.forEach(v => { keys[v.id] = relayout ? null : old.viewKey(v.id); });
    current = model2;
    ctx = mapContext(withPlaces(model2, use, before), { measure, kinds: !!P.kinds, prev: options.stableLayout === false ? null : old.planCache, expand: expanded, memos: relayout ? null : old.memos });
    Object.keys(expanded).forEach(v => { expanded[v] = ctx.unfolded[v] || []; }); // a card or inner view the model no longer has folds
    if (!own) selectNew = false;
    ctx.views.forEach(v => { const id = v.id; if (keys[id] == null || keys[id] !== ctx.viewKey(id)) return;
      if (id in old.planCache) ctx.planCache[id] = old.planCache[id];
      if (old.layoutCache[id]) ctx.layoutCache[id] = old.layoutCache[id];
      if (old.geoCache[id] && JSON.stringify(old.brokenIn(id)) === JSON.stringify(ctx.brokenIn(id))) ctx.geoCache[id] = old.geoCache[id]; }); // the same rules broken (#70)
    restory(); // the story shown takes this model's steps, or stops when the model has it no more
    if (!cur) { // nothing shown yet (a first model with no views): this model's first view is drawn
      const v0 = ctx.V[options.view] ? options.view : ctx.rootId;
      if (v0 && cam) { mount(v0); cam.set(startView()); cam.touched = false; emitSel(); emit('viewchange', { view: cur, from: null }); }
      return; }
    if (!ctx.V[cur]) { // the view shown is gone: the root, or the empty card of a model with no views
      const from = cur; mount(ctx.rootId ?? null); cam.set(startView()); cam.touched = false; emitSel(); if (cur) emit('viewchange', { view: cur, from }); return; }
    if (ctx.geoCache[cur] && keys[cur] === ctx.viewKey(cur)) { if (lensId != null) { relens(); drawMarks(); } if (pc) pc.chrome(); if (P.onMount) P.onMount(inner); return; } // this view's picture did not change (its lens or the views may have; the page reads the new model, issue 133)
    const keep = sel, keepMore = more, touched = cam.touched, prev = [geo, svg];
    mount(cur);
    if (touched) cam.set({}); else cam.set(startView());
    cam.touched = touched;
    // ponytail: the models' JSON, kept for 20 moves; a hash of them if models grow large enough for that to weigh
    if (use && p.view === cur && json !== p.base) { moves.push({ view: cur, base: p.base, after: json, before: from, then: structuredClone(placed[cur] || null) }); if (moves.length > 20) moves.shift(); }
    const box = brought.find(nid => (expanded[cur] || []).includes(nid));
    if (box) unfolded(box, true); // a card asked to unfold earlier: its box is selected
    else if (wantNew && use && p.op === 'add' && geo.byId[card]) select(nodeRef(card), { reveal: false }); // the card added, as the reader named it
    else { // the selection that is still drawn stays, and a select event comes only if it changed (unfolding: the caller says)
      if (keep && exists(keep)) { sel = keep; more = keepMore.filter(exists); paint(); }
      if (!unfolding) emitSel(); }
    if (!relayout) easeIn(...prev); // a font that came in late moves nothing on purpose: no ease
    touch();
  }

  function destroy() {
    if (dead) return;
    cancelGesture();
    dead = true; if (ro) ro.disconnect(); doc.removeEventListener('click', away, true); doc.removeEventListener('dblclick', away, true); cancelAnimationFrame(rz); stopStory();
    answer(false); endTrip(); // every promise settles: a move's setView() false, a tour's and a replay's done false
    timers.forEach(clearTimeout); timers.clear(); sleeping.forEach(wake => wake());
    if (cam) cam.stopAnimation();
    host.remove();
    clearTimeout(restT); camRest = camNow(); flushState(true); // a state listener hears destroyed: true, last, and where the camera stopped
    Object.keys(subs).forEach(k => delete subs[k]);
  }

  /* ---------- marks: overlay(), highlight(), tour() and replay() (#62, #63, #65) ----------
     The host's marks, drawn over the picture without touching the model: named layers, stacked in the order first set.
     Each mount draws them again, so they survive update() and setView(); a card or line the view doesn't show is ignored.
     toSVG() and toPNG() draw them too, at rest: they are the host's, like the model (the selection and hover are not). */
  const layers = new Map(), DIM = .2, clamp01 = x => Math.min(1, Math.max(0, +x || 0));
  const scopes = new Map(); // layer name -> the views it is about: a highlight's Refs name theirs, and it lights those only
  // a drawn line that stands for several edges takes the strongest of their marks: a pulsing one, then the most lit, then the fastest
  const strongest = ms => ms.filter(Boolean).sort((a, b) => (!!b.pulse - !!a.pulse) || ((b.level ?? 1) - (a.level ?? 1)) || ((b.speed ?? 1) - (a.speed ?? 1)))[0];
  function markOf(get, here, dims) { // one card's or line's mark over the layers here: each property from the latest that sets it, the lowest level
    let out = null;
    here.forEach(L => { const m = get(L); if (!m && !dims.has(L)) return; out ||= { level: 1 };
      if (m) for (const k in m) if (m[k] != null && k !== 'level') out[k] = m[k];
      out.level = Math.min(out.level, m ? clamp01(m.level ?? 1) : DIM); });
    return out;
  }
  const longest = pts => pts.slice(1).reduce((m, p, k) => Math.abs(p[0] - pts[k][0]) + Math.abs(p[1] - pts[k][1]) > Math.abs(m[1][0] - m[0][0]) + Math.abs(m[1][1] - m[0][1]) ? [pts[k], p] : m, [pts[0], pts[1]]);
  function drawMarks(s = svg, g = geo, vid = cur) {
    if (!s || !g) return;
    s.querySelectorAll('.um-rings, .um-marks, .um-glow').forEach(x => x.remove());
    s.querySelectorAll('.node[opacity], .edge-g[opacity], .e-lab[opacity]').forEach(x => x.removeAttribute('opacity'));
    s.querySelectorAll('.edge[style], .flowline[style]').forEach(x => x.removeAttribute('style'));
    s.querySelectorAll('.node[aria-description]').forEach(x => x.removeAttribute('aria-description'));
    s.querySelectorAll('[data-was]').forEach(x => { if (x.tagName === 'title') x.textContent = x.getAttribute('data-was'); else x.setAttribute('aria-label', x.getAttribute('data-was')); x.removeAttribute('data-was'); });
    // the layers about this view; one that dims dims only where it names something: on a view it names nothing of, nothing fades
    const named = [...layers].filter(([n]) => !scopes.has(n) || scopes.get(n).includes(vid)), here = named.map(([, L]) => L);
    const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined); // a host's layer is a plain object: a card named constructor is not lit by Object's
    const names = L => g.nodes.some(n => own(L.nodes, n.id)) || g.edges.some(e => edgeRefIds(e).some(x => own(L.edges, x)));
    let dims = new Set(here.filter(L => L.dim && names(L)));
    // a story's step dims alone (0.14.0): a layer that dimmed before the step keeps its marks but not its dimming, and one set
    // while the step shows dims in its place, so a step looks as it was told and what the reader lights later still shows
    const sl = layers.get('story'), at = n => dimAt.get(n) || 0;
    if (dims.has(sl)) dims = named.some(([n, L]) => L !== sl && dims.has(L) && at(n) > at('story')) ? new Set([...dims].filter(L => L !== sl)) : new Set([sl]);
    const markOf2 = get => markOf(get, here, dims);
    if (s === svg) stage.classList.toggle('um-lit', dims.size > 0);
    if (!here.length) return;
    const tone = t => 'var(--um-' + String(t || 'accent').replace(/[^\w-]/g, '') + ')', op = m => m.level < 1 ? ` opacity="${m.level}"` : '';
    const cards = Object.fromEntries([...s.querySelectorAll('.node')].map(x => [x.dataset.id, x]));
    let under = '', over = '';
    const look = lookIn(g);
    g.nodes.forEach(n => { const m = markOf2(L => own(L.nodes, n.id)), el = cards[n.id]; if (!m || !el) return;
      if (m.level < 1) el.setAttribute('opacity', m.level);
      const sh = (m.tone || m.pulse) && look(n); // a shape's ring: its outline, 5 px out (0.15.0)
      if (m.tone || m.pulse) under += `<g${op(m)}>${sh ? `<path d="${sh.S.out(sh, 5)}"` : `<rect x="${n.x - 5}" y="${n.y - 5}" width="${n.w + 10}" height="${n.h + 10}" rx="14"`} class="um-ring${m.pulse ? ' um-pulse' : ''}" stroke="${tone(m.tone)}"/></g>`;
      const b = m.badge == null ? null : badgesOf({ badges: [m.badge] })[0]; if (!b) return; // a tab after the card's own
      const L = look(n), ty = tabLine(n, L), w = b.text.toUpperCase().length * 6.4 + 10; // on the card's tab line, clear of a head and a folder's tab
      const x = tabAfter(n, L, w);
      over += `<g class="um-tab"${op(m)}><rect x="${x}" y="${ty - 8}" width="${w}" height="15" rx="4" fill="${toneOf(b)}"/><text x="${x + w / 2}" y="${ty + 3}" text-anchor="middle" class="tab-tx">${esc(b.text)}</text></g>`;
      el.setAttribute('aria-description', b.text); });
    const heads = (g.families || []).flatMap(f => [{ x: f.x + 8, y: f.y + 3, w: String(f.label || f.id).length * 6.6 + 8, h: 22 }, // a box's title, 11 px mono
      ...(f.tabs || []).map(t => ({ x: t.x, y: f.y - 8, w: t.w, h: 16 }))]); // and its tabs
    const pills = [], free = r => !g.nodes.some(n => hit(r, n, 8) || (n.tag && hit(r, n.tag, 2))) && !heads.some(h => hit(r, h, 2)) && !g.edges.some(o => o.lbl && hit(r, o.lbl, 2)) && !pills.some(p => hit(r, p, 2));
    g.edges.forEach((e, i) => { const m = markOf2(L => strongest(edgeRefIds(e).map(x => own(L.edges, x)))), eg = s.querySelector(`.edge-g[data-i="${i}"]`); if (!m || !eg) return;
      const path = eg.querySelector('.edge'), flows = eg.querySelectorAll('.flowline'); // a heavy line's two (svgOf)
      if (m.level < 1) [eg, s.querySelector(`.e-lab[data-i="${i}"]`)].forEach(x => x && x.setAttribute('opacity', m.level));
      if (m.tone || m.pulse) path.insertAdjacentHTML('beforebegin', `<path d="${path.getAttribute('d')}" class="um-glow${m.pulse ? ' um-pulse' : ''}" stroke="${tone(m.tone)}"/>`);
      if (m.dash) path.setAttribute('style', 'stroke-dasharray: 7 5');
      if (m.speed != null) flows.forEach(flow => flow.setAttribute('style', +m.speed > 0 ? `animation-duration: ${(2.4 / m.speed).toFixed(2)}s` : 'animation: none; opacity: 0'));
      if (m.label == null || m.label === '') return;
      // the pill takes the first place that covers no card, box title or tab, line label or pill before it (#81): under the
      // line's own label (else on its longest run), then a few places along the line. The view is not laid out again for
      // it, so with no room at any, its text goes in the line's tooltip and accessible name instead
      // ponytail: six places, and another line may lie under one; scan along the line if too few find room
      const t = String(m.label), w = sansW(t, 10, .92) + 14, L = e.lbl, [a, b] = longest(e.pts), len = lenOf(e.pts);
      const box = [L ? [L.x + L.w / 2, L.y + L.h + 10] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...[.5, .3, .7, .15, .85].map(f => along(e.pts, f * len))]
        .map(([x, y]) => ({ x: x - w / 2, y: y - 8, w, h: 16 })).find(free);
      if (!box) { const tt = eg.querySelector(':scope > title'), key = s.querySelector(`.line-key[data-i="${i}"]`);
        if (tt) { tt.setAttribute('data-was', tt.textContent); tt.textContent += '\n' + t; }
        if (key) { key.setAttribute('data-was', key.getAttribute('aria-label')); key.setAttribute('aria-label', key.getAttribute('aria-label') + ', ' + t); }
        return; }
      pills.push(box);
      over += `<g class="um-lab"${op(m)}><rect x="${box.x}" y="${box.y}" width="${w}" height="16" rx="8"${m.tone ? ` style="stroke: ${tone(m.tone)}"` : ''}/><text x="${box.x + w / 2}" y="${box.y + 11.5}" text-anchor="middle">${esc(t)}</text></g>`; });
    const cardsG = s.querySelector('.nodes');
    if (under && cardsG) cardsG.insertAdjacentHTML('beforebegin', `<g class="um-rings" aria-hidden="true">${under}</g>`);
    if (over) s.insertAdjacentHTML('beforeend', `<g class="um-marks" aria-hidden="true">${over}</g>`);
  }
  const dimAt = new Map(); let dimClock = 0; // layer name -> when it was last set (a story's step dims alone over older layers, see drawMarks)
  function overlay(name, layer, views = null) { // views: the views the layer is about (highlight()'s); none: every view
    if (dead || name == null) return;
    const n = String(name);
    if (layer == null) { layers.delete(n); dimAt.delete(n); } else { layers.set(n, layer); dimAt.set(n, ++dimClock); } // a Map keeps the order first set
    if (layer != null && views) scopes.set(n, views); else scopes.delete(n);
    drawMarks(); touch();
  }
  // the cards in a box, at any depth, on a view (an unfolded card's box too)
  const boxCards = (vid, id) => { const bs = ((ctx.V[vid] || {}).containers || []).filter(Boolean), out = new Set(), seen = new Set();
    const walk = b => { if (seen.has(b)) return; seen.add(b); const c = bs.find(x => x.id === b); if (!c) return; (c.nodeIds || []).forEach(i => out.add(i)); bs.filter(x => x.parent === b).forEach(x => walk(x.id)); };
    walk(id); return out; };
  /* the 'highlight' layer (or another, `name`: a story step's 'story', the MCP page's 'mcp'): these cards and lines lit, the
     rest dimmed; a Ref's level (0 to 1), else its distance, fades it. A box's Ref lights its cards and the lines between
     them; Refs that name their view light that view only */
  function highlight(refs, name = 'highlight') {
    if (refs == null) return overlay(name, null);
    const L = { nodes: idTable(), edges: idTable(), dim: true }, lv = r => clamp01(r.level ?? (r.distance > 0 ? Math.max(.45, 1 - .15 * r.distance) : 1));
    const lit = (o, x, r) => { o[x] = { level: Math.max(lv(r), (o[x] || {}).level || 0) }; }, list = [].concat(refs).filter(Boolean);
    list.forEach(r => { const id = r.type === 'node' ? r.id : r.node, box = r.type === 'container' ? r.id : r.container; // a chip or badge: its card, or its box
      if (id != null) lit(L.nodes, id, r);
      else if (r.type === 'edge') (r.ids || []).forEach(x => lit(L.edges, x, r));
      else if (box != null) { const vid = r.view ?? cur, ins = boxCards(vid, box), at = x => ins.has(x) || x === box;
        ins.forEach(x => lit(L.nodes, x, r));
        if (ctx.V[vid]) ctx.viewEdges(ctx.V[vid]).forEach(e => { if (at(e.from) && at(e.to) && e._id) lit(L.edges, e._id, r); }); } });
    const views = list.every(r => typeof r.view === 'string') ? [...new Set(list.map(r => r.view))] : null;
    overlay(name, L, views);
  }
  /* lenses (#94): one of the model's saved ways to look at the map, as the 'lens' layer, on every view it is shown on; the
     view is not laid out again. A lens that colours cards by owner puts their tones in a legend over the controls. */
  let lensId = null;
  function relens() {
    const L = lensId == null ? null : arrOf(ctx.D.lenses).find(x => x && x.id === lensId), was = q('.um-lens');
    if (was) { was.remove(); clear = null; }
    if (!L) { const had = lensId != null; lensId = null; layers.delete('lens'); if (had) emit('lens', { lens: null }); return; } // off, or the model no longer has it: the lens event says so
    if (!cur || !ctx.V[cur]) return;
    const { layer, owners } = lensOf(ctx, cur, L), name = esc(labelOr(L.title, L.id));
    layers.set('lens', layer);
    if (owners.length) { q('.mctl').insertAdjacentHTML('afterbegin', `<div class="um-lens" role="group" aria-label="${name}"><b>${name}</b>${owners.map(([o, t]) => `<span><i style="border-color:var(--um-${t})"></i>${esc(o)}</span>`).join('')}</div>`); clear = null; }
  }
  function setLens(id) { // true when the model has that lens (or id is null)
    if (dead || (id != null && !arrOf(ctx.D.lenses).some(x => x && x.id === id))) return false;
    const was = lensId; lensId = id ?? null; if (lensId != null) dimAt.set('lens', ++dimClock); relens(); drawMarks(); if (lensId !== was) emit('lens', { lens: lensId });
    if (cam && geo && !cam.touched) cam.set(startView()); // fitted: the cards keep clear of the legend, as of the controls
    return true;
  }
  /* a dot that rides the map: a tour along a path the host names, or a trace replayed. One at a time; a new picture of the
     view (setView, an update that redraws it) ends it, as does destroy() */
  let trip = null;
  // a tour's or a replay's dots: over the lines and boxes, under the cards (as the model's own tour), so a dot goes into
  // a card and out at its next line rather than across the card's name
  function tripLayer() {
    const cards = svg.querySelector(':scope > .nodes');
    (cards || svg).insertAdjacentHTML(cards ? 'beforebegin' : 'beforeend', '<g class="um-trip" aria-hidden="true"></g>');
    return cards ? cards.previousElementSibling : svg.lastElementChild;
  }
  function endTrip(played = false) { const t = trip; if (!t) return; trip = null; cancelAnimationFrame(t.raf); if (t.dot) t.dot.remove(); t.end(played); touch(); }
  function startTrip(step, end) { // step(ms played, pauses left out) says whether to go on
    endTrip();
    const t = { raf: 0, dot: null, paused: false, at: 0, last: performance.now(), end }; trip = t;
    const frame = now => { if (trip !== t) return; if (dead) return endTrip(); if (!t.paused && !paused && !(t.story && story && story.held)) t.at += now - t.last; t.last = now; // paused: the page's Pause; held: a story's step's tour, by its own pause
      if (step(t.at)) t.raf = requestAnimationFrame(frame); else endTrip(true); };
    t.raf = requestAnimationFrame(frame);
    return t;
  }
  const lineBetween = (a, b) => { let i = geo.edges.findIndex(e => e.from === a && e.to === b); if (i < 0) i = geo.edges.findIndex(e => e.from === b && e.to === a); // either way
    if (i < 0) return null; const pts = drawnPts(geo.edges[i], looker()); // as drawn: into a shape at its outline (0.15.0)
    return { i, pts: geo.edges[i].from === a ? pts : [...pts].reverse() }; };
  const lenOf = pts => pts.slice(1).reduce((s, p, k) => s + Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]), 0);
  const along = (pts, d) => { for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || k === pts.length - 1) { const f = l ? Math.min(1, d / l) : 1; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; } d -= l; } return pts[0]; };
  /* tour(path): the dot rides the line between each pair of cards in turn, through each card to its next line, and each
     card it reaches flashes; where no line joins two cards it skips to the next. Resolves true when it reaches the end. */
  function tour(path, o = {}, quiet = false) { // quiet: a story's step, whose caption says it
    endTrip();
    if (dead || !geo || path == null) return Promise.resolve(false);
    const ids = [].concat(path).map(String).filter(id => geo.byId[id]), legs = [];
    for (let k = 0; k + 1 < ids.length; k++) { const r = lineBetween(ids[k], ids[k + 1]); if (!r) continue;
      const prev = legs[legs.length - 1], n = geo.byId[ids[k]];
      const through = prev && prev.to === ids[k] ? [prev.pts[prev.pts.length - 1], [n.x + n.w / 2, n.y + n.h / 2]] : [], pts = [...through, ...r.pts];
      // skip: the part through the card, where the dot rides under it and can't be seen
      legs.push({ pts, to: ids[k + 1], len: lenOf(pts), skip: through.length ? lenOf([...through, r.pts[0]]) : 0, from: ids[k], i: r.i }); }
    if (legs.length && still() && P.tourAt == null) atRest(legs, quiet);
    if (!legs.length || (still() && P.tourAt == null)) return Promise.resolve(legs.length > 0);
    const speed = Math.max(20, +o.speed || 240); // map units a second
    const g = tripLayer(); g.insertAdjacentHTML('beforeend', '<circle r="5.5" class="tour-dot"/>');
    const dot = g.firstElementChild; let leg = 0, base = 0;
    if (P.tourAt != null) { // the page's #shot=1&at=<0 to 1>: the dot held that far along the ride, a frame for umlimator.py record (#83)
      // spread over the lines only: a frame inside a card would show no dot (it rides under the cards)
      const seen = l => l.len - l.skip;
      let d = clamp01(P.tourAt) * legs.reduce((s, l) => s + seen(l), 0); while (leg < legs.length - 1 && d > seen(legs[leg])) d -= seen(legs[leg++]);
      const [x, y] = along(legs[leg].pts, legs[leg].skip + d); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      trip = { raf: 0, dot: g, end() {} }; return Promise.resolve(true);
    }
    return new Promise(res => { startTrip(ms => { const d = ms * speed / 1000;
      while (leg < legs.length && d - base >= legs[leg].len) { base += legs[leg].len; flash(legs[leg].to); leg++; }
      if (leg >= legs.length) return false;
      const [x, y] = along(legs[leg].pts, d - base); dot.setAttribute('cx', x); dot.setAttribute('cy', y); return true; }, res); trip.dot = g; trip.kind = 'tour'; trip.story = quiet; touch(); });
  }
  // under reduced motion no dot rides: the path is lit at rest instead, its cards ringed and numbered in turn and its lines
  // glowing (the 'tour' layer, which nothing dims), and the live region says it; it stays until the trip slot is taken
  function atRest(legs, quiet) {
    const L = { nodes: idTable(), edges: idTable() }, order = [];
    legs.forEach(l => { [l.from, l.to].forEach(id => { if (!L.nodes[id]) { order.push(id); L.nodes[id] = { tone: 'accent', badge: String(order.length) }; } });
      edgeRefIds(geo.edges[l.i]).forEach(x => { L.edges[x] = { tone: 'accent' }; }); });
    overlay('tour', L); trip = { kind: 'path', raf: 0, dot: null, end() { overlay('tour', null); } };
    if (!quiet) say('Tour: ' + order.map(nameOf).join(' → '));
  }
  /* replay(spans): each call from one card to another (a span and its parent's) runs along their line at the trace's relative
     time, the whole trace in `duration` ms; the line glows while the call lasts and keeps its duration as a label */
  let replays = 0; // the newest replay's number: an older one's stop() leaves the newer one's marks alone
  function replay(spans, o = {}) {
    if (dead) return { hops: 0, skipped: 0, done: Promise.resolve(false), pause() {}, resume() {}, stop() {} };
    endTrip(); overlay('replay', null);
    const gen = ++replays;
    const list = [].concat(spans || []).filter(s => s && Number.isFinite(+s.start) && Number.isFinite(+s.end));
    const byId = new Map(list.map(s => [String(s.id), s])), cardOf = cardMatcher(geo ? geo.nodes : [], o.match);
    let skipped = 0, t = null, done; const hops = [];
    list.forEach(s => { const to = cardOf(s.service); if (!to) return skipped++;
      const p = s.parent != null ? byId.get(String(s.parent)) : null, from = p && cardOf(p.service);
      if (!from || from === to) return; // a root span, a caller off the view, or work inside one card: no hop
      const r = lineBetween(from, to); if (!r) return skipped++; // a call the view draws no line for
      hops.push({ ...r, ids: edgeRefIds(geo.edges[r.i]), at: +s.start, dur: +s.end - +s.start, to, len: lenOf(r.pts) }); });
    const ctl = { hops: hops.length, skipped, done: new Promise(r => { done = r; }),
      pause() { if (t && trip === t) { t.paused = true; touch(); } }, resume() { if (t && trip === t) { t.paused = false; touch(); } },
      stop() { if (t && trip === t) endTrip(); else if (gen === replays) overlay('replay', null); } };
    const ms = msText, marks = O();
    // ponytail: two calls at once on one line share its mark; the one that ends first takes the glow off
    const show = (h, on) => { h.ids.forEach(x => { marks[x] = on ? { label: ms(h.dur), tone: 'accent', pulse: true } : { label: ms(h.dur) }; }); overlay('replay', { edges: { ...marks } }); };
    if (!hops.length || still()) { hops.forEach(h => show(h, false)); done(hops.length > 0); return ctl; }
    const t0 = Math.min(...list.map(s => +s.start)), k = (+o.duration || 6000) / Math.max(1e-6, Math.max(...list.map(s => +s.end)) - t0);
    hops.forEach(h => { h.start = (h.at - t0) * k; h.end = h.start + h.dur * k; h.travel = Math.min(1200, Math.max(350, h.dur * k)); });
    const total = Math.max(...hops.map(h => Math.max(h.end, h.start + h.travel)));
    const g = tripLayer();
    t = startTrip(now => { hops.forEach(h => {
      if (!h.on && now >= h.start) { h.on = true; show(h, true); g.insertAdjacentHTML('beforeend', '<circle r="4.5" class="tour-dot"/>'); h.dot = g.lastElementChild; }
      if (h.dot) { const f = (now - h.start) / h.travel; if (f >= 1) { h.dot.remove(); h.dot = null; flash(h.to); } else { const [x, y] = along(h.pts, f * h.len); h.dot.setAttribute('cx', x); h.dot.setAttribute('cy', y); } }
      if (h.on && !h.off && now >= h.end) { h.off = true; show(h, false); } });
      return now < total; }, played => { if (!played) overlay('replay', null); done(played); });
    t.dot = g; t.kind = 'replay'; touch();
    return ctl;
  }

  /* ---------- stories (#69): the model's narrated walk-throughs, played step by step ----------
     A step sets the whole picture: its view, camera, selection, highlight and caption (what it leaves out is cleared),
     then plays its tour. Playing goes on by itself after each step's duration; the caption bar and the keys (← → PageUp
     PageDown, Esc) step through and stop it. One story at a time.
     The player's state (0.14.0): entering a step (its view, camera, selection and highlight on their way), then playing or
     paused on it, until ended or stopped. A story event comes on each of these changes. The reader taking the map (a press,
     a key, a view or a selection the story didn't make) pauses it; a step lights its own layer, 'story'. */
  let story = null;
  const stepsOf = s => s && Array.isArray(s.steps) ? s.steps.filter(x => x && typeof x === 'object') : [];
  // the story event, on every change: a step entered, a pause or a resume (playing), the end (step null), destroy() too
  const storyEvent = st => emit('story', { story: st.s.id, step: story === st ? st.at : null, steps: st.steps.length, playing: story === st && !!st.auto }, dead);
  // a step's card or line: a string names a card of the view, else a line by its id (the drawn line that has it); an
  // object is a Ref already
  const stepRef = x => typeof x !== 'string' ? (x && typeof x === 'object' ? x : null) : geo.byId[x] ? nodeRef(x)
    : (e => e ? edgeRef(e) : null)(geo.edges.find(e => edgeRefIds(e).includes(x)));
  function stepLit(list) { // highlight: what it names, and every line between two cards it names
    const refs = [].concat(list || []).map(stepRef).filter(Boolean), ids = new Set(refs.filter(r => r.type === 'node').map(r => r.id));
    geo.edges.forEach(e => { if (ids.has(e.from) && ids.has(e.to)) refs.push(edgeRef(e)); });
    return refs.length ? refs : null;
  }
  function storyBar(st) {
    let bar = stage.querySelector('.um-story');
    if (!bar) {
      stage.insertAdjacentHTML('beforeend', `<div class="um-story" role="group"><div class="um-cap"><span class="um-st"></span><p></p></div><div class="um-sb">
        <button data-s="prev" title="Previous step (←)" aria-label="Previous step">‹</button><button data-s="play"></button><button data-s="next" title="Next step (→)"></button><button data-s="stop" title="Close (Esc)" aria-label="Close the story">✕</button></div></div>`);
      bar = stage.lastElementChild; clear = null; // the fit keeps the cards off the bar as it does off the controls
      bar.addEventListener('dblclick', e => e.stopPropagation()); // two quick clicks on › are two steps, not a zoom
      bar.addEventListener('click', e => { e.stopPropagation(); const s = story, b = e.target.closest('button'); if (!s || !b) return;
        ({ prev: () => stepStory(-1), next: () => stepStory(1), stop: () => stopStory(), play: () => s.auto ? s.ctl.pause() : s.ctl.resume() })[b.dataset.s](); });
    }
    const k = st.at, n = st.steps.length, b = s => bar.querySelector(`[data-s="${s}"]`);
    bar.setAttribute('aria-label', 'Story: ' + labelOr(st.s.title, st.s.id));
    bar.querySelector('.um-st').textContent = `${labelOr(st.s.title, st.s.id)} · ${k + 1} / ${n}`;
    bar.querySelector('p').textContent = (st.steps[k] || {}).caption || '';
    if (k <= 0) b('prev').setAttribute('aria-disabled', 'true'); else b('prev').removeAttribute('aria-disabled'); // off, and focusable still: a focused ‹ keeps the focus
    b('play').textContent = st.auto ? '❚❚' : '▶'; b('play').setAttribute('aria-label', st.auto ? 'Pause' : 'Play'); b('play').title = st.auto ? 'Pause' : 'Play';
    b('next').textContent = k + 1 < n ? '›' : '✓'; b('next').setAttribute('aria-label', k + 1 < n ? 'Next step' : 'Finish the story');
  }
  async function showStep(st, k) {
    const seq = ++st.seq, step = st.steps[k] || {}, live = () => story === st && st.seq === seq && !dead;
    st.at = k; st.phase = 'entering'; clearTimeout(st.timer); tour(null); storyBar(st);
    storyEvent(st); // before the step's own select and viewchange
    while (busy && live()) await new Promise(r => setTimeout(r, 30)); // a move the user started: let it land first
    if (!live()) return;
    if (step.view !== cur && ctx.V[step.view]) await go(step.view, { story: true });
    if (!live()) return;
    if (ctx.V[step.view] && step.view !== cur) { st.phase = 'left'; touch(); return; } // the reader went elsewhere on the way: the step waits, paused, for resume()
    if ((expanded[cur] || []).length) { expanded[cur] = []; update(current, false, true); } // a step sets the whole picture: what the reader unfolded here folds back first
    const c = step.camera && typeof step.camera === 'object' ? step.camera : null;
    const aim = () => { const n = c && c.card != null ? geo.byId[c.card] : null; // the step's camera, on the picture as it is now
      return n ? { cx: n.x + n.w / 2, cy: n.y + n.h / 2, k: +c.zoom || 1.5 }
        : c && Number.isFinite(+c.x) && Number.isFinite(+c.y) ? { cx: +c.x, cy: +c.y, k: +c.zoom || cam.s.k } : startView(); }; // 'fit', or none
    const moved = cam.animate(aim()); cam.touched = !!(c && (geo.byId[c.card] || Number.isFinite(+c.x)));
    select(step.select == null ? null : stepRef(step.select), { reveal: false, story: true });
    highlight(stepLit(step.highlight), 'story');
    say(`Step ${k + 1} of ${st.steps.length}${step.caption ? ': ' + step.caption : ''}`); // after select(), which says what it selected
    if (await moved === false && live() && st.taken !== seq) await cam.animate(aim()); // cut short, not by the reader (an update()): the step gets its framing still
    if (!live()) return;
    st.phase = 'shown'; touch();
    st.toured = step.tour ? tour(step.tour, {}, true) : Promise.resolve(true);
    arm(st);
  }
  function arm(st) { // playing: the next step once this one's duration is up and its tour has reached its end
    clearTimeout(st.timer);
    if (!st.auto || story !== st || st.phase !== 'shown' || paused) return; // entering: it arms once shown; the page's Pause: once it ends
    const seq = st.seq, dur = Math.max(500, +(st.steps[st.at] || {}).duration || 4000); // reading time: not cut by reduced motion
    Promise.all([st.toured, new Promise(r => { st.timer = later(r, dur); })]).then(() => { if (story === st && st.seq === seq && st.auto && !paused) stepStory(1); });
  }
  function pauseStory(st) { st.auto = false; st.held = true; clearTimeout(st.timer); storyBar(st); storyEvent(st); touch(); } // held: its step's tour waits too (startTrip)
  // the reader (or the host) took the map, by a press, a key, or a view or selection the story didn't make: a story playing waits
  function readerMoved() { const st = story; if (!st) return; st.taken = st.seq; if (st.auto) pauseStory(st); }
  stage.addEventListener('pointerdown', e => { if (!e.target.closest('.um-story')) readerMoved(); }, true); // not the bar's own buttons
  stage.addEventListener('wheel', e => { if (!ctrlWheel || e.ctrlKey || e.metaKey || stage.classList.contains('full')) readerMoved(); }, { capture: true, passive: true }); // a wheel that zooms (wheel: 'ctrl' leaves the rest to the page)
  function restory() { // update(): the story shown takes the model's steps, at the step it is on, or stops when the model has it no more
    const st = story; if (!st) return;
    const s = arrOf(ctx.D.stories).find(x => x && x.id === st.s.id), steps = stepsOf(s); // the model as mapContext reads it: no text String() throws on (audit 20)
    if (!steps.length) return stopStory();
    const was = JSON.stringify(st.steps[st.at]), k = Math.min(st.at, steps.length - 1);
    st.s = s; st.steps = steps;
    if (st.phase !== 'left' && (k !== st.at || JSON.stringify(steps[k]) !== was)) showStep(st, k); // its step changed: shown again, as it is now
    else { st.at = k; storyBar(st); touch(); } // the same step (or one the reader left: the bar keeps within the model's steps)
  }
  function stepStory(d) {
    const st = story; if (!st) return;
    const k = st.at + d;
    if (k >= st.steps.length) return stopStory(true); // past the last step: the story has been told
    if (k >= 0) showStep(st, k);
  }
  function stopStory(told = false) {
    const st = story; if (!st) return;
    story = null; st.told = told; clearTimeout(st.timer); tour(null); highlight(null, 'story');
    const bar = stage.querySelector('.um-story');
    if (bar) { const back = bar.contains(root.activeElement); bar.remove(); clear = null; if (back && !dead) stage.focus({ preventScroll: true }); } // focus on the bar stays in the map
    if (!dead) say(told ? 'End of the story' : 'Story closed');
    storyEvent(st); touch(); // destroy() too: a listener hears the end
    st.end(told);
  }
  function storyKey(e) { // null: not a story's key; on the bar's own buttons, Enter and Space press them
    const k = e.key;
    if ((k === 'Enter' || k === ' ') && e.composedPath().some(x => x.classList && x.classList.contains('um-story'))) return false;
    const d = { ArrowLeft: -1, PageUp: -1, ArrowRight: 1, PageDown: 1 }[k];
    if (d) { stepStory(d); return true; }
    if (k === 'Escape') { stopStory(); return true; }
    return null;
  }
  function play(id, o = {}) {
    if (id == null) { stopStory(); return null; } // play(null): the story shown stops
    const s = ctx && arrOf(ctx.D.stories).find(x => x && x.id === id), steps = stepsOf(s); // as mapContext reads it (audit 20)
    if (dead || !geo || !steps.length) return null; // a story the model lacks: the one shown plays on
    stopStory();
    let end; const st = { s, steps, at: -1, seq: 0, timer: 0, auto: o.auto !== false, phase: 'entering', told: false, toured: Promise.resolve(true), done: new Promise(r => { end = r; }) };
    st.end = end;
    st.ctl = { get story() { return st.s.id; }, get step() { return st.at; }, get steps() { return st.steps.length; }, get playing() { return st.auto && story === st; },
      get state() { return story !== st ? (st.told ? 'ended' : 'stopped') : st.phase === 'entering' ? 'entering' : st.auto ? 'playing' : 'paused'; },
      next() { if (story === st) stepStory(1); }, prev() { if (story === st) stepStory(-1); }, stop() { if (story === st) stopStory(); },
      pause() { if (story === st && st.auto) pauseStory(st); },
      resume() { if (story !== st || st.auto) return; st.auto = true; st.held = false; storyBar(st); storyEvent(st); touch(); if (st.phase === 'left') showStep(st, st.at); else arm(st); }, done: st.done };
    story = st;
    showStep(st, Math.max(0, Math.min(steps.length - 1, Math.floor(+o.step) || 0)));
    return st.ctl;
  }

  /* a typed view of a version 2 model (1.7): its gestures emit `edit`, a transaction of commands, and its panels show.
     Its hooks read the model as it is drawn, through unreadable(), once for each model: a value String() throws on is left
     out, as mapContext leaves it out (audit 21: F2 on one transition threw when another's trigger was {"toString": 1}) */
  // a typed view's pin (a drag, Alt + arrows) is written to the view's layout by the host: it waits for the answer as a map's move
  // does, so an update back to the model before it (undo) puts every card back where it was (audit 33: the card stayed at its drop)
  const pinOf = cs => { const c = cs.length === 1 && cs[0], at = c && c.op === 'set' && Array.isArray(c.path) && c.path.length === 2 && c.path[0] === 'layout' && c.value;
    if (!Array.isArray(at) || at.length !== 2 || !at.every(Number.isFinite) || typeof c.path[1] !== 'string' || (c.view ?? cur) !== cur) return null;
    const v = viewIn(current, cur);
    return { op: 'set', typed: true, view: cur, card: c.path[1], place: [at[0], at[1]], exact: null, label: '', ids: arrOf(v.nodeIds), to: undefined, base: modelText(current), at: jsonText((v.layout || {})[c.path[1]] ?? null) }; };
  let readFor, readAs; const drawnModel = () => { if (readFor !== current) { readFor = current; readAs = unreadable(current).model; } return readAs; };
  const tx = E && typedEditor({ root, stage, can, say, status, touch, nearest, nameOf, editor, picked,
    emit: commands => { pending = pinOf(commands); emit('edit', { view: cur, commands }); }, view: () => cur, model: drawnModel, geo: () => geo, svg: () => svg, cam: () => cam, sel: () => sel,
    selectId: id => { const e = geo.byId[id] ? null : geo.edges.find(x => edgeRefIds(x).includes(id)); return select(e ? edgeRef(e) : idRef(id)); }, // a box: the outline's way to select one
    drawn: id => !!geo.byId[id] || geo.edges.some(x => edgeRefIds(x).includes(id)), rename: () => rename(sel), focus: () => focusMap() });
  const typed = () => !!tx && tx.on();

  // model: the host's, as given to render() or update(), which the page exports; ctx's D is the map's working copy (audit 29)
  const inner = { ctx: () => ctx, model: () => current, geo: () => geo, geoOf: vid => pic(vid).g, cam: () => cam, svg: () => svg, stage, host, go, open, up, flash, setFlow, pause, key, startView, standalone, play,
    select, boxHere, busy: () => busy, flowing: () => stage.classList.contains('flowing'), view: () => cur, unfold: gesture, lens: setLens,
    highlight, overlay, focus: focusMap, editable: !!E }; // a story's pointer is the pieces' own, from the story event (0.14.0)

  // the pieces a host asked for (#99): they follow the map's selection and views, and take their keys wherever the focus is
  // in the map (Enter and Space press their buttons; the map's other keys reach the canvas, as in the page)
  const frame = q('.um-frame'), pc = frame && pieces(() => inner, { tree: q('.outline'), legend: lg, panel: q('.panel') }, { frame, toggle: q('.um-navbtn'), layer: frame, status: tell || say });
  if (pc) {
    (subs.select ||= []).push(e => pc.select(e.target, e.targets)); (subs.viewchange ||= []).push(pc.unlight); (subs.story ||= []).push(pc.story);
    frame.addEventListener('keydown', e => { if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (pc.key(e) || (!stage.contains(e.target) && e.key !== 'Enter' && e.key !== ' ' && key(e))) { e.preventDefault(); e.stopPropagation(); } });
    if (options.nav) { q('.um-navbtn').addEventListener('click', () => pc.setTree(!frame.classList.contains('tree-open'))); pc.setTree(ctx.views.length > 1); }
  }
  const motionOf = () => instant ? 'instant' : reducedMotion() ? 'reduced' : 'full';
  const camNow = () => { const r = (x, d) => Math.round(x * d) / d; return cam ? { x: r(cam.s.cx, 10), y: r(cam.s.cy, 10), zoom: r(cam.s.k, 1000) } : { x: 0, y: 0, zoom: 1 }; };
  function snapshot(event = false) { // MapState: built fresh on every read, frozen all the way down, plain JSON; event: the camera at rest
    const deep = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deep(v)); return Object.freeze(o); }, st = story, t = trip;
    return deep({ view: cur, navigating: nav ? nav.to : null, selection: picked(), expanded: [...(expanded[cur] || [])], lens: lensId, overlays: [...layers.keys()],
      story: st ? { id: st.s.id, step: st.at, steps: st.steps.length, playing: !!st.auto } : null, tour: !!(t && t.kind === 'tour'), replay: t && t.kind === 'replay' ? { playing: !t.paused } : null, paused: !!paused,
      camera: event && camRest ? { ...camRest } : camNow(), flow: stage.classList.contains('flowing'), motion: motionOf(), gesture: gestureNow(), destroyed: dead });
  }
  const first = () => {
    if (dead) return;
    if (options.view != null && !ctx.V[options.view]) warn(`render(…, { view: "${options.view}" }): the model has no such view; it starts on ${ctx.rootId ? `"${ctx.rootId}"` : 'none'}`);
    if (!cam) { // a view shown already (a setView() before a deferred first draw) stays
      const v0 = ctx.V[options.view] ? options.view : ctx.rootId;
      mount(v0 ?? null); cam.set(startView()); cam.touched = false; // no views: the empty card, until an update() brings one
      if (v0 && options.select) select(options.select, { reveal: false });
    }
    if (cur && P.onReady) P.onReady();
  };
  if (P.defer) requestAnimationFrame(() => later(first, 16)); else first();
  camRest = camNow(); if (listensState()) lastState = snapshot(true); // the state event reports changes from here
  // the host's fonts may still be loading: measure again once they are in, and redraw
  if (measure && !own && document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (dead || !current || typeof current !== 'object') return; measure = hostMeasure(host); update(current, true); });

  return {
    update: m => { update(m); if (tx && !dead) tx.refresh(); },
    setView: id => go(id), // a Promise<boolean>: true once the view shows; false for a view the model lacks, a later request, or destroy()
    select: ref => { if (!dead) select(ref); },
    fit: () => { if (cam && !dead) { readerMoved(); cam.fit(); } }, // the host takes the camera: a story playing waits
    toSVG: (o = {}) => dead ? '' : standalone(o.scale ?? 1, o.view ?? cur, o.fontCSS),
    toPNG: (o = {}) => dead ? Promise.resolve(null) : pngOf(standalone(o.scale ?? 2, o.view ?? cur, o.fontCSS)),
    focus: ref => { if (!dead) focusMap(ref); },
    expand: id => setUnfold(id, true), // unfold a stacked card of the view shown in place (#71): true when it did
    collapse: id => setUnfold(id, false),
    get expanded() { return [...(expanded[cur] || [])]; },
    on(type, fn) { if (dead) return () => {}; if (type === 'state' && !listensState()) { camRest = camNow(); lastState = snapshot(true); } // a first state listener hears changes from now
      (subs[type] ||= []).push(fn); if (type === 'click') tabKeys();
      return () => { subs[type] = (subs[type] || []).filter(f => f !== fn); if (type === 'click' && !dead) tabKeys(); }; },
    get view() { return cur; },
    get selection() { return copyRef(sel); },
    get selected() { return picked(); },
    get state() { return snapshot(); }, // MapState (0.14.0): a fresh, frozen, JSON-serializable snapshot
    get navigating() { return nav ? nav.to : null; }, // the view a move is going to, while one is under way
    get destroyed() { return dead; },
    get flow() { return stage.classList.contains('flowing'); }, // the animated flow along lines (≋, F)
    set flow(on) { if (!dead) setFlow(!!on, false); }, // a host's choice, not the reader's: the page saves only ≋ and F
    get motion() { return motionOf(); }, // 'instant' (the page's #check, #still, #shot), 'reduced' (the reader's setting), else 'full'
    get story() { return story ? story.ctl : null; }, // the player of the story shown (play()'s, the page menu's or a link's), else null
    overlay: (name, layer) => overlay(name, layer),
    highlight: (refs, options) => highlight(refs, (options && options.layer) || 'highlight'),
    lens: id => setLens(id), // one of the model's lenses on the map, or null for none (#94): false when the model has no such lens
    tour: (path, o) => tour(path, o),
    replay: (spans, o) => replay(spans, o),
    play: (id, o) => play(id, o),
    destroy,
    [INNER]: inner,
  };
}
/* ================= the standalone page's pieces (#99): views list, legend, hint line, details panel =================
   mountPage draws all four in its page; render() draws those a host asks for (nav, legend, hints, details) around its
   canvas, in its shadow root. The hint line is hintHTML() and hinter(); pieces() draws the others from the map and acts
   on it. X() is render()'s inner handle; el: the views list's, legend's and details panel's elements (null: not drawn);
   o.page: the standalone page, which keeps the reader's choices in localStorage; o.frame takes the class tree-open while
   the views list is open, and o.toggle says so; o.layer holds an example's lightbox; o.status(text, ms) says what happened. */
const shortT = t => String(t ?? '').split(' · ')[0];
const hintHTML = (keys, ctrl) => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches ? '<span>pinch = zoom</span><span>drag = move</span><span>tap = details</span>'
  : `<span>${ctrl ? 'Ctrl + scroll' : 'scroll'} = zoom</span><span>drag = move</span><span>double-click ⤢ = open</span>${keys ? `<span>${keys} = search</span><span>? = keys</span>` : ''}`; // keys: the page's search key; ctrl: wheel 'ctrl'
function hinter(el, html) { // messages are said in a live region of their own, apart from the key hints (issue 134)
  let t; const live = document.createElement('div'); live.className = 'um-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); el.after(live);
  return (s, ms = 1800) => { el.textContent = live.textContent = s; el.classList.add('msg'); clearTimeout(t); t = setTimeout(() => { el.innerHTML = html; el.classList.remove('msg'); }, ms); }; }

// Pull concise points from captured prose; retain wording and keep the full point in its tooltip. A point is a sentence
// or a clause; one longer than a line (160 characters) is cut in two, but a short sentence stays whole (#97).
function detailBullets(body) {
  const normalized = String(body || '').replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '').replace(/\n+/g, ' ').trim();
  let parts = normalized.split(/(?<=[.!?])\s+(?=[A-Z`/])|;\s+|\s+[·|]\s+/).filter(Boolean);
  while (parts.some(p => p.length > 160) && parts.length < 4) {
    const index = parts.reduce((best, p, i) => p.length > (parts[best] || '').length ? i : best, 0), value = parts[index];
    if (!value || value.length < 8) break;
    const separators = [...value.matchAll(/:\s+|,\s+|\s+(?=then\b|with\b|before\b|after\b|once\b|to\b|and\b|or\b|during\b|by\b|whose\b|outside\b|on\b|for\b|as\b|whenever\b|into\b|in\b|from\b|when\b|includes\b|typed\b)/g)].map(m => m.index + m[0].length);
    const ticks = [0]; for (let i = 0; i < value.length; i++) ticks.push(ticks[i] + (value[i] === '`')); // backticks before each place, counted once (audit 25)
    const safe = i => ticks[i] % 2 === 0;
    const cuts = separators.filter(i => i >= 6 && i < value.length - 4 && safe(i));
    if (!cuts.length && parts.length < 2) for (const m of value.matchAll(/\s+/g)) if (m.index >= 6 && m.index < value.length - 4 && safe(m.index)) cuts.push(m.index); // a loop: a spread throws past ~120,000 (audit 25)
    const cut = cuts.sort((a, b) => Math.abs(a - value.length / 2) - Math.abs(b - value.length / 2))[0];
    if (!cut) break;
    parts.splice(index, 1, value.slice(0, cut).replace(/[,;:]\s*$/, '').trim(), value.slice(cut).trim());
  }
  if (parts.length > 4) parts = [...parts.slice(0, 3), parts.slice(3).join(' ')];
  return parts;
}

// what each shape stands for, in a legend (0.15.0)
const SHAPE_SAYS = { person: ['Person', 'someone who uses it'], browser: ['Browser app', 'runs in a web browser'], mobile: ['Mobile app', 'runs on a phone'],
  cylinder: ['Data store', 'a database or a store'], pipe: ['Queue', 'hands work on, in order'], document: ['File', 'a document or a config'],
  hexagon: ['Hexagon', 'a guard or a service'], robot: ['Agent', 'an AI agent'], terminal: ['Command line', 'a CLI or a script'],
  window: ['Desktop app', 'runs in a window'], folder: ['Package', 'a module or a folder of code'], node: ['Host', 'a machine or runtime it runs on'] };
const swatchOf = (sh, k, c, f, dashed) => { const n = { x: 0, y: 0, w: 100, h: 64 }, S = SHAPE[sh]; // a legend's key: the card's outline, small
  return `<svg class="lgs" viewBox="-4 -4 108 72" aria-hidden="true"><path d="${S.out(n)}" fill="${f}" stroke="${c}"${dashed ? ' stroke-dasharray="3 2"' : ''}/>${S.det ? S.det(n, c, k) : ''}</svg>`; };
function legendItems(gs, opens = 'double-click to open') { // what these pictures draw, each with what it means: the view's legend, and the PDF's (#93)
  const typedKeys = [...new Set(gs.flatMap(g => g.legend || []))]; // a typed view's type writes its own keys (1.9); its cards and lines are not a map's
  const ns = gs.flatMap(g => g.legend ? [] : g.nodes), es = gs.flatMap(g => g.legend ? [] : g.edges), used = [...new Set(ns.map(n => n.k))];
  // each card as its picture draws it: its shape and its dash (the legend draws what the map draws)
  const cards = gs.flatMap(g => g.legend ? [] : g.nodes.map(n => ({ k: n.k, sh: shapeOf(n, !!g.map), dash: !!g.map && n.k === 'external' })));
  const kindShape = k => { const s = [...new Set(cards.filter(d => d.k === k).map(d => d.sh))]; return s.length === 1 && s[0] !== 'box' && !(k === 'm-hook' && s[0] === 'hexagon') ? s[0] : null; };
  const dashOf = k => k === 'm-ext' || cards.some(d => d.k === k && d.dash); // an external card is dashed only where it is drawn so
  const order = ['m-public', 'm-step', 'm-lane', 'm-ext', 'm-verb', 'm-board', 'm-hook', 'm-script', 'frontend', 'backend', 'ai', 'queue', 'database', 'security', 'cloud', 'external', 'file'];
  const shape = k => k === 'm-verb' ? 'p' : dashOf(k) ? 'd' : k === 'm-hook' ? 'h' : '';
  const kinds = order.filter(k => used.includes(k)), own = new Set(kinds.map(kindShape).filter(Boolean)), tone = k => `var(--um-${KIND[k][0]})`;
  // a shape the kinds' keys don't show already: in a neutral outline, as colour is the kinds'
  const shapes = SHAPE_NAMES.filter(sh => sh !== 'box' && !own.has(sh) && cards.some(d => d.sh === sh && !(sh === 'hexagon' && d.k === 'm-hook')))
    .map(sh => `<span class="lgi" title="${esc(SHAPE_SAYS[sh].join(' — '))}">${swatchOf(sh, 'file', 'var(--um-muted)', 'var(--um-panel)')}<b>${SHAPE_SAYS[sh][0]}</b><span>${SHAPE_SAYS[sh][1]}</span></span>`);
  return kinds.map(k => `<span class="lgi" title="${esc(KIND[k][1] + ' — ' + KIND[k][2])}">${kindShape(k) ? swatchOf(kindShape(k), k, tone(k), `var(--um-${KIND[k][0]}-f)`, dashOf(k)) : `<i class="${shape(k)}" style="border-color:${tone(k)};background:var(--um-${KIND[k][0]}-f)${k === 'm-hook' ? `;background:${tone(k)}` : ''}"></i>`}<b>${KIND[k][1]}</b><span>${KIND[k][2]}</span></span>`)
    .concat(shapes)
    .concat(ns.some(n => n.kids || n.opens) ? [`<span class="lgi"><i class="s"></i><b>⤢ Stacked</b><span>${opens}</span></span>`] : [])
    .concat(ns.some(n => n.step) ? ['<span class="lgi"><i class="num">1</i><b>Step</b><span>run order</span></span>'] : [])
    .concat(ns.some(n => n.tag) ? ['<span class="lgi"><i class="tag"></i><b>@author</b><span>who wrote it</span></span>'] : [])
    .concat(WIRES.filter(w => es.some(e => e.wk === w[0])).map(w => `<span class="lgi"><i class="w" style="border-color:var(--um-w-${w[0]})"></i><b>${w[1]}</b><span>${w[2]}</span></span>`))
    .concat(es.some(e => e.back) ? ['<span class="lgi"><i class="w dash" style="border-color:var(--um-w-calls)"></i><b>loops back</b><span>the one line that runs right to left</span></span>'] : []).concat(typedKeys);
}

function pieces(X, el, o) {
  const kept = k => { try { return o.page ? localStorage.getItem(k) : null; } catch (_) { return null; } };
  const keep = (k, v) => { try { if (o.page) localStorage.setItem(k, v); } catch (_) {} };
  // want: the tab the reader chose, kept; tab: the one shown, which is want when the card has it (0.14.0)
  let sel = null, picked = [], lit = null, lb = null, lbBack = null, folded = kept('visual-legend') === '0', want = kept('visual-tab') || 'when', tab = want, TABS = ['when', 'what', 'how', 'links'];
  let told = null; // the story's step shown: { id, step, pointer: the card its own select names, pending: that select is still to come }

  /* the legend: the kinds of cards and lines the view draws, in a box that folds away */
  function legend() {
    const items = legendItems([X().geo()]), back = el.legend.contains(el.legend.getRootNode().activeElement);
    el.legend.hidden = !items.length;
    el.legend.classList.toggle('folded', folded);
    el.legend.innerHTML = `<div class="t"><span>LEGEND</span><button type="button" id="m-lfold" aria-label="${folded ? 'Show' : 'Hide'} legend" aria-expanded="${!folded}">${folded ? '+' : '–'}</button></div>${items.join('')}`;
    if (back) el.legend.querySelector('#m-lfold').focus(); // a fold by keyboard keeps focus on the button
  }
  /* the views list: readable columns; a declared order may include shortcuts to descendants */
  function tree() {
    const { views, V, kidsOf, chain } = X().ctx(), cur = X().view(), ch = chain(cur);
    // a typed view's count is what it draws, drawn yet or not (audit 38): one not laid out yet is counted just after, a slice
    // at a time, its row left blank till then rather than showing a number that would change
    const ctx = X().ctx(), count = x => viewCount(ctx, x, cur, X().geo(), true);
    const roots = views.filter(x => !x.parent), cols = roots.length > 1 ? [{ head: 'Map', items: roots, on: ch[0] }] : [];
    ch.forEach((id, i) => { const order = V[id].browserOrder || [], k = [...new Set([...order, ...kidsOf(id).map(v => v.id)])].map(id => V[id]).filter(Boolean); if (k.length) cols.push({ head: shortT(labelOr(V[id].title, id)), items: k, on: ch[i + 1] }); });
    o.frame.style.setProperty('--browser-width', Math.min(448, Math.max(1, cols.length) * 224) + 'px');
    el.tree.innerHTML = `<div class="miller">${cols.map(c => `<div class="mcol"><div class="mch" title="${esc(c.head)}">${esc(c.head)}</div>${c.items.map(x => { const n = kidsOf(x.id).length;
      return `<button class="mit${x.id === cur ? ' on' : x.id === c.on ? ' path' : ''}" data-v="${esc(x.id)}" title="${esc(labelOr(x.title, x.id))}"${x.id === cur ? ' aria-current="page"' : ''}><span>${esc(shortT(labelOr(x.title, x.id)))}</span><em>${count(x) ?? ''}${n ? ' ›' : ''}</em></button>`; }).join('')}</div>`).join('')}</div>`;
    const todo = cols.flatMap(c => c.items).filter(x => count(x) == null);
    if (todo.length) idle(dl => { try { if (!X() || X().ctx() !== ctx || !el.tree.isConnected) return true; } catch (_) { return true; } // the model changed, or the page went: its next tree() counts
      do { const x = todo.shift(), c = viewCount(ctx, x, cur, null);
        el.tree.querySelectorAll('.mit').forEach(b => { if (b.dataset.v === x.id) { const em = b.querySelector('em'); if (em && !/\d/.test(em.textContent)) em.textContent = c + em.textContent; } }); } while (todo.length && dl.timeRemaining() > 2); // one a turn at least
      return !todo.length; });
    const m = el.tree.firstChild, last = m.lastElementChild; m.style.scrollBehavior = 'auto'; m.scrollLeft = last ? Math.max(0, last.offsetLeft + last.offsetWidth - m.clientWidth) : 0; m.style.scrollBehavior = '';
  }
  const setTree = on => { o.frame.classList.toggle('tree-open', on); if (o.toggle) o.toggle.setAttribute('aria-expanded', on); };

  /* the details panel: header, actions and tabs of the selected card */
  function relRows(list, dir) {
    const { N } = X().ctx(), here = X().geo().byId || {};
    if (!list.length) return `<div class="rel-none">${dir === 'up' ? 'Nothing calls this here' : 'Calls nothing here'}</div>`;
    return '<ul class="relation-list">' + list.map(({ e, id, inView, view }) => { const at = view ? X().geoOf(view).byId : here, o = N[id] || at[id] || { label: id, kind: '' }, k = kindOf(o.kind, true);
      const up = !N[id] && o.owner != null && (N[o.owner] || at[o.owner]), label = up ? `${o.label} of ${String(up.label).split(" : ")[0]}` : o.label; // a port or a parameter: of its part, as it is announced
      return `<li><button class="rel" data-n="${esc(id)}"${view ? ` data-v="${esc(view)}"` : ''} title="${esc((e.when ? e.when + ' — ' : '') + (inView ? 'Select' : 'Find in another view'))}"><i style="background:var(--um-${KIND[k][0]})"></i><span class="rel-l">${esc(label)}</span>
        <span class="rel-e">${e.step != null ? esc(e.step) + ' · ' : ''}${esc(e.label || '')}${inView ? '' : ' ↗'}</span></button></li>`; }).join('') + '</ul>';
  }
  // a model is data: a link it names is http(s), mailto, file or relative, never javascript: (audit 7). Cleaned as a browser
  // reads a URL first (tabs and newlines dropped, controls and spaces trimmed), so "java\tscript:" is caught too
  const safeUrl = u => (u = String(u ?? '').replace(/[\t\n\r]/g, '').replace(/^[\0- ]+|[\0- ]+$/g, ''), /^(https?|mailto|file):/i.test(u) || !/^[a-z][\w+.-]+:/i.test(u) ? u : '');
  const authorChip = login => { login = String(login); const A = (X().ctx().D.authors || {})[login] || {};
    return `<a class="author" href="${esc(safeUrl(A.url) || 'https://github.com/' + login)}" target="_blank" rel="noopener">${A.avatar ? `<img src="${esc(A.avatar)}" alt="">` : `<i>${esc([...login].slice(0, 2).join('').toUpperCase())}</i>`}<span>${esc(A.name || login)} <b>@${esc(login)}</b></span></a>`; };
  const focused = () => { const a = el.panel.getRootNode().activeElement; return a && el.panel.contains(a) ? a : null; };
  function show(nid) {
    const { D, N, V, views, nodeIn, opensOf, kidCount, unfoldable, viewsWith, viewEdges } = X().ctx(), geo = X().geo(), cur = X().view(), panel = el.panel;
    const root = D.meta && D.meta.root ? String(D.meta.root).replace(/\/$/, '') : '';
    const base = D.sourcesBase ? String(D.sourcesBase).replace(/\/$/, '') + '/' : '';
    const srcPath = p => p.replace(/:\d+(-\d+)?$/, '');
    // meta.root is the repo root relative to this page (older pages: absolute). `~/…` sources live
    // outside the repo, so they get no link.
    // meta.sourceBase (render --source-base): in-pack sources were rewritten to URLs under it and
    // show as their pack-relative path; any other relative source gets no link on a published page.
    const sb = D.meta && D.meta.sourceBase ? String(D.meta.sourceBase) : '';
    const decode = s => { try { return decodeURI(s); } catch { return s; } }; // a bare % (100%off.ts) is no escape: shown as written
    const srcLabel = p => sb && p.startsWith(sb) ? decode(p.slice(sb.length)).replace(/#L(\d+)(?:-L(\d+))?$/, (_, a, b) => ':' + a + (b ? '-' + b : '')) : p;
    const srcHref = p => safeUrl(/^https?:/.test(p) ? p
      : p.startsWith('~') || sb ? ''
      : p.startsWith('/') ? 'file://' + encodeURI(srcPath(p))
      : root.startsWith('/') ? 'file://' + encodeURI(root + '/' + base + srcPath(p))
      : encodeURI((root ? root + '/' : '') + base + srcPath(p)));
    const srcList = n => (Array.isArray(n.source) ? n.source : n.source ? [n.source] : []).filter(s => typeof s === 'string'); // a path is text
    // a part or a port is no card: its drawn name and type, so its kind word, never the map's "Script INTERNAL" (audit 12)
    const n = N[nid] || !geo.byId?.[nid] ? nodeIn(nid, cur) : { ...geo.byId[nid] }, ty = n.type && wordOf(D, V[cur], nid, n.type), k = kindOf(n.kind, true), c = `var(--um-${KIND[k][0]})`, pub = k === 'm-public', ext = k === 'm-ext';
    const inView = new Set(geo.nodes.map(x => x.id)), seen = new Set();
    // a typed view draws a member end (a port of a part, a constraint's parameter) as "<part>-><end>": the end's id in geometry g
    const drawnIn = (e, side, g) => { const p = (((e.props || {}).ends || {})[side] || {}).part, d = `${p}->${e[side]}`; return p != null && g.byId && g.byId[d] ? d : e[side]; };
    const elsewhere = (e, side) => { for (const v of views.filter(x => x.diagram && x.id !== cur)) { // ponytail: lays out each typed view once (pic's cache), on the first such end
      let g; try { g = X().geoOf(v.id); } catch { continue; } const d = drawnIn(e, side, g); if (g.byId && g.byId[d]) return { id: d, view: v.id }; } return null; };
    const collect = dir => {
      const out = [];
      // one entry a line: by its ends and label, and by its model id (a typed view draws a line with its own label: a C4 technology, «use»)
      const add = (e, id, iv, mid, view) => { const key = dir + id + (e.label || ''), mk = mid != null && dir + '#' + mid; if (seen.has(key) || mk && seen.has(mk)) return; seen.add(key); if (mk) seen.add(mk); out.push({ e, id, inView: iv, view }); };
      geo.edges.forEach(e => { const all = (e.all || [e]).filter(x => x._id), mid = all.length === 1 ? all[0]._id : null; // a line for several edges: by label, as before
        const f = e.fromPort || e.from, t = e.toPort || e.to; // a line between ports: its ends are the ports
        if (dir === 'up' && (e.to === nid || e.toPort === nid)) add(e, f, true, mid); if (dir === 'down' && (e.from === nid || e.fromPort === nid)) add(e, t, true, mid); });
      const ve = viewEdges(V[cur]), k = runSteps(ve); ve.forEach((e, i) => { const e2 = V[cur].render === 'sequence' ? { ...e, step: k[i] } : e; if (dir === 'up' && e.to === nid) add(e2, e.from, true, e.id); if (dir === 'down' && e.from === nid) add(e2, e.to, true, e.id); });
      const [near, far] = dir === 'up' ? ['to', 'from'] : ['from', 'to'];
      (D.edges || []).forEach(e => { if (e[near] !== nid && drawnIn(e, near, geo) !== nid) return;
        const id = drawnIn(e, far, geo), w = !inView.has(id) && !N[id] && elsewhere(e, far); add(e, w ? w.id : id, inView.has(id), e.id, w && w.view); });
      return out;
    };
    const ups = collect('up'), downs = collect('down'), srcs = srcList(n);
    // the view it opens counted as that view's pill counts it (audit 39), or the count the host gives for one not loaded
    const child = opensOf(nid, cur), later = !o.page && child && !V[child], count = V[child] ? countText(X().ctx(), V[child], cur, geo) : kidCount(nid, cur) ? nWord(kidCount(nid, cur), 'node') : ''; // later: a view the host loads when asked (#47)
    const vIn = viewsWith(nid).filter(v => v.id !== cur);
    const by = n.author ? `<span>·</span>${authorChip(n.author)}` : ext ? '<span class="origin">· author unknown</span>' : '';
    const exs = Array.isArray(n.examples) ? n.examples.filter(x => x && (x.thumb || x.href)) : [];
    const tabs = [...(ty ? [] : [['when', 'When to use'], ['what', 'What it is'], ['how', 'How it works']]), ...(exs.length ? [['examples', 'Example']] : []), ['links', 'Behind the scenes']];
    TABS = tabs.map(t => t[0]);
    tab = TABS.includes(want) ? want : TABS[0]; // a card without the chosen tab shows its first; the choice stays for the next card
    const text = (h4, body, key) => body ? `<h3>${h4}</h3><ul class="detail-bullets">${detailBullets(body).map(b => `<li title="${esc(b)}">${inline(b)}</li>`).join('')}</ul>` : `<h3>${h4}</h3><div class="pnone">Not written yet — add <code>${key}</code> to this node in the map model.</div>`;
    const verbs = (n.verbs || []).length ? `<div class="pverbs">${n.verbs.map(v => { const vid = N[nid + ':' + v] ? nid + ':' + v : null; return `<${vid ? `button data-n="${esc(vid)}"` : 'span'} class="pverb" style="--c:${c}">${esc(v)}</${vid ? 'button' : 'span'}>`; }).join('')}</div>` : '';
    const srcHtml = srcs.length ? '<ul class="source-list">' + srcs.map(s => `<li class="src">${srcHref(s) ? `<a href="${esc(srcHref(s))}" title="Open ${esc(sb ? srcLabel(s) : base + s)}"${sb ? ' target="_blank" rel="noopener"' : ''}>${esc(srcLabel(s))}</a>` : `<span>${esc(s)}</span>`}<button class="ibtn sm" data-copy="${esc(sb ? srcLabel(s) : base + s)}" title="Copy path" aria-label="Copy path">⧉</button></li>`).join('') + '</ul>' : '<div class="rel-none">No source listed</div>';
    const bodies = {
      when: text('When to use', n.when, 'when'),
      what: text('What it is', n.what, 'what') + verbs,
      how: text('How it works', n.how, 'how'),
      examples: `<h3>Example</h3><ul class="exs">${exs.map((x, i) => `<li class="ex">${x.thumb ? `<button class="ex-thumb" data-ex="${i}" title="Open full size" aria-label="Open ${esc(x.title || 'example')} full size"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>` : ''}<b>${inline(x.title || '')}</b>${x.caption ? `<small>${inline(x.caption)}</small>` : ''}${safeUrl(x.href) ? `<a href="${esc(safeUrl(x.href))}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}</li>`).join('')}</ul>`,
      links: `<div class="links"><div><h3>← Comes from</h3>${relRows(ups, 'up')}</div><div><h3>→ Leads to</h3>${relRows(downs, 'down')}</div>
        <div><h3>Source files</h3>${srcHtml}${vIn.length ? `<h3 style="margin-top:10px">Also shown in</h3><ul class="pviews">${vIn.map(v => `<li><button class="pview" data-v="${esc(v.id)}" data-sel="${esc(nid)}">${esc(shortT(labelOr(v.title, v.id)))}</button></li>`).join('')}</ul>` : ''}</div></div>`,
    };
    const was = focused(), on = was && [...was.attributes].find(a => a.name.startsWith('data-')); // a panel drawn again keeps focus on the control it was on
    panel.innerHTML = `<div class="ph" style="--c:${c}">
        ${(() => { const I = (D.icons || {})[n.icon];
  return I && I.src ? `<span class="big logo${I.dark ? ' dark' : ''}" aria-hidden="true"><img src="${esc(I.src)}" width="22" height="22" alt=""></span>`
  : `<span class="big" style="background:${c}" aria-hidden="true"><svg viewBox="0 0 ${I && I.g ? 24 : 16} ${I && I.g ? 24 : 16}" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${I && I.g ? 2 : 1.5}" stroke-linecap="round" stroke-linejoin="round">${I && I.g ? glyph(I.g) : SIGIL[k]}</svg></span>`; })()}
        <div class="pt"><h2>${esc(n.label || nid)}</h2><small><span>${esc(ty || KIND[k][1])}</span><span class="vis ${pub ? 'pub' : ext ? 'ext' : ''}">${ty ? '' : badgesOf(n).length ? badgesOf(n).map(b => esc(b.text.toUpperCase())).join(' · ') : pub ? 'PUBLIC' : ext ? 'EXTERNAL' : 'INTERNAL'}</span>${by}${n.origin ? `<span class="origin">${esc(n.origin)}</span>` : ''}</small></div>
        <div class="acts">${V[child] || later ? `<button class="obtn" data-open="${esc(nid)}" style="--c:${c}">⤢ Open ${esc(shortT(V[child] ? labelOr(V[child].title, child) : child))} <span>${count ? count + ' · ' : ''}Enter</span></button>` : ''}${!X().editable && (unfoldable(nid, cur) || later) ? `<button class="obtn" data-unfold="${esc(nid)}" style="--c:${c}">⤡ Unfold here <span>E</span></button>` : ''}${litButtons()}<button class="ibtn x" data-close title="Close (Esc)" aria-label="Close details">×</button></div>
      </div>
      <div class="ptabs"><div class="ptablist" role="tablist" aria-label="Details">${tabs.map(t => `<button class="ptab" role="tab" id="pt-${t[0]}" data-tab="${t[0]}" aria-selected="${t[0] === tab}" aria-controls="m-pbody">${t[1]}${t[2] != null ? `<em>${t[2]}</em>` : ''}</button>`).join('')}</div>
        <span class="pnav"><button class="ibtn sm" data-step="-1" title="Previous ([)" aria-label="Previous tab">‹</button><button class="ibtn sm" data-step="1" title="Next (])" aria-label="Next tab">›</button></span></div>
      <div class="pbody" id="m-pbody" role="tabpanel" aria-labelledby="pt-${tab}">${bodies[tab]}</div>`;
    panel.hidden = false;
    panel.dataset.node = nid;
    panel.querySelectorAll('.clamp').forEach(el => { if (el.scrollHeight > el.clientHeight + 2) el.insertAdjacentHTML('afterend', '<button class="morebtn" data-more>Show all</button>'); });
    if (was) ((on && [...panel.querySelectorAll(`[${on.name}]`)].find(x => x.getAttribute(on.name) === on.value)) || panel.querySelector('[aria-selected="true"]')).focus();
  }
  function hide() { const back = focused(); el.panel.hidden = true; if (back) queueMicrotask(() => { if (el.panel.hidden) X().focus(); }); } // a panel that closes gives focus back to the map
  function openExample(nid, i, from = null) { // from: the control that opened it, which focus goes back to
    const x = ((X().ctx().nodeIn(nid, X().view()) || {}).examples || [])[i]; if (!x) return;
    if (!lb) { lb = h(`<div class="lightbox" id="m-lightbox" role="dialog" aria-modal="true" aria-label="Example" hidden></div>`); o.layer.appendChild(lb);
      lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('[data-lbclose]')) closeExample(); }); }
    lb.innerHTML = `<figure><img src="${esc(x.full || x.thumb)}" alt="${esc(x.title || '')}"><figcaption><span>${inline(x.title || '')}</span>${safeUrl(x.href) ? `<a href="${esc(safeUrl(x.href))}" target="_blank" rel="noopener">Open live page ↗</a>` : ''}<button class="ibtn" data-lbclose title="Close (Esc)" aria-label="Close">×</button></figcaption></figure>`;
    lbBack = from; lb.hidden = false; lb.querySelector('[data-lbclose]').focus();
  }
  const closeExample = () => { if (!lb || lb.hidden) return; lb.hidden = true; // focus goes back where it came from: the thumbnail, else the panel's, else the map
    const to = lbBack && lbBack.isConnected ? lbBack : !el.panel.hidden && el.panel.querySelector('[data-ex]'); lbBack = null; if (to) to.focus(); else X().focus(); };
  const setTab = t => { want = tab = t; keep('visual-tab', t); if (sel && !el.panel.hidden) show(sel); };

  /* paths and reach (#64): lit on the map from the details panel or by key, and said in the hint line (a live region); a
     new selection or view clears them, and the same key again does */
  const cardName = id => X().ctx().nodeIn(id, X().view()).label || id, nCards = n => `${n} card${n === 1 ? '' : 's'}`;
  // the slowest and the costliest path (#95), offered where the view's lines have latency or cost
  const BY = { latency: ['⏱', 'slowest'], cost: ['¤', 'costliest'] }, budgets = () => Object.keys(BY).filter(k => X().ctx().viewEdges(X().ctx().V[X().view()]).some(e => typeof e[k] === 'number'));
  const litOn = k => !!lit && lit.split(' ')[0] === k; // the button whose light is on says so (aria-pressed)
  const litButtons = () => `<button class="ibtn" data-lit="out" title="Light what it leads to (&gt;)" aria-label="Light what it leads to" aria-pressed="${litOn('out')}">→</button><button class="ibtn" data-lit="in" title="Light what leads to it (&lt;)" aria-label="Light what leads to it" aria-pressed="${litOn('in')}">←</button>`
    + (picked.length > 1 ? `<button class="ibtn" data-lit="paths" title="Light every path between the two cards (P)" aria-label="Light every path between the two selected cards" aria-pressed="${litOn('paths')}">⇄</button>` : '')
    + budgets().map(k => { const t = `Light the ${BY[k][1]} path ${picked.length > 1 ? 'between the two cards' : 'from this card'}`; return `<button class="ibtn" data-lit="${k}" title="${t}" aria-label="${t}" aria-pressed="${litOn(k)}">${BY[k][0]}</button>`; }).join('')
    + `<button class="ibtn" data-lit="down" title="What if this goes down?" aria-label="What if this goes down?" aria-pressed="${litOn('down')}">⊘</button>`;
  /* what is lit is the pieces' own layer, 'lit' (0.14.0): it never takes a host's highlight() or a story's away, nor they it */
  const lv = r => Math.min(1, Math.max(0, +(r.level ?? (r.distance > 0 ? Math.max(.45, 1 - .15 * r.distance) : 1)) || 0)); // as highlight() fades a Ref
  function litLayer(refs, marks) { // the cards and lines lit, the rest dimmed, with the marks that go with them (a path's total, the card that is down)
    const L = { nodes: idTable(), edges: idTable(), dim: refs.length > 0 }, put = (to, x, r) => { to[x] = { level: Math.max(lv(r), (to[x] || {}).level || 0) }; };
    refs.forEach(r => { if (r.type === 'node') put(L.nodes, r.id, r); else if (r.type === 'edge') (r.ids || []).forEach(x => put(L.edges, x, r)); });
    Object.entries((marks || {}).nodes || {}).forEach(([id, m]) => { L.nodes[id] = { ...L.nodes[id], ...m }; });
    return L;
  }
  const pressed = () => { if (el.panel) el.panel.querySelectorAll('[data-lit]').forEach(b => b.setAttribute('aria-pressed', litOn(b.dataset.lit))); };
  function unlight() { if (lit) { lit = null; X().overlay('lit', null); pressed(); } }
  function light(key, refs, said, marks = null) {
    if (lit === key) { unlight(); return o.status('Highlight cleared'); }
    lit = key; X().overlay('lit', refs.length || marks ? litLayer(refs, marks) : null, [X().view()]); pressed(); o.status(said, 3600);
  }
  function lightReach(back) {
    if (!sel || !X().geo().byId[sel]) return;
    const refs = reach(X().ctx().D, X().view(), sel, { backward: back }), n = refs.filter(r => r.type === 'node').length - 1, s = cardName(sel);
    light((back ? 'in ' : 'out ') + sel, n ? refs : [], !n ? (back ? `Nothing leads to ${s} here` : `${s} leads nowhere here`)
      : back ? `${nCards(n)} ${n === 1 ? 'leads' : 'lead'} to ${s}: lit on the map` : `${s} leads to ${nCards(n)}: lit on the map`);
  }
  function lightPaths() {
    const [a, b] = picked.slice(-2); if (!b) return;
    const D = X().ctx().D, cur = X().view();
    let refs = paths(D, cur, a, b), [x, y] = [a, b];
    if (!refs.length) { refs = paths(D, cur, b, a); [x, y] = [b, a]; } // the two cards in either order
    const n = refs.filter(r => r.type === 'node').length;
    light(`paths ${a} ${b}`, refs, n ? `Every path from ${cardName(x)} to ${cardName(y)}: ${nCards(n)}, lit on the map` : `No path joins ${cardName(a)} and ${cardName(b)} here`);
  }
  function lightCritical(by) { // the slowest or costliest path from the selected card, or between the two selected, its total on its last card (#95)
    if (!sel) return;
    const D = X().ctx().D, cur = X().view(), [a, b] = picked.length > 1 ? picked.slice(-2) : [sel], run = (from, to) => critical(D, cur, { from, to, by });
    let r = run(a, b); if (b && !r.refs.length) r = run(b, a); // the two cards in either order
    const cs = r.refs.filter(x => x.type === 'node').map(x => x.id), sum = by === 'latency' ? msText(r.total) : `cost ${r.total}`, word = BY[by][1];
    light(`${by} ${a} ${b || ''}`, r.refs, !cs.length ? (b ? `No path joins ${cardName(a)} and ${cardName(b)} here` : `${cardName(a)} leads nowhere here`)
      : `The ${word} path: ${cs.map(cardName).join(' → ')}, ${sum}`, cs.length ? { nodes: { [cs[cs.length - 1]]: { badge: { text: sum, tone: 'amber' } } } } : null);
  }
  function lightDown() { // what if the selected card goes down (#95): what loses its way to it
    if (!sel) return;
    const r = whatIf(X().ctx().D, X().view(), { remove: [sel] }), n = r.unreachable.filter(x => x.type === 'node').length - 1;
    light('down ' + sel, r.unreachable, `If ${cardName(sel)} goes down: ${n ? `${nCards(n)} lose${n === 1 ? 's its' : ' their'} way to it` : 'nothing here leads to it'}`,
      { nodes: { [sel]: { tone: 'rose', badge: { text: 'down', tone: 'rose' } } } });
  }
  // a card: selected here, or shown in the view that has it, nearest this one first
  const find = (nid, vid) => { const { viewsWith, chain } = X().ctx(), cur = X().view(); if (X().geo().byId[nid] || X().boxHere(nid)) return X().go(cur, { select: nid }); // a card, or an element drawn here as a box
    const vs = viewsWith(nid), v = vid || (vs.find(x => chain(x.id).includes(cur)) || vs[0] || {}).id; // vid: the view the panel found it drawn in
    if (v) return X().go(v, { select: nid }); o.status(`${nid} is drawn in no view`); return false; };

  if (el.legend) el.legend.addEventListener('click', e => { if (!e.target.closest('#m-lfold')) return;
    folded = !folded; keep('visual-legend', folded ? '0' : '1'); legend(); if (!X().cam().touched) X().cam().set(X().startView()); });
  if (el.tree) el.tree.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; if (innerWidth <= 820) setTree(false); X().go(b.dataset.v); });
  if (el.panel) el.panel.addEventListener('click', e => {
    const t = e.target;
    const tb = t.closest('[data-tab]'); if (tb) return setTab(tb.dataset.tab);
    const st = t.closest('[data-step]'); if (st) return setTab(TABS[(TABS.indexOf(tab) + +st.dataset.step + TABS.length) % TABS.length]);
    const mb = t.closest('[data-more]'); if (mb) { mb.previousElementSibling.classList.add('open'); mb.remove(); }
    const ex = t.closest('[data-ex]'); if (ex) return openExample(el.panel.dataset.node, +ex.dataset.ex, ex);
    if (t.closest('[data-close]')) return X().select(null);
    const lt = t.closest('[data-lit]'); if (lt) { const k = lt.dataset.lit; return k === 'paths' ? lightPaths() : k === 'down' ? lightDown() : BY[k] ? lightCritical(k) : lightReach(k === 'in'); }
    const ob = t.closest('[data-open]'); if (ob) return X().open(ob.dataset.open); // the open event first, as a double-click on the card
    const ub = t.closest('[data-unfold]'); if (ub) return X().unfold(ub.dataset.unfold); // in place (#71), the expand event first
    const pv = t.closest('.pview'); if (pv) return X().go(pv.dataset.v, { select: pv.dataset.sel });
    const rn = t.closest('[data-n]'); if (rn) return find(rn.dataset.n, rn.dataset.v);
    const cp = t.closest('[data-copy]'); if (cp) navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy).then(() => o.status('Path copied'), () => o.status(cp.dataset.copy));
  });

  /* a story's step points at a card (0.14.0): the select its step makes is a pointer, which opens no details; a card the
     reader picks opens them, that one too. One rule, by id: a step's select is a card's id or a Ref (a chip's or a badge's
     names its card) */
  const pointerOf = x => typeof x === 'string' ? x : x && typeof x === 'object' ? (x.type === 'node' ? x.id : x.node ?? null) : null;
  function story(e) { // the map's story event
    if (!e || e.step == null) { told = null; return; }
    if (told && told.id === e.story && told.step === e.step) return; // the same step, said again (paused, played on)
    const def = arrOf(X().ctx().D.stories).find(s => s && s.id === e.story), step = def && arrOf(def.steps).filter(s => s && typeof s === 'object')[e.step];
    const pointer = step ? pointerOf(step.select) : null, already = pointer != null && sel === pointer && step.view === X().view() && !X().busy(); // its select changes nothing: no event comes
    told = { id: e.story, step: e.step, pointer, pending: pointer != null && !already };
    if (already && el.panel) hide();
  }

  return {
    chrome() { if (el.legend) legend(); if (el.tree) tree(); if (sel && el.panel && !el.panel.hidden) show(sel); }, // each picture of the map
    select(target, targets) { // the map's select event: the selected card's details, unless it is the select a story's step makes (a pointer)
      sel = target && target.type === 'node' ? target.id : null; picked = (targets || []).filter(t => t.type === 'node').map(t => t.id);
      const pointer = !!(told && told.pending && sel != null && sel === told.pointer); if (pointer) told.pending = false;
      unlight(); if (el.panel) { if (sel && !pointer) show(sel); else hide(); }
    },
    story, unlight, find, setTree,
    modal: () => !!(lb && !lb.hidden), // an example shown full size, which holds the keys while open
    key(e) { // the pieces' keys: true when one was used
      const k = e.key;
      if (lb && !lb.hidden) { // the example shown full size holds every key: Esc closes it, Tab keeps to it, Enter and Space press its buttons
        if (k === 'Escape' || k === 'Backspace') closeExample();
        else if (k === 'Tab') { const f = [...lb.querySelectorAll('a[href], button')], i = f.indexOf(lb.getRootNode().activeElement); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
        else if (k === 'Enter' || k === ' ') return false;
        return true;
      }
      if ((k === '[' || k === ']') && sel && el.panel && !el.panel.hidden) setTab(TABS[(TABS.indexOf(tab) + (k === ']' ? 1 : -1) + TABS.length) % TABS.length]);
      else if ((k === 'o' || k === 'O') && el.tree) setTree(!o.frame.classList.contains('tree-open'));
      else if ((k === '>' || k === '<') && sel && el.panel) lightReach(k === '<');
      else if ((k === 'p' || k === 'P') && picked.length > 1 && el.panel) lightPaths();
      else return false;
      return true;
    },
  };
}

// a view's count before it is drawn too (audit 38), so the views list and the search palette say what the pill will: a typed
// view not drawn yet laid out once for it (kept per context), a map's cards. cur and g: the view on screen and its picture
// lazy: null for a typed view not laid out yet, instead of laying it out
const counted = new WeakMap();
// a numbered view counts its steps, as its pill says (audit 39: the pill said "5 steps", the views list and search 6): a process
// or numbered-card view's cards in run order, a sequence view's lines; null for any other view
const stepCount = (ctx, v) => v.mainSteps || v.render === 'process' ? arrOf(v.stepIds || v.nodeIds).length : v.render === 'sequence' ? runSteps(arrOf(ctx.viewEdges(v))).filter(k => k != null).length : null;
const nWord = (n, w) => (n === 1 ? '1 ' + w : n + ' ' + w + 's'); // "1 node", "1 step", "1 wire" (audits 38, 39)
// a view's count in words, as its pill gives it: "5 steps", "1 node"
const countText = (ctx, v, cur, g) => nWord(viewCount(ctx, v, cur, g), stepCount(ctx, v) != null ? 'step' : 'node');
const viewCount = (ctx, v, cur, g, lazy = false) => { if (!v) return 0; const s = stepCount(ctx, v); if (s != null) return s; if (v.diagram == null || v.diagram === 'map') return arrOf(v.nodeIds).length;
  const C = ctx.geoCache || {}, have = v.id === cur && g ? g : (C[v.id] || {}).g; if (have) return elementCount(v, have) ?? arrOf(v.nodeIds).length;
  let m = counted.get(ctx); if (!m) counted.set(ctx, m = new Map());
  if (!m.has(v.id)) { if (lazy) return null; let n; try { n = elementCount(v, ctx.buildGeo(v.id)); } catch { n = null; } m.set(v.id, n ?? arrOf(v.nodeIds).length); }
  return m.get(v.id); };
// run f(deadline) in slices of about 10 ms on timers, after the view on screen is drawn, until it returns true: no long task,
// and done in a tab requestIdleCallback starves (a background or headless one)
const idle = f => { const go = () => { const t = Date.now(); if (!f({ timeRemaining: () => Math.max(0, 10 - (Date.now() - t)) })) setTimeout(go, 0); }; setTimeout(go, 30); };
/* The model a page was given, as its file has it: less what render added, with what it replaced or dropped put back. A page render
   wrote since audit 31 records both in meta["umlimator:written"]: { added: [path, ...], was: [[path, value], ...] }, each path a list of
   keys (an index into a list as a number): the avatar it inlined, an intake logo it embedded, a layout its search baked over none, its
   meta.generated over the model's own. A page an older render wrote names only what it added, in meta.added, as a path of keys joined by
   "." (audit 30), and one older still names none: its kind, avatarsEmbedded, icons and the meta keys render sets are taken off. A model
   no render gave (a host's, no kind "map") is the model as it is. The page's model is never changed: each object on a path is copied
   before a key of it goes or comes back, and only an own key is followed; no path goes through __proto__. */
function asWritten(given) {
  const isObj = x => x !== null && typeof x === 'object', own = (o, k) => isObj(o) && Object.hasOwn(o, k);
  if (!isObj(given) || Array.isArray(given)) return given;
  const meta = own(given, 'meta') && isObj(given.meta) ? given.meta : null, rec = meta && own(meta, 'umlimator:written') && isObj(meta['umlimator:written']) ? meta['umlimator:written'] : null;
  const key = k => (typeof k === 'string' && k !== '__proto__') || Number.isInteger(k), path = p => Array.isArray(p) && p.length > 0 && p.every(key);
  const named = rec ? (Array.isArray(rec.added) ? rec.added.filter(path) : []) : meta && Array.isArray(meta.added) ? meta.added.filter(k => typeof k === 'string').map(k => k.split('.')) : null;
  if (!named && given.kind !== 'map') return given;
  const added = named || ['kind', 'avatarsEmbedded', 'icons', 'meta.generated', 'meta.project', 'meta.root', 'meta'].map(k => k.split('.'));
  const was = rec && Array.isArray(rec.was) ? rec.was.filter(w => Array.isArray(w) && w.length === 2 && path(w[0])) : [];
  const m = { ...given }, made = new Set([m]), put = (o, k, x) => Object.defineProperty(o, k, { value: x, writable: true, enumerable: true, configurable: true });
  const copy = (o, k) => { const x = o[k]; if (made.has(x)) return x; const y = Array.isArray(x) ? [...x] : { ...x }; made.add(y); put(o, k, y); return y; };
  const to = ks => { let o = m; for (const k of ks.slice(0, -1)) { if (!own(o, k) || !isObj(o[k])) return null; o = copy(o, k); } return o; }; // the object a path ends in, copied
  const whole = ks => ks.length === 1 && ks[0] === 'meta';
  added.filter(ks => !whole(ks)).forEach(ks => { const o = to(ks), last = ks[ks.length - 1]; if (o && own(o, last) && !Array.isArray(o)) delete o[last]; });
  was.forEach(([ks, x]) => { const o = to(ks), last = ks[ks.length - 1]; if (o && (Array.isArray(o) ? Number.isInteger(last) && last >= 0 && last < o.length : typeof last === 'string')) put(o, last, x); });
  if (added.some(whole) && isObj(m.meta) && !Object.keys(m.meta).length) delete m.meta; // render made it: none in the file
  return m;
}

/* A part of a downloaded file's name from the model's text (its title, a view's id, a story's title): its letters and digits in any
   script, each run of anything else one "-", none at either end, at most n characters; a number is text too. An ASCII-only slug made a
   Japanese title "-.json" and two views "---.svg" each, and a numeric title threw (audit 32). */
function namePart(s, n = 80, lower = true) {
  const t = String(s ?? '').normalize('NFC'), cut = Array.from((lower ? t.toLowerCase() : t).replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^[-\p{M}]+|-+$/gu, ''));
  return cut.slice(0, n).join('').replace(/-+$/, '');
}

/* ================= the standalone viewer =================
   One-row top bar · column browser of views on the left · map on top · details strip below; built on render().
   It owns the page: the document title, the URL hash (#view=&node=), keyboard shortcuts and saved preferences. */
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('visual-theme', next); } catch (e) {}
}

export function mountPage(container, model, options = {}) {
  const Q = options.params || new URLSearchParams();
  document.body.classList.add('map-mode');
  let { D, views, nodes, N, V, rootId, nodeIn: nodeIn0, subjectOf, viewsWith, kidsOf, chain, viewEdges, planCache } = mapContext(model);
  const nodeIn = (nid, vid = cur) => nodeIn0(nid, vid);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const modK = mac ? '⌘K' : 'Ctrl K';
  const HINT = hintHTML(modK);
  const ghost = [[10, 26, 22], [40, 18, 24], [40, 46, 24], [10, 60, 22], [70, 32, 20], [70, 70, 20]].map(([l, t, w]) => `<span style="left:${l}%;top:${t}%;width:${w}%"></span>`).join('');
  // the page's keys (0.14.0), in the order the key list (?) shows them: what to press and what it does, then, for the keys
  // the page reads itself, those keys and what they do; the rest are the map's own, which reach its canvas (the router)
  const KEYS = [
    ['/ or ' + modK, 'search nodes and views', ['/'], () => openPal()],
    ['Scroll · pinch', 'zoom (two-finger drag pans)'],
    ['Click', 'details below the map'],
    ['Double-click · Enter', 'open a stacked node ⤢'],
    ['E · Alt + click', 'unfold a stacked node here, or fold it back ⤡'],
    ['Esc · Backspace', 'close what is on top (a menu, the recorder, a story too), else clear the selection, else up one level', ['Escape', 'Backspace'], (e, inCanvas) => closeTop(e, inCanvas)],
    ['+ − 0 1', 'zoom in, out, fit, 100%'],
    ['← ↑ → ↓', 'pan'],
    ['[ ]', 'previous / next details tab', ['[', ']'], e => pc.key(e)],
    ['i', 'about this view', ['i', 'I'], () => togglePill()],
    ['O', 'views list', ['o', 'O'], e => pc.key(e)],
    ['F', 'flow on/off'],
    ['> <', 'light what a card leads to, what leads to it', ['>', '<'], e => pc.key(e)],
    ['Shift-click · P', 'light every path between two cards', ['p', 'P'], e => pc.key(e)],
    ['← → · PgUp PgDn', 'in a story: previous / next step'],
    ['?', 'these keys', ['?'], () => toggleHelp()],
  ];
  const ac = new AbortController(), signal = ac.signal; // the page's listeners on the document and window: destroy() takes them away

  const app = container; app.className = 'mapapp';
  app.innerHTML = `
    <header class="mbar">
      <button class="ibtn" id="m-outline" title="Views (O)" aria-label="Toggle the views list" aria-expanded="false">☰</button>
      <h1 class="mbrand"><i></i><span>${esc(labelOr(D.title, 'Map'))}</span></h1>
      <nav class="crumbs" id="m-crumbs" aria-label="Breadcrumb"></nav>
      <button class="findbtn" id="m-find" type="button" aria-label="Find a node or view, ${modK}" aria-keyshortcuts="${mac ? 'Meta' : 'Control'}+K"><span aria-hidden="true">⌕</span><span class="ft">Find a node or view…</span> <span class="kbd">${modK}</span></button>
      <button class="ibtn" id="m-theme" title="Light / dark" aria-label="Dark theme" aria-pressed="false">◐</button>${arrOf(D.stories).length ? `
      <div class="menu"><button class="ibtn txt" id="m-stories" aria-controls="m-stories-pop" aria-expanded="false" title="Stories: walk-throughs of this map">▶<span class="lbl"> Stories</span></button>
        <div class="menu-pop" id="m-stories-pop" hidden>${arrOf(D.stories).map(s => `<button data-story="${esc(s && s.id)}">${esc(s ? labelOr(labelOr(s.title, s.id), '') : '')}</button>`).join('')}</div></div>` : ''}${arrOf(D.lenses).some(l => l && l.id) ? `
      <div class="menu"><button class="ibtn txt" id="m-lenses" aria-controls="m-lenses-pop" aria-expanded="false" title="Lenses: ways to look at this map">◎<span class="lbl"> Lenses</span></button>
        <div class="menu-pop" id="m-lenses-pop" hidden>${D.lenses.filter(l => l && l.id).map(l => `<button data-lens="${esc(l.id)}" aria-pressed="false">${esc(labelOr(l.title, l.id))}</button>`).join('')}<hr><button data-lens="" aria-pressed="true">No lens</button></div></div>` : ''}
      <div class="menu"><button class="pbtn" id="m-export" aria-controls="m-export-pop" aria-expanded="false">Export ▾</button>
        <div class="menu-pop" id="m-export-pop" hidden><button data-x="svg">SVG · this view</button><button data-x="png">PNG · this view (2×)</button><button data-x="link">Copy link to view</button><hr><button data-x="json">Map model (JSON)</button><button data-x="record">Record a story…</button></div></div>
      <button class="ibtn" id="m-pause" type="button" title="Pause" aria-label="Pause" aria-pressed="false">❚❚</button>
      <button class="ibtn" id="m-help" title="Keys (?)" aria-label="Keyboard shortcuts" aria-haspopup="dialog" aria-controls="m-helpbox" aria-expanded="false">?</button>
    </header>
    <aside class="outline" id="m-tree" aria-label="Views"></aside>
    <div class="mmain">
      <div class="mstage" id="m-stage">
        <div class="mcanvas" id="m-canvas"></div>
        <div class="ghosts" id="m-ghosts" aria-hidden="true">${ghost}</div>
        <div class="vpill" id="m-vpill"></div>
        <div class="m-legend" id="m-legend"></div>
        <div class="hint" id="m-hint">${HINT}</div>
      </div>
      <aside class="panel" id="m-panel" aria-label="Node details" hidden></aside>
    </div>
    <div class="hpop" id="m-helpbox" role="dialog" aria-label="Keys" tabindex="-1" hidden><b>Keys</b>
      <dl>${KEYS.map(([k, d]) => `<dt>${esc(k)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></div>
    <div class="scrim" id="m-pal" hidden><div class="pal" role="dialog" aria-label="Search">
      <div class="in"><span aria-hidden="true">⌕</span><input id="m-q" type="text" autocomplete="off" spellcheck="false" placeholder="Search nodes and views" aria-label="Search nodes and views" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="m-res"><span class="kbd">esc</span></div>
      <div class="res" id="m-res" role="listbox" aria-label="Results"></div><div id="m-none" role="status"></div>
      <div class="pft"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div></div></div>`;
  const $ = id => document.getElementById(id);
  const stage = $('m-stage'), panel = $('m-panel');
  let X = null, cam = null, geo = null, svg = null, cur = null, sel = null, stack = [], paused = false;
  const status = hinter($('m-hint'), HINT);
  // the views list, the legend and the details panel (#99): the same pieces render() draws for a host
  const pc = pieces(() => X, { tree: $('m-tree'), legend: $('m-legend'), panel }, { page: true, frame: document.body, toggle: $('m-outline'), layer: document.body, status });

  function renderChrome() {
    const v = V[cur];
    $('m-crumbs').innerHTML = stack.map((id, i) => i === stack.length - 1
      ? `<span class="crumb cur" aria-current="page">${esc(labelOr(V[id].title, id))}</span>`
      : `<button class="crumb" data-v="${esc(id)}">${esc(shortT(labelOr(V[id].title, id)))}</button><span class="crumb-sep">›</span>`).join('');
    const parent = stack.length > 1 ? stack[stack.length - 2] : v.parent;
    renderPill(parent); pc.chrome();
    document.title = `${labelOr(v.title, v.id)} · ${labelOr(D.title, 'map')}`;
  }
  function renderPill(parent) {
    const v = V[cur], mainSteps = v.mainSteps || v.render === 'process', seq = v.render === 'sequence', ve = viewEdges(v), L = planCache[cur] && planCache[cur].hub ? planCache[cur] : null;
    const depth = Math.max(...views.map(x => chain(x.id).length));
    const nn = elementCount(v, geo) ?? geo.nodes.length, steps = stepCount(X.ctx(), v); // a typed view: its elements, not its layout's pieces (audit 37)
    $('m-vpill').innerHTML = `<button class="pill" id="m-pillbtn" aria-expanded="false" aria-controls="m-vpop" title="About this view (i)"><b>${esc(shortT(labelOr(v.title, v.id)))}</b><span class="n">${steps != null ? nWord(steps, 'step') : nWord(nn, 'node')}</span><span class="kbd">i</span></button>
      ${mainSteps && (v.note || v.caption) ? `<p class="view-note">${inline(v.note || v.caption)}</p>` : ''}
      <div class="vpop" id="m-vpop" hidden>${parent ? `<button class="back" data-v="${esc(parent)}">← ${esc(shortT(labelOr(V[parent].title, parent)))}</button>` : ''}
        <h2>${esc(labelOr(v.title, v.id))}</h2>${v.caption || v.description ? `<p>${inline(v.caption || v.description)}</p>` : ''}
        ${L ? `<div class="vlanes">${L.lanes.map((l, i) => `${i ? '<i>→</i>' : ''}<span><em>${i + 1}</em>${esc(l.title)} <small>${l.ids.length}</small></span>`).join('')}</div>` : ''}
        ${seq ? `<ol>${ve.map(e => `<li title="${esc((N[e.from] || {}).label || e.from)} → ${esc((N[e.to] || {}).label || e.to)}">${esc(e.label || (N[e.to] || {}).label || e.to)}</li>`).join('')}</ol>` : ''}
        <div class="vm">${nWord(nn, 'node')} · ${nWord(geo.edges.length, 'wire')}${views.length > 1 ? ` · level ${chain(cur).length} of ${depth}` : ''}</div></div>`;
  }
  const togglePill = force => { const b = $('m-pillbtn'), p = $('m-vpop'); if (!b) return; const on = force != null ? force : p.hidden; p.hidden = !on; b.setAttribute('aria-expanded', on); };
  const setTree = pc.setTree;

  /* the link (0.14.0): one place writes it, from what the map shows: its view, card, story step and lens, and the reader
     copy and theme the page was opened with (the theme as it is now, after ◐ too). A new view is a new entry,
     written once the move lands; anything else rewrites the entry. Nothing is written while a link is being followed */
  function write(push = false) {
    if (!X || linking || handle.destroyed) return;
    const p = new URLSearchParams(); p.set('view', cur); if (sel) p.set('node', sel);
    if (told) { p.set('story', told.id); p.set('step', told.step + 1); } // the story shown, at its step (#69)
    if (lensOn) p.set('lens', lensOn); // the lens on the map (#94)
    if (Q.get('theme')) p.set('theme', document.documentElement.dataset.theme || Q.get('theme'));
    if (Q.get('reader')) p.set('reader', Q.get('reader')); // check, shot and still describe one run: never in the link a reader shares (issue 136)
    const h = '#' + p.toString();
    if (location.hash !== h) window.history[push ? 'pushState' : 'replaceState'](null, '', h); // window's: history() is this module's undo helper
  }
  /* following a link, on load and on Back, Forward or an edited link: its lens, view, story step and card, applied in that
     order. Once the map has settled, the page writes the link it shows: what the model lacks is corrected, and the hint
     line says so. A move the reader starts meanwhile wins, as a move of the reader's own (a new entry) */
  let linking = null, follows = 0; // linking: { view } while a link is followed: the view it goes to, whose arrival writes no entry
  const idle = () => new Promise(r => { const t = () => X.busy() ? setTimeout(t, 30) : r(); t(); }); // once no move is under way
  async function follow(load = false) {
    const p = new URLSearchParams(location.hash.slice(1)), my = ++follows, lacks = [], stories = arrOf(D.stories);
    const lens = p.get('lens') || null, sid = p.get('story'), at = Math.max(1, Math.floor(+p.get('step')) || 1) - 1;
    const def = sid ? stories.find(s => s && s.id === sid) : null, steps = def ? arrOf(def.steps).filter(s => s && typeof s === 'object') : [], step = steps[Math.min(at, steps.length - 1)];
    linking = { view: null };
    if (lens !== lensOn && !X.lens(lens)) lacks.push(`no lens “${lens}”`);
    if (sid && !step) lacks.push(`no story “${sid}”`); else if (sid && at >= steps.length) lacks.push(`no step ${at + 1} in “${sid}”`);
    const shown = handle.state.story, k = Math.min(at, steps.length - 1), played = !!step && (!shown || shown.id !== sid || shown.step !== k);
    const v = played ? step.view : p.get('view') || rootId; // a step to show: its own view, gone to first so the step moves nothing
    if (!V[v]) lacks.push(`no view “${v}”`);
    else if (v !== cur || X.busy()) { linking.view = v; const ok = await X.go(v); if (my !== follows) return; if (!ok || !linking) { linking = null; return; } } // the reader's own move won: its landing writes its own entry
    if (played) { handle.play(sid, { step: k, auto: false }); await idle(); if (my !== follows || !linking) return; } // the story at the link's step, shown and not playing on
    else if (!step && shown) handle.play(null); // a link with no story: the one shown stops
    if (!played) { // the link's card, unless a step just chose the selection
      const node = p.get('node') || (load && Q.get('shot') && cur !== rootId ? subjectOf(V[cur]) || (V[cur].nodeIds || [])[0] : null);
      if (node) { if (node !== sel && !X.select({ type: 'node', id: node }, { reveal: !load })) lacks.push(`no card “${node}” here`); }
      else if (handle.selection) X.select(null);
    }
    linking = null; write();
    if (lacks.length) status('Link corrected: ' + lacks.join('; '), 5000);
  }
  const go = (vid, how = {}) => X.go(vid, how);
  const open = nid => X.open(nid), up = () => X.up();
  const findNode = pc.find;

  /* events */
  stage.addEventListener('click', e => {
    if (e.target.closest('#m-pillbtn')) return togglePill();
    const bv = e.target.closest('.vpop [data-v]'); if (bv) return go(bv.dataset.v);
  });
  const setFlow = on => X.setFlow(on);
  /* the key list is a dialog (audit 7): focus goes into it as it opens, and back to where it was as it closes, if it was in it.
     Export, Stories and Lenses are disclosure buttons (aria-controls, no aria-haspopup): their buttons follow in Tab order */
  let helpBack = null;
  const toggleHelp = force => { const b = $('m-helpbox'), was = !b.hidden, on = force ?? !was, inside = b.contains(document.activeElement);
    b.hidden = !on; $('m-help').setAttribute('aria-expanded', on);
    if (on) { openMenu(null); if (!was) { helpBack = document.activeElement; b.focus(); } }
    else if (was && inside) (helpBack && helpBack.isConnected && helpBack !== document.body ? helpBack : $('m-help')).focus(); };
  /* the header's menus, Export, Stories and Lenses (0.14.0): one open at a time, or none. back: focus goes back to the
     button of the menu that closes (Esc) */
  let menuOn = null;
  function openMenu(name, back = false) {
    const was = menuOn; menuOn = name && $(`m-${name}-pop`) ? name : null;
    ['export', 'stories', 'lenses'].forEach(n => { const p = $(`m-${n}-pop`); if (!p) return; p.hidden = n !== menuOn; $(`m-${n}`).setAttribute('aria-expanded', n === menuOn); });
    if (menuOn) toggleHelp(false);
    if (back && was && !menuOn) $(`m-${was}`).focus();
  }
  ['export', 'stories', 'lenses'].forEach(n => { const b = $(`m-${n}`); if (b) b.addEventListener('click', () => openMenu(menuOn === n ? null : n)); });
  document.addEventListener('click', e => {
    const t = e.target, at = s => t.closest && t.closest(s);
    if (!at('.menu')) openMenu(null);
    if (!at('#m-helpbox, #m-help')) toggleHelp(false);
    const cv = at('#m-crumbs [data-v]'); if (cv) { if (innerWidth <= 820) setTree(false); go(cv.dataset.v); }
  }, { signal });
  $('m-outline').addEventListener('click', () => setTree(!document.body.classList.contains('tree-open')));
  if (innerWidth > 1180 && views.length > 1) setTree(true);
  // the views list, open over the map on a phone's width, closes when the window narrows to it: it would cover the map
  let narrow = innerWidth <= 820;
  addEventListener('resize', () => { const n = innerWidth <= 820; if (n && !narrow) setTree(false); narrow = n; }, { signal });
  $('m-help').addEventListener('click', () => toggleHelp());
  const themed = () => $('m-theme').setAttribute('aria-pressed', (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'); // ◐ says which theme is on (issue 135)
  themed(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themed, { signal }); // the system's theme, when the page sets none
  // a theme set from outside the page (a docs frame following its site's switch, a host's script) is said too (audit 59)
  if (typeof MutationObserver === 'function') { const mo = new MutationObserver(themed); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); signal.addEventListener('abort', () => mo.disconnect()); }
  $('m-theme').addEventListener('click', () => { toggleTheme(); themed(); write(); }); // a link that names the theme names the one shown
  $('m-pause').addEventListener('click', e => { paused = !paused; const b = e.currentTarget, l = paused ? 'Play' : 'Pause'; X.pause(paused); b.setAttribute('aria-pressed', paused); b.title = l; b.setAttribute('aria-label', l); b.textContent = paused ? '▶' : '❚❚'; });
  $('m-export-pop').addEventListener('click', e => { const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; openMenu(null); exportView(x); });

  /* stories (#69): the Stories menu plays one; the link names the story and step shown, in the entry of the step's own view
     (0.14.0); Export ▸ Record a story… */
  let told = null; // { id, step }: the story on the map and its step, from the story event
  const stepView = t => { const s = arrOf(D.stories).find(x => x && x.id === t.id), st = s && arrOf(s.steps).filter(x => x && typeof x === 'object')[t.step]; return st ? st.view : null; };
  if ($('m-stories-pop')) $('m-stories-pop').addEventListener('click', e => { const b = e.target.closest('[data-story]'); if (!b) return; openMenu(null); handle.play(b.dataset.story); });
  /* lenses (#94): the Lenses menu puts one on the map; the lens event (the menu's, the handle's, a link's) names it on the
     menu's button and in the link (#lens=<id>) */
  let lensOn = null;
  const lensesPop = $('m-lenses-pop');
  function showLens() {
    if (!lensesPop) return;
    const L = arrOf(D.lenses).find(x => x && x.id === lensOn);
    lensesPop.querySelectorAll('[data-lens]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lens === (lensOn || '')));
    $('m-lenses').innerHTML = `◎<span class="lbl"> ${esc(L ? labelOr(L.title, L.id) : 'Lenses')}</span>`;
  }
  if (lensesPop) lensesPop.addEventListener('click', e => { const b = e.target.closest('[data-lens]'); if (!b) return; openMenu(null);
    if (X.lens(b.dataset.lens || null)) { const L = arrOf(D.lenses).find(x => x && x.id === lensOn); status(L ? 'Lens: ' + labelOr(L.title, L.id) : 'No lens'); } });
  // a story recorded from the page: each view and card the reader comes to is a step (Add step: as the camera is now too);
  // captions are typed in, and Save writes the story's JSON, for the model's `stories`. Not while a story is shown: its
  // steps are not the reader's. Esc closes it (when it is on top); Close, Esc and leaving the page ask first while it holds
  // steps not saved (0.14.0)
  let rec = null;
  const unsaved = () => !!rec && (rec.steps.length > 1 || rec.steps.some(s => s.caption)) && rec.json() !== rec.saved;
  const leaving = e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } };
  function closeRec() { // false: the reader kept it
    if (!rec || (unsaved() && !confirm(`Close the recorder? Its ${rec.steps.length} steps are not saved.`))) return false;
    clearTimeout(rec.t); rec = null; $('m-rec').remove(); removeEventListener('beforeunload', leaving); return true;
  }
  function record() {
    if (rec) return;
    stage.insertAdjacentHTML('beforeend', `<div class="m-rec" id="m-rec" role="region" aria-label="Recording a story">
      <div class="t"><b>● Recording a story</b><span id="m-rec-n"></span></div>
      <input id="m-rec-title" type="text" aria-label="Story title" placeholder="Story title" value="${esc(labelOr(D.title, 'Map') + ': a walk-through')}">
      <ol id="m-rec-list"></ol>
      <div class="b"><button type="button" data-r="add">Add step</button><button type="button" data-r="save">Save JSON</button><button type="button" data-r="close">Close</button></div></div>`);
    const box = $('m-rec'), same = (a, b) => JSON.stringify([a.view, a.select, a.camera]) === JSON.stringify([b.view, b.select, b.camera]);
    rec = { steps: [], t: 0, saved: null };
    const story = () => { const title = $('m-rec-title').value.trim() || 'A walk-through', id = namePart(title, Infinity) || 'story';
      return { id, title, steps: rec.steps.map(({ caption, ...s }) => caption ? { view: s.view, caption, ...s } : s) }; };
    rec.json = () => JSON.stringify(story());
    addEventListener('beforeunload', leaving);
    const draw = () => { $('m-rec-n').textContent = rec.steps.length === 1 ? '1 step' : rec.steps.length + ' steps'; box.querySelector('[data-r="save"]').disabled = !rec.steps.length; // nothing to save: a story needs steps
      $('m-rec-list').innerHTML = rec.steps.map((s, i) => `<li><span>${esc(shortT(labelOr((V[s.view] || {}).title, s.view)))}${s.select ? ' · ' + esc(nodeIn(s.select, s.view).label || s.select) : ''}${s.camera ? ' · zoomed' : ''}</span>
        <input type="text" data-i="${i}" aria-label="Caption of step ${i + 1}" placeholder="Caption" value="${esc(s.caption)}"><button type="button" data-del="${i}" aria-label="Remove step ${i + 1}">✕</button></li>`).join(''); };
    rec.take = force => { // the map as it is: its view, selected card and, once moved by hand, its camera
      const c = X.cam(), s = { view: cur, caption: '' }, last = rec.steps[rec.steps.length - 1];
      if (sel) s.select = sel;
      if (c.touched) s.camera = { x: Math.round(c.s.cx), y: Math.round(c.s.cy), zoom: +c.s.k.toFixed(2) };
      if (force || !last || !same(last, s)) { rec.steps.push(s); draw(); }
    };
    box.addEventListener('input', e => { const i = e.target.dataset.i; if (i != null) rec.steps[+i].caption = e.target.value; });
    box.addEventListener('click', e => {
      const r = e.target.closest('[data-r]')?.dataset.r, del = e.target.closest('[data-del]');
      if (del) { rec.steps.splice(+del.dataset.del, 1); draw(); }
      else if (r === 'add') rec.take(true);
      else if (r === 'save' && rec.steps.length) {
        const st = story(); rec.saved = JSON.stringify(st);
        download(st.id + '.story.json', new Blob([JSON.stringify(st, null, 2) + '\n'], { type: 'application/json' }));
        status('Saved: add it to the model\'s "stories"', 4000);
      } else if (r === 'close') closeRec();
    });
    rec.take();
  }
  const recordSoon = () => { if (rec && !handle.story) { clearTimeout(rec.t); rec.t = setTimeout(() => rec && !handle.story && rec.take(), 650); } }; // once the camera has landed; not a story's steps

  /* ⌘K command box: nodes and views, Enter jumps. Indexed from the model shown, as an update() leaves it (issue 133) */
  const nodeIdx = () => nodes.map(n => ({ n, hay: [n.label, n.id, (n.verbs || []).join(' '), n.what, n.kind, n.type, n.author, ((D.authors || {})[n.author] || {}).name, n.origin].join(' ').toLowerCase() }));
  const viewIdx = () => views.map(v => ({ v, hay: [v.title, v.id, v.caption].join(' ').toLowerCase() }));
  const pal = $('m-pal'), q = $('m-q'), res = $('m-res'), none = $('m-none'); // none: what a search that finds nothing says, beside the list (a list holds only options)
  let hits = [], hi = 0;
  const mark = (s, words) => { const ws = words.filter(w => w.length > 1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // on the label, then escaped: never inside an entity or a tag
    return String(s ?? '').split(ws.length ? new RegExp('(' + ws.join('|') + ')', 'ig') : /(?!)/).map((p, i) => i % 2 ? `<mark>${esc(p)}</mark>` : esc(p)).join(''); };
  const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
  const drawnHere = id => !!geo.byId[id] || X.boxHere(id); // a card here, or an element this view draws as a box
  function drawHits() {
    const qs = q.value.trim().toLowerCase(), words = qs.split(/\s+/).filter(Boolean);
    if (!qs) { // empty query: the views you can jump to, starting from where you are
      hits = [...kidsOf(cur), ...views.filter(v => v.id !== cur && !kidsOf(cur).includes(v))].slice(0, 8).map(v => ({ t: 'v', v }));
    } else {
      const starts = s => String(s || '').toLowerCase().startsWith(qs) ? 0 : 1;
      const ns = nodeIdx().filter(x => words.every(w => x.hay.includes(w))).sort((a, b) => starts(a.n.label || a.n.id) - starts(b.n.label || b.n.id) || drawnHere(b.n.id) - drawnHere(a.n.id)).slice(0, 7).map(x => ({ t: 'n', n: x.n }));
      const vs = viewIdx().filter(x => words.every(w => x.hay.includes(w))).slice(0, 5).map(x => ({ t: 'v', v: x.v }));
      hits = [...ns, ...vs];
    }
    hi = Math.min(hi, Math.max(0, hits.length - 1)); hits.length ? q.setAttribute('aria-activedescendant', 'm-o' + hi) : q.removeAttribute('aria-activedescendant'); // a reader says the highlighted result
    if (!hits.length) {
      const near = nodes.map(n => [n, lev(qs, String(n.label || n.id).toLowerCase().replace(/^\//, '').slice(0, qs.length + 2))]).sort((a, b) => a[1] - b[1])[0];
      res.innerHTML = ''; q.setAttribute('aria-expanded', false); none.innerHTML = `<div class="none"><div aria-hidden="true">⌕</div><h2>Nothing called “${esc(q.value.trim())}”</h2>${near && near[1] <= Math.max(2, qs.length / 3) ? `Did you mean <button data-fill="${esc(near[0].label || near[0].id)}">${esc(near[0].label || near[0].id)}</button>?` : 'Try a skill, verb, script or view name.'}</div>`;
      return;
    }
    let html = '', last = ''; none.innerHTML = ''; q.setAttribute('aria-expanded', true);
    hits.forEach((h, i) => {
      const grp = !qs ? 'Views' : h.t === 'n' ? 'Nodes' : 'Views';
      if (grp !== last) { html += `<div class="gt">${grp}</div>`; last = grp; }
      if (h.t === 'n') { const k = kindOf(h.n.kind, true), vs = viewsWith(h.n.id), here = drawnHere(h.n.id);
        html += `<button class="fr${i === hi ? ' on' : ''}" role="option" id="m-o${i}" aria-selected="${i === hi}" data-i="${i}"><i style="background:var(--um-${KIND[k][0]})"></i><b>${mark(h.n.label || h.n.id, words)}</b><span>${esc(h.n.type ? wordOf(D, vs[0], h.n.id, h.n.type) : KIND[k][1])} · ${here ? 'this view' : esc(vs.map(v => shortT(labelOr(v.title, v.id))).slice(0, 2).join(', ') || 'no view')}</span></button>`; }
      else html += `<button class="fr${i === hi ? ' on' : ''}" role="option" id="m-o${i}" aria-selected="${i === hi}" data-i="${i}"><i style="background:var(--um-accent)"></i><b>${mark(labelOr(h.v.title, h.v.id), words)}</b><span>${countText(X.ctx(), h.v, cur, geo)}${h.v.id === cur ? ' · here' : ''}</span></button>`;
    });
    res.innerHTML = html;
    const on = res.querySelector('.fr.on'); on && on.scrollIntoView({ block: 'nearest' });
  }
  let palBack = null; // where focus was before search opened: Esc gives it back
  const openPal = () => { toggleHelp(false); openMenu(null); palBack = document.activeElement; pal.hidden = false; q.value = ''; hi = 0; drawHits(); q.focus(); };
  const closePal = (back = false) => { pal.hidden = true; q.blur(); if (back && palBack && palBack.isConnected && palBack !== document.body) palBack.focus(); palBack = null; };
  // a pick puts focus on what it found (the selected card, else the map): a keyboard reader carries on from there (audit 9)
  const pickHit = h => { if (!h) return; closePal(); Promise.resolve(h.t === 'n' ? findNode(h.n.id) : go(h.v.id)).then(ok => { if (ok !== false) X.focus(); }); };
  q.addEventListener('input', () => { hi = 0; drawHits(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { hi = Math.min(hits.length - 1, hi + 1); drawHits(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); drawHits(); e.preventDefault(); }
    else if (e.key === 'Enter') { pickHit(hits[hi]); e.preventDefault(); }
    else if (e.key === 'Escape') { closePal(true); e.preventDefault(); }
    e.stopPropagation();
  });
  pal.addEventListener('click', e => { const f = e.target.closest('[data-fill]'); if (f) { q.value = f.dataset.fill; hi = 0; drawHits(); q.focus(); return; } const b = e.target.closest('[data-i]'); if (b) pickHit(hits[+b.dataset.i]); });
  res.addEventListener('pointermove', e => { const b = e.target.closest('[data-i]'); if (b && +b.dataset.i !== hi) { hi = +b.dataset.i; q.setAttribute('aria-activedescendant', 'm-o' + hi); res.querySelectorAll('.fr').forEach(x => { const on = +x.dataset.i === hi; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); } });
  pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
  $('m-find').addEventListener('click', openPal);

  /* keyboard (0.14.0): one router, which reads each key from the top open layer down (an example shown full size, search,
     the key list, a menu, the view's popover, the story recorder, a story, then the map) and the KEYS table. Enter, Space
     and arrows aimed at a control outside the map are that control's own; the map's keys reach its canvas from anywhere
     else on the page */
  const layer = () => pc.modal() ? 'lightbox' : !pal.hidden ? 'search' : !$('m-helpbox').hidden ? 'help' : menuOn ? 'menu'
    : $('m-vpop') && !$('m-vpop').hidden ? 'pill' : rec ? 'recorder' : told ? 'story' : 'map';
  function closeTop(e, inCanvas) { // Esc and Backspace: the top open layer closes; else the map's own: the selection clears, then up a level
    const top = layer();
    if (top === 'search') closePal(true);
    else if (top === 'help') toggleHelp(false);
    else if (top === 'menu') openMenu(null, true);
    else if (top === 'pill') togglePill(false);
    else if (top === 'recorder') closeRec(); // asking first when it holds steps not saved
    else if (top === 'story') handle.play(null); // Backspace too
    else return !inCanvas && X.key(e); // in the canvas, the canvas takes its own
  }
  const CONTROL = 'a[href], button, input, select, textarea, summary, [contenteditable], [role=button], [role=tab], [role=option], [tabindex]:not([tabindex="-1"])';
  document.addEventListener('keydown', e => {
    if (!X) return;
    const k = e.key, t = e.target, top = layer(), own = () => { e.preventDefault(); e.stopPropagation(); };
    if (top === 'lightbox') { if (pc.key(e)) own(); return; } // it holds every key while open: Esc closes it, Tab keeps to it, Enter and Space press its buttons
    if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K')) { own(); return top === 'search' ? closePal(true) : openPal(); }
    if (e.metaKey || e.ctrlKey || e.altKey || (t && t.matches && t.matches('input, textarea, select, [contenteditable]'))) return; // the browser's own shortcuts; typing
    const inCanvas = e.composedPath().includes(X.stage), row = KEYS.find(r => r[2] && r[2].includes(k));
    if (top === 'search' && k !== 'Escape' && k !== 'Backspace') return; // search covers the map: its field and hits take their own keys
    if (row) { if (row[3](e, inCanvas) !== false) own(); return; }
    if (inCanvas || (t && t.closest && t.closest(CONTROL) && /^(Enter| |Arrow|Page|Home|End)/.test(k))) return; // the canvas's own keys; a control's own
    if (X.key(e)) own(); // the map's keys, from anywhere else on the page
  }, { capture: true, signal });
  addEventListener('popstate', () => follow(), { signal }); // Back, Forward, or an edited link

  /* export: resolve CSS variables into attributes so the file stands alone */
  const standalone = scale => X.standalone(scale);
  if (Q.get('still')) { const sv = Q.get('still'), sc = +(Q.get('scale') || 2);
    const tick = async () => { if (!geo) return setTimeout(tick, 100);
      if (!V[sv]) return document.documentElement.setAttribute('data-still', JSON.stringify({ view: sv, error: `the model has no view "${sv}"` })); // an answer, not a wait: no still comes
      if (cur !== sv) { await go(sv, {}); return setTimeout(tick, 200); }
      X.stage.querySelectorAll('.flowline').forEach(e => e.remove()); const out = standalone(sc), b = geo.bounds; document.documentElement.setAttribute('data-still', JSON.stringify({ view: sv, w: Math.ceil(b.w * sc), h: Math.ceil(b.h * sc) }));
      document.body.innerHTML = '<div id="still">' + out + '</div>'; document.body.style.margin = '0'; };
    setTimeout(tick, 300); }
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportView(x) {
    if (x === 'record') return record();
    // the model's own name, then the view's: the JSON export is the whole model, named by the first alone (audit 31: cut at the view's id)
    const base = namePart(D.slug) || namePart(D.title) || 'map', stem = base + '-' + (namePart(cur, 60, false) || 'view-' + (views.findIndex(v => v && v.id === cur) + 1));
    if (x === 'svg') download(stem + '.svg', new Blob([standalone(1)], { type: 'image/svg+xml' }));
    else if (x === 'png') {
      pngOf(standalone(2)).then(bl => bl && download(stem + '.png', bl));
    } else if (x === 'link') { navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => status('Link copied'), () => status(location.href)); }
    // the model the page was given, less what render added to it (asWritten): not the map's working copy, whose lines carry an _id and
    // whose views a parent rewritten to the view it names, which a file saved and opened again would keep (audit 29)
    else if (x === 'json') { const model = asWritten(X.model()); let text; try { text = JSON.stringify(model, null, 2); } catch { return status('This model cannot be written as JSON'); }
      download(base + '.json', new Blob([text], { type: 'application/json' })); }
    if (x !== 'link') status('Exported ' + x.toUpperCase());
  }


  let flowPref = null; try { flowPref = reducedMotion() ? null : localStorage.getItem('visual-flow'); } catch (_) {} // the reader's ≋ and F; under reduced motion no flow is drawn
  const p0 = new URLSearchParams(location.hash.slice(1));
  const v0 = V[p0.get('view')] ? p0.get('view') : rootId;
  const handle = render($('m-canvas'), model, {
    view: v0, minimap: true, flow: flowPref ? flowPref === '1' : undefined,
    on: { story: e => { told = e.step == null ? null : { id: e.story, step: e.step }; app.classList.toggle('story', !!told); pc.story(e);
      const sv = told && stepView(told); if (X && !X.busy() && (!sv || sv === cur || !V[sv])) write(); } }, // a step on another view: in that view's entry, once it shows (#69)
    _page: {
      instant: options.instant, defer: !options.instant, tour: !(Q.get('still') || Q.get('pdf')), openHint: !Q.get('reader'), kinds: true, status, tourAt: Q.get('shot') ? Q.get('at') : null,
      wide: () => innerWidth > 820,
      upTarget: () => stack.length > 1 ? stack[stack.length - 2] : (V[cur] || {}).parent,
      inset: () => { const top = Math.max(58, 26 + $('m-vpill').offsetHeight); if (innerWidth <= 820) return { t: top, r: 12, b: 12, l: 12 }; const lg = $('m-legend'), on = lg && !lg.hidden; // the legend box sits bottom left
        return [{ t: top, r: 20, b: 40 + (on ? lg.offsetHeight + 8 : 0), l: 20 }, { t: top, r: 20, b: 40, l: 20 + (on ? lg.offsetWidth + 8 : 0) }]; },
      onNavigate: (vid, prev, mode) => { togglePill(false);
        if (stack.includes(vid)) stack = stack.slice(0, stack.indexOf(vid) + 1); else if (mode === 'in' && prev) stack = [...stack, vid]; else stack = chain(vid); },
      onMount: inner => { X = inner; ({ D, views, nodes, N, V, rootId, subjectOf, viewsWith, kidsOf, chain, viewEdges, planCache } = X.ctx()); nodeIn0 = X.ctx().nodeIn;
        cam = X.cam(); geo = X.geo(); svg = X.svg(); cur = X.view(); if (paused) X.pause(true);
        if (!stack.length || !stack.includes(cur)) stack = chain(cur);
        renderChrome(); },
      onBackground: () => togglePill(false),
      onFlow: on => { try { localStorage.setItem('visual-flow', on ? '1' : '0'); } catch (_) {} },
      onReady: () => { $('m-ghosts').remove(); queueMicrotask(() => follow(true)); }, // the link it opened with: its card, story step and lens (#69, #94), once the page listens
    },
  });
  const destroy0 = handle.destroy;
  handle.destroy = () => { ac.abort(); if (rec) clearTimeout(rec.t); destroy0(); }; // the page's listeners go with the map
  handle.on('select', ({ target, targets }) => { sel = target && target.type === 'node' ? target.id : null; pc.select(target, targets); if (!X.busy()) write(); recordSoon(); }); // mid-move: the view's entry, once it lands
  handle.on('viewchange', e => { pc.unlight(); recordSoon();
    if (linking && linking.view === e.view) return; // a link's own move: its entry, written once the link has settled
    linking = null; write(true); }); // a new view, a new entry (a move the reader started while a link was followed, too)
  handle.on('lens', e => { lensOn = e.lens; showLens(); write(); });
  // #pdf=1 (umlimator.py pdf, #93): the page becomes a document for Chrome to print (printDoc), once the fonts are in,
  // after the map's own redraw for them
  if (Q.get('pdf')) (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => printDoc(X, model, Q));
  return handle;
}
/* #pdf=1[&views=a,pic-*][&paper=letter] (umlimator.py pdf): the map as a document to hand in for a review, laid out here a
   page at a time, as Chrome's own page breaks can't be read back for the contents. Each sheet is one page: @page sets the
   paper (A4 or US Letter, across) and its margins, and each sheet ends in the title and "page N of M".
   - The cover: the title, the date, the model's file, a summary line and the contents, each view with its page.
   - Each view, from a page of its own: a header (the view's path and its caption), its picture (toSVG()'s, in vectors)
     as large as the page allows and never larger than drawn, the legend of what it draws, then tables of its cards,
     lines and boxes (on a typed view, "Elements": each element's type and members, or its type's word and rows, and each
     line's kind).
     They fill two columns below the picture, or one column beside a picture too tall to leave room below. A table that
     runs out of room goes on in the next column, under its heading and header row again; a row is never cut, and a
     heading never ends a column.
   - The rules, when the model has any: each holding or broken in the views printed, and what breaks it. */
function printDoc(X, model, Q) {
  const { D, views, V, N, chain, viewEdges, geoCache } = X.ctx();
  const only = (Q.get('views') || '').split(',').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } }), ids = new Set(views.map(v => v.id)), want = v => !only.length || only.some(p => v.id === p || (p.endsWith('*') && !ids.has(p) && v.id.startsWith(p.slice(0, -1))));
  const shown = views.filter(want).map(v => [v, X.standalone(1, v.id)]).filter(([, s]) => s), on = new Set(shown.map(([v]) => v.id));
  const rs = shown.length ? arrOf(D.rules).filter(r => r && typeof r === 'object' && (r.from || r.to || r.noCycles)) : []; // as rules() reads them; none without a view, read as mapContext reads them (audit 20)
  const broken = rules(model).filter(b => on.has(b.view)); // judged in the views printed, as the document says
  const [pw, ph] = Q.get('paper') === 'letter' ? [279.4, 215.9] : [297, 210], title = esc(labelOr(D.title, 'Map')); // the paper across, in mm
  const count = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`, T = v => esc(labelOr(v.title, v.id)), full = c => Object.assign(c, { full: true });
  const cards = v => arrOf(v.nodeIds).filter(i => N[i]), boxes = v => handBoxes(v).filter(c => c && c.id); // as rules() reads a view
  // each view's tables, made once: the cover counts the lines they list (a typed view's are those its type draws, audit 15)
  const made = new Map(shown.map(([v]) => [v, tablesOf(X.ctx(), v, geoCache[v.id].g)]));
  document.title = String(labelOr(D.title, 'Map')); document.body.removeAttribute('class');
  document.body.innerHTML = `<style>@page { size: ${pw}mm ${ph}mm; margin: 11mm 13mm 9mm; background: var(--um-bg); }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: var(--um-bg); } body { margin: 0; background-image: none; }
    #um-pdf { color: var(--um-text); font: 8.5pt/1.4 var(--um-sans); font-variant-numeric: tabular-nums; }
    #um-pdf .sheet { width: ${pw - 26}mm; height: ${ph - 20.5}mm; padding: 0; display: flex; flex-direction: column; overflow: hidden; break-after: page; }
    #um-pdf .sheet:last-child { break-after: auto; }
    #um-pdf header { display: flex; align-items: baseline; justify-content: space-between; gap: 16pt; padding-bottom: 5pt; border-bottom: .75pt solid var(--um-border-2); }
    #um-pdf h1 { font-size: 26pt; line-height: 1.12; letter-spacing: -.02em; font-weight: 700; margin: 0 0 10pt; }
    #um-pdf h2, #um-pdf .h2 { display: block; font: 650 14pt/1.25 var(--um-sans); letter-spacing: -.01em; text-transform: none; color: var(--um-text); margin: 0; }
    #um-pdf h2::after { content: none; } #um-pdf .up { color: var(--um-muted); font-weight: 450; }
    #um-pdf .meta { color: var(--um-muted); font-size: 8pt; white-space: nowrap; } #um-pdf .cap { color: var(--um-muted); font-size: 9pt; margin: 4pt 0 0; }
    #um-pdf .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; margin-top: 8pt; } #um-pdf .body.side { flex-direction: row; gap: 16pt; }
    #um-pdf figure { flex: none; align-self: center; margin: 0; border: 1px solid var(--um-border); border-radius: 4pt; overflow: hidden; }
    #um-pdf .side figure { align-self: flex-start; } #um-pdf figure svg { display: block; }
    #um-pdf .lg { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 3pt 14pt; font-size: 7.5pt; } #um-pdf .lg > b { font-weight: 650; }
    #um-pdf .side .lg { margin-bottom: 10pt; }
    #um-pdf .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); grid-template-rows: minmax(0, 1fr); gap: 18pt; }
    #um-pdf .col { min-height: 0; overflow: hidden; } #um-pdf .blk + .blk { margin-top: 10pt; }
    #um-pdf .h3 { font-size: 9pt; font-weight: 650; margin: 0 0 3pt; } #um-pdf .h3 span { color: var(--um-muted); font-weight: 450; }
    #um-pdf table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8pt; line-height: 1.35; }
    #um-pdf th { text-align: left; font-size: 7pt; font-weight: 600; color: var(--um-muted); padding: 0 6pt 2.5pt 0; border-bottom: .75pt solid var(--um-border-2); }
    #um-pdf td { vertical-align: top; padding: 2.5pt 6pt 2.5pt 0; border-bottom: .5pt solid var(--um-border); overflow-wrap: anywhere; }
    #um-pdf td b { font-weight: 600; } #um-pdf td small { display: block; color: var(--um-muted); font: 7pt/1.3 var(--um-mono); }
    #um-pdf td p { margin: 0; } #um-pdf td ul { margin: 0; padding-left: 10pt; }
    #um-pdf td i { display: inline-block; font-style: normal; margin-right: 4pt; } #um-pdf i.sw { width: 8pt; height: 6pt; border: 1pt solid; border-radius: 1.5pt; }
    #um-pdf i.w { width: 10pt; border-top: 1.5pt solid; vertical-align: middle; }
    #um-pdf i.num { min-width: 10pt; height: 10pt; padding: 0 2pt; border-radius: 5pt; background: var(--um-text); color: var(--um-bg); font: 700 6.5pt/10pt var(--um-sans); text-align: center; }
    #um-pdf .cards th:nth-child(1), #um-pdf .boxes th:nth-child(1) { width: 32%; } #um-pdf .cards th:nth-child(2) { width: 20%; }
    #um-pdf .lines th.n { width: 6%; } #um-pdf .lines th:nth-last-child(3) { width: 42%; } #um-pdf .lines th:last-child { width: 24%; }
    #um-pdf .rules th:nth-child(1) { width: 30%; } #um-pdf .rules th:nth-child(2) { width: 24%; } #um-pdf .rules th:nth-child(3) { width: 10%; }
    #um-pdf .ok { color: var(--um-green); font-weight: 650; } #um-pdf .no { color: var(--um-rose); font-weight: 650; }
    #um-pdf .cover .body { flex-direction: row; gap: 28pt; margin-top: 0; } #um-pdf .cover .ttl { flex: 0 0 40%; padding-top: 34mm; } #um-pdf .cover .cols { padding-top: 34mm; }
    #um-pdf .sum { font-size: 10pt; margin: 6pt 0 0; } #um-pdf .toc td { padding: 4pt 6pt 4pt 0; } #um-pdf .toc td.pg { width: 3em; padding-right: 0; text-align: right; }
    #um-pdf .toc td span { display: block; color: var(--um-muted); font-size: 7.5pt; }
    #um-pdf footer { display: flex; justify-content: space-between; margin-top: 6pt; padding: 5pt 0 0; border-top: .5pt solid var(--um-border); color: var(--um-dim); font: 7pt var(--um-sans); }</style><main id="um-pdf"></main>`;
  const doc = document.getElementById('um-pdf');
  // a sheet: its header, the body its content fills, and its footer (`key` names the view or section it starts)
  const sheet = (head, key = '') => { doc.insertAdjacentHTML('beforeend', `<section class="sheet" data-key="${key}">${head}<div class="body"></div><footer><span>${title}</span><span class="pn"></span></footer></section>`);
    return doc.lastElementChild.querySelector('.body'); };
  const cols = (body, n) => { body.insertAdjacentHTML('beforeend', `<div class="cols" style="--n:${n}">${'<div class="col"></div>'.repeat(n)}</div>`); return [...body.lastElementChild.children]; };
  // tables into columns, next() handing out the next column (null: no more, and pour() says false). A table after the
  // first starts a column of its own while its page has one left. It starts with its heading, header row and first two
  // rows (its only one), else in the next column; a row that does not fit goes on, whole, in the next, never the last one
  // alone. A column handed out fresh on a page of its own (`full`) takes a table's start whatever its size.
  const pour = (next, blocks) => { let box = next();
    const over = () => box.lastElementChild.getBoundingClientRect().bottom > box.getBoundingClientRect().bottom - 2, fresh = () => !box.firstElementChild;
    for (const [n, b] of blocks.entries()) { let tb = null;
      if (n && !fresh() && next.spare()) box = next();
      const open = (i, k, force) => { box.insertAdjacentHTML('beforeend', `<div class="blk">${b.title ? `<div class="h3">${b.title}${i ? ' <span>(continued)</span>' : ''}</div>` : ''}<table class="${b.cls}">${b.head ? `<thead><tr>${b.head}</tr></thead>` : ''}<tbody>${b.rows.slice(i, i + k).join('')}</tbody></table></div>`);
        if (force || !over()) return box.lastElementChild.querySelector('tbody'); box.lastElementChild.remove(); };
      for (let i = 0; i < b.rows.length;) {
        if (!tb) { const k = Math.min(2, b.rows.length - i);
          while (!(tb = open(i, k)) && !(fresh() && box.full)) if (!(box = next())) return false;
          tb ||= open(i, 1) || open(i, 1, true); // ponytail: a row taller than a page is cut at its foot
          i += tb.rows.length; continue; }
        tb.insertAdjacentHTML('beforeend', b.rows[i]);
        if (!over()) { i++; continue; }
        tb.lastElementChild.remove();
        if (i === b.rows.length - 1 && tb.rows.length > 2) { tb.lastElementChild.remove(); i--; }
        if (!(box = next())) return false; tb = null;
      } }
    return true; };
  // the columns of a page, then (paging) of as many pages as it takes, or (no `head`) none more
  const paging = (head, n, first) => { const q = [...first], f = () => q.shift() || (head ? (q.push(...cols(sheet(head(true)), n).map(full)), q.shift()) : null);
    f.spare = () => q.length > 0; return f; };

  // the cover, and its contents: a view's caption under its title, indented under the views printed that hold it
  const day = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const sum = [count(shown.length, 'view'), count(new Set(shown.flatMap(([v]) => cards(v))).size, 'card'), count(new Set(shown.flatMap(([v]) => made.get(v).lineIds)).size, 'line'), ...(rs.length ? [count(rs.length, 'rule')] : [])];
  const cover = sheet('', 'cover'); cover.parentNode.classList.add('cover');
  cover.insertAdjacentHTML('beforeend', `<div class="ttl"><h1>${title}</h1><p class="cap">${day}${D.source ? ` · <span class="mono">${esc(D.source)}</span>` : ''}</p><p class="sum">${sum.join(' · ')}</p></div>`);
  pour(paging(() => '<header><div class="h2">Contents <span class="up">(continued)</span></div></header>', 2, cols(cover, 1)), [{ title: 'Contents', cls: 'toc', rows: [
    ...shown.map(([v], i) => `<tr><td style="padding-left:${chain(v.id).slice(0, -1).filter(id => on.has(id)).length * 12}pt">${T(v)}${v.caption ? `<span>${esc(v.caption)}</span>` : ''}</td><td class="pg" data-pg="${i}"></td></tr>`),
    ...(rs.length ? ['<tr><td>Rules</td><td class="pg" data-pg="rules"></td></tr>'] : [])] }]);

  shown.forEach(([v, svg], vi) => {
    const g = geoCache[v.id].g, [ids, es, held] = made.get(v).map(t => t.rows), tables = made.get(v).filter(x => x.rows.length);
    const up = chain(v.id).slice(0, -1).map(id => `<span class="up">${T(V[id])} › </span>`).join('');
    const head = more => `<header>${more ? `<div class="h2">${up}${T(v)} <span class="up">(continued)</span></div>` : `<h2>${up}${T(v)}</h2>`}<span class="meta">${[count(ids.length, 'card'), count(es.length, 'line'), ...(held.length ? [count(held.length, 'box', 'boxes')] : [])].join(' · ')}</span></header>${!more && v.caption ? `<p class="cap">${esc(v.caption)}</p>` : ''}`;
    const body = sheet(head(false), vi);
    body.insertAdjacentHTML('beforeend', `<figure>${svg}</figure><div class="lg"><b>Legend</b>${legendItems([g], 'opens a view of its own').join('')}</div>`);
    // the picture as large as the page allows, never larger than drawn: below it the legend, then two columns of tables;
    // one too tall for that keeps the page's height, with the legend and one column beside it. Smaller (down to 70%, and
    // to a scale of 0.6 at least) when that keeps the tables on its page; else they go on over the next pages.
    const fig = body.firstElementChild, lg = fig.nextElementSibling, s = fig.firstElementChild, b = s.viewBox.baseVal, W = body.clientWidth - 2, H = body.clientHeight - 2, SIDE = 340;
    let k = Math.min(1, W / b.width, (H - lg.offsetHeight - 16) / b.height); const side = b.width * k <= W - SIDE;
    if (side) k = Math.min(1, H / b.height, (W - SIDE) / b.width);
    body.classList.toggle('side', side);
    const lay = (f, more) => { s.setAttribute('width', b.width * k * f); s.setAttribute('height', b.height * k * f); body.querySelector('.cols')?.remove();
      const first = cols(body, side ? 1 : 2); if (side) first[0].append(lg); return pour(paging(more && head, 2, first), tables); };
    [1, .9, .8, .7].some(f => k * f >= Math.min(k, .6) && lay(f)) || lay(1, true);
  });

  if (rs.length) { // the rules: where rules() judges each (a rule that names boxes, in the views that draw one; `views` narrows it)
    // ponytail: rules()' own scope, again; one helper for both if it changes
    const anyBox = new Set(views.flatMap(v => boxes(v).map(c => c.id))), printed = shown.map(([v]) => v);
    const where = r => { const named = [r.from, r.to].flatMap(s => boxesNamed(s, id => anyBox.has(id) && !N[id]));
      const vs = printed.filter(v => (!Array.isArray(r.views) || r.views.includes(v.id)) && (!named.length || boxes(v).some(c => named.includes(c.id))));
      return vs.length === printed.length ? 'every view printed' : vs.length ? vs.map(T).join(', ') : 'no view printed'; };
    const said = (x, r) => x.message.slice(`view ${x.view}: `.length).replace(`, which breaks rule "${labelOr(r.title, r.id)}"`, '').replace(` breaks rule "${labelOr(r.title, r.id)}"`, '').replace(/^edge /, ''); // its message's words: A→B, or the boxes in a cycle
    const head = more => `<header>${more ? '<div class="h2">Rules <span class="up">(continued)</span></div>' : '<h2>Rules</h2>'}<span class="meta">${count(rs.length, 'rule')} · ${new Set(broken.map(x => x.rule)).size} broken</span></header>${more ? '' : '<p class="cap">Judged in the views printed here.</p>'}`;
    pour(paging(head, 1, cols(sheet(head(false), 'rules'), 1).map(full)), [{ cls: 'rules', head: '<th>Rule</th><th>Applies in</th><th>State</th><th>Lines that break it</th>', rows: rs.map(r => { const bs = broken.filter(x => x.rule === r.id);
      return `<tr><td><b>${esc(labelOr(r.title, r.id))}</b></td><td>${where(r)}</td><td class="${bs.length ? 'no' : 'ok'}">${bs.length ? 'broken' : 'holds'}</td><td>${bs.map(x => `<div>${T(V[x.view])}: ${esc(said(x, r))}</div>`).join('') || '<span class="up">none</span>'}</td></tr>`; }) }]);
  }
  const all = [...doc.children]; // the pages, numbered, and the contents' page of each view
  all.forEach((p, i) => { p.querySelector('.pn').textContent = `page ${i + 1} of ${all.length}`; });
  doc.querySelectorAll('[data-pg]').forEach(td => { td.textContent = all.findIndex(p => p.dataset.key === td.dataset.pg) + 1; });
}

// a view's tables, out of printDoc for Node's tests
// a typed element's word in view v: "Class", "Table": its type's word hook, else one rule for every type (registry.js kindWord):
// its type in words, a type of no notation as written, and no type (or "") the kind its view draws and names one as (audit 30)
const wordOf = (D, v, id, t) => { const T = diagramOf(v) || {}; return T.word?.(D, id, v) ?? (t ? kindWord(t) : untypedKind(T) ?? ''); };
// a typed line's word in view v: its type's, and a line of no notation the kind its view draws one as ("Line", "Data flow": audit 30)
const lineWordOf = (T, t) => (!t ? untypedLine(T) ?? '' : !String(t).includes('.') && Object.hasOwn(T, 'untypedLine') && T.untypedLine ? T.untypedLine : kindWord(t));
function tablesOf({ D, N, nodeIn, viewEdges }, v, g) {
  const typed = (v.diagram ?? 'map') !== 'map';
  const wk = new Map(g.edges.flatMap(d => edgeRefIds(d).map(id => [id, d.wk])));
  const at = idTable(Object.fromEntries(g.nodes.map(n => [n.id, n]))), framed = new Set([...arrOf(g.families), ...arrOf(g.bands)].map(f => f && f.id));
  // each listed element once; a typed view's only those its type draws, as a box, a frame or a band (a mindmap draws no class: audit 29)
  const cards = v => [...new Set(arrOf(v.nodeIds).filter(i => N[i] && (!typed || at[i] || framed.has(i))))], boxes = v => handBoxes(v).filter(c => c && c.id);
  const ids = cards(v), es = viewEdges(v).filter(e => (typed ? wk.has(e._id) || at[e._id] : e.from !== e.to)), seq = v.render === 'sequence', stepped = es.some(e => e.step != null); // a typed view's: those its type draws, a self-line too (a communication message is drawn as a row); a map draws no self-loop
  if (typed) { const have = new Set(es.map(e => e._id)); // and a line its type draws to an end's owner (a member's, a port's), between the owners
    const M = new Map(arrOf(D.edges).filter(Boolean).map(x => [x._id, x]));
    g.edges.forEach(d => edgeRefIds(d).forEach(id => { const e = M.get(id); if (e && !have.has(id)) { have.add(id); es.push({ ...e, from: d.from, to: d.to }); } }));
    // a line its type implies (C4's, from relationships between what the view's elements hold): one row, as drawn
    g.edges.forEach(d => { if (Array.isArray(d.implied) && !have.has(d._id)) { have.add(d._id); es.push({ _id: d._id, from: d.from, to: d.to, label: d.label, type: 'c4.Implied' + String(d.type).split('.').pop() }); } }); }
  // an open package's qualified name, its title less its «stereotypes» (owners.js); not a frame's title ("ibd [Block] EBike")
  const boxName = f => { const t = f && typeof f.title === 'string' ? f.title.replace(/^(«[^»]*» )+/, '') : ''; return t.endsWith('::' + f?.label) ? t : undefined; };
  // a typed view's drawn name: sales::Order; one it draws with no name (an unnamed BPMN gateway or event), its kind as the Kind
  // column says it, "Parallel gateway", as its accessible name and describe() do, never its id (audit 30)
  const drawn = id => (typed && (at[id]?.label ?? boxName((g.families || []).find(f => f.id === id)))) || nodeIn(id, v.id).label || (typed && at[id] && N[id] ? wordOf(D, v, id, nodeIn(id, v.id).type) : id);
  // an end that is no element but a box the layout draws (a parametric view's value or constraint property, a part): its
  // drawn name, "usable : UsableEnergy", not its member id (audit 32)
  const name = (v, id) => esc(N[id] ? drawn(id) : (typed && at[id] && typeof at[id].label === 'string' && at[id].label) || (boxes(v).find(c => c.id === id) || {}).label || id);
  const held = boxes(v).map(c => [c, arrOf(c.nodeIds).filter(i => ids.includes(i))]).filter(([, ins]) => ins.length);
  const T = diagramOf(v) || {}, asText = (T.member || {}).print || elName; // a member as its type writes it, else its name ("" too: its id, audit 35)
  return Object.assign([
    { title: `${typed ? 'Elements' : 'Cards'} <span>${ids.length}</span>`, cls: 'cards', head: `<th>Card</th><th>Kind</th><th>${typed ? 'Members' : 'What it is'}</th>`, rows: ids.map(id => { const c = nodeIn(id, v.id), t = KIND[kindOf(c.kind, true)], d = at[id] || {}, sub = c.sublabel ?? c.sub, rs = typed && T.rows?.(D, v, id);
      return `<tr><td>${d.step ? `<i class="num">${esc(d.step)}</i>` : ''}<b>${esc(drawn(id))}</b>${d.kids || d.opens ? ' ⤢' : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</td>`
        + (typed ? `<td>${esc(wordOf(D, v, id, c.type))}</td><td>${(Array.isArray(rs) ? rs : arrOf(c.members).filter(m => m && typeof m === 'object').map(m => asText(m))).map(r => `<p>${esc(r)}</p>`).join('')}</td></tr>`
          : `<td><i class="sw" style="border-color:var(--um-${t[0]});background:var(--um-${t[0]}-f)"></i>${t[1]}</td><td>${c.what ? md(c.what) : ''}</td></tr>`); }) },
    { title: `Lines <span>${es.length}</span>`, cls: 'lines', head: `${seq || stepped ? '<th class="n">#</th>' : ''}<th>From → to</th><th>Label</th><th>${typed ? 'Kind' : 'Technology'}</th>`, rows: (stepped && !seq ? [...es].sort((a, b) => stepOrder(a.step, b.step)) : es).map((e, i) => { const w = wk.get(e._id) || 'calls', t = typed && T.text?.(D, v, e._id); // a type's text for the line (S17), else its label
      return `<tr>${seq ? `<td>${i + 1}</td>` : stepped ? `<td>${esc(e.step ?? '')}</td>` : ''}<td><i class="w" style="border-color:var(--um-w-${w})"></i>${name(v, e.from)} → ${name(v, e.to)}</td><td>${t || e.label ? esc(t || e.label) : typed ? '' : `<span class="up">${w}</span>`}</td><td>${esc(typed ? lineWordOf(T, e.type) : e.sublabel || '')}</td></tr>`; }) },
    { title: `Boxes <span>${held.length}</span>`, cls: 'boxes', head: '<th>Box</th><th>Holds</th>', rows: held.map(([c, ins]) => `<tr><td><b>${esc(c.label || c.id)}</b></td><td>${andList(ins.map(i => name(v, i)))}</td></tr>`) },
  ], { lineIds: (mine => es.map(e => mine.has(e) ? v.id + '\0' + e._id : e._id))(new Set(arrOf(v.edges))) }); // the lines it lists, for the cover's count: a view's own line by its view too, as two lists name theirs alike (a->b#0)
}
