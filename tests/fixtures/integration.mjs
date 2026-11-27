// Builds tests/fixtures/integration.json, the integration test fixture (a made-up moped share holding a view of each of
// the 28 types, for the cross-view features no one-type fixture covers), from its part files in
// tests/fixtures/integration/. No dependency. `node tests/fixtures/integration.mjs` writes the model;
// `node tests/fixtures/integration.mjs --check` writes nothing and exits 1 when the committed model, or a part file, is
// not what this would write. tests/integration.test.mjs runs the same check. Tests read it; the showcase in examples/
// never does.
//
// tests/fixtures/integration/model.json holds the model's own fields (title, root, rules, lenses, stories, ...) and `parts`, the
// part files in order. Each part file holds `nodes`, `edges` and `views`; the model lists every part's nodes, then every
// part's edges, then every part's views, each in part order and in file order within a part.
//
// Output is stable: every object of a known kind (the file, a node, a line, a view, a box, a badge, a rule and its ends,
// a lens, a story and its steps) writes its keys in the order KEYS gives, whatever order the part file has; a map keyed
// by id (a view's layout, an element's props) keeps the part file's order. A key KEYS does not list stops the build, so
// a new field is placed here once, on purpose. The printer writes a value on one line when it fits in WIDTH columns,
// else one entry a line; a list of plain values that does not fit is filled line by line.
//
// The build also stops on what would break a pin without any error: an id used twice (cards, lines, a view's own lines
// and boxes), a view whose id is a card's (a model card or a view's own; only the kept views trips and fleet,
// and the rider shop's api, which its card Shop API opens as the Bookshop's did, may: trace refuses such an id and a card
// opens the view of its id), a new view id starting with "f" (the
// `--views system,f*` and `fl*` globs of tests/cli.py and tests/outcomes.py mean the fleet view only), and a new view
// that lists accounts, flags or payments (diff's views == ["system"] pins keep those cards to the kept views).
import { readFileSync, writeFileSync } from 'node:fs';
import { isMain } from '../../tools/main.mjs';

const PARTS = new URL('integration/', import.meta.url), OUT = new URL('integration.json', import.meta.url);
const WIDTH = 120;
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const stop = msg => { throw new Error(`tests/fixtures/integration.mjs: ${msg}`); };

const NODE = ['id', 'type', 'label', 'parent', 'kind', 'owner', 'shape', 'icon', 'sublabel', 'sub', 'noSub', 'badge', 'badges', 'verbs',
  'edited', 'change', 'emphasis', 'opensView', 'opensCount', 'props', 'members', 'what', 'when', 'how', 'note', 'source', 'author',
  'origin', 'credits', 'examples'];
const EDGE = ['id', 'type', 'from', 'to', 'parent', 'label', 'kind', 'sublabel', 'weight', 'edited', 'change', 'drift', 'step', 'style',
  'fromSide', 'toSide', 'loop', 'latency', 'cost', 'props', 'what', 'when'];
// each kind's keys in the order they are written; null: a map whose keys are ids or data, written in the part's order
export const KEYS = {
  file: ['$schema', 'schemaVersion', 'title', 'root', 'meta', 'sourcesBase', 'authors', 'icons', 'iconPacks', 'nodes', 'edges', 'views',
    'rules', 'lenses', 'stories'],
  node: NODE, edge: EDGE,
  view: ['id', 'diagram', 'parent', 'title', 'caption', 'note', 'subject', 'direction', 'notation', 'render', 'lanes', 'present',
    'mainSteps', 'stepIds', 'browserOrder', 'node', 'intake', 'repair', 'subAndChips', 'kindsFromLabels', 'nodeIds', 'nodes',
    'nodeOverrides', 'edges', 'fragments', 'timeline', 'containers', 'layout', 'tour', 'gap', 'rgap', 'keepPairs'],
  container: ['id', 'label', 'tone', 'parent', 'nodeIds', 'badges'],
  badge: ['text', 'tone'],
  rule: ['id', 'title', 'views', 'from', 'to', 'noCycles'],
  selector: ['id', 'kind', 'container', 'owner', 'line', 'not'],
  lens: ['id', 'title', 'pick', 'color'],
  story: ['id', 'title', 'steps'],
  step: ['view', 'caption', 'highlight', 'select', 'tour', 'camera', 'duration'],
  camera: ['card', 'x', 'y', 'zoom'],
  part: ['nodes', 'edges', 'views'],
};
// the kind of each field's value that is itself of a known kind (an object, or a list of them)
export const INNER = {
  file: { nodes: 'node', edges: 'edge', views: 'view', rules: 'rule', lenses: 'lens', stories: 'story' },
  part: { nodes: 'node', edges: 'edge', views: 'view' },
  node: { badges: 'badge', members: 'node' },
  view: { nodes: 'node', edges: 'edge', containers: 'container', fragments: 'node', nodeOverrides: 'overrides' },
  container: { badges: 'badge' },
  rule: { from: 'selector', to: 'selector' },
  selector: { not: 'selector' },
  lens: { pick: 'selector' },
  story: { steps: 'step' },
  step: { camera: 'camera' },
};

