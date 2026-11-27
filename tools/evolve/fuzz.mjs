#!/usr/bin/env node
// The nightly fuzz run (auto-evolve strategy, section 5): mutates the importers' own fixtures for a time budget, and
// shrinks each crash, hang or invalid model it finds to a small input, written with a repro command to a findings
// folder for a triage agent to read.
//
//   node tools/evolve/fuzz.mjs [--budget 60s] [--targets a,b] [--seed <text>] [--hang 5s] [--shrink 30s] [--out .evolve/fuzz]
//                              [--scripts <folder>[,<folder>]] [--targets-module <file>] [--list]
//   node tools/evolve/fuzz.mjs --repro <file> --target <name> [--hang 5s] [--targets-module <file>]
//
// Targets (fuzz-targets.mjs, --list prints them): the Structurizr JSON, Mermaid and BPMN XML readers in Node, and
// umlimator_import.py's Structurizr DSL, C4-PlantUML, Mermaid map and cloud (compose, Kubernetes) readers. The budget is
// shared evenly by the targets that can run here (bpmn needs UMLIMATOR_BPMN_MODDLE, the Python ones python3) and by the
// fuzz scripts found: any *fuzz* or *hostile* .mjs, .js or .py file under tests/ (not a *.test.mjs, which the suite
// runs) and under each --scripts folder (else each folder in $EVOLVE_FUZZ_SCRIPTS, comma separated), run with node or python3 for its share of the budget, its output kept as a log.
//
// The whole run, shrinking included, stays within --budget (give or take one --hang): each target and script gets an
// even share of the time left when it starts. Each input runs in a worker thread, stopped when it passes --hang: a hang. Findings are told apart by a signature
// (target, kind, the message with numbers and quoted text left out, the innermost source frame); each new one is shrunk
// (lines, then characters; for JSON, keys and items) while it keeps its signature, for at most --shrink, then written
// as <target>-<hash>.<ext> with <target>-<hash>.finding.json (kind, message, stack, seed, repro command). A signature already in
// the folder is not written again. The seed (today's date, UTC, by default) makes a run repeatable.
//
// Exit 0: no new finding; 1: new findings (listed); 2: a usage error. --repro exits 1 when the input still fails.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { resolve, join, relative, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, duration, seeded } from './args.mjs';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const ROOT = resolve(HERE, '../..');
export const DEFAULT_MODULE = join(HERE, 'fuzz-targets.mjs');

// ---------- running one input in a worker ----------

export class Runner {
  // grace: how long past hangMs the thread may take before it counts as hung (a Python target's check times its own
  // child out at hangMs, so the thread gets a second more by default)
  constructor(module, target, hangMs, grace = 1000) { Object.assign(this, { module, target, hangMs, grace, worker: null, ready: null, seq: 0 }); }
  start() {
    if (this.ready) return this.ready;
    const w = new Worker(join(HERE, 'fuzz-worker.mjs'), { workerData: { module: this.module, target: this.target, hangMs: this.hangMs } });
    this.worker = w;
    w.unref();
    this.ready = new Promise((ok, fail) => {
      const on = m => { if (m?.ready) { w.off('message', on); ok(); } };
      w.on('message', on);
      w.once('error', fail);
    });
    return this.ready;
  }
  async stop() { const w = this.worker; this.worker = this.ready = null; if (w) await w.terminate(); }
  async run(input) {
    await this.start();
    const w = this.worker, id = ++this.seq;
    const r = await new Promise(done => {
      const timer = setTimeout(() => done({ ok: false, kind: 'hang', message: `no answer in ${this.hangMs} ms`, stack: '' }), this.hangMs + this.grace);
      const off = () => { clearTimeout(timer); w.off('message', on); w.off('error', err); w.off('exit', exit); };
      const on = m => { if (m.id === id) { off(); done(m); } };
      const err = e => { off(); done({ ok: false, kind: 'crash', message: String(e?.message || e), stack: String(e?.stack || '') }); };
      const exit = code => { off(); done({ ok: false, kind: 'crash', message: `the worker exited (${code})`, stack: '' }); };
      w.on('message', on); w.once('error', err); w.once('exit', exit);
      w.postMessage({ id, input });
    });
    if (!r.ok && (r.kind === 'hang' || /worker exited/.test(r.message))) await this.stop();
    return r;
  }
}

// ---------- telling findings apart ----------

