// The API reference (docs/api/*.md) against the types it documents: every name lib/*.d.ts exports appears on some page,
// every exported function's signature is quoted as the .d.ts has it, and every relative link and anchor resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), api = join(root, 'docs/api');
const read = p => readFileSync(p, 'utf8');
const pages = Object.fromEntries(readdirSync(api).filter(f => f.endsWith('.md')).map(f => [f, read(join(api, f))]));
const all = Object.values(pages).join('\n');
const dts = readdirSync(join(root, 'lib')).filter(f => f.endsWith('.d.ts')).map(f => read(join(root, 'lib', f)));

test('the API reference has its seven pages', () => {
  assert.deepEqual(Object.keys(pages).sort(), ['apply-and-commands.md', 'element-and-plugins.md', 'events-and-state.md', 'index.md',
    'model-and-schema.md', 'render.md', 'typed-diagrams.md']);
});

test('every name lib/*.d.ts exports appears on some API page', () => {
  const names = dts.flatMap(s => [...s.matchAll(/^export\s+(?:declare\s+)?(?:function|interface|type|class|const)\s+(\w+)/gm)].map(m => m[1]));
  assert.ok(names.length > 100, `only ${names.length} exports found`);
  const missing = [...new Set(names)].filter(n => !new RegExp(`\\b${n}\\b`).test(all));
  assert.deepEqual(missing, [], `not in docs/api/*.md: ${missing.join(', ')}`);
});

test('every exported function of lib/umlimator.d.ts is quoted with its signature as the .d.ts has it', () => {
  const sigs = [...read(join(root, 'lib/umlimator.d.ts')).matchAll(/^export (function .+;)$/gm)].map(m => m[1]);
  assert.ok(sigs.length >= 19, `only ${sigs.length} functions found`);
  const stale = sigs.filter(s => !all.includes(s));
  assert.deepEqual(stale, [], 'a signature on the API pages differs from lib/umlimator.d.ts');
});

// a heading's anchor as GitHub and VitePress both make it for the plain headings these pages use; a repeat gets -1, -2
const anchors = md => {
  const seen = {}, out = new Set();
  for (const [, h] of md.replace(/^(```|````)[\s\S]*?^\1/gm, '').matchAll(/^#{1,6} (.+)$/gm)) {
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
