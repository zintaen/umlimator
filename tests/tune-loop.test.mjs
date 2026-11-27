// The weekly layout loop (tools/evolve/tune-loop.mjs, docs/diagrams/notes/layout-flow.md section 9): its proposal, the
// ranges it refuses outside, the keep rules, the guards of section 9.3, the lease it holds, and the pull request it opens,
// all with fakes for the build, the scorer, git and gh: no network, no build, no layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as L from '../tools/evolve/tune-loop.mjs';
import { readLease } from '../tools/evolve/lease.mjs';

const TUNE = readFileSync(new URL('../src/layout/tune.js', import.meta.url), 'utf8');
const PINS = readFileSync(new URL('../bench/tune-pins.json', import.meta.url), 'utf8');
const tmp = () => mkdtempSync(join(tmpdir(), 'tune-loop-test-'));

test('tune-loop: every constant of tune.js the loop may change has a range its value is inside, and the others are fixed', async () => {
  const flat = L.flatten(await L.valuesOf(TUNE));
  for (const [path, v] of Object.entries(flat)) if (L.RANGES[path]) assert.equal(L.outOfRange(path, v), null, path);
  for (const path of ['FLOW_MIN', 'FLOW_WAYS', 'LABEL_PASSES', 'SCORE_WEIGHTS.issue', 'SCORE_WEIGHTS.areaPer']) assert.match(L.outOfRange(path, flat[path]), /not one the loop may change/, path);
});

test('tune-loop: the proposal is one value, in range, the same for the same week, and skips the last four weeks\' paths', async () => {
  const values = await L.valuesOf(TUNE), flat = L.flatten(values);
  const a = L.propose(values, '2026-W48'), b = L.propose(values, '2026-W48');
  assert.deepEqual(a, b);
  assert.equal(L.outOfRange(a.path, a.to), null);
  assert.notDeepEqual(a.to, flat[a.path]);
  const c = await L.checkCandidate(TUNE, L.setValue(TUNE, a.path, a.to));
  assert.ok(c.ok, c.reason);
  assert.deepEqual([c.path, c.to], [a.path, a.to]);
  const history = ['W44', 'W45', 'W46', 'W47'].map(w => ({ week: '2026-' + w, status: 'nothing-kept', proposal: { path: a.path } }));
  for (const w of ['2026-W48', '2026-W49', '2026-W50']) assert.notEqual(L.propose(values, w, history).path, a.path);
});

test('tune-loop: a candidate out of range, of a fixed value, of two values or of other text is refused', async () => {
  const refused = async (text, re) => { const c = await L.checkCandidate(TUNE, text); assert.equal(c.ok, false); assert.match(c.reason, re); };
  await refused(L.setValue(TUNE, 'BARY_SWEEPS', 40), /outside 2 to 16/);
  await refused(L.setValue(TUNE, 'SCORE_WEIGHTS.cross', 1000), /outside 50 to 300/);
  await refused(L.setValue(TUNE, 'ROW_SWEEPS', [1, 1, 1]), /not one of its choices/);
  await refused(TUNE.replace('const FLOW_MIN = 3', 'const FLOW_MIN = 4'), /not one the loop may change/);
  await refused(L.setValue(L.setValue(TUNE, 'FAN_IN', 7), 'FAN_TRIES', 16), /changes 2 values/);
  await refused(L.setValue(TUNE, 'FAN_IN', 7).replace('// untangle', '// changed'), /more of tune.js/);
  await refused(TUNE, /changes nothing/);
  const dir = tmp(), f = join(dir, 'cand.js'); writeFileSync(f, L.setValue(TUNE, 'BARY_SWEEPS', 40));
  const out = []; assert.equal(await L.main(['check', '--candidate', f], { print: s => out.push(s) }), 1);
  assert.match(out[0], /outside 2 to 16/);
});

const corpus = (score, base, extra = {}) => ({ total: { score, hard: extra.hard ?? 0 }, base: { score: base, hard: extra.baseHard ?? 0, time: 1 }, problems: extra.problems ?? 0 });

