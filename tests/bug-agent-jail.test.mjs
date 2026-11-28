// The bug agent's jail (tools/bug_agent_jail.sh) and the verify job's sandbox (tools/bug_agent.mjs, runTest), checked for
// real. These need Linux, root through sudo, and a user to jail, so they run in the bug-agent-jail workflow
// (.github/workflows/bug-agent-jail.yml) with BUG_AGENT_JAIL_USER set, and are skipped everywhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../tools/bug_agent.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const user = process.env.BUG_AGENT_JAIL_USER;
const skip = !user || process.platform !== 'linux' ? 'runs in the bug-agent-jail workflow (Linux, sudo, BUG_AGENT_JAIL_USER)' : false;

const jail = mode => execFileSync('sudo', ['-n', 'bash', join(root, 'tools/bug_agent_jail.sh'), user, mode], { encoding: 'utf8' });
const as = args => spawnSync('sudo', ['-n', '-u', user, '-H', '--', ...args], { encoding: 'utf8', timeout: 60000 });
const status = (url, run = as) => {
  const r = run(['curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', url]);
  return r.status === 0 ? r.stdout : 'blocked';
};
const mine = args => spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 60000 });

test('bug agent jail, api: the API answers the jailed user, nothing else does, and the runner keeps its network', { skip }, () => {
  jail('api');
  assert.equal(status('https://api.anthropic.com/v1/models'), '401', 'the API is reached (no key, so 401)');
  for (const url of ['https://github.com', 'https://api.github.com', 'https://registry.npmjs.org', 'https://1.1.1.1', 'http://example.com',
    'https://[2606:4700:4700::1111]']) {
    assert.equal(status(url), 'blocked', url);
  }
  // another port on the API's own range is closed too
  assert.equal(status('http://api.anthropic.com'), 'blocked');
  // any HTTP answer proves the runner reaches the network; GitHub answers an unauthenticated runner 403 once the shared
  // runner address has used its hourly allowance, so the code itself is not pinned (a held runner gets no answer at all)
  assert.match(status('https://api.github.com', mine), /^[1-5]\d\d$/, 'the runner itself is not held');
});

test('bug agent jail: the user has no sudo, and cannot read the runner files', { skip }, () => {
  assert.notEqual(as(['sudo', '-n', 'true']).status, 0);
  for (const f of [process.env.GITHUB_ENV, process.env.GITHUB_OUTPUT, process.env.GITHUB_EVENT_PATH].filter(Boolean)) {
    assert.notEqual(as(['cat', f]).status, 0, f);
  }
  assert.doesNotMatch(as(['id', '-nG']).stdout, /\b(sudo|adm|admin|docker|root|wheel)\b/);
});

