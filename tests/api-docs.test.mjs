// The API reference (docs/api/*.md) against the types it documents: every name lib/*.d.ts exports appears on some page
// (each diagram type's own vocabulary on its Diagrams page, docs/types/<type>.md, whose "How to write it" part is
// tools/types.md's section), every exported function's signature is quoted as the .d.ts has it, and every relative link
// and anchor resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), api = join(root, 'docs/api');
const read = p => readFileSync(p, 'utf8');
const pages = Object.fromEntries(readdirSync(api).filter(f => f.endsWith('.md')).map(f => [f, read(join(api, f))]));
const types = read(join(root, 'tools/types.md'));   // the "How to write it" parts of the type pages
const all = [...Object.values(pages), types].join('\n');
const dts = readdirSync(join(root, 'lib')).filter(f => f.endsWith('.d.ts')).map(f => read(join(root, 'lib', f)));

test('the API reference has its seven pages', () => {
  assert.deepEqual(Object.keys(pages).sort(), ['apply-and-commands.md', 'element-and-plugins.md', 'events-and-state.md', 'index.md',
    'model-and-schema.md', 'render.md', 'typed-diagrams.md']);
});

test('every name lib/*.d.ts exports appears on some API page or type page', () => {
  const names = dts.flatMap(s => [...s.matchAll(/^export\s+(?:declare\s+)?(?:function|interface|type|class|const)\s+(\w+)/gm)].map(m => m[1]));
  assert.ok(names.length > 100, `only ${names.length} exports found`);
  const missing = [...new Set(names)].filter(n => !new RegExp(`\\b${n}\\b`).test(all));
  assert.deepEqual(missing, [], `not in docs/api/*.md or tools/types.md: ${missing.join(', ')}`);
});

test('every exported function of lib/umlimator.d.ts is quoted with its signature as the .d.ts has it', () => {
  const sigs = [...read(join(root, 'lib/umlimator.d.ts')).matchAll(/^export (function .+;)$/gm)].map(m => m[1]);
  assert.ok(sigs.length >= 19, `only ${sigs.length} functions found`);
  const stale = sigs.filter(s => !all.includes(s));
  assert.deepEqual(stale, [], 'a signature on the API pages differs from lib/umlimator.d.ts');
});

test('a Handle method whose doc comment says it resolves true is typed Promise<boolean>, and is quoted on the API pages as the .d.ts has it (audit 15)', () => {
  const d = read(join(root, 'lib/umlimator.d.ts')), handle = d.slice(d.indexOf('export interface Handle'), d.indexOf('\n}', d.indexOf('export interface Handle')));
  const members = [...handle.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\n\s*(\w+\(.*\): .+;)\n/g)];
  assert.ok(members.length > 10, `only ${members.length} methods found`);
  const wrong = members.filter(([, doc, sig]) => /Resolves true/.test(doc) && !/: Promise<boolean>;$/.test(sig)).map(m => m[2]);
  assert.deepEqual(wrong, [], 'resolves true or false, typed otherwise');
  const quoted = members.map(m => m[2]).filter(sig => all.includes('\n' + sig.slice(0, sig.indexOf('(') + 1)) && !all.includes(sig));
  assert.deepEqual(quoted, [], 'a Handle method quoted on the API pages differs from lib/umlimator.d.ts');
});

test('the Element doc comment names every diagram type umlimator/all draws (audit 15)', async () => {
  const { validate } = await import('../lib/umlimator-all.js'), { targets } = await import('../docs/diagrams/examples/check.mjs');
  const line = read(join(root, 'lib/umlimator.d.ts')).split('\n').find(l => l.includes('umlimator/all draws `uml.class`'));
  const types = [...new Set(targets().flatMap(([, url]) => JSON.parse(read(url)).views.map(v => v.diagram)).filter(Boolean))];
  const drawn = types.filter(t => !validate({ schemaVersion: 2, nodes: [], views: [{ id: 'v', title: 'v', diagram: t, nodeIds: [] }] }).some(p => /not drawn/.test(p.message)));
  assert.ok(drawn.length >= 28, `only ${drawn.length} drawn`);
  assert.deepEqual(drawn.filter(t => !line.includes('`' + t + '`')), [], 'drawn, but the comment says plain cards');
});

