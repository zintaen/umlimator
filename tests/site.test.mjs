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

test('inline code on the site reads at WCAG AA (4.5:1) on a table row\'s tint, in both themes (audit 16)', () => {
  const css = read('docs/.vitepress/theme/custom.css');
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // VitePress colours inline code with --vp-code-color; the even table rows under it are these (bg-soft plus the code tint)
  for (const [scope, row] of [[':root', '#e7e9ec'], ['.dark', '#2b2e36']]) {
    const block = css.match(new RegExp(`^${scope.replace('.', '\\.')} \\{([^}]*)\\}`, 'm'))[1], c = block.match(/--vp-code-color:\s*(#[0-9a-f]{6})/i);
    assert.ok(c, `${scope} sets --vp-code-color (else it is the brand accent, under 4.5:1)`);
    assert.ok(ratio(c[1], row) >= 4.5, `${scope}: ${c[1]} on ${row} is ${ratio(c[1], row).toFixed(2)}:1`);
  }
});

test('each "28 diagram types" list names all 28: UML\'s 14 and its information flow diagram among them (audit 17)', () => {
  for (const p of ['README.md', 'docs/index.md', 'examples/README.md'])
    assert.match(read(p).replace(/\s+/g, ' '), /28 diagram types\W[^.]*information flow/, p);
});

test('the API docs send the field list to a page that exists, not the README\'s gone Model section (audit 17)', () => {
  const api = read('docs/api/model-and-schema.md');
  assert.doesNotMatch(api, /README's Model section/); // the README has no Model section since the guide split
  assert.match(api, /\]\(\.\.\/guide\/model\.md\)/);
});

test('the guide says timelapse keeps the latest 30 versions, and names --limit (audit 17)', () => {
  const action = read('docs/guide/github-action.md').replace(/\s+/g, ' ');
  assert.doesNotMatch(action, /every version of the model/);
  assert.match(action, /latest 30 versions[^.]*--limit N/);
  assert.match(read('docs/guide/cli.md'), /timelapse model\.json[^\n]*latest 30[^\n]*--limit N/);
});

test('risks.md M25 is closed: AWS accepted, the aws type and its pack row are on (audit 17)', () => {
  const m25 = read('docs/diagrams/risks.md').split('\n').find(l => l.startsWith('| M25 |'));
  assert.doesNotMatch(m25, /CLOUD_AWS = false|no pack row/);
  assert.match(m25, /conformance\/aws\.md/);
});