test('tune-loop: the keep rules of section 9.2', () => {
  const good = { fixed: corpus(98, 100), edits: corpus(10, 10), heldout: corpus(50, 50) };
  assert.equal(L.decide(good).keep, true);
  assert.match(L.decide({ ...good, fixed: corpus(99.5, 100) }).why.join(), /not 1 percent under/);
  assert.match(L.decide({ ...good, fixed: corpus(90, 100, { problems: 2 }) }).why.join(), /2 rule\(s\) broken/);
  assert.match(L.decide({ ...good, edits: corpus(9, 10, { problems: 1 }) }).why.join(), /edit corpus/);
  assert.match(L.decide({ ...good, heldout: corpus(51, 50) }).why.join(), /held-out corpus: total 51/);
  assert.match(L.decide({ ...good, heldout: corpus(49, 50, { hard: 1 }) }).why.join(), /held-out/);
  assert.match(L.decide({ ...good, heldout: null }).why.join(), /no LAYOUT_HELDOUT_SEED/);
  // a revert needs the held-out total better, not the fixed corpus 1 percent better
  assert.equal(L.decide({ ...good, fixed: corpus(100, 100), heldout: corpus(49, 50) }, { revert: true }).keep, true);
  assert.equal(L.decide({ ...good, fixed: corpus(100, 100), heldout: corpus(50, 50) }, { revert: true }).keep, false);
});

test('tune-loop: two weeks with nothing kept stop the loop, and a change kept last week is reverted first', async () => {
  const nk = w => ({ week: w, status: 'nothing-kept' });
  assert.equal(L.stopped([nk('2026-W46'), nk('2026-W47')]), true);
  assert.equal(L.stopped([nk('2026-W46'), { week: '2026-W47', status: 'kept' }]), false);
  assert.equal(L.stopped([nk('2026-W47')]), false);
  const flat = L.flatten(await L.valuesOf(TUNE));
  const kept = { week: '2026-W47', status: 'kept', proposal: { path: 'FAN_IN', from: 5, to: 6 } };
  assert.deepEqual(L.revertOf([kept], flat), { path: 'FAN_IN', from: 6, to: 5, why: 'revert FAN_IN to 5: week 2026-W47 kept 6', revert: '2026-W47' });
  assert.equal(L.revertOf([{ ...kept, proposal: { path: 'FAN_IN', from: 6, to: 7 } }], flat), null); // not merged: tune.js does not have it
});

