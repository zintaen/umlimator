// The pages of the documentation site written by tools/gallery.mjs, and its one sidebar (the maintainer's decision, 20 Nov
// 2026: one connected Docs): docs/types/index.md, Diagrams, one card for every diagram type (tools/types.json's families'
// 28; the map is no type: its showcase is the Bookshop atlas's overview), each opening the type's page,
// docs/types/<type>.md, which holds all the site says of the type: its rendered page (examples/types/<type>.html,
// tools/types.mjs; tests/types.test.mjs checks those) in a frame, opened on its main view, what the diagram shows and its
// alternatives (one comprehensive example per type), how to write it (tools/types.md's section) and what is drawn and
// left out (its conformance note, docs/diagrams/conformance/<type>.md); docs/atlas/, tools/gallery.json's atlases, whole
// businesses each one model of many types; docs/.vitepress/sidebar.json, the sidebar. Every link, picture and frame on
// them names a file the site serves, as the site job builds it (.github/workflows/check.yml), a docs page or a file of the
// repository. The models the gallery does not show (tools/gallery.json's retired list, empty since the test models moved
// to tests/fixtures/) are linked from nowhere in the docs or the README, and nor are the models that left the gallery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { files, inventory, types, groupOf, atlases, writing, EX, DIRS, NOTES } from '../tools/gallery.mjs';
import { families } from '../tools/types.mjs';

const root = new URL('../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8'), json = p => JSON.parse(read(p));
const written = files();
const html = written['docs/types/index.md'], atlasIndex = written['docs/atlas/index.md'];
const RETIRED = json('tools/gallery.json').retired.files;
// the example models: a dotfile is another test's temporary file (examples/.umlimator-atlas.<hash>.icons), not an example
const examples = readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => f.slice(0, -5)).filter(n => !RETIRED.includes(n)).sort();
const typePages = readdirSync(new URL('examples/types/', root)).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => f.slice(0, -5)).sort();
// a part of a page by its heading's id ("## UML structure {#uml-structure}"), to the next heading of its level
const section = (page, id) => {
  const m = new RegExp(`^(#+) [^\\n]* \\{#${id}\\}$`, 'm').exec(page); assert.ok(m, `a section ${id}`);
  const next = new RegExp(`^#{1,${m[1].length}} `, 'm').exec(page.slice(m.index + m[0].length));
  return page.slice(m.index, next ? m.index + m[0].length + next.index : page.length);
};
// an attribute's values in the tags of a piece of a page (not in text such as <code>&lt;umlimator-map src="..."&gt;</code>);
// a bound one (:src="'...'") by its string
const attrs = (s, name) => [...s.matchAll(/<[a-z][^<>]*>/g)].flatMap(t => [...t[0].matchAll(new RegExp(` :?${name}="([^"]*)"`, 'g'))]).map(m => m[1].replace(/^'(.*)'$/, '$1').replace(/&amp;/g, '&'));

test('the committed Diagrams and atlas pages and the sidebar are what tools/gallery.mjs writes, and nothing else is in their folders', () => {
  for (const [p, s] of Object.entries(written)) assert.equal(read(p), s, `${p} is stale: run node tools/gallery.mjs and commit it`);
  for (const d of DIRS) {
    const pages = readdirSync(new URL(d, root)).map(f => `${d}${f}`).sort();
    assert.deepEqual(pages, Object.keys(written).filter(p => p.startsWith(d)).sort(), `${d} holds only the pages the tool writes`);
  }
  assert.equal(Object.keys(written).filter(p => p.startsWith('docs/types/')).length, 28 + 1, 'the 28 types and their index: the map has no page of its own');
  assert.equal(Object.keys(written).filter(p => p.startsWith('docs/atlas/')).length, atlases().length + 1, 'each atlas and their index');
  // the old split pages are gone: no gallery, no conformance pages, no examples index, no redirect
  for (const old of ['docs/gallery', 'docs/conformance', 'docs/examples.md', 'docs/types.md', 'docs/guide', 'docs/.vitepress/gallery.json', 'examples/index.html'])
    assert.ok(!existsSync(new URL(old, root)), `${old} is gone`);
});

