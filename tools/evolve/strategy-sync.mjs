#!/usr/bin/env node
// The pinned auto-evolve strategy and its two-way sync with the canonical repository (the strategy's A12).
//
//   node tools/evolve/strategy-sync.mjs check   [--pinned .evolve/STRATEGY.md] [--upstream owner/repo]
//   node tools/evolve/strategy-sync.mjs propose [--feedback .evolve/strategy-feedback.md] [--review file] [--project name] [--dry-run]
//   node tools/evolve/strategy-sync.mjs update  [--repo owner/repo] [--base main] [--dry-run]
//
// check compares the pinned copy with the newest upstream tag and checks that the copy was not edited in place.
// propose turns the open feedback entries into one pull request against the canonical repository (a branch, the edited
// STRATEGY.md, a changelog entry, the evidence in the body) and moves them to the closed list; it never merges.
// update opens a pull request in this project that replaces the pinned copy with the newest tagged version.
// Every GitHub call goes through one client (ghClient below, or the one a test passes), so the modes run offline in tests.
// Exit 0: all is well or done; 1: something to report (a newer version, an edited copy, upstream unreachable); 2: usage.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from './args.mjs';
import { isMain } from '../main.mjs';

export const UPSTREAM = 'zintaen/auto-evolve-strategy';
export const PROJECT_REPO = 'zintaen/umlimator';
export const PINNED = '.evolve/STRATEGY.md';
export const FEEDBACK = '.evolve/strategy-feedback.md';
const MARK = '<!-- end of the pin header: the upstream STRATEGY.md follows byte for byte -->\n';

const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');

// ---------- versions ----------

export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? m.slice(1).map(Number) : null;
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
// the highest x.y.z tag of a list of { name, sha }; other tag names are ignored
export function latestTag(tags) {
  return tags.filter(t => parseVersion(t.name)).sort((a, b) => compareVersions(b.name, a.name))[0] || null;
}

// ---------- the pinned copy ----------

export function pinHeader({ version, tag, commit, date, body }) {
  return `<!-- evolve-pin: version=${version} tag=${tag} commit=${commit} pinned=${date} sha256=${sha256(body)} -->\n` +
    `> Pinned copy of the auto-evolve strategy, version ${version} (tag ${tag}, commit ${commit.slice(0, 8)}), pinned on ${date} from the private repository ${UPSTREAM}. Agents in this project follow this copy, never a newer upstream text. It is never edited in place: it changes only by a pull request that replaces it with a newer tagged version (\`node tools/evolve/strategy-sync.mjs update\`). Problems with the strategy go to \`.evolve/strategy-feedback.md\`. Everything below the next line is the upstream file, byte for byte.\n\n` +
    MARK;
}
export const pinFile = p => pinHeader(p) + p.body;

// { version, tag, commit, date, sha256, body, intact } of a pinned file's text; null when it has no pin header
export function readPin(text) {
  const m = /^<!-- evolve-pin: version=(\S+) tag=(\S+) commit=([0-9a-f]{7,40}) pinned=(\S+) sha256=([0-9a-f]{64}) -->\n/.exec(text);
  const at = text.indexOf(MARK);
  if (!m || at < 0) return null;
  const body = text.slice(at + MARK.length);
  return { version: m[1], tag: m[2], commit: m[3], date: m[4], sha256: m[5], body, intact: sha256(body) === m[5] };
}

// ---------- the feedback file ----------

const FIELDS = { date: 'Date', round: 'Round', rule: 'Rule', happened: 'What happened', evidence: 'Evidence', change: 'Proposed change', upstream: 'Upstream' };

