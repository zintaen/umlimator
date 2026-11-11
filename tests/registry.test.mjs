// Diagram types (work package 1.3): the map is the default type, a view's `diagram` picks its type, and a type this
// release does not draw comes out as plain cards with a warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layout, validate } from '../lib/umlimator.js';
import { registerDiagramType, diagramOf } from '../src/core/registry.js';
import '../src/map/typed.js'; // registers the map in this (source) copy of the registry

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const said = f => { const w = [], keep = console.warn; console.warn = m => w.push(String(m)); try { return [f(), w]; } finally { console.warn = keep; } };

test('a view with no diagram is a map and takes today\'s path: a version-2 model without typed views draws as version 1', () => {
  for (const f of readdirSync(new URL('../bench/models/', import.meta.url)).filter(f => f.endsWith('.json'))) {
    const m = read('../bench/models/' + f), v2 = { ...m, schemaVersion: 2 };
    const geo = (x, id) => { const { ms, ...g } = layout(x, id); return { ...g, rounds: ms && ms.rounds }; }; // the time each phase took varies
    for (const v of m.views) assert.deepEqual(geo(v2, v.id), geo(m, v.id), `${f} ${v.id}`);
    assert.deepEqual(validate(v2), validate(m), f);
  }
});

test('a typed view whose diagram is not drawn yet shows its nodes as plain cards, lines to members drawn to their owners, with a warning (M13)', () => {
  const m = { schemaVersion: 2,
    nodes: [{ id: 'order', type: 'uml.Class', label: 'Order', members: [{ id: 'order.lines', type: 'uml.Property', label: 'lines' }] },
      { id: 'line', type: 'uml.Class', label: 'Line' }, { id: 'note', type: 'uml.Comment', label: 'a note' }],
    edges: [{ id: 'has', type: 'uml.Association', from: 'order.lines', to: 'line', label: 'has' }],
    views: [{ id: 'plain', diagram: 'uml.class', nodeIds: ['order', 'line', 'note'], edges: ['has'] }] };
  const before = JSON.stringify(m), [g, w] = said(() => layout(m, 'plain'));
  assert.deepEqual(g.nodes.map(n => n.id).sort(), ['line', 'note', 'order']);
  assert.deepEqual(g.edges.map(e => [e.from, e.to]), [['order', 'line']]);
  assert.ok(w.some(x => /view "plain": diagram "uml\.class" is not drawn by this release/.test(x)), w.join('\n'));
  assert.equal(JSON.stringify(m), before); // the host's model is never touched
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`), ['warning views[0].diagram']);
});

test('the 28 target examples lay out as plain cards, and validate() finds no error in them, only diagrams not drawn yet', () => {
  const dir = '../docs/diagrams/examples/', files = readdirSync(new URL(dir, import.meta.url)).filter(f => /^\d\d-.*\.json$/.test(f));
  assert.equal(files.length, 28);
  for (const f of files) {
    const m = read(dir + f);
    for (const v of m.views) said(() => assert.ok(layout(m, v.id).nodes.length || !(v.nodeIds || []).length, `${f} ${v.id}`));
    for (const p of validate(m)) assert.ok(p.level === 'warning' && /^views\[\d+\]\.diagram$/.test(p.path), `${f}: ${p.level} ${p.path} ${p.message}`);
  }
});

test('validate() on version 2 runs the typed core\'s checks on typed parts and the map\'s on the rest; version 1 is checked as before', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', members: [{ id: 'a.x', type: 'uml.Property' }] }, { id: 'card' }],
    edges: [{ id: 'e', type: 'uml.Dependency', from: 'a.x', to: 'ghost' }, { from: 'card', to: 'nowhere' }],
    views: [{ id: 'd', diagram: 'uml.class', nodeIds: ['a', 'zz'] }, { id: 'map', nodeIds: ['card', 'yy'] }] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`).sort(), [
    'error edges[0].to', 'error edges[1].to', 'error views[0].nodeIds[1]', 'error views[1].nodeIds[1]', 'warning views[0].diagram']);
  // a version-1 model's own `type` and `diagram` fields mean nothing to umlimator: the map's checks, as before
  const v1 = { nodes: [{ id: 'a', type: 'service' }], edges: [{ from: 'a', to: 'b', type: 'x' }], views: [{ id: 'v', diagram: 'mine', nodeIds: ['a', 'c'] }] };
  assert.deepEqual(validate(v1).map(p => `${p.level} ${p.path}`).sort(), ['error edges[0].to', 'error views[0].nodeIds[1]']);
  const [g] = said(() => layout(v1, 'v'));
  assert.deepEqual(g.nodes.map(n => n.id), ['a']);
});

test('the registry: the map is the default, names are <notation>.<kind>, a name is registered once', () => {
  assert.equal(diagramOf({ id: 'v' }).name, 'map');
  assert.equal(diagramOf({ id: 'v', diagram: 'map' }).name, 'map');
  assert.equal(diagramOf({ id: 'v', diagram: 'uml.nothing' }), null);
  const t = registerDiagramType('test.kind', { title: 'a test' });
  assert.equal(diagramOf({ diagram: 'test.kind' }), t);
  assert.ok(Object.isFrozen(t));
  assert.throws(() => registerDiagramType('test.kind'), /registered already/);
  assert.throws(() => registerDiagramType('Test Kind'), TypeError);
  assert.throws(() => registerDiagramType('map'), /registered already/);
});

test('a model newer than this release is refused when drawn, not drawn wrongly (F6); other values draw as a map', () => {
  const m = { schemaVersion: 3, nodes: [{ id: 'a' }], views: [{ id: 'v', nodeIds: ['a'] }] };
  assert.throws(() => layout(m, 'v'), /schemaVersion 3 is newer than this release reads/);
  for (const v of [0, 1.5, -1, '3', null]) assert.deepEqual(layout({ ...m, schemaVersion: v }, 'v').nodes.map(n => n.id), ['a'], String(v));
});

// from the review of #160
test('a map view of a version-2 model draws the model\'s lines as they are, whatever typed views the model also has', () => {
  const base = { schemaVersion: 2, nodes: [{ id: 'order', type: 'uml.Class', members: [{ id: 'order.lines', type: 'uml.Property' }] }, { id: 'line', type: 'uml.Class' }],
    edges: [{ id: 'has', type: 'uml.Association', from: 'order.lines', to: 'line' }] };
  const lines = (views, id) => said(() => layout({ ...base, views }, id))[0].edges.map(e => [e.from, e.to]);
  for (const map of [{ id: 'm', nodeIds: ['order', 'line'] }, { id: 'm', nodeIds: ['order', 'line'], edges: ['has'] }]) {
    const alone = lines([map], 'm');
    assert.deepEqual(lines([map, { id: 'c', diagram: 'uml.class', nodeIds: ['order', 'line'] }], 'm'), alone);
    assert.deepEqual(lines([map, { id: 'c', diagram: 'uml.class', nodeIds: ['order', 'line'] }], 'c'), [['order', 'line']]); // the plain view's own copy
  }
});

test('a view whose diagram is "map" is checked as a map, and an id used twice is said once', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a' }], views: [{ id: 'v', diagram: 'map', nodeIds: ['a', 'b'], nodes: [{ id: 'b' }], edges: [{ from: 'a', to: 'b' }] }] };
  assert.deepEqual(validate(m), []);
  const twice = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class' }, { id: 'a', type: 'uml.Class' }], views: [{ id: 'v', nodeIds: ['a'] }] };
  assert.deepEqual(validate(twice).map(p => `${p.level} ${p.path}`), ['error nodes[1].id']);
});