// audit bh1 8: the records come from other runs' artifacts, so a record of another shape, a later week or a value out of
// range is not read, and only the loop's own runs (schedule, workflow_dispatch on the loop's branches) supply them
test('tune-loop: history is read only from records run() could have written, for earlier weeks, from the loop\'s own runs', async () => {
  const hist = tmp(), put = (dir, name, r) => { mkdirSync(join(hist, dir), { recursive: true }); writeFileSync(join(hist, dir, name), typeof r === 'string' ? r : JSON.stringify(r)); };
  const good = [{ week: '2026-W45', status: 'nothing-kept', proposal: { path: 'FAN_IN', from: 5, to: 6 } }, { week: '2026-W46', status: 'refused', proposal: null },
    { week: '2026-W47', status: 'kept', proposal: { path: 'BARY_SWEEPS', from: 8, to: 9, why: 'x' } }];
  good.forEach((r, i) => put(String(100 + i), `tune-${r.week}.json`, r));
  const bad = [
    { week: '9999-W99', status: 'nothing-kept' }, { week: '2026-W48', status: 'nothing-kept' }, // this week and a later one
    { week: '2026-W47 [notes](https://evil.example) #1', status: 'kept', proposal: { path: 'BARY_SWEEPS', from: 14, to: 8 } },
    { week: '2026-W44', status: 'merged' }, { week: '2026-W44', status: 'kept' }, { week: 202644, status: 'stopped' },
    { week: '2026-W43', status: 'kept', proposal: { path: 'FLOW_MIN', from: 3, to: 4 } }, { week: '2026-W43', status: 'kept', proposal: { path: 'BARY_SWEEPS', from: 8, to: 99 } },
    { week: '2026-W43', status: 'kept', proposal: { path: '__proto__', from: 1, to: 2 } }, { week: '2026-W43', status: 'kept', proposal: 'BARY_SWEEPS' }, [], null,
  ];
  bad.forEach((r, i) => put(String(200 + i), `tune-x${i}.json`, r));
  put('300', 'tune-broken.json', '{ not json');
  assert.deepEqual(L.loadHistory([hist], '2026-W48'), good);
  for (const r of bad) assert.ok(L.badRecord(r, '2026-W48'), JSON.stringify(r));
  for (const r of good) assert.equal(L.badRecord(r, '2026-W48'), null);
  // the repro of the audit: two forged nothing-kept weeks after the real ones no longer stop the loop, and a forged kept
  // record no longer picks the revert or writes its week into the pull request
  put('400', 'tune-2026-W49.json', { week: '2026-W49', status: 'nothing-kept' }); put('401', 'tune-2026-W50.json', { week: '2026-W50', status: 'nothing-kept' });
  const h = L.loadHistory([hist], '2026-W48'), flat = L.flatten(await L.valuesOf(TUNE));
  assert.equal(L.stopped(h), false);
  assert.equal(L.revertOf(h, flat), null); // the last real record kept BARY_SWEEPS 9, which tune.js does not have
  const forged = { week: '2026-W47 [notes](https://evil.example) #1', status: 'kept', proposal: { path: 'FAN_IN', from: flat.FAN_IN, to: flat.FAN_IN } };
  assert.equal(L.revertOf([forged], flat), null); // revertOf reads only a record of the shape run() writes, history or not
  // the run list: only the loop's own successful runs on its branches
  const runs = [
    { databaseId: 1, conclusion: 'success', event: 'schedule', headBranch: 'main' },
    { databaseId: 2, conclusion: 'success', event: 'workflow_dispatch', headBranch: 'audit-loop' },
    { databaseId: 3, conclusion: 'success', event: 'pull_request', headBranch: 'main' },
    { databaseId: 4, conclusion: 'success', event: 'pull_request_target', headBranch: 'audit-loop' },
    { databaseId: 5, conclusion: 'success', event: 'workflow_dispatch', headBranch: 'evil' },
    { databaseId: 6, conclusion: 'failure', event: 'schedule', headBranch: 'main' },
    { databaseId: 7, conclusion: 'success', event: 'push', headBranch: 'main' },
    { databaseId: '8; rm -rf /', conclusion: 'success', event: 'schedule', headBranch: 'main' },
    null,
  ];
  assert.deepEqual(L.historyRuns(runs, ['main', 'audit-loop']), ['1', '2']);
  assert.deepEqual(L.historyRuns(runs, ['audit-loop']), ['2']);
  assert.deepEqual(L.historyRuns({ not: 'a list' }, ['main']), []);
  const f = join(tmp(), 'runs.json'); writeFileSync(f, JSON.stringify(runs));
  const out = []; assert.equal(await L.main(['history-runs', '--runs-file', f, '--branch', 'main', '--branch', 'audit-loop'], { print: s => out.push(s) }), 0);
  assert.deepEqual(out, ['1\n2']);
  assert.equal(await L.main(['history-runs', '--runs-file', f], { print: () => {} }), 2);
});

