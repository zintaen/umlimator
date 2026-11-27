#!/usr/bin/env node
// Mutation testing: does a test fail when the code it covers is wrong? This makes small wrong versions of source files
// (mutants), one at a time, runs the test files related to each, and reports the share of mutants a test killed (failed
// on) and every survivor with its place. A survivor is a change no test notices: a missing assertion or a dead line.
//
// The mutations are simple and keep the code parsing: a comparison flipped (< to >=, === to !==), && and || swapped,
// + and - or * and / swapped, a number constant changed (n to n + 1, 1 to 0), true and false swapped, and an expression
// statement (a call or an assignment) dropped. Strings, template literals, regular expressions and comments are never
// touched, nor a line that holds "mutate: skip".
//
// All the work is in a temporary copy of the repository, removed at the end: the tree is never changed. The order of the
// mutants is a shuffle by --seed, so one seed runs the same mutants in the same order; --budget stops starting new ones
// after so many seconds and says how many were left.
//
//   node tools/evolve/mutate.mjs src/core/apply.js                     the test files that import it, every mutant
//   node tools/evolve/mutate.mjs src/core/apply.js src/core/history.js --tests tests/apply.test.mjs --max 40 --seed 7
//   options: --tests a,b (else every tests/*.test.mjs that names the file), --seed n (1), --max n (all),
//            --budget time (600 seconds; or 90s, 10m, 1h), --timeout time per test file (else 5 x the clean run, at least
//            30 s), --timed (run the timed tests too), --json (the report as JSON), --root dir (the repository; default this one)
// Exit: 0 when it ran, 1 when the tests fail before any mutation (nothing to measure), 2 on a usage error.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, significant, lineCol } from '../jsscan.mjs';
import { duration } from './args.mjs';
import { isMain } from '../main.mjs';

const FLIP = { '<': '>=', '>': '<=', '<=': '>', '>=': '<', '===': '!==', '!==': '===', '==': '!=', '!=': '==' };
const SWAP = { '&&': '||', '||': '&&', '+': '-', '-': '+', '*': '/', '/': '*' };
const KIND = { '<': 'comparison', '>': 'comparison', '<=': 'comparison', '>=': 'comparison', '===': 'comparison', '!==': 'comparison',
  '==': 'comparison', '!=': 'comparison', '&&': 'logical', '||': 'logical', '+': 'arithmetic', '-': 'arithmetic', '*': 'arithmetic', '/': 'arithmetic' };
