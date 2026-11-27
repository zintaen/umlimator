#!/usr/bin/env node
// The weekly propose-measure-keep loop for the layout's tuning constants (docs/diagrams/notes/layout-flow.md section 9):
// one change to one value of src/layout/tune.js, within its declared range, measured on the fixed, edit and held-out
// corpora against the code as it is, kept only when the note's rules hold, and then opened as a pull request against
// audit-loop. It never merges, and it changes no other file but lib/ (rebuilt from the changed tune.js) and its record.
//
//   node tools/evolve/tune-loop.mjs propose [--week 2026-W48] [--history <dir>...]   print the week's proposal
//   node tools/evolve/tune-loop.mjs check   --candidate <file> [--tune src/layout/tune.js] refuse a candidate out of range
//   node tools/evolve/tune-loop.mjs run     --owner <id> [--week W] [--date YYYY-MM-DD] [--history <dir>...]
//                                           [--record <file>] [--candidate-out <file>] [--runs 5] [--restart]
//                                           [--lease <file>] [--ref origin/main]
//   node tools/evolve/tune-loop.mjs publish --record <file> --candidate <file> [--base audit-loop] [--dry-run]
//
// run: the kill switch (killswitch.mjs) and the lease (lease.mjs, held for the whole run, renewed between measures, then
// released), the guards of section 9.3 (two weeks with nothing kept: stopped until --restart; a change kept last week
// whose held-out total is now worse: its revert is this week's candidate), then the proposal, measured with
// bench/score.mjs on each corpus with the candidate's lib against the checked-out lib. The held-out corpus needs
// LAYOUT_HELDOUT_SEED in the environment and is read as totals only; without it nothing is kept. It writes the record
// (the week, the proposal, each corpus's totals, the decision) to --record, which digest.mjs --tune reads, and the
// candidate tune.js to --candidate-out when kept. Exit 0: a change is kept; 1: nothing kept, stopped, or refused (the
// lease or the kill switch); 2: a usage error.
//
// publish (a separate step, with no seed): checks the candidate again, writes it and rebuilds lib/, moves the value's pin
// in bench/tune-pins.json, commits tune.js, the pins, lib/ and bench/results/tune-<date>.json on a new branch
// layout-tune/<week>, pushes it, opens a pull request against audit-loop with `gh`, and starts the check and layout-score
// workflows on the branch (`gh workflow run --ref`), since a pull request opened with the workflow's token starts none.
// tests/tune.test.mjs reads the pins of the values the loop may change from bench/tune-pins.json and holds tune.js to
// them, so the pin moves in the same commit as the value and the maintainer reviews both (section 9.4): the loop never
// edits a test.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, seeded } from './args.mjs';
import { take, renew, release, leasePath } from './lease.mjs';
import { killSwitch } from './killswitch.mjs';
import { isMain } from '../main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const TUNE = 'src/layout/tune.js';
export const PINS = 'bench/tune-pins.json';
export const BASE_BRANCH = 'audit-loop';
// the workflows publish starts on the pull request's branch: name, and the inputs it passes
export const CI = Object.freeze([['check.yml', []], ['layout-score.yml', ['-f', 'heldout=false']]]);

