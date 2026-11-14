// Builds examples/bookshop-atlas.json, the Bookshop atlas: the Bookshop examples in one model (schemaVersion 2), the map's
// views and every typed view, joined by drill-down. tools/atlas-links.json names the files, in order, and which element
// opens which view (its opensView). No dependency. `node tools/atlas.mjs`; tests/atlas.test.mjs fails when the committed
// atlas is not what this writes.
//
// Ids: one model, many views. A node, member or edge whose id is in several files is one element, written once: the
// files must agree on it. Its type, parent and ends (from, to) are equal; any other field the files both set is equal
// once key order is set aside; a field one file leaves out is the other's (props key by key, members by id, each member
// agreeing the same way). Anything else stops the build, naming the id, the files and the field: fix the example files.
// So does an id that is a view's own element (an inline message, a fragment, a box) in one file and anything in another,
// a view id in two files, and a node whose id is another file's view (a node opens the view of its id, docs/diagrams/model.md §1, rule 5).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EX = new URL('../examples/', import.meta.url);
const read = url => JSON.parse(readFileSync(url, 'utf8'));
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const stop = msg => { throw new Error(`tools/atlas.mjs: ${msg}`); };

// what each part may hold; a field not listed here has not been looked at for what merging it means, so a file using one
// stops the build
const KEYS = {
  file: ['$schema', 'schemaVersion', 'title', 'root', 'meta', 'nodes', 'edges', 'views'],
  view: ['id', 'diagram', 'title', 'caption', 'parent', 'nodeIds', 'edges', 'fragments', 'subject', 'direction', 'notation',
    'layout', 'present', 'tour', 'containers', 'render', 'lanes', 'gap', 'rgap', 'timeline'],
  node: ['id', 'type', 'label', 'parent', 'props', 'members', 'opensView', 'kind', 'icon', 'sublabel', 'what', 'when', 'how', 'badge',
    'badges', 'style'],
  edge: ['id', 'type', 'from', 'to', 'label', 'parent', 'props', 'style', 'step', 'weight', 'sublabel'],
  container: ['id', 'label', 'tone', 'nodeIds', 'parent', 'badges'],
  // a timing view's timeline: its unit, changes and constraints, each a view's own element
  timeline: ['unit', 'changes', 'constraints'],
  time: ['id', 'type', 'lifeline', 'at', 'state', 'from', 'to', 'label'],
  // an element's props, as the Bookshop files use them
  props: ['replyTo', 'covers', 'extensionPoints', 'ends', 'aggregation', 'classifier', 'collaboration', 'condition', 'default', 'do', 'effect', 'entry', 'exit',
    'guard', 'isAbstract', 'isDerived', 'isStatic', 'kind', 'multiplicity', 'operator', 'parameters', 'represents', 'returnType',
    'sort', 'stereotypes', 'trigger', 'value', 'valueType', 'visibility', 'tags', 'states', 'sentAt', 'receivedAt', 'isRequired',
    'conveyed', 'dataType', 'primaryKey', 'foreignKey', 'nullable', 'unique', 'references', 'identifying', 'number', 'description', 'technology',
    'external', 'shape', 'container'],
};
function known(x, kind, where) {
  const odd = Object.keys(x).filter(k => !KEYS[kind].includes(k));
  if (odd.length) stop(`${where} has ${odd.join(', ')}, which the atlas does not know how to carry`);
  if (isObj(x.props)) known(x.props, 'props', `${where} props`);
  (x.members || []).forEach(c => known(c, 'node', `${where} member ${c.id}`));
}

const canon = x => JSON.stringify(x, (k, v) => (isObj(v) ? Object.fromEntries(Object.keys(v).sort().map(j => [j, v[j]])) : v));
const STRICT = ['type', 'parent', 'from', 'to'];
// one element out of two files' copies of it, or a clash; `who` names it and the files
export function merge(a, b, who, pre = '') {
  const out = {}, has = (x, k) => x[k] !== undefined;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'members') {
      const m = new Map((a.members || []).map(x => [x.id, x]));
      (b.members || []).forEach(x => m.set(x.id, m.has(x.id) ? merge(m.get(x.id), x, `member ${x.id} of ${who}`) : x));
      out.members = [...m.values()];
    } else if (k === 'props' && isObj(a.props) && isObj(b.props)) out.props = merge(a.props, b.props, who, 'props.');
    else if (has(a, k) && has(b, k) ? canon(a[k]) !== canon(b[k]) : STRICT.includes(k))
      stop(`${who} disagree on its ${pre}${k}: ${canon(a[k])} against ${canon(b[k])}`);
    else out[k] = has(a, k) ? a[k] : b[k];
  }
  return out;
}

