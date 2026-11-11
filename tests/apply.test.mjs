// Commands (work package 1.6): apply() runs a transaction on a copy and returns the new model; references() lists what
// names an element; history() undoes and redoes to byte-identical models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { apply, references, history, validate } from '../lib/umlimator.js';
import { typedProblems } from '../src/core/model.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const errors = m => [...validate(m), ...typedProblems(m)].filter(p => p.level === 'error');
const base = () => ({ schemaVersion: 2,
  nodes: [
    { id: 'sales', type: 'uml.Package', label: 'sales' },
    { id: 'order', type: 'uml.Class', label: 'Order', parent: 'sales', members: [{ id: 'order.total', type: 'uml.Property', label: 'total' }, { id: 'order.lines', type: 'uml.Property', label: 'lines' }] },
    { id: 'line', type: 'uml.Class', label: 'Line', parent: 'sales' },
    { id: 'customer', type: 'uml.Class', label: 'Customer' },
  ],
  edges: [
    { id: 'has', type: 'uml.Association', from: 'order.lines', to: 'line', props: { ends: { to: { multiplicity: '*' } } } },
    { id: 'buys', type: 'uml.Association', from: 'customer', to: 'order' },
  ],
  views: [
    { id: 'd', diagram: 'uml.class', nodeIds: ['sales', 'order', 'line', 'customer'], edges: ['has', 'buys'],
      layout: { order: [0, 0], line: [1, 0] }, present: { order: { rows: 4 } } },
    { id: 'map', nodeIds: ['customer', 'order'], nodeOverrides: { order: { sublabel: 'the order' } } },
  ],
  stories: [{ id: 's', steps: [{ view: 'd', select: 'order', highlight: ['order', 'line'], tour: ['customer', 'order'], camera: { card: 'order' } }] }],
  lenses: [{ id: 'l', pick: { id: 'order' } }, { id: 'l2', pick: { id: ['order', 'line'] } }],
  rules: [{ id: 'r', from: { id: 'customer' }, to: { id: 'order' } }],
});

test('apply() runs a command on a copy: the model given is never changed', () => {
  const m = base(), before = JSON.stringify(m);
  const out = apply(m, { op: 'set', id: 'order', path: 'label', value: 'Purchase order' });
  assert.equal(out.nodes[1].label, 'Purchase order');
  assert.equal(JSON.stringify(m), before);
});

test('set: a field of an element, a property, a view\'s present by a path of keys; undefined removes it', () => {
  let m = apply(base(), [
    { op: 'set', id: 'order.total', path: 'props.visibility', value: '+' },
    { op: 'set', view: 'd', path: ['present', 'order.total', 'collapsed'], value: ['operations'] },
    { op: 'set', id: 'has', path: 'props.ends.to.multiplicity', value: '1..*' },
  ]);
  assert.deepEqual(m.nodes[1].members[0].props, { visibility: '+' });
  assert.deepEqual(m.views[0].present['order.total'], { collapsed: ['operations'] });
  assert.equal(m.edges[0].props.ends.to.multiplicity, '1..*');
  m = apply(m, [{ op: 'set', id: 'order.total', path: 'props.visibility', value: undefined }, { op: 'set', id: 'line', path: 'props.nothing.here', value: undefined }]);
  assert.deepEqual(m.nodes[1].members[0].props, {});
  assert.equal(m.nodes[2].props, undefined);
  for (const bad of [{ op: 'set', id: 'order', path: 'id', value: 'x' }, { op: 'set', id: 'order', path: '__proto__.x', value: 1 },
    { op: 'set', id: 'ghost', path: 'label', value: 'x' }, { op: 'set', view: 'nope', path: 'title', value: 'x' }, { op: 'jump' }])
    assert.throws(() => apply(base(), bad), Error, JSON.stringify(bad));
});

test('a transaction is all or nothing: a command that fails leaves the model as it was', () => {
  const m = base(), before = JSON.stringify(m);
  assert.throws(() => apply(m, [{ op: 'set', id: 'order', path: 'label', value: 'X' }, { op: 'delete', id: 'ghost' }]), /"ghost" is not an element/);
  assert.equal(JSON.stringify(m), before);
});

