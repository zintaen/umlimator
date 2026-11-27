import { mermaidLegal, mermaidRawChar } from './mermaid-front.js';
/* ---------- Structurizr JSON: a reader (notes/milestone-2.md §8.3, M2.10; risks.md R1 to R3) ----------
   Written against Structurizr's workspace JSON (the workspace's published schema, structurizr/json), as the Structurizr
   CLI's `export -f json` writes it. Internal: the CLI (`umlimator.py import`) imports this file through Node; a host gets
   it once the registry is public. Its helpers are its own (sz...), since the readers share one scope in
   lib/umlimator-all.js. There is no writer (§13).

   readStructurizr(workspace) -> { model, report }: a version-2 model in model.md row 23's vocabulary, typed C4, and a
   report of what was not read as written, each item { path, status, message }: `path` where in the workspace it is
   (`model.softwareSystems[0].containers[2]`), status `skipped` or `approximated` (R1). `workspace` is the parsed JSON, or
   its text (refused over SZ_LIMIT characters). It never throws, and reads at most SZ_MAX elements and SZ_MAX
   relationships, deployment nodes SZ_DEEP deep (deeper read flat from there), whatever the input (R2); its report lists
   SZ_MAX_SAID items, then counts the rest in one. A parsed object
   may hold one list or string in many places, so every list entry and every character of text read is also counted, each
   time it is reached, against SZ_WORK and SZ_CHARS: the counts alone would not bound the work. Every table keyed
   by a name or an id is a Map, so `__proto__` and `constructor` are ordinary names, and the input's fields are read as
   own properties only.

   - People, software systems, their containers and those containers' components are c4.Person, c4.SoftwareSystem,
     c4.Container and c4.Component, owned by `parent`; deployment nodes c4.DeploymentNode, nested by `parent`; container
     instances c4.ContainerInstance, labelled as their container, `props.container` naming it. `description` and
     `technology` go to props; `location: "External"` or the tag External sets `external`.
   - Ids (R3): an element's `properties["structurizr.dsl.identifier"]` when the DSL wrote one (and it is not a UUID the DSL
     made up for an unnamed element), else its name slugged; an instance's `<container>-<instanceId>`; a relationship's
     identifier, else `<from>-<to>`; each the next free of base, base-2, base-3 ..., identifiers first. Never Structurizr's
     numeric ids, which change when the workspace is regenerated, so two exports of one DSL file read to one model.
   - Shapes: as Structurizr finds an element's style, its tags in order, each tag's styles in the order written, a later
     shape winning over an earlier (views.configuration.styles.elements); the map's shape it names goes to `props.shape`
     when it is not the type's own (a person's person, the rest's box). A shape the map lacks is a box, approximated.
   - Views: each kind as its c4 view, its key slugged as id, its `subject` the software system or container it is scoped
     to, `nodeIds` its elements; a container, component or dynamic view lists its subject, as Structurizr draws it as a
     boundary; an element of a level the view does not draw (validate's c4-level: a container in a landscape view) is left
     out, skipped, and so is an owner listed with what it holds unless it is the subject (only the subject is a boundary);
     a dynamic view's steps, ordered by `order`, are its `edges`, each relationship once (S13); a step naming an implied
     relationship is the relationship it is implied by when the view draws that one's ends, else the implied one, kept as a
     relationship of the model when the view draws its ends (approximated either way); a deployment view's
     environment is in its title; a view's automatic layout gives its direction.
   - Skipped, each reported: implied relationships but those a dynamic view's step keeps (`linkedRelationshipId`: the C4
     type works them out, §5.2), software
     system instances, infrastructure nodes and custom elements and their relationships, groups, filtered, custom and
     image views, perspectives, element properties but the identifier, urls, documentation and decisions, themes,
     animations, element positions, style fields but an element's shape, relationship styles, a deployment node's shape,
     an instance's own tags, a relationship between an element and its own owner or between a static element and a
     deployment one (validate's c4-relationship refuses both); an asynchronous relationship is drawn as any other (approximated). A static view's own list
     of relationships is not read: the type draws a view's lines from the model. */
