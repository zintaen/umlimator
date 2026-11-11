/* ---------- commands: apply() and references() (work package 1.6) ----------
   apply(model, ops) runs a transaction, one command or a list, on a copy of the model and returns the new model; the
   one given is never changed. A command that cannot run (an id that names nothing, a parent that would hold itself)
   throws, and none of the transaction's commands is applied. Undo is the model before: history() keeps those, and
   undo and redo give back byte-identical models (risks.md P3: snapshots, until a model passes 2 MB).

   The commands, each { op, ... }:
     set       { id | view, path, value }  a field of an element or a view; path 'label', 'props.visibility' or a list
                                            of keys (['present', 'order.lines', 'rows']); value undefined removes it
     add       { element, to?, index?, view? }  a node (no from/to), an edge, or with `to` a member of that element, at
                                            `index` (default: last); `view` also shows it there
     hide      { id, view }                 takes it out of one view: its place, its pin, its `present`, the view's
                                            lines to it; the model keeps it (risks.md E5)
     delete    { id }                       takes it out of the model, with all that names it (references())
     reparent  { id, parent }               a new owner, or none with null
   An element is a node, a member, a model or view edge with an id, or a fragment: the one id space of schema version 2. */

const isObj = x => x && typeof x === 'object' && !Array.isArray(x), arr = x => (Array.isArray(x) ? x : []);
const keysOf = path => (Array.isArray(path) ? path.map(String) : String(path ?? '').split('.')).filter(k => k !== '');
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']); // never a key a command writes (risks.md M3)

/* Every element by id: { x, list, owner, kind }, list the array it is in, owner the element whose member it is */
function index(m) {
  const at = new Map();
  const put = (x, list, kind, owner) => { if (!isObj(x) || typeof x.id !== 'string') return;
    if (!at.has(x.id)) at.set(x.id, { x, list, kind, owner }); arr(x.members).forEach(y => put(y, x.members, 'member', x)); };
  arr(m.nodes).forEach(n => put(n, m.nodes, 'node'));
  arr(m.edges).forEach(e => put(e, m.edges, 'edge'));
  arr(m.views).forEach(v => { if (!isObj(v)) return; arr(v.edges).forEach(e => put(e, v.edges, 'edge')); arr(v.fragments).forEach(f => put(f, v.fragments, 'fragment')); });
  return at;
}

/* Where a model names any of `ids` (a Set): [{ path, kind }], kind one of end, parent, part, view, pin, present,
   override, subject, story, lens, rule. The element's own entry and its members are not listed. */
function refs(m, ids) {
  const out = [], say = (path, kind) => out.push({ path, kind }), has = id => typeof id === 'string' && ids.has(id);
  const element = (x, at) => { if (!isObj(x)) return;
    if (has(x.parent)) say(at + '.parent', 'parent');
    if (typeof x.from === 'string' || typeof x.to === 'string') ['from', 'to'].forEach(k => { if (has(x[k])) say(`${at}.${k}`, 'end');
      if (has((((x.props || {}).ends || {})[k] || {}).part)) say(`${at}.props.ends.${k}.part`, 'part'); });
    arr(x.members).forEach((y, j) => element(y, `${at}.members[${j}]`)); };
  arr(m.nodes).forEach((n, i) => element(n, `nodes[${i}]`));
  arr(m.edges).forEach((e, i) => element(e, `edges[${i}]`));
  arr(m.views).forEach((v, i) => { if (!isObj(v)) return; const at = `views[${i}]`;
    arr(v.nodeIds).forEach((id, j) => { if (has(id)) say(`${at}.nodeIds[${j}]`, 'view'); });
    arr(v.edges).forEach((e, j) => { if (has(e)) say(`${at}.edges[${j}]`, 'view'); else element(e, `${at}.edges[${j}]`); });
    arr(v.fragments).forEach((f, j) => element(f, `${at}.fragments[${j}]`));
    [['layout', 'pin'], ['present', 'present'], ['nodeOverrides', 'override']].forEach(([k, kind]) => Object.keys(isObj(v[k]) ? v[k] : {}).forEach(id => { if (has(id)) say(`${at}.${k}.${id}`, kind); }));
    if (has(v.subject)) say(at + '.subject', 'subject');
    arr(v.tour).forEach((id, j) => { if (has(id)) say(`${at}.tour[${j}]`, 'view'); });
    arr(v.stepIds).forEach((id, j) => { if (has(id)) say(`${at}.stepIds[${j}]`, 'view'); });
    ['containers', 'lanes'].forEach(k => arr(v[k]).forEach((b, j) => arr(isObj(b) && b.nodeIds).forEach((id, n) => { if (has(id)) say(`${at}.${k}[${j}].nodeIds[${n}]`, 'view'); })));
    arr(v.intake).forEach((x, j) => { if (isObj(x) && has(x.to)) say(`${at}.intake[${j}]`, 'view'); }); });
  arr(m.stories).forEach((s, i) => arr(isObj(s) && s.steps).forEach((st, j) => { if (!isObj(st)) return; const at = `stories[${i}].steps[${j}]`;
    if (has(st.select)) say(at + '.select', 'story');
    arr(st.highlight).forEach((id, k) => { if (has(id)) say(`${at}.highlight[${k}]`, 'story'); });
    arr(st.tour).forEach((id, k) => { if (has(id)) say(`${at}.tour[${k}]`, 'story'); });
    if (isObj(st.camera) && has(st.camera.card)) say(at + '.camera.card', 'story'); }));
  const picks = (sel, at, kind) => { if (!isObj(sel)) return;
    if (has(sel.id)) say(at + '.id', kind); else arr(sel.id).forEach((id, k) => { if (has(id)) say(`${at}.id[${k}]`, kind); });
    picks(sel.not, at + '.not', kind); };
  arr(m.lenses).forEach((l, i) => isObj(l) && picks(l.pick, `lenses[${i}].pick`, 'lens'));
  arr(m.rules).forEach((r, i) => isObj(r) && ['from', 'to'].forEach(k => picks(r[k], `rules[${i}].${k}`, 'rule')));
  return out;
}

