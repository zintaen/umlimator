// Commands (work package 1.6): apply() runs a transaction on a copy and returns the new model; references() lists what
// names an element; history() undoes and redoes to byte-identical models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { apply, references, history, validate } from '../lib/umlimator.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const errors = m => validate(m).filter(p => p.level === 'error');
const frozen = x => { if (x && typeof x === 'object') { Object.values(x).forEach(frozen); Object.freeze(x); } return x; };
const run = (m, c) => apply(frozen(structuredClone(m)), c); // every command here runs on a deep-frozen model
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
      layout: { order: [0, 0], line: [1, 0] }, present: { order: { rows: 4 }, 'order.total': { rows: 1 } } },
    { id: 'map', nodeIds: ['customer', 'order'], nodeOverrides: { order: { sublabel: 'the order' } }, tour: ['customer', 'order'],
      containers: [{ id: 'box', label: 'box', nodeIds: ['order'] }] },
  ],
  stories: [{ id: 's', steps: [{ view: 'd', select: 'order', highlight: ['order', 'line'], tour: ['customer', 'order'], camera: { card: 'order' } },
    { view: 'map', select: 'order' }] }],
  lenses: [{ id: 'l', pick: { id: 'order' } }, { id: 'l2', pick: { id: ['order', 'line'] } }],
  rules: [{ id: 'r', from: { id: 'customer' }, to: { id: 'order' } }],
});

test('apply() runs a command on a copy: the model given is never changed', () => {
  const out = run(base(), { op: 'set', id: 'order', path: 'label', value: 'Purchase order' });
  assert.equal(out.nodes[1].label, 'Purchase order');
  assert.deepEqual(errors(base()), []);
});

test('set: a field of an element or a view by a path; a list of keys for a key with a dot; undefined removes it; objects only', () => {
  let m = run(base(), [
    { op: 'set', id: 'order.total', path: 'props.visibility', value: '+' },
    { op: 'set', view: 'd', path: ['present', 'order.total', 'collapsed'], value: ['operations'] },
    { op: 'set', id: 'has', path: 'props.ends.to.multiplicity', value: '1..*' },
  ]);
  assert.deepEqual(m.nodes[1].members[0].props, { visibility: '+' });
  assert.deepEqual(m.views[0].present['order.total'], { rows: 1, collapsed: ['operations'] });
  assert.equal(m.edges[0].props.ends.to.multiplicity, '1..*');
  m = run(m, [{ op: 'set', id: 'order.total', path: 'props.visibility', value: undefined }, { op: 'set', id: 'line', path: 'props.nothing.here', value: undefined }]);
  assert.deepEqual(m.nodes[1].members[0].props, {});
  assert.equal(m.nodes[2].props, undefined);
  for (const bad of [
    { op: 'set', id: 'order', path: 'id', value: 'x' }, { op: 'set', id: 'order', path: 'parent', value: 'order' },
    { op: 'set', id: 'has', path: 'from', value: 'line' }, { op: 'set', id: 'order', path: 'members', value: [] },
    { op: 'set', view: 'd', path: 'id', value: 'x' }, { op: 'set', id: 'order', path: '__proto__.x', value: 1 },
    { op: 'set', id: 'order', path: '', value: 1 }, { op: 'set', id: 'order', path: { a: 1 }, value: 1 },
    { op: 'set', id: 'order', path: 'label.x', value: 1 }, { op: 'set', view: 'd', path: 'nodeIds.0', value: 'x' },
    { op: 'set', id: 'order', view: 'd', path: 'title', value: 'x' },
    { op: 'set', id: 'ghost', path: 'label', value: 'x' }, { op: 'set', view: 'nope', path: 'title', value: 'x' }, { op: 'jump' }, null])
    assert.throws(() => run(base(), bad), Error, JSON.stringify(bad));
});

test('a transaction is all or nothing: a command that fails leaves the model as it was', () => {
  const m = base(), before = JSON.stringify(m);
  assert.throws(() => apply(m, [{ op: 'set', id: 'order', path: 'label', value: 'X' }, { op: 'delete', id: 'ghost' }]), /"ghost" is not an element/);
  assert.equal(JSON.stringify(m), before);
});

test('add: a node shown in a view at a place, a line listed in it, a member at a place; ids are new and never positional', () => {
  const m = run(base(), [
    { op: 'add', element: { id: 'product', type: 'uml.Class', label: 'Product' }, view: 'd', index: 0 },
    { op: 'add', element: { id: 'of', type: 'uml.Association', from: 'line', to: 'product' }, view: 'd' },
    { op: 'add', element: { id: 'order.id', type: 'uml.Property', label: 'id' }, owner: 'order', index: 0 },
  ]);
  assert.equal(m.nodes.at(-1).id, 'product');
  assert.deepEqual(m.views[0].nodeIds, ['product', 'sales', 'order', 'line', 'customer']);
  assert.deepEqual(m.views[0].edges.at(-1), 'of');
  assert.deepEqual(m.nodes[1].members.map(x => x.id), ['order.id', 'order.total', 'order.lines']);
  assert.deepEqual(errors(m), []);
  for (const [bad, said] of [
    [{ element: { id: 'order' } }, /used already/], [{ element: { id: 'n', members: [{ id: 'order.total' }] } }, /used already/],
    [{ element: { id: 'n', members: [{ id: 'q' }, { id: 'q' }] } }, /used already/], [{ element: { id: 'n', members: [null] } }, /needs an id/],
    [{ element: { id: 'n', members: [{ id: 'x->y' }] } }, /contains "->"/], [{ element: { id: 'a->b' } }, /contains "->"/],
    [{ element: { id: 'x' }, owner: 'ghost' }, /not an element/], [{ element: { id: 'x' }, owner: 'has' }, /holds no members/],
    [{ element: { id: 'x' }, to: 'order' }, /is `owner`/], [{ element: { id: 'x' }, owner: 'order', index: 1.5 }, /whole number/]])
    assert.throws(() => run(base(), { op: 'add', ...bad }), said, JSON.stringify(bad));
});