test('bug agent jail, local: the agent user reaches loopback (the proxy) and not the API itself', { skip }, async () => {
  jail('local');
  // the server runs in its own process: status() uses spawnSync, which would block a server in this one until curl gave up
  const { spawn } = await import('node:child_process');
  const server = spawn(process.execPath, ['-e', "const s = require('node:http').createServer((q, r) => r.end('ok')); s.listen(0, '127.0.0.1', () => console.log(s.address().port))"], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((ok, no) => { server.stdout.once('data', d => ok(String(d).trim())); server.once('exit', c => no(new Error(`server exited ${c}`))); });
  try {
    assert.equal(status(`http://127.0.0.1:${port}/`), '200');
    assert.equal(status('https://api.anthropic.com/v1/models'), 'blocked');
    assert.equal(status('https://github.com'), 'blocked');
  } finally { server.kill(); }
});

test('bug agent jail, none: not even the API', { skip }, () => {
  jail('none');
  assert.equal(status('https://api.anthropic.com/v1/models'), 'blocked');
  assert.equal(status('https://github.com'), 'blocked');
});

// The verify job's sandbox: the patch's test runs as the jailed user, with no network, in a copy of the tree with no .git.
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'bug-agent-jail-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  for (const d of ['src', 'lib', 'tests', 'tools']) mkdirSync(join(dir, d));
  writeFileSync(join(dir, 'tools/build.mjs'), "import { copyFileSync } from 'node:fs'; copyFileSync('src/a.mjs', 'lib/a.mjs');\n");
  writeFileSync(join(dir, 'src/a.mjs'), 'export const twice = x => x + x + 1;\n');
  writeFileSync(join(dir, 'lib/a.mjs'), 'export const twice = x => x + x + 1;\n');
  git('init', '-q'); git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  const edit = files => {
    for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, f), t);
    git('add', '-A');
    const patch = git('diff', '--cached', '--binary', '--no-renames');
    git('reset', '-q', '--hard', 'HEAD'); git('clean', '-fdq');
    return patch;
  };
  return { dir, edit, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const FIX = 'export const twice = x => x + x;\n';
const head = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../lib/a.mjs';\n";
const RESULT = { outcome: 'fixed', summary: 's', test: 'node --test tests/t.test.mjs' };

test('bug agent sandbox: a good fix passes, run as the jailed user', { skip }, () => {
  jail('none');
  process.env.BUG_AGENT_SANDBOX_USER = user;
  const r = repo();
  try {
    const patch = r.edit({ 'tests/t.test.mjs': head + "test('t', () => assert.equal(twice(2), 4));\n", 'src/a.mjs': FIX, 'lib/a.mjs': FIX });
    assert.deepEqual(verify(r.dir, RESULT, patch, 'ignore'), []);
  } finally { r.done(); delete process.env.BUG_AGENT_SANDBOX_USER; }
});

test('bug agent sandbox: the patch test has no network, no runner identity, and cannot write the checkout', { skip }, () => {
  jail('none');
  process.env.BUG_AGENT_SANDBOX_USER = user;
  const r = repo();
  try {
    const probe = join(r.dir, 'src/pwned');
    const t = head + "import { writeFileSync } from 'node:fs';\nimport { userInfo } from 'node:os';\n" +
      `test('t', async () => {\n  try { writeFileSync(${JSON.stringify(probe)}, 'x'); } catch {}\n` +
      `  assert.equal(twice(2), 4);\n  assert.equal(process.env.GITHUB_TOKEN, undefined);\n  assert.notEqual(userInfo().username, ${JSON.stringify(process.env.USER || 'runner')});\n` +
      "  const res = await fetch('https://api.github.com', { signal: AbortSignal.timeout(8000) });\n  assert.ok(res.ok);\n});\n";
    const patch = r.edit({ 'tests/t.test.mjs': t, 'src/a.mjs': FIX, 'lib/a.mjs': FIX });
    assert.deepEqual(verify(r.dir, RESULT, patch, 'ignore'), ['the test fails with the fix'], 'the fetch fails, so the test does');
    assert.equal(existsSync(probe), false, 'the checkout is not written');
    // the same test with the fetch taken out passes: what failed it was the network alone
    const offline = r.edit({ 'tests/t.test.mjs': t.replace(/  const res[^\n]*\n  assert\.ok\(res\.ok\);\n/, ''), 'src/a.mjs': FIX, 'lib/a.mjs': FIX });
    assert.deepEqual(verify(r.dir, RESULT, offline, 'ignore'), []);
    assert.equal(existsSync(probe), false);
  } finally { r.done(); delete process.env.BUG_AGENT_SANDBOX_USER; }
});

test('bug agent sandbox: the jailed test cannot rewrite or replace lib/, and a lib/ the build does not make is caught first', { skip }, () => {
  jail('none');
  process.env.BUG_AGENT_SANDBOX_USER = user;
  const r = repo();
  try {
    // a test that tries to overwrite lib/a.mjs, and to move lib/ aside and put its own in place, then passes only if
    // either worked
    const t = head + "import { writeFileSync, renameSync, mkdirSync } from 'node:fs';\n" +
      "test('t', () => {\n  let wrote = false;\n  try { writeFileSync('lib/a.mjs', 'x'); wrote = true; } catch {}\n" +
      "  try { renameSync('lib', 'lib-old'); mkdirSync('lib'); wrote = true; } catch {}\n  assert.equal(twice(2), 4);\n  assert.ok(wrote);\n});\n";
    const patch = r.edit({ 'tests/t.test.mjs': t, 'src/a.mjs': FIX, 'lib/a.mjs': FIX });
    assert.deepEqual(verify(r.dir, RESULT, patch, 'ignore'), ['the test fails with the fix'], 'neither write lands');
    // a patch lib/ that is not what src/ builds, with a test that would write it back: caught before the test runs
    const evil = FIX + '// not built\n';
    const back = head + `import { writeFileSync } from 'node:fs';\ntry { writeFileSync('lib/a.mjs', ${JSON.stringify(evil)}); } catch {}\n` +
      "test('t', () => assert.equal(twice(2), 4));\n";
    const p2 = r.edit({ 'tests/t.test.mjs': back, 'src/a.mjs': FIX, 'lib/a.mjs': evil });
    assert.deepEqual(verify(r.dir, RESULT, p2, 'ignore'), ['lib/ is not what src/ builds']);
  } finally { r.done(); delete process.env.BUG_AGENT_SANDBOX_USER; }
});
