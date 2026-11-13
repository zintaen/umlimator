// Stage 6's core slots (notes/stage-6.md 6.1, §2.3): TYPED.across in validate(), TYPED.fields in the properties panel
// (its browser cases are in tests/typed-edit.html), and the timeline in refs() and delete (§7.3). The slots are filled
// here by test-only code; src/uml/stereotypes.js fills them in 6.2. The timing example is read through targets() and its
// ids found by label, so 6.6's move and renames break nothing here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TYPED } from '../src/core/registry.js';
import { validate } from '../src/map/validate.js';
import { apply, references, validate as coreValidate } from '../lib/umlimator.js';
import { targets } from '../docs/diagrams/examples/check.mjs';

const read = url => JSON.parse(readFileSync(url));
const files = () => { const ex = new URL('../examples/', import.meta.url), seen = new Map();
  readdirSync(ex).filter(f => f.endsWith('.json')).forEach(f => seen.set(new URL(f, ex).href, 'examples/' + f));
  targets().forEach(([f, url]) => { if (!seen.has(url.href)) seen.set(url.href, f); });
  return [...seen].map(([href, name]) => [name, read(new URL(href))]); };
const fill = (k, f) => { TYPED[k] = f; return () => { delete TYPED[k]; }; };

// ---- TYPED.across: run once on a version-2 model, after the typed checks, its problems said once
const TYPED_MODEL = () => ({ schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class', label: 'A' }], edges: [], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a'] }] });

test('TYPED.across runs once on every version-2 model, whatever its views, and its problems come after the typed checks, each said once', () => {
  const calls = [], P = { level: 'warning', rule: 'test-rule', path: 'nodes[0]', ids: ['a'], message: 'a test problem' };
  const done = fill('across', m => { calls.push(m); return [P, { ...P }, { ...P, level: 'error', message: 'another' }]; });
  try {
    const m = TYPED_MODEL(), out = validate(m);
    assert.equal(calls.length, 1); assert.equal(calls[0].nodes[0].id, 'a', 'it is handed the model');
    assert.deepEqual(out.filter(p => p.rule === 'test-rule').map(p => p.message), ['a test problem', 'another'], 'two alike are said once');
    assert.equal(out[out.length - 1].message, 'another', 'after the typed checks');
    // a model with map views only, and one with no typed view of any registered type: still once
    calls.length = 0; validate({ schemaVersion: 2, nodes: [{ id: 'a', label: 'A' }], views: [{ id: 'm', nodeIds: ['a'] }] });
    validate({ schemaVersion: 2, nodes: [], views: [{ id: 'p', diagram: 'uml.profile', nodeIds: [] }] });
    assert.equal(calls.length, 2);
    calls.length = 0; validate({ nodes: [{ id: 'a', label: 'A' }], views: [{ id: 'm', nodeIds: ['a'] }] });
    assert.equal(calls.length, 0, 'a version-1 map: not run');
  } finally { done(); }
});

test("TYPED.across's problem said once with a type's alike", async () => {
  await import('../src/uml/class.js'); // registers uml.class
  const m = { ...TYPED_MODEL(), nodes: [{ id: 'a', type: 'uml.Class', label: 'A', members: [{ id: 'a.x', type: 'uml.Property', label: 'x', props: { multiplicity: 'many' } }] }] };
  const theirs = validate(m).filter(p => !String(p.path).startsWith('views'));
  assert.ok(theirs.length, 'the class type has a problem to repeat');
  let ran = 0; const before = validate(m), done = fill('across', () => { ran++; return [...theirs.map(p => ({ ...p })), { level: 'warning', path: 'nodes[0]', message: 'its own' }]; });
  try { assert.deepEqual(validate(m), [...before, { level: 'warning', path: 'nodes[0]', message: 'its own' }], 'nothing new but its own: the rest are a type\'s, said once'); assert.equal(ran, 1); }
  finally { done(); }
});

test('with TYPED.across empty or returning nothing, validate() of every example and target example is as before', () => {
  for (const [f, m] of files()) {
    const before = JSON.stringify(validate(m)), done = fill('across', () => []);
    try { assert.equal(JSON.stringify(validate(m)), before, f); } finally { done(); }
  }
});

test('a TYPED.across that returns no list says nothing, and validate() still answers', () => {
  const m = TYPED_MODEL(), before = JSON.stringify(validate(m));
  for (const r of [undefined, null, {}]) { const done = fill('across', () => r); try { assert.equal(JSON.stringify(validate(m)), before, String(r)); } finally { done(); } }
});

// ---- the timeline in refs() and delete (§7.3, S15)
const timing = () => { const [, url] = targets().find(([f]) => /^14-/.test(f)), m = read(url), v = m.views.find(x => x.diagram === 'uml.timing'), t = v.timeline;
  const lifeline = label => m.nodes.find(n => n.type === 'uml.Lifeline' && n.label === label).id;
  const change = (l, state, at) => t.changes.find(c => c.lifeline === l && c.state === state && (at == null || c.at === at)).id;
  const W = lifeline('worker'), ids = { W, P: lifeline('payments'), waiting: change(W, 'Waiting for payment'), recording: change(W, 'Recording payment'), done: change(W, 'Idle', Math.max(...t.changes.filter(c => c.lifeline === W).map(c => c.at))) };
  ids.wait = t.constraints.find(c => c.from === ids.waiting).id; ids.finished = t.constraints.find(c => c.from === ids.done).id;
  return { m, vi: m.views.indexOf(v), ids, mine: l => t.changes.filter(c => c.lifeline === l).map(c => c.id) }; };