test('move: a member to another place or owner, keeping its id and lines; an element to another place in a view\'s order', () => {
  let m = run(base(), { op: 'move', id: 'order.lines', index: 0 });
  assert.deepEqual(m.nodes[1].members.map(x => x.id), ['order.lines', 'order.total']);
  m = run(base(), { op: 'move', id: 'order.lines', owner: 'line' });
  assert.deepEqual([m.nodes[1].members.map(x => x.id), m.nodes[2].members.map(x => x.id)], [['order.total'], ['order.lines']]);
  assert.equal(m.edges[0].from, 'order.lines');
  m = run(base(), [{ op: 'move', id: 'customer', view: 'd', index: 0 }, { op: 'move', id: 'buys', view: 'd', index: 0 }]);
  assert.deepEqual([m.views[0].nodeIds, m.views[0].edges], [['customer', 'sales', 'order', 'line'], ['buys', 'has']]);
  assert.throws(() => run(base(), { op: 'move', id: 'order', index: 0 }), /not a member/);
  assert.throws(() => run(base(), { op: 'move', id: 'line', view: 'map', index: 0 }), /not in view/);
  const deep = { ...base(), nodes: [{ id: 'a', type: 'x.A', members: [{ id: 'a.b', type: 'x.B', members: [{ id: 'a.b.c', type: 'x.C' }] }] }] };
  assert.throws(() => run(deep, { op: 'move', id: 'a.b', owner: 'a.b.c' }), /inside itself/);
});

test('hide takes an element out of one view with all that view says of it; the model and the other views keep it (E5)', () => {
  const m = run(base(), { op: 'hide', id: 'order', view: 'd' });
  assert.deepEqual(m.views[0], { id: 'd', diagram: 'uml.class', nodeIds: ['sales', 'line', 'customer'], edges: [], layout: { line: [1, 0] }, present: {} });
  assert.deepEqual(m.stories[0].steps[0], { view: 'd', highlight: ['line'], tour: ['customer'] });
  assert.deepEqual(m.stories[0].steps[1], { view: 'map', select: 'order' }); // a step on another view keeps it
  assert.deepEqual([m.nodes[1].id, m.edges.length, m.views[1]], [base().nodes[1].id, 2, base().views[1]]);
  const h = run(base(), { op: 'hide', id: 'order', view: 'map' });
  assert.deepEqual(h.views[1], { id: 'map', nodeIds: ['customer'], nodeOverrides: {}, tour: ['customer'], containers: [{ id: 'box', label: 'box', nodeIds: [] }] });
  assert.deepEqual(errors(h), []);
  assert.deepEqual(run(base(), { op: 'hide', id: 'has', view: 'd' }).views[0].edges, ['buys']);
  assert.throws(() => run(base(), { op: 'hide', id: 'buys', view: 'map' }), /shows every line between its cards/);
  assert.throws(() => run(base(), { op: 'hide', id: 'order.total', view: 'd' }), /a member, shown with its owner/);
  const seq = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Lifeline' }, { id: 'b', type: 'uml.Lifeline' }],
    views: [{ id: 's', diagram: 'uml.sequence', nodeIds: ['a', 'b'], edges: [{ id: 'm1', type: 'uml.Message', from: 'a', to: 'b' }] }] };
  assert.throws(() => run(seq, { op: 'hide', id: 'm1', view: 's' }), /lives only in view "s": delete it/);
  assert.deepEqual(run(seq, { op: 'hide', id: 'b', view: 's' }).views[0].edges, []); // a message to a hidden lifeline goes with it
  // from the re-review of #161: a story step naming a message that left with its lifeline; a move whose cycle runs through
  // a parent; a node with a field named to is not a line; move takes a view or an owner
  const told = { ...seq, stories: [{ id: 's', steps: [{ view: 's', select: 'm1', highlight: ['m1'] }] }] };
  const t2 = run(told, { op: 'hide', id: 'a', view: 's' });
  assert.deepEqual([t2.stories[0].steps[0], errors(t2)], [{ view: 's', highlight: [] }, []]);
  const st = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.State', members: [{ id: 'R', type: 'uml.Region' }] }, { id: 'T', type: 'uml.State', parent: 'R' }], views: [{ id: 'v', nodeIds: ['S', 'T'] }] };
  assert.throws(() => run(st, { op: 'move', id: 'R', owner: 'T' }), /inside itself/);
  const n = { nodes: [{ id: 'a' }, { id: 'n', to: 'a' }], views: [{ id: 'v', nodeIds: ['a', 'n'] }] };
  assert.deepEqual(run(n, { op: 'delete', id: 'a' }).nodes, [{ id: 'n', to: 'a' }]);
  assert.throws(() => run(base(), { op: 'move', id: 'order.lines', owner: 'line', view: 'd', index: 0 }), /not both/);
});