// what the loop may change, and how far (section 9.1, 9.4: each value has a range; a candidate out of it is refused). A
// constant not listed (FLOW_MIN, FLOW_WAYS, LABEL_PASSES, SCORE_WEIGHTS.issue and areaPer) is fixed: a candidate that
// changes one is refused too. SNAKE_AT and SNAKE_SLACK (section 14) count once tune.js has them.
export const RANGES = Object.freeze({
  BARY_SWEEPS: { min: 2, max: 16, step: 1, why: 'more barycentre sweeps find column orders that cross less, for more time' },
  ROW_SWEEPS: { choices: [[1, -1, 1], [-1, 1, -1], [1, -1], [1, -1, 1, -1], [1, -1, 1, -1, 1]], why: 'another order of row sweeps settles rows from the other side first' },
  FLOW_CAP: { min: 20, max: 40, step: 2, why: 'bestFlow tries its four placements on views up to this many cards' },
  FAN_IN: { min: 4, max: 10, step: 1, why: 'fan-in routing first starts at this many lines into one card' },
  FAN_TRIES: { min: 6, max: 24, step: 2, why: 'the fan-in search may try this many layouts' },
  CROSS_CAP: { min: 20, max: 40, step: 2, why: 'the crossing searches run on views up to this many cards' },
  OUTSIDE_TRIES: { min: 2, max: 8, step: 1, why: 'routing round the outside may try this many layouts' },
  BRANCH_BALANCE: { min: 1, max: 4, step: 1, why: 'a branch changes side when one side of a column holds this many more cards' },
  STABLE_SLACK: { min: 0, max: 3, step: 1, why: 'a stable layout is kept when it draws at most this many labels fewer than a fresh one' },
  'SCORE_WEIGHTS.cross': { min: 50, max: 300, step: 10, why: 'the layout chooser weighs a crossing this much' },
  'SCORE_WEIGHTS.dropped': { min: 10, max: 120, step: 5, why: 'the layout chooser weighs a label not drawn this much' },
  'SCORE_WEIGHTS.lengthPer': { min: 5, max: 40, step: 1, why: 'the layout chooser counts one unit per this many px of line' },
  'SCORE_WEIGHTS.corner': { min: 4, max: 40, step: 2, why: 'the layout chooser weighs a corner this much' },
  SNAKE_AT: { min: 8, max: 16, step: 1, why: 'a main flow longer than this wraps onto a second row' },
  SNAKE_SLACK: { min: 1, max: 3, step: 1, why: 'the snake may cut this many cards from the middle' },
});

// ---------- tune.js's values ----------

// the module's exports, read from its text (it imports nothing), without the module cache
export async function valuesOf(text) {
  const dir = mkdtempSync(join(tmpdir(), 'tune-')), f = join(dir, 'tune.mjs');
  try { writeFileSync(f, text); return { ...(await import(pathToFileURL(f).href)) }; } finally { rmSync(dir, { recursive: true, force: true }); }
}

// every value by path: NAME, or NAME.key for an object of numbers
export function flatten(values) {
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'number')) for (const [j, x] of Object.entries(v)) out[`${k}.${j}`] = x;
    else out[k] = v;
  }
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// the paths whose values differ between two flattened sets
export function changes(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !same(a[k], b[k])).sort();
}

// null when v is allowed at path, else the reason
export function outOfRange(path, v) {
  const r = RANGES[path];
  if (!r) return `${path} is not one the loop may change`;
  if (r.choices) return r.choices.some(c => same(c, v)) ? null : `${path} = ${JSON.stringify(v)} is not one of its choices`;
  if (typeof v !== 'number' || !Number.isFinite(v)) return `${path} = ${JSON.stringify(v)} is not a number`;
  if (v < r.min || v > r.max) return `${path} = ${v} is outside ${r.min} to ${r.max}`;
  if (Number.isInteger(r.step) && !Number.isInteger(v)) return `${path} = ${v} is not a whole number`;
  return null;
}

// the candidate's text against the base's: exactly one value changed, in range, and no other line touched.
// { ok, path, from, to, reason }
export async function checkCandidate(baseText, candText) {
  let a, b;
  try { a = flatten(await valuesOf(baseText)); b = flatten(await valuesOf(candText)); } catch (e) { return { ok: false, reason: `the candidate does not load: ${e.message}` }; }
  const ch = changes(a, b);
  if (ch.length !== 1) return { ok: false, reason: ch.length ? `the candidate changes ${ch.length} values (${ch.join(', ')}); the loop changes one` : 'the candidate changes nothing' };
  const [path] = ch, bad = outOfRange(path, b[path]);
  if (bad) return { ok: false, path, reason: bad };
  const la = baseText.split('\n'), lb = candText.split('\n');
  const lines = la.length === lb.length ? la.filter((l, i) => l !== lb[i]).length : Infinity;
  if (lines !== 1) return { ok: false, path, reason: 'the candidate changes more of tune.js than the one value\'s line' };
  return { ok: true, path, from: a[path], to: b[path] };
}