export function signature(target, r) {
  const msg = String(r.message || '').split('\n')[0].replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '_').replace(/\d+/g, 'N').slice(0, 160);
  const lines = String(r.stack || '').split('\n');
  const js = lines.filter(l => /^\s*at /.test(l) && /\/(src|lib)\//.test(l)).map(l => (/\/((?:src|lib)\/[^:)]+)/.exec(l)?.[1] || '') + ' ' + (/at ([\w$.<>]+) /.exec(l)?.[1] || ''));
  const py = lines.filter(l => /File ".*umlimator_import\.py", line \d+, in /.test(l)).map(l => 'umlimator_import.py ' + /in (\S+)/.exec(l)[1]);
  const frame = (js[0] || py.at(-1) || '').trim();
  return `${target}|${r.kind}|${msg}|${frame}`;
}

// ---------- mutation ----------

const PROTO = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', 'prototype'];
const JUNK = ['"', "'", '`', '<', '>', '&', '#', ';', ':', '{', '}', '(', ')', '[', ']', '|', '%%', '-->', '..', '\\', '\t', ' ', '0', '-1', 'end', 'é', '\u0000', '\r', '<b>x</b>', '&lt;', '\u{1F600}'];
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

export function mutateText(text, rnd) {
  const lines = text.split('\n');
  const k = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < k; i++) {
    const op = Math.floor(rnd() * 8), j = Math.floor(rnd() * lines.length), s = lines[j] ?? '', p = Math.floor(rnd() * (s.length + 1));
    if (op === 0) lines.splice(j, 1);
    else if (op === 1) lines.splice(j, 0, lines[Math.floor(rnd() * lines.length)] ?? '');
    else if (op === 2) { const w = s.match(/[A-Za-z_]\w*/g); if (w) lines[j] = s.replaceAll(pick(w, rnd), pick(PROTO, rnd)); }
    else if (op === 3) lines[j] = s.slice(0, p) + pick(JUNK, rnd) + s.slice(p);
    else if (op === 4) lines[j] = s.slice(0, p) + s.slice(p + 1 + Math.floor(rnd() * 3));
    else if (op === 5) { const a = Math.floor(rnd() * lines.length); [lines[a], lines[j]] = [lines[j], lines[a]]; }
    else if (op === 6) lines.splice(j, 0, ...Array(20 + Math.floor(rnd() * 300)).fill(s)); // many of one line: hangs live here
    else lines[j] = s.slice(0, p) + pick(['(', '[', '{', '"', '<'], rnd).repeat(50 + Math.floor(rnd() * 2000)) + s.slice(p); // deep or unclosed
  }
  return lines.join('\n');
}

const HOSTILE = () => ['', null, 0, -1, 1e308, true, [], {}, 'x'.repeat(5000), '__proto__', 'constructor', '<b onx="1">&amp;</b>', JSON.parse('['.repeat(500) + ']'.repeat(500))];

// every [parent, key] of a JSON value, at most `cap`
function slots(x, cap = 5000) {
  const out = [], walk = v => {
    if (out.length >= cap || !v || typeof v !== 'object') return;
    for (const k of Object.keys(v)) { out.push([v, k]); walk(v[k]); }
  };
  walk(x);
  return out;
}
const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

export function mutateJson(text, rnd) {
  let x;
  try { x = JSON.parse(text); } catch { return mutateText(text, rnd); }
  const k = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < k; i++) {
    const all = slots(x);
    if (!all.length) break;
    const [o, key] = pick(all, rnd), op = Math.floor(rnd() * 5);
    if (op === 0) { if (Array.isArray(o)) o.splice(Number(key), 1); else delete o[key]; }
    else if (op === 1) put(o, key, pick(HOSTILE(), rnd));
    else if (op === 2 && Array.isArray(o)) o.splice(Number(key), 0, ...Array(1 + Math.floor(rnd() * 50)).fill(o[key]));
    else if (op === 3 && !Array.isArray(o)) put(o, pick(PROTO, rnd), structuredClone(o[key]));
    else if (typeof o[key] === 'string') put(o, key, mutateText(o[key], rnd));
    else { const other = pick(all, rnd); put(o, key, structuredClone(other[0][other[1]] ?? null)); }
  }
  return JSON.stringify(x, null, 1);
}

// ---------- shrinking ----------

// ddmin over parts: drop chunks while `still` holds
async function ddmin(parts, join, still, budget) {
  let n = 2;
  while (parts.length >= 2 && budget.ok()) {
    const size = Math.ceil(parts.length / n);
    let cut = false;
    for (let i = 0; i < parts.length && budget.ok(); i += size) {
      const rest = parts.slice(0, i).concat(parts.slice(i + size));
      if (rest.length && await still(join(rest))) { parts = rest; n = Math.max(n - 1, 2); cut = true; break; }
    }
    if (!cut) { if (n >= parts.length) break; n = Math.min(parts.length, n * 2); }
  }
  return parts;
}

export async function shrinkText(text, still, budget) {
  let lines = await ddmin(text.split('\n'), p => p.join('\n'), still, budget);
  let out = lines.join('\n');
  if (out.length <= 4000) out = (await ddmin([...out], p => p.join(''), still, budget)).join('');
  return out;
}

