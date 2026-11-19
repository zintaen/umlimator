// The examples' gallery (examples/index.html, the site's /umlimator/examples/): written by tools/gallery.mjs, in two
// parts. Diagrams has a group for every diagram type (the map and docs/types.md's 28), each showing every example and
// view of that type; Atlas holds exactly one entry, the Umlimator Atlas (the maintainer's decision, 19 Nov 2026). Every
// example model is reachable from the page, and every link and picture on it names a file the site serves, as the
// site job builds it (.github/workflows/check.yml). The models that left the gallery (tools/gallery.json's retired list,
// whose files stay until the bike share migration deletes them) are linked from nowhere in the gallery, the docs or the
// README.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { page, inventory, types, groupOf } from '../tools/gallery.mjs';

const root = new URL('../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8'), json = p => JSON.parse(read(p));
const html = read('examples/index.html');
const RETIRED = json('tools/gallery.json').retired.files;
const examples = readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(n => !RETIRED.includes(n)).sort();
const samples = readdirSync(new URL('tests/', root)).filter(f => /^[a-z0-9-]+-(minimal|stress)\.json$/.test(f)).map(f => f.slice(0, -5)).sort();
// a section by its id, to its closing tag at its own indent: the page's parts (Diagrams, Atlas) and each type's group
const section = id => {
  const m = new RegExp(`\\n( *)<section[^>]* id="${id}"`).exec(html); assert.ok(m, `a section ${id}`);
  return html.slice(m.index, html.indexOf(`\n${m[1]}</section>`, m.index));
};
// an attribute's values in the tags of a piece of the page (not in text such as <code>&lt;umlimator-map src="..."&gt;</code>)
const attrs = (s, name) => [...s.matchAll(/<[a-z][^<>]*>/g)].flatMap(t => [...t[0].matchAll(new RegExp(` ${name}="([^"]*)"`, 'g'))]).map(m => m[1].replace(/&amp;/g, '&'));

test('the committed gallery is what tools/gallery.mjs writes', () => {
  assert.equal(html, page(), 'examples/index.html is stale: run node tools/gallery.mjs and commit it');
});

test('Diagrams has a group for the map and each of docs/types.md\'s 28 types, in its order, each with an example', () => {
  const T = types();
  assert.equal(T.length, 28);
  const want = ['map', ...T.map(t => t.id)], got = [...section('diagrams').matchAll(/<section class="type" id="type-([\w-]+)"/g)].map(m => m[1]);
  assert.deepEqual(got, want);
  for (const t of inventory()) assert.ok(t.examples.length + t.atlas.length > 0, `${t.id} has an example`);
  // the type list at the top of Diagrams goes to each group
  const nav = section('diagrams').slice(0, section('diagrams').indexOf('</nav>'));
  assert.deepEqual(attrs(nav, 'href').filter(h => h.startsWith('#type-')).map(h => h.slice(6)), want);
});

test('every example model, every view of it and every test model of a type is on the page', () => {
  const D = section('diagrams');
  for (const n of examples) {
    const m = json(`examples/${n}.json`);
    assert.ok(attrs(html, 'href').includes(`${n}.json`), `examples/${n}.json is linked`);
    for (const v of m.views) {
      const g = section(`type-${groupOf(v)}`);
      const shown = [`${n}.html#view=${v.id}`, `stills/${n}/${v.id}.png`].some(x => [...attrs(g, 'href'), ...attrs(g, 'src')].includes(x))
        || (v.id === m.root && attrs(g, 'href').includes(`${n}.html`) && attrs(g, 'src').includes(`stills/${n}/${v.id}.png`));
      assert.ok(shown, `${n}'s view ${v.id} is in the ${groupOf(v)} group`);
    }
  }
  for (const n of samples) {
    const m = json(`tests/${n}.json`);
    for (const v of m.views) assert.ok([...attrs(section(`type-${groupOf(v)}`), 'href'), ...attrs(section(`type-${groupOf(v)}`), 'src')]
      .some(x => x === `samples/${n}.html#view=${v.id}`), `tests/${n}.json's view ${v.id} is in the ${groupOf(v)} group`);
  }
  assert.ok(D.includes('umlimator-atlas.html#view=diff-run'), 'the atlas\'s views are in their types\' groups');
});

