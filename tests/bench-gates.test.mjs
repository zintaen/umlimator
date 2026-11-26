// The bench's own gates, without real timing: bench/score.mjs's time budget against the base lib (a stub lib on a fake
// clock), and bench/gen-edits.mjs's per-view seeds (its build() run on a temporary copy of bench/models). Each guards a
// bug caught before merge on 26 Nov 2026 (1b5d04a3, c5ee8b06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readdirSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// bench/gen-edits.mjs as a copy in a temporary tree whose bench/models is `models` (file name to source path), lib/ and
// tools/ linked to this repository's: its build() reads that tree's models, as the real one reads the repository's
async function buildWith(models) {
  const dir = mkdtempSync(join(tmpdir(), 'umlimator-edits-'));
  try {
    mkdirSync(join(dir, 'bench/models'), { recursive: true });
    copyFileSync(join(ROOT, 'bench/gen-edits.mjs'), join(dir, 'bench/gen-edits.mjs'));
    for (const d of ['lib', 'tools', 'src']) symlinkSync(join(ROOT, d), join(dir, d), 'dir');
    for (const [name, src] of Object.entries(models)) copyFileSync(src, join(dir, 'bench/models', name));
    const { build } = await import(pathToFileURL(join(dir, 'bench/gen-edits.mjs')).href);
    return build().pairs;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const byView = pairs => { const out = {}; for (const p of pairs) (out[p.model + '#' + p.view] ||= []).push(JSON.stringify(p)); return out; };

test('the edit corpus seeds each view on its own: removing or adding a bench model leaves every other view\'s pairs as they were (c5ee8b06)', async () => {
  const files = readdirSync(join(ROOT, 'bench/models')).filter(f => f.endsWith('.json')).sort();
  const all = Object.fromEntries(files.map(f => [f, join(ROOT, 'bench/models', f)]));
  const full = byView(await buildWith(all));
  assert.ok(Object.keys(full).length > 10, 'the corpus has its views');
  // the first model in the order build() reads them: under one shared sequence every later view's draws would shift
  const gone = files[0], without = { ...all }; delete without[gone];
  const less = byView(await buildWith(without));
  for (const k of Object.keys(full)) if (!k.startsWith(`bench/models/${gone}#`)) assert.deepEqual(less[k], full[k], `${k}: its pairs changed when ${gone} was removed`);
  assert.ok(!Object.keys(less).some(k => k.startsWith(`bench/models/${gone}#`)), `${gone}'s views are gone`);
  // a model added first in the order (a copy of the last under a name that sorts first)
  const more = byView(await buildWith({ 'a00.json': all[files.at(-1)], ...all }));
  for (const k of Object.keys(full)) assert.deepEqual(more[k], full[k], `${k}: its pairs changed when a model was added`);
  assert.ok(Object.keys(more).some(k => k.startsWith('bench/models/a00.json#')), 'the added model has views in the corpus');
});

// bench/score.mjs with a stub lib and a stub base lib, both drawing with the real layout() but timed on a fake clock: each
// layout() call advances performance.now() by the lib's set time and nothing else, so no real time enters the decision
function scoreRun(dir, ms, baseMs) {
  const stub = (name, t) => {
    const p = join(dir, name);
    writeFileSync(p, `import * as real from ${JSON.stringify(pathToFileURL(join(ROOT, 'lib/umlimator-all.js')).href)};
const clock = globalThis.__fakeClock ||= (() => { const c = { t: 0 }; Object.defineProperty(globalThis, 'performance', { value: { now: () => c.t }, configurable: true, writable: true }); return c; })();
export const apply = real.apply;
export function layout(...a) { const g = real.layout(...a); clock.t += ${t}; return g; }
`);
    return p;
  };
  const args = ['bench/score.mjs', '--runs', '1', '--views', VIEW, '--lib', stub(`lib-${ms}.mjs`, ms)];
  if (baseMs != null) args.push('--base-lib', stub(`base-${baseMs}.mjs`, baseMs));
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
}
// a view of bench/models/m50.json: its budget is 1000 ms
const VIEW = `m50/${JSON.parse(readFileSync(join(ROOT, 'bench/models/m50.json'), 'utf8')).views[0].id}`;

test('the layout-score gate: with a base lib in the run, a view over its budget fails only when also over 1.10 times its base time; without a base the budget holds (1b5d04a3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'umlimator-score-'));
  try {
    const said = r => r.stdout + r.stderr;
    // no base: 1100 ms is over the 1000 ms budget
    let r = scoreRun(dir, 1100);
    assert.equal(r.status, 1, said(r)); assert.match(said(r), /> its budget of 1000 ms/);
    // within budget, no base: passes
    r = scoreRun(dir, 900);
    assert.equal(r.status, 0, said(r));
    // over budget, the base as slow on this machine (1100 is within 1.10 times 1050): passes, with a note
    r = scoreRun(dir, 1100, 1050);
    assert.equal(r.status, 0, said(r)); assert.match(r.stdout, /note: .*within 1\.10 times the base's 1050 ms/);
    // over budget and over 1.10 times the base (1100 > 1.10 * 950 = 1045): fails
    r = scoreRun(dir, 1100, 950);
    assert.equal(r.status, 1, said(r)); assert.match(said(r), /over 1\.10 times the base's 950 ms/);
    // within budget but over 1.10 times the base: the corpus gate fails on the ratio, as before
    r = scoreRun(dir, 960, 800);
    assert.equal(r.status, 1, said(r)); assert.match(said(r), /the corpus takes 1\.200 times the base's time/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
