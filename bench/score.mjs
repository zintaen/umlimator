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
//
// `python3 bench/bench.py --score ...` runs this. Time is a gate, never a term of the score: a view of m50 over 1000 ms or a
// C4 example over 1500 ms (median), or the corpus over 1.10 times the base lib's time measured in the same run, fails.
// The score itself is a function of the geometry only: two runs that lay a view out differently fail the run.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { viewMetrics, scoreView } from '../src/layout/score.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), flag = k => args.includes(k), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const fail = msg => { console.error(msg); process.exit(2); };
const known = new Set(['--corpus', '--views', '--runs', '--lib', '--base-lib', '--expect', '--weights', '--save', '--write-expected']);
for (let i = 0; i < args.length; i++) { if (!known.has(args[i])) fail(`score.mjs: unknown argument ${args[i]}`); if (!['--save', '--write-expected'].includes(args[i])) i++; }

const corpus = opt('--corpus', 'fixed');
if (corpus !== 'fixed') fail(`score.mjs: the ${corpus} corpus comes with a later step of layout-flow.md section 12 (heldout and edits: step 11); only fixed for now`);
const runs = Math.max(1, Number(opt('--runs', 5)) | 0);
const weights = JSON.parse(readFileSync(resolve(ROOT, opt('--weights', 'bench/score-weights.json')), 'utf8'));
const lib = await import(pathToFileURL(resolve(opt('--lib', resolve(ROOT, 'lib/umlimator-all.js')))).href);
const baseLib = opt('--base-lib') ? await import(pathToFileURL(resolve(opt('--base-lib'))).href) : null;

// the fixed corpus (section 4.3): bench/models/*.json as b10/overview, every examples/*.json view as examples/<file>/<view>,
// the typed fixtures tests/*-minimal.json and tests/*-stress.json as tests/<file>/<view>
const json = dir => readdirSync(resolve(ROOT, dir)).filter(f => f.endsWith('.json')).sort();
const files = [...json('bench/models').map(f => ['bench/models/' + f, f.slice(0, -5)]),
  ...json('examples').map(f => ['examples/' + f, 'examples/' + f.slice(0, -5)]),
  ...json('tests').filter(f => /-(minimal|stress)\.json$/.test(f)).map(f => ['tests/' + f, 'tests/' + f.slice(0, -5)])];
const want = (opt('--views', '') || '').split(',').filter(Boolean);
const picked = key => !want.length || want.some(w => key === w || key.startsWith(w + '/'));
const budget = (key, view) => key.startsWith('m50/') ? 1000 : key.startsWith('examples/') && /^c4\./.test(view.diagram || '') ? 1500 : null;

const now = () => performance.now(), median = xs => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const print = g => JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => e.pts), g.edges.map(e => e.lbl && [e.lbl.x, e.lbl.y])]);
function measure(L, model, vid) { // the first run's geometry; every run's time; whether every run drew the same
  const ms = []; let g = null, same = true;
  for (let i = 0; i < runs; i++) { const t = now(), h = L.layout(model, vid); ms.push(now() - t); if (!g) g = h; else if (same && print(h) !== print(g)) same = false; }
  return { g, ms, same };
}
const metricsOf = (g, model, view) => { const m = viewMetrics(g, { model, view }); return { ...m, score: scoreView(m, weights) }; };

