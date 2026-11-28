// The pinned auto-evolve strategy and its sync with the canonical repository (tools/evolve/strategy-sync.mjs), the kill
// switch (tools/evolve/killswitch.mjs) and the loop templates' checklist (tools/evolve/templates/). Every mode runs against
// a fake upstream made here, with no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  check, propose, update, main, readPin, pinFile, parseFeedback, feedbackProblems, writeFeedback, applyEdits,
  changelogEntry, changelogSince, latestTag, compareVersions,
} from '../tools/evolve/strategy-sync.mjs';
import { killSwitch } from '../tools/evolve/killswitch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'umlimator-strategy-'));
const NOW = new Date('2026-11-24T08:00:00Z');

const V1 = '# Auto-evolve strategy\n\nVersion 1.0.0.\n\n## C3. Starting a session\n\n3. Check for the kill-switch file (`.evolve/STOP` on main).\n\n## A7.5 Where things live\n\n| This plan | `.evolve/strategy.md` |\n';
const V11 = V1.replace('Version 1.0.0.', 'Version 1.1.0.') + '\n## A13. New\n\nA new rule.\n';
const LOG = '# Changelog\n\n## 1.1.0 (1 Dec 2026)\n\nA13 added.\n\n## 1.0.0 (21 Nov 2026)\n\nFirst version.\n';

// a fake GitHub: repositories with branches of files, tags, pull requests; every call is recorded
function fakeGitHub({ tags = [{ name: 'v1.0.0', sha: 'b1abb6edd7cd80e3b3608137cdbfd7c6f31cc0b2' }], pulls = [] } = {}) {
  const calls = [];
  const repos = {
    'zintaen/auto-evolve-strategy': { default: 'main', branches: { main: { sha: 'c0ffee11', files: { 'STRATEGY.md': V1, 'CHANGELOG.md': LOG } } }, at: { 'v1.0.0': { 'STRATEGY.md': V1, 'CHANGELOG.md': LOG.slice(LOG.indexOf('## 1.0.0')) }, 'v1.1.0': { 'STRATEGY.md': V11, 'CHANGELOG.md': LOG } }, pulls: [...pulls] },
    'zintaen/umlimator': { default: 'main', branches: { main: { sha: 'abc12345', files: {} } }, at: {}, pulls: [] },
  };
  const r = name => { const x = repos[name]; if (!x) throw new Error(`HTTP 404 ${name}`); return x; };
  const client = {
    tags: repo => { calls.push(['tags', repo]); return repo === 'zintaen/auto-evolve-strategy' ? tags : []; },
    file: (repo, path, ref) => {
      calls.push(['file', repo, path, ref]);
      const x = r(repo), files = x.branches[ref] ? x.branches[ref].files : x.at[ref];
      if (!files || !(path in files)) throw new Error(`HTTP 404 ${path}@${ref}`);
      return files[path];
    },
    branchSha: (repo, b) => { calls.push(['branchSha', repo, b]); return r(repo).branches[b].sha; },
    defaultBranch: repo => { calls.push(['defaultBranch', repo]); return r(repo).default; },
    openPulls: repo => { calls.push(['openPulls', repo]); return r(repo).pulls; },
    createBranch: (repo, b, sha) => { calls.push(['createBranch', repo, b, sha]); const x = r(repo); if (x.branches[b]) throw new Error('HTTP 422 exists'); const from = Object.values(x.branches).find(v => v.sha === sha); x.branches[b] = { sha: 'new' + b, files: { ...(from ? from.files : {}) } }; },
    putFile: (repo, b, path, content, message) => { calls.push(['putFile', repo, b, path, message]); r(repo).branches[b].files[path] = content; },
    openPull: (repo, p) => { calls.push(['openPull', repo, p.head, p.base, p.title]); const n = 100 + r(repo).pulls.length; r(repo).pulls.push({ number: n, url: `https://github.com/${repo}/pull/${n}`, head: p.head, title: p.title, body: p.body, base: p.base }); return { number: n, url: `https://github.com/${repo}/pull/${n}` }; },
  };
  return { client, calls, repos, writes: () => calls.filter(c => ['createBranch', 'putFile', 'openPull'].includes(c[0])) };
}

