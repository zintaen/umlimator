// Every single delete over every example (bike-share, which holds the atlases' views, among them) and every target (docs/diagrams/examples): Shift + Delete
// on an element, through the remove hook of each view that draws it (the canvas's default, a bare delete, where a view's
// type has none), and Delete (out of the view) in each view that draws it, through the canvas's own remove()
// (src/canvas/edit.js), leaves no new validate() error with every type's rules loaded, as lib/umlimator-all.js loads them
// (notes/stage-6.md 6.1, closed by the follow-up; audit 18: before, only the UML types' rules were loaded). Ids are found by
// label where a case is named, so a rename in the examples breaks only that case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { diagramOf, TYPED } from '../src/core/registry.js';
import { typedEditor } from '../src/canvas/edit.js';
import { apply } from '../src/core/apply.js';
import { validate } from '../src/map/validate.js';
import '../src/map/typed.js';
import { targets } from '../docs/diagrams/examples/check.mjs';

// every type's rules and hooks: each folder of src/ that holds a family (uml first, as tools/build.mjs orders them)
const NOT_A_FAMILY = ['canvas', 'core', 'draw', 'layout', 'map', 'page', 'readers', 'typed'], src = new URL('../src/', import.meta.url);
const families = readdirSync(src, { withFileTypes: true }).filter(d => d.isDirectory() && !NOT_A_FAMILY.includes(d.name)).map(d => d.name).sort((a, b) => (b === 'uml') - (a === 'uml') || a.localeCompare(b));
for (const d of families) { const u = new URL(d + '/', src); for (const f of readdirSync(u).filter(f => f.endsWith('.js')).sort()) await import(new URL(f, u)); }

const arr = x => (Array.isArray(x) ? x : []), read = url => JSON.parse(readFileSync(url));
const files = () => { const ex = new URL('../examples/', import.meta.url), seen = new Map();
  readdirSync(ex).filter(f => f.endsWith('.json')).forEach(f => seen.set(new URL(f, ex).href, 'examples/' + f));
  targets().forEach(([f, url]) => { if (!seen.has(url.href)) seen.set(url.href, f); });
  return [...seen].map(([href, name]) => [name, read(new URL(href))]); };
// the ids each view draws: its cards and their members, its own elements, its lines (listed, or every line between its cards)
function drawn(m) {
  const N = new Map(arr(m.nodes).map(n => [n.id, n])), own = (x, s) => { if (x && typeof x === 'object') { s.add(x.id); arr(x.members).forEach(y => own(y, s)); } };
  return arr(m.views).map(v => { const s = new Set(), t = v.timeline || {};
    arr(v.nodeIds).forEach(id => own(N.get(id), s)); [v.nodes, v.fragments, t.changes, t.constraints].forEach(l => arr(l).forEach(x => own(x, s)));
    if (Array.isArray(v.edges)) v.edges.forEach(e => (typeof e === 'string' ? s.add(e) : own(e, s)));
    else arr(m.edges).filter(e => s.has(e.from) && s.has(e.to)).forEach(e => s.add(e.id));
    return [v, s]; });
}
const hookOf = v => { const T = diagramOf(v), h = T && T.edits && T.edits.remove; return typeof h === 'function' ? h : null; };
// the canvas's own remove() (src/canvas/edit.js), the default a type's remove hook falls back to: its commands and its status.
// Built without TYPED.edit, the gestures src/typed/edit.js and the mindmap lay over it, so remove() is the core's
function canvas(m, v, id, fromModel) {
  const got = [], said = [], E = TYPED.edit; let I;
  TYPED.edit = undefined;
  try { I = typedEditor({ root: null, stage: null, can: () => true, say() {}, status: t => said.push(t), emit: c => got.push(...c), view: () => v.id, model: () => m,
    picked: () => [], sel: () => null, geo: () => ({ byId: {}, nodes: [] }), cam: () => null, focus() {}, touch() {} }); } finally { TYPED.edit = E; }
  I.remove(fromModel, [id]);
  return { commands: got, said };
}
// Shift + Delete (fromModel), or Delete, on id in view v (null: no view draws it, or one with no hook): the commands, or null when refused
function gesture(m, v, id, fromModel = true) {
  let r = v && hookOf(v) ? hookOf(v)(m, v, [id], fromModel) : null;
  if (r != null && Array.isArray(r.pick)) r = r.then(0);
  if (r == null) { const c = fromModel || !v ? [{ op: 'delete', id }] : canvas(m, v, id, false).commands; return c.length ? { commands: c } : null; }
  return r.error != null ? null : Array.isArray(r) ? { commands: r } : r;
}
const errors = m => validate(m).filter(p => p.level === 'error').map(p => p.message);

