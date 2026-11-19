// Writes the examples' type pages: for each diagram type (the map and docs/types.md's 28), one multi-view model
// examples/types/<type>.json holding every example of that type, and its page examples/types/<type>.html.
//   The model's root view, "overview", is a map view titled "<Type> examples" with one card per variant; each card opens
//   (drills into) the variant's own view. A variant is a view of that type in one of the sources tools/types.json lists
//   for the type: an example of examples/ (examples/<name>.json) or a variant file (examples/variants/<type>-<name>.json,
//   a small model with views of that type). Each source is copied in whole (its views of other types too, so that what
//   its cards open and its lines name stays there), its ids prefixed with the source's name and a hyphen
//   (examples/variants/uml-class-down.json's ids with "down-"), so that sources never clash. A source's top views get
//   the overview as their parent.
//   node tools/types.mjs                write every type's model and page
//   node tools/types.mjs uml-class ...  write those types' only
//   --no-html                           write the models only (the page needs python3; tests/types.test.mjs reads the models)
// The pages are not committed (each is the whole module, 2.5 MB): CI's site job renders them; tests/types.test.mjs fails
// when a committed model is not what this writes. No dependency.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8'), json = p => JSON.parse(read(p));
const stop = msg => { throw new Error(`tools/types.mjs: ${msg}`); };

// a view's diagram type as the pages group it: C4's six view kinds are one type, a map view (no diagram) is the map
export const groupOf = view => { const d = view && view.diagram; return !d || d === 'map' ? 'map' : d.startsWith('c4.') ? 'c4' : d.replace('.', '-'); };
// the types, the map first, then docs/types.md's 28 in its order: [{ id, name }]
export function typeIds() {
  const out = ['map'];
  for (const [, id] of read('docs/types.md').matchAll(/<h3 id="([\w-]+)">/g)) out.push(id);
  return out;
}

// a source by its name in tools/types.json: "sales-classes" is examples/sales-classes.json, "variants/uml-class-down"
// examples/variants/uml-class-down.json; its prefix is its name less the folder and the type ("down")
export const sourcePath = name => `examples/${name}.json`;
export const prefixOf = (type, name) => name.startsWith('variants/') ? name.slice(9).replace(new RegExp(`^${type}-`), '') : name;

// Fields whose text is never an id, though it may read like one (a node's kind "queue" beside a node "queue", a class's
// stereotype "entity" beside a stereotype "entity", which names it by name): left as they are. Every other string that
// equals an id the source declares is a reference to it, and is prefixed; and so are the keys of a view's layout and
// present, which are ids.
const TEXT = new Set(['label', 'sublabel', 'title', 'text', 'what', 'how', 'caption', 'kind', 'type', 'diagram', 'name',
  'aggregation', 'role', 'stereotypes', 'quantityKind', 'value', 'guard', 'condition', 'unit', 'shape', 'icon', 'owner',
  'tone', 'badge', 'badges', 'dataType', 'classifier', 'multiplicity', 'valueType', 'returnType', 'default', 'visibility',
  'sort', 'operator', 'direction', 'notation', 'render', 'expression', 'body', 'technology', 'description', 'tags',
  'represents', 'specification', 'documentation', 'note', 'tooltip', 'alt', 'color', 'protocol']);
const KEYED = new Set(['layout', 'present']);

export function prefixed(model, prefix) {
  const ids = new Set();
  const collect = x => { if (Array.isArray(x)) x.forEach(collect); else if (x && typeof x === 'object') { if (typeof x.id === 'string') ids.add(x.id); Object.values(x).forEach(collect); } };
  collect(model);
  const p = id => `${prefix}-${id}`;
  const walk = (x, key) => {
    if (Array.isArray(x)) return x.map(y => walk(y, key));
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) =>
      [KEYED.has(key) && ids.has(k) ? p(k) : k, TEXT.has(k) ? v : walk(v, k)]));
    return typeof x === 'string' && ids.has(x) ? p(x) : x;
  };
  const out = walk(model, '');
  return { model: out, ids };
}

// what tools/types.json says of each type: { title, variants: [{ file, views: { <view id>: { sub, text } } }] }
export const spec = () => json('tools/types.json');