// tune.js's text with one value set
export function setValue(text, path, v) {
  const [name, key] = path.split('.'), num = x => String(x);
  let re, put;
  if (key) { re = new RegExp(`(\\b${name} = Object\\.freeze\\(\\{[^}]*\\b${key}: )(-?[\\d.e+]+)`); put = m => m[1] + num(v); }
  else if (Array.isArray(v)) { re = new RegExp(`(\\b${name} = Object\\.freeze\\()\\[[^\\]]*\\]`); put = m => `${m[1]}[${v.join(', ')}]`; }
  else { re = new RegExp(`(\\b${name} = )(-?[\\d.e+]+)`); put = m => m[1] + num(v); }
  const all = text.match(new RegExp(re.source, 'g')) || [];
  if (all.length !== 1) throw new Error(`${path}: found ${all.length} places in tune.js, not one`);
  return text.replace(re, (...m) => put(m));
}

// ---------- the pins (bench/tune-pins.json) ----------

// the pins file's text: one value a line, so moving a pin changes one line
export function pinsText(pins) {
  const keys = Object.keys(RANGES).filter(k => k in pins.values);
  return '{\n "note": ' + JSON.stringify(pins.note) + ',\n "values": {\n' + keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(pins.values[k]).replace(/,/g, ', ')}`).join(',\n') + '\n }\n}\n';
}

// null when the pins are exactly tune.js's values of the paths the loop may change, else the reason
export function pinsMismatch(pins, flat) {
  const want = Object.keys(RANGES).filter(k => k in flat), have = Object.keys(pins.values || {});
  if (!same([...have].sort(), [...want].sort())) return `the pins name ${have.length} values, not the ${want.length} the loop may change`;
  const off = want.filter(k => !same(pins.values[k], flat[k]));
  return off.length ? `the pins of ${off.join(', ')} are not tune.js's values` : null;
}

// ---------- the week's proposal ----------

// the previous weeks' records (tune-*.json in each folder, and bench/results/), oldest first, without this week's
export function loadHistory(dirs, week) {
  const out = [];
  for (const d of [].concat(dirs || [])) {
    if (!existsSync(d)) continue;
    const walk = p => { for (const f of readdirSync(p, { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(p, f.name));
      else if (/^tune-.*\.json$/.test(f.name)) { try { const r = JSON.parse(readFileSync(join(p, f.name), 'utf8')); if (r && r.week && r.week !== week) out.push(r); } catch {} } } };
    walk(d);
  }
  const by = new Map(out.map(r => [r.week, r])); // one record a week, the last read
  return [...by.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}

// one change, picked with the week as the seed: a value not tried in the last four weeks, one or two steps from where
// it is (another choice for a list), inside its range. { path, from, to, why }
export function propose(values, week, history = []) {
  const flat = flatten(values), rnd = seeded(`layout tune ${week}`);
  const recent = new Set(history.slice(-4).map(r => r.proposal && r.proposal.path).filter(Boolean));
  let paths = Object.keys(RANGES).filter(p => p in flat);
  if (paths.some(p => !recent.has(p))) paths = paths.filter(p => !recent.has(p));
  for (let tries = 0; tries < 64; tries++) {
    const path = paths[Math.floor(rnd() * paths.length)], r = RANGES[path], from = flat[path];
    let to;
    if (r.choices) { const other = r.choices.filter(c => !same(c, from)); to = other[Math.floor(rnd() * other.length)]; }
    else { const k = (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.7 ? 1 : 2); to = Math.round((from + k * r.step) * 1e6) / 1e6; }
    if (to === undefined || same(to, from) || outOfRange(path, to)) continue;
    return { path, from, to, why: `${path} from ${JSON.stringify(from)} to ${JSON.stringify(to)}: ${r.why}` };
  }
  throw new Error('no value can move within its range');
}

// section 9.3: two weeks in a row with nothing kept (or stopped since) stop the loop until the maintainer restarts it
export function stopped(history) {
  const last = history.slice(-2);
  return last.length === 2 && last.every(r => r.status === 'nothing-kept' || r.status === 'stopped');
}

// section 9.3: the change the last record kept, when tune.js still has it: its revert is measured first this week
export function revertOf(history, flat) {
  const r = history.at(-1);
  if (!r || r.status !== 'kept' || !r.proposal) return null;
  const { path, from, to } = r.proposal;
  if (!(path in flat) || !same(flat[path], to) || outOfRange(path, from)) return null;
  return { path, from: to, to: from, why: `revert ${path} to ${JSON.stringify(from)}: week ${r.week} kept ${JSON.stringify(to)}`, revert: r.week };
}

// ---------- the rules ----------

// section 9.2: no view's hard rises, no view's score by more than 2 percent, the time within the gate (score.mjs's
// problems against the base), the fixed total down by at least 1 percent, the edit corpus no worse, and the held-out
// total not worse than the base's. A revert needs only the held-out total better and the fixed and edit rules but the 1
// percent. { keep, why: [text] }
export function decide({ fixed, edits, heldout }, { revert = false } = {}) {
  const why = [], ok = c => { if (!c[0]) why.push(c[1]); };
  const tot = r => r && r.total && r.base ? [r.total.score, r.base.score] : [NaN, NaN];
  ok([fixed && fixed.problems === 0, `fixed corpus: ${fixed ? fixed.problems : 'no'} rule(s) broken against the base (a view's hard or score, the total, or the time gate)`]);
  const [f, fb] = tot(fixed);
  if (!revert) ok([f <= fb * 0.99, `fixed corpus: total ${f} is not 1 percent under the base's ${fb}`]);
  ok([edits && edits.problems === 0, `edit corpus: ${edits ? edits.problems : 'no'} rule(s) broken against the base`]);
  const [h, hb] = tot(heldout);
  if (!heldout) why.push('held-out corpus: not measured (no LAYOUT_HELDOUT_SEED), so nothing is kept');
  else if (revert) ok([h < hb, `held-out corpus: total ${h} is not under ${hb}, so the kept change stays`]);
  else ok([h <= hb + 0.01 && heldout.total.hard <= heldout.base.hard, `held-out corpus: total ${h} (hard ${heldout.total.hard}) is worse than the base's ${hb} (hard ${heldout.base.hard})`]);
  return { keep: !why.length, why };
}

// ---------- measuring ----------

const defaultExec = (cmd, args, o = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 << 20, ...o }); return { status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || (r.error ? r.error.message : '') }; };

