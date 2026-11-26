// The edit and held-out corpora of the layout quality score (docs/diagrams/notes/layout-flow.md section 4.3, step 12 of
// section 12): the edit corpus is committed and is what its seeded generator writes, each pair applies and validates; the
// held-out corpus is never committed, is a function of its seed and week only, and the score reads it as totals only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { apply, validate } from '../lib/umlimator-all.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EDITS = JSON.parse(readFileSync(join(ROOT, 'bench/edits/edits.json'), 'utf8'));
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });

test('edit corpus: bench/edits/edits.json is what bench/gen-edits.mjs writes', () => {
  const r = run(process.execPath, ['bench/gen-edits.mjs', '--check']);
  assert.equal(r.status, 0, r.stderr);
});

test('edit corpus: five kinds of edit, each pair applies to its bench model and validates, its touched cards are on the view', () => {
  assert.deepEqual([...new Set(EDITS.pairs.map(p => p.kind))].sort(), ['add-card', 'add-line', 'move-into-box', 'remove-line', 'rename']);
  assert.ok(EDITS.pairs.length >= 100);
  const models = {};
  for (const p of EDITS.pairs) {
    const m = models[p.model] ||= JSON.parse(readFileSync(join(ROOT, p.model), 'utf8')), after = apply(m, p.commands);
    assert.deepEqual(validate(after).filter(x => x.level === 'error'), [], p.id);
    const v = after.views.find(x => x.id === p.view);
    assert.ok(p.touched.length && p.touched.every(id => v.nodeIds.includes(id)), p.id);
  }
});

test('edit corpus: bench/score-expected-edits.json lists every pair', () => {
  const e = JSON.parse(readFileSync(join(ROOT, 'bench/score-expected-edits.json'), 'utf8'));
  assert.equal(e.corpus, 'edits');
  assert.deepEqual(Object.keys(e.views).sort(), EDITS.pairs.map(p => 'edits/' + p.id).sort());
});

const gen = (out, week, env = { LAYOUT_HELDOUT_SEED: 'test seed' }) => run('python3', ['-I', 'bench/gen.py', '--heldout', '--week', week, '--out', out], env);
const files = d => Object.fromEntries(readdirSync(d).sort().map(f => [f, readFileSync(join(d, f), 'utf8')]));

test('held-out corpus: the same seed and week give the same maps, another week others; never in the repository; nothing printed of them', () => {
  const a = mkdtempSync(join(tmpdir(), 'ho-')), b = mkdtempSync(join(tmpdir(), 'ho-')), c = mkdtempSync(join(tmpdir(), 'ho-'));
  const r = gen(a, '2026-W48'); assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'wrote 16 held-out views');
  gen(b, '2026-W48'); gen(c, '2026-W49');
  assert.deepEqual(files(a), files(b));
  assert.notDeepEqual(files(a), files(c));
  const ms = Object.values(files(a)).map(t => JSON.parse(t));
  for (const m of ms) {
    assert.deepEqual(validate(m).filter(x => x.level === 'error'), []);
    assert.equal(m.views.length, 1); assert.equal(m.views[0].arrange, 'flow');
    assert.ok(m.nodes.length >= 8 && m.nodes.length <= 60, String(m.nodes.length));
  }
  const longest = m => m.nodes.filter(n => /-m\d+$/.test(n.id)).length;
  assert.equal(ms.filter(m => longest(m) >= 11 && longest(m) <= 30).length >= 4, true, 'long main flows for the snake');
  const inRepo = gen(join(ROOT, 'bench', 'heldout'), '2026-W48');
  assert.equal(inRepo.status, 1); assert.match(inRepo.stderr, /never written into the repository/);
  assert.equal(existsSync(join(ROOT, 'bench', 'heldout')), false);
  const noSeed = gen(a, '2026-W48', {}); assert.equal(noSeed.status, 1); assert.match(noSeed.stderr, /needs a seed/);
  assert.match(gen(a, 'week 48').stderr, /--week as YYYY-Www/);
});

test('held-out corpus: the score prints totals only, refuses to name a view or write one, and needs the seed', () => {
  const r = run(process.execPath, ['bench/score.mjs', '--corpus', 'heldout', '--runs', '1', '--week', '2026-W48'], { LAYOUT_HELDOUT_SEED: 'test seed' });
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], /^total: 16 views, score [\d.]+, hard \d+/);
  assert.ok(!/heldout\/|-m\d\d|store/.test(r.stdout + r.stderr), 'no view, card or label printed');
  for (const extra of [['--views', 'heldout/h00'], ['--expect', 'bench/score-expected.json'], ['--save'], ['--write-expected']]) {
    const x = run(process.execPath, ['bench/score.mjs', '--corpus', 'heldout', ...extra], { LAYOUT_HELDOUT_SEED: 'x' });
    assert.equal(x.status, 2); assert.match(x.stderr, /totals only/);
  }
  const none = run(process.execPath, ['bench/score.mjs', '--corpus', 'heldout']);
  assert.equal(none.status, 2); assert.match(none.stderr, /needs its seed in LAYOUT_HELDOUT_SEED/);
});
