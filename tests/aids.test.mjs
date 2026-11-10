// The reading aids (0.15.0) with no browser: a box's tone and a line's step in the model, validate() and describe() on them,
// and the room layout() gives a step's mark. tests/aids.html draws them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, check, validate, describe } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const cards = ids => ids.map(id => ({ id, label: id.toUpperCase(), kind: 'backend' }));

test('validate() takes a step on a line and a tone on a box, and warns when they are not what they draw', () => {
  const m = { nodes: cards(['a', 'b']), edges: [{ id: 'e1', from: 'a', to: 'b', step: 2.1 }, { id: 'e2', from: 'b', to: 'a', step: '2ab' }, { id: 'e3', from: 'a', to: 'b', step: -1 },
    { id: 'e4', from: 'a', to: 'b', step: '2abc' }, { id: 'e5', from: 'a', to: 'b', step: '' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: ['e1', { from: 'a', to: 'b', step: 3 }, { from: 'b', to: 'a', step: null }],
      containers: [{ id: 'x', nodeIds: ['a'], tone: 'orange' }, { id: 'y', nodeIds: ['b'], tone: 5 }, { id: 'z', tone: false }] }] };
  const no = 'is not a number of 0 or more, or text of 1 to 3 characters (2a): drawn as written';
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}: ${p.message}`), [
    `warning edges[2].step: step -1 ${no}`, `warning edges[3].step: step "2abc" ${no}`, `warning edges[4].step: step "" ${no}`,
    'warning views[0].containers[1].tone: tone 5 is not a palette name (green, amber, ...): drawn in slate',
    'warning views[0].containers[2].tone: tone false is not a palette name (green, amber, ...): ignored',
  ]);
});

test('a box keeps its tone in the geometry, for the picture to tint its region', () => {
  const g = layout({ nodes: cards(['a', 'b']), edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'], containers: [{ id: 'x', nodeIds: ['b'], tone: 'green' }, { id: 'y', nodeIds: ['a'] }] }] }, 'v');
  assert.deepEqual(g.families.map(f => [f.id, f.tone]), [['x', 'green'], ['y', undefined]]);
});

test('a step is drawn on its line in any view, before the label; a numbered view numbers in run order whatever the step', () => {
  const m = { nodes: cards(['a', 'b', 'c']), edges: [{ id: 'ab', from: 'a', to: 'b', label: 'calls', step: 2 }, { id: 'bc', from: 'b', to: 'c', step: 1.5 }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }, { id: 's', nodeIds: ['a', 'b', 'c'], render: 'sequence' }] };
  const g = layout(m, 'v'), at = id => g.edges.find(e => e.ids.includes(id)).lbl;
  assert.deepEqual([at('ab').step, at('ab').text, at('bc').step, at('bc').text], [2, 'calls', 1.5, '']); // a mark alone on a line with no label
  assert.ok(at('ab').w > 16 + 4 + 20 && at('bc').sw > 16, 'the mark is in the pill, and 1.5 is a pill of its own'); // as #82 draws 4.1
  assert.deepEqual(check(m, 'v'), []);
  assert.deepEqual(layout(m, 's').edges.map(e => e.lbl.step), [1, 2]);
});

test('a step may be short text: drawn as written, a circle for one character and a pill for two or three', () => {
  const m = { nodes: cards(['a', 'b', 'c', 'd']), edges: [{ id: 'ab', from: 'a', to: 'b', label: 'asks', step: '2a' }, { id: 'bc', from: 'b', to: 'c', step: 'b' },
    { id: 'cd', from: 'c', to: 'd', label: 'pays', step: 12 }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd'] }] };
  const g = layout(m, 'v'), at = id => g.edges.find(e => e.ids.includes(id)).lbl;
  assert.deepEqual([at('ab').step, at('ab').text, at('bc').step, at('cd').step], ['2a', 'asks', 'b', 12]);
  assert.ok(at('bc').sw === 16 && at('ab').sw >= 20 && at('cd').sw >= 20, JSON.stringify([at('ab').sw, at('bc').sw, at('cd').sw])); // 16: the circle
  assert.deepEqual(validate(m), []);
  assert.deepEqual(check(m, 'v'), []);
  assert.match(describe(m, 'v'), /\nA calls B \("asks", step 2a\)\.\n/);
});

test('lines drawn as one show the first one\'s step, and their title lists each; keepPairs numbers each line', () => {
  const m = { nodes: cards(['a', 'b']), edges: [{ id: 'x', from: 'a', to: 'b', label: 'asks', step: 1 }, { id: 'y', from: 'a', to: 'b', label: 'pays', step: 4 }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }, { id: 'k', nodeIds: ['a', 'b'], keepPairs: true }] };
  const [one] = layout(m, 'v').edges;
  assert.deepEqual([one.step, one.when], [1, '1. asks\n4. pays']);
  assert.deepEqual(layout(m, 'k').edges.map(e => e.lbl.step), [1, 4]);
});

test('a numbered line with no label gets room for its mark between neighbouring columns, as a labelled line does', () => {
  const m = step => ({ nodes: cards(['a', 'b']), edges: [{ from: 'a', to: 'b', ...(step ? { step } : {}) }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] });
  const gap = g => g.nodes[1].x - (g.nodes[0].x + g.nodes[0].w);
  assert.equal(gap(layout(m(0), 'v')), 66); // no label, no step: the map's own gap
  const g = layout(m(7), 'v'), L = g.edges[0].lbl;
  assert.equal(gap(g), 76); // the 22 px mark and 27 px of line on each side, as a label gets
  assert.ok(L.x - (g.nodes[0].x + g.nodes[0].w) >= 16 && g.nodes[1].x - (L.x + L.w) >= 16, JSON.stringify(L));
});

test('describe() says a line\'s step in any view, and a numbered view keeps its run order', () => {
  const shop = read('../examples/bookshop.json');
  assert.match(describe(shop, 'checkout'), /\nStorefront calls Shop API \("checkout", JSON over HTTPS, step 2\)\.\n/);
  assert.match(describe(shop, 'api'), /\nStep 1: Shoppers calls Shop API \("checks out"\)\.\n/);
  assert.doesNotMatch(describe(shop, 'overview'), /step \d/);
});

test("the bookshop's checkout reads as the blend: six steps with their labels whole, two boxes with a tone, a clean check", () => {
  const shop = read('../examples/bookshop.json'), g = layout(shop, 'checkout');
  assert.deepEqual(g.edges.map(e => [e.lbl.step, e.lbl.text, e.weight]).sort((p, q) => p[0] - q[0]), [[1, 'browse, buy', 2], [2, 'checkout', 2], [3, 'charge the card', 1],
    [4, 'paid order', 2], [5, 'next order', 2], [6, 'confirmation', 2]]);
  assert.deepEqual(g.families.map(f => [f.id, f.tone]), [['web', 'cyan'], ['orders', 'orange']]);
  assert.deepEqual(check(shop, 'checkout'), []);
});

test('A→B and B→A drawn as one: the first one\'s step on the line, and its title lists each with its own', () => {
  const m = { nodes: cards(['a', 'b']), edges: [{ id: 'x', from: 'a', to: 'b', label: 'asks', step: 1 }, { id: 'y', from: 'b', to: 'a', label: 'answers', step: 2 }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  const [one] = layout(m, 'v').edges;
  assert.deepEqual([one.both, one.step, one.label, one.when], [true, 1, 'asks / answers', '1. asks\n2. answers']);
  delete m.edges[0].step; // only B→A has a step: it is still in the title
  assert.equal(layout(m, 'v').edges[0].when, 'asks\n2. answers');
});
