// The release smoke test (tools/smoke.mjs, CI's smoke job between publishing under `next` and moving `latest`), run on
// tarballs packed here in place of the registry: this commit's package passes, in Node and in the CLI's page, and a
// broken one fails at the step that found it, with the reason, so the release job leaves `latest` where it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const root = new URL('../', import.meta.url).pathname, tool = join(root, 'tools/smoke.mjs');
const work = mkdtempSync(join(tmpdir(), 'smoke-test-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

// this commit's package as npm packs it, with `change(dir)` applied to a copy of its files first
let n = 0;
async function pack(change = () => {}) {
  const dir = join(work, `pkg-${++n}`), out = join(work, `tgz-${n}`);
  mkdirSync(out);
  for (const f of ['package.json', 'lib', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) cpSync(join(root, f), join(dir, f), { recursive: true });
  change(dir);
  const { stdout } = await promisify(execFile)('npm', ['pack', '--silent', '--pack-destination', out], { cwd: dir });
  return join(out, stdout.trim().split('\n').pop());
}

async function smoke(...args) {
  try {
    const r = await promisify(execFile)(process.execPath, [tool, ...args], { cwd: root, env: { ...process.env, SMOKE_TRIES: '1' }, maxBuffer: 1 << 24 });
    return { code: 0, out: r.stdout };
  } catch (e) { return { code: e.code, out: e.stdout + e.stderr }; }
}

const edit = (file, f) => (dir) => writeFileSync(join(dir, file), f(readFileSync(join(dir, file), 'utf8')));

test('smoke: this commit\'s package installs into an empty folder and works in Node and in the CLI\'s page', async () => {
  const r = await smoke(await pack());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^install: umlimator \d+\.\d+\.\d+ from /m);
  assert.match(r.out, /^node: imported umlimator and umlimator\/all .*\d+ view\(s\) laid out, \d+ card\(s\), validate and check clean$/m);
  assert.match(r.out, /^cli: umlimator\.py render and check .* with the installed lib: \d+ views? checked, no error$/m);
  assert.match(r.out, /^smoke: umlimator \d+\.\d+\.\d+ ok$/m);
});

test('smoke: the CLI draws with the installed package\'s lib/, not the checkout\'s', async () => {
  const marked = await pack(edit('lib/umlimator-all.js', (s) => `/* built for the smoke test */\n${s}`));
  const r = await smoke(marked);
  assert.equal(r.code, 0, `a page drawn with the checkout's lib would not hold the marked file: ${r.out}`);
});

for (const [what, change, step, reason] of [
  ['umlimator/all throws on import', edit('lib/umlimator-all.js', () => 'throw new Error("a broken build");\n'), 'node', /a broken build/],
  ['the schema is missing', (dir) => rmSync(join(dir, 'lib/umlimator.schema.json')), 'node', /schema\.json/],
]) {
  test(`smoke: ${what}: it fails at its ${step} step, with the reason, and says nothing passed`, async () => {
    const r = await smoke(await pack(change), '--no-cli');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`^::error::smoke: ${step}: `, 'm'));
    assert.match(r.out, reason);
    assert.ok(!/^smoke: .* ok$/m.test(r.out), r.out);
  });
}

test('smoke: a package that cannot be installed fails at install, naming what npm said', async () => {
  const r = await smoke(join(work, 'no-such-umlimator.tgz'), '--no-cli');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^::error::smoke: install: npm install .*no-such-umlimator\.tgz/m);
});

test('smoke: --repo must hold the released commit\'s examples', async () => {
  const r = await smoke(await pack(), '--repo', work, '--no-cli');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^::error::smoke: example: .*--repo must be a checkout of the released commit/m);
});

// audit 71: an option it did not know was dropped, so a mistyped --no-cli ran the CLI step; it is a usage error now, before
// anything is installed
test('smoke: an option or argument it does not know, or --repo with no folder, is a usage error (exit 2) before anything is installed', async () => {
  for (const [args, said] of [[['umlimator@0.0.0', '--no-clii'], 'unknown option --no-clii'], [['umlimator@0.0.0', '--repo'], '--repo takes a folder'],
    [['umlimator@0.0.0', '--repo', '--no-cli'], '--repo takes a folder'], [['umlimator@0.0.0', 'umlimator@0.0.1'], 'unknown argument umlimator@0.0.1'],
    [['umlimator@0.0.0', '--repo', '.', '--no-cli', '-v'], 'unknown option -v']]) {
    const r = await smoke(...args);
    assert.deepEqual([r.code, r.out.trim()], [2, `::error::smoke: usage: ${said}: node tools/smoke.mjs <spec> [--repo <dir>] [--no-cli]`], String(args));
  }
});

