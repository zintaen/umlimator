// Unfolding in place (#71): layout(model, view, { expand }) in Node. node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layout, check } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const SHOP = read('../bench/models/u21.json');
const lines = g => g.edges.map(e => `${e.from}>${e.to}`);
const ids = g => g.edges.flatMap(e => e.ids);

test('every card that unfolds in the examples unfolds with a clean layout check', () => {
  let n = 0;
  for (const f of ['bike-share', 'weather', 'assistant', 'bookshop']) {
    const m = read(`../examples/${f}.json`);
    for (const v of m.views) for (const card of layout(m, v.id).nodes.filter(x => x.opens || x.kids)) {
      if (!layout(m, v.id, { expand: [card.id] }).unfolded.length) continue;
      assert.deepEqual(check(m, v.id, { expand: [card.id] }).map(i => i.message), [], `${f} ${v.id} with ${card.id} unfolded`); n++;
    }
  }
  assert.ok(n >= 5, `unfolded ${n}`); // bike-share: bikeshare, trips, fleet; weather: the check stage, the checker
});

test("the card becomes a box of its inner view's own cards, in the box it was in; the inner view's boxes come along", () => {
  const g = layout(SHOP, 'shop', { expand: ['orders'] }), box = g.families.find(f => f.id === 'orders');
  assert.deepEqual(g.unfolded, ['orders']);
  assert.ok(!g.nodes.some(n => n.id === 'orders'), 'the card is gone');
  assert.equal(box.label, 'Order service'); assert.equal(box.unfolds, 'orders');
  assert.deepEqual(box.nodeIds, ['o-api', 'o-repo']);
  assert.deepEqual(g.families.find(f => f.id === 'o-core').nodeIds, ['o-cart', 'o-checkout']);
  assert.equal(g.families.find(f => f.id === 'o-core').parent, 'orders');
  assert.equal(layout(SHOP, 'teams', { expand: ['orders'] }).families.find(f => f.id === 'orders').parent, 'sales');
});

test("this view's lines to the card move onto the cards inside the inner view joins to that neighbour, all of them, else end on the box", () => {
  const g = layout(SHOP, 'shop', { expand: ['orders'] }), L = lines(g), I = ids(g);
  assert.ok(L.includes('web>o-api') && !I.includes('s2'), 'web → orders is web → Order API');
  assert.ok(L.includes('o-cart>stock') && L.includes('o-repo>stock') && !I.includes('s4'), 'two cards inside reach the stock database: two lines');
  assert.ok(L.includes('o-repo>warehouse') && !I.includes('s10'));
  assert.ok(L.includes('orders>mail') && I.includes('s5'), 'the inner view has no line to the mail service: this one ends on the box');
  assert.ok(L.includes('o-api>o-cart') && L.includes('o-checkout>o-repo'), "the inner view's own lines inside");
  assert.ok(!L.some(l => l.includes('buyers>o-')), 'nothing the inner view does not draw');
});

test('a line drawn both ways stays a pair on the box unless the inner view joins that neighbour to one card both ways', () => {
  const g = layout(SHOP, 'shop', { expand: ['warehouse'] }), I = ids(g);
  assert.ok(I.includes('s7') && I.includes('s8') && !I.includes('w1') && !I.includes('w4'), 'moves (to Stock API) and low stock (from Stock alerts): split, so both stay');
  assert.ok(lines(g).includes('w-pick>stock') && !I.includes('s6'));
  assert.deepEqual(check(SHOP, 'shop', { expand: ['warehouse'] }).map(i => i.message), []);
});

test('the rest of the picture keeps its places: earlier columns stay, later ones move right, those under the card move down', () => {
  const g0 = layout(SHOP, 'teams'), g = layout(SHOP, 'teams', { expand: ['orders'] }), at = (G, id) => G.nodes.find(n => n.id === id);
  assert.deepEqual([at(g, 'web').col, at(g, 'web').row], [at(g0, 'web').col, at(g0, 'web').row]);
  assert.ok(at(g, 'payments').col > at(g0, 'payments').col && at(g, 'payments').row === at(g0, 'payments').row);
  assert.ok(at(g, 'ops').row > at(g0, 'ops').row, 'the card under it in its column moves down');
  assert.deepEqual(check(SHOP, 'teams', { expand: ['orders'] }).map(i => i.message), []);
});

test('a card inside an unfolded box unfolds too, whatever order they are named in', () => {
  const g = layout(SHOP, 'shop', { expand: ['o-checkout', 'orders'] });
  assert.deepEqual(g.unfolded, ['orders', 'o-checkout']);
  assert.equal(g.families.find(f => f.id === 'o-checkout').parent, 'o-core');
  assert.ok(lines(g).includes('o-api>c-tax') && lines(g).includes('c-fraud>payments'));
});

test('what does not unfold: a numbered view, in or opened, a view not loaded, a card with no cards of its own inside', () => {
  assert.deepEqual(layout(SHOP, 'shop', { expand: ['catalog', 'reports', 'buyers', 'nope'] }).unfolded, []);
  const book = read('../examples/bookshop.json');
  assert.deepEqual(layout(book, 'overview', { expand: ['api'] }).unfolded, []);
  assert.equal(layout(SHOP, 'shop').unfolded, undefined, 'no expand, no unfolded');
});

test('unfolding leaves the model alone and lays out the same every time', () => {
  const before = JSON.stringify(SHOP), a = layout(SHOP, 'shop', { expand: ['orders'] }), b = layout(SHOP, 'shop', { expand: ['orders'] });
  assert.equal(JSON.stringify(SHOP), before);
  assert.deepEqual(a.nodes.map(n => [n.id, n.x, n.y]), b.nodes.map(n => [n.id, n.x, n.y]));
});

// the bench's geometry hash (bench/bench.py, #bench=1), as tests/layout.test.mjs computes it
const hash = g => {
  const sig = JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null])]);
  let h = 2166136261; for (let k = 0; k < sig.length; k++) h = Math.imul(h ^ sig.charCodeAt(k), 16777619) >>> 0;
  return h.toString(16);
};
test('layout() unfolds every benchmark view the bench unfolds exactly as the browser did (bench/expected.json)', () => {
  const expected = read('../bench/expected.json').results, models = Object.fromEntries(readdirSync(new URL('../bench/models/', import.meta.url)).map(f => [f.replace('.json', ''), read('../bench/models/' + f)]));
  const keys = Object.keys(expected).filter(k => k.includes('+'));
  for (const k of keys) { const [name, rest] = k.split('/'), [view, ...cards] = rest.split('+');
    assert.deepEqual([hash(layout(models[name], view, { expand: cards }))], expected[k].hashes, k); }
  assert.ok(keys.length >= 4, `checked ${keys.length}`);
});
