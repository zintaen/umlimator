// The sequence spike's findings applied (docs/diagrams/notes/spike-sequence.md §5, items 1 to 3): the registry's fields
// (layout.run and key, pins, draw, items, refs, validate), one ordered list of a sequence's occurrences (model.md), and
// apply()'s `in: 'view'` and re-homing delete. P4 to P11 are the spike's evidence cases, each now passing. Runs on the
// sources, with a stand-in `uml.sequence` registered in this process only: it declares the spike's items and refs, and no
// layout (stage 3 brings the type).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerDiagramType } from '../src/core/registry.js';
import { apply, references } from '../src/core/apply.js';
import { typedProblems } from '../src/core/model.js';
import { textW } from '../src/core/text.js';
import { mapContext } from '../src/map/context.js';
import { layout } from '../src/map/api.js';
import { validate } from '../src/map/validate.js';
import { check } from '../docs/diagrams/examples/check.mjs';

registerDiagramType('uml.sequence', { title: 'sequence (a stand-in for stage 3)', elements: [{ type: 'uml.Lifeline', label: 'Lifeline' }],
  items: ['uml.InteractionUse'], refs: { 'uml.Message': { 'props.replyTo': 'cascade' }, 'uml.InteractionUse': { 'props.covers': 'drop' } } });

const SEQ = JSON.parse(readFileSync(new URL('../docs/diagrams/examples/11-sequence.json', import.meta.url)));
const frozen = x => { if (x && typeof x === 'object') { Object.values(x).forEach(frozen); Object.freeze(x); } return x; };
const run = c => apply(frozen(structuredClone(SEQ)), c);
const V = m => m.views[0], ids = list => list.map(x => (typeof x === 'string' ? x : x.id)), byId = (m, id) => V(m).edges.find(e => e.id === id);
const errors = m => validate(m).filter(p => p.level === 'error');

test('the sequence example: one ordered list of occurrences, f3 among the messages with no `after`, and no problem', () => {
  assert.deepEqual(ids(V(SEQ).edges), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'f3', 'm8', 'm9', 'm10']);
  assert.ok(!JSON.stringify(SEQ).includes('"after"'));
  assert.deepEqual(check(SEQ, 'uml.sequence'), []);
  assert.deepEqual(errors(SEQ), []);
  // an interaction use counts for its operand's contiguity: f3 moved out of f1-paid's run of occurrences is found
  const m = structuredClone(SEQ), f3 = V(m).edges.splice(7, 1)[0]; V(m).edges.push(f3);
  assert.deepEqual(check(m, 'uml.sequence'), ['operand f1-paid: its occurrences are not next to each other in time']);
});

test('P4: add with in "view" puts a message into the view\'s edges at its index, not into the model', () => {
  const msg = { id: 'm11', type: 'uml.Message', from: 'api', to: 'api', label: 'log()', parent: 'f1-paid', props: { sort: 'call' } };
  const m = run({ op: 'add', element: msg, view: 'checkout', index: 7, in: 'view' });
  assert.deepEqual(m.edges, []);
  assert.deepEqual(ids(V(m).edges).slice(6, 9), ['m7', 'm11', 'f3']);
  assert.deepEqual(byId(m, 'm11'), msg);
  assert.deepEqual(errors(m), []);
  assert.deepEqual(run({ op: 'add', element: msg, view: 'checkout', index: 7, in: 'model' }).edges, [msg]); // the default, as before
});

test('P5: a message moved across an operand takes nothing with it; the operands stay whole', () => {
  const m = run([{ op: 'move', id: 'm7', view: 'checkout', index: 7 }, { op: 'reparent', id: 'm7', parent: 'f1-declined' }]);
  assert.deepEqual(ids(V(m).edges), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'f3', 'm7', 'm8', 'm9', 'm10']);
  assert.equal(byId(m, 'f3').parent, 'f1-paid');
  assert.deepEqual(check(m, 'uml.sequence'), []); // f1-paid's occurrences (m5, m6, f3) and f1-declined's (m7, m8) each in one run
});

test('P6: deleting a message strands nothing: the interaction use keeps its place, and nothing names the message', () => {
  const m = run({ op: 'delete', id: 'm7' });
  assert.deepEqual(ids(V(m).edges), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'f3', 'm8', 'm9', 'm10']);
  assert.ok(!JSON.stringify(m).includes('"m7"'));
  assert.deepEqual(check(m, 'uml.sequence'), []);
});