// a heading's anchor as GitHub and VitePress both make it for the plain headings these pages use; a repeat gets -1, -2
const anchors = md => {
  const seen = {}, out = new Set();
  for (const [, h] of md.replace(/^(```|````)[\s\S]*?^\1/gm, '').matchAll(/^#{1,6} (.+)$/gm)) {
    const own = /\{#([\w-]+)\}$/.exec(h);   // an id the heading sets ({#model})
    if (own) { out.add(own[1]); continue; }
    const base = h.replace(/`/g, '').trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-');
    out.add(seen[base] ? `${base}-${seen[base]}` : base); seen[base] = (seen[base] || 0) + 1;
  }
  return out;
};

test('every relative link on the API pages names a file that exists, and an anchor that heading makes', () => {
  const broken = [];
  for (const [f, md] of Object.entries(pages)) {
    const text = md.replace(/^(```|````)[\s\S]*?^\1/gm, '');
    for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(href)) continue;
      const [path, hash] = href.split('#'), target = path ? resolve(api, path) : join(api, f);
      if (!existsSync(target)) { broken.push(`${f}: ${href} (no file)`); continue; }
      if (hash && target.endsWith('.md') && !anchors(read(target)).has(hash)) broken.push(`${f}: ${href} (no heading)`);
    }
  }
  assert.deepEqual(broken, []);
});

test('audit 20: every prop the sequence, communication and timing panels offer on a message is declared in its .d.ts props and listed on its type page (tools/types.md)', async () => {
  const { diagramOf } = await import('../src/core/registry.js'); await import('../src/map/typed.js');
  for (const f of ['sequence', 'communication', 'timing']) await import(`../src/uml/${f}.js`);
  const d = read(join(root, 'lib/umlimator.d.ts')), doc = types;
  for (const [diagram, name] of [['uml.sequence', 'UmlMessageProps'], ['uml.communication', 'UmlMessageProps'], ['uml.timing', 'UmlTimingMessageProps']]) {
    const keys = diagramOf({ diagram }).props['uml.Message'].map(f => f.key), decl = (d.match(new RegExp(`interface ${name} \\{([^}]*)\\}`)) || [])[1] || '';
    const row = doc.split('\n').find(l => l.startsWith(`| \`${name}\` |`)) || '';
    assert.deepEqual(keys.filter(k => !new RegExp(`\\b${k}\\?:`).test(decl)), [], `${diagram}: not in ${name}`);
    assert.deepEqual(keys.filter(k => !row.includes(`\`${k}\``)), [], `${diagram}: not in the ${name} row`); }
});

test('audit 22: drift()\'s page says what an entry with one end that is no name does, as drift() does it', async () => {
  const { drift } = await import('../lib/umlimator.js');
  const model = { nodes: [{ id: 'api', label: 'API' }], edges: [], views: [{ id: 'v', nodeIds: ['api'] }] };
  for (const o of [{ from: 'ghost', to: null }, { from: 'ghost', to: {} }, { parent: 'ghost', child: true, callCount: 3 }, { from: 'ghost' }])
    assert.deepEqual(drift(model, [o]).counts, { carried: 0, undrawn: 0, idle: 0, unknown: 0, unmatched: ['ghost'] }, JSON.stringify(o));
  const page = pages['apply-and-commands.md'];
  assert.ok(!/is skipped, and names no service|An entry with no end names none/.test(page), 'the page says such an entry is skipped whole');
  assert.match(page, /other end, when it is a name with no card, is still listed in `counts\.unmatched`/);
  assert.match(page, /\| `counts\.unmatched` \|[^\n]*the other end of its entry is still listed/);
});

