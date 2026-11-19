// The README is also the package's page on npm, which resolves a relative link or picture against the repository's default
// branch, not the published version: a file moved or deleted later breaks the npm page of every release. So every link and
// picture in it is absolute, and each one into this repository names a file that exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const md = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const targets = [...md.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]);

test('README: every link and picture is absolute, so the npm page never breaks', () => {
  const rel = targets.filter(t => !/^(https?:|mailto:|#)/.test(t));
  assert.deepEqual(rel, [], 'relative links in README.md');
});

test('README: each link into this repository names a file that exists', () => {
  const own = targets.map(t => t.match(/^https:\/\/(?:raw\.githubusercontent\.com\/zintaen\/umlimator\/main|github\.com\/zintaen\/umlimator\/(?:blob|tree)\/main)\/([^#?]+)/)).filter(Boolean).map(m => m[1]);
  assert.ok(own.length > 0);
  const gone = own.filter(p => !existsSync(new URL('../' + p, import.meta.url)));
  assert.deepEqual(gone, [], 'README links to files that do not exist');
});
