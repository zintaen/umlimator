#!/usr/bin/env node
// The weekly digest to the maintainer (auto-evolve strategy, section 7), in Markdown:
//
//   node tools/evolve/digest.mjs --audits <folder> [--fixes <folder>] [--repo <folder>] [--date YYYY-MM-DD] [--days 7]
//                                [--trend 8] [--gaps <file>] [--tune <folder>] [--out <file>]
//
// What it holds: the rounds of the week (a round's time is its audit file's date field, else its first "Audit <N>"
// commit in the repository, else the file's modification time) (the `--days` days up to the end of `--date`, UTC,
// today by default) with their fix rounds; the findings by severity over the last `--trend` rounds; the releases (git
// tags made in the week) and how many commits and merged pull requests the repository's checked-out branch gained;
// the circuit breakers (ledger.mjs); the open known gaps (the last "Known gaps" item of `--gaps`, docs/module-api.md by
// default, or every bullet of a file that has no such item); and a spot check: 2 or 3 rejected findings of the week (of
// the last three audits when the week has none), each with the verifier's reason, picked at random with the date as
// the seed, so the same date always picks the same ones. `--fixes` defaults to the audits folder. With `--tune`, the
// weekly layout loop's records of the week (tune-*.json under that folder, tools/evolve/tune-loop.mjs): what it proposed,
// whether it kept it and why, and its totals; a loop that stopped says so (docs/diagrams/notes/layout-flow.md 9.3).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { parseArgs, seeded } from './args.mjs';
import { loadAudits, loadFixes, counts } from './records.mjs';
import { breakers } from './ledger.mjs';
import { isMain } from '../main.mjs';

const DAY = 864e5;
const one = s => String(s ?? '').replace(/\s+/g, ' ').trim();

