#!/usr/bin/env node
// The kill switch (the strategy's C3 step 3, A7.4, A8.5): the file .evolve/STOP on main stops the loop.
//
//   node tools/evolve/killswitch.mjs [--ref origin/main] [--repo .]     look for .evolve/STOP in a commit (git fetch first)
//   node tools/evolve/killswitch.mjs --file <path>                      look for a kill-switch file beside the lease instead
//
// Exit 0: no kill switch, go on. Exit 1: the kill switch is set (its text is printed) or the place could not be read,
// so the session stops (a hotfix or release pull already pending is the only work allowed). Exit 2: usage error (an option
// it does not know, or --file, --ref or --repo with no value or an empty one: audit 72).
// Every session and scheduled job runs it first, and the orchestrator again before every step.
import { lstatSync, openSync, fstatSync, readSync, closeSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseArgs } from './args.mjs';
import { isMain } from '../main.mjs';

export const STOP = '.evolve/STOP';

// Only a positive answer that the switch is absent lets the session go on: any failure to look for it or to read an existing
// one (a STOP too large to read, git failing for any other reason, a file that cannot be opened) counts as stopped (audit 77).
const MAX = 64 << 20;

// A STOP given by --file is shown up to this many bytes; the rest is left unread.
export const FILE_MAX = 1 << 20;

function kind(st) {
  return st.isSymbolicLink() ? 'a symbolic link' : st.isDirectory() ? 'a directory' : st.isFIFO() ? 'a FIFO'
    : st.isSocket() ? 'a socket' : st.isCharacterDevice() ? 'a character device' : st.isBlockDevice() ? 'a block device' : 'not a file';
}

// Open without following a link and without waiting (O_NONBLOCK: an entry swapped for a FIFO after the lstat opens at
// once), check again that it is a regular file, and read at most FILE_MAX bytes.
function readStop(file) {
  const set = `kill switch set: ${file}`;
  let fd;
  try { fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0)); } catch (e) {
    return { stopped: true, reason: `${set} (it could not be read: ${e.code || e.message})` };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return { stopped: true, reason: `${set} (${kind(st)}, not a regular file, so it could not be read)` };
    const buf = Buffer.alloc(Math.min(FILE_MAX, st.size));
    let n = 0;
    while (n < buf.length) {
      const got = readSync(fd, buf, n, buf.length - n, n);
      if (!got) break;
      n += got;
    }
    const cut = st.size > FILE_MAX ? ` (only its first ${FILE_MAX} bytes are shown)` : '';
    return { stopped: true, reason: set + cut, text: buf.subarray(0, n).toString('utf8') };
  } catch (e) {
    return { stopped: true, reason: `${set} (it could not be read: ${e.code || e.message})` };
  } finally { closeSync(fd); }
}

// { stopped, reason, text }
export function killSwitch({ repo = '.', ref = 'origin/main', file } = {}) {
  if (file !== undefined) {
    if (!file) return { stopped: true, reason: 'no kill-switch file named: treated as stopped' };
    let st;
    try { st = lstatSync(file); } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return { stopped: false, reason: `no kill switch at ${file}` };
      return { stopped: true, reason: `kill switch at ${file} could not be looked for (${e.code || e.message}): treated as stopped` };
    }
    // a FIFO, socket, device, directory or link is never opened: opening a FIFO waits for a writer forever (audit 78)
    if (!st.isFile()) return { stopped: true, reason: `kill switch set: ${file} (${kind(st)}, not a regular file, so it could not be read)` };
    return readStop(file);
  }
  const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: MAX });
  const at = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  if (at.status !== 0) return { stopped: true, reason: `cannot read ${ref} in ${repo}: treated as stopped until it can be read (fetch it first)` };
  const id = at.stdout.trim();
  const where = `${STOP} on ${ref} (${id.slice(0, 8)})`;
  // look the path up without reading it: exit 0 and no entry is the only "absent"
  const ls = git('ls-tree', '-z', '--full-tree', id, '--', STOP);
  if (ls.status !== 0) return { stopped: true, reason: `cannot look for ${where}: treated as stopped (${(ls.error?.code || ls.stderr || '').toString().trim()})` };
  if (!ls.stdout) return { stopped: false, reason: `no ${where}` };
  const [, type, oid] = /^\S+ (\S+) (\S+)\t/.exec(ls.stdout) || [];
  if (type !== 'blob') return { stopped: true, reason: `kill switch set: ${where} (a ${type || 'tree entry'}, not a file)` };
  const shown = git('cat-file', 'blob', oid);
  if (shown.status !== 0) return { stopped: true, reason: `kill switch set: ${where} (it could not be read: ${(shown.error?.code || shown.stderr || 'git failed').toString().trim()})` };
  return { stopped: true, reason: `kill switch set: ${where}`, text: shown.stdout };
}

export function main(argv, out = console.log) {
  let flags, rest, why;
  try { ({ flags, rest } = parseArgs(argv, [], ['file', 'ref', 'repo'])); } catch (e) { why = e.message; }
  if (why || rest.length) {
    if (why) out(`killswitch: ${why}`);
    out('usage: killswitch.mjs [--ref origin/main] [--repo .] | --file <path>');
    return 2;
  }
  const r = killSwitch({ repo: flags.repo || '.', ref: flags.ref || 'origin/main', file: flags.file });
  out(r.reason);
  if (r.text) out(r.text.trim());
  return r.stopped ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
