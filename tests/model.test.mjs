// validate() and check(): a model's own problems, and the layout check's geometry, with no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, check, layout } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));

test('validate() finds nothing wrong in the examples and the benchmark models', () => {
  for (const f of ['bookshop', 'bike-share', 'weather', 'assistant']) assert.deepEqual(validate(read(`../examples/${f}.json`)), [], f);
  for (const f of ['b10', 'b26', 'b69', 'd24', 'm50']) assert.deepEqual(validate(read(`../bench/models/${f}.json`)), [], f);
});

test('validate() names each error and warning by where it is, and accepts what render() draws (lines to a box, a view loaded later)', () => {
  const bad = { root: 'nope',
    nodes: [{ id: 'a', kind: 'backend' }, { id: 'a' }, { label: 'no id' }, { id: 'b', kind: 'wizard', opensView: 'later' }],
    edges: [{ id: 'e1', from: 'a', to: 'ghost' }, { id: 'e1', from: 'a', to: 'box' }, { id: 'e3', from: 'a', to: 'b', kind: 'zaps', weight: 5, fromSide: 'up' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], tour: ['a', 'z'], stepIds: ['q'], browserOrder: ['w'], layout: { zz: [0, 0] },
      edges: ['e1', 'e9', { from: 'a', to: 'box' }, { from: 'a', to: 'far' }],
      containers: [{ id: 'box', nodeIds: ['a', 'x'], parent: 'inner' }, { id: 'inner', parent: 'box' }, { id: 'lost', parent: 'nowhere' }] }] };
  const got = validate(bad).map(p => `${p.level} ${p.path}`).sort();
  assert.deepEqual(got, [
    'error edges[0].to', 'error edges[1].id', 'error nodes[1].id', 'error nodes[2].id', 'error root',
    'error views[0].browserOrder[0]', 'error views[0].containers[0].nodeIds[1]', 'error views[0].containers[0].parent', 'error views[0].containers[1].parent',
    'error views[0].containers[2].parent', 'error views[0].edges[1]', 'error views[0].edges[3].to', 'error views[0].nodeIds[2]',
    'error views[0].stepIds[0]', 'error views[0].tour[1]',
    'warning edges[2].fromSide', 'warning edges[2].kind', 'warning edges[2].weight', 'warning nodes[3].kind', 'warning nodes[3].opensView', 'warning views[0].layout.zz',
  ]);
  assert.match(validate(bad).find(p => p.path === 'views[0].containers[0].parent').message, /inside itself/);
  assert.deepEqual(validate({ nodes: [] }).map(p => p.path), ['views']);
});

test('validate() warns of a line from a card or a box to itself, which no view draws (F1)', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'], edges: [{ from: 'box', to: 'box' }, { from: 'a', to: 'b' }], containers: [{ id: 'box', nodeIds: ['b'] }] }] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path} ${p.message}`), [
    'warning edges[0] a line from "a" to itself: not drawn',
    'warning views[0].edges[0] a line from "box" to itself: not drawn',
  ]);
  assert.equal(layout(m, 'v').edges.length, 1); // the view's own lines: only a -> b is drawn
});

test('check() reports the layout check\'s geometry for a view, naming the lines it is about', () => {
  const cards = ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase(), kind: 'backend' }));
  const clean = { nodes: cards, edges: [{ id: 'ab', from: 'a', to: 'b', label: 'calls' }, { id: 'bc', from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }] };
  assert.deepEqual(check(clean, 'v'), []);
  const back = { nodes: cards, edges: [{ id: 'cb', from: 'c', to: 'b' }], views: [{ id: 'v', nodeIds: ['b', 'c'], layout: { b: [0, 0], c: [1, 0] } }] };
  assert.deepEqual(check(back, 'v'), [{ message: 'view v: edge C→B runs right-to-left', targets: [{ type: 'edge', ids: ['cb'], view: 'v' }] }]);
  assert.throws(() => check(clean, 'nope'), /no view/);
});

test('check() names exactly what an issue is about: of two lines that read the same, the one it means (#61)', () => {
  const m = { nodes: [{ id: 'a1', label: 'API', kind: 'backend' }, { id: 'a2', label: 'API', kind: 'backend' }, { id: 'db', label: 'DB', kind: 'database' }],
    edges: [{ id: 'a2db', from: 'a2', to: 'db' }, { id: 'a1db', from: 'a1', to: 'db' }],
    views: [{ id: 'v', nodeIds: ['a1', 'a2', 'db'], layout: { a2: [0, 0], db: [1, 0], a1: [2, 0] } }] };
  assert.deepEqual(check(m, 'v'), [{ message: 'view v: edge API→DB runs right-to-left', targets: [{ type: 'edge', ids: ['a1db'], view: 'v' }] }]);
});
