// The self-evolving loop's tools in tools/evolve/: the ownership lease (lease.mjs), the findings ledger's circuit
// breakers (ledger.mjs), the weekly digest (digest.mjs) and the fuzz run (fuzz.mjs), each against records and targets
// made here in a temporary folder, with no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as lease from '../tools/evolve/lease.mjs';
import { breakers, report, families } from '../tools/evolve/ledger.mjs';
import { digest, sample, knownGaps } from '../tools/evolve/digest.mjs';
import { loadAudits, loadFixes, symptom, titleKey } from '../tools/evolve/records.mjs';
import { seeded, duration, parseArgs } from '../tools/evolve/args.mjs';
import { fuzz, findScripts, mutateText, mutateJson, shrinkText, shrinkJson, signature, runScript } from '../tools/evolve/fuzz.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOLS = join(ROOT, 'tools/evolve');
const tmp = () => mkdtempSync(join(tmpdir(), 'umlimator-evolve-'));
const node = (tool, args, opts = {}) => spawnSync(process.execPath, [join(TOOLS, tool), ...args], { encoding: 'utf8', ...opts });
const at = s => new Date(s);

// ---------- lease ----------

test('lease: a free lease is taken; a live one refuses another owner and keeps its holder', () => {
  const f = join(tmp(), 'lease.json');
  const a = lease.take(f, 'A', { now: at('2026-11-22T10:00:00Z'), ttl: 60 * 60e3 });
  assert.equal(a.ok, true);
  assert.deepEqual(a.lease, { owner: 'A', started: '2026-11-22T10:00:00.000Z', heartbeat: '2026-11-22T10:00:00.000Z', expires: '2026-11-22T11:00:00.000Z' });
  const b = lease.take(f, 'B', { now: at('2026-11-22T10:59:59Z') });
  assert.equal(b.ok, false);
  assert.match(b.reason, /held by A until 2026-11-22T11:00:00.000Z/);
  assert.equal(lease.readLease(f).owner, 'A');
});

test('lease: a takeover only after expiry, recorded with the owner it replaced', () => {
  const f = join(tmp(), 'lease.json');
  lease.take(f, 'A', { now: at('2026-11-22T10:00:00Z') });
  assert.equal(lease.take(f, 'B', { now: at('2026-11-22T11:00:00Z') }).ok, false, 'at the expiry instant it is still live');
  const b = lease.take(f, 'B', { now: at('2026-11-22T11:00:01Z') });
  assert.equal(b.ok, true);
  assert.equal(b.lease.owner, 'B');
  assert.equal(b.lease.started, '2026-11-22T11:00:01.000Z');
  assert.deepEqual(b.lease.tookOverFrom, { owner: 'A', expired: '2026-11-22T11:00:00.000Z' });
  // the old owner's heartbeat after the takeover is refused: it must stop
  const late = lease.renew(f, 'A', { now: at('2026-11-22T11:00:02Z') });
  assert.equal(late.ok, false);
  assert.match(late.reason, /names B, not A: stop/);
});

test('lease: renew moves heartbeat and expiry and keeps started; only the owner renews or releases', () => {
  const f = join(tmp(), 'lease.json');
  lease.take(f, 'A', { now: at('2026-11-22T10:00:00Z'), ttl: 30 * 60e3 });
  const r = lease.renew(f, 'A', { now: at('2026-11-22T10:20:00Z'), ttl: 30 * 60e3 });
  assert.equal(r.ok, true);
  assert.equal(r.lease.started, '2026-11-22T10:00:00.000Z');
  assert.equal(r.lease.heartbeat, '2026-11-22T10:20:00.000Z');
  assert.equal(r.lease.expires, '2026-11-22T10:50:00.000Z');
  assert.equal(lease.renew(f, 'B', { now: at('2026-11-22T10:21:00Z') }).ok, false);
  assert.equal(lease.release(f, 'B').ok, false);
  assert.ok(existsSync(f));
  assert.equal(lease.release(f, 'A').ok, true);
  assert.ok(!existsSync(f));
  assert.equal(lease.renew(f, 'A').ok, false, 'nothing to renew once released');
});

