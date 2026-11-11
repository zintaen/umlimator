/* ---------- commands: apply() and references() (work package 1.6) ----------
   apply(model, commands) runs a transaction, one command or a list run in order, on a copy of the model and returns the
   new model; the one given is never changed. A command that cannot run throws, and none of the transaction is applied.
   Undo is the model before: history() keeps those, so undo and redo give back byte-identical models (risks.md P3:
   snapshots, until a model passes 2 MB).

   The commands, each { op, ... }:
     set       { id | view, path, value }   a field of an element or a view. path: 'label', 'props.visibility', or a
                                             list of keys when a key holds a dot (['present', 'order.total', 'rows']);
                                             value undefined removes it. Through objects only; id, members, parent,
                                             from and to change by their own commands
     add       { element, owner?, index?, view? }  a node (no from/to), a line, or with `owner` a member, at `index`
                                             among the owner's members, else among the view's; `view` shows it there
     move      { id, index, owner? }         a member to another place among its owner's members, or to a new owner
               { id, view, index }           an element or line to another place in a view's order (its nodeIds or edges)
     hide      { id, view }                  out of one view, with all the view says of it: its place, pin, present,
                                             box, tour, the view's lines to it, the story steps on that view; the model
                                             keeps it (risks.md E5). A line that lives only in that view goes with it
     delete    { id }                        out of the model, with its members, what it owns, the lines to them, and
                                             every place that names them (references()). One already gone in the same
                                             transaction is passed over, so a selection deletes in one transaction (E2)
     reparent  { id, parent }                a new owner by `parent`, or none with parent null
   An element is a node, a member, a model line or a view's own line with an id, or a fragment (schema version 2's id
   space). What a type's own properties name (props.replyTo, a timeline) is the type's to keep, from its stage. */

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x), arr = x => (Array.isArray(x) ? x : []);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']); // never a key a command writes (risks.md M3)
const isLine = x => isObj(x) && (x.from != null || x.to != null);

/* Every element by id: { x, list, kind, owner, view } (owner: the element whose member it is; view: the view a line or
   fragment of its own lives in) */
function index(m) {
  const at = new Map();
  const put = (x, list, kind, owner, view) => { if (!isObj(x) || typeof x.id !== 'string') return;
    if (!at.has(x.id)) at.set(x.id, { x, list, kind, owner, view }); arr(x.members).forEach(y => put(y, x.members, 'member', x, view)); };
  arr(m.nodes).forEach(n => put(n, m.nodes, 'node'));
  arr(m.edges).forEach(e => put(e, m.edges, 'edge'));
  arr(m.views).forEach(v => { if (!isObj(v)) return; arr(v.nodes).forEach(n => put(n, v.nodes, 'node', undefined, v)); // a card of one view only
    arr(v.edges).forEach(e => put(e, v.edges, 'edge', undefined, v)); arr(v.fragments).forEach(f => put(f, v.fragments, 'fragment', undefined, v));
    ['changes', 'constraints'].forEach(k => arr(isObj(v.timeline) && v.timeline[k]).forEach(c => put(c, v.timeline[k], 'time', undefined, v))); });
  return at;
}

/* Where a model names any of `ids` (a Set): [{ path, kind }], path a list of keys from the model down. Kinds: end, parent,
   part, view, pin, present, override, subject, story, lens, rule. Neither the element itself nor its members are listed.
   only(viewIndex): look in those views and their story steps only (hide), else in all of the model. */