/* references(model, id): where the model names an element, other than the element itself, as paths like
   'views[0].nodeIds[2]' with what each is. A host with its own store uses it to delete what apply() would. */
export function references(model, id) {
  return refs(isObj(model) ? model : {}, new Set([id]));
}

/* the parent of a value at a path: ['views', 0, 'nodeIds', 2] style keys from 'views[0].nodeIds[2]' */
const steps = path => path.replace(/\[(\d+)\]/g, '.$1').split('.');
const parentAt = (m, path) => { const k = steps(path); let o = m; for (const s of k.slice(0, -1)) o = o[s]; return [o, k[k.length - 1]]; };

function remove(m, ids) { // ids: a Set of elements already gone from their lists; clears every reference to them
  const drop = new Map(), out = (a, k) => { if (!drop.has(a)) drop.set(a, new Set()); drop.get(a).add(+k); }; // array -> indexes to take out
  for (const { path, kind } of refs(m, ids)) {
    const [o, k] = parentAt(m, path);
    if (kind === 'end') { const [list, i] = parentAt(m, path.slice(0, path.lastIndexOf('.'))); out(list, i); } // a line without an id to it goes too
    else if (Array.isArray(o)) out(o, k);
    else if (kind === 'lens' || kind === 'rule') o[k] = []; // it picked what is gone: now it picks nothing, not everything
    else if (kind === 'story' && k === 'card') { const [st, cam] = parentAt(m, path.slice(0, -'.card'.length)); delete st[cam]; } // the step shows the whole view
    else delete o[k];
  }
  drop.forEach((ks, a) => [...ks].sort((x, y) => y - x).forEach(k => a.splice(k, 1)));
}

