// Builds examples/bookshop-atlas.json, the Bookshop atlas: the Bookshop examples in one model (schemaVersion 2), the map's
// views and every typed view, joined by drill-down. tools/atlas-links.json names the files, in order, and which element
// opens which view (its opensView). No dependency. `node tools/atlas.mjs`; tests/atlas.test.mjs fails when the committed
// atlas is not what this writes.
//
// Ids: nodes, members, edges, fragments and boxes share one id space in a model, and views have their own, but a node
// whose id is a view's opens that view (docs/diagrams/model.md §1, rule 5). So an id of a file is renamed when an
// earlier file in the list already uses it, as an element's or a view's id: it becomes "<file>.<id>", and so does every
// reference to it in that file. Labels are kept, so the pictures read as their own files' do.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EX = new URL('../examples/', import.meta.url);
const read = url => JSON.parse(readFileSync(url, 'utf8'));
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);

// what each part may hold; an id-bearing field not listed here would not be renamed, so a file using one stops the build
const KEYS = {
  file: ['$schema', 'schemaVersion', 'title', 'root', 'meta', 'nodes', 'edges', 'views'],
  view: ['id', 'diagram', 'title', 'caption', 'parent', 'nodeIds', 'edges', 'fragments', 'subject', 'direction', 'notation',
    'layout', 'present', 'tour', 'containers', 'render', 'lanes', 'gap', 'rgap'],
  node: ['id', 'type', 'label', 'parent', 'props', 'members', 'opensView', 'kind', 'icon', 'sublabel', 'what', 'when', 'how', 'badge',
    'badges', 'style'],
  edge: ['id', 'type', 'from', 'to', 'label', 'parent', 'props', 'style', 'step', 'weight', 'sublabel'],
  container: ['id', 'label', 'tone', 'nodeIds', 'parent', 'badges'],
};
function known(x, kind, where) {
  const odd = Object.keys(x).filter(k => !KEYS[kind].includes(k));
  if (odd.length) throw new Error(`tools/atlas.mjs: ${where} has ${odd.join(', ')}, which the atlas does not know how to carry`);
}

// every id a file declares, elements and views, in document order
function idsOf(m) {
  const out = [], el = x => { out.push(x.id); (x.members || []).forEach(el); };
  (m.nodes || []).forEach(el); (m.edges || []).forEach(el);
  (m.views || []).forEach(v => {
    out.push(v.id);
    (v.edges || []).forEach(e => isObj(e) && el(e));
    (v.fragments || []).forEach(el);
    (v.containers || []).forEach(el);
  });
  return out;
}

// the file with each id in `R` renamed, its references too
function renamed(m, name, R) {
  const r = id => (R.has(id) ? R.get(id) : id), rs = a => a && a.map(r);
  const keys = o => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [r(k), v]));
  const el = (x, kind, where) => {
    known(x, kind, where);
    const y = { ...x, id: r(x.id) };
    for (const k of ['parent', 'opensView', 'from', 'to']) if (k in x) y[k] = r(x[k]);
    if (x.members) y.members = x.members.map(c => el(c, 'node', `${where} member ${c.id}`));
    if (x.nodeIds) y.nodeIds = rs(x.nodeIds);
    if (isObj(x.props)) {
      const p = y.props = { ...x.props };
      if ('replyTo' in p) p.replyTo = r(p.replyTo);
      for (const k of ['covers', 'extensionPoints']) if (k in p) p[k] = rs(p[k]);
      if (isObj(p.ends)) p.ends = Object.fromEntries(Object.entries(p.ends).map(([k, e]) => [k, isObj(e) && 'part' in e ? { ...e, part: r(e.part) } : e]));
    }
    return y;
  };
  known(m, 'file', `examples/${name}.json`);
  return {
    root: r(m.root),
    nodes: (m.nodes || []).map(n => el(n, 'node', `${name} node ${n.id}`)),
    edges: (m.edges || []).map(e => el(e, 'edge', `${name} edge ${e.id}`)),
    views: (m.views || []).map(v => {
      const at = `${name} view ${v.id}`; known(v, 'view', at);
      const w = { ...v, id: r(v.id) };
      for (const k of ['parent', 'subject']) if (v[k] != null) w[k] = r(v[k]);
      for (const k of ['nodeIds', 'tour']) if (v[k]) w[k] = rs(v[k]);
      for (const k of ['layout', 'present']) if (v[k]) w[k] = keys(v[k]);
      if (v.edges) w.edges = v.edges.map(e => (isObj(e) ? el(e, 'edge', `${at} edge ${e.id}`) : r(e)));
      if (v.fragments) w.fragments = v.fragments.map(f => el(f, 'node', `${at} fragment ${f.id}`));
      if (v.containers) w.containers = v.containers.map(c => el(c, 'container', `${at} box ${c.id}`));
      return w;
    }),
  };
}

export function build(links = read(new URL('atlas-links.json', import.meta.url))) {
  const taken = new Map(), renames = [], parts = {}; // taken: an id → the file that has it
  for (const name of links.sources) {
    const m = read(new URL(`${name}.json`, EX)), R = new Map(), own = new Set(idsOf(m));
    for (const id of own) {
      const by = taken.get(id);
      if (by == null || by === name) { taken.set(id, name); continue; }
      const to = `${name}.${id}`;
      if (taken.has(to) || own.has(to)) throw new Error(`tools/atlas.mjs: ${name}'s ${id} is ${by}'s too, and ${to} is taken`);
      R.set(id, to); taken.set(to, name); renames.push({ file: name, from: id, to, clash: by });
    }
    parts[name] = { m: renamed(m, name, R), R };
  }
  const at = ref => { const k = ref.indexOf('/'), name = ref.slice(0, k), id = ref.slice(k + 1), p = parts[name];
    if (!p) throw new Error(`tools/atlas.mjs: ${ref} names no file of the atlas`);
    return { p, id: p.R.get(id) ?? id }; };
  for (const { element, opens } of links.links) {
    const a = at(element), b = at(opens), n = a.p.m.nodes.find(x => x.id === a.id);
    if (!n) throw new Error(`tools/atlas.mjs: ${element} is no node of its file`);
    if (!b.p.m.views.some(v => v.id === b.id)) throw new Error(`tools/atlas.mjs: ${opens} is no view of its file`);
    if (n.opensView != null) throw new Error(`tools/atlas.mjs: ${element} opens ${n.opensView} already`);
    n.opensView = b.id;
  }
  const all = links.sources.map(s => parts[s].m);
  const model = { $schema: '../lib/umlimator.schema.json', schemaVersion: 2, title: links.title, root: at(links.root).id,
    nodes: all.flatMap(m => m.nodes), edges: all.flatMap(m => m.edges), views: all.flatMap(m => m.views) };
  return { model, renames, text: JSON.stringify(model, null, 1) + '\n' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { renames, text } = build();
  writeFileSync(new URL('bookshop-atlas.json', EX), text);
  console.log(`examples/bookshop-atlas.json written; ${renames.length} ids renamed, each where an earlier file has it:`);
  for (const file of new Set(renames.map(x => x.file))) console.log(`  ${file}: ${renames.filter(x => x.file === file).map(x => `${x.from} (${x.clash}'s)`).join(', ')}`);
}