// the candidate's lib/umlimator-all.js, built from its tune.js in the working tree; tune.js and lib/ are put back after
export function buildCandidate(text, out, exec = defaultExec, root = ROOT) {
  const tune = join(root, TUNE), lib = join(root, 'lib'), was = readFileSync(tune, 'utf8');
  const keep = Object.fromEntries(readdirSync(lib).filter(f => f.endsWith('.js')).map(f => [f, readFileSync(join(lib, f))]));
  try {
    writeFileSync(tune, text);
    const r = exec('node', ['tools/build.mjs'], { cwd: root });
    if (r.status !== 0) throw new Error(`the build failed: ${r.stderr.slice(-400)}`);
    copyFileSync(join(lib, 'umlimator-all.js'), out);
  } finally { writeFileSync(tune, was); for (const [f, b] of Object.entries(keep)) writeFileSync(join(lib, f), b); }
}

// one corpus scored with the candidate's lib against the base's: score.mjs's --out, or null for a held-out corpus with
// no seed. The seed goes to the held-out run only.
export function scoreCorpus(corpus, { lib, base, runs = 5, week, exec = defaultExec, env = process.env, dir }) {
  const seed = env.LAYOUT_HELDOUT_SEED;
  if (corpus === 'heldout' && !seed) return null;
  const out = join(dir, `${corpus}.json`), { LAYOUT_HELDOUT_SEED, ...rest } = env;
  const args = ['bench/score.mjs', '--corpus', corpus, '--lib', lib, '--base-lib', base, '--runs', String(runs), '--out', out, ...(corpus === 'heldout' && week ? ['--week', week] : [])];
  const r = exec('node', args, { env: corpus === 'heldout' ? { ...rest, LAYOUT_HELDOUT_SEED: seed } : rest, stdio: corpus === 'heldout' ? ['ignore', 'ignore', 'ignore'] : undefined });
  if (r.status > 1 || !existsSync(out)) throw new Error(`bench/score.mjs --corpus ${corpus} failed (exit ${r.status})`);
  return JSON.parse(readFileSync(out, 'utf8'));
}