const pinned = (body = V1, extra = {}) => pinFile({ version: '1.0.0', tag: 'v1.0.0', commit: 'b1abb6edd7cd80e3b3608137cdbfd7c6f31cc0b2', date: '2026-11-23', body, ...extra });
const ENTRY = (n, edit = '') => `### F${n}. Problem ${n}\n\n- Date: 2026-11-2${n}\n- Round: fix round 5${n}\n- Rule: A7.5\n- What happened: thing ${n} went wrong.\n- Evidence: commit abc${n}.\n- Proposed change: say it better.\n${edit}`;
const FEEDBACK = (open, closed = 'None.\n') => `# Strategy feedback\n\nIntro.\n\n## Open\n\n${open}\n## Closed\n\n${closed}`;
const EDIT = '\n```find\n| This plan | `.evolve/strategy.md` |\n```\n\n```replace\n| This plan | `.evolve/STRATEGY.md` |\n```\n';

function files(map) {
  const dir = tmp();
  for (const [k, v] of Object.entries(map)) { mkdirSync(join(dir, k, '..'), { recursive: true }); writeFileSync(join(dir, k), v); }
  return { dir, path: k => join(dir, k), read: k => readFileSync(join(dir, k), 'utf8') };
}

// ---------- the pinned copy in this repository ----------

