// rules(): what a model says must hold, checked with no browser (#70).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules, validate } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));

test('rules() finds nothing in the examples, whose rules hold, nor in a model without rules', () => {
  for (const f of ['bookshop', 'bike-share', 'weather', 'assistant']) assert.deepEqual(rules(read(`../examples/${f}.json`)), [], f);
  assert.ok(read('../examples/bike-share.json').rules.length >= 2);
  assert.deepEqual(rules({ nodes: [], views: [] }), []);
});

test('rules() names each break by its rule and view, words it as the check does, and targets the lines (and boxes) it is about', () => {
  const t = read('./rules.json'), edge = id => ({ type: 'edge', ids: [id], view: 'teams' });
  assert.deepEqual(rules(t), [
    { rule: 'apps-no-db', view: 'teams', message: 'view teams: edge App→Store breaks rule "Apps never call a database directly"', targets: [edge('app-store')] },
    { rule: 'api-owns-store', view: 'teams', message: 'view teams: edge App→Store breaks rule "Only the API writes the store"', targets: [edge('app-store')] },
    { rule: 'teams-acyclic', view: 'teams', message: 'view teams: boxes "Front team" and "Back team" form a cycle, which breaks rule "No cycles between teams"',
      targets: [{ type: 'container', id: 'front', view: 'teams' }, { type: 'container', id: 'back', view: 'teams' }, edge('app-store'), edge('api-store'), edge('worker-api')] },
  ]);
  assert.deepEqual(validate(t), []);
});

test('selectors: kinds as the map draws them, lists, boxes at any depth, not, a line that ends on a box, and views', () => {
  const m = { nodes: [{ id: 'ui', kind: 'web' }, { id: 'svc', kind: 'service' }, { id: 'db', kind: 'db' }, { id: 'q', kind: 'queue' }],
    edges: [{ id: 'e1', from: 'ui', to: 'db' }, { id: 'e2', from: 'svc', to: 'db' }, { id: 'e3', from: 'ui', to: 'inner' }, { id: 'e4', from: 'q', to: 'svc' }],
    views: [{ id: 'v', nodeIds: ['ui', 'svc', 'db', 'q'], containers: [{ id: 'outer', nodeIds: ['ui'] }, { id: 'inner', parent: 'outer', nodeIds: ['svc'] }] },
      { id: 'w', nodeIds: ['ui', 'db'] }] };
  const broken = r => rules({ ...m, rules: [{ id: 'r', ...r }] }).map(b => `${b.view}:${b.targets[0].ids}`);
  assert.deepEqual(broken({ from: { kind: 'frontend' }, to: { kind: 'database' } }), ['v:e1', 'w:e1']);   // "web" draws as a frontend, "db" as a database
  assert.deepEqual(broken({ from: { kind: ['frontend', 'backend'] }, to: { id: 'db' } }), ['v:e1', 'v:e2', 'w:e1']);
  assert.deepEqual(broken({ from: { container: 'outer' }, to: { kind: 'database' } }), ['v:e1', 'v:e2']);   // svc is in outer, through inner
  assert.deepEqual(broken({ from: { not: { kind: 'frontend' } }, to: { id: 'db' } }), ['v:e2']);
  assert.deepEqual(broken({ to: { container: 'inner' } }), ['v:e3', 'v:e4']);                           // a line that ends on the box is in it
  assert.deepEqual(broken({ to: { kind: 'backend' } }), ['v:e4']);                                       // a box has no kind
  assert.deepEqual(broken({ views: ['w'], from: { kind: 'frontend' } }), ['w:e1']);
});