export async function shrinkJson(text, still, budget) {
  let x;
  try { x = JSON.parse(text); } catch { return shrinkText(text, still, budget); }
  const show = v => JSON.stringify(v, null, 1);
  for (let changed = true; changed && budget.ok();) {
    changed = false;
    for (const [o, key] of slots(x).reverse()) { // deepest last-listed first: a removed parent takes its slots with it
      if (!budget.ok()) break;
      if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
      const was = o[key], arr = Array.isArray(o);
      if (arr) o.splice(Number(key), 1); else delete o[key];
      if (await still(show(x))) { changed = true; continue; }
      if (arr) o.splice(Number(key), 0, was); else put(o, key, was);
      if (typeof was === 'string' && was.length > 1) {
        put(o, key, was.slice(0, Math.ceil(was.length / 2)));
        if (await still(show(x))) { changed = true; continue; }
        put(o, key, was);
      }
    }
  }
  return show(x);
}

// ---------- the run ----------

const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);
const rel = p => relative(process.cwd(), p) || '.';
const q = s => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

export function findScripts(folders) {
  const out = [];
  const walk = d => {
    let names;
    try { names = readdirSync(d); } catch { return; }
    for (const f of names) {
      const p = join(d, f);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) walk(p); }
      else if (/fuzz|hostile/i.test(f) && /\.(mjs|js|py)$/.test(f) && !/\.test\.mjs$/.test(f)) out.push(p);
    }
  };
  for (const d of folders) walk(d);
  return out.sort();
}

export async function loadTargets(module = DEFAULT_MODULE) {
  return (await import(pathToFileURL(resolve(module)))).targets;
}

function write(out, target, r, input, meta) {
  mkdirSync(out, { recursive: true });
  const name = `${target.name}-${hash(r.signature)}`, data = join(out, `${name}.${target.ext || 'txt'}`), info = join(out, `${name}.finding.json`);
  if (existsSync(info)) return { name, data, info, seen: true };
  writeFileSync(data, input);
  const repro = `node ${q(rel(join(HERE, 'fuzz.mjs')))} --repro ${q(rel(data))} --target ${target.name}${meta.module !== DEFAULT_MODULE ? ` --targets-module ${q(rel(meta.module))}` : ''}`;
  writeFileSync(info, JSON.stringify({ target: target.name, kind: r.kind, signature: r.signature, message: r.message, stack: r.stack, seed: meta.seed, input: basename(data), originalLength: meta.originalLength, shrunkLength: input.length, repro }, null, 2) + '\n');
  return { name, data, info, repro, seen: false };
}

// budgetMs: this target's share of the run; deadline (ms since 1970): the end of the whole run, which shrinking never
// passes, so a finding made late is written less shrunk rather than the run overstaying its budget
export async function fuzzTarget(target, { module = DEFAULT_MODULE, budgetMs, hangMs = 5000, shrinkMs = 30000, seed, out, deadline = Infinity, log = () => {} }) {
  const rnd = seeded(`${seed}|${target.name}`), corpus = target.seeds(), runner = new Runner(module, target.name, hangMs, target.grace);
  const mutate = target.mutate || (target.kind === 'json' ? mutateJson : mutateText);
  const found = [], sigs = new Set(), stop = Date.now() + budgetMs;
  let inputs = 0, last = null;
  try {
    while (Date.now() < Math.min(stop, deadline) && corpus.length) {
      const base = last !== null && rnd() < 0.2 ? last : pick(corpus, rnd);
      const input = mutate(base, rnd);
      last = input;
      inputs++;
      const r = await runner.run(input);
      if (r.ok) continue;
      r.signature = signature(target.name, r);
      if (sigs.has(r.signature)) continue;
      sigs.add(r.signature);
      log(`${target.name}: ${r.kind}: ${r.message.split('\n')[0].slice(0, 160)}; shrinking ${input.length} characters`);
      const until = Math.min(Date.now() + shrinkMs, deadline), budget = { ok: () => Date.now() < until };
      const still = async c => { const s = await runner.run(c); return !s.ok && signature(target.name, s) === r.signature; };
      const small = await (target.kind === 'json' ? shrinkJson : shrinkText)(input, still, budget);
      const w = write(out, target, r, small, { seed, module, originalLength: input.length });
      found.push({ target: target.name, kind: r.kind, message: r.message, signature: r.signature, ...w });
    }
  } finally { await runner.stop(); }
  return { target: target.name, inputs, findings: found };
}

