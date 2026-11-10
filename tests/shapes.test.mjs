// Card shapes (0.15.0) with no browser: a notation lays nothing out, and validate() says what it can't draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, validate } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const shape = (m, nt, own = {}) => ({ ...m, shapes: nt, views: m.views.map(v => ({ ...v, ...own })) });
// a view's geometry as the bench hashes it: the cards' boxes, the lines' points and their labels' places
const sig = g => JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null])]);

test('a notation lays nothing out: each view of the examples and the benchmark models is the same in box, c4 and uml', () => {
  const models = [...['bookshop', 'bike-share', 'weather', 'assistant', 'clinic', 'shapes'].map(f => read(`../examples/${f}.json`)), ...['b10', 'd24'].map(f => read(`../bench/models/${f}.json`))];
  for (const m of models) for (const v of m.views) {
    const base = sig(layout({ ...m, shapes: undefined }, v.id));
    for (const nt of ['c4', 'uml']) assert.equal(sig(layout(shape(m, nt), v.id)), base, `${m.title} / ${v.id} in ${nt}`);
    assert.equal(sig(layout(shape(m, 'box', { shapes: 'uml' }), v.id)), base, `${m.title} / ${v.id}: a view's own notation`);
  }
});

test('validate() takes the notations and the shapes, and finds nothing wrong in the shapes example and the imported clinic', () => {
  assert.deepEqual(validate(read('../examples/shapes.json')), []);
  assert.deepEqual(validate(read('../examples/clinic.json')), []);
  const all = ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node'];
  assert.deepEqual(validate({ shapes: 'uml', nodes: all.map(s => ({ id: s, shape: s, kind: 'person' })), views: [{ id: 'v', shapes: 'c4', nodeIds: all }] }), []);
});

test('validate() warns about a shape or notation it does not know, and hints when c4 would draw a person as a browser', () => {
  const got = validate({ shapes: 'c4', nodes: [{ id: 'r', label: 'Riders', kind: 'frontend', icon: 'users' }, { id: 'p', kind: 'person', icon: 'user' }, { id: 's', kind: 'frontend', icon: 'user', shape: 'person' }, { id: 'x', shape: 'blob' }],
    views: [{ id: 'v', shapes: 'nope', nodeIds: ['r', 'p', 's', 'x'] }, { id: 'w', shapes: 'box', nodeIds: ['r'] }] });
  assert.deepEqual(got.map(p => `${p.level} ${p.path}`).sort(), ['warning nodes[0].kind', 'warning nodes[3].shape', 'warning views[0].shapes']);
  assert.match(got.find(p => p.path === 'nodes[0].kind').message, /c4 draws a frontend card as a browser: kind "person"/);
  // a frontend card with a person's icon is fine where no view draws c4
  assert.deepEqual(validate({ nodes: [{ id: 'r', kind: 'frontend', icon: 'users' }], views: [{ id: 'v', shapes: 'uml', nodeIds: ['r'] }] }), []);
});

test('validate() warns about a shape it does not know in a view\'s nodeOverrides, as on a card', () => {
  const got = validate({ nodes: [{ id: 'db', kind: 'database' }], views: [{ id: 'v', nodeIds: ['db'], nodeOverrides: { db: { shape: 'cylindr' } } }, { id: 'w', nodeIds: ['db'], nodeOverrides: { db: { shape: 'Cylinder' } } }] });
  assert.deepEqual(got.map(p => `${p.level} ${p.path}`), ['warning views[0].nodeOverrides.db.shape']);
});

test('a shape or kind named like an object\'s own key (constructor, __proto__) is not a shape or a kind: validate() warns, on a card and in nodeOverrides', () => {
  for (const sh of ['constructor', '__proto__', 'toString']) {
    const m = { shapes: 'c4', nodes: [{ id: 'db', label: 'DB', kind: 'database', shape: sh }, { id: 'api', label: 'API', kind: 'backend' }], edges: [{ from: 'api', to: 'db' }],
      views: [{ id: 'v', label: 'V', nodeIds: ['db', 'api'], nodeOverrides: { db: { shape: sh } } }] };
    assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`), ['warning nodes[0].shape', 'warning views[0].nodeOverrides.db.shape'], sh);
    assert.deepEqual(validate({ nodes: [{ id: 'a', kind: sh }], views: [{ id: 'v', nodeIds: ['a'] }] }).map(p => `${p.level} ${p.path}`), ['warning nodes[0].kind'], sh);
  }
});
