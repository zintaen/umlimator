// The docs-site plugins (#92), with no Markdown library installed: each is handed a ```umlimator fenced block as its host
// hands it (a markdown-it token, a remark code node) and gives back the <umlimator-map> element.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import markdownIt, { attrs } from '../lib/umlimator-markdown-it.js';
import remark from '../lib/umlimator-remark.js';
import { UmlimatorMap } from '../lib/umlimator-element.js';
import { readFileSync, readdirSync } from 'node:fs';

const md = { renderer: { rules: { fence: () => '<pre>the host\'s</pre>' } } };
markdownIt(md);
const fence = (info, content) => md.renderer.rules.fence([{ info, content }], 0, {}, {}, {});
// a code node in a blockquote, through the plugin: what it became
const viaRemark = (lang, value) => { const tree = { type: 'root', children: [{ type: 'blockquote', children: [{ type: 'code', lang, value }] }] }; remark()(tree); return tree.children[0].children[0]; };
// what remark-rehype, or MDX, writes for a node that names an element (data.hName, data.hProperties)
const asHtml = n => `<${n.data.hName}${Object.entries(n.data.hProperties).map(([k, v]) => ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`).join('')}></${n.data.hName}>\n`;

test('markdown-it: a block with src and view becomes the element with those attributes; other fences stay the host\'s', () => {
  assert.equal(fence('umlimator', 'src: /maps/shop.json\nview: api\nminimap: true\n'), '<umlimator-map src="/maps/shop.json" view="api" minimap="true"></umlimator-map>\n');
  assert.equal(fence('umlimator {.wide}', 'src: a.json'), '<umlimator-map src="a.json"></umlimator-map>\n');
  assert.equal(fence('umlimator', 'src: a.json\nwheel: ctrl'), '<umlimator-map src="a.json" wheel="ctrl"></umlimator-map>\n'); // a map in a document lets the page scroll
  assert.equal(fence('js', 'let x'), '<pre>the host\'s</pre>');
});

test('an inline model goes into src as a data: URL, minified, after the keys before it', () => {
  const model = { nodes: [{ id: 'a', label: 'Shop & "Co" <b>' }], views: [{ id: 'v', nodeIds: ['a'] }] };
  const out = fence('umlimator', `view: v\n${JSON.stringify(model, null, 2)}\n`), src = out.match(/ src="([^"]*)"/)[1];
  assert.match(out, /^<umlimator-map view="v" src="data:application\/json,[^"<>& ]*"><\/umlimator-map>\n$/);
  assert.equal(decodeURIComponent(src.slice('data:application/json,'.length)), JSON.stringify(model));
});

test('a block the element can\'t use fails the build: an unknown key, a broken model, neither src nor a model, or both', () => {
  assert.throws(() => attrs('veiw: api\nsrc: a.json'), /"veiw: api" is not one of src: view:/);
  assert.throws(() => attrs('{ "nodes": [ }'), SyntaxError);
  assert.throws(() => attrs('view: api'), /either src:/);
  assert.throws(() => attrs('src: a.json\n{ "nodes": [], "views": [] }'), /either src:/);
});

test('remark: the same element, from a node MDX and remark-rehype both turn into it, at any depth', () => {
  const text = 'src: maps/a & b.json\ncontrols: false\nheight: 600';
  assert.equal(asHtml(viaRemark('umlimator', text)), fence('umlimator', text));
  assert.equal(asHtml(viaRemark('umlimator', text)), '<umlimator-map src="maps/a &amp; b.json" controls="false" height="600"></umlimator-map>\n');
  assert.deepEqual(viaRemark('js', 'x'), { type: 'code', lang: 'js', value: 'x' });
});

test('the package exports the element and both plugins; the element\'s module loads in Node (a server render) and defines nothing', () => {
  const req = createRequire(import.meta.url); // a package may resolve its own name through its exports
  for (const [entry, file] of [['element', 'umlimator-element'], ['markdown-it', 'umlimator-markdown-it'], ['remark', 'umlimator-remark']]) {
    assert.match(req.resolve('umlimator/' + entry), new RegExp(`lib[\\\\/]${file}\\.js$`), entry);
  }
  assert.equal(typeof UmlimatorMap, 'function');
  assert.equal(globalThis.customElements, undefined);
});

test('every page in examples/, the gallery the site opens on included, declares its language (axe html-has-lang, audit 2)', () => {
  const dir = new URL('../examples/', import.meta.url);
  const bare = readdirSync(dir).filter(f => f.endsWith('.html') && !/<html lang="[a-z]/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(bare, []);
});

test('every page in examples/ has a level-one heading to jump to (axe page-has-heading-one, audit 16)', () => {
  const dir = new URL('../examples/', import.meta.url);
  assert.deepEqual(readdirSync(dir).filter(f => f.endsWith('.html') && !/<h1[ >]/.test(readFileSync(new URL(f, dir), 'utf8'))), []);
});

test('every page in examples/ has a main landmark, around its map (axe landmark-one-main, region, audit 17)', () => {
  const dir = new URL('../examples/', import.meta.url);
  assert.deepEqual(readdirSync(dir).filter(f => f.endsWith('.html') && !/<main[ >]/.test(readFileSync(new URL(f, dir), 'utf8'))), []);
});

test('the standalone-page guide claims for its links only what page.js writes to the hash: no selected line or box (audit 16)', () => {
  const guide = readFileSync(new URL('../docs/guide/standalone-page.md', import.meta.url), 'utf8');
  assert.doesNotMatch(guide, /Every state the page shows can be linked/);
  assert.match(guide, /A selected line or box is not kept in the link/);
});

// audit 31: the guide's Export row listed SVG, PNG and Record a story; the menu also has Copy link to view and Map model (JSON)
test('audit 31: the standalone-page guide lists every entry of the page\'s Export menu, and says what Map model (JSON) gives back', () => {
  const guide = readFileSync(new URL('../docs/guide/standalone-page.md', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../src/page/page.js', import.meta.url), 'utf8').match(/id="m-export-pop"[^`]*?<\/div>/)[0];
  const entries = [...menu.matchAll(/<button data-x="\w+">([^<]+)<\/button>/g)].map(m => m[1]), row = guide.match(/^\| Export \|(.*)\|$/m)[1];
  assert.ok(entries.length >= 5, menu);
  for (const e of entries) assert.ok(row.includes(e), `the Export row names ${e}`);
  assert.match(guide, /- \*\*Map model \(JSON\)\*\*: the whole model as its file has it/);
});