const results = {}, base = {}, problems = [];
const cols = ['hard', 'cross', 'labels', 'straight', 'reverse'];
console.log(`${'view'.padEnd(52)} ${'n'.padStart(3)} ${'e'.padStart(4)} ${cols.map(c => c.slice(0, 5).padStart(6)).join('')} ${'score'.padStart(10)} ${'ms'.padStart(8)}`);
for (const [path, stem] of files) {
  const model = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
  for (const view of model.views || []) {
    const key = `${stem}/${view.id}`; if (!picked(key)) continue;
    let a, b = null;
    try { a = measure(lib, model, view.id); if (baseLib) b = measure(baseLib, model, view.id); }
    catch (e) { problems.push(`${key}: layout failed: ${e.message}`); continue; }
    if (!a.same) problems.push(`${key}: ${runs} runs laid it out differently`);
    const r = results[key] = { nodes: a.g.nodes.length, edges: a.g.edges.length, ...metricsOf(a.g, model, view), ms: Math.round(median(a.ms) * 10) / 10 };
    if (b) base[key] = { ...metricsOf(b.g, model, view), ms: Math.round(median(b.ms) * 10) / 10 };
    const lim = budget(key, view); if (lim != null && r.ms > lim) problems.push(`${key}: ${r.ms} ms > its budget of ${lim} ms`);
    const show = v => v == null ? '-' : String(v);
    console.log(`${key.padEnd(52)} ${String(r.nodes).padStart(3)} ${String(r.edges).padStart(4)} ${cols.map(c => show(r[c]).padStart(6)).join('')} ${r.score.toFixed(2).padStart(10)} ${r.ms.toFixed(1).padStart(8)}`
      + (b ? `   base ${base[key].score.toFixed(2)} ${base[key].ms.toFixed(1)} ms` : ''));
  }
}
const keys = Object.keys(results);
if (!keys.length) fail(`score.mjs: no view matches ${want.join(',') || 'the corpus'}`);
const sum = (R, k, ks = keys) => Math.round(ks.reduce((a, x) => a + (R[x][k] || 0), 0) * 100) / 100;
const total = { views: keys.length, score: sum(results, 'score'), hard: sum(results, 'hard'), cross: sum(results, 'cross'), labels: sum(results, 'labels'), ms: sum(results, 'ms') };
console.log(`total: ${total.views} views, score ${total.score.toFixed(2)}, hard ${total.hard}, cross ${total.cross}, labels ${total.labels}, ${total.ms.toFixed(1)} ms`);

// the keep rules (section 4.2): no view's hard rises, no view's score rises by more than 2 percent, the total does not rise
function against(ref, what) {
  const ks = keys.filter(k => ref[k]);
  ks.forEach(k => { const r = results[k], e = ref[k];
    if (r.hard > e.hard) problems.push(`${k}: hard ${r.hard} > ${e.hard} in ${what}`);
    if (r.score > e.score * 1.02 + 0.01) problems.push(`${k}: score ${r.score} > ${e.score} in ${what} by more than 2 percent`); });
  const now = sum(results, 'score', ks), was = Math.round(ks.reduce((a, k) => a + ref[k].score, 0) * 100) / 100;
  if (now > was + 0.01) problems.push(`total score ${now} > ${was} in ${what}, over the ${ks.length} views both have`);
  return ks;
}
if (opt('--expect')) {
  const exp = JSON.parse(readFileSync(resolve(opt('--expect')), 'utf8')).views || {};
  against(exp, opt('--expect'));
  if (!want.length) Object.keys(exp).filter(k => !results[k]).forEach(k => problems.push(`${k}: listed in ${opt('--expect')} but not scored`));
}
if (baseLib) {
  against(base, 'the base');
  const ratio = total.ms / Math.max(1e-9, sum(base, 'ms'));
  console.log(`time: ${ratio.toFixed(3)} times the base`);
  if (ratio > 1.10) problems.push(`the corpus takes ${ratio.toFixed(3)} times the base's time (over 1.10)`);
}

const commit = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
const strip = r => Object.fromEntries(['hard', ...cols.slice(1), 'score'].map(k => [k, r[k]]));
if (flag('--save')) {
  const dir = resolve(ROOT, 'bench/results'); if (!existsSync(dir)) mkdirSync(dir);
  const out = resolve(dir, `score-${new Date().toISOString().slice(0, 10)}-${commit()}.json`);
  writeFileSync(out, JSON.stringify({ commit: commit(), corpus, runs, weights, total, views: results, ...(baseLib ? { base } : {}) }, null, 1) + '\n');
  console.log('saved', out.slice(ROOT.length));
}
if (flag('--write-expected')) {
  if (want.length) fail('score.mjs: --write-expected writes the whole corpus; leave out --views');
  writeFileSync(resolve(ROOT, 'bench/score-expected.json'), JSON.stringify({ commit: commit(), corpus, total: { views: total.views, score: total.score }, views: Object.fromEntries(keys.map(k => [k, strip(results[k])])) }, null, 1) + '\n');
  console.log('wrote bench/score-expected.json');
}
if (problems.length) { console.log('FAILED\n  ' + problems.join('\n  ')); process.exit(1); }
