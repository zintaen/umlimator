import { diagramOf, propRefs } from './registry.js';
import { copyOf, lineNames, namesOf, listOf, jsonText } from './model.js';
/* ---------- commands: apply() and references() (work package 1.6) ----------
   apply(model, commands) runs a transaction, one command or a list run in order, on a copy of the model and returns the
   new model; the one given is never changed. A command that cannot run throws, and none of the transaction is applied.
   Undo is the model before: history() keeps those, so undo and redo give back byte-identical models (risks.md P3:
   snapshots, until a model passes 2 MB).

   The commands, each { op, ... }:
     set       { id | view, path, value }   a field of an element or a view. path: 'label', 'props.visibility', or a
                                             list of keys when a key holds a dot (['present', 'order.total', 'rows']);
                                             value undefined removes it. Through objects only; id, members, parent,
                                             from and to change by their own commands. A label set also sets what
                                             a type's refs say is `named` as the element and was (C4's instances)
     add       { element, owner?, index?, view? }  a node (no from/to), a line, or with `owner` a member, at `index`
                                             among the owner's members, else among the view's; `view` shows it there;
                                             in 'view' (not 'model'): in its edges, nodes or fragments (registry.js)
     move      { id, index, owner? }         a member to another place among its owner's members, or to a new owner
               { id, view, index }           an element or line to another place in a view's order (its nodeIds or edges)
     hide      { id, view }                  out of one view, with all the view says of it: its place, pin, present,
                                             box, tour, the view's lines to it, the story steps on that view (on
                                             the lines to it it draws no more too, audit 36); the model
                                             keeps it (risks.md E5). A line that lives only in that view goes with it
                                             (a later delete of it in the transaction is passed over, audit 32).
                                             The view's subject (or what owns it) is refused (audit 17)
     delete    { id }                        out of the model, with its members, what it owns, the lines to them, and
                                             every place that names them (references()). One already gone in the same
                                             transaction is passed over, so a selection deletes in one transaction (E2).
                                             What it held and stays goes to its nearest owner left. A type's refs:
                                             'cascade' takes what names it; 'drop' takes it out of a list; with
                                             'empties', an element whose list it empties goes too (audit 19)
     reparent  { id, parent }                a new owner by `parent`, or none with parent null
     addView   { view, index? }              a view, added to views at index (else at the end); refused when its id is
                                             a view's already, or it is not an object with a string id. Nothing else is
                                             checked: validate() says what it lacks (notes/milestone-2.md §6.2)
   An element is a node, a member, a model line or a view's own line or item with an id, or a fragment (schema version 2's
   id space). */

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x), arr = x => (Array.isArray(x) ? x : []);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']); // never a field of an element or view (risks.md M3)
// a key below the first is an own key, whatever its name (layout.constructor, present.__proto__: an id): written as
// one, never through a prototype, so no path reaches Object.prototype
const putOwn = (o, k, value) => Object.defineProperty(o, k, { value, writable: true, enumerable: true, configurable: true });
const isLine = x => isObj(x) && (x.from != null || x.to != null);
const dig = (x, path) => path.split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), x);

/* Every element by id: { x, list, kind, owner, view } (owner: the element whose member it is; view: the view a line or
   fragment of its own lives in) */
function index(m) {
  const at = new Map(), seen = new Set(); // seen: each element walked once, so a host's member that holds its owner ends (audit 28)
  // members on a stack of its own, in the order a recursion took: thousands deep are read, never a stack overflow (audit 35)
  const put = (x0, list0, kind0, owner0, view) => { for (const s = [[x0, list0, kind0, owner0]]; s.length;) { const [x, list, kind, owner] = s.pop();
    if (!isObj(x) || typeof x.id !== 'string' || seen.has(x)) continue; seen.add(x);
    if (!at.has(x.id)) at.set(x.id, { x, list, kind, owner, view }); const ms = arr(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], x.members, 'member', x]); } };
  arr(m.nodes).forEach(n => put(n, m.nodes, 'node'));
  arr(m.edges).forEach(e => put(e, m.edges, 'edge'));
  arr(m.views).forEach(v => { if (!isObj(v)) return; arr(v.nodes).forEach(n => put(n, v.nodes, 'node', undefined, v)); // a card of one view only
    arr(v.edges).forEach(e => put(e, v.edges, 'edge', undefined, v)); arr(v.fragments).forEach(f => put(f, v.fragments, 'fragment', undefined, v));
    ['changes', 'constraints'].forEach(k => arr(isObj(v.timeline) && v.timeline[k]).forEach(c => put(c, v.timeline[k], 'time', undefined, v))); });
  return at;
}