test('P7: a type\'s refs: deleting a call takes its replies (cascade), and references() says where they name it', () => {
  assert.deepEqual(references(SEQ, 'm4').map(r => `${r.kind} ${r.path.join('/')}`),
    ['prop views/0/edges/4/props/replyTo', 'prop views/0/edges/8/props/replyTo']);
  const m = run({ op: 'delete', id: 'm4' });
  assert.deepEqual(ids(V(m).edges), ['m1', 'm2', 'm3', 'm6', 'm7', 'f3', 'm9', 'm10']);
  assert.deepEqual(errors(m), []);
  // hide keeps what props name: the model keeps the element
  assert.deepEqual(run({ op: 'hide', id: 'receipt', view: 'checkout' }).views[0].edges.find(e => e.id === 'f3').props.covers, ['api', 'receipt']);
});

test('P8: unwrapping a fragment re-homes what it held into the fragment\'s own operand, not to the top', () => {
  const m = run({ op: 'delete', id: 'f2' });
  assert.equal(byId(m, 'm7').parent, 'f1-paid');
  assert.deepEqual(ids(V(m).fragments), ['f1']);
  assert.deepEqual(check(m, 'uml.sequence'), []);
  // an operand alone: what it held goes to its fragment's parent (here none); a nested fragment moves up with it
  const o = run({ op: 'delete', id: 'f1-paid' });
  assert.deepEqual([byId(o, 'm5').parent, byId(o, 'f3').parent, V(o).fragments.find(f => f.id === 'f2').parent, byId(o, 'm7').parent], [undefined, undefined, undefined, 'f2-notify']);
  assert.deepEqual(errors(o), []);
  // deeper: an operand of a fragment inside an operand gives its messages to the outer operand
  assert.equal(byId(run({ op: 'delete', id: 'f2-notify' }), 'm7').parent, 'f1-paid');
  // nodes still go with the owner they are in, as before
  const pk = apply({ schemaVersion: 2, nodes: [{ id: 'p', type: 'uml.Package' }, { id: 'q', type: 'uml.Package', parent: 'p' }, { id: 'c', type: 'uml.Class', parent: 'q' }], edges: [],
    views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['p', 'q', 'c'] }] }, { op: 'delete', id: 'q' });
  assert.deepEqual(pk.nodes.map(n => n.id), ['p']);
});

test('P9: deleting a lifeline takes its messages and drops it from what covers it; references() says so', () => {
  assert.deepEqual(references(SEQ, 'receipt').filter(r => r.kind === 'prop').map(r => r.path.join('/')), ['views/0/edges/7/props/covers/1']);
  const m = run({ op: 'delete', id: 'receipt' });
  assert.deepEqual(byId(m, 'f3').props.covers, ['api']);
  assert.ok(!byId(m, 'm6'));
  assert.deepEqual(errors(m), []);
});

test('P10: a fragment added in "view" goes into the view\'s fragments; a node into its own nodes and nodeIds', () => {
  const f = { id: 'f4', type: 'uml.CombinedFragment', props: { operator: 'loop' }, members: [{ id: 'f4-op', type: 'uml.InteractionOperand', label: 'each book' }] };
  const m = run([{ op: 'add', element: f, view: 'checkout', in: 'view' }, { op: 'reparent', id: 'm3', parent: 'f4-op' }]);
  assert.deepEqual([ids(V(m).fragments), m.nodes.length, V(m).nodeIds.length, byId(m, 'm3').parent], [['f1', 'f2', 'f4'], 5, 5, 'f4-op']);
  assert.deepEqual(errors(m), []);
  const l = run({ op: 'add', element: { id: 'audit', type: 'uml.Lifeline', label: 'audit' }, view: 'checkout', index: 1, in: 'view' });
  assert.deepEqual([V(l).nodes, V(l).nodeIds.slice(0, 3), l.nodes.length], [[{ id: 'audit', type: 'uml.Lifeline', label: 'audit' }], ['shopper', 'audit', 'storefront'], 5]);
  assert.deepEqual(errors(l), []);
  // refusals: an unknown `in`; `in: 'view'` with no view or with an owner; a line into a view that shows every model line
  assert.throws(() => run({ op: 'add', element: f, view: 'checkout', in: 'views' }), /in is 'view' or 'model'/);
  assert.throws(() => run({ op: 'add', element: f, in: 'view' }), /needs a view, and no owner/);
  assert.throws(() => run({ op: 'add', element: { id: 'x', type: 'uml.Property' }, owner: 'api', view: 'checkout', in: 'view' }), /needs a view, and no owner/);
  const all = { schemaVersion: 2, nodes: [{ id: 'a', type: 'uml.Class' }, { id: 'b', type: 'uml.Class' }], edges: [{ id: 'ab', type: 'uml.Dependency', from: 'a', to: 'b' }], views: [{ id: 'v', diagram: 'uml.class', nodeIds: ['a', 'b'] }] };
  assert.throws(() => apply(all, { op: 'add', element: { id: 'ba', type: 'uml.Dependency', from: 'b', to: 'a' }, view: 'v', in: 'view' }), /shows every line between its cards/);
});