test('conformance notes and the examples README agree with the code they describe (audit 9)', async () => {
  const { diagramOf } = await import('../src/core/registry.js');
  await import('../src/map/typed.js'); await import('../src/uml/state.js'); await import('../src/uml/object.js');
  const { writeMermaidFlowchart } = await import('../src/readers/mermaid-flowchart.js');
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8'), json = p => JSON.parse(doc(p));
  const n = Object.keys(diagramOf({ diagram: 'uml.state-machine' }).rules).length;
  assert.match(doc('../docs/conformance/uml-state-machine.md'), new RegExp(`its ${n} rules`));
  const obj = doc('../docs/conformance/uml-object.md');
  for (const r of Object.keys(diagramOf({ diagram: 'uml.object' }).rules)) assert.ok(obj.includes('`' + r + '`'), r);
  // the flowchart writer's bracket lines (a process is `id[label]`) are named so in the note
  assert.match(writeMermaidFlowchart(json('../examples/returns-flowchart.json')), /^\s*\S+\[[^/[(]/m);
  assert.match(doc('../docs/conformance/flowchart.md'), /Each symbol in Mermaid's bracket form/);
  const views = new Set(json('../examples/sales-classes.json').views.map(v => v.id));
  for (const [, id] of doc('../examples/README.md').matchAll(/sales-classes `([^`]+)`/g)) assert.ok(views.has(id), id);
  for (const [, id] of doc('../examples/README.md').matchAll(/sales-classes `domain` and `([^`]+)`/g)) assert.ok(views.has(id), id);
  for (const [, id] of doc('../examples/README.md').matchAll(/and `([^`]+)`, with its subject/g)) assert.ok(views.has(id), id);
});

test('audit 14: the sequence and communication notes say a self-line is in the PDF\'s lines table, as tablesOf lists it', async () => {
  await Promise.all(['../src/map/typed.js', '../src/uml/sequence.js', '../src/uml/communication.js'].map(p => import(p))); const { mapContext } = await import('../src/map/context.js'), { tablesOf } = await import('../src/page/print.js');
  for (const [f, vid] of [['checkout-sequence', 'checkout-sequence'], ['checkout-communication', 'checkout-communication']]) {
    const ctx = mapContext(JSON.parse(readFileSync(new URL(`../examples/${f}.json`, import.meta.url), 'utf8'))), rows = tablesOf(ctx, ctx.V[vid], ctx.buildGeo(vid))[1].rows.map(r => r.replace(/<[^>]+>/g, ''));
    assert.ok(rows.some(r => /api : ShopApi\s*→\s*api : ShopApi/.test(r)), f);
    const note = readFileSync(new URL(`../docs/conformance/uml-${f.split('-')[1]}.md`, import.meta.url), 'utf8');
    assert.doesNotMatch(note, /left out of the lines table/, f); assert.match(note, /listed in the lines table/, f);
  }
});

test('audit 12: the schema names every type laid out down with no direction, and a direction neither right nor down is drawn right, as validate() warns', async () => {
  const { layout } = await import('../lib/umlimator-all.js'), doc = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const dirs = JSON.parse(doc('../lib/umlimator.schema.json')).$defs.view.properties.direction.description, said = console.warn, seen = new Set(), down = [];
  console.warn = () => {};
  try {
    for (const f of readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')).sort()) {
      const m = JSON.parse(doc('../examples/' + f));
      for (const v of Array.isArray(m.views) ? m.views : []) { if (!v || !v.diagram || v.diagram === 'map' || seen.has(v.diagram)) continue; seen.add(v.diagram);
        const at = d => { const c = structuredClone(m), w = c.views.find(x => x.id === v.id); if (d) w.direction = d; else delete w.direction; return JSON.stringify(layout(c, v.id).byId); };
        const [none, d, r, l] = [at(), at('down'), at('right'), at('left')];
        if (d === r) continue; // a type that has no direction (a sequence, a timing diagram, a mind map)
        assert.equal(l, r, `${v.diagram}: direction "left" is drawn right`);
        if (none === d) down.push(v.diagram); } }
  } finally { console.warn = said; }
  assert.deepEqual(down.sort(), ['flowchart', 'sysml.block-definition', 'sysml.requirement', 'uml.profile']);
  assert.match(dirs, /down for a flowchart, a profile, a SysML block definition or requirement view/);
});

test('audit 11: the schema names the flowchart\'s default direction; the information flow and structure notes match their rules', async () => {
  const { diagramOf } = await import('../src/core/registry.js');
  await import('../src/map/typed.js'); await import('../src/flowchart/flowchart.js'); await import('../src/uml/component.js'); await import('../src/uml/composite.js'); await import('../src/uml/deployment.js');
  const { layout } = await import('../src/map/api.js');
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8'), fc = JSON.parse(doc('../examples/returns-flowchart.json'));
  const dirs = JSON.parse(doc('../lib/umlimator.schema.json')).$defs.view.properties.direction.description;
  const at = d => { const m = structuredClone(fc); m.views.forEach(v => { if (d) v.direction = d; else delete v.direction; }); return JSON.stringify(layout(m, m.views[0].id).byId); };
  assert.equal(at(), at('down'), 'a flowchart with no direction lays out down'); assert.match(dirs, /down for a flowchart/);
  assert.doesNotMatch(doc('../docs/conformance/uml-information-flow.md'), /actors and information items/, 'an information item is never a flow end');
  for (const [t, f] of [['uml.component', 'uml-component'], ['uml.deployment', 'uml-deployment'], ['uml.composite-structure', 'uml-composite-structure']]) {
    const note = doc(`../docs/conformance/${f}.md`);
    for (const r of Object.keys(diagramOf({ diagram: t }).rules)) assert.ok(note.includes('`' + r + '`'), `${f}: ${r}`);
  }
  assert.match(doc('../docs/conformance/uml-composite-structure.md'), /`connector-drawn` \(a connector between two ports of the subject, or of one part/);
  // audit 15: a duration with ends on two lanes sits under the lower one (src/layout/timeruler.js, notes/stage-6.md §6.6)
  assert.match(doc('../docs/conformance/uml-timing.md'), /with ends on two lanes, under the lower of the two/);
});

test('audit 14: the cloud notes do not say an icons-only update() keeps the picture (lifted in 0.28.0); AWS is in the editing guide, the examples README and the schema', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  for (const f of ['gcp', 'azure']) assert.doesNotMatch(read(`../docs/conformance/${f}.md`), /changes only the `icons` table keeps/, f);
  const editing = read('../docs/editing.md');
  for (const s of ['AWS (`aws`)', '`aws.Connection`', '`pack fetch aws`']) assert.ok(editing.includes(s), s);
  assert.match(read('../examples/README.md'), /`aws-`/);
  assert.match(JSON.parse(read('../lib/umlimator.schema.json')).properties.iconPacks.description, /"aws"/);
});

test('audit 15: the import and export guide names every Mermaid writer as internal, and says export writes BPMN only', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8'), guide = read('../docs/guide/import-export.md');
  const words = { class: 'class', sequence: 'sequence', state: 'state machine', requirement: 'requirement', er: 'entity-relationship', flowchart: 'flowchart', mindmap: 'mindmap' };
  const writers = readdirSync(new URL('../src/readers/', import.meta.url)).filter(f => /^mermaid-.*\.js$/.test(f) && /function writeMermaid/.test(read(`../src/readers/${f}`))).map(f => f.slice(8, -3)).sort();
  assert.deepEqual(writers, Object.keys(words).sort());
  const said = guide.slice(guide.indexOf('## Export')).match(/The Mermaid writers \(([^)]*)\) are internal/);
  assert.ok(said, 'the writers are said to be internal');
  for (const w of writers) assert.ok(said[1].includes(words[w]), w);
  assert.match(guide, /`export` writes BPMN XML only/);
});

test('audit 15: a Google Cloud product the pin has no icon of draws its category\'s icon, as the note, the examples README and the gallery say', async () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8'), packs = JSON.parse(read('../icons/packs.json'));
  for (const id of ['Cloud-DNS', 'Cloud-Load-Balancing', 'Cloud-CDN', 'Pub-Sub']) assert.ok(packs.gcp.category[id], id);
  assert.doesNotMatch(read('../docs/conformance/gcp.md'), /draw a glyph/);
  assert.match(read('../docs/conformance/gcp.md'), /draw their\s+category's icon/);
  assert.doesNotMatch(read('../examples/README.md'), /The site draws it with no icon pack|Glyphs and full names on the site/);
  assert.doesNotMatch(read('../examples/index.html'), /a glyph where the pinned pack lacks one/);
});

test('audit 15: the API page states the typed views\' default direction as the schema does', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const row = read('../docs/api/typed-diagrams.md').split('\n').find(l => l.startsWith('| `direction` |'));
  assert.match(row, /down for a flowchart, a profile, a SysML block definition or requirement view/);
  assert.match(JSON.parse(read('../lib/umlimator.schema.json')).$defs.view.properties.direction.description, /down for a flowchart, a profile, a SysML block definition or requirement view/);
});

test('audit 18: the composite note says Delete on the subject is refused; the sequence and communication notes count self-lines on the cover', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8'), cs = read('../docs/conformance/uml-composite-structure.md');
  assert.doesNotMatch(cs, /hiding it from the view,\s+leaves it|Hiding the subject \(Delete\) keeps/);
  assert.match(cs, /Delete on the subject is refused/);
  for (const f of ['uml-sequence', 'uml-communication']) { const t = read(`../docs/conformance/${f}.md`);
    assert.doesNotMatch(t, /left out of the cover's/, f); assert.match(t, /listed in the lines table and counted on the cover/, f); }
  assert.match(read('../docs/editing.md'), /\| a member row \| edit its row; ↑ ↓; ✕; the new row \|/);
});

test('audit 19: the CLI guide says check exits 1 on a broken rule or a failed check, as cmd_check does, and 0 on layout problems alone', () => {
  const guide = readFileSync(new URL('../docs/guide/cli.md', import.meta.url), 'utf8'), py = readFileSync(new URL('../umlimator.py', import.meta.url), 'utf8');
  const body = py.slice(py.indexOf('def cmd_check'), py.indexOf('\ndef ', py.indexOf('def cmd_check') + 1)), exits = [...body.matchAll(/sys\.exit\(f?"([^"]*)/g)].map(x => x[1]);
  assert.ok(exits.some(x => /broken rule/.test(x)) && exits.some(x => /reported errors/.test(x)) && !exits.some(x => /crossing|detour|overflow/.test(x)), 'cmd_check exits 1 only on rules and errors');
  const para = guide.split('\n\n').find(p => p.startsWith('`check` reports'));
  assert.ok(para && !/and then exits 1/.test(para), 'no unconditional exit 1');
  assert.match(para, /exits 1 when the model breaks a rule/);
  assert.match(para, /reported with exit 0/);
});

// audit 25: the hide docs said only the subject is refused, and the editing guide that Delete keeps the element; apply()
// refuses an element only that view holds (hiding it would delete it), and the canvas's Delete sends delete for one
test('audit 25: the hide docs say an element only one view holds is refused, as apply() refuses it', async () => {
  const { apply } = await import('../lib/umlimator.js');
  const m = { schemaVersion: 2, nodes: [{ id: 'a', label: 'A' }], edges: [], views: [{ id: 'v', nodeIds: ['a'], nodes: [{ id: 'P', label: 'P' }], edges: [{ id: 'e', from: 'P', to: 'a' }] }] };
  for (const id of ['P', 'e']) assert.throws(() => apply(m, { op: 'hide', id, view: 'v' }), /lives only in view "v": delete it/, id);
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const api = doc('../docs/api/apply-and-commands.md');
  assert.match(api, /It also refuses an element that lives only in that view \(the view's own node or line/);
  assert.match(api, /\| `hide` \|[^\n]*for an element that lives only in that view/);
  for (const p of ['../docs/guide/editing.md', '../docs/editing.md']) assert.match(doc(p), /An element only this view holds \(its own node or line\)[^|]*sends `delete`|So is an element only this view holds \(its own node or line\)[^|]*sends `delete`/i, p);
});

// audit 25: the keyboard guides said one Enter opens a card's view; the canvas selects the focused card on the first Enter
// and opens its view on the next (docs/module-api.md, the design notes), and Esc or Backspace first clears a selection
test('audit 25: the keyboard guides say Enter selects a card, and Enter on the selected card opens its view', () => {
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const page = doc('../docs/guide/standalone-page.md'), views = doc('../docs/guide/views-and-layers.md');
  assert.doesNotMatch(page, /Enter opens a card's view/); assert.doesNotMatch(views, /double-click \(or Enter\) opens it/);
  assert.match(page, /Enter selects the focused card, and Enter on the selected card opens its view\. Esc or Backspace clears the selection, and with nothing selected goes back up/);
  assert.match(views, /double-click \(or Enter on the selected card\) opens it/);
  const render = readFileSync(new URL('../src/canvas/render.js', import.meta.url), 'utf8');
  assert.match(render, /sel && sel\.type === 'node' && sel\.id === id && ctx\.opensOf\(id, cur\)/, 'the canvas opens only a selected card');
});

// audit 26: gcp.md said a product's full name falls back to the id with hyphens as spaces, but the cloud views read
// icons/packs.json's names row first, with no pack fetched too ("Pub/Sub"), and split the id on underscores as well
test('audit 26: each cloud conformance note gives the full-name rule as the cloud views draw it, names row first', async () => {
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const packs = JSON.parse(readFileSync(new URL('../icons/packs.json', import.meta.url), 'utf8'));
  const { layout } = await import('../lib/umlimator-all.js');
  for (const fam of ['aws', 'gcp', 'azure']) {
    const note = doc(`../docs/conformance/${fam}.md`), names = packs[fam].names || {};
    assert.ok(!/hyphens as spaces/.test(note), `${fam}.md: the id is split on hyphens and underscores`);
    assert.ok(/`names` entry[^|]{0,160}?else the id with hyphens and underscores as spaces/.test(note), `${fam}.md: the names row, then the id`);
    for (const [id, name] of Object.entries(names)) {
      assert.ok(note.includes(`"${name}"`), `${fam}.md names ${id}'s spelling "${name}"`);
      // and the views draw it so, with no pack fetched
      const T = { aws: ['aws.Service', 'aws'], gcp: ['gcp.Product', 'gcp'], azure: ['azure.Service', 'azure'] }[fam];
      const m = { schemaVersion: 2, nodes: [{ id: 'x', type: T[0], label: 'X', props: { icon: id } }], edges: [], views: [{ id: 'v', diagram: T[1], nodeIds: ['x'] }] };
      assert.equal(layout(m, 'v').byId.x.name, name, `${fam} ${id}`);
    }
  }
});