/* Where a model names any of `ids` (a Set): [{ path, kind }], path a list of keys from the model down. Kinds: end, parent,
   part, prop, view, pin, present, override, subject, story, lens, rule. Neither the element itself nor its members are listed.
   only(viewIndex): look in those views and their story steps only (hide), else in all of the model; top: also in what
   is not a view's (its nodes and lines, lenses, rules), by default when only is not given. */
function refs(m, ids, only, top = !only) {
  const out = [], say = (path, kind) => out.push({ path, kind }), has = id => typeof id === 'string' && ids.has(id), up = new Set();
  // a member's path is kept as a link to its owner's, { p, j }, and written out only when said; members on a stack of its own,
  // in the order a recursion took: thousands deep are read, never a stack overflow (audit 35)
  const keys = a => { const ks = []; for (; !Array.isArray(a); a = a.p) ks.push(a.j, 'members'); return [...a, ...ks.reverse()]; };
  const element = (x0, at0, line0) => { const todo = [() => one(x0, at0, line0)]; while (todo.length) todo.pop()();
  function one(x, a, line) { if (!isObj(x) || up.has(x)) return; // line: x is a line, not a node or member that has a field named to; up: the elements x is a member of (a host's cycle ends: audit 28)
    let kp; const at = () => (kp ||= keys(a)); // written out when said only
    if (has(x.parent)) say([...at(), 'parent'], 'parent');
    if (line) ['from', 'to'].forEach(k => { if (has(x[k])) say([...at(), k], 'end');
      if (has((((x.props || {}).ends || {})[k] || {}).part)) say([...at(), 'props', 'ends', k, 'part'], 'part'); });
    Object.keys(propRefs(x.type)).forEach(p => { const v = dig(x, p), ks = p.split('.');
      if (has(v)) say([...at(), ...ks], 'prop'); else arr(v).forEach((id, j) => { if (has(id)) say([...at(), ...ks, j], 'prop'); }); });
    up.add(x); todo.push(() => up.delete(x)); const ms = arr(x.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) todo.push(() => one(ms[j], { p: a, j }, false)); } };
  if (top) { arr(m.nodes).forEach((n, i) => element(n, ['nodes', i], false)); arr(m.edges).forEach((e, i) => element(e, ['edges', i], true)); }
  const vids = new Set(), views = new Set(arr(m.views).map(v => isObj(v) && v.id));
  arr(m.views).forEach((v, i) => { if (!isObj(v) || (only && !only(i))) return; const at = ['views', i]; vids.add(v.id);
    ['nodeIds', 'tour', 'stepIds'].forEach(k => arr(v[k]).forEach((id, j) => { if (has(id)) say([...at, k, j], 'view'); }));
    arr(v.nodes).forEach((n, j) => element(n, [...at, 'nodes', j], false));
    arr(v.edges).forEach((e, j) => { if (has(e)) say([...at, 'edges', j], 'view'); else element(e, [...at, 'edges', j], true); });
    arr(v.fragments).forEach((f, j) => element(f, [...at, 'fragments', j], false));
    ['changes', 'constraints'].forEach(k => arr(isObj(v.timeline) && v.timeline[k]).forEach((c, j) => isObj(c) && ['lifeline', 'from', 'to'].forEach(f => { if (has(c[f])) say([...at, 'timeline', k, j, f], 'end'); })));
    [['layout', 'pin'], ['present', 'present'], ['nodeOverrides', 'override']].forEach(([k, kind]) => Object.keys(isObj(v[k]) ? v[k] : {}).forEach(id => { if (has(id)) say([...at, k, id], kind); }));
    if (has(v.subject)) say([...at, 'subject'], 'subject');
    if (top) ['parent', 'node'].forEach(k => { if (has(v[k]) && !(k === 'parent' && views.has(v[k]))) say([...at, k], 'parent'); }); // a view opened from a card (a parent that is also a view's id names that view)
    ['containers', 'lanes'].forEach(k => arr(v[k]).forEach((b, j) => arr(isObj(b) && b.nodeIds).forEach((id, n) => { if (has(id)) say([...at, k, j, 'nodeIds', n], 'view'); })));
    arr(v.intake).forEach((x, j) => { if (isObj(x) && has(x.to)) say([...at, 'intake', j], 'view'); }); });
  // a step's select and highlight: an id or a Ref (a line's Ref names several edges: it goes with any of them)
  const named = x => has(x) || isObj(x) && x.type !== 'container' && (has(x.id) || has(x.node) || arr(x.ids).some(has));
  arr(m.stories).forEach((s, i) => arr(isObj(s) && s.steps).forEach((st, j) => { if (!isObj(st) || (only && !vids.has(st.view))) return; const at = ['stories', i, 'steps', j];
    if (named(st.select)) say([...at, 'select'], 'story');
    ['highlight', 'tour'].forEach(k => arr(st[k]).forEach((id, n) => { if (named(id)) say([...at, k, n], 'story'); }));
    if (isObj(st.camera) && has(st.camera.card)) say([...at, 'camera'], 'story'); }));
  if (!top) return out;
  const picks = (sel, at, kind) => { if (!isObj(sel)) return;
    if (has(sel.id)) say([...at, 'id'], kind); else arr(sel.id).forEach((id, k) => { if (has(id)) say([...at, 'id', k], kind); });
    picks(sel.not, [...at, 'not'], kind); };
  arr(m.lenses).forEach((l, i) => isObj(l) && picks(l.pick, ['lenses', i, 'pick'], 'lens'));
  arr(m.rules).forEach((r, i) => isObj(r) && ['from', 'to'].forEach(k => picks(r[k], ['rules', i, k], 'rule')));
  return out;
}

