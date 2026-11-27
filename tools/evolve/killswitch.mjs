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
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseArgs } from './args.mjs';
import { isMain } from '../main.mjs';

export const STOP = '.evolve/STOP';

// { stopped, reason, text }
export function killSwitch({ repo = '.', ref = 'origin/main', file } = {}) {
  if (file !== undefined) {
    if (!file) return { stopped: true, reason: 'no kill-switch file named: treated as stopped' };
    if (!existsSync(file)) return { stopped: false, reason: `no kill switch at ${file}` };
    return { stopped: true, reason: `kill switch set: ${file}`, text: readFileSync(file, 'utf8') };
  }
  const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  const at = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  if (at.status !== 0) return { stopped: true, reason: `cannot read ${ref} in ${repo}: treated as stopped until it can be read (fetch it first)` };
  const shown = git('show', `${ref}:${STOP}`);
  if (shown.status !== 0) return { stopped: false, reason: `no ${STOP} on ${ref} (${at.stdout.trim().slice(0, 8)})` };
  return { stopped: true, reason: `kill switch set: ${STOP} on ${ref} (${at.stdout.trim().slice(0, 8)})`, text: shown.stdout };
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