test('add: a node shown in a view, a line listed in it, a member at a place; ids are new and never positional', () => {
  const m = apply(base(), [
    { op: 'add', element: { id: 'product', type: 'uml.Class', label: 'Product' }, view: 'd' },
    { op: 'add', element: { id: 'of', type: 'uml.Association', from: 'line', to: 'product' }, view: 'd' },
    { op: 'add', element: { id: 'order.id', type: 'uml.Property', label: 'id' }, to: 'order', index: 0 },
  ]);
  assert.equal(m.nodes.at(-1).id, 'product');
  assert.deepEqual(m.views[0].nodeIds.at(-1), 'product');
  assert.deepEqual(m.views[0].edges.at(-1), 'of');
  assert.deepEqual(m.nodes[1].members.map(x => x.id), ['order.id', 'order.total', 'order.lines']);
  assert.deepEqual(errors(m), []);
  assert.throws(() => apply(base(), { op: 'add', element: { id: 'order' } }), /used already/);
  assert.throws(() => apply(base(), { op: 'add', element: { id: 'n', members: [{ id: 'order.total' }] } }), /used already/);
  assert.throws(() => apply(base(), { op: 'add', element: { id: 'a->b' } }), /contains "->"/);
  assert.throws(() => apply(base(), { op: 'add', element: { id: 'x' }, to: 'ghost' }), /not an element/);
});

test('hide takes an element out of one view, with its pin, its present and the view\'s lines to it and its members; the model keeps it (E5)', () => {
  const m = apply(base(), { op: 'hide', id: 'order', view: 'd' });
  assert.deepEqual(m.views[0].nodeIds, ['sales', 'line', 'customer']);
  assert.deepEqual(m.views[0].edges, []); // has (from a member of order) and buys (to order)
  assert.deepEqual(m.views[0].layout, { line: [1, 0] });
  assert.deepEqual(m.views[0].present, {});
  assert.equal(m.nodes[1].id, 'order');
  assert.equal(m.edges.length, 2);
  assert.deepEqual(apply(base(), { op: 'hide', id: 'has', view: 'd' }).views[0].edges, ['buys']);
  assert.throws(() => apply(base(), { op: 'hide', id: 'buys', view: 'map' }), /shows every line between its cards/);
});

test('delete takes out the element, its members, what it owns, the lines to them, and everything that names them (M4)', () => {
  const m0 = base();
  assert.deepEqual(references(m0, 'order').map(r => `${r.kind} ${r.path}`).sort(), [
    'end edges[1].to', 'lens lenses[0].pick.id', 'lens lenses[1].pick.id[0]', 'override views[1].nodeOverrides.order',
    'pin views[0].layout.order', 'present views[0].present.order', 'rule rules[0].to.id',
    'story stories[0].steps[0].camera.card', 'story stories[0].steps[0].highlight[0]', 'story stories[0].steps[0].select', 'story stories[0].steps[0].tour[1]',
    'view views[0].nodeIds[1]', 'view views[1].nodeIds[1]']);
  const m = apply(m0, { op: 'delete', id: 'order' });
  assert.deepEqual(m.nodes.map(n => n.id), ['sales', 'line', 'customer']);
  assert.deepEqual(m.edges, []); // has (from order's member) and buys (to order)
  assert.deepEqual(m.views[0], { id: 'd', diagram: 'uml.class', nodeIds: ['sales', 'line', 'customer'], edges: [], layout: { line: [1, 0] }, present: {} });
  assert.deepEqual(m.views[1], { id: 'map', nodeIds: ['customer'], nodeOverrides: {} });
  assert.deepEqual(m.stories[0].steps[0], { view: 'd', highlight: ['line'], tour: ['customer'] });
  assert.deepEqual(m.lenses.map(l => l.pick), [{ id: [] }, { id: ['line'] }]); // a lens that picked only order now picks nothing
  assert.deepEqual(m.rules[0].to, { id: [] });
  assert.deepEqual(errors(m), []);
  // a package takes what it owns with it; a message whose operand goes stays, outside it
  assert.deepEqual(apply(base(), { op: 'delete', id: 'sales' }).nodes.map(n => n.id), ['customer']);
  const seq = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Lifeline' }, { id: 'b', type: 'uml.Lifeline' }],
    views: [{ id: 's', diagram: 'uml.sequence', nodeIds: ['a', 'b'], edges: [{ id: 'm1', type: 'uml.Message', from: 'a', to: 'b', parent: 'op' }],
      fragments: [{ id: 'f', type: 'uml.CombinedFragment', members: [{ id: 'op', type: 'uml.InteractionOperand' }] }] }] };
  const s = apply(seq, { op: 'delete', id: 'f' });
  assert.deepEqual(s.views[0].fragments, []);
  assert.deepEqual(s.views[0].edges, [{ id: 'm1', type: 'uml.Message', from: 'a', to: 'b' }]);
  // a line with no id goes with its card
  assert.deepEqual(apply({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }, { op: 'delete', id: 'a' }).edges, [{ from: 'b', to: 'b' }]);
});