/* references(model, id): where the model names an element, other than the element itself: { path, kind }, path a list of
   keys from the model down (['views', 0, 'nodeIds', 2]). A host with a store of its own deletes what apply() would. */
export function references(model, id) {
  const ids = new Set([id]);
  if (!isObj(model)) return refs({}, ids);
  // a host's getter or Proxy that throws: read again in a copy where each value that cannot be read is an empty object in
  // its place, so every path still names the model's own place (audit 25: the host's error was thrown)
  try { return refs(model, ids); } catch { return refs(copyOf(model, {}), ids); }
}

const get = (m, path) => path.reduce((o, k) => o[k], m);

/* takes out what refs() found: an entry of a list, a key of an object; a line without an id to what is gone goes too */
function clear(m, found) {
  const drop = new Map(), out = (a, k) => { if (!drop.has(a)) drop.set(a, new Set()); drop.get(a).add(k); };
  for (const { path, kind } of found) {
    const o = get(m, path.slice(0, -1)), k = path[path.length - 1];
    if (kind === 'end') out(get(m, path.slice(0, -2)), path[path.length - 2]); // the line itself
    else if (Array.isArray(o)) out(o, k);
    else if (kind === 'lens' || kind === 'rule') o[k] = []; // it picked what is gone: now it picks nothing, not everything
    else delete o[k];
  }
  drop.forEach((ks, a) => [...ks].sort((x, y) => y - x).forEach(k => a.splice(k, 1)));
}