test('delete takes out the element, its members, what it owns, the lines to them, and everything that names them (M4)', () => {
  const m0 = base();
  assert.deepEqual(references(m0, 'order').map(r => `${r.kind} ${r.path.join('/')}`).sort(), [
    'end edges/1/to', 'lens lenses/0/pick/id', 'lens lenses/1/pick/id/0', 'override views/1/nodeOverrides/order',
    'pin views/0/layout/order', 'present views/0/present/order', 'rule rules/0/to/id',
    'story stories/0/steps/0/camera', 'story stories/0/steps/0/highlight/0', 'story stories/0/steps/0/select', 'story stories/0/steps/0/tour/1',
    'story stories/0/steps/1/select', 'view views/0/nodeIds/1', 'view views/1/containers/0/nodeIds/0', 'view views/1/nodeIds/1', 'view views/1/tour/1']);
  const m = run(m0, { op: 'delete', id: 'order' });
  assert.deepEqual(m.nodes.map(n => n.id), ['sales', 'line', 'customer']);
  assert.deepEqual(m.edges, []); // has (from order's member) and buys (to order)
  assert.deepEqual(m.views[0], { id: 'd', diagram: 'uml.class', nodeIds: ['sales', 'line', 'customer'], edges: [], layout: { line: [1, 0] }, present: {} });
  assert.deepEqual(m.stories[0].steps, [{ view: 'd', highlight: ['line'], tour: ['customer'] }, { view: 'map' }]);
  assert.deepEqual(m.lenses.map(l => l.pick), [{ id: [] }, { id: ['line'] }]); // a lens that picked only order now picks nothing
  assert.deepEqual(m.rules[0].to, { id: [] });
  assert.deepEqual(errors(m), []);
  // a member with a dot in its id, and one with brackets: paths are lists of keys, never parsed back from text
  const d = run(base(), { op: 'delete', id: 'order.total' });
  assert.deepEqual([d.nodes[1].members.map(x => x.id), d.views[0].present], [['order.lines'], { order: { rows: 4 } }]);
  const odd = { nodes: [{ id: 'a[1]' }, { id: 'b.c' }], edges: [{ from: 'a[1]', to: 'b.c' }], views: [{ id: 'v', nodeIds: ['a[1]', 'b.c'], layout: { 'a[1]': [0, 0], 'b.c': [1, 0] } }] };
  assert.deepEqual(run(odd, { op: 'delete', id: 'b.c' }), { nodes: [{ id: 'a[1]' }], edges: [], views: [{ id: 'v', nodeIds: ['a[1]'], layout: { 'a[1]': [0, 0] } }] });
  // a package takes what it owns; a message whose operand goes stays, outside it
  assert.deepEqual(run(base(), { op: 'delete', id: 'sales' }).nodes.map(n => n.id), ['customer']);
  const seq = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Lifeline' }, { id: 'b', type: 'uml.Lifeline' }],
    views: [{ id: 's', diagram: 'uml.sequence', nodeIds: ['a', 'b'], edges: [{ id: 'm1', type: 'uml.Message', from: 'a', to: 'b', parent: 'op' }],
      fragments: [{ id: 'f', type: 'uml.CombinedFragment', members: [{ id: 'op', type: 'uml.InteractionOperand' }] }] }] };
  const s = run(seq, { op: 'delete', id: 'f' });
  assert.deepEqual([s.views[0].fragments, s.views[0].edges], [[], [{ id: 'm1', type: 'uml.Message', from: 'a', to: 'b' }]]);
  // a line on a line goes with it, listed or not; a view opened from a deleted card is a view of its own after
  const onLine = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class' }, { id: 'b', type: 'uml.Class' }, { id: 'n', type: 'uml.Comment' }],
    edges: [{ id: 'ab', type: 'uml.Association', from: 'a', to: 'b' }, { id: 'link', type: 'uml.CommentLink', from: 'n', to: 'ab' }, { from: 'n', to: 'ab' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'n'], edges: ['ab', 'link'] }, { id: 'inside', parent: 'a', nodeIds: ['b'] }] };
  const o = run(onLine, { op: 'delete', id: 'a' });
  assert.deepEqual([o.edges, o.views[0].edges, o.views[1].parent], [[], [], undefined]);
  // a parent that is also a view's id names that view: deleting the card of that id keeps it (audit 10, bike-share's trips)
  const twin = { nodes: [{ id: 'trips' }, { id: 'b' }], views: [{ id: 'main', nodeIds: ['trips', 'b'] }, { id: 'trips', parent: 'main', nodeIds: ['b'] }, { id: 'end', parent: 'trips', nodeIds: ['b'] }] };
  assert.deepEqual(run(twin, { op: 'delete', id: 'trips' }).views.map(v => v.parent), [undefined, 'main', 'trips']);
  // a step's select and highlight as Refs: listed by references() and taken by delete; validate() checks them (audit 10)
  const reffed = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'ab', from: 'a', to: 'b' }], views: [{ id: 'main', nodeIds: ['a', 'b'] }],
    stories: [{ id: 's', steps: [{ view: 'main', select: { type: 'node', id: 'b', view: 'main' }, highlight: [{ type: 'edge', ids: ['ab'], view: 'main' }, 'a'] }] }] };
  assert.deepEqual(references(reffed, 'ab').map(r => r.path.join('/')), ['stories/0/steps/0/highlight/0']);
  assert.deepEqual(references(reffed, 'b').filter(r => r.kind === 'story').map(r => r.path.join('/')), ['stories/0/steps/0/select']);
  assert.deepEqual(run(reffed, { op: 'delete', id: 'b' }).stories[0].steps[0], { view: 'main', highlight: ['a'] });
  assert.deepEqual(validate({ ...reffed, views: [{ id: 'main', nodeIds: ['a'] }], edges: [] }).filter(p => p.level === 'error').map(p => p.path),
    ['stories[0].steps[0].select', 'stories[0].steps[0].highlight[0]']);
  // a line without an id goes with its card
  assert.deepEqual(run({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'b' }], views: [{ id: 'v', nodeIds: ['a', 'b'] }] }, { op: 'delete', id: 'a' }).edges, [{ from: 'b', to: 'b' }]);
  // a selection deletes in one transaction, though the first delete took a line the second names (E2)
  assert.deepEqual(run(base(), [{ op: 'delete', id: 'order' }, { op: 'delete', id: 'buys' }, { op: 'delete', id: 'line' }]).nodes.map(n => n.id), ['sales', 'customer']);
});

