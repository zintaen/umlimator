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

test('audit 32: the file names the standalone-page guide gives for the Umlimator Atlas\'s exports are the ones page.js makes of examples/umlimator-atlas.json', () => {
  const guide = readFileSync(new URL('../docs/guide/standalone-page.md', import.meta.url), 'utf8'), src = readFileSync(new URL('../src/page/page.js', import.meta.url), 'utf8');
  const namePart = new Function(src.slice(src.indexOf('function namePart('), src.indexOf('/* ================= the standalone viewer')) + '; return namePart;')();
  const shop = JSON.parse(readFileSync(new URL('../examples/umlimator-atlas.json', import.meta.url), 'utf8')), base = namePart(shop.title);
  const said = guide.match(/- \*\*Map model \(JSON\)\*\*:[^\n]*/)[0];
  assert.ok(said.includes('`' + base + '.json`'), said);
  assert.ok(said.includes('`' + base + '-' + namePart(shop.views[0].id, 60, false) + '.svg`'), said);
  assert.equal(namePart('!!!'), ''); // the guide's map.json: nothing is left, and exportView names it map
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
  assert.doesNotMatch(read('../docs/examples.md'), /a glyph where the pinned pack lacks one/);
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

// audit 32: the design notes (stage 3's P12, stage 6's S17) still said a message cannot be hidden, after audit 31 made Delete
// hide a model message a sequence or timing view lists by id; the sequence conformance note cited a P12 risks.md does not have
test('audit 32: the design notes say Delete hides a model message the view lists by id, as sqRemove and tmRemove do; conformance citations name the file that holds the row', async () => {
  const { sqRemove } = await import('../src/uml/sequence.js'), { tmRemove } = await import('../src/uml/timing.js');
  const m = d => ({ schemaVersion: 2, root: 'v', nodes: [{ id: 'a', type: 'uml.Lifeline', label: 'a', props: { states: ['I'] } }, { id: 'b', type: 'uml.Lifeline', label: 'b', props: { states: ['I'] } }],
    edges: [{ id: 'c1', type: 'uml.Message', from: 'a', to: 'b', label: 'go', props: { sort: 'async', sentAt: 1, receivedAt: 2 } }], views: [{ id: 'v', diagram: d, parent: null, nodeIds: ['a', 'b'], edges: ['c1'] }] });
  for (const [d, rm] of [['uml.sequence', sqRemove], ['uml.timing', tmRemove]]) assert.deepEqual(rm(m(d), 'v', ['c1'], false).commands, [{ op: 'hide', id: 'c1', view: 'v' }], d);
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const s3 = doc('../docs/diagrams/notes/stage-3.md'), s6 = doc('../docs/diagrams/notes/stage-6.md');
  assert.match(s3, /\| Delete a message or use \|[^\n]*lists by id: Delete `hide`s it from this view/);
  assert.match(s3, /the gesture is to delete it \(P12\)[^\n]*\n\nAmended in audit 31: this holds for a message the view holds\. A model message that the view lists by id is taken out of this view by Delete/);
  assert.match(s6, /\| S17 \|[^\n]*Amended in audit 31: a model message the view lists by id is hidden from this view by Delete/);
  assert.match(s6, /### 8\.3 Hiding \(S17\)[^#]*Amended in audit 31: option \(a\) holds for a change, a constraint and a message the view holds/);
  // each `docs/...` P12-style citation in a conformance note names a file with that row
  for (const f of readdirSync(new URL('../docs/conformance/', import.meta.url)).filter(f => f.endsWith('.md')))
    for (const [, p, row] of doc(`../docs/conformance/${f}`).matchAll(/`(docs\/[^`]+\.md)` ([A-Z]\d+)\b/g))
      assert.match(doc(`../${p}`), new RegExp(`^\\| ${row} \\|`, 'm'), `${f}: ${p} ${row}`);
});

// audit 33: the editing guide said a deleted BPMN group leaves the categoryValueRef entries that named it; the code drops them, by refs
test('audit 33: the editing guide says a deleted BPMN group is dropped from the categoryValueRef that named it, as the delete does', async () => {
  await import('../src/map/typed.js'); await import('../src/bpmn/process.js');
  const { apply } = await import('../src/core/apply.js');
  const m = JSON.parse(readFileSync(new URL('../examples/bookshop-order-to-shipment.json', import.meta.url), 'utf8')), g = m.nodes.find(n => n.type === 'bpmn.Group');
  const named = mm => mm.nodes.filter(n => (n.props?.categoryValueRef || []).includes(g.id)).map(n => n.id);
  assert.ok(named(m).length >= 2, 'the example has members of the group');
  assert.deepEqual(named(apply(m, [{ op: 'delete', id: g.id }])), []);
  const row = readFileSync(new URL('../docs/editing.md', import.meta.url), 'utf8').match(/^\| delete \|[^\n]*categoryValueRef[^\n]*$/m)[0];
  assert.doesNotMatch(row, /leaves the `categoryValueRef`/);
  assert.match(row, /a deleted group's id is dropped from the `categoryValueRef` of each element that named it/);
});

// audit 33: two conformance notes still said a part in a PDF Lines row is named by its id, after audit 32 named it as drawn
test('audit 33: the composite and internal block notes name a part in a Lines row as drawn, as print.js does', async () => {
  await import('../src/map/typed.js'); await import('../src/uml/composite.js'); await import('../src/sysml/internal.js');
  const { mapContext } = await import('../src/map/context.js'), { tablesOf } = await import('../src/page/print.js');
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const lines = (f, d) => { const mm = JSON.parse(doc(`../examples/${f}`)), ctx = mapContext(mm), v = mm.views.find(x => x.diagram === d);
    return tablesOf(ctx, ctx.V[v.id], ctx.buildGeo(v.id))[1].rows.map(r => r.replace(/<[^>]+>/g, ' ')).join('\n'); };
  for (const [note, f, d, drawn, id] of [['uml-composite-structure.md', 'order-service-structure.json', 'uml.composite-structure', 'checkout : CheckoutFlow [1]', 'order-service.checkout'],
    ['sysml-internal-block.md', 'ebike-structure.json', 'sysml.internal-block', 'battery : Battery [1]', 'ebike.battery']]) {
    const said = doc(`../docs/conformance/${note}`), rows = lines(f, d);
    assert.ok(rows.includes(drawn) && !rows.includes(id), `${f}: ${rows}`);
    assert.doesNotMatch(said, /named by its id/, note);
    assert.ok(said.includes(`named as drawn (\`${drawn}\`, since audit 32`), note);
  }
});

// audit 37: the state machine note said five crossings laid out down from audit 26 on, and the component note a line along a
// box's border from audit 21 on; each figure now as check() gives it
test('the state machine and component notes\' layout limits name what check() finds laid out down (audit 37)', async () => {
  await import('../src/map/typed.js'); await import('../src/uml/state.js'); await import('../src/uml/component.js');
  const { check } = await import('../src/map/api.js');
  const doc = p => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\s+/g, ' '), json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) }), words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const sm = json('../examples/order-states.json'), crossings = d => check(turned(sm, sm.views[0].id, d), sm.views[0].id).filter(p => / cross$/.test(p.message)).length;
  assert.match(doc('../docs/conformance/uml-state-machine.md'), new RegExp(`Example 10 has ${words[crossings('right')]} crossing laid out right \\([^)]*\\) and ${words[crossings('down')]} laid out down`));
  const found = check(turned(json('./component-stress.json'), 'all', 'down'), 'all').map(p => p.message).filter(p => !/ cross$/.test(p));
  assert.deepEqual(found.map(p => / share a line$/.test(p) ? 'share' : /: header crossed by edge /.test(p) ? 'header' : p).sort(), ['header', 'share']);
  assert.match(doc('../docs/conformance/uml-component.md'), /Laid out down: one pair of lines sharing a line and one line across a box's header/);
});

