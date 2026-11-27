#!/usr/bin/env node
// Runs one protected test file for tools/protect.mjs (audit 72) and says what each of its tests did. It is started by
// protect.mjs only, as a plain process (no test flags of the process around it, such as a --test-name-pattern, reach the
// file's run), and runs the file with node:test's own run(): node:test starts the file in a process of its own, with
// tools/assert-watch.mjs preloaded and the (timed) tests skipped, and this process reads the run's event stream. The file
// is given no report file or path that it could name and write a pass into (audit 71's TAP file was named on its command
// line, where process.execArgv read it).
//
//   node tools/protect-run.mjs <test file> <assert-watch URL> <timeout ms>   (a key on stdin, which protect.mjs closes)
//
// What it says it writes on stdout, one JSON line each, each with an HMAC of the line under the key read from stdin before
// the file starts: { name, line, column, status: 'ok' | 'not ok' | 'skip' } for every test of the file that ended,
// { stderr } for what the file wrote on stderr, { forged } when the run's events report what its tests did not do, and
// { late: true } when the run did not end in the time given. The key is read and stdin is at its end before the file's
// process starts, so that process, which can open this one's stdout on Linux (/proc/<pid>/fd/1), cannot sign a line it
// writes there; protect.mjs reads only signed lines.
//
// The events come from the file's own process, on its stdout, where the file can write frames of node:test's own (audit
// 73: a pass for a test that never ran, and then an exit). So a pass counts only where tools/assert-watch.mjs, preloaded
// in that process before the file, signed one: it reads a second key from a file named in PROTECT_KEY_FILE and removes
// both before the file loads, and adds to each test's report a diagnostic { seq, name, status } signed with it. A run
// whose events hold more passes of a title than the preload signed, or a signed diagnostic that is not right (a wrong
// signature, a number seen before), is { forged }. The file's process runs with node's permission model, every permission
// granted but the inspector's, so it cannot read the preload's key out of its memory through node:inspector.
import { run } from 'node:test';
import { createHmac, hash, randomBytes } from 'node:crypto';
import { realpathSync, readFileSync, writeFileSync, writeSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [file, watch, ms] = process.argv.slice(2);
const key = readFileSync(0, 'utf8'), real = realpathSync(file); // node:test names the file by its real path
const say = o => { const line = JSON.stringify(o); writeSync(1, `${createHmac('sha256', key).update(line).digest('hex')} ${line}\n`); };
const inner = randomBytes(32).toString('hex'), dir = mkdtempSync(join(tmpdir(), 'umlimator-protect-key-')), keyFile = join(dir, 'key');
writeFileSync(keyFile, inner, { mode: 0o600 });
const MARK = 'protect-ran ', passes = new Map(), signed = new Map(), seqs = new Set();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
let forged = null;
const ALLOW = ['--permission', '--allow-fs-read=*', '--allow-fs-write=*', '--allow-child-process', '--allow-worker', '--allow-addons', '--allow-wasi'];
const stop = new AbortController(), timer = setTimeout(() => stop.abort(), Number(ms));
try {
  for await (const { type, data } of run({ files: [file], isolation: 'process', execArgv: [...ALLOW, '--import', watch], env: { ...process.env, PROTECT_KEY_FILE: keyFile }, testSkipPatterns: [/\(timed\)/], signal: stop.signal })) {
    if (type === 'test:stderr') say({ stderr: data.message });
    else if (type === 'test:diagnostic' && typeof data.message === 'string' && data.message.startsWith(MARK)) {
      const rest = data.message.slice(MARK.length), sp = rest.indexOf(' '), body = rest.slice(sp + 1);
      let r = null;
      try { if (sp > 0 && rest.slice(0, sp) === hash('sha256', inner + hash('sha256', inner + body))) r = JSON.parse(body); } catch {}
      if (!r || seqs.has(r.seq)) forged ??= 'a signed result that its preload did not sign';
      else { seqs.add(r.seq); if (r.status === 'ok') bump(signed, r.name); }
    } else if ((type === 'test:pass' || type === 'test:fail') && data.details?.type !== 'suite') {
      const skip = data.skip !== undefined || data.todo !== undefined;
      const whole = data.nesting === 0 && data.name === file; // the run's own report of the whole file, made in this process
      if (type === 'test:pass' && !skip && !whole) bump(passes, data.name);
      if (data.file === real && data.line !== undefined) say({ name: data.name, line: data.line, column: data.column, status: skip ? 'skip' : type === 'test:pass' ? 'ok' : 'not ok' });
    }
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
clearTimeout(timer);
for (const [name, n] of passes) if (n > (signed.get(name) || 0)) forged ??= `a pass of "${name}" that no test of it gave`;
if (forged) say({ forged });
if (stop.signal.aborted) say({ late: true });