test('delete and hide leave a model that validates, for every element in every view of every example and target example', () => {
  const files = [...readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => '../examples/' + f),
    ...readdirSync(new URL('../docs/diagrams/examples/', import.meta.url)).filter(f => /^\d\d-.*\.json$/.test(f)).map(f => '../docs/diagrams/examples/' + f)];
  let deleted = 0, hidden = 0;
  for (const f of files) {
    const m = read(f);
    assert.deepEqual(errors(m), [], f);
    const ids = [...m.nodes.flatMap(function all(x) { return [x.id, ...(x.members || []).flatMap(all)]; }), ...(m.edges || []).map(e => e.id),
      ...m.views.flatMap(v => [...(v.nodes || []).map(n => n.id), ...(v.edges || []).filter(e => e && typeof e === 'object').map(e => e.id), ...(v.fragments || []).flatMap(function all(x) { return [x.id, ...(x.members || []).flatMap(all)]; })])].filter(Boolean);
    for (const id of ids) { deleted++; assert.deepEqual(errors(apply(m, { op: 'delete', id })), [], `${f}: delete ${id}`); }
    const shared = new Set(m.nodes.map(n => n.id)); // a card of one view only is deleted, not hidden
    for (const v of m.views) for (const id of (v.nodeIds || []).filter(i => shared.has(i))) { hidden++;
      if (id === v.subject) { assert.throws(() => apply(m, { op: 'hide', id, view: v.id }), /is the subject of view/); continue; } // audit 17: refused
      assert.deepEqual(errors(apply(m, { op: 'hide', id, view: v.id })), [], `${f}: hide ${id} in ${v.id}`); }
  }
  assert.ok(deleted > 400 && hidden > 300, `${deleted} deleted, ${hidden} hidden`);
});

test('reparent moves an element to a new owner, or out with null; never into itself, onto a line, or out of the members it is one of', () => {
  let m = run(base(), { op: 'reparent', id: 'customer', parent: 'sales' });
  assert.equal(m.nodes[3].parent, 'sales');
  m = run(m, { op: 'reparent', id: 'order', parent: null });
  assert.equal(m.nodes[1].parent, undefined);
  assert.throws(() => run(base(), { op: 'reparent', id: 'sales', parent: 'order' }), /inside itself/);
  assert.throws(() => run(base(), { op: 'reparent', id: 'order', parent: 'order.total' }), /inside itself/);
  assert.throws(() => run(base(), { op: 'reparent', id: 'line', parent: 'has' }), /not an owner/);
  assert.throws(() => run(base(), { op: 'reparent', id: 'order.total', parent: 'line' }), /move it to another owner with move/);
  assert.throws(() => run(base(), { op: 'reparent', id: 'order' }), /or null for none/);
});