test('audit 24: delete\'s rows say that a model element under a node one view alone holds is kept and lifted, as apply() does it', async () => {
  const { apply } = await import('../lib/umlimator-all.js');
  const m = { schemaVersion: 2, nodes: [{ id: 'M', type: 'uml.ActivityPartition', label: 'Shop' }, { id: 'x', type: 'uml.Action', label: 'Pack', parent: 'P' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.activity', nodeIds: ['M', 'P', 'x'], nodes: [{ id: 'P', type: 'uml.ActivityPartition', label: 'Floor', parent: 'M' }] }, { id: 'w', diagram: 'uml.activity', nodeIds: ['M', 'x'] }] };
  assert.equal(apply(m, { op: 'delete', id: 'P' }).nodes.find(n => n.id === 'x').parent, 'M', 'kept, under its nearest owner left');
  assert.throws(() => apply(m, [{ op: 'add', element: { id: 'y', type: 'uml.Action', label: 'Y' } }, { op: 'reparent', id: 'y', parent: 'P' }]), /lives in view "v" only/);
  const row = (page, cell) => (page.split('\n').find(l => l.startsWith(cell)) || '');
  assert.match(row(pages['apply-and-commands.md'], '| `delete` |'), /kept: it moves to its nearest owner left, else to none/);
  assert.match(row(pages['apply-and-commands.md'], '| `reparent` |'), /under it throws, and `validate\(\)` warns/);
  assert.match(row(read(join(root, 'docs/use/editing.md')), '| `delete` (Shift + Delete) |'), /except a model element under a node only this view holds: it moves to its nearest owner left/);
});

// audit 26: render.md said render() replaced the container's content and destroy() left it empty; render() appends the
// map's element after what the container holds (mountPage(document.body) needs that) and destroy() removes that element
// alone. tests/embed.html checks the behaviour in a browser
test('render.md says render() appends the map\'s element and destroy() removes it alone', () => {
  const r = pages['render.md'];
  assert.doesNotMatch(r, /earlier content is replaced|leaves it empty|container is left empty|shadow root on the container/);
  assert.match(r, /The map's element is appended after what it already holds/); assert.match(r, /`destroy\(\)` removes only the map's element/);
  assert.match(r, /removes\s+the map's element \(whatever else the container holds stays\)/);
});

// audit 29: what Geometry declares an edge always has, every view's layout() gives it (a typed view's lines have no weight or wk)
test('every field Geometry declares required on an edge or a node is on every line and card layout() returns, in every example view', async () => {
  const { layout } = await import('../lib/umlimator-all.js');
  const d = read(join(root, 'lib/umlimator.d.ts')), g = d.slice(d.indexOf('export interface Geometry'), d.indexOf('\n}', d.indexOf('export interface Geometry')));
  const fields = kind => { let body = g.slice(g.indexOf(`${kind}: {`) + kind.length + 3); body = body.slice(0, body.indexOf('}[];'));
    for (let b = ''; b !== body;) { b = body; body = body.replace(/\{[^{}]*\}/g, ''); } // the fields of the line or card itself, not those of its label box
    return [...body.matchAll(/(?:^|;)\s*(\w+)(\??):/g)].filter(m => !m[2]).map(m => m[1]); };
  const need = { edges: fields('edges'), nodes: fields('nodes') };
  assert.deepEqual(need, { edges: ['from', 'to', 'ids', 'pts'], nodes: ['id', 'x', 'y', 'w', 'h'] });
  const md = read(join(root, 'docs/api/render.md')), mg = md.slice(md.indexOf('interface Geometry'), md.indexOf('\n}', md.indexOf('interface Geometry')));
  assert.equal(mg.replace(/^export /, ''), g.replace(/^export /, ''), 'render.md quotes Geometry as the .d.ts has it');
  const missing = new Set(), warn = console.warn; console.warn = () => {};
  try { for (const f of readdirSync(join(root, 'examples')).filter(f => f.endsWith('.json') && !f.startsWith('.')).sort().concat(['../tests/class-minimal.json'])) { const m = JSON.parse(read(join(root, 'examples', f)));
    for (const v of (m.views || []).filter(v => v && v.id)) { const out = layout(m, v.id);
      for (const k of ['edges', 'nodes']) out[k].forEach(x => need[k].forEach(n => { if (x[n] === undefined) missing.add(`${v.diagram || 'map'} ${k}.${n}`); })); } } } finally { console.warn = warn; }
  assert.deepEqual([...missing], []);
});

// audit 29: the MapView edges row names each typed view that leaves out a listed line of another kind
test('the edges row of model-and-schema.md names every typed view that does not draw a listed line of another kind', async () => {
  const { layout } = await import('../lib/umlimator-all.js');
  const row = (pages['model-and-schema.md'].match(/^\| `edges` \| The lines it draws.*$/m) || [''])[0];
  const word = { 'uml.state-machine': 'state machine', 'sysml.requirement': 'requirement', 'uml.sequence': 'sequence', 'uml.timing': 'timing', 'uml.communication': 'communication',
    'uml.interaction-overview': 'interaction overview', mindmap: 'mindmap', gcp: 'cloud', azure: 'cloud', aws: 'cloud', 'c4.dynamic': 'C4 dynamic' };
  const types = { 'uml.class': 'uml.Class', 'uml.package': 'uml.Package', 'uml.object': 'uml.InstanceSpecification', 'uml.use-case': 'uml.UseCase', 'uml.component': 'uml.Component',
    'uml.deployment': 'uml.Node', 'sysml.block-definition': 'sysml.Block', 'sysml.requirement': 'sysml.Requirement', er: 'er.Entity', flowchart: 'flow.Process', dfd: 'dfd.Process',
    'uml.activity': 'uml.Action', 'uml.state-machine': 'uml.State', 'c4.context': 'c4.SoftwareSystem', 'c4.container': 'c4.Container', 'c4.dynamic': 'c4.Container',
    'c4.deployment': 'c4.DeploymentNode', bpmn: 'bpmn.Task', gcp: 'gcp.Product', azure: 'azure.Service', mindmap: 'mindmap.Topic', 'uml.sequence': 'uml.Lifeline',
    'uml.communication': 'uml.Lifeline', 'uml.timing': 'uml.Lifeline', 'uml.interaction-overview': 'uml.InteractionUse' };
  const left = [], warn = console.warn; console.warn = () => {};
  try { for (const [d, t] of Object.entries(types)) { const own = ['uml.package', 'uml.component', 'uml.class', 'uml.use-case', 'uml.deployment', 'uml.object', 'sysml.block-definition'].includes(d);
    const m = { schemaVersion: 2, nodes: [{ id: 'a', type: t, label: 'A' }, { id: 'b', type: t, label: 'B', ...(d === 'mindmap' ? { parent: 'a' } : {}) }],
      edges: [{ id: 'x', type: own ? 'er.Relationship' : 'uml.Dependency', from: 'a', to: 'b', label: 'xx' }], views: [{ id: 'v', diagram: d, nodeIds: ['a', 'b'], edges: ['x'] }] };
    if (!layout(m, 'v').edges.some(e => e.id === 'x' || e._id === 'x' || (e.ids || []).includes('x'))) left.push(d); } } finally { console.warn = warn; }
  assert.ok(left.includes('uml.state-machine') && left.length > 5, left.join(', '));
  assert.deepEqual(left.filter(d => !word[d] || !row.includes(word[d])), [], 'a view that leaves the line out, which the row does not name');
});

test('every model field the map-repo skill tells the agent to set is in one of the two references it names for every field (audit 36)', () => {
  const skill = read(join(root, 'plugins/umlimator/skills/map-repo/SKILL.md'));
  const schema = read(join(root, 'engine/references/schema.md')), types = read(join(root, 'lib/umlimator.d.ts'));
  assert.match(skill, /Every field: `engine\/references\/schema\.md` \(Map model\) and `lib\/umlimator\.d\.ts`/);
  const block = skill.match(/```jsonc\n([\s\S]*?)```/)[1];
  const rows = skill.split('\n').filter(l => l.startsWith('| ')).map(l => l.split(' | ').slice(1).join(' | '));
  const fields = new Set([...block.matchAll(/"(\w+)":/g), ...rows.flatMap(r => [...r.matchAll(/`"?([a-z]\w*)"?(?::[^`]*)?`/gi)])].map(m => m[1]));
  for (const f of ['fromSide', 'toSide', 'gap', 'rgap', 'loop', 'layout']) assert.ok(fields.has(f), `the skill no longer names ${f}`);
  const named = f => new RegExp(`\`${f}\\b|"${f}"`).test(schema) || new RegExp(`\\b${f}\\??:`).test(types);
  assert.deepEqual([...fields].filter(f => !named(f)), [], 'fields the skill sets that neither schema.md nor lib/umlimator.d.ts names');
});

test('audit 43: risks.md M11 and C10 and the diff Action guide say a map view\'s reorder reads "moves", as diff() says it', async () => {
  const { diff } = await import('../lib/umlimator.js');
  const a = { nodes: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: id.toUpperCase() })), edges: [], views: [{ id: 'v', title: 'V', nodeIds: ['a', 'b', 'c', 'd', 'e'] }] };
  const b = structuredClone(a); b.views[0].nodeIds = ['b', 'a', 'c', 'd', 'e'];
  assert.deepEqual([diff(a, b).summary, diff(a, b).views], [['moves B to the start in the view V'], ['v']]);
  const c = structuredClone(a); c.views[0].nodeIds = ['e', 'd', 'c', 'b', 'a'];
  assert.match(diff(a, c).summary.join(), /^reorders \d+ cards in the view V$/);
  const risks = read(join(root, 'docs/diagrams/risks.md')), guide = read(join(root, 'docs/use/github-action.md'));
  const row = id => risks.split('\n').find(l => l.startsWith(`| ${id} |`));
  assert.doesNotMatch(row('M11'), /Maps are diffed as before/);
  assert.match(row('M11'), /a map's included, reads "moves `X` after `Y`" \(or "to the start"\), or "reorders `N` cards"/);
  assert.match(row('C10'), /a view's cards in a new order read "moves `X` after `Y`" or "reorders `N` cards" on a map too/);
  assert.match(guide, /cards in a new order read "moves X after Y" or "moves X to the start", or "reorders N cards"/);
});

// audit 63: the history() section said `limit` capped the models kept; push() keeps `limit` steps back plus the model now.
// The page's own example, history(model, N) allows K undos, is run against the real history()
test('the history() section says what `limit` caps, and its example holds', async () => {
  const { history } = await import('../lib/umlimator.js'), page = pages['apply-and-commands.md'];
  assert.ok(!/caps how many models/.test(page), 'history(): `limit` caps steps back, not models');
  const ex = /`history\(model, (\d+)\)` allows (\w+) undos/.exec(page);
  assert.ok(ex, 'the history() section gives an example of `limit`');
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5 }, limit = Number(ex[1]), said = words[ex[2]] ?? Number(ex[2]);
  const h = history({ n: 0 }, limit); for (let i = 1; i <= limit + 3; i++) h.push({ n: i });
  let undos = 0; while (h.canUndo) { h.undo(); undos++; }
  assert.equal(undos, said, `history(model, ${limit}) allows ${undos} undos, the page says ${said}`);
});