// a token after which + - * / are binary: it ends an operand
const ENDS_OPERAND = t => t && (t.type === 'id' || t.type === 'num' || t.type === 'str' || t.type === 'tpl' || t.type === 're' || [')', ']', '}'].includes(t.text));
const NOT_OPERAND = new Set(['function', 'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'else', 'yield', 'await', 'do']);
// a statement that starts with one of these is no expression statement
const KEYWORDS = new Set(['const', 'let', 'var', 'function', 'class', 'return', 'if', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
  'continue', 'throw', 'try', 'catch', 'finally', 'else', 'import', 'export', 'async', 'yield', 'await', 'debugger', 'with']);

// every mutant of a source: [{ start, end, from, to, kind, line, col }], in source order; to replaces src[start, end)
export function mutants(src) {
  const toks = tokenize(src), sig = significant(toks), out = [];
  const skipLines = new Set();
  src.split('\n').forEach((l, i) => { if (l.includes('mutate: skip')) skipLines.add(i + 1); });
  const push = (start, end, to, kind) => {
    const { line, col } = lineCol(src, start);
    if (!skipLines.has(line)) out.push({ start, end, from: src.slice(start, end), to, kind, line, col });
  };
  // the depth of brackets before each significant token, and whether each { opens a block (not an object literal)
  const blockOpen = [];
  for (let j = 0; j < sig.length; j++) {
    const t = sig[j], prev = sig[j - 1];
    if (t.type === 'punct' && t.text === '{') blockOpen.push(!prev || [')', '{', '}', ';', '=>'].includes(prev.text) || ['else', 'try', 'finally', 'do'].includes(prev.text));
    if (t.type === 'punct' && (FLIP[t.text] || SWAP[t.text])) {
      if (SWAP[t.text] && '+-*/'.includes(t.text) && (!ENDS_OPERAND(prev) || (prev.type === 'id' && NOT_OPERAND.has(prev.text)))) continue;
      push(t.start, t.end, FLIP[t.text] || SWAP[t.text], KIND[t.text]);
    } else if (t.type === 'num' && !(prev && prev.text === '.')) {
      const v = Number(t.text.replace(/_/g, ''));
      if (!/^\d+(\.\d+)?$/.test(t.text) || !Number.isFinite(v)) continue; // hex, exponents and bigints stay
      push(t.start, t.end, v === 1 ? '0' : String(v + 1), 'constant');
    } else if (t.type === 'id' && (t.text === 'true' || t.text === 'false') && !(prev && (prev.text === '.' || prev.text === '?.'))) {
      push(t.start, t.end, t.text === 'true' ? 'false' : 'true', 'constant');
    }
  }
  // expression statements: from a token right after { ; or } at block level, to the ; that ends it at the same depth
  let depth = 0;
  const stack = []; // for each open bracket: is it a block
  let b = 0;
  for (let j = 0; j < sig.length; j++) {
    const t = sig[j];
    if (t.type === 'punct' && t.text === '{') { stack.push(blockOpen[b++]); depth++; continue; }
    if (t.type === 'punct' && (t.text === '(' || t.text === '[')) { stack.push(false); depth++; continue; }
    if (t.type === 'punct' && (t.text === '}' || t.text === ')' || t.text === ']')) { stack.pop(); depth--; continue; }
    if (!stack.length || !stack[stack.length - 1]) continue; // only inside a block, not at the top level or in an object
    const prev = sig[j - 1];
    if (!prev || !['{', ';', '}'].includes(prev.text) || t.type !== 'id' || KEYWORDS.has(t.text)) continue;
    if (sig[j + 1]?.text === ':') continue; // a label
    let k = j, d = 0, ok = false;
    for (; k < sig.length; k++) {
      const x = sig[k];
      if (x.type !== 'punct') continue;
      if ('([{'.includes(x.text)) d++;
      else if (')]}'.includes(x.text)) { if (--d < 0) break; }
      else if (x.text === ';' && d === 0) { ok = true; break; }
    }
    if (!ok) continue;
    const text = src.slice(t.start, sig[k].start);
    if (!/[=(]|\+\+|--/.test(text)) continue; // a bare name does nothing to drop
    push(t.start, sig[k].start, 'void 0', 'statement');
  }
  return out.sort((x, y) => x.start - y.start || x.end - y.end);
}

export const applyMutant = (src, m) => src.slice(0, m.start) + m.to + src.slice(m.end);

// a seeded shuffle (mulberry32 and Fisher-Yates)
export function shuffle(list, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// the test files under tests/ that name a source by its path from the repository (src/core/apply.js or core/apply.js),
// the one named after the source (tests/apply.test.mjs) first, as the likeliest to fail on a mutant
export function relatedTests(root, file) {
  const dir = join(root, 'tests');
  if (!existsSync(dir)) return [];
  const short = file.replace(/^src\//, ''), own = `${basename(file).replace(/\.[cm]?js$/, '')}.test.mjs`;
  const names = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort().filter(f => {
    const t = readFileSync(join(dir, f), 'utf8');
    return [file, short].some(n => t.includes(`/${n}'`) || t.includes(`/${n}"`));
  });
  return [...names.filter(f => f === own), ...names.filter(f => f !== own)].map(f => `tests/${f}`);
}

// what the copy leaves out: big, generated or other worktrees, and the loop's local state (the lease, the fuzz findings),
// none of which a test reads; the tracked files of .evolve/ (the pinned strategy, the feedback file) are copied
const SKIP_NAMES = new Set(['.git', 'node_modules', '.claude']), SKIP_PATHS = new Set(['docs/.vitepress/dist', 'docs/.vitepress/cache', 'bench/results', '.evolve/fuzz', '.evolve/lease.json', '.evolve/lease.json.lock']);
export const copied = (root, s) => { const r = relative(root, s).split(sep).join('/'); return !r || (!r.split('/').some(p => SKIP_NAMES.has(p)) && !SKIP_PATHS.has(r)); };

// the environment for a test run: without NODE_TEST_CONTEXT, which a run started from inside node --test inherits and which
// makes the child report to that parent and exit 0 whatever its tests do
const { NODE_TEST_CONTEXT, ...CLEAN_ENV } = process.env;

// run test files one at a time, stopping at the first that fails: a mutant needs only one test to kill it
async function runAll(cwd, tests, opts) {
  let ms = 0;
  for (const t of tests) {
    const r = await run(cwd, [t], opts);
    ms += r.ms;
    if (r.code !== 0 || r.timedOut) return { ...r, ms, by: t };
  }
  return { code: 0, timedOut: false, ms };
}

function run(cwd, tests, { timeoutMs, timed }) {
  const args = ['--test', '--test-reporter=dot', ...(timed ? [] : ['--test-skip-pattern=\\(timed\\)']), ...tests];
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd, env: CLEAN_ENV, stdio: ['ignore', 'ignore', 'ignore'], detached: process.platform !== 'win32' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, timeoutMs);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, timedOut, ms: Date.now() - started }); });
  });
}

