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
