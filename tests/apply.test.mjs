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
    for (const v of m.views) for (const id of (v.nodeIds || []).filter(i => shared.has(i))) { hidden++; assert.deepEqual(errors(apply(m, { op: 'hide', id, view: v.id })), [], `${f}: hide ${id} in ${v.id}`); }
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