const brief = r => r && { score: r.total.score, hard: r.total.hard, baseScore: r.base && r.base.score, baseHard: r.base && r.base.hard, time: r.base && r.base.time, problems: r.problems, ...(r.targets ? { targets: r.targets } : {}) };

// the whole week. deps (for tests): exec, now, env, kill (a killSwitch result), root
export async function run(o, deps = {}) {
  const exec = deps.exec || defaultExec, env = deps.env || process.env, root = deps.root || ROOT, now = deps.now || new Date();
  const week = o.week || isoWeek(now), date = o.date || now.toISOString().slice(0, 10), owner = o.owner;
  if (!owner) throw new Error('run needs --owner');
  const record = { week, date, status: null, proposal: null, fixed: null, edits: null, heldout: null, decision: [] };
  const done = r => { if (o.record) { mkdirSync(dirname(resolve(o.record)), { recursive: true }); writeFileSync(o.record, JSON.stringify(r, null, 1) + '\n'); } return r; };
  const kill = deps.kill || killSwitch({ repo: root, ref: o.ref || 'origin/main' });
  if (kill.stopped) return done({ ...record, status: 'refused', decision: [kill.reason] });
  const lease = leasePath({ file: o.lease }, env), leased = take(lease, owner, { now });
  if (!leased.ok) return done({ ...record, status: 'refused', decision: [`lease: ${leased.reason}`] });
  try {
    const history = loadHistory([...[].concat(o.history || []), join(root, 'bench/results')], week);
    if (!o.restart && stopped(history)) return done({ ...record, status: 'stopped', decision: ['two weeks in a row kept nothing: the loop stops until the maintainer runs it with --restart (section 9.3)'] });
    const baseText = readFileSync(join(root, TUNE), 'utf8'), flat = flatten(await valuesOf(baseText));
    const dir = mkdtempSync(join(tmpdir(), 'tune-loop-')), base = join(dir, 'base-all.mjs');
    copyFileSync(join(root, 'lib/umlimator-all.js'), base);
    const tryOne = async p => {
      const text = setValue(baseText, p.path, p.to), c = await checkCandidate(baseText, text);
      if (!c.ok) throw new Error(`the proposal is refused: ${c.reason}`);
      const lib = join(dir, `cand-${p.path}.mjs`); buildCandidate(text, lib, exec, root);
      const m = {};
      for (const corpus of ['fixed', 'edits', 'heldout']) { renew(lease, owner, { now: deps.now || new Date() }); m[corpus] = scoreCorpus(corpus, { lib, base, runs: o.runs || 5, week, exec, env, dir }); }
      return { text, m, d: decide(m, { revert: !!p.revert }) };
    };
    let p = revertOf(history, flat), r = null;
    if (p) { r = await tryOne(p); if (!r.d.keep) { record.decision.push(`revert of week ${p.revert}'s change not needed: ${r.d.why.join('; ')}`); p = null; } }
    if (!p) { p = propose(await valuesOf(baseText), week, history); r = await tryOne(p); }
    Object.assign(record, { proposal: { path: p.path, from: p.from, to: p.to, why: p.why, ...(p.revert ? { revert: p.revert } : {}) },
      fixed: brief(r.m.fixed), edits: brief(r.m.edits), heldout: r.m.heldout && { score: r.m.heldout.total.score, hard: r.m.heldout.total.hard, baseScore: r.m.heldout.base.score, baseHard: r.m.heldout.base.hard } });
    record.status = r.d.keep ? (p.revert ? 'reverted' : 'kept') : 'nothing-kept';
    record.decision.push(...(r.d.keep ? [p.revert ? 'the revert is kept: the held-out total is better without the change' : 'kept: every rule of section 9.2 holds'] : r.d.why));
    if (r.d.keep && o.candidateOut) { mkdirSync(dirname(resolve(o.candidateOut)), { recursive: true }); writeFileSync(o.candidateOut, r.text); }
    rmSync(dir, { recursive: true, force: true });
    return done(record);
  } finally { release(lease, owner); }
}

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