test('P11: an interaction use moves in time like a message', () => {
  const m = run({ op: 'move', id: 'f3', view: 'checkout', index: 2 });
  assert.deepEqual(ids(V(m).edges).slice(0, 4), ['m1', 'm2', 'f3', 'm3']);
});

test('items: the core checks no ends on a type\'s items; a type not drawn yet passes over entries with neither end', () => {
  assert.deepEqual(typedProblems(SEQ), []);
  const bad = structuredClone(SEQ); V(bad).edges.push({ id: 'm12', type: 'uml.Message', label: 'lost' }); // a message is a line: its ends are checked
  assert.deepEqual(typedProblems(bad).map(p => p.path), ['views[0].edges[11].from', 'views[0].edges[11].to']);
  const unknown = { schemaVersion: 2, nodes: [{ id: 'a', type: 'x.A' }], views: [{ id: 'v', diagram: 'x.kind', nodeIds: ['a'], edges: [{ id: 'i', type: 'x.Item' }, { id: 'l', type: 'x.Line', from: 'a' }] }] };
  assert.deepEqual(typedProblems(unknown).map(p => p.path), ['views[0].edges[1].to']);
});

let runs = 0, seen = null;
registerDiagramType('test.run', {
  layout: { run(model, view, ctx) { runs++; seen = { ...ctx, w: textW('abcd', 10) };
    return { nodes: [], edges: [], groups: [], bounds: { x: 0, y: 0, w: 100, h: 50 }, byId: {}, map: false, view: view.id }; },
  key: (model, view) => JSON.stringify(view.nodeIds), pins: false },
  draw: (geo, kit) => ({ under: `<g class="t-under">${kit.r2(1 / 3)}</g>`, over: `<g class="t-over">${kit.esc('<' + geo.view + '>')}</g>` }),
  validate: (model, view) => [{ level: 'warning', path: 'views', message: 'said once' }, { level: 'warning', path: `views.${view.id}`, message: 'per view' }],
});
const RUN = { schemaVersion: 2, nodes: [{ id: 'a', type: 't.A', label: 'A' }, { id: 'b', type: 't.A', label: 'B' }],
  views: [{ id: 'v', diagram: 'test.run', nodeIds: ['a', 'b'], layout: { a: [4, 4] } }, { id: 'w', diagram: 'test.run', nodeIds: ['b'] }] };

test('layout.run: a typed view is laid out by its type\'s run, in the host\'s measure; its key keeps the geometry; pins false ignores view.layout', () => {
  const measure = (s, px) => s.length * px * 2, ctx = mapContext(RUN, { measure });
  runs = 0;
  const g = ctx.buildGeo('v');
  assert.equal(g.view, 'v');
  assert.equal(seen.measure, measure);
  assert.equal(seen.w, 80); // textW inside run measured by the host's measure (spike R2)
  assert.notDeepEqual(seen.pos.a, [4, 4]); // a pin means nothing to this type
  assert.ok(seen.memo && typeof seen.memo === 'object');
  assert.equal(ctx.buildGeo('v'), g); // the same key: no second run
  assert.equal(runs, 1);
  assert.equal(layout(RUN, 'w').view, 'w'); // layout() takes the same path
});

test('draw: a type\'s layers go under the lines and over the nodes, before the labels', () => {
  const { markup } = mapContext(RUN, {}).buildView('v'), at = s => markup.indexOf(s);
  assert.ok(at('<g class="t-under">0.33</g>') >= 0 && at('<g class="t-under">') < at('<g class="edges">'), markup);
  assert.ok(at('<g class="nodes">') < at('<g class="t-over">&lt;v&gt;</g>') && at('<g class="t-over">') < at('<g class="labels'), markup);
});

test('validate: each typed view\'s type rules, a problem said once however many views share it', () => {
  assert.deepEqual(validate(RUN).filter(p => p.path.startsWith('views')).map(p => `${p.path} ${p.message}`), ['views said once', 'views.v per view', 'views.w per view']);
});