test('a 30-step script of every command undoes and redoes, through history(), to byte-identical models', () => {
  const steps = [];
  for (let i = 0; i < 5; i++) steps.push(
    { op: 'add', element: { id: `c${i}`, type: 'uml.Class', label: `C${i}` }, view: 'd' },
    { op: 'add', element: { id: `c${i}.a`, type: 'uml.Property', label: 'a' }, owner: `c${i}` },
    { op: 'add', element: { id: `e${i}`, type: 'uml.Association', from: `c${i}.a`, to: i ? `c${i - 1}` : 'order' }, view: 'd' },
    { op: 'set', id: `c${i}`, path: 'props.isAbstract', value: i % 2 === 0 },
    i % 2 ? { op: 'delete', id: `c${i - 1}` } : { op: 'reparent', id: `c${i}`, parent: 'sales' },
    [{ op: 'move', id: `c${i}`, view: 'd', index: 0 }, { op: 'hide', id: 'line', view: 'd' }, { op: 'move', id: 'order.lines', index: 0 }][i % 3]);
  assert.equal(steps.length, 30);
  const h = history(base()), seen = [JSON.stringify(h.model)];
  for (const s of steps) { h.push(run(h.model, s)); seen.push(JSON.stringify(h.model)); }
  for (let i = 29; i >= 0; i--) assert.equal(JSON.stringify(h.undo()), seen[i], `undo to ${i}`);
  for (let i = 1; i <= 30; i++) assert.equal(JSON.stringify(h.redo()), seen[i], `redo to ${i}`);
  assert.deepEqual(errors(h.model), []);
  assert.equal(JSON.stringify(apply(base(), steps)), seen[30]); // one transaction of all 30 gives the same bytes
});

test('addView adds a view at the end or at an index, a copy of the one given; validate() says what it lacks (milestone 2 §6.2)', () => {
  const v = { id: 'level', diagram: 'uml.class', nodeIds: ['order'], parent: 'd', title: 'Order' };
  let m = run(base(), { op: 'addView', view: v });
  assert.deepEqual(m.views.map(x => x.id), ['d', 'map', 'level']);
  assert.deepEqual(m.views[2], v); assert.notEqual(m.views[2], v);
  m = run(base(), { op: 'addView', view: { id: 'first' }, index: 0 });
  assert.deepEqual(m.views.map(x => x.id), ['first', 'd', 'map']);
  assert.deepEqual(run({ schemaVersion: 2, nodes: [] }, { op: 'addView', view: { id: 'only' } }).views, [{ id: 'only' }]); // a model with no views gains its list
  assert.deepEqual(errors(run(base(), { op: 'addView', view: v })), []);
});

test('addView refuses a view whose id is taken, or that is not an object with a string id; the transaction with it goes', () => {
  assert.throws(() => run(base(), { op: 'addView', view: { id: 'map' } }), /addView: view "map" is there already/);
  for (const view of [undefined, null, 'level', [], { id: 3 }, {}]) assert.throws(() => run(base(), { op: 'addView', view }), /addView: a view is an object with a string id/);
  assert.throws(() => run(base(), [{ op: 'addView', view: { id: 'level' } }, { op: 'addView', view: { id: 'level' } }]), /"level" is there already/);
  assert.throws(() => run(base(), { op: 'addView', view: { id: 'x' }, index: 1.5 }), /not a whole number/);
  assert.throws(() => run(base(), { op: 'addViews' }), /\(set, add, move, hide, delete, reparent, addView\)/);
});

test('a level made in one transaction (addView, add, set opensView) undoes and redoes, through history(), to byte-identical models', () => {
  const h = history(base()), before = JSON.stringify(h.model);
  h.push(run(h.model, [{ op: 'addView', view: { id: 'order-level', diagram: 'uml.class', parent: 'd', title: 'Order' } },
    { op: 'add', element: { id: 'order-part', type: 'uml.Class', label: 'Part' }, view: 'order-level' },
    { op: 'set', id: 'order', path: 'opensView', value: 'order-level' }]));
  const after = JSON.stringify(h.model);
  assert.deepEqual(h.model.views[2].nodeIds, ['order-part']);
  assert.equal(JSON.stringify(h.undo()), before);
  assert.equal(JSON.stringify(h.redo()), after);
});

// A deep parent chain (milestone 4a §2.4, work package 4a.2): delete takes what an element owns with a stack, not
// recursion, and takes the gone out of each list in one pass, so 20,000 levels delete and a flat root does not go
// quadratic. A topic here is a plain package: the core is what is tested
const topics = (n, parentOf) => ({ schemaVersion: 2,
  nodes: Array.from({ length: n }, (_, i) => ({ id: 't' + i, type: 'uml.Package', ...(i ? { parent: 't' + parentOf(i) } : {}) })),
  views: [{ id: 'v', diagram: 'uml.package', nodeIds: Array.from({ length: n }, (_, i) => 't' + i) }] });
const chain = n => topics(n, i => i - 1), flat = n => topics(n, () => 0);

test('delete down a parent chain 20,000 deep takes all of it, and from the middle leaves what is above (4a.2)', () => {
  const m = run(chain(20000), { op: 'delete', id: 't0' });
  assert.deepEqual([m.nodes, m.views[0].nodeIds], [[], []]);
  const mid = run(chain(20000), { op: 'delete', id: 't10000' });
  assert.deepEqual([mid.nodes.length, mid.nodes.at(-1).id, mid.views[0].nodeIds.length], [10000, 't9999', 10000]);
  const f = run(flat(20000), { op: 'delete', id: 't0' });
  assert.deepEqual([f.nodes, f.views[0].nodeIds], [[], []]);
});