/* after a delete or hide: what named a line with no id ("b->c#0", a step's select or highlight) goes with the line, or
   follows it to its new name when lines before it in its list went (names0: lineNames() before). A name counts in one list:
   the model's, named where a view with no edges list is and in what is not a view's; or a view's own, named in that view */
function follow(m, names0, only) {
  names0.forEach((was, L) => {
    const where = i => (!only || only(i)) && listOf(m, i) === L, top = L < 0 && !only;
    let now;
    for (;;) { now = new Map(); namesOf(L < 0 ? m.edges : m.views[L].edges).forEach((l, k) => now.set(l, k));
      const lost = new Set([...was].filter(([, l]) => !now.has(l)).map(([k]) => k)), found = lost.size ? refs(m, lost, where, top) : [];
      if (!found.length) break; clear(m, found); } // a line to a line that went goes too, and may move the names again
    const to = new Map(); was.forEach((l, k) => { const n = now.get(l); if (n && n !== k) to.set(k, n); });
    if (!to.size) return;
    const keys = [], name = x => typeof x === 'string' ? to.get(x) ?? x : !isObj(x) ? x
      : { ...x, ...('id' in x && { id: name(x.id) }), ...('node' in x && { node: name(x.node) }), ...(Array.isArray(x.ids) && { ids: x.ids.map(name) }) };
    for (const { path, kind } of refs(m, new Set(to.keys()), where, top)) { const o = get(m, path.slice(0, -1)), k = path[path.length - 1];
      if (['pin', 'present', 'override'].includes(kind)) keys.push([o, k]); else o[k] = name(o[k]); }
    const vs = keys.map(([o, k]) => o[k]); keys.forEach(([o, k]) => delete o[k]); keys.forEach(([o, k], i) => { o[to.get(k)] = vs[i]; }); // all at once: names may swap
  });
}

/* registry.js ownGuard's rule, kept by apply() too (audit 24): what one view alone holds (its own node, a member of one) owns
   nothing of the model's nor of another view's; it is no owner in the other views, and goes with its view's nodes */
function ownParent(at, op, id, parent, home) {
  const p = at.get(parent); if (!p || !p.view) return;
  let t = p; for (let n = 0; t && t.kind === 'member' && t.owner && n++ < at.size;) t = at.get(t.owner.id);
  if (!t || t.kind !== 'node' || p.view === home) return;
  throw new Error(`${op}: ${jsonText(parent)} lives in view ${jsonText(p.view.id)} only: ${home ? `"${id}", an element of view ${jsonText(home.id)},` : `"${id}", an element of the model,`} cannot go under it`);
}

function checkNew(x, at) { // an element to add: an object with a new id that is not positional, and its members alike
  const seen = new Set(); // on a stack of its own, in the order a recursion took (audit 35)
  for (const s = [[x, () => 'the element']]; s.length;) { const [y, what] = s.pop();
    if (!isObj(y) || typeof y.id !== 'string' || !y.id) throw new Error(`add: ${what()} needs an id`);
    if (y.id.includes('->')) throw new Error(`add: id "${y.id}" contains "->"`);
    if (at.has(y.id) || seen.has(y.id)) throw new Error(`add: id "${y.id}" is used already`);
    seen.add(y.id); if (y.members != null && !Array.isArray(y.members)) throw new Error(`add: members of "${y.id}" is not a list`);
    const ms = arr(y.members); for (let j = ms.length - 1; j >= 0; j--) if (j in ms) s.push([ms[j], () => `member ${j} of "${y.id}"`]); }
}