test('lease: check says free, live or expired, and with --owner whether it is live and yours', () => {
  const f = join(tmp(), 'lease.json');
  assert.deepEqual([lease.check(f).ok, lease.check(f).state], [true, 'free']);
  lease.take(f, 'A', { now: at('2026-11-22T10:00:00Z') });
  const now = at('2026-11-22T10:30:00Z');
  assert.deepEqual([lease.check(f, undefined, { now }).ok, lease.check(f, undefined, { now }).state], [false, 'live']);
  assert.equal(lease.check(f, 'A', { now }).ok, true);
  assert.equal(lease.check(f, 'B', { now }).ok, false);
  const later = at('2026-11-22T12:00:00Z');
  assert.deepEqual([lease.check(f, undefined, { now: later }).ok, lease.check(f, undefined, { now: later }).state], [true, 'expired']);
  assert.match(lease.check(f, 'A', { now: later }).reason, /expired: renew/);
});

test('lease: the file comes from --file, else $EVOLVE_LEASE, else .evolve/lease.json, which git ignores', () => {
  assert.equal(lease.leasePath({ file: '/x/a.json' }, { EVOLVE_LEASE: '/y/b.json' }), '/x/a.json');
  assert.equal(lease.leasePath({}, { EVOLVE_LEASE: '/y/b.json' }), '/y/b.json');
  assert.equal(lease.leasePath({}, {}), join(process.cwd(), '.evolve/lease.json'));
  const r = spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', '.evolve/lease.json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, '.evolve/lease.json is gitignored');
  assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', '.evolve/fuzz/x.mmd']).status, 0, '.evolve/fuzz/ is gitignored');
});

test('lease: the command line prints the lease and exits 0 done, 1 refused, 2 usage', () => {
  const d = tmp(), env = { ...process.env, EVOLVE_LEASE: join(d, 'l.json') };
  const t = node('lease.mjs', ['take', '--owner', 'A', '--ttl', '10m', '--now', '2026-11-22T10:00:00Z'], { env });
  assert.equal(t.status, 0, t.stderr);
  assert.equal(JSON.parse(t.stdout).lease.expires, '2026-11-22T10:10:00.000Z');
  const b = node('lease.mjs', ['take', '--owner', 'B', '--now', '2026-11-22T10:05:00Z'], { env });
  assert.equal(b.status, 1);
  assert.match(b.stderr, /held by A/);
  assert.equal(node('lease.mjs', ['check', '--owner', 'A', '--now', '2026-11-22T10:05:00Z'], { env }).status, 0);
  assert.equal(node('lease.mjs', ['take', '--now', '2026-11-22T10:05:00Z'], { env }).status, 2, 'take needs --owner');
  assert.equal(node('lease.mjs', ['steal', '--owner', 'A'], { env }).status, 2);
  assert.equal(node('lease.mjs', ['take', '--owner', 'A', '--ttl', 'soon'], { env }).status, 2);
});

test('lease: of several sessions taking an expired lease at once, exactly one wins', async () => {
  const d = tmp(), f = join(d, 'l.json');
  lease.take(f, 'old', { now: at('2026-01-01T00:00:00Z') });
  const run = owner => new Promise(done => {
    const p = spawn(process.execPath, [join(TOOLS, 'lease.mjs'), 'take', '--owner', owner, '--file', f]);
    p.on('exit', code => done(code));
  });
  const codes = await Promise.all(['s1', 's2', 's3', 's4', 's5', 's6'].map(run));
  assert.equal(codes.filter(c => c === 0).length, 1, `exit codes ${codes}`);
  assert.equal(codes.filter(c => c === 1).length, 5);
  assert.ok(!existsSync(f + '.lock'), 'the lock is gone');
});

test('lease: a lock left by a crashed writer is broken once stale; a fresh one makes the writer wait and give up', () => {
  const d = tmp(), f = join(d, 'l.json');
  mkdirSync(f + '.lock');
  const old = new Date(Date.now() - 60e3);
  execFileSync('touch', ['-t', `${old.getFullYear()}${String(old.getMonth() + 1).padStart(2, '0')}${String(old.getDate()).padStart(2, '0')}${String(old.getHours()).padStart(2, '0')}${String(old.getMinutes()).padStart(2, '0')}.${String(old.getSeconds()).padStart(2, '0')}`, f + '.lock']);
  assert.equal(lease.take(f, 'A').ok, true);
  mkdirSync(f + '.lock');
  assert.throws(() => lease.take(f, 'B'), /held by another writer/);
  rmSync(f + '.lock', { recursive: true });
});