export function runScript(file, { budgetMs, out }) {
  const cmd = file.endsWith('.py') ? 'python3' : process.execPath;
  const r = spawnSync(cmd, [file], { encoding: 'utf8', timeout: budgetMs, maxBuffer: 64 << 20, cwd: ROOT });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const text = `${r.stdout || ''}${r.stderr ? `\n--- stderr ---\n${r.stderr}` : ''}`;
  mkdirSync(out, { recursive: true });
  const logFile = join(out, `script-${basename(file, extname(file))}.log`);
  writeFileSync(logFile, `$ ${cmd === 'python3' ? 'python3' : 'node'} ${file}\n${text}`);
  const failed = !timedOut && r.status !== 0;
  return { script: file, status: r.status, timedOut, failed, log: logFile };
}

export async function fuzz({ module = DEFAULT_MODULE, names, budgetMs = 60000, hangMs = 5000, shrinkMs = 30000, seed, out, scripts = [], scanTests = true, log = () => {} }) {
  const all = await loadTargets(module);
  const chosen = names ? names.map(n => all.find(t => t.name === n) || (() => { throw new Error(`no target ${n} (--list names them)`); })()) : all;
  const ready = [], skipped = [];
  for (const t of chosen) { const a = t.available(); if (a === true) ready.push(t); else skipped.push({ target: t.name, why: a }); }
  const files = findScripts([...(scanTests ? [join(ROOT, 'tests')] : []), ...scripts]);
  // each job gets an even share of what is left, so time a target leaves unused (or shrinking spends) moves on
  const deadline = Date.now() + budgetMs;
  let left = ready.length + files.length;
  const share = () => Math.max(1000, Math.floor((deadline - Date.now()) / Math.max(1, left--)));
  const results = [];
  for (const t of ready) results.push(await fuzzTarget(t, { module, budgetMs: share(), hangMs, shrinkMs, seed, out, deadline, log }));
  const ran = files.map(f => runScript(f, { budgetMs: share(), out }));
  return { seed, results, skipped, scripts: ran, findings: results.flatMap(r => r.findings).filter(f => !f.seen) };
}

export async function main(argv = process.argv.slice(2)) {
  const { flags } = parseArgs(argv, ['list']);
  try {
    const module = typeof flags['targets-module'] === 'string' ? resolve(flags['targets-module']) : DEFAULT_MODULE;
    const hangMs = duration(flags.hang, 5000);
    if (flags.list) {
      for (const t of await loadTargets(module)) { const a = t.available(); process.stdout.write(`${t.name}${a === true ? '' : ` (cannot run here: ${a})`}\n`); }
      return 0;
    }
    if (typeof flags.repro === 'string') {
      const t = (await loadTargets(module)).find(x => x.name === flags.target);
      if (!t) throw new Error(`--repro needs --target <name> (--list names them)`);
      const runner = new Runner(module, t.name, hangMs, t.grace);
      const r = await runner.run(readFileSync(flags.repro, 'utf8'));
      await runner.stop();
      process.stdout.write(r.ok ? `${t.name}: passes\n` : `${t.name}: ${r.kind}: ${r.message}\n${r.stack}\n`);
      return r.ok ? 0 : 1;
    }
    const seed = typeof flags.seed === 'string' ? flags.seed : new Date().toISOString().slice(0, 10);
    const out = resolve(typeof flags.out === 'string' ? flags.out : '.evolve/fuzz');
    const r = await fuzz({ module, names: typeof flags.targets === 'string' ? flags.targets.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      budgetMs: duration(flags.budget, 60000), hangMs, shrinkMs: duration(flags.shrink, 30000), seed, out,
      scripts: (typeof flags.scripts === 'string' ? flags.scripts : process.env.EVOLVE_FUZZ_SCRIPTS || '').split(',').map(s => s.trim()).filter(Boolean).map(s => resolve(s)), log: s => process.stderr.write(s + '\n') });
    const lines = [`seed ${r.seed}, findings in ${rel(out)}`];
    for (const x of r.results) lines.push(`${x.target}: ${x.inputs} inputs, ${x.findings.length} ${x.findings.length === 1 ? 'finding' : 'findings'}${x.findings.some(f => f.seen) ? ` (${x.findings.filter(f => f.seen).length} seen before)` : ''}`);
    for (const s of r.skipped) lines.push(`${s.target}: skipped, ${s.why}`);
    for (const s of r.scripts) lines.push(`script ${rel(s.script)}: ${s.timedOut ? 'stopped at its share of the budget' : `exit ${s.status}`}, log ${rel(s.log)}`);
    for (const f of r.findings) lines.push(`new ${f.kind} in ${f.target}: ${f.message.split('\n')[0].slice(0, 160)}`, `  repro: ${f.repro}`);
    process.stdout.write(lines.join('\n') + '\n');
    return r.findings.length || r.scripts.some(s => s.failed) ? 1 : 0;
  } catch (e) {
    process.stderr.write(`fuzz: ${e.message}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
