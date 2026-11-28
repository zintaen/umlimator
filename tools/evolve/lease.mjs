#!/usr/bin/env node
// The loop's ownership lease (auto-evolve strategy, risk 4): one session owns the loop at a time. The lease is a small
// JSON file { owner, started, heartbeat, expires }, all times UTC. The owner renews it (the heartbeat) at least every 15
// minutes; another session may take it only once the current time is past `expires`.
//
//   node tools/evolve/lease.mjs take    --owner <id> [--ttl 60m] [--now <ISO time>] [--file <path>]
//   node tools/evolve/lease.mjs renew   --owner <id> [--ttl 60m] [--now <ISO time>] [--file <path>]
//   node tools/evolve/lease.mjs release --owner <id> [--file <path>]
//   node tools/evolve/lease.mjs check   [--owner <id>] [--now <ISO time>] [--file <path>]
//
// The file is --file, else $EVOLVE_LEASE, else .evolve/lease.json in the working folder (gitignored). --now is the time
// to compare with: pass a shared clock (the code host's API time) where sessions run on more than one machine; the
// default is this machine's clock. Every change happens under a lock folder (<file>.lock, made with mkdir, which is
// atomic), so two sessions taking an expired lease at once cannot both win. A lock older than 30 s is a crashed
// writer's and is broken.
//
// Prints the lease as JSON. Exit 0: done (check: the lease is free or expired, or with --owner, live and that owner's);
// 1: refused (held by another owner, not yours, or check failed); 2: a usage error.
import { readFileSync, writeFileSync, mkdirSync, rmdirSync, renameSync, rmSync, statSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs, duration, instant } from './args.mjs';
import { isMain } from '../main.mjs';

export const TTL = 60 * 60e3;
const LOCK_STALE = 30e3, LOCK_WAIT = 5e3;

export function leasePath(flags = {}, env = process.env) {
  return resolve(typeof flags.file === 'string' ? flags.file : env.EVOLVE_LEASE || '.evolve/lease.json');
}

export function readLease(file) {
  let text;
  // opened without waiting and read only when it is a regular file: a FIFO there blocked the read forever (audit 78)
  let fd;
  try { fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK || 0)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`${file} is not a lease (not a regular file)`);
    text = readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
  const l = JSON.parse(text);
  if (!l || typeof l.owner !== 'string' || Number.isNaN(Date.parse(l.expires))) throw new Error(`${file} is not a lease (owner and expires missing)`);
  return l;
}

// free, live or expired, as of `now`
export function state(lease, now = new Date()) {
  if (!lease) return 'free';
  return now.getTime() > Date.parse(lease.expires) ? 'expired' : 'live';
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function locked(file, fn) {
  const lock = file + '.lock';
  mkdirSync(dirname(file), { recursive: true });
  const start = Date.now();
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = 0;
      try { age = Date.now() - statSync(lock).mtimeMs; } catch { continue; }
      if (age > LOCK_STALE) { try { rmdirSync(lock); } catch {} continue; }
      if (Date.now() - start > LOCK_WAIT) throw new Error(`${lock} is held by another writer`);
      sleep(25);
    }
  }
  try { return fn(); } finally { try { rmdirSync(lock); } catch {} }
}

function write(file, lease) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(lease, null, 2) + '\n');
  renameSync(tmp, file);
}

const iso = d => d.toISOString();

// { ok, lease, reason }: take when free, expired, or already this owner's (then it renews and keeps `started`)
export function take(file, owner, { now = new Date(), ttl = TTL } = {}) {
  if (!owner) throw new Error('take needs --owner');
  return locked(file, () => {
    const old = readLease(file), s = state(old, now);
    if (s === 'live' && old.owner !== owner) return { ok: false, lease: old, reason: `held by ${old.owner} until ${old.expires}` };
    const mine = old && old.owner === owner;
    const lease = { owner, started: mine ? old.started : iso(now), heartbeat: iso(now), expires: iso(new Date(now.getTime() + ttl)) };
    if (s === 'expired' && !mine) lease.tookOverFrom = { owner: old.owner, expired: old.expires };
    write(file, lease);
    return { ok: true, lease, reason: s === 'expired' && !mine ? `took over from ${old.owner}, expired ${old.expires}` : mine ? 'renewed' : 'taken' };
  });
}

// the heartbeat: only the owner named in the lease may renew it, even past its expiry if nobody took it
export function renew(file, owner, { now = new Date(), ttl = TTL } = {}) {
  if (!owner) throw new Error('renew needs --owner');
  return locked(file, () => {
    const old = readLease(file);
    if (!old) return { ok: false, lease: null, reason: 'no lease to renew: take it first' };
    if (old.owner !== owner) return { ok: false, lease: old, reason: `the lease names ${old.owner}, not ${owner}: stop` };
    const lease = { ...old, heartbeat: iso(now), expires: iso(new Date(now.getTime() + ttl)) };
    write(file, lease);
    return { ok: true, lease, reason: 'renewed' };
  });
}

export function release(file, owner) {
  if (!owner) throw new Error('release needs --owner');
  return locked(file, () => {
    const old = readLease(file);
    if (!old) return { ok: true, lease: null, reason: 'no lease: nothing to release' };
    if (old.owner !== owner) return { ok: false, lease: old, reason: `the lease names ${old.owner}, not ${owner}` };
    rmSync(file);
    return { ok: true, lease: null, reason: 'released' };
  });
}

export function check(file, owner, { now = new Date() } = {}) {
  const lease = readLease(file), s = state(lease, now);
  if (owner) {
    const ok = s === 'live' && lease.owner === owner;
    return { ok, lease, state: s, reason: ok ? 'live and yours' : s === 'live' ? `held by ${lease.owner}` : s === 'expired' && lease.owner === owner ? 'yours but expired: renew it' : s };
  }
  return { ok: s !== 'live', lease, state: s, reason: s === 'live' ? `held by ${lease.owner} until ${lease.expires}` : s };
}

export function main(argv = process.argv.slice(2)) {
  let r;
  try {
    const { flags, rest } = parseArgs(argv, [], ['owner', 'ttl', 'now', 'file']), cmd = rest[0];
    const owner = typeof flags.owner === 'string' ? flags.owner : undefined;
    const file = leasePath(flags), now = instant(flags.now), ttl = duration(flags.ttl, TTL);
    if (cmd === 'take') r = take(file, owner, { now, ttl });
    else if (cmd === 'renew') r = renew(file, owner, { now, ttl });
    else if (cmd === 'release') r = release(file, owner);
    else if (cmd === 'check') r = check(file, owner, { now });
    else throw new Error(`usage: lease.mjs take|renew|release|check [--owner <id>] [--ttl 60m] [--now <ISO>] [--file <path>]${cmd ? ` (not ${cmd})` : ''}`);
  } catch (e) {
    process.stderr.write(`lease: ${e.message}\n`);
    return 2;
  }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (!r.ok) process.stderr.write(`lease: ${r.reason}\n`);
  return r.ok ? 0 : 1;
}

if (isMain(import.meta.url)) process.exitCode = main();
