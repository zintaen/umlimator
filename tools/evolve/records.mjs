// Reading the loop's records: audit files (auditN.json) and fix files (fixN.json, fixN.jsonl), in every form the loop
// has written them. Shared by ledger.mjs and digest.mjs. No dependency.
//
// An audit file is { confirmed: [finding], rejected: [{ title, why }] }, or a workflow run's output that holds that
// under `result`. A finding has title, area, files, severity, repro, expected, actual, fix and verdict { real, reason },
// and from the strategy's template on, symptom, inputClass and verdict.cause. Files named audit<N><suffix>.json (for
// example audit30-b8.json) count toward round N. A fix file is a list of lane results, { lanes: [...] }, or a workflow
// log (.jsonl) whose `result` events are lane results; a lane result has fixed and skipped (finding numbers).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

function files(paths, re) {
  const out = [];
  for (const p of [].concat(paths)) {
    let st;
    try { st = statSync(p); } catch { throw new Error(`no file or folder at ${p}`); }
    if (st.isDirectory()) for (const f of readdirSync(p)) { if (re.test(f)) out.push(join(p, f)); }
    else out.push(p);
  }
  return out;
}

const unwrap = d => (d && typeof d === 'object' && !Array.isArray(d) && !d.confirmed && d.result && typeof d.result === 'object' ? d.result : d);

// [{ round, files: [path], mtime (ms, the newest file's), date (ISO text from the file's own date, started or finished
// field, or null), confirmed, rejected }], by round
export function loadAudits(paths) {
  const by = new Map();
  for (const f of files(paths, /^audit\d+.*\.json$/)) {
    const m = /^audit(\d+)/.exec(basename(f));
    if (!m) continue;
    const d = unwrap(JSON.parse(readFileSync(f, 'utf8')));
    if (!d || !Array.isArray(d.confirmed)) continue;
    const round = Number(m[1]);
    const r = by.get(round) || { round, files: [], mtime: 0, date: null, confirmed: [], rejected: [] };
    r.files.push(f);
    const when = [d.date, d.started, d.finished].find(x => typeof x === 'string' && !Number.isNaN(Date.parse(x)));
    if (when && (!r.date || Date.parse(when) < Date.parse(r.date))) r.date = new Date(when).toISOString();
    r.mtime = Math.max(r.mtime, statSync(f).mtimeMs);
    r.confirmed.push(...d.confirmed.filter(x => x && typeof x === 'object' && (!x.verdict || x.verdict.real !== false)));
    r.rejected.push(...(d.rejected || []).filter(x => x && typeof x === 'object'));
    by.set(round, r);
  }
  return [...by.values()].sort((a, b) => a.round - b.round);
}

// [{ round, file, mtime, lanes: [{ branch, fixed, skipped, ... }] }], by round
export function loadFixes(paths) {
  const by = new Map();
  for (const f of files(paths, /^fix\d+\.jsonl?$/)) {
    const m = /^fix(\d+)/.exec(basename(f));
    if (!m) continue;
    const text = readFileSync(f, 'utf8');
    let lanes;
    if (f.endsWith('.jsonl')) {
      lanes = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e && e.type === 'result' && e.result && typeof e.result === 'object' && Array.isArray(e.result.fixed)) lanes.push({ branch: e.label, ...e.result });
      }
    } else {
      const d = JSON.parse(text);
      lanes = Array.isArray(d) ? d : Array.isArray(d?.lanes) ? d.lanes : [];
    }
    const round = Number(m[1]);
    const r = by.get(round) || { round, file: f, mtime: 0, lanes: [] };
    r.lanes.push(...lanes.filter(x => x && typeof x === 'object'));
    r.mtime = Math.max(r.mtime, statSync(f).mtimeMs);
    by.set(round, r);
  }
  return [...by.values()].sort((a, b) => a.round - b.round);
}

export const SEVERITIES = ['high', 'medium', 'low'];

export function counts(audit) {
  const c = { high: 0, medium: 0, low: 0, other: 0, rejected: audit.rejected.length };
  for (const f of audit.confirmed) { const s = String(f.severity || '').toLowerCase(); if (s in c && s !== 'rejected') c[s]++; else c.other++; }
  return c;
}

// a title as a key: lower case, no numbers, quotes or punctuation, single spaces
export function titleKey(title) {
  return String(title || '').toLowerCase().replace(/[`'"]/g, '').replace(/\d+/g, '#').replace(/[^a-z#]+/g, ' ').trim();
}

// the source files a finding names (its `files` field, a list or text), without line numbers
export function findingFiles(f) {
  const text = Array.isArray(f.files) ? f.files.join(' ') : String(f.files || '');
  const out = new Set();
  for (const m of text.matchAll(/(?:^|[\s(,;])((?:[\w.-]+\/)*[\w.-]+\.(?:m?js|ts|py|json|css|html|md|ya?ml))\b/g)) out.add(m[1].replace(/^\.\//, ''));
  return [...out];
}

// The finding's symptom: its own `symptom` field (the strategy's template asks every finder for one); for older findings
// that have none, a class read from the title, or null when the title names none of these.
const SYMPTOMS = [
  ['hang', /\b(hangs?|freezes?|frozen|never returns|stalls?|quadratic|exponential|seconds|minutes|slow)\b/],
  ['throws', /\b(throws?|crash(es)?|typeerror|rangeerror|stack overflow|maximum call stack)\b/],
  ['escaping', /\b(unescaped|escap\w*|injects?|xss|raw html)\b/],
  ['overlap', /\b(overlap\w*|covers?|on top of|laid over|collid\w*)\b/],
  ['lost-on-round-trip', /\b(round[- ]trip|lost|drops?|dropped|loses)\b/],
  ['wrong-count', /\b(counts?|miscount\w*|off by one)\b/],
];

export function symptom(f) {
  if (typeof f.symptom === 'string' && f.symptom.trim()) return f.symptom.trim().toLowerCase();
  const t = String(f.title || '').toLowerCase();
  for (const [name, re] of SYMPTOMS) if (re.test(t)) return name;
  return null;
}
