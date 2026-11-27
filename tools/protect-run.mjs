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
// { stderr } for what the file wrote on stderr, and { late: true } when the run did not end in the time given. The key
// is read and stdin is at its end before the file's process starts, so that process, which can open this one's stdout on
// Linux (/proc/<pid>/fd/1), cannot sign a line it writes there; protect.mjs reads only signed lines.
import { run } from 'node:test';
import { createHmac } from 'node:crypto';
import { realpathSync, readFileSync, writeSync } from 'node:fs';

const [file, watch, ms] = process.argv.slice(2);
const key = readFileSync(0, 'utf8'), real = realpathSync(file); // node:test names the file by its real path
const say = o => { const line = JSON.stringify(o); writeSync(1, `${createHmac('sha256', key).update(line).digest('hex')} ${line}\n`); };
const stop = new AbortController(), timer = setTimeout(() => stop.abort(), Number(ms));
for await (const { type, data } of run({ files: [file], isolation: 'process', execArgv: ['--import', watch], testSkipPatterns: [/\(timed\)/], signal: stop.signal })) {
  if (type === 'test:stderr') say({ stderr: data.message });
  else if ((type === 'test:pass' || type === 'test:fail') && data.file === real && data.line !== undefined) {
    say({ name: data.name, line: data.line, column: data.column, status: data.skip !== undefined || data.todo !== undefined ? 'skip' : type === 'test:pass' ? 'ok' : 'not ok' });
  }
}
clearTimeout(timer);
if (stop.signal.aborted) say({ late: true });