// ---------- the pull request ----------

const fmt = x => (x == null ? '-' : typeof x === 'number' ? String(Math.round(x * 100) / 100) : String(x));
export function prBody(rec) {
  const p = rec.proposal, row = (name, r) => r ? `| ${name} | ${fmt(r.baseScore)} | ${fmt(r.score)} | ${fmt(r.baseHard)} | ${fmt(r.hard)} | ${r.time != null ? fmt(r.time) : '-'} |` : `| ${name} | - | - | - | - | - |`;
  return [
    `The weekly layout loop (docs/diagrams/notes/layout-flow.md section 9), week ${rec.week}: ${p.why}.`, '',
    '| Corpus | Base score | New score | Base hard | New hard | Time vs base |', '| --- | --- | --- | --- | --- | --- |',
    row('fixed', rec.fixed), row('edits', rec.edits), row('held-out (totals only)', rec.heldout), '',
    rec.edits && rec.edits.targets ? `Edit corpus, section 8.4: untouched cards kept their cells in ${rec.edits.targets.still} of ${rec.edits.targets.pairs} pairs; ${rec.edits.targets.hardAboveFresh} pairs with more hard issues than fresh.` : '', '',
    `Decision: ${rec.decision.join('; ')}.`, '',
    `This changes only src/layout/tune.js (${p.path}), its pin in bench/tune-pins.json (${JSON.stringify(p.from)} to ${JSON.stringify(p.to)}), lib/ rebuilt from it, and bench/results/tune-${rec.date}.json. tests/tune.test.mjs holds tune.js to the pins, so approving this pull request approves the pin's move (section 9.4); the loop never edits a test. If a test that draws a picture fails (the node tests' bench/expected.json check, or one that pins a layout), this change moves pictures, and the maintainer decides whether to update it with the reason.`, '',
    'The check and layout-score workflows were started on this branch by hand (workflow_dispatch), since a pull request opened with the workflow\'s token starts none; their checks show on the head commit. The held-out corpus is not run again here: the totals above are the loop\'s.', '',
    'Opened by tools/evolve/tune-loop.mjs. The loop never merges: the maintainer approves or closes.',
  ].join('\n');
}

