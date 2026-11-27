// The layout quality score's bench mode (docs/diagrams/notes/layout-flow.md section 4.2): lays out each view of a corpus
// with lib/umlimator-all.js in Node, scores it (src/layout/score.js) and prints a table per view and the totals.
//
//   node bench/score.mjs                                  # the fixed corpus, 5 runs a view
//   node bench/score.mjs --views b10/overview,examples/bookshop-c4
//   node bench/score.mjs --expect bench/score-expected.json   # fail when a view's hard rises, a view's score rises by
//                                                             # more than 2 percent, or the total rises
//   node bench/score.mjs --base-lib /tmp/base-all.js      # also lay out with the base commit's lib, in turn, run by run:
//                                                         # the same rules against it, and its time as the gate
//   node bench/score.mjs --save                           # also write bench/results/score-<date>-<commit>.json
//   node bench/score.mjs --write-expected                 # write bench/score-expected.json (the maintainer's call)
//   node bench/score.mjs --corpus edits                   # the edit corpus (bench/edits/edits.json): each pair laid out
//                                                         # against its base model (stableFrom), with moved; its expect
//                                                         # file is bench/score-expected-edits.json
//   node bench/score.mjs --corpus heldout [--week 2026-W48]   # the held-out corpus, built by bench/gen.py from the seed in
//                                                         # LAYOUT_HELDOUT_SEED into a temporary folder: totals only
//   node bench/score.mjs --out <file>                     # also write the run's totals (and, but for heldout, its views)
//
// `python3 bench/bench.py --score ...` runs this. Time is a gate, never a term of the score: a view of m50 over 1000 ms or a
// C4 example over 1500 ms (median), or the corpus over 1.10 times the base lib's time measured in the same run, fails; with a
// base lib in the run, an over-budget view fails only when it is also over 1.10 times its base time (CI runners differ in speed).
// The score itself is a function of the geometry only: two runs that lay a view out differently fail the run.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { viewMetrics, scoreView, moved } from '../src/layout/score.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), flag = k => args.includes(k), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const fail = msg => { console.error(msg); process.exit(2); };
const known = new Set(['--corpus', '--views', '--runs', '--lib', '--base-lib', '--expect', '--weights', '--save', '--write-expected', '--out', '--week', '--edits']);
for (let i = 0; i < args.length; i++) { if (!known.has(args[i])) fail(`score.mjs: unknown argument ${args[i]}`); if (!['--save', '--write-expected'].includes(args[i])) i++; }

const corpus = opt('--corpus', 'fixed');
if (!['fixed', 'edits', 'heldout'].includes(corpus)) fail(`score.mjs: --corpus is fixed, edits or heldout, not ${corpus}`);
// the held-out corpus is read by no one (section 4.3): no view list, no expect file, nothing saved but totals
const secret = corpus === 'heldout';
if (secret && ['--views', '--expect', '--save', '--write-expected'].some(flag)) fail('score.mjs: the heldout corpus reports totals only: no --views, --expect, --save or --write-expected');
if (secret && !process.env.LAYOUT_HELDOUT_SEED) fail('score.mjs: the heldout corpus needs its seed in LAYOUT_HELDOUT_SEED (a secret only CI holds)');
if (opt('--week') && !/^\d{4}-W\d{2}$/.test(opt('--week'))) fail('score.mjs: --week is YYYY-Www');
const runs = Math.max(1, Number(opt('--runs', 5)) | 0);
const weights = JSON.parse(readFileSync(resolve(ROOT, opt('--weights', 'bench/score-weights.json')), 'utf8'));
const lib = await import(pathToFileURL(resolve(opt('--lib', resolve(ROOT, 'lib/umlimator-all.js')))).href);
const baseLib = opt('--base-lib') ? await import(pathToFileURL(resolve(opt('--base-lib'))).href) : null;

// the fixed corpus (section 4.3): bench/models/*.json as b10/overview, every examples/*.json view as examples/<file>/<view>,
// the typed fixtures tests/*-minimal.json and tests/*-stress.json as tests/<file>/<view>
const json = dir => readdirSync(resolve(ROOT, dir)).filter(f => f.endsWith('.json')).sort();
let files = [...json('bench/models').map(f => ['bench/models/' + f, f.slice(0, -5)]),
  ...json('examples').map(f => ['examples/' + f, 'examples/' + f.slice(0, -5)]),
  ...json('tests').filter(f => /-(minimal|stress)\.json$/.test(f)).map(f => ['tests/' + f, 'tests/' + f.slice(0, -5)])];
