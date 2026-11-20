// The documentation site (docs/, VitePress): one connected Docs with one sidebar (the maintainer's decision, 20 Nov 2026).
// Each of the 28 types has one page, its conformance note its last part, and every page the sidebar names is there, every
// site page is in the sidebar, and the top nav is Docs, Atlas and the version menu. On the built site every link, frame and
// anchor resolves. The build itself, with its dead-link check, is CI's docs job (npm --prefix docs run build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { posix } from 'node:path';
import { MOVED } from '../docs/diagrams/examples/check.mjs';
import { typeIds } from '../tools/types.mjs';

const root = new URL('../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8');
const notes = readdirSync(new URL('docs/diagrams/conformance/', root)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();

test('each of the 28 types has one page holding its conformance note, and each note is a type\'s, with its example (MOVED)', () => {
  assert.equal(notes.length, 28);
  assert.deepEqual([...typeIds()].sort(), notes, 'a note for each type');
  const want = {}; // conformance slug -> its example
  for (const to of Object.values(MOVED)) {
    const n = to.match(/examples\/([\w-]+)\.json$/)[1], m = JSON.parse(read(`examples/${n}.json`));
    const d = m.views.find(v => v.id === m.root).diagram;
    want[d.startsWith('c4.') ? 'c4' : d.replace('.', '-')] = n;
  }
  assert.deepEqual(Object.keys(want).sort(), notes, 'MOVED holds one example per conformance note');
  for (const t of notes) {
    const page = read(`docs/types/${t}.md`);
    assert.match(page, new RegExp(`<!-- the conformance note, as written: docs/diagrams/conformance/${t}\\.md -->`), t);
    assert.ok(page.includes(`examples/${want[t]}.json`), `${t}: its page names its example, ${want[t]}.json`);
  }
});

const SITE = p => p.endsWith('.md') && !/^(diagrams\/|editing\.md$|module-api\.md$|node_modules\/|\.vitepress\/)/.test(p);
const walk = (dir = '') => readdirSync(new URL(`docs/${dir}`, root), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(`${dir}${e.name}/`)) : [`${dir}${e.name}`]);

