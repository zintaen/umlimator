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
// the file starts: { name, path, line, column, status: 'ok' | 'not ok' | 'skip' } for every test of the file that ended,
// { stderr } for what the file wrote on stderr, { forged } when the run's events report what its tests did not do, and
// { late: true } when the run did not end in the time given. The key is read and stdin is at its end before the file's
// process starts, so that process, which can open this one's stdout on Linux (/proc/<pid>/fd/1), cannot sign a line it
// writes there; protect.mjs reads only signed lines.
//
// The events come from the file's own process, on its stdout, where the file can write frames of node:test's own (audit
// 73: a pass for a test that never ran, and then an exit). So a pass counts only where tools/assert-watch.mjs, preloaded
// in that process before the file, signed one: it reads a second key from a file named in PROTECT_KEY_FILE and removes
// both before the file loads, and adds to each test's report a diagnostic signed with it. A signed diagnostic that is not
// right (a wrong signature, a number seen before) makes the run { forged }. The file's process runs with node's permission
// model, with no inspector (which reads any value of the preload's), no native addons and no WASI (which read the process's
// memory), and the preload never holds the key as a value of JavaScript's (audit 75: a heap snapshot by node:v8 held it as
// a string): see tools/assert-watch.mjs. A process the file starts (tests start them) is outside the permission model.
//
// Which test passed is read from the signed diagnostic alone (audit 74), never from a test:pass frame: the diagnostic
// names the test by its title, its full name (the titles of the describes and tests around it) and the file, line and
// column of the call that made it, as the preload saw them on the stack, so a passing test of the same title elsewhere (a
// subtest, one in a describe, one built at run time) does not stand for a protected test whose own frame the file turned
// from a fail into a pass. The frames are still read for what only they report, and only as no pass: a fail, or a skip
// (a test skipped by its options runs no hook). Tests made under the file's name by two scripts (the file, and code it
// evaluated with that name: eval with a sourceURL, vm with a filename) make the run { forged } too.
import { run } from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { realpathSync, readFileSync, writeFileSync, writeSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [file, watch, ms] = process.argv.slice(2);
const key = readFileSync(0, 'utf8'), real = realpathSync(file); // node:test names the file by its real path
const say = o => { const line = JSON.stringify(o); writeSync(1, `${createHmac('sha256', key).update(line).digest('hex')} ${line}\n`); };
const inner = randomBytes(32), dir = mkdtempSync(join(tmpdir(), 'umlimator-protect-key-')), keyFile = join(dir, 'key');
writeFileSync(keyFile, inner, { mode: 0o600 });
const MARK = 'protect-ran ', seqs = new Set(), scripts = new Set(), TWO = 'tests made under its name by more than one script (code it evaluated under its name?)';
let forged = null;
const ALLOW = ['--permission', '--allow-fs-read=*', '--allow-fs-write=*', '--allow-child-process', '--allow-worker'];
const stop = new AbortController(), timer = setTimeout(() => stop.abort(), Number(ms));
try {
  for await (const { type, data } of run({ files: [file], isolation: 'process', execArgv: [...ALLOW, '--import', watch], env: { ...process.env, PROTECT_KEY_FILE: keyFile }, testSkipPatterns: [/\(timed\)/], signal: stop.signal })) {
    if (type === 'test:stderr') say({ stderr: data.message });
    else if (type === 'test:diagnostic' && typeof data.message === 'string' && data.message.startsWith(MARK)) {
      const rest = data.message.slice(MARK.length), sp = rest.indexOf(' '), body = rest.slice(sp + 1);
      let r = null;
      try { if (sp > 0 && rest.slice(0, sp) === createHmac('sha256', inner).update(body).digest('hex')) r = JSON.parse(body); } catch {}
      if (!r || seqs.has(r.seq)) forged ??= 'a signed result that its preload did not sign';
      else {
        seqs.add(r.seq);
        if (r.file === real && r.line !== null) {
          scripts.add(r.script);
          if (r.scripts > 1) forged ??= TWO;
          say({ name: r.name, path: r.path, line: r.line, column: r.column, status: r.status });
        }
      }
    } else if ((type === 'test:pass' || type === 'test:fail') && data.details?.type !== 'suite') {
      const skip = data.skip !== undefined || data.todo !== undefined;
      // a frame is no pass (see above): only a fail or a skip is read from it
      if (data.file === real && data.line !== undefined && (skip || type === 'test:fail')) say({ name: data.name, line: data.line, column: data.column, status: skip ? 'skip' : 'not ok' });
    }
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
clearTimeout(timer);
if (scripts.size > 1) forged ??= TWO;
if (forged) say({ forged });
if (stop.signal.aborted) say({ late: true });