// the ISO week of a date, YYYY-Www: the held-out seed is hashed with it, so each week's maps are new
const isoWeek = d => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7); return `${y}-W${String(w).padStart(2, '0')}`; };
let tmpDir = null;
if (secret) { // built by bench/gen.py into a temporary folder, the seed passed in the environment only, removed at exit
  tmpDir = mkdtempSync(join(tmpdir(), 'umlimator-heldout-'));
  process.on('exit', () => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch {} });
  const r = spawnSync('python3', ['-I', resolve(ROOT, 'bench/gen.py'), '--heldout', '--week', opt('--week', isoWeek(new Date())), '--out', tmpDir], { encoding: 'utf8', env: process.env });
  if (r.status !== 0) fail(`score.mjs: bench/gen.py --heldout failed (exit ${r.status})`);
  files = readdirSync(tmpDir).filter(f => f.endsWith('.json')).sort().map(f => [join(tmpDir, f), 'heldout/' + f.slice(0, -5)]);
}
const edits = corpus === 'edits' ? JSON.parse(readFileSync(resolve(ROOT, opt('--edits', 'bench/edits/edits.json')), 'utf8')).pairs : null;
const want = (opt('--views', '') || '').split(',').filter(Boolean);
const picked = key => !want.length || want.some(w => key === w || key.startsWith(w + '/'));
const budget = (key, view) => key.startsWith('m50/') ? 1000 : key.startsWith('examples/') && /^c4\./.test(view.diagram || '') ? 1500 : null;

const now = () => performance.now(), median = xs => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const print = g => JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => e.pts), g.edges.map(e => e.lbl && [e.lbl.x, e.lbl.y])]);
function measure(L, model, vid, o) { // the first run's geometry; every run's time; whether every run drew the same
  const ms = []; let g = null, same = true;
  for (let i = 0; i < runs; i++) { const t = now(), h = L.layout(model, vid, o); ms.push(now() - t); if (!g) g = h; else if (same && print(h) !== print(g)) same = false; }
  return { g, ms, same };
}
const metricsOf = (g, model, view, share = 0) => { const m = viewMetrics(g, { model, view }); return { ...m, score: scoreView(m, weights, share) }; };
const r3 = x => Math.round(x * 1000) / 1000;
// an edit pair (section 4.3): the base laid out, the edited model laid out against it (stableFrom) and fresh; moved counts
// the untouched cards whose cell the stable layout changed, and the pair's score takes its share
function editPair(L, p) {
  const before = JSON.parse(readFileSync(resolve(ROOT, p.model), 'utf8')), after = L.apply(before, p.commands), view = after.views.find(v => v.id === p.view);
  const g0 = L.layout(before, p.view), s = measure(L, after, p.view, { stableFrom: before }), fresh = L.layout(after, p.view);
  const mv = moved(g0, s.g, p.touched || []), mf = moved(g0, fresh, p.touched || []);
  const m = metricsOf(s.g, after, view, mv.share), f = viewMetrics(fresh, { model: after, view });
  return { a: s, view, r: { ...m, moved: r3(mv.share), shift: r3(mv.shift), movedFresh: r3(mf.share), hardFresh: f.hard } };
}

const results = {}, base = {}, problems = [];
const cols = ['hard', 'cross', 'through', 'labels', 'straight', 'reverse', ...(edits ? ['moved'] : [])];
const show = v => v == null ? '-' : String(v);
const row = (key, r, b) => { if (!secret) console.log(`${key.padEnd(52)} ${String(r.nodes).padStart(3)} ${String(r.edges).padStart(4)} ${cols.map(c => show(r[c]).padStart(6)).join('')} ${r.score.toFixed(2).padStart(10)} ${r.ms.toFixed(1).padStart(8)}`
  + (b ? `   base ${b.score.toFixed(2)} ${b.ms.toFixed(1)} ms` : '')); };