// audit 39: the note's count of labels drawn on a looser spot named one on a region's border in the stress file, which check()
// has not named since audit 26 (the Payment region holds the retry loop's label, off its border); each count as check() gives it
test('the state machine note\'s labels on a looser spot are the ones check() names, in example 10 and the stress file (audit 39)', async () => {
  await import('../src/map/typed.js'); await import('../src/uml/state.js');
  const { check } = await import('../src/map/api.js');
  const doc = readFileSync(new URL('../docs/conformance/uml-state-machine.md', import.meta.url), 'utf8').replace(/\s+/g, ' '), json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const turned = (m, vid, direction) => ({ ...m, views: m.views.map(v => (v.id === vid ? { ...v, direction } : v)) }), words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const said = (m, vid) => ['right', 'down'].flatMap(d => check(turned(m, vid, d), vid).map(p => p.message));
  const ex = json('../examples/order-states.json'), st = json('./state-stress.json'), all = said(st, 'all'), both = [...all, ...said(st, 'edge-cases')];
  const onLine = said(ex, ex.views[0].id).filter(p => / lies on edge /.test(p)).length, border = both.filter(p => /^view [^:]+: label .* sits on the border of /.test(p)).length;
  assert.ok(doc.includes(`(example 10: ${words[onLine]} labels on lines; the stress file: ${border ? `${words[border]} on a region's border, ` : ''}${words[all.filter(p => / lies on edge /.test(p)).length]} on lines in \`all\`)`), 'the note counts what check() names');
});

// audit 47 findings 16 and 21: the released 0.43.0 notes describe 0.43.0 and say what changed since, as main draws and edits
test('audit 47: the 0.43.0 notes do not credit 0.43.0 with the later d.ts and schema, and say the comment link and stereotype gaps as they stand', async () => {
  const doc = readFileSync(new URL('../docs/module-api.md', import.meta.url), 'utf8'), s = doc.slice(doc.indexOf('\n## 0.43.0'), doc.indexOf('\n## ', doc.indexOf('\n## 0.43.0') + 5) >>> 0 || undefined);
  assert.ok(s.length > 1000);
  assert.doesNotMatch(s, /`lib\/umlimator\.d\.ts` and the schema say so/);
  const dts = readFileSync(new URL('../lib/umlimator.d.ts', import.meta.url), 'utf8');
  assert.match(dts, /change\?: 'added' \| 'new' \| 'removed' \| 'changed' \| 'modified'/, 'main\'s d.ts lists them: the note says they came after the release');
  assert.match(s, /The 0\.43\.0 `lib\/umlimator\.d\.ts` and schema still describe a map line's `change` as `added`, `removed` or `changed`/);
  // the views refuse a comment link with no comment at either end now (the requirement view's connect, as the repro drives it)
  const { diagramOf } = await import('../src/core/registry.js'); await import('../src/map/typed.js'); await import('../src/sysml/requirement.js');
  const m = { schemaVersion: 2, nodes: [{ id: 'r1', type: 'sysml.Requirement', label: 'A' }, { id: 'r2', type: 'sysml.Requirement', label: 'B' }], edges: [], views: [{ id: 'v', diagram: 'sysml.requirement', nodeIds: ['r1', 'r2'] }] };
  assert.ok(diagramOf(m.views[0]).edits.connect(m, m.views[0], 'r1', 'r2', null, { type: 'uml.CommentLink' }).error);
  assert.doesNotMatch(s, /(?<!In 0\.43\.0 )the use case, state machine, interaction overview, ER, flowchart, DFD, SysML requirement and all six C4 views still add a comment link/i);
  assert.match(s, /since that release \(#519 to #521\) they refuse one/);
});

// audit 48: the CLI guide's PDF section heads a view page with an example path; it is one the Umlimator Atlas's PDF prints,
// the titles of a view's chain (mapContext's chain(), which print.js heads each page with), not a title no view has
test('audit 48: the CLI guide\'s example PDF page heading is a view path of the Umlimator Atlas it links', async () => {
  const { mapContext } = await import('../src/map/context.js');
  const guide = readFileSync(new URL('../docs/guide/cli.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const said = guide.match(/under its path \("([^"]+)"\)/)[1];
  const atlas = JSON.parse(readFileSync(new URL('../examples/umlimator-atlas.json', import.meta.url), 'utf8')), ctx = mapContext(atlas);
  const paths = atlas.views.map(v => ctx.chain(v.id).map(id => ctx.V[id].title).join(' › '));
  assert.ok(guide.includes('umlimator-atlas.pdf') && paths.includes(said), `${said} is none of: ${paths.join(' | ')}`);
});

// audit 51: the API page and the Action guide quoted "adds Readers between umlimator.py and The module", a sentence diff()
// never writes for the Umlimator Atlas (Readers has no line to The module): each quoted "adds <card>..." is what diff()
// says when that card, and its lines, are added to the atlas
test('audit 51: the diff() summary the docs quote is what diff() says for the Umlimator Atlas', async () => {
  const { diff } = await import('../lib/umlimator-all.js');
  const after = JSON.parse(readFileSync(new URL('../examples/umlimator-atlas.json', import.meta.url), 'utf8'));
  let n = 0;
  for (const p of ['../docs/api/apply-and-commands.md', '../docs/guide/github-action.md']) {
    for (const [, said, label] of readFileSync(new URL(p, import.meta.url), 'utf8').matchAll(/"(adds ([^",]+?)(?:,| between)[^"]*)"/g)) {
      const card = after.nodes.find(x => x.label === label); assert.ok(card, `${p}: ${label}`);
      const before = structuredClone(after);
      before.nodes = before.nodes.filter(x => x.id !== card.id);
      before.edges = before.edges.filter(e => e.from !== card.id && e.to !== card.id);
      for (const v of before.views) if (v.nodeIds) v.nodeIds = v.nodeIds.filter(i => i !== card.id);
      assert.ok(diff(before, after).summary.includes(said), `${p}: "${said}" not in ${JSON.stringify(diff(before, after).summary)}`); n++;
    }
  }
  assert.equal(n, 2);
});

// audit 51: the class conformance note gave the drawn operation as `+ place(at: Date, in qty: Int): Order` and the class
// type's checklist said "in by", but a class draws no `in` (UML's default direction): the note's example is the text the
// class diagram draws for that operation, and the checklist names only directions the type's example draws
test('audit 51: a parameter\'s direction is documented as the class diagram draws it', async () => {
  await import('../src/map/typed.js'); await import('../src/uml/class.js');
  const { layout } = await import('../src/map/api.js'), { svgOf } = await import('../src/draw/svg.js');
  const texts = (m, v) => [...svgOf(layout(m, v), { title: '' }).matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(x => x[1].replace(/<[^>]+>/g, ''));
  const row = readFileSync(new URL('../docs/conformance/uml-class.md', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('| 9.6 Operation, Parameter'));
  const drawn = /`(\+ place\([^`]*)`/.exec(row)[1], out = /`(out was: Money)`/.exec(row)[1];
  const m = { schemaVersion: 2, nodes: [{ id: 'o', type: 'uml.Class', label: 'Order', members: [
    { id: 'o.place', type: 'uml.Operation', label: 'place', props: { visibility: 'public', returnType: 'Order', parameters: [{ name: 'at', valueType: 'Date' }, { name: 'qty', valueType: 'Int', direction: 'in' }] } },
    { id: 'o.undo', type: 'uml.Operation', label: 'undo', props: { visibility: 'public', parameters: [{ name: 'was', valueType: 'Money', direction: 'out' }] } }] }],
    edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['o'] }] };
  const t = texts(m, 'v');
  assert.ok(t.includes(drawn), `${drawn} not in ${JSON.stringify(t)}`); assert.ok(t.some(x => x.includes(out)), JSON.stringify(t));
  const types = JSON.parse(readFileSync(new URL('../tools/types.json', import.meta.url), 'utf8')).types['uml-class'];
  const item = JSON.stringify(types).match(/"(Operations with parameters[^"]*)"/)[1];
  const ex = JSON.parse(readFileSync(new URL('../examples/types/uml-class.json', import.meta.url), 'utf8')), et = ex.views.flatMap(v => texts(ex, v.id)).join('\n');
  for (const [, d, name] of item.matchAll(/\b(in|out|inout) (\w+)\b/g)) assert.match(et, new RegExp(`\\b${d} ${name}: `), `${item}: ${d} ${name} is not drawn`);
  assert.match(item, /out was/);
});

// audit 49: the CLI guide's first block renders the Umlimator Atlas to page.html, but its stills and check lines still named
// the bookshop's views ('api', 'pic-*'), and both stopped with exit 1. Each --views on a page.html line goes through
// umlimator.py's own pick() on the page that block's render line writes.
test('audit 49: every --views in the CLI guide names views of the page its render line writes', async () => {
  const { spawnSync } = await import('node:child_process'), { mkdtempSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname, guide = readFileSync(new URL('../docs/guide/cli.md', import.meta.url), 'utf8');
  const cmds = [...guide.matchAll(/```bash\n([\s\S]*?)```/g)].flatMap(m => m[1].split('\n')).map(l => l.replace(/\s+#.*$/, '').trim()).filter(l => l.startsWith('python3 umlimator.py'));
  const src = /^python3 umlimator\.py render (\S+) --out page\.html/.exec(cmds.find(l => / --out page\.html\b/.test(l)) || '');
  assert.ok(src, 'a render line writes page.html');
  const specs = cmds.filter(l => /\bpage\.html\b/.test(l) && / --views /.test(l)).map(l => /--views ('[^']*'|\S+)/.exec(l)[1].replace(/^'|'$/g, ''));
  assert.ok(specs.length >= 2, `the guide's --views lines: ${specs}`);
  const dir = mkdtempSync(join(tmpdir(), 'um-cli-')), page = join(dir, 'page.html');
  try {
    const r = spawnSync('python3', ['umlimator.py', 'render', src[1], '--out', page, '--no-check'], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    for (const spec of specs) {
      const p = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, "."); import umlimator; print(umlimator.pick(sys.argv[1], sys.argv[2]))', page, spec], { cwd: root, encoding: 'utf8' });
      assert.equal(p.status, 0, `--views ${spec}: ${p.stderr}`); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// audit 49: since #536 every map line is drawn at one width at rest (src/canvas/styles.js sets --um-ew by weight under
// .hov, .hot and .key-on only), but the d.ts, the schema and the example cards still said a weight is drawn as a width
test('audit 49: the types, the schema and the example texts say a line\'s weight shows on hover, selection and focus, not as its width at rest', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const dts = read('../lib/umlimator.d.ts'), mapEdge = dts.slice(dts.indexOf('export interface MapEdge'), dts.indexOf('export interface MapView'));
  assert.match(mapEdge, /weight\?: 1 \| 2 \| 3;/); assert.match(mapEdge, /\n  what\?: string;/); assert.match(mapEdge, /\n  when\?: string;/);
  const w = /How much the line stands for[\s\S]*?\*\//.exec(mapEdge)[0];
  assert.doesNotMatch(w, /drawn as its width/); assert.match(w, /at one width at rest[\s\S]*on hover, selection and keyboard[\s\S]*focus/);
  const schema = JSON.parse(read('../lib/umlimator.schema.json')).$defs.edge.properties.weight.description;
  assert.doesNotMatch(schema, /drawn as its width/); assert.match(schema, /one width at rest; a line of weight 2 or 3 shows its width on hover, selection and keyboard focus/);
  for (const p of ['../tools/types.json', '../examples/types/map.json', '../docs/gallery/map.md', '../examples/README.md', '../examples/monorepo.py', '../tests/fixtures/integration/shop.json', '../tests/fixtures/integration.json'])
    assert.doesNotMatch(read(p), /heavier with more imports|weights 1 to 3 as widths|main path drawn heavier/, p);
});