const SZ_LIMIT = 1 << 20; // characters of JSON text; a parsed object is held to counts instead
const SZ_MAX = 10000; // the most elements, and the most relationships, read (R2)
const SZ_MAX_SAID = 1000; // the most report items listed; the rest are counted in one
const SZ_DEEP = 64; // deployment nodes nested deeper are read flat from there (R2)
const SZ_WORK = 500000; // the most list entries walked in all, a shared list counted each time it is reached (R2)
const SZ_CHARS = 16 * SZ_LIMIT; // the most characters of text read in all, counted the same way (R2)
const SZ_SHAPE = new Map(Object.entries({ person: 'person', robot: 'robot', webbrowser: 'browser', window: 'window', terminal: 'terminal', shell: 'terminal',
  mobiledevicelandscape: 'mobile', mobiledeviceportrait: 'mobile', cylinder: 'cylinder', pipe: 'pipe', folder: 'folder', hexagon: 'hexagon', box: 'box', roundedbox: 'box' }));
// [the workspace's list, the view's diagram, its field naming the subject, the word in a title made for it]
const SZ_VIEWS = [['systemLandscapeViews', 'c4.landscape', null, 'system landscape'], ['systemContextViews', 'c4.context', 'softwareSystemId', 'system context'],
  ['containerViews', 'c4.container', 'softwareSystemId', 'containers'], ['componentViews', 'c4.component', 'containerId', 'components'],
  ['dynamicViews', 'c4.dynamic', 'elementId', 'dynamic'], ['deploymentViews', 'c4.deployment', 'softwareSystemId', 'deployment']];
const SZ_SUBJECT = { 'c4.context': ['c4.SoftwareSystem'], 'c4.container': ['c4.SoftwareSystem'], 'c4.component': ['c4.Container'], 'c4.dynamic': ['c4.SoftwareSystem', 'c4.Container'], 'c4.deployment': ['c4.SoftwareSystem'] };
// what each level of view draws, as validate()'s c4-level has it: a dynamic view the level of its subject (c4.dynamic's
// dynLevel), a component view only its subject's components, a deployment view of a system only its containers' instances
const SZ_LEVEL = { 'c4.landscape': ['c4.Person', 'c4.SoftwareSystem'], 'c4.context': ['c4.Person', 'c4.SoftwareSystem'], 'c4.container': ['c4.Person', 'c4.SoftwareSystem', 'c4.Container'],
  'c4.component': ['c4.Person', 'c4.SoftwareSystem', 'c4.Container', 'c4.Component'], 'c4.deployment': ['c4.DeploymentNode', 'c4.ContainerInstance'] };
const SZ_WORD = { 'c4.Person': 'a person', 'c4.SoftwareSystem': 'a software system', 'c4.Container': 'a container', 'c4.Component': 'a component', 'c4.DeploymentNode': 'a deployment node', 'c4.ContainerInstance': 'a container instance' };
const SZ_ID = 'structurizr.dsl.identifier';
// a deployment-side element (a deployment node, a container instance), which a relationship joins only to another
const szDeploy = r => r.node.type === 'c4.DeploymentNode' || r.node.type === 'c4.ContainerInstance';
const szOrder = new Intl.Collator('en', { numeric: true }).compare; // a dynamic view's steps: 2 before 10
const SZ_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const szOwn = (o, k) => (o !== null && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined);
const szSlug = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}_.]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '');
const szDocumented = x => ['sections', 'decisions'].some(k => { const v = szOwn(szOwn(x, 'documentation'), k); return Array.isArray(v) && v.length > 0; });
const szKey = x => (typeof x === 'string' || typeof x === 'number' ? String(x) : undefined); // Structurizr's ids are text; a number is read as its text

// the first of base, base-2, base-3 ... not in used, resuming where the last ask for base stopped (R2)
function szFree(used, next, base) {
  let k = next.get(base) || 1, id = k > 1 ? `${base}-${k}` : base;
  while (used.has(id)) id = `${base}-${++k}`;
  next.set(base, k); used.add(id);
  return id;
}

function readStructurizr(workspace) {
  const report = [], recs = [], rels = [], views = [];
  try { return szRead(workspace, report, recs, rels, views); } catch { // a getter that throws, a revoked proxy: what a host built
    report.length = recs.length = rels.length = views.length = 0;
    report.push({ path: '', status: 'skipped', message: 'the input threw when it was read: nothing read' });
    return { model: { schemaVersion: 2, root: 'landscape', nodes: [], edges: [], views: [{ id: 'landscape', diagram: 'c4.landscape', nodeIds: [] }] }, report };
  }
}