test('no single delete or hide of any element of any example or target leaves a new validate() error', () => {
  const bad = []; let n = 0;
  for (const [name, m] of files()) {
    const was = new Set(errors(m)), views = drawn(m), ids = new Set();
    JSON.stringify(m, (k, x) => { if (x && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string') ids.add(x.id); return x; });
    for (const id of ids) {
      const on = views.filter(([, s]) => s.has(id)).map(([v]) => v), ways = on.filter(hookOf);
      if (ways.length < on.length || !on.length) ways.push(null);
      for (const [v, fromModel] of [...ways.map(v => [v, true]), ...on.map(v => [v, false])]) { const g = gesture(m, v, id, fromModel); if (!g) continue;
        let after; try { after = apply(m, g.commands); } catch (err) { // a bare delete of an id apply() does not delete (a view's, a story's); a hide of a member, refused
          if (v ? fromModel || !/^hide: ".+" is a member, shown with its owner/.test(err.message) : !/is not an element/.test(err.message)) throw err; continue; }
        n++; errors(after).filter(e => !was.has(e)).forEach(e => bad.push(`${name}: ${id}${v ? ` in ${v.id}` : ''}${fromModel ? '' : ' (Delete)'}: ${e}`)); } }
  }
  assert.ok(n > 2500, `${n} deletes`);
  assert.deepEqual(bad, []);
});

const ex = f => read(new URL('../examples/' + f, import.meta.url));
const byLabel = (list, label) => arr(list).find(x => x.label === label);

test('use case: deleting the last extension point an extend names takes the extend, said; one naming another keeps it', () => {
  const m = ex('shopping-use-cases.json'), v = m.views.find(x => x.diagram === 'uml.use-case'), uc = byLabel(m.nodes, 'Check out');
  const pay = arr(uc.members).find(p => m.edges.some(e => e.type === 'uml.Extend' && arr(e.props.extensionPoints).includes(p.id)));
  const ext = m.edges.filter(e => e.type === 'uml.Extend' && arr(e.props.extensionPoints).includes(pay.id));
  const r = hookOf(v)(m, v, [pay.id], true);
  assert.deepEqual(r.commands, [pay.id, ...ext.map(e => e.id)].map(id => ({ op: 'delete', id })));
  assert.match(r.say, /^Deleted extension point ".+" and the extend from ".+", which named no other extension point$/);
  ext[0].props.extensionPoints.push(arr(uc.members).find(p => p.id !== pay.id).id); // now it names another
  assert.equal(hookOf(v)(m, v, [pay.id], true), null, 'the default: the point alone');
  assert.equal(hookOf(v)(m, v, [pay.id], false), null, 'Delete: the default');
});

test('sequence and communication: their hooks already keep the rules, by refusing or by taking what depends', () => {
  const sq = ex('checkout-sequence.json'), v = sq.views.find(x => x.diagram === 'uml.sequence'), f = arr(v.fragments).find(x => x.props && x.props.operator === 'alt');
  for (const id of [f.id, ...f.members.map(o => o.id)]) assert.match(hookOf(v)(sq, v, [id], true).error, /^reply-once: /, `${id}: refused, said`);
  const cm = ex('checkout-communication.json'), w = cm.views.find(x => x.diagram === 'uml.communication');
  const c = cm.edges.find(e => e.type === 'uml.Connector' && (w.edges || []).includes(e.id)) || cm.edges.find(e => e.type === 'uml.Connector');
  const out = hookOf(w)(cm, w, [c.id], true);
  assert.ok(out.commands.length > 1, 'the connector takes the messages it carries');
  assert.match(out.say, /^Deleted connector ".+" and its \d+ messages?: ".+"$/, 'and says which');
  assert.deepEqual(errors(apply(cm, out.commands)).filter(e => e.includes('message-link')), []);
});

test('composite structure: a view whose subject is deleted is a warning, not an error; a subject not listed is still an error', () => {
  const m = ex('order-service-structure.json'), v = m.views.find(x => x.diagram === 'uml.composite-structure');
  const p = validate(apply(m, { op: 'delete', id: v.subject })).filter(x => x.rule === 'subject-shown');
  assert.deepEqual(p.map(x => x.level), ['warning']); assert.match(p[0].message, /has no subject/);
  const w = structuredClone(m); w.views.find(x => x.id === v.id).nodeIds = w.views.find(x => x.id === v.id).nodeIds.filter(id => id !== v.subject);
  assert.deepEqual(validate(w).filter(x => x.rule === 'subject-shown').map(x => x.level), ['error']);
});

test('audit 18: Delete on a view\'s subject, through the canvas\'s remove(), sends no command and says why', () => {
  for (const [f, vid] of [['bookshop-c4.json', 'c4-components'], ['bookshop-c4.json', 'c4-containers'], ['order-service-structure.json', 'internals'], ['ebike-structure.json', 'inside-ebike']]) {
    const m = ex(f), v = m.views.find(x => x.id === vid), r = canvas(m, v, v.subject, false);
    assert.deepEqual(r.commands, [], `${f} ${vid}`);
    assert.deepEqual(r.said, ['This box is the view\'s subject: change the view\'s subject, or Shift + Delete deletes it'], `${f} ${vid}`);
    assert.deepEqual(canvas(m, v, v.subject, true).commands, [{ op: 'delete', id: v.subject }], 'Shift + Delete: deleted');
  }
});

test('audit 18: deleting a C4 view\'s subject, or the constraint block a constraint property names, leaves a warning, not an error', () => {
  const c4 = apply(ex('bookshop-c4.json'), { op: 'delete', id: 'c4-api' }), p = validate(c4).filter(x => x.rule === 'c4-subject');
  assert.deepEqual(p.map(x => [x.level, x.message]), [['warning', 'c4-subject: the view has no subject: a component view zooms into a container']]);
  const w = ex('bookshop-c4.json'); w.views.find(v => v.id === 'c4-components').subject = 'c4-bookshop';
  assert.deepEqual(validate(w).filter(x => x.rule === 'c4-subject').map(x => x.level), ['error'], 'a subject of the wrong kind: still an error');
  const eb = ex('ebike-blocks.json'), cb = eb.nodes.find(n => n.type === 'sysml.ConstraintBlock');
  const q = validate(apply(eb, { op: 'delete', id: cb.id })).filter(x => x.rule === 'constraint-type');
  assert.ok(q.length > 0 && q.every(x => x.level === 'warning' && /which names nothing/.test(x.message)), JSON.stringify(q));
});

test('audit 18: Delete on the subject selected with a part, a port or a lane keeps the subject, said, and still handles the rest', async () => {
  await import('../src/sysml/internal.js'); await import('../src/sysml/parametric.js'); await import('../src/bpmn/process.js');
  const cases = [['order-service-structure.json', 'order-service.checkout'], ['ebike-structure.json', null], ['ebike-range.json', null], ['bookshop-order-to-shipment.json', 'bp-sales']];
  for (const [f, other] of cases) { const m = ex(f), v = m.views.find(x => x.subject != null);
    const o = other ?? arr(m.nodes.find(n => n.id === v.subject).members)[0].id, r = hookOf(v)(m, v, [v.subject, o], false);
    assert.ok(!r.commands.some(c => c.op === 'hide' && c.id === v.subject), `${f}: no hide of the subject`);
    const after = apply(m, r.commands); // apply() refuses a hide of the subject, which refused the whole selection before
    assert.ok(!JSON.stringify(after).includes(`"id":"${o}"`), `${f}: ${o} is deleted`);
    assert.equal(after.views.find(x => x.id === v.id).subject, v.subject, `${f}: the subject stays`);
    assert.match(r.say, /kept .+, the view's subject: change the view's subject, or Shift \+ Delete deletes it$/, f); }
});

test('audit 19: a flow left conveying nothing goes with what it conveyed, when that goes with its owner or from another view; an extend likewise', () => {
  const m = { schemaVersion: 2, nodes: [
    { id: 'shopper', type: 'uml.Actor', label: 'Shopper' }, { id: 'shop', type: 'uml.Component', label: 'Shop' },
    { id: 'order', type: 'uml.Class', label: 'Order', parent: 'shop' }, { id: 'card', type: 'uml.InformationItem', label: 'Card' },
    { id: 'bank', type: 'uml.Component', label: 'Bank' } ],
  edges: [{ id: 'f1', type: 'uml.InformationFlow', from: 'shopper', to: 'bank', props: { conveyed: ['order'] } },
    { id: 'f2', type: 'uml.InformationFlow', from: 'shopper', to: 'bank', props: { conveyed: ['order', 'card'] } }],
  views: [{ id: 'v', diagram: 'uml.information-flow', nodeIds: ['shopper', 'shop', 'card', 'bank'] }, { id: 'classes', diagram: 'uml.class', nodeIds: ['order'] }] };
  const errs = x => validate(x).filter(p => p.level === 'error').map(p => p.message);
  assert.deepEqual(errs(m), []);
  // Shift + Delete of the owner on the information flow view: the hook sees what the delete takes, and says the flow it takes
  const r = hookOf(m.views[0])(m, m.views[0], ['shop'], true);
  assert.deepEqual(r && r.commands, [{ op: 'delete', id: 'shop' }, { op: 'delete', id: 'f1' }]);
  assert.match(r.say, /^Deleted "Shop" and the 1 flow that conveyed nothing else: Shopper → Bank$/);
  for (const n of [apply(m, r.commands), apply(m, [{ op: 'delete', id: 'shop' }]), apply(m, [{ op: 'delete', id: 'order' }])]) { // the hook, a bare delete of the owner, the class view's bare delete
    assert.deepEqual(errs(n), []); assert.deepEqual(n.edges.map(e => [e.id, e.props.conveyed]), [['f2', ['card']]]); }
  assert.equal(hookOf(m.views[1]), null, 'the class view has no remove hook: the bare delete keeps the rule by itself');
  // a use case's extension point deleted by a bare delete (a host's, or its owner's view of another type): the extend goes too
  const u = ex('shopping-use-cases.json'), uc = byLabel(u.nodes, 'Check out');
  const pay = arr(uc.members).find(p => u.edges.some(e => e.type === 'uml.Extend' && arr(e.props.extensionPoints).includes(p.id)));
  const ext = u.edges.filter(e => e.type === 'uml.Extend' && arr(e.props.extensionPoints).length === 1 && e.props.extensionPoints[0] === pay.id);
  assert.ok(ext.length); const after = apply(u, [{ op: 'delete', id: pay.id }]);
  assert.ok(ext.every(e => !after.edges.some(x => x.id === e.id))); assert.deepEqual(errs(after).filter(x => /extend/.test(x)), []);
});

// audit 23: deleting what one view alone holds (a node in view.nodes, the canvas's Delete of one) takes the view's own nodes
// under it, never a model node: that goes to its nearest owner left that no view alone holds, else none, and stays in every view
test('apply() delete of a view\'s own owner keeps the model nodes under it, each under its nearest model owner (audit 23)', async () => {
  for (const f of ['usecase', 'activity', 'state']) await import(`../src/uml/${f}.js`);
  const two = (d, nodes, own, edges = []) => ({ schemaVersion: 2, nodes, edges, views: [{ id: 'v', diagram: d, nodeIds: [...nodes, ...own].map(n => n.id), nodes: own }, { id: 'w', diagram: d, nodeIds: nodes.map(n => n.id) }] });
  for (const [m, gone, kept, parents] of [
    // a use case view's own subject holding a model use case and its association, and a use case of its own
    [two('uml.use-case', [{ id: 'a', type: 'uml.Actor', label: 'Clerk' }, { id: 'u', type: 'uml.UseCase', label: 'Buy', parent: 's' }],
      [{ id: 's', type: 'uml.Subject', label: 'Shop' }, { id: 'o', type: 'uml.UseCase', label: 'Own', parent: 's' }], [{ id: 'as1', type: 'uml.Association', from: 'a', to: 'u' }]), 's', ['a', 'u'], { u: undefined }],
    // an activity view's own partitions, nested in a model partition: the model action goes to the model partition
    [two('uml.activity', [{ id: 'M', type: 'uml.ActivityPartition', label: 'Shop' }, { id: 'x', type: 'uml.Action', label: 'Pack', parent: 'P2' }],
      [{ id: 'P1', type: 'uml.ActivityPartition', label: 'Floor', parent: 'M' }, { id: 'P2', type: 'uml.ActivityPartition', label: 'Shelf', parent: 'P1' }]), 'P1', ['M', 'x'], { x: 'M' }],
    // a state machine view's own composite state: a model state in one of its regions
    [two('uml.state-machine', [{ id: 'i', type: 'uml.State', label: 'Idle' }, { id: 'k', type: 'uml.State', label: 'Packing', parent: 'r1' }],
      [{ id: 'S', type: 'uml.State', label: 'Busy', members: [{ id: 'r1', type: 'uml.Region', label: 'A' }, { id: 'r2', type: 'uml.Region', label: 'B' }] }]), 'S', ['i', 'k'], { k: undefined }]]) {
    const d = m.views[0].diagram, a = apply(m, [{ op: 'delete', id: gone }]);
    assert.deepEqual(a.nodes.map(n => n.id), kept, `${d}: every model node kept`);
    assert.deepEqual(a.views[1].nodeIds, m.views[1].nodeIds, `${d}: the other view as it was`);
    assert.deepEqual(a.edges, m.edges, `${d}: the model's lines kept`);
    Object.entries(parents).forEach(([id, p]) => assert.equal(a.nodes.find(n => n.id === id).parent, p, `${d}: ${id}'s owner`));
    assert.ok(!(a.views[0].nodes || []).some(n => n.id === gone), `${d}: the own node is gone`);
    assert.deepEqual(validate(a).filter(p => p.level === 'error'), [], d);
    // the canvas's Delete on it, through the type's remove where it has one, gives the same
    const T = diagramOf(m.views[0]), r = T.edits && T.edits.remove ? T.edits.remove(m, m.views[0], [gone], false) : null;
    const b = apply(m, r == null ? [{ op: 'delete', id: gone }] : Array.isArray(r) ? r : r.commands);
    assert.deepEqual(b.nodes.map(n => n.id), kept, `${d}: Delete keeps the model`);
  }
  // a model node deleted takes what one view holds under it, as before, and that view's model node under it is lifted out
  const m = two('uml.activity', [{ id: 'M', type: 'uml.ActivityPartition', label: 'Shop' }, { id: 'x', type: 'uml.Action', label: 'Pack', parent: 'P' }], [{ id: 'P', type: 'uml.ActivityPartition', label: 'Floor', parent: 'M' }]);
  const a = apply(m, [{ op: 'delete', id: 'M' }]);
  assert.deepEqual([a.nodes.map(n => [n.id, n.parent]), a.views[0].nodes], [[['x', undefined]], []]);
});

// audit 24: a drop out of every box re-owns a card to the view's subject, and that subject may be one this view alone holds:
// the rule is checked on the owner the drop gives, not on the box under it (canvas/edit.js drop)
test('audit 24: the canvas refuses a drop that puts a model card under a view\'s subject only that view holds, out of a box as onto it', async () => {
  await import('../src/typed/edit.js'); // the hooks the canvas runs (C4's static views have no owner hook: the core drop runs)
  const own = { id: 'own', type: 'c4.SoftwareSystem', label: 'Own system' };
  const mk = (subject, nodes = [own]) => ({ schemaVersion: 2, nodes: [{ id: 'k', type: 'c4.Container', label: 'Kiosk', parent: 'web' }, { id: 'web', type: 'c4.SoftwareSystem', label: 'Web' }],
    edges: [], views: [{ id: 'v', diagram: 'c4.container', subject, nodeIds: ['own', 'web', 'k'], nodes }, { id: 'w', diagram: 'c4.container', subject: 'web', nodeIds: ['web', 'k'] }] });
  const drop = (m, id, into, from) => { let out = null; const said = [];
    const I = typedEditor({ root: { addEventListener() {} }, stage: { addEventListener() {} }, can: () => true, say() {}, status: s => said.push(s), emit: c => { out = c; }, view: () => 'v', model: () => m,
      picked: () => [], sel: () => null, geo: () => ({ byId: {}, nodes: [] }), cam: () => null, focus() {}, touch() {} });
    I.drop({ id, col: 0, row: 0, x: 0, y: 0, w: 50, h: 20 }, { col: 1, row: 0, x: 400, y: 10 }, into, from); return { out, said }; };
  const m = mk('own');
  for (const into of [null, 'own']) { const r = drop(m, 'k', into, 'web'); // out of web onto the canvas, or onto the own box
    assert.equal(r.out, null, `into ${into}: nothing emitted`); assert.match(r.said.join(), /Own system lives in this view only/, `into ${into}`); }
  // what stays: the view's own card goes under its own subject, and a model card under a model box
  const t = mk('own', [own, { id: 'o2', type: 'c4.Container', label: 'Own container', parent: 'web' }]); t.views[0].nodeIds.push('o2');
  const r2 = drop(t, 'o2', null, 'web'); assert.deepEqual(r2.out && r2.out[0], { op: 'reparent', id: 'o2', parent: 'own' });
  assert.equal(apply(t, r2.out).views[0].nodes[1].parent, 'own');
  const r3 = drop(t, 'k', 'web', 'own'); assert.deepEqual(r3.out && r3.out[0], { op: 'reparent', id: 'k', parent: 'web' });
});
