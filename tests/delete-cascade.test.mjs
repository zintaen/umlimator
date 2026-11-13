// Every single delete over every example (the atlas among them) and every target (docs/diagrams/examples): Shift + Delete
// on an element, through the remove hook of each view that draws it (the canvas's default, a bare delete, where a view's
// type has none), and Delete (out of the view) in each view that draws it, leaves no new validate() error with every type's rules loaded (notes/stage-6.md 6.1, closed by the
// follow-up). Ids are found by label where a case is named, so a rename in the examples breaks only that case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { diagramOf } from '../src/core/registry.js';
import { apply } from '../src/core/apply.js';
import { validate } from '../src/map/validate.js';
import '../src/map/typed.js';
import { targets } from '../docs/diagrams/examples/check.mjs';

const uml = new URL('../src/uml/', import.meta.url);
for (const f of readdirSync(uml).filter(f => f.endsWith('.js')).sort()) await import(new URL(f, uml)); // every type's rules and hooks

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
// the canvas's Delete (src/canvas/edit.js remove): what the view owns goes from the model, a listed line or a card is hidden
function hideOf(v, id, m) {
  if ([...arr(v.nodes), ...arr(v.edges), ...arr(v.fragments)].some(x => x && x.id === id)) return [{ op: 'delete', id }];
  const line = arr(m.edges).some(e => e.id === id); // a member is not hidden (apply() refuses it, so nothing changes)
  return line && !Array.isArray(v.edges) || !line && !arr(m.nodes).some(n => n.id === id) ? null : [{ op: 'hide', id, view: v.id }];
}
// Shift + Delete (fromModel), or Delete, on id in view v (null: no view draws it, or one with no hook): the commands, or null when refused
function gesture(m, v, id, fromModel = true) {
  let r = v && hookOf(v) ? hookOf(v)(m, v, [id], fromModel) : null;
  if (r != null && Array.isArray(r.pick)) r = r.then(0);
  if (r == null) { const c = fromModel ? [{ op: 'delete', id }] : hideOf(v, id, m); return c && { commands: c }; }
  return r.error != null ? null : Array.isArray(r) ? { commands: r } : r;
}
const errors = m => validate(m).filter(p => p.level === 'error').map(p => p.message);

test('no single delete or hide of any element of any example, target or the atlas leaves a new validate() error', () => {
  const bad = []; let n = 0;
  for (const [name, m] of files()) {
    const was = new Set(errors(m)), views = drawn(m), ids = new Set();
    JSON.stringify(m, (k, x) => { if (x && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string') ids.add(x.id); return x; });
    for (const id of ids) {
      const on = views.filter(([, s]) => s.has(id)).map(([v]) => v), ways = on.filter(hookOf);
      if (ways.length < on.length || !on.length) ways.push(null);
      for (const [v, fromModel] of [...ways.map(v => [v, true]), ...on.map(v => [v, false])]) { const g = gesture(m, v, id, fromModel); if (!g) continue;
        let after; try { after = apply(m, g.commands); } catch (err) { if (v || !/is not an element/.test(err.message)) throw err; continue; } // a bare delete of an id apply() does not delete (a view's, a story's)
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
  assert.ok(out.length > 1, 'the connector takes the messages it carries');
  assert.deepEqual(errors(apply(cm, out)).filter(e => e.includes('message-link')), []);
});

test('composite structure: a view whose subject is deleted is a warning, not an error; a subject not listed is still an error', () => {
  const m = ex('order-service-structure.json'), v = m.views.find(x => x.diagram === 'uml.composite-structure');
  const p = validate(apply(m, { op: 'delete', id: v.subject })).filter(x => x.rule === 'subject-shown');
  assert.deepEqual(p.map(x => x.level), ['warning']); assert.match(p[0].message, /has no subject/);
  const w = structuredClone(m); w.views.find(x => x.id === v.id).nodeIds = w.views.find(x => x.id === v.id).nodeIds.filter(id => id !== v.subject);
  assert.deepEqual(validate(w).filter(x => x.rule === 'subject-shown').map(x => x.level), ['error']);
});