// ---------- ledger ----------

const finding = (title, severity = 'low', extra = {}) => ({ title, severity, area: 'x', files: 'src/a.js', verdict: { real: true, reason: 'ok' }, ...extra });

function auditsDir(rounds) {
  const d = tmp();
  for (const [n, confirmed, rejected = []] of rounds) writeFileSync(join(d, `audit${n}.json`), JSON.stringify({ confirmed, rejected }));
  return d;
}

test('ledger: a title confirmed in three rounds, the latest among them, trips (a); in two it does not', () => {
  const two = loadAudits(auditsDir([[1, [finding('Mermaid reader drops a note on line 3', 'medium')]], [2, [finding('other', 'medium')]], [3, [finding('Mermaid reader drops a note on line 12', 'medium')]]]));
  assert.ok(!breakers(two).triggers.some(t => t.breaker === 'a'));
  const twoLow = loadAudits(auditsDir([[1, [finding('Mermaid reader drops a note on line 3')]], [2, [finding('other')]], [3, [finding('Mermaid reader drops a note on line 12')]]]));
  assert.equal(breakers(twoLow).verdict, 'continue');
  const three = loadAudits(auditsDir([[1, [finding('Mermaid reader drops a note on line 3')]], [2, [finding('Mermaid reader drops a note on line 7', 'low')]], [3, [finding('Mermaid reader drops a note on line 12')]]]));
  const r = breakers(three);
  assert.equal(r.verdict, 'stop');
  const a = r.triggers.find(t => t.breaker === 'a' && t.key.startsWith('title:'));
  assert.deepEqual(a.rounds, [1, 2, 3]);
  assert.match(report(r), /\(a\) back again: title: mermaid reader drops a note on line #, rounds 1, 2, 3/);
  assert.match(report(r), /verdict: stop/);
});

test('ledger: (a) needs the latest round and counts only rounds inside the window', () => {
  const old = [[1, [finding('Same bug')]], [2, [finding('Same bug')]], [3, [finding('Same bug')]], [4, [finding('fresh')]]];
  assert.equal(breakers(loadAudits(auditsDir(old))).triggers.filter(t => t.breaker === 'a').length, 0, 'not back in the latest round');
  const spread = [[1, [finding('Same bug')]], [10, [finding('Same bug')]], [30, [finding('Same bug')]]];
  assert.equal(breakers(loadAudits(auditsDir(spread)), { window: 20 }).triggers.filter(t => t.breaker === 'a').length, 0, 'round 1 is outside the window of 20');
  assert.equal(breakers(loadAudits(auditsDir(spread)), { window: 30 }).triggers.filter(t => t.breaker === 'a').length, 1);
});

test('ledger: the same file and symptom under different titles is one family', () => {
  const r = breakers(loadAudits(auditsDir([
    [5, [finding('Sequence reader hangs on a long alt block', 'medium', { files: ['src/readers/mermaid-sequence.js:40'] })]],
    [6, [finding('Quadratic time in the participant list', 'low', { files: 'src/readers/mermaid-sequence.js' })]],
    [7, [finding('Note parsing never returns on nested quotes', 'medium', { files: 'src/readers/mermaid-sequence.js (readNote)' })]],
  ])));
  assert.deepEqual(r.triggers.map(t => t.key), ['file: src/readers/mermaid-sequence.js | symptom: hang']);
  // the finding's own symptom field wins over the title's words
  assert.equal(symptom({ title: 'it hangs', symptom: 'Overlap' }), 'overlap');
  assert.equal(symptom({ title: 'a label is misplaced' }), null);
  assert.deepEqual(families({ title: 'A 3x thing', files: 'a/b.js c.py' }).sort(), ['title: a #x thing']);
  assert.equal(titleKey('`apply()` "drops" 12 items!'), 'apply drops # items');
});

test('ledger: a family a verifier marked as a regression twice, once in the latest round, trips (b)', () => {
  const reg = t => finding(t, 'medium', { files: 'src/x.js', verdict: { real: true, cause: 'regression' } });
  const r = breakers(loadAudits(auditsDir([[1, [reg('Pins lost after undo')]], [2, []], [3, [reg('Pins lost after undo')]]])));
  assert.deepEqual(r.triggers.map(t => t.breaker), ['b']);
  assert.equal(breakers(loadAudits(auditsDir([[1, [reg('Pins lost after undo')]], [2, [finding('Pins lost after undo')]]]))).verdict, 'continue');
});

test('ledger: three rounds with no fall in high plus medium trip (c); a fall in any of them does not', () => {
  let serial = 0;
  const word = () => { let n = ++serial, w = ''; while (n) { w += 'abcdefghijklmnopqrstuvwxyz'[n % 26]; n = Math.floor(n / 26); } return w; };
  const m = n => Array.from({ length: n }, () => finding(`finding ${word()}`, 'medium', { files: '' }));
  const flat = loadAudits(auditsDir([[1, m(1)], [2, m(2)], [3, m(2)]]));
  const r = breakers(flat);
  assert.deepEqual(r.triggers.map(t => t.breaker), ['c']);
  assert.deepEqual(r.triggers[0].rounds, [1, 2, 3]);
  assert.match(r.triggers[0].cause, /unknown/);
  assert.equal(breakers(loadAudits(auditsDir([[1, m(3)], [2, m(2)], [3, m(2)]]))).verdict, 'continue', 'round 2 fell');
  assert.equal(breakers(loadAudits(auditsDir([[1, m(1)], [2, m(1)], [3, []]]))).verdict, 'continue', 'round 3 has none');
  assert.equal(breakers(loadAudits(auditsDir([[0, m(9)], [1, m(1)], [2, m(1)], [3, m(1)]]))).verdict, 'stop', 'a fall before the three rounds does not matter');
  assert.equal(breakers(loadAudits(auditsDir([[2, m(1)], [3, m(1)]]))).verdict, 'continue', 'two rounds are not three');
  // where causes are recorded, (c) needs more than half of each round's high and medium to be ledger or regression
  const c = (n, cause) => Array.from({ length: n }, () => finding(`finding ${word()}`, 'high', { files: '', verdict: { real: true, cause } }));
  assert.equal(breakers(loadAudits(auditsDir([[1, c(2, 'ledger')], [2, c(2, 'regression')], [3, [...c(2, 'ledger'), ...c(1, 'new')]]]))).verdict, 'stop');
  assert.equal(breakers(loadAudits(auditsDir([[1, c(2, 'ledger')], [2, c(2, 'new')], [3, c(2, 'ledger')]]))).verdict, 'continue');
});

test('ledger: reads a workflow run that wraps the audit in `result`, and leaves out findings a verifier refused', () => {
  const d = tmp();
  writeFileSync(join(d, 'audit7.json'), JSON.stringify({ summary: 's', result: { confirmed: [finding('a'), finding('b', 'high', { verdict: { real: false } })], rejected: [{ title: 'r', why: 'no' }] } }));
  writeFileSync(join(d, 'audit7-b2.json'), JSON.stringify({ confirmed: [finding('c', 'low')], rejected: [] }));
  writeFileSync(join(d, 'notes.json'), '{}');
  const [a] = loadAudits(d);
  assert.equal(a.round, 7);
  assert.deepEqual(a.confirmed.map(f => f.title).sort(), ['a', 'c']);
  assert.equal(a.rejected.length, 1);
});

test('ledger: the command line exits 1 on stop, 0 on continue, 2 on a usage error', () => {
  const stop = auditsDir([[1, [finding('Same')]], [2, [finding('Same')]], [3, [finding('Same')]]]);
  const s = node('ledger.mjs', [stop]);
  assert.equal(s.status, 1);
  assert.match(s.stdout, /verdict: stop/);
  const go = auditsDir([[1, [finding('one', 'low')]], [2, [finding('two', 'low')]]]);
  const g = node('ledger.mjs', [go, '--json']);
  assert.equal(g.status, 0);
  assert.equal(JSON.parse(g.stdout).verdict, 'continue');
  assert.equal(node('ledger.mjs', []).status, 2);
  assert.equal(node('ledger.mjs', [join(go, 'missing')]).status, 2);
});

// ---------- digest ----------

function repoWithTag(d) {
  const git = (...a) => execFileSync('git', ['-C', d, ...a], { env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-20T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-20T10:00:00Z', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' } });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(d, 'a.txt'), '1');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'Audit 3 core: a fix');
  git('commit', '-q', '--allow-empty', '-m', 'Merge pull request #7 from someone/lane');
  git('tag', '-a', 'v9.9.9', '-m', 'v9.9.9');
  writeFileSync(join(d, 'gaps.md'), '# Changes\n\n- **Known gaps.** Old gap.\n\n- **Known gaps.** A pin is lost after undo.\n');
}

