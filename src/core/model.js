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
  const parentOf = new Map(ownerOf), written = new Set(); // written: elements whose parent is in the model, where a cycle is said
  parents.forEach(([x, at]) => { const k = kindOf.get(x.parent);
    if (!['node', 'member', 'fragment'].includes(k)) err(at + '.parent', `parent ${name(x.parent)} is not ${k ? 'an owner: it is ' + (k === 'edge' ? 'an edge' : 'a timing item') : 'an element'}`);
    else if (where.get(x.id) === at) { parentOf.set(x.id, x.parent); written.add(x.id); } });
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

export { versionProblem, typedProblems };