function szRead(workspace, report, recs, rels, views) {
  // the report lists SZ_MAX_SAID items, then counts the rest in one last item kept current (audit 30), as DBML's does (R2)
  let tail = null, at = -1, more = 0;
  const say = (path, status, message) => {
    if (report.length < SZ_MAX_SAID) { report.push({ path, status, message }); return; }
    if (report[at] !== tail || !tail) { tail = { path: '', status: 'skipped', message: '' }; at = report.push(tail) - 1; more = 0; }
    tail.message = `${++more} more items like these: not listed`;
  };
  const pending = [], bySid = new Map(), relBySid = new Map(), implied = new Map(), groups = new Set();
  let title;
  const done = () => {
    const nodes = recs.map(r => r.node), edges = rels.map(r => r.edge);
    if (!views.length) {
      if (nodes.length) say('views', 'approximated', 'the workspace has no view that is read: a landscape view shows its people and software systems');
      views.push({ id: 'landscape', diagram: 'c4.landscape', ...(title ? { title: `${title}: system landscape` } : {}),
        nodeIds: nodes.filter(n => n.type === 'c4.Person' || n.type === 'c4.SoftwareSystem').map(n => n.id) });
    }
    return { model: { schemaVersion: 2, ...(title ? { title } : {}), root: views[0].id, nodes, edges, views }, report };
  };
  // what is walked, counted against SZ_WORK and SZ_CHARS; past either, nothing more is read (reported once)
  let work = SZ_WORK, chars = SZ_CHARS, spent = false;
  const over = path => { if (!spent) { spent = true; say(path, 'skipped', `over ${SZ_WORK} list entries or ${SZ_CHARS} characters read in all, a shared one counted each time: this and the rest are not read`); } };
  const str = (v, path) => { // text within the budget, else undefined; a character XML cannot hold as U+FFFD, said (audit 48)
    if (typeof v !== 'string') return;
    if (v.length > chars) { chars = 0; over(path); return; }
    chars -= v.length;
    return mermaidLegal(v, what => say(path, 'approximated', mermaidRawChar(what)));
  };
  // a field of the wrong kind is reported and read as absent
  const list = (o, k, path) => {
    const v = szOwn(o, k), at = path ? `${path}.${k}` : k;
    if (Array.isArray(v)) {
      if (v.length <= work) { work -= v.length; return v; }
      const some = v.slice(0, work);
      work = 0; over(`${at}[${some.length}]`);
      return some;
    }
    if (v != null) say(at, 'skipped', `${k} is not a list: not read`);
    return [];
  };
  const keys = (o, path) => { // an object's own keys, counted as list entries (a shared object, each time it is reached)
    if (spent || o === null || typeof o !== 'object') return [];
    const ks = Object.keys(o);
    if (ks.length > work) { work = 0; over(path); return []; }
    work -= ks.length;
    return ks;
  };
  const text = (o, k, path) => {
    const v = szOwn(o, k);
    if (typeof v === 'string') return str(v, path ? `${path}.${k}` : k) || undefined;
    if (v != null) say(path ? `${path}.${k}` : k, 'skipped', `${k} is not text: not read`);
  };

  if (typeof workspace === 'string') {
    if (workspace.length > SZ_LIMIT) { say('', 'skipped', `the input is ${workspace.length} characters, over the limit of ${SZ_LIMIT}: nothing read`); return done(); }
    try { workspace = JSON.parse(workspace); } catch (e) { say('', 'skipped', `the input is not JSON (${e.message}): nothing read`); return done(); }
  }
  const model = szOwn(workspace, 'model');
  if (Array.isArray(workspace) || model === null || typeof model !== 'object' || Array.isArray(model)) { say('', 'skipped', 'not a Structurizr workspace (no model): nothing read'); return done(); }
  title = text(workspace, 'name', '');

  // ---- elements ----
  let fullE = false;
  const add = (path, node, base, ident) => {
    if (recs.length >= SZ_MAX) { if (!fullE) { fullE = true; say(path, 'skipped', `over ${SZ_MAX} elements: this and the rest are not read`); } return null; }
    const rec = { node, base, ident };
    recs.push(rec);
    return rec;
  };
  const unread = (x, path, what) => { // what an element holds that the model has no place for
    const other = keys(szOwn(x, 'properties'), `${path}.properties`).filter(k => k !== SZ_ID);
    if (other.length) say(`${path}.properties`, 'skipped', `${what}: properties ${other.slice(0, 5).join(', ')}${other.length > 5 ? ` and ${other.length - 5} more` : ''} are not read`);
    if (list(x, 'perspectives', path).length) say(`${path}.perspectives`, 'skipped', `${what}: perspectives are not read`);
    const g = szOwn(x, 'group');
    if (typeof g === 'string' && !groups.has(g)) { groups.add(g); say(`${path}.group`, 'skipped', `group ${g}: groups are not read`); }
    if (szDocumented(x)) say(`${path}.documentation`, 'skipped', `${what}: documentation and decisions are not read`);
    if (str(szOwn(x, 'url'), `${path}.url`)) say(`${path}.url`, 'skipped', `${what}: its url is not read`);
  };
  const ident = x => { const v = str(szOwn(szOwn(x, 'properties'), SZ_ID), 'properties'); return v && !SZ_UUID.test(v) ? v : undefined; };
  const sid = (x, rec, path) => { // Structurizr's id, by which relationships and views name the element
    const k = szKey(szOwn(x, 'id'));
    if (k === undefined) return;
    if (bySid.has(k)) say(`${path}.id`, 'approximated', `id ${k} is used twice: relationships and views find the first`);
    else bySid.set(k, rec);
  };
  const relsOf = (x, path, from) => list(x, 'relationships', path).forEach((r, k) => pending.push({ x: r, path: `${path}.relationships[${k}]`, from }));
  const element = (x, path, type, parent) => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) { say(path, 'skipped', 'not an element: not read'); return null; }
    const name = text(x, 'name', path);
    if (name === undefined) { say(path, 'skipped', 'an element with no name: it and what it holds are not read'); return null; }
    const tags = (text(x, 'tags', path) || '').split(',').map(t => t.trim()).filter(Boolean), props = {};
    const description = text(x, 'description', path), technology = text(x, 'technology', path);
    if (description) props.description = description;
    if (technology) props.technology = technology;
    if (szOwn(x, 'location') === 'External' || tags.includes('External')) props.external = true;
    const rec = add(path, { type, label: name, props }, name, ident(x));
    if (!rec) return null;
    rec.parent = parent; rec.tags = tags; rec.path = path;
    sid(x, rec, path); unread(x, path, name); relsOf(x, path, rec);
    return rec;
  };

  list(model, 'people', 'model').forEach((x, k) => element(x, `model.people[${k}]`, 'c4.Person'));
  list(model, 'softwareSystems', 'model').forEach((x, k) => {
    const p = `model.softwareSystems[${k}]`, s = element(x, p, 'c4.SoftwareSystem');
    if (s) list(x, 'containers', p).forEach((y, j) => {
      const q = `${p}.containers[${j}]`, c = element(y, q, 'c4.Container', s);
      if (c) list(y, 'components', q).forEach((z, i) => element(z, `${q}.components[${i}]`, 'c4.Component', c));
    });
  });
  // deployment nodes, by a stack (never recursion): `holder` owns a node; past SZ_DEEP a node's children take its holder
  const stack = list(model, 'deploymentNodes', 'model').map((x, k) => ({ x, path: `model.deploymentNodes[${k}]`, holder: null, depth: 1 })).reverse();
  let flat = false;
  while (stack.length && !fullE) {
    const { x, path, holder, depth } = stack.pop(), d = element(x, path, 'c4.DeploymentNode', holder);
    if (!d) continue;
    const deep = depth >= SZ_DEEP, kids = list(x, 'children', path);
    if (deep && !flat && kids.length) { flat = true; say(path, 'approximated', `deployment node ${d.node.label} is nested ${SZ_DEEP} deep: the nodes it holds are read flat from there`); }
    const instances = szKey(szOwn(x, 'instances'));
    if (instances !== undefined && instances !== '1') say(`${path}.instances`, 'approximated', `deployment node ${d.node.label} stands for ${instances} instances: it is drawn once`);
    for (const [k, what] of [['infrastructureNodes', 'an infrastructure node'], ['softwareSystemInstances', 'a software system instance']])
      list(x, k, path).forEach((y, j) => say(`${path}.${k}[${j}]`, 'skipped', `${what} ${typeof szOwn(y, 'name') === 'string' ? szOwn(y, 'name') + ' ' : ''}is not read, nor its relationships`));
    list(x, 'containerInstances', path).forEach((y, j) => {
      const q = `${path}.containerInstances[${j}]`, c = bySid.get(szKey(szOwn(y, 'containerId')));
      if (y === null || typeof y !== 'object' || !c || c.node.type !== 'c4.Container') { say(q, 'skipped', 'a container instance whose container is not read: not read'); return; }
      const n = szKey(szOwn(y, 'instanceId')) || '1', i = add(q, { type: 'c4.ContainerInstance', label: c.node.label, props: {} }, null, ident(y));
      if (!i) return;
      i.parent = d; i.container = c; i.instance = n;
      if (str(szOwn(y, 'tags'), q)?.split(',').some(t => t.trim() && t.trim() !== 'Container Instance')) say(`${q}.tags`, 'skipped', `instance ${n} of ${c.node.label}: its own tags are not read (its container's are)`);
      sid(y, i, q); unread(y, q, `instance ${n} of ${c.node.label}`); relsOf(y, q, i);
    });
    for (let k = kids.length - 1; k >= 0; k--) stack.push({ x: kids[k], path: `${path}.children[${k}]`, holder: deep ? holder : d, depth: deep ? depth : depth + 1 });
  }
  for (const [k, what] of [['softwareSystemInstances', 'a software system instance'], ['infrastructureNodes', 'an infrastructure node'], ['customElements', 'a custom element']])
    if (list(model, k, 'model').length) say(`model.${k}`, 'skipped', `${what} is not read`);

  // ---- relationships ----
  let fullR = false, impliedCount = 0;
  for (const { x, path, from } of pending) {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) { say(path, 'skipped', 'not a relationship: not read'); continue; }
    // a static element's linked relationship is implied; an instance's is replicated from its container's, and read (§7.5.3)
    const k = szKey(szOwn(x, 'id')), linked = szKey(szOwn(x, 'linkedRelationshipId'));
    if (linked !== undefined && from.node.type !== 'c4.ContainerInstance' && from.node.type !== 'c4.DeploymentNode') { if (k !== undefined) implied.set(k, { linked, x, from }); impliedCount++; continue; }
    if (rels.length === SZ_MAX) { if (!fullR) { fullR = true; say(path, 'skipped', `over ${SZ_MAX} relationships: this and the rest are not read`); } continue; }
    const to = bySid.get(szKey(szOwn(x, 'destinationId')));
    if (!to) { say(path, 'skipped', `a relationship from ${from.node.label} whose destination is not read: not read`); continue; }
    // one between an element and its own owner, or its owner's owner (Structurizr refuses it; the C4 type can not hold it)
    const owner = [[from, to], [to, from]].find(([a, b]) => { for (let p = a.parent, n = 0; p && n <= SZ_DEEP + 4; p = p.parent, n++) if (p === b) return true; return false; });
    if (owner) { say(path, 'skipped', `a relationship between ${owner[0].node.label} and its own owner ${owner[1].node.label}: not read`); continue; }
    // one between a static element and a deployment one (validate's c4-relationship refuses it, audit 69)
    if (szDeploy(from) !== szDeploy(to)) { say(path, 'skipped', `a relationship between ${from.node.label}, ${szDeploy(from) ? 'a deployment element' : 'a static element'}, and ${to.node.label}, ${szDeploy(to) ? 'a deployment element' : 'a static element'}: a relationship joins two static elements or two deployment elements: not read`); continue; }
    const description = text(x, 'description', path), technology = text(x, 'technology', path);
    const edge = { type: 'c4.Relationship', from, to, ...(description ? { label: description } : {}), ...(technology ? { props: { technology } } : {}) };
    const r = { edge, ident: ident(x) };
    if (k !== undefined) { if (relBySid.has(k)) say(`${path}.id`, 'approximated', `relationship id ${k} is used twice: views find the first`); else relBySid.set(k, r); }
    rels.push(r);
    unread(x, path, `relationship ${from.node.label} → ${to.node.label}`);
    if (szOwn(x, 'interactionStyle') === 'Asynchronous') say(`${path}.interactionStyle`, 'approximated', `relationship ${from.node.label} → ${to.node.label} is asynchronous: it is drawn as any other`);
  }
  // (the count is said here and set when the views are read: a dynamic view's step may keep one)
  const impliedSaid = impliedCount ? report[report.push({ path: 'model', status: 'skipped' }) - 1] : null;

  // ---- ids (R3): identifiers first, so a name never takes one; then the rest in order ----
  const used = new Set(), next = new Map(), plain = /^[A-Za-z0-9_.-]+$/;
  const fallback = { 'c4.Person': 'person', 'c4.SoftwareSystem': 'system', 'c4.Container': 'container', 'c4.Component': 'component', 'c4.DeploymentNode': 'node' };
  const baseOf = r => (r.node.type === 'c4.ContainerInstance' ? `${r.container.node.id}-${szSlug(r.instance) || '1'}` : szSlug(r.base) || fallback[r.node.type]);
  for (const r of recs) if (r.ident && plain.test(r.ident) && !used.has(r.ident)) { r.node.id = r.ident; used.add(r.ident); }
  for (const r of rels) if (r.ident && plain.test(r.ident) && !used.has(r.ident)) { r.edge.id = r.ident; used.add(r.ident); }
  for (const r of recs) if (r.node.id === undefined) r.node.id = szFree(used, next, baseOf(r));
  for (const r of rels) if (r.edge.id === undefined) r.edge.id = szFree(used, next, `${r.edge.from.node.id}-${r.edge.to.node.id}`);
  // ends, owners and references by id, now that every element has one; a shape from the styles
  const styles = new Map(), vs = szOwn(workspace, 'views'), conf = szOwn(vs, 'configuration'); // a tag's shape: its last style's, mapped once
  const looks = new Set();
  list(szOwn(conf, 'styles'), 'elements', 'views.configuration.styles').forEach(s => {
    const tag = str(szOwn(s, 'tag'), 'views.configuration.styles.elements'), shape = str(szOwn(s, 'shape'), 'views.configuration.styles.elements');
    if (tag !== undefined && shape !== undefined) styles.set(tag, { shape, mapped: SZ_SHAPE.get(shape.toLowerCase()) });
    for (const k of keys(s, 'views.configuration.styles.elements')) if (k !== 'tag' && k !== 'shape') looks.add(k);
  });
  if (looks.size) say('views.configuration.styles.elements', 'skipped', `element styles: only shape is read, not ${[...looks].slice(0, 20).join(', ')}`);
  if (list(szOwn(conf, 'styles'), 'relationships', 'views.configuration.styles').length) say('views.configuration.styles.relationships', 'skipped', 'relationship styles are not read');
  if (list(conf, 'themes', 'views.configuration').length) say('views.configuration.themes', 'skipped', 'themes are not read: shapes come from the workspace\'s own styles');
  for (const r of recs) {
    const n = r.node;
    if (r.parent) n.parent = r.parent.node.id;
    if (r.container) n.props.container = r.container.node.id;
    if (r.tags) {
      let style;
      for (const t of r.tags) style = styles.get(t) ?? style;
      if (style && n.type === 'c4.DeploymentNode') { say(r.path, 'skipped', `${n.label}: a deployment node's shape ${style.shape} is not read`); style = undefined; }
      const own = n.type === 'c4.Person' ? 'person' : 'box', { shape, mapped } = style || {};
      if (shape && !mapped) say(r.path, 'approximated', `${n.label}: shape ${shape} is drawn as a box`);
      if (shape && (mapped || 'box') !== own) n.props.shape = mapped || 'box';
    }
    if (!Object.keys(n.props).length) delete n.props;
  }
  for (const r of rels) { r.edge.from = r.edge.from.node.id; r.edge.to = r.edge.to.node.id; }

  // ---- views ----
  const vused = new Set(), vnext = new Map(), kept = new Map(), heldBy = new Map(), recById = new Map(recs.map(r => [r.node.id, r]));
  /* a dynamic view's step naming an implied relationship (Structurizr's, a level above the relationship it is implied by): the
     relationship it is implied by when the view draws both its ends; else the implied one, kept as a relationship of the
     model, when the view draws both of its ends (a dynamic view's steps are never lifted, notes/milestone-2.md §7.5.2);
     else the one it is implied by, reported as not drawn. An end is drawn when the view shows it and it is not drawn as a
     boundary: the view's subject, or an element owning another the view shows */
  const impliedStep = (k, v, shown, q, id, n) => {
    const { linked, x, from } = implied.get(k), r = relBySid.get(linked);
    if (!heldBy.has(v)) { const held = new Set(); heldBy.set(v, held);
      for (const s of recs) if (shown.has(s.node.id)) for (let p = s.parent; p && !held.has(p.node.id); p = p.parent) held.add(p.node.id); }
    const held = heldBy.get(v), drawn = rec => !!rec && shown.has(rec.node.id) && rec.node.id !== v.subject && !held.has(rec.node.id);
    if (r && drawn(recById.get(r.edge.from)) && drawn(recById.get(r.edge.to))) { say(q, 'approximated', `view ${id}: step ${n} is an implied relationship: the relationship it is implied by, ${r.edge.id}, is the step`); return r; }
    const to = bySid.get(szKey(szOwn(x, 'destinationId')));
    if (kept.has(k) || (drawn(from) && drawn(to) && szDeploy(from) === szDeploy(to))) {
      if (!kept.has(k)) {
        const description = text(x, 'description', q), technology = text(x, 'technology', q);
        const edge = { id: szFree(used, next, `${from.node.id}-${to.node.id}`), type: 'c4.Relationship', from: from.node.id, to: to.node.id, ...(description ? { label: description } : {}), ...(technology ? { props: { technology } } : {}) };
        kept.set(k, { edge }); rels.push(kept.get(k));
      }
      const e = kept.get(k).edge;
      say(q, 'approximated', `view ${id}: step ${n} is an implied relationship: it is kept as the model's relationship ${e.id}, ${from.node.label} → ${to.node.label}`);
      return kept.get(k);
    }
    if (r) say(q, 'skipped', `view ${id}: step ${n} is an implied relationship: neither it nor the relationship it is implied by, ${r.edge.id}, is between two elements the view draws, so the step is not drawn`);
    return r;
  };
  for (const [key, diagram, field, word] of SZ_VIEWS) list(vs, key, 'views').forEach((x, k) => {
    const path = `views.${key}[${k}]`;
    if (x === null || typeof x !== 'object' || Array.isArray(x)) { say(path, 'skipped', 'not a view: not read'); return; }
    const vkey = text(x, 'key', path), id = szFree(vused, vnext, (vkey && szSlug(vkey)) || szSlug(word));
    const v = { id, diagram };
    let subject = field && bySid.get(szKey(szOwn(x, field)));
    if (subject && !SZ_SUBJECT[diagram].includes(subject.node.type)) { say(`${path}.${field}`, 'skipped', `view ${id}: ${subject.node.label} is not what a ${word} view is scoped to`); subject = null; }
    else if (!subject && field && szOwn(x, field) != null) say(`${path}.${field}`, 'skipped', `view ${id}: its scope is not read`);
    const env = text(x, 'environment', path), named = subject ? subject.node.label : title;
    v.title = text(x, 'title', path) || `${named ? named + ': ' : ''}${word}${env ? ', ' + env : ''}`;
    if (subject) v.subject = subject.node.id;
    const dir = szOwn(szOwn(x, 'automaticLayout'), 'rankDirection');
    if (dir != null && (typeof dir !== 'string' || !/^(TopBottom|BottomTop|LeftRight|RightLeft)$/.test(dir))) say(`${path}.automaticLayout.rankDirection`, 'skipped', `view ${id}: rank direction ${szKey(dir) ?? ''} is not one Structurizr has: not read`);
    else if (dir != null) {
      v.direction = /^(TopBottom|BottomTop)$/.test(dir) ? 'down' : 'right';
      if (dir === 'BottomTop' || dir === 'RightLeft') say(`${path}.automaticLayout`, 'approximated', `view ${id}: ${dir} is drawn ${v.direction === 'down' ? 'top to bottom' : 'left to right'}`);
    }
    const shown = new Set(subject && diagram !== 'c4.context' && diagram !== 'c4.deployment' ? [subject.node.id] : []);
    let lost = 0, placed = 0;
    // an element of a level the view does not draw (a container in a landscape view) is left out and said, once a view (audit 56)
    const level = diagram !== 'c4.dynamic' ? diagram : !subject ? 'c4.landscape' : subject.node.type === 'c4.SoftwareSystem' ? 'c4.container' : 'c4.component';
    const draws = r => SZ_LEVEL[level].includes(r.node.type) && !(level === 'c4.component' && r.node.type === 'c4.Component' && r.parent !== subject)
      && !(level === 'c4.deployment' && subject && r.node.type === 'c4.ContainerInstance' && r.container.parent !== subject);
    const wrong = [], recs = new Map(subject ? [[subject.node.id, subject]] : []);
    for (const e of list(x, 'elements', path)) {
      const r = bySid.get(szKey(szOwn(e, 'id')));
      if (!r) lost++; else if (draws(r)) { shown.add(r.node.id); recs.set(r.node.id, r); } else if (!wrong.includes(r)) wrong.push(r);
      if (szOwn(e, 'x') != null || szOwn(e, 'y') != null) placed++;
    }
    // c4-level's other half: only the subject is drawn as a boundary, so an owner listed with what it holds is left out and
    // said, as Structurizr will not add a parent and its child to one view; the child, the finer element, is kept (audit 57)
    const owners = [];
    if (level !== 'c4.deployment') for (const r of [...shown].map(n => recs.get(n))) {
      for (let p = r && r.parent, seen = new Set(); p && !seen.has(p); p = p.parent) {
        seen.add(p);
        if (p !== subject && shown.has(p.node.id) && !owners.includes(p)) owners.push(p);
      }
    }
    for (const o of owners) shown.delete(o.node.id);
    if (owners.length) say(`${path}.elements`, 'skipped', `view ${id}: ${owners.slice(0, 5).map(o => `${o.node.label}, ${SZ_WORD[o.node.type]}`).join('; ')}${owners.length > 5 ? `; and ${owners.length - 5} more` : ''}, ${owners.length > 1 ? 'are' : 'is'} listed with what ${owners.length > 1 ? 'they hold' : 'it holds'}, and only the view's subject is drawn as a boundary: not shown`);
    if (lost) say(`${path}.elements`, 'skipped', `view ${id}: ${lost} element${lost > 1 ? 's' : ''} not read ${lost > 1 ? 'are' : 'is'} not shown`);
    if (wrong.length) say(`${path}.elements`, 'skipped', `view ${id}: ${wrong.slice(0, 5).map(r => `${r.node.label}, ${SZ_WORD[r.node.type]}${r.node.type === 'c4.ContainerInstance' ? ` of ${r.container.node.label}` : ''}`).join('; ')}${wrong.length > 5 ? `; and ${wrong.length - 5} more` : ''}, ${wrong.length > 1 ? 'are' : 'is'} not drawn in a ${word} view${subject && level !== 'c4.context' ? ` of ${subject.node.label}` : ''}: not shown`);
    if (placed) say(`${path}.elements`, 'skipped', `view ${id}: element positions are not read; the view is laid out`);
    v.nodeIds = [...shown];
    if (diagram === 'c4.dynamic') {
      const steps = list(x, 'relationships', path).map((s, j) => ({ s, j, order: szKey(szOwn(s, 'order')) ?? '' }));
      steps.sort((a, b) => szOrder(a.order, b.order) || a.j - b.j);
      const seen = new Set();
      v.edges = [];
      for (const { s, j, order } of steps) {
        const q = `${path}.relationships[${j}]`, k = szKey(szOwn(s, 'id'));
        let r = relBySid.get(k);
        if (!r && implied.has(k)) r = impliedStep(k, v, shown, q, id, order || j + 1);
        if (!r) { say(q, 'skipped', `view ${id}: a step whose relationship is not read`); continue; }
        if (seen.has(r)) { say(q, 'approximated', `view ${id}: ${r.edge.id} is a step twice: the first is kept (each relationship is one step)`); continue; }
        seen.add(r); v.edges.push(r.edge.id);
        const d = szOwn(s, 'description');
        if (typeof d === 'string' && d && d !== (r.edge.label || '')) say(q, 'approximated', `view ${id}: step ${r.edge.id} says "${d}": the relationship's own description is drawn`);
        if (szOwn(s, 'response') === true) say(q, 'approximated', `view ${id}: step ${r.edge.id} is a response: it is drawn the relationship's way`);
      }
    }
    if (list(x, 'animations', path).length) say(`${path}.animations`, 'skipped', `view ${id}: animations are not read`);
    views.push(v);
  });
  if (impliedSaid) { const n = impliedCount - kept.size;
    if (n) impliedSaid.message = `${n} implied relationship${n > 1 ? 's are' : ' is'} not read: the C4 type works them out when it draws`;
    else report.splice(report.indexOf(impliedSaid), 1); }
  for (const [key, word] of [['filteredViews', 'a filtered view'], ['customViews', 'a custom view'], ['imageViews', 'an image view']])
    list(vs, key, 'views').forEach((x, k) => say(`views.${key}[${k}]`, 'skipped', `${word}${typeof szOwn(x, 'key') === 'string' ? ' ' + szOwn(x, 'key') : ''} is not read`));
  if (szDocumented(workspace)) say('documentation', 'skipped', 'documentation and decisions are not read');
  return done();
}

export { readStructurizr };