function digestFixture() {
  const d = tmp(), audits = join(d, 'audits');
  mkdirSync(audits);
  const rej = (n, k) => Array.from({ length: k }, (_, i) => ({ title: `rejected ${n}.${i}`, why: `reason ${n}.${i}` }));
  writeFileSync(join(audits, 'audit1.json'), JSON.stringify({ date: '2026-11-01T00:00:00Z', confirmed: [finding('old', 'high')], rejected: rej(1, 2) }));
  writeFileSync(join(audits, 'audit2.json'), JSON.stringify({ date: '2026-11-18T00:00:00Z', confirmed: [finding('x', 'medium'), finding('y', 'low')], rejected: rej(2, 4) }));
  writeFileSync(join(audits, 'audit3.json'), JSON.stringify({ confirmed: [finding('z', 'low')], rejected: rej(3, 3) })); // dated by its "Audit 3" commit
  writeFileSync(join(audits, 'fix2.json'), JSON.stringify([{ branch: 'fix2-a', fixed: [1, 2], skipped: [3] }]));
  utimesSync(join(audits, 'fix2.json'), new Date('2026-11-19T00:00:00Z'), new Date('2026-11-19T00:00:00Z')); // dated by its modification time, fixed so the test does not depend on today
  repoWithTag(d);
  return { d, audits };
}