test('.evolve/STRATEGY.md is v1.0.0 of the canonical strategy under a pin header, its body unedited', () => {
  const pin = readPin(readFileSync(join(ROOT, '.evolve/STRATEGY.md'), 'utf8'));
  assert.ok(pin, 'no pin header');
  assert.equal(pin.version, '1.0.0');
  assert.equal(pin.tag, 'v1.0.0');
  assert.equal(pin.commit, 'b1abb6edd7cd80e3b3608137cdbfd7c6f31cc0b2');
  assert.equal(pin.intact, true, 'the pinned body was edited in place (A12): restore it from the tag');
  assert.match(pin.body, /^# Auto-evolve strategy\n\nVersion 1\.0\.0\. Canonical source: the repository zintaen\/auto-evolve-strategy/);
  assert.equal(pin.sha256, '74e448830812faad0dd1e1cf8697629b56c203882187c6fcded57ce42ba5b1ff', 'the sha256 of STRATEGY.md at v1.0.0');
});

test('the strategy feedback file has the A12 entry format, open and closed lists, and every entry names its rule and evidence', () => {
  const fb = parseFeedback(readFileSync(join(ROOT, '.evolve/strategy-feedback.md'), 'utf8'));
  assert.deepEqual(feedbackProblems(fb), []);
  assert.ok(fb.open.length >= 1);
  for (const e of fb.open) assert.match(e.rule, /\b(C\d+|A\d+(\.\d+)?)\b/, `${e.id}: the rule is a C or A number`);
  // its exact edits apply to the pinned text, as propose would apply them upstream
  const pin = readPin(readFileSync(join(ROOT, '.evolve/STRATEGY.md'), 'utf8'));
  assert.deepEqual(applyEdits(pin.body, fb.open).problems, []);
});

test('no .evolve/ file is in the published package (npm "files"), as A10.2 and A4.6 ask', () => {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  const paths = JSON.parse(out)[0].files.map(f => f.path);
  assert.ok(paths.length > 0);
  assert.deepEqual(paths.filter(p => p.startsWith('.evolve/') || p.startsWith('tools/')), []);
});

// ---------- pin header ----------

test('readPin: the header names version, tag, commit and date; an edit below it is caught by the hash', () => {
  const text = pinned();
  const p = readPin(text);
  assert.deepEqual([p.version, p.tag, p.commit, p.date, p.intact, p.body], ['1.0.0', 'v1.0.0', 'b1abb6edd7cd80e3b3608137cdbfd7c6f31cc0b2', '2026-11-23', true, V1]);
  assert.equal(readPin(text.replace('Version 1.0.0.', 'Version 1.0.0!')).intact, false);
  assert.equal(readPin(V1), null, 'a file with no header is not a pinned copy');
});

test('versions: latestTag picks the highest x.y.z tag and ignores other names', () => {
  assert.equal(latestTag([{ name: 'v1.2.0', sha: 'a' }, { name: 'v1.10.0', sha: 'b' }, { name: 'draft', sha: 'c' }, { name: 'v1.9.9', sha: 'd' }]).name, 'v1.10.0');
  assert.equal(latestTag([{ name: 'draft', sha: 'c' }]), null);
  assert.ok(compareVersions('1.0.1', 'v1.0.0') > 0);
});

// ---------- check ----------

test('check: up to date exits 0; a newer upstream tag exits 1 and says to run update', () => {
  const f = files({ 'p.md': pinned() });
  const same = check({ client: fakeGitHub().client, pinnedFile: f.path('p.md') });
  assert.equal(same.code, 0);
  assert.match(same.lines.join('\n'), /up to date with zintaen\/auto-evolve-strategy v1\.0\.0/);
  const newer = check({ client: fakeGitHub({ tags: [{ name: 'v1.0.0', sha: 'b1abb6ed' }, { name: 'v1.1.0', sha: 'deadbeef' }] }).client, pinnedFile: f.path('p.md') });
  assert.equal(newer.code, 1);
  assert.match(newer.lines.join('\n'), /newer upstream: v1\.1\.0 .*run strategy-sync update/);
});

test('check: a pinned copy edited in place, a moved tag, an unreachable upstream and a missing file each exit 1', () => {
  const edited = files({ 'p.md': pinned().replace('A7.5 Where', 'A7.5 Where (edited)') });
  const r1 = check({ client: fakeGitHub().client, pinnedFile: edited.path('p.md') });
  assert.equal(r1.code, 1);
  assert.match(r1.lines.join('\n'), /edited in place/);
  const ok = files({ 'p.md': pinned() });
  const r2 = check({ client: fakeGitHub({ tags: [{ name: 'v1.0.0', sha: 'ffffffff00' }] }).client, pinnedFile: ok.path('p.md') });
  assert.equal(r2.code, 1);
  assert.match(r2.lines.join('\n'), /a moved tag/);
  const down = { tags: () => { throw new Error('HTTP 403 network'); } };
  const r3 = check({ client: down, pinnedFile: ok.path('p.md') });
  assert.equal(r3.code, 1);
  assert.match(r3.lines.join('\n'), /upstream not reachable: HTTP 403/);
  assert.equal(check({ client: fakeGitHub().client, pinnedFile: join(tmp(), 'none.md') }).code, 1);
  const untagged = check({ client: fakeGitHub({ tags: [{ name: 'draft', sha: 'c' }] }).client, pinnedFile: ok.path('p.md') });
  assert.equal(untagged.code, 1);
  assert.match(untagged.lines.join('\n'), /has no version tag/);
});

// ---------- propose ----------

test('propose --dry-run prints the branch, files and body it would make and calls nothing that writes', () => {
  const gh = fakeGitHub();
  const f = files({ 'p.md': pinned(), 'fb.md': FEEDBACK(ENTRY(1, EDIT) + '\n' + ENTRY(2)) });
  const before = f.read('fb.md');
  const r = propose({ client: gh.client, feedbackFile: f.path('fb.md'), pinnedFile: f.path('p.md'), dryRun: true, now: NOW });
  assert.equal(r.code, 0);
  assert.deepEqual(gh.writes(), []);
  assert.equal(f.read('fb.md'), before, 'a dry run leaves the feedback file alone');
  const out = r.lines.join('\n');
  assert.match(out, /would open a pull request on zintaen\/auto-evolve-strategy: feedback\/umlimator-2026-11-24 -> main/);
  assert.match(out, /STRATEGY\.md: edited by F1/);
  assert.match(out, /### F2\. Problem 2[\s\S]*Text edit in this pull request: no, proposal only/);
});

test('propose opens one pull request upstream with the edited STRATEGY.md, a changelog entry and the evidence, closes the entries, never merges', () => {
  const gh = fakeGitHub();
  const f = files({ 'p.md': pinned(), 'fb.md': FEEDBACK(ENTRY(1, EDIT) + '\n' + ENTRY(2)) });
  const r = propose({ client: gh.client, feedbackFile: f.path('fb.md'), pinnedFile: f.path('p.md'), review: 'Reviewer: no contradictions found.', now: NOW });
  assert.equal(r.code, 0);
  assert.deepEqual(gh.calls.map(c => c[0]).filter(n => /merge/i.test(n)), [], 'no merge call');
  assert.deepEqual(gh.writes().map(c => c.slice(0, 3)), [
    ['createBranch', 'zintaen/auto-evolve-strategy', 'feedback/umlimator-2026-11-24'],
    ['putFile', 'zintaen/auto-evolve-strategy', 'feedback/umlimator-2026-11-24'],
    ['putFile', 'zintaen/auto-evolve-strategy', 'feedback/umlimator-2026-11-24'],
    ['openPull', 'zintaen/auto-evolve-strategy', 'feedback/umlimator-2026-11-24'],
  ]);
  const up = gh.repos['zintaen/auto-evolve-strategy'];
  const branch = up.branches['feedback/umlimator-2026-11-24'].files;
  assert.match(branch['STRATEGY.md'], /\| This plan \| `\.evolve\/STRATEGY\.md` \|/);
  assert.equal(up.branches.main.files['STRATEGY.md'], V1, 'main upstream is untouched');
  assert.match(branch['CHANGELOG.md'], /^# Changelog\n\n## Unreleased\n\n- A7\.5 \(from umlimator, fix round 51\): Problem 1\.\n- A7\.5 \(from umlimator, fix round 52\): Problem 2\.\n\n## 1\.1\.0/);
  const pr = up.pulls[0];
  assert.equal(pr.base, 'main');
  assert.match(pr.body, /- Evidence: commit abc1\./);
  assert.match(pr.body, /Reviewer: no contradictions found\./);
  assert.match(pr.body, /No agent merges this pull request/);
  const fb = parseFeedback(f.read('fb.md'));
  assert.deepEqual(fb.open, []);
  assert.deepEqual(fb.closed.map(e => [e.id, e.upstream]), [['F1', 'zintaen/auto-evolve-strategy#100 (2026-11-24)'], ['F2', 'zintaen/auto-evolve-strategy#100 (2026-11-24)']]);
  assert.deepEqual(feedbackProblems(fb), []);
});

test('propose: no open entries, an incomplete entry, or an open upstream pull request from this project open nothing', () => {
  const none = fakeGitHub();
  const f0 = files({ 'p.md': pinned(), 'fb.md': FEEDBACK('None.\n') });
  assert.match(propose({ client: none.client, feedbackFile: f0.path('fb.md'), pinnedFile: f0.path('p.md'), now: NOW }).lines[0], /nothing to propose/);
  const bad = fakeGitHub();
  const f1 = files({ 'p.md': pinned(), 'fb.md': FEEDBACK(ENTRY(1).replace(/^- Evidence: .*\n/m, '')) });
  const r1 = propose({ client: bad.client, feedbackFile: f1.path('fb.md'), pinnedFile: f1.path('p.md'), now: NOW });
  assert.equal(r1.code, 1);
  assert.match(r1.lines.join('\n'), /F1: no "Evidence" line/);
  const busy = fakeGitHub({ pulls: [{ number: 7, url: 'u7', head: 'feedback/umlimator-2026-11-01', title: 't' }] });
  const f2 = files({ 'p.md': pinned(), 'fb.md': FEEDBACK(ENTRY(1)) });
  const r2 = propose({ client: busy.client, feedbackFile: f2.path('fb.md'), pinnedFile: f2.path('p.md'), now: NOW });
  assert.match(r2.lines[0], /open already: #7/);
  for (const gh of [none, bad, busy]) assert.deepEqual(gh.writes(), []);
});

test('propose: an edit whose find text is not in the upstream file exactly once is left out and listed, not forced', () => {
  const r = applyEdits('a b a', [{ id: 'F9', edits: [{ find: 'a', replace: 'x' }, { find: 'b', replace: 'y' }] }]);
  assert.equal(r.text, 'a y a');
  assert.deepEqual(r.applied, ['F9']);
  assert.match(r.problems[0], /F9: the find text occurs 2 times/);
  assert.equal(applyEdits('$1 here', [{ id: 'F8', edits: [{ find: '$1 here', replace: '$& there' }] }]).text, '$& there', 'replacement text is literal');
});

test('changelog: entries join an Unreleased section, or start one above the newest version', () => {
  const e = [{ rule: 'C9', round: 'round 3', title: 'Skips' }];
  assert.equal(changelogEntry('# Changelog\n\n## 1.0.0\n\nFirst.\n', e, 'p'), '# Changelog\n\n## Unreleased\n\n- C9 (from p, round 3): Skips.\n\n## 1.0.0\n\nFirst.\n');
  assert.equal(changelogEntry('# Changelog\n\n## Unreleased\n\n- A1 (from q, round 1): Old.\n\n## 1.0.0\n\nFirst.\n', e, 'p'), '# Changelog\n\n## Unreleased\n\n- A1 (from q, round 1): Old.\n- C9 (from p, round 3): Skips.\n\n## 1.0.0\n\nFirst.\n');
  assert.equal(changelogSince(LOG, '1.0.0', '1.1.0'), '## 1.1.0 (1 Dec 2026)\n\nA13 added.');
});

test('feedback file: parse and write keep every entry and its fenced edits', () => {
  const text = FEEDBACK(ENTRY(1, EDIT) + '\n' + ENTRY(2));
  const fb = parseFeedback(text);
  assert.equal(fb.open.length, 2);
  assert.deepEqual(fb.open[0].edits, [{ find: '| This plan | `.evolve/strategy.md` |', replace: '| This plan | `.evolve/STRATEGY.md` |' }]);
  assert.equal(writeFeedback(fb), text);
  assert.throws(() => parseFeedback('# x\n\n## Closed\n\n## Open\n'), /"## Open" section followed by a "## Closed"/);
});

// ---------- update ----------

test('update --dry-run says what it would pin and writes nothing; up to date it does nothing', () => {
  const f = files({ 'p.md': pinned() });
  const same = fakeGitHub();
  const none = update({ client: same.client, pinnedFile: f.path('p.md'), now: NOW });
  assert.equal(none.code, 0);
  assert.match(none.lines[0], /nothing to update/);
  const gh = fakeGitHub({ tags: [{ name: 'v1.0.0', sha: 'b1abb6ed' }, { name: 'v1.1.0', sha: 'deadbeefcafe' }] });
  const r = update({ client: gh.client, pinnedFile: f.path('p.md'), dryRun: true, now: NOW });
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /would open a pull request on zintaen\/umlimator: strategy\/v1\.1\.0 -> main, replacing .* v1\.0\.0 with v1\.1\.0/);
  assert.deepEqual([...same.writes(), ...gh.writes()], []);
});

test('update opens a project pull request replacing the pinned copy with the new tag, byte for byte, with the changelog summary', () => {
  const f = files({ 'p.md': pinned() });
  const gh = fakeGitHub({ tags: [{ name: 'v1.0.0', sha: 'b1abb6ed' }, { name: 'v1.1.0', sha: 'deadbeefcafe' }] });
  const r = update({ client: gh.client, pinnedFile: '.evolve/STRATEGY.md', read: () => f.read('p.md'), now: NOW });
  assert.equal(r.code, 0);
  assert.deepEqual(gh.writes().map(c => c.slice(0, 4)), [
    ['createBranch', 'zintaen/umlimator', 'strategy/v1.1.0', 'abc12345'],
    ['putFile', 'zintaen/umlimator', 'strategy/v1.1.0', '.evolve/STRATEGY.md'],
    ['openPull', 'zintaen/umlimator', 'strategy/v1.1.0', 'main'],
  ]);
  const um = gh.repos['zintaen/umlimator'];
  const pin = readPin(um.branches['strategy/v1.1.0'].files['.evolve/STRATEGY.md']);
  assert.deepEqual([pin.version, pin.tag, pin.commit, pin.date, pin.intact, pin.body === V11], ['1.1.0', 'v1.1.0', 'deadbeefcafe', '2026-11-24', true, true]);
  assert.match(um.pulls[0].body, /## What changed upstream\n\n## 1\.1\.0 \(1 Dec 2026\)\n\nA13 added\./);
  assert.doesNotMatch(um.pulls[0].body, /First version/, 'only the versions after the pinned one');
  assert.deepEqual(gh.calls.map(c => c[0]).filter(n => /merge/i.test(n)), []);
  // a second run finds the open pull request and opens no other
  const again = update({ client: gh.client, pinnedFile: '.evolve/STRATEGY.md', read: () => f.read('p.md'), now: NOW });
  assert.match(again.lines[0], /open already: #100/);
});

test('the command line: usage exits 2, check prints its lines and exit code through the injected client', () => {
  const out = [];
  assert.equal(main(['nope'], { client: fakeGitHub().client, out: l => out.push(l) }), 2);
  assert.match(out[0], /^usage: strategy-sync\.mjs check\|propose\|update/);
  const lines = [];
  const code = main(['check', '--pinned', join(ROOT, '.evolve/STRATEGY.md')], { client: fakeGitHub().client, out: l => lines.push(l), now: NOW });
  assert.equal(code, 0);
  assert.deepEqual(lines, ['pinned: 1.0.0 (v1.0.0, commit b1abb6ed, pinned 2026-11-23)', 'up to date with zintaen/auto-evolve-strategy v1.0.0']);
});

// ---------- kill switch ----------

test('kill switch: .evolve/STOP on the named ref stops the session; none lets it go on; an unreadable ref stops it', () => {
  const dir = tmp();
  const git = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), 'a');
  git('add', '.'); git('commit', '-qm', 'a');
  assert.equal(killSwitch({ repo: dir, ref: 'main' }).stopped, false);
  assert.equal(killSwitch({ repo: dir, ref: 'main', file: '' }).stopped, true, 'an empty file name is no kill switch read: stopped (audit 72)');
  mkdirSync(join(dir, '.evolve'));
  writeFileSync(join(dir, '.evolve/STOP'), 'Stopped by the maintainer, 24 Nov 2026: budget.\n');
  assert.equal(killSwitch({ repo: dir, ref: 'main' }).stopped, false, 'an uncommitted STOP is not on main');
  git('add', '.'); git('commit', '-qm', 'stop');
  const s = killSwitch({ repo: dir, ref: 'main' });
  assert.equal(s.stopped, true);
  assert.match(s.text, /budget/);
  assert.equal(killSwitch({ repo: dir, ref: 'origin/main' }).stopped, true, 'a ref that cannot be read counts as stopped');
  const cli = spawnSync(process.execPath, [join(ROOT, 'tools/evolve/killswitch.mjs'), '--repo', dir, '--ref', 'main'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /kill switch set: \.evolve\/STOP on main/);
  assert.equal(killSwitch({ file: join(dir, 'nothing-here') }).stopped, false);
  assert.equal(killSwitch({ file: join(dir, '.evolve/STOP') }).stopped, true, 'the file beside the lease, where the rules file puts it there');
});

// ---------- templates ----------

// tools/evolve/templates/checklist.md: "| rule | template | search string |" rows; each string must be in that template
function checklist() {
  const text = readFileSync(join(ROOT, 'tools/evolve/templates/checklist.md'), 'utf8');
  return text.split('\n').filter(l => /^\| [^-|]/.test(l) && !/^\| Rule \|/.test(l)).map(l => {
    const [rule, file, search] = l.split(/ (?<!\\)\| /).map(s => s.replace(/^\| |\s*\|$/g, '').trim());
    return { rule, file, search: search.replace(/^`|`$/g, '').replace(/\\\|/g, '|') };
  });
}

test('every rule in the templates\' checklist (A10.3) is written into the template it names', () => {
  const rows = checklist();
  const names = readdirSync(join(ROOT, 'tools/evolve/templates')).filter(f => f !== 'checklist.md' && f !== 'README.md');
  assert.ok(rows.length >= 25, `only ${rows.length} checklist rows`);
  for (const n of names) assert.ok(rows.some(r => r.file === n), `${n} has no checklist row`);
  const missing = rows.filter(r => !readFileSync(join(ROOT, 'tools/evolve/templates', r.file), 'utf8').includes(r.search));
  assert.deepEqual(missing.map(r => `${r.file}: ${r.rule} (${r.search})`), []);
  for (const rule of ['C7', 'A9.3', 'A9.6', 'A9.7', 'A9.2', 'A9.19', 'A9.20', 'A9.24', 'A9.22', 'C9', 'A9.23', 'A9.21', 'A9.5', 'A4.2', 'A3.4', 'C3', 'A12'])
    assert.ok(rows.some(r => r.rule.startsWith(rule)), `no checklist row for ${rule}`);
});

test('the templates hold no machine paths, account tokens or host application names; paths come from args', () => {
  for (const n of readdirSync(join(ROOT, 'tools/evolve/templates'))) {
    const t = readFileSync(join(ROOT, 'tools/evolve/templates', n), 'utf8');
    assert.doesNotMatch(t, /\/Users\/|\/home\/|ghp_|github_pat_/, n);
    assert.doesNotMatch(t, /claude|anthropic/i, n);
  }
});

test('the audit and fix templates parse as workflow scripts', async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  for (const n of ['audit.js', 'fix.js', 'batch.js']) {
    const src = readFileSync(join(ROOT, 'tools/evolve/templates', n), 'utf8').replace(/^export const meta = /m, 'const meta = ');
    assert.doesNotThrow(() => new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', src), n);
  }
});

test('the templates call no clock or random source: the workflow runtime throws on Date.now(), an argless new Date() and Math.random() (audit 65 stopped on one)', () => {
  for (const n of readdirSync(join(ROOT, 'tools/evolve/templates')).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, 'tools/evolve/templates', n), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|\bMath\.random\s*\(/, `${n}: pass the time in args instead`);
  }
});

test('check: a pinned version newer than upstream\'s newest tag exits 1', () => {
  const f = files({ 'p.md': pinned(V1, { version: '1.2.0', tag: 'v1.2.0' }) });
  const r = check({ client: fakeGitHub().client, pinnedFile: f.path('p.md') });
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /newer than upstream's newest tag v1\.0\.0/);
});

test('changelog: a file with no version section gets the Unreleased block at its end; changelogSince stops at the target version', () => {
  assert.equal(changelogEntry('# Changelog\n', [{ rule: 'A1', round: 'r', title: 'T.' }], 'p'), '# Changelog\n\n## Unreleased\n\n- A1 (from p, r): T.\n\n');
  const log = '# Changelog\n\n## 1.2.0\n\nTwo.\n\n## 1.1.0\n\nOne.\n\n## 1.0.0\n\nZero.\n';
  assert.equal(changelogSince(log, '1.0.0', '1.1.0'), '## 1.1.0\n\nOne.');
  assert.equal(changelogSince(log, '1.0.0', '1.2.0'), '## 1.2.0\n\nTwo.\n\n## 1.1.0\n\nOne.');
  assert.throws(() => parseFeedback('# x\n\n## Open\n\nNone.\n'), /"## Open" section followed by a "## Closed"/);
});

test('the command line: update --dry-run and a client error, through the injected client', () => {
  const f = files({ 'p.md': pinned() });
  const gh = fakeGitHub({ tags: [{ name: 'v1.1.0', sha: 'deadbeefcafe' }] });
  const lines = [];
  assert.equal(main(['update', '--dry-run', '--pinned', f.path('p.md')], { client: gh.client, out: l => lines.push(l), now: NOW }), 0);
  assert.match(lines[0], /would open a pull request on zintaen\/umlimator: strategy\/v1\.1\.0 -> main/);
  assert.deepEqual(gh.writes(), []);
  const other = [];
  assert.equal(main(['update', '--dry-run', '--pinned', f.path('p.md'), '--repo', 'me/fork', '--base', 'audit-loop'], { client: { ...gh.client, branchSha: () => 'f00' , openPulls: () => [] }, out: l => other.push(l), now: NOW }), 0);
  assert.match(other[0], /on me\/fork: strategy\/v1\.1\.0 -> audit-loop/);
  const broken = { ...gh.client, tags: () => { throw new Error('HTTP 500'); } };
  const err = [];
  assert.equal(main(['update', '--pinned', f.path('p.md')], { client: broken, out: l => err.push(l) }), 1);
  assert.deepEqual(err, ['strategy-sync update: HTTP 500']);
});

test('kill switch command line: exit 0 with no switch, 2 on a usage error', () => {
  const dir = tmp();
  const run = (...a) => spawnSync(process.execPath, [join(ROOT, 'tools/evolve/killswitch.mjs'), ...a], { encoding: 'utf8' });
  const none = run('--file', join(dir, 'STOP'));
  assert.equal(none.status, 0);
  assert.match(none.stdout, /no kill switch at/);
  assert.equal(run('extra').status, 2);
  assert.equal(run('--file').status, 2);
  assert.equal(run('--ref').status, 2);
  assert.equal(run('--repo').status, 2);
});
