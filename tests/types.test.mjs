// The type pages (tools/types.mjs): one hand-authored model per diagram type, examples/types/<type>.json, rendered by the
// site job to examples/types/<type>.html. Each draws ONE comprehensive example of its type: its root and first view is
// the main view tools/types.json names, and its other views are the alternatives (the same example in a setting that
// cannot coexist with the main view), each under the main view. Every model validates with no error and lays out with no
// issue beyond its entry's allowance (0 unless the entry says why); every "shows" item says something.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { typeIds, spec, model, problems, groupOf } from '../tools/types.mjs';
import { validate, check } from '../lib/umlimator-all.js';

const root = new URL('../', import.meta.url);
const S = spec(), TYPES = typeIds();
const PENDING = TYPES.filter(t => S.types[t] && S.types[t].pending);

test('every type, tools/types.json\'s families\' 28, has its model and its entry, and nothing else is there: the map has none', () => {
  assert.equal(TYPES.length, 28);
  assert.equal(new Set(TYPES).size, 28, 'each type in one family, once');
  assert.ok(!TYPES.includes('map') && !S.types.map, 'the map is no type: its example is an atlas\'s first layer');
  assert.deepEqual(Object.keys(S.types).sort(), [...TYPES].sort(), 'tools/types.json names each type once');
  assert.deepEqual(readdirSync(new URL('examples/types/', root)).filter(f => f.endsWith('.json')).sort(), TYPES.map(t => `${t}.json`).sort());
});

test('each model matches its entry: a name, a text, a title, an intro, a "shows" checklist with no empty item, the main view first and the root, the alternatives views of it', () => {
  assert.deepEqual(TYPES.flatMap(t => problems(t)), []);
  for (const t of TYPES.filter(t => !PENDING.includes(t))) {
    const m = model(t), T = S.types[t], ids = m.views.map(v => v.id);
    assert.equal(ids[0], T.main, `${t}: the main view is first`);
    assert.equal(m.root, T.main, `${t}: the page opens on the main view`);
    assert.equal(groupOf(m.views[0]), t, `${t}: the main view is of the type`);
    // no unrelated scenario: every view is the main view or one of its alternatives
    assert.deepEqual(ids.slice(1).sort(), T.alternatives.map(a => a.view).sort(), `${t}: every view but the main one is an alternative`);
    for (const a of T.alternatives) assert.ok(a.setting.length > 10, `${t}: alternative ${a.view} says what setting differs`);
    assert.ok(T.shows.length >= 3, `${t}: "shows" lists what the diagram demonstrates`);
    for (const s of T.shows) assert.match(s, /^[\x20-\x7e]+$/, `${t}: plain keyboard characters: ${s}`);
  }
});

test('every model validates with no error, and lays out with no issue beyond its entry\'s allowance', () => {
  for (const t of TYPES) {
    const m = model(t), T = S.types[t];
    assert.deepEqual(validate(m).filter(p => p.level === 'error').map(p => `${p.path}: ${p.message}`), [], t);
    if (T.pending) continue;
    const got = m.views.flatMap(v => check(m, v.id).map(i => i.message));
    assert.ok(got.length <= (T.issues || 0), `${t}: ${got.join('; ')}`);
  }
});

// a type still pending keeps its old overview page until its comprehensive example replaces it; this reports them
test('no type is still pending its comprehensive example', { todo: PENDING.length ? `pending: ${PENDING.join(', ')}` : false }, () => {
  assert.deepEqual(PENDING, []);
});

// audit 53: a name given that is no type ended in an uncaught ENOENT and a Node stack trace; it is said in one line
test('tools/types.mjs says a name that is no type in one line, with the types, and exits 1', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['tools/types.mjs', 'uml-clas', 'uml-class', '--no-html'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stderr.trim(), `tools/types.mjs: no type uml-clas; the types: ${typeIds().join(', ')}`);
  assert.match(r.stdout, /examples\/types\/uml-class\.json: ok/);
});