test('delete leaves a model that validates, for every element of every example and target example', () => {
  const files = [...readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => '../examples/' + f),
    ...readdirSync(new URL('../docs/diagrams/examples/', import.meta.url)).filter(f => /^\d\d-.*\.json$/.test(f)).map(f => '../docs/diagrams/examples/' + f)];
  let n = 0;
  for (const f of files) {
    const m = read(f), was = new Set(errors(m).map(p => p.path + p.message));
    const ids = [...m.nodes.flatMap(function all(x) { return [x.id, ...(x.members || []).flatMap(all)]; }), ...(m.edges || []).map(e => e.id)].filter(Boolean);
    for (const id of ids) { const left = errors(apply(m, { op: 'delete', id })).filter(p => !was.has(p.path + p.message)); n++;
      assert.deepEqual(left, [], `${f}: delete ${id}`); }
  }
  assert.ok(n > 300, String(n));
});

test('reparent moves an element to a new owner, or out with null; never into itself or onto a line', () => {
  let m = apply(base(), { op: 'reparent', id: 'customer', parent: 'sales' });
  assert.equal(m.nodes[3].parent, 'sales');
  m = apply(m, { op: 'reparent', id: 'order', parent: null });
  assert.equal(m.nodes[1].parent, undefined);
  assert.throws(() => apply(base(), { op: 'reparent', id: 'sales', parent: 'order' }), /inside itself/);
  assert.throws(() => apply(base(), { op: 'reparent', id: 'order', parent: 'order.total' }), /inside itself/);
  assert.throws(() => apply(base(), { op: 'reparent', id: 'line', parent: 'has' }), /a line, not an owner/);
});

test('a 30-step script undoes and redoes, through history(), to byte-identical models', () => {
  const steps = [];
  for (let i = 0; i < 6; i++) steps.push(
    { op: 'add', element: { id: `c${i}`, type: 'uml.Class', label: `C${i}` }, view: 'd' },
    { op: 'add', element: { id: `c${i}.a`, type: 'uml.Property', label: 'a' }, to: `c${i}` },
    { op: 'add', element: { id: `e${i}`, type: 'uml.Association', from: `c${i}.a`, to: i ? `c${i - 1}` : 'order' }, view: 'd' },
    { op: 'set', id: `c${i}`, path: 'props.isAbstract', value: i % 2 === 0 },
    i % 2 ? { op: 'delete', id: `c${i - 1}` } : { op: 'reparent', id: `c${i}`, parent: 'sales' });
  assert.equal(steps.length, 30);
  const h = history(base()), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(apply(h.model, s)); seen.push(JSON.stringify(h.model)); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  assert.deepEqual(errors(h.model), []);
  // the same script on the same model gives the same bytes: apply() is deterministic
  assert.equal(JSON.stringify(steps.reduce(apply, base())), seen[30]);
});
