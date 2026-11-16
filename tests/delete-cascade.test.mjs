// Every single delete over every example (the atlas among them) and every target (docs/diagrams/examples): Shift + Delete
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
// still open (risks.md M15, for the DFD type's remove hook): deleting or hiding a level's entity, store, process or flow can
// leave a parent process that no longer balances with its level
const OPEN = /^dfd-balance: /;

test('no single delete or hide of any element of any example, target or the atlas leaves a new validate() error', () => {
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
        n++; errors(after).filter(e => !was.has(e) && !OPEN.test(e)).forEach(e => bad.push(`${name}: ${id}${v ? ` in ${v.id}` : ''}${fromModel ? '' : ' (Delete)'}: ${e}`)); } }
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
