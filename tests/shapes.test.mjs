// Card shapes (0.15.0; one style since 0.21.0) with no browser: a shape lays nothing out, and validate() says what it can't draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, validate } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
// a view's geometry as the bench hashes it: the cards' boxes, the lines' points and their labels' places
const sig = g => JSON.stringify([g.nodes.map(n => [n.id, n.x, n.y, n.w, n.h]), g.edges.map(e => [e.from, e.to, e.pts, e.lbl ? [e.lbl.x, e.lbl.y] : null])]);

test('a shape lays nothing out: each view of the examples and the benchmark models is the same with every card a person, and with a stale shapes field', () => {
  const models = [...['bookshop', 'bike-share', 'weather', 'assistant', 'clinic', 'shapes'].map(f => read(`../examples/${f}.json`)), ...['b10', 'd24'].map(f => read(`../bench/models/${f}.json`))];
  // map views: a typed view (bike-share's, since step 3 of the one-model plan) is drawn by its type, which no card shape reaches
  for (const m of models) for (const v of m.views.filter(v => !v.diagram || v.diagram === 'map')) {
    const base = sig(layout(m, v.id));
    assert.equal(sig(layout({ ...m, nodes: m.nodes.map(n => ({ ...n, shape: 'person' })) }, v.id)), base, `${m.title} / ${v.id}, every card a person`);
    // the box/c4/uml choice is gone (0.21.0): a model that still has it lays out as one without it
    assert.equal(sig(layout({ ...m, shapes: 'uml', views: m.views.map(w => ({ ...w, shapes: 'c4' })) }, v.id)), base, `${m.title} / ${v.id}, with shapes`);
  }
});

test('validate() takes the shapes, and finds nothing wrong in the shapes example and the imported clinic', () => {
  assert.deepEqual(validate(read('../examples/shapes.json')), []);
  assert.deepEqual(validate(read('../examples/clinic.json')), []);
  const all = ['box', 'person', 'browser', 'mobile', 'cylinder', 'pipe', 'document', 'hexagon', 'robot', 'terminal', 'window', 'folder', 'node'];
  assert.deepEqual(validate({ nodes: all.map(s => ({ id: s, shape: s, kind: 'person' })), views: [{ id: 'v', nodeIds: all }] }), []);
});

test('validate() warns about a shape it does not know, a shapes field it no longer reads, and a frontend card with a person\'s icon', () => {
  const got = validate({ shapes: 'c4', nodes: [{ id: 'r', label: 'Riders', kind: 'frontend', icon: 'users' }, { id: 'p', kind: 'person', icon: 'user' }, { id: 's', kind: 'frontend', icon: 'user', shape: 'person' }, { id: 'x', shape: 'blob' }],
    views: [{ id: 'v', shapes: 'nope', nodeIds: ['r', 'p', 's', 'x'] }, { id: 'w', nodeIds: ['r'] }] });
  assert.deepEqual(got.map(p => `${p.level} ${p.path}`).sort(), ['warning nodes[0].kind', 'warning nodes[3].shape', 'warning shapes', 'warning views[0].shapes']);
  assert.match(got.find(p => p.path === 'nodes[0].kind').message, /a frontend card is drawn as a browser: kind "person"/);
  assert.equal(got.find(p => p.path === 'shapes').message, 'shapes is no longer read: maps draw in one style');
  assert.equal(got.find(p => p.path === 'views[0].shapes').message, 'shapes is no longer read: maps draw in one style');
});

test('validate() says nothing of a person\'s icon on a frontend card only typed views hold: they keep their own notation (0.21.0)', async () => {
  const all = await import('../lib/umlimator-all.js');
  const model = typed => ({ schemaVersion: 2, nodes: [{ id: 'r', type: 'uml.Class', label: 'Riders', kind: 'frontend', icon: 'users' }],
    views: [{ id: 'c', diagram: 'uml.class', nodeIds: ['r'] }, ...(typed ? [] : [{ id: 'm', nodeIds: ['r'] }])] });
  assert.ok(!all.validate(model(true)).some(p => p.path === 'nodes[0].kind'));
  assert.ok(all.validate(model(false)).some(p => p.path === 'nodes[0].kind'));
});

test('validate() warns about a shape it does not know in a view\'s nodeOverrides, as on a card', () => {
  const got = validate({ nodes: [{ id: 'db', kind: 'database' }], views: [{ id: 'v', nodeIds: ['db'], nodeOverrides: { db: { shape: 'cylindr' } } }, { id: 'w', nodeIds: ['db'], nodeOverrides: { db: { shape: 'Cylinder' } } }] });
  assert.deepEqual(got.map(p => `${p.level} ${p.path}`), ['warning views[0].nodeOverrides.db.shape']);
});

test('a shape or kind named like an object\'s own key (constructor, __proto__) is not a shape or a kind: validate() warns, on a card and in nodeOverrides', () => {
  for (const sh of ['constructor', '__proto__', 'toString']) {
    const m = { nodes: [{ id: 'db', label: 'DB', kind: 'database', shape: sh }, { id: 'api', label: 'API', kind: 'backend' }], edges: [{ from: 'api', to: 'db' }],
      views: [{ id: 'v', label: 'V', nodeIds: ['db', 'api'], nodeOverrides: { db: { shape: sh } } }] };
    assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`), ['warning nodes[0].shape', 'warning views[0].nodeOverrides.db.shape'], sh);
    assert.deepEqual(validate({ nodes: [{ id: 'a', kind: sh }], views: [{ id: 'v', nodeIds: ['a'] }] }).map(p => `${p.level} ${p.path}`), ['warning nodes[0].kind'], sh);
  }
});

test('a card\'s text that is not a string (a list of lines, a number) is drawn as written, and validate() warns (audit 10)', async () => {
  const { svgOf } = await import('../src/draw/svg.js');
  const m = { meta: { root: 5 }, nodes: [{ id: 'a', label: 'Alpha', what: ['Takes orders.', 'Keeps a cart.'] }, { id: 'b', label: 'Beta', what: 5, author: 1042, origin: 7 }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  assert.match(svgOf(layout(m, 'v')), /Takes orders\./);
  assert.deepEqual(validate(m).filter(p => p.level === 'warning').map(p => p.path), ['meta.root', 'nodes[0].what', 'nodes[1].what', 'nodes[1].origin', 'nodes[1].author']);
});