test('the top nav is Docs, Atlas and the version menu; the one sidebar names every site page once, and each exists', () => {
  const config = read('docs/.vitepress/config.mts'), nav = config.slice(config.indexOf('nav: ['), config.indexOf('\n    sidebar,'));
  assert.deepEqual([...nav.matchAll(/^      \{ text: ([^,]+),/gm)].map(m => m[1]), [`'Docs'`, `'Atlas'`, '`v${version}`']);
  assert.match(nav, /\{ text: 'Docs', link: '\/', activeMatch: '\^\/\(\?!atlas\/\)' \}/);
  assert.match(nav, /\{ text: 'Atlas', link: '\/atlas\/', activeMatch: '\^\/atlas\/' \}/);
  for (const t of ['Changelog', 'npm', 'Releases']) assert.match(nav, new RegExp(`text: '${t}'`));
  const flat = items => items.flatMap(i => i.items ? flat(i.items) : [i.link]);
  const links = flat(JSON.parse(read('docs/.vitepress/sidebar.json')));
  const file = l => l.endsWith('/') ? `${l.slice(1)}index.md` : `${l.slice(1)}.md`;
  assert.equal(new Set(links).size, links.length, 'each page once');
  for (const l of links) assert.ok(existsSync(new URL(`docs/${file(l)}`, root)), `docs/${file(l)}`);
  assert.deepEqual(walk().filter(SITE).sort(), links.map(file).sort(), 'the sidebar lists every page of the site');
  assert.ok(links.includes('/changelog') && existsSync(new URL('docs/module-api.md', root)));
});

test('the built changelog starts at the first release and names no host application', { skip: !existsSync(new URL('docs/.vitepress/dist/changelog.html', root)) && 'the site is not built (npm --prefix docs run build)' }, () => {
  const page = read('docs/.vitepress/dist/changelog.html');
  assert.doesNotMatch(page, /(?<!SQL)Alchemy/);
  assert.doesNotMatch(page, /step 3 design note/);
  assert.match(page, /0\.5\.0: fixes from the first embedding/);
  // module-api.md's links to its own headings are GitHub's ids: each goes to a heading here (audit 15)
  const ids = new Set([...page.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
  const dead = [...page.matchAll(/ href="#([^"]+)"/g)].map(m => m[1]).filter(h => !ids.has(decodeURIComponent(h)));
  assert.deepEqual(dead, []);
});

// WCAG's contrast ratio between two #rrggbb colours
const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// VitePress's colours (vitepress/dist/client/theme-default/styles/vars.css, 1.6.4): a code block's background
// (--vp-code-block-bg, bg-alt) and --vp-c-text-2
const BLOCK = { ':root': '#f6f6f7', '.dark': '#161618' }, TEXT2 = { ':root': '#67676c', '.dark': '#98989f' };

test('inline code on the site reads at WCAG AA (4.5:1) on a table row\'s tint, linked or not, in both themes (audit 16, audit 17)', () => {
  const css = read('docs/.vitepress/theme/custom.css');
  // VitePress colours inline code with --vp-code-color, and code in a link with --vp-code-link-color (else both are the
  // brand accent, under 4.5:1); the even table rows under it are these (bg-soft plus the code tint)
  for (const [scope, row] of [[':root', '#e7e9ec'], ['.dark', '#2b2e36']]) {
    const block = css.match(new RegExp(`^${scope.replace('.', '\\.')} \\{([^}]*)\\}`, 'm'))[1];
    for (const v of ['--vp-code-color', '--vp-code-link-color', '--vp-code-link-hover-color']) {
      const c = block.match(new RegExp(`${v}:\\s*(#[0-9a-f]{6})`, 'i'));
      assert.ok(c, `${scope} sets ${v}`);
      assert.ok(ratio(c[1], row) >= 4.5, `${scope} ${v}: ${c[1]} on ${row} is ${ratio(c[1], row).toFixed(2)}:1`);
    }
    // a code block's language label: VitePress's text-3 is under 4.5:1 on the block
    assert.match(block, /--vp-code-lang-color:\s*var\(--vp-c-text-2\)/, `${scope} sets the code block's label to text-2`);
    assert.ok(ratio(TEXT2[scope], BLOCK[scope]) >= 4.5);
  }
});

test('each "28 diagram types" list names all 28: UML\'s 14 and its information flow diagram among them (audit 17)', () => {
  for (const p of ['README.md', 'docs/index.md', 'examples/README.md'])
    assert.match(read(p).replace(/\s+/g, ' '), /28 diagram types\W[^.]*information flow/, p);
});

test('the API docs send the field list to a page that exists, not the README\'s gone Model section (audit 17)', () => {
  const api = read('docs/api/model-and-schema.md');
  assert.doesNotMatch(api, /README's Model section/); // the README has no Model section since the guide split
  assert.match(api, /\]\(\.\.\/maps\/model\.md\)/);
});

test('the guide says timelapse keeps the latest 30 versions, and names --limit (audit 17)', () => {
  const action = read('docs/use/github-action.md').replace(/\s+/g, ' ');
  assert.doesNotMatch(action, /every version of the model/);
  assert.match(action, /latest 30 versions[^.]*--limit N/);
  assert.match(read('docs/use/cli.md'), /timelapse model\.json[^\n]*latest 30[^\n]*--limit N/);
});

test('umlimator.py\'s usage names the timelapse --limit default the option has (audit 21)', async () => {
  const run = (...a) => promisify(execFile)('python3', [new URL('umlimator.py', root).pathname, ...a]).then(r => r.stdout);
  const usage = /timelapse MODEL\.json --out PAGE\.html \[--limit (\d+)\]/.exec(await run('-h')), own = /\(default (\d+)\)/.exec((await run('timelapse', '-h')).replace(/\s+/g, ' '));
  assert.ok(usage && own, 'both name a default');
  assert.equal(usage[1], own[1]);
  assert.equal(own[1], '30'); // as the CLI and Action guides say
});

test('examples/README.md sends each docs-site setup to a heading that exists, not the README\'s old Embed section (audit 21)', () => {
  const ex = read('examples/README.md'), readme = read('README.md'), slug = h => h.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-');
  for (const [, name] of ex.matchAll(/the README's (\w[\w ]*?) section/g)) assert.match(readme, new RegExp(`^## ${name}$`, 'm'), `README.md has no ${name} section`);
  const row = ex.split('\n').find(l => l.includes('`<umlimator-map>` element'));
  const [, file, anchor] = /\]\(\.\.\/(docs\/[\w/.-]+\.md)#([\w-]+)\) has each docs setup/.exec(row) ?? [];
  assert.ok(file, row);
  assert.ok(read(file).split('\n').some(l => /^#+ /.test(l) && slug(l.replace(/^#+ /, '')) === anchor), `${file} has #${anchor}`);
});

// audit 57: Install and Command line said Node 18+ for diff, drift, trace and mcp only, so a reader with Python and Chrome
// hit umlimator.py's "install Node" exit on importing a Mermaid classDiagram or on export. Each page's requirements name
// every format umlimator.py import hands to a reader in Node (its readers table, and BPMN's adapter) and export
test('Install and Command line name every command and import format that needs Node, as umlimator.py runs them (audit 57)', () => {
  const cli = read('umlimator.py'), table = cli.slice(cli.indexOf('name, fn = {"classDiagram"'), cli.indexOf('}[kind or fmt]'));
  const formats = [...table.matchAll(/"([\w-]+)": \("[\w-]+\.js"/g)].map(m => m[1]).concat('bpmn');
  assert.ok(formats.length >= 10, formats.join());
  assert.match(cli, /if fmt == "bpmn":[^\n]*\n\s+r = bpmn\(/, 'BPMN import runs the adapter in Node');
  // how the pages name each: a format added to the readers table needs a name here and on both pages
  const said = { classDiagram: 'class', sequenceDiagram: 'sequence', stateDiagram: 'state', erDiagram: 'ER', requirementDiagram: 'requirement',
    mindmap: 'mindmap', flowchart: 'a flowchart with `--typed`', 'structurizr-json': 'Structurizr JSON', dbml: 'DBML', bpmn: 'BPMN XML' };
  for (const [page, line] of [['docs/use/cli.md', /^\*\*Requirements\.\*\*.*$/m], ['docs/start/install.md', /^The CLI is `umlimator\.py`.*$/m]]) {
    const req = read(page).match(line)?.[0] ?? '', at = req.indexOf('Node 18+'), node = req.slice(at);
    assert.ok(at >= 0, `${page}'s requirements paragraph, one line, names Node 18+`);
    for (const c of ['diff', 'drift', 'trace', 'mcp', 'export', 'import']) assert.ok(node.includes(`\`${c}\``), `${page}: Node for ${c}`);
    for (const f of formats) { assert.ok(said[f], `umlimator.py reads ${f} in Node: name it here and on the pages`); assert.ok(node.includes(said[f]), `${page}: Node for ${f} (${said[f]})`); }
  }
});

test('risks.md M25 is closed: AWS accepted, the aws type and its pack row are on (audit 17)', () => {
  const m25 = read('docs/diagrams/risks.md').split('\n').find(l => l.startsWith('| M25 |'));
  assert.doesNotMatch(m25, /CLOUD_AWS = false|no pack row/);
  assert.match(m25, /conformance\/aws\.md/);
});

const built = existsSync(new URL('docs/.vitepress/dist/index.html', root));
const pages = (dir = new URL('docs/.vitepress/dist/', root)) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (e.name === 'assets' ? [] : pages(new URL(`${e.name}/`, dir))) : e.name.endsWith('.html') ? [new URL(e.name, dir)] : []);

test('the built site\'s code blocks read at WCAG AA (4.5:1) on their background, every token in both themes (audit 17)', { skip: !built && 'the site is not built (npm --prefix docs run build)' }, () => {
  const low = new Set();
  let n = 0;
  for (const p of pages()) {
    const page = readFileSync(p, 'utf8');
    for (const [, light, dark] of page.matchAll(/--shiki-light:(#[0-9a-f]{6})[0-9a-f]{0,2};--shiki-dark:(#[0-9a-f]{6})/gi)) {
      n++;
      if (ratio(light, BLOCK[':root']) < 4.5) low.add(`light ${light} ${ratio(light, BLOCK[':root']).toFixed(2)}`);
      if (ratio(dark, BLOCK['.dark']) < 4.5) low.add(`dark ${dark} ${ratio(dark, BLOCK['.dark']).toFixed(2)}`);
    }
  }
  assert.ok(n > 1000, `${n} tokens`);
  assert.deepEqual([...low], []);
});

test('the built site\'s pages each have one main landmark and one contentinfo (axe landmark-one-main, landmark-no-duplicate-contentinfo, audit 17)', { skip: !built && 'the site is not built (npm --prefix docs run build)' }, () => {
  const bad = [];
  for (const p of pages()) {
    const page = readFileSync(p, 'utf8'), name = p.pathname.split('/dist/')[1];
    if (name === '404.html') continue;   // written with an empty #app: the test below reads it drawn, in the browser
    if ((page.match(/<main[ >]/g) || []).length !== 1) bad.push(`${name}: ${(page.match(/<main[ >]/g) || []).length} main`);
    // the site footer shows unless VitePress hides it beside a sidebar (has-sidebar: display none)
    const footers = (page.match(/<footer class="VPFooter"/g) || []).length + (page.match(/<footer class="VPDocFooter"/g) || []).length;
    if (footers > 1) bad.push(`${name}: ${footers} footers`);
  }
  assert.deepEqual(bad, []);
});

test('the built site\'s table header cells each hold text (axe empty-table-header, audit 18)', { skip: !built && 'the site is not built (npm --prefix docs run build)' }, () => {
  const bad = [];
  for (const p of pages()) {
    const page = readFileSync(p, 'utf8'), name = p.pathname.split('/dist/')[1];
    for (const [, th] of page.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)) if (!th.replace(/<[^>]*>/g, '').trim()) bad.push(name);
  }
  assert.deepEqual([...new Set(bad)], []);
});

// audit 57: each collapsible family group (UML structure, UML behaviour, ...) was VitePress's role=button holding a second
// role=button caret, two Tab stops for one action, and neither said whether the group was open (axe nested-interactive,
// WCAG 4.1.2). theme/VPSidebarItem.vue makes the group's row the one button, with aria-expanded, and its caret a picture
test('the built site\'s sidebar groups are each one button saying whether it is open, none in another (axe nested-interactive, audit 57)', { skip: !built && 'the site is not built (npm --prefix docs run build)' }, () => {
  const groups = JSON.parse(read('docs/.vitepress/sidebar.json')).flatMap(g => g.items).filter(i => i.collapsed != null).map(i => i.text);
  assert.ok(groups.length >= 5, groups.join());
  const bad = [];
  for (const p of pages()) {
    const page = readFileSync(p, 'utf8'), name = p.pathname.split('/dist/')[1], at = page.indexOf('<aside class="VPSidebar');
    if (at < 0) continue;
    const side = page.slice(at, page.indexOf('</aside>', at));
    // a sidebar row is a div.item: a button row holds no other control (a link, a button, a tab stop)
    for (const [, attrs, inner] of side.matchAll(/<div class="item"([^>]*)>([\s\S]*?)<div class="items"/g)) {
      const text = inner.replace(/<[^>]+>/g, '').trim();
      if (/role="button"/.test(attrs)) {
        if (!groups.includes(text)) bad.push(`${name}: ${text} is a button but cannot collapse`);
        if (!/aria-expanded="(true|false)"/.test(attrs)) bad.push(`${name}: ${text} has no aria-expanded`);
        if (/role="button"|tabindex=|<a\b|<button\b/.test(inner)) bad.push(`${name}: ${text} holds another control`);
      } else if (groups.includes(text)) bad.push(`${name}: ${text} is no button`);
    }
    if ((side.match(/aria-expanded=/g) || []).length !== groups.length) bad.push(`${name}: ${(side.match(/aria-expanded=/g) || []).length} aria-expanded for ${groups.length} groups`);
  }
  assert.deepEqual(bad, []);
});

// audit 57: "Edit this page on GitHub" opened the pages tools/gallery.mjs writes (its next run overwrites the edit, and
// tests/gallery.test.mjs fails until then) and the changelog's one-line placeholder. A written page has no edit link,
// the changelog's opens docs/module-api.md, which holds its releases, and every other page's opens its own file
test('the built site\'s edit links open the file to edit: none on a page tools/gallery.mjs writes, docs/module-api.md for the changelog (audit 57)', { skip: !built && 'the site is not built (npm --prefix docs run build)' }, () => {
  const bad = [];
  let generated = 0;
  for (const p of pages()) {
    const name = p.pathname.split('/dist/')[1];
    if (name === '404.html') continue;
    const src = `docs/${name.replace(/\.html$/, '.md')}`, edit = [...readFileSync(p, 'utf8').matchAll(/href="([^"]*\/edit\/main\/[^"]*)"/g)].map(m => m[1]);
    if (!existsSync(new URL(src, root))) continue;
    const want = read(src).includes('<!-- Written by tools/gallery.mjs ') ? [] : [`https://github.com/zintaen/umlimator/edit/main/${name === 'changelog.html' ? 'docs/module-api.md' : src}`];
    if (!want.length) generated++;
    if (name === 'index.html') continue;   // the home page has no doc footer
    if (JSON.stringify(edit) !== JSON.stringify(want)) bad.push(`${name}: ${edit.join(' ') || 'none'}, not ${want.join(' ') || 'none'}`);
  }
  assert.ok(generated >= 30, `${generated} written pages`);
  assert.deepEqual(bad, []);
});

// VitePress writes 404.html with an empty #app: the page is drawn in the browser, so it is read in headless Chrome, as
// GitHub Pages serves it for a dead link (any path under the base)
test('the built site\'s 404 page, drawn in the browser, has one main landmark (axe landmark-one-main and region, audit 18)', { skip: !built && 'the site is not built (npm --prefix docs run build)', timeout: 120000 }, async t => {
  const py = 'import sys; sys.path.insert(0, "engine/scripts"); import visual; print(visual.find_chrome() or "")';
  const chrome = (await promisify(execFile)('python3', ['-c', py], { cwd: root })).stdout.trim();
  if (!chrome) return t.skip('no Chrome or Chromium');
  const dist = new URL('docs/.vitepress/dist/', root), types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/umlimator\//, '');
    const file = new URL(path || 'index.html', dist), ok = !path.includes('..') && existsSync(file) && !file.pathname.endsWith('/');
    res.writeHead(ok ? 200 : 404, { 'content-type': types[(ok ? file.pathname : '.html').match(/\.\w+$/)?.[0]] || 'application/octet-stream' });
    res.end(readFileSync(ok ? file : new URL('404.html', dist)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/umlimator/no-such-page`;
    const run = `import sys; sys.path.insert(0, "engine/scripts"); import visual; print(visual.chrome(sys.argv[1], "--virtual-time-budget=15000", "--dump-dom", sys.argv[2], done=lambda s: "</html>" in s, timeout=90))`;
    const dom = (await promisify(execFile)('python3', ['-c', run, chrome, url], { cwd: root, maxBuffer: 1 << 26 })).stdout;
    assert.match(dom, /class="NotFound/, 'the 404 page is drawn');
    assert.equal((dom.match(/<main[ >]/g) || []).length, 1, 'one main landmark');
    assert.match(dom, /<main[^>]*>\s*<div[^>]*class="NotFound"/, 'the 404 content is inside it');
  } finally { server.close(); }
});

// every link, frame and picture of the built site names a page or file it has, and an anchor that page has: the pages the
// maintainer's one-sidebar revamp (20 Nov 2026) moved left no link behind. The rendered examples (/umlimator/examples/) are
// built beside the site by CI's site job: tests/gallery.test.mjs checks those
test('the built site\'s links, frames and pictures each name a page or file it has, and an anchor on it', { skip: !built && 'the site is not built (npm --prefix docs run build)' }, () => {
  const dist = new URL('docs/.vitepress/dist/', root), names = pages().map(p => p.pathname.split('/dist/')[1]);
  const ids = Object.fromEntries(names.map(n => [n, new Set([...readFileSync(new URL(n, dist), 'utf8').matchAll(/ id="([^"]+)"/g)].map(m => m[1]))]));
  const bad = [];
  let n = 0;
  for (const p of names.filter(n => n !== '404.html')) {
    for (const [, raw] of readFileSync(new URL(p, dist), 'utf8').matchAll(/<(?:a|iframe|img)\b[^>]*? (?:href|src)="([^"]*)"/g)) {
      const href = raw.replace(/&amp;/g, '&'), [path, hash = ''] = href.split('#');
      if (/^(https?|mailto|data):/.test(path) || path.startsWith('/umlimator/examples/')) continue;
      n++;
      if (path.startsWith('/') && !path.startsWith('/umlimator/')) { bad.push(`${p}: ${href} (outside the base)`); continue; }
      let file = !path ? p : path.startsWith('/') ? path.slice('/umlimator/'.length) : posix.normalize(posix.join(posix.dirname(p), path));
      if (file === '' || file.endsWith('/')) file += 'index.html';
      if (!file.endsWith('.html')) { if (!existsSync(new URL(file, dist))) bad.push(`${p}: ${href} (no file)`); continue; }
      if (!ids[file]) { bad.push(`${p}: ${href} (no page)`); continue; }
      if (hash && !ids[file].has(decodeURIComponent(hash))) bad.push(`${p}: ${href} (no #${hash})`);
    }
  }
  assert.ok(n > 2000, `${n} links`);
  assert.deepEqual(bad, []);
});

test('the live diagram frames follow the site\'s light/dark switch, on load and on every switch (audit 58)', async () => {
  const { followSiteTheme } = await import('../docs/.vitepress/theme/frames.js');
  assert.match(read('docs/.vitepress/theme/index.js'), /followSiteTheme\(document\)/, 'the theme starts it on the client');
  const cls = new Set(), listeners = [], obs = [];
  const inner = () => ({ documentElement: { dataset: {} } });
  const frame = (inEx, cross) => { const d = inner(); return { tagName: 'IFRAME', d, closest: s => (s === '.ex-frame' && inEx ? {} : null), get contentDocument() { if (cross) throw new Error('cross-origin'); return d; } }; };
  const a = frame(true), b = frame(true), other = frame(false), far = frame(true, true);
  const doc = { documentElement: { classList: { contains: c => cls.has(c) } }, querySelectorAll: s => (s === '.ex-frame iframe' ? [a, b, far] : []),
    addEventListener: (t, f, cap) => listeners.push([t, f, cap]), removeEventListener: (t, f) => { const i = listeners.findIndex(l => l[0] === t && l[1] === f); if (i >= 0) listeners.splice(i, 1); } };
  class Obs { constructor(f) { this.f = f; obs.push(this); } observe(el, o) { this.el = el; this.o = o; } disconnect() { this.off = true; } }
  const stop = followSiteTheme(doc, Obs);
  assert.equal(a.d.documentElement.dataset.theme, 'light'); assert.equal(b.d.documentElement.dataset.theme, 'light');
  cls.add('dark'); obs[0].f(); // the site's switch: html.dark
  assert.deepEqual([a, b].map(f => f.d.documentElement.dataset.theme), ['dark', 'dark']);
  assert.deepEqual(obs[0].o, { attributes: true, attributeFilter: ['class'] }); assert.equal(obs[0].el, doc.documentElement);
  // a frame that loads later (another page, a lazy frame) takes the theme as it loads; a frame outside .ex-frame is left alone
  const late = frame(true); late.d.documentElement.dataset.theme = 'light';
  const [, onLoad, cap] = listeners.find(l => l[0] === 'load'); assert.equal(cap, true);
  onLoad({ target: late }); onLoad({ target: other });
  assert.equal(late.d.documentElement.dataset.theme, 'dark'); assert.equal(other.d.documentElement.dataset.theme, undefined);
  cls.delete('dark'); obs[0].f(); assert.equal(a.d.documentElement.dataset.theme, 'light');
  stop(); assert.ok(obs[0].off); assert.equal(listeners.length, 0);
});
