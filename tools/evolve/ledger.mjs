#!/usr/bin/env node
// The findings ledger's circuit breakers (auto-evolve strategy, risk 13), read from the audit files:
//
//   node tools/evolve/ledger.mjs <audits folder or auditN.json files...> [--window 20] [--json]
//
// (a) back again: a confirmed finding of the latest round whose family was also confirmed in at least two earlier
//     rounds of the window (the last 20 rounds by default), so three rounds in all. A family is the same title (lower
//     case, numbers and punctuation left out), or the same file and symptom: the finding's `symptom` field, or for older
//     findings without one a class read from the title (hang, throws, escaping, overlap, lost-on-round-trip,
//     wrong-count).
// (b) regresses twice: two or more findings of one family in the window that a verifier marked `cause: regression`,
//     one of them in the latest round.
// (c) no fall: in each of the last three rounds at least one high or medium finding, and the second and third each
//     with at least as many high plus medium findings as the round before it. Where the findings carry `verdict.cause`, it also needs more than half
//     of each round's high and medium findings to be `ledger` or `regression`; where none carries it, that part is
//     unknown and the breaker trips on the counts alone (stopping to ask is the safe side).
//
// Prints each trigger and a verdict: `stop` when any breaker trips, else `continue`. Exit 0: continue; 1: stop; 2: a
// usage error.
import { parseArgs } from './args.mjs';
import { loadAudits, counts, titleKey, findingFiles, symptom } from './records.mjs';
import { isMain } from '../main.mjs';

const cause = f => String(f.verdict?.cause ?? f.cause ?? '').toLowerCase() || null;

// every family key of a finding: its title, and each file it names with its symptom
export function families(f) {
  const keys = [];
  const t = titleKey(f.title);
  if (t) keys.push(`title: ${t}`);
  const s = symptom(f);
  if (s) for (const file of findingFiles(f)) keys.push(`file: ${file} | symptom: ${s}`);
  return keys;
}

export function breakers(audits, { window = 20 } = {}) {
  const triggers = [];
  if (!audits.length) return { triggers, verdict: 'continue', rounds: [] };
  const latest = audits.at(-1).round;
  const inWindow = audits.filter(a => a.round > latest - window);

  // (a) and (b): families across the window
  const seen = new Map();
  for (const a of inWindow) for (const f of a.confirmed) for (const k of families(f)) {
    const e = seen.get(k) || { rounds: new Set(), titles: [], regressions: [] };
    e.rounds.add(a.round);
    e.titles.push(`${a.round}: ${f.title}`);
    if (cause(f) === 'regression') e.regressions.push(a.round);
    seen.set(k, e);
  }
  for (const [key, e] of seen) {
    if (e.rounds.size >= 3 && e.rounds.has(latest))
      triggers.push({ breaker: 'a', what: 'back again', key, rounds: [...e.rounds].sort((x, y) => x - y), titles: e.titles });
    if (e.regressions.length >= 2 && e.regressions.includes(latest))
      triggers.push({ breaker: 'b', what: 'regresses twice', key, rounds: [...new Set(e.regressions)].sort((x, y) => x - y), titles: e.titles });
  }

  // (c): the last three rounds against the ones before them
  const hm = a => { const c = counts(a); return c.high + c.medium; };
  if (audits.length >= 3) {
    const last = audits.slice(-3);
    const flat = last.every(a => hm(a) >= 1) && hm(last[1]) >= hm(last[0]) && hm(last[2]) >= hm(last[1]);
    if (flat) {
      const serious = a => a.confirmed.filter(f => /^(high|medium)$/i.test(f.severity || ''));
      const known = last.some(a => serious(a).some(f => cause(f)));
      const repeat = last.every(a => { const s = serious(a); return s.filter(f => ['ledger', 'regression'].includes(cause(f))).length * 2 > s.length; });
      if (!known || repeat)
        triggers.push({ breaker: 'c', what: 'no fall in high plus medium', rounds: last.map(a => a.round), counts: last.map(a => [a.round, hm(a)]), cause: known ? 'more than half ledger or regression' : 'unknown: no verdict.cause recorded' });
    }
  }
  triggers.sort((x, y) => x.breaker.localeCompare(y.breaker) || String(x.key).localeCompare(String(y.key)));
  // one family found under two keys (its title, and its file and symptom) is told once, under its title
  const told = new Set();
  for (let i = triggers.length - 1; i >= 0; i--) if (triggers[i].titles) { const k = triggers[i].breaker + '\n' + triggers[i].titles.join('\n'); triggers[i].dup = told.has(k); told.add(k); }
  for (let i = triggers.length - 1; i >= 0; i--) if (triggers[i].dup) triggers.splice(i, 1); else delete triggers[i].dup;
  return { latest, window, triggers, verdict: triggers.length ? 'stop' : 'continue' };
}

export function report(r) {
  const out = [];
  if (r.latest === undefined) return 'no audit files: continue\n';
  out.push(`Rounds up to ${r.latest}, window ${r.window}.`);
  for (const t of r.triggers) {
    if (t.breaker === 'c') out.push(`(c) ${t.what}: rounds ${t.rounds.join(', ')} (high plus medium ${t.counts.map(([n, c]) => `${n}: ${c}`).join(', ')}); cause ${t.cause}`);
    else {
      out.push(`(${t.breaker}) ${t.what}: ${t.key}, rounds ${t.rounds.join(', ')}`);
      for (const s of t.titles) out.push(`    ${s}`);
    }
  }
  out.push(`verdict: ${r.verdict}`);
  return out.join('\n') + '\n';
}

export function main(argv = process.argv.slice(2)) {
  let r, flags, rest;
  try {
    ({ flags, rest } = parseArgs(argv, ['json'], ['window']));
    if (!rest.length) throw new Error('usage: ledger.mjs <audits folder or auditN.json files...> [--window 20] [--json]');
    const window = flags.window === undefined ? 20 : Number(flags.window);
    if (!(window >= 1)) throw new Error(`--window is a number of rounds, not ${flags.window}`);
    r = breakers(loadAudits(rest), { window });
  } catch (e) {
    process.stderr.write(`ledger: ${e.message}\n`);
    return 2;
  }
  process.stdout.write(flags.json ? JSON.stringify(r, null, 2) + '\n' : report(r));
  return r.verdict === 'stop' ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main();