function git(repo, args) {
  try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

export function activity(repo, from, to) {
  const tags = git(repo, ['for-each-ref', 'refs/tags', '--format=%(refname:short)|%(creatordate:iso-strict)']);
  const log = git(repo, ['log', `--since=${from.toISOString()}`, `--until=${to.toISOString()}`, '--format=%cI|%s']);
  if (tags === null || log === null) return null;
  const releases = tags.split('\n').filter(Boolean).map(l => { const i = l.lastIndexOf('|'); return { tag: l.slice(0, i), date: new Date(l.slice(i + 1)) }; })
    .filter(t => t.date >= from && t.date <= to).sort((a, b) => a.date - b.date);
  const commits = log.split('\n').filter(Boolean);
  const prs = commits.map(l => /\|Merge pull request #(\d+)/.exec(l)?.[1]).filter(Boolean);
  const branch = one(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']));
  return { releases, commits: commits.length, prs, branch };
}

// when each round happened, from the repository's history: the first commit whose subject starts "Audit <N>" (the
// form the loop's lane commits take), as ms since 1970, by round
export function roundDates(repo) {
  const log = git(repo, ['log', '--format=%cI|%s']);
  const by = new Map();
  for (const l of (log || '').split('\n')) {
    const i = l.indexOf('|'), m = /^audit (\d+)\b/i.exec(l.slice(i + 1));
    if (!m) continue;
    const t = Date.parse(l.slice(0, i)), n = Number(m[1]);
    if (!by.has(n) || t < by.get(n)) by.set(n, t);
  }
  return by;
}

// a round's time: its file's own date, else its first "Audit <N>" commit, else the file's modification time (which a
// copy or a checkout resets, so it is the last resort)
export const when = (r, dates) => (r.date ? Date.parse(r.date) : dates.get(r.round) ?? r.mtime);

// the open known gaps: the last "- **Known gaps.**" item of the file, else its bullets
export function knownGaps(text) {
  const lines = text.split('\n');
  const item = lines.filter(l => /^- \*\*Known gaps?\.?\*\*/i.test(l)).at(-1);
  if (item) return [item.replace(/^- \*\*Known gaps?\.?\*\*\s*/i, '')];
  return lines.filter(l => /^\s*[-*] /.test(l)).map(l => l.replace(/^\s*[-*] /, ''));
}

// k items of `pool` picked at random by `rnd`, in a stable order
export function sample(pool, k, rnd) {
  const a = pool.slice();
  for (let i = 0; i < Math.min(k, a.length); i++) {
    const j = i + Math.floor(rnd() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// the layout loop's records (tune-*.json, anywhere under dir) whose date is in [from, to], by date
export function tuneRecords(dir, from, to) {
  const out = [], walk = p => { for (const f of readdirSync(p)) { const q = join(p, f);
    if (statSync(q).isDirectory()) walk(q);
    else if (/^tune-.*\.json$/.test(f)) { try { const r = JSON.parse(readFileSync(q, 'utf8')); const t = Date.parse(r && r.date); if (r && r.week && t >= from.getTime() && t <= to.getTime()) out.push(r); } catch {} } } };
  if (existsSync(dir)) walk(dir);
  const by = new Map(out.map(r => [r.week, r]));
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function tuneLines(records) {
  if (!records.length) return ['No layout loop record this week.'];
  const n = x => (x == null ? '-' : String(Math.round(x * 100) / 100));
  return records.flatMap(r => {
    const head = `- ${r.week}: ${r.status}${r.proposal ? `, ${r.proposal.path} ${JSON.stringify(r.proposal.from)} to ${JSON.stringify(r.proposal.to)}` : ''}.`;
    const tot = r.fixed ? ` Fixed ${n(r.fixed.baseScore)} to ${n(r.fixed.score)}; edits ${n(r.edits && r.edits.baseScore)} to ${n(r.edits && r.edits.score)}; held-out ${r.heldout ? `${n(r.heldout.baseScore)} to ${n(r.heldout.score)}` : 'not measured'}.` : '';
    const why = (r.decision || []).length ? ` ${one(r.decision.join('; '))}.` : '';
    return [head + tot + why];
  });
}

export function digest({ audits: auditsDir, fixes: fixesDir, repo = process.cwd(), date, days = 7, trend = 8, gaps, tune } = {}) {
  const day = date ? new Date(`${date}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(day.getTime())) throw new Error(`--date is YYYY-MM-DD, not ${date}`);
  const to = new Date(day.getTime() + DAY - 1), from = new Date(day.getTime() + DAY - days * DAY);
  const stamp = day.toISOString().slice(0, 10), inWeek = ms => ms >= from.getTime() && ms <= to.getTime();
  const audits = loadAudits(auditsDir), fixes = fixesDir === false ? [] : loadFixes(fixesDir || auditsDir);
  const dates = roundDates(repo);
  const week = audits.filter(a => inWeek(when(a, dates))), weekFixes = fixes.filter(f => inWeek(when(f, dates)));
  const out = [`# Weekly digest, ${from.toISOString().slice(0, 10)} to ${stamp}`, ''];

  out.push('## Rounds', '');
  if (week.length) {
    const sum = { high: 0, medium: 0, low: 0, rejected: 0 };
    for (const a of week) { const c = counts(a); for (const k in sum) sum[k] += c[k]; }
    out.push(`Audits written this week: ${week.map(a => a.round).join(', ')} (${week.length} ${week.length === 1 ? 'round' : 'rounds'}). Confirmed: ${sum.high} high, ${sum.medium} medium, ${sum.low} low; rejected by the verifiers: ${sum.rejected}.`);
  } else out.push('No audit was written this week.');
  if (weekFixes.length) {
    const lanes = weekFixes.flatMap(f => f.lanes);
    const n = k => lanes.reduce((s, l) => s + (Array.isArray(l[k]) ? l[k].length : 0), 0);
    out.push('', `Fix rounds this week: ${weekFixes.map(f => f.round).join(', ')}, ${lanes.length} lanes, ${n('fixed')} findings fixed, ${n('skipped')} skipped.`);
  }
  out.push('');

  out.push('## Findings by severity', '');
  const shown = audits.slice(-trend);
  if (shown.length) {
    out.push('| Round | High | Medium | Low | Rejected |', '| --- | --- | --- | --- | --- |');
    for (const a of shown) { const c = counts(a); out.push(`| ${a.round} | ${c.high} | ${c.medium} | ${c.low} | ${c.rejected} |`); }
    const hm = a => { const c = counts(a); return c.high + c.medium; };
    if (shown.length > 1) out.push('', `High plus medium went from ${hm(shown[0])} in round ${shown[0].round} to ${hm(shown.at(-1))} in round ${shown.at(-1).round}.`);
  } else out.push('No audit files.');
  out.push('');

  out.push('## Releases and merges', '');
  const act = activity(repo, from, to);
  if (!act) out.push(`No git history at ${repo}.`);
  else {
    out.push(act.releases.length ? `Released: ${act.releases.map(r => `${r.tag} (${r.date.toISOString().slice(0, 10)})`).join(', ')}.` : 'No release this week.');
    const prs = act.prs.length > 12 ? `${act.prs.slice(0, 12).map(n => '#' + n).join(', ')} and ${act.prs.length - 12} more` : act.prs.map(n => '#' + n).join(', ');
    out.push('', `${act.branch || 'HEAD'} gained ${act.commits} ${act.commits === 1 ? 'commit' : 'commits'}${act.prs.length ? `, with ${act.prs.length} pull ${act.prs.length === 1 ? 'request' : 'requests'} merged (${prs})` : ''}.`);
  }
  out.push('');

  out.push('## Circuit breakers', '');
  const b = breakers(audits);
  if (!b.triggers.length) out.push(`None tripped: ${b.verdict}.`);
  else {
    for (const t of b.triggers) out.push(t.breaker === 'c' ? `- (c) ${t.what}: rounds ${t.rounds.join(', ')}.` : `- (${t.breaker}) ${t.what}: ${t.key}, rounds ${t.rounds.join(', ')}.`);
    out.push('', `Verdict: ${b.verdict}. Each tripped breaker is a question for the decision queue.`);
  }
  out.push('');

  out.push('## Open known gaps', '');
  const gapFile = gaps || join(repo, 'docs/module-api.md');
  const list = existsSync(gapFile) ? knownGaps(readFileSync(gapFile, 'utf8')) : null;
  if (!list) out.push(`No known gaps file at ${gapFile}.`);
  else if (!list.length) out.push('None recorded.');
  else for (const g of list) out.push(`- ${one(g)}`);
  out.push('');

  if (tune) {
    const recs = tuneRecords(tune, from, to);
    out.push('## Layout tuning loop', '', ...tuneLines(recs));
    if (recs.some(r => r.status === 'stopped')) out.push('', 'The loop has stopped: two weeks in a row kept nothing. It runs again when the maintainer starts it with restart (section 9.3 of the layout-flow note).');
    out.push('');
  }

  out.push('## Spot check: rejected findings', '');
  let pool = week.flatMap(a => a.rejected.map(r => ({ round: a.round, ...r })));
  let note = 'of this week';
  if (!pool.length) { pool = audits.slice(-3).flatMap(a => a.rejected.map(r => ({ round: a.round, ...r }))); note = 'of the last three audits (none this week)'; }
  const picked = sample(pool, Math.min(3, pool.length), seeded(stamp));
  if (!picked.length) out.push('No rejected findings to sample.');
  else {
    out.push(`${picked.length} of the ${pool.length} rejected findings ${note}, picked with ${stamp} as the seed. Does each verifier's reason hold?`, '');
    picked.forEach((r, i) => {
      out.push(`${i + 1}. Audit ${r.round}: ${one(r.title)}`, '');
      out.push(`   Verifier: ${one(r.why ?? r.reason ?? r.verdict?.reason) || '(no reason recorded)'}`, '');
    });
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

export function main(argv = process.argv.slice(2)) {
  const { flags } = parseArgs(argv);
  let md;
  try {
    if (typeof flags.audits !== 'string') throw new Error('usage: digest.mjs --audits <folder> [--fixes <folder>] [--repo <folder>] [--date YYYY-MM-DD] [--days 7] [--trend 8] [--gaps <file>] [--tune <folder>] [--out <file>]');
    md = digest({ audits: flags.audits, fixes: typeof flags.fixes === 'string' ? flags.fixes : undefined, repo: typeof flags.repo === 'string' ? resolve(flags.repo) : process.cwd(),
      date: typeof flags.date === 'string' ? flags.date : undefined, days: flags.days ? Number(flags.days) : 7, trend: flags.trend ? Number(flags.trend) : 8,
      gaps: typeof flags.gaps === 'string' ? flags.gaps : undefined, tune: typeof flags.tune === 'string' ? flags.tune : undefined });
  } catch (e) {
    process.stderr.write(`digest: ${e.message}\n`);
    return 2;
  }
  if (typeof flags.out === 'string') writeFileSync(flags.out, md); else process.stdout.write(md);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main();
