// The documentation site (docs/, VitePress): the diagram types page shows each of the 28 types with its own example and
// conformance note, and every page the sidebar names is there. The build itself, with its dead-link check, is CI's
// docs job (npm --prefix docs run build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { MOVED } from '../docs/diagrams/examples/check.mjs';

const root = new URL('../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8');
const notes = readdirSync(new URL('docs/conformance/', root)).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();

test('the types page shows each of the 28 types with its example (MOVED), still and conformance note', () => {
  assert.equal(notes.length, 28);
  const want = {}; // conformance slug -> [example, its root view]
  for (const to of Object.values(MOVED)) {
    const n = to.match(/examples\/([\w-]+)\.json$/)[1], m = JSON.parse(read(`examples/${n}.json`));
    const d = m.views.find(v => v.id === m.root).diagram;
    want[d.startsWith('c4.') ? 'c4' : d.replace('.', '-')] = [n, m.root];
  }
  assert.deepEqual(Object.keys(want).sort(), notes, 'MOVED holds one example per conformance note');
  const cards = read('docs/types.md').split('<div class="type">').slice(1);
  assert.equal(cards.length, 28);
  const seen = cards.map(c => {
    const slug = c.match(/href="\.\/conformance\/([\w-]+)\.html"/)[1], [n, view] = want[slug] || [];
    assert.ok(n, `${slug}: no such conformance note`);
    assert.match(c, new RegExp(`href="/umlimator/examples/${n}\\.html" target="_self">Live example`), `${slug}: links ${n}.html`);
    assert.ok(c.includes(`/umlimator/examples/stills/${n}/${view}.svg`), `${slug}: shows ${n}'s ${view} still`);
    return slug;
  });
  assert.deepEqual(seen.sort(), notes, 'each type once');
});

test('every page the sidebar and nav name exists', () => {
  const config = read('docs/.vitepress/config.mts');
  const list = name => config.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))[1];
  const pages = [...list('guide').matchAll(/\['[^']+', '([\w-]+)'\]/g)].map(m => `guide/${m[1]}.md`);
  pages.push(...[...list('api').matchAll(/\['[^']+', '([\w-]+)'\]/g)].map(m => `api/${m[1]}.md`));
  assert.equal(pages.length, 19);
  assert.deepEqual([...list('conformance').matchAll(/'([\w-]+)'/g)].map(m => m[1]).sort(), notes);
  pages.push('guide/index.md', 'types.md', 'changelog.md', 'module-api.md', 'index.md');
  for (const p of pages) assert.ok(existsSync(new URL(`docs/${p}`, root)), `docs/${p}`);
  assert.deepEqual(readdirSync(new URL('docs/guide/', root)).filter(f => f.endsWith('.md')).sort(),
    [...pages.filter(p => p.startsWith('guide/')).map(p => p.slice(6))].sort(), 'the sidebar lists every guide page');
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
    if (page.includes('class="NotFound"') || name === '404.html') continue;
    if ((page.match(/<main[ >]/g) || []).length !== 1) bad.push(`${name}: ${(page.match(/<main[ >]/g) || []).length} main`);
    // the site footer shows unless VitePress hides it beside a sidebar (has-sidebar: display none)
    const footers = (page.match(/<footer class="VPFooter"/g) || []).length + (page.match(/<footer class="VPDocFooter"/g) || []).length;
    if (footers > 1) bad.push(`${name}: ${footers} footers`);
  }
  assert.deepEqual(bad, []);
});
