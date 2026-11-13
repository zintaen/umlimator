// The Bookshop atlas (0.21.0): examples/bookshop-atlas.json is what tools/atlas.mjs builds from the Bookshop examples and
// tools/atlas-links.json, byte for byte, so it cannot drift from them. It validates with no core error, every view lays
// out, and every drill-down opens a view of the atlas: each link of the links file, the files' own, and no other, so no
// id one file shares with another opens a view by accident. From the map a reader reaches every view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src/map/typed.js';
import '../src/typed/layout.js';
import '../src/typed/draw.js';
import '../src/uml/class.js';
import '../src/uml/object.js';
import '../src/uml/package.js';
import '../src/uml/sequence.js';
import '../src/uml/communication.js';
import '../src/uml/usecase.js';
import '../src/uml/activity.js';
import '../src/uml/state.js';
import '../src/uml/overview.js';
import { layout, check } from '../src/map/api.js';
import { mapContext } from '../src/map/context.js';
import { validate } from '../src/map/validate.js';
import { build, renamed } from '../tools/atlas.mjs';

const LINKS = JSON.parse(readFileSync(new URL('../tools/atlas-links.json', import.meta.url), 'utf8'));
const { model: M, renames, text } = build();
const id = ref => { const [file, x] = [ref.slice(0, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)];
  return (renames.find(r => r.file === file && r.from === x) || { to: x }).to; };

test('the committed atlas is what tools/atlas.mjs builds, byte for byte', () => {
  assert.equal(readFileSync(new URL('../examples/bookshop-atlas.json', import.meta.url), 'utf8'), text,
    'examples/bookshop-atlas.json is stale: run node tools/atlas.mjs and commit it');
  assert.deepEqual(build().text, text); // the same on every run
  // an id is renamed only where an earlier file has it, and the rename is the file's name before it
  renames.forEach(r => { const earlier = LINKS.sources.slice(0, LINKS.sources.indexOf(r.file));
    assert.ok(earlier.includes(r.clash) && r.to === `${r.file}.${r.from}`, JSON.stringify(r)); });
  const ids = [...M.nodes, ...M.edges, ...M.views.flatMap(v => [...(v.edges || []).filter(e => typeof e === 'object'), ...(v.fragments || [])])].map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'every element id once');
  assert.equal(new Set(M.views.map(v => v.id)).size, M.views.length, 'every view id once');
});

test('the atlas validates with no core error; the UML rules find only what two files in one model raise', () => {
  const said = validate(M);
  assert.deepEqual(said.filter(p => p.level === 'error' && !p.rule), []);
  // the class type's rules run on the whole model: a generalization between two actors or two use cases is not one
  // between classifiers to them, and the package and class files each have their own package sales (the decision in
  // docs/module-api.md's 0.21.0 section)
  assert.deepEqual(said.map(p => [p.level, p.rule, p.ids]), [
    ['error', 'generalization-kinds', ['member-is-shopper', 'member', 'shopping-use-cases.shopper']],
    ['error', 'generalization-kinds', ['card-is-pay', 'pay-by-card', 'pay']],
    ['error', 'package-names', ['sales', 'bookshop-packages.sales']]]);
});

test('every view lays out; check() finds only the crossings its own file keeps', () => {
  const found = [];
  for (const v of M.views) {
    const g = layout(M, v.id);
    assert.ok(g.nodes.length > 0 && g.edges.every(e => e.pts.length >= 2), v.id);
    found.push(...check(M, v.id).map(p => p.message));
  }
  // fulfil-activity's 2 and order-states' 2, as the CI loop counts them on their own files' plain pass
  assert.ok(found.every(p => / cross$/.test(p)), found.join('\n'));
  assert.deepEqual(found.map(p => p.split(':')[0]), ['view fulfil', 'view fulfil', 'view order-life', 'view order-life']);
});