function refs(m, ids, only) {
  const out = [], say = (path, kind) => out.push({ path, kind }), has = id => typeof id === 'string' && ids.has(id);
  const element = (x, at) => { if (!isObj(x)) return;
    if (has(x.parent)) say([...at, 'parent'], 'parent');
    if (isLine(x)) ['from', 'to'].forEach(k => { if (has(x[k])) say([...at, k], 'end');
      if (has((((x.props || {}).ends || {})[k] || {}).part)) say([...at, 'props', 'ends', k, 'part'], 'part'); });
    arr(x.members).forEach((y, j) => element(y, [...at, 'members', j])); };
  if (!only) { arr(m.nodes).forEach((n, i) => element(n, ['nodes', i])); arr(m.edges).forEach((e, i) => element(e, ['edges', i])); }
  const vids = new Set();
  arr(m.views).forEach((v, i) => { if (!isObj(v) || (only && !only(i))) return; const at = ['views', i]; vids.add(v.id);
    ['nodeIds', 'tour', 'stepIds'].forEach(k => arr(v[k]).forEach((id, j) => { if (has(id)) say([...at, k, j], 'view'); }));
    arr(v.edges).forEach((e, j) => { if (has(e)) say([...at, 'edges', j], 'view'); else element(e, [...at, 'edges', j]); });
    arr(v.fragments).forEach((f, j) => element(f, [...at, 'fragments', j]));
    [['layout', 'pin'], ['present', 'present'], ['nodeOverrides', 'override']].forEach(([k, kind]) => Object.keys(isObj(v[k]) ? v[k] : {}).forEach(id => { if (has(id)) say([...at, k, id], kind); }));
    if (has(v.subject)) say([...at, 'subject'], 'subject');
    if (!only) ['parent', 'node'].forEach(k => { if (has(v[k])) say([...at, k], 'parent'); }); // a view opened from a card
    ['containers', 'lanes'].forEach(k => arr(v[k]).forEach((b, j) => arr(isObj(b) && b.nodeIds).forEach((id, n) => { if (has(id)) say([...at, k, j, 'nodeIds', n], 'view'); })));
    arr(v.intake).forEach((x, j) => { if (isObj(x) && has(x.to)) say([...at, 'intake', j], 'view'); }); });
  arr(m.stories).forEach((s, i) => arr(isObj(s) && s.steps).forEach((st, j) => { if (!isObj(st) || (only && !vids.has(st.view))) return; const at = ['stories', i, 'steps', j];
    if (has(st.select)) say([...at, 'select'], 'story');
    ['highlight', 'tour'].forEach(k => arr(st[k]).forEach((id, n) => { if (has(id)) say([...at, k, n], 'story'); }));
    if (isObj(st.camera) && has(st.camera.card)) say([...at, 'camera'], 'story'); }));
  if (only) return out;
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
  return refs(isObj(model) ? model : {}, new Set([id]));
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

function checkNew(x, at) { // an element to add: an object with a new id that is not positional, and its members alike
  const seen = new Set(), walk = (y, what) => {
    if (!isObj(y) || typeof y.id !== 'string' || !y.id) throw new Error(`add: ${what} needs an id`);
    if (y.id.includes('->')) throw new Error(`add: id "${y.id}" contains "->"`);
    if (at.has(y.id) || seen.has(y.id)) throw new Error(`add: id "${y.id}" is used already`);
    seen.add(y.id); if (y.members != null && !Array.isArray(y.members)) throw new Error(`add: members of "${y.id}" is not a list`);
    arr(y.members).forEach((z, j) => walk(z, `member ${j} of "${y.id}"`)); };
  walk(x, 'the element');
}

function run(m, c, gone) {
  if (!isObj(c)) throw new TypeError('a command is an object with an op');
  const at = index(m), need = id => { const e = at.get(id); if (!e) throw new Error(`${c.op}: ${JSON.stringify(id)} is not an element`); return e; };
  const viewOf = id => { const v = arr(m.views).find(x => isObj(x) && x.id === id); if (!v) throw new Error(`${c.op}: ${JSON.stringify(id)} is not a view`); return v; };
  const place = (list, i) => { if (i == null) return list.length; if (!Number.isInteger(i)) throw new Error(`${c.op}: index ${JSON.stringify(i)} is not a whole number`); return Math.max(0, Math.min(list.length, i)); };
  switch (c.op) {
    case 'set': {
      if (c.id != null && c.view != null) throw new Error('set: an element (id) or a view, not both');
      const keys = typeof c.path === 'string' ? c.path.split('.') : Array.isArray(c.path) && c.path.every(k => typeof k === 'string') ? c.path : null;
      if (!keys || !keys.length || keys.some(k => k === '' || UNSAFE.has(k))) throw new Error(`set: ${JSON.stringify(c.path)} is not a path of keys`);
      if (c.view == null && ['id', 'members', 'parent', 'from', 'to'].includes(keys[0])) throw new Error(`set: ${keys[0]} changes by its own command (add, move, delete, reparent), not set`);
      if (c.view != null && keys[0] === 'id') throw new Error('set: a view keeps its id');
      let o = c.view != null ? viewOf(c.view) : need(c.id).x;
      for (const k of keys.slice(0, -1)) {
        if (o[k] === undefined) { if (c.value === undefined) return; o[k] = {}; }
        else if (!isObj(o[k])) throw new Error(`set: ${keys.join('.')} goes through ${k}, which is not an object`);
        o = o[k];
      }
      const last = keys[keys.length - 1];
      if (c.value === undefined) delete o[last]; else o[last] = structuredClone(c.value);
      return;
    }
    case 'add': {
      if ('to' in c) throw new Error('add: the owner of a member is `owner`');
      checkNew(c.element, at);
      const x = structuredClone(c.element), owner = c.owner != null ? need(c.owner) : null;
      if (owner && owner.kind !== 'node' && owner.kind !== 'member' && owner.kind !== 'fragment') throw new Error(`add: "${c.owner}" holds no members`);
      const v = c.view != null ? viewOf(c.view) : null, list = owner ? (owner.x.members ||= []) : isLine(x) ? (m.edges ||= []) : (m.nodes ||= []);
      list.splice(owner ? place(list, c.index) : list.length, 0, x);
      if (v && !owner) { const shown = isLine(x) ? (Array.isArray(v.edges) ? v.edges : null) : (v.nodeIds ||= []); // a view that lists no lines shows every line between its cards
        if (shown) shown.splice(place(shown, c.index), 0, x.id); }
      return;
    }
    case 'move': {
      const e = need(c.id);
      if (c.view != null) { const v = viewOf(c.view), list = e.kind === 'edge' ? arr(v.edges) : arr(v.nodeIds), i = list.findIndex(y => y === c.id || (isObj(y) && y.id === c.id));
        if (i < 0) throw new Error(`move: "${c.id}" is not in view "${c.view}"`);
        const [y] = list.splice(i, 1); list.splice(place(list, c.index), 0, y); return; }
      if (e.kind !== 'member') throw new Error(`move: "${c.id}" is not a member; with view, it moves in a view's order`);
      const to = c.owner != null ? need(c.owner) : { x: e.owner, kind: 'node' };
      if (to.kind !== 'node' && to.kind !== 'member' && to.kind !== 'fragment') throw new Error(`move: "${c.owner}" holds no members`);
      for (let o = to.x; o; o = (at.get(o.id) || {}).owner) if (o.id === c.id) throw new Error(`move: "${c.id}" would end up inside itself`);
      e.list.splice(e.list.indexOf(e.x), 1); const list = (to.x.members ||= []); list.splice(place(list, c.index), 0, e.x);
      return;
    }
    case 'hide': {
      const v = viewOf(c.view), vi = m.views.indexOf(v), e = need(c.id);
      if (e.kind === 'member') throw new Error(`hide: "${c.id}" is a member, shown with its owner: collapse its compartment with set present, or delete it`);
      if (e.view) throw new Error(`hide: "${c.id}" lives only in view "${e.view.id}": delete it`);
      if (e.kind === 'edge' && !Array.isArray(v.edges)) throw new Error(`hide: view "${c.view}" shows every line between its cards; hide a card, or list its lines`);
      const ids = new Set(), own = x => { ids.add(x.id); arr(x.members).forEach(y => isObj(y) && typeof y.id === 'string' && own(y)); }; own(e.x);
      const ends = l => isObj(l) && (ids.has(l.from) || ids.has(l.to)); // the view's lines to it, listed or its own, leave the view with it
      if (Array.isArray(v.edges)) v.edges = v.edges.filter(y => !(y === c.id || ends(typeof y === 'string' ? (at.get(y) || {}).x : y)));
      clear(m, refs(m, ids, i => i === vi).filter(r => r.kind !== 'end' && r.kind !== 'parent' && r.kind !== 'part'));
      return;
    }
    case 'delete': {
      if (!at.has(c.id) && gone.has(c.id)) return; // gone with an earlier command of this transaction
      need(c.id); const now = new Set();
      const take = id => { const r = at.get(id); if (!r || now.has(id)) return; now.add(id);
        arr(r.x.members).forEach(y => isObj(y) && take(y.id));
        for (const [k, o] of at) if ((o.kind === 'node' || o.kind === 'member') && o.x.parent === id) take(k); }; // what it owns goes with it
      take(c.id);
      // lines to what is gone go too, and lines to those lines; a line whose parent goes (a message in a deleted operand)
      // stays, outside it
      for (let more = true; more;) { more = false; for (const [k, o] of at) if (!now.has(k) && o.kind === 'edge' && (now.has(o.x.from) || now.has(o.x.to))) { now.add(k); more = true; } }
      for (const [k, o] of at) if (now.has(k) && !(o.owner && now.has(o.owner.id))) { const i = o.list.indexOf(o.x); if (i >= 0) o.list.splice(i, 1); }
      for (let found = refs(m, now); found.length; found = refs(m, now)) clear(m, found); // a line without an id to a gone line goes in a second round
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
      const up = id => { const r = at.get(id); return r ? r.x.parent ?? (r.owner && r.owner.id) : undefined; }; // its owner: a parent, or the element it is a member of
      for (let o = c.parent, seen = new Set(); o != null && !seen.has(o); seen.add(o), o = up(o)) if (o === c.id) throw new Error(`reparent: "${c.id}" would end up inside itself`);
      e.x.parent = c.parent;
      return;
    }
    default: throw new Error(`${JSON.stringify(c.op)} is not a command (set, add, move, hide, delete, reparent)`);
  }
}

/* apply(model, commands): the model after a transaction (a command, or a list of them run in order). See above. */
export function apply(model, commands) {
  if (!isObj(model)) throw new TypeError('apply() needs a model');
  const m = structuredClone(model), gone = new Set();
  for (const c of Array.isArray(commands) ? commands : [commands]) run(m, c, gone);
  return m;
}
