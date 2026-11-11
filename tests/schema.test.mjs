// Schema version 2 (work package 1.2): migrate(), the version check, and the typed core's structural checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { migrate, validate } from '../lib/umlimator.js';
import { typedProblems } from '../src/core/model.js'; // the typed core's checks; validate() runs them from 1.3

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const jsons = dir => readdirSync(new URL(dir, import.meta.url)).filter(f => f.endsWith('.json')).map(f => dir + f);

test('every version-1 model migrates to itself, untouched: lines with no id keep their positional names (F9)', () => {
  const files = [...jsons('../examples/'), ...jsons('../bench/models/')];
  assert.ok(files.length > 10);
  for (const f of files) {
    const m = read(f), before = JSON.stringify(m);
    assert.equal(migrate(m), m, f);
    assert.equal(JSON.stringify(m), before, f);
    assert.deepEqual(typedProblems(m), [], f); // nothing typed in a version-1 model, whatever its fields
  }
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] };
  assert.equal(migrate(m).edges[0].id, undefined);
  assert.equal(migrate({ ...m, schemaVersion: 2 }).edges[0].id, undefined);
});

test('a newer schemaVersion, or one that is not a version, is an error: migrate() throws and validate() says so (F6)', () => {
  const m = { schemaVersion: 3, nodes: [], views: [{ id: 'v', nodeIds: [] }] };
  assert.throws(() => migrate(m), /schemaVersion 3 is newer than this release reads \(2\)/);
  assert.deepEqual(validate(m).filter(p => p.path === 'schemaVersion').map(p => p.level), ['error']);
  for (const v of [0, 1.5, '2', null]) {
    assert.throws(() => migrate({ ...m, schemaVersion: v }), /is not a version/, String(v));
    assert.equal(validate({ ...m, schemaVersion: v }).filter(p => p.path === 'schemaVersion').length, 1, String(v));
  }
  for (const v of [1, 2]) assert.deepEqual(validate({ ...m, schemaVersion: v }), [], String(v));
});

test('the 28 target examples pass the typed core\'s checks', () => {
  const files = readdirSync(new URL('../docs/diagrams/examples/', import.meta.url)).filter(f => /^\d\d-.*\.json$/.test(f));
  assert.equal(files.length, 28);
  for (const f of files) assert.deepEqual(typedProblems(read('../docs/diagrams/examples/' + f)), [], f);
});

test('the typed core names each problem by where it is: ids, types, ownership, ends and typed views', () => {
  const bad = { schemaVersion: 2,
    nodes: [
      { id: 'a', type: 'uml.Class', members: [{ id: 'a.x', type: 'uml.Property' }, { id: 'b', type: 'uml.Property' }, { id: 'a.n' }] },
      { id: 'b', type: 'uml.Class', parent: 'a.x' },            // b: used twice (a member has it)
      { id: 'p', type: 'uml.Package', parent: 'q' }, { id: 'q', type: 'uml.Package', parent: 'p' }, // a cycle
      { id: 'c', type: 'uml.Class', parent: 'c.m', members: [{ id: 'c.m', type: 'uml.Property' }] }, // inside its own member (M7)
      { id: 'd->e', type: 'Class' }, { id: 'card' },             // a positional-looking id, a bad type; an untyped card is fine
      { id: 'lost', type: 'uml.Class', parent: 'nowhere' },
    ],
    edges: [
      { type: 'uml.Association', from: 'a', to: 'card' },        // a typed edge needs an id
      { id: 'e1', type: 'uml.Association', from: 'a.x', to: 'ghost', props: { ends: { from: { part: 'nope' } } } },
      { from: 'a', to: 'b' },                                    // untyped: a map line, not checked here
    ],
    views: [
      { id: 'v', diagram: 'uml.class', direction: 'up', nodeIds: ['a', 'a.x', 'zz'], edges: ['e1', 'e9', { id: 'm1', type: 'uml.Message', from: 'a', to: 'box' }],
        containers: [{ id: 'box' }], subject: 'nobody', layout: { a: [0, 0], ghost: [1, 0] }, present: { zz: { rows: 3 } } },
      { id: 'w', diagram: 'UML Class', nodeIds: [] },
      { id: 'map', nodeIds: ['a', 'missing'], edges: [{ from: 'x', to: 'y' }] }, // a map view: validate()'s map checks, not these
    ] };
  const got = typedProblems(bad).map(p => `${p.level} ${p.path}`).sort();
  assert.deepEqual(got, [
    'error edges[0].id', 'error edges[1].props.ends.from.part', 'error edges[1].to',
    'error nodes[1].id', 'error nodes[2].parent', 'error nodes[3].parent', 'error nodes[4].parent',
    'error nodes[5].id', 'error nodes[7].parent',
    'error views[0].edges[1]', 'error views[0].nodeIds[1]', 'error views[0].nodeIds[2]', 'error views[0].subject',
    'warning nodes[0].members[2].type', 'warning nodes[5].type',
    'warning views[0].direction', 'warning views[0].layout.ghost', 'warning views[0].present.zz',
    'warning views[1].diagram',
  ]);
  const says = path => typedProblems(bad).find(p => p.path === path).message;
  assert.match(says('nodes[1].id'), /id "b" is used twice \(also nodes\[0\]\.members\[1\]\)/);
  assert.match(says('nodes[4].parent'), /"c" ends up inside itself/);
  assert.match(says('nodes[5].id'), /contains "->"/);
  assert.match(says('edges[1].to'), /"ghost" is not an element or a box/);
});