function run(m, c) {
  if (!isObj(c)) throw new TypeError('a command is an object with an op');
  const at = index(m), need = id => { const e = at.get(id); if (!e) throw new Error(`${c.op}: "${id}" is not an element`); return e; };
  const viewOf = id => { const v = arr(m.views).find(x => isObj(x) && x.id === id); if (!v) throw new Error(`${c.op}: "${id}" is not a view`); return v; };
  switch (c.op) {
    case 'set': {
      const keys = keysOf(c.path);
      if (!keys.length || keys.some(k => UNSAFE.has(k))) throw new Error(`set: ${JSON.stringify(c.path)} is not a field`);
      if (keys[0] === 'id' || (c.view == null && keys[0] === 'members')) throw new Error(`set: ${keys[0]} is not set; ids stay, members change by add and delete`);
      let o = c.view != null ? viewOf(c.view) : need(c.id).x;
      for (const k of keys.slice(0, -1)) { if (!isObj(o[k])) { if (c.value === undefined) return; o[k] = {}; } o = o[k]; }
      const last = keys[keys.length - 1];
      if (c.value === undefined) delete o[last]; else o[last] = structuredClone(c.value);
      return;
    }
    case 'add': {
      const x = structuredClone(c.element);
      if (!isObj(x) || typeof x.id !== 'string' || !x.id) throw new Error('add: an element needs an id');
      if (x.id.includes('->')) throw new Error(`add: id "${x.id}" contains "->"`);
      const fresh = y => { if (at.has(y.id)) throw new Error(`add: id "${y.id}" is used already`); arr(y.members).forEach(fresh); }; fresh(x);
      const list = c.to != null ? (need(c.to).x.members ||= []) : x.from != null || x.to != null ? (m.edges ||= []) : (m.nodes ||= []);
      list.splice(c.index == null ? list.length : Math.max(0, Math.min(list.length, c.index)), 0, x);
      const v = c.view != null && c.to == null ? viewOf(c.view) : null; // a member shows with its owner
      if (v && list === m.edges) { if (Array.isArray(v.edges)) v.edges.push(x.id); } else if (v) (v.nodeIds ||= []).push(x.id);
      return;
    }
    case 'hide': {
      const v = viewOf(c.view), e = need(c.id), id = c.id, ends = new Set();
      if (e.kind === 'edge' && !Array.isArray(v.edges)) throw new Error(`hide: view "${c.view}" shows every line between its cards; take out a card, or list its lines`);
      const own = x => { ends.add(x.id); arr(x.members).forEach(y => isObj(y) && own(y)); }; own(e.x); // a line to one of its members leaves the view with it
      v.nodeIds = arr(v.nodeIds).filter(n => n !== id);
      if (Array.isArray(v.edges)) v.edges = v.edges.filter(x => { const l = typeof x === 'string' ? (at.get(x) || {}).x : x;
        return !(x === id || (isObj(l) && (l.id === id || ends.has(l.from) || ends.has(l.to)))); });
      ['layout', 'present', 'nodeOverrides'].forEach(k => { if (isObj(v[k])) delete v[k][id]; });
      return;
    }
    case 'delete': {
      const e = need(c.id), gone = new Set();
      const take = id => { const r = at.get(id); if (!r || gone.has(id)) return; gone.add(id);
        arr(r.x.members).forEach(y => isObj(y) && take(y.id));
        for (const [k, o] of at) if (o.kind !== 'edge' && o.kind !== 'fragment' && o.x.parent === id) take(k); }; // what it owns goes with it
      take(c.id);
      // lines to what is gone go too, model and view lines alike; a line whose parent is gone (a message in a deleted
      // operand) stays, outside it
      for (const [k, o] of at) if (o.kind === 'edge' && (gone.has(o.x.from) || gone.has(o.x.to))) gone.add(k);
      for (const [k, o] of at) if (gone.has(k) && !(o.owner && gone.has(o.owner.id))) { const i = o.list.indexOf(o.x); if (i >= 0) o.list.splice(i, 1); }
      for (const [k, o] of at) if (!gone.has(k) && gone.has(o.x.parent) && o.kind === 'edge') delete o.x.parent;
      remove(m, gone);
      return;
    }
    case 'reparent': {
      const e = need(c.id);
      if (c.parent == null) { delete e.x.parent; return; }
      const p = need(c.parent);
      if (p.kind === 'edge') throw new Error(`reparent: "${c.parent}" is a line, not an owner`);
      const up = id => { const r = at.get(id); return r ? r.x.parent ?? (r.owner && r.owner.id) : undefined; }; // its owner: a parent, or the element it is a member of
      for (let o = c.parent, seen = new Set(); o != null && !seen.has(o); seen.add(o), o = up(o)) if (o === c.id) throw new Error(`reparent: "${c.id}" would end up inside itself`);
      e.x.parent = c.parent;
      return;
    }
    default: throw new Error(`${JSON.stringify(c.op)} is not a command (set, add, hide, delete, reparent)`);
  }
}

/* apply(model, ops): the model after a transaction (a command, or a list of them run in order). See above. */
export function apply(model, ops) {
  if (!isObj(model)) throw new TypeError('apply() needs a model');
  const m = structuredClone(model);
  for (const c of Array.isArray(ops) ? ops : [ops]) run(m, c);
  return m;
}