// the value with its keys in KEYS' order, every level down; `where` names it when a key is unknown
export function order(x, kind, where) {
  if (Array.isArray(x)) return x.map((y, i) => order(y, kind, `${where}[${isObj(y) && y.id != null ? y.id : i}]`));
  if (!isObj(x)) return x;
  if (kind === 'overrides') return Object.fromEntries(Object.entries(x).map(([id, o]) => [id, order(o, 'node', `${where}.${id}`)]));
  const keys = KEYS[kind], odd = Object.keys(x).filter(k => !keys.includes(k));
  if (odd.length) stop(`${where} has ${odd.join(', ')}, which KEYS.${kind} does not place`);
  return Object.fromEntries(keys.filter(k => x[k] !== undefined).map(k => [k, INNER[kind]?.[k] ? order(x[k], INNER[kind][k], `${where}.${k}`) : x[k]]));
}

const one = x => Array.isArray(x) ? (x.length ? `[${x.map(one).join(', ')}]` : '[]')
  : isObj(x) ? (Object.keys(x).length ? `{ ${Object.entries(x).map(([k, v]) => `${JSON.stringify(k)}: ${one(v)}`).join(', ')} }` : '{}')
  : JSON.stringify(x);
// x at indent `pad`, after `head` (a key, or nothing) on its first line and before `tail` (a comma, or nothing) on its last
function print(x, pad, head = '', tail = '') {
  const flat = one(x);
  if (pad.length + head.length + flat.length + tail.length <= WIDTH || !(Array.isArray(x) || isObj(x))) return pad + head + flat + tail;
  const inner = pad + '  ';
  if (Array.isArray(x) && x.every(y => !Array.isArray(y) && !isObj(y))) { // plain values, filled line by line
    const lines = [];
    let line = '';
    x.forEach((y, i) => {
      const w = JSON.stringify(y) + (i < x.length - 1 ? ',' : '');
      if (line && inner.length + line.length + 1 + w.length > WIDTH) { lines.push(inner + line); line = w; } else line = line ? `${line} ${w}` : w;
    });
    lines.push(inner + line);
    return `${pad}${head}[\n${lines.join('\n')}\n${pad}]${tail}`;
  }
  const items = Array.isArray(x) ? x.map((y, i) => print(y, inner, '', i < x.length - 1 ? ',' : ''))
    : Object.entries(x).map(([k, v], i, all) => print(v, inner, `${JSON.stringify(k)}: `, i < all.length - 1 ? ',' : ''));
  const [open, close] = Array.isArray(x) ? ['[', ']'] : ['{', '}'];
  return `${pad}${head}${open}\n${items.join('\n')}\n${pad}${close}${tail}`;
}
// the text of a model or a part file: its keys ordered, printed, one newline at the end
export const format = (x, kind = 'file', where = 'the model') => print(order(x, kind, where), '') + '\n';

// the kept views; of them, the ones whose id is a card's; the cards the diff pins change, which only kept views may list
const KEPT = ['context', 'system', 'trips', 'fleet', 'ride-end'], SAME_AS_CARD = ['trips', 'fleet', 'api'], SAID = ['accounts', 'flags', 'payments'];
const readPart = name => JSON.parse(readFileSync(new URL(`${name}.json`, PARTS), 'utf8'));