test('the sidebar is one, in reading order: Start, Diagrams (the 28 by family), Maps and atlases (the atlases last), Use it, Reference', () => {
  const config = read('docs/.vitepress/config.mts'), bar = json('docs/.vitepress/sidebar.json');
  assert.match(config, /export const sidebar = JSON\.parse\(readFileSync\(new URL\('\.\/sidebar\.json', import\.meta\.url\)/);
  assert.match(config, /^\s*sidebar,$/m, 'one sidebar for every page');
  assert.deepEqual(bar.map(g => g.text), ['Start', 'Diagrams', 'Maps and atlases', 'Use it', 'Reference']);
  const flat = items => items.flatMap(i => i.items ? flat(i.items) : [i.link]);
  const D = bar[1].items, inv = inventory();
  assert.deepEqual(flat(D), ['/types/', ...families().flatMap(f => f.types).map(id => `/types/${id}`)]);
  assert.deepEqual(D.slice(1).map(i => i.text), families().map(f => f.types.length === 1 ? inv.find(t => t.id === f.types[0]).name : f.name));
  assert.deepEqual(flat(bar[2].items).slice(-1 - atlases().length), ['/atlas/', ...atlases().map(A => `/atlas/${A.page}`)]);
});

test('the Diagrams page has a card for each of the 28 types, by family in order, each opening the type\'s page, and none for the map', () => {
  const T = types();
  assert.equal(T.length, 28);
  const want = T.map(t => t.id), got = [...html.matchAll(/<article class="ex-card" id="type-([\w-]+)"/g)].map(m => m[1]);
  assert.deepEqual(got, want);
  assert.deepEqual(typePages, [...want].sort(), 'examples/types/ holds a model for each type, and no other');
  for (const f of families()) assert.deepEqual([...section(html, f.id).matchAll(/id="type-([\w-]+)"/g)].map(m => m[1]), f.types, f.id);
  // the map is no type: no card, no page; its showcase is an atlas's first layer, and that atlas's page lists what it draws
  assert.doesNotMatch(html, /id="type-map"|types\/map\./);
  const M = json('tools/gallery.json').map, at = json(`examples/${M.atlas}.json`), page = written[`docs/atlas/${atlases().find(x => x.file === M.atlas).page}.md`];
  assert.equal(at.root, M.main); assert.equal(groupOf(at.views[0]), 'map'); assert.equal(at.views[0].id, M.main);
  const art = page.slice(page.indexOf(`id="view-${M.main}"`), page.indexOf('</article>', page.indexOf(`id="view-${M.main}"`)));
  assert.equal(art.split('<li>').length - 1, M.shows.length, 'the atlas page lists every item of what the map draws');
  for (const x of atlases()) assert.equal(groupOf(json(`examples/${x.file}.json`).views[0]), 'map', `${x.file} opens on a map`);
  // the type list at the top goes to each type's page
  const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
  assert.deepEqual(attrs(nav, 'href'), want.map(id => `./${id}.html`));
  const W = writing();
  for (const t of inventory()) {
    const c = html.slice(html.indexOf(`id="type-${t.id}"`), html.indexOf('</article>', html.indexOf(`id="type-${t.id}"`)));
    assert.ok(attrs(c, 'href').includes(`./${t.id}.html`), `${t.id}: opens its page`);
    // the card's picture is the main view's still, and it links the main view and the alternatives
    const views = [t.main, ...t.alternatives.map(a => a.view)];
    assert.ok(attrs(c, 'src').includes(`${EX}types/stills/${t.id}/${t.main}.png`), `${t.id}: its card shows the main view`);
    assert.deepEqual(attrs(c, 'href').filter(h => h.startsWith(`${EX}types/${t.id}.html#view=`)).map(h => h.split('=')[1]), views, t.id);
    assert.ok(t.shows.length > 0 && c.includes('<ul class="ex-shows-short"><li>'), `${t.id}: its card lists what it shows first`);
    const p = written[`docs/types/${t.id}.md`];
    assert.deepEqual(attrs(p, 'src').filter(s => s.startsWith(EX)), [`${EX}types/${t.id}.html`], `${t.id}: its page frames its type page`);
    assert.equal((p.match(/<iframe /g) || []).length, 1, t.id);
    assert.equal(json(`examples/types/${t.id}.json`).root, t.main, `${t.id}: the framed page opens on the main view`);
    assert.deepEqual(attrs(p, 'href').filter(h => h.startsWith(`${EX}types/${t.id}.html#view=`)).map(h => h.split('=')[1]), views, `${t.id}'s page`);
    assert.match(p, new RegExp(`<a href="${EX}types/${t.id}\\.html" target="_self">Open full screen`));
    // its checklist: each "shows" item, in order
    const list = p.slice(p.indexOf('<ol class="ex-shows">'), p.indexOf('</ol>'));
    assert.equal(list.split('<li>').length - 1, t.shows.length, `${t.id}: its page lists every "shows" item`);
    assert.equal(p.includes('{#alternatives}'), t.alternatives.length > 0, `${t.id}: its alternatives, when it has any`);
    assert.doesNotMatch(p, /class="(?:ex-card|card)"/, t.id);
    // then how to write it, then its conformance note, in that order and last
    const heads = [...p.matchAll(/^## .* \{#([\w-]+)\}$/gm)].map(m => m[1]);
    assert.deepEqual(heads, ['shows', ...(t.alternatives.length ? ['alternatives'] : []), 'model', 'conformance'], t.id);
    assert.ok(section(p, 'model').includes(W[t.id]), `${t.id}: its "How to write it" is tools/types.md's section`);
    const note = read(`${NOTES}${t.id}.md`), first = note.split('\n').slice(1).find(l => l.trim() && !l.startsWith('#'));
    assert.match(note, /^# /, `${t.id}: its note starts with its title`);
    assert.ok(section(p, 'conformance').includes(first.slice(0, 40)), `${t.id}: "What is drawn and left out" is its conformance note`);
    assert.doesNotMatch(section(p, 'conformance').split('\n').slice(1).join('\n'), /^## /m, `${t.id}: the note's headings are under its section`);
  }
});

test('the atlases page lists tools/gallery.json\'s atlases in order, each framed on its page; the Umlimator atlas\'s state machines are views of it', () => {
  const list = atlases();
  assert.deepEqual([...atlasIndex.matchAll(/<article class="ex-card ex-wide" id="atlas-([\w-]+)"/g)].map(m => m[1]), list.map(x => x.file));
  assert.deepEqual(list.map(x => x.name).sort(), ['Bookshop', 'Umlimator']);
  for (const x of list) {
    assert.match(atlasIndex, new RegExp(`<h2><a href="\\./${x.page}\\.html">${x.name}</a></h2>`));
    assert.ok(attrs(atlasIndex, 'href').includes(`${EX}${x.file}.json`), x.file);
    assert.deepEqual(attrs(read(`docs/atlas/${x.page}.md`), 'src'), [`${EX}${x.file}.html`], `${x.page}: the atlas page frames the atlas`);
    // a whole business: one model, many types
    assert.ok(new Set(json(`examples/${x.file}.json`).views.map(groupOf)).size >= 3, `${x.file} uses many diagram types`);
  }
  const m = json('examples/umlimator-atlas.json'), ids = new Set(m.views.map(v => v.id));
  assert.equal(m.title, 'Umlimator');
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

test('every link, picture and frame on the written pages names a docs page, a file of the repository or a file the site serves, and a view or story its model has', () => {
  const { files, views } = served(), bad = [];
  for (const page of Object.keys(written).filter(p => p.endsWith('.md'))) {
    const s = read(page), dir = page.slice(0, page.lastIndexOf('/') + 1);
    const ids = new Set([...attrs(s, 'id'), ...[...s.matchAll(/ \{#([\w-]+)\}$/gm)].map(m => m[1])]);
    // the pages' own HTML, then the Markdown links (the intro, how to write it and the conformance note: written for
    // GitHub, so an address outside the repository and a heading's GitHub id are theirs to give; the built site's test
    // checks those anchors, tests/site.test.mjs)
    const md = [...s.matchAll(/\]\(([^)\s]+)\)/g)].map(m => [m[1], true]);
    for (const [ref, isMd] of [...attrs(s, 'href'), ...attrs(s, 'src')].map(r => [r, false]).concat(md)) {
      const [path, hash = ''] = ref.split('#'), at = `${page}: ${ref}`;
      if (/^https:\/\/github\.com\/zintaen\/umlimator(\/blob\/main\/(.+))?$/.test(path)) {
        const file = path.match(/\/blob\/main\/(.+)$/)?.[1];
        if (file && !existsSync(new URL(file, root))) bad.push(`${at}: no ${file} in the repository`);
        continue;
      }
      if (/^(https?|mailto):/.test(path)) { if (!isMd) bad.push(`${at}: an address outside the repository`); continue; }
      if (!path) { if (!isMd && !ids.has(hash)) bad.push(`${at}: no such id on the page`); continue; }
      if (path.startsWith(EX)) {
        const p = path.slice(EX.length);
        if (!files.has(p)) { bad.push(`${at}: the site does not serve examples/${p}`); continue; }
        const m = views[p], q = new URLSearchParams(hash);
        if (q.get('view') && !(m && m.views.some(v => v.id === q.get('view')))) bad.push(`${at}: ${p} has no view ${q.get('view')}`);
        if (q.get('story') && !(m && (m.stories || []).some(s => s.id === q.get('story')))) bad.push(`${at}: ${p} has no story ${q.get('story')}`);
        continue;
      }
      if (path.startsWith('/')) { bad.push(`${at}: a site path outside the examples (base /umlimator/ is not added to raw HTML)`); continue; }
      // a docs page or a file of the repository, relative to this page (the site sends a file outside its pages to GitHub)
      const to = new URL(path, new URL(dir, root)), rel = to.pathname.slice(root.pathname.length);
      const page_ = /^docs\//.test(rel) && !/^docs\/(diagrams\/|editing\.md|module-api\.md)/.test(rel);
      const file = new URL(page_ ? rel.replace(/\.html$/, '.md').replace(/\/$/, '/index.md') : rel, root);
      if (!existsSync(file)) { bad.push(`${at}: no ${page_ ? 'docs page' : 'file'} ${rel}`); continue; }
      if (hash && page_ && !isMd) {
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
  const pages = ['README.md', ...site];
  const gone = new RegExp(`(?:^|[/"'(])(?:${GONE.join('|')})\\.(?:json|html|pdf|dsl)\\b|stills/(?:${GONE.join('|')})/|tools/(?:atlas|ebike)-links\\.json|traces/(?:ride-end|match)\\.json`);
  const bad = [];
  // a link to a docs page of that name (the Bookshop atlas's page, docs/atlas/bookshop.md), from a docs page or by the
  // site's address, is no model
  const SITE = 'https://zintaen.github.io/umlimator/';
  const docsPage = (p, t) => { const path = t.split('#')[0].replace(/\.html$/, '.md');
    if (path.startsWith(SITE) && !path.startsWith(`${SITE}examples/`)) return existsSync(new URL(`docs/${path.slice(SITE.length)}`, root));
    return p.startsWith('docs/') && !/^[a-z]+:|^\//.test(t) && existsSync(new URL(path, new URL(p, root))); };
  for (const p of pages) {
    const s = read(p);
    // link targets: markdown (](...)), HTML (href, src, fetch), the docs' map blocks (src: ...) and the docs nav (link: '...')
    for (const [, t] of [...s.matchAll(/\]\(([^)\s]+)\)|(?:href|src)=["']([^"']+)["']|fetch\(['"]([^'"]+)['"]|link: ['"]([^'"]+)['"]|^src: (\S+)/gm)].map(m => [m[0], m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]]))
      if (gone.test(t) && !docsPage(p, t)) bad.push(`${p}: ${t}`);
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
  const guide = read('docs/maps/model.md'), m4a = guide.slice(guide.indexOf('The mindmap and the three cloud'), guide.indexOf('A BPMN diagram'));
  for (const n of ['bookshop-opening-plan', 'bookshop-gcp', 'bookshop-azure', 'bookshop-aws']) {
    const m = ex(n), said = [...m.nodes, ...m.edges].flatMap(x => [x.type, x.props && (x.props.groupType ?? x.props.zoneType)]).filter(Boolean).map(t => '`' + t + '`');
    assert.ok(m4a.includes(n + '.json'), n);
    for (const t of new Set([...said, ...m.views.map(v => `"${v.diagram}"`)])) assert.ok(m4a.includes(t), `${n}: ${t}`);
  }
});

// audit 51: eleven feature rows linked examples/variants/*.json after #542 deleted the folder, and 'Not shown' named chips,
// planned cards and nodeOverrides, which the Bookshop atlas sets: every relative link of the
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

// audit 54: the nodeOverrides row said the Bookshop atlas's Shop API opens domain in components after audit 52 moved that
// opener to the shop-api image: each view the row names sets nodeOverrides, and each "(card opens `view`)" it says is the
// opensView of the card of that label in that view's nodeOverrides
test('the examples\' README nodeOverrides row names the cards that carry an override in each view it names', () => {
  const row = read('examples/README.md').split('\n').find(l => l.includes('(`nodeOverrides`)')); assert.ok(row);
  const atlas = json('examples/bookshop-atlas.json'), byId = new Map(atlas.nodes.map(n => [n.id, n]));
  const named = [...row.split('|')[2].matchAll(/`([\w-]+)`(?: \((?:the )?(.+?) opens `([\w-]+)`\))?/g)].filter(m => atlas.views.some(v => v.id === m[1]));
  assert.ok(named.length >= 2, row);
  for (const [, view, card, opens] of named) {
    const over = atlas.views.find(v => v.id === view).nodeOverrides || {};
    assert.ok(Object.keys(over).length, `${view} sets no nodeOverrides`);
    if (!card) continue;
    const hit = Object.entries(over).filter(([id]) => (byId.get(id)?.label ?? '').toLowerCase() === card.toLowerCase());
    assert.equal(hit.length, 1, `${view}: no card "${card}" in its nodeOverrides (${Object.keys(over).join(', ')})`);
    assert.equal(hit[0][1].opensView, opens, `${view}: ${card}`);
  }
});

// audit 51: the types page said a type's "All examples" opens one page holding every example and variant of the type, a
// card for each on its overview, the gallery before 20 Nov; a type's page is one live example, its checklist and its
// alternatives, with no cards, then how to write it and what is drawn and left out (one page per type since 20 Nov)
test('the Diagrams page describes a type\'s page as tools/gallery.mjs writes it: one live example, its checklist and alternatives, how to write it, what is drawn and left out', () => {
  const intro = html.slice(html.indexOf('# Diagram types'), html.indexOf('<nav')).replace(/\s+/g, ' ');
  assert.doesNotMatch(intro, /variant|a card for each|every example/);
  assert.match(intro, /Each type has a page: one example, live, made up for an online bookshop and its delivery cargo e-bike, that shows everything the type draws, with a checklist of what to find in it and the settings that need a view of their own \(a layout direction, a notation\); then how to write the type in the model, and what of its notation is drawn and left out, and why/);
  for (const t of typePages) {
    const page = written[`docs/types/${t}.md`]; assert.ok(page, t);
    for (const h of ['## What it shows {#shows}', '## How to write it {#model}', '## What is drawn and left out {#conformance}']) assert.ok(page.includes(h), `${t}: ${h}`);
  }
});

// audit 51: the Umlimator atlas's C4 context view hung under the overview with no card opening it, so the C4 views of
// "views that open into each other" were reached from the views list only: in each atlas, every view is reached from the
// root by opening cards, as the page's mapContext reads a card (opensView, view, its id, a view's node, nodeOverrides).
// Audit 52: only a card the view draws as one opens, so a node the view lays out as a box (the Bookshop's Shop API holding
// Checkout, its Docker host holding the API's instance) opens nothing: the cards are the view's layout, as the page's
test('in each atlas every view is reached from the root by opening cards', async () => {
  await import('../src/map/typed.js');
  const { mapContext } = await import('../src/map/context.js');
  const { layout } = await import('../lib/umlimator-all.js');
  const bad = [];
  for (const f of ['umlimator-atlas', 'bookshop-atlas']) {
    const model = json(`examples/${f}.json`), ctx = mapContext(model), seen = new Set([ctx.rootId]), todo = [ctx.rootId];
    while (todo.length) { const vid = todo.pop(), drawn = layout(model, vid).byId;
      for (const id of (ctx.V[vid].nodeIds || []).filter(id => drawn[id])) { const o = ctx.opensOf(id, vid); if (o && ctx.V[o] && !seen.has(o)) { seen.add(o); todo.push(o); } } }
    bad.push(...ctx.views.filter(v => !seen.has(v.id)).map(v => `${f}: ${v.id} under ${v.parent}`));
  }
  assert.deepEqual(bad, []);
});

// audit 53: the Atlas's Readers card and its line said `umlimator.py import` runs every importer in Node; Structurizr DSL,
// C4-PlantUML, Compose and Kubernetes it reads in Python (umlimator_import.FORMATS), only NODE_FORMATS go to the module's readers
test('the Umlimator atlas says which formats umlimator.py import reads in Node, as umlimator_import.py splits them', async () => {
  const { execFileSync } = await import('node:child_process');
  const { FORMATS, NODE_FORMATS } = JSON.parse(execFileSync('python3', ['-c', 'import json, umlimator_import as i; print(json.dumps({"FORMATS": i.FORMATS, "NODE_FORMATS": i.NODE_FORMATS}))'], { cwd: root, encoding: 'utf8' }));
  const name = { structurizr: 'Structurizr DSL', plantuml: 'PlantUML', compose: 'Compose', kubernetes: 'Kubernetes', 'structurizr-json': 'Structurizr JSON', dbml: 'DBML' };
  const m = json('examples/umlimator-atlas.json'), how = m.nodes.find(n => n.id === 'readers').how;
  const node = how.split(/(?<=\.) /).find(s => /\bin Node\b/.test(s)) || '', python = how.split(/(?<=\.) /).find(s => /\bin Python\b/.test(s)) || '';
  for (const f of NODE_FORMATS) assert.ok(node.includes(name[f]) && !python.includes(name[f]), `${f}: read in Node (${how})`);
  for (const f of FORMATS.filter(f => name[f])) assert.ok(python.includes(name[f]) && !node.includes(name[f]), `${f}: read in Python (${how})`);
  const line = m.edges.find(e => e.from === 'cli' && e.to === 'readers');
  assert.notEqual(line.sublabel, 'in Node', 'the import line: not every format is read in Node');
});