test('delete keeps the order of what stays in a list, and an element with a duplicate id that is not the one indexed (4a.2)', () => {
  const m = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Package' }, { id: 'b', type: 'uml.Class', parent: 'a' }, { id: 'c', type: 'uml.Class' },
    { id: 'd', type: 'uml.Class', parent: 'a', members: [{ id: 'd.x', type: 'uml.Property' }] }, { id: 'e', type: 'uml.Class' }, { id: 'b', type: 'uml.Class', label: 'twin' }],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b', 'c', 'd', 'e'], nodes: [{ id: 'own', type: 'uml.Class', parent: 'a' }, { id: 'keep', type: 'uml.Class' }] }] };
  const out = run(m, { op: 'delete', id: 'a' });
  assert.deepEqual(out.nodes, [{ id: 'c', type: 'uml.Class' }, { id: 'e', type: 'uml.Class' }, { id: 'b', type: 'uml.Class', label: 'twin' }]);
  assert.deepEqual([out.views[0].nodes, out.views[0].nodeIds], [[{ id: 'keep', type: 'uml.Class' }], ['c', 'e']]);
  const mem = run(m, { op: 'delete', id: 'd.x' });
  assert.deepEqual(mem.nodes[3], { id: 'd', type: 'uml.Class', parent: 'a', members: [] });
});

test('delete of a 20,000-topic chain\'s root and of a flat 20,000-topic root under CI\'s 1 s, printed against 100 ms; a flat 100,000 under 1 s (CPU, best of five, after a warm-up) (timed)', () => {
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const best = m => { apply(m, { op: 'delete', id: 't0' }); return Math.min(...Array.from({ length: 5 }, () => timed(() => apply(m, { op: 'delete', id: 't0' })))); };
  const c = best(chain(20000)), f = best(flat(20000)), big = best(flat(100000)); // one splice each was 0.1 s at 20,000, tens of seconds here
  for (const ms of [c, f, big]) assert.ok(ms < 1000, `${ms} ms`);
  console.log(`# P1 target 100 ms: delete of a 20,000 chain ${c} ms, of a flat 20,000 root ${f} ms (a flat 100,000: ${big} ms)`);
});

// §2.4: what stays under a gone chain finds its owner once, and lines to lines cascade in one pass, whatever their order
test('delete of a 20,000 chain under 5,000 view fragments, and of a card under 3,000 lines each to the next, listed last first, under CI\'s 1 s (CPU, best of five) (timed)', () => {
  const timed = f => { const c = process.cpuUsage(); f(); const u = process.cpuUsage(c); return (u.user + u.system) / 1000; };
  const best = (m, id) => Math.min(...Array.from({ length: 5 }, () => timed(() => apply(m, { op: 'delete', id }))));
  const deep = chain(20000); deep.views[0].fragments = Array.from({ length: 5000 }, (_, i) => ({ id: `f${i}`, type: 'uml.Comment', parent: 't19999' }));
  const lines = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class' }, { id: 'b', type: 'uml.Class' }],
    edges: Array.from({ length: 3000 }, (_, i) => ({ id: `e${2999 - i}`, type: 'uml.Dependency', from: i === 2999 ? 'a' : `e${2998 - i}`, to: 'b' })) };
  const d = apply(deep, { op: 'delete', id: 't0' }), l = apply(lines, { op: 'delete', id: 'a' });
  assert.deepEqual([d.nodes.length, d.views[0].fragments.length, d.views[0].fragments.some(f => 'parent' in f), l.edges], [0, 5000, false, []]);
  const f = best(deep, 't0'), e = best(lines, 'a');
  for (const ms of [f, e]) assert.ok(ms < 1000, `${ms} ms`);
  console.log(`# P1 ceiling 1 s: a 20,000 chain under 5,000 fragments ${f} ms; 3,000 lines to lines in reverse ${e} ms`);
});

test('audit 11: delete clears a story step that names a line with no id it took ("b->c#0"), and validate() warns of a name that has no line', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { from: 'b', to: 'c' }], views: [{ id: 'v', nodeIds: ['a', 'b', 'c'] }],
    stories: [{ id: 's', steps: [{ view: 'v', select: { type: 'edge', ids: ['b->c#0'] }, highlight: ['b->c#0', 'ab'] }] }] };
  assert.deepEqual(validate(m), []);
  const m2 = apply(m, { op: 'delete', id: 'c' });
  assert.deepEqual(m2.stories[0].steps[0], { view: 'v', highlight: ['ab'] });
  const stale = structuredClone(m); stale.edges.pop();
  assert.deepEqual(validate(stale).map(p => [p.level, p.path]), [['warning', 'stories[0].steps[0].select'], ['warning', 'stories[0].steps[0].highlight[0]']]);
});

test('audit 12: delete renames a story step\'s name of a line with no id whose place moved ("a->b#1" to "a->b#0"); hide clears one it took', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'L1', from: 'a', to: 'b' }, { from: 'a', to: 'b', label: 'x' }, { from: 'a', to: 'b', label: 'y' }],
    views: [{ id: 'v', nodeIds: ['a', 'b'] }], stories: [{ id: 's', steps: [{ view: 'v', select: 'a->b#1', highlight: [{ type: 'edge', ids: ['a->b#2'] }] }] }] };
  assert.deepEqual(validate(m), []);
  assert.deepEqual(apply(m, { op: 'delete', id: 'L1' }).stories[0].steps[0], { view: 'v', select: 'a->b#0', highlight: [{ type: 'edge', ids: ['a->b#1'] }] });
  const h = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }],
    views: [{ id: 'v', nodeIds: ['a', 'b', 'c'], edges: [{ from: 'b', to: 'c' }, { id: 'own2', from: 'a', to: 'c' }] }],
    stories: [{ id: 's', steps: [{ view: 'v', select: 'b->c#0', highlight: ['b->c#0', 'own2'] }] }] };
  const h2 = apply(h, { op: 'hide', id: 'c', view: 'v' });
  assert.deepEqual([h2.stories[0].steps[0], validate(h2)], [{ view: 'v', highlight: [] }, []]);
});