function build(cwd) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['tools/build.mjs'], { cwd, stdio: 'ignore' });
    child.on('exit', code => resolve(code === 0));
  });
}

// run the mutants of files against their tests; returns the report
export async function mutate(root, files, opts = {}) {
  const { seed = 1, max = Infinity, budgetMs = 600_000, timed = false, log = () => {} } = opts;
  const testsOf = new Map(files.map(f => [f, opts.tests?.length ? opts.tests : relatedTests(root, f)]));
  for (const [f, t] of testsOf) {
    if (!existsSync(join(root, f))) throw new Error(`${f}: no such file`);
    if (!t.length) throw new Error(`${f}: no test file names it; pass --tests`);
  }
  const all = files.flatMap(f => mutants(readFileSync(join(root, f), 'utf8')).map(m => ({ file: f, ...m })));
  const chosen = shuffle(all, seed).slice(0, max);
  const allTests = [...new Set([...testsOf.values()].flat())];
  const needsBuild = existsSync(join(root, 'tools/build.mjs')) && existsSync(join(root, 'lib'))
    && allTests.some(t => /\/lib\//.test(readFileSync(join(root, t), 'utf8')));
  const work = mkdtempSync(join(tmpdir(), 'umlimator-mutate-'));
  const report = { seed, files, tests: Object.fromEntries(testsOf), mutants: all.length, chosen: chosen.length, run: 0, killed: 0, survived: 0, timedOut: 0, notRun: 0, score: null, survivors: [], baselineMs: 0 };
  const started = Date.now();
  const cleanup = () => rmSync(work, { recursive: true, force: true });
  const onSignal = () => { cleanup(); process.exit(130); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    cpSync(root, work, { recursive: true, filter: s => copied(root, s) });
    if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'), 'dir'); // read only by the tests
    if (needsBuild && !(await build(work))) { report.error = 'npm run build fails before any mutation: nothing to measure'; return report; }
    const base = await run(work, allTests, { timeoutMs: Math.max(budgetMs, 600_000), timed });
    report.baselineMs = base.ms;
    if (base.code !== 0) { report.error = `the tests fail before any mutation (${allTests.join(', ')}): nothing to measure`; return report; }
    const timeoutMs = opts.timeoutMs ?? Math.max(30_000, 5 * base.ms);
    const original = new Map(files.map(f => [f, readFileSync(join(work, f), 'utf8')]));
    for (const m of chosen) {
      if (Date.now() - started >= budgetMs) { report.notRun = chosen.length - report.run; break; }
      writeFileSync(join(work, m.file), applyMutant(original.get(m.file), m));
      let result;
      if (needsBuild && !(await build(work))) result = { code: 1, timedOut: false };
      else result = await runAll(work, testsOf.get(m.file), { timeoutMs, timed });
      writeFileSync(join(work, m.file), original.get(m.file));
      report.run++;
      const where = `${m.file}:${m.line}:${m.col}`;
      if (result.timedOut) { report.timedOut++; report.killed++; log(`T ${where} ${m.from} -> ${m.to} (${result.by ?? 'the build'})`); }
      else if (result.code !== 0) { report.killed++; log(`. ${where} ${m.from} -> ${m.to} (${result.by ?? 'the build'})`); }
      else { report.survived++; report.survivors.push({ file: m.file, line: m.line, col: m.col, kind: m.kind, from: m.from, to: m.to }); log(`S ${where} ${m.kind}: ${m.from} -> ${m.to}`); }
    }
    report.score = report.run ? Math.round((1000 * report.killed) / report.run) / 1000 : null;
    return report;
  } finally {
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
    cleanup();
  }
}

export function say(r) {
  if (r.error) return r.error;
  const lines = [`${r.files.join(', ')}: ${r.mutants} mutants, ${r.chosen} chosen (seed ${r.seed}), ${r.run} run; the clean run of ${new Set(Object.values(r.tests).flat()).size} test files took ${(r.baselineMs / 1000).toFixed(1)} s`,
    `killed ${r.killed} of ${r.run}${r.run ? ` (${Math.round(r.score * 100)}%)` : ''}${r.timedOut ? `, ${r.timedOut} by a timeout` : ''}; ${r.survived} survived${r.notRun ? `; ${r.notRun} not run (the budget ran out)` : ''}`];
  for (const s of r.survivors) lines.push(`  survived ${s.file}:${s.line}:${s.col} ${s.kind}: ${JSON.stringify(s.from.length > 60 ? s.from.slice(0, 57) + '...' : s.from)} -> ${JSON.stringify(s.to)}`);
  return lines.join('\n');
}

export function parse(argv) {
  const o = { files: [], tests: [], seed: 1, max: Infinity, budgetMs: 600_000, timed: false, json: false, root: join(dirname(fileURLToPath(import.meta.url)), '../..') };
  // a bare number is seconds; else 90s, 10m or 1h
  const seconds = (name, v) => { try { return /^\d+(\.\d+)?$/.test(v ?? '') ? Number(v) * 1000 : duration(v ?? '', NaN); } catch { throw new Error(`${name} needs a time such as 600, 90s or 10m`); } };
  const num = (name, v, min) => { const n = Number(v); if (!Number.isFinite(n) || n < min || v === undefined || v === '') throw new Error(`${name} needs a number of at least ${min}`); return n; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tests') o.tests = (argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--seed') o.seed = num(a, argv[++i], 0);
    else if (a === '--max') o.max = num(a, argv[++i], 1);
    else if (a === '--budget') o.budgetMs = seconds(a, argv[++i]);
    else if (a === '--timeout') o.timeoutMs = seconds(a, argv[++i]) || 1000;
    else if (a === '--timed') o.timed = true;
    else if (a === '--json') o.json = true;
    else if (a === '--root') o.root = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.files.push(a);
  }
  if (!o.files.length) throw new Error('name at least one source file, such as src/core/apply.js');
  return o;
}

async function main(argv) {
  let o;
  try { o = parse(argv); } catch (e) { console.error(`${e.message}\nusage: node tools/evolve/mutate.mjs src/x.js [--tests tests/x.test.mjs] [--seed n] [--max n] [--budget s] [--json]`); return 2; }
  let r;
  try { r = await mutate(o.root, o.files, { ...o, log: o.json ? () => {} : l => console.error(l) }); } catch (e) { console.error(e.message); return 2; }
  console.log(o.json ? JSON.stringify(r, null, 2) : say(r));
  return r.error ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