export async function publish(o, deps = {}) {
  const exec = deps.exec || defaultExec, root = deps.root || ROOT, dry = !!o.dryRun;
  const rec = JSON.parse(readFileSync(o.record, 'utf8')), text = readFileSync(o.candidate, 'utf8');
  if (rec.status !== 'kept' && rec.status !== 'reverted') throw new Error(`the record's status is ${rec.status}: nothing to publish`);
  const baseText = readFileSync(join(root, TUNE), 'utf8'), c = await checkCandidate(baseText, text);
  if (!c.ok) throw new Error(`the candidate is refused: ${c.reason}`);
  if (c.path !== rec.proposal.path || !same(c.to, rec.proposal.to)) throw new Error('the candidate is not the record\'s proposal');
  const pins = JSON.parse(readFileSync(join(root, PINS), 'utf8')), off = pinsMismatch(pins, flatten(await valuesOf(baseText)));
  if (off) throw new Error(`${PINS} does not match ${TUNE} before the change: ${off}`);
  const newPins = pinsText({ ...pins, values: { ...pins.values, [c.path]: c.to } });
  const branch = `layout-tune/${rec.week}`, base = o.base || BASE_BRANCH, recFile = `bench/results/tune-${rec.date}.json`;
  const title = `Layout loop ${rec.week}: ${rec.status === 'reverted' ? 'revert ' : ''}${rec.proposal.path} ${JSON.stringify(rec.proposal.from)} to ${JSON.stringify(rec.proposal.to)}`;
  const steps = [
    ['git', ['switch', '-c', branch]],
    ['node', ['tools/build.mjs']],
    ['git', ['add', TUNE, PINS, 'lib', recFile]],
    ['git', ['-c', `user.name=${o.name || 'github-actions[bot]'}`, '-c', `user.email=${o.email || '41898282+github-actions[bot]@users.noreply.github.com'}`, 'commit', '-m', title]],
    ['git', ['push', 'origin', branch]],
    ['gh', ['pr', 'create', '--base', base, '--head', branch, '--title', title, '--body', prBody(rec)]],
  ];
  // a pull request opened with the workflow's token starts no workflow, but a workflow_dispatch does: each CI workflow is
  // started on the branch, and its checks land on the branch's head commit, which is the pull request's
  const ci = CI.map(([wf, inputs]) => ['gh', ['workflow', 'run', wf, '--ref', branch, ...inputs]]);
  if (dry) return { branch, title, steps, ci };
  writeFileSync(join(root, TUNE), text);
  writeFileSync(join(root, PINS), newPins);
  mkdirSync(join(root, 'bench/results'), { recursive: true });
  writeFileSync(join(root, recFile), JSON.stringify(rec, null, 1) + '\n');
  const out = [];
  for (const [cmd, args] of steps) {
    const r = exec(cmd, args, { cwd: root });
    if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${r.stderr.slice(-400)}`);
    out.push(r.stdout.trim());
  }
  // the pull request is open by now: a workflow that does not start is reported, and the maintainer starts it by hand
  const notStarted = [];
  for (const [cmd, args] of ci) {
    const r = exec(cmd, args, { cwd: root });
    if (r.status !== 0) notStarted.push(`${args[2]}: ${r.stderr.trim().slice(-200)}`);
  }
  return { branch, title, url: out.at(-1), notStarted };
}

// ---------- the command line ----------

export async function main(argv = process.argv.slice(2), deps = {}) {
  const print = deps.print || (s => process.stdout.write(s + '\n'));
  try {
    const { flags, rest } = parseArgs(argv, ['restart', 'dry-run'], ['tune', 'week', 'candidate', 'owner', 'date', 'history', 'record', 'candidate-out', 'runs', 'lease', 'ref', 'base']), cmd = rest[0];
    const str = k => (typeof flags[k] === 'string' ? flags[k] : undefined);
    const hist = argv.flatMap((a, i) => (a === '--history' && argv[i + 1] ? [argv[i + 1]] : a.startsWith('--history=') ? [a.slice(10)] : []));
    if (cmd === 'propose') {
      const text = readFileSync(join(deps.root || ROOT, str('tune') || TUNE), 'utf8'), week = str('week') || isoWeek(new Date());
      print(JSON.stringify(propose(await valuesOf(text), week, loadHistory(hist, week)), null, 1));
      return 0;
    }
    if (cmd === 'check') {
      if (!str('candidate')) throw new Error('check needs --candidate');
      const c = await checkCandidate(readFileSync(join(deps.root || ROOT, str('tune') || TUNE), 'utf8'), readFileSync(str('candidate'), 'utf8'));
      print(JSON.stringify(c, null, 1));
      return c.ok ? 0 : 1;
    }
    if (cmd === 'run') {
      const r = await run({ owner: str('owner'), week: str('week'), date: str('date'), history: hist, record: str('record'), candidateOut: str('candidate-out'),
        runs: flags.runs ? Number(flags.runs) : 5, restart: flags.restart === true, lease: str('lease'), ref: str('ref') }, deps);
      print(`${r.week}: ${r.status}${r.proposal ? ` (${r.proposal.why})` : ''}\n  ${r.decision.join('\n  ')}`);
      return r.status === 'kept' || r.status === 'reverted' ? 0 : 1;
    }
    if (cmd === 'publish') {
      if (!str('record') || !str('candidate')) throw new Error('publish needs --record and --candidate');
      const r = await publish({ record: str('record'), candidate: str('candidate'), base: str('base'), dryRun: flags['dry-run'] === true }, deps);
      if (r.steps) { print(JSON.stringify(r, null, 1)); return 0; }
      print(`opened ${r.url || r.branch}`);
      for (const n of r.notStarted) print(`::warning::not started on ${r.branch}, run it by hand: ${n}`);
      return r.notStarted.length ? 1 : 0;
    }
    throw new Error(`usage: tune-loop.mjs propose|check|run|publish (see the file's header)${cmd ? ` (not ${cmd})` : ''}`);
  } catch (e) {
    process.stderr.write(`tune-loop: ${e.message}\n`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await main();