test('audit 13: a name of a line with no id counts in its own list: a delete in one view\'s list renames that view\'s steps and keys only, and validate() checks a step against the list its view draws', () => {
  const m = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', label: 'm0' }, { from: 'a', to: 'b', label: 'm1' }], views: [
    { id: 'v1', nodeIds: ['a', 'b'], edges: [{ id: 's1', from: 'a', to: 'b' }, { from: 'a', to: 'b', label: 'browse' }, { from: 'a', to: 'b', label: 'buy' }], present: { 'a->b#2': { hidden: true } } },
    { id: 'v2', nodeIds: ['a', 'b'], edges: [{ from: 'a', to: 'b', label: 'ping' }, { from: 'a', to: 'b', label: 'pong' }], present: { 'a->b#1': { hidden: true } } },
    { id: 'v3', nodeIds: ['a', 'b'] }],
    stories: [{ id: 's', steps: [{ view: 'v1', select: 'a->b#1' }, { view: 'v1', select: 'a->b#2' }, { view: 'v2', select: 'a->b#1' }, { view: 'v3', select: 'a->b#1' }] }] };
  const n = apply(m, { op: 'delete', id: 's1' });
  assert.deepEqual(n.stories[0].steps.map(s => s.select), ['a->b#0', 'a->b#1', 'a->b#1', 'a->b#1'], 'browse and buy follow on v1; v2 and the model\'s lines keep their names');
  assert.deepEqual([n.views[0].present, n.views[1].present], [{ 'a->b#1': { hidden: true } }, { 'a->b#1': { hidden: true } }]);
  assert.deepEqual(validate({ ...m, stories: [{ id: 's', steps: [{ view: 'v2', select: 'a->b#2' }, { view: 'v3', select: 'a->b#2' }] }] }).map(p => p.path),
    ['stories[0].steps[0].select', 'stories[0].steps[1].select'], 'a->b#2 is a line of v1 only');
});

