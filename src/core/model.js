import { diagramOf } from './registry.js';
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
  if (!Number.isInteger(v) || v < 1) return { level: 'warning', message: `schemaVersion ${JSON.stringify(v)} is not a version (1 or 2): read as a map (1)` };
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
// a getter), stands in the copy as one more object whose toString is no function (audit 24)
const GONE = Object.freeze({ toString: undefined });
/* a deep copy of a host's model: structuredClone, and when that throws (a function, a Symbol, a Proxy: audit 24) a copy of
   every object and list walked, keeping each other value as it is (a function by reference), cycles and gaps too. A list,
   no recursion */
function copyOf(model) {
  try { return structuredClone(model); } catch { /* not cloneable: copied by hand below */ }
  const obj = x => x !== null && typeof x === 'object', made = new Map(), todo = [];
  const take = x => { if (!obj(x)) return x; if (made.has(x)) return made.get(x); let keys; try { keys = Object.keys(x); } catch { return GONE; }
    const y = Array.isArray(x) ? new Array(x.length) : {}; made.set(x, y); todo.push([x, y, keys]); return y; };
  const out = take(model);
  while (todo.length) { const [x, y, keys] = todo.pop(); for (const k of keys) { let v; try { v = x[k]; } catch { v = GONE; } y[k] = take(v); } }
  return out;
}
function unreadable(model) {
  const bad = x => { try { return x !== null && typeof x === 'object' && Object.hasOwn(x, 'toString') && typeof x.toString !== 'function'; } catch { return true; } };
  // role: what the object walked is. 'tags' (its values are maps by tag name), 'present' (by element id), 'part' (one
  // element's entry in present, whose ports is a map by port id)
  const cut = new Map(); // a list's path -> the indices left out of it, as the model has them, rising
  // an object whose keys or values cannot be read (a host's Proxy, a getter that throws) is left out as one with a toString
  // that is no function is, in a map by id too (audit 24)
  const thrown = new Set(); // paths of values that threw when read
  const walk = (root, fix) => { const at = [], todo = [[root, '', null]], seen = new Set();
    while (todo.length) { const [o, p, role] = todo.pop(); if (seen.has(o)) continue; seen.add(o);
      // keys that cannot be read: said at the object's own path (the copy holds it as one more left-out value: copyOf)
      const list = Array.isArray(o); let keys; try { keys = Object.keys(o); } catch { at.push(p); if (!fix) thrown.add(p); continue; }
      for (let i = keys.length - 1; i >= 0; i--) { const k = keys[i], q = list ? `${p}[${k}]` : p ? `${p}.${k}` : k; let x, gone = false;
        try { x = o[k]; } catch { gone = true; }
        const map = !list && (BY_ID.has(k) || role === 'tags' || (role === 'part' && k === 'ports'));
        if (gone || x === GONE || bad(x) && !map) { at.push(q); if (gone && !fix) thrown.add(q); if (fix && list) { o.splice(+k, 1); cut.set(p, [+k, ...cut.get(p) || []]); } else if (fix) delete o[k]; }
        else if (x !== null && typeof x === 'object') todo.push([x, q, list ? null : role === 'present' ? 'part' : role ? null : k === 'tags' || k === 'present' ? k : null]); } }
    return at; };
  const same = path => path;
  if (!model || typeof model !== 'object') return { paths: [], model, back: same, thrown };
  const paths = walk(model, false);
  if (!paths.length) return { paths, model, back: same, thrown };
  const copy = copyOf(model); walk(copy, true);
  // each [n] in turn, under the path before it as the model has it: the n-th entry of that list the copy kept
  const back = path => typeof path !== 'string' || !cut.size ? path : path.replace(/\[(\d+)\]/g, (w, n, i, s) => { const gone = cut.get(back(s.slice(0, i)));
    if (!gone) return w; let j = +n; for (const g of gone) if (g <= j) j++; else break; return `[${j}]`; });
  return { paths: paths.sort(), model: copy, back, thrown };
}
// a value as text, read as the model unreadable() gives back reads it: one it would leave out reads as no value
// ("undefined"), so a raw model names a line as the drawn page names it (audit 21)
const textOf = x => x === null || typeof x !== 'object' ? String(x) : Object.hasOwn(x, 'toString') && typeof x.toString !== 'function' ? 'undefined' : String(unreadable(x).model);
// a table by name a host hands in (drift's and sequenceFromTrace's match): each own key, any name toString too, to text or a
// number; any other value is no entry (audit 21)
const nameTable = x => { const t = new Map(); if (x && typeof x === 'object' && !Array.isArray(x)) Object.keys(x).forEach(k => { const v = x[k]; if (typeof v === 'string' || typeof v === 'number') t.set(k, String(v)); }); return t; };