// a fake repository: tune.js and lib/, with a fake build, scorer, git and gh
function fakeRepo({ fixed = corpus(98, 100), edits = corpus(10, 10), heldout = corpus(50, 50), failRun = [] } = {}) {
  const root = tmp(); mkdirSync(join(root, 'src/layout'), { recursive: true }); mkdirSync(join(root, 'lib'));
  mkdirSync(join(root, 'bench')); writeFileSync(join(root, L.PINS), PINS);
  writeFileSync(join(root, L.TUNE), TUNE); writeFileSync(join(root, 'lib/umlimator-all.js'), '// base\n'); writeFileSync(join(root, 'lib/umlimator.js'), '// base\n');
  const calls = [], seeds = [];
  const exec = (cmd, args, o = {}) => {
    calls.push([cmd, ...args]);
    if (cmd === 'node' && args[0] === 'tools/build.mjs') { writeFileSync(join(root, 'lib/umlimator-all.js'), '// built from ' + readFileSync(join(root, L.TUNE), 'utf8').length + '\n'); return { status: 0, stdout: '', stderr: '' }; }
    if (cmd === 'node' && args[0] === 'bench/score.mjs') {
      const c = args[args.indexOf('--corpus') + 1]; seeds.push([c, (o.env || {}).LAYOUT_HELDOUT_SEED]);
      writeFileSync(args[args.indexOf('--out') + 1], JSON.stringify({ fixed, edits, heldout }[c])); return { status: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'gh' && args[0] === 'workflow' && failRun.includes(args[2])) return { status: 1, stdout: '', stderr: `could not create workflow dispatch event for ${args[2]}` };
    if (cmd === 'gh') return { status: 0, stdout: args[0] === 'pr' ? 'https://example.invalid/pull/1\n' : '', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { root, calls, seeds, exec };
}
const env = (dir, seed = 's3cret') => ({ PATH: process.env.PATH, EVOLVE_LEASE: join(dir, 'lease.json'), ...(seed ? { LAYOUT_HELDOUT_SEED: seed } : {}) });
const NOW = new Date('2026-11-29T13:00:00Z'), go = { kill: { stopped: false } };

test('tune-loop: run measures each corpus against the base, holds the lease while it does, keeps a good change and writes the record', async () => {
  const f = fakeRepo(), dir = tmp(), rec = join(dir, 'rec.json'), cand = join(dir, 'cand.js');
  let held = null;
  const exec = (cmd, args, o) => { if (args[0] === 'bench/score.mjs' && !held) held = readLease(join(dir, 'lease.json')); return f.exec(cmd, args, o); };
  const r = await L.run({ owner: 'loop-1', record: rec, candidateOut: cand }, { ...go, exec, env: env(dir), root: f.root, now: NOW });
  assert.equal(r.status, 'kept', r.decision.join());
  assert.equal(r.week, '2026-W48');
  assert.equal(held.owner, 'loop-1');
  assert.equal(existsSync(join(dir, 'lease.json')), false, 'released');
  assert.deepEqual(f.seeds, [['fixed', undefined], ['edits', undefined], ['heldout', 's3cret']], 'the seed reaches the held-out run only');
  assert.equal(readFileSync(join(f.root, L.TUNE), 'utf8'), TUNE, 'tune.js put back');
  assert.equal(readFileSync(join(f.root, 'lib/umlimator-all.js'), 'utf8'), '// base\n', 'lib/ put back');
  assert.deepEqual(JSON.parse(readFileSync(rec, 'utf8')), r);
  assert.ok((await L.checkCandidate(TUNE, readFileSync(cand, 'utf8'))).ok);
  assert.ok(!JSON.stringify(r).includes('s3cret'));
});

test('tune-loop: without the seed, with a worse score, a live lease or the kill switch, nothing is kept', async () => {
  let f = fakeRepo(), dir = tmp();
  assert.equal((await L.run({ owner: 'a' }, { ...go, exec: f.exec, env: env(dir, ''), root: f.root, now: NOW })).status, 'nothing-kept');
  f = fakeRepo({ fixed: corpus(99.9, 100) }); dir = tmp();
  const r = await L.run({ owner: 'a' }, { ...go, exec: f.exec, env: env(dir), root: f.root, now: NOW });
  assert.equal(r.status, 'nothing-kept'); assert.match(r.decision.join(), /1 percent/);
  dir = tmp(); writeFileSync(join(dir, 'lease.json'), JSON.stringify({ owner: 'audit-65', started: NOW.toISOString(), heartbeat: NOW.toISOString(), expires: '2026-11-29T14:00:00Z' }));
  const held = await L.run({ owner: 'a' }, { ...go, exec: f.exec, env: env(dir), root: f.root, now: NOW });
  assert.equal(held.status, 'refused'); assert.match(held.decision[0], /held by audit-65/);
  const k = await L.run({ owner: 'a' }, { kill: { stopped: true, reason: 'kill switch set' }, exec: f.exec, env: env(tmp()), root: f.root, now: NOW });
  assert.equal(k.status, 'refused');
});

test('tune-loop: two weeks with nothing kept stop the run until --restart', async () => {
  const f = fakeRepo(), hist = tmp();
  ['2026-W46', '2026-W47'].forEach(w => writeFileSync(join(hist, `tune-${w}.json`), JSON.stringify({ week: w, status: 'nothing-kept' })));
  const r = await L.run({ owner: 'a', history: [hist] }, { ...go, exec: f.exec, env: env(tmp()), root: f.root, now: NOW });
  assert.equal(r.status, 'stopped');
  assert.equal(f.calls.length, 0, 'nothing built or measured');
  assert.equal((await L.run({ owner: 'a', history: [hist], restart: true }, { ...go, exec: f.exec, env: env(tmp()), root: f.root, now: NOW })).status, 'kept');
});

test('tune-loop: publish opens one pull request against audit-loop and never merges', async () => {
  const f = fakeRepo(), dir = tmp(), rec = join(dir, 'rec.json'), cand = join(dir, 'cand.js');
  await L.run({ owner: 'a', record: rec, candidateOut: cand }, { ...go, exec: f.exec, env: env(dir), root: f.root, now: NOW });
  f.calls.length = 0;
  const r = await L.publish({ record: rec, candidate: cand }, { exec: f.exec, root: f.root });
  assert.equal(r.branch, 'layout-tune/2026-W48');
  const gh = f.calls.filter(c => c[0] === 'gh');
  assert.equal(gh.length, 3);
  assert.deepEqual(gh[0].slice(0, 7), ['gh', 'pr', 'create', '--base', 'audit-loop', '--head', 'layout-tune/2026-W48']);
  // then CI on the branch: a pull request opened with the workflow's token starts none, a workflow_dispatch does
  assert.deepEqual(gh.slice(1), [['gh', 'workflow', 'run', 'check.yml', '--ref', 'layout-tune/2026-W48'], ['gh', 'workflow', 'run', 'layout-score.yml', '--ref', 'layout-tune/2026-W48', '-f', 'heldout=false']]);
  assert.deepEqual(r.notStarted, []);
  assert.ok(!f.calls.some(c => c.includes('merge')), 'no merge');
  assert.ok(f.calls.some(c => c[0] === 'git' && c[1] === 'add' && c.includes('src/layout/tune.js') && c.includes('bench/tune-pins.json') && c.includes('bench/results/tune-2026-11-29.json')));
  assert.ok(existsSync(join(f.root, 'bench/results/tune-2026-11-29.json')));
  // the pin moved with the value, one line of the pins file, and the pins are tune.js's values again
  const rec0 = JSON.parse(readFileSync(rec, 'utf8')), pinsNow = readFileSync(join(f.root, L.PINS), 'utf8');
  assert.equal(JSON.parse(pinsNow).values[rec0.proposal.path], rec0.proposal.to);
  assert.equal(pinsNow.split('\n').filter((l, i) => l !== PINS.split('\n')[i]).length, 1);
  assert.equal(L.pinsMismatch(JSON.parse(pinsNow), L.flatten(await L.valuesOf(readFileSync(join(f.root, L.TUNE), 'utf8')))), null);
  writeFileSync(join(f.root, L.PINS), PINS);
  // a record that kept nothing, or a candidate that is not the record's, is not published
  const bad = join(dir, 'bad.js'); writeFileSync(bad, L.setValue(TUNE, 'BARY_SWEEPS', 40));
  writeFileSync(join(f.root, L.TUNE), TUNE);
  await assert.rejects(L.publish({ record: rec, candidate: bad }, { exec: f.exec, root: f.root }), /refused/);
  writeFileSync(rec, JSON.stringify({ ...JSON.parse(readFileSync(rec, 'utf8')), status: 'nothing-kept' }));
  await assert.rejects(L.publish({ record: rec, candidate: cand }, { exec: f.exec, root: f.root }), /nothing to publish/);
});

test('tune-loop: publish refuses when the pins do not match tune.js, and reports a CI workflow it could not start', async () => {
  const f = fakeRepo({ failRun: ['check.yml'] }), dir = tmp(), rec = join(dir, 'rec.json'), cand = join(dir, 'cand.js');
  await L.run({ owner: 'a', record: rec, candidateOut: cand }, { ...go, exec: f.exec, env: env(dir), root: f.root, now: NOW });
  // a hand edit of tune.js without its pin: the pins no longer match, as tests/tune.test.mjs would say
  const edited = L.setValue(TUNE, 'FAN_TRIES', 16), pins = JSON.parse(PINS);
  assert.match(L.pinsMismatch(pins, L.flatten(await L.valuesOf(edited))), /FAN_TRIES/);
  assert.equal(L.pinsMismatch(pins, L.flatten(await L.valuesOf(TUNE))), null);
  writeFileSync(join(f.root, L.PINS), L.pinsText({ ...pins, values: { ...pins.values, FAN_TRIES: 16 } }));
  await assert.rejects(L.publish({ record: rec, candidate: cand }, { exec: f.exec, root: f.root }), /does not match/);
  writeFileSync(join(f.root, L.PINS), PINS);
  f.calls.length = 0;
  const out = [], code = await L.main(['publish', '--record', rec, '--candidate', cand], { exec: f.exec, root: f.root, print: s => out.push(s) });
  assert.equal(code, 1, 'the pull request is open, but a workflow did not start');
  assert.match(out.join('\n'), /not started on layout-tune\/2026-W48, run it by hand: check\.yml/);
  assert.ok(f.calls.some(c => c[0] === 'gh' && c[1] === 'workflow' && c[3] === 'layout-score.yml'), 'the next workflow is still started');
});

test('tune-loop: the scheduled workflow runs at the recorded slot, passes the seed to one step only, and never merges', () => {
  const y = readFileSync(new URL('../.github/workflows/layout-loop.yml', import.meta.url), 'utf8');
  assert.match(y, /cron: "0 20 \* \* 6"/);
  assert.match(y, /^permissions: \{\}$/m);
  assert.equal((y.match(/secrets\.LAYOUT_HELDOUT_SEED/g) || []).length, 2, 'once to say whether it is set, once into the measuring step');
  assert.ok(!/pull_request_target/.test(y));
  assert.ok(!/gh pr merge|git merge/.test(y));
  const s = readFileSync(new URL('../.github/workflows/layout-score.yml', import.meta.url), 'utf8');
  assert.ok(!/pull_request_target/.test(s));
  assert.match(s, /^permissions:\n  contents: read$/m);
  // CI on the loop's pull request: the publish job alone may start workflows, and holds no secret
  const publish = y.slice(y.indexOf('\n  publish:'));
  assert.equal((y.match(/actions: write/g) || []).length, 1);
  assert.match(publish, /^      actions: write /m);
  assert.ok(!/secrets\./.test(publish), 'no secret in the publish job');
  const c = readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8');
  assert.match(c.slice(0, c.indexOf('\njobs:')), /^  workflow_dispatch:/m, 'check.yml can be started on a branch');
  assert.ok(!/pull_request_target/.test(c));
  assert.match(s, /^  workflow_dispatch:\n    inputs:\n      heldout:/m, 'layout-score.yml can be started without the held-out run');
  assert.match(s, /HAS_SEED: \$\{\{ \(github\.event_name == 'push' \|\| inputs\.heldout == true\) && secrets\.LAYOUT_HELDOUT_SEED != '' \}\}/, 'never on a pull request');
});

test('tune-loop: the weekly digest lists the week\'s record with --tune, and says when the loop has stopped', async () => {
  const { digest } = await import('../tools/evolve/digest.mjs');
  const audits = tmp(), tune = tmp(); mkdirSync(join(tune, '123'));
  writeFileSync(join(tune, '123', 'tune-2026-W48.json'), JSON.stringify({ week: '2026-W48', date: '2026-11-28', status: 'kept', proposal: { path: 'FAN_IN', from: 6, to: 7 },
    fixed: { score: 98, baseScore: 100 }, edits: { score: 10, baseScore: 10 }, heldout: { score: 50, baseScore: 50 }, decision: ['kept: every rule of section 9.2 holds'] }));
  writeFileSync(join(tune, 'tune-2026-W40.json'), JSON.stringify({ week: '2026-W40', date: '2026-10-01', status: 'stopped', decision: [] }));
  const md = digest({ audits, fixes: false, repo: audits, date: '2026-11-30', tune });
  assert.match(md, /## Layout tuning loop\n\n- 2026-W48: kept, FAN_IN 6 to 7\. Fixed 100 to 98; edits 10 to 10; held-out 50 to 50\. kept: every rule/);
  assert.ok(!md.includes('W40'), 'a record outside the week is left out');
  writeFileSync(join(tune, 'tune-2026-W49.json'), JSON.stringify({ week: '2026-W49', date: '2026-11-29', status: 'stopped', decision: ['two weeks'] }));
  assert.match(digest({ audits, fixes: false, repo: audits, date: '2026-11-30', tune }), /The loop has stopped/);
  assert.ok(!digest({ audits, fixes: false, repo: audits, date: '2026-11-30' }).includes('Layout tuning'), 'no section without --tune');
});
