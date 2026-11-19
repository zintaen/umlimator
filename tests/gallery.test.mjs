// The examples' pages of the documentation site, written by tools/gallery.mjs: docs/examples.md (the site's
// /umlimator/examples.html), in three parts, a page per type and one for the Atlas (docs/gallery/), their sidebar
// (docs/.vitepress/gallery.json), and examples/index.html, the old address, now a redirect to the docs page. Diagrams has
// one card for every diagram type (the map and docs/types.md's 28), each opening the type's docs page, which shows its
// rendered page (examples/types/<type>.html, tools/types.mjs; tests/types.test.mjs checks those) in a frame, opened on its
// main view, and lists what the diagram shows and its alternatives (the maintainer's decision, 20 Nov 2026: one
// comprehensive example per type); Atlas lists tools/gallery.json's atlases, whole businesses each one model of many types,
// the Umlimator Atlas first; In an app lists the host pages. Every link, picture and frame on them names a file the site serves, as the site job builds it
// (.github/workflows/check.yml), or a docs page. The models the gallery does not show (tools/gallery.json's retired list,
// empty since the test models moved to tests/fixtures/) are linked from nowhere in the gallery, the docs or the README,
// and nor are the models that left the gallery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { files, inventory, types, groupOf, atlases, EX } from '../tools/gallery.mjs';