test('digest: rounds, the severity trend, releases, breakers, known gaps and a dated spot check', () => {
  const { d, audits } = digestFixture();
  const md = digest({ audits, repo: d, date: '2026-11-22', gaps: join(d, 'gaps.md') });
  assert.match(md, /^# Weekly digest, 2026-11-16 to 2026-11-22\n/);
  assert.match(md, /Audits written this week: 2, 3 \(2 rounds\)\. Confirmed: 0 high, 1 medium, 2 low; rejected by the verifiers: 7\./);
  assert.ok(!/Audits written this week: 1,/.test(md), 'audit 1 is dated before the week');
  assert.match(md, /\| 1 \| 1 \| 0 \| 0 \| 2 \|\n\| 2 \| 0 \| 1 \| 1 \| 4 \|\n\| 3 \| 0 \| 0 \| 1 \| 3 \|/);
  assert.match(md, /High plus medium went from 1 in round 1 to 0 in round 3\./);
  assert.match(md, /Released: v9\.9\.9 \(2026-11-20\)\./);
  assert.match(md, /main gained 2 commits, with 1 pull request merged \(#7\)\./);
  assert.match(md, /## Open known gaps\n\n- A pin is lost after undo\.\n/);
  assert.ok(!md.includes('Old gap'), 'only the last Known gaps item is open');
  assert.match(md, /3 of the 7 rejected findings of this week, picked with 2026-11-22 as the seed/);
  const picks = [...md.matchAll(/Audit (\d): rejected (\d\.\d)\n\n {3}Verifier: reason (\d\.\d)/g)];
  assert.equal(picks.length, 3);
  for (const p of picks) { assert.equal(p[2], p[3], 'each pick shows its own verifier reason'); assert.ok(['2', '3'].includes(p[1])); }
});

test('digest: the sample is the same for the same date and moves with the date', () => {
  const { d, audits } = digestFixture();
  const spot = date => digest({ audits, repo: d, date, gaps: join(d, 'gaps.md'), days: 60 }).split('## Spot check')[1];
  assert.equal(spot('2026-11-22'), spot('2026-11-22'));
  const seen = new Set(['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(x => spot(x).replace(/picked with \S+/, '')));
  assert.ok(seen.size > 1, 'another date picks another sample');
  // the shuffle itself: k distinct items of the pool, the same for the same seed
  const pool = [...'abcdefghij'];
  assert.deepEqual(sample(pool, 3, seeded('2026-11-22')), sample(pool, 3, seeded('2026-11-22')));
  assert.equal(new Set(sample(pool, 3, seeded('x'))).size, 3);
  assert.deepEqual(sample(['a', 'b'], 3, seeded('x')).sort(), ['a', 'b']);
});

test('digest: with no rejected finding in the week it samples the last three audits; the command line writes --out', () => {
  const { d, audits } = digestFixture();
  const md = digest({ audits, repo: d, date: '2026-12-30', gaps: join(d, 'gaps.md') });
  assert.match(md, /No audit was written this week\./);
  assert.match(md, /of the last three audits \(none this week\)/);
  const out = join(d, 'digest.md');
  const r = node('digest.mjs', ['--audits', audits, '--fixes', audits, '--repo', d, '--date', '2026-11-22', '--gaps', join(d, 'gaps.md'), '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(out, 'utf8'), /Fix rounds this week: 2, 1 lanes, 2 findings fixed, 1 skipped\./);
  assert.equal(node('digest.mjs', []).status, 2);
  assert.equal(node('digest.mjs', ['--audits', audits, '--date', 'tomorrow']).status, 2);
});

test('digest: known gaps are the last Known gaps item, else every bullet', () => {
  assert.deepEqual(knownGaps('- **Known gaps.** one\n- **Known gaps.** two'), ['two']);
  assert.deepEqual(knownGaps('# Gaps\n\n- a\n* b\ntext'), ['a', 'b']);
});

test('records: fix rounds from a list, { lanes }, or a workflow log of result events', () => {
  const d = tmp();
  writeFileSync(join(d, 'fix4.json'), JSON.stringify({ lanes: [{ fixed: [1], skipped: [] }] }));
  writeFileSync(join(d, 'fix5.jsonl'), [JSON.stringify({ type: 'result', label: 'fix5-a', result: { fixed: [1, 2], skipped: [3] } }), 'not json', JSON.stringify({ type: 'log' })].join('\n'));
  const f = loadFixes(d);
  assert.deepEqual(f.map(x => [x.round, x.lanes.length]), [[4, 1], [5, 1]]);
  assert.equal(f[1].lanes[0].branch, 'fix5-a');
});

test('args: durations, flags and the seeded generator', () => {
  assert.equal(duration('90s'), 90e3);
  assert.equal(duration('2h'), 72e5);
  assert.equal(duration(undefined, 5), 5);
  assert.throws(() => duration('soon'), /not a duration/);
  assert.deepEqual(parseArgs(['a', '--x', '1', '--y=2', '--z']), { flags: { x: '1', y: '2', z: true }, rest: ['a'] });
  const a = seeded('s'), b = seeded('s');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

// ---------- fuzz ----------

// targets made here: `boom` throws on any input holding BOOM, `loop` never returns on one holding LOOP, `json` throws
// on an object with a key "bad"
const TARGETS = `
export const targets = [
  { name: 'boom', kind: 'text', ext: 'txt', grace: 50, available: () => true,
    seeds: () => [Array.from({ length: 40 }, (_, i) => 'line ' + i + (i === 23 ? ' xx BOOM yy' : '')).join('\\n')],
    mutate: t => t,
    check(t) { if (t.includes('BOOM')) { const e = new Error('boom at ' + t.length); e.stack = 'Error\\n    at check (/w/src/readers/fake.js:1:1)'; throw e; } } },
  { name: 'loop', kind: 'text', ext: 'txt', grace: 50, available: () => true,
    seeds: () => ['a\\nLOOP\\nb'], mutate: t => t,
    check(t) { if (t.includes('LOOP')) for (;;) {} } },
  { name: 'json', kind: 'json', ext: 'json', grace: 50, available: () => true,
    seeds: () => [JSON.stringify({ keep: [1, 2, 3], deep: { bad: 'yes', other: 'x'.repeat(40) }, more: 'text' })], mutate: t => t,
    check(t) { const walk = v => { if (v && typeof v === 'object') { if (Object.prototype.hasOwnProperty.call(v, 'bad')) throw new Error('bad key'); Object.values(v).forEach(walk); } }; walk(JSON.parse(t)); } },
  { name: 'never', kind: 'text', available: () => 'not here', seeds: () => ['x'], check() {} },
];
`;

function targetsModule() {
  const d = tmp(), f = join(d, 'targets.mjs');
  writeFileSync(f, TARGETS);
  return { d, f };
}

test('fuzz: a crash is shrunk to a small input and written with its report and a repro command that fails', async () => {
  const { d, f } = targetsModule(), out = join(d, 'found');
  const r = await fuzz({ module: f, names: ['boom', 'never'], budgetMs: 3000, hangMs: 500, shrinkMs: 5000, seed: 's', out, scanTests: false });
  assert.deepEqual(r.skipped, [{ target: 'never', why: 'not here' }]);
  assert.equal(r.findings.length, 1);
  const [x] = r.findings;
  assert.equal(x.kind, 'crash');
  const input = readFileSync(x.data, 'utf8');
  assert.equal(input, 'BOOM', 'shrunk to the four characters that matter');
  assert.match(x.info, /boom-[0-9a-f]{10}\.finding\.json$/);
  const info = JSON.parse(readFileSync(x.info, 'utf8'));
  assert.equal(info.target, 'boom');
  assert.equal(info.seed, 's');
  assert.ok(info.originalLength > 300 && info.shrunkLength === 4);
  assert.match(info.repro, /fuzz\.mjs --repro .*boom-[0-9a-f]{10}\.txt --target boom --targets-module /);
  const repro = node('fuzz.mjs', ['--repro', x.data, '--target', 'boom', '--targets-module', f]);
  assert.equal(repro.status, 1);
  assert.match(repro.stdout, /boom: crash: boom at 4/);
  writeFileSync(join(d, 'ok.txt'), 'fine');
  assert.equal(node('fuzz.mjs', ['--repro', join(d, 'ok.txt'), '--target', 'boom', '--targets-module', f]).status, 0);
  // a second run finds the same signature and writes nothing new
  const again = await fuzz({ module: f, names: ['boom'], budgetMs: 1500, hangMs: 500, shrinkMs: 2000, seed: 's', out, scanTests: false });
  assert.equal(again.findings.length, 0);
  assert.equal(readdirSync(out).length, 2);
});

test('fuzz: an input that never returns is stopped as a hang, shrunk and written', async () => {
  const { d, f } = targetsModule(), out = join(d, 'found');
  const r = await fuzz({ module: f, names: ['loop'], budgetMs: 4000, hangMs: 150, shrinkMs: 20000, seed: 's', out, scanTests: false });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].kind, 'hang');
  assert.equal(readFileSync(r.findings[0].data, 'utf8'), 'LOOP');
});

test('fuzz: JSON shrinks by keys and items to the part that fails', async () => {
  const { d, f } = targetsModule(), out = join(d, 'found');
  const r = await fuzz({ module: f, names: ['json'], budgetMs: 2000, hangMs: 500, shrinkMs: 5000, seed: 's', out, scanTests: false });
  assert.equal(r.findings.length, 1);
  assert.notEqual(r.findings[0].data, r.findings[0].info, 'a JSON input and its report are two files');
  assert.deepEqual(JSON.parse(readFileSync(r.findings[0].data, 'utf8')), { deep: { bad: 'y' } });
  assert.equal(JSON.parse(readFileSync(r.findings[0].info, 'utf8')).message, 'bad key');
});

test('fuzz: the whole run, shrinking included, keeps to its budget', async () => {
  const { d, f } = targetsModule();
  const t0 = Date.now();
  await fuzz({ module: f, names: ['loop', 'boom'], budgetMs: 2000, hangMs: 150, shrinkMs: 60000, seed: 's', out: join(d, 'found'), scanTests: false });
  assert.ok(Date.now() - t0 < 2000 + 1500, `took ${Date.now() - t0} ms`);
});

test('fuzz: fuzz scripts are found by name (not test files) and run for their share with a log', () => {
  const d = tmp();
  mkdirSync(join(d, 'sub'));
  writeFileSync(join(d, 'r42-import-fuzz.py'), 'print("ok")\n');
  writeFileSync(join(d, 'sub', 'hostile-gen.mjs'), 'console.log("made"); process.exit(3);\n');
  writeFileSync(join(d, 'fuzz.test.mjs'), '');
  writeFileSync(join(d, 'other.mjs'), '');
  const found = findScripts([d]);
  assert.deepEqual(found.map(p => p.slice(d.length + 1)), ['r42-import-fuzz.py', 'sub/hostile-gen.mjs']);
  const out = join(d, 'logs');
  const r = runScript(found[1], { budgetMs: 10000, out });
  assert.deepEqual([r.status, r.failed, r.timedOut], [3, true, false]);
  assert.match(readFileSync(r.log, 'utf8'), /made/);
  writeFileSync(join(d, 'slow-fuzz.mjs'), 'setInterval(() => {}, 1000);\n');
  const slow = runScript(join(d, 'slow-fuzz.mjs'), { budgetMs: 300, out });
  assert.deepEqual([slow.timedOut, slow.failed], [true, false], 'a script stopped at its budget is not a failure');
});

test('fuzz: mutation is repeatable by seed; signatures ignore numbers and quoted text', () => {
  const text = 'a --> b\nc --> d\nnote "x"';
  assert.equal(mutateText(text, seeded('q')), mutateText(text, seeded('q')));
  const json = JSON.stringify({ a: [1, 2], b: { c: 'd' } });
  assert.equal(mutateJson(json, seeded('q')), mutateJson(json, seeded('q')));
  const stack = 'Error\n    at readNote (/x/src/readers/mermaid-sequence.js:10:5)';
  assert.equal(signature('t', { kind: 'crash', message: 'bad "a" at 12', stack }), signature('t', { kind: 'crash', message: 'bad "bbb" at 400', stack }));
  assert.notEqual(signature('t', { kind: 'crash', message: 'bad', stack }), signature('t', { kind: 'hang', message: 'bad', stack }));
});

test('fuzz: shrinkers keep what fails and stop at their budget', async () => {
  const forever = { ok: () => true };
  assert.equal(await shrinkText('a\nb\nKEEP\nc', async s => s.includes('KEEP'), forever), 'KEEP');
  assert.equal(await shrinkJson('{"a":1,"b":{"k":2}}', async s => s.includes('"k"'), forever), '{\n "b": {\n  "k": 2\n }\n}');
  const none = { ok: () => false };
  assert.equal(await shrinkText('a\nKEEP', async () => true, none), 'a\nKEEP');
});

test('fuzz: the repository targets list the importers, and the command line lists them and checks its flags', () => {
  const r = node('fuzz.mjs', ['--list']);
  assert.equal(r.status, 0, r.stderr);
  for (const name of ['structurizr-json', 'structurizr-dsl', 'c4-plantuml', 'mermaid-class', 'mermaid-sequence', 'mermaid-map', 'bpmn', 'cloud-compose', 'cloud-kubernetes']) assert.match(r.stdout, new RegExp(`^${name}\\b`, 'm'));
  assert.equal(node('fuzz.mjs', ['--repro', 'x.txt', '--target', 'nope']).status, 2);
  assert.equal(node('fuzz.mjs', ['--budget', 'soon']).status, 2);
});

test('fuzz: every repository target passes its own seeds', async () => {
  const { targets } = await import('../tools/evolve/fuzz-targets.mjs');
  for (const t of targets) {
    if (t.available() !== true) continue;
    for (const s of t.seeds()) await t.check(s, { hangMs: 30000 });
  }
});

// ---------- lessons ----------

test('lessons: the seed file holds each lesson with the rule that prevents it', () => {
  const text = readFileSync(join(ROOT, 'docs/diagrams/LESSONS.md'), 'utf8');
  const lessons = text.split('\n').filter(l => /^## /.test(l));
  assert.ok(lessons.length >= 8, `${lessons.length} lessons`);
  const blocks = text.split(/\n(?=## )/).slice(1);
  for (const b of blocks) assert.match(b, /\nRule: \S/, `a lesson without a rule: ${b.split('\n')[0]}`);
});