test('every drill-down opens a view of the atlas: the links file\'s, the files\' own, and no other', () => {
  const ctx = mapContext(M), opens = [];
  for (const v of M.views) for (const n of v.nodeIds) { const o = ctx.opensOf(n, v.id); if (o) opens.push([v.id, n, o]); }
  opens.forEach(([v, n, o]) => assert.ok(ctx.V[o], `${n} in ${v} opens ${o}, no view of the atlas`));
  LINKS.links.forEach(l => { const n = id(l.element), to = id(l.opens), on = opens.filter(x => x[1] === n);
    assert.ok(on.length && on.every(x => x[2] === to), `${l.element} opens ${l.opens} (${n} → ${to}) in every view that shows it: ${JSON.stringify(on)}`); });
  // a view of another kind of diagram opens and never unfolds in place (src/map/context.js); one of the same kind may
  // (fulfil's Take payment)
  const across = opens.filter(([v, , o]) => ctx.V[o].diagram !== ctx.V[v].diagram);
  assert.ok(across.length); across.forEach(([v, n]) => assert.equal(ctx.unfoldable(n, v), null, `${n} in ${v}`));
  assert.equal(ctx.unfoldable(id('fulfil-activity/pay'), 'fulfil'), 'take-payment');
  // a node opens a view by its opensView, or by being that view's id: only the map's Shop API, as in bookshop.json
  assert.deepEqual([...new Set(opens.filter(([, n]) => M.nodes.find(x => x.id === n).opensView == null).map(([, n, o]) => `${n}>${o}`))], ['api>api']);
  // from the map, every view: by what opens it, or as a view's child
  const next = new Map(M.views.map(v => [v.id, new Set([...opens.filter(x => x[0] === v.id).map(x => x[2]), ...M.views.filter(w => w.parent === v.id).map(w => w.id)])]));
  const reach = from => { const seen = new Set([from]); for (const v of seen) next.get(v).forEach(w => seen.add(w)); return seen; };
  assert.deepEqual([...reach(M.root)].sort(), M.views.map(v => v.id).sort());
  // the journeys the gallery names: map → classes → an order's state machine; use cases → activity → sequence
  const step = (a, b) => assert.ok(next.get(a).has(b), `${a} opens ${b}`);
  step('overview', 'domain'); step('domain', 'order-life');
  step('overview', 'shopping'); step('shopping', 'take-payment'); step('take-payment', 'checkout-sequence.checkout');
});

test('every view lays out in the atlas as in its own file: the same boxes, and lines through the same points', () => {
  for (const name of LINKS.sources) {
    const src = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    const R = new Map(renames.filter(r => r.file === name).map(r => [r.from, r.to])), r = x => R.get(x) ?? x;
    const pic = (g, f) => ({ nodes: g.nodes.map(n => [f(n.id), n.x, n.y, n.w, n.h]), edges: g.edges.map(e => [f(e.from), f(e.to), e.pts]) });
    for (const v of src.views) assert.deepEqual(pic(layout(M, r(v.id)), x => x), pic(layout(src, v.id), r), `${name} view ${v.id}`);
  }
});

test('the tool renames an id everywhere a file refers to it, and stops on a field it does not know', () => {
  const m = { nodes: [{ id: 'a', type: 't', props: { ends: { x: { part: 'a' } }, covers: ['a'], replyTo: 'a' } }],
    views: [{ id: 'v', subject: 'a', nodeIds: ['a'], tour: ['a'], layout: { a: {} }, present: { a: {} }, lanes: [{ nodeIds: ['a'] }] }] };
  const out = renamed(m, 'f', new Map([['a', 'f.a']]));
  assert.deepEqual(JSON.stringify(out).match(/"a"/g), null, JSON.stringify(out));
  assert.throws(() => renamed({ nodes: [{ id: 'a', props: { owner: 'a' } }] }, 'f', new Map()), /owner/);
  assert.throws(() => renamed({ views: [{ id: 'v', owner: 'a' }] }, 'f', new Map()), /owner/);
});