test('audit 17: hide refuses a view\'s subject (or what owns it), which would leave the view without one', () => {
  const c4 = JSON.parse(readFileSync(new URL('../examples/bookshop-c4.json', import.meta.url)));
  assert.throws(() => apply(c4, { op: 'hide', id: 'c4-api', view: 'c4-components' }), /"c4-api" is the subject of view "c4-components": change the view's subject, or delete it from the model \(no command deletes a view\)/);
  assert.throws(() => apply(c4, { op: 'hide', id: 'c4-bookshop', view: 'c4-containers' }), /is the subject of view "c4-containers"/);
  const os = JSON.parse(readFileSync(new URL('../examples/order-service-structure.json', import.meta.url))), v = os.views[0];
  assert.throws(() => apply(os, { op: 'hide', id: v.subject, view: v.id }), /is the subject of view/);
  const m = { schemaVersion: 2, nodes: [{ id: 'S', type: 'uml.Component', members: [{ id: 'S.p', type: 'uml.Property' }] }, { id: 'x', type: 'uml.Component' }],
    views: [{ id: 'v', diagram: 'uml.composite-structure', subject: 'S.p', nodeIds: ['S', 'x'] }] };
  assert.throws(() => apply(m, { op: 'hide', id: 'S', view: 'v' }), /"S.p" is the subject of view "v"/);
  assert.deepEqual(apply(m, { op: 'hide', id: 'x', view: 'v' }).views[0].subject, 'S.p'); // another card: the subject stays
});

test('audit 21: apply() edits a model with a value no text is read from ({"toString": 1} as a line end, a type) as validate() reads it: delete and hide work, nothing else changes', () => {
  const m = JSON.parse('{"nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"},{"id":"c","label":"C"}],"edges":[{"id":"ab","from":"a","to":"b"},{"from":{"toString":1},"to":"b"},{"from":"a","to":"b"}],"views":[{"id":"v","nodeIds":["a","b","c"],"edges":["ab","a->b#0"]}]}');
  const del = apply(m, { op: 'delete', id: 'c' }), hid = apply(m, { op: 'hide', id: 'c', view: 'v' });
  assert.deepEqual([del.nodes.map(n => n.id), del.edges], [['a', 'b'], m.edges]);
  assert.deepEqual(hid.views[0].nodeIds, ['a', 'b']);
  assert.deepEqual(hid.views[0].edges, ['ab', 'a->b#0'], 'the view\'s lines, a positional one too, as they were');
  assert.deepEqual(apply(m, { op: 'delete', id: 'a' }).edges, [m.edges[1]], 'its lines go with a card; the line with no readable end stays as it was');
  // every typed example: a type, a member's type, a label or an end no text is read from, then each command on its first elements
  const bad = () => JSON.parse('{"toString":1}'), thrown = [];
  for (const f of ['bookshop-schema.json', 'bookshop-timing.json', 'bookshop-c4.json', 'order-states.json', 'bookshop-components.json']) {
    const base = read('../examples/' + f), ids = []; JSON.stringify(base, (k, v) => { if (k === 'id' && typeof v === 'string' && ids.length < 8) ids.push(v); return v; });
    const spots = [x => { x.nodes[0].type = bad(); }, x => { const n = x.nodes.find(y => Array.isArray(y.members) && y.members.length); if (n) n.members[0].type = bad(); },
      x => { if (x.edges && x.edges[0]) { x.edges[0].type = bad(); x.edges[0].from = bad(); } }, x => { x.nodes[1].label = bad(); }];
    for (const spot of spots) { const h = structuredClone(base); spot(h);
      for (const id of ids) for (const c of [{ op: 'delete', id }, { op: 'hide', id, view: base.views[0].id }, { op: 'set', id, path: 'label', value: 'Z' }])
        try { apply(h, c); } catch (e) { if (/primitive/.test(e.message)) thrown.push(`${f} ${JSON.stringify(c)}: ${e.message}`); } }
  }
  assert.deepEqual(thrown, []);
});

// audit 24: registry.js ownGuard's rule (a model node never has a parent other views lack) is kept by apply() itself and said
// by validate(): a host's apply(), an import or a model saved before audit 23 no longer puts a model element under a node one
// view alone holds without a word, where deleting that node then lifts it into new errors
test('audit 24: apply() refuses a model element, or another view\'s own one, under a node one view alone holds; validate() warns of a saved one', async () => {
  const L = await import('../lib/umlimator-all.js');
  let m = { schemaVersion: 2, nodes: [{ id: 'A', type: 'uml.Class', label: 'Order' }], edges: [],
    views: [{ id: 'v1', diagram: 'uml.class', nodeIds: ['A'] }, { id: 'v2', diagram: 'uml.class', nodeIds: ['A'] }] };
  m = L.apply(m, [{ op: 'add', in: 'view', view: 'v1', element: { id: 'P', type: 'uml.Package', label: 'sales' } }, { op: 'add', in: 'view', view: 'v2', element: { id: 'Q', type: 'uml.Package', label: 'other' } }]);
  const refused = /"P" lives in view "v1" only/;
  assert.throws(() => L.apply(m, { op: 'reparent', id: 'A', parent: 'P' }), refused);
  assert.throws(() => L.apply(m, { op: 'add', view: 'v1', element: { id: 'B', type: 'uml.Class', label: 'Line', parent: 'P' } }), refused);
  assert.throws(() => L.apply(m, { op: 'reparent', id: 'Q', parent: 'P' }), /"Q", an element of view "v2"/);
  assert.throws(() => L.apply(m, { op: 'add', in: 'view', view: 'v2', element: { id: 'C', type: 'uml.Class', label: 'C', parent: 'P' } }), refused);
  // what stays allowed: v1's own under v1's own, and a model owner for anything
  const ok = L.apply(m, [{ op: 'add', in: 'view', view: 'v1', element: { id: 'D', type: 'uml.Class', label: 'D', parent: 'P' } }, { op: 'reparent', id: 'P', parent: 'A' }]);
  assert.deepEqual(L.validate(ok).filter(p => /lives in view/.test(p.message)), []);
  // a model saved with one (before audit 23, or written by hand): a warning at the element's parent, naming the view
  const saved = structuredClone(m); saved.nodes[0].parent = 'P'; saved.views[1].nodes[0].parent = 'P';
  assert.deepEqual(L.validate(saved).filter(p => /lives in view/.test(p.message)).map(p => [p.level, p.path]), [['warning', 'nodes[0].parent'], ['warning', 'views[1].nodes[0].parent']]);
  // every example: a node of its own added to a typed view, then a model node the view draws put under it
  let n24 = 0;
  for (const f of readdirSync(new URL('../examples/', import.meta.url)).filter(f => f.endsWith('.json'))) {
    const x = read('../examples/' + f); if (x.schemaVersion !== 2) continue;
    assert.deepEqual(L.validate(x).filter(p => /lives in view/.test(p.message)), [], `${f} as shipped`);
    for (const v of x.views) { if (!v || v.diagram == null || v.diagram === 'map') continue;
      const n = (x.nodes || []).find(n => n && typeof n.id === 'string' && typeof n.type === 'string' && (v.nodeIds || []).includes(n.id)); if (!n) continue;
      let y; try { y = L.apply(x, { op: 'add', in: 'view', view: v.id, element: { id: 'own24', type: n.type, label: 'Own' } }); } catch { continue; }
      if (!(y.views.find(w => w.id === v.id).nodes || []).some(o => o.id === 'own24')) continue;
      assert.throws(() => L.apply(y, { op: 'reparent', id: n.id, parent: 'own24' }), new RegExp(`"own24" lives in view "${v.id}" only`), `${f} ${v.id}`);
      y.nodes.find(z => z.id === n.id).parent = 'own24'; n24++;
      assert.ok(L.validate(y).some(p => p.level === 'warning' && p.message.startsWith(`parent "own24" lives in view "${v.id}" only`)), `${f} ${v.id}: warned`);
    }
  }
  assert.ok(n24 >= 20, `${n24} views tried`);
});
