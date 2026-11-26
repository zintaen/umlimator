// The layout's tuning constants (src/layout/tune.js, docs/diagrams/notes/layout-flow.md section 9.1): each is pinned to the
// value the code had before it moved there, so the move is provably picture-neutral and a later change to one shows here; and
// the code reads each from tune.js, not from a literal of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../src/layout/tune.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const PINNED = {
  BARY_SWEEPS: 8,
  ROW_SWEEPS: [1, -1, 1],
  FLOW_MIN: 3,
  FLOW_CAP: 30,
  FLOW_WAYS: [{}, { pull: true }, { packed: true }, { pull: true, packed: true }],
  FAN_IN: 6,
  FAN_TRIES: 14,
  CROSS_CAP: 30,
  OUTSIDE_TRIES: 4,
  SCORE_WEIGHTS: { issue: 1000, cross: 150, dropped: 40, lengthPer: 15, corner: 12, areaPer: 4e5 },
  LABEL_PASSES: { map: [0, 1, 2], typed: [0], mapLate: [4, 3], late: [0, 4, 3, 5, 1, 2] },
  BRANCH_BALANCE: 2,
  STABLE_SLACK: 1,
  SNAKE_AT: 10,
  SNAKE_SLACK: 2,
};

test('tune.js exports exactly the named constants, with today\'s values', () => {
  assert.deepEqual(Object.keys(T).sort(), Object.keys(PINNED).sort());
  for (const [name, value] of Object.entries(PINNED)) assert.deepEqual(T[name], value, name);
});

test('tune.js\'s lists and weights are frozen, so no caller changes them for the next layout', () => {
  for (const name of ['ROW_SWEEPS', 'FLOW_WAYS', 'SCORE_WEIGHTS', 'LABEL_PASSES']) assert.ok(Object.isFrozen(T[name]), name);
  T.FLOW_WAYS.forEach((o, k) => assert.ok(Object.isFrozen(o), 'FLOW_WAYS ' + k));
  Object.entries(T.LABEL_PASSES).forEach(([k, v]) => assert.ok(Object.isFrozen(v), 'LABEL_PASSES.' + k));
});

// where each constant is read: the file, and a pattern its use matches there
const READS = {
  'src/layout/layered.js': {
    BARY_SWEEPS: /it < BARY_SWEEPS\b/,
    ROW_SWEEPS: /for \(const step of ROW_SWEEPS\)/,
    CROSS_CAP: /dg\.nodes\.length <= CROSS_CAP \? routeAudit/,
    OUTSIDE_TRIES: /let tries = OUTSIDE_TRIES;/,
    FAN_IN: /fan\[e\.t\.id\] >= FAN_IN\b/,
    FAN_TRIES: /left = FAN_TRIES;/,
    LABEL_PASSES: /LABEL_PASSES\.mapLate : LABEL_PASSES\.late\) : map \? LABEL_PASSES\.map : LABEL_PASSES\.typed/,
  },
  'src/map/context.js': {
    FLOW_CAP: /n > FLOW_CAP \|\| n < FLOW_MIN\) return first;/,
    FLOW_MIN: /n < FLOW_MIN\b/,
    FLOW_WAYS: /for \(const o of FLOW_WAYS\.slice\(1\)\)/,
    FAN_IN: /\) >= FAN_IN\); \};/,
    SCORE_WEIGHTS: /const W = SCORE_WEIGHTS;/,
    BRANCH_BALANCE: /held\(rank\[i\], s\) - held\(rank\[i\], -s\) >= BRANCH_BALANCE\)/,
  },
};

test('the layout reads each constant from tune.js', () => {
  for (const [file, uses] of Object.entries(READS)) {
    const src = read(file), imp = src.match(/^import \{([^}]*)\} from '(?:\.\/|\.\.\/layout\/)tune\.js';$/m);
    assert.ok(imp, file + ' imports from tune.js');
    const names = imp[1].split(',').map(s => s.trim());
    for (const [name, re] of Object.entries(uses)) { assert.ok(names.includes(name), `${file} imports ${name}`); assert.match(src, re, `${file} reads ${name}`); }
  }
  // scoreGeo uses every weight
  const ctx = read('src/map/context.js');
  for (const w of Object.keys(PINNED.SCORE_WEIGHTS)) assert.match(ctx, new RegExp('W\\.' + w + '\\b'), 'scoreGeo reads ' + w);
});

test('the moved literals are gone from where they were', () => {
  const lay = read('src/layout/layered.js'), ctx = read('src/map/context.js');
  assert.doesNotMatch(lay, /it < 8 && best/);
  assert.doesNotMatch(lay, /\[\[1, cols\.length, 1\], \[cols\.length - 2, -1, -1\]/);
  assert.doesNotMatch(lay, /let tries = 4;|left = 14;|>= 6\b/);
  assert.doesNotMatch(lay, /\[0, 4, 3, 5, 1, 2\]|\[4, 3\]|\[0, 1, 2\]/);
  assert.doesNotMatch(ctx, /n > 30 \|\| n < 3|\{ pull: true, packed: true \}|>= 6\)|\* 150|\/ 4e5/);
});

test('tune.js is built into lib/ before the layout that reads it', () => {
  const build = read('tools/build.mjs');
  assert.match(build, /'layout\/tune', 'layout\/layered'/);
  const lib = read('lib/umlimator.js');
  assert.ok(lib.indexOf('const BARY_SWEEPS = 8;') >= 0 && lib.indexOf('const BARY_SWEEPS = 8;') < lib.indexOf('function untangle('));
});