test('a rule that names a box holds only in the views that draw one of its boxes: a not-container rule stays quiet elsewhere', () => {
  const m = { nodes: [{ id: 'ui', kind: 'web' }, { id: 'svc', kind: 'service' }, { id: 'db', kind: 'db' }],
    edges: [{ id: 'e1', from: 'ui', to: 'db' }, { id: 'e2', from: 'svc', to: 'db' }],
    views: [{ id: 'v', nodeIds: ['ui', 'svc', 'db'], containers: [{ id: 'core', nodeIds: ['svc', 'db'] }] }, { id: 'w', nodeIds: ['ui', 'db'] }] };
  const broken = r => rules({ ...m, rules: [{ id: 'r', ...r }] }).map(b => `${b.view}:${b.targets[0].ids}`);
  assert.deepEqual(broken({ from: { not: { container: 'core' } }, to: { id: 'db' } }), ['v:e1']);   // w draws no "core": ui→db is not a break there
  assert.deepEqual(broken({ from: { kind: 'frontend' }, to: { not: { id: 'core' } } }), ['v:e1']);    // a box's id names it too
  assert.deepEqual(broken({ from: { not: { container: 'core' } } }), ['v:e1']);
  assert.deepEqual(broken({ views: ['w'], from: { not: { container: 'core' } }, to: { id: 'db' } }), []); // views narrows it further
  assert.deepEqual(broken({ from: { kind: 'frontend' }, to: { id: 'db' } }), ['v:e1', 'w:e1']);    // no box named: every view
});

test('noCycles weighs a box against its siblings, at every depth; a line into a box\'s own inner box is no cycle', () => {
  const m = { nodes: ['a', 'b', 'c', 'd', 'x'].map(id => ({ id, kind: 'backend' })),
    edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ba', from: 'b', to: 'a' }, { id: 'cd', from: 'c', to: 'd' }, { id: 'dx', from: 'd', to: 'x' }, { id: 'xc', from: 'x', to: 'c' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c', 'd', 'x'], containers: [{ id: 'p', label: 'P', nodeIds: ['x'] },
      { id: 'p1', label: 'P1', parent: 'p', nodeIds: ['a', 'c'] }, { id: 'p2', label: 'P2', parent: 'p', nodeIds: ['b'] }, { id: 'q', label: 'Q', nodeIds: ['d'] }] }],
    rules: [{ id: 'acyclic', noCycles: true }] };
  // P→Q (c→d) and Q→P (d→x); P1⇄P2 inside P, drawn as one two-way line; x→c runs from P into its own P1: no cycle
  assert.deepEqual(rules(m).map(b => [b.message, b.targets.map(t => t.id || t.ids.join('+'))]), [
    ['view v: boxes "P" and "Q" form a cycle, which breaks rule "acyclic"', ['p', 'q', 'cd', 'dx']],
    ['view v: boxes "P1" and "P2" form a cycle, which breaks rule "acyclic"', ['p1', 'p2', 'ab+ba']],
  ]);
  m.edges = m.edges.filter(e => e.id !== 'dx' && e.id !== 'ba');
  assert.deepEqual(rules(m), []);
});

test('validate() checks rules: an id, from, to or noCycles, its views, and selectors that name nothing or misspell a kind', () => {
  const m = { nodes: [{ id: 'a', kind: 'frontend' }], views: [{ id: 'v', nodeIds: ['a'], containers: [{ id: 'box', nodeIds: ['a'] }] }],
    rules: [{ id: 'r', from: { kind: 'frontnd', id: 'ghost', container: ['box', 'nobox'], kinds: 'x' }, to: { not: { id: 'a' } } },
      { id: 'r', views: ['nope'] }, { title: 'no id', noCycles: true }, 'x'] };
  assert.deepEqual(validate(m).map(p => `${p.level} ${p.path}`).sort(), [
    'error rules[1]', 'error rules[1].id', 'error rules[1].views[0]', 'error rules[2].id', 'error rules[3]',
    'warning rules[0].from.container[1]', 'warning rules[0].from.id', 'warning rules[0].from.kind', 'warning rules[0].from.kinds',
  ]);
  assert.match(validate(m).find(p => p.path === 'rules[0].from.kind').message, /picks script cards/);
  assert.deepEqual(validate({ ...m, rules: 'none' }).map(p => p.path), ['rules']);
});
