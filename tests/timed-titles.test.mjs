// A test that reads a clock is a timed test, and its title says "(timed)": `npm test` and CI select the timed tests by that
// title alone and run them one file at a time in a step of their own (CONTRIBUTING.md), so one whose title lacks it runs
// beside the rest of the suite, where a loaded machine pushes it over its budget and it fails only there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { scan } from '../tools/protect.mjs';

const dir = new URL('./', import.meta.url);
// a wall or CPU clock, read in the test's body or in any top-level helper it calls (this file, which names the clocks in
// its data, is not scanned)
const CLOCK = /performance\s*\.\s*now|process\s*\.\s*hrtime|process\s*\.\s*cpuUsage|Date\s*\.\s*now\s*\(/;
// the tests that read a clock but assert no time: each with why
const NOT_TIMED = {
  'evolve.test.mjs': { 'lease: a lock left by a crashed writer is broken once stale; a fresh one makes the writer wait and give up': 'dates a lock file an hour back' },
  'model.test.mjs': { 'the layout search render bakes stops on work, not on a clock: a slow machine bakes the same layout (audit 7)': 'slows the clock down and asserts the same layout' },
  'strategy-sync.test.mjs': { 'the templates call no clock or random source: the workflow runtime throws on Date.now(), an argless new Date() and Math.random() (audit 65 stopped on one)': 'names the clock calls a template may not make' },
};

test('every test that reads a clock is marked timed in its title, and every test so marked reads one', () => {
  const untitled = [], idle = [], stale = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f !== 'timed-titles.test.mjs').sort()) {
    const s = scan(readFileSync(new URL(f, dir), 'utf8'));
    for (const [title, t] of s.tests) {
      const seen = new Set(), todo = [...t.refs], texts = [t.body];
      while (todo.length) { const n = todo.pop(); if (seen.has(n) || !s.decls.has(n)) continue; seen.add(n); texts.push(s.decls.get(n).text); todo.push(...s.decls.get(n).refs); }
      const clock = texts.some(x => CLOCK.test(x)), named = /\(timed\)/.test(title), exempt = NOT_TIMED[f] && title in NOT_TIMED[f];
      if (clock && !named && !exempt) untitled.push(`${f}: ${title}`);
      if (named && !clock) idle.push(`${f}: ${title}`);
    }
    for (const title of Object.keys(NOT_TIMED[f] || {})) if (!s.tests.has(title)) stale.push(`${f}: ${title}`);
  }
  assert.deepEqual(untitled, [], 'these read a clock: add " (timed)" to the title, or list one that asserts no time in NOT_TIMED with why');
  assert.deepEqual(idle, [], 'these say "(timed)" but read no clock');
  assert.deepEqual(stale, [], 'NOT_TIMED names a test that is not there');
});