// a problem of the held-out corpus is counted, never named: its views are read by no one (section 4.3)
let hidden = 0; const problem = msg => { if (secret) hidden++; else problems.push(msg); };
if (!secret) console.log(`${'view'.padEnd(52)} ${'n'.padStart(3)} ${'e'.padStart(4)} ${cols.map(c => c.slice(0, 5).padStart(6)).join('')} ${'score'.padStart(10)} ${'ms'.padStart(8)}`);
if (edits) for (const p of edits) {
  const key = 'edits/' + p.id; if (!picked(key) && !picked(p.id)) continue;
  let a, b = null;
  try { a = editPair(lib, p); if (baseLib) b = editPair(baseLib, p); }
  catch (e) { problem(`${key}: layout failed: ${e.message}`); continue; }
  if (!a.a.same) problem(`${key}: ${runs} runs laid it out differently`);
  const r = results[key] = { nodes: a.a.g.nodes.length, edges: a.a.g.edges.length, ...a.r, ms: Math.round(median(a.a.ms) * 10) / 10 };
  if (b) base[key] = { ...b.r, ms: Math.round(median(b.a.ms) * 10) / 10 };
  row(key, r, b && base[key]);
}
else for (const [path, stem] of files) {
  const model = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
  for (const view of model.views || []) {
    const key = `${stem}/${view.id}`; if (!picked(key)) continue;
    let a, b = null;
    try { a = measure(lib, model, view.id); if (baseLib) b = measure(baseLib, model, view.id); }
    catch (e) { problem(`${key}: layout failed: ${e.message}`); continue; }
    if (!a.same) problem(`${key}: ${runs} runs laid it out differently`);
    const r = results[key] = { nodes: a.g.nodes.length, edges: a.g.edges.length, ...metricsOf(a.g, model, view), ms: Math.round(median(a.ms) * 10) / 10 };
    if (b) base[key] = { ...metricsOf(b.g, model, view), ms: Math.round(median(b.ms) * 10) / 10 };
    // With the base measured in the same run (CI), a view over its budget fails only when it is also slower than the base by the
    // corpus gate's factor: a shared runner's own speed is not a layout change. Without a base the budget holds as written.
    const lim = budget(key, view);
    if (lim != null && r.ms > lim) {
      if (!b) problem(`${key}: ${r.ms} ms > its budget of ${lim} ms`);
      else if (r.ms > base[key].ms * 1.10) problem(`${key}: ${r.ms} ms > its budget of ${lim} ms and over 1.10 times the base's ${base[key].ms} ms`);
      else console.log(`note: ${key}: ${r.ms} ms > its budget of ${lim} ms, but within 1.10 times the base's ${base[key].ms} ms on this machine`);
    }
    row(key, r, b && base[key]);
  }
}
const keys = Object.keys(results);
if (!keys.length) fail(`score.mjs: no view matches ${want.join(',') || 'the corpus'}`);
const sum = (R, k, ks = keys) => Math.round(ks.reduce((a, x) => a + (R[x][k] || 0), 0) * 100) / 100;
const total = { views: keys.length, score: sum(results, 'score'), hard: sum(results, 'hard'), cross: sum(results, 'cross'), through: sum(results, 'through'), labels: sum(results, 'labels'), ms: sum(results, 'ms') };
console.log(`total: ${total.views} ${edits ? 'pairs' : 'views'}, score ${total.score.toFixed(2)}, hard ${total.hard}, cross ${total.cross}, through ${total.through}, labels ${total.labels}, ${total.ms.toFixed(1)} ms`);
// section 8.4's targets for the edit corpus, reported: moved of untouched cards is 0 in at least 95 percent of pairs, and
// no pair draws more hard issues than the same edit laid out fresh
let targets = null;
if (edits) {
  const still = keys.filter(k => results[k].moved === 0).length, worse = keys.filter(k => results[k].hard > results[k].hardFresh);
  targets = { still, pairs: keys.length, stillShare: r3(still / keys.length), hardAboveFresh: worse.length, movedFresh: r3(keys.reduce((a, k) => a + results[k].movedFresh, 0) / keys.length) };
  // held today, so held from now on: the stability guard never draws a pair worse than fresh; the 95 percent is reported only
  if (worse.length) problems.push(`${worse.length} edit pairs draw more hard issues than the same edit laid out fresh (section 8.4)`);
  console.log(`section 8.4: untouched cards kept their cells in ${still} of ${keys.length} pairs (${(100 * targets.stillShare).toFixed(1)} percent, target 95; laid out fresh, ${(100 * (1 - targets.movedFresh)).toFixed(1)} percent of untouched cards stay on average), ${worse.length} pairs with more hard issues than fresh (target 0)${worse.length ? ': ' + worse.slice(0, 8).join(', ') : ''}`);
}

