// The type pages (tools/types.mjs): one multi-view model per diagram type, examples/types/<type>.json, rendered by the
// site job to examples/types/<type>.html. Each holds every example of its type: its root view, "overview", has a card
// per variant, each opening that variant's view; the variants are the views of that type in the examples of examples/
// and in the variant files of examples/variants/ (<type>-<name>.json). Every model validates with no error and no
// warning its sources do not have, and lays out with no layout issue its sources do not have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { build, text, typeIds, spec, groupOf, prefixOf, sourcePath } from '../tools/types.mjs';
import { validate, check } from '../lib/umlimator-all.js';

const root = new URL('../', import.meta.url), read = p => readFileSync(new URL(p, root), 'utf8'), json = p => JSON.parse(read(p));
const S = spec(), TYPES = typeIds();
const RETIRED = json('tools/gallery.json').retired.files, ATLAS = json('tools/gallery.json').atlas.file;

test('every type, the map and docs/types.md\'s 28, has a page model, and each committed model is what tools/types.mjs writes', () => {
  assert.equal(TYPES.length, 29);
  assert.deepEqual(Object.keys(S.types).sort(), [...TYPES].sort(), 'tools/types.json names each type once');
  assert.deepEqual(readdirSync(new URL('examples/types/', root)).filter(f => f.endsWith('.json')).sort(), TYPES.map(t => `${t}.json`).sort());
  for (const t of TYPES) assert.equal(read(`examples/types/${t}.json`), text(build(t)), `examples/types/${t}.json is stale: run node tools/types.mjs ${t} and commit it`);
});

test('each page\'s overview has a card per variant, each opening a view of the type that exists, and every view of the type has a card', () => {
  for (const t of TYPES) {
    const m = build(t), views = new Map(m.views.map(v => [v.id, v])), o = views.get('overview');
    assert.equal(m.root, 'overview', t);
    assert.equal(groupOf(o), 'map', `${t}: the overview is a map view`);
    assert.equal(o.title, S.types[t].title, t);
    assert.match(o.title, /examples$/, t);
    const opened = o.nodeIds.map(id => {
      const c = m.nodes.find(n => n.id === id);
      assert.ok(c && c.opensView && views.has(c.opensView), `${t}: card ${id} opens a view that exists`);
      assert.equal(groupOf(views.get(c.opensView)), t, `${t}: card ${id} opens a ${t} view`);
      assert.ok(c.sublabel && c.what, `${t}: card ${id} says what its variant shows`);
      return c.opensView;
    });
    assert.equal(new Set(opened).size, opened.length, `${t}: no view has two cards`);
    // the overview itself is the map type's own root, not a variant of it
    const typed = m.views.filter(v => v.id !== 'overview' && groupOf(v) === t).map(v => v.id);
    assert.deepEqual([...opened].sort(), typed.sort(), `${t}: every ${t} view on the page has a card`);
    // a source's top views hang under the overview; the rest keep their parents, which are on the page
    for (const v of m.views) if (v.id !== 'overview') assert.ok(views.has(v.parent), `${t}: view ${v.id}'s parent ${v.parent}`);
  }
});

test('every example of examples/ is on its types\' pages, and every variant file is named for its type and listed', () => {
  const listed = new Map();   // source -> types whose page lists it
  for (const t of TYPES) for (const v of S.types[t].variants) listed.set(v.file, [...(listed.get(v.file) || []), t]);
  const examples = readdirSync(new URL('examples/', root)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
    .filter(n => !RETIRED.includes(n) && n !== ATLAS);
  for (const n of examples) {
    const kinds = [...new Set(json(`examples/${n}.json`).views.map(groupOf))];
    // an example is on the page of each type its views are of (buy-book-overview: its interaction overview and its
    // sequence views)
    assert.deepEqual([...(listed.get(n) || [])].sort(), kinds.sort(), `examples/${n}.json is on the pages of the types of its views`);
  }
  for (const f of readdirSync(new URL('examples/variants/', root))) {
    assert.match(f, /^[a-z0-9-]+\.json$/, f);
    const n = `variants/${f.slice(0, -5)}`, t = TYPES.filter(t => f.startsWith(`${t}-`)).sort((a, b) => b.length - a.length)[0];
    assert.ok(t, `examples/variants/${f} is named <type>-<name>.json`);
    assert.deepEqual(listed.get(n), [t], `examples/variants/${f} is listed under ${t} in tools/types.json, and only there`);
    assert.ok(json(sourcePath(n)).views.some(v => groupOf(v) === t), `examples/variants/${f} has a ${t} view`);
    assert.ok(prefixOf(t, n).length > 0, f);
  }
  for (const n of listed.keys()) assert.ok(n.startsWith('variants/') || examples.includes(n), `tools/types.json lists ${n}, which is not an example`);
});

test('every page model validates with no error and no warning its sources lack, and lays out with no issue they lack', () => {
  for (const t of TYPES) {
    const m = build(t), problems = validate(m);
    assert.deepEqual(problems.filter(p => p.level === 'error').map(p => `${p.path}: ${p.message}`), [], t);
    let want = 0;
    const issues = new Map();   // a page view's id -> its source view's layout issue count
    for (const v of S.types[t].variants) {
      const src = json(sourcePath(v.file)), pre = prefixOf(t, v.file);
      want += validate(src).filter(p => p.level === 'warning').length;
      for (const w of src.views) issues.set(`${pre}-${w.id}`, check(src, w.id).length);
    }
    assert.equal(problems.filter(p => p.level === 'warning').length, want, `${t}: ${problems.map(p => p.message).join('; ')}`);
    assert.deepEqual(check(m, 'overview').map(i => i.message), [], `${t}: the overview`);
    for (const v of m.views) if (v.id !== 'overview') {
      const n = check(m, v.id).length;
      assert.ok(n <= issues.get(v.id), `${t}: view ${v.id} has ${n} layout issues, its source ${issues.get(v.id)}`);
    }
  }
});

// a variant view lays out clean, or with at most the crossings its card's "issues" in tools/types.json allows, each with
// its "why" (a crossing the type's layout cannot avoid, as its conformance note says)
test('a variant file validates clean, and each of its views lays out with no issue but those its card allows', () => {
  const cards = new Map();
  for (const t of TYPES) for (const v of S.types[t].variants) cards.set(v.file, v.views);
  for (const f of readdirSync(new URL('examples/variants/', root))) {
    const m = json(`examples/variants/${f}`), c = cards.get(`variants/${f.slice(0, -5)}`) || {};
    assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}: ${p.message}`), [], f);
    for (const v of m.views) {
      const allowed = (c[v.id] || {}).issues || 0, got = check(m, v.id).map(i => i.message);
      if (allowed) assert.ok((c[v.id].why || '').length > 20, `${f}: view ${v.id}'s card says why it allows ${allowed} issues`);
      assert.ok(got.length <= allowed, `${f}: view ${v.id}: ${got.join('; ')}`);
    }
  }
});
