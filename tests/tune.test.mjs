// The layout's tuning constants (src/layout/tune.js, docs/diagrams/notes/layout-flow.md section 9.1): each is pinned, so a
// change to one shows here; and the code reads each from tune.js, not from a literal of its own. The values the weekly loop
// may change (tools/evolve/tune-loop.mjs RANGES) are pinned in bench/tune-pins.json, which the loop moves in the same commit
// as the value (section 9.4); the others are pinned below, to the values the code had before they moved to tune.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../src/layout/tune.js';
import { RANGES, flatten, outOfRange, pinsText } from '../tools/evolve/tune-loop.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PINS = JSON.parse(read('bench/tune-pins.json'));

const NAMES = ['BARY_SWEEPS', 'ROW_SWEEPS', 'FLOW_MIN', 'FLOW_CAP', 'FLOW_WAYS', 'FAN_IN', 'FAN_TRIES', 'CROSS_CAP', 'OUTSIDE_TRIES', 'SCORE_WEIGHTS', 'LABEL_PASSES', 'BRANCH_BALANCE', 'STABLE_SLACK', 'STABLE_WEIGHTS', 'SNAKE_AT', 'SNAKE_SLACK'];
const WEIGHTS = ['issue', 'cross', 'dropped', 'lengthPer', 'corner', 'areaPer'];
// the values the loop may not change
const FIXED = {
  FLOW_MIN: 3,
  FLOW_WAYS: [{}, { pull: true }, { packed: true }, { pull: true, packed: true }],
  LABEL_PASSES: { map: [0, 1, 2], typed: [0], mapLate: [4, 3], late: [0, 4, 3, 5, 1, 2] },
  'SCORE_WEIGHTS.issue': 1000,
  'SCORE_WEIGHTS.areaPer': 4e5,
  // the stability guard's weights are section 4.1's (bench/score-weights.json), which the loop may not change
  ...Object.fromEntries(Object.entries({ hard: 1000, cross: 100, through: 100, labels: 60, reverse: 40, straight: 30, moved: 200, length: 1 / 15, points: 12, area: 1 / 4e5 }).map(([k, v]) => ['STABLE_WEIGHTS.' + k, v])),
};

test('tune.js exports exactly the named constants, with the pinned values', () => {
  assert.deepEqual(Object.keys(T).sort(), [...NAMES].sort());
  assert.deepEqual(Object.keys(T.SCORE_WEIGHTS).sort(), [...WEIGHTS].sort());
  const flat = flatten(T), pinned = { ...FIXED, ...PINS.values };
  assert.deepEqual(Object.keys(flat).sort(), Object.keys(pinned).sort());
  for (const [path, value] of Object.entries(pinned)) assert.deepEqual(flat[path], value, path);
});

test('bench/tune-pins.json pins exactly the values the loop may change, each inside its declared range, and no fixed one', () => {
  assert.deepEqual(Object.keys(PINS.values).sort(), Object.keys(RANGES).sort(), 'one pin for each range of tools/evolve/tune-loop.mjs');
  for (const [path, value] of Object.entries(PINS.values)) assert.equal(outOfRange(path, value), null, path);
  for (const path of Object.keys(FIXED)) assert.ok(!(path in RANGES), path + ' is fixed');
  assert.equal(read('bench/tune-pins.json'), pinsText(PINS), 'one value a line, as the loop writes it');
});

test('tune.js\'s lists and weights are frozen, so no caller changes them for the next layout', () => {
  for (const name of ['ROW_SWEEPS', 'FLOW_WAYS', 'SCORE_WEIGHTS', 'STABLE_WEIGHTS', 'LABEL_PASSES']) assert.ok(Object.isFrozen(T[name]), name);
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
    STABLE_SLACK: /\+ STABLE_SLACK \* STABLE_WEIGHTS\.labels;/,
    STABLE_WEIGHTS: /const W = STABLE_WEIGHTS,/,
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
  for (const w of WEIGHTS) assert.match(ctx, new RegExp('W\\.' + w + '\\b'), 'scoreGeo reads ' + w);
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
  const at = lib.indexOf(`const BARY_SWEEPS = ${PINS.values.BARY_SWEEPS};`);
  assert.ok(at >= 0 && at < lib.indexOf('function untangle('));
});
