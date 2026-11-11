/* ---------- the model's version and the typed core (schema version 2: docs/diagrams/model.md) ----------
   A model with no schemaVersion is version 1, a map, and reads as it always has. Version 2 adds typed elements: each in
   one envelope ({ id, type, label, parent, props, members }), with nodes, edges, members, fragments and a timing view's
   changes and constraints in one id space; a view with a `diagram` is a typed view. This release reads both, and
   refuses a newer version rather than draw it wrongly (risks.md F6). */
const SCHEMA_VERSION = 2;

/* What this release cannot read, or null: a schemaVersion that is not a whole number from 1, or one newer than 2. */
function versionProblem(model) {
  const v = model && typeof model === 'object' ? model.schemaVersion : undefined;
  if (v === undefined) return null;
  if (!Number.isInteger(v) || v < 1) return `schemaVersion ${JSON.stringify(v)} is not a version (1 or 2)`;
  if (v > SCHEMA_VERSION) return `schemaVersion ${v} is newer than this release reads (${SCHEMA_VERSION}): upgrade umlimator to read it`;
  return null;
}

/* migrate(model): the model at the version this release reads. Versions 1 and 2 are read as they are, so the model comes
   back unchanged: lines without an id keep their positional names ("a->b#0"), which stories, lenses and hosts hold
   (risks.md F9). A newer version, or one that is not a version, throws. */
export function migrate(model) {
  const p = versionProblem(model);
  if (p) throw new Error(p);
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
  const where = new Map(), ownerOf = new Map(); // id -> its path; a member's id -> its owner's
  const element = (x, at, owner) => { // a node, typed edge, member, fragment or timeline item: one id space
    if (!isObj(x)) return err(at, 'an element is an object');
    if (typeof x.id !== 'string' || !x.id) return err(at + '.id', 'a typed element needs an id');
    if (x.id.includes('->')) err(at + '.id', `id "${x.id}" contains "->", which names lines by position`);
    if (where.has(x.id)) err(at + '.id', `id "${x.id}" is used twice (also ${where.get(x.id)})`); else where.set(x.id, at);
    if (owner != null) ownerOf.set(x.id, owner);
    arr(x.members).forEach((y, j) => { element(y, `${at}.members[${j}]`, x.id); typeOf(y, `${at}.members[${j}]`, true); });
  };
  const typeOf = (x, at, needed) => { if (!isObj(x)) return;
    if (x.type == null ? needed : !TYPE.test(String(x.type))) warn(at + '.type', `type ${JSON.stringify(x.type)} is not <notation>.<Name> (uml.Class): drawn as a plain card`); };
  const nodes = arr(m.nodes);
  nodes.forEach((n, i) => { element(n, `nodes[${i}]`); typeOf(n, `nodes[${i}]`, false); });
  const typedEdge = e => isObj(e) && e.type != null;
  arr(m.edges).forEach((e, i) => { if (typedEdge(e)) { element(e, `edges[${i}]`); typeOf(e, `edges[${i}]`, true); } });
  views.forEach((v, i) => { if (v.diagram == null) return;
    arr(v.edges).forEach((e, j) => { if (isObj(e)) { element(e, `views[${i}].edges[${j}]`); typeOf(e, `views[${i}].edges[${j}]`, true); } });
    arr(v.fragments).forEach((f, j) => element(f, `views[${i}].fragments[${j}]`));
    ['changes', 'constraints'].forEach(k => arr((v.timeline || {})[k]).forEach((c, j) => element(c, `views[${i}].timeline.${k}[${j}]`))); });
  const has = id => where.has(id), name = id => JSON.stringify(id);
  const boxes = new Set(views.flatMap(v => arr(v.containers).map(c => isObj(c) && c.id)));
  // ownership: parent names an element, and nothing ends up inside itself, counting a member as inside its owner (M7)
  const parentOf = new Map(ownerOf), written = new Set(); // written: elements whose parent is in the model, where a cycle is said
  const owned = (x, at) => { if (!isObj(x) || x.parent == null) return;
    if (!has(x.parent)) err(at + '.parent', `parent ${name(x.parent)} is not an element`); else if (typeof x.id === 'string') { parentOf.set(x.id, x.parent); written.add(x.id); } };
  const walk = (x, at) => { owned(x, at); arr(isObj(x) && x.members).forEach((y, j) => walk(y, `${at}.members[${j}]`)); };
  nodes.forEach((n, i) => walk(n, `nodes[${i}]`));
  for (const id of written) { const seen = new Set([id]);
    for (let p = parentOf.get(id); p != null; p = parentOf.get(p)) { if (seen.has(p)) { if (p === id) err(where.get(id) + '.parent', `"${id}" ends up inside itself`); break; } seen.add(p); } }
  // a typed edge's ends: a node, a member or a box; a part named on an end is an element
  const ends = (e, at, viewBoxes) => {
    ['from', 'to'].forEach(k => { if (!has(e[k]) && !viewBoxes.has(e[k])) err(`${at}.${k}`, `${name(e[k])} is not an element or a box`);
      const part = (((e.props || {}).ends || {})[k] || {}).part; if (part != null && !has(part)) err(`${at}.props.ends.${k}.part`, `part ${name(part)} is not an element`); });
    if (e.parent != null && !has(e.parent)) err(at + '.parent', `parent ${name(e.parent)} is not an element`);
  };
  arr(m.edges).forEach((e, i) => { if (typedEdge(e)) ends(e, `edges[${i}]`, boxes); });
  const nodeIds = new Set(nodes.filter(isObj).map(n => n.id));
  views.forEach((v, i) => { if (v.diagram == null) return; const at = `views[${i}]`;
    if (typeof v.diagram !== 'string' || !/^[a-z0-9]+(\.[a-z0-9-]+)?$/.test(v.diagram)) warn(at + '.diagram', `diagram ${name(v.diagram)} is not <notation> or <notation>.<kind> (uml.class)`);
    if (v.direction != null && !['right', 'down'].includes(v.direction)) warn(at + '.direction', `direction ${name(v.direction)} is not right or down: drawn right`);
    arr(v.nodeIds).forEach((id, j) => { if (!nodeIds.has(id)) err(`${at}.nodeIds[${j}]`, `${name(id)} is not a node`); });
    const mine = new Set(arr(v.containers).map(c => isObj(c) && c.id));
    arr(v.edges).forEach((e, j) => { if (typeof e === 'string') { if (!has(e)) err(`${at}.edges[${j}]`, `${name(e)} is not a typed edge`); } else if (isObj(e)) ends(e, `${at}.edges[${j}]`, mine); });
    arr(v.fragments).forEach((f, j) => { if (isObj(f) && f.parent != null && !has(f.parent)) err(`${at}.fragments[${j}].parent`, `parent ${name(f.parent)} is not an element`); });
    if (v.subject != null && !has(v.subject)) err(at + '.subject', `subject ${name(v.subject)} is not an element`);
    ['layout', 'present'].forEach(k => Object.keys(isObj(v[k]) ? v[k] : {}).forEach(id => { if (!has(id)) warn(`${at}.${k}.${id}`, `${name(id)} is not an element: ignored`); })); });
  return out;
}

export { versionProblem, typedProblems };