test('Atlas holds exactly one entry, the Umlimator Atlas, and its state machines are views of it', () => {
  const A = section('atlas'), cards = A.split('<article').length - 1;
  assert.equal(cards, 1);
  assert.match(A, /<h3>The Umlimator Atlas<\/h3>/);
  assert.ok(attrs(A, 'href').includes('umlimator-atlas.json'));
  const m = json('examples/umlimator-atlas.json'), ids = new Set(m.views.map(v => v.id));
  assert.equal(m.title, 'Umlimator Atlas');
  for (const v of ['overview', 'machines', 'navigation', 'story', 'tour', 'keys', 'mcp']) assert.ok(ids.has(v), v);
  // the machines are examples/states.json's (umlimator's state machines, which left the gallery for the atlas)
  const machines = json('examples/states.json');
  for (const v of machines.views) assert.deepEqual(m.views.find(w => w.id === v.id).nodeIds, v.nodeIds, v.id);
  // no other multi-view real-world model in examples/: every other example is a single-type example of one diagram type,
  // or a map
  for (const n of examples.filter(n => n !== 'umlimator-atlas')) assert.equal(new Set(json(`examples/${n}.json`).views.map(groupOf)).size <= 2, true, n);
});

// what the site job publishes under /umlimator/examples/, read from its own steps so the two cannot drift
function served() {
  const ci = read('.github/workflows/check.yml'), site = ci.slice(ci.indexOf('  site:'));
  assert.match(site, /cp examples\/\*\.json examples\/\*\.html examples\/\*\.js examples\/\*\.mjs examples\/README\.md _site\/examples\//);
  assert.match(site, /cp -r examples\/traces _site\/examples\//);
  assert.match(site, /for m in examples\/\*\.json; do[\s\S]*render "\$m" --out "_site\/examples\/\$n\.html"[\s\S]*stills "_site\/examples\/\$n\.html" --out "_site\/examples\/stills\/\$n"[\s\S]*pdf "_site\/examples\/\$n\.html" --out "_site\/examples\/\$n\.pdf"/);
  assert.match(site, /for m in tests\/\*-minimal\.json tests\/\*-stress\.json; do[\s\S]*cp "\$m" _site\/examples\/samples\/[\s\S]*render "\$m" --out "_site\/examples\/samples\/\$n\.html"[\s\S]*stills "_site\/examples\/samples\/\$n\.html" --out "_site\/examples\/samples\/stills\/\$n"[\s\S]*pdf "_site\/examples\/samples\/\$n\.html" --out "_site\/examples\/samples\/\$n\.pdf"/);
  const files = new Set(readdirSync(new URL('examples/', root)).filter(f => /\.(json|html|js|mjs)$/.test(f) || f === 'README.md'));
  readdirSync(new URL('examples/traces/', root)).forEach(f => files.add(`traces/${f}`));
  const views = {};
  // the retired models too: the site renders them until the migration deletes them, and the host pages load them
  for (const [dir, list, from] of [['', [...examples, ...RETIRED], 'examples'], ['samples/', samples, 'tests']]) for (const n of list) {
    const m = json(`${from}/${n}.json`); views[`${dir}${n}.html`] = m;
    if (dir) files.add(`${dir}${n}.json`);
    files.add(`${dir}${n}.html`); files.add(`${dir}${n}.pdf`);
    for (const v of m.views) for (const ext of ['png', 'svg']) files.add(`${dir}stills/${n}/${v.id}.${ext}`);
    for (const s of m.stories || []) if (!dir) files.add(`stills/${n}/story-${s.id}.png`);
  }
  return { files, views };
}

test('every link and picture on the gallery names a file the site serves, and a view or story its model has', () => {
  const { files, views } = served(), ids = new Set(attrs(html, 'id')), bad = [];
  for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) {
    const [path, hash = ''] = ref.split('#');
    if (/^https:\/\/github\.com\/zintaen\/umlimator(\/blob\/main\/(.+))?$/.test(path)) {
      const file = path.match(/\/blob\/main\/(.+)$/)?.[1];
      if (file && !existsSync(new URL(file, root))) bad.push(`${ref}: no ${file} in the repository`);
      continue;
    }
    if (/^https?:/.test(path)) { bad.push(`${ref}: an address outside the repository`); continue; }
    if (!path) { if (!ids.has(hash)) bad.push(`${ref}: no such id on the page`); continue; }
    if (path.startsWith('../lib/') || path.startsWith('../icons/')) { if (!existsSync(new URL(path.slice(3), root))) bad.push(`${ref}: no ${path.slice(3)}`); continue; }
    if (path.startsWith('../')) { const md = new URL(`docs/${path.slice(3).replace(/\.html$/, '.md')}`, root); if (!existsSync(md)) bad.push(`${ref}: no docs page ${md.pathname}`); continue; }
    if (!files.has(path)) { bad.push(`${ref}: the site does not serve examples/${path}`); continue; }
    const m = views[path], q = new URLSearchParams(hash);
    if (q.get('view') && !(m && m.views.some(v => v.id === q.get('view')))) bad.push(`${ref}: ${path} has no view ${q.get('view')}`);
    if (q.get('story') && !(m && (m.stories || []).some(s => s.id === q.get('story')))) bad.push(`${ref}: ${path} has no story ${q.get('story')}`);
  }
  assert.deepEqual(bad, []);
});

test('the host pages fetch only models and traces the site serves', () => {
  const { files } = served(), bad = [];
  for (const f of readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.html') && f !== 'umlimator-atlas.html')) {
    const s = read(`examples/${f}`);
    for (const [, p] of s.matchAll(/(?:fetch\(|src=|<option value=)['"]([\w./-]+\.(?:json|png))['"]/g)) if (!files.has(p)) bad.push(`${f}: ${p}`);
  }
  assert.deepEqual(bad, []);
});

// the models that left the gallery on 19 Nov 2026 (the maintainer's decisions): their files stay in examples/ until the
// bike share migration moves the tests and the bench off them and deletes them, but the gallery, the docs and the README
// link none of them, and bike-share.json, the hidden test model, is never listed
test('the models that left the gallery are linked from nowhere in the gallery, the docs or the README', () => {
  assert.deepEqual([...RETIRED].sort(), ['assistant', 'bike-share', 'bookshop', 'bookshop-atlas', 'clinic', 'ebike-atlas', 'states', 'weather']);
  const walk = dir => readdirSync(new URL(dir, root)).flatMap(f => { const p = `${dir}${f}`;
    if (f === 'node_modules' || f === 'dist' || f === 'cache') return [];
    return statSync(new URL(p, root)).isDirectory() ? walk(`${p}/`) : /\.(md|html|mts|js|mjs)$/.test(f) ? [p] : []; });
  // the site's pages: docs/ but the notes it leaves out (diagrams/, editing.md and module-api.md, the design record)
  const site = walk('docs/').filter(p => !/^docs\/(diagrams\/|editing\.md|module-api\.md)/.test(p));
  const pages = ['README.md', 'examples/index.html', ...site];
  const gone = new RegExp(`(?:^|[/"'(])(?:${RETIRED.join('|')})\\.(?:json|html|pdf|dsl)\\b|stills/(?:${RETIRED.join('|')})/|tools/(?:atlas|ebike)-links\\.json|traces/(?:ride-end|match)\\.json`);
  const bad = [];
  for (const p of pages) {
    const s = read(p);
    // link targets: markdown (](...)), HTML (href, src, fetch), the docs' map blocks (src: ...) and the docs nav (link: '...')
    for (const [, t] of [...s.matchAll(/\]\(([^)\s]+)\)|(?:href|src)=["']([^"']+)["']|fetch\(['"]([^'"]+)['"]|link: ['"]([^'"]+)['"]|^src: (\S+)/gm)].map(m => [m[0], m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]]))
      if (gone.test(t)) bad.push(`${p}: ${t}`);
  }
  assert.deepEqual(bad, []);
  // and no word of them on the gallery or the site's pages: the atlases, the bike share, the weather stations, the helpdesk
  const words = /Bookshop atlas|e-bike atlas|bike[- ]share|weather station|helpdesk|clinic booking/i;
  assert.deepEqual(pages.filter(p => words.test(read(p))), []);
  assert.doesNotMatch(html, /(?<![\w-])(?:bike-share|states\.json)/);
});