export function build(type) {
  const S = spec(), T = S.types[type] || stop(`no type ${type} in tools/types.json`);
  const nodes = [], edges = [], views = [], stories = [], lenses = [], rules = [], packs = {}, cards = [];
  const seen = new Set();
  for (const v of T.variants) {
    const src = json(sourcePath(v.file)), pre = prefixOf(type, v.file);
    if (seen.has(pre)) stop(`${type}: two sources with the prefix ${pre}`);
    seen.add(pre);
    const typed = src.views.filter(w => groupOf(w) === type).map(w => w.id);
    if (!typed.length) stop(`${type}: ${sourcePath(v.file)} has no view of this type`);
    for (const id of typed) if (!(v.views || {})[id]) stop(`${type}: ${sourcePath(v.file)}'s view ${id} has no card in tools/types.json`);
    for (const id of Object.keys(v.views || {})) if (!typed.includes(id)) stop(`${type}: ${sourcePath(v.file)} has no ${type} view ${id}`);
    const { model: m } = prefixed(src, pre);
    nodes.push(...(m.nodes || [])); edges.push(...(m.edges || []));
    for (const w of m.views) views.push(w.parent == null || w.parent === '' ? { ...w, parent: 'overview' } : w);
    stories.push(...(m.stories || [])); lenses.push(...(m.lenses || [])); rules.push(...(m.rules || []));
    for (const [k, pin] of Object.entries(src.iconPacks || {})) {
      if (packs[k] && packs[k] !== pin) stop(`${type}: two sources pin the ${k} icon pack differently (${packs[k]}, ${pin})`);
      packs[k] = pin;
    }
    for (const [id, c] of Object.entries(v.views)) {
      if (!c.sub || !c.text) stop(`${type}: ${sourcePath(v.file)}'s view ${id} needs its card's sub and text`);
      const view = m.views.find(w => w.id === `${pre}-${id}`);
      cards.push({ id: `card-${pre}-${id}`, label: c.title || view.title || id, kind: 'file', icon: c.icon,
        sublabel: c.sub, what: c.text, how: `From ${sourcePath(v.file)}.`, opensView: view.id });
    }
  }
  for (const c of cards) if (c.icon === undefined) delete c.icon;
  const clash = [...nodes, ...edges, ...views].map(x => x.id).filter(id => typeof id === 'string').find((id, i, a) => a.indexOf(id) !== i || id === 'overview' || id.startsWith('card-'));
  if (clash) stop(`${type}: the id ${clash} is used twice`);
  const COLS = cards.length <= 4 ? 2 : 3;
  const overview = { id: 'overview', parent: null, title: T.title, nodeIds: cards.map(c => c.id),
    layout: Object.fromEntries(cards.map((c, i) => [c.id, [i % COLS, Math.floor(i / COLS)]])) };
  const model = { $schema: '../../lib/umlimator.schema.json', schemaVersion: 2, title: T.title, root: 'overview',
    ...(Object.keys(packs).length ? { iconPacks: packs } : {}),
    nodes: [...cards, ...nodes], edges, views: [overview, ...views],
    ...(stories.length ? { stories } : {}), ...(lenses.length ? { lenses } : {}), ...(rules.length ? { rules } : {}) };
  return model;
}

export const text = model => JSON.stringify(model, null, 1) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), html = !args.includes('--no-html'), names = args.filter(a => !a.startsWith('--'));
  const all = Object.keys(spec().types), want = names.length ? names : all;
  for (const t of typeIds()) if (!all.includes(t)) stop(`tools/types.json has no type ${t}`);
  for (const t of all) if (!typeIds().includes(t)) stop(`tools/types.json's type ${t} is not the map or one of docs/types.md's`);
  mkdirSync(new URL('examples/types/', ROOT), { recursive: true });
  for (const t of want) {
    const out = `examples/types/${t}.json`;
    writeFileSync(new URL(out, ROOT), text(build(t)));
    console.log(`${out} written`);
    if (html) {
      execFileSync('python3', ['umlimator.py', 'render', out, '--out', `examples/types/${t}.html`, '--no-check'], { cwd: fileURLToPath(ROOT), stdio: 'inherit' });
    }
  }
  // a model left by a type tools/types.json no longer has
  for (const f of readdirSync(new URL('examples/types/', ROOT)).filter(f => f.endsWith('.json')))
    if (!all.includes(f.slice(0, -5))) console.warn(`examples/types/${f}: no such type in tools/types.json; delete it`);
}
