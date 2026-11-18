import { diagramOf, kindWord, untypedKind, untypedLine, aWord } from './registry.js';
// an object that holds itself (a host's cycle, which copyOf() keeps) is written "[cycle]" where it comes back on its own path (audit 27:
// the sorted copy the replacer gives is new each time, so JSON.stringify's own check never fired and the stack overflowed)
// a BigInt marked, so jsonText() writes it bare (2n), not as the text "2n"; a text that starts as the mark does gets one more (audit 29).
// Always marked, so diff() never reads the text "2n" and the BigInt 2n as one value (audit 31: it compared unmarked); so is a number
// JSON writes as null (NaN, Infinity, -Infinity), which jsonText() writes bare and diff() tells from null (audit 31)
const canon = x => { const path = [], of = new WeakMap(); // path: the objects above the value written, as the model has them
  return JSON.stringify(x, function (k, v) { const h = of.get(this) || this, i = path.lastIndexOf(h); if (i < 0) path.push(h); else path.length = i + 1;
    if (typeof v === 'bigint') return '\u0000' + v + 'n'; if (typeof v === 'number' && !Number.isFinite(v)) return '\u0000' + v; if (typeof v === 'string' && v[0] === '\u0000') return '\u0000' + v;
    if (!v || typeof v !== 'object') return v; if (path.includes(v)) return '[cycle]'; // a BigInt, which JSON cannot write, as 10n (audit 28)
    const y = Array.isArray(v) ? v : Object.fromEntries(Object.keys(v).sort().map(f => [f, v[f]])); of.set(y, v); return y; }); };
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
// what names an element: its label, else its id. A number is a label, 0 too (audit 30: `label || id` named a card labelled 0 by its id)
const labelOr = (label, id) => label == null || label === '' ? id : label;
// what every typed view calls an element, in its picture, accessible names, describe(), PDF, hints and messages: its label,
// else its id, so a label "" names it as no label does, as a map's card (audit 35: each type's own `label ?? id` kept "" blank)
const elName = x => String(labelOr(x.label, x.id));
// key: the field read, a label by default; a view's title too (audit 31: a view's title, a box's label and a card's label in a
// view's nodeOverrides were drawn as "[object Object]" and said nowhere)
function labelProblem(x, at, key = 'label') {
  const l = x && typeof x === 'object' ? x[key] : undefined; if (l == null || typeof l === 'string' || typeof l === 'number') return null;
  let shown; try { shown = String(l); } catch { shown = ''; }
  return { level: 'warning', path: `${at}.${key}`, message: `${key} ${jsonText(l)} is not text: drawn as ${jsonText(shown)}` };
}
function typedProblems(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => x && typeof x === 'object';
  if (m.schemaVersion !== SCHEMA_VERSION) return out;
  const views = arr(m.views).filter(isObj), TYPE = /^[a-z0-9]+\.[A-Z][A-Za-z0-9]*$/;
  const where = new Map(), kindOf = new Map(), ownerOf = new Map(), parents = [], up = new Set(); // id -> its path, its kind, its owner; [element, path]; the elements whose members are being read
  const element = (x, at, kind, owner) => { // a node, typed edge, member, fragment or timeline item: one id space
    if (!isObj(x)) return err(at, 'an element is an object');
    if (typeof x.id !== 'string' || !x.id) return err(at + '.id', 'a typed element needs an id');
    if (x.id.includes('->')) err(at + '.id', `id "${x.id}" contains "->", which names lines by position`);
    if (where.has(x.id)) err(at + '.id', `id "${x.id}" is used twice (also ${where.get(x.id)})`); else { where.set(x.id, at); kindOf.set(x.id, kind); }
    if (owner != null) ownerOf.set(x.id, owner);
    if (kind !== 'node') { const l = labelProblem(x, at); if (l) out.push(l); } // a node's is validate()'s card check, in a map too
    if (x.parent != null) parents.push([x, at]);
    if (up.has(x)) return; up.add(x); // a host's member that holds its owner: said used twice, and not read again (audit 28)
    arr(x.members).forEach((y, j) => { element(y, `${at}.members[${j}]`, 'member', x.id); typeOf(y, `${at}.members[${j}]`, true, 'member'); }); up.delete(x);
  };
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
    arr(v.edges).forEach((e, j) => { if (isObj(e)) { element(e, `views[${i}].edges[${j}]`, 'edge'); typeOf(e, `views[${i}].edges[${j}]`, true, 'line'); } });
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
    if (v.direction != null && !['right', 'down'].includes(v.direction)) warn(at + '.direction', `direction ${name(v.direction)} is not right or down: drawn right`);
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

export { canon, jsonText, labelOr, elName, labelProblem, versionProblem, typedProblems, lineNames, namesOf, listOf, unreadable, copyOf, textOf, nameTable, usedIds };