// { head, open: [entry], closed: [entry] }; an entry is { id, title, date, round, rule, happened, evidence, change, upstream, edits, text }
export function parseFeedback(text) {
  const sec = name => { const m = new RegExp(`^## ${name}\\s*$`, 'm').exec(text); return m ? m.index : -1; };
  const o = sec('Open'), c = sec('Closed');
  if (o < 0 || c < 0 || c < o) throw new Error('the feedback file needs an "## Open" section followed by a "## Closed" section');
  const entries = part => part.split(/^(?=### )/m).filter(s => s.startsWith('### ')).map(parseEntry);
  return { head: text.slice(0, o), open: entries(text.slice(o, c)), closed: entries(text.slice(c)) };
}
function parseEntry(text) {
  const t = /^### (?:(F\d+)\.\s*)?(.*)$/m.exec(text);
  const e = { id: t[1] || '', title: t[2].trim(), edits: [], text: text.replace(/\s+$/, '') + '\n' };
  for (const [k, label] of Object.entries(FIELDS)) {
    const m = new RegExp(`^- ${label}: (.*)$`, 'm').exec(text);
    e[k] = m ? m[1].trim() : '';
  }
  // exact text edits: a ```find block followed by a ```replace block
  const re = /^```find\n([\s\S]*?)\n```\n+```replace\n([\s\S]*?)\n```$/gm;
  for (let m; (m = re.exec(text));) e.edits.push({ find: m[1], replace: m[2] });
  return e;
}
export function feedbackProblems(fb) {
  const out = [];
  for (const e of [...fb.open, ...fb.closed]) for (const k of ['date', 'round', 'rule', 'happened', 'evidence', 'change'])
    if (!e[k]) out.push(`${e.id || e.title}: no "${FIELDS[k]}" line`);
  for (const e of fb.closed) if (!e.upstream) out.push(`${e.id || e.title}: closed with no "Upstream" line`);
  return out;
}
export function writeFeedback(fb) {
  const list = es => es.length ? es.map(e => e.text).join('\n') : 'None.\n';
  return `${fb.head}## Open\n\n${list(fb.open)}\n## Closed\n\n${list(fb.closed)}`;
}
// the entry moved to the closed list, its upstream pull request recorded after its last field
export function closeEntry(e, pr, date) {
  const line = `- Upstream: ${pr} (${date})`;
  const lines = e.text.replace(/\s+$/, '').split('\n');
  let at = -1;
  lines.forEach((l, i) => { if (/^- [A-Z][a-z ]+: /.test(l)) at = i; });
  lines.splice(at + 1, 0, line);
  return { ...e, upstream: `${pr} (${date})`, text: lines.join('\n') + '\n' };
}

// ---------- building the upstream change ----------

// the strategy text with every entry's exact edits applied; an edit whose text is not found exactly once is reported
export function applyEdits(strategy, entries) {
  let text = strategy;
  const applied = [], problems = [];
  for (const e of entries) for (const ed of e.edits) {
    const n = text.split(ed.find).length - 1;
    if (n !== 1) { problems.push(`${e.id || e.title}: the find text occurs ${n} times in STRATEGY.md, so it is left to the reviewer`); continue; }
    text = text.replace(ed.find, () => ed.replace);
    applied.push(e.id || e.title);
  }
  return { text, applied, problems };
}
export function changelogEntry(changelog, entries, project) {
  const lines = entries.map(e => `- ${e.rule} (from ${project}, ${e.round}): ${e.title}${/[.!?]$/.test(e.title) ? '' : '.'}`).join('\n');
  const u = /^## Unreleased[ \t]*\n/m.exec(changelog);
  if (u) {
    const start = u.index + u[0].length, rel = changelog.slice(start).search(/^## /m), end = rel < 0 ? changelog.length : start + rel;
    const had = changelog.slice(start, end).replace(/\s+$/, ''), tail = changelog.slice(end);
    return `${changelog.slice(0, start)}${had ? had + '\n' : '\n'}${lines}\n${tail ? '\n' + tail : ''}`;
  }
  const at = changelog.search(/^## /m);
  const block = `## Unreleased\n\n${lines}\n\n`;
  return at < 0 ? `${changelog.replace(/\s*$/, '\n\n')}${block}` : changelog.slice(0, at) + block + changelog.slice(at);
}
export function proposalBody({ entries, project, pinned, review, problems }) {
  const parts = [`Strategy feedback from ${project}, pinned at ${pinned.tag} (${pinned.commit.slice(0, 8)}), under A12. ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}; each names the rule it touches, what happened, the evidence and the proposed change. Entries with an exact text edit are applied to STRATEGY.md in this pull request; the others are proposals for the reviewer and the maintainer to word.`, ''];
  for (const e of entries) parts.push(`### ${e.id ? e.id + '. ' : ''}${e.title}`, '', `- Rule: ${e.rule}`, `- Date and round: ${e.date}, ${e.round}`, `- What happened: ${e.happened}`, `- Evidence: ${e.evidence}`, `- Proposed change: ${e.change}`, `- Text edit in this pull request: ${e.edits.length ? 'yes' : 'no, proposal only'}`, '');
  if (problems.length) parts.push('### Edits not applied', '', ...problems.map(p => `- ${p}`), '');
  parts.push('### Independent review', '', review ? review.trim() : 'Not attached yet: the orchestrator attaches an independent reviewer\'s check (contradictions, broken cross-references, rules removed or weakened) as a comment before the maintainer reviews (A12).', '');
  parts.push(`Opened by ${project}'s \`tools/evolve/strategy-sync.mjs propose\`. No agent merges this pull request: the maintainer reviews it, merges it and tags the new version (A12).`);
  return parts.join('\n');
}

// the changelog sections for versions after `from` up to and including `to`
export function changelogSince(changelog, from, to) {
  const out = [];
  for (const s of changelog.split(/^(?=## )/m)) {
    const m = /^## v?(\d+\.\d+\.\d+)/.exec(s);
    if (m && compareVersions(m[1], from) > 0 && compareVersions(m[1], to) <= 0) out.push(s.trim());
  }
  return out.join('\n\n');
}

// ---------- the GitHub client ----------

// The one place that talks to GitHub, through the gh command line (auth: gh's own, or GH_TOKEN).
export function ghClient({ gh = 'gh' } = {}) {
  const api = (method, path, body, accept) => {
    const args = ['api', '-X', method, path, ...(accept ? ['-H', `Accept: ${accept}`] : []), ...(body ? ['--input', '-'] : [])];
    const r = spawnSync(gh, args, { encoding: 'utf8', input: body ? JSON.stringify(body) : undefined, maxBuffer: 64 << 20 });
    if (r.error) throw new Error(`gh could not run: ${r.error.message}`);
    if (r.status !== 0) throw new Error(`gh api ${method} ${path}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
    return accept ? r.stdout : (r.stdout.trim() ? JSON.parse(r.stdout) : null);
  };
  const enc = s => encodeURIComponent(s);
  return {
    tags: repo => api('GET', `repos/${repo}/tags?per_page=100`).map(t => ({ name: t.name, sha: t.commit.sha })),
    file: (repo, path, ref) => api('GET', `repos/${repo}/contents/${path}?ref=${enc(ref)}`, null, 'application/vnd.github.raw'),
    branchSha: (repo, branch) => api('GET', `repos/${repo}/git/ref/heads/${branch}`).object.sha,
    defaultBranch: repo => api('GET', `repos/${repo}`).default_branch,
    openPulls: repo => api('GET', `repos/${repo}/pulls?state=open&per_page=100`).map(p => ({ number: p.number, url: p.html_url, head: p.head.ref, title: p.title })),
    createBranch: (repo, branch, sha) => { api('POST', `repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha }); },
    putFile: (repo, branch, path, content, message) => {
      let sha;
      try { sha = api('GET', `repos/${repo}/contents/${path}?ref=${enc(branch)}`).sha; } catch { sha = undefined; }
      api('PUT', `repos/${repo}/contents/${path}`, { message, branch, content: Buffer.from(content, 'utf8').toString('base64'), ...(sha ? { sha } : {}) });
    },
    openPull: (repo, { head, base, title, body }) => { const p = api('POST', `repos/${repo}/pulls`, { head, base, title, body }); return { number: p.number, url: p.html_url }; },
  };
}

// ---------- the three modes ----------

const today = now => (now || new Date()).toISOString().slice(0, 10);
const readPinned = (file, read) => {
  if (!existsSync(file)) return { error: `no pinned strategy at ${file}` };
  const pin = readPin(read(file));
  return pin ? { pin } : { error: `${file} has no pin header (evolve-pin line and end-of-header mark)` };
};

// { code, lines, pinned, latest }
export function check({ client, pinnedFile = PINNED, upstream = UPSTREAM, read = f => readFileSync(f, 'utf8') }) {
  const lines = [], { pin, error } = readPinned(pinnedFile, read);
  if (error) return { code: 1, lines: [error] };
  let code = 0;
  lines.push(`pinned: ${pin.version} (${pin.tag}, commit ${pin.commit.slice(0, 8)}, pinned ${pin.date})`);
  if (!pin.intact) { code = 1; lines.push(`edited in place: the text below the pin header no longer matches its sha256; restore it from ${pin.tag} (A12: a project never edits its pinned copy)`); }
  let latest;
  try { latest = latestTag(client.tags(upstream)); } catch (e) { return { code: 1, lines: [...lines, `upstream not reachable: ${e.message}`], pinned: pin }; }
  if (!latest) return { code: 1, lines: [...lines, `upstream ${upstream} has no version tag`], pinned: pin };
  const d = compareVersions(latest.name, pin.version);
  if (d > 0) { code = 1; lines.push(`newer upstream: ${latest.name} (commit ${latest.sha.slice(0, 8)}); run strategy-sync update to open the pull request that pins it`); }
  else if (d < 0) { code = 1; lines.push(`the pinned version is newer than upstream's newest tag ${latest.name}: check the pin header`); }
  else lines.push(`up to date with ${upstream} ${latest.name}`);
  if (d === 0 && latest.sha !== pin.commit && !latest.sha.startsWith(pin.commit)) { code = 1; lines.push(`tag ${latest.name} now names commit ${latest.sha.slice(0, 8)}, not the pinned ${pin.commit.slice(0, 8)}: a moved tag; ask the maintainer`); }
  return { code, lines, pinned: pin, latest };
}

// { code, lines, plan, pr }
export function propose({ client, feedbackFile = FEEDBACK, pinnedFile = PINNED, upstream = UPSTREAM, project = 'umlimator', review, dryRun = false, now, read = f => readFileSync(f, 'utf8'), write = (f, s) => writeFileSync(f, s) }) {
  const lines = [];
  const fb = parseFeedback(read(feedbackFile));
  const bad = feedbackProblems(fb);
  if (bad.length) return { code: 1, lines: ['the feedback file has incomplete entries:', ...bad] };
  if (!fb.open.length) return { code: 0, lines: ['no open strategy feedback: nothing to propose'] };
  const { pin, error } = readPinned(pinnedFile, read);
  if (error) return { code: 1, lines: [error] };
  const prefix = `feedback/${project}-`;
  const already = client.openPulls(upstream).find(p => p.head.startsWith(prefix));
  if (already) return { code: 0, lines: [`an upstream pull request from ${project} is open already: #${already.number} ${already.url}; its review comes first, so nothing new is opened`] };
  const base = client.defaultBranch(upstream), baseSha = client.branchSha(upstream, base);
  const strategy = client.file(upstream, 'STRATEGY.md', base), changelog = client.file(upstream, 'CHANGELOG.md', base);
  const edited = applyEdits(strategy, fb.open);
  const date = today(now), branch = `${prefix}${date}`;
  const title = `Strategy feedback from ${project}: ${fb.open.length} entr${fb.open.length === 1 ? 'y' : 'ies'} (${[...new Set(fb.open.map(e => e.rule))].join('; ')})`;
  const plan = {
    repo: upstream, base, baseSha, branch, title,
    files: { 'STRATEGY.md': edited.text, 'CHANGELOG.md': changelogEntry(changelog, fb.open, project) },
    body: proposalBody({ entries: fb.open, project, pinned: pin, review, problems: edited.problems }),
    entries: fb.open.map(e => e.id || e.title),
  };
  lines.push(`${dryRun ? 'would open' : 'opening'} a pull request on ${upstream}: ${branch} -> ${base} (from ${baseSha.slice(0, 8)})`, `title: ${title}`,
    `STRATEGY.md: ${edited.text === strategy ? 'unchanged (proposals only)' : `edited by ${edited.applied.join(', ')}`}`, 'CHANGELOG.md: an Unreleased entry per feedback entry',
    ...edited.problems.map(p => `not applied: ${p}`), `then move ${plan.entries.join(', ')} to the closed list of ${feedbackFile}`);
  if (dryRun) return { code: 0, lines: [...lines, '', 'body:', plan.body], plan };
  client.createBranch(upstream, branch, baseSha);
  if (plan.files['STRATEGY.md'] !== strategy) client.putFile(upstream, branch, 'STRATEGY.md', plan.files['STRATEGY.md'], `Strategy feedback from ${project}: ${edited.applied.join(', ')}`);
  client.putFile(upstream, branch, 'CHANGELOG.md', plan.files['CHANGELOG.md'], `Changelog: strategy feedback from ${project}`);
  const pr = client.openPull(upstream, { head: branch, base, title, body: plan.body });
  const ref = `${upstream}#${pr.number}`;
  write(feedbackFile, writeFeedback({ head: fb.head, open: [], closed: [...fb.closed, ...fb.open.map(e => closeEntry(e, ref, date))] }));
  lines.push(`opened ${ref} ${pr.url}; ${plan.entries.length} entr${plan.entries.length === 1 ? 'y' : 'ies'} closed with it (commit ${feedbackFile} in the combine step)`);
  return { code: 0, lines, plan, pr };
}

// { code, lines, plan, pr }
export function update({ client, pinnedFile = PINNED, upstream = UPSTREAM, repo = PROJECT_REPO, base = 'main', dryRun = false, now, read = f => readFileSync(f, 'utf8') }) {
  const { pin, error } = readPinned(pinnedFile, read);
  if (error) return { code: 1, lines: [error] };
  const latest = latestTag(client.tags(upstream));
  if (!latest || compareVersions(latest.name, pin.version) <= 0) return { code: 0, lines: [`pinned ${pin.version} is the newest tagged version: nothing to update`] };
  const version = parseVersion(latest.name).join('.');
  const branch = `strategy/v${version}`;
  const already = client.openPulls(repo).find(p => p.head === branch);
  if (already) return { code: 0, lines: [`the update pull request is open already: #${already.number} ${already.url}`] };
  const body = client.file(upstream, 'STRATEGY.md', latest.name);
  const changes = changelogSince(client.file(upstream, 'CHANGELOG.md', latest.name), pin.version, version) || `(the changelog at ${latest.name} has no section after ${pin.version})`;
  const date = today(now), text = pinFile({ version, tag: latest.name, commit: latest.sha, date, body });
  const baseSha = client.branchSha(repo, base);
  const title = `Pin the auto-evolve strategy ${latest.name} (was ${pin.tag})`;
  const prBody = [`Replaces the pinned copy \`${pinnedFile}\` (${pin.tag}, commit ${pin.commit.slice(0, 8)}) with ${upstream} ${latest.name} (commit ${latest.sha.slice(0, 8)}), byte for byte under the pin header. The next round follows the new version once the maintainer merges this (A12).`, '',
    '## What changed upstream', '', changes, '',
    '## Before merging', '', '- Check the round templates (`tools/evolve/templates/`) and their checklist against the changes above, and update them in this pull request where a change needs it (A10.3, A12).', '- `node tools/evolve/strategy-sync.mjs check` reports this version as up to date.'].join('\n');
  const plan = { repo, base, baseSha, branch, title, file: pinnedFile, text, body: prBody };
  const lines = [`${dryRun ? 'would open' : 'opening'} a pull request on ${repo}: ${branch} -> ${base}, replacing ${pinnedFile} ${pin.tag} with ${latest.name}`, `title: ${title}`];
  if (dryRun) return { code: 0, lines: [...lines, '', 'body:', prBody], plan };
  client.createBranch(repo, branch, baseSha);
  client.putFile(repo, branch, pinnedFile, text, `Pin the auto-evolve strategy ${latest.name}`);
  const pr = client.openPull(repo, { head: branch, base, title, body: prBody });
  lines.push(`opened ${repo}#${pr.number} ${pr.url}`);
  return { code: 0, lines, plan, pr };
}

// ---------- command line ----------

export function main(argv, { client = ghClient(), out = console.log, now } = {}) {
  const { flags, rest } = parseArgs(argv, ['dry-run']);
  const mode = rest[0];
  if (!['check', 'propose', 'update'].includes(mode) || rest.length > 1) {
    out('usage: strategy-sync.mjs check|propose|update [--pinned file] [--feedback file] [--upstream owner/repo] [--repo owner/repo] [--base branch] [--project name] [--review file] [--dry-run]');
    return 2;
  }
  const common = { client, now, pinnedFile: flags.pinned || PINNED, upstream: flags.upstream || UPSTREAM };
  let r;
  try {
    if (mode === 'check') r = check(common);
    else if (mode === 'propose') r = propose({ ...common, feedbackFile: flags.feedback || FEEDBACK, project: flags.project || 'umlimator', review: flags.review ? readFileSync(flags.review, 'utf8') : undefined, dryRun: !!flags['dry-run'] });
    else r = update({ ...common, repo: flags.repo || PROJECT_REPO, base: flags.base || 'main', dryRun: !!flags['dry-run'] });
  } catch (e) { out(`strategy-sync ${mode}: ${e.message}`); return 1; }
  for (const l of r.lines) out(l);
  return r.code;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