const root = new URL('../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8'), json = p => JSON.parse(read(p));
const html = read('docs/examples.md');
const written = files();
const RETIRED = json('tools/gallery.json').retired.files;
const examples = readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(n => !RETIRED.includes(n)).sort();
const typePages = readdirSync(new URL('examples/types/', root)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
// a part of the index by its heading's id ("## Diagrams {#diagrams}"), to the next heading of its level
const section = id => {
  const m = new RegExp(`^(#+) [^\\n]* \\{#${id}\\}$`, 'm').exec(html); assert.ok(m, `a section ${id}`);
  const next = new RegExp(`^#{1,${m[1].length}} `, 'm').exec(html.slice(m.index + m[0].length));
  return html.slice(m.index, next ? m.index + m[0].length + next.index : html.length);
};
// an attribute's values in the tags of a piece of a page (not in text such as <code>&lt;umlimator-map src="..."&gt;</code>);
// a bound one (:src="'...'") by its string
const attrs = (s, name) => [...s.matchAll(/<[a-z][^<>]*>/g)].flatMap(t => [...t[0].matchAll(new RegExp(` :?${name}="([^"]*)"`, 'g'))]).map(m => m[1].replace(/^'(.*)'$/, '$1').replace(/&amp;/g, '&'));

test('the committed examples pages, their sidebar and the redirect are what tools/gallery.mjs writes', () => {
  for (const [p, s] of Object.entries(written)) assert.equal(read(p), s, `${p} is stale: run node tools/gallery.mjs and commit it`);
  const pages = readdirSync(new URL('docs/gallery/', root)).map(f => `docs/gallery/${f}`).sort();
  assert.deepEqual(pages, Object.keys(written).filter(p => p.startsWith('docs/gallery/')).sort(), 'docs/gallery/ holds only the pages the tool writes');
  assert.equal(pages.length, 29 + atlases().length, 'the map, the 28 types and each atlas');
});

test('the site shows the examples in its own layout: the nav\'s Examples opens examples.html, the sidebar lists every examples page', () => {
  const config = read('docs/.vitepress/config.mts');
  assert.match(config, /\{ text: 'Examples', link: '\/examples', activeMatch: '\^\/\(examples\$\|gallery\/\)' \}/);
  assert.match(config, /'\/examples': gallery,/);
  assert.match(config, /'\/gallery\/': gallery,/);
  const links = json('docs/.vitepress/gallery.json').flatMap(g => g.items.map(i => i.link));
  assert.deepEqual(links, ['/examples', ...inventory().map(t => `/gallery/${t.id}`), ...atlases().map(A => `/gallery/${A.page}`)]);
  for (const l of links) assert.ok(existsSync(new URL(`docs${l}.md`, root)), `docs${l}.md`);
  // the docs link the examples' docs page, not the old address
  for (const p of ['README.md', 'docs/index.md', 'docs/types.md', 'docs/guide/getting-started.md']) assert.doesNotMatch(read(p), /examples\/index\.html/, p);
});

test('examples/index.html, the old address, sends a reader to the docs page with the #fragment', () => {
  const r = read('examples/index.html');
  assert.match(r, /<script>location\.replace\('\.\.\/examples\.html' \+ location\.hash\);<\/script>/);
  assert.match(r, /<meta http-equiv="refresh" content="0; url=\.\.\/examples\.html">/);
  assert.match(r, /<a href="\.\.\/examples\.html">/);
  // an old link to a card or a part lands on it
  const ids = new Set([...attrs(html, 'id'), ...[...html.matchAll(/ \{#([\w-]+)\}$/gm)].map(m => m[1])]);
  for (const id of ['diagrams', 'atlas', 'apps', ...inventory().map(t => `type-${t.id}`)]) assert.ok(ids.has(id), id);
});

test('Diagrams has a card for the map and each of docs/types.md\'s 28 types, in its order, each opening its docs page', () => {
  const T = types();
  assert.equal(T.length, 28);
  const want = ['map', ...T.map(t => t.id)], D = section('diagrams'), got = [...D.matchAll(/<article class="ex-card" id="type-([\w-]+)"/g)].map(m => m[1]);
  assert.deepEqual(got, want);
  assert.deepEqual(typePages, [...want].sort(), 'examples/types/ holds a model for each type, and no other');
  // the type list at the top of Diagrams goes to each card
  const nav = D.slice(0, D.indexOf('</nav>'));
  assert.deepEqual(attrs(nav, 'href').filter(h => h.startsWith('#type-')).map(h => h.slice(6)), want);
  for (const t of inventory()) {
    const c = D.slice(D.indexOf(`id="type-${t.id}"`), D.indexOf('</article>', D.indexOf(`id="type-${t.id}"`)));
    assert.ok(attrs(c, 'href').includes(`./gallery/${t.id}.html`), `${t.id}: opens its docs page`);
    // the card's picture is the main view's still, and it links the main view and the alternatives
    const views = [t.main, ...t.alternatives.map(a => a.view)];
    assert.ok(attrs(c, 'src').includes(`${EX}types/stills/${t.id}/${t.main}.png`), `${t.id}: its card shows the main view`);
    assert.deepEqual(attrs(c, 'href').filter(h => h.startsWith(`${EX}types/${t.id}.html#view=`)).map(h => h.split('=')[1]), views, t.id);
    assert.ok(t.shows.length > 0 && c.includes('<ul class="ex-shows-short"><li>'), `${t.id}: its card lists what it shows first`);
    const p = read(`docs/gallery/${t.id}.md`);
    assert.deepEqual(attrs(p, 'src').filter(s => s.startsWith(EX)), [`${EX}types/${t.id}.html`], `${t.id}: its docs page frames its type page`);
    assert.equal(json(`examples/types/${t.id}.json`).root, t.main, `${t.id}: the framed page opens on the main view`);
    assert.deepEqual(attrs(p, 'href').filter(h => h.startsWith(`${EX}types/${t.id}.html#view=`)).map(h => h.split('=')[1]), views, `${t.id}'s docs page`);
    assert.match(p, new RegExp(`<a href="${EX}types/${t.id}\\.html" target="_self">Open full screen`));
    // its checklist: each "shows" item, in order
    const list = p.slice(p.indexOf('<ol class="ex-shows">'), p.indexOf('</ol>'));
    assert.equal(list.split('<li>').length - 1, t.shows.length, `${t.id}: its docs page lists every "shows" item`);
    assert.equal(p.includes('{#alternatives}'), t.alternatives.length > 0, `${t.id}: its alternatives, when it has any`);
  }
});

test('Atlas lists tools/gallery.json\'s atlases in order, the Umlimator Atlas first, each framed on its page; its state machines are views of it', () => {
  const A = section('atlas'), list = atlases();
  assert.deepEqual([...A.matchAll(/<article class="ex-card ex-wide" id="atlas-([\w-]+)"/g)].map(m => m[1]), list.map(x => x.file));
  assert.equal(list[0].file, 'umlimator-atlas');
  assert.match(A, /<h3><a href="\.\/gallery\/atlas\.html">The Umlimator Atlas<\/a><\/h3>/);
  for (const x of list) {
    assert.ok(attrs(A, 'href').includes(`${EX}${x.file}.json`), x.file);
    assert.deepEqual(attrs(read(`docs/gallery/${x.page}.md`), 'src'), [`${EX}${x.file}.html`], `${x.page}: the atlas page frames the atlas`);
    // a whole business: one model, many types
    assert.ok(new Set(json(`examples/${x.file}.json`).views.map(groupOf)).size >= 3, `${x.file} uses many diagram types`);
  }
  const m = json('examples/umlimator-atlas.json'), ids = new Set(m.views.map(v => v.id));
  assert.equal(m.title, 'Umlimator Atlas');
  for (const v of ['overview', 'machines', 'navigation', 'story', 'tour', 'keys', 'mcp']) assert.ok(ids.has(v), v);
  // the machines are umlimator's (docs/module-api.md's State chapter), as examples/states.json drew them before it left
  // the gallery: written here, so that the check outlives that file, which step 4 of the one-model plan deleted
  const machines = {
    machines: ['page', 'mcp', 'story', 'navigation', 'tour', 'mapstate'],
    navigation: ['nav-rest', 'nav-leaving', 'nav-drawing', 'nav-entering'],
    story: ['st-none', 'st-entering', 'st-playing', 'st-paused', 'st-ended', 'st-stopped'],
    tour: ['tr-none', 'tr-riding', 'tr-held', 'tr-end', 'tr-cut', 'tr-rest'],
    keys: ['ky-lightbox', 'ky-search', 'ky-help', 'ky-menu', 'ky-pill', 'ky-recorder', 'ky-story', 'ky-trip', 'ky-selection', 'ky-up'],
    mcp: ['mc-asked', 'mc-want', 'mc-sent', 'mc-showing', 'mc-acked', 'mc-answer'],
  };
  for (const [id, nodeIds] of Object.entries(machines)) assert.deepEqual(m.views.find(w => w.id === id).nodeIds, nodeIds, id);
  // no other multi-view real-world model in examples/: every other example is a single-type example of one diagram type,
  // or a map
  for (const n of examples.filter(n => !list.some(x => x.file === n))) assert.equal(new Set(json(`examples/${n}.json`).views.map(groupOf)).size <= 2, true, n);
});

// what the site job publishes under /umlimator/examples/, read from its own steps so the two cannot drift
function served() {
  const ci = read('.github/workflows/check.yml'), site = ci.slice(ci.indexOf('  site:'));
  assert.match(site, /cp examples\/\*\.json examples\/\*\.html examples\/\*\.js examples\/\*\.mjs examples\/README\.md _site\/examples\//);
  assert.match(site, /cp -r examples\/traces _site\/examples\//);
  assert.match(site, /for m in examples\/\*\.json; do[\s\S]*render "\$m" --out "_site\/examples\/\$n\.html"[\s\S]*stills "_site\/examples\/\$n\.html" --out "_site\/examples\/stills\/\$n"[\s\S]*pdf "_site\/examples\/\$n\.html" --out "_site\/examples\/\$n\.pdf"/);
  assert.match(site, /cp examples\/types\/\*\.json _site\/examples\/types\/\n\s*for m in examples\/types\/\*\.json; do[\s\S]*render "\$m" --out "_site\/examples\/types\/\$n\.html"[\s\S]*stills "_site\/examples\/types\/\$n\.html" --out "_site\/examples\/types\/stills\/\$n"[\s\S]*pdf "_site\/examples\/types\/\$n\.html" --out "_site\/examples\/types\/\$n\.pdf"/);
  const files = new Set(readdirSync(new URL('examples/', root)).filter(f => /\.(json|html|js|mjs)$/.test(f) || f === 'README.md'));
  readdirSync(new URL('examples/traces/', root)).forEach(f => files.add(`traces/${f}`));
  const views = {};
  // the retired models too: the site renders them, and the host pages load them
  for (const [dir, list, from] of [['', [...examples, ...RETIRED], 'examples'], ['types/', typePages, 'examples/types']]) for (const n of list) {
    const m = json(`${from}/${n}.json`); views[`${dir}${n}.html`] = m;
    if (dir) files.add(`${dir}${n}.json`);
    files.add(`${dir}${n}.html`); files.add(`${dir}${n}.pdf`);
    for (const v of m.views) for (const ext of ['png', 'svg']) files.add(`${dir}stills/${n}/${v.id}.${ext}`);
    for (const s of m.stories || []) if (!dir) files.add(`stills/${n}/story-${s.id}.png`);
  }
  return { files, views };
}

test('every link, picture and frame on the examples pages names a docs page or a file the site serves, and a view or story its model has', () => {
  const { files, views } = served(), bad = [];
  for (const page of Object.keys(written).filter(p => p.endsWith('.md') || p.endsWith('.html'))) {
    const s = read(page), dir = page.slice(0, page.lastIndexOf('/') + 1);
    const ids = new Set([...attrs(s, 'id'), ...[...s.matchAll(/ \{#([\w-]+)\}$/gm)].map(m => m[1])]);
    // the docs' own links ([text](./page.md)) too
    const md = [...s.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]);
    for (const ref of [...attrs(s, 'href'), ...attrs(s, 'src'), ...md]) {
      const [path, hash = ''] = ref.split('#'), at = `${page}: ${ref}`;
      if (/^https:\/\/github\.com\/zintaen\/umlimator(\/blob\/main\/(.+))?$/.test(path)) {
        const file = path.match(/\/blob\/main\/(.+)$/)?.[1];
        if (file && !existsSync(new URL(file, root))) bad.push(`${at}: no ${file} in the repository`);
        continue;
      }
      if (/^https?:/.test(path)) { bad.push(`${at}: an address outside the repository`); continue; }
      if (!path) { if (!ids.has(hash)) bad.push(`${at}: no such id on the page`); continue; }
      if (path.startsWith(EX)) {
        const p = path.slice(EX.length);
        if (!files.has(p)) { bad.push(`${at}: the site does not serve examples/${p}`); continue; }
        const m = views[p], q = new URLSearchParams(hash);
        if (q.get('view') && !(m && m.views.some(v => v.id === q.get('view')))) bad.push(`${at}: ${p} has no view ${q.get('view')}`);
        if (q.get('story') && !(m && (m.stories || []).some(s => s.id === q.get('story')))) bad.push(`${at}: ${p} has no story ${q.get('story')}`);
        continue;
      }
      if (path.startsWith('/')) { bad.push(`${at}: a site path outside the examples (base /umlimator/ is not added to raw HTML)`); continue; }
      // a docs page, relative to this one (the redirect's ../examples.html is docs/examples.md on the site)
      const to = new URL(path, new URL(page === 'examples/index.html' ? 'docs/examples/' : dir, root)), file = new URL(to.pathname.replace(/\.html$/, '.md'), root);
      if (!/\.(md|html)$/.test(to.pathname) || !existsSync(file)) { bad.push(`${at}: no docs page ${file.pathname}`); continue; }
      if (hash && !page.endsWith('.html')) {
        const t = readFileSync(file, 'utf8');
        if (!new RegExp(`(?: id="${hash}"| \\{#${hash}\\}$)`, 'm').test(t)) bad.push(`${at}: no #${hash} on it`);
      }
    }
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

// the models that left the gallery on 19 Nov 2026 (the maintainer's decision) were deleted in step 4 of the one-model
// plan; the gallery, the docs and the README link none of them, nor the old test model, which left examples/ for
// tests/fixtures/ (20 Nov 2026)
test('the models that left the gallery are linked from nowhere in the gallery, the docs or the README', () => {
  assert.deepEqual([...RETIRED], []);
  const GONE = [...RETIRED, 'assistant', 'bookshop', 'clinic', 'ebike-atlas', 'states', 'weather'];
  for (const n of GONE.filter(n => !RETIRED.includes(n))) assert.ok(!existsSync(new URL(`examples/${n}.json`, root)), `examples/${n}.json is deleted`);
  const walk = dir => readdirSync(new URL(dir, root)).flatMap(f => { const p = `${dir}${f}`;
    if (f === 'node_modules' || f === 'dist' || f === 'cache') return [];
    return statSync(new URL(p, root)).isDirectory() ? walk(`${p}/`) : /\.(md|html|mts|js|mjs)$/.test(f) ? [p] : []; });
  // the site's pages: docs/ but the notes it leaves out (diagrams/, editing.md and module-api.md, the design record)
  const site = walk('docs/').filter(p => !/^docs\/(diagrams\/|editing\.md|module-api\.md)/.test(p));
  const pages = ['README.md', 'examples/index.html', ...site];
  const gone = new RegExp(`(?:^|[/"'(])(?:${GONE.join('|')})\\.(?:json|html|pdf|dsl)\\b|stills/(?:${GONE.join('|')})/|tools/(?:atlas|ebike)-links\\.json|traces/(?:ride-end|match)\\.json`);
  const bad = [];
  for (const p of pages) {
    const s = read(p);
    // link targets: markdown (](...)), HTML (href, src, fetch), the docs' map blocks (src: ...) and the docs nav (link: '...')
    for (const [, t] of [...s.matchAll(/\]\(([^)\s]+)\)|(?:href|src)=["']([^"']+)["']|fetch\(['"]([^'"]+)['"]|link: ['"]([^'"]+)['"]|^src: (\S+)/gm)].map(m => [m[0], m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]]))
      if (gone.test(t)) bad.push(`${p}: ${t}`);
  }
  assert.deepEqual(bad, []);
  // and no word of them on the gallery or the site's pages: the atlases, the bike share, the weather stations, the helpdesk
  // \s+ between words, so a phrase a docs page wraps across two lines is caught (audit 48)
  const words = /e-bike\s+atlas|bike[-\s]share|weather\s+station|helpdesk|clinic\s+booking|Bookshop,\s+an\s+example|bookshop-an-example|\bride-end\b|Trip\s+service|ebike-atlas\.test/i;
  assert.deepEqual(pages.filter(p => words.test(read(p))), []);
  assert.doesNotMatch(html, /(?<![\w-])(?:bike-share|states\.json)/);
});

// moved from tests/atlas.test.mjs when step 4 of the one-model plan deleted it: the examples' README links every example
// model, its tables are tables, and the gallery's and the model guide's claims about the examples hold
test('the examples\' README links every example model, and the gallery and the model guide say only what the examples draw', () => {
  const dir = new URL('examples/', root), readme = read('examples/README.md');
  const names = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => f.slice(0, -5));
  assert.deepEqual(names.filter(n => !readme.includes(`(${n}.json)`)), []);
  // a table's rows run on: a row after a blank line starts a table, so a delimiter row follows it (audit 3)
  assert.doesNotMatch(readme, /\n\n\|[^\n]*\n(?!\|[-| :]+\n)/);
  assert.doesNotMatch(html, /production's deployment, the components/);
  // the state machine's card claims only the pseudostates order-states.json draws (audit 12)
  const kinds = new Set(json('examples/order-states.json').nodes.filter(n => n.type === 'uml.Pseudostate').map(n => n.props.kind));
  assert.doesNotMatch(html, /every pseudostate/); assert.ok(!kinds.has('junction') && !kinds.has('deepHistory') && kinds.has('shallowHistory'), [...kinds].join());
  // the model guide's milestone 4a table (the README's until the manual moved to docs/guide/) names each type, kind and
  // diagram its four examples use (audit 13)
  const ex = n => json(`examples/${n}.json`);
  const guide = read('docs/guide/model.md'), m4a = guide.slice(guide.indexOf('The mindmap and the three cloud'), guide.indexOf('A BPMN diagram'));
  for (const n of ['bookshop-opening-plan', 'bookshop-gcp', 'bookshop-azure', 'bookshop-aws']) {
    const m = ex(n), said = [...m.nodes, ...m.edges].flatMap(x => [x.type, x.props && (x.props.groupType ?? x.props.zoneType)]).filter(Boolean).map(t => '`' + t + '`');
    assert.ok(m4a.includes(n + '.json'), n);
    for (const t of new Set([...said, ...m.views.map(v => `"${v.diagram}"`)])) assert.ok(m4a.includes(t), `${n}: ${t}`);
  }
});

// audit 51: eleven feature rows linked examples/variants/*.json after #542 deleted the folder, and 'Not shown' named chips,
// planned cards and nodeOverrides, which examples/types/map.json and the Bookshop Atlas set: every relative link of the
// README opens a file, and each `key` or `key: value` 'Not shown' names is set by no example model
test('the examples\' README links only files that exist, and \'Not shown\' names nothing an example model sets', () => {
  const readme = read('examples/README.md');
  const links = [...readme.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1].split('#')[0]).filter(l => l && !/^[a-z]+:/i.test(l));
  assert.ok(links.length > 20, links.length);
  assert.deepEqual(links.filter(l => !existsSync(new URL(l, new URL('examples/', root)))), []);
  const notShown = readme.split('\n').find(l => l.startsWith('Not shown')); assert.ok(notShown);
  const models = [...readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.json')).map(f => `examples/${f}`),
    ...readdirSync(new URL('examples/types/', root)).filter(f => f.endsWith('.json')).map(f => `examples/types/${f}`)];
  const sets = (m, key, value) => { let hit = false; JSON.parse(read(m), (k, v) => { if (k === key && (value === undefined || JSON.stringify(v) === value)) hit = true; return v; }); return hit; };
  const said = [...notShown.matchAll(/`(\w+)(?:: ([^`]+))?`/g)].map(([, k, v]) => [k, v]).filter(([k]) => k !== 'nodes' && k !== 'lanes');
  assert.ok(said.length > 8, said.length);
  assert.deepEqual(said.flatMap(([k, v]) => models.filter(m => sets(m, k, v)).map(m => `${k}${v ? ': ' + v : ''} in ${m}`)), []);
});

// audit 51: docs/types.md said a type's "All examples" opens one page holding every example and variant of the type, a
// card for each on its overview, the gallery before 20 Nov; the page tools/gallery.mjs writes is one live example, its
// checklist and its alternatives, with no cards
test('docs/types.md describes a type\'s page as tools/gallery.mjs writes it: one live example, its checklist and alternatives', () => {
  const intro = read('docs/types.md').split('\n## ')[0].replace(/\s+/g, ' ');
  assert.doesNotMatch(intro, /variant|a card for each|every example/);
  assert.match(intro, /"All examples" opens its page in the \[examples\]\(\.\/examples\.md#diagrams\): one example, live, that shows everything the type draws, with a checklist of what to find in it and the settings that need a view of their own/);
  for (const t of typePages) {
    const page = written[`docs/gallery/${t}.md`]; assert.ok(page, t);
    assert.equal((page.match(/<iframe /g) || []).length, 1, t); assert.match(page, /## What it shows \{#shows\}/, t);
    assert.doesNotMatch(page, /class="(?:ex-card|card)"/, t);
  }
});