const tl = (m, vi) => m.views[vi].timeline, idsOf = xs => xs.map(x => x.id);

test("deleting the worker lifeline takes its four changes and both of its constraints; the payments lane's stay", () => {
  const { m, vi, ids, mine } = timing(), after = apply(m, { op: 'delete', id: ids.W });
  assert.equal(mine(ids.W).length, 4);
  assert.deepEqual(idsOf(tl(after, vi).changes), mine(ids.P));
  assert.deepEqual(tl(after, vi).constraints, []);
  assert.ok(!idsOf(after.nodes).includes(ids.W));
  assert.equal(tl(m, vi).constraints.length, 2, 'the model given is not changed');
});

test('deleting a change takes the constraints on it, and no other', () => {
  const { m, vi, ids } = timing(), after = apply(m, { op: 'delete', id: ids.waiting });
  assert.ok(!idsOf(tl(after, vi).changes).includes(ids.waiting));
  assert.equal(tl(after, vi).changes.length, tl(m, vi).changes.length - 1);
  assert.deepEqual(idsOf(tl(after, vi).constraints), [ids.finished]);
  const both = apply(m, [{ op: 'delete', id: ids.waiting }, { op: 'delete', id: ids.wait }, { op: 'delete', id: ids.recording }]);
  assert.deepEqual(idsOf(tl(both, vi).constraints), [ids.finished], 'one gone already in the same transaction is passed over');
});

test('references() lists the changes on a lifeline and the constraints on a change, as kind end', () => {
  const { m, vi, ids, mine } = timing(), at = (k, id) => ['views', vi, 'timeline', k, tl(m, vi)[k].findIndex(c => c.id === id)];
  const ends = id => references(m, id).filter(r => r.kind === 'end' && r.path[2] === 'timeline').map(r => r.path);
  assert.deepEqual(ends(ids.W), mine(ids.W).map(c => [...at('changes', c), 'lifeline']));
  assert.deepEqual(ends(ids.waiting), [[...at('constraints', ids.wait), 'from']]);
  assert.deepEqual(ends(ids.recording), [[...at('constraints', ids.wait), 'to']]);
  assert.deepEqual(ends(ids.done), [[...at('constraints', ids.finished), 'from']]);
  assert.ok(references(m, ids.W).some(r => r.kind === 'view') && references(m, ids.W).some(r => r.kind === 'end' && r.path[2] === 'edges'), 'and the view that shows it and its messages, as before');
});

test("hiding the worker lifeline keeps its changes and constraints in the view's timeline; its messages leave the view with it", () => {
  const { m, vi, ids } = timing(), v = m.views[vi], after = apply(m, { op: 'hide', id: ids.W, view: v.id });
  assert.ok(!after.views[vi].nodeIds.includes(ids.W));
  assert.deepEqual(tl(after, vi), tl(m, vi));
  assert.deepEqual(after.views[vi].edges.filter(e => e.from === ids.W || e.to === ids.W), []); // decision 23
  assert.ok(idsOf(after.nodes).includes(ids.W));
});

test('a timeline that is not one, or holds what is not an item, is passed over', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'l', type: 'uml.Lifeline', label: 'l' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.timing', nodeIds: ['l'], timeline: { changes: [null, 3, { id: 'c', lifeline: 'l', at: 0, state: 'S' }], constraints: 'none' } },
      { id: 'w', diagram: 'uml.timing', nodeIds: [], timeline: 'none' }] };
  assert.deepEqual(apply(m, { op: 'delete', id: 'l' }).views[0].timeline.changes, [null, 3]);
  assert.equal(references(m, 'l').filter(r => r.kind === 'end').length, 1);
});

// what names nothing after a delete: a change's lifeline, a constraint's ends (no type checks them before 6.5). The core's
// validate(), as tests/apply.test.mjs: a type's own rules may refuse what a delete leaves (an extend with no extension point)
const dangling = m => { const ids = new Set(); JSON.stringify(m, (k, v) => { if (v && typeof v === 'object' && typeof v.id === 'string') ids.add(v.id); return v; });
  return m.views.flatMap(v => [...(v.timeline?.changes || []).filter(c => !ids.has(c.lifeline)), ...(v.timeline?.constraints || []).filter(c => [c.from, c.to].some(x => x != null && !ids.has(x)))].map(c => `${v.id}: ${c.id}`)); };

test('deleting any element of any example or target example, a timeline\'s items included, leaves a model that validates and no timeline item naming nothing', () => {
  const errs = m => coreValidate(m).filter(p => p.level === 'error').map(p => p.message);
  let deleted = 0;
  for (const [f, m] of files()) {
    const was = new Set(errs(m));
    const ids = [...m.nodes.flatMap(function all(x) { return [x.id, ...(x.members || []).flatMap(all)]; }), ...(m.edges || []).map(e => e.id),
      ...m.views.flatMap(v => [...(v.nodes || []).map(n => n.id), ...(v.edges || []).filter(e => e && typeof e === 'object').map(e => e.id),
        ...(v.fragments || []).flatMap(function all(x) { return [x.id, ...(x.members || []).flatMap(all)]; }), ...['changes', 'constraints'].flatMap(k => (v.timeline?.[k] || []).map(c => c.id))])].filter(Boolean);
    for (const id of ids) { deleted++; const after = apply(m, { op: 'delete', id });
      assert.deepEqual(errs(after).filter(e => !was.has(e)), [], `${f}: delete ${id}`);
      assert.deepEqual(dangling(after), [], `${f}: delete ${id}`); }
  }
  assert.ok(deleted > 400, `${deleted} deleted`);
});