// the keep rules (section 4.2): no view's hard rises, no view's score rises by more than 2 percent, the total does not rise
function against(ref, what) {
  const ks = keys.filter(k => ref[k]);
  ks.forEach(k => { const r = results[k], e = ref[k];
    if (r.hard > e.hard) problem(`${k}: hard ${r.hard} > ${e.hard} in ${what}`);
    if (r.score > e.score * 1.02 + 0.01) problem(`${k}: score ${r.score} > ${e.score} in ${what} by more than 2 percent`); });
  const now = sum(results, 'score', ks), was = Math.round(ks.reduce((a, k) => a + ref[k].score, 0) * 100) / 100;
  if (now > was + 0.01) problems.push(`total score ${now} > ${was} in ${what}, over the ${ks.length} views both have`);
  return { now, was };
}
let vsBase = null;
if (opt('--expect')) {
  const exp = JSON.parse(readFileSync(resolve(opt('--expect')), 'utf8')).views || {};
  against(exp, opt('--expect'));
  if (!want.length) Object.keys(exp).filter(k => !results[k]).forEach(k => problems.push(`${k}: listed in ${opt('--expect')} but not scored`));
}
if (baseLib) {
  const { was } = against(base, 'the base');
  const ratio = total.ms / Math.max(1e-9, sum(base, 'ms'));
  vsBase = { score: was, hard: sum(base, 'hard'), ms: sum(base, 'ms'), time: r3(ratio) };
  console.log(`base: score ${was.toFixed(2)}, hard ${vsBase.hard}; time: ${ratio.toFixed(3)} times the base`);
  if (ratio > 1.10) problems.push(`the corpus takes ${ratio.toFixed(3)} times the base's time (over 1.10)`);
}
if (hidden) problems.push(`${hidden} held-out ${hidden === 1 ? 'view fails' : 'views fail'} a rule (not named: the held-out maps are read by no one)`);

const commit = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
const strip = r => Object.fromEntries(['hard', ...cols.slice(1), 'score'].map(k => [k, r[k]]));
if (secret && opt('--out') && resolve(opt('--out')).startsWith(ROOT)) fail('score.mjs: the held-out totals are written outside the repository');
if (flag('--save')) {
  const dir = resolve(ROOT, 'bench/results'); if (!existsSync(dir)) mkdirSync(dir);
  const out = resolve(dir, `score-${new Date().toISOString().slice(0, 10)}-${commit()}.json`);
  writeFileSync(out, JSON.stringify({ commit: commit(), corpus, runs, weights, total, views: results, ...(baseLib ? { base } : {}) }, null, 1) + '\n');
  console.log('saved', out.slice(ROOT.length));
}
if (flag('--write-expected')) {
  if (want.length) fail('score.mjs: --write-expected writes the whole corpus; leave out --views');
  const file = edits ? 'bench/score-expected-edits.json' : 'bench/score-expected.json';
  writeFileSync(resolve(ROOT, file), JSON.stringify({ commit: commit(), corpus, total: { views: total.views, score: total.score }, views: Object.fromEntries(keys.map(k => [k, strip(results[k])])) }, null, 1) + '\n');
  console.log('wrote ' + file);
}
// --out: what the tuning loop reads (tools/evolve/tune-loop.mjs); the held-out corpus gives its totals only
if (opt('--out')) writeFileSync(resolve(opt('--out')), JSON.stringify({ corpus, runs, total, ...(vsBase ? { base: vsBase } : {}), ...(targets ? { targets } : {}),
  problems: problems.length, ...(secret ? {} : { views: Object.fromEntries(keys.map(k => [k, strip(results[k])])) }) }, null, 1) + '\n');
if (problems.length) { console.log('FAILED\n  ' + problems.join('\n  ')); process.exit(1); }
