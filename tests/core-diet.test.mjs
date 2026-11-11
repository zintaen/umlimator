// The core's diet (0.18.0, risks.md C5): what only a registered diagram type takes moved to src/typed/, which only
// lib/umlimator-all.js holds. lib/umlimator.js must behave exactly as before for every input, so each version-2 example
// (the 28 targets) is laid out, described, validated and edited with it, and the class example with umlimator-all.js, and
// each answer is held to its fingerprint as main gave it before the move (tests/core-diet.json, recorded with
// `node tests/core-diet.test.mjs --record DIR`, DIR holding that commit's two built files). tests/core-diet.html holds the
// markup render() draws to the same fingerprints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { targets } from '../docs/diagrams/examples/check.mjs';

const here = new URL('./', import.meta.url), FIX = new URL('core-diet.json', here);
// JSON, with an object inside itself (a merged line's `all` holds the line) written as "<cycle>"
const flat = (x, up = []) => x && typeof x === 'object' ? (up.includes(x) ? '<cycle>' : Array.isArray(x) ? x.map(y => flat(y, [...up, x]))
  : Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, flat(v, [...up, x])]))) : x;
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(flat(x))).digest('hex').slice(0, 16);

// what a library answers on one model: each view's layout() (less the time each phase took) and describe(), validate(), and
// an edit through apply() (a label set, a node added to the first view) with the edited model's first view laid out again.
// A warning or an error is part of the answer
function answers(U, model) {
  const said = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } catch (e) { return [`throws ${e.message}`, w]; } finally { console.warn = keep; } };
  const geo = (m, id) => said(() => { const { ms, ...g } = U.layout(m, id); return g; });
  const views = model.views.map(v => v.id), first = model.nodes.find(n => n && typeof n.id === 'string');
  const out = {};
  views.forEach(id => { out[`layout ${id}`] = hash(geo(model, id)); out[`describe ${id}`] = hash(said(() => U.describe(model, id))); });
  out.validate = hash(said(() => U.validate(model)));
  const [edited] = said(() => U.apply(model, [{ op: 'set', id: first.id, path: 'label', value: 'Edited' }, { op: 'add', element: { id: 'diet-new', type: 'core.Node', label: 'New' }, view: views[0] }]));
  out.edit = hash(edited);
  if (edited && typeof edited === 'object') { out[`edited layout ${views[0]}`] = hash(geo(edited, views[0])); out['edited validate'] = hash(said(() => U.validate(edited))); }
  return out;
}

const CLASS = 'examples/sales-classes.json';
const read = url => JSON.parse(readFileSync(url));
async function fingerprints(dir) {
  const core = await import(new URL('umlimator.js', dir)), all = await import(new URL('umlimator-all.js', dir));
  return { core: Object.fromEntries(targets().map(([f, url]) => [f, answers(core, read(url))])), all: { [CLASS]: answers(all, read(new URL('../' + CLASS, here))) } };
}

if (process.argv[2] === '--record') {
  writeFileSync(FIX, JSON.stringify({ ...read(FIX), ...await fingerprints(pathToFileURL(process.argv[3].replace(/\/?$/, '/'))) }, null, 1) + '\n'); // markup: tests/core-diet.html?record
} else {
  test('umlimator.js lays out, describes, validates and edits every version-2 example as main did before the move; umlimator-all.js the class example', async () => {
    const now = await fingerprints(new URL('../lib/', here)), { core, all } = read(FIX);
    assert.equal(Object.keys(now.core).length, 28);
    assert.deepEqual(now, { core, all });
  });

  test('umlimator.js holds none of src/typed/, and umlimator-all.js holds it all', () => {
    const core = readFileSync(new URL('../lib/umlimator.js', here), 'utf8'), all = readFileSync(new URL('../lib/umlimator-all.js', here), 'utf8');
    for (const f of ['layout', 'draw']) {
      const src = readFileSync(new URL(`../src/typed/${f}.js`, here), 'utf8'), names = [...src.matchAll(/^(?:const|function|let) (\w+)|^(TYPED\.\w+|SHAPE\.\w+) = /gm)].map(m => m[1] || m[2]);
      assert.ok(names.length > 3, f);
      for (const n of names) { assert.ok(!(n.includes('.') ? core.includes(n + ' = ') : new RegExp(`^(const|function|let) ${n}\\b`, 'm').test(core)), `umlimator.js holds ${n}`); assert.ok(all.includes(n), `umlimator-all.js lacks ${n}`); }
    }
  });
}