/* The typed core's structural problems, as validate() words them: { level, path, message }. Only for schema version 2;
   a version-1 model has nothing typed. Ids, references, ownership and typed views; what a type's own properties mean
   is the type's to check (a registered type, from 1.3). */
function typedProblems(model) {
  const out = [], err = (path, message) => out.push({ level: 'error', path, message }), warn = (path, message) => out.push({ level: 'warning', path, message });
  const m = model && typeof model === 'object' ? model : {}, arr = x => (Array.isArray(x) ? x : []), isObj = x => x && typeof x === 'object';
  if (m.schemaVersion !== SCHEMA_VERSION) return out;
  const views = arr(m.views).filter(isObj), TYPE = /^[a-z0-9]+\.[A-Z][A-Za-z0-9]*$/;
  const where = new Map(), kindOf = new Map(), ownerOf = new Map(), parents = []; // id -> its path, its kind, its owner; [element, path]
  const element = (x, at, kind, owner) => { // a node, typed edge, member, fragment or timeline item: one id space
    if (!isObj(x)) return err(at, 'an element is an object');
    if (typeof x.id !== 'string' || !x.id) return err(at + '.id', 'a typed element needs an id');
    if (x.id.includes('->')) err(at + '.id', `id "${x.id}" contains "->", which names lines by position`);
    if (where.has(x.id)) err(at + '.id', `id "${x.id}" is used twice (also ${where.get(x.id)})`); else { where.set(x.id, at); kindOf.set(x.id, kind); }
    if (owner != null) ownerOf.set(x.id, owner);
    if (x.parent != null) parents.push([x, at]);
    arr(x.members).forEach((y, j) => { element(y, `${at}.members[${j}]`, 'member', x.id); typeOf(y, `${at}.members[${j}]`, true); });
  };
  const typeOf = (x, at, needed) => { if (!isObj(x)) return;
    if (x.type == null ? needed : typeof x.type !== 'string' || !TYPE.test(x.type)) warn(at + '.type', `type ${JSON.stringify(x.type)} is not <notation>.<Name> (uml.Class): drawn as a plain card`); };
  const nodes = arr(m.nodes);
  nodes.forEach((n, i) => { element(n, `nodes[${i}]`, 'node'); typeOf(n, `nodes[${i}]`, false); });
  const typedEdge = e => isObj(e) && e.type != null;
  arr(m.edges).forEach((e, i) => { if (typedEdge(e)) { element(e, `edges[${i}]`, 'edge'); typeOf(e, `edges[${i}]`, true); } });
  const typedView = v => v.diagram != null && v.diagram !== 'map'; // a view with diagram 'map' is a map: the map's checks
  views.forEach((v, i) => { if (!typedView(v)) return;
    arr(v.nodes).forEach((n, j) => element(n, `views[${i}].nodes[${j}]`, 'node'));
    arr(v.edges).forEach((e, j) => { if (isObj(e)) { element(e, `views[${i}].edges[${j}]`, 'edge'); typeOf(e, `views[${i}].edges[${j}]`, true); } });
    arr(v.fragments).forEach((f, j) => element(f, `views[${i}].fragments[${j}]`, 'fragment'));
    ['changes', 'constraints'].forEach(k => arr((v.timeline || {})[k]).forEach((c, j) => element(c, `views[${i}].timeline.${k}[${j}]`, 'time'))); });
  const has = id => where.has(id), name = id => JSON.stringify(id);
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
  const nodeIds = new Set(nodes.filter(isObj).map(n => n.id));
  views.forEach((v, i) => { if (!typedView(v)) return; const at = `views[${i}]`;
    if (typeof v.diagram !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(v.diagram)) warn(at + '.diagram', `diagram ${name(v.diagram)} is not <notation> or <notation>.<kind> (uml.class)`);
    if (v.direction != null && !['right', 'down'].includes(v.direction)) warn(at + '.direction', `direction ${name(v.direction)} is not right or down: drawn right`);
    arr(v.nodeIds).forEach((id, j) => { if (!nodeIds.has(id) && !arr(v.nodes).some(n => isObj(n) && n.id === id)) err(`${at}.nodeIds[${j}]`, `${name(id)} is not a node`); });
    const mine = new Set(arr(v.containers).map(c => isObj(c) && c.id)), T = diagramOf(v); // an item (the type's items; else no ends) is no line
    const item = e => (T ? arr(T.items).includes(e.type) : e.from == null && e.to == null);
    arr(v.edges).forEach((e, j) => { if (typeof e === 'string') { if (kindOf.get(e) !== 'edge') err(`${at}.edges[${j}]`, `${name(e)} is not a typed edge`); } else if (isObj(e) && !item(e)) ends(e, `${at}.edges[${j}]`, mine); });
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

export { versionProblem, typedProblems, lineNames, namesOf, listOf, unreadable, copyOf, textOf, nameTable };