function run(m, c, gone) {
  if (!isObj(c)) throw new TypeError('a command is an object with an op');
  const at = index(m), need = id => { const e = at.get(id); if (!e) throw new Error(`${c.op}: ${jsonText(id)} is not an element`); return e; };
  const viewOf = id => { const v = arr(m.views).find(x => isObj(x) && x.id === id); if (!v) throw new Error(`${c.op}: ${jsonText(id)} is not a view`); return v; };
  const up = id => { const r = at.get(id); return r ? r.x.parent ?? (r.owner && r.owner.id) : undefined; }; // its owner: a parent, or the element it is a member of
  const inside = (id, of) => { for (let o = of, seen = new Set(); o != null && !seen.has(o); seen.add(o), o = up(o)) if (o === id) return true; return false; };
  const place = (list, i) => { if (i == null) return list.length; if (!Number.isInteger(i)) throw new Error(`${c.op}: index ${jsonText(i)} is not a whole number`); return Math.max(0, Math.min(list.length, i)); };
  switch (c.op) {
    case 'set': {
      if (c.id != null && c.view != null) throw new Error('set: an element (id) or a view, not both');
      const keys = typeof c.path === 'string' ? c.path.split('.') : Array.isArray(c.path) && c.path.every(k => typeof k === 'string') ? c.path : null;
      if (!keys || !keys.length || keys.some(k => k === '') || UNSAFE.has(keys[0])) throw new Error(`set: ${jsonText(c.path)} is not a path of keys`);
      if (c.view == null && ['id', 'members', 'parent', 'from', 'to'].includes(keys[0])) throw new Error(`set: ${keys[0]} changes by its own command (add, move, delete, reparent), not set`);
      if (c.view != null && keys[0] === 'id') throw new Error('set: a view keeps its id');
      let o = c.view != null ? viewOf(c.view) : need(c.id).x;
      for (const k of keys.slice(0, -1)) {
        if (!Object.hasOwn(o, k) || o[k] === undefined) { if (c.value === undefined) return; putOwn(o, k, {}); } // an inherited key (toString) is none
        else if (!isObj(o[k])) throw new Error(`set: ${keys.join('.')} goes through ${k}, which is not an object`);
        o = o[k];
      }
      const last = keys[keys.length - 1], was = o[last];
      if (c.value === undefined) delete o[last]; else putOwn(o, last, copyOf(c.value)); // delete takes an own key only
      if (c.view == null && keys.length === 1 && last === 'label' && was !== undefined) for (const [, r] of at)
        if (r.x !== o && r.x.label === was && Object.entries(propRefs(r.x.type)).some(([p, how]) => /\bnamed\b/.test(how) && dig(r.x, p) === c.id)) {
          if (c.value === undefined) delete r.x.label; else r.x.label = copyOf(c.value); }
      return;
    }
    case 'add': {
      if ('to' in c) throw new Error('add: the owner of a member is `owner`');
      if (c.in != null && c.in !== 'view' && c.in !== 'model') throw new Error(`add: in is 'view' or 'model', not ${jsonText(c.in)}`);
      checkNew(c.element, at);
      const x = copyOf(c.element), owner = c.owner != null ? need(c.owner) : null;
      if (c.in === 'view') {
        if (c.view == null || owner) throw new Error('add: in \'view\' needs a view, and no owner');
        const v = viewOf(c.view), T = diagramOf(v) || {}, pal = arr(T.elements);
        if (x.parent != null) ownParent(at, 'add', x.id, x.parent, v);
        const k = isLine(x) || arr(T.items).includes(x.type) ? 'edges' : !pal.length || pal.some(t => isObj(t) && t.type === x.type) ? 'nodes' : 'fragments';
        if (k === 'edges' && !Array.isArray(v.edges) && arr(m.edges).length) throw new Error(`add: view "${c.view}" shows every line between its cards; list its lines first`);
        const list = (v[k] ||= []);
        if (k === 'nodes') { list.push(x); (v.nodeIds ||= []).splice(place(v.nodeIds, c.index), 0, x.id); } else list.splice(place(list, c.index), 0, x);
        return;
      }
      if (owner && owner.kind !== 'node' && owner.kind !== 'member' && owner.kind !== 'fragment') throw new Error(`add: "${c.owner}" holds no members`);
      if (!owner && x.parent != null) ownParent(at, 'add', x.id, x.parent, undefined);
      const v = c.view != null ? viewOf(c.view) : null, list = owner ? (owner.x.members ||= []) : isLine(x) ? (m.edges ||= []) : (m.nodes ||= []);
      list.splice(owner ? place(list, c.index) : list.length, 0, x);
      if (v && !owner) { const shown = isLine(x) ? (Array.isArray(v.edges) ? v.edges : null) : (v.nodeIds ||= []); // a view that lists no lines shows every line between its cards
        if (shown) shown.splice(place(shown, c.index), 0, x.id); }
      return;
    }
    case 'move': {
      const e = need(c.id);
      if (c.view != null && c.owner != null) throw new Error('move: in a view\'s order (view) or to an owner (owner), not both');
      if (c.view != null) { const v = viewOf(c.view), list = e.kind === 'edge' ? arr(v.edges) : arr(v.nodeIds), i = list.findIndex(y => y === c.id || (isObj(y) && y.id === c.id));
        if (i < 0) throw new Error(`move: "${c.id}" is not in view "${c.view}"`);
        const [y] = list.splice(i, 1); list.splice(place(list, c.index), 0, y); return; }
      if (e.kind !== 'member') throw new Error(`move: "${c.id}" is not a member; with view, it moves in a view's order`);
      const to = c.owner != null ? need(c.owner) : { x: e.owner, kind: 'node' };
      if (to.kind !== 'node' && to.kind !== 'member' && to.kind !== 'fragment') throw new Error(`move: "${c.owner}" holds no members`);
      if (inside(c.id, to.x.id)) throw new Error(`move: "${c.id}" would end up inside itself`);
      if (c.owner != null) ownParent(at, 'move', c.id, c.owner, e.view); // as reparent and add: a model member goes under no view's own node (audit 35)
      e.list.splice(e.list.indexOf(e.x), 1); const list = (to.x.members ||= []); list.splice(place(list, c.index), 0, e.x);
      return;
    }
    case 'hide': {
      const v = viewOf(c.view), vi = m.views.indexOf(v), e = need(c.id);
      if (e.kind === 'member') throw new Error(`hide: "${c.id}" is a member, shown with its owner: collapse its compartment with set present, or delete it`);
      if (e.view) throw new Error(`hide: "${c.id}" lives only in view "${e.view.id}": delete it`);
      if (e.kind === 'edge' && !Array.isArray(v.edges)) throw new Error(`hide: view "${c.view}" shows every line between its cards; hide a card, or list its lines`);
      const names0 = lineNames(m);
      const ids = new Set(), own = x0 => { for (const s = [x0], seen = new Set(); s.length;) { const x = s.pop(); if (seen.has(x)) continue; seen.add(x); ids.add(x.id); // a stack: thousands deep (audit 35)
        arr(x.members).forEach(y => isObj(y) && typeof y.id === 'string' && s.push(y)); } }; own(e.x);
      if (ids.has(v.subject)) throw new Error(`hide: "${v.subject}" is the subject of view "${c.view}": change the view's subject, or delete it from the model (no command deletes a view)`); // audit 17, 18
      // the lines that go with it, worked out whole before the view's list is filtered, whatever order it lists them in (audit 37):
      // the model lines to it, which the view draws no more, the view's own lines to it, and lines to those lines (audit 36).
      // What names them in this view (a story step's select or highlight) goes too, as the element's own
      // A view's own line also goes with what a type's refs cascade it on (a reply with its call), as a delete takes it (audit 66)
      { const to = new Map(), put = (k, id) => { if (typeof k === 'string') (to.get(k) || to.set(k, []).get(k)).push(id); };
        [...arr(m.edges), ...arr(v.edges)].forEach(l => { if (isObj(l) && typeof l.id === 'string') [l.from, l.to].forEach(k => put(k, l.id)); });
        arr(v.edges).forEach(l => { if (isObj(l) && typeof l.id === 'string') Object.entries(propRefs(l.type)).forEach(([p, how]) => { if (/\bcascade\b/.test(how)) [].concat(dig(l, p)).forEach(k => put(k, l.id)); }); });
        for (const q = [...ids]; q.length;) arr(to.get(q.pop())).forEach(k => { if (!ids.has(k)) { ids.add(k); q.push(k); } }); }
      const ends = l => isObj(l) && (ids.has(l.from) || ids.has(l.to) || (typeof l.id === 'string' && ids.has(l.id)));
      // a line the view holds goes for good: a later delete of it in this transaction finds it gone, as after a delete (audit 32)
      const lost = new Set(); // the view's own lines gone for good
      if (Array.isArray(v.edges)) v.edges = v.edges.filter(y => { const l = typeof y === 'string' ? (at.get(y) || {}).x : y, out = y === c.id || ends(l);
        if (out && isObj(l) && typeof l.id === 'string') { ids.add(l.id); if (l === y) { gone.add(l.id); lost.add(l.id); } } return !out; });
      // a prop names model elements, kept, but for an interaction use's covers: lifelines of its view (audit 14)
      clear(m, refs(m, ids, i => i === vi).filter(r => !['end', 'parent', 'part'].includes(r.kind) && (r.kind !== 'prop' || r.path[r.path.length - 2] === 'covers')));
      // what names a view's own line gone for good, anywhere, goes as after a delete of it: a class's associationClass (audit 66)
      if (lost.size) clear(m, refs(m, lost));
      follow(m, names0, i => i === vi);
      return;
    }
    case 'delete': {
      if (!at.has(c.id) && gone.has(c.id)) return; // gone with an earlier command of this transaction
      need(c.id); const now = new Set(), kids = new Map(), names0 = lineNames(m);
      for (const [k, o] of at) if ((o.kind === 'node' || o.kind === 'member') && o.x.parent != null) { if (!kids.has(o.x.parent)) kids.set(o.x.parent, []); kids.get(o.x.parent).push(k); }
      // what one view alone holds (its own node, a member of one): a model element in it is no part of it (audit 23)
      const hc = new Map(), held = id => { if (hc.has(id)) return hc.get(id); const way = []; let r = at.get(id), h; // once an id: a member chain walked once
        for (let n = 0; r && !hc.has(r.x.id) && r.owner && n++ < at.size;) { way.push(r.x.id); r = at.get(r.owner.id); }
        h = !r ? false : hc.has(r.x.id) ? hc.get(r.x.id) : !!(r.view && r.kind === 'node'); [...way, ...r ? [r.x.id] : []].forEach(k => hc.set(k, h)); hc.set(id, h); return h; };
      const take = id => { for (const s = [id]; s.length;) { const k = s.pop(), r = at.get(k); if (!r || now.has(k)) continue; now.add(k); const h = held(k);
        arr(r.x.members).forEach(y => isObj(y) && s.push(y.id)); arr(kids.get(k)).forEach(x => (!h || held(x)) && s.push(x)); } }; // what it owns goes with it
      take(c.id);
      // lines to what is gone go too, lines to those lines, a timeline's items, and what a type's refs cascade (a reply with its call)
      const by = new Map(); for (const [k, o] of at) [...o.kind === 'edge' ? [o.x.from, o.x.to] : o.kind === 'time' ? [o.x.lifeline, o.x.from, o.x.to] : [],
        ...Object.entries(propRefs(o.x.type)).flatMap(([p, how]) => /\bcascade\b/.test(how) ? [].concat(dig(o.x, p)) : [])].forEach(i => by.has(i) ? by.get(i).push(k) : by.set(i, [k]));
      for (const id of now) arr(by.get(id)).forEach(take); // a Set's loop meets what take adds to it
      // a refs list marked `empties` (a flow's conveyed) takes its element when every id it lists is gone: never left naming nothing (audit 19)
      const lists = []; for (const [k, o] of at) Object.entries(propRefs(o.x.type)).forEach(([p, how]) => { const v = dig(o.x, p);
        if (/\bempties\b/.test(how) && Array.isArray(v) && v.length) lists.push([k, v]); });
      for (let more = true; more;) { more = false; for (const [k, v] of lists) if (!now.has(k) && v.every(i => now.has(i))) { more = true; take(k); for (const id of now) arr(by.get(id)).forEach(take); } }
      // what stays in something gone goes to its nearest owner left; an operand's messages to its fragment's parent
      const above = id => { const r = at.get(id); return r && (r.x.parent ?? (r.owner && above(r.owner.id))); };
      const left = new Map(); // a gone id's nearest owner left, once found
      const leftM = new Map(); // the same for a model element: past what one view alone holds too
      for (const [k, o] of at) if (!now.has(k) && now.has(o.x.parent)) { let p = o.x.parent; const way = [];
        if (!held(k)) { // a model element: to its nearest owner left that no view alone holds, else none (as mindmap's remove lifts a topic, audit 22)
          for (let n = 0; p != null && (now.has(p) || held(p)) && !leftM.has(p) && n++ < at.size;) way.push(p), p = above(p);
          if (leftM.has(p)) p = leftM.get(p); else if (p != null && (now.has(p) || held(p))) p = undefined; way.forEach(i => leftM.set(i, p));
          if (p === k) p = undefined; } // round a loop back to itself: none
        else { for (let n = 0; p != null && now.has(p) && !left.has(p) && n++ < at.size;) way.push(p), p = above(p);
          if (left.has(p)) p = left.get(p); else if (now.has(p)) p = undefined; way.forEach(i => left.set(i, p)); }
        if (p != null) o.x.parent = p; else delete o.x.parent; }
      const ls = new Map(); for (const [k, o] of at) if (now.has(k) && !(o.owner && now.has(o.owner.id))) (ls.get(o.list) || ls.set(o.list, new Set()).get(o.list)).add(o.x);
      ls.forEach((xs, l) => { let j = 0; for (let i = 0; i < l.length; i++) if (!(i in l)) delete l[j++]; else if (!xs.delete(l[i])) l[j++] = l[i]; l.length = j; }); // its first time in its list, as indexOf found
      for (let found = refs(m, now); found.length; found = refs(m, now)) clear(m, found); // a line without an id to a gone line goes in a second round
      follow(m, names0);
      now.forEach(id => gone.add(id));
      return;
    }
    case 'reparent': {
      if (!('parent' in c)) throw new Error('reparent: give `parent`, or null for none');
      const e = need(c.id);
      if (e.kind === 'member') throw new Error(`reparent: "${c.id}" is a member of "${e.owner.id}": move it to another owner with move`);
      if (c.parent == null) { delete e.x.parent; return; }
      const p = need(c.parent);
      if (p.kind === 'edge' || p.kind === 'time') throw new Error(`reparent: "${c.parent}" is not an owner`);
      if (inside(c.id, c.parent)) throw new Error(`reparent: "${c.id}" would end up inside itself`);
      ownParent(at, 'reparent', c.id, c.parent, e.view);
      e.x.parent = c.parent;
      return;
    }
    case 'addView': {
      const v = c.view, list = (m.views ||= []);
      if (!isObj(v) || typeof v.id !== 'string') throw new Error('addView: a view is an object with a string id');
      if (list.some(x => isObj(x) && x.id === v.id)) throw new Error(`addView: view "${v.id}" is there already`);
      list.splice(place(list, c.index), 0, copyOf(v));
      return;
    }
    default: throw new Error(`${jsonText(c.op)} is not a command (set, add, move, hide, delete, reparent, addView)`);
  }
}

/* apply(model, commands): the model after a transaction (a command, or a list of them run in order). See above. */
export function apply(model, commands) {
  if (!isObj(model)) throw new TypeError('apply() needs a model');
  const m = copyOf(model), gone = new Set(); // a host's function stays as it is (audit 24)
  for (const c of Array.isArray(commands) ? commands : [commands]) run(m, c, gone);
  return m;
}