export function build(links = read(new URL('atlas-links.json', import.meta.url)), load = name => read(new URL(`${name}.json`, EX))) {
  const kinds = new Map(), files = new Map(), els = { nodes: new Map(), edges: new Map() }, views = new Map();
  const mark = (x, kind, name) => { // every id, with what it is and the files that have it
    const k = kinds.get(x.id);
    if (k != null && (k !== kind || kind.startsWith('in view'))) stop(`${x.id} is ${k} in ${files.get(x.id).join(', ')} and ${kind} in ${name}`);
    kinds.set(x.id, kind); files.set(x.id, [...(files.get(x.id) || []), name]);
    (x.members || []).forEach(c => mark(c, `a member of ${x.id}`, name));
  };
  for (const name of links.sources) {
    const m = load(name);
    known(m, 'file', `examples/${name}.json`);
    for (const [list, kind] of [['nodes', 'node'], ['edges', 'edge']]) for (const x of m[list] || []) {
      known(x, kind, `${name} ${kind} ${x.id}`); mark(x, `a ${kind}`, name);
      const was = els[list].get(x.id), fs = files.get(x.id);
      els[list].set(x.id, was ? merge(was, x, `${x.id} in ${fs.slice(0, -1).join(', ')} and ${name}`) : x);
    }
    for (const v of m.views || []) {
      known(v, 'view', `${name} view ${v.id}`);
      if (views.has(v.id)) stop(`view ${v.id} is in ${views.get(v.id).file} and ${name}`);
      views.set(v.id, { file: name, v });
      for (const [list, kind] of [['edges', 'edge'], ['fragments', 'node'], ['containers', 'container']])
        (v[list] || []).filter(isObj).forEach(x => { known(x, kind, `${name} view ${v.id} ${x.id}`); mark(x, `in view ${v.id}`, name); });
      if (isObj(v.timeline)) { known(v.timeline, 'timeline', `${name} view ${v.id} timeline`);
        for (const list of ['changes', 'constraints']) (v.timeline[list] || []).filter(isObj).forEach(x => { known(x, 'time', `${name} view ${v.id} ${x.id}`); mark(x, `in view ${v.id}`, name); }); }
    }
  }
  for (const id of els.nodes.keys()) if (views.has(id) && !files.get(id).includes(views.get(id).file))
    stop(`node ${id} in ${files.get(id).join(', ')} would open ${views.get(id).file}'s view ${id}`);
  const at = ref => [ref.slice(0, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)];
  for (const { element, opens } of links.links) {
    const [f, id] = at(element), [g, vid] = at(opens), n = els.nodes.get(id);
    if (!n || !files.get(id).includes(f)) stop(`${element} is no node of its file`);
    if (views.get(vid)?.file !== g) stop(`${opens} is no view of its file`);
    if (n.opensView != null) stop(`${element} opens ${n.opensView} already`);
    els.nodes.set(id, { ...n, opensView: vid });
  }
  const model = { $schema: '../lib/umlimator.schema.json', schemaVersion: 2, title: links.title, root: at(links.root)[1],
    nodes: [...els.nodes.values()], edges: [...els.edges.values()], views: [...views.values()].map(x => x.v) };
  const shared = [...files].filter(([, fs]) => fs.length > 1).map(([id, fs]) => ({ id, files: fs }));
  return { model, shared, text: JSON.stringify(model, null, 1) + '\n' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { shared, text } = build();
  writeFileSync(new URL('bookshop-atlas.json', EX), text);
  console.log(`examples/bookshop-atlas.json written; ${shared.length} elements shared by several files, each written once:`);
  for (const { id, files } of shared) console.log(`  ${id}: ${files.join(', ')}`);
}