// the model from the part files; `load` reads one by name ('model' is the head)
export function build(load = readPart) {
  const head = load('model'), { parts, ...own } = head;
  if (!Array.isArray(parts) || !parts.length) stop('tests/fixtures/integration/model.json names no parts');
  for (const k of ['nodes', 'edges', 'views']) if (k in own) stop(`tests/fixtures/integration/model.json holds ${k}: they belong in a part file`);
  const model = { $schema: '../../lib/umlimator.schema.json', ...own, nodes: [], edges: [], views: [] }, from = new Map();
  const claim = (id, what, part) => {
    if (id == null) return;
    if (from.has(id)) stop(`${id} is ${from.get(id)} and ${what} in ${part}`);
    from.set(id, `${what} in ${part}`);
  };
  const files = parts.map(name => [name, load(name)]);
  for (const [name, p] of files) {
    const odd = Object.keys(p).filter(k => !['nodes', 'edges', 'views'].includes(k));
    if (odd.length) stop(`part ${name} has ${odd.join(', ')}; a part holds nodes, edges and views`);
    order(p, 'part', `part ${name}`); // an unknown key stops here, named by its part file
    for (const n of p.nodes || []) { claim(n.id, 'a card', name); (n.members || []).forEach(c => claim(c.id, `a member of ${n.id}`, name)); }
    for (const e of p.edges || []) claim(e.id, 'a line', name);
    model.nodes.push(...(p.nodes || [])); model.edges.push(...(p.edges || []));
  }
  // the cards: the model's and every view's own (trace counts both)
  const cards = new Map(model.nodes.map(n => [n.id, n])), views = new Set();
  for (const [, p] of files) for (const v of p.views || []) for (const n of (v.nodes || []).filter(isObj)) if (!cards.has(n.id)) cards.set(n.id, n);
  for (const [name, p] of files) for (const v of p.views || []) {
    if (views.has(v.id)) stop(`view ${v.id} is in two parts (or twice in ${name})`);
    views.add(v.id);
    if (cards.has(v.id) && !SAME_AS_CARD.includes(v.id)) stop(`view ${v.id} in ${name} has a card's id; only ${SAME_AS_CARD.slice(0, -1).join(', ')} and ${SAME_AS_CARD.at(-1)} may`);
    if (/^f/.test(v.id) && v.id !== 'fleet') stop(`view ${v.id} in ${name} starts with "f", which the fleet view's globs would also match`);
    if (!KEPT.includes(v.id)) {
      const hit = (v.nodeIds || []).filter(id => SAID.includes(id));
      if (hit.length) stop(`view ${v.id} in ${name} lists ${hit.join(', ')}, which diff's views == ["system"] pin keeps to the kept views`);
    }
    for (const e of (v.edges || []).filter(isObj)) claim(e.id, `a line of view ${v.id}`, name);
    const boxes = new Set();
    for (const c of v.containers || []) {
      if (boxes.has(c.id)) stop(`box ${c.id} is in view ${v.id} twice (${name})`);
      boxes.add(c.id);
      if (cards.has(c.id)) stop(`box ${c.id} of view ${v.id} in ${name} has a card's id`);
      if (from.has(c.id) && !from.get(c.id).startsWith('a box')) stop(`box ${c.id} of view ${v.id} in ${name} is ${from.get(c.id)} too`);
      from.set(c.id, `a box in ${name}`);
    }
    model.views.push(v);
  }
  return { model, text: format(model), names: parts };
}

// the head file's text: the model's own fields in KEYS.file's order, then parts
const formatHead = ({ parts, ...own }) => print({ ...order(own, 'file', 'tests/fixtures/integration/model.json'), parts }, '') + '\n';
// every file this writes, with its text now and the text this would write: the model, the head, then each part
export function files() {
  const { text, names } = build(), now = url => readFileSync(url, 'utf8'), at = name => new URL(`${name}.json`, PARTS);
  return [{ path: 'tests/fixtures/integration.json', url: OUT, now: now(OUT), text },
    { path: 'tests/fixtures/integration/model.json', url: at('model'), now: now(at('model')), text: formatHead(JSON.parse(now(at('model')))) },
    ...names.map(name => ({ path: `tests/fixtures/integration/${name}.json`, url: at(name), now: now(at(name)),
      text: format(JSON.parse(now(at(name))), 'part', `part ${name}`) }))];
}

if (isMain(import.meta.url)) {
  const stale = files().filter(f => f.now !== f.text);
  if (process.argv.includes('--check')) {
    if (stale.length) { console.error(`not as tests/fixtures/integration.mjs writes it: ${stale.map(f => f.path).join(', ')}; run node tests/fixtures/integration.mjs`); process.exit(1); }
    console.log('tests/fixtures/integration.json and its part files are as tests/fixtures/integration.mjs writes them');
  } else {
    for (const f of stale) writeFileSync(f.url, f.text);
    const { model } = build();
    console.log(`tests/fixtures/integration.json: ${model.nodes.length} cards, ${model.edges.length} lines, ${model.views.length} views; `
      + (stale.length ? `written: ${stale.map(f => f.path).join(', ')}` : 'nothing to write'));
  }
}
